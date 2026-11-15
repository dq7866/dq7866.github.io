// 诊断：免疫联动里的白色圆盘来自哪一类对象（管壁/粒子/器官光晕/淋巴结光晕/扩散环/实体球）
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('button[data-subject="immune"]').click());
  await page.waitForTimeout(1200);
  const found = await page.evaluate(() => {
    const scene = window.__HB_DEBUG.scene;
    let g = null;
    scene.traverse(o => {
      if (g || !o.isGroup) return;
      const ro = new Set(o.children.map(c => c.renderOrder));
      if (ro.has(16) && ro.has(17)) g = o;
    });
    if (!g) return false;
    window.__HB_PATH__ = g;
    g.children.forEach(c => { c.userData._vis = true; });
    return true;
  });
  console.log('pathway group:', found);

  const shot = async (label, fn) => {
    await page.evaluate(fn);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `review/diag-${label}.png` });
    console.log('shot', label);
  };
  const reset = () => page.evaluate(() => window.__HB_PATH__.children.forEach(c => { c.visible = true; }));

  await shot('all', () => {});
  await shot('no-ro18', () => { window.__HB_PATH__.children.forEach(c => { c.visible = c.renderOrder !== 18; }); });
  await reset();
  await shot('no-ro19-sprite', () => { window.__HB_PATH__.children.forEach(c => { c.visible = !(c.isSprite && c.renderOrder === 19); }); });
  await reset();
  await shot('no-ro20', () => { window.__HB_PATH__.children.forEach(c => { c.visible = c.renderOrder !== 20; }); });
  await reset();
  await shot('no-ro19-mesh', () => { window.__HB_PATH__.children.forEach(c => { c.visible = !(c.isMesh && c.renderOrder === 19); }); });
  await reset();
  await shot('only-walls', () => { window.__HB_PATH__.children.forEach(c => { c.visible = c.isMesh && c.renderOrder === 16; }); });
  await browser.close();
})();
