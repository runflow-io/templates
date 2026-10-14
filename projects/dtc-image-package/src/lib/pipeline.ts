// Runflow brand-pack pipeline — selection-driven.
//
// User picks operations + target platforms. Pipeline only runs what's needed:
//   1. Upload (always)
//   2. Vision: gpt-4o reads the image, returns category + cleanup prompt + scene prompts
//      (style-matched if reference provided)
//   3. Cleanup: conditional object-removal/prompt (runs if remove_object selected)
//   4. Cutout: product-isolation (runs if isolate / background_replace / lifestyle selected)
//   5. Scenes (parallel fan-out): white studio + 3 lifestyle scenes (each toggled by selection)
//   6. Ratios (parallel fan-out): smart-resize each scene to each unique platform aspect ratio

import { chat as openaiChat } from "./openai";
import {
  downloadBlob,
  firstUrl,
  runSolution,
  uploadAsset,
  RunflowError,
} from "./runflow";
import type { Operation, Platform, AspectRatio } from "./options";
import { uniqueRatios } from "./options";

export type StepKey =
  | "upload"
  | "vision"
  | "cleanup"
  | "cutout"
  | "scenes"
  | "ratios";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed";

export type Analysis = {
  product: string;
  category: string;
  cleanup_prompt: string;
  /** Dominant palette + lighting of the source photo — used to keep AI-picked scenes tonally consistent. */
  source_palette?: string;
  reference_style?: {
    surface?: string;
    lighting?: string;
    palette?: string;
    mood?: string;
    composition?: string;
    props?: string;
  };
  lifestyle_scenes: string[];
};

export type PipelineUpdate =
  | { type: "step"; key: StepKey; status: StepStatus; message?: string }
  | { type: "analysis"; analysis: Analysis }
  | { type: "asset"; key: string; label: string; description?: string; blob: Blob; filename: string }
  | { type: "workflow"; slug: string };

export type ProgressFn = (u: PipelineUpdate) => void;

export type Keys = { runflow: string; openai: string };

const VISION_SYSTEM =
  "You analyze supplier product photos (AliExpress / 1688 / Alibaba) so a downstream " +
  "image-edit pipeline can rebrand them for a Shopify or Amazon store. When a reference " +
  "style image is provided, you also extract its visual style. Output STRICT JSON only.";

const VISION_USER_BASE =
  "Look at this supplier product photo. Identify the product and produce:\n" +
  "  - product (3-6 word description)\n" +
  "  - category (kitchen/beauty/fitness/fashion/home/tech/pets/kids/outdoor/accessories/other)\n" +
  "  - cleanup_prompt (≤7-word imperative for object-removal, or 'none')\n" +
  "  - source_palette (3-5 words describing the source photo's dominant palette + lighting, e.g. 'warm orange backdrop, soft daylight')\n" +
  "  - lifestyle_scenes (array of 3 short scene phrases)\n\n" +
  "STRICT SCENE RULES:\n" +
  "1. Product is always hero, in NATURAL use/display position.\n" +
  "2. Must REST on a stable horizontal surface that physically supports it.\n" +
  "3. NEVER inside a bag/container/drawer/box. Never mid-air. Never held by a hand.\n" +
  "4. Avoid people unless category truly requires (apparel/beauty).\n" +
  "5. Each scene is ONE short photographic phrase.\n" +
  "6. PALETTE CONTINUITY (critical): every scene must stay tonally close to source_palette — same hue family, similar warmth/coolness, comparable lighting mood. Vary the SURFACE and PROPS, not the color cast. NEVER introduce a vivid contrasting background color (e.g. orange source → no yellow/blue/green/pink scenes).\n" +
  "7. Diversity comes from setting (kitchen counter / wooden desk / linen tablecloth / marble shelf), props, and time of day — not from inventing a new color scheme.\n\n" +
  'Return JSON: { "product": "...", "category": "...", "cleanup_prompt": "...", "source_palette": "...", "lifestyle_scenes": ["...","...","..."] }';

const VISION_USER_WITH_REF =
  "You are analyzing TWO images:\n" +
  "  IMAGE 1 = product to rebrand (supplier photo)\n" +
  "  IMAGE 2 = reference ad creative whose VISUAL STYLE the user wants to match\n\n" +
  "Identify the product in IMAGE 1, extract IMAGE 2's style, and produce 3 lifestyle " +
  "scene prompts that apply IMAGE 2's style (lighting, palette, surface, mood, composition, props) " +
  "to the product. Follow the strict scene rules: product always on a stable surface, no enclosures, " +
  "no mid-air, no hands. Do NOT copy IMAGE 2's actual subject — only its visual treatment.\n\n" +
  'Return JSON: { "product":"...", "category":"...", "cleanup_prompt":"...", "reference_style":{"surface":"...","lighting":"...","palette":"...","mood":"...","composition":"...","props":"..."}, "lifestyle_scenes":["...","...","..."] }';

const WHITE_STUDIO_PROMPT =
  "Place this exact product on a pure white seamless backdrop, clean studio product photography. " +
  "Soft diffuse lighting, subtle natural contact shadow. Centered, three-quarter angle, full visible. " +
  "Preserve every edge, material, color and detail. Amazon main-image style: white background only, no props, no text.";

const PLACEMENT_RULES =
  "\n\nPHYSICAL PLACEMENT RULES — non-negotiable:\n" +
  "- Product MUST sit upright on the horizontal surface described, real-world orientation, photoreal scale + contact shadow.\n" +
  "- Product is the clear hero, centered or slightly off-center, fully visible, not cropped.\n" +
  "- NOT inside bag/container/drawer/box, NOT mid-air, NOT held by a hand.\n" +
  "- Preserve every edge, material, color, texture, detail exactly from the source cutout.\n" +
  "- Photographic style. No text, graphics, or logo overlays.";

