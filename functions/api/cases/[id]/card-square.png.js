// 事件ごとのXカード（正方形、1200x1200 PNG）をその場で生成する。
// Teams・Slackなど多くのアプリは og:image を正方形に中央付近でトリミングして小さく出すため、
// 横長版（card.png.js）をそのまま渡すと日付や問題提起人のアイコンが切れてしまう（2026-08-30に発覚）。
// あらかじめ正方形に組んだこちらを og:image として渡す（case.js参照）。X（Twitter）は
// twitter:image を優先して読むので、そちらには引き続き横長版を渡す。
// レイアウトの部品（フォント・ハンコ・期日欄など）は card.png.js と共通（_card.js）。
//
// URL: /api/cases/:id/card-square.png（非公開事件は ?key=閲覧キー が必要。case.js と同じ規則）
import {
  h, BG, PAPER, RING, GO_R, GO_M, INK, RED, GRAY,
  SITE_LABEL, MESSAGE, stamp, dateSection,
  loadFonts, fontList, loadCardContext, loadPresenterIconDataUri, loadCardData, overrideResponse,
  ImageResponse, cache,
} from "../_card.js";

function buildSquareTree(c) {
  const presenter = [];
  if (c.iconDataUri) {
    presenter.push(h("img", { key: "av", src: c.iconDataUri, width: 140, height: 140, style: { borderRadius: "50%", border: `3px solid ${RING}` } }));
  }
  if (c.presenterNickname) {
    presenter.push(h(
      "div",
      { key: "nick", style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: c.iconDataUri ? 20 : 0, fontFamily: GO_R, fontSize: 30, color: GRAY, textAlign: "center" } },
      [
        h("div", { key: "n1", style: { display: "flex" } }, c.presenterNickname + "さん"),
        h("div", { key: "n2", style: { display: "flex" } }, "を応援！"),
      ]
    ));
  } else if (!c.iconDataUri) {
    // アイコン・ニックネームどちらも無いときだけ、サイトのハンコを目印に出す
    presenter.push(stamp(64));
  }

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
      h("div", { key: "date", style: { display: "flex", marginTop: 64 } }, dateSection(c, true)),
      h("div", { key: "presenter", style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 64 } }, presenter),
      h("div", { key: "msg", style: { display: "flex", fontFamily: GO_M, fontSize: 32, color: RED, letterSpacing: 1.5, marginTop: 64, textAlign: "center" } }, MESSAGE),
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

  const nextEvent = await loadCardData(env, id);
  const iconDataUri = await loadPresenterIconDataUri(env, c);

  const data = {
    presenterNickname: c.presenter_nickname || "",
    iconDataUri,
    nextEvent,
    archivedAt: c.archived_at || "",
    closeType: c.close_type || "",
  };

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
