/* 生活计算器合集 · 纯前端实现（本地计算） · 含计算历史功能 */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  const money = (n) => (isFinite(n) ? n : 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = (n, d = 2) => (isFinite(n) ? n : 0).toLocaleString("zh-CN", { maximumFractionDigits: d });
  const pick = (sel) => $(sel + " .active").dataset.v;
  const stat = (label, value, cls) => `<div class="stat ${cls || ""}"><div class="k">${label}</div><div class="v">${value}</div></div>`;
  const stats = (inner) => `<div class="stats">${inner}</div>`;
  const kv = (k, v) => `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;

  /* =======================================================
   * ==================  计算历史功能  =====================
   * ======================================================= */
  const HISTORY_KEY = "tbx-calc-history";
  const MAX_HISTORY = 50;

  let calcHistory = [];
  let panelOpen = false;
  let historyRecordingEnabled = false;

  /* ---------- 历史数据存取 ---------- */
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        calcHistory = JSON.parse(raw);
        if (!Array.isArray(calcHistory)) calcHistory = [];
      }
    } catch (e) {
      calcHistory = [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(calcHistory));
    } catch (e) {
      /* 存储失败静默处理 */
    }
  }

  function addHistory(entry) {
    if (!historyRecordingEnabled) return;
    entry.ts = Date.now();
    calcHistory.unshift(entry);
    if (calcHistory.length > MAX_HISTORY) {
      calcHistory = calcHistory.slice(0, MAX_HISTORY);
    }
    saveHistory();
    renderHistoryList();
  }

  function deleteHistoryItem(ts) {
    calcHistory = calcHistory.filter((h) => h.ts !== ts);
    saveHistory();
    renderHistoryList();
  }

  function clearAllHistory() {
    if (calcHistory.length === 0) return;
    if (!confirm("确定要清空所有计算历史吗？")) return;
    calcHistory = [];
    saveHistory();
    renderHistoryList();
  }

  /* ---------- 历史面板样式注入 ---------- */
  function injectHistoryStyles() {
    const css = `
      /* ===== 计算历史侧边栏 ===== */
      .hist-toggle {
        position: fixed;
        top: 70px;
        right: 20px;
        z-index: 999;
        background: var(--accent);
        color: var(--accent-ink);
        border: none;
        padding: 10px 18px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 16px -4px rgba(255, 77, 0, 0.5);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .hist-toggle:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px -4px rgba(255, 77, 0, 0.6);
      }
      .hist-toggle:active {
        transform: translateY(0);
      }
      .hist-toggle .badge {
        display: inline-block;
        background: rgba(255,255,255,0.25);
        color: var(--accent-ink);
        border-radius: 999px;
        padding: 1px 7px;
        font-size: 12px;
        margin-left: 6px;
        min-width: 18px;
        text-align: center;
      }

      .hist-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.35);
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s ease, visibility 0.3s ease;
      }
      .hist-overlay.open {
        opacity: 1;
        visibility: visible;
      }

      .hist-panel {
        position: fixed;
        top: 0;
        right: 0;
        width: 360px;
        max-width: 90vw;
        height: 100vh;
        background: var(--bg);
        z-index: 1001;
        transform: translateX(100%);
        transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
        box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
      }
      .hist-panel.open {
        transform: translateX(0);
      }

      .hist-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--line);
        background: var(--bg);
      }
      .hist-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text, #1a1a1a);
      }
      .hist-header h3 small {
        font-weight: 400;
        color: var(--muted);
        font-size: 12px;
        margin-left: 6px;
      }
      .hist-close {
        background: none;
        border: none;
        font-size: 22px;
        color: var(--muted);
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        line-height: 1;
      }
      .hist-close:hover {
        background: var(--accent-soft);
        color: var(--accent);
      }

      .hist-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
      }
      .hist-list::-webkit-scrollbar {
        width: 6px;
      }
      .hist-list::-webkit-scrollbar-thumb {
        background: var(--line-2);
        border-radius: 3px;
      }

      .hist-empty {
        text-align: center;
        color: var(--muted);
        padding: 60px 20px;
        font-size: 14px;
      }
      .hist-empty-icon {
        font-size: 42px;
        margin-bottom: 12px;
        opacity: 0.4;
      }

      .hist-item {
        padding: 12px 20px;
        cursor: pointer;
        border-bottom: 1px solid var(--line);
        position: relative;
        transition: background 0.15s ease;
      }
      .hist-item:hover {
        background: var(--accent-soft);
      }
      .hist-item .hist-mode {
        display: inline-block;
        font-size: 11px;
        color: var(--accent);
        background: var(--accent-soft);
        padding: 2px 8px;
        border-radius: 999px;
        margin-bottom: 6px;
        font-weight: 500;
      }
      .hist-item .hist-expr {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.5;
        word-break: break-all;
        margin-bottom: 4px;
      }
      .hist-item .hist-result {
        font-size: 18px;
        font-weight: 700;
        color: var(--text, #1a1a1a);
        word-break: break-all;
        line-height: 1.4;
      }
      .hist-item .hist-del {
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: var(--muted);
        cursor: pointer;
        font-size: 16px;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.15s, background 0.15s, color 0.15s;
        line-height: 1;
      }
      .hist-item:hover .hist-del {
        opacity: 1;
      }
      .hist-item .hist-del:hover {
        background: rgba(255, 77, 0, 0.15);
        color: var(--accent);
      }

      .hist-footer {
        padding: 12px 20px;
        border-top: 1px solid var(--line);
        display: flex;
        gap: 10px;
        background: var(--bg);
      }
      .hist-footer button {
        flex: 1;
        padding: 10px;
        border: 1px solid var(--line-2);
        background: var(--bg);
        color: var(--text, #1a1a1a);
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
      }
      .hist-footer button:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
      .hist-footer button.danger:hover {
        border-color: #e53e3e;
        color: #e53e3e;
        background: #fff5f5;
      }

      @media (max-width: 640px) {
        .hist-toggle {
          top: auto;
          bottom: 20px;
          right: 16px;
          padding: 12px 20px;
          font-size: 15px;
        }
        .hist-panel {
          width: 100%;
          max-width: 100%;
        }
      }
    `;
    const style = document.createElement("style");
    style.id = "calc-history-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------- 历史面板 DOM 注入 ---------- */
  function injectHistoryPanel() {
    // 悬浮切换按钮
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "hist-toggle";
    toggleBtn.id = "histToggleBtn";
    toggleBtn.innerHTML = '📜 历史<span class="badge" id="histBadge">0</span>';
    toggleBtn.onclick = toggleHistoryPanel;
    document.body.appendChild(toggleBtn);

    // 遮罩层
    const overlay = document.createElement("div");
    overlay.className = "hist-overlay";
    overlay.id = "histOverlay";
    overlay.onclick = closeHistoryPanel;
    document.body.appendChild(overlay);

    // 侧边面板
    const panel = document.createElement("div");
    panel.className = "hist-panel";
    panel.id = "histPanel";
    panel.innerHTML = `
      <div class="hist-header">
        <h3>📜 计算历史 <small id="histCount">0 条</small></h3>
        <button class="hist-close" id="histClose" title="关闭">×</button>
      </div>
      <div class="hist-list" id="histList"></div>
      <div class="hist-footer">
        <button class="danger" id="histClearAll">🗑 清空历史</button>
      </div>
    `;
    document.body.appendChild(panel);

    $("#histClose").onclick = closeHistoryPanel;
    $("#histClearAll").onclick = clearAllHistory;
  }

  /* ---------- 历史列表渲染 ---------- */
  function renderHistoryList() {
    const list = $("#histList");
    const countEl = $("#histCount");
    const badgeEl = $("#histBadge");

    if (badgeEl) badgeEl.textContent = calcHistory.length;
    if (countEl) countEl.textContent = calcHistory.length + " 条";

    if (!list) return;

    if (calcHistory.length === 0) {
      list.innerHTML = `
        <div class="hist-empty">
          <div class="hist-empty-icon">📭</div>
          <div>暂无计算历史</div>
          <div style="font-size:12px;margin-top:6px">每次计算后会自动保存到这里</div>
        </div>
      `;
      return;
    }

    const modeLabels = {
      loan: "房贷",
      tax: "个税",
      bmi: "BMI",
      "date-diff": "日期差",
      "date-add": "日期推算",
      unit: "单位换算",
      interest: "利息",
    };

    list.innerHTML = calcHistory
      .map(
        (h) => `
        <div class="hist-item" data-ts="${h.ts}">
          <button class="hist-del" data-del="${h.ts}" title="删除">×</button>
          <span class="hist-mode">${modeLabels[h.mode] || h.mode}</span>
          <div class="hist-expr">${escapeHtml(h.expr)}</div>
          <div class="hist-result">${escapeHtml(h.result)}</div>
        </div>
      `
      )
      .join("");

    // 绑定点击事件
    $$(".hist-item", list).forEach((el) => {
      el.onclick = (e) => {
        // 点击删除按钮时不触发
        if (e.target.closest(".hist-del")) return;
        const ts = +el.dataset.ts;
        const entry = calcHistory.find((h) => h.ts === ts);
        if (entry) applyHistoryItem(entry);
      };
    });
    $$(".hist-del", list).forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const ts = +btn.dataset.del;
        deleteHistoryItem(ts);
      };
    });
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  /* ---------- 面板开关 ---------- */
  function toggleHistoryPanel() {
    if (panelOpen) closeHistoryPanel();
    else openHistoryPanel();
  }

  function openHistoryPanel() {
    panelOpen = true;
    $("#histOverlay").classList.add("open");
    $("#histPanel").classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeHistoryPanel() {
    panelOpen = false;
    $("#histOverlay").classList.remove("open");
    $("#histPanel").classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ---------- 应用历史记录（恢复计算器状态并重新计算） ---------- */
  function applyHistoryItem(entry) {
    const data = entry.data || {};

    // 切换到对应 tab
    const tabMap = {
      loan: "loan",
      tax: "tax",
      bmi: "bmi",
      "date-diff": "date",
      "date-add": "date",
      unit: "unit",
      interest: "interest",
    };
    const targetTab = tabMap[entry.mode];
    if (targetTab) {
      const tabBtn = $(`#calcTabs .tab[data-tab="${targetTab}"]`);
      if (tabBtn) tabBtn.click();
    }

    // 根据模式恢复输入并计算
    setTimeout(() => {
      switch (entry.mode) {
        case "loan":
          if (data.amount != null) $("#loanAmount").value = data.amount;
          if (data.rate != null) $("#loanRate").value = data.rate;
          if (data.years != null) $("#loanYears").value = data.years;
          if (data.type) {
            const btn = $(`#loanType button[data-v="${data.type}"]`);
            if (btn) btn.click();
          }
          $("#calcLoanBtn").click();
          break;
        case "tax":
          if (data.income != null) $("#taxIncome").value = data.income;
          if (data.social != null) $("#taxSocial").value = data.social;
          if (data.extra != null) $("#taxExtra").value = data.extra;
          $("#calcTaxBtn").click();
          break;
        case "bmi":
          if (data.height != null) $("#bmiH").value = data.height;
          if (data.weight != null) $("#bmiW").value = data.weight;
          $("#calcBmiBtn").click();
          break;
        case "date-diff":
          if (data.dateA) $("#dateA").value = data.dateA;
          if (data.dateB) $("#dateB").value = data.dateB;
          if (data.workOnly != null) $("#dateWork").checked = data.workOnly;
          $("#calcDiffBtn").click();
          break;
        case "date-add":
          if (data.base) $("#dateBase").value = data.base;
          if (data.days != null) $("#dateAdd").value = data.days;
          $("#calcAddBtn").click();
          break;
        case "unit":
          if (data.cat) {
            $("#unitCat").value = data.cat;
            loadUnitOptions(); // 重新加载选项
          }
          if (data.val != null) $("#unitVal").value = data.val;
          if (data.from) $("#unitFrom").value = data.from;
          if (data.to) $("#unitTo").value = data.to;
          $("#calcUnitBtn").click();
          break;
        case "interest":
          if (data.principal != null) $("#intP").value = data.principal;
          if (data.rate != null) $("#intR").value = data.rate;
          if (data.years != null) $("#intT").value = data.years;
          if (data.mode) {
            const btn = $(`#intMode button[data-v="${data.mode}"]`);
            if (btn) btn.click();
          }
          if (data.freq) {
            const btn = $(`#intFreq button[data-v="${data.freq}"]`);
            if (btn) btn.click();
          }
          $("#calcIntBtn").click();
          break;
      }
      closeHistoryPanel();
    }, 50);
  }

  /* ---------- 历史功能初始化 ---------- */
  function initHistory() {
    loadHistory();
    injectHistoryStyles();
    injectHistoryPanel();
    renderHistoryList();

    // ESC 键关闭
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panelOpen) closeHistoryPanel();
    });
  }

  /* ---------------- tabs ---------------- */
  function initTabs() {
    $$("#calcTabs .tab").forEach((b) => {
      b.onclick = () => {
        $$("#calcTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
        $$(".calc-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
      };
    });
  }
  function seg(sel) {
    const root = $(sel);
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("button", root).forEach((x) => x.classList.toggle("active", x === b));
    });
  }

  /* ================= 房贷 ================= */
  let loanData = null;
  function calcLoan() {
    const P = (+$("#loanAmount").value || 0) * 10000;
    const annual = (+$("#loanRate").value || 0) / 100;
    const years = +$("#loanYears").value || 0;
    const n = Math.round(years * 12);
    const r = annual / 12;
    const type = pick("#loanType");
    const out = $("#loanOut");
    if (!(P > 0) || !(n > 0)) { out.innerHTML = '<div class="err">请输入有效的贷款金额和年限。</div>'; return; }

    let rows = [], totalPay = 0, totalInterest = 0, firstPay = 0, lastPay = 0, monthly = 0;

    if (type === "equal") {
      monthly = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      let bal = P;
      for (let i = 1; i <= n; i++) {
        const int = bal * r;
        let prin = monthly - int;
        bal = Math.max(0, bal - prin);
        rows.push({ i, pay: monthly, prin, int, bal });
      }
      totalPay = monthly * n;
      totalInterest = totalPay - P;
      firstPay = lastPay = monthly;
    } else {
      const prinEach = P / n;
      let bal = P;
      for (let i = 1; i <= n; i++) {
        const int = bal * r;
        const pay = prinEach + int;
        bal = Math.max(0, bal - prinEach);
        rows.push({ i, pay, prin: prinEach, int, bal });
      }
      firstPay = prinEach + P * r;
      lastPay = prinEach + prinEach * r;
      totalPay = P + (P * r * (n + 1)) / 2;
      totalInterest = totalPay - P;
    }
    loanData = rows;

    const ratio = P > 0 ? (totalInterest / P) * 100 : 0;
    let head;
    if (type === "equal") {
      head = stats(
        stat("每月月供", "¥" + money(monthly), "hero-stat") +
        stat("总利息", "¥" + money(totalInterest)) +
        stat("还款总额", "¥" + money(totalPay)) +
        stat("利息 / 本金", num(ratio, 1) + "%")
      );
    } else {
      head = stats(
        stat("首月月供", "¥" + money(firstPay), "hero-stat") +
        stat("末月月供", "¥" + money(lastPay)) +
        stat("总利息", "¥" + money(totalInterest)) +
        stat("利息 / 本金", num(ratio, 1) + "%")
      );
    }
    out.innerHTML =
      head +
      `<div class="btn-row" style="margin-top:14px"><button class="btn" id="loanToggle">展开全部 ${n} 期还款明细</button></div>` +
      `<div id="loanTable"></div>`;
    renderLoanTable(12);
    $("#loanToggle").onclick = (e) => {
      const expanded = e.target.dataset.exp === "1";
      renderLoanTable(expanded ? 12 : rows.length);
      e.target.dataset.exp = expanded ? "0" : "1";
      e.target.textContent = expanded ? `展开全部 ${n} 期还款明细` : "收起明细";
    };

    // 记录到历史
    const amountWan = (+$("#loanAmount").value || 0);
    const rateVal = (+$("#loanRate").value || 0);
    const yearsVal = +$("#loanYears").value || 0;
    const typeLabel = type === "equal" ? "等额本息" : "等额本金";
    addHistory({
      mode: "loan",
      expr: `${amountWan}万 · ${rateVal}% · ${yearsVal}年 · ${typeLabel}`,
      result: type === "equal"
        ? "月供 ¥" + money(monthly)
        : "首月 ¥" + money(firstPay),
      data: {
        amount: amountWan,
        rate: rateVal,
        years: yearsVal,
        type: type,
      },
    });
  }
  function renderLoanTable(count) {
    const rows = loanData;
    const head = `<div class="table-wrap"><table><thead><tr><th>期数</th><th>月供</th><th>本金</th><th>利息</th><th>剩余本金</th></tr></thead><tbody>`;
    const body = rows.slice(0, count).map((x) =>
      `<tr><td>${x.i}</td><td>${money(x.pay)}</td><td>${money(x.prin)}</td><td>${money(x.int)}</td><td>${money(x.bal)}</td></tr>`
    ).join("");
    $("#loanTable").innerHTML = head + body + "</tbody></table></div>" +
      (count < rows.length ? `<div class="hint" style="margin-top:8px">仅显示前 ${count} 期，点击上方按钮查看全部。</div>` : "");
  }

  /* ================= 个税 ================= */
  const MONTHLY = [
    { cap: 3000, rate: 0.03, ded: 0 }, { cap: 12000, rate: 0.1, ded: 210 },
    { cap: 25000, rate: 0.2, ded: 1410 }, { cap: 35000, rate: 0.25, ded: 2660 },
    { cap: 55000, rate: 0.3, ded: 4410 }, { cap: 80000, rate: 0.35, ded: 7160 },
    { cap: Infinity, rate: 0.45, ded: 15160 },
  ];
  const ANNUAL = [
    { cap: 36000, rate: 0.03, ded: 0 }, { cap: 144000, rate: 0.1, ded: 2520 },
    { cap: 300000, rate: 0.2, ded: 16920 }, { cap: 420000, rate: 0.25, ded: 31920 },
    { cap: 660000, rate: 0.3, ded: 52920 }, { cap: 960000, rate: 0.35, ded: 85920 },
    { cap: Infinity, rate: 0.45, ded: 181920 },
  ];
  const bracket = (x, t) => { if (x <= 0) return 0; for (const b of t) if (x <= b.cap) return Math.max(0, x * b.rate - b.ded); return 0; };

  function calcTax() {
    const income = +$("#taxIncome").value || 0;
    const social = +$("#taxSocial").value || 0;
    const extra = +$("#taxExtra").value || 0;
    const base = income - 5000 - social - extra;
    const taxableM = Math.max(0, base);
    const taxM = bracket(taxableM, MONTHLY);
    const annualTaxable = Math.max(0, base * 12);
    const taxY = bracket(annualTaxable, ANNUAL);
    const take = income - social - taxM;
    const rate = income > 0 ? ((social + taxM) / income) * 100 : 0;
    $("#taxOut").innerHTML =
      stats(
        stat("每月个税", "¥" + money(taxM), "hero-stat") +
        stat("税后到手", "¥" + money(take)) +
        stat("全年个税", "¥" + money(taxY)) +
        stat("综合扣缴占比", num(rate, 1) + "%")
      ) +
      `<div style="margin-top:14px">
        ${kv("税前月收入", "¥" + money(income))}
        ${kv("五险一金", "−¥" + money(social))}
        ${kv("起征点", "−¥" + money(5000))}
        ${kv("专项附加扣除", "−¥" + money(extra))}
        ${kv("应纳税所得额（月）", "¥" + money(taxableM))}
      </div>
      <div class="note">本结果按月度预扣税率估算；实际采用累计预扣法，全年个税按年度综合所得税率汇算，年底多退少补。</div>`;

    // 记录到历史（仅在有有效收入时）
    if (income > 0) {
      addHistory({
        mode: "tax",
        expr: `月收入 ¥${money(income)} · 社保 ¥${money(social)} · 专项 ¥${money(extra)}`,
        result: "每月个税 ¥" + money(taxM),
        data: {
          income: income,
          social: social,
          extra: extra,
        },
      });
    }
  }

  /* ================= BMI ================= */
  function calcBmi() {
    const h = (+$("#bmiH").value || 0) / 100;
    const w = +$("#bmiW").value || 0;
    const out = $("#bmiOut");
    if (!(h > 0) || !(w > 0)) { out.innerHTML = '<div class="err">请输入有效的身高和体重。</div>'; return; }
    const bmi = w / (h * h);
    let label, color;
    if (bmi < 18.5) { label = "偏瘦"; color = "#3b82f6"; }
    else if (bmi < 24) { label = "正常"; color = "var(--ok)"; }
    else if (bmi < 28) { label = "超重"; color = "#f59e0b"; }
    else { label = "肥胖"; color = "var(--danger)"; }
    const lo = 18.5 * h * h, hi = 23.9 * h * h;
    out.innerHTML =
      stats(
        `<div class="stat hero-stat"><div class="k">BMI</div><div class="v">${bmi.toFixed(1)}</div></div>` +
        `<div class="stat"><div class="k">评价</div><div class="v" style="color:${color}">${label}</div></div>` +
        stat("理想体重范围", num(lo, 1) + "–" + num(hi, 1) + " <small>kg</small>")
      ) +
      `<div class="note">参考中国成人标准：&lt;18.5 偏瘦 · 18.5–23.9 正常 · 24–27.9 超重 · ≥28 肥胖。BMI 未区分肌肉与脂肪，仅供参考。</div>`;

    // 记录到历史
    addHistory({
      mode: "bmi",
      expr: `身高 ${$("#bmiH").value}cm · 体重 ${$("#bmiW").value}kg`,
      result: "BMI " + bmi.toFixed(1) + "（" + label + "）",
      data: {
        height: +$("#bmiH").value,
        weight: +$("#bmiW").value,
      },
    });
  }

  /* ================= 日期 ================= */
  const WD = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function calcDiff() {
    const a = $("#dateA").value, b = $("#dateB").value;
    const out = $("#dateDiffOut");
    if (!a || !b) { out.innerHTML = '<div class="err">请选择两个日期。</div>'; return; }
    let d1 = parseDate(a), d2 = parseDate(b);
    const sign = d2 < d1 ? -1 : 1;
    if (sign < 0) { const t = d1; d1 = d2; d2 = t; }
    const days = Math.round((d2 - d1) / 86400000);
    let work = 0;
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
      const g = d.getDay(); if (g !== 0 && g !== 6) work++;
    }
    const only = $("#dateWork").checked;
    out.innerHTML = stats(
      stat("相差天数", (sign < 0 ? "−" : "") + num(days, 0) + " <small>天</small>", "hero-stat") +
      stat("约等于", num(days / 7, 1) + " <small>周</small>") +
      (only ? stat("工作日", num(work, 0) + " <small>天</small>") : stat("约等于", num(days / 30.44, 1) + " <small>个月</small>"))
    );

    // 记录到历史
    addHistory({
      mode: "date-diff",
      expr: `${a} → ${b}${only ? "（工作日）" : ""}`,
      result: (sign < 0 ? "−" : "") + num(days, 0) + " 天",
      data: {
        dateA: a,
        dateB: b,
        workOnly: only,
      },
    });
  }
  function calcAdd() {
    const base = $("#dateBase").value, n = parseInt($("#dateAdd").value, 10) || 0;
    const out = $("#dateAddOut");
    if (!base) { out.innerHTML = '<div class="err">请选择基准日期。</div>'; return; }
    const d = parseDate(base);
    d.setDate(d.getDate() + n);
    out.innerHTML = stats(
      stat(n >= 0 ? `加 ${n} 天后` : `减 ${Math.abs(n)} 天后`, ymd(d) + " <small>" + WD[d.getDay()] + "</small>", "hero-stat")
    );

    // 记录到历史
    addHistory({
      mode: "date-add",
      expr: `${base} ${n >= 0 ? "+" : ""}${n}天`,
      result: ymd(d) + " " + WD[d.getDay()],
      data: {
        base: base,
        days: n,
      },
    });
  }

  /* ================= 单位换算 ================= */
  const UNITS = {
    长度: { "毫米 (mm)": 0.001, "厘米 (cm)": 0.01, "米 (m)": 1, "千米 (km)": 1000, "英寸 (in)": 0.0254, "英尺 (ft)": 0.3048, "英里 (mi)": 1609.344, "海里 (nmi)": 1852 },
    面积: { "平方米 (m²)": 1, "平方厘米 (cm²)": 0.0001, "平方千米 (km²)": 1e6, "公顷 (ha)": 10000, "亩": 666.6666667, "平方英尺 (ft²)": 0.09290304, "平方英里 (mi²)": 2589988.11 },
    质量: { "毫克 (mg)": 1e-6, "克 (g)": 0.001, "千克 (kg)": 1, "吨 (t)": 1000, "斤": 0.5, "两": 0.05, "磅 (lb)": 0.45359237, "盎司 (oz)": 0.0283495231 },
    体积: { "毫升 (mL)": 0.001, "升 (L)": 1, "立方米 (m³)": 1000, "立方英尺 (ft³)": 28.3168466, "加仑 (US gal)": 3.785411784 },
    数据: { "字节 (B)": 1, "KB": 1024, "MB": 1048576, "GB": 1073741824, "TB": 1099511627776, "PB": 1125899906842624 },
  };
  const TEMPS = { "摄氏度 (°C)": "C", "华氏度 (°F)": "F", "开尔文 (K)": "K" };
  const toC = (v, u) => (u === "C" ? v : u === "F" ? (v - 32) * 5 / 9 : v - 273.15);
  const fromC = (c, u) => (u === "C" ? c : u === "F" ? c * 9 / 5 + 32 : c + 273.15);

  function fillUnits() {
    const cat = $("#unitCat");
    cat.innerHTML = Object.keys(UNITS).map((k) => `<option>${k}</option>`).join("") + '<option>温度</option>';
    cat.onchange = () => loadUnitOptions();
    loadUnitOptions();
  }
  function loadUnitOptions() {
    const cat = $("#unitCat").value;
    const map = cat === "温度" ? TEMPS : UNITS[cat];
    const keys = Object.keys(map);
    $("#unitFrom").innerHTML = keys.map((k) => `<option>${k}</option>`).join("");
    $("#unitTo").innerHTML = keys.map((k) => `<option>${k}</option>`).join("");
    let base = keys.findIndex((k) => map[k] === 1);
    if (base < 0) base = 0;
    $("#unitFrom").selectedIndex = base;
    const to = keys.findIndex((k, i) => i !== base);
    $("#unitTo").selectedIndex = to < 0 ? 0 : to;
  }
  function calcUnit() {
    const cat = $("#unitCat").value;
    const v = parseFloat($("#unitVal").value);
    const from = $("#unitFrom").value, to = $("#unitTo").value;
    const out = $("#unitOut");
    if (!isFinite(v)) { out.innerHTML = '<div class="err">请输入数值。</div>'; return; }
    let res;
    if (cat === "温度") {
      res = fromC(toC(v, TEMPS[from]), TEMPS[to]);
    } else {
      const unitMap = UNITS[cat];
      if (!unitMap || unitMap[from] == null || unitMap[to] == null || unitMap[to] === 0) {
        out.innerHTML = '<div class="err">单位无效。</div>'; return;
      }
      res = (v * unitMap[from]) / unitMap[to];
    }
    out.innerHTML = stats(
      stat(num(v, 6) + " " + from.split(" ")[0], "=", "") +
      stat(`结果`, num(res, 6) + " <small>" + to.split(" ")[0] + "</small>", "hero-stat")
    );

    // 记录到历史
    addHistory({
      mode: "unit",
      expr: `${num(v, 6)} ${from} → ${to}`,
      result: num(res, 6) + " " + to.split(" ")[0],
      data: {
        cat: cat,
        val: v,
        from: from,
        to: to,
      },
    });
  }

  /* ================= 利息 ================= */
  function calcInterest() {
    const P = +$("#intP").value || 0;
    const r = (+$("#intR").value || 0) / 100;
    const t = +$("#intT").value || 0;
    const mode = pick("#intMode");
    const freqVal = pick("#intFreq");
    const freq = parseFloat(freqVal);
    let A;
    if (mode === "simple") {
      A = P * (1 + r * t);
    } else {
      // 复利：防止 freq 为 0 或非正数导致除零
      if (!isFinite(freq) || freq <= 0) {
        A = P * Math.pow(1 + r, t); // 默认按年复利
      } else {
        A = P * Math.pow(1 + r / freq, freq * t);
      }
    }
    const interest = A - P;
    const growth = P > 0 ? (interest / P) * 100 : 0;
    $("#intOut").innerHTML =
      stats(
        stat("到期总额", "¥" + money(A), "hero-stat") +
        stat("利息收益", "¥" + money(interest)) +
        stat("收益率", num(growth, 2) + "%")
      ) +
      `<div style="margin-top:14px">
        ${kv("本金", "¥" + money(P))}
        ${kv("计息方式", mode === "simple" ? "单利" : `复利（每年 ${freq} 次）`)}
        ${kv("年限", num(t, 0) + " 年")}
      </div>
      <div class="note">用于估算存款收益或贷款成本。实际以银行条款为准，未考虑税费、通货膨胀等因素。</div>`;

    // 记录到历史（仅在本金大于 0 时）
    if (P > 0) {
      const freqLabel = {
        "1": "按年", "4": "按季", "12": "按月", "365": "按日"
      }[freqVal] || freqVal;
      const modeLabel = mode === "simple" ? "单利" : `复利(${freqLabel})`;
      addHistory({
        mode: "interest",
        expr: `¥${money(P)} · ${$("#intR").value}% · ${t}年 · ${modeLabel}`,
        result: "到期 ¥" + money(A),
        data: {
          principal: P,
          rate: +$("#intR").value,
          years: t,
          mode: mode,
          freq: freqVal,
        },
      });
    }
  }

  /* ================= init ================= */
  function init() {
    initTabs();
    seg("#loanType"); seg("#intMode"); seg("#intFreq");
    fillUnits();
    // default dates
    const today = new Date();
    $("#dateA").value = ymd(today);
    const b = new Date(today); b.setDate(b.getDate() + 100);
    $("#dateB").value = ymd(b);
    $("#dateBase").value = ymd(today);

    $("#calcLoanBtn").onclick = calcLoan;
    $("#calcTaxBtn").onclick = calcTax;
    $("#calcBmiBtn").onclick = calcBmi;
    $("#calcDiffBtn").onclick = calcDiff;
    $("#calcAddBtn").onclick = calcAdd;
    $("#calcUnitBtn").onclick = calcUnit;
    $("#calcIntBtn").onclick = calcInterest;
    $("#dateWork").onchange = calcDiff;

    // 初始化历史记录功能
    initHistory();

    // live results for simple ones
    // 注意：首次自动计算不记入历史，避免污染（historyRecordingEnabled 此时为 false）
    $("#calcLoanBtn").click();
    $("#calcTaxBtn").click();
    $("#calcBmiBtn").click();
    $("#calcDiffBtn").click();
    $("#calcAddBtn").click();
    $("#calcUnitBtn").click();
    $("#calcIntBtn").click();
    // 初始计算完成后，启用历史记录
    historyRecordingEnabled = true;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
