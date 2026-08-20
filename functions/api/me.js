import { json, getIdentity, authorizeWrite } from "../_common.js";

// 現在の権限を返す（画面の表示制御に使う）。編集パスワードはヘッダ X-Edit-Key で送る
export async function onRequestGet({ request, env }) {
  const id = await getIdentity(request, env);
  const localDev = String(env.LOCAL_DEV).toLowerCase() === "true";
  return json({
    email: id.email,
    viaAccess: id.viaAccess,
    canWrite: authorizeWrite(request, env, id),
    allowAll: String(env.ALLOW_ALL_WRITES).toLowerCase() === "true",
    // 掲示板：一般の人が投稿できるのは Turnstile を設定したときだけ（ローカル開発は例外）
    boardOpen: !!env.TURNSTILE_SECRET || localDev,
    turnstileSiteKey: env.TURNSTILE_SITEKEY || "",
  });
}
