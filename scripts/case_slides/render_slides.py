# -*- coding: utf-8 -*-
"""
事件ページの「掲載見本」用に作った、説明スライド画像（16:9の1枚ものPNG）の生成スクリプト。
2026-08-31、ENEOS事件（cmt3az1tvea4dz）の掲載見本12枚をサイトのフォント・配色に合わせて
作り直したときのもの。次に同じテイストで別の事件用に作るときは、下のSLIDESを差し替えて
このファイルを直接実行すればよい（アップロード手順は upload_and_update.py と README.md 参照）。

デザインの方針（DESIGN_SYSTEM.md準拠）：
- 見出し系＝Shippori Mincho SemiBold、本文＝Zen Kaku Gothic New Regular（サイトと同じ組み合わせ）
- 色は --stamp(#b93226) とその薄い変種／無彩色（--ink #221f1a, --mut #6b695f, --faint #a8a59a）だけ
  （紺・青など他の色相は使わない）
- モバイル用＝1200x675（16:9）、文字を大きめにして原本に近い密度で埋める
  （既存のcase_imagesスキーマの意図どおり「スマホでの見やすさ優先」）
- Web用＝1600x900（16:9）、余白を多めに取り縦中央寄せにして、Twitterカードのような
  印象的な佇まいにする（画面幅560px以上のときはこちらが優先表示される）

使い方：
  python render_slides.py
  → このファイルと同じ階層に out/mobile_NN.png ・ out/web_NN.png が生成される（NN=SLIDESのn、2桁）
"""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
# このスクリプトは court-calendar/scripts/case_slides/ に置く前提。フォントは public/fonts/ を直参照する。
FONT_DIR = os.path.normpath(os.path.join(BASE, "..", "..", "public", "fonts"))
MINCHO = os.path.join(FONT_DIR, "ShipporiMincho-SemiBold.ttf")
GOTHIC = os.path.join(FONT_DIR, "ZenKakuGothicNew-Regular.ttf")

INK = (0x22, 0x1f, 0x1a)
MUT = (0x6b, 0x69, 0x5f)
FAINT = (0xa8, 0xa5, 0x9a)
STAMP = (0xb9, 0x32, 0x26)
CARD = (0xff, 0xff, 0xff)

_font_cache = {}
def font(path, size):
    key = (path, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]

# ---- ここを事件ごとに差し替える ----
# label: 小見出し（朱色）。head: 見出し（縦棒つき、複数行可、リストの各要素が1行）。
# sub: 見出しの下に添える注記（任意、灰色、1行）。
# body: [(テキスト, 強調するか), ...] のリスト。強調した部分だけ朱色で塗る。
# n: ファイル名に使う通し番号（sort_orderと合わせておくと分かりやすい）。
SLIDES = [
    dict(n=1, label="本サイトの問題提起",
         head=["通報の後、通報者は", "情報から遮断された"],
         body=[("そのうえで、", False), ("裏づけの確認できない情報", True), ("を知らされました。", False)]),
    dict(n=2, label="通報した内容",
         head=["支払う必要のない", "海外消費税を払っている"],
         body=[("社内の通報窓口へ伝えたのは、この問題でした。", False)]),
    dict(n=3, label="通報を受けてからの会社の対応　①",
         head=["調査事項を曖昧にして", "回答された"],
         body=[("海外消費税を支払う必要があるか否かは、示されませんでした。", False)]),
    dict(n=4, label="通報を受けてからの会社の対応　②",
         head=["裏づけが確認できない", "情報を知らされた"],
         body=[("「法改正があったため」「子会社が返金を受けた」と知らされました。", False)]),
    dict(n=5, label="通報を受けてからの会社の対応　③",
         head=["海外消費税の支払を", "契約化した"],
         body=[("「海外企業がＥＮＥＯＳへ請求できる」形へ契約変更。通報者に知らせず。", False)]),
    dict(n=6, label="裁判の争点",
         head=["是正措置を通報者に", "通知しなかったこと"],
         body=[("通報を受けた後の契約変更について、これが争点になりました。", False)]),
    dict(n=7, label="裁判所の判断",
         head=["「支払う合意」が", "あったと推認"],
         body=[("契約書に海外消費税の定めはなかったものの、そう推認されました。", False)]),
    dict(n=8, label="裁判所の判断（結論）",
         head=["違反がなければ", "通知すべき是正措置もない"],
         body=[("そう判断し、通知しなかったことを問題にする主張は退けられました。", False)]),
    dict(n=9, label="裏づけが確認できない情報　①",
         head=["「法改正があったため」"], sub="ただし、その法改正は特定されていない",
         body=[("会社は通報者にそう知らせました。いつの・どの法律なのかは、未だに分かりません。", False)]),
    dict(n=10, label="裏づけが確認できない情報　②",
         head=["「子会社が返金を受けた」"], sub="ただし、記録は「子会社→本社」の送金だけ",
         body=[("外部から実際に回収したことを示す記録は、見つかりません。", False)]),
    dict(n=11, label="裏づけが確認できない情報　③",
         head=["「コンサルに相談した」"], sub="ただし、何を相談したのかが分からない",
         body=[("「違反ではない」という結論だけが伝えられ、やりとりは記録にありません。", False)]),
    dict(n=12, label="再通報と新たな問題",
         head=["『解決済み』と", "だけ伝えられた"],
         body=[("不正の有無がどちらなのかすら、判然としないままでした。", True)]),
]
# ---- ここまで ----

