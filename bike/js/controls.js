/* 风驰骑行 —— 输入：体感（重力感应/陀螺仪）+ 触屏按钮 + 键盘
 *
 * 取数优先级（高 → 低）：
 *   1) deviceorientation           iOS Safari / Android Chrome 主通道
 *   2) deviceorientationabsolute   部分 Android 只发这个（国产内核常见）
 *   3) devicemotion                前两者都不来事件时，用「含重力加速度」反算倾角
 *
 * 三条必须知道的平台事实（不是代码 bug）：
 *   · iOS 13+ 必须在「用户手势」里调用 DeviceOrientationEvent.requestPermission()
 *     才会弹系统授权框；且每次刷新页面都要重新授权。
 *   · iOS 必须在 HTTPS 下才给传感器数据（HTTP 页面直接返回空值）。
 *   · 微信内置浏览器（iOS）静默屏蔽重力感应 —— 即便 requestPermission 返回
 *     granted 也收不到有效事件，只能引导用户去系统浏览器打开。
 *
 * 所以本模块在「开启」后会用 1.6 秒探测事件是否真的到达；收不到就判定失败，
 * 由 UI 给出确切原因，而不是假装开好了却毫无反应。
 */
var Controls = (function () {
  var btn = {};             // 触屏按钮状态
  var el = {};              // 按钮 DOM
  var keys = {};            // 键盘

  /* ---------- 环境判定 ---------- */
  var UA = navigator.userAgent || '';
  var ENV = {
    mobile: /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Windows Phone/i.test(UA) ||
            (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '')),
    wechat: /MicroMessenger/i.test(UA),
    secure: location.protocol === 'https:' || location.hostname === 'localhost' ||
            location.hostname === '127.0.0.1'
  };

  /* ---------- 体感状态 ---------- */
  var sensor = {
    avail: ('DeviceOrientationEvent' in window),
    motionAvail: ('DeviceMotionEvent' in window),
    needPerm: false,
    perm: 'unknown',        // unknown | granted | denied | unsupported
    on: false,
    channel: 'none',        // none | orient | absolute | motion
    lastEvt: 0,             // 最近一次有效事件的时间戳
    evts: 0                 // 累计有效事件数（诊断用）
  };
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') sensor.needPerm = true;

  var base = null;                    // 校准基准
  var raw = { steer: 0, pitch: 0 };   // 相对基准的倾角（度）
  var last = { alpha: null, beta: null, gamma: null, sx: 0, sy: 0 };
  var steer = 0, pitch = 0;           // 平滑后的控制量 -1..1
  var gas = false, brake = false;
  var sens = 1;                       // 0 稳 / 1 标准 / 2 灵敏

  var SENS = [
    { sd: 6, sf: 30, pd: 14, pf: 42 },   // 稳：要摆得更多才有反应
    { sd: 4, sf: 22, pd: 10, pf: 32 },   // 标准
    { sd: 3, sf: 15, pd: 7,  pf: 22 }    // 灵敏：小幅动作即转向
  ];

  var bound = { orient: false, absolute: false, motion: false };
  var chLast = { orient: 0, absolute: 0, motion: 0 };
  var curCh = 'none';
  var probeTimer = null;

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* ---------- 触屏按钮 ---------- */
  function bind() {
    var list = document.querySelectorAll('#pad .pbtn');
    for (var i = 0; i < list.length; i++) {
      (function (e) {
        var k = e.getAttribute('data-k');
        el[k] = e;
        function down(ev) { ev.preventDefault(); set(k, true); }
        function up(ev) { ev.preventDefault(); set(k, false); }
        e.addEventListener('touchstart', down, { passive: false });
        e.addEventListener('touchend', up, { passive: false });
        e.addEventListener('touchcancel', up, { passive: false });
        e.addEventListener('mousedown', down);
        e.addEventListener('mouseup', up);
        e.addEventListener('mouseleave', function () { set(k, false); });
      })(list[i]);
    }
  }
  function set(k, v) {
    btn[k] = v;
    if (el[k]) { if (v) el[k].classList.add('on'); else el[k].classList.remove('on'); }
  }

  /* ---------- 键盘 ---------- */
  function onKey(e, v) {
    var k = e.key;
    if (!k) return;
    keys[k] = v;
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === ' ' || k.indexOf('Arrow') === 0) e.preventDefault();
  }

  /* ---------- 取角：屏幕方向 → 转向轴 / 俯仰轴 ---------- */
  function screenAngle() {
    var a = 0;
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
      a = window.screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
      a = window.orientation;
    }
    a = ((a % 360) + 360) % 360;
    return a;
  }
  function axes(beta, gamma) {
    var a = screenAngle(), sx, sy;
    // 横屏时「前后倾」变成屏幕轴的左右摆，所以两轴对调
    if (a === 90) { sx = beta; sy = -gamma; }
    else if (a === 270) { sx = -beta; sy = gamma; }
    else { sx = gamma; sy = beta; }
    return { sx: sx, sy: sy };
  }

  /* ---------- 三个通道的事件 ---------- */
  function feed(sx, sy, ch) {
    chLast[ch] = now();
    // 谁的新鲜用谁，优先级 orient > absolute > motion
    var use;
    if (now() - chLast.orient <= 1200) use = 'orient';
    else if (now() - chLast.absolute <= 1200) use = 'absolute';
    else use = 'motion';
    if (ch !== use) return;
    if (use !== curCh) { curCh = use; sensor.channel = use; base = null; }

    if (!base) base = { steer: sx, pitch: sy };
    raw.steer = sx - base.steer;
    raw.pitch = sy - base.pitch;
    sensor.lastEvt = now();
    sensor.evts++;
  }

  function onOrient(e) {
    if (!e || (e.alpha == null && e.beta == null && e.gamma == null)) return; // 空事件（微信 iOS 常见）
    last.alpha = e.alpha; last.beta = e.beta; last.gamma = e.gamma;
    var a = axes(e.beta || 0, e.gamma || 0);
    last.sx = a.sx; last.sy = a.sy;
    feed(a.sx, a.sy, 'orient');
  }
  function onOrientAbs(e) {
    if (!e || (e.alpha == null && e.beta == null && e.gamma == null)) return;
    last.alpha = e.alpha; last.beta = e.beta; last.gamma = e.gamma;
    var a = axes(e.beta || 0, e.gamma || 0);
    last.sx = a.sx; last.sy = a.sy;
    feed(a.sx, a.sy, 'absolute');
  }
  // 兜底：用含重力的加速度反算「左右倾角」（只要手机没在剧烈运动中就很准）
  function onMotion(e) {
    var g = e && e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null || g.z == null) return;
    var a = screenAngle();
    var z = (Math.abs(g.z) < 2 ? (g.z >= 0 ? 2 : -2) : g.z);
    var tilt;
    if (a === 90 || a === 270) tilt = Math.atan2(-g.y, z) * 180 / Math.PI;  // 横屏：绕设备前后轴
    else tilt = Math.atan2(g.x, z) * 180 / Math.PI;                          // 竖屏：绕设备上下轴
    last.gx = g.x; last.gy = g.y; last.gz = g.z;
    feed(tilt, 0, 'motion');
  }

  function attachAll() {
    if (!bound.orient) { window.addEventListener('deviceorientation', onOrient, true); bound.orient = true; }
    if (!bound.absolute) { window.addEventListener('deviceorientationabsolute', onOrientAbs, true); bound.absolute = true; }
    if (!bound.motion && sensor.motionAvail) { window.addEventListener('devicemotion', onMotion, true); bound.motion = true; }
  }
  function detachAll() {
    if (bound.orient) { window.removeEventListener('deviceorientation', onOrient, true); bound.orient = false; }
    if (bound.absolute) { window.removeEventListener('deviceorientationabsolute', onOrientAbs, true); bound.absolute = false; }
    if (bound.motion) { window.removeEventListener('devicemotion', onMotion, true); bound.motion = false; }
  }

  /* ---------- 开关 ---------- */
  function enableSensor(cb) {
    if (probeTimer) { clearInterval(probeTimer); probeTimer = null; }
    if (sensor.on) { cb && cb(true, 'already'); return; }
    if (!sensor.avail && !sensor.motionAvail) {
      sensor.perm = 'unsupported';
      cb && cb(false, 'unsupported');
      return;
    }
    if (!ENV.secure) { cb && cb(false, 'insecure'); return; }

    sensor.evts = 0;
    sensor.lastEvt = 0;
    curCh = 'none';
    chLast.orient = chLast.absolute = chLast.motion = 0;
    base = null;

    function afterPerm(ok, why) {
      if (!ok) { sensor.perm = 'denied'; sensor.on = false; cb && cb(false, why || 'denied'); return; }
      sensor.perm = 'granted';
      attachAll();
      var t0 = now();
      probeTimer = setInterval(function () {
        if (sensor.evts > 0) {                    // 事件真的来了
          clearInterval(probeTimer); probeTimer = null;
          sensor.on = true;
          sensor.channel = curCh;
          base = null;
          window.addEventListener('orientationchange', onRotate, false);
          if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
            window.screen.orientation.addEventListener('change', onRotate, false);
          }
          cb && cb(true, curCh);
        } else if (now() - t0 > 1600) {           // 授权过了却收不到数据 → 静默失效
          clearInterval(probeTimer); probeTimer = null;
          detachAll();
          sensor.on = false;
          cb && cb(false, 'noevent');
        }
      }, 120);
    }

    if (sensor.needPerm) {
      // 必须在用户手势（click/touch）里同步调用，否则 iOS 直接 reject
      try {
        DeviceOrientationEvent.requestPermission().then(function (r) {
          if (r === 'granted') afterPerm(true);
          else afterPerm(false, 'denied');
        }).catch(function () { afterPerm(false, 'error'); });
      } catch (e) { afterPerm(false, 'error'); }
    } else {
      afterPerm(true);
    }
  }

  function disableSensor() {
    if (probeTimer) { clearInterval(probeTimer); probeTimer = null; }
    detachAll();
    window.removeEventListener('orientationchange', onRotate, false);
    if (window.screen && window.screen.orientation && window.screen.orientation.removeEventListener) {
      window.screen.orientation.removeEventListener('change', onRotate, false);
    }
    sensor.on = false;
    sensor.channel = 'none';
    curCh = 'none';
    raw.steer = raw.pitch = 0;
    base = null;
  }

  // 屏幕方向变了（竖↔横），重新取基准，避免突然跑偏
  function onRotate() { base = null; }

  function calibrate() { base = null; }

  /* ---------- 每帧更新 ---------- */
  function update(dt) {
    gas = !!(keys['ArrowUp'] || keys['w'] || keys['W'] || btn.gas);
    brake = !!(keys['ArrowDown'] || keys['s'] || keys['S'] || keys[' '] || btn.brake);
    var kl = !!(keys['ArrowLeft'] || keys['a'] || keys['A'] || btn.left);
    var kr = !!(keys['ArrowRight'] || keys['d'] || keys['D'] || btn.right);
    var kw = !!(keys['q'] || keys['Q'] || btn.wheelie);
    var ks = !!(keys['e'] || keys['E'] || btn.stoppie);

    var S = SENS[sens] || SENS[1];

    // 转向目标
    var st = 0;
    if (sensor.on) {
      var s = raw.steer;
      if (Math.abs(s) >= S.sd) st = Math.sign(s) * Math.min(1, (Math.abs(s) - S.sd) / (S.sf - S.sd));
    }
    if (kl) st = -1;
    if (kr) st = 1;

    // 俯仰目标（翘头 / 翘尾）—— motion 兜底通道不出俯仰
    var pt = 0;
    if (sensor.on && sensor.channel !== 'motion') {
      var p = raw.pitch;
      if (Math.abs(p) >= S.pd) pt = Math.sign(p) * Math.min(1, (Math.abs(p) - S.pd) / (S.pf - S.pd));
    }
    if (kw) pt = 1;
    if (ks) pt = -1;

    // 平滑：往目标走比回中稍慢，回中更跟手
    var k1 = Math.min(1, dt * (Math.abs(st) < Math.abs(steer) ? 13 : 9));
    var k2 = Math.min(1, dt * 7);
    steer += (st - steer) * k1;
    pitch += (pt - pitch) * k2;

    return { gas: gas, brake: brake, left: kl, right: kr };
  }

  /* ---------- 诊断 ---------- */
  function status() {
    return {
      env: { mobile: ENV.mobile, wechat: ENV.wechat, secure: ENV.secure },
      avail: sensor.avail,
      motionAvail: sensor.motionAvail,
      needPerm: sensor.needPerm,
      perm: sensor.perm,
      on: sensor.on,
      channel: sensor.channel,
      evts: sensor.evts,
      age: sensor.lastEvt ? (now() - sensor.lastEvt) : -1,
      raw: { steer: raw.steer, pitch: raw.pitch },
      last: { alpha: last.alpha, beta: last.beta, gamma: last.gamma, sx: last.sx, sy: last.sy },
      sens: sens,
      screenAngle: screenAngle()
    };
  }
  // 只监听、不进入控制态（诊断页用，便于观察原始读数）
  function probe(cb) {
    function go() { attachAll(); cb && cb(true); }
    if (sensor.needPerm) {
      try {
        DeviceOrientationEvent.requestPermission().then(function (r) {
          if (r === 'granted') { sensor.perm = 'granted'; go(); }
          else { sensor.perm = 'denied'; cb && cb(false, 'denied'); }
        }).catch(function () { sensor.perm = 'error'; cb && cb(false, 'error'); });
      } catch (e) { cb && cb(false, 'error'); }
    } else { go(); }
  }
  function rawReset() {
    sensor.evts = 0;
    chLast.orient = chLast.absolute = chLast.motion = 0;
    curCh = 'none';
  }

  return {
    init: function () {
      bind();
      window.addEventListener('keydown', function (e) { onKey(e, true); });
      window.addEventListener('keyup', function (e) { onKey(e, false); });
      window.addEventListener('blur', function () { keys = {}; for (var k in btn) set(k, false); });
    },
    update: update,
    enableSensor: enableSensor,
    disableSensor: disableSensor,
    calibrate: calibrate,
    setSens: function (n) { sens = Math.max(0, Math.min(2, n | 0)); },
    sensorAvail: function () { return sensor.avail || sensor.motionAvail; },
    isSensorOn: function () { return sensor.on; },
    needPermission: function () { return sensor.needPerm; },
    isMobile: function () { return ENV.mobile; },
    inWeChat: function () { return ENV.wechat; },
    isSecure: function () { return ENV.secure; },
    status: status,
    probe: probe,
    rawReset: rawReset,
    get steer() { return steer; },
    get pitch() { return pitch; },
    get gas() { return gas; },
    get brake() { return brake; },
    get sens() { return sens; },
    press: set
  };
})();
