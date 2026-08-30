// card.png.js（横長=Large）・card-square.png.js（正方形）の共通部品。
// ファイル名が _ で始まるので Pages Functions のルーティング対象にはならない（_common.js と同じ扱い）。
import React from "react";
import { ImageResponse, CustomFont, cache } from "@cf-wasm/og/workerd";
import { parseViewKeys } from "../../_common.js";

export { cache, ImageResponse, CustomFont, parseViewKeys };

const h = React.createElement;
export { h };

export const BG = "#f3f2ee";
export const PAPER = "#fcfbf6";
export const INK = "#221f1a";
export const RED = "#b93226";
export const GRAY = "#6b695f";
export const FAINT = "#a8a59a";
export const RING = "#dedbd3";

export const MIN_B = "Shippori Mincho Bold";
export const MIN_SB = "Shippori Mincho SemiBold";
export const GO_R = "Zen Kaku Gothic New";
export const GO_M = "Zen Kaku Gothic New Medium";

export const SITE_LABEL = "応援傍聴ナビ";
export const MESSAGE = "傍聴に行って応援しよう！";
const WEEK = ["月", "火", "水", "木", "金", "土", "日"];

export function jpDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = WEEK[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
  return { year: `${y}年`, ymd: `${m}月${d}日（${wd}）` };
}
// サーバーはUTCで動くので、JSTの「今日」をここで作る（月またぎ・日またぎの誤差を防ぐ）
export function todayJst() {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}-${String(j.getUTCDate()).padStart(2, "0")}`;
}
// 大きい配列を一括で String.fromCharCode(...) に展開すると引数が多すぎて落ちるので、chunk して結合する
export function arrayBufferToBase64(buf) {
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
export async function loadFonts(env, request) {
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
export function fontList(fonts) {
  return [
    new CustomFont(MIN_B, () => fonts[MIN_B]),
    new CustomFont(MIN_SB, () => fonts[MIN_SB]),
    new CustomFont(GO_R, () => fonts[GO_R]),
    new CustomFont(GO_M, () => fonts[GO_M]),
  ];
}

export function stamp(size) {
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

export function perforation() {
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

// 期日欄：直近期日／終結案内／未定案内のどれかを返す。center=true なら正方形版向けに中央寄せにする
export function dateSection(c, center) {
  const align = center ? { alignItems: "center", textAlign: "center" } : {};
  if (c.nextEvent) {
    const { year, ymd } = jpDate(c.nextEvent.date);
    return h("div", { style: { display: "flex", flexDirection: "column", ...align } }, [
      h("div", { key: "y", style: { display: "flex", fontFamily: GO_R, fontSize: 23, color: FAINT } }, year),
      h("div", { key: "dt", style: { display: "flex", alignItems: "baseline", marginTop: 12, ...(center ? { justifyContent: "center" } : {}) } }, [
        h("div", { key: "d", style: { display: "flex", fontFamily: MIN_B, fontSize: 58, color: INK } }, ymd),
        c.nextEvent.time
          ? h("div", { key: "t", style: { display: "flex", fontFamily: MIN_SB, fontSize: 36, color: INK, marginLeft: 24 } }, c.nextEvent.time)
          : null,
      ].filter(Boolean)),
      h(
        "div",
        { key: "p", style: { display: "flex", fontFamily: GO_R, fontSize: 27, color: GRAY, marginTop: 18, ...align } },
        [c.nextEvent.court, c.nextEvent.place].filter(Boolean).join("　") || "傍聴できます"
      ),
    ]);
  }
  if (c.archivedAt) {
    const { year, ymd } = jpDate(c.archivedAt);
    return h("div", { style: { display: "flex", flexDirection: "column", ...align } }, [
      h("div", { key: "y", style: { display: "flex", fontFamily: GO_R, fontSize: 23, color: FAINT } }, "終結"),
      h("div", { key: "dt", style: { display: "flex", fontFamily: MIN_B, fontSize: 44, color: INK, marginTop: 12 } }, `${year}${ymd}`),
      c.closeType
        ? h("div", { key: "p", style: { display: "flex", fontFamily: GO_R, fontSize: 27, color: GRAY, marginTop: 18 } }, c.closeType)
        : null,
    ].filter(Boolean));
  }
  return h("div", { style: { display: "flex", flexDirection: "column", ...align } }, [
    h("div", { key: "d", style: { display: "flex", fontFamily: MIN_B, fontSize: 40, color: INK } }, "次回期日は未定です"),
  ]);
}

// 事件データの読み出し＋非公開チェック＋問題提起人アイコンのdata URI化。card.png.js・card-square.png.js共通。
// card_r2_key・card_square_r2_key の両方を読んでおき、どちらを見るかは呼び出し側（variant）に任せる
export async function loadCardContext(env, request, id) {
  const c = await env.DB.prepare(
    `SELECT c.id, c.name, c.archived_at, c.close_type, c.view_key, c.card_r2_key, c.card_square_r2_key,
            p.nickname AS presenter_nickname, p.icon_r2_key AS presenter_icon_r2_key
       FROM cases c LEFT JOIN presenters p ON p.id = c.presenter_id
      WHERE c.id = ?`
  ).bind(id).first();
  if (!c) return null;

  const isPrivate = !!c.view_key;
  if (isPrivate && parseViewKeys(request)[c.id] !== c.view_key) return null;

  return { row: c, isPrivate };
}

export async function loadPresenterIconDataUri(env, c) {
  if (!c.presenter_icon_r2_key || !env.FILES) return null;
  const obj = await env.FILES.get(c.presenter_icon_r2_key).catch(() => null);
  if (!obj) return null;
  const contentType = obj.httpMetadata?.contentType || "";
  // resvg は WebP のデコードに対応していない（無音で空描画になる）ので、その場合は写真を諦める
  if (contentType === "image/webp") return null;
  const buf = await obj.arrayBuffer();
  return `data:${contentType || "image/jpeg"};base64,${arrayBufferToBase64(buf)}`;
}

export async function loadCardData(env, id) {
  const today = todayJst();
  const nextEvent = await env.DB.prepare(
    `SELECT date, time, court, place FROM events WHERE case_id = ? AND date >= ? ORDER BY date ASC, time ASC LIMIT 1`
  ).bind(id, today).first();
  return nextEvent || null;
}

// 手動差し替え画像（あれば）をそのまま返すレスポンスを作る。無ければnullを返す
export async function overrideResponse(env, r2Key, isPrivate, cacheKey, context) {
  if (!r2Key || !env.FILES) return null;
  const obj = await env.FILES.get(r2Key).catch(() => null);
  if (!obj) return null;
  const response = new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "image/jpeg",
      "cache-control": isPrivate ? "private, no-store" : "public, max-age=3600",
    },
  });
  if (!isPrivate) context.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}
