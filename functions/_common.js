// 共有ヘルパー（_ 始まりなのでルートにはならず、各APIから import して使う）

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

export function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// 「1行1項目」のテキスト列。フォームからは配列でも改行区切りの文字列でも受け取り、DBには改行区切りで保存する
export function linesToText(v) {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean).join("\n");
  return String(v || "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n");
}
export function textToLines(s) {
  return s ? String(s).split("\n").map((x) => x.trim()).filter(Boolean) : [];
}

// ---- 事件 ----
// presenters は LEFT JOIN で引く（p. で参照。FROM 句は casesSelect() 側で JOIN する）
export const CASE_COLS = `c.id, c.name, c.presenter_id, p.nickname AS presenter_nickname, p.icon_r2_key AS presenter_icon_r2_key,
                          c.case_no, c.case_no_public, c.show_case_no_on_top,
                          c.plaintiff_name, c.show_plaintiff_on_top, c.defendant_name, c.show_defendant_on_top,
                          c.judge, c.show_judge_on_top, c.points, c.show_points_on_top, c.call_text, c.show_call_on_top,
                          c.contact, c.press, c.show_press_on_top, c.plaintiff_links, c.defendant_links, c.tags,
                          c.related_case_ids, c.show_related_on_top, c.archived_at, c.close_type,
                          c.board_enabled, c.board_restricted, c.notice_r2_key, c.notice_file_name, c.notice_file_size, c.notice_mime,
                          c.created_by, c.updated_by, c.updated_at`;

