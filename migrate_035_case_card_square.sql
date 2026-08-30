-- Twitterカードの正方形版を追加（2026-08-30）
-- cases.card_square_r2_key（任意）。未設定なら /api/cases/:id/card-square.png が自動生成する
-- （Teams・Slack等がog:imageを正方形に中央トリミングするため、横長版とは別に用意する）。
-- 設定すればそちらを優先して返す（差し替え専用。横長版=card_r2_keyと同じ仕組み）。
-- 新規に作るなら schema.sql だけでよい（このファイルは不要）。

ALTER TABLE cases ADD COLUMN card_square_r2_key TEXT;
