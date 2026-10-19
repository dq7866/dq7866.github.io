/* ============================================================
   免费工具箱 · 音视频播放器
   音频/视频播放 + SRT/VTT/ASS 字幕（预设样式、位置、行数）
   + 浮窗（Document PiP / 页内可拖拽缩放）+ 系统画中画
   ============================================================ */
(function () {
  "use strict";

  const he = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (s) => document.querySelector(s);
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
    const p = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
  };

  /* ---------------- 字幕样式预设 ---------------- */
  const PRESETS = {
    classic:    { label: "经典白字黑边", sizePct: 4.2, color: "#ffffff", outline: "#000000", stroke: 2,   shadow: "0 1px 2px rgba(0,0,0,.6)", bg: "transparent", pad: "0", weight: 700 },
    big_yellow: { label: "大号黄字粗边", sizePct: 5.6, color: "#ffe000", outline: "#1a1a1a", stroke: 3,   shadow: "0 2px 4px rgba(0,0,0,.55)", bg: "transparent", pad: "0", weight: 800 },
    variety:    { label: "综艺花字",     sizePct: 5.8, color: "#ffffff", outline: "#ff3d00", stroke: 3.5, shadow: "0 3px 0 rgba(0,0,0,.45)", bg: "transparent", pad: "0", weight: 900 },
    glow:       { label: "霓虹发光",     sizePct: 5.2, color: "#eaffff", outline: "#00e5ff", stroke: 1.5, shadow: "0 0 8px #00e5ff, 0 0 18px rgba(0,229,255,.75)", bg: "transparent", pad: "0", weight: 800 },
    box:        { label: "半透明字幕条", sizePct: 4.2, color: "#ffffff", outline: "transparent", stroke: 0, shadow: "none", bg: "rgba(0,0,0,.55)", pad: ".12em .55em", weight: 700 },
    top:        { label: "顶部标题",     sizePct: 5.4, color: "#ffffff", outline: "#000000", stroke: 2.5, shadow: "0 2px 6px rgba(0,0,0,.6)", bg: "transparent", pad: "0", weight: 800 },
    pop:        { label: "弹幕感",       sizePct: 5.0, color: "#00ffd5", outline: "#111111", stroke: 2,   shadow: "3px 3px 0 rgba(0,0,0,.7)", bg: "transparent", pad: "0", weight: 800 }
  };

  const state = {
    file: null, url: null, isAudio: false, handle: null, resumeTo: 0, playlist: [], lastSave: 0,
    cues: [], activeIdx: -1, delay: 0,
    preset: "classic", subsOn: true,
    float: false, pipWin: null,
    fsPct: 4.2, custom: { color: "#ffffff", stroke: "#000000", bg: "#000000", strokeW: 2, bgOp: 0, posPct: 74 }
  };

  const video = $("#video"), stage = $("#stage"), subs = $("#subs"), empty = $("#empty");

  /* ---------------- 字幕解析 ---------------- */
  function t2s(h, m, s, ms) { return (+h) * 3600 + (+m) * 60 + (+s) + (+String(ms).padEnd(3, "0").slice(0, 3)) / 1000; }

  function parseSRT(text) {
    const out = [];
    const blocks = String(text || "").replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "").split(/\n{2,}/);
    for (const b of blocks) {
      const lines = b.split("\n").filter((l) => l.trim() !== "");
      if (!lines.length) continue;
      let i = 0;
      if (/^\d+$/.test(lines[0].trim())) i = 1;
      const m = (lines[i] || "").match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
      if (!m) continue;
      const body = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").trim();
      if (body) out.push({ start: t2s(m[1], m[2], m[3], m[4]), end: t2s(m[5], m[6], m[7], m[8]), text: body });
    }
    return out;
  }

  function parseVTT(text) {
    const t = String(text || "").replace(/\r\n?/g, "\n");
    return parseSRT(t.replace(/^WEBVTT[^\n]*\n/, "").replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2"));
  }

  function parseASS(text) {
    const out = [];
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    let fmtCols = null;
    for (const raw of lines) {
      const l = raw.trim();
      if (/^Format:/i.test(l) && /Start/i.test(l)) { fmtCols = l.slice(7).split(",").map((s) => s.trim().toLowerCase()); continue; }
      if (!/^Dialogue:/i.test(l)) continue;
      const parts = l.slice(9).split(",");
      if (!fmtCols || parts.length < 4) continue;
      const si = fmtCols.indexOf("start"), ei = fmtCols.indexOf("end"), ti = fmtCols.indexOf("text");
      if (si < 0 || ei < 0 || ti < 0) continue;
      const at = (v) => { const m = String(v).match(/(\d+):(\d{2}):(\d{2})[.:](\d{1,2})/); return m ? t2s(m[1], m[2], m[3], (+m[4]) * 10) : 0; };
      const body = parts.slice(ti).join(",").replace(/\{[^}]*\}/g, "").replace(/\\N/gi, "\n").replace(/\\n/gi, "\n").trim();
      const st = at(parts[si]), en = at(parts[ei]);
      if (body && en > st) out.push({ start: st, end: en, text: body });
    }
    return out;
  }

  function parseSubs(text, name) {
    const n = String(name || "").toLowerCase();
    if (/\.ass$|\.ssa$/.test(n)) return parseASS(text);
    if (/\.vtt$/.test(n)) return parseVTT(text);
    const srt = parseSRT(text);
    return srt.length ? srt : parseVTT(text);
  }

  /* ---------------- 字幕渲染 ---------------- */
  function chunkLine(line, maxChars) {
    if (!maxChars || maxChars <= 0 || line.length <= maxChars) return [line];
    const out = [];
    for (let i = 0; i < line.length; i += maxChars) out.push(line.slice(i, i + maxChars));
    return out;
  }

  function cueToLines(text) {
    const maxChars = parseInt($("#wrapChars").value, 10) || 0;
    let lines = [];
    String(text).split("\n").forEach((l) => { lines = lines.concat(chunkLine(l.trim(), maxChars)); });
    const cap = parseInt($("#maxLines").value, 10);
    if (cap > 0 && lines.length > cap) lines = lines.slice(0, cap);
    return lines;
  }

  function paintSubs(text) {
    if (!state.subsOn || !text) { subs.innerHTML = ""; return; }
    const lines = cueToLines(text);
    subs.innerHTML = lines.map((l) => `<span class="line">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`).join("");
    applyStyle();
  }

  function applyStyle() {
    const custom = state.preset === "custom";
    const p = custom
      ? { color: state.custom.color, outline: state.custom.stroke, stroke: state.custom.strokeW, shadow: "0 1px 3px rgba(0,0,0,.55)", bg: state.custom.bgOp > 0 ? hexA(state.custom.bg, state.custom.bgOp / 100) : "transparent", pad: state.custom.bgOp > 0 ? ".12em .55em" : "0", weight: 700, sizePct: state.fsPct }
      : (PRESETS[state.preset] || PRESETS.classic);
    const h = stage.clientHeight || 360;
    subs.style.fontSize = Math.max(11, Math.round((h * p.sizePct) / 100)) + "px";
    subs.style.setProperty("--sub-color", p.color);
    subs.style.setProperty("--sub-stroke-color", p.outline);
    subs.style.setProperty("--sub-stroke", p.stroke + "px");
    subs.style.setProperty("--sub-shadow", p.shadow);
    subs.style.setProperty("--sub-bg", p.bg);
    subs.style.setProperty("--sub-pad", p.pad);
    subs.style.setProperty("--sub-weight", p.weight);
    // 位置
    const pos = $("#pos").value;
    subs.classList.remove("pl-sub-pos-bottom", "pl-sub-pos-center", "pl-sub-pos-top", "pl-sub-pos-custom");
    if (pos === "custom") {
      subs.classList.add("pl-sub-pos-custom");
      subs.style.setProperty("--sub-custom", state.custom.posPct + "%");
    } else {
      subs.classList.add("pl-sub-pos-" + pos);
    }
  }

  function hexA(hex, a) {
    const m = String(hex).replace("#", "");
    const r = parseInt(m.slice(0, 2), 10) || 0, g = parseInt(m.slice(2, 4), 10) || 0, b = parseInt(m.slice(4, 6), 10) || 0;
    return `rgba(${r},${g},${b},${a})`;
  }

  function activeCue(t) {
    const tt = t + state.delay;
    for (let i = 0; i < state.cues.length; i++) {
      const c = state.cues[i];
      if (tt >= c.start && tt <= c.end) return i;
    }
    return -1;
  }

  function markList(idx) {
    const box = $("#subList");
    if (!box.children.length) return;
    const prev = box.querySelector(".row.on");
    if (prev) prev.classList.remove("on");
    if (idx >= 0 && box.children[idx]) {
      const el = box.children[idx];
      el.classList.add("on");
      if (state.subsOn && !state.float) {
        const elTop = el.offsetTop;
        const elBottom = elTop + el.offsetHeight;
        const viewTop = box.scrollTop;
        const viewBottom = viewTop + box.clientHeight;
        if (elTop < viewTop || elBottom > viewBottom) {
          box.scrollTop = elTop - box.clientHeight / 2 + el.offsetHeight / 2;
        }
      }
    }
  }

  function tick() {
    const t = video.currentTime || 0;
    const idx = state.cues.length ? activeCue(t) : -1;
    if (idx !== state.activeIdx) {
      state.activeIdx = idx;
      paintSubs(idx >= 0 ? state.cues[idx].text : "");
      markList(idx);
    }
    if (!seekDrag) {
      const d = video.duration;
      if (isFinite(d) && d > 0) { $("#seek").value = String(Math.round((t / d) * 1000)); $("#tDur").textContent = fmt(d); }
      $("#tCur").textContent = fmt(t);
    }
    drawBars();
  }

  /* ---------------- 音频频谱（真实 analyser，失败则静默） ---------------- */
  let audioCtx = null, analyser = null, aData = null, srcNode = null;
  function initAnalyser() {
    if (audioCtx || !state.isAudio) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      srcNode = audioCtx.createMediaElementSource(video);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      aData = new Uint8Array(analyser.frequencyBinCount);
      srcNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (e) {
      try { if (srcNode) srcNode.disconnect(); } catch (e2) {}
      try { if (audioCtx) audioCtx.close(); } catch (e2) {}
      srcNode = null;
      audioCtx = null;
      analyser = null;
    }
  }
  function drawBars() {
    const bars = $("#bars");
    if (!bars || !state.isAudio) return;
    const n = bars.children.length;
    if (!n) return;
    if (!analyser) {
      const t = Date.now() / 260;
      for (let i = 0; i < n; i++) bars.children[i].style.height = (video.paused ? 6 : 8 + Math.abs(Math.sin(t + i * 0.7)) * 26) + "px";
      return;
    }
    analyser.getByteFrequencyData(aData);
    const step = Math.floor(aData.length / n) || 1;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let k = 0; k < step; k++) v = Math.max(v, aData[i * step + k] || 0);
      bars.children[i].style.height = Math.max(5, (v / 255) * 40) + "px";
    }
  }

  function buildBars() {
    const bars = $("#bars");
    if (!bars || bars.children.length) return;
    bars.innerHTML = Array.from({ length: 28 }, () => "<i></i>").join("");
  }

  /* ---------------- 媒体加载 ---------------- */
  function isAudioFile(f) { return /^audio\//.test(f.type) || /\.(mp3|m4a|wav|flac|ogg|aac|opus|wma)$/i.test(f.name); }

  function loadMedia(f, handle) {
    if (!f) return;
    if (state.url) { URL.revokeObjectURL(state.url); state.url = null; }
    state.file = f;
    state.handle = handle || null;
    state.isAudio = isAudioFile(f);
    state.url = URL.createObjectURL(f);
    video.src = state.url;
    video.load();
    empty.style.display = "none";
    stage.classList.toggle("pl-audio", state.isAudio);
    $("#fileName").textContent = `${f.name} · ${fmtBytes(f.size)}`;
    $("#fbarTitle").textContent = f.name;
    $("#afName").textContent = f.name;
    $("#clearBtn").disabled = false;
    ["#playBtn", "#backBtn", "#fwdBtn", "#seek"].forEach((s) => ($(s).disabled = false));
    buildBars();
    if (state.isAudio) initAnalyser();
    // 记忆：加入最近打开
    if (window.TBX_recent) {
      try {
        TBX_recent.add("media-recent", f, state.handle);
        TBX_recent.add("player", f, state.handle);
        renderPlaylist();
        renderRecent();
      } catch (e) {}
    }
    // 断点续播
    const key = window.TBX_recent ? TBX_recent.posKey(f.name, f.size) : null;
    const resumeAt = key ? TBX_recent.getPos(key) : 0;
    state.resumeTo = resumeAt > 3 ? resumeAt : 0;
    video.play().catch(() => {});
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;left:50%;bottom:36px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 16px;border-radius:999px;font-size:13px;z-index:2000;box-shadow:var(--shadow)";
    document.body.appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .4s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 420); }, 1500);
  }

  /* ---------------- 播放列表 / 最近打开 ---------------- */
  function rowHtml(e, i, opts) {
    return `<div class="tbx-recent-row ${e.handle ? "" : "no-handle"} ${opts.playing ? "playing" : ""}" data-idx="${i}">
      ${opts.idx ? `<span class="idx">${i + 1}</span>` : `<span class="ico">${e.handle ? "🔗" : "📄"}</span>`}
      <span class="nm" title="${he(e.name)}">${he(e.name)}</span>
      <span class="sz">${fmtBytes(e.size)}</span>
      <button class="tbx-recent-x" data-del="${i}" title="移除">✕</button>
    </div>`;
  }

  async function renderPlaylist() {
    const box = $("#plList");
    if (!box || !window.TBX_recent) return;
    const items = await TBX_recent.list("player");
    state.playlist = items;
    if (!items.length) { box.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12.5px">播放列表是空的</div>'; return; }
    const curName = state.file ? state.file.name : "";
    const curSize = state.file ? state.file.size : -1;
    box.innerHTML = items.map((e, i) => rowHtml(e, i, { idx: true, playing: e.name === curName && e.size === curSize })).join("");
    box.querySelectorAll(".tbx-recent-row").forEach((row) => {
      const i = +row.dataset.idx, e = items[i];
      row.addEventListener("click", async (ev) => {
        if (ev.target.closest("[data-del]")) return;
        await openEntry(e);
      });
      const d = row.querySelector("[data-del]");
      if (d) d.addEventListener("click", async (ev) => { ev.stopPropagation(); await TBX_recent.remove("player", e.id); renderPlaylist(); });
    });
  }

  async function renderRecent() {
    const box = $("#recentList");
    if (!box || !window.TBX_recent) return;
    const hint = $("#recentHint");
    if (hint) hint.textContent = TBX_recent.canReopen() ? "可直接重新打开" : "仅记录，需重选";
    await TBX_recent.renderInto(box, "media-recent", {
      onFile: (file, entry, handle) => { loadMedia(file, handle); },
      onMiss: (entry) => toast("这个文件需要用「选择文件」重新指定一次")
    });
  }

  async function openEntry(e) {
    if (!window.TBX_recent) return;
    const r = await TBX_recent.reopen(e, { allowPick: false });
    if (r && r.file) { loadMedia(r.file, r.handle); return; }
    // 没有句柄 / 授权失败：退回到文件选择
    toast("请在弹出的窗口里重新选择「" + e.name + "」");
    const picked = await TBX_recent.pick({ multiple: false, accept: "video/*,audio/*,.mp4,.mov,.mkv,.webm,.mp3,.m4a,.wav,.flac" });
    if (picked.length) loadMedia(picked[0].file, picked[0].handle);
  }

  function playNext() {
    const items = state.playlist || [];
    if (!items.length || !state.file) return false;
    const i = items.findIndex((e) => e.name === state.file.name && e.size === state.file.size);
    const next = items[i + 1];
    if (!next) return false;
    openEntry(next);
    return true;
  }

  const fmtBytes = (n) => (!isFinite(n) ? "-" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");

  function setPlayLabel() {
    $("#playBtn").textContent = video.paused ? "▶ 播放" : "⏸ 暂停";
  }

  /* ---------------- 字幕载入 ---------------- */
  function loadSubtitleText(text, name) {
    const cues = parseSubs(text, name);
    if (!cues.length) { $("#subCount").textContent = "没解析出字幕：请检查文件是否为标准 SRT/VTT/ASS 格式。"; return; }
    state.cues = cues;
    state.activeIdx = -1;
    const box = $("#subList");
    box.innerHTML = cues.map((c) => `<div class="row"><span class="tm">${fmt(c.start)}</span><span>${he(c.text.replace(/\n/g, " "))}</span></div>`).join("");
    $("#subCount").textContent = `已加载 ${cues.length} 条字幕 · 来源 ${name || "字幕文件"}`;
    paintSubs("");
  }

  /* ---------------- 页内浮窗：拖拽 + 缩放 ---------------- */
  let drag = null, resizeDrag = null, seekDrag = false;
  function makeFloat() {
    if (state.float) return;
    state.float = true;
    stage.classList.add("pl-float");
    const r = stage.getBoundingClientRect();
    stage.style.width = Math.min(520, Math.max(280, r.width || 480)) + "px";
    stage.style.height = Math.round(stage.offsetWidth * 9 / 16) + "px";
    stage.style.left = "auto"; stage.style.top = "auto";
    stage.style.right = "24px"; stage.style.bottom = "24px";
    $("#pipBtn").textContent = "收回页面";
    applyStyle();
  }
  function unfloat() {
    if (!state.float) return;
    state.float = false;
    stage.classList.remove("pl-float");
    stage.style.cssText = "";
    $("#pipBtn").textContent = "浮窗播放";
    applyStyle();
  }

  function wireFloat() {
    const bar = $("#fbar");
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".pl-fbtn")) return;
      const r = stage.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      stage.style.right = "auto"; stage.style.bottom = "auto";
      stage.style.left = r.left + "px"; stage.style.top = r.top + "px";
      try { bar.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    bar.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const w = stage.offsetWidth, h = stage.offsetHeight;
      let l = drag.left + (e.clientX - drag.x), t = drag.top + (e.clientY - drag.y);
      l = Math.max(4, Math.min(window.innerWidth - w - 4, l));
      t = Math.max(4, Math.min(window.innerHeight - h - 4, t));
      stage.style.left = l + "px"; stage.style.top = t + "px";
    });
    ["pointerup", "pointercancel"].forEach((ev) => bar.addEventListener(ev, () => (drag = null)));

    const rh = $("#resize");
    rh.addEventListener("pointerdown", (e) => {
      resizeDrag = { x: e.clientX, y: e.clientY, w: stage.offsetWidth, h: stage.offsetHeight };
      try { rh.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault(); e.stopPropagation();
    });
    rh.addEventListener("pointermove", (e) => {
      if (!resizeDrag) return;
      const w = Math.max(240, resizeDrag.w + (e.clientX - resizeDrag.x));
      const h = Math.max(140, resizeDrag.h + (e.clientY - resizeDrag.y));
      stage.style.width = w + "px"; stage.style.height = h + "px";
      applyStyle();
    });
    ["pointerup", "pointercancel"].forEach((ev) => rh.addEventListener(ev, () => (resizeDrag = null)));

    $("#fDock").addEventListener("click", unfloat);
    $("#fClose").addEventListener("click", () => { unfloat(); if (state.pipWin) { try { state.pipWin.close(); } catch (e) {} state.pipWin = null; } });
  }

  /* ---------------- Document PiP 浮窗 ---------------- */
  const pipSupported = () => "documentPictureInPicture" in window;
  async function togglePip() {
    if (state.pipWin) { try { state.pipWin.close(); } catch (e) {} return; }
    if (!pipSupported()) { state.float ? unfloat() : makeFloat(); return; }
    try {
      const wasPlaying = !video.paused;
      const w = await window.documentPictureInPicture.requestWindow({ width: 520, height: 320 });
      state.pipWin = w;
      w.document.body.style.cssText = "margin:0;background:#000;overflow:hidden";
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => w.document.head.appendChild(n.cloneNode(true)));
      const holder = document.createElement("div");
      holder.style.cssText = "position:absolute;inset:0";
      w.document.body.appendChild(holder);
      holder.appendChild(stage);
      stage.classList.add("pl-pip");
      stage.style.cssText = "position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;border:0;border-radius:0";
      stage.classList.remove("pl-float");
      state.float = false;
      requestAnimationFrame(() => { applyStyle(); if (wasPlaying) video.play().catch(() => {}); });
      const back = () => {
        try {
          const stillPlaying = !video.paused;
          document.querySelector(".pl-stage-wrap").appendChild(stage);
          stage.classList.remove("pl-pip");
          stage.style.cssText = "";
          state.pipWin = null;
          requestAnimationFrame(() => { applyStyle(); if (stillPlaying) video.play().catch(() => {}); });
        } catch (e) {}
      };
      w.addEventListener("pagehide", back);
      $("#pipBtn").textContent = "浮窗播放";
    } catch (e) {
      makeFloat();
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function init() {
    // 文件
    $("#fileInput").addEventListener("change", (e) => { if (e.target.files[0]) loadMedia(e.target.files[0]); e.target.value = ""; });
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadMedia(f); });
    $("#clearBtn").addEventListener("click", () => {
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = null; state.file = null; state.cues = [];
      video.removeAttribute("src"); video.load();
      stage.classList.remove("pl-audio");
      empty.style.display = ""; $("#fileName").textContent = "尚未选择文件";
      $("#subList").innerHTML = ""; $("#subCount").textContent = "尚未加载字幕";
      paintSubs(""); $("#fbarTitle").textContent = "播放器"; $("#clearBtn").disabled = true;
      ["#playBtn", "#backBtn", "#fwdBtn", "#seek"].forEach((s) => ($(s).disabled = true));
      setPlayLabel();
    });

    // 播放控制
    $("#playBtn").addEventListener("click", () => { if (video.paused) video.play().catch(() => {}); else video.pause(); });
    video.addEventListener("play", () => { setPlayLabel(); if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {}); });
    video.addEventListener("pause", () => {
      setPlayLabel();
      if (state.file && video.currentTime > 3 && window.TBX_recent) TBX_recent.savePos(TBX_recent.posKey(state.file.name, state.file.size), video.currentTime);
    });
    video.addEventListener("ended", () => {
      if (window.TBX_recent && state.file) TBX_recent.clearPos(TBX_recent.posKey(state.file.name, state.file.size));
      if (video.loop) return;
      setPlayLabel();
      if (!playNext()) toast("播放列表到底了");
    });
    video.addEventListener("timeupdate", () => {
      tick();
      const t = video.currentTime;
      if (state.file && t > 3 && Math.abs(t - state.lastSave) > 5) {
        state.lastSave = t;
        if (window.TBX_recent) TBX_recent.savePos(TBX_recent.posKey(state.file.name, state.file.size), t);
      }
    });
    video.addEventListener("seeked", tick);
    video.addEventListener("loadedmetadata", () => {
      $("#tDur").textContent = fmt(video.duration);
      if (state.resumeTo && state.resumeTo < (video.duration || 1e9) - 2) {
        video.currentTime = state.resumeTo;
        toast("已从上次位置续播 " + fmt(state.resumeTo));
      }
      state.resumeTo = 0;
      tick();
    });
    video.addEventListener("error", () => { if (state.file) $("#subCount").textContent = "这个文件浏览器无法直接解码：请先用「音视频工具」转成 MP4/MP3 再试。"; });

    $("#backBtn").addEventListener("click", () => { video.currentTime = Math.max(0, video.currentTime - 5); });
    $("#fwdBtn").addEventListener("click", () => { video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 5); });

    const seek = $("#seek");
    seek.addEventListener("input", () => { seekDrag = true; const d = video.duration; if (isFinite(d)) $("#tCur").textContent = fmt((seek.value / 1000) * d); });
    seek.addEventListener("change", () => { const d = video.duration; if (isFinite(d)) video.currentTime = (seek.value / 1000) * d; seekDrag = false; });
    seek.addEventListener("pointerup", () => { seekDrag = false; });

    $("#vol").addEventListener("input", (e) => { video.volume = e.target.value / 100; });
    $("#rate").addEventListener("change", (e) => { video.playbackRate = parseFloat(e.target.value) || 1; });
    $("#loop").addEventListener("change", (e) => { video.loop = e.target.checked; });
    $("#fullBtn").addEventListener("click", () => { const el = stage; if (document.fullscreenElement) document.exitFullscreen(); else (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); });
    $("#fitBtn").addEventListener("click", () => {
      if (state.float) { stage.style.width = "480px"; stage.style.height = "270px"; applyStyle(); }
      else { video.style.objectFit = video.style.objectFit === "fill" ? "contain" : "fill"; }
    });

    // 字幕
    $("#srtInput").addEventListener("change", (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      const r = new FileReader();
      r.onload = () => loadSubtitleText(String(r.result || ""), f.name);
      r.readAsText(f, "utf-8");
    });
    $("#demoSub").addEventListener("click", () => {
      const demo = `1\n00:00:00,500 --> 00:00:03,000\n示例字幕：这是一行中文字幕\nThis is an example subtitle line\n\n2\n00:00:03,200 --> 00:00:06,500\n第二行：可以显示两行\nSecond line here\n\n3\n00:00:06,800 --> 00:00:10,000\n换行与行数上限都可以调\nAdjustable position and line count\n`;
      loadSubtitleText(demo, "示例.srt");
      $("#subCount").textContent = "已加载示例字幕（3 条）· 可点「加载字幕」换成自己的 SRT";
    });
    $("#preset").addEventListener("change", (e) => {
      state.preset = e.target.value;
      const custom = state.preset === "custom";
      $("#customRow").style.display = custom ? "" : "none";
      $("#customRow2").style.display = custom ? "" : "none";
      applyStyle();
    });
    ["#pos", "#maxLines", "#wrapChars"].forEach((s) => $(s).addEventListener("change", () => { applyStyle(); if (state.activeIdx >= 0) paintSubs(state.cues[state.activeIdx].text); else paintSubs(""); }));
    ["#fs", "#cColor", "#cStroke", "#cBg", "#cStrokeW", "#cBgOp", "#posPct"].forEach((s) => {
      $(s).addEventListener("input", () => {
        state.fsPct = parseFloat($("#fs").value) || 4.2;
        state.custom = {
          color: $("#cColor").value, stroke: $("#cStroke").value, bg: $("#cBg").value,
          strokeW: parseFloat($("#cStrokeW").value) || 0, bgOp: parseInt($("#cBgOp").value, 10) || 0,
          posPct: parseInt($("#posPct").value, 10) || 74
        };
        $("#fsVal").textContent = state.fsPct.toFixed(1) + "%";
        $("#swVal").textContent = state.custom.strokeW;
        $("#bgOpVal").textContent = state.custom.bgOp + "%";
        $("#posVal").textContent = state.custom.posPct + "%";
        if (state.preset === "custom") applyStyle();
      });
    });
    $("#subsOn").addEventListener("change", (e) => {
      state.subsOn = e.target.checked;
      if (state.activeIdx >= 0) paintSubs(state.cues[state.activeIdx].text) ; else paintSubs("");
    });
    const bump = (d) => { state.delay = Math.round((state.delay + d) * 10) / 10; $("#delay").value = state.delay; state.activeIdx = -1; };
    $("#dlMinus").addEventListener("click", () => bump(-0.5));
    $("#dlPlus").addEventListener("click", () => bump(0.5));
    $("#dlReset").addEventListener("click", () => { state.delay = 0; $("#delay").value = 0; state.activeIdx = -1; });
    $("#delay").addEventListener("input", (e) => { state.delay = parseFloat(e.target.value) || 0; state.activeIdx = -1; });

    // 浮窗 / 画中画
    $("#pipBtn").addEventListener("click", () => {
      if (state.pipWin) { try { state.pipWin.close(); } catch (e) {} return; }
      if (pipSupported()) togglePip();
      else (state.float ? unfloat() : makeFloat());
    });
    $("#nativePipBtn").addEventListener("click", async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (video.requestPictureInPicture) await video.requestPictureInPicture();
      } catch (e) { alert("系统画中画不可用（该浏览器或该文件不支持）。可改用「浮窗播放」。"); }
    });
    wireFloat();

    // 快捷键
    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;
      if (!state.file) return;
      if (e.code === "Space") { e.preventDefault(); $("#playBtn").click(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
      else if (e.key === "ArrowRight") { e.preventDefault(); video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 5); }
      else if (e.key === "ArrowUp") { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.05); $("#vol").value = String(Math.round(video.volume * 100)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); $("#vol").value = String(Math.round(video.volume * 100)); }
      else if (e.key === "v" || e.key === "V") { $("#subsOn").checked = !$("#subsOn").checked; $("#subsOn").dispatchEvent(new Event("change")); }
      else if (e.key === "f" || e.key === "F") { $("#pipBtn").click(); }
      else if (e.key === "Escape") {
        if (document.fullscreenElement) { document.exitFullscreen(); }
        else if (state.pipWin) { try { state.pipWin.close(); } catch (err) {} }
        else if (state.float) unfloat();
      }
    });

    window.addEventListener("resize", applyStyle);
    window.addEventListener("beforeunload", () => {
      if (state.file && video.currentTime > 3 && window.TBX_recent) TBX_recent.savePos(TBX_recent.posKey(state.file.name, state.file.size), video.currentTime);
    });

    /* 播放列表 / 最近打开 */
    if (window.TBX_recent) {
      if ($("#plAdd")) $("#plAdd").addEventListener("click", async () => {
        const picked = await TBX_recent.pick({ multiple: true, accept: "video/*,audio/*,.mp4,.mov,.mkv,.webm,.mp3,.m4a,.wav,.flac" });
        if (!picked.length) return;
        for (const p of picked) await TBX_recent.add("player", p.file, p.handle);
        await renderPlaylist();
        if (!state.file && picked[0]) loadMedia(picked[0].file, picked[0].handle);
        else toast("已加入播放列表（共 " + picked.length + " 个）");
      });
      if ($("#plPlayAll")) $("#plPlayAll").addEventListener("click", async () => {
        const items = await TBX_recent.list("player");
        if (!items.length) return toast("播放列表是空的");
        openEntry(items[0]);
      });
      if ($("#plClear")) $("#plClear").addEventListener("click", async () => {
        if (!confirm("清空播放列表？（不会删除你的文件）")) return;
        await TBX_recent.clear("player");
        renderPlaylist();
      });
      if ($("#recentClear")) $("#recentClear").addEventListener("click", async () => {
        if (!confirm("清空「最近打开」记录？")) return;
        await TBX_recent.clear("media-recent");
        renderRecent();
      });
      if ($("#plHint") && !TBX_recent.canReopen()) $("#plHint").innerHTML += '<br><span style="color:var(--muted)">当前浏览器不支持保存文件句柄，列表仍会记住文件名，但重新打开时需要再选一次文件（用 Edge / Chrome 可自动 reopen）。</span>';
      renderPlaylist();
      renderRecent();
    }

    applyStyle();
    setPlayLabel();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
