/* 录屏 / 截屏 / 摄像头 · 纯浏览器实现（getDisplayMedia + MediaRecorder） */
(function () {
  "use strict";
  const he = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));
  const SERVICE = "http://127.0.0.1:8765";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtBytes = (n) => (!isFinite(n) ? "-" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");
  const clock = (ms) => {
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  };
  function download(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 6000);
  }
  const stopStream = (s) => { if (s) s.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} }); };

  const state = {
    screenStream: null, region: null, pipStream: null, pipPos: "off",
    recorder: null, chunks: [], startedAt: 0, pausedMs: 0, pauseAt: 0, timerId: null,
    camStream: null, camRec: null, camChunks: [], camStartedAt: 0, camTimerId: null,
    recUrl: null, camUrl: null, shotBlob: null, shotSel: null,
    micStream: null,
    processedTrack: null, pipEl: null,
  };

  /* ============================ 公共：抓帧 ============================ */
  async function grabFrame(stream, type) {
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.srcObject = stream;
    await v.play().catch(() => {});
    await new Promise((res) => {
      if (v.videoWidth) return res();
      v.addEventListener("loadedmetadata", () => res(), { once: true });
      setTimeout(res, 2000);
    });
    await sleep(250);
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 1280; c.height = v.videoHeight || 720;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    try { v.pause(); } catch (e) {}
    return await new Promise((r) => c.toBlob(r, type || "image/png"));
  }

  /* ============================ 公共：把流处理成新视频轨（区域/画中画） ============================ */
  function pickMime() {
    const list = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
    return "";
  }
  function makeProcessedTrack(srcTrack, drawFn, w, h, fps) {
    const MP = window.MediaStreamTrackProcessor;
    const Gen = window.VideoTrackGenerator || window.MediaStreamTrackGenerator;
    if (MP && Gen && window.VideoFrame) {
      state.fallbackCanvas = false;
      const useGen = !!window.VideoTrackGenerator;
      const canvas = window.OffscreenCanvas ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
      const ctx = canvas.getContext("2d");
      const processor = new MP({ track: srcTrack });
      const gen = useGen ? new window.VideoTrackGenerator() : new window.MediaStreamTrackGenerator({ kind: "video" });
      (async () => {
        const reader = processor.readable.getReader();
        const writer = gen.writable.getWriter();
        try {
          for (;;) {
            const { done, value: frame } = await reader.read();
            if (done) break;
            try {
              drawFn(ctx, frame, w, h);
              const out = new VideoFrame(canvas, { timestamp: frame.timestamp });
              await writer.write(out);
              out.close();
            } finally { frame.close(); }
          }
        } catch (e) { /* 结束 */ }
        try { writer.close(); } catch (e) {}
      })();
      return useGen ? gen.track : gen;
    }
    // 退化方案：canvas + rAF（最小化窗口时可能掉帧）
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([srcTrack]);
    v.play().catch(() => {});
    // === Fix 1: rAF fallback loop 停止机制 ===
    let stopped = false;
    let rafId = null;
    const loop = () => {
      if (stopped) return;
      if (v.readyState >= 2) { try { drawFn(ctx, v, w, h); } catch (e) {} }
      rafId = requestAnimationFrame(loop);
    };
    loop();
    state.fallbackCanvas = true;
    const track = canvas.captureStream(fps || 30).getVideoTracks()[0];
    track._stopFallback = () => {
      stopped = true;
      if (rafId) { try { cancelAnimationFrame(rafId); } catch (e) {} }
      try { v.pause(); v.srcObject = null; } catch (e) {}
    };
    return track;
  }

  /* ============================ 1) 屏幕录制 ============================ */
  const recErr = (m) => ($("#recErr").textContent = m || "");

  async function pickScreen() {
    recErr("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: +$("#recFps").value } },
        audio: $("#useSys").checked ? true : false,
      });
      stopStream(state.screenStream);
      state.screenStream = stream;
      state.region = null;
      const v = $("#screenVideo");
      v.srcObject = stream;
      $("#screenWrap").style.display = "block";
      $("#clearScreen").style.display = "inline-flex";
      $("#startRec").disabled = false;
      const setInfo = () => { $("#regInfo").textContent = `源画面 ${v.videoWidth}×${v.videoHeight}`; drawRegion(); };
      if (v.videoWidth) setInfo(); else v.addEventListener("loadedmetadata", setInfo, { once: true });
      stream.getVideoTracks()[0].addEventListener("ended", clearScreen);
      if ($("#useSys").checked && !stream.getAudioTracks().length) recErr("提示：本次未共享系统声音（弹窗里需勾选「分享音频」）");
    } catch (e) {
      if (e && e.name !== "NotAllowedError" && e.name !== "AbortError") recErr("无法获取屏幕：" + e.message);
    }
  }
  function clearScreen() {
    // === Fix 3: 屏幕共享结束时也停止录制 ===
    if (state.recorder && state.recorder.state !== "inactive") {
      try { state.recorder.stop(); } catch (e) {}
    }
    stopStream(state.screenStream);
    state.screenStream = null; state.region = null;
    $("#screenVideo").srcObject = null;
    $("#screenWrap").style.display = "none";
    $("#clearScreen").style.display = "none";
    $("#startRec").disabled = true;
    $("#regSel").style.display = "none";
  }

  function toVideoXY(clientX, clientY) {
    const v = $("#screenVideo"), r = v.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(v.videoWidth, (clientX - r.left) * (v.videoWidth / Math.max(1, r.width)))),
      y: Math.max(0, Math.min(v.videoHeight, (clientY - r.top) * (v.videoHeight / Math.max(1, r.height)))),
    };
  }
  function clampRegion() {
    const v = $("#screenVideo"), R = state.region;
    if (!R) return;
    R.w = Math.max(0, Math.min(R.w, v.videoWidth));
    R.h = Math.max(0, Math.min(R.h, v.videoHeight));
    R.x = Math.max(0, Math.min(R.x, v.videoWidth - R.w));
    R.y = Math.max(0, Math.min(R.y, v.videoHeight - R.h));
  }
  function drawRegion() {
    const v = $("#screenVideo"), sel = $("#regSel");
    if (!state.region || !v.videoWidth) { sel.style.display = "none"; if (!state.region) $("#regInfo").textContent = state.screenStream ? "未框选：将录制整个画面" : ""; return; }
    const r = v.getBoundingClientRect();
    const kx = r.width / v.videoWidth, ky = r.height / v.videoHeight;
    sel.style.display = "block";
    sel.style.left = state.region.x * kx + "px";
    sel.style.top = state.region.y * ky + "px";
    sel.style.width = state.region.w * kx + "px";
    sel.style.height = state.region.h * ky + "px";
    $("#regInfo").textContent = `录制区域 ${Math.round(state.region.w)}×${Math.round(state.region.h)}（起点 ${Math.round(state.region.x)},${Math.round(state.region.y)}）`;
  }
  function initRegionSel() {
    const box = $("#screenBox"), sel = $("#regSel"), v = $("#screenVideo");
    let mode = null, anchor = null, moveOff = null;
    box.addEventListener("pointerdown", (e) => {
      if (!state.screenStream || !v.videoWidth) return;
      const r = v.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const p = toVideoXY(e.clientX, e.clientY);
      if (e.target === sel && state.region) { mode = "move"; moveOff = { x: p.x - state.region.x, y: p.y - state.region.y }; }
      else { mode = "new"; anchor = p; state.region = { x: p.x, y: p.y, w: 0, h: 0 }; }
      try { box.setPointerCapture(e.pointerId); } catch (err2) {}
      e.preventDefault();
    });
    box.addEventListener("pointermove", (e) => {
      if (!mode) return;
      const p = toVideoXY(e.clientX, e.clientY);
      if (mode === "new") {
        const x = Math.min(anchor.x, p.x), y = Math.min(anchor.y, p.y);
        state.region = { x, y, w: Math.abs(p.x - anchor.x), h: Math.abs(p.y - anchor.y) };
      } else { state.region.x = p.x - moveOff.x; state.region.y = p.y - moveOff.y; }
      clampRegion(); drawRegion();
    });
    ["pointerup", "pointercancel"].forEach((ev) => box.addEventListener(ev, () => {
      if (mode === "new" && state.region && (state.region.w < 12 || state.region.h < 12)) state.region = null;
      mode = null; drawRegion();
    }));
    window.addEventListener("resize", drawRegion);
  }

  async function ensurePip() {
    // === Fix 2: 关闭 PiP 时清理 pipEl 视频元素 ===
    if (state.pipPos === "off") {
      stopStream(state.pipStream); state.pipStream = null;
      if (state.pipEl) {
        try { state.pipEl.pause(); state.pipEl.srcObject = null; } catch (e) {}
        state.pipEl = null;
      }
      return;
    }
    if (state.pipStream) return;
    try {
      state.pipStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (e) { $("#pipPos").querySelector('[data-v="off"]').click(); recErr("无法打开摄像头：" + e.message); }
  }

  function buildDrawFn() {
    const R = state.region;
    const pip = state.pipStream;
    const pipEl = pip ? document.createElement("video") : null;
    // === Fix 2: 将 pipEl 存入 state 以便后续清理 ===
    if (pipEl) {
      state.pipEl = pipEl;
      pipEl.muted = true; pipEl.playsInline = true; pipEl.srcObject = pip; pipEl.play().catch(() => {});
    }
    const pos = state.pipPos;
    return (ctx, src, w, h) => {
      if (R) ctx.drawImage(src, R.x, R.y, R.w, R.h, 0, 0, w, h);
      else ctx.drawImage(src, 0, 0, w, h);
      if (pipEl && pipEl.readyState >= 2) {
        const pw = Math.round(w * 0.22), ph = Math.round((pipEl.videoHeight / Math.max(1, pipEl.videoWidth)) * pw);
        const m = Math.round(w * 0.02);
        const x = pos === "bl" || pos === "tl" ? m : w - pw - m;
        const y = pos === "tl" || pos === "tr" ? m : h - ph - m;
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, pw, ph, 12); else ctx.rect(x, y, pw, ph);
        ctx.clip();
        ctx.drawImage(pipEl, x, y, pw, ph);
        ctx.restore();
      }
    };
  }

  async function startRec() {
    recErr("");
    if (!state.screenStream) return recErr("请先选择录制源");
    const fps = +$("#recFps").value;
    const vTrack = state.screenStream.getVideoTracks()[0];
    if (!vTrack) return recErr("未获取到视频轨");
    await ensurePip();
    const needProcess = !!state.region || state.pipPos !== "off";
    const tracks = [];
    if (needProcess) {
      const v = $("#screenVideo");
      const w = state.region ? Math.round(state.region.w) : v.videoWidth;
      const h = state.region ? Math.round(state.region.h) : v.videoHeight;
      const t = makeProcessedTrack(vTrack, buildDrawFn(), w, h, fps);
      // === Fix 1: 保存处理后的轨以便录制结束时清理 rAF 循环 ===
      state.processedTrack = t;
      if (state.fallbackCanvas) recErr("提示：当前浏览器不支持高效区域录制，请勿最小化窗口，否则可能掉帧。");
      tracks.push(t);
    } else {
      state.processedTrack = null;
      tracks.push(vTrack);
    }
    if ($("#useSys").checked) state.screenStream.getAudioTracks().forEach((t) => tracks.push(t));
    if ($("#useMic").checked) {
      try {
        state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.micStream.getAudioTracks().forEach((t) => tracks.push(t));
      } catch (e) { /* 用户拒绝麦克风则忽略 */ }
    }
    const stream = new MediaStream(tracks);
    const mime = pickMime();
    state.chunks = [];
    try {
      state.recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: Math.round(parseFloat($("#recQuality").value) * 1000000) } : undefined);
    } catch (e) { return recErr("无法创建录制器：" + e.message); }
    state.recorder.ondataavailable = (e) => { if (e.data && e.data.size) state.chunks.push(e.data); };
    state.recorder.onstop = () => finishRec();
    state.recorder.start(1000);
    state.startedAt = Date.now(); state.pausedMs = 0;
    state.timerId = setInterval(updateTimer, 250);
    $("#startRec").style.display = "none";
    $("#pauseRec").style.display = "inline-flex"; $("#pauseRec").textContent = "暂停";
    $("#stopRec").style.display = "inline-flex";
    $("#recTimer").style.display = "block";
    $("#recResult").innerHTML = "";
  }
  function updateTimer() {
    const ms = Date.now() - state.startedAt - state.pausedMs;
    $("#recTimer").textContent = clock(ms);
  }
  function togglePause() {
    const r = state.recorder; if (!r) return;
    if (r.state === "recording") { r.pause(); state.pauseAt = Date.now(); $("#pauseRec").textContent = "继续"; }
    else if (r.state === "paused") { r.resume(); state.pausedMs += Date.now() - state.pauseAt; $("#pauseRec").textContent = "暂停"; }
  }
  function stopRec() { try { state.recorder && state.recorder.stop(); } catch (e) {} }
  function finishRec() {
    clearInterval(state.timerId);
    // === Fix 1: 停止 rAF fallback 循环 ===
    if (state.processedTrack && state.processedTrack._stopFallback) {
      state.processedTrack._stopFallback();
    }
    state.processedTrack = null;
    // === Fix 2: 清理 PiP 视频元素 ===
    if (state.pipEl) {
      try { state.pipEl.pause(); state.pipEl.srcObject = null; } catch (e) {}
      state.pipEl = null;
    }
    $("#startRec").style.display = "inline-flex";
    $("#pauseRec").style.display = "none"; $("#stopRec").style.display = "none";
    const type = (state.recorder && state.recorder.mimeType) || "video/webm";
    const blob = new Blob(state.chunks, { type });
    stopStream(state.micStream); state.micStream = null;
    if (!blob.size) { recErr("没有录到内容"); return; }
    const ext = type.indexOf("mp4") >= 0 ? "mp4" : "webm";
    renderResult($("#recResult"), blob, `录屏_${stamp()}.${ext}`, true);
  }
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

  /* ============================ 结果渲染（含转 MP4） ============================ */
  function renderResult(box, blob, name, isVideo) {
    if (isVideo && state.recUrl) { try { URL.revokeObjectURL(state.recUrl); } catch (e) {} }
    const url = URL.createObjectURL(blob);
    if (isVideo) state.recUrl = url;
    box.innerHTML = "";
    const d = document.createElement("div");
    d.className = "result";
    d.style.display = "block";
    d.innerHTML = `
      <div style="font-size:13px;font-weight:650;margin-bottom:8px">${name} · ${fmtBytes(blob.size)}</div>
      ${isVideo ? `<video src="${url}" controls style="width:100%;max-height:300px;border-radius:10px;background:#000"></video>` : `<img src="${url}" style="width:100%;border-radius:10px;border:1px solid var(--line)">`}
      <div class="btn-row" style="margin-top:10px">
        <button class="btn primary dl">下载</button>
        <button class="btn ghost mp4">转成 MP4（本机服务）</button>
        <button class="btn ghost rec">再录一段</button>
      </div>
      <div class="hint mp4msg" style="margin-top:8px"></div>`;
    d.querySelector(".dl").onclick = () => download(blob, name);
    d.querySelector(".rec").onclick = () => { if ($("#camStart")) { $("#camStart").style.display = "inline-flex"; $("#camSnap").disabled = !state.camStream; } $("#startRec").style.display = "inline-flex"; box.innerHTML = ""; };
    d.querySelector(".mp4").onclick = async (e) => {
      const msg = d.querySelector(".mp4msg");
      e.target.disabled = true; msg.textContent = "正在调用本机 ffmpeg 转换…";
      try {
        const r = await fetch(`${SERVICE}/av/run?op=convert&format=mp4`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(name) }, body: blob });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "提交失败");
        let st = { status: "running", pct: 0 };
        while (st.status === "running") { await sleep(400); st = await (await fetch(`${SERVICE}/av/status?id=${j.id}`, { cache: "no-store" })).json(); msg.textContent = `转换中… ${st.pct || 0}%`; }
        if (st.status !== "done") throw new Error(st.err || "转换失败");
        const out = await (await fetch(`${SERVICE}/av/result?id=${j.id}`)).blob();
        msg.textContent = `✅ 转换完成（${fmtBytes(out.size)}）`;
        const b = document.createElement("button");
        b.className = "btn"; b.textContent = "下载 MP4";
        b.onclick = () => download(out, name.replace(/\.\w+$/, "") + ".mp4");
        d.querySelector(".btn-row").appendChild(b);
      } catch (err) { msg.textContent = "转换失败：" + err.message + "（请确认 server/start.bat 已启动）"; }
      finally { e.target.disabled = false; }
    };
    box.appendChild(d);
  }

  /* ============================ 2) 截屏 ============================ */
  const shotStatus = (m) => ($("#shotStatus").textContent = m || "");
  async function shotFromScreen() {
    shotStatus("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 1 } }, audio: false });
      const delay = Math.max(0, Math.min(60, +$("#shotDelay").value || 0));
      // === Fix 6: 倒计时期间检查流是否仍然活跃，用户取消则停止 ===
      if (delay) {
        for (let i = delay; i > 0; i--) {
          shotStatus(`${i} 秒后截图，请切换到目标窗口…`);
          await sleep(1000);
          const vTracks = stream.getVideoTracks();
          if (!vTracks.length || vTracks[0].readyState === "ended") {
            stopStream(stream);
            shotStatus("");
            return;
          }
        }
      }
      shotStatus("正在截图…");
      const blob = await grabFrame(stream, "image/png");
      stopStream(stream);
      setShot(blob);
      shotStatus("✅ 已截图");
    } catch (e) {
      if (e && e.name !== "NotAllowedError" && e.name !== "AbortError") shotStatus("截图失败：" + e.message);
      else shotStatus("");
    }
  }
  async function shotFromCam() {
    shotStatus("");
    try {
      const stream = state.camStream || (await navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
      const blob = await grabFrame(stream, "image/png");
      if (!state.camStream) stopStream(stream);
      setShot(blob);
      shotStatus("✅ 已从摄像头拍照");
    } catch (e) { shotStatus("拍照失败：" + e.message); }
  }
  function setShot(blob) {
    if (state.shotBlob) state.shotBlob = null;
    state.shotBlob = blob;
    state.shotSel = null;
    const img = $("#shotImg");
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    $("#shotEmpty").style.display = "none";
    $("#shotBox").style.display = "block";
    $("#shotSel").style.display = "none";
    $("#shotSaveCrop").disabled = true;
    $("#shotSelInfo").textContent = "在图上拖拽可框选区域";
  }
  function toImgXY(clientX, clientY) {
    const img = $("#shotImg"), r = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(img.naturalWidth, (clientX - r.left) * (img.naturalWidth / Math.max(1, r.width)))),
      y: Math.max(0, Math.min(img.naturalHeight, (clientY - r.top) * (img.naturalHeight / Math.max(1, r.height)))),
    };
  }
  function drawShotSel() {
    const img = $("#shotImg"), sel = $("#shotSel");
    if (!state.shotSel || !img.naturalWidth) { sel.style.display = "none"; return; }
    const r = img.getBoundingClientRect();
    const kx = r.width / img.naturalWidth, ky = r.height / img.naturalHeight;
    sel.style.display = "block";
    sel.style.left = state.shotSel.x * kx + "px";
    sel.style.top = state.shotSel.y * ky + "px";
    sel.style.width = state.shotSel.w * kx + "px";
    sel.style.height = state.shotSel.h * ky + "px";
    $("#shotSelInfo").textContent = `已选 ${Math.round(state.shotSel.w)}×${Math.round(state.shotSel.h)} 像素`;
  }
  function initShotSel() {
    const wrap = $("#shotWrap"), sel = $("#shotSel"), img = $("#shotImg");
    let mode = null, anchor = null, moveOff = null;
    wrap.addEventListener("pointerdown", (e) => {
      if (!state.shotBlob || !img.naturalWidth) return;
      const r = img.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const p = toImgXY(e.clientX, e.clientY);
      if (e.target === sel && state.shotSel) { mode = "move"; moveOff = { x: p.x - state.shotSel.x, y: p.y - state.shotSel.y }; }
      else { mode = "new"; anchor = p; state.shotSel = { x: p.x, y: p.y, w: 0, h: 0 }; }
      try { wrap.setPointerCapture(e.pointerId); } catch (err2) {}
      e.preventDefault();
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!mode) return;
      const p = toImgXY(e.clientX, e.clientY);
      if (mode === "new") {
        const x = Math.min(anchor.x, p.x), y = Math.min(anchor.y, p.y);
        state.shotSel = { x, y, w: Math.abs(p.x - anchor.x), h: Math.abs(p.y - anchor.y) };
      } else {
        state.shotSel.x = Math.max(0, Math.min(p.x - moveOff.x, img.naturalWidth - state.shotSel.w));
        state.shotSel.y = Math.max(0, Math.min(p.y - moveOff.y, img.naturalHeight - state.shotSel.h));
      }
      drawShotSel();
    });
    ["pointerup", "pointercancel"].forEach((ev) => wrap.addEventListener(ev, () => {
      if (mode === "new" && state.shotSel && (state.shotSel.w < 8 || state.shotSel.h < 8)) state.shotSel = null;
      mode = null;
      drawShotSel();
      $("#shotSaveCrop").disabled = !state.shotSel;
    }));
    window.addEventListener("resize", drawShotSel);
  }
  async function saveCrop() {
    if (!state.shotBlob || !state.shotSel) return;
    const img = new Image();
    img.src = URL.createObjectURL(state.shotBlob);
    await img.decode().catch(() => {});
    const s = state.shotSel;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(s.w)); c.height = Math.max(1, Math.round(s.h));
    c.getContext("2d").drawImage(img, Math.round(s.x), Math.round(s.y), c.width, c.height, 0, 0, c.width, c.height);
    URL.revokeObjectURL(img.src);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    download(blob, `截图_${stamp()}_${c.width}x${c.height}.png`);
  }

  /* ============================ 3) 摄像头 ============================ */
  const camErr = (m) => ($("#camErr").textContent = m || "");
  async function camOpen() {
    camErr("");
    const [w, h] = $("#camRes").value.split("x").map(Number);
    const dev = $("#camDevice").value;
    try {
      stopStream(state.camStream);
      state.camStream = await navigator.mediaDevices.getUserMedia({
        video: Object.assign({ width: { ideal: w }, height: { ideal: h } }, dev ? { deviceId: { exact: dev } } : {}),
        audio: true,
      });
      $("#camVideo").srcObject = state.camStream;
      $("#camVideo").style.display = "block";
      $("#camOpen").textContent = "重新打开";
      $("#camClose").style.display = "inline-flex";
      $("#camStart").disabled = false; $("#camSnap").disabled = false;
      await listCams();
    } catch (e) { camErr("无法打开摄像头：" + e.message); }
  }
  async function listCams() {
    try {
      const ds = await navigator.mediaDevices.enumerateDevices();
      const cams = ds.filter((d) => d.kind === "videoinput");
      const sel = $("#camDevice");
      const cur = sel.value;
      sel.innerHTML = cams.map((c, i) => `<option value="${he(c.deviceId)}">${he(c.label || "摄像头 " + (i + 1))}</option>`).join("");
      if (cur) sel.value = cur;
      if (state.camStream) {
        const id = state.camStream.getVideoTracks()[0].getSettings().deviceId;
        if (id) sel.value = id;
      }
    } catch (e) {}
  }
  function camClose() {
    // 停止摄像头录制（如果正在录制）
    if (state.camRec && state.camRec.state !== "inactive") {
      try { state.camRec.stop(); } catch (e) {}
    }
    state.camRec = null;
    stopStream(state.camStream); state.camStream = null;
    $("#camVideo").srcObject = null; $("#camVideo").style.display = "none";
    $("#camClose").style.display = "none"; $("#camOpen").textContent = "打开摄像头";
    $("#camStart").disabled = true; $("#camSnap").disabled = true;
  }
  function camStartRec() {
    // === Fix 5: 防止重复点击创建多个 MediaRecorder ===
    if (state.camRec && state.camRec.state === "recording") return;
    if (!state.camStream) return camErr("请先打开摄像头");
    const mime = pickMime();
    state.camChunks = [];
    try { state.camRec = new MediaRecorder(state.camStream, mime ? { mimeType: mime } : undefined); }
    catch (e) { return camErr("无法创建录制器：" + e.message); }
    state.camRec.ondataavailable = (e) => { if (e.data && e.data.size) state.camChunks.push(e.data); };
    state.camRec.onstop = () => {
      clearInterval(state.camTimerId);
      const type = state.camRec.mimeType || "video/webm";
      const blob = new Blob(state.camChunks, { type });
      const ext = type.indexOf("mp4") >= 0 ? "mp4" : "webm";
      if (blob.size) renderResult($("#camResult"), blob, `摄像头_${stamp()}.${ext}`, true);
      $("#camStart").style.display = "inline-flex"; $("#camStop").style.display = "none";
      $("#camTimer").style.display = "none";
    };
    state.camRec.start(1000);
    state.camStartedAt = Date.now();
    state.camTimerId = setInterval(() => ($("#camTimer").textContent = clock(Date.now() - state.camStartedAt)), 250);
    $("#camStart").style.display = "none"; $("#camStop").style.display = "inline-flex";
    $("#camTimer").style.display = "block";
    $("#camResult").innerHTML = ""; camErr("");
  }
  async function camSnap() {
    if (!state.camStream) return;
    const blob = await grabFrame(state.camStream, "image/png");
    renderResult($("#camResult"), blob, `拍照_${stamp()}.png`, false);
  }

  /* ============================ 初始化 ============================ */
  function seg(sel, after) {
    const root = $(sel);
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", root).forEach((x) => x.classList.toggle("active", x === b));
      if (after) after(b.dataset.v);
    });
  }
  function init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      document.querySelectorAll(".btn").forEach((b) => { if (/屏幕|录制|截屏/.test(b.textContent)) b.disabled = true; });
      alert("当前浏览器不支持屏幕捕获，请使用 Chrome / Edge 并通过 http://127.0.0.1:8777 打开本页。");
    }
    // === Fix 4: 切换标签页时释放资源 ===
    $$("#cTabs .tab").forEach((b) => (b.onclick = () => {
      const targetTab = b.dataset.tab;
      const activeTab = document.querySelector("#cTabs .tab.active");
      const currentTab = activeTab ? activeTab.dataset.tab : null;
      if (currentTab && currentTab !== targetTab) {
        // 查找当前激活的面板
        const currentPanel = document.querySelector(`.c-panel[data-tab="${currentTab}"]`);
        if (currentPanel) {
          // 从录屏标签切走：停止屏幕共享和录制
          if (currentPanel.querySelector("#screenVideo")) {
            if (state.recorder && state.recorder.state !== "inactive") {
              try { state.recorder.stop(); } catch (e) {}
            }
            if (state.screenStream) clearScreen();
            // 清理 PiP
            if (state.pipEl) {
              try { state.pipEl.pause(); state.pipEl.srcObject = null; } catch (e) {}
              state.pipEl = null;
            }
            stopStream(state.pipStream); state.pipStream = null;
          }
          // 从摄像头标签切走：停止摄像头
          if (currentPanel.querySelector("#camVideo")) {
            camClose();
          }
        }
      }
      $$("#cTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".c-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
    }));
    $("#pickScreen").onclick = pickScreen;
    $("#clearScreen").onclick = clearScreen;
    $("#regReset").onclick = () => { state.region = null; drawRegion(); };
    $("#startRec").onclick = startRec;
    $("#pauseRec").onclick = togglePause;
    $("#stopRec").onclick = stopRec;
    seg("#pipPos", async (v) => { state.pipPos = v; await ensurePip(); drawRegion(); });
    initRegionSel();

    $("#shotScreen").onclick = shotFromScreen;
    $("#shotCam").onclick = shotFromCam;
    $("#shotSaveFull").onclick = () => state.shotBlob && download(state.shotBlob, `截图_${stamp()}.png`);
    $("#shotSaveCrop").onclick = saveCrop;
    $("#shotSelClear").onclick = () => { state.shotSel = null; drawShotSel(); $("#shotSaveCrop").disabled = true; $("#shotSelInfo").textContent = "在图上拖拽可框选区域"; };
    initShotSel();

    $("#camOpen").onclick = camOpen;
    $("#camClose").onclick = camClose;
    $("#camStart").onclick = camStartRec;
    $("#camStop").onclick = () => { try { state.camRec && state.camRec.stop(); } catch (e) {} };
    $("#camSnap").onclick = camSnap;
    $("#camDevice").onchange = () => camOpen();
    navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener("devicechange", listCams);

    window.addEventListener("beforeunload", () => { stopStream(state.screenStream); stopStream(state.camStream); stopStream(state.pipStream); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
