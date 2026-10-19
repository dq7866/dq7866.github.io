/* 知作坊 · 全站门卫 v1.5
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
 * v1.2 登录卡合并（2026-10-11）
 *   原先「验证码登录 / 密码登录」两个页签，账号要在两个页签里各输一次，体验差。
 *   现在只有一张表单：账号（自动识别手机号 / 邮箱）+ 验证码 + 密码（选填）。
 *   点「登录 / 注册」时：填了验证码就走验证码通道（新账号顺带设密码），
 *   没填验证码但填了密码就走密码通道（免验证码）。
 *
 * v1.3 两站独立（2026-10-11）
 *   工具箱与风驰骑行各自登录、各自额度，靠 URL 与 scope 分区（见下方 SCOPE）。
 *
 * v1.4 修改密码（2026-10-11）
 *   登录用户可在管理小面板改密：邮箱账号走验证码二次验证，手机号账号走旧密码。
 *
 * v1.5 修复本机预览不出登录卡（2026-10-11）
 *   旧写法在 IS_DEV 时把桥接指向同源 location.origin，但站点根目录并没有
 *   bridge.html（它只发布在门卫域）→ iframe 请求 404 → 桥接永不宣告就绪 →
 *   12 秒兜底后只显示「额度服务暂不可用」，登录卡根本出不来。
 *   线上不受影响（IS_DEV=false 时本来就指向门卫域），只坑本机 hexo s 预览。
 *   现在桥接恒在门卫域、本机预览加 ?dev=1（桥接据此放行 localhost 来源）。
 */
