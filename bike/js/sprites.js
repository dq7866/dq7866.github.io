/* 风驰骑行 —— 矢量精灵（零素材，全部用 Canvas 2D 现画，天生离线可用） */
var Sprites = (function () {
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

  /* ---------------- 金币 ---------------- */
  function coin() {
    var S = 128, c = mk(S, S), g = c.getContext('2d'), cx = S / 2, cy = S / 2, R = S * 0.40;
    var grd = g.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R);
    grd.addColorStop(0, '#fff7cc'); grd.addColorStop(.45, '#fbbf24'); grd.addColorStop(1, '#b45309');
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fillStyle = grd; g.fill();
    g.lineWidth = R * .13; g.strokeStyle = 'rgba(120,53,15,.55)'; g.stroke();
    g.beginPath(); g.arc(cx, cy, R * .62, 0, 7); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = R * .1; g.stroke();
    g.fillStyle = 'rgba(146,64,14,.85)'; g.font = 'bold ' + (R * .95) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¥', cx, cy + R * .04);
    g.globalAlpha = .5; g.beginPath();
    g.ellipse(cx - R * .35, cy - R * .42, R * .22, R * .12, -0.6, 0, 7); g.fillStyle = '#fff'; g.fill();
    return c;
  }

  /* ---------------- 障碍物 ---------------- */
  function cone() {
    var c = mk(96, 128), g = c.getContext('2d');
    g.fillStyle = '#ea580c';
    g.beginPath(); g.moveTo(48, 8); g.lineTo(74, 104); g.lineTo(22, 104); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.fillRect(30, 56, 36, 16);
    g.fillStyle = '#c2410c'; g.beginPath(); g.ellipse(48, 108, 42, 11, 0, 0, 7); g.fill();
    return c;
  }
  function rock() {
    var c = mk(128, 96), g = c.getContext('2d');
    g.fillStyle = '#64748b';
    g.beginPath();
    g.moveTo(8, 88); g.lineTo(26, 40); g.lineTo(56, 16); g.lineTo(92, 30); g.lineTo(118, 66); g.lineTo(120, 88);
    g.closePath(); g.fill();
    g.fillStyle = '#94a3b8';
    g.beginPath(); g.moveTo(26, 40); g.lineTo(56, 16); g.lineTo(70, 44); g.lineTo(42, 62); g.closePath(); g.fill();
    g.fillStyle = 'rgba(30,41,59,.5)';
    g.beginPath(); g.moveTo(70, 44); g.lineTo(118, 66); g.lineTo(120, 88); g.lineTo(76, 88); g.closePath(); g.fill();
    return c;
  }
  function barrier() {
    var c = mk(180, 96), g = c.getContext('2d');
    for (var i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff' : '#dc2626'; g.fillRect(i * 30, 18, 30, 34); }
    g.strokeStyle = '#7f1d1d'; g.lineWidth = 3; g.strokeRect(0, 18, 180, 34);
    g.fillStyle = '#334155'; g.fillRect(16, 52, 14, 40); g.fillRect(150, 52, 14, 40);
    g.fillStyle = '#1e293b'; g.beginPath(); g.ellipse(23, 92, 18, 7, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(157, 92, 18, 7, 0, 0, 7); g.fill();
    return c;
  }
  function puddle() { // 洼地水坑（减速）
    var c = mk(240, 80), g = c.getContext('2d');
    g.fillStyle = 'rgba(56,132,190,.72)';
    g.beginPath(); g.ellipse(120, 46, 108, 28, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.ellipse(86, 34, 34, 8, -0.25, 0, 7); g.fill();
    g.beginPath(); g.ellipse(160, 50, 22, 6, 0.2, 0, 7); g.fill();
    return c;
  }

  /* ---------------- 路旁景物 ---------------- */
  function tree(kind) {
    var c = mk(160, 240), g = c.getContext('2d');
    g.fillStyle = '#5b3a1e'; g.fillRect(70, 150, 20, 84);
    if (kind === 0) { // 阔叶
      var cs = ['#15803d', '#16a34a', '#22c55e'];
      for (var i = 0; i < 3; i++) {
        g.fillStyle = cs[i];
        g.beginPath(); g.arc(80 + (i - 1) * 26, 118 - i * 16, 46 - i * 5, 0, 7); g.fill();
      }
    } else {          // 针叶
      g.fillStyle = '#166534';
      for (var j = 0; j < 3; j++) {
        var yy = 150 - j * 44;
        g.beginPath(); g.moveTo(80, yy - 96); g.lineTo(80 + 54, yy); g.lineTo(80 - 54, yy); g.closePath(); g.fill();
      }
    }
    return c;
  }
  function cactus() {
    var c = mk(120, 220), g = c.getContext('2d');
    g.fillStyle = '#3f7d3f'; rr(g, 46, 40, 28, 172, 14); g.fill();
    rr(g, 16, 96, 22, 66, 11); g.fill(); g.fillRect(30, 142, 22, 18);
    rr(g, 82, 74, 22, 66, 11); g.fill(); g.fillRect(70, 122, 22, 18);
    return c;
  }

  /* ---------------- 自行车 + 骑手（后视） ---------------- */
  // 每个车型 3 个姿态：normal / wheelie（翘头）/ stoppie（翘尾）
  var BIKES = {
    commuter: { frame: '#2563eb', frame2: '#1e40af', jersey: '#e2e8f0', helmet: '#475569', rack: true },
    road:     { frame: '#e11d48', frame2: '#9f1239', jersey: '#f8fafc', helmet: '#ef4444', drop: true },
    mtb:      { frame: '#16a34a', frame2: '#166534', jersey: '#1f2937', helmet: '#f59e0b', fat: true }
  };

  function bikeRear(col, pose) {
    var W = 220, H = 190, c = mk(W, H), g = c.getContext('2d');
    var cx = W / 2, wheelR = col.fat ? 44 : 40, wheelY = H - wheelR - 8;
    var lift = pose === 'wheelie' ? 10 : (pose === 'stoppie' ? -5 : 0);
    var lean = pose === 'wheelie' ? -8 : (pose === 'stoppie' ? 7 : 0); // 骑手前后倾

    // 地面阴影
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(cx, H - 6, wheelR * 1.5, 8, 0, 0, 7); g.fill();

    // 后轮
    g.save();
    g.beginPath(); g.arc(cx, wheelY, wheelR, 0, 7);
    g.lineWidth = col.fat ? 13 : 9; g.strokeStyle = '#111827'; g.stroke();
    g.beginPath(); g.arc(cx, wheelY, wheelR - 6, 0, 7);
    g.lineWidth = 2.5; g.strokeStyle = '#6b7280'; g.stroke();
    g.strokeStyle = 'rgba(156,163,175,.75)'; g.lineWidth = 1.6;
    for (var s = 0; s < 10; s++) {
      var a = s / 10 * Math.PI * 2;
      g.beginPath(); g.moveTo(cx, wheelY);
      g.lineTo(cx + Math.cos(a) * (wheelR - 6), wheelY + Math.sin(a) * (wheelR - 6)); g.stroke();
    }
    g.beginPath(); g.arc(cx, wheelY, 5, 0, 7); g.fillStyle = '#9ca3af'; g.fill();
    g.restore();

    // 车身 + 骑手（整体抬升 lift）
    g.save();
    g.translate(0, -lift);

    // 后上叉 / 座管
    g.strokeStyle = col.frame; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, wheelY - 4); g.lineTo(cx, wheelY - 58); g.stroke();
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(cx - 26, wheelY - 2); g.lineTo(cx, wheelY - 52); g.stroke();
    g.beginPath(); g.moveTo(cx + 26, wheelY - 2); g.lineTo(cx, wheelY - 52); g.stroke();

    // 坐垫
    g.fillStyle = '#1f2937';
    g.beginPath(); g.ellipse(cx, wheelY - 62, 16, 7, 0, 0, 7); g.fill();

    // 双腿（蹬踏姿态：一上一下）
    var legY = wheelY - 30;
    g.strokeStyle = '#0f172a'; g.lineWidth = 11; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 16, wheelY - 52); g.lineTo(cx - 24, legY); g.lineTo(cx - 20, wheelY - 8); g.stroke();
    g.beginPath(); g.moveTo(cx + 16, wheelY - 52); g.lineTo(cx + 22, legY - 14); g.lineTo(cx + 24, wheelY - 24); g.stroke();

    // 躯干（含前倾/后仰）
    var torsoTop = wheelY - 118 + lean;
    g.fillStyle = col.jersey;
    g.beginPath();
    g.moveTo(cx - 24, wheelY - 58);
    g.quadraticCurveTo(cx - 34, wheelY - 96, cx - 20, torsoTop);
    g.lineTo(cx + 20, torsoTop);
    g.quadraticCurveTo(cx + 34, wheelY - 96, cx + 24, wheelY - 58);
    g.closePath(); g.fill();
    // 手臂（向前伸，被躯干遮住大半）
    g.strokeStyle = col.jersey; g.lineWidth = 10;
    g.beginPath(); g.moveTo(cx - 20, torsoTop + 20); g.lineTo(cx - 34, torsoTop + 42); g.stroke();
    g.beginPath(); g.moveTo(cx + 20, torsoTop + 20); g.lineTo(cx + 34, torsoTop + 42); g.stroke();

    // 头盔
    var helmY = torsoTop - 16;
    g.fillStyle = col.helmet;
    g.beginPath(); g.arc(cx, helmY, 19, Math.PI * 1.02, Math.PI * 1.98); g.fill();
    g.fillRect(cx - 19, helmY - 3, 38, 9);
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.arc(cx - 6, helmY - 6, 5, 0, 7); g.fill();
    // 后颈
    g.fillStyle = '#e8b48c';
    g.fillRect(cx - 7, helmY + 12, 14, 8);

    // 货架 / 特色
    if (col.rack) { g.fillStyle = '#64748b'; rr(g, cx - 30, wheelY - 22, 60, 7, 3); g.fill(); }
    g.restore();
    return c;
  }

  var cache = {};
  function init() {
    cache.coin = coin();
    cache.cone = cone();
    cache.rock = rock();
    cache.barrier = barrier();
    cache.puddle = puddle();
    cache.tree0 = tree(0);
    cache.tree1 = tree(1);
    cache.cactus = cactus();
    cache.bikes = {};
    for (var k in BIKES) {
      cache.bikes[k] = {
        normal: bikeRear(BIKES[k], 'normal'),
        wheelie: bikeRear(BIKES[k], 'wheelie'),
        stoppie: bikeRear(BIKES[k], 'stoppie')
      };
    }
  }

  // 玩家车体：根据 pitch(-1..1) 在三个姿态间选取
  function playerBike(type, pitch) {
    var set = cache.bikes[type] || cache.bikes.commuter;
    if (pitch > 0.28) return set.wheelie;
    if (pitch < -0.28) return set.stoppie;
    return set.normal;
  }

  return {
    init: init,
    c: cache,
    playerBike: playerBike,
    bikeColors: BIKES
  };
})();
