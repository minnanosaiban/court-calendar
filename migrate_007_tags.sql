-- 一度だけ実行するマイグレーション（2026-08-22）
-- 事件にタグ（cases.tags）を追加する。他のテーブルには触らない。
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_007_tags.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_007_tags.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql に同じ定義が入っている）。

ALTER TABLE cases ADD COLUMN tags TEXT;
