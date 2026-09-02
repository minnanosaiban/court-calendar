import {
  json, rowToPresenter, getIdentity, authorizeWrite, isHttpUrl,
  getPresenterSession, generatePassword, randomHex, hashPassword,
  hiddenCaseIds, myCaseIds,
} from "../../_common.js";
import { presentersSelect } from "../presenters.js";

// 単体取得（誰でも閲覧可。presenter.html のヘッダー表示用）。
// ログインIDの設定状況は運営にだけ返す。
// 一覧（/api/presenters）と同じ理由で、非公開にした事件しか持たない問題提起人は
// 運営以外には「そんな人はいない」扱い（404）にする（IDを直接知られても中身は見せない）。
export async function onRequestGet({ request, env, params }) {
  const row = await env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(params.id).first();
  if (!row) return json({ error: "not found" }, 404);
  const admin = authorizeWrite(request, env, await getIdentity(request, env));
  if (!admin && Number(row.case_count) > 0) {
    const [hidden, session] = await Promise.all([hiddenCaseIds(env, request), getPresenterSession(request, env)]);
    const mine = await myCaseIds(env, session);
    const { results: caseRows } = await env.DB.prepare(`SELECT id FROM cases WHERE presenter_id = ?`).bind(params.id).all();
    const visibleCount = (caseRows || []).filter((c) => !hidden.has(c.id) || mine.has(c.id)).length;
    if (visibleCount === 0) return json({ error: "not found" }, 404);
    row.case_count = visibleCount;
  }
  return json(rowToPresenter(row, admin));
}

// 更新（書き込み権限が必要。運営は全員、本人はログイン中の自分のプロフィールのみ）。
// ニックネーム・X URLの変更はどちらもできる。ログインID・パスワードの発行/はく奪は運営のみ（body の
// loginUsername／resetPassword／removeLogin。resetPassword=true のときだけ新しいパスワードを
// 平文で1回だけ返す＝運営が本人に伝える用。他人のセッションを想定して、変更時は既存のログイン
// セッションを全部失効させる）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const admin = authorizeWrite(request, env, id);
  const session = await getPresenterSession(request, env);
  const isSelf = !!session && session.presenterId === params.id;
  if (!admin && !isSelf) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const nickname = String(body.nickname || "").trim();
  if (!nickname) return json({ error: "ニックネームは必須です" }, 400);

  let sql = `UPDATE presenters SET nickname=?, updated_by=?, updated_at=?`;
  const bind = [nickname, admin ? id.email : ("presenter:" + params.id), new Date().toISOString()];
  if (typeof body.xUrl === "string") {
    const xUrl = body.xUrl.trim();
    if (xUrl && !isHttpUrl(xUrl)) return json({ error: "X URLの形式が正しくありません" }, 400);
    sql += `, x_url=?`;
    bind.push(xUrl || null);
  }
  let newPassword = null;
  let revokeSessions = false;
  if (admin) {
    if (typeof body.loginUsername === "string") {
      const loginUsername = body.loginUsername.trim() || null;
      if (loginUsername) {
        const dup = await env.DB.prepare(`SELECT id FROM presenters WHERE login_username = ? AND id <> ?`)
          .bind(loginUsername, params.id).first();
        if (dup) return json({ error: "そのログインIDは既に使われています" }, 400);
      }
      sql += `, login_username=?`;
      bind.push(loginUsername);
    }
    if (body.removeLogin === true) {
      sql += `, login_password_salt=NULL, login_password_hash=NULL`;
      revokeSessions = true;
    } else if (body.resetPassword === true) {
      newPassword = generatePassword();
      const salt = randomHex(16);
      const hash = await hashPassword(newPassword, salt);
      sql += `, login_password_salt=?, login_password_hash=?`;
      bind.push(salt, hash);
      revokeSessions = true;
    }
  }
  sql += ` WHERE id=?`;
  bind.push(params.id);

  const res = await env.DB.prepare(sql).bind(...bind).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);
  if (revokeSessions) await env.DB.prepare(`DELETE FROM presenter_sessions WHERE presenter_id = ?`).bind(params.id).run();

  const row = await env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(params.id).first();
  const out = rowToPresenter(row, admin);
  if (newPassword) out.newPassword = newPassword;
  return json(out);
}

// 削除（書き込み権限が必要。運営のみ）。事件が1件でも紐づいていれば消せない（先にそちらの紐付けを外す）
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const cnt = await env.DB.prepare(`SELECT COUNT(*) AS n FROM cases WHERE presenter_id = ?`).bind(params.id).first();
  if (cnt && cnt.n > 0) return json({ error: "この問題提起人には事件が紐づいています。先に事件側の紐付けを外してください。" }, 409);

  const cur = await env.DB.prepare(`SELECT icon_r2_key FROM presenters WHERE id = ?`).bind(params.id).first();
  if (!cur) return json({ error: "not found" }, 404);

  await env.DB.prepare(`DELETE FROM presenter_sessions WHERE presenter_id = ?`).bind(params.id).run();
  await env.DB.prepare(`DELETE FROM presenters WHERE id = ?`).bind(params.id).run();
  if (cur.icon_r2_key && env.FILES) await env.FILES.delete(cur.icon_r2_key).catch(() => {});
  return json({ ok: true });
}
