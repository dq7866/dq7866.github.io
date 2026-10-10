/* 风驰骑行 —— 精灵与绘制：AI 贴图资产 + 程序化骑手（零框架依赖）
   资产加载失败时自动回退到内置程序绘制，游戏永远可玩。 */
var Sprites = (function () {
  var TAU = Math.PI * 2;
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ================= 资产清单 ================= */
  var SRC = {
    'tex-asphalt': 'img/tex-asphalt.webp',
    'tex-asphalt-wet': 'img/tex-asphalt-wet.webp',
    'tex-grass': 'img/tex-grass.webp',
    'tex-dry': 'img/tex-dry.webp',
    'mat-carbon': 'img/mat-carbon.webp',
    'mat-fabric': 'img/mat-fabric.webp',
    'mat-leather': 'img/mat-leather.webp',
    'mat-rubber': 'img/mat-rubber.webp',
    'tree-broad': 'img/tree-broad.webp',
    'tree-pine': 'img/tree-pine.webp',
    'tree-poplar': 'img/tree-poplar.webp',
    'tree-bush': 'img/tree-bush.webp',
    'rock-boulder': 'img/rock-boulder.webp',
    'cactus': 'img/cactus.webp',
    'rock-pile': 'img/rock-pile.webp',
    'cone': 'img/cone.webp',
    'barrier': 'img/barrier.webp',
    'sign': 'img/sign.webp',
    'lamp': 'img/lamp.webp',
    'cliff': 'img/cliff.webp',
    'turbine': 'img/turbine.webp',
    'sky-day': 'img/sky-day.webp',
    'sky-dusk': 'img/sky-dusk.webp',
    'sky-rain': 'img/sky-rain.webp'
  };
  var c = {};          // 名称 -> 可绘制对象（Image 或兜底 canvas）
  var loaded = 0, total = 0;

  function flat(w, h, color) {
    var cv = mk(w, h), g = cv.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    return cv;
  }

  /* ================= 兜底程序绘制（与 AI 版近似宽高比） ================= */
  function fallbackTree(w, h, col, trunk) {
    var cv = mk(w, h), g = cv.getContext('2d');
    g.fillStyle = trunk; g.fillRect(w * .46, h * .62, w * .08, h * .38);
    var cs = [col[0], col[1], col[2]];
    for (var i = 0; i < 3; i++) {
      g.fillStyle = cs[i];
      g.beginPath();
      g.arc(w * .5 + (i - 1) * w * .17, h * .42 - i * h * .1, w * .34 - i * w * .06, 0, TAU);
      g.fill();
    }
    return cv;
  }
  function fallbackCone() {
    var cv = mk(144, 230), g = cv.getContext('2d');
    g.fillStyle = '#ea580c';
    g.beginPath(); g.moveTo(72, 10); g.lineTo(112, 196); g.lineTo(32, 196); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.fillRect(48, 104, 48, 26);
    g.fillStyle = '#c2410c'; g.beginPath(); g.ellipse(72, 206, 58, 15, 0, 0, TAU); g.fill();
    return cv;
  }
  function fallbackBarrier() {
    var cv = mk(276, 250), g = cv.getContext('2d');
    for (var i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#f3f4f6' : '#dc2626'; g.fillRect(8 + i * 44, 30, 44, 90); }
    g.strokeStyle = '#7f1d1d'; g.lineWidth = 4; g.strokeRect(8, 30, 260, 90);
    g.fillStyle = '#991b1b'; g.fillRect(38, 120, 22, 110); g.fillRect(216, 120, 22, 110);
    return cv;
  }
  function fallbackRock(w, h, col, col2) {
    var cv = mk(w, h), g = cv.getContext('2d');
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(w * .04, h * .96); g.lineTo(w * .18, h * .38); g.lineTo(w * .46, h * .1);
    g.lineTo(w * .76, h * .26); g.lineTo(w * .96, h * .66); g.lineTo(w * .96, h * .96);
    g.closePath(); g.fill();
    g.fillStyle = col2;
    g.beginPath(); g.moveTo(w * .18, h * .38); g.lineTo(w * .46, h * .1); g.lineTo(w * .58, h * .44);
    g.lineTo(w * .34, h * .62); g.closePath(); g.fill();
    return cv;
  }

  function buildFallbacks() {
    c['tex-asphalt'] = flat(256, 256, '#4b5563');
    c['tex-asphalt-wet'] = flat(256, 256, '#2f3640');
    c['tex-grass'] = flat(256, 256, '#5d7a58');
    c['tex-dry'] = flat(256, 256, '#8d7a59');
    c['mat-carbon'] = flat(64, 64, '#1a1d22');
    c['mat-fabric'] = flat(64, 64, '#e8edf5');
    c['mat-leather'] = flat(64, 64, '#1c1f24');
    c['mat-rubber'] = flat(64, 64, '#15181d');
    c['tree-broad'] = fallbackTree(240, 300, ['#15803d', '#16a34a', '#22c55e'], '#5b3a1e');
    c['tree-pine'] = fallbackTree(200, 380, ['#14532d', '#166534', '#15803d'], '#4a3319');
    c['tree-poplar'] = fallbackTree(110, 460, ['#a16207', '#ca8a04', '#eab308'], '#6b4423');
    c['tree-bush'] = fallbackTree(340, 300, ['#3f6212', '#4d7c0f', '#65a30d'], '#57371b');
    c['rock-boulder'] = fallbackRock(260, 300, '#8a5f52', '#a9766a');
    c['cactus'] = fallbackRock(200, 380, '#3f7d3f', '#4d9a4d');
    c['rock-pile'] = fallbackRock(300, 210, '#64748b', '#94a3b8');
    c['cone'] = fallbackCone();
    c['barrier'] = fallbackBarrier();
    c['sign'] = fallbackRock(190, 360, '#3b82f6', '#60a5fa');
    c['lamp'] = fallbackRock(350, 500, '#6b7280', '#9ca3af');
    c['cliff'] = fallbackRock(460, 900, '#8a5f52', '#a9766a');
    c['turbine'] = fallbackRock(360, 700, '#e6edf5', '#cfd9e4');
    c['sky-day'] = flat(64, 64, '#6fb1e8');
    c['sky-dusk'] = flat(64, 64, '#f0a35f');
    c['sky-rain'] = flat(64, 64, '#4a5566');
    c['coin'] = coin();
    c['puddle'] = puddle();
  }

  function init() {
    buildFallbacks();
    total = 0; loaded = 0;
    for (var k in SRC) {
      total++;
      (function (key) {
        var im = new Image();
        im.onload = function () {
          c[key] = im; loaded++;
          if (key.indexOf('mat-') === 0) patCache = {};   // 材质到位后重建图案
        };
        im.onerror = function () { loaded++; };
        im.src = SRC[key];
      })(k);
    }
  }
  function art(key) { return c[key] || null; }
  /* 仅当该键是已装载的图片时返回 true（用于天空等有平色兜底的场合） */
  function has(key) { return !!(c[key] && c[key].naturalWidth); }
  function ready() { return { loaded: loaded, total: total }; }

  /* 材质图案（按 ctx 缓存） */
  var patCache = {};
  function pat(key, g) {
    var e = patCache[key];
    if (!e || e.ctx !== g) {
      e = { ctx: g, p: g.createPattern(c[key], 'repeat') };
      patCache[key] = e;
    }
    return e.p;
  }
  function refreshPat() { patCache = {}; }   // 贴图装载完成后重建

  /* ================= 金币 / 水坑 ================= */
  function coin() {
    var S = 128, cv = mk(S, S), g = cv.getContext('2d'), cx = S / 2, cy = S / 2, R = S * .40;
    var grd = g.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R);
    grd.addColorStop(0, '#fff7cc'); grd.addColorStop(.45, '#fbbf24'); grd.addColorStop(1, '#b45309');
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = grd; g.fill();
    g.lineWidth = R * .13; g.strokeStyle = 'rgba(120,53,15,.55)'; g.stroke();
    g.beginPath(); g.arc(cx, cy, R * .62, 0, TAU); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = R * .1; g.stroke();
    g.fillStyle = 'rgba(146,64,14,.85)'; g.font = 'bold ' + (R * .95) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¥', cx, cy + R * .04);
    g.globalAlpha = .5; g.beginPath();
    g.ellipse(cx - R * .35, cy - R * .42, R * .22, R * .12, -0.6, 0, TAU); g.fillStyle = '#fff'; g.fill();
    return cv;
  }
  function puddle() {
    var cv = mk(240, 80), g = cv.getContext('2d');
    g.fillStyle = 'rgba(56,132,190,.72)';
    g.beginPath(); g.ellipse(120, 46, 108, 28, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.ellipse(86, 34, 34, 8, -0.25, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(160, 50, 22, 6, 0.2, 0, TAU); g.fill();
    return cv;
  }

  /* ================= 骑手 + 自行车（后视，程序绘制 + 材质） =================
     坐标：原点在后轮触地点，向上为负 y；s 为整体缩放。
     o: { type, pose:'normal'|'wheelie'|'stoppie', pedal, wheel, steer,
          ghost:false, tint:null, alpha:1 } */
  var BIKES = {
    commuter: { frame: '#2563eb', frame2: '#1e40af', jersey: '#eef2f7', jersey2: '#b9c2d0', sleeve: '#ccd5e1', helmet: '#3b4757', bar: 54, chest: 20, hip: 16, rack: true },
    road:     { frame: '#e11d48', frame2: '#9f1239', jersey: '#f7f9fc', jersey2: '#c2cbd8', sleeve: '#d5dce7', helmet: '#dc2626', bar: 48, chest: 17.5, hip: 14.5, drop: true },
    mtb:      { frame: '#16a34a', frame2: '#166534', jersey: '#2b3648', jersey2: '#1b2432', sleeve: '#1e2836', helmet: '#f59e0b', bar: 62, chest: 21, hip: 17, fat: true },
    gravel:   { frame: '#0ea5e9', frame2: '#0369a1', jersey: '#fde68a', jersey2: '#cfa94e', sleeve: '#e2c364', helmet: '#0f766e', bar: 52, chest: 18.5, hip: 15.5, drop: true },
    ebike:    { frame: '#7c3aed', frame2: '#5b21b6', jersey: '#242c3a', jersey2: '#151b26', sleeve: '#19212e', helmet: '#a855f7', bar: 56, chest: 20, hip: 16.5, fat: true, battery: true }
  };

  function taper(g, x1, y1, x2, y2, w, col) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }

  function drawWheel(g, cx, cy, R, ang, blur, fat, ghost) {
    g.lineCap = 'butt';
    g.beginPath(); g.arc(cx, cy, R + 2.5, 0, TAU);
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
    g.beginPath(); g.arc(cx, cy, R, 0, TAU);
    g.lineWidth = fat ? 13 : 9.5; g.strokeStyle = '#171a20'; g.stroke();
    g.beginPath(); g.arc(cx, cy, R + 1, 0, TAU);
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.10)'; g.stroke();
    g.beginPath(); g.arc(cx, cy, R - 7, 0, TAU);
    g.lineWidth = 3.6; g.strokeStyle = ghost ? 'rgba(255,255,255,.5)' : '#c9ced6'; g.stroke();
    if (blur > .16) {
      g.beginPath(); g.arc(cx, cy, R - 8, 0, TAU);
      g.fillStyle = 'rgba(196,202,211,' + (blur * .5).toFixed(3) + ')'; g.fill();
    }
    g.save(); g.translate(cx, cy); g.rotate(ang);
    g.strokeStyle = 'rgba(212,218,227,' + Math.max(0, 1 - blur * 1.35).toFixed(3) + ')';
    g.lineWidth = 1.7;
    for (var i = 0; i < 12; i++) {
      g.rotate(TAU / 12);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -(R - 9)); g.stroke();
    }
    g.restore();
    g.beginPath(); g.arc(cx, cy, 4.6, 0, TAU); g.fillStyle = '#9aa1ab'; g.fill();
    g.beginPath(); g.arc(cx, cy, 2, 0, TAU); g.fillStyle = '#5c636e'; g.fill();
  }

  function drawRider(g, cx, gy, s, o) {
    o = o || {};
    var col = BIKES[o.type] || BIKES.commuter;
    var pose = o.pose || 'normal';
    var ghost = !!o.ghost;
    var R = col.fat ? 44 : 40;
    var steer = Math.max(-1, Math.min(1, o.steer || 0));
    var pedal = o.pedal || 0;
    var cw = col.chest || 20;                       // 胸/肩半宽
    var hw = col.hip || 16;                         // 臀半宽
    var bw = Math.max(col.bar / 2, cw + 6.5);       // 车把半宽＝手位，必须露出身体两侧

    g.save();
    g.translate(cx, gy); g.scale(s, s);
    if (o.alpha != null && o.alpha < 1) g.globalAlpha = o.alpha;

    var skin = ghost ? (o.tint || '#dff2ff') : '#e6b088';
    var skinD = ghost ? (o.tint || '#dff2ff') : '#cf9a72';
    var jersey = ghost ? (o.tint || '#dff2ff') : col.jersey;
    var jersey2 = ghost ? (o.tint || '#dff2ff') : col.jersey2;
    var shorts = ghost ? (o.tint || '#dff2ff') : '#232a36';
    var shoe = ghost ? (o.tint || '#dff2ff') : '#1a1e26';
    var frameC = ghost ? (o.tint || '#dff2ff') : col.frame;
    var frame2 = ghost ? (o.tint || '#dff2ff') : col.frame2;

    /* ---- 接触阴影 ---- */
    if (!ghost) {
      g.fillStyle = 'rgba(0,0,0,.30)';
      g.beginPath(); g.ellipse(0, -3, R * 1.55, 9, 0, 0, TAU); g.fill();
    }

    /* ---- 前轮（平时藏在后轮之后，转向时从车身一侧露出） ---- */
    var fwx = steer * 13;
    if (Math.abs(fwx) > .8) {
      drawWheel(g, fwx, -R * .97, R * .9, o.wheel || 0, Math.max(.2, o.blur || 0), col.fat, ghost);
    }

    /* ---- 后轮 ---- */
    drawWheel(g, 0, -R, R, o.wheel || 0, o.blur || 0, col.fat, ghost);

    /* ---- 车架 ---- */
    taper(g, -13, -96, -5, -R + 3, 5, frame2);
    taper(g, 13, -96, 5, -R + 3, 5, frame2);
    taper(g, 0, -104, 0, -R + 6, 5.5, frame2);
    if (col.battery && !ghost) {
      g.fillStyle = '#334155'; rr(g, -30, -46, 60, 20, 5); g.fill();
      g.fillStyle = '#22d3ee'; g.fillRect(24, -39, 9, 6);
    }
    if (col.rack && !ghost) { g.fillStyle = '#6b7280'; rr(g, -30, -34, 60, 7, 3); g.fill(); }

    /* ---- 坐垫（会被臀部部分遮挡） ---- */
    var seatW = Math.max(15, hw + 1);
    g.fillStyle = ghost ? (o.tint || '#dff2ff') : '#20242c';
    g.beginPath(); g.ellipse(0, -110, seatW, 6, 0, 0, TAU); g.fill();
    if (!ghost) {
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.beginPath(); g.ellipse(-5, -112, 7.5, 2.4, 0, 0, TAU); g.fill();
    }

    /* ---- 腿（都在躯干之下：先远侧、后近侧） ---- */
    var hipY = pose === 'stoppie' ? -102 : -106;
    var shortsD = ghost ? (o.tint || '#dff2ff') : '#171d26';
    function leg(side, phase, dark) {
      var a = pedal + phase;
      var py = -32 - 20 * Math.cos(a);              // 踏板 y（曲柄竖直投影）
      var px = side * (hw + 4);
      var hx = side * (hw - 3) + steer * 2;
      var kx = side * (hw + 6) + steer * 3;
      var ky = (hipY + py) / 2 - 6;
      taper(g, hx, hipY + 4, kx, ky, 12.5, dark ? shortsD : shorts);
      taper(g, kx, ky, px, py + 2, 9, dark ? skinD : skin);
      g.fillStyle = shoe;                            // 鞋
      g.beginPath(); g.ellipse(px + side * 2, py + 2, 8.5, 4.5, 0, 0, TAU); g.fill();
      if (!ghost) {                                  // 袜口
        g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(px - 3.5, py - 3); g.lineTo(px + 3.5, py - 3); g.stroke();
      }
    }
    leg(-1, Math.PI, true);

    /* ---- 车把（先画：中间被身体挡住，两端露出） ---- */
    var shY = -148 + (pose === 'wheelie' ? -5 : pose === 'stoppie' ? 5 : 0) + (o.bob || 0);
    var shX = steer * 3;
    var gripY = shY + (col.drop ? 30 : 24) + (pose === 'wheelie' ? -3 : pose === 'stoppie' ? 4 : 0);
    taper(g, shX - bw - 2, gripY, shX + bw + 2, gripY, 4.6, ghost ? jersey : '#262c36');
    if (!ghost) {                                    // 把套（浅色端头，示意手握的位置）
      g.fillStyle = '#6b7482';
      g.fillRect(shX + bw - 6, gripY - 2.6, 9.5, 5.2);
      g.fillRect(shX - bw - 3.5, gripY - 2.6, 9.5, 5.2);
    }

    /* ---- 手臂（画在胸腔下层：内侧被胸口遮住，只从身体两侧露出，向前伸向把端） ---- */
    var elY = shY + (col.drop ? 21 : 17);
    var sleeve = ghost ? (o.tint || '#dff2ff') : (col.sleeve || jersey);
    for (var sd = -1; sd <= 1; sd += 2) {
      var sx = shX + sd * (cw - 3);
      var ex = shX + sd * (cw + 4.5);
      var gx = shX + sd * bw;
      taper(g, sx, shY + 8, ex, elY, 9, sleeve);                         // 上臂（袖）
      taper(g, ex, elY + 1, gx, gripY, 7.2, sd < 0 ? skin : skinD);      // 前臂
      g.fillStyle = ghost ? jersey : '#2c333f';                          // 手套
      g.beginPath(); g.arc(gx, gripY, 5.4, 0, TAU); g.fill();
      if (!ghost) {                                                       // 指节高光
        g.fillStyle = 'rgba(255,255,255,.25)';
        g.beginPath(); g.arc(gx - sd * 1.8, gripY - 2, 2.2, 0, TAU); g.fill();
      }
    }

    /* ---- 臀部短裤（坐在坐垫上） ---- */
    g.fillStyle = shorts;
    g.beginPath();
    g.moveTo(-hw, hipY - 6);
    g.quadraticCurveTo(-hw - 2.5, hipY + 6, -hw + 3.5, hipY + 11);
    g.lineTo(hw - 3.5, hipY + 11);
    g.quadraticCurveTo(hw + 2.5, hipY + 6, hw, hipY - 6);
    g.closePath(); g.fill();

    /* ---- 躯干（骑行服，圆肩） ---- */
    var grad = g.createLinearGradient(-cw, 0, cw, 0);
    grad.addColorStop(0, jersey);
    grad.addColorStop(.55, jersey);
    grad.addColorStop(1, jersey2);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-hw, hipY - 6);
    g.bezierCurveTo(-hw - 2, hipY - 24, -cw + 1, shY + 18, shX - cw + 1, shY + 7);
    g.quadraticCurveTo(shX - cw, shY - 2, shX - cw + 5, shY - 4);
    g.lineTo(shX + cw - 5, shY - 4);
    g.quadraticCurveTo(shX + cw, shY - 2, shX + cw - 1, shY + 7);
    g.bezierCurveTo(cw - 1, shY + 18, hw + 2, hipY - 24, hw, hipY - 6);
    g.closePath(); g.fill();
    if (!ghost) {
      // 布料纹理
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = .22;
      g.fillStyle = pat('mat-fabric', g);
      g.fill();
      g.restore();
      // 脊背阴影 + 左侧轮廓光
      g.strokeStyle = 'rgba(0,0,0,.13)'; g.lineWidth = 3.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(3, hipY - 4); g.quadraticCurveTo(5, (hipY + shY) / 2, shX + 3, shY); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(-cw + 1, shY + 8); g.quadraticCurveTo(-cw, hipY - 16, -hw + 4, hipY - 4); g.stroke();
    }

    /* ---- 头部 ---- */
    var hx2 = shX + steer * 3.5;
    var hy = shY - 17 + (pose === 'wheelie' ? -3 : pose === 'stoppie' ? 3 : 0);
    if (!ghost) {
      g.fillStyle = skin;                                   // 后颈
      rr(g, hx2 - 6.5, hy + 6, 13, 10, 4); g.fill();
      g.fillStyle = 'rgba(0,0,0,.16)';
      g.fillRect(hx2 - 6.5, hy + 12, 13, 4);
    }
    var hgr = g.createRadialGradient(hx2 - 5, hy - 5, 3, hx2, hy, 15);
    hgr.addColorStop(0, ghost ? jersey : '#e7ecf3');
    hgr.addColorStop(.5, ghost ? jersey : col.helmet);
    hgr.addColorStop(1, ghost ? jersey : '#20242c');
    g.fillStyle = hgr;
    g.beginPath(); g.arc(hx2, hy, 13.8, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,.30)';                        // 头盔下缘
    g.beginPath(); g.ellipse(hx2, hy + 9.5, 12.8, 4.8, 0, 0, TAU); g.fill();
    if (!ghost) {
      g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 2;   // 通风口
      g.beginPath(); g.moveTo(hx2 - 7, hy - 8); g.quadraticCurveTo(hx2 - 4, hy - 11, hx2 - 1, hy - 9); g.stroke();
      g.beginPath(); g.moveTo(hx2 + 1, hy - 9); g.quadraticCurveTo(hx2 + 4, hy - 11, hx2 + 7, hy - 8); g.stroke();
    }

    leg(1, 0, false);

    g.restore();
  }

  /* ================= 导出 ================= */
  return {
    init: init,
    art: art,
    has: has,
    c: c,
    ready: ready,
    refreshPat: refreshPat,
    pat: pat,
    drawRider: drawRider,
    BIKES: BIKES,
    coinSprite: coin,
    puddleSprite: puddle
  };
})();
