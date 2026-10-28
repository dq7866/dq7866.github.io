/* 知作坊 · 全站搜索
 * ------------------------------------------------------------------
 * 为什么不用主题自带搜索：
 *   Butterfly 的 local_search 只索引 Hexo 文章（本站仅 2 篇），
 *   而真正的内容是 130+ 个独立静态页面（教育专栏 / 游戏盒 / 工具箱 …），
 *   它们不在文章体系里，主题搜索搜不到。
 *
 * 本脚本：拉取 /search-index.json（构建时生成），在浏览器内做全文检索。
 *   - 索引懒加载：首次触发搜索才请求，不拖慢首屏
 *   - 快捷键：Ctrl/⌘+K 或 / 打开
 *   - 键盘操作：↑↓ 选择，Enter 跳转，Esc 关闭
 *   - 无第三方依赖，约 6 KB
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  if (window.__zhzSearchLoaded) return;
  window.__zhzSearchLoaded = true;

  var INDEX_URL = "/search-index.json";
  var MAX_RESULTS = 20;

  var data = null;          // 索引，懒加载
  var loading = false;
  var ready = false;
  var activeIdx = -1;
  var results = [];
  var lastQuery = "";

  /* ---------------- 样式 ---------------- */
  var CSS = [
    /* 放右下角：顶部导航右侧是 Butterfly 的菜单与暗色开关，固定按钮会挤在一起 */
    ".zsr-btn{position:fixed;bottom:96px;right:22px;z-index:1000;width:44px;height:44px;border:none;border-radius:50%;",
    "background:rgba(255,255,255,.92);color:#333;cursor:pointer;box-shadow:0 3px 14px rgba(0,0,0,.18);",
    "font-size:18px;display:flex;align-items:center;justify-content:center;transition:transform .18s,background .18s}",
    ".zsr-btn:hover{transform:scale(1.08);background:#fff}",
    "[data-theme='dark'] .zsr-btn{background:rgba(40,44,52,.95);color:#ddd}",
    ".zsr-mask{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);",
    "display:none;align-items:flex-start;justify-content:center;padding-top:12vh}",
    ".zsr-mask.on{display:flex}",
    ".zsr-panel{width:min(92vw,620px);max-height:70vh;background:#fff;border-radius:14px;overflow:hidden;",
    "box-shadow:0 20px 60px rgba(0,0,0,.28);display:flex;flex-direction:column}",
    "[data-theme='dark'] .zsr-panel{background:#2b2f38;color:#e6e6e6}",
    ".zsr-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(128,128,128,.18)}",
    ".zsr-head i{font-style:normal;opacity:.55;font-size:17px}",
    ".zsr-input{flex:1;border:none;outline:none;background:transparent;font-size:16px;color:inherit}",
    ".zsr-input::placeholder{color:#9aa0a6}",
    ".zsr-esc{font-size:12px;color:#999;border:1px solid rgba(128,128,128,.32);border-radius:5px;padding:2px 6px;cursor:pointer}",
    ".zsr-list{overflow-y:auto;padding:6px 0;margin:0;list-style:none}",
    ".zsr-item{padding:10px 16px;cursor:pointer;border-left:3px solid transparent}",
    ".zsr-item:hover,.zsr-item.on{background:rgba(73,177,245,.12);border-left-color:#49b1f5}",
    ".zsr-t{font-weight:600;font-size:14.5px;margin-bottom:3px;line-height:1.4}",
    ".zsr-t em{font-style:normal;color:#e8590c;font-weight:700}",
    ".zsr-d{font-size:12.5px;color:#7a808a;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;",
    "-webkit-box-orient:vertical;overflow:hidden}",
    "[data-theme='dark'] .zsr-d{color:#98a0ab}",
    ".zsr-u{font-size:11px;color:#b0b6bd;margin-top:3px}",
    ".zsr-empty{padding:26px 16px;text-align:center;color:#9aa0a6;font-size:13.5px;line-height:1.7}",
    ".zsr-foot{padding:7px 16px;border-top:1px solid rgba(128,128,128,.18);font-size:11.5px;color:#9aa0a6;",
    "display:flex;justify-content:space-between}",
    "@media(max-width:768px){.zsr-btn{bottom:82px;right:16px}",
    ".zsr-mask{padding-top:6vh}.zsr-panel{max-height:80vh}}"
  ].join("");

  function injectCss() {
    if (document.getElementById("zsr-css")) return;
    var st = document.createElement("style");
    st.id = "zsr-css";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- 检索 ---------------- */
  function norm(s) {
    return String(s || "").toLowerCase();
  }

  /** 多词 AND 匹配：每个词都要在标题/关键词/描述里出现 */
  function match(item, terms) {
    var hay = norm(item.t) + " " + norm(item.k) + " " + norm(item.d) + " " + norm(item.u);
    for (var i = 0; i < terms.length; i++) {
      if (hay.indexOf(terms[i]) === -1) return -1;
    }
    // 打分：标题命中权重最高
    var score = 0;
    for (var j = 0; j < terms.length; j++) {
      var w = terms[j];
      if (norm(item.t).indexOf(w) !== -1) score += 100;
      if (norm(item.k).indexOf(w) !== -1) score += 30;
      if (norm(item.d).indexOf(w) !== -1) score += 10;
    }
    if (item.u === "/") score += 5;
    return score;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /** 把命中的词高亮（只处理第一个词，避免 HTML 嵌套） */
  function highlight(text, term) {
    var e = esc(text);
    if (!term) return e;
    var idx = norm(e).indexOf(norm(term));
    if (idx === -1) return e;
    return e.slice(0, idx) + "<em>" + e.slice(idx, idx + term.length) + "</em>" + e.slice(idx + term.length);
  }

  function render(q) {
    var listEl = document.getElementById("zsr-list");
    var footEl = document.getElementById("zsr-foot");
    if (!listEl) return;

    q = q.trim();
    lastQuery = q;

    if (!q) {
      listEl.innerHTML = '<li class="zsr-empty">输入关键词搜索全站<br>' +
        '<span style="font-size:12px;opacity:.7">教育专栏 31 期 · 游戏盒 24 款 · 工具箱 30 个 · 森林学堂 937 题</span></li>';
      footEl.textContent = data ? "共收录 " + data.n + " 个页面" : "";
      results = [];
      activeIdx = -1;
      return;
    }

    if (!ready) {
      listEl.innerHTML = '<li class="zsr-empty">索引加载中…</li>';
      return;
    }

    var terms = q.split(/\s+/).filter(Boolean);
    var scored = [];
    for (var i = 0; i < data.items.length; i++) {
      var s = match(data.items[i], terms);
      if (s >= 0) scored.push({ item: data.items[i], score: s });
    }
    scored.sort(function (a, b) { return b.score - a.score; });
    results = scored.slice(0, MAX_RESULTS).map(function (x) { return x.item; });
    activeIdx = results.length ? 0 : -1;

    if (!results.length) {
      listEl.innerHTML = '<li class="zsr-empty">没有找到「' + esc(q) + '」相关页面<br>' +
        '<span style="font-size:12px;opacity:.7">试试更短的关键词，比如「成语」「分数」「守门人」</span></li>';
      footEl.textContent = "";
      return;
    }

    var html = "";
    for (var k = 0; k < results.length; k++) {
      var it = results[k];
      html += '<li class="zsr-item' + (k === 0 ? " on" : "") + '" data-i="' + k + '" data-url="' + esc(it.u) + '">' +
        '<div class="zsr-t">' + highlight(it.t, terms[0]) + "</div>" +
        (it.d ? '<div class="zsr-d">' + highlight(it.d, terms[0]) + "</div>" : "") +
        '<div class="zsr-u">' + esc(it.u) + "</div>" +
        "</li>";
    }
    listEl.innerHTML = html;
    footEl.innerHTML = "<span>" + results.length + " 个结果" + (scored.length > results.length ? "（共 " + scored.length + "）" : "") + "</span><span>↑↓ 选择 · Enter 打开</span>";

    Array.prototype.forEach.call(listEl.querySelectorAll(".zsr-item"), function (el) {
      el.addEventListener("click", function () {
        location.href = el.getAttribute("data-url");
      });
      el.addEventListener("mouseenter", function () {
        setActive(parseInt(el.getAttribute("data-i"), 10));
      });
    });
  }

  function setActive(i) {
    var listEl = document.getElementById("zsr-list");
    if (!listEl) return;
    var items = listEl.querySelectorAll(".zsr-item");
    if (!items.length) return;
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    activeIdx = i;
    for (var k = 0; k < items.length; k++) items[k].classList.toggle("on", k === i);
    var cur = items[i];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }

  /* ---------------- 索引加载 ---------------- */
  function loadIndex() {
    if (data || loading) return;
    loading = true;
    fetch(INDEX_URL, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (j) {
        data = j && j.items ? j : { items: [], n: 0 };
        ready = true;
        loading = false;
        render(lastQuery);
      })
      .catch(function () {
        loading = false;
        ready = true;
        data = { items: [], n: 0 };
        var listEl = document.getElementById("zsr-list");
        if (listEl) listEl.innerHTML = '<li class="zsr-empty">索引加载失败，请刷新重试</li>';
      });
  }

  /* ---------------- 面板 ---------------- */
  function buildPanel() {
    if (document.getElementById("zsr-mask")) return;
    var mask = document.createElement("div");
    mask.className = "zsr-mask";
    mask.id = "zsr-mask";
    mask.innerHTML =
      '<div class="zsr-panel" role="dialog" aria-label="全站搜索">' +
        '<div class="zsr-head">' +
          '<i>🔍</i>' +
          '<input class="zsr-input" id="zsr-input" type="search" placeholder="搜索全站：文章 · 教育 · 游戏 · 工具" autocomplete="off">' +
          '<span class="zsr-esc" id="zsr-esc">ESC</span>' +
        "</div>" +
        '<ul class="zsr-list" id="zsr-list"></ul>' +
        '<div class="zsr-foot" id="zsr-foot"></div>' +
      "</div>";
    document.body.appendChild(mask);

    mask.addEventListener("click", function (e) {
      if (e.target === mask) close();
    });
    document.getElementById("zsr-esc").addEventListener("click", close);

    var input = document.getElementById("zsr-input");
    var timer = null;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var v = input.value;
      timer = setTimeout(function () { render(v); }, 120);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
      else if (e.key === "Enter") {
        var it = results[activeIdx];
        if (it) location.href = it.u;
      } else if (e.key === "Escape") { close(); }
    });
  }

  function open() {
    buildPanel();
    loadIndex();
    var mask = document.getElementById("zsr-mask");
    mask.classList.add("on");
    var input = document.getElementById("zsr-input");
    if (input) { input.focus(); input.select(); }
    render(input ? input.value : "");
  }

  function close() {
    var mask = document.getElementById("zsr-mask");
    if (mask) mask.classList.remove("on");
  }

  /* ---------------- 入口按钮 ---------------- */
  function buildButton() {
    if (document.getElementById("zsr-btn")) return;
    var b = document.createElement("button");
    b.id = "zsr-btn";
    b.className = "zsr-btn";
    b.type = "button";
    b.title = "搜索全站（Ctrl+K）";
    b.setAttribute("aria-label", "搜索全站");
    b.textContent = "🔍";
    b.addEventListener("click", open);
    document.body.appendChild(b);
  }

  function boot() {
    injectCss();
    buildButton();
    document.addEventListener("keydown", function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || document.activeElement.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        open();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, false);
  } else {
    boot();
  }
})();
