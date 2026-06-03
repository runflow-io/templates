# prototypes-hub

Multi-framework prototype hosting hub.

## Architecture

Each folder under `projects/` is an independent prototype that gets built and
deployed as a path on a single deployment.

```
/              → landing page (auto-generated index)
/example-html  → projects/example-html/
/my-prototype  → projects/my-prototype/
```

The build orchestrator (`build.mjs`) scans `projects/`, detects each project's
type, builds them in parallel, and assembles everything into `.vercel/output/`
(Build Output API v3). `dev.mjs` runs that build then serves it on `:3000`.

## Commands

- `npm install` — install hub deps (esbuild)
- `npm run build` — build all projects into `.vercel/output/`
- `npm run dev` — build + serve locally on `:3000`

## Project types

| Type | Detection | Build |
|------|-----------|-------|
| `static` | No package.json or no build script | Copied as-is |
| `vite` | Has `vite` in deps | `vite build --base /<name>/` |
| `next` | Has `next` in deps | `next build` with static export |
| `nuxt` | Has `nuxt` in deps | `nuxi generate` with base URL |
| `nuxt-server` | Has `nuxt` + `server/` dir | Nitro Vercel preset (SSR + functions) |
| `custom` | Build script + `proto.config.json` | `npm run build` |
| `node-functions` | `proto.config.json` `"type": "node-functions"` | esbuild-bundled functions + static dashboard + crons (see README). Opt into multi-segment catch-all routing per function via `functions.perEntry["api/proxy.mjs"] = { catchAll: true }`. |

## Adding a prototype

1. Create `projects/<name>/`.
2. Add project files (HTML, or a `package.json` with framework deps).
3. For framework projects: `cd projects/<name> && npm install`.
4. `npm run build` to test.

## Plans + design docs

Plans live under `docs/plans/<stage>/<plan>/` where `<stage>` is one of `todo`,
`progress`, `done`. The index is at `docs/plans/index.md`. Each plan folder
typically holds a `design.md` plus any plan-specific notes (deploy steps,
screenshots, follow-ups). When a plan changes stage, **move** its folder — don't
duplicate — and keep the index in sync.

Use this layout exclusively for plans; don't introduce parallel doc structures.
