/* POST /judge-dashboard/api/submit-to-slack/
   Posts a judge's ratings to the configured Slack channel.
   Note: serve.py also wrote a votes.jsonl on disk — on Vercel the function
   filesystem is read-only, so the durable record is just the Slack post. */

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { message: "method not allowed" });
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return sendJson(res, 500, { message: "SLACK_BOT_TOKEN not set on server" });
  const channel = process.env.SLACK_VOTE_CHANNEL || "#runflow-beta-request";

  const body = await readJson(req);
  const judge = body.judge_name || "(anonymous)";
  const summary = body.summary || {};
  const results = Array.isArray(body.results) ? body.results : [];
  const inputs = body.inputs || {};

  const liked = results.filter(r => r.rating === "like");
  const disliked = results.filter(r => r.rating === "dislike");
  const unrated = results.length - liked.length - disliked.length;
  const totalCost = summary.total_cost || 0;

  const header =
    `:bust_in_silhouette: *${judge}* just submitted ratings for *Contest #01 · Brand-consistent ad variants*`;
  const line =
    `👍 *${liked.length}* liked  ·  👎 *${disliked.length}* disliked  ·  *${unrated}* unrated` +
    `  ·  ${summary.total_generated ?? "?"} total outputs  ·  $${Number(totalCost).toFixed(3)} spent`;

  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: header } },
    { type: "section", text: { type: "mrkdwn", text: line } },
  ];
  if (disliked.length) {
    const lines = disliked.slice(0, 12).map(r => {
      const tag = `H${r.hero_idx ?? "?"}·C${r.cut_idx ?? "?"}·${r.format ?? "?"}`;
      const fb = (r.feedback || "").trim().replace(/\n/g, " ");
      return `• \`${tag}\`  ${fb ? fb : "_(no feedback left)_"}`;
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Dislikes:*\n" + lines.join("\n") } });
  }
  if (liked.length) {
    const tags = liked.slice(0, 24).map(r => `\`H${r.hero_idx ?? "?"}·C${r.cut_idx ?? "?"}·${r.format ?? "?"}\``);
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Likes:* " + tags.join(" ") } });
  }
  const cuts = Array.isArray(inputs.cuts) ? inputs.cuts : [];
  if (cuts.length) {
    const cutLines = cuts.map((c, i) => `  ${i + 1}. *${c.label ?? "—"}* — ${c.headline ?? "—"} / ${c.subhead ?? "—"}`);
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Brief used:*\n" + cutLines.join("\n") } });
  }

  const upstream = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      channel,
      text: `${judge} submitted ratings — ${liked.length}👍 ${disliked.length}👎`,
      blocks,
    }),
  });
  const resp = await upstream.json().catch(() => ({}));
  if (upstream.status !== 200 || !resp.ok) {
    return sendJson(res, 502, { message: `slack error: ${resp.error || upstream.status}`, detail: resp });
  }
  return sendJson(res, 200, { channel, ts: resp.ts });
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
