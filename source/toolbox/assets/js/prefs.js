/* ============================================================
   免费工具箱 · 导出预设记忆
   把每个工具页的表单参数记到 localStorage，下次自动回填。
   自动生效，无需各页面改代码。
   ============================================================ */
(function () {
  "use strict";

  var PREFIX = "tbx-prefs-";
  var EXCLUDE_TYPE = { file: 1, password: 1, hidden: 1 };
  var SKIP_IDS = { 0: 1 };

  function pageKey() {
    var f = (location.pathname.split("/").pop() || "index.html").replace(/\.html?$/i, "");
    return PREFIX + (f || "index");
  }

  function collect(root) {
    var o = {};
    var els = (root || document).querySelectorAll("input[id], select[id], textarea[id]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (EXCLUDE_TYPE[el.type]) continue;
      if (el.closest && el.closest("[data-no-prefs]")) continue;
      if (el.type === "checkbox" || el.type === "radio") o[el.id] = !!el.checked;
      else o[el.id] = el.value;
    }
    return o;
  }

  function apply(root, o) {
    if (!o) return 0;
    var n = 0;
    Object.keys(o).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || EXCLUDE_TYPE[el.type]) return;
      if (el.closest && el.closest("[data-no-prefs]")) return;
      var v = o[id];
      if (el.type === "checkbox" || el.type === "radio") {
        if (!!el.checked === !!v) return;
        el.checked = !!v;
      } else {
        if (String(el.value) === String(v)) return;
        el.value = v;
      }
      n++;
      try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
      try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    });
    return n;
  }

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key || pageKey()) || "null"); }
    catch (e) { return null; }
  }
  function write(key, obj) {
    try { localStorage.setItem(key || pageKey(), JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }
  function clear(key) {
    try { localStorage.removeItem(key || pageKey()); } catch (e) {}
  }

  function bind(root, key) {
    root = root || document.body;
    key = key || pageKey();
    // 首次进入：把默认值存下来（作为“出厂设置”基准）
    var saved = read(key);
    if (saved) apply(root, saved);
    var timer = null;
    var save = function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { write(key, collect(root)); }, 350);
    };
    root.addEventListener("input", save, true);
    root.addEventListener("change", save, true);
    return { key: key, save: function () { write(key, collect(root)); }, restore: function () { apply(root, read(key)); } };
  }

  window.TBX_prefs = { bind: bind, read: read, write: write, clear: clear, collect: collect, apply: apply, pageKey: pageKey };

  function auto() {
    // 有表单的工具页才绑定（首页/录屏等没有输入的页面自然跳过）
    var hasForm = document.querySelector("input[id], select[id], textarea[id]");
    if (!hasForm) return;
    var api = bind(document.body, pageKey());
    window.TBX_prefsApi = api;
    // 暴露给帮助面板用的“恢复上次参数”入口
    window.TBX_restorePrefs = function () {
      api.restore();
      return true;
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(auto, 60); });
  else setTimeout(auto, 60);
})();
