const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await p.waitForTimeout(700);
  const s = await p.$('#startBtn'); if (s) await s.click();
  try {
    await p.evaluate(() => { try { document.getElementById('btnStudio').click(); } catch (e) { console.log('CLICK ERR', e.message); } });
  } catch (e) { console.log('eval err', e.message); }
  await p.waitForTimeout(1500);
  const st = await p.evaluate(() => ({
    active: window.__HB_DEBUG.studio ? window.__HB_DEBUG.studio.active : 'no-studio',
    panel: !document.getElementById('studioPanel').hidden,
  }));
  console.log(JSON.stringify(st));
  await b.close();
})();
