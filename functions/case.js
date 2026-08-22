// /case?id=... へのアクセスだけ、この関数を通す（public/case.html は静的資産としてそのまま残る）。
// 目的：X・LINE 等でシェアされたときに正しいタイトル・説明・画像（OGP）でカードが出るように、
// 配信直前に <head> だけをその場で書き換える。中身の描画は変わらず client 側の lib.js が行う。

function escAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const legacyName = url.searchParams.get("case");

  const assetRes = await env.ASSETS.fetch(new URL("/case.html", request.url));
  if (!assetRes.ok || (!id && !legacyName)) return assetRes;

  const c = id
    ? await env.DB.prepare(`SELECT id, name, call_text FROM cases WHERE id = ?`).bind(id).first()
    : await env.DB.prepare(`SELECT id, name, call_text FROM cases WHERE name = ?`).bind(legacyName).first();
  if (!c) return assetRes;

  const img = await env.DB.prepare(
    `SELECT r2_key FROM case_images WHERE case_id = ? ORDER BY sort_order, created_at LIMIT 1`
  ).bind(c.id).first();
  const wideKey = img ? img.r2_key : "";
  const wideUrl = wideKey ? new URL("/files/" + wideKey, request.url).toString() : "";

  // Teams・Slack など多くのアプリはOG画像を正方形に中央付近でトリミングして小さく出す。
  // 手作りのカバー画像（ファイル名が ogcard.png のもの）には、同じ場所に正方形版
  // （ogcard-square.png）を置いておけば、そちらを og:image に使う（無ければ同じ画像を使い回す）。
  // X（Twitter）は twitter:image を優先して読むので、そちらには常に横長版を渡す。
  let squareUrl = wideUrl;
  if (wideKey && wideKey.endsWith("/ogcard.png")) {
    const squareKey = wideKey.replace(/ogcard\.png$/, "ogcard-square.png");
    const head = env.FILES ? await env.FILES.head(squareKey).catch(() => null) : null;
    if (head) squareUrl = new URL("/files/" + squareKey, request.url).toString();
  }

  const title = `${c.name} ｜ 応援傍聴ナビ`;
  const description = (c.call_text || "傍聴席に、ひとり増える。それだけで法廷は変わる。").slice(0, 140);

  const extraTags = [
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:url" content="${escAttr(request.url)}">`,
    `<meta property="og:site_name" content="応援傍聴ナビ">`,
    squareUrl ? `<meta property="og:image" content="${escAttr(squareUrl)}">` : "",
    wideUrl ? `<meta name="twitter:image" content="${escAttr(wideUrl)}">` : "",
    `<meta name="twitter:card" content="${wideUrl ? "summary_large_image" : "summary"}">`,
  ].filter(Boolean).join("\n");

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
    .on("head", { element(el) { el.append(extraTags, { html: true }); } })
    .transform(assetRes);
}
