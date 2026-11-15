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
  await sleep(1200);

  // daily tab exists?
  const tabs = await p.$$eval('.sys-card', els => els.map(e => e.getAttribute('data-sys')));
  // switch to daily
  await p.evaluate(() => window.__HB_DEBUG.setSystem('daily'));
  await sleep(900);
  const daily = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const dailyIds = ['head','hair','eyes','nose','mouth','lips','teeth','cheeks','ears','neck','chest','abdomen','arms','hands','fingers','legs','feet','toes'];
    let visible = 0, invisible = 0;
    dailyIds.forEach(id => {
      const r = d.records.get(id);
      if (!r) { invisible++; return; }
      // group visible AND parent daily layer visible
      let vis = r.group.visible;
      let g = r.group;
      while (g && g !== d.scene) { if (g.visible === false) { vis = false; break; } g = g.parent; }
      if (vis) visible++; else invisible++;
    });
    // confirm anatomical layers hidden
    const op = g2 => { let o=null; g2.traverse(o2=>{ if(o2.material&&o2.material.opacity!=null) o=o2.material.opacity;}); return o; };
    return {
      sysId: d.state.system,
      dailyVisible: visible, dailyInvisible: invisible,
      skeletonOp: op(d.layerGroups.skeleton),
      muscleOp: op(d.layerGroups.muscle),
      organOp: op(d.layerGroups.organ),
      dailyOp: op(d.layerGroups.daily),
    };
  });
  await p.screenshot({ path: `review/${1440}-daily.png` });

  // now verify animations drive real shapes (spleen for immune/lymphatic, brain for neural)
  const realMotion = await p.evaluate(async () => {
    const d = window.__HB_DEBUG;
    const ph = d.getPhysio();
    // 每个动画模式驱动的真实形状（与 physio.js applyMotion 对应）
    const targetOf = {
      neural: 'brain', immune: 'spleen', lymphatic: 'spleen',
      circulation: 'heart', digestion: 'stomach', breath: 'lungs',
      motion: 'femur', endocrine: 'heart',
      urinary: 'bladder', swallow: 'stomach', exertion: 'femur',
      repair: 'radius', senses: 'brain',
    };
    const sig = (id) => { const r = d.records.get(id); const g = r && r.group; return g ? [+g.position.x.toFixed(4),+g.position.y.toFixed(4),+g.position.z.toFixed(4),+g.rotation.x.toFixed(4),+g.rotation.y.toFixed(4),+g.rotation.z.toFixed(4),+g.scale.x.toFixed(4)] : null; };
    const out = {};
    const modes = ['neural','immune','lymphatic','endocrine','circulation','digestion','breath','motion',
                   'urinary','swallow','exertion','repair','senses'];
    for (const m of modes) {
      d.setSystem('body'); await new Promise(r=>setTimeout(r,200));
      ph.setMode(m); await new Promise(r=>setTimeout(r,900));
      const a = sig(targetOf[m]);
      await new Promise(r=>setTimeout(r,700));
      const c = sig(targetOf[m]);
      let changed = false;
      if (a && c) changed = a.some((v,i)=>Math.abs(v-c[i])>1e-3);
      out[m] = { target: targetOf[m], changed };
      ph.setMode(null); await new Promise(r=>setTimeout(r,100));
    }
    return out;
  });

  console.log('TABS:', tabs.join(','));
  console.log('DAILY VIEW:', JSON.stringify(daily, null, 2));
  console.log('REAL-SHAPE MOTION (13 anims):');
  for (const [k,v] of Object.entries(realMotion)) console.log(`  ${k}: target=${v.target} changed=${v.changed}`);
  console.log('ERRORS:', errs.length ? errs.slice(0,8).join(' | ') : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
