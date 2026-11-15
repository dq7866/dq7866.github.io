// 诊断：心脏特写黑色碎三角的根因——法线塌陷 / 绕向矛盾 / 网格破洞
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.waitForTimeout(500);

  const out = await page.evaluate(() => {
    const D = window.__HB_DEBUG;
    const rec = D.records.get('heart');
    const meshes = [];
    rec.group.traverse(o => { if (o.isMesh) meshes.push(o); });
    const report = [];
    for (const m of meshes) {
      const raw = m.geometry;
      const ridx = raw.index.array;
      const rnv = raw.attributes.position.count;
      const rpar = new Int32Array(rnv);
      for (let i = 0; i < rnv; i++) rpar[i] = i;
      const rfind = x => { while (rpar[x] !== x) { rpar[x] = rpar[rpar[x]]; x = rpar[x]; } return x; };
      for (let t = 0; t < ridx.length; t += 3) {
        const a = rfind(ridx[t]), b = rfind(ridx[t + 1]);
        if (a !== b) rpar[a] = b;
      }
      const roots = new Set();
      for (let i = 0; i < rnv; i++) roots.add(rfind(i));

      const g = D.refine(m.geometry);
      const pos = g.attributes.position.array;
      const nrm = g.attributes.normal.array;
      const idx = g.index.array;
      const nv = g.attributes.position.count;
      // 1) 法线接近零的顶点数（渲染会变黑）
      let zeroN = 0, tinyN = 0;
      for (let i = 0; i < nv; i++) {
        const l = Math.hypot(nrm[i*3], nrm[i*3+1], nrm[i*3+2]);
        if (l < 0.05) zeroN++;
        else if (l < 0.7) tinyN++;
      }
      // 2) 边的流形统计（>2 面共享 = 非流形；1 面 = 洞边界）
      const edge = new Map();
      for (let t = 0; t < idx.length; t += 3) {
        for (let e = 0; e < 3; e++) {
          const a = idx[t+e], b = idx[t+(e+1)%3];
          if (a === b) continue;
          const k = a < b ? a*16777216+b : b*16777216+a;
          edge.set(k, (edge.get(k) || 0) + 1);
        }
      }
      let e1 = 0, e2 = 0, e3 = 0;
      for (const v of edge.values()) {
        if (v === 1) e1++; else if (v === 2) e2++; else e3++;
      }
      // 3) 三角形几何面积接近 0（退化面）与重复面检测
      let degen = 0;
      const A = new (D.T.Vector3)(), Bv = new (D.T.Vector3)(), C = new (D.T.Vector3)();
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t]*3, b = idx[t+1]*3, c = idx[t+2]*3;
        A.set(pos[a]-pos[b], pos[a+1]-pos[b+1], pos[a+2]-pos[b+2]);
        Bv.set(pos[c]-pos[b], pos[c+1]-pos[b+1], pos[c+2]-pos[b+2]);
        const cx = A.y*Bv.z - A.z*Bv.y, cy = A.z*Bv.x - A.x*Bv.z, cz = A.x*Bv.y - A.y*Bv.x;
        const area = Math.hypot(cx, cy, cz) * 0.5;
        if (area < 1e-10) degen++;
      }
      report.push({
        name: m.name || rec.part.id,
        rawComps: roots.size, rawVerts: rnv, rawTris: ridx.length / 3,
        tris: idx.length / 3, verts: nv,
        zeroN, tinyN, edgeHole: e1, edgeManifold: e2, edgeNonManifold: e3, degen,
        // 顶点数 vs 面数比：细分后应该 ≈ 面数/2；明显偏低 = 有重面堆积
        ratio: +(nv / (idx.length / 3)).toFixed(3),
      });
    }
    return report;
  });
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : '无');
  await browser.close();
})();
