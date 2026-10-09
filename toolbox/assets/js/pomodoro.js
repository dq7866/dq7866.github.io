/* 番茄钟工具 · 纯前端实现 */
(function () {
  "use strict";

  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  const pad2 = (n) => String(n).padStart(2, "0");

  /* ============================================================
     常量与默认配置
     ============================================================ */
  const STORAGE_KEY = "tbx-pomodoro";
  const HISTORY_KEY = "tbx-pomodoro-history";

  const DEFAULT_SETTINGS = {
    focusDuration: 25,
    shortDuration: 5,
    longDuration: 15,
    longBreakInterval: 4,
    autoStart: false,
    soundEnabled: true
  };

  const MODE_LABELS = {
    focus: "专注时间",
    short: "短休息",
    long: "长休息"
  };

  const MODE_CLASSES = {
    focus: "",
    short: "mode-short",
    long: "mode-long"
  };

  /* ============================================================
     状态管理
     ============================================================ */
  let settings = { ...DEFAULT_SETTINGS };
  let currentMode = "focus";
  let timeLeft = 0; // 秒
  let totalTime = 0; // 秒
  let isRunning = false;
  let timerInterval = null;
  let completedPomodoros = 0; // 当前周期已完成的番茄数
  let currentCyclePomodoros = 0; // 当前周期计数（用于判断长休息）

  /* ============================================================
     localStorage 操作
     ============================================================ */
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      showToast("设置已保存");
    } catch (e) {
      showToast("保存失败");
    }
  }

  function loadHistory() {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
      // ignore
    }
  }

  /* ============================================================
     提示音（Web Audio API）
     ============================================================ */
  let audioCtx = null;

  function playBeep() {
    if (!settings.soundEnabled) return;

    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      // 播放三段式提示音
      const now = audioCtx.currentTime;
      const frequencies = [800, 1000, 1200];

      frequencies.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = "sine";
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0, now + i * 0.2);
        gain.gain.linearRampToValueAtTime(0.3, now + i * 0.2 + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + i * 0.2 + 0.18);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now + i * 0.2);
        osc.stop(now + i * 0.2 + 0.2);
      });
    } catch (e) {
      // 忽略音频错误
    }
  }

  /* ============================================================
     计时器核心逻辑
     ============================================================ */
  function getModeDuration(mode) {
    switch (mode) {
      case "focus": return settings.focusDuration * 60;
      case "short": return settings.shortDuration * 60;
      case "long": return settings.longDuration * 60;
      default: return settings.focusDuration * 60;
    }
  }

  function setMode(mode) {
    if (isRunning) {
      if (!confirm("计时正在进行中，切换模式将重置当前计时，确定吗？")) {
        return;
      }
      stopTimer();
    }

    currentMode = mode;
    totalTime = getModeDuration(mode);
    timeLeft = totalTime;

    updateDisplay();
    updateModeTabs();
    updateRingClass();
  }

  function startTimer() {
    if (isRunning) return;

    // 首次播放时激活 AudioContext（解决浏览器自动播放策略）
    if (settings.soundEnabled && audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    isRunning = true;
    $("#startBtn").textContent = "暂停";
    $("#startBtn").classList.remove("primary");
    $("#startBtn").classList.add("btn");
    let lastTick = Date.now();

    timerInterval = setInterval(() => {
      const now = Date.now();
      const delta = Math.floor((now - lastTick) / 1000);
      if (delta >= 1) { timeLeft -= delta; lastTick = now - (now - lastTick) % 1000; }
      updateDisplay();

      if (timeLeft <= 0) {
        stopTimer();
        onTimerComplete();
      }
    }, 1000);
  }

  function pauseTimer() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    $("#startBtn").textContent = "继续";
    $("#startBtn").classList.add("primary");
  }

  function stopTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    $("#startBtn").textContent = "开始";
    $("#startBtn").classList.add("primary");
  }

  function resetTimer() {
    stopTimer();
    timeLeft = totalTime;
    updateDisplay();
  }

  function skipTimer() {
    if (isRunning) {
      stopTimer();
    }
    timeLeft = 0;
    updateDisplay();
    onTimerComplete();
  }

  function onTimerComplete() {
    playBeep();

    if (currentMode === "focus") {
      // 完成一个专注番茄
      completedPomodoros++;
      currentCyclePomodoros++;
      recordPomodoro();
      updateStats();
      updatePomodoroDots();

      // 判断下一个模式
      const nextMode = currentCyclePomodoros >= settings.longBreakInterval ? "long" : "short";
      // 如果是长休息，重置周期计数
      if (nextMode === "long") {
        currentCyclePomodoros = 0;
      }

      // 更新标题通知
      updateDocumentTitle("时间到！");

      if (settings.autoStart) {
        setTimeout(() => {
          setMode(nextMode);
          startTimer();
        }, 500);
      } else {
        setMode(nextMode);
        showToast("专注完成！开始休息吧 🍅");
      }
    } else {
      // 休息结束，进入下一个专注
      updateDocumentTitle("休息结束！");

      if (settings.autoStart) {
        setTimeout(() => {
          setMode("focus");
          startTimer();
        }, 500);
      } else {
        setMode("focus");
        showToast("休息结束，准备开始新的番茄！");
      }
    }
  }

  /* ============================================================
     显示更新
     ============================================================ */
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }

  function updateDisplay() {
    $("#timerTime").textContent = formatTime(timeLeft);
    $("#timerModeLabel").textContent = MODE_LABELS[currentMode];

    // 更新圆形进度
    const progress = totalTime > 0 ? (totalTime - timeLeft) / totalTime : 0;
    const circumference = 2 * Math.PI * 125; // r = 125
    const offset = circumference * (1 - progress);
    $("#ringProgress").style.strokeDasharray = circumference;
    $("#ringProgress").style.strokeDashoffset = offset;

    // 更新页面标题
    if (isRunning) {
      updateDocumentTitle(`${formatTime(timeLeft)} - ${MODE_LABELS[currentMode]}`);
    } else {
      updateDocumentTitle(null);
    }
  }

  function updateDocumentTitle(custom) {
    if (custom) {
      document.title = `${custom} · 番茄钟`;
    } else {
      document.title = "番茄钟 · 免费工具箱";
    }
  }

  function updateModeTabs() {
    $$(".mode-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.mode === currentMode);
    });
  }

  function updateRingClass() {
    const ring = $("#timerRing");
    ring.classList.remove("mode-focus", "mode-short", "mode-long");
    ring.classList.add(MODE_CLASSES[currentMode] || "");
  }

  function updatePomodoroDots() {
    const container = $("#pomodoroDots");
    const interval = settings.longBreakInterval;
    const currentInCycle = currentCyclePomodoros;

    let dots = "";
    for (let i = 0; i < interval; i++) {
      let cls = "pomo-dot";
      if (i < currentInCycle) {
        cls += " done";
      } else if (i === currentInCycle && currentMode === "focus") {
        cls += " current";
      }
      dots += `<div class="${cls}"></div>`;
    }
    container.innerHTML = dots;

    $("#pomoCountText").textContent = `${currentInCycle}/${interval}`;
  }

  /* ============================================================
     历史记录与统计
     ============================================================ */
  function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  function recordPomodoro() {
    const history = loadHistory();
    const todayKey = getTodayKey();
    const duration = settings.focusDuration; // 分钟

    const todayEntry = history.find((h) => h.date === todayKey);
    if (todayEntry) {
      todayEntry.count++;
      todayEntry.minutes += duration;
    } else {
      history.unshift({
        date: todayKey,
        count: 1,
        minutes: duration
      });
    }

    // 只保留最近 90 天记录
    const trimmed = history.slice(0, 90);
    saveHistory(trimmed);
  }

  function getTodayStats() {
    const history = loadHistory();
    const todayKey = getTodayKey();
    const today = history.find((h) => h.date === todayKey);
    return {
      count: today ? today.count : 0,
      minutes: today ? today.minutes : 0
    };
  }

  function getWeekStats() {
    const history = loadHistory();
    const historyMap = {};
    history.forEach((h) => { historyMap[h.date] = h; });

    // 获取本周一到周日
    const today = new Date();
    const dayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=周一, 6=周日
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayIdx);

    const weekDays = [];
    const dayNames = ["一", "二", "三", "四", "五", "六", "日"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const entry = historyMap[key];
      weekDays.push({
        day: dayNames[i],
        count: entry ? entry.count : 0,
        minutes: entry ? entry.minutes : 0,
        isToday: i === dayIdx
      });
    }

    return weekDays;
  }

  function getTotalStats() {
    const history = loadHistory();
    let totalCount = 0;
    history.forEach((h) => { totalCount += h.count; });
    return totalCount;
  }

  function updateStats() {
    const today = getTodayStats();
    const week = getWeekStats();
    const total = getTotalStats();

    $("#todayCount").textContent = today.count;
    $("#todayMinutes").textContent = today.minutes;

    const weekTotal = week.reduce((sum, d) => sum + d.count, 0);
    $("#weekCount").textContent = weekTotal;
    $("#totalCount").textContent = total;

    renderWeekChart(week);
    renderHistoryList();
  }

  function renderWeekChart(weekData) {
    const container = $("#weekChart");
    const maxCount = Math.max(1, ...weekData.map((d) => d.count));

    container.innerHTML = weekData.map((d) => {
      const heightPct = (d.count / maxCount) * 100;
      const todayCls = d.isToday ? " today" : "";
      return `
        <div class="week-bar${todayCls}">
          <div class="count">${d.count || ""}</div>
          <div class="bar">
            <div class="bar-fill" style="height: ${d.count > 0 ? heightPct : 0}%"></div>
          </div>
          <div class="day">周${d.day}</div>
        </div>
      `;
    }).join("");
  }

  function renderHistoryList() {
    const history = loadHistory();
    const container = $("#historyList");

    if (history.length === 0) {
      container.innerHTML = '<div class="hint" style="text-align:center;padding:20px 0">暂无记录，开始你的第一个番茄吧！</div>';
      return;
    }

    const recent = history.slice(0, 14);
    container.innerHTML = recent.map((h) => {
      const dateObj = new Date(h.date);
      const month = dateObj.getMonth() + 1;
      const day = dateObj.getDate();
      const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const dayName = dayNames[dateObj.getDay()];

      return `
        <div class="history-item">
          <div>
            <div class="date">${month}月${day}日 ${dayName}</div>
            <div class="detail">共 ${h.minutes} 分钟专注</div>
          </div>
          <div class="count-badge">${h.count} 个</div>
        </div>
      `;
    }).join("");
  }

  /* ============================================================
     设置面板
     ============================================================ */
  function populateSettingsForm() {
    $("#focusDuration").value = settings.focusDuration;
    $("#shortDuration").value = settings.shortDuration;
    $("#longDuration").value = settings.longDuration;
    $("#longBreakInterval").value = settings.longBreakInterval;
    $("#autoStart").checked = settings.autoStart;
    $("#soundEnabled").checked = settings.soundEnabled;
  }

  function validateAndSaveSettings() {
    const focusVal = parseInt($("#focusDuration").value, 10);
    const shortVal = parseInt($("#shortDuration").value, 10);
    const longVal = parseInt($("#longDuration").value, 10);
    const intervalVal = parseInt($("#longBreakInterval").value, 10);

    if (isNaN(focusVal) || focusVal < 1 || focusVal > 120) {
      showToast("专注时长需在 1-120 分钟之间");
      return;
    }
    if (isNaN(shortVal) || shortVal < 1 || shortVal > 60) {
      showToast("短休息时长需在 1-60 分钟之间");
      return;
    }
    if (isNaN(longVal) || longVal < 1 || longVal > 120) {
      showToast("长休息时长需在 1-120 分钟之间");
      return;
    }
    if (isNaN(intervalVal) || intervalVal < 2 || intervalVal > 10) {
      showToast("长休息间隔需在 2-10 之间");
      return;
    }

    settings.focusDuration = focusVal;
    settings.shortDuration = shortVal;
    settings.longDuration = longVal;
    settings.longBreakInterval = intervalVal;
    settings.autoStart = $("#autoStart").checked;
    settings.soundEnabled = $("#soundEnabled").checked;

    saveSettings();

    // 如果计时器未运行，更新当前模式的总时间
    if (!isRunning) {
      totalTime = getModeDuration(currentMode);
      timeLeft = totalTime;
      updateDisplay();
    }

    updatePomodoroDots();
  }

  function resetSettings() {
    if (!confirm("确定要恢复默认设置吗？")) return;

    settings = { ...DEFAULT_SETTINGS };
    populateSettingsForm();
    saveSettings();

    if (!isRunning) {
      totalTime = getModeDuration(currentMode);
      timeLeft = totalTime;
      updateDisplay();
    }
    updatePomodoroDots();
  }

  /* ============================================================
     Toast 提示
     ============================================================ */
  let toastTimer = null;
  function showToast(msg) {
    const toast = $("#saveToast");
    toast.textContent = msg;
    toast.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  }

  /* ============================================================
     事件绑定
     ============================================================ */
  function bindEvents() {
    // 模式切换
    $$(".mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        setMode(tab.dataset.mode);
      });
    });

    // 开始/暂停按钮
    $("#startBtn").addEventListener("click", () => {
      if (isRunning) {
        pauseTimer();
      } else {
        startTimer();
      }
    });

    // 重置按钮
    $("#resetBtn").addEventListener("click", () => {
      if (isRunning || timeLeft < totalTime) {
        if (!confirm("确定要重置计时器吗？")) return;
      }
      resetTimer();
    });

    // 跳过按钮
    $("#skipBtn").addEventListener("click", () => {
      if (!confirm("确定要跳过当前阶段吗？")) return;
      skipTimer();
    });

    // 保存设置
    $("#saveSettingsBtn").addEventListener("click", validateAndSaveSettings);

    // 恢复默认
    $("#resetSettingsBtn").addEventListener("click", resetSettings);

    // 空格键控制开始/暂停
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (isRunning) {
          pauseTimer();
        } else {
          startTimer();
        }
      }
    });

    // 页面可见性变化时的校准
    document.addEventListener("visibilitychange", () => {
      // 可选：当页面隐藏后重新显示时，基于时间戳校准计时器
      // 这里简单处理：setInterval 在后台可能被节流，但基本可用
    });
  }

  /* ============================================================
     初始化
     ============================================================ */
  function init() {
    loadSettings();
    populateSettingsForm();

    // 初始化计时器
    currentMode = "focus";
    totalTime = getModeDuration(currentMode);
    timeLeft = totalTime;

    updateDisplay();
    updateModeTabs();
    updateRingClass();
    updatePomodoroDots();
    updateStats();

    bindEvents();
  }

  // DOM 就绪后初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // 注册页面快捷键（快捷键指南使用）
  window.TBX_pageShortcuts = [
    { key: "Space", name: "开始/暂停", category: "控制" },
    { key: "R", name: "重置", category: "控制" },
    { key: "→", name: "跳过当前阶段", category: "控制" },
    { key: "1/2/3", name: "切换模式（专注/短休息/长休息）", category: "模式" }
  ];
})();
