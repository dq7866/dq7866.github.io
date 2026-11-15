// 各器官几何统计：分量数 / 面数 / 面积与边长（决定细分与噪声频率余量）
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('EXC', e.message));
  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(600);
  const out = await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    const ids = ['heart', 'lungs', 'brain', 'liver', 'stomach', 'kidney', 'smallIntestine',
                 'largeIntestine', 'spleen', 'skull', 'ribs'];
    const report = [];
    for (const id of ids) {
      const rec = D.records.get(id);
      if (!rec) continue;
      rec.group.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry;
        const idx = g.index.array;
        const pos = g.attributes.position.array;
        const nv = g.attributes.position.count;
        const nf = idx.length / 3;
        // 分量
        const par = new Int32Array(nv);
        for (let i = 0; i < nv; i++) par[i] = i;
        const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
        for (let t = 0; t < idx.length; t += 3) {
          const a = find(idx[t]), b = find(idx[t + 1]);
          if (a !== b) par[a] = b;
        }
        const roots = new Set();
        for (let i = 0; i < nv; i++) roots.add(find(i));
        // 面积 → 平均边长
        let area = 0;
        for (let t = 0; t < idx.length; t += 3) {
          const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
          const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
          const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
          area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) * 0.5;
        }
        const edge = Math.sqrt(2 * area / nf / 3) * Math.sqrt(3); // 近似
        report.push({ id, comps: roots.size, tris: nf, area: +area.toFixed(4), edge: +edge.toExponential(2) });
      });
    }
    return report;
  });
  console.table ? console.table(out) : console.log(JSON.stringify(out));
  await browser.close();
})();
