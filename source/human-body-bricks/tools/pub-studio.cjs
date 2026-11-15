// 发布版工坊冒烟：心脏/颅骨/两个联动主体截图 + 报错收集
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8902/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.waitForTimeout(900);
  for (const key of ['heart', 'skull', 'circuit', 'circuitTorso', 'neuro', 'digest', 'immune',
                     'caseCarotid', 'caseStent']) {
    await page.evaluate(k => document.querySelector(`button[data-subject="${k}"]`).click(), key);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `review/pub-${key}.png` });
    console.log(key, 'ok');
  }
  console.log('ERRORS:', errs.length ? errs.slice(0, 3) : '无');
  await browser.close();
})();
