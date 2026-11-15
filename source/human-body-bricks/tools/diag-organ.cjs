const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 400)); });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await p.waitForTimeout(700);
  const s = await p.$('#startBtn'); if (s) await s.click();
  await p.waitForTimeout(400);

  const t0 = Date.now();
  await p.evaluate(() => document.getElementById('btnStudio').click());
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__HB_DEBUG.studio.enter('noir', 'heart'));
  await p.waitForTimeout(1500);
  const t1 = Date.now();
  console.log('enter heart ms', t1 - t0);
  await p.screenshot({ path: 'review/organ-heart-1.png' });
  await p.waitForTimeout(1400);
  await p.screenshot({ path: 'review/organ-heart-2.png' });

  // 面数 & 尺度
  const info = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const rec = d.records.get('heart');
    const out = { meshes: [], framing: d.studio.framing };
    rec.group.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry;
      out.meshes.push({ tris: g.index ? g.index.count / 3 : g.attributes.position.count / 3,
                        verts: g.attributes.position.count,
                        mat: o.material.type,
                        hasUni: !!(o.material.userData && o.material.userData.uni),
                        scan: o.material.userData && o.material.userData.uni ? o.material.userData.uni.uScan.value : null });
    });
    return out;
  });
  console.log(JSON.stringify(info));
  await p.evaluate(() => window.__HB_DEBUG.studio.exit());
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'review/organ-exit.png' });
  console.log('ERRORS:', errs.length ? errs.slice(0, 6) : '无');
  await b.close();
})();
