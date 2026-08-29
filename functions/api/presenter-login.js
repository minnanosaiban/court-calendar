import { json, hashPassword, createPresenterSession } from "../_common.js";

// 問題提起人のログイン（ログインID＋パスワード。運営が発行したものを使う）。
// 成功したらトークンを発行して返す。ブラウザはこれを保存し、以後 X-Presenter-Token ヘッダで送る
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return json({ error: "ログインIDとパスワードを入力してください" }, 400);

  const row = await env.DB.prepare(
    `SELECT id, nickname, login_password_salt, login_password_hash FROM presenters WHERE login_username = ?`
  ).bind(username).first();
  // ログインIDが無い場合も、有る場合と同じ形のエラーを返す（IDの存在を教えない）
  if (!row || !row.login_password_hash || !row.login_password_salt) {
    return json({ error: "ログインIDまたはパスワードが違います" }, 401);
  }
  const hash = await hashPassword(password, row.login_password_salt);
  if (hash !== row.login_password_hash) {
    return json({ error: "ログインIDまたはパスワードが違います" }, 401);
  }

  const token = await createPresenterSession(env, row.id);
  return json({ token, presenterId: row.id, nickname: row.nickname });
}
