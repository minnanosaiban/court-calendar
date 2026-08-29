import { json } from "../_common.js";

// ログアウト（このトークンだけ失効させる。ヘッダが無い/知らないトークンでも常に成功扱いにする）
export async function onRequestPost({ request, env }) {
  const token = request.headers.get("X-Presenter-Token");
  if (token) await env.DB.prepare(`DELETE FROM presenter_sessions WHERE token = ?`).bind(token).run();
  return json({ ok: true });
}
