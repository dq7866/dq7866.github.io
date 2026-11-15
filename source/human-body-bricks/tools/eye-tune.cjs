// 运行时平移 eyes/nose 部件扫描候选偏移，拍全幅再拼合
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 400, height: 520 } });
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(400);
  const eyeBaseY = await p.evaluate(() => window.__meshes.eyes.position.y);
  const noseBaseY = await p.evaluate(() => window.__meshes.nose.position.y);
  const cases = [[0, 0], [-0.008, -0.006], [-0.016, -0.012], [-0.024, -0.02]];
  for (let c = 0; c < cases.length; c++) {
    const [ey, ny] = cases[c];
    await p.evaluate(([ey2, ny2, eb, nb]) => {
      window.__meshes.eyes.position.y = eb + ey2;
      window.__meshes.nose.position.y = nb + ny2;
      window.__cam.position.set(0, 1.60, 0.62);
      window.__cam.lookAt(0, 1.60, 0);
    }, [ey, ny, eyeBaseY, noseBaseY]);
    await sleep(200);
    await p.screenshot({ path: `review/eye-tune-${c}.png` });
  }
  await b.close();
  console.log('shot ok');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
