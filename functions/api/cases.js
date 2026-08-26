import {
  json, newId, rowToCase, caseFromBody, CASE_COLS,
  getIdentity, authorizeWrite, viewerHash, hiddenCaseIds,
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

// 一覧（誰でも閲覧可）。非公開にした事件（view_key あり）は合言葉が合った人にだけ返す。
export async function onRequestGet({ request, env }) {
  const viewer = (await viewerHash(request)) || "";
  const [{ results }, hidden] = await Promise.all([
    env.DB.prepare(`${casesSelect()} ORDER BY c.name`).bind(viewer).all(),
    hiddenCaseIds(env, request),
  ]);
  return json((results || []).filter((r) => !hidden.has(r.id)).map(rowToCase));
}

// 追加（書き込み権限が必要）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const c = caseFromBody(body);
  if (!c.name) return json({ error: "事件名は必須です" }, 400);

  const dup = await env.DB.prepare(`SELECT id FROM cases WHERE name = ?`).bind(c.name).first();
  if (dup) return json({ error: "同じ名前の事件がすでにあります" }, 409);

  if (c.presenter_id) {
    const pr = await env.DB.prepare(`SELECT id FROM presenters WHERE id = ?`).bind(c.presenter_id).first();
    if (!pr) return json({ error: "問題提起人が見つかりません" }, 400);
  }

  const cid = newId("c");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO cases (id, name, presenter_id, case_no, plaintiff_name, defendant_name, judge, points, call_text, contact, press,
                        plaintiff_links, defendant_links, tags,
                        related_case_ids, archived_at, close_type, board_enabled, board_restricted,
                        created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(cid, c.name, c.presenter_id, c.case_no, c.plaintiff_name, c.defendant_name, c.judge, c.points, c.call_text, c.contact, c.press,
         c.plaintiff_links, c.defendant_links, c.tags,
         c.related_case_ids, c.archived_at, c.close_type, c.board_enabled, c.board_restricted,
         id.email, id.email, now).run();

  const row = await env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind("", cid).first();
  return json(rowToCase(row), 201);
}
