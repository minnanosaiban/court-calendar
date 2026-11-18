-- 問題提起人のnote URL（2026-11-19）
-- presenters.note_url（任意）。ニックネームの右に、「（ウェブサイト・X-Twitter・note）」の文字リンクとして表示する。
-- 新規に作るなら schema.sql だけでよい（このファイルは不要）。
-- 注意：functions 側がこの列を SELECT するので、デプロイより先に本番DBへ適用すること。

ALTER TABLE presenters ADD COLUMN note_url TEXT;  -- note（note.com）のURL（任意）
