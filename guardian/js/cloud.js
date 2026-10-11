/* ============================================================
   冰火守门人 —— 云端通道（/guardian/js/cloud.js）
   ------------------------------------------------------------
   云端数据面只放行门卫域，dq7866.online 直连会被 CORS 拦下，
   因此这里用隐藏 iframe（门卫域 bridge.html）做 postMessage 代理。
   通道不可用时全部调用失败返回，游戏本体照常可玩（离线友好）。
   ============================================================ */
var GkCloud = (function () {
  "use strict";
  if (window.GkCloud) return window.GkCloud;

  var ORIGIN = "https://zhizuofang.app.workbuddy.host";
  var IS_DEV = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var ALLOWED = [ORIGIN];
  if (IS_DEV) ALLOWED.push(location.origin);

  /* 本页属于冰火守门人：门卫按站点隔离登录与额度，要报上门牌号 */
  var SCOPE = "guardian";

  var iframe = null, ready = false, seq = 0, pending = {}, helloTimer = null, failed = false;

  function boot() {
    if (iframe || failed) return;
    /* 页面已加载全站门卫（/gate.js）时复用它那条已登录通道，避免双份会话 */
    if (window.ZHZBridge && typeof window.ZHZBridge.call === "function") { ready = true; return; }
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
      try { iframe.contentWindow.postMessage({ type: "gate:hello", scope: SCOPE }, ORIGIN); } catch (e) {}
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
    if (window.ZHZBridge && typeof window.ZHZBridge.call === "function") {
      return window.ZHZBridge.call(msg, timeoutMs);
    }
    boot();
    return new Promise(function (resolve) {
      if (failed) { resolve({ ok: false, offline: true, message: "云端通道不可用" }); return; }
      var waited = 0;
      (function waitReady() {
        if (ready) { send(); return; }
        if (waited >= 8000) { resolve({ ok: false, offline: true, message: "云端通道连接超时" }); return; }
        waited += 200;
        setTimeout(waitReady, 200);
      })();
      function send() {
        seq += 1;
        msg.seq = seq;
        if (msg.scope === undefined) msg.scope = SCOPE;
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

  window.GkCloud = {
    ready: function () { return ready; },
    online: function () { return !failed; },
    call: call,

    /* 排行榜 / 成绩 */
    lb: function (mode, limit) { return call({ type: "gk:lb", mode: mode, limit: limit || 20 }); },
    submit: function (o) {
      return call({ type: "gk:submit", mode: o.mode, player: o.player, nick: o.nick,
                    score: o.score, wave: o.wave, grade: o.grade });
    },
    /* 云存档 */
    save: function (player, data) { return call({ type: "gk:save", player: player, data: data }); },
    load: function (player) { return call({ type: "gk:load", player: player }); },
    /* 赛季 */
    seasonAdd: function (season, player, nick, points) {
      return call({ type: "gk:season", season: season, player: player, nick: nick, points: points });
    },
    seasonLb: function (season, limit) { return call({ type: "gk:seasonlb", season: season, limit: limit || 20 }); },
    /* 对战房间 */
    roomCreate: function (player, nick) { return call({ type: "gk:roomcreate", player: player, nick: nick }); },
    roomJoin: function (code, player, nick) { return call({ type: "gk:roomjoin", code: code, player: player, nick: nick }); },
    roomSync: function (o) {
      return call({ type: "gk:roomsync", code: o.code, player: o.player, state: o.state, hp: o.hp, since: o.since }, 8000);
    },
    roomLeave: function (code, player) { return call({ type: "gk:roomleave", code: code, player: player }, 6000); },
    eventPush: function (code, player, kind, payload) {
      return call({ type: "gk:eventpush", code: code, player: player, kind: kind, payload: payload }, 6000);
    }
  };
  return window.GkCloud;
})();
