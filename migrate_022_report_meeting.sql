-- 期日に「期日報告会」の有無を追加（2026-08-25）
-- ADD COLUMN は既存の行を消さない。既存の期日はすべて「報告会なし」扱いになる。

ALTER TABLE events ADD COLUMN report_meeting INTEGER NOT NULL DEFAULT 0;
