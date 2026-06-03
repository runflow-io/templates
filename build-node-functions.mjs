// Build helpers for the `node-functions` proto.config.json type.
// Bundles each Vercel function entry with esbuild, writes the .vc-config.json,
// and returns the cron entries to be merged into the hub's root config.json.

import { build as esbuildBuild } from "esbuild";
import { mkdir, writeFile, rm, cp } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { join, dirname, relative, isAbsolute } from "node:path";
import { spawn } from "node:child_process";

function runShell(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", cmd], { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => settle(reject, new Error(`spawn failed for "${cmd}": ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) settle(reject, new Error(`exit ${code}\n${stderr || stdout}`));
      else settle(resolve, { stdout, stderr });
    });
  });
}

function detectInstallCmd(projectDir) {
  // Prefer reproducible installs (`npm ci`/`--frozen-lockfile`) so a build doesn't
  // silently float to a fresh patch release inside the same semver range.
  if (existsSync(join(projectDir, "package-lock.json"))) return "npm ci";
  if (existsSync(join(projectDir, "pnpm-lock.yaml"))) return "pnpm install --frozen-lockfile";
  if (existsSync(join(projectDir, "bun.lockb"))) return "bun install --frozen-lockfile";
  return "npm install";
}

// Reject path config that would let a malicious proto.config.json reach outside
// of its own project directory (defence in depth — proto.config.json is in-repo
// and reviewed, but the helper shouldn't trust unsanitized paths). For paths
// that already exist on disk we also resolve symlinks so they can't tunnel out.
function ensureInsideProject(projectDir, relPath, label) {
  if (typeof relPath !== "string" || relPath.length === 0) return;
  if (isAbsolute(relPath)) {
    throw new Error(`proto.config.json: ${label} must be relative; got "${relPath}"`);
  }
  const resolved = join(projectDir, relPath);
  const lexicalRel = relative(projectDir, resolved);
  if (lexicalRel.startsWith("..") || isAbsolute(lexicalRel)) {
    throw new Error(`proto.config.json: ${label} "${relPath}" escapes the project directory`);
  }
  if (existsSync(resolved)) {
    let realProject, realResolved;
    try {
      realProject = realpathSync(projectDir);
      realResolved = realpathSync(resolved);
    } catch {
      return; // symlink target missing — let downstream code surface the real error
    }
    const physicalRel = relative(realProject, realResolved);
    if (physicalRel.startsWith("..") || isAbsolute(physicalRel)) {
      throw new Error(`proto.config.json: ${label} "${relPath}" resolves outside the project directory via symlink`);
    }
  }
}

const DEFAULT_RUNTIME = "nodejs22.x";

function vcConfig({ runtime, handler, maxDuration, memory }) {
  return {
    runtime: runtime || DEFAULT_RUNTIME,
    handler: handler || "index.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: true,
    supportsResponseStreaming: false,
    ...(maxDuration ? { maxDuration } : {}),
    ...(memory ? { memory } : {}),
  };
}

export async function bundleNodeFunction({ projectDir, entry, outDir, maxDuration, memory }) {
  const absEntry = join(projectDir, entry);
  if (!existsSync(absEntry)) {
    throw new Error(`function entry not found: ${absEntry}`);
  }
  await mkdir(outDir, { recursive: true });
  await esbuildBuild({
    entryPoints: [absEntry],
    outfile: join(outDir, "index.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    minify: true,
    sourcemap: false,
    legalComments: "none",
    logLevel: "warning",
    banner: {
      js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
    },
  });
  await writeFile(
    join(outDir, ".vc-config.json"),
    JSON.stringify(vcConfig({ maxDuration, memory }), null, 2),
  );
}

export async function emitNodeFunctionsProject({ projectDir, projectName, distTarget, config }) {
  const logs = [];

  // Validate path inputs so a misbehaving proto.config.json can't escape the project.
  if (config.dashboard) {
    ensureInsideProject(projectDir, config.dashboard.dir || ".", "dashboard.dir");
    ensureInsideProject(projectDir, config.dashboard.outputDir || "dist", "dashboard.outputDir");
  }
  const fnConfig = config.functions || {};
  const entries = Array.isArray(fnConfig.entries) ? fnConfig.entries : [];
  entries.forEach((entry, i) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`proto.config.json: functions.entries[${i}] must be a non-empty string; got ${JSON.stringify(entry)}`);
    }
    ensureInsideProject(projectDir, entry, `functions.entries[${i}]`);
  });

  const installCmd = detectInstallCmd(projectDir);
  logs.push(`(install) ${installCmd}`);
  const installRes = await runShell(installCmd, { cwd: projectDir });
  if (installRes.stderr) logs.push(installRes.stderr.trim());

  if (config.dashboard) {
    const buildCmd = config.dashboard.buildCmd || "npm run build";
    const cwd = join(projectDir, config.dashboard.dir || ".");
    logs.push(`(dashboard) ${buildCmd} (cwd=${cwd})`);
    const env = { ...process.env, BASE_PATH: `/${projectName}` };
    const buildRes = await runShell(buildCmd, { cwd, env });
    if (buildRes.stderr) logs.push(buildRes.stderr.trim());
    // Default outputDir is relative to the build cwd (which may be a subdir),
    // not the project root — otherwise a `dashboard.dir: "dashboard"` config
    // with no explicit outputDir would silently miss the built artifact.
    const built = config.dashboard.outputDir
      ? join(projectDir, config.dashboard.outputDir)
      : join(cwd, "dist");
    if (existsSync(built) && distTarget) {
      await mkdir(dirname(distTarget), { recursive: true });
      await cp(built, distTarget, { recursive: true });
    }
  }

  const fnRoot = join(projectDir, ".vercel", "output", "functions", projectName);
  if (existsSync(fnRoot)) {
    await rm(fnRoot, { recursive: true });
  }
  for (const entry of entries) {
    const cleanRel = entry.replace(/\.m?js$/, "");
    const outDir = join(fnRoot, cleanRel + ".func");
    const perEntry = (fnConfig.perEntry && fnConfig.perEntry[entry]) || {};
    await bundleNodeFunction({
      projectDir,
      entry,
      outDir,
      maxDuration: perEntry.maxDuration ?? fnConfig.maxDuration ?? 60,
      memory: perEntry.memory ?? fnConfig.memory ?? 1024,
    });
    logs.push(`(function) ${entry} → ${cleanRel}.func`);
  }
  return { logs, crons: collectCronEntries(projectName, config) };
}

export function collectCronEntries(projectName, config) {
  const list = Array.isArray(config?.crons) ? config.crons : [];
  return list.map((c, index) => {
    if (!c || typeof c.path !== "string" || c.path.length === 0 || typeof c.schedule !== "string" || c.schedule.length === 0) {
      throw new Error(`proto.config.json: crons[${index}] must include both \`path\` and \`schedule\` strings`);
    }
    const prefixed = c.path.startsWith("/") ? `/${projectName}${c.path}` : `/${projectName}/${c.path}`;
    // Hub config emits trailingSlash:true, which 308-redirects function paths
    // without a slash. Vercel cron does NOT follow redirects, so register the
    // path with the slash already attached or every cron fire silently drops.
    const withSlash = prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
    return { path: withSlash, schedule: c.schedule };
  });
}

export async function copyNodeFunctionsArtifacts({ projectDir, projectName, vercelOutputRoot }) {
  const projectFnDir = join(projectDir, ".vercel", "output", "functions", projectName);
  if (!existsSync(projectFnDir)) return;
  await cp(projectFnDir, join(vercelOutputRoot, "functions", projectName), {
    recursive: true,
    dereference: true,
  });
}
