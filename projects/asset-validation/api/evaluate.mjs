/* POST /judge-dashboard/api/evaluate/
   Calls OpenAI gpt-4o vision to score a workflow's outputs against the
   contest #01 acceptance criteria. Returns the parsed JSON verdict. */

const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = "gpt-4o";

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { message: "method not allowed" });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return sendJson(res, 500, { message: "OPENAI_API_KEY not set on server" });

  const body = await readJson(req);
  const inputPayload = body.input || {};
  const workflowMeta = body.workflow_meta || {};
  const outputImageUrls = Array.isArray(body.output_image_urls) ? body.output_image_urls : [];
  if (!outputImageUrls.length) return sendJson(res, 400, { message: "output_image_urls required" });

  const rubric =
    "Contest #01 — Brand-consistent ad variants. Acceptance criteria (0-5 integer each):\n" +
    "1. brand_color: sampled palette matches brand_kit_primary_color1/2 within ΔE<8.\n" +
    "2. logo: logo present, undistorted, in a corner safe zone of the format.\n" +
    "3. text: headline + subhead rendered exactly, in brand font, legible at thumb size.\n" +
    "4. hero: focal subject from input preserved as the visual anchor.\n" +
    "5. artifacts: no warped text, no glitches, no over-smoothed faces.\n";
  const sysMsg =
    "You are a senior creative director judging an AI ad-generation workflow. " +
    "Score each output image individually on a 0-5 integer scale per criterion, then " +
    "give a summary across all images. Be honest. Anti-pattern: generating from scratch " +
    "instead of compositing onto the hero. Return STRICT JSON only.";
  const limited = outputImageUrls.slice(0, 8);
  const userContent = [
    { type: "text", text: rubric },
    { type: "text", text: `Input payload:\n${JSON.stringify(inputPayload, null, 2)}` },
    { type: "text", text: `Workflow metadata:\n${JSON.stringify(workflowMeta, null, 2)}` },
    {
      type: "text",
      text:
        `Below are ${limited.length} output image(s), each preceded by its index. ` +
        "Score every image. Return JSON only with this exact shape:\n" +
        '{"per_image":[{"index":1,"scores":{"brand_color":0-5,"logo":0-5,"text":0-5,"hero":0-5,"artifacts":0-5},"comment":"<1-2 sentence verdict>"}],' +
        '"summary":{"scores":{"brand_color":0-5,"logo":0-5,"text":0-5,"hero":0-5,"artifacts":0-5},' +
        '"verdict":"<2-4 sentence verdict across all images>",' +
        '"strengths":["..."],"failures":["..."]}}' +
        " Summary scores should be a fair average rounded to nearest integer.",
    },
  ];
  for (let i = 0; i < limited.length; i++) {
    userContent.push({ type: "text", text: `Image ${i + 1}:` });
    userContent.push({ type: "image_url", image_url: { url: limited[i] } });
  }

  const upstream = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: sysMsg },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2500,
      temperature: 0.2,
    }),
  });
  const raw = await upstream.json().catch(() => null);
  if (upstream.status !== 200) return sendJson(res, upstream.status || 502, { message: "openai error", detail: raw });
  try {
    const text = raw.choices[0].message.content;
    return sendJson(res, 200, JSON.parse(text));
  } catch (e) {
    return sendJson(res, 500, { message: `could not parse model output: ${e.message || e}`, raw });
  }
}

async function readJson(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
    return req.body || {};
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}
