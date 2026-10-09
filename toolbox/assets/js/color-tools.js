/* 颜色工具箱 · 纯前端 */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 色彩数学 ---------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function hexToRgb(hex) {
    let h = String(hex || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const toHex2 = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  const rgbToHex = ({ r, g, b }) => "#" + toHex2(r) + toHex2(g) + toHex2(b);
  function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToRgb({ h, s, l }) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }
  function rgbToHsv({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h: Math.round(h), s: Math.round((mx ? d / mx : 0) * 100), v: Math.round(mx * 100) };
  }
  function rgbToCmyk({ r, g, b }) {
    const k = 1 - Math.max(r, g, b) / 255;
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    const f = (v) => Math.round(((1 - v / 255 - k) / (1 - k)) * 100);
    return { c: f(r), m: f(g), y: f(b), k: Math.round(k * 100) };
  }
  const srgb = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const luminance = ({ r, g, b }) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  function contrast(a, b) {
    const l1 = luminance(a), l2 = luminance(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  const rand = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  function copy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (btn) { const t = btn.textContent; btn.textContent = "已复制"; setTimeout(() => (btn.textContent = t), 1000); }
    }, () => alert("复制失败：" + text));
  }

  /* ---------------- 复制图片（剪贴板） ---------------- */
  function copyImage(blob, btn) {
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        .then(() => {
          if (btn) { const t = btn.textContent; btn.textContent = "已复制"; setTimeout(() => (btn.textContent = t), 1200); }
        })
        .catch(() => {
          fallbackCopyImage(blob, btn);
        });
    } else {
      fallbackCopyImage(blob, btn);
    }
  }

  function fallbackCopyImage(blob, btn) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const range = document.createRange();
        const sel = window.getSelection();
        cv.style.position = "fixed";
        cv.style.left = "-9999px";
        cv.style.top = "0";
        document.body.appendChild(cv);
        range.selectNodeContents(cv);
        sel.removeAllRanges();
        sel.addRange(range);
        const ok = document.execCommand("copy");
        document.body.removeChild(cv);
        sel.removeAllRanges();
        if (ok) {
          if (btn) { const t = btn.textContent; btn.textContent = "已复制"; setTimeout(() => (btn.textContent = t), 1200); }
        } else {
          throw new Error("execCommand failed");
        }
      } catch (e) {
        if (btn) { const t = btn.textContent; btn.textContent = "复制失败"; setTimeout(() => (btn.textContent = t), 1500); }
        setTimeout(() => alert("浏览器不支持复制图片，请下载后使用"), 100);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (btn) { const t = btn.textContent; btn.textContent = "复制失败"; setTimeout(() => (btn.textContent = t), 1500); }
      setTimeout(() => alert("浏览器不支持复制图片，请下载后使用"), 100);
    };
    img.src = url;
  }

  /**
   * 将颜色数组渲染为色板图片（横向排列，带文字标签）
   * @param {string[]} hexColors - hex 颜色数组
   * @returns {Promise<Blob>} PNG blob
   */
  function paletteToBlob(hexColors) {
    return new Promise((resolve, reject) => {
      const cols = hexColors.length;
      const sw = 120; // 每个色块宽度
      const sh = 120; // 每个色块高度
      const labelH = 28; // 标签区高度
      const W = cols * sw;
      const H = sh + labelH;

      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext("2d");

      // 背景
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      // 色块
      hexColors.forEach((hex, i) => {
        ctx.fillStyle = hex;
        ctx.fillRect(i * sw, 0, sw, sh);

        // 文字标签
        ctx.fillStyle = "#333";
        ctx.font = '14px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(hex.toUpperCase(), i * sw + sw / 2, sh + labelH / 2);
      });

      cv.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("色板图片生成失败"));
      }, "image/png");
    });
  }

  /* ============================================================
   *  调色板导出功能（多格式）
   * ============================================================ */

  /**
   * 下载 blob 为文件
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * 生成颜色名称（基于索引）
   */
  function colorName(i, total) {
    const names = ["primary", "secondary", "accent", "muted", "background", "foreground", "highlight", "warning", "success", "error"];
    if (i < names.length && total <= names.length) return names[i];
    return "color-" + (i + 1);
  }

  /**
   * 导出为 CSS 自定义属性（CSS Variables）
   */
  function exportPaletteAsCSS(hexColors, paletteName) {
    const prefix = paletteName ? "--" + paletteName + "-" : "--";
    const lines = hexColors.map((hex, i) => {
      const name = colorName(i, hexColors.length);
      const rgb = hexToRgb(hex);
      return `  ${prefix}${name}: ${hex};`;
    });
    return `:root {\n${lines.join("\n")}\n}`;
  }

  /**
   * 导出为 SCSS 变量
   */
  function exportPaletteAsSCSS(hexColors, paletteName) {
    const prefix = paletteName ? "$" + paletteName + "-" : "$";
    return hexColors.map((hex, i) => {
      const name = colorName(i, hexColors.length);
      return `${prefix}${name}: ${hex};`;
    }).join("\n");
  }

  /**
   * 导出为 Tailwind 配置片段
   */
  function exportPaletteAsTailwind(hexColors, paletteName) {
    const key = paletteName || "palette";
    const entries = hexColors.map((hex, i) => {
      const name = colorName(i, hexColors.length);
      return `    ${name}: '${hex}'`;
    }).join(",\n");
    return `// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n        ${key}: {\n${entries}\n        }\n      }\n    }\n  }\n}`;
  }

  /**
   * 导出为 JSON
   */
  function exportPaletteAsJSON(hexColors, paletteName, named) {
    if (named) {
      const obj = {};
      hexColors.forEach((hex, i) => {
        obj[colorName(i, hexColors.length)] = hex;
      });
      if (paletteName) {
        return JSON.stringify({ name: paletteName, colors: obj }, null, 2);
      }
      return JSON.stringify(obj, null, 2);
    }
    if (paletteName) {
      return JSON.stringify({ name: paletteName, colors: hexColors }, null, 2);
    }
    return JSON.stringify(hexColors, null, 2);
  }

  /**
   * 生成精美的调色板色卡 PNG
   * 包含标题、色块、HEX 值、RGB 值
   */
  function paletteCardToBlob(hexColors, paletteName) {
    return new Promise((resolve, reject) => {
      const pad = 32;             // 内边距
      const gap = 16;             // 色块间距
      const swatchH = 120;        // 色块高度
      const labelGap = 8;         // 标签间距
      const titleH = paletteName ? 48 : 0;
      const subLabelH = 22;       // HEX 标签高度
      const rgbLabelH = 18;       // RGB 标签高度
      const cardRadius = 16;      // 卡片圆角

      const cols = hexColors.length;
      const swatchW = Math.max(80, Math.min(160, Math.floor((800 - pad * 2 - gap * (cols - 1)) / cols)));
      const totalSwatchW = cols * swatchW + gap * (cols - 1);
      const W = Math.max(400, totalSwatchW + pad * 2);
      const H = pad * 2 + titleH + swatchH + labelGap + subLabelH + rgbLabelH + 10;

      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const ctx = cv.getContext("2d");

      // 背景 - 浅色渐变
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#fafafa");
      bgGrad.addColorStop(1, "#f0f0f0");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 卡片阴影
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.08)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 4;

      // 卡片背景（圆角矩形）
      const cardX = pad / 2;
      const cardY = pad / 2;
      const cardW = W - pad;
      const cardH = H - pad;
      roundRect(ctx, cardX, cardY, cardW, cardH, cardRadius);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();

      // 标题
      let contentY = pad;
      if (paletteName) {
        ctx.fillStyle = "#1a1a1a";
        ctx.font = 'bold 20px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(paletteName, W / 2, contentY);
        contentY += titleH;
      }

      // 计算色块起始 x
      const swatchStartX = (W - totalSwatchW) / 2;

      // 绘制每个色块
      hexColors.forEach((hex, i) => {
        const x = swatchStartX + i * (swatchW + gap);
        const y = contentY;

        // 色块（圆角）
        const swatchRadius = 10;
        roundRect(ctx, x, y, swatchW, swatchH, swatchRadius);
        ctx.fillStyle = hex;
        ctx.fill();

        // 浅色边框
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // HEX 标签
        ctx.fillStyle = "#333";
        ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",monospace,sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(hex.toUpperCase(), x + swatchW / 2, y + swatchH + labelGap);

        // RGB 标签
        const rgb = hexToRgb(hex);
        if (rgb) {
          ctx.fillStyle = "#888";
          ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
          ctx.fillText(`${rgb.r}, ${rgb.g}, ${rgb.b}`, x + swatchW / 2, y + swatchH + labelGap + subLabelH + 2);
        }
      });

      cv.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("色卡图片生成失败"));
      }, "image/png");
    });
  }

  /**
   * Canvas 圆角矩形辅助函数
   */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ============================================================
   *  全局导出下拉菜单点击外部关闭（单一监听器，避免内存泄漏）
   * ============================================================ */
  function closeAllExportMenus() {
    $$(".export-menu").forEach((m) => { m.style.display = "none"; });
    const gMenu = document.querySelector("#gExportDropdown > div:last-child");
    if (gMenu) gMenu.style.display = "none";
  }

  // 只注册一次全局 document 点击监听器
  let _exportDocListenerRegistered = false;
  function ensureExportDocListener() {
    if (_exportDocListenerRegistered) return;
    _exportDocListenerRegistered = true;
    document.addEventListener("click", (e) => {
      // 检查点击是否在任意导出下拉菜单内部
      const dropdown = e.target.closest(".export-dropdown, #gExportDropdown");
      if (!dropdown) {
        closeAllExportMenus();
      }
    });
  }

  /**
   * 创建导出下拉菜单
   * @param {HTMLElement} container - 容器元素（插入到该容器中）
   * @param {Function} colorsGetter - 返回当前 hex 颜色数组的函数
   * @param {string} paletteName - 调色板名称（用于文件名和变量前缀）
   * @param {object} options - 配置选项
   */
  function createExportDropdown(container, colorsGetter, paletteName, options) {
    options = options || {};
    const btnText = options.btnText || "导出";
    const className = options.className || "";

    // 确保全局监听器已注册
    ensureExportDocListener();

    // 包装器
    const wrapper = document.createElement("div");
    wrapper.className = "export-dropdown " + className;
    wrapper.style.position = "relative";
    wrapper.style.display = "inline-block";

    // 导出按钮
    const btn = document.createElement("button");
    btn.className = "btn ghost export-btn";
    btn.innerHTML = btnText + ' <span style="font-size:10px;opacity:0.7">▾</span>';
    btn.style.minWidth = "90px";
    wrapper.appendChild(btn);

    // 下拉菜单
    const menu = document.createElement("div");
    menu.className = "export-menu";
    menu.style.cssText = `
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 200px;
      background: var(--bg, #fff);
      border: 1px solid var(--line, #e5e5e5);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      padding: 6px;
      z-index: 100;
      display: none;
    `;

    const menuItems = [
      { key: "hex", label: "复制全部 HEX", desc: "每行一个 HEX 值", icon: "#" },
      { key: "css", label: "CSS Variables", desc: ":root { --color-1: ... }", icon: "{}" },
      { key: "scss", label: "SCSS 变量", desc: "$color-1: #ff0000;", icon: "$" },
      { key: "tailwind", label: "Tailwind Config", desc: "tailwind.config.js 片段", icon: "TW" },
      { key: "json", label: "JSON 格式", desc: '["#ff0000", ...]', icon: "{}" },
      { key: "copyImg", label: "复制色板图", desc: "复制图片到剪贴板", icon: "🖼" },
      { key: "png", label: "下载 PNG 色卡", desc: "精美的色卡图片", icon: "⬇" },
    ];

    menuItems.forEach((item) => {
      const mi = document.createElement("div");
      mi.className = "export-menu-item";
      mi.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text, #333);
        transition: background 0.15s;
      `;
      mi.innerHTML = `
        <span style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:var(--bg-soft,#f5f5f5);border-radius:6px;font-size:11px;font-weight:600;flex-shrink:0">${item.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:500">${item.label}</div>
          <div style="font-size:11px;color:var(--text-muted,#999);margin-top:2px">${item.desc}</div>
        </div>
      `;
      mi.addEventListener("mouseenter", () => {
        mi.style.background = "var(--bg-soft, #f5f5f5)";
      });
      mi.addEventListener("mouseleave", () => {
        mi.style.background = "transparent";
      });
      mi.addEventListener("click", () => {
        const colors = colorsGetter();
        if (!colors || !colors.length) {
          alert("没有可导出的颜色");
          return;
        }
        handleExport(item.key, colors, paletteName, btn);
        menu.style.display = "none";
      });
      menu.appendChild(mi);
    });

    // 分割线
    const divider = document.createElement("div");
    divider.style.cssText = "height:1px;background:var(--line,#e5e5e5);margin:4px 6px";
    // 在 "复制色板图" 前插入分割线（第6项前）
    const sixthItem = menu.children[5];
    if (sixthItem) {
      menu.insertBefore(divider.cloneNode(true), sixthItem);
    }

    wrapper.appendChild(menu);

    // 按钮点击切换菜单
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menu.style.display === "block";
      // 关闭所有其他导出菜单
      closeAllExportMenus();
      menu.style.display = isOpen ? "none" : "block";
    });

    container.appendChild(wrapper);
    return wrapper;
  }

  /**
   * 处理导出操作
   */
  function handleExport(format, hexColors, paletteName, btn) {
    const pName = paletteName || "palette";
    const safeName = pName.replace(/[^\w\u4e00-\u9fa5-]/g, "_");

    switch (format) {
      case "hex":
        copy(hexColors.join("\n"), btn);
        break;
      case "css":
        copy(exportPaletteAsCSS(hexColors, safeName === "palette" ? "" : safeName), btn);
        break;
      case "scss":
        copy(exportPaletteAsSCSS(hexColors, safeName === "palette" ? "" : safeName), btn);
        break;
      case "tailwind":
        copy(exportPaletteAsTailwind(hexColors, safeName === "palette" ? "" : safeName), btn);
        break;
      case "json":
        copy(exportPaletteAsJSON(hexColors, pName, true), btn);
        break;
      case "copyImg":
        (async () => {
          try {
            const blob = await paletteToBlob(hexColors);
            copyImage(blob, btn);
          } catch (err) {
            const t = btn.textContent;
            btn.textContent = "复制失败";
            setTimeout(() => (btn.textContent = t), 1500);
          }
        })();
        break;
      case "png":
        (async () => {
          try {
            const blob = await paletteCardToBlob(hexColors, pName);
            downloadBlob(blob, safeName + "-palette.png");
            const t = btn.textContent;
            btn.textContent = "已下载";
            setTimeout(() => (btn.textContent = t), 1200);
          } catch (err) {
            const t = btn.textContent;
            btn.textContent = "下载失败";
            setTimeout(() => (btn.textContent = t), 1500);
          }
        })();
        break;
    }
  }

  /* ---------------- tabs ---------------- */
  $$("#cTabs .tab").forEach((b) => {
    b.onclick = () => {
      $$("#cTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".c-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
    };
  });

  /* ---------------- 01 转换 ---------------- */
  function syncConv(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const h = rgbToHex(rgb);
    $("#cMain").value = h;
    $("#cHex").value = h;
    const hsl = rgbToHsl(rgb), hsv = rgbToHsv(rgb), cmyk = rgbToCmyk(rgb);
    $("#cRgb").value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    $("#cHsl").value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    $("#cHsv").value = `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`;
    $("#cCmyk").value = `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`;
    $("#cBig").style.background = h;
    const lum = luminance(rgb);
    $("#cInfo").textContent = `相对亮度 ${lum.toFixed(3)} · 与白色对比 ${contrast(rgb, { r: 255, g: 255, b: 255 }).toFixed(2)}:1 · 与黑色对比 ${contrast(rgb, { r: 0, g: 0, b: 0 }).toFixed(2)}:1`;
  }
  $("#cMain").addEventListener("input", (e) => syncConv(e.target.value));
  $("#cHex").addEventListener("input", (e) => { const rgb = hexToRgb(e.target.value); if (rgb) syncConv(rgbToHex(rgb)); });
  $$("[data-copy]").forEach((b) => (b.onclick = () => copy($("#" + b.dataset.copy).value, b)));
  if (window.EyeDropper) {
    $("#eyedropper").onclick = async () => {
      try {
        const r = await new EyeDropper().open();
        const hex = r.sRGBHex;
        syncConv(hex);
        // 同步更新配色面板
        const hBase = $("#hBase");
        if (hBase) { hBase.value = hex; renderHarmony(); }
        // 同步更新对比度前景色
        const fgC = $("#fgC");
        if (fgC) { fgC.value = hex; renderContrast(); }
        // 同步更新渐变色第一个色标
        if (stops && stops.length) {
          stops[0].c = hex;
          const gCss = $("#gCss");
          if (gCss) updateGradient();
        }
      } catch (e) { /* 用户取消 */ }
    };
  } else {
    $("#eyedropper").disabled = true;
    $("#eyedropper").title = "当前浏览器不支持屏幕取色（需 Chrome/Edge）";
  }
  syncConv("#ff4d00");

  /* ---------------- 02 配色 ---------------- */
  const H_STEP = { complement: [0, 180], analogous: [-60, -30, 0, 30, 60], triadic: [0, 120, 240], split: [0, 150, 210], tetradic: [0, 90, 180, 270] };
  function harmony(scheme, baseRgb) {
    const hsl = rgbToHsl(baseRgb);
    const out = [];
    if (scheme === "mono") {
      [12, 26, 40, 55, 70, 86].forEach((l) => out.push(hslToRgb({ h: hsl.h, s: clamp(hsl.s, 25, 90), l })));
    } else if (scheme === "random") {
      const h0 = rand(360);
      [-40, -20, 0, 20, 40, 60].forEach((d) => out.push(hslToRgb({ h: h0 + d, s: clamp(45 + rand(45), 30, 95), l: clamp(40 + rand(35), 28, 78) })));
    } else {
      const offs = H_STEP[scheme] || H_STEP.complement;
      offs.forEach((o) => {
        out.push(hslToRgb({ h: hsl.h + o, s: clamp(hsl.s, 35, 95), l: clamp(hsl.l, 30, 70) }));
        out.push(hslToRgb({ h: hsl.h + o, s: clamp(hsl.s, 35, 95), l: clamp(hsl.l - 25, 15, 45) }));
      });
    }
    return out;
  }

  // 配色方案中文名称映射
  const SCHEME_NAMES = {
    complement: "互补色",
    analogous: "类似色",
    triadic: "三角配色",
    split: "分裂互补",
    tetradic: "四色方形",
    mono: "单色明暗",
    random: "随机和谐色"
  };

  let _harmonyColors = []; // 缓存当前配色颜色

  function renderHarmony() {
    const base = hexToRgb($("#hBase").value) || { r: 59, g: 130, b: 246 };
    const scheme = $("#hScheme").value;
    const cols = harmony(scheme, base);
    _harmonyColors = cols.map(rgbToHex);

    const box = $("#hOut");
    box.innerHTML = "";
    cols.forEach((c) => {
      const hex = rgbToHex(c);
      const d = document.createElement("div");
      d.className = "swatch";
      d.innerHTML = `<div class="c" style="background:${hex}"></div><div class="l">${hex}</div>`;
      d.onclick = () => copy(hex);
      box.appendChild(d);
    });

    // 添加导出下拉菜单（替换原有的复制全部HEX和复制色板图按钮）
    const btnRow = $("#hOut").parentElement.querySelector(".btn-row");
    if (btnRow) {
      // 清空旧的动态按钮（保留原有的静态按钮会在HTML中，我们替换掉）
      const oldExport = btnRow.querySelector(".export-dropdown");
      if (oldExport) oldExport.remove();
      const oldCopyImg = btnRow.querySelector("#hCopyImg");
      if (oldCopyImg) oldCopyImg.remove();

      // 将原有 hCopyAll 替换为导出下拉
      const hCopyAll = btnRow.querySelector("#hCopyAll");
      if (hCopyAll) hCopyAll.style.display = "none";

      createExportDropdown(btnRow, () => _harmonyColors, "配色方案 · " + (SCHEME_NAMES[scheme] || scheme), {
        btnText: "导出",
      });
    }
  }
  $("#hBase").addEventListener("input", renderHarmony);
  $("#hScheme").addEventListener("change", renderHarmony);
  $("#hShuffle").onclick = () => { $("#hBase").value = rgbToHex({ r: rand(256), g: rand(256), b: rand(256) }); renderHarmony(); };
  renderHarmony();

  /* ---------------- 03 渐变 ---------------- */
  let stops = [{ c: "#ff4d00", p: 0 }, { c: "#ffb800", p: 100 }];

  // 按位置排序色标（保持 stops 数组与 UI 顺序一致）
  function sortStops() {
    stops.sort((a, b) => a.p - b.p);
  }

  function renderGradient() {
    const type = $("#gType .active").dataset.v;
    const angle = +$("#gAngle").value;
    const box = $("#gStops");
    box.innerHTML = "";
    stops.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "row";
      row.style.alignItems = "flex-end";
      row.innerHTML = `
        <div class="field" style="flex:0 0 auto;margin-bottom:8px"><input type="color" value="${s.c}" data-i="${i}" class="sc"></div>
        <div class="field" style="margin-bottom:8px"><label>位置 ${s.p}%</label><input type="range" min="0" max="100" value="${s.p}" data-i="${i}" class="sp"></div>
        <div class="field" style="flex:0 0 auto;margin-bottom:8px"><button class="btn ghost danger gr" data-i="${i}" ${stops.length <= 2 ? "disabled" : ""}>删除</button></div>`;
      row.querySelector(".sc").oninput = (e) => { stops[+e.target.dataset.i].c = e.target.value; updateGradient(); };
      row.querySelector(".sp").oninput = (e) => {
        stops[+e.target.dataset.i].p = +e.target.value;
        const lb = e.target.previousElementSibling;
        if (lb) lb.textContent = "位置 " + e.target.value + "%";
        updateGradient();
      };
      row.querySelector(".gr").onclick = (e) => {
        stops.splice(+e.target.dataset.i, 1);
        sortStops();
        renderGradient();
      };
      box.appendChild(row);
    });
    updateGradient();
  }
  function cssGradient() {
    const type = $("#gType .active").dataset.v;
    const angle = +$("#gAngle").value;
    const list = stops.slice().sort((a, b) => a.p - b.p).map((s) => `${s.c} ${s.p}%`).join(", ");
    return type === "linear" ? `linear-gradient(${angle}deg, ${list})` : `radial-gradient(circle, ${list})`;
  }
  function updateGradient() {
    const css = cssGradient();
    $("#gPreview").style.background = css;
    $("#gCss").value = `background: ${css};`;
  }
  $("#gType").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $$("#gType button").forEach((x) => x.classList.toggle("active", x === b)); updateGradient(); });
  $("#gAngle").addEventListener("input", (e) => { $("#gAngleVal").textContent = e.target.value + "°"; updateGradient(); });
  $("#gAdd").onclick = () => {
    if (stops.length >= 6) return alert("最多 6 个色标");
    stops.splice(stops.length - 1, 0, { c: rgbToHex({ r: rand(256), g: rand(256), b: rand(256) }), p: 50 });
    sortStops();
    renderGradient();
  };
  $("#gCopy").onclick = (e) => copy($("#gCss").value, e.target);

  // 渐变色板导出按钮
  (function addGradientExportBtn() {
    const btnRow = $("#gCss").parentElement.parentElement.querySelector(".btn-row");
    if (btnRow && !btnRow.querySelector("#gExportDropdown")) {
      // 确保全局监听器已注册
      ensureExportDocListener();

      // 移除旧的复制背景图按钮（如果存在）
      const oldCopyImg = btnRow.querySelector("#gCopyImg");
      if (oldCopyImg) oldCopyImg.remove();

      const wrapper = document.createElement("div");
      wrapper.id = "gExportDropdown";
      wrapper.style.position = "relative";
      wrapper.style.display = "inline-block";

      const btn = document.createElement("button");
      btn.className = "btn ghost";
      btn.innerHTML = '导出色板 <span style="font-size:10px;opacity:0.7">▾</span>';
      btn.style.minWidth = "110px";
      wrapper.appendChild(btn);

      const menu = document.createElement("div");
      menu.style.cssText = `
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        min-width: 200px;
        background: var(--bg, #fff);
        border: 1px solid var(--line, #e5e5e5);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        padding: 6px;
        z-index: 100;
        display: none;
      `;

      const items = [
        { key: "hex", label: "复制全部 HEX", desc: "色标颜色列表", icon: "#" },
        { key: "css", label: "CSS Variables", desc: "渐变颜色变量", icon: "{}" },
        { key: "scss", label: "SCSS 变量", desc: "$color-1: #ff0000;", icon: "$" },
        { key: "tailwind", label: "Tailwind Config", desc: "tailwind.config.js 片段", icon: "TW" },
        { key: "json", label: "JSON 格式", desc: '["#ff0000", ...]', icon: "{}" },
        { key: "copyImg", label: "复制色板图", desc: "色标颜色色板图", icon: "🖼" },
        { key: "png", label: "下载 PNG 色卡", desc: "精美的色卡图片", icon: "⬇" },
        { key: "copyBg", label: "复制渐变背景图", desc: "完整渐变效果图", icon: "🎨" },
        { key: "downloadBg", label: "下载渐变背景图", desc: "800x400 PNG", icon: "⬇" },
      ];

      items.forEach((item, idx) => {
        if (idx === 6 || idx === 7) {
          const divider = document.createElement("div");
          divider.style.cssText = "height:1px;background:var(--line,#e5e5e5);margin:4px 6px";
          menu.appendChild(divider);
        }
        const mi = document.createElement("div");
        mi.style.cssText = `
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          color: var(--text, #333);
          transition: background 0.15s;
        `;
        mi.innerHTML = `
          <span style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:var(--bg-soft,#f5f5f5);border-radius:6px;font-size:11px;font-weight:600;flex-shrink:0">${item.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:500">${item.label}</div>
            <div style="font-size:11px;color:var(--text-muted,#999);margin-top:2px">${item.desc}</div>
          </div>
        `;
        mi.addEventListener("mouseenter", () => { mi.style.background = "var(--bg-soft, #f5f5f5)"; });
        mi.addEventListener("mouseleave", () => { mi.style.background = "transparent"; });
        mi.addEventListener("click", () => {
          const sorted = stops.slice().sort((a, b) => a.p - b.p);
          const hexColors = sorted.map((s) => s.c);

          if (item.key === "copyBg") {
            copyGradientImage(btn, false);
          } else if (item.key === "downloadBg") {
            copyGradientImage(btn, true);
          } else {
            handleExport(item.key, hexColors, "渐变色板", btn);
          }
          menu.style.display = "none";
        });
        menu.appendChild(mi);
      });

      wrapper.appendChild(menu);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = menu.style.display === "block";
        closeAllExportMenus();
        menu.style.display = isOpen ? "none" : "block";
      });

      btnRow.appendChild(wrapper);
    }
  })();

  // 复制/下载渐变背景图
  function copyGradientImage(btn, download) {
    try {
      const W = 800, H = 400;
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const ctx = cv.getContext("2d");
      const type = $("#gType .active").dataset.v;
      const angle = +$("#gAngle").value;
      const sorted = stops.slice().sort((a, b) => a.p - b.p);

      if (type === "linear") {
        const grad = ctx.createLinearGradient(0, 0,
          Math.cos((angle - 90) * Math.PI / 180) * W + W / 2,
          Math.sin((angle - 90) * Math.PI / 180) * H + H / 2
        );
        sorted.forEach((s) => grad.addColorStop(s.p / 100, s.c));
        ctx.fillStyle = grad;
      } else {
        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) / 2);
        sorted.forEach((s) => grad.addColorStop(s.p / 100, s.c));
        ctx.fillStyle = grad;
      }
      ctx.fillRect(0, 0, W, H);
      cv.toBlob((blob) => {
        if (blob) {
          if (download) {
            downloadBlob(blob, "gradient-" + type + ".png");
            const t = btn.textContent;
            btn.textContent = "已下载";
            setTimeout(() => (btn.textContent = t), 1200);
          } else {
            copyImage(blob, btn);
          }
        } else {
          const t = btn.textContent;
          btn.textContent = "失败";
          setTimeout(() => (btn.textContent = t), 1500);
        }
      }, "image/png");
    } catch (err) {
      const t = btn.textContent;
      btn.textContent = "失败";
      setTimeout(() => (btn.textContent = t), 1500);
    }
  }

  renderGradient();

  /* ---------------- 04 对比度 ---------------- */
  function renderContrast() {
    const fg = hexToRgb($("#fgC").value), bg = hexToRgb($("#bgC").value);
    if (!fg || !bg) return;
    const r = contrast(fg, bg);
    const badge = (ok, label) => `<span class="badge ${ok ? "ok" : "no"}">${label} ${ok ? "通过" : "不通过"}</span>`;
    $("#ctStats").innerHTML = `
      <div class="stats">
        <div class="stat hero-stat"><div class="k">对比度</div><div class="v">${r.toFixed(2)}:1</div></div>
        <div class="stat"><div class="k">正文标准</div><div class="v" style="font-size:13px;line-height:1.9">${badge(r >= 4.5, "AA")} ${badge(r >= 7, "AAA")}</div></div>
        <div class="stat"><div class="k">大号文字</div><div class="v" style="font-size:13px;line-height:1.9">${badge(r >= 3, "AA")} ${badge(r >= 4.5, "AAA")}</div></div>
      </div>`;
    $("#ctDemo").style.background = $("#bgC").value;
    $("#ctDemo").style.color = $("#fgC").value;
  }
  $("#fgC").addEventListener("input", renderContrast);
  $("#bgC").addEventListener("input", renderContrast);
  $("#swapC").onclick = () => { const a = $("#fgC").value; $("#fgC").value = $("#bgC").value; $("#bgC").value = a; renderContrast(); };
  renderContrast();

  /* ---------------- 05 图片取色 ---------------- */
  let _pImgUrl = null;
  function dist(a, b) { return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2); }
  function extractPalette(img, count) {
    if (!img || !img.width || !img.height || count <= 0) return [];
    const max = 180;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    let d;
    try {
      d = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      return []; // 跨域图片等情况无法读取像素
    }
    const map = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const e = map.get(key) || { r: 0, g: 0, b: 0, n: 0 };
      e.r += r; e.g += g; e.b += b; e.n++; map.set(key, e);
    }
    const arr = [...map.values()].map((e) => ({ r: Math.round(e.r / e.n), g: Math.round(e.g / e.n), b: Math.round(e.b / e.n), n: e.n })).sort((a, b) => b.n - a.n);
    const out = [];
    for (const c of arr) { if (out.every((o) => dist(o, c) > 42)) out.push(c); if (out.length >= count) break; }
    return out;
  }

  let _pickerColors = []; // 缓存图片取色结果

  async function pickFromImage(file) {
    if (_pImgUrl) { URL.revokeObjectURL(_pImgUrl); _pImgUrl = null; }
    const url = URL.createObjectURL(file);
    _pImgUrl = url;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    $("#pImgWrap").innerHTML = `<img src="${url}" style="max-width:100%;max-height:260px;border-radius:12px;border:1px solid var(--line)">`;
    const cols = extractPalette(img, 10);
    _pickerColors = cols.map(rgbToHex);

    const box = $("#pOut"); box.innerHTML = "";
    if (!cols.length) {
      box.innerHTML = '<div class="hint">未能提取到有效颜色，请换一张图片试试。</div>';
      // 移除旧的导出行
      const oldRow = box.parentElement.querySelector("#pExportRow");
      if (oldRow) oldRow.remove();
      return;
    }
    cols.forEach((c) => {
      const hex = rgbToHex(c);
      const d = document.createElement("div");
      d.className = "swatch";
      d.innerHTML = `<div class="c" style="background:${hex}"></div><div class="l">${hex}</div>`;
      d.onclick = () => copy(hex);
      box.appendChild(d);
    });

    // 添加导出按钮行（替换旧的复制色板图按钮）
    let exportRow = box.parentElement.querySelector("#pExportRow");
    if (!exportRow) {
      exportRow = document.createElement("div");
      exportRow.id = "pExportRow";
      exportRow.className = "btn-row";
      exportRow.style.marginTop = "10px";
      box.parentElement.appendChild(exportRow);
    }
    exportRow.innerHTML = "";
    createExportDropdown(exportRow, () => _pickerColors, "图片提取色板", {
      btnText: "导出",
    });

    // 移除旧的复制色板图按钮行
    const oldCopyImgRow = box.parentElement.querySelector("#pCopyImgRow");
    if (oldCopyImgRow) oldCopyImgRow.remove();
  }
  const pd = $("#pDrop");
  $("#pInput").addEventListener("change", (e) => { if (e.target.files[0]) pickFromImage(e.target.files[0]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => pd.addEventListener(ev, (e) => { e.preventDefault(); pd.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => pd.addEventListener(ev, (e) => { e.preventDefault(); pd.classList.remove("over"); }));
  pd.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) pickFromImage(f); });
  pd.addEventListener("click", () => $("#pInput").click());
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.files;
    if (items && items.length) { const f = Array.from(items).find((x) => x.type.startsWith("image/")); if (f) pickFromImage(f); }
  });
})();
