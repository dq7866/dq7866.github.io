const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  p.on('pageerror', e => errs.push('EXC ' + e.message));
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await sleep(1200);
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(e => e.textContent.includes('开始拆解')); if (btn) btn.click(); });
  await sleep(7000);
  const out = await p.evaluate(() => {
    const D = window.__HB_DEBUG;
    D.setSystem('daily');
    D.setMode('build');
    const chips = [...document.querySelectorAll('[data-chip]')].map(c => ({ id: c.dataset.chip, disabled: c.disabled, text: c.innerText.replace(/\n/g, ' ') }));
    // 装一个真实的
    D.install('chest', true);
    const chestVisible = D.records.get('chest').group.visible;
    const chestGhost = D.records.get('chest').ghost.visible;
    // 重建模式下旧体块是否真的消失：检查 ghost/geometry
    const mouthGhost = D.records.get('mouth').ghost.children.length;
    return { chips, chestVisible, chestGhost, mouthGhost };
  });
  console.log(JSON.stringify(out, null, 1));
  await sleep(800);
  await p.screenshot({ path: 'review/fix-build.png' });
  console.log('ERRORS:', errs.length ? errs : '无');
  await b.close();
})();
