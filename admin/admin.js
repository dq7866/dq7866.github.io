/* ============================================================
   知作坊 · 站长管理后台
   ------------------------------------------------------------
   数据全部经门卫域（zhizuofang.app.workbuddy.host）的 bridge.html
   转发到云端 RPC；后台自身不做任何本地存储（除登录令牌）。
   ============================================================ */
(function () {
  "use strict";

  var ORIGIN = "https://zhizuofang.app.workbuddy.host";
  var BRIDGE = ORIGIN + "/bridge.html";
  var TK = "zhz_admin_token";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- 通用工具 ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function nf(n) { return String(n === null || n === undefined ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fmtStay(s) {
    if (s === null || s === undefined || s < 0) return "—";
    if (s < 60) return s + " 秒";
    if (s < 3600) return Math.floor(s / 60) + " 分" + (s % 60 ? (s % 60) + " 秒" : "");
    return Math.floor(s / 3600) + " 时" + Math.floor((s % 3600) / 60) + " 分";
  }
  function devIc(d) { return d === "phone" ? "📱" : d === "tablet" ? "📟" : "💻"; }
  function toast(msg, kind) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "on" + (kind ? " " + kind : "");
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.className = ""; }, 2600);
  }
  function confirmBox(title, sub, onOk, okText) {
    var m = $("#modal");
    m.innerHTML = '<div class="box"><h3>' + esc(title) + "</h3>" +
      (sub ? '<div class="sub">' + sub + "</div>" : "") +
      '<div class="acts"><button class="btn" data-x="no">取消</button>' +
      '<button class="btn danger" data-x="yes">' + esc(okText || "确认") + "</button></div></div>";
    m.classList.remove("hidden");
    $('[data-x="no"]', m).onclick = function () { m.classList.add("hidden"); };
    $('[data-x="yes"]', m).onclick = function () { m.classList.add("hidden"); onOk(); };
  }

  /* ---------------- 桥接 ---------------- */
  var frame = null, frameReady = false, seq = 0, pending = {};

  function ensureBridge() {
    if (frame) return;
    try {
      frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.title = "admin-bridge";
      frame.style.cssText = "position:absolute;width:0;height:0;border:0;left:-9999px;top:0;";
      frame.onload = function () { frameReady = true; sendAll(); };
      frame.src = BRIDGE;
      document.body.appendChild(frame);
    } catch (e) { frame = null; }
  }
  function sendAll() {
    if (!frame || !frameReady || !frame.contentWindow) return;
    Object.keys(pending).forEach(function (k) {
      var it = pending[k];
      try {
        frame.contentWindow.postMessage({ type: "zhz:rpc", fn: it.fn, args: it.args, scope: "stats", seq: Number(k) }, ORIGIN);
      } catch (e) {}
    });
  }
  window.addEventListener("message", function (ev) {
    if (ev.origin !== ORIGIN) return;
    var d = ev.data;
    if (!d || typeof d !== "object" || d.type !== "zhz:rpc" || d.seq === undefined) return;
    var it = pending[d.seq];
    if (!it) return;
    delete pending[d.seq];
    clearTimeout(it.timer);
    it.resolve(d);
  });
  function call(fn, args) {
    return new Promise(function (resolve) {
      ensureBridge();
      var s = ++seq;
      var timer = setTimeout(function () { delete pending[s]; resolve(null); }, 20000);
      pending[s] = { fn: fn, args: args || {}, resolve: resolve, timer: timer };
      sendAll();
    });
  }

  var authLost = false;
  function rpc(fn, args) {
    return call(fn, args).then(function (r) {
      if (!r) return { ok: false, message: "云端无响应，请检查网络后重试" };
      if (r.ok === false) return { ok: false, message: r.message || "调用失败" };
      var d = r.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) {} }
      if (d && d.ok === false && d.reason === "auth" && !authLost) {
        authLost = true;
        setTimeout(function () { logout(true); }, 30);
        return { ok: false, auth: true, message: "登录已过期，请重新登录" };
      }
      return d || { ok: false, message: "返回数据格式异常" };
    });
  }

  function reasonText(d) {
    if (!d) return "网络异常，请稍后重试";
    if (d.msg) return d.msg;
    var m = {
      empty: "请输入用户名和密码",
      bad_cred: "用户名或密码不正确",
      locked: "失败次数过多，账号已临时锁定",
      short: "新密码至少 8 位",
      bad_old: "原密码不正确",
      bad_target: "目标用户或分区无效",
      bad_delta: "调整数量无效（1~10000）",
      bad_ip: "IP 地址无效",
      bad_kind: "规则类型无效",
      bad_action: "操作类型无效",
      auth: "登录已过期，请重新登录",
      rate_limited: "操作过于频繁，请稍后再试",
      not_allowed: "该函数不在白名单内"
    };
    return m[d.reason] || d.message || "操作失败";
  }

  /* ---------------- 状态 ---------------- */
  var S = {
    page: "overview", days: 7, timer: null,
    ip: null, ipRegion: ""
  };

  function token() { try { return localStorage.getItem(TK) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { t ? localStorage.setItem(TK, t) : localStorage.removeItem(TK); } catch (e) {} }

  /* ---------------- 登录 / 登出 ---------------- */
  function doLogin() {
    var u = $("#lg-user").value.trim(), p = $("#lg-pass").value;
    if (!u || !p) { $("#lg-err").textContent = "请输入用户名和密码"; return; }
    var btn = $("#lg-btn");
    btn.disabled = true; btn.textContent = "登录中…"; $("#lg-err").textContent = "";
    call("admin_login", { p_user: u, p_pass: p }).then(function (r) {
      btn.disabled = false; btn.textContent = "登 录";
      var d = r && r.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) {} }
      if (d && d.ok && d.token) {
        setToken(d.token); authLost = false; enterApp();
      } else {
        $("#lg-err").textContent = reasonText(d);
      }
    });
  }
  function logout(silent) {
    var t = token();
    if (t) call("admin_logout", { p_token: t });
    setToken("");
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    $("#app").classList.add("hidden");
    $("#login").classList.remove("hidden");
    $("#lg-pass").value = "";
    if (silent) $("#lg-err").textContent = "登录已过期，请重新登录";
  }
  function enterApp() {
    $("#login").classList.add("hidden");
    $("#app").classList.remove("hidden");
    go("overview");
  }

  /* ---------------- 图表：趋势 ---------------- */
  function dateSeq(endStr, n) {
    var out = [], d = new Date(endStr + "T12:00:00");
    if (isNaN(d.getTime())) d = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d.getTime() - i * 86400000);
      out.push(x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()));
    }
    return out;
  }
  function trendChart(endStr, n, trend) {
    var map = {};
    (trend || []).forEach(function (r) { map[r.d] = r; });
    var days = dateSeq(endStr, n);
    var W = 760, H = 216, pl = 40, pr = 10, pt = 16, pb = 28;
    var iw = W - pl - pr, ih = H - pt - pb;
    var maxPv = 1, maxUv = 1;
    days.forEach(function (d) {
      var r = map[d] || {};
      if ((r.pv || 0) > maxPv) maxPv = r.pv;
      if ((r.uv || 0) > maxUv) maxUv = r.uv;
    });
    var step = iw / days.length;
    var bw = Math.max(3, Math.min(26, step * 0.56));
    var g = [], pts = [];
    for (var i = 0; i <= 4; i++) {
      var y = pt + ih * (i / 4);
      var v = Math.round(maxPv * (1 - i / 4));
      g.push('<line x1="' + pl + '" y1="' + y.toFixed(1) + '" x2="' + (W - pr) + '" y2="' + y.toFixed(1) + '" stroke="#232b3b"/>');
      g.push('<text x="' + (pl - 6) + '" y="' + (y + 3.5).toFixed(1) + '" fill="#6b7688" font-size="10" text-anchor="end">' + v + "</text>");
    }
    days.forEach(function (d, i) {
      var r = map[d] || { pv: 0, uv: 0 };
      var cx = pl + step * i + step / 2;
      var h = ih * ((r.pv || 0) / maxPv);
      var yy = pt + ih - h;
      g.push('<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.6, h).toFixed(1) + '" rx="2" fill="url(#gbar)"/>');
      var uy = pt + ih - ih * ((r.uv || 0) / maxUv);
      pts.push([cx, uy]);
      var skip = Math.ceil(days.length / 9);
      if (i % skip === 0 || i === days.length - 1) {
        g.push('<text x="' + cx.toFixed(1) + '" y="' + (H - 9) + '" fill="#6b7688" font-size="10" text-anchor="middle">' + d.slice(5) + "</text>");
      }
    });
    if (pts.length > 1) {
      g.push('<polyline fill="none" stroke="#e0a851" stroke-width="1.8" stroke-linejoin="round" points="' +
        pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>');
      pts.forEach(function (p) { g.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.2" fill="#f2c47a"/>'); });
    }
    return '<div class="chart"><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" style="height:216px">' +
      '<defs><linearGradient id="gbar" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#4c9df0"/><stop offset="100%" stop-color="#28609b"/></linearGradient></defs>' +
      g.join("") + "</svg></div>" +
      '<div class="legend"><span><i style="background:#4c9df0"></i>浏览量 PV</span>' +
      '<span><i style="background:#e0a851"></i>访客数 UV</span></div>';
  }

  /* ---------------- 图表：24 小时分布 ---------------- */
  function hourChart(hours) {
    var arr = new Array(24).fill(0), uv = new Array(24).fill(0);
    (hours || []).forEach(function (r) { if (r.h >= 0 && r.h < 24) { arr[r.h] = r.pv; uv[r.h] = r.uv; } });
    var max = Math.max.apply(null, arr.concat([1]));
    var W = 760, H = 160, pl = 34, pr = 8, pt = 12, pb = 22;
    var iw = W - pl - pr, ih = H - pt - pb, step = iw / 24, bw = Math.max(4, step * 0.62);
    var g = [];
    for (var i = 0; i <= 3; i++) {
      var y = pt + ih * (i / 3);
      g.push('<line x1="' + pl + '" y1="' + y.toFixed(1) + '" x2="' + (W - pr) + '" y2="' + y.toFixed(1) + '" stroke="#232b3b"/>');
      g.push('<text x="' + (pl - 5) + '" y="' + (y + 3.5).toFixed(1) + '" fill="#6b7688" font-size="10" text-anchor="end">' + Math.round(max * (1 - i / 3)) + "</text>");
    }
    for (var h = 0; h < 24; h++) {
      var cx = pl + step * h + step / 2;
      var bh = ih * (arr[h] / max);
      g.push('<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (pt + ih - bh).toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(0.6, bh).toFixed(1) + '" rx="2" fill="' + (arr[h] ? "#3fc9d6" : "#232b3b") + '"><title>' + h + " 时：" + arr[h] + " PV / " + uv[h] + " UV</title></rect>");
      if (h % 3 === 0) g.push('<text x="' + cx.toFixed(1) + '" y="' + (H - 7) + '" fill="#6b7688" font-size="10" text-anchor="middle">' + h + "</text>");
    }
    return '<div class="chart"><svg viewBox="0 0 ' + W + " " + H + '" style="height:160px">' + g.join("") + "</svg></div>";
  }

  /* ---------------- 横向条 ---------------- */
  var PAL = ["#4c9df0", "#3fc9d6", "#e0a851", "#a97cf0", "#3fbf8f", "#ef8f6b", "#7f8fa8"];
  function bars(list, opts) {
    opts = opts || {};
    if (!list || !list.length) return '<div class="empty">暂无数据</div>';
    var max = 1;
    list.forEach(function (r) { if ((r.pv || 0) > max) max = r.pv; });
    return '<div class="bars">' + list.map(function (r, i) {
      var w = Math.max(1.5, (r.pv || 0) / max * 100);
      var c = opts.color ? opts.color(r, i) : PAL[i % PAL.length];
      var label = opts.label ? opts.label(r) : esc(r.k || "—");
      return '<div class="row"><div class="k" title="' + esc(r.k || "") + '">' + label + '</div>' +
        '<div class="t"><i style="width:' + w.toFixed(1) + '%;background:linear-gradient(90deg,' + c + "," + c + 'aa)"></i></div>' +
        '<div class="v">' + nf(r.pv) + (r.uv !== undefined ? '<em>' + nf(r.uv) + "人</em>" : "") + "</div></div>";
    }).join("") + "</div>";
  }

  function kpi(label, val, sub, delta) {
    var cls = "flat", txt = "";
    if (delta !== null && delta !== undefined && isFinite(delta)) {
      if (delta > 0) { cls = "up"; txt = "↑ " + delta.toFixed(1) + "%"; }
      else if (delta < 0) { cls = "down"; txt = "↓ " + Math.abs(delta).toFixed(1) + "%"; }
      else { txt = "持平"; }
    }
    return '<div class="card kpi"><div class="lb">' + label + '</div><div class="vl">' + val +
      (sub ? "<small>" + sub + "</small>" : "") + "</div>" +
      (txt ? '<div class="df ' + cls + '">' + txt + (delta !== null && delta !== undefined ? " 较昨日" : "") + "</div>" : "") + "</div>";
  }

  function growth(a, b) {
    if (!b) return a ? null : 0;
    return (a - b) / b * 100;
  }

  /* ================= 页面：概览 ================= */
  function pageOverview(host) {
    host.innerHTML = '<div class="loading">正在汇总数据</div>';
    rpc("admin_overview", { p_token: token(), p_days: S.days }).then(function (d) {
      if (!d.ok) { host.innerHTML = '<div class="empty">' + esc(d.message || "加载失败") + "</div>"; return; }
      var s = d.summary, today = (d.server_time || "").slice(0, 10);
      var html = "";
      if (d.track !== "on") html += '<div class="note warn">⚠️ 当前统计已 <b>关闭</b>，新访问不会被记录。可在「安全与设置」里重新开启。</div>';
      html += '<div class="grid g6" style="margin-bottom:14px">' +
        kpi("今日浏览量", nf(s.today_pv), "次", growth(s.today_pv, s.yest_pv)) +
        kpi("今日访客", nf(s.today_uv), "人", growth(s.today_uv, s.yest_uv)) +
        kpi("今日独立 IP", nf(s.today_ip), "个", growth(s.today_ip, s.yest_ip)) +
        kpi("当前在线", nf(d.online), "人(5 分钟)") +
        kpi(S.days + " 日浏览量", nf(s.pv), "次") +
        kpi(S.days + " 日访客", nf(s.uv), "人", null) +
        "</div>";
      html += '<div class="grid g2" style="margin-bottom:14px">' +
        kpi("今日平均停留", fmtStay(s.today_stay), "", null) +
        kpi("累计记录", nf(s.all_pv), "次访问", null) +
        "</div>";

      html += '<div class="card" style="margin-bottom:14px"><h3>📈 访问趋势 <em>近 ' + S.days + ' 天</em><span class="sp"></span>' +
        '<span style="font-size:12px;color:var(--tx3)">平均停留 ' + fmtStay(s.stay) + " ・ " + nf(s.sess) + " 个会话</span></h3>" +
        trendChart(today, S.days, d.trend) + "</div>";

      html += '<div class="card" style="margin-bottom:14px"><h3>🕐 时段分布 <em>近 ' + S.days + " 天每小时</em></h3>" + hourChart(d.hours) + "</div>";

      html += '<div class="grid g2" style="margin-bottom:14px">' +
        '<div class="card"><h3>🧭 子站流量</h3>' + bars(d.sites, { label: function (r) { return esc(SITE_NAME[r.k] || r.k); } }) + "</div>" +
        '<div class="card"><h3>🔥 热门页面</h3>' + bars(d.pages) + "</div>" +
        "</div>";
      html += '<div class="grid g3" style="margin-bottom:14px">' +
        '<div class="card"><h3>🌏 来源地区</h3>' + bars(d.regions) + "</div>" +
        '<div class="card"><h3>🔗 来路站点</h3>' + bars(d.refs) + "</div>" +
        '<div class="card"><h3>📱 设备 / 系统 / 浏览器</h3>' +
          bars((d.devices || []).map(function (r) { return { k: (r.k === "desktop" ? "💻 电脑" : r.k === "phone" ? "📱 手机" : "📟 平板"), pv: r.pv }; })) +
          '<div style="height:9px"></div>' + bars(d.os) + '<div style="height:9px"></div>' + bars(d.browsers) +
        "</div>" +
        "</div>";

      var ld = d.landed || {}, tot = (ld.new || 0) + (ld.back || 0);
      html += '<div class="grid g2" style="margin-bottom:14px">' +
        '<div class="card"><h3>👣 新老访客</h3>' +
          bars([
            { k: "首次到访", pv: ld.new || 0, uv: ld.new || 0 },
            { k: "回访", pv: ld.back || 0, uv: ld.back || 0 }
          ], { color: function (r, i) { return i === 0 ? "#3fbf8f" : "#4c9df0"; }, label: function (r) { return esc(r.k) + (tot ? ' <em style="color:var(--tx3)">' + Math.round(r.pv / tot * 100) + "%</em>" : ""); } }) +
        "</div>" +
        '<div class="card"><h3>⏱ 停留时长分布</h3>' + bars(stayBuckets(d.stay), { color: function (r, i) { return PAL[(i + 2) % PAL.length]; }, label: function (r) { return esc(r.k); } }) + "</div>" +
        "</div>";

      html += '<div class="card"><h3>⚡ 最近访客 <em>20 条</em><span class="sp"></span><button class="btn sm" id="ov-refresh">刷新</button></h3>' +
        feedHtml(d.recent) + "</div>";

      host.innerHTML = html;
      $("#ov-refresh", host).onclick = function () { pageOverview(host); };
      bindFeed(host);
    });
  }
  function stayBuckets(b) {
    b = b || {};
    return [
      { k: "10 秒内", pv: b.b0 || 0 }, { k: "10–30 秒", pv: b.b1 || 0 },
      { k: "30–60 秒", pv: b.b2 || 0 }, { k: "1–3 分钟", pv: b.b3 || 0 },
      { k: "3–10 分钟", pv: b.b4 || 0 }, { k: "10 分钟以上", pv: b.b5 || 0 }
    ];
  }
  var SITE_NAME = { home: "首页", blog: "博客文章", board: "留言板", games: "游戏盒", edu: "教育篇", toolbox: "工具箱", bike: "风驰骑行", guardian: "冰火守门人", forest: "森林学堂", symbolpass: "符号通行证", other: "其他" };
  function feedHtml(rows) {
    if (!rows || !rows.length) return '<div class="empty">暂无记录</div>';
    return '<div class="feed">' + rows.map(function (r) {
      return '<div class="it" data-v="' + esc(r.visitor_id || "") + '">' +
        '<div class="ic">' + devIc(r.device) + "</div>" +
        '<div class="m"><b>' + esc(r.ip || "-") + "</b>" + (r.region ? ' <span class="tag">' + esc(r.region) + "</span>" : "") +
        "<div>" + esc(SITE_NAME[r.site] || r.site || "") + " ・ " + esc(r.path || "") +
        (r.ref_host ? " ・ 来自 " + esc(r.ref_host) : "") + "</div></div>" +
        '<div class="tt">' + esc(r.t || "") + (r.stay >= 0 ? "<br>停留 " + fmtStay(r.stay) : "") + "</div>" +
        "</div>";
    }).join("") + "</div>";
  }
  function bindFeed(host) {
    $$(".feed .it[data-v]", host).forEach(function (el) {
      el.style.cursor = "pointer";
      el.onclick = function () { openVisitor(el.getAttribute("data-v")); };
    });
  }
  function openVisitor(vid) {
    if (!vid) return;
    var m = $("#modal");
    m.innerHTML = '<div class="box"><h3>访客轨迹</h3><div class="sub">访客标识 ' + esc(vid) + "</div><div id=\"vinfo\" class=\"loading\">加载中</div><div id=\"vrows\"></div>" +
      '<div class="acts"><button class="btn" data-x="no">关闭</button></div></div>';
    m.classList.remove("hidden");
    $('[data-x="no"]', m).onclick = function () { m.classList.add("hidden"); };
    rpc("admin_visitor", { p_token: token(), p_visitor: vid }).then(function (d) {
      if (!d.ok) { $("#vinfo", m).className = "empty"; $("#vinfo", m).textContent = d.message || "加载失败"; return; }
      var i = d.info;
      $("#vinfo", m).className = "";
      $("#vinfo", m).innerHTML = '<div class="kv" style="margin-bottom:12px">' +
        '<div class="k">IP</div><div class="v">' + esc(i.ip || "-") + "</div>" +
        '<div class="k">归属地</div><div class="v">' + esc(i.region || "—") + "</div>" +
        '<div class="k">设备</div><div class="v">' + devIc(i.device) + " " + esc([i.os, i.browser].filter(Boolean).join(" / ") || "—") + "</div>" +
        '<div class="k">访问次数</div><div class="v">' + nf(i.pv) + " 次 / 跨 " + nf(i.days) + " 天</div>" +
        '<div class="k">首次</div><div class="v">' + esc(i.first || "—") + "</div>" +
        '<div class="k">最近</div><div class="v">' + esc(i.last || "—") + "</div>" +
        '<div class="k">平均停留</div><div class="v">' + fmtStay(i.avg_stay) + "</div>" +
        "</div>" +
        (i.ip && i.ip !== "-" ? '<button class="btn sm danger" id="vblock">拉黑该 IP</button>' : "");
      var b = $("#vblock", m);
      if (b) b.onclick = function () {
        adminIp((i.ip || "").split(" / ")[0], "block", "");
        m.classList.add("hidden");
      };
      $("#vrows", m).innerHTML = '<div class="tblwrap" style="margin-top:14px;max-height:300px;overflow:auto"><table><thead><tr><th>时间</th><th>页面</th><th>IP</th><th>停留</th></tr></thead><tbody>' +
        (d.rows || []).map(function (r) {
          return "<tr><td class='mono'>" + esc(r.tm) + "</td><td>" + esc(SITE_NAME[r.site] || r.site) + " " + esc(r.path) +
            "</td><td class='mono'>" + esc(r.ip) + "</td><td>" + fmtStay(r.stay) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    });
  }

  /* ================= 页面：实时 ================= */
  function pageLive(host) {
    host.innerHTML = '<div class="card"><h3>📡 实时访客<span class="sp"></span>' +
      '<span id="live-n" style="font-size:12px;color:var(--tx3)"></span>' +
      '<button class="btn sm" id="live-r">刷新</button></h3>' +
      '<div class="note">每 20 秒自动刷新。点任意一条可查看该访客的完整轨迹。</div>' +
      '<div id="live-feed" class="loading">加载中</div></div>';
    function pull() {
      rpc("admin_overview", { p_token: token(), p_days: 1 }).then(function (d) {
        if (!d.ok) { $("#live-feed", host).className = "empty"; $("#live-feed", host).textContent = d.message || "加载失败"; return; }
        $("#live-n", host).innerHTML = '<span class="dot"></span>当前在线 ' + nf(d.online) + " 人";
        var f = $("#live-feed", host);
        f.className = ""; f.innerHTML = feedHtml(d.recent);
        bindFeed(f);
      });
    }
    pull();
    $("#live-r", host).onclick = pull;
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(function () { if (S.page === "live") pull(); }, 20000);
  }

  /* ================= 页面：访客 IP ================= */
  function pageIps(host) {
    host.innerHTML = toolbar([
      { t: "search", id: "ips-kw", ph: "搜 IP / 归属地" },
      { t: "days", id: "ips-days" },
      { t: "btn", id: "ips-go", label: "查询" }
    ]) + '<div id="ips-body" class="loading">加载中</div>';
    var page = 1;
    function pull() {
      $("#ips-body", host).className = "loading";
      $("#ips-body", host).textContent = "加载中";
      rpc("admin_ips", { p_token: token(), p_days: +$("#ips-days", host).value, p_page: page, p_size: 50, p_kw: $("#ips-kw", host).value.trim() }).then(function (d) {
        if (!d.ok) { $("#ips-body", host).className = "empty"; $("#ips-body", host).textContent = d.message || "加载失败"; return; }
        var rows = (d.rows || []).map(function (r) {
          return "<tr><td class='mono'>" + esc(r.ip) + "</td><td>" + (r.region ? esc(r.region) : "—") + "</td>" +
            "<td>" + nf(r.pv) + "</td><td>" + nf(r.uv) + "</td><td>" + nf(r.sessions) + "</td>" +
            "<td>" + fmtStay(r.avg_stay) + "</td><td>" + devIc(r.device) + esc(r.os || "") + "</td>" +
            "<td>" + esc((r.sites || "").split(",").map(function (x) { return SITE_NAME[x] || x; }).join("、")) + "</td>" +
            "<td class='mono'>" + esc(r.last_seen) + "</td>" +
            "<td><button class='btn sm' data-ip='" + esc(r.ip) + "' data-k='block'>拉黑</button> " +
            "<button class='btn sm' data-ip='" + esc(r.ip) + "' data-k='trust'>加白</button></td></tr>";
        }).join("");
        $("#ips-body", host).className = "";
        $("#ips-body", host).innerHTML = (d.rows && d.rows.length ? '<div class="tblwrap"><table><thead><tr><th>IP</th><th>归属地</th><th>浏览量</th><th>访客</th><th>会话</th><th>均停留</th><th>设备</th><th>访问过的板块</th><th>最近</th><th>操作</th></tr></thead><tbody>' + rows + "</tbody></table></div>" :
          '<div class="empty">该时间段内没有记录</div>') +
          pager(d.total, d.page, d.size, function (p) { page = p; pull(); });
        $$("[data-ip]", host).forEach(function (b) {
          b.onclick = function () { adminIp(b.getAttribute("data-ip"), b.getAttribute("data-k"), ""); };
        });
      });
    }
    pull();
    $("#ips-go", host).onclick = function () { page = 1; pull(); };
    $("#ips-kw", host).onkeydown = function (e) { if (e.key === "Enter") { page = 1; pull(); } };
  }

  /* ================= 页面：访问明细 ================= */
  function pageVisits(host) {
    host.innerHTML = toolbar([
      { t: "search", id: "vs-kw", ph: "搜 IP / 路径 / 访客ID / 地区" },
      { t: "days", id: "vs-days" },
      { t: "site", id: "vs-site" },
      { t: "btn", id: "vs-go", label: "查询" },
      { t: "btn", id: "vs-csv", label: "导出 CSV" }
    ]) + '<div id="vs-body" class="loading">加载中</div>';
    var page = 1;
    function params() {
      return { p_token: token(), p_days: +$("#vs-days", host).value, p_page: page, p_size: 50, p_kw: $("#vs-kw", host).value.trim(), p_site: $("#vs-site", host).value };
    }
    function pull() {
      $("#vs-body", host).className = "loading";
      $("#vs-body", host).textContent = "加载中";
      rpc("admin_visits", params()).then(function (d) {
        if (!d.ok) { $("#vs-body", host).className = "empty"; $("#vs-body", host).textContent = d.message || "加载失败"; return; }
        var rows = (d.rows || []).map(function (r) {
          /* ip 为 "-" 表示前端没取到访客真实 IP（云端不拿平台网关 IP 顶替），
             此时把网关出口 IP 放进 title，方便排查是不是访客网络取不到。 */
          var noIp = !r.ip || r.ip === "-";
          var ipCell = noIp
            ? '<span class="tag y" title="' + (r.srv_ip ? "平台网关出口：" + esc(r.srv_ip) : "无") + '">未知</span>'
            : esc(r.ip);
          return "<tr><td class='mono'>" + esc(r.tm) + "</td>" +
            "<td class='mono'>" + ipCell + (r.landed ? ' <span class="tag g">新</span>' : "") + "</td>" +
            "<td>" + (r.region ? esc(r.region) : "—") + "</td>" +
            "<td>" + esc(SITE_NAME[r.site] || r.site) + "</td>" +
            "<td class='mono'>" + esc(r.path) + "</td>" +
            "<td>" + devIc(r.device) + " " + esc([r.os, r.browser].filter(Boolean).join("/")) + "</td>" +
            "<td>" + (r.ref_host ? esc(r.ref_host) : "—") + "</td>" +
            "<td>" + fmtStay(r.stay) + "</td>" +
            "<td><button class='btn sm' data-v='" + esc(r.visitor_id) + "'>轨迹</button></td></tr>";
        }).join("");
        $("#vs-body", host).className = "";
        $("#vs-body", host).innerHTML = (d.rows && d.rows.length ? '<div class="tblwrap"><table><thead><tr><th>时间</th><th>IP</th><th>归属地</th><th>板块</th><th>页面</th><th>设备</th><th>来路</th><th>停留</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" :
          '<div class="empty">该条件下没有记录</div>') + pager(d.total, d.page, d.size, function (p) { page = p; pull(); });
        $$("[data-v]", host).forEach(function (b) { b.onclick = function () { openVisitor(b.getAttribute("data-v")); }; });
      });
    }
    pull();
    $("#vs-go", host).onclick = function () { page = 1; pull(); };
    $("#vs-kw", host).onkeydown = function (e) { if (e.key === "Enter") { page = 1; pull(); } };
    $("#vs-csv", host).onclick = function () { exportCsv(params(), "访问明细"); };
  }

  function exportCsv(base, name) {
    toast("正在生成 CSV…");
    rpc("admin_visits", Object.assign({}, base, { p_page: 1, p_size: 200, p_kw: base.p_kw })).then(function (d1) {
      if (!d1.ok) { toast("导出失败", "bad"); return; }
      var total = d1.total, all = d1.rows || [];
      var pages = Math.min(20, Math.ceil(total / 200));
      var chain = Promise.resolve();
      for (var p = 2; p <= pages; p++) {
        (function (pp) {
          chain = chain.then(function () {
            return rpc("admin_visits", Object.assign({}, base, { p_page: pp, p_size: 200 })).then(function (d) {
              if (d.ok && d.rows) all = all.concat(d.rows);
            });
          });
        })(p);
      }
      chain.then(function () {
        var head = ["时间", "IP", "归属地", "板块", "页面", "设备", "系统", "浏览器", "来路", "停留秒", "访客ID", "分辨率"];
        var lines = [head.join(",")].concat(all.map(function (r) {
          return [r.tm, r.ip, r.region, SITE_NAME[r.site] || r.site, r.path, r.device, r.os, r.browser, r.ref_host, r.stay, r.visitor_id, r.screen]
            .map(function (x) { return '"' + String(x === undefined || x === null ? "" : x).replace(/"/g, '""') + '"'; }).join(",");
        }));
        download("\ufeff" + lines.join("\r\n"), name + "-" + new Date().toISOString().slice(0, 10) + ".csv");
        toast("已导出 " + all.length + " 条" + (total > all.length ? "（上限 4000 条）" : ""), "ok");
      });
    });
  }
  function download(text, filename) {
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  /* ================= 页面：留言 ================= */
  function pageMsgs(host) {
    host.innerHTML = toolbar([
      { t: "search", id: "ms-kw", ph: "搜昵称 / 内容" },
      { t: "btn", id: "ms-go", label: "查询" }
    ]) + '<div id="ms-body" class="loading">加载中</div>';
    var page = 1;
    function pull() {
      rpc("admin_messages", { p_token: token(), p_page: page, p_size: 50, p_kw: $("#ms-kw", host).value.trim() }).then(function (d) {
        if (!d.ok) { $("#ms-body", host).className = "empty"; $("#ms-body", host).textContent = d.message || "加载失败"; return; }
        var st = d.stat || {};
        var rows = (d.rows || []).map(function (r) {
          return "<tr><td class='mono'>" + esc(r.tm) + "</td><td>" + esc(r.nickname) + "</td>" +
            "<td class='wrap'>" + esc(r.content) + "</td>" +
            "<td>" + (r.is_hidden ? '<span class="tag r">已隐藏</span>' : '<span class="tag g">展示中</span>') + "</td>" +
            "<td>" + (r.is_hidden
              ? "<button class='btn sm' data-a='show' data-i='" + r.id + "'>恢复</button> "
              : "<button class='btn sm' data-a='hide' data-i='" + r.id + "'>隐藏</button> ") +
            "<button class='btn sm danger' data-a='delete' data-i='" + r.id + "'>删除</button></td></tr>";
        }).join("");
        $("#ms-body", host).className = "";
        $("#ms-body", host).innerHTML =
          '<div class="card" style="margin-bottom:13px"><h3>留言统计</h3><div class="grid g4">' +
          kpi("留言总数", nf(st.all), "条") + kpi("展示中", nf((st.all || 0) - (st.hidden || 0)), "条") +
          kpi("已隐藏", nf(st.hidden), "条") + kpi("近 24 小时", nf(st.today), "条") + "</div></div>" +
          (d.rows && d.rows.length ? '<div class="card"><div class="tblwrap"><table><thead><tr><th>时间</th><th>昵称</th><th>内容</th><th>状态</th><th>操作</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
            pager(d.total, d.page, d.size, function (p) { page = p; pull(); }) + "</div>" : '<div class="empty">还没有留言</div>');
        $$("[data-a]", host).forEach(function (b) {
          b.onclick = function () {
            var a = b.getAttribute("data-a"), id = +b.getAttribute("data-i");
            var run = function () {
              rpc("admin_msg_action", { p_token: token(), p_id: id, p_action: a }).then(function (r) {
                if (!r.ok) { toast(r.message || "操作失败", "bad"); return; }
                toast(a === "hide" ? "已隐藏" : a === "show" ? "已恢复展示" : "已删除", "ok"); pull();
              });
            };
            if (a === "delete") confirmBox("删除这条留言？", "删除后无法恢复。", run, "删除");
            else run();
          };
        });
      });
    }
    pull();
    $("#ms-go", host).onclick = function () { page = 1; pull(); };
    $("#ms-kw", host).onkeydown = function (e) { if (e.key === "Enter") { page = 1; pull(); } };
  }

  /* ================= 页面：兑换码 ================= */
  function pageCodes(host) {
    host.innerHTML = '<div class="toolbar">' +
      '<input id="cd-kw" placeholder="搜兑换码 / 批次" style="width:190px">' +
      '<select id="cd-state"><option value="">全部状态</option><option value="unused">未使用</option><option value="used">已核销</option></select>' +
      '<select id="cd-batch"><option value="">全部批次</option></select>' +
      '<button class="btn" id="cd-go">查询</button><span class="sp"></span>' +
      '<button class="btn primary" id="cd-new">＋ 生成兑换码</button></div>' +
      '<div id="cd-body" class="loading">加载中</div>';
    var page = 1;
    function pull() {
      rpc("admin_codes", { p_token: token(), p_state: $("#cd-state", host).value, p_batch: $("#cd-batch", host).value, p_page: page, p_size: 100 }).then(function (d) {
        if (!d.ok) { $("#cd-body", host).className = "empty"; $("#cd-body", host).textContent = d.message || "加载失败"; return; }
        var st = d.stat || {};
        var bs = $("#cd-batch", host), cur = bs.value;
        bs.innerHTML = '<option value="">全部批次</option>' + (d.batches || []).map(function (b) {
          return '<option value="' + esc(b.batch) + '">' + esc(b.batch) + "（剩 " + b.unused + "/" + b.n + "）</option>";
        }).join("");
        bs.value = cur;
        var kw = $("#cd-kw", host).value.trim().toLowerCase();
        var rows = (d.rows || []).filter(function (r) { return !kw || (r.code + " " + r.batch).toLowerCase().indexOf(kw) >= 0; }).map(function (r) {
          return "<tr><td class='mono' style='letter-spacing:1px'>" + esc(r.code) + "</td><td>" + esc(r.batch) + "</td>" +
            "<td>" + (r.used_by ? '<span class="tag y">已核销</span>' : '<span class="tag g">未使用</span>') + "</td>" +
            "<td class='mono'>" + esc(r.used_at || "—") + "</td><td>" + esc(r.created) + "</td></tr>";
        }).join("");
        $("#cd-body", host).className = "";
        $("#cd-body", host).innerHTML =
          '<div class="grid g4" style="margin-bottom:13px">' +
          kpi("兑换码总数", nf(st.all), "个") + kpi("未使用", nf(st.unused), "个") +
          kpi("已核销", nf(st.used), "个") + kpi("剩余可用额度", nf((st.unused || 0) * 100), "次") +
          "</div>" + (st.unused ? '<div class="note">未核销码可随时作废：直接在「未使用」列表里删除对应行即可（请告诉我，我来执行）。每码＝100 次免费额。</div>' : "") +
          (rows ? '<div class="card"><div class="tblwrap"><table><thead><tr><th>兑换码</th><th>批次</th><th>状态</th><th>核销时间</th><th>生成日期</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
            pager(d.total, d.page, d.size, function (p) { page = p; pull(); }) + "</div>" : '<div class="empty">没有匹配的兑换码</div>');
      });
    }
    pull();
    $("#cd-go", host).onclick = function () { page = 1; pull(); };
    $("#cd-batch", host).onchange = function () { page = 1; pull(); };
    $("#cd-state", host).onchange = function () { page = 1; pull(); };
    $("#cd-kw", host).onkeydown = function (e) { if (e.key === "Enter") pull(); };
    $("#cd-new", host).onclick = function () {
      var m = $("#modal");
      m.innerHTML = '<div class="box"><h3>生成兑换码</h3><div class="sub">每码 = 100 次免费额度，12 位字符（已排除 0/O/1/I/L 等易混字符）。生成后请抄到你的《兑换码清单》里。</div>' +
        '<label>生成数量（1–500）</label><input id="n-count" type="number" value="20" min="1" max="500">' +
        '<label>批次名（留空自动用当月）</label><input id="n-batch" placeholder="batch-2026-10">' +
        '<div class="acts"><button class="btn" data-x="no">取消</button><button class="btn primary" data-x="yes">生成</button></div>' +
        '<div class="codes" id="n-out"></div></div>';
      m.classList.remove("hidden");
      $('[data-x="no"]', m).onclick = function () { m.classList.add("hidden"); };
      $('[data-x="yes"]', m).onclick = function () {
        var n = Math.max(1, Math.min(500, parseInt($("#n-count", m).value, 10) || 20));
        $('[data-x="yes"]', m).disabled = true;
        rpc("admin_code_new", { p_token: token(), p_n: n, p_batch: $("#n-batch", m).value.trim() || null }).then(function (r) {
          $('[data-x="yes"]', m).disabled = false;
          if (!r.ok) { toast(r.message || "生成失败", "bad"); return; }
          $("#n-out", m).innerHTML = (r.codes || []).map(function (c) { return "<code>" + esc(c) + "</code>"; }).join("");
          toast("已生成 " + r.n + " 个（批次 " + r.batch + "）", "ok");
          pull();
        });
      };
    };
  }

  /* ================= 页面：用户额度 ================= */
  function pageProfiles(host) {
    host.innerHTML = toolbar([{ t: "search", id: "pf-kw", ph: "搜账号 ID / 昵称 / 分区" }, { t: "btn", id: "pf-go", label: "查询" }]) + '<div id="pf-body" class="loading">加载中</div>';
    var page = 1;
    function pull() {
      rpc("admin_profiles", { p_token: token(), p_page: page, p_size: 50, p_kw: $("#pf-kw", host).value.trim() }).then(function (d) {
        if (!d.ok) { $("#pf-body", host).className = "empty"; $("#pf-body", host).textContent = d.message || "加载失败"; return; }
        var st = d.stat || {};
        var rows = (d.rows || []).map(function (r) {
          return "<tr><td class='mono' style='font-size:11.5px'>" + esc(r.owner_id) + "</td>" +
            "<td>" + esc(r.owner_name || "—") + "</td><td><span class='tag b'>" + esc(SITE_NAME[r.scope] || r.scope) + "</span></td>" +
            "<td>" + nf(r.free_used) + "</td><td>" + nf(r.grace_used) + "</td><td>" + nf(r.bonus) + "</td>" +
            "<td>" + nf(r.total_redeemed) + "</td><td class='mono'>" + esc(r.last_use_date || "—") + "</td>" +
            "<td><button class='btn sm' data-o='" + esc(r.owner_id) + "' data-s='" + esc(r.scope) + "' data-f='bonus'>+10 次</button> " +
            "<button class='btn sm' data-o='" + esc(r.owner_id) + "' data-s='" + esc(r.scope) + "' data-f='free'>清已用</button></td></tr>";
        }).join("");
        $("#pf-body", host).className = "";
        $("#pf-body", host).innerHTML =
          '<div class="grid g4" style="margin-bottom:13px">' +
          kpi("账号总数", nf(st.all), "个") + kpi("兑换池余额", nf(st.bonus), "次") +
          kpi("近 7 日活跃", nf(st.active7), "个") +
          kpi("按分区", (d.scopes || []).length, "个") + "</div>" +
          '<div class="note">free_used / grace_used 是「已消耗的免费天数」，越小额度越多。<b>清已用</b>会把该账号在该分区的已用天数归零，等于重新给满 15 天免费 + 10 天宽限。</div>' +
          (rows ? '<div class="card"><div class="tblwrap"><table><thead><tr><th>账号 ID</th><th>昵称</th><th>分区</th><th>免费已用</th><th>宽限已用</th><th>兑换余额</th><th>累计核销</th><th>最后使用</th><th>操作</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
            pager(d.total, d.page, d.size, function (p) { page = p; pull(); }) + "</div>" : '<div class="empty">没有账号记录</div>');
        $$("[data-o]", host).forEach(function (b) {
          b.onclick = function () {
            var o = b.getAttribute("data-o"), sc = b.getAttribute("data-s"), f = b.getAttribute("data-f");
            var run = function () {
              rpc("admin_grant", { p_token: token(), p_owner: o, p_scope: sc, p_field: f, p_delta: 10 }).then(function (r) {
                if (!r.ok) { toast(r.message || "操作失败", "bad"); return; }
                toast(f === "bonus" ? "已赠送 100 次（+10 天额度）" : "已重置该账号已用天数", "ok"); pull();
              });
            };
            if (f === "bonus") run(); else confirmBox("重置该账号的已用天数？", "会把该账号在此分区的免费/宽限已用天数归零。", run, "重置");
          };
        });
      });
    }
    pull();
    $("#pf-go", host).onclick = function () { page = 1; pull(); };
    $("#pf-kw", host).onkeydown = function (e) { if (e.key === "Enter") { page = 1; pull(); } };
  }

  /* ================= 页面：安全与设置 ================= */
  function pageSec(host) {
    host.innerHTML = '<div class="loading">加载中</div>';
    Promise.all([
      rpc("admin_ip_rules", { p_token: token() }),
      rpc("admin_log", { p_token: token(), p_page: 1, p_size: 30 }),
      rpc("admin_overview", { p_token: token(), p_days: 1 })
    ]).then(function (rs) {
      var rules = rs[0].ok ? rs[0].rows : [], logs = rs[1].ok ? rs[1].rows : [], ov = rs[2].ok ? rs[2] : {};
      var trackOn = ov.track === "on";
      host.innerHTML =
        '<div class="card" style="margin-bottom:14px"><h3>🔍 访客 IP 自检</h3>' +
        '<div class="note">服务端记录的 IP 来自平台网关，样本显示它可能是<b>平台侧出口 IP</b>而不是访客真实 IP。为此后台同时从访客浏览器直连 ipip.net 取真实 IP 与归属地，两条都存。下面显示的就是<b>你这台设备</b>的公网 IP，可用来核对统计是否准确。</div>' +
        '<div class="kv" id="ip-self"><div class="k">浏览器公网 IP</div><div class="v">检测中…</div></div>' +
        '<div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">' +
        '<button class="btn" id="ip-again">重新检测</button>' +
        '<button class="btn" id="ip-trust">把我的 IP 加入白名单（不计入统计）</button>' +
        '<a class="btn" href="?nostat=1" id="ip-nostat">本机永久不统计</a>' +
        "</div></div>" +

        '<div class="card" style="margin-bottom:14px"><h3>📊 统计开关</h3>' +
        '<div class="note' + (trackOn ? "" : " warn") + '">当前状态：<b>' + (trackOn ? "已开启" : "已关闭") + "</b>。关闭后全站停止记录新访问（已有数据保留）。</div>" +
        '<button class="btn ' + (trackOn ? "danger" : "primary") + '" id="tk-btn">' + (trackOn ? "关闭统计" : "开启统计") + "</button></div>" +

        '<div class="card" style="margin-bottom:14px"><h3>🚫 IP 黑白名单 <em>支持完整 IP 或前缀（如 114.114.）</em></h3>' +
        '<div class="toolbar"><input id="ir-ip" placeholder="IP 或前缀" style="width:200px">' +
        '<select id="ir-kind"><option value="block">拉黑（拒绝记录）</option><option value="trust">加白（不统计自己）</option></select>' +
        '<input id="ir-note" placeholder="备注（选填）" style="width:180px">' +
        '<button class="btn" id="ir-add">添加</button></div>' +
        (rules.length ? '<div class="tblwrap"><table><thead><tr><th>IP</th><th>类型</th><th>备注</th><th>添加时间</th><th></th></tr></thead><tbody>' +
          rules.map(function (r) {
            return "<tr><td class='mono'>" + esc(r.ip) + "</td><td>" +
              (r.kind === "block" ? '<span class="tag r">黑名单</span>' : '<span class="tag g">白名单</span>') + "</td>" +
              "<td>" + esc(r.note || "—") + "</td><td class='mono'>" + esc(r.ts) + "</td>" +
              "<td><button class='btn sm' data-rm='" + esc(r.ip) + "'>移除</button></td></tr>";
          }).join("") + "</tbody></table></div>" : '<div class="empty">还没有规则</div>') +
        "</div>" +

        '<div class="card" style="margin-bottom:14px"><h3>🔑 修改管理员密码</h3>' +
        '<div class="toolbar"><input id="pw-old" type="password" placeholder="当前密码" style="width:180px">' +
        '<input id="pw-new" type="password" placeholder="新密码（≥8 位）" style="width:180px">' +
        '<input id="pw-new2" type="password" placeholder="重复新密码" style="width:180px">' +
        '<button class="btn primary" id="pw-go">修改</button></div>' +
        '<div class="note" style="margin:12px 0 0">改密成功后其它设备的登录会立即失效（当前设备保持登录）。</div></div>' +

        '<div class="card" style="margin-bottom:14px"><h3>🧹 数据清理</h3>' +
        '<div class="note">明细长期保留会越积越多。建议保留 180 天，更早的明细删掉（日趋势等汇总会随明细一并消失，请自行把握）。</div>' +
        '<div class="toolbar"><select id="pg-days"><option value="365">保留 1 年</option><option value="180" selected>保留 180 天</option>' +
        '<option value="90">保留 90 天</option><option value="30">保留 30 天</option></select>' +
        '<button class="btn danger" id="pg-go">清理更早的明细</button></div></div>' +

        '<div class="card"><h3>📜 操作审计 <em>最近 30 条</em></h3>' +
        (logs.length ? '<div class="tblwrap"><table><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>详情</th><th>IP</th></tr></thead><tbody>' +
          logs.map(function (r) {
            return "<tr><td class='mono'>" + esc(r.tm) + "</td><td>" + esc(r.username) + "</td>" +
              "<td><span class='tag'>" + esc(r.action) + "</span></td><td>" + esc(r.detail) + "</td><td class='mono'>" + esc(r.ip || "—") + "</td></tr>";
          }).join("") + "</tbody></table></div>" : '<div class="empty">暂无操作记录</div>') +
        "</div>";

      /* IP 自检 */
      function ipSelf() {
        var box = $("#ip-self", host);
        box.innerHTML = '<div class="k">浏览器公网 IP</div><div class="v">检测中…</div>';
        fetch("https://myip.ipip.net", { mode: "cors", cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
          var m = /IP\s*[：:]\s*([0-9a-fA-F:.]+)/.exec(t || ""), g = /来自于\s*[：:]\s*([^\n\r]+)/.exec(t || "");
          S.ip = m ? m[1] : "";
          S.ipRegion = g ? g[1].replace(/^\s*中国\s*/, "").replace(/\s+/g, " ").trim() : "";
          box.innerHTML = '<div class="k">浏览器公网 IP</div><div class="v mono">' + esc(S.ip || "获取失败") + "</div>" +
            '<div class="k">归属地</div><div class="v">' + esc(S.ipRegion || "—") + "</div>";
        }).catch(function () {
          box.innerHTML = '<div class="k">浏览器公网 IP</div><div class="v">检测失败（可能被网络策略拦截，不影响统计）</div>';
        });
      }
      ipSelf();
      $("#ip-again", host).onclick = ipSelf;
      $("#ip-trust", host).onclick = function () {
        if (!S.ip) { toast("还没拿到你的公网 IP", "bad"); return; }
        adminIp(S.ip, "trust", "站长本人");
      };
      $("#ip-nostat", host).onclick = function (e) {
        e.preventDefault();
        try { localStorage.setItem("zhz_nostat", "1"); } catch (er) {}
        toast("已在本机关闭统计（清除浏览器数据后失效）", "ok");
      };

      $("#tk-btn", host).onclick = function () {
        var next = trackOn ? "off" : "on";
        confirmBox(next === "off" ? "关闭访问统计？" : "开启访问统计？",
          next === "off" ? "全站将停止记录新访问，已有数据保留。" : "全站恢复记录访客访问。",
          function () {
            rpc("admin_track", { p_token: token(), p_on: next }).then(function (r) {
              if (!r.ok) { toast(r.message || "操作失败", "bad"); return; }
              toast(next === "on" ? "已开启统计" : "已关闭统计", "ok");
              pageSec(host);
            });
          }, next === "off" ? "关闭统计" : "开启统计");
      };

      $("#ir-add", host).onclick = function () {
        var ip = $("#ir-ip", host).value.trim();
        if (!ip) { toast("请填写 IP", "bad"); return; }
        adminIp(ip, $("#ir-kind", host).value, $("#ir-note", host).value.trim(), host);
      };
      $$("[data-rm]", host).forEach(function (b) {
        b.onclick = function () { adminIp(b.getAttribute("data-rm"), "none", "", host); };
      });

      $("#pw-go", host).onclick = function () {
        var o = $("#pw-old", host).value, n = $("#pw-new", host).value, n2 = $("#pw-new2", host).value;
        if (!o || !n) { toast("请填写完整", "bad"); return; }
        if (n.length < 8) { toast("新密码至少 8 位", "bad"); return; }
        if (n !== n2) { toast("两次输入的新密码不一致", "bad"); return; }
        rpc("admin_setpass", { p_token: token(), p_old: o, p_new: n }).then(function (r) {
          if (!r.ok) { toast(reasonText(r), "bad"); return; }
          toast("密码已修改", "ok");
          $("#pw-old", host).value = $("#pw-new", host).value = $("#pw-new2", host).value = "";
        });
      };

      $("#pg-go", host).onclick = function () {
        var d = +$("#pg-days", host).value;
        confirmBox("清理 " + d + " 天前的访问明细？", "删除后不可恢复，统计趋势会相应变化。", function () {
          rpc("admin_purge", { p_token: token(), p_days: d }).then(function (r) {
            if (!r.ok) { toast(r.message || "清理失败", "bad"); return; }
            toast("已清理 " + nf(r.deleted) + " 条明细", "ok");
            pageSec(host);
          });
        }, "确认清理");
      };
    });
  }
  function adminIp(ip, kind, note, reloadHost) {
    rpc("admin_ip_set", { p_token: token(), p_ip: ip, p_kind: kind, p_note: note || "" }).then(function (r) {
      if (!r.ok) { toast(r.message || "操作失败", "bad"); return; }
      toast(kind === "block" ? "已拉黑 " + ip : kind === "trust" ? "已加白 " + ip : "已移除规则", "ok");
      if (reloadHost) pageSec(reloadHost); else if (S.page === "sec") go("sec");
    });
  }

  /* ================= 公共控件 ================= */
  function toolbar(items) {
    return '<div class="toolbar">' + items.map(function (it) {
      if (it.t === "search") return '<input id="' + it.id + '" placeholder="' + esc(it.ph) + '" style="width:230px">';
      if (it.t === "days") return '<select id="' + it.id + '">' +
        [1, 7, 30, 90].map(function (d) { return '<option value="' + d + '"' + (d === S.days ? " selected" : "") + ">近 " + d + " 天</option>"; }).join("") + "</select>";
      if (it.t === "site") return '<select id="' + it.id + '"><option value="">全部板块</option>' +
        Object.keys(SITE_NAME).map(function (k) { return '<option value="' + k + '">' + esc(SITE_NAME[k]) + "</option>"; }).join("") + "</select>";
      if (it.t === "btn") return '<button class="btn' + (it.primary ? " primary" : "") + '" id="' + it.id + '">' + esc(it.label) + "</button>";
      return "";
    }).join("") + '<span class="sp"></span></div>';
  }
  function pager(total, page, size, onGo) {
    var pages = Math.max(1, Math.ceil((total || 0) / (size || 50)));
    if (pages <= 1) return '<div class="pager">共 ' + nf(total || 0) + " 条</div>";
    return '<div class="pager"><span>共 ' + nf(total) + " 条 ・ 第 " + page + "/" + pages + ' 页</span><span class="sp"></span>' +
      '<button class="btn sm" data-pg="1"' + (page <= 1 ? " disabled" : "") + ">首页</button>" +
      '<button class="btn sm" data-pg="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + ">上一页</button>" +
      '<button class="btn sm" data-pg="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") + ">下一页</button>" +
      '<button class="btn sm" data-pg="' + pages + '"' + (page >= pages ? " disabled" : "") + ">末页</button></div>" +
      (function () { setTimeout(function () { $$("[data-pg]").forEach(function (b) { b.onclick = function () { onGo(+b.getAttribute("data-pg")); }; }); }, 0); return ""; })();
  }

  /* ================= 路由 ================= */
  var PAGES = {
    overview: { n: "📊 概览", f: pageOverview },
    live: { n: "📡 实时", f: pageLive },
    ips: { n: "🌐 访客 IP", f: pageIps },
    visits: { n: "📄 访问明细", f: pageVisits },
    msgs: { n: "💬 留言", f: pageMsgs },
    codes: { n: "🎫 兑换码", f: pageCodes },
    profiles: { n: "👤 用户额度", f: pageProfiles },
    sec: { n: "⚙️ 安全与设置", f: pageSec }
  };
  function go(page) {
    S.page = page;
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    $$("nav.tabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-p") === page); });
    var host = $("#content");
    host.innerHTML = '<div class="loading">加载中</div>';
    try { PAGES[page].f(host); } catch (e) { host.innerHTML = '<div class="empty">页面出错：' + esc(e.message) + "</div>"; }
  }

  /* ================= 启动 ================= */
  function init() {
    var nav = $("#tabs");
    nav.innerHTML = Object.keys(PAGES).map(function (k) {
      return '<button data-p="' + k + '">' + PAGES[k].n + "</button>";
    }).join("");
    $$("nav.tabs button").forEach(function (b) {
      b.onclick = function () { go(b.getAttribute("data-p")); };
    });
    $("#lg-btn").onclick = doLogin;
    $("#lg-pass").onkeydown = function (e) { if (e.key === "Enter") doLogin(); };
    $("#lg-user").onkeydown = function (e) { if (e.key === "Enter") $("#lg-pass").focus(); };
    $("#btn-out").onclick = function () { logout(false); };

    /* 天数切换 */
    $("#day-sel").innerHTML = [1, 7, 30, 90].map(function (d) { return '<option value="' + d + '"' + (d === 7 ? " selected" : "") + ">近 " + d + " 天</option>"; }).join("");
    $("#day-sel").onchange = function () { S.days = +this.value; if (S.page === "overview") go("overview"); };

    var t = token();
    if (!t) { $("#login").classList.remove("hidden"); return; }
    $("#login").classList.add("hidden");
    ensureBridge();
    rpc("admin_check", { p_token: t }).then(function (d) {
      if (d.ok) {
        $("#who").textContent = d.user;
        enterApp();
      } else {
        setToken("");
        $("#login").classList.remove("hidden");
        var le = $("#lg-err");
        if (le) le.textContent = "登录状态已失效，请重新登录。";
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, false);
  else init();
})();