async function analyzeProduct(
  sourceUrl: string,
  referenceUrl: string | null,
  keys: Keys
): Promise<Analysis> {
  const content: Array<Record<string, unknown>> = [];
  if (referenceUrl) {
    content.push({ type: "text", text: VISION_USER_WITH_REF });
    content.push({ type: "text", text: "IMAGE 1 — product to rebrand:" });
    content.push({ type: "image_url", image_url: { url: sourceUrl } });
    content.push({ type: "text", text: "IMAGE 2 — reference style:" });
    content.push({ type: "image_url", image_url: { url: referenceUrl } });
  } else {
    content.push({ type: "text", text: VISION_USER_BASE });
    content.push({ type: "image_url", image_url: { url: sourceUrl } });
  }

  const resp = await openaiChat(
    {
      model: "gpt-4o",
      messages: [
        { role: "system", content: VISION_SYSTEM },
        { role: "user", content },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    },
    keys.openai
  );
  return JSON.parse(resp.choices[0].message.content) as Analysis;
}

async function removeOriginalProduct(sourceUrl: string, prompt: string, apiKey: string): Promise<string> {
  const short = prompt.split(/\s+/).slice(0, 7).join(" ");
  const run = await runSolution("runflow/object-removal/prompt", { image_url: sourceUrl, prompt: short }, apiKey);
  const url = firstUrl(run);
  if (!url) throw new RunflowError("object-removal returned no url");
  return url;
}

async function isolateProduct(sourceUrl: string, apiKey: string): Promise<string> {
  const run = await runSolution("runflow/product-isolation", {
    image_url: sourceUrl,
    aspect_ratio: "1:1",
    resolution: "1K",
    prompt: "Isolate the main product. Remove background entirely.",
  }, apiKey);
  const url = firstUrl(run);
  if (!url) throw new RunflowError("product-isolation returned no url");
  return url;
}

async function genWhiteStudio(cutoutUrl: string, apiKey: string): Promise<string> {
  const run = await runSolution("openai/gpt-image-2/edit", {
    prompt: WHITE_STUDIO_PROMPT,
    image_urls: [cutoutUrl],
    image_size: "square_hd",
    quality: "high",
    output_format: "jpeg",
  }, apiKey, { timeoutMs: 420_000 });
  const url = firstUrl(run);
  if (!url) throw new RunflowError("white studio returned no url");
  return url;
}

async function genLifestyle(
  cutoutUrl: string,
  scene: string,
  referenceUrl: string | null,
  sourcePalette: string | null,
  apiKey: string
): Promise<string> {
  const imageUrls = [cutoutUrl];
  let styleClause = "";
  if (referenceUrl) {
    imageUrls.push(referenceUrl);
    styleClause =
      "\n\nSTYLE MATCHING — IMAGE 2 is a reference ad creative whose VISUAL STYLE you must match:\n" +
      "- IMAGE 1 is the product cutout — preserve its EXACT identity, color, material, edges.\n" +
      "- IMAGE 2 is the style reference — match its lighting, palette, surface texture, mood, treatment.\n" +
      "- DO NOT copy IMAGE 2's product, props, or subject one-for-one. Borrow only the visual treatment.";
  } else if (sourcePalette) {
    styleClause =
      `\n\nPALETTE CONTINUITY — stay tonally consistent with the source photo (${sourcePalette}). ` +
      "Use the same hue family, warmth, and lighting mood. Vary the surface and props, NOT the color cast. " +
      "Do not introduce a vivid contrasting background color.";
  }
  const prompt =
    `Place this exact product in the following scene: ${scene}.` + PLACEMENT_RULES + styleClause;
  const run = await runSolution("openai/gpt-image-2/edit", {
    prompt,
    image_urls: imageUrls,
    image_size: "square_hd",
    quality: "high",
    output_format: "jpeg",
  }, apiKey, { timeoutMs: 420_000 });
  const url = firstUrl(run);
  if (!url) throw new RunflowError("lifestyle returned no url");
  return url;
}

// Pad a square white-studio asset into a target aspect ratio with pure
// white pixels. We do this client-side because runflow/smart-resize uses
// AI outpainting — perfect for lifestyle scenes (extends the scene) but
// it invents a fake studio floor when handed the white-backdrop shot.
async function padToRatioWhite(url: string, ratio: AspectRatio): Promise<Blob> {
  const [wR, hR] = ratio.split(":").map(Number);
  const target = wR / hR;
  // Fetch through our blob helper first so the canvas isn't tainted by
  // a cross-origin image load (the runflow CDN doesn't set CORS headers
  // suitable for direct <img crossOrigin> use).
  const sourceBlob = await downloadBlob(url);
  const blobUrl = URL.createObjectURL(sourceBlob);
  let img: HTMLImageElement;
  try {
    img = await loadImage(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  let tw = srcW;
  let th = srcH;
  if (target >= srcW / srcH) {
    // wider: keep source height, grow width
    th = srcH;
    tw = Math.round(srcH * target);
  } else {
    // taller: keep source width, grow height
    tw = srcW;
    th = Math.round(srcW / target);
  }
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new RunflowError("canvas 2d unavailable");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, tw, th);
  const dx = Math.round((tw - srcW) / 2);
  const dy = Math.round((th - srcH) / 2);
  ctx.drawImage(img, dx, dy);
  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new RunflowError("toBlob null"))),
      "image/jpeg",
      0.92
    )
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new RunflowError(`image load failed: ${src}`));
    img.src = src;
  });
}

async function smartResize(url: string, ratio: AspectRatio, apiKey: string): Promise<string> {
  const run = await runSolution("runflow/smart-resize", {
    image_url: url,
    aspect_ratio: ratio,
    resolution: "1K",
  }, apiKey);
  const u = firstUrl(run);
  if (!u) throw new RunflowError(`smart-resize ${ratio} returned no url`);
  return u;
}

// ---------- public orchestrator ----------

export type PipelineInput = {
  source: File;
  reference?: File | null;
  operations: Operation[];
  platforms: Platform[];
  keys: Keys;
};

