// 渲染正面视角，帧缓冲找眼白+虹膜像素，射线反求虹膜 3D 坐标
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 840, height: 960 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html?real=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(400);
  const out = await p.evaluate(() => {
    const cam = window.__cam;
    cam.position.set(0, 1.645, 0.40);
    cam.lookAt(0, 1.60, 0);
    const r = window.__renderer;
    r.render(window.__scene, cam);
    const gl = r.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const at = (x, y) => { const i = ((H - 1 - y) * W + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    // 找眼白（亮、低饱和，限脸部窗口）→ 两侧聚类 → 虹膜取眼白附近的暗像素
    const scl = [];
    for (let y = 280; y < 470; y++) for (let x = 150; x < 690; x++) {
      const [rr, gg, bb] = at(x, y);
      const lum = 0.299 * rr + 0.587 * gg + 0.114 * bb;
      const sat = Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
      if (lum > 200 && sat < 30) scl.push([x, y]);
    }
    const mid = W / 2;
    const cluster = (arr) => {
      if (arr.length < 40) return null;
      let cx = 0, cy = 0;
      for (const [x, y] of arr) { cx += x; cy += y; }
      return { x: cx / arr.length, y: cy / arr.length, n: arr.length };
    };
    const sL = cluster(scl.filter(([x]) => x < mid - 10)), sR = cluster(scl.filter(([x]) => x > mid + 10));
    const irisPix = [];
    for (let y = 280; y < 470; y++) for (let x = 150; x < 690; x++) {
      const [rr, gg, bb] = at(x, y);
      if (0.299 * rr + 0.587 * gg + 0.114 * bb > 110) continue;
      irisPix.push([x, y]);
    }
    const near = (c) => c ? irisPix.filter(([x, y]) => Math.hypot(x - c.x, y - c.y) < 34) : [];
    const iL = cluster(near(sL)), iR = cluster(near(sR));
    if (!iL || !iR) return { fail: true, sclL: sL, sclR: sR, sclN: scl.length, irisN: irisPix.length };
    // 射线反求
    const ray = new window.__THREE.Raycaster();
    const hit = (sx, sy) => {
      const nd = { x: sx / W * 2 - 1, y: -(sy / H * 2 - 1) };
      ray.setFromCamera(nd, cam);
      const hits = ray.intersectObject(window.__meshes.hair, false);
      return hits.length ? hits[0].point.toArray() : null;
    };
    return {
      screen: { iL, iR, sL, sR, W, H },
      L: hit(iL.x, iL.y), R: hit(iR.x, iR.y),
      Ls: hit(sL.x, sL.y), Rs: hit(sR.x, sR.y),
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
