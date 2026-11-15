// 影视化管线截图：8 套动画各一张 + 帧率采样
const { chromium } = require('playwright');
const MODES = ['circulation', 'digestion', 'neural', 'breath', 'immune', 'lymphatic', 'endocrine', 'motion'];
const W = parseInt(process.argv[2] || '1440', 10);
const H = parseInt(process.argv[3] || '900', 10);

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.4 });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  await p.goto('http://127.0.0.1:8900/index.html?auto=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.getPhysio(), null, { timeout: 40000 });
  await p.waitForTimeout(1600);
  await p.click('#btnPhysio');
  const fps = {};
  for (const id of MODES) {
    await p.click(`.pb-chip[data-physio="${id}"]`);
    await p.waitForTimeout(2200);
    await p.screenshot({ path: `review/cine-${id}.png` });
    fps[id] = await p.evaluate(() => new Promise(res => {
      let n = 0; const t0 = performance.now();
      const loop = () => { n++; if (performance.now() - t0 < 1200) requestAnimationFrame(loop); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
      requestAnimationFrame(loop);
    }));
  }
  // 退出动画后的常规画面，确认后处理已关闭、外观回到原样
  await p.click('#physioExit');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `review/cine-off.png` });
  console.log('FPS:', JSON.stringify(fps));
  console.log('errors:', errs.length ? errs.slice(0, 8).join(' | ') : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
