// 問題提起人カード（card.png.js／card-square.png.js）の共通部分。
// ファイル名が _ で始まるので Pages Functions のルーティング対象にはならない（cases/_card.js と同じ扱い）。
// 意匠そのもの（色・フォント・ハンコ・期日欄）は事件カードと共通なので cases/_card.js を使う。
import { todayJst, jpDate } from "../cases/_card.js";
import { hiddenCaseIds, presenterCaseVisibility } from "../../_common.js";

// 問題提起人＋その人の公開事件を横断した直近期日。事件カードの loadCardData と同じ考え方。
// 非公開にした事件（view_key あり）は、合言葉を知らない人に中身が漏れないよう数えない。
// このカード画像はURLだけで誰にでも配信されキャッシュもされる（cache-control: public）ので、
// presenter.js のOGP判定・/api/presenters/:id と同じ規則で、全事件が非公開の問題提起人は
// 「そんな人はいない」扱い（404）にする（2026-09-11、card.png/card-square.png がこの判定を
//  素通りしてニックネーム・アイコン・カード文言を漏らしていた抜けの修正）
export async function loadPresenterCardData(env, id, request) {
  const today = todayJst();
  const [p, nextEvent, count, hidden] = await Promise.all([
    env.DB.prepare(`SELECT id, nickname, icon_r2_key AS presenter_icon_r2_key,
              card_r2_key, card_square_r2_key, card_headline, card_sub, card_message, seo_title
         FROM presenters WHERE id = ?`).bind(id).first(),
    env.DB.prepare(
      `SELECT e.date, e.time, e.court, e.place
         FROM events e JOIN cases c ON c.id = e.case_id
        WHERE c.presenter_id = ? AND (c.view_key IS NULL OR c.view_key = '') AND e.date >= ?
        ORDER BY e.date ASC, e.time ASC LIMIT 1`
    ).bind(id, today).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM cases WHERE presenter_id = ? AND (view_key IS NULL OR view_key = '')`
    ).bind(id).first(),
    hiddenCaseIds(env, request),
  ]);
  if (!p) return null;
  const { total, visible } = await presenterCaseVisibility(env, id, hidden);
  if (total > 0 && visible === 0) return null;
  // プロフィールカード自体に事件のような view_key（個別の非公開鍵）は無い。全事件が非公開の
  // 問題提起人は上でnullを返して弾いているので、ここに来た時点で isPrivate は常にfalse。
  // cases/_card.js の loadCardContext と同じ理由で、呼び出し側にベタ書きのfalseを持たせず
  // この関数からisPrivateを読ませる（2026-09-11）
  return { row: p, nextEvent: nextEvent || null, caseCount: (count && count.n) || 0, isPrivate: false };
}

// プロフィールカードのグレー1行。直近期日があればそれを、無ければ掲載件数を出す
// （プロフィールカードは期日の有無にかかわらず応援の面＝cheerSection を主役にするので、
//   日付はここに小さく添えるだけにする）。
export function presenterSubLine(loaded) {
  if (loaded.nextEvent) {
    const { ymd } = jpDate(loaded.nextEvent.date);
    return `次回 ${ymd}${loaded.nextEvent.time ? " " + loaded.nextEvent.time : ""}`;
  }
  return `応援している裁判 ${loaded.caseCount}件`;
}
