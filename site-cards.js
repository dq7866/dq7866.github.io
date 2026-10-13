/*!
 * 知作坊 · 站内板块推介卡片   site-cards.js
 * ---------------------------------------------------------------
 * 自包含脚本：板块数据 + 样式 + 渲染，一处维护、全站统一。
 * 想改某个板块的名称 / 一句话推介 / 配色，只改下面的 SITES 即可，
 * 所有接入过的页面会同时变化（记得清缓存）。
 *
 * 用法（在任意位置放一个占位元素即可）：
 *   <div data-zhz-sc="bar"></div>          横排卡片：子站页头 / 页脚
 *   <div data-zhz-sc="grid"></div>         网格卡片：博客首页的站内导览
 *   <div data-zhz-sc="button"></div>       浮动按钮，点击弹出卡片面板（全屏游戏页）
 *   <script src="/site-cards.js" defer></script>
 *
 * 可选属性：
 *   data-zhz-sc-theme="light|dark"   配色，默认 light
 *   data-zhz-sc-all="1"              连本站自己一起显示（默认自动隐藏当前板块）
 *   data-zhz-sc-title="..."          按钮 / 面板的标题文字
 * ---------------------------------------------------------------
 */
(function () {
  "use strict";
  if (window.__ZHZ_SC__) return;
  window.__ZHZ_SC__ = true;

  /* ================= 1. 板块数据（唯一数据源） ================= */

  var SITES = [
    {
      k: "home", emoji: "📕", name: "知作坊", sub: "博客 · 创作手记",
      desc: "故事、歌词与创作手记，《今世警世百回》连载中",
      url: "/", color: "#8a6a3b"
    },
    {
      k: "edu", emoji: "📚", name: "不只是成绩", sub: "教育专栏",
      desc: "6 大系列 31 期图文，给家长一份可落地的教育指南",
      url: "/edu/", color: "#2d7d7b"
    },
    {
      k: "forest", emoji: "🌳", name: "智慧林间学堂", sub: "儿童益智助学",
      desc: "226 张知识图鉴、937 道题，答题点亮成长树",
      url: "/forest/", color: "#4a9147"
    },
    {
      k: "symbolpass", emoji: "🔣", name: "符号通行证", sub: "SymbolPass",
      desc: "200 个原创符号 + 426 条旅行例句，中文直译英文",
      url: "/symbolpass/", color: "#1f5fd0"
    },
    {
      k: "toolbox", emoji: "🧰", name: "免费工具箱", sub: "Toolbox",
      desc: "30 个在线小工具，浏览器内完成，文件不上传服务器",
      url: "/toolbox/", color: "#ff4d00"
    },
    {
      k: "games", emoji: "🎮", name: "欢乐游戏盒", sub: "Happy Games Box",
      desc: "23 款免费小游戏，无广告无内购，多数可离线玩",
      url: "/games/", color: "#6a5ae0"
    },
    {
      k: "bike", emoji: "🚴", name: "风驰骑行", sub: "WindRider",
      desc: "手机体感自行车竞速，6 条赛道、赛季排行榜",
      url: "/bike/", color: "#10b981"
    },
    {
      k: "guardian", emoji: "🔥", name: "冰火守门人", sub: "Element Gatekeeper",
      desc: "双生守门人元素相克，3D 塔防式守门对抗",
      url: "/guardian/", color: "#e8543a"
    },
    {
      k: "board", emoji: "💬", name: "留言板", sub: "公告 · 联系我",
      desc: "站内公告、留言与联系方式，无需注册即可留言",
      url: "/board/", color: "#7c6cf0"
    },
    {
      k: "offline", emoji: "📦", name: "离线包下载", sub: "Offline Packs",
      desc: "8 个离线包，断网可用；网盘自取，解压密码全公开",
      url: "/offline/", color: "#c2410c"
    }
  ];

  /* 首页导览的分组（bar 模式不使用分组，按 SITES 顺序平铺） */
  var GROUPS = [
    { t: "阅读与学习", keys: ["home", "edu", "forest"] },
    { t: "工具与下载", keys: ["symbolpass", "toolbox", "offline"] },
    { t: "游戏", keys: ["games", "bike", "guardian"] },
    { t: "交流", keys: ["board"] }
  ];

  /* ================= 2. 小工具 ================= */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[m];
    });
  }

  /* #rrggbb -> rgba(r,g,b,a)，用于图标底色 */
  function rgba(hex, a) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return "rgba(127,127,127," + a + ")";
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function byKey(k) {
    for (var i = 0; i < SITES.length; i++) if (SITES[i].k === k) return SITES[i];
    return null;
  }

  var mqlDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");

  /* 配色：light / dark 固定；auto 跟随宿主页面（html[data-theme] / .dark / 系统偏好） */
  function resolveTheme(el) {
    var t = (el.getAttribute("data-zhz-sc-theme") || "light").toLowerCase();
    if (t === "dark" || t === "light") return t;
    var de = document.documentElement;
    if (de.getAttribute("data-theme") === "dark") return "dark";
    if (de.getAttribute("data-theme") === "light") return "light";
    if (de.classList.contains("dark")) return "dark";
    return (mqlDark && mqlDark.matches) ? "dark" : "light";
  }

  /* 当前所在板块（用于隐藏「自己」） */
  function currentKey() {
    var p = location.pathname || "/";
    for (var i = 0; i < SITES.length; i++) {
      var u = SITES[i].url;
      if (u === "/") {
        if (p === "/" || p === "/index.html") return "home";
        continue;
      }
      if (p.indexOf(u) === 0) return SITES[i].k;              /* /games/2048.html */
      if (p === u.replace(/\/$/, "")) return SITES[i].k;      /* /games */
    }
    return "";
  }

  /* ================= 3. 样式（只注入一次） ================= */

  var CSS = [
    ".zhzsc{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei','Segoe UI',Roboto,sans-serif;-webkit-text-size-adjust:100%}",
    ".zhzsc,.zhzsc *,.zhzsc *::before,.zhzsc *::after{box-sizing:border-box}",
    ".zhzsc-h{font-size:11.5px;font-weight:800;letter-spacing:.14em;margin:0 0 9px;text-transform:uppercase;opacity:.5}",
    ".zhzsc-sec{margin:0 0 18px}",
    ".zhzsc-sec:last-child{margin-bottom:0}",
    ".zhzsc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:11px}",
    ".zhzsc-grid.is-bar{grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:9px}",
    /* 卡片 */
    ".zhzsc-card{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:14px;text-decoration:none;border:1px solid transparent;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease,background .16s ease;overflow:hidden}",
    ".zhzsc-ico{flex:0 0 auto;width:36px;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1}",
    ".zhzsc-txt{min-width:0;display:block;flex:1 1 auto}",
    ".zhzsc-name{display:block;font-size:13.5px;font-weight:800;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".zhzsc-sub{font-style:normal;font-weight:600;font-size:10.5px;letter-spacing:.04em;opacity:.46;margin-left:6px}",
    ".zhzsc-desc{display:block;font-size:12px;line-height:1.55;margin-top:3px;opacity:.76}",
    ".zhzsc-grid.is-bar .zhzsc-desc{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".zhzsc-grid.is-bar .zhzsc-ico{width:32px;height:32px;font-size:16px;border-radius:10px}",
    /* 浅色 */
    ".zhzsc.is-light .zhzsc-h{color:#5b6675}",
    ".zhzsc.is-light .zhzsc-card{background:#fff;border-color:rgba(15,23,42,.09);box-shadow:0 1px 2px rgba(15,23,42,.05)}",
    ".zhzsc.is-light .zhzsc-name{color:#1b2130}",
    ".zhzsc.is-light .zhzsc-desc{color:#5b6675}",
    ".zhzsc.is-light .zhzsc-card:hover{transform:translateY(-2px);border-color:rgba(15,23,42,.18);box-shadow:0 8px 20px rgba(15,23,42,.11)}",
    /* 深色 */
    ".zhzsc.is-dark .zhzsc-h{color:rgba(255,255,255,.72)}",
    ".zhzsc.is-dark .zhzsc-card{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.17);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}",
    ".zhzsc.is-dark .zhzsc-name{color:#fff}",
    ".zhzsc.is-dark .zhzsc-desc{color:rgba(255,255,255,.76)}",
    ".zhzsc.is-dark .zhzsc-card:hover{background:rgba(255,255,255,.17);border-color:rgba(255,255,255,.34);transform:translateY(-2px)}",
    /* 浮动按钮 */
    ".zhzsc-fab{position:fixed;right:16px;bottom:16px;z-index:2147482000;display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 15px;border-radius:999px;border:1px solid;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;opacity:.66;transition:opacity .25s,transform .25s;-webkit-tap-highlight-color:transparent}",
    ".zhzsc-fab:hover{opacity:1;transform:translateY(-1px)}",
    ".zhzsc-fab.is-light{background:rgba(255,255,255,.94);border-color:rgba(15,23,42,.16);color:#1b2130;box-shadow:0 4px 16px rgba(15,23,42,.18)}",
    ".zhzsc-fab.is-dark{background:rgba(20,24,34,.82);border-color:rgba(255,255,255,.22);color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35)}",
    ".zhzsc-fab i{font-style:normal;font-size:16px;line-height:1}",
    /* 就地按钮（放在宿主自己的按钮行里时用） */
    ".zhzsc-inline{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;border:1px solid;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;-webkit-tap-highlight-color:transparent}",
    ".zhzsc-inline.is-light{background:#fff;border-color:rgba(15,23,42,.16);color:#1b2130}",
    ".zhzsc-inline.is-dark{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.24);color:#fff}",
    /* 弹出面板 */
    ".zhzsc-mask{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,10,16,.6);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);animation:zhzscFade .18s ease}",
    ".zhzsc-panel{width:min(780px,96vw);max-height:86vh;overflow:auto;border-radius:18px;padding:20px 20px 22px;box-shadow:0 26px 60px rgba(0,0,0,.42);animation:zhzscPop .2s ease}",
    ".zhzsc-panel.is-light{background:#f7f8fb;color:#1b2130}",
    ".zhzsc-panel.is-dark{background:#151922;color:#fff}",
    ".zhzsc-phead{display:flex;align-items:center;gap:10px;margin:0 0 15px}",
    ".zhzsc-ptitle{font-size:15px;font-weight:800;letter-spacing:.02em;flex:1 1 auto;margin:0}",
    ".zhzsc-px{flex:0 0 auto;width:32px;height:32px;border-radius:50%;border:1px solid;background:none;cursor:pointer;font-family:inherit;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center}",
    ".zhzsc-panel.is-light .zhzsc-px{border-color:rgba(15,23,42,.16);color:#5b6675}",
    ".zhzsc-panel.is-dark .zhzsc-px{border-color:rgba(255,255,255,.24);color:rgba(255,255,255,.8)}",
    "@keyframes zhzscFade{from{opacity:0}to{opacity:1}}",
    "@keyframes zhzscPop{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}",
    "@media (max-width:560px){.zhzsc-grid{grid-template-columns:1fr}.zhzsc-fab{height:38px;padding:0 13px;font-size:12.5px;right:12px;bottom:12px}}",
    "@media print{.zhzsc-fab{display:none}}"
  ].join("");

  function injectCss() {
    if (document.getElementById("zhz-site-cards-css")) return;
    var st = document.createElement("style");
    st.id = "zhz-site-cards-css";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ================= 4. 渲染 ================= */

  function cardHtml(s, bar, theme) {
    var bg = theme === "dark" ? "rgba(255,255,255,.14)" : rgba(s.color, 0.13);
    return '<a class="zhzsc-card" href="' + esc(s.url) + '" title="' + esc(s.name + " — " + s.desc) + '">' +
      '<span class="zhzsc-ico" style="background:' + bg + '">' + s.emoji + "</span>" +
      '<span class="zhzsc-txt">' +
        '<span class="zhzsc-name">' + esc(s.name) +
          '<em class="zhzsc-sub">' + esc(s.sub) + "</em></span>" +
        '<span class="zhzsc-desc">' + esc(s.desc) + "</span>" +
      "</span>" +
    "</a>";
  }

  function visibleList(el) {
    var all = el.getAttribute("data-zhz-sc-all") === "1";
    var cur = currentKey();
    return SITES.filter(function (s) { return all || s.k !== cur; });
  }

  function gridHtml(list, bar, theme, grouped) {
    if (!grouped) {
      return '<div class="zhzsc-grid' + (bar ? " is-bar" : "") + '">' +
        list.map(function (s) { return cardHtml(s, bar, theme); }).join("") + "</div>";
    }
    var out = "";
    GROUPS.forEach(function (g) {
      var items = g.keys.map(byKey).filter(function (s) {
        return s && list.indexOf(s) >= 0;
      });
      if (!items.length) return;
      out += '<div class="zhzsc-sec"><div class="zhzsc-h">' + esc(g.t) + "</div>" +
        '<div class="zhzsc-grid">' +
        items.map(function (s) { return cardHtml(s, false, theme); }).join("") +
        "</div></div>";
    });
    return out;
  }

  function openPanel(theme, title, list) {
    var mask = document.createElement("div");
    mask.className = "zhzsc-mask";
    mask.innerHTML =
      '<div class="zhzsc-panel zhzsc is-' + theme + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="zhzsc-phead"><h3 class="zhzsc-ptitle">' + esc(title) + "</h3>" +
        '<button class="zhzsc-px" type="button" aria-label="关闭">✕</button></div>' +
        gridHtml(list, false, theme, true) +
      "</div>";

    function close() {
      mask.removeEventListener("click", onMask);
      document.removeEventListener("keydown", onKey);
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }
    function onMask(e) { if (e.target === mask) close(); }
    function onKey(e) { if (e.key === "Escape") close(); }

    mask.querySelector(".zhzsc-px").onclick = close;
    mask.addEventListener("click", onMask);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(mask);
  }

  var AUTO = [];   /* 需要跟随页面主题重绘的占位元素 */

  function mount(el, again) {
    var mode = (el.getAttribute("data-zhz-sc") || "bar").toLowerCase();
    var themeAttr = (el.getAttribute("data-zhz-sc-theme") || "light").toLowerCase();
    var theme = resolveTheme(el);
    var title = el.getAttribute("data-zhz-sc-title") || "站内其他板块";
    var list = visibleList(el);

    el.innerHTML = "";

    if (!list.length) { el.style.display = "none"; return; }
    if (themeAttr === "auto" && !again) AUTO.push(el);

    if (mode === "button" || mode === "inline") {
      var isFab = mode === "button";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = (isFab ? "zhzsc-fab" : "zhzsc-inline") + " is-" + theme;
      btn.innerHTML = "<i>🍀</i><span>" + esc(title) + "</span>";
      btn.onclick = function () { openPanel(theme, title, list); };
      if (el.getAttribute("data-zhz-sc-fixed") === "0" && isFab) {
        btn.className = "zhzsc-inline is-" + theme;
      }
      el.appendChild(btn);
      return;
    }

    var box = document.createElement("div");
    box.className = "zhzsc is-" + theme;
    box.innerHTML = gridHtml(list, mode === "bar", theme, mode === "grid");
    el.appendChild(box);
  }

  function refreshAuto() {
    for (var i = 0; i < AUTO.length; i++) mount(AUTO[i], true);
  }

  function watchTheme() {
    var mo = window.MutationObserver && new MutationObserver(refreshAuto);
    if (mo) mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    if (mqlDark && mqlDark.addEventListener) mqlDark.addEventListener("change", refreshAuto);
  }

  function boot() {
    var nodes = document.querySelectorAll("[data-zhz-sc]");
    if (!nodes.length) return;
    injectCss();
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
    if (AUTO.length) watchTheme();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, false);
  } else {
    boot();
  }

  /* 供站点自行调用 */
  window.ZHZSiteCards = { open: function () { openPanel("dark", "站内其他板块", SITES); }, sites: SITES };
})();
