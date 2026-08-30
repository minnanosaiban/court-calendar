// 事件ごとの Xカード（1200x630 PNG）をその場で生成する。
// 「傍聴券」レイアウト：ハンコ＋サイト名／直近期日（無ければ終結・未定の案内）／問題提起人。
// 手作りでPNGを作って case_images に upload していた運用（ogcard.png）をやめて、
// D1 の最新データからその都度描くことで、期日が変わるたびの差し替え作業を無くす。
//
// URL: /api/cases/:id/card.png（非公開事件は ?key=閲覧キー が必要。case.js と同じ規則）
import React from "react";
import { ImageResponse, CustomFont, cache } from "@cf-wasm/og/workerd";
import { parseViewKeys } from "../../../_common.js";

const h = React.createElement;

const BG = "#f3f2ee";
const PAPER = "#fcfbf6";
const INK = "#221f1a";
const RED = "#b93226";
const GRAY = "#6b695f";
const FAINT = "#a8a59a";
const RING = "#dedbd3";

const MIN_B = "Shippori Mincho Bold";
const MIN_SB = "Shippori Mincho SemiBold";
const GO_R = "Zen Kaku Gothic New";
const GO_M = "Zen Kaku Gothic New Medium";

const SITE_LABEL = "応援傍聴ナビ";
const MESSAGE = "傍聴に行って応援しよう！";
const WEEK = ["月", "火", "水", "木", "金", "土", "日"];

function jpDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = WEEK[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
  return { year: `${y}年`, ymd: `${m}月${d}日（${wd}）` };
}
// サーバーはUTCで動くので、JSTの「今日」をここで作る（月またぎ・日またぎの誤差を防ぐ）
function todayJst() {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
}
// 大きい配列を一括で String.fromCharCode(...) に展開すると引数が多すぎて落ちるので、chunk して結合する
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ---- フォント（public/fonts/ の静的ファイルを env.ASSETS から読む。isolate 内で使い回す） ----
let FONT_CACHE = null;
async function loadFonts(env, request) {
  if (FONT_CACHE) return FONT_CACHE;
  const files = {
    [MIN_B]: "ShipporiMincho-Bold.ttf",
    [MIN_SB]: "ShipporiMincho-SemiBold.ttf",
    [GO_R]: "ZenKakuGothicNew-Regular.ttf",
    [GO_M]: "ZenKakuGothicNew-Medium.ttf",
  };
  const entries = await Promise.all(
    Object.entries(files).map(async ([name, file]) => {
      const res = await env.ASSETS.fetch(new URL("/fonts/" + file, request.url));
      if (!res.ok) throw new Error("font fetch failed: " + file);
      return [name, await res.arrayBuffer()];
    })
  );
  FONT_CACHE = Object.fromEntries(entries);
  return FONT_CACHE;
}

function stamp(size) {
  return h(
    "div",
    {
      style: {
        display: "flex", width: size, height: size, borderRadius: size * 0.13,
        border: `${Math.max(2, Math.round(size * 0.045))}px solid ${RED}`,
        color: RED, fontFamily: MIN_B, fontSize: size * 0.33,
        alignItems: "center", justifyContent: "center",
        transform: "rotate(-4deg)", // og-home.html の .stamp と同じ角度
      },
    },
    "傍聴"
  );
}

function perforation() {
  const dots = [];
  for (let i = 0; i < 13; i++) {
    dots.push(h("div", { key: i, style: { display: "flex", width: 3, height: 10, background: RING, borderRadius: 2 } }));
  }
  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: 3, height: "100%", paddingTop: 26, paddingBottom: 26 } },
    dots
  );
}

// 期日欄：直近期日／終結案内／未定案内のどれかを返す
function dateSection(c) {
  if (c.nextEvent) {
    const { year, ymd } = jpDate(c.nextEvent.date);
    return h("div", { style: { display: "flex", flexDirection: "column" } }, [
      h("div", { key: "y", style: { display: "flex", fontFamily: GO_R, fontSize: 23, color: FAINT } }, year),
      h("div", { key: "dt", style: { display: "flex", alignItems: "baseline", marginTop: 12 } }, [
        h("div", { key: "d", style: { display: "flex", fontFamily: MIN_B, fontSize: 58, color: INK } }, ymd),
        c.nextEvent.time
          ? h("div", { key: "t", style: { display: "flex", fontFamily: MIN_SB, fontSize: 36, color: INK, marginLeft: 24 } }, c.nextEvent.time)
          : null,
      ].filter(Boolean)),
      h(
        "div",
        { key: "p", style: { display: "flex", fontFamily: GO_R, fontSize: 27, color: GRAY, marginTop: 18 } },
        [c.nextEvent.court, c.nextEvent.place].filter(Boolean).join("　") || "傍聴できます"
      ),
    ]);
  }
  if (c.archivedAt) {
    const { year, ymd } = jpDate(c.archivedAt);
    return h("div", { style: { display: "flex", flexDirection: "column" } }, [
      h("div", { key: "y", style: { display: "flex", fontFamily: GO_R, fontSize: 23, color: FAINT } }, "終結"),
      h("div", { key: "dt", style: { display: "flex", fontFamily: MIN_B, fontSize: 44, color: INK, marginTop: 12 } }, `${year}${ymd}`),
      c.closeType
        ? h("div", { key: "p", style: { display: "flex", fontFamily: GO_R, fontSize: 27, color: GRAY, marginTop: 18 } }, c.closeType)
        : null,
    ].filter(Boolean));
  }
  return h("div", { style: { display: "flex", flexDirection: "column" } }, [
    h("div", { key: "d", style: { display: "flex", fontFamily: MIN_B, fontSize: 40, color: INK } }, "次回期日は未定です"),
  ]);
}

