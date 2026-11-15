// 验证顶点级心肌收缩是否真的逐帧变化（uCardSys / uCardTwist / uPulse）
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('button[data-subject="heart"]').click());
  await page.waitForTimeout(1500);

  const read = () => page.evaluate(() => {
    const D = window.__HB_DEBUG;
    let m = null, mesh = null;
    D.records.get('heart').group.traverse(o => { if (!m && o.isMesh && o.material && o.material.userData.uni) { m = o.material; mesh = o; } });
    if (!m) return { error: 'no organ material' };
    const u = m.userData.uni;
    return {
      mode: u.uHeartMode.value,
      box: u.uHeartBox.value.toArray().map(v => +v.toFixed(4)),
      sys: +u.uCardSys.value.toFixed(3),
      atr: +u.uCardAtr.value.toFixed(3),
      twist: +u.uCardTwist.value.toFixed(3),
      pulse: +u.uPulse.value.toFixed(3),
      groupScaleY: +D.records.get('heart').group.scale.y.toFixed(4),
      matTransparent: m.transparent,
      renderOrder: mesh.renderOrder,
    };
  });

  const rows = [];
  for (let i = 0; i < 12; i++) { rows.push(await read()); await page.waitForTimeout(95); }
  console.log(JSON.stringify(rows, null, 1));
  const sys = rows.map(r => r.sys);
  console.log('sys range:', Math.min(...sys), '→', Math.max(...sys), ' distinct:', new Set(sys).size);
  await browser.close();
})();
