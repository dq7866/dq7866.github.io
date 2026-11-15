const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await sleep(1200);
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(e => e.textContent.includes('开始拆解')); if (btn) btn.click(); });
  await sleep(7000);
  await p.evaluate(() => window.__HB_DEBUG.setSystem('daily'));
  await sleep(600);
  const info = await p.evaluate(() => {
    const el = document.elementFromPoint(637, 272);
    const D = window.__HB_DEBUG;
    // 统计 daily 层拾取候选
    let meshes = 0, withId = 0, visGroup = 0;
    D.layerGroups.daily.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      let q = o; while (q && !q.userData.partId) q = q.parent;
      if (q) { withId++; const rec = D.records.get(q.userData.partId); if (rec && rec.group.visible) visGroup++; }
    });
    return {
      elementAt: el ? el.tagName + '#' + el.id + '.' + el.className : null,
      meshes, withId, visGroup,
      canvasRect: (() => { const c = document.getElementById('scene'); const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      cameraPos: D.camera.position.toArray().map(v => +v.toFixed(2)),
      dailyScale: D.layerGroups.daily.parent.scale.toArray(),
      dailyMatrix: D.layerGroups.daily.parent.matrixWorld.elements.map(v => +v.toFixed(3)),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
