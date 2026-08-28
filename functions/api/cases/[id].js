import { json, rowToCase, caseFromBody, getIdentity, authorizeWrite, viewerHash, uniqueCaseName } from "../../_common.js";
import { casesSelect } from "../cases.js";

// 更新（書き込み権限が必要）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const cid = params.id;
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const c = caseFromBody(body);
  if (!c.name) return json({ error: "事件名は必須です" }, 400);

  // 事件名が重複していたら、エラーで止めずに全角の連番を振って回避する（2026-08-28）
  c.name = await uniqueCaseName(env, c.name, cid);

  if (c.presenter_id) {
    const pr = await env.DB.prepare(`SELECT id FROM presenters WHERE id = ?`).bind(c.presenter_id).first();
    if (!pr) return json({ error: "問題提起人が見つかりません" }, 400);
  }

  const res = await env.DB.prepare(
    `UPDATE cases
        SET name=?, presenter_id=?, case_no=?, case_no_public=?, show_case_no_on_top=?,
            plaintiff_name=?, show_plaintiff_on_top=?, defendant_name=?, show_defendant_on_top=?,
            judge=?, show_judge_on_top=?, points=?, show_points_on_top=?, call_text=?, show_call_on_top=?,
            contact=?, press=?, show_press_on_top=?,
            plaintiff_links=?, defendant_links=?, tags=?,
            related_case_ids=?, show_related_on_top=?, archived_at=?, close_type=?, board_enabled=?, board_restricted=?,
            updated_by=?, updated_at=?
      WHERE id=?`
  ).bind(c.name, c.presenter_id, c.case_no, c.case_no_public, c.show_case_no_on_top,
         c.plaintiff_name, c.show_plaintiff_on_top, c.defendant_name, c.show_defendant_on_top,
         c.judge, c.show_judge_on_top, c.points, c.show_points_on_top, c.call_text, c.show_call_on_top,
         c.contact, c.press, c.show_press_on_top,
         c.plaintiff_links, c.defendant_links, c.tags,
         c.related_case_ids, c.show_related_on_top, c.archived_at, c.close_type, c.board_enabled, c.board_restricted,
         id.email, new Date().toISOString(), cid).run();
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
