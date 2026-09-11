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

// meta descriptionなど、公開ページのHTMLに直接差し込む文字列を長さで切り詰めるときに使う。
// String#sliceはUTF-16のコードユニット単位なので、サロゲートペア（絵文字など）がちょうど
// 上限の位置に来ると片割れだけが残って文字化けする。validateCardText/cardHeadlineFromと同じ
// コードポイント単位（[...s]）で数える（2026-09-11、case.js/presenter.jsのOGP descriptionで
// 素のsliceを使っていた抜けの修正）
export function truncateChars(s, max) {
  const str = String(s || "");
  const chars = [...str];
  return chars.length > max ? chars.slice(0, max).join("") : str;
}

// ---- 事件 ----
// presenters は LEFT JOIN で引く（p. で参照。FROM 句は casesSelect() 側で JOIN する）
export const CASE_COLS = `c.id, c.name, c.presenter_id, p.nickname AS presenter_nickname, p.icon_r2_key AS presenter_icon_r2_key,
                          p.x_url AS presenter_x_url,
                          c.view_key,
                          c.case_no, c.case_no_public,
                          c.plaintiff_name, c.defendant_name,
                          c.judge, c.points, c.call_text,
                          c.contact, c.press, c.plaintiff_links, c.defendant_links, c.tags,
                          c.related_case_ids, c.archived_at, c.close_type,
                          c.board_enabled, c.board_restricted, c.notice_r2_key, c.notice_file_name, c.notice_file_size, c.notice_mime,
                          c.card_r2_key, c.card_square_r2_key,
                          c.card_headline, c.card_sub, c.card_message, c.seo_title, c.seo_description,
                          c.created_by, c.updated_by, c.updated_at`;

