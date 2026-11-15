// 在截图上标记反求点，人工核对是否落在瞳孔上
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PTS = JSON.parse(process.argv[2] || '[[142,186],[257,184]]');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 420, height: 480 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html?real=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(400);
  const out = await p.evaluate((pts) => {
    const cam = window.__cam, THREE = window.__THREE;
    cam.position.set(0, 1.64, 0.42);
    cam.lookAt(0, 1.61, 0);
    const ray = new THREE.Raycaster();
    const hit = (sx, sy) => {
      ray.setFromCamera({ x: sx / 420 * 2 - 1, y: -(sy / 480 * 2 - 1) }, cam);
      const hits = ray.intersectObject(window.__meshes.hair, false);
      return hits.length ? hits[0].point : null;
    };
    const res = [];
    for (const [sx, sy] of pts) {
      const pt = hit(sx, sy);
      if (pt) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
        m.position.copy(pt);
        window.__scene.add(m);
        res.push([sx, sy, pt.toArray().map(v => +v.toFixed(4))]);
      }
    }
    window.__renderer.render(window.__scene, cam);
    return res;
  }, PTS);
  console.log(JSON.stringify(out));
  await sleep(300);
  await p.screenshot({ path: 'review/eye-mark.png' });
  await b.close();
})();
