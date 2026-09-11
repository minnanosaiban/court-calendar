// 問題提起人ページのXカード（正方形=Summary、1200x1200 PNG）。横長版（card.png.js）と同じ意匠で、
// Teams・Slack等が og:image を正方形に中央トリミングしても切れないように組み直したもの
// （事件カードの card-square.png.js と同じ考え方）。中央は応援の面（cheerSection）で固定。
//
// URL: /api/presenters/:id/card-square.png
import {
  h, BG, RING, GO_M, INK,
  SITE_LABEL, stamp,
  loadFonts, fontList, loadPresenterIconDataUri, overrideResponse,
  ImageResponse, cache,
} from "../../cases/_card.js";
import { loadPresenterCardData } from "../_card.js";

// 正方形版（Summary）は事件カードの正方形版（cases/[id]/card-square.png.js）と同じテンプレート：
// アイコンとサイト名だけの素朴な見た目に簡略化する（2026-09-11）。表示サイズが小さいので、
// 内側に白い枠（PAPER）を入れ子にする二重の余白はやめ、キャンバスいっぱいに直接
// アイコン・文字を大きく置く（同日、実物を見た本人の指摘で140px→280px→この形に変更）
function buildSquareTree(p) {
  const icon = p.iconDataUri
    ? h("img", { key: "av", src: p.iconDataUri, width: 480, height: 480, style: { borderRadius: "50%", border: `5px solid ${RING}` } })
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

  const cacheKey = new Request(url.toString(), request);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;

  const loaded = await loadPresenterCardData(env, params.id, request);
  if (!loaded) return new Response("not found", { status: 404 });

  const overridden = await overrideResponse(env, loaded.row.card_square_r2_key, loaded.isPrivate, cacheKey, context);
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
