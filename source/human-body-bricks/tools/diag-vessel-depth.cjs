// 关掉血管深度测试：若冠脉立刻变成明显的粗管，说明之前被心脏表面遮挡
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
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'review/vd-depth-on.png' });

  const stats = await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    const hv = D.scene.getObjectByName('heart-vessels');
    const rows = [];
    hv.children.slice(0, 4).forEach((o, i) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      const sz = b.getSize(new D.T.Vector3());
      rows.push({ i, size: sz.toArray().map(v => +v.toFixed(5)), ro: o.renderOrder,
                  depthTest: o.material.depthTest, op: o.material.opacity });
    });
    return rows;
  });
  console.log(JSON.stringify(stats));

  await page.evaluate(() => {
    const hv = window.__HB_DEBUG.scene.getObjectByName('heart-vessels');
    hv.traverse(o => {
      if (!o.isMesh) return;
      o.renderOrder = 99;
      o.material.depthTest = false;
      o.material.needsUpdate = true;
    });
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'review/vd-depth-off.png' });
  await browser.close();
})();
