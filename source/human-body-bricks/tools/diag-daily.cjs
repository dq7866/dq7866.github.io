// 诊断日常人体层：可见部件、三角面数、是否程序化兜底、其他层是否残留
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  const errs = [];
  p.on('pageerror', e => errs.push('EXC ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('ERR ' + m.text()); });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await sleep(1500);
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(e => e.textContent.includes('开始拆解')); if (btn) btn.click(); });
  await sleep(7000);
  const out = await p.evaluate(() => {
    const D = window.__HB_DEBUG;
    D.setSystem('daily');
    const dailyIds = [...D.records.keys()].filter(id => D.records.get(id).part.system === 'daily');
    const rows = dailyIds.map(id => {
      const r = D.records.get(id);
      let tris = 0, meshes = 0, vc = null;
      r.group.traverse(o => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; vc = !!o.material.vertexColors; } });
      return { id, visible: r.group.visible, meshes, tris: Math.round(tris), vc, pos: r.group.position.toArray().map(v => +v.toFixed(3)) };
    });
    const layerInfo = Object.entries(D.layerGroups).map(([k, g]) => {
      let vis = 0, tot = 0;
      g.traverse(o => { if (o.isMesh) { tot++; if (o.material.opacity > 0.02 && o.visible) vis++; } });
      return { layer: k, children: g.children.length, meshes: tot, visibleMeshes: vis, groupVisible: g.visible };
    });
    return { rows, layerInfo, system: D.state.system, mode: D.state.mode, removed: [...D.state.removed], bodyMeta: D.bodyMeta };
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errs.length ? errs.slice(0, 6) : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
