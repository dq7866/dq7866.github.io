// 日常人体交互流程探针：选中卡片 / 搭建模式 / 系统挑战按钮状态
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await p.goto('http://127.0.0.1:8900/index.html?auto=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 45000 });
  await sleep(800);

  // 1. 切到 daily，逐个选中 18 个部位，确认卡片渲染无异常
  const cardCheck = await p.evaluate(async () => {
    const d = window.__HB_DEBUG;
    d.setSystem('daily');
    await new Promise(r => setTimeout(r, 500));
    const ids = ['head','hair','eyes','nose','mouth','lips','teeth','cheeks','ears','neck','chest','abdomen','arms','hands','fingers','legs','feet','toes'];
    const out = { ok: 0, bad: [] };
    for (const id of ids) {
      d.selectPart(id);
      await new Promise(r => setTimeout(r, 60));
      const panel = document.getElementById('cardPanel');
      const html = panel ? panel.innerHTML : '';
      const hasName = html.length > 200;
      if (hasName) out.ok++; else out.bad.push(id);
    }
    return out;
  });

  // 2. 搭建模式：零件盘应显示 18 个待装零件
  const buildCheck = await p.evaluate(async () => {
    const d = window.__HB_DEBUG;
    d.setMode('build');
    await new Promise(r => setTimeout(r, 500));
    const chips = document.querySelectorAll('#tray .chip').length;
    const title = document.getElementById('trayTitle') ? document.getElementById('trayTitle').textContent : '';
    return { chips, title };
  });
  await p.screenshot({ path: 'review/1440-daily-build.png' });

  // 3. 回到探索模式
  await p.evaluate(() => window.__HB_DEBUG.setMode('explore'));
  await sleep(300);

  console.log('CARD CHECK:', JSON.stringify(cardCheck));
  console.log('BUILD MODE:', JSON.stringify(buildCheck));
  console.log('ERRORS:', errs.length ? errs.slice(0, 8).join(' | ') : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
