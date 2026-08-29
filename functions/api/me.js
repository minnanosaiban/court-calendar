import { json, getIdentity, authorizeWrite, getPresenterSession } from "../_common.js";

// 現在の権限を返す（画面の表示制御に使う）。編集パスワードはヘッダ X-Edit-Key、
// 問題提起人アカウントのログインはヘッダ X-Presenter-Token で送る
export async function onRequestGet({ request, env }) {
  const id = await getIdentity(request, env);
  const localDev = String(env.LOCAL_DEV).toLowerCase() === "true";
  const session = await getPresenterSession(request, env);
  const presenter = session
    ? await env.DB.prepare(`SELECT id, nickname FROM presenters WHERE id = ?`).bind(session.presenterId).first()
    : null;
  return json({
    email: id.email,
    viaAccess: id.viaAccess,
    canWrite: authorizeWrite(request, env, id),
    allowAll: String(env.ALLOW_ALL_WRITES).toLowerCase() === "true",
    // 掲示板：一般の人が投稿できるのは Turnstile を設定したときだけ（ローカル開発は例外）
    boardOpen: !!env.TURNSTILE_SECRET || localDev,
    turnstileSiteKey: env.TURNSTILE_SITEKEY || "",
    // 資料のファイルを画面からアップロードできるか（R2 バインドがあるときだけ）
    uploads: !!env.FILES,
    // ログイン中の問題提起人（いなければ空）。自分の事件かどうかは cases の presenterId と突き合わせて判定する
    presenterId: presenter ? presenter.id : "",
    presenterNickname: presenter ? presenter.nickname : "",
  });
}
