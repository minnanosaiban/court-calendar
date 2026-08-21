-- 一度だけ実行するマイグレーション（2026-08-22）
-- 事件に終結（裁判アーカイブ）用の列を追加する。他のテーブルには触らない。
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_008_archive.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_008_archive.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql に同じ定義が入っている）。

ALTER TABLE cases ADD COLUMN archived_at TEXT;
ALTER TABLE cases ADD COLUMN close_type  TEXT;
ALTER TABLE cases ADD COLUMN result      TEXT;
