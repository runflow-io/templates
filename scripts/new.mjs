#!/usr/bin/env node
/**
 * Scaffold a new template under projects/.
 *
 *   npm run new -- <name> <type>
 *   npm run new                 # interactive
 *
 * <type> is one of: static (default), vite, next, nuxt, nuxt-server,
 * custom, node-functions.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const PROJECTS = join(ROOT, "projects");
const TYPES = ["static", "vite", "next", "nuxt", "nuxt-server", "custom", "node-functions"];
const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/;

let [name, type] = argv.slice(2);

if (!name || !type) {
  const rl = createInterface({ input: stdin, output: stdout });
  if (!name) name = (await rl.question("Template name (slug): ")).trim();
  if (!type) type = (await rl.question(`Type [${TYPES.join(" / ")}] (static): `)).trim() || "static";
  rl.close();
}

if (!VALID_NAME.test(name)) {
  console.error(`✗ Invalid name "${name}" — use lowercase letters, digits, and hyphens (e.g. my-template).`);
  exit(1);
}
if (!TYPES.includes(type)) {
  console.error(`✗ Unknown type "${type}". Choose one of: ${TYPES.join(", ")}`);
  exit(1);
}

const dir = join(PROJECTS, name);
if (existsSync(dir)) {
  console.error(`✗ projects/${name} already exists.`);
  exit(1);
}

for (const [rel, content] of Object.entries(stubs(name, type))) {
  const full = join(dir, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

console.log(`✓ Created projects/${name}/ (${type})`);
console.log(`  Next: ${needsInstall(type) ? `cd projects/${name} && npm install, then ` : ""}npm run build`);

// --- stubs ------------------------------------------------------------------

function needsInstall(t) {
  return ["vite", "next", "nuxt", "nuxt-server", "custom", "node-functions"].includes(t);
}

const SCHEMA_REF = "../../template.config.schema.json";

// Shared brand-styled page used by the static + vite stubs.
function htmlStub(title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Outfit',-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;background:#09090B;color:#FAFAFA;max-width:600px;margin:2rem auto;padding:0 1rem}
    h1{font-weight:800;letter-spacing:-0.04em;margin-bottom:.75rem}
    h1 span{color:#FBBF24}
    p{color:#A1A1AA;line-height:1.6}
  </style>
</head>
<body>
  <h1>${title} <span>·</span> Runflow</h1>
  <p>New template scaffolded with <code>npm run new</code>. Edit me.</p>
</body>
</html>
`;
}

function pkg(extra) {
  return JSON.stringify({ name, private: true, ...extra }, null, 2) + "\n";
}

function config(obj) {
  return JSON.stringify({ $schema: SCHEMA_REF, ...obj }, null, 2) + "\n";
}

function stubs(name, type) {
  switch (type) {
    case "static":
      return { "index.html": htmlStub(name) };

    case "vite":
      return {
        "package.json": pkg({
          scripts: { dev: "vite", build: "vite build" },
          devDependencies: { vite: "^5.0.0" },
        }),
        "index.html": `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${name}</title></head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
`,
        "src/main.js": `document.querySelector("#app").innerHTML = "<h1>${name} · Runflow</h1><p>Vite template. Edit src/main.js.</p>";\n`,
      };

    case "next":
      return {
        "package.json": pkg({
          scripts: { dev: "next dev", build: "next build" },
          dependencies: { next: "^15.5.0", react: "^19.0.0", "react-dom": "^19.0.0" },
        }),
        "next.config.mjs": `/** @type {import("next").NextConfig} */
const config = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: { unoptimized: true },
  outputFileTracingRoot: import.meta.dirname,
};
export default config;
`,
        "app/layout.jsx": `export const metadata = { title: "${name}" };
export default function RootLayout({ children }) {
  return (<html lang="en"><body style={{ fontFamily: "system-ui", background: "#09090B", color: "#FAFAFA", maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}>{children}</body></html>);
}
`,
        "app/page.jsx": `export default function Page() {
  return (<div><h1 style={{ fontWeight: 800 }}>${name} · Runflow</h1><p style={{ color: "#A1A1AA" }}>Next.js template. Edit app/page.jsx.</p></div>);
}
`,
      };

    case "nuxt":
    case "nuxt-server": {
      const files = {
        "package.json": pkg({
          scripts: { dev: "nuxi dev", build: "nuxi build" },
          dependencies: { nuxt: "^3.13.0" },
        }),
        "app.vue": `<template>
  <div style="font-family:system-ui;background:#09090B;color:#FAFAFA;max-width:600px;margin:2rem auto;padding:0 1rem">
    <h1 style="font-weight:800">${name} · Runflow</h1>
    <p style="color:#A1A1AA">Nuxt template. Edit app.vue.</p>
  </div>
</template>
`,
      };
      if (type === "nuxt-server") {
        files["server/api/hello.ts"] = `export default defineEventHandler(() => ({ hello: "${name}" }));\n`;
      }
      return files;
    }

    case "custom":
      return {
        "template.config.json": config({ type: "custom", title: name, outputDir: "dist" }),
        "package.json": pkg({ scripts: { build: "node build.js" } }),
        "build.js": `import { mkdir, writeFile } from "node:fs/promises";
// BASE_PATH (=/<name>) is provided by the hub; use it for asset prefixes.
const base = process.env.BASE_PATH || "";
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", \`<!DOCTYPE html><title>${name}</title><h1>${name} · Runflow</h1><p>Custom build at base \${base}.</p>\`);
`,
      };

    case "node-functions":
      return {
        "template.config.json": config({
          type: "node-functions",
          title: name,
          dashboard: { dir: ".", buildCmd: "npm run build", outputDir: "dist" },
          functions: { entries: ["api/hello.mjs"], memory: 512, maxDuration: 30 },
        }),
        "package.json": pkg({ scripts: { build: "node build.js" } }),
        "build.js": `import { mkdir, writeFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", \`<!DOCTYPE html><title>${name}</title><h1>${name} · Runflow</h1><p>Dashboard. Calls <a href="api/hello">api/hello</a>.</p>\`);
`,
        "api/hello.mjs": `export default function handler(req, res) {
  res.status(200).json({ hello: "${name}", time: new Date().toISOString() });
}
`,
      };

    default:
      return { "index.html": htmlStub(name) };
  }
}
