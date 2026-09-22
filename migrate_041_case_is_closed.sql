-- 一度だけ実行するマイグレーション（2026-09-22）
-- 終結日（archived_at）が分からない事件でも「終結した」ことだけチェックで持てるようにする列を足す。
-- 他のテーブルには触らない。既存行は全部 0（未終結）のまま入る。
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_041_case_is_closed.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_041_case_is_closed.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql に同じ定義が入っている）。

ALTER TABLE cases ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0;
