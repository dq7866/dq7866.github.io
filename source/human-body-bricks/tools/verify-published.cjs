// 发布产物冒烟测试：门禁放行 + daily 标签 + 18 部位 + 13 套动画
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    // 本地 8902 以 public/human-body/ 为根，根路径的 /works-guard.js 与 favicon
    // 会 404；正式站点 public/ 根下由 post-build-works-guard 生成，属预期差异。
    const url = (m.location() && m.location().url) || '';
    if (/works-guard\.js|favicon\.ico/.test(url)) return;
    errs.push('[console] ' + m.text());
  });
  await p.goto('http://127.0.0.1:8902/index.html?auto=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout: 45000 });
  await sleep(1000);
  const out = await p.evaluate(async () => {
    const d = window.__HB_DEBUG;
    const dailyIds = ['head','hair','eyes','nose','mouth','lips','teeth','cheeks','ears','neck','chest','abdomen','arms','hands','fingers','legs','feet','toes'];
    d.setSystem('daily');
    await new Promise(r => setTimeout(r, 600));
    let vis = 0;
    dailyIds.forEach(id => { const r = d.records.get(id); if (r && r.group.visible) vis++; });
    // 13 套动画真实形状运动
    const ph = d.getPhysio();
    const targetOf = { neural:'brain', immune:'spleen', lymphatic:'spleen', circulation:'heart',
      digestion:'stomach', breath:'lungs', motion:'femur', endocrine:'heart',
      urinary:'bladder', swallow:'stomach', exertion:'femur', repair:'radius', senses:'brain' };
    const motion = {};
    for (const m of Object.keys(targetOf)) {
      d.setSystem('body'); await new Promise(r => setTimeout(r, 150));
      ph.setMode(m); await new Promise(r => setTimeout(r, 800));
      const g = d.records.get(targetOf[m])?.group;
      const a = g ? g.scale.x + '|' + g.rotation.x.toFixed(4) : null;
      await new Promise(r => setTimeout(r, 600));
      const c = g ? g.scale.x + '|' + g.rotation.x.toFixed(4) : null;
      motion[m] = !!(a && c && a !== c);
      ph.setMode(null); await new Promise(r => setTimeout(r, 80));
    }
    d.setSystem('daily');
    return {
      sysTabs: document.querySelectorAll('.sys-card').length,
      dailyVisible: vis,
      records: d.records.size,
      motionMoved: Object.values(motion).filter(Boolean).length,
      motion,
    };
  });
  await p.screenshot({ path: 'review/published-daily.png' });
  console.log(JSON.stringify(out, null, 2));
  console.log('ERRORS:', errs.length ? errs.slice(0, 8).join(' | ') : '无');
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
