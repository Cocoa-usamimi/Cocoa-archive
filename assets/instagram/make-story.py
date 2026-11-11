#!/usr/bin/env python3
"""ここあ Instagram ストーリー画像生成 (1080x1920, 淡いピンク基調)."""
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
OUT = sys.argv[1]
GREETING = sys.argv[2]          # e.g. こんにちは
WEATHER = sys.argv[3]           # e.g. 今日の東京は雨のちくもり、最高14℃だよ。午後は晴れてくるよ。
DATE = sys.argv[4]              # e.g. 11月10日（火）
PIXEL_AVATAR = "/home/hatch/workspace/instagram/kokoa-pixel-human-128.png"

FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

PINK_DEEP = (214, 51, 108)
PINK_MID = (236, 110, 160)
PINK_SOFT = (255, 220, 236)
WHITE = (255, 255, 255)
INK = (90, 45, 60)

img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
# vertical gradient: pale pink -> near white
top = (255, 205, 226)
bot = (255, 246, 249)
for y in range(H):
    t = y / (H - 1)
    d.line([(0, y), (W, y)],
           fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))

# soft decorative circles
overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
for (x, y, r, a) in [(120, 300, 90, 40), (950, 500, 120, 35), (90, 1500, 110, 35),
                     (980, 1650, 90, 40), (880, 180, 60, 45), (180, 850, 55, 40),
                     (930, 1150, 70, 35), (140, 1150, 60, 30)]:
    od.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, a))
img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
d = ImageDraw.Draw(img)

def heart(draw, cx, cy, s, fill):
    # simple heart: two circles + triangle
    draw.ellipse([cx - s, cy - s * 0.7, cx, cy + s * 0.4], fill=fill)
    draw.ellipse([cx, cy - s * 0.7, cx + s, cy + s * 0.4], fill=fill)
    draw.polygon([(cx - s, cy), (cx + s, cy), (cx, cy + s * 1.1)], fill=fill)

# small hearts scattered
for (x, y, s) in [(95, 210, 22), (985, 250, 18), (80, 1750, 20), (1000, 1790, 22),
                  (900, 900, 14), (170, 950, 14)]:
    heart(d, x, y, s, (255, 170, 205))

# date at top
f_date = ImageFont.truetype(FONT_BOLD, 52)
tw = d.textlength(DATE, font=f_date)
d.text(((W - tw) / 2, 120), DATE, font=f_date, fill=PINK_DEEP)

# avatar in white circle with pink ring
av = Image.open(PIXEL_AVATAR).convert("RGBA")
# the pixel art is square 1080x1080; crop to the character if needed (use as-is)
AV = 700
av = av.resize((AV, AV), Image.LANCZOS)
mask = Image.new("L", (AV, AV), 0)
md = ImageDraw.Draw(mask)
md.ellipse([0, 0, AV, AV], fill=255)
ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
rd = ImageDraw.Draw(ring)
cx, cy = W // 2, 700
rd.ellipse([cx - AV // 2 - 14, cy - AV // 2 - 14, cx + AV // 2 + 14, cy + AV // 2 + 14],
           fill=(255, 255, 255, 255))
rd.ellipse([cx - AV // 2 - 6, cy - AV // 2 - 6, cx + AV // 2 + 6, cy + AV // 2 + 6],
           fill=(236, 110, 160, 255))
img = Image.alpha_composite(img.convert("RGBA"), ring)
img.paste(av, (cx - AV // 2, cy - AV // 2), mask)
d = ImageDraw.Draw(img)

# greeting
f_greet = ImageFont.truetype(FONT_BOLD, 118)
tw = d.textlength(GREETING, font=f_greet)
gx = (W - tw) / 2
d.text((gx, 1130), GREETING, font=f_greet, fill=PINK_DEEP)
heart(d, int(gx + tw + 55), 1215, 42, PINK_MID)

# weather card
f_body = ImageFont.truetype(FONT_REG, 62)
max_w = 840
# wrap by measured width
lines, cur = [], ""
for ch in WEATHER:
    if d.textlength(cur + ch, font=f_body) <= max_w:
        cur += ch
    else:
        lines.append(cur)
        cur = ch
if cur:
    lines.append(cur)
line_h = 92
card_h = 60 + line_h * len(lines) + 30
card_y = 1330
card_x0, card_x1 = 90, W - 90
card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(card)
cd.rounded_rectangle([card_x0, card_y, card_x1, card_y + card_h],
                     radius=48, fill=(255, 255, 255, 235),
                     outline=(255, 180, 210, 255), width=4)
img = Image.alpha_composite(img.convert("RGBA"), card)
d = ImageDraw.Draw(img)
y = card_y + 34
for ln in lines:
    lw = d.textlength(ln, font=f_body)
    d.text(((W - lw) / 2, y), ln, font=f_body, fill=INK)
    y += line_h

# signature
f_sig = ImageFont.truetype(FONT_BOLD, 48)
sig = "ここあ"
sw = d.textlength(sig, font=f_sig)
d.text(((W - sw) / 2, 1700), sig, font=f_sig, fill=PINK_MID)

img.convert("RGB").save(OUT, "JPEG", quality=92)
print("saved", OUT, img.size)
