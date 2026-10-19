/* ============================================================
   知作坊 · 云端通道客户端（/zhz/cloud.js）
   ------------------------------------------------------------
   为什么需要它：
     云端数据面只放行门卫域（zhizuofang.app.workbuddy.host）的请求，
     dq7866.online 直连会被浏览器 CORS 拒绝。因此这里放一个隐藏
     iframe（门卫域的 bridge.html），把调用代理过去，用 postMessage 通信。

   用法：
     ZHZ.call({ type: "msg:list", limit: 50 }).then(function (r) { ... })
     ZHZ.call({ type: "msg:post", nickname, content, device }).then(...)
   ============================================================ */
(function () {
  "use strict";

  if (window.ZHZ) return;

  var ORIGIN = "https://zhizuofang.app.workbuddy.host";
  var IS_DEV = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var ALLOWED = [ORIGIN];
  if (IS_DEV) ALLOWED.push(location.origin);

  var iframe = null;
  var ready = false;
  var seq = 0;
  var pending = {};
  var helloTimer = null;

  function boot() {
    if (iframe) return;
    iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.title = "cloud-bridge";
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0;left:-9999px;top:0;";
    iframe.src = ORIGIN + "/bridge.html" + (IS_DEV ? "?dev=1" : "");

    var holder = document.body || document.documentElement;
    holder.appendChild(iframe);

    var tries = 0;
    helloTimer = setInterval(function () {
      if (ready || ++tries > 25) {
        clearInterval(helloTimer);
        return;
      }
      try {
        iframe.contentWindow.postMessage({ type: "gate:hello" }, ORIGIN);
      } catch (e) {}
    }, 600);
  }

  window.addEventListener("message", function (ev) {
    if (ALLOWED.indexOf(ev.origin) < 0) return;
    var d = ev.data;
    if (!d || typeof d !== "object" || !d.type) return;

    if (d.type === "gate:ready") {
      ready = true;
      if (helloTimer) clearInterval(helloTimer);
      return;
    }

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
      var waited = 0;

      (function waitReady() {
        if (ready) {
          send();
          return;
        }
        if (waited >= 15000) {
          resolve({ type: "zhz:timeout", ok: false, message: "云端通道连接超时" });
          return;
        }
        waited += 250;
        setTimeout(waitReady, 250);
      })();

      function send() {
        seq += 1;
        msg.seq = seq;
        pending[seq] = {
          resolve: resolve,
          timer: setTimeout(function () {
            if (pending[seq]) {
              delete pending[seq];
              resolve({ type: "zhz:timeout", ok: false, message: "云端响应超时，请刷新重试" });
            }
          }, timeoutMs || 18000)
        };
        try {
          iframe.contentWindow.postMessage(msg, ORIGIN);
        } catch (e) {
          delete pending[seq];
          resolve({ type: "zhz:error", ok: false, message: "无法连接云端通道" });
        }
      }
    });
  }

  window.ZHZ = {
    call: call,
    origin: ORIGIN
  };
})();
