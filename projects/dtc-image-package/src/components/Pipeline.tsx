import { Check, X, Loader2 } from "lucide-react";
import type { Analysis, StepKey, StepStatus } from "../lib/pipeline";
import type { Operation, Platform } from "../lib/options";
import { uniqueRatios } from "../lib/options";
import type { LightboxItem } from "./Lightbox";

type Steps = Record<StepKey, StepStatus>;

/** Onclick handler receives a canonical, deduped, ordered list of all currently-visible
 *  zoomable images plus the start index. The caller (App.tsx) opens the lightbox. */
export type ZoomFn = (items: LightboxItem[], startIndex: number) => void;

type Props = {
  steps: Steps;
  analysis: Analysis | null;
  assetUrls: Record<string, string>;
  operations: Operation[];
  platforms: Platform[];
  onZoom: ZoomFn;
};

// Canonical pipeline ordering for the lightbox rotation. Any keys not in this list
// are appended in insertion order at the end (covers dynamic ratio keys).
const CANONICAL_KEYS: Array<{ key: string; label: string; filename: string }> = [
  { key: "__source", label: "Supplier image", filename: "source" },
  { key: "cleaned", label: "Cleaned source", filename: "00_cleaned.jpg" },
  { key: "cutout", label: "RGBA cutout", filename: "01_cutout.png" },
  { key: "white", label: "White studio", filename: "02_white_studio.jpg" },
  { key: "life_a", label: "Lifestyle A", filename: "03_lifestyle_a.jpg" },
  { key: "life_b", label: "Lifestyle B", filename: "04_lifestyle_b.jpg" },
  { key: "life_c", label: "Lifestyle C", filename: "05_lifestyle_c.jpg" },
];

function buildPipelineItems(assetUrls: Record<string, string>): LightboxItem[] {
  const items: LightboxItem[] = [];
  const seen = new Set<string>();
  const consumed = new Set<string>();
  for (const c of CANONICAL_KEYS) {
    const src = assetUrls[c.key];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    consumed.add(c.key);
    items.push({ src, label: c.label, filename: c.filename });
  }
  // append any dynamic keys (e.g. life_a_9x16) in insertion order
  for (const k of Object.keys(assetUrls)) {
    if (consumed.has(k)) continue;
    const src = assetUrls[k];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    items.push({ src, label: k.replace(/_/g, " · "), filename: `${k}.jpg` });
  }
  return items;
}

function pipelineZoom(assetUrls: Record<string, string>, clickedSrc: string, onZoom: ZoomFn) {
  const items = buildPipelineItems(assetUrls);
  if (!items.length) return;
  const idx = Math.max(0, items.findIndex((i) => i.src === clickedSrc));
  onZoom(items, idx);
}

function stepMeta(operations: Operation[], platforms: Platform[]) {
  const ops = new Set(operations);
  const resizeOnly = ops.has("resize_only") && ops.size === 1;
  const ratios = uniqueRatios(platforms).filter((r) => r !== "1:1");
  const ratioFoot = ratios.length
    ? `smart-resize → ${ratios.join(", ")}`
    : "Skipped — only 1:1 selected";

  if (resizeOnly) {
    return {
      upload: { num: 1, title: "Upload", foot: "Ad creative uploaded to Runflow assets" },
      vision: { num: 2, title: "Vision", foot: "Skipped — resize-only mode" },
      cleanup: { num: 3, title: "Cleanup", foot: "Skipped — resize-only mode" },
      cutout: { num: 4, title: "Cutout", foot: "Skipped — resize-only mode" },
      scenes: { num: 5, title: "Scenes", foot: "Skipped — resize-only mode" },
      ratios: { num: 6, title: "Ratios", foot: ratioFoot },
    } as Record<StepKey, { num: number; title: string; foot: string }>;
  }

  const sceneParts: string[] = [];
  if (ops.has("background_replace")) sceneParts.push("white studio");
  if (ops.has("lifestyle_scenes")) sceneParts.push("3 lifestyle scenes");
  if (ops.has("remove_model")) sceneParts.push("ghost mannequin");
  const sceneFoot = sceneParts.length
    ? `gpt-image-2/edit · ${sceneParts.join(" + ")}`
    : "Skipped — no scene operations selected";
  return {
    upload: { num: 1, title: "Upload", foot: "Supplier image uploaded to Runflow assets" },
    vision: { num: 2, title: "Vision", foot: "gpt-4o categorizes the product + drafts scene prompts" },
    cleanup: { num: 3, title: "Cleanup", foot: "Strips watermarks, supplier text, prop hands (skipped if clean)" },
    cutout: { num: 4, title: "Cutout", foot: "runflow/product-isolation extracts the product" },
    scenes: { num: 5, title: "Scenes", foot: sceneFoot },
    ratios: { num: 6, title: "Ratios", foot: `smart-resize + white-pad → ${ratios.join(", ") || "—"}` },
  } as Record<StepKey, { num: number; title: string; foot: string }>;
}

