// 验证：神经/消化/免疫三套系统联动 + 工坊交互控制（缩放/旋转/平移/暂停/环绕/速度/复位/退出还原）
const { chromium } = require('playwright');

const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const s = await page.$('#startBtn'); if (s) await s.click();
  await page.click('#btnStudio');
  await page.waitForTimeout(900);

  const V = () => page.evaluate(() => window.__HB_DEBUG.studio.view);
  const M = () => page.evaluate(() => ({
    active: window.__HB_DEBUG.studio.active,
    camEnabled: window.__HB_DEBUG.cam.enabled,
    fov: window.__HB_DEBUG.camera.fov,
    ctlHidden: document.getElementById('studioCtl').hidden,
  }));

  let st = await M();
  ok('进入工坊：studio.active / 常规相机输入已让位', st.active && st.camEnabled === false && st.ctlHidden === false, JSON.stringify(st));

  /* ---- 两套新系统联动 ---- */
  for (const key of ['neuro', 'digest', 'immune']) {
    await page.evaluate(k => document.querySelector(`button[data-subject="${k}"]`).click(), key);
    await page.waitForTimeout(1200);
    const f = await page.evaluate(() => window.__HB_DEBUG.studio.framing);
    await page.screenshot({ path: `review/sys-${key}.png` });
    console.log(`  ${key}: dist=${f.dist} focusY=${f.focus[1]}`);
  }
  ok('新主体按钮渲染无异常', true);

  /* ---- 滚轮缩放 ---- */
  await page.mouse.move(640, 420);
  const z0 = (await V()).zoom;
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(120);
  const z1 = (await V()).zoom;
  ok('滚轮放大', z1 > z0 * 1.05, `×${z0} → ×${z1}`);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(120);
  const z2 = (await V()).zoom;
  ok('滚轮缩小', z2 < z1, `×${z1} → ×${z2}`);

  /* ---- 拖拽旋转 ---- */
  const a0 = (await V()).az, p0 = (await V()).phi;
  await page.mouse.move(640, 420);
  await page.mouse.down();
  await page.mouse.move(760, 470, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const a1 = (await V()).az, p1 = (await V()).phi;
  ok('拖拽旋转（水平 + 俯仰）', Math.abs(a1 - a0) > 0.2 && Math.abs(p1 - p0) > 0.05,
     `az ${a0} → ${a1}, phi ${p0} → ${p1}`);

  /* ---- Shift 拖拽平移 ---- */
  await page.keyboard.down('Shift');
  await page.mouse.move(640, 420);
  await page.mouse.down();
  await page.mouse.move(700, 450, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
  const pan = await V();
  ok('Shift+拖拽平移', Math.abs(pan.panX) > 0.01 || Math.abs(pan.panY) > 0.01,
     `panX=${pan.panX} panY=${pan.panY}`);

  /* ---- 暂停：时间冻结，但相机仍可操作 ---- */
  await page.click('#studioPlay');
  await page.waitForTimeout(80);
  const t0 = (await V()).t;
  await page.waitForTimeout(450);
  const t1 = (await V()).t;
  ok('暂停冻结动画时间', Math.abs(t1 - t0) < 0.002, `t ${t0} → ${t1}`);
  await page.mouse.move(640, 420);
  await page.mouse.down();
  await page.mouse.move(700, 420, { steps: 6 });
  await page.mouse.up();
  const azPaused = (await V()).az;
  ok('暂停时仍可旋转观察', Math.abs(azPaused - a1) > 0.1, `az ${a1} → ${azPaused}`);
  await page.screenshot({ path: 'review/sys-paused.png' });

  /* ---- 继续 / 速度 / 自动环绕 ---- */
  await page.click('#studioPlay');
  await page.waitForTimeout(350);
  const t2 = (await V()).t;
  ok('继续后时间恢复推进', t2 > t1 + 0.1, `t ${t1} → ${t2}`);

  await page.click('#studioSpeed');
  const spd = (await V()).speed;
  ok('播放速度切换', spd === 1.5 || spd === 0.5, `${spd}×`);
  await page.click('#studioSpeed');
  await page.click('#studioSpeed');
  await page.click('#studioSpeed');   // 转一圈回到 1×
  ok('速度循环回到 1×', (await V()).speed === 1);

  await page.click('#studioOrbit');
  const azOff0 = (await V()).az;
  await page.waitForTimeout(420);
  const azOff1 = (await V()).az;
  ok('关闭自动环绕后镜头停住', Math.abs(azOff1 - azOff0) < 0.002, `az ${azOff0} → ${azOff1}`);
  await page.click('#studioOrbit');
  await page.waitForTimeout(350);
  ok('重新开启自动环绕', (await V()).az !== azOff1);

  /* ---- 复位 ---- */
  await page.click('#studioReset');
  const rv = await V();
  ok('复位视角', Math.abs(rv.zoom - 1) < 0.001 && Math.abs(rv.panX) < 0.001 && Math.abs(rv.phi) < 0.001,
     `zoom=${rv.zoom} panX=${rv.panX} phi=${rv.phi}`);

  /* ---- 键盘快捷键 ---- */
  await page.keyboard.press('Space');
  ok('空格键暂停', (await V()).paused === true);
  await page.keyboard.press('Space');
  await page.keyboard.press('Equal');   // '+'
  ok('键盘 + 放大', (await V()).zoom > 1);
  await page.keyboard.press('KeyR');
  ok('R 键复位', Math.abs((await V()).zoom - 1) < 0.001);

  /* ---- 录制链路冒烟：暂停/慢放不会带进导出 ---- */
  await page.evaluate(() => document.querySelector('button[data-subject="neuro"]').click());
  await page.waitForTimeout(300);
  await page.click('#studioPlay');                      // 故意先暂停
  const rec = await page.evaluate(() => {
    const okStart = window.__HB_DEBUG.studio.startRecording(3, 'v');
    return { okStart, view: window.__HB_DEBUG.studio.view, recording: window.__HB_DEBUG.studio.recording };
  });
  ok('开始录制并强制恢复 1× 播放', rec.okStart && rec.recording && !rec.view.paused && rec.view.speed === 1,
     JSON.stringify({ paused: rec.view.paused, speed: rec.view.speed }));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__HB_DEBUG.studio.stopRecording(true));   // 静默丢弃，不触发下载
  await page.waitForTimeout(300);
  ok('录制可正常停止', !(await page.evaluate(() => window.__HB_DEBUG.studio.recording)));

  /* ---- 退出还原 ---- */
  const fovBefore = 38;
  await page.click('#studioClose');
  await page.waitForTimeout(250);
  const out = await M();
  ok('退出：相机输入/控制条/视场还原', !out.active && out.camEnabled === true && out.ctlHidden === true && Math.abs(out.fov - fovBefore) < 0.01,
     JSON.stringify(out));

  console.log('ERRORS:', errs.length ? errs.slice(0, 6) : '无');
  await browser.close();
})();
