// 用系统 Edge 打开页面，抓控制台日志、导出运行时状态并截图
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://127.0.0.1:8899/index.html?auto=1';
const out = process.argv[3] || 'shot.png';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  const info = await page.evaluate(() => {
    const d = window.__HB_DEBUG;
    if (!d) return { error: '没有 __HB_DEBUG' };
    const recs = [...d.records.entries()].map(([id, r]) => ({
      id,
      pos: r.base.toArray().map(v => +v.toFixed(3)),
      meshes: (() => { let n = 0; r.group.traverse(o => { if (o.isMesh) n++; }); return n; })(),
      visible: r.group.visible,
    }));
    const bb = new (window.THREE_BOX3 || Object)();
    return {
      bodyScale: d.bodyMeta.scale,
      bodyHeight: d.bodyMeta.height,
      source: d.bodyMeta.source,
      stats: d.bodyMeta.stats,
      camPos: d.camera.position.toArray().map(v => +v.toFixed(2)),
      camTarget: d.cam.target.toArray().map(v => +v.toFixed(2)),
      camDist: d.cam.dist,
      parts: recs.slice(0, 40),
      zeros: recs.filter(r => r.meshes === 0).map(r => r.id),
    };
  });

  await page.screenshot({ path: out });
  console.log(JSON.stringify(info, null, 1));
  console.log('--- 控制台 ---');
  console.log(logs.slice(-25).join('\n'));
  await browser.close();
})();
