/* 表格工具箱 · 纯前端（SheetJS 解析/导出） */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  const state = { files: [], mode: "convert", results: [], note: "" };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const fmtBytes = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");
  const he = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const baseName = (n) => String(n).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 50) || "sheet";

  function decodeText(buf) {
    let txt = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (txt.indexOf("\uFFFD") >= 0) {
      try { txt = new TextDecoder("gbk").decode(buf); } catch (e) { /* 忽略 */ }
    }
    return txt.replace(/^\uFEFF/, "");
  }
  function fmtCell(v) {
    if (v == null) return "";
    if (v instanceof Date) {
      const hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
      const p = (n) => String(n).padStart(2, "0");
      return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}` + (hasTime ? ` ${p(v.getHours())}:${p(v.getMinutes())}` : "");
    }
    return String(v);
  }

  async function addFiles(list) {
    for (const file of Array.from(list || [])) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const isCsv = /\.(csv|txt)$/i.test(file.name);
        const wb = isCsv
          ? XLSX.read(decodeText(buf), { type: "string", cellDates: true })
          : XLSX.read(buf, { type: "array", cellDates: true });
        state.files.push({ id: uid(), name: file.name, size: file.size, wb, sheets: wb.SheetNames.slice(), active: 0 });
      } catch (e) {
        alert("无法解析文件：" + file.name + "\n" + (e && e.message ? e.message : e));
      }
    }
    renderFiles();
  }
  function removeFile(id) {
    const i = state.files.findIndex((f) => f.id === id);
    if (i >= 0) state.files.splice(i, 1);
    renderFiles();
  }
  const curWs = (f) => f.wb.Sheets[f.sheets[f.active]];
  const aoaOf = (f) => {
    const ws = curWs(f);
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false, raw: true });
  };

  function renderFiles() {
    const box = $("#fileList");
    box.innerHTML = "";
    state.files.forEach((f) => {
      const row = document.createElement("div");
      row.className = "result";
      let sheetSel = f.sheets.length > 1
        ? `<select style="margin-top:6px">${f.sheets.map((s, i) => `<option value="${i}" ${i === f.active ? "selected" : ""}>${he(s)}</option>`).join("")}</select>`
        : "";
      row.innerHTML = `
        <div style="width:46px;height:46px;border-radius:8px;border:1px solid var(--line);background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;font-size:20px">📗</div>
        <div class="meta"><div class="nm">${he(f.name)}</div><div class="sz">${he(fmtCell(f.size ? fmtBytes(f.size) : ""))} · ${f.sheets.length} 个工作表</div>${sheetSel}</div>
        <button class="btn ghost danger rm">移除</button>`;
      const sel = row.querySelector("select");
      if (sel) sel.onchange = (e) => { f.active = +e.target.value; renderPreview(); renderColChecks(); };
      row.querySelector(".rm").onclick = () => removeFile(f.id);
      box.appendChild(row);
    });
    const n = state.files.length;
    $("#fileCount").textContent = n ? `已选择 ${n} 个文件` : "尚未选择文件";
    $("#clearBtn").disabled = !n;
    renderPreview();
    renderColChecks();
  }

  function renderPreview() {
    const box = $("#preview");
    if (!state.files.length) { box.innerHTML = '<div class="empty">选择文件后显示前 100 行</div>'; return; }
    const f = state.files[0];
    const aoa = aoaOf(f);
    if (!aoa.length) { box.innerHTML = '<div class="empty">该工作表为空</div>'; return; }
    const max = Math.min(aoa.length, 100);
    const cols = Math.max(...aoa.slice(0, max).map((r) => r.length), 0);
    let html = '<div class="table-wrap" style="max-height:420px;overflow:auto"><table><tbody>';
    for (let r = 0; r < max; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) html += `<td>${(fmtCell(aoa[r][c]) || "").replace(/</g, "&lt;")}</td>`;
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    if (aoa.length > max) html += `<div class="hint">仅预览前 ${max} 行，共 ${aoa.length} 行。</div>`;
    html += `<div class="hint">当前预览：<b>${he(f.name)}</b>${f.sheets.length > 1 ? " · " + he(f.sheets[f.active]) : ""} · ${aoa.length} 行 × ${cols} 列</div>`;
    box.innerHTML = html;
  }

  function headerOf() {
    if (!state.files.length) return [];
    const aoa = aoaOf(state.files[0]);
    const len = aoa.length ? Math.max(...aoa.slice(0, 20).map((r) => r.length)) : 0;
    const h = aoa[0] || [];
    return Array.from({ length: len }, (_, i) => (h[i] !== "" && h[i] != null ? fmtCell(h[i]) : "列" + (i + 1)));
  }
  function renderColChecks() {
    const heads = headerOf();
    const html = heads.map((h, i) => `<label><input type="checkbox" value="${i}" ${i < 8 ? "checked" : ""}> ${he(String(h).slice(0, 14))}</label>`).join("") || '<span class="hint">请先选择文件</span>';
    $("#colChecks1").innerHTML = html;
    $("#colChecks2").innerHTML = html;
  }
  const checkedCols = (sel) => $$(sel + " input:checked").map((c) => +c.value).sort((a, b) => a - b);

  /* ---------------- export helpers ---------------- */
  function aoaToBlob(aoa, fmt, sheetName) {
    if (fmt === "csv" || fmt === "tsv") {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const txt = XLSX.utils.sheet_to_csv(ws, { FS: fmt === "tsv" ? "\t" : "," });
      return { blob: new Blob(["\uFEFF" + txt], { type: "text/csv;charset=utf-8" }), ext: fmt };
    }
    if (fmt === "json") {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const keyed = XLSX.utils.sheet_to_json(ws, { defval: null });
      const out = keyed.length && keyed.length === aoa.length - 1 ? keyed : aoa;
      return { blob: new Blob([JSON.stringify(out, null, 2)], { type: "application/json;charset=utf-8" }), ext: "json" };
    }
    if (fmt === "md") {
      if (!aoa.length) return { blob: new Blob([""]), ext: "md" };
      const esc = (v) => String(fmtCell(v)).replace(/\|/g, "\\|").replace(/\n/g, " ");
      const head = aoa[0].map(esc);
      const sep = aoa[0].map(() => "---");
      const body = aoa.slice(1).map((r) => r.map(esc));
      const md = [head, sep, ...body].map((r) => "| " + r.join(" | ") + " |").join("\n");
      return { blob: new Blob([md], { type: "text/markdown;charset=utf-8" }), ext: "md" };
    }
    if (fmt === "html") {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const body = XLSX.utils.sheet_to_html(ws);
      const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${sheetName || "表格"}</title>
<style>body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;padding:24px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px;font-size:14px}</style>
</head><body>${body}</body></html>`;
      return { blob: new Blob([html], { type: "text/html;charset=utf-8" }), ext: "html" };
    }
    // xlsx
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    XLSX.utils.book_append_sheet(wb, ws, (sheetName || "Sheet1").slice(0, 31) || "Sheet1");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array", cellDates: true });
    return { blob: new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), ext: "xlsx" };
  }

  function pushResult(name, blob) {
    state.results.push({ id: uid(), name, blob, url: URL.createObjectURL(blob), size: blob.size });
    renderResults();
  }

  /* 导出全部工作表 */
  function aoaOfSheet(f, sheetName) {
    const ws = f.wb.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false, raw: true });
  }
  function safeTag(s) {
    return String(s || "sheet").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "sheet";
  }
  function runAllSheets() {
    if (!state.files.length) return err("请先选择表格文件。");
    clearResults();
    const fmt = $("#allFmt").value;
    const tpl = ($("#allTpl").value || "{file}_{sheet}").trim();
    const one = $("#allOne").value === "1";
    const merged = one ? XLSX.utils.book_new() : null;
    let count = 0;
    state.files.forEach((f) => {
      const base = String(f.name).replace(/\.[^.]+$/, "");
      f.sheets.forEach((sn) => {
        const aoa = aoaOfSheet(f, sn);
        if (!aoa.length) return;
        const nm = safeTag(tpl.replace(/\{file\}/g, base).replace(/\{sheet\}/g, sn));
        if (merged) {
          const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
          XLSX.utils.book_append_sheet(merged, ws, safeTag(sn).slice(0, 31) || "Sheet1");
        } else {
          const r = aoaToBlob(aoa, fmt, sn);
          pushResult(nm + "." + r.ext, r.blob);
        }
        count++;
      });
    });
    if (!count) return err("没有可导出的内容（工作表为空？）。");
    if (merged) {
      const out = XLSX.write(merged, { bookType: "xlsx", type: "array", cellDates: true });
      const nm = safeTag($("#allTpl").value || "all_sheets").replace(/\{(file|sheet)\}/g, "all");
      pushResult(nm + ".xlsx", new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    }
    err("已导出 " + count + " 个工作表。");
  }
  function renderResults() {
    const box = $("#results");
    box.innerHTML = "";
    if (state.note) {
      const n = document.createElement("div");
      n.className = "note";
      n.textContent = state.note;
      box.appendChild(n);
    }
    if (!state.results.length) {
      if (!state.note) box.innerHTML = '<div class="empty">导出/处理后的文件会出现在这里</div>';
      return;
    }
    state.results.forEach((r) => {
      const d = document.createElement("div");
      d.className = "result";
      d.innerHTML = `<div style="width:46px;height:46px;border-radius:8px;border:1px solid var(--line);background:var(--surface-3);display:grid;place-items:center;font-size:20px">⬇️</div>
        <div class="meta"><div class="nm">${r.name}</div><div class="sz">${fmtBytes(r.size)}</div></div>
        <button class="btn ghost dl">下载</button>`;
      d.querySelector(".dl").onclick = () => {
        const a = document.createElement("a"); a.href = r.url; a.download = r.name;
        document.body.appendChild(a); a.click(); a.remove();
      };
      box.appendChild(d);
    });
  }
  function clearResults() {
    state.results.forEach((r) => URL.revokeObjectURL(r.url));
    state.results = [];
    state.note = "";
    renderResults();
  }

  /* ---------------- modes ---------------- */
  function runConvert() {
    const fmt = $("#outFmt").value;
    if (!state.files.length) return err("请先选择文件。");
    state.files.forEach((f) => {
      const r = aoaToBlob(aoaOf(f), fmt, f.sheets[f.active]);
      pushResult(`${baseName(f.name)}.${r.ext}`, r.blob);
    });
  }
  function runMerge() {
    if (state.files.length < 1) return err("请先选择文件。");
    const dropHeader = $("#mergeMode .active").dataset.v === "noheader";
    const fmt = $("#mergeFmt .active").dataset.v;
    let out = [];
    state.files.forEach((f, i) => {
      const aoa = aoaOf(f);
      if (!aoa.length) return;
      if (dropHeader && i > 0) {
        out = out.concat(aoa.slice(1));
      } else out = out.concat(aoa);
    });
    if (!out.length) return err("没有可合并的数据。");
    const r = aoaToBlob(out, fmt, "merged");
    pushResult(`merged_${Date.now()}.${r.ext}`, r.blob);
  }
  function runDedup() {
    if (!state.files.length) return err("请先选择文件。");
    clearResults();
    const byCols = $("#dedupMode .active").dataset.v === "cols";
    const hasHeader = $("#hasHeader1 .active").dataset.v === "1";
    const cols = checkedCols("#colChecks1");
    if (byCols && !cols.length) return err("请至少勾选一列。");
    const aoa = aoaOf(state.files[0]);
    if (!aoa.length) return err("没有数据。");
    const head = hasHeader ? aoa[0] : null;
    const body = hasHeader ? aoa.slice(1) : aoa;
    const seen = new Set();
    const kept = [];
    body.forEach((row) => {
      const key = byCols ? cols.map((c) => fmtCell(row[c])).join("\u0001") : row.map(fmtCell).join("\u0001");
      if (seen.has(key)) return;
      seen.add(key);
      kept.push(row);
    });
    const result = head ? [head, ...kept] : kept;
    const r = aoaToBlob(result, "xlsx", "dedup");
    pushResult(`${baseName(state.files[0].name)}_dedup.xlsx`, r.blob);
    state.note = `去重完成：原 ${body.length} 行 → 保留 ${kept.length} 行，删除 ${body.length - kept.length} 行。`;
    renderResults();
    err("");
  }
  function runCols() {
    if (!state.files.length) return err("请先选择文件。");
    clearResults();
    const cols = checkedCols("#colChecks2");
    if (!cols.length) return err("请至少勾选一列。");
    const fmt = $("#colsFmt .active").dataset.v;
    const aoa = aoaOf(state.files[0]).map((row) => cols.map((c) => row[c] != null ? row[c] : ""));
    const r = aoaToBlob(aoa, fmt, "cols");
    pushResult(`${baseName(state.files[0].name)}_cols.${r.ext}`, r.blob);
    err("");
  }
  function runStats() {
    if (!state.files.length) return err("请先选择文件。");
    let html = "";
    state.files.forEach((f) => {
      const aoa = aoaOf(f);
      const rows = aoa.length;
      const cols = rows ? Math.max(...aoa.map((r) => r.length)) : 0;
      let empty = 0;
      const seen = new Set(); let dup = 0;
      aoa.forEach((r) => {
        for (let c = 0; c < cols; c++) if (r[c] === "" || r[c] == null) empty++;
        const k = r.map(fmtCell).join("\u0001");
        if (seen.has(k)) dup++; else seen.add(k);
      });
      html += `<div class="result" style="display:block">
        <div class="nm" style="margin-bottom:6px">${he(f.name)}</div>
        <div class="kv"><span class="k">行数</span><span class="v">${rows}</span></div>
        <div class="kv"><span class="k">列数</span><span class="v">${cols}</span></div>
        <div class="kv"><span class="k">空单元格</span><span class="v">${empty}</span></div>
        <div class="kv"><span class="k">重复行</span><span class="v">${dup}</span></div>
      </div>`;
    });
    $("#statsOut").innerHTML = html;
    err("");
  }
  function err(msg) {
    const e = $("#err");
    if (!msg) { e.textContent = ""; return; }
    e.textContent = msg;
  }

  /* ---------------- wiring ---------------- */
  function selectTab(mode) {
    state.mode = mode;
    $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $$(".mode-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.mode !== mode));
  }
  ["#mergeMode", "#mergeFmt", "#dedupMode", "#hasHeader1", "#colsFmt"].forEach((sel) => {
    const root = $(sel);
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", root).forEach((x) => x.classList.toggle("active", x === b));
    });
  });

  function init() {
    $("#fileInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    drop.addEventListener("click", () => $("#fileInput").click());
    $("#clearBtn").onclick = () => { state.files = []; renderFiles(); clearResults(); };
    $$("#tabs .tab").forEach((b) => (b.onclick = () => selectTab(b.dataset.mode)));
    $("#runDedup").onclick = runDedup;
    $("#runCols").onclick = runCols;
    $("#runStats").onclick = runStats;
    if ($("#runAllSheets")) $("#runAllSheets").onclick = runAllSheets;
    $("#outFmt").addEventListener("change", () => { err(""); if (state.files.length) { clearResults(); runConvert(); } });
    $("#runConvert").onclick = () => { err(""); clearResults(); runConvert(); };
    $("#mergeMode").addEventListener("click", () => { clearResults(); setTimeout(runMerge, 0); });
    $("#mergeFmt").addEventListener("click", () => { clearResults(); setTimeout(runMerge, 0); });
    selectTab("convert");
    renderFiles();
    renderResults();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();