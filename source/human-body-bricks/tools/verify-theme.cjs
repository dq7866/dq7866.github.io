// 主题外观回归：7 套配色（5 深色 + 2 明亮）× 界面 CSS 变量 / 场景氛围 / 影棚灯光 / 明暗可读性 / 持久化 / 面板交互
//
// 用法：
//   node tools/verify-theme.cjs                                    # 源码版（8900）
//   node tools/verify-theme.cjs "file:///.../人体积木.html?auto=1" single
//   node tools/verify-theme.cjs "http://127.0.0.1:8902/index.html?auto=1" pub
//
// 依赖 window.__HB_DEBUG.theme（get/set/list/hooks），由 app.js 暴露。
const { chromium } = require('playwright');
const path = require('path');

const URL = process.argv[2] || 'http://127.0.0.1:8900/index.html?auto=1';
const TAG = process.argv[3] || 'dev';
const REVIEW = path.resolve(__dirname, '..', 'review');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};
// THREE.Color 经 sRGB→linear→sRGB 往返，逐通道允许 2/255 的取整误差
const hx = n => ('000000' + n.toString(16)).slice(-6);
const near = (a, b) => {
  if (!a || !b) return false;
  const x = parseInt(a, 16), y = parseInt(b, 16);
  return [16, 8, 0].every(sh => Math.abs(((x >> sh) & 255) - ((y >> sh) & 255)) <= 2);
};
// WCAG 相对亮度与对比度：浅色主题必须保证正文/次要文字在纸面底色上可读
const lum = h => {
  const n = parseInt(h.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|works-guard\.js|404/.test(t)) return;   // 本地起服务时根路径资源缺失属预期
    errs.push('[console] ' + t);
  });

  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records &&
    window.__HB_DEBUG.records.size > 0, null, { timeout: 120000 });
  await sleep(900);

  const snap = () => p.evaluate(() => {
    const d = window.__HB_DEBUG, T = d.theme, H = T.hooks;
    const cur = T.list.find(t => t.id === T.get()) || T.list[0];
    const cs = getComputedStyle(document.documentElement);
    const grid = d.scene.children.find(o => o.type === 'GridHelper');
    const hx = n => ('000000' + n.toString(16)).slice(-6);
    const rgb = h => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; };
    return {
      id: T.get(),
      dataset: document.documentElement.dataset.theme || '',
      scheme: document.documentElement.dataset.scheme || '',
      cssBg: cs.getPropertyValue('--bg').trim(),
      cssText: cs.getPropertyValue('--text').trim(),
      cssMuted: cs.getPropertyValue('--muted').trim(),
      cssPanelSolid: cs.getPropertyValue('--panel-solid').trim(),
      inkRgb: cs.getPropertyValue('--ink-rgb').trim(),
      surfaceRgb: cs.getPropertyValue('--surface-rgb').trim(),
      primaryColor: (() => {
        const probe = document.createElement('button');
        probe.className = 'btn primary'; probe.textContent = '.';
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      })(),
      sysCardBg: (() => { const e = document.querySelector('.sys-card'); return e ? getComputedStyle(e).backgroundColor : ''; })(),
      cssTeal: cs.getPropertyValue('--teal').trim(),
      cssPanel: cs.getPropertyValue('--panel-solid').trim(),
      topbar1: cs.getPropertyValue('--topbar-1').trim(),
      accentRgb: cs.getPropertyValue('--accent-rgb').trim(),
      roseRgb: cs.getPropertyValue('--rose-rgb').trim(),
      btn2: cs.getPropertyValue('--btn-2').trim(),
      meta: (document.querySelector('meta[name="theme-color"]') || {}).content || '',
      stored: localStorage.getItem('hb-theme-v1'),
      panelHidden: document.getElementById('themePanel').hidden,
      pressed: document.getElementById('btnTheme').getAttribute('aria-pressed'),
      items: document.querySelectorAll('#themeList .theme-item').length,
      swatches: document.querySelectorAll('#themeList .theme-item .ti-sw i').length,
      sceneBg: H.scene.background.getHexString(),
      fog: H.scene.fog.color.getHexString(),
      fogDensity: H.scene.fog.density,
      ground: H.ground.material.color.getHexString(),
      dust: H.dust.material.color.getHexString(),
      halo0: H.halos[0].mesh.material.color.getHexString(),
      haloOpacity: H.halos[0].mesh.material.opacity,
      key: H.lights.key.color.getHexString(),
      hemi: H.lights.hemi.color.getHexString(),
      rim: H.lights.rim.color.getHexString(),
      gridOpacity: grid ? grid.material.opacity : null,
      exp: {
        id: cur.id, scheme: cur.scheme || 'dark', cssBg: cur.css.bg, cssText: cur.css.text,
        cssMuted: cur.css.muted, cssTeal: cur.css.teal, cssPanel: cur.css.panelSolid,
        topbar1: cur.css.topbar1, btn2: cur.css.btn2,
        accentRgb: rgb(cur.css.teal), roseRgb: rgb(cur.css.rose),
        meta: cur.meta, sceneBg: hx(cur.scene.bg), fog: hx(cur.scene.fog),
        fogDensity: cur.scene.fogDensity, ground: hx(cur.scene.ground), dust: hx(cur.scene.dust),
        halo0: hx(cur.scene.halo[0]), haloOpacity: cur.scene.haloOpacity,
        key: hx(cur.scene.key), hemi: hx(cur.scene.hemiSky), rim: hx(cur.scene.rim),
        gridOpacity: cur.scene.gridOpacity,
      },
    };
  });

  // 1) 默认 deep 必须等同于改造前的原始观感
  const a0 = await snap();
  ok('模型装配完成（65 个形状 / 主题接口暴露）', await p.evaluate(() => window.__HB_DEBUG.records.size === 65 && !!window.__HB_DEBUG.theme.list.length),
    `records=${await p.evaluate(() => window.__HB_DEBUG.records.size)}`);
  ok('默认主题为 deep，面板初始收起', a0.id === 'deep' && a0.dataset === 'deep' && a0.scheme === 'dark' &&
    a0.panelHidden === true && a0.pressed === 'false',
    `id=${a0.id} scheme=${a0.scheme} pressed=${a0.pressed}`);
  ok('deep 界面变量 = 原始深空蓝', a0.cssBg === '#090e1a' && a0.cssTeal === '#6fd9e8' && a0.meta === '#090e1a',
    `bg=${a0.cssBg} teal=${a0.cssTeal} meta=${a0.meta}`);
  ok('deep 顶栏/主按钮 = 改造前原色', a0.topbar1 === 'rgba(18, 28, 46, 0.9)' &&
    a0.accentRgb === '111, 217, 232' && a0.btn2 === 'rgba(103, 170, 220, 0.85)',
    `topbar=${a0.topbar1} accent=${a0.accentRgb}`);
  ok('deep 场景氛围 = 原始打光', near(a0.sceneBg, '090e1a') && near(a0.ground, '0e1626') &&
    near(a0.key, 'fff0dc') && Math.abs(a0.fogDensity - 0.022) < 1e-6 && Math.abs(a0.gridOpacity - 0.55) < 1e-6,
    `bg=${a0.sceneBg} key=${a0.key} fog=${a0.fogDensity} grid=${a0.gridOpacity}`);

  // 2) 面板：入口、5 套选项、色卡、aria-pressed
  await p.click('#btnTheme');
  await sleep(250);
  const a1 = await snap();
  ok('顶栏按钮打开主题面板 + aria-pressed', a1.panelHidden === false && a1.pressed === 'true');
  ok('7 套主题齐全且各带 3 色卡', a1.items === 7 && a1.swatches === 21, `items=${a1.items} swatches=${a1.swatches}`);
  const names = await p.$$eval('#themeList .theme-item b', els => els.map(e => e.textContent));
  ok('主题名称完整（5 深色 + 2 明亮）',
    names.join('/') === '深空蓝/墨黑银/翡翠青/暗夜紫/暖夜橙/晴空白/暖纸白', names.join('/'));
  const groups = await p.$$eval('#themeList .theme-group', els => els.map(e => e.textContent));
  ok('深色 / 明亮两组分组标题', groups.length === 2 && /深色/.test(groups[0]) && /明亮/.test(groups[1]),
    groups.join('|'));
  await p.screenshot({ path: path.join(REVIEW, `theme-${TAG}-panel.png`) });

  // 3) 逐套切换：界面 / 场景 / 灯光 / 网格 / 光环 / meta / 持久化
  const ids = ['noir', 'aurora', 'plum', 'ember', 'daylight', 'paper', 'deep'];
  for (const id of ids) {
    await p.click('#btnTheme');
    await sleep(120);
    if (await p.$eval('#themePanel', e => e.hidden)) { await p.click('#btnTheme'); await sleep(120); }
    await p.click(`#themeList button[data-theme="${id}"]`);
    await sleep(300);
    const a = await snap();
    const e = a.exp;
    const light = e.scheme === 'light';
    const checks = {
      'id/数据集': a.id === id && a.dataset === id,
      '明暗 scheme': a.scheme === e.scheme &&
        (light ? a.inkRgb !== '255, 255, 255' && a.surfaceRgb !== '' && a.cssText === e.cssText
               : a.inkRgb === '255, 255, 255'),
      '浅色文字对比度/主按钮': !light || (
        contrast(a.cssText, a.cssPanelSolid) >= 4.5 &&
        contrast(a.cssMuted, a.cssPanelSolid) >= 3 &&
        a.primaryColor === 'rgb(255, 255, 255)' &&
        a.sysCardBg !== 'rgba(255, 255, 255, 0.025)'
      ),
      'CSS 变量': a.cssBg === e.cssBg && a.cssTeal === e.cssTeal && a.cssPanel === e.cssPanel,
      '顶栏/按钮大色块': a.topbar1 === e.topbar1 && a.btn2 === e.btn2 &&
        a.accentRgb === e.accentRgb && a.roseRgb === e.roseRgb,
      'meta theme-color': a.meta === e.meta,
      '场景背景/雾': near(a.sceneBg, e.sceneBg) && near(a.fog, e.fog) && Math.abs(a.fogDensity - e.fogDensity) < 1e-6,
      '地面/微尘/光环': near(a.ground, e.ground) && near(a.dust, e.dust) && near(a.halo0, e.halo0),
      '影棚灯光': near(a.key, e.key) && near(a.hemi, e.hemi) && near(a.rim, e.rim),
      '网格/光环亮度': Math.abs(a.gridOpacity - e.gridOpacity) < 1e-6 && Math.abs(a.haloOpacity - e.haloOpacity) < 1e-6,
      '记忆到 localStorage': a.stored === id,
      '选完自动收起面板': a.panelHidden === true && a.pressed === 'false',
    };
    for (const [k, v] of Object.entries(checks)) {
      ok(`${id} · ${k}`, v, v ? '' : JSON.stringify({ got: { bg: a.cssBg, scene: a.sceneBg, key: a.key, stored: a.stored }, exp: { bg: e.cssBg, scene: e.sceneBg, key: e.key } }));
    }
    await p.screenshot({ path: path.join(REVIEW, `theme-${TAG}-${id}.png`) });
  }

  // 4) 面板关闭的三种方式
  await p.click('#btnTheme'); await sleep(120);
  await p.click('#themeClose'); await sleep(120);
  ok('✕ 关闭面板', await p.$eval('#themePanel', e => e.hidden));
  await p.click('#btnTheme'); await sleep(120);
  await p.keyboard.press('Escape'); await sleep(120);
  ok('Esc 关闭面板', await p.$eval('#themePanel', e => e.hidden));
  await p.click('#btnTheme'); await sleep(120);
  await p.mouse.click(700, 700); await sleep(150);
  ok('点击面板外部关闭', await p.$eval('#themePanel', e => e.hidden));

  // 5) 刷新后仍然记住主题；恢复 deep 后观感完全还原
  await p.click('#btnTheme'); await sleep(120);
  await p.click('#themeList button[data-theme="plum"]'); await sleep(250);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records.size > 0, null, { timeout: 120000 });
  await sleep(600);
  const ar = await snap();
  ok('刷新后主题持久化（plum）', ar.id === 'plum' && ar.dataset === 'plum' && ar.cssBg === '#120a1e' && near(ar.sceneBg, '120a1e'),
    `id=${ar.id} bg=${ar.cssBg} scene=${ar.sceneBg}`);

  await p.click('#btnTheme'); await sleep(120);
  await p.click('#themeList button[data-theme="deep"]'); await sleep(250);
  const ad = await snap();
  ok('切回 deep 完整还原默认观感', ad.id === 'deep' && ad.cssBg === a0.cssBg &&
    near(ad.sceneBg, a0.sceneBg) && near(ad.key, a0.key) && near(ad.ground, a0.ground) &&
    Math.abs(ad.fogDensity - a0.fogDensity) < 1e-6 && Math.abs(ad.haloOpacity - a0.haloOpacity) < 1e-6);

  ok('零运行时报错', errs.length === 0, errs.slice(0, 4).join(' | '));
  console.log(`\n=== ${TAG} 主题回归：${pass} PASS / ${fail} FAIL ===`);
  await b.close();
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
