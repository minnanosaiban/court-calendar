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
    ? await env.DB.prepare(`SELECT id, name, lede FROM cases WHERE id = ?`).bind(id).first()
    : await env.DB.prepare(`SELECT id, name, lede FROM cases WHERE name = ?`).bind(legacyName).first();
  if (!c) return assetRes;

  const img = await env.DB.prepare(
    `SELECT r2_key FROM case_images WHERE case_id = ? ORDER BY sort_order, created_at LIMIT 1`
  ).bind(c.id).first();
  const imageUrl = img ? new URL("/files/" + img.r2_key, request.url).toString() : "";

  const title = `${c.name} ｜ みんなの裁判`;
  const description = (c.lede || "行けない日も、法廷のいまがわかる。裁判の期日と、傍聴に行った人の報告を、ひとつのカレンダーに。").slice(0, 140);

  const extraTags = [
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:url" content="${escAttr(request.url)}">`,
    `<meta property="og:site_name" content="みんなの裁判">`,
    imageUrl ? `<meta property="og:image" content="${escAttr(imageUrl)}">` : "",
    `<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">`,
  ].filter(Boolean).join("\n");

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
    .on("head", { element(el) { el.append(extraTags, { html: true }); } })
    .transform(assetRes);
}
