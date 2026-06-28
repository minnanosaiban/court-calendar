import { json, rowToEvent, getIdentity, authorizeWrite } from "../_common.js";

const COLS = "id, case_name, date, time, type, place, note, created_by, updated_by, updated_at";

function newId() {
  return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 一覧（Access を通過した人は誰でも閲覧可）
export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare(`SELECT ${COLS} FROM events ORDER BY date, time`)
    .all();
  return json((results || []).map(rowToEvent));
}

// 追加（書き込み権限が必要）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const caseName = String(body.case || "").trim();
  const date = String(body.date || "").trim();
  if (!caseName || !date) return json({ error: "事件名と期日は必須です" }, 400);

  const ev = {
    id: body.id ? String(body.id) : newId(),
    case_name: caseName,
    date,
    time: String(body.time || "").trim(),
    type: String(body.type || "").trim(),
    place: String(body.place || "").trim(),
    note: String(body.note || "").trim(),
    created_by: id.email,
    updated_by: id.email,
    updated_at: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO events
       (id, case_name, date, time, type, place, note, created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ev.id, ev.case_name, ev.date, ev.time, ev.type, ev.place, ev.note,
    ev.created_by, ev.updated_by, ev.updated_at
  ).run();

  return json(rowToEvent(ev), 201);
}
