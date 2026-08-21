import {
  json, rowToEvent, linesToText, EVENT_COLS, EVENT_FROM, resolveCaseId,
  getIdentity, authorizeWrite,
} from "../../_common.js";

// 更新（書き込み権限が必要）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const eid = params.id;
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const date = String(body.date || "").trim();
  if (!date) return json({ error: "期日は必須です" }, 400);
  const caseId = await resolveCaseId(env, body, id.email);
  if (!caseId) return json({ error: "事件名は必須です" }, 400);

  const res = await env.DB.prepare(
    `UPDATE events
        SET case_id=?, date=?, time=?, type=?, court=?, place=?, open=?, level=?,
            plaintiff_argument=?, defendant_argument=?,
            updated_by=?, updated_at=?
      WHERE id=?`
  ).bind(
    caseId, date,
    String(body.time || "").trim(),
    String(body.type || "").trim(),
    String(body.court || "").trim(),
    String(body.place || "").trim(),
    body.open === false ? 0 : 1,
    String(body.level || "").trim(),
    linesToText(body.plaintiffArgument),
    linesToText(body.defendantArgument),
    id.email, new Date().toISOString(), eid
  ).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);

  const row = await env.DB.prepare(`SELECT ${EVENT_COLS} ${EVENT_FROM} WHERE e.id = ?`).bind(eid).first();
  return json(rowToEvent(row));
}

// 削除（書き込み権限が必要）。この期日への掲示板の投稿も一緒に消し、資料の紐づけは外す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const eid = params.id;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM posts WHERE event_id = ?`).bind(eid),
    env.DB.prepare(`UPDATE materials SET event_id = NULL WHERE event_id = ?`).bind(eid),
  ]);
  const res = await env.DB.prepare(`DELETE FROM events WHERE id=?`).bind(eid).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);
  return json({ ok: true });
}
