import {
  json, newId, rowToCase, caseFromBody, CASE_COLS,
  getIdentity, authorizeWrite, viewerHash, hiddenCaseIds, redactCaseNo, uniqueCaseName,
  getPresenterSession, myCaseIds,
} from "../_common.js";

// 事件の一覧は、いいねの数と「この端末が押したか」を一緒に返す（最初の ? に viewer のハッシュを bind する）
export function casesSelect() {
  return `
    SELECT ${CASE_COLS},
           (SELECT COUNT(*) FROM likes l WHERE l.case_id = c.id) AS likes,
           (SELECT COUNT(*) FROM likes l WHERE l.case_id = c.id AND l.viewer = ?) AS liked
      FROM cases c
      LEFT JOIN presenters p ON p.id = c.presenter_id`;
}

// 一覧（誰でも閲覧可）。非公開にした事件（view_key あり）は合言葉が合った人にだけ返す
// （ただし自分の事件は、閲覧キーを知らなくても常に見える）。
// 事件番号は運営（書き込み権限がある人）と、「公開してもよい」とチェックされた事件、
// そして自分の事件にだけ返す。
export async function onRequestGet({ request, env }) {
  const viewer = (await viewerHash(request)) || "";
  const [{ results }, hidden, wid, session] = await Promise.all([
    env.DB.prepare(`${casesSelect()} ORDER BY c.name`).bind(viewer).all(),
    hiddenCaseIds(env, request),
    getIdentity(request, env),
    getPresenterSession(request, env),
  ]);
  const mine = await myCaseIds(env, session);
  const visible = (results || []).filter((r) => !hidden.has(r.id) || mine.has(r.id));
  return json(redactCaseNo(visible, authorizeWrite(request, env, wid), session && session.presenterId).map(rowToCase));
}

// 追加（書き込み権限が必要）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const c = caseFromBody(body);
  if (!c.name) return json({ error: "事件名は必須です" }, 400);

  // 事件名が重複していたら、エラーで止めずに全角の連番を振って回避する（2026-08-28）
  c.name = await uniqueCaseName(env, c.name);

  if (c.presenter_id) {
    const pr = await env.DB.prepare(`SELECT id FROM presenters WHERE id = ?`).bind(c.presenter_id).first();
    if (!pr) return json({ error: "問題提起人が見つかりません" }, 400);
  }

  const cid = newId("c");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO cases (id, name, presenter_id, view_key, case_no, case_no_public, show_case_no_on_top,
                        plaintiff_name, show_plaintiff_on_top, defendant_name, show_defendant_on_top,
                        judge, show_judge_on_top, points, show_points_on_top, call_text, show_call_on_top,
                        contact, press, show_press_on_top,
                        plaintiff_links, defendant_links, tags,
                        related_case_ids, show_related_on_top, archived_at, close_type, board_enabled, board_restricted,
                        created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(cid, c.name, c.presenter_id, c.view_key, c.case_no, c.case_no_public, c.show_case_no_on_top,
         c.plaintiff_name, c.show_plaintiff_on_top, c.defendant_name, c.show_defendant_on_top,
         c.judge, c.show_judge_on_top, c.points, c.show_points_on_top, c.call_text, c.show_call_on_top,
         c.contact, c.press, c.show_press_on_top,
         c.plaintiff_links, c.defendant_links, c.tags,
         c.related_case_ids, c.show_related_on_top, c.archived_at, c.close_type, c.board_enabled, c.board_restricted,
         id.email, id.email, now).run();

  const row = await env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind("", cid).first();
  return json(rowToCase(row), 201);
}
