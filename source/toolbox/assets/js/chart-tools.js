/* 图表工坊 · 交互层 v3
 * 三栏工作台：数据（表格/文本） · 画布 · 设计面板
 * 导出：PNG / SVG / 可编辑 HTML / 工程 JSON / CSV / 分享链接
 */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var core = window.ZHZChartCore ? window.ZHZChartCore() : null;
  function debounce(fn, d) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, d); }; }

  /* ---------------- 状态 ---------------- */
  var state = {
    type: "bar", palette: 0,
    title: "月度销售概览", subtitle: "单位：万元",
    titleSize: 20, titleAlign: "center",
    width: 960, height: 560, bg: "white", bgColor: "#ffffff",
    showLegend: true, legendPos: "top", legendFont: 12, tickFont: 12,
    showLabels: true, labelPos: "auto", decimals: "auto", unitPre: "", unitSuf: "",
    gridH: true, gridV: false, gridDash: false,
    showXLabels: true, showYTicks: true, axisShow: true, xRotate: "auto", yTickCount: 5,
    xTitle: "", yTitle: "", y2Title: "", yMin: "", yMax: "", y2Min: "", y2Max: "", dualAxis: false,
    lineWidth: 2.5, smooth: false, symbol: true, areaFill: false, symbolSize: 5,
    barRadius: 3, barRatio: 0.68, gradient: false,
    pieInner: 0.58, pieLabelMode: "percent", pieName: false, pieCenter: true,
    gaugeMax: "", radarLevels: 5,
    seriesCfg: []
  };

  var DATA_TEXT = "月份,销售额,利润\n1月,320,86\n2月,350,95\n3月,410,120\n4月,390,88\n5月,460,150\n6月,520,180";
  var lastModel = null, lastData = null;

  /* ---------------- 图表类型 ---------------- */
  var TYPES = [
    { id: "bar", name: "柱状图" }, { id: "hbar", name: "条形图" }, { id: "stacked", name: "堆叠柱" },
    { id: "line", name: "折线图" }, { id: "area", name: "面积图" }, { id: "combo", name: "组合图" },
    { id: "scatter", name: "散点图" }, { id: "bubble", name: "气泡图" }, { id: "pie", name: "饼图" },
    { id: "donut", name: "环形图" }, { id: "rose", name: "玫瑰图" }, { id: "radar", name: "雷达图" },
    { id: "funnel", name: "漏斗图" }, { id: "gauge", name: "仪表盘" }, { id: "heatmap", name: "热力图" },
    { id: "waterfall", name: "瀑布图" }
  ];
  var CART = ["bar", "hbar", "stacked", "line", "area", "combo", "scatter", "bubble", "waterfall"];
  var PIE = ["pie", "donut", "rose"];

  var ICONS = {
    bar: '<rect x="3" y="8" width="3" height="8"/><rect x="8.5" y="4" width="3" height="12"/><rect x="14" y="10" width="3" height="6"/>',
    hbar: '<rect x="3" y="4" width="12" height="3"/><rect x="3" y="9" width="9" height="3"/><rect x="3" y="14" width="14" height="3"/>',
    stacked: '<rect x="4" y="4" width="4" height="5"/><rect x="4" y="9" width="4" height="7"/><rect x="12" y="4" width="4" height="8"/><rect x="12" y="12" width="4" height="4"/>',
    line: '<polyline points="3,14 7,9 11,11 17,4"/>',
    area: '<path d="M3 15 L7 9 L11 11 L17 4 L17 16 L3 16 Z" opacity=".28"/><polyline points="3,15 7,9 11,11 17,4"/>',
    combo: '<rect x="3" y="9" width="3" height="7"/><rect x="8" y="11" width="3" height="5"/><rect x="13" y="6" width="3" height="10"/><polyline points="3,7 8,4 13,8 17,3"/>',
    scatter: '<circle cx="5" cy="12" r="1.6"/><circle cx="9" cy="7" r="1.6"/><circle cx="13" cy="11" r="1.6"/><circle cx="16" cy="5" r="1.6"/>',
    bubble: '<circle cx="6" cy="12" r="3"/><circle cx="13" cy="8" r="2"/><circle cx="16" cy="14" r="1.4"/>',
    pie: '<path d="M10 3 A7 7 0 1 0 17 10 L10 10 Z"/>',
    donut: '<path d="M12 3 A7 7 0 1 1 5.2 14.4 L8 9.6 A3.4 3.4 0 1 0 12 6.6 Z"/>',
    rose: '<path d="M10 2 L13 9 L10 18 L7 9 Z"/><path d="M2 10 L9 7 L18 10 L9 13 Z" opacity=".5"/>',
    radar: '<polygon points="10,2 17,7 14,16 6,16 3,7"/><polygon points="10,6 13.5,8.5 12,13 8,13 6.5,8.5" opacity=".4"/>',
    funnel: '<path d="M3 4 H17 L13.5 9 H6.5 Z"/><path d="M7 11 H13 L11.5 16 H8.5 Z" opacity=".6"/>',
    gauge: '<path d="M3 14 A7 7 0 0 1 17 14"/><line x1="10" y1="14" x2="14" y2="8"/>',
    heatmap: '<rect x="3" y="3" width="4" height="4"/><rect x="8" y="3" width="4" height="4" opacity=".55"/><rect x="13" y="3" width="4" height="4" opacity=".25"/><rect x="3" y="8" width="4" height="4" opacity=".55"/><rect x="8" y="8" width="4" height="4" opacity=".8"/><rect x="13" y="8" width="4" height="4" opacity=".4"/><rect x="3" y="13" width="4" height="4" opacity=".25"/><rect x="8" y="13" width="4" height="4" opacity=".4"/><rect x="13" y="13" width="4" height="4" opacity=".7"/>',
    waterfall: '<rect x="3" y="10" width="3" height="6"/><rect x="7.5" y="6" width="3" height="4"/><rect x="12" y="8" width="3" height="3"/><rect x="16" y="4" width="2.5" height="4"/>'
  };
  function svgIcon(id) {
    return '<svg viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + (ICONS[id] || "") + "</svg>";
  }

  /* ---------------- 示例 ---------------- */
  var PRESETS = [
    { name: "月度销售", type: "bar", data: "月份,销售额,利润\n1月,320,86\n2月,350,95\n3月,410,120\n4月,390,88\n5月,460,150\n6月,520,180", patch: { title: "月度销售概览", subtitle: "单位：万元", unitSuf: "万", palette: 0 } },
    { name: "地区排行", type: "hbar", data: "地区,销量\n华东,1280\n华南,960\n华北,820\n西南,640\n东北,420\n西北,310", patch: { title: "各大区销量排行", subtitle: "单位：件", unitSuf: "", palette: 1 } },
    { name: "部门堆叠", type: "stacked", data: "季度,研发,市场,运营\nQ1,120,80,60\nQ2,150,90,70\nQ3,180,110,85\nQ4,210,130,95", patch: { title: "各部门季度投入", subtitle: "单位：万元", palette: 2 } },
    { name: "用户增长", type: "line", data: "月份,新增用户,活跃用户\n1月,1200,8600\n2月,1450,9200\n3月,1320,9800\n4月,1680,10500\n5月,1920,11600\n6月,2150,12800", patch: { title: "用户增长趋势", subtitle: "单位：人", palette: 1, smooth: true } },
    { name: "流量面积", type: "area", data: "日期,PV,UV\n周一,3200,1200\n周二,3800,1450\n周三,3500,1380\n周四,4200,1620\n周五,4800,1850\n周六,5600,2300\n周日,5200,2150", patch: { title: "一周流量走势", subtitle: "单位：次 / 人", palette: 5, smooth: true } },
    { name: "双轴组合", type: "combo", data: "月份,销售额(万元),增长率(%)\n1月,320,0\n2月,350,9.4\n3月,410,17.1\n4月,390,-4.9\n5月,460,17.9\n6月,520,13.0", patch: { title: "销售额与增长率", subtitle: "柱：销售额（左轴） · 线：增长率（右轴）", palette: 0, dualAxis: true, yTitle: "销售额", y2Title: "增长率", seriesCfg: [{ type: "bar", axis: "L" }, { type: "line", axis: "R" }] } },
    { name: "身高体重", type: "scatter", data: "样本,身高,体重\nA,158,48\nB,163,52\nC,168,56\nD,172,62\nE,175,68\nF,178,72\nG,181,78\nH,185,84", patch: { title: "身高与体重分布", subtitle: "横轴：身高 cm · 纵轴：体重 kg", palette: 3, xTitle: "身高", yTitle: "体重", showLabels: false, legendPos: "top" } },
    { name: "多系列散点", type: "scatter", data: "月份,推广投入,新客数,复购数\n1月,2.0,120,36\n2月,2.8,155,44\n3月,3.5,190,58\n4月,3.1,172,66\n5月,4.2,225,81\n6月,5.0,268,95", patch: { title: "推广投入与新客关系", subtitle: "首列＝横轴，多列为多系列；系列面板可切 点/线/曲", palette: 1, xTitle: "推广投入(万元)", yTitle: "人数", showLabels: false, legendPos: "top", seriesCfg: [{}, { kind: "point" }, { kind: "curve" }] } },
    { name: "城市气泡", type: "bubble", data: "城市,GDP(千亿),人口(百万),房价(万/㎡)\n北京,4.2,21.8,8.6\n上海,4.5,24.8,7.9\n深圳,3.4,17.6,7.2\n广州,3.0,18.8,4.1\n杭州,1.9,12.4,3.8\n成都,2.1,21.2,2.1\n武汉,1.9,13.7,1.9", patch: { title: "城市经济体量对比", subtitle: "气泡大小＝房价", palette: 4, xTitle: "GDP", yTitle: "人口", showLabels: false } },
    { name: "支出构成", type: "pie", data: "类别,金额\n住房,4200\n餐饮,1800\n交通,900\n购物,1200\n娱乐,700\n其他,600", patch: { title: "月度支出构成", subtitle: "单位：元", unitPre: "¥", palette: 0, legendPos: "right", pieLabelMode: "both" } },
    { name: "设备占比", type: "donut", data: "设备,占比\niOS,42\nAndroid,46\n桌面端,9\n其他,3", patch: { title: "访问设备占比", subtitle: "单位：%", unitSuf: "%", palette: 1, legendPos: "right", pieInner: 0.62 } },
    { name: "渠道玫瑰", type: "rose", data: "渠道,线索\n自然搜索,320\n信息流,280\n朋友圈,210\n短视频,180\n联盟,120\n线下,80", patch: { title: "获客渠道分布", subtitle: "面积＝线索量", palette: 7, legendPos: "right", pieLabelMode: "value" } },
    { name: "能力雷达", type: "radar", data: "维度,产品A,产品B\n功能,86,72\n易用,78,88\n性能,92,70\n价格,65,90\n服务,80,75\n稳定,88,78", patch: { title: "产品能力对比", subtitle: "满分 100", palette: 2, legendPos: "bottom" } },
    { name: "转化漏斗", type: "funnel", data: "阶段,人数\n访问,12000\n注册,4800\n试用,2100\n付费,860\n续费,420", patch: { title: "注册转化漏斗", subtitle: "整体转化 3.5%", palette: 0, showLegend: false } },
    { name: "完成率", type: "gauge", data: "年度目标完成率,78", patch: { title: "年度目标完成情况", subtitle: "目标 100%", palette: 2, gaugeMax: 100, unitSuf: "%", showLegend: false, showLabels: false } },
    { name: "时段热力", type: "heatmap", data: "时段,周一,周二,周三,周四,周五,周六,周日\n上午,32,35,30,34,38,52,48\n下午,45,48,42,46,52,66,60\n傍晚,58,60,55,59,64,78,74\n夜间,26,24,22,25,36,58,54", patch: { title: "一周活跃度热力", subtitle: "颜色越深越活跃", palette: 5, showLegend: false } },
    { name: "现金瀑布", type: "waterfall", data: "项目,金额\n期初,1200\n销售收入,860\n成本支出,-420\n税费,-120\n研发投入,-260\n其他收入,90", patch: { title: "现金流瀑布", subtitle: "单位：万元", palette: 2, showLabels: true } }
  ];

  /* ---------------- 数据网格 ---------------- */
  function numClean(s) { return String(s == null ? "" : s).replace(/[¥$€￥,\s]/g, "").replace(/%$/, ""); }
  function gridFromText(text) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").filter(function (l) { return l.trim() !== ""; });
    if (!lines.length) return { header: ["标签", "数值"], rows: [] };
    var rows = lines.map(function (l) { return l.split(/\t|,|，|;/).map(function (c) { return c.trim(); }); });
    var width = 2;
    rows.forEach(function (r) { if (r.length > width) width = r.length; });
    rows.forEach(function (r) { while (r.length < width) r.push(""); });
    var hasHeader = rows[0].slice(1).every(function (c) { return c === "" || isNaN(Number(numClean(c))); });
    var header, body;
    if (hasHeader) { header = rows[0].slice(); body = rows.slice(1); }
    else {
      header = ["标签"];
      for (var i = 1; i < width; i++) header.push(i === 1 ? "数值" : "系列" + i);
      body = rows;
    }
    header[0] = header[0] || "标签";
    return { header: header, rows: body };
  }
  function gridToText(g) {
    var out = [g.header.join(",")];
    g.rows.forEach(function (r) { out.push(r.join(",")); });
    return out.join("\n");
  }

  var grid = gridFromText(DATA_TEXT);

  function renderTable() {
    var t = $("#dataTable");
    var html = "<thead><tr>";
    grid.header.forEach(function (h, i) {
      html += '<th><input class="hcell" data-col="' + i + '" value="' + esc(h) + '" title="' + (i === 0 ? "分类名称" : "系列名称") + '"></th>';
    });
    html += '<th class="th-narrow">#</th></tr></thead><tbody>';
    if (!grid.rows.length) html += '<tr><td colspan="' + (grid.header.length + 1) + '" class="empty-cell">暂无数据，点下方「＋行」开始</td></tr>';
    grid.rows.forEach(function (row, ri) {
      html += "<tr>";
      row.forEach(function (c, ci) {
        html += '<td class="' + (ci === 0 ? "lab" : "num") + '"><input class="dcell" data-row="' + ri + '" data-col="' + ci + '" value="' + esc(c) + '"></td>';
      });
      html += '<td class="th-narrow"><button class="rowdel" data-row="' + ri + '" title="删除此行">×</button></td></tr>';
    });
    html += "</tbody>";
    t.innerHTML = html;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

  function syncFromGrid() {
    DATA_TEXT = gridToText(grid);
    var ta = $("#dataText");
    if (ta && document.activeElement !== ta) ta.value = DATA_TEXT;
    draw();
  }

  function ensureSeriesCfg(n) {
    for (var i = 0; i < n; i++) if (!state.seriesCfg[i]) state.seriesCfg[i] = { type: "bar", axis: "L" };
    if (state.seriesCfg.length > n) state.seriesCfg.length = n;
  }

  /* ---------------- 渲染 ---------------- */
  function draw() {
    var data = core.parseCSV(DATA_TEXT);
    ensureSeriesCfg(data.series.length);
    var model = core.buildModel(state, data);
    lastModel = model; lastData = data;
    var cv = $("#cv");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(model.W * dpr);
    cv.height = Math.round(model.H * dpr);
    cv.style.width = model.W + "px";
    cv.style.maxWidth = "100%";
    cv.style.height = "auto";
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    core.paint(ctx, model, state);
    $("#statPts").textContent = data.labels.length;
    $("#statSeries").textContent = data.series.length;
    var tn = "";
    for (var ti = 0; ti < TYPES.length; ti++) if (TYPES[ti].id === state.type) tn = TYPES[ti].name;
    $("#statType").textContent = tn || state.type;
    $("#stageSize").textContent = model.W + " × " + model.H;
    renderSeriesBox(data);
  }

  function renderSeriesBox(data) {
    var box = $("#seriesBox");
    if (!box) return;
    var sig = data.names.join("|") + "#" + data.series.length + "#" + state.type + "#" + state.dualAxis;
    if (box.dataset.sig === sig) { return; }
    box.dataset.sig = sig;
    var html = "";
    data.names.forEach(function (nm, i) {
      var c = state.seriesCfg[i] || {};
      var color = c.color || palOf(i);
      html += '<div class="srow">' +
        '<input type="color" class="cpick" data-si="' + i + '" value="' + color + '" title="系列颜色">' +
        '<input type="text" class="sname" data-si="' + i + '" value="' + esc(nm) + '" maxlength="14" title="系列名称">' +
        (state.type === "combo" ? '<select class="stype" data-si="' + i + '"><option value="bar"' + (c.type !== "line" && c.type !== "area" ? " selected" : "") + '>柱</option><option value="line"' + (c.type === "line" ? " selected" : "") + '>线</option><option value="area"' + (c.type === "area" ? " selected" : "") + '>面</option></select>' : "") +
        ((state.type === "line" || (state.type === "scatter" && i > 0)) ? (function () {
          var k = c.kind || (state.type === "scatter" ? "point" : "line");
          return '<select class="skind" data-si="' + i + '" title="系列形态：点 / 折线 / 曲线"><option value="point"' + (k === "point" ? " selected" : "") + '>点</option><option value="line"' + (k === "line" ? " selected" : "") + '>线</option><option value="curve"' + (k === "curve" ? " selected" : "") + '>曲</option></select>';
        })() : "") +
        (state.dualAxis ? '<select class="saxis" data-si="' + i + '"><option value="L"' + (c.axis !== "R" ? " selected" : "") + '>左</option><option value="R"' + (c.axis === "R" ? " selected" : "") + '>右</option></select>' : "") +
        "</div>";
    });
    box.innerHTML = html || '<p class="hint">暂无系列</p>';
  }
  function palOf(i) {
    var p = core.PALETTES[state.palette] || core.PALETTES[0];
    return i < p.colors.length ? p.colors[i] : "#2563eb";
  }

  /* ---------------- 界面构建 ---------------- */
  function buildTypeBar() {
    $("#typeBar").innerHTML = TYPES.map(function (t) {
      return '<button class="tp" data-type="' + t.id + '">' + svgIcon(t.id) + "<span>" + t.name + "</span></button>";
    }).join("");
  }
  function buildPalettes() {
    $("#palGrid").innerHTML = core.PALETTES.map(function (p, i) {
      return '<button class="pal" data-pal="' + i + '" title="' + p.name + '"><i style="background:' + p.colors[0] + '"></i><i style="background:' + p.colors[1] + '"></i><i style="background:' + p.colors[2] + '"></i><i style="background:' + p.colors[3] + '"></i><span>' + p.name + "</span></button>";
    }).join("");
  }
  function buildPresets() {
    $("#presetChips").innerHTML = PRESETS.map(function (p, i) {
      return '<button class="chip" data-preset="' + i + '">' + svgIcon(p.type) + "<span>" + p.name + "</span></button>";
    }).join("");
  }
  function syncUI() {
    $$("#typeBar .tp").forEach(function (b) { b.classList.toggle("on", b.dataset.type === state.type); });
    /* 示例库与类型条双向联动：同类型的示例亮起 */
    $$("#presetChips .chip").forEach(function (b) {
      var p = PRESETS[+b.dataset.preset];
      b.classList.toggle("on", !!p && p.type === state.type);
    });
    $$("#bgBtns [data-bg]").forEach(function (b) { b.classList.toggle("on", b.dataset.bg === state.bg); });
    $$("#palGrid .pal").forEach(function (b, i) { b.classList.toggle("on", i === state.palette); });
    var map = {
      "#ttl": state.title, "#sub": state.subtitle, "#xTitle": state.xTitle, "#yTitle": state.yTitle,
      "#y2Title": state.y2Title, "#yMin": state.yMin, "#yMax": state.yMax, "#y2Min": state.y2Min,
      "#y2Max": state.y2Max, "#unitPre": state.unitPre, "#unitSuf": state.unitSuf,
      "#w": state.width, "#h": state.height, "#gaugeMax": state.gaugeMax
    };
    Object.keys(map).forEach(function (k) { var el = $(k); if (el && document.activeElement !== el) el.value = map[k]; });
    $("#ttlSize").value = String(state.titleSize);
    $("#ttlAlign").value = state.titleAlign;
    $("#legendPos").value = state.legendPos;
    $("#decimals").value = String(state.decimals);
    $("#labelPos").value = state.labelPos;
    $("#xRotate").value = String(state.xRotate);
    $("#tickCount").value = String(state.yTickCount);
    $("#pieLabelMode").value = state.pieLabelMode;
    var chk = { "#showLegend": "showLegend", "#showLabels": "showLabels", "#gridH": "gridH", "#gridV": "gridV", "#gridDash": "gridDash", "#showXLabels": "showXLabels", "#showYTicks": "showYTicks", "#axisShow": "axisShow", "#dualAxis": "dualAxis", "#smooth": "smooth", "#symbol": "symbol", "#areaFill": "areaFill", "#gradient": "gradient", "#pieName": "pieName", "#pieCenter": "pieCenter" };
    Object.keys(chk).forEach(function (k) { var el = $(k); if (el) el.checked = !!state[chk[k]]; });
    $("#lineWidth").value = state.lineWidth; $("#lineWidthOut").textContent = state.lineWidth;
    $("#symbolSize").value = state.symbolSize; $("#symbolSizeOut").textContent = state.symbolSize;
    $("#barRadius").value = state.barRadius; $("#barRadiusOut").textContent = state.barRadius;
    $("#barRatio").value = state.barRatio; $("#barRatioOut").textContent = Math.round(state.barRatio * 100) + "%";
    $("#pieInner").value = state.pieInner; $("#pieInnerOut").textContent = Math.round(state.pieInner * 100) + "%";
  }
  function syncVisibility() {
    var isCart = CART.indexOf(state.type) >= 0;
    var isPie = PIE.indexOf(state.type) >= 0;
    $("#axisSec").hidden = !isCart;
    $("#gridSec").hidden = !isCart;
    $("#lineSec").hidden = !(isCart || state.type === "radar");
    $("#pieSec").hidden = !isPie;
    $("#gaugeSec").hidden = state.type !== "gauge";
    $("#y2Row").hidden = !(state.dualAxis && isCart);
    $("#comboHint").hidden = state.type !== "combo";
    $("#pieInnerRow").hidden = state.type === "rose" ? false : (state.type !== "donut" && state.type !== "pie");
    $("#labelPosRow").hidden = !isCart;
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindAll() {
    $("#typeBar").addEventListener("click", function (e) {
      var b = e.target.closest(".tp"); if (!b) return;
      state.type = b.dataset.type;
      syncUI(); syncVisibility(); draw();
      $("#seriesBox").dataset.sig = "";
      renderSeriesBox(lastData || { names: [], series: [] });
    });

    /* 数据标签页 */
    $("#dataTabs").addEventListener("click", function (e) {
      var b = e.target.closest(".tm"); if (!b) return;
      $$("#dataTabs .tm").forEach(function (x) { x.classList.toggle("on", x === b); });
      var tab = b.dataset.tab;
      $("#paneTable").hidden = tab !== "table";
      $("#paneText").hidden = tab !== "text";
    });

    /* 表格编辑 */
    var table = $("#dataTable");
    table.addEventListener("input", debounce(function (e) {
      var t = e.target;
      if (t.classList.contains("dcell")) {
        var r = +t.dataset.row, c = +t.dataset.col;
        grid.rows[r][c] = t.value; syncFromGrid();
      } else if (t.classList.contains("hcell")) {
        grid.header[+t.dataset.col] = t.value; syncFromGrid();
      }
    }, 320));
    table.addEventListener("click", function (e) {
      var b = e.target.closest(".rowdel"); if (!b) return;
      grid.rows.splice(+b.dataset.row, 1);
      renderTable(); syncFromGrid();
    });
    table.addEventListener("paste", function (e) {
      var txt = (e.clipboardData || window.clipboardData).getData("text");
      if (!txt || (txt.indexOf("\t") < 0 && txt.indexOf("\n") < 0)) return;
      e.preventDefault();
      grid = gridFromText(txt.replace(/\t/g, ","));
      renderTable(); syncFromGrid(); toast("已粘贴 " + grid.rows.length + " 行数据");
    });

    $("#addRow").addEventListener("click", function () {
      var row = grid.header.map(function (_, i) {
        if (i === 0) return "新项" + (grid.rows.length + 1);
        var prev = grid.rows.length ? Number(numClean(grid.rows[grid.rows.length - 1][i])) : NaN;
        return String(isFinite(prev) ? Math.round(prev * 0.9) : 100);
      });
      grid.rows.push(row); renderTable(); syncFromGrid();
    });
    $("#addCol").addEventListener("click", function () {
      if (grid.header.length >= 13) { toast("最多 12 个系列"); return; }
      grid.header.push("系列" + grid.header.length);
      grid.rows.forEach(function (r) { r.push(String(60 + Math.round(Math.random() * 120))); });
      renderTable(); syncFromGrid();
    });
    $("#delRow").addEventListener("click", function () {
      if (!grid.rows.length) return;
      grid.rows.pop(); renderTable(); syncFromGrid();
    });
    $("#delCol").addEventListener("click", function () {
      if (grid.header.length <= 2) { toast("至少保留一列数据"); return; }
      grid.header.pop(); grid.rows.forEach(function (r) { r.pop(); });
      renderTable(); syncFromGrid();
    });
    $("#clearData").addEventListener("click", function () {
      grid.rows = []; renderTable(); syncFromGrid(); toast("已清空数据");
    });

    /* 文本模式 */
    $("#dataText").addEventListener("input", debounce(function () {
      DATA_TEXT = $("#dataText").value;
      grid = gridFromText(DATA_TEXT);
      renderTable(); draw();
    }, 420));

    /* 文本 ↔ 表格切换时同步 */
    $$("#dataTabs .tm").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.tab === "text") $("#dataText").value = DATA_TEXT;
      });
    });

    /* 示例 */
    $("#presetChips").addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      applyPreset(PRESETS[+b.dataset.preset]);
    });

    /* 标题与画布 */
    bindText("#ttl", "title"); bindText("#sub", "subtitle");
    bindText("#xTitle", "xTitle"); bindText("#yTitle", "yTitle"); bindText("#y2Title", "y2Title");
    bindText("#unitPre", "unitPre"); bindText("#unitSuf", "unitSuf");
    bindText("#yMin", "yMin"); bindText("#yMax", "yMax"); bindText("#y2Min", "y2Min"); bindText("#y2Max", "y2Max");
    bindText("#gaugeMax", "gaugeMax");
    $("#ttlSize").addEventListener("change", function () { state.titleSize = +this.value || 20; draw(); });
    $("#ttlAlign").addEventListener("change", function () { state.titleAlign = this.value; draw(); });
    ["#w", "#h"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        var v = Math.max(240, Math.min(2400, +this.value || 960));
        if (id === "#w") state.width = v; else state.height = Math.max(200, Math.min(2000, v));
        this.value = id === "#w" ? state.width : state.height;
        draw();
      });
    });
    $("#sizeBtns").addEventListener("click", function (e) {
      var b = e.target.closest("[data-size]"); if (!b) return;
      var wh = b.dataset.size.split("x");
      state.width = +wh[0]; state.height = +wh[1];
      syncUI(); draw();
    });
    $("#bgBtns").addEventListener("click", function (e) {
      var b = e.target.closest("[data-bg]"); if (!b) return;
      state.bg = b.dataset.bg; syncUI(); draw();
    });
    $("#bgColor").addEventListener("input", function () {
      state.bg = "custom"; state.bgColor = this.value; syncUI(); draw();
    });

    /* 配色 */
    $("#palGrid").addEventListener("click", function (e) {
      var b = e.target.closest(".pal"); if (!b) return;
      state.palette = +b.dataset.pal;
      state.seriesCfg.forEach(function (c) { c.color = ""; });
      $("#seriesBox").dataset.sig = "";
      syncUI(); draw();
    });

    /* 系列 */
    var sb = $("#seriesBox");
    sb.addEventListener("input", function (e) {
      var t = e.target;
      if (t.classList.contains("cpick")) {
        var c = state.seriesCfg[+t.dataset.si] || (state.seriesCfg[+t.dataset.si] = { type: "bar", axis: "L" });
        c.color = t.value; draw();
      }
    });
    sb.addEventListener("change", function (e) {
      var t = e.target, si = +t.dataset.si;
      if (t.classList.contains("sname")) {
        grid.header[si + 1] = t.value || "系列" + (si + 1);
        renderTable(); syncFromGrid();
        $("#seriesBox").dataset.sig = "";
      } else if (t.classList.contains("stype")) {
        (state.seriesCfg[si] || (state.seriesCfg[si] = {})).type = t.value; draw();
      } else if (t.classList.contains("saxis")) {
        (state.seriesCfg[si] || (state.seriesCfg[si] = {})).axis = t.value; draw();
      } else if (t.classList.contains("skind")) {
        (state.seriesCfg[si] || (state.seriesCfg[si] = {})).kind = t.value; draw();
      }
    });

    /* 轴 / 网格 / 刻度 */
    bindChk("#dualAxis", "dualAxis", true);
    bindChk("#showXLabels", "showXLabels");
    bindChk("#showYTicks", "showYTicks");
    bindChk("#axisShow", "axisShow");
    bindChk("#gridH", "gridH");
    bindChk("#gridV", "gridV");
    bindChk("#gridDash", "gridDash");
    $("#xRotate").addEventListener("change", function () { state.xRotate = this.value; draw(); });
    $("#tickCount").addEventListener("change", function () { state.yTickCount = +this.value || 5; draw(); });

    /* 标签 */
    bindChk("#showLabels", "showLabels");
    $("#labelPos").addEventListener("change", function () { state.labelPos = this.value; draw(); });
    $("#decimals").addEventListener("change", function () { state.decimals = this.value === "auto" ? "auto" : +this.value; draw(); });

    /* 线条 / 柱 */
    $("#lineWidth").addEventListener("input", function () { state.lineWidth = +this.value; $("#lineWidthOut").textContent = this.value; draw(); });
    $("#symbolSize").addEventListener("input", function () { state.symbolSize = +this.value; $("#symbolSizeOut").textContent = this.value; draw(); });
    $("#barRadius").addEventListener("input", function () { state.barRadius = +this.value; $("#barRadiusOut").textContent = this.value; draw(); });
    $("#barRatio").addEventListener("input", function () { state.barRatio = +this.value; $("#barRatioOut").textContent = Math.round(this.value * 100) + "%"; draw(); });
    bindChk("#smooth", "smooth");
    bindChk("#symbol", "symbol");
    bindChk("#areaFill", "areaFill");
    bindChk("#gradient", "gradient");

    /* 图例 */
    bindChk("#showLegend", "showLegend");
    $("#legendPos").addEventListener("change", function () { state.legendPos = this.value; draw(); });

    /* 饼 / 仪表 */
    $("#pieInner").addEventListener("input", function () { state.pieInner = +this.value; $("#pieInnerOut").textContent = Math.round(this.value * 100) + "%"; draw(); });
    $("#pieLabelMode").addEventListener("change", function () { state.pieLabelMode = this.value; draw(); });
    bindChk("#pieName", "pieName");
    bindChk("#pieCenter", "pieCenter");

    /* 导出 */
    $("#exportMenu").addEventListener("click", function (e) {
      var b = e.target.closest("[data-exp]"); if (!b) return;
      var kind = b.dataset.exp;
      if (kind === "png1") exportPNG(1);
      else if (kind === "png2") exportPNG(2);
      else if (kind === "png3") exportPNG(3);
      else if (kind === "svg") exportSVG();
      else if (kind === "html") exportHTML();
      else if (kind === "json") exportJSON();
      else if (kind === "csv") exportCSV();
      else if (kind === "copy") copyImage();
      else if (kind === "link") copyLink();
      $("#exportMenu").removeAttribute("open");
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest("#exportMenu")) $("#exportMenu").removeAttribute("open");
    });

    /* 导入 */
    $("#importBtn").addEventListener("click", function () { $("#importFile").click(); });
    $("#importFile").addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (f) importFile(f);
      this.value = "";
    });
    /* 全屏显示 */
    $("#fsBtn").addEventListener("click", function () {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if ($("#stage").requestFullscreen) $("#stage").requestFullscreen();
        else toast("当前浏览器不支持全屏 API");
      } catch (err) { toast("全屏请求失败"); }
    });
    document.addEventListener("fullscreenchange", function () {
      var on = !!document.fullscreenElement;
      $("#fsBtn").classList.toggle("on", on);
      $("#fsBtn").title = on ? "退出全屏" : "全屏显示图表区";
    });

    /* ---------------- 图 ↔ 表 ↔ 属性 交互联动 ---------------- */
    (function () {
      var cv = $("#cv"), tip = $("#tip"), stage = $("#stage"), table = $("#dataTable");
      if (!cv || !stage) return;
      var curLi = null;

      function modelXY(e) {
        var r = cv.getBoundingClientRect();
        return [(e.clientX - r.left) * (lastModel.W / r.width), (e.clientY - r.top) * (lastModel.H / r.height)];
      }
      function pathHit(p, x, y) {
        var xs = [], ys = [];
        p.cmds.forEach(function (c) {
          if (c.c === "Z") return;
          xs.push(c.p[0], c.p[2] != null ? c.p[2] : c.p[0], c.p[4] != null ? c.p[4] : c.p[0]);
          ys.push(c.p[1], c.p[3] != null ? c.p[3] : c.p[1], c.p[5] != null ? c.p[5] : c.p[1]);
        });
        return x >= Math.min.apply(null, xs) - 4 && x <= Math.max.apply(null, xs) + 4 &&
               y >= Math.min.apply(null, ys) - 4 && y <= Math.max.apply(null, ys) + 4;
      }
      function hitTest(x, y) {
        if (!lastModel) return null;
        for (var i = lastModel.P.length - 1; i >= 0; i--) {
          var p = lastModel.P[i]; if (!p.m) continue;
          if (p.k === "rect" && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
          if (p.k === "circle") {
            var dx = x - p.cx, dy = y - p.cy;
            if (dx * dx + dy * dy <= (p.r + 4) * (p.r + 4)) return p;
          }
          if (p.k === "slice") {
            var vx = x - p.cx, vy = y - p.cy, d = Math.sqrt(vx * vx + vy * vy);
            if (d >= p.ir - 3 && d <= p.r + 3) {
              var a = Math.atan2(vy, vx);
              while (a < p.a0) a += Math.PI * 2;
              if (a <= p.a1 + 0.02 || p.a1 - p.a0 > Math.PI * 1.98) return p;
            }
          }
          if (p.k === "path" && p.m.li != null && pathHit(p, x, y)) return p;
        }
        return null;
      }
      function rowEl(li) { return table && table.tBodies[0] ? table.tBodies[0].rows[li] : null; }
      function clearRowHl() {
        if (curLi != null) { var tr = rowEl(curLi); if (tr) tr.classList.remove("hl"); curLi = null; }
      }
      function primCenter(p) {
        if (p.k === "rect") return [p.x + p.w / 2, p.y + p.h / 2];
        if (p.k === "circle") return [p.cx, p.cy];
        if (p.k === "slice") { var m = (p.a0 + p.a1) / 2, r = (p.r + p.ir) / 2; return [p.cx + Math.cos(m) * r, p.cy + Math.sin(m) * r]; }
        if (p.k === "path") {
          var xs = [], ys = [];
          p.cmds.forEach(function (c) { if (c.c !== "Z") { xs.push(c.p[0]); ys.push(c.p[1]); } });
          return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
        }
        return [0, 0];
      }
      function tipText(p) {
        var parts = [];
        if (p.m.li != null && lastData && lastData.labels[p.m.li] != null) parts.push(lastData.labels[p.m.li]);
        var sn = p.m.si != null && lastData && lastData.names[p.m.si] != null ? lastData.names[p.m.si] : "";
        if (sn) parts.push(sn);
        if (p.m.v != null) parts.push(numFmt(p.m.v));
        return parts.join(" · ");
      }
      function numFmt(v) {
        var n = +v;
        if (!isFinite(n)) return String(v);
        var d = state.decimals;
        if (d === 0 || d === 1 || d === 2 || d === 3) return (state.unitPre || "") + n.toFixed(d) + (state.unitSuf || "");
        return (state.unitPre || "") + (Math.abs(n) >= 1000 ? n.toLocaleString("zh-CN") : String(Math.round(n * 100) / 100)) + (state.unitSuf || "");
      }
      function showTip(mx, my, text) {
        if (!tip) return;
        tip.textContent = text;
        tip.style.left = Math.min(Math.max(8, cv.offsetLeft + mx + 14), stage.clientWidth - tip.offsetWidth - 10) + "px";
        tip.style.top = Math.max(8, cv.offsetTop + my - 34) + "px";
        tip.classList.add("on");
      }
      function hideTip() { if (tip) tip.classList.remove("on"); }

      /* 画布悬停 → 提示 + 表格行高亮 */
      cv.addEventListener("mousemove", function (e) {
        if (!lastModel) return;
        var xy = modelXY(e);
        var p = hitTest(xy[0], xy[1]);
        clearRowHl();
        if (p) {
          cv.style.cursor = "pointer";
          showTip(xy[0], xy[1], tipText(p));
          if (p.m.li != null) {
            var tr = rowEl(p.m.li);
            if (tr) { tr.classList.add("hl"); curLi = p.m.li; }
          }
        } else {
          cv.style.cursor = "";
          hideTip();
        }
      });
      cv.addEventListener("mouseleave", function () { clearRowHl(); hideTip(); cv.style.cursor = ""; });

      /* 表格行悬停 → 图中对应元素高亮，其余淡化 */
      if (table) {
        table.addEventListener("mouseover", function (e) {
          var tr = e.target.closest("tbody tr"); if (!tr || !lastModel) return;
          var li = Array.prototype.indexOf.call(table.tBodies[0].rows, tr);
          if (li < 0 || li === state._hl) return;
          state._hl = li; draw();
          var prim = null;
          for (var i = 0; i < lastModel.P.length; i++) if (lastModel.P[i].m && lastModel.P[i].m.li === li) { prim = lastModel.P[i]; break; }
          if (prim) { var c = primCenter(prim); showTip(c[0], c[1], tipText(prim)); }
        });
        table.addEventListener("mouseleave", function () {
          if (state._hl == null) return;
          state._hl = null; draw(); hideTip();
        });
      }
    })();

    bindDropZone();
  }

  /* 文件导入（按钮选择 / 拖拽共用） */
  function importFile(f) {
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var txt = String(reader.result || "");
      if (/\.json$/i.test(f.name)) {
        try {
          var obj = JSON.parse(txt);
          if (obj && obj.state) applyProject(obj);
          else toast("这个 JSON 里没有图表工程数据");
        } catch (err) { toast("JSON 解析失败，请检查文件"); }
      } else {
        DATA_TEXT = txt; grid = gridFromText(txt);
        $("#dataText").value = txt;
        $("#seriesBox").dataset.sig = "";
        renderTable(); draw();
        toast("已导入 " + f.name + "（" + grid.rows.length + " 行）");
      }
    };
    reader.readAsText(f);
  }

  /* ---------------- 拖拽导入 ----------------
     .csv/.tsv/.txt 当作数据，.json 当作工程文件 */
  function bindDropZone() {
    var host = $("#stage");
    if (!host) return;
    var depth = 0;
    function hasFiles(e) {
      var dt = e.dataTransfer;
      if (!dt || !dt.types) return false;
      for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === "Files") return true;
      return false;
    }
    host.addEventListener("dragenter", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth++;
      host.classList.add("dragging");
    });
    host.addEventListener("dragover", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    host.addEventListener("dragleave", function (e) {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) host.classList.remove("dragging");
    });
    host.addEventListener("drop", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0;
      host.classList.remove("dragging");
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (!/\.(csv|tsv|txt|json)$/i.test(f.name)) { toast("请拖入 .csv / .tsv / .txt / .json 文件"); return; }
      importFile(f);
    });
    /* 整页兜底：防止文件被浏览器直接打开 */
    ["dragover", "drop"].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        if (hasFiles(e) && !e.target.closest("#stage")) e.preventDefault();
      });
    });
  }

  function bindText(sel, key) {
    var el = $(sel); if (!el) return;
    el.addEventListener("input", debounce(function () { state[key] = el.value; draw(); }, 260));
  }
  function bindChk(sel, key, needVis) {
    var el = $(sel); if (!el) return;
    el.addEventListener("change", function () {
      state[key] = el.checked;
      if (needVis) syncVisibility();
      draw();
    });
  }

  /* ---------------- 示例应用 ---------------- */
  function applyPreset(p) {
    if (!p) return;
    state._hl = null;
    var base = {
      dualAxis: false, unitPre: "", unitSuf: "", xTitle: "", yTitle: "", y2Title: "",
      yMin: "", yMax: "", y2Min: "", y2Max: "", smooth: false, areaFill: false,
      showLegend: true, legendPos: "top", showLabels: true, labelPos: "auto",
      pieLabelMode: "percent", pieName: false, gaugeMax: "", bg: "white",
      titleAlign: "center", gradient: false, width: 960, height: 560
    };
    Object.keys(base).forEach(function (k) { state[k] = base[k]; });
    state.type = p.type;
    if (p.patch) Object.keys(p.patch).forEach(function (k) { state[k] = p.patch[k]; });
    state.seriesCfg = p.patch && p.patch.seriesCfg ? p.patch.seriesCfg.map(function (c) { return { type: c.type, axis: c.axis, color: c.color || "", kind: c.kind }; }) : [];
    DATA_TEXT = p.data;
    grid = gridFromText(DATA_TEXT);
    $("#dataText").value = DATA_TEXT;
    $("#seriesBox").dataset.sig = "";
    renderTable(); syncUI(); syncVisibility(); draw();
    toast("已载入示例：" + p.name);
  }

  function applyProject(obj) {
    if (!obj || !obj.state) return;
    state._hl = null;
    Object.keys(state).forEach(function (k) { if (obj.state[k] !== undefined && k !== "seriesCfg") state[k] = obj.state[k]; });
    state.seriesCfg = (obj.state.seriesCfg || []).map(function (c) { return { type: c.type || "bar", axis: c.axis || "L", color: c.color || "", kind: c.kind }; });
    if (typeof obj.data === "string") {
      DATA_TEXT = obj.data; grid = gridFromText(DATA_TEXT);
      $("#dataText").value = DATA_TEXT; renderTable();
    }
    $("#seriesBox").dataset.sig = "";
    syncUI(); syncVisibility(); draw();
    toast("已载入工程文件");
  }

  /* ---------------- 导出 ---------------- */
  function fileBase() {
    var n = (state.title || "chart").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 28);
    return "chart-" + n + "-" + state.type;
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function exportPNG(scale) {
    var model = core.buildModel(state, core.parseCSV(DATA_TEXT));
    var c = document.createElement("canvas");
    c.width = Math.round(model.W * scale);
    c.height = Math.round(model.H * scale);
    var ctx = c.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    core.paint(ctx, model, state);
    c.toBlob(function (b) { download(b, fileBase() + "@" + scale + "x.png"); toast("PNG 已导出（" + c.width + "×" + c.height + "）"); }, "image/png");
  }
  function exportSVG() {
    var model = core.buildModel(state, core.parseCSV(DATA_TEXT));
    download(new Blob([core.svg(model, state)], { type: "image/svg+xml;charset=utf-8" }), fileBase() + ".svg");
    toast("SVG 已导出（矢量，可在 AI / Figma / PPT 里编辑）");
  }
  function exportJSON() {
    var payload = JSON.stringify({ app: "zhz-chart-studio", v: 3, state: state, data: DATA_TEXT }, null, 2);
    download(new Blob([payload], { type: "application/json;charset=utf-8" }), fileBase() + ".json");
    toast("工程文件已保存，下次拖回来继续改");
  }
  function exportCSV() {
    download(new Blob(["\ufeff" + DATA_TEXT.replace(/,/g, ",")], { type: "text/csv;charset=utf-8" }), fileBase() + ".csv");
    toast("CSV 已导出（Excel 可直接打开）");
  }
  async function copyImage() {
    try {
      var model = core.buildModel(state, core.parseCSV(DATA_TEXT));
      var c = document.createElement("canvas");
      c.width = model.W * 2; c.height = model.H * 2;
      var ctx = c.getContext("2d"); ctx.setTransform(2, 0, 0, 2, 0, 0);
      core.paint(ctx, model, state);
      var blob = await new Promise(function (r) { c.toBlob(r, "image/png"); });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("图片已复制，可直接粘贴");
    } catch (e) { toast("复制失败，请改用下载 PNG"); }
  }
  function copyLink() {
    var payload = JSON.stringify({ state: state, data: DATA_TEXT });
    var code = btoa(encodeURIComponent(payload));
    var url = location.origin + location.pathname + "#s=" + code;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("分享链接已复制（长度 " + url.length + " 字符）"); }, function () { toast("复制失败，可先保存工程文件"); });
    else toast("当前浏览器不支持自动复制");
  }
  function toast(msg) {
    var el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove("on"); }, 2200);
  }

  /* ---------------- 可编辑 HTML 导出 ---------------- */
  var SA_CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#faf6f0;color:#2b2520;padding:0 0 40px}",
    ".hd{display:flex;align-items:baseline;gap:12px;padding:14px 20px;background:#fffdf8;border-bottom:1px solid #e8dfd1;flex-wrap:wrap}",
    ".hd b{font-size:15px}.hd span{font-size:12px;color:#9a8e80}",
    ".stage{display:flex;justify-content:center;padding:24px 20px}",
    "canvas{max-width:100%;height:auto;background:#fff;box-shadow:0 6px 24px rgba(60,40,10,.12);border-radius:10px}",
    ".panel{max-width:1000px;margin:0 auto;background:#fffdf8;border:1px solid #e8dfd1;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}",
    ".row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}",
    "label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:600;color:#9a8e80}",
    "label.grow{flex:1;min-width:160px}",
    ".ck{flex-direction:row;align-items:center;gap:6px;font-size:12.5px;color:#6b5e52;font-weight:500}",
    "input[type=text],input[type=number],select,textarea{font:inherit;font-size:13px;padding:7px 10px;border:1px solid #e8dfd1;border-radius:8px;background:#fff;color:#2b2520;outline:none}",
    "input:focus,select:focus,textarea:focus{border-color:#ff4d00}",
    "select{min-width:96px}",
    "textarea{min-height:150px;resize:vertical;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.7}",
    ".btn{padding:8px 16px;border:1px solid #e8dfd1;background:#fff;border-radius:8px;font-size:13px;cursor:pointer;color:#2b2520}",
    ".btn:hover{border-color:#ff4d00;color:#ff4d00}",
    ".btn.primary{background:#ff4d00;border-color:#ff4d00;color:#fff}",
    ".tiny{font-size:11.5px;color:#b3a795;margin-left:auto}",
    "small{font-weight:400;color:#b3a795}"
  ].join("\n");

  function escHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* 这段函数体会被 toString 后写进导出文件，必须完全自包含 */
  function standaloneApp() {
    var payload = JSON.parse(document.getElementById("payload").textContent);
    var state = payload.state || {};
    var dataText = payload.data || "";
    var core = makeCore();
    var cv = document.getElementById("cv");
    var TYPES = [
      { id: "bar", name: "柱状图" }, { id: "hbar", name: "条形图" }, { id: "stacked", name: "堆叠柱" },
      { id: "line", name: "折线图" }, { id: "area", name: "面积图" }, { id: "combo", name: "组合图" },
      { id: "scatter", name: "散点图" }, { id: "bubble", name: "气泡图" }, { id: "pie", name: "饼图" },
      { id: "donut", name: "环形图" }, { id: "rose", name: "玫瑰图" }, { id: "radar", name: "雷达图" },
      { id: "funnel", name: "漏斗图" }, { id: "gauge", name: "仪表盘" }, { id: "heatmap", name: "热力图" },
      { id: "waterfall", name: "瀑布图" }
    ];
    var ts = document.getElementById("t");
    ts.innerHTML = TYPES.map(function (o) { return '<option value="' + o.id + '">' + o.name + "</option>"; }).join("");
    ts.value = state.type || "bar";
    var ps = document.getElementById("p");
    ps.innerHTML = core.PALETTES.map(function (p, i) { return '<option value="' + i + '">' + p.name + "</option>"; }).join("");
    ps.value = String(state.palette || 0);
    document.getElementById("ti").value = state.title || "";
    document.getElementById("st").value = state.subtitle || "";
    document.getElementById("w").value = state.width || 960;
    document.getElementById("h").value = state.height || 560;
    document.getElementById("lg").checked = state.showLegend !== false;
    document.getElementById("dt").value = dataText;

    function draw() {
      var data = core.parseCSV(dataText);
      var model = core.buildModel(state, data);
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(model.W * dpr);
      cv.height = Math.round(model.H * dpr);
      cv.style.width = "100%";
      cv.style.maxWidth = model.W + "px";
      cv.style.height = "auto";
      var ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      core.paint(ctx, model, state);
    }
    function bind(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
    bind("t", "change", function () { state.type = this.value; draw(); });
    bind("p", "change", function () { state.palette = +this.value; state.seriesCfg = []; draw(); });
    bind("ti", "input", function () { state.title = this.value; draw(); });
    bind("st", "input", function () { state.subtitle = this.value; draw(); });
    bind("w", "change", function () { state.width = Math.max(240, +this.value || 960); draw(); });
    bind("h", "change", function () { state.height = Math.max(200, +this.value || 560); draw(); });
    bind("lg", "change", function () { state.showLegend = this.checked; draw(); });
    bind("dt", "input", function () { dataText = this.value; draw(); });
    bind("dp", "click", function () {
      var m = core.buildModel(state, core.parseCSV(dataText));
      var c = document.createElement("canvas");
      c.width = m.W * 2; c.height = m.H * 2;
      var ctx = c.getContext("2d");
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      core.paint(ctx, m, state);
      c.toBlob(function (b) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = "chart.png"; a.click();
      });
    });
    bind("ds", "click", function () {
      var m = core.buildModel(state, core.parseCSV(dataText));
      var blob = new Blob([core.svg(m, state)], { type: "image/svg+xml;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "chart.svg"; a.click();
    });
    draw();
  }

  function exportHTML() {
    var payload = JSON.stringify({ state: state, data: DATA_TEXT }).replace(/</g, "\\u003c");
    var coreSrc = window.ZHZChartCore.toString();
    var appSrc = "(" + standaloneApp.toString() + ")();";
    var parts = [
      "<!doctype html>",
      '<html lang="zh-CN"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      "<title>" + escHtml(state.title || "图表") + "</title>",
      "<style>" + SA_CSS + "</style>",
      "</head><body>",
      '<header class="hd"><b>可编辑图表</b><span>改数据 / 换类型 / 调配色，图表实时重绘；可再次导出 PNG、SVG。断网也能用。</span></header>',
      '<div class="stage"><canvas id="cv"></canvas></div>',
      '<div class="panel">',
      '<div class="row">',
      "<label>图表类型<select id=\"t\"></select></label>",
      "<label>配色<select id=\"p\"></select></label>",
      '<label>宽<input id="w" type="number" min="240" max="2400" step="10"></label>',
      '<label>高<input id="h" type="number" min="200" max="2000" step="10"></label>',
      '<label class="ck"><input type="checkbox" id="lg">图例</label>',
      "</div>",
      '<div class="row"><label class="grow">标题<input id="ti" type="text"></label><label class="grow">副标题<input id="st" type="text"></label></div>',
      '<label class="fl">数据<small>每行一条：标签, 系列1, 系列2 …（逗号或 Tab 分隔，首行为系列名）</small></label>',
      '<textarea id="dt" spellcheck="false"></textarea>',
      '<div class="row"><button id="dp" class="btn primary">下载 PNG（2×）</button><button id="ds" class="btn">下载 SVG</button><span class="tiny">由「知作坊 · 图表工坊」导出</span></div>',
      "</div>",
      '<script id="payload" type="application/json">' + payload + "<\/script>",
      "<script>var makeCore = " + coreSrc + ";<\/script>",
      "<script>" + appSrc + "<\/script>",
      "</body></html>"
    ];
    download(new Blob([parts.join("\n")], { type: "text/html;charset=utf-8" }), fileBase() + ".html");
    toast("已导出可编辑 HTML，双击打开就能继续改");
  }

  /* ---------------- 启动 ---------------- */
  function applyDeepLink() {
    var q = new URLSearchParams(location.search);
    var ex = parseInt(q.get("ex"), 10);
    if (ex >= 1 && ex <= PRESETS.length) { applyPreset(PRESETS[ex - 1]); return true; }
    var t = q.get("t");
    if (t && TYPES.some(function (x) { return x.id === t; })) {
      state.type = t; syncUI(); syncVisibility(); draw(); return true;
    }
    var m = /#s=([^&]+)/.exec(location.hash || "");
    if (m) {
      try {
        var obj = JSON.parse(decodeURIComponent(atob(m[1])));
        applyProject(obj); toast("已从分享链接还原"); return true;
      } catch (e) { }
    }
    return false;
  }

  function init() {
    if (!core) { console.error("chart core 未加载"); return; }
    buildTypeBar(); buildPalettes(); buildPresets();
    $("#dataText").value = DATA_TEXT;
    renderTable();
    bindAll();
    syncUI(); syncVisibility(); draw();
    applyDeepLink();
    setTimeout(draw, 150);
    window.__chartApp = {
      state: state, core: core, draw: draw, applyPreset: applyPreset,
      getData: function () { return DATA_TEXT; },
      setData: function (t) { DATA_TEXT = t; grid = gridFromText(t); $("#dataText").value = t; renderTable(); draw(); },
      exportPNG: exportPNG, exportSVG: exportSVG, exportHTML: exportHTML,
      exportJSON: exportJSON, exportCSV: exportCSV, applyProject: applyProject
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
