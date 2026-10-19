/* ============================================================
   免费工具箱 · 证件照工坊（本地抠图 + 规格裁剪 + 相纸排版）
   ============================================================ */
(function () {
  "use strict";
  const he = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (s) => document.querySelector(s);
  const SVC = "http://127.0.0.1:8765";

  /* 常见规格（300dpi 像素） */
  const SPECS = [
    { id: "one", name: "一寸 25×35", w: 295, h: 413 },
    { id: "two", name: "二寸 35×49", w: 413, h: 579 },
    { id: "small2", name: "小二寸 35×45", w: 413, h: 531 },
    { id: "big1", name: "大一寸 33×48", w: 390, h: 567 },
    { id: "social", name: "社保 26×32", w: 358, h: 441 },
    { id: "driver", name: "驾照 22×32", w: 260, h: 378 },
    { id: "visa", name: "美签 51×51", w: 600, h: 600 },
    { id: "teacher", name: "教师资格 41×54", w: 484, h: 638 },
    { id: "resume", name: "简历照 25×35", w: 295, h: 413 },
    { id: "custom", name: "自定义", w: 295, h: 413 }
  ];

  const DISPLAY_H = 340;
  const SHEET_W = 1800, SHEET_H = 1200;   // 6 寸相纸 300dpi
  const GAP = 24, MARGIN = 40;

  const state = {
    src: null,            // 原始 Image
    cut: null,            // 抠图后的 canvas（含新底色）
    bg: "white",
    spec: SPECS[0],
    zoom: 1,
    ox: 0, oy: 0,         // 相对居中偏移（display px）
    dragging: null
  };

  let cutReqId = 0;
  let previewUrl = null;

  const err = (m) => ($("#err").textContent = m || "");

  /* ---------------- 规格按钮 ---------------- */
  function renderSpecs() {
    $("#specs").innerHTML = SPECS.map((s) => `<button class="id-spec ${s.id === state.spec.id ? "active" : ""}" data-id="${s.id}">${s.name}</button>`).join("");
    $("#specs").querySelectorAll(".id-spec").forEach((b) => {
      b.onclick = () => {
        const s = SPECS.find((x) => x.id === b.dataset.id);
        if (!s) return;
        state.spec = s;
        state.zoom = 1; state.ox = 0; state.oy = 0;
        renderSpecs(); layout();
      };
    });
  }

  /* ---------------- 底色 ---------------- */
  function renderBgs() {
    $("#bgs").querySelectorAll(".id-swatch").forEach((s) => {
      s.classList.toggle("active", s.dataset.bg === state.bg);
      s.onclick = () => { state.bg = s.dataset.bg; renderBgs(); if (state.src) doCut(); };
    });
  }

  /* ---------------- 载入照片 ---------------- */
  function loadFile(f) {
    if (!f) return;
    err("");
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.src = img;
      state.cut = null;
      state.zoom = 1; state.ox = 0; state.oy = 0;
      $("#srcInfo").textContent = `${f.name} · ${img.naturalWidth}×${img.naturalHeight}`;
      ["#cutBtn", "#resetBtn", "#saveBtn", "#sheetBtn", "#zoom", "#zoomIn", "#zoomOut"].forEach((s) => ($(s).disabled = false));
      $("#stageHint").style.display = "none";
      $("#frame").style.display = "";
      if (window.TBX_rememberFile) TBX_rememberFile("idphoto", f);
      doCut();
    };
    img.onerror = () => { URL.revokeObjectURL(url); err("图片读取失败"); };
    img.src = url;
  }

  function baseImage() { return state.cut || state.src; }

  /* ---------------- 抠图换底 ---------------- */
  async function doCut() {
    if (!state.src) return;
    if (state.bg === "keep") { state.cut = null; err(""); $("#cutBtn").disabled = false; $("#cutBtn").textContent = "① 抠图换底"; layout(); return; }
    cutReqId++;
    const reqId = cutReqId;
    err("");
    $("#cutBtn").disabled = true;
    $("#cutBtn").textContent = "抠图中…（首次约 1–2 秒）";
    // 显示加载遮罩
    const frame = $("#frame");
    let loadingEl = frame ? frame.querySelector(".id-loading") : null;
    if (frame && !loadingEl) {
      loadingEl = document.createElement("div");
      loadingEl.className = "id-loading";
      loadingEl.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.7);color:#333;font-size:14px;border-radius:6px;z-index:5;";
      loadingEl.textContent = "抠图中…";
      frame.style.position = "relative";
      frame.appendChild(loadingEl);
    }
    if (loadingEl) loadingEl.style.display = "flex";
    try {
      // 把原始图转成 blob 再发给服务
      const cv = document.createElement("canvas");
      cv.width = state.src.naturalWidth; cv.height = state.src.naturalHeight;
      cv.getContext("2d").drawImage(state.src, 0, 0);
      const srcBlob = await new Promise((r) => cv.toBlob(r, "image/png"));
      const qs = new URLSearchParams({ mode: state.bg, feather: $("#feather").value });
      const res = await fetch(SVC + "/image/bgremove?" + qs, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-filename": "photo.png" },
        body: srcBlob
      });
      if (!res.ok) throw new Error((await res.text()).slice(0, 120) || ("抠图失败 HTTP " + res.status));
      const outBlob = await res.blob();
      const url = URL.createObjectURL(outBlob);
      const im = new Image();
      let c2 = null;
      try {
        await new Promise((ok, no) => { im.onload = ok; im.onerror = () => no(new Error("抠图结果加载失败")); im.src = url; });
        c2 = document.createElement("canvas");
        c2.width = im.naturalWidth; c2.height = im.naturalHeight;
        c2.getContext("2d").drawImage(im, 0, 0);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (reqId !== cutReqId) return;
      state.cut = c2;
      layout();
    } catch (e) {
      if (reqId !== cutReqId) return;
      err("自动抠图需要本机增强服务，在线版不提供（可先选「保留原背景」跳过）：" + e.message);
      state.cut = null;
      layout();
    } finally {
      if (reqId !== cutReqId) return;
      $("#cutBtn").disabled = false;
      $("#cutBtn").textContent = "① 抠图换底";
      const loadingEl = $("#frame") ? $("#frame").querySelector(".id-loading") : null;
      if (loadingEl) loadingEl.style.display = "none";
    }
  }

  /* ---------------- 显示 ---------------- */
  function layout() {
    const sp = state.spec;
    const dispW = Math.round(DISPLAY_H * sp.w / sp.h);
    // 始终更新尺寸信息（即使未加载图片）
    $("#sizeInfo").textContent = `${sp.w} × ${sp.h} px（300dpi）· 显示 ${dispW}×${DISPLAY_H}`;
    const dpr = window.devicePixelRatio > 1 ? 1.5 : 1;
    const cv = $("#view");
    cv.width = Math.round(dispW * dpr);
    cv.height = Math.round(DISPLAY_H * dpr);
    cv.style.width = dispW + "px";
    cv.style.height = DISPLAY_H + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = state.bg === "white" ? "#fff" : state.bg === "blue" ? "#438edb" : state.bg === "red" ? "#d40000" : state.bg === "gray" ? "#e9e9e9" : state.bg === "keep" ? "#fff" : "#333";
    ctx.fillRect(0, 0, dispW, DISPLAY_H);
    const img = baseImage();
    if (!img) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const base = Math.max(dispW / iw, DISPLAY_H / ih);
    const s = base * state.zoom;
    const w = iw * s, h = ih * s;
    const x = (dispW - w) / 2 + state.ox;
    const y = (DISPLAY_H - h) / 2 + state.oy;
    ctx.drawImage(img, x, y, w, h);
  }

  /* ---------------- 导出 ---------------- */
  function renderFull() {
    const sp = state.spec;
    const dispW = Math.round(DISPLAY_H * sp.w / sp.h);
    const img = baseImage();
    const out = document.createElement("canvas");
    out.width = sp.w; out.height = sp.h;
    const ctx = out.getContext("2d");
    ctx.fillStyle = state.bg === "white" ? "#fff" : state.bg === "blue" ? "#438edb" : state.bg === "red" ? "#d40000" : state.bg === "gray" ? "#e9e9e9" : state.bg === "keep" ? "#fff" : "#333";
    ctx.fillRect(0, 0, sp.w, sp.h);
    if (!img) return out;
    const k = sp.w / dispW;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const base = Math.max(dispW / iw, DISPLAY_H / ih);
    const s = base * state.zoom;
    const w = iw * s * k, h = ih * s * k;
    ctx.drawImage(img, (sp.w - w) / 2 + state.ox * k, (sp.h - h) / 2 + state.oy * k, w, h);
    return out;
  }

  function renderSheet(photoCanvas) {
    const sp = state.spec;
    const sheet = document.createElement("canvas");
    sheet.width = SHEET_W; sheet.height = SHEET_H;
    const ctx = sheet.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, SHEET_W, SHEET_H);
    const availW = SHEET_W - MARGIN * 2, availH = SHEET_H - MARGIN * 2;
    const cols = Math.max(1, Math.floor((availW + GAP) / (sp.w + GAP)));
    const rows = Math.max(1, Math.floor((availH + GAP) / (sp.h + GAP)));
    const totalW = cols * sp.w + (cols - 1) * GAP;
    const totalH = rows * sp.h + (rows - 1) * GAP;
    const x0 = (SHEET_W - totalW) / 2, y0 = (SHEET_H - totalH) / 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * (sp.w + GAP), y = y0 + r * (sp.h + GAP);
        ctx.drawImage(photoCanvas, x, y);
        ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 1;
        ctx.strokeRect(x + .5, y + .5, sp.w - 1, sp.h - 1);
      }
    }
    return { canvas: sheet, cols, rows };
  }

  function canvasToBlob(cv, quality) {
    return new Promise((r) => cv.toBlob(r, "image/jpeg", quality == null ? 0.95 : quality));
  }

  async function compressTo(cv, targetKb) {
    if (!targetKb || targetKb <= 0) return await canvasToBlob(cv, 0.95);
    let lo = 0.2, hi = 0.98, best = null;
    for (let i = 0; i < 9; i++) {
      const q = (lo + hi) / 2;
      const b = await canvasToBlob(cv, q);
      if (b.size / 1024 <= targetKb) { best = b; lo = q; } else { hi = q; }
    }
    return best || await canvasToBlob(cv, 0.2);
  }

  function dl(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function showPreview(blob, label) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    $("#out").innerHTML = `<figure><img src="${previewUrl}" alt=""><figcaption>${he(label)}</figcaption></figure>`;
  }

  async function saveOne() {
    const cv = renderFull();
    const kb = parseInt($("#targetKb").value, 10);
    const blob = await compressTo(cv, kb);
    const name = `证件照_${state.spec.name.split(" ")[0]}_${state.spec.w}x${state.spec.h}.jpg`;
    dl(blob, name);
    showPreview(blob, `${name} · ${(blob.size / 1024).toFixed(1)} KB`);
  }

  async function saveSheet() {
    const photo = renderFull();
    const { canvas, cols, rows } = renderSheet(photo);
    const kb = parseInt($("#targetKb").value, 10);
    const blob = await compressTo(canvas, kb ? Math.max(kb * cols * rows, 200) : 0);
    const name = `证件照排版_6寸_${cols}列${rows}行_${cols * rows}张.jpg`;
    dl(blob, name);
    showPreview(blob, `${name} · ${(blob.size / 1024).toFixed(0)} KB`);
  }

  /* ---------------- 交互 ---------------- */
  function init() {
    renderSpecs(); renderBgs();
    $("#fileInput").addEventListener("change", (e) => { loadFile(e.target.files[0]); e.target.value = ""; });
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));

    $("#feather").addEventListener("input", (e) => { $("#featherVal").textContent = e.target.value; });
    $("#feather").addEventListener("change", () => { if (state.src) doCut(); });
    $("#cutBtn").addEventListener("click", doCut);
    $("#resetBtn").addEventListener("click", () => { state.zoom = 1; state.ox = 0; state.oy = 0; $("#zoom").value = 100; layout(); });
    $("#zoom").addEventListener("input", (e) => { state.zoom = (+e.target.value) / 100; layout(); });
    $("#zoomIn").addEventListener("click", () => { state.zoom = Math.min(3, state.zoom + 0.1); $("#zoom").value = Math.round(state.zoom * 100); layout(); });
    $("#zoomOut").addEventListener("click", () => { state.zoom = Math.max(0.5, state.zoom - 0.1); $("#zoom").value = Math.round(state.zoom * 100); layout(); });
    $("#saveBtn").addEventListener("click", saveOne);
    $("#sheetBtn").addEventListener("click", saveSheet);

    const cv = $("#view");
    cv.addEventListener("pointerdown", (e) => { state.dragging = { x: e.clientX, y: e.clientY, ox: state.ox, oy: state.oy }; try { cv.setPointerCapture(e.pointerId); } catch (err2) {} e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => {
      if (!state.dragging) return;
      state.ox = state.dragging.ox + (e.clientX - state.dragging.x);
      state.oy = state.dragging.oy + (e.clientY - state.dragging.y);
      layout();
    });
    ["pointerup", "pointercancel"].forEach((ev) => cv.addEventListener(ev, () => (state.dragging = null)));
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      state.zoom = Math.min(3, Math.max(0.5, state.zoom * (e.deltaY < 0 ? 1.06 : 0.94)));
      $("#zoom").value = Math.round(state.zoom * 100);
      layout();
    }, { passive: false });
    window.addEventListener("resize", layout);
  }

  window.TBX_onRecentFiles = (files) => { if (files && files[0]) loadFile(files[0]); };
  window.TBX_onRecentFile = (f) => loadFile(f);
  window.TBX_onFileMiss = () => $("#fileInput").click();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();