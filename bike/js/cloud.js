/* ============================================================
   风驰骑行 · 云端通道（/bike/js/cloud.js）
   ------------------------------------------------------------
   云端数据面只放行门卫域（zhizuofang.app.workbuddy.host），
   dq7866.online 直连会被 CORS 拦住。所以这里放一个隐藏 iframe
   （门卫域的 bridge.html）做代理，用 postMessage 通信。
   离线 / 断网 / 通道不可用时，全部调用会失败返回，
   游戏本身照常可玩（只是排行榜与幽灵车用不了）。
   ============================================================ */
(function () {
  "use strict";
  if (window.BikeCloud) return;

  var ORIGIN = "https://zhizuofang.app.workbuddy.host";
  var IS_DEV = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var ALLOWED = [ORIGIN];
  if (IS_DEV) ALLOWED.push(location.origin);

  var iframe = null, ready = false, seq = 0, pending = {}, helloTimer = null, failed = false;

  function boot() {
    if (iframe || failed) return;
    try {
      iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      iframe.title = "cloud-bridge";
      iframe.style.cssText = "position:absolute;width:0;height:0;border:0;left:-9999px;top:0;";
      iframe.src = ORIGIN + "/bridge.html" + (IS_DEV ? "?dev=1" : "");
      (document.body || document.documentElement).appendChild(iframe);
    } catch (e) { failed = true; return; }

    var tries = 0;
    helloTimer = setInterval(function () {
      if (ready || ++tries > 20) { clearInterval(helloTimer); return; }
      try { iframe.contentWindow.postMessage({ type: "gate:hello" }, ORIGIN); } catch (e) {}
    }, 600);
  }

  window.addEventListener("message", function (ev) {
    if (ALLOWED.indexOf(ev.origin) < 0) return;
    var d = ev.data;
    if (!d || typeof d !== "object" || !d.type) return;
    if (d.type === "gate:ready") { ready = true; if (helloTimer) clearInterval(helloTimer); return; }
    if (d.seq && pending[d.seq]) {
      var slot = pending[d.seq];
      delete pending[d.seq];
      clearTimeout(slot.timer);
      slot.resolve(d);
    }
  });

  function call(msg, timeoutMs) {
    boot();
    return new Promise(function (resolve) {
      if (failed) { resolve({ ok: false, offline: true, message: "云端通道不可用" }); return; }
      var waited = 0;
      (function waitReady() {
        if (ready) { send(); return; }
        if (waited >= 6000) { resolve({ ok: false, offline: true, message: "云端通道连接超时" }); return; }
        waited += 200;
        setTimeout(waitReady, 200);
      })();
      function send() {
        seq += 1;
        msg.seq = seq;
        pending[seq] = {
          resolve: resolve,
          timer: setTimeout(function () {
            if (pending[seq]) { delete pending[seq]; resolve({ ok: false, offline: true, message: "云端响应超时" }); }
          }, timeoutMs || 12000)
        };
        try { iframe.contentWindow.postMessage(msg, ORIGIN); }
        catch (e) { delete pending[seq]; resolve({ ok: false, offline: true, message: "无法连接云端" }); }
      }
    });
  }

  function enc(s) { return encodeURIComponent(String(s == null ? "" : s)); }

  window.BikeCloud = {
    ready: function () { return ready; },
    call: call,

    /* 排行榜 */
    leaderboard: function (track, limit) {
      return call({ type: "bike:lb", track: track, limit: limit || 20 });
    },
    /* 上传成绩（+幽灵轨迹） */
    submit: function (o) {
      return call({
        type: "bike:submit", player: o.player, nick: o.nick, track: o.track,
        timeMs: o.timeMs, coins: o.coins, trick: o.trick, bike: o.bike, ghost: o.ghost
      });
    },
    /* 取一辆幽灵车（nearMs>0 时挑最接近你水平的对手） */
    ghost: function (track, nearMs) {
      return call({ type: "bike:ghost", track: track, nearMs: nearMs || 0 });
    },
    /* 云存档 */
    save: function (player, data) { return call({ type: "bike:save", player: player, data: data }); },
    load: function (player) { return call({ type: "bike:load", player: player }); },

    /* 赛季：累加积分 / 赛季榜 */
    seasonAdd: function (season, player, nick, points) {
      return call({ type: "bike:season", season: season, player: player, nick: nick, points: points });
    },
    seasonLb: function (season, limit) {
      return call({ type: "bike:seasonlb", season: season, limit: limit || 20 });
    }
  };
})();
