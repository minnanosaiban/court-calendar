import {
  json, rowToPresenter, putFile, getIdentity, authorizeWrite, getPresenterSession,
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

async function authorizeSelfOrAdmin(request, env, pid) {
  const id = await getIdentity(request, env);
  if (authorizeWrite(request, env, id)) return { ok: true, actor: id.email || "admin" };
  const session = await getPresenterSession(request, env);
  return { ok: !!session && session.presenterId === pid, actor: "presenter:" + pid };
}

export async function onRequestPut({ request, env, params }) {
  const pid = params.id;
  const auth = await authorizeSelfOrAdmin(request, env, pid);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const cur = await env.DB.prepare(`SELECT card_r2_key FROM presenters WHERE id = ?`).bind(pid).first();
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
  const key = await putFile(env, "pd", pid, file);
  await env.DB.prepare(
    `UPDATE presenters SET card_r2_key=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(key, auth.actor, new Date().toISOString(), pid).run();
  if (cur.card_r2_key && cur.card_r2_key !== key && env.FILES) await env.FILES.delete(cur.card_r2_key).catch(() => {});

  return json(rowToPresenter(await loadRow(env, pid)));
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
  if (cur.card_r2_key && env.FILES) await env.FILES.delete(cur.card_r2_key).catch(() => {});

  return json(rowToPresenter(await loadRow(env, pid)));
}
