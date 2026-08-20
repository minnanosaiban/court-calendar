import { json, rowToEvent, getIdentity, authorizeWrite } from "../_common.js";

const COLS = `id, case_name, case_no, date, time, type, court, place, parties, host, contact,
              lede, points, open, level, created_by, updated_by, updated_at`;

function newId() {
  return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 事件の説明・争点は、複数の期日にまたがっても入力の手間が同じになるよう、
// フォームからは配列（1行1項目）で受け取り、DBには改行区切りの1本のテキストで保存する。
function pointsToText(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean).join("\n");
  return String(v || "").trim();
}

// 一覧（誰でも閲覧可）
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
    case_no: String(body.caseNo || "").trim(),
    date,
    time: String(body.time || "").trim(),
    type: String(body.type || "").trim(),
    court: String(body.court || "").trim(),
    place: String(body.place || "").trim(),
    parties: String(body.parties || "").trim(),
    host: String(body.host || "").trim(),
    contact: String(body.contact || "").trim(),
    lede: String(body.lede || "").trim(),
    points: pointsToText(body.points),
    open: body.open === false ? 0 : 1,
    level: String(body.level || "").trim(),
    created_by: id.email,
    updated_by: id.email,
    updated_at: new Date().toISOString(),
  };

  await env.DB.prepare(
    `INSERT INTO events
       (id, case_name, case_no, date, time, type, court, place, parties, host, contact,
        lede, points, open, level, created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ev.id, ev.case_name, ev.case_no, ev.date, ev.time, ev.type, ev.court, ev.place,
    ev.parties, ev.host, ev.contact, ev.lede, ev.points, ev.open, ev.level,
    ev.created_by, ev.updated_by, ev.updated_at
  ).run();

  return json(rowToEvent(ev), 201);
}
