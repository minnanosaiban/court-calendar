-- 事件の写真にWeb用バリエーションを追加（2026-08-30）
-- case_images.web_r2_key ほか（任意）。既存の写真はスマホでの見やすさを優先したフォント・サイズで
-- 作られているため、このサイト（Web）で見たときに合わせた版を別に登録できるようにする。
-- Web用があればそちらを優先して表示し、無ければこれまでどおりの写真を使う（差し替え専用ではなく追加）。
-- 新規に作るなら schema.sql だけでよい（このファイルは不要）。

ALTER TABLE case_images ADD COLUMN web_r2_key TEXT;
ALTER TABLE case_images ADD COLUMN web_file_name TEXT;
ALTER TABLE case_images ADD COLUMN web_file_size INTEGER;
ALTER TABLE case_images ADD COLUMN web_mime TEXT;
