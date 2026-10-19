/* ============================================================
   知作坊 · 通用全屏按钮（桌面 + 手机都能用）
   ------------------------------------------------------------
   用法：在游戏页里加一行
       <script src="/fs-button.js" defer></script>
   可选配置写在 <body> 标签上：
       data-fs="off"        不显示按钮（页面自己实现了全屏控件时用）
       data-fs-pos="br"     按钮位置：br 右下（默认）/ bl 左下 / tr 右上 / tl 左上
       data-fs-top="104"    额外下移像素（避开页面自己的 HUD，纯数字）
       data-fs-right="12"   额外右移像素
       data-fs-mini         只显示图标（窄屏自动切到这种形态）
   行为：
     · 点击切换全屏 / 退出全屏，按 ESC 或系统手势退出时按钮文案自动同步
     · 浏览器不支持（iPhone Safari）时**不显示按钮**，避免出现点了没反应的死按钮
     · 全屏对象是 document.documentElement，因此页面自身 UI 与按钮全屏后依然可见
     · 暴露 window.__FS = { toggle, enter, exit, isActive, can }
   ============================================================ */
(function () {
  "use strict";

  var body = document.body;
  var cfg = (body && body.dataset) || {};
  if (cfg.fs === "off") return;

  /* ---------------- 全屏能力 ---------------- */
  function fsEl() { return document.documentElement; }
  function can() {
    var e = fsEl();
    return !!(e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen);
  }
  function isActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }
  function enter() {
    var e = fsEl();
    var fn = e.requestFullscreen || e.webkitRequestFullscreen || e.msRequestFullscreen;
    if (!fn) return;
    try {
      var p = fn.call(e, { navigationUI: "hide" });
      if (p && p.catch) p.catch(function () { sync(); });
    } catch (err) { /* 用户拒绝或系统不允许，静默 */ }
  }
  function exit() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!fn) return;
    try {
      var p = fn.call(document);
      if (p && p.catch) p.catch(function () {});
    } catch (err) {}
  }
  function toggle() { if (isActive()) exit(); else enter(); }

  /* iPhone Safari 没有元素全屏（只有视频），直接不建按钮 */
  if (!can()) {
    window.__FS = { toggle: function () {}, enter: function () {}, exit: function () {},
                    isActive: isActive, can: can };
    return;
  }

  /* ---------------- 图标 ---------------- */
  var ICON_IN = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
    '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" ' +
    'stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_OUT = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
    '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" ' +
    'stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------------- 样式 ---------------- */
  var CSS =
    '#zhz-fs{position:fixed;z-index:2147483000;display:inline-flex;align-items:center;gap:5px;' +
    'padding:7px 11px;border-radius:10px;border:1px solid rgba(255,255,255,.28);' +
    'background:rgba(12,14,20,.5);color:#fff;font:600 12.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;' +
    'cursor:pointer;opacity:.5;transition:opacity .18s,background .18s,transform .1s;' +
    '-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;' +
    'text-shadow:0 1px 3px rgba(0,0,0,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}' +
    '#zhz-fs:hover,#zhz-fs:focus-visible{opacity:1;background:rgba(12,14,20,.78);outline:none;}' +
    '#zhz-fs:active{transform:scale(.96);}' +
    '#zhz-fs.mini{padding:8px;border-radius:50%;}' +
    '#zhz-fs.mini .zhz-fs-t{display:none;}' +
    '@media (max-width:560px){#zhz-fs{padding:8px;border-radius:50%;}' +
    '#zhz-fs .zhz-fs-t{display:none;}}';

  function injectCss() {
    var s = document.createElement("style");
    s.id = "zhz-fs-style";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------------- 按钮 ---------------- */
  var btn = null;

  function place(b) {
    var pos = String(cfg.fsPos || "br").toLowerCase();
    var top = parseInt(cfg.fsTop || "", 10);
    var right = parseInt(cfg.fsRight || "", 10);
    var pad = 10;
    var sa = function (k) { return "env(safe-area-inset-" + k + ",0px)"; };
    b.style.top = b.style.bottom = b.style.left = b.style.right = "auto";

    if (pos === "tl" || pos === "tr") b.style.top = "calc(" + (isNaN(top) ? pad : top) + "px + " + sa("top") + ")";
    else b.style.bottom = "calc(" + (isNaN(top) ? pad : top) + "px + " + sa("bottom") + ")";

    if (pos === "tl" || pos === "bl") b.style.left = "calc(" + (isNaN(right) ? pad : right) + "px + " + sa("left") + ")";
    else b.style.right = "calc(" + (isNaN(right) ? pad : right) + "px + " + sa("right") + ")";
  }

  function sync() {
    if (!btn) return;
    var on = isActive();
    btn.innerHTML = (on ? ICON_OUT : ICON_IN) + '<span class="zhz-fs-t">' + (on ? "退出全屏" : "全屏") + "</span>";
    btn.title = on ? "退出全屏" : "全屏显示";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function build() {
    if (btn || !document.body) return;
    injectCss();
    btn = document.createElement("button");
    btn.id = "zhz-fs";
    btn.type = "button";
    if ("fsMini" in cfg) btn.className = "mini";
    place(btn);
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    document.body.appendChild(btn);
    sync();
    /* 页面自己也可能触发全屏（例如开局自动横屏），状态要跟着变 */
    ["fullscreenchange", "webkitfullscreenchange", "msfullscreenchange"].forEach(function (ev) {
      document.addEventListener(ev, function () { setTimeout(sync, 30); }, false);
    });
  }

  window.__FS = { toggle: toggle, enter: enter, exit: exit, isActive: isActive, can: can };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, false);
  else build();
})();
