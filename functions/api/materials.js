import {
  json, newId, rowToMaterial, linesToText, MATERIAL_COLS, isMaterialUrl,
  MATERIAL_SIDES, MATERIAL_KINDS, MATERIAL_MIMES, MATERIAL_MAX_BYTES,
  getIdentity, authorizeWrite, putFile,
} from "../_common.js";
export { putFile };

export const SELECT = `SELECT ${MATERIAL_COLS} FROM materials m WHERE m.hidden = 0`;

// 一覧（誰でも閲覧可）。?case=<id> で1つの事件にしぼれる。
export async function onRequestGet({ request, env }) {
  const caseId = new URL(request.url).searchParams.get("case");
  const order = ` ORDER BY COALESCE(m.filed_on, '9999') , m.created_at`;
  const stmt = caseId
    ? env.DB.prepare(`${SELECT} AND m.case_id = ?${order}`).bind(caseId)
    : env.DB.prepare(`${SELECT}${order}`);
  const { results } = await stmt.all();
  return json((results || []).map(rowToMaterial));
}

// フォーム（multipart/form-data）を読んで、DBに入れる形にそろえる。
// ファイルは任意。付いていれば種類とサイズを確かめて返す。
export async function readMaterialForm(request, env) {
  let form;
  try { form = await request.formData(); } catch { return { error: "bad form" }; }
  const get = (k) => String(form.get(k) ?? "").trim();

  const caseId = get("caseId");
  const title = get("title");
  if (!caseId) return { error: "事件が指定されていません" };
  if (!title) return { error: "資料名は必須です" };
  const c = await env.DB.prepare(`SELECT id FROM cases WHERE id = ?`).bind(caseId).first();
  if (!c) return { error: "その事件が見つかりません" };

  const eventId = get("eventId");
  if (eventId) {
    const ev = await env.DB.prepare(`SELECT id FROM events WHERE id = ? AND case_id = ?`).bind(eventId, caseId).first();
    if (!ev) return { error: "その期日が見つかりません" };
  }
  const side = get("side");
  const kind = get("kind");
  if (side && !MATERIAL_SIDES.includes(side)) return { error: "提出者側の値が不正です" };
  if (kind && !MATERIAL_KINDS.includes(kind)) return { error: "種別の値が不正です" };
  const filedOn = get("filedOn");
  if (filedOn && !/^\d{4}-\d{2}-\d{2}$/.test(filedOn)) return { error: "提出日の形式が不正です" };
  const url = get("url");
  if (url && !isMaterialUrl(url)) return { error: "ファイルのURLは https://… か /docs/… の形で入れてください" };

  const body = String(form.get("body") ?? "").trim();   // Markdown。段落の空行を保つので行ごとには整えない
  if (body.length > 300000) return { error: "本文が長すぎます（30万字まで）" };

  const fields = {
    case_id: caseId,
    event_id: eventId || null,
    title,
    side, kind,
    filed_on: filedOn || null,
    url: url || null,
    claims: linesToText(get("claims")),
    body,
    summary: get("summary"),
  };

  let file = null;
  const f = form.get("file");
  if (f && typeof f === "object" && typeof f.arrayBuffer === "function" && f.size > 0) {
    if (!env.FILES) return { error: "ファイルのアップロード（R2）はまだ使えません。URL欄に場所を入れてください" };
    const ext = MATERIAL_MIMES[f.type];
    if (!ext) return { error: "ファイルは PDF・PNG・JPEG のみ登録できます" };
    if (f.size > MATERIAL_MAX_BYTES) return { error: "ファイルは20MBまでです" };
    file = { blob: f, ext, name: f.name || ("file." + ext), size: f.size, mime: f.type };
  }
  return { fields, file, removeFile: get("removeFile") === "1" };
}

// 追加（書き込み権限が必要）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const r = await readMaterialForm(request, env);
  if (r.error) return json({ error: r.error }, 400);

  const mid = newId("m");
  const now = new Date().toISOString();
  let r2 = { key: null, name: null, size: null, mime: null };
  if (r.file) {
    const key = await putFile(env, "m", mid, r.file);
    r2 = { key, name: r.file.name, size: r.file.size, mime: r.file.mime };
  }
  const f = r.fields;
  await env.DB.prepare(
    `INSERT INTO materials (id, case_id, event_id, title, side, kind, filed_on, url,
                            r2_key, file_name, file_size, mime, claims, body, summary,
                            hidden, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
  ).bind(mid, f.case_id, f.event_id, f.title, f.side, f.kind, f.filed_on, f.url,
         r2.key, r2.name, r2.size, r2.mime, f.claims, f.body, f.summary,
         id.email, id.email, now, now).run();

  const row = await env.DB.prepare(`${SELECT} AND m.id = ?`).bind(mid).first();
  return json(rowToMaterial(row), 201);
}
