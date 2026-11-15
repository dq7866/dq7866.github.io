// 商业发布门禁：启动健康 / 存档健壮性 / WebGL 兜底 / 响应式 / 无障碍 / 合规元信息
//
//   node tools/verify-release.cjs                                     # 源码版 8900（全量）
//   node tools/verify-release.cjs "<file:///.../人体积木.html?auto=1>" single
//   node tools/verify-release.cjs "http://127.0.0.1:8903/human-body/index.html?auto=1" online
//
// full 模式（不传 tag 或 tag=online）会额外跑损坏存档、WebGL 失败与多尺寸探针；
// single/pub 只跑核心门禁，避免 file:// 下 localStorage 差异造成假失败。
const { chromium } = require('playwright');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGE_URL = process.argv[2] || 'http://127.0.0.1:8900/index.html?auto=1';
const TAG = process.argv[3] || 'dev';
const FULL = TAG === 'dev' || TAG === 'online';
const IS_HTTP = /^https?:/.test(PAGE_URL);
const ORIGIN = IS_HTTP ? new URL(PAGE_URL).origin : '';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

function watch(p) {
  const errs = [], warns = [], bad = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message.slice(0, 180)));
  p.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text();
      // 本地以 public/human-body 为根时 /works-guard.js 会 404；线上根有这个文件。
      if (/works-guard\.js/.test(t)) return;
      errs.push('[console] ' + t.slice(0, 180));
    }
    if (m.type() === 'warning') warns.push(m.text().slice(0, 180));
  });
  p.on('requestfailed', r => {
    const u = r.url();
    if (/works-guard\.js/.test(u)) return;
    bad.push(u.slice(-90) + ' :: ' + ((r.failure() || {}).errorText || ''));
  });
  p.on('response', r => {
    if (r.status() >= 400 && !/works-guard\.js/.test(r.url())) bad.push('HTTP ' + r.status() + ' ' + r.url().slice(-90));
  });
  return { errs, warns, bad };
}

