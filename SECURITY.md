# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, use
GitHub's private vulnerability reporting (the **Security → Report a
vulnerability** tab on this repo) or email **security@runflow.io**.

We aim to acknowledge reports within 3 business days.

## Scope

This repo is a **public template hosting hub**. The build orchestrator
(`build.mjs` / `build-node-functions.mjs`) and the CI pipeline are in scope.
Individual templates under `projects/` are examples — report issues in them too,
but treat their dependencies as third-party.

## Important notes for contributors

- **Templates execute code at build time.** Adding a folder under `projects/`
  means its `package.json` install scripts and build command run in CI and on
  the deploy host. Only the maintainers listed in `CODEOWNERS` can approve
  changes to build scripts and workflows.
- **Never commit secrets.** Real credentials, API keys, private endpoints, or
  internal hostnames must never appear in this public repo (including git
  history). Use `.env` locally (it is gitignored) and your host's environment
  settings in production. `CRON_SECRET` in `.env.example` is a placeholder.
- The auto-generated landing page and every hosted template are **public and
  indexable**. Do not put anything behind a "password" in client-side code and
  assume it is protected — it is not. Gate sensitive surfaces server-side.
