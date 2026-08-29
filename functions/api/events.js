import {
  json, newId, rowToEvent, linesToText, EVENT_COLS, EVENT_FROM, resolveCaseId,
  getIdentity, hiddenCaseIds, viewerHash, authorizeCaseWrite, actorLabel, getPresenterSession, myCaseIds,
} from "../_common.js";

// 一覧（誰でも閲覧可）。事件名も JOIN して返す。非公開にした事件の期日は合言葉が合った人にだけ返す
// （自分の事件は、閲覧キーを知らなくても常に見える）。
export async function onRequestGet({ request, env }) {
  const viewer = (await viewerHash(request)) || "";
  const [{ results }, hidden, session] = await Promise.all([
    env.DB.prepare(`SELECT ${EVENT_COLS} ${EVENT_FROM} ORDER BY e.date, e.time`).bind(viewer).all(),
    hiddenCaseIds(env, request),
    getPresenterSession(request, env),
  ]);
  const mine = await myCaseIds(env, session);
  return json((results || []).filter((r) => !hidden.has(r.case_id) || mine.has(r.case_id)).map(rowToEvent));
}

// 追加（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。
// 事件は caseId か事件名（case）で指定する。あらかじめ登録されている事件でなければ追加できない。
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const date = String(body.date || "").trim();
  if (!date) return json({ error: "期日は必須です" }, 400);
  const caseId = await resolveCaseId(env, body, id.email);
  if (!caseId) return json({ error: "その事件はまだ登録されていません。先に「事件を追加」で事件を登録してください。" }, 400);
  const auth = await authorizeCaseWrite(request, env, id, caseId);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const ev = {
    id: body.id ? String(body.id) : newId("e"),
    case_id: caseId,
    date,
    time: String(body.time || "").trim(),
    type: String(body.type || "").trim(),
    court: String(body.court || "").trim(),
    place: String(body.place || "").trim(),
    open: body.open === false ? 0 : 1,
    report_meeting: body.reportMeeting === true ? 1 : 0,
    plaintiff_argument: linesToText(body.plaintiffArgument),
    defendant_argument: linesToText(body.defendantArgument),
  };
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO events (id, case_id, date, time, type, court, place, open, report_meeting,
                         plaintiff_argument, defendant_argument,
                         created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(ev.id, ev.case_id, ev.date, ev.time, ev.type, ev.court, ev.place, ev.open, ev.report_meeting,
         ev.plaintiff_argument, ev.defendant_argument,
         actorLabel(id, auth), actorLabel(id, auth), now).run();

  const row = await env.DB.prepare(`SELECT ${EVENT_COLS} ${EVENT_FROM} WHERE e.id = ?`).bind("", ev.id).first();
  return json(rowToEvent(row), 201);
}
