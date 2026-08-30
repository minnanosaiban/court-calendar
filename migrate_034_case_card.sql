-- 事件のTwitterカード（OGP画像）の差し替えを追加（2026-08-30）
-- cases.card_r2_key（任意）。未設定なら /api/cases/:id/card.png が期日・問題提起人から自動生成する
-- 「傍聴券」をそのまま返す。設定すればそちらを優先して返す（差し替え専用）。
-- 新規に作るなら schema.sql だけでよい（このファイルは不要）。

ALTER TABLE cases ADD COLUMN card_r2_key TEXT;
