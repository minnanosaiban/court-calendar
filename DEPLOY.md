# 裁判カレンダー — 公開手順（Cloudflare）

共有カレンダー。Cloudflare Pages（公開）＋ Functions（API）＋ D1（共有DB）＋ Access（ログイン制限）。

- **閲覧**：Cloudflare Access を通過した人（＝許可した Google アカウント）だけが開ける
- **入力**：第1段階は `OWNER_EMAIL` のみ。第2段階で `ALLOW_ALL_WRITES="true"` にすると、閲覧を許可した全員が入力可

---

## 構成

```
public/index.html       画面（カレンダー・これだけが公開配信される）
functions/_common.js    共通処理（認証・権限・JSON）
functions/api/me.js          GET  /api/me      ログイン状態と権限
functions/api/events.js      GET  /api/events  一覧 / POST  追加
functions/api/events/[id].js PUT  /api/events/:id 更新 / DELETE 削除
schema.sql              D1 のテーブル定義
wrangler.toml           設定（D1 バインド・環境変数）
```

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