function buildTree(c) {
  const right = [];
  if (c.iconDataUri) {
    right.push(h("img", { key: "av", src: c.iconDataUri, width: 112, height: 112, style: { borderRadius: "50%", border: `3px solid ${RING}` } }));
  }
  if (c.presenterNickname) {
    right.push(h("div", { key: "nick", style: { display: "flex", marginTop: c.iconDataUri ? 20 : 0, fontFamily: GO_R, fontSize: 26, color: GRAY, textAlign: "center" } }, c.presenterNickname + "さん"));
  }
  right.push(h("div", { key: "sp", style: { display: "flex", height: 36 } }));
  right.push(stamp(52));

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

  const c = await env.DB.prepare(
    `SELECT c.id, c.name, c.archived_at, c.close_type, c.view_key, c.card_r2_key,
            p.nickname AS presenter_nickname, p.icon_r2_key AS presenter_icon_r2_key
       FROM cases c LEFT JOIN presenters p ON p.id = c.presenter_id
      WHERE c.id = ?`
  ).bind(id).first();
  if (!c) return new Response("not found", { status: 404 });

  // 非公開事件は、閲覧キーが合っている人にしか出さない（case.js と同じ規則。クローラーへの漏洩防止）
  const isPrivate = !!c.view_key;
  if (isPrivate && parseViewKeys(request)[c.id] !== c.view_key) return new Response("not found", { status: 404 });

  // 公開事件はエッジキャッシュする（1時間）。非公開事件はキーごとに内容が変わるためキャッシュしない。
  const cacheKey = new Request(url.toString(), request);
  if (!isPrivate) {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  }

  // 手動でカード画像を差し替えていれば（cases.card_r2_key）、自動生成せずそちらをそのまま返す。
  // URLはどちらの場合も同じ /api/cases/:id/card.png のまま（case.js側の og:image は変更不要）
  if (c.card_r2_key && env.FILES) {
    const obj = await env.FILES.get(c.card_r2_key).catch(() => null);
    if (obj) {
      const response = new Response(obj.body, {
        headers: {
          "content-type": obj.httpMetadata?.contentType || "image/jpeg",
          "cache-control": isPrivate ? "private, no-store" : "public, max-age=3600",
        },
      });
      if (!isPrivate) context.waitUntil(caches.default.put(cacheKey, response.clone()));
      return response;
    }
  }

  const today = todayJst();
  const nextEvent = await env.DB.prepare(
    `SELECT date, time, court, place FROM events WHERE case_id = ? AND date >= ? ORDER BY date ASC, time ASC LIMIT 1`
  ).bind(id, today).first();

  let iconDataUri = null;
  if (c.presenter_icon_r2_key && env.FILES) {
    const obj = await env.FILES.get(c.presenter_icon_r2_key).catch(() => null);
    if (obj) {
      const contentType = obj.httpMetadata?.contentType || "";
      // resvg は WebP のデコードに対応していない（無音で空描画になる）ので、その場合は写真を諦める
      if (contentType !== "image/webp") {
        const buf = await obj.arrayBuffer();
        iconDataUri = `data:${contentType || "image/jpeg"};base64,${arrayBufferToBase64(buf)}`;
      }
    }
  }

  const data = {
    presenterNickname: c.presenter_nickname || "",
    iconDataUri,
    nextEvent: nextEvent || null,
    archivedAt: c.archived_at || "",
    closeType: c.close_type || "",
  };

  const fonts = await loadFonts(env, request);
  cache.setExecutionContext(context);
  const imgRes = await ImageResponse.async(buildTree(data), {
    width: 1200, height: 630, format: "png",
    fonts: [
      new CustomFont(MIN_B, () => fonts[MIN_B]),
      new CustomFont(MIN_SB, () => fonts[MIN_SB]),
      new CustomFont(GO_R, () => fonts[GO_R]),
      new CustomFont(GO_M, () => fonts[GO_M]),
    ],
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
