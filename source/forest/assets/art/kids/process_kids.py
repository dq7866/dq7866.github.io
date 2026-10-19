# -*- coding: utf-8 -*-
"""forest 小孩数字人处理：rembg 抠图 -> 裁边 -> 缩放 -> webp"""
import os, sys
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
JOBS = [
    ("gen-girl-wave",    "girl-wave.webp",    520),
    ("gen-girl-cheer",   "girl-cheer.webp",   520),
    ("gen-girl-think",   "girl-think.webp",   520),
    ("gen-girl-mischief","girl-mischief.webp",520),
    ("gen-boy-wave",     "boy-wave.webp",     520),
    ("gen-boy-cheer",    "boy-cheer.webp",    520),
    ("gen-boy-think",    "boy-think.webp",    520),
    ("gen-boy-mischief", "boy-mischief.webp", 520),
    ("gen-girl-listen",  "girl-listen.webp",  520),
    ("gen-girl-point",   "girl-point.webp",   520),
    ("gen-boy-listen",   "boy-listen.webp",   520),
    ("gen-boy-point",    "boy-point.webp",    520),
]

def process(src_dir, out_name, target_h):
    src = os.path.join(BASE, src_dir)
    files = [f for f in os.listdir(src) if f.lower().endswith((".png", ".jpg", ".webp"))]
    if not files:
        print(f"[SKIP] {src_dir}"); return
    im = Image.open(os.path.join(src, sorted(files)[-1])).convert("RGBA")
    from rembg import remove, new_session
    if not hasattr(process, "_sess"):
        process._sess = new_session("u2net")
    cut = remove(im, session=process._sess)
    a = cut.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    bbox = a.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    w, h = cut.size
    if h > target_h:
        cut = cut.resize((round(w * target_h / h), target_h), Image.LANCZOS)
    dst = os.path.join(BASE, out_name)
    cut.save(dst, "WEBP", quality=88)
    print(f"[OK] {out_name} {cut.size[0]}x{cut.size[1]} {os.path.getsize(dst)//1024}KB")

if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for d, n, th in JOBS:
        if only and only not in d:
            continue
        process(d, n, th)
