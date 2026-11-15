// 分辨心脏上的亮白细线来源：冠脉实体 / 环境层鬼影 / 器官自身纹理
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

  const info = await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    const hv = D.scene.getObjectByName('heart-vessels');
    return { found: !!hv, children: hv ? hv.children.length : 0 };
  });
  console.log('heart-vessels:', JSON.stringify(info));

  await page.screenshot({ path: 'review/hl-all.png' });

  // 1) 只关掉冠脉/大血管
  await page.evaluate(() => { const o = window.__HB_DEBUG.scene.getObjectByName('heart-vessels'); if (o) o.visible = false; });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'review/hl-no-vessels.png' });

  // 2) 再关掉所有环境层鬼影，只看心脏本体
  await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    ['daily', 'skeleton', 'muscle', 'organ'].forEach(k => { const g = D.layerGroups[k]; if (g) g.visible = false; });
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'review/hl-organ-only.png' });

  await browser.close();
})();
