// Catch-all proxy: /api/runflow/<path> -> https://api.runflow.io/v1/<path>
//
// The runflow-templates hub routes this with `catchAll: true`, capturing the
// remainder of the URL into ?subPath=. We forward the request body, method,
// content-type, and Authorization header verbatim (the React app holds the
// user's Runflow key in localStorage and passes it on every call).
//
// Runflow's API doesn't return CORS headers, so this same-origin function is
// the production equivalent of the Vite dev-server middleware in vite.config.ts.

const UPSTREAM = "https://api.runflow.io/v1";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://x");
    const subPath = url.searchParams.get("subPath") || "";
    url.searchParams.delete("subPath");
    const qs = url.searchParams.toString();
    const target = `${UPSTREAM}/${subPath}${qs ? `?${qs}` : ""}`;

    const headers = {};
    if (req.headers["authorization"]) headers["authorization"] = req.headers["authorization"];
    if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];

    const init = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      // Vercel's Node runtime parses JSON bodies onto req.body. Re-serialize for
      // forwarding. For non-JSON bodies the upstream call will fail at Runflow
      // and surface a clear error — the template only sends JSON today.
      if (req.body !== undefined) {
        init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }
    }

    const upstream = await fetch(target, init);
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.status(502);
    res.end(`runflow-proxy error: ${e?.message || String(e)}`);
  }
}
