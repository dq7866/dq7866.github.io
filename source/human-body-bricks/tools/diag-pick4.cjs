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
    ray.setFromCamera({ x: 0, y: 0.249 }, D.camera);
    const list = [];
    D.layerGroups.daily.traverse(o => {
      if (!o.isMesh) return;
      let q = o;
      while (q && !q.userData.partId) q = q.parent;
      if (!q) return;
      const rec = D.records.get(q.userData.partId);
      if (!rec || rec.group.visible === false) return;
      list.push(o);
    });
    const hits = ray.intersectObjects(list, false);
    return {
      listLen: list.length,
      hits: hits.length,
      firstFaces: hits.slice(0, 3).map(h => ({ id: h.object.userData.partId, d: +h.distance.toFixed(2) })),
      pickAtDirect: D.pickAt(640, 323),
      stateSystem: D.state.system,
      mode: D.state.mode,
      physio: !!D.state.physio,
      camDragging: D.cam.dragging,
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
