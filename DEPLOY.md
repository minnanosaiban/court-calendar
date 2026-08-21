# 裁判カレンダー — 公開手順（Cloudflare）

共有カレンダー。Cloudflare Pages（公開）＋ Functions（API）＋ D1（共有DB）＋ Access（ログイン制限）。

- **閲覧**：Cloudflare Access を通過した人（＝許可した Google アカウント）だけが開ける
- **入力**：第1段階は `OWNER_EMAIL` のみ。第2段階で `ALLOW_ALL_WRITES="true"` にすると、閲覧を許可した全員が入力可

---

## 構成

```
public/index.html       画面（カレンダー・「最近の期日」・「今後の期日」）
public/case.html        画面（1つの事件の詳細ページ・?id=事件ID で開く。旧リンク ?case=事件名 も可）
public/doc.html         画面（訴訟資料の本文を読むページ・?id=資料ID で開く）
public/cases.html       画面（事件をさがす・検索とタグの絞り込み・?tag=… で開くとその絞り込み済み）
public/style.css        両ページ共通のスタイル
public/lib.js           両ページ共通のロジック（状態・API呼び出し・モーダル・掲示板・タイムライン・資料）。window.CC として公開
functions/_common.js    共通処理（認証・権限・JSON・行→画面の変換・掲示板の投稿可否判定）
functions/api/me.js               GET  /api/me           ログイン状態と権限・掲示板の受付状況
functions/api/cases.js            GET  /api/cases        事件の一覧（いいね数つき） / POST 追加
functions/api/cases/[id].js       PUT  /api/cases/:id    更新 / DELETE 削除（期日・資料が残っていると不可）
functions/api/cases/[id]/like.js  POST /api/cases/:id/like いいね / DELETE 取り消し（ログイン不要・端末ごとに1回）
functions/api/events.js           GET  /api/events       期日の一覧 / POST 追加（知らない事件名なら事件も作る）
functions/api/events/[id].js      PUT  /api/events/:id   更新 / DELETE 削除（投稿も消え、資料の紐づけは外れる）
functions/api/materials.js        GET  /api/materials    訴訟資料の一覧 / POST 追加（multipart・ファイル任意）
functions/api/materials/[id].js   PUT  /api/materials/:id 更新（ファイル差し替え・取り外し可） / DELETE 削除
functions/api/images.js           GET  /api/images        事件の写真の一覧 / POST 追加（multipart・ファイル必須）
functions/api/images/[id].js      PUT  /api/images/:id    更新（説明・並び順・ファイル差し替え） / DELETE 削除
functions/api/posts.js            GET  /api/posts        掲示板の一覧 / POST 投稿
functions/api/posts/[id].js       DELETE /api/posts/:id  投稿を消す（運営のみ）
functions/files/[[path]].js       GET  /files/<key>      R2 に置いたファイル（資料・写真）を配信（誰でも閲覧可）
schema.sql                        D1 のテーブル定義（最新）
migrate_002_call_for_support.sql  （過去）旧スキーマのDBを傍聴の呼びかけ用へ移行
migrate_003_board.sql             （過去）行ってきたよ掲示板の posts テーブルを追加
migrate_004_cases.sql             事件（cases）を分離し、訴訟資料（materials）・いいね（likes）を追加する一度きりのマイグレーション
migrate_005_images.sql            事件の写真（case_images）テーブルを追加する一度きりのマイグレーション
migrate_006_timeline.sql          期日の主張要約・資料の本文（body）列を追加する一度きりのマイグレーション
migrate_007_tags.sql              事件のタグ（cases.tags）列を追加する一度きりのマイグレーション
seed_demo.sql                     動作確認用の架空データ（v3 形式・消し方はファイル冒頭のコメント参照）
wrangler.toml           設定（D1・R2 バインド・環境変数）
```

### v3：事件・訴訟資料・いいね（2026-08-21〜）

CALL4 のように「事件」を中心に据えた。事件に属するもの（当事者・争点・説明・よびかけ・リンク）は `cases` に1回だけ持ち、
期日（`events`）は `case_id` で事件にぶら下がる。訴訟資料（`materials`）は目録を D1、ファイル本体を R2 に置く。

- `cases`：`name`（事件名・一意）`case_no` `parties` `points`（争点・改行区切り）`lede`（説明）`call_text`（よびかけ）`host` `contact` `links`（URL・改行区切り。X などはドメインでアイコンを出し分け）
- `events`：`case_id` `date` `time` `type` `court` `place` `open` `level`（事件の説明の列は落とした）
- `materials`：`case_id` `event_id`（任意＝タイムラインの節にぶら下がる）`title` `side`（原告側/被告側/裁判所/その他）`kind`（主張書面/証拠/判決・決定/その他）`filed_on` `r2_key` `file_name` `file_size` `mime` `claims`（箇条書き・任意）`summary`（要約・手入力・任意）
- `likes`：`(case_id, viewer)` が主キー。`viewer` は端末が持つ乱数（`X-Viewer` ヘッダ）の SHA-256。同じ端末から何度押しても1件

画面の並び（トップの「最近の期日」カードと事件ページの上半分は同じ）：

1. タイトル ＋ ♡いいね（右上に当事者のアカウントリンク）
2. 最近の期日（これからの最初の回。全部済んでいれば最後の回）
3. 争点
4. 当事者
5. 行ってきたよ掲示板
6. トップはここで「詳細を見る →」。事件ページはさらに
7. よびかけ（説明文＋よびかけ文＋呼びかけ人・連絡先）
8. タイムラインと訴訟資料（済んだ回は●、次回は朱色、これからは◯。資料がある節はクリックで開き、資料名→箇条書き→要約）
9. 訴訟資料一覧（提出日順）

**資料のファイルの置き場（2026-08-22〜：R2 有効化済み）**

R2（バケット `court-calendar-files`）を有効化済み。事件ページの「＋ 資料を追加」「＋ 写真を追加」から、
ブラウザだけでファイルをアップロードできる（`/api/me` の `uploads` が true）。
無効化されていた時期の名残として、資料は「ファイルのURL」欄（`/docs/…` や外部 `https://…`）でも登録できる。
両方とも `fileUrl` は R2 のファイルがあればそちらを優先する。

R2 の請求は予算アラート（ダッシュボード → Manage Account → Billing → Billable Usage → Create budget alert）で
低めのしきい値（$1 目安）を設定しておくと、想定外の使われ方に気づける。通知のみで自動停止はしない点に注意。

**既存のDBを v3 へ移す**（本番は必ずバックアップを取ってから。`events` の行は消えず、事件の説明は直近の回の値で `cases` に写される）：

```
npx wrangler d1 export court-calendar --remote --output backup_before_004.sql
npx wrangler d1 execute court-calendar --remote --file migrate_004_cases.sql
```

**v3 を本番に出す順番**（新しいコードは新しいテーブルを前提にするので、DBを先に移す）：

1. `npm run db:backup:remote`（バックアップ）
2. `npm run db:cases:remote`（マイグレーション 004）
3. `deploy.bat`（デプロイ＋GitHub へ push）

資料の登録は編集パスワードを知っている人だけ。ファイル無しの「目録だけ」の登録もできる。
`/docs/…` も `/files/…` も誰でも開ける（公開サイトなので、公開してよい書面だけを置くこと）。

### v4：事件の写真（2026-08-22〜）

`case_images` に、事件の証拠写真・記者会見の様子などを持つ。ファイルは必ず R2（`i/<写真ID>/…` のキー）。
`caption`（説明・任意）と `sort_order`（並び順）を持つ。旧スキーマのDBを更新する場合は `migrate_005_images.sql` を実行すること。

- 表示は**事件ページ（詳細ページ）の最上部だけ**。カードの天面いっぱいに横幅いっぱいの帯を出し、複数枚あれば4.5秒おきに自動で送る（ホバー中は止める）。1枚だけなら動かさない。0枚なら何も出さない
- 各写真をクリック（タップ）すると、原寸を新しいタブで開く
- 編集権限があるときだけ、ギャラリーの下に小さな管理用の一覧（サムネイル・説明・↑↓で並び替え・編集リンク）が出る。「＋ 写真を追加」もここ
- 証拠写真は人の顔・氏名・住所が写り込みやすいので、登録前に確認するよう追加モーダルに注意書きを入れてある（自動検出はしていない・目視で確認すること）

### v4：タイムライン刷新（2026-08-22〜）

`events` に `plaintiff_argument`／`defendant_argument`（その回の原告/被告の主張・1行1項目・任意）、
`materials` に `body`（本文・Markdownを貼り付け・任意）を追加。旧スキーマのDBを更新する場合は
`migrate_006_timeline.sql` を実行すること。

- タイムラインの節を開くと、まず原告/被告の主張（あれば）、続けて資料が並ぶ
- 資料は **PDF／本文／要約** の3つのボタン。無い項目はグレーで押せない（「この資料には無い」ことが一目でわかる）
  - PDF＝ファイル本体（R2 か `/docs/…`）を新しいタブで開く
  - 本文＝`public/doc.html?id=資料ID` で、Markdownを変換した読みやすいページを新しいタブで開く
  - 要約＝その場でトグル開閉（クリックするたびに開閉、ページ遷移なし）
- 本文のMarkdown変換（`CC.mdToHtml`）は**必ず全体をエスケープしてから**見出し・箇条書き・引用・`**強調**`・`*斜体*`・`[リンク](https://…)` だけを当てはめる自前の簡易実装。生のHTMLやscriptタグを貼り付けても実行されない。リンクは `https://`／`http://` のみ変換する（`javascript:` などは素通しでテキストのまま）
- 本文は原本の代わりではなく補助（検索されやすくする・要点を読みやすくする）という位置づけ。原本はあくまでPDF

### v4：タグ・検索・「事件をさがす」（2026-08-22〜）

`cases` に `tags`（1行1つ・任意）を追加。旧スキーマのDBを更新する場合は `migrate_007_tags.sql` を実行すること。

- タグは事件詳細（トップの簡易カードも）のタイトル下に表示。クリックすると `cases.html?tag=…` へ飛び、そのタグで絞り込んだ一覧が開く
- `public/cases.html`＝「事件をさがす」。事件名の部分一致検索（入力するたびに即時絞り込み）とタグの単一絞り込みを組み合わせられる。データはすでに `CC.load()` で全件取得済みなので、検索・絞り込みはサーバに問い合わせずブラウザ内だけで完結する
- 一覧の並びは「次回期日が近い順」（期日未定の事件は事件名順で最後に）。各行は事件の写真の1枚目（あれば）をサムネイルに使い、無ければアイコンのプレースホルダ
- トップページの「期日カレンダーを見る」の隣に「事件をさがす」の導線を追加

### （過去）events テーブルの列（2026-08-20〜21）

1期日=1行のまま、傍聴の呼びかけに必要な列に整理した。

- 追加：`case_no`（事件番号）`court`（裁判所）`parties`（当事者）`host`（呼びかけ団体）`contact`（連絡先）`lede`（事件の説明）`points`（争われていること・改行区切り）`open`（1=誰でも傍聴できる／0=非公開・要確認）`level`（見どころタグ）
- 削除：`note`（「この日のみどころ・メモ」は廃止）

### （過去）画面構成（2026-08-20〜21）

- `index.html`：上から「最近の期日」（直近に期日がある**事件**の詳細に固定）→「カレンダー」（PCは2か月・スマホは1か月）→「今後の期日」→ 最下部に控えめな編集リンク
- `case.html`：1つの事件の詳細を独立したページで表示。事件の説明・争点・**その事件の全ての回**（期日）・行ってきたよ掲示板・（編集権限があれば）編集リンク
- カレンダーのマス目は日付の下の下線バー（事件の色・件数ぶんの本数）だけ。日付にカーソルを合わせる（スマホはタップする）とその日の予定がプレビューで出て、クリックすると `case.html` に飛ぶ
- 「行ってきたよ掲示板」は事件単位（全ての回をまとめて表示）。投稿するときは「どの期日についての報告か」を選択式で選ぶ
- 事件の説明の下に、呼びかけ人と連絡先を添える。事件番号・「誰でも傍聴できます」タグは画面には出さない（データとしては保持）

旧スキーマで作った D1（本番・ローカル）を更新するときは `migrate_002_call_for_support.sql` を実行する。`ADD COLUMN` は既存の行を消さず、`DROP COLUMN` は `note` 列の値だけを捨てる。

### 行ってきたよ掲示板（posts）

傍聴に行った人なら**誰でも投稿できる**。そのかわり文の形を固定して、誹謗中傷を書けなくしてある。

