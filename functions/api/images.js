import {
  json, newId, rowToImage, IMAGE_COLS, IMAGE_MIMES, IMAGE_MAX_BYTES, putFile,
  getIdentity, authorizeWrite,
} from "../_common.js";

export const SELECT = `SELECT ${IMAGE_COLS} FROM case_images i`;

// 一覧（誰でも閲覧可）。?case=<id> で1つの事件にしぼれる。
export async function onRequestGet({ request, env }) {
  const caseId = new URL(request.url).searchParams.get("case");
  const order = ` ORDER BY i.sort_order, i.created_at`;
  const stmt = caseId
    ? env.DB.prepare(`${SELECT} WHERE i.case_id = ?${order}`).bind(caseId)
    : env.DB.prepare(`${SELECT}${order}`);
  const { results } = await stmt.all();
  return json((results || []).map(rowToImage));
}

// フォーム（multipart/form-data）を読む。caption・並び順は任意、caseId は必須。
// file は新規追加では必須（写真は本文と違い、常にファイルが要る）。差し替え時は無くてもよい。
export async function readImageForm(request, env, requireFile) {
  let form;
  try { form = await request.formData(); } catch { return { error: "bad form" }; }
  const get = (k) => String(form.get(k) ?? "").trim();

  const caseId = get("caseId");
  if (!caseId) return { error: "事件が指定されていません" };
  const c = await env.DB.prepare(`SELECT id FROM cases WHERE id = ?`).bind(caseId).first();
  if (!c) return { error: "その事件が見つかりません" };

  const sortOrderRaw = get("sortOrder");
  const fields = {
    case_id: caseId,
    caption: get("caption"),
    sort_order: sortOrderRaw === "" ? null : Number(sortOrderRaw),   // null = 変更しない
  };

  let file = null;
  const f = form.get("file");
  if (f && typeof f === "object" && typeof f.arrayBuffer === "function" && f.size > 0) {
    if (!env.FILES) return { error: "写真のアップロード（R2）はまだ使えません" };
    const ext = IMAGE_MIMES[f.type];
    if (!ext) return { error: "写真は JPEG・PNG・WebP のみ登録できます" };
    if (f.size > IMAGE_MAX_BYTES) return { error: "写真は12MBまでです" };
    file = { blob: f, ext, name: f.name || ("file." + ext), size: f.size, mime: f.type };
  } else if (requireFile) {
    return { error: "写真ファイルを選んでください" };
  }
  return { fields, file };
}

// 追加（書き込み権限が必要）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  if (!authorizeWrite(request, env, id)) return json({ error: "forbidden" }, 403);

  const r = await readImageForm(request, env, true);
  if (r.error) return json({ error: r.error }, 400);

  const iid = newId("i");
  const now = new Date().toISOString();
  const key = await putFile(env, "i", iid, r.file);
  const max = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM case_images WHERE case_id = ?`)
    .bind(r.fields.case_id).first();

  await env.DB.prepare(
    `INSERT INTO case_images (id, case_id, r2_key, file_name, file_size, mime, caption, sort_order, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(iid, r.fields.case_id, key, r.file.name, r.file.size, r.file.mime, r.fields.caption,
         (max.m ?? -1) + 1, id.email, now).run();

  const row = await env.DB.prepare(`${SELECT} WHERE i.id = ?`).bind(iid).first();
  return json(rowToImage(row), 201);
}
