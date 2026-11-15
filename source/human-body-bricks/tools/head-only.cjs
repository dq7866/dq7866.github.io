// 只显示 head + hair，看身体头部五官是否从头雕眼窝透出
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 900, height: 480 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html?real=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(400);
  await p.evaluate(() => {
    for (const [k, m] of Object.entries(window.__meshes)) {
      m.visible = (k === 'head' || k === 'hair');
    }
    window.__cam.position.set(0, 1.64, 0.42);
    window.__cam.lookAt(0, 1.61, 0);
  });
  await sleep(300);
  await p.screenshot({ path: 'review/head-vs-hair.png' });
  await p.evaluate(() => {
    for (const [k, m] of Object.entries(window.__meshes)) m.visible = (k === 'head');
  });
  await sleep(300);
  await p.screenshot({ path: 'review/head-only.png' });
  await b.close();
  console.log('ok');
})();
