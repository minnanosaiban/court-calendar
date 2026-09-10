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
  const admin = authorizeWrite(request, env, id);
  // ログイン中の問題提起人は、自分名義の事件を自分で追加できる（2026-09-10。それまでは運営だけ）。
  // 公開するか非公開（閲覧キー付き）にするかは、本人が作成画面のアクセス制限で選ぶ
  const session = admin ? null : await getPresenterSession(request, env);
  if (!admin && !session) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const c = caseFromBody(body);
  if (!c.name) return json({ error: "事件名は必須です" }, 400);

  // 事件名が重複していたら、エラーで止めずに全角の連番を振って回避する（2026-08-28）
  c.name = await uniqueCaseName(env, c.name);

  // 本人が作るときは、必ず自分名義にする（他人名義の事件は作れない。更新側と同じ規則）
  if (!admin) c.presenter_id = session.presenterId;

  if (c.presenter_id) {
    const pr = await env.DB.prepare(`SELECT id FROM presenters WHERE id = ?`).bind(c.presenter_id).first();
    if (!pr) return json({ error: "ニックネームが見つかりません" }, 400);
  }

  const cid = newId("c");
  const now = new Date().toISOString();
  const actor = admin ? id.email : ("presenter:" + session.presenterId);
  await env.DB.prepare(
    `INSERT INTO cases (id, name, presenter_id, view_key, case_no, case_no_public,
                        plaintiff_name, defendant_name,
                        judge, points, call_text,
                        contact, press,
                        plaintiff_links, defendant_links, tags,
                        related_case_ids, archived_at, close_type, board_enabled, board_restricted,
                        card_headline, card_sub, card_message, seo_title, seo_description,
                        created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(cid, c.name, c.presenter_id, c.view_key, c.case_no, c.case_no_public,
         c.plaintiff_name, c.defendant_name,
         c.judge, c.points, c.call_text,
         c.contact, c.press,
         c.plaintiff_links, c.defendant_links, c.tags,
         c.related_case_ids, c.archived_at, c.close_type, c.board_enabled, c.board_restricted,
         c.card_headline, c.card_sub, c.card_message, c.seo_title, c.seo_description,
         actor, actor, now).run();

  const row = await env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind("", cid).first();
  return json(rowToCase(row), 201);
}
