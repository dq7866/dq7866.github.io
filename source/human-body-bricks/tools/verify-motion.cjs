const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// representative part whose transform the physio engine drives, per mode
const TARGET = {
  circulation: ['heart','aorta'],
  digestion: ['stomach','intestine'],
  breath: ['lungs','ribs'],
  motion: ['femur','humerus'],
  neural: ['brain','spinalcord'],
  immune: ['heart','liver'],
  lymphatic: ['femur','humerus'],
  endocrine: ['heart','liver'],
};
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type()==='error') errs.push('[console] '+m.text()); });
  await p.goto('http://127.0.0.1:8900/index.html?auto=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size>0, null, { timeout: 45000 });
  await sleep(1000);
  const sig = () => p.evaluate((ids) => {
    const d = window.__HB_DEBUG; const out = {};
    for (const id of ids) { const r = d.records.get(id); if (!r) { out[id]='MISSING'; continue; }
      const g = r.group;
      out[id] = [ +g.position.x.toFixed(4), +g.position.y.toFixed(4), +g.position.z.toFixed(4),
                  +g.rotation.x.toFixed(4), +g.rotation.y.toFixed(4), +g.rotation.z.toFixed(4),
                  +g.scale.x.toFixed(4) ];
    }
    return out;
  }, Object.keys(TARGET).flatMap(k=>TARGET[k]));
  // open physio
  await p.click('#btnPhysio'); await sleep(500);
  const report = {};
  for (const mode of Object.keys(TARGET)) {
    await p.click(`.pb-chip[data-physio="${mode}"]`); await sleep(1200);
    const a = await sig();
    await sleep(700);
    const c = await sig();
    let changed = 0, total = 0;
    const diff = {};
    for (const id of TARGET[mode]) {
      if (a[id]==='MISSING'||c[id]==='MISSING') { diff[id]='missing'; continue; }
      total++;
      const d = a[id].map((v,i)=>Math.abs(v-c[id][i]));
      const moved = d.some(x=>x>1e-3);
      if (moved) changed++;
      diff[id] = moved ? 'CHANGED' : 'static';
    }
    report[mode] = { changed, total, diff };
  }
  console.log(JSON.stringify(report, null, 2));
  console.log('ERRORS:', errs.length ? errs.slice(0,8).join(' | ') : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
