// 事件ごとのXカード（正方形、1200x1200 PNG）をその場で生成する。
// Teams・Slackなど多くのアプリは og:image を正方形に中央付近でトリミングして小さく出すため、
// 横長版（card.png.js）をそのまま渡すと日付や問題提起人のアイコンが切れてしまう（2026-08-30に発覚）。
// あらかじめ正方形に組んだこちらを og:image として渡す（case.js参照）。X（Twitter）は
// twitter:image を優先して読むので、そちらには引き続き横長版を渡す。
// レイアウトの部品（フォント・ハンコ・期日欄など）は card.png.js と共通（_card.js）。
//
// URL: /api/cases/:id/card-square.png（非公開事件は ?key=閲覧キー が必要。case.js と同じ規則）
import {
  h, BG, RING, GO_M, INK,
  SITE_LABEL, stamp,
  loadFonts, fontList, loadCardContext, loadPresenterIconDataUri, overrideResponse,
  ImageResponse, cache,
} from "../_card.js";

// 正方形版（Summary）は、X・チャットアプリが小さく縮めて出すため、いつ・誰の事件かの詳細は
// 横長版に任せ、アイコンとサイト名だけの素朴な見た目に簡略化する（2026-09-11）。
// 表示サイズが小さいので、内側に白い枠（PAPER）を入れ子にする二重の余白はやめ、
// キャンバスいっぱいに直接アイコン・文字を大きく置く（同日、実物を見た本人の指摘で
// 140px→280px→この形に変更。アイコン自体の縁取りだけは残す）
function buildSquareTree(c) {
  const icon = c.iconDataUri
    ? h("img", { key: "av", src: c.iconDataUri, width: 480, height: 480, style: { borderRadius: "50%", border: `5px solid ${RING}` } })
    : stamp(480);

  const content = [
    icon,
    h("div", { key: "label", style: { display: "flex", marginTop: 64, fontFamily: GO_M, fontSize: 80, color: INK, letterSpacing: 1.5 } }, SITE_LABEL),
  ];

  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 1200, height: 1200, background: BG } },
    content
  );
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  if (!env.DB) return new Response("not configured", { status: 500 });
  const url = new URL(request.url);
  const id = params.id;

  const ctx = await loadCardContext(env, request, id);
  if (!ctx) return new Response("not found", { status: 404 });
  const { row: c, isPrivate } = ctx;

  const cacheKey = new Request(url.toString(), request);
  if (!isPrivate) {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  }

  // 手動で正方形版を差し替えていれば（cases.card_square_r2_key）、自動生成せずそちらを返す。
  // 横長版（card_r2_key）だけ差し替えている場合は、正方形はそのまま自動生成を続ける
  const overridden = await overrideResponse(env, c.card_square_r2_key, isPrivate, cacheKey, context);
  if (overridden) return overridden;

  const iconDataUri = await loadPresenterIconDataUri(env, c);

  const data = { iconDataUri };

  const fonts = await loadFonts(env, request);
  cache.setExecutionContext(context);
  const imgRes = await ImageResponse.async(buildSquareTree(data), {
    width: 1200, height: 1200, format: "png",
    fonts: fontList(fonts),
  });

  const response = new Response(imgRes.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": isPrivate ? "private, no-store" : "public, max-age=3600",
    },
  });
  if (!isPrivate) context.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}
