/* 风驰骑行 —— 伪 3D 追尾赛道引擎（OutRun/Hang-On 派经典做法，零依赖、纯 Canvas 2D）
   坐标：z 向前（沿赛道），x 横向，y 向上。摄像机跟在车后。 */
var Engine = (function () {
  var SEG = 200;            // 每段长度（世界单位）
  var RUMBLE = 3;           // 路肩按段数分组（明暗交替）
  var ROADW = 2000;         // 路面半宽（基准）
  var RW = ROADW;           // 当前赛道的实际半宽（窄道会收窄）
  var LANES = 3;
  var FOV = 100;
  var CAMH = 1000;          // 摄像机高度
  var CAMD = 1 / Math.tan((FOV / 2) * Math.PI / 180); // 摄像机景深
  var PLAYERZ = CAMH * CAMD;
  var FOG = 5;

  var segs = [];
  var trackLen = 0;
  var theme = null;
  var trackDef = null;

  /* ---------------- 工具 ---------------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeIn(a, b, p) { return a + (b - a) * Math.pow(p, 2); }
  function easeOut(a, b, p) { return a + (b - a) * (1 - Math.pow(1 - p, 2)); }
  function easeInOut(a, b, p) { return a + (b - a) * (-Math.cos(p * Math.PI) / 2 + .5); }
  function expFog(d, dens) { return 1 / Math.pow(Math.E, d * d * dens); }
  function rndSeed(s) { // mulberry32
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function lastY() { return segs.length ? segs[segs.length - 1].p2.world.y : 0; }

  function addSeg(curve, y) {
    var n = segs.length;
    segs.push({
      index: n,
      p1: { world: { x: 0, y: lastY(), z: n * SEG }, camera: {}, screen: {} },
      p2: { world: { x: 0, y: y, z: (n + 1) * SEG }, camera: {}, screen: {} },
      curve: curve, sprites: [], clip: 0, fog: 1, looped: false, isFinish: false
    });
  }
  // enter 段的缓和 + hold 段的稳定 + leave 段的回正
  function addRoad(enter, hold, leave, curve, y) {
    var startY = lastY();
    var endY = startY + (y * SEG);
    var total = enter + hold + leave, n;
    for (n = 0; n < enter; n++) addSeg(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
    for (n = 0; n < hold; n++) addSeg(curve, easeInOut(startY, endY, (enter + n) / total));
    for (n = 0; n < leave; n++) addSeg(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
  }
  function addStraight(n) { addRoad(n, n, n, 0, 0); }
  function addCurve(n, c, h) { addRoad(n, n, n, c || 0, h || 0); }
  function addHill(n, h) { addRoad(n, n, n, 0, h || 0); }
  function addSCurves(n, h) {
    addRoad(n, n, n, -2, h); addRoad(n, n, n, 2, -h);
    addRoad(n, n, n, 3, h); addRoad(n, n, n, -3, -h);
  }
  function addBumps(n, amp) { // 洼地连绵起伏
    for (var i = 0; i < n; i++) {
      addRoad(8, 6, 8, 0, amp);
      addRoad(8, 6, 8, 0, -amp);
    }
  }
  function addHairpin(dir, n) { // 急发夹弯（窄道专用）
    addRoad(3, n, 3, dir * 5.2, 0);
  }

  /* ---------------- 赛道主题 ---------------- */
  var THEMES = {
    city: {
      sky: ['#6fb1e8', '#cfe8ff'], sun: null,
      grass: ['#5d7a58', '#526b4e'],
      road: ['#4b5563', '#414954'],
      rumble: ['#e8ecf1', '#e2493f'],
      lane: '#eef2f7', fog: '#cfe8ff', decor: 'city',
      texRoad: 'tex-asphalt', texGrass: 'tex-grass', skyImg: 'sky-day'
    },
    valley: {
      sky: ['#74bdf0', '#e2f4ff'], sun: null,
      grass: ['#49a86a', '#3c8f5b'],
      road: ['#6b7280', '#5c6470'],
      rumble: ['#f8fafc', '#1aa35e'],
      lane: '#f8fafc', fog: '#e2f4ff', decor: 'hills',
      texRoad: 'tex-asphalt', texGrass: 'tex-grass', skyImg: 'sky-day'
    },
    mountain: {
      sky: ['#f0a35f', '#ffe7c4'], sun: '#fff0c8',
      grass: ['#8d7a59', '#79684c'],
      road: ['#58534e', '#4b4642'],
      rumble: ['#fafaf9', '#d43a2f'],
      lane: '#fafaf9', fog: '#ffe7c4', decor: 'peaks',
      texRoad: 'tex-asphalt', texGrass: 'tex-dry', skyImg: 'sky-dusk'
    },
    /* 新增：窄道 —— 黄昏峡谷，两侧岩壁夹道 */
    narrow: {
      sky: ['#5b3f79', '#f2a97e'], sun: '#ffd9a0',
      grass: ['#6b4f44', '#5b4038'],
      road: ['#3f4650', '#373d46'],
      rumble: ['#f5f3ef', '#e0a02a'],
      lane: '#fff8e1', fog: '#e8b98f', decor: 'cliffs', fogDens: 4.4,
      texRoad: 'tex-asphalt', texGrass: 'tex-dry', skyImg: 'sky-dusk'
    },
    /* 新增：雨天 —— 铅灰天、湿滑反光路面 */
    rain: {
      sky: ['#4a5566', '#8b98a8'], sun: null,
      grass: ['#3f5d4a', '#365041'],
      road: ['#2f3640', '#262c35'],
      rumble: ['#c9d2dd', '#b7463c'],
      lane: '#dfe7f0', fog: '#8b98a8', decor: 'city', fogDens: 7.4, wet: true,
      texRoad: 'tex-asphalt-wet', texGrass: 'tex-grass', skyImg: 'sky-rain'
    },
    /* 新增：风天 —— 开阔风原，风机阵列 */
    wind: {
      sky: ['#5aa7d8', '#dff1ff'], sun: '#fff6d0',
      grass: ['#7fa85a', '#6c954b'],
      road: ['#5d6470', '#505663'],
      rumble: ['#fbfdff', '#2b8fdc'],
      lane: '#fbfdff', fog: '#dff1ff', decor: 'turbine', fogDens: 4.6,
      texRoad: 'tex-asphalt', texGrass: 'tex-grass', skyImg: 'sky-day'
    }
  };

  /* ---------------- 赛道 ---------------- */
  /* 物理字段说明：
     kmh        速度系数（越大越快）
     roadScale  路面宽窄（越小越窄）
     grip       抓地力（1=干地；越小越滑：转向反应慢、刹车变长）
     wind       侧风力（每帧把车横向推偏的加速度，需反向压身）
     hard       冲出路面的硬阈值（超过即强烈掉速 + 剧烈抖动）
     susp       路面颠簸强度（坡道掉速的倍率）                        */
  var TRACKS = [
    {
      id: 'city', name: '城市平路', icon: '🏙️', diff: '★☆☆',
      desc: '宽敞柏油路，缓弯为主，适合练手',
      theme: 'city', seed: 20261010,
      kmh: 1.0, roadScale: 1.0, grip: 1.0, wind: 0, hard: 1.55, susp: 1.0,
      build: function (r) {
        addStraight(20);
        for (var i = 0; i < 7; i++) {
          addStraight(12 + Math.floor(r() * 8));
          addCurve(14, (i % 2 ? 1 : -1) * (2 + r() * 1.2), 0);
          addStraight(10);
          addCurve(14, (i % 2 ? -1 : 1) * (2 + r() * 1.2), 0);
          addHill(12, (i % 2 ? 8 : -8));
        }
        addStraight(24);
      }
    },
    {
      id: 'valley', name: '起伏乡道', icon: '🌾', diff: '★★☆',
      desc: '连续上下坡，下坡加速、上坡掉速',
      theme: 'valley', seed: 77213,
      kmh: 0.98, roadScale: 1.0, grip: 0.98, wind: 0, hard: 1.55, susp: 1.0,
      build: function (r) {
        addStraight(18);
        for (var i = 0; i < 6; i++) {
          addBumps(3, 7 + r() * 5);
          addCurve(14, (i % 2 ? 1 : -1) * (2.5 + r()), 0);
          addHill(14, (i % 2 ? 16 : -16));
          addSCurves(10, 12);
          addStraight(10);
        }
        addStraight(22);
      }
    },
    {
      id: 'mountain', name: '盘山公路', icon: '⛰️', diff: '★★★',
      desc: '连续急弯与陡坡，最容易冲出路外',
      theme: 'mountain', seed: 9911347,
      kmh: 0.94, roadScale: 1.0, grip: 0.97, wind: 0, hard: 1.5, susp: 1.0,
      build: function (r) {
        addStraight(16);
        for (var i = 0; i < 6; i++) {
          addCurve(12, (i % 2 ? 1 : -1) * (3.4 + r() * 1.4), 12);
          addCurve(10, (i % 2 ? -1 : 1) * (3.4 + r() * 1.4), -12);
          addSCurves(9, 13);
          addHill(12, (i % 2 ? 19 : -19));
          addStraight(8);
        }
        addStraight(20);
      }
    },
    /* ---- 新增三条 ---- */
    {
      id: 'narrow', name: '峡谷窄道', icon: '🏜️', diff: '★★★',
      desc: '岩壁夹道、路面只有一半宽，一个发夹弯走神就撞壁',
      theme: 'narrow', seed: 660418,
      kmh: 1.02, roadScale: 0.56, grip: 0.96, wind: 0, hard: 1.22, susp: 1.0,
      build: function (r) {
        addStraight(14);
        for (var i = 0; i < 5; i++) {
          addStraight(6 + Math.floor(r() * 4));
          addHairpin(i % 2 ? 1 : -1, 7 + Math.floor(r() * 4));
          addStraight(8);
          addCurve(9, (i % 2 ? -1 : 1) * (3.2 + r()), 6);
          addStraight(6);
          addSCurves(6, 5);
          addHairpin(i % 2 ? -1 : 1, 6 + Math.floor(r() * 3));
          addStraight(9);
        }
        addStraight(18);
      }
    },
    {
      id: 'rain', name: '雨天湿滑', icon: '🌧️', diff: '★★★',
      desc: '轮胎打滑、刹车变长，转向会“飘”——早刹车、慢给油',
      theme: 'rain', seed: 310277,
      kmh: 0.96, roadScale: 0.94, grip: 0.60, wind: 0.05, hard: 1.5, susp: 1.0,
      build: function (r) {
        addStraight(18);
        for (var i = 0; i < 6; i++) {
          addCurve(15, (i % 2 ? 1 : -1) * (2.6 + r() * 1.1), 10);
          addStraight(12);
          addSCurves(10, 12);
          addHill(13, (i % 2 ? 14 : -14));
          addStraight(10);
        }
        addStraight(22);
      }
    },
    {
      id: 'wind', name: '风口风原', icon: '🌬️', diff: '★★★',
      desc: '侧面强风周期推偏车身，必须反向压身才能走直线',
      theme: 'wind', seed: 880531,
      kmh: 1.0, roadScale: 1.0, grip: 0.93, wind: 0.34, hard: 1.55, susp: 1.0,
      build: function (r) {
        addStraight(20);
        for (var i = 0; i < 6; i++) {
          addStraight(18 + Math.floor(r() * 10));
          addCurve(16, (i % 2 ? 1 : -1) * (2.6 + r() * 1.1), 14);
          addStraight(16);
          addSCurves(9, 12);
          addStraight(12);
        }
        addStraight(24);
      }
    }
  ];

  /* ---------------- 布景与道具 ---------------- */
  /* 路旁景物按主题混搭：[素材键, 权重] */
  var DECOR = {
    city:     [['tree-broad', 3], ['lamp', 2.2], ['tree-bush', 1.8], ['tree-pine', 1], ['sign', .7]],
    valley:   [['tree-broad', 3], ['tree-bush', 2], ['tree-poplar', 1.5], ['rock-pile', 1]],
    mountain: [['tree-pine', 4], ['rock-boulder', 1.4], ['tree-poplar', 1], ['tree-bush', 1]],
    narrow:   [['cliff', 6], ['rock-boulder', 1]],
    rain:     [['tree-broad', 3], ['tree-bush', 2], ['lamp', 1.6], ['sign', .7]],
    wind:     [['turbine', 1.9], ['tree-bush', 2.2], ['tree-poplar', 1.2], ['sign', .8]]
  };
  /* 每种道具的世界宽度（单位与路半宽一致；1m≈380） */
  var PROPW = {
    'tree-broad': 1500, 'tree-pine': 1250, 'tree-poplar': 820, 'tree-bush': 1050,
    'rock-boulder': 900, 'cactus': 780, 'rock-pile': 1050,
    'cone': 380, 'barrier': 820, 'sign': 680, 'lamp': 1250,
    'cliff': 1500, 'turbine': 3200
  };
  /* 碰撞半径（playerX 单位） */
  var PROPHIT = { cone: .16, rock: .21, barrier: .27, puddle: .55 };

  function pickDecor(themeId, r) {
    var list = DECOR[themeId] || DECOR.city;
    var tot = 0, i;
    for (i = 0; i < list.length; i++) tot += list[i][1];
    var x = r() * tot;
    for (i = 0; i < list.length; i++) { x -= list[i][1]; if (x <= 0) return list[i][0]; }
    return list[0][0];
  }

  function placeSprites(track) {
    var r = rndSeed(track.seed + 7);
    var n = segs.length;
    var isNarrow = (track.theme === 'narrow');
    var baseOff = isNarrow ? 2.35 : 1.78;
    var offSpan = isNarrow ? 1.7 : 2.2;
    // 路旁景物（每 2~4 段一个，两侧交错；宽物体强制让出路面）
    for (var i = 30; i < n - 12; i += 2 + Math.floor(r() * 3)) {
      var side = r() < .5 ? -1 : 1;
      var key = pickDecor(track.theme, r);
      var halfW = (PROPW[key] || 1050) / 2;
      var minOff = 1 + halfW / RW + 0.14;
      var off = side * Math.max(baseOff + r() * offSpan, minOff);
      segs[i].sprites.push({ kind: 'decor', img: key, offset: off, w: PROPW[key] || 1050 });
    }
    // 金币串
    var coinCursor = 60;
    while (coinCursor < n - 40) {
      var count = 4 + Math.floor(r() * 5);
      var lane = (r() * 1.4 - .7);
      var arc = r() < .35;
      for (var cc = 0; cc < count; cc++) {
        var idx = coinCursor + cc * 2;
        if (idx >= n - 20) break;
        var offc = lane + (arc ? Math.sin(cc / count * Math.PI) * .12 : 0);
        segs[idx].sprites.push({ kind: 'coin', img: 'coin', offset: offc, w: 300, taken: false });
      }
      coinCursor += count * 2 + 26 + Math.floor(r() * 40);
    }
    // 障碍 / 水坑
    var hazardCursor = 120;
    var wet = (track.theme === 'rain');
    while (hazardCursor < n - 60) {
      var idx2 = hazardCursor + Math.floor(r() * 20);
      if (idx2 < n - 20) {
        var kind, img, w, hit;
        if (wet && r() < .55) { kind = 'puddle'; img = 'puddle'; w = 1500; hit = PROPHIT.puddle; }
        else if (track.theme === 'valley' && r() < .35) { kind = 'puddle'; img = 'puddle'; w = 1500; hit = PROPHIT.puddle; }
        else if (r() < .4) { kind = 'cone'; img = 'cone'; w = PROPW.cone; hit = PROPHIT.cone; }
        else if (r() < .6) { kind = 'rock'; img = 'rock-boulder'; w = PROPW['rock-boulder']; hit = PROPHIT.rock; }
        else { kind = 'barrier'; img = 'barrier'; w = PROPW.barrier; hit = PROPHIT.barrier; }
        segs[idx2].sprites.push({ kind: kind, img: img, offset: (r() * 1.5 - .75), w: w, hit: hit });
      }
      hazardCursor += 55 + Math.floor(r() * 70);
    }
    // 终点旗格
    for (var f = n - 26; f < n - 6; f++) segs[f].isFinish = true;
  }

  /* ---------------- 构建 ---------------- */
  function build(index) {
    trackDef = TRACKS[index];
    theme = THEMES[trackDef.theme];
    FOG = theme.fogDens || 5;
    RW = ROADW * (trackDef.roadScale == null ? 1 : trackDef.roadScale);
    segs = [];
    var r = rndSeed(trackDef.seed);
    trackDef.build(r);
    trackLen = segs.length * SEG;
    placeSprites(trackDef);
    return trackDef;
  }

  function findSegment(z) {
    var i = Math.floor(z / SEG);
    if (i < 0) i = 0;
    if (i >= segs.length) i = segs.length - 1;
    return segs[i];
  }
  function pctRemaining(n, total) { return (n % total) / total; }

  /* ---------------- 投影 ---------------- */
  function project(p, camX, camY, camZ, W, H) {
    p.camera.x = (p.world.x || 0) - camX;
    p.camera.y = (p.world.y || 0) - camY;
    p.camera.z = (p.world.z || 0) - camZ;
    p.screen.scale = CAMD / p.camera.z;
    p.screen.x = Math.round((W / 2) + (p.screen.scale * p.camera.x * W / 2));
    p.screen.y = Math.round((H / 2) - (p.screen.scale * p.camera.y * H / 2));
    p.screen.w = Math.round(p.screen.scale * RW * W / 2);
  }

  /* ---------------- 绘制 ---------------- */
  function polygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
    ctx.closePath(); ctx.fill();
  }

  function drawBackground(ctx, W, H, horizonY, bgOffset) {
    var hy = Math.max(horizonY, 40);
    var sky = Sprites.has(theme.skyImg) ? Sprites.c[theme.skyImg] : null;

    if (sky) {
      /* AI 天空全景：按地平线高度等比缩放，镜像拼接避免重复感，随转向视差滚动 */
      var dh = hy + 2;
      var dw = sky.width * (dh / sky.height);
      var o = (((bgOffset || 0) * .22) % (dw * 2) + dw * 2) % (dw * 2);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, dh); ctx.clip();
      for (var x = -o; x < W; x += dw * 2) {
        ctx.drawImage(sky, x, 0, dw, dh);
        ctx.save();
        ctx.translate(x + dw * 2, 0); ctx.scale(-1, 1);
        ctx.drawImage(sky, 0, 0, dw, dh);
        ctx.restore();
      }
      ctx.restore();
    } else {
      var g = ctx.createLinearGradient(0, 0, 0, hy);
      g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy + 2);
    }

    if (theme.sun) {
      var sx = W * .74 - ((bgOffset || 0) * .1) % W, sy = hy * .42;
      var glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, Math.min(W, H) * .22);
      glow.addColorStop(0, 'rgba(255,244,214,.95)');
      glow.addColorStop(.35, 'rgba(255,236,190,.35)');
      glow.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - W * .25, sy - H * .3, W * .5, H * .6);
      ctx.fillStyle = theme.sun; ctx.globalAlpha = .9;
      ctx.beginPath(); ctx.arc(sx, sy, Math.min(W, H) * .075, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    var o2 = bgOffset || 0;
    if (theme.decor === 'city') {
      ctx.fillStyle = 'rgba(120,140,165,.42)';
      for (var i = -2; i < 26; i++) {
        var bx = ((i * 92 + o2 * .35) % (W + 300) + W + 300) % (W + 300) - 150;
        var bh = 46 + ((i * 37) % 9) * 13;
        ctx.fillRect(bx, hy - bh, 62, bh);
        ctx.fillStyle = 'rgba(255,240,200,.16)';   // 亮起的窗
        for (var wy = hy - bh + 8; wy < hy - 10; wy += 14) {
          for (var wx = bx + 8; wx < bx + 54; wx += 16) {
            if (((wx * 13 + wy * 7 + i) | 0) % 5 < 2) ctx.fillRect(wx, wy, 6, 8);
          }
        }
        ctx.fillStyle = 'rgba(120,140,165,.42)';
      }
    } else if (theme.decor === 'hills') {
      ctx.fillStyle = 'rgba(86,140,108,.5)';
      for (var j = -1; j < 12; j++) {
        var hx = ((j * 210 + o2 * .25) % (W + 420) + W + 420) % (W + 420) - 210;
        ctx.beginPath(); ctx.arc(hx, hy + 16, 130, Math.PI, 0); ctx.fill();
      }
      ctx.fillStyle = 'rgba(64,110,84,.55)';
      for (var j5 = -1; j5 < 12; j5++) {
        var hx5 = ((j5 * 260 + o2 * .4 + 130) % (W + 520) + W + 520) % (W + 520) - 260;
        ctx.beginPath(); ctx.arc(hx5, hy + 18, 90, Math.PI, 0); ctx.fill();
      }
    } else if (theme.decor === 'cliffs') {
      // 远处层层峡谷岩壁
      var tones = ['rgba(120,84,112,.4)', 'rgba(94,64,90,.5)', 'rgba(72,48,70,.62)'];
      for (var L = 0; L < 3; L++) {
        ctx.fillStyle = tones[L];
        var sc = 0.55 + L * 0.28;
        for (var k2 = -1; k2 < 14; k2++) {
          var px2 = ((k2 * (200 + L * 40) + o2 * (.12 + L * .06)) % (W + 500) + W + 500) % (W + 500) - 250;
          ctx.beginPath();
          ctx.moveTo(px2 - 150 * sc, hy + 14);
          ctx.lineTo(px2, hy - 190 * sc);
          ctx.lineTo(px2 + 150 * sc, hy + 14);
          ctx.closePath(); ctx.fill();
        }
      }
    } else if (theme.decor === 'turbine') {
      // 风原：远山 + 风机阵列
      ctx.fillStyle = 'rgba(120,168,140,.45)';
      for (var j2 = -1; j2 < 12; j2++) {
        var hx2 = ((j2 * 220 + o2 * .2) % (W + 440) + W + 440) % (W + 440) - 220;
        ctx.beginPath(); ctx.arc(hx2, hy + 18, 110, Math.PI, 0); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(245,250,255,.7)'; ctx.lineWidth = 2.4;
      for (var t = -1; t < 16; t++) {
        var tx = ((t * 168 + o2 * .42) % (W + 380) + W + 380) % (W + 380) - 190;
        var ty = hy - 6;
        var th = 62 + ((t * 29) % 5) * 12;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - th); ctx.stroke();
        var bl = 22 + (t % 3) * 5;
        var spin = Date.now() / 900;
        for (var b = 0; b < 3; b++) {
          var a = spin + b * Math.PI * 2 / 3;
          ctx.beginPath();
          ctx.moveTo(tx, ty - th);
          ctx.lineTo(tx + Math.cos(a) * bl, ty - th + Math.sin(a) * bl);
          ctx.stroke();
        }
      }
    } else {
      ctx.fillStyle = 'rgba(122,100,78,.5)';
      for (var k = -1; k < 10; k++) {
        var px = ((k * 250 + o2 * .3) % (W + 500) + W + 500) % (W + 500) - 250;
        ctx.beginPath();
        ctx.moveTo(px - 140, hy + 10); ctx.lineTo(px, hy - 150); ctx.lineTo(px + 140, hy + 10);
        ctx.closePath(); ctx.fill();
      }
    }

    /* 地平线薄雾：天空与地面衔接 */
    var fogH = Math.min(H * .16, 90);
    var fg = ctx.createLinearGradient(0, hy - fogH, 0, hy);
    fg.addColorStop(0, 'rgba(255,255,255,0)');
    fg.addColorStop(1, theme.fog);
    ctx.fillStyle = fg;
    ctx.globalAlpha = .55;
    ctx.fillRect(0, hy - fogH, W, fogH);
    ctx.globalAlpha = 1;
  }

  function render(ctx, W, H, o) {
    var baseSeg = findSegment(o.position);
    var basePct = pctRemaining(o.position, SEG);
    var playerSeg = findSegment(o.position + PLAYERZ);
    var playerPct = pctRemaining(o.position + PLAYERZ, SEG);
    var playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPct);
    var maxy = H, x = 0, dx = -(baseSeg.curve * basePct);
    var camH = o.camH || CAMH;

    // 地平线估算（用路面消失点）
    drawBackground(ctx, W, H, H * .5 + (playerY * .00008) * H, o.bgOffset || 0);

    var n, i, seg;
    var DRAWN = o.draw || 220;
    for (n = 0; n < DRAWN; n++) {
      i = baseSeg.index + n;
      if (i >= segs.length) i = segs.length - 1;
      seg = segs[i];
      seg.looped = false;
      seg.fog = expFog(n / DRAWN, FOG);
      seg.clip = maxy;
      var camZ = o.position;
      project(seg.p1, (o.playerX * RW) - x, playerY + camH, camZ, W, H);
      project(seg.p2, (o.playerX * RW) - x - dx, playerY + camH, camZ, W, H);
      x += dx; dx += seg.curve;
      if (seg.p1.camera.z <= CAMD || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
      drawSegment(ctx, W, seg, baseSeg.index + n);
      maxy = seg.p2.screen.y;
    }

    // 精灵：由远及近
    for (n = DRAWN - 1; n > 0; n--) {
      i = baseSeg.index + n;
      if (i >= segs.length) i = segs.length - 1;
      seg = segs[i];
      for (var s = 0; s < seg.sprites.length; s++) drawSprite(ctx, W, H, seg.sprites[s], seg);
    }
    return { playerY: playerY, playerSeg: playerSeg, baseIndex: baseSeg.index, drawn: DRAWN };
  }

  function rumbleW(w) { return w / Math.max(6, 2 * LANES); }
  function laneW(w) { return w / Math.max(32, 8 * LANES); }

  var TEXREP = 6;          // 贴图每 6 段重复一次（世界长度 1200）
  var TEXDRAW = 90;        // 只对最近 90 段做贴图映射，更远用平色（雾里看不清，省性能）

  /* 把贴图带仿射映射到该段的路面四边形（行高极小，仿射近似不可辨） */
  function texBand(ctx, tex, sy, sh, x1, y1, w1, x2, y2, w2) {
    var dy = y2 - y1;
    if (dy === 0) return;
    ctx.save();
    ctx.transform((w1 * 2) / tex.width, 0, (x2 - w2 - x1 + w1) / sh, dy / sh, x1 - w1, y1);
    ctx.drawImage(tex, 0, sy, tex.width, sh, 0, 0, tex.width, sh);
    ctx.restore();
  }

  function drawSegment(ctx, W, seg, n) {
    var c = theme;
    var p1 = seg.p1.screen, p2 = seg.p2.screen;
    var dark = Math.floor(n / RUMBLE) % 2;
    var rumble = dark ? c.rumble[1] : c.rumble[0];
    var lane = dark ? c.lane : null;
    var textured = n < TEXDRAW;

    /* 草地（贴图带铺满整行） */
    if (textured) {
      var gt = Sprites.art(c.texGrass);
      var sh = gt.height / TEXREP;
      var sy = ((n % TEXREP) / TEXREP) * gt.height;
      ctx.drawImage(gt, 0, sy, gt.width, sh, 0, p2.y, W, p1.y - p2.y);
      if (dark) { ctx.fillStyle = 'rgba(0,0,0,.075)'; ctx.fillRect(0, p2.y, W, p1.y - p2.y); }
    } else {
      polygon(ctx, 0, p1.y, W, p1.y, W, p2.y, 0, p2.y, dark ? c.grass[1] : c.grass[0]);
    }

    if (seg.isFinish) {
      polygon(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, '#e5e7eb');
      var cw = p1.w / 8;
      for (var k = 0; k < 9; k++) {
        var col = (k % 2) ? '#111827' : '#f9fafb';
        polygon(ctx, p1.x - p1.w + k * cw, p1.y, p1.x - p1.w + (k + 1) * cw, p1.y,
          p2.x - p2.w + (k + 1) * (p2.w / 8), p2.y, p2.x - p2.w + k * (p2.w / 8), p2.y, col);
      }
    } else {
      var r1 = rumbleW(p1.w), r2 = rumbleW(p2.w);
      /* 路面贴图 */
      if (textured) {
        var rt = Sprites.art(c.texRoad);
        var rsh = rt.height / TEXREP;
        var rsy = ((n % TEXREP) / TEXREP) * rt.height;
        texBand(ctx, rt, rsy, rsh, p1.x, p1.y, p1.w, p2.x, p2.y, p2.w);
      } else {
        polygon(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y,
          dark ? c.road[1] : c.road[0]);
      }
      /* 路肩 */
      polygon(ctx, p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, rumble);
      polygon(ctx, p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, rumble);
      /* 白边线 */
      var e1 = Math.max(1.2, p1.w * .018), e2 = Math.max(1, p2.w * .018);
      var edge = theme.wet ? 'rgba(226,232,240,.75)' : 'rgba(248,250,252,.85)';
      polygon(ctx, p1.x - p1.w + e1, p1.y, p1.x - p1.w + e1 * 3, p1.y,
        p2.x - p2.w + e2 * 3, p2.y, p2.x - p2.w + e2, p2.y, edge);
      polygon(ctx, p1.x + p1.w - e1 * 3, p1.y, p1.x + p1.w - e1, p1.y,
        p2.x + p2.w - e2, p2.y, p2.x + p2.w - e2 * 3, p2.y, edge);
      /* 湿滑路面：天空反光 */
      if (theme.wet) {
        var sheen = ctx.createLinearGradient(0, p2.y, 0, p1.y);
        sheen.addColorStop(0, 'rgba(207,230,255,.20)');
        sheen.addColorStop(1, 'rgba(207,230,255,.03)');
        polygon(ctx, p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, sheen);
      }
      if (lane) {
        var lw1 = p1.w * 2 / LANES, lw2 = p2.w * 2 / LANES;
        var lx1 = p1.x - p1.w + lw1, lx2 = p2.x - p2.w + lw2;
        for (var L = 1; L < LANES; L++, lx1 += lw1, lx2 += lw2) {
          var lw1b = Math.max(1, lw1 * .045), lw2b = Math.max(.8, lw2 * .045);
          polygon(ctx, lx1 - lw1b, p1.y, lx1 + lw1b, p1.y, lx2 + lw2b, p2.y, lx2 - lw2b, p2.y,
            theme.wet ? 'rgba(223,231,240,.55)' : lane);
        }
      }
    }
    /* 雾 */
    if (seg.fog < 1) {
      ctx.globalAlpha = 1 - seg.fog;
      ctx.fillStyle = theme.fog;
      ctx.fillRect(0, p2.y, W, p1.y - p2.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawSprite(ctx, W, H, sp, seg) {
    var img = Sprites.art(sp.img);
    if (!img) return;
    var box = spriteBox(seg, sp.offset, sp.w, W, H, img.height / img.width);
    if (!box) return;
    if (sp.kind === 'coin') {
      /* 金币旋转：宽度按余弦收缩 */
      var ph = (Date.now() / 240 + seg.index * .55) % (Math.PI * 2);
      var sx = Math.abs(Math.cos(ph));
      var cw = Math.max(2, box.w * (.22 + .78 * sx));
      ctx.drawImage(img, box.x + (box.w - cw) / 2, box.y, cw, box.h);
      return;
    }
    /* 接触阴影（贴地，随物体宽度） */
    if (sp.kind !== 'puddle') {
      ctx.globalAlpha = .24;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(box.x + box.w / 2, box.y + box.h - Math.max(1, box.h * .012),
        box.w * .44, Math.max(1.5, box.h * .028), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(img, box.x, box.y, box.w, box.h);
  }

  /* 把一个「贴在赛道上」的物体换算成屏幕矩形（幽灵车/精灵共用）
     aspect = 高/宽；不传按正方形处理 */
  function spriteBox(seg, offset, w, W, H, aspect) {
    var sc = seg.p1.screen.scale;
    if (!sc || sc <= 0) return null;
    var destW = sc * w * (W / 2);
    if (!isFinite(destW) || destW < 1 || destW > W * 6) return null;
    var destH = destW * (aspect || 1);
    var cx = seg.p1.screen.x + sc * (offset * RW) * (W / 2);
    var destY = seg.p1.screen.y - destH;
    var clipH = seg.clip ? Math.max(0, destY + destH - seg.clip) : 0;
    if (clipH >= destH) return null;
    return { x: cx - destW / 2, y: destY, w: destW, h: destH, clipH: clipH };
  }

  return {
    SEG: SEG, ROADW: ROADW, PLAYERZ: PLAYERZ, CAMH: CAMH,
    TRACKS: TRACKS,
    build: build,
    render: render,
    findSegment: findSegment,
    length: function () { return trackLen; },
    count: function () { return segs.length; },
    segAt: function (i) { return segs[Math.max(0, Math.min(i, segs.length - 1))]; },
    theme: function () { return theme; },
    def: function () { return trackDef; },
    roadW: function () { return RW; },
    spriteBox: spriteBox
  };
})();
