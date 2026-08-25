import { json, rowToPresenter, getIdentity, authorizeWrite } from "../../_common.js";
import { presentersSelect } from "../presenters.js";

// 単体取得（誰でも閲覧可。presenter.html のヘッダー表示用）
export async function onRequestGet({ env, params }) {
  const row = await env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(params.id).first();
  if (!row) return json({ error: "not found" }, 404);
  return json(rowToPresenter(row));
}

// 更新（ニックネームの変更。書き込み権限が必要）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const nickname = String(body.nickname || "").trim();
  if (!nickname) return json({ error: "ニックネームは必須です" }, 400);

  const res = await env.DB.prepare(
    `UPDATE presenters SET nickname=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(nickname, id.email, new Date().toISOString(), params.id).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);

  const row = await env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(params.id).first();
  return json(rowToPresenter(row));
}

// 削除（書き込み権限が必要）。事件が1件でも紐づいていれば消せない（先にそちらの紐付けを外す）
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const cnt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM cases WHERE presenter_id = ?`).bind(params.id).first();
  if (cnt && cnt.n > 0) return json({ error: "この問題提起人には事件が紐づいています。先に事件側の紐付けを外してください。" }, 409);

  const cur = await env.DB.prepare(`SELECT icon_r2_key FROM presenters WHERE id = ?`).bind(params.id).first();
  if (!cur) return json({ error: "not found" }, 404);

  await env.DB.prepare(`DELETE FROM presenters WHERE id = ?`).bind(params.id).run();
  if (cur.icon_r2_key && env.FILES) await env.FILES.delete(cur.icon_r2_key).catch(() => {});
  return json({ ok: true });
}
