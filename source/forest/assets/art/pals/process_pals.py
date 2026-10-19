# -*- coding: utf-8 -*-
"""forest 小动物资产处理：rembg 抠图 -> 紧凑裁边 -> 等比缩放 -> webp 输出"""
import os, sys
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = BASE

# (源目录, 输出名, 目标高度px)
JOBS = [
    ("gen-owl",      "owl.webp",      560),   # 吉祥物要大一些
    ("gen-butterfly","butterfly.webp", 360),
    ("gen-bee",      "bee.webp",       300),
    ("gen-fox",      "fox.webp",       420),
    ("gen-deer",     "deer.webp",      460),
    ("gen-rabbit",   "rabbit.webp",    380),
    ("gen-squirrel", "squirrel.webp",  400),
    ("gen-hedgehog", "hedgehog.webp",  340),
]

def process(src_dir, out_name, target_h):
    src = os.path.join(BASE, src_dir)
    files = [f for f in os.listdir(src) if f.lower().endswith((".png", ".jpg", ".webp"))]
    if not files:
        print(f"[SKIP] {src_dir}: 无图片"); return
    path = os.path.join(src, sorted(files)[-1])
    im = Image.open(path).convert("RGBA")

    # rembg 抠图（延迟导入，输出进度）
    from rembg import remove, new_session
    if not hasattr(process, "_sess"):
        process._sess = new_session("u2net")
    cut = remove(im, session=process._sess)

    # 紧凑裁边（alpha 阈值 8）
    a = cut.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    bbox = a.getbbox()
    if bbox:
        cut = cut.crop(bbox)

    # 等比缩放
    w, h = cut.size
    if h > target_h:
        cut = cut.resize((round(w * target_h / h), target_h), Image.LANCZOS)

    dst = os.path.join(OUT, out_name)
    cut.save(dst, "WEBP", quality=88)
    kb = os.path.getsize(dst) // 1024
    print(f"[OK] {src_dir} -> {out_name}  {cut.size[0]}x{cut.size[1]}  {kb}KB")

if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for src_dir, out_name, th in JOBS:
        if only and only not in src_dir:
            continue
        process(src_dir, out_name, th)
