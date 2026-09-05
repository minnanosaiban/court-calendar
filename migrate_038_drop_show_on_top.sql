-- 「トップにも表示する」（応援ピックアップに項目ごとに出すかの選択）は、応援ピックアップ自体の
-- 廃止に伴い不要になったため、cases の対応する8列を削除する。
-- 2026-09-05

ALTER TABLE cases DROP COLUMN show_case_no_on_top;
ALTER TABLE cases DROP COLUMN show_points_on_top;
ALTER TABLE cases DROP COLUMN show_plaintiff_on_top;
ALTER TABLE cases DROP COLUMN show_defendant_on_top;
ALTER TABLE cases DROP COLUMN show_judge_on_top;
ALTER TABLE cases DROP COLUMN show_press_on_top;
ALTER TABLE cases DROP COLUMN show_call_on_top;
ALTER TABLE cases DROP COLUMN show_related_on_top;
