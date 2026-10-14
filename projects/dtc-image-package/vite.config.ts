import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Runflow's API doesn't return CORS headers, so the browser can't call it
// directly. Vite proxies two things server-side:
//   /api/runflow/*       → https://api.runflow.io/v1/*
//   /api/asset-proxy?url → arbitrary CDN URL (used to download generated
//                          images into the browser for display + ZIPing)
//
// Both work identically on localhost and Replit.

// Generic asset-proxy plugin: GET /api/asset-proxy?url=<encoded url>
// fetches the URL server-side and streams it back to the browser, side-
// stepping browser CORS on the destination.
function assetProxyPlugin(): Plugin {
  return {
    name: "dtc-ad-builder-asset-proxy",
    configureServer(server) {
      server.middlewares.use("/api/asset-proxy", async (req, res) => {
        try {
          const url = new URL(req.url || "/", "http://x").searchParams.get("url");
          if (!url || !/^https?:\/\//.test(url)) {
            res.statusCode = 400;
            res.end("bad url");
            return;
          }
          const upstream = await fetch(url);
          res.statusCode = upstream.status;
          const ct = upstream.headers.get("content-type");
          if (ct) res.setHeader("content-type", ct);
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.end(buf);
        } catch (e) {
          res.statusCode = 502;
          res.end(`asset-proxy error: ${(e as Error).message}`);
        }
      });
    },
  };
}

// When built inside the runflow-templates hub, `BASE_PATH` is set to
// `/<project-name>` and the app is served at templates.runflow.io/<name>/.
// Locally (`npm run dev`) the env var is unset and we serve at /.
const basePath = process.env.BASE_PATH ? `${process.env.BASE_PATH}/` : "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), assetProxyPlugin()],
  server: {
    // host: true binds 0.0.0.0 so Replit / Codespaces / Docker can proxy the dev server.
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api/runflow": {
        target: "https://api.runflow.io",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/runflow/, "/v1"),
      },
    },
  },
});
