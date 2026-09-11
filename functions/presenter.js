// /presenter?id=... へのアクセスだけ、この関数を通す（public/presenter.html は静的資産としてそのまま残る）。
// 目的は case.js と同じで、X・LINE 等でシェアされたときに正しいタイトル・説明・画像（OGP）で
// カードが出るように、配信直前に <head> だけをその場で書き換える。中身の描画は client 側の lib.js が行う。
// og:image には正方形版（Teams・Slack等が中央トリミングして小さく出す対策）、X が優先して読む
// twitter:image には横長版を渡す（case.js と同じ出し分け）。
// 非公開にした事件しか持たない問題提起人は、匿名の訪問者には「存在しない」扱いにする
// （/api/presenters/:id が匿名・合言葉なしの相手に404を返すのと同じ規則。2026-09-10。
//  このハンドラはページのナビゲーションそのものを受けるので X-View-Keys 等のヘッダは
//  そもそも付かず、常に匿名の訪問者として扱ってよい）
import { hiddenCaseIds, presenterCaseVisibility, truncateChars } from "./_common.js";

function escAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  const assetRes = await env.ASSETS.fetch(new URL("/presenter.html", request.url));
  if (!assetRes.ok || !id) return assetRes;

  // events_updated_at はこの問題提起人の事件にぶら下がる期日の最新更新時刻（?vトークン用。下記参照）
  const p = await env.DB.prepare(
    `SELECT p.id, p.nickname, p.seo_title, p.seo_description, p.updated_at,
            (SELECT MAX(e.updated_at) FROM events e JOIN cases c ON c.id = e.case_id WHERE c.presenter_id = p.id) AS events_updated_at
       FROM presenters p WHERE p.id = ?`
  ).bind(id).first();
  if (!p) return assetRes;

  // 非公開にした事件しか持たない問題提起人は、素のページ（書き換えなし）をそのまま返す
  // （事件名・アイコン等がOGPに一切乗らない。/api/presenters/:id と同じ規則、上のコメント参照）
  const hidden = await hiddenCaseIds(env, request);
  const visibility = await presenterCaseVisibility(env, p.id, hidden);
  if (visibility.total > 0 && visibility.visible === 0) return assetRes;

  // 更新時刻を付けておくと、カードの文言を変えたときに古いキャッシュを引かずに済む（2026-09-10）。
  // プロフィール本体（presenters.updated_at）だけでなく、掲載している事件の期日（events.updated_at）
  // も含める：期日だけの変更はpresentersの行に触れないため、そのままだとカードの「次回」表示が
  // 古いキャッシュのまま残ってしまう（2026-09-11、case.jsの同じ不備と合わせて修正）
  const ver = (String(p.updated_at || "") + String(p.events_updated_at || "")).replace(/\D/g, "");
  function cardUrlFor(path) {
    const u = new URL(`/api/presenters/${encodeURIComponent(p.id)}/${path}`, request.url);
    if (ver) u.searchParams.set("v", ver);
    return u.toString();
  }
  const cardWideUrl = cardUrlFor("card.png");
  const cardSquareUrl = cardUrlFor("card-square.png");

  // 検索結果・シェアの見出しは、編集画面で入れてあればそれを使う（空＝自動。2026-09-10）
  const title = p.seo_title || `${p.nickname}さん ｜ 応援傍聴ナビ`;
  const description = truncateChars(p.seo_description ||
    `${p.nickname}さんが応援を呼びかけている裁判です。傍聴席に、ひとり増える。それだけで法廷は変わる。`, 140);

  const extraTags = [
    `<meta property="og:title" content="${escAttr(title)}">`,
    `<meta property="og:description" content="${escAttr(description)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:url" content="${escAttr(request.url)}">`,
    `<meta property="og:site_name" content="応援傍聴ナビ">`,
    `<meta property="og:image" content="${escAttr(cardSquareUrl)}">`,
    `<meta name="twitter:image" content="${escAttr(cardWideUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n");

  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute("content", description); } })
    .on("head", { element(el) { el.append(extraTags, { html: true }); } })
    .transform(assetRes);
}
