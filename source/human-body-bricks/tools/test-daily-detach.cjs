// 实测日常模式：点击拾取 → 拆下 → 零件盘是否出现
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
  await p.evaluate(() => window.__HB_DEBUG.setSystem('daily'));
  await sleep(800);

  // 投影几个部位中心到屏幕坐标，逐个测试拾取
  const probes = await p.evaluate(() => {
    const D = window.__HB_DEBUG, THREE = null;
    const out = [];
    for (const id of ['chest', 'abdomen', 'legs', 'head', 'arms', 'hair']) {
      const r = D.records.get(id);
      const v = r.group.position.clone();
      // 世界坐标 = bodyRoot 矩阵 * 局部
      v.applyMatrix4(D.layerGroups.daily.parent.matrixWorld);
      v.project(D.camera);
      out.push({ id, x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth), y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight) });
    }
    return out;
  });
  console.log('probes:', JSON.stringify(probes));

  for (const pr of probes) {
    const picked = await p.evaluate(([x, y]) => {
      // 模拟 pickAt（内部函数未导出，用 elementFromPoint + 直接调用 pointerup 流程太脆，改用坐标点击）
      return null;
    }, [pr.x, pr.y]);
    await p.mouse.click(pr.x, pr.y);
    await sleep(500);
    const sel = await p.evaluate(() => window.__HB_DEBUG.state.selected);
    console.log(`click ${pr.id} @(${pr.x},${pr.y}) -> selected=${sel}`);
  }
  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : '无');
  await p.screenshot({ path: 'review/diag-daily-click.png' });
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
