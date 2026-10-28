# -*- coding: utf-8 -*-
"""把 doodle.html 的「创意涂鸦工坊」完整同步到 index.html（CSS + HTML + JS 三段）。

背景：
  - doodle.html 是涂画工坊的独立开发副本（单页，只有涂画）
  - index.html 是 Hexo 站点主文件，涂画只是其中一个 screen
  - 两者的涂画模块必须保持一致，否则 JS 会找不到 HTML 元素（bindEvents 崩溃）

同步采用「整段替换」而非逐行 diff，避免遗漏。
用法：python tools/sync_doodle.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "doodle.html")
DST = os.path.join(ROOT, "index.html")

CSS_MARK = "/* ==== 涂画工坊样式（由 doodle.html 同步） ==== */"

# 站点版适配：doodle.html 是独立单页，.screen 直接铺满；
# 同步进多屏站点后，涂画屏要给顶部导航栏让出位置。
SITE_ADAPT = """
/* ---- 站点版涂画屏适配（多屏站点要给顶栏留位，画布要撑满） ---- */
body #screen-doodle.screen{
  padding:calc(var(--tb-h,156px) + 1.2vh) 10px 8px !important;
  overflow:hidden !important;
}
body #screen-doodle .dg-wrap{max-width:none !important;width:100% !important;}
"""


def doodle_css(text):
    """doodle.html 里含 .dg- 的 <style> 块正文（不含标签）"""
    for m in re.finditer(r"<style[^>]*>(.*?)</style>", text, re.S):
        if ".dg-" in m.group(1):
            return m.group(1)
    return None


def doodle_html_span(text):
    """<section class="screen" id="screen-doodle"> ... </section> 的范围"""
    a = text.index('<section class="screen" id="screen-doodle">')
    b = text.index("</section>", a) + len("</section>")
    return a, b


def doodle_js_span(text):
    """const Doodle = (() => { ... })(); 的范围。

    不能用「找 render: render, 之后的第一个 })();」——return 对象内部也含这个串。
    也不能用「找 "  return {"」——函数内部的 return 也会匹配。
    正确做法：从 IIFE 的起始花括号做配对计数（跳过字符串与注释），
    找到与它配对的 "}"，其后紧跟的 "})();" 就是模块结尾。
    """
    a = text.index("const Doodle = (() => {")
    # 定位 IIFE 体的起始 "{"
    i = text.index("{", a + len("const Doodle = (() => "))
    depth = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            i = text.find("\n", i)
            if i < 0:
                break
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            i = (j + 2) if j > 0 else n
            continue
        if ch in "\"'`":
            quote = ch
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    break
                i += 1
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                # 找到配对的 "}"，其后应是 "})();"
                j = text.find("})();", i)
                if j < 0:
                    raise SystemExit("!! 找不到 Doodle IIFE 的结尾")
                return a, j + len("})();")
        i += 1
    raise SystemExit("!! 找不到 Doodle IIFE 的结尾")
    return a, b


def _js_syntax_ok(js):
    """用 node --check 过一遍提取出来的 JS；没装 node 就返回 None（跳过检查）。

    为什么需要：doodle_js_span() 是手写的花括号配对器，只认字符串不认正则字面量，
    一旦代码里出现 /"/ 这类正则，扫描器会把引号当成字符串开头 → 区间被截断 →
    同步出去的就是半截 JS（页面整个白掉，而且很难看出是同步的锅）。
    有了这道闸，截断会当场报错、不会写进 index.html。
    """
    import shutil, subprocess, tempfile
    node = shutil.which("node")
    if not node:
        return None
    fd, path = tempfile.mkstemp(suffix=".js")
    os.close(fd)
    try:
        io.open(path, "w", encoding="utf-8", newline="").write(js)
        r = subprocess.run([node, "--check", path], capture_output=True)
        return (r.returncode == 0, (r.stderr or b"").decode("utf-8", "ignore")[:600])
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def main():
    if not (os.path.exists(SRC) and os.path.exists(DST)):
        print("!! 找不到 doodle.html / index.html，中止", file=sys.stderr)
        return 1

    # 用 newline="" 保留原始换行符（doodle.html 是 CRLF，index.html 是 LF；
    # 若用默认的通用换行转换，CRLF 会被读成 LF，导致反复同步时内容不断变化）
    src = io.open(SRC, encoding="utf-8", newline="").read()
    dst = io.open(DST, encoding="utf-8", newline="").read()
    # 目标文件用哪种换行，就统一用哪种
    nl = "\r\n" if "\r\n" in dst else "\n"

    css = doodle_css(src)
    if not css:
        print("!! doodle.html 里找不到涂画 CSS，中止", file=sys.stderr)
        return 1

    # ---- 1) JS ----
    # 同步 IIFE 模块本体 + 其后紧随的 window.Doodle 暴露代码（doodle.html 里已有）
    EXPOSE_RE = r"(?:[ \t]*\r?\n)*(?:/\* [^\n]*\*/\r?\n)?try \{ window\.Doodle = Doodle; \}[^\n]*\r?\n"
    ja, jb = doodle_js_span(src)
    jseg = src[ja:jb]
    m = re.match(EXPOSE_RE, src[jb:])
    if m:
        jseg = jseg + m.group(0)
    chk = _js_syntax_ok(jseg)
    if chk is not None and not chk[0]:
        print("!! 提取出来的 JS 语法不对，疑似区间被截断（正则字面量里带引号会把扫描器带偏），已中止，index.html 未改动", file=sys.stderr)
        print(chk[1], file=sys.stderr)
        return 1

    ia, ib = doodle_js_span(dst)
    # 目标文件里旧的模块 + 暴露代码，整段换掉
    md = re.match(EXPOSE_RE, dst[ib:])
    if md:
        ib = ib + md.end()
    dst = dst[:ia] + jseg + dst[ib:]

    # ---- 2) HTML ----
    ha, hb = doodle_html_span(src)
    hseg = src[ha:hb]
    xa, xb = doodle_html_span(dst)
    dst = dst[:xa] + hseg + dst[xb:]
    # ---- 3) CSS：追加到 index 最后一个 style 块（可重复执行，先清旧的再追加）----
    styles = list(re.finditer(r"<style[^>]*>.*?</style>", dst, re.S))
    last = styles[-1]
    block = last.group(0)
    if CSS_MARK in block:
        # 已同步过：把旧的一段（含标记）整段替换掉，再写新的
        start = block.index(CSS_MARK)
        end = block.index("</style>", start)
        new_block = block[:start] + CSS_MARK + nl + css + nl + SITE_ADAPT + nl + block[end:]
    else:
        new_block = block.replace("</style>", nl + CSS_MARK + nl + css + nl + SITE_ADAPT + nl + "</style>")
    dst = dst[: last.start()] + new_block + dst[last.end() :]

    # 统一换行：把从 doodle.html 带进来的 CRLF 全部转成目标文件的换行符，
    # 否则反复同步会让内容不断变化（不幂等）
    if nl == "\n":
        dst = dst.replace("\r\n", "\n")
    else:
        dst = dst.replace("\r\n", "\n").replace("\n", "\r\n")

    io.open(DST, "w", encoding="utf-8", newline="").write(dst)
    print("ok  已同步 index.html：CSS + HTML + JS 三段")
    print("    JS   %d 字符" % len(jseg))
    print("    HTML %d 字符" % len(hseg))
    print("    CSS  %d 字符" % len(css))
    return 0


if __name__ == "__main__":
    sys.exit(main())
