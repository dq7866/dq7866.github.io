// 诊断：日常人体嘴部重叠形状的拾取顺序，找出牙齿能否被点中
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:8900/index.html?auto=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await p.waitForTimeout(900);
  await p.evaluate(() => window.__HB_DEBUG.setSystem('daily'));
  await p.waitForTimeout(800);
  const out = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const r = d.records.get('teeth');
    const mesh = r.group.children.find(o => o.isMesh);
    const v = new d.T.Vector3(); mesh.getWorldPosition(v);
    const proj = v.clone().project(d.camera);
    const cx = (proj.x + 1) / 2 * window.innerWidth;
    const cy = (-proj.y + 1) / 2 * window.innerHeight;
    // 该点射线上的全部命中（按距离排序）
    const ray = new d.T.Raycaster();
    ray.setFromCamera({ x: proj.x, y: proj.y }, d.camera);
    const meshes = [];
    d.layerGroups.daily.traverse(o => { if (o.isMesh) meshes.push(o); });
    const hits = ray.intersectObjects(meshes, false).slice(0, 12).map(h => {
      let q = h.object; while (q && !q.userData.partId) q = q.parent;
      return { id: q ? q.userData.partId : '?', dist: +h.distance.toFixed(4), z: +h.point.z.toFixed(4) };
    });
    // 嘴部附近 41×41 网格扫描，看有多少点能拾取到 teeth
    let teethHits = 0, breakdown = {};
    for (let dy = -20; dy <= 20; dy += 2) {
      for (let dx = -20; dx <= 20; dx += 2) {
        const id = d.pickAt(cx + dx, cy + dy);
        breakdown[id || 'null'] = (breakdown[id || 'null'] || 0) + 1;
        if (id === 'teeth') teethHits++;
      }
    }
    return { cx: Math.round(cx), cy: Math.round(cy), hits, teethHits, breakdown,
             toothWorldZ: +v.z.toFixed(4), teethChildren: r.group.children.length };
  });
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
