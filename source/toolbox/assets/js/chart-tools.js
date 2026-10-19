/* 图表生成工具 · 纯前端 Canvas 实现
 * 柱状图 / 折线图 / 饼图(环形图) / 雷达图
 * 无外部依赖，纯 Canvas 2D API 绘制
 */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 工具函数 ---------------- */
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

  let currentPalette = 0;

  function getPaletteColor(index) {
    const palette = colorPalettes[currentPalette].colors;
    return palette[index % palette.length];
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function buildPaletteButtons() {
    const container = $("#colorPalettes");
    container.innerHTML = "";
    colorPalettes.forEach((palette, idx) => {
      const btn = document.createElement("button");
      btn.className = "palette-btn" + (idx === currentPalette ? " active" : "");
      btn.title = palette.name;
      btn.dataset.idx = idx;
      // Create color stripes
      const stripeCount = Math.min(4, palette.colors.length);
      for (let i = 0; i < stripeCount; i++) {
        const stripe = document.createElement("div");
        stripe.className = "palette-stripe";
        stripe.style.left = (i * (100 / stripeCount)) + "%";
        stripe.style.width = (100 / stripeCount) + "%";
        stripe.style.background = palette.colors[i];
        btn.appendChild(stripe);
      }
      btn.onclick = () => {
        currentPalette = idx;
        $$(".palette-btn").forEach((b, i) => b.classList.toggle("active", i === idx));
        renderChart();
      };
      container.appendChild(btn);
    });
  }

  /* ---------------- 数据解析 ---------------- */
  function parseData(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== "");
    if (lines.length === 0) return { labels: [], series: [], seriesNames: [] };

    // 检测是否有多系列（首行第一个为非数字，后面都是数字或名称）
    const firstLine = lines[0].split(/[,，\t]/).map(s => s.trim());
    const hasHeader = firstLine.length > 1 && isNaN(parseFloat(firstLine[1]));

    let labels = [];
    let series = [];
    let seriesNames = [];

    if (hasHeader && firstLine.length > 2) {
      // 多系列：首行为系列名称
      seriesNames = firstLine.slice(1);
      const numSeries = seriesNames.length;
      for (let i = 0; i < numSeries; i++) series.push([]);

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(/[,，\t]/).map(s => s.trim());
        if (parts.length < 2) continue;
        labels.push(parts[0]);
        for (let j = 0; j < numSeries; j++) {
          const val = parseFloat(parts[j + 1]);
          series[j].push(isNaN(val) ? 0 : val);
        }
      }
    } else {
      // 单系列
      seriesNames = ["数值"];
      series.push([]);
      for (const line of lines) {
        const parts = line.split(/[,，\t]/).map(s => s.trim());
        if (parts.length < 2) continue;
        labels.push(parts[0]);
        const val = parseFloat(parts[1]);
        series[0].push(isNaN(val) ? 0 : val);
      }
    }

    return { labels, series, seriesNames };
  }

  /* ---------------- 状态 ---------------- */
  const state = {
    chartType: "bar",
    title: "销售数据统计",
    width: 800,
    height: 500,
    bg: "white",
    showLegend: true,
    showLabels: true,
    showGrid: true,
    doughnutMode: false,
    showPercent: true,
  };

  /* ---------------- 背景色获取 ---------------- */
  function getBgColor() {
    switch (state.bg) {
      case "white": return "#ffffff";
      case "paper": return "#faf6f0";
      case "transparent": return null;
      default: return "#ffffff";
    }
  }

  function getTextColor() {
    return "#2b2520";
  }

  function getGridColor() {
    return "rgba(43, 37, 32, 0.1)";
  }

  function getAxisColor() {
    return "rgba(43, 37, 32, 0.3)";
  }

  /* ---------------- 柱状图 ---------------- */
  function drawBarChart(ctx, data, w, h) {
    const { labels, series, seriesNames } = data;
    if (labels.length === 0 || series.length === 0) return;

    const padding = { top: 70, right: 30, bottom: 80, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // 计算最大值和刻度
    let maxVal = 0;
    for (const s of series) {
      for (const v of s) if (v > maxVal) maxVal = v;
    }
    if (maxVal <= 0) maxVal = 1;
    // 美化最大值
    const niceMax = niceNumber(maxVal, true);
    const tickCount = 5;
    const tickStep = niceMax / tickCount;

    // 绘制网格和Y轴刻度
    if (state.showGrid) {
      ctx.strokeStyle = getGridColor();
      ctx.lineWidth = 1;
      ctx.fillStyle = getTextColor();
      ctx.font = "12px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      for (let i = 0; i <= tickCount; i++) {
        const y = padding.top + chartH - (i / tickCount) * chartH;
        const val = tickStep * i;
        // 网格线
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();
        // Y轴标签
        ctx.fillText(formatNumber(val), padding.left - 10, y);
      }
    }

    // X轴
    ctx.strokeStyle = getAxisColor();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH);
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.stroke();

    // Y轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.stroke();

    // 计算柱子位置
    const numBars = labels.length;
    const numSeries = series.length;
    const groupWidth = chartW / numBars;
    const barGap = 4;
    const barWidth = Math.min(40, (groupWidth - barGap * (numSeries + 1)) / numSeries);
    const groupInnerWidth = barWidth * numSeries + barGap * (numSeries - 1);

    // 绘制柱子
    for (let i = 0; i < numBars; i++) {
      const groupX = padding.left + groupWidth * i + groupWidth / 2;
      const startX = groupX - groupInnerWidth / 2;

      for (let s = 0; s < numSeries; s++) {
        const val = series[s][i];
        const barH = (val / niceMax) * chartH;
        const x = startX + s * (barWidth + barGap);
        const y = padding.top + chartH - barH;
        const color = getPaletteColor(s);

        // 柱子渐变
        const gradient = ctx.createLinearGradient(x, y, x, y + barH);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, hexToRgba(color, 0.7));

        ctx.fillStyle = gradient;
        roundRect(ctx, x, y, barWidth, barH, 4);
        ctx.fill();

        // 数据标签
        if (state.showLabels && barH > 20) {
          ctx.fillStyle = getTextColor();
          ctx.font = "11px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(formatNumber(val), x + barWidth / 2, y - 4);
        }
      }

      // X轴标签
      ctx.fillStyle = getTextColor();
      ctx.font = "12px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const labelX = groupX;
      const labelY = padding.top + chartH + 10;

      // 标签过多时旋转
      if (labels.length > 10) {
        ctx.save();
        ctx.translate(labelX, labelY);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(truncate(labels[i], 8), 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(truncate(labels[i], 10), labelX, labelY);
      }
    }

    // 图例
    if (state.showLegend && seriesNames.length > 1) {
      drawLegend(ctx, seriesNames, w, padding.top);
    }
  }

  /* ---------------- 折线图 ---------------- */
  function drawLineChart(ctx, data, w, h) {
    const { labels, series, seriesNames } = data;
    if (labels.length === 0 || series.length === 0) return;

    const padding = { top: 70, right: 30, bottom: 80, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // 计算最大值
    let maxVal = 0;
    for (const s of series) {
      for (const v of s) if (v > maxVal) maxVal = v;
    }
    if (maxVal <= 0) maxVal = 1;
    const niceMax = niceNumber(maxVal, true);
    const tickCount = 5;
    const tickStep = niceMax / tickCount;

    // 网格和Y轴刻度
    if (state.showGrid) {
      ctx.strokeStyle = getGridColor();
      ctx.lineWidth = 1;
      ctx.fillStyle = getTextColor();
      ctx.font = "12px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      for (let i = 0; i <= tickCount; i++) {
        const y = padding.top + chartH - (i / tickCount) * chartH;
        const val = tickStep * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();
        ctx.fillText(formatNumber(val), padding.left - 10, y);
      }
    }

    // X轴
    ctx.strokeStyle = getAxisColor();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartH);
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.stroke();

    // Y轴
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.stroke();

    // 计算点位置
    const numPoints = labels.length;
    const stepX = chartW / (numPoints - 1 || 1);

    // 绘制折线和区域
    for (let s = 0; s < series.length; s++) {
      const color = getPaletteColor(s);
      const points = [];

      for (let i = 0; i < numPoints; i++) {
        const x = padding.left + stepX * i;
        const y = padding.top + chartH - (series[s][i] / niceMax) * chartH;
        points.push({ x, y });
      }

      // 区域填充
      ctx.fillStyle = hexToRgba(color, 0.12);
      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartH);
      for (const p of points) ctx.lineTo(p.x, p.y);
      ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
      ctx.closePath();
      ctx.fill();

      // 折线
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        // 平滑曲线
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }
      ctx.stroke();

      // 数据点
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 数据标签
        if (state.showLabels) {
          ctx.fillStyle = getTextColor();
          ctx.font = "11px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(formatNumber(series[s][i]), p.x, p.y - 10);
        }
      }
    }

    // X轴标签
    ctx.fillStyle = getTextColor();
    ctx.font = "12px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let i = 0; i < numPoints; i++) {
      const x = padding.left + stepX * i;
      const y = padding.top + chartH + 10;

      if (labels.length > 12) {
        // 标签过多，只显示部分
        if (i % Math.ceil(labels.length / 8) !== 0 && i !== labels.length - 1) continue;
      }

      if (labels.length > 10) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(truncate(labels[i], 8), 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(truncate(labels[i], 10), x, y);
      }
    }

    // 图例
    if (state.showLegend && seriesNames.length > 1) {
      drawLegend(ctx, seriesNames, w, padding.top);
    }
  }

  /* ---------------- 饼图/环形图 ---------------- */
  function drawPieChart(ctx, data, w, h) {
    const { labels, series } = data;
    if (labels.length === 0 || series.length === 0) return;

    const values = series[0];
    const total = values.reduce((a, b) => a + b, 0);
    if (total <= 0) return;

    const padding = { top: 70, right: 30, bottom: 40, left: 30 };
    const chartAreaW = w - padding.left - padding.right;
    const chartAreaH = h - padding.top - padding.bottom;

    // 图例区域
    let legendW = 0;
    if (state.showLegend) {
      legendW = 180;
    }

    const pieAreaW = chartAreaW - legendW;
    const centerX = padding.left + pieAreaW / 2;
    const centerY = padding.top + chartAreaH / 2;
    const radius = Math.min(pieAreaW, chartAreaH) / 2 - 10;
    const innerRadius = state.doughnutMode ? radius * 0.55 : 0;

    // 绘制扇形
    let startAngle = -Math.PI / 2; // 从顶部开始

    for (let i = 0; i < labels.length; i++) {
      const sliceAngle = (values[i] / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const color = getPaletteColor(i);

      // 扇形
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fill();

      // 环形图内部挖空
      if (state.doughnutMode) {
        ctx.fillStyle = getBgColor() || "#fff";
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, innerRadius, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
      }

      // 百分比标签
      if (state.showPercent && sliceAngle > 0.15) {
        const midAngle = startAngle + sliceAngle / 2;
        const labelR = radius * 0.65;
        const labelX = centerX + Math.cos(midAngle) * labelR;
        const labelY = centerY + Math.sin(midAngle) * labelR;

        const pct = ((values[i] / total) * 100).toFixed(1) + "%";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pct, labelX, labelY);
      }

      startAngle = endAngle;
    }

    // 环形图中心文字
    if (state.doughnutMode) {
      ctx.fillStyle = getTextColor();
      ctx.font = "bold 18px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatNumber(total), centerX, centerY - 8);
      ctx.font = "12px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.fillStyle = "#6b5e52";
      ctx.fillText("总计", centerX, centerY + 14);
    }

    // 图例
    if (state.showLegend) {
      const legendX = padding.left + pieAreaW + 20;
      const legendY = padding.top + 20;
      drawPieLegend(ctx, labels, values, total, legendX, legendY);
    }
  }

  function drawPieLegend(ctx, labels, values, total, x, y) {
    ctx.font = "12px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const lineH = 24;
    for (let i = 0; i < labels.length; i++) {
      const ly = y + i * lineH;
      const color = getPaletteColor(i);

      // 颜色方块
      ctx.fillStyle = color;
      roundRect(ctx, x, ly - 6, 12, 12, 3);
      ctx.fill();

      // 标签
      ctx.fillStyle = getTextColor();
      const label = truncate(labels[i], 10);
      ctx.fillText(label, x + 20, ly);

      // 数值和百分比
      ctx.fillStyle = "#6b5e52";
      const pct = ((values[i] / total) * 100).toFixed(1) + "%";
      ctx.textAlign = "right";
      ctx.fillText(pct, x + 160, ly);
      ctx.textAlign = "left";
    }
  }

  /* ---------------- 雷达图 ---------------- */
  function drawRadarChart(ctx, data, w, h) {
    const { labels, series, seriesNames } = data;
    if (labels.length < 3 || series.length === 0) return;

    const padding = { top: 70, right: 30, bottom: 40, left: 30 };
    const chartAreaW = w - padding.left - padding.right;
    const chartAreaH = h - padding.top - padding.bottom;

    const centerX = padding.left + chartAreaW / 2;
    const centerY = padding.top + chartAreaH / 2;
    const radius = Math.min(chartAreaW, chartAreaH) / 2 - 40;

    const numAxes = labels.length;
    const angleStep = (Math.PI * 2) / numAxes;
    const startAngle = -Math.PI / 2;

    // 计算最大值
    let maxVal = 0;
    for (const s of series) {
      for (const v of s) if (v > maxVal) maxVal = v;
    }
    if (maxVal <= 0) maxVal = 1;
    const niceMax = niceNumber(maxVal, true);
    const levels = 5;

    // 绘制网格多边形
    if (state.showGrid) {
      ctx.strokeStyle = getGridColor();
      ctx.fillStyle = "rgba(43, 37, 32, 0.5)";
      ctx.lineWidth = 1;

      for (let level = 1; level <= levels; level++) {
        const r = (radius * level) / levels;
        ctx.beginPath();
        for (let i = 0; i < numAxes; i++) {
          const angle = startAngle + angleStep * i;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // 刻度值
        if (state.showLabels) {
          const val = (niceMax * level) / levels;
          ctx.font = "10px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#9a8e80";
          ctx.fillText(formatNumber(val), centerX + 4, centerY - r);
        }
      }

      // 轴线
      for (let i = 0; i < numAxes; i++) {
        const angle = startAngle + angleStep * i;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }

    // 绘制数据多边形
    for (let s = 0; s < series.length; s++) {
      const color = getPaletteColor(s);
      const points = [];

      for (let i = 0; i < numAxes; i++) {
        const angle = startAngle + angleStep * i;
        const val = series[s][i] || 0;
        const r = (val / niceMax) * radius;
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        points.push({ x, y });
      }

      // 填充
      ctx.fillStyle = hexToRgba(color, 0.25);
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.fill();

      // 描边
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].x, points[i].y);
        else ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.stroke();

      // 数据点
      for (const p of points) {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 轴标签
    ctx.fillStyle = getTextColor();
    ctx.font = "12px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";

    for (let i = 0; i < numAxes; i++) {
      const angle = startAngle + angleStep * i;
      const x = centerX + Math.cos(angle) * (radius + 20);
      const y = centerY + Math.sin(angle) * (radius + 20);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 根据位置调整对齐
      const cosA = Math.cos(angle);
      if (cosA > 0.3) ctx.textAlign = "left";
      else if (cosA < -0.3) ctx.textAlign = "right";

      ctx.fillText(truncate(labels[i], 8), x, y);
    }

    // 图例
    if (state.showLegend && seriesNames.length > 1) {
      drawLegend(ctx, seriesNames, w, padding.top);
    }
  }

  /* ---------------- 图例绘制 ---------------- */
  function drawLegend(ctx, seriesNames, w, topY) {
    const legendY = topY - 30;
    const itemGap = 16;
    const boxW = 14;
    const boxH = 10;

    ctx.font = "12px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textBaseline = "middle";

    // 计算总宽度
    let totalW = 0;
    const itemWidths = [];
    for (const name of seriesNames) {
      const textW = ctx.measureText(name).width;
      const itemW = boxW + 6 + textW;
      itemWidths.push(itemW);
      totalW += itemW;
    }
    totalW += itemGap * (seriesNames.length - 1);

    let x = (w - totalW) / 2;
    const y = legendY;

    for (let i = 0; i < seriesNames.length; i++) {
      const color = getPaletteColor(i);
      // 颜色方块
      ctx.fillStyle = color;
      roundRect(ctx, x, y - boxH / 2, boxW, boxH, 2);
      ctx.fill();
      // 文本
      ctx.fillStyle = getTextColor();
      ctx.textAlign = "left";
      ctx.fillText(seriesNames[i], x + boxW + 6, y);

      x += itemWidths[i] + itemGap;
    }
  }

  /* ---------------- 标题绘制 ---------------- */
  function drawTitle(ctx, title, w) {
    if (!title) return;
    ctx.fillStyle = getTextColor();
    ctx.font = "bold 18px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(title, w / 2, 24);
  }

  /* ---------------- 辅助函数 ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    if (h < 0) { y += h; h = -h; }
    r = Math.min(r, w / 2, h / 2);
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

  function niceNumber(value, round) {
    const exponent = Math.floor(Math.log10(value));
    const fraction = value / Math.pow(10, exponent);
    let niceFraction;
    if (round) {
      if (fraction < 1.5) niceFraction = 1;
      else if (fraction < 3) niceFraction = 2;
      else if (fraction < 7) niceFraction = 5;
      else niceFraction = 10;
    } else {
      if (fraction <= 1) niceFraction = 1;
      else if (fraction <= 2) niceFraction = 2;
      else if (fraction <= 5) niceFraction = 5;
      else niceFraction = 10;
    }
    return niceFraction * Math.pow(10, exponent);
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    if (num % 1 === 0) return num.toString();
    return num.toFixed(1);
  }

  function truncate(str, maxLen) {
    if (!str) return "";
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "…";
  }

  /* ---------------- 主渲染函数 ---------------- */
  function renderChart() {
    const canvas = $("#chartCanvas");
    if (!canvas) return;

    const w = state.width;
    const h = state.height;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    // 背景
    const bgColor = getBgColor();
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    }

    // 解析数据
    const dataText = $("#chartData").value;
    const data = parseData(dataText);

    // 更新统计
    $("#dataCount").textContent = data.labels.length;
    $("#seriesCount").textContent = data.series.length;

    // 标题
    drawTitle(ctx, state.title, w);

    // 无数据提示
    if (data.labels.length === 0 || data.series.length === 0) {
      ctx.fillStyle = "#9a8e80";
      ctx.font = "14px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("请输入数据（格式：标签,数值）", w / 2, h / 2);
      return;
    }

    // 根据类型绘制
    switch (state.chartType) {
      case "bar":
        drawBarChart(ctx, data, w, h);
        break;
      case "line":
        drawLineChart(ctx, data, w, h);
        break;
      case "pie":
        drawPieChart(ctx, data, w, h);
        break;
      case "radar":
        drawRadarChart(ctx, data, w, h);
        break;
    }
  }

  const debouncedRender = debounce(renderChart, 150);

  /* ---------------- SVG 导出 ---------------- */
  function canvasToSVG(canvas, data) {
    const w = canvas.width;
    const h = canvas.height;
    const bgColor = getBgColor();

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;

    if (bgColor) {
      svg += `<rect width="${w}" height="${h}" fill="${bgColor}"/>`;
    }

    // 标题
    if (state.title) {
      svg += `<text x="${w / 2}" y="40" text-anchor="middle" font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="18" font-weight="bold" fill="${getTextColor()}">${escapeXml(state.title)}</text>`;
    }

    // 根据类型生成 SVG 内容（简化版）
    if (data.labels.length > 0 && data.series.length > 0) {
      switch (state.chartType) {
        case "bar":
          svg += barChartToSVG(data, w, h);
          break;
        case "line":
          svg += lineChartToSVG(data, w, h);
          break;
        case "pie":
          svg += pieChartToSVG(data, w, h);
          break;
        case "radar":
          svg += radarChartToSVG(data, w, h);
          break;
      }
    }

    svg += "</svg>";
    return svg;
  }

  function escapeXml(str) {
    return String(str).replace(/[<>&"']/g, c => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;"
    }[c]));
  }

  function barChartToSVG(data, w, h) {
    const { labels, series, seriesNames } = data;
    const padding = { top: 70, right: 30, bottom: 80, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    let maxVal = 0;
    for (const s of series) for (const v of s) if (v > maxVal) maxVal = v;
    if (maxVal <= 0) maxVal = 1;
    const niceMax = niceNumber(maxVal, true);
    const tickCount = 5;
    const tickStep = niceMax / tickCount;

    let svg = "";
    const gridColor = "rgba(43,37,32,0.1)";
    const textColor = getTextColor();
    const axisColor = "rgba(43,37,32,0.3)";

    // 网格
    if (state.showGrid) {
      for (let i = 0; i <= tickCount; i++) {
        const y = padding.top + chartH - (i / tickCount) * chartH;
        const val = tickStep * i;
        svg += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartW}" y2="${y}" stroke="${gridColor}" stroke-width="1"/>`;
        svg += `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="${textColor}" font-family="sans-serif">${formatNumber(val)}</text>`;
      }
    }

    // 轴线
    svg += `<line x1="${padding.left}" y1="${padding.top + chartH}" x2="${padding.left + chartW}" y2="${padding.top + chartH}" stroke="${axisColor}" stroke-width="1.5"/>`;
    svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="${axisColor}" stroke-width="1.5"/>`;

    // 柱子
    const numBars = labels.length;
    const numSeries = series.length;
    const groupWidth = chartW / numBars;
    const barGap = 4;
    const barWidth = Math.min(40, (groupWidth - barGap * (numSeries + 1)) / numSeries);
    const groupInnerWidth = barWidth * numSeries + barGap * (numSeries - 1);

    for (let i = 0; i < numBars; i++) {
      const groupX = padding.left + groupWidth * i + groupWidth / 2;
      const startX = groupX - groupInnerWidth / 2;

      for (let s = 0; s < numSeries; s++) {
        const val = series[s][i];
        const barH = (val / niceMax) * chartH;
        const x = startX + s * (barWidth + barGap);
        const y = padding.top + chartH - barH;
        const color = getPaletteColor(s);
        svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="4" fill="${color}" opacity="0.9"/>`;

        if (state.showLabels && barH > 20) {
          svg += `<text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle" font-size="11" fill="${textColor}" font-family="sans-serif">${formatNumber(val)}</text>`;
        }
      }

      // X标签
      svg += `<text x="${groupX}" y="${padding.top + chartH + 24}" text-anchor="middle" font-size="12" fill="${textColor}" font-family="sans-serif">${escapeXml(truncate(labels[i], 10))}</text>`;
    }

    // 图例
    if (state.showLegend && seriesNames.length > 1) {
      svg += legendToSVG(seriesNames, w, padding.top);
    }

    return svg;
  }

  function lineChartToSVG(data, w, h) {
    const { labels, series, seriesNames } = data;
    const padding = { top: 70, right: 30, bottom: 80, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    let maxVal = 0;
    for (const s of series) for (const v of s) if (v > maxVal) maxVal = v;
    if (maxVal <= 0) maxVal = 1;
    const niceMax = niceNumber(maxVal, true);
    const tickCount = 5;
    const tickStep = niceMax / tickCount;

    let svg = "";
    const gridColor = "rgba(43,37,32,0.1)";
    const textColor = getTextColor();
    const axisColor = "rgba(43,37,32,0.3)";

    if (state.showGrid) {
      for (let i = 0; i <= tickCount; i++) {
        const y = padding.top + chartH - (i / tickCount) * chartH;
        svg += `<line x1="${padding.left}" y1="${y}" x2="${padding.left + chartW}" y2="${y}" stroke="${gridColor}" stroke-width="1"/>`;
        svg += `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="${textColor}" font-family="sans-serif">${formatNumber(tickStep * i)}</text>`;
      }
    }

    svg += `<line x1="${padding.left}" y1="${padding.top + chartH}" x2="${padding.left + chartW}" y2="${padding.top + chartH}" stroke="${axisColor}" stroke-width="1.5"/>`;
    svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="${axisColor}" stroke-width="1.5"/>`;

    const numPoints = labels.length;
    const stepX = chartW / (numPoints - 1 || 1);

    for (let s = 0; s < series.length; s++) {
      const color = getPaletteColor(s);
      const points = [];
      for (let i = 0; i < numPoints; i++) {
        points.push({
          x: padding.left + stepX * i,
          y: padding.top + chartH - (series[s][i] / niceMax) * chartH
        });
      }

      // 区域
      let areaPath = `M ${points[0].x} ${padding.top + chartH}`;
      for (const p of points) areaPath += ` L ${p.x} ${p.y}`;
      areaPath += ` L ${points[points.length - 1].x} ${padding.top + chartH} Z`;
      svg += `<path d="${areaPath}" fill="${color}" opacity="0.12"/>`;

      // 折线
      let linePath = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        linePath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
      }
      svg += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

      // 数据点
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#fff" stroke="${color}" stroke-width="2.5"/>`;
        if (state.showLabels) {
          svg += `<text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="11" fill="${textColor}" font-family="sans-serif">${formatNumber(series[s][i])}</text>`;
        }
      }
    }

    // X标签
    for (let i = 0; i < numPoints; i++) {
      const x = padding.left + stepX * i;
      svg += `<text x="${x}" y="${padding.top + chartH + 24}" text-anchor="middle" font-size="12" fill="${textColor}" font-family="sans-serif">${escapeXml(truncate(labels[i], 10))}</text>`;
    }

    if (state.showLegend && seriesNames.length > 1) {
      svg += legendToSVG(seriesNames, w, padding.top);
    }

    return svg;
  }

  function pieChartToSVG(data, w, h) {
    const { labels, series } = data;
    const values = series[0];
    const total = values.reduce((a, b) => a + b, 0);
    if (total <= 0) return "";

    const padding = { top: 70, right: 30, bottom: 40, left: 30 };
    const chartAreaW = w - padding.left - padding.right;
    const chartAreaH = h - padding.top - padding.bottom;
    const legendW = state.showLegend ? 180 : 0;
    const pieAreaW = chartAreaW - legendW;

    const cx = padding.left + pieAreaW / 2;
    const cy = padding.top + chartAreaH / 2;
    const r = Math.min(pieAreaW, chartAreaH) / 2 - 10;
    const innerR = state.doughnutMode ? r * 0.55 : 0;

    let svg = "";
    let startAngle = -Math.PI / 2;

    for (let i = 0; i < labels.length; i++) {
      const sliceAngle = (values[i] / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const color = getPaletteColor(i);

      const x1 = cx + Math.cos(startAngle) * r;
      const y1 = cy + Math.sin(startAngle) * r;
      const x2 = cx + Math.cos(endAngle) * r;
      const y2 = cy + Math.sin(endAngle) * r;
      const largeArc = sliceAngle > Math.PI ? 1 : 0;

      if (state.doughnutMode) {
        const ix1 = cx + Math.cos(startAngle) * innerR;
        const iy1 = cy + Math.sin(startAngle) * innerR;
        const ix2 = cx + Math.cos(endAngle) * innerR;
        const iy2 = cy + Math.sin(endAngle) * innerR;
        const path = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
        svg += `<path d="${path}" fill="${color}"/>`;
      } else {
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
        svg += `<path d="${path}" fill="${color}"/>`;
      }

      // 百分比标签
      if (state.showPercent && sliceAngle > 0.15) {
        const midAngle = startAngle + sliceAngle / 2;
        const labelR = r * 0.65;
        const lx = cx + Math.cos(midAngle) * labelR;
        const ly = cy + Math.sin(midAngle) * labelR;
        const pct = ((values[i] / total) * 100).toFixed(1) + "%";
        svg += `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff" font-family="sans-serif">${pct}</text>`;
      }

      startAngle = endAngle;
    }

    // 环形中心
    if (state.doughnutMode) {
      svg += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="18" font-weight="bold" fill="${getTextColor()}" font-family="sans-serif">${formatNumber(total)}</text>`;
      svg += `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="12" fill="#6b5e52" font-family="sans-serif">总计</text>`;
    }

    // 图例
    if (state.showLegend) {
      const legendX = padding.left + pieAreaW + 20;
      const legendY = padding.top + 20;
      for (let i = 0; i < labels.length; i++) {
        const ly = legendY + i * 24;
        const color = getPaletteColor(i);
        const pct = ((values[i] / total) * 100).toFixed(1) + "%";
        svg += `<rect x="${legendX}" y="${ly - 6}" width="12" height="12" rx="3" fill="${color}"/>`;
        svg += `<text x="${legendX + 20}" y="${ly + 4}" font-size="12" fill="${getTextColor()}" font-family="sans-serif">${escapeXml(truncate(labels[i], 10))}</text>`;
        svg += `<text x="${legendX + 160}" y="${ly + 4}" text-anchor="end" font-size="12" fill="#6b5e52" font-family="sans-serif">${pct}</text>`;
      }
    }

    return svg;
  }

  function radarChartToSVG(data, w, h) {
    const { labels, series, seriesNames } = data;
    if (labels.length < 3) return "";

    const padding = { top: 70, right: 30, bottom: 40, left: 30 };
    const chartAreaW = w - padding.left - padding.right;
    const chartAreaH = h - padding.top - padding.bottom;
    const cx = padding.left + chartAreaW / 2;
    const cy = padding.top + chartAreaH / 2;
    const r = Math.min(chartAreaW, chartAreaH) / 2 - 40;

    const numAxes = labels.length;
    const angleStep = (Math.PI * 2) / numAxes;
    const startAngle = -Math.PI / 2;

    let maxVal = 0;
    for (const s of series) for (const v of s) if (v > maxVal) maxVal = v;
    if (maxVal <= 0) maxVal = 1;
    const niceMax = niceNumber(maxVal, true);
    const levels = 5;
    const textColor = getTextColor();
    const gridColor = "rgba(43,37,32,0.1)";

    let svg = "";

    // 网格
    if (state.showGrid) {
      for (let level = 1; level <= levels; level++) {
        const lr = (r * level) / levels;
        let points = [];
        for (let i = 0; i < numAxes; i++) {
          const angle = startAngle + angleStep * i;
          points.push(`${cx + Math.cos(angle) * lr},${cy + Math.sin(angle) * lr}`);
        }
        svg += `<polygon points="${points.join(" ")}" fill="none" stroke="${gridColor}" stroke-width="1"/>`;
      }

      // 轴线
      for (let i = 0; i < numAxes; i++) {
        const angle = startAngle + angleStep * i;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${gridColor}" stroke-width="1"/>`;
      }
    }

    // 数据多边形
    for (let s = 0; s < series.length; s++) {
      const color = getPaletteColor(s);
      const points = [];
      for (let i = 0; i < numAxes; i++) {
        const angle = startAngle + angleStep * i;
        const val = series[s][i] || 0;
        const pr = (val / niceMax) * r;
        points.push(`${cx + Math.cos(angle) * pr},${cy + Math.sin(angle) * pr}`);
      }
      svg += `<polygon points="${points.join(" ")}" fill="${color}" opacity="0.25" stroke="${color}" stroke-width="2"/>`;

      // 数据点
      for (let i = 0; i < numAxes; i++) {
        const angle = startAngle + angleStep * i;
        const val = series[s][i] || 0;
        const pr = (val / niceMax) * r;
        const px = cx + Math.cos(angle) * pr;
        const py = cy + Math.sin(angle) * pr;
        svg += `<circle cx="${px}" cy="${py}" r="4" fill="#fff" stroke="${color}" stroke-width="2"/>`;
      }
    }

    // 轴标签
    for (let i = 0; i < numAxes; i++) {
      const angle = startAngle + angleStep * i;
      const x = cx + Math.cos(angle) * (r + 20);
      const y = cy + Math.sin(angle) * (r + 20);
      let anchor = "middle";
      const cosA = Math.cos(angle);
      if (cosA > 0.3) anchor = "start";
      else if (cosA < -0.3) anchor = "end";
      svg += `<text x="${x}" y="${y + 4}" text-anchor="${anchor}" font-size="12" fill="${textColor}" font-family="sans-serif">${escapeXml(truncate(labels[i], 8))}</text>`;
    }

    if (state.showLegend && seriesNames.length > 1) {
      svg += legendToSVG(seriesNames, w, padding.top);
    }

    return svg;
  }

  function legendToSVG(seriesNames, w, topY) {
    const legendY = topY - 30;
    const itemGap = 16;
    const boxW = 14;
    const boxH = 10;

    // 估算每项宽度
    let totalW = 0;
    const items = [];
    for (let i = 0; i < seriesNames.length; i++) {
      const textW = seriesNames[i].length * 12 + 10;
      const itemW = boxW + 6 + textW;
      items.push(itemW);
      totalW += itemW;
    }
    totalW += itemGap * (seriesNames.length - 1);

    let x = (w - totalW) / 2;
    let svg = "";

    for (let i = 0; i < seriesNames.length; i++) {
      const color = getPaletteColor(i);
      svg += `<rect x="${x}" y="${legendY - boxH / 2}" width="${boxW}" height="${boxH}" rx="2" fill="${color}"/>`;
      svg += `<text x="${x + boxW + 6}" y="${legendY + 4}" font-size="12" fill="${getTextColor()}" font-family="sans-serif">${escapeXml(seriesNames[i])}</text>`;
      x += items[i] + itemGap;
    }

    return svg;
  }

  /* ---------------- 事件绑定 ---------------- */
  function setupEvents() {
    // 图表类型切换
    $$("#chartTypeTabs .chart-type-tab").forEach((btn) => {
      btn.onclick = () => {
        $$("#chartTypeTabs .chart-type-tab").forEach((b) => b.classList.toggle("active", b === btn));
        state.chartType = btn.dataset.type;
        // 饼图选项显示
        $("#pieOptions").style.display = state.chartType === "pie" ? "block" : "none";
        renderChart();
      };
    });

    // 数据输入
    $("#chartData").addEventListener("input", debouncedRender);

    // 标题
    $("#chartTitle").addEventListener("input", (e) => {
      state.title = e.target.value;
      debouncedRender();
    });

    // 尺寸
    $("#chartWidth").addEventListener("input", (e) => {
      state.width = parseInt(e.target.value) || 800;
      debouncedRender();
    });
    $("#chartHeight").addEventListener("input", (e) => {
      state.height = parseInt(e.target.value) || 500;
      debouncedRender();
    });

    // 尺寸预设
    $$('[data-size]').forEach((btn) => {
      btn.onclick = () => {
        const [w, h] = btn.dataset.size.split("x").map(Number);
        state.width = w;
        state.height = h;
        $("#chartWidth").value = w;
        $("#chartHeight").value = h;
        renderChart();
      };
    });

    // 背景
    $$("#bgOptions .bg-btn").forEach((btn) => {
      btn.onclick = () => {
        $$("#bgOptions .bg-btn").forEach((b) => b.classList.toggle("active", b === btn));
        state.bg = btn.dataset.bg;
        renderChart();
      };
    });

    // 显示选项
    $("#showLegend").addEventListener("change", (e) => {
      state.showLegend = e.target.checked;
      renderChart();
    });
    $("#showLabels").addEventListener("change", (e) => {
      state.showLabels = e.target.checked;
      renderChart();
    });
    $("#showGrid").addEventListener("change", (e) => {
      state.showGrid = e.target.checked;
      renderChart();
    });

    // 饼图选项
    $("#doughnutMode").addEventListener("change", (e) => {
      state.doughnutMode = e.target.checked;
      renderChart();
    });
    $("#showPercent").addEventListener("change", (e) => {
      state.showPercent = e.target.checked;
      renderChart();
    });

    // 示例数据
    $("#loadExample1").onclick = () => {
      $("#chartData").value = "一月,120\n二月,200\n三月,150\n四月,300\n五月,250\n六月,380";
      renderChart();
    };
    $("#loadExample2").onclick = () => {
      $("#chartData").value = "月份,销售额,利润\n一月,120,30\n二月,200,50\n三月,150,40\n四月,300,80\n五月,250,60\n六月,380,100";
      renderChart();
    };
    $("#loadExample3").onclick = () => {
      $("#chartData").value = "产品A,35\n产品B,25\n产品C,20\n产品D,12\n产品E,8";
      renderChart();
    };

    // 下载 PNG
    $("#downloadPng").onclick = () => {
      const canvas = $("#chartCanvas");
      const link = document.createElement("a");
      link.download = "chart.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    // 下载 SVG
    $("#downloadSvg").onclick = () => {
      const canvas = $("#chartCanvas");
      const data = parseData($("#chartData").value);
      const svg = canvasToSVG(canvas, data);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = "chart.svg";
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    };

    // 复制图片
    $("#copyImage").onclick = () => {
      const canvas = $("#chartCanvas");
      const btn = $("#copyImage");
      canvas.toBlob((blob) => {
        if (!blob) {
          alert("复制失败");
          return;
        }
        try {
          navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
          ]).then(() => {
            const t = btn.textContent;
            btn.textContent = "已复制";
            setTimeout(() => (btn.textContent = t), 1500);
          }).catch(() => {
            alert("复制失败，请使用下载功能");
          });
        } catch (e) {
          alert("当前浏览器不支持复制图片，请使用下载功能");
        }
      }, "image/png");
    };
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    buildPaletteButtons();
    setupEvents();

    // 默认数据
    $("#chartData").value = "一月,120\n二月,200\n三月,150\n四月,300\n五月,250\n六月,380";

    // 初始隐藏饼图选项
    $("#pieOptions").style.display = "none";

    renderChart();
  }

  init();
})();
