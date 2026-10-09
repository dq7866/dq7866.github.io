/* Markdown 编辑器 · 纯前端（marked 渲染 + DOMPurify 消毒） */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const KEY = "toolbox.md.content";
  const KEY_NAME = "toolbox.md.filename";

  const input = $("#mdInput");
  const preview = $("#mdPreview");
  const state = { fileName: null, loaded: "" };

  marked.setOptions({ gfm: true, breaks: false });

  function render() {
    const md = input.value;
    let html = "";
    try { html = marked.parse(md); } catch (e) { html = "<p>解析出错：" + e.message + "</p>"; }
    preview.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ["target", "checked", "disabled"] });
    const chars = md.length;
    const cjk = (md.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (md.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9_'-]+/g) || []).length + cjk;
    const lines = md ? md.split("\n").length : 0;
    $("#mdStat").textContent = `${chars} 字符 · ${words} 词 · ${lines} 行`;
    try {
      localStorage.setItem(KEY, md);
      if (state.fileName) localStorage.setItem(KEY_NAME, state.fileName);
      else localStorage.removeItem(KEY_NAME);
    } catch (e) {}
  }

  let t = null;
  function schedule() { clearTimeout(t); t = setTimeout(render, 120); }

  /* ---------- toolbar ---------- */
  function replaceRange(start, end, text, selStart, selEnd) {
    input.setRangeText(text, start, end, "end");
    input.focus();
    if (selStart != null) input.setSelectionRange(selStart, selEnd == null ? selStart : selEnd);
    render();
  }
  function surround(before, after, ph) {
    const s = input.selectionStart, e = input.selectionEnd;
    const sel = input.value.slice(s, e) || ph || "";
    replaceRange(s, e, before + sel + after, s + before.length, s + before.length + sel.length);
  }
  function prefixLines(prefix, numbered) {
    const v = input.value;
    let s = input.selectionStart, e = input.selectionEnd;
    const ls = v.lastIndexOf("\n", s - 1) + 1;
    let le = v.indexOf("\n", e); if (le === -1) le = v.length;
    const block = v.slice(ls, le);
    const out = block.split("\n").map((l, i) => prefix + (numbered ? i + 1 + ". " : "") + l).join("\n");
    replaceRange(ls, le, out, ls, ls + out.length);
  }
  function insertBlock(text) {
    const s = input.selectionStart, e = input.selectionEnd;
    const v = input.value;
    const needNl = s > 0 && v[s - 1] !== "\n";
    const t2 = (needNl ? "\n\n" : "") + text + "\n";
    replaceRange(s, e, t2, s + t2.length);
  }

  const ACTIONS = {
    h1: () => prefixLines("# "), h2: () => prefixLines("## "), h3: () => prefixLines("### "),
    bold: () => surround("**", "**", "粗体文字"),
    italic: () => surround("*", "*", "斜体文字"),
    strike: () => surround("~~", "~~", "删除线"),
    code: () => surround("`", "`", "code"),
    codeblock: () => surround("```\n", "\n```", "代码"),
    quote: () => prefixLines("> "),
    ul: () => prefixLines("- "),
    ol: () => prefixLines("", true),
    task: () => prefixLines("- [ ] "),
    link: () => surround("[", "](https://)", "链接文字"),
    image: () => surround("![", "](https://)", "图片说明"),
    table: () => insertBlock("| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |"),
    hr: () => insertBlock("---"),
  };

  $("#mdToolbar").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const fn = ACTIONS[b.dataset.md]; if (fn) fn();
  });

  input.addEventListener("input", schedule);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = input.selectionStart;
      replaceRange(s, input.selectionEnd, "  ", s + 2);
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); ACTIONS.bold(); }
      if (k === "i") { e.preventDefault(); ACTIONS.italic(); }
    }
  });

  /* ---------- scroll sync ---------- */
  let syncing = false;
  function sync(from, to) {
    if (syncing) return;
    syncing = true;
    const a = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
    to.scrollTop = a * Math.max(0, to.scrollHeight - to.clientHeight);
    setTimeout(() => (syncing = false), 40);
  }
  input.addEventListener("scroll", () => sync(input, preview));
  preview.addEventListener("scroll", () => sync(preview, input));

  /* ---------- export ---------- */
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const HTML_CSS = `body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;line-height:1.7;color:#16150f;max-width:820px;margin:40px auto;padding:0 20px}
h1,h2,h3,h4{line-height:1.25;letter-spacing:-.02em}h1{font-size:1.8em;border-bottom:1px solid #e4e0d6;padding-bottom:.25em}
h2{font-size:1.4em;border-bottom:1px solid #e4e0d6;padding-bottom:.2em}
a{color:#ff4d00}code{font-family:ui-monospace,Consolas,monospace;font-size:.9em;background:#f0eee8;padding:.15em .4em;border-radius:5px}
pre{background:#f0eee8;border-radius:10px;padding:14px;overflow:auto}pre code{background:none;padding:0}
blockquote{border-left:3px solid #ff4d00;margin:1em 0;padding:.2em 1em;color:#6d6a61;background:#faf9f6}
table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #e4e0d6;padding:8px 12px;text-align:left}
th{background:#f0eee8}img{max-width:100%}hr{border:0;border-top:1px solid #e4e0d6;margin:1.4em 0}`;

  /* ---------- 导出样式（PDF / Word 通用基础样式） ---------- */
  const EXPORT_CSS = `
body {
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif;
  font-size: 12pt;
  line-height: 1.7;
  color: #1a1a1a;
  margin: 0;
  padding: 0;
  word-wrap: break-word;
}
h1, h2, h3, h4, h5, h6 {
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.2em;
  margin-bottom: 0.6em;
  page-break-after: avoid;
}
h1 { font-size: 22pt; border-bottom: 2px solid #e4e0d6; padding-bottom: 0.3em; }
h2 { font-size: 18pt; border-bottom: 1px solid #e4e0d6; padding-bottom: 0.25em; }
h3 { font-size: 15pt; }
h4 { font-size: 13pt; }
p { margin: 0.8em 0; }
a { color: #ff4d00; text-decoration: none; }
strong { font-weight: 700; }
em { font-style: italic; }
del { text-decoration: line-through; color: #999; }
code {
  font-family: "Consolas", "Monaco", "Courier New", ui-monospace, monospace;
  font-size: 10.5pt;
  background: #f5f5f0;
  padding: 2px 6px;
  border-radius: 4px;
  color: #c7254e;
}
pre {
  font-family: "Consolas", "Monaco", "Courier New", ui-monospace, monospace;
  font-size: 10.5pt;
  background: #f5f5f0;
  border: 1px solid #e4e0d6;
  border-radius: 6px;
  padding: 12px 14px;
  margin: 1em 0;
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  page-break-inside: avoid;
}
pre code {
  background: none;
  padding: 0;
  color: #1a1a1a;
  border-radius: 0;
}
blockquote {
  border-left: 4px solid #ff4d00;
  margin: 1em 0;
  padding: 0.4em 1em 0.4em 1em;
  color: #6d6a61;
  background: #faf9f6;
  font-style: italic;
  page-break-inside: avoid;
}
blockquote p { margin: 0.4em 0; }
ul, ol { margin: 0.8em 0; padding-left: 2em; }
li { margin: 0.3em 0; }
li > ul, li > ol { margin: 0.3em 0; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 11pt;
  page-break-inside: avoid;
}
th, td {
  border: 1px solid #d4d0c6;
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
}
th {
  background: #f0eee8;
  font-weight: 700;
}
tr:nth-child(even) td { background: #faf9f6; }
img {
  max-width: 100%;
  height: auto;
  page-break-inside: avoid;
}
hr {
  border: 0;
  border-top: 1px solid #e4e0d6;
  margin: 1.5em 0;
}
input[type="checkbox"] { margin-right: 6px; }
.task-list-item { list-style: none; margin-left: -1.2em; }
`;

  /* ---------- PDF 打印专用样式 ---------- */
  const PRINT_CSS = EXPORT_CSS + `
@page {
  size: A4;
  margin: 2cm 2cm 2.5cm 2cm;
  @bottom-center {
    content: "第 " counter(page) " 页";
    font-size: 9pt;
    color: #888;
  }
}
@media print {
  body {
    font-size: 11pt;
  }
  .export-header {
    display: none;
  }
  pre, blockquote, table, img {
    page-break-inside: avoid;
  }
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
  }
  p {
    orphans: 3;
    widows: 3;
  }
}
`;

  /* ---------- Word 专用样式（兼容 Word 的 mso 样式） ---------- */
  const WORD_CSS = `
body {
  font-family: "Microsoft YaHei", "PingFang SC", -apple-system, sans-serif;
  font-size: 12pt;
  line-height: 1.7;
  color: #1a1a1a;
}
h1 { font-size: 22pt; font-weight: bold; margin: 24pt 0 12pt 0; border-bottom: 2px solid #e4e0d6; padding-bottom: 6pt; }
h2 { font-size: 18pt; font-weight: bold; margin: 20pt 0 10pt 0; border-bottom: 1px solid #e4e0d6; padding-bottom: 4pt; }
h3 { font-size: 15pt; font-weight: bold; margin: 16pt 0 8pt 0; }
h4 { font-size: 13pt; font-weight: bold; margin: 14pt 0 6pt 0; }
p { margin: 8pt 0; }
a { color: #ff4d00; text-decoration: none; }
strong { font-weight: bold; }
em { font-style: italic; }
del { text-decoration: line-through; color: #999; }
code {
  font-family: "Consolas", "Courier New", monospace;
  font-size: 10.5pt;
  background: #f5f5f0;
  padding: 2px 6px;
  border-radius: 4px;
  color: #c7254e;
}
pre {
  font-family: "Consolas", "Courier New", monospace;
  font-size: 10.5pt;
  background: #f5f5f0;
  border: 1px solid #e4e0d6;
  padding: 12px 14px;
  margin: 12pt 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}
pre code { background: none; padding: 0; color: #1a1a1a; }
blockquote {
  border-left: 4px solid #ff4d00;
  margin: 12pt 0;
  padding: 6pt 12pt 6pt 12pt;
  color: #6d6a61;
  background: #faf9f6;
  font-style: italic;
}
blockquote p { margin: 4pt 0; }
ul, ol { margin: 8pt 0; padding-left: 28pt; }
li { margin: 4pt 0; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 12pt 0;
  font-size: 11pt;
  mso-table-lspace: 0pt;
  mso-table-rspace: 0pt;
}
th, td {
  border: 1px solid #d4d0c6;
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  mso-border-alt: solid #d4d0c6 .5pt;
}
th {
  background: #f0eee8;
  font-weight: bold;
}
img {
  max-width: 100%;
  height: auto;
}
hr {
  border: 0;
  border-top: 1px solid #e4e0d6;
  margin: 18pt 0;
}
`;

  function buildHtml() {
    let html = "";
    try {
      html = DOMPurify.sanitize(marked.parse(input.value));
    } catch (e) {
      html = "<p>导出失败：" + e.message + "</p>";
    }
    const m = input.value.match(/^\s*#\s+(.+)$/m);
    const title = m ? m[1] : "Markdown 文档";
    return `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title.replace(/[<>]/g, "")}</title>\n<style>${HTML_CSS}</style>\n</head>\n<body>\n${html}\n</body>\n</html>`;
  }

  /* ---------- 获取导出文件名（基于第一个标题或文件名） ---------- */
  function getExportTitle() {
    const m = input.value.match(/^\s*#\s+(.+)$/m);
    if (m) return m[1].replace(/[<>:"/\\|?*]/g, "").trim();
    if (state.fileName) return state.fileName.replace(/\.(md|markdown|txt)$/i, "");
    return "markdown-export";
  }

  /* ---------- 获取渲染后的 HTML 内容（body 部分） ---------- */
  function getRenderedHtml() {
    try {
      return DOMPurify.sanitize(marked.parse(input.value));
    } catch (e) {
      return "<p>导出失败：" + e.message + "</p>";
    }
  }

  /* ---------- 将图片转换为 base64（用于 Word 嵌入） ---------- */
  async function embedImages(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const imgs = tmp.querySelectorAll("img");
    for (const img of imgs) {
      const src = img.getAttribute("src") || "";
      if (src.startsWith("data:")) continue;
      if (src.startsWith("http://") || src.startsWith("https://")) {
        try {
          const resp = await fetch(src);
          const blob = await resp.blob();
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          img.setAttribute("src", dataUrl);
        } catch (e) {
          // 保持原 URL，Word 可能无法显示
        }
      }
    }
    return tmp.innerHTML;
  }

  /* ---------- PDF 导出 ---------- */
  function exportPDF() {
    const content = getRenderedHtml();
    const title = getExportTitle();

    // 创建新窗口用于打印
    const printWin = window.open("", "_blank", "width=900,height=700");
    if (!printWin) {
      alert("无法打开打印窗口，请检查浏览器的弹窗拦截设置。");
      return;
    }

    const printDoc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${title.replace(/[<>]/g, "")}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
${content}
</body>
</html>`;

    printWin.document.open();
    printWin.document.write(printDoc);
    printWin.document.close();

    // 等待资源加载完成后触发打印
    function triggerPrint() {
      try {
        printWin.focus();
        printWin.print();
      } catch (e) {
      }
    }

    // 图片加载检测
    const imgs = printWin.document.images;
    let loadedCount = 0;
    let totalImgs = imgs.length;

    if (totalImgs === 0) {
      // 无图片，稍等样式渲染后打印
      setTimeout(triggerPrint, 300);
    } else {
      // 等待所有图片加载
      for (let i = 0; i < totalImgs; i++) {
        if (imgs[i].complete) {
          loadedCount++;
        } else {
          imgs[i].onload = imgs[i].onerror = function () {
            loadedCount++;
            if (loadedCount >= totalImgs) {
              setTimeout(triggerPrint, 200);
            }
          };
        }
      }
      // 全部已加载
      if (loadedCount >= totalImgs) {
        setTimeout(triggerPrint, 200);
      }
      // 超时保护，最多等 8 秒
      setTimeout(triggerPrint, 8000);
    }
  }

  /* ---------- Word 导出 ---------- */
  async function exportWord() {
    const btn = $("#dlWord");
    const originalText = btn ? btn.textContent : "";
    if (btn) { btn.textContent = "导出中…"; btn.disabled = true; }

    try {
      let content = getRenderedHtml();
      // 尝试嵌入图片为 base64
      try {
        content = await embedImages(content);
      } catch (e) {
        // 图片嵌入失败，保留原链接
      }

      const title = getExportTitle();

      // Word 兼容的 HTML 格式
      const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>${title.replace(/[<>]/g, "")}</title>
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml>
<![endif]-->
<style>
${WORD_CSS}
</style>
</head>
<body>
${content}
</body>
</html>`;

      // 使用 BOM 确保 UTF-8 编码正确
      const blob = new Blob(["\ufeff", wordHtml], { type: "application/msword;charset=utf-8" });
      download(title + ".doc", blob);
    } catch (e) {
      alert("Word 导出失败：" + (e.message || e));
    } finally {
      if (btn) {
        setTimeout(() => {
          btn.textContent = originalText || "导出 Word";
          btn.disabled = false;
        }, 1000);
      }
    }
  }

  /* ---------- 动态添加导出按钮 ---------- */
  function addExportButtons() {
    const btnRow = document.querySelector(".btn-row.no-print");
    if (!btnRow) return;

    // 在"复制 HTML"按钮后面插入 PDF 和 Word 导出按钮
    const copyBtn = $("#copyHtml");
    const spacer = btnRow.querySelector(".spacer");

    // 创建 PDF 导出按钮
    const pdfBtn = document.createElement("button");
    pdfBtn.className = "btn";
    pdfBtn.id = "dlPdf";
    pdfBtn.textContent = "导出 PDF";
    pdfBtn.onclick = exportPDF;

    // 创建 Word 导出按钮
    const wordBtn = document.createElement("button");
    wordBtn.className = "btn";
    wordBtn.id = "dlWord";
    wordBtn.textContent = "导出 Word";
    wordBtn.onclick = exportWord;

    // 插入到 spacer 前面（导出区域末尾）
    if (spacer) {
      btnRow.insertBefore(wordBtn, spacer);
      btnRow.insertBefore(pdfBtn, spacer);
    } else if (copyBtn && copyBtn.nextSibling) {
      btnRow.insertBefore(pdfBtn, copyBtn.nextSibling);
      btnRow.insertBefore(wordBtn, pdfBtn.nextSibling);
    } else {
      btnRow.appendChild(pdfBtn);
      btnRow.appendChild(wordBtn);
    }
  }

  $("#dlMd").onclick = () => {
    download(baseNameOf() + ".md", new Blob([input.value], { type: "text/markdown;charset=utf-8" }));
    state.loaded = input.value; updateFileInfo();
  };
  $("#dlHtml").onclick = () => download(baseNameOf() + ".html", new Blob([buildHtml()], { type: "text/html;charset=utf-8" }));
  $("#copyHtml").onclick = async (e) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(buildHtml());
        e.target.textContent = "已复制";
        setTimeout(() => (e.target.textContent = "复制 HTML"), 1200);
      } else {
        // 降级：使用 textarea + execCommand
        const ta = document.createElement("textarea");
        ta.value = buildHtml();
        ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select();
        try {
          document.execCommand("copy");
          e.target.textContent = "已复制";
          setTimeout(() => (e.target.textContent = "复制 HTML"), 1200);
        } catch (err) {
          alert("复制失败，请手动复制。");
        }
        document.body.removeChild(ta);
      }
    } catch (err) { alert("复制失败：" + (err && err.message ? err.message : err)); }
  };
  // 替换原有打印按钮为增强版 PDF 导出
  const printBtn = $("#printBtn");
  if (printBtn) {
    printBtn.textContent = "打印 / 存 PDF";
    printBtn.onclick = exportPDF;
  }
  $("#clearBtn").onclick = () => {
    if (!input.value || confirmDiscard()) { input.value = ""; state.loaded = ""; render(); updateFileInfo(); }
  };
  $("#sampleBtn").onclick = () => {
    if (!confirmDiscard()) return;
    state.fileName = null;
    input.value = SAMPLE;
    state.loaded = SAMPLE;
    render(); updateFileInfo();
  };

  const SAMPLE = `# 免费工具箱 · Markdown 示例

这是一个 **纯前端** 的 Markdown 编辑器，左边写、右边实时预览。

## 支持语法

- 列表、**粗体**、*斜体*、~~删除线~~
- [链接](https://example.com) 与 \`行内代码\`
- 引用、表格、任务清单

> 引用：所有内容只在本地处理，不会上传。

### 表格

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 实时预览 | ✅ | marked 渲染 |
| 安全过滤 | ✅ | DOMPurify 消毒 |
| 导出 HTML | ✅ | 自带样式 |
| 导出 PDF | ✅ | 浏览器打印 |
| 导出 Word | ✅ | .doc 格式 |

### 任务清单

- [x] 写 Markdown
- [x] 导出为 PDF
- [x] 导出为 Word

\`\`\`js
\`\`\`

---

祝使用愉快 🎉`;

  /* ---------- 打开 / 新建 / 拖放 ---------- */
  const baseNameOf = () => (state.fileName ? state.fileName.replace(/\.(md|markdown|txt)$/i, "") : "document");
  const isDirty = () => input.value !== state.loaded;
  const confirmDiscard = () => !isDirty() || confirm("当前内容尚未保存，确定继续吗？（未保存的修改会丢失）");
  function updateFileInfo() {
    const el = $("#mdFileInfo");
    if (!el) return;
    const chars = input.value.length;
    el.innerHTML = state.fileName
      ? `已打开：<b>${state.fileName.replace(/[<>]/g, "")}</b> · ${chars} 字符`
      : `未打开文件（草稿） · ${chars} 字符`;
  }
  async function openFile(file) {
    if (!file) return;
    const okExt = /\.(md|markdown|txt|text)$/i.test(file.name) || (file.type || "").indexOf("text/") === 0;
    if (!okExt) { alert("请选择 .md / .markdown / .txt 文本文件。"); return; }
    if (!confirmDiscard()) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    let text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (text.indexOf("\uFFFD") >= 0) {
      try { text = new TextDecoder("gbk").decode(buf); } catch (e) { /* 忽略 */ }
    }
    text = text.replace(/^\uFEFF/, "");
    state.fileName = file.name;
    input.value = text;
    state.loaded = text;
    render();
    updateFileInfo();
    input.scrollTop = 0; preview.scrollTop = 0;
  }

  $("#openMd").onclick = () => $("#mdFile").click();
  $("#mdFile").addEventListener("change", (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ""; });
  $("#newMd").onclick = () => {
    if (!confirmDiscard()) return;
    state.fileName = null; input.value = ""; state.loaded = "";
    render(); updateFileInfo(); input.focus();
  };

  // 页面任意位置拖入文件即导入
  ["dragenter", "dragover"].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      const dt = e.dataTransfer;
      if (dt && Array.from(dt.types || []).indexOf("Files") >= 0) { e.preventDefault(); document.body.classList.add("dropping"); }
    })
  );
  ["dragleave", "dragend"].forEach((ev) => document.addEventListener(ev, () => document.body.classList.remove("dropping")));
  document.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    document.body.classList.remove("dropping");
    if (!f) return;
    e.preventDefault();
    openFile(f);
  });

  /* ---------- init ---------- */
  let saved = null, savedName = null;
  try { saved = localStorage.getItem(KEY); savedName = localStorage.getItem(KEY_NAME); } catch (e) {}
  if (saved !== null) { input.value = saved; state.fileName = savedName || null; }
  else { input.value = SAMPLE; state.fileName = null; }
  state.loaded = input.value;
  render();
  updateFileInfo();

  // 动态添加导出按钮
  addExportButtons();
})();
