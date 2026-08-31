# -*- coding: utf-8 -*-
"""
render_slides.py が作った out/mobile_NN.png・out/web_NN.png を、
既存の case_images 行の r2_key（スマホ用）・web_r2_key（Web用）に差し替えるための補助スクリプト。
2026-08-31、ENEOS事件（cmt3az1tvea4dz）の掲載見本12枚を差し替えたときの手順をそのまま残してある。

前提：npx wrangler がログイン済みで、このprojectのD1・R2に書き込める状態であること
　　　（`npx wrangler whoami` で確認）。

使い方（次に別の事件用に作るとき）：
  1. まず対象の case_images 行を確認する：
       npx wrangler d1 execute court-calendar --remote --command="SELECT id, r2_key, file_name, sort_order FROM case_images WHERE case_id='<case_id>' ORDER BY sort_order"
  2. 下の ROWS を、その結果（id・並び順・分かりやすいファイル名の芯）に差し替える。
     n は render_slides.py の SLIDES の n と対応させる（out/mobile_01.png 等を探すため）。
  3. render_slides.py を実行して out/ に画像を作る。
  4. このスクリプトを実行する：
       python upload_and_update.py
     → out/ の画像をR2へアップロードし、plan.json・update.sql を書き出し、
       次に打つ wrangler d1 execute コマンドを画面に表示する（ここまでは安全＝まだ本番DBは変わらない）。
  5. 表示された wrangler d1 execute コマンドを確認のうえ自分で実行する（本番DBの更新はここで初めて起きる）。
  6. 更新後、事件ページで表示を確認できたら、古い r2_key・web_r2_key（差し替え前の値）のR2オブジェクトを
     手動で削除する（`npx wrangler r2 object delete court-calendar-files/<旧key> --remote`）。
     孤立ファイルを残さないため。旧キーは手順1のSELECT結果に出ている。
"""
import os, subprocess, sys, time, json

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "out")

# ---- ここを差し替える（case_images.id, render_slides.pyのn, ファイル名の芯） ----
ROWS = [
    ("imt4bwtzo8uzg5", 1, "p01_shadan"),
    ("imt4bwtzpzjr4j", 2, "p02_tsuho"),
    ("imt4bwtzqejd3g", 3, "p03_aimai"),
    ("imt4bwtzr56ox7", 4, "p04_urazuke"),
    ("imt4bwtzsy98vg", 5, "p05_keiyaku"),
    ("imt4bwtztjdkj8", 6, "p06_soten"),
    ("imt4bwtzury1qz", 7, "p07_goui"),
    ("imt4bwtzv1gygl", 8, "p08_ketsuron"),
    ("imt4bwtzwgalk7", 9, "p09_hokaisei"),
    ("imt4bwtzx3s7tq", 10, "p10_henkin"),
    ("imt4bwtzyjfywp", 11, "p11_consul"),
    ("imt4bwtzzf0b52", 12, "p12_saitsuho"),
]
BUCKET = "court-calendar-files"
# ---- ここまで ----

def b36(n):
    digs = "0123456789abcdefghijklmnopqrstuvwxyz"
    if n == 0:
        return "0"
    s = ""
    while n:
        n, r = divmod(n, 36)
        s = digs[r] + s
    return s

def build_plan():
    now_ms = int(time.time() * 1000)
    plan = []
    for i, (cid, n, stem) in enumerate(ROWS):
        ts_m = b36(now_ms + i * 2)
        ts_w = b36(now_ms + i * 2 + 1)
        mobile_path = os.path.join(OUT, f"mobile_{n:02d}.png")
        web_path = os.path.join(OUT, f"web_{n:02d}.png")
        if not (os.path.exists(mobile_path) and os.path.exists(web_path)):
            print(f"! skip n={n}: {mobile_path} / {web_path} が見つからない（先に render_slides.py を実行）")
            continue
        plan.append(dict(
            id=cid, n=n, mobile_path=mobile_path, web_path=web_path,
            key_m=f"i/{cid}/{ts_m}.png", key_w=f"iw/{cid}/{ts_w}.png",
            size_m=os.path.getsize(mobile_path), size_w=os.path.getsize(web_path),
            name_m=f"{stem}.png", name_w=f"{stem}_web.png",
        ))
    return plan

def write_outputs(plan):
    with open(os.path.join(BASE, "plan.json"), "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)
    sql_lines = [
        "UPDATE case_images SET "
        f"r2_key='{p['key_m']}', file_name='{p['name_m']}', file_size={p['size_m']}, mime='image/png', "
        f"web_r2_key='{p['key_w']}', web_file_name='{p['name_w']}', web_file_size={p['size_w']}, web_mime='image/png' "
        f"WHERE id='{p['id']}';"
        for p in plan
    ]
    sql_path = os.path.join(BASE, "update.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines) + "\n")
    return sql_path

def upload_all(plan):
    for p in plan:
        for path, key in [(p["mobile_path"], p["key_m"]), (p["web_path"], p["key_w"])]:
            cmd = ["npx.cmd" if os.name == "nt" else "npx", "wrangler", "r2", "object", "put",
                   f"{BUCKET}/{key}", "--file", path, "--content-type", "image/png", "--remote"]
            r = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace",
                                shell=(os.name == "nt"))
            print(("OK " if r.returncode == 0 else "FAIL ") + key)
            if r.returncode != 0:
                print(r.stdout[-800:], r.stderr[-800:])

if __name__ == "__main__":
    plan = build_plan()
    if not plan:
        sys.exit("アップロードする画像が無い（out/ を確認）")
    sql_path = write_outputs(plan)
    upload_all(plan)
    print()
    print("R2へのアップロードが完了。DBはまだ変わっていない。次のコマンドを確認して自分で実行してください：")
    print(f'  npx wrangler d1 execute court-calendar --remote --file "{sql_path}"')
