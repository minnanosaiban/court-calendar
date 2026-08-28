-- 「争点・当事者〜関連裁判」のトップページ表示を、項目ごとに選べるようにする（2026-08-28）。
-- 事件番号（show_case_no_on_top、migrate_029）に続いて、残りの項目にも同じ仕組みのフラグを追加する。
-- 既存の事件はすべて0（従来どおり事件ページだけで表示）のまま変わらない。

ALTER TABLE cases ADD COLUMN show_points_on_top    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN show_plaintiff_on_top  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN show_defendant_on_top  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN show_judge_on_top      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN show_press_on_top      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN show_call_on_top       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN show_related_on_top    INTEGER NOT NULL DEFAULT 0;
