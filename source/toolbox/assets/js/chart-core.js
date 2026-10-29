/* 图表工坊 · 渲染核心 v3（自包含、可序列化）
 * 只负责：解析数据 → 布局模型 → 图元 → Canvas / SVG 双渲染
 * 不依赖 DOM，可被导出文件单独复用（makeCore.toString()）
 */
function makeCore() {
  "use strict";
  var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

  var PALETTES = [
    { name: "琥珀橙", colors: ["#ff4d00", "#ff8a3d", "#ffb26b", "#f59e0b", "#c2410c", "#ffd09b", "#ea580c", "#fbbf24"] },
    { name: "商务蓝", colors: ["#2563eb", "#3b82f6", "#0ea5e9", "#60a5fa", "#6366f1", "#1d4ed8", "#38bdf8", "#818cf8"] },
    { name: "自然绿", colors: ["#059669", "#10b981", "#34d399", "#65a30d", "#14b8a6", "#047857", "#84cc16", "#2dd4bf"] },
    { name: "优雅紫", colors: ["#7c3aed", "#8b5cf6", "#a855f7", "#6366f1", "#c084fc", "#4c1d95", "#d946ef", "#a78bfa"] },
    { name: "活力红", colors: ["#dc2626", "#ef4444", "#f43f5e", "#f97316", "#fb7185", "#b91c1c", "#e11d48", "#fca5a5"] },
    { name: "清新青", colors: ["#0891b2", "#06b6d4", "#22d3ee", "#2dd4bf", "#0ea5e9", "#155e75", "#67e8f9", "#5eead4"] },
    { name: "莫兰迪", colors: ["#9c8f7f", "#a9b3a0", "#a8a3b8", "#c4a89b", "#8d9aa8", "#b7ab93", "#9aa79c", "#b49aa8"] },
    { name: "霓虹夜", colors: ["#22d3ee", "#a3e635", "#f472b6", "#facc15", "#818cf8", "#fb7185", "#34d399", "#e879f9"] },
    { name: "极简灰", colors: ["#334155", "#64748b", "#94a3b8", "#475569", "#0f172a", "#cbd5e1", "#7c8798", "#aeb9c7"] },
    { name: "彩虹糖", colors: ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"] }
  ];
  var FALLBACK = ["#2563eb", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6", "#6366f1", "#a16207"];

  /* ---------- 颜色 ---------- */
  function rgba(hex, a) {
    if (!hex || hex.charAt(0) !== "#") return hex;
    var h = hex.slice(1);
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function lum(hex) {
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  function lighten(hex, k) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * k); g = Math.round(g + (255 - g) * k); b = Math.round(b + (255 - b) * k);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  /* 色相旋转：瀑布图负值柱与主色保持足够区分 */
  function mixHex(a, b, k) {
    function ch(h, s) { h = String(h).replace("#", ""); if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); return parseInt(h.substr(s * 2, 2), 16); }
    function f(x, y) { return Math.round(x + (y - x) * k); }
    var r = f(ch(a, 0), ch(b, 0)), g = f(ch(a, 1), ch(b, 1)), bl = f(ch(a, 2), ch(b, 2));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function hueShift(hex, deg) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    var r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, hue = 0;
    if (d > 0) {
      if (mx === r) hue = ((g - b) / d) % 6;
      else if (mx === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60; if (hue < 0) hue += 360;
    }
    hue = (hue + deg + 360) % 360;
    var s = mx === 0 ? 0 : d / mx, v = mx;
    var c = v * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = v - c, r2, g2, b2;
    if (hue < 60) { r2 = c; g2 = x; b2 = 0; }
    else if (hue < 120) { r2 = x; g2 = c; b2 = 0; }
    else if (hue < 180) { r2 = 0; g2 = c; b2 = x; }
    else if (hue < 240) { r2 = 0; g2 = x; b2 = c; }
    else if (hue < 300) { r2 = x; g2 = 0; b2 = c; }
    else { r2 = c; g2 = 0; b2 = x; }
    r2 = Math.round((r2 + m) * 255); g2 = Math.round((g2 + m) * 255); b2 = Math.round((b2 + m) * 255);
    return "#" + ((1 << 24) + (r2 << 16) + (g2 << 8) + b2).toString(16).slice(1);
  }
  function palColor(st, i) {
    var p = PALETTES[st && st.palette != null ? st.palette : 0] || PALETTES[0];
    return i < p.colors.length ? p.colors[i] : FALLBACK[i % FALLBACK.length];
  }
  function cfgOf(st, i) { return (st.seriesCfg || [])[i] || {}; }
  /* 系列绘制形态：点 / 折线 / 曲线（散点图与折线图逐系列可选） */
  function kindOf(st, si) {
    var c = cfgOf(st, si);
    if (c.kind === "point" || c.kind === "line" || c.kind === "curve") return c.kind;
    return st.type === "scatter" ? "point" : "line";
  }
  function axisOf(st, i) { return st.dualAxis && cfgOf(st, i).axis === "R" ? "R" : "L"; }
  function colorOf(st, i) { return cfgOf(st, i).color || palColor(st, i); }

  /* ---------- 文本与数值 ---------- */
  function estW(s, fs) {
    s = String(s == null ? "" : s);
    var w = 0;
    for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? fs : fs * 0.58;
    return w;
  }
  function trunc(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function trimFixed(v, d) {
    var s = Number(v).toFixed(d);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s === "" || s === "-0" ? "0" : s;
  }
  function autoNum(v) {
    var av = Math.abs(v);
    if (av >= 1e8) return trimFixed(v / 1e8, 2) + "亿";
    if (av >= 1e4) return trimFixed(v / 1e4, av >= 1e6 ? 0 : 1) + "万";
    if (av >= 1000) return trimFixed(v, Number.isInteger(v) ? 0 : 1);
    if (Number.isInteger(v)) return String(v);
    return trimFixed(v, 2);
  }
  function groupNum(s) {
    return String(s).replace(/^(-?)(\d+)(\.\d+)?$/, function (m, sign, int, dec) {
      return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dec || "");
    });
  }
  function tickText(v, st) {
    var body = st.thousands ? groupNum(trimFixed(v, Number.isInteger(v) ? 0 : 1)) : autoNum(v);
    return body + (st.unitSuf || "");
  }
  function numText(v, st) {
    var d = st.decimals, body;
    if (d === 0 || d === 1 || d === 2 || d === 3) body = (d === 0 ? String(Math.round(v)) : Number(v).toFixed(d));
    else if (st.thousands) body = trimFixed(v, Number.isInteger(v) ? 0 : (Math.abs(v) >= 100 ? 1 : 2));
    else body = autoNum(v);
    if (st.thousands) body = groupNum(body);
    return (st.unitPre || "") + body + (st.unitSuf || "");
  }
  function pctText(v) { return trimFixed(v * 100, 1) + "%"; }

  /* ---------- 数据解析 ---------- */
  function cleanNum(s) {
    var t = String(s == null ? "" : s).replace(/[¥$€￥,\s]/g, "").replace(/%$/, "");
    return t === "" ? NaN : Number(t);
  }
  function isNumericCell(s) { return String(s).trim() !== "" && !isNaN(cleanNum(s)); }
  function splitLine(line) {
    if (line.indexOf("\t") >= 0) return line.split("\t").map(function (s) { return s.trim(); });
    if (line.indexOf("，") >= 0) return line.split("，").map(function (s) { return s.trim(); });
    if (line.indexOf(";") >= 0 && line.indexOf(",") < 0) return line.split(";").map(function (s) { return s.trim(); });
    return line.split(",").map(function (s) { return s.trim(); });
  }
  function parseCSV(text) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter(function (l) { return l.trim() !== ""; });
    if (!lines.length) return { labels: [], series: [], names: [], hasHeader: false };
    var rows = lines.map(function (l) { return splitLine(l.replace(/^["']|["']$/g, "")); });
    var width = 1;
    rows.forEach(function (r) { if (r.length > width) width = r.length; });
    rows.forEach(function (r) { while (r.length < width) r.push(""); });
    var first = rows[0];
    var hasHeader = width >= 2 && first.slice(1).every(function (c) { return c === "" || !isNumericCell(c); });
    var header = hasHeader ? first.slice(1) : null;
    var body = hasHeader ? rows.slice(1) : rows;
    var labels = [], cols = [];
    body.forEach(function (r) {
      labels.push(String(r[0] == null ? "" : r[0]));
      for (var i = 1; i < width; i++) {
        if (!cols[i - 1]) cols[i - 1] = [];
        var v = cleanNum(r[i]);
        cols[i - 1].push(isNaN(v) ? 0 : v);
      }
    });
    var series = cols.map(function (c) { return c || []; });
    var names = series.map(function (_, i) {
      if (header && header[i]) return String(header[i]);
      return i === 0 && series.length === 1 ? "数值" : "系列" + (i + 1);
    });
    return { labels: labels, series: series, names: names, hasHeader: hasHeader };
  }

  /* ---------- 刻度 ---------- */
  function niceNum(x) {
    if (x <= 0 || !isFinite(x)) return 1;
    var e = Math.floor(Math.log10(x)), f = x / Math.pow(10, e);
    var nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    return nf * Math.pow(10, e);
  }
  function niceScale(lo, hi, count, snap) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) { lo = 0; hi = 1; }
    var step = niceNum((hi - lo) / Math.max(2, count || 5));
    var min, max;
    if (snap) {
      min = Math.floor(lo / step) * step;
      max = Math.ceil(hi / step) * step;
      if (max === min) max = min + step;
    } else { min = lo; max = hi; }
    var ticks = [];
    for (var v = min, g = 0; v <= max + step * 1e-9 && g < 200; v += step, g++) ticks.push(Math.round(v * 1e6) / 1e6);
    return { min: min, max: max, step: step, ticks: ticks };
  }
  function seriesExtent(st, data, axis) {
    var idxs = [];
    for (var i = 0; i < data.series.length; i++) if (axisOf(st, i) === axis) idxs.push(i);
    if (!idxs.length) return [0, 1];
    var n = data.labels.length;
    if (st.type === "stacked") {
      if (st.pctStack) return [0, 100];
      var pos = 0, neg = 0;
      for (var k = 0; k < n; k++) {
        var sp = 0, sn = 0;
        idxs.forEach(function (i) { var v = data.series[i][k] || 0; if (v >= 0) sp += v; else sn += v; });
        if (sp > pos) pos = sp;
        if (sn < neg) neg = sn;
      }
      return [neg, pos];
    }
    if (st.type === "waterfall") {
      var run = 0, mn0 = 0, mx0 = 0;
      (data.series[idxs[0]] || []).forEach(function (v) { run += v; if (run > mx0) mx0 = run; if (run < mn0) mn0 = run; });
      return [Math.min(mn0, 0), Math.max(mx0, 0)];
    }
    var mn = Infinity, mx = -Infinity;
    idxs.forEach(function (i) { (data.series[i] || []).forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; }); });
    if (mn === Infinity) return [0, 1];
    return [mn, mx];
  }
  function scaleFor(st, data, axis) {
    var p = axis === "R" ? "y2" : "y";
    var ex = seriesExtent(st, data, axis), mn = ex[0], mx = ex[1];
    var lo = parseFloat(st[p + "Min"]), hi = parseFloat(st[p + "Max"]);
    var hasLo = isFinite(lo), hasHi = isFinite(hi);
    if (!hasLo) lo = mn < 0 ? mn : 0;
    if (!hasHi) hi = mx > 0 ? mx : (mx === 0 ? 1 : mx);
    if (hi <= lo) hi = lo + (lo === 0 ? 1 : Math.abs(lo) * 0.35);
    return niceScale(lo, hi, st.yTickCount || 5, !(hasLo && hasHi));
  }
  function rotAngle(st, n, maxLabW, bandW) {
    if (st.xRotate === "auto") {
      if (n > 0 && bandW > 0 && maxLabW > bandW * 1.02) return -45;
      if (n > 12) return -45;
      return 0;
    }
    return parseInt(st.xRotate, 10) || 0;
  }

  /* ---------- 画布底色 / 墨色 ---------- */
  function inkOf(st) {
    var dark = st.bg === "dark";
    if (st.bg === "custom") dark = lum(st.bgColor || "#ffffff") < 0.45;
    if (dark) return { title: "#f7f1e8", sub: "#b8ab9a", text: "#c6b9a8", axis: "#6b5e52", grid: "#3b322b", zero: "#8d7f6f", label: "#e9dfd0", strong: "#f7f1e8" };
    return { title: "#2b2520", sub: "#6b5e52", text: "#6b5e52", axis: "#a99d8c", grid: "#ece4d7", zero: "#b3a795", label: "#5f5347", strong: "#2b2520" };
  }
  function bgOf(st) {
    if (st.bg === "transparent") return { type: "none" };
    if (st.bg === "paper") return { type: "grad", from: "#fffdf8", to: "#f1e9dc" };
    if (st.bg === "dark") return { type: "grad", from: "#241e18", to: "#141110" };
    if (st.bg === "custom") return { type: "solid", color: st.bgColor || "#ffffff" };
    return { type: "solid", color: "#ffffff" };
  }

  /* ---------- 标题 / 图例 ---------- */
  function T(P, x, y, text, size, color, o) {
    o = o || {};
    P.push({ k: "text", x: x, y: y, text: String(text == null ? "" : text), size: size || 12, weight: o.weight || "400", align: o.align || "start", base: o.base || "alphabetic", color: color, rot: o.rot || 0, op: o.op });
  }
  function titleBlock(st, P, W, C) {
    var y = 8;
    var ax = st.titleAlign === "left" ? 22 : st.titleAlign === "right" ? W - 22 : W / 2;
    var al = st.titleAlign === "left" ? "start" : st.titleAlign === "right" ? "end" : "middle";
    if (st.title) {
      y += st.titleSize * 1.15 + 4;
      T(P, ax, y, trunc(st.title, 70), st.titleSize, C.title, { weight: "700", align: al });
    }
    if (st.subtitle) {
      y += Math.max(14, Math.round(st.titleSize * 0.62)) + 5;
      T(P, ax, y, trunc(st.subtitle, 90), Math.max(11, Math.round(st.titleSize * 0.58)), C.sub, { align: al });
    }
    return y + 12;
  }
  function legendRow(st, P, items, W, y, C) {
    var fs = st.legendFont || 12, sw = 12, itemGap = 18, x = 22, lineH = fs + 9;
    items.forEach(function (it) {
      var w = sw + 6 + estW(it.label, fs);
      if (x + w > W - 22) { x = 22; y += lineH; }
      P.push({ k: "rect", x: x, y: y + 2, w: sw, h: sw * 0.72, r: 2, fill: it.color });
      T(P, x + sw + 6, y + fs - 4, trunc(it.label, 16), fs, C.text);
      x += w + itemGap;
    });
    return y + lineH + 2;
  }
  function legendRightW(st, items) {
    var fs = st.legendFont || 12, maxW = 40;
    items.forEach(function (it) { maxW = Math.max(maxW, estW(trunc(it.label, 14), fs)); });
    return 18 + maxW + 16;
  }
  function legendRight(st, P, items, x, y, C) {
    var fs = st.legendFont || 12;
    items.forEach(function (it) {
      P.push({ k: "rect", x: x, y: y + 3, w: 11, h: 8, r: 2, fill: it.color });
      T(P, x + 16, y + fs - 3, trunc(it.label, 14), fs, C.text);
      y += fs + 9;
    });
  }
  function legendBottom(st, P, items, W, H, C) {
    var fs = st.legendFont || 12, sw = 12, itemGap = 18;
    var rows = [], cur = [], curW = 0;
    items.forEach(function (it) {
      var w = sw + 6 + estW(it.label, fs) + itemGap;
      if (curW + w > W - 44 && cur.length) { rows.push(cur); cur = []; curW = 0; }
      cur.push({ it: it, w: w }); curW += w;
    });
    if (cur.length) rows.push(cur);
    var lineH = fs + 9;
    var y = H - 16 - (rows.length - 1) * lineH - fs + 4;
    rows.forEach(function (row) {
      var total = row.reduce(function (a, b) { return a + b.w; }, 0) - itemGap;
      var x = Math.max(22, (W - total) / 2);
      row.forEach(function (cell) {
        P.push({ k: "rect", x: x, y: y + 2, w: sw, h: sw * 0.72, r: 2, fill: cell.it.color });
        T(P, x + sw + 6, y + fs - 4, trunc(cell.it.label, 16), fs, C.text);
        x += cell.w;
      });
      y += lineH;
    });
  }
  function legendItems(st, data) {
    if (st.type === "heatmap" || st.type === "gauge") return [];
    if (st.type === "pie" || st.type === "donut" || st.type === "rose" || st.type === "funnel")
      return data.labels.map(function (l, i) { return { label: l, color: colorOf(st, i) }; });
    if (st.type === "scatter" || st.type === "bubble") {
      return [{ label: data.names[1] ? data.names[1] : "数据点", color: colorOf(st, 0) }];
    }
    if (!data.series.length) return [];
    if (data.series.length === 1 && (data.names[0] === "数值" || !data.names[0])) return [];
    return data.names.map(function (n, i) { return { label: n, color: colorOf(st, i) }; });
  }

  /* ---------- 垂直坐标系：柱 / 堆叠 / 折线 / 面积 / 组合 / 瀑布 ---------- */
  function seriesKind(st, i, mode) {
    if (mode === "combo") return cfgOf(st, i).type || "bar";
    if (mode === "line" || mode === "area") return mode;
    return "bar";
  }
  function buildVertical(st, data, mode) {
    var W = st.width, H = st.height, C = inkOf(st), P = [], LB = [];
    var items = legendItems(st, data), showLeg = st.showLegend && items.length > 0;
    var top = titleBlock(st, P, W, C);
    var bottomExtra = 0, rightLegW = 0;
    if (showLeg) {
      if (st.legendPos === "top") top = legendRow(st, P, items, W, top, C);
      else if (st.legendPos === "bottom") bottomExtra = 26;
      else if (st.legendPos === "right") rightLegW = legendRightW(st, items);
    }
    var scL = scaleFor(st, data, "L");
    var scR = st.dualAxis ? scaleFor(st, data, "R") : null;
    var fs = st.tickFont || 12;
    var n = data.labels.length || 1;
    var tickWL = (scL && st.showYTicks) ? Math.max.apply(null, scL.ticks.map(function (t) { return estW(tickText(t, st), fs); })) : 0;
    var tickWR = (scR && st.showYTicks) ? Math.max.apply(null, scR.ticks.map(function (t) { return estW(tickText(t, st), fs); })) : 0;
    var left = 16 + (st.yTitle ? 18 : 0) + (tickWL ? tickWL + 10 : 6);
    var right = 18 + rightLegW + (scR ? tickWR + 12 + (st.y2Title ? 18 : 0) : 0);
    var plotW = Math.max(80, W - left - right);
    var bandW = plotW / n;
    var maxLabW = Math.max.apply(null, data.labels.map(function (l) { return estW(trunc(l, 14), fs); }).concat([30]));
    var rot = rotAngle(st, n, maxLabW, bandW);
    var bottom = 14 + (st.xTitle ? 22 : 0);
    if (st.showXLabels) bottom += rot === -90 ? maxLabW + 10 : rot === -45 ? maxLabW * 0.72 + 14 : 22;
    var plot = { x: left, y: top, w: plotW, h: Math.max(70, H - top - bottom - bottomExtra) };
    var yOf = function (v, sc) { return plot.y + plot.h - ((v - sc.min) / (sc.max - sc.min)) * plot.h; };
    var cx = function (i) { return plot.x + (i + 0.5) * bandW; };

    var dash = st.gridDash ? [5, 5] : null;
    if (st.gridH && scL) {
      scL.ticks.forEach(function (t) {
        var y = yOf(t, scL);
        if (y < plot.y - 0.5 || y > plot.y + plot.h + 0.5) return;
        P.push({ k: "line", x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: C.grid, w: 1, dash: dash });
      });
    }
    var anyBar = mode === "bar" || mode === "stacked" || mode === "waterfall" ||
      (mode === "combo" && data.series.some(function (_, i) { return seriesKind(st, i, mode) === "bar"; }));
    if (st.gridV) {
      for (var gi = 0; gi <= n; gi++) {
        var gx = plot.x + gi * bandW;
        if (gx > plot.x + plot.w + 0.5) continue;
        P.push({ k: "line", x1: gx, y1: plot.y, x2: gx, y2: plot.y + plot.h, stroke: C.grid, w: 1, dash: dash });
      }
    }
    if (st.axisShow) {
      P.push({ k: "line", x1: plot.x, y1: plot.y + plot.h, x2: plot.x + plot.w, y2: plot.y + plot.h, stroke: C.axis, w: 1 });
      P.push({ k: "line", x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.h, stroke: C.axis, w: 1 });
      if (scR) P.push({ k: "line", x1: plot.x + plot.w, y1: plot.y, x2: plot.x + plot.w, y2: plot.y + plot.h, stroke: C.axis, w: 1 });
    }
    if (scL.min < 0 && scL.max > 0) {
      P.push({ k: "line", x1: plot.x, y1: yOf(0, scL), x2: plot.x + plot.w, y2: yOf(0, scL), stroke: C.zero, w: 1.2 });
    }

    /* 刻度值 */
    if (scL && st.showYTicks) {
      scL.ticks.forEach(function (t) {
        var y = yOf(t, scL);
        if (st.axisShow) P.push({ k: "line", x1: plot.x - 4, y1: y, x2: plot.x, y2: y, stroke: C.axis, w: 1 });
        T(P, plot.x - 8, y, tickText(t, st), fs, C.axis, { align: "end", base: "middle" });
      });
    }
    if (scR && st.showYTicks) {
      scR.ticks.forEach(function (t) {
        var y = yOf(t, scR);
        if (st.axisShow) P.push({ k: "line", x1: plot.x + plot.w, y1: y, x2: plot.x + plot.w + 4, y2: y, stroke: C.axis, w: 1 });
        T(P, plot.x + plot.w + 8, y, tickText(t, st), fs, C.axis, { base: "middle" });
      });
    }
    /* 分类标签 */
    if (st.showXLabels) {
      for (var i = 0; i < n; i++) {
        var x = cx(i), yb = plot.y + plot.h + 14;
        if (rot === -45) T(P, x + 3, yb + 4, trunc(data.labels[i], 14), fs, C.text, { align: "end", base: "middle", rot: -45 });
        else if (rot === -90) T(P, x + 2, yb + 2, trunc(data.labels[i], 14), fs, C.text, { align: "end", base: "middle", rot: -90 });
        else {
          var lab = trunc(data.labels[i], Math.max(4, Math.floor(bandW / fs) * 2));
          T(P, x, yb, lab, fs, C.text, { align: "middle" });
        }
      }
    }
    /* 轴标题 */
    if (st.yTitle) T(P, 14, plot.y + plot.h / 2, trunc(st.yTitle, 18), fs, C.sub, { align: "middle", base: "middle", rot: -90 });
    if (scR && st.y2Title) T(P, W - 14, plot.y + plot.h / 2, trunc(st.y2Title, 18), fs, C.sub, { align: "middle", base: "middle", rot: 90 });
    if (st.xTitle) T(P, plot.x + plot.w / 2, H - 8, trunc(st.xTitle, 24), fs, C.sub, { align: "middle" });

    var radius = Math.min(st.barRadius || 0, 10);
    var barRatio = Math.min(0.96, Math.max(0.15, st.barRatio == null ? 0.68 : st.barRatio));
    var groupW = bandW * barRatio;
    var labelOn = st.showLabels && bandW > 16;

    function barFill(color) { return st.gradient ? null : color; }
    function barGrad(color) { return st.gradient ? [lighten(color, 0.32), color] : null; }

    /* 瀑布 */
    if (mode === "waterfall") {
      var ser = data.series[0] || [];
      var run = 0;
      ser.forEach(function (v, i) {
        var from = run, to = run + v;
        var y0 = yOf(from, scL), y1 = yOf(to, scL);
        var x = plot.x + i * bandW + (bandW - groupW) / 2;
        var baseC = palColor(st, 0);
        var color = v >= 0 ? baseC : mixHex(hueShift(baseC, -140), baseC, 0.18);
        P.push({ k: "rect", x: x, y: Math.min(y0, y1), w: groupW, h: Math.max(1, Math.abs(y1 - y0)), r: radius, fill: barFill(color), grad: barGrad(color), m: { li: i, si: 0, v: v } });
        if (i < ser.length - 1) P.push({ k: "line", x1: x + groupW, y1: y1, x2: x + bandW, y2: y1, stroke: C.axis, w: 1, dash: [4, 4] });
        if (labelOn) T(LB, x + groupW / 2, (v >= 0 ? Math.min(y0, y1) : Math.max(y0, y1)) + (v >= 0 ? -6 : 14), numText(v, st), fs - 1, C.label, { align: "middle" });
        run = to;
      });
    }

    /* 堆叠柱（可切换百分比堆叠：按列归一为 100%） */
    if (mode === "stacked") {
      var accPos = new Array(n).fill(0), accNeg = new Array(n).fill(0);
      var colTot = new Array(n).fill(0);
      if (st.pctStack) {
        data.series.forEach(function (vals) {
          vals.forEach(function (v, i) { if (v > 0) colTot[i] += v; });
        });
      }
      data.series.forEach(function (vals, si) {
        var sc = axisOf(st, si) === "R" && scR ? scR : scL;
        var color = colorOf(st, si);
        vals.forEach(function (v0, i) {
          var v = (st.pctStack && colTot[i] > 0) ? (v0 / colTot[i]) * 100 : v0;
          var base = v >= 0 ? accPos[i] : accNeg[i];
          var topv = base + v;
          var y0 = yOf(base, sc), y1 = yOf(topv, sc);
          var x = plot.x + i * bandW + (bandW - groupW) / 2;
          P.push({ k: "rect", x: x, y: Math.min(y0, y1), w: groupW, h: Math.max(1, Math.abs(y1 - y0)), r: Math.min(radius, 4), fill: barFill(color), grad: barGrad(color), m: { li: i, si: si, v: v0 } });
          if (labelOn && Math.abs(y1 - y0) > 15 && groupW > 26) {
            var lab = st.pctStack ? (trimFixed(v, 1) + "%") : numText(v0, st);
            T(LB, x + groupW / 2, (y0 + y1) / 2, lab, fs - 1, "#ffffff", { align: "middle", base: "middle" });
          }
          if (v >= 0) accPos[i] = topv; else accNeg[i] = topv;
        });
      });
    }

    /* 分组柱 */
    if (mode === "bar" || (mode === "combo" && data.series.some(function (_, i) { return seriesKind(st, i, mode) === "bar"; }))) {
      var barIdx = [];
      data.series.forEach(function (_, si) { if (seriesKind(st, si, mode) === "bar") barIdx.push(si); });
      var k = barIdx.length || 1;
      var gap = Math.min(4, groupW * 0.05);
      var bw = Math.max(2, (groupW - gap * (k - 1)) / k);
      barIdx.forEach(function (si, bi) {
        var sc = axisOf(st, si) === "R" && scR ? scR : scL;
        var color = colorOf(st, si);
        var zero = yOf(Math.min(Math.max(0, sc.min), sc.max), sc);
        data.series[si].forEach(function (v, i) {
          var x = plot.x + i * bandW + (bandW - groupW) / 2 + bi * (bw + gap);
          var y = yOf(v, sc);
          var top = Math.min(y, zero), hh = Math.max(1, Math.abs(zero - y));
          P.push({ k: "rect", x: x, y: top, w: bw, h: hh, r: Math.min(radius, bw / 2), fill: barFill(color), grad: barGrad(color), m: { li: i, si: si, v: v } });
          if (labelOn && bw > 12) {
            if (st.labelPos === "inside" && hh > 18) T(LB, x + bw / 2, top + hh / 2, numText(v, st), fs - 1, "#ffffff", { align: "middle", base: "middle" });
            else T(LB, x + bw / 2, v >= 0 ? top - 5 : top + hh + 12, numText(v, st), fs - 1, C.label, { align: "middle" });
          }
        });
      });
    }

    /* 面积 / 折线 */
    var lineIdx = [];
    data.series.forEach(function (_, si) {
      var kind = seriesKind(st, si, mode);
      if (kind === "line" || kind === "area") lineIdx.push(si);
    });
    lineIdx.forEach(function (si) {
      var kind = seriesKind(st, si, mode);
      var sc = axisOf(st, si) === "R" && scR ? scR : scL;
      var color = colorOf(st, si);
      var pts = data.series[si].map(function (v, i) { return [cx(i), yOf(v, sc)]; });
      if (!pts.length) return;
      var zero = yOf(Math.min(Math.max(0, sc.min), sc.max), sc);
      var pk = kindOf(st, si);                       // 点 / 线 / 曲（逐系列）
      var sm = pk === "curve" || (st.smooth && pk !== "point");
      var cmds = pathOf(pts, sm);
      if ((kind === "area" || (kind === "line" && st.areaFill)) && pk !== "point") {
        var fillCmds = cmds.slice();
        fillCmds.push({ c: "L", p: [pts[pts.length - 1][0], zero] });
        fillCmds.push({ c: "L", p: [pts[0][0], zero] });
        fillCmds.push({ c: "Z" });
        P.push({ k: "path", cmds: fillCmds, fill: rgba(color, kind === "area" ? 0.26 : 0.16), stroke: null });
      }
      if (pk !== "point") P.push({ k: "path", cmds: cmds, stroke: color, sw: st.lineWidth || 2.5, m: { si: si } });
      var symR = Math.max(2.5, (st.symbolSize || 5) * 0.64);
      if ((pk === "point" || st.symbol) && pts.length <= 80) pts.forEach(function (p, i) {
        P.push({ k: "circle", cx: p[0], cy: p[1], r: pk === "point" ? (st.symbolSize || 5) : symR, fill: color, stroke: "#ffffff", sw: 1.2, m: { li: i, si: si, v: data.series[si][i] } });
      });
      if (st.showLabels && pts.length <= 40 && pk !== "point") {
        pts.forEach(function (p, i) {
          T(LB, p[0], p[1] - 9, numText(data.series[si][i], st), fs - 1, C.label, { align: "middle" });
        });
      }
    });

    Array.prototype.push.apply(P, LB);
    if (showLeg) {
      if (st.legendPos === "right") legendRight(st, P, items, plot.x + plot.w + 14 + (scR ? tickWR + 12 : 0), plot.y + 2, C);
      else if (st.legendPos === "bottom") legendBottom(st, P, items, W, H, C);
    }
    return { W: W, H: H, P: P };
  }
  function pathOf(pts, smooth) {
    var cmds = [{ c: "M", p: [pts[0][0], pts[0][1]] }];
    for (var i = 1; i < pts.length; i++) {
      if (smooth) {
        var mx = (pts[i - 1][0] + pts[i][0]) / 2;
        cmds.push({ c: "C", p: [mx, pts[i - 1][1], mx, pts[i][1], pts[i][0], pts[i][1]] });
      } else cmds.push({ c: "L", p: [pts[i][0], pts[i][1]] });
    }
    return cmds;
  }

  /* ---------- 横向条形图 ---------- */
  function buildHorizontal(st, data) {
    var W = st.width, H = st.height, C = inkOf(st), P = [], LB = [];
    var items = legendItems(st, data), showLeg = st.showLegend && items.length > 0;
    var top = titleBlock(st, P, W, C);
    var bottomExtra = 0, rightLegW = 0;
    if (showLeg) {
      if (st.legendPos === "top") top = legendRow(st, P, items, W, top, C);
      else if (st.legendPos === "bottom") bottomExtra = 26;
      else if (st.legendPos === "right") rightLegW = legendRightW(st, items);
    }
    var sc = scaleFor(st, data, "L");
    var fs = st.tickFont || 12;
    var n = data.labels.length || 1;
    var maxLabW = Math.max.apply(null, data.labels.map(function (l) { return estW(trunc(l, 14), fs); }).concat([40]));
    var tickH = fs + 8;
    var left = 16 + (st.yTitle ? 18 : 0) + maxLabW + 12;
    var right = 20 + rightLegW;
    var bottom = 14 + tickH + (st.xTitle ? 22 : 0);
    var plot = { x: left, y: top, w: Math.max(80, W - left - right), h: Math.max(70, H - top - bottom - bottomExtra) };
    var xOf = function (v) { return plot.x + ((v - sc.min) / (sc.max - sc.min)) * plot.w; };
    var zeroX = xOf(Math.min(Math.max(0, sc.min), sc.max));
    var bandH = plot.h / n;

    var dash = st.gridDash ? [5, 5] : null;
    if (st.gridH && st.showYTicks) {
      sc.ticks.forEach(function (t) {
        var x = xOf(t);
        if (x < plot.x - 0.5 || x > plot.x + plot.w + 0.5) return;
        P.push({ k: "line", x1: x, y1: plot.y, x2: x, y2: plot.y + plot.h, stroke: C.grid, w: 1, dash: dash });
      });
    }
    if (st.axisShow) {
      P.push({ k: "line", x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.h, stroke: C.axis, w: 1 });
      P.push({ k: "line", x1: plot.x, y1: plot.y + plot.h, x2: plot.x + plot.w, y2: plot.y + plot.h, stroke: C.axis, w: 1 });
    }
    if (sc.min < 0 && sc.max > 0) P.push({ k: "line", x1: zeroX, y1: plot.y, x2: zeroX, y2: plot.y + plot.h, stroke: C.zero, w: 1.2 });

    if (st.showYTicks) {
      sc.ticks.forEach(function (t) {
        var x = xOf(t);
        if (st.axisShow) P.push({ k: "line", x1: x, y1: plot.y + plot.h, x2: x, y2: plot.y + plot.h + 4, stroke: C.axis, w: 1 });
        T(P, x, plot.y + plot.h + 16, tickText(t, st), fs, C.axis, { align: "middle" });
      });
    }
    if (st.xTitle) T(P, plot.x + plot.w / 2, H - 8, trunc(st.xTitle, 24), fs, C.sub, { align: "middle" });
    if (st.yTitle) T(P, 14, plot.y + plot.h / 2, trunc(st.yTitle, 18), fs, C.sub, { align: "middle", base: "middle", rot: -90 });

    var k = Math.max(1, data.series.length);
    var ratio = Math.min(0.94, Math.max(0.2, st.barRatio == null ? 0.7 : st.barRatio));
    var groupH = bandH * ratio;
    var gap = Math.min(4, groupH * 0.06);
    var bh = Math.max(2, (groupH - gap * (k - 1)) / k);
    var radius = Math.min(st.barRadius || 0, 10);

    data.series.forEach(function (vals, si) {
      var color = colorOf(st, si);
      vals.forEach(function (v, i) {
        var x1 = zeroX, x2 = xOf(v);
        var y = plot.y + i * bandH + (bandH - groupH) / 2 + si * (bh + gap);
        P.push({ k: "rect", x: Math.min(x1, x2), y: y, w: Math.max(1, Math.abs(x2 - x1)), h: bh, r: Math.min(radius, bh / 2), fill: st.gradient ? null : color, grad: st.gradient ? [lighten(color, 0.32), color] : null, m: { li: i, si: si, v: v } });
        if (st.showLabels && bh > 11) {
          T(LB, v >= 0 ? x2 + 6 : x2 - 6, y + bh / 2, numText(v, st), fs - 1, C.label, { align: v >= 0 ? "start" : "end", base: "middle" });
        }
      });
    });
    if (st.showXLabels) {
      data.labels.forEach(function (l, i) {
        T(P, plot.x - 10, plot.y + (i + 0.5) * bandH, trunc(l, 14), fs, C.text, { align: "end", base: "middle" });
      });
    }
    Array.prototype.push.apply(P, LB);
    if (showLeg) {
      if (st.legendPos === "right") legendRight(st, P, items, plot.x + plot.w + 14, plot.y + 2, C);
      else if (st.legendPos === "bottom") legendBottom(st, P, items, W, H, C);
    }
    return { W: W, H: H, P: P };
  }

  /* ---------- 散点 / 气泡 ---------- */
  function buildXY(st, data, bubble) {
    var W = st.width, H = st.height, C = inkOf(st), P = [];
    var fs = st.tickFont || 12;
    var xs = (data.series[0] || []).slice();
    /* 多系列：≥3 列时首列为 X，其余各列独立为一个系列（点/线/曲逐系列可选） */
    var multi = !bubble && data.series.length > 2;
    var ySeries = multi
      ? data.series.slice(1).map(function (s) { return s.slice(); })
      : [data.series.length > 1 ? (data.series[1] || []).slice() : xs.map(function (_, i) { return i + 1; })];
    var allY = [].concat.apply([], ySeries);
    var sizes = bubble && data.series[2] ? data.series[2] : null;
    var top = titleBlock(st, P, W, C);
    var items = multi
      ? data.names.slice(1).map(function (n, i) {
          var cc = cfgOf(st, i + 1);
          return { label: n, color: cc.color || palColor(st, i) };
        })
      : legendItems(st, data);
    var showLeg = st.showLegend && items.length > 0;
    var bottomExtra = 0, rightLegW = 0;
    if (showLeg) {
      if (st.legendPos === "top") top = legendRow(st, P, items, W, top, C);
      else if (st.legendPos === "bottom") bottomExtra = 26;
      else if (st.legendPos === "right") rightLegW = legendRightW(st, items);
    }
    var xEx = [Math.min.apply(null, xs.concat([0])), Math.max.apply(null, xs.concat([1]))];
    var yEx = [Math.min.apply(null, allY.concat([0])), Math.max.apply(null, allY.concat([1]))];
    var sx = niceScale(xEx[0], xEx[1], st.yTickCount || 5, true);
    var sy = niceScale(yEx[0], yEx[1], st.yTickCount || 5, true);
    var tickWL = st.showYTicks ? Math.max.apply(null, sy.ticks.map(function (t) { return estW(tickText(t, st), fs); })) : 0;
    var left = 16 + (st.yTitle ? 18 : 0) + (tickWL ? tickWL + 10 : 6);
    var right = 18 + rightLegW;
    var bottom = 16 + fs + 12 + (st.xTitle ? 20 : 0);
    var plot = { x: left, y: top, w: Math.max(80, W - left - right), h: Math.max(70, H - top - bottom - bottomExtra) };
    var xOf = function (v) { return plot.x + ((v - sx.min) / (sx.max - sx.min)) * plot.w; };
    var yOf = function (v) { return plot.y + plot.h - ((v - sy.min) / (sy.max - sy.min)) * plot.h; };
    var dash = st.gridDash ? [5, 5] : null;
    if (st.gridH) sy.ticks.forEach(function (t) {
      var y = yOf(t);
      if (y < plot.y - 0.5 || y > plot.y + plot.h + 0.5) return;
      P.push({ k: "line", x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: C.grid, w: 1, dash: dash });
    });
    if (st.gridV) sx.ticks.forEach(function (t) {
      var x = xOf(t);
      if (x < plot.x - 0.5 || x > plot.x + plot.w + 0.5) return;
      P.push({ k: "line", x1: x, y1: plot.y, x2: x, y2: plot.y + plot.h, stroke: C.grid, w: 1, dash: dash });
    });
    if (st.axisShow) {
      P.push({ k: "line", x1: plot.x, y1: plot.y + plot.h, x2: plot.x + plot.w, y2: plot.y + plot.h, stroke: C.axis, w: 1 });
      P.push({ k: "line", x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.h, stroke: C.axis, w: 1 });
    }
    if (st.showYTicks) sy.ticks.forEach(function (t) {
      var y = yOf(t);
      if (st.axisShow) P.push({ k: "line", x1: plot.x - 4, y1: y, x2: plot.x, y2: y, stroke: C.axis, w: 1 });
      T(P, plot.x - 8, y, tickText(t, st), fs, C.axis, { align: "end", base: "middle" });
    });
    if (st.showXLabels) sx.ticks.forEach(function (t) {
      var x = xOf(t);
      if (x < plot.x - 0.5 || x > plot.x + plot.w + 0.5) return;
      if (st.axisShow) P.push({ k: "line", x1: x, y1: plot.y + plot.h, x2: x, y2: plot.y + plot.h + 4, stroke: C.axis, w: 1 });
      T(P, x, plot.y + plot.h + 16, tickText(t, st), fs, C.axis, { align: "middle" });
    });
    if (st.xTitle) T(P, plot.x + plot.w / 2, H - 8, trunc(st.xTitle, 24), fs, C.sub, { align: "middle" });
    if (st.yTitle) T(P, 14, plot.y + plot.h / 2, trunc(st.yTitle, 18), fs, C.sub, { align: "middle", base: "middle", rot: -90 });

    var maxS = sizes ? Math.max.apply(null, sizes.concat([1])) : 1;
    ySeries.forEach(function (col, j) {
      /* colIdx 对应数据列（面板 cfg 行号）；色板序号取绘制系列序 j */
      var colIdx = multi ? j + 1 : (data.series.length > 1 ? 1 : 0);
      var c2 = cfgOf(st, colIdx);
      var color = c2.color || palColor(st, j);
      var kind = (c2.kind === "point" || c2.kind === "line" || c2.kind === "curve") ? c2.kind : "point";
      var pts = col.map(function (v, i) { return [xOf(xs[i]), yOf(v)]; });
      /* 折线 / 曲线连接 */
      if (kind !== "point" && pts.length > 1)
        P.push({ k: "path", cmds: pathOf(pts, kind === "curve"), stroke: color, sw: st.lineWidth || 2.5, m: { si: colIdx } });
      pts.forEach(function (p, i) {
        var r = bubble ? 6 + 20 * Math.sqrt(Math.max(0, (sizes ? sizes[i] : 1) / maxS)) : (st.symbolSize || 5);
        P.push({ k: "circle", cx: p[0], cy: p[1], r: r, fill: rgba(color, bubble ? 0.62 : 0.85), stroke: color, sw: 1.2, m: { li: i, si: colIdx, v: col[i] } });
        if (st.showLabels && data.labels[i] && (kind !== "point" || pts.length <= 30)) T(P, p[0], p[1] - r - 6, trunc(data.labels[i], 10), fs - 2, C.label, { align: "middle" });
      });
    });
    if (showLeg) {
      if (st.legendPos === "right") legendRight(st, P, items, plot.x + plot.w + 14, plot.y + 2, C);
      else if (st.legendPos === "bottom") legendBottom(st, P, items, W, H, C);
    }
    return { W: W, H: H, P: P };
  }

  /* ---------- 饼 / 环形 / 玫瑰 ---------- */
  function buildPie(st, data) {
    var W = st.width, H = st.height, C = inkOf(st), P = [];
    var items = legendItems(st, data), showLeg = st.showLegend && items.length > 0;
    var top = titleBlock(st, P, W, C);
    if (showLeg && st.legendPos === "top") top = legendRow(st, P, items, W, top, C);
    var bottomPad = (showLeg && st.legendPos === "bottom") ? 38 : 20;
    var rightPad = (showLeg && st.legendPos === "right") ? legendRightW(st, items) : 0;
    var vals = (data.series[0] || []).map(function (v) { return Math.max(0, v); });
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var areaH = H - top - bottomPad;
    var cx = (W - rightPad) / 2, cy = top + areaH / 2;
    var R = Math.max(30, Math.min((W - rightPad) / 2 - 46, areaH / 2 - 20));
    var inner = st.type === "donut" ? Math.min(0.82, Math.max(0.28, st.pieInner == null ? 0.58 : st.pieInner)) : Math.min(0.7, Math.max(0, st.pieInner || 0));
    var ir = R * inner;
    var rose = st.type === "rose";
    var maxV = Math.max.apply(null, vals.concat([1]));
    var labelMode = st.pieLabelMode || "percent";
    var outLabels = st.showLabels && labelMode !== "none" && vals.length <= 14;

    if (total <= 0) {
      P.push({ k: "circle", cx: cx, cy: cy, r: R, fill: rgba(C.axis, 0.18) });
      T(P, cx, cy, "暂无数据", 13, C.sub, { align: "middle", base: "middle" });
    } else {
      var a0 = -Math.PI / 2;
      vals.forEach(function (v, i) {
        var frac = v / total;
        if (frac <= 0) return;
        var a1 = a0 + frac * Math.PI * 2;
        var rr = rose ? R * (0.52 + 0.48 * Math.sqrt(v / maxV)) : R;
        var color = colorOf(st, i);
        if (frac >= 0.9999) {
          P.push({ k: "circle", cx: cx, cy: cy, r: rr, fill: color });
        } else {
          P.push({ k: "slice", cx: cx, cy: cy, r: rr, ir: ir, a0: a0, a1: a1, fill: color, stroke: st.bg === "transparent" ? null : "#ffffff", sw: 1.6, m: { li: i, si: 0, v: v } });
        }
        if (outLabels) {
          var mid = (a0 + a1) / 2;
          var lx = cx + Math.cos(mid) * (rr + 12), ly = cy + Math.sin(mid) * (rr + 12);
          var lx2 = cx + Math.cos(mid) * (rr + 26), ly2 = cy + Math.sin(mid) * (rr + 26);
          P.push({ k: "line", x1: lx, y1: ly, x2: lx2, y2: ly2, stroke: rgba(color, 0.7), w: 1 });
          var txt = labelMode === "value" ? numText(v, st) : labelMode === "both" ? numText(v, st) + " · " + pctText(frac) : pctText(frac);
          if (st.pieName) txt = trunc(data.labels[i], 8) + " " + txt;
          var rightSide = Math.cos(mid) >= 0;
          T(P, lx2 + (rightSide ? 4 : -4), ly2, txt, 11, C.text, { align: rightSide ? "start" : "end", base: "middle" });
        } else if (st.showLabels && labelMode !== "none" && frac > 0.05) {
          var mid2 = (a0 + a1) / 2, lr = ir + (rr - ir) * 0.6;
          var t2 = labelMode === "value" ? numText(v, st) : labelMode === "both" ? numText(v, st) : pctText(frac);
          T(P, cx + Math.cos(mid2) * lr, cy + Math.sin(mid2) * lr, t2, 11.5, "#ffffff", { align: "middle", base: "middle", weight: "600" });
        }
        a0 = a1;
      });
      if (ir > 8 && st.pieCenter !== false) {
        T(P, cx, cy - 6, numText(total, st), 20, C.strong, { align: "middle", base: "middle", weight: "700" });
        T(P, cx, cy + 18, st.pieCenterLabel || "总计", 11, C.sub, { align: "middle", base: "middle" });
      }
    }
    if (showLeg) {
      if (st.legendPos === "right") legendRight(st, P, items, W - rightPad + 12, cy - (items.length * 21) / 2, C);
      else if (st.legendPos === "bottom") legendBottom(st, P, items, W, H, C);
    }
    return { W: W, H: H, P: P };
  }

  /* ---------- 雷达 ---------- */
  function buildRadar(st, data) {
    var W = st.width, H = st.height, C = inkOf(st), P = [];
    var items = legendItems(st, data), showLeg = st.showLegend && items.length > 0;
    var top = titleBlock(st, P, W, C);
    if (showLeg && st.legendPos === "top") top = legendRow(st, P, items, W, top, C);
    var bottomPad = (showLeg && st.legendPos === "bottom") ? 40 : 24;
    var n = data.labels.length;
    var cx = W / 2, cy = top + (H - top - bottomPad) / 2;
    var R = Math.max(40, Math.min(W / 2 - 78, (H - top - bottomPad) / 2 - 26));
    var maxV = 1;
    data.series.forEach(function (s) { s.forEach(function (v) { if (v > maxV) maxV = v; }); });
    var levels = Math.max(2, Math.min(6, st.radarLevels || 5));
    for (var l = levels; l >= 1; l--) {
      var rr = (R * l) / levels, cmds = [];
      for (var i = 0; i < n; i++) {
        var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        var pt = [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
        cmds.push(i === 0 ? { c: "M", p: pt } : { c: "L", p: pt });
      }
      cmds.push({ c: "Z" });
      P.push({ k: "path", cmds: cmds, stroke: C.grid, sw: 1, fill: l % 2 ? rgba(C.axis, 0.05) : null });
    }
    for (var j = 0; j < n; j++) {
      var ang = -Math.PI / 2 + (j * 2 * Math.PI) / n;
      P.push({ k: "line", x1: cx, y1: cy, x2: cx + Math.cos(ang) * R, y2: cy + Math.sin(ang) * R, stroke: C.grid, w: 1 });
      var lx = cx + Math.cos(ang) * (R + 18), ly = cy + Math.sin(ang) * (R + 16);
      T(P, lx, ly, trunc(data.labels[j], 8), 12, C.text, {
        align: Math.abs(Math.cos(ang)) < 0.25 ? "middle" : Math.cos(ang) > 0 ? "start" : "end",
        base: "middle"
      });
    }
    data.series.forEach(function (serie, si) {
      var color = colorOf(st, si), cmds = [];
      serie.forEach(function (v, i) {
        var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        var rr = (Math.max(0, v) / maxV) * R * 0.94;
        var pt = [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
        cmds.push(i === 0 ? { c: "M", p: pt } : { c: "L", p: pt });
      });
      cmds.push({ c: "Z" });
      P.push({ k: "path", cmds: cmds, fill: rgba(color, 0.2), stroke: color, sw: st.lineWidth || 2 });
      if (st.symbol !== false) serie.forEach(function (v, i) {
        var a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        var rr = (Math.max(0, v) / maxV) * R * 0.94;
        P.push({ k: "circle", cx: cx + Math.cos(a) * rr, cy: cy + Math.sin(a) * rr, r: 3.2, fill: color });
      });
    });
    if (showLeg) {
      if (st.legendPos === "bottom") legendBottom(st, P, items, W, H, C);
      else if (st.legendPos === "right") legendRight(st, P, items, W - 12 - 60, top + 4, C);
    }
    return { W: W, H: H, P: P };
  }

  /* ---------- 漏斗 ---------- */
  function buildFunnel(st, data) {
    var W = st.width, H = st.height, C = inkOf(st), P = [];
    var items = legendItems(st, data), showLeg = st.showLegend && items.length > 0;
    var top = titleBlock(st, P, W, C);
    if (showLeg && st.legendPos === "top") top = legendRow(st, P, items, W, top, C);
    var bottomPad = (showLeg && st.legendPos === "bottom") ? 38 : 22;
    var vals = (data.series[0] || []).map(function (v) { return Math.max(0, v); });
    var n = vals.length || 1;
    var maxV = Math.max.apply(null, vals.concat([1]));
    var areaH = H - top - bottomPad;
    var gap = Math.min(10, areaH / n * 0.12);
    var stageH = (areaH - gap * (n - 1)) / n;
    var cx = W / 2;
    var maxW = Math.min(W - 200, W * 0.62);

    vals.forEach(function (v, i) {
      var w0 = Math.max(6, maxW * (v / maxV));
      var nv = i < n - 1 ? vals[i + 1] : v * 0.72;
      var w1 = Math.max(6, maxW * (nv / maxV));
      var y0 = top + i * (stageH + gap), y1 = y0 + stageH;
      var color = colorOf(st, i);
      P.push({
        k: "path", fill: st.gradient ? null : color, grad: st.gradient ? [lighten(color, 0.3), color] : null,
        m: { li: i, si: 0, v: v },
        cmds: [
          { c: "M", p: [cx - w0 / 2, y0] }, { c: "L", p: [cx + w0 / 2, y0] },
          { c: "L", p: [cx + w1 / 2, y1] }, { c: "L", p: [cx - w1 / 2, y1] }, { c: "Z" }
        ]
      });
      var pct = maxV ? v / vals[0] : 0;
      var valTxt = numText(v, st) + (vals[0] ? " · " + pctText(v / vals[0]) : "");
      /* 段体太小则标签外置右侧，避免白字挤在窄段里 */
      if (stageH >= 34 && w0 >= 100) {
        T(P, cx, y0 + stageH / 2 - 6, trunc(data.labels[i], 14), 13, "#ffffff", { align: "middle", base: "middle", weight: "600" });
        T(P, cx, y0 + stageH / 2 + 12, valTxt, 11.5, "rgba(255,255,255,.9)", { align: "middle", base: "middle" });
      } else {
        T(P, cx + w0 / 2 + 8, y0 + stageH / 2, trunc(data.labels[i] + " " + valTxt, 22), 11.5, C.text, { align: "start", base: "middle" });
      }
    });
    if (showLeg) {
      if (st.legendPos === "right") legendRight(st, P, items, W - 12 - 60, top + 4, C);
      else if (st.legendPos === "bottom") legendBottom(st, P, items, W, H, C);
    }
    return { W: W, H: H, P: P };
  }

  /* ---------- 仪表盘 ---------- */
  function buildGauge(st, data) {
    var W = st.width, H = st.height, C = inkOf(st), P = [];
    var top = titleBlock(st, P, W, C);
    var v = (data.series[0] || [])[0] || 0;
    var maxV = parseFloat(st.gaugeMax) || niceNum(Math.max(v * 1.25, 1));
    var bottomPad = 24;
    var areaH = H - top - bottomPad;
    var cx = W / 2, cy = top + areaH * 0.62;
    var R = Math.max(50, Math.min(W * 0.3, areaH * 0.44));
    var start = Math.PI * 0.75, sweep = Math.PI * 1.5;
    var ratio = Math.min(1.4, Math.max(0, v / maxV));

    P.push({ k: "arc", cx: cx, cy: cy, r: R, a0: start, a1: start + sweep, stroke: rgba(C.axis, 0.18), sw: Math.max(14, R * 0.17) });
    var color = colorOf(st, 0);
    P.push({ k: "arc", cx: cx, cy: cy, r: R, a0: start, a1: start + sweep * Math.min(1, ratio), stroke: color, sw: Math.max(14, R * 0.17) });

    for (var i = 0; i <= 4; i++) {
      var t = i / 4, a = start + sweep * t;
      var x1 = cx + Math.cos(a) * (R - Math.max(14, R * 0.17) / 2 - 6), y1 = cy + Math.sin(a) * (R - Math.max(14, R * 0.17) / 2 - 6);
      var x2 = cx + Math.cos(a) * (R + 12), y2 = cy + Math.sin(a) * (R + 12);
      P.push({ k: "line", x1: x1, y1: y1, x2: x2, y2: y2, stroke: C.axis, w: 1 });
      var lx = cx + Math.cos(a) * (R + 30), ly = cy + Math.sin(a) * (R + 30);
      T(P, lx, ly, tickText(maxV * t, st), 11, C.axis, { align: "middle", base: "middle" });
    }
    var va = start + sweep * Math.min(1, ratio);
    P.push({ k: "line", x1: cx, y1: cy, x2: cx + Math.cos(va) * (R * 0.78), y2: cy + Math.sin(va) * (R * 0.78), stroke: C.strong, w: 3 });
    P.push({ k: "circle", cx: cx, cy: cy, r: 7, fill: C.strong });
    P.push({ k: "circle", cx: cx, cy: cy, r: 3, fill: st.bg === "dark" ? "#241e18" : "#ffffff" });
    T(P, cx, cy + R * 0.42, numText(v, st), Math.round(R * 0.34), C.strong, { align: "middle", base: "middle", weight: "700" });
    if (data.labels[0]) T(P, cx, cy + R * 0.42 + Math.round(R * 0.26), trunc(data.labels[0], 16), 12, C.sub, { align: "middle", base: "middle" });
    return { W: W, H: H, P: P };
  }

  /* ---------- 热力图 ---------- */
  function buildHeatmap(st, data) {
    var W = st.width, H = st.height, C = inkOf(st), P = [];
    var top = titleBlock(st, P, W, C);
    var rows = data.labels.length;
    var cols = Math.max(1, data.series.length);
    var colNames = data.names.slice();
    if (!colNames.length || (colNames.length === 1 && colNames[0] === "数值")) {
      colNames = data.labels.map(function (_, i) { return "列" + (i + 1); });
      rows = data.series.length ? data.series[0].length : 0;
      cols = data.series.length || 1;
    }
    var fs = st.tickFont || 12;
    var maxLabW = Math.max.apply(null, data.labels.map(function (l) { return estW(trunc(l, 10), fs); }).concat([36]));
    var left = 16 + maxLabW + 10;
    var right = 26, bottom = 16 + 26 + (st.xTitle ? 20 : 0);
    var plot = { x: left, y: top + 22, w: Math.max(60, W - left - right), h: Math.max(50, H - top - 22 - bottom) };
    var cw = plot.w / cols, ch = plot.h / Math.max(1, rows);
    var base = palColor(st, 0);
    var vals = [];
    data.series.forEach(function (s) { s.forEach(function (v) { vals.push(v); }); });
    var mn = Math.min.apply(null, vals.concat([0])), mx = Math.max.apply(null, vals.concat([1]));
    var span = mx - mn || 1;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var v = (data.series[c] || [])[r];
        if (v == null) continue;
        var t = (v - mn) / span;
        var x = plot.x + c * cw, y = plot.y + r * ch;
        P.push({ k: "rect", x: x + 1, y: y + 1, w: Math.max(1, cw - 2), h: Math.max(1, ch - 2), r: 3, fill: rgba(base, 0.06 + 0.92 * t), m: { li: r, si: c, v: v } });
        if (st.showLabels && cw > 34 && ch > 20)
          T(P, x + cw / 2, y + ch / 2, numText(v, st), Math.min(12, ch * 0.36), t > 0.55 ? "#ffffff" : C.strong, { align: "middle", base: "middle" });
      }
    }
    if (st.showXLabels) colNames.forEach(function (nm, c) {
      T(P, plot.x + (c + 0.5) * cw, plot.y - 8, trunc(nm, 8), fs, C.text, { align: "middle", base: "middle" });
    });
    if (st.showYTicks) data.labels.forEach(function (l, r) {
      T(P, plot.x - 8, plot.y + (r + 0.5) * ch, trunc(l, 10), fs, C.text, { align: "end", base: "middle" });
    });
    if (st.xTitle) T(P, plot.x + plot.w / 2, H - 8, trunc(st.xTitle, 24), fs, C.sub, { align: "middle" });
    /* 色阶图例 */
    var lw = 90, lh = 8, lx = W - right - lw, ly = H - 14;
    for (var k = 0; k < 10; k++) P.push({ k: "rect", x: lx + (k * lw) / 10, y: ly, w: lw / 10 + 0.5, h: lh, fill: rgba(base, 0.06 + 0.092 * k) });
    T(P, lx - 8, ly + lh / 2, autoNum(mn), 10, C.axis, { align: "end", base: "middle" });
    T(P, lx + lw + 8, ly + lh / 2, autoNum(mx), 10, C.axis, { base: "middle" });
    return { W: W, H: H, P: P };
  }

  /* ---------- 入口 ---------- */
  /* 兜底默认值：旧版工程 / 分享链接缺字段时不产生 NaN */
  var DEFAULTS = {
    type: "bar", palette: 0, title: "", subtitle: "", titleSize: 18, titleAlign: "center",
    width: 960, height: 560, bg: "white", bgColor: "#ffffff",
    showLegend: true, legendPos: "top", legendFont: 12, tickFont: 12,
    showLabels: true, labelPos: "auto", decimals: "auto", unitPre: "", unitSuf: "",
    gridH: false, gridV: false, gridDash: false, showXLabels: true, showYTicks: true,
    axisShow: true, xRotate: 0, yTickCount: 5, xTitle: "", yTitle: "", y2Title: "",
    yMin: "", yMax: "", y2Min: "", y2Max: "", dualAxis: false,
    lineWidth: 2.5, smooth: false, symbol: false, areaFill: false,
    symbolSize: 5,
    barRadius: 3, barRatio: 0.68, gradient: false,
    pieInner: 0.58, pieLabelMode: "percent", pieName: false, pieCenter: false,
    gaugeMax: "", radarLevels: 5, seriesCfg: [], pctStack: false, thousands: false
  };
  function norm(st) {
    var o = {}, k;
    for (k in DEFAULTS) if (!(k in st) || st[k] === undefined || st[k] === null) o[k] = DEFAULTS[k];
    for (k in st) o[k] = st[k];
    if (typeof o.titleSize !== "number" || !isFinite(o.titleSize)) o.titleSize = DEFAULTS.titleSize;
    o.width = Math.max(220, Math.min(4000, +o.width || 960));
    o.height = Math.max(160, Math.min(4000, +o.height || 560));
    if (!o.seriesCfg || typeof o.seriesCfg.length !== "number") o.seriesCfg = [];
    return o;
  }

  function buildModel(st0, data) {
    var st = norm(st0 || {});
    var W = st.width, H = st.height;
    if (!data || !data.labels.length) {
      var C0 = inkOf(st), P0 = [];
      titleBlock(st, P0, W, C0);
      T(P0, W / 2, H / 2 - 6, "在左侧输入或粘贴数据", 15, C0.sub, { align: "middle", base: "middle" });
      T(P0, W / 2, H / 2 + 18, "格式：标签, 系列1, 系列2 …", 12, C0.axis, { align: "middle", base: "middle" });
      return { W: W, H: H, P: P0 };
    }
    var t = st.type;
    if (t === "hbar") return buildHorizontal(st, data);
    if (t === "stacked") return buildVertical(st, data, "stacked");
    if (t === "waterfall") return buildVertical(st, data, "waterfall");
    if (t === "line") return buildVertical(st, data, "line");
    if (t === "area") return buildVertical(st, data, "area");
    if (t === "combo") return buildVertical(st, data, "combo");
    if (t === "scatter") return buildXY(st, data, false);
    if (t === "bubble") return buildXY(st, data, true);
    if (t === "pie" || t === "donut" || t === "rose") return buildPie(st, data);
    if (t === "radar") return buildRadar(st, data);
    if (t === "funnel") return buildFunnel(st, data);
    if (t === "gauge") return buildGauge(st, data);
    if (t === "heatmap") return buildHeatmap(st, data);
    return buildVertical(st, data, "bar");
  }

  /* ---------- Canvas 渲染 ---------- */
  function paint(ctx, model, st) {
    var W = model.W, H = model.H, bg = bgOf(st);
    ctx.clearRect(0, 0, W, H);
    if (bg.type === "solid") { ctx.fillStyle = bg.color; ctx.fillRect(0, 0, W, H); }
    else if (bg.type === "grad") {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, bg.from); g.addColorStop(1, bg.to);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    model.P.forEach(function (p) {
      ctx.save();
      /* 交互高亮：_hl 为聚焦的标签序号，其余系列淡化 */
      var dim = (st && st._hl != null && p.m && p.m.li != null && p.m.li !== st._hl) ? 0.15 : 1;
      ctx.globalAlpha = (p.op != null ? p.op : 1) * dim;
      var k = p.k;
      if (k === "rect") {
        var fill = p.fill;
        if (p.grad) {
          var gg = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
          gg.addColorStop(0, p.grad[0]); gg.addColorStop(1, p.grad[1]);
          fill = gg;
        }
        ctx.fillStyle = fill || "transparent";
        var r = Math.min(p.r || 0, p.w / 2, p.h / 2);
        if (r > 0.5) {
          ctx.beginPath();
          ctx.moveTo(p.x + r, p.y);
          ctx.arcTo(p.x + p.w, p.y, p.x + p.w, p.y + p.h, r);
          ctx.arcTo(p.x + p.w, p.y + p.h, p.x, p.y + p.h, r);
          ctx.arcTo(p.x, p.y + p.h, p.x, p.y, r);
          ctx.arcTo(p.x, p.y, p.x + p.w, p.y, r);
          ctx.closePath(); ctx.fill();
        } else ctx.fillRect(p.x, p.y, p.w, p.h);
      } else if (k === "line") {
        ctx.strokeStyle = p.stroke; ctx.lineWidth = p.w || 1;
        if (p.dash) ctx.setLineDash(p.dash);
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        ctx.setLineDash([]);
      } else if (k === "circle") {
        ctx.beginPath(); ctx.arc(p.cx, p.cy, Math.max(0.1, p.r), 0, Math.PI * 2);
        if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw || 1; ctx.stroke(); }
      } else if (k === "arc") {
        ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, p.a0, p.a1);
        ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw || 2; ctx.lineCap = "round"; ctx.stroke();
      } else if (k === "slice") {
        ctx.beginPath();
        if (p.ir > 0) {
          ctx.arc(p.cx, p.cy, p.r, p.a0, p.a1);
          ctx.arc(p.cx, p.cy, p.ir, p.a1, p.a0, true);
          ctx.closePath();
        } else {
          ctx.moveTo(p.cx, p.cy);
          ctx.arc(p.cx, p.cy, p.r, p.a0, p.a1);
          ctx.closePath();
        }
        ctx.fillStyle = p.fill; ctx.fill();
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw || 1; ctx.stroke(); }
      } else if (k === "path") {
        ctx.beginPath();
        p.cmds.forEach(function (c) {
          if (c.c === "M") ctx.moveTo(c.p[0], c.p[1]);
          else if (c.c === "L") ctx.lineTo(c.p[0], c.p[1]);
          else if (c.c === "C") ctx.bezierCurveTo(c.p[0], c.p[1], c.p[2], c.p[3], c.p[4], c.p[5]);
          else if (c.c === "Z") ctx.closePath();
        });
        if (p.grad) {
          var pg = ctx.createLinearGradient(0, p.cmds[0].p[1], 0, (p.cmds[0].p[1] + 120));
          pg.addColorStop(0, p.grad[0]); pg.addColorStop(1, p.grad[1]);
          ctx.fillStyle = pg; ctx.fill();
        } else if (p.fill && p.fill !== "none") { ctx.fillStyle = p.fill; ctx.fill(); }
        if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw || 1; ctx.lineJoin = "round"; ctx.stroke(); }
      } else if (k === "text") {
        ctx.font = (p.weight || "400") + " " + (p.size || 12) + "px " + FONT;
        ctx.fillStyle = p.color || "#2b2520";
        ctx.textAlign = p.align === "middle" ? "center" : p.align === "end" ? "right" : "left";
        ctx.textBaseline = p.base === "middle" ? "middle" : "alphabetic";
        if (p.rot) {
          ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
          ctx.fillText(p.text, 0, 0);
        } else ctx.fillText(p.text, p.x, p.y);
      }
      ctx.restore();
    });
  }

  /* ---------- SVG 渲染 ---------- */
  function escXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function svg(model, st) {
    var W = model.W, H = model.H, defs = "", out = [], gi = 0;
    var bg = bgOf(st);
    if (bg.type === "solid") out.push('<rect width="' + W + '" height="' + H + '" fill="' + bg.color + '"/>');
    else if (bg.type === "grad") {
      defs += '<linearGradient id="bgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + bg.from + '"/><stop offset="1" stop-color="' + bg.to + '"/></linearGradient>';
      out.push('<rect width="' + W + '" height="' + H + '" fill="url(#bgG)"/>');
    }
    model.P.forEach(function (p) {
      var dim = (st && st._hl != null && p.m && p.m.li != null && p.m.li !== st._hl) ? 0.15 : 1;
      var eff = (p.op != null ? p.op : 1) * dim;
      var op = eff < 1 ? ' opacity="' + Math.round(eff * 100) / 100 + '"' : "";
      if (p.k === "rect") {
        var fill = p.fill || "none";
        if (p.grad) {
          gi++;
          defs += '<linearGradient id="g' + gi + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p.grad[0] + '"/><stop offset="1" stop-color="' + p.grad[1] + '"/></linearGradient>';
          fill = "url(#g" + gi + ")";
        }
        out.push('<rect x="' + r2(p.x) + '" y="' + r2(p.y) + '" width="' + r2(p.w) + '" height="' + r2(p.h) + '"' + (p.r ? ' rx="' + r2(Math.min(p.r, p.w / 2, p.h / 2)) + '"' : "") + ' fill="' + fill + '"' + op + "/>");
      } else if (p.k === "line") {
        out.push('<line x1="' + r2(p.x1) + '" y1="' + r2(p.y1) + '" x2="' + r2(p.x2) + '" y2="' + r2(p.y2) + '" stroke="' + p.stroke + '" stroke-width="' + (p.w || 1) + '"' + (p.dash ? ' stroke-dasharray="' + p.dash.join(" ") + '"' : "") + op + "/>");
      } else if (p.k === "circle") {
        out.push('<circle cx="' + r2(p.cx) + '" cy="' + r2(p.cy) + '" r="' + r2(Math.max(0.1, p.r)) + '" fill="' + (p.fill || "none") + '"' + (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + (p.sw || 1) + '"' : "") + op + "/>");
      } else if (p.k === "arc") {
        var large = p.a1 - p.a0 > Math.PI ? 1 : 0;
        var ax0 = p.cx + Math.cos(p.a0) * p.r, ay0 = p.cy + Math.sin(p.a0) * p.r;
        var ax1 = p.cx + Math.cos(p.a1) * p.r, ay1 = p.cy + Math.sin(p.a1) * p.r;
        out.push('<path d="M ' + r2(ax0) + " " + r2(ay0) + " A " + r2(p.r) + " " + r2(p.r) + " 0 " + large + " 1 " + r2(ax1) + " " + r2(ay1) + '" fill="none" stroke="' + p.stroke + '" stroke-width="' + (p.sw || 2) + '" stroke-linecap="round"' + op + "/>");
      } else if (p.k === "slice") {
        var big = p.a1 - p.a0 > Math.PI ? 1 : 0;
        var x0 = p.cx + Math.cos(p.a0) * p.r, y0 = p.cy + Math.sin(p.a0) * p.r;
        var x1 = p.cx + Math.cos(p.a1) * p.r, y1 = p.cy + Math.sin(p.a1) * p.r;
        var d;
        if (p.ir > 0) {
          var xi1 = p.cx + Math.cos(p.a1) * p.ir, yi1 = p.cy + Math.sin(p.a1) * p.ir;
          var xi0 = p.cx + Math.cos(p.a0) * p.ir, yi0 = p.cy + Math.sin(p.a0) * p.ir;
          d = "M " + r2(x0) + " " + r2(y0) + " A " + r2(p.r) + " " + r2(p.r) + " 0 " + big + " 1 " + r2(x1) + " " + r2(y1) + " L " + r2(xi1) + " " + r2(yi1) + " A " + r2(p.ir) + " " + r2(p.ir) + " 0 " + big + " 0 " + r2(xi0) + " " + r2(yi0) + " Z";
        } else {
          d = "M " + r2(p.cx) + " " + r2(p.cy) + " L " + r2(x0) + " " + r2(y0) + " A " + r2(p.r) + " " + r2(p.r) + " 0 " + big + " 1 " + r2(x1) + " " + r2(y1) + " Z";
        }
        out.push('<path d="' + d + '" fill="' + p.fill + '"' + (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + (p.sw || 1) + '"' : "") + op + "/>");
      } else if (p.k === "path") {
        var dd = p.cmds.map(function (c) {
          return c.c === "Z" ? "Z" : c.c + " " + c.p.map(r2).join(" ");
        }).join(" ");
        var pf = p.fill || "none";
        if (p.grad) {
          gi++;
          defs += '<linearGradient id="g' + gi + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + p.grad[0] + '"/><stop offset="1" stop-color="' + p.grad[1] + '"/></linearGradient>';
          pf = "url(#g" + gi + ")";
        }
        out.push('<path d="' + dd + '" fill="' + pf + '"' + (p.stroke ? ' stroke="' + p.stroke + '" stroke-width="' + (p.sw || 1) + '" stroke-linejoin="round"' : "") + op + "/>");
      } else if (p.k === "text") {
        var anchor = p.align === "middle" ? "middle" : p.align === "end" ? "end" : "start";
        var tr = p.rot ? ' transform="rotate(' + p.rot + " " + r2(p.x) + " " + r2(p.y) + ')"' : "";
        out.push('<text x="' + r2(p.x) + '" y="' + r2(p.y) + '" font-family="' + FONT.replace(/"/g, "'") + '" font-size="' + (p.size || 12) + '"' +
          (p.weight && p.weight !== "400" ? ' font-weight="' + p.weight + '"' : "") +
          ' fill="' + (p.color || "#2b2520") + '" text-anchor="' + anchor + '" dominant-baseline="' + (p.base === "middle" ? "central" : "auto") + '"' + tr + op + ">" + escXml(p.text) + "</text>");
      }
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '"><defs>' + defs + "</defs>" + out.join("") + "</svg>";
  }
  function r2(v) { return Math.round(v * 100) / 100; }

  return {
    buildModel: buildModel,
    paint: paint,
    svg: svg,
    parseCSV: parseCSV,
    PANTRY: null,
    PALETTES: PALETTES,
    inkOf: inkOf,
    bgOf: bgOf
  };
}

if (typeof window !== "undefined") window.ZHZChartCore = makeCore;