async function ready(p, timeout = 180000) {
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records && window.__HB_DEBUG.records.size > 0, null, { timeout });
  await sleep(500);
}

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  console.log(`=== 商业发布门禁 [${TAG}] ${PAGE_URL} ===`);

  /* ---------- 1. 启动健康 ---------- */
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const w = watch(p);
  const t0 = Date.now();
  await p.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await ready(p);
  const bootMs = Date.now() - t0;
  const s = await p.evaluate(() => {
    const D = window.__HB_DEBUG;
    const c = document.getElementById('scene');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    return {
      parts: D.records.size,
      version: D.version,
      booted: D.booted(),
      loader: !!document.getElementById('loader'),
      glLost: gl ? gl.isContextLost() : true,
      metaVersion: (document.querySelector('meta[name="app-version"]') || {}).content,
      ogImage: (document.querySelector('meta[property="og:image"]') || {}).content,
      ogTitle: (document.querySelector('meta[property="og:title"]') || {}).content,
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href,
      viewport: (document.querySelector('meta[name="viewport"]') || {}).content,
      toastLive: (document.getElementById('toast') || {}).getAttribute
        ? document.getElementById('toast').getAttribute('aria-live') : '',
      canvasTab: (c || {}).tabIndex,
      qr: (() => { const q = document.getElementById('tipQr'); return q ? { w: q.naturalWidth, h: q.naturalHeight } : null; })(),
      themes: D.theme.list.length,
      systems: D.profiles.list().length,
    };
  });
  ok('65 个形状全部装配', s.parts === 65, 'parts=' + s.parts);
  ok('启动完成标记与加载遮罩', s.booted === true && s.loader === false, `booted=${s.booted} loader=${s.loader}`);
  ok('WebGL 上下文正常', s.glLost === false, 'lost=' + s.glLost);
  ok('首屏可用耗时 < 8s', bootMs < 8000, bootMs + 'ms');
  ok('零运行时报错', w.errs.length === 0, w.errs.slice(0, 3).join(' | '));
  ok('零资源加载失败', w.bad.length === 0, w.bad.slice(0, 3).join(' | '));

  /* ---------- 2. 发布元信息与合规 ---------- */
  ok('版本号 meta 与运行时一致', /^\d+\.\d+\.\d+$/.test(s.metaVersion || '') && s.version === s.metaVersion,
    `meta=${s.metaVersion} js=${s.version}`);
  ok('OG / canonical 分享元信息齐全', !!s.ogTitle && /og-cover\.png$/.test(s.ogImage || '') && /\/human-body\/$/.test(s.canonical || ''),
    `og=${s.ogImage} canonical=${s.canonical}`);
  ok('viewport 允许自由缩放（WCAG 1.4.4）', !/user-scalable=no|maximum-scale=1/.test(s.viewport || ''), s.viewport);
  ok('toast 可被屏幕阅读器播报', s.toastLive === 'polite', 'aria-live=' + s.toastLive);
  ok('3D 画布可键盘聚焦', s.canvasTab === 0, 'tabindex=' + s.canvasTab);
  ok('收款码图片真实加载', !!s.qr && s.qr.w > 200 && s.qr.h > 200, JSON.stringify(s.qr));
  ok('7 套主题 / 档案系统就绪', s.themes === 7 && s.systems >= 1, `themes=${s.themes} profiles=${s.systems}`);

  if (IS_HTTP && TAG === 'online') {
    const r = await p.request.get(ORIGIN + '/human-body/assets/og-cover.png');
    ok('线上封面 og-cover.png 可访问', r.ok(), 'status=' + r.status());
    const g = await p.request.get(ORIGIN + '/works-guard.js');
    ok('线上访问门 works-guard.js 可访问', g.ok(), 'status=' + g.status());
  }

  /* ---------- 3. 帮助面板：署名 / 版本 / 隐私 / 键盘 ---------- */
  await p.click('#btnHelp'); await sleep(250);
  const help = await p.evaluate(() => {
    const m = document.getElementById('helpModal');
    return {
      show: m.classList.contains('show'),
      text: m.innerText,
      version: (document.getElementById('appVersion') || {}).textContent,
      scrollable: m.querySelector('.modal-card').scrollHeight > m.querySelector('.modal-card').clientHeight,
      maxH: getComputedStyle(m.querySelector('.modal-card')).maxHeight,
    };
  });
  ok('帮助面板可打开且长内容可滚动', help.show && help.maxH !== 'none', `show=${help.show} maxH=${help.maxH}`);
  ok('CC 署名与许可常驻展示', help.text.includes('CC BY-SA 4.0') && help.text.includes('CC BY 4.0')
    && help.text.includes('Écorché') && help.text.includes('TotalSegmentator'));
  ok('关于与版本章节、版本号一致', help.text.includes('关于与版本') && help.version === 'v' + s.metaVersion,
    'version=' + help.version);
  ok('键盘与无障碍说明', help.text.includes('键盘与无障碍') && help.text.includes('方向键'));
  ok('健康科普免责声明', help.text.includes('不替代医生诊断') || help.text.includes('不替代诊疗'));
  ok('支持卡位置文案正确（顶部）', help.text.includes('左侧面板顶部'), '文案仍写底部？');
  await p.keyboard.press('Escape'); await sleep(150);

  /* ---------- 4. 键盘操控与焦点 ---------- */
  await p.focus('#scene'); await sleep(80);
  const focusStyle = await p.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
  ok('画布聚焦有可见焦点环', parseFloat(focusStyle) >= 2, 'outline=' + focusStyle);
  const th0 = await p.evaluate(() => window.__HB_DEBUG.cam._thetaG);
  await p.keyboard.press('ArrowLeft'); await sleep(120);
  const th1 = await p.evaluate(() => window.__HB_DEBUG.cam._thetaG);
  ok('方向键可旋转 3D 视角', Math.abs(th1 - th0) > 0.05, `${th0} -> ${th1}`);
  const dz0 = await p.evaluate(() => window.__HB_DEBUG.cam._distG);
  await p.keyboard.press('+'); await sleep(120);
  const dz1 = await p.evaluate(() => window.__HB_DEBUG.cam._distG);
  ok('+ 键可缩放 3D 视角', Math.abs(dz1 - dz0) > 0.01, `${dz0} -> ${dz1}`);
  await p.click('#btnTheme'); await sleep(120);
  const opened = await p.evaluate(() => !document.getElementById('themePanel').hidden);
  await p.keyboard.press('Escape'); await sleep(150);
  const closed = await p.evaluate(() => document.getElementById('themePanel').hidden);
  ok('Esc 逐层收起面板', opened && closed, `${opened} -> ${closed}`);

  /* ---------- 5. 首次访问引导页 ---------- */
  if (FULL) {
    const p2 = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const clean = PAGE_URL.replace(/[?&]auto=1/, '');
    await p2.goto(clean, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await ready(p2);
    const before = await p2.evaluate(() => !!document.getElementById('startBtn'));
    await p2.click('#startBtn'); await sleep(900);
    const after = await p2.evaluate(() => !!document.getElementById('intro'));
    ok('首次进入引导页可正常关闭', before && !after, `btn=${before} introAfter=${after}`);
    await p2.close();
  }

  /* ---------- 6. 存档健壮性（损坏 / 恶意 / 原型链） ---------- */
  if (FULL) {
    const badSaves = [
      ['非 JSON', 'not-json{{{'],
      ['learned 数字', JSON.stringify({ learned: 123, badges: 5, removed: 'x', built: null })],
      ['learned 字符串', JSON.stringify({ learned: 'abcdef', badges: [], removed: [], built: [] })],
      ['顶层 null', 'null'],
      ['顶层数组', '[1,2,3]'],
      ['system 原型键', JSON.stringify({ system: '__proto__', learned: ['skull'], removed: [], built: [], badges: [] })],
      ['未知形状 id', JSON.stringify({ system: 'body', learned: ['__not_a_part__'], removed: [], built: [], badges: ['__proto__'] })],
    ];
    for (const [label, raw] of badSaves) {
      const q = await b.newPage({ viewport: { width: 1280, height: 800 } });
      const ew = watch(q);
      await q.addInitScript(`(() => { try { localStorage.setItem('${'hb-save-v1::p1'}', ${JSON.stringify(raw)}); } catch (e) {} })()`);
      await q.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
      let alive = false, loader = true;
      try {
        await ready(q, 30000);
        const r = await q.evaluate(() => ({ n: window.__HB_DEBUG.records.size, l: !!document.getElementById('loader'), b: window.__HB_DEBUG.booted() }));
        alive = r.n === 65 && r.b === true;
        loader = r.l;
      } catch (e) { /* 启动失败 */ }
      ok('损坏存档不致白屏：' + label, alive && !loader && ew.errs.length === 0,
        `alive=${alive} loader=${loader} errs=${ew.errs.slice(0, 1).join('')}`);
      await q.close();
    }
    // 恶意档案名不得注入 DOM
    const qx = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await qx.addInitScript(`(() => { try { localStorage.setItem('hb-profiles-v1', JSON.stringify({current:'p1',list:[{id:'p1',name:'<img src=x onerror=window.__XSS=1>',color:'#fff',created:1}]})); } catch(e){} })()`);
    await qx.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await ready(qx);
    await qx.click('#btnProfile'); await sleep(150);
    const xss = await qx.evaluate(() => ({ fired: !!window.__XSS, injected: document.querySelectorAll('#profileList img, #profileList script').length }));
    ok('档案名按纯文本渲染，无 HTML 注入', !xss.fired && xss.injected === 0, JSON.stringify(xss));
    await qx.close();
  }

  /* ---------- 7. WebGL 不可用时的友好兜底 ---------- */
  if (FULL) {
    const q = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await q.addInitScript(`(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t) { if (/webgl/i.test(t)) return null; return o.apply(this, arguments); }; })()`);
    await q.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await sleep(1800);
    const f = await q.evaluate(() => ({
      fail: !!document.querySelector('.loader-fail'),
      text: (document.querySelector('.loader-error') || {}).textContent || '',
      btn: !!document.querySelector('.loader-fail .start-btn'),
      intro: !!document.getElementById('intro'),
      z: getComputedStyle(document.getElementById('loader')).zIndex,
    }));
    ok('WebGL 不可用时给出明确提示与重试入口',
      f.fail && /3D|WebGL/.test(f.text) && f.btn && !f.intro && parseInt(f.z, 10) > 1000,
      JSON.stringify(f));
    await q.screenshot({ path: path.resolve(__dirname, '..', 'review', `release-${TAG}-webgl-fallback.png`) });
    await q.close();
  }

  /* ---------- 8. 响应式：窄屏不溢出、工具条不塌 ---------- */
  if (FULL) {
    for (const [W, H] of [[360, 740], [390, 844], [768, 1024], [1440, 900]]) {
      const q = await b.newPage({ viewport: { width: W, height: H } });
      await q.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await ready(q);
      const r = await q.evaluate(() => {
        const sup = document.querySelector('.support-card').getBoundingClientRect();
        const lp = document.querySelector('.left-panel').getBoundingClientRect();
        return {
          doc: document.documentElement.scrollWidth,
          win: innerWidth,
          supH: Math.round(sup.height), supW: Math.round(sup.width),
          lpH: Math.round(lp.height),
          canvas: !!document.getElementById('scene'),
        };
      });
      const compact = W <= 900;
      ok(`${W}px 无整页横向溢出`, r.doc <= r.win + 2, `doc=${r.doc} win=${r.win}`);
      ok(`${W}px 支持卡/工具条不塌成竖条`, !compact || (r.supH <= 60 && r.lpH <= 76),
        `sup=${r.supW}x${r.supH} panelH=${r.lpH}`);
      await q.close();
    }
  }

  await p.close();
  await b.close();
  console.log(`=== 商业发布门禁 [${TAG}] 回归：${pass} 通过 / ${fail} 失败 ===`);
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
