// 诊断心脏几何：包围盒、mesh 数、射线命中，供冠脉贴面/大血管根部定位
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => {
    const D = window.__HB_DEBUG, T = D.T;
    const rec = D.records.get('heart');
    if (!rec) return { error: 'no heart record' };
    const box = new T.Box3().setFromObject(rec.group);
    const c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3());
    const meshes = [];
    rec.group.updateMatrixWorld(true);
    rec.group.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone();
      meshes.push({
        name: o.name || '(mesh)',
        tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3,
        localBox: [bb.min.toArray().map(v => +v.toFixed(4)), bb.max.toArray().map(v => +v.toFixed(4))],
        worldBox: (() => { const b = bb.clone().applyMatrix4(o.matrixWorld); return [b.min.toArray().map(v => +v.toFixed(4)), b.max.toArray().map(v => +v.toFixed(4))]; })(),
        pos: o.position.toArray().map(v => +v.toFixed(4)),
        scale: o.scale.toArray().map(v => +v.toFixed(4)),
      });
    });
    // 从中心向各方向射线，看表面命中距离与法线
    const rc = new T.Raycaster();
    const list = [];
    rec.group.traverse(o => { if (o.isMesh) list.push(o); });
    const dirs = {
      up: [0, 1, 0], down: [0, -1, 0], front: [0, 0, 1], back: [0, 0, -1],
      left: [-1, 0, 0], right: [1, 0, 0],
      diag: [0.5, 0.6, 0.5], diagDown: [0.5, -0.6, 0.5],
    };
    const hits = {};
    for (const [k, d] of Object.entries(dirs)) {
      const v = new T.Vector3(...d).normalize();
      rc.set(c.clone().addScaledVector(v, -sz.length() * 2), v);
      const h = rc.intersectObjects(list, false)[0];
      hits[k] = h ? { dist: +h.distance.toFixed(4), p: h.point.toArray().map(x => +x.toFixed(4)) } : null;
    }
    return {
      center: c.toArray().map(v => +v.toFixed(4)),
      size: sz.toArray().map(v => +v.toFixed(4)),
      scale: D.bodyMeta.scale,
      height: D.bodyMeta.height,
      meshes, hits,
    };
  });
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
