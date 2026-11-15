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
    const mkr = () => { const r = new Raycaster(); r.setFromCamera({ x: 0, y: 0.249 }, D.camera); return r; };
    const mesh = D.records.get('chest').group.children[0];
    const geo = mesh.geometry;
    const s0 = geo.boundingSphere ? { c: geo.boundingSphere.center.toArray(), r: geo.boundingSphere.radius } : null;
    const hit0 = mkr().intersectObject(mesh, false).length;
    geo.computeBoundingSphere();
    const s1 = { c: geo.boundingSphere.center.toArray(), r: geo.boundingSphere.radius };
    const hit1 = mkr().intersectObject(mesh, false).length;
    const bb = geo.boundingBox;
    return { s0, hit0, s1, hit1, bb: bb ? { min: bb.min.toArray(), max: bb.max.toArray() } : null,
      side: mesh.material.side, visible: mesh.visible, posAttrType: geo.attributes.position.array.constructor.name, itemSize: geo.attributes.position.itemSize, normalized: geo.attributes.position.normalized };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
