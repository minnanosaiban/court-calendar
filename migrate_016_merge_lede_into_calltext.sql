-- 「事件の説明（lede）」は「よびかけ（call_text）」のすぐ上に並べて表示するだけの別項目で、
-- 実質どこにも独立した使い道が無かったため、よびかけ欄に統合して1項目にする（2026-08-22）。
-- 本番データは4件とも lede に本文があり call_text は空だったため、まず両方の内容を call_text に合体させてから列を消す。
UPDATE cases
SET call_text = CASE
  WHEN call_text IS NULL OR call_text = '' THEN lede
  WHEN lede IS NULL OR lede = '' THEN call_text
  ELSE lede || char(10) || char(10) || call_text
END
WHERE lede IS NOT NULL AND lede <> '';

ALTER TABLE cases DROP COLUMN lede;
