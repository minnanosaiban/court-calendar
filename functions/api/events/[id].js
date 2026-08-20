import { json, rowToEvent, getIdentity, authorizeWrite } from "../../_common.js";

const COLS = `id, case_name, case_no, date, time, type, court, place, parties, host, contact,
              lede, points, open, level, created_by, updated_by, updated_at`;

function pointsToText(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean).join("\n");
  return String(v || "").trim();
}

// 更新（書き込み権限が必要）
export async function onRequestPut({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const eid = params.id;
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }

  const caseName = String(body.case || "").trim();
  const date = String(body.date || "").trim();
  if (!caseName || !date) return json({ error: "事件名と期日は必須です" }, 400);

  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    `UPDATE events
        SET case_name=?, case_no=?, date=?, time=?, type=?, court=?, place=?,
            parties=?, host=?, contact=?, lede=?, points=?, open=?, level=?,
            updated_by=?, updated_at=?
      WHERE id=?`
  ).bind(
    caseName,
    String(body.caseNo || "").trim(),
    date,
    String(body.time || "").trim(),
    String(body.type || "").trim(),
    String(body.court || "").trim(),
    String(body.place || "").trim(),
    String(body.parties || "").trim(),
    String(body.host || "").trim(),
    String(body.contact || "").trim(),
    String(body.lede || "").trim(),
    pointsToText(body.points),
    body.open === false ? 0 : 1,
    String(body.level || "").trim(),
    id.email, now, eid
  ).run();

  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);

  const row = await env.DB.prepare(`SELECT ${COLS} FROM events WHERE id=?`).bind(eid).first();
  return json(rowToEvent(row));
}

// 削除（書き込み権限が必要）
export async function onRequestDelete({ request, env, params }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const res = await env.DB.prepare(`DELETE FROM events WHERE id=?`).bind(params.id).run();
  if (!res.meta || res.meta.changes === 0) return json({ error: "not found" }, 404);
  return json({ ok: true });
}
