const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await sleep(1200);
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(e => e.textContent.includes('开始拆解')); if (btn) btn.click(); });
  await sleep(7000);
  const out = await p.evaluate(() => {
    const D = window.__HB_DEBUG;
    D.setSystem('daily');
    const Raycaster = D.T.Raycaster;
    const ray = new Raycaster();
    ray.setFromCamera({ x: 0, y: 0.25 }, D.camera);
    const chestRec = D.records.get('chest');
    const mesh = chestRec.group.children[0];
    mesh.updateMatrixWorld(true);
    D.scene.updateMatrixWorld(true);
    const geo = mesh.geometry;
    geo.computeBoundingSphere();
    const res = {
      rayOrigin: ray.ray.origin.toArray().map(v => +v.toFixed(3)),
      rayDir: ray.ray.direction.toArray().map(v => +v.toFixed(3)),
      camNear: D.camera.near, camFar: D.camera.far,
      meshMatrix: mesh.matrixWorld.elements.map(v => +v.toFixed(2)),
      geoSphere: { c: geo.boundingSphere.center.toArray().map(v => +v.toFixed(3)), r: +geo.boundingSphere.radius.toFixed(3) },
      posCount: geo.attributes.position.count,
      drawRange: geo.drawRange,
      groups: geo.groups.length,
      hitSingle: ray.intersectObject(mesh, false).length,
      hitScene: ray.intersectObjects(D.layerGroups.daily.children, true).length,
    };
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
