import {
  json, rowToPresenter, putValidatedImage, authorizeSelfOrAdmin, deleteR2,
  CARD_MIMES, CARD_MAX_BYTES,
} from "../../../_common.js";
import { presentersSelect } from "../../presenters.js";

// 問題提起人ページのTwitterカード（横長版）の差し替え。未設定（既定）なら
// /api/presenters/:id/card.png が自動生成する「傍聴券」をそのまま使う。
// 事件側の cases/[id]/card.js と同じ、1人につき1枚だけの差し替え専用の仕組み。
// 変更できるのは運営と、ログイン中の本人（アイコンと同じ範囲）。

async function loadRow(env, pid) {
  return env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(pid).first();
}

export async function onRequestPut({ request, env, params }) {
  const pid = params.id;
  const auth = await authorizeSelfOrAdmin(request, env, pid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT card_r2_key FROM presenters WHERE id = ?`).bind(pid).first();
  if (!cur) return json({ error: "not found" }, 404);

  const put = await putValidatedImage(env, request, {
    mimes: CARD_MIMES, maxBytes: CARD_MAX_BYTES, keyPrefix: "pd", ownerId: pid, defaultName: "card",
    emptyFileMsg: "カードの画像ファイルを選んでください",
    disabledMsg: "画像のアップロード（R2）はまだ使えません",
    wrongTypeMsg: "カードは JPEG・PNG のみ登録できます",
    tooBigMsg: "カードは8MBまでです",
  });
  if (put.error) return json({ error: put.error }, 400);
  const key = put.key;
  await env.DB.prepare(
    `UPDATE presenters SET card_r2_key=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(key, auth.actor, new Date().toISOString(), pid).run();
  // 失敗は握りつぶさずログに残す（2026-09-11、R2孤立バグの再発防止）
  if (cur.card_r2_key && cur.card_r2_key !== key) await deleteR2(env, [cur.card_r2_key], "presenter-card:" + pid);

  return json(rowToPresenter(await loadRow(env, pid), auth.admin));
}

// 自動生成に戻す
export async function onRequestDelete({ request, env, params }) {
  const pid = params.id;
  const auth = await authorizeSelfOrAdmin(request, env, pid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT card_r2_key FROM presenters WHERE id = ?`).bind(pid).first();
  if (!cur) return json({ error: "not found" }, 404);

  await env.DB.prepare(
    `UPDATE presenters SET card_r2_key=NULL, updated_by=?, updated_at=? WHERE id=?`
  ).bind(auth.actor, new Date().toISOString(), pid).run();
  if (cur.card_r2_key) await deleteR2(env, [cur.card_r2_key], "presenter-card:" + pid);

  return json(rowToPresenter(await loadRow(env, pid), auth.admin));
}
