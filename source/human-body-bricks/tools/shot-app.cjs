const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await sleep(2000);
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(e => e.textContent.includes('开始拆解'));
    if (btn) btn.click();
  });
  await sleep(6000); // body.glb 9MB 加载
  // 日常人体页签
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.sys-card')].find(e => e.dataset.sys === 'daily');
    if (t) t.click();
  });
  await sleep(2500);
  await p.screenshot({ path: 'review/app-daily.png' });
  // 器官页签（高精度 CT 器官）
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.sys-card')].find(e => e.dataset.sys === 'organ');
    if (t) t.click();
  });
  await sleep(2500);
  await p.screenshot({ path: 'review/app-organ.png' });
  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
