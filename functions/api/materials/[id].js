import { json, rowToMaterial, getIdentity, authorizeCaseWrite, actorLabel } from "../../_common.js";
import { SELECT, readMaterialForm, putFile } from "../materials.js";

// 更新（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ。付け替え先も自分の事件のみ）。
// multipart で受け、ファイルが付いていれば差し替える。removeFile=1 ならファイルだけ外す（目録は残す）。
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  const mid = params.id;
  const cur = await env.DB.prepare(`SELECT case_id, r2_key FROM materials WHERE id = ?`).bind(mid).first();
  if (!cur) return json({ error: "not found" }, 404);
  const authOld = await authorizeCaseWrite(request, env, id, cur.case_id);
  if (!authOld.ok) return json({ error: "forbidden" }, 403);

  const r = await readMaterialForm(request, env);
  if (r.error) return json({ error: r.error }, 400);
  const auth = r.fields.case_id === cur.case_id ? authOld : await authorizeCaseWrite(request, env, id, r.fields.case_id);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  let r2 = null;   // null = ファイルは触らない
  if (r.file) {
    const key = await putFile(env, "m", mid, r.file);
    r2 = { key, name: r.file.name, size: r.file.size, mime: r.file.mime };
  } else if (r.removeFile) {
    r2 = { key: null, name: null, size: null, mime: null };
  }

  const f = r.fields;
  const now = new Date().toISOString();
  if (r2) {
    await env.DB.prepare(
      `UPDATE materials
          SET case_id=?, event_id=?, title=?, side=?, filed_on=?, url=?, claims=?, body=?, summary=?,
              summary_model=?, summary_date=?,
              r2_key=?, file_name=?, file_size=?, mime=?, updated_by=?, updated_at=?
        WHERE id=?`
    ).bind(f.case_id, f.event_id, f.title, f.side, f.filed_on, f.url, f.claims, f.body, f.summary,
           f.summary_model, f.summary_date,
           r2.key, r2.name, r2.size, r2.mime, actorLabel(id, auth), now, mid).run();
    // 古いファイルは DB を更新してから消す（途中で失敗しても目録が壊れないように）
    if (cur.r2_key && cur.r2_key !== r2.key && env.FILES) await env.FILES.delete(cur.r2_key).catch(() => {});
  } else {
    await env.DB.prepare(
      `UPDATE materials
          SET case_id=?, event_id=?, title=?, side=?, filed_on=?, url=?, claims=?, body=?, summary=?,
              summary_model=?, summary_date=?,
              updated_by=?, updated_at=?
        WHERE id=?`
    ).bind(f.case_id, f.event_id, f.title, f.side, f.filed_on, f.url, f.claims, f.body, f.summary,
           f.summary_model, f.summary_date,
           actorLabel(id, auth), now, mid).run();
  }

  const row = await env.DB.prepare(`${SELECT} AND m.id = ?`).bind(mid).first();
  return json(rowToMaterial(row));
}

// 削除（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）。R2 のファイルも消す
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  const mid = params.id;
  const cur = await env.DB.prepare(`SELECT case_id, r2_key FROM materials WHERE id = ?`).bind(mid).first();
  if (!cur) return json({ error: "not found" }, 404);
  const auth = await authorizeCaseWrite(request, env, id, cur.case_id);
  if (!auth.ok) return json({ error: "forbidden" }, 403);
  await env.DB.prepare(`DELETE FROM materials WHERE id = ?`).bind(mid).run();
  if (cur.r2_key && env.FILES) await env.FILES.delete(cur.r2_key).catch(() => {});
  return json({ ok: true });
}