const STEP_ORDER: StepKey[] = ["upload", "vision", "cleanup", "cutout", "scenes", "ratios"];

function statusClass(s: StepStatus) {
  if (s === "running") return "border-amber-border shadow-[0_0_0_3px_var(--tw-shadow-color)] shadow-amber-soft";
  if (s === "done") return "border-green/30";
  if (s === "skipped") return "border-line opacity-70";
  if (s === "failed") return "border-red/30 bg-red-soft";
  return "border-line";
}

function statusBadge(s: StepStatus, n: number) {
  if (s === "running") {
    return (
      <span className="w-[22px] h-[22px] rounded-full border border-amber text-amber bg-panel flex items-center justify-center text-[11px] font-mono">
        <Loader2 className="w-3.5 h-3.5 animate-spin-slow" />
      </span>
    );
  }
  if (s === "done") {
    return (
      <span className="w-[22px] h-[22px] rounded-full bg-green border border-green text-white flex items-center justify-center">
        <Check className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="w-[22px] h-[22px] rounded-full bg-red border border-red text-white flex items-center justify-center">
        <X className="w-3 h-3" strokeWidth={3} />
      </span>
    );
  }
  if (s === "skipped") {
    return (
      <span className="w-[22px] h-[22px] rounded-full border border-line text-faint bg-panel flex items-center justify-center text-[11px] font-mono">
        ·
      </span>
    );
  }
  return (
    <span className="w-[22px] h-[22px] rounded-full border border-line text-muted bg-panel flex items-center justify-center text-[11px] font-mono">
      {n}
    </span>
  );
}