export type AssetFile = {
  key: string;
  label: string;          // Short display name (e.g. "Lifestyle A")
  description?: string;   // Longer context (e.g. the scene prompt) — shown via info icon hover
  filename: string;
  blob: Blob;
};

export async function runPipeline(input: PipelineInput, onProgress: ProgressFn): Promise<{
  analysis: Analysis;
  assets: AssetFile[];
  workflows: string[];
}> {
  const { source, reference, operations, platforms, keys } = input;
  const ops = new Set(operations);
  const assets: AssetFile[] = [];
  const workflowsUsed = new Set<string>();

  const emit = (key: StepKey, status: StepStatus, message?: string) =>
    onProgress({ type: "step", key, status, message });

  const pushAsset = (a: AssetFile) => {
    assets.push(a);
    onProgress({
      type: "asset",
      key: a.key,
      label: a.label,
      description: a.description,
      blob: a.blob,
      filename: a.filename,
    });
  };

  const trackWorkflow = (slug: string) => {
    if (workflowsUsed.has(slug)) return;
    workflowsUsed.add(slug);
    onProgress({ type: "workflow", slug });
  };

  // 1 — upload
  emit("upload", "running");
  const sourceUrl = await uploadAsset(source, source.name || "source.jpg", keys.runflow);
  let referenceUrl: string | null = null;
  if (reference) {
    referenceUrl = await uploadAsset(reference, reference.name || "reference.jpg", keys.runflow);
  }
  emit("upload", "done");

  // Resize-only mode: the user just wants their image fanned out to every
  // selected platform ratio. Skip vision / cleanup / cutout / scenes; jump
  // straight to the ratios fan-out with the source acting as the single
  // "scene".
  const resizeOnly = ops.has("resize_only") && ops.size === 1;
  if (resizeOnly) {
    emit("vision", "skipped");
    emit("cleanup", "skipped");
    emit("cutout", "skipped");
    emit("scenes", "skipped");

    // Save the original as the first asset so it shows up in the pack.
    const originalBlob = await downloadBlob(sourceUrl);
    pushAsset({
      key: "ad_original",
      label: "Original",
      description: "Your input image, untouched. Resized variants follow below.",
      filename: "00_original.jpg",
      blob: originalBlob,
    });

    const ratios: AspectRatio[] = uniqueRatios(platforms).filter((r) => r !== "1:1");
    if (ratios.length > 0) {
      emit("ratios", "running");
      trackWorkflow("runflow/smart-resize");
      const tasks = ratios.map((ratio, i) => {
        const ratioSlug = ratio.replace(":", "x");
        const filename = `${String(10 + i).padStart(2, "0")}_ad_${ratioSlug}.jpg`;
        return smartResize(sourceUrl, ratio, keys.runflow).then(async (url) => ({
          key: `ad_${ratioSlug}`,
          label: `Resized · ${ratio}`,
          description: `Smart-resized to ${ratio}`,
          filename,
          blob: await downloadBlob(url),
        }));
      });
      const results = await Promise.all(tasks);
      for (const r of results) pushAsset(r);
      emit("ratios", "done");
    } else {
      emit("ratios", "skipped");
    }

    // Build a minimal analysis so save-to-history doesn't choke on null.
    const analysis: Analysis = {
      product: source.name?.replace(/\.[^.]+$/, "") || "Ad creative",
      category: "ad",
      cleanup_prompt: "none",
      lifestyle_scenes: [],
    };
    onProgress({ type: "analysis", analysis });
    return { analysis, assets, workflows: Array.from(workflowsUsed) };
  }

  // 2 — vision
  emit("vision", "running");
  trackWorkflow("openai/gpt-4o");
  const analysis = await analyzeProduct(sourceUrl, referenceUrl, keys);
  onProgress({ type: "analysis", analysis });
  emit("vision", "done");

  // 3 — cleanup (only if user picked remove_object)
  let cleanedUrl = sourceUrl;
  const wantsCleanup = ops.has("remove_object");
  if (wantsCleanup) {
    const cp = (analysis.cleanup_prompt || "").trim().toLowerCase();
    if (cp && cp !== "none" && cp !== "n/a") {
      emit("cleanup", "running", analysis.cleanup_prompt);
      trackWorkflow("runflow/object-removal/prompt");
      cleanedUrl = await removeOriginalProduct(sourceUrl, analysis.cleanup_prompt, keys.runflow);
      const cleanedBlob = await downloadBlob(cleanedUrl);
      pushAsset({
        key: "cleaned",
        label: "Cleaned source",
        description: `Stripped via prompt: "${analysis.cleanup_prompt}"`,
        filename: "00_cleaned.jpg",
        blob: cleanedBlob,
      });
      emit("cleanup", "done");
    } else {
      emit("cleanup", "skipped");
    }
  } else {
    emit("cleanup", "skipped");
  }

  // 4 — cutout (required for isolate, background_replace, lifestyle_scenes)
  const needsCutout = ops.has("isolate") || ops.has("background_replace") || ops.has("lifestyle_scenes");
  let cutoutUrl: string | null = null;
  if (needsCutout) {
    emit("cutout", "running");
    trackWorkflow("runflow/product-isolation");
    cutoutUrl = await isolateProduct(cleanedUrl, keys.runflow);
    if (ops.has("isolate")) {
      const cutoutBlob = await downloadBlob(cutoutUrl);
      pushAsset({
        key: "cutout",
        label: "RGBA cutout",
        description: "Background fully removed — transparent PNG. Drop into PDPs, ad creatives, or anywhere a transparent product is needed.",
        filename: "01_cutout.png",
        blob: cutoutBlob,
      });
    }
    emit("cutout", "done");
  } else {
    emit("cutout", "skipped");
  }

  // 5 — scenes (parallel fan-out of white studio + 3 lifestyle)
  // Track these for the ratios fan-out step.
  type SceneOutput = { key: string; url: string; label: string; description?: string };
  const sceneOutputs: SceneOutput[] = [];

  const wantsWhite = ops.has("background_replace");
  const wantsLifestyle = ops.has("lifestyle_scenes");

  if ((wantsWhite || wantsLifestyle) && cutoutUrl) {
    emit("scenes", "running");
    trackWorkflow("openai/gpt-image-2/edit");
    const tasks: Promise<SceneOutput>[] = [];

    if (wantsWhite) {
      tasks.push(
        genWhiteStudio(cutoutUrl, keys.runflow).then((url) => ({
          key: "white",
          url,
          label: "White studio",
          description: "Clean product shot on a pure-white seamless backdrop, subtle contact shadow, three-quarter angle. The 1:1 version is Amazon main-image compliant.",
        }))
      );
    }

    let scenes: string[] = [];
    if (wantsLifestyle) {
      scenes = [...(analysis.lifestyle_scenes || [])].slice(0, 3);
      while (scenes.length < 3) scenes.push("on a neutral wood surface with soft side light");
      const tags = ["a", "b", "c"];
      scenes.forEach((scene, i) => {
        tasks.push(
          genLifestyle(cutoutUrl!, scene, referenceUrl, analysis.source_palette ?? null, keys.runflow).then((url) => ({
            key: `life_${tags[i]}`,
            url,
            // Keep label short so the UI doesn't get noisy. Full prompt
            // lives in description and shows on info-icon hover.
            label: `Lifestyle ${tags[i].toUpperCase()}`,
            description: scene,
          }))
        );
      });
    }

    const results = await Promise.all(tasks);
    sceneOutputs.push(...results);

    // Download and emit each base scene asset
    let idx = 2; // start filename numbering after cutout
    for (const r of results) {
      const blob = await downloadBlob(r.url);
      const filename = `${String(idx).padStart(2, "0")}_${r.key}.jpg`;
      pushAsset({
        key: r.key,
        label: r.label,
        description: r.description,
        filename,
        blob,
      });
      idx++;
    }
    emit("scenes", "done");
  } else {
    emit("scenes", "skipped");
  }

  // 6 — ratios. Lifestyle / cutout scenes go through runflow/smart-resize
  // (AI outpainting extends the scene naturally). The white-studio asset
  // uses a client-side white-pad instead, because smart-resize hallucinates
  // a fake studio floor when asked to extend pure white.
  const ratios: AspectRatio[] = uniqueRatios(platforms);
  if (ratios.length > 0 && sceneOutputs.length > 0) {
    emit("ratios", "running");
    const usesSmartResize = sceneOutputs.some((s) => s.key !== "white");
    if (usesSmartResize) trackWorkflow("runflow/smart-resize");
    const resizeTasks: Array<Promise<AssetFile>> = [];
    let slot = 10;
    for (const scene of sceneOutputs) {
      for (const ratio of ratios) {
        // Skip 1:1 since base scenes are already square_hd
        if (ratio === "1:1") continue;
        const ratioSlug = ratio.replace(":", "x");
        const filename = `${String(slot).padStart(2, "0")}_${scene.key}_${ratioSlug}.jpg`;
        const key = `${scene.key}_${ratioSlug}`;
        const label = `${scene.label} · ${ratio}`;
        const description = scene.description;
        slot++;
        if (scene.key === "white") {
          resizeTasks.push(
            padToRatioWhite(scene.url, ratio).then((blob) => ({
              key, label, description, filename, blob,
            }))
          );
        } else {
          resizeTasks.push(
            smartResize(scene.url, ratio, keys.runflow).then(async (url) => {
              const blob = await downloadBlob(url);
              return { key, label, description, filename, blob };
            })
          );
        }
      }
    }
    if (resizeTasks.length > 0) {
      const ratioResults = await Promise.all(resizeTasks);
      for (const r of ratioResults) pushAsset(r);
    }
    emit("ratios", "done");
  } else {
    emit("ratios", "skipped");
  }

  return { analysis, assets, workflows: Array.from(workflowsUsed) };
}

