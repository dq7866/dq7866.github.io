# -*- coding: utf-8 -*-
"""把「原型/」打包成一个可离线双击运行的单文件 HTML。

内联：style.css、profiles.js、game.js、app-addons.js、赞助收款码（data URI）。
保留：og-cover.png 作为同目录 assets/ 下的独立文件（社交平台需要真实 URL）。

用法：python 构建脚本/build_single.py   （在「地球拼图-自然地理版」目录下运行）
"""
import base64
import io
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '原型')
OUT_DIR = os.path.join(ROOT, '发布')
OUT = os.path.join(OUT_DIR, '地球仪拼图-v2.5.0.html')


def read(p):
    return io.open(p, encoding='utf-8').read()


def guard(script, name):
    """内联脚本里不允许出现 </script 字面量，否则会提前截断 <script>。"""
    low = script.lower()
    if '</script' in low:
        raise SystemExit('%s 含 </script 字面量，需要先转义再内联' % name)
    return script


def main():
    html = read(os.path.join(SRC, 'index.html'))
    css = read(os.path.join(SRC, 'style.css'))
    scripts = {n: guard(read(os.path.join(SRC, n)), n)
               for n in ('profiles.js', 'game.js', 'app-addons.js')}

    qr_path = os.path.join(SRC, 'assets', 'sponsor-qr.png')
    with open(qr_path, 'rb') as f:
        qr_uri = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

    # 1) 样式
    pat = re.compile(r'<link rel="stylesheet" href="style\.css">')
    if len(pat.findall(html)) != 1:
        raise SystemExit('定位 style.css 引用失败')
    # 用 lambda 返回字面替换串：re.sub 会把替换文本里的 \w、\d 等当成转义序列。
    css_repl = '<style>\n' + css + '\n</style>'
    html = pat.sub(lambda m, r=css_repl: r, html, count=1)

    # 2) 脚本（按页面里的顺序逐个内联）
    for name in ('profiles.js', 'game.js', 'app-addons.js'):
        pat = re.compile(r'<script src="%s"></script>' % re.escape(name))
        if len(pat.findall(html)) != 1:
            raise SystemExit('定位 %s 引用失败' % name)
        repl = '<script>\n' + scripts[name] + '\n</script>'
        html = pat.sub(lambda m, r=repl: r, html, count=1)

    # 3) 收款码（页面里只有一处 <img src="assets/sponsor-qr.png">）
    if html.count('src="assets/sponsor-qr.png"') != 1:
        raise SystemExit('定位收款码引用失败')
    html = html.replace('src="assets/sponsor-qr.png"', 'src="' + qr_uri + '"')

    # 4) 单文件标记：便于发布门禁识别构建形态
    html = html.replace('<html lang="zh-CN" data-theme="deep">',
                        '<html lang="zh-CN" data-theme="deep" data-single="1">', 1)

    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)
    io.open(OUT, 'w', encoding='utf-8').write(html)

    cover_src = os.path.join(SRC, 'assets', 'og-cover.png')
    cover_dir = os.path.join(OUT_DIR, 'assets')
    if not os.path.isdir(cover_dir):
        os.makedirs(cover_dir)
    shutil.copyfile(cover_src, os.path.join(cover_dir, 'og-cover.png'))

    # 自检：所有外部脚本 / 样式引用都已消失，二维码与版本仍在
    assert '<script src=' not in html, '仍有外部脚本引用'
    assert 'rel="stylesheet" href="style.css"' not in html, '仍有外部样式引用'
    assert 'data:image/png;base64,' in html, '收款码未内联'
    assert '2.5.0-nature' in html, '版本号缺失'
    assert html.count('<script>') >= 4, '内联脚本数量异常'
    print('单文件版：%s  %.2f MB' % (OUT, os.path.getsize(OUT) / 1048576.0))
    print('分享封面：%s' % os.path.join(cover_dir, 'og-cover.png'))


if __name__ == '__main__':
    main()
