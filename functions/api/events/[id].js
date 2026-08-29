import {
  json, rowToEvent, linesToText, EVENT_COLS, EVENT_FROM, resolveCaseId,
  getIdentity, authorizeCaseWrite, actorLabel,
} from "../../_common.js";

// 更新（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ。事件の付け替え先も自分の事件のみ）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const eid = params.id;
  const cur = await env.DB.prepare(`SELECT case_id FROM events WHERE id = ?`).bind(eid).first();
  if (!cur) return json({ error: "not found" }, 404);
  const authOld = await authorizeCaseWrite(request, env, id, cur.case_id);
  if (!authOld.ok) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const date = String(body.date || "").trim();
  if (!date) return json({ error: "期日は必須です" }, 400);
  const caseId = await resolveCaseId(env, body, id.email);
  if (!caseId) return json({ error: "その事件はまだ登録されていません。先に「事件を追加」で事件を登録してください。" }, 400);
  const auth = caseId === cur.case_id ? authOld : await authorizeCaseWrite(request, env, id, caseId);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const res = await env.DB.prepare(
    `UPDATE events
        SET case_id=?, date=?, time=?, type=?, court=?, place=?, open=?, report_meeting=?,
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
    body.reportMeeting === true ? 1 : 0,
    linesToText(body.plaintiffArgument),
    linesToText(body.defendantArgument),
    actorLabel(id, auth), new Date().toISOString(), eid
  ).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);

  const row = await env.DB.prepare(`SELECT ${EVENT_COLS} ${EVENT_FROM} WHERE e.id = ?`).bind("", eid).first();
  return json(rowToEvent(row));
}

// 削除（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。
// この期日への掲示板の投稿・お気に入りも一緒に消し、資料の紐づけは外す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  const eid = params.id;
  const cur = await env.DB.prepare(`SELECT case_id FROM events WHERE id = ?`).bind(eid).first();
  if (!cur) return json({ error: "not found" }, 404);
  const auth = await authorizeCaseWrite(request, env, id, cur.case_id);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM posts WHERE event_id = ?`).bind(eid),
    env.DB.prepare(`DELETE FROM event_bookmarks WHERE event_id = ?`).bind(eid),
    env.DB.prepare(`UPDATE materials SET event_id = NULL WHERE event_id = ?`).bind(eid),
  ]);
  const res = await env.DB.prepare(`DELETE FROM events WHERE id=?`).bind(eid).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);
  return json({ ok: true });
}
