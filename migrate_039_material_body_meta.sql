-- 訴訟資料（materials）の本文にも、要約と同じく任意で「どのAIが・いつ作ったか」を添えられるようにする。
-- 両方とも空なら、本文の出所は出さない（手入力・コピペの本文と区別しないため）。migrate_037_material_summary_meta.sql の本文版。
-- 2026-09-06
ALTER TABLE materials ADD COLUMN body_model TEXT;
ALTER TABLE materials ADD COLUMN body_date TEXT;
