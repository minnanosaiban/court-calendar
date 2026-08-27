-- 期日案内PDF（cases.notice_r2_key ほか）を追加する一度きりのマイグレーション（2026-08-27）
-- 支援者が作る「裁判期日一覧のご案内」のようなチラシPDFを1事件につき1枚登録できるようにする。
-- 問題提起人アイコン（presenters.icon_r2_key）と同じ、差し替え専用の仕組み。
-- ADD COLUMN は既存の行を消さない。既存の事件はすべてNULL（案内PDFなし）のまま変わらない。

ALTER TABLE cases ADD COLUMN notice_r2_key TEXT;
ALTER TABLE cases ADD COLUMN notice_file_name TEXT;
ALTER TABLE cases ADD COLUMN notice_file_size INTEGER;
