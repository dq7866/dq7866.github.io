// 精确隔离：只保留心脏主体网格（含/不含新建冠脉），隐藏其余所有环境层 mesh
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

  await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    const hg = D.records.get('heart').group;
    const inHeart = o => { let p = o; while (p) { if (p === hg) return true; p = p.parent; } return false; };
    ['daily', 'skeleton', 'muscle', 'organ'].forEach(k => {
      const g = D.layerGroups[k];
      if (g) g.traverse(o => { if (o.isMesh && !inHeart(o)) o.visible = false; });
    });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'review/heart-only-with-vessels.png' });

  await page.evaluate(() => { const o = window.__HB_DEBUG.scene.getObjectByName('heart-vessels'); if (o) o.visible = false; });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'review/heart-only-bare.png' });
  await browser.close();
})();
