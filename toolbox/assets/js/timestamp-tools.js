/* 时间戳转换工具 · 纯前端实现 */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  const pad2 = (n) => String(n).padStart(2, "0");
  const pad3 = (n) => String(n).padStart(3, "0");

  /* ---------------- 复制到剪贴板 ---------------- */
  function copy(text, btn) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        const t = btn.textContent;
        btn.textContent = "已复制";
        setTimeout(() => (btn.textContent = t), 1200);
      }
    }, () => {
      alert("复制失败，请手动选择复制。");
    });
  }

  /* ---------------- 时区偏移计算 ---------------- */
  // 常用时区偏移（分钟），正数表示东时区
  const TZ_OFFSETS = {
    "Asia/Shanghai": 480,    // UTC+8
    "UTC": 0,                // UTC+0
    "Asia/Tokyo": 540,       // UTC+9
    "America/New_York": -300, // UTC-5 (EST, 不考虑夏令时简化)
    "Europe/London": 0       // UTC+0
  };

  // 尝试使用 Intl.DateTimeFormat 获取准确时区时间
  function formatInTimezone(date, tz) {
    try {
      const dtf = new Intl.DateTimeFormat("zh-CN", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      const parts = dtf.formatToParts(date);
      const get = (type) => parts.find(p => p.type === type)?.value || "00";
      return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
    } catch (e) {
      // 降级：手动计算偏移
      const offset = TZ_OFFSETS[tz] || 0;
      const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
      const tzDate = new Date(utcMs + offset * 60000);
      return `${tzDate.getFullYear()}-${pad2(tzDate.getMonth() + 1)}-${pad2(tzDate.getDate())} ${pad2(tzDate.getHours())}:${pad2(tzDate.getMinutes())}:${pad2(tzDate.getSeconds())}`;
    }
  }

  // 从指定时区的日期时间字符串解析为 Date 对象
  function parseFromTimezone(dateStr, tz) {
    // dateStr 格式: "YYYY-MM-DDTHH:mm"
    if (!dateStr) return null;
    const [datePart, timePart] = dateStr.split("T");
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split("-").map(Number);
    const [h, min] = timePart.split(":").map(Number);
    if ([y, m, d, h, min].some(n => isNaN(n))) return null;

    // 构造该时区下的时间戳
    // 先假设是 UTC，再根据时区偏移调整
    const utcDate = Date.UTC(y, m - 1, d, h, min, 0);
    try {
      // 使用 Intl 来精确计算
      // 先创建一个"看起来像"目标时区时间的 Date
      const testDate = new Date(utcDate);
      // 计算目标时区与 UTC 的实际偏移（考虑夏令时等）
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
      });
      const parts = dtf.formatToParts(testDate);
      const get = (type) => parseInt(parts.find(p => p.type === type)?.value || "0", 10);
      const tzY = get("year"), tzM = get("month"), tzD = get("day");
      const tzH = get("hour"), tzMin = get("minute"), tzS = get("second");
      // 重新构造 UTC 时间，使目标时区显示为输入时间
      // 用二分法或直接计算：我们需要找到一个 UTC 时间，使得在 tz 时区显示为输入值
      const diffMs = (y - tzY) * 365.25 * 86400000 + (m - tzM) * 30 * 86400000 +
        (d - tzD) * 86400000 + (h - tzH) * 3600000 + (min - tzMin) * 60000 - tzS * 1000;
      return new Date(testDate.getTime() + diffMs);
    } catch (e) {
      // 降级方案
      const offset = TZ_OFFSETS[tz] || 0;
      return new Date(utcDate - offset * 60000);
    }
  }

  /* ---------------- 防抖 ---------------- */
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /* ---------------- Tabs ---------------- */
  $$("#tsTabs .tab").forEach((b) => {
    b.onclick = () => {
      $$("#tsTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".ts-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
    };
  });

  /* ============================================================
     01 时间戳转日期
     ============================================================ */
  function detectTsUnit(ts) {
    // 自动识别秒或毫秒
    // 秒级时间戳范围约 1e9 ~ 2e9 (2001-2033)
    // 毫秒级时间戳范围约 1e12 ~ 2e12
    const abs = Math.abs(ts);
    if (abs >= 1e12) return "ms";
    if (abs >= 1e9) return "s";
    // 较小的值默认按秒处理
    return "s";
  }

  function convertTsToDate() {
    const input = $("#tsInput").value.trim();
    const errEl = $("#tsError");

    if (!input) {
      clearTsOutputs();
      errEl.classList.add("hidden");
      return;
    }

    const ts = Number(input);
    if (!isFinite(ts)) {
      showTsError("请输入有效的数字时间戳");
      return;
    }

    const unit = detectTsUnit(ts);
    const msTs = unit === "s" ? ts * 1000 : ts;
    const date = new Date(msTs);

    if (isNaN(date.getTime())) {
      showTsError("无效的时间戳");
      return;
    }

    errEl.classList.add("hidden");

    // 北京时间
    $("#tsBeijing").value = formatInTimezone(date, "Asia/Shanghai");
    // UTC 时间
    $("#tsUtc").value = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
    // ISO 8601
    $("#tsIso").value = date.toISOString();
    // 所选时区
    const tz = $("#tsTimezone").value;
    $("#tsTzTime").value = formatInTimezone(date, tz);
  }

  function clearTsOutputs() {
    $("#tsBeijing").value = "";
    $("#tsUtc").value = "";
    $("#tsIso").value = "";
    $("#tsTzTime").value = "";
  }

  function showTsError(msg) {
    const errEl = $("#tsError");
    errEl.textContent = msg;
    errEl.classList.remove("hidden");
    clearTsOutputs();
  }

  const debouncedConvertTs = debounce(convertTsToDate, 150);

  $("#tsInput").addEventListener("input", debouncedConvertTs);
  $("#tsTimezone").addEventListener("change", convertTsToDate);

  // 获取当前时间戳
  $("#tsNowBtn").addEventListener("click", () => {
    const now = Math.floor(Date.now() / 1000);
    $("#tsInput").value = String(now);
    convertTsToDate();
  });

  /* ============================================================
     02 日期转时间戳
     ============================================================ */
  function convertDateToTs() {
    const dateVal = $("#dateInput").value;
    const tz = $("#dateTimezone").value;

    if (!dateVal) {
      $("#tsSeconds").value = "";
      $("#tsMilliseconds").value = "";
      $("#dateIso").value = "";
      return;
    }

    const date = parseFromTimezone(dateVal, tz);
    if (!date || isNaN(date.getTime())) {
      return;
    }

    const ms = date.getTime();
    $("#tsSeconds").value = String(Math.floor(ms / 1000));
    $("#tsMilliseconds").value = String(ms);
    $("#dateIso").value = date.toISOString();
  }

  const debouncedConvertDate = debounce(convertDateToTs, 150);

  $("#dateInput").addEventListener("input", debouncedConvertDate);
  $("#dateTimezone").addEventListener("change", convertDateToTs);

  // 使用当前时间
  $("#dateNowBtn").addEventListener("click", () => {
    const tz = $("#dateTimezone").value;
    const now = new Date();
    const localStr = formatInTimezone(now, tz).replace(" ", "T").slice(0, 16);
    $("#dateInput").value = localStr;
    convertDateToTs();
  });

  /* ============================================================
     03 常用时间参考
     ============================================================ */
  function getBeijingDate(date) {
    // 获取北京时间下的年月日
    const str = formatInTimezone(date, "Asia/Shanghai");
    const [datePart] = str.split(" ");
    const [y, m, d] = datePart.split("-").map(Number);
    return { y, m, d, str };
  }

  function beijingDateToTs(y, m, d, h = 0, min = 0, s = 0) {
    // 构造北京时间的 Date 对象
    // 北京时间 = UTC + 8小时
    const utcMs = Date.UTC(y, m - 1, d, h, min, s) - 8 * 3600000;
    return new Date(utcMs);
  }

  function startOfTodayBeijing() {
    const { y, m, d } = getBeijingDate(new Date());
    return beijingDateToTs(y, m, d, 0, 0, 0);
  }

  function endOfTodayBeijing() {
    const { y, m, d } = getBeijingDate(new Date());
    return beijingDateToTs(y, m, d, 23, 59, 59);
  }

  function startOfYesterdayBeijing() {
    const today = startOfTodayBeijing();
    return new Date(today.getTime() - 86400000);
  }

  function endOfYesterdayBeijing() {
    const today = startOfTodayBeijing();
    return new Date(today.getTime() - 1000);
  }

  function startOfWeekBeijing() {
    // 本周一为起点
    const { y, m, d } = getBeijingDate(new Date());
    const today = beijingDateToTs(y, m, d);
    const dayOfWeek = today.getUTCDay(); // 0=周日, 1=周一, ...
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return new Date(today.getTime() - diff * 86400000);
  }

  function endOfWeekBeijing() {
    const start = startOfWeekBeijing();
    return new Date(start.getTime() + 7 * 86400000 - 1000);
  }

  function startOfMonthBeijing() {
    const { y, m } = getBeijingDate(new Date());
    return beijingDateToTs(y, m, 1, 0, 0, 0);
  }

  function endOfMonthBeijing() {
    const { y, m } = getBeijingDate(new Date());
    // 下月第一天减一秒
    if (m === 12) {
      return new Date(beijingDateToTs(y + 1, 1, 1).getTime() - 1000);
    }
    return new Date(beijingDateToTs(y, m + 1, 1).getTime() - 1000);
  }

  function startOfYearBeijing() {
    const { y } = getBeijingDate(new Date());
    return beijingDateToTs(y, 1, 1, 0, 0, 0);
  }

  function endOfYearBeijing() {
    const { y } = getBeijingDate(new Date());
    return beijingDateToTs(y, 12, 31, 23, 59, 59);
  }

  function renderReferenceTable() {
    const refs = [
      { label: "今天开始", date: startOfTodayBeijing() },
      { label: "今天结束", date: endOfTodayBeijing() },
      { label: "昨天开始", date: startOfYesterdayBeijing() },
      { label: "昨天结束", date: endOfYesterdayBeijing() },
      { label: "本周开始（周一）", date: startOfWeekBeijing() },
      { label: "本周结束（周日）", date: endOfWeekBeijing() },
      { label: "本月开始", date: startOfMonthBeijing() },
      { label: "本月结束", date: endOfMonthBeijing() },
      { label: "本年开始", date: startOfYearBeijing() },
      { label: "本年结束", date: endOfYearBeijing() }
    ];

    const container = $("#refTable");
    container.innerHTML = refs.map((r, i) => {
      const tsSec = Math.floor(r.date.getTime() / 1000);
      const dateStr = formatInTimezone(r.date, "Asia/Shanghai");
      return `
        <div class="ref-row">
          <div class="ref-label">${r.label}</div>
          <div class="ref-date">${dateStr}</div>
          <div class="ref-ts">${tsSec}</div>
          <button class="btn ghost ref-copy" data-ts="${tsSec}">复制</button>
        </div>
      `;
    }).join("");

    // 绑定复制按钮
    $$(".ref-copy").forEach((btn) => {
      btn.onclick = () => copy(btn.dataset.ts, btn);
    });
  }

  /* ============================================================
     复制按钮绑定
     ============================================================ */
  $$("[data-copy]").forEach((btn) => {
    btn.onclick = () => {
      const targetId = btn.dataset.copy;
      const input = document.getElementById(targetId);
      if (input) copy(input.value, btn);
    };
  });

  /* ============================================================
     初始化
     ============================================================ */
  function init() {
    // 默认填充当前时间戳
    const now = Math.floor(Date.now() / 1000);
    $("#tsInput").value = String(now);
    convertTsToDate();

    // 日期转时间戳默认填充当前时间
    const nowDate = new Date();
    const beijingNow = formatInTimezone(nowDate, "Asia/Shanghai").replace(" ", "T").slice(0, 16);
    $("#dateInput").value = beijingNow;
    convertDateToTs();

    // 渲染参考表
    renderReferenceTable();
  }

  init();
})();
