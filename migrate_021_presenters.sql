-- 「アイコン＋ニックネーム」を事件から独立させ、問題提起人（presenters）にする（2026-08-25）
-- 1人の問題提起人が複数の事件を持てるようにする。旧 cases.host / cases.icon_r2_key を移行する。
-- 実行前に必ずバックアップを取ること（wrangler d1 export）。

CREATE TABLE IF NOT EXISTS presenters (
  id          TEXT PRIMARY KEY,
  nickname    TEXT NOT NULL,
  icon_r2_key TEXT,
  created_by  TEXT,
  updated_by  TEXT,
  updated_at  TEXT
);

ALTER TABLE cases ADD COLUMN presenter_id TEXT REFERENCES presenters(id);
CREATE INDEX IF NOT EXISTS idx_cases_presenter ON cases(presenter_id);

-- 既存の各事件から、問題提起人を1件ずつ起こす（host が空の事件は作らない＝ presenter_id は NULL のまま）。
-- id は 'p_from_' + 元の事件ID とし、そのまま次の UPDATE の結び付けキーにする。
INSERT INTO presenters (id, nickname, icon_r2_key, created_by, updated_by, updated_at)
SELECT 'p_from_' || id, host, icon_r2_key, created_by, updated_by, updated_at
FROM cases
WHERE host IS NOT NULL AND trim(host) <> '';

UPDATE cases SET presenter_id = 'p_from_' || id
WHERE host IS NOT NULL AND trim(host) <> '';

-- 旧列を削除（host のテキスト、icon_r2_key の画像キーは presenters 側にコピー済み）
ALTER TABLE cases DROP COLUMN host;
ALTER TABLE cases DROP COLUMN icon_r2_key;
