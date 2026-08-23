-- v18（2026-08-23）：事件番号（cases.case_no）と関連裁判（cases.related_case_ids）を追加する一度きりのマイグレーション。
--
-- 同じ事実に関連して、争点ごとに複数の訴訟をしている当事者がいるため、
--   ・事件番号を画面に表示できるようにする（case_no は過去に一度削除した列。今回改めて使い道ができたため復活させる）
--   ・関連する他の事件（＝サイトに登録済みの別の cases 行）へリンクできるようにする（related_case_ids）
-- どちらも既存の行には影響しない（ADD COLUMN のみ、既存データは NULL のまま）。

ALTER TABLE cases ADD COLUMN case_no TEXT;
ALTER TABLE cases ADD COLUMN related_case_ids TEXT;
