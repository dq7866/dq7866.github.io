/* PDF 工具箱 · 纯前端实现
   依赖（本地内置）：pdf-lib（编辑）、pdf.js（渲染/取文字）、JSZip（docx/打包）、SheetJS（xlsx） */
(function () {
  "use strict";

  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  const { PDFDocument, degrees, StandardFonts, rgb } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "assets/vendor/pdf.worker.min.js";
  // 中文等 CID 字体 PDF 需要 CMap 数据（按需从 CDN 获取，不属于用户文件上传）
  const PDF_OPTS = {
    cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
  };

  const state = { files: [], mode: "merge", results: [] };

  /* 本机高保真转换服务（可选） */
  const OFFICE_URL = "http://127.0.0.1:8765";
  let officeOk = null;

  /* ---------------- utils ---------------- */
  const uid = () => Math.random().toString(36).slice(2, 9);
  const fmtBytes = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");
  const baseName = (name) => String(name).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "file";
  function newCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function canvasToBlob(cv, type, q) {
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("导出失败：" + type))), type, q));
  }
  function parseRanges(str, max) {
    const out = new Set();
    if (!str || !str.trim()) { for (let i = 0; i < max; i++) out.add(i); return [...out]; }
    str.split(/[,，\s]+/).filter(Boolean).forEach((part) => {
      const m = part.match(/^(\d+)\s*[-~到至]\s*(\d+)$/);
      if (m) { let a = +m[1], b = +m[2]; if (a > b) { const t = a; a = b; b = t; } for (let i = a; i <= b; i++) if (i >= 1 && i <= max) out.add(i - 1); }
      else if (/^\d+$/.test(part)) { const n = +part; if (n >= 1 && n <= max) out.add(n - 1); }
    });
    return [...out].sort((a, b) => a - b);
  }
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /* ---------------- file loading ---------------- */
  async function addFiles(list) {
    const arr = Array.from(list || []);
    for (const file of arr) {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      try {
        if (isPdf) {
          const buf = new Uint8Array(await file.arrayBuffer());
          const doc = await pdfjsLib.getDocument(Object.assign({ data: buf.slice() }, PDF_OPTS)).promise;
          state.files.push({ id: uid(), kind: "pdf", file, name: file.name, size: file.size, bytes: buf, doc, pageCount: doc.numPages });
        } else if (file.type.startsWith("image/")) {
          const url = URL.createObjectURL(file);
          try {
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
            state.files.push({ id: uid(), kind: "image", file, name: file.name, size: file.size, img, url, w: img.naturalWidth, h: img.naturalHeight });
          } catch (imgErr) {
            URL.revokeObjectURL(url);
            throw imgErr;
          }
        }
        if (window.TBX_rememberFile) TBX_rememberFile("pdf", file);
      } catch (e) {
        alert("无法读取文件：" + file.name + "\n" + (e && e.message ? e.message : e));
      }
    }
    renderThumbs();
  }
  function removeFile(id) {
    const i = state.files.findIndex((f) => f.id === id);
    if (i < 0) return;
    if (state.files[i].url) URL.revokeObjectURL(state.files[i].url);
    if (state.files[i].doc) { try { state.files[i].doc.destroy(); } catch (e) {} }
    // 如果移除的是 reorder 使用的文件，也销毁 reorder 文档
    if (state.ro && state.files[i].id + ":" + (state.files[i].pageCount || 0) === state.ro.sig) {
      if (state.ro.doc) { try { state.ro.doc.destroy(); } catch (e) {} }
      state.ro = null;
    }
    state.files.splice(i, 1);
    renderThumbs();
  }
  function moveFile(id, dir) {
    const i = state.files.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.files.length) return;
    const t = state.files[i]; state.files[i] = state.files[j]; state.files[j] = t;
    renderThumbs();
  }
  function renderThumbs() {
    const box = $("#thumbs"); box.innerHTML = "";
    state.files.forEach((f, idx) => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.title = `${f.name}\n${f.size ? fmtBytes(f.size) : ""}${f.kind === "pdf" ? "\n" + f.pageCount + " 页" : "\n" + f.w + "×" + f.h}`;
      d.innerHTML = f.kind === "image"
        ? `<img src="${f.url}" alt="">`
        : `<div style="width:100%;height:100%;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);font-weight:800;font-size:10px;line-height:1.2;text-align:center;padding:4px">PDF<br>${f.pageCount}页</div>`;
      const rm = document.createElement("button");
      rm.className = "x"; rm.textContent = "×"; rm.title = "移除";
      rm.onclick = (e) => { e.stopPropagation(); removeFile(f.id); };
      d.appendChild(rm);
      if (idx > 0) {
        const lf = document.createElement("button");
        lf.className = "x"; lf.textContent = "◀"; lf.title = "前移"; lf.style.left = "3px"; lf.style.right = "auto";
        lf.onclick = (e) => { e.stopPropagation(); moveFile(f.id, -1); };
        d.appendChild(lf);
      }
      box.appendChild(d);
    });
    const n = state.files.length;
    const np = state.files.filter((f) => f.kind === "pdf").length;
    const ni = n - np;
    $("#fileCount").textContent = n ? `已选择 ${n} 个文件（PDF ${np} · 图片 ${ni}）` : "尚未选择文件";
    $("#clearBtn").disabled = !n;
    $("#runBtn").disabled = !n;
  }

  /* ---------------- pdf.js helpers ---------------- */
  async function renderPageCanvas(doc, pageNo, scale) {
    const page = await doc.getPage(pageNo);
    const vp = page.getViewport({ scale });
    const cv = newCanvas(vp.width, vp.height);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv;
  }
  function buildLines(items) {
    const valid = items.filter((it) => it.str !== undefined && it.str.trim() !== "");
    valid.sort((a, b) => (b.transform[5] - a.transform[5]) || (a.transform[4] - b.transform[4]));
    const lines = [];
    for (const it of valid) {
      const y = it.transform[5], x = it.transform[4], h = it.height || 10;
      let line = lines.find((L) => Math.abs(L.y - y) <= Math.max(2, h * 0.5));
      if (!line) { line = { y, items: [] }; lines.push(line); }
      line.items.push({ x, str: it.str, h, w: it.width || it.str.length * h * 0.5 });
    }
    lines.sort((a, b) => b.y - a.y);
    return lines.map((L) => {
      L.items.sort((a, b) => a.x - b.x);
      const cells = [];
      let cur = null, prevEnd = null;
      for (const it of L.items) {
        const gap = prevEnd === null ? 0 : it.x - prevEnd;
        if (cur === null || gap > Math.max(8, it.h * 0.9)) { if (cur) cells.push(cur); cur = { x0: it.x, text: it.str }; }
        else cur.text += (gap > it.h * 0.18 ? " " : "") + it.str;
        prevEnd = it.x + it.w;
      }
      if (cur) cells.push(cur);
      return { y: L.y, text: cells.map((c) => c.text).join("\t"), cells };
    });
  }
  async function pageLines(doc, pageNo) {
    const page = await doc.getPage(pageNo);
    const tc = await page.getTextContent();
    return buildLines(tc.items);
  }
  function linesToAoa(lines) {
    const anchors = [];
    lines.forEach((L) => L.cells.forEach((c) => {
      let a = anchors.find((x) => Math.abs(x - c.x0) <= 8);
      if (a === undefined) anchors.push(c.x0);
    }));
    anchors.sort((a, b) => a - b);
    return lines.map((L) => {
      const row = new Array(anchors.length).fill("");
      L.cells.forEach((c) => {
        let best = 0, bd = Infinity;
        anchors.forEach((a, i) => { const d = Math.abs(a - c.x0); if (d < bd) { bd = d; best = i; } });
        row[best] = row[best] ? row[best] + " " + c.text : c.text;
      });
      return row;
    });
  }

  /* ---------------- page assembly helpers ---------------- */
  async function loadSrc(f) { return PDFDocument.load(f.bytes, { ignoreEncryption: true }); }
  async function canvasesToPdf(items) {
    const out = await PDFDocument.create();
    for (const it of items) {
      const isJpg = it.type === "image/jpeg";
      const buf = await it.canvas.toBlob ? await (await new Promise((r) => it.canvas.toBlob(r, it.type, it.q))) : null;
      const ab = await buf.arrayBuffer();
      const emb = isJpg ? await out.embedJpg(ab) : await out.embedPng(ab);
      const w = it.canvas.width / (it.scale || 1), h = it.canvas.height / (it.scale || 1);
      const page = out.addPage([w, h]);
      page.drawImage(emb, { x: 0, y: 0, width: w, height: h });
    }
    return out.save();
  }
  function blobUrlBlob(bytes, name, type) {
    const blob = new Blob([bytes], { type: type || "application/pdf" });
    return { name, kind: "blob", blob, url: URL.createObjectURL(blob), size: blob.size, type: blob.type };
  }

  /* ---------------- 页面排序（拖拽） ---------------- */
  async function renderReorder() {
    const box = $("#roGrid");
    if (!box) return;
    const pdfs = state.files.filter((f) => f.kind === "pdf");
    if (!pdfs.length || !pdfs[0].bytes) {
      // 销毁旧的 reorder 文档
      if (state.ro && state.ro.doc) { try { state.ro.doc.destroy(); } catch (e) {} }
      box.innerHTML = '<div class="empty">请先选择 PDF 文件</div>'; state.ro = null; return;
    }
    const f = pdfs[0];
    const sig = f.id + ":" + (f.pageCount || 0);
    // sig 匹配则直接返回，不清除网格，避免二次进入变空
    if (state.ro && state.ro.sig === sig) return;
    // 销毁旧的 reorder 文档，避免内存泄漏
    if (state.ro && state.ro.doc) { try { state.ro.doc.destroy(); } catch (e) {} }
    box.innerHTML = "";
    try {
      const buf = f.bytes;
      const doc = await pdfjsLib.getDocument(Object.assign({ data: buf.slice() }, PDF_OPTS)).promise;
      state.ro = { sig, total: doc.numPages, order: Array.from({ length: doc.numPages }, (_, i) => i), doc };
      const dw = 92;
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp0 = page.getViewport({ scale: 1 });
        const cv = await renderPageCanvas(doc, i, +(dw / vp0.width).toFixed(3) * (window.devicePixelRatio > 1 ? 1.4 : 1));
        cv.style.width = dw + "px"; cv.style.borderRadius = "8px"; cv.style.border = "1px solid var(--line)"; cv.style.background = "#fff"; cv.style.cursor = "grab"; cv.style.display = "block";
        const cell = document.createElement("div");
        cell.style.cssText = "text-align:center;user-select:none";
        cell.draggable = true;
        cell.dataset.idx = String(i - 1);
        cell.dataset.orig = String(i - 1);
        const no = document.createElement("div");
        no.style.cssText = "font-size:11.5px;color:var(--muted);margin-top:4px;font-family:var(--mono)";
        no.textContent = "第 " + i + " 页";
        cell.appendChild(cv); cell.appendChild(no);
        cell.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", cell.dataset.idx); cell.style.opacity = ".4"; });
        cell.addEventListener("dragend", () => { cell.style.opacity = "1"; });
        cell.addEventListener("dragover", (e) => { e.preventDefault(); cell.style.outline = "2px dashed var(--accent)"; });
        cell.addEventListener("dragleave", () => { cell.style.outline = ""; });
        cell.addEventListener("drop", (e) => {
          e.preventDefault(); cell.style.outline = "";
          const from = +e.dataTransfer.getData("text/plain");
          const to = +cell.dataset.idx;
          if (isNaN(from) || from === to) return;
          const o = state.ro.order.slice();
          const [m] = o.splice(from, 1); o.splice(to, 0, m);
          state.ro.order = o;
          renderReorder2();
        });
        box.appendChild(cell);
      }
    } catch (e) { console.error(e); if (state.ro && state.ro.doc) { try { state.ro.doc.destroy(); } catch (e2) {} } box.innerHTML = '<div class="err">页面预览失败：' + esc(e.message || e) + "</div>"; state.ro = null; }
  }
  function renderReorder2() {
    const box = $("#roGrid");
    if (!box || !state.ro) return;
    const cells = Array.from(box.children);
    const cellMap = {};
    cells.forEach((c) => { cellMap[c.dataset.orig] = c; });
    state.ro.order.forEach((orig, pos) => {
      const cell = cellMap[orig];
      if (!cell) return;
      cell.dataset.idx = String(pos);
      const label = cell.querySelector("div:last-child");
      if (label) label.textContent = "第 " + (orig + 1) + " 页 → 位置 " + (pos + 1);
      box.appendChild(cell);
    });
  }
  async function modeReorder(pdfs) {
    const res = [];
    for (const f of pdfs) {
      const src = await loadSrc(f);
      const n = src.getPageCount();
      let idx = state.ro && state.ro.sig.startsWith(f.id + ":") && state.ro.order.length === n ? state.ro.order.slice() : Array.from({ length: n }, (_, i) => i);
      const o = await PDFDocument.create();
      const pages = await o.copyPages(src, idx);
      pages.forEach((p) => o.addPage(p));
      res.push(blobUrlBlob(await o.save(), `${baseName(f.name)}_重排.pdf`));
    }
    return res;
  }

  /* ---------------- 加密 / 解密 ---------------- */
  async function modeSecure(pdfs) {
    const mode = $("#scMode").value;
    const pwd = $("#scPwd").value;
    const perms = $("#scPerms").value;
    if (!pwd) throw new Error(mode === "decrypt" ? "请填写原密码" : "请设置一个密码");
    let base = OFFICE_URL;
    try { const j = await (await fetch(base + "/health", { cache: "no-store" })).json(); if (!j || !j.ok) base = null; } catch (e) { base = null; }
    if (!base) throw new Error("加密/解密需要本机增强服务，请先启动 server/start.bat");
    const res = [];
    for (const f of pdfs) {
      const qs = new URLSearchParams({ mode, password: pwd, perms });
      const rr = await fetch(base + "/pdf/secure?" + qs, { method: "POST", headers: { "Content-Type": "application/pdf", "x-filename": encodeURIComponent(f.name) }, body: f.bytes });
      if (!rr.ok) { let t = ""; try { t = await rr.text(); } catch (e) {} throw new Error(t || ("处理失败 HTTP " + rr.status)); }
      const blob = await rr.blob();
      const name = baseName(f.name) + (mode === "decrypt" ? "_已解密.pdf" : "_已加密.pdf");
      res.push({ name, kind: "blob", blob, url: URL.createObjectURL(blob), size: blob.size, type: "application/pdf", orig: f.size });
    }
    return res;
  }

  /* ---------------- modes ---------------- */
  async function modeMerge(pdfs, onProgress) {
    const out = await PDFDocument.create();
    const total = pdfs.length;
    for (let fi = 0; fi < pdfs.length; fi++) {
      const f = pdfs[fi];
      onProgress && onProgress(`合并中 ${fi + 1}/${total}：${f.name}`);
      const src = await loadSrc(f);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    onProgress && onProgress("正在生成最终 PDF…");
    const bytes = await out.save();
    const orig = pdfs.reduce((a, f) => a + f.size, 0);
    return [Object.assign(blobUrlBlob(bytes, `merged_${Date.now()}.pdf`), { orig })];
  }

  async function modeSplit(pdfs) {
    const res = [];
    const each = $("#splitOut .active").dataset.v === "each";
    const rangeStr = $("#splitPages").value;
    for (const f of pdfs) {
      const keep = parseRanges(rangeStr, f.pageCount);
      if (!keep.length) {
        if (rangeStr && rangeStr.trim()) {
          throw new Error('页面范围无效："' + rangeStr + '" 超出范围（' + f.name + ' 共 ' + f.pageCount + ' 页）');
        }
        continue;
      }
      const src = await loadSrc(f);
      if (each) {
        for (const idx of keep) {
          const o = await PDFDocument.create();
          const [p] = await o.copyPages(src, [idx]);
          o.addPage(p);
          res.push(blobUrlBlob(await o.save(), `${baseName(f.name)}_p${idx + 1}.pdf`));
        }
      } else {
        const o = await PDFDocument.create();
        const pages = await o.copyPages(src, keep);
        pages.forEach((p) => o.addPage(p));
        res.push(blobUrlBlob(await o.save(), `${baseName(f.name)}_${keep.length}p.pdf`));
      }
    }
    return res;
  }

  async function modeDelete(pdfs) {
    const res = [];
    for (const f of pdfs) {
      const del = new Set(parseRanges($("#delPages").value, f.pageCount));
      const keep = [];
      for (let i = 0; i < f.pageCount; i++) if (!del.has(i)) keep.push(i);
      if (!keep.length) continue;
      const src = await loadSrc(f);
      const o = await PDFDocument.create();
      const pages = await o.copyPages(src, keep);
      pages.forEach((p) => o.addPage(p));
      res.push(blobUrlBlob(await o.save(), `${baseName(f.name)}_kept.pdf`));
    }
    return res;
  }

  async function modeRotate(pdfs) {
    const angle = +$("#rotAngle .active").dataset.v;
    const res = [];
    for (const f of pdfs) {
      const doc = await loadSrc(f);
      const sel = new Set(parseRanges($("#rotPages").value, f.pageCount));
      doc.getPages().forEach((p, i) => { if (sel.has(i)) p.setRotation(degrees((p.getRotation().angle + angle) % 360)); });
      res.push(blobUrlBlob(await doc.save(), `${baseName(f.name)}_rot${angle}.pdf`));
    }
    return res;
  }

  async function modePageNum(pdfs) {
    const pos = $("#pnPos").value, start = +(($("#pnStart").value) || 1), size = +($("#pnSize").value) || 10;
    const res = [];
    for (const f of pdfs) {
      const doc = await loadSrc(f);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      doc.getPages().forEach((p, i) => {
        const { width, height } = p.getSize();
        const t = String(start + i);
        const w = font.widthOfTextAtSize(t, size);
        const pad = 24;
        let x = (width - w) / 2, y = pad;
        if (pos === "br") x = width - pad - w;
        else if (pos === "bl") x = pad;
        else if (pos === "tr") { x = width - pad - w; y = height - pad - size; }
        p.drawText(t, { x, y, size, font, color: rgb(0.25, 0.25, 0.25) });
      });
      res.push(blobUrlBlob(await doc.save(), `${baseName(f.name)}_numbered.pdf`));
    }
    return res;
  }

  function drawWmSingle(ctx, W, H, text, pos, op, sizePct, angle, color) {
    const fs = Math.max(12, (Math.min(W, H) * sizePct) / 100);
    ctx.save();
    ctx.globalAlpha = op; ctx.fillStyle = color;
    ctx.font = `700 ${fs}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
    const pad = Math.round(Math.min(W, H) * 0.05);
    let x = W / 2, y = H / 2, al = "center", bl = "middle";
    if (pos === "br") { x = W - pad; y = H - pad; al = "right"; bl = "bottom"; }
    else if (pos === "bl") { x = pad; y = H - pad; al = "left"; bl = "bottom"; }
    else if (pos === "tr") { x = W - pad; y = pad; al = "right"; bl = "top"; }
    else if (pos === "tl") { x = pad; y = pad; al = "left"; bl = "top"; }
    ctx.textAlign = al; ctx.textBaseline = bl;
    ctx.translate(x, y); ctx.rotate((angle * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  function drawWmTile(ctx, W, H, text, op, sizePct, angle, color) {
    const fs = Math.max(12, (Math.min(W, H) * sizePct) / 100);
    ctx.save();
    ctx.globalAlpha = op; ctx.fillStyle = color;
    ctx.font = `700 ${fs}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.translate(W / 2, H / 2); ctx.rotate((angle * Math.PI) / 180);
    const tw = ctx.measureText(text).width;
    const stepX = tw + fs * 2.6, stepY = fs * 4.2;
    const diag = Math.ceil(Math.sqrt(W * W + H * H));
    for (let y = -diag; y <= diag; y += stepY) for (let x = -diag; x <= diag; x += stepX) ctx.fillText(text, x, y);
    ctx.restore();
  }

  async function modeWatermark(pdfs, onProgress) {
    const text = $("#wmText").value || "水印";
    const layout = $("#wmLayout .active").dataset.v;
    const pos = $("#wmPos").value;
    const op = (+$("#wmOpacity").value) / 100;
    const sizePct = +$("#wmSize").value;
    const angle = +$("#wmAngle").value;
    const color = $("#wmColor").value;
    const scale = 2;
    const items = [];
    for (const f of pdfs) {
      for (let p = 1; p <= f.pageCount; p++) {
        onProgress && onProgress(`渲染第 ${p}/${f.pageCount} 页…`);
        const cv = await renderPageCanvas(f.doc, p, scale);
        const ctx = cv.getContext("2d");
        if (layout === "tile") drawWmTile(ctx, cv.width, cv.height, text, op, sizePct, angle, color);
        else drawWmSingle(ctx, cv.width, cv.height, text, pos, op, sizePct, angle, color);
        items.push({ canvas: cv, type: "image/jpeg", q: 0.9, scale });
      }
    }
    const bytes = await canvasesToPdf(items);
    const orig = pdfs.reduce((a, f) => a + f.size, 0);
    return [Object.assign(blobUrlBlob(bytes, `watermarked_${Date.now()}.pdf`), { orig })];
  }

  async function modeToImage(pdfs, onProgress) {
    const fmt = $("#tiFmt").value;
    const scale = (+$("#tiScale").value) / 10;
    const ext = fmt === "image/jpeg" ? "jpg" : "png";
    const res = [];
    for (const f of pdfs) {
      for (let p = 1; p <= f.pageCount; p++) {
        onProgress && onProgress(`导出 ${f.name} 第 ${p}/${f.pageCount} 页…`);
        const cv = await renderPageCanvas(f.doc, p, scale);
        const blob = await canvasToBlob(cv, fmt, 0.92);
        res.push({ name: `${baseName(f.name)}_p${p}.${ext}`, kind: "blob", blob, url: URL.createObjectURL(blob), size: blob.size, type: fmt });
      }
    }
    return res;
  }

  async function modeImg2Pdf(images) {
    const out = await PDFDocument.create();
    const fit = $("#ipSize .active").dataset.v === "fit";
    const margin = +($("#ipMargin").value) || 0;
    for (const im of images) {
      let bytes, isJpg = im.file.type === "image/jpeg";
      if (im.file.type === "image/png" || isJpg) bytes = new Uint8Array(await im.file.arrayBuffer());
      else {
        const cv = newCanvas(im.w, im.h); cv.getContext("2d").drawImage(im.img, 0, 0);
        bytes = new Uint8Array(await (await canvasToBlob(cv, "image/png")).arrayBuffer()); isJpg = false;
      }
      const emb = isJpg ? await out.embedJpg(bytes) : await out.embedPng(bytes);
      let pw, ph, x, y, dw, dh;
      if (fit) {
        pw = im.w * 0.75 + margin * 2; ph = im.h * 0.75 + margin * 2;
        dw = im.w * 0.75; dh = im.h * 0.75; x = margin; y = margin;
      } else {
        pw = 595.28; ph = 841.89;
        const availW = pw - margin * 2, availH = ph - margin * 2;
        const s = Math.min(availW / emb.width, availH / emb.height);
        dw = emb.width * s; dh = emb.height * s;
        x = (pw - dw) / 2; y = (ph - dh) / 2;
      }
      const page = out.addPage([pw, ph]);
      page.drawImage(emb, { x, y, width: dw, height: dh });
    }
    const orig = images.reduce((a, f) => a + f.size, 0);
    return [Object.assign(blobUrlBlob(await out.save(), `images_${Date.now()}.pdf`), { orig })];
  }

  async function extractAll(pdfs, onProgress) {
    const texts = [];
    for (const f of pdfs) {
      const pages = [];
      for (let p = 1; p <= f.pageCount; p++) {
        onProgress && onProgress(`读取文字 ${f.name} 第 ${p}/${f.pageCount} 页…`);
        const lines = await pageLines(f.doc, p);
        pages.push(lines.map((L) => L.text).join("\n"));
      }
      texts.push({ file: f, pages });
    }
    return texts;
  }

  async function modeText(pdfs, onProgress) {
    const all = await extractAll(pdfs, onProgress);
    const res = [];
    for (const t of all) {
      const body = t.pages.map((p, i) => `===== ${t.file.name} · 第 ${i + 1} 页 =====\n${p}`).join("\n\n");
      const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
      res.push({ name: `${baseName(t.file.name)}.txt`, kind: "blob", blob, url: URL.createObjectURL(blob), size: blob.size, type: "text/plain" });
    }
    return res;
  }

  function docxBlob(texts) {
    const body = [];
    texts.forEach((t, ti) => {
      t.pages.forEach((pg, pi) => {
        pg.split("\n").forEach((line) => {
          body.push(`<w:p><w:r><w:t xml:space="preserve">${esc(line.replace(/\t/g, "    "))}</w:t></w:r></w:p>`);
        });
        if (pi < t.pages.length - 1) body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
      });
      if (ti < texts.length - 1) body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    });
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr/></w:body></w:document>`;
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", ct);
    zip.folder("_rels").file(".rels", rels);
    zip.folder("word").file("document.xml", doc);
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  async function modeWord(pdfs, onProgress) {
    const texts = await extractAll(pdfs, onProgress);
    const blob = await docxBlob(texts);
    return [{ name: `${baseName(pdfs[0].name)}${pdfs.length > 1 ? "_等" : ""}.docx`, kind: "blob", blob, url: URL.createObjectURL(blob), size: blob.size, type: blob.type }];
  }

  async function modeExcel(pdfs, onProgress) {
    const mode = $("#xlMode .active").dataset.v;
    const wb = XLSX.utils.book_new();
    for (const f of pdfs) {
      for (let p = 1; p <= f.pageCount; p++) {
        onProgress && onProgress(`解析表格 ${f.name} 第 ${p}/${f.pageCount} 页…`);
        const lines = await pageLines(f.doc, p);
        const aoa = mode === "table" ? linesToAoa(lines) : lines.map((L) => [L.text]);
        if (!aoa.length) aoa.push([""]);
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const nm = `${baseName(f.name).slice(0, 20)}-${p}`.slice(0, 31) || `Sheet${p}`;
        XLSX.utils.book_append_sheet(wb, ws, nm);
        if (wb.SheetNames.length >= 60) break;
      }
    }
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    return [{ name: `${baseName(pdfs[0].name)}.xlsx`, kind: "blob", blob, url: URL.createObjectURL(blob), size: blob.size, type: blob.type }];
  }

  async function modeCompress(pdfs, onProgress) {
    const q = (+$("#cpQuality").value) / 100;
    const scale = (+$("#cpScale").value) / 10;
    const items = [];
    for (const f of pdfs) {
      for (let p = 1; p <= f.pageCount; p++) {
        onProgress && onProgress(`压缩 ${f.name} 第 ${p}/${f.pageCount} 页…`);
        const cv = await renderPageCanvas(f.doc, p, scale);
        items.push({ canvas: cv, type: "image/jpeg", q, scale });
      }
    }
    const bytes = await canvasesToPdf(items);
    const orig = pdfs.reduce((a, f) => a + f.size, 0);
    return [Object.assign(blobUrlBlob(bytes, `compressed_${Date.now()}.pdf`), { orig })];
  }

  async function modeOffice(pdfs, onProgress) {
    if (officeOk === null) await checkOffice();
    if (!officeOk) throw new Error('未检测到本机转换服务，请先双击运行 server/start.bat，然后刷新本页');
    const to = $("#ofTarget .active").dataset.v;
    const res = [];
    for (const f of pdfs) {
      onProgress && onProgress(`LibreOffice 转换中（可能需 10~30 秒）…`);
      const r = await fetch(`${OFFICE_URL}/convert?to=${to}`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf", "x-filename": encodeURIComponent(f.name) },
        body: f.file,
      });
      if (!r.ok) throw new Error((await r.text()).slice(0, 200) || "转换失败");
      const blob = await r.blob();
      const ext = to === "pptx" ? "pptx" : "docx";
      res.push({ name: `${baseName(f.name)}.${ext}`, kind: "blob", blob, url: URL.createObjectURL(blob), size: blob.size, type: blob.type, orig: f.size });
    }
    return res;
  }

  async function checkOffice() {
    try {
      const r = await fetch(OFFICE_URL + "/health", { cache: "no-store" });
      const j = await r.json();
      officeOk = !!j.ok;
    } catch (e) {
      officeOk = false;
    }
    renderOfficeStatus();
  }
  function renderOfficeStatus() {
    const el = $("#ofStatus");
    if (!el) return;
    if (officeOk === null) el.innerHTML = "正在检测本机转换服务…";
    else if (officeOk) el.innerHTML = '<b style="color:var(--ok)">✅ 已连接本机转换服务</b>，可进行高保真转换。';
    else el.innerHTML = '<b style="color:var(--danger)">❌ 未检测到本机转换服务</b>。请先双击运行 <code>server/start.bat</code>，保持窗口开启后刷新本页。';
  }

  /* ---------------- run ---------------- */
  async function run() {
    const err = $("#err"); err.textContent = "";
    const pdfs = state.files.filter((f) => f.kind === "pdf");
    const images = state.files.filter((f) => f.kind === "image");
    const mode = state.mode;

    if (mode === "img2pdf") { if (!images.length) { err.textContent = "请选择图片文件。"; return; } }
    else if (!pdfs.length) { err.textContent = "请选择 PDF 文件。"; return; }

    const btn = $("#runBtn"); btn.disabled = true;
    const setP = (t) => (btn.textContent = t || "处理中…");
    setP("处理中…");
    clearResults();
    const onProgress = (t) => setP(t);
    try {
      let out = [];
      if (mode === "merge") out = await modeMerge(pdfs, onProgress);
      else if (mode === "split") out = await modeSplit(pdfs);
      else if (mode === "delete") out = await modeDelete(pdfs);
      else if (mode === "rotate") out = await modeRotate(pdfs);
      else if (mode === "pagenum") out = await modePageNum(pdfs);
      else if (mode === "watermark") out = await modeWatermark(pdfs, onProgress);
      else if (mode === "toimage") out = await modeToImage(pdfs, onProgress);
      else if (mode === "img2pdf") out = await modeImg2Pdf(images);
      else if (mode === "text") out = await modeText(pdfs, onProgress);
      else if (mode === "word") out = await modeWord(pdfs, onProgress);
      else if (mode === "excel") out = await modeExcel(pdfs, onProgress);
      else if (mode === "office") out = await modeOffice(pdfs, onProgress);
      else if (mode === "compress") out = await modeCompress(pdfs, onProgress);
      else if (mode === "reorder") out = await modeReorder(pdfs);
      else if (mode === "secure") out = await modeSecure(pdfs, onProgress);
      out.forEach((r) => { r.id = uid(); state.results.push(r); });
      renderResults();
    } catch (e) {
      console.error(e);
      err.textContent = "处理出错：" + (e && e.message ? e.message : e);
    } finally {
      btn.disabled = state.files.length === 0;
      btn.textContent = "开始处理";
    }
  }

  function clearResults() {
    state.results.forEach((r) => { if (r.url) URL.revokeObjectURL(r.url); });
    state.results = [];
    renderResults();
  }
  function renderResults() {
    const box = $("#results"); box.innerHTML = "";
    if (!state.results.length) {
      box.innerHTML = '<div class="empty">处理后的文件会出现在这里</div>';
      $("#resultActions").style.display = "none";
      return;
    }
    $("#resultActions").style.display = "flex";
    state.results.forEach((r) => {
      const d = document.createElement("div");
      d.className = "result";
      let sz = fmtBytes(r.size);
      if (r.orig && r.orig > 0) {
        const delta = ((r.size - r.orig) / r.orig) * 100;
        const cls = delta <= 0 ? "delta-down" : "delta-up";
        sz = `${fmtBytes(r.orig)} → <b>${fmtBytes(r.size)}</b> <span class="${cls}">(${delta <= 0 ? "−" : "+"}${Math.abs(delta).toFixed(0)}%)</span>`;
      }
      const icon = (r.type || "").includes("pdf") ? "📕" : (r.type || "").includes("word") ? "📘" : (r.type || "").includes("sheet") ? "📗" : (r.type || "").includes("text") ? "📄" : "🖼️";
      d.innerHTML = `<div style="width:54px;height:54px;border-radius:8px;border:1px solid var(--line);background:var(--surface-3);display:grid;place-items:center;font-size:24px">${icon}</div>
        <div class="meta"><div class="nm">${esc(r.name)}</div><div class="sz">${sz}</div></div>
        <button class="btn ghost dl">下载</button>`;
      d.querySelector(".dl").onclick = () => {
        const a = document.createElement("a"); a.href = r.url; a.download = r.name;
        document.body.appendChild(a); a.click(); a.remove();
      };
      box.appendChild(d);
    });
  }
  async function downloadAll() {
    if (!state.results.length) return;
    const zip = new JSZip();
    const seen = {};
    state.results.forEach((r) => {
      let n = r.name;
      if (seen[n]) { seen[n]++; n = n.replace(/(\.[^.]+)$/, `_${seen[n]}$1`); } else seen[n] = 1;
      zip.file(n, r.blob);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `pdf_toolbox_${Date.now()}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------------- wiring ---------------- */
  function selectTab(mode) {
    state.mode = mode;
    $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $$(".mode-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.mode !== mode));
    if (mode === "office" && officeOk !== true) checkOffice();
    if (mode === "reorder") renderReorder();
    if (mode === "secure") { const b = $("#runBtn"); if (b) b.textContent = "开始处理"; }
  }
  function segGroup(sel) {
    const root = $(sel);
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", root).forEach((x) => x.classList.toggle("active", x === b));
    });
  }
  function init() {
    $("#fileInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    drop.addEventListener("click", () => $("#fileInput").click());

    $("#clearBtn").onclick = () => {
      state.files.forEach((f) => {
        if (f.url) URL.revokeObjectURL(f.url);
        if (f.doc) { try { f.doc.destroy(); } catch (e) {} }
      });
      if (state.ro && state.ro.doc) { try { state.ro.doc.destroy(); } catch (e) {} }
      state.ro = null;
      state.files = [];
      renderThumbs();
    };
    $("#clearResults").onclick = clearResults;
    $("#zipBtn").onclick = downloadAll;
    $("#runBtn").onclick = run;
    $$("#tabs .tab").forEach((b) => (b.onclick = () => selectTab(b.dataset.mode)));
    ["#splitOut", "#rotAngle", "#wmLayout", "#ipSize", "#xlMode", "#ofTarget"].forEach(segGroup);
    $("#wmSize").oninput = (e) => ($("#wmSizeVal").textContent = e.target.value + "%");
    if ($("#roReset")) $("#roReset").onclick = () => { if (!state.ro) return; state.ro.order = Array.from({ length: state.ro.total }, (_, i) => i); renderReorder2(); };
    if ($("#roReverse")) $("#roReverse").onclick = () => { if (!state.ro) return; state.ro.order = state.ro.order.slice().reverse(); renderReorder2(); };
    if ($("#scMode")) $("#scMode").onchange = () => { const isDec = $("#scMode").value === "decrypt"; $("#scPermRow").style.display = isDec ? "none" : ""; };
    $("#wmOpacity").oninput = (e) => ($("#wmOpVal").textContent = e.target.value + "%");
    $("#tiScale").oninput = (e) => ($("#tiScaleVal").textContent = ((+e.target.value) / 10).toFixed(1) + "x");
    $("#cpScale").oninput = (e) => ($("#cpScaleVal").textContent = ((+e.target.value) / 10).toFixed(1) + "x");
    $("#cpQuality").oninput = (e) => ($("#cpQVal").textContent = e.target.value + "%");
    selectTab("merge");
    renderThumbs();
    checkOffice();
  }
  /* ---------------- 最近打开（记忆） ---------------- */
  window.TBX_onRecentFiles = (files) => { if (files && files.length) addFiles(files); };
  window.TBX_onRecentFile = (file) => { if (file) addFiles([file]); };
  window.TBX_onFileMiss = () => { const i = $("#fileInput"); if (i) i.click(); };
  (function wireRecent() {
    const b = document.getElementById("recentClear");
    const badge = document.getElementById("recentBadge");
    if (badge) badge.textContent = (window.TBX_recent && TBX_recent.canReopen()) ? "可直接重新打开" : "仅记录文件名";
    if (b) b.onclick = async () => {
      if (!window.TBX_recent) return;
      if (!confirm("清空「最近打开」记录？（不会删除你的文件）")) return;
      await TBX_recent.clear("pdf");
      if (window.TBX_refreshRecent) TBX_refreshRecent();
    };
  })();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();