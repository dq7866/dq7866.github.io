const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await p.waitForTimeout(500);
  const out = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const rec = d.records.get('ribs');
    let g = null;
    rec.group.traverse(o => { if (o.isMesh) g = o.geometry; });
    const n = g.attributes.normal;
    const sumBefore = Array.from(n.array.slice(0, 9));
    // 手动重算一次
    g.computeVertexNormals();
    const sumAfter = Array.from(n.array.slice(0, 9));
    // 检查 index 类型
    return {
      idxType: g.index ? g.index.array.constructor.name : null,
      idxCount: g.index ? g.index.count : 0,
      posCount: g.attributes.position.count,
      normCount: n ? n.count : 0,
      sumBefore, sumAfter,
      hasColor: !!g.attributes.color,
      indexFirst12: g.index ? Array.from(g.index.array.slice(0, 12)) : null,
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
