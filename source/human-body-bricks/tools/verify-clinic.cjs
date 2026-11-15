// 验证：病理课堂（6 个常见病 × 5 幕）
// 覆盖：入口、逐幕字幕 HUD、舞台病变对象、幕跳转与快捷键、暂停冻结、讲解面板清单、
//       录制整段时长、病例切换销毁重建、退出还原、逐病例截图
const { chromium } = require('playwright');

const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
const near = (a, b, eps = 0.05) => Math.abs(a - b) < eps;

const KEYS = ['caseCarotid', 'caseCoronary', 'caseStent', 'caseStone', 'caseStroke', 'caseDVT'];
const FILES = ['carotid', 'coronary', 'stent', 'stone', 'stroke', 'dvt'];

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

  const S = (fn, arg) => page.evaluate(fn, arg);
  const st = () => S(() => {
    const s = window.__HB_DEBUG.studio;
    return {
      active: s.active, isCase: s.isCase, key: s.subjectKey,
      name: s.caseInfo && s.caseInfo.name, site: s.caseInfo && s.caseInfo.site,
      stages: s.caseInfo && s.caseInfo.stages.length,
      total: s.caseDuration, stage: s.caseStage && s.caseStage.index,
      t: s.view.t, hud: s.hudInfo, framing: s.framing,
    };
  });
  const select = key => S(k => document.querySelector(`button[data-subject="${k}"]`).click(), key);

  /* ================= 一、入口与病例按钮 ================= */
  const btns = await S(() => document.querySelectorAll('#studioCase button[data-subject]').length);
  ok('病理课堂 6 个病例按钮已渲染', btns === 6, `count=${btns}`);
  await page.click('#btnClinic');
  await page.waitForTimeout(1200);
  let a = await st();
  ok('顶栏按钮进入病理课堂', a.active && a.isCase && a.key === 'caseCarotid', JSON.stringify({ active: a.active, key: a.key }));
  ok('病例元数据完整（5 幕 / 31 秒 / 部位）', a.stages === 5 && near(a.total, 31, 0.2) && !!a.site,
     `stages=${a.stages} total=${a.total} site=${a.site}`);
  ok('HUD 字幕层已逐帧绘制', !!a.hud && a.hud.frames > 10 && a.hud.w > 100,
     JSON.stringify(a.hud));
  ok('舞台对象已挂进场景', await S(() => !!window.__HB_DEBUG.scene.getObjectByName('case-stage-carotid')));

  /* ================= 二、讲解面板 ================= */
  const panel = await S(() => ({
    hidden: document.getElementById('clinicPanel').hidden,
    stageBtns: document.querySelectorAll('#clinicStages button').length,
    prevent: document.querySelectorAll('#cpPrevent li').length,
    caution: document.querySelectorAll('#cpCaution li').length,
    emergency: document.querySelectorAll('#cpEmergency li').length,
    title: document.getElementById('cpStageTitle').textContent,
    detail: document.getElementById('cpDetail').textContent.length,
  }));
  ok('讲解面板自动展开', !panel.hidden);
  ok('5 个幕按钮 + 预防/注意/急救清单', panel.stageBtns === 5 && panel.prevent >= 3
     && panel.caution >= 3 && panel.emergency >= 3, JSON.stringify(panel));
  ok('当前幕标题与展开说明已填充', panel.title.length > 2 && panel.detail > 20);

  /* ================= 三、逐病例切换 + 截图 ================= */
  for (let i = 0; i < KEYS.length; i++) {
    await select(KEYS[i]);
    await page.waitForTimeout(950);
    const c = await st();
    const stageExists = await S(k => {
      const key = { caseCarotid: 'carotid', caseCoronary: 'coronary', caseStent: 'stent',
                    caseStone: 'stone', caseStroke: 'stroke', caseDVT: 'dvt' }[k];
      return !!window.__HB_DEBUG.scene.getObjectByName('case-stage-' + key);
    }, KEYS[i]);
    const hudGrew = await page.evaluate(async () => {
      const f0 = window.__HB_DEBUG.studio.hudInfo.frames;
      await new Promise(r => setTimeout(r, 260));
      return window.__HB_DEBUG.studio.hudInfo.frames - f0;
    });
    ok(`[${FILES[i]}] 主体/舞台/HUD 正常`, c.isCase && c.key === KEYS[i] && stageExists
       && c.stages === 5 && hudGrew > 3,
       `name=${c.name} focus=${JSON.stringify(c.framing && c.framing.focus)} frames+${hudGrew}`);
    await page.screenshot({ path: `review/case-${FILES[i]}.png` });
  }

  /* ================= 四、幕跳转 / 快捷键 / 暂停 ================= */
  await select('caseCarotid');
  await page.waitForTimeout(500);
  await S(() => document.querySelectorAll('#clinicStages button')[3].click());
  await page.waitForTimeout(180);
  a = await st();
  ok('点幕按钮跳到第 4 幕', a.stage === 3, `stage=${a.stage} t=${a.t}`);
  const synced = await S(() => document.getElementById('cpStageTitle').textContent);
  ok('讲解面板同步到该幕', synced.length > 2 && synced.includes('破裂'), synced);

  await page.keyboard.press('Period');
  await page.waitForTimeout(160);
  ok('. 键翻到下一幕', (await st()).stage === 4);
  await page.keyboard.press('Comma');
  await page.waitForTimeout(160);
  ok(', 键翻回上一幕', (await st()).stage === 3);

  await page.keyboard.press('KeyC');
  await page.waitForTimeout(100);
  ok('C 键收起讲解面板', await S(() => document.getElementById('clinicPanel').hidden));
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(100);
  ok('C 键再次展开', !(await S(() => document.getElementById('clinicPanel').hidden)));

  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  const tA = (await st()).t;
  await page.waitForTimeout(500);
  const tB = (await st()).t;
  ok('空格暂停：病变时间冻结', near(tA, tB, 0.02), `t ${tA} → ${tB}`);
  await S(() => document.querySelectorAll('#clinicStages button')[1].click());
  await page.waitForTimeout(100);
  ok('暂停时仍可点幕观察该阶段', (await st()).stage === 1);
  await page.keyboard.press('Space');
  const tC = (await st()).t;
  await page.waitForTimeout(420);
  const tD = (await st()).t;
  ok('继续后时间恢复推进', tD > tC + 0.2, `t ${tC} → ${tD}`);

  /* ================= 五、录制整段 ================= */
  const rec = await S(() => {
    const s = window.__HB_DEBUG.studio;
    const started = s.startRecording(8, 'v');   // 普通时长 8 秒，病例应覆盖成整段
    return { started, dur: s.recordingDuration, speed: s.view.speed, paused: s.view.paused };
  });
  ok('病例录制自动改为整段时长且强制 1×', rec.started && near(rec.dur, 31, 0.2)
     && rec.speed === 1 && !rec.paused, JSON.stringify(rec));
  await page.waitForTimeout(500);
  await S(() => window.__HB_DEBUG.studio.stopRecording(true));
  await page.waitForTimeout(350);

  /* ================= 六、退出还原 ================= */
  // 病理课堂会收起左工坊面板（避免 DOM 遮挡字幕），用 DOM click 而非可见性点击
  await page.evaluate(() => document.getElementById('studioClose').click());
  await page.waitForTimeout(350);
  const out = await S(() => ({
    active: window.__HB_DEBUG.studio.active,
    isCase: window.__HB_DEBUG.studio.isCase,
    camEnabled: window.__HB_DEBUG.cam.enabled,
    panelHidden: document.getElementById('clinicPanel').hidden,
    ctlHidden: document.getElementById('studioCtl').hidden,
    stageLeft: !!window.__HB_DEBUG.scene.getObjectByName('case-stage-carotid'),
  }));
  ok('退出：舞台销毁 / 面板控制条隐藏 / 相机输入还原',
     !out.active && !out.isCase && out.camEnabled === true && out.panelHidden
     && out.ctlHidden && !out.stageLeft, JSON.stringify(out));

  console.log('ERRORS:', errs.length ? errs.slice(0, 8) : '无');
  await browser.close();
})();
