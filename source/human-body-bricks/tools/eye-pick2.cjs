// 用人工量取的虹膜像素坐标 → 射线反求 3D 坐标（一次性标定）
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 420, height: 480 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html?real=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(400);
  const out = await p.evaluate(() => {
    const cam = window.__cam;
    cam.position.set(0, 1.64, 0.42);
    cam.lookAt(0, 1.61, 0);
    window.__renderer.render(window.__scene, cam);
    const ray = new window.__THREE.Raycaster();
    const hit = (sx, sy) => {
      const W = 420, H = 480;
      ray.setFromCamera({ x: sx / W * 2 - 1, y: -(sy / H * 2 - 1) }, cam);
      const hits = ray.intersectObject(window.__meshes.hair, false);
      return hits.length ? hits[0].point.toArray().map(v => +v.toFixed(4)) : null;
    };
    return {
      L: hit(142, 186), R: hit(257, 184),
      Lin: hit(135, 186), Lout: hit(165, 187),
      Rin: hit(232, 184), Rout: hit(283, 185),
      nose: hit(200, 292),
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
