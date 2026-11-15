const { chromium } = require('playwright');
const W = parseInt(process.argv[2] || '1440', 10);
const H = parseInt(process.argv[3] || '900', 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.2 });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await p.goto('http://127.0.0.1:8900/index.html?auto=1', { waitUntil: 'load' });
  // records is a Map -> use .size
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 45000 });
  await sleep(1200);

  // 1) SYSTEMS sanity (DOM text decodes the \uXXXX to 正常人体)
  const systems = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const card = document.querySelector('.sys-card[data-sys="body"]');
    return {
      sysId: d.state.system,
      recCount: d.records.size,
      bodyCardText: card ? card.textContent.trim() : null,
      bodyCardHasName: card ? card.textContent.includes('正常人体') : false,
      sysCardCount: document.querySelectorAll('.sys-card').length,
    };
  });

  // 2) Body whole-person view opacities (assembled multi-layer, not a skin shell)
  await p.click('.sys-card[data-sys="body"]');
  await sleep(900);
  const bodyView = await p.evaluate(() => {
    const d = window.__HB_DEBUG;
    const op = g => { if (!g) return null; let o = null; g.traverse(o2 => { if (o2.material && o2.material.opacity != null) o = o2.material.opacity; }); return o; };
    return {
      sysId: d.state.system,
      skeletonOp: op(d.layerGroups.skeleton),
      muscleOp: op(d.layerGroups.muscle),
      organOp: op(d.layerGroups.organ),
    };
  });

  // 3) Walk through all 13 physio animations
  const physioResults = [];
  await p.click('#btnPhysio');
  await sleep(600);
  const chips = await p.$$eval('.pb-chip[data-physio]', els => els.map(e => e.getAttribute('data-physio')));
  for (const id of chips) {
    await p.click(`.pb-chip[data-physio="${id}"]`);
    await sleep(1500);
    const probe = await p.evaluate(() => {
      const d = window.__HB_DEBUG;
      const ph = d.getPhysio && d.getPhysio();
      let moved = 0, rotated = 0, activeMode = null;
      if (ph) {
        activeMode = ph.getModeId ? ph.getModeId() : (ph.state && ph.state.mode);
        if (ph.built && activeMode && ph.built.has(activeMode)) {
          const rec = ph.built.get(activeMode);
          rec.group.traverse(o => {
            if (o.isGroup || o.isMesh) {
              if (Math.abs(o.position.x) + Math.abs(o.position.y) + Math.abs(o.position.z) > 1e-4) moved++;
              if (Math.abs(o.rotation.x) + Math.abs(o.rotation.y) + Math.abs(o.rotation.z) > 1e-4) rotated++;
            }
          });
        }
      }
      return { activeMode, moved, rotated };
    });
    physioResults.push({ id, ...probe });
    await p.screenshot({ path: `review/${W}-${id}.png` });
  }

  await p.click('#physioExit');
  await sleep(800);
  await p.screenshot({ path: `review/${W}-body.png` });

  console.log('=== SYSTEMS ===');
  console.log(JSON.stringify(systems, null, 2));
  console.log('=== BODY VIEW (opacity per layer) ===');
  console.log(JSON.stringify(bodyView, null, 2));
  console.log('=== PHYSIO CHIPS (' + chips.length + ') ===', chips.join(', '));
  console.log('=== PHYSIO RESULTS ===');
  physioResults.forEach(r => console.log(JSON.stringify(r)));
  console.log('=== ERRORS ===', errs.length ? errs.slice(0, 10).join(' | ') : '无');

  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
