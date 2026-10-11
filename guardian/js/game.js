/* ============================================================
   冰火守门人 —— 玩法核心（/guardian/js/game.js）
   ------------------------------------------------------------
   内核来源（MSN 游戏热门榜）：
     森林冰火人   → 双生角色随时切换 + 元素相克（打错完全免疫）
     只有一道门   → 每波只亮一扇门，走错门宝石全吐
     植物大战僵尸2 → 五车道波次守阵
     暴躁贪吃蛇   → 击杀掉宝石缀成贪心尾巴，越长结算越狠、被撞越痛
   坐标：x ∈ [-1,1] 横向；z ∈ [0,1] 纵深（0 = 近端 / 1 = 远端生怪口）
   ============================================================ */
var Game = (function () {
  "use strict";
  var cv = null, ctx = null;
  var E3 = Engine3D;

  var LANES = 5;
  var DOOR_X = [-0.62, 0, 0.62];
  var DOOR_Z = 0.058;
  var BREACH_Z = 0.18;           // 越过此线判漏怪
  var GZ_MIN = 0.02, GZ_MAX = 0.62;
  var GW = 0.072;                // 守门人世界半径

  var scene = "menu";            // menu | play | over | pause
  var S = null, paused = false;
  var cur = { sceneId: "frost", diffId: "normal" };
  var net = null;                // 联机钩子（net.js 注入）
  var cbOver = null;
  var muted = false, shakeT = 0;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
  function laneX(i) { return -1 + (2 * i + 1) / LANES; }
  function dist2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }

  /* 相克：火 → 冰 克制 / 火 → 岩 免疫；水 → 岩 克制 / 水 → 冰 免疫 */
  function eff(shotEle, type) {
    if (type === "ice") return shotEle === "fire" ? 2.6 : 0;
    if (type === "rock") return shotEle === "water" ? 2.6 : 0;
    return 1;
  }

  /* ---------------- 音效 ---------------- */
  var AC = null;
  function beep(freq, dur, type, vol, slide) {
    if (muted) return;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "square"; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), AC.currentTime + dur);
      g.gain.value = vol || 0.06;
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(); o.stop(AC.currentTime + dur);
    } catch (e) {}
  }
  var sfx = {
    shoot: function (f) { beep(f || 620, 0.06, "square", 0.028); },
    hit:   function () { beep(220, 0.05, "sawtooth", 0.04); },
    kill:  function () { beep(160, 0.14, "triangle", 0.07, 60); },
    gem:   function () { beep(880, 0.05, "sine", 0.04, 1200); },
    bank:  function () { beep(520, 0.1, "sine", 0.08, 1040); setTimeout(function () { beep(780, 0.13, "sine", 0.08, 1560); }, 90); },
    wrong: function () { beep(200, 0.28, "sawtooth", 0.08, 70); },
    breach:function () { beep(120, 0.36, "sawtooth", 0.1, 45); },
    sw:    function () { beep(440, 0.07, "sine", 0.05, 660); },
    wave:  function () { beep(330, 0.11, "triangle", 0.07, 495); },
    boss:  function () { beep(90, 0.55, "sawtooth", 0.11, 55); },
    dead:  function () { beep(300, 0.5, "triangle", 0.1, 60); },
    impair:function () { beep(520, 0.3, "sawtooth", 0.09, 120); }
  };

  /* ---------------- 输入 ---------------- */
  var keys = {}, joy = null;
  function keyName(e) {
    var k = (e.key || "").toLowerCase();
    if (k === "arrowleft" || k === "a") return "left";
    if (k === "arrowright" || k === "d") return "right";
    if (k === "arrowup" || k === "w") return "up";
    if (k === "arrowdown" || k === "s") return "down";
    return k;
  }
  function onKey(e, down) {
    var k = keyName(e);
    if (["left", "right", "up", "down", " "].indexOf(k) >= 0) e.preventDefault();
    if (down && keys[k]) return;
    keys[k] = down;
    if (!down) return;
    if (k === " " || k === "e") { if (scene === "play") switchGuardian(); }
    if (k === "p") { togglePause(); }
    if (k === "m") { muted = !muted; toast(muted ? "已静音" : "声音开启", "#ffd9a8"); }
    if (k === "escape" && scene === "pause") togglePause();
  }
  function pt(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * E3.W, y: (e.clientY - r.top) / r.height * E3.H };
  }
  var isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

  /* ---------------- 局内状态 ---------------- */
  function newGame(sceneId, diffId, opt) {
    opt = opt || {};
    var sc = Config.sceneById(sceneId) || Config.SCENES[0];
    var df = Config.diffById(diffId) || Config.DIFFS[1];
    var lv = Config.levelInfo(Save.get().level);
    cur = { sceneId: sc.id, diffId: df.id };
    S = {
      sc: sc, df: df, lv: lv, duel: !!opt.duel, mySide: opt.side || "host",
      daily: !!opt.daily, perk: opt.perk || sc.perk,   /* 每日挑战可强制启用某个机制 */
      wave: 0, score: 0, gemBanked: 0, kills: 0, elites: 0, bosses: 0, maxTail: 0,
      lives: df.lives, t: 0, shake: 0, banner: "", bannerT: 0, toast: null, toastT: 0,
      enemies: [], shots: [], gems: [], parts: [], texts: [], hazards: [],
      spawnLeft: 0, spawnT: 0, inter: 2.8, waveDone: false,
      lit: ri(0, 2), waveEle: "ice", flawless: true,
      freezeT: 0, shieldT: 0, sandT: 0, lavaT: 0, impairCd: 0, sandGust: 0,
      enemyScore: 0, over: false, reason: "", modeKey: opt.modeKey || null,
      peer: opt.duel ? { name: "对手", lives: df.lives, score: 0, online: false } : null
    };
    S.g1 = mkG("fire", laneX(1));
    S.g2 = mkG("water", laneX(3));
    S.act = S.g1;
    if (S.perk === "lava") S.lavaT = rnd(3.5, 6);
    if (S.perk === "sandstorm") S.sandT = rnd(5, 9);
    nextWave();
    return S;
  }
  function mkG(ele, x) {
    var lv = S.lv;
    return { ele: ele, x: x, z: 0.30, hp: 100 + lv.hpBonus, maxHp: 100 + lv.hpBonus,
             down: false, resp: 0, cd: 0, trail: [], hist: [], bankCd: 0, hurtT: 0, flash: 0 };
  }

  function nextWave() {
    S.wave++;
    var n = S.wave;
    if (S.sc.elem === "mix") S.waveEle = (n % 3 === 0) ? "mix" : (Math.random() < 0.5 ? "ice" : "rock");
    else if (S.sc.elem === "boss") S.waveEle = (n % 3 === 0) ? "mix" : (n % 2 ? "ice" : "rock");
    else S.waveEle = S.sc.elem;
    S.spawnLeft = Math.min(34, Math.round((6 + n * 2) / S.df.spawnMul * 0.85 + 1));
    S.spawnT = (n === 1) ? 3.2 : 0.35;
    S.inter = 0;
    S.lit = ri(0, 2);
    S.banner = (n % 5 === 0) ? "第 " + n + " 波 · 巨像来袭" :
      (S.waveEle === "ice" ? "第 " + n + " 波 · 冰魔来袭（火娃克制）" :
       S.waveEle === "rock" ? "第 " + n + " 波 · 岩魔来袭（水娃克制）" : "第 " + n + " 波 · 混编来袭");
    S.bannerT = 2.6;
    if (n % 5 === 0 || (S.perk === "bossrush" && n % 3 === 0)) sfx.boss(); else sfx.wave();
    if (S.perk === "sandstorm") S.sandT = rnd(6, 11);
  }

  /* ---------------- 生成 ---------------- */
  function pickType() {
    if (S.waveEle === "mix") return Math.random() < 0.5 ? "ice" : "rock";
    var t = S.waveEle === "ice" ? "ice" : "rock";
    if (Math.random() < (1 - (S.sc.elemBias || 0.85))) t = (t === "ice" ? "rock" : "ice");
    return t;
  }
  function spawnEnemy(forceType, forceBoss, forceElite, x) {
    var lane = ri(0, LANES - 1);
    var isBoss = forceBoss === undefined ? ((S.wave % 5 === 0) && S.spawnLeft === 1) : !!forceBoss;
    var type = forceType || pickType();
    var hpScale = (1 + (S.wave - 1) * 0.15) * S.df.hpMul;
    var e = {
      type: type, lane: lane,
      x: x === undefined ? laneX(lane) + rnd(-0.05, 0.05) : x,
      z: 1.02,
      r: isBoss ? 0.138 : (Math.random() < 0.18 ? 0.088 : 0.066),
      hp: (isBoss ? 400 : (type === "ice" ? 30 : 34)) * hpScale,
      speed: ((isBoss ? 0.048 : rnd(0.075, 0.115)) * (1 + (S.wave - 1) * 0.028)) * S.df.spMul,
      boss: isBoss, elite: false, wob: Math.random() * 6.28, flash: 0, weakFlip: 0, hurtT: 0
    };
    if (isBoss) { e.r = 0.138; }
    if (forceElite) { e.elite = true; e.hp *= 2.0; e.r = Math.max(e.r, 0.09); e.speed *= 1.12; }
    e.maxHp = e.hp;
    S.enemies.push(e);
    if (isBoss) sfx.boss();
  }

  /* ---------------- 更新 ---------------- */
  function update(dt) {
    if (!S || S.over) return;
    S.t += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 3.2);
    if (S.bannerT > 0) S.bannerT -= dt;
    if (S.toastT > 0) S.toastT -= dt;
    if (S.freezeT > 0) S.freezeT -= dt;
    if (S.shieldT > 0) S.shieldT -= dt;
    if (S.impairCd > 0) S.impairCd -= dt;

    /* 场景机制：S.perk 优先（每日挑战会强制启用某个机制） */
    var perk = S.perk;
    if (perk === "sandstorm") {
      S.sandT -= dt;
      if (S.sandT <= 0) { S.sandT = rnd(6, 11); S.sandGust = 1.6; toast("沙暴来袭！视野受阻", "#e8d3a0"); }
    }
    if (S.sandGust > 0) S.sandGust -= dt;
    if (perk === "lava") {
      S.lavaT -= dt;
      if (S.lavaT <= 0) {
        S.lavaT = rnd(5.5, 9);
        var lx = rnd(-0.75, 0.75);
        S.hazards.push({ x: lx, z: rnd(0.15, 0.7), warn: 1.1, live: 0.9, hit: false });
      }
    }
    if (perk === "bossrush" && S.wave >= 3 && !S._bossExtra) {
      S._bossExtra = true;
      S.spawnLeft += 2;
    }
    upHazards(dt);

    /* 出怪 */
    if (S.spawnLeft > 0) {
      S.spawnT -= dt;
      if (S.spawnT <= 0) { spawnEnemy(); S.spawnLeft--; S.spawnT = Math.max(0.32, (1.25 - S.wave * 0.045) / S.df.spawnMul); }
    } else if (S.enemies.length === 0) {
      if (!S.waveDone) { S.waveDone = true; S.inter = 6.5; }
      S.inter -= dt;
      if (S.inter <= 0) { S.waveDone = false; nextWave(); }
    }

    updG(S.g1, dt); updG(S.g2, dt);
    upEnemies(dt); upShots(dt); upGems(dt); upParts(dt);

    [S.g1, S.g2].forEach(function (g) {
      g.hist.unshift({ x: g.x, z: g.z });
      if (g.hist.length > 300) g.hist.pop();
    });
  }

  function updG(g, dt) {
    if (g.bankCd > 0) g.bankCd -= dt;
    if (g.hurtT > 0) g.hurtT -= dt;
    if (g.flash > 0) g.flash -= dt;
    if (g.down) {
      g.resp -= dt;
      if (g.resp <= 0) {
        g.down = false; g.hp = g.maxHp;
        g.x = g.ele === "fire" ? laneX(1) : laneX(3); g.z = 0.32;
        g.trail.length = 0; g.hist.length = 0;
        toast((g.ele === "fire" ? "🔥 火娃" : "💧 水娃") + " 重新站起来了", "#9fdc9f");
      }
      return;
    }
    var active = (g === S.act);
    var sp = (active ? 0.95 : 0.42) * S.lv.speed;
    var ax = 0, az = 0;
    if (active && S.freezeT <= 0) {
      if (keys.left) ax -= 1;
      if (keys.right) ax += 1;
      if (keys.up) az += 1;
      if (keys.down) az -= 1;
      if (joy) {
        var jl = Math.sqrt(joy.dx * joy.dx + joy.dy * joy.dy);
        if (jl > 8) { ax = joy.dx / jl; az = -joy.dy / jl; }
      }
    }
    if (ax || az) {
      var l = Math.sqrt(ax * ax + az * az);
      g.x = clamp(g.x + ax / l * sp * dt, -1 + GW, 1 - GW);
      g.z = clamp(g.z + az / l * sp * 0.62 * dt, GZ_MIN, GZ_MAX);
    }
    /* 自动开火：就绪即射最近的目标 */
    g.cd -= dt;
    if (g.cd <= 0) {
      var tgt = nearest(g, active ? 0.7 : 0.45);
      if (tgt) {
        var dx = tgt.x - g.x, dz = tgt.z - g.z, dl = Math.sqrt(dx * dx + dz * dz) || 1;
        S.shots.push({ x: g.x, z: g.z + 0.02, vx: dx / dl * 1.35, vz: dz / dl * 1.35,
                       ele: g.ele, r: 0.018, life: 1.2 });
        g.cd = (active ? 0.40 : 0.95) / S.lv.rate;
        sfx.shoot(g.ele === "fire" ? 620 : 500);
        puff(g.x + dx / dl * 0.04, g.z + 0.02 + dz / dl * 0.04, g.ele === "fire" ? "#ff9a4c" : "#6ecbff", 3, 0.5);
      } else g.cd = 0.12;
    }
    /* 门结算（只有一道门的内核） */
    if (g.z < 0.115) {
      for (var i = 0; i < 3; i++) {
        if (Math.abs(g.x - DOOR_X[i]) > 0.17 || g.bankCd > 0) continue;
        if (i === S.lit) { if (g.trail.length > 0) doBank(g, DOOR_X[i]); }
        else if (g.trail.length > 0) {
          var lost = g.trail.length;
          for (var q = 0; q < Math.min(lost, 14); q++)
            S.parts.push({ x: g.x, z: g.z, vx: rnd(-0.7, 0.7), vz: rnd(-0.1, 0.5), t: 0.9, c: "#9b8cff", r: 0.012, g: 2.6 });
          g.trail.length = 0; g.bankCd = 1.2;
          sfx.wrong(); S.shake = 0.7;
          toast("走错门了！" + lost + " 颗宝石散落一地", "#ff8f8f");
          ftext(g.x, DOOR_Z + 0.06, "宝石全失", "#ff8f8f", 17);
        }
      }
    }
  }

  function nearest(from, maxR) {
    var best = null, bd = maxR * maxR;
    for (var i = 0; i < S.enemies.length; i++) {
      var e = S.enemies[i], d2 = dist2(e, from);
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  function upEnemies(dt) {
    for (var i = S.enemies.length - 1; i >= 0; i--) {
      var e = S.enemies[i];
      if (!e) continue;
      e.wob += dt * 4; e.flash = Math.max(0, e.flash - dt * 6);
      e.z -= e.speed * dt;
      e.x += Math.sin(e.wob) * 0.04 * dt;
      e.x = clamp(e.x, -1 + e.r, 1 - e.r);
      /* 巨像弱点随血量轮换：逼玩家中途切人 */
      if (e.boss) {
        var frac = e.hp / e.maxHp;
        var want = frac < 0.25 ? 3 : (frac < 0.5 ? 2 : (frac < 0.75 ? 1 : 0));
        if (want !== e.weakFlip) {
          e.weakFlip = want;
          e.type = (e.type === "ice") ? "rock" : "ice";
          ftext(e.x, e.z + 0.05, "弱点变换 → " + (e.type === "ice" ? "怕火" : "怕水"), "#ffd24a", 15);
          beep(700, 0.13, "sine", 0.06, 300);
        }
      }
      /* 撞击守门人（用显式循环：两个都倒下时要立刻终止本帧剩余结算，
         写成 forEach 的话 return 只跳出回调，漏怪/断尾判定仍会继续跑） */
      var gs = [S.g1, S.g2], died = false;
      for (var gi = 0; gi < gs.length; gi++) {
        var g = gs[gi];
        if (g.down) continue;
        var dd = Math.sqrt(dist2(e, g));
        if (dd < e.r + GW) {
          g.hp -= 34 * dt; g.hurtT = 0.12;
          if (g.hp <= 0) {
            g.down = true; g.resp = 5;
            for (var q = 0; q < Math.min(Math.ceil(g.trail.length / 2), 10); q++)
              S.parts.push({ x: g.x, z: g.z, vx: rnd(-0.8, 0.8), vz: rnd(-0.2, 0.6), t: 0.9, c: "#9b8cff", r: 0.012, g: 2.6 });
            g.trail.length = 0;
            sfx.dead(); S.shake = 0.9;
            toast((g.ele === "fire" ? "🔥 火娃" : "💧 水娃") + " 被击倒了（5 秒后归队）", "#ff8f8f");
            if (S.g1.down && S.g2.down) { gameOver("两位守门人同时倒下了"); died = true; break; }
          }
        }
        /* 撞断尾巴 */
        var tl = g.trail;
        for (var ti = 3; ti < tl.length; ti++) {
          if (Math.sqrt(dist2(e, tl[ti])) < e.r + 0.028) {
            for (var tj = ti; tj < tl.length; tj++)
              S.parts.push({ x: tl[tj].x, z: tl[tj].z, vx: rnd(-0.5, 0.5), vz: rnd(-0.1, 0.5), t: 0.8, c: "#9b8cff", r: 0.011, g: 2.6 });
            tl.length = ti;
            beep(240, 0.11, "sawtooth", 0.05, 120);
            break;
          }
        }
      }
      if (died) return;
      /* 漏怪 */
      if (e.z < BREACH_Z) {
        S.enemies.splice(i, 1);
        S.lives--; S.shake = 1; S.flawless = false; sfx.breach();
        toast("漏怪！剩余生命 " + S.lives, "#ff8f8f");
        if (S.lives <= 0) { gameOver("魔物冲垮了城门"); return; }
      }
    }
  }

  function upShots(dt) {
    for (var i = S.shots.length - 1; i >= 0; i--) {
      var s = S.shots[i];
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
      if (s.life <= 0 || s.z > 1.1 || s.z < 0 || s.x < -1.15 || s.x > 1.15) { S.shots.splice(i, 1); continue; }
      for (var j = 0; j < S.enemies.length; j++) {
        var e = S.enemies[j];
        if (Math.sqrt(dist2(s, e)) < e.r + s.r + 0.012) {
          var m = eff(s.ele, e.type);
          if (m === 0) {
            ftext(e.x, e.z + 0.035, "免疫", "#b9ad9c", 13);
            puff(s.x, s.z, "#b9ad9c", 5, 0.5);
          } else {
            var dmg = 10 * m;
            e.hp -= dmg; e.flash = 1;
            ftext(e.x + rnd(-0.02, 0.02), e.z + 0.04, m > 1 ? "克制 " + Math.round(dmg) : "" + Math.round(dmg),
                  m > 1 ? "#ffd24a" : (s.ele === "fire" ? "#ff9a4c" : "#6ecbff"), m > 1 ? 15 : 12);
            puff(s.x, s.z, s.ele === "fire" ? "#ff9a4c" : "#6ecbff", 6, 0.6);
            sfx.hit();
            if (e.hp <= 0) { killEnemy(e, j); }
          }
          S.shots.splice(i, 1);
          break;
        }
      }
    }
  }

  function killEnemy(e, idx) {
    S.enemies.splice(idx, 1);
    sfx.kill();
    S.kills++;
    if (e.elite) S.elites++;
    if (e.boss) S.bosses++;
    var n = e.boss ? 26 : (e.elite ? 6 : ri(2, 4));
    for (var i = 0; i < n; i++)
      S.gems.push({ x: e.x + rnd(-e.r, e.r), z: e.z + rnd(-e.r * 0.7, e.r * 0.7),
                    vx: rnd(-0.28, 0.28), vz: rnd(-0.05, 0.3), t: 0, r: 0.026 });
    puff(e.x, e.z, e.type === "ice" ? "#8fdcff" : "#c9a06a", e.boss ? 40 : 14, 1.0);
    var base = e.boss ? 500 : e.elite ? 60 : 12;
    S.score += base * Math.max(1, Math.floor(S.wave / 2) + 1);
    if (e.boss) { S.shake = 1.2; ftext(e.x, e.z + 0.07, "巨像倒下！", "#ffd24a", 22); }
  }

  function upGems(dt) {
    for (var i = S.gems.length - 1; i >= 0; i--) {
      var gm = S.gems[i];
      gm.t += dt;
      gm.x += gm.vx * dt; gm.z += gm.vz * dt;
      gm.vx *= 0.94; gm.vz *= 0.94;
      gm.z = Math.max(gm.z, BREACH_Z - 0.02);
      var tgt = null, bd = 0.22 * 0.22;
      [S.g1, S.g2].forEach(function (g) {
        if (g.down) return;
        var d2 = dist2(gm, g);
        if (d2 < bd) { bd = d2; tgt = g; }
      });
      if (tgt && gm.t > 0.3) {
        var dx = tgt.x - gm.x, dz = tgt.z - gm.z, dl = Math.sqrt(dx * dx + dz * dz) || 1;
        gm.x += dx / dl * 0.95 * dt; gm.z += dz / dl * 0.95 * dt;
        if (dl < 0.035) {
          tgt.trail.push({ x: gm.x, z: gm.z });
          sfx.gem();
          S.gems.splice(i, 1);
          continue;
        }
      }
      if (gm.t > 14) S.gems.splice(i, 1);
    }
  }

  function upHazards(dt) {
    for (var i = S.hazards.length - 1; i >= 0; i--) {
      var h = S.hazards[i];
      if (h.warn > 0) { h.warn -= dt; continue; }
      h.live -= dt;
      if (!h.hit && h.live > 0) {
        [S.g1, S.g2].forEach(function (g) {
          if (!g.down && Math.abs(g.x - h.x) < 0.16 && Math.abs(g.z - h.z) < 0.1) {
            g.hp -= 26 * dt; g.hurtT = 0.12; h.hit = true;
          }
        });
      }
      if (h.live <= 0) S.hazards.splice(i, 1);
    }
  }

  function upParts(dt) {
    for (var i = S.parts.length - 1; i >= 0; i--) {
      var p = S.parts[i];
      p.t -= dt;
      if (p.g) p.vz -= p.g * dt;
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.t <= 0) S.parts.splice(i, 1);
    }
    for (var j = S.texts.length - 1; j >= 0; j--) {
      var t = S.texts[j];
      t.t -= dt; t.z += 0.045 * dt;
      if (t.t <= 0) S.texts.splice(j, 1);
    }
  }

  function doBank(g, doorX) {
    var n = g.trail.length;
    var mult = 1 + Math.min(n, 40) * 0.06;
    var gain = Math.round(n * 25 * mult + S.wave * 8);
    S.score += gain;
    S.gemBanked += n;
    S.maxTail = Math.max(S.maxTail, n);
    S.lastTail = n;
    g.trail.length = 0; g.bankCd = 0.8;
    sfx.bank(); S.shake = 0.35;
    ftext(doorX, DOOR_Z + 0.08, "+" + gain + (mult > 1.6 ? "（尾长加成 ×" + mult.toFixed(1) + "）" : ""), "#ffd24a", 18);
    for (var i = 0; i < 16; i++)
      S.parts.push({ x: doorX, z: DOOR_Z, vx: rnd(-0.6, 0.6), vz: rnd(0.1, 0.7), t: 1, c: "#ffd24a", r: 0.012, g: 2.6 });
  }

  function puff(x, z, c, n, sc) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.28, sp = rnd(0.15, 0.7) * (sc || 1);
      S.parts.push({ x: x, z: z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, t: rnd(0.25, 0.55), c: c, r: rnd(0.007, 0.016), g: 0 });
    }
  }
  function ftext(x, z, txt, c, size) { if (!S) return; S.texts.push({ x: x, z: z, txt: txt, c: c, size: size || 13, t: 0.9 }); }
  function toast(txt, c) { if (!S) return; S.toast = { txt: txt, c: c || "#f3ead9" }; S.toastT = 2.2; }

  /* ---------------- 联机注入 ---------------- */
  function injectEvent(kind, payload) {
    if (!S || S.over) return;
    payload = payload || {};
    if (kind === "spawn_elite") {
      spawnEnemy(payload.type || (Math.random() < 0.5 ? "ice" : "rock"), false, true);
      toast("对手派来了精英魔物！", "#ff9a8f"); sfx.impair();
    } else if (kind === "freeze") {
      S.freezeT = Math.max(S.freezeT, 1.8);
      toast("被对手冰冻了！", "#8fd8ff"); sfx.impair();
    } else if (kind === "bomb") {
      var bz = rnd(0.2, 0.55);
      S.hazards.push({ x: Math.random() < 0.5 ? -0.5 : 0.5, z: bz, warn: 0.6, live: 1.0, hit: false });
      toast("对手投下了炸弹！", "#ff8f8f"); sfx.impair();
    } else if (kind === "shield") {
      S.shieldT = 4;
      toast("护盾生效 4 秒", "#9fdc9f");
    }
  }
  /* 我的状态摘要（发给对手） */
  function netState() {
    if (!S) return null;
    return { score: S.score, lives: S.lives, wave: S.wave, ts: Date.now() };
  }
  function applyPeer(p) {
    if (!S || !S.peer || !p) return;
    S.peer.score = p.score || 0;
    S.peer.lives = p.lives || 0;
    S.peer.online = (Date.now() - (p.ts || 0)) < 9000;
  }

  /* ---------------- 绘制 ---------------- */
  function draw() {
    var sc = S ? S.sc : (Config.sceneById(cur.sceneId) || Config.SCENES[0]);
    var shk = S ? S.shake : 0;
    ctx.save();
    if (shk > 0) ctx.translate(rnd(-1, 1) * shk * 8, rnd(-1, 1) * shk * 8);

    E3.drawSky(ctx, Sprites.skyTex(sc.id), sc.tex);
    var groundOpt = { bands: 60, repeat: 4, texBands: 44 };
    E3.drawGround(ctx, Sprites.groundTex(sc.id), sc.tex, groundOpt);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, E3.HORIZON - 2, E3.W, E3.H - E3.HORIZON + 2);
    ctx.clip();

    if (S) {
      E3.drawLanes(ctx, LANES, sc.tex);
      drawDecos(sc);
      drawHazards();
      E3.drawBreachLine(ctx, BREACH_Z, sc.tex);
      drawDoors();
      drawEntities();
      drawParts();
      drawTexts();
      if (S.sandGust > 0) drawSand();
    }
    ctx.restore();

    if (S && S.freezeT > 0) {
      ctx.fillStyle = "rgba(120,200,255,.16)";
      ctx.fillRect(0, 0, E3.W, E3.H);
    }
    ctx.restore();

    if (S) { drawHUD(); drawBanner(); }
    drawJoystick();
  }

  /* 虚拟摇杆可视化：手机端在画面上按住拖动的实时反馈（桌面端不显示） */
  function drawJoystick() {
    if (!joy) return;
    var base = 44, max = 46;
    var dx = joy.dx, dy = joy.dy, len = Math.sqrt(dx * dx + dy * dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    ctx.save();
    ctx.globalAlpha = .38;
    ctx.fillStyle = "rgba(12,10,16,.9)";
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, base, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = .55;
    ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,255,.6)";
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, base, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = .88;
    var grd = ctx.createRadialGradient(joy.ox + dx - 7, joy.oy + dy - 7, 2, joy.ox + dx, joy.oy + dy, 22);
    grd.addColorStop(0, "#ffeed0"); grd.addColorStop(1, "#ff8a3c");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(joy.ox + dx, joy.oy + dy, 21, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawDecos(sc) {
    /* 场景装饰：沿两侧按透视摆放，靠 z 排序保证前后遮挡 */
    if (!S) return;
    if (!S.decoList) {
      var list = [], names = sc.deco || ["deco-boulder"];
      for (var i = 0; i < 14; i++) {
        var side = (i % 2) ? 1 : -1;
        list.push({
          name: names[i % names.length],
          x: side * rnd(1.06, 1.42),
          z: 0.06 + (i / 14) * 0.84 + rnd(-0.02, 0.02),
          h: rnd(0.20, 0.34)
        });
      }
      list.sort(function (a, b) { return b.z - a.z; });
      S.decoList = list;
    }
    S.decoList.forEach(function (d) {
      var tex = Sprites.art(d.name);
      if (tex) {
        E3.shadow(ctx, d.x, d.z, 0.05, .2);
        E3.sprite(ctx, tex, d.x, d.z, d.h, { anchorY: 1 });
      } else {
        var p = E3.project(d.x, d.z);
        ctx.globalAlpha = .7; ctx.fillStyle = "#3a3226";
        ctx.beginPath(); ctx.arc(p.x, p.y - 18 * p.s, 16 * p.s, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  function drawHazards() {
    S.hazards.forEach(function (h) {
      var p = E3.project(h.x, h.z);
      var rr = 0.17 * E3.HALF * p.s;
      if (h.warn > 0) {
        ctx.globalAlpha = 0.45 + 0.35 * Math.sin(S.t * 22);
        ctx.strokeStyle = "#ff7a3c"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * .38, 0, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (h.live > 0) {
        ctx.globalAlpha = 0.75;
        var g2 = ctx.createRadialGradient(p.x, p.y, rr * .1, p.x, p.y, rr);
        g2.addColorStop(0, "#fff2c0"); g2.addColorStop(.5, "#ff9a3c"); g2.addColorStop(1, "rgba(200,40,10,0)");
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * .38, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  }

  function drawSand() {
    var a = Math.min(.42, S.sandGust * .3);
    ctx.fillStyle = "rgba(226,202,150," + a + ")";
    ctx.fillRect(0, E3.HORIZON - 2, E3.W, E3.H - E3.HORIZON + 2);
  }

  function drawDoors() {
    for (var i = 0; i < 3; i++) {
      var x = DOOR_X[i], lit = i === S.lit;
      var p = E3.project(x, DOOR_Z);
      var w = 0.135 * E3.HALF * p.s, h = 0.15 * E3.HALF * p.s;
      var x0 = p.x - w / 2, y0 = p.y - h;
      /* 门槛光 */
      ctx.fillStyle = lit ? "rgba(255,210,74,.22)" : "rgba(0,0,0,.3)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y, w * .78, w * .3, 0, 0, 6.2832); ctx.fill();
      /* 门框 */
      ctx.fillStyle = lit ? "#8a5a18" : "#3d3225";
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = lit ? "#ffd24a" : "#57452f";
      ctx.lineWidth = lit ? 3 : 2;
      ctx.strokeRect(x0, y0, w, h);
      ctx.beginPath(); ctx.arc(p.x, y0, w / 2, Math.PI, 0);
      ctx.fillStyle = lit ? "#a3701e" : "#463a2a"; ctx.fill();
      if (lit) {
        ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; ctx.stroke();
        ctx.globalAlpha = 0.4 + 0.28 * Math.sin(S.t * 5);
        ctx.beginPath(); ctx.arc(p.x, y0 + h * .55, w * .3, 0, 6.2832);
        ctx.fillStyle = "#ffe28a"; ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = "700 " + Math.max(10, 12 * p.s) + "px 'PingFang SC',sans-serif";
        ctx.textAlign = "center"; ctx.fillStyle = "#ffd24a";
        ctx.fillText("结算", p.x, y0 - 8);
      }
    }
  }

  function drawEntities() {
    var list = [];
    S.enemies.forEach(function (e) { list.push({ z: e.z, k: 0, o: e }); });
    S.gems.forEach(function (g) { list.push({ z: g.z, k: 1, o: g }); });
    S.shots.forEach(function (s) { list.push({ z: s.z, k: 2, o: s }); });
    [S.g1, S.g2].forEach(function (g) { if (!g.down) list.push({ z: g.z, k: 3, o: g }); });
    list.sort(function (a, b) { return b.z - a.z; });
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.k === 0) drawEnemy(it.o);
      else if (it.k === 1) drawGem(it.o);
      else if (it.k === 2) drawShot(it.o);
      else drawGuardian(it.o);
    }
    /* 倒地的守门人画在最上方（不参与遮挡） */
    [S.g1, S.g2].forEach(function (g) { if (g.down) drawGuardian(g); });
  }

  function drawGuardian(g) {
    var p = E3.project(g.x, g.z);
    if (g.down) {
      ctx.globalAlpha = 0.45;
      ctx.font = "600 " + Math.max(11, 14 * p.s) + "px 'PingFang SC',sans-serif";
      ctx.textAlign = "center"; ctx.fillStyle = "#bdb098";
      ctx.fillText("复活 " + Math.ceil(g.resp) + "s", p.x, p.y - 10);
      ctx.globalAlpha = 1;
      return;
    }
    E3.shadow(ctx, g.x, g.z, 0.055);
    var img = Sprites.guardian(g.ele);
    /* 走路轻摆：用微小缩放模拟呼吸 */
    var bob = 1 + Math.sin(S.t * 6 + (g.ele === "fire" ? 0 : 1.6)) * 0.02;
    var hit = E3.sprite(ctx, img, g.x, g.z, 0.30 * bob, { anchorY: 1 });
    /* 当前角色光圈 */
    if (g === S.act) {
      ctx.strokeStyle = g.ele === "fire" ? "rgba(255,154,76,.9)" : "rgba(127,216,255,.9)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 0.062 * E3.HALF * p.s * (1 + Math.sin(S.t * 4) * .05), 0.024 * E3.HALF * p.s, 0, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (S.freezeT > 0 && g === S.act) {
      ctx.fillStyle = "rgba(150,220,255,.45)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 0.07 * E3.HALF * p.s, 0.026 * E3.HALF * p.s, 0, 0, 6.2832); ctx.fill();
    }
    /* 护盾 */
    if (S.shieldT > 0) {
      ctx.strokeStyle = "rgba(160,255,180,.75)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 0.06 * E3.HALF * p.s, 0.062 * E3.HALF * p.s, 0.062 * E3.HALF * p.s, 0, 0, 6.2832); ctx.stroke();
    }
    /* 血条 */
    if (g.hp < g.maxHp) {
      var bw = Math.max(22, 40 * p.s);
      var by = (hit ? hit.y - hit.h : p.y) - 8;
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(p.x - bw / 2, by, bw, 4.5);
      ctx.fillStyle = g.hp > g.maxHp * .4 ? "#7ec96f" : "#e46a4d";
      ctx.fillRect(p.x - bw / 2, by, bw * clamp(g.hp / g.maxHp, 0, 1), 4.5);
    }
    /* 尾巴（贪吃蛇内核） */
    if (g.trail.length) {
      var fire = g.ele === "fire";
      for (var i = g.trail.length - 1; i >= 0; i--) {
        var tp = g.trail[i];
        var src = g.hist[Math.min(g.hist.length - 1, (g.trail.length - i) * 6)];
        var pos = src || tp;
        var pp = E3.project(pos.x, pos.z);
        ctx.fillStyle = fire ? "#ffb057" : "#7fd8ff";
        ctx.beginPath(); ctx.arc(pp.x, pp.y - 6 * pp.s, Math.max(2, 9 * pp.s), 0, 6.2832); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.beginPath(); ctx.arc(pp.x - 1.4 * pp.s, pp.y - 7.4 * pp.s, Math.max(1, 2.4 * pp.s), 0, 6.2832); ctx.fill();
      }
    }
    if (g.hurtT > 0) {
      ctx.globalAlpha = .5; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(p.x, p.y - 0.09 * E3.HALF * p.s, 0.05 * E3.HALF * p.s, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemy(e) {
    var tier = e.boss ? 2 : (e.elite ? 1 : 0);
    var img = Sprites.monster(e.type, tier);
    var vis = e.r * (e.boss ? 3.1 : e.elite ? 2.6 : 2.45);
    E3.shadow(ctx, e.x, e.z, e.r * .9);
    E3.sprite(ctx, img, e.x, e.z, vis, { anchorY: 1 });
    if (e.flash > .35) {
      /* 受击白闪：加色叠加一遍 */
      ctx.save();
      ctx.globalAlpha = e.flash * .45;
      ctx.globalCompositeOperation = "lighter";
      E3.sprite(ctx, img, e.x, e.z, vis, { anchorY: 1 });
      ctx.restore();
    }
    var p = E3.project(e.x, e.z);
    var topY = p.y - E3.HALF * p.s * vis;
    if (e.hp < e.maxHp || e.boss || e.elite) {
      var bw = Math.max(20, E3.HALF * p.s * (e.boss ? .2 : e.elite ? .11 : .08));
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(p.x - bw / 2, topY - 6, bw, 4);
      ctx.fillStyle = e.type === "ice" ? "#8fdcff" : "#d8a86a";
      ctx.fillRect(p.x - bw / 2, topY - 6, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
    if (e.boss) {
      ctx.font = "700 " + Math.max(11, 13 * Math.max(.7, p.s)) + "px 'PingFang SC',sans-serif";
      ctx.textAlign = "center"; ctx.fillStyle = "#ff9a8f";
      ctx.fillText("巨像 · " + (e.type === "ice" ? "怕火" : "怕水"), p.x, topY - 14);
    }
  }

  function drawShot(s) {
    var p = E3.project(s.x, s.z);
    var r = Math.max(2, s.r * E3.HALF * p.s * 1.6);
    var fire = s.ele === "fire";
    ctx.globalAlpha = .35;
    ctx.beginPath(); ctx.arc(p.x - s.vx * 6, p.y + s.vz * 6, r + 2.5, 0, 6.2832);
    ctx.fillStyle = fire ? "#ff9a4c" : "#6ecbff"; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832);
    ctx.fillStyle = fire ? "#ffd24a" : "#d8f2ff"; ctx.fill();
  }

  function drawGem(g) {
    var img = Sprites.gem();
    E3.shadow(ctx, g.x, g.z, 0.016, .25);
    E3.sprite(ctx, img, g.x, g.z, 0.045, { anchorY: 1 });
  }

  function drawParts() {
    S.parts.forEach(function (p) {
      var pp = E3.project(p.x, p.z);
      ctx.globalAlpha = Math.max(0, p.t * 2);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(pp.x, pp.y, Math.max(1.2, p.r * E3.HALF * pp.s), 0, 6.2832); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    S.texts.forEach(function (t) {
      var p = E3.project(t.x, t.z);
      ctx.globalAlpha = Math.min(1, t.t * 2.2);
      ctx.font = "700 " + Math.max(11, t.size * p.s * 1.5) + "px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.strokeText(t.txt, p.x, p.y); ctx.fillStyle = t.c; ctx.fillText(t.txt, p.x, p.y);
    });
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    ctx.fillStyle = "rgba(14,12,18,.78)";
    ctx.fillRect(0, 0, E3.W, 76);
    ctx.font = "700 17px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "left"; ctx.fillStyle = "#ffd9a8";
    ctx.fillText("第 " + S.wave + " 波", 20, 30);
    ctx.fillStyle = "#f3ead9";
    ctx.fillText("分数 " + S.score, 20, 56);
    ctx.font = "600 12px 'PingFang SC',sans-serif"; ctx.fillStyle = "#8f8574";
    ctx.fillText(S.sc.name + " · " + S.df.name, 110, 30);
    /* 生命 */
    var lh = "";
    for (var i = 0; i < S.df.lives; i++) lh += i < S.lives ? "❤" : "♡";
    ctx.font = "16px serif"; ctx.fillStyle = "#ff8f8f"; ctx.textAlign = "left";
    ctx.fillText(lh, 110, 55);
    /* 两娃状态 */
    var rx = E3.W - 268;
    [["g1", "🔥 火娃", "#ff9a6a"], ["g2", "💧 水娃", "#7fd8ff"]].forEach(function (row, idx) {
      var g = S[row[0]], y = 28 + idx * 26;
      ctx.globalAlpha = (g === S.act) ? 1 : .6;
      ctx.font = "700 14px 'PingFang SC',sans-serif"; ctx.textAlign = "left";
      ctx.fillStyle = row[2];
      ctx.fillText(row[1] + (g === S.act ? " ◀" : ""), rx, y);
      ctx.fillStyle = "#bdb098"; ctx.font = "600 13px 'PingFang SC',sans-serif";
      ctx.fillText(g.down ? "倒地 " + Math.ceil(g.resp) + "s" : "宝石 " + g.trail.length, rx + 96, y);
      ctx.globalAlpha = 1;
    });
    /* 波次提示 */
    ctx.textAlign = "center"; ctx.font = "600 12.5px 'PingFang SC',sans-serif";
    if (S.spawnLeft > 0 || S.enemies.length) {
      ctx.fillStyle = "#8f8574";
      var hint = S.waveEle === "ice" ? "本波主冰魔 → 火娃主攻" :
                 S.waveEle === "rock" ? "本波主岩魔 → 水娃主攻" : "混编波次 → 注意切换";
      ctx.fillText(hint, E3.W / 2, 46);
    } else {
      ctx.fillStyle = "#ffd24a";
      ctx.fillText("下一波 " + Math.ceil(S.inter) + "s · 带尾巴去亮灯的门！", E3.W / 2, 46);
    }
    /* 对手面板（联机） */
    if (S.peer) {
      var bw2 = 190, bx = E3.W / 2 - bw2 / 2, by = 84;
      ctx.fillStyle = "rgba(14,12,18,.72)";
      ctx.fillRect(bx, by, bw2, 34);
      ctx.strokeStyle = S.peer.online ? "rgba(120,220,150,.6)" : "rgba(150,150,150,.4)";
      ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw2, 34);
      ctx.textAlign = "left"; ctx.font = "600 12px 'PingFang SC',sans-serif";
      ctx.fillStyle = "#cfd6e6";
      ctx.fillText("对手 " + (S.peer.name || ""), bx + 8, by + 14);
      ctx.fillText("分 " + S.peer.score, bx + 8, by + 28);
      ctx.textAlign = "right";
      var ph = "";
      for (var k = 0; k < S.df.lives; k++) ph += k < S.peer.lives ? "❤" : "♡";
      ctx.fillStyle = "#ff9a9a"; ctx.font = "13px serif";
      ctx.fillText(ph, bx + bw2 - 8, by + 22);
      if (!S.peer.online) { ctx.fillStyle = "#9a9a9a"; ctx.font = "600 11px 'PingFang SC',sans-serif"; ctx.fillText("对手断线", bx + bw2 - 8, by + 12); }
    }
  }

  function drawBanner() {
    if (!S || S.bannerT <= 0) return;
    ctx.globalAlpha = Math.min(1, S.bannerT);
    ctx.font = "800 30px 'PingFang SC','Microsoft YaHei',sans-serif"; ctx.textAlign = "center";
    ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.strokeText(S.banner, E3.W / 2, 200); ctx.fillStyle = "#ffd9a8"; ctx.fillText(S.banner, E3.W / 2, 200);
    ctx.globalAlpha = 1;
    if (S.toastT > 0 && S.toast) {
      ctx.globalAlpha = Math.min(1, S.toastT);
      ctx.font = "600 15px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.strokeText(S.toast.txt, E3.W / 2, 236); ctx.fillStyle = S.toast.c; ctx.fillText(S.toast.txt, E3.W / 2, 236);
      ctx.globalAlpha = 1;
    }
  }

  function drawMenuBg(t) {
    var sc = Config.sceneById(cur.sceneId) || Config.SCENES[0];
    E3.drawSky(ctx, Sprites.skyTex(sc.id), sc.tex);
    E3.drawGround(ctx, Sprites.groundTex(sc.id), sc.tex, { bands: 46, repeat: 4, texBands: 32 });
    ctx.save();
    ctx.globalAlpha = .5;
    for (var i = 0; i < 22; i++) {
      var x = ((i * 173 + t * (26 + (i % 5) * 11)) % (E3.W + 80)) - 40;
      var z = 0.1 + (i % 9) / 10;
      var p = E3.project((i % 2 ? 1 : -1) * (0.5 + (i % 4) * 0.16), z);
      ctx.fillStyle = i % 2 ? "#ff9a4c" : "#6ecbff";
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, 3.4 * p.s), 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- 流程 ---------------- */
  function start(sceneId, diffId, opt) {
    newGame(sceneId, diffId, opt);
    scene = "play"; paused = false;
    if (AC && AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
    if (cbStart) cbStart(S);
    return S;
  }
  function togglePause() {
    /* 可双向切换：游戏中→暂停、暂停中→继续（暂停按钮调用同一个入口） */
    if (scene === "play") { paused = true; scene = "pause"; }
    else if (scene === "pause") { paused = false; scene = "play"; }
    else return;
    if (cbPause) cbPause(paused);
  }
  function gameOver(reason) {
    if (!S || S.over) return;
    S.over = true; S.reason = reason;
    scene = "over";
    sfx.dead();
    var res = Progress.onFinish({
      sceneId: S.sc.id, diffId: S.df.id, score: S.score, wave: S.wave,
      gem: S.gemBanked, tail: S.maxTail || 0, kills: S.kills, elites: S.elites,
      bosses: S.bosses, flawless: (S.flawless && S.wave >= 8), duel: S.duel
    });
    var isBest = Save.setBest(Config.modeKey(S.sc.id, S.df.id), {
      score: S.score, wave: S.wave, grade: gradeOf(S), at: Date.now()
    });
    if (cbOver) cbOver({ S: S, res: res, isBest: isBest, reason: reason });
  }
  function gradeOf(s) {
    var w = s.wave;
    if (w >= 25) return "S";
    if (w >= 18) return "A";
    if (w >= 12) return "B";
    if (w >= 7) return "C";
    return "D";
  }

  var cbStart = null, cbPause = null;

  /* ---------------- 挂载 ---------------- */
  function mount(canvas) {
    cv = canvas;
    ctx = cv.getContext("2d");
    window.addEventListener("keydown", function (e) { onKey(e, true); });
    window.addEventListener("keyup", function (e) { onKey(e, false); });
    cv.addEventListener("pointerdown", function (e) {
      if (scene !== "play") return;
      var p = pt(e);
      joy = { ox: p.x, oy: p.y, dx: 0, dy: 0, id: e.pointerId };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener("pointermove", function (e) {
      if (joy && e.pointerId === joy.id) { var p = pt(e); joy.dx = p.x - joy.ox; joy.dy = p.y - joy.oy; }
    });
    function endJ(e) { if (joy && e.pointerId === joy.id) joy = null; }
    cv.addEventListener("pointerup", endJ);
    cv.addEventListener("pointercancel", endJ);
  }

  return {
    mount: mount, start: start, update: update, draw: draw, drawMenuBg: drawMenuBg,
    togglePause: togglePause,
    quit: function () { if (S) S.over = true; S = null; scene = "menu"; paused = false; joy = null; keys = {}; },
    state: function () { return S; },
    scene: function () { return scene; }, cur: function () { return cur; },
    switchGuardian: switchGuardian, setMuted: function (m) { muted = !!m; }, isMuted: function () { return muted; },
    inject: injectEvent, netState: netState, applyPeer: applyPeer, setNet: function (n) { net = n; },
    onOver: function (f) { cbOver = f; }, onStart: function (f) { cbStart = f; }, onPause: function (f) { cbPause = f; },
    isTouch: isTouch, gradeOf: gradeOf
  };

  function switchGuardian() {
    if (!S || S.over) return;
    S.act = (S.act === S.g1) ? S.g2 : S.g1;
    sfx.sw();
    toast(S.act.ele === "fire" ? "🔥 火娃上场" : "💧 水娃上场", S.act.ele === "fire" ? "#ff9a6a" : "#7fd8ff");
  }
})();
