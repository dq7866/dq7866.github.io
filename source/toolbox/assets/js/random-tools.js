/* 密码 & 随机工具 · 纯前端（使用 crypto 强随机） */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 随机基础 ---------------- */
  function randInt(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    const a = new Uint32Array(1);
    let x;
    do { crypto.getRandomValues(a); x = a[0]; } while (x >= limit);
    return x % maxExclusive;
  }
  const randIncl = (min, max) => {
    if (min > max) { const t = min; min = max; max = t; }
    return min + randInt(max - min + 1);
  };
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = randInt(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function copy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (btn) { const t = btn.textContent; btn.textContent = "已复制"; setTimeout(() => (btn.textContent = t), 1000); }
    }, () => alert("复制失败，请手动选择复制。"));
  }
  const he = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ================================================================ */
  /* ======================== 历史记录功能 ========================== */
  /* ================================================================ */
  const HISTORY_KEY = "tbx-random-history";
  const MAX_HISTORY = 50;

  const modeLabels = {
    password: "密码",
    number: "随机数",
    pick: "抽签",
    shuffle: "洗牌",
    uuid: "UUID",
    coin: "抛硬币",
    dice: "掷骰子",
    barcode: "条形码",
  };

  const modeColors = {
    password: "#ff4d00",
    number: "#8b5cf6",
    pick: "#10b981",
    shuffle: "#14b8a6",
    uuid: "#3b82f6",
    coin: "#f59e0b",
    dice: "#ec4899",
    barcode: "#6b7280",
  };

  let history = [];
  let historyReady = false; // 防止页面初始自动生成污染历史记录

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) history = JSON.parse(raw) || [];
    } catch (e) { history = []; }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* ignore quota errors */ }
  }

  function addHistoryEntry(mode, result, detail) {
    if (!historyReady) return; // 初始自动生成不记录历史
    const entry = {
      mode: mode,
      result: result,
      detail: detail || "",
      ts: Date.now(),
    };
    history.unshift(entry);
    if (history.length > MAX_HISTORY) {
      history = history.slice(0, MAX_HISTORY);
    }
    saveHistory();
    renderHistory();
  }

  function clearAllHistory() {
    if (!history.length) return;
    if (!confirm("确定要清空所有历史记录吗？")) return;
    history = [];
    saveHistory();
    renderHistory();
  }

  function deleteHistoryEntry(ts) {
    history = history.filter((e) => e.ts !== ts);
    saveHistory();
    renderHistory();
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const pad = (n) => String(n).padStart(2, "0");
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (sameDay) return `今天 ${timeStr}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `昨天 ${timeStr}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`;
  }

  function renderHistory() {
    const listEl = $("#histList");
    if (!listEl) return;
    if (!history.length) {
      listEl.innerHTML = `
        <div class="hist-empty">
          <div class="hist-empty-icon">📜</div>
          <div class="hist-empty-text">还没有生成记录，试试生成一个吧！</div>
        </div>`;
      return;
    }
    listEl.innerHTML = history.map((e) => {
      const label = modeLabels[e.mode] || e.mode;
      const color = modeColors[e.mode] || "#6b7280";
      const resultDisplay = typeof e.result === "string" && e.result.length > 80
        ? e.result.slice(0, 80) + "..."
        : e.result;
      return `
        <div class="hist-item" data-ts="${e.ts}">
          <div class="hist-item-head">
            <span class="hist-badge" style="background:${color}22;color:${color};border-color:${color}33">${he(label)}</span>
            <span class="hist-time">${formatTime(e.ts)}</span>
          </div>
          <div class="hist-result" title="${he(typeof e.result === 'string' ? e.result : '')}">${he(resultDisplay)}</div>
          ${e.detail ? `<div class="hist-detail">${he(e.detail)}</div>` : ""}
          <div class="hist-actions">
            <button class="hist-btn hist-copy" title="复制">📋 复制</button>
            <button class="hist-btn hist-del" title="删除">🗑️</button>
          </div>
        </div>`;
    }).join("");

    // bind events
    $$(".hist-item", listEl).forEach((item) => {
      const ts = +item.dataset.ts;
      const entry = history.find((e) => e.ts === ts);
      if (!entry) return;
      // click result to copy
      item.querySelector(".hist-result").onclick = () => {
        const btn = item.querySelector(".hist-copy");
        copy(entry.result, btn);
      };
      // copy button
      item.querySelector(".hist-copy").onclick = (ev) => {
        ev.stopPropagation();
        copy(entry.result, ev.currentTarget);
      };
      // delete button
      item.querySelector(".hist-del").onclick = (ev) => {
        ev.stopPropagation();
        deleteHistoryEntry(ts);
      };
    });
  }

  function toggleHistoryPanel() {
    const panel = $("#histPanel");
    const btn = $("#histToggle");
    if (!panel) return;
    const isOpen = panel.classList.contains("open");
    if (isOpen) {
      panel.classList.remove("open");
      btn.classList.remove("active");
    } else {
      panel.classList.add("open");
      btn.classList.add("active");
      renderHistory();
    }
  }

  function buildHistoryUI() {
    // inject styles
    const style = document.createElement("style");
    style.textContent = `
      /* ---- 历史记录面板样式 ---- */
      #histToggle {
        position: fixed;
        top: 70px;
        right: 16px;
        z-index: 100;
        background: var(--accent, #ff4d00);
        color: #fff;
        border: none;
        border-radius: 999px;
        padding: 10px 16px;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(255, 77, 0, 0.35);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      #histToggle:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(255, 77, 0, 0.45);
      }
      #histToggle.active {
        background: #fff;
        color: var(--accent, #ff4d00);
        border: 1px solid var(--accent, #ff4d00);
      }
      #histPanel {
        position: fixed;
        top: 0;
        right: 0;
        width: 360px;
        max-width: 90vw;
        height: 100vh;
        background: var(--bg, #fff);
        border-left: 1px solid var(--line, #e5e7eb);
        z-index: 200;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.08);
      }
      #histPanel.open {
        transform: translateX(0);
      }
      .hist-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 18px;
        border-bottom: 1px solid var(--line, #e5e7eb);
        flex-shrink: 0;
      }
      .hist-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .hist-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #999;
        padding: 4px 8px;
        border-radius: 6px;
      }
      .hist-close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #333;
      }
      .hist-list {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      }
      .hist-empty {
        text-align: center;
        padding: 60px 20px;
        color: #999;
      }
      .hist-empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
      }
      .hist-empty-text {
        font-size: 14px;
      }
      .hist-item {
        background: var(--bg-soft, rgba(0,0,0,0.02));
        border: 1px solid var(--line, #e5e7eb);
        border-radius: var(--radius, 10px);
        padding: 12px;
        margin-bottom: 10px;
        transition: box-shadow 0.2s ease;
      }
      .hist-item:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }
      .hist-item-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .hist-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 500;
        border: 1px solid;
      }
      .hist-time {
        font-size: 11px;
        color: #999;
      }
      .hist-result {
        font-family: var(--mono, monospace);
        font-size: 13px;
        word-break: break-all;
        line-height: 1.5;
        margin-bottom: 6px;
        cursor: pointer;
        padding: 6px 8px;
        background: rgba(0, 0, 0, 0.03);
        border-radius: 6px;
        user-select: text;
        transition: background 0.15s ease;
      }
      .hist-result:hover {
        background: rgba(0, 0, 0, 0.06);
      }
      .hist-detail {
        font-size: 11px;
        color: #888;
        margin-bottom: 8px;
      }
      .hist-actions {
        display: flex;
        gap: 6px;
      }
      .hist-btn {
        flex: 1;
        padding: 6px 10px;
        font-size: 12px;
        border: 1px solid var(--line, #e5e7eb);
        background: var(--bg, #fff);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .hist-btn:hover {
        border-color: var(--accent, #ff4d00);
        color: var(--accent, #ff4d00);
      }
      .hist-btn.hist-del {
        flex: 0 0 auto;
        padding: 6px 10px;
      }
      .hist-btn.hist-del:hover {
        border-color: var(--danger, #ef4444);
        color: var(--danger, #ef4444);
      }
      .hist-footer {
        padding: 12px;
        border-top: 1px solid var(--line, #e5e7eb);
        flex-shrink: 0;
      }
      .hist-clear-all {
        width: 100%;
        padding: 10px;
        font-size: 14px;
        border: 1px solid var(--line, #e5e7eb);
        background: var(--bg, #fff);
        border-radius: 8px;
        cursor: pointer;
        color: #666;
        transition: all 0.15s ease;
      }
      .hist-clear-all:hover {
        border-color: var(--danger, #ef4444);
        color: var(--danger, #ef4444);
      }
      .hist-count {
        font-size: 12px;
        color: #999;
        margin-left: 6px;
        font-weight: normal;
      }
      /* 遮罩层 */
      #histOverlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 150;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }
      #histOverlay.show {
        opacity: 1;
        pointer-events: auto;
      }
      /* 移动端适配：底部弹出 */
      @media (max-width: 640px) {
        #histToggle {
          top: auto;
          bottom: 20px;
          right: 16px;
        }
        #histPanel {
          top: auto;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          max-width: 100%;
          height: 80vh;
          border-left: none;
          border-top: 1px solid var(--line, #e5e7eb);
          border-radius: 16px 16px 0 0;
          transform: translateY(100%);
        }
        #histPanel.open {
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);

    // overlay
    const overlay = document.createElement("div");
    overlay.id = "histOverlay";
    overlay.onclick = toggleHistoryPanel;
    document.body.appendChild(overlay);

    // toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "histToggle";
    toggleBtn.innerHTML = "📜 历史";
    toggleBtn.title = "查看生成历史";
    toggleBtn.onclick = toggleHistoryPanel;
    document.body.appendChild(toggleBtn);

    // panel
    const panel = document.createElement("aside");
    panel.id = "histPanel";
    panel.innerHTML = `
      <div class="hist-header">
        <h3>📜 最近生成 <span class="hist-count" id="histCount"></span></h3>
        <button class="hist-close" id="histClose" title="关闭">✕</button>
      </div>
      <div class="hist-list" id="histList"></div>
      <div class="hist-footer">
        <button class="hist-clear-all" id="histClearAll">🗑️ 清空历史</button>
      </div>
    `;
    document.body.appendChild(panel);

    // events
    $("#histClose").onclick = toggleHistoryPanel;
    $("#histClearAll").onclick = clearAllHistory;

    // ESC to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("open")) {
        toggleHistoryPanel();
      }
    });

    // initial render
    loadHistory();
    updateHistCount();
  }

  function updateHistCount() {
    const el = $("#histCount");
    if (el) el.textContent = history.length ? `(${history.length}/${MAX_HISTORY})` : "";
  }

  // patch renderHistory to also update count
  const _origRenderHistory = renderHistory;
  renderHistory = function () {
    _origRenderHistory();
    updateHistCount();
  };

  /* ---------------- tabs ---------------- */
  $$("#rTabs .tab").forEach((b) => {
    b.onclick = () => {
      $$("#rTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".r-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
    };
  });

  /* ---------------- 01 密码 ---------------- */
  const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", LOWER = "abcdefghijklmnopqrstuvwxyz", DIGIT = "0123456789", SYMBOL = "!@#$%^&*()-_=+[]{};:,.?";
  const AMBIG = "0O1lI|`'\"";
  function pwSets() {
    const amb = $("#pwNoAmbig").checked;
    const strip = (s) => (amb ? s.split("").filter((c) => AMBIG.indexOf(c) < 0).join("") : s);
    const sets = [];
    if ($("#pwUpper").checked) sets.push(strip(UPPER));
    if ($("#pwLower").checked) sets.push(strip(LOWER));
    if ($("#pwDigit").checked) sets.push(strip(DIGIT));
    if ($("#pwSymbol").checked) sets.push(strip(SYMBOL));
    return sets.filter((s) => s.length);
  }
  function genPassword(len, sets, noDup) {
    const all = sets.join("");
    if (!all) throw new Error("请至少勾选一种字符类型");
    if (noDup) {
      if (len > all.length) throw new Error("字符不重复时，长度不能超过字符池大小（" + all.length + "）");
      return shuffle(all.split("")).slice(0, len).join("");
    }
    const arr = [];
    const k = Math.min(sets.length, len);
    for (let i = 0; i < k; i++) arr.push(sets[i][randInt(sets[i].length)]);
    while (arr.length < len) arr.push(all[randInt(all.length)]);
    return shuffle(arr).slice(0, len).join("");
  }
  function strength(entropy) {
    if (entropy < 40) return { p: entropy / 128 * 100, c: "var(--danger)", t: "弱" };
    if (entropy < 60) return { p: entropy / 128 * 100, c: "#f59e0b", t: "中" };
    if (entropy < 80) return { p: entropy / 128 * 100, c: "var(--ok)", t: "强" };
    return { p: Math.min(100, entropy / 128 * 100), c: "var(--ok)", t: "很强" };
  }
  function runPw() {
    const len = +$("#pwLen").value, count = Math.max(1, Math.min(50, +$("#pwCount").value || 1));
    const noDup = $("#pwNoDup").checked;
    const sets = pwSets();
    // 未勾选任何字符类型时显示错误并返回
    if (!sets.length) {
      alert("请至少勾选一种字符类型（大写/小写/数字/符号）");
      return;
    }
    let list;
    try {
      list = [];
      for (let i = 0; i < count; i++) list.push(genPassword(len, sets, noDup));
    } catch (e) { alert(e.message); return; }
    const pool = sets.join("");
    const entropy = Math.log2(pool.length || 1) * len;
    const s = strength(entropy);
    $("#pwOut").textContent = list[0];
    $("#pwBar").style.width = Math.min(100, s.p) + "%";
    $("#pwBar").style.background = s.c;
    $("#pwInfo").innerHTML = `强度：<b style="color:${s.c}">${s.t}</b> · 熵约 ${entropy.toFixed(0)} bit · 字符池 ${pool.length} 种`;
    const box = $("#pwList"); box.innerHTML = "";
    list.slice(1).forEach((p) => {
      const d = document.createElement("div");
      d.className = "result";
      d.innerHTML = `<div class="meta"><div class="nm" style="font-family:var(--mono);user-select:text">${he(p)}</div></div>`;
      const b = document.createElement("button"); b.className = "btn ghost"; b.textContent = "复制";
      b.onclick = () => copy(p, b);
      d.appendChild(b);
      box.appendChild(d);
    });
    $("#pwGen").dataset.list = JSON.stringify(list);
    $("#pwCopyAll").onclick = (e) => copy(JSON.parse($("#pwGen").dataset.list || "[]").join("\n"), e.target);

    /* --- 历史记录 --- */
    const types = [];
    if ($("#pwUpper").checked) types.push("大写");
    if ($("#pwLower").checked) types.push("小写");
    if ($("#pwDigit").checked) types.push("数字");
    if ($("#pwSymbol").checked) types.push("符号");
    const detail = `${len}位 · ${count}个 · ${types.join("+")}${noDup ? " · 不重复" : ""}`;
    addHistoryEntry("password", list.join("\n"), detail);
  }
  $("#pwGen").onclick = runPw;
  $("#pwLen").oninput = (e) => { $("#pwLenVal").textContent = e.target.value; runPw(); };
  ["#pwUpper", "#pwLower", "#pwDigit", "#pwSymbol", "#pwNoAmbig", "#pwNoDup"].forEach((s) => $(s).addEventListener("change", runPw));
  $("#pwCount").addEventListener("change", runPw);
  runPw();

  /* ---------------- 02 随机数 ---------------- */
  function runNum() {
    let min = Math.ceil(+$("#nMin").value || 0), max = Math.floor(+$("#nMax").value || 0);
    if (min > max) { const t = min; min = max; max = t; }
    const count = Math.max(1, Math.min(1000, +$("#nCount").value || 1));
    const uniq = $("#nUnique").checked;
    const span = max - min + 1;
    if (uniq && count > span) { alert("不重复时数量不能超过区间大小（" + span + "）"); return; }
    let out;
    if (uniq) {
      const set = new Set();
      while (set.size < count) set.add(randIncl(min, max));
      out = [...set];
    } else {
      out = Array.from({ length: count }, () => randIncl(min, max));
    }
    $("#nOut").textContent = out.join("  ");
    $("#nCopy").onclick = (e) => copy(out.join("\n"), e.target);

    /* --- 历史记录 --- */
    const detail = `${min} ~ ${max} · ${count}个${uniq ? " · 不重复" : ""}`;
    addHistoryEntry("number", out.join(", "), detail);
  }
  $("#nGen").onclick = runNum;

  /* ---------------- 03 抽签 ---------------- */
  function names() {
    return $("#dList").value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  $("#dPick").onclick = () => {
    const list = names();
    if (!list.length) { alert("请先填写名单"); return; }
    const n = Math.max(1, Math.min(list.length, +$("#dCount").value || 1));
    const picked = shuffle(list.slice()).slice(0, n);
    $("#dOut").textContent = picked.join("、");
    $("#dAll").style.display = "none";

    /* --- 历史记录 --- */
    const detail = `抽取 ${n} 人 · 共 ${list.length} 人`;
    addHistoryEntry("pick", picked.join("、"), detail);
  };
  $("#dShuffle").onclick = () => {
    const list = names();
    if (!list.length) { alert("请先填写名单"); return; }
    const order = shuffle(list.slice());
    $("#dOut").textContent = "已洗牌 ↓";
    $("#dAll").style.display = "block";
    $("#dAll").textContent = order.map((n, i) => `${i + 1}. ${n}`).join("\n");

    /* --- 历史记录 --- */
    const detail = `洗牌排序 · 共 ${list.length} 人`;
    addHistoryEntry("shuffle", order.map((n, i) => `${i + 1}. ${n}`).join("\n"), detail);
  };

  /* ---------------- 04 UUID ---------------- */
  function uuid4() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  $$("#uFmt button").forEach((b) => b.onclick = () => { $$("#uFmt button").forEach((x) => x.classList.toggle("active", x === b)); runUuid(); });
  function runUuid() {
    const n = Math.max(1, Math.min(500, +$("#uCount").value || 1));
    const fmt = $("#uFmt .active").dataset.v;
    const list = Array.from({ length: n }, () => {
      let u = uuid4();
      if (fmt === "upper") u = u.toUpperCase();
      if (fmt === "nohyphen") u = u.replace(/-/g, "");
      return u;
    });
    $("#uOut").textContent = list.join("\n");    $("#uCopy").onclick = (e) => copy(list.join("\n"), e.target);

    /* --- 历史记录 --- */
    const fmtLabel = fmt === "upper" ? "大写" : fmt === "nohyphen" ? "无连字符" : "标准";
    const detail = `${n}个 · ${fmtLabel}格式`;
    addHistoryEntry("uuid", list.join("\n"), detail);
  }
  $("#uGen").onclick = runUuid;
  $("#uCount").addEventListener("change", runUuid);

  /* ---------------- 05 硬币骰子 ---------------- */
  const DICE_FACE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  $("#flipCoin").onclick = () => {
    const r = randInt(2) === 0 ? "正面" : "反面";
    $("#dcOut").textContent = r === "正面" ? "🪙 正面" : "🪙 反面";
    $("#dcInfo").textContent = "50% / 50%";

    /* --- 历史记录 --- */
    addHistoryEntry("coin", r, "");
  };
  $("#rollDice").onclick = () => {
    const n = Math.max(1, Math.min(10, +$("#dcCount").value || 1));
    const rolls = Array.from({ length: n }, () => randIncl(1, 6));
    $("#dcOut").textContent = rolls.map((r) => DICE_FACE[r - 1]).join(" ");
    const total = rolls.reduce((a, b) => a + b, 0);
    $("#dcInfo").textContent = `点数：${rolls.join(" + ")}${n > 1 ? " = " + total : ""}`;

    /* --- 历史记录 --- */
    const detail = `${n}个骰子 · 总和 ${total}`;
    addHistoryEntry("dice", rolls.join(", "), detail);
  };

  /* ---------------- 06 条形码 ---------------- */
  function runBarcode() {
    const err = $("#bcErr"); err.textContent = "";
    const canvas = $("#bcCanvas");
    const fmt = $("#bcFmt").value;
    const text = $("#bcText").value.trim();
    if (!text) { err.textContent = "请输入内容。"; return; }
    let success = false;
    try {
      JsBarcode(canvas, text, {
        format: fmt,
        width: +$("#bcWidth").value,
        height: +$("#bcHeight").value,
        displayValue: $("#bcShowText").checked,
        margin: 12,
        background: "#ffffff",
        lineColor: "#000000",
        font: "monospace",
        fontSize: 16,
        valid: (v) => { if (!v) throw new Error("内容不符合该格式要求"); success = true; },
      });
    } catch (e) {
      err.textContent = "生成失败：" + (e && e.message ? e.message : e);
      return;
    }

    /* --- 历史记录 --- */
    if (success) {
      const fmtLabel = fmt;
      const detail = `${fmtLabel} 格式`;
      addHistoryEntry("barcode", text, detail);
    }
  }
  $("#bcFmt").addEventListener("change", () => {
    const f = $("#bcFmt").value;
    const t = $("#bcText");
    if (f === "EAN13") t.value = "6901234567892";
    else if (f === "EAN8") t.value = "1234567";
    else if (f === "ITF14") t.value = "1234567890123";
    else if (f === "CODE39") t.value = "FREE-TOOLBOX";
    else t.value = "FREE-TOOLBOX-2026";
    runBarcode();
  });
  ["#bcText"].forEach((s) => $(s).addEventListener("input", runBarcode));
  ["#bcWidth", "#bcHeight", "#bcShowText"].forEach((s) => $(s).addEventListener("input", runBarcode));
  $("#bcShowText").addEventListener("change", runBarcode);
  $("#bcDownload").onclick = () => {
    const canvas = $("#bcCanvas");
    canvas.toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "barcode.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  };
  runBarcode();

  /* ---------------- 初始化历史记录 UI ---------------- */
  buildHistoryUI();

  // 所有初始自动生成完成后，开启历史记录
  historyReady = true;
})();
