#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 src/ 内联成单文件 QiaoSan.html

用法：
    python tools/build_single.py
"""
import pathlib
import base64
import re
import sys

PKG = pathlib.Path(__file__).resolve().parent.parent
SRC = PKG / "src"
OUT = PKG / "QiaoSan.html"

if not (SRC / "index.html").exists():
    print("[错误] 找不到 src/index.html")
    sys.exit(1)

html = (SRC / "index.html").read_text(encoding="utf-8")
css_path = SRC / "styles.css"
if not css_path.exists():
    print("[错误] 找不到 src/styles.css")
    sys.exit(1)

html = html.replace(
    '<link rel="stylesheet" href="styles.css">',
    "<style>\n" + css_path.read_text(encoding="utf-8") + "\n</style>",
)

scripts = re.findall(r'<script src="([^"]+)"></script>', html)
missing = [name for name in scripts if not (SRC / name).exists()]
if missing:
    print("[错误] 引用了不存在的脚本：", ", ".join(missing))
    sys.exit(1)

for name in scripts:
    code = (SRC / name).read_text(encoding="utf-8").replace("</script", "<\\/script")
    html = html.replace(
        '<script src="%s"></script>' % name,
        "<script>\n" + code + "\n</script>",
    )

# 图鉴素材内联成 data URI（单文件也能离线看图鉴）
inlined = [0]
def _inline_asset(m):
    q = SRC / m.group(1)
    if not q.exists():
        return m.group(0)
    b64 = base64.b64encode(q.read_bytes()).decode("ascii")
    inlined[0] += 1
    return chr(34) + "data:image/webp;base64," + b64 + chr(34)
html = re.sub(r'"(assets/gallery/[a-z0-9-]+\.webp)"', _inline_asset, html)

OUT.write_text(html, encoding="utf-8")
print(f"[完成] {OUT}")
print(f"       体积 {OUT.stat().st_size / 1024:.1f} KB · 内联脚本 {len(scripts)} 个")
