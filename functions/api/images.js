import {
  json, newId, rowToImage, IMAGE_COLS, IMAGE_MIMES, IMAGE_MAX_BYTES, putFile,
  getIdentity, hiddenCaseIds, authorizeCaseWrite, actorLabel, getPresenterSession, myCaseIds,
} from "../_common.js";

export const SELECT = `SELECT ${IMAGE_COLS} FROM case_images i`;

// 一覧（誰でも閲覧可）。?case=<id> で1つの事件にしぼれる。
// 非公開にした事件の写真は合言葉が合った人にだけ返す（自分の事件は常に見える）。
export async function onRequestGet({ request, env }) {
  const caseId = new URL(request.url).searchParams.get("case");
  const order = ` ORDER BY i.sort_order, i.created_at`;
  const stmt = caseId
    ? env.DB.prepare(`${SELECT} WHERE i.case_id = ?${order}`).bind(caseId)
    : env.DB.prepare(`${SELECT}${order}`);
  const [{ results }, hidden, session] = await Promise.all([
    stmt.all(), hiddenCaseIds(env, request), getPresenterSession(request, env),
  ]);
  const mine = await myCaseIds(env, session);
  return json((results || []).filter((r) => !hidden.has(r.case_id) || mine.has(r.case_id)).map(rowToImage));
}

// 1枚分のファイルを検証する（file・webFile 共通）。フィールド名はエラー文言の言い分けにだけ使う
function readImageFile(form, key, label) {
  const f = form.get(key);
  if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function" || f.size === 0) return { file: null };
  const ext = IMAGE_MIMES[f.type];
  if (!ext) return { error: `${label}は JPEG・PNG・WebP のみ登録できます` };
  if (f.size > IMAGE_MAX_BYTES) return { error: `${label}は12MBまでです` };
  return { file: { blob: f, ext, name: f.name || ("file." + ext), size: f.size, mime: f.type } };
}

// フォーム（multipart/form-data）を読む。caption・並び順は任意、caseId は必須。
// file は新規追加では必須（写真は本文と違い、常にファイルが要る）。差し替え時は無くてもよい。
// webFile はWeb用バリエーション（任意・常に省略可）。removeWeb="1" ならWeb用だけを外す
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

  if (!env.FILES && (form.get("file") || form.get("webFile"))) {
    return { error: "写真のアップロード（R2）はまだ使えません" };
  }
  const main = readImageFile(form, "file", "写真");
  if (main.error) return { error: main.error };
  if (!main.file && requireFile) return { error: "写真ファイルを選んでください" };
  const web = readImageFile(form, "webFile", "Web用画像");
  if (web.error) return { error: web.error };

  return { fields, file: main.file, webFile: web.file, removeWeb: get("removeWeb") === "1" };
}

// 追加（書き込み権限が必要。運営は全事件、問題提起人は自分の事件だけ）
export async function onRequestPost({ request, env }) {
  const id = await getIdentity(request, env);
  const r = await readImageForm(request, env, true);
  if (r.error) return json({ error: r.error }, 400);
  const auth = await authorizeCaseWrite(request, env, id, r.fields.case_id);
  if (!auth.ok) return json({ error: "forbidden" }, 403);

  const iid = newId("i");
  const now = new Date().toISOString();
  const key = await putFile(env, "i", iid, r.file);
  const webKey = r.webFile ? await putFile(env, "iw", iid, r.webFile) : null;
  const max = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM case_images WHERE case_id = ?`)
    .bind(r.fields.case_id).first();

  await env.DB.prepare(
    `INSERT INTO case_images (id, case_id, r2_key, file_name, file_size, mime, web_r2_key, web_file_name, web_file_size, web_mime, caption, sort_order, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(iid, r.fields.case_id, key, r.file.name, r.file.size, r.file.mime,
         webKey, r.webFile ? r.webFile.name : null, r.webFile ? r.webFile.size : null, r.webFile ? r.webFile.mime : null,
         r.fields.caption, (max.m ?? -1) + 1, actorLabel(id, auth), now).run();

  const row = await env.DB.prepare(`${SELECT} WHERE i.id = ?`).bind(iid).first();
  return json(rowToImage(row), 201);
}
