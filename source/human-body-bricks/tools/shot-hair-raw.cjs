const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 260, height: 340 } });
  p.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()); });
  p.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
  await p.addInitScript(() => { window.__NAMES__ = ['hair']; });
  await p.goto('http://127.0.0.1:8900/tools/ai-parts-viewer.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(400);
  await p.screenshot({ path: 'review/hair-raw.png' });
  console.log(JSON.stringify(await p.evaluate(() => window.__dims)));
  await b.close();
})();
