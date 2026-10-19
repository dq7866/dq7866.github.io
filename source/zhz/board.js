/* ============================================================
   知作坊 · 留言板前端（/zhz/board.js）
   - 读写走 /zhz/cloud.js → 隐藏 iframe → 云端安全函数
   - 留言内容一律用 textContent 渲染，杜绝注入
   - 无需登录、无需注册；每个浏览器有独立标记用于限流
   ============================================================ */
(function () {
  "use strict";

  var listEl = document.getElementById("zhz-msg-list");
  if (!listEl || !window.ZHZ) return;

  var countEl = document.getElementById("zhz-msg-count");
  var refreshBtn = document.getElementById("zhz-msg-refresh");
  var nickEl = document.getElementById("zhz-nick");
  var contentEl = document.getElementById("zhz-content");
  var counterEl = document.getElementById("zhz-counter");
  var submitBtn = document.getElementById("zhz-submit");
  var statusEl = document.getElementById("zhz-status");

  var LS_DEV = "zhz_msg_dev";
  var LS_NICK = "zhz_msg_nick";
  var MAX_LEN = 500;
  var loading = false;

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key) || "";
      localStorage.setItem(key, val);
    } catch (e) {}
    return "";
  }

  function deviceId() {
    var d = store(LS_DEV);
    if (d) return d;
    d = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    store(LS_DEV, d);
    return d;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.className = "zhz-status" + (kind ? " zhz-status-" + kind : "");
  }

  function fmtTime(s) {
    return String(s || "").replace(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})$/, "$1.$2.$3 $4");
  }

  function render(rows) {
    listEl.textContent = "";
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "zhz-empty";
      empty.textContent = "还没有留言，来留第一句吧。";
      listEl.appendChild(empty);
      return;
    }

    rows.forEach(function (row) {
      var item = document.createElement("div");
      item.className = "zhz-msg";

      var head = document.createElement("div");
      head.className = "zhz-msg-head";

      var nick = document.createElement("span");
      nick.className = "zhz-msg-nick";
      nick.textContent = row.nickname || "匿名访客";

      var time = document.createElement("span");
      time.className = "zhz-msg-time";
      time.textContent = fmtTime(row.created);

      head.appendChild(nick);
      head.appendChild(time);

      var body = document.createElement("div");
      body.className = "zhz-msg-body";
      body.textContent = row.content || "";

      item.appendChild(head);
      item.appendChild(body);
      listEl.appendChild(item);
    });
  }

  function load(silent) {
    if (loading) return;
    loading = true;
    if (refreshBtn) refreshBtn.disabled = true;

    if (!silent) {
      var wait = document.createElement("p");
      wait.className = "zhz-empty";
      wait.textContent = "正在读取留言…";
      listEl.textContent = "";
      listEl.appendChild(wait);
    }

    window.ZHZ.call({ type: "msg:list", limit: 50 })
      .then(function (r) {
        loading = false;
        if (refreshBtn) refreshBtn.disabled = false;

        if (!r || r.type !== "msg:list" || !r.ok) {
          listEl.textContent = "";
          var err = document.createElement("p");
          err.className = "zhz-empty";
          err.textContent = "留言服务暂时不可用，请稍后刷新重试。";
          listEl.appendChild(err);
          if (countEl) countEl.textContent = "读取失败";
          return;
        }

        var rows = Array.isArray(r.rows) ? r.rows : [];
        render(rows);
        if (countEl) {
          countEl.textContent = rows.length ? "共 " + rows.length + " 条" : "暂无留言";
        }
      })
      .catch(function () {
        loading = false;
        if (refreshBtn) refreshBtn.disabled = false;
      });
  }

  var REASON = {
    too_short: "内容太短了，至少写 2 个字。",
    too_long: "内容太长了，最多 500 字。",
    nick_too_long: "昵称太长了，最多 20 个字。",
    too_fast: "刚刚才发过，请等 30 秒再发下一条。",
    daily_limit: "今天留言有点多，明天再来吧。",
    error: "服务暂时不可用，请稍后再试。"
  };

  function submit() {
    var content = (contentEl.value || "").trim();
    var nick = (nickEl.value || "").trim();

    if (content.length < 2) {
      setStatus("内容太短了，至少写 2 个字。", "err");
      contentEl.focus();
      return;
    }
    if (content.length > MAX_LEN) {
      setStatus("内容太长了，最多 500 字。", "err");
      return;
    }
    if (nick.length > 20) {
      setStatus("昵称太长了，最多 20 个字。", "err");
      nickEl.focus();
      return;
    }

    setStatus("正在提交…");
    submitBtn.disabled = true;

    store(LS_NICK, nick);

    window.ZHZ.call({
      type: "msg:post",
      nickname: nick,
      content: content,
      device: deviceId()
    })
      .then(function (r) {
        submitBtn.disabled = false;
        if (r && r.type === "msg:post" && r.ok) {
          contentEl.value = "";
          updateCounter();
          setStatus("留言已发布，谢谢！", "ok");
          load(true);
          return;
        }
        var reason = r && r.reason;
        setStatus(REASON[reason] || (r && r.message) || "提交失败，请稍后再试。", "err");
      })
      .catch(function () {
        submitBtn.disabled = false;
        setStatus("网络异常，请稍后再试。", "err");
      });
  }

  function updateCounter() {
    if (!counterEl) return;
    counterEl.textContent = (contentEl.value || "").length + " / " + MAX_LEN;
  }

  /* ---------- 事件绑定 ---------- */
  if (refreshBtn) refreshBtn.onclick = function () { load(false); };
  if (submitBtn) submitBtn.onclick = submit;

  if (contentEl) {
    contentEl.addEventListener("input", updateCounter);
    contentEl.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
    });
    updateCounter();
  }

  if (nickEl) nickEl.value = store(LS_NICK);

  load(false);
})();
