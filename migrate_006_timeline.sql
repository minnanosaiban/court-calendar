-- 一度だけ実行するマイグレーション（2026-08-22）
-- タイムライン刷新：期日に「原告/被告の主張」、訴訟資料に「本文（Markdown）」を追加する。
-- 他のテーブルには触らない。
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_006_timeline.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_006_timeline.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql に同じ定義が入っている）。

ALTER TABLE events    ADD COLUMN plaintiff_argument TEXT;
ALTER TABLE events    ADD COLUMN defendant_argument TEXT;
ALTER TABLE materials ADD COLUMN body TEXT;
