const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => { const s = document.getElementById('startBtn'); if (s) s.click(); });
  await p.evaluate(() => window.__HB_DEBUG.studio.enter('noir', 'ribcage'));
  await p.waitForTimeout(1200);
  const out = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const rec = d.records.get('ribs');
    const meshes = [];
    rec.group.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry;
      const n = g.attributes.normal;
      let zeroN = 0, nanN = 0, vcount = 0, nanP = 0;
      if (n) {
        vcount = n.count;
        for (let i = 0; i < n.count; i++) {
          const x = n.array[i*3], y = n.array[i*3+1], z = n.array[i*3+2];
          if (!isFinite(x) || !isFinite(y) || !isFinite(z)) nanN++;
          else if (x === 0 && y === 0 && z === 0) zeroN++;
        }
      }
      const pa = g.attributes.position.array;
      for (let i = 0; i < Math.min(g.attributes.position.count * 3, 30000); i++) {
        if (!isFinite(pa[i])) nanP++;
      }
      // 索引越界检查
      let oob = 0;
      if (g.index) {
        const mx = g.attributes.position.count;
        for (let i = 0; i < g.index.count; i++) if (g.index.array[i] >= mx) oob++;
      }
      meshes.push({
        tris: g.index ? g.index.count / 3 : g.attributes.position.count / 3,
        vcount, zeroN, nanN, nanP, oob,
        matType: o.material.type,
        matColor: o.material.color ? o.material.color.getHexString() : null,
        side: o.material.side,
        vertexColors: !!o.material.vertexColors,
        visible: o.visible,
        transparent: o.material.transparent,
        depthWrite: o.material.depthWrite,
        hasUni: !!(o.material.userData && o.material.userData.uni),
        geoIsRefined: g !== o.geometry, // 占位
      });
    });
    // ribs 原 geometry 与当前 geometry 的对比
    const st = d.studio;
    return { meshes, frame: st.framing, env: !!d.scene.environment };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
