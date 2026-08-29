import { json, getPresenterSession, hashPassword, randomHex } from "../_common.js";

// 自分でパスワードを変更する（ログイン中のみ。現在のパスワードの確認つき）
export async function onRequestPut({ request, env }) {
  const session = await getPresenterSession(request, env);
  if (!session) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  if (!newPassword || newPassword.length < 8) return json({ error: "新しいパスワードは8文字以上にしてください" }, 400);

  const row = await env.DB.prepare(
    `SELECT login_password_salt, login_password_hash FROM presenters WHERE id = ?`
  ).bind(session.presenterId).first();
  if (!row || !row.login_password_hash) return json({ error: "not found" }, 404);
  const curHash = await hashPassword(currentPassword, row.login_password_salt);
  if (curHash !== row.login_password_hash) return json({ error: "現在のパスワードが違います" }, 401);

  const salt = randomHex(16);
  const hash = await hashPassword(newPassword, salt);
  await env.DB.prepare(
    `UPDATE presenters SET login_password_salt=?, login_password_hash=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(salt, hash, "presenter:" + session.presenterId, new Date().toISOString(), session.presenterId).run();
  return json({ ok: true });
}
