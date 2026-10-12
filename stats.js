/* ============================================================
   知作坊 · 全站访问统计打点（/stats.js）
   ------------------------------------------------------------
   全站引入一次即可（<script src="/stats.js" defer></script>）。

   架构说明：
     · 云端数据面只放行门卫域（zhizuofang.app.workbuddy.host），
       dq7866.online 直连会被 CORS 拦，所以这里起一个隐藏 iframe
       （门卫域的 bridge.html）做代理，用 postMessage 通信。
     · 服务端能拿到 x-forwarded-for，但实测那是平台侧出口 IP，
       不一定等于访客真实 IP；因此这里同时直连 https://myip.ipip.net
       取访客公网 IP 与省市运营商，两条通道都记，后台可对照。
     · 任何一步失败都静默跳过——统计绝不影响访客正常浏览。

   排除规则（自身不打点）：
     · file:// 打开（离线包）
     · 后台页面 /admin/**
     · 本地标记 zhz_nostat=1；访问任意页面加 ?nostat=1 即写入该标记
     · 浏览器开启 Do Not Track
   ============================================================ */
(function () {
  "use strict";
  if (window.__ZHZ_STATS) return;
  window.__ZHZ_STATS = 1;

  try {
    if (window.ZHZ_NO_STATS) return;
    if (location.protocol === "file:") return;
    if (/^\/admin(\/|$)/.test(location.pathname)) return;

    if (/[?&]nostat=1/.test(location.search)) {
      try { localStorage.setItem("zhz_nostat", "1"); } catch (e) {}
      return;
    }
    try { if (localStorage.getItem("zhz_nostat") === "1") return; } catch (e) {}
    if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

    var ORIGIN = "https://zhizuofang.app.workbuddy.host";
    var IS_DEV = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
    var BRIDGE = ORIGIN + "/bridge.html" + (IS_DEV ? "?dev=1" : "");

    /* ---------------- 本地存储小工具 ---------------- */
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

    function rnd(n) {
      var s = "", c = "abcdefghijkmnpqrstuvwxyz23456789";
      for (var i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length));
      return s;
    }

    /* ---------------- 访客标识 ---------------- */
    var vid = lsGet("zhz_vid");
    if (!vid || vid.length < 8) { vid = "v" + rnd(14); lsSet("zhz_vid", vid); }

    var sid = ssGet("zhz_sid"), sAt = parseInt(ssGet("zhz_sid_t") || "0", 10);
    if (!sid || !sAt || (Date.now() - sAt) > 1800000) { sid = "s" + rnd(12); ssSet("zhz_sid", sid); }
    ssSet("zhz_sid_t", String(Date.now()));

    /* ---------------- 页面归属 ---------------- */
    var KNOWN = ["bike", "guardian", "board", "games", "edu", "toolbox", "forest", "symbolpass"];
    function siteOf(p) {
      var seg = String(p || "").replace(/^\/+/, "").split("/")[0].toLowerCase();
      if (KNOWN.indexOf(seg) >= 0) return seg;
      if (seg === "" || seg === "index.html") return "home";
      if (seg === "tags" || seg === "categories" || seg === "archives" || seg === "page") return "blog";
      if (/^\d{4}$/.test(seg)) return "blog";
      return seg.slice(0, 24) || "home";
    }

    var payload = {
      visitor: vid,
      sess: sid,
      path: (location.pathname || "/") + (location.search || ""),
      site: siteOf(location.pathname),
      ref: document.referrer || "",
      ua: navigator.userAgent || "",
      scr: (screen && screen.width) ? (screen.width + "x" + screen.height) : "",
      lang: navigator.language || ""
    };

    /* ---------------- 桥接：发消息 / 收回复 ---------------- */
    var frame = null, frameReady = false, seq = 0, pending = {};

    function ensureBridge() {
      if (frame) return;
      try {
        frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        frame.setAttribute("tabindex", "-1");
        frame.title = "stats-bridge";
        frame.style.cssText = "position:absolute;width:0;height:0;border:0;left:-9999px;top:0;";
        frame.onload = function () { frameReady = true; sendAll(); };
        frame.src = BRIDGE;
        (document.body || document.documentElement).appendChild(frame);
      } catch (e) { frame = null; }
    }

    function sendAll() {
      if (!frame || !frameReady || !frame.contentWindow) return;
      Object.keys(pending).forEach(function (k) {
        var it = pending[k];
        try {
          frame.contentWindow.postMessage({
            type: "zhz:rpc", fn: it.fn, args: it.args, scope: "stats", seq: Number(k)
          }, ORIGIN);
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
      if (it.cb) { try { it.cb(d); } catch (e) {} }
    });

    function call(fn, args, cb) {
      ensureBridge();
      var s = ++seq;
      var timer = setTimeout(function () { delete pending[s]; if (cb) cb(null); }, 9000);
      pending[s] = { fn: fn, args: args, cb: cb, timer: timer };
      sendAll();
    }

    /* ---------------- 取访客公网 IP 与归属地 ---------------- */
    /* ipip.net 支持 CORS，返回形如：
       当前 IP：112.101.105.241  来自于：中国 黑龙江 大庆  电信 */
    function fetchIp(cb) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; cb(null); } }, 2500);
      try {
        fetch("https://myip.ipip.net", { mode: "cors", cache: "no-store" })
          .then(function (r) { return r.text(); })
          .then(function (txt) {
            if (done) return;
            done = true; clearTimeout(t);
            var m = /IP\s*[：:]\s*([0-9a-fA-F:.]+)/.exec(txt || "");
            var g = /来自于\s*[：:]\s*([^\n\r]+)/.exec(txt || "");
            var region = g ? g[1].replace(/^\s*中国\s*/, "").replace(/\s+/g, " ").trim() : "";
            if (!m && !region) { cb(null); return; }
            cb({ ip: m ? m[1] : "", region: region });
          })
          .catch(function () { if (!done) { done = true; clearTimeout(t); cb(null); } });
      } catch (e) { if (!done) { done = true; clearTimeout(t); cb(null); } }
    }

    /* ---------------- 主流程 ---------------- */
    var visitId = null, ipRetried = false;

    /* ipip.net 偶发超时会让这次访问没有真实 IP。云端此时只回 ip_known:false
       （不会拿平台网关 IP 顶替），这里补一次重试，拿到就回填。 */
    function backfillIp(id) {
      if (ipRetried || payload.ip) return;
      ipRetried = true;
      setTimeout(function () {
        fetchIp(function (info) {
          if (!info || !info.ip) return;
          call("visit_ip", { p_id: id, p_ip: info.ip, p_region: info.region || "" }, null);
        });
      }, 2500);
    }

    function boot() {
      try { ensureBridge(); } catch (e) {}
      fetchIp(function (info) {
        if (info) {
          if (info.ip) payload.ip = info.ip;
          if (info.region) payload.region = info.region;
        }
        call("visit_log", { p: payload }, function (res) {
          try {
            var d = res && res.data;
            if (!d || !d.ok) return;
            if (d.id) { visitId = d.id; heartOn(); }
            if (d.ip_known === false && d.id) backfillIp(d.id);
          } catch (e) {}
        });
      });
    }

    /* ---------------- 停留时长 ----------------
       只在 pagehide 上报是不行的：那一刻 iframe 随父页一起销毁，fetch 会被
       浏览器掐断，实测真实访客的停留时长几乎全丢。所以改成心跳：
         · 每 20 秒上报一次「累计可见时长」，云端只取最大值（单调不回退）
         · 切到后台立刻上报并停表，切回来继续计时
         · pagehide 再补一次
       最坏情况只丢最后 20 秒。 */
    var HEART_MS = 20000, heartTimer = null, stayAcc = 0, visAt = Date.now();

    function staySec() {
      var t = stayAcc;
      if (document.visibilityState !== "hidden") t += (Date.now() - visAt) / 1000;
      t = Math.round(t);
      if (t < 1) t = 1;
      if (t > 7200) t = 7200;
      return t;
    }
    function sendStay() {
      if (!visitId) return;
      var s = staySec();
      call("visit_stay", { p_id: visitId, p_sec: s }, null);
      if (s >= 7200) heartOff();   /* 已到 2 小时上限，不必再上报 */
    }
    function heartOff() { if (heartTimer) { clearInterval(heartTimer); heartTimer = null; } }
    function heartOn() { heartOff(); if (visitId) heartTimer = setInterval(sendStay, HEART_MS); }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        stayAcc += (Date.now() - visAt) / 1000;
        sendStay();
        heartOff();
      } else {
        visAt = Date.now();
        heartOn();
      }
    }, false);
    window.addEventListener("pagehide", sendStay, false);

    function start() { setTimeout(boot, 600); }

    if (document.readyState === "complete" || document.readyState === "interactive") {
      start();
    } else {
      document.addEventListener("DOMContentLoaded", start, false);
    }
  } catch (e) { /* 统计失败绝不影响页面 */ }
})();