export function rowToCase(r) {
  return {
    id: r.id,
    name: r.name,
    presenterId: r.presenter_id || "",
    presenterNickname: r.presenter_nickname || "",
    presenterIcon: r.presenter_icon_r2_key ? "/files/" + r.presenter_icon_r2_key : "",
    presenterXUrl: r.presenter_x_url || "",
    // 閲覧キー（view_key）：この行がここまで来ている時点で、呼び出し側（一覧の絞り込み・
    // authorizeCaseWrite等）で「見せてよい」判定は既に済んでいる（非公開でキーが合っていない
    // 行はそもそもrowToCaseに渡る前に除かれる）。なので生の値をそのまま返してよい（2026-09-02）。
    isPrivate: !!r.view_key,
    viewKey: r.view_key || "",
    caseNo: r.case_no || "",
    caseNoPublic: r.case_no_public === 1 || r.case_no_public === true,
    plaintiffName: r.plaintiff_name || "",
    defendantName: r.defendant_name || "",
    judge: r.judge || "",
    points: textToLines(r.points),
    callText: r.call_text || "",
    contact: r.contact || "",
    press: textToLines(r.press),
    plaintiffLinks: textToLines(r.plaintiff_links).filter(isHttpUrl),
    defendantLinks: textToLines(r.defendant_links).filter(isHttpUrl),
    tags: textToLines(r.tags),
    relatedCaseIds: textToLines(r.related_case_ids),
    archivedAt: r.archived_at || "",
    closeType: r.close_type || "",
    boardEnabled: r.board_enabled === 0 || r.board_enabled === false ? false : true,
    boardRestricted: r.board_restricted === 1 || r.board_restricted === true,
    noticeUrl: r.notice_r2_key ? withFileKey("/files/" + r.notice_r2_key, r.view_key) : "",
    noticeFileName: r.notice_file_name || "",
    noticeMime: r.notice_mime || "",
    cardUrl: r.card_r2_key ? "/files/" + r.card_r2_key : "",
    cardSquareUrl: r.card_square_r2_key ? "/files/" + r.card_square_r2_key : "",
    cardHeadline: r.card_headline || "",
    cardSub: r.card_sub || "",
    cardMessage: r.card_message || "",
    seoTitle: r.seo_title || "",
    seoDescription: r.seo_description || "",
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
    // 非公開にする場合、キーが空欄で送られてきたら（新規に非公開へ切り替えたときなど）
    // ここでサーバー側が生成する（本来は編集画面がクライアント側で埋めて送るので、ここに
    // 来るのは主にAPIを直接叩いた場合の保険）。generatePassword()は下の方で定義しているが、
    // 関数宣言は巻き上げられるので参照して問題ない
    view_key: body.isPrivate === true ? (String(body.viewKey || "").trim() || generatePassword(12)) : null,
    case_no: String(body.caseNo || "").trim(),
    case_no_public: body.caseNoPublic === true ? 1 : 0,
    plaintiff_name: String(body.plaintiffName || "").trim(),
    defendant_name: String(body.defendantName || "").trim(),
    judge: String(body.judge || "").trim(),
    points: linesToText(body.points),
    call_text: String(body.callText || "").trim(),
    contact: String(body.contact || "").trim(),
    press: linesToText(body.press),
    plaintiff_links: textToLines(linesToText(body.plaintiffLinks)).filter(isHttpUrl).join("\n"),
    defendant_links: textToLines(linesToText(body.defendantLinks)).filter(isHttpUrl).join("\n"),
    tags: linesToText(body.tags),
    related_case_ids: linesToText(body.relatedCaseIds),
    archived_at: isYmd(body.archivedAt) ? body.archivedAt : null,
    close_type: String(body.closeType || "").trim(),
    board_enabled: body.boardEnabled === false ? 0 : 1,
    board_restricted: body.boardRestricted === true ? 1 : 0,
    // カードの文言・検索結果の見え方。空文字は「自動に戻す」なので NULL で持つ
    card_headline: String(body.cardHeadline || "").trim() || null,
    card_sub: String(body.cardSub || "").trim() || null,
    card_message: String(body.cardMessage || "").trim() || null,
    seo_title: String(body.seoTitle || "").trim() || null,
    seo_description: String(body.seoDescription || "").trim() || null,
  };
}
export function isYmd(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// 非公開事件のファイルURL（/files/...）に、その事件の合言葉を ?key= として埋め込む。
// viewKeyが空（公開事件）ならそのまま返す。/files/ 以外のURL（資料の外部リンク等）には何もしない
export function withFileKey(url, viewKey) {
  if (!url || !viewKey || !url.startsWith("/files/")) return url;
  return url + (url.includes("?") ? "&" : "?") + "key=" + encodeURIComponent(viewKey);
}

// /files/ 配下で配信してよいR2キーのprefix一覧＋非公開判定の唯一の定義元。
// lookup を持つ種別（資料m/・写真i/・iw/・期日案内no/）は、持ち主の事件が非公開なら
// fileOwnerViewKey() がその view_key を返し、files/[[path]].js が ?key= と照合する。
// lookup が無い種別（カード画像・アイコン）は、カード共有・OGP用途なので常に誰でも見てよい仕様
// （files/[[path]].js参照）。
// 以前はこの「配信してよいprefix一覧」（files/[[path]].jsのALLOWED_PREFIXES）と
// 「非公開判定が要るprefix一覧」（このオブジェクトのlookup分岐）が別々のファイルに
// 手書きされていて、新しい非公開系prefixを足すとき片方だけ更新して漏れる事故が過去にあった。
// 1箇所にまとめ、ALLOWED_PREFIXESはこのオブジェクトのキーから機械的に作る（2026-09-11）
export const FILE_PREFIXES = {
  "m/": {
    lookup: (env, key) => env.DB.prepare(
      `SELECT c.view_key AS view_key FROM materials m JOIN cases c ON c.id = m.case_id WHERE m.r2_key = ?`
    ).bind(key).first(),
  },
  "i/": {
    lookup: (env, key) => env.DB.prepare(
      `SELECT c.view_key AS view_key FROM case_images i JOIN cases c ON c.id = i.case_id WHERE i.r2_key = ? OR i.web_r2_key = ?`
    ).bind(key, key).first(),
  },
  "iw/": {
    lookup: (env, key) => env.DB.prepare(
      `SELECT c.view_key AS view_key FROM case_images i JOIN cases c ON c.id = i.case_id WHERE i.r2_key = ? OR i.web_r2_key = ?`
    ).bind(key, key).first(),
  },
  "no/": { lookup: (env, key) => env.DB.prepare(`SELECT view_key FROM cases WHERE notice_r2_key = ?`).bind(key).first() },
  "ic/": {},  // 問題提起人のアイコン
  "cd/": {},  // 事件のTwitterカード横長版
  "cds/": {}, // 事件のTwitterカード正方形版
  "pd/": {},  // 問題提起人のTwitterカード横長版
  "pds/": {}, // 問題提起人のTwitterカード正方形版
};

// /files/ 配下のキーから、その持ち主の事件の view_key を引く（無ければ null＝誰でも見てよい）
export async function fileOwnerViewKey(env, key) {
  const prefix = Object.keys(FILE_PREFIXES).find((p) => key.startsWith(p));
  const lookup = prefix && FILE_PREFIXES[prefix].lookup;
  if (!lookup) return null;
  const row = await lookup(env, key);
  return row && row.view_key ? row.view_key : null;
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
// 問題提起人本人（myPresenterId）には、自分の事件だけ公開設定に関わらずそのまま返す
// （自分で「公開する」にチェックするかどうかを決められるよう、まず自分には見えている必要があるため。2026-08-29）。
export function redactCaseNo(rows, canWrite, myPresenterId) {
  if (canWrite) return rows;
  for (const r of rows) {
    const isMine = !!myPresenterId && r.presenter_id === myPresenterId;
    if (!r.case_no_public && !isMine) r.case_no = null;
  }
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
// ※事件・その資料・写真・期日・投稿・問題提起人など、事件に紐づく行を返すエンドポイントを
//   新しく足すときは、必ずこの hiddenCaseIds（または presenterCaseVisibility）で絞ってから
//   返すこと。うっかり通さないと、非公開にしたはずの事件の中身がそのまま見えてしまう
//   （2026-09-10、presenter.js のOGPで実際にこの抜けが起きた）。
// ※なお /files/ 配下の実ファイル（資料PDF・写真・期日案内）自体は、この判定を経由しない
//   （files/[[path]].js が withFileKey/fileOwnerViewKey で別途 ?key= を照合する。2026-09-11）。
//   一覧・詳細APIがここで正しく絞っていれば、鍵を持たない人にそのURLが渡ることはないが、
//   一度渡ったURLは（鍵が変わっても）以後ずっと有効なままなので、URLの取り扱いに注意すること。
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
export const PRESENTER_COLS = `id, nickname, icon_r2_key, x_url, login_username, login_password_hash,
                               card_r2_key, card_square_r2_key, card_headline, card_sub, card_message,
                               seo_title, seo_description,
                               created_by, updated_by, updated_at`;

// 「見せてよい（隠されていない）」件数の判定そのもの（DBを引かない純粋関数）。
// hidden は hiddenCaseIds() の結果、mine はログイン中の問題提起人自身の事件id集合（省略時は空＝
// 純粋な匿名扱い）。単体用（presenterCaseVisibility）・一覧用（allPresenterCaseVisibility）の
// どちらもこの1箇所を通すことで、可視性のルールが二重管理にならないようにする（2026-09-11。
// 以前は一覧側 api/presenters.js が同じ判定式を独自に再実装していて、ルールを直すときに
// 一覧だけ直し忘れる・逆に単体側だけ直し忘れるおそれがあった）
function computeVisibility(caseIds, hidden, mine) {
  const h = hidden || new Set();
  const m = mine || new Set();
  const visible = caseIds.filter((id) => !h.has(id) || m.has(id)).length;
  return { total: caseIds.length, visible };
}

// この問題提起人が持っている事件のうち、いま見せてよい件数を数える。
// 非公開にした事件（view_key あり）しか持たない問題提起人は、匿名の訪問者・合言葉を知らない人には
// 「そんな人はいない」扱いにする（単体取得 /api/presenters/:id と presenter.js のOGPが使う。2026-09-10）。
export async function presenterCaseVisibility(env, presenterId, hidden, mine) {
  const { results } = await env.DB.prepare(`SELECT id FROM cases WHERE presenter_id = ?`).bind(presenterId).all();
  return computeVisibility((results || []).map((r) => r.id), hidden, mine);
}

// 一覧 /api/presenters 用：全問題提起人分の {total, visible} を1回のクエリでまとめて計算する。
// presenterCaseVisibility() を問題提起人の数だけ呼ぶとN+1クエリになるため専用に用意しているが、
// 可視性の判定式そのものは上の computeVisibility() を共有する
export async function allPresenterCaseVisibility(env, hidden, mine) {
  const { results } = await env.DB.prepare(`SELECT id, presenter_id FROM cases WHERE presenter_id IS NOT NULL`).all();
  const byPresenter = new Map();
  for (const c of results || []) {
    if (!byPresenter.has(c.presenter_id)) byPresenter.set(c.presenter_id, []);
    byPresenter.get(c.presenter_id).push(c.id);
  }
  const out = new Map();
  for (const [pid, ids] of byPresenter) out.set(pid, computeVisibility(ids, hidden, mine));
  return out;
}

// admin=true のときだけ、ログインID・ログイン発行済みかどうかを含める
// （ログインIDは個人のメールアドレス等になりうるため、運営以外には見せない）
export function rowToPresenter(r, admin) {
  const out = {
    id: r.id,
    nickname: r.nickname,
    icon: r.icon_r2_key ? "/files/" + r.icon_r2_key : "",
    xUrl: r.x_url || "",
    // カード画像の差し替え・カードの文言・検索結果の見え方（いずれも空＝自動生成のまま）
    cardUrl: r.card_r2_key ? "/files/" + r.card_r2_key : "",
    cardSquareUrl: r.card_square_r2_key ? "/files/" + r.card_square_r2_key : "",
    cardHeadline: r.card_headline || "",
    cardSub: r.card_sub || "",
    cardMessage: r.card_message || "",
    seoTitle: r.seo_title || "",
    seoDescription: r.seo_description || "",
    caseCount: r.case_count != null ? Number(r.case_count) : undefined,
    updatedAt: r.updated_at || "",
  };
  if (admin) {
    out.loginUsername = r.login_username || "";
    out.hasLogin = !!r.login_password_hash;
  }
  return out;
}

// ---- カードの文言・SEO文言の文字数上限 ----
// satoriでPNG（card.png／card-square.png）に描くテキストなので、際限なく長い文字列が来ると
// Workerのメモリ・CPUを食いつぶす。事件・問題提起人どちらの保存でも同じ上限を使う。
// 文字数は [...s].length で数える（サロゲートペア・合字を1文字として数え、日本語もそのまま1文字扱い）
export const CARD_TEXT_MAX = { cardHeadline: 60, cardSub: 60, cardMessage: 60, seoTitle: 100, seoDescription: 300 };
// public/case-edit.html の label／aria-label と同じ文言（事件用cC…・問題提起人用cP…のどちらも同じ表記）
const CARD_TEXT_LABELS = {
  cardHeadline: "カードの大きい文字",
  cardSub: "カードの小さい1行",
  cardMessage: "カードの赤い1行",
  seoTitle: "タイトル",
  seoDescription: "説明",
};
// body に含まれる5つの文言のうち、上限を超えているものが1つでもあれば理由（日本語）を返す。
// 全部が上限内、またはそもそも含まれていなければ null
export function validateCardText(body) {
  for (const key of Object.keys(CARD_TEXT_MAX)) {
    const v = body ? body[key] : undefined;
    if (typeof v === "string" && [...v].length > CARD_TEXT_MAX[key]) {
      return `${CARD_TEXT_LABELS[key]}は${CARD_TEXT_MAX[key]}文字以内にしてください`;
    }
  }
  return null;
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

// ---- 事件のTwitterカード（OGP画像。未設定なら card.png.js が自動生成する） ----
export const CARD_MIMES = { "image/jpeg": "jpg", "image/png": "png" };
export const CARD_MAX_BYTES = 8 * 1024 * 1024;

// ---- 訴訟資料 ----
export const MATERIAL_SIDES = ["原告側", "被告側", "裁判所", "その他"];
export const MATERIAL_MIMES = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
export const MATERIAL_MAX_BYTES = 20 * 1024 * 1024;

export const MATERIAL_COLS = `m.id, m.case_id, m.event_id, m.title, m.side, m.filed_on,
                              m.url, m.r2_key, m.file_name, m.file_size, m.mime, m.claims, m.body,
                              m.body_model, m.body_date, m.summary,
                              m.summary_model, m.summary_date,
                              m.created_at, m.updated_at, c.view_key`;

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
    fileUrl: r.r2_key ? withFileKey("/files/" + r.r2_key, r.view_key) : (r.url || ""),   // 画面が開くリンク（R2 があればそちら）
    fileName: r.file_name || "",
    fileSize: Number(r.file_size || 0),
    mime: r.mime || "",
    claims: textToLines(r.claims),
    body: r.body || "",
    bodyModel: r.body_model || "",
    bodyDate: r.body_date || "",
    summary: r.summary || "",
    summaryModel: r.summary_model || "",
    summaryDate: r.summary_date || "",
    createdAt: r.created_at || "",
  };
}

// 「事件／問題提起人につき1枚だけ」の画像（アイコン・カード横長・カード正方形）を差し替える
// PUTハンドラで共通の部分（フォーム受け取り→種類・サイズ検証→R2保存）だけを一本化したもの。
// 認可・DBの列更新・レスポンス整形は呼び出し側（icon.js／card.js／card-square.js）の役目のまま。
// メッセージ文言は呼び出し側からそのまま渡す（アイコンとカードで文言が微妙に違うため、
// ここで作文せず既存の文言を壊さないようにする）。戻り値は { key } か { error }（2026-09-11、
// presenters/icon.js・presenters/card.js・presenters/card-square.js・cases/card.js・
// cases/card-square.js にほぼ同じ形でコピペされていたロジックの重複を減らす）
export async function putValidatedImage(env, request, {
  mimes, maxBytes, keyPrefix, ownerId, defaultName,
  emptyFileMsg, disabledMsg, wrongTypeMsg, tooBigMsg,
}) {
  let form;
  try { form = await request.formData(); } catch { return { error: "bad form" }; }
  const f = form.get("file");
  if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function" || f.size === 0) {
    return { error: emptyFileMsg };
  }
  if (!env.FILES) return { error: disabledMsg };
  const ext = mimes[f.type];
  if (!ext) return { error: wrongTypeMsg };
  if (f.size > maxBytes) return { error: tooBigMsg };
  const file = { blob: f, ext, name: f.name || (defaultName + "." + ext), size: f.size, mime: f.type };
  const key = await putFile(env, keyPrefix, ownerId, file);
  return { key };
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

// R2から複数のファイルをベストエフォートで消す（1件失敗しても他は続ける）。
// 事件・問題提起人の削除など、複数のR2キーをまとめて片付ける場面で共通に使う。
// ctxLabel は失敗時に console.error へ添えるだけの印（例："case cid123"）。
// 戻り値は失敗した件数（呼び出し側は必要なら応答に含める。0なら全部成功）
export async function deleteR2(env, keys, ctxLabel) {
  if (!env.FILES) return 0;
  const list = (keys || []).filter(Boolean);
  const results = await Promise.allSettled(list.map((k) => env.FILES.delete(k)));
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      failed++;
      console.error(`R2削除に失敗しました（${ctxLabel || "unknown"}）: key=${list[i]}`, r.reason);
    }
  });
  return failed;
}