PULL_FORWARD = set("」』）。、！？」・")  # 行頭に来てほしくない文字（簡易禁則）

def wrap_runs(runs, gfont, max_width, draw):
    """runs: [(text, is_emph), ...] を1本の文字列に展開し、pixel幅で貪欲に折り返す。
    戻り値: [ [(text, is_emph), ...], ... ]（行のリスト、各行はセグメントのリスト）"""
    chars = []  # (char, is_emph)
    for text, emph in runs:
        for ch in text:
            chars.append((ch, emph))
    lines = []
    cur = []
    cur_w = 0
    for ch, emph in chars:
        w = draw.textlength(ch, font=gfont)
        if cur and cur_w + w > max_width:
            lines.append(cur)
            cur = []
            cur_w = 0
        cur.append((ch, emph))
        cur_w += w
    if cur:
        lines.append(cur)
    # 簡易禁則：行頭が閉じ括弧・句読点なら前の行末へ送る
    i = 1
    while i < len(lines):
        if lines[i] and lines[i][0][0] in PULL_FORWARD:
            lines[i - 1].append(lines[i].pop(0))
            if not lines[i]:
                lines.pop(i)
                continue
        i += 1
    # セグメント（同じis_emphの連続）にまとめる
    out = []
    for line in lines:
        segs = []
        for ch, emph in line:
            if segs and segs[-1][1] == emph:
                segs[-1] = (segs[-1][0] + ch, emph)
            else:
                segs.append((ch, emph))
        out.append(segs)
    return out

def draw_segs(draw, x, y, segs, gfont):
    cx = x
    for text, emph in segs:
        color = STAMP if emph else INK
        draw.text((cx, y), text, font=gfont, fill=color)
        cx += draw.textlength(text, font=gfont)

def render(slide, variant, out_path):
    if variant == "mobile":
        W, H = 1200, 675
        left = 96
        top = 64
        label_size, head_size, sub_size, body_size, wm_size = 36, 76, 36, 46, 24
        bar_w, bar_gap = 8, 28
        gap_label_head, gap_head_sub, gap_head_body, gap_sub_body = 28, 16, 44, 28
        head_lh, body_lh = 1.4, 1.6
        margin_right = 96
        vcenter = False
    else:
        W, H = 1600, 900
        left = 176
        top = 150
        label_size, head_size, sub_size, body_size, wm_size = 38, 86, 38, 46, 26
        bar_w, bar_gap = 8, 32
        gap_label_head, gap_head_sub, gap_head_body, gap_sub_body = 36, 20, 52, 32
        head_lh, body_lh = 1.4, 1.7
        margin_right = 176
        vcenter = True

    img = Image.new("RGB", (W, H), CARD)
    draw = ImageDraw.Draw(img)

    f_label = font(MINCHO, label_size)
    f_head = font(MINCHO, head_size)
    f_sub = font(GOTHIC, sub_size)
    f_body = font(GOTHIC, body_size)
    f_wm = font(GOTHIC, wm_size)

    max_body_w = W - left - margin_right
    body_lines = wrap_runs(slide["body"], f_body, max_body_w, draw)

    # ブロック全体の高さを先に計算（縦中央寄せ用）
    h_label = int(label_size * 1.2)
    h_head = int(head_size * head_lh) * len(slide["head"])
    h_sub = int(sub_size * 1.3) if slide.get("sub") else 0
    h_body = int(body_size * body_lh) * len(body_lines)
    total_h = (h_label + gap_label_head + h_head
               + (gap_head_sub + h_sub if slide.get("sub") else 0)
               + (gap_sub_body if slide.get("sub") else gap_head_body) + h_body)

    y = (H - total_h) // 2 if vcenter else top

    # ラベル
    draw.text((left, y), slide["label"], font=f_label, fill=STAMP)
    y += h_label + gap_label_head

    # 見出し（縦棒＋本文）
    head_top = y
    text_x = left + bar_w + bar_gap
    for line in slide["head"]:
        draw.text((text_x, y), line, font=f_head, fill=INK)
        y += int(head_size * head_lh)
    head_bottom = y
    draw.rectangle([left, head_top + int(head_size * 0.06), left + bar_w, head_bottom - int(head_size * (head_lh - 1))], fill=STAMP)

    # サブライン（ただし、〜）
    if slide.get("sub"):
        y += gap_head_sub
        draw.text((text_x + 16, y), slide["sub"], font=f_sub, fill=MUT)
        y += h_sub
        y += gap_sub_body
    else:
        y += gap_head_body

    # 本文
    for segs in body_lines:
        draw_segs(draw, left, y, segs, f_body)
        y += int(body_size * body_lh)

    # 透かし（右下）
    wm_text = "応援傍聴ナビ"
    wm_w = draw.textlength(wm_text, font=f_wm)
    margin = 48 if variant == "mobile" else 64
    draw.text((W - margin - wm_w, H - margin - wm_size), wm_text, font=f_wm, fill=FAINT)

    if y > H - margin - wm_size - 12:
        print(f"  ! overflow warning: {variant} n={slide['n']} bottom_y={y} limit={H-margin-wm_size-12}")

    img.save(out_path)

if __name__ == "__main__":
    out_dir = os.path.join(BASE, "out")
    os.makedirs(out_dir, exist_ok=True)
    for s in SLIDES:
        render(s, "mobile", os.path.join(out_dir, f"mobile_{s['n']:02d}.png"))
        render(s, "web", os.path.join(out_dir, f"web_{s['n']:02d}.png"))
    print("done", len(SLIDES) * 2, "files ->", out_dir)
