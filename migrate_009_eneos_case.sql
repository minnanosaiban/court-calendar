-- 実案件データ投入：ENEOS内部通報訴訟（裁判アーカイブ）2026-08-22
-- ローカルdevで作成・検証済みのデータをそのまま本番へ投入する。スキーマ変更なし。

INSERT INTO cases (id, name, case_no, parties, points, lede, call_text, host, contact, links, tags, archived_at, close_type, result, created_by, updated_by, updated_at) VALUES (
'cmt3az1tvea4dz', 'ＥＮＥＯＳの内部通報制度をめぐる訴訟', '', '原告 通報者 ／ 被告 ＥＮＥＯＳ株式会社', '会社が実行した是正措置を通報者に通知しなかったことは、規程・法令上の義務違反にあたるか
契約変更につながる通報が、通知義務の前提となる「通報」に当たっていたか
海外消費税を支払う「合意」があったと推認できるか', '本サイトで問題提起をするのは、通報を受けてからの会社の対応です。通報の後、通報者は通報内容に関する情報から遮断されました。そのうえで、裏づけの確認できない情報を知らされました。通報したのは「支払う必要のない海外消費税を払っている」という問題でしたが、調査結果として、その要否は示されませんでした。', '', '', '', 'https://minnanosaiban.github.io/hotline/
https://minnanosaiban.github.io/eneos-saiban/argument.html', '内部通報
公益通報者保護法
消費税', '2025-09-09', '判決（控訴棄却）', '控訴審は、地裁の理由を全面的に書き改め、「契約書の問題を指摘する通報はそもそも無かった」「海外消費税を支払う合意をしていたと推認できる」という２つの独立した理由で控訴を棄却した。通知義務の要否という争点自体は、実質的に検討されないまま終わった。', 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:47.876Z'
);

INSERT INTO events (id, case_id, date, time, type, court, place, open, level, plaintiff_argument, defendant_argument, created_by, updated_by, updated_at) VALUES (
'emt3az1uxeqfzx', 'cmt3az1tvea4dz', '2025-03-19', '', '口頭弁論終結（第一審）', '東京簡易裁判所', '', 1, '', '', '', 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:47.913Z'
);

INSERT INTO events (id, case_id, date, time, type, court, place, open, level, plaintiff_argument, defendant_argument, created_by, updated_by, updated_at) VALUES (
'emt3az1vbstk95', 'cmt3az1tvea4dz', '2025-03-31', '', '判決言渡（第一審）', '東京簡易裁判所', '', 1, '', '', '', 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:47.927Z'
);

INSERT INTO events (id, case_id, date, time, type, court, place, open, level, plaintiff_argument, defendant_argument, created_by, updated_by, updated_at) VALUES (
'emt3az1vn5s1vk', 'cmt3az1tvea4dz', '2025-07-15', '', '口頭弁論終結（控訴審）', '東京高等裁判所第７民事部', '', 1, '', '', '', 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:47.939Z'
);

INSERT INTO events (id, case_id, date, time, type, court, place, open, level, plaintiff_argument, defendant_argument, created_by, updated_by, updated_at) VALUES (
'emt3az1vyh9dp7', 'cmt3az1tvea4dz', '2025-09-09', '', '判決言渡（控訴審）', '東京高等裁判所第７民事部', '', 1, '', '会社が実行した是正措置（契約変更）を通知しなかったこと自体が問題である
契約書の内容確認を求める問題提起は、追加通報より前から行っていた', '契約書の問題を指摘する通報は、そもそも無かった
平成27年契約の締結時、海外消費税を支払う合意をしていた', 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:47.950Z'
);

INSERT INTO materials (id, case_id, event_id, title, side, kind, filed_on, url, r2_key, file_name, file_size, mime, claims, body, summary, hidden, created_by, updated_by, created_at, updated_at) VALUES (
'mmt3az1wfyp0lp', 'cmt3az1tvea4dz', NULL, 'ＥＮＥＯＳ側の主張書面', '被告側', '主張書面', NULL, 'https://minnanosaiban.github.io/hotline/trial/eneos/', NULL, NULL, NULL, NULL, '', '', '', 0, 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:47.967Z', '2026-08-21T18:48:47.967Z'
);

