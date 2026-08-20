-- 裁判カレンダーの共有データ（D1 / SQLite）
--
-- v2（2026-08-20）：傍聴の呼びかけに必要な形へ整理。
--   事件テーブルは分けず、これまで通り1期日=1行のまま（case_name で事件をまとめる）。
--   既に旧スキーマで作成済みのDBを更新する場合は migrate_002_call_for_support.sql を実行すること。
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  case_name   TEXT NOT NULL,   -- 事件名
  case_no     TEXT,            -- 事件番号（わかれば）
  date        TEXT NOT NULL,   -- 期日 YYYY-MM-DD
  time        TEXT,            -- 時刻 HH:MM
  type        TEXT,            -- 期日の種類（第3回口頭弁論 など）
  court       TEXT,            -- 裁判所名
  place       TEXT,            -- 法廷
  parties     TEXT,            -- 当事者
  host        TEXT,            -- 呼びかけている団体・お名前
  contact     TEXT,            -- 連絡先（公開してよいものだけ）
  lede        TEXT,            -- 事件の説明（3〜4行）
  points      TEXT,            -- 争われていること（1行1項目、改行区切り）
  open        INTEGER NOT NULL DEFAULT 1, -- 1=誰でも傍聴できる／0=非公開・要確認
  level       TEXT,            -- 見どころタグ（はじめて向け、報道あり など）
  created_by  TEXT,            -- 追加した人のメール
  updated_by  TEXT,            -- 最後に更新した人のメール
  updated_at  TEXT             -- 更新日時 ISO8601
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- 「行ってきたよ掲示板」の投稿（2026-08-20）
-- 傍聴に行った人なら誰でも書ける代わりに、文の形を固定する（誹謗中傷を防ぐため）。
--   subject（選択）＋ quote（自由記入）＋ verb（選択）で1文になる：
--     主張した → 「◯◯は『△△』と主張しました」
--     求めた   → 「◯◯は『△△』を求めました」
CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,              -- どの期日についての報告か
  subject    TEXT NOT NULL,              -- 原告 / 被告 / 裁判官
  quote      TEXT NOT NULL,              -- かぎ括弧の中（自由記入・60字まで）
  verb       TEXT NOT NULL,              -- 主張した / 求めた
  hidden     INTEGER NOT NULL DEFAULT 0, -- 1=運営が非表示にした
  created_at TEXT NOT NULL               -- 投稿日時 ISO8601
);
CREATE INDEX IF NOT EXISTS idx_posts_event ON posts(event_id, created_at);
