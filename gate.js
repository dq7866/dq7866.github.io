/* 知作坊 · 全站门卫 v1.1
 * 原理：本页注入隐藏 iframe（门卫域 bridge.html），所有云端调用在 iframe 内完成；
 * 本脚本只做 UI（Shadow DOM 隔离样式）与 postMessage 通信。
 * 规则：免费 15 天 → 宽限 10 天（每次登录提醒打赏）→ 兑换码（100 次/码）。
 * 计次单位：1 天 1 次（当天首次访问扣 1 次）。
 *
 * v1.1 修复（2026-10-10）：登录后又被判为未登录
 *   ① 主因：bridge.html 里判断会话写成了 res.data.session，而 SDK 实际返回
 *      { data: <session> }，恒为 undefined → 状态接口永远回 anon → 登录成功也被
 *      重新弹回登录页（输入框被清空）。已改为兼容两种形状。
 *   ② 次因：会话存在第三方 iframe 的 localStorage 里，Safari / iOS 微信内核 /
 *      屏蔽第三方 Cookie 的浏览器会禁用该存储且 SDK 静默吞异常。现在由本页把
 *      会话托管到一级域自己的 localStorage，每次握手回灌。
 *   ③ 观感：登录后若确实没拿到登录态，会明确告知原因，不再静默重置表单。
 *
 * v1.1 新增：双通道登录 + 手机号/邮箱
 *   首次（新账号）：账号 + 验证码 + 设置密码
 *   以后：账号 + 密码（也可继续用验证码）
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

  /* 一级域里的两个键：会话镜像 / 上次账号 */
  var LS_SESSION = "zhz_session_v1";
  var LS_PHONE = "zhz_last_phone";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function readSession() {
    var raw = lsGet(LS_SESSION);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      return o && o.key && o.value ? o : null;
    } catch (e) { lsDel(LS_SESSION); return null; }
  }
  function writeSession(key, value) {
    if (!key) return;
    if (value == null) {
      var cur = readSession();
      if (cur && cur.key === key) lsDel(LS_SESSION);
      return;
    }
    lsSet(LS_SESSION, JSON.stringify({ key: key, value: value }));
  }

  function localStoreState() {
    try { localStorage.setItem("__zhz_p", "1"); localStorage.removeItem("__zhz_p"); return "ok"; }
    catch (e) { return "blocked"; }
  }

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
    ".card{width:100%;max-width:400px;background:#fff;border:1px solid #ece5dd;border-radius:16px;padding:26px 24px;box-shadow:0 12px 40px rgba(40,25,10,.25);max-height:92vh;overflow:auto}",
    ".brand{display:flex;align-items:center;gap:10px;margin-bottom:12px}",
    ".logo{width:40px;height:40px;border-radius:11px;background:#ff4d00;color:#fff;font-size:20px;font-weight:700;line-height:40px;text-align:center;flex:0 0 40px}",
    ".brand h2{font-size:17px;color:#26221e}.brand p{font-size:12px;color:#8a8078;margin-top:2px}",
    ".lead{font-size:13.5px;color:#4a4238;line-height:1.7;margin-bottom:12px}",
    ".tabs{display:flex;background:#f6f2ee;border-radius:10px;padding:3px;margin-bottom:12px}",
    ".tab{flex:1;text-align:center;padding:9px 0;font-size:14px;color:#6b6157;border-radius:8px;cursor:pointer;user-select:none}",
    ".tab.on{background:#fff;color:#ff4d00;font-weight:600;box-shadow:0 1px 4px rgba(40,25,10,.12)}",
    ".field{margin-bottom:10px}.row{display:flex;gap:8px}",
    "input{width:100%;padding:11px 12px;font-size:15px;border:1px solid #ece5dd;border-radius:10px;outline:none;background:#fffdfb;color:#26221e}",
    "input:focus{border-color:#ff4d00}",
    ".btn-code{flex:0 0 112px;border:1px solid #ff4d00;background:#fff4ee;color:#ff4d00;border-radius:10px;font-size:13px;cursor:pointer}",
    ".btn-code:disabled{border-color:#ece5dd;background:#f6f2ee;color:#b9b0a7;cursor:not-allowed}",
    ".btn-main{width:100%;padding:12px;font-size:15px;font-weight:600;color:#fff;background:#ff4d00;border:none;border-radius:10px;cursor:pointer}",
    ".btn-main:disabled{opacity:.55;cursor:not-allowed}",
    ".btn-ghost{width:100%;padding:10px;font-size:14px;color:#6b6157;background:#f6f2ee;border:none;border-radius:10px;cursor:pointer;margin-top:8px}",
    ".err{color:#d43f2f;font-size:13px;min-height:17px;margin:4px 0;text-align:center;line-height:1.5}",
    ".ok{color:#0a8f4c;font-size:13px;min-height:17px;margin:4px 0;text-align:center;line-height:1.5}",
    ".hint{font-size:12px;color:#8a8078;line-height:1.6;margin:-4px 0 10px}",
    ".modes{font-size:12px;color:#8a8078;text-align:right;margin:-6px 0 10px}",
    ".newbox{border:1px dashed #ffd0b8;background:#fffaf7;border-radius:10px;padding:10px 12px 2px;margin-bottom:10px}",
    ".newbox h5{font-size:12.5px;color:#c2410c;font-weight:600;margin-bottom:8px}",
    ".tip{font-size:12px;color:#8a8078;line-height:1.7;margin-top:12px;text-align:center}",
    ".link{color:#ff4d00;cursor:pointer;text-decoration:underline;text-underline-offset:2px}",
    ".qr{display:block;width:190px;height:190px;margin:6px auto 8px;border:1px solid #ece5dd;border-radius:10px}",
    ".center{text-align:center}",
    ".wxid{display:inline-block;background:#f6f2ee;border-radius:8px;padding:2px 10px;font-weight:700;color:#26221e}",
    ".divider{display:flex;align-items:center;gap:10px;color:#c8bfb5;font-size:12px;margin:14px 0 10px}",
    ".divider::before,.divider::after{content:'';flex:1;height:1px;background:#ece5dd}",
    ".diag{font-size:11.5px;color:#a89f96;line-height:1.7;margin-top:10px;text-align:center;word-break:break-all}",
    ".hidden{display:none !important}",
    ".badge{position:fixed;right:14px;bottom:14px;pointer-events:auto;background:rgba(38,34,30,.88);color:#fff;font-size:12px;padding:7px 12px;border-radius:999px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);line-height:1.4}",
    ".badge b{color:#ffb499}",
    ".panel{position:fixed;right:14px;bottom:52px;width:290px;background:#fff;border:1px solid #ece5dd;border-radius:14px;padding:16px;box-shadow:0 10px 30px rgba(40,25,10,.2);pointer-events:auto}",
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

  var ready = false, seq = 0, pendingReplies = {}, bridgeStorage = "";
  var readyCbs = [];
  function onReady(cb) { if (ready) { cb(); return; } readyCbs.push(cb); }

  function bridge(msg, timeoutMs) {
    return new Promise(function (resolve) {
      if (!ready) { resolve({ type: "gate:error", message: "门卫通道未就绪" }); return; }
      msg.seq = ++seq;
      pendingReplies[msg.seq] = resolve;
      iframe.contentWindow.postMessage(msg, GATE_ORIGIN);
      setTimeout(function () {
        if (pendingReplies[msg.seq]) { delete pendingReplies[msg.seq]; resolve({ type: "gate:error", message: "连接超时，请检查网络后刷新" }); }
      }, timeoutMs || 15000);
    });
  }

  window.addEventListener("message", function (ev) {
    if (ALLOWED_ORIGINS.indexOf(ev.origin) < 0) return;
    var d = ev.data;
    if (!d || typeof d !== "object" || !d.type) return;

    /* iframe 把会话交上来 → 存进一级域（修复登录失效的关键一环） */
    if (d.type === "gate:session") { writeSession(d.key, d.value); return; }

    if (d.type === "gate:ready") {
      if (!ready) {
        ready = true;
        if (d.storage) bridgeStorage = d.storage;
        var cbs = readyCbs; readyCbs = [];
        for (var i = 0; i < cbs.length; i++) { try { cbs[i](); } catch (e) {} }
        onReadyFn();
      }
      return;
    }
    if (d.seq && pendingReplies[d.seq]) {
      var fn = pendingReplies[d.seq];
      delete pendingReplies[d.seq];
      fn(d);
    }
  });

  /* ready 前重试握手：hello 里带上本页保存的会话，iframe 收到即回灌。
     顺序很关键——必须等这条带会话的 hello 到达后再由 iframe 宣告 ready，
     否则 iframe 会在会话回灌前就放行。 */
  var helloTries = 0;
  function sayHello() {
    try { iframe.contentWindow.postMessage({ type: "gate:hello", session: readSession() }, GATE_ORIGIN); } catch (e) {}
  }
  sayHello();
  var helloTimer = setInterval(function () {
    if (ready || ++helloTries > 60) { clearInterval(helloTimer); return; }
    sayHello();
  }, 250);

  /* 供子站（如风驰骑行）复用同一个通道，避免双 iframe 与会话不一致 */
  window.ZHZBridge = {
    call: bridge,
    ready: function () { return ready; },
    onReady: onReady,
    signOut: doSignOut,
    session: readSession,
    diag: function () { return { storage: localStoreState(), bridgeStorage: bridgeStorage, hasSession: !!readSession() }; }
  };

  /* ---------------- UI 构建 ---------------- */
  function fullLayer(content, dim) {
    var layer = el("div", "layer" + (dim ? " dim" : ""));
    layer.style.background = dim ? "" : "#faf6f1";
    layer.appendChild(content);
    root.appendChild(layer);
    return layer;
  }
  function removeLayer(l) { if (l && l.parentNode) l.parentNode.removeChild(l); }

  var RE_PHONE = /^1\d{10}$/;
  var RE_MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* 登录卡：两个页签 —— 验证码登录（新账号顺带设密码）/ 密码登录
     账号支持手机号与邮箱（平台只支持这两类账号，没有自定义登录名）。 */
  function buildLoginCard() {
    var card = el("div", "card");
    card.innerHTML =
      '<div class="brand"><div class="logo">知</div><div><h2>知作坊</h2><p>dq7866.online</p></div></div>' +
      '<p class="lead">登录后继续访问。新账号自动注册：注册即送 <b>' + FREE_DAYS + '</b> 天免费 + <b>' + GRACE_DAYS + '</b> 天宽限；宽限用完后，微信打赏 ' + PRICE + ' 领兑换码可再解锁 <b>' + CODE_DAYS + '</b> 次。</p>' +
      '<div class="tabs"><div class="tab on" id="zhz-tab-otp">验证码登录</div><div class="tab" id="zhz-tab-pwd">密码登录</div></div>' +

      '<div class="field row"><input id="zhz-account" type="tel" maxlength="40" placeholder="手机号（11 位）"><button id="zhz-send" class="btn-code" type="button">获取验证码</button></div>' +
      '<div class="modes"><span class="link" id="zhz-mode">改用邮箱登录</span></div>' +

      /* —— 验证码登录 —— */
      '<div id="zhz-pane-otp">' +
      '  <div class="field"><input id="zhz-code" type="text" maxlength="6" inputmode="numeric" placeholder="短信 / 邮件验证码"></div>' +
      '  <div class="newbox hidden" id="zhz-newbox">' +
      '    <h5>新账号 · 请设置密码</h5>' +
      '    <div class="field"><input id="zhz-pwd2" type="password" maxlength="32" placeholder="设置密码（6-32 位，以后免验证码登录）"></div>' +
      '  </div>' +
      '  <div class="hint hidden" id="zhz-oldhint">该账号已注册，验证通过即可登录。</div>' +
      '  <div class="err" id="zhz-err"></div>' +
      '  <button id="zhz-login" class="btn-main" type="button">登录 / 注册</button>' +
      '</div>' +

      /* —— 密码登录 —— */
      '<div id="zhz-pane-pwd" class="hidden">' +
      '  <div class="field"><input id="zhz-pwd" type="password" maxlength="32" placeholder="密码"></div>' +
      '  <div class="err" id="zhz-err-p"></div>' +
      '  <button id="zhz-login-p" class="btn-main" type="button">登录</button>' +
      '  <div class="hint center" style="margin-top:10px">忘记密码？切到 <span class="link" id="zhz-to-otp">验证码登录</span> 同样能进入你的账号</div>' +
      '</div>' +

      '<div class="ok" id="zhz-ok"></div>' +
      '<p class="tip">登录状态保存在云端，换设备不丢失 · 密码只用于免验证码快速登录</p>' +
      '<div class="diag" id="zhz-diag"></div>';
    return card;
  }

  var loginLayer = null, loginCard = null;
  function showLogin(preMsg) {
    veil.style.display = "none";
    if (loginLayer) {
      if (preMsg) {
        var box = loginCard && loginCard.querySelector("#zhz-err");
        if (box) { box.className = "err"; box.textContent = preMsg; }
      }
      return;
    }
    var card = buildLoginCard();
    loginLayer = fullLayer(card, true);
    loginCard = card;

    var $ = function (id) { return card.querySelector("#" + id); };
    function setMsg(id, cls, txt) { var b = $(id); if (b) { b.className = cls; b.textContent = txt || ""; } }
    function clearMsgs() { setMsg("zhz-err", "err", ""); setMsg("zhz-err-p", "err", ""); setMsg("zhz-ok", "ok", ""); }

    /* 账号类型：手机号 / 邮箱（平台只支持这两类，没有自定义登录名） */
    var mode = "phone";
    function applyMode() {
      var acc = $("zhz-account");
      acc.type = mode === "phone" ? "tel" : "email";
      acc.maxLength = mode === "phone" ? 11 : 40;
      acc.inputMode = mode === "phone" ? "numeric" : "email";
      acc.placeholder = mode === "phone" ? "手机号（11 位）" : "邮箱地址";
      acc.value = "";
      $("zhz-mode").textContent = mode === "phone" ? "改用邮箱登录" : "改用手机号登录";
      clearMsgs();
    }
    function validAccount(v) { return mode === "phone" ? RE_PHONE.test(v) : RE_MAIL.test(v); }
    function accountErr() { return mode === "phone" ? "请输入正确的 11 位手机号" : "请输入正确的邮箱地址"; }
    $("zhz-mode").onclick = function () { mode = mode === "phone" ? "email" : "phone"; applyMode(); };

    var pending = null, timer = null;
    function countdown(btn) {
      var left = 60;
      btn.disabled = true; btn.textContent = left + " s";
      timer = setInterval(function () {
        left--;
        if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = "重新发送"; }
        else btn.textContent = left + " s";
      }, 1000);
    }

    /* 页签切换 */
    var tabOtp = $("zhz-tab-otp"), tabPwd = $("zhz-tab-pwd");
    var paneOtp = $("zhz-pane-otp"), panePwd = $("zhz-pane-pwd");
    function useTab(which) {
      var isOtp = which === "otp";
      tabOtp.className = "tab" + (isOtp ? " on" : "");
      tabPwd.className = "tab" + (isOtp ? "" : " on");
      paneOtp.classList.toggle("hidden", !isOtp);
      panePwd.classList.toggle("hidden", isOtp);
      $("zhz-send").classList.toggle("hidden", !isOtp);
      clearMsgs();
    }
    tabOtp.onclick = function () { useTab("otp"); };
    tabPwd.onclick = function () { useTab("pwd"); };
    $("zhz-to-otp").onclick = function () { useTab("otp"); };

    var newbox = $("zhz-newbox"), oldhint = $("zhz-oldhint");

    /* —— ① 获取验证码 —— */
    $("zhz-send").onclick = async function () {
      var acc = $("zhz-account").value.trim();
      if (!validAccount(acc)) { setMsg("zhz-err", "err", accountErr()); return; }
      clearMsgs();
      var btn = this; btn.disabled = true; btn.textContent = "发送中…";
      var msg = { type: "gate:send-otp" };
      if (mode === "phone") msg.phone = acc; else msg.email = acc;
      var r = await bridge(msg);
      if (!r || r.type !== "gate:otp-sent" || !r.ok) {
        setMsg("zhz-err", "err", (r && r.message) || "验证码发送失败");
        btn.disabled = false; btn.textContent = "获取验证码"; return;
      }
      pending = { account: acc, mode: mode, verificationId: r.verificationId, isExistingUser: !!r.isExistingUser };
      if (mode === "phone") lsSet(LS_PHONE, acc);
      newbox.classList.toggle("hidden", pending.isExistingUser);
      oldhint.classList.toggle("hidden", !pending.isExistingUser);
      setMsg("zhz-ok", "ok", pending.isExistingUser ? "验证码已发送，请查收" : "验证码已发送，请查收并设置密码");
      countdown(btn);
      if (!pending.isExistingUser) { try { $("zhz-pwd2").focus(); } catch (e) {} }
    };

    /* —— ② 验证码登录 / 注册 —— */
    $("zhz-login").onclick = async function () {
      var acc = $("zhz-account").value.trim();
      var code = $("zhz-code").value.trim();
      if (!pending || pending.account !== acc) { setMsg("zhz-err", "err", "请先获取验证码"); return; }
      if (!code) { setMsg("zhz-err", "err", "请输入验证码"); return; }
      var pwd = $("zhz-pwd2").value;
      if (!pending.isExistingUser && (!pwd || pwd.length < 6)) {
        setMsg("zhz-err", "err", "请设置至少 6 位密码（以后免验证码登录）"); return;
      }
      clearMsgs();
      var btn = this; btn.disabled = true; btn.textContent = "验证中…";
      var msg = {
        type: "gate:verify-otp",
        verificationId: pending.verificationId,
        isExistingUser: pending.isExistingUser,
        token: code,
        password: pending.isExistingUser ? "" : pwd
      };
      if (pending.mode === "phone") msg.phone = pending.account; else msg.email = pending.account;
      var r = await bridge(msg);
      if (!r || r.type !== "gate:otp-verified" || !r.ok) {
        setMsg("zhz-err", "err", (r && r.message) || "验证码不正确");
        btn.disabled = false; btn.textContent = "登录 / 注册"; return;
      }
      pending = null;
      await finishLogin();
      btn.disabled = false; btn.textContent = "登录 / 注册";
    };

    /* —— ③ 账号 + 密码登录 —— */
    $("zhz-login-p").onclick = async function () {
      var acc = $("zhz-account").value.trim();
      var pwd = $("zhz-pwd").value;
      if (!validAccount(acc)) { setMsg("zhz-err-p", "err", accountErr()); return; }
      if (!pwd) { setMsg("zhz-err-p", "err", "请输入密码"); return; }
      clearMsgs();
      var btn = this; btn.disabled = true; btn.textContent = "登录中…";
      var msg = { type: "gate:signin-password", password: pwd };
      if (mode === "phone") msg.phone = acc; else msg.email = acc;
      var r = await bridge(msg);
      if (!r || r.type !== "gate:signed-in" || !r.ok) {
        var m = (r && r.message) || "手机号或密码不正确";
        if (/invalid|not found|password|credential|401/i.test(m) || (r && r.type === "gate:signed-in")) {
          m = (mode === "phone" ? "手机号" : "邮箱") + "或密码不正确。若从未设置过密码，请用「验证码登录」进入。";
        }
        setMsg("zhz-err-p", "err", m);
        btn.disabled = false; btn.textContent = "登录"; return;
      }
      if (mode === "phone") lsSet(LS_PHONE, acc);
      await finishLogin();
      btn.disabled = false; btn.textContent = "登录";
    };

    /* 预填上次手机号 */
    var last = lsGet(LS_PHONE);
    if (last && RE_PHONE.test(last)) $("zhz-account").value = last;
    if (preMsg) setMsg("zhz-err", "err", preMsg);
  }

  /* 登录成功后的收尾：确认登录态真的生效，再放行 */
  async function finishLogin() {
    var r = await bridge({ type: "gate:status" });
    if (r && r.type === "gate:status" && r.state && r.state !== "anon" && r.state !== "error") {
      removeLayer(loginLayer); loginLayer = null; loginCard = null;
      applyStatus(r);
      return;
    }
    if (r && r.type === "gate:status" && r.state === "anon") {
      showLogin("已通过验证，但浏览器没能保存登录状态。请允许本站使用 Cookie / 本地存储（关闭无痕模式），或换一个浏览器再试。");
      return;
    }
    /* 连不上额度服务：不把用户锁在门外，按“已登录但额度未知”放行 */
    removeLayer(loginLayer); loginLayer = null; loginCard = null;
    veil.style.display = "none";
    showBadge({ state: "error" });
  }

  /* 打赏/兑换卡（grace 可关闭；exhausted 不可关） */
  function buildPayCard(remainingText) {
    var card = el("div", "card");
    card.innerHTML =
      '<div class="brand"><div class="logo">知</div><div><h2>' + (remainingText || "支持一下") + '</h2><p>dq7866.online</p></div></div>' +
      '<p class="lead">免费体验已用完。如果这些内容对你有帮助，欢迎微信打赏 <b>' + PRICE + '</b>，即可领取兑换码、再解锁 <b>' + CODE_DAYS + '</b> 次使用（1 天 = 1 次）。</p>' +
      '<img class="qr" src="' + QR_SRC + '" alt="微信二维码">' +
      '<p class="center" style="font-size:13px;color:#4a4238">微信扫码添加：<span class="wxid">' + WECHAT_ID + '</span></p>' +
      '<p class="center" style="font-size:12px;color:#8a8078;margin-top:-4px">需要把某个栏目装到本地使用、含全部授权内容？同微信找我就行。</p>' +
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
    wireRedeem(card, function () { removeLayer(payLayer); payLayer = null; requestStatus(); });
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
    else if (st.state === "exhausted") label = "额度已用完";
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
    var dg = (window.ZHZBridge && window.ZHZBridge.diag) ? window.ZHZBridge.diag() : {};
    panel.innerHTML =
      '<h3>我的账号' + (st.user && st.user.label ? ' · ' + esc(st.user.label) : '') + '</h3>' +
      '<div class="meta">免费 ' + (st.freeLeft != null ? st.freeLeft : "-") + ' 天 · 宽限 ' + (st.graceLeft != null ? st.graceLeft : "-") + ' 天 · 兑换余额 ' + (st.bonus != null ? st.bonus : "-") + ' 次<br>1 天 = 1 次 · 打赏 ' + PRICE + ' 可领码加 ' + CODE_DAYS + ' 次（微信 ' + WECHAT_ID + '）</div>' +
      '<div class="field" style="display:flex;gap:8px"><input id="zhz-r2" type="text" maxlength="20" placeholder="兑换码" style="flex:1"><button id="zhz-go2" class="btn-mini" type="button">兑换</button></div>' +
      '<div class="err" id="zhz-err3"></div>' +
      '<button id="zhz-out2" class="btn-mini red" type="button">退出登录</button>' +
      '<div class="diag">本机存储 ' + (dg.storage === "ok" ? "可用" : "受限") + ' · 通道 ' + (dg.bridgeStorage === "ok" ? "可用" : (dg.bridgeStorage || "-")) + ' · 登录态 ' + (dg.hasSession ? "已保存" : "无") + '</div>';
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
    try { await bridge({ type: "gate:signout" }, 6000); } catch (e) {}
    lsDel(LS_SESSION);      /* 一级域的会话镜像也要清掉，否则刷新又“登回来”了 */
    location.reload();
  }

  /* ---------------- 主流程 ---------------- */
  function onReadyFn() { requestStatus(); }

  function applyStatus(r) {
    if (r.state === "free" || r.state === "bonus") { showBadge(r); return; }
    if (r.state === "grace") {
      showBadge(r);
      var KEY = "zhz_gate_reminded";
      var reminded = false;
      try { reminded = sessionStorage.getItem(KEY) === "1"; } catch (e) {}
      if (!reminded && !payLayer) {
        try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
        showGrace(r.graceLeft, r.bonus);
      }
      return;
    }
    if (r.state === "exhausted") {
      showBadge(r);
      if (!payLayer) showExhausted();
    }
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
    veil.style.display = "none";
    applyStatus(r);
  }

  /* 兜底：12 秒仍未就绪 → 放行（不把访客锁在门外），角标提示 */
  setTimeout(function () {
    if (!ready) {
      veil.style.display = "none";
      showBadge({ state: "error" });
    }
  }, 12000);
})();
