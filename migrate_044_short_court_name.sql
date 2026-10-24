-- 一度だけ実行するマイグレーション（2026-10-24）
-- 期日の裁判所名を略称にそろえる（東京地方裁判所→東京地裁、東京高等裁判所→東京高裁 など）。
-- 画面側の courtAbbr()（lib.js）と同じ規則：末尾の「地方裁判所／高等裁判所／家庭裁判所／簡易裁判所」を
-- 地裁／高裁／家裁／簡裁に、「最高裁判所」を「最高裁」にする。すでに略称のもの・それ以外の名前には触らない。
-- 実行前の対象は55件（2026-10-24時点）。
--
-- 実行方法（先にバックアップ → 実行）：
--   npx wrangler d1 export court-calendar --remote --output backup_before_044.sql
--   npx wrangler d1 execute court-calendar --remote --file migrate_044_short_court_name.sql
-- 元に戻すとき：backup_before_044.sql の events の court 列から戻す（略称→正式名称は一意に決まらないため）

UPDATE events SET court =
  CASE
    WHEN court LIKE '%地方裁判所' THEN substr(court, 1, length(court) - 5) || '地裁'
    WHEN court LIKE '%高等裁判所' THEN substr(court, 1, length(court) - 5) || '高裁'
    WHEN court LIKE '%家庭裁判所' THEN substr(court, 1, length(court) - 5) || '家裁'
    WHEN court LIKE '%簡易裁判所' THEN substr(court, 1, length(court) - 5) || '簡裁'
    WHEN court = '最高裁判所' THEN '最高裁'
    ELSE court
  END
WHERE court LIKE '%地方裁判所' OR court LIKE '%高等裁判所' OR court LIKE '%家庭裁判所'
   OR court LIKE '%簡易裁判所' OR court = '最高裁判所';
