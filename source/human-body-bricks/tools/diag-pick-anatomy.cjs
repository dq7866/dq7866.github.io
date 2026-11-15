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
  const out = await p.evaluate(() => {
    const D = window.__HB_DEBUG;
    const res = {};
    for (const sys of ['skeleton', 'muscle', 'organ']) {
      D.setSystem(sys);
      res[sys] = { center: D.pickAt(640, 400), upper: D.pickAt(640, 300), lower: D.pickAt(640, 560) };
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