- 「誰が」＝ 原告／被告／裁判官 の**選択**（`subject`）
- 「何を」＝ **自由記入・60字まで**（`quote`）
- 「何をした」＝ 主張した／求めた の**選択**（`verb`）
- 表示は「原告は『◯◯』と主張しました」「裁判官は『◯◯』を求めました」

投稿は期日（`event_id`）に紐づくが、カードでは**同じ事件の全回**をまとめて出し、頭に回（種別）を添える。そうしないと、これからの期日のカードでは掲示板がいつも空になる。

**投稿の可否**（`functions/_common.js` の `authorizePost`）：

1. 編集パスワードを知っている運営は常に投稿できる
2. 一般の人は **Turnstile を通過したときだけ**投稿できる
3. ローカル開発（`LOCAL_DEV="true"`）のときだけ素通し

つまり本番で `TURNSTILE_SECRET` を設定するまで、一般の投稿は一切通らない（公開直後も安全）。荒れたときは運営が各投稿の「消す」で削除できる。

**Turnstile の設定**（公開して投稿を受け付ける前に必要）：

1. Cloudflare ダッシュボード → Turnstile → ウィジェットを作成（サイトはPagesのホスト名）
2. 発行された **Site Key** を `wrangler.toml` の `[vars]` に `TURNSTILE_SITEKEY = "..."` として書く（公開されてよい値）
3. **Secret Key** は secret として入れる：
   `"<secret>" | npx wrangler pages secret put TURNSTILE_SECRET --project-name court-calendar`
4. `npx wrangler pages deploy` で反映

## 1. ログイン（1回だけ・対話）

```
npx wrangler login
```

## 2. D1（共有DB）を作成して、テーブルを作る

```
npx wrangler d1 create court-calendar
```
→ 表示された `database_id` を `wrangler.toml` の `REPLACE_AFTER_D1_CREATE` に貼り替える。続けて：
```
npx wrangler d1 execute court-calendar --remote --file schema.sql
```

## 3. 公開（デプロイ）

```
npx wrangler pages deploy
```
→ `https://court-calendar.pages.dev` のようなURLが発行される。
（この時点ではまだ誰でも開ける。次の Access 設定で必ず鍵をかける。）

## 4. Access で鍵をかける（ダッシュボード）

Cloudflare ダッシュボード → **Zero Trust** →

1. **Settings → Authentication → Login methods**：**Google** を追加（IdP として有効化）
2. **Access → Applications → Add an application → Self-hosted**
   - Application domain：`court-calendar.pages.dev`（手順3で発行されたホスト名）
   - **Identity providers**：Google を有効
   - **Policy**：Action=Allow、Include=**Emails**（許可する Gmail アドレスを列挙）
     - 例：あなたのアドレス＋閲覧を許可する人のアドレス
   - 保存。**Application Audience (AUD) タグ**をコピーしておく（次で使う）

## 5. アプリに「誰がログインしているか」を検証させる

`wrangler.toml` の以下を、本番の値に設定して再デプロイ：
```
CF_ACCESS_TEAM_DOMAIN = "<あなたのチーム>.cloudflareaccess.com"
CF_ACCESS_AUD         = "<手順4でコピーした AUD タグ>"
```
```
npx wrangler pages deploy
```

これで：許可外の人は **開けない**／許可した閲覧者は **見えるが書けない**／あなた（OWNER_EMAIL）は **入力できる**。

## 6.（将来）全員入力できるようにする＝第2段階

`wrangler.toml` を `ALLOW_ALL_WRITES = "true"` に変えて `npx wrangler pages deploy`。
これで Access を通った人全員が入力可能になる。元に戻すときは `"false"` に。

---

## ローカルでの動作確認（ログイン不要）

ローカルでは擬似ログインを使う。プロジェクト直下に `.dev.vars`（gitには載らない）を作る：
```
LOCAL_DEV="true"
DEV_EMAIL="you@example.com"
```
`LOCAL_DEV="true"` のときだけ `DEV_EMAIL` がログインユーザー扱いになる（本番には置かないので、本番は必ず Access の実ログインが必要）。閲覧者を試すときは `DEV_EMAIL` を別アドレスにする。
```
npx wrangler d1 execute court-calendar --local --file schema.sql   # 最初の1回
npx wrangler pages dev                                              # http://127.0.0.1:8788
```
