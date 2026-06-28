import { json, getIdentity, authorizeWrite } from "../_common.js";

// 現在の権限を返す（画面の表示制御に使う）。編集パスワードはヘッダ X-Edit-Key で送る
export async function onRequestGet({ request, env }) {
  const id = await getIdentity(request, env);
  return json({
    email: id.email,
    viaAccess: id.viaAccess,
    canWrite: authorizeWrite(request, env, id),
    allowAll: String(env.ALLOW_ALL_WRITES).toLowerCase() === "true",
  });
}
