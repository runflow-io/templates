// GET /api/asset-proxy?url=<encoded https url>
//
// Server-side fetch of an arbitrary image URL, streamed back same-origin so
// the browser doesn't trip on CORS when downloading Runflow's generated
// images for display + ZIPing.
//
// Production equivalent of the assetProxyPlugin in vite.config.ts.

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://x").searchParams.get("url");
    if (!url || !/^https?:\/\//.test(url)) {
      res.status(400);
      res.end("bad url");
      return;
    }
    const upstream = await fetch(url);
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.status(502);
    res.end(`asset-proxy error: ${e?.message || String(e)}`);
  }
}
