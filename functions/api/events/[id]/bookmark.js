import { json, viewerHash } from "../../../_common.js";

// 期日のお気に入り（ログイン不要）。likes（cases/[id]/like.js）と同じ端末識別子の方式だが、
// こちらは件数を出さない・自分専用のON/OFFの目印なので、返すのは bookmarked の有無だけ。
// 端末ごとの識別子（X-Viewer）をハッシュして (event_id, viewer) を主キーに持つので、同じ端末から何度押しても1件。

async function state(env, eid, viewer) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS bookmarked FROM event_bookmarks WHERE event_id = ? AND viewer = ?`
  ).bind(eid, viewer).first();
  return { bookmarked: !!row.bookmarked };
}

export async function onRequestPost({ request, env, params }) {
  const viewer = await viewerHash(request);
  if (!viewer) return json({ error: "bad viewer" }, 400);
  const eid = params.id;
  const e = await env.DB.prepare(`SELECT id FROM events WHERE id = ?`).bind(eid).first();
  if (!e) return json({ error: "not found" }, 404);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO event_bookmarks (event_id, viewer, created_at) VALUES (?, ?, ?)`
  ).bind(eid, viewer, new Date().toISOString()).run();
  return json(await state(env, eid, viewer));
}

export async function onRequestDelete({ request, env, params }) {
  const viewer = await viewerHash(request);
  if (!viewer) return json({ error: "bad viewer" }, 400);
  const eid = params.id;
  await env.DB.prepare(`DELETE FROM event_bookmarks WHERE event_id = ? AND viewer = ?`).bind(eid, viewer).run();
  return json(await state(env, eid, viewer));
}
