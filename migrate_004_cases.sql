-- 一度だけ実行するマイグレーション（2026-08-21）
-- 「1期日=1行に事件の説明を重複保存」していた events を、事件（cases）と期日（events）に分ける。
-- あわせて訴訟資料（materials）・いいね（likes）のテーブルを追加する。posts には触らない。
--
--   1. cases を作り、events の case_name ごとに1行ずつ起こす（説明・争点などは直近の回の値を採用）
--   2. events に case_id を足して cases と結びつける
--   3. events から事件の説明の列（case_name / case_no / parties / host / contact / lede / points）を落とす
--
-- 実行方法：
--   ローカル: npx wrangler d1 execute court-calendar --local  --file migrate_004_cases.sql
--   本番   : npx wrangler d1 execute court-calendar --remote --file migrate_004_cases.sql
--
-- 新規にDBを作る場合はこれは不要（schema.sql だけで最新の形になる）。
-- 実行前に本番のバックアップを取っておくこと：
--   npx wrangler d1 export court-calendar --remote --output backup_before_004.sql

CREATE TABLE IF NOT EXISTS cases (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  case_no     TEXT,
  parties     TEXT,
  points      TEXT,
  lede        TEXT,
  call_text   TEXT,
  host        TEXT,
  contact     TEXT,
  links       TEXT,
  created_by  TEXT,
  updated_by  TEXT,
  updated_at  TEXT
);

-- 事件名ごとに、いちばん新しい期日の行から事件の情報を写す
INSERT INTO cases (id, name, case_no, parties, points, lede, host, contact, created_by, updated_by, updated_at)
SELECT 'c' || lower(hex(randomblob(6))),
       e.case_name, e.case_no, e.parties, e.points, e.lede, e.host, e.contact,
       e.created_by, e.updated_by, e.updated_at
  FROM events e
 WHERE e.rowid = (
         SELECT e2.rowid FROM events e2
          WHERE e2.case_name = e.case_name
          ORDER BY e2.date DESC, e2.time DESC
          LIMIT 1
       );

ALTER TABLE events ADD COLUMN case_id TEXT;
UPDATE events SET case_id = (SELECT c.id FROM cases c WHERE c.name = events.case_name);
CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, date);

ALTER TABLE events DROP COLUMN case_name;
ALTER TABLE events DROP COLUMN case_no;
ALTER TABLE events DROP COLUMN parties;
ALTER TABLE events DROP COLUMN host;
ALTER TABLE events DROP COLUMN contact;
ALTER TABLE events DROP COLUMN lede;
ALTER TABLE events DROP COLUMN points;

CREATE TABLE IF NOT EXISTS materials (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  event_id    TEXT,
  title       TEXT NOT NULL,
  side        TEXT,
  kind        TEXT,
  filed_on    TEXT,
  url         TEXT,
  r2_key      TEXT,
  file_name   TEXT,
  file_size   INTEGER,
  mime        TEXT,
  claims      TEXT,
  summary     TEXT,
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  updated_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_materials_case ON materials(case_id, filed_on, created_at);

CREATE TABLE IF NOT EXISTS likes (
  case_id     TEXT NOT NULL REFERENCES cases(id),
  viewer      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (case_id, viewer)
);
