// 逐个主体截图 + 记录自动取景参数，检查「心/肺/肝…看起来是否各不相同」
const { chromium } = require('playwright');

const SUBJECTS = ['heart', 'lungs', 'brain', 'liver', 'stomach', 'kidney', 'intestine',
                  'largeBowel', 'skull', 'ribcage', 'spine', 'pelvis', 'skeleton', 'body',
                  'circuit', 'circuitTorso', 'neuro', 'digest', 'immune',
                  'caseCarotid', 'caseCoronary', 'caseStent', 'caseStone', 'caseStroke', 'caseDVT'];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(900);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.waitForTimeout(900);

  for (const key of SUBJECTS) {
    const sel = `button[data-subject="${key}"]`;
    const btn = await page.$(sel);
    if (!btn) { console.log(key, '按钮缺失'); continue; }
    await page.evaluate(sel => document.querySelector(sel).click(), sel);
    await page.waitForTimeout(1100);
    const f = await page.evaluate(() => window.__HB_DEBUG.studio.framing);
    await page.screenshot({ path: `review/subj-${key}.png` });
    console.log(key.padEnd(11), 'dist=' + f.dist, 'focusY=' + f.focus[1], 'h=' + f.h);
  }

  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : '无');
  await browser.close();
})();
