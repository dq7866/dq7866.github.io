// 逐病例定格截图：检查第 2/3/4/5 幕的病变过程是否真的看得见
// （verify-clinic 只截了每例第 1 幕，斑块/狭窄/支架/结石都在后段）
const { chromium } = require('playwright');

const CASES = [
  ['caseCarotid', 'carotid'], ['caseCoronary', 'coronary'], ['caseStent', 'stent'],
  ['caseStone', 'stone'], ['caseStroke', 'stroke'], ['caseDVT', 'dvt'],
];
const S = 6.2;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });

  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const start = await page.$('#startBtn'); if (start) await start.click();
  await page.click('#btnClinic');
  await page.waitForTimeout(900);

  for (const [key, file] of CASES) {
    await page.evaluate(k => document.querySelector(`#studioCase button[data-subject="${k}"]`).click(), key);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__HB_DEBUG.studio.setPaused(true));
    for (const [stage, t] of [[2, S + 4.2], [3, S * 2 + 4.2], [4, S * 3 + 4.2], [5, S * 4 + 3.2]]) {
      await page.evaluate(sec => window.__HB_DEBUG.studio.seek(sec), t);
      await page.waitForTimeout(320);
      await page.screenshot({ path: `review/case-${file}-s${stage}.png` });
    }
    await page.evaluate(() => window.__HB_DEBUG.studio.setPaused(false));
    console.log(`PASS  ${file}：4 个关键幕已定格截图`);
  }

  console.log('ERRORS:', errs.length ? errs.slice(0, 8) : '无');
  await browser.close();
})();
