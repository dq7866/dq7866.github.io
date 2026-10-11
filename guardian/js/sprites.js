/* ============================================================
   冰火守门人 —— 精灵与贴图（/guardian/js/sprites.js）
   ------------------------------------------------------------
   ① 贴图（img/*.webp）：地面材质 / 天空远景 / 场景装饰，用于撑起伪 3D 真实感
   ② 角色精灵：程序化烘焙进离屏 canvas —— 风格统一、体积小、动画可控
   任一贴图缺失都会自动回落到程序化绘制，断网离线也照常可玩。
   ============================================================ */
var Sprites = (function () {
  "use strict";
  var imgs = {}, baked = {}, pending = 0;

  function load(name, src) {
    if (imgs[name]) return imgs[name];
    var im = new Image();
    im.decoding = "async";
    pending++;
    im.onload = im.onerror = function () { pending--; };
    im.src = src;
    imgs[name] = im;
    return im;
  }

  /* 只有真正解码成功才返回，否则调用方走程序化兜底 */
  function art(name) {
    var im = imgs[name];
    return (im && im.complete && im.naturalWidth) ? im : null;
  }
  function ready() { return pending <= 0; }

  function bake(key, w, h, fn) {
    if (baked[key]) return baked[key];
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    fn(c.getContext("2d"), w, h);
    baked[key] = c;
    return c;
  }

  /* ---------------- 绘制小工具 ---------------- */
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function ball(g, cx, cy, r, c1, c2) {
    var rg = g.createRadialGradient(cx - r * .34, cy - r * .4, r * .08, cx, cy, r);
    rg.addColorStop(0, c1); rg.addColorStop(1, c2);
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill();
    g.lineWidth = Math.max(1.5, r * .085);
    g.strokeStyle = "rgba(0,0,0,.3)"; g.stroke();
  }
  function eyes(g, cx, cy, dx, r) {
    g.fillStyle = "#241f1a";
    g.beginPath(); g.arc(cx - dx, cy, r, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(cx + dx, cy, r, 0, 6.2832); g.fill();
    g.fillStyle = "rgba(255,255,255,.9)";
    g.beginPath(); g.arc(cx - dx - r * .3, cy - r * .38, r * .34, 0, 6.2832); g.fill();
    g.beginPath(); g.arc(cx + dx - r * .3, cy - r * .38, r * .34, 0, 6.2832); g.fill();
  }
  function flameShape(g, cx, baseY, w, h, n) {
    g.beginPath();
    for (var i = 0; i < n; i++) {
      var ox = (i - (n - 1) / 2) * (w / n);
      var hh = h * (i === ((n - 1) >> 1) ? 1 : .68);
      g.moveTo(cx + ox - (w / n) * .5, baseY);
      g.quadraticCurveTo(cx + ox - (w / n) * .22, baseY - hh * .68, cx + ox, baseY - hh);
      g.quadraticCurveTo(cx + ox + (w / n) * .22, baseY - hh * .68, cx + ox + (w / n) * .5, baseY);
    }
    g.closePath();
    g.fill();
  }

  /* ---------------- 守门人（火娃 / 水娃） ---------------- */
  function guardian(ele) {
    return bake("g-" + ele, 112, 154, function (g, w, h) {
      var fire = ele === "fire";
      var cx = w / 2, cy = h - 52, r = 34;
      var grd = g.createLinearGradient(0, 8, 0, cy - 22);
      if (fire) { grd.addColorStop(0, "#ffe98a"); grd.addColorStop(.5, "#ff9a3c"); grd.addColorStop(1, "#f0511a"); }
      else { grd.addColorStop(0, "#eafaff"); grd.addColorStop(.55, "#6fd0ff"); grd.addColorStop(1, "#2b7fc4"); }
      g.fillStyle = grd;
      flameShape(g, cx, cy - r + 8, 42, fire ? 54 : 46, 3);
      ball(g, cx, cy, r, fire ? "#ffd79a" : "#cbefff", fire ? "#e2561a" : "#2b7fc4");
      eyes(g, cx, cy - 4, 12, 4.3);
      g.strokeStyle = "rgba(34,22,14,.7)"; g.lineWidth = 2.4; g.lineCap = "round";
      g.beginPath(); g.arc(cx, cy + 5, 8.5, .22 * Math.PI, .78 * Math.PI); g.stroke();
      /* 手臂（烘死即可，主循环再加轻微摆动） */
      g.strokeStyle = fire ? "#e2561a" : "#2b7fc4"; g.lineWidth = 6; g.lineCap = "round";
      g.beginPath(); g.moveTo(cx - r * .85, cy + 4); g.lineTo(cx - r * 1.5, cy + 14); g.stroke();
      g.beginPath(); g.moveTo(cx + r * .85, cy + 4); g.lineTo(cx + r * 1.5, cy + 14); g.stroke();
    });
  }

  /* ---------------- 魔物（冰魔 / 岩魔，含精英与巨像） ---------------- */
  function monster(type, tier) {
    /* tier: 0 普通 / 1 精英 / 2 巨像 */
    var big = tier === 2;
    var W = big ? 176 : 104, H = big ? 200 : 108;
    return bake("m-" + type + "-" + tier, W, H, function (g, w, h) {
      var ice = type === "ice";
      var r = W * (big ? .40 : .44);
      var cx = w / 2, cy = big ? h * .58 : h * .5;
      g.save(); g.translate(cx, cy);
      if (ice) {
        var grd = g.createLinearGradient(0, -r, 0, r);
        grd.addColorStop(0, "#eafcff"); grd.addColorStop(.42, "#6fc9f0"); grd.addColorStop(1, "#2a7cb2");
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(0, -r); g.lineTo(r * .92, -r * .18); g.lineTo(r * .62, r * .92);
        g.lineTo(-r * .62, r * .92); g.lineTo(-r * .92, -r * .18);
        g.closePath(); g.fill();
        g.lineWidth = 2.8; g.strokeStyle = "#1a5a84"; g.stroke();
        g.fillStyle = "rgba(255,255,255,.6)";
        g.beginPath(); g.moveTo(0, -r + 7); g.lineTo(r * .28, -r * .2); g.lineTo(-r * .24, -r * .08); g.closePath(); g.fill();
        /* 冰刺 */
        g.fillStyle = "#bfeeff";
        g.beginPath(); g.moveTo(-r * .5, -r * .78); g.lineTo(-r * .72, -r * 1.22); g.lineTo(-r * .24, -r * .88); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(r * .44, -r * .82); g.lineTo(r * .68, -r * 1.3); g.lineTo(r * .18, -r * .9); g.closePath(); g.fill();
      } else {
        var grd2 = g.createLinearGradient(0, -r, 0, r);
        grd2.addColorStop(0, "#dcb887"); grd2.addColorStop(1, "#87592b");
        g.fillStyle = grd2;
        rr(g, -r * .86, -r * .84, r * 1.72, r * 1.68, r * .2); g.fill();
        g.lineWidth = 2.8; g.strokeStyle = "#553413"; g.stroke();
        g.strokeStyle = "rgba(58,32,8,.5)"; g.lineWidth = 2.2; g.lineCap = "round";
        g.beginPath();
        g.moveTo(-r * .52, -r * .34); g.lineTo(-r * .12, r * .04); g.lineTo(-r * .4, r * .52);
        g.moveTo(r * .36, -r * .52); g.lineTo(r * .14, -r * .04); g.lineTo(r * .54, r * .24);
        g.stroke();
        /* 岩片 */
        g.fillStyle = "rgba(255,236,196,.35)";
        g.beginPath(); g.moveTo(-r * .7, -r * .7); g.lineTo(-r * .3, -r * .62); g.lineTo(-r * .66, -r * .32); g.closePath(); g.fill();
      }
      g.restore();
      eyes(g, cx, cy + r * .2, r * .26, r * .1);
      if (big) {
        g.fillStyle = "#ffd24a";
        g.beginPath();
        g.moveTo(cx - r * .62, cy - r * .74); g.lineTo(cx - r * .32, cy - r * 1.1); g.lineTo(cx, cy - r * .82);
        g.lineTo(cx + r * .32, cy - r * 1.1); g.lineTo(cx + r * .62, cy - r * .74);
        g.closePath(); g.fill();
        g.strokeStyle = "rgba(122,72,10,.6)"; g.lineWidth = 2; g.stroke();
      } else if (tier === 1) {
        g.fillStyle = "#ffd24a";
        g.beginPath();
        g.moveTo(cx - r * .42, cy - r * .84); g.lineTo(cx - r * .2, cy - r * 1.1); g.lineTo(cx, cy - r * .88);
        g.lineTo(cx + r * .2, cy - r * 1.1); g.lineTo(cx + r * .42, cy - r * .84);
        g.closePath(); g.fill();
      }
    });
  }

  /* ---------------- 宝石 ---------------- */
  function gem() {
    return bake("gem", 48, 48, function (g, w, h) {
      var cx = w / 2, cy = h / 2, r = 17;
      var grd = g.createLinearGradient(0, cy - r, 0, cy + r);
      grd.addColorStop(0, "#d9d2ff"); grd.addColorStop(.45, "#9b8cff"); grd.addColorStop(1, "#5f4dd6");
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r * .78, cy - r * .12);
      g.lineTo(cx, cy + r); g.lineTo(cx - r * .78, cy - r * .12); g.closePath(); g.fill();
      g.lineWidth = 2; g.strokeStyle = "rgba(40,26,96,.55)"; g.stroke();
      g.fillStyle = "rgba(255,255,255,.72)";
      g.beginPath(); g.moveTo(cx, cy - r + 3); g.lineTo(cx + r * .3, cy - r * .18); g.lineTo(cx - r * .34, cy - r * .06); g.closePath(); g.fill();
    });
  }

  /* ---------------- 贴图清单（缺图自动兜底，不报错） ---------------- */
  var GROUND = {
    frost: "ground-frost", lava: "ground-lava", forest: "ground-forest",
    sand: "ground-sand", stone: "ground-stone"
  };
  var SKY = {
    frost: "sky-frost", lava: "sky-lava", forest: "sky-forest",
    sand: "sky-sand", stone: "sky-stone"
  };

  function preload(sceneIds) {
    sceneIds.forEach(function (id) {
      if (GROUND[id]) load(GROUND[id], "img/" + GROUND[id] + ".webp");
      if (SKY[id]) load(SKY[id], "img/" + SKY[id] + ".webp");
    });
    ["deco-pine", "deco-boulder", "deco-icespike", "deco-brazier", "deco-pillar", "deco-banner", "deco-cactus"]
      .forEach(function (n) { load(n, "img/" + n + ".webp"); });
  }

  /* ---------------- 程序化兜底纹理 ----------------
     贴图缺失（未下载 / 断网 / 首次访问）时用程序生成的地面与天空，
     保证仍然是"有质感的分层贴图"，而不是一块纯色。 */
  var PROC = {
    frost:  { g: ["#3f4c60", "#8fb4d8"], sky: ["#16233a", "#6f92bc"] },
    lava:   { g: ["#40241c", "#c86a34"], sky: ["#2b0f0a", "#c0552a"] },
    forest: { g: ["#2f4029", "#77a45e"], sky: ["#16301f", "#7fb98a"] },
    sand:   { g: ["#6b5636", "#dcbc80"], sky: ["#3a2a14", "#e0b976"] },
    stone:  { g: ["#3a3546", "#8a80a8"], sky: ["#120e22", "#6a5aa8"] }
  };
  function procGround(id) {
    var c = (PROC[id] || PROC.frost).g;
    return bake("pg-" + id, 256, 256, function (g, w, h) {
      g.fillStyle = c[0]; g.fillRect(0, 0, w, h);
      var i, x, y, r;
      /* 大块斑驳（低对比）：避免被透视横拉成刺眼条纹 */
      for (i = 0; i < 60; i++) {
        x = Math.random() * w; y = Math.random() * h; r = 18 + Math.random() * 46;
        g.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.08)";
        g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
      /* 碎石 / 草斑亮色 */
      g.fillStyle = c[1];
      for (i = 0; i < 170; i++) {
        x = Math.random() * w; y = Math.random() * h; r = Math.random() * 3 + .8;
        g.globalAlpha = Math.random() * .17 + .04;
        g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
      g.globalAlpha = 1;
      /* 细裂纹 */
      g.lineCap = "round";
      for (i = 0; i < 22; i++) {
        x = Math.random() * w; y = Math.random() * h;
        g.strokeStyle = "rgba(0,0,0," + (Math.random() * .1 + .04).toFixed(3) + ")";
        g.lineWidth = Math.random() * 1.6 + .5;
        var a = Math.random() * 6.28, len = 24 + Math.random() * 40;
        g.beginPath(); g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        g.stroke();
      }
    });
  }
  function procSky(id) {
    var c = (PROC[id] || PROC.frost).sky;
    return bake("ps-" + id, 16, 128, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, c[0]); grd.addColorStop(1, c[1]);
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
  }

  return {
    load: load, art: art, ready: ready, preload: preload,
    guardian: guardian, monster: monster, gem: gem, bake: bake, rr: rr,
    groundTex: function (id) { return art(GROUND[id] || "") || procGround(id); },
    skyTex: function (id) { return art(SKY[id] || "") || procSky(id); }
  };
})();
