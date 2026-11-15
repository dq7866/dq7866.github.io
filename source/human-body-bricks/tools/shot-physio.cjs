const { chromium } = require('playwright');
const fs = require('fs');
const modes = ['immune', 'lymphatic', 'endocrine', 'motion'];
const W = parseInt(process.argv[2] || '1440', 10);
const H = parseInt(process.argv[3] || '900', 10);
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.4 });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await p.goto('http://127.0.0.1:8900/index.html?auto=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.getPhysio(), null, { timeout: 40000 });
  await p.waitForTimeout(1500);
  await p.click('#btnPhysio');
  for (const id of modes) {
    await p.click(`.pb-chip[data-physio="${id}"]`);
    await p.waitForTimeout(1600);
    await p.screenshot({ path: `review/${W}-${id}.png` });
  }
  // 整人视图（不进动画，直接看默认/切换 body）
  await p.click('#physioExit');
  await p.waitForTimeout(800);
  await p.click('.sys-card[data-sys="body"]');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `review/${W}-body.png` });
  console.log('errors:', errs.length ? errs.slice(0, 8).join(' | ') : '无');
  await b.close();
})();
