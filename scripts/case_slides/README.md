# 事件ページ用の説明スライド画像（掲載見本スタイル）

事件ページの写真欄に載せる、16:9の1枚もの説明スライド（見出し＋本文＋朱色の縦棒）をサイトの
フォント・配色で作るスクリプト。2026-08-31、ENEOS事件（`cmt3az1tvea4dz`）の掲載見本12枚を
作り直したときのものをそのまま残してある。次に同じテイストで別の事件用に作るときの手順：

1. `render_slides.py` の `SLIDES` を新しい内容に差し替えて実行する
   → `out/mobile_NN.png`・`out/web_NN.png` ができる（NNは`SLIDES`の`n`、2桁ゼロ埋め）
2. 対象の事件の `case_images` 行を確認する
   ```
   npx wrangler d1 execute court-calendar --remote --command="SELECT id, r2_key, file_name, sort_order FROM case_images WHERE case_id='<case_id>' ORDER BY sort_order"
   ```
3. `upload_and_update.py` の `ROWS` をその結果に差し替えて実行する
   → `out/`の画像をR2へアップロードし、`plan.json`・`update.sql`を書き出し、
     最後に打つべき`wrangler d1 execute`コマンドを表示する（この時点ではまだ本番は変わらない）
4. 表示されたコマンドを確認して自分で実行する（ここで本番DBが更新される）
5. 事件ページで表示を確認できたら、差し替え前の`r2_key`・`web_r2_key`（手順2のSELECT結果）を
   `npx wrangler r2 object delete court-calendar-files/<旧key> --remote` で削除する
   （孤立ファイルを残さないため）

## デザインの要点
- 見出し＝Shippori Mincho SemiBold、本文＝Zen Kaku Gothic New Regular（サイトと同じ）
- 色は`--stamp`(#b93226)とその薄い変種／無彩色（`--ink`/`--mut`/`--faint`）だけ。他の色相は使わない
- スマホ用＝1200×675、文字を大きめにして密度高く（`case_images`の元々の設計意図＝スマホ視認性優先）
- Web用＝1600×900、余白多めで縦中央寄せ。画面幅560px以上のときはこちらが優先表示される
  （`case_images.web_r2_key`があるとき）

## 依存
- フォント本体は`public/fonts/`のTTFをそのまま使う（Pillowで直接読み込み）
- Python 3 + Pillow（`pip install pillow`）
- `npx wrangler`がログイン・このプロジェクトのD1/R2に書き込める状態であること
