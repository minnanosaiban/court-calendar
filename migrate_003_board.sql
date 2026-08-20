-- 一度だけ実行するマイグレーション（2026-08-20）
-- 「行ってきたよ掲示板」の投稿テーブルを追加する。events には触らない。
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_003_board.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_003_board.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql に同じ定義が入っている）。

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  quote      TEXT NOT NULL,
  verb       TEXT NOT NULL,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_event ON posts(event_id, created_at);
