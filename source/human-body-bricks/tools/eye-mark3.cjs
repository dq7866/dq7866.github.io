// 隐藏全部五官贴片，拍裸头雕正面（验证隐藏是否生效 + 干净标定底图）
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 420, height: 480 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html?real=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(400);
  const names = await p.evaluate(() => {
    const cam = window.__cam;
    cam.position.set(0, 1.64, 0.42);
    cam.lookAt(0, 1.61, 0);
    const hidden = [];
    for (const [k, m] of Object.entries(window.__meshes)) {
      if (k !== 'hair' && k !== 'head') { m.visible = false; hidden.push(k + ':' + m.visible); }
    }
    window.__renderer.render(window.__scene, cam);
    return hidden;
  });
  console.log('hidden:', JSON.stringify(names));
  await sleep(300);
  await p.screenshot({ path: 'review/bust-bare.png' });
  await b.close();
})();
