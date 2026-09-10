// 事件ごとのXカード（正方形、1200x1200 PNG）をその場で生成する。
// Teams・Slackなど多くのアプリは og:image を正方形に中央付近でトリミングして小さく出すため、
// 横長版（card.png.js）をそのまま渡すと日付や問題提起人のアイコンが切れてしまう（2026-08-30に発覚）。
// あらかじめ正方形に組んだこちらを og:image として渡す（case.js参照）。X（Twitter）は
// twitter:image を優先して読むので、そちらには引き続き横長版を渡す。
// レイアウトの部品（フォント・ハンコ・期日欄など）は card.png.js と共通（_card.js）。
//
// URL: /api/cases/:id/card-square.png（非公開事件は ?key=閲覧キー が必要。case.js と同じ規則）
import {
  h, BG, PAPER, RING, GO_M, INK,
  SITE_LABEL, stamp,
  loadFonts, fontList, loadCardContext, loadPresenterIconDataUri, overrideResponse,
  ImageResponse, cache,
} from "../_card.js";

// 正方形版（Summary）は、X・チャットアプリが小さく縮めて出すため、いつ・誰の事件かの詳細は
// 横長版に任せ、アイコンとサイト名だけの素朴な見た目に簡略化する（2026-09-11）
function buildSquareTree(c) {
  const icon = c.iconDataUri
    ? h("img", { key: "av", src: c.iconDataUri, width: 140, height: 140, style: { borderRadius: "50%", border: `3px solid ${RING}` } })
    : stamp(140);

  const card = h(
    "div",
    {
      style: {
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        width: 1000, height: 1000, padding: 64, borderRadius: 24, border: `2px solid ${RING}`, background: PAPER,
      },
    },
    [
      icon,
      h("div", { key: "label", style: { display: "flex", marginTop: 40, fontFamily: GO_M, fontSize: 44, color: INK, letterSpacing: 1.5 } }, SITE_LABEL),
    ]
  );

  return h("div", { style: { display: "flex", width: 1200, height: 1200, background: BG, alignItems: "center", justifyContent: "center" } }, card);
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
