# -*- coding: utf-8 -*-
"""把 AI 生成的世界素材加工成游戏可用资源：
   - 背景图：裁掉底部水印 → 压缩为 jpg
   - 角色图：rembg 抠图 → 裁边 → webp 透明底
"""
import os, io, sys
from PIL import Image
from rembg import remove, new_session

SRC = "assets/art/world"
OUT = "assets/art/world"
session = new_session("u2net")

def cut_watermark(im):
    """背景图右下角有 AI 生成水印：裁掉底部约 7%"""
    w, h = im.size
    return im.crop((0, 0, w, int(h * 0.93)))

def trim(im, tol=8):
    """裁掉四周的透明边"""
    a = im.getchannel("A")
    bbox = a.getbbox()
    if bbox:
        # 留 6px 余量
        x0, y0, x1, y1 = bbox
        x0 = max(0, x0 - 6); y0 = max(0, y0 - 6)
        x1 = min(im.width, x1 + 6); y1 = min(im.height, y1 + 6)
        im = im.crop((x0, y0, x1, y1))
    return im

# ---- 背景：去水印 + 压缩 ----
bg_map = {
    "儿童绘本水彩插画风格_横向宽幅全景草原_轻微俯视视角_远处层_2026-10-19T10-18-39.png": "grass-bg.jpg",
    "儿童绘本水彩插画风格_横向宽幅_巷口小商店室内_轻微俯视视角_2026-10-19T10-19-24.png": "shop-bg.jpg",
}
for src, dst in bg_map.items():
    p = os.path.join(SRC, src)
    im = Image.open(p).convert("RGB")
    im = cut_watermark(im)
    im.thumbnail((1600, 1600), Image.LANCZOS)
    out = os.path.join(OUT, dst)
    im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
    print(dst, im.size, os.path.getsize(out) // 1024, "KB")

# ---- 角色：抠图 + 裁边 + webp ----
ch_map = {
    "一个慈祥的牧羊爷爷角色立绘_儿童绘本水彩插画风格_全身像_正_2026-10-19T10-19-14.png": "npc-shepherd.webp",
    "一个和蔼的小商店老板娘角色立绘_儿童绘本水彩插画风格_全身像_2026-10-19T10-19-44.png": "npc-shopkeep.webp",
    "五只可爱的白色卡通绵羊群_儿童绘本水彩插画风格_在短草地上低_2026-10-19T10-19-49.png": "sheep-group.webp",
}
for src, dst in ch_map.items():
    p = os.path.join(SRC, src)
    im = Image.open(p).convert("RGBA")
    # 先裁到非白区域（角色图周围有大片白）
    im = trim(im)
    out_im = remove(im, session=session)
    out_im = trim(out_im)
    # 限制高度
    if out_im.height > 720:
        r = 720 / out_im.height
        out_im = out_im.resize((int(out_im.width * r), 720), Image.LANCZOS)
    out = os.path.join(OUT, dst)
    out_im.save(out, "WEBP", quality=88, method=4)
    print(dst, out_im.size, os.path.getsize(out) // 1024, "KB")

print("done")
