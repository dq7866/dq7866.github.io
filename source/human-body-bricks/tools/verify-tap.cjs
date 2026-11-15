// 验证新交互：单击离体 / 单击装回 / 双击进零件盘 / 双击零件盘显示位置
// 全程用真实鼠标点击（走 pickAt 射线），不直接调内部函数
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
  await sleep(6500);
  await p.evaluate(() => window.__HB_DEBUG.setSystem('daily'));
  await sleep(1200);

  // 屏幕上某个形状的位置（投影当前 group 世界坐标）
  const screenOf = (id) => p.evaluate((pid) => {
    const D = window.__HB_DEBUG;
    const r = D.records.get(pid);
    if (!r) return null;
    D.scene.updateMatrixWorld(true);
    const w = new D.T.Vector3();
    r.group.getWorldPosition(w);
    w.project(D.camera);
    return { x: (w.x + 1) / 2 * window.innerWidth, y: (-w.y + 1) / 2 * window.innerHeight };
  }, id);

  const snap = (id) => p.evaluate((pid) => {
    const D = window.__HB_DEBUG, r = D.records.get(pid);
    return {
      loose: D.state.loose.has(pid),
      removed: D.state.removed.has(pid),
      visible: r.group.visible,
      moved: +r.group.position.distanceTo(r.base).toFixed(3),
      opacity: +r.mats[0].opacity.toFixed(2),
      trayShown: document.querySelector('.tray-wrap').classList.contains('show'),
      trayText: document.getElementById('tray').innerText.replace(/\n/g, '|').slice(0, 40),
    };
  }, id);

  const ID = 'chest';
  const log = {};

  // ① 单击身体上的形状 → 离体
  let s = await screenOf(ID);
  await p.mouse.click(s.x, s.y);
  await sleep(1000);
  log.afterClickBody = await snap(ID);
  await p.screenshot({ path: 'review/tap-1-loose.png' });

  // ② 单击浮在旁边的形状 → 装回
  s = await screenOf(ID);
  await p.mouse.click(s.x, s.y);
  await sleep(1000);
  log.afterClickLoose = await snap(ID);

  // ③ 双击身体上的形状 → 飞进零件盘
  s = await screenOf(ID);
  await p.mouse.dblclick(s.x, s.y);
  await sleep(1100);
  log.afterDblBody = await snap(ID);
  await p.screenshot({ path: 'review/tap-2-tray.png' });

  // ④ 双击零件盘里的形状 → 在模型上标出位置
  const chip = await p.$(`[data-chip="${ID}"]`);
  const box = await chip.boundingBox();
  await p.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(900);
  log.afterDblChip = await p.evaluate((pid) => {
    const D = window.__HB_DEBUG, r = D.records.get(pid);
    const ghostMat = r.ghostMats[0];
    return {
      ghostVisible: r.ghost.visible,
      ghostColor: '#' + ghostMat.color.getHexString(),
      ghostOpacity: +ghostMat.opacity.toFixed(2),
      ghostScale: +r.ghost.scale.x.toFixed(2),
      camTargetY: +D.cam.target.y.toFixed(2),
      toast: document.getElementById('toast').textContent,
    };
  }, ID);
  await p.screenshot({ path: 'review/tap-3-locate.png' });

  // ⑤ 双击后零件盘没有把它装回去（removed 仍成立）
  await sleep(2200);
  log.afterLocateRestore = await p.evaluate((pid) => {
    const D = window.__HB_DEBUG, r = D.records.get(pid);
    return { removed: D.state.removed.has(pid), ghostVisible: r.ghost.visible, hasCard: document.getElementById('cardPanel').classList.contains('has-card') };
  }, ID);

  // ⑥ 重建模式：点已装好的形状 → 也能离体
  log.build = await p.evaluate(async (pid) => {
    const D = window.__HB_DEBUG;
    D.setMode('build');
    D.install(pid, true);
    await new Promise(r => setTimeout(r, 700));
    const builtBefore = D.state.built.has(pid);
    D.detachLoose(pid);
    await new Promise(r => setTimeout(r, 700));
    const r = D.records.get(pid);
    return {
      builtBefore,
      looseAfter: D.state.loose.has(pid),
      builtAfter: D.state.built.has(pid),
      moved: +r.group.position.distanceTo(r.base).toFixed(3),
      ghostVisible: r.ghost.visible,
    };
  }, ID);
  await p.screenshot({ path: 'review/tap-4-build.png' });

  console.log(JSON.stringify(log, null, 1));
  console.log('ERRORS:', errs.length ? errs.slice(0, 6) : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
