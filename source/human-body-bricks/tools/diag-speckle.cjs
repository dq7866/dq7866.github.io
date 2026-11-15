// 排除法定位黑斑：Basic（无光照）→ 有 = 几何深度问题；Normal → 看法线；restore → 原样
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('EXC', e.message));
  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.waitForTimeout(1100);

  const swap = mode => page.evaluate(mode => {
    const D = window.__HB_DEBUG;
    const rec = D.records.get('heart');
    rec.group.traverse(o => {
      if (!o.isMesh) return;
      if (mode === 'basic') {
        if (!o.userData.__orig) o.userData.__orig = o.material;
        o.material = new D.T.MeshBasicMaterial({ color: 0xff5566, side: 2 });
      } else if (mode === 'normal') {
        if (!o.userData.__orig) o.userData.__orig = o.material;
        o.material = new D.T.MeshNormalMaterial({ side: 2 });
      } else if (mode === 'restore' && o.userData.__orig) {
        o.material = o.userData.__orig;
      }
    });
  }, mode);

  for (const mode of ['basic', 'normal', 'restore']) {
    await swap(mode);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `review/speckle-${mode}.png` });
    console.log(mode, 'done');
  }
  await browser.close();
})();