export function Pipeline({ steps, analysis, assetUrls, operations, platforms, onZoom }: Props) {
  const META = stepMeta(operations, platforms);
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold mb-3.5">Pipeline</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {STEP_ORDER.map((key) => {
          const s = steps[key];
          const meta = META[key];
          return (
            <div
              key={key}
              className={"bg-panel border rounded-[10px] overflow-hidden flex flex-col transition-all " + statusClass(s)}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line bg-panel-2">
                {statusBadge(s, meta.num)}
                <span className="text-xs font-semibold flex-1">{meta.title}</span>
              </div>
              <div className="relative aspect-square bg-panel-2 flex items-center justify-center overflow-hidden">
                <StepBody stepKey={key} status={s} analysis={analysis} assetUrls={assetUrls} onZoom={onZoom} />
              </div>
              <div className="px-3 py-2.5 border-t border-line text-[11px] text-muted leading-snug">
                {meta.foot}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StepBody({
  stepKey,
  status,
  analysis,
  assetUrls,
  onZoom,
}: {
  stepKey: StepKey;
  status: StepStatus;
  analysis: Analysis | null;
  assetUrls: Record<string, string>;
  onZoom: ZoomFn;
}) {
  const zoom = (src: string) => pipelineZoom(assetUrls, src, onZoom);
  if (stepKey === "upload") {
    const src = assetUrls["__source"];
    if (!src) return <Placeholder text={status === "running" ? "uploading…" : "supplier image"} />;
    return <ZoomImg src={src} onZoom={zoom} />;
  }
  if (stepKey === "vision") {
    if (!analysis) return <Placeholder text={status === "running" ? "analyzing…" : "product analysis"} />;
    return (
      <div className="absolute inset-0 p-3 overflow-y-auto flex flex-col gap-1.5 text-[11px] leading-snug text-ink-2">
        <KV k="Product" v={analysis.product} />
        <KV k="Category" v={analysis.category} />
        <KV k="Cleanup" v={analysis.cleanup_prompt || "none"} mono />
        {analysis.reference_style ? (
          <>
            <div className="border-t border-dashed border-line mt-1 pt-1.5 text-amber font-bold uppercase text-[9px] tracking-wider font-mono">
              Reference style
            </div>
            {Object.entries(analysis.reference_style)
              .filter(([, v]) => !!v)
              .map(([k, v]) => (
                <KV key={k} k={k} v={String(v)} sub />
              ))}
          </>
        ) : null}
        {analysis.lifestyle_scenes?.map((s, i) => (
          <KV key={i} k={`Scene ${String.fromCharCode(65 + i)}`} v={s} />
        ))}
      </div>
    );
  }
  if (stepKey === "cleanup") {
    if (status === "skipped") return <Placeholder text="skipped — image already clean" />;
    return <Placeholder text={status === "running" ? "cleaning…" : "conditional"} />;
  }
  if (stepKey === "cutout") {
    const src = assetUrls.cutout;
    if (!src) return <Placeholder text={status === "running" ? "extracting…" : "RGBA cutout"} />;
    return (
      <div className="absolute inset-0 checker flex items-center justify-center">
        <ZoomImg src={src} onZoom={zoom} />
      </div>
    );
  }
  if (stepKey === "scenes") {
    const urls: string[] = [assetUrls.white, assetUrls.life_a, assetUrls.life_b, assetUrls.life_c].filter(Boolean) as string[];
    if (!urls.length) return <Placeholder text={status === "running" ? "generating…" : "white + 3 lifestyle (parallel)"} />;
    const slots: (string | undefined)[] = [assetUrls.white, assetUrls.life_a, assetUrls.life_b, assetUrls.life_c];
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[2px] p-1">
        {slots.map((src, i) =>
          src ? (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); zoom(src); }}
              className="overflow-hidden rounded-sm bg-panel cursor-zoom-in"
            >
              <img src={src} className="w-full h-full object-cover" />
            </button>
          ) : (
            <div key={i} className="bg-panel rounded-sm" />
          )
        )}
      </div>
    );
  }
  if (stepKey === "ratios") {
    // Dynamic — collect any ratio outputs present (life_a_9x16, white_4x5, etc.)
    const ratioEntries = Object.entries(assetUrls).filter(([k]) => /_\d+x\d+$/.test(k));
    if (ratioEntries.length === 0) {
      return <Placeholder text={status === "running" ? "framing…" : "per-platform ratios"} />;
    }
    const shown = ratioEntries.slice(0, 4);
    return (
      <div className="w-full h-full grid grid-cols-2 gap-[2px] p-1">
        {shown.map(([k, src], i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); zoom(src); }}
            className="relative overflow-hidden rounded-sm bg-panel cursor-zoom-in"
          >
            <img src={src} className="w-full h-full object-cover" />
            <span className="absolute bottom-1 left-1 text-[9px] font-mono font-bold uppercase tracking-wider bg-black/60 text-white px-1.5 py-[3px] rounded">
              {(k.match(/_(\d+x\d+)$/) || ["", k])[1].replace("x", ":")}
            </span>
          </button>
        ))}
      </div>
    );
  }
  return null;
}

function KV({ k, v, sub, mono }: { k: string; v: string; sub?: boolean; mono?: boolean }) {
  return (
    <div className={"flex flex-col gap-0.5 " + (sub ? "pl-1.5" : "")}>
      <span className={"font-mono uppercase tracking-wider font-bold " + (sub ? "text-[8px] text-faint" : "text-[9px] text-muted")}>
        {k}
      </span>
      <span className={"text-ink-2 " + (mono ? "font-mono bg-panel-2 px-1.5 py-0.5 rounded text-[10px] text-amber inline-block w-fit" : "")}>
        {v}
      </span>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-faint text-[11px] uppercase tracking-wider text-center px-3">
      {text}
    </div>
  );
}

function ZoomImg({ src, onZoom }: { src: string; onZoom: (src: string) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onZoom(src); }}
      className="absolute inset-0 cursor-zoom-in"
    >
      <img src={src} className="w-full h-full object-contain" />
    </button>
  );
}
