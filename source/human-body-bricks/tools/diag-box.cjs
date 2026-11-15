const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 60000 });
  await p.waitForTimeout(800);
  const out = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const m = d.bodyMeta;
    const box = g => { const b = new d.T.Box3().setFromObject(g); return b.isEmpty() ? null : { min: b.min.toArray().map(v=>+v.toFixed(2)), max: b.max.toArray().map(v=>+v.toFixed(2)), size: b.getSize(new d.T.Vector3()).toArray().map(v=>+v.toFixed(2)) }; };
    const res = { meta: { scale: m.scale, height: m.height, minY: m.minY, source: m.source }, root: box(d.bodyRoot || d.scene) };
    for (const k of ['daily','skeleton','muscle','organ']) res[k] = box(d.layerGroups[k]);
    // 心脏等关键部件的世界位置
    const pick = ['heart','lungs','skull','ribcage','chest','spine','liver','stomach'];
    res.parts = {};
    d.records.forEach((r, id) => {
      if (pick.some(q => id.toLowerCase().includes(q))) {
        const b = new d.T.Box3().setFromObject(r.group);
        if (!b.isEmpty()) res.parts[id] = { c: b.getCenter(new d.T.Vector3()).toArray().map(v=>+v.toFixed(2)) };
      }
    });
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
