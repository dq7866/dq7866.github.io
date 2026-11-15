// 在头雕（yaw 50）上检测虹膜/嘴唇/鼻尖等脸部特征并标记验证
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 430, height: 510 } });
  p.on('console', m => console.log('[page]', m.text()));
  await p.goto('http://127.0.0.1:8900/tools/face-cal.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 40000 });
  const res = await p.evaluate(() => {
    const P = window.__P, C = window.__C, IDX = window.__IDX;
    return 'injected below';
  });
  // 直接在页面里做检测（P/C/IDX 通过 window 暴露不足，改在 evaluate 里重取）
  const out = await p.evaluate(() => {
    // 从 geometry 重新拿数据
    return window.__detect ? window.__detect() : 'no __detect';
  });
  console.log(res, out);
  await b.close();
})();
