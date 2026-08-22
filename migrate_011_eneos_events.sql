-- ENEOS内部通報訴訟：第一審の期日を詳細化（2026-08-22）
-- 2025-03-19/2025-03-31は既存行を更新（裁判所を東京簡易裁判所→東京地方裁判所に訂正）。
-- 2024-04-22〜2024-12-25の4回は新規追加。控訴審（2025-07-15・2025-09-09）は変更なし。

UPDATE events SET type='第5回口頭弁論', court='東京地方裁判所', updated_by='minnawomamorukaisei@gmail.com', updated_at='2026-08-22T07:07:00.000Z'
  WHERE id='emt3az1uxeqfzx';

UPDATE events SET type='令和７年３月東京地裁判決', court='東京地方裁判所', updated_by='minnawomamorukaisei@gmail.com', updated_at='2026-08-22T07:07:01.000Z'
  WHERE id='emt3az1vbstk95';

INSERT INTO events (id, case_id, date, time, type, court, place, open, level, plaintiff_argument, defendant_argument, created_by, updated_by, updated_at) VALUES
('e-eneos-001','cmt3az1tvea4dz','2024-04-22','','第1回口頭弁論','東京地方裁判所','',1,'','','','minnawomamorukaisei@gmail.com','minnawomamorukaisei@gmail.com','2026-08-22T07:07:02.000Z'),
('e-eneos-002','cmt3az1tvea4dz','2024-05-23','','第2回口頭弁論','東京地方裁判所','',1,'','','','minnawomamorukaisei@gmail.com','minnawomamorukaisei@gmail.com','2026-08-22T07:07:03.000Z'),
('e-eneos-003','cmt3az1tvea4dz','2024-08-09','','第3回口頭弁論','東京地方裁判所','',1,'','','','minnawomamorukaisei@gmail.com','minnawomamorukaisei@gmail.com','2026-08-22T07:07:04.000Z'),
('e-eneos-004','cmt3az1tvea4dz','2024-12-25','','第4回口頭弁論','東京地方裁判所','',1,'','','','minnawomamorukaisei@gmail.com','minnawomamorukaisei@gmail.com','2026-08-22T07:07:05.000Z');
