/* /judge-dashboard/api/run/  →  POST: create a Runflow run.
   /judge-dashboard/api/run/<id>/  →  GET: poll an existing run.

   Hub routes the catch-all so the trailing path lands in ?subPath=<id>.
   Reads RUNFLOW_API_KEY from Vercel env. */

const RUNFLOW_BASE = "https://api.runflow.io";

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const key = process.env.RUNFLOW_API_KEY;
  if (!key) return sendJson(res, 500, { message: "RUNFLOW_API_KEY not set on server" });

  const url = new URL(req.url, "http://x");
  const subPath = url.searchParams.get("subPath") || "";

  // --- GET /api/run/<id> --------------------------------------------------
  if (req.method === "GET") {
    if (!subPath) return sendJson(res, 400, { message: "run id required" });
    const upstream = await fetch(`${RUNFLOW_BASE}/v1/runs/${encodeURIComponent(subPath)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
    res.end(text);
    return;
  }

  // --- POST /api/run ------------------------------------------------------
  if (req.method !== "POST") return sendJson(res, 405, { message: "method not allowed" });
  const body = await readJson(req);
  const endpoint = (body && body.endpoint_url) || "";
  const payload = body && typeof body.input === "object" && body.input != null ? body.input : null;
  if (!endpoint || !payload) return sendJson(res, 400, { message: "endpoint_url + input required" });
  if (!endpoint.startsWith(RUNFLOW_BASE)) return sendJson(res, 400, { message: `endpoint must be on ${RUNFLOW_BASE}` });

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ input: payload, client_ref: body.client_ref ?? null }),
  });
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
  res.end(text);
}

async function readJson(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}
