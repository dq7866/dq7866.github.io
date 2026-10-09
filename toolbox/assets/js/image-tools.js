/* 图片工具箱 · 纯前端实现
   所有处理均在浏览器本地完成（Canvas），不上传任何数据。 */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    files: [],
    mode: "compress",
    results: [],
    shapeLayers: [],
    shapeSel: null,
    shapeParamsOpen: null,
    freeMode: false,
    /* --- undo/redo 历史 --- */
    history: [],   // 过去的结果快照（可撤销）
    future: [],    // 未来的结果快照（可重做）
    maxHistory: 10 // 最大历史记录数
  };

  /* ---------------- utils ---------------- */
  const fmtBytes = (n) => {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  };
  const baseName = (name) => String(name).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "image";
  const extFor = (t) => (t === "image/png" ? "png" : t === "image/webp" ? "webp" : t === "image/gif" ? "gif" : "jpg");
  const uid = () => Math.random().toString(36).slice(2, 9);
  const he = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function loadImageFromBlob(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => res({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("无法读取该图片")); };
      img.src = url;
    });
  }

  function newCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((res, rej) => {
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("导出失败：当前浏览器不支持 " + type))),
        type,
        quality
      );
    });
  }

  const needsFill = (t) => t === "image/jpeg";
  const outType = (fmt, f) => {
    if (fmt && fmt !== "auto") return fmt;
    if (f.type === "image/png") return "image/png";
    if (f.type === "image/webp") return "image/webp";
    return "image/jpeg";
  };

  function drawContain(ctx, img, dx, dy, dw, dh) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /* ---------------- history (undo/redo) ---------------- */

  // 模式对应的中文标签，用于撤销提示
  const MODE_LABELS = {
    compress: "压缩",
    resize: "改尺寸",
    convert: "格式转换",
    watermark: "加水印",
    grid: "九宫格切图",
    collage: "拼图",
    shape: "形状裁剪",
    base64: "转 Base64",
    rename: "批量重命名",
    ai: "AI 抠图"
  };

  // 克隆一组结果（为每个结果创建新的 blob URL，blob 本身可共享）
  // 确保每个历史条目拥有独立的 URL，撤销旧条目时不会影响当前或更新的条目
  function cloneResults(results) {
    if (!results) return [];
    return results.map((r) => {
      const cloned = { ...r };
      if (r.blob && r.url) {
        cloned.url = URL.createObjectURL(r.blob);
      }
      return cloned;
    });
  }

  // 撤销某个 results 数组中所有 blob 的 URL（释放内存）
  function revokeResultsBlobs(results) {
    if (!results || !results.length) return;
    results.forEach((r) => {
      if (r.url) {
        try { URL.revokeObjectURL(r.url); } catch (e) { /* ignore */ }
      }
    });
  }

  // 捕获当前设置快照（用于历史记录的描述信息）
  function captureSettings() {
    const mode = state.mode;
    const s = { mode };
    try {
      if (mode === "compress") {
        s.quality = $("#quality").value + "%";
        s.format = $("#compressFmt") ? $("#compressFmt").value : "";
      } else if (mode === "resize") {
        const m = $("#resizeMode .active") ? $("#resizeMode .active").dataset.v : "";
        s.resizeMode = m;
        if (m === "percent") s.percent = $("#resizePercent").value + "%";
        else s.size = ($("#resizeW").value || "?") + "x" + ($("#resizeH").value || "?");
      } else if (mode === "convert") {
        s.format = $("#convertFmt") ? $("#convertFmt").value : "";
      } else if (mode === "watermark") {
        s.text = $("#wmText") ? $("#wmText").value : "";
        s.pos = $("#wmPos .active") ? $("#wmPos .active").dataset.v : "";
      } else if (mode === "grid") {
        s.gridN = $("#gridN .active") ? $("#gridN .active").dataset.v : "";
      } else if (mode === "collage") {
        s.dir = $("#collageDir .active") ? $("#collageDir .active").dataset.v : "";
      } else if (mode === "shape") {
        s.layerCount = state.shapeLayers.length;
      } else if (mode === "base64") {
        s.format = $("#b64Fmt") ? $("#b64Fmt").value : "";
      } else if (mode === "rename") {
        s.template = $("#rnTpl") ? $("#rnTpl").value : "";
      } else if (mode === "ai") {
        s.aiMode = $("#aiMode") ? $("#aiMode").value : "";
      }
    } catch (e) { /* ignore capture errors */ }
    return s;
  }

  // 生成一条历史记录的描述文字
  function describeSnapshot(snap) {
    if (!snap || !snap.settings) return "";
    const s = snap.settings;
    if (s._action === "clear") return "清除结果";
    const label = MODE_LABELS[s.mode] || s.mode;
    const count = snap.results ? snap.results.length : 0;
    let detail = "";
    if (s.mode === "compress") detail = s.quality ? `（质量 ${s.quality}）` : "";
    else if (s.mode === "resize") detail = s.percent ? `（${s.percent}）` : (s.size ? `（${s.size}）` : "");
    else if (s.mode === "convert") detail = "";
    else if (s.mode === "watermark") detail = s.text ? `（${s.text.slice(0, 10)}）` : "";
    else if (s.mode === "grid") detail = s.gridN ? `（${s.gridN}×${s.gridN}）` : "";
    else if (s.mode === "collage") detail = s.dir ? `（${s.dir === "vertical" ? "纵向" : s.dir === "horizontal" ? "横向" : "网格"}）` : "";
    else if (s.mode === "shape") detail = `（${s.layerCount || 0} 个形状）`;
    return `${label}${detail} · ${count} 个结果`;
  }

  // 将一组结果推入历史栈
  // resultsSnap: 要保存的 results 数组快照
  // settings: 当时的设置对象
  function pushHistory(resultsSnap, settings) {
    const entry = {
      results: cloneResults(resultsSnap || []),
      settings: settings || captureSettings(),
      timestamp: Date.now()
    };

    state.history.push(entry);

    // 新操作会清空重做栈（形成新分支）
    revokeResultsBlobs(state.future.flatMap((e) => e.results || []));
    state.future = [];

    // 超过最大历史数时，丢弃最旧的记录并释放 blob
    while (state.history.length > state.maxHistory) {
      const oldest = state.history.shift();
      revokeResultsBlobs(oldest.results);
    }

    updateHistoryButtons();
  }

  // 撤销：回到上一个结果状态
  function undo() {
    if (!state.history.length) return false;

    const prev = state.history.pop();
    // 当前结果移入未来栈
    state.future.push({
      results: state.results,
      settings: captureSettings(),
      timestamp: Date.now()
    });
    // 恢复上一个结果
    state.results = prev.results;

    renderResults();
    updateHistoryButtons();

    // 提示撤销了什么
    showHistoryToast("撤销：" + describeSnapshot(prev));
    return true;
  }

  // 重做：前进到下一个结果状态
  function redo() {
    if (!state.future.length) return false;

    const next = state.future.pop();
    // 当前结果移入历史栈
    state.history.push({
      results: state.results,
      settings: captureSettings(),
      timestamp: Date.now()
    });
    // 恢复下一个结果
    state.results = next.results;

    renderResults();
    updateHistoryButtons();

    showHistoryToast("重做：" + describeSnapshot(next));
    return true;
  }

  // 更新撤销/重做按钮的可用状态
  function updateHistoryButtons() {
    const undoBtn = $("#undoBtn");
    const redoBtn = $("#redoBtn");
    if (undoBtn) {
      undoBtn.disabled = state.history.length === 0;
      const top = state.history[state.history.length - 1];
      undoBtn.title = top ? ("撤销 " + describeSnapshot(top) + " (Ctrl+Z)") : "没有可撤销的操作 (Ctrl+Z)";
    }
    if (redoBtn) {
      redoBtn.disabled = state.future.length === 0;
      const top = state.future[state.future.length - 1];
      redoBtn.title = top ? ("重做 " + describeSnapshot(top) + " (Ctrl+Y / Ctrl+Shift+Z)") : "没有可重做的操作 (Ctrl+Y)";
    }
  }

  // 显示一个短暂的提示气泡
  let _toastTimer = null;
  function showHistoryToast(msg) {
    let toast = $("#historyToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "historyToast";
      toast.style.cssText = "position:fixed;bottom:28px;left:50%;transform:translateX(-50%);" +
        "background:rgba(30,30,30,.92);color:#fff;padding:9px 18px;border-radius:8px;" +
        "font-size:13.5px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .2s;";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = "1";
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { toast.style.opacity = "0"; }, 1400);
  }

  // 在结果面板标题栏注入撤销/重做按钮
  function initHistoryUI() {
    const panelHead = document.querySelector('.panel-head h2');
    // 找到"处理结果"所在的 panel-head
    const heads = $$('.panel-head');
    let targetHead = null;
    for (const h of heads) {
      const h2 = h.querySelector('h2');
      if (h2 && h2.textContent.indexOf('处理结果') >= 0) {
        targetHead = h;
        break;
      }
    }
    if (!targetHead) return;

    const wrap = document.createElement("div");
    wrap.className = "history-btns";
    wrap.style.cssText = "display:flex;gap:4px;margin-left:8px;";
    wrap.innerHTML = `
      <button class="btn ghost" id="undoBtn" disabled style="padding:4px 10px;font-size:13px">↶ 撤销</button>
      <button class="btn ghost" id="redoBtn" disabled style="padding:4px 10px;font-size:13px">↷ 重做</button>
    `;
    targetHead.appendChild(wrap);

    $("#undoBtn").onclick = undo;
    $("#redoBtn").onclick = redo;

    updateHistoryButtons();
  }

  /* ---------------- file loading ---------------- */
  async function addFiles(list) {
    const arr = Array.from(list || []).filter((f) => f && f.type.startsWith("image/"));
    if (!arr.length) return;
    for (const file of arr) {
      try {
        const { img, url } = await loadImageFromBlob(file);
        state.files.push({
          id: uid(),
          file,
          name: file.name || "image.png",
          type: file.type || "image/png",
          size: file.size,
          img,
          url,
          w: img.naturalWidth,
          h: img.naturalHeight,
        });
        if (window.TBX_rememberFile) TBX_rememberFile("image", file);
      } catch (e) {
      }
    }
    renderThumbs();
  }

  function removeFile(id) {
    const i = state.files.findIndex((f) => f.id === id);
    if (i < 0) return;
    URL.revokeObjectURL(state.files[i].url);
    state.files.splice(i, 1);
    renderThumbs();
  }

  function renderThumbs() {
    const box = $("#thumbs");
    box.innerHTML = "";
    state.files.forEach((f) => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.title = `${f.name}\n${f.w}×${f.h} · ${fmtBytes(f.size)}`;
      d.innerHTML = `<img src="${f.url}" alt=""><button class="x" title="移除">×</button>`;
      d.querySelector(".x").onclick = () => removeFile(f.id);
      box.appendChild(d);
    });
    const n = state.files.length;
    $("#fileCount").textContent = n ? `已选择 ${n} 张图片` : "尚未选择图片";
    $("#clearBtn").disabled = !n;
    $("#runBtn").disabled = !n;
    if (state.mode === "shape") shapeRender();
  }

  /* ---------------- processing ---------------- */
  async function renderImage(f, w, h, type, q, opts = {}) {
    const c = newCanvas(w, h);
    const ctx = c.getContext("2d");
    if (needsFill(type) || opts.fill) {
      ctx.fillStyle = opts.fill || "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(f.img, 0, 0, c.width, c.height);
    if (opts.watermark) drawWatermark(ctx, c, opts.watermark);
    const blob = await canvasToBlob(c, type, q);
    return blob;
  }

  function drawWatermark(ctx, canvas, o) {
    const w = canvas.width, h = canvas.height;
    const fs = Math.max(10, Math.round((Math.min(w, h) * o.size) / 100));
    ctx.save();
    ctx.font = `600 ${fs}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
    ctx.fillStyle = o.color;
    ctx.globalAlpha = o.opacity;
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = Math.round(fs * 0.4);
    ctx.shadowOffsetY = Math.round(fs * 0.06);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const pad = Math.round(Math.min(w, h) * 0.035);
    const tw = ctx.measureText(o.text).width;
    const asc = fs;
    let x = pad, y = h - pad;
    switch (o.pos) {
      case "tl": x = pad; y = pad + asc; break;
      case "tr": x = w - pad - tw; y = pad + asc; break;
      case "bl": x = pad; y = h - pad; break;
      case "br": x = w - pad - tw; y = h - pad; break;
      case "center": ctx.textAlign = "center"; x = w / 2; y = h / 2 + fd(fs); break;
    }
    ctx.fillText(o.text, x, y);
    ctx.restore();
  }
  const fd = (fs) => 0;

  async function processCompress(f, q) {
    const type = outType($("#compressFmt").value, f);
    const blob = await renderImage(f, f.img.naturalWidth, f.img.naturalHeight, type, q);
    return [{ name: `${baseName(f.name)}_compressed.${extFor(type)}`, blob, orig: f.size }];
  }

  async function processResize(f, q) {
    const m = $("#resizeMode .active").dataset.v;
    const lock = $("#resizeLock").checked;
    const nw = f.img.naturalWidth, nh = f.img.naturalHeight;
    let w = nw, h = nh;
    if (m === "percent") {
      const pct = parseFloat($("#resizePercent").value) || 100;
      const p = Math.max(0.01, pct / 100);
      w = nw * p;
      h = nh * p;
    } else {
      // custom size mode
      const inputW = parseFloat($("#resizeW").value) || nw;
      const inputH = parseFloat($("#resizeH").value) || nh;
      w = Math.max(1, inputW);
      h = Math.max(1, inputH);
      if (lock) {
        // 锁定宽高比：以最后修改的输入为准，这里以宽度为基准计算高度
        const ratio = nh / nw;
        h = Math.max(1, Math.round(w * ratio));
      }
    }
    const type = outType($("#resizeFmt").value, f);
    const blob = await renderImage(f, w, h, type, q);
    return [{ name: `${baseName(f.name)}_${Math.round(w)}x${Math.round(h)}.${extFor(type)}`, blob, orig: f.size }];
  }

  async function processConvert(f, q) {
    const type = $("#convertFmt").value;
    const blob = await renderImage(f, f.img.naturalWidth, f.img.naturalHeight, type, q);
    return [{ name: `${baseName(f.name)}.${extFor(type)}`, blob, orig: f.size }];
  }

  async function processWatermark(f, q) {
    const o = {
      text: $("#wmText").value || "水印",
      pos: $("#wmPos .active").dataset.v,
      size: +$("#wmSize").value,
      opacity: (+$("#wmOpacity").value) / 100,
      color: $("#wmColor").value,
    };
    const type = outType("auto", f);
    const blob = await renderImage(f, f.img.naturalWidth, f.img.naturalHeight, type, q, { watermark: o });
    return [{ name: `${baseName(f.name)}_wm.${extFor(type)}`, blob, orig: f.size }];
  }

  async function processGrid(f, q) {
    const n = +$("#gridN .active").dataset.v;
    const type = $("#gridFmt").value;
    const W = f.img.naturalWidth, H = f.img.naturalHeight;
    const xs = Array.from({ length: n + 1 }, (_, i) => Math.round((i * W) / n));
    const ys = Array.from({ length: n + 1 }, (_, i) => Math.round((i * H) / n));
    const out = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const tw = xs[c + 1] - xs[c], th = ys[r + 1] - ys[r];
        const cv = newCanvas(tw, th);
        const ctx = cv.getContext("2d");
        if (needsFill(type)) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tw, th); }
        ctx.drawImage(f.img, xs[c], ys[r], tw, th, 0, 0, tw, th);
        const blob = await canvasToBlob(cv, type, q);
        out.push({ name: `${baseName(f.name)}_${r + 1}${c + 1}.${extFor(type)}`, blob, orig: Math.round(f.size / (n * n)) });
      }
    }
    return out;
  }

  async function processCollage(files, q) {
    const dir = $("#collageDir .active").dataset.v;
    const gap = Math.max(0, +$("#collageGap").value || 0);
    const bg = $("#collageBg").value;
    const target = Math.max(100, +$("#collageW").value || 1200);
    const type = "image/jpeg";
    let cv, ctx;

    if (dir === "vertical") {
      const s = target / files[0].img.naturalWidth;
      const scaled = files.map((f) => ({ f, w: target, h: Math.round(f.img.naturalHeight * (target / f.img.naturalWidth)) }));
      const H = scaled.reduce((a, b) => a + b.h, 0) + gap * (scaled.length - 1);
      cv = newCanvas(target, H); ctx = cv.getContext("2d");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
      let y = 0;
      scaled.forEach((s0) => { drawContain(ctx, s0.f.img, 0, y, s0.w, s0.h); y += s0.h + gap; });
    } else if (dir === "horizontal") {
      const H = target;
      const scaled = files.map((f) => ({ f, h: H, w: Math.round((f.img.naturalWidth * H) / f.img.naturalHeight) }));
      const W = scaled.reduce((a, b) => a + b.w, 0) + gap * (scaled.length - 1);
      cv = newCanvas(W, H); ctx = cv.getContext("2d");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
      let x = 0;
      scaled.forEach((s0) => { drawContain(ctx, s0.f.img, x, 0, s0.w, s0.h); x += s0.w + gap; });
    } else {
      const n = files.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const cellW = Math.floor((target - gap * (cols + 1)) / cols);
      const scaled = files.map((f) => ({ f, w: cellW, h: Math.round((f.img.naturalHeight * cellW) / f.img.naturalWidth) }));
      const cellH = Math.max(...scaled.map((s0) => s0.h));
      const W = cellW * cols + gap * (cols + 1);
      const H = cellH * rows + gap * (rows + 1);
      cv = newCanvas(W, H); ctx = cv.getContext("2d");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
      scaled.forEach((s0, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const x = gap + c * (cellW + gap);
        const y = gap + r * (cellH + gap) + Math.round((cellH - s0.h) / 2);
        drawContain(ctx, s0.f.img, x, y, s0.w, s0.h);
      });
    }
    const blob = await canvasToBlob(cv, type, q);
    const orig = files.reduce((a, f) => a + f.size, 0);
    return [{ name: `collage_${Date.now()}.jpg`, blob, orig }];
  }

  async function processBase64(f, q) {
    const type = $("#b64Fmt").value;
    const cv = newCanvas(f.img.naturalWidth, f.img.naturalHeight);
    const ctx = cv.getContext("2d");
    if (needsFill(type)) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.drawImage(f.img, 0, 0, cv.width, cv.height);
    const data = cv.toDataURL(type, q);
    return [{ kind: "text", name: `${baseName(f.name)}.${extFor(type)}`, data }];
  }

  /* ---------------- run ---------------- */
  /* ---------------- 批量重命名（无损，只改名字） ---------------- */
  async function processRename(files) {
    const tpl = ($("#rnTpl").value || "图片_{n}").trim();
    const start = parseInt($("#rnStart").value, 10);
    const pad = Math.max(0, Math.min(6, parseInt($("#rnPad").value, 10) || 0));
    const extSel = $("#rnExt").value;
    const lower = $("#rnLower").checked;
    const used = {};
    const named = files.map((f, i) => {
      const orig = String(f.name || "image").replace(/\.[^.]+$/, "");
      const origExt = String(f.name || "image.png").match(/\.([^.]+)$/);
      const n = String((isNaN(start) ? 1 : start) + i).padStart(pad, "0");
      let base = tpl.replace(/\{n\}/g, n).replace(/\{orig\}/g, orig).replace(/[\\/:*?"<>|]+/g, "_").trim() || "image";
      if (lower) base = base.toLowerCase();
      const ext = extSel || (origExt ? origExt[1] : "png");
      let full = base + "." + ext;
      if (used[full]) { used[full]++; full = base + "_" + used[full] + "." + ext; } else used[full] = 1;
      return { name: full, file: f.file };
    });
    const zip = new JSZip();
    named.forEach((x) => zip.file(x.name, x.file));
    const blob = await zip.generateAsync({ type: "blob" });
    return [{ name: `已重命名_${named.length}张_${Date.now()}.zip`, blob, kind: "file" }];
  }

  /* ---------------- AI 抠图（U2Net，本地） ---------------- */
  const BG_SVC = "http://127.0.0.1:8765";
  async function aiCutOne(f, mode, feather) {
    const qs = new URLSearchParams({ mode: mode, feather: String(feather) });
    const rr = await fetch(BG_SVC + "/image/bgremove?" + qs, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(f.name) },
      body: f.file,
    });
    if (!rr.ok) { let t = ""; try { t = await rr.text(); } catch (e) {} throw new Error(t || ("抠图失败 HTTP " + rr.status)); }
    return await rr.blob();
  }
  async function processAiCut(files) {
    const mode = $("#aiMode") ? $("#aiMode").value : "cutout";
    const feather = $("#aiFeather") ? $("#aiFeather").value : "1";
    let ok = 0; let lastErr = "";
    const done = [];
    for (const [i, f] of files.entries()) {
      if ($("#aiHint")) $("#aiHint").textContent = `正在处理 ${i + 1} / ${files.length}：${f.name}`;
      try {
        const blob = await aiCutOne(f, mode, feather);
        done.push({ name: String(f.name).replace(/\.[^.]+$/, "") + (mode === "cutout" ? "_抠图.png" : "_换底.png"), blob });
        ok++;
      } catch (e) { console.error(e); lastErr = e.message; }
    }
    if ($("#aiHint")) $("#aiHint").textContent = "";
    if (!ok) throw new Error(lastErr || "AI 抠图需要本机增强服务，在线版不提供；其余图片功能不受影响");
    if (done.length === 1) return [{ name: done[0].name, blob: done[0].blob, kind: "image" }];
    const zip = new JSZip();
    done.forEach((x) => zip.file(x.name, x.blob));
    const z = await zip.generateAsync({ type: "blob" });
    return [{ name: `抠图_${done.length}张_${Date.now()}.zip`, blob: z, kind: "file" }];
  }

  async function run() {
    const err = $("#err"); err.textContent = "";
    if (!state.files.length) { err.textContent = "请先选择图片。"; return; }
    const runBtn = $("#runBtn");
    runBtn.disabled = true; runBtn.textContent = "处理中…";

    // 保存当前结果快照（用于历史记录，不释放 blob）
    const prevResults = state.results;
    const prevSettings = captureSettings();
    // 直接清空引用（不清空 blob，因为 prevResults 还引用着，可能被推入历史）
    state.results = [];
    renderResults();

    const mode = state.mode;
    const q = (() => {
      if (mode === "compress") return (+$("#quality").value) / 100;
      if (mode === "convert") return (+$("#convertQ").value) / 100;
      return 0.92;
    })();

    try {
      const out = [];
      if (mode === "collage") {
        const r = await processCollage(state.files, q);
        out.push(...r);
      } else if (mode === "rename") {
        const r = await processRename(state.files);
        out.push(...r);
      } else if (mode === "ai") {
        const r = await processAiCut(state.files);
        out.push(...r);
      } else {
        const total = state.files.length;
        for (const [i, f] of state.files.entries()) {
          runBtn.textContent = `处理中 ${i + 1}/${total}`;
          let r;
          if (mode === "compress") r = await processCompress(f, q);
          else if (mode === "resize") r = await processResize(f, q);
          else if (mode === "convert") r = await processConvert(f, q);
          else if (mode === "watermark") r = await processWatermark(f, q);
          else if (mode === "grid") r = await processGrid(f, q);
          else if (mode === "base64") r = await processBase64(f, q);
          else r = [];
          out.push(...r);
        }
      }
      out.forEach((r) => {
        if (r.kind === "text") {
          state.results.push({ ...r, id: uid() });
        } else {
          state.results.push({ ...r, kind: r.kind === "file" ? "file" : "image", id: uid(), url: URL.createObjectURL(r.blob), size: r.blob.size, type: r.blob.type });
        }
      });

      // 成功后将旧结果推入历史（克隆后释放原始 URL）
      pushHistory(prevResults, prevSettings);
      revokeResultsBlobs(prevResults);

      renderResults();
    } catch (e) {
      console.error(e);
      err.textContent = "处理出错：" + (e && e.message ? e.message : e);
      // 失败时恢复旧结果
      state.results = prevResults;
      renderResults();
    } finally {
      runBtn.disabled = state.files.length === 0;
      runBtn.textContent = "开始处理";
    }
  }

  function clearResults() {
    // 将当前结果推入历史（如果有内容），然后清空
    if (state.results.length > 0) {
      pushHistory(state.results, { mode: state.mode, _manual: true, _action: "clear" });
    }
    // 注意：不释放 blob，因为它们在历史栈中仍然被引用
    // 历史栈在被修剪时会自动释放
    state.results = [];
    renderResults();
  }

  function renderResults() {
    const box = $("#results");
    box.innerHTML = "";
    if (!state.results.length) {
      box.innerHTML = '<div class="empty">处理后的文件会出现在这里</div>';
      $("#resultActions").style.display = "none";
      return;
    }
    $("#resultActions").style.display = "flex";
    state.results.forEach((r) => {
      const d = document.createElement("div");
      d.className = "result";
      if (r.kind === "text") {
        d.innerHTML = `
          <img src="${r.data}" alt="">
          <div class="meta"><div class="nm">${he(r.name)} · Base64</div>
          <div class="sz">${fmtBytes(r.data.length)}</div></div>
          <button class="btn ghost copy" data-id="${r.id}">复制</button>`;
        d.querySelector(".copy").onclick = (e) => copyText(r.data, e.target);
      } else if (r.kind === "file") {
        d.innerHTML = `
          <div style="width:56px;height:56px;border-radius:8px;border:1px solid var(--line);background:var(--surface-3);display:grid;place-items:center;font-size:24px">📦</div>
          <div class="meta"><div class="nm">${he(r.name)}</div>
          <div class="sz">${fmtBytes(r.size)}</div></div>
          <button class="btn ghost dl" data-id="${r.id}">下载</button>`;
        d.querySelector(".dl").onclick = () => download(r);
      } else {
        let szLine = fmtBytes(r.size);
        if (r.orig && r.orig > 0) {
          const d = ((r.size - r.orig) / r.orig) * 100;
          const cls = d <= 0 ? "delta-down" : "delta-up";
          const sign = d <= 0 ? "−" : "+";
          szLine = `${fmtBytes(r.orig)} → <b>${fmtBytes(r.size)}</b> <span class="${cls}">(${sign}${Math.abs(d).toFixed(0)}%)</span>`;
        }
        d.innerHTML = `
          <img src="${r.url}" alt="">
          <div class="meta"><div class="nm">${he(r.name)}</div>
          <div class="sz">${szLine}</div></div>
          <div class="result-btns">
            <button class="btn ghost copy-img" data-id="${r.id}">复制图片</button>
            <button class="btn ghost dl" data-id="${r.id}">下载</button>
          </div>`;
        d.querySelector(".dl").onclick = () => download(r);
        d.querySelector(".copy-img").onclick = (e) => copyImage(r.blob, e.target);
      }
      box.appendChild(d);
    });

    // 每次渲染结果后更新撤销/重做按钮状态
    updateHistoryButtons();
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(
      () => { const t = btn.textContent; btn.textContent = "已复制"; setTimeout(() => (btn.textContent = t), 1200); },
      () => alert("复制失败，请手动选择文本复制。")
    );
  }

  function copyImage(blob, btn) {
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        .then(() => {
          if (btn) { const t = btn.textContent; btn.textContent = "已复制"; setTimeout(() => (btn.textContent = t), 1200); }
        })
        .catch(() => {
          fallbackCopyImage(blob, btn);
        });
    } else {
      fallbackCopyImage(blob, btn);
    }
  }

  function fallbackCopyImage(blob, btn) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        // 尝试使用 selection + execCommand 的方式
        const range = document.createRange();
        const sel = window.getSelection();
        // 将 canvas 临时插入文档并选中
        cv.style.position = "fixed";
        cv.style.left = "-9999px";
        cv.style.top = "0";
        document.body.appendChild(cv);
        range.selectNodeContents(cv);
        sel.removeAllRanges();
        sel.addRange(range);
        const ok = document.execCommand("copy");
        document.body.removeChild(cv);
        sel.removeAllRanges();
        if (ok) {
          if (btn) { const t = btn.textContent; btn.textContent = "已复制"; setTimeout(() => (btn.textContent = t), 1200); }
        } else {
          throw new Error("execCommand failed");
        }
      } catch (e) {
        if (btn) { const t = btn.textContent; btn.textContent = "复制失败"; setTimeout(() => (btn.textContent = t), 1500); }
        setTimeout(() => alert("浏览器不支持复制图片，请下载后使用"), 100);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (btn) { const t = btn.textContent; btn.textContent = "复制失败"; setTimeout(() => (btn.textContent = t), 1500); }
      setTimeout(() => alert("浏览器不支持复制图片，请下载后使用"), 100);
    };
    img.src = url;
  }

  function download(r) {
    const a = document.createElement("a");
    a.href = r.url; a.download = r.name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function downloadAll() {
    const imgs = state.results.filter((r) => r.kind === "image");
    if (!imgs.length) { alert("没有可下载的图片。"); return; }
    if (window.JSZip) {
      const zip = new JSZip();
      const seen = {};
      imgs.forEach((r) => {
        let n = r.name;
        if (seen[n]) { seen[n]++; n = n.replace(/(\.[^.]+)$/, `_${seen[n]}$1`); } else seen[n] = 1;
        zip.file(n, r.blob);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `toolbox_${Date.now()}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } else {
      for (let i = 0; i < imgs.length; i++) {
        setTimeout(() => download(imgs[i]), i * 350);
      }
    }
  }

  /* ================== 形状裁剪（Office 风格） ================== */
  const SHAPES = (window.TBX_SHAPES && window.TBX_SHAPES.defs) || {};
  const SHAPE_NAMES = (window.TBX_SHAPES && window.TBX_SHAPES.names) || {};
  const SHAPE_PARAMS = (window.TBX_SHAPES && window.TBX_SHAPES.paramsOf) || (() => []);

  const shapeBg = () => { const v = $("#shBg").value; return v === "transparent" ? null : v === "custom" ? $("#shBgColor").value : v; };
  const shRotate = (pts, rotDeg, cx, cy) => {
    const r = ((rotDeg || 0) * Math.PI) / 180;
    if (!r) return pts;
    const ca = Math.cos(r), sa = Math.sin(r);
    return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy; return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca]; });
  };
  const shLayerPts = (L, W, H) => {
    const gs = ((+$("#shScale").value) || 100) / 100;
    if (L.type === "free") {
      const s = L.s * gs;
      const pts = L.pts.map(([x, y]) => [(L.cx + (x - L.cx) * s) * W, (L.cy + (y - L.cy) * s) * H]);
      return shRotate(pts, L.rot, L.cx * W, L.cy * H);
    }
    const minDim = Math.min(W, H);
    const size = L.s * gs * minDim;
    const fn = SHAPES[L.type] || SHAPES.rect;
    const pts = fn(L.params || {}).map(([ux, uy]) => [L.cx * W + (ux - 0.5) * size, L.cy * H + (uy - 0.5) * size]);
    return shRotate(pts, L.rot, L.cx * W, L.cy * H);
  };
  function singlePath(L, W, H) {
    const p = new Path2D();
    let pts = shLayerPts(L, W, H);
    if (pts.length < 3) return p;
    if (L.mode === "sub") pts = pts.slice().reverse();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }
  function buildShapePath(W, H) {
    const p = new Path2D();
    for (const L of state.shapeLayers) p.addPath(singlePath(L, W, H));
    return p;
  }
  // 被其它并集形状完全包住的图层，描边时跳过（避免描边出现交叉内线）
  function containedIn(L, W, H) {
    const b = bboxOf(L, W, H);
    for (const O of state.shapeLayers) {
      if (O === L || O.mode === "sub") continue;
      const o = bboxOf(O, W, H);
      if (b.x0 >= o.x0 - 1 && b.y0 >= o.y0 - 1 && b.x1 <= o.x1 + 1 && b.y1 <= o.y1 + 1) return true;
    }
    return false;
  }
  function strokeShapes(ctx, path, W, H, width, color) {
    ctx.save();
    ctx.clip(path);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    for (const L of state.shapeLayers) {
      if (L.mode === "sub" || containedIn(L, W, H)) continue;
      ctx.stroke(singlePath(L, W, H));
    }
    ctx.restore();
  }
  function bboxOf(L, W, H) {
    const pts = shLayerPts(L, W, H);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
  function paintShape(ctx, W, H, withSel) {
    ctx.clearRect(0, 0, W, H);
    const path = buildShapePath(W, H);
    const bg = shapeBg();
    if (bg) { ctx.save(); ctx.clip(path); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    const img = state.files[0] && state.files[0].img;
    if (img) { ctx.save(); ctx.clip(path); ctx.drawImage(img, 0, 0, W, H); ctx.restore(); }
    const swPct = +$("#shStroke").value;
    if (swPct > 0) {
      const k = W / (state.files[0] ? Math.max(1, state.files[0].img.naturalWidth) : W);
      strokeShapes(ctx, path, W, H, swPct * 2 * Math.max(0.2, k), $("#shStrokeColor").value);
    }
    if (withSel && state.shapeSel) {
      const L = state.shapeLayers.find((x) => x.id === state.shapeSel);
      if (L) { const b = bboxOf(L, W, H); ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = "#ff4d00"; ctx.lineWidth = 1.5; ctx.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); ctx.restore(); }
    }
  }
  function shapeRender() {
    const cv = $("#shapeCanvas");
    if (!cv) return;
    const f = state.files[0];
    const MAXW = 900;
    if (!f) { cv.width = 640; cv.height = 360; const c2 = cv.getContext("2d"); c2.clearRect(0, 0, 640, 360); c2.fillStyle = "#00000010"; c2.fillRect(0, 0, 640, 360); $("#shInfo").textContent = "请先在左侧选择图片"; renderShapeLayers(); return; }
    const W = f.img.naturalWidth, H = f.img.naturalHeight;
    const k = Math.min(1, MAXW / Math.max(W, H));
    cv.width = Math.max(1, Math.round(W * k)); cv.height = Math.max(1, Math.round(H * k));
    paintShape(cv.getContext("2d"), cv.width, cv.height, true);
    const n = state.shapeLayers.length;
    $("#shInfo").textContent = `原图 ${W}×${H} · 形状图层 ${n} 个${state.freeMode ? " · ✏️ 自由绘制中：在图上拖动鼠标画形状" : ""}`;
    renderShapeLayers();
  }
  function renderShapeLayers() {
    const box = $("#shapeLayers"); if (!box) return;
    box.innerHTML = "";
    if (!state.shapeLayers.length) { box.innerHTML = '<div class="hint" style="margin:0">还没有形状，点上方按钮添加；不加形状则导出原图。</div>'; return; }
    state.shapeLayers.forEach((L) => {
      const d = document.createElement("div");
      d.className = "sl" + (state.shapeSel === L.id ? " active" : "");
      const open = state.shapeParamsOpen === L.id;
      const pt = SHAPE_PARAMS(L.type);
      let phtml = `<label>旋转 <input type="range" class="p-rot" min="-180" max="180" value="${L.rot || 0}"></label><span class="hint" style="margin:0">${L.rot || 0}°</span>`;
      if (pt.indexOf("radius") >= 0) phtml += `<label>圆角 <input type="range" class="p-radius" min="0" max="50" value="${(L.params && L.params.radius != null) ? L.params.radius : 22}"></label>`;
      if (pt.indexOf("points") >= 0) {
        phtml += `<label>角数 <input type="range" class="p-points" min="3" max="16" value="${(L.params && L.params.points) || 5}"></label>`;
        phtml += `<label>内径 <input type="range" class="p-inner" min="10" max="90" value="${(L.params && L.params.inner != null) ? L.params.inner : 42}"></label>`;
      }
      d.innerHTML = `<div class="sl-main">
        <span class="nm">${SHAPE_NAMES[L.type] || L.type}</span>
        <button class="mini mode ${L.mode === "sub" ? "on" : ""}" title="并集 / 减去">${L.mode === "sub" ? "减去" : "并集"}</button>
        <input type="range" class="p-size" min="10" max="150" value="${Math.round(L.s * 100)}" title="缩放">
        <button class="mini gear" title="旋转与形状参数">⚙</button>
        <button class="mini del" title="删除">×</button>
      </div>` + (open ? `<div class="sl-params">${phtml}</div>` : "");
      const main = d.querySelector(".sl-main");
      main.onclick = (e) => { if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return; state.shapeSel = L.id; shapeRender(); };
      d.querySelector(".mode").onclick = () => { L.mode = L.mode === "sub" ? "add" : "sub"; shapeRender(); };
      d.querySelector(".p-size").oninput = (e) => { L.s = Math.max(0.05, (+e.target.value) / 100); shapeRender(); };
      d.querySelector(".gear").onclick = () => { state.shapeParamsOpen = open ? null : L.id; shapeRender(); };
      d.querySelector(".del").onclick = () => { state.shapeLayers = state.shapeLayers.filter((x) => x.id !== L.id); if (state.shapeSel === L.id) state.shapeSel = null; shapeRender(); };
      const bind = (cls, fn) => { const el = d.querySelector(cls); if (el) el.oninput = (e) => { fn(+e.target.value); shapeRender(); }; };
      bind(".p-rot", (v) => { L.rot = v; });
      bind(".p-radius", (v) => { L.params = Object.assign({}, L.params, { radius: v }); });
      bind(".p-points", (v) => { L.params = Object.assign({}, L.params, { points: v }); });
      bind(".p-inner", (v) => { L.params = Object.assign({}, L.params, { inner: v }); });
      box.appendChild(d);
    });
  }
  function addShape(type) {
    if (state.shapeLayers.length >= 12) return alert("最多 12 个形状");
    const L = { id: uid(), type, cx: 0.5, cy: 0.5, s: type === "arrow" || type === "bubble" ? 0.8 : 0.72, mode: "add", rot: 0, params: { radius: 22, points: 5, inner: 42 } };
    state.shapeLayers.push(L); state.shapeSel = L.id;
    shapeRender();
  }
  function initShapeCanvas() {
    const cv = $("#shapeCanvas");
    let drag = null, freePts = null;
    const toLocal = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / Math.max(1, r.width)), y: (e.clientY - r.top) * (cv.height / Math.max(1, r.height)) }; };
    cv.addEventListener("pointerdown", (e) => {
      if (!state.files[0]) return;
      const p = toLocal(e);
      if (state.freeMode) { freePts = [[p.x / cv.width, p.y / cv.height]]; try { cv.setPointerCapture(e.pointerId); } catch (err2) {} e.preventDefault(); return; }
      for (let i = state.shapeLayers.length - 1; i >= 0; i--) {
        const L = state.shapeLayers[i];
        const b = bboxOf(L, cv.width, cv.height);
        if (p.x >= b.x0 - 8 && p.x <= b.x1 + 8 && p.y >= b.y0 - 8 && p.y <= b.y1 + 8) {
          state.shapeSel = L.id;
          drag = { L, dx: p.x, dy: p.y, cx0: L.cx, cy0: L.cy };
          try { cv.setPointerCapture(e.pointerId); } catch (err2) {}
          shapeRender(); e.preventDefault();
          return;
        }
      }
      state.shapeSel = null; shapeRender();
    });
    cv.addEventListener("pointermove", (e) => {
      const p = toLocal(e);
      if (freePts) { freePts.push([p.x / cv.width, p.y / cv.height]); drawFreePreview(freePts); return; }
      if (!drag) return;
      drag.L.cx = Math.max(0, Math.min(1, drag.cx0 + (p.x - drag.dx) / cv.width));
      drag.L.cy = Math.max(0, Math.min(1, drag.cy0 + (p.y - drag.dy) / cv.height));
      shapeRender();
    });
    const finish = () => {
      if (freePts && freePts.length > 4) {
        let sx = 0, sy = 0;
        for (const [x, y] of freePts) { sx += x; sy += y; }
        const n = freePts.length;
        state.shapeLayers.push({ id: uid(), type: "free", pts: freePts.slice(), cx: sx / n, cy: sy / n, s: 1, mode: "add" });
        state.shapeSel = state.shapeLayers[state.shapeLayers.length - 1].id;
      }
      freePts = null; drag = null; shapeRender();
    };
    cv.addEventListener("pointerup", finish);
    cv.addEventListener("pointercancel", finish);
    function drawFreePreview(pts) {
      shapeRender();
      const ctx = cv.getContext("2d");
      ctx.save(); ctx.strokeStyle = "#ff4d00"; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.beginPath();
      ctx.moveTo(pts[0][0] * cv.width, pts[0][1] * cv.height);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * cv.width, pts[i][1] * cv.height);
      ctx.stroke(); ctx.restore();
    }
  }
  async function shapeExport(type, files) {
    const list = files || (state.files[0] ? [state.files[0]] : []);
    if (!list.length) { alert("请先选择图片"); return; }
    if (!state.shapeLayers.length) { alert("请先添加至少一个形状（否则导出的是原图）"); }

    // 保存当前结果快照（用于历史记录）
    const prevResults = state.results.slice();
    const prevSettings = { mode: "shape", layerCount: state.shapeLayers.length, exportType: type };

    const btns = ["#shExportPng", "#shExportJpg", "#shExportAll"].map((s) => $(s)).filter(Boolean);
    btns.forEach((b) => { b.disabled = true; b.dataset.oldText = b.textContent; b.textContent = "处理中…"; });
    const ext = type === "jpg" ? "jpg" : "png";
    const mime = type === "jpg" ? "image/jpeg" : "image/png";
    const bg = shapeBg();
    const swPct = +$("#shStroke").value;
    try {
      for (const f of list.slice(0, 24)) {
        const W = f.img.naturalWidth, H = f.img.naturalHeight;
        const cv = newCanvas(W, H);
        const ctx = cv.getContext("2d");
        const path = buildShapePath(W, H);
        if (bg) { ctx.save(); ctx.clip(path); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.restore(); }
        ctx.save(); ctx.clip(path); ctx.drawImage(f.img, 0, 0, W, H); ctx.restore();
        if (swPct > 0) strokeShapes(ctx, path, W, H, swPct * 2, $("#shStrokeColor").value);
        const blob = await canvasToBlob(cv, mime, 0.95);
        const name = `${baseName(f.name)}_shape.${ext}`;
        const r = { id: uid(), name, kind: "image", blob, url: URL.createObjectURL(blob), size: blob.size, type: mime, orig: f.size };
        state.results.push(r);
      }
      // 成功后将旧结果推入历史
      pushHistory(prevResults, prevSettings);
      renderResults();
    } catch (e) {
      console.error(e);
      // 失败时恢复旧结果，清除已部分添加的结果
      revokeResultsBlobs(state.results.slice(prevResults.length));
      state.results = prevResults;
      renderResults();
      alert("形状导出失败：" + (e.message || e));
    } finally {
      btns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.oldText || b.textContent; });
    }
  }

  /* ---------------- wiring ---------------- */
  function selectTab(mode) {
    state.mode = mode;
    $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $$(".mode-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.mode !== mode));
    if (mode === "shape") shapeRender();
  }
  function segGroup(sel, onPick) {
    const root = $(sel);
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      $$("button", root).forEach((x) => x.classList.toggle("active", x === b));
      if (onPick) onPick(b.dataset.v);
    });
  }

  /* ---------------- 宽高锁定联动 ---------------- */
  let resizeLastChanged = "w"; // 记录最后修改的是宽还是高
  function wireResizeLock() {
    const wInput = $("#resizeW");
    const hInput = $("#resizeH");
    const lock = $("#resizeLock");
    if (!wInput || !hInput || !lock) return;

    wInput.addEventListener("input", () => {
      resizeLastChanged = "w";
      if (!lock.checked) return;
      const first = state.files[0];
      if (!first) return;
      const nw = first.img.naturalWidth, nh = first.img.naturalHeight;
      const wVal = parseFloat(wInput.value);
      if (!isFinite(wVal) || wVal <= 0) return;
      hInput.value = Math.max(1, Math.round(wVal * nh / nw));
    });

    hInput.addEventListener("input", () => {
      resizeLastChanged = "h";
      if (!lock.checked) return;
      const first = state.files[0];
      if (!first) return;
      const nw = first.img.naturalWidth, nh = first.img.naturalHeight;
      const hVal = parseFloat(hInput.value);
      if (!isFinite(hVal) || hVal <= 0) return;
      wInput.value = Math.max(1, Math.round(hVal * nw / nh));
    });

    // 勾选锁定时，按当前宽度同步高度
    lock.addEventListener("change", () => {
      if (lock.checked) {
        const first = state.files[0];
        if (!first) return;
        const nw = first.img.naturalWidth, nh = first.img.naturalHeight;
        const wVal = parseFloat(wInput.value);
        if (isFinite(wVal) && wVal > 0) {
          hInput.value = Math.max(1, Math.round(wVal * nh / nw));
        }
      }
    });
  }

  // 键盘快捷键：Ctrl+Z 撤销，Ctrl+Y / Ctrl+Shift+Z 重做
  function wireKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // 忽略 contenteditable 元素中的快捷键
      if (e.target && e.target.isContentEditable) return;
      // 忽略输入框中的快捷键（避免与输入框默认行为冲突）
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // 但允许 range/slider/color 类型的 input 触发（因为它们不涉及文本编辑）
        const type = e.target.type;
        if (type === "text" || type === "textarea" || type === "search" || type === "password" || type === "number" || type === "email" || type === "url") {
          return;
        }
      }

      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const key = e.key.toLowerCase();

      // Ctrl+Z 撤销
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Y 或 Ctrl+Shift+Z 重做
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }
    });
  }

  function init() {
    $("#fileInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    drop.addEventListener("click", () => $("#fileInput").click());
    document.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.files;
      if (items && items.length) addFiles(items);
    });

    $("#clearBtn").onclick = () => { state.files.forEach((f) => URL.revokeObjectURL(f.url)); state.files = []; clearResults(); renderThumbs(); };
    $("#clearResults").onclick = clearResults;
    $("#zipBtn").onclick = downloadAll;
    $("#runBtn").onclick = run;
    if ($("#aiFeather")) $("#aiFeather").oninput = (e) => { const v = $("#aiFeatherVal"); if (v) v.textContent = e.target.value; };

    $$("#tabs .tab").forEach((b) => (b.onclick = () => selectTab(b.dataset.mode)));

    $("#quality").oninput = (e) => ($("#qVal").textContent = e.target.value + "%");
    $("#wmSize").oninput = (e) => ($("#wmSizeVal").textContent = e.target.value + "%");
    $("#wmOpacity").oninput = (e) => ($("#wmOpVal").textContent = e.target.value + "%");
    $("#resizeMode").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const m = b.dataset.v;
      // 切换自定义尺寸 / 百分比面板显示
      const customRow = document.getElementById("resizeCustomRow");
      const percentRow = document.getElementById("resizePercentRow");
      const lockRow = document.getElementById("resizeLockRow");
      if (customRow) customRow.style.display = m === "custom" ? "" : "none";
      if (percentRow) percentRow.style.display = m === "percent" ? "" : "none";
      if (lockRow) lockRow.style.display = m === "custom" ? "" : "none";
    });
    segGroup("#resizeMode");
    segGroup("#wmPos");
    segGroup("#gridN");
    segGroup("#collageDir");

    // 初始化尺寸面板显示状态
    const resizeMode = $("#resizeMode .active") ? $("#resizeMode .active").dataset.v : "custom";
    const customRow = document.getElementById("resizeCustomRow");
    const percentRow = document.getElementById("resizePercentRow");
    const lockRow = document.getElementById("resizeLockRow");
    if (customRow) customRow.style.display = resizeMode === "custom" ? "" : "none";
    if (percentRow) percentRow.style.display = resizeMode === "percent" ? "" : "none";
    if (lockRow) lockRow.style.display = resizeMode === "custom" ? "" : "none";

    // 宽高锁定联动
    wireResizeLock();

    selectTab("compress");
    renderThumbs();
    // 形状裁剪
    initShapeCanvas();
    $$("#shapePalette button").forEach((b) => (b.onclick = () => addShape(b.dataset.shape)));
    $("#clearShapes").onclick = () => { state.shapeLayers = []; state.shapeSel = null; shapeRender(); };
    $("#shScale").addEventListener("input", (e) => { $("#shScaleVal").textContent = e.target.value + "%"; shapeRender(); });
    $("#shStroke").addEventListener("input", (e) => { $("#shStrokeVal").textContent = e.target.value; shapeRender(); });
    ["#shStrokeColor", "#shBg", "#shBgColor"].forEach((s) => $(s).addEventListener("input", shapeRender));
    $("#shBg").addEventListener("change", shapeRender);
    $("#freeDraw").onclick = () => {
      state.freeMode = !state.freeMode;
      $("#freeDraw").classList.toggle("primary", state.freeMode);
      shapeRender();
    };
    $("#shExportPng").onclick = () => shapeExport("png");
    $("#shExportJpg").onclick = () => shapeExport("jpg");
    $("#shExportAll").onclick = () => shapeExport("png", state.files);
    shapeRender();

    // 初始化撤销/重做 UI
    initHistoryUI();
    // 绑定键盘快捷键
    wireKeyboardShortcuts();
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
      if (!confirm("清空「最近打开」记录？（不会删除你的图片）")) return;
      await TBX_recent.clear("image");
      if (window.TBX_refreshRecent) TBX_refreshRecent();
    };
  })();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
