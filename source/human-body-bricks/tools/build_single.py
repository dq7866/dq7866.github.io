#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 index.html + style.css + game.js + assets/body.glb 合成一个可直接双击打开的单文件。

用法：python tools/build_single.py
产物：人体积木.html（与源码目录同级）

模型以 base64 内嵌，双击打开（file://）也能看到真实解剖模型；
不内嵌时 file:// 无法 fetch 本地 glb，只会退回程序化造型。
"""
import base64
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMBED_LIMIT = 12 * 1024 * 1024  # 超过这个体积就不内嵌，避免 html 太大


def read(name):
    with io.open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return f.read()


html = read("index.html")
css = read("style.css")
js = read("game.js")

html = html.replace('<link rel="stylesheet" href="style.css" />', "<style>\n" + css + "\n</style>")
# 避免脚本内容里偶然出现的 </script> 提前结束标签
js = js.replace("</script", "<\\/script")

glb_path = os.path.join(ROOT, "assets", "body.glb")
embed = ""
if os.path.exists(glb_path) and os.path.getsize(glb_path) <= EMBED_LIMIT:
    with open(glb_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    embed = '<script>window.__HB_EMBEDDED_BODY__="%s";</script>\n' % b64
    print("嵌入模型 %.2f MB → base64 %.2f MB" % (os.path.getsize(glb_path) / 1048576, len(b64) / 1048576))
else:
    print("未内嵌模型（缺失或超过体积上限），单文件版将使用程序化造型")

# 日常人体模型（可选）：缺失时运行时回退程序化
daily_path = os.path.join(ROOT, "assets", "daily.glb")
if os.path.exists(daily_path) and os.path.getsize(daily_path) <= EMBED_LIMIT:
    with open(daily_path, "rb") as f:
        daily_b64 = base64.b64encode(f.read()).decode("ascii")
    embed += '<script>window.__HB_EMBEDDED_DAILY__="%s";</script>\n' % daily_b64
    print("嵌入日常模型 %.2f MB → base64 %.2f MB" % (os.path.getsize(daily_path) / 1048576, len(daily_b64) / 1048576))
else:
    print("未内嵌日常模型（缺失或超过体积上限），日常部位回退程序化造型")

# 赞赏收款码：单文件版也要能显示，直接内联成 data URI（否则 file:// 找不到 assets/）
qr_path = os.path.join(ROOT, "assets", "sponsor-qr.png")
if os.path.exists(qr_path):
    with open(qr_path, "rb") as f:
        qr_uri = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
    html = html.replace('src="assets/sponsor-qr.png"', 'src="%s"' % qr_uri)
    html = html.replace('href="assets/sponsor-qr.png"', 'href="%s"' % qr_uri)
    print("嵌入赞赏收款码 %.1f KB" % (os.path.getsize(qr_path) / 1024.0))
else:
    print("警告：缺少 assets/sponsor-qr.png，赞赏弹窗的二维码将无法显示")

html = html.replace('<script src="game.js"></script>', embed + "<script>\n" + js + "\n</script>")

out = os.path.join(ROOT, "人体积木.html")
with io.open(out, "w", encoding="utf-8") as f:
    f.write(html)

print("built:", out, "%.1f MB" % (os.path.getsize(out) / 1048576))
