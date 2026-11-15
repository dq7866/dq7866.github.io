const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 60000 });
  await p.waitForTimeout(600);
  const out = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const box = g => { const b = new d.T.Box3().setFromObject(g); return b.isEmpty() ? null : { min: b.min.toArray().map(v=>+v.toFixed(2)), max: b.max.toArray().map(v=>+v.toFixed(2)) }; };
    const m = d.bodyMeta;
    return { scale: m.scale, height: m.height, minY: m.minY, daily: box(d.layerGroups.daily), organ: box(d.layerGroups.organ) };
  });
  console.log(JSON.stringify(out));
  await b.close();
})();