(function () {
  "use strict";
  if (window.__ZHZ_GATE__) return;
  window.__ZHZ_GATE__ = true;

  /* ---------------- 配置 ---------------- */
  var IS_DEV = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);

  /* 桥接页只发布在门卫域，本机预览也必须走它。
     ⚠️ 不要改回「本机指向同源」：站点根目录没有 bridge.html，
        那样会在本机静默退化成「额度服务暂不可用」而看不到任何登录入口。
     🔧 本机联调测试台若要把桥接换成同源的测试副本，用 ?zhzbridge=<绝对地址> 覆盖。 */
  var GATE_ORIGIN = "https://zhizuofang.app.workbuddy.host";
  var BRIDGE_ORIGIN = GATE_ORIGIN;
  var BRIDGE_URL = GATE_ORIGIN + "/bridge.html" + (IS_DEV ? "?dev=1" : "");
  if (IS_DEV) {
    var _ov = (location.search.match(/[?&]zhzbridge=([^&]+)/) || [])[1];
    if (_ov) {
      BRIDGE_URL = decodeURIComponent(_ov);
      BRIDGE_ORIGIN = BRIDGE_URL.replace(/^(https?:\/\/[^\/]+).*$/i, "$1");
    }
  }
  var QR_SRC = "/images/wechat-qr.jpg";
  var SITE = "https://dq7866.online";

  var FREE_DAYS = 15, GRACE_DAYS = 10, CODE_DAYS = 100, WECHAT_ID = "Huangld", PRICE = "3 元";
  /* 只收桥接域发来的消息；dev 下再放行本页自身来源，兼容旧同源联调方式 */
  var ALLOWED_ORIGINS = [BRIDGE_ORIGIN];
  if (IS_DEV && ALLOWED_ORIGINS.indexOf(location.origin) < 0) ALLOWED_ORIGINS.push(location.origin);

  /* ---------------- 站点身份 ----------------
     工具箱与风驰骑行是两套完全独立的登录：各自注册、各自登录、各自额度。
     门卫脚本是同一份，靠 URL 判断自己站在哪一边（/bike/… → 骑行，其余 → 工具箱）。 */
  var SCOPE = /^\/bike(\/|$)/.test(location.pathname) ? "bike"
            : (/^\/guardian(\/|$)/.test(location.pathname) ? "guardian" : "toolbox");
  var SITE_NAME = SCOPE === "bike" ? "风驰骑行" : (SCOPE === "guardian" ? "冰火守门人" : "在线工具箱");

  /* 一级域里的两个键：会话镜像 / 上次账号（都按站点分开，互不覆盖） */
  var LS_SESSION = "zhz_session_" + SCOPE + "_v1";
  var LS_PHONE = "zhz_last_phone_" + SCOPE;
  var LS_SESSION_LEGACY = "zhz_session_v1";   /* v1.2 之前的单会话键，仅用于一次性迁移 */

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* 老版本全站只有一个会话键，也没有 scope 前缀。
     升级后把这唯一一份会话判给工具箱（用户之前多半是在那里登录的），
     骑行从头开始 —— 这正是「两站独立」该有的样子。
     注意 key 要补上前缀，否则桥接页按 zhz:toolbox:… 找不到它。 */
  function migrateLegacySession() {
    try {
      if (SCOPE !== "toolbox" || lsGet(LS_SESSION)) return;
      var raw = lsGet(LS_SESSION_LEGACY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && o.key && o.value && o.key.indexOf("zhz:") !== 0) o.key = "zhz:toolbox:" + o.key;
      lsSet(LS_SESSION, JSON.stringify(o));
      lsDel(LS_SESSION_LEGACY);
    } catch (e) { lsDel(LS_SESSION_LEGACY); }
  }

  function readSession() {
    var raw = lsGet(LS_SESSION);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      return o && o.key && o.value ? o : null;
    } catch (e) { lsDel(LS_SESSION); return null; }
  }
  /* 桥接页回传的键在 v1.3 之前不带 zhz:<scope>: 前缀。
     发布过渡期两边版本可能不一致，这里统一补齐，避免会话镜像写进去却对不上。 */
  function normKey(k) {
    if (!k) return k;
    return k.indexOf("zhz:") === 0 ? k : ("zhz:" + SCOPE + ":" + k);
  }
  function writeSession(key, value) {
    if (!key) return;
    key = normKey(key);
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
    ".hint.tiny{font-size:11.5px;color:#a89f96}",
    ".field.pwdon input{border-color:#ffd0b8;background:#fffaf7}",
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
      /* 每条消息都带上本页所属站点，桥接页据此选会话与额度分区 */
      if (msg.scope === undefined) msg.scope = SCOPE;
      msg.seq = ++seq;
      pendingReplies[msg.seq] = resolve;
      iframe.contentWindow.postMessage(msg, BRIDGE_ORIGIN);
      setTimeout(function () {
        if (pendingReplies[msg.seq]) { delete pendingReplies[msg.seq]; resolve({ type: "gate:error", message: "连接超时，请检查网络后刷新" }); }
      }, timeoutMs || 15000);
    });
  }

  window.addEventListener("message", function (ev) {
    if (ALLOWED_ORIGINS.indexOf(ev.origin) < 0) return;
    var d = ev.data;
    if (!d || typeof d !== "object" || !d.type) return;

    /* iframe 把会话交上来 → 存进一级域（修复登录失效的关键一环）。
       只认自己站点的会话：另一个站点的会话镜像不该覆盖本页的。 */
    if (d.type === "gate:session") {
      if (d.scope && d.scope !== SCOPE) return;
      writeSession(d.key, d.value);
      return;
    }

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

  /* ready 前重试握手：hello 里带上站点与本站点保存的会话，iframe 收到即回灌。
     顺序很关键——必须等这条带会话的 hello 到达后再由 iframe 宣告 ready，
     否则 iframe 会在会话回灌前就放行。 */
  migrateLegacySession();
  var helloTries = 0;
  function sayHello() {
    try { iframe.contentWindow.postMessage({ type: "gate:hello", scope: SCOPE, session: readSession() }, BRIDGE_ORIGIN); } catch (e) {}
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
    scope: SCOPE,
    diag: function () { return { scope: SCOPE, storage: localStoreState(), bridgeStorage: bridgeStorage, hasSession: !!readSession() }; }
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

  /* 登录卡：单张表单（v1.2 起不再分页签，账号只输一次）
     - 账号：手机号或邮箱，自动识别，无需手动切换
     - 验证码：点右侧「获取验证码」
     - 密码：选填。填了以后就能免验证码登录；新账号必须设一个
     主按钮逻辑：填了验证码走验证码通道；没填验证码但填了密码走密码通道。 */
  function buildLoginCard() {
    var card = el("div", "card");
    card.innerHTML =
      '<div class="brand"><div class="logo">知</div><div><h2>知作坊 · ' + SITE_NAME + '</h2><p>dq7866.online</p></div></div>' +
      '<p class="lead">登录后继续访问「' + SITE_NAME + '」。新账号自动注册：注册即送 <b>' + FREE_DAYS + '</b> 天免费 + <b>' + GRACE_DAYS + '</b> 天宽限；宽限用完后，微信打赏 ' + PRICE + ' 领兑换码可再解锁 <b>' + CODE_DAYS + '</b> 次。<br><span style="color:#a89f96;font-size:12px">本站的登录与额度独立于另一个栏目，互不影响。</span></p>' +

      '<div class="field"><input id="zhz-account" type="text" maxlength="40" autocomplete="username" placeholder="手机号或邮箱"></div>' +
      '<div class="field row"><input id="zhz-code" type="text" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="验证码"><button id="zhz-send" class="btn-code" type="button">获取验证码</button></div>' +
      '<div class="field" id="zhz-pwdfield"><input id="zhz-pwd" type="password" maxlength="32" autocomplete="current-password" placeholder="密码（选填，填了以后免验证码）"></div>' +
      '<div class="hint tiny hidden" id="zhz-newhint">新账号：请在上面设置 6-32 位密码，以后就能免验证码登录。</div>' +
      '<div class="hint tiny hidden" id="zhz-oldhint">该账号已注册，填对验证码即可登录（密码可不填）。</div>' +

      '<div class="err" id="zhz-err"></div>' +
      '<button id="zhz-login" class="btn-main" type="button">登录 / 注册</button>' +
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
    function clearMsgs() { setMsg("zhz-err", "err", ""); setMsg("zhz-ok", "ok", ""); }

    /* 账号类型自动识别：含 @ 按邮箱，否则按手机号（平台只支持这两类，没有自定义登录名） */
    function kindOf(v) { return v.indexOf("@") >= 0 ? "email" : "phone"; }
    function validAccount(v) { if (!v) return false; return kindOf(v) === "email" ? RE_MAIL.test(v) : RE_PHONE.test(v); }
    function accountErr(v) {
      if (!v) return "请输入手机号或邮箱";
      return kindOf(v) === "email" ? "请输入正确的邮箱地址" : "请输入正确的 11 位手机号";
    }

    var pwdField = $("zhz-pwdfield"), pwdEl = $("zhz-pwd");
    var newhint = $("zhz-newhint"), oldhint = $("zhz-oldhint");
    var pending = null, timer = null;

    /* 密码框的提示随账号状态变化：新账号必须设密码 → 高亮并要求 */
    function refreshPwdHint() {
      if (!pending) {
        newhint.classList.add("hidden"); oldhint.classList.add("hidden");
        pwdField.classList.remove("pwdon");
        pwdEl.placeholder = "密码（选填，填了以后免验证码）";
        return;
      }
      var isNew = !pending.isExistingUser;
      newhint.classList.toggle("hidden", !isNew);
      oldhint.classList.toggle("hidden", isNew);
      pwdField.classList.toggle("pwdon", isNew);
      pwdEl.placeholder = isNew ? "请设置 6-32 位密码（以后免验证码）" : "密码（可不填）";
    }

    function countdown(btn) {
      var left = 60;
      btn.disabled = true; btn.textContent = left + " s";
      timer = setInterval(function () {
        left--;
        if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = "重新发送"; }
        else btn.textContent = left + " s";
      }, 1000);
    }

    /* 账号一改，之前拿到的验证码就作废 */
    $("zhz-account").addEventListener("input", function () {
      if (pending && pending.account !== this.value.trim()) { pending = null; refreshPwdHint(); }
    });

    /* —— ① 获取验证码 —— */
    $("zhz-send").onclick = async function () {
      var acc = $("zhz-account").value.trim();
      if (!validAccount(acc)) { setMsg("zhz-err", "err", accountErr(acc)); return; }
      clearMsgs();
      var kind = kindOf(acc);
      var btn = this; btn.disabled = true; btn.textContent = "发送中…";
      var msg = { type: "gate:send-otp" };
      if (kind === "phone") msg.phone = acc; else msg.email = acc;
      var r = await bridge(msg);
      if (!r || r.type !== "gate:otp-sent" || !r.ok) {
        setMsg("zhz-err", "err", (r && r.message) || "验证码发送失败");
        btn.disabled = false; btn.textContent = "获取验证码"; return;
      }
      pending = { account: acc, kind: kind, verificationId: r.verificationId, isExistingUser: !!r.isExistingUser };
      if (kind === "phone") lsSet(LS_PHONE, acc);
      refreshPwdHint();
      setMsg("zhz-ok", "ok", pending.isExistingUser ? "验证码已发送，请查收" : "验证码已发送；新账号请同时设置密码");
      countdown(btn);
      try { (pending.isExistingUser ? $("zhz-code") : pwdEl).focus(); } catch (e) {}
    };

    /* —— ② 主按钮：填了验证码走验证码通道，否则用密码免验证码登录 —— */
    var btnMain = $("zhz-login");
    btnMain.onclick = async function () {
      var acc = $("zhz-account").value.trim();
      var code = $("zhz-code").value.trim();
      var pwd = $("zhz-pwd").value;
      var kind = kindOf(acc);

      if (!validAccount(acc)) { setMsg("zhz-err", "err", accountErr(acc)); return; }

      /* 验证码通道（新账号顺带设密码） */
      if (code) {
        if (!pending || pending.account !== acc) { setMsg("zhz-err", "err", "请先点右侧「获取验证码」"); return; }
        if (!pending.isExistingUser && (!pwd || pwd.length < 6)) {
          setMsg("zhz-err", "err", "新账号请设置至少 6 位密码（以后免验证码登录）"); return;
        }
        clearMsgs();
        btnMain.disabled = true; btnMain.textContent = "验证中…";
        var m1 = {
          type: "gate:verify-otp",
          verificationId: pending.verificationId,
          isExistingUser: pending.isExistingUser,
          token: code,
          password: pending.isExistingUser ? "" : pwd
        };
        if (pending.kind === "phone") m1.phone = pending.account; else m1.email = pending.account;
        var r1 = await bridge(m1);
        btnMain.disabled = false; btnMain.textContent = "登录 / 注册";
        if (!r1 || r1.type !== "gate:otp-verified" || !r1.ok) {
          setMsg("zhz-err", "err", (r1 && r1.message) || "验证码不正确"); return;
        }
        pending = null;
        await finishLogin();
        return;
      }

      /* 密码通道（免验证码） */
      if (pwd) {
        clearMsgs();
        btnMain.disabled = true; btnMain.textContent = "登录中…";
        var m2 = { type: "gate:signin-password", password: pwd };
        if (kind === "phone") m2.phone = acc; else m2.email = acc;
        var r2 = await bridge(m2);
        btnMain.disabled = false; btnMain.textContent = "登录 / 注册";
        if (!r2 || r2.type !== "gate:signed-in" || !r2.ok) {
          setMsg("zhz-err", "err", (kind === "phone" ? "手机号" : "邮箱") + "或密码不正确。若还没设过密码，请点「获取验证码」用验证码登录。");
          return;
        }
        if (kind === "phone") lsSet(LS_PHONE, acc);
        await finishLogin();
        return;
      }

      setMsg("zhz-err", "err", "请输入密码，或点右侧「获取验证码」用验证码登录");
    };

    /* 三个输入框都支持回车提交 */
    ["zhz-account", "zhz-code", "zhz-pwd"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); btnMain.click(); }
      });
    });

    /* 预填上次手机号 */
    var last = lsGet(LS_PHONE);
    if (last && RE_PHONE.test(last)) $("zhz-account").value = last;
    refreshPwdHint();
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
      '<div class="brand"><div class="logo">知</div><div><h2>' + (remainingText || "支持一下") + '</h2><p>dq7866.online · ' + SITE_NAME + '</p></div></div>' +
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

  /* ---------- 修改密码（已登录用户） ----------
     两条通道，进卡片时按账号类型自动选（gate:whoami 探测）：
       ① 有邮箱 → 验证码（平台 resetPasswordForEmail）。这是「先重新验证身份」的正路，
          验证的是「你收得到这个账号的邮件」，不需要旧密码。
       ② 无邮箱（手机号注册）→ 旧密码（平台 resetPasswordForOld）。
          平台没有暴露「手机验证码改密」这条通道，旧密码是这类账号唯一能自助的方式。
     两条都走 SDK，不自己拼 fetch。改完会话由 SDK 重建，不掉线。 */
  var pwdLayer = null;
  function showPwdCard() {
    if (pwdLayer) return;
    var card = el("div", "card");
    card.innerHTML =
      '<div class="brand"><div class="logo">知</div><div><h2>修改密码 · ' + SITE_NAME + '</h2><p>dq7866.online</p></div></div>' +

      /* —— 模式 A：邮箱账号，验证码二次验证 —— */
      '<div id="zhz-mode-otp" class="hidden">' +
        '<p class="lead">为确认是本人操作，修改密码前要先用<b>验证码</b>验证一次身份。<br><span style="color:#a89f96;font-size:12px">不需要输入旧密码；验证码会发到你注册时用的邮箱。</span></p>' +
        '<div class="field row"><input id="zhz-pcode" type="text" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="验证码"><button id="zhz-psend" class="btn-code" type="button">获取验证码</button></div>' +
        '<div class="hint tiny" id="zhz-ptarget">点「获取验证码」开始验证。</div>' +
        '<div class="field"><input id="zhz-np1" type="password" maxlength="32" autocomplete="new-password" placeholder="新密码（6-32 位）"></div>' +
        '<div class="field"><input id="zhz-np2" type="password" maxlength="32" autocomplete="new-password" placeholder="再输一次新密码"></div>' +
        '<div class="err" id="zhz-perr"></div>' +
        '<button id="zhz-pok" class="btn-main" type="button">确认修改</button>' +
        '<div class="ok" id="zhz-pokmsg"></div>' +
      '</div>' +

      /* —— 模式 B：手机号账号，平台无手机验证码改密，用当前密码确认身份 —— */
      '<div id="zhz-mode-old" class="hidden">' +
        '<p class="lead">你的账号是<b>手机号注册</b>的，平台还没有开放手机验证码改密。<br>为确认是本人操作，请输入<b>当前密码</b>，再设置新密码。</p>' +
        '<div class="field"><input id="zhz-op0" type="password" maxlength="32" autocomplete="current-password" placeholder="当前密码"></div>' +
        '<div class="field"><input id="zhz-np1o" type="password" maxlength="32" autocomplete="new-password" placeholder="新密码（6-32 位）"></div>' +
        '<div class="field"><input id="zhz-np2o" type="password" maxlength="32" autocomplete="new-password" placeholder="再输一次新密码"></div>' +
        '<div class="err" id="zhz-perr2"></div>' +
        '<button id="zhz-pok2" class="btn-main" type="button">确认修改</button>' +
        '<div class="ok" id="zhz-pokmsg2"></div>' +
        '<div class="hint tiny">注册时没设过密码、或忘记当前密码？微信联系站长 ' + WECHAT_ID + ' 处理。</div>' +
      '</div>' +

      '<div class="err" id="zhz-perr0"></div>' +
      '<button id="zhz-pback" class="btn-ghost" type="button">返回</button>';
    pwdLayer = fullLayer(card, true);

    var $ = function (id) { return card.querySelector("#" + id); };
    var modeOtp = $("zhz-mode-otp"), modeOld = $("zhz-mode-old");
    function perr(t) { $("zhz-perr").textContent = t || ""; }      /* 模式 A 的错误区 */
    function perr2(t) { $("zhz-perr2").textContent = t || ""; }    /* 模式 B 的错误区 */
    function perr0(t) { $("zhz-perr0").textContent = t || ""; }    /* 通用（探测失败等） */
    function pnote(t, color) { var n = $("zhz-ptarget"); n.textContent = t || ""; n.style.color = color || ""; }

    var pTimer = null, sent = false;
    function countdown(btn) {
      var left = 60;
      btn.disabled = true; btn.textContent = left + " s";
      pTimer = setInterval(function () {
        left--;
        if (left <= 0) { clearInterval(pTimer); pTimer = null; btn.disabled = false; btn.textContent = "重新发送"; }
        else btn.textContent = left + " s";
      }, 1000);
    }
    function closePwd() {
      if (pTimer) { clearInterval(pTimer); pTimer = null; }
      removeLayer(pwdLayer); pwdLayer = null;
    }
    /* 成功统一收尾：SDK 已用新密码重建会话，不需要重新登录 */
    function done(msgId) {
      $(msgId).textContent = "修改成功，正在返回…";
      $("zhz-pok").disabled = true; $("zhz-pok2").disabled = true; $("zhz-pback").disabled = true;
      setTimeout(function () { closePwd(); requestStatus(); }, 1600);
    }

    /* —— 模式 A ①：发验证码 —— */
    $("zhz-psend").onclick = async function () {
      perr(""); sent = false;
      var btn = this; btn.disabled = true; btn.textContent = "发送中…";
      var r = await bridge({ type: "gate:reset-start" }, 25000);
      if (!r || r.type !== "gate:reset-start" || !r.ok) {
        btn.disabled = false; btn.textContent = "获取验证码";
        if (r && r.reason === "no_email") {
          /* 兜底：正常流程不会走到这里（进卡片前已按账号类型分流） */
          perr("该账号没有绑定邮箱，请改用「当前密码」方式修改");
        } else if (r && r.reason === "unauthenticated") {
          perr("登录状态已失效，请刷新页面重新登录");
        } else {
          perr((r && r.message) || "验证码发送失败，请稍后再试");
        }
        return;
      }
      sent = true;
      pnote("验证码已发送到 " + esc(r.target || "你的注册邮箱") + "，请查收（含垃圾邮件箱）。重新获取会让旧验证码失效。", "#0a8f4c");
      countdown(btn);
      try { $("zhz-pcode").focus(); } catch (e) {}
    };

    /* —— 模式 A ②：验证码 + 新密码 —— */
    $("zhz-pok").onclick = async function () {
      var code = $("zhz-pcode").value.trim();
      var p1 = $("zhz-np1").value, p2 = $("zhz-np2").value;
      if (!sent) { perr("请先点「获取验证码」"); return; }
      if (!code) { perr("请输入收到的验证码"); return; }
      if (p1.length < 6 || p1.length > 32) { perr("新密码请用 6-32 位字符"); return; }
      if (p1 !== p2) { perr("两次输入的新密码不一致"); return; }
      perr("");
      var btn = this; btn.disabled = true; btn.textContent = "提交中…";
      var r = await bridge({ type: "gate:reset-submit", nonce: code, password: p1 }, 25000);
      btn.disabled = false; btn.textContent = "确认修改";
      if (!r || r.type !== "gate:reset-submit" || !r.ok) {
        if (r && r.reason === "no_challenge") { sent = false; perr("请先点「获取验证码」"); }
        else perr((r && r.message) || "密码修改失败，请稍后再试");
        return;
      }
      sent = false;
      pnote("密码已修改成功。下次登录可用新密码免验证码登录。", "#0a8f4c");
      done("zhz-pokmsg");
    };

    /* —— 模式 B：当前密码 + 新密码 —— */
    $("zhz-pok2").onclick = async function () {
      var op = $("zhz-op0").value;
      var p1 = $("zhz-np1o").value, p2 = $("zhz-np2o").value;
      if (!op) { perr2("请输入当前密码"); return; }
      if (p1.length < 6 || p1.length > 32) { perr2("新密码请用 6-32 位字符"); return; }
      if (p1 !== p2) { perr2("两次输入的新密码不一致"); return; }
      if (p1 === op) { perr2("新密码不能与当前密码相同"); return; }
      perr2("");
      var btn = this; btn.disabled = true; btn.textContent = "提交中…";
      var r = await bridge({ type: "gate:reset-old", oldPassword: op, newPassword: p1 }, 25000);
      btn.disabled = false; btn.textContent = "确认修改";
      if (!r || r.type !== "gate:reset-old" || !r.ok) {
        if (r && r.reason === "bad_old_password") perr2("当前密码不正确");
        else if (r && r.reason === "unauthenticated") perr2("登录状态已失效，请刷新页面重新登录");
        else perr2((r && r.message) || "密码修改失败，请稍后再试");
        return;
      }
      done("zhz-pokmsg2");
    };

    $("zhz-pback").onclick = closePwd;

    ["zhz-pcode", "zhz-np1", "zhz-np2"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); $("zhz-pok").click(); }
      });
    });
    ["zhz-op0", "zhz-np1o", "zhz-np2o"].forEach(function (id) {
      $(id).addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); $("zhz-pok2").click(); }
      });
    });

    /* —— 进卡片先探测账号类型，再决定显示哪套表单 —— */
    (async function pickMode() {
      var r = await bridge({ type: "gate:whoami" }, 15000);
      if (!r || r.type !== "gate:whoami" || !r.ok) {
        perr0(r && r.reason === "unauthenticated"
          ? "登录状态已失效，请刷新页面重新登录"
          : ((r && r.message) || "账号信息读取失败，请稍后再试"));
        return;
      }
      if (r.hasEmail) modeOtp.classList.remove("hidden");
      else modeOld.classList.remove("hidden");
    })();
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
      '<h3>' + SITE_NAME + ' · 我的账号' + (st.user && st.user.label ? ' ' + esc(st.user.label) : '') + '</h3>' +
      '<div class="meta">免费 ' + (st.freeLeft != null ? st.freeLeft : "-") + ' 天 · 宽限 ' + (st.graceLeft != null ? st.graceLeft : "-") + ' 天 · 兑换余额 ' + (st.bonus != null ? st.bonus : "-") + ' 次<br>1 天 = 1 次 · 打赏 ' + PRICE + ' 可领码加 ' + CODE_DAYS + ' 次（微信 ' + WECHAT_ID + '）</div>' +
      '<div class="field" style="display:flex;gap:8px"><input id="zhz-r2" type="text" maxlength="20" placeholder="兑换码" style="flex:1"><button id="zhz-go2" class="btn-mini" type="button">兑换</button></div>' +
      '<div class="err" id="zhz-err3"></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="zhz-pwd2" class="btn-mini" type="button" style="flex:1">修改密码</button>' +
        '<button id="zhz-out2" class="btn-mini red" type="button" style="flex:1">退出登录</button>' +
      '</div>' +
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
    panel.querySelector("#zhz-pwd2").onclick = function () {
      removeLayer(panel); panel = null;      /* 先收起面板，再打开改密卡，避免两层叠着 */
      showPwdCard();
    };
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
      var KEY = "zhz_gate_reminded_" + SCOPE;
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
