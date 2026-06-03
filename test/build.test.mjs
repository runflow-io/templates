import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVercelConfig, escapeHtml, safeHref, isValidProjectName, buildSitemap, buildRobotsTxt } from "../build.mjs";
import { collectCronEntries } from "../build-node-functions.mjs";

test("escapeHtml escapes HTML-significant characters", () => {
  assert.equal(escapeHtml(`<script>"&'`), "&lt;script&gt;&quot;&amp;&#39;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("safeHref allows internal paths and http(s), blocks scheme injection", () => {
  assert.equal(safeHref("/example-html/"), "/example-html/");
  assert.equal(safeHref("https://example.com"), "https://example.com");
  assert.equal(safeHref("http://example.com/x"), "http://example.com/x");
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.equal(safeHref("data:text/html,x"), "#");
  assert.equal(safeHref("ftp://example.com"), "#");
});

test("isValidProjectName accepts slugs, rejects unsafe names", () => {
  assert.ok(isValidProjectName("example-html"));
  assert.ok(isValidProjectName("a1"));
  assert.ok(!isValidProjectName("Bad_Name"));   // uppercase + underscore
  assert.ok(!isValidProjectName("../evil"));     // traversal
  assert.ok(!isValidProjectName("a;rm -rf /"));  // shell metachars
  assert.ok(!isValidProjectName("-leading"));    // must start alnum
  assert.ok(!isValidProjectName(""));
});

test("buildVercelConfig: static-only hub is just a filesystem handler", () => {
  const cfg = buildVercelConfig([{ name: "a", config: { type: "static" } }], []);
  assert.equal(cfg.version, 3);
  assert.equal(cfg.cleanUrls, true);
  assert.equal(cfg.trailingSlash, true);
  assert.deepEqual(cfg.routes, [{ handle: "filesystem" }]);
  assert.equal(cfg.crons, undefined);
});

test("buildVercelConfig: node-functions [id] entry emits a subId rewrite before filesystem", () => {
  const cfg = buildVercelConfig(
    [{ name: "api", config: { type: "node-functions", functions: { entries: ["api/reports/[id].mjs"] } } }],
    []
  );
  assert.deepEqual(cfg.routes[0], {
    src: "^/api/api/reports/([^/]+)/?$",
    dest: "/api/api/reports?subId=$1",
  });
  assert.deepEqual(cfg.routes.at(-1), { handle: "filesystem" });
});

test("buildVercelConfig: catchAll entry emits a subPath rewrite", () => {
  const cfg = buildVercelConfig(
    [{ name: "p", config: { type: "node-functions", functions: { entries: ["api/proxy.mjs"], perEntry: { "api/proxy.mjs": { catchAll: true } } } } }],
    []
  );
  assert.ok(cfg.routes.some((r) => r.src === "^/p/api/proxy/(.+?)/?$" && r.dest === "/p/api/proxy?subPath=$1"));
});

test("buildVercelConfig: rejects multi-segment dynamic entries (fail fast)", () => {
  assert.throws(
    () => buildVercelConfig([{ name: "p", config: { type: "node-functions", functions: { entries: ["api/users/[uid]/posts/[pid].mjs"] } } }], []),
    /multiple dynamic/
  );
});

test("buildVercelConfig: nuxt-server gets api + SPA fallback routes around the filesystem handler", () => {
  const cfg = buildVercelConfig([{ name: "app", config: { type: "nuxt-server" } }], []);
  assert.deepEqual(cfg.routes[0], { src: "/app/api/(.*)", dest: "/app/__fallback" });
  const fsIdx = cfg.routes.findIndex((r) => r.handle === "filesystem");
  const spaIdx = cfg.routes.findIndex((r) => r.src === "/app(?:/((?!api/).*))?");
  assert.ok(fsIdx >= 0 && spaIdx > fsIdx, "SPA fallback must come after the filesystem handler");
});

test("buildVercelConfig: crons are attached only when present", () => {
  const withCron = buildVercelConfig([{ name: "a", config: { type: "static" } }], [{ path: "/a/api/cron/", schedule: "*/5 * * * *" }]);
  assert.equal(withCron.crons.length, 1);
});

test("collectCronEntries prefixes project name and forces a trailing slash", () => {
  const crons = collectCronEntries("myproj", { crons: [{ path: "/api/cron/run", schedule: "*/5 * * * *" }] });
  assert.deepEqual(crons, [{ path: "/myproj/api/cron/run/", schedule: "*/5 * * * *" }]);
});

test("collectCronEntries throws when a cron is missing path or schedule", () => {
  assert.throws(() => collectCronEntries("p", { crons: [{ path: "/x" }] }), /schedule/);
});

test("buildSitemap lists the landing + project roots and skips noindex projects", () => {
  const xml = buildSitemap(
    "https://x.test",
    [{ name: "a", config: {} }, { name: "b", config: { noindex: true } }],
    new Set(["b"])
  );
  assert.ok(xml.includes("<loc>https://x.test/</loc>"));
  assert.ok(xml.includes("<loc>https://x.test/a/</loc>"));
  assert.ok(!xml.includes("/b/"));
});

test("buildRobotsTxt allows all and includes Sitemap only when site URL is known", () => {
  assert.ok(buildRobotsTxt("https://x.test").includes("Sitemap: https://x.test/sitemap.xml"));
  assert.ok(!buildRobotsTxt("").includes("Sitemap:"));
});
