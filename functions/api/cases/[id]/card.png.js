// 事件ごとのXカード（横長=Large、1200x630 PNG）をその場で生成する。
// 「傍聴券」レイアウト：ハンコ＋サイト名／直近期日（無ければ終結・未定の案内）／問題提起人。
// 手作りでPNGを作って case_images に upload していた運用（ogcard.png）をやめて、
// D1 の最新データからその都度描くことで、期日が変わるたびの差し替え作業を無くす。
// 正方形版（Teams・Slack等がog:imageを中央トリミングして小さく出す対策）は card-square.png.js。
//
// URL: /api/cases/:id/card.png（非公開事件は ?key=閲覧キー が必要。case.js と同じ規則）
import {
  h, BG, PAPER, RING, GO_R, GO_M, INK, RED, GRAY,
  SITE_LABEL, MESSAGE, stamp, perforation, dateSection,
  loadFonts, fontList, loadCardContext, loadPresenterIconDataUri, loadCardData, overrideResponse,
  ImageResponse, cache,
} from "../_card.js";

function buildTree(c) {
  const right = [];
  if (c.iconDataUri) {
    right.push(h("img", { key: "av", src: c.iconDataUri, width: 112, height: 112, style: { borderRadius: "50%", border: `3px solid ${RING}` } }));
  }
  if (c.presenterNickname) {
    // 問題提起人がいる事件は「◯◯さん」「を応援！」の2行で締める（ハンコは出さない。2026-08-30）。
    // 1行の文字列にすると「応援」の真ん中で折り返ってしまうことがあるため、あらかじめ2行に分けている
    right.push(h(
      "div",
      { key: "nick", style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: c.iconDataUri ? 20 : 0, fontFamily: GO_R, fontSize: 26, color: GRAY, textAlign: "center" } },
      [
        h("div", { key: "n1", style: { display: "flex" } }, c.presenterNickname + "さん"),
        h("div", { key: "n2", style: { display: "flex" } }, "を応援！"),
      ]
    ));
  } else {
    // 問題提起人が未設定の事件は、右側にサイトのハンコだけを出しておく
    right.push(h("div", { key: "sp", style: { display: "flex", height: 36 } }));
    right.push(stamp(52));
  }

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
          dateSection(c),
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
  const id = params.id;

  const ctx = await loadCardContext(env, request, id);
  if (!ctx) return new Response("not found", { status: 404 });
  const { row: c, isPrivate } = ctx;

  // 公開事件はエッジキャッシュする（1時間）。非公開事件はキーごとに内容が変わるためキャッシュしない。
  const cacheKey = new Request(url.toString(), request);
  if (!isPrivate) {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  }

  // 手動でカード画像を差し替えていれば（cases.card_r2_key）、自動生成せずそちらをそのまま返す。
  // URLはどちらの場合も同じ /api/cases/:id/card.png のまま（case.js側の og:image は変更不要）
  const overridden = await overrideResponse(env, c.card_r2_key, isPrivate, cacheKey, context);
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
  const imgRes = await ImageResponse.async(buildTree(data), {
    width: 1200, height: 630, format: "png",
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
