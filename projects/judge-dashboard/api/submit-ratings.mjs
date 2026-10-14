/* POST /judge-dashboard/api/submit-ratings/
   Persists one Notion row per rated image (voter / vote / feedback / image),
   then posts a single Slack notification with the totals and a link back to
   the Notion DB.

   Why Notion + Slack instead of just Slack: Runflow asset URLs expire after
   24h, so we re-upload the image bytes to Notion's File Upload API and store
   them on the row. The Slack post is just a heads-up — the durable record
   lives in the DB. */

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const UPLOAD_CONCURRENCY = 3;

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { message: "method not allowed" });

  const notionKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_VOTES_DATABASE_ID;
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!notionKey) return sendJson(res, 500, { message: "NOTION_API_KEY not set on server" });
  if (!databaseId) return sendJson(res, 500, { message: "NOTION_VOTES_DATABASE_ID not set on server" });
  if (!slackToken) return sendJson(res, 500, { message: "SLACK_BOT_TOKEN not set on server" });

  const body = await readJson(req);
  const judge = (body.judge_name || "").trim() || "anonymous";
  const company = (body.judge_company || "").trim();
  const submittedAt = body.submitted_at || new Date().toISOString();
  const inputs = body.inputs || {};
  const results = Array.isArray(body.results) ? body.results : [];
  const briefLabel = pickBriefLabel(inputs);
  const databaseUrl = `https://www.notion.so/${databaseId.replace(/-/g, "")}`;

  const rated = results.filter(r => r.rating === "like" || r.rating === "dislike");
  if (!rated.length) return sendJson(res, 400, { message: "no rated results in payload" });

  // Upload + create one Notion page per rated result, with bounded concurrency.
  const errors = [];
  const created = [];
  let cursor = 0;
  async function worker() {
    while (cursor < rated.length) {
      const idx = cursor++;
      const r = rated[idx];
      try {
        const tile = `H${r.hero_idx ?? "?"}·C${r.cut_idx ?? "?"}·${r.format ?? "?"}`;
        // Upload both the rated output AND the input hero in parallel so Goke
        // can correlate ratings back to what the workflow actually saw.
        const [fileUploadId, heroFileUploadId] = await Promise.all([
          r.image ? uploadImageToNotion(notionKey, r.image, `${tile}-output.png`) : null,
          r.hero_url ? uploadImageToNotion(notionKey, r.hero_url, `${tile}-hero.png`).catch(e => { console.warn(`hero upload failed for ${tile}:`, e?.message); return null; }) : null,
        ]);
        const page = await createNotionPage(notionKey, databaseId, {
          voter: judge,
          company,
          vote: r.rating,
          feedback: (r.feedback || "").trim(),
          fileUploadId,
          heroFileUploadId,
          heroSourceUrl: r.hero_url || "",
          prompt: (r.prompt || "").trim(),
          sourceUrl: r.image || "",
          tile,
          briefLabel,
          submittedAt,
          costUsd: typeof r.cost === "number" ? r.cost : null,
          runtimeSeconds: typeof r.duration_ms === "number" ? Math.round(r.duration_ms / 10) / 100 : null,
        });
        created.push(page.id);
      } catch (e) {
        errors.push({ tile: `H${r.hero_idx}·C${r.cut_idx}·${r.format}`, error: String(e?.message || e) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, rated.length) }, worker));

  // Slack notification — short, links to the DB.
  const likes = rated.filter(r => r.rating === "like").length;
  const dislikes = rated.length - likes;
  const sentiment = dislikes === 0 ? "all positive 🟢"
    : likes === 0 ? "all negative 🔴"
    : `${Math.round((likes / rated.length) * 100)}% positive`;
  const slackText =
    `:bust_in_silhouette: *${judge}*${company ? ` (${company})` : ""} voted on Contest #01` +
    ` — ${likes}👍 ${dislikes}👎  ·  ${sentiment}` +
    (briefLabel ? `  ·  brief: _${briefLabel}_` : "") +
    `\nFull board → <${databaseUrl}|Contest #01 · Judge Votes>` +
    (errors.length ? `\n_(${errors.length} row${errors.length === 1 ? "" : "s"} failed to save — check Vercel logs)_` : "");
  const slackChannel = process.env.SLACK_VOTE_CHANNEL || "#runflow-beta-request";
  const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${slackToken}`, "content-type": "application/json" },
    body: JSON.stringify({ channel: slackChannel, text: slackText }),
  });
  const slackJson = await slackRes.json().catch(() => ({}));
  const slackOk = slackRes.status === 200 && slackJson.ok;

  return sendJson(res, 200, {
    notion: { created: created.length, database_url: databaseUrl, errors },
    slack: slackOk ? { channel: slackChannel, ts: slackJson.ts } : { error: slackJson.error || `HTTP ${slackRes.status}` },
  });
}

function pickBriefLabel(inputs) {
  if (Array.isArray(inputs?.cuts) && inputs.cuts.length) {
    const l = (inputs.cuts[0].label || "").trim();
    if (l) return l;
  }
  return "";
}

/* Notion file upload: two-step. POST /file_uploads gets us an upload URL,
   then we POST multipart bytes to it. The returned id is what we attach to
   the page property. */
async function uploadImageToNotion(token, imageUrl, filename) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image ${imageUrl} → ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/png";

  const create = await fetch(`${NOTION_API_BASE}/file_uploads`, {
    method: "POST",
    headers: notionHeaders(token, true),
    body: JSON.stringify({}),
  });
  const createJson = await create.json().catch(() => ({}));
  if (!create.ok) throw new Error(`notion file_upload create: ${createJson.message || create.status}`);
  const uploadId = createJson.id;
  const sendUrl = createJson.upload_url;

  const form = new FormData();
  form.append("file", new Blob([buf], { type: contentType }), filename);
  const send = await fetch(sendUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    body: form,
  });
  const sendJsonResp = await send.json().catch(() => ({}));
  if (!send.ok || sendJsonResp.status === "failed") {
    throw new Error(`notion file_upload send: ${sendJsonResp.message || send.status}`);
  }
  return uploadId;
}

async function createNotionPage(token, databaseId, row) {
  const properties = {
    "Voter": { title: [{ text: { content: row.voter } }] },
    "Vote": { select: { name: row.vote } },
    "Submitted at": { date: { start: row.submittedAt } },
  };
  if (row.company) properties["Company"] = { rich_text: [{ text: { content: row.company.slice(0, 500) } }] };
  if (row.feedback) properties["Feedback"] = { rich_text: [{ text: { content: row.feedback.slice(0, 1900) } }] };
  if (row.tile) properties["Tile"] = { rich_text: [{ text: { content: row.tile } }] };
  if (row.briefLabel) properties["Brief label"] = { rich_text: [{ text: { content: row.briefLabel } }] };
  if (row.sourceUrl) properties["Source URL"] = { url: row.sourceUrl };
  if (row.heroSourceUrl) properties["Hero source URL"] = { url: row.heroSourceUrl };
  if (row.prompt) properties["Prompt"] = { rich_text: [{ text: { content: row.prompt.slice(0, 1900) } }] };
  if (row.costUsd != null) properties["Cost USD"] = { number: row.costUsd };
  if (row.runtimeSeconds != null) properties["Runtime s"] = { number: row.runtimeSeconds };
  if (row.fileUploadId) {
    properties["Image"] = {
      files: [{ name: row.tile || "image", type: "file_upload", file_upload: { id: row.fileUploadId } }],
    };
  }
  if (row.heroFileUploadId) {
    properties["Hero image"] = {
      files: [{ name: `${row.tile || "hero"}-hero`, type: "file_upload", file_upload: { id: row.heroFileUploadId } }],
    };
  }
  const res = await fetch(`${NOTION_API_BASE}/pages`, {
    method: "POST",
    headers: notionHeaders(token, true),
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`notion page create: ${json.message || res.status}`);
  return json;
}

function notionHeaders(token, withContentType) {
  const h = { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION };
  if (withContentType) h["content-type"] = "application/json";
  return h;
}

async function readJson(req) {
  if (req.body !== undefined) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
    return req.body || {};
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}
