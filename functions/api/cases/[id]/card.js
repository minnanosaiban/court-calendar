import {
  json, rowToCase, putFile, getIdentity, authorizeCaseWrite, actorLabel,
  CARD_MIMES, CARD_MAX_BYTES,
} from "../../../_common.js";
import { casesSelect } from "../../cases.js";

// Twitterカード（OGP画像）の差し替え。未設定（既定）なら /api/cases/:id/card.png が
// 期日・問題提起人から自動生成する「傍聴券」をそのまま使う。ここで登録すればそちらを優先する。
// 問題提起人アイコン・期日案内と同じ、事件につき1枚だけの差し替え専用の仕組み。

async function loadCaseRow(env, cid) {
  return env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind("", cid).first();
}

// 登録・差し替え（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const cid = params.id;
  const auth = await authorizeCaseWrite(request, env, id, cid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT card_r2_key FROM cases WHERE id = ?`).bind(cid).first();
  if (!cur) return json({ error: "not found" }, 404);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "bad form" }, 400); }
  const f = form.get("file");
  if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function" || f.size === 0) {
    return json({ error: "カードの画像ファイルを選んでください" }, 400);
  }
  if (!env.FILES) return json({ error: "画像のアップロード（R2）はまだ使えません" }, 400);
  const ext = CARD_MIMES[f.type];
  if (!ext) return json({ error: "カードは JPEG・PNG のみ登録できます" }, 400);
  if (f.size > CARD_MAX_BYTES) return json({ error: "カードは8MBまでです" }, 400);

  const file = { blob: f, ext, name: f.name || ("card." + ext), size: f.size, mime: f.type };
  const key = await putFile(env, "cd", cid, file);
  await env.DB.prepare(
    `UPDATE cases SET card_r2_key=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(key, actorLabel(id, auth), new Date().toISOString(), cid).run();
  if (cur.card_r2_key && cur.card_r2_key !== key && env.FILES) await env.FILES.delete(cur.card_r2_key).catch(() => {});

  const row = await loadCaseRow(env, cid);
  return json(rowToCase(row));
}

// 削除（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。自動生成に戻す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  const cid = params.id;
  const auth = await authorizeCaseWrite(request, env, id, cid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT card_r2_key FROM cases WHERE id = ?`).bind(cid).first();
  if (!cur) return json({ error: "not found" }, 404);

  await env.DB.prepare(
    `UPDATE cases SET card_r2_key=NULL, updated_by=?, updated_at=? WHERE id=?`
  ).bind(actorLabel(id, auth), new Date().toISOString(), cid).run();
  if (cur.card_r2_key && env.FILES) await env.FILES.delete(cur.card_r2_key).catch(() => {});

  const row = await loadCaseRow(env, cid);
  return json(rowToCase(row));
}
