// 把 heart-vessels 的材质换成纯色 Basic，检查几何形状与贴合度
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
    const hv = D.scene.getObjectByName('heart-vessels');
    hv.traverse(o => {
      if (!o.isMesh) return;
      o.material = new D.T.MeshBasicMaterial({ color: 0xff3030, side: o.material.side });
      o.material.depthTest = true;
    });
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'review/vessel-basic-front.png' });
  await browser.close();
})();
