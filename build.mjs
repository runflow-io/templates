/**
 * Build orchestrator for Runflow Templates
 *
 * Scans /projects, detects each project's type, builds it,
 * and assembles all output into .vercel/output/ (Build Output API v3).
 *
 * Supported project types:
 *   - static:       Plain HTML/CSS/JS — copied as-is
 *   - vite:         React/Vue/Svelte/Vanilla via Vite — built with correct base path
 *   - next:         Next.js with static export
 *   - nuxt:         Nuxt 3 with static generation
 *   - nuxt-server:  Nuxt 3 with server routes (SSR via Vercel serverless)
 *   - custom:       Any framework with a `build` script + `outputDir` in template.config.json
 */

import { readdir, readFile, cp, rm, mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { emitNodeFunctionsProject, copyNodeFunctionsArtifacts } from "./build-node-functions.mjs";

function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", cmd], {
      ...opts,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    // Guard against settling twice and handle spawn errors — without an `error`
    // handler a failed spawn (e.g. missing `sh`, ENOMEM) leaves the promise
    // pending forever and hangs the whole build.
    let settled = false;
    const settle = (fn, arg) => { if (!settled) { settled = true; fn(arg); } };
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => settle(reject, new Error(`spawn failed for "${cmd}": ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) settle(reject, new Error(`exit ${code}\n${stderr || stdout}`));
      else settle(resolve, { stdout, stderr });
    });
  });
}

// Bounded-concurrency map returning Promise.allSettled-shaped results, so a
// large hub doesn't fire one install/build per project all at once.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      try {
        results[idx] = { status: "fulfilled", value: await fn(items[idx], idx) };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)
  );
  return results;
}

const BUILD_CONCURRENCY = Math.max(1, availableParallelism() - 1);

const ROOT = resolve(import.meta.dirname);
const PROJECTS_DIR = join(ROOT, "projects");
const DIST_DIR = join(ROOT, "dist");
const VERCEL_OUTPUT = join(ROOT, ".vercel", "output");

// --- Untrusted-input guards -------------------------------------------------
// A project folder name becomes a URL path AND is interpolated into shell build
// commands (`npx vite build --base /<name>/ ...`) and the generated landing
// HTML. Treat it as untrusted: allow a strict slug only; anything else is
// skipped at discovery, which closes the command-injection vector.
const VALID_PROJECT_NAME = /^[a-z0-9][a-z0-9-]*$/;
const isValidProjectName = (name) => VALID_PROJECT_NAME.test(name);

// HTML-escape text and double-quoted attribute values for the generated index.
// Project names/titles/types and externals.json come from repo content (a
// contributor PR), so never interpolate them raw — that would be stored XSS.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Allow only internal (root-relative) paths and http(s) URLs as link targets —
// blocks javascript:/data: scheme injection from externals.json.
function safeHref(href) {
  const h = String(href ?? "");
  if (h.startsWith("/")) return h;
  try {
    const { protocol } = new URL(h);
    if (protocol === "http:" || protocol === "https:") return h;
  } catch { /* not a valid absolute URL */ }
  return "#";
}

async function detectProjectType(projectDir) {
  const configPath = join(projectDir, "template.config.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    return config;
  }

  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (allDeps["nuxt"]) {
      const hasServer = existsSync(join(projectDir, "server"));
      if (hasServer) {
        return { type: "nuxt-server", title: pkg.description || pkg.name };
      }
      return { type: "nuxt", title: pkg.description || pkg.name };
    }
    if (allDeps["next"]) {
      return { type: "next", title: pkg.description || pkg.name };
    }
    if (allDeps["vite"]) {
      return { type: "vite", title: pkg.description || pkg.name };
    }
    // Has a build script but no known framework — treat as custom
    if (pkg.scripts?.build) {
      return { type: "custom", title: pkg.description || pkg.name };
    }
  }

  // Default: static HTML
  return { type: "static" };
}

function detectInstallCmd(projectDir) {
  // Reproducible installs: when a lockfile exists, use the locked-install form so
  // a build can't silently float to a fresh patch within the same semver range.
  if (existsSync(join(projectDir, "package-lock.json"))) return "npm ci";
  if (existsSync(join(projectDir, "pnpm-lock.yaml"))) return "pnpm install --frozen-lockfile";
  if (existsSync(join(projectDir, "bun.lockb"))) return "bun install --frozen-lockfile";
  return "npm install";
}

async function buildProject(name, projectDir, config) {
  const outputTarget = join(DIST_DIR, name);
  const type = config.type || "static";
  const opts = { cwd: projectDir };
  const logs = [];
  let crons = [];

  async function exec(cmd, extraOpts = {}) {
    const { stdout, stderr } = await run(cmd, { ...opts, ...extraOpts });
    if (stderr) logs.push(stderr.trim());
    if (stdout) logs.push(stdout.trim());
  }

  switch (type) {
    case "static": {
      await cp(projectDir, outputTarget, {
        recursive: true,
        // Denylist build junk + anything that looks like a secret, so a template
        // can't accidentally publish credentials into the public output.
        filter: (src) => {
          const base = src.split("/").pop();
          if (["node_modules", ".git", "template.config.json", ".npmrc", ".DS_Store"].includes(base)) return false;
          if (base.startsWith(".env")) return false;         // .env, .env.local, .env.*
          if (/\.(pem|key|log)$/i.test(base)) return false;  // keys, certs, logs
          if (base === "id_rsa" || base === "id_ed25519") return false;
          return true;
        },
      });
      break;
    }

    case "vite": {
      await exec(detectInstallCmd(projectDir));
      await exec(`npx vite build --base /${name}/ --outDir ${outputTarget}`);
      break;
    }

    case "next": {
      await exec(detectInstallCmd(projectDir));
      await exec("npx next build", {
        env: { ...process.env, NEXT_PUBLIC_BASE_PATH: `/${name}` },
      });
      const nextOut = join(projectDir, "out");
      if (existsSync(nextOut)) {
        await cp(nextOut, outputTarget, { recursive: true });
      }
      break;
    }

    case "nuxt": {
      await exec(detectInstallCmd(projectDir));
      await exec("npx nuxi generate", {
        env: { ...process.env, NUXT_APP_BASE_URL: `/${name}/`, NITRO_PRESET: "static" },
      });
      const nuxtOut = join(projectDir, ".output", "public");
      if (existsSync(nuxtOut)) {
        await cp(nuxtOut, outputTarget, { recursive: true });
      }
      break;
    }

    case "nuxt-server": {
      await exec(detectInstallCmd(projectDir));
      await exec("npx nuxi build", {
        env: { ...process.env, NUXT_APP_BASE_URL: `/${name}/`, NITRO_PRESET: "vercel" },
      });
      break;
    }

    case "custom": {
      await exec(detectInstallCmd(projectDir));
      await exec("npm run build", {
        env: { ...process.env, BASE_PATH: `/${name}` },
      });
      const customOut = join(projectDir, config.outputDir || "dist");
      if (existsSync(customOut)) {
        await cp(customOut, outputTarget, { recursive: true });
      }
      break;
    }

    case "node-functions": {
      const result = await emitNodeFunctionsProject({
        projectDir,
        projectName: name,
        distTarget: outputTarget,
        config,
      });
      for (const line of result.logs) logs.push(line);
      crons = result.crons;
      break;
    }
  }

  return { logs, crons };
}

async function loadExternals() {
  const externalsPath = join(ROOT, "externals.json");
  if (!existsSync(externalsPath)) return [];
  return JSON.parse(await readFile(externalsPath, "utf-8"));
}

async function buildLandingPage(projects, externals) {
  /*
   * The hub's landing page is hand-maintained at landing/index.html (with its
   * assets at landing/assets/). This function copies both into the Vercel
   * static output so templates.runflow.io/ serves the marketing landing.
   *
   * Why hand-maintained rather than auto-generated from project configs:
   * the landing is a marketing page (hero copy, animated prompt, "why
   * specialists" compare block, etc.), not a directory listing. Live template
   * cards in the grid are edited inline as new templates ship. To preview
   * locally, open landing/index.html directly in a browser — relative asset
   * paths (assets/...) resolve correctly both from disk and from /.
   *
   * `projects` and `externals` are passed in for future use (e.g. emitting
   * a JSON manifest the page could fetch) but are intentionally unused here.
   */
  void projects; void externals;

  const landingDir = join(ROOT, "landing");
  const landingHtml = join(landingDir, "index.html");
  const landingAssets = join(landingDir, "assets");
  const staticDir = join(VERCEL_OUTPUT, "static");

  if (!existsSync(landingHtml)) {
    throw new Error(`landing/index.html not found at ${landingHtml}`);
  }

  await mkdir(staticDir, { recursive: true });
  await cp(landingHtml, join(staticDir, "index.html"));
  if (existsSync(landingAssets)) {
    await cp(landingAssets, join(staticDir, "assets"), { recursive: true });
  }
}

// Pure: compute the Build Output API v3 config object from the project list.
// Kept side-effect-free so it can be unit-tested (see test/build.test.mjs).
function buildVercelConfig(projects, crons = []) {
  const serverProjects = projects.filter((p) => p.config.type === "nuxt-server");

  const routes = [];

  // API routes for each server project go to the Nitro __fallback function.
  for (const p of serverProjects) {
    routes.push({ src: `/${p.name}/api/(.*)`, dest: `/${p.name}/__fallback` });
  }

  // node-functions dynamic routing. `trailingSlash: true` 308-redirects
  // /api/x/UUID -> /api/x/UUID/, and Vercel BOA's filesystem matcher won't pair
  // the slash form with a `[param].func` entry, so we route dynamic paths to the
  // PARENT function and pass the captured segment via query string.
  const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fnProjects = projects.filter((p) => p.config.type === "node-functions");
  for (const p of fnProjects) {
    const entries = p.config.functions?.entries || [];
    const perEntry = p.config.functions?.perEntry || {};
    for (const entry of entries) {
      // Single trailing dynamic segment: /<name>/<parent>/<seg> -> ?subId=<seg>.
      const m = entry.match(/^(.+?)\/\[([^\]]+)\]\.(?:mjs|js)$/);
      if (m) {
        const [, parentPath] = m;
        // Fail fast on multi-segment dynamic paths — they'd silently emit a route
        // to a non-existent function and 404 in prod. Use one trailing [id].mjs
        // (parent reads ?subId=) or a catchAll entry instead.
        if (parentPath.includes("[")) {
          throw new Error(
            `template.config.json (${p.name}): function entry "${entry}" has multiple dynamic [param] segments, which isn't supported. Use a single trailing [id].mjs or a catchAll entry.`
          );
        }
        routes.push({
          src: `^/${reEscape(p.name)}/${reEscape(parentPath)}/([^/]+)/?$`,
          dest: `/${p.name}/${parentPath}?subId=$1`,
        });
        continue;
      }
      // Catch-all opt-in: functions.perEntry["api/proxy.mjs"] = { catchAll: true }
      // routes /<name>/<entry>/<multi/segment> to the function with the remainder
      // in ?subPath= (handy for API proxies forwarding arbitrary upstream paths).
      const cleanRel = entry.replace(/\.m?js$/, "");
      if (perEntry[entry]?.catchAll) {
        routes.push({
          src: `^/${reEscape(p.name)}/${reEscape(cleanRel)}/(.+?)/?$`,
          dest: `/${p.name}/${cleanRel}?subPath=$1`,
        });
      }
    }
  }

  // Filesystem fallback (serves static files + node-functions automatically).
  routes.push({ handle: "filesystem" });

  // SPA fallback for server projects — Nitro serves the SPA shell.
  for (const p of serverProjects) {
    routes.push({ src: `/${p.name}(?:/((?!api/).*))?`, dest: `/${p.name}/__fallback` });
  }

  const config = { version: 3, cleanUrls: true, trailingSlash: true, routes };
  if (Array.isArray(crons) && crons.length > 0) {
    config.crons = crons;
  }
  return config;
}

