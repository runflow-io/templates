// Dev-only dispatcher for `node-functions` prototypes.
// Mirrors what Vercel does for legacy Node functions with `shouldAddHelpers: true`.
// Looks up a bundled function under .vercel/output/functions/<path>.func/index.mjs
// and invokes it after attaching `res.status` / `res.json` / `res.send` helpers.
import { existsSync } from "node:fs";
import { join } from "node:path";

const cache = new Map();

async function loadHandler(funcDir) {
  if (cache.has(funcDir)) return cache.get(funcDir);
  const entry = join(funcDir, "index.mjs");
  if (!existsSync(entry)) return null;
  const mod = await import(entry + `?t=${Date.now()}`);
  const handler = mod.default || mod.handler;
  cache.set(funcDir, handler);
  return handler;
}

function attachHelpers(res) {
  res.status = function (c) { this.statusCode = c; return this; };
  res.json = function (o) {
    if (!this.getHeader("content-type")) this.setHeader("content-type", "application/json; charset=utf-8");
    this.end(JSON.stringify(o));
    return this;
  };
  res.send = function (s) { this.end(s); return this; };
}

function functionDirsFor(vercelOutputRoot, urlPath) {
  // urlPath like /example-api/api/cron/run — try .func at full path, then strip trailing segments
  const fnRoot = join(vercelOutputRoot, "functions");
  const segments = urlPath.replace(/^\/+|\/+$/g, "").split("/");
  const candidates = [];
  for (let i = segments.length; i >= 1; i--) {
    candidates.push(join(fnRoot, segments.slice(0, i).join("/") + ".func"));
  }
  return candidates;
}

export async function tryDispatchFunction({ req, res, vercelOutputRoot }) {
  const url = new URL(req.url, "http://localhost");
  for (const dir of functionDirsFor(vercelOutputRoot, url.pathname)) {
    if (existsSync(dir)) {
      const handler = await loadHandler(dir);
      if (typeof handler === "function") {
        attachHelpers(res);
        try {
          await handler(req, res);
        } catch (e) {
          console.error(`[dev] handler ${dir} threw:`, e);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ ok: false, error: "handler_threw", message: String(e?.message || e) }));
          }
        }
        return true;
      }
    }
  }
  return false;
}

export function clearCache() {
  cache.clear();
}
