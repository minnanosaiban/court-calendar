-- 動作確認用の架空データ（2026-08-21・v3 スキーマ用）
--
-- 公開URLに入れるため、実在の裁判と取り違えて誰かが裁判所へ行ってしまうことがないよう、
-- 事件名に【サンプル】を付け、裁判所名も架空（サンプル地方裁判所など）にしてある。
-- 本番の運用を始める前に、必ず下の後始末を実行して消すこと。
--
-- 入れる：
--   npx wrangler d1 execute court-calendar --remote --file seed_demo.sql
-- 消す（idが demo- で始まる行だけを消す）：
--   npx wrangler d1 execute court-calendar --remote --command "DELETE FROM posts WHERE id LIKE 'demo-%'; DELETE FROM materials WHERE id LIKE 'demo-%'; DELETE FROM likes WHERE case_id LIKE 'demo-%'; DELETE FROM events WHERE id LIKE 'demo-%'; DELETE FROM cases WHERE id LIKE 'demo-%';"
--
-- 確認できること：
--   7/8  …… 済んだ期日（タイムラインの塗りつぶし●・資料つき）
--   8/25 …… 1件（バー1本・掲示板の投稿つき）
--   9/3  …… 2件・うち1件は非公開（バー2本＋白抜き）
--   9/10 …… 1件（タイムラインで「次回」）

INSERT INTO cases (id, name, case_no, parties, points, lede, call_text, host, contact, links,
                   created_by, updated_by, updated_at) VALUES
(
  'demo-case-joho',
  '【サンプル】情報公開請求をめぐる訴訟',
  '令和8年（行ウ）第00号',
  '原告 市民 ／ 被告 サンプル市',
  '請求された文書が不開示情報にあたるか
不開示の理由が十分に説明されたか',
  'これは動作確認のための架空の事件です。市に対する文書の開示請求が退けられたことをめぐって争われている、という想定にしています。実在の裁判ではありません。',
  '次回は被告側の反論が出そろう回です。傍聴席から見守ってくださる方が増えるほど、裁判所に「市民が関心を持っている」ことが伝わります。初めての方もどうぞ。開廷10分前に101号法廷前に集まります。',
  'サンプル市民オンブズマン',
  'sample@example.com',
  'https://x.com/sample_ombudsman
https://example.com/sample-ombudsman',
  'demo', 'demo', '2026-08-20T00:00:00.000Z'
),
(
  'demo-case-roudou',
  '【サンプル】労働環境をめぐる損害賠償請求事件',
  NULL,
  '原告 元従業員 ／ 被告 サンプル株式会社',
  '時間外労働の実態がどうだったか
会社に安全配慮義務の違反があったか',
  'これは動作確認のための架空の事件です。長時間労働をめぐって争われている、という想定にしています。実在の裁判ではありません。',
  NULL,
  'サンプル労働相談ネット',
  NULL,
  NULL,
  'demo', 'demo', '2026-08-20T00:00:00.000Z'
),
(
  'demo-case-hikoukai',
  '【サンプル】非公開手続きの例',
  NULL,
  '原告 個人 ／ 被告 個人',
  '争点の整理がどこまで進むか',
  'これは動作確認のための架空の事件です。弁論準備手続きなので傍聴席がない、という想定にしています。実在の裁判ではありません。',
  NULL,
  'サンプル支援の会',
  NULL,
  NULL,
  'demo', 'demo', '2026-08-20T00:00:00.000Z'
);

INSERT INTO events (id, case_id, date, time, type, court, place, open, level,
                    plaintiff_argument, defendant_argument,
                    created_by, updated_by, updated_at) VALUES
('demo-joho-0', 'demo-case-joho', '2026-07-08', '10:30', '第1回口頭弁論', 'サンプル地方裁判所', '101号法廷', 1, NULL,
  '不開示決定の取消しを求める
対象文書は「組織共用文書」にあたり開示義務がある
不開示理由の提示が不十分で手続に瑕疵がある',
  '請求の棄却を求める
該当する文書は保有していない
仮に存在しても意思形成過程情報として不開示が相当',
  'demo','demo','2026-08-20T00:00:00.000Z'),
('demo-joho-1', 'demo-case-joho', '2026-08-25', '10:30', '第2回口頭弁論', 'サンプル地方裁判所', '101号法廷', 1, 'はじめて向け',
  '文書の存在は庁内メール（甲3）から明らか
「保有していない」との主張は信用できない',
  NULL,
  'demo','demo','2026-08-20T00:00:00.000Z'),
