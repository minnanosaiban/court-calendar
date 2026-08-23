-- 事件にアイコン画像を追加（2026-08-24）
-- 一覧・カレンダーのポップオーバー等で、事件をひと目で見分けられるようにする（Twitterのアバターのようなもの）。
-- ファイルはR2（`ic/<事件ID>/…` のキー）。/api/cases/:id/icon（PUT=登録・差し替え／DELETE=削除）で扱う。
-- ADD COLUMN は既存の行を消さない。

ALTER TABLE cases ADD COLUMN icon_r2_key TEXT;
