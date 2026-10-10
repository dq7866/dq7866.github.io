/* 风驰骑行 —— 输入：体感（陀螺仪）+ 触屏按钮 + 键盘 */
var Controls = (function () {
  var btn = {};            // 触屏按钮状态
  var el = {};             // 按钮 DOM
  var keys = {};           // 键盘
  var sensor = { on: false, granted: false, avail: ('DeviceOrientationEvent' in window) };
  var base = null;         // 校准基准
  var raw = { steer: 0, pitch: 0 };
  var steer = 0, pitch = 0; // 平滑后 -1..1
  var gas = false, brake = false; // 供 Game 读取

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
    keys[k] = v;
    if (k === 'ArrowUp' || k === 'ArrowDown' || k === ' ' || k.indexOf('Arrow') === 0) e.preventDefault();
  }

  /* ---------- 体感 ---------- */
  function orient(e) {
    var b = e.beta || 0, g = e.gamma || 0;
    var ang = 0;
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') ang = window.screen.orientation.angle;
    else if (typeof window.orientation === 'number') ang = window.orientation;
    var sx, sy;
    // 按屏幕方向把设备角映射到「左右摆」与「前后压」
    if (ang === 90) { sx = b; sy = -g; }
    else if (ang === -90 || ang === 270) { sx = -b; sy = g; }
    else { sx = g; sy = b; }
    if (!base) base = { sx: sx, sy: sy };
    raw.steer = sx - base.sx;
    raw.pitch = sy - base.sy;
  }

  function enableSensor(cb) {
    function start() {
      window.addEventListener('deviceorientation', orient, true);
      sensor.on = true;
      sensor.granted = true;
      base = null;
      setTimeout(function () { if (sensor.on) base = null; }, 300);
      cb && cb(true);
    }
    if (sensor.avail && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (r) {
        if (r === 'granted') start(); else { sensor.on = false; cb && cb(false); }
      }).catch(function () { sensor.on = false; cb && cb(false); });
    } else if (sensor.avail) {
      start();
    } else {
      sensor.on = false; cb && cb(false);
    }
  }
  function disableSensor() {
    window.removeEventListener('deviceorientation', orient, true);
    sensor.on = false;
    raw.steer = raw.pitch = 0;
    base = null;
  }
  function calibrate() { base = null; }

  /* ---------- 每帧更新 ---------- */
  function update(dt) {
    gas = !!(keys['ArrowUp'] || keys['w'] || keys['W'] || btn.gas);
    brake = !!(keys['ArrowDown'] || keys['s'] || keys['S'] || keys[' '] || btn.brake);
    var kl = !!(keys['ArrowLeft'] || keys['a'] || keys['A'] || btn.left);
    var kr = !!(keys['ArrowRight'] || keys['d'] || keys['D'] || btn.right);
    var kw = !!(keys['q'] || keys['Q'] || btn.wheelie);
    var ks = !!(keys['e'] || keys['E'] || btn.stoppie);

    // 转向目标
    var st = 0;
    if (sensor.on) {
      var s = raw.steer;
      var dead = 4, full = 22;
      if (Math.abs(s) < dead) st = 0;
      else st = Math.sign(s) * Math.min(1, (Math.abs(s) - dead) / (full - dead));
    }
    if (kl) st = -1; if (kr) st = 1;

    // 俯仰目标（翘头 / 翘尾）
    var pt = 0;
    if (sensor.on) {
      var p = raw.pitch;
      var pd = 10, pf = 30;
      if (Math.abs(p) < pd) pt = 0;
      else pt = Math.sign(p) * Math.min(1, (Math.abs(p) - pd) / (pf - pd));
    }
    if (kw) pt = 1; if (ks) pt = -1;

    var k1 = Math.min(1, dt * 9), k2 = Math.min(1, dt * 7);
    steer += (st - steer) * k1;
    pitch += (pt - pitch) * k2;

    return { gas: gas, brake: brake, left: kl, right: kr };
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
    sensorAvail: function () { return sensor.avail; },
    isSensorOn: function () { return sensor.on; },
    get steer() { return steer; },
    get pitch() { return pitch; },
    get gas() { return gas; },
    get brake() { return brake; },
    press: set
  };
})();
