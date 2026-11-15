const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await sleep(1200);
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(e => e.textContent.includes('开始拆解')); if (btn) btn.click(); });
  await sleep(7000);
  await p.evaluate(() => window.__HB_DEBUG.setSystem('daily'));
  await sleep(1200);
  await p.screenshot({ path: 'review/app-daily-now.png' });
  // 头部特写
  await p.evaluate(() => {
    const D = window.__HB_DEBUG;
    D.cam.flyTo(0, Math.PI / 2 - 0.15, 2.2, { x: 0, y: 7.05, z: 0 });
  });
  await sleep(1400);
  await p.screenshot({ path: 'review/app-daily-head.png' });
  await b.close();
})();
