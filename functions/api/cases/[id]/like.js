import { json, viewerHash } from "../../../_common.js";

// いいね（事件単位・ログイン不要）。
// 端末ごとの識別子（X-Viewer）をハッシュして (case_id, viewer) を主キーに持つので、同じ端末から何度押しても1件。
// 識別子を消して押し直せば増やせるが、表示上の目安なので厳密さはそこまで求めない。

async function count(env, cid, viewer) {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM likes WHERE case_id = ?) AS likes,
            (SELECT COUNT(*) FROM likes WHERE case_id = ? AND viewer = ?) AS liked`
  ).bind(cid, cid, viewer).first();
  return { likes: Number(row.likes || 0), liked: !!row.liked };
}

export async function onRequestPost({ request, env, params }) {
  const viewer = await viewerHash(request);
  if (!viewer) return json({ error: "bad viewer" }, 400);
  const cid = params.id;
  const c = await env.DB.prepare(`SELECT id FROM cases WHERE id = ?`).bind(cid).first();
  if (!c) return json({ error: "not found" }, 404);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO likes (case_id, viewer, created_at) VALUES (?, ?, ?)`
  ).bind(cid, viewer, new Date().toISOString()).run();
  return json(await count(env, cid, viewer));
}

export async function onRequestDelete({ request, env, params }) {
  const viewer = await viewerHash(request);
  if (!viewer) return json({ error: "bad viewer" }, 400);
  const cid = params.id;
  await env.DB.prepare(`DELETE FROM likes WHERE case_id = ? AND viewer = ?`).bind(cid, viewer).run();
  return json(await count(env, cid, viewer));
}
