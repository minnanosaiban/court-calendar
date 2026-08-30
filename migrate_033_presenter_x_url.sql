-- 問題提起人のXアカウントURL（2026-08-30）
-- presenters.x_url（任意）。ニックネームの右にXアイコンのリンクとして表示する。
-- 新規に作るなら schema.sql だけでよい（このファイルは不要）。

ALTER TABLE presenters ADD COLUMN x_url TEXT;  -- X（Twitter）アカウントのURL（任意）
