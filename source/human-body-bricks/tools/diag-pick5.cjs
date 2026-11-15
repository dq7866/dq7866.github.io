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
    const mk = () => { const r = new Raycaster(); r.setFromCamera({ x: 0, y: 0.249 }, D.camera); return r; };
    const chestMesh = D.records.get('chest').group.children[0];
    const list = [];
    D.layerGroups.daily.traverse(o => { if (o.isMesh) list.push(o); });
    const r1 = mk();
    const before = { single: r1.intersectObject(chestMesh, false).length, inList: r1.intersectObjects(list, false).length };
    D.scene.updateMatrixWorld(true);
    const r2 = mk();
    const after = { single: r2.intersectObject(chestMesh, false).length, inList: r2.intersectObjects(list, false).length };
    // 检查 chest 的矩阵世界是否陈旧
    const rec = D.records.get('chest');
    return {
      before, after,
      chestInList: list.includes(chestMesh),
      chestGeoSphereNull: chestMesh.geometry.boundingSphere === null,
      chestMatrixWorldEl: chestMesh.matrixWorld.elements.slice(12, 15).map(v => +v.toFixed(3)),
      groupMatrixWorldEl: rec.group.matrixWorld.elements.slice(12, 15).map(v => +v.toFixed(3)),
      listFirst3: list.slice(0, 3).map(m => ({ id: m.userData.partId, hasGeo: !!m.geometry, sphereNull: m.geometry.boundingSphere === null })),
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
