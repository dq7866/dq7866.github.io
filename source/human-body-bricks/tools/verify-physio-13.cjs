// 验证：13 套生理动画全上线 + 牙齿形状补齐
// 覆盖：chip/帮助面板数量、逐套 flows/extra/讲解步数/调色/时间推进/真实形状动作、
//       暂停冻结、牙齿几何与材质、不再有「模型生成中」禁用项、拆下→装回、零报错
const { chromium } = require('playwright');
const fs = require('fs');

const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const OLD = ['circulation', 'digestion', 'neural', 'breath', 'immune', 'lymphatic', 'endocrine', 'motion'];
const NEW = ['urinary', 'swallow', 'exertion', 'repair', 'senses'];
const ALL = [...OLD, ...NEW];
// 每套动画驱动的真实解剖形状，用来确认「动的是形状」而不只是粒子
const TARGET = {
  circulation: 'heart', digestion: 'stomach', neural: 'brain', breath: 'lungs',
  immune: 'spleen', lymphatic: 'spleen', endocrine: 'heart', motion: 'femur',
  urinary: 'bladder', swallow: 'stomach', exertion: 'femur', repair: 'radius', senses: 'brain',
};
const LOOK_ACCENT = {
  urinary: 0xffd777, swallow: 0xffb27a, exertion: 0xff8a5c,
  repair: 0x9ce8b4, senses: 0xa9d8ff,
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('404') && !t.includes('favicon')) errs.push('[console] ' + t);
  });

  await page.goto('http://127.0.0.1:8900/index.html?auto=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0,
    null, { timeout: 90000 });
  await sleep(900);
  const S = (fn, arg) => page.evaluate(fn, arg);
  if (!fs.existsSync('review')) fs.mkdirSync('review');

  /* ============ 一、UI 数量与文案 ============ */
  // chip 在展开动画条时才由 physioChips() 渲染，先点顶栏脉冲按钮
  await page.click('#btnPhysio');
  await sleep(450);
  const chips = await S(() => [...document.querySelectorAll('.pb-chip[data-physio]')].map(e => e.dataset.physio));
  ok('13 套动画 chip 全部渲染', chips.length === 13, `count=${chips.length}`);
  ok('5 套新增动画都在列', NEW.every(id => chips.includes(id)), NEW.filter(id => !chips.includes(id)).join(',') || '全部就位');
  const help = await S(() => ({
    title: document.querySelector('.help-more b')?.textContent || '',
    badges: document.querySelectorAll('#physioMore span').length,
    section: [...document.querySelectorAll('.help-grid b')].map(e => e.textContent).join('|'),
  }));
  ok('帮助面板改为「全部上线」并列 13 个徽章',
    !help.title.includes('还能继续') && help.title.includes('13') && help.badges === 13,
    JSON.stringify(help));
  ok('帮助正文写明 13 套', help.section.includes('13 套'), help.section.slice(0, 80));

  /* ============ 二、逐套打开：结构 / 讲解 / 调色 / 时间 / 真实形状 ============ */
  const sig = id => S(x => {
    const r = window.__HB_DEBUG.records.get(x);
    if (!r) return null;
    const g = r.group;
    return [g.position.x, g.position.y, g.position.z, g.rotation.x, g.rotation.y, g.rotation.z, g.scale.x]
      .map(v => +v.toFixed(4));
  }, id);

  for (const id of ALL) {
    await S(x => window.__HB_DEBUG.openPhysio(x), id);
    await sleep(760);
    const a = await sig(TARGET[id]);
    const t1 = await S(() => window.__HB_DEBUG.getPhysio().state.t);
    await sleep(620);
    const b = await sig(TARGET[id]);
    const t2 = await S(() => window.__HB_DEBUG.getPhysio().state.t);
    const probe = await S(() => {
      const d = window.__HB_DEBUG;
      const ph = d.getPhysio();
      const mode = ph.getModeId();
      const rec = ph.built.get(mode);
      const look = d.cinema.look();
      return {
        mode,
        flows: rec ? rec.flows.length : 0,
        extra: rec ? rec.extra.length : 0,
        visible: rec ? rec.group.visible : false,
        steps: document.querySelectorAll('.pp-steps li').length,
        activeStep: document.querySelectorAll('.pp-steps li.active').length,
        intro: (document.querySelector('.pp-intro')?.textContent || '').length,
        tip: (document.querySelector('.pp-tip p')?.textContent || '').length,
        accent: look.accent,
        phase: ph.state.phase,
      };
    });
    const moved = a && b && a.some((v, i) => Math.abs(v - b[i]) > 1e-3);
    const tag = NEW.includes(id) ? '新增' : '原有';
    ok(`[${tag}] ${id} 动画结构完整`,
      probe.mode === id && probe.flows > 0 && probe.visible && probe.steps >= 4 && probe.intro > 30 && probe.tip > 20,
      JSON.stringify({ mode: probe.mode, flows: probe.flows, extra: probe.extra, steps: probe.steps }));
    ok(`[${tag}] ${id} 时间轴推进且有高亮讲解幕`,
      t2 > t1 + 0.3 && probe.activeStep === 1,
      `t1=${t1.toFixed(2)} t2=${t2.toFixed(2)} active=${probe.activeStep}`);
    ok(`[${tag}] ${id} 真实解剖形状随动画改变`, moved, `target=${TARGET[id]} ${JSON.stringify(a)}→${JSON.stringify(b)}`);
    if (LOOK_ACCENT[id] !== undefined) {
      ok(`[新增] ${id} 电影调色已生效`, probe.accent === LOOK_ACCENT[id],
        `accent=0x${probe.accent.toString(16)} 期望=0x${LOOK_ACCENT[id].toString(16)}`);
    }
    await page.screenshot({ path: `review/physio13-${id}.png` });
  }

  /* ============ 三、暂停 / 继续 / 速度 ============ */
  await S(() => document.getElementById('physioPlay')?.click());
  const p1 = await S(() => window.__HB_DEBUG.getPhysio().state.t);
  await sleep(520);
  const p2 = await S(() => window.__HB_DEBUG.getPhysio().state.t);
  ok('暂停后动画时间冻结', Math.abs(p2 - p1) < 0.02, `p1=${p1.toFixed(3)} p2=${p2.toFixed(3)}`);
  await S(() => document.getElementById('physioPlay')?.click());
  await sleep(420);
  const p3 = await S(() => window.__HB_DEBUG.getPhysio().state.t);
  ok('继续后时间恢复推进', p3 > p2 + 0.2, `p3=${p3.toFixed(3)}`);
  await S(() => window.__HB_DEBUG.closePhysio());
  await sleep(400);

  /* ============ 四、牙齿补齐：几何 / 材质 / 拆装 ============ */
  await S(() => window.__HB_DEBUG.setSystem('daily'));
  await sleep(700);
  const teeth = await S(() => {
    const d = window.__HB_DEBUG;
    const r = d.records.get('teeth');
    const box = new d.T.Box3().setFromObject(r.group);
    const size = box.getSize(new d.T.Vector3());
    // setFromObject 得到的是世界尺寸，除以人体缩放换回米制再比对
    const s = d.bodyMeta.scale || 1;
    return {
      children: r.group.children.length,
      mats: r.mats.length,
      ghost: r.ghost.children.length,
      size: [size.x, size.y, size.z].map(v => +(v / s).toFixed(4)),
      pending: r.group.children.length === 0,
    };
  });
  ok('牙齿已有真实几何（上下颌 32 颗 = 64 网格）', teeth.children === 64 && !teeth.pending,
    JSON.stringify(teeth));
  ok('牙齿材质已注册到高亮/淡出系统', teeth.mats >= 2, `mats=${teeth.mats}`);
  ok('牙齿幽灵空位也已生成', teeth.ghost === 64, `ghost=${teeth.ghost}`);
  ok('牙列尺寸与头部比例合理', teeth.size[0] > 0.05 && teeth.size[0] < 0.14 && teeth.size[1] > 0.01,
    `size=${JSON.stringify(teeth.size)}`);

  // 程序化造型必须自己挂 partId，否则拾取时会沿父链找不到形状而被跳过
  const pick = await S(() => {
    const d = window.__HB_DEBUG;
    const r = d.records.get('teeth');
    const mesh = r.group.children.find(o => o.isMesh);
    const v = new d.T.Vector3();
    mesh.getWorldPosition(v);
    const p = v.clone().project(d.camera);
    const x = (p.x + 1) / 2 * window.innerWidth;
    const y = (-p.y + 1) / 2 * window.innerHeight;
    const ray = new d.T.Raycaster();
    ray.setFromCamera({ x: p.x, y: p.y }, d.camera);
    // 嘴部重叠了嘴唇/脸颊/头发贴片，单点可能被遮挡；扫一圈看牙齿有没有可点区域
    let teethHits = 0;
    for (let dy = -18; dy <= 18; dy += 3) {
      for (let dx = -18; dx <= 18; dx += 3) {
        if (d.pickAt(x + dx, y + dy) === 'teeth') teethHits++;
      }
    }
    return {
      partId: r.group.userData.partId, meshId: mesh.userData.partId,
      directHits: ray.intersectObjects([mesh], false).length,
      teethHits, picked: d.pickAt(x, y), x: Math.round(x), y: Math.round(y),
    };
  });
  ok('牙齿已挂 partId，网格可被射线命中',
    pick.partId === 'teeth' && pick.meshId === 'teeth' && pick.directHits > 0,
    `partId=${pick.partId} meshId=${pick.meshId} directHits=${pick.directHits}`);
  ok('嘴部有可点击到牙齿的区域', pick.teethHits >= 8,
    `teethHits=${pick.teethHits}/169 center=${pick.picked} at (${pick.x},${pick.y})`);

  await S(() => window.__HB_DEBUG.detachToTray('teeth'));
  await sleep(720);
  const tray = await S(() => {
    const c = document.querySelector('[data-chip="teeth"]');
    return {
      exists: !!c, disabled: c ? c.disabled : null,
      text: c ? c.textContent.replace(/\s+/g, ' ').trim() : '',
      removed: window.__HB_DEBUG.state.removed.has('teeth'),
    };
  });
  ok('牙齿能拆进零件盘，且不再显示「模型生成中」',
    tray.exists && !tray.disabled && tray.removed && !tray.text.includes('模型生成中'),
    JSON.stringify(tray));
  await page.screenshot({ path: 'review/teeth-tray.png' });

  await S(() => window.__HB_DEBUG.install('teeth'));
  await sleep(850);
  const back = await S(() => {
    const d = window.__HB_DEBUG;
    const r = d.records.get('teeth');
    return { removed: d.state.removed.has('teeth'), visible: r.group.visible, busy: !!r.busy,
             opacity: r.mats[0] ? +r.mats[0].opacity.toFixed(2) : null };
  });
  ok('牙齿能装回且材质透明度已还原', !back.removed && back.visible && !back.busy && back.opacity === 1,
    JSON.stringify(back));
  await page.screenshot({ path: 'review/teeth-head.png' });

  /* ============ 五、零报错 ============ */
  ok('全程零控制台/运行时报错', errs.length === 0, errs.slice(0, 4).join(' | '));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
