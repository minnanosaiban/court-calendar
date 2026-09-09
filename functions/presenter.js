// /presenter?id=... へのアクセスだけ、この関数を通す（public/presenter.html は静的資産としてそのまま残る）。
// 目的は case.js と同じで、X・LINE 等でシェアされたときに正しいタイトル・説明・画像（OGP）で
// カードが出るように、配信直前に <head> だけをその場で書き換える。中身の描画は client 側の lib.js が行う。
// og:image には正方形版（Teams・Slack等が中央トリミングして小さく出す対策）、X が優先して読む
// twitter:image には横長版を渡す（case.js と同じ出し分け）。
function escAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  const assetRes = await env.ASSETS.fetch(new URL("/presenter.html", request.url));
  if (!assetRes.ok || !id) return assetRes;

  const p = await env.DB.prepare(`SELECT id, nickname FROM presenters WHERE id = ?`).bind(id).first();
  if (!p) return assetRes;

  const cardWideUrl = new URL(`/api/presenters/${encodeURIComponent(p.id)}/card.png`, request.url).toString();
  const cardSquareUrl = new URL(`/api/presenters/${encodeURIComponent(p.id)}/card-square.png`, request.url).toString();

  const title = `${p.nickname}さん ｜ 応援傍聴ナビ`;
  const description = `${p.nickname}さんが応援を呼びかけている裁判です。傍聴席に、ひとり増える。それだけで法廷は変わる。`;

  const extraTags = [
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:url" content="${escAttr(request.url)}">`,
    `<meta property="og:site_name" content="応援傍聴ナビ">`,
    `<meta property="og:image" content="${escAttr(cardSquareUrl)}">`,
    `<meta name="twitter:image" content="${escAttr(cardWideUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n");

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
    .on("head", { element(el) { el.append(extraTags, { html: true }); } })
    .transform(assetRes);
}
