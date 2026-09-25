-- 一度だけ実行するマイグレーション（2026-09-26）
-- 期日の「原告の主張／被告の主張」に、資料の要約（summary_model／summary_date）と同じ形で
-- AIモデル名・作成日を添えられるようにする列を足す。他のテーブルには触らない。既存行は全部NULLのまま入る。
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_042_event_argument_ai.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_042_event_argument_ai.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql に同じ定義が入っている）。

ALTER TABLE events ADD COLUMN plaintiff_argument_model TEXT;
ALTER TABLE events ADD COLUMN plaintiff_argument_date  TEXT;
ALTER TABLE events ADD COLUMN defendant_argument_model TEXT;
ALTER TABLE events ADD COLUMN defendant_argument_date  TEXT;
