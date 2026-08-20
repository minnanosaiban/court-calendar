-- 一度だけ実行するマイグレーション（2026-08-20）
-- 旧スキーマ
--   （id, case_name, date, time, type, place, note, created_by, updated_by, updated_at）
-- で作成済みの events を、傍聴の呼びかけ用の形へ移行する。
--   追加：case_no / court / parties / host / contact / lede / points / open / level
--   削除：note（「この日のみどころ・メモ」は廃止）
-- ADD COLUMN は既存の行を消さない。DROP COLUMN は note 列に入っていた値だけを捨てる。
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_002_call_for_support.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_002_call_for_support.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql だけで最新の形になる）。

ALTER TABLE events ADD COLUMN case_no TEXT;
ALTER TABLE events ADD COLUMN court   TEXT;
ALTER TABLE events ADD COLUMN parties TEXT;
ALTER TABLE events ADD COLUMN host    TEXT;
ALTER TABLE events ADD COLUMN contact TEXT;
ALTER TABLE events ADD COLUMN lede    TEXT;
ALTER TABLE events ADD COLUMN points  TEXT;
ALTER TABLE events ADD COLUMN open    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE events ADD COLUMN level   TEXT;

ALTER TABLE events DROP COLUMN note;
