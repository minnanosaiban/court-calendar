-- 事件ごとに「掲示板を表示するか」「投稿を制限するか」を設定できるようにする（2026-08-25）
-- board_restricted=1 の意味は今のところ「一般の匿名投稿を締めて運営のみ投稿可」。
-- 将来、問題提起人がアカウント制になったら「承認済みアカウントのみ投稿可」に中身を差し替える。
-- ADD COLUMN は既存の行を消さない。既存の事件はすべて「掲示板を表示・制限なし」のまま変わらない。

ALTER TABLE cases ADD COLUMN board_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cases ADD COLUMN board_restricted INTEGER NOT NULL DEFAULT 0;