INSERT INTO materials (id, case_id, event_id, title, side, kind, filed_on, url, r2_key, file_name, file_size, mime, claims, body, summary, hidden, created_by, updated_by, created_at, updated_at) VALUES (
'mmt3az1wrv8pwf', 'cmt3az1tvea4dz', NULL, '通報者側の主張書面', '原告側', '主張書面', NULL, 'https://minnanosaiban.github.io/hotline/trial/whistleblower/', NULL, NULL, NULL, NULL, '', '', '', 0, 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:47.979Z', '2026-08-21T18:48:47.979Z'
);

INSERT INTO materials (id, case_id, event_id, title, side, kind, filed_on, url, r2_key, file_name, file_size, mime, claims, body, summary, hidden, created_by, updated_by, created_at, updated_at) VALUES (
'mmt3az1xdpjexx', 'cmt3az1tvea4dz', NULL, '判決書（東京地裁・東京高裁）', '裁判所', '判決・決定', NULL, 'https://minnanosaiban.github.io/hotline/trial/judgement_2025/', NULL, NULL, NULL, NULL, '', '', '', 0, 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:48.001Z', '2026-08-21T18:48:48.001Z'
);

INSERT INTO materials (id, case_id, event_id, title, side, kind, filed_on, url, r2_key, file_name, file_size, mime, claims, body, summary, hidden, created_by, updated_by, created_at, updated_at) VALUES (
'mmt3az1xts71x3', 'cmt3az1tvea4dz', NULL, '主張書面全文と認否', 'その他', 'その他', NULL, 'https://minnanosaiban.github.io/eneos-saiban/argument.html', NULL, NULL, NULL, NULL, '', '', '', 0, 'minnawomamorukaisei@gmail.com', 'minnawomamorukaisei@gmail.com', '2026-08-21T18:48:48.017Z', '2026-08-21T18:48:48.017Z'
);

INSERT INTO case_images (id, case_id, r2_key, file_name, file_size, mime, caption, sort_order, created_by, created_at) VALUES (
'imt3azhrl1xqsq', 'cmt3az1tvea4dz', 'i/imt3azhrl1xqsq/mt3azhrl.png', 'panel1_hotline.png', 67625, 'image/png', 'ENEOSの内部通報制度', 0, 'minnawomamorukaisei@gmail.com', '2026-08-21T18:49:08.529Z'
);

INSERT INTO case_images (id, case_id, r2_key, file_name, file_size, mime, caption, sort_order, created_by, created_at) VALUES (
'imt3azhu14shwy', 'cmt3az1tvea4dz', 'i/imt3azhu14shwy/mt3azhu1.png', 'panel2_lawchange.png', 65820, 'image/png', '法改正とは、具体的に何', 1, 'minnawomamorukaisei@gmail.com', '2026-08-21T18:49:08.617Z'
);

INSERT INTO case_images (id, case_id, r2_key, file_name, file_size, mime, caption, sort_order, created_by, created_at) VALUES (
'imt3azhuzudp91', 'cmt3az1tvea4dz', 'i/imt3azhuzudp91/mt3azhuz.png', 'panel3_subsidiary.png', 71888, 'image/png', '海外子会社がなぜ送金？', 2, 'minnawomamorukaisei@gmail.com', '2026-08-21T18:49:08.651Z'
);

INSERT INTO case_images (id, case_id, r2_key, file_name, file_size, mime, caption, sort_order, created_by, created_at) VALUES (
'imt3azhvmneeom', 'cmt3az1tvea4dz', 'i/imt3azhvmneeom/mt3azhvm.png', 'panel4_gst.png', 78054, 'image/png', '海外消費税を合意で支払い？', 3, 'minnawomamorukaisei@gmail.com', '2026-08-21T18:49:08.674Z'
);

INSERT INTO case_images (id, case_id, r2_key, file_name, file_size, mime, caption, sort_order, created_by, created_at) VALUES (
'imt3azhwo82iib', 'cmt3az1tvea4dz', 'i/imt3azhwo82iib/mt3azhwo.png', 'panel5_investigation.png', 69566, 'image/png', 'いったい何を調査したのか？', 4, 'minnawomamorukaisei@gmail.com', '2026-08-21T18:49:08.712Z'
);

