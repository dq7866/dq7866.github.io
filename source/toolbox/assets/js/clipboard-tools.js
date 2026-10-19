/* 剪贴板助手工具 · 纯前端实现
 * 剪贴板历史 / 文本处理 / 快速模板
 * 数据存储于 localStorage
 */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const STORAGE_KEY = "tbx_clip_history";
  const TPL_STORAGE_KEY = "tbx_clip_templates";
  const MAX_HISTORY = 100;

  /* ---------------- 工具函数 ---------------- */
  function showToast(msg, duration) {
    const toast = $("#toast");
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("show"), duration || 1800);
  }

  function copyToClipboard(text) {
    if (!text) return Promise.reject("empty");
    return navigator.clipboard.writeText(text);
  }

  function readFromClipboard() {
    return navigator.clipboard.readText();
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + " 天前";
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function byteLength(str) {
    try { return new TextEncoder().encode(str).length; }
    catch (e) {
      let len = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 0x80) len += 1;
        else if (c < 0x800) len += 2;
        else len += 3;
      }
      return len;
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------------- Tabs ---------------- */
  $$("#clipTabs .tab").forEach((b) => {
    b.onclick = () => {
      $$("#clipTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".clip-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
    };
  });

  /* ============================================================
     Tab 1: 剪贴板历史
     ============================================================ */
  let clipHistory = [];
  let searchQuery = "";
  let monitoring = false;
  let monitorTimer = null;

  function loadHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      clipHistory = data ? JSON.parse(data) : [];
    } catch (e) {
      clipHistory = [];
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clipHistory));
    } catch (e) {
      showToast("存储失败：本地存储空间不足");
    }
  }

  function addHistoryItem(text) {
    if (!text || !text.trim()) return;
    // 检查是否与最近一条相同
    if (clipHistory.length > 0 && clipHistory[0].text === text) return;
    // 移除重复项
    clipHistory = clipHistory.filter((item) => item.text !== text);
    // 添加到开头（未置顶的部分）
    const pinned = clipHistory.filter((i) => i.pinned);
    const unpinned = clipHistory.filter((i) => !i.pinned);
    const newItem = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      text: text,
      type: "text",
      timestamp: Date.now(),
      pinned: false,
    };
    clipHistory = [...pinned, newItem, ...unpinned];
    // 限制数量
    if (clipHistory.length > MAX_HISTORY) {
      // 保留置顶的，然后从非顶置中截断
      const p = clipHistory.filter((i) => i.pinned);
      const u = clipHistory.filter((i) => !i.pinned).slice(0, MAX_HISTORY - p.length);
      clipHistory = [...p, ...u];
    }
    saveHistory();
    renderHistory();
  }

  function deleteHistoryItem(id) {
    clipHistory = clipHistory.filter((item) => item.id !== id);
    saveHistory();
    renderHistory();
  }

  function togglePin(id) {
    const item = clipHistory.find((i) => i.id === id);
    if (!item) return;
    item.pinned = !item.pinned;
    // 重新排序：置顶的在前，按时间倒序
    const pinned = clipHistory.filter((i) => i.pinned).sort((a, b) => b.timestamp - a.timestamp);
    const unpinned = clipHistory.filter((i) => !i.pinned).sort((a, b) => b.timestamp - a.timestamp);
    clipHistory = [...pinned, ...unpinned];
    saveHistory();
    renderHistory();
  }

  function clearAllHistory() {
    showConfirm("清空剪贴板历史", "确定要清空所有剪贴板记录吗？此操作不可撤销。", () => {
      clipHistory = [];
      saveHistory();
      renderHistory();
      showToast("已清空");
    });
  }

  function renderHistory() {
    const list = $("#clipList");
    const query = searchQuery.toLowerCase().trim();

    let filtered = clipHistory;
    if (query) {
      filtered = clipHistory.filter((item) => item.text.toLowerCase().includes(query));
    }

    const pinnedCount = clipHistory.filter((i) => i.pinned).length;
    $("#historyCount").textContent = clipHistory.length + " 条记录";
    $("#pinnedCount").textContent = pinnedCount + " 条置顶";

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="clip-empty">
          <div class="icon">📋</div>
          <div>${query ? "没有匹配的记录" : "暂无剪贴板记录"}</div>
          <div style="font-size:12px;margin-top:4px">${query ? "试试其他关键词" : "点击上方「粘贴」按钮添加第一条记录"}</div>
        </div>
      `;
      return;
    }

    list.innerHTML = filtered.map((item) => {
      const preview = escapeHtml(item.text).replace(/\n/g, " ");
      return `
        <div class="clip-item ${item.pinned ? "pinned" : ""}" data-id="${item.id}">
          <div class="clip-item-preview" title="点击复制">
            <div class="clip-item-text">${preview}</div>
            <div class="clip-item-meta">
              <span class="clip-item-type">${item.pinned ? "📌 已置顶" : item.type}</span>
              <span>${formatTime(item.timestamp)}</span>
              <span>${item.text.length} 字符</span>
            </div>
          </div>
          <div class="clip-item-actions">
            <button class="pin-btn ${item.pinned ? "pinned" : ""}" title="${item.pinned ? "取消置顶" : "置顶"}" data-action="pin">${item.pinned ? "📌" : "📍"}</button>
            <button class="copy-btn" title="复制" data-action="copy">📋</button>
            <button class="del-btn" title="删除" data-action="delete">✕</button>
          </div>
        </div>
      `;
    }).join("");

    // 绑定事件
    $$(".clip-item", list).forEach((el) => {
      const id = el.dataset.id;
      // 点击预览区域复制
      $(".clip-item-preview", el).onclick = () => copyHistoryItem(id);
      // 按钮事件
      $$("button", el).forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === "copy") copyHistoryItem(id);
          else if (action === "delete") deleteHistoryItem(id);
          else if (action === "pin") togglePin(id);
        };
      });
    });
  }

  function copyHistoryItem(id) {
    const item = clipHistory.find((i) => i.id === id);
    if (!item) return;
    copyToClipboard(item.text).then(() => {
      showToast("已复制到剪贴板");
    }).catch(() => {
      showToast("复制失败");
    });
  }

  // 粘贴按钮
  $("#pasteBtn").onclick = () => {
    readFromClipboard().then((text) => {
      if (text && text.trim()) {
        addHistoryItem(text);
        showToast("已添加到剪贴板历史");
      } else {
        showToast("剪贴板为空");
      }
    }).catch(() => {
      showToast("无法读取剪贴板，请授权或手动粘贴");
    });
  };

  // 搜索
  $("#historySearch").addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderHistory();
  });

  // 清空全部
  $("#clearAllBtn").onclick = clearAllHistory;

  // 监听剪贴板
  $("#monitorBtn").onclick = () => {
    if (monitoring) {
      stopMonitoring();
    } else {
      startMonitoring();
    }
  };

  function startMonitoring() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      showToast("当前浏览器不支持读取剪贴板");
      return;
    }
    monitoring = true;
    $("#monitorBtn").textContent = "⏹ 停止监听";
    $("#monitorStatus").classList.add("active");
    $("#monitorStatusText").textContent = "监听中（页面激活时）";
    monitorTimer = setInterval(checkClipboard, 2000);
  }

  function stopMonitoring() {
    monitoring = false;
    $("#monitorBtn").textContent = "👁 监听剪贴板";
    $("#monitorStatus").classList.remove("active");
    $("#monitorStatusText").textContent = "未监听";
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  }

  let lastClipboardText = "";
  function checkClipboard() {
    if (document.hidden) return;
    readFromClipboard().then((text) => {
      if (text && text.trim() && text !== lastClipboardText) {
        lastClipboardText = text;
        addHistoryItem(text);
      }
    }).catch(() => {
      // 静默失败，可能是权限问题
    });
  }

  // 全局 Ctrl+V 监听（在历史标签页时）
  document.addEventListener("keydown", (e) => {
    // 如果焦点在输入框/文本框中，不处理
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      const activeTab = $("#clipTabs .tab.active").dataset.tab;
      if (activeTab === "history") {
        e.preventDefault();
        $("#pasteBtn").click();
      }
    }
  });

  /* ============================================================
     Tab 2: 文本处理
     ============================================================ */
  const tpInput = $("#textprocInput");

  function updateTpStats() {
    const text = tpInput.value;
    const chars = text.length;
    const lines = text ? text.split("\n").length : 0;
    // 单词数（中英文混合估算）
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const words = chineseChars + englishWords;
    const bytes = byteLength(text);

    $("#tpCharCount").textContent = chars + " 字符";
    $("#tpWordCount").textContent = words + " 词";
    $("#tpLineCount").textContent = lines + " 行";
    $("#tpByteCount").textContent = bytes + " 字节";
  }

  tpInput.addEventListener("input", updateTpStats);

  // 文本处理函数
  const processors = {
    trim: (s) => s.trim(),
    trimLines: (s) => s.split("\n").map((l) => l.trim()).join("\n"),
    removeBlankLines: (s) => s.split("\n").filter((l) => l.trim()).join("\n"),
    removeExtraSpaces: (s) => s.replace(/[ \t]+/g, " ").replace(/^\s+|\s+$/gm, "").replace(/\n{3,}/g, "\n\n"),
    addLineNumbers: (s) => {
      const lines = s.split("\n");
      const maxLen = String(lines.length).length;
      return lines.map((l, i) => String(i + 1).padStart(maxLen, " ") + " | " + l).join("\n");
    },
    removeLineNumbers: (s) => s.split("\n").map((l) => l.replace(/^\s*\d+\s*\|\s*/, "")).join("\n"),
    toUpper: (s) => s.toUpperCase(),
    toLower: (s) => s.toLowerCase(),
    toTitle: (s) => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase()),
    toggleCase: (s) => s.split("").map((c) => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join(""),
    toFullWidth: (s) => {
      let result = "";
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === 32) result += String.fromCharCode(12288);
        else if (c >= 33 && c <= 126) result += String.fromCharCode(c + 65248);
        else result += s.charAt(i);
      }
      return result;
    },
    toHalfWidth: (s) => {
      let result = "";
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c === 12288) result += " ";
        else if (c >= 65281 && c <= 65374) result += String.fromCharCode(c - 65248);
        else result += s.charAt(i);
      }
      return result;
    },
    sortAsc: (s) => s.split("\n").sort().join("\n"),
    sortDesc: (s) => s.split("\n").sort().reverse().join("\n"),
    sortNatural: (s) => {
      const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
      return s.split("\n").sort(collator.compare).join("\n");
    },
    dedupe: (s) => {
      const seen = new Set();
      return s.split("\n").filter((l) => {
        const key = l.trim();
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).join("\n");
    },
    reverseLines: (s) => s.split("\n").reverse().join("\n"),
    shuffleLines: (s) => {
      const arr = s.split("\n");
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.join("\n");
    },
  };

  // 绑定处理按钮
  $$(".proc-btn").forEach((btn) => {
    btn.onclick = () => {
      const proc = btn.dataset.proc;
      const fn = processors[proc];
      if (!fn) return;

      const text = tpInput.value;
      if (!text) {
        showToast("请先输入文本");
        return;
      }

      try {
        const result = fn(text);
        tpInput.value = result;
        updateTpStats();

        if ($("#tpAutoCopy").checked) {
          copyToClipboard(result).then(() => {
            showToast("已处理并复制到剪贴板");
          }).catch(() => {
            showToast("处理完成");
          });
        } else {
          showToast("处理完成");
        }
      } catch (e) {
        showToast("处理失败：" + e.message);
      }
    };
  });

  // 清空按钮
  $("#tpClearBtn").onclick = () => {
    tpInput.value = "";
    updateTpStats();
    tpInput.focus();
  };

  // 复制按钮
  $("#tpCopyBtn").onclick = () => {
    const text = tpInput.value;
    if (!text) {
      showToast("没有可复制的内容");
      return;
    }
    copyToClipboard(text).then(() => {
      showToast("已复制到剪贴板");
    }).catch(() => {
      showToast("复制失败");
    });
  };

  /* ============================================================
     Tab 3: 快速模板
     ============================================================ */
  let templates = [];
  let currentCat = "all";
  let editingTplId = null;

  // 默认模板
  const defaultTemplates = [
    {
      id: "default_1",
      name: "邮件签名",
      category: "邮箱模板",
      content: "此致\n敬礼\n\n张三\n联系电话：138-xxxx-xxxx\n邮箱：example@email.com",
    },
    {
      id: "default_2",
      name: "感谢回复",
      category: "常用回复",
      content: "您好！\n\n感谢您的来信，已收到您的信息。\n\n如有其他问题，请随时联系。\n\n祝好！",
    },
    {
      id: "default_3",
      name: "会议邀请",
      category: "邮箱模板",
      content: "主题：会议邀请\n\n各位好：\n\n诚邀您参加于 XXXX年XX月XX日 XX:XX 召开的会议，会议地点为 XXX。\n\n会议议题：\n1. \n2. \n3. \n\n请准时参加，谢谢！",
    },
    {
      id: "default_4",
      name: "公司地址",
      category: "地址信息",
      content: "公司名称：\n公司地址：\n联系电话：\n邮政编码：",
    },
    {
      id: "default_5",
      name: "JS 防抖函数",
      category: "代码片段",
      content: "function debounce(fn, delay) {\n  let timer = null;\n  return function (...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), delay);\n  };\n}",
    },
    {
      id: "default_6",
      name: "请假申请",
      category: "常用回复",
      content: "尊敬的领导：\n\n您好！\n\n因 ______ 原因，我需要请假 ____ 天，时间为 ____ 年 ____ 月 ____ 日至 ____ 年 ____ 月 ____ 日。\n\n工作已交接妥当，如有紧急事务可通过电话联系我。\n\n望批准，谢谢！\n\n申请人：______\n日期：______",
    },
  ];

  function loadTemplates() {
    try {
      const data = localStorage.getItem(TPL_STORAGE_KEY);
      if (data) {
        templates = JSON.parse(data);
      } else {
        templates = [...defaultTemplates];
        saveTemplates();
      }
    } catch (e) {
      templates = [...defaultTemplates];
    }
  }

  function saveTemplates() {
    try {
      localStorage.setItem(TPL_STORAGE_KEY, JSON.stringify(templates));
    } catch (e) {
      showToast("存储失败：本地存储空间不足");
    }
  }

  function renderTemplates() {
    const grid = $("#tplGrid");
    let filtered = templates;
    if (currentCat !== "all") {
      filtered = templates.filter((t) => t.category === currentCat);
    }

    $("#tplCount").textContent = templates.length + " 个模板";

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="tpl-empty">
          <div class="icon">📄</div>
          <div>暂无模板</div>
          <div style="font-size:12px;margin-top:4px">点击「新建模板」创建第一个模板</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map((tpl) => `
      <div class="template-card" data-id="${tpl.id}">
        <div class="template-card-title">
          <span>${escapeHtml(tpl.name)}</span>
          <span class="template-card-cat">${escapeHtml(tpl.category)}</span>
        </div>
        <div class="template-card-content">${escapeHtml(tpl.content)}</div>
        <div class="template-card-actions">
          <button class="btn primary" data-action="copy">复制</button>
          <button class="btn ghost" data-action="edit">编辑</button>
          <button class="btn ghost danger" data-action="delete">删除</button>
        </div>
      </div>
    `).join("");

    // 绑定事件
    $$(".template-card", grid).forEach((card) => {
      const id = card.dataset.id;
      $$("button", card).forEach((btn) => {
        btn.onclick = () => {
          const action = btn.dataset.action;
          if (action === "copy") copyTemplate(id);
          else if (action === "edit") editTemplate(id);
          else if (action === "delete") deleteTemplate(id);
        };
      });
    });
  }

  function copyTemplate(id) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    copyToClipboard(tpl.content).then(() => {
      showToast("已复制：" + tpl.name);
    }).catch(() => {
      showToast("复制失败");
    });
  }

  function editTemplate(id) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    editingTplId = id;
    $("#tplModalTitle").textContent = "编辑模板";
    $("#tplName").value = tpl.name;
    $("#tplCategory").value = tpl.category;
    $("#tplContent").value = tpl.content;
    $("#tplModal").classList.add("show");
  }

  function deleteTemplate(id) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    showConfirm("删除模板", `确定要删除模板「${tpl.name}」吗？此操作不可撤销。`, () => {
      templates = templates.filter((t) => t.id !== id);
      saveTemplates();
      renderTemplates();
      showToast("已删除");
    });
  }

  // 新建模板按钮
  $("#addTplBtn").onclick = () => {
    editingTplId = null;
    $("#tplModalTitle").textContent = "新建模板";
    $("#tplName").value = "";
    $("#tplCategory").value = currentCat === "all" ? "常用回复" : currentCat;
    $("#tplContent").value = "";
    $("#tplModal").classList.add("show");
    setTimeout(() => $("#tplName").focus(), 50);
  };

  // 取消按钮
  $("#cancelTplBtn").onclick = () => {
    $("#tplModal").classList.remove("show");
  };

  // 保存模板
  $("#saveTplBtn").onclick = () => {
    const name = $("#tplName").value.trim();
    const category = $("#tplCategory").value;
    const content = $("#tplContent").value;

    if (!name) {
      showToast("请输入模板名称");
      return;
    }
    if (!content) {
      showToast("请输入模板内容");
      return;
    }

    if (editingTplId) {
      // 编辑
      const tpl = templates.find((t) => t.id === editingTplId);
      if (tpl) {
        tpl.name = name;
        tpl.category = category;
        tpl.content = content;
      }
      showToast("已更新");
    } else {
      // 新建
      templates.unshift({
        id: "tpl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        name,
        category,
        content,
      });
      showToast("已创建");
    }

    saveTemplates();
    renderTemplates();
    $("#tplModal").classList.remove("show");
  };

  // 分类切换
  $$("#tplCategories button").forEach((btn) => {
    btn.onclick = () => {
      $$("#tplCategories button").forEach((b) => b.classList.toggle("active", b === btn));
      currentCat = btn.dataset.cat;
      renderTemplates();
    };
  });

  // 点击遮罩关闭弹窗
  $("#tplModal").onclick = (e) => {
    if (e.target === $("#tplModal")) {
      $("#tplModal").classList.remove("show");
    }
  };

  /* ============================================================
     确认对话框
     ============================================================ */
  let confirmCallback = null;

  function showConfirm(title, text, onOk) {
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    confirmCallback = onOk;
    $("#confirmModal").classList.add("show");
  }

  $("#confirmCancelBtn").onclick = () => {
    $("#confirmModal").classList.remove("show");
    confirmCallback = null;
  };

  $("#confirmOkBtn").onclick = () => {
    $("#confirmModal").classList.remove("show");
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  };

  $("#confirmModal").onclick = (e) => {
    if (e.target === $("#confirmModal")) {
      $("#confirmModal").classList.remove("show");
      confirmCallback = null;
    }
  };

  /* ============================================================
     初始化
     ============================================================ */
  function init() {
    loadHistory();
    renderHistory();
    loadTemplates();
    renderTemplates();
    updateTpStats();
  }

  init();
})();
