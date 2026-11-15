const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 620, height: 500 } });
  p.on('console', m => { if (m.type() === 'error') console.log('ERR', m.text()); });
  await p.goto('http://127.0.0.1:8900/tools/yaw-cal.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  await sleep(400);
  await p.screenshot({ path: 'review/yaw-cal.png' });
  console.log('ok');
  await b.close();
})();
