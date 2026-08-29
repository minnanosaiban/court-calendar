-- 問題提起人アカウント（2026-08-29）
-- 問題提起人が自分でログインし、自分の事件の詳細ページを登録・変更できるようにする。
-- ログインIDとパスワード（ハッシュ化して保存）を presenters に追加し、ログイン済みの端末が
-- 持つセッショントークンを presenter_sessions で管理する（運営の EDIT_PASSWORD とは別枠）。
-- 新規に作るなら schema.sql だけでよい（このファイルは不要）。

ALTER TABLE presenters ADD COLUMN login_username TEXT;       -- ログインID（運営が設定。メールアドレス等・任意の文字列）
ALTER TABLE presenters ADD COLUMN login_password_salt TEXT;  -- パスワードのソルト（16byte・16進）
ALTER TABLE presenters ADD COLUMN login_password_hash TEXT;  -- PBKDF2-SHA256 ハッシュ（16進）。平文は保存しない

CREATE UNIQUE INDEX IF NOT EXISTS idx_presenters_login_username ON presenters(login_username);

CREATE TABLE IF NOT EXISTS presenter_sessions (
  token        TEXT PRIMARY KEY,   -- ランダムな不透明トークン（ブラウザに保存し、X-Presenter-Token で送る）
  presenter_id TEXT NOT NULL REFERENCES presenters(id),
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presenter_sessions_presenter ON presenter_sessions(presenter_id);
