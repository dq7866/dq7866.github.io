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
    levelUp: function () { [784, 988, 1319].forEach(function (f, i) { setTimeout(function () { beep(f, .2, 'triangle', .08); }, i * 150); }); },
    tick: function () { beep(880, .07, 'square', .05); }
  };
})();

/* 幽灵车轨迹编码：固定时间步长采样 [进度(3位36进制) + 横向(2位36进制)]，每样本 5 字符 */
var Ghost = (function () {
  var DT = 0.2;          // 采样间隔（秒）
  var X0 = 1.6;          // 横向基准（playerX 范围 ±1.6）
  function enc(prog, x) {
    var z = Math.max(0, Math.min(1000, Math.round(prog * 1000)));
    var lat = Math.max(0, Math.min(80, Math.round((x + X0) * 25)));
    var zs = z.toString(36);
    while (zs.length < 3) zs = '0' + zs;
    var ls = lat.toString(36);
    while (ls.length < 2) ls = '0' + ls;
    return zs + ls;
  }
  function dec(str, i) {
    var o = i * 5;
    if (o + 5 > str.length) return null;
    var z = parseInt(str.substr(o, 3), 36);
    var lat = parseInt(str.substr(o + 3, 2), 36);
    if (!isFinite(z) || !isFinite(lat)) return null;
    return { p: z / 1000, x: lat / 25 - X0 };
  }
  // 取 t 秒时的插值位置
  function at(str, t) {
    if (!str || str.length < 5) return null;
    var n = Math.floor(str.length / 5);
    var f = t / DT;
    var i = Math.floor(f);
    if (i >= n) return null;
    var a = dec(str, i), b = dec(str, Math.min(n - 1, i + 1));
    if (!a || !b) return a;
    var k = f - i;
    return { p: a.p + (b.p - a.p) * k, x: a.x + (b.x - a.x) * k };
  }
  return { DT: DT, enc: enc, at: at, valid: function (s) { return !!(s && typeof s === 'string' && s.length >= 25 && /^[0-9a-z]+$/.test(s)); } };
})();

