// 关掉血管材质的 onBeforeCompile：若管子变白，说明注入生效但 wall 算出暗色；
// 若仍黑，说明是光照/深度/透明排序问题。
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('button[data-subject="heart"]').click());
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    const hg = D.records.get('heart').group;
    const inHeart = o => { let p = o; while (p) { if (p === hg) return true; p = p.parent; } return false; };
    ['daily', 'skeleton', 'muscle', 'organ'].forEach(k => {
      const g = D.layerGroups[k];
      if (g) g.traverse(o => { if (o.isMesh && !inHeart(o)) o.visible = false; });
    });
    const hv = D.scene.getObjectByName('heart-vessels');
    const m = hv.children[0].material;
    return {
      color: m.color.getHexString(), opacity: m.opacity,
      transparent: m.transparent, depthTest: m.depthTest, side: m.side,
      colA: m.userData.uni.uColA.value.toArray(), colB: m.userData.uni.uColB.value.toArray(),
      hasCompile: typeof m.onBeforeCompile === 'function',
    };
  });
  console.log('material:', JSON.stringify(before));
  await page.screenshot({ path: 'review/vessel-shader-on.png' });

  await page.evaluate(() => {
    const hv = window.__HB_DEBUG.scene.getObjectByName('heart-vessels');
    hv.traverse(o => { if (o.isMesh) { o.material.onBeforeCompile = () => {}; o.material.needsUpdate = true; } });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'review/vessel-shader-off.png' });
  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : '无');
  await browser.close();
})();
