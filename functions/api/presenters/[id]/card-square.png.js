// 問題提起人ページのXカード（正方形=Summary、1200x1200 PNG）。横長版（card.png.js）と同じ意匠で、
// Teams・Slack等が og:image を正方形に中央トリミングしても切れないように組み直したもの
// （事件カードの card-square.png.js と同じ考え方）。中央は応援の面（cheerSection）で固定。
//
// URL: /api/presenters/:id/card-square.png
import {
  h, BG, PAPER, RING, GO_R, GO_M, INK, RED, GRAY,
  SITE_LABEL, MESSAGE, stamp, cheerSection,
  loadFonts, fontList, loadPresenterIconDataUri, overrideResponse,
  ImageResponse, cache,
} from "../../cases/_card.js";
import { loadPresenterCardData, presenterSubLine } from "../_card.js";

function buildSquareTree(p) {
  const presenter = [];
  if (p.iconDataUri) {
    presenter.push(h("img", { key: "av", src: p.iconDataUri, width: 140, height: 140, style: { borderRadius: "50%", border: `3px solid ${RING}` } }));
  }
  presenter.push(h(
    "div",
    { key: "nick", style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: p.iconDataUri ? 20 : 0, fontFamily: GO_R, fontSize: 30, color: GRAY, textAlign: "center" } },
    [
      h("div", { key: "n1", style: { display: "flex" } }, p.nickname + "さん"),
      h("div", { key: "n2", style: { display: "flex" } }, "を応援！"),
    ]
  ));

  const card = h(
    "div",
    {
      style: {
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        width: 1000, height: 1000, padding: 64, borderRadius: 24, border: `2px solid ${RING}`, background: PAPER,
      },
    },
    [
      h("div", { key: "head", style: { display: "flex", alignItems: "center" } }, [
        stamp(52),
        h("div", { key: "label", style: { display: "flex", marginLeft: 18, fontFamily: GO_M, fontSize: 30, color: INK, letterSpacing: 1.5 } }, SITE_LABEL),
      ]),
      h("div", { key: "cheer", style: { display: "flex", marginTop: 64 } }, cheerSection(p.subLine, { center: true, size: 48, headline: p.headline })),
      h("div", { key: "presenter", style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 64 } }, presenter),
      h("div", { key: "msg", style: { display: "flex", fontFamily: GO_M, fontSize: 32, color: RED, letterSpacing: 1.5, marginTop: 64, textAlign: "center" } }, p.message),
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
  const data = {
    nickname: loaded.row.nickname || "",
    iconDataUri,
    headline: loaded.row.card_headline || "",
    subLine: loaded.row.card_sub || presenterSubLine(loaded),
    message: loaded.row.card_message || MESSAGE,
  };

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
