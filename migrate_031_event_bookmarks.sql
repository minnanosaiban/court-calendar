-- 期日（events）単位の「お気に入り」を追加する（2026-08-29）
-- 事件単位の❤いいね（likes・件数表示あり）とは別概念。こちらは件数を出さない、自分専用のON/OFFの目印（🔖bookmark）。
-- viewer は likes と同じく端末ごとの識別子を SHA-256 した値。新規に作るなら schema.sql だけでよい（このファイルは不要）。

CREATE TABLE IF NOT EXISTS event_bookmarks (
  event_id    TEXT NOT NULL REFERENCES events(id),
  viewer      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (event_id, viewer)
);
