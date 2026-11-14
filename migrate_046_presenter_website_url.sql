-- 問題提起人のウェブサイトURL（2026-11-14）
-- presenters.website_url（任意）。ニックネームの右に、Xアイコンの左隣へ地球儀アイコンのリンクとして表示する。
-- 新規に作るなら schema.sql だけでよい（このファイルは不要）。

ALTER TABLE presenters ADD COLUMN website_url TEXT;  -- ウェブサイトのURL（任意）
