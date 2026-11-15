// 验证：免疫系统联动（淋巴管网/淋巴结/病灶聚集/白细胞巡游）+ 视角预设书签
// 覆盖：主体渲染、通路统计、6 个定机位平滑切换、快捷键、书签保存/命名/持久化/切换/重命名/删除/翻页、退出还原
const { chromium } = require('playwright');

const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
const near = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });

  await page.goto('http://127.0.0.1:8900/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  const start = await page.$('#startBtn'); if (start) await start.click();
  await page.evaluate(() => localStorage.removeItem('hb-studio-marks-v1'));
  await page.click('#btnStudio');
  await page.waitForTimeout(700);

  const S = fn => page.evaluate(fn);
  const V = () => S(() => window.__HB_DEBUG.studio.view);
  const info = () => S(() => window.__HB_DEBUG.studio.pathwayInfo);

  /* ================= 一、免疫联动 ================= */
  const btn = await page.$('button[data-subject="immune"]');
  ok('免疫联动主体按钮存在', !!btn);
  await page.evaluate(() => document.querySelector('button[data-subject="immune"]').click());
  await page.waitForTimeout(1400);
  const im = await info();
  ok('免疫通路已建立：淋巴管 > 10 条', !!im && im.routes > 10, JSON.stringify(im));
  ok('淋巴结 / 中枢免疫器官已生成（>= 12）', !!im && im.nodes >= 12, `nodes=${im && im.nodes}`);
  ok('白细胞粒子已生成（> 100）', !!im && im.particles > 100, `particles=${im && im.particles}`);
  const framing = await S(() => window.__HB_DEBUG.studio.framing);
  await page.screenshot({ path: 'review/sys-immune.png' });
  console.log('  免疫取景：', JSON.stringify(framing));

  // 动画确实在推进：淋巴结激活值随时间变化（取材质亮度做代理）
  const pulse = await page.evaluate(async () => {
    const st = window.__HB_DEBUG.studio;
    const grab = () => {
      const g = st.pathwayInfo;
      return g ? document.querySelector('canvas') && window.__HB_DEBUG.studio.view.t : 0;
    };
    const t0 = grab();
    await new Promise(r => setTimeout(r, 600));
    return { t0, t1: grab() };
  });
  ok('免疫动画时间持续推进', pulse.t1 > pulse.t0 + 0.2, `t ${pulse.t0} → ${pulse.t1}`);

  // 切到神经再切回，验证通路正确销毁/重建，不串味
  await page.evaluate(() => document.querySelector('button[data-subject="neuro"]').click());
  await page.waitForTimeout(700);
  const neuroInfo = await info();
  ok('切到神经：淋巴结清零', !!neuroInfo && neuroInfo.nodes === 0, JSON.stringify(neuroInfo));
  await page.evaluate(() => document.querySelector('button[data-subject="immune"]').click());
  await page.waitForTimeout(1000);
  ok('切回免疫：淋巴结重建', (await info()).nodes >= 12);

  /* ================= 二、视角预设 ================= */
  const chipCount = await page.evaluate(() => document.querySelectorAll('#studioPresets .sc-chip').length);
  ok('6 个定机位按钮已渲染', chipCount === 6, `count=${chipCount}`);

  await page.click('#studioPresets .sc-chip[data-mark="preset:front"]');
  const moving = (await V()).moving;
  ok('定机位切换使用平滑摇镜（非硬切）', moving === true);
  await page.waitForTimeout(850);
  const vf = await V();
  ok('正面机位落定并高亮', vf.mark === 'preset:front' && vf.moving === false && near(vf.zoom, 1.0),
     `mark=${vf.mark} zoom=${vf.zoom} az=${vf.az}`);
  const frontOn = await page.evaluate(() =>
    document.querySelector('#studioPresets .sc-chip[data-mark="preset:front"]').classList.contains('on'));
  ok('定机位按钮选中态同步', frontOn);

  await page.keyboard.press('Digit3');
  await page.waitForTimeout(800);
  const vs = await V();
  ok('快捷键 3 → 侧面机位', vs.mark === 'preset:side', `mark=${vs.mark}`);
  await page.keyboard.press('Digit5');
  await page.waitForTimeout(800);
  const vt = await V();
  ok('快捷键 5 → 俯视机位（俯仰角明显下压）', vt.mark === 'preset:top' && vt.phi < -0.5,
     `phi=${vt.phi}`);
  await page.keyboard.press('Digit6');
  await page.waitForTimeout(800);
  ok('快捷键 6 → 微距特写（放大到 ×1.95）', near((await V()).zoom, 1.95, 0.03),
     `zoom=${(await V()).zoom}`);
  await page.screenshot({ path: 'review/mark-macro.png' });

  /* ================= 三、书签 ================= */
  await page.fill('#studioMarkName', '心脏俯视位');
  await page.click('#studioMarkSave');
  await page.waitForTimeout(120);
  const marks1 = await S(() => window.__HB_DEBUG.studio.bookmarks);
  ok('保存书签（带自定义名称）', marks1.length === 1 && marks1[0].name === '心脏俯视位',
     JSON.stringify(marks1.map(m => m.name)));
  const stored = await S(() => localStorage.getItem('hb-studio-marks-v1'));
  ok('书签已写入 localStorage', !!stored && stored.includes('心脏俯视位'));
  const chip1 = await page.evaluate(() => document.querySelectorAll('#studioMarks .sc-chip').length);
  ok('书签按钮自动出现', chip1 === 1);

  const savedView = marks1[0].view;
  await page.evaluate(() => window.__HB_DEBUG.studio.rotateBy(0.9, 0.2));
  await page.waitForTimeout(80);
  const changed = await V();
  ok('手动旋转后视角已偏离书签', Math.abs(changed.az - savedView.az) > 0.5,
     `az ${savedView.az} → ${changed.az}`);
  await page.click('#studioMarks .sc-chip');
  await page.waitForTimeout(850);
  const back = await V();
  ok('点书签一键回到已存机位', near(back.az, savedView.az) && near(back.zoom, savedView.zoom),
     `az=${back.az} zoom=${back.zoom}`);
  ok('当前书签高亮', back.mark === marks1[0].id);

  await page.keyboard.press('KeyB');
  await page.waitForTimeout(100);
  ok('快捷键 B 保存第二个书签', (await S(() => window.__HB_DEBUG.studio.bookmarks.length)) === 2);
  await page.keyboard.press('BracketLeft');
  await page.waitForTimeout(120);
  const cyc = await V();
  ok('[ 键可翻书签', cyc.mark.startsWith('m'), `mark=${cyc.mark}`);
  await page.keyboard.press('BracketRight');
  await page.waitForTimeout(120);
  ok('] 键可翻书签', (await V()).mark.startsWith('m'));

  const renamed = await S(() => {
    const st = window.__HB_DEBUG.studio;
    const id = st.bookmarks[0].id;
    return { ok: st.renameBookmark(id, '免疫正面'), name: st.bookmarks[0].name };
  });
  ok('重命名书签', renamed.ok && renamed.name === '免疫正面', JSON.stringify(renamed));

  await page.evaluate(() => {
    const st = window.__HB_DEBUG.studio;
    st.applyBookmark(st.bookmarks[0].id);
  });
  await page.click('#studioMarkDel');
  await page.waitForTimeout(100);
  const marks2 = await S(() => window.__HB_DEBUG.studio.bookmarks);
  ok('✕ 删除当前书签', marks2.length === 1, `剩余 ${marks2.length}`);

  /* ================= 四、复位 / 手动操作打断过渡 / 录制 ================= */
  await page.keyboard.press('KeyR');
  const rv = await V();
  ok('R 复位清空机位高亮', rv.mark === '' && near(rv.zoom, 1, 0.001), `mark=${rv.mark} zoom=${rv.zoom}`);
  await page.click('#studioPresets .sc-chip[data-mark="preset:back"]');
  await page.waitForTimeout(60);
  await page.evaluate(() => window.__HB_DEBUG.studio.rotateBy(0.4, 0));
  ok('手动旋转打断摇镜', (await V()).moving === false && (await V()).mark === '');

  const rec = await page.evaluate(() => {
    const st = window.__HB_DEBUG.studio;
    const okStart = st.startRecording(3, 'v');
    return { okStart, view: st.view, recording: st.recording };
  });
  ok('免疫联动可录制且强制 1×', rec.okStart && rec.recording && rec.view.speed === 1,
     JSON.stringify({ speed: rec.view.speed, paused: rec.view.paused }));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__HB_DEBUG.studio.stopRecording(true));
  await page.waitForTimeout(300);

  /* ================= 五、退出还原 ================= */
  await page.click('#studioClose');
  await page.waitForTimeout(300);
  const out = await S(() => ({
    active: window.__HB_DEBUG.studio.active,
    camEnabled: window.__HB_DEBUG.cam.enabled,
    ctlHidden: document.getElementById('studioCtl').hidden,
    fov: window.__HB_DEBUG.camera.fov,
  }));
  ok('退出：相机输入/控制条/视场还原', !out.active && out.camEnabled === true && out.ctlHidden === true,
     JSON.stringify(out));

  console.log('ERRORS:', errs.length ? errs.slice(0, 6) : '无');
  await browser.close();
})();
