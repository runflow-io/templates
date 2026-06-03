/**
 * Local dev server for Runflow Templates
 *
 * Runs the build, then serves .vercel/output/ (with a dist/ fallback) on
 * localhost:3000, dispatching node-functions like the Vercel runtime does.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { tryDispatchFunction } from "./dev-node-functions.mjs";

const ROOT = resolve(import.meta.dirname);
const DIST = join(ROOT, "dist");
const VERCEL_OUTPUT = join(ROOT, ".vercel", "output");
const PORT = process.env.PORT || 3000;
const DEV_LOAD_DOTENV = process.env.DEV_LOAD_DOTENV !== "false";

if (DEV_LOAD_DOTENV) {
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    const raw = await readFile(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = line.slice(i + 1);
    }
  }
  // Apply the fallback whether or not .env existed — clean checkouts shouldn't
  // 401 on local cron probes just because they haven't created a .env yet.
  // Never apply it in CI/production: those must fail closed on a real secret.
  if (!process.env.CRON_SECRET) {
    if (process.env.CI || process.env.VERCEL || process.env.NODE_ENV === "production") {
      console.warn("[dev] CRON_SECRET not set — refusing the dev fallback in CI/production.");
    } else {
      process.env.CRON_SECRET = "local-dev-cron-secret";
      console.log("[dev] CRON_SECRET not set — using local fallback 'local-dev-cron-secret' (dev only)");
    }
  }
}

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

// Build first
console.log("Building...\n");
execSync("node build.mjs", { cwd: ROOT, stdio: "inherit" });
console.log("");

const server = createServer(async (req, res) => {
  let urlPath = new URL(req.url, `http://localhost:${PORT}`).pathname;

  // 1) Try dispatching to a node-functions handler under .vercel/output/functions/<path>.func/
  if (existsSync(VERCEL_OUTPUT)) {
    const dispatched = await tryDispatchFunction({ req, res, vercelOutputRoot: VERCEL_OUTPUT });
    if (dispatched) return;
  }

  // 2) Static file lookup (matches Vercel's filesystem handler)
  // Check .vercel/output/static first (has gate-injected HTML for gated projects),
  // then fall back to dist/ (raw build output).
  const STATIC = join(VERCEL_OUTPUT, "static");
  const candidates = [
    join(STATIC, urlPath),
    join(STATIC, urlPath, "index.html"),
    join(STATIC, urlPath + ".html"),
    join(DIST, urlPath),
    join(DIST, urlPath, "index.html"),
    join(DIST, urlPath + ".html"),
  ];

  for (const filePath of candidates) {
    try {
      const s = await stat(filePath);
      if (s.isFile()) {
        const ext = extname(filePath);
        const mime = MIME_TYPES[ext] || "application/octet-stream";
        const content = await readFile(filePath);
        res.writeHead(200, { "Content-Type": mime });
        res.end(content);
        return;
      }
    } catch {}
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
  console.log(`Serving ${join(VERCEL_OUTPUT, "static")} (fallback: ${DIST})\n`);
});
