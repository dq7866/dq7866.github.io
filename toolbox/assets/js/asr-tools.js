/* 语音转文字 · 依赖本机服务（faster-whisper） */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));
  const SERVICE = "http://127.0.0.1:8765";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtBytes = (n) => (!isFinite(n) ? "-" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(2) + " MB");
  const clock = (s) => { s = Math.max(0, s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); const p = (n) => String(n).padStart(2, "0"); return (h ? h + ":" + p(m) : m) + ":" + p(x); };
  const err = (m) => ($("#err").textContent = m || "");
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const state = { file: null, info: null, jobId: null, result: null, models: [], playerUrl: null, mode: "asr", cancelled: false };
  const svc = { ok: false, python: "" };

  /* ---------------- 服务与模型 ---------------- */
  async function checkService() {
    const el = $("#svcStatus");
    try {
      const j = await (await fetch(SERVICE + "/health", { cache: "no-store" })).json();
      svc.ok = !!j.ok; svc.python = j.python || "";
      el.innerHTML = svc.ok
        ? `<b style="color:var(--ok)">✅ 已连接本机服务</b><div class="hint" style="margin-top:4px">Python: ${String(svc.python).replace(/</g, "&lt;")}</div>`
        : "";
    } catch (e) {
      svc.ok = false;
      el.innerHTML = '<b style="color:var(--danger)">❌ 未检测到本机服务</b>。请双击运行 <code>toolbox/server/start.bat</code> 后刷新本页。';
    }
    if (svc.ok) await loadModels();
    updateRun();
  }
  async function loadModels() {
    try {
      const j = await (await fetch(SERVICE + "/asr/models", { cache: "no-store" })).json();
      state.models = j.models || [];
      const sel = $("#model");
      const cur = sel.value;
      sel.innerHTML = state.models.map((m) => `<option value="${esc(m.key)}">${esc(m.label)}${m.ready ? " · ✅已就绪" : " · 未下载(" + m.mb + "MB)"}</option>`).join("");
      if (cur) sel.value = cur;
      showModelMsg();
    } catch (e) { err("读取模型列表失败：" + e.message); }
  }
  function showModelMsg() {
    const m = state.models.find((x) => x.key === $("#model").value);
    $("#modelMsg").textContent = !m ? "" : m.ready ? "✅ 该模型已就绪" : `需要下载约 ${m.mb} MB`;
    $("#pullBtn").style.display = m && !m.ready ? "inline-flex" : "none";
  }

  /* ---------------- 文件 ---------------- */
  async function loadFile(file) {
    if (!file) return;
    state.file = file; state.info = null; state.result = null;
    $("#fileName").textContent = `${file.name} · ${fmtBytes(file.size)}`;
    $("#clearBtn").disabled = false;
    $("#fileInfo").innerHTML = '<div class="hint">正在读取媒体信息…</div>';
    $("#result").innerHTML = '<div class="empty">识别结果会显示在这里</div>';
    $("#asrStat").textContent = "";
    renderPlayer(file);
    if (svc.ok) {
      try {
        const j = await (await fetch(SERVICE + "/av/info", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file })).json();
        if (j.ok) {
          state.info = j;
          const rows = [["时长", clock(j.duration)], ["大小", fmtBytes(j.size)]];
          if (j.video) rows.push(["视频", `${j.video.codec.toUpperCase()} · ${j.video.width}×${j.video.height}`]);
          if (j.audio) rows.push(["音频", `${j.audio.codec.toUpperCase()} · ${j.audio.channels || "?"} 声道`]);
          $("#fileInfo").innerHTML = `<div class="result" style="display:block">${rows.map((r) => `<div class="kv"><span class="k">${r[0]}</span><span class="v">${r[1]}</span></div>`).join("")}</div>`;
        }
      } catch (e) { $("#fileInfo").innerHTML = `<div class="err">读取信息失败：${esc(e.message)}</div>`; }
    } else $("#fileInfo").innerHTML = "";
    updateRun();
  }
  function renderPlayer(file) {
    if (state.playerUrl) { try { URL.revokeObjectURL(state.playerUrl); } catch (e) {} }
    state.playerUrl = URL.createObjectURL(file);
    const audioOnly = !(file.type || "").startsWith("video/") && /\.(mp3|m4a|wav|aac|flac|ogg)$/i.test(file.name);
    $("#playerWrap").innerHTML = audioOnly
      ? `<div style="padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)"><div style="font-size:30px;text-align:center;margin-bottom:8px">🎵</div><audio id="player" controls preload="metadata" src="${state.playerUrl}" style="width:100%"></audio></div>`
      : `<video id="player" controls preload="metadata" src="${state.playerUrl}" style="width:100%;max-height:300px;border-radius:12px;background:#000;display:block"></video>`;
  }
  function updateRun() {
    const ok = !!(state.file && svc.ok);
    $("#runBtn").disabled = !ok;
    $("#runBtn").textContent = state.mode === "align" ? "开始对齐" : "开始识别";
  }

  /* ---------------- 进度 ---------------- */
  function showProgress(pct, label, color) {
    $("#progressWrap").style.display = "block";
    $("#progBar").style.width = Math.max(0, Math.min(100, pct)) + "%";
    $("#progBar").style.background = color || "var(--accent)";
    $("#progLabel").textContent = label + (pct ? ` ${Math.round(pct)}%` : "");
    // 有正在运行的任务时显示取消按钮
    let btn = $("#cancelBtn");
    if (state.jobId && state.jobId.length) {
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "cancelBtn";
        btn.className = "btn ghost";
        btn.textContent = "取消";
        btn.style.cssText = "margin-left:8px;padding:2px 10px;font-size:12px";
        btn.onclick = cancelJob;
        $("#progressWrap").appendChild(btn);
      }
      btn.style.display = "";
    } else if (btn) {
      btn.style.display = "none";
    }
  }
  const hideProgress = () => {
    $("#progressWrap").style.display = "none";
    const btn = $("#cancelBtn");
    if (btn) btn.style.display = "none";
  };
  async function cancelJob() {
    if (!state.jobId) return;
    state.cancelled = true;
    try { await fetch(SERVICE + "/av/job?id=" + encodeURIComponent(state.jobId), { method: "DELETE" }); } catch (e) {}
  }

  /* ---------------- 下载模型 ---------------- */
  async function pullModel() {
    err("");
    const key = $("#model").value;
    if (!key) return;
    showProgress(0, "准备下载模型…");
    try {
      const j = await (await fetch(`${SERVICE}/asr/pull?model=${encodeURIComponent(key)}`, { method: "POST" })).json();
      if (!j.ok) throw new Error(j.error || "提交失败");
      let st = { status: "running", pct: 0 };
      while (st.status === "running") {
        await sleep(600);
        st = await (await fetch(`${SERVICE}/av/status?id=${j.id}`, { cache: "no-store" })).json();
        showProgress(st.pct || 0, (st.msg || "下载中") + "…");
      }
      if (st.status !== "done") throw new Error(st.err || "下载失败");
      showProgress(100, "模型下载完成", "var(--ok)");
      setTimeout(hideProgress, 2500);
      await loadModels();
    } catch (e) { err("模型下载失败：" + e.message); hideProgress(); }
  }

  /* ---------------- 识别 ---------------- */
  async function run() {
    err("");
    state.cancelled = false;
    if (!state.file) return err("请先选择文件。");
    if (!svc.ok) return err("本机服务不可用。");
    const qs = new URLSearchParams({
      model: $("#model").value,
      lang: $("#lang").value,
      enhance: $("#enhance").value,
      vad: $("#vad").checked ? "1" : "0",
      prompt: $("#prompt").value || "",
    });
    if ($("#bilingual") && $("#bilingual").checked) qs.set("mode", "bilingual");
    $("#runBtn").disabled = true;
    $("#runBtn").textContent = "识别中…";
    $("#result").innerHTML = '<div class="empty">识别中，请稍候…</div>';
    $("#asrStat").textContent = "";
    const t0 = Date.now();
    try {
      const j = await (await fetch(`${SERVICE}/asr?${qs}`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(state.file.name) }, body: state.file })).json();
      if (!j.ok) throw new Error(j.error || "提交失败");
      state.jobId = j.id;
      showProgress(0, "识别中");
      let st = { status: "running", pct: 0 };
      while (st.status === "running") {
        if (state.cancelled) {
          try { await fetch(SERVICE + "/av/job?id=" + encodeURIComponent(state.jobId), { method: "DELETE" }); } catch (e) {}
          throw new Error("已取消");
        }
        await sleep(500);
        st = await (await fetch(`${SERVICE}/av/status?id=${j.id}`, { cache: "no-store" })).json();
        showProgress(st.pct || 0, `${st.msg || "识别中"}（已用 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
      }
      if (st.status !== "done") throw new Error(st.err || "识别失败");
      showProgress(100, "获取结果…");
      const r = await (await fetch(`${SERVICE}/asr/result?id=${j.id}`, { cache: "no-store" })).json();
      if (!r.ok) throw new Error("获取结果失败");
      state.result = r;
      renderResult(r, Date.now() - t0);
      showProgress(100, "完成", "var(--ok)");
      setTimeout(hideProgress, 2500);
    } catch (e) {
      console.error(e);
      if (state.cancelled || e.message === "已取消") {
        err("已取消。");
        $("#result").innerHTML = '<div class="empty">已取消</div>';
      } else {
        err("识别出错：" + e.message);
        $("#result").innerHTML = '<div class="empty">识别失败</div>';
      }
      hideProgress();
    } finally {
      state.jobId = null;
      state.cancelled = false;
      updateRun();
    }
  }

  /* ---------------- 文本校正对齐 ---------------- */
  async function runAlign() {
    err("");
    state.cancelled = false;
    if (!state.file) return err("请先选择文件。");
    if (!svc.ok) return err("本机服务不可用。");
    const text = $("#refText").value.trim();
    if (!text) return err("请先粘贴或导入参考文本。");
    $("#runBtn").disabled = true;
    $("#runBtn").textContent = "对齐中…";
    $("#result").innerHTML = '<div class="empty">正在对齐，请稍候…</div>';
    $("#asrStat").textContent = "";
    const t0 = Date.now();
    try {
      const rj = await (await fetch(SERVICE + "/asr/ref", { method: "POST", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: text })).json();
      if (!rj.ok) throw new Error(rj.error || "参考文本提交失败");
      const qs = new URLSearchParams({ model: $("#model").value, lang: $("#lang").value, vad: $("#vad").checked ? "1" : "0", ref: rj.id });
      const j = await (await fetch(`${SERVICE}/asr/align?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(state.file.name) },
        body: state.file,
      })).json();
      if (!j.ok) throw new Error(j.error || "提交失败");
      state.jobId = j.id;
      showProgress(0, "对齐中");
      let st = { status: "running", pct: 0 };
      while (st.status === "running") {
        if (state.cancelled) {
          try { await fetch(SERVICE + "/av/job?id=" + encodeURIComponent(state.jobId), { method: "DELETE" }); } catch (e) {}
          throw new Error("已取消");
        }
        await sleep(500);
        st = await (await fetch(`${SERVICE}/av/status?id=${j.id}`, { cache: "no-store" })).json();
        showProgress(st.pct || 0, `对齐中（已用 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
      }
      if (st.status !== "done") throw new Error(st.err || "对齐失败");
      showProgress(100, "获取结果…");
      const r = await (await fetch(`${SERVICE}/asr/result?id=${j.id}`, { cache: "no-store" })).json();
      if (!r.ok) throw new Error("获取结果失败");
      state.result = r;
      renderResult(r, Date.now() - t0, "align");
      showProgress(100, "完成", "var(--ok)");
      setTimeout(hideProgress, 2500);
    } catch (e) {
      console.error(e);
      if (state.cancelled || e.message === "已取消") {
        err("已取消。");
        $("#result").innerHTML = '<div class="empty">已取消</div>';
      } else {
        err("对齐出错：" + e.message);
        $("#result").innerHTML = '<div class="empty">对齐失败</div>';
      }
      hideProgress();
    } finally {
      state.jobId = null;
      state.cancelled = false;
      updateRun();
    }
  }
  function stripSubtitle(s) {
    return s.split(/\r?\n/).filter((l) => !/^\s*\d+\s*$/.test(l) && !/-->/.test(l) && !/^WEBVTT/i.test(l)).join("\n");
  }

  function srtTime(t) {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.round((t - Math.floor(t)) * 1000);
    const p = (n, l) => String(n).padStart(l, "0");
    return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)},${p(ms, 3)}`;
  }
  const vttTime = (t) => srtTime(t).replace(",", ".");
  function download(text, name, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: (type || "text/plain") + ";charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function renderResult(r, elapsedMs, mode) {
    const segs = r.segments || [];
    const base = (state.file ? state.file.name.replace(/\.[^.]+$/, "") : "transcript");
    const ratio = typeof r.match_ratio === "number" ? r.match_ratio : null;
    $("#asrStat").textContent = mode === "align"
      ? `${segs.length} 段 · 匹配率 ${ratio == null ? "-" : Math.round(ratio * 100) + "%"} · 音频 ${clock(r.duration)} · 用时 ${(elapsedMs / 1000).toFixed(0)}s`
      : `${segs.length} 段${r.mode === "bilingual" ? " · 中英双语" : ""} · 语言 ${r.language || "?"} · 音频 ${clock(r.duration)} · 用时 ${(elapsedMs / 1000).toFixed(0)}s`;
    const srt = segs.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join("\n");
    const vtt = "WEBVTT\n\n" + segs.map((s) => `${vttTime(s.start)} --> ${vttTime(s.end)}\n${s.text}\n`).join("\n");
    const $r = $("#result");
    $r.innerHTML = `
      <div class="btn-row">
        <button class="btn primary" id="cpText">复制全文</button>
        <button class="btn" id="dlTxt">下载 TXT</button>
        <button class="btn" id="dlSrt">下载 SRT 字幕</button>
        <button class="btn" id="dlVtt">下载 VTT 字幕</button>
        <button class="btn" id="toSub">→ 拿去加字幕</button>
      </div>
      ${mode === "align" ? `<div class="note" style="margin-top:10px">对齐完成：分段文字用的是<b>你提供的文案</b>，时间轴来自音频。${ratio != null && ratio < 0.6 ? ` <b style="color:var(--danger)">匹配率偏低（${Math.round(ratio * 100)}%），建议核对文案是否与音频一致。</b>` : ""}</div>` : ""}
      <div class="field" style="margin-top:12px"><label>识别文本（可直接编辑校对）</label><textarea id="asrText" rows="8"></textarea></div>
      <div class="field"><label>分段（点击可跳转播放）</label></div>
      <div id="segs" class="out-box" style="white-space:normal;max-height:340px"></div>`;
    $("#asrText").value = segs.map((s) => s.text).join("\n");
    const segBox = $("#segs");
    segs.forEach((s) => {
      const d = document.createElement("div");
      d.style.cssText = "padding:6px 0;border-bottom:1px dashed var(--line);cursor:pointer";
      d.innerHTML = `<span style="font-family:var(--mono);font-size:11.5px;color:var(--accent)">${clock(s.start)}</span> <span style="font-size:13.5px">${esc(s.text).replace(/\n/g, "<br>")}</span>`;
      d.onclick = () => { const p = $("#player"); if (p) { p.currentTime = s.start; p.play && p.play().catch(() => {}); } };
      segBox.appendChild(d);
    });
    $("#cpText").onclick = (e) => navigator.clipboard.writeText($("#asrText").value).then(() => { e.target.textContent = "已复制"; setTimeout(() => (e.target.textContent = "复制全文"), 1200); });
    $("#dlTxt").onclick = () => download($("#asrText").value, `${base}.txt`);
    $("#dlSrt").onclick = () => download(srt, `${base}.srt`, "text/plain");
    $("#dlVtt").onclick = () => download(vtt, `${base}.vtt`, "text/vtt");
    $("#toSub").onclick = () => {
      try { localStorage.setItem("toolbox.pendingSrt", srt); } catch (e) {}
      location.href = "av-tools.html";
    };
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    $("#fileInput").addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
    const drop = $("#drop");
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
    drop.addEventListener("click", () => $("#fileInput").click());
    document.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.files;
      if (items && items.length) { const f = Array.from(items).find((x) => /^(audio|video)\//.test(x.type)); if (f) loadFile(f); }
    });
    $("#clearBtn").onclick = () => {
      state.file = null; state.info = null; state.result = null;
      if (state.playerUrl) { try { URL.revokeObjectURL(state.playerUrl); } catch (e) {} state.playerUrl = null; }
      $("#fileName").textContent = "尚未选择文件"; $("#fileInfo").innerHTML = ""; $("#playerWrap").innerHTML = "";
      $("#result").innerHTML = '<div class="empty">识别结果会显示在这里</div>'; $("#asrStat").textContent = "";
      $("#clearBtn").disabled = true; err(""); hideProgress(); updateRun();
    };
    $("#model").addEventListener("change", showModelMsg);
    $("#pullBtn").onclick = pullModel;
    $("#runBtn").onclick = () => (state.mode === "align" ? runAlign() : run());
    $$("#modeTabs .tab").forEach((b) => (b.onclick = () => {
      state.mode = b.dataset.mode;
      $$("#modeTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".mode-block").forEach((p) => p.classList.toggle("hidden", p.dataset.mode !== state.mode));
      $("#result").innerHTML = '<div class="empty">结果会显示在这里</div>';
      $("#asrStat").textContent = "";
      err(""); hideProgress(); updateRun();
    }));
    $("#importRef").onclick = () => $("#refFile").click();
    $("#refFile").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      let raw = await f.text();
      if (/\.(srt|vtt)$/i.test(f.name)) raw = stripSubtitle(raw);
      $("#refText").value = raw.trim();
      $("#refMsg").textContent = `已导入 ${f.name}（${$("#refText").value.length} 字）`;
      e.target.value = "";
    });
    checkService();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
