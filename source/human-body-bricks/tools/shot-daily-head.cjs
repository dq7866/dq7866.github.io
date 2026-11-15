const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 800, height: 800 } });
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(500);
  // 头部特写：正面
  await p.evaluate(() => { window.__cam.position.set(0, 1.60, 0.75); window.__cam.lookAt(0, 1.60, 0); });
  await sleep(300);
  await p.screenshot({ path: 'review/daily-head-front.png' });
  // 侧面
  await p.evaluate(() => { window.__cam.position.set(0.75, 1.60, 0.05); window.__cam.lookAt(0, 1.60, 0); });
  await sleep(300);
  await p.screenshot({ path: 'review/daily-head-side.png' });
  // 四分之三
  await p.evaluate(() => { window.__cam.position.set(0.5, 1.62, 0.55); window.__cam.lookAt(0, 1.60, 0); });
  await sleep(300);
  await p.screenshot({ path: 'review/daily-head-34.png' });
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
