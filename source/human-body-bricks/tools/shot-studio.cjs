// 视频工坊端到端验证：开面板、切风格/主体截图、真实录制并检查下载产物
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(900);
  const start = await page.$('#startBtn'); if (start) await start.click();

  const shot = async name => { await page.waitForTimeout(1400); await page.screenshot({ path: `review/${name}.png` }); console.log('shot', name); };

  // 1. 打开工坊
  await page.click('#btnStudio');
  await shot('studio-1-heart-noir');

  // 2. 蓝光扫描 + 心脏
  await page.click('#studioStyle button[data-style="scan"]');
  await shot('studio-2-heart-scan');

  // 3. 蓝光 + 全身骨骼
  await page.click('#studioBone button[data-subject="skeleton"]');
  await shot('studio-3-skeleton-scan');

  // 4. 黑银 + 全身透视
  await page.click('#studioStyle button[data-style="noir"]');
  await page.click('#studioWhole button[data-subject="body"]');
  await shot('studio-4-body-noir');

  // 5. 真实录制 8 秒竖屏
  await page.click('#studioSubject button[data-subject="heart"]');
  await page.click('#studioFormat button[data-format="v"]');
  await page.click('#studioDur button[data-dur="8"]');
  await page.waitForTimeout(600);
  await page.click('#studioRec');
  await page.waitForTimeout(1200);
  const midState = await page.evaluate(() => ({
    recUI: !document.getElementById('studioRecUI').hidden,
    canvas: { w: document.querySelector('canvas').width, h: document.querySelector('canvas').height,
              sw: document.querySelector('canvas').style.width },
    appStudioing: document.getElementById('app').classList.contains('studioing'),
  }));
  console.log('录制中状态:', JSON.stringify(midState));
  await page.screenshot({ path: 'review/studio-5-recording.png' });

  // 等录制结束 + 下载完成
  const dlPath = path.resolve('review/dl-out');
  fs.mkdirSync(dlPath, { recursive: true });
  let saved = null;
  try {
    // onSaved 触发浏览器下载；playwright 监听 download 事件
    const dlPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.studio && !window.__HB_DEBUG.studio.recording, null, { timeout: 30000 });
    const dl = await dlPromise;
    saved = path.join(dlPath, dl.suggestedFilename());
    await dl.saveAs(saved);
  } catch (e) {
    console.log('下载事件未捕获:', e.message.split('\n')[0]);
  }
  await page.waitForTimeout(1200);
  const endState = await page.evaluate(() => ({
    recUI: !document.getElementById('studioRecUI').hidden,
    canvas: { w: document.querySelector('canvas').width, h: document.querySelector('canvas').height },
    panelShown: !document.getElementById('studioPanel').hidden,
  }));
  console.log('结束状态:', JSON.stringify(endState));
  if (saved) {
    const sz = fs.statSync(saved).size;
    console.log('下载产物:', path.basename(saved), (sz / 1024 / 1024).toFixed(2) + 'MB');
  } else {
    console.log('下载产物: 未捕获（检查 onSaved）');
  }
  await page.screenshot({ path: 'review/studio-6-after.png' });

  // 6. 退出还原
  await page.click('#studioClose');
  await page.waitForTimeout(1000);
  const exitState = await page.evaluate(() => ({
    bg: !!window.__HB_DEBUG.scene.background,
    panel: document.getElementById('studioPanel').hidden,
    studioing: document.getElementById('app').classList.contains('studioing'),
  }));
  console.log('退出状态:', JSON.stringify(exitState));
  await page.screenshot({ path: 'review/studio-7-exit.png' });

  console.log('ERRORS:', errs.length ? errs.slice(0, 6) : '无');
  await browser.close();
})();
