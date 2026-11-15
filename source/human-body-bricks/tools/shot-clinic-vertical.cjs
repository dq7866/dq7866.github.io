// 模拟导出视频的真实画面：竖屏窗口 + 隐藏所有 DOM 覆盖层（DOM 不会进 canvas.captureStream）
// 用来复查 9:16 字幕卡、标题、人体定位图是否会溢出或互相压住
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });

  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnClinic');
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    for (const id of ['clinicPanel', 'studioPanel', 'studioCtl', 'studioRecUI', 'toast', 'tooltip']) {
      const e = document.getElementById(id); if (e) e.hidden = true;
    }
    const bar = document.querySelector('.topbar'); if (bar) bar.style.display = 'none';
    window.__HB_DEBUG.studio.setPaused(true);
  });

  for (const [name, t] of [['01', 2.0], ['03', 15.5], ['05', 27.0]]) {
    await page.evaluate(sec => window.__HB_DEBUG.studio.seek(sec), t);
    await page.waitForTimeout(260);
    await page.screenshot({ path: `review/clinic-v-${name}.png` });
    console.log(`PASS  竖屏画面 ${name} 已截图`);
  }
  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : '无');
  await browser.close();
})();
