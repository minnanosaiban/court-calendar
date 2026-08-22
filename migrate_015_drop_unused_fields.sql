-- 入力はできるが画面のどこにも表示されていなかった3項目を削除する（2026-08-22）。
-- 本番データを確認済み：case_no・result は実データで全件空欄、level はサンプル（デモ）事件3件のみ使用。
-- 実データの消失リスクなし。archived_at・close_type は cases.html の「終結」一覧に表示されているため残す。
ALTER TABLE cases DROP COLUMN case_no;
ALTER TABLE cases DROP COLUMN result;
ALTER TABLE events DROP COLUMN level;
