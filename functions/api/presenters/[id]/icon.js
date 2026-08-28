import {
  json, rowToPresenter, putFile, getIdentity, authorizeWrite,
  ICON_MIMES, ICON_MAX_BYTES,
} from "../../../_common.js";
import { presentersSelect } from "../../presenters.js";

async function loadPresenterRow(env, pid) {
  return env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(pid).first();
}

// 登録・差し替え（書き込み権限が必要）。問題提起人につき1枚だけなので置き換え専用
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const pid = params.id;
  const cur = await env.DB.prepare(`SELECT icon_r2_key FROM presenters WHERE id = ?`).bind(pid).first();
  if (!cur) return json({ error: "not found" }, 404);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "bad form" }, 400); }
  const f = form.get("file");
  if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function" || f.size === 0) {
    return json({ error: "アイコンの画像ファイルを選んでください" }, 400);
  }
  if (!env.FILES) return json({ error: "アイコンのアップロード（R2）はまだ使えません" }, 400);
  const ext = ICON_MIMES[f.type];
  if (!ext) return json({ error: "アイコンは JPEG・WebP のみ登録できます" }, 400);
  if (f.size > ICON_MAX_BYTES) return json({ error: "アイコンは5MBまでです" }, 400);

  const file = { blob: f, ext, name: f.name || ("icon." + ext), size: f.size, mime: f.type };
  const key = await putFile(env, "ic", pid, file);
  await env.DB.prepare(
    `UPDATE presenters SET icon_r2_key=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(key, id.email, new Date().toISOString(), pid).run();
  if (cur.icon_r2_key && cur.icon_r2_key !== key && env.FILES) await env.FILES.delete(cur.icon_r2_key).catch(() => {});

  const row = await loadPresenterRow(env, pid);
  return json(rowToPresenter(row));
}

// 削除（書き込み権限が必要）。R2のファイルも消す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const pid = params.id;
  const cur = await env.DB.prepare(`SELECT icon_r2_key FROM presenters WHERE id = ?`).bind(pid).first();
  if (!cur) return json({ error: "not found" }, 404);

  await env.DB.prepare(
    `UPDATE presenters SET icon_r2_key=NULL, updated_by=?, updated_at=? WHERE id=?`
  ).bind(id.email, new Date().toISOString(), pid).run();
  if (cur.icon_r2_key && env.FILES) await env.FILES.delete(cur.icon_r2_key).catch(() => {});

  const row = await loadPresenterRow(env, pid);
  return json(rowToPresenter(row));
}
