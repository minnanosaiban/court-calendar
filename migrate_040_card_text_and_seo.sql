-- 2026-09-10：Twitterカードの文言と、Google検索のタイトル・説明を編集できるようにする。
-- どの列も「空＝これまでどおり自動」で、入っているときだけ自動生成を上書きする（既存データは無変更）。
--
-- 問題提起人（アカウントのページ＝/presenter?id=…）側。
-- 画像の差し替え（card_r2_key／card_square_r2_key）は事件と同じ仕組みを後から足したもの。
ALTER TABLE presenters ADD COLUMN card_r2_key TEXT;
ALTER TABLE presenters ADD COLUMN card_square_r2_key TEXT;
ALTER TABLE presenters ADD COLUMN card_headline TEXT;      -- カードの大きい2行（改行区切り）
ALTER TABLE presenters ADD COLUMN card_sub TEXT;           -- その下の小さいグレー1行
ALTER TABLE presenters ADD COLUMN card_message TEXT;       -- 一番下の赤い1行
ALTER TABLE presenters ADD COLUMN seo_title TEXT;          -- <title>／og:title
ALTER TABLE presenters ADD COLUMN seo_description TEXT;    -- meta description／og:description

-- 事件（事件のページ＝/case?id=…）側。カード画像の差し替えは既にあるので文言だけ足す。
-- card_headline・card_sub が効くのは期日が決まっていないとき（期日があるときは日付が主役のまま）。
ALTER TABLE cases ADD COLUMN card_headline TEXT;
ALTER TABLE cases ADD COLUMN card_sub TEXT;
ALTER TABLE cases ADD COLUMN card_message TEXT;
ALTER TABLE cases ADD COLUMN seo_title TEXT;
ALTER TABLE cases ADD COLUMN seo_description TEXT;