// ---- 事件の写真 ----
export const IMAGE_MIMES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const IMAGE_MAX_BYTES = 12 * 1024 * 1024;

// ---- 問題提起人のアイコン（1件だけ。上限は写真より小さくする） ----
// 2026-08-28：写真と共通のIMAGE_MIMESを流用していたが、アイコンはJPEG・WebPのみに絞った（PNGを除外）
export const ICON_MIMES = { "image/jpeg": "jpg", "image/webp": "webp" };
export const ICON_MAX_BYTES = 5 * 1024 * 1024;

export const IMAGE_COLS = `i.id, i.case_id, i.r2_key, i.file_name, i.file_size, i.mime,
                           i.web_r2_key, i.web_file_name, i.web_file_size, i.web_mime,
                           i.caption, i.sort_order, i.created_at, c.view_key`;

export function rowToImage(r) {
  return {
    id: r.id,
    caseId: r.case_id,
    url: withFileKey("/files/" + r.r2_key, r.view_key),
    fileName: r.file_name || "",
    fileSize: Number(r.file_size || 0),
    mime: r.mime || "",
    // Web用（このサイトに合うフォント・サイズで作った版。任意）。あれば表示側はこちらを優先する
    webUrl: r.web_r2_key ? withFileKey("/files/" + r.web_r2_key, r.view_key) : "",
    webFileName: r.web_file_name || "",
    webMime: r.web_mime || "",
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

// ---- 問題提起人アカウント（2026-08-29） ----
// 運営（EDIT_PASSWORD／OWNER_EMAIL）とは別枠で、問題提起人が自分の事件だけを編集できるようにする。
// ログインは「ログインID＋パスワード」（運営が発行）。ログイン後はランダムなトークンを
// この端末に持たせ（X-Presenter-Token ヘッダ）、以後はそのトークンで本人確認する。

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const clean = String(hex || "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}
export function randomHex(nBytes) {
  const b = new Uint8Array(nBytes);
  crypto.getRandomValues(b);
  return bytesToHex(b);
}
// 運営が「パスワードを再発行」したときに見せる、ランダムな平文パスワード（紛らわしい文字は除く）
const PW_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
export function generatePassword(len = 12) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return [...b].map((x) => PW_CHARS[x % PW_CHARS.length]).join("");
}
// PBKDF2-SHA256。ログイン時にしか呼ばない（書き込みリクエストごとには使わない）ので、
// 反復回数を上げてもレスポンスへの影響は小さい。
export async function hashPassword(password, saltHex) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(password || "")), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return bytesToHex(new Uint8Array(bits));
}

