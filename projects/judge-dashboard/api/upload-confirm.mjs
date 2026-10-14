/* POST /judge-dashboard/api/upload-confirm/<asset_upload_id>/
   The hub's catchAll routing puts <asset_upload_id> into ?subPath. */

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

  const url = new URL(req.url, "http://x");
  const assetUploadId = url.searchParams.get("subPath") || "";
  if (!assetUploadId) return sendJson(res, 400, { message: "asset upload id required" });

  const upstream = await fetch(`${RUNFLOW_BASE}/v1/asset-uploads/${encodeURIComponent(assetUploadId)}/confirmations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") || "application/json");
  res.end(text);
}
