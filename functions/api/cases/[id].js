import {
  json, rowToCase, caseFromBody, getIdentity, authorizeWrite, viewerHash, uniqueCaseName,
  authorizeCaseWrite, actorLabel,
} from "../../_common.js";
import { casesSelect } from "../cases.js";

// 更新（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const cid = params.id;
  const auth = await authorizeCaseWrite(request, env, id, cid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const c = caseFromBody(body);
  if (!c.name) return json({ error: "事件名は必須です" }, 400);

  // 事件名が重複していたら、エラーで止めずに全角の連番を振って回避する（2026-08-28）
  c.name = await uniqueCaseName(env, c.name, cid);

  if (!auth.admin) {
    // 問題提起人は、自分の事件を別の問題提起人へ付け替えることはできない
    // （どんな値が送られてきても、いまの presenter_id をそのまま使う。付け替えは運営のみ）
    const cur = await env.DB.prepare(`SELECT presenter_id FROM cases WHERE id = ?`).bind(cid).first();
    c.presenter_id = cur ? cur.presenter_id : null;
  } else if (c.presenter_id) {
    const pr = await env.DB.prepare(`SELECT id FROM presenters WHERE id = ?`).bind(c.presenter_id).first();
    if (!pr) return json({ error: "ニックネームが見つかりません" }, 400);
  }

  const actor = actorLabel(id, auth);
  const res = await env.DB.prepare(
    `UPDATE cases
        SET name=?, presenter_id=?, view_key=?, case_no=?, case_no_public=?,
            plaintiff_name=?, defendant_name=?,
            judge=?, points=?, call_text=?,
            contact=?, press=?,
            plaintiff_links=?, defendant_links=?, tags=?,
            related_case_ids=?, archived_at=?, close_type=?, board_enabled=?, board_restricted=?,
            updated_by=?, updated_at=?
      WHERE id=?`
  ).bind(c.name, c.presenter_id, c.view_key, c.case_no, c.case_no_public,
         c.plaintiff_name, c.defendant_name,
         c.judge, c.points, c.call_text,
         c.contact, c.press,
         c.plaintiff_links, c.defendant_links, c.tags,
         c.related_case_ids, c.archived_at, c.close_type, c.board_enabled, c.board_restricted,
         actor, new Date().toISOString(), cid).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);

  const viewer = (await viewerHash(request)) || "";
  const row = await env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind(viewer, cid).first();
  return json(rowToCase(row));
}

// 削除（書き込み権限が必要）。期日や資料が残っている事件は消せない（先にそちらを消す）
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const cid = params.id;
  const ev = await env.DB.prepare(`SELECT COUNT(*) AS n FROM events WHERE case_id = ?`).bind(cid).first();
  if (ev && ev.n > 0) return json({ error: "この事件には期日が残っています。先に期日を削除してください。" }, 409);
  const mt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM materials WHERE case_id = ?`).bind(cid).first();
  if (mt && mt.n > 0) return json({ error: "この事件には訴訟資料が残っています。先に資料を削除してください。" }, 409);

  await env.DB.prepare(`DELETE FROM likes WHERE case_id = ?`).bind(cid).run();
  const res = await env.DB.prepare(`DELETE FROM cases WHERE id = ?`).bind(cid).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);
  return json({ ok: true });
}
