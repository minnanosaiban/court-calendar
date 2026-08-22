-- cases に press（報道・掲載・任意）列を追加する一度きりのマイグレーション（2026-08-22）
ALTER TABLE cases ADD COLUMN press TEXT;
