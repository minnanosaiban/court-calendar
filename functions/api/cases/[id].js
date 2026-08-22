import { json, rowToCase, caseFromBody, getIdentity, authorizeWrite, viewerHash } from "../../_common.js";
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

  const dup = await env.DB.prepare(`SELECT id FROM cases WHERE name = ? AND id <> ?`).bind(c.name, cid).first();
  if (dup) return json({ error: "同じ名前の事件がすでにあります" }, 409);

  const res = await env.DB.prepare(
    `UPDATE cases
        SET name=?, case_no=?, parties=?, judge=?, points=?, lede=?, call_text=?, host=?, contact=?, press=?, links=?, tags=?,
            archived_at=?, close_type=?, result=?,
            updated_by=?, updated_at=?
      WHERE id=?`
  ).bind(c.name, c.case_no, c.parties, c.judge, c.points, c.lede, c.call_text, c.host, c.contact, c.press, c.links, c.tags,
         c.archived_at, c.close_type, c.result,
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