('demo-joho-2', 'demo-case-joho', '2026-09-10', '10:30', '第3回口頭弁論', 'サンプル地方裁判所', '101号法廷', 1, '短時間',
  NULL, NULL,
  'demo','demo','2026-08-20T00:00:00.000Z'),
('demo-roudou-1',   'demo-case-roudou',   '2026-09-03', '13:30', '当事者尋問', 'サンプル地方裁判所', '203号法廷', 1, '見ごたえあり',
  NULL, NULL,
  'demo','demo','2026-08-20T00:00:00.000Z'),
('demo-hikoukai-1', 'demo-case-hikoukai', '2026-09-03', '15:00', '弁論準備',   'サンプル地方裁判所', '第3準備室', 0, NULL,
  NULL, NULL,
  'demo','demo','2026-08-20T00:00:00.000Z');

-- 訴訟資料の見本（ファイルは付けず、目録＋本文＋箇条書き＋要約だけ）
INSERT INTO materials (id, case_id, event_id, title, side, kind, filed_on,
                       url, r2_key, file_name, file_size, mime, claims, body, summary,
                       hidden, created_by, updated_by, created_at, updated_at) VALUES
('demo-mat-1', 'demo-case-joho', 'demo-joho-0', '訴状', '原告側', '主張書面', '2026-04-15',
  NULL, NULL, NULL, NULL, NULL,
  '不開示決定の取消しを求める
対象文書は「組織共用文書」にあたり開示義務がある
不開示理由の提示が不十分で手続に瑕疵がある',
  '# 請求の趣旨

被告が原告に対して令和8年3月1日付けでした不開示決定処分を取り消す。

# 請求の原因

## 1. 経緯

原告は、令和7年9月、サンプル市に対し情報公開条例に基づき文書の開示を請求した。
これに対し被告は、令和8年3月1日、対象文書を保有していないとして不開示決定をした。

## 2. 対象文書は組織共用文書にあたる

- 対象文書は複数の職員が組織的に利用していたことが庁内メール（甲3）から明らかである
- したがって情報公開条例上の「組織共用文書」に該当し、開示義務を負う

## 3. 理由提示の不備

不開示決定通知書には、不開示とする具体的な理由が記載されておらず、行政手続法の理由提示の要求を満たしていない。',
  '市が行った不開示決定について、対象文書が情報公開条例上の公文書にあたること、不開示事由に該当しないこと、理由提示が不十分であることを主張し、決定の取消しを求めている。',
  0, 'demo', 'demo', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'),
('demo-mat-2', 'demo-case-joho', 'demo-joho-0', '答弁書', '被告側', '主張書面', '2026-06-20',
  NULL, NULL, NULL, NULL, NULL,
  '請求の棄却を求める
該当する文書は保有していない
仮に存在しても意思形成過程情報として不開示が相当',
  NULL,
  '市は、請求された文書を保有していないと主張し、仮に存在したとしても意思形成過程の情報にあたるため不開示は適法であると反論している。',
  0, 'demo', 'demo', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'),
('demo-mat-3', 'demo-case-joho', 'demo-joho-1', '原告第1準備書面', '原告側', '主張書面', '2026-08-10',
  NULL, NULL, NULL, NULL, NULL,
  '文書の存在は庁内メール（甲3）から明らか
「保有していない」との主張は信用できない',
  NULL,
  NULL,
  0, 'demo', 'demo', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'),
('demo-mat-4', 'demo-case-joho', 'demo-joho-1', '甲3 庁内メール（2025年11月）', '原告側', '証拠', '2026-08-10',
  NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 'demo', 'demo', '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z');

-- 掲示板の見本（架空の事件についての架空の投稿）
INSERT INTO posts (id, event_id, subject, quote, verb, hidden, created_at) VALUES
('demo-post-1','demo-joho-1','原告','文書は組織的に共有されていた','主張した',0,'2026-08-20T01:00:00.000Z'),
('demo-post-2','demo-joho-1','被告','該当する文書は保有していない','主張した',0,'2026-08-20T01:01:00.000Z'),
('demo-post-3','demo-joho-1','裁判官','文書の管理簿の提出','求めた',0,'2026-08-20T01:02:00.000Z');
