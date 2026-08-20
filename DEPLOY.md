# 裁判カレンダー — 公開手順（Cloudflare）

共有カレンダー。Cloudflare Pages（公開）＋ Functions（API）＋ D1（共有DB）＋ Access（ログイン制限）。

- **閲覧**：Cloudflare Access を通過した人（＝許可した Google アカウント）だけが開ける
- **入力**：第1段階は `OWNER_EMAIL` のみ。第2段階で `ALLOW_ALL_WRITES="true"` にすると、閲覧を許可した全員が入力可

---

## 構成

```
public/index.html       画面（カレンダー・「最近の期日」・「今後の期日」）
public/case.html        画面（1つの事件の詳細ページ・?case=事件名 で開く）
public/style.css        両ページ共通のスタイル
public/lib.js           両ページ共通のロジック（状態・API呼び出し・モーダル・掲示板）。window.CC として公開
functions/_common.js    共通処理（認証・権限・JSON・掲示板の投稿可否判定）
functions/api/me.js          GET  /api/me      ログイン状態と権限・掲示板の受付状況
functions/api/events.js      GET  /api/events  一覧 / POST  追加
functions/api/events/[id].js PUT  /api/events/:id 更新 / DELETE 削除
functions/api/posts.js       GET  /api/posts      掲示板の一覧 / POST 投稿
functions/api/posts/[id].js  DELETE /api/posts/:id 投稿を消す（運営のみ）
schema.sql                        D1 のテーブル定義（最新）
migrate_002_call_for_support.sql  旧スキーマのDBを傍聴の呼びかけ用へ移行する一度きりのマイグレーション（新規作成ならschema.sqlだけでよい）
migrate_003_board.sql             行ってきたよ掲示板の posts テーブルを追加する一度きりのマイグレーション
seed_demo.sql                     動作確認用の架空データ（本番投入済み・消し方はファイル冒頭のコメント参照）
wrangler.toml           設定（D1 バインド・環境変数）
```

### events テーブルの列（2026-08-20〜）

1期日=1行のまま、傍聴の呼びかけに必要な列に整理した。

- 追加：`case_no`（事件番号）`court`（裁判所）`parties`（当事者）`host`（呼びかけ団体）`contact`（連絡先）`lede`（事件の説明）`points`（争われていること・改行区切り）`open`（1=誰でも傍聴できる／0=非公開・要確認）`level`（見どころタグ）
- 削除：`note`（「この日のみどころ・メモ」は廃止）

### 画面構成（2026-08-20〜）

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
