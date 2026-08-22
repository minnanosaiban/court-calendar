import {
  json, newId, rowToCase, caseFromBody, CASE_COLS,
  getIdentity, authorizeWrite, viewerHash,
} from "../_common.js";

// 事件の一覧は、いいねの数と「この端末が押したか」を一緒に返す（最初の ? に viewer のハッシュを bind する）
export function casesSelect() {
  return `
    SELECT ${CASE_COLS},
           (SELECT COUNT(*) FROM likes l WHERE l.case_id = c.id) AS likes,
           (SELECT COUNT(*) FROM likes l WHERE l.case_id = c.id AND l.viewer = ?) AS liked
      FROM cases c`;
}

// 一覧（誰でも閲覧可）
export async function onRequestGet({ request, env }) {
  const viewer = (await viewerHash(request)) || "";
  const { results } = await env.DB.prepare(`${casesSelect()} ORDER BY c.name`).bind(viewer).all();
  return json((results || []).map(rowToCase));
}

// 追加（書き込み権限が必要）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const c = caseFromBody(body);
  if (!c.name) return json({ error: "事件名は必須です" }, 400);

  const dup = await env.DB.prepare(`SELECT id FROM cases WHERE name = ?`).bind(c.name).first();
  if (dup) return json({ error: "同じ名前の事件がすでにあります" }, 409);

  const cid = newId("c");
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO cases (id, name, case_no, parties, judge, points, lede, call_text, host, contact, press, links, tags,
                        archived_at, close_type, result,
                        created_by, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(cid, c.name, c.case_no, c.parties, c.judge, c.points, c.lede, c.call_text, c.host, c.contact, c.press, c.links, c.tags,
         c.archived_at, c.close_type, c.result,
         id.email, id.email, now).run();

  const row = await env.DB.prepare(`${casesSelect()} WHERE c.id = ?`).bind("", cid).first();
  return json(rowToCase(row), 201);
}
