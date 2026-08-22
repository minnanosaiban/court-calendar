-- cases に judge（裁判官・任意）列を追加する一度きりのマイグレーション（2026-08-22）
ALTER TABLE cases ADD COLUMN judge TEXT;
