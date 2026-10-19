/* 音视频工具 · 依赖本机 ffmpeg 服务（http://127.0.0.1:8765） */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  const SERVICE = "http://127.0.0.1:8765";
  const state = { file: null, info: null, mode: "compress", jobId: null, cancelled: false, results: [], concat: [], concatSid: null, wmAssetId: null, playerUrl: null, markStartSec: null, stripInterval: 0, frameCanvas: null, maskShape: { type: "ellipse", cx: 0.5, cy: 0.5, s: 0.72, rot: 0, params: { radius: 22 } } };
  const svc = { ok: false, ffmpeg: false };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtBytes = (n) => (!isFinite(n) ? "-" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(2) + " MB" : (n / 1073741824).toFixed(2) + " GB");
  const he = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function parseTime(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    const parts = s.split(":").map((x) => Number(x.trim()));
    if (!parts.length || parts.some((n) => !isFinite(n))) return null;
    let sec = 0; for (const p of parts) sec = sec * 60 + p;
    return sec;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return (h ? h + ":" + p(m) : m) + ":" + p(s);
  }
  const err = (m) => ($("#err").textContent = m || "");
  const evalFps = (s) => { try { const t = String(s); if (t.indexOf("/") > 0) { const [a, b] = t.split("/").map(Number); return b ? a / b : 0; } return Number(t) || 0; } catch (e) { return 0; } };

  /* ---------------- 服务状态 ---------------- */
  async function checkService() {
    const el = $("#svcStatus");
    try {
      const j = await (await fetch(SERVICE + "/health", { cache: "no-store" })).json();
      svc.ok = !!j.ok; svc.ffmpeg = !!j.ffmpegAvailable;
      if (svc.ok && svc.ffmpeg) el.innerHTML = `<b style="color:var(--ok)">✅ 已连接本机 ffmpeg</b><div class="hint" style="margin-top:4px">${he(j.ffmpeg)}</div>`;
      else if (svc.ok) el.innerHTML = '<b style="color:var(--danger)">⚠ 服务已启动，但未找到 ffmpeg</b>。请把 ffmpeg.exe / ffprobe.exe 放到 <code>toolbox/server/bin/</code>。';
      else el.innerHTML = '<b style="color:var(--danger)">❌ 未检测到本机服务</b>。请双击运行 <code>toolbox/server/start.bat</code> 后刷新本页。';
    } catch (e) {
      svc.ok = false; svc.ffmpeg = false;
      const viaFile = location.protocol === "file:";
      el.innerHTML = '<b style="color:var(--danger)">❌ 未检测到本机服务</b>。' + (viaFile
        ? '当前页面是用 <code>file://</code> 打开的，建议改用 <b>http://127.0.0.1:8777/av-tools.html</b> 访问。'
        : '请双击运行 <code>toolbox/server/start.bat</code> 后刷新本页。');
    }
    updateRun();
  }

  /* ---------------- 单文件选择 ---------------- */
  async function loadFile(file) {
    if (!file) return;
    state.file = file; state.info = null;
    state.wmAssetId = null;
    if (window.TBX_rememberFile) TBX_rememberFile("av", file);
    $("#fileName").textContent = `${file.name} · ${fmtBytes(file.size)}`;
    $("#clearBtn").disabled = false;
    $("#fileInfo").innerHTML = '<div class="hint">正在读取媒体信息…</div>';
    if (!state.batch) clearResults();
    renderPlayer(file, false);
    if (!svc.ok) { $("#fileInfo").innerHTML = ""; updateRun(); return; }
    try {
      const j = await (await fetch(SERVICE + "/av/info", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file })).json();
      if (!j.ok) throw new Error(j.error || "解析失败");
      state.info = j; renderInfo(j);
      if (!j.video) renderPlayer(file, true);
      if (j.video) loadMaskFrame(); else { state.frameCanvas = null; maskRender(); }
    } catch (e) { $("#fileInfo").innerHTML = `<div class="err">读取媒体信息失败：${he(e.message)}</div>`; }
    updateRun();
  }
  function renderInfo(j) {
    const rows = [["时长", j.duration ? fmtTime(j.duration) + `（${j.duration.toFixed(1)} 秒）` : "-"], ["大小", fmtBytes(j.size)]];
    if (j.video) rows.push(["视频", `${j.video.codec.toUpperCase()} · ${j.video.width}×${j.video.height}${j.video.fps ? " · " + Math.round(evalFps(j.video.fps)) + "fps" : ""}`]);
    if (j.audio) rows.push(["音频", `${j.audio.codec.toUpperCase()} · ${j.audio.channels || "?"} 声道${j.audio.sampleRate ? " · " + j.audio.sampleRate + "Hz" : ""}`]);
    if (j.bitRate) rows.push(["总码率", Math.round(j.bitRate / 1000) + " kbps"]);
    $("#fileInfo").innerHTML = `<div class="result" style="display:block">${rows.map((r) => `<div class="kv"><span class="k">${he(r[0])}</span><span class="v">${he(r[1])}</span></div>`).join("")}</div>`;
  }

  /* ---------------- 播放器预览 / 简单编辑 ---------------- */
  function renderPlayer(file, forceAudio) {
    const wrap = $("#playerWrap");
    wrap.innerHTML = "";
    if (state.playerUrl) { try { URL.revokeObjectURL(state.playerUrl); } catch (e) {} }
    state.playerUrl = URL.createObjectURL(file);
    const audioOnly = forceAudio || (!(file.type || "").startsWith("video/") && /\.(mp3|m4a|wav|aac|flac|ogg|wma)$/i.test(file.name));
    $("#mediaPreview").style.display = "block";
    wrap.innerHTML = audioOnly
      ? `<div style="padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)"><div style="font-size:34px;text-align:center;margin-bottom:8px">🎵</div><audio id="player" controls preload="metadata" src="${state.playerUrl}" style="width:100%"></audio></div>`
      : `<video id="player" controls preload="metadata" src="${state.playerUrl}" style="width:100%;max-height:340px;border-radius:12px;background:#000;display:block"></video>`;
    $("#genStrip").style.display = audioOnly ? "none" : "inline-flex";
    $("#tlTrack").style.backgroundImage = "none";
    if (state.stripUrl) { try { URL.revokeObjectURL(state.stripUrl); } catch (e) {} state.stripUrl = null; }
    state.markStartSec = null;
    const pl = $("#player");
    ["timeupdate", "seeked"].forEach((ev) => pl.addEventListener(ev, () => { updateTimeHint(); tlPlayhead(); }));
    ["loadedmetadata", "durationchange"].forEach((ev) => pl.addEventListener(ev, () => { updateTimeHint(); tlRender(); }));
    updateTimeHint();
    tlRender();
  }
  function updateTimeHint() {
    const pl = $("#player");
    if (!pl) return;
    const t = pl.currentTime || 0;
    const d = isFinite(pl.duration) ? pl.duration : (state.info && state.info.duration) || 0;
    $("#timeHint").textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
  }
  function timeTargets() {
    switch (state.mode) {
      case "trim": return { start: "#trStart", end: "#trEnd", dur: null };
      case "compress": return { start: "#cpStart", end: null, dur: "#cpDur" };
      case "gif": return { start: "#gfStart", end: null, dur: "#gfDur" };
      case "audio": return { start: "#auStart", end: null, dur: "#auDur" };
      default: return null;
    }
  }
  function markStart() {
    const pl = $("#player"); if (!pl) return err("请先选择文件");
    const t = timeTargets();
    if (!t) return err("当前功能不支持起止时间标记（请切到 裁剪/压缩/转GIF/提取音频）");
    state.markStartSec = pl.currentTime;
    if (t.start) $(t.start).value = pl.currentTime.toFixed(2);
    tlRender();
    err("已设为起点：" + fmtTime(pl.currentTime));
  }
  function markEnd() {
    const pl = $("#player"); if (!pl) return err("请先选择文件");
    const t = timeTargets();
    if (!t) return err("当前功能不支持起止时间标记（请切到 裁剪/压缩/转GIF/提取音频）");
    const end = pl.currentTime;
    const start = state.markStartSec != null ? state.markStartSec : ((t.start && parseFloat($(t.start).value)) || 0);
    if (end <= start) return err("终点必须大于起点");
    if (t.end) $(t.end).value = end.toFixed(2);
    else if (t.dur) $(t.dur).value = (end - start).toFixed(2);
    tlRender();
    err("已设为终点：" + fmtTime(end) + "（时长 " + (end - start).toFixed(2) + " 秒）");
  }
  async function genStrip() {
    if (!state.file) return err("请先选择文件");
    if (!svc.ffmpeg) return err("本机服务不可用");
    const dur = (state.info && state.info.duration) || 0;
    if (!dur) return err("请等待媒体信息加载完成");
    const n = 10;
    const interval = Math.max(0.1, dur / n);
    setBusy(true); showProgress(0, "生成时间轴缩略图…");
    try {
      const qs = new URLSearchParams({ op: "sprite", interval: String(interval), cols: String(n), width: "160" });
      const j = await (await fetch(`${SERVICE}/av/run?${qs}`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(state.file.name) }, body: state.file })).json();
      if (!j.ok) throw new Error(j.error || "提交失败");
      let st = { status: "running" };
      while (st.status === "running") { await sleep(400); st = await (await fetch(`${SERVICE}/av/status?id=${j.id}`, { cache: "no-store" })).json(); showProgress(st.pct || 0, "生成时间轴缩略图…"); }
      if (st.status !== "done") throw new Error(st.err || "生成失败");
      const blob = await (await fetch(`${SERVICE}/av/result?id=${j.id}`)).blob();
      if (state.stripUrl) { try { URL.revokeObjectURL(state.stripUrl); } catch (e) {} }
      state.stripUrl = URL.createObjectURL(blob);
      state.stripInterval = interval;
      $("#tlTrack").style.backgroundImage = `url("${state.stripUrl}")`;
      hideProgress(); err("");
    } catch (e) { err("时间轴生成失败：" + e.message); hideProgress(); }
    finally { setBusy(false); }
  }

  /* ---------------- 时间轴标尺 ---------------- */
  const TL_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  function tlDuration() {
    const pl = $("#player");
    if (pl && isFinite(pl.duration) && pl.duration > 0) return pl.duration;
    return (state.info && state.info.duration) || 0;
  }
  function tlStep(d) { for (const s of TL_STEPS) if (d / s <= 10) return s; return Math.ceil(d / 10); }
  function tlGetRange() {
    const d = tlDuration(), m = state.mode;
    if (m === "trim") {
      let s = parseFloat($("#trStart").value), e = parseFloat($("#trEnd").value);
      if (!isFinite(s)) s = 0;
      if (!isFinite(e)) e = d;
      return { start: Math.max(0, Math.min(s, d)), end: Math.max(0, Math.min(e, d)) };
    }
    if (m === "compress" || m === "audio" || m === "gif") {
      const sf = m === "compress" ? "#cpStart" : m === "audio" ? "#auStart" : "#gfStart";
      const df = m === "compress" ? "#cpDur" : m === "audio" ? "#auDur" : "#gfDur";
      let s = parseFloat($(sf).value); if (!isFinite(s)) s = 0;
      let du = parseFloat($(df).value); if (!isFinite(du)) du = d - s;
      return { start: Math.max(0, Math.min(s, d)), end: Math.max(0, Math.min(s + du, d)) };
    }
    return { start: 0, end: d };
  }
  function tlSetRange(start, end) {
    const m = state.mode;
    if (m === "trim") { $("#trStart").value = start.toFixed(2); $("#trEnd").value = end.toFixed(2); }
    else if (m === "compress" || m === "audio" || m === "gif") {
      const sf = m === "compress" ? "#cpStart" : m === "audio" ? "#auStart" : "#gfStart";
      const df = m === "compress" ? "#cpDur" : m === "audio" ? "#auDur" : "#gfDur";
      $(sf).value = start.toFixed(2);
      $(df).value = (end - start).toFixed(2);
    }
    tlRender();
  }
  function tlPlayhead() {
    const d = tlDuration(), pl = $("#player");
    $("#tlPlay").style.left = d > 0 && pl ? (pl.currentTime / d) * 100 + "%" : "0%";
  }
  function tlRender() {
    const d = tlDuration(), track = $("#tlTrack");
    const supported = !!timeTargets() && d > 0;
    const rng = tlGetRange();
    const pct = (v) => (d > 0 ? (v / d) * 100 : 0);
    $("#tlL1").innerHTML = "起点 <b>" + fmtTime(rng.start) + "</b>";
    $("#tlL2").innerHTML = "终点 <b>" + fmtTime(rng.end) + "</b>";
    $("#tlLen").textContent = "区间 " + Math.max(0, rng.end - rng.start).toFixed(1) + " 秒";
    const sel = $("#tlSel"), h1 = $("#tlH1"), h2 = $("#tlH2");
    if (supported) {
      sel.style.display = "block"; h1.style.display = "grid"; h2.style.display = "grid";
      sel.style.left = pct(rng.start) + "%";
      sel.style.width = Math.max(0, pct(rng.end - rng.start)) + "%";
      h1.style.left = pct(rng.start) + "%";
      h2.style.left = pct(rng.end) + "%";
      track.classList.remove("disabled");
      $("#tlHint").textContent = "拖动滑块选定区间，点轨道可跳转播放位置";
    } else {
      sel.style.display = "none"; h1.style.display = "none"; h2.style.display = "none";
      track.classList.add("disabled");
      $("#tlHint").textContent = state.file ? "当前功能无起止设置（仅预览与跳转）" : "选择文件后显示时间轴";
    }
    const ticks = $("#tlTicks"); ticks.innerHTML = "";
    if (d > 0) {
      const step = tlStep(d);
      for (let t = 0; t <= d + 1e-6; t += step) {
        const p = pct(t);
        const tk = document.createElement("div");
        tk.className = "tl-tick"; tk.style.left = p + "%";
        ticks.appendChild(tk);
        const lb = document.createElement("span");
        lb.className = "tl-tick-label"; lb.style.left = p + "%"; lb.textContent = fmtTime(t);
        if (t === 0) lb.style.transform = "translateX(0)";
        else if (t + step > d) lb.style.transform = "translateX(-100%)";
        ticks.appendChild(lb);
      }
    }
    tlPlayhead();
  }
  function tlInit() {
    const track = $("#tlTrack");
    let drag = null, anchor = 0;
    const posOf = (e) => {
      const r = track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    };
    const apply = (e) => {
      const d = tlDuration(); if (!d) return;
      const sec = posOf(e) * d;
      if (drag === "seek") { const pl = $("#player"); if (pl) { pl.currentTime = sec; } tlPlayhead(); return; }
      let r = tlGetRange();
      let start = r.start, end = r.end;
      if (drag === "start") start = Math.min(sec, end - 0.1);
      else if (drag === "end") end = Math.max(sec, start + 0.1);
      else if (drag === "body") {
        const len = end - start;
        start = Math.max(0, Math.min(d - len, sec - anchor));
        end = start + len;
      }
      start = Math.max(0, Math.min(start, d));
      end = Math.max(start, Math.min(end, d));
      tlSetRange(start, end);
    };
    track.addEventListener("pointerdown", (e) => {
      if (!state.file) return;
      const supported = !!timeTargets();
      const el = e.target;
      if (supported && el === $("#tlH1")) drag = "start";
      else if (supported && el === $("#tlH2")) drag = "end";
      else if (supported && el === $("#tlSel")) { drag = "body"; anchor = posOf(e) * tlDuration() - tlGetRange().start; }
      else drag = "seek";
      try { track.setPointerCapture(e.pointerId); } catch (err2) {}
      apply(e);
      e.preventDefault();
    });
    track.addEventListener("pointermove", (e) => { if (drag) apply(e); });
    ["pointerup", "pointercancel"].forEach((ev) => track.addEventListener(ev, () => (drag = null)));
  }

  /* ---------------- 形状遮罩 ---------------- */
  function maskPath(W, H, invert) {
    const S = window.TBX_SHAPES;
    const p = new Path2D();
    if (invert) { p.rect(0, 0, W, H); }
    const L = state.maskShape;
    const minDim = Math.min(W, H);
    const size = L.s * minDim;
    let pts = (S.defs[L.type] || S.defs.rect)(L.params || {}).map(([ux, uy]) => [L.cx * W + (ux - 0.5) * size, L.cy * H + (uy - 0.5) * size]);
    const r = (((L.rot || 0) * Math.PI) / 180);
    if (r) { const ca = Math.cos(r), sa = Math.sin(r), cx = L.cx * W, cy = L.cy * H; pts = pts.map(([x, y]) => { const dx = x - cx, dy = y - cy; return [cx + dx * ca - dy * sa, cy + dx * sa + dy * ca]; }); }
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }
  function maskRender() {
    if (!window.TBX_SHAPES) return;
    const cv = $("#maskCanvas"); if (!cv) return;
    const hasV = !!(state.info && state.info.video);
    const W = state.frameCanvas ? state.frameCanvas.width : 640;
    const H = state.frameCanvas ? state.frameCanvas.height : 360;
    const k = Math.min(1, 760 / Math.max(W, H));
    cv.width = Math.max(1, Math.round(W * k)); cv.height = Math.max(1, Math.round(H * k));
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    const inv = $("#mkInvert").checked;
    const path = maskPath(cv.width, cv.height, inv);
    ctx.save();
    ctx.clip(path, inv ? "evenodd" : "nonzero");
    if (state.frameCanvas) ctx.drawImage(state.frameCanvas, 0, 0, cv.width, cv.height);
    else { ctx.fillStyle = "#333"; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.restore();
    $("#mkSizeVal").textContent = Math.round(state.maskShape.s * 100) + "%";
    $("#mkRotVal").textContent = state.maskShape.rot || 0;
    $("#mkRadiusVal").textContent = state.maskShape.params.radius || 0;
    $("#mkInfo").textContent = !state.file ? "请先选择视频文件" : !hasV ? "该文件没有视频画面，无法做形状遮罩" : `画面 ${W}×${H}${inv ? " · 反选" : ""}`;
  }
  function loadMaskFrame() {
    state.frameCanvas = null;
    if (!state.file) { maskRender(); return; }
    const currentFile = state.file;
    const url = state.playerUrl || URL.createObjectURL(state.file);
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    const grab = () => {
      if (!v.videoWidth) return;
      if (state.file !== currentFile) return;
      const c = newCanvas_(v.videoWidth, v.videoHeight);
      c.getContext("2d").drawImage(v, 0, 0);
      state.frameCanvas = c;
      maskRender();
    };
    v.addEventListener("loadeddata", () => { try { v.currentTime = 0.05; } catch (e) {} grab(); }, { once: true });
    v.addEventListener("seeked", grab, { once: true });
  }
  function newCanvas_(w, h) { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function initMask() {
    const S = window.TBX_SHAPES;
    if (!S) return;
    const pal = $("#maskPalette");
    pal.innerHTML = Object.keys(S.names).filter((k) => k !== "free").map((k) => `<button class="btn ghost" data-shape="${k}" style="font-size:12.5px;padding:6px 10px">${S.names[k]}</button>`).join("");
    pal.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.maskShape.type = b.dataset.shape; maskRender(); });
    ["#mkSize", "#mkRot", "#mkRadius"].forEach((s) => $(s).addEventListener("input", () => {
      state.maskShape.s = (+$("#mkSize").value) / 100;
      state.maskShape.rot = +$("#mkRot").value;
      state.maskShape.params = Object.assign({}, state.maskShape.params, { radius: +$("#mkRadius").value });
      maskRender();
    }));
    $("#mkInvert").addEventListener("change", maskRender);
    if ($("#mkKey")) {
      const syncKey = () => {
        const chroma = $("#mkKey").value === "chroma";
        $("#mkChromaRow").style.display = chroma ? "" : "none";
        $("#mkKeyColor").parentElement.style.display = chroma ? "" : "none";
        $("#mkSimVal").textContent = $("#mkSim").value + "%";
        $("#mkBlendVal").textContent = $("#mkBlend").value + "%";
        const pal2 = $("#maskPalette");
        if (pal2) pal2.style.display = chroma ? "none" : "";
        if ($("#mkInfo")) $("#mkInfo").textContent = chroma ? "绿幕抠像：背景色被去掉，输出带透明通道的视频。容差越大去得越干净（但可能误伤主体）。" : "";
      };
      $("#mkKey").addEventListener("change", syncKey);
      ["#mkSim", "#mkBlend"].forEach((s) => $(s).addEventListener("input", syncKey));
      syncKey();
    }
    const cv = $("#maskCanvas");
    let drag = null;
    cv.addEventListener("pointerdown", (e) => { const r = cv.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, cx: state.maskShape.cx, cy: state.maskShape.cy, w: r.width, h: r.height }; try { cv.setPointerCapture(e.pointerId); } catch (err2) {} e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => {
      if (!drag) return;
      state.maskShape.cx = Math.max(0, Math.min(1, drag.cx + (e.clientX - drag.x) / Math.max(1, drag.w)));
      state.maskShape.cy = Math.max(0, Math.min(1, drag.cy + (e.clientY - drag.y) / Math.max(1, drag.h)));
      maskRender();
    });
    ["pointerup", "pointercancel"].forEach((ev) => cv.addEventListener(ev, () => (drag = null)));
    maskRender();
  }

  /* ---------------- 模式 ---------------- */
  function selectTab(mode) {
    state.mode = mode;
    $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $$(".mode-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.mode !== mode));
    err(""); updateRun();
    if (typeof tlRender === "function") tlRender();
  }
  function buildRequest() {
    const m = state.mode, p = {};
    if (m === "compress") {
      if ($("#cpRes").value) p.height = $("#cpRes").value;
      p.crf = $("#cpCrf").value; p.preset = $("#cpPreset").value; p.abr = $("#cpAbr").value;
      const s = parseTime($("#cpStart").value), d = parseTime($("#cpDur").value);
      if (s) p.start = s; if (d) p.dur = d;
    } else if (m === "trim") {
      const s = parseTime($("#trStart").value), e = parseTime($("#trEnd").value), d = parseTime($("#trDur").value);
      if (s == null && e == null && d == null) throw new Error("请填写起始时间，以及结束时间或时长");
      if (s != null) p.start = s;
      if (d != null) p.dur = d; else if (e != null) p.end = e;
      if (p.dur != null && p.dur <= 0) throw new Error("时长必须大于 0");
      if (p.end != null && s != null && p.end <= s) throw new Error("结束时间必须大于起始时间");
      p.mode = $("#trMode .active").dataset.v;
    } else if (m === "gif") {
      const s = parseTime($("#gfStart").value), d = parseTime($("#gfDur").value);
      if (s) p.start = s;
      p.dur = d && d > 0 ? d : 3; p.fps = $("#gfFps").value; p.width = $("#gfWidth").value;
    } else if (m === "audio") {
      p.format = $("#auFmt").value; p.br = $("#auBr").value;
      const s = parseTime($("#auStart").value), d = parseTime($("#auDur").value);
      if (s) p.start = s; if (d) p.dur = d;
    } else if (m === "convert") {
      p.format = $("#cvFmt .active").dataset.v;
    } else if (m === "frame") {
      const t = parseTime($("#frTime").value);
      if (t == null) throw new Error("请填写截取时间");
      p.time = t;
    } else if (m === "frames") {
      p.mode = $("#fmMode .active").dataset.v;
      const v = parseFloat($("#fmVal").value);
      if (!(v > 0)) throw new Error("请填写有效的间隔或数量");
      if (p.mode === "count") p.count = Math.min(400, v); else p.interval = v;
      p.width = $("#fmWidth").value;
    } else if (m === "sprite") {
      const iv = parseFloat($("#spInterval").value);
      if (!(iv > 0)) throw new Error("请填写抽帧间隔");
      p.interval = iv; p.cols = $("#spCols").value; p.width = $("#spWidth").value;
    } else if (m === "watermark") {
      p.type = $("#wmType .active").dataset.v;
      p.pos = $("#wmPos").value; p.margin = $("#wmMargin").value;
      if (p.type === "text") {
        if (!$("#wmText").value.trim()) throw new Error("请填写水印文字");
        p.text = $("#wmText").value; p.fontSize = $("#wmSize").value; p.color = $("#wmColor").value; p.opacity = $("#wmOpacity").value;
      } else {
        if (!state.wmAssetId) throw new Error("请先选择水印图片（上传需要几秒）");
        p.asset = state.wmAssetId; p.imageScale = $("#wmScale").value;
      }
    } else if (m === "speed") {
      p.rate = (+$("#spdRate").value / 100).toFixed(2);
      p.keepPitch = $("#spdPitch").checked ? "1" : "0";
    } else if (m === "gif2mp4") {
      /* 无参数 */
    } else if (m === "subtitle") {
      const fs2 = +$("#subFontSize").value;
      if (fs2 > 0) p.fontSize = fs2;
      p.color = $("#subColor").value;
      p.outline = $("#subOutline").value;
      p.pos = $("#subPos").value;
      p.bold = $("#subBold").checked ? "1" : "0";
      p.crf = $("#subCrf").value;
      if ($("#subStyle") && $("#subStyle").value) p.style = $("#subStyle").value;
    } else if (m === "mask") {
      /* 运行时生成遮罩 */
    }
    return p;
  }

  /* ---------------- 执行 ---------------- */
  function showProgress(pct, label, color) {
    $("#progressWrap").style.display = "block";
    $("#progBar").style.width = Math.max(0, Math.min(100, pct)) + "%";
    $("#progBar").style.background = color || "var(--accent)";
    $("#progLabel").textContent = label + (pct ? ` ${Math.round(pct)}%` : "");
  }
  const hideProgress = () => ($("#progressWrap").style.display = "none");
  function setBusy(b) {
    $("#runBtn").disabled = b || !canRun();
    $("#runBtn").textContent = b ? "处理中…" : "开始处理";
    $("#cancelBtn").style.display = b ? "inline-flex" : "none";
    $("#concatRun").disabled = b || state.concat.length < 2;
  }
  function canRun() {
    if (state.mode === "concat") return state.concat.length >= 2;
    return !!state.file;
  }
  /* ---------------- 批量队列 ---------------- */
  async function runBatch(files) {
    if (!svc.ffmpeg) return err("本机服务或 ffmpeg 不可用，请先启动 server/start.bat。");
    state.batch = { total: files.length, idx: 0 };
    let okCount = 0, failCount = 0;
    for (let i = 0; i < files.length; i++) {
      if (state.cancelled) { err("批量处理已取消。"); break; }
      state.batch.idx = i;
      err(`批量处理：第 ${i + 1} / ${files.length} 个 —— ${files[i].name}`);
      try {
        await loadFile(files[i]);
        await run();
        okCount++;
      } catch (e) { console.error(e); failCount++; err(`第 ${i + 1} 个失败：${e.message}`); }
    }
    state.batch = null;
    state.cancelled = false;
    err(`批量完成：成功 ${okCount} 个${failCount ? "，失败 " + failCount + " 个" : ""}。可在下方"处理结果"里打包下载全部。`);
    hideProgress();
    setBusy(false);
  }

  function updateRun() { $("#runBtn").disabled = !canRun(); $("#concatRun").disabled = state.concat.length < 2; }

  async function pollAndFinish(id, origSize, extraLabel) {
    const t0 = Date.now();
    let st = { status: "running", pct: 0 };
    while (true) {
      await sleep(400);
      if (state.cancelled) break;
      st = await (await fetch(`${SERVICE}/av/status?id=${id}`, { cache: "no-store" })).json();
      showProgress(st.pct || 0, `处理中（已用 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）…`);
      if (st.status !== "running") break;
    }
    if (state.cancelled) {
      try { await fetch(`${SERVICE}/av/job?id=${id}`, { method: "DELETE" }); } catch (e) {}
      err("已取消"); showProgress(0, "已取消"); return;
    }
    if (st.status === "error") throw new Error(st.err || "处理失败");
    showProgress(100, "下载结果…");
    const rr = await fetch(`${SERVICE}/av/result?id=${id}`);
    if (!rr.ok) throw new Error("获取结果失败（可能已过期）");
    const blob = await rr.blob();
    addResult(st.outName || "output", blob, origSize, extraLabel || (st.frameCount ? `${st.frameCount} 张` : ""));
    showProgress(100, `完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`, "var(--ok)");
    setTimeout(hideProgress, 2500);
  }

  async function run() {
    err("");
    if (!svc.ffmpeg) return err("本机服务或 ffmpeg 不可用，请先启动 server/start.bat。");
    let params;
    try { params = buildRequest(); } catch (e) { return err(e.message); }
    setBusy(true);
    if (!state.batch) state.cancelled = false;
    showProgress(0, "已提交任务…");
    try {
      if (state.mode === "subtitle") {
        const srt = ($("#srtText") ? $("#srtText").value : "").trim();
        if (!srt) throw new Error("请先粘贴或导入 SRT 字幕");
        const rj = await (await fetch(SERVICE + "/asr/ref", { method: "POST", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: srt })).json();
        if (!rj.ok) throw new Error(rj.error || "字幕提交失败");
        params.srt = rj.id;
      }
      if (state.mode === "mask") {
        const keyMode = $("#mkKey") ? $("#mkKey").value : "shape";
        params.mode = $("#mkMode").value;
        params.bgcolor = $("#mkBg").value;
        if ($("#mkHeight") && $("#mkHeight").value) params.height = $("#mkHeight").value;
        if (keyMode === "chroma") {
          params.keyMode = "chroma";
          params.keycolor = $("#mkKeyColor").value;
          params.similarity = (+$("#mkSim").value / 100).toFixed(2);
          params.blend = (+$("#mkBlend").value / 100).toFixed(2);
        } else {
          if (!state.frameCanvas) throw new Error("该文件没有视频画面，无法做形状遮罩");
          const W = state.frameCanvas.width, H = state.frameCanvas.height;
          const inv = $("#mkInvert").checked;
          const mc = newCanvas_(W, H);
          const mctx = mc.getContext("2d");
          mctx.fillStyle = inv ? "#ffffff" : "#000000";
          mctx.fillRect(0, 0, W, H);
          mctx.fillStyle = inv ? "#000000" : "#ffffff";
          mctx.fill(maskPath(W, H, false));
          const mblob = await new Promise((r) => mc.toBlob(r, "image/png"));
          const aj = await (await fetch(SERVICE + "/av/asset", { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-filename": "mask.png" }, body: mblob })).json();
          if (!aj.ok) throw new Error(aj.error || "遮罩上传失败");
          params.asset = aj.id;
        }
      }
      const qs = new URLSearchParams(Object.assign({ op: state.mode === "mask" ? "maskvideo" : state.mode }, params));
      const j = await (await fetch(`${SERVICE}/av/run?${qs}`, {
        method: "POST", headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(state.file.name) }, body: state.file,
      })).json();
      if (!j.ok) throw new Error(j.error || "提交失败");
      state.jobId = j.id;
      await pollAndFinish(j.id, state.file.size);
    } catch (e) { console.error(e); err("处理出错：" + e.message); hideProgress(); }
    finally { setBusy(false); }
  }

  /* ---------------- 拼接 ---------------- */
  async function ensureConcatSession() {
    if (state.concatSid) return state.concatSid;
    const j = await (await fetch(SERVICE + "/av/concat/new", { method: "POST" })).json();
    if (!j.ok) throw new Error(j.error || "创建会话失败");
    state.concatSid = j.id;
    return j.id;
  }
  async function addConcatFiles(list) {
    err("");
    const files = Array.from(list || []).filter((f) => /^(video|audio)\//.test(f.type) || /\.(mp4|mov|mkv|webm|avi|flv|m4v|mp3|m4a|wav|aac)$/i.test(f.name));
    if (!files.length) return err("请选择视频/音频文件。");
    setBusy(true);
    try {
      const sid = await ensureConcatSession();
      for (const f of files) {
        const j = await (await fetch(`${SERVICE}/av/concat/add?sid=${sid}`, {
          method: "POST", headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(f.name) }, body: f,
        })).json();
        if (!j.ok) throw new Error(j.error || "添加失败");
        state.concat.push({ name: f.name, size: f.size, duration: j.duration || 0, video: j.video || "-" });
      }
      renderConcat();
    } catch (e) { err("添加片段失败：" + e.message); }
    finally { setBusy(false); }
  }
  function renderConcat() {
    const box = $("#concatList");
    box.innerHTML = "";
    if (!state.concat.length) { box.innerHTML = '<div class="empty">还没有片段，点上方添加</div>'; updateRun(); return; }
    state.concat.forEach((c, i) => {
      const d = document.createElement("div");
      d.className = "result";
      d.innerHTML = `<div style="width:40px;height:40px;border-radius:8px;border:1px solid var(--line);background:var(--surface-3);display:grid;place-items:center;font-weight:800;font-size:13px">${i + 1}</div>
        <div class="meta"><div class="nm">${he(c.name)}</div><div class="sz">${fmtTime(c.duration)} · ${he(c.video)} · ${fmtBytes(c.size)}</div></div>
        <button class="btn ghost up" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn ghost down" ${i === state.concat.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn ghost danger rm">×</button>`;
      d.querySelector(".up").onclick = () => { const t = state.concat[i - 1]; state.concat[i - 1] = state.concat[i]; state.concat[i] = t; renderConcat(); };
      d.querySelector(".down").onclick = () => { const t = state.concat[i + 1]; state.concat[i + 1] = state.concat[i]; state.concat[i] = t; renderConcat(); };
      d.querySelector(".rm").onclick = () => { state.concat.splice(i, 1); renderConcat(); };
      box.appendChild(d);
    });
    const total = state.concat.reduce((a, c) => a + (c.duration || 0), 0);
    const foot = document.createElement("div");
    foot.className = "hint";
    foot.textContent = `共 ${state.concat.length} 个片段，合计约 ${fmtTime(total)}`;
    box.appendChild(foot);
    updateRun();
  }
  async function runConcat() {
    err("");
    if (state.concat.length < 2) return err("至少需要 2 个片段。");
    if (!state.concatSid) return err("片段会话已失效，请清空后重新添加。");
    setBusy(true); state.cancelled = false;
    showProgress(0, "已提交拼接任务…");
    try {
      const qs = new URLSearchParams({ sid: state.concatSid, mode: $("#catMode .active").dataset.v, height: $("#catHeight").value || "" });
      const j = await (await fetch(`${SERVICE}/av/concat/run?${qs}`, { method: "POST" })).json();
      if (!j.ok) throw new Error(j.error || "提交失败");
      const total = state.concat.reduce((a, c) => a + c.size, 0);
      await pollAndFinish(j.id, total);
    } catch (e) { console.error(e); err("拼接出错：" + e.message); hideProgress(); }
    finally { setBusy(false); }
  }

  /* ---------------- 水印图片上传 ---------------- */
  async function uploadWmImage(file) {
    if (!file) return;
    err("正在上传水印图片…");
    try {
      const j = await (await fetch(SERVICE + "/av/asset", { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(file.name) }, body: file })).json();
      if (!j.ok) throw new Error(j.error || "上传失败");
      state.wmAssetId = j.id;
      err("");
      alert(`水印图片已上传：${file.name}`);
    } catch (e) { state.wmAssetId = null; err("水印图片上传失败：" + e.message); }
  }

  /* ---------------- 结果 ---------------- */
  function addResult(name, blob, origSize, note) {
    state.results.push({ id: Math.random().toString(36).slice(2), name, blob, url: URL.createObjectURL(blob), size: blob.size, orig: origSize, note });
    renderResults();
  }
  function renderResults() {
    const box = $("#results");
    box.innerHTML = "";
    if (!state.results.length) { box.innerHTML = '<div class="empty">处理后的文件会出现在这里</div>'; return; }
    state.results.forEach((r) => {
      const d = document.createElement("div");
      d.className = "result";
      let sz = fmtBytes(r.size);
      if (r.orig && r.orig > 0) {
        const delta = ((r.size - r.orig) / r.orig) * 100;
        const cls = delta <= 0 ? "delta-down" : "delta-up";
        sz = `${fmtBytes(r.orig)} → <b>${fmtBytes(r.size)}</b> <span class="${cls}">(${delta <= 0 ? "−" : "+"}${Math.abs(delta).toFixed(0)}%)</span>`;
      }
      if (r.note) sz += ` · ${r.note}`;
      const ic = /\.zip$/i.test(r.name) ? "🗜️" : /\.gif$/i.test(r.name) ? "🖼️" : /\.(mp3|m4a|wav|flac|ogg)$/i.test(r.name) ? "🎵" : /\.(jpg|png)$/i.test(r.name) ? "📷" : "🎬";
      d.innerHTML = `<div style="width:54px;height:54px;border-radius:8px;border:1px solid var(--line);background:var(--surface-3);display:grid;place-items:center;font-size:24px">${ic}</div>
        <div class="meta"><div class="nm">${he(r.name)}</div><div class="sz">${sz}</div></div>
        <button class="btn ghost dl">下载</button>`;
      d.querySelector(".dl").onclick = () => { const a = document.createElement("a"); a.href = r.url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove(); };
      box.appendChild(d);
    });
  }
  function clearResults() {
    state.results.forEach((r) => URL.revokeObjectURL(r.url));
    state.results = []; renderResults();
  }

  /* ---------------- 事件 ---------------- */
  function seg(sel, after) {
    const root = $(sel);
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", root).forEach((x) => x.classList.toggle("active", x === b));
      if (after) after(b.dataset.v);
    });
  }
  function init() {
    $("#fileInput").addEventListener("change", (e) => {
      const fs = Array.from(e.target.files || []);
      e.target.value = "";
      if (!fs.length) return;
      if (fs.length === 1) { loadFile(fs[0]); return; }
      runBatch(fs);
    });
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => {
      const fs = Array.from(e.dataTransfer.files || []);
      if (!fs.length) return;
      if (fs.length === 1) { loadFile(fs[0]); return; }
      runBatch(fs);
    });
    drop.addEventListener("click", () => $("#fileInput").click());
    document.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.files;
      if (items && items.length) { const f = Array.from(items).find((x) => /^(video|audio)\//.test(x.type)); if (f) loadFile(f); }
    });

    $("#clearBtn").onclick = () => {
      state.file = null; state.info = null;
      state.wmAssetId = null;
      $("#fileName").textContent = "尚未选择文件"; $("#fileInfo").innerHTML = "";
      $("#mediaPreview").style.display = "none";
      $("#playerWrap").innerHTML = "";
      if (state.playerUrl) { try { URL.revokeObjectURL(state.playerUrl); } catch (e) {} state.playerUrl = null; }
      if (state.stripUrl) { try { URL.revokeObjectURL(state.stripUrl); } catch (e) {} state.stripUrl = null; }
      state.frameCanvas = null;
      state.markStartSec = null;
      if (state.mode === "concat") { state.concat = []; state.concatSid = null; renderConcat(); }
      $("#clearBtn").disabled = true; clearResults(); hideProgress(); err(""); updateRun();
    };
    $$("#tabs .tab").forEach((b) => (b.onclick = () => selectTab(b.dataset.mode)));
    seg("#trMode"); seg("#cvFmt"); seg("#catMode");
    seg("#fmMode", (v) => ($("#fmValLabel").textContent = v === "count" ? "抽多少张" : "间隔（秒）"));
    seg("#wmType", (v) => {
      $("#wmTextWrap").classList.toggle("hidden", v !== "text");
      $("#wmImageWrap").classList.toggle("hidden", v !== "image");
    });
    seg("#spdPreset", (v) => { $("#spdRate").value = Math.round(parseFloat(v) * 100); $("#spdVal").textContent = parseFloat(v).toFixed(1); });

    $("#cpCrf").addEventListener("input", (e) => ($("#cpCrfVal").textContent = e.target.value));
    $("#gfFps").addEventListener("input", (e) => ($("#gfFpsVal").textContent = e.target.value));
    $("#wmOpacity").addEventListener("input", (e) => ($("#wmOpVal").textContent = e.target.value + "%"));
    $("#wmScale").addEventListener("input", (e) => ($("#wmSclVal").textContent = e.target.value + "%"));
    $("#spdRate").addEventListener("input", (e) => ($("#spdVal").textContent = (e.target.value / 100).toFixed(1)));

    $("#runBtn").onclick = run;
    $("#cancelBtn").onclick = () => (state.cancelled = true);
    $("#markStart").onclick = markStart;
    $("#markEnd").onclick = markEnd;
    $("#genStrip").onclick = genStrip;
    // 字幕
    const bindRange = (id, out, fmt) => { const el = $(id); if (el && $(out)) el.addEventListener("input", () => ($(out).textContent = fmt ? fmt(el.value) : el.value)); };
    bindRange("#subFontSize", "#subFsVal", (v) => (+v > 0 ? v + " px" : "自动"));
    bindRange("#subOutline", "#subOlVal");
    bindRange("#subCrf", "#subCrfVal");
    $("#importSrt").onclick = () => $("#srtFile").click();
    $("#srtFile").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const txt = await f.text();
      $("#srtText").value = txt.trim();
      $("#srtMsg").textContent = `已导入 ${f.name}（${txt.length} 字符）`;
      e.target.value = "";
      err("");
    });
    $("#clearSrt").onclick = () => { $("#srtText").value = ""; $("#srtMsg").textContent = ""; };
    initMask();
    tlInit();
    ["#trStart", "#trEnd", "#cpStart", "#cpDur", "#gfStart", "#gfDur", "#auStart", "#auDur"].forEach((s) => {
      const el = $(s); if (el) el.addEventListener("input", () => tlRender());
    });

    // 拼接
    const cd = $("#concatDrop");
    $("#concatInput").addEventListener("change", (e) => { addConcatFiles(e.target.files); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => cd.addEventListener(ev, (e) => { e.preventDefault(); cd.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => cd.addEventListener(ev, (e) => { e.preventDefault(); cd.classList.remove("over"); }));
    cd.addEventListener("drop", (e) => addConcatFiles(e.dataTransfer.files));
    cd.addEventListener("click", () => $("#concatInput").click());
    $("#concatRun").onclick = runConcat;
    $("#concatClear").onclick = () => { state.concat = []; state.concatSid = null; renderConcat(); err(""); };

    // 水印图片
    $("#wmImage").addEventListener("change", (e) => { if (e.target.files[0]) uploadWmImage(e.target.files[0]); e.target.value = ""; });

    selectTab("compress");
    renderConcat();
    checkService();
    // 从「语音转文字」页带过来的字幕
    try {
      const pending = localStorage.getItem("toolbox.pendingSrt");
      if (pending) {
        localStorage.removeItem("toolbox.pendingSrt");
        $("#srtText").value = pending;
        $("#srtMsg").textContent = `已从「语音转文字」导入字幕（${pending.length} 字符）`;
        selectTab("subtitle");
      }
    } catch (e) {}
  }
  /* ---------------- 最近打开（记忆） ---------------- */
  window.TBX_onRecentFiles = (files) => { if (files && files.length) loadFile(files[0]); };
  window.TBX_onRecentFile = (file) => { if (file) loadFile(file); };
  window.TBX_onFileMiss = () => { const i = $("#fileInput"); if (i) i.click(); };
  (function wireRecent() {
    const b = document.getElementById("recentClear");
    const badge = document.getElementById("recentBadge");
    if (badge) badge.textContent = (window.TBX_recent && TBX_recent.canReopen()) ? "可直接重新打开" : "仅记录文件名";
    if (b) b.onclick = async () => {
      if (!window.TBX_recent) return;
      if (!confirm("清空「最近打开」记录？（不会删除你的文件）")) return;
      await TBX_recent.clear("av");
      if (window.TBX_refreshRecent) TBX_refreshRecent();
    };
  })();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
