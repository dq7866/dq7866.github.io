// 影片模式与生理动画的互斥 / 恢复检查
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 60000 });
  await p.waitForTimeout(700);
  const start = await p.$('#startBtn'); if (start) await start.click();

  // 1. 先开生理动画
  await p.click('#btnPhysio');
  await p.click('#physioModes .pm-btn, #physioModes button');
  await p.waitForTimeout(1200);
  const s1 = await p.evaluate(() => ({
    physio: window.__HB_DEBUG.state.physio,
    fx: window.__HB_DEBUG.postfx.enabled,
    cine: !!window.__HB_DEBUG.cinema.state.mode,
  }));

  // 2. 影片模式应关掉生理动画
  await p.click('#btnFilm');
  await p.waitForTimeout(900);
  const s2 = await p.evaluate(() => ({
    physio: window.__HB_DEBUG.state.physio,
    film: window.__HB_DEBUG.film.active,
    fx: window.__HB_DEBUG.postfx.enabled,
    lens: window.__HB_DEBUG.postfx.lens.on,
  }));
  await p.screenshot({ path: 'review/film-mid-physio.png' });

  // 3. 退出影片，再开生理动画应恢复正常
  await p.click('#filmExit');
  await p.waitForTimeout(900);
  await p.click('#btnPhysio');
  await p.click('#physioModes .pm-btn, #physioModes button');
  await p.waitForTimeout(1200);
  const s3 = await p.evaluate(() => ({
    physio: window.__HB_DEBUG.state.physio,
    fx: window.__HB_DEBUG.postfx.enabled,
    film: window.__HB_DEBUG.film.active,
    fov: +window.__HB_DEBUG.camera.fov.toFixed(1),
  }));
  await p.screenshot({ path: 'review/film-after-physio.png' });
  console.log('生理中:', JSON.stringify(s1));
  console.log('影片接管:', JSON.stringify(s2));
  console.log('退出后生理:', JSON.stringify(s3));
  console.log('ERRORS:', errs.length ? errs.slice(0, 5) : '无');
  await b.close();
})();
