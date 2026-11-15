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
    D.setSystem('daily');
    const probes = {};
    for (const [id, sx, sy] of [['chest', 0, 0.25], ['legs', 0, -0.3], ['head', 0, 0.62], ['arms', -0.18, 0.2]]) {
      const x = (sx * 0.5 + 0.5) * 1280, y = (-sy * 0.5 + 0.5) * 860;
      probes[id] = { xy: [Math.round(x), Math.round(y)], pick: D.pickAt(x, y) };
    }
    return probes;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