const SESSION_DAYS = 365;

// リクエストの X-Presenter-Token から、ログイン中の問題提起人を返す（無ければ null）
export async function getPresenterSession(request, env) {
  const token = request.headers.get("X-Presenter-Token");
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT presenter_id, expires_at FROM presenter_sessions WHERE token = ?`
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at && row.expires_at < new Date().toISOString()) return null;
  return { presenterId: row.presenter_id };
}

// ログイン中の問題提起人が持っている事件idの集合（無ければ空集合）
export async function myCaseIds(env, session) {
  if (!session) return new Set();
  const { results } = await env.DB.prepare(`SELECT id FROM cases WHERE presenter_id = ?`).bind(session.presenterId).all();
  return new Set((results || []).map((r) => r.id));
}

// 問題提起人まわりの1件だけのファイル（アイコン・Twitterカード横長／正方形）の書き込み権限。
//  (A) 運営（authorizeWrite）は常に許可
//  (B) ログイン中の問題提起人は、自分（pid）のものだけ許可
// admin: 運営としての書き込みか（rowToPresenter(row, admin)にそのまま渡せる）。
// actor: created_by/updated_by に入れる印（運営はメール、本人は "presenter:"+pid）。
// もとは presenters/[id]/{icon,card,card-square}.js に3つ別々にコピーされていたもの（2026-09-10統合）
export async function authorizeSelfOrAdmin(request, env, pid) {
  const id = await getIdentity(request, env);
  // actor は actorLabel() と同じ規則にそろえる（2026-09-11。運営の通常運用であるパスワード認証では
  // identity.email が null のため、ここだけ "admin" 固定にしていると同じ運営操作でも
  // updated_by が cases/[id].js 等の他の書き込み経路と食い違ってしまっていた）
  if (authorizeWrite(request, env, id)) return { ok: true, admin: true, actor: actorLabel(id, {}) };
  const session = await getPresenterSession(request, env);
  return { ok: !!session && session.presenterId === pid, admin: false, actor: "presenter:" + pid };
}

// 1つの事件に対する書き込み権限の判定。
//  (A) 運営（authorizeWrite）は常に許可
//  (B) ログイン中の問題提起人は、自分（presenter_id）の事件だけ許可
// caseId が無い（＝新しい事件を起こす操作）は、問題提起人には許可しない
// （新規の事件・問題提起人の"箱"を作るのは引き続き運営のみ。2026-08-29の運用方針）。
export async function authorizeCaseWrite(request, env, identity, caseId) {
  if (authorizeWrite(request, env, identity)) return { ok: true, admin: true, presenterId: null };
  if (!caseId) return { ok: false, admin: false, presenterId: null };
  const session = await getPresenterSession(request, env);
  if (!session) return { ok: false, admin: false, presenterId: null };
  const row = await env.DB.prepare(`SELECT id FROM cases WHERE id = ? AND presenter_id = ?`)
    .bind(caseId, session.presenterId).first();
  return { ok: !!row, admin: false, presenterId: session.presenterId };
}

// 監査用の created_by/updated_by に入れる文字列（運営はメール、問題提起人はそれと分かる印）
export function actorLabel(identity, auth) {
  if (identity && identity.email) return identity.email;
  if (auth && auth.presenterId) return "presenter:" + auth.presenterId;
  return null;
}

// ログインに成功したら呼ぶ。トークンを発行して保存し、{token, presenterId, nickname} を返す
export async function createPresenterSession(env, presenterId) {
  const token = randomHex(24);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await env.DB.prepare(
    `INSERT INTO presenter_sessions (token, presenter_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  ).bind(token, presenterId, now.toISOString(), expires.toISOString()).run();
  return token;
}
