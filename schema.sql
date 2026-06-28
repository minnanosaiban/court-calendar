-- 裁判カレンダーの共有データ（D1 / SQLite）
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  case_name   TEXT NOT NULL,   -- 事件名
  date        TEXT NOT NULL,   -- 期日 YYYY-MM-DD
  time        TEXT,            -- 時刻 HH:MM
  type        TEXT,            -- 種別（口頭弁論など）
  place       TEXT,            -- 裁判所・法廷
  note        TEXT,            -- メモ
  created_by  TEXT,            -- 追加した人のメール
  updated_by  TEXT,            -- 最後に更新した人のメール
  updated_at  TEXT             -- 更新日時 ISO8601
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
