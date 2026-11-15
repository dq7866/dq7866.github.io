// 对比发布版（改动前基线）与开发版的颅骨/心脏/大脑
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('EXC', e.message));
  for (const [tag, base] of [['pub', 'http://127.0.0.1:8902'], ['dev', 'http://127.0.0.1:8900']]) {
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
    await page.waitForTimeout(700);
    const s = await page.$('#startBtn'); if (s) await s.click();
    await page.click('#btnStudio');
    await page.waitForTimeout(900);
    for (const key of ['skull', 'heart', 'brain']) {
      const sel = `button[data-subject="${key}"]`;
      const btn = await page.$(sel);
      if (!btn) { console.log(tag, key, 'missing'); continue; }
      await page.evaluate(sel => document.querySelector(sel).click(), sel);
      await page.waitForTimeout(1100);
      await page.screenshot({ path: `review/cmp-${tag}-${key}.png` });
      console.log(tag, key, 'ok');
    }
  }
  await browser.close();
})();
