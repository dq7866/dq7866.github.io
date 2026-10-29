/* 图表生成工具 v2 · 纯前端 Canvas/SVG 双渲染
 * 柱状图 / 折线图 / 组合图(柱线混合) / 饼图(环形) / 雷达图
 * 多系列自定义数量 · 双Y轴 · 轴/标题/网格/刻度全面可配置
 * 无外部依赖。架构：数据解析 → 布局模型 → 图元列表 → Canvas / SVG 双渲染（输出一致）
 */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /* ---------------- 颜色主题 ---------------- */
  const colorPalettes = [
    { name: "琥珀橙", colors: ["#ff4d00", "#ff7a2d", "#ffa64d", "#ffd280", "#ffe0a0", "#fff0d0"] },
    { name: "商务蓝", colors: ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"] },
    { name: "自然绿", colors: ["#059669", "#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"] },
    { name: "优雅紫", colors: ["#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe"] },
    { name: "活力红", colors: ["#dc2626", "#ef4444", "#f87171", "#fca5a5", "#fecaca", "#fee2e2"] },
    { name: "清新青", colors: ["#0891b2", "#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc", "#cffafe"] },
    { name: "温暖调", colors: ["#ea580c", "#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5"] },
    { name: "彩虹色", colors: ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"] },
  ];
  // 多系列专用：色相均匀分布的高对比基色（超过主题色数量时回退到这里）
  const SERIES_FALLBACK = ["#2563eb", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];
  let currentPalette = 0;

  function getPaletteColor(index) {
    const palette = colorPalettes[currentPalette].colors;
    return palette[index % palette.length];
  }
  function getSeriesColor(index) {
    const palette = colorPalettes[currentPalette].colors;
    // 系列多于主题色时使用高对比基色，避免相邻系列颜色过于接近
    if (index < palette.length) return palette[index];
    return SERIES_FALLBACK[index % SERIES_FALLBACK.length];
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* ---------------- 全局配置状态 ---------------- */
  const state = {
    chartType: "bar",            // bar | line | combo | pie | radar
    title: "销售数据统计",
    subtitle: "",
    titleSize: 18,
    width: 800,
    height: 500,
    bg: "white",
    showLegend: true,
    legendPos: "top",            // top | bottom
    showLabels: true,            // 数据标签（点/柱上的数值）
    // 网格与刻度
    gridH: true,
    gridV: false,
    showXLabels: true,           // X 轴分类标签
    showYTicks: true,            // Y 轴刻度值
    xRotate: "auto",             // auto | 0 | -45 | -90
    yTickCount: 5,
    // 轴设置
    xTitle: "",
    yTitle: "",
    y2Title: "",
    yMin: "", yMax: "",
    y2Min: "", y2Max: "",
    dualAxis: false,
    // 饼图
    pieDoughnut: false,
    piePercent: true,
  };

  // 每个系列的配置：{ color: 覆盖色或'', axis: 'L'|'R', stype: 'bar'|'line'|'area' }
  const seriesCfg = [];
  function axisOf(i) { return (seriesCfg[i] && seriesCfg[i].axis) || "L"; }
  function stypeOf(i) { return (seriesCfg[i] && seriesCfg[i].stype) || "bar"; }
  function colorOf(i) {
    const c = seriesCfg[i] && seriesCfg[i].color;
    return c || getSeriesColor(i);
  }
  function ensureCfg(count) {
    while (seriesCfg.length < count) seriesCfg.push({ color: "", axis: "L", stype: "bar" });
    seriesCfg.length = count;
    if (!state.dualAxis) seriesCfg.forEach(c => (c.axis = "L"));
  }

  /* ---------------- 文本测量（Canvas/SVG 共用估算，保证两端布局一致） ---------------- */
  function estW(s, fs) {
    let w = 0;
    for (const ch of String(s)) w += ch.charCodeAt(0) > 255 ? fs : fs * 0.62;
    return w;
  }
  function fmtTick(v) {
    if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
    if (Math.abs(v) >= 1e5) return (v / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
    if (Math.abs(v) >= 1000) return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return String(Math.round(v * 100) / 100);
  }
  function fmtVal(v) {
    if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    if (Math.abs(v) >= 1000) return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return String(Math.round(v * 100) / 100);
  }
  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  /* ---------------- 数据解析 ---------------- */
  function splitLine(line) { return line.split(/[,，\t]/).map(s => s.trim()); }

  function parseData(text) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
    if (!lines.length) return { labels: [], series: [], seriesNames: [], hasHeader: false };

    const first = splitLine(lines[0]);
    const valueCells = first.slice(1);
    // 首行所有"值列"都是非数字 → 视为表头
    let hasHeader = first.length >= 2 && valueCells.length > 0 && valueCells.every(c => c === "" || isNaN(Number(c)));

    let headerNames = null;
    let dataLines = lines;
    if (hasHeader) {
      headerNames = first.slice(1);
      dataLines = lines.slice(1);
    }

    const labels = [];
    const cols = [];
    dataLines.forEach(line => {
      const parts = splitLine(line);
      labels.push(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        const v = Number(parts[i]);
        if (!cols[i - 1]) cols[i - 1] = [];
        cols[i - 1].push(isNaN(v) ? 0 : v);
      }
    });
    const maxCols = cols.length;
    const series = [];
    for (let i = 0; i < maxCols; i++) series.push(cols[i] || labels.map(() => 0));

    let seriesNames;
    if (headerNames) {
      seriesNames = series.map((_, i) => headerNames[i] || "系列" + (i + 1));
    } else if (series.length === 1) {
      seriesNames = ["数值"];
    } else {
      seriesNames = series.map((_, i) => (i === 0 ? "数值" : "系列" + (i + 1)));
    }
    return { labels, series, seriesNames, hasHeader };
  }

  /* ---------------- 数据列增删（系列数量步进器） ---------------- */
  function rebuildDataColumns(target) {
    const ta = $("#chartData");
    const lines = ta.value.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
    if (!lines.length) {
      // 空数据：生成示例骨架
      const hdr = ["标签"];
      for (let k = 0; k < target; k++) hdr.push(k === 0 ? "数值" : "系列" + (k + 1));
      const rows = ["一月", "二月", "三月", "四月"].map(lab => [lab, 120, 200, 150, 240].slice(0, target + 1).join(","));
      ta.value = [hdr.join(","), ...rows].join("\n");
      renderChart();
      return;
    }
    const parsed = parseData(ta.value);
    const cur = Math.max(1, parsed.series.length);
    if (target === cur) return;
    const hasHdr = parsed.hasHeader;

    if (target > cur) {
      const add = target - cur;
      if (hasHdr) {
        const hdr = splitLine(lines[0]);
        for (let k = 0; k < add; k++) hdr.push("系列" + (cur + k + 1));
        lines[0] = hdr.join(",");
      } else {
        const names = [];
        for (let k = 0; k < target; k++) names.push(k === 0 ? "数值" : "系列" + (k + 1));
        lines.unshift(["标签", ...names].join(","));
      }
      for (let r = hasHdr ? 1 : 0; r < lines.length; r++) {
        const parts = splitLine(lines[r]);
        const vals = parts.slice(1).map(Number).filter(v => !isNaN(v));
        const base = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 50;
        for (let k = 0; k < add; k++) {
          parts.push(String(Math.max(1, Math.round(base * (0.78 + 0.22 * k + 0.06 * (r % 3))))));
        }
        lines[r] = parts.join(",");
      }
    } else {
      if (hasHdr) {
        const hdr = splitLine(lines[0]);
        lines[0] = hdr.slice(0, target + 1).join(",");
      }
      const start = hasHdr ? 1 : 0;
      for (let r = start; r < lines.length; r++) {
        const parts = splitLine(lines[r]);
        lines[r] = parts.slice(0, target + 1).join(",");
      }
    }
    ta.value = lines.join("\n");
    renderChart();
  }

  function writeSeriesName(index, newName) {
    const ta = $("#chartData");
    const lines = ta.value.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
    const parsed = parseData(ta.value);
    let out;
    if (parsed.hasHeader) {
      const hdr = splitLine(lines[0]);
      while (hdr.length < index + 2) hdr.push("系列" + hdr.length);
      hdr[index + 1] = newName || "系列" + (index + 1);
      lines[0] = hdr.join(",");
      out = lines;
    } else {
      // 无表头：补一行表头再写名
      const names = parsed.seriesNames.map((n, i) => (i === index ? (newName || "系列" + (index + 1)) : n));
      out = [["标签", ...names].join(","), ...lines];
    }
    ta.value = out.join("\n");
    renderChart();
  }

  /* ---------------- 坐标轴刻度计算 ---------------- */
  function niceNum(x) {
    if (x <= 0 || !isFinite(x)) return 1;
    const e = Math.floor(Math.log10(x));
    const f = x / Math.pow(10, e);
    const nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    return nf * Math.pow(10, e);
  }
  function niceScale(lo, hi, count, snap) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) { lo = 0; hi = 1; }
    if (hi === lo) hi = lo + 1;
    const step = niceNum((hi - lo) / Math.max(2, count));
    let min, max;
    if (snap) {
      min = Math.floor(lo / step) * step;
      max = Math.ceil(hi / step) * step;
      if (max === min) max = min + step;
    } else { min = lo; max = hi; }
    const ticks = [];
    for (let v = min, guard = 0; v <= max + step * 1e-9 && guard < 200; v += step, guard++) {
      ticks.push(Math.round(v * 1e6) / 1e6);
    }
    return { min, max, step, ticks };
  }

  function axisScaleFor(data, axis) {
    const p = axis === "R" ? "y2" : "y";
    const idxs = data.series.map((_, i) => i).filter(i => axisOf(i) === axis);
    if (!idxs.length) return null;
    let mx = -Infinity, mn = Infinity;
    idxs.forEach(si => data.series[si].forEach(v => { if (v > mx) mx = v; if (v < mn) mn = v; }));
    if (mx <= 0) mx = 1;
    let lo = parseFloat(state[p + "Min"]);
    let hi = parseFloat(state[p + "Max"]);
    const hasLo = isFinite(lo), hasHi = isFinite(hi);
    // 自动下界：数据有负值时向下扩展，避免曲线/柱体越出绘图区
    if (!hasLo) lo = mn < 0 ? mn : 0;
    if (!hasHi) hi = mx;
    if (lo >= hi) { lo = mn < 0 ? mn : 0; hi = niceNum(mx); }
    return niceScale(lo, hi, state.yTickCount, !(hasLo && hasHi));
  }

  function xRotAngle(nLabels) {
    if (state.xRotate === "auto") return nLabels > 8 ? -45 : 0;
    return parseInt(state.xRotate, 10) || 0;
  }

  /* ---------------- 图元构建 ---------------- */
  // 图元：rect / line / circle / path(M,L,C,Z) / slice / text
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

  function buildModel(data) {
    if (state.chartType === "pie") return buildPie(data);
    if (state.chartType === "radar") return buildRadar(data);
    return buildCartesian(data);
  }

  function legendItems(data) {
    if (state.chartType === "pie") {
      return data.labels.map((lab, i) => ({ label: trunc(lab, 10), color: colorOf(i) }));
    }
    if (data.series.length < 2) return [];
    return data.seriesNames.map((n, i) => ({ label: trunc(n, 10), color: colorOf(i) }));
  }

  function drawTitles(P, W, top) {
    let y = 16 + state.titleSize * 0.8;
    if (state.title) {
      P.push({ k: "text", x: W / 2, y: y, text: trunc(state.title, 60), size: state.titleSize, weight: "600", align: "middle", base: "alphabetic", color: "#2b2520" });
      y += 8;
    }
    if (state.subtitle) {
      y += 13;
      P.push({ k: "text", x: W / 2, y: y, text: trunc(state.subtitle, 80), size: 12, weight: "400", align: "middle", base: "alphabetic", color: "#6b5e52" });
      y += 6;
    }
    return y + 2; // 内容起始 y
  }

  function drawLegendTop(P, items, W, yStart) {
    const fs = 12, sw = 14, gap = 18, itemGap = 16;
    let total = 0;
    items.forEach(it => (total += sw + 5 + estW(it.label, fs) + itemGap));
    let x = Math.max(12, (W - total) / 2);
    const y = yStart != null ? yStart : 8;
    items.forEach(it => {
      P.push({ k: "rect", x: x, y: y, w: sw, h: sw - 4, r: 3, fill: it.color });
      P.push({ k: "text", x: x + sw + 5, y: y + fs - 2, text: it.label, size: fs, align: "start", base: "alphabetic", color: "#6b5e52" });
      x += sw + 5 + estW(it.label, fs) + itemGap;
    });
    return y + fs + 12;
  }

  function buildCartesian(data) {
    const W = state.width, H = state.height;
    const dual = state.dualAxis;
    const scL = axisScaleFor(data, "L");
    const scR = dual ? axisScaleFor(data, "R") : null;
    const items = legendItems(data);
    const P = [];

    // —— 标题 / 副标题 / 顶部图例 ——
    let contentTop = 16;
    if (state.title || state.subtitle) contentTop = drawTitles(P, W, contentTop);
    if (state.showLegend && items.length && state.legendPos === "top") contentTop = drawLegendTop(P, items, W, contentTop);

    // —— 刻度标签宽度 → 左右留白 ——
    const tickFs = 12;
    const tickWL = scL && state.showYTicks ? Math.max(...scL.ticks.map(t => estW(fmtTick(t), tickFs))) : 0;
    const tickWR = scR && state.showYTicks ? Math.max(...scR.ticks.map(t => estW(fmtTick(t), tickFs))) : 0;
    const left = 14 + tickWL + (tickWL ? 12 : 6) + (state.yTitle ? 18 : 0);
    const right = 16 + (scR ? tickWR + 12 + (state.y2Title ? 18 : 0) : 6);

    const rot = xRotAngle(data.labels.length);
    const maxLabW = Math.max(24, ...data.labels.map(l => estW(trunc(l, 12), 12)));
    let bottom = 12 + (state.xTitle ? 20 : 0);
    if (state.showXLabels) bottom += rot === -45 ? maxLabW * 0.71 + 12 : rot === -90 ? maxLabW + 8 : 20;
    let bottomExtra = 0;
    if (state.showLegend && items.length && state.legendPos === "bottom") bottomExtra = 24;

    const top = contentTop;
    const plot = {
      x: left,
      y: top,
      w: Math.max(60, W - left - right),
      h: Math.max(60, H - top - bottom - bottomExtra),
    };

    const valToY = (v, sc) => plot.y + plot.h - ((v - sc.min) / (sc.max - sc.min)) * plot.h;
    const zeroY = sc => valToY(Math.min(Math.max(0, sc.min), sc.max), sc);

    // —— 网格 ——
    const gridColor = "#e8dfd1";
    if (state.gridH) {
      (scL ? scL.ticks : []).forEach(t => {
        const y = valToY(t, scL);
        P.push({ k: "line", x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: gridColor, w: 1 });
      });
      if (scR && dual) scR.ticks.forEach(t => { /* 右轴网格与左轴重合时只画横向一次（以左轴为准） */ });
    }
    const n = data.labels.length;
    const anyBar = state.chartType === "bar" || (state.chartType === "combo" && data.series.some((_, i) => stypeOf(i) === "bar"));
    if (state.gridV && n > 0) {
      if (anyBar) {
        for (let i = 1; i < n; i++) {
          const x = plot.x + (i * plot.w) / n;
          P.push({ k: "line", x1: x, y1: plot.y, x2: x, y2: plot.y + plot.h, stroke: gridColor, w: 1 });
        }
      } else {
        for (let i = 0; i < n; i++) {
          const x = n === 1 ? plot.x + plot.w / 2 : plot.x + (i * plot.w) / (n - 1);
          P.push({ k: "line", x1: x, y1: plot.y, x2: x, y2: plot.y + plot.h, stroke: gridColor, w: 1 });
        }
      }
    }

    // —— 轴线 ——
    const axisColor = "#9a8e80";
    P.push({ k: "line", x1: plot.x, y1: plot.y + plot.h, x2: plot.x + plot.w, y2: plot.y + plot.h, stroke: axisColor, w: 1 });
    P.push({ k: "line", x1: plot.x, y1: plot.y, x2: plot.x, y2: plot.y + plot.h, stroke: axisColor, w: 1 });
    if (scR && dual) {
      P.push({ k: "line", x1: plot.x + plot.w, y1: plot.y, x2: plot.x + plot.w, y2: plot.y + plot.h, stroke: axisColor, w: 1 });
    }

    // —— X 分类标签 ——
    if (state.showXLabels && n > 0) {
      const stride = anyBar ? 1 : Math.max(1, Math.ceil(n / 12));
      for (let i = 0; i < n; i += stride) {
        const x = anyBar ? plot.x + (i + 0.5) * plot.w / n : (n === 1 ? plot.x + plot.w / 2 : plot.x + (i * plot.w) / (n - 1));
        const y = plot.y + plot.h + 14;
        if (rot === -45) {
          P.push({ k: "text", x: x, y: y + 6, text: trunc(data.labels[i], 12), size: 12, align: "end", base: "middle", color: "#6b5e52", rot: -45 });
        } else if (rot === -90) {
          P.push({ k: "text", x: x, y: y + 4, text: trunc(data.labels[i], 12), size: 12, align: "end", base: "middle", color: "#6b5e52", rot: -90 });
        } else {
          P.push({ k: "text", x: x, y: y, text: trunc(data.labels[i], 12), size: 12, align: "middle", base: "alphabetic", color: "#6b5e52" });
        }
      }
    }

    // —— Y 刻度（左 / 右）——
    if (scL && state.showYTicks) {
      scL.ticks.forEach(t => {
        const y = valToY(t, scL);
        P.push({ k: "line", x1: plot.x - 4, y1: y, x2: plot.x, y2: y, stroke: axisColor, w: 1 });
        P.push({ k: "text", x: plot.x - 8, y: y, text: fmtTick(t), size: tickFs, align: "end", base: "middle", color: "#9a8e80" });
      });
    }
    if (scR && dual && state.showYTicks) {
      scR.ticks.forEach(t => {
        const y = valToY(t, scR);
        P.push({ k: "line", x1: plot.x + plot.w, y1: y, x2: plot.x + plot.w + 4, y2: y, stroke: axisColor, w: 1 });
        P.push({ k: "text", x: plot.x + plot.w + 8, y: y, text: fmtTick(t), size: tickFs, align: "start", base: "middle", color: "#9a8e80" });
      });
    }

    // —— 轴标题 ——
    if (state.yTitle) {
      P.push({ k: "text", x: 14, y: plot.y + plot.h / 2, text: trunc(state.yTitle, 16), size: 12, align: "middle", base: "middle", color: "#6b5e52", rot: -90 });
    }
    if (dual && state.y2Title) {
      P.push({ k: "text", x: W - 14, y: plot.y + plot.h / 2, text: trunc(state.y2Title, 16), size: 12, align: "middle", base: "middle", color: "#6b5e52", rot: 90 });
    }
    if (state.xTitle) {
      P.push({ k: "text", x: plot.x + plot.w / 2, y: H - bottom + 22, text: trunc(state.xTitle, 20), size: 12, align: "middle", base: "alphabetic", color: "#6b5e52" });
    }

    // —— 数据系列 ——
    // 绘制顺序：柱 → 面积 → 线（组内按索引稳定排序）
    const barIdxs = [], areaIdxs = [], lineIdxs = [];
    data.series.forEach((_, i) => {
      const st = state.chartType === "bar" ? "bar" : state.chartType === "line" ? "line" : stypeOf(i);
      if (st === "bar") barIdxs.push(i);
      else if (st === "area") areaIdxs.push(i);
      else lineIdxs.push(i);
    });

    const xpos = i => (anyBar || state.chartType === "combo"
      ? plot.x + (i + 0.5) * plot.w / n
      : (n === 1 ? plot.x + plot.w / 2 : plot.x + (i * plot.w) / (n - 1)));

    // 柱
    if (barIdxs.length && n > 0) {
      const gw = plot.w / n;
      const bw = Math.max(2, Math.min(48, (gw * 0.72 - 3 * (barIdxs.length - 1)) / barIdxs.length));
      const groupW = bw * barIdxs.length + 3 * (barIdxs.length - 1);
      barIdxs.forEach((si, bi) => {
        const sc = axisOf(si) === "R" && scR ? scR : scL;
        const color = colorOf(si);
        data.series[si].forEach((v, i) => {
          const x = plot.x + (i + 0.5) * gw - groupW / 2 + bi * (bw + 3);
          const y = valToY(v, sc);
          const y0 = zeroY(sc);
          const yTop = Math.min(y, y0), hh = Math.max(1, Math.abs(y0 - y));
          P.push({ k: "rect", x: x, y: yTop, w: bw, h: hh, r: Math.min(3, bw / 2), fill: color });
          if (state.showLabels) {
            P.push({ k: "text", x: x + bw / 2, y: y < y0 ? y - 5 : y + 12, text: fmtVal(v), size: 11, align: "middle", base: "alphabetic", color: "#6b5e52" });
          }
        });
      });
    }
    // 面积
    areaIdxs.forEach(si => {
      const sc = axisOf(si) === "R" && scR ? scR : scL;
      const color = colorOf(si);
      const cmds = [];
      data.series[si].forEach((v, i) => {
        const x = xpos(i), y = valToY(v, sc);
        if (i === 0) cmds.push({ c: "M", p: [x, y] });
        else cmds.push({ c: "L", p: [x, y] });
      });
      cmds.push({ c: "L", p: [xpos(n - 1), zeroY(sc)] });
      cmds.push({ c: "L", p: [xpos(0), zeroY(sc)] });
      cmds.push({ c: "Z" });
      P.push({ k: "path", cmds, fill: hexToRgba(color, 0.22), stroke: color, sw: 2 });
      if (state.showLabels) {
        data.series[si].forEach((v, i) => {
          P.push({ k: "text", x: xpos(i), y: valToY(v, sc) - 6, text: fmtVal(v), size: 11, align: "middle", base: "alphabetic", color: "#6b5e52" });
        });
      }
    });
    // 线
    lineIdxs.forEach(si => {
      const sc = axisOf(si) === "R" && scR ? scR : scL;
      const color = colorOf(si);
      const pts = data.series[si].map((v, i) => [xpos(i), valToY(v, sc)]);
      // 面积底（同旧版折线的淡填充）
      if (pts.length > 1) {
        const fillCmds = [{ c: "M", p: pts[0] }];
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
          const mx = (x0 + x1) / 2;
          fillCmds.push({ c: "C", p: [mx, y0, mx, y1, x1, y1] });
        }
        fillCmds.push({ c: "L", p: [pts[pts.length - 1][0], zeroY(sc)] });
        fillCmds.push({ c: "L", p: [pts[0][0], zeroY(sc)] });
        fillCmds.push({ c: "Z" });
        P.push({ k: "path", cmds: fillCmds, fill: hexToRgba(color, 0.12) });
      }
      const strokeCmds = [{ c: "M", p: pts[0] }];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        const mx = (x0 + x1) / 2;
        strokeCmds.push({ c: "C", p: [mx, y0, mx, y1, x1, y1] });
      }
      P.push({ k: "path", cmds: strokeCmds, stroke: color, sw: 2.5 });
      pts.forEach(([x, y]) => P.push({ k: "circle", cx: x, cy: y, r: 3.5, fill: color }));
      if (state.showLabels) {
        pts.forEach(([x, y], i) => {
          P.push({ k: "text", x: x, y: y - 8, text: fmtVal(data.series[si][i]), size: 11, align: "middle", base: "alphabetic", color: "#6b5e52" });
        });
      }
    });

    // —— 底部图例 ——
    if (state.showLegend && items.length && state.legendPos === "bottom") {
      const fs = 12, sw = 14, itemGap = 16;
      let total = 0;
      items.forEach(it => (total += sw + 5 + estW(it.label, fs) + itemGap));
      let x = Math.max(12, (W - total) / 2);
      const y = H - bottomExtra + 4;
      items.forEach(it => {
        P.push({ k: "rect", x: x, y: y, w: sw, h: sw - 4, r: 3, fill: it.color });
        P.push({ k: "text", x: x + sw + 5, y: y + fs - 2, text: it.label, size: fs, align: "start", base: "alphabetic", color: "#6b5e52" });
        x += sw + 5 + estW(it.label, fs) + itemGap;
      });
    }

    return { P, W, H };
  }

  function buildPie(data) {
    const W = state.width, H = state.height;
    const P = [];
    const items = legendItems(data);
    let contentTop = 16;
    if (state.title || state.subtitle) contentTop = drawTitles(P, W, contentTop);
    const legendSide = false;
    if (state.showLegend && items.length && state.legendPos === "top") contentTop = drawLegendTop(P, items, W, contentTop);

    const bottomPad = state.showLegend && items.length && state.legendPos === "bottom" ? 30 : 20;
    const vals = data.series[0] || [];
    const total = vals.reduce((a, b) => a + Math.max(0, b), 0);
    const cx = W / 2, cy = contentTop + (H - contentTop - bottomPad) / 2;
    const r = Math.min(W, H - contentTop - bottomPad) * 0.36;
    const ir = state.pieDoughnut ? r * 0.58 : 0;

    let a0 = -Math.PI / 2;
    if (total <= 0) {
      P.push({ k: "circle", cx, cy, r, fill: "#e8dfd1" });
    } else {
      vals.forEach((v, i) => {
        const frac = Math.max(0, v) / total;
        if (frac <= 0) return;
        const a1 = a0 + frac * Math.PI * 2;
        const color = colorOf(i);
        P.push({ k: "slice", cx, cy, r, ir, a0, a1, fill: color });
        if (state.piePercent) {
          const mid = (a0 + a1) / 2;
          const lr = ir + (r - ir) * 0.62;
          const lx = cx + Math.cos(mid) * lr, ly = cy + Math.sin(mid) * lr;
          const pct = Math.round(frac * 1000) / 10;
          P.push({ k: "text", x: lx, y: ly, text: pct + "%", size: 12, weight: "600", align: "middle", base: "middle", color: pct >= 30 ? "#fff" : "#2b2520" });
        }
        a0 = a1;
      });
    }
    if (state.pieDoughnut) {
      P.push({ k: "text", x: cx, y: cy - 4, text: fmtVal(total), size: 20, weight: "600", align: "middle", base: "middle", color: "#2b2520" });
      P.push({ k: "text", x: cx, y: cy + 14, text: "总计", size: 11, align: "middle", base: "middle", color: "#9a8e80" });
    }

    if (state.showLegend && items.length && state.legendPos === "bottom") {
      const fs = 12, sw = 14, itemGap = 16;
      let totalW = 0;
      items.forEach(it => (totalW += sw + 5 + estW(it.label, fs) + itemGap));
      let x = Math.max(12, (W - totalW) / 2);
      const y = H - bottomPad + 8;
      items.forEach(it => {
        P.push({ k: "rect", x: x, y: y, w: sw, h: sw - 4, r: 3, fill: it.color });
        P.push({ k: "text", x: x + sw + 5, y: y + fs - 2, text: it.label, size: fs, align: "start", base: "alphabetic", color: "#6b5e52" });
        x += sw + 5 + estW(it.label, fs) + itemGap;
      });
    }
    return { P, W, H };
  }

  function buildRadar(data) {
    const W = state.width, H = state.height;
    const P = [];
    const items = legendItems(data);
    let contentTop = 16;
    if (state.title || state.subtitle) contentTop = drawTitles(P, W, contentTop);
    if (state.showLegend && items.length && state.legendPos === "top") contentTop = drawLegendTop(P, items, W, contentTop);

    const n = data.labels.length;
    const cx = W / 2, cy = contentTop + (H - contentTop - (state.showLegend && items.length && state.legendPos === "bottom" ? 46 : 30)) / 2;
    const r = Math.min(W / 2 - 70, (H - contentTop) / 2 - 40);
    const mx = Math.max(1, ...data.series.flat());

    // 网格环（5 层）
    const levels = 5;
    for (let l = levels; l >= 1; l--) {
      const rr = (r * l) / levels;
      const cmds = [];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        cmds.push(i === 0 ? { c: "M", p: [x, y] } : { c: "L", p: [x, y] });
      }
      cmds.push({ c: "Z" });
      P.push({ k: "path", cmds, stroke: "#e8dfd1", sw: 1, fill: l % 2 ? "#faf6f0" : "none" });
    }
    // 轴线与标签
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      P.push({ k: "line", x1: cx, y1: cy, x2: x, y2: y, stroke: "#e8dfd1", w: 1 });
      const lx = cx + Math.cos(a) * (r + 18), ly = cy + Math.sin(a) * (r + 16);
      P.push({
        k: "text", x: lx, y: ly, text: trunc(data.labels[i], 8), size: 12,
        align: Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end",
        base: "middle", color: "#6b5e52",
      });
    }
    // 数据多边形
    data.series.forEach((serie, si) => {
      const color = colorOf(si);
      const cmds = [];
      serie.forEach((v, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const rr = (Math.max(0, v) / mx) * r;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        cmds.push(i === 0 ? { c: "M", p: [x, y] } : { c: "L", p: [x, y] });
      });
      cmds.push({ c: "Z" });
      P.push({ k: "path", cmds, fill: hexToRgba(color, 0.18), stroke: color, sw: 2 });
      serie.forEach((v, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const rr = (Math.max(0, v) / mx) * r;
        P.push({ k: "circle", cx: cx + Math.cos(a) * rr, cy: cy + Math.sin(a) * rr, r: 3, fill: color });
      });
    });

    if (state.showLegend && items.length && state.legendPos === "bottom") {
      const fs = 12, sw = 14, itemGap = 16;
      let totalW = 0;
      items.forEach(it => (totalW += sw + 5 + estW(it.label, fs) + itemGap));
      let x = Math.max(12, (W - totalW) / 2);
      const y = H - 30;
      items.forEach(it => {
        P.push({ k: "rect", x: x, y: y, w: sw, h: sw - 4, r: 3, fill: it.color });
        P.push({ k: "text", x: x + sw + 5, y: y + fs - 2, text: it.label, size: fs, align: "start", base: "alphabetic", color: "#6b5e52" });
        x += sw + 5 + estW(it.label, fs) + itemGap;
      });
    }
    return { P, W, H };
  }

  /* ---------------- Canvas 渲染 ---------------- */
  function paintCanvas(ctx, model) {
    const { P, W, H } = model;
    ctx.clearRect(0, 0, W, H);
    drawBg(ctx, W, H);
    ctx.font = `12px ${FONT}`;
    P.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.op != null ? p.op : 1;
      switch (p.k) {
        case "rect": {
          ctx.fillStyle = p.fill;
          if (p.r) {
            const r = Math.min(p.r, p.w / 2, p.h / 2);
            ctx.beginPath();
            ctx.moveTo(p.x + r, p.y);
            ctx.arcTo(p.x + p.w, p.y, p.x + p.w, p.y + p.h, r);
            ctx.arcTo(p.x + p.w, p.y + p.h, p.x, p.y + p.h, r);
            ctx.arcTo(p.x, p.y + p.h, p.x, p.y, r);
            ctx.arcTo(p.x, p.y, p.x + p.w, p.y, r);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(p.x, p.y, p.w, p.h);
          }
          break;
        }
        case "line": {
          ctx.strokeStyle = p.stroke; ctx.lineWidth = p.w || 1;
          if (p.dash) ctx.setLineDash(p.dash);
          ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
        case "circle": {
          ctx.beginPath(); ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
          if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
          if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw || 1; ctx.stroke(); }
          break;
        }
        case "slice": {
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
          break;
        }
        case "path": {
          ctx.beginPath();
          p.cmds.forEach(c => {
            if (c.c === "M") ctx.moveTo(c.p[0], c.p[1]);
            else if (c.c === "L") ctx.lineTo(c.p[0], c.p[1]);
            else if (c.c === "C") ctx.bezierCurveTo(c.p[0], c.p[1], c.p[2], c.p[3], c.p[4], c.p[5]);
            else if (c.c === "Z") ctx.closePath();
          });
          if (p.fill && p.fill !== "none") { ctx.fillStyle = p.fill; ctx.fill(); }
          if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = p.sw || 1; ctx.stroke(); }
          break;
        }
        case "text": {
          ctx.font = `${p.weight || "400"} ${p.size || 12}px ${FONT}`;
          ctx.fillStyle = p.color || "#2b2520";
          ctx.textAlign = p.align || "start";
          ctx.textBaseline = p.base || "alphabetic";
          if (p.rot) {
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.fillText(p.text, 0, 0);
          } else {
            ctx.fillText(p.text, p.x, p.y);
          }
          break;
        }
      }
      ctx.restore();
    });
  }

  function bgFill() {
    if (state.bg === "transparent") return null;
    if (state.bg === "paper") return { type: "grad", from: "#fffdf8", to: "#f3ede3" };
    return { type: "solid", color: "#ffffff" };
  }
  function drawBg(ctx, W, H) {
    const bf = bgFill();
    if (!bf) return;
    if (bf.type === "solid") { ctx.fillStyle = bf.color; ctx.fillRect(0, 0, W, H); }
    else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, bf.from); g.addColorStop(1, bf.to);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------------- SVG 渲染（与 Canvas 同模型） ---------------- */
  function escXml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function buildSVG(model) {
    const { P, W, H } = model;
    const out = [];
    const bf = bgFill();
    if (bf) {
      if (bf.type === "solid") out.push(`<rect width="${W}" height="${H}" fill="${bf.color}"/>`);
      else out.push(`<defs><linearGradient id="bgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bf.from}"/><stop offset="1" stop-color="${bf.to}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bgg)"/>`);
    }
    P.forEach(p => {
      const op = p.op != null ? ` opacity="${p.op}"` : "";
      switch (p.k) {
        case "rect":
          out.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"${p.r ? ` rx="${Math.min(p.r, p.w / 2, p.h / 2)}"` : ""} fill="${p.fill}"${op}/>`);
          break;
        case "line":
          out.push(`<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="${p.stroke}" stroke-width="${p.w || 1}"${p.dash ? ` stroke-dasharray="${p.dash.join(" ")}"` : ""}${op}/>`);
          break;
        case "circle":
          out.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}"${p.fill ? ` fill="${p.fill}"` : ' fill="none"'}${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw || 1}"` : ""}${op}/>`);
          break;
        case "slice": {
          const large = p.a1 - p.a0 > Math.PI ? 1 : 0;
          const x0 = p.cx + Math.cos(p.a0) * p.r, y0 = p.cy + Math.sin(p.a0) * p.r;
          const x1 = p.cx + Math.cos(p.a1) * p.r, y1 = p.cy + Math.sin(p.a1) * p.r;
          let d;
          if (p.ir > 0) {
            const xi1 = p.cx + Math.cos(p.a1) * p.ir, yi1 = p.cy + Math.sin(p.a1) * p.ir;
            const xi0 = p.cx + Math.cos(p.a0) * p.ir, yi0 = p.cy + Math.sin(p.a0) * p.ir;
            d = `M ${x0} ${y0} A ${p.r} ${p.r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${p.ir} ${p.ir} 0 ${large} 0 ${xi0} ${yi0} Z`;
          } else {
            d = `M ${p.cx} ${p.cy} L ${x0} ${y0} A ${p.r} ${p.r} 0 ${large} 1 ${x1} ${y1} Z`;
          }
          out.push(`<path d="${d}" fill="${p.fill}"${op}/>`);
          break;
        }
        case "path": {
          const d = p.cmds.map(c => c.c === "Z" ? "Z" : `${c.c} ${c.p.map(v => Math.round(v * 100) / 100).join(" ")}`).join(" ");
          out.push(`<path d="${d}"${p.fill && p.fill !== "none" ? ` fill="${p.fill}"` : ' fill="none"'}${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw || 1}"` : ""}${op}/>`);
          break;
        }
        case "text": {
          const anchor = p.align === "middle" ? "middle" : p.align === "end" ? "end" : "start";
          const base = p.base === "middle" ? "middle" : "alphabetic";
          const tr = p.rot ? ` transform="rotate(${p.rot} ${p.x} ${p.y})"` : "";
          out.push(`<text x="${p.x}" y="${p.y}" font-family='${FONT}' font-size="${p.size || 12}"${p.weight && p.weight !== "400" ? ` font-weight="${p.weight}"` : ""} fill="${p.color || "#2b2520"}" text-anchor="${anchor}" dominant-baseline="${base === "middle" ? "middle" : "auto"}"${tr}${op}>${escXml(p.text)}</text>`);
          break;
        }
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join("")}</svg>`;
  }

  /* ---------------- 系列设置面板 ---------------- */
  function rebuildSeriesUI(data) {
    const box = $("#seriesSettings");
    if (!box) return;
    const sig = data.seriesNames.join("¦") + "|" + data.series.length + "|" + state.chartType + "|" + state.dualAxis;
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = "";
    const showAxis = state.dualAxis;
    const showType = state.chartType === "combo";
    data.seriesNames.forEach((name, i) => {
      const row = document.createElement("div");
      row.className = "series-row";
      const color = colorOf(i);
      row.innerHTML =
        `<input type="color" value="${color}" data-si="${i}" data-act="color" title="系列颜色">` +
        `<input type="text" value="${escXml(name)}" data-si="${i}" data-act="name" maxlength="12" title="系列名称">` +
        (showType ? `<select data-si="${i}" data-act="stype" title="系列图形类型">
          <option value="bar"${stypeOf(i) === "bar" ? " selected" : ""}>柱</option>
          <option value="line"${stypeOf(i) === "line" ? " selected" : ""}>线</option>
          <option value="area"${stypeOf(i) === "area" ? " selected" : ""}>面</option>
        </select>` : "") +
        (showAxis ? `<select data-si="${i}" data-act="axis" title="归属轴">
          <option value="L"${axisOf(i) === "L" ? " selected" : ""}>左轴</option>
          <option value="R"${axisOf(i) === "R" ? " selected" : ""}>右轴</option>
        </select>` : "");
      box.appendChild(row);
    });
    $("#seriesOptions").hidden = data.series.length === 0;
  }

  function bindSeriesUI() {
    const box = $("#seriesSettings");
    box.addEventListener("input", e => {
      const t = e.target;
      if (t.dataset.act === "color") {
        seriesCfg[+t.dataset.si].color = t.value;
        renderChart();
      }
    });
    box.addEventListener("change", e => {
      const t = e.target;
      const si = +t.dataset.si;
      if (t.dataset.act === "name") {
        writeSeriesName(si, t.value.trim());
      } else if (t.dataset.act === "axis") {
        seriesCfg[si].axis = t.value;
        renderChart();
      } else if (t.dataset.act === "stype") {
        seriesCfg[si].stype = t.value;
        renderChart();
      }
    });
  }

  /* ---------------- 控件状态同步 ---------------- */
  function syncControls() {
    $$("#chartTypeTabs .chart-type-tab").forEach(b => b.classList.toggle("active", b.dataset.type === state.chartType));
    $("#pieOptions").hidden = state.chartType !== "pie";
    const cartesian = state.chartType === "bar" || state.chartType === "line" || state.chartType === "combo";
    $("#axisOptions").hidden = !cartesian;
    $("#gridOptions").hidden = !cartesian;
    $("#dualAxis").checked = state.dualAxis;
    $("#y2Row").hidden = !state.dualAxis;
    $("#gridH").checked = state.gridH;
    $("#gridV").checked = state.gridV;
    $("#showXLabels").checked = state.showXLabels;
    $("#showYTicks").checked = state.showYTicks;
    $("#xRotate").value = state.xRotate;
    $("#yTickCount").value = String(state.yTickCount);
    $("#chartTitle").value = state.title;
    $("#chartSubtitle").value = state.subtitle;
    $("#titleSize").value = String(state.titleSize);
    $("#showLegend").checked = state.showLegend;
    $("#legendPos").value = state.legendPos;
    $("#showLabels").checked = state.showLabels;
    $("#xTitle").value = state.xTitle;
    $("#yTitle").value = state.yTitle;
    $("#y2Title").value = state.y2Title;
    $("#yMin").value = state.yMin;
    $("#yMax").value = state.yMax;
    $("#y2Min").value = state.y2Min;
    $("#y2Max").value = state.y2Max;
    $$(".bg-btn").forEach(b => b.classList.toggle("active", b.dataset.bg === state.bg));
    $$("#colorPalettes .palette-btn").forEach((b, i) => b.classList.toggle("active", i === currentPalette));
  }

  /* ---------------- 主渲染 ---------------- */
  let canvasCtx = null;

  function renderChart() {
    const canvas = $("#chartCanvas");
    const data = parseData($("#chartData").value);
    ensureCfg(data.series.length);
    canvas.width = state.width;
    canvas.height = state.height;
    canvas.style.maxWidth = "100%";
    canvasCtx = canvas.getContext("2d");
    const model = buildModel(data);
    paintCanvas(canvasCtx, model);
    model._data = data;

    // 统计
    $("#dataCount").textContent = data.labels.length;
    $("#seriesCount").textContent = data.series.length;
    const sn = $("#seriesNum");
    if (sn) sn.textContent = Math.max(1, data.series.length);
    rebuildSeriesUI(data);
  }

  /* ---------------- 导出 ---------------- */
  function bgToSvgCss() {
    if (state.bg === "transparent") return "transparent";
    if (state.bg === "paper") return "#f3ede3";
    return "#ffffff";
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function fileBase() {
    return "chart-" + (state.title || "export").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 30);
  }

  /* ---------------- 示例数据 ---------------- */
  function loadExample(n) {
    if (n === 1) {
      $("#chartData").value = "一月,120\n二月,200\n三月,150\n四月,300\n五月,260";
      state.chartType = "bar"; state.dualAxis = false;
      state.title = "销售数据统计"; state.subtitle = "";
      syncControls(); renderChart();
    } else if (n === 2) {
      $("#chartData").value = "月份,销售额,利润,成本\n一月,120,30,80\n二月,200,55,130\n三月,150,40,95\n四月,300,80,190\n五月,260,70,165";
      state.chartType = "bar"; state.dualAxis = false;
      syncControls(); renderChart();
    } else if (n === 3) {
      $("#chartData").value = "品类,占比\n食品,320\n日用品,180\n服饰,150\n数码,220\n其他,90";
      state.chartType = "pie"; state.dualAxis = false;
      syncControls(); renderChart();
    } else if (n === 4) {
      $("#chartData").value = "月份,销售额(万元),增长率(%)\n一月,320,0\n二月,350,9.4\n三月,410,17.1\n四月,390,-4.9\n五月,460,17.9\n六月,520,13.0";
      state.chartType = "combo";
      state.dualAxis = true;
      ensureCfg(2);
      seriesCfg[0] = { color: "", axis: "L", stype: "bar" };
      seriesCfg[1] = { color: "", axis: "R", stype: "line" };
      state.yTitle = "销售额";
      state.y2Title = "增长率";
      state.title = "销售额与增长率";
      syncControls(); renderChart();
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    // 图表类型
    $("#chartTypeTabs").addEventListener("click", e => {
      const b = e.target.closest(".chart-type-tab");
      if (!b) return;
      state.chartType = b.dataset.type;
      if (state.chartType === "pie") state.dualAxis = false;
      syncControls();
      renderChart();
    });

    // 数据输入
    $("#chartData").addEventListener("input", debounce(renderChart, 350));
    $("#loadExample1").addEventListener("click", () => loadExample(1));
    $("#loadExample2").addEventListener("click", () => loadExample(2));
    $("#loadExample3").addEventListener("click", () => loadExample(3));
    $("#loadExample4").addEventListener("click", () => loadExample(4));

    // 系列数量步进器
    $("#seriesMinus").addEventListener("click", () => {
      const cur = Math.max(1, parseData($("#chartData").value).series.length);
      if (cur > 1) rebuildDataColumns(cur - 1);
    });
    $("#seriesPlus").addEventListener("click", () => {
      const cur = Math.max(1, parseData($("#chartData").value).series.length);
      if (cur < 10) rebuildDataColumns(cur + 1);
    });
    bindSeriesUI();

    // 标题设置
    $("#chartTitle").addEventListener("input", debounce(e => { state.title = e.target.value; renderChart(); }, 300));
    $("#chartSubtitle").addEventListener("input", debounce(e => { state.subtitle = e.target.value; renderChart(); }, 300));
    $("#titleSize").addEventListener("change", e => { state.titleSize = +e.target.value || 18; renderChart(); });

    // 颜色主题
    const palBox = $("#colorPalettes");
    colorPalettes.forEach((pal, i) => {
      const btn = document.createElement("button");
      btn.className = "palette-btn" + (i === currentPalette ? " active" : "");
      btn.title = pal.name;
      btn.innerHTML = `<span class="palette-stripe">${pal.colors.slice(0, 4).map(c => `<i style="background:${c}"></i>`).join("")}</span><span>${pal.name}</span>`;
      btn.addEventListener("click", () => { currentPalette = i; seriesCfg.forEach(c => (c.color = "")); syncControls(); renderChart(); });
      palBox.appendChild(btn);
    });

    // 轴设置
    $("#dualAxis").addEventListener("change", e => {
      state.dualAxis = e.target.checked;
      if (!state.dualAxis) seriesCfg.forEach(c => (c.axis = "L"));
      syncControls();
      renderChart();
    });
    [["xTitle", "xTitle"], ["yTitle", "yTitle"], ["y2Title", "y2Title"]].forEach(([id, key]) => {
      $("#" + id).addEventListener("input", debounce(e => { state[key] = e.target.value; renderChart(); }, 300));
    });
    [["yMin", "yMin"], ["yMax", "yMax"], ["y2Min", "y2Min"], ["y2Max", "y2Max"]].forEach(([id, key]) => {
      $("#" + id).addEventListener("input", debounce(e => { state[key] = e.target.value.trim(); renderChart(); }, 400));
    });

    // 网格与刻度
    $("#gridH").addEventListener("change", e => { state.gridH = e.target.checked; renderChart(); });
    $("#gridV").addEventListener("change", e => { state.gridV = e.target.checked; renderChart(); });
    $("#showXLabels").addEventListener("change", e => { state.showXLabels = e.target.checked; renderChart(); });
    $("#showYTicks").addEventListener("change", e => { state.showYTicks = e.target.checked; renderChart(); });
    $("#xRotate").addEventListener("change", e => { state.xRotate = e.target.value; renderChart(); });
    $("#yTickCount").addEventListener("change", e => { state.yTickCount = Math.min(9, Math.max(2, +e.target.value || 5)); renderChart(); });

    // 显示选项
    $("#showLegend").addEventListener("change", e => { state.showLegend = e.target.checked; renderChart(); });
    $("#legendPos").addEventListener("change", e => { state.legendPos = e.target.value; renderChart(); });
    $("#showLabels").addEventListener("change", e => { state.showLabels = e.target.checked; renderChart(); });

    // 尺寸与背景
    $("#chartWidth").addEventListener("input", debounce(e => { state.width = Math.min(2400, Math.max(200, +e.target.value || 800)); renderChart(); }, 400));
    $("#chartHeight").addEventListener("input", debounce(e => { state.height = Math.min(2400, Math.max(200, +e.target.value || 500)); renderChart(); }, 400));
    $$(".example-btns [data-size]").forEach(b => b.addEventListener("click", () => {
      const [w, h] = b.dataset.size.split("x").map(Number);
      $("#chartWidth").value = w; $("#chartHeight").value = h;
      state.width = w; state.height = h;
      renderChart();
    }));
    $("#bgOptions").addEventListener("click", e => {
      const b = e.target.closest(".bg-btn");
      if (!b) return;
      state.bg = b.dataset.bg;
      $$(".bg-btn").forEach(x => x.classList.toggle("active", x === b));
      renderChart();
    });

    // 饼图选项
    $("#doughnutMode").addEventListener("change", e => { state.pieDoughnut = e.target.checked; renderChart(); });
    $("#showPercent").addEventListener("change", e => { state.piePercent = e.target.checked; renderChart(); });

    // 导出
    $("#downloadPng").addEventListener("click", () => {
      $("#chartCanvas").toBlob(blob => download(blob, fileBase() + ".png"), "image/png");
    });
    $("#downloadSvg").addEventListener("click", () => {
      const data = parseData($("#chartData").value);
      ensureCfg(data.series.length);
      const model = buildModel(data);
      download(new Blob([buildSVG(model)], { type: "image/svg+xml;charset=utf-8" }), fileBase() + ".svg");
    });
    $("#copyImage").addEventListener("click", async () => {
      const btn = $("#copyImage");
      try {
        const blob = await new Promise(r => $("#chartCanvas").toBlob(r, "image/png"));
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        btn.textContent = "已复制 ✓";
      } catch (err) {
        btn.textContent = "复制失败";
      }
      setTimeout(() => (btn.textContent = "复制图片"), 1600);
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    bind();
    syncControls();
    // URL 参数：?t=类型 或 ?ex=示例编号（可分享的深链）
    let deepLinked = false;
    try {
      const q = new URLSearchParams(location.search);
      const ex = parseInt(q.get("ex"), 10);
      if (ex >= 1 && ex <= 4) { loadExample(ex); deepLinked = true; }
      else {
      const t = q.get("t");
      if (["bar", "line", "combo", "pie", "radar"].includes(t)) { state.chartType = t; deepLinked = true; }
      if (deepLinked) {
        // 深链同样需要默认数据
        $("#chartData").value = "月份,销售额,利润\n一月,120,30\n二月,200,55\n三月,150,40\n四月,300,80";
        ensureCfg(2);
      }
      }
    } catch (e) {}
    if (!deepLinked) {
      // 默认给两系列示例，展示多系列能力
      $("#chartData").value = "月份,销售额,利润\n一月,120,30\n二月,200,55\n三月,150,40\n四月,300,80";
      ensureCfg(2);
    }
    syncControls();
    renderChart();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
