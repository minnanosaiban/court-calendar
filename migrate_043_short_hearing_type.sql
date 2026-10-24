-- 一度だけ実行するマイグレーション（2026-10-24）
-- 期日の種別「第N回口頭弁論」を「第N回弁論」に置き換える（タイムラインで1行に収めるため）。
-- 対象は「第」で始まり「回口頭弁論」で終わる種別だけ（「口頭弁論終結」「弁論準備」などには触らない）。
-- 実行前の対象は43件（2026-10-24時点）。
--
-- 実行方法（先にバックアップ → 件数確認 → 実行）：
--   npx wrangler d1 export court-calendar --remote --output backup_before_043.sql
--   npx wrangler d1 execute court-calendar --remote --command "SELECT COUNT(*) FROM events WHERE type LIKE '第%回口頭弁論'"
--   npx wrangler d1 execute court-calendar --remote --file migrate_043_short_hearing_type.sql
-- 元に戻すとき： UPDATE events SET type = REPLACE(type, '回弁論', '回口頭弁論') WHERE type LIKE '第%回弁論';

UPDATE events SET type = REPLACE(type, '回口頭弁論', '回弁論') WHERE type LIKE '第%回口頭弁論';
