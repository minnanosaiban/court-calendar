import { json, getIdentity, authorizeWrite } from "../../_common.js";

// 投稿を消す（運営＝編集パスワードを知っている人だけ）。
// 誰でも書ける掲示板なので、荒れたときに落とせる手段を必ず用意しておく。
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const res = await env.DB.prepare(`DELETE FROM posts WHERE id=?`).bind(params.id).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);
  return json({ ok: true });
}
