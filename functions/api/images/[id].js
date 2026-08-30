import { json, rowToImage, putFile, getIdentity, authorizeCaseWrite } from "../../_common.js";
import { SELECT, readImageForm } from "../images.js";

// 更新（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。
// caption・並び順（sortOrder）の変更、ファイル（写真・Web用）の差し替え・Web用だけを外すことができる。
// 並び替え（入れ替えボタン）は sortOrder だけを送る呼び出しになる。
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const iid = params.id;
  const cur = await env.DB.prepare(`SELECT case_id, r2_key, web_r2_key, sort_order FROM case_images WHERE id = ?`).bind(iid).first();
  if (!cur) return json({ error: "not found" }, 404);
  const auth = await authorizeCaseWrite(request, env, id, cur.case_id);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const r = await readImageForm(request, env, false);
  if (r.error) return json({ error: r.error }, 400);
  const f = r.fields;
  const sortOrder = f.sort_order === null ? cur.sort_order : f.sort_order;

  const sets = ["caption=?", "sort_order=?"];
  const bind = [f.caption, sortOrder];
  let oldR2Key = null, oldWebR2Key = null;

  if (r.file) {
    const key = await putFile(env, "i", iid, r.file);
    sets.push("r2_key=?", "file_name=?", "file_size=?", "mime=?");
    bind.push(key, r.file.name, r.file.size, r.file.mime);
    oldR2Key = cur.r2_key !== key ? cur.r2_key : null;
  }
  if (r.webFile) {
    const webKey = await putFile(env, "iw", iid, r.webFile);
    sets.push("web_r2_key=?", "web_file_name=?", "web_file_size=?", "web_mime=?");
    bind.push(webKey, r.webFile.name, r.webFile.size, r.webFile.mime);
    oldWebR2Key = cur.web_r2_key !== webKey ? cur.web_r2_key : null;
  } else if (r.removeWeb) {
    sets.push("web_r2_key=NULL", "web_file_name=NULL", "web_file_size=NULL", "web_mime=NULL");
    oldWebR2Key = cur.web_r2_key || null;
  }

  await env.DB.prepare(`UPDATE case_images SET ${sets.join(", ")} WHERE id=?`).bind(...bind, iid).run();
  if (oldR2Key && env.FILES) await env.FILES.delete(oldR2Key).catch(() => {});
  if (oldWebR2Key && env.FILES) await env.FILES.delete(oldWebR2Key).catch(() => {});

  const row = await env.DB.prepare(`${SELECT} WHERE i.id = ?`).bind(iid).first();
  return json(rowToImage(row));
}

// 削除（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。R2 のファイルも消す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  const iid = params.id;
  const cur = await env.DB.prepare(`SELECT case_id, r2_key, web_r2_key FROM case_images WHERE id = ?`).bind(iid).first();
  if (!cur) return json({ error: "not found" }, 404);
  const auth = await authorizeCaseWrite(request, env, id, cur.case_id);
  if (!auth.ok) return json({ error: "forbidden" }, 403);
  await env.DB.prepare(`DELETE FROM case_images WHERE id = ?`).bind(iid).run();
  if (cur.r2_key && env.FILES) await env.FILES.delete(cur.r2_key).catch(() => {});
  if (cur.web_r2_key && env.FILES) await env.FILES.delete(cur.web_r2_key).catch(() => {});
  return json({ ok: true });
}
