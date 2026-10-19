/* ============================================================
   冰火守门人 —— 伪 3D 透视渲染引擎（/guardian/js/engine3d.js）
   ------------------------------------------------------------
   世界坐标：x ∈ [-1, 1] 横向；z ∈ [0, 1] 纵深（0 = 近端门线，1 = 远端生怪口）
   屏幕映射：y 按透视曲线压缩（近处陡、远处平），宽度按同一比例收敛，
             于是车道自然呈放射状向消失点收拢。
   地面：把地面贴图按"深度带"逐段仿射映射（单带够窄，仿射近似不可辨），
         远处用平色 + 雾，兼顾真实感与帧率。
   ============================================================ */
var Engine3D = (function () {
  "use strict";

  var W = 960, H = 640;
  var HORIZON = 238;        // 地平线（消失点）屏幕 y
  var BASE = 640;           // 近端屏幕 y
  var PERSP = 1.85;         // 透视曲线指数：越大，近处越"铺得快"
  var CX = W / 2;
  var HALF = 468;           // 近端半宽（像素）

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  function yOf(z) {
    var t = 1 - clamp01(z);
    return HORIZON + (BASE - HORIZON) * Math.pow(t, PERSP);
  }
  function sOf(z) { return (yOf(z) - HORIZON) / (BASE - HORIZON); }
  function xOf(x, z) { return CX + x * HALF * sOf(z); }
  function project(x, z) {
    var s = sOf(z);
    return { x: CX + x * HALF * s, y: yOf(z), s: s };
  }

  /* 把贴图的一段仿射映射到梯形（上边中心/半宽、下边中心/半宽） */
  function texBand(ctx, tex, sy, sh, x1, y1, w1, x2, y2, w2) {
    var dy = y2 - y1;
    if (dy <= 0 || sh <= 0 || !tex) return;
    ctx.save();
    ctx.transform((w1 * 2) / tex.width, 0, (x2 - w2 - x1 + w1) / sh, dy / sh, x1 - w1, y1);
    ctx.drawImage(tex, 0, sy, tex.width, sh, 0, 0, tex.width, sh);
    ctx.restore();
  }

  /* ---------------- 天空 ---------------- */
  function drawSky(ctx, tex, theme) {
    var g = ctx.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, theme.skyTop || "#1b2236");
    g.addColorStop(1, theme.skyBottom || "#4a5a7a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HORIZON + 2);

    if (tex) {
      /* 天空贴图半透明覆盖，保留一点色彩倾向 */
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.drawImage(tex, 0, 0, tex.width, tex.height * 0.72, 0, 0, W, HORIZON + 2);
      ctx.restore();
    }
    /* 远景山脊剪影（程序化，撑纵深） */
    drawRidge(ctx, theme);

    /* 贴地雾带：让战场远端"融进"天空，增强景深 */
    var fg = ctx.createLinearGradient(0, HORIZON - 46, 0, HORIZON + 54);
    fg.addColorStop(0, "rgba(0,0,0,0)");
    fg.addColorStop(.5, theme.fog || "rgba(150,170,200,.34)");
    fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, HORIZON - 46, W, 100);
  }

  function drawRidge(ctx, theme) {
    var c = theme.ridge || "rgba(18,16,24,.55)";
    var seed = theme.ridgeSeed || 7;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, HORIZON + 2);
    for (var x = 0; x <= W; x += 24) {
      var t = x / W;
      var hgt = 26 + 30 * Math.abs(Math.sin(t * 5.3 + seed)) + 16 * Math.abs(Math.sin(t * 11.7 + seed * 2));
      ctx.lineTo(x, HORIZON + 2 - hgt * (0.5 + 0.5 * Math.sin(seed)));
    }
    ctx.lineTo(W, HORIZON + 2);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------------- 地面 ---------------- */
  /* opt: { bands, repeat, color, texBands, edgeFade } */
  function drawGround(ctx, tex, theme, opt) {
    opt = opt || {};
    var N = opt.bands || 64;
    var repeat = opt.repeat || 4;
    var per = N / repeat;                       // 每个 repeat 占多少带（必须整除）
    var texBands = opt.texBands || Math.round(N * 0.7);
    var color = opt.color || theme.ground || "#2e251a";

    for (var i = N - 1; i >= 0; i--) {
      var zA = i / N, zB = (i + 1) / N;
      var yA = yOf(zA), yB = yOf(zB);
      /* 地面铺满整幅画布（0..W）：战场之外也有地，避免两侧出现"虚空黑洞"，
         锯齿也随边缘移出画布而消失；战场边界用 drawSides 压暗来交代 */
      var hwA = CX, hwB = CX;

      if (tex && i < texBands && per >= 1) {
        var bandH = tex.height / per;
        var seg = Math.floor(i % per);
        var sy = seg * bandH;
        /* 关键：远边在上（y 小）、近边在下（y 大），保证 dy = yA - yB > 0；
           传反了仿射矩阵会出现负行高，整条带直接被丢弃（地面全黑的根因）。
           外扩量 ov 随带高自适应，相邻带互相压边，消掉残余透视阶梯缝 */
        var ov = Math.max(1.2, (yA - yB) * 0.12);
        texBand(ctx, tex, sy, bandH, CX, yB, hwB + ov, CX, yA, hwA + ov);
        /* 远处逐带压暗：只压最远一段，别把中部也吞了 */
        var fade = i / texBands;
        if (fade > 0.74) {
          ctx.globalAlpha = Math.min(.8, (fade - 0.74) * 3);
          ctx.fillStyle = theme.groundFar || "rgba(24,26,38,.85)";
          ctx.fillRect(0, yB - 0.5, W, (yA - yB) + 1.5);
          ctx.globalAlpha = 1;
        }
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(0, yB - 0.5, W, (yA - yB) + 1.5);
      }
    }

    /* 战场两侧压暗：沿 ±1 边界曲线画半透明暗面，
       既交代"可守区域"，又给画面加两道纵深引导 */
    var shade = theme.sideShade || "rgba(10,12,20,.52)";
    ctx.fillStyle = shade;
    for (var side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      if (side < 0) {
        ctx.moveTo(0, HORIZON + 2);
        ctx.lineTo(CX, HORIZON + 2);
        for (var z = 1; z >= 0; z -= 0.08) ctx.lineTo(xOf(-1, z), yOf(z));
        ctx.lineTo(xOf(-1, 0), BASE + 2);
        ctx.lineTo(0, BASE + 2);
      } else {
        ctx.moveTo(W, HORIZON + 2);
        ctx.lineTo(CX, HORIZON + 2);
        for (var z2 = 1; z2 >= 0; z2 -= 0.08) ctx.lineTo(xOf(1, z2), yOf(z2));
        ctx.lineTo(xOf(1, 0), BASE + 2);
        ctx.lineTo(W, BASE + 2);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  /* 车道分隔线（放射状，向消失点收拢） */
  function drawLanes(ctx, lanes, theme) {
    ctx.strokeStyle = theme.laneLine || "rgba(255,238,205,.13)";
    ctx.lineWidth = 2;
    var split = Math.min(3, Math.max(1, lanes - 1));   // 只画中部几条，避免过密
    for (var k = 1; k <= split; k++) {
      var x = -1 + (2 * k / lanes);
      ctx.beginPath();
      ctx.moveTo(xOf(x, 0), yOf(0));
      ctx.lineTo(xOf(x, 1), yOf(1));
      ctx.stroke();
    }
  }

  /* 漏怪线（近端警戒带） */
  function drawBreachLine(ctx, z, theme) {
    var y = yOf(z), hw = HALF * sOf(z);
    ctx.strokeStyle = theme.breach || "rgba(255,110,90,.55)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(CX - hw, y); ctx.lineTo(CX + hw, y); ctx.stroke();
    ctx.globalAlpha = .12;
    ctx.fillStyle = theme.breach || "#ff6e5a";
    ctx.fillRect(CX - hw, y, hw * 2, 10);
    ctx.globalAlpha = 1;
  }

  /* 地面投影阴影（椭圆）：rx 为世界半径，按透视缩放 */
  function shadow(ctx, x, z, rx, alpha) {
    var p = project(x, z);
    var r = rx * HALF * p.s;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? .34 : alpha;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, r, r * .34, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  /* 按世界高度把精灵贴在地面上画出来：h 为世界高度（1 ≈ 近端半宽的两倍高） */
  function sprite(ctx, img, x, z, worldH, opt) {
    if (!img) return null;
    opt = opt || {};
    var p = project(x, z);
    var h = worldH * HALF * p.s * (opt.scale || 1);
    var w = h * (img.width / img.height);
    var left = p.x - w * (opt.anchorX === undefined ? .5 : opt.anchorX);
    var top = p.y - h * (opt.anchorY === undefined ? 1 : opt.anchorY);
    if (opt.alpha !== undefined) { ctx.save(); ctx.globalAlpha = opt.alpha; }
    if (opt.rot) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(opt.rot);
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, left, top, w, h);
    }
    if (opt.alpha !== undefined) ctx.restore();
    return { x: p.x, y: p.y, w: w, h: h, s: p.s };
  }

  return {
    W: W, H: H, HORIZON: HORIZON, BASE: BASE, CX: CX, HALF: HALF,
    yOf: yOf, sOf: sOf, xOf: xOf, project: project, texBand: texBand,
    drawSky: drawSky, drawGround: drawGround, drawLanes: drawLanes,
    drawBreachLine: drawBreachLine, shadow: shadow, sprite: sprite
  };
})();
