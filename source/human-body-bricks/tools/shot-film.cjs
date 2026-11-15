// shot-film.cjs — 影片模式分镜截图 + 帧率/报错检查
// 用法：node tools/shot-film.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'review');
const URL = 'http://127.0.0.1:8900/index.html';

// 每个采样点：时间轴秒数 → 期望的分镜名
const MARKS = JSON.parse(process.env.MARKS || '[[2,"open"],[10,"skin"],[19,"bone"],[26,"ribs"],[34,"muscle"],[44,"organ"],[52,"heart"],[64,"full"]]');

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.4 });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('loader') ||
    getComputedStyle(document.getElementById('loader')).opacity === '0', { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const startBtn = await page.$('#startBtn');
  if (startBtn) await startBtn.click();
  await page.waitForTimeout(900);

  await page.click('#btnFilm');
  await page.waitForTimeout(600);

  const info = await page.evaluate(() => {
    const d = window.__HB_DEBUG;
    return {
      active: d.film.active,
      total: d.film.total,
      shots: d.film.shots.map(s => ({ id: s.id, start: +s.start.toFixed(2), dur: s.dur })),
      lensOn: d.postfx.lens.on,
      camEnabled: d.cam.enabled,
      filming: document.getElementById('app').classList.contains('filming'),
      uiOn: document.getElementById('filmUI').classList.contains('on'),
    };
  });
  console.log('影片启动:', JSON.stringify(info, null, 1));

  await page.evaluate(() => { window.__HB_DEBUG.film.state.playing = false; });

  for (const [t, name] of MARKS) {
    await page.evaluate(tt => {
      const f = window.__HB_DEBUG.film;
      f.state.t = tt;
      f.state.shot = -1;          // 强制重新定位分镜
    }, t);
    await page.waitForTimeout(1700);
    const st = await page.evaluate(() => {
      const d = window.__HB_DEBUG;
      const f = d.film.state;
      const s = d.film.shots[f.shot];
      return {
        t: +f.t.toFixed(2), shot: s ? s.id : null,
        cap: document.getElementById('filmCapZh').textContent,
        layers: ['daily', 'skeleton', 'muscle', 'organ'].map(k => {
          const g = d.layerGroups[k];
          const m = [];
          g.traverse(o => { if (o.isMesh && o.material && m.length < 1) m.push(o.material.opacity); });
          return `${k}=${(m[0] ?? -1).toFixed(2)}`;
        }).join(' '),
        lens: {
          ap: +d.postfx.lens.aperture.toFixed(2),
          focus: +d.postfx.lens.focus.toFixed(2),
          zoom: +d.postfx.lens.zoom.toFixed(3),
          streak: +d.postfx.lens.streak.toFixed(2),
        },
        dist: +d.cam.dist.toFixed(2),
        fov: +d.camera.fov.toFixed(1),
      };
    });
    const file = path.join(OUT, `film-${String(t).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file });
    console.log(`t=${String(t).padStart(2)} ${name.padEnd(8)} shot=${st.shot} cap=${st.cap} ${st.layers} d=${st.dist} fov=${st.fov} ap=${st.lens.ap} focus=${st.lens.focus} zoom=${st.lens.zoom} streak=${st.lens.streak}`);
  }

  // 帧率
  const fps = await page.evaluate(async () => {
    window.__HB_DEBUG.film.state.playing = true;
    const ts = [];
    await new Promise(res => {
      let n = 0;
      const loop = t => { ts.push(t); if (++n < 130) requestAnimationFrame(loop); else res(); };
      requestAnimationFrame(loop);
    });
    const d = [];
    for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
    d.sort((a, b) => a - b);
    const avg = d.reduce((a, b) => a + b, 0) / d.length;
    return { fps: +(1000 / avg).toFixed(1), p95: +(1000 / d[Math.floor(d.length * 0.95)]).toFixed(1) };
  });
  console.log('帧率:', JSON.stringify(fps));

  // 退出后是否恢复
  await page.click('#filmExit');
  await page.waitForTimeout(1400);
  const after = await page.evaluate(() => {
    const d = window.__HB_DEBUG;
    return {
      active: d.film.active,
      lensOn: d.postfx.lens.on,
      postfxEnabled: d.postfx.enabled ?? null,
      camEnabled: d.cam.enabled,
      fov: +d.camera.fov.toFixed(1),
      filming: document.getElementById('app').classList.contains('filming'),
      uiOn: document.getElementById('filmUI').classList.contains('on'),
      btnOn: document.getElementById('btnFilm').classList.contains('on'),
    };
  });
  await page.screenshot({ path: path.join(OUT, 'film-exit.png') });
  console.log('退出后:', JSON.stringify(after));
  console.log('ERRORS:', errors.length ? errors.slice(0, 8) : '无');

  await browser.close();
})();
