-- 期日案内をPDFだけでなく画像（JPEG・PNG）にも対応させる一度きりのマイグレーション（2026-08-27）
-- PDFか画像かを拡張子の当て推量ではなくMIME種別で確実に判定するための列。
-- ADD COLUMN は既存の行を消さない。既存の事件はすべてNULLのまま変わらない。

ALTER TABLE cases ADD COLUMN notice_mime TEXT;
