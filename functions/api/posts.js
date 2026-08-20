import {
  json, rowToPost, getIdentity, authorizePost,
  POST_SUBJECTS, POST_VERBS, QUOTE_MAX,
} from "../_common.js";

// 投稿は events と結合して、事件名と期日の種別も一緒に返す
const SELECT = `
  SELECT p.id, p.event_id, p.subject, p.quote, p.verb, p.created_at,
         e.case_name, e.type, e.date
    FROM posts p
    JOIN events e ON e.id = p.event_id
   WHERE p.hidden = 0`;

function newId() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 一覧（誰でも閲覧可）。?event=<id> で1つの期日にしぼれる。
export async function onRequestGet({ request, env }) {
  const eventId = new URL(request.url).searchParams.get("event");
  const stmt = eventId
    ? env.DB.prepare(`${SELECT} AND p.event_id = ? ORDER BY e.date, p.created_at`).bind(eventId)
    : env.DB.prepare(`${SELECT} ORDER BY e.date, p.created_at`);
  const { results } = await stmt.all();
  return json((results || []).map(rowToPost));
}

// 投稿（傍聴に行った人なら誰でも。ただし文の形は固定、スパム対策あり）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!(await authorizePost(request, env, id))) {
    return json({ error: "投稿を受け付けられませんでした。時間をおいて試してください。" }, 403);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const eventId = String(body.eventId || "").trim();
  const subject = String(body.subject || "").trim();
  const verb = String(body.verb || "").trim();
  // 改行と前後の空白を落として1行にする
  const quote = String(body.quote || "").replace(/\s+/g, " ").trim();

  if (!POST_SUBJECTS.includes(subject)) return json({ error: "「誰が」を選んでください。" }, 400);
  if (!POST_VERBS.includes(verb)) return json({ error: "「何をした」を選んでください。" }, 400);
  if (!quote) return json({ error: "かぎ括弧の中を入力してください。" }, 400);
  if ([...quote].length > QUOTE_MAX) {
    return json({ error: `かぎ括弧の中は${QUOTE_MAX}字までです。` }, 400);
  }

  const ev = await env.DB.prepare(`SELECT id FROM events WHERE id = ?`).bind(eventId).first();
  if (!ev) return json({ error: "その期日が見つかりません。" }, 400);

  const post = {
    id: newId(),
    event_id: eventId,
    subject, quote, verb,
    created_at: new Date().toISOString(),
  };
  await env.DB.prepare(
    `INSERT INTO posts (id, event_id, subject, quote, verb, hidden, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).bind(post.id, post.event_id, post.subject, post.quote, post.verb, post.created_at).run();

  const row = await env.DB.prepare(`${SELECT} AND p.id = ?`).bind(post.id).first();
  return json(rowToPost(row), 201);
}
