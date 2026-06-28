import { json, getIdentity, canWrite } from "../_common.js";

// 現在のログイン状態と権限を返す（画面の表示制御に使う）
export async function onRequestGet({ request, env }) {
  const id = await getIdentity(request, env);
  return json({
    email: id.email,
    viaAccess: id.viaAccess,
    canWrite: canWrite(id.email, env),
    allowAll: String(env.ALLOW_ALL_WRITES).toLowerCase() === "true",
  });
}
