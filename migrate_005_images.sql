-- 一度だけ実行するマイグレーション（2026-08-22）
-- 事件の写真（case_images）テーブルを追加する。他のテーブルには触らない。
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_005_images.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_005_images.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql に同じ定義が入っている）。

CREATE TABLE IF NOT EXISTS case_images (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  r2_key      TEXT NOT NULL,
  file_name   TEXT,
  file_size   INTEGER,
  mime        TEXT,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_images_case ON case_images(case_id, sort_order, created_at);
