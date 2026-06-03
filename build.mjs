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
import { emitNodeFunctionsProject, copyNodeFunctionsArtifacts } from "./build-node-functions.mjs";

function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", cmd], {
      ...opts,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`exit ${code}\n${stderr || stdout}`));
      else resolve({ stdout, stderr });
    });
  });
}

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
  if (existsSync(join(projectDir, "package-lock.json"))) return "npm install";
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
  // Projects can opt into a named section by declaring `section` + `demos`
  // in template.config.json. Each demo becomes its own card under the section
  // header, instead of the parent project getting a single tile.
  const sectionMap = new Map(); // section title -> cards[]
  const defaultEntries = [];

  for (const p of projects) {
    if (p.config?.section && Array.isArray(p.config.demos) && p.config.demos.length > 0) {
      const list = sectionMap.get(p.config.section) || [];
      for (const d of p.config.demos) {
        const sub = (d.path || `${d.name}/`).replace(/^\/+/, "");
        list.push({
          name: d.name || d.title || "",
          href: `/${p.name}/${sub}`,
          type: "workflow",
          title: d.title || d.description || "",
          external: false,
        });
      }
      sectionMap.set(p.config.section, list);
      continue;
    }
    defaultEntries.push({
      name: p.name,
      href: `/${p.name}/`,
      type: p.config?.type || "static",
      title: p.config?.title || "",
      external: false,
    });
  }
  for (const e of externals) {
    defaultEntries.push({
      name: e.name,
      href: e.url,
      type: "external",
      title: e.title || "",
      external: true,
    });
  }
  defaultEntries.sort((a, b) => a.name.localeCompare(b.name));
  for (const list of sectionMap.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const renderCard = (p) => `
      <a href="${escapeHtml(safeHref(p.href))}" class="project-card"${p.external ? ' target="_blank" rel="noopener"' : ""}>
        <div class="project-name">${escapeHtml(p.name)}${p.external ? ' <svg class="external-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2L7 9"/></svg>' : ""}</div>
        <div class="project-meta">
          <span class="project-type">${escapeHtml(p.type)}</span>
          ${p.title ? `<span class="project-title">${escapeHtml(p.title)}</span>` : ""}
        </div>
      </a>`;

  const sectionBlocks = [...sectionMap.entries()]
    .map(([title, cards]) => `
    <section class="proto-section">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      <div class="project-grid">
        ${cards.map(renderCard).join("\n")}
      </div>
    </section>`)
    .join("\n");

  const defaultBlock = defaultEntries.length > 0
    ? `<div class="project-grid">${defaultEntries.map(renderCard).join("\n")}</div>`
    : `<div class="empty-state">No templates yet.<br>Add a folder under <code>projects/</code> to create one.</div>`;

  const totalCount = defaultEntries.length + [...sectionMap.values()].reduce((a, l) => a + l.length, 0);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Runflow Templates</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      background: #09090B;
      color: #FAFAFA;
      min-height: 100vh;
      padding: 3rem 1.5rem;
    }

    .container {
      max-width: 720px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 3rem;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .logo-mark {
      width: 48px;
      height: 14px;
      border-radius: 7px;
      background: linear-gradient(90deg, #09090B, #FBBF24);
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.04em;
    }

    h1 span {
      color: #FBBF24;
    }

    .subtitle {
      color: #A1A1AA;
      font-family: 'Space Mono', ui-monospace, monospace;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .proto-section {
      margin-bottom: 2.5rem;
    }

    .section-title {
      font-family: 'Space Mono', ui-monospace, monospace;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #FBBF24;
      margin-bottom: 0.875rem;
      padding-bottom: 0.625rem;
      border-bottom: 1px solid #27272A;
    }

    .project-grid {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .project-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      background: #111113;
      border: 1px solid #27272A;
      border-radius: 10px;
      text-decoration: none;
      color: inherit;
      transition: border-color 0.15s, background 0.15s;
    }

    .project-card:hover {
      border-color: rgba(251, 191, 36, 0.2);
      background: #18181B;
    }

    .project-name {
      font-size: 0.9375rem;
      font-weight: 600;
      font-family: 'Space Mono', ui-monospace, monospace;
      color: #FAFAFA;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .external-icon {
      width: 14px;
      height: 14px;
      color: #71717A;
      flex-shrink: 0;
    }

    .project-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .project-type {
      font-size: 0.6875rem;
      color: #71717A;
      font-family: 'Space Mono', ui-monospace, monospace;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .project-title {
      font-size: 0.8125rem;
      color: #A1A1AA;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 1rem;
      color: #71717A;
    }

    .empty-state code {
      background: #18181B;
      padding: 0.2em 0.5em;
      border-radius: 6px;
      font-size: 0.875rem;
      font-family: 'Space Mono', ui-monospace, monospace;
      color: #FBBF24;
    }
  </style>
</head>
<body>
  <div class="container" id="content">
    <header>
      <div class="logo">
        <div class="logo-mark"></div>
      </div>
      <h1>Run<span>flow</span> Templates</h1>
      <p class="subtitle">${totalCount} template${totalCount !== 1 ? "s" : ""}</p>
    </header>
    ${sectionBlocks}
    ${defaultBlock}
  </div>
</body>
</html>`;

  const staticDir = join(VERCEL_OUTPUT, "static");
  await mkdir(staticDir, { recursive: true });
  await writeFile(join(staticDir, "index.html"), html);
}

async function generateVercelConfig(projects, crons = []) {
  const serverProjects = projects.filter((p) => p.config.type === "nuxt-server");

  const routes = [];

  // Add routes for each server project
  for (const p of serverProjects) {
    // API routes go to the Nitro __fallback function
    routes.push({
      src: `/${p.name}/api/(.*)`,
      dest: `/${p.name}/__fallback`,
    });
  }

  // Strip trailing slash from dynamic [param] paths in node-functions projects.
  // `trailingSlash: true` 308-redirects /api/reports/UUID -> /api/reports/UUID/,
  // and Vercel BOA's filesystem matcher won't pair the trailing-slash form with
  // a `[param].func` entry. Rewrite the slash form back to no-slash so the
  // dynamic match fires.
  const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fnProjects = projects.filter((p) => p.config.type === "node-functions");
  for (const p of fnProjects) {
    const entries = p.config.functions?.entries || [];
    const perEntry = p.config.functions?.perEntry || {};
    for (const entry of entries) {
      // Single-segment dynamic [id] entries: rewrite /<name>/<parent>/<seg> ->
      // /<name>/<parent>?subId=<seg>. Vercel BOA's filesystem matcher doesn't
      // auto-resolve `[param].func` dynamic routing — the .func directory name
      // is treated literally — so we route dynamic paths to the PARENT function
      // and pass the captured segment via query string.
      const m = entry.match(/^(.+?)\/\[([^\]]+)\]\.(?:mjs|js)$/);
      if (m) {
        const [, parentPath] = m;
        routes.push({
          src: `^/${reEscape(p.name)}/${reEscape(parentPath)}/([^/]+)/?$`,
          dest: `/${p.name}/${parentPath}?subId=$1`,
        });
        continue;
      }
      // Catch-all opt-in via template.config.json:
      //   functions.perEntry["api/proxy.mjs"] = { catchAll: true }
      // Routes /<name>/<entry>/<arbitrary multi-segment path> to the function
      // with the remainder in ?subPath=. Handy for API proxies that forward
      // arbitrary upstream paths (e.g. /v1/resource/.../items).
      const cleanRel = entry.replace(/\.m?js$/, "");
      if (perEntry[entry]?.catchAll) {
        routes.push({
          src: `^/${reEscape(p.name)}/${reEscape(cleanRel)}/(.+?)/?$`,
          dest: `/${p.name}/${cleanRel}?subPath=$1`,
        });
      }
    }
  }

  // Filesystem fallback (serves static files + node-functions automatically by path)
  routes.push({ handle: "filesystem" });

  // SPA fallback for server projects — Nitro serves the SPA shell
  for (const p of serverProjects) {
    routes.push({
      src: `/${p.name}(?:/((?!api/).*))?`,
      dest: `/${p.name}/__fallback`,
    });
  }

  const config = { version: 3, cleanUrls: true, trailingSlash: true, routes };
  if (Array.isArray(crons) && crons.length > 0) {
    config.crons = crons;
  }

  await writeFile(
    join(VERCEL_OUTPUT, "config.json"),
    JSON.stringify(config, null, 2)
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

  // Build all projects in parallel
  console.log(`Found ${projects.length} project(s) — building in parallel:\n`);
  const buildStart = Date.now();

  const results = await Promise.allSettled(
    projects.map(async (p) => {
      const t0 = Date.now();
      const { logs, crons } = await buildProject(p.name, p.dir, p.config);
      return { ms: Date.now() - t0, logs, crons };
    })
  );

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

  // Assembly phase: populate .vercel/output/
  console.log("Assembling Vercel Build Output API v3 structure...\n");

  for (const p of projects) {
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
  await buildLandingPage(projects, externals);
  console.log("\nLanding page generated.");

  // Copy favicon if exists
  const faviconSrc = join(ROOT, "public", "favicon.ico");
  if (existsSync(faviconSrc)) {
    await cp(faviconSrc, join(VERCEL_OUTPUT, "static", "favicon.ico"));
  }

  // Generate .vercel/output/config.json
  await generateVercelConfig(projects, allCrons);
  console.log(`Vercel config generated${allCrons.length > 0 ? ` (${allCrons.length} cron(s))` : ""}.`);

  console.log(`\nBuild complete → .vercel/output/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