// ===== EXTEND PIPELINE =====
//
// Adds new operations and/or new platform ratios to an existing pack. Reuses
// what's already there:
//   - existing cutout → skip product-isolation
//   - existing cleaned → skip object-removal
//   - existing analysis → skip vision
//   - existing scenes (white / life_*) → only generate the new ones
//   - existing ratio variants → only fan-out the missing (scene × ratio) pairs
//
// Same pack id → savePack overwrites the record. Caller is responsible for
// passing the merged-asset list into savePack.

export type ExtendInput = {
  /** A frozen snapshot of the pack at the moment the user clicked "Add more". */
  pack: {
    id: string;
    analysis: Analysis;
    source?: { blob: Blob; filename: string };
    assets: { key: string; blob: Blob; filename: string; label: string; description?: string }[];
  };
  /** Operations to add. Already-present operations are silently skipped. */
  addOperations: Operation[];
  /** Platforms to add. Already-present ratios are silently skipped. */
  addPlatforms: Platform[];
  /** Reference style image — required if lifestyle_scenes is among addOperations and the pack has none. */
  reference: File | null;
  keys: Keys;
};

function existingRatios(packAssets: { key: string }[]): Set<AspectRatio> {
  const set = new Set<AspectRatio>();
  for (const a of packAssets) {
    const m = a.key.match(/_(\d+x\d+)$/);
    if (m) set.add(m[1].replace("x", ":") as AspectRatio);
  }
  set.add("1:1");
  return set;
}

