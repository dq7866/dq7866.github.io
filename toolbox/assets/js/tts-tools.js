/* ============================================================
   免费工具箱 · 文字转语音
   离线：本机 sherpa-onnx（melo 优质女声 / aishell3 174 音色）
   在线：微软 edge-tts（15 个中文音色，需联网）
   ============================================================ */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const SVC = "http://127.0.0.1:8765";

  const EDGE_VOICES = [
    { v: "zh-CN-XiaoxiaoNeural", n: "晓晓", tag: "女 · 通用" },
    { v: "zh-CN-XiaoyiNeural", n: "晓伊", tag: "女 · 活泼" },
    { v: "zh-CN-XiaomoNeural", n: "晓墨", tag: "女 · 知性" },
    { v: "zh-CN-XiaoxuanNeural", n: "晓萱", tag: "女 · 干练" },
    { v: "zh-CN-XiaoruiNeural", n: "晓睿", tag: "女 · 成熟" },
    { v: "zh-CN-XiaoshuangNeural", n: "晓双", tag: "女 · 童声" },
    { v: "zh-CN-YunxiNeural", n: "云希", tag: "男 · 阳光" },
    { v: "zh-CN-YunyangNeural", n: "云扬", tag: "男 · 新闻" },
    { v: "zh-CN-YunjianNeural", n: "云健", tag: "男 · 体育" },
    { v: "zh-CN-YunzeNeural", n: "云泽", tag: "男 · 成熟" },
    { v: "zh-CN-YunxiaNeural", n: "云夏", tag: "男 · 少年" },
    { v: "zh-CN-liaoning-XiaobeiNeural", n: "晓北", tag: "东北话" },
    { v: "zh-CN-shaanxi-XiaoniNeural", n: "晓妮", tag: "陕西话" },
    { v: "zh-HK-HiuMaanNeural", n: "曉曼", tag: "粤语 · 女" },
    { v: "zh-TW-HsiaoChenNeural", n: "曉臻", tag: "中国台湾 · 女" }
  ];

  const state = {
    engine: "offline",
    models: [],              // 来自 /tts/status 的离线模型
    model: null,             // 首次加载后自动选「推荐」那个
    voice: 0,
    filter: "",
    gender: "",              // "" 全部 / "男" / "女"
    meta: {},                // model -> { "0": {name,gender,desc,hz} }
    busy: false,
    styles: [],
    hist: [],
    audioUrl: null           // 当前播放器的 blob URL，用于内存泄漏清理
  };
  try { state.hist = JSON.parse(localStorage.getItem("tbx-tts-hist") || "[]"); } catch (e) { state.hist = []; }

  const err = (m) => ($("#err").textContent = m || "");
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /* ---------------- 音色区 ---------------- */
  function curModel() { return state.models.find((m) => m.key === state.model) || state.models[0] || { key: "melo", speakers: 1, rate: 44100, name: "离线音色" }; }

  function renderVoices() {
    const box = $("#voices");
    if (state.engine === "edge") {
      box.innerHTML = EDGE_VOICES.map((v) => `
        <label class="${v.v === state.voice ? "on" : ""}">
          <input type="radio" name="voice" value="${esc(v.v)}" ${v.v === state.voice ? "checked" : ""}>
          <span>${esc(v.n)}</span><span class="tag">${esc(v.tag)}</span>
        </label>`).join("");
      bindVoiceRadios(EDGE_VOICES);
      return;
    }

    if (!state.models.length) {
      box.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:12.5px">未检测到离线语音模型</div>';
      return;
    }
    const m = curModel();
    let html = "";
    if (state.models.length > 1) {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">' +
        state.models.map((x) => `<button class="btn ${x.key === state.model ? "primary" : "ghost"}" data-model="${esc(x.key)}" style="padding:4px 10px;font-size:12px">${esc(x.name)}</button>`).join("") +
        "</div>";
    }
    if (m.speakers > 1) {
      if (state.meta[state.model] === undefined) loadVoicesMeta(state.model);
      html += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
          <input type="text" id="spkFilter" data-no-prefs placeholder="筛选编号，如 0-30" value="${esc(state.filter)}"
                 style="flex:1;height:30px;padding:0 9px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);color:var(--ink);font-size:12.5px">
          <button class="btn ghost" id="spkRandom" style="padding:4px 10px;font-size:12px">随机</button>
        </div>`;
      html += `<div class="spk-gender">` +
        [["", "全部"], ["女", "♀ 女声"], ["男", "♂ 男声"]].map(([k, t]) =>
          `<button class="btn ${state.gender === k ? "primary" : "ghost"}" data-gender="${k}" style="padding:3px 10px;font-size:12px">${t}</button>`).join("") +
        `</div>`;
      const list = filterSpeakers(m.speakers, state.filter);
      html += '<div class="tts-spk">' + list.map((i) => {
        const v = voiceMeta(i);
        const sym = v ? (v.gender === "男" ? "♂" : "♀") : "";
        const cls = v && v.gender === "男" ? "male" : v ? "female" : "";
        return `<button class="spk ${cls} ${i === state.voice ? "on" : ""}" data-spk="${i}" title="${esc(v ? v.desc : "编号 " + i)}">${i}${sym ? `<i class="g">${sym}</i>` : ""}</button>`;
      }).join("") + "</div>";
      if (!list.length) html += '<div style="padding:8px;color:var(--muted);font-size:12px">没有匹配的编号</div>';
      html += `<div id="spkDetail" class="spk-detail"></div>`;
    } else {
      html += `<label class="on"><input type="radio" name="voice" value="0" checked><span>${esc(m.name)}</span><span class="tag">本机</span></label>`;
    }
    box.innerHTML = html;

    box.querySelectorAll("[data-model]").forEach((b) => {
      b.onclick = () => { state.model = b.dataset.model; state.voice = 0; state.filter = ""; renderVoices(); };
    });
    box.querySelectorAll("[data-spk]").forEach((b) => {
      b.onclick = () => { state.voice = +b.dataset.spk; renderVoices(); };
    });
    const fl = $("#spkFilter");
    if (fl) {
      fl.oninput = () => { state.filter = fl.value; const pos = fl.selectionStart; renderVoices(); const f2 = $("#spkFilter"); if (f2) { f2.focus(); try { f2.setSelectionRange(pos, pos); } catch (e) {} } };
    }
    const rd = $("#spkRandom");
    if (rd) rd.onclick = () => {
      const pool = filterSpeakers(m.speakers, state.filter);
      if (pool.length) { state.voice = pool[Math.floor(Math.random() * pool.length)]; renderVoices(); }
    };
    box.querySelectorAll("[data-gender]").forEach((b) => {
      b.onclick = () => { state.gender = b.dataset.gender; renderVoices(); };
    });
    const det = $("#spkDetail");
    if (det) {
      const v = voiceMeta(state.voice);
      det.innerHTML = v
        ? `<b>编号 ${state.voice}</b>${v.name ? ` · <code>${esc(v.name)}</code>` : ""} · ${v.gender === "男" ? "♂ 男声" : "♀ 女声"}<br>
           <span class="dim">${esc(v.desc)}${v.hz ? ` · 实测基频约 ${v.hz}Hz` : ""}${v.guess ? " · <i>性别按音高推测</i>" : ""}</span>`
        : `<b>编号 ${state.voice}</b><br><span class="dim">该编号暂无音色描述</span>`;
    }

    const best = state.models.find((m) => m.best);
    $("#voiceHint").innerHTML = m.rate <= 8000
      ? `当前「${esc(m.name)}」有 <b>${m.speakers}</b> 个音色可选，但它是 <b>8kHz 电话音质</b>（省体积，适合挑不同声音）；要更好的音质请选「103 音色 · 24kHz」。`
      : `当前「${esc(m.name)}」在本机合成，<b>不联网、不上传文字</b>。` +
        (m.speakers > 1 ? `可选的 <b>${m.speakers}</b> 个音色用编号表示，点网格里的数字切换，或点「随机」帮你挑一个。` : "");
  }

  function voiceMeta(i) {
    const m = state.meta[state.model];
    if (!m) return null;
    return m[String(i)] || null;
  }

  async function loadVoicesMeta(model) {
    if (state.meta[model] !== undefined) return;
    state.meta[model] = null;          // 占位，避免重复请求
    try {
      const j = await (await fetch(SVC + "/tts/voices?model=" + encodeURIComponent(model))).json();
      state.meta[model] = (j && j.voices) ? j.voices : {};
    } catch (e) {
      state.meta[model] = {};
    }
    renderVoices();
  }

  function filterSpeakers(total, f) {
    let lo = 0, hi = total - 1;
    f = (f || "").trim();
    if (f) {
      const m = f.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) { lo = Math.max(0, +m[1]); hi = Math.min(total - 1, +m[2]); }
      else if (/^\d+$/.test(f)) { lo = +f; hi = Math.min(total - 1, +f + 30); }
    }
    const meta = state.meta[state.model];
    const g = state.gender;
    const out = [];
    for (let i = lo; i <= hi && out.length < 220; i++) {
      if (g && meta) { const v = meta[String(i)]; if (!v || v.gender !== g) continue; }
      out.push(i);
    }
    return out;
  }

  function bindVoiceRadios(list) {
    $("#voices").querySelectorAll("input[name=voice]").forEach((r) => {
      r.onchange = () => {
        const hit = list.find((x) => String(x.v) === r.value);
        state.voice = hit ? hit.v : r.value;
        $("#voices").querySelectorAll("label").forEach((l) => l.classList.toggle("on", l.contains(r)));
      };
    });
    $("#voiceHint").innerHTML = state.engine === "edge"
      ? "在线音色由微软提供，音质最自然，但<b>需要联网</b>，文本会发送给微软。"
      : "";
  }

  /* ---------------- 字数与预估 ---------------- */
  function updateMeta() {
    const t = $("#text").value;
    const n = t.replace(/\s/g, "").length;
    $("#cnt").textContent = n;
    const sec = Math.round(n / 4.5);
    $("#est").textContent = sec >= 60 ? Math.floor(sec / 60) + "分" + (sec % 60) + "秒" : sec + "秒";
    $("#longWarn").style.display = n > 800 ? "" : "none";
    $("#engHint").textContent = state.engine === "offline"
      ? "· 本机离线合成（不上传）"
      : "· 在线合成（需联网）";
  }

  /* ---------------- 合成 ---------------- */
  let ctl = null;
  async function generate() {
    const text = $("#text").value.trim();
    if (!text) return err("请先输入要合成的文字。");
    if (state.busy) return;
    err("");
    state.busy = true;
    $("#genBtn").disabled = true;
    $("#stopBtn").style.display = "";
    $("#busy").style.display = "flex";
    const t0 = Date.now();
    $("#busyText").textContent = state.engine === "offline" ? "正在本机合成…（首次需加载模型约 2–4 秒）" : "正在请求在线音色…";
    ctl = new AbortController();
    try {
      const payload = { text, engine: state.engine, voice: state.voice, speed: $("#speed").value };
      if (state.engine === "offline") payload.model = state.model;
      // 音色风格对离线和在线都生效
      const st = $("#style") ? $("#style").value : "none";
      const pit = $("#pitch") ? parseInt($("#pitch").value, 10) || 0 : 0;
      payload.style = st;
      if (pit) payload.pitch = pit;
      const ps = $("#pause") ? parseFloat($("#pause").value) || 0 : 0;
      if (ps > 0) payload.pause = ps;
      const r = await fetch(SVC + "/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctl.signal
      });
      if (!r.ok) {
        let m = "";
        try { const j = await r.json(); m = j.error || ""; } catch (e) { m = await r.text().catch(() => ""); }
        throw new Error(m || ("合成失败 HTTP " + r.status));
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const dur = r.headers.get("X-TTS-Dur");
      const sec = r.headers.get("X-TTS-Sec");
      const rate = r.headers.get("X-TTS-Rate");
      const usedModel = r.headers.get("X-TTS-Model");
      // 释放旧的音频 blob URL，避免内存泄漏（旧 URL 仍在历史记录中，由历史记录负责最终释放）
      state.audioUrl = url;
      $("#audio").src = url;
      $("#player").style.display = "";
      $("#dlBtn").onclick = () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = "配音_" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + (blob.type.includes("mpeg") ? ".mp3" : ".wav");
        document.body.appendChild(a); a.click(); a.remove();
      };
      const usedStyle = r.headers.get("X-TTS-Style") || "none";
      const styleName = (state.styles.find((x) => x.key === usedStyle) || {}).name || "";
      $("#info").textContent =
        (usedModel === "aishell3" || (usedModel === "kokoro" && state.voice !== 0) ? `说话人 ${state.voice}（${rate}Hz）· ` : "") +
        (usedStyle !== "none" ? `${styleName} · ` : "") +
        `${(blob.size / 1024).toFixed(0)} KB` + (dur ? `，音频 ${dur} 秒` : "") +
        (sec ? `，合成耗时 ${sec} 秒` : "") + `，总用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`;
      addHist(text, blob, url);
      $("#audio").play().catch(() => {});
    } catch (e) {
      if (e.name === "AbortError") err("已取消。");
      else err("合成失败：" + e.message);
    } finally {
      state.busy = false;
      ctl = null;
      $("#genBtn").disabled = false;
      $("#stopBtn").style.display = "none";
      $("#busy").style.display = "none";
    }
  }

  /* ---------------- 历史 ---------------- */
  function addHist(text, blob, url) {
    state.hist.unshift({ t: text.slice(0, 60), d: (blob.size / 1024).toFixed(0) + "KB", u: url, ts: Date.now() });
    // 超出限制的历史条目释放其 blob URL，避免内存泄漏
    if (state.hist.length > 12) {
      const removed = state.hist.slice(12);
      removed.forEach((x) => { if (x.u) { try { URL.revokeObjectURL(x.u); } catch (e) {} } });
    }
    state.hist = state.hist.slice(0, 12);
    try { localStorage.setItem("tbx-tts-hist", JSON.stringify(state.hist.map((x) => ({ t: x.t, d: x.d, ts: x.ts })))); } catch (e) {}
    renderHist();
  }
  function renderHist() {
    const h = $("#hist");
    if (!state.hist.length) { h.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12.5px">还没有生成过</div>'; return; }
    h.innerHTML = state.hist.map((x, i) => `
      <div class="r">
        <span class="t" title="${esc(x.t)}">${esc(x.t)}</span>
        <span class="d">${esc(x.d)}</span>
        <button class="btn ghost" data-play="${i}" style="padding:2px 9px;font-size:11.5px">${x.u ? "播放" : "已过期"}</button>
      </div>`).join("");
    h.querySelectorAll("[data-play]").forEach((b) => {
      b.onclick = () => {
        const x = state.hist[+b.dataset.play];
        if (!x || !x.u) return err("这条历史在刷新后已失效，请重新合成。");
        state.audioUrl = x.u;
        $("#audio").src = x.u;
        $("#player").style.display = "";
        $("#audio").play().catch(() => {});
      };
    });
  }

  /* ---------------- 初始化 ---------------- */
  async function loadStatus() {
    try {
      const j = await (await fetch(SVC + "/tts/status")).json();
      state.models = j.models || [];
      state.styles = j.styles || [];
      const sel = $("#style");
      if (sel && state.styles.length) {
        const cur = sel.value;
        sel.innerHTML = [{key:"none",name:"原声（不做处理）"}].concat(state.styles).map((s) => '<option value="' + esc(s.key) + '">' + esc(s.name) + "</option>").join("");
        // prefs.js 回填时选项还没建好，会回填失败；这里手动再回填一次
        let want = cur;
        try {
          const k = "tbx-prefs-" + (location.pathname.split("/").pop() || "index").replace(/\.html?$/i, "");
          const saved = JSON.parse(localStorage.getItem(k) || "{}");
          if (saved && saved.style && state.styles.some((s) => s.key === saved.style)) want = saved.style;
        } catch (e) {}
        sel.value = state.styles.some((s) => s.key === want) ? want : "none";
      }
      if (state.models.length) {
        const best = state.models.find((m) => m.best) || state.models[0];
        if (!state.model || !state.models.some((m) => m.key === state.model)) state.model = best.key;
      }
      $("#voiceHint").textContent = "";
      renderVoices();
      err("");
    } catch (e) {
      state.models = [];
      renderVoices();
      err("连不上本机增强服务：请先双击「启动.bat」或桌面图标。");
    }
  }

  function init() {
    updateMeta();
    renderHist();
    loadStatus();
    $("#text").addEventListener("input", updateMeta);
    $("#engine").addEventListener("change", (e) => {
      state.engine = e.target.value;
      state.voice = state.engine === "offline" ? 0 : EDGE_VOICES[0].v;
      renderVoices(); updateMeta();
    });
    $("#speed").addEventListener("input", (e) => ($("#spdVal").textContent = (+e.target.value).toFixed(2).replace(/0$/, "") + "×"));
    const pitEl = $("#pitch");
    if (pitEl) pitEl.addEventListener("input", (e) => { const v = +e.target.value; $("#pitVal").textContent = (v > 0 ? "+" : "") + v + " 半音"; });
    $("#genBtn").addEventListener("click", generate);
    $("#stopBtn").addEventListener("click", () => { if (ctl) ctl.abort(); });
    $("#clearBtn").addEventListener("click", () => { $("#text").value = ""; updateMeta(); err(""); });
    $("#demoBtn").addEventListener("click", () => {
      $("#text").value = "大家好，欢迎使用免费工具箱的文字转语音功能。\n\n它支持中文、English 和数字 2026 混排，离线音色全部在你自己的电脑上合成，文字不会上传到任何服务器。";
      updateMeta(); err("");
    });
    $("#histClear").addEventListener("click", () => {
      // 清空历史前释放所有 blob URL，避免内存泄漏
      state.hist.forEach((x) => { if (x.u) { try { URL.revokeObjectURL(x.u); } catch (e) {} } });
      state.hist = [];
      state.audioUrl = null;
      try { localStorage.removeItem("tbx-tts-hist"); } catch (e) {}
      renderHist(); err("");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
