// 問題提起人ページ（/presenter?id=…）のXカード（横長=Large、1200x630 PNG）をその場で生成する。
// 事件ごとのカード（api/cases/[id]/card.png.js）と同じ「傍聴券」の意匠だが、プロフィールのカードは
// 「いつ・どこで」より「この人を応援する」ことが主役なので、中央は期日欄ではなく応援の面
// （cheerSection＝サイトのコピー2行）で固定し、直近期日や件数は下のグレー1行に小さく添える。
// 部品（フォント・ハンコ・ミシン目）は事件カードと共通（api/cases/_card.js）。
// 非公開にした事件は件数にも期日にも数えない（合言葉を知らない人に中身が漏れないように）。
//
// URL: /api/presenters/:id/card.png
import {
  h, BG, PAPER, RING, GO_R, GO_M, INK, RED, GRAY,
  SITE_LABEL, MESSAGE, stamp, perforation, cheerSection,
  loadFonts, fontList, loadPresenterIconDataUri,
  ImageResponse, cache,
} from "../../cases/_card.js";
import { loadPresenterCardData, presenterSubLine } from "../_card.js";

function buildTree(p) {
  const right = [];
  if (p.iconDataUri) {
    right.push(h("img", { key: "av", src: p.iconDataUri, width: 112, height: 112, style: { borderRadius: "50%", border: `3px solid ${RING}` } }));
  } else {
    right.push(stamp(52));
  }
  // 「◯◯さん」「を応援！」の2行（1行にすると「応援」の途中で折り返ることがある。事件カードと同じ）
  right.push(h(
    "div",
    { key: "nick", style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 20, fontFamily: GO_R, fontSize: 26, color: GRAY, textAlign: "center" } },
    [
      h("div", { key: "n1", style: { display: "flex" } }, p.nickname + "さん"),
      h("div", { key: "n2", style: { display: "flex" } }, "を応援！"),
    ]
  ));

  const ticket = h(
    "div",
    { style: { display: "flex", width: 960, height: 410, borderRadius: 16, border: `2px solid ${RING}`, background: PAPER, overflow: "hidden" } },
    [
      h(
        "div",
        { key: "left", style: { display: "flex", flexDirection: "column", flex: 1, padding: "40px 40px 40px 56px", justifyContent: "space-between" } },
        [
          h("div", { key: "head", style: { display: "flex", alignItems: "center" } }, [
            stamp(46),
            h("div", { key: "label", style: { display: "flex", marginLeft: 16, fontFamily: GO_M, fontSize: 25, color: INK, letterSpacing: 1.5 } }, SITE_LABEL),
          ]),
          cheerSection(p.subLine),
          h("div", { key: "msg", style: { display: "flex", fontFamily: GO_M, fontSize: 27, color: RED, letterSpacing: 1.5 } }, MESSAGE),
        ]
      ),
      perforation(),
      h(
        "div",
        { key: "right", style: { display: "flex", flexDirection: "column", width: 268, alignItems: "center", justifyContent: "center", padding: "0 20px" } },
        right
      ),
    ]
  );

  return h("div", { style: { display: "flex", width: 1200, height: 630, background: BG, alignItems: "center", justifyContent: "center" } }, ticket);
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

  const iconDataUri = await loadPresenterIconDataUri(env, loaded.row);
  const data = { nickname: loaded.row.nickname || "", iconDataUri, subLine: presenterSubLine(loaded) };

  const fonts = await loadFonts(env, request);
  cache.setExecutionContext(context);
  const imgRes = await ImageResponse.async(buildTree(data), {
    width: 1200, height: 630, format: "png",
    fonts: fontList(fonts),
  });

  const response = new Response(imgRes.body, {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" },
  });
  context.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}
