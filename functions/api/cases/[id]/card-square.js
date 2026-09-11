import {
  json, rowToCase, putValidatedImage, getIdentity, authorizeCaseWrite, actorLabel, deleteR2,
  CARD_MIMES, CARD_MAX_BYTES,
} from "../../../_common.js";
import { casesSelect } from "../../cases.js";

// Twitterカードの正方形版の差し替え。未設定（既定）なら /api/cases/:id/card-square.png が
// 期日・問題提起人から自動生成する。横長版（card.js）と全く同じ仕組みで、列だけが違う
// （cases.card_square_r2_key）。事件につき1枚だけの差し替え専用。

async function loadCaseRow(env, cid) {
  return env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind("", cid).first();
}

// 登録・差し替え（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const cid = params.id;
  const auth = await authorizeCaseWrite(request, env, id, cid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT card_square_r2_key FROM cases WHERE id = ?`).bind(cid).first();
  if (!cur) return json({ error: "not found" }, 404);

  const put = await putValidatedImage(env, request, {
    mimes: CARD_MIMES, maxBytes: CARD_MAX_BYTES, keyPrefix: "cds", ownerId: cid, defaultName: "card-square",
    emptyFileMsg: "カードの画像ファイルを選んでください",
    disabledMsg: "画像のアップロード（R2）はまだ使えません",
    wrongTypeMsg: "カードは JPEG・PNG のみ登録できます",
    tooBigMsg: "カードは8MBまでです",
  });
  if (put.error) return json({ error: put.error }, 400);
  const key = put.key;
  await env.DB.prepare(
    `UPDATE cases SET card_square_r2_key=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(key, actorLabel(id, auth), new Date().toISOString(), cid).run();
  // 失敗は握りつぶさずログに残す（2026-09-11、R2孤立バグの再発防止）
  if (cur.card_square_r2_key && cur.card_square_r2_key !== key) await deleteR2(env, [cur.card_square_r2_key], "case-card-square:" + cid);

  const row = await loadCaseRow(env, cid);
  return json(rowToCase(row));
}

// 削除（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。自動生成に戻す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  const cid = params.id;
  const auth = await authorizeCaseWrite(request, env, id, cid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT card_square_r2_key FROM cases WHERE id = ?`).bind(cid).first();
  if (!cur) return json({ error: "not found" }, 404);

  await env.DB.prepare(
    `UPDATE cases SET card_square_r2_key=NULL, updated_by=?, updated_at=? WHERE id=?`
  ).bind(actorLabel(id, auth), new Date().toISOString(), cid).run();
  if (cur.card_square_r2_key) await deleteR2(env, [cur.card_square_r2_key], "case-card-square:" + cid);

  const row = await loadCaseRow(env, cid);
  return json(rowToCase(row));
}