export function rowToCase(r) {
  return {
    id: r.id,
    name: r.name,
    presenterId: r.presenter_id || "",
    presenterNickname: r.presenter_nickname || "",
    presenterIcon: r.presenter_icon_r2_key ? "/files/" + r.presenter_icon_r2_key : "",
    caseNo: r.case_no || "",
    caseNoPublic: r.case_no_public === 1 || r.case_no_public === true,
    showCaseNoOnTop: r.show_case_no_on_top === 1 || r.show_case_no_on_top === true,
    plaintiffName: r.plaintiff_name || "",
    showPlaintiffOnTop: r.show_plaintiff_on_top === 1 || r.show_plaintiff_on_top === true,
    defendantName: r.defendant_name || "",
    showDefendantOnTop: r.show_defendant_on_top === 1 || r.show_defendant_on_top === true,
    judge: r.judge || "",
    showJudgeOnTop: r.show_judge_on_top === 1 || r.show_judge_on_top === true,
    points: textToLines(r.points),
    showPointsOnTop: r.show_points_on_top === 1 || r.show_points_on_top === true,
    callText: r.call_text || "",
    showCallOnTop: r.show_call_on_top === 1 || r.show_call_on_top === true,
    contact: r.contact || "",
    press: textToLines(r.press),
    showPressOnTop: r.show_press_on_top === 1 || r.show_press_on_top === true,
    plaintiffLinks: textToLines(r.plaintiff_links).filter(isHttpUrl),
    defendantLinks: textToLines(r.defendant_links).filter(isHttpUrl),
    tags: textToLines(r.tags),
    relatedCaseIds: textToLines(r.related_case_ids),
    showRelatedOnTop: r.show_related_on_top === 1 || r.show_related_on_top === true,
    archivedAt: r.archived_at || "",
    closeType: r.close_type || "",
    boardEnabled: r.board_enabled === 0 || r.board_enabled === false ? false : true,
    boardRestricted: r.board_restricted === 1 || r.board_restricted === true,
    noticeUrl: r.notice_r2_key ? "/files/" + r.notice_r2_key : "",
    noticeFileName: r.notice_file_name || "",
    noticeMime: r.notice_mime || "",
    likes: Number(r.likes || 0),
    liked: !!r.liked,
    updatedAt: r.updated_at || "",
  };
}
export function isHttpUrl(s) {
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; }
  catch { return false; }
}
// 事件フォームの入力を、DBに入れる形にそろえる
export function caseFromBody(body) {
  return {
    name: String(body.name || "").trim(),
    presenter_id: String(body.presenterId || "").trim() || null,
    case_no: String(body.caseNo || "").trim(),
    case_no_public: body.caseNoPublic === true ? 1 : 0,
    show_case_no_on_top: body.showCaseNoOnTop === true ? 1 : 0,
    plaintiff_name: String(body.plaintiffName || "").trim(),
    show_plaintiff_on_top: body.showPlaintiffOnTop === true ? 1 : 0,
    defendant_name: String(body.defendantName || "").trim(),
    show_defendant_on_top: body.showDefendantOnTop === true ? 1 : 0,
    judge: String(body.judge || "").trim(),
    show_judge_on_top: body.showJudgeOnTop === true ? 1 : 0,
    points: linesToText(body.points),
    show_points_on_top: body.showPointsOnTop === true ? 1 : 0,
    call_text: String(body.callText || "").trim(),
    show_call_on_top: body.showCallOnTop === true ? 1 : 0,
    contact: String(body.contact || "").trim(),
    press: linesToText(body.press),
    show_press_on_top: body.showPressOnTop === true ? 1 : 0,
    plaintiff_links: textToLines(linesToText(body.plaintiffLinks)).filter(isHttpUrl).join("\n"),
    defendant_links: textToLines(linesToText(body.defendantLinks)).filter(isHttpUrl).join("\n"),
    tags: linesToText(body.tags),
    related_case_ids: linesToText(body.relatedCaseIds),
    show_related_on_top: body.showRelatedOnTop === true ? 1 : 0,
    archived_at: isYmd(body.archivedAt) ? body.archivedAt : null,
    close_type: String(body.closeType || "").trim(),
    board_enabled: body.boardEnabled === false ? 0 : 1,
    board_restricted: body.boardRestricted === true ? 1 : 0,
  };
}
export function isYmd(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// 事件名（cases.name）はUNIQUE制約があるが、同種の事件（同じ内容で被告違いなど）が複数件になる
// 運用が増えてきたため、重複していたらエラーで止めずに全角の連番を自動で振って作成・変更できる
// ようにする。例：「〇〇をめぐる訴訟」が既にあれば「〇〇をめぐる訴訟２」、それも有れば「３」…と
// 空いている番号を1つずつ探す（2026-08-28）。excludeId は自分自身の改名時に自分を除外するため
const FULLWIDTH_DIGITS = "０１２３４５６７８９";
function toFullWidthNumber(n) {
  return String(n).split("").map((d) => FULLWIDTH_DIGITS[Number(d)]).join("");
}
export async function uniqueCaseName(env, name, excludeId) {
  const taken = async (n) => {
    const stmt = excludeId
      ? env.DB.prepare(`SELECT id FROM cases WHERE name = ? AND id <> ?`).bind(n, excludeId)
      : env.DB.prepare(`SELECT id FROM cases WHERE name = ?`).bind(n);
    return !!(await stmt.first());
  };
  if (!(await taken(name))) return name;
  let i = 2;
  while (await taken(name + toFullWidthNumber(i))) i++;
  return name + toFullWidthNumber(i);
}

// 事件番号（case_no）は既定では運営が事件を見分けるための内部用の欄で、画面にもAPI応答にも出さない。
// 書き込み権限がある人（＝編集する人）には常にそのまま返す。書き込み権限が無い人には、
// 「公開してもよい」とチェックされた事件（case_no_public=1）にだけそのまま返し、それ以外は隠す（2026-08-28）。
export function redactCaseNo(rows, canWrite) {
  if (canWrite) return rows;
  for (const r of rows) { if (!r.case_no_public) r.case_no = null; }
  return rows;
}

// ---- 事件ごとの閲覧制限（view_key） ----
// 非公開にした事件（cases.view_key が入っている）は、正しい合言葉を持っている人にだけ見せる。
// 合言葉はブラウザ側が "X-View-Keys" ヘッダで「事件id:合言葉」をカンマ区切りにして送る（lib.js 側で組み立てる）。

// ヘッダを { caseId: key } の形にほどく
export function parseViewKeys(request) {
  const raw = request.headers.get("X-View-Keys") || "";
  const map = {};
  for (const pair of raw.split(",")) {
    const i = pair.indexOf(":");
    if (i < 0) continue;
    const id = pair.slice(0, i).trim();
    const key = pair.slice(i + 1).trim();
    if (id && key) map[id] = key;
  }
  return map;
}

// このリクエストからは見せてはいけない事件idの集合を返す
// （view_key が設定されている事件のうち、合言葉が一致しなかったもの）。
// 一覧系APIは、結果を返す前にこの集合で自分の行を除く。
export async function hiddenCaseIds(env, request) {
  const { results } = await env.DB.prepare(
    `SELECT id, view_key FROM cases WHERE view_key IS NOT NULL AND view_key <> ''`
  ).all();
  if (!results || !results.length) return new Set();
  const sent = parseViewKeys(request);
  const hidden = new Set();
  for (const row of results) {
    if (sent[row.id] !== row.view_key) hidden.add(row.id);
  }
  return hidden;
}

// ---- 問題提起人（アイコン＋ニックネーム。1人が複数の事件を持てる） ----
export const PRESENTER_COLS = `id, nickname, icon_r2_key, created_by, updated_by, updated_at`;

export function rowToPresenter(r) {
  return {
    id: r.id,
    nickname: r.nickname,
    icon: r.icon_r2_key ? "/files/" + r.icon_r2_key : "",
    caseCount: r.case_count != null ? Number(r.case_count) : undefined,
    updatedAt: r.updated_at || "",
  };
}

// ---- 期日 ----
// bookmarked は「この端末がお気に入りにしたか」（件数は出さない、liked と違って likes 相当の集計は無い）。
// 呼び出し側は SELECT の最初の ? に viewer のハッシュを bind すること（casesSelect() の liked と同じ形）。
export const EVENT_COLS = `e.id, e.case_id, e.date, e.time, e.type, e.court, e.place, e.open, e.report_meeting,
                           e.plaintiff_argument, e.defendant_argument,
                           e.created_by, e.updated_by, e.updated_at, c.name AS case_name,
                           (SELECT COUNT(*) FROM event_bookmarks eb WHERE eb.event_id = e.id AND eb.viewer = ?) AS bookmarked`;
export const EVENT_FROM = `FROM events e JOIN cases c ON c.id = e.case_id`;

export function rowToEvent(r) {
  return {
    id: r.id,
    caseId: r.case_id,
    case: r.case_name || "",
    date: r.date,
    time: r.time || "",
    type: r.type || "",
    court: r.court || "",
    place: r.place || "",
    open: r.open === 0 || r.open === false ? false : true,
    reportMeeting: r.report_meeting === 1 || r.report_meeting === true,
    plaintiffArgument: textToLines(r.plaintiff_argument),
    defendantArgument: textToLines(r.defendant_argument),
    bookmarked: !!r.bookmarked,
    updatedAt: r.updated_at || "",
  };
}

// 期日の追加・更新で「事件」を決める。caseId があればそれ、無ければ事件名で探す。
// 見つからない場合は null（事件が先に登録されていないと期日は追加できない＝誤字での事件乱立を防ぐ）。
// 旧形式のバックアップ取り込みなど、事件を自動で起こしたい場合は呼び出し側で明示的に事件を作ってから渡すこと。
export async function resolveCaseId(env, body, email) {
  const caseId = String(body.caseId || "").trim();
  if (caseId) {
    const row = await env.DB.prepare(`SELECT id FROM cases WHERE id = ?`).bind(caseId).first();
    if (row) return row.id;
  }
  const name = String(body.case || "").trim();
  if (!name) return null;
  const found = await env.DB.prepare(`SELECT id FROM cases WHERE name = ?`).bind(name).first();
  return found ? found.id : null;
}

// ---- 期日案内（支援者が作る一覧チラシ。JPEGのみ。1事件につき1枚・差し替え専用） ----
// 2026-08-28：PDF・PNGも受け付けていたが、ファイルサイズが小さく済むJPEGのみに絞った。
// 既存データにPDF・PNGの期日案内が残っている場合、表示（noticeHtml）は引き続き対応する（新規アップロードのみ制限）
export const NOTICE_MIMES = { "image/jpeg": "jpg" };
export const NOTICE_MAX_BYTES = 20 * 1024 * 1024;

// ---- 訴訟資料 ----
export const MATERIAL_SIDES = ["原告側", "被告側", "裁判所", "その他"];
export const MATERIAL_MIMES = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024;

export const MATERIAL_COLS = `m.id, m.case_id, m.event_id, m.title, m.side, m.filed_on,
                              m.url, m.r2_key, m.file_name, m.file_size, m.mime, m.claims, m.body, m.summary,
                              m.created_at, m.updated_at`;

// 資料の「ファイルのURL」に入れてよい形：https/http の絶対URL、またはこのサイト内の /docs/… （public/docs/ に置いたPDF）
export function isMaterialUrl(s) {
  if (!s) return false;
  if (/^\/docs\/[^\s?#]+$/.test(s)) return true;
  return isHttpUrl(s);
}

export function rowToMaterial(r) {
  return {
    id: r.id,
    caseId: r.case_id,
    eventId: r.event_id || "",
    title: r.title,
    side: r.side || "",
    filedOn: r.filed_on || "",
    url: r.url || "",                                   // 手入力のURL（public/docs/ や外部）
    fileUrl: r.r2_key ? "/files/" + r.r2_key : (r.url || ""),   // 画面が開くリンク（R2 があればそちら）
    fileName: r.file_name || "",
    fileSize: Number(r.file_size || 0),
    mime: r.mime || "",
    claims: textToLines(r.claims),
    body: r.body || "",
    summary: r.summary || "",
    createdAt: r.created_at || "",
  };
}

// R2 にファイルを置く。prefix は "m"（訴訟資料）/ "i"（写真）などキーの先頭に使う
export async function putFile(env, prefix, itemId, file) {
  const key = `${prefix}/${itemId}/${Date.now().toString(36)}.${file.ext}`;
  await env.FILES.put(key, file.blob.stream(), {
    httpMetadata: { contentType: file.mime },
    customMetadata: { name: file.name },
  });
  return key;
}

// ---- 事件の写真 ----
export const IMAGE_MIMES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const IMAGE_MAX_BYTES = 12 * 1024 * 1024;

// ---- 問題提起人のアイコン（1件だけ。上限は写真より小さくする） ----
// 2026-08-28：写真と共通のIMAGE_MIMESを流用していたが、アイコンはJPEG・WebPのみに絞った（PNGを除外）
export const ICON_MIMES = { "image/jpeg": "jpg", "image/webp": "webp" };
export const ICON_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_COLS = `i.id, i.case_id, i.r2_key, i.file_name, i.file_size, i.mime,
                           i.caption, i.sort_order, i.created_at`;

export function rowToImage(r) {
  return {
    id: r.id,
    caseId: r.case_id,
    url: "/files/" + r.r2_key,
    fileName: r.file_name || "",
    fileSize: Number(r.file_size || 0),
    mime: r.mime || "",
    caption: r.caption || "",
    sortOrder: Number(r.sort_order || 0),
    createdAt: r.created_at || "",
  };
}

// ---- いいね ----
// 端末ごとの識別子（X-Viewer ヘッダ）をそのまま保存せず、SHA-256 にして持つ
export async function viewerHash(request) {
  const v = request.headers.get("X-Viewer") || "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(v)) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- 掲示板 ----

// 投稿で選べる語。これ以外は受け付けない（自由記述は quote だけ）
export const POST_SUBJECTS = ["原告", "被告", "裁判官"];
export const POST_VERBS = ["主張した", "求めた"];
export const QUOTE_MAX = 60;

export function rowToPost(r) {
  return {
    id: r.id,
    eventId: r.event_id,
    caseId: r.case_id || "",    // JOIN してきた事件ID
    case: r.case_name || "",    // JOIN してきた事件名
    round: r.type || "",        // JOIN してきた期日の種別（第7回口頭弁論 など）
    date: r.date || "",
    subject: r.subject,
    quote: r.quote,
    verb: r.verb,
    createdAt: r.created_at || "",
  };
}

// Turnstile（スパム対策）の検証。secret 未設定なら常に false。
// success だけでなく、action（このサイトの投稿ウィジェットか）と
// hostname（本物のサイト上で取られたトークンか）も照合する。
const TURNSTILE_ACTION = "board-post";

export async function verifyTurnstile(token, env, ip) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret || !token || typeof token !== "string" || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.success) return false;
    if (data.action !== TURNSTILE_ACTION) return false;
    // TURNSTILE_HOSTNAMES（カンマ区切り）を設定している場合は、そのホストで取られたトークンだけを通す
    const allowed = String(env.TURNSTILE_HOSTNAMES || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(data.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

// 掲示板への投稿を許可するか。
//  (A) 編集パスワードを知っている人（運営）は常に可
//  (B) 一般の人は Turnstile を通過したときだけ可
//  (C) ローカル開発（LOCAL_DEV="true"）のときだけ素通し
// 本番で TURNSTILE_SECRET を設定していない間は、一般の投稿は一切通らない（公開直後も安全）。
export async function authorizePost(request, env, identity) {
  if (authorizeWrite(request, env, identity)) return true;
  if (String(env.LOCAL_DEV).toLowerCase() === "true") return true;
  const token = request.headers.get("X-Turnstile-Token");
  const ip = request.headers.get("CF-Connecting-IP");
  return await verifyTurnstile(token, env, ip);
}

// ---- base64url ----
function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64urlToString(s) {
  return new TextDecoder().decode(b64urlToBytes(s));
}

// JWKS（公開鍵）を isolate 内でキャッシュ
let JWKS_CACHE = null; // { domain, keys }

async function getKeys(teamDomain) {
  if (JWKS_CACHE && JWKS_CACHE.domain === teamDomain) return JWKS_CACHE.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("JWKS fetch failed: " + res.status);
  const data = await res.json();
  JWKS_CACHE = { domain: teamDomain, keys: data.keys || [] };
  return JWKS_CACHE.keys;
}

// Cloudflare Access が付与する JWT を検証して payload を返す
async function verifyAccessJwt(token, env) {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN; // 例: yourteam.cloudflareaccess.com
  const aud = env.CF_ACCESS_AUD;                // Access アプリの Application Audience (AUD) タグ
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed jwt");
  const header = JSON.parse(b64urlToString(parts[0]));
  const payload = JSON.parse(b64urlToString(parts[1]));

  const keys = await getKeys(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("signing key not found");

  const key = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["verify"]
  );
  const sig = b64urlToBytes(parts[2]);
  const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, signed);
  if (!ok) throw new Error("bad signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("token expired");
  if (payload.iss && payload.iss !== `https://${teamDomain}`) throw new Error("bad issuer");
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (aud && !auds.includes(aud)) throw new Error("bad audience");
  return payload;
}

// リクエストからログインユーザーのメールを取り出す
// 本番: Access の JWT を検証 / ローカル開発: DEV_EMAIL を使う
export async function getIdentity(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (token && env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD) {
    try {
      const payload = await verifyAccessJwt(token, env);
      return { email: String(payload.email || "").toLowerCase(), viaAccess: true };
    } catch (e) {
      return { email: null, viaAccess: true, error: e.message };
    }
  }
  // ローカル開発時のみ: .dev.vars に LOCAL_DEV="true" があるときだけ DEV_EMAIL を擬似ログインとして使う。
  // 本番(Pages)では LOCAL_DEV を設定しないので、Access 未設定 or JWT 無しは「未認証＝書き込み不可」になる。
  if (String(env.LOCAL_DEV).toLowerCase() === "true") {
    const dev = String(env.DEV_EMAIL || "").toLowerCase();
    return { email: dev || null, viaAccess: false };
  }
  return { email: null, viaAccess: false };
}

// 書き込み権限の判定。次のどちらかを満たせば許可：
//  (A) 編集パスワード一致（公開運用の基本。ヘッダ X-Edit-Key が EDIT_PASSWORD と一致）
//  (B) 将来 Access を入れた場合のログイン許可（email が OWNER_EMAIL、または ALLOW_ALL_WRITES="true"）
export function authorizeWrite(request, env, identity) {
  // (A) 編集パスワード（保存時の末尾改行などに備え前後空白を除去して比較）
  const key = request.headers.get("X-Edit-Key");
  const pw = env.EDIT_PASSWORD ? String(env.EDIT_PASSWORD).trim() : "";
  if (pw && key && key.trim() === pw) return true;
  // (B) Access ログイン（将来用。今は identity.email は null）
  if (identity && identity.email) {
    if (String(env.ALLOW_ALL_WRITES).toLowerCase() === "true") return true;
    if (identity.email === String(env.OWNER_EMAIL || "").toLowerCase()) return true;
  }
  return false;
}
