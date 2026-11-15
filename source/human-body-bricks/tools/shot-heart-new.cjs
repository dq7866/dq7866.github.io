// 心脏真实化验证：心动周期多相位截图 + 联动管网截图 + 着色器报错捕获
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 400)); });

  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.waitForTimeout(800);

  // 心脏：连续抓 5 帧覆盖一个心动周期（T=0.86s）
  await page.evaluate(() => document.querySelector('button[data-subject="heart"]').click());
  await page.waitForTimeout(1600);
  for (let i = 0; i < 5; i++) {
    await page.screenshot({ path: `review/heart-phase-${i}.png` });
    await page.waitForTimeout(190);
  }
  const hf = await page.evaluate(() => window.__HB_DEBUG.studio.framing);
  console.log('heart framing:', JSON.stringify(hf));

  for (const key of ['circuit', 'circuitTorso']) {
    await page.evaluate(k => document.querySelector(`button[data-subject="${k}"]`).click(), key);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `review/link-new-${key}.png` });
    console.log(key, 'ok');
  }

  console.log('ERRORS:', errs.length ? errs.slice(0, 8) : '无');
  await browser.close();
})();
