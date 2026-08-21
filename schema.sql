-- 裁判カレンダーの共有データ（D1 / SQLite）
--
-- v3（2026-08-21）：事件（cases）を独立させ、訴訟資料（materials）・いいね（likes）を追加。
--   事件に属するもの（当事者・争点・説明・よびかけ・リンク）は cases に1回だけ持ち、
--   期日（events）は case_id で事件にぶら下がる。
--   旧スキーマ（1期日=1行に事件の説明を重複保存）のDBを更新する場合は
--   migrate_004_cases.sql を実行すること。新規に作るならこのファイルだけでよい。

-- 事件
CREATE TABLE IF NOT EXISTS cases (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE, -- 事件名（画面のタイトル）
  case_no     TEXT,                 -- 事件番号（わかれば）
  parties     TEXT,                 -- 当事者
  points      TEXT,                 -- 争点（1行1項目、改行区切り）
  lede        TEXT,                 -- 事件の説明（3〜4行）
  call_text   TEXT,                 -- よびかけ（傍聴・支援のお願い）
  host        TEXT,                 -- 呼びかけている団体・お名前
  contact     TEXT,                 -- 連絡先（公開してよいものだけ）
  links       TEXT,                 -- 当事者のアカウント等のURL（1行1つ、改行区切り）
  created_by  TEXT,
  updated_by  TEXT,
  updated_at  TEXT                  -- ISO8601
);

-- 期日（1期日=1行）
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  date        TEXT NOT NULL,   -- 期日 YYYY-MM-DD
  time        TEXT,            -- 時刻 HH:MM
  type        TEXT,            -- 期日の種類（第3回口頭弁論 など）
  court       TEXT,            -- 裁判所名
  place       TEXT,            -- 法廷
  open        INTEGER NOT NULL DEFAULT 1, -- 1=誰でも傍聴できる／0=非公開・要確認
  level       TEXT,            -- 見どころタグ（はじめて向け、報道あり など）
  created_by  TEXT,
  updated_by  TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, date);

-- 訴訟資料（書面・証拠・判決など）。ここは目録で、ファイル本体は url（public/docs/ や外部）か R2 に置く。
-- ファイルを付けない「目録だけ」の登録もできる（箇条書き・要約だけ載せたいとき）。
CREATE TABLE IF NOT EXISTS materials (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  event_id    TEXT,            -- どの期日に出された書面か（任意。タイムラインの節にぶら下がる）
  title       TEXT NOT NULL,   -- 訴状、第1準備書面、甲1 ○○ など
  side        TEXT,            -- 原告側 / 被告側 / 裁判所 / その他
  kind        TEXT,            -- 主張書面 / 証拠 / 判決・決定 / その他
  filed_on    TEXT,            -- 提出日 YYYY-MM-DD（任意）
  url         TEXT,            -- ファイルのURL（public/docs/ に置いたPDF や 外部サイト。任意）
  r2_key      TEXT,            -- R2 のオブジェクトキー（R2 を使うとき。ファイル無しなら NULL）
  file_name   TEXT,            -- 元のファイル名
  file_size   INTEGER,
  mime        TEXT,
  claims      TEXT,            -- この書面で主張していること（1行1項目、改行区切り・任意）
  summary     TEXT,            -- 要約（手入力・任意）
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  updated_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_materials_case ON materials(case_id, filed_on, created_at);

-- いいね（事件単位）。viewer は端末ごとの識別子を SHA-256 した値。
CREATE TABLE IF NOT EXISTS likes (
  case_id     TEXT NOT NULL REFERENCES cases(id),
  viewer      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (case_id, viewer)
);

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
