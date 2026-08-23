-- v19（2026-08-23）：当事者（cases.parties）を原告名・被告名に、リンク（cases.links）を
-- 原告のリンク・被告のリンクに分離する一度きりのマイグレーション。
--
-- これまで parties は「原告 ○○ ／ 被告 ○○」という書式の自由記述1本、links は当事者を区別しない
-- 1つのURL一覧だった。表示側の解析だけでも対応できたが、被告側のリンクも登録したい・入力欄自体を
-- 分けた方が迷わない、という判断から入力の時点で構造化する。
--
-- 本番の実データ（4件）はすべて「原告 ○○ ／ 被告 ○○」の書式だったため、目視で確認したうえで
-- 下の UPDATE でそのまま移し替える（件数が少ないため、汎用のパース処理は書かずに1件ずつ書いている）。

ALTER TABLE cases ADD COLUMN plaintiff_name TEXT;    -- 原告名（任意）
ALTER TABLE cases ADD COLUMN defendant_name TEXT;    -- 被告名（任意）
ALTER TABLE cases ADD COLUMN plaintiff_links TEXT;   -- 原告のアカウント等のURL（1行1つ、改行区切り・任意）
ALTER TABLE cases ADD COLUMN defendant_links TEXT;   -- 被告のアカウント等のURL（1行1つ、改行区切り・任意）

UPDATE cases SET plaintiff_name='元従業員', defendant_name='サンプル株式会社'
  WHERE id='cb598207d797f';
UPDATE cases SET plaintiff_name='市民', defendant_name='サンプル市', plaintiff_links='https://x.com/minnanosaiban'
  WHERE id='c53bfb741871f';
UPDATE cases SET plaintiff_name='個人', defendant_name='個人'
  WHERE id='ce62d6db7ea8b';
UPDATE cases SET plaintiff_name='通報者', defendant_name='ＥＮＥＯＳ株式会社',
  plaintiff_links='https://x.com/minnanosaiban
https://minnanosaiban.github.io/hotline/'
  WHERE id='cmt3az1tvea4dz';

ALTER TABLE cases DROP COLUMN parties;
ALTER TABLE cases DROP COLUMN links;
