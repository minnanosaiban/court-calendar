// 問題提起人カード（card.png.js／card-square.png.js）の共通部分。
// ファイル名が _ で始まるので Pages Functions のルーティング対象にはならない（cases/_card.js と同じ扱い）。
// 意匠そのもの（色・フォント・ハンコ・期日欄）は事件カードと共通なので cases/_card.js を使う。
import { todayJst, jpDate } from "../cases/_card.js";

// 問題提起人＋その人の公開事件を横断した直近期日。事件カードの loadCardData と同じ考え方。
// 非公開にした事件（view_key あり）は、合言葉を知らない人に中身が漏れないよう数えない。
export async function loadPresenterCardData(env, id) {
  const today = todayJst();
  const [p, nextEvent, count] = await Promise.all([
    env.DB.prepare(`SELECT id, nickname, icon_r2_key AS presenter_icon_r2_key,
              card_r2_key, card_square_r2_key, card_headline, card_sub, card_message
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
  ]);
  if (!p) return null;
  return { row: p, nextEvent: nextEvent || null, caseCount: (count && count.n) || 0 };
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
