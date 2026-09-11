import {
  json, rowToPresenter, putValidatedImage, authorizeSelfOrAdmin, deleteR2,
  ICON_MIMES, ICON_MAX_BYTES,
} from "../../../_common.js";
import { presentersSelect } from "../../presenters.js";

async function loadPresenterRow(env, pid) {
  return env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(pid).first();
}

// 登録・差し替え（書き込み権限が必要。運営は全員、本人は自分のアイコンのみ）。問題提起人につき1枚だけなので置き換え専用
export async function onRequestPut({ request, env, params }) {
  const pid = params.id;
  const auth = await authorizeSelfOrAdmin(request, env, pid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT icon_r2_key FROM presenters WHERE id = ?`).bind(pid).first();
  if (!cur) return json({ error: "not found" }, 404);

  const put = await putValidatedImage(env, request, {
    mimes: ICON_MIMES, maxBytes: ICON_MAX_BYTES, keyPrefix: "ic", ownerId: pid, defaultName: "icon",
    emptyFileMsg: "アイコンの画像ファイルを選んでください",
    disabledMsg: "アイコンのアップロード（R2）はまだ使えません",
    wrongTypeMsg: "アイコンは JPEG・WebP のみ登録できます",
    tooBigMsg: "アイコンは5MBまでです",
  });
  if (put.error) return json({ error: put.error }, 400);
  const key = put.key;
  await env.DB.prepare(
    `UPDATE presenters SET icon_r2_key=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(key, auth.actor, new Date().toISOString(), pid).run();
  // 失敗は握りつぶさずログに残す（2026-09-11、R2孤立バグの再発防止）
  if (cur.icon_r2_key && cur.icon_r2_key !== key) await deleteR2(env, [cur.icon_r2_key], "presenter-icon:" + pid);

  const row = await loadPresenterRow(env, pid);
  return json(rowToPresenter(row, auth.admin));
}

// 削除（書き込み権限が必要。運営は全員、本人は自分のアイコンのみ）。R2のファイルも消す
export async function onRequestDelete({ request, env, params }) {
  const pid = params.id;
  const auth = await authorizeSelfOrAdmin(request, env, pid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT icon_r2_key FROM presenters WHERE id = ?`).bind(pid).first();
  if (!cur) return json({ error: "not found" }, 404);

  await env.DB.prepare(
    `UPDATE presenters SET icon_r2_key=NULL, updated_by=?, updated_at=? WHERE id=?`
  ).bind(auth.actor, new Date().toISOString(), pid).run();
  if (cur.icon_r2_key) await deleteR2(env, [cur.icon_r2_key], "presenter-icon:" + pid);

  const row = await loadPresenterRow(env, pid);
  return json(rowToPresenter(row, auth.admin));
}