async function generateVercelConfig(projects, crons = []) {
  await writeFile(
    join(VERCEL_OUTPUT, "config.json"),
    JSON.stringify(buildVercelConfig(projects, crons), null, 2)
  );
}

async function main() {
  console.log("runflow-templates build\n");

  // Clean dist (intermediate) and .vercel/output (final)
  if (existsSync(DIST_DIR)) {
    await rm(DIST_DIR, { recursive: true });
  }
  await mkdir(DIST_DIR, { recursive: true });

  if (existsSync(VERCEL_OUTPUT)) {
    await rm(VERCEL_OUTPUT, { recursive: true });
  }
  await mkdir(join(VERCEL_OUTPUT, "static"), { recursive: true });
  await mkdir(join(VERCEL_OUTPUT, "functions"), { recursive: true });

  // Copy root public/ assets to .vercel/output/static/
  const publicDir = join(ROOT, "public");
  if (existsSync(publicDir)) {
    await cp(publicDir, join(VERCEL_OUTPUT, "static"), { recursive: true });
  }

  // Discover projects
  let entries;
  try {
    entries = await readdir(PROJECTS_DIR);
  } catch {
    entries = [];
  }

  const projects = [];

  for (const name of entries.sort()) {
    const projectDir = join(PROJECTS_DIR, name);
    const s = await stat(projectDir);
    if (!s.isDirectory()) continue;
    if (!isValidProjectName(name)) {
      console.warn(`  [skip] "${name}" — folder names must match /^[a-z0-9][a-z0-9-]*$/ (lowercase, digits, hyphens). Skipping.`);
      continue;
    }

    const config = await detectProjectType(projectDir);
    projects.push({ name, config, dir: projectDir });
  }

  // Build all projects with bounded concurrency
  console.log(`Found ${projects.length} project(s) — building (up to ${BUILD_CONCURRENCY} at a time):\n`);
  const buildStart = Date.now();

  const results = await mapLimit(projects, BUILD_CONCURRENCY, async (p) => {
    const t0 = Date.now();
    const { logs, crons } = await buildProject(p.name, p.dir, p.config);
    return { ms: Date.now() - t0, logs, crons };
  });

  const allCrons = [];
  let failed = 0;
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const r = results[i];
    const type = p.config.type || "static";

    if (r.status === "fulfilled") {
      const { ms, logs, crons } = r.value;
      if (Array.isArray(crons)) allCrons.push(...crons);
      console.log(`  [${p.name}] ${type} — OK (${(ms / 1000).toFixed(1)}s)`);
      // Print warnings from build output (npm warn, deprecation notices, etc.)
      const warnings = logs.join("\n").split("\n").filter(
        (l) => /warn|deprecat|WARN/i.test(l)
      );
      if (warnings.length > 0) {
        console.log(`    warnings:`);
        for (const w of warnings.slice(0, 20)) console.log(`      ${w}`);
        if (warnings.length > 20) console.log(`      ... and ${warnings.length - 20} more`);
      }
    } else {
      failed++;
      console.error(`\n  [${p.name}] ${type} — FAILED`);
      console.error(r.reason.message);
    }
  }

  const totalBuild = ((Date.now() - buildStart) / 1000).toFixed(1);
  console.log(`\nAll builds finished in ${totalBuild}s (${projects.length - failed}/${projects.length} succeeded)\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }

  // Only assemble + index projects that actually built — never copy partial or
  // empty output from a failed project into the deployment.
  const built = projects.filter((_, i) => results[i].status === "fulfilled");

  // Assembly phase: populate .vercel/output/
  console.log("Assembling Vercel Build Output API v3 structure...\n");

  for (const p of built) {
    const type = p.config.type || "static";

    if (type === "nuxt-server") {
      // Copy static assets from project's .vercel/output/static/ to .vercel/output/static/
      const projectStaticDir = join(p.dir, ".vercel", "output", "static");
      if (existsSync(projectStaticDir)) {
        await cp(projectStaticDir, join(VERCEL_OUTPUT, "static"), {
          recursive: true,
        });
        console.log(`  [${p.name}] Copied static assets to .vercel/output/static/`);
      }

      // Copy functions from project's .vercel/output/functions/ to .vercel/output/functions/{name}/
      const projectFunctionsDir = join(p.dir, ".vercel", "output", "functions");
      if (existsSync(projectFunctionsDir)) {
        await cp(projectFunctionsDir, join(VERCEL_OUTPUT, "functions", p.name), {
          recursive: true,
          dereference: true,
        });
        console.log(`  [${p.name}] Copied functions to .vercel/output/functions/${p.name}/`);
      }
    } else if (type === "node-functions") {
      // Static dashboard already in dist/<name>/ — copy alongside other static prototypes
      const distProjectDir = join(DIST_DIR, p.name);
      if (existsSync(distProjectDir)) {
        await cp(distProjectDir, join(VERCEL_OUTPUT, "static", p.name), { recursive: true });
        console.log(`  [${p.name}] Copied dashboard to .vercel/output/static/${p.name}/`);
      }
      // Functions live under project/.vercel/output/functions/<name>/ — copy into hub's functions dir
      const projectFnDir = join(p.dir, ".vercel", "output", "functions", p.name);
      if (existsSync(projectFnDir)) {
        await cp(projectFnDir, join(VERCEL_OUTPUT, "functions", p.name), {
          recursive: true,
          dereference: true,
        });
        console.log(`  [${p.name}] Copied functions to .vercel/output/functions/${p.name}/`);
      }
    } else {
      // Static projects: copy from dist/{name}/ to .vercel/output/static/{name}/
      const distProjectDir = join(DIST_DIR, p.name);
      if (existsSync(distProjectDir)) {
        await cp(distProjectDir, join(VERCEL_OUTPUT, "static", p.name), {
          recursive: true,
        });
        console.log(`  [${p.name}] Copied to .vercel/output/static/${p.name}/`);
      }
    }
  }

  // Load externally hosted prototypes
  const externals = await loadExternals();
  if (externals.length > 0) {
    console.log(`\n${externals.length} external prototype(s): ${externals.map((e) => e.name).join(", ")}`);
  }

  // Generate landing page at .vercel/output/static/index.html
  await buildLandingPage(built, externals);
  console.log("\nLanding page generated.");

  // Copy favicon if exists
  const faviconSrc = join(ROOT, "public", "favicon.ico");
  if (existsSync(faviconSrc)) {
    await cp(faviconSrc, join(VERCEL_OUTPUT, "static", "favicon.ico"));
  }

  // Generate .vercel/output/config.json
  await generateVercelConfig(built, allCrons);
  console.log(`Vercel config generated${allCrons.length > 0 ? ` (${allCrons.length} cron(s))` : ""}.`);

  console.log(`\nBuild complete → .vercel/output/`);
}

// Exported for unit tests (test/build.test.mjs).
export { buildVercelConfig, escapeHtml, safeHref, isValidProjectName, detectProjectType };

// Only run the build when executed directly (`node build.mjs`), not when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
