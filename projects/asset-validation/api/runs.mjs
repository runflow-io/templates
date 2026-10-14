/* /asset-validation/api/runs/  →  GET ?ref=<client_ref>: list every run tagged
   with that client_ref, normalised into render-ready tiles for the validation grid.

   The CLI (runflow-ad-creative/create_ad.py) stamps every run in an ad-creation
   batch with the SAME client_ref token. The Runflow runs API only supports
   exact-match filtering (q=client_ref.EQ:'<token>'), so one EQ query returns the
   whole batch. The list endpoint can project `output`, so a single call also
   carries the image URLs — no per-run fetch needed.

   Reads RUNFLOW_API_KEY from the server env (same key as api/run.mjs). */

const RUNFLOW_BASE = "https://api.runflow.io";

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

const IMG_RE = /\.(png|jpe?g|webp|gif)(\?|$)/i;

function pickImage(output) {
  const outs = output && Array.isArray(output.outputs) ? output.outputs : [];
  const img = outs.find((o) => typeof o.url === "string" && IMG_RE.test(o.url))
    || outs.find((o) => typeof o.url === "string");
  return img ? img.url : null;
}

export default async function handler(req, res) {
  const key = process.env.RUNFLOW_API_KEY;
  if (!key) return sendJson(res, 500, { message: "RUNFLOW_API_KEY not set on server" });
  if (req.method !== "GET") return sendJson(res, 405, { message: "method not allowed" });

  const url = new URL(req.url, "http://x");
  const ref = (url.searchParams.get("ref") || url.searchParams.get("batch") || "").trim();
  if (!ref) return sendJson(res, 400, { message: "ref (client_ref token) query param required" });

  // Single quotes wrap the value in the ANTLR filter grammar; strip any to stay safe.
  const params = new URLSearchParams();
  params.set("q", `client_ref.EQ:'${ref.replace(/'/g, "")}'`);
  params.set("fields", "id,status_code,client_ref,output,input,cost,duration_ms,created_at");
  params.set("sort_by", "created_at:asc");
  params.set("limit", "100");

  let upstream, data;
  try {
    upstream = await fetch(`${RUNFLOW_BASE}/v1/runs?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    data = await upstream.json();
  } catch (e) {
    return sendJson(res, 502, { message: "runflow list request failed", detail: String(e) });
  }
  if (!upstream.ok) return sendJson(res, upstream.status, { message: "runflow list error", detail: data });

  const items = Array.isArray(data.items) ? data.items : [];
  const runs = items.map((it, i) => {
    const aspect = (it.input && (it.input.aspect_ratio || it.input.aspect || it.input.format)) || "";
    return {
      id: it.id,
      run_id: it.id,
      status: it.status_code,
      image: pickImage(it.output),
      cost: it.cost != null ? Number(it.cost) : null,
      duration_ms: it.duration_ms != null ? Number(it.duration_ms) : null,
      client_ref: it.client_ref,
      format: aspect,
      label: aspect || `#${i + 1}`,
      created_at: it.created_at,
    };
  });

  sendJson(res, 200, { ref, count: runs.length, runs });
}
