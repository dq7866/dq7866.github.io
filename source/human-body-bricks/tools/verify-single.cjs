// 冒烟：双击即玩的单文件版 人体积木.html（模型 base64 内嵌，无服务器）
// 检查 13 套动画、牙齿补齐、逐套可打开与零运行时报错
const { chromium } = require('playwright');
const path = require('path');

const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const file = 'file:///' + path.resolve(__dirname, '..', '人体积木.html').replace(/\\/g, '/');
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('favicon') && !t.includes('404')) errs.push('[console] ' + t);
  });

  await p.goto(file + '?auto=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0,
    null, { timeout: 120000 });
  await sleep(1000);

  const base = await p.evaluate(() => ({
    records: window.__HB_DEBUG.records.size,
    teethChildren: window.__HB_DEBUG.records.get('teeth').group.children.length,
    teethPartId: window.__HB_DEBUG.records.get('teeth').group.userData.partId,
    helpBadges: document.querySelectorAll('#physioMore span').length,
    helpTitle: document.querySelector('.help-more b')?.textContent || '',
  }));
  ok('单文件版模型装配完成（65 个形状）', base.records === 65, `records=${base.records}`);
  ok('单文件版牙齿已补齐且可拾取', base.teethChildren === 64 && base.teethPartId === 'teeth',
    `children=${base.teethChildren} partId=${base.teethPartId}`);
  ok('单文件版帮助面板 13 套全上线', base.helpBadges === 13 && base.helpTitle.includes('13'),
    `badges=${base.helpBadges} title=${base.helpTitle}`);

  await p.click('#btnPhysio');
  await sleep(400);
  const chips = await p.$$eval('.pb-chip[data-physio]', els => els.map(e => e.dataset.physio));
  ok('单文件版 13 套动画按钮齐全', chips.length === 13, `count=${chips.length}`);

  // 抽查新增 5 套在单文件里也能真正跑起来
  for (const id of ['urinary', 'swallow', 'exertion', 'repair', 'senses']) {
    const r = await p.evaluate(async m => {
      const d = window.__HB_DEBUG;
      d.openPhysio(m);
      await new Promise(r => setTimeout(r, 700));
      const ph = d.getPhysio();
      const rec = ph.built.get(m);
      return { mode: ph.getModeId(), flows: rec ? rec.flows.length : 0,
               steps: document.querySelectorAll('.pp-steps li').length, extra: rec ? rec.extra.length : 0 };
    }, id);
    ok(`单文件版 ${id} 正常运行`, r.mode === id && r.flows > 0 && r.steps >= 4,
      JSON.stringify(r));
  }

  ok('单文件版零运行时报错', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
