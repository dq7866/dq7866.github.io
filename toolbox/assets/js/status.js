/* 首页 · 能力自检
   在线版如实探测，不做任何伪造：
   - 纯前端能力（图片 / PDF / 二维码 / 表格 / 颜色 / Markdown / 计算器 …）全部在浏览器内完成，不需要任何服务；
   - 音视频转码 / 语音转文字 / OCR / 配音 / AI 抠图 需要本机增强服务，在线版不提供。
*/
(function () {
  "use strict";
  const SERVICE = "http://127.0.0.1:8765";
  const grid = document.getElementById("statusGrid");
  if (!grid) return;

  const STYLES = {
    ok:  ["✅ 可用",        "var(--ok)"],
    no:  ["— 在线版不提供", "var(--muted)"],
    bad: ["❌ 不可用",      "var(--danger)"]
  };
  function card(label, state, note) {
    const s = STYLES[state] || STYLES.no;
    return (
      '<div class="stat">' +
        '<div class="k">' + label + '</div>' +
        '<div class="v" style="font-size:15px;color:' + s[1] + '">' + s[0] + '</div>' +
        (note ? '<div class="hint" style="margin:6px 0 0;font-size:11.5px">' + note + '</div>' : '') +
      '</div>'
    );
  }

  async function run() {
    let h = null;
    try {
      const r = await fetch(SERVICE + "/health", { cache: "no-store", signal: AbortSignal.timeout(2000) });
      h = await r.json();
    } catch (e) { h = null; }

    const local = !!(h && h.ok);   // 是否检测到本机增强服务

    let models = [];
    if (local) {
      try { models = (await (await fetch(SERVICE + "/asr/models", { cache: "no-store" })).json()).models || []; } catch (e) {}
    }
    const ready = models.filter((m) => m.ready);
    const TIP = "需本机引擎，在线版不提供";

    grid.innerHTML = local
      ? card("网页服务", "ok", "当前页面能打开就说明正常") +
        card("本机增强服务", "ok", "已连接 " + SERVICE) +
        card("ffmpeg（音视频）", h.ffmpegAvailable ? "ok" : "bad", h.ffmpeg ? String(h.ffmpeg).split("\\").slice(-2).join("\\") : "") +
        card("LibreOffice（PDF→Office）", (h.soffice && !/^soffice$/.test(h.soffice)) ? "ok" : "bad", h.soffice ? "" : "未安装：只有「高保真 Office」需要它") +
        card("Python（语音转文字）", h.python ? "ok" : "bad", h.python ? String(h.python).split("\\").slice(-2).join("\\") : "") +
        card("Whisper 模型", ready.length ? "ok" : "bad", ready.length ? "已就绪：" + ready.map((m) => m.key).join(", ") : "在「语音转文字」页点「下载所选模型」") +
        card("AI 抠图模型", h.bgModel ? "ok" : "bad", h.bgModel ? "已就绪：U2Net（本地离线）" : "缺少 server/models/birefnet/u2net.onnx")
      : card("网页服务", "ok", "当前页面能打开就说明正常") +
        card("本机增强服务", "no", TIP) +
        card("ffmpeg（音视频）", "no", TIP) +
        card("LibreOffice（PDF→Office）", "no", TIP) +
        card("Python（语音转文字）", "no", TIP) +
        card("Whisper 模型", "no", TIP) +
        card("AI 抠图模型", "no", TIP);

    const hint = document.getElementById("stHint");
    if (hint) {
      hint.innerHTML = local
        ? "本机增强服务运行中：音视频 / 语音转文字 / OCR / 配音 / AI 抠图 均已可用。缺失的可选项不影响其它功能。"
        : "当前是<b>在线版</b>：图片、PDF、二维码、表格、颜色、密码、Markdown、JSON、正则、编码、笔记、番茄钟、图表、播放器、计算器等工具全部在浏览器内完成，<b>不上传任何文件</b>；音视频转码、语音转文字、OCR、配音、AI 抠图 需要本机引擎，请使用本地完整版。";
    }
    const up = document.getElementById("stUpdated");
    if (up) up.textContent = "检测于 " + new Date().toLocaleTimeString("zh-CN");
  }

  run();
  const rb = document.getElementById("stRefresh");
  if (rb) rb.onclick = () => { grid.innerHTML = '<div class="hint" style="margin:0">检测中…</div>'; run(); };
})();
