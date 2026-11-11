#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建单文件版：把 HTML / CSS / JS / 图片全部内联成一个可双击运行的 .html

用法（在本文件所在目录执行）：
    python build_single.py

约定目录结构：
    包根/
      game/      index.html, css/, js/, assets/
      dist/      输出 自然培育所-单文件版.html
      tools/     本脚本
"""
import base64
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
PKG = HERE.parent
ROOT = PKG / "game"
OUT_DIR = PKG / "dist"

if not (ROOT / "index.html").exists():
    print("[错误] 找不到 game/index.html")
    print("       请保持目录结构：包根/game/ 与 包根/tools/ 同级")
    sys.exit(1)

OUT_DIR.mkdir(exist_ok=True)

html = (ROOT / "index.html").read_text(encoding="utf-8")

# 1) 内联 CSS
css_path = ROOT / "css" / "style.css"
if css_path.exists():
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        "<style>\n" + css_path.read_text(encoding="utf-8") + "\n</style>",
    )

# 2) 图片转 base64（webp），键名沿用去掉扩展名的文件名
amap = {}
asset_dir = ROOT / "assets"
if asset_dir.exists():
    for f in asset_dir.rglob("*.webp"):
        amap[f.stem] = "data:image/webp;base64," + base64.b64encode(f.read_bytes()).decode()
assets_js = "const ASSET_MAP = " + repr(amap).replace("'", '"') + ";"

# 3) 按 index.html 中 <script src> 的**实际顺序**拼接，新增的 js 文件不会漏
order = re.findall(r'<script src="js/([^"]+)"></script>', html)
missing = [n for n in order if not (ROOT / "js" / n).exists()]
if missing:
    print("[错误] index.html 引用了不存在的脚本：", ", ".join(missing))
    sys.exit(1)

js_parts = [assets_js]
for n in order:
    js_parts.append((ROOT / "js" / n).read_text(encoding="utf-8"))
js = "\n".join(js_parts)

html = re.sub(r'<script src="js/[^"]+"></script>', "", html)
html = html.replace("</body>", "<script>\n" + js + "\n</script>\n</body>")

out = OUT_DIR / "自然培育所-单文件版.html"
out.write_text(html, encoding="utf-8")

mb = out.stat().st_size / 1048576
print(f"[完成] {out}")
print(f"       体积 {mb:.1f} MB · 内联脚本 {len(order)} 个 · 内联图片 {len(amap)} 张")
print("       双击即可离线运行，无需服务器。")
