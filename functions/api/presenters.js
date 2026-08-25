import {
  json, newId, rowToPresenter, PRESENTER_COLS,
  getIdentity, authorizeWrite,
} from "../_common.js";

// 問題提起人の一覧は、持っている事件の件数も一緒に返す（事件編集フォームのプルダウン・管理画面用）
export function presentersSelect() {
  return `
    SELECT ${PRESENTER_COLS},
           (SELECT COUNT(*) FROM cases c WHERE c.presenter_id = presenters.id) AS case_count
      FROM presenters`;
}

// 一覧（誰でも閲覧可。アイコン・ニックネームは公開情報）
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`${presentersSelect()} ORDER BY nickname`).all();
  return json((results || []).map(rowToPresenter));
}

// 追加（書き込み権限が必要）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const nickname = String(body.nickname || "").trim();
  if (!nickname) return json({ error: "ニックネームは必須です" }, 400);

  const pid = newId("pr");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO presenters (id, nickname, created_by, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(pid, nickname, id.email, id.email, now).run();

  const row = await env.DB.prepare(`${presentersSelect()} WHERE presenters.id = ?`).bind(pid).first();
  return json(rowToPresenter(row), 201);
}
