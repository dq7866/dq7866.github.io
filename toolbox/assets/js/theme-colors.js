/* ============================================================
   免费工具箱 · 主题颜色自定义
   让用户选择喜欢的强调色，覆盖 --accent 系列变量
   ============================================================ */
(function () {
  "use strict";

  var PRESETS = [
    { name: "琥珀橙", id: "amber",   accent: "#ff4d00", accent2: "#ff7a33", soft: "#ffece2" },
    { name: "电光蓝", id: "blue",     accent: "#2563eb", accent2: "#3b82f6", soft: "#dbeafe" },
    { name: "翡翠绿", id: "emerald",  accent: "#059669", accent2: "#10b981", soft: "#d1fae5" },
    { name: "葡萄紫", id: "violet",   accent: "#7c3aed", accent2: "#8b5cf6", soft: "#ede9fe" },
    { name: "玫瑰红", id: "rose",     accent: "#e11d48", accent2: "#f43f5e", soft: "#ffe4e6" },
    { name: "青蓝",   id: "cyan",     accent: "#0891b2", accent2: "#06b6d4", soft: "#cffafe" },
    { name: "靛蓝",   id: "indigo",   accent: "#4f46e5", accent2: "#6366f1", soft: "#e0e7ff" },
    { name: "森林绿", id: "forest",   accent: "#16a34a", accent2: "#22c55e", soft: "#dcfce7" },
    { name: "岩灰",   id: "slate",    accent: "#475569", accent2: "#64748b", soft: "#f1f5f9" },
    { name: "暗夜紫", id: "darkpurple", accent: "#9333ea", accent2: "#a855f7", soft: "#f3e8ff" },
  ];

  var DARK_MAP = {
    amber:     { accent: "#ff5c14", accent2: "#ff8040", soft: "#2a1a12", ink: "#12100d" },
    blue:      { accent: "#60a5fa", accent2: "#93c5fd", soft: "#172554", ink: "#0a0f1e" },
    emerald:   { accent: "#34d399", accent2: "#6ee7b7", soft: "#052e1f", ink: "#0a1a12" },
    violet:    { accent: "#a78bfa", accent2: "#c4b5fd", soft: "#1e1037", ink: "#0f0a1a" },
    rose:      { accent: "#fb7185", accent2: "#fda4af", soft: "#3b0a14", ink: "#1a0508" },
    cyan:      { accent: "#22d3ee", accent2: "#67e8f9", soft: "#08343d", ink: "#051a1e" },
    indigo:    { accent: "#818cf8", accent2: "#a5b4fc", soft: "#1a1f4d", ink: "#0a0c1a" },
    forest:    { accent: "#4ade80", accent2: "#86efac", soft: "#0a2a14", ink: "#05140a" },
    slate:     { accent: "#94a3b8", accent2: "#cbd5e1", soft: "#1e293b", ink: "#0f172a" },
    darkpurple: { accent: "#c084fc", accent2: "#d8b4fe", soft: "#2a0f3d", ink: "#14081a" },
  };

  function currentAccentId() {
    try {
      var s = localStorage.getItem("tbx-accent");
      if (s && PRESETS.some(function (p) { return p.id === s; })) return s;
    } catch (e) {}
    return "amber";
  }

  function applyAccentColor(id) {
    var preset = PRESETS.filter(function (p) { return p.id === id; })[0] || PRESETS[0];
    var root = document.documentElement;
    var theme = root.getAttribute("data-theme") || "light";
    var colors = theme === "dark" ? (DARK_MAP[preset.id] || DARK_MAP.amber) : preset;
    root.style.setProperty("--accent", colors.accent);
    root.style.setProperty("--accent-2", colors.accent2);
    root.style.setProperty("--accent-soft", colors.soft);
    if (colors.ink) root.style.setProperty("--accent-ink", colors.ink);
    try { localStorage.setItem("tbx-accent", preset.id); } catch (e) {}
    document.querySelectorAll("[data-accent-item]").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-accent-id") === preset.id);
    });
  }

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.attributeName === "data-theme") applyAccentColor(currentAccentId());
    });
  });

  function buildAccentPicker(parent) {
    var panel = parent || document.querySelector("#tbSettingsModal .tb-modal-card");
    if (!panel) return;
    if (panel.querySelector("[data-accent-picker]")) return;

    var styleEl = document.createElement("style");
    styleEl.textContent = "[data-accent-item]:hover{transform:scale(1.15)!important}";
    document.head.appendChild(styleEl);

    var section = document.createElement("div");
    section.setAttribute("data-accent-picker", "1");
    section.style.cssText = "padding:12px 16px;border-top:1px solid var(--line)";

    var swatches = PRESETS.map(function (p) {
      return '<button type="button" data-accent-item data-accent-id="' + p.id + '" ' +
        'title="' + p.name + '" ' +
        'style="width:28px;height:28px;border-radius:8px;border:2px solid var(--line);cursor:pointer;background:' + p.accent + ';transition:transform .15s,box-shadow .15s"></button>';
    }).join("");

    section.innerHTML =
      '<div style="font-size:13px;font-weight:600;margin-bottom:8px">主题颜色</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' + swatches + '</div>' +
      '<div style="font-size:11.5px;color:var(--muted);margin-top:6px">点击色块切换强调色，即时生效并保存</div>';

    panel.appendChild(section);

    section.querySelectorAll("[data-accent-item]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyAccentColor(btn.getAttribute("data-accent-id"));
      });
    });
  }

  function init() {
    applyAccentColor(currentAccentId());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // Watch for settings panel being added to DOM
    var bodyObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        for (var j = 0; j < mutations[i].addedNodes.length; j++) {
          var node = mutations[i].addedNodes[j];
          if (node.id === "tbSettingsModal" || (node.querySelector && node.querySelector("#tbSettingsModal"))) {
            setTimeout(buildAccentPicker, 50);
            return;
          }
        }
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    // In case settings panel already exists
    if (document.querySelector("#tbSettingsModal .tb-modal-card")) buildAccentPicker();
  }

  window.TBX_Accent = { apply: applyAccentColor, current: currentAccentId, presets: PRESETS, buildPicker: buildAccentPicker };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); });
  else setTimeout(init, 0);
})();
