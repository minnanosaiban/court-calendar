"""事件ページ用 Twitterカード（手作りデザイン）を描く。横長1200x630のみ（正方形版は作らない）。
使い方: python make_card.py 出力フォルダ
サイトの配色・フォント(public/fonts)に合わせる。差し替えは case-edit の「Twitterカード」欄から。"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "fonts")
BG, PAPER, INK, RED, GRAY, FAINT, RING = "#f3f2ee", "#fcfbf6", "#221f1a", "#b93226", "#6b695f", "#a8a59a", "#dedbd3"
MIN_B = os.path.join(ROOT, "ShipporiMincho-Bold.ttf")
MIN_SB = os.path.join(ROOT, "ShipporiMincho-SemiBold.ttf")
GO_M = os.path.join(ROOT, "ZenKakuGothicNew-Medium.ttf")
F = lambda p, s: ImageFont.truetype(p, s)

LABEL = "傍聴案内"
TITLE = ["カトリック司教からの性暴力被害、", "修道会を訴えた裁判"]
TIME = "15:00"
PLACE = "東京地裁606号法廷"
NOTE = "報告会あります"
SS = 2  # 描画は2倍で行い縮小（ふち・斜め文字をなめらかに）

def stamp(size, px):
    """朱の角丸四角＋「傍聴」（少し傾ける）。size=一辺。RGBA を返す"""
    s = size * 3
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = int(s * 0.07)
    d.rounded_rectangle((w, w, s - w, s - w), radius=int(s * 0.2), outline=RED, width=w)
    f = F(MIN_B, int(s * 0.36))
    d.text((s / 2, s * 0.52), "傍聴", font=f, fill=RED, anchor="mm")
    im = im.rotate(-4, resample=Image.BICUBIC, expand=False)
    return im.resize((size, size), Image.LANCZOS)

def paste_text(img, xy, text, font, fill, anchor="la", spacing=0):
    d = ImageDraw.Draw(img)
    if spacing:
        x, y = xy
        for ch in text:
            d.text((x, y), ch, font=font, fill=fill, anchor=anchor)
            x += d.textlength(ch, font=font) + spacing
    else:
        d.text(xy, text, font=font, fill=fill, anchor=anchor)

def brand(img, right, bottom, scale):
    """右下：スタンプ＋「応援傍聴ナビ」"""
    f = F(MIN_B, int(34 * scale))
    d = ImageDraw.Draw(img)
    name = "応援傍聴ナビ"
    sp = int(3 * scale)
    tw = sum(d.textlength(c, font=f) + sp for c in name) - sp
    ic = int(52 * scale)
    gap = int(14 * scale)
    x0 = right - tw - gap - ic
    st = stamp(ic, 1)
    img.paste(st, (int(x0), int(bottom - ic)), st)
    paste_text(img, (x0 + ic + gap, bottom - ic / 2), name, f, INK, anchor="lm", spacing=sp)

def label(img, xy, scale):
    """朱の斜めラベル「傍聴案内」"""
    f = F(MIN_B, int(34 * scale))
    d0 = ImageDraw.Draw(img)
    pad_x, pad_y = int(22 * scale), int(10 * scale)
    tw = d0.textlength(LABEL, font=f) + 3 * int(4 * scale)
    w, h = int(tw + pad_x * 2), int(f.size + pad_y * 2)
    tile = Image.new("RGBA", (w + 20, h + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle((10, 10, 10 + w, 10 + h), radius=int(8 * scale), outline=RED, width=max(3, int(4 * scale)))
    paste_text(tile, (10 + pad_x, 10 + h / 2), LABEL, f, RED, anchor="lm", spacing=int(4 * scale))
    tile = tile.rotate(-3, resample=Image.BICUBIC, expand=True)
    img.paste(tile, xy, tile)

def card(W, H, wide):
    img = Image.new("RGBA", (W * SS, H * SS), BG)
    s = SS
    d = ImageDraw.Draw(img)
    m = 40 * s if wide else 60 * s
    d.rounded_rectangle((m, m, W * s - m, H * s - m), radius=28 * s, fill=PAPER, outline=RING, width=2 * s)
    L = m + (56 * s if wide else 72 * s)
    R = W * s - m - (56 * s if wide else 72 * s)
    B = H * s - m - (44 * s if wide else 64 * s)
    k = 1.0 if wide else 1.12
    label(img, (L - 10, m + int(34 * s * (1 if wide else 1.6))), s * (1 if wide else 1.15))
    # 事件名
    tsz = int((52 if wide else 58) * s)
    ft = F(MIN_B, tsz)
    y = m + int((116 if wide else 230) * s)
    for line in TITLE:
        paste_text(img, (L, y), line, ft, INK)
        y += int(tsz * 1.32)
    # 日時
    y += int((26 if wide else 90) * s)
    big, small = F(MIN_B, int(92 * s)), F(MIN_B, int(46 * s))
    base = y + int(84 * s)
    x = L
    dd = ImageDraw.Draw(img)
    # 数字は大きく、「月」「日」「月曜日」は小さく。15:00 も大きく
    for txt, fnt, gap in [("10", big, 0), ("月", small, 8), ("19", big, 0), ("日", small, 30),
                          ("月曜日", small, 40), (TIME, big, 0)]:
        dd.text((x, base), txt, font=fnt, fill=INK, anchor="ls")
        x += dd.textlength(txt, font=fnt) + gap * s
    y += int((112 if wide else 140) * s)
    # 場所
    fp = F(GO_M, int((34 if wide else 44) * s))
    paste_text(img, (L, y), PLACE, fp, GRAY)
    y += int((64 if wide else 96) * s)
    # お知らせ
    fn = F(MIN_B, int((36 if wide else 48) * s))
    paste_text(img, (L, y), NOTE, fn, RED, spacing=int(3 * s))
    brand(img, R, B, s * (1 if wide else 1.15) / 1)
    return img.convert("RGB").resize((W, H), Image.LANCZOS)

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    card(1200, 630, True).save(os.path.join(out, "card.png"))
