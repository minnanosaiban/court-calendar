import { json, rowToImage, putFile, getIdentity, authorizeCaseWrite } from "../../_common.js";
import { SELECT, readImageForm } from "../images.js";

// 更新（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。
// caption・並び順（sortOrder）の変更、ファイルの差し替えができる。並び替え（入れ替えボタン）は sortOrder だけを送る呼び出しになる。
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const iid = params.id;
  const cur = await env.DB.prepare(`SELECT case_id, r2_key, sort_order FROM case_images WHERE id = ?`).bind(iid).first();
  if (!cur) return json({ error: "not found" }, 404);
  const auth = await authorizeCaseWrite(request, env, id, cur.case_id);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const r = await readImageForm(request, env, false);
  if (r.error) return json({ error: r.error }, 400);
  const f = r.fields;
  const sortOrder = f.sort_order === null ? cur.sort_order : f.sort_order;

  if (r.file) {
    const key = await putFile(env, "i", iid, r.file);
    await env.DB.prepare(
      `UPDATE case_images SET caption=?, sort_order=?, r2_key=?, file_name=?, file_size=?, mime=? WHERE id=?`
    ).bind(f.caption, sortOrder, key, r.file.name, r.file.size, r.file.mime, iid).run();
    if (cur.r2_key && cur.r2_key !== key && env.FILES) await env.FILES.delete(cur.r2_key).catch(() => {});
  } else {
    await env.DB.prepare(
      `UPDATE case_images SET caption=?, sort_order=? WHERE id=?`
    ).bind(f.caption, sortOrder, iid).run();
  }

  const row = await env.DB.prepare(`${SELECT} WHERE i.id = ?`).bind(iid).first();
  return json(rowToImage(row));
}

// 削除（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。R2 のファイルも消す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  const iid = params.id;
  const cur = await env.DB.prepare(`SELECT case_id, r2_key FROM case_images WHERE id = ?`).bind(iid).first();
  if (!cur) return json({ error: "not found" }, 404);
  const auth = await authorizeCaseWrite(request, env, id, cur.case_id);
  if (!auth.ok) return json({ error: "forbidden" }, 403);
  await env.DB.prepare(`DELETE FROM case_images WHERE id = ?`).bind(iid).run();
  if (cur.r2_key && env.FILES) await env.FILES.delete(cur.r2_key).catch(() => {});
  return json({ ok: true });
}
