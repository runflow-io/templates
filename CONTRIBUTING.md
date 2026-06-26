# Contributing

Thanks for adding to **Runflow Templates**. Each folder under `projects/` is an
independent template that builds and deploys with the rest of the hub.

## Add a template

1. Create a folder under `projects/<name>/`.
   - `<name>` becomes the public URL path, so use a slug: **lowercase letters,
     digits, and hyphens only** (`^[a-z0-9][a-z0-9-]*$`). The build skips
     anything else.
2. Add your files. If it needs a build step, include a `package.json` (and a
   committed lockfile — see "Reproducible installs" below).
3. Run `npm run build` from the repo root and confirm your template appears
   under `.vercel/output/static/<name>/`.
4. Open a PR. CI runs `npm run build`; it must pass.

The build auto-detects the type (`static`, `vite`, `next`, `nuxt`,
`nuxt-server`, `custom`, `node-functions`) — see the [README](README.md) for the
detection table and `template.config.json` options.

## Ground rules

- **No secrets, ever.** No API keys, tokens, real customer/internal data,
  private hostnames, or internal screenshots — in files *or* commit history.
  This repo is public and indexable.
- **Templates run code at build.** Your `package.json` scripts and any
  `template.config.json` `buildCmd` execute in CI and on the deploy host. Keep
  them to what your template needs; reviewers will scrutinize build commands.
- **Reproducible installs.** Commit a lockfile (`package-lock.json` /
  `pnpm-lock.yaml` / `bun.lockb`) so builds are deterministic.
- **Keep it self-contained.** A template should build from its own folder with
  no reach outside it.

## Commit / PR norms

- Small, focused commits with clear messages (Conventional Commits style:
  `feat:`, `fix:`, `chore:`, `docs:`).
- Fill out the PR template checklist.
- Changes to `build*.mjs`, `dev*.mjs`, `.github/**`, `vercel.json`, or
  `externals.json` require maintainer (CODEOWNERS) review.

## Local development

```bash
npm install        # hub deps (esbuild)
npm run dev        # build + serve at http://localhost:3000
```
