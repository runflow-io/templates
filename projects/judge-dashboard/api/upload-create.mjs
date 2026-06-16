/* POST /judge-dashboard/api/upload-create/
   Proxies to Runflow's /v1/asset-uploads to get a pre-signed PUT URL. */

const RUNFLOW_BASE = "https://api.runflow.io";

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { message: "method not allowed" });
  const key = process.env.RUNFLOW_API_KEY;
  if (!key) return sendJson(res, 500, { message: "RUNFLOW_API_KEY not set on server" });

  const body = await readJson(req);
  for (const k of ["filename", "mime_type", "size_bytes"]) {
    if (body[k] === undefined) return sendJson(res, 400, { message: `${k} required` });
  }
  const upstream = await fetch(`${RUNFLOW_BASE}/v1/asset-uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      filename: body.filename,
      mime_type: body.mime_type,
      size_bytes: Number(body.size_bytes),
    }),
  });
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
  res.end(text);
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
