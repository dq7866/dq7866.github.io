// 隔离神经通路：统计管壁网格、隐藏环境层/器官后单独看管子
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.evaluate(() => document.querySelector('button[data-subject="neuro"]').click());
  await page.waitForTimeout(1000);

  const stat = await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    let walls = [], particles = 0;
    D.scene.traverse(o => {
      const u = o.material && o.material.uniforms;
      if (u && u.uSegments) walls.push({ tris: o.geometry.index ? o.geometry.index.count / 3 : 0,
        order: o.renderOrder, blending: o.material.blending, opacity: u.uOpacity.value,
        speed: u.uSpeed.value, count: u.uCount.value, visible: o.visible });
      else if (u === undefined && o.material && o.material.isShaderMaterial && o.isInstancedMesh) particles++;
    });
    return { walls, particles };
  });
  console.log('walls:', stat.walls.length, JSON.stringify(stat.walls.slice(0, 3)));
  console.log('ERRORS:', errs.length ? errs : '无');

  // 隐藏所有图层（含实体器官），只留通路 group
  await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    Object.values(D.layerGroups).forEach(g => { g.visible = false; });
    Object.values(D.ghostGroups).forEach(g => { g.visible = false; });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'review/neuro-isolated.png' });
  await browser.close();
})();
