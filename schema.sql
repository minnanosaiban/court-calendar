-- 裁判カレンダーの共有データ（D1 / SQLite）
--
-- v3（2026-08-21）：事件（cases）を独立させ、訴訟資料（materials）・いいね（likes）を追加。
--   事件に属するもの（当事者・争点・説明・よびかけ・リンク）は cases に1回だけ持ち、
--   期日（events）は case_id で事件にぶら下がる。
--   旧スキーマ（1期日=1行に事件の説明を重複保存）のDBを更新する場合は
--   migrate_004_cases.sql を実行すること。新規に作るならこのファイルだけでよい。
--
-- v4（2026-08-25）：「アイコン＋ニックネーム」を事件から独立させ、問題提起人（presenters）とした。
--   1人の問題提起人が複数の事件を持てる（例：同じ人・団体が別件で複数の訴訟を抱えている場合）。
--   旧 cases.host / cases.icon_r2_key から移行する場合は migrate_021_presenters.sql を実行すること。
--
-- v5（2026-08-26）：事件ごとの閲覧制限（cases.view_key）に向けた下準備。列を追加しただけで、
--   API側のフィルタ・管理画面での設定はまだ無い（既存の事件は全部NULL＝今まで通り公開のまま）。
--   新規に作るなら migrate_024_view_key.sql は不要（このファイルに列が入っている）。
--
-- v6（2026-08-27）：期日案内PDF（cases.notice_r2_key ほか）を追加。支援者が作る「裁判期日一覧の
--   ご案内」のようなチラシPDFを1事件につき1枚登録できる（問題提起人アイコンと同じ差し替え専用の仕組み）。
--   旧スキーマのDBを更新する場合は migrate_025_notice_pdf.sql を実行すること。
--
-- v7（2026-08-27）：期日案内をPDFだけでなく画像（JPEG・PNG）にも対応。判定用に cases.notice_mime を
--   追加。旧スキーマのDBを更新する場合は migrate_026_notice_mime.sql を実行すること。
--
-- v8（2026-08-28）：事件番号（cases.case_no）を「公開してもよい場合だけ」表示できるように
--   cases.case_no_public を追加。既定は0（非公開・従来どおり運営専用）。旧スキーマのDBを
--   更新する場合は migrate_027_case_no_public.sql を実行すること。
--
-- v9（2026-08-28）：「争点・当事者」〜「関連裁判」を事件ページだけでなくトップページの
--   ピックアップカードにも出せるように、項目ごとにトップ表示フラグを追加（cases.show_case_no_on_top・
--   show_points_on_top・show_plaintiff_on_top・show_defendant_on_top・show_judge_on_top・
--   show_press_on_top・show_call_on_top・show_related_on_top）。既定はすべて0＝事件ページだけ。
--   ひとまとめのチェックボックス案だった cases.show_details_on_top は使わずに廃止した。
--   旧スキーマのDBを更新する場合は migrate_028_show_details_on_top.sql・
--   migrate_029_show_case_no_on_top.sql・migrate_030_show_items_on_top.sql を順に実行すること。
--
-- v10（2026-08-29）：期日（events）単位の「お気に入り」を追加。事件単位の❤いいね（likes、件数表示あり）
--   とは別の概念で、こちらは件数を出さない・自分専用のON/OFFの目印（🔖bookmark）。
--   端末ごとの識別子（likesと同じ viewer ハッシュ）で (event_id, viewer) を主キーに持つ event_bookmarks を追加。
--   旧スキーマのDBを更新する場合は migrate_031_event_bookmarks.sql を実行すること。
--
-- v11（2026-08-29）：問題提起人アカウント。問題提起人が自分でログインし、自分の事件の詳細ページを
--   登録・変更できるようにする。ログインIDとパスワード（ハッシュ化）を presenters に追加し、
--   ログイン済みの端末が持つセッショントークンを presenter_sessions で管理する（運営の
--   EDIT_PASSWORD／OWNER_EMAIL とは別枠。ログイン発行・削除・パスワード再発行は運営のみ、
--   ログイン後の事件内容の登録・変更は本人のみ）。旧スキーマのDBを更新する場合は
--   migrate_032_presenter_accounts.sql を実行すること。
--
-- v12（2026-08-30）：問題提起人のX（Twitter）アカウントURLを追加。ニックネームの右に
--   アイコンリンクとして表示する（presenters.x_url、任意）。旧スキーマのDBを更新する場合は
--   migrate_033_presenter_x_url.sql を実行すること。

-- 問題提起人（アイコン＋ニックネーム）。1人が複数の事件を持てる。
CREATE TABLE IF NOT EXISTS presenters (
  id          TEXT PRIMARY KEY,
  nickname    TEXT NOT NULL,        -- 表示名（旧 cases.host を引き継ぐ）
  icon_r2_key TEXT,                 -- アイコン画像（正方形推奨）のR2オブジェクトキー。/api/presenters/:id/icon で登録・削除
  x_url       TEXT,                 -- X（Twitter）アカウントのURL（任意。ニックネームの右にアイコンリンクとして表示）
  login_username      TEXT,         -- ログインID（運営が設定。メールアドレス等・任意の文字列。未発行ならNULL）
  login_password_salt TEXT,         -- パスワードのソルト（16byte・16進）
  login_password_hash TEXT,         -- PBKDF2-SHA256 ハッシュ（16進）。平文は保存しない
  created_by  TEXT,
  updated_by  TEXT,
  updated_at  TEXT                  -- ISO8601
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_presenters_login_username ON presenters(login_username);

-- 問題提起人のログインセッション（ブラウザは token を保存し、書き込みリクエストごとに
-- X-Presenter-Token ヘッダで送る。運営の X-Edit-Key とは別の仕組み）
CREATE TABLE IF NOT EXISTS presenter_sessions (
  token        TEXT PRIMARY KEY,
  presenter_id TEXT NOT NULL REFERENCES presenters(id),
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presenter_sessions_presenter ON presenter_sessions(presenter_id);

-- 事件
CREATE TABLE IF NOT EXISTS cases (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE, -- 事件名（画面のタイトル）
  presenter_id TEXT REFERENCES presenters(id), -- 問題提起人（アイコン・ニックネームはここから引く。任意）
  case_no     TEXT,                 -- 事件番号（例：令和6年（ワ）第1234号・任意）
  case_no_public INTEGER NOT NULL DEFAULT 0, -- 1=事件番号を一般公開する／0=非公開（既定。運営専用の内部メモ扱い）
  show_case_no_on_top INTEGER NOT NULL DEFAULT 0, -- 1=（公開している場合）事件番号をトップのピックアップカードにも出す／0=事件ページだけ（既定）
  plaintiff_name TEXT,              -- 原告名（任意）
  show_plaintiff_on_top INTEGER NOT NULL DEFAULT 0, -- 原告をトップのピックアップカードにも出すか（既定は事件ページだけ）
  defendant_name TEXT,              -- 被告名（任意）
  show_defendant_on_top INTEGER NOT NULL DEFAULT 0, -- 被告（同上）
  judge       TEXT,                 -- 裁判官（任意）
  show_judge_on_top INTEGER NOT NULL DEFAULT 0, -- 裁判官（同上）
  points      TEXT,                 -- 争点（1行1項目、改行区切り）
  show_points_on_top INTEGER NOT NULL DEFAULT 0, -- 争点（同上）
  call_text   TEXT,                 -- よびかけ（事件の説明＋傍聴・支援のお願い）
  show_call_on_top INTEGER NOT NULL DEFAULT 0, -- 裁判について（同上）
  contact     TEXT,                 -- 連絡先（公開してよいものだけ）
  press       TEXT,                 -- 報道・掲載（新聞・ニュース・判例誌掲載、特別保存の指定など。1行1項目、改行区切り・任意）
  show_press_on_top INTEGER NOT NULL DEFAULT 0, -- 報道・掲載（同上）
  plaintiff_links TEXT,             -- 原告のアカウント等のURL（1行1つ、改行区切り・任意）
  defendant_links TEXT,             -- 被告のアカウント等のURL（1行1つ、改行区切り・任意）
  tags        TEXT,                 -- タグ（1行1つ、改行区切り・任意）
  related_case_ids TEXT,            -- 関連する他の事件のID（1行1つ、改行区切り・任意。同じ事実に関連する別争点の訴訟など。双方向表示は画面側で補う）
  show_related_on_top INTEGER NOT NULL DEFAULT 0, -- 関連裁判をトップのピックアップカードにも出すか（既定は事件ページだけ）
  archived_at TEXT,                 -- 終結日 YYYY-MM-DD（あれば「裁判アーカイブ」扱い・任意）
  close_type  TEXT,                 -- 終結の種類（判決／和解／取下げ など・任意）
  view_key    TEXT,                 -- 閲覧キー（値があればこの事件は非公開＝キーが一致する人にだけ見せる。NULLなら今まで通り誰でも公開。
                                     -- 2026-08-26時点ではAPI側のフィルタは未実装で、列を用意しただけ・全事件NULLのまま）
  board_enabled    INTEGER NOT NULL DEFAULT 1, -- 1=「傍聴に行ってきたよ！掲示板」を表示する／0=非表示（掲示板ごと出さない）
  board_restricted INTEGER NOT NULL DEFAULT 0, -- 1=投稿を制限する（一般の匿名投稿は受け付けず運営のみ。将来は問題提起人が承認したアカウントのみに置き換える）／0=誰でも投稿可
  notice_r2_key   TEXT,              -- 期日案内（支援者向けの一覧チラシ。PDFまたは画像）のR2キー。1事件につき1枚・差し替え専用（任意）
  notice_file_name TEXT,             -- 元のファイル名
  notice_file_size  INTEGER,
  notice_mime     TEXT,              -- PDFか画像かの判定に使う（application/pdf・image/png・image/jpeg）
  created_by  TEXT,
  updated_by  TEXT,
  updated_at  TEXT                  -- ISO8601
);

CREATE INDEX IF NOT EXISTS idx_cases_presenter ON cases(presenter_id);

-- 期日（1期日=1行）
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  date        TEXT NOT NULL,   -- 期日 YYYY-MM-DD
  time        TEXT,            -- 時刻 HH:MM
  type        TEXT,            -- 期日の種類（第3回口頭弁論 など）
  court       TEXT,            -- 裁判所名
  place       TEXT,            -- 法廷
  open        INTEGER NOT NULL DEFAULT 1, -- 1=誰でも傍聴できる／0=非公開・要確認
  report_meeting INTEGER NOT NULL DEFAULT 0, -- 1=この期日のあとに期日報告会がある／0=なし
  plaintiff_argument TEXT,     -- この回で原告が主張したこと（1行1項目、改行区切り・任意）
  defendant_argument TEXT,     -- この回で被告が主張したこと（1行1項目、改行区切り・任意）
  created_by  TEXT,
  updated_by  TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, date);

-- 訴訟資料（書面・証拠・判決など）。ここは目録で、ファイル本体は url（public/docs/ や外部）か R2 に置く。
-- ファイルを付けない「目録だけ」の登録もできる（箇条書き・要約だけ載せたいとき）。
CREATE TABLE IF NOT EXISTS materials (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  event_id    TEXT,            -- どの期日に出された書面か（任意。タイムラインの節にぶら下がる）
  title       TEXT NOT NULL,   -- 訴状、第1準備書面、甲1 ○○ など
  side        TEXT,            -- 原告側 / 被告側 / 裁判所 / その他
  filed_on    TEXT,            -- 提出日 YYYY-MM-DD（任意）
  url         TEXT,            -- ファイルのURL（public/docs/ に置いたPDF や 外部サイト。任意）
  r2_key      TEXT,            -- R2 のオブジェクトキー（R2 を使うとき。ファイル無しなら NULL）
  file_name   TEXT,            -- 元のファイル名
  file_size   INTEGER,
  mime        TEXT,
  claims      TEXT,            -- この書面で主張していること（1行1項目、改行区切り・任意）
  body        TEXT,            -- 本文（Markdownを貼り付け・任意）
  summary     TEXT,            -- 要約（手入力・任意）
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  updated_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_materials_case ON materials(case_id, filed_on, created_at);

-- 事件の写真（証拠写真・記者会見の様子など）。詳細ページ上部で横に流して見せる。
CREATE TABLE IF NOT EXISTS case_images (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id),
  r2_key      TEXT NOT NULL,   -- R2 のオブジェクトキー（写真は本文と違い、常にファイルが要る）
  file_name   TEXT,
  file_size   INTEGER,
  mime        TEXT,
  caption     TEXT,            -- 写真の説明（1行・任意）
  sort_order  INTEGER NOT NULL DEFAULT 0,  -- 並び順（小さいほど先）
  created_by  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_images_case ON case_images(case_id, sort_order, created_at);

-- いいね（事件単位）。viewer は端末ごとの識別子を SHA-256 した値。
CREATE TABLE IF NOT EXISTS likes (
  case_id     TEXT NOT NULL REFERENCES cases(id),
  viewer      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (case_id, viewer)
);

-- 「行ってきたよ掲示板」の投稿（2026-08-20）
-- 傍聴に行った人なら誰でも書ける代わりに、文の形を固定する（誹謗中傷を防ぐため）。
--   subject（選択）＋ quote（自由記入）＋ verb（選択）で1文になる：
--     主張した → 「◯◯は『△△』と主張しました」
--     求めた   → 「◯◯は『△△』を求めました」
CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL,              -- どの期日についての報告か
  subject    TEXT NOT NULL,              -- 原告 / 被告 / 裁判官
  quote      TEXT NOT NULL,              -- かぎ括弧の中（自由記入・60字まで）
  verb       TEXT NOT NULL,              -- 主張した / 求めた
  hidden     INTEGER NOT NULL DEFAULT 0, -- 1=運営が非表示にした
  created_at TEXT NOT NULL               -- 投稿日時 ISO8601
);
CREATE INDEX IF NOT EXISTS idx_posts_event ON posts(event_id, created_at);

-- 期日のお気に入り（🔖）。likes（事件単位・件数表示あり）とは別の、期日単位・件数表示なしの自分専用の目印。
-- viewer は likes と同じく端末ごとの識別子を SHA-256 した値。
CREATE TABLE IF NOT EXISTS event_bookmarks (
  event_id    TEXT NOT NULL REFERENCES events(id),
  viewer      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (event_id, viewer)
);
