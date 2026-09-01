-- 訴訟資料（materials）の要約に、任意で「どのAIが・いつ作ったか」を添えられるようにする。
-- 両方とも空なら、要約ポップアップに出所は出さない（手入力の要約と区別しないため）。
-- 2026-09-01
ALTER TABLE materials ADD COLUMN summary_model TEXT;
ALTER TABLE materials ADD COLUMN summary_date TEXT;
