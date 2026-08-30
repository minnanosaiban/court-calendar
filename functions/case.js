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
    ? await env.DB.prepare(`SELECT id, name, call_text, view_key FROM cases WHERE id = ?`).bind(id).first()
    : await env.DB.prepare(`SELECT id, name, call_text, view_key FROM cases WHERE name = ?`).bind(legacyName).first();
  if (!c) return assetRes;
  // 非公開にした事件は、URLの ?key= が合言葉と一致しない限り、事件名・説明をカードに出さない
  // （SNSの展開カードやクローラーに漏れないように、書き換えず素の案内文のまま返す）
  if (c.view_key && url.searchParams.get("key") !== c.view_key) return assetRes;

  // OGP画像：事件ごとの「傍聴券」カード（直近期日・問題提起人をその場で描画。2026-08-30）。
  // 手作りでPNGを作って case_images に upload していた旧運用（ogcard.png／正方形版との出し分け）は、
  // 期日が変わるたびの差し替え作業が要らないこちらに一本化した（card.png.js のコメント参照）。
  // 非公開事件は、閲覧キーが合っている人にしか出さない規則をそのままカードのURLにも引き継ぐ。
  const cardUrl = new URL(`/api/cases/${encodeURIComponent(c.id)}/card.png`, request.url);
  if (c.view_key) cardUrl.searchParams.set("key", c.view_key);
  const cardImgUrl = cardUrl.toString();

  const title = `${c.name} ｜ 応援傍聴ナビ`;
  const description = (c.call_text || "傍聴席に、ひとり増える。それだけで法廷は変わる。").slice(0, 140);

  const extraTags = [
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:url" content="${escAttr(request.url)}">`,
    `<meta property="og:site_name" content="応援傍聴ナビ">`,
    `<meta property="og:image" content="${escAttr(cardImgUrl)}">`,
    `<meta name="twitter:image" content="${escAttr(cardImgUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n");

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
    .on("head", { element(el) { el.append(extraTags, { html: true }); } })
    .transform(assetRes);
}
