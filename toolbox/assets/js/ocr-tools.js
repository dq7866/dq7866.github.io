/* ============================================================
   免费工具箱 · OCR 文字识别（本地 RapidOCR）
   ============================================================ */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const SVC = "http://127.0.0.1:8765";

  const state = { files: [], items: [], urls: [], busy: false };

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const fmtBytes = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");

  function err(m) { $("#err").textContent = m || ""; }
  function busy(on, text) {
    state.busy = on;
    $("#busy").style.display = on ? "flex" : "none";
    if (text) $("#busyText").textContent = text;
    $("#runBtn").disabled = on || !state.files.length;
    const drop = $("#drop");
    if (drop) drop.classList.toggle("busy", on);
    const fileInput = $("#fileInput");
    if (fileInput) fileInput.disabled = on;
    const qualitySel = $("#quality");
    if (qualitySel) qualitySel.disabled = on;
    const pasteBtn = $("#pasteBtn");
    if (pasteBtn) pasteBtn.disabled = on;
  }

  /* ---------------- 选择文件 ---------------- */
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  function addFiles(list) {
    if (state.busy) return err("正在识别中，请稍候再添加文件。");
    const arr = Array.from(list || []).filter((f) => f && (/^image\//.test(f.type) || /\.pdf$/i.test(f.name) || /\.(png|jpe?g|bmp|webp|tiff?)$/i.test(f.name)));
    if (!arr.length) return err("请选择图片或 PDF 文件。");
    const tooBig = arr.filter((f) => f.size > MAX_FILE_SIZE);
    if (tooBig.length) return err(`文件过大（${tooBig.map((f) => f.name).join("、")}），单个文件不能超过 50MB。`);
    err("");
    arr.forEach((f) => state.files.push(f));
    if (window.TBX_rememberFile) arr.forEach((f) => TBX_rememberFile("ocr", f));
    renderFileInfo();
  }
  function renderFileInfo() {
    $("#fileInfo").textContent = state.files.length
      ? state.files.map((f) => f.name).join("、").slice(0, 160) + (state.files.length > 3 ? ` … 共 ${state.files.length} 个` : "")
      : "尚未选择";
    $("#clearBtn").disabled = !state.files.length;
    $("#runBtn").disabled = state.busy || !state.files.length;
  }

  /* ---------------- 识别 ---------------- */
  async function ocrOne(file) {
    const quality = $("#quality") ? $("#quality").value : "normal";
    const r = await fetch(SVC + "/ocr?quality=" + encodeURIComponent(quality), {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(file.name) },
      body: file
    });
    if (!r.ok) {
      let t = "";
      try { const j = await r.json(); t = j.error || ""; } catch (e) {}
      throw new Error(t || ("识别失败 HTTP " + r.status));
    }
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "识别失败");
    return j.items || [];
  }

  async function run() {
    if (!state.files.length) return err("请先选择文件。");
    err("");
    state.items = [];
    state.urls.forEach((u) => URL.revokeObjectURL(u));
    state.urls = [];
    $("#grid").innerHTML = "";
    busy(true, "正在识别…（首次加载模型约 2 秒）");
    const t0 = Date.now();
    let done = 0;
    try {
      for (const f of state.files) {
        done++;
        busy(true, `正在识别 ${done} / ${state.files.length}：${f.name}`);
        const prev = /^image\//.test(f.type) ? URL.createObjectURL(f) : null;
        if (prev) state.urls.push(prev);
        let items;
        try { items = await ocrOne(f); }
        catch (e) { items = [{ file: f.name, kind: "error", error: e.message, lines: [], text: "" }]; }
        items.forEach((it) => { it._preview = prev; it._src = f.name; state.items.push(it); });
        renderCards();
      }
      renderStats((Date.now() - t0) / 1000);
    } catch (e) {
      err("识别出错：" + e.message);
    } finally {
      busy(false);
      toggleExports(true);
    }
  }

  function renderCards() {
    const box = $("#grid");
    // 保存用户已编辑的 textarea 值
    const savedTexts = {};
    $$("#grid textarea").forEach((ta) => {
      savedTexts[ta.dataset.i] = ta.value;
    });
    if (!state.items.length) { box.innerHTML = '<div class="empty" style="padding:20px;text-align:center;color:var(--muted);font-size:13px">没有识别到内容</div>'; return; }
    box.innerHTML = state.items.map((it, i) => {
      const tag = it.kind === "text" ? '<span class="tag text">文本层</span>'
        : it.kind === "ocr" ? '<span class="tag ocr">OCR</span>'
        : `<span class="tag">${esc(it.kind)}</span>`;
      const pg = it.page ? `第 ${it.page} 页` : "";
      const displayText = savedTexts[i] !== undefined ? savedTexts[i] : (it.error ? "【" + it.error + "】" : it.text);
      return `<div class="ocr-card">
        <div class="hd"><span class="nm" title="${esc(it.file)}">${esc(it.file)}</span>${pg ? '<span class="tag">' + pg + "</span>" : ""}${tag}<span class="tag">${(it.lines || []).length} 行</span></div>
        ${it._preview ? `<img src="${it._preview}" alt="">` : ""}
        <textarea data-i="${i}" spellcheck="false">${esc(displayText)}</textarea>
      </div>`;
    }).join("");
  }

  function currentTexts() {
    const tas = $$("#grid textarea");
    return state.items.map((it, i) => {
      const el = tas.find((t) => +t.dataset.i === i);
      return Object.assign({}, it, { text: el ? el.value : it.text });
    });
  }

  function renderStats(secs) {
    const items = currentTexts();
    const pages = items.length;
    const chars = items.reduce((a, it) => a + (it.text || "").length, 0);
    const low = items.reduce((a, it) => a + (it.lines || []).filter((l) => (l.score || 0) < 0.6).length, 0);
    $("#stats").style.display = "";
    $("#stats").innerHTML = `
      <div><div class="k">识别块</div><div class="v">${pages}</div></div>
      <div><div class="k">字符数</div><div class="v">${chars}</div></div>
      <div><div class="k">低置信行</div><div class="v" style="color:${low ? "var(--warn,#d97706)" : "var(--ok)"}">${low}</div></div>
      <div><div class="k">耗时</div><div class="v">${secs.toFixed(1)}s</div></div>`;
  }

  /* ---------------- 表格分列 ---------------- */
  function toRows(item) {
    const lines = (item.lines || []).filter((l) => l.box && l.box.length === 4);
    if (!lines.length) return (item.text || "").split("\n").map((t) => [t]);
    // 按 y 聚行
    const sorted = lines.slice().sort((a, b) => a.box[0][1] - b.box[0][1]);
    const rows = [];
    let cur = null;
    for (const l of sorted) {
      const y = l.box[0][1], h = Math.max(1, l.box[2][1] - l.box[0][1]);
      if (cur && Math.abs(y - cur.y) < h * 0.6) { cur.cells.push(l); }
      else { cur = { y, cells: [l] }; rows.push(cur); }
    }
    // 全部行内所有单元格按 x 聚类成列
    const xs = [];
    rows.forEach((r) => r.cells.forEach((c) => xs.push((c.box[0][0] + c.box[1][0]) / 2)));
    xs.sort((a, b) => a - b);
    const cols = [];
    const tol = Math.max(24, (xs[xs.length - 1] - xs[0]) / 40);
    xs.forEach((x) => {
      const last = cols[cols.length - 1];
      if (last && Math.abs(x - last.c) < tol) { last.n++; last.c += (x - last.c) / last.n; }
      else cols.push({ c: x, n: 1 });
    });
    const centers = cols.map((c) => c.c);
    return rows.map((r) => {
      const out = new Array(centers.length).fill("");
      r.cells.forEach((c) => {
        const x = (c.box[0][0] + c.box[1][0]) / 2;
        let bi = 0, bd = Infinity;
        centers.forEach((cc, i) => { const d = Math.abs(cc - x); if (d < bd) { bd = d; bi = i; } });
        out[bi] = out[bi] ? out[bi] + " " + c.text : c.text;
      });
      return out;
    });
  }

  /* ---------------- 导出 ---------------- */
  function dl(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  function exportTxt() {
    const items = currentTexts();
    const t = items.map((it) => (items.length > 1 ? `===== ${it.file}${it.page ? " 第" + it.page + "页" : ""} =====\n` : "") + it.text).join("\n\n");
    dl(new Blob([t], { type: "text/plain;charset=utf-8" }), `OCR_${stamp()}.txt`);
  }
  function exportMd() {
    const items = currentTexts();
    const t = items.map((it) => `## ${it.file}${it.page ? "（第 " + it.page + " 页）" : ""}\n\n${it.text}`).join("\n\n---\n\n");
    dl(new Blob([t], { type: "text/markdown;charset=utf-8" }), `OCR_${stamp()}.md`);
  }
  function exportCsv() {
    const items = currentTexts();
    const asTable = $("#asTable").checked;
    let lines = [];
    if (asTable) {
      items.forEach((it) => {
        const rows = toRows(it);
        rows.forEach((r) => lines.push(r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")));
        lines.push("");
      });
    } else {
      items.forEach((it) => (it.text || "").split("\n").forEach((l) => lines.push('"' + l.replace(/"/g, '""') + '"')));
    }
    dl(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `OCR_${stamp()}.csv`);
  }
  function exportXlsx() {
    if (typeof XLSX === "undefined") return err("Excel 组件未加载");
    const items = currentTexts();
    const asTable = $("#asTable").checked;
    const wb = XLSX.utils.book_new();
    if (asTable) {
      items.slice(0, 20).forEach((it, i) => {
        const rows = toRows(it);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, ("P" + (i + 1) + (it.page ? "_" + it.page : "")).slice(0, 31));
      });
    } else {
      const aoa = [["文件", "页", "内容"]];
      items.forEach((it) => (it.text || "").split("\n").forEach((l) => aoa.push([it.file, it.page || "", l])));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "识别结果");
    }
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    dl(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `OCR_${stamp()}.xlsx`);
  }
  async function exportDocx() {
    const items = currentTexts();
    const blocks = items.map((it) => ({ heading: it.file + (it.page ? "（第 " + it.page + " 页）" : ""), text: it.text }));
    try {
      err("");
      const r = await fetch(SVC + "/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "OCR 识别结果", blocks })
      });
      if (!r.ok) throw new Error("Word 导出失败 HTTP " + r.status);
      const blob = await r.blob();
      dl(blob, `OCR_${stamp()}.docx`);
    } catch (e) { err(e.message); }
  }

  function toggleExports(on) {
    ["#copyAll", "#dlTxt", "#dlMd", "#dlCsv", "#dlXlsx", "#dlDocx"].forEach((s) => ($(s).disabled = !on));
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    $("#fileInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    $("#clearBtn").onclick = null;
    $("#clearBtn").addEventListener("click", () => {
      state.files = [];
      state.items = [];
      state.urls.forEach((u) => URL.revokeObjectURL(u));
      state.urls = [];
      renderFileInfo();
      $("#grid").innerHTML = '<div class="empty" style="padding:20px;text-align:center;color:var(--muted);font-size:13px">识别结果会显示在这里</div>';
      $("#stats").style.display = "none";
      toggleExports(false);
      err("");
    });
    $("#runBtn").addEventListener("click", run);
    $("#copyAll").addEventListener("click", async () => {
      const t = currentTexts().map((it) => it.text).join("\n\n");
      try { await navigator.clipboard.writeText(t); $("#copyAll").textContent = "已复制 ✔"; }
      catch (e) { err("复制失败，请手动选择文本"); }
      setTimeout(() => ($("#copyAll").textContent = "复制全部"), 1500);
    });
    $("#dlTxt").addEventListener("click", exportTxt);
    $("#dlMd").addEventListener("click", exportMd);
    $("#dlCsv").addEventListener("click", exportCsv);
    $("#dlXlsx").addEventListener("click", exportXlsx);
    $("#dlDocx").addEventListener("click", exportDocx);
    $("#pasteBtn").addEventListener("click", async () => {
      try {
        const items = await navigator.clipboard.read();
        const files = [];
        for (const it of items) {
          const type = it.types.find((t) => t.startsWith("image/"));
          if (!type) continue;
          const blob = await it.getType(type);
          files.push(new File([blob], "paste_" + Date.now() + "." + type.split("/")[1], { type }));
        }
        if (!files.length) return err("剪贴板里没有图片。");
        addFiles(files);
        err("");
      } catch (e) { err("读取剪贴板失败：" + e.message + "（可先点一下页面再试）"); }
    });
    renderFileInfo();
  }

  window.TBX_onRecentFiles = (files) => addFiles(files);
  window.TBX_onRecentFile = (f) => addFiles([f]);
  window.TBX_onFileMiss = () => $("#fileInput").click();
  (function wireRecent() {
    const b = document.getElementById("recentClear");
    if (b) b.onclick = async () => {
      if (!window.TBX_recent) return;
      if (!confirm("清空「最近打开」记录？")) return;
      await TBX_recent.clear("ocr");
      if (window.TBX_refreshRecent) TBX_refreshRecent();
    };
    const badge = document.getElementById("recentBadge");
    if (badge) badge.textContent = window.TBX_recent && TBX_recent.canReopen() ? "可直接重新打开" : "仅记录文件名";
  })();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();