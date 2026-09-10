// 問題提起人ページのXカード（正方形=Summary、1200x1200 PNG）。横長版（card.png.js）と同じ意匠で、
// Teams・Slack等が og:image を正方形に中央トリミングしても切れないように組み直したもの
// （事件カードの card-square.png.js と同じ考え方）。中央は応援の面（cheerSection）で固定。
//
// URL: /api/presenters/:id/card-square.png
import {
  h, BG, PAPER, RING, GO_M, INK,
  SITE_LABEL, stamp,
  loadFonts, fontList, loadPresenterIconDataUri, overrideResponse,
  ImageResponse, cache,
} from "../../cases/_card.js";
import { loadPresenterCardData } from "../_card.js";

// 正方形版（Summary）は事件カードの正方形版（cases/[id]/card-square.png.js）と同じテンプレート：
// アイコンとサイト名だけの素朴な見た目に簡略化する（2026-09-11）
function buildSquareTree(p) {
  // 1000×1000の枠に対してアイコン140px・文字44ptだと余白ばかりで小さく見えたため、
  // アイコン280px・文字64ptに拡大した（2026-09-11、実物を見た本人の指摘。事件側と揃える）
  const icon = p.iconDataUri
    ? h("img", { key: "av", src: p.iconDataUri, width: 280, height: 280, style: { borderRadius: "50%", border: `4px solid ${RING}` } })
    : stamp(280);

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
      h("div", { key: "label", style: { display: "flex", marginTop: 56, fontFamily: GO_M, fontSize: 64, color: INK, letterSpacing: 1.5 } }, SITE_LABEL),
    ]
  );

  return h("div", { style: { display: "flex", width: 1200, height: 1200, background: BG, alignItems: "center", justifyContent: "center" } }, card);
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  if (!env.DB) return new Response("not configured", { status: 500 });
  const url = new URL(request.url);

  const cacheKey = new Request(url.toString(), request);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;

  const loaded = await loadPresenterCardData(env, params.id);
  if (!loaded) return new Response("not found", { status: 404 });

  const overridden = await overrideResponse(env, loaded.row.card_square_r2_key, false, cacheKey, context);
  if (overridden) return overridden;

  const iconDataUri = await loadPresenterIconDataUri(env, loaded.row);
  const data = { iconDataUri };

  const fonts = await loadFonts(env, request);
  cache.setExecutionContext(context);
  const imgRes = await ImageResponse.async(buildSquareTree(data), {
    width: 1200, height: 1200, format: "png",
    fonts: fontList(fonts),
  });

  const response = new Response(imgRes.body, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
  context.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}
