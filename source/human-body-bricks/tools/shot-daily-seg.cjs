// 分块调试截图：正面/背面/侧面各一张
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 720, height: 1000 } });
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(600);
  const parts = await p.evaluate(() => window.__parts);
  console.log(JSON.stringify(parts, null, 1));
  await p.screenshot({ path: 'review/daily-seg-front.png' });
  await p.evaluate(() => { window.__cam.position.set(3.4, 1.0, 0); window.__cam.lookAt(0, 0.85, 0); });
  await sleep(400);
  await p.screenshot({ path: 'review/daily-seg-side.png' });
  await p.evaluate(() => { window.__cam.position.set(0, 1.0, -3.4); });
  await sleep(400);
  await p.screenshot({ path: 'review/daily-seg-back.png' });
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
