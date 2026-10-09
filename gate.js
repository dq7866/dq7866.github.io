/* 知作坊 · 全站门卫 v1.0
 * 原理：本页注入隐藏 iframe（门卫域 bridge.html），所有云端调用在 iframe 内完成；
 * 本脚本只做 UI（Shadow DOM 隔离样式）与 postMessage 通信。
 * 规则：免费 15 天 → 宽限 10 天（每次登录提醒打赏）→ 兑换码（100 次/码）。
 * 计次单位：1 天 1 次（当天首次访问扣 1 次）。
 */
(function () {
  "use strict";
  if (window.__ZHZ_GATE__) return;
  window.__ZHZ_GATE__ = true;

  /* ---------------- 配置 ---------------- */
  var GATE_ORIGIN = "https://zhizuofang.app.workbuddy.host";
  var IS_DEV = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var BRIDGE_URL = GATE_ORIGIN + "/bridge.html" + (IS_DEV ? "?dev=1" : "");
  var QR_SRC = "/images/wechat-qr.jpg";
  var SITE = "https://dq7866.online";

  var FREE_DAYS = 15, GRACE_DAYS = 10, CODE_DAYS = 100, WECHAT_ID = "Huangld", PRICE = "3 元";
  var ALLOWED_ORIGINS = [GATE_ORIGIN];
  if (IS_DEV) ALLOWED_ORIGINS.push(location.origin);

  /* ---------------- 防闪烁遮罩 ---------------- */
  var veil = document.createElement("div");
  veil.style.cssText = "position:fixed;inset:0;z-index:2147483600;background:#faf6f1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;";
  veil.innerHTML =
    '<div style="width:52px;height:52px;border-radius:14px;background:#ff4d00;color:#fff;font-size:26px;font-weight:700;line-height:52px;text-align:center;">知</div>' +
    '<div style="font-size:13px;color:#8a8078;">正在打开知作坊…</div>';
  document.documentElement.appendChild(veil);

  /* ---------------- Shadow DOM 容器 ---------------- */
  var host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483610;pointer-events:none;";
  document.documentElement.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent = [
    "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}",
    ".layer{position:fixed;inset:0;pointer-events:auto}",
    ".dim{background:rgba(30,24,18,.55);display:flex;align-items:center;justify-content:center;padding:18px}",
    ".card{width:100%;max-width:400px;background:#fff;border:1px solid #ece5dd;border-radius:16px;padding:28px 24px;box-shadow:0 12px 40px rgba(40,25,10,.25);max-height:92vh;overflow:auto}",
    ".brand{display:flex;align-items:center;gap:10px;margin-bottom:14px}",
    ".logo{width:40px;height:40px;border-radius:11px;background:#ff4d00;color:#fff;font-size:20px;font-weight:700;line-height:40px;text-align:center;flex:0 0 40px}",
    ".brand h2{font-size:17px;color:#26221e}.brand p{font-size:12px;color:#8a8078;margin-top:2px}",
    ".lead{font-size:14px;color:#4a4238;line-height:1.7;margin-bottom:14px}",
    ".field{margin-bottom:10px}.row{display:flex;gap:8px}",
    "input{width:100%;padding:11px 12px;font-size:15px;border:1px solid #ece5dd;border-radius:10px;outline:none;background:#fffdfb;color:#26221e}",
    "input:focus{border-color:#ff4d00}",
    ".btn-code{flex:0 0 110px;border:1px solid #ff4d00;background:#fff4ee;color:#ff4d00;border-radius:10px;font-size:13px;cursor:pointer}",
    ".btn-code:disabled{border-color:#ece5dd;background:#f6f2ee;color:#b9b0a7;cursor:not-allowed}",
    ".btn-main{width:100%;padding:12px;font-size:15px;font-weight:600;color:#fff;background:#ff4d00;border:none;border-radius:10px;cursor:pointer}",
    ".btn-main:disabled{opacity:.55;cursor:not-allowed}",
    ".btn-ghost{width:100%;padding:10px;font-size:14px;color:#6b6157;background:#f6f2ee;border:none;border-radius:10px;cursor:pointer;margin-top:8px}",
    ".err{color:#d43f2f;font-size:13px;min-height:17px;margin:4px 0;text-align:center}",
    ".tip{font-size:12px;color:#8a8078;line-height:1.7;margin-top:12px;text-align:center}",
    ".qr{display:block;width:190px;height:190px;margin:6px auto 8px;border:1px solid #ece5dd;border-radius:10px}",
    ".center{text-align:center}",
    ".wxid{display:inline-block;background:#f6f2ee;border-radius:8px;padding:2px 10px;font-weight:700;color:#26221e}",
    ".divider{display:flex;align-items:center;gap:10px;color:#c8bfb5;font-size:12px;margin:14px 0 10px}",
    ".divider::before,.divider::after{content:'';flex:1;height:1px;background:#ece5dd}",
    /* 角标 */
    ".badge{position:fixed;right:14px;bottom:14px;pointer-events:auto;background:rgba(38,34,30,.88);color:#fff;font-size:12px;padding:7px 12px;border-radius:999px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);line-height:1.4}",
    ".badge b{color:#ffb499}",
    ".panel{position:fixed;right:14px;bottom:52px;width:280px;background:#fff;border:1px solid #ece5dd;border-radius:14px;padding:16px;box-shadow:0 10px 30px rgba(40,25,10,.2);pointer-events:auto}",
    ".panel h3{font-size:14px;margin-bottom:8px;color:#26221e}",
    ".panel .meta{font-size:12px;color:#8a8078;line-height:1.8;margin-bottom:10px}",
    ".btn-mini{padding:8px 12px;font-size:13px;border-radius:8px;border:1px solid #ece5dd;background:#f6f2ee;color:#4a4238;cursor:pointer}",
    ".btn-mini.red{color:#d43f2f;border-color:#f0cfc9;background:#fdf3f1}"
  ].join("\n");
  root.appendChild(style);

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------- 与桥接页通信 ---------------- */
  var iframe = document.createElement("iframe");
  iframe.style.cssText = "display:none;width:0;height:0;border:0;";
  iframe.src = BRIDGE_URL;
  (document.body || document.documentElement).appendChild(iframe);

  var ready = false, seq = 0, pendingReplies = {};
  function bridge(msg) {
    return new Promise(function (resolve) {
      if (!ready) { resolve({ type: "gate:error", message: "门卫通道未就绪" }); return; }
      msg.seq = ++seq;
      pendingReplies[msg.seq] = resolve;
      iframe.contentWindow.postMessage(msg, GATE_ORIGIN);
      setTimeout(function () {
        if (pendingReplies[msg.seq]) { delete pendingReplies[msg.seq]; resolve({ type: "gate:error", message: "连接超时，请检查网络后刷新" }); }
      }, 15000);
    });
  }
  window.addEventListener("message", function (ev) {
    if (ALLOWED_ORIGINS.indexOf(ev.origin) < 0) return;
    var d = ev.data;
    if (!d || typeof d !== "object" || !d.type) return;
    if (d.type === "gate:ready") {
      if (!ready) { ready = true; onReady(); }
      return;
    }
    if (d.seq && pendingReplies[d.seq]) {
      var fn = pendingReplies[d.seq];
      delete pendingReplies[d.seq];
      fn(d);
    }
  });
  /* ready 前重试握手 */
  var helloTries = 0;
  var helloTimer = setInterval(function () {
    if (ready || ++helloTries > 20) { clearInterval(helloTimer); return; }
    try { iframe.contentWindow.postMessage({ type: "gate:hello" }, GATE_ORIGIN); } catch (e) {}
  }, 700);

  /* ---------------- UI 构建 ---------------- */
  function fullLayer(content, dim) {
    var layer = el("div", "layer" + (dim ? " dim" : ""));
    layer.style.background = dim ? "" : "#faf6f1";
    layer.appendChild(content);
    root.appendChild(layer);
    return layer;
  }

  /* 登录卡 */
  function buildLoginCard() {
    var card = el("div", "card");
    card.innerHTML =
      '<div class="brand"><div class="logo">知</div><div><h2>知作坊</h2><p>dq7866.online</p></div></div>' +
      '<p class="lead">登录后继续访问。新手机号自动注册：注册即送 <b>' + FREE_DAYS + '</b> 天免费 + <b>' + GRACE_DAYS + '</b> 天宽限；宽限用完后，微信打赏 ' + PRICE + ' 领兑换码可再解锁 <b>' + CODE_DAYS + '</b> 次。</p>' +
      '<div class="field row"><input id="zhz-phone" type="tel" maxlength="11" inputmode="numeric" placeholder="手机号（11 位）"><button id="zhz-send" class="btn-code" type="button">获取验证码</button></div>' +
      '<div class="field"><input id="zhz-code" type="text" maxlength="6" inputmode="numeric" placeholder="短信验证码"></div>' +
      '<div class="err" id="zhz-err"></div>' +
      '<button id="zhz-login" class="btn-main" type="button">登录 / 注册</button>' +
      '<p class="tip">登录状态保存在云端，换设备不丢失</p>';
    return card;
  }

  function showLogin() {
    veil.style.display = "none";
    if (loginLayer) return;
    var card = buildLoginCard();
    loginLayer = fullLayer(card, true);

    var pending = null, timer = null;
    var $ = function (id) { return card.querySelector("#" + id); };
    function showErr(m) { $("zhz-err").textContent = m || ""; }

    $("zhz-send").onclick = async function () {
      var phone = $("zhz-phone").value.trim();
      if (!/^1\d{10}$/.test(phone)) { showErr("请输入正确的 11 位手机号"); return; }
      showErr("");
      var btn = this; btn.disabled = true; btn.textContent = "发送中…";
      var r = await bridge({ type: "gate:send-otp", phone: phone });
      if (!r || r.type !== "gate:otp-sent" || !r.ok) {
        showErr((r && r.message) || "验证码发送失败");
        btn.disabled = false; btn.textContent = "获取验证码"; return;
      }
      pending = { phone: phone, verificationId: r.verificationId, isExistingUser: r.isExistingUser };
      var left = 60;
      btn.textContent = left + " s";
      timer = setInterval(function () {
        left--;
        if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = "重新发送"; }
        else btn.textContent = left + " s";
      }, 1000);
    };
    $("zhz-login").onclick = async function () {
      var phone = $("zhz-phone").value.trim();
      var code = $("zhz-code").value.trim();
      if (!pending || pending.phone !== phone) { showErr("请先获取验证码"); return; }
      if (!code) { showErr("请输入短信验证码"); return; }
      showErr("");
      var btn = this; btn.disabled = true; btn.textContent = "验证中…";
      var r = await bridge({ type: "gate:verify-otp", phone: pending.phone, verificationId: pending.verificationId, isExistingUser: pending.isExistingUser, token: code });
      if (!r || r.type !== "gate:otp-verified" || !r.ok) {
        showErr((r && r.message) || "验证码不正确");
        btn.disabled = false; btn.textContent = "登录 / 注册"; return;
      }
      removeLayer(loginLayer); loginLayer = null;
      requestStatus();
    };
  }
  var loginLayer = null;
  function removeLayer(l) { if (l && l.parentNode) l.parentNode.removeChild(l); }

  /* 打赏/兑换卡（grace 可关闭；exhausted 不可关） */
  function buildPayCard(remainingText) {
    var card = el("div", "card");
    card.innerHTML =
      '<div class="brand"><div class="logo">知</div><div><h2>' + (remainingText || "支持一下") + '</h2><p>dq7866.online</p></div></div>' +
      '<p class="lead">免费体验已用完。如果这些内容对你有帮助，欢迎微信打赏 <b>' + PRICE + '</b>，即可领取兑换码、再解锁 <b>' + CODE_DAYS + '</b> 次使用（1 天 = 1 次）。</p>' +
      '<img class="qr" src="' + QR_SRC + '" alt="微信二维码">' +
      '<p class="center" style="font-size:13px;color:#4a4238">微信扫码添加：<span class="wxid">' + WECHAT_ID + '</span></p>' +
      '<div class="divider">已有兑换码</div>' +
      '<div class="field"><input id="zhz-redeem" type="text" maxlength="20" placeholder="输入兑换码，如 XXXX-XXXX-XXXX"></div>' +
      '<div class="err" id="zhz-err2"></div>' +
      '<button id="zhz-go" class="btn-main" type="button">兑换并继续</button>' +
      (remainingText ? '<button id="zhz-later" class="btn-ghost" type="button">暂不，继续浏览</button>' : '<button id="zhz-out" class="btn-ghost" type="button">退出登录</button>');
    return card;
  }

  function wireRedeem(card, onOk) {
    var input = card.querySelector("#zhz-redeem");
    var btn = card.querySelector("#zhz-go");
    var err = card.querySelector("#zhz-err2");
    btn.onclick = async function () {
      var code = input.value.trim();
      if (!code) { err.textContent = "请输入兑换码"; return; }
      btn.disabled = true; btn.textContent = "核销中…"; err.textContent = "";
      var r = await bridge({ type: "gate:redeem", code: code });
      btn.disabled = false; btn.textContent = "兑换并继续";
      if (!r || r.type !== "gate:redeem") { err.textContent = (r && r.message) || "核销失败"; return; }
      if (r.ok) { err.textContent = ""; onOk(r.bonus); }
      else if (r.reason === "bad_format") err.textContent = "兑换码格式不对（应为 12 位字母数字）";
      else if (r.reason === "invalid_or_used") err.textContent = "兑换码不存在或已被使用";
      else if (r.reason === "unauthenticated") err.textContent = "登录状态已失效，请刷新页面重新登录";
      else err.textContent = "核销失败，请稍后再试";
    };
  }

  var payLayer = null;
  function showGrace(graceLeft, bonus) {
    var text = "宽限第 " + (GRACE_DAYS - graceLeft + 1) + " / " + GRACE_DAYS + " 天";
    if (bonus > 0) text = "剩余 " + bonus + " 次";
    var card = buildPayCard(text);
    card.querySelector("#zhz-later").textContent = "暂不，继续浏览（宽限剩 " + graceLeft + " 天）";
    payLayer = fullLayer(card, true);
    card.querySelector("#zhz-later").onclick = function () { removeLayer(payLayer); payLayer = null; };
    wireRedeem(card, function (bonus) { removeLayer(payLayer); payLayer = null; requestStatus(); });
  }

  function showExhausted() {
    var card = buildPayCard("免费额度已用完");
    payLayer = fullLayer(card, true);
    card.querySelector("#zhz-out").onclick = doSignOut;
    wireRedeem(card, function () { removeLayer(payLayer); payLayer = null; requestStatus(); });
  }

  /* 角标 + 管理小面板 */
  var badge = null, panel = null, lastState = null;
  function showBadge(st) {
    lastState = st;
    var label = "";
    if (st.state === "free") label = "免费剩 <b>" + st.freeLeft + "</b> 天";
    else if (st.state === "grace") label = "宽限剩 <b>" + st.graceLeft + "</b> 天";
    else if (st.state === "bonus") label = "剩 <b>" + st.bonus + "</b> 次";
    else if (st.state === "error") label = "额度服务暂不可用";
    if (!badge) {
      badge = el("div", "badge");
      badge.onclick = togglePanel;
      root.appendChild(badge);
    }
    badge.innerHTML = label + (st.user && st.user.label ? " · " + esc(st.user.label) : "");
  }
  function togglePanel() {
    if (panel) { panel.parentNode.removeChild(panel); panel = null; return; }
    panel = el("div", "panel");
    var st = lastState || {};
    panel.innerHTML =
      '<h3>我的账号' + (st.user && st.user.label ? ' · ' + esc(st.user.label) : '') + '</h3>' +
      '<div class="meta">免费 ' + (st.freeLeft != null ? st.freeLeft : "-") + ' 天 · 宽限 ' + (st.graceLeft != null ? st.graceLeft : "-") + ' 天 · 兑换余额 ' + (st.bonus != null ? st.bonus : "-") + ' 次<br>1 天 = 1 次 · 打赏 ' + PRICE + ' 可领码加 ' + CODE_DAYS + ' 次（微信 ' + WECHAT_ID + '）</div>' +
      '<div class="field" style="display:flex;gap:8px"><input id="zhz-r2" type="text" maxlength="20" placeholder="兑换码" style="flex:1"><button id="zhz-go2" class="btn-mini" type="button">兑换</button></div>' +
      '<div class="err" id="zhz-err3"></div>' +
      '<button id="zhz-out2" class="btn-mini red" type="button">退出登录</button>';
    root.appendChild(panel);
    var err = panel.querySelector("#zhz-err3");
    panel.querySelector("#zhz-go2").onclick = async function () {
      var code = panel.querySelector("#zhz-r2").value.trim();
      if (!code) { err.textContent = "请输入兑换码"; return; }
      err.textContent = ""; this.textContent = "核销中…";
      var r = await bridge({ type: "gate:redeem", code: code });
      this.textContent = "兑换";
      if (r && r.type === "gate:redeem" && r.ok) {
        err.style.color = "#0a8f4c"; err.textContent = "兑换成功，余额 " + r.bonus + " 次";
        setTimeout(function () { removeLayer(panel); panel = null; requestStatus(); err.style.color = ""; }, 1200);
      } else {
        err.style.color = "";
        err.textContent = r && r.reason === "invalid_or_used" ? "兑换码不存在或已被使用" : (r && r.reason === "bad_format" ? "兑换码格式不对" : "核销失败，请稍后再试");
      }
    };
    panel.querySelector("#zhz-out2").onclick = doSignOut;
  }
  async function doSignOut() {
    await bridge({ type: "gate:signout" });
    location.reload();
  }

  /* ---------------- 主流程 ---------------- */
  function onReady() {
    requestStatus();
  }
  async function requestStatus() {
    var r = await bridge({ type: "gate:status" });
    if (!r || r.type !== "gate:status") {
      veil.style.display = "none";
      showBadge({ state: "error" });
      return;
    }
    if (r.state === "anon") { showLogin(); return; }
    if (r.state === "error") {
      veil.style.display = "none";
      showBadge({ state: "error" });
      return;
    }
    /* 放行 */
    veil.style.display = "none";
    showBadge(r);
    var KEY = "zhz_gate_reminded";
    if (r.state === "grace") {
      var reminded = false;
      try { reminded = sessionStorage.getItem(KEY) === "1"; } catch (e) {}
      if (!reminded && !payLayer) {
        try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
        showGrace(r.graceLeft, r.bonus);
      }
    } else if (r.state === "exhausted") {
      if (!payLayer) showExhausted();
    }
  }

  /* 兜底：10 秒仍未就绪 → 放行（不把访客锁在门外），角标提示 */
  setTimeout(function () {
    if (!ready) {
      veil.style.display = "none";
      showBadge({ state: "error" });
    }
  }, 10000);
})();
