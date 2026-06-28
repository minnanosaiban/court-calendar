import { json, rowToEvent, getIdentity, authorizeWrite } from "../../_common.js";

const COLS = "id, case_name, date, time, type, place, note, created_by, updated_by, updated_at";

// 更新（書き込み権限が必要）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const eid = params.id;
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const caseName = String(body.case || "").trim();
  const date = String(body.date || "").trim();
  if (!caseName || !date) return json({ error: "事件名と期日は必須です" }, 400);

  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    `UPDATE events
        SET case_name=?, date=?, time=?, type=?, place=?, note=?, updated_by=?, updated_at=?
      WHERE id=?`
  ).bind(
    caseName, date,
    String(body.time || "").trim(),
    String(body.type || "").trim(),
    String(body.place || "").trim(),
    String(body.note || "").trim(),
    id.email, now, eid
  ).run();

  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);

  const row = await env.DB.prepare(`SELECT ${COLS} FROM events WHERE id=?`).bind(eid).first();
  return json(rowToEvent(row));
}

// 削除（書き込み権限が必要）
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const res = await env.DB.prepare(`DELETE FROM events WHERE id=?`).bind(params.id).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);
  return json({ ok: true });
}
