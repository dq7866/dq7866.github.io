// 真实颜色头部四视角（逐视口拍摄）
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 420, height: 480 } });
  p.on('pageerror', e => console.log('EXC', e.message));
  await p.goto('http://127.0.0.1:8900/tools/daily-debug.html?real=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await sleep(400);
  const views = [[0, 1.62, 0.42, 'front'], [90, 1.62, 0.42, 'sideL'], [-90, 1.62, 0.42, 'sideR'], [0, 1.74, 0.40, 'up15']];
  for (let i = 0; i < views.length; i++) {
    const [deg, y, d, tag, tilt] = views[i];
    await p.evaluate(([deg2, y2, d2]) => {
      const th = deg2 * Math.PI / 180;
      window.__cam.position.set(Math.sin(th) * d2, y2 + 0.02, Math.cos(th) * d2);
      window.__cam.lookAt(0, y2 - 0.01, 0);
    }, [deg, y, d]);
    await sleep(250);
    await p.screenshot({ path: `review/hr-${i}.png` });
  }
  await b.close();
  const fs = require('fs');
  const { execSync } = require('child_process');
  console.log('shots done');
})();
