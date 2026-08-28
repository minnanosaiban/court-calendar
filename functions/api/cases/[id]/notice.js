import {
  json, rowToCase, putFile, getIdentity, authorizeWrite,
  NOTICE_MIMES, NOTICE_MAX_BYTES,
} from "../../../_common.js";
import { casesSelect } from "../../cases.js";

async function loadCaseRow(env, cid) {
  return env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind("", cid).first();
}

// 登録・差し替え（書き込み権限が必要）。事件につき1枚だけなので置き換え専用
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const cid = params.id;
  const cur = await env.DB.prepare(`SELECT notice_r2_key FROM cases WHERE id = ?`).bind(cid).first();
  if (!cur) return json({ error: "not found" }, 404);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "bad form" }, 400); }
  const f = form.get("file");
  if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function" || f.size === 0) {
    return json({ error: "案内のファイルを選んでください" }, 400);
  }
  if (!env.FILES) return json({ error: "ファイルのアップロード（R2）はまだ使えません" }, 400);
  const ext = NOTICE_MIMES[f.type];
  if (!ext) return json({ error: "期日案内は JPEG のみ登録できます" }, 400);
  if (f.size > NOTICE_MAX_BYTES) return json({ error: "ファイルは20MBまでです" }, 400);

  const file = { blob: f, ext, name: f.name || ("notice." + ext), size: f.size, mime: f.type };
  const key = await putFile(env, "no", cid, file);
  await env.DB.prepare(
    `UPDATE cases SET notice_r2_key=?, notice_file_name=?, notice_file_size=?, notice_mime=?, updated_by=?, updated_at=? WHERE id=?`
  ).bind(key, file.name, file.size, file.mime, id.email, new Date().toISOString(), cid).run();
  if (cur.notice_r2_key && cur.notice_r2_key !== key && env.FILES) await env.FILES.delete(cur.notice_r2_key).catch(() => {});

  const row = await loadCaseRow(env, cid);
  return json(rowToCase(row));
}

// 削除（書き込み権限が必要）。R2のファイルも消す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const cid = params.id;
  const cur = await env.DB.prepare(`SELECT notice_r2_key FROM cases WHERE id = ?`).bind(cid).first();
  if (!cur) return json({ error: "not found" }, 404);

  await env.DB.prepare(
    `UPDATE cases SET notice_r2_key=NULL, notice_file_name=NULL, notice_file_size=NULL, notice_mime=NULL, updated_by=?, updated_at=? WHERE id=?`
  ).bind(id.email, new Date().toISOString(), cid).run();
  if (cur.notice_r2_key && env.FILES) await env.FILES.delete(cur.notice_r2_key).catch(() => {});

  const row = await loadCaseRow(env, cid);
  return json(rowToCase(row));
}
