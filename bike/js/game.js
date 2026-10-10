/* 风驰骑行 —— 物理、玩法与主循环 */
var Sfx = (function () {
  var ac = null;
  function C() {
    if (!ac) { var A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); }
    return ac;
  }
  function beep(f, d, type, vol) {
    if (!Save.get().soundOn) return;
    var a = C(); if (!a) return;
    try {
      var o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(a.destination);
      var t = a.currentTime;
      g.gain.setValueAtTime(vol || .07, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.start(t); o.stop(t + d);
    } catch (e) {}
  }
  return {
    resume: function () { var a = C(); if (a && a.state === 'suspended') { try { a.resume(); } catch (e) {} } },
    coin: function () { beep(1180, .08, 'triangle', .06); setTimeout(function () { beep(1620, .09, 'triangle', .05); }, 55); },
    crash: function () { beep(96, .2, 'sawtooth', .11); },
    trick: function () { beep(680, .1, 'square', .045); },
    finish: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { beep(f, .18, 'triangle', .07); }, i * 135); }); },
    tick: function () { beep(880, .07, 'square', .05); }
  };
})();

var Game = (function () {
  var cv, ctx, W = 0, H = 0;
  var track = null, trackIdx = 0;
  var running = false, paused = false, finished = false;
  var pos = 0, speed = 0, playerX = 0, bgOffset = 0, shake = 0;
  var elapsed = 0, coinsGot = 0, trickScore = 0, wheelieT = 0, dist = 0;
  var MAX = 11000, ACCEL, BRAKE, DECEL, OFFDECEL = 0, OFFLIMIT = 0;
  var CENTRIF = 0.26;
  var bikeType = 'commuter', kmhMul = 1, steerMul = 1, offMul = 1;
  // 三种车的性能差异：极速 / 转向灵敏度 / 出界惩罚（越大越惨）
  var PERF = {
    commuter: { max: 0.92, steer: 1.00, off: 1.00 },
    road: { max: 1.08, steer: 1.20, off: 1.30 },
    mtb: { max: 0.99, steer: 1.02, off: 0.60 }
  };
  var hooks = {}, last = 0, raf = 0, tickN = 0;
  var pendingRes = null;
  var splits = [], SPLIT_AT = [.25, .5, .75];

  function setKeys() {
    ACCEL = MAX / 4.6;
    BRAKE = -MAX / 1.15;
    DECEL = -MAX / 7;
    OFFDECEL = -MAX / 1.7;
    OFFLIMIT = MAX / 3.4;
  }

  function reset() {
    pos = 0; speed = 0; playerX = 0; bgOffset = 0; shake = 0;
    elapsed = 0; coinsGot = 0; trickScore = 0; wheelieT = 0; dist = 0;
    finished = false; splits = [];
  }

  function init(canvas, h) {
    cv = canvas; ctx = cv.getContext('2d'); hooks = h || {};
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 260); });
  }
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);
    cv.width = Math.floor(W * dpr);
    cv.height = Math.floor(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function load(idx, bike) {
    trackIdx = idx;
    track = Engine.build(idx);
    var pf = PERF[bike] || PERF.commuter;
    bikeType = bike || 'commuter';
    kmhMul = (track.kmh || 1) * pf.max;
    MAX = 11000 * kmhMul;
    steerMul = pf.steer; offMul = pf.off;
    setKeys();
    reset();
  }

  function start(idx, bike) {
    load(idx, bike);
    running = true; paused = false;
    last = 0;
    Sfx.resume();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function frame(ts) {
    if (!last) last = ts;
    var dt = Math.min((ts - last) / 1000, 1 / 20);
    last = ts;
    if (running && !paused) {
      Controls.update(dt);
      if (!finished) { update(dt); elapsed += dt; }
      else { updateAfterFinish(dt); }
    }
    render();
    tickN++;
    if (tickN % 3 === 0 && hooks.onTick) hooks.onTick(state());
    raf = requestAnimationFrame(frame);
  }

  /* ---------------- 物理 ---------------- */
  function update(dt) {
    var seg = Engine.findSegment(pos + Engine.PLAYERZ);
    var pct = speed / MAX;
    var dx = dt * 2 * pct;

    // 转向（体感/按钮）
    var steer = Controls.steer;
    playerX += steer * dt * 0.82 * steerMul * (0.42 + 0.58 * pct);
    // 过弯离心力
    playerX -= dx * pct * seg.curve * CENTRIF;

    // 坡度：上坡减速、下坡加速
    var slope = (seg.p2.world.y - seg.p1.world.y) / Engine.SEG;
    speed -= slope * 7800 * dt;

    // 输入：加速 / 刹车
    var pitch = Controls.pitch;
    var gas = Controls.gas, brake = Controls.brake;
    if (gas) speed += ACCEL * (pitch > .3 ? 1.08 : 1) * dt;
    else speed += DECEL * dt;
    if (brake) speed += BRAKE * (pitch < -.3 ? 1.55 : 1) * dt;

    // 出界
    var off = Math.abs(playerX) > 1;
    if (off) {
      speed += OFFDECEL * dt;
      if (speed > OFFLIMIT * offMul) speed = OFFLIMIT * offMul;
      shake = Math.min(1, shake + dt * 2);
    }

    if (speed > MAX * 1.12) speed = MAX * 1.12;
    if (speed < 0) speed = 0;

    pos += speed * dt;
    dist += speed * dt / Engine.SEG * 3;   // 世界单位 → 米
    bgOffset += seg.curve * pct * dt * 30;

    // 技巧分：高速翘头/翘尾
    if (pitch > .35 && pct > .45) {
      wheelieT += dt; trickScore += dt * 26 * pct;
      if (wheelieT > 0.55 && wheelieT < 0.75) { hooks.onTrick && hooks.onTrick('翘头!', '#a78bfa'); Sfx.trick(); }
    } else if (pitch < -.35 && pct > .3) {
      trickScore += dt * 12;
    } else wheelieT = 0;

    shake = Math.max(0, shake - dt * 3);

    // 拾取 / 碰撞
    collect();

    // 分段时间点
    var p = (pos + Engine.PLAYERZ) / Engine.length();
    for (var i = 0; i < SPLIT_AT.length; i++) {
      if (p >= SPLIT_AT[i] && !splits[i]) {
        splits[i] = elapsed;
        hooks.onSplit && hooks.onSplit(i, elapsed);
      }
    }

    // 完赛
    if (pos + Engine.PLAYERZ >= Engine.length() - 20 * Engine.SEG) finish();
  }

  function updateAfterFinish(dt) {
    speed += DECEL * 1.6 * dt;
    if (speed < 0) speed = 0;
    pos += speed * dt;
    shake = Math.max(0, shake - dt * 2);
  }

  function collect() {
    var pz = pos + Engine.PLAYERZ;
    var idx = Math.floor(pz / Engine.SEG);
    for (var d = -2; d <= 2; d++) {
      var i = idx + d;
      if (i < 0) continue;
      var seg = Engine.segAt(i);
      for (var s = 0; s < seg.sprites.length; s++) {
        var sp = seg.sprites[s];
        var gap = Math.abs(sp.offset - playerX);
        if (sp.kind === 'coin' && !sp.taken && gap < 0.30) {
          sp.taken = true; coinsGot++; Sfx.coin();
          hooks.onCoin && hooks.onCoin(coinsGot);
        } else if (sp.kind === 'puddle' && gap < 0.55) {
          speed *= 0.965;
        } else if ((sp.kind === 'cone' || sp.kind === 'rock' || sp.kind === 'barrier') && gap < (sp.w / 640) * 0.24) {
          if (!sp._hit) {
            sp._hit = true;
            speed *= 0.42;
            shake = 1;
            Sfx.crash();
            hooks.onCrash && hooks.onCrash();
          }
        }
      }
    }
  }

  function finish() {
    finished = true;
    Sfx.finish();
    var time = elapsed;
    var bonus = Math.max(0, Math.round((90 - time) * 3));
    var earn = Math.round(coinsGot * 8 + trickScore * 0.6 + bonus);
    Save.incRide();
    Save.addDist(dist);
    Save.addCoins(earn);
    var rec = track ? Save.setBest(track.id, time) : false;
    pendingRes = {
      trackId: track.id, trackName: track.name + ' ' + track.icon,
      time: time, coins: coinsGot, trick: Math.round(trickScore),
      earn: earn, dist: dist, record: rec, best: track ? Save.bestOf(track.id) : null,
      bonus: bonus
    };
    setTimeout(function () { running = false; hooks.onFinish && hooks.onFinish(pendingRes); }, 900);
  }

  function state() {
    return {
      speed: speed, kmh: Math.round(speed / 11000 * 46),
      coins: coinsGot, trick: Math.round(trickScore),
      progress: Math.min(1, (pos + Engine.PLAYERZ) / Engine.length()),
      elapsed: elapsed, trackName: track ? track.name : ''
    };
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (!track) { ctx.clearRect(0, 0, W, H); return; }
    var sh = shake * 7;
    ctx.save();
    if (sh > .2) ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);
    Engine.render(ctx, W, H, {
      position: pos, playerX: playerX, bgOffset: bgOffset,
      draw: W < 900 ? 180 : 230, camH: Engine.CAMH
    });
    ctx.restore();
    drawPlayer();
    if (speed / MAX > .72) drawSpeedLines();
  }

  function drawPlayer() {
    var img = Sprites.playerBike(bikeType, Controls.pitch);
    var base = Math.min(W, H) * 0.38;
    var w = base, h = w * img.height / img.width;
    var x = W / 2 - w / 2;
    var y = H - h * 0.80;
    var jx = (Math.random() - .5) * (speed / MAX) * 4;
    var jy = (Math.random() - .5) * (speed / MAX) * 3;
    var lean = Controls.steer * 0.22;
    ctx.save();
    ctx.translate(W / 2, y + h);
    ctx.rotate(lean);
    ctx.translate(-W / 2, -(y + h));
    ctx.globalAlpha = .28;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(W / 2, y + h - 4, w * .34, h * .05, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.drawImage(img, x + jx, y + jy, w, h);
    ctx.restore();
  }

  function drawSpeedLines() {
    var n = 14, a = (speed / MAX - .72) / .4;
    if (a <= 0) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + (a * .35) + ')';
    ctx.lineWidth = 2;
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * Math.PI * 2 + (Date.now() / 220) % 6.28;
      var r1 = Math.min(W, H) * (.42 + Math.random() * .1);
      var r2 = r1 + 40 + Math.random() * 70;
      var cx = W / 2, cy = H * .52;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    init: init, start: start, state: state,
    setPaused: function (v) { paused = v; if (!v) last = 0; },
    isPaused: function () { return paused; },
    isRunning: function () { return running; },
    stop: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    bike: function (b) { bikeType = b; },
    sfx: Sfx
  };
})();