export async function runExtendPipeline(
  input: ExtendInput,
  onProgress: ProgressFn
): Promise<{ assets: AssetFile[]; workflows: string[] }> {
  const { pack, addOperations, addPlatforms, reference, keys } = input;
  const ops = new Set(addOperations);
  const workflowsUsed = new Set<string>();
  const newAssets: AssetFile[] = [];

  const emit = (key: StepKey, status: StepStatus, message?: string) =>
    onProgress({ type: "step", key, status, message });

  const pushAsset = (a: AssetFile) => {
    newAssets.push(a);
    onProgress({
      type: "asset",
      key: a.key,
      label: a.label,
      description: a.description,
      blob: a.blob,
      filename: a.filename,
    });
  };

  const trackWorkflow = (slug: string) => {
    if (workflowsUsed.has(slug)) return;
    workflowsUsed.add(slug);
    onProgress({ type: "workflow", slug });
  };

  // Index existing assets so we can detect what already exists.
  const have = new Map<string, { blob: Blob; filename: string }>();
  for (const a of pack.assets) have.set(a.key, { blob: a.blob, filename: a.filename });
  if (!pack.source) {
    throw new RunflowError("Pack has no stored source image — cannot extend (older pack).");
  }

  // ---- Re-upload source + existing cutout/cleaned so we have URLs ----
  emit("upload", "running");
  const sourceFile = new File([pack.source.blob], pack.source.filename || "supplier.jpg");
  const sourceUrl = await uploadAsset(sourceFile, sourceFile.name, keys.runflow);
  let referenceUrl: string | null = null;
  if (reference) {
    referenceUrl = await uploadAsset(reference, reference.name || "reference.jpg", keys.runflow);
  }
  emit("upload", "done");

  // Vision is preserved from the original pack — no re-analyze needed.
  emit("vision", "skipped");
  const analysis = pack.analysis;
  onProgress({ type: "analysis", analysis });

  // Cleanup: only re-upload if the asset exists; never re-generate here.
  let cleanedUrl: string = sourceUrl;
  emit("cleanup", "skipped");
  if (have.has("cleaned")) {
    const cleanedAsset = have.get("cleaned")!;
    const cleanedFile = new File([cleanedAsset.blob], cleanedAsset.filename, { type: cleanedAsset.blob.type || "image/jpeg" });
    cleanedUrl = await uploadAsset(cleanedFile, cleanedFile.name, keys.runflow);
  }

  // Cutout: reuse if present, otherwise generate (only if a new op needs it).
  const needsCutout = ops.has("background_replace") || ops.has("lifestyle_scenes");
  let cutoutUrl: string | null = null;
  if (have.has("cutout")) {
    const cutoutAsset = have.get("cutout")!;
    const cutoutFile = new File([cutoutAsset.blob], cutoutAsset.filename, { type: "image/png" });
    cutoutUrl = await uploadAsset(cutoutFile, cutoutFile.name, keys.runflow);
    emit("cutout", "skipped");
  } else if (needsCutout) {
    emit("cutout", "running");
    trackWorkflow("runflow/product-isolation");
    cutoutUrl = await isolateProduct(cleanedUrl, keys.runflow);
    const cutoutBlob = await downloadBlob(cutoutUrl);
    pushAsset({
      key: "cutout",
      label: "RGBA cutout",
      description: "Background fully removed — transparent PNG, drop into PDPs / ads.",
      filename: "01_cutout.png",
      blob: cutoutBlob,
    });
    emit("cutout", "done");
  } else {
    emit("cutout", "skipped");
  }

  // ---- Scenes: only generate the ones not already in the pack ----
  type SceneOutput = { key: string; url: string; label: string; description: string };
  const sceneOutputs: SceneOutput[] = [];

  const wantsWhite = ops.has("background_replace") && !have.has("white");
  const wantsLifestyle = ops.has("lifestyle_scenes") && !have.has("life_a");

  if (wantsWhite || wantsLifestyle) {
    emit("scenes", "running");
    trackWorkflow("openai/gpt-image-2/edit");
    const tasks: Promise<SceneOutput>[] = [];

    if (wantsWhite && cutoutUrl) {
      tasks.push(
        genWhiteStudio(cutoutUrl, keys.runflow).then((url) => ({
          key: "white",
          url,
          label: "White studio",
          description: "Clean product shot on a pure-white seamless backdrop, subtle contact shadow, three-quarter angle. The 1:1 version is Amazon main-image compliant.",
        }))
      );
    }

    if (wantsLifestyle && cutoutUrl) {
      const scenes = [...(analysis.lifestyle_scenes || [])].slice(0, 3);
      while (scenes.length < 3) scenes.push("on a neutral wood surface with soft side light");
      const tags = ["a", "b", "c"];
      scenes.forEach((scene, i) => {
        tasks.push(
          genLifestyle(cutoutUrl!, scene, referenceUrl, analysis.source_palette ?? null, keys.runflow).then((url) => ({
            key: `life_${tags[i]}`,
            url,
            label: `Lifestyle ${tags[i].toUpperCase()}`,
            description: scene,
          }))
        );
      });
    }

    const results = await Promise.all(tasks);
    for (const r of results) {
      sceneOutputs.push(r);
      const blob = await downloadBlob(r.url);
      const slot = r.key === "white" ? 2 : 3 + ("abc".indexOf(r.key.split("_")[1] || "a"));
      const filename = `${String(slot).padStart(2, "0")}_${r.key}.jpg`;
      pushAsset({ key: r.key, label: r.label, description: r.description, filename, blob });
    }
    emit("scenes", "done");
  } else {
    emit("scenes", "skipped");
  }

  // ---- Add back EXISTING scenes that need new ratios fanned out from ----
  // Re-upload them so we get URLs we can pass to smart-resize.
  const allScenes: SceneOutput[] = [...sceneOutputs];
  for (const key of ["white", "life_a", "life_b", "life_c"] as const) {
    if (allScenes.find((s) => s.key === key)) continue; // just produced
    if (!have.has(key)) continue;
    const a = have.get(key)!;
    const file = new File([a.blob], a.filename, { type: "image/jpeg" });
    const url = await uploadAsset(file, file.name, keys.runflow);
    const original = pack.assets.find((x) => x.key === key)!;
    allScenes.push({ key, url, label: original.label, description: original.description || "" });
  }

  // ---- Ratios: fan-out missing (scene × ratio) pairs ----
  const oldRatios = existingRatios(pack.assets);
  const wantedRatios = uniqueRatios([...addPlatforms]);
  // Targets = union of old + newly-requested platforms, minus the ones already fully present.
  const targetRatios: AspectRatio[] = Array.from(new Set([...oldRatios, ...wantedRatios])).filter(
    (r) => r !== "1:1"
  ) as AspectRatio[];

  if (allScenes.length > 0 && targetRatios.length > 0) {
    emit("ratios", "running");
    const usesSmart = allScenes.some((s) => s.key !== "white");
    if (usesSmart) trackWorkflow("runflow/smart-resize");

    const tasks: Promise<AssetFile>[] = [];
    let slot = 20;
    for (const scene of allScenes) {
      for (const ratio of targetRatios) {
        const ratioSlug = ratio.replace(":", "x");
        const key = `${scene.key}_${ratioSlug}`;
        if (have.has(key)) continue; // already in pack
        const filename = `${String(slot).padStart(2, "0")}_${scene.key}_${ratioSlug}.jpg`;
        const label = `${scene.label} · ${ratio}`;
        const description = scene.description;
        slot++;
        if (scene.key === "white") {
          tasks.push(
            padToRatioWhite(scene.url, ratio).then((blob) => ({
              key, label, description, filename, blob,
            }))
          );
        } else {
          tasks.push(
            smartResize(scene.url, ratio, keys.runflow).then(async (url) => ({
              key, label, description, filename, blob: await downloadBlob(url),
            }))
          );
        }
      }
    }
    if (tasks.length === 0) {
      emit("ratios", "skipped");
    } else {
      const results = await Promise.all(tasks);
      for (const r of results) pushAsset(r);
      emit("ratios", "done");
    }
  } else {
    emit("ratios", "skipped");
  }

  return { assets: newAssets, workflows: Array.from(workflowsUsed) };
}
