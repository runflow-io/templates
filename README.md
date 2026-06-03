# runflow-templates

A hub for Runflow templates and demos. Each folder under `projects/` is an independent template — plain HTML, React, Vue, Nuxt, Next.js, whatever — and they all build and deploy together behind a single origin, each served at its own path.

```
/                 → auto-generated index of all templates
/example-html     → projects/example-html/   (plain HTML)
/example-next     → projects/example-next/   (Next.js static export)
```

---

## Quick start

```bash
# Install hub dependencies (esbuild, used by the build orchestrator)
npm install

# Build everything into .vercel/output/
npm run build

# Build + serve locally at http://localhost:3000
npm run dev
```

---

## Adding a new template

1. Create a folder in `projects/` with your project files.
2. If it needs a build step (React, Vue, Next, Nuxt, etc.), include a `package.json`.
3. Run `npm run build` from the root — it auto-detects the type and builds everything.

That's it. The folder name becomes the URL path (`projects/my-thing/` → `/my-thing/`).

### Project type detection

| Type | How it's detected | Build action |
|------|-------------------|--------------|
| `static` | No `package.json`, or no build script | Files copied as-is |
| `vite` | `vite` in dependencies | `vite build --base /<name>/` |
| `next` | `next` in dependencies | `next build` (static export) |
| `nuxt` | `nuxt` in dependencies | `nuxi generate` (static generation) |
| `nuxt-server` | `nuxt` + a `server/` directory | Nuxt with `NITRO_PRESET=vercel` (server functions) |
| `custom` | Build script + `template.config.json` | `npm run build` + copy output |
| `node-functions` | `template.config.json` with `"type": "node-functions"` | esbuild-bundled serverless functions + a static dashboard + cron registration |

The right base path is passed to each build via an env var so assets resolve
under `/<name>/`:

- **next** → `NEXT_PUBLIC_BASE_PATH=/<name>`
- **nuxt** / **nuxt-server** → `NUXT_APP_BASE_URL=/<name>/`
- **vite** → `--base /<name>/`
- **custom** → `BASE_PATH=/<name>`

### Custom projects

For frameworks not auto-detected, add a `template.config.json`:

```json
{
  "type": "custom",
  "title": "My Template",
  "outputDir": "build"
}
```

The `BASE_PATH` env var (`/<project-name>`) is passed during build so you can set
asset prefixes. `outputDir` is where your build writes (defaults to `dist`).

### `node-functions` projects

For templates that need serverless functions plus a static dashboard (e.g. a
cron job that writes to a DB and a dashboard that reads from it), use
`node-functions`. The hub:

1. Installs your project deps (`npm ci` / `pnpm` / `bun` based on the lockfile).
2. Builds your dashboard via `dashboard.buildCmd`, copying its output to `dist/<name>/`.
3. Bundles each `functions.entries[*]` with esbuild into the Vercel Build Output
   API v3 function format (`.func/{index.mjs,.vc-config.json}`).
4. Registers any `crons[]` you declare into the deployment's root `config.json`.

Example `template.config.json`:

```json
{
  "type": "node-functions",
  "title": "My Template",
  "dashboard": {
    "dir": ".",
    "buildCmd": "npm run build",
    "outputDir": "dist"
  },
  "functions": {
    "entries": ["api/cron/run.mjs", "api/metrics.mjs"],
    "memory": 1024,
    "maxDuration": 300,
    "perEntry": {
      "api/metrics.mjs": { "maxDuration": 30, "memory": 512 }
    }
  },
  "crons": [
    { "path": "/api/cron/run", "schedule": "*/5 * * * *" }
  ]
}
```

Conventions:

- Function entries must be `.mjs` or `.js` and export a default `(req, res) => …`
  handler (Node helpers are enabled — `req.headers`, `res.status()`, `res.json()` work).
- Cron `path` is relative to the project; the hub prepends `/<project-name>` automatically.
- The dashboard build receives `BASE_PATH=/<project-name>` so it can set the right base URL.
- `dashboard.dir`, `dashboard.outputDir`, and every `functions.entries[*]` are
  validated to stay inside the project directory (no `..` escapes, no symlink tunnels).
- Sub-daily cron schedules require a paid host plan on most platforms.

**Dynamic + catch-all routing.** Single-segment dynamic routes use `[id].mjs`
(the parent function reads `?subId=`). For multi-segment catch-alls (e.g.
forwarding arbitrary upstream paths to an API proxy), set
`"functions.perEntry": { "api/proxy.mjs": { "catchAll": true } }`. The hub emits
a route mapping `/<name>/api/proxy/<arbitrary/multi/segment>` to the function
with the remainder in `?subPath=`; the handler splits that on `/`.

For cron-protected endpoints, set `CRON_SECRET` in your host env. The platform
injects `Authorization: Bearer ${CRON_SECRET}` on each fire and the handler
should validate it.

### Externally hosted templates

To list a template that lives on another origin in the landing index, add it to
`externals.json`:

```json
[
  { "name": "my-other-app", "url": "https://example.com", "title": "Lives elsewhere" }
]
```

These render as outbound links on the landing page. Default is an empty list.

---

## Deployment

Designed for **Vercel** (or any host that understands the Build Output API v3).

- **Build command**: `npm run build`
- **Output**: `.vercel/output/` (static assets + functions + `config.json`)
- **Clean URLs**: `/example-next/about` resolves to `…/about.html`
- **Indexable**: no `noindex` headers — pages are public and crawlable

### Setup on Vercel

1. Import the repo.
2. Framework Preset: **Other**.
3. Set `CRON_SECRET` in the project's environment variables if you use cron functions.
4. Push to your default branch — done.

---

## Project structure

```
runflow-templates/
├── build.mjs                 # Build orchestrator (detect → build → assemble)
├── build-node-functions.mjs  # esbuild bundling for node-functions projects
├── dev.mjs                   # Local dev server (build + serve on :3000)
├── dev-node-functions.mjs    # Dev-time dispatcher for node-functions
├── vercel.json               # Host config
├── externals.json            # Externally hosted templates (landing links)
├── package.json
├── docs/
│   └── plans/                # Plan/design docs by stage (todo/progress/done)
├── projects/
│   ├── example-html/         # Static HTML template
│   └── example-next/         # Next.js static-export template
└── .vercel/output/           # Build output (gitignored)
```
