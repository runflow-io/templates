// Runflow API client (browser).
//
// Auth: Bearer <RUNFLOW_API_KEY>. The user's key, stored in localStorage,
// is passed at call time. Runflow handles per-call billing on their side —
// the template never sees the user's money.

// Calls go through a same-origin proxy that forwards to https://api.runflow.io/v1
// server-side, sidestepping browser CORS. Locally this is Vite middleware
// (vite.config.ts). On Vercel (templates.runflow.io) the same URL is served by
// `api/runflow.mjs` as a catch-all function.
// `import.meta.env.BASE_URL` is "/" in dev and "/<project-name>/" when built
// inside the runflow-templates hub, so the prefix matches the deploy target.
const RUNFLOW_BASE = `${import.meta.env.BASE_URL}api/runflow`;

export class RunflowError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "RunflowError";
  }
}

async function runflowFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {},
  retries = 2
): Promise<any> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${RUNFLOW_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // Don't retry on auth/permission/validation errors — they won't pass on retry
        if (res.status === 401 || res.status === 403 || res.status === 422 || res.status === 400) {
          throw new RunflowError(
            `Runflow ${init.method || "GET"} ${path} -> ${res.status}: ${body.slice(0, 400)}`,
            res.status
          );
        }
        // Retry on 5xx, 429
        lastErr = new RunflowError(
          `Runflow ${init.method || "GET"} ${path} -> ${res.status}: ${body.slice(0, 400)}`,
          res.status
        );
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw lastErr;
      }
      return res.json();
    } catch (err) {
      // fetch() rejected (network / CORS / DNS / abort) — retry once or twice
      if (err instanceof RunflowError) throw err; // already handled above
      lastErr = err;
      const msg = (err as Error)?.message || String(err);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      // surface the actual cause — most often "Failed to fetch" = CORS or network
      throw new RunflowError(
        `Runflow ${init.method || "GET"} ${path} network error: ${msg}. ` +
          `If this persists, it may be a CORS rejection on the Runflow endpoint — open the browser DevTools Console for the exact reason.`,
        0
      );
    }
  }
  throw lastErr || new RunflowError(`Runflow ${path} failed`, 0);
}

// ---------- asset upload (browser → Runflow assets bucket) ----------

export async function uploadAsset(file: File | Blob, filename: string, apiKey: string): Promise<string> {
  const mime = (file as File).type || "image/jpeg";
  const size = (file as File).size;

  const created = await runflowFetch("/asset-uploads", apiKey, {
    method: "POST",
    body: JSON.stringify({ filename, mime_type: mime, size_bytes: size }),
  });
  const assetId = created.asset_id;
  const uploadUrl = created.upload_url;

  // presigned PUT (no auth header — auth is in the signed URL itself)
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mime },
    body: file,
  });
  if (!put.ok) {
    throw new RunflowError(`presigned PUT -> ${put.status}`, put.status);
  }

  const confirmed = await runflowFetch(
    `/asset-uploads/${assetId}/confirmations`,
    apiKey,
    { method: "POST", body: JSON.stringify({ folder_id: null }) }
  );
  return confirmed.url as string;
}

// ---------- Solution run + poll ----------

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "errored" | "canceled";

export async function runSolution(
  slug: string,
  input: Record<string, unknown>,
  apiKey: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number; clientRef?: string } = {}
): Promise<{ output: any }> {
  const { timeoutMs = 360_000, pollIntervalMs = 3000, clientRef } = opts;

  const start = await runflowFetch(`/models/${slug}/runs`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      input,
      client_ref: clientRef || `runflow-dtc-${Date.now()}`,
    }),
  });
  const runId: string = start.id || start.run_id;
  if (!runId) {
    throw new RunflowError(`No run id returned for ${slug}`);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await runflowFetch(`/runs/${runId}`, apiKey);
    const status: string = run.status_code || run.status;
    if (status === "succeeded") return run;
    if (status === "failed" || status === "errored" || status === "canceled") {
      throw new RunflowError(`${slug} ${status}: ${JSON.stringify(run.error || run).slice(0, 400)}`);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new RunflowError(`${slug} run ${runId} timed out`);
}

// ---------- output URL extraction ----------

export function firstUrl(run: { output?: any }): string | null {
  const out = run.output;
  if (!out) return null;
  if (typeof out === "string") return out;

  for (const k of ["image_url", "url", "output_url", "image"]) {
    const v = out[k];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  for (const k of ["image_urls", "outputs", "images"]) {
    const v = out[k];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.startsWith("http")) return item;
        if (item && typeof item === "object") {
          for (const k2 of ["url", "image_url"]) {
            if (typeof item[k2] === "string") return item[k2];
          }
        }
      }
    }
  }
  return null;
}

// ---------- download a remote image as a Blob (for ZIPing locally) ----------

// We route CDN URLs through the asset-proxy middleware to avoid CORS rejection
// on Runflow's image CDN domains. Vite middleware fetches the URL server-side
// and streams it back same-origin.
export async function downloadBlob(url: string): Promise<Blob> {
  const proxied = `${import.meta.env.BASE_URL}api/asset-proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxied);
  if (!res.ok) {
    throw new RunflowError(`asset-proxy ${url} -> ${res.status}`, res.status);
  }
  return res.blob();
}
