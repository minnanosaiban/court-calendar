import {
  json, newId, rowToEvent, EVENT_COLS, EVENT_FROM, resolveCaseId,
  getIdentity, authorizeWrite,
} from "../_common.js";

// 一覧（誰でも閲覧可）。事件名も JOIN して返す
export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare(`SELECT ${EVENT_COLS} ${EVENT_FROM} ORDER BY e.date, e.time`)
    .all();
  return json((results || []).map(rowToEvent));
}

// 追加（書き込み権限が必要）。
// 事件は caseId か事件名（case）で指定する。知らない事件名なら、その名前で事件を新しく起こす。
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const date = String(body.date || "").trim();
  if (!date) return json({ error: "期日は必須です" }, 400);
  const caseId = await resolveCaseId(env, body, id.email);
  if (!caseId) return json({ error: "事件名は必須です" }, 400);

  const ev = {
    id: body.id ? String(body.id) : newId("e"),
    case_id: caseId,
    date,
    time: String(body.time || "").trim(),
    type: String(body.type || "").trim(),
    court: String(body.court || "").trim(),
    place: String(body.place || "").trim(),
    open: body.open === false ? 0 : 1,
    level: String(body.level || "").trim(),
  };
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO events (id, case_id, date, time, type, court, place, open, level,
                         created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(ev.id, ev.case_id, ev.date, ev.time, ev.type, ev.court, ev.place, ev.open, ev.level,
         id.email, id.email, now).run();

  const row = await env.DB.prepare(`SELECT ${EVENT_COLS} ${EVENT_FROM} WHERE e.id = ?`).bind(ev.id).first();
  return json(rowToEvent(row), 201);
}