var Game = (function () {
  var cv, ctx, W = 0, H = 0;
  var track = null, trackIdx = 0;
  var running = false, paused = false, finished = false;
  var pos = 0, speed = 0, playerX = 0, vx = 0, bgOffset = 0, shake = 0;
  var elapsed = 0, coinsGot = 0, trickScore = 0, wheelieT = 0, dist = 0;
  var MAX = 11000, ACCEL, BRAKE, DECEL, OFFDECEL = 0, OFFLIMIT = 0;
  var CENTRIF = 0.26;
  var bikeType = 'commuter', kmhMul = 1, steerMul = 1, offMul = 1;
  // 三种基础车的性能差异：极速 / 转向灵敏度 / 出界惩罚（越大越惨）/ 抓地
  var PERF = {
    commuter: { max: 0.92, steer: 1.00, off: 1.00, grip: 1.00 },
    road: { max: 1.08, steer: 1.18, off: 1.30, grip: 0.88 },
    mtb: { max: 0.99, steer: 1.02, off: 0.62, grip: 1.20 },
    gravel: { max: 1.03, steer: 1.04, off: 0.80, grip: 1.08 },
    ebike: { max: 1.20, steer: 0.86, off: 1.15, grip: 1.02 }
  };
  // 改装效果
  var gripMul = 1, accelMul = 1, brakeMul = 1, suspMul = 1;
  var windForce = 0, hardLimit = 1.55, windNow = 0, windPhase = 0;
  var ghostRec = '', gAcc = 0;
  var ghost = null;          // { nickname, timeMs, path, mine }
  var hooks = {}, last = 0, raf = 0, tickN = 0;
  var pendingRes = null;
  var splits = [], SPLIT_AT = [.25, .5, .75];

  function setKeys() {
    ACCEL = MAX / 4.6 * accelMul;
    BRAKE = -MAX / 1.15;
    DECEL = -MAX / 7;
    OFFDECEL = -MAX / 1.7;
    OFFLIMIT = MAX / 3.4;
  }

  function reset() {
    pos = 0; speed = 0; playerX = 0; vx = 0; bgOffset = 0; shake = 0;
    elapsed = 0; coinsGot = 0; trickScore = 0; wheelieT = 0; dist = 0;
    finished = false; splits = []; ghostRec = ''; gAcc = 0; windPhase = 0; windNow = 0;
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

    var tire = Save.up('tire'), aero = Save.up('aero'), drive = Save.up('drive'),
      susp = Save.up('susp'), brake = Save.up('brake');

    kmhMul = (track.kmh || 1) * pf.max * (1 + 0.028 * aero);
    MAX = 11000 * kmhMul;
    steerMul = pf.steer;
    offMul = pf.off * (1 - 0.055 * tire);
    gripMul = (pf.grip || 1) * (track.grip == null ? 1 : track.grip) * (1 + 0.055 * tire);
    accelMul = 1 + 0.07 * drive;
    brakeMul = 1 + 0.075 * brake;
    suspMul = 1 - 0.09 * susp;
    windForce = track.wind || 0;
    hardLimit = track.hard || 1.55;
    if (gripMul < 0.42) gripMul = 0.42;
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

    /* 转向：横向速度模型 —— 抓地力越低，轮胎越"跟不上"指令，收油后还在飘 */
    var steer = Controls.steer;
    var targetVx = steer * 0.95 * steerMul * (0.42 + 0.58 * pct);
    var resp = Math.min(18, 9.0 * gripMul);
    vx += (targetVx - vx) * Math.min(1, resp * dt);
    playerX += vx * dt;
    // 过弯离心力
    playerX -= dx * pct * seg.curve * CENTRIF;
    // 湿滑路面：随机小幅打滑
    if (gripMul < 0.92) vx += (Math.random() - .5) * (1 - gripMul) * 1.1 * dt;

    // 侧风：周期推偏，需要反向压身（起步前 2.5 秒逐渐加大，给你反应时间）
    if (windForce) {
      windPhase += dt;
      var w = Math.sin(windPhase * 0.75) * 0.68 + Math.sin(windPhase * 0.31 + 1.2) * 0.32;
      var ramp = Math.min(1, elapsed / 2.5);
      windNow = w * ramp;
      playerX += windForce * windNow * dt;
    }

    // 坡度：上坡减速、下坡加速（避震好则颠簸影响小；坡度限幅，避免陡坡直接停死）
    var slope = (seg.p2.world.y - seg.p1.world.y) / Engine.SEG;
    var grade = Math.max(-0.6, Math.min(0.6, slope));
    speed -= grade * 3000 * dt * suspMul;

    // 输入：加速 / 刹车
    var pitch = Controls.pitch;
    var gas = Controls.gas, brake = Controls.brake;
    if (gas) speed += ACCEL * (pitch > .3 ? 1.08 : 1) * dt;
    else speed += DECEL * dt;
    if (brake) {
      var grip01 = Math.min(1, gripMul);
      speed += BRAKE * brakeMul * (0.52 + 0.48 * grip01) * (pitch < -.3 ? 1.55 : 1) * dt;
    }

    /* 出界：只压低「速度上限」，不再无限减速 —— 
       否则一旦冲出路面就会永久停在 0，再也爬不起来（旧版致命 bug） */
    var offCap = OFFLIMIT * offMul;
    if (Math.abs(playerX) > 1) {
      if (speed > offCap) speed = Math.max(offCap, speed + OFFDECEL * dt);
      shake = Math.min(1, shake + dt * 2);
    }
    // 硬阈值（窄道更小）：彻底冲出路面，压得更低
    if (Math.abs(playerX) > hardLimit) {
      var hardCap = offCap * 0.5;
      if (speed > hardCap) speed = Math.max(hardCap, speed + OFFDECEL * 1.5 * dt);
      shake = Math.min(1, shake + dt * 3.5);
    }
    if (playerX < -2.4) { playerX = -2.4; vx = 0; }
    if (playerX > 2.4) { playerX = 2.4; vx = 0; }

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

    // 幽灵轨迹采样
    gAcc += dt;
    if (gAcc >= Ghost.DT) {
      gAcc = 0;
      if (ghostRec.length < 4000) {
        ghostRec += Ghost.enc((pos + Engine.PLAYERZ) / Engine.length(), playerX);
      }
    }

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
    var xpGain = Math.round(earn * 0.8 + dist / 12);
    var lvUp = Save.addXp(xpGain);
    if (lvUp) Sfx.levelUp();
    var rec = track ? Save.setBest(track.id, time, ghostRec) : false;

    // 完赛统一进账：驱动每日任务进度 + 本赛季积分（须在 record 判定之后调用）
    var prog = null;
    try {
      prog = Progress.onFinish({
        trackId: track.id, time: time, coins: coinsGot, trick: trickScore,
        earn: earn, dist: dist, record: rec
      });
    } catch (e) { prog = null; }

    pendingRes = {
      trackId: track.id, trackName: track.name + ' ' + track.icon,
      time: time, coins: coinsGot, trick: Math.round(trickScore),
      earn: earn, dist: dist, record: rec, best: track ? Save.bestOf(track.id) : null,
      bonus: bonus, ghost: ghostRec, xp: xpGain, levelUp: lvUp, level: Save.level(),
      lvReward: Save.lastLevelReward(),
      seasonPoints: prog ? prog.points : 0, seasonTotal: prog ? prog.points_total : 0,
      missions: (function () { try { return Progress.daily(); } catch (e) { return null; } })(),
      bike: bikeType
    };
    setTimeout(function () { running = false; hooks.onFinish && hooks.onFinish(pendingRes); }, 900);
  }

  function state() {
    return {
      speed: speed, kmh: Math.round(speed / 11000 * 46),
      coins: coinsGot, trick: Math.round(trickScore),
      progress: Math.min(1, (pos + Engine.PLAYERZ) / Engine.length()),
      elapsed: elapsed, trackName: track ? track.name : '',
      x: playerX, grade: (function () {
        var sg = Engine.findSegment(pos + Engine.PLAYERZ);
        return (sg.p2.world.y - sg.p1.world.y) / Engine.SEG;
      })(),
      wind: windForce ? windNow * windForce : 0, windMax: windForce,
      grip: gripMul, ghost: ghost ? ghost.nickname : ''
    };
  }

  /* ---------------- 幽灵车 ---------------- */
  function setGhost(g) {
    if (!g || !Ghost.valid(g.path)) { ghost = null; return false; }
    ghost = g;
    return true;
  }
  function ghostAhead() {
    if (!ghost) return null;
    var gp = Ghost.at(ghost.path, elapsed);
    if (!gp) return null;
    return gp;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    if (!track) {
      ctx.clearRect(0, 0, W, H);
      drawWeather();
      return;
    }
    var sh = shake * 7;
    ctx.save();
    if (sh > .2) ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);
    var view = Engine.render(ctx, W, H, {
      position: pos, playerX: playerX, bgOffset: bgOffset,
      draw: W < 900 ? 180 : 230, camH: Engine.CAMH
    });
    ctx.restore();
    drawGhost(view);
    drawPlayer();
    if (speed / MAX > .72) drawSpeedLines();
    drawWeather();
  }

  function drawGhost(view) {
    if (!ghost || !view) return;
    var gp = ghostAhead();
    if (!gp) return;
    var total = Engine.length();
    var gz = gp.p * total;
    var gi = Math.floor(gz / Engine.SEG);
    if (gi < view.baseIndex + 1 || gi >= view.baseIndex + view.drawn) return;
    var seg = Engine.segAt(gi);
    var img = ghost.mine ? Sprites.c.ghostMine : Sprites.c.ghost;
    var box = Engine.spriteBox(seg, gp.x, 470, W, H, img.height / img.width);
    if (!box) return;
    var near = 1 - Math.min(1, (gi - view.baseIndex) / view.drawn);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.55 * near;
    ctx.drawImage(img, box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
    if (near > 0.05) {
      ctx.font = '600 12px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = ghost.mine ? 'rgba(255,214,130,.9)' : 'rgba(180,232,255,.95)';
      ctx.fillText((ghost.mine ? '你最佳 ' : '') + ghost.nickname, box.x + box.w / 2, box.y - 6);
    }
    ctx.restore();
  }

  function drawPlayer() {
    var img = Sprites.playerBike(bikeType, Controls.pitch);
    var base = Math.min(W, H) * 0.38;
    var w = base, h = w * img.height / img.width;
    var x = W / 2 - w / 2;
    var y = H - h * 0.80;
    var jx = (Math.random() - .5) * (speed / MAX) * 4;
    var jy = (Math.random() - .5) * (speed / MAX) * 3;
    var lean = Controls.steer * 0.22 + Math.max(-0.18, Math.min(0.18, vx * 0.16));
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

  /* 天气：雨帘 / 风线（纯 Canvas 叠加，不影响物理） */
  function drawWeather() {
    if (!track) return;
    var pf = Engine.def();
    if (!pf) return;
    if (pf.theme === 'rain') {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,222,245,.32)';
      ctx.lineWidth = 1.4;
      var t = Date.now() / 60;
      for (var i = 0; i < 46; i++) {
        var sx = ((i * 137 + t * 260) % (W + 200)) - 100;
        var sy = ((i * 91 + t * 420) % (H + 160)) - 80;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 9, sy + 24); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,86,116,.14)';
      ctx.fillRect(0, 0, W, H * .55);
      ctx.restore();
    } else if (pf.theme === 'wind' && Math.abs(windNow) > .25) {
      ctx.save();
      var a = Math.abs(windNow) * 0.30;
      ctx.strokeStyle = 'rgba(255,255,255,' + a + ')';
      ctx.lineWidth = 1.6;
      var dir = windNow > 0 ? 1 : -1;
      var tt = Date.now() / 26;
      for (var k = 0; k < 16; k++) {
        var y = ((k * 59 + tt * 90) % (H + 120)) - 60;
        var x = ((k * 211 + tt * 170 * dir) % (W + 300) + W + 300) % (W + 300) - 150;
        var len = 40 + (k % 5) * 26;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * dir, y); ctx.stroke();
      }
      ctx.restore();
    }
  }

  return {
    init: init, start: start, state: state,
    setPaused: function (v) { paused = v; if (!v) last = 0; },
    isPaused: function () { return paused; },
    isRunning: function () { return running; },
    stop: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    bike: function (b) { bikeType = b; },
    setGhost: setGhost,
    clearGhost: function () { ghost = null; },
    hasGhost: function () { return !!ghost; },
    sfx: Sfx
  };
})();
