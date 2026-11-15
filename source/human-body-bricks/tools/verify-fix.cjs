// 验证：日常模式拾取/拆下/零件盘 + 旧体块是否移除
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  p.on('pageerror', e => errs.push('EXC ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('ERR ' + m.text()); });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await sleep(1200);
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(e => e.textContent.includes('开始拆解')); if (btn) btn.click(); });
  await sleep(7000);
  const out = await p.evaluate(() => {
    const D = window.__HB_DEBUG;
    D.setSystem('daily');
    // 1) 各部位拾取
    const pick = {};
    for (const [id, sy] of [['chest', 0.25], ['abdomen', 0.0], ['legs', -0.3], ['head', 0.62], ['feet', -0.55]]) {
      pick[id] = D.pickAt(640, Math.round((-sy * 0.5 + 0.5) * 860));
    }
    // 2) 拆下胸口 → 零件盘
    D.detach('chest');
    return { pick, removed: [...D.state.removed], trayShown: document.querySelector('.tray-wrap').classList.contains('show'), trayText: document.getElementById('tray').innerText.slice(0, 60) };
  });
  console.log(JSON.stringify(out, null, 1));
  await sleep(900);
  await p.screenshot({ path: 'review/fix-detach.png' });
  // 3) 装回
  const back = await p.evaluate(() => { window.__HB_DEBUG.install('chest'); return [...window.__HB_DEBUG.state.removed]; });
  console.log('after install removed =', JSON.stringify(back));
  // 4) 无资产部件检查
  const pend = await p.evaluate(() => {
    const D = window.__HB_DEBUG;
    const out = [];
    for (const id of ['mouth', 'lips', 'teeth', 'cheeks', 'ears']) {
      const r = D.records.get(id);
      out.push({ id, children: r.group.children.length, chipDisabled: !!document.querySelector(`[data-chip="${id}"]`)?.disabled });
    }
    return out;
  });
  console.log('pending parts:', JSON.stringify(pend));
  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
