/* GET/POST /judge-dashboard/api/preset-overrides
   Read/write a tiny JSON blob that tracks tile IDs an admin has hidden from
   every judge. Persistent across sessions and browsers — backed by Vercel
   Blob storage linked to this project (BLOB_READ_WRITE_TOKEN auto-set).

   GET  → 200 { hidden: ["preset-chanel-0", ...] }
   POST → admin-only. Body: { tile_id, action: "hide" | "unhide" }.
          Auth: "Authorization: Bearer <admin password>", password must be
          in ADMIN_PASSWORDS env var (comma-separated). */

import { put, list } from "@vercel/blob";

const OVERRIDES_PATHNAME = "preset-overrides.json";

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}

function adminPasswords() {
  const raw = process.env.ADMIN_PASSWORDS || "Runflow.io/team";
  return new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
}

function authedAsAdmin(req) {
  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token && adminPasswords().has(token);
}

async function readOverrides() {
  // Look up the blob by pathname. Public stores expose a downloadable URL.
  const { blobs } = await list({ prefix: OVERRIDES_PATHNAME, limit: 1 });
  const match = blobs.find(b => b.pathname === OVERRIDES_PATHNAME);
  if (!match) return { hidden: [] };
  const r = await fetch(match.url, { cache: "no-store" });
  if (!r.ok) return { hidden: [] };
  try {
    const j = await r.json();
    return { hidden: Array.isArray(j?.hidden) ? j.hidden : [] };
  } catch { return { hidden: [] }; }
}

async function writeOverrides(payload) {
  // Pin the pathname (no random suffix) so the file is always at the same URL.
  return put(OVERRIDES_PATHNAME, JSON.stringify(payload), {
    access: "public",
    contentType: "application/json",
    cacheControlMaxAge: 0,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export default async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(res, 500, { message: "BLOB_READ_WRITE_TOKEN not set on server" });
  }

  if (req.method === "GET") {
    try {
      return sendJson(res, 200, await readOverrides());
    } catch (e) {
      return sendJson(res, 502, { message: String(e?.message || e) });
    }
  }

  if (req.method === "POST") {
    if (!authedAsAdmin(req)) return sendJson(res, 401, { message: "admin password required" });
    let body;
    try { body = await readJson(req); } catch { return sendJson(res, 400, { message: "invalid JSON" }); }
    // "set" overwrites the full list atomically — useful when multiple ids
    // need to be added/removed at once, since the read-modify-write loop
    // doesn't survive concurrent calls on eventually-consistent storage.
    if (body.action === "set") {
      const hidden = Array.isArray(body.hidden) ? body.hidden.map(s => String(s).trim()).filter(Boolean) : [];
      try {
        const next = { hidden: Array.from(new Set(hidden)).sort(), updated_at: new Date().toISOString() };
        await writeOverrides(next);
        return sendJson(res, 200, next);
      } catch (e) {
        return sendJson(res, 502, { message: String(e?.message || e) });
      }
    }
    const tileId = (body.tile_id || "").trim();
    const action = body.action === "unhide" ? "unhide" : "hide";
    if (!tileId) return sendJson(res, 400, { message: "tile_id required" });
    try {
      const current = await readOverrides();
      const set = new Set(current.hidden);
      if (action === "hide") set.add(tileId); else set.delete(tileId);
      const next = { hidden: Array.from(set).sort(), updated_at: new Date().toISOString() };
      await writeOverrides(next);
      return sendJson(res, 200, next);
    } catch (e) {
      return sendJson(res, 502, { message: String(e?.message || e) });
    }
  }

  return sendJson(res, 405, { message: "method not allowed" });
}

async function readJson(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body || {};
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
