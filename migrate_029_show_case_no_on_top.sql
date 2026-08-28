-- 「争点・当事者〜関連裁判」のトップページ表示を、ひとまとめのチェックボックスではなく
-- 項目ごとに選べる方式に変更する（2026-08-28）。まず事件番号から対応する。
-- v9で追加した cases.show_details_on_top はまだどの事件も使っておらず（画面から触れなかった）
-- 置き換えて問題ない。事件番号だけのトップ表示フラグ show_case_no_on_top を追加する。

ALTER TABLE cases DROP COLUMN show_details_on_top;
ALTER TABLE cases ADD COLUMN show_case_no_on_top INTEGER NOT NULL DEFAULT 0;
