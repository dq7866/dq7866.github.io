/* 地球拼图 · 自然地理版 v2.5 商业发布门禁
 *
 *   node tools/verify-release.cjs                                    # 源码版 http://127.0.0.1:8910/
 *   node tools/verify-release.cjs "<file:///.../发布/地球仪拼图-v2.5.0.html>" single
 *   node tools/verify-release.cjs "https://<域名>/<路径>/" online
 *
 * dev / online 跑全量；single 只跑核心门禁（file:// 下 localStorage 行为有差异）。
 * 输出截图到 截图/ 目录。
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ARG = process.argv[2];
const SINGLE_PATH = path.resolve(__dirname, '..', '..', '发布', '地球仪拼图-v2.5.0.html');
const PAGE_URL = ARG === 'single' ? pathToFileURL(SINGLE_PATH).href
  : (ARG || 'http://127.0.0.1:8910/index.html');
const TAG = process.argv[3] || (ARG === 'single' ? 'single' : 'dev');
const FULL = TAG !== 'single';
const SHOT_DIR = path.resolve(__dirname, '..', '..', '截图');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

function watch(p) {
  const errs = [], bad = [], external = [];
  p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message.slice(0, 180)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 180)); });
  p.on('requestfailed', (r) => bad.push(r.url().slice(-100) + ' :: ' + ((r.failure() || {}).errorText || '')));
  p.on('response', (r) => { if (r.status() >= 400) bad.push('HTTP ' + r.status() + ' ' + r.url().slice(-100)); });
  p.on('request', (r) => {
    const u = r.url();
    if (/^https?:/.test(u) && !u.startsWith(new URL(PAGE_URL).origin || 'http://127.0.0.1:8910')) external.push(u.slice(0, 120));
  });
  return { errs, bad, external };
}
async function ready(p, timeout = 90000) {
  await p.waitForFunction(() => window.__GP_READY === true, null, { timeout });
  await sleep(600);
}
function shot(p, name) { return p.screenshot({ path: path.join(SHOT_DIR, name) }); }

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  console.log('=== 商业发布门禁 [' + TAG + '] ' + PAGE_URL + ' ===');

  /* ---------------- 1. 启动健康 ---------------- */
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const w = watch(p);
  const t0 = Date.now();
  await p.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await ready(p);
  const bootMs = Date.now() - t0;

  const s = await p.evaluate(() => {
    const D = window.__GP_DEBUG || {};
    const c = document.getElementById('gp-canvas');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    const cs = (el, prop) => el ? getComputedStyle(el)[prop] : '';
    return {
      ready: window.__GP_READY === true,
      addons: window.__GP_ADDONS_READY === true,
      version: window.GlobePuzzle && window.GlobePuzzle.version,
      theme: window.GlobePuzzle && window.GlobePuzzle.theme,
      webgl: window.__GP_WEBGL_OK,
      glLost: gl ? gl.isContextLost() : true,
      fatal: window.__GP_FATAL,
      errors: (window.__GP_ERRORS || []).slice(),
      bootFail: !!document.getElementById('gp-boot-fail'),
      profiles: window.GPProfiles && window.GPProfiles.state(),
      saveKey: window.GPProfiles && window.GPProfiles.saveKey('gp-achievements-v1'),
      metaVersion: (document.querySelector('meta[name="app-version"]') || {}).content,
      canonical: (document.querySelector('link[rel=canonical]') || {}).href,
      ogTitle: (document.querySelector('meta[property="og:title"]') || {}).content,
      ogImage: (document.querySelector('meta[property="og:image"]') || {}).content,
      twitter: (document.querySelector('meta[name="twitter:card"]') || {}).content,
      toastLive: document.getElementById('gp-toast') && document.getElementById('gp-toast').getAttribute('aria-live'),
      canvasTabindex: document.getElementById('gp-canvas') && document.getElementById('gp-canvas').getAttribute('tabindex'),
      modalRole: document.getElementById('gp-profile') && document.getElementById('gp-profile').getAttribute('role'),
      modalAria: document.getElementById('gp-profile') && document.getElementById('gp-profile').getAttribute('aria-modal'),
      compliance: (document.getElementById('gp-compliance') || {}).textContent,
      badge: (document.getElementById('gp-badge') || {}).textContent,
      qrW: (document.getElementById('gp-tip-qr') || {}).naturalWidth,
      supportVisible: !!document.getElementById('gp-support-btn') && cs(document.querySelector('.gp-support-card'), 'display') !== 'none',
      provinceGone: !document.getElementById('gp-scope-province') && !document.getElementById('gp-scope-city'),
      single: document.documentElement.getAttribute('data-single')
    };
  });

  ok('启动就绪 __GP_READY', s.ready);
  ok('增强层就绪 __GP_ADDONS_READY', s.addons);
  ok('版本号 2.5.0-nature', s.version === '2.5.0-nature', s.version);
  ok('meta app-version = 2.5.0', s.metaVersion === '2.5.0', s.metaVersion);
  ok('WebGL 上下文可用且未丢失', s.webgl === true && s.glLost === false, 'webgl=' + s.webgl + ' lost=' + s.glLost);
  ok('无致命兜底卡 / 无启动异常', !s.bootFail && !s.fatal && s.errors.length === 0, JSON.stringify(s.errors));
  ok('首屏 < 12s（本地/软件渲染阈值）', bootMs < 12000, bootMs + 'ms');
  ok('页面零 JS 报错', w.errs.length === 0, JSON.stringify(w.errs));
  ok('零失败请求 / 零 4xx-5xx', w.bad.length === 0, JSON.stringify(w.bad));
  ok('零外部网络请求（离线合规）', w.external.length === 0, JSON.stringify(w.external));
  ok('SEO：canonical 已设置', !!s.canonical, s.canonical);
  ok('SEO：OG 标题 / 封面 / Twitter 卡齐全', !!s.ogTitle && /og-cover\.png/.test(s.ogImage || '') && s.twitter === 'summary_large_image');
  ok('a11y：toast aria-live', s.toastLive === 'polite', s.toastLive);
  ok('a11y：画布可聚焦 tabindex', s.canvasTabindex === '0', s.canvasTabindex);
  ok('a11y：弹窗 role/aria-modal', s.modalRole === 'dialog' && s.modalAria === 'true');
  ok('合规：页脚常驻「无国界 / 非标准地图」', /无国界/.test(s.compliance || '') && /非标准地图/.test(s.compliance || ''), s.compliance);
  ok('合规：徽标「自然地理」', /自然地理/.test(s.badge || ''), s.badge);
  ok('合规：移除遗留的省/市选择控件', s.provinceGone);
  ok('赞赏：二维码图片已加载', s.qrW > 900, 'w=' + s.qrW);
  ok('档案：默认档案「我」+ 命名空间键', s.profiles && s.profiles.profiles.length === 1 && /::p1$/.test(s.saveKey || ''), JSON.stringify(s.profiles));
  ok('支持卡首屏可见', s.supportVisible);
  if (TAG === 'single') ok('单文件标记 data-single', s.single === '1', s.single);

  await shot(p, 'v2.5-release-1440-deep.png');

  /* ---------------- 2. 主题（含浅色）与浅色弹窗可读 ---------------- */
  if (FULL) {
    await p.click('#gp-theme button[data-theme="daylight"]');
    await sleep(500);
    const light = await p.evaluate(() => {
      const card = document.querySelector('#gp-about .gp-modal-card');
      const b = document.querySelector('#gp-about .gp-modal-card b');
      const btn = document.getElementById('gp-tip-save');
      return {
        theme: window.GlobePuzzle.theme,
        themeKey: window.GPProfiles.saveKey('gp-theme'),
        themeStored: localStorage.getItem(window.GPProfiles.saveKey('gp-theme')),
        cardBg: getComputedStyle(card).backgroundColor,
        boldColor: b ? getComputedStyle(b).color : '',
        saveColor: btn ? getComputedStyle(btn).color : '',
        saveBg: btn ? getComputedStyle(btn).backgroundImage : ''
      };
    });
    ok('主题切到 daylight', light.theme === 'daylight');
    ok('主题按档案命名空间持久化', light.themeStored === 'daylight', light.themeStored);
    ok('浅色弹窗为白底', /255,\s*255,\s*255/.test(light.cardBg), light.cardBg);
    ok('浅色弹窗加粗文字为深色', /rgb\(2[0-9], 4[0-9], 5[0-9]\)|rgb\(29, 43, 58\)/.test(light.boldColor), light.boldColor);
    ok('浅色下「保存二维码」按钮有深色渐变且白字', /gradient/.test(light.saveBg) && /255,\s*255,\s*255/.test(light.saveColor), light.saveColor + ' / ' + light.saveBg.slice(0, 40));
    await p.click('#gp-about-btn');
    await sleep(250);
    await shot(p, 'v2.5-release-about-daylight.png');
    await p.keyboard.press('Escape');
    await sleep(150);
    ok('Esc 关闭「关于」弹窗', await p.evaluate(() => !document.getElementById('gp-about').classList.contains('show')));
    await shot(p, 'v2.5-release-1440-daylight.png');

    // 刷新后主题仍沿用
    await p.reload({ waitUntil: 'domcontentloaded' });
    await ready(p);
    ok('刷新后主题偏好保留', (await p.evaluate(() => window.GlobePuzzle.theme)) === 'daylight');
    await p.click('#gp-theme button[data-theme="deep"]');
    await sleep(300);
  }

  /* ---------------- 3. 本地档案：CRUD / 隔离 / 迁移 / 备份 ---------------- */
  if (FULL) {
    await p.click('#gp-profile-btn');
    await sleep(250);
    ok('档案弹窗可打开', await p.evaluate(() => document.getElementById('gp-profile').classList.contains('show')));
    await shot(p, 'v2.5-release-profile.png');
    // 启动时主程序会记一次「换个视角」成就，p1 的基线不一定是 0，
    // 所以用「各档案自己的 stats」比对，而不是用解锁枚数。
    const readStats = () => p.evaluate(() => {
      try { return JSON.parse(localStorage.getItem(window.GPProfiles.saveKey('gp-achievements-v1')) || '{}').stats || {}; }
      catch (e) { return {}; }
    });
    const p1Stats = await readStats();

    await p.fill('#gp-profile-new-name', '小明');
    await p.click('#gp-profile-new-btn');
    await sleep(350);
    const created = await p.evaluate(() => ({ st: window.GPProfiles.state(), chip: document.getElementById('gp-profile-chip').textContent }));
    ok('新建档案并自动切换', created.st.profiles.length === 2 && created.st.current !== 'p1' && created.chip === '小明');

    // 成就隔离：给当前档案写一条进度，切回 p1 后应看不到
    await p.evaluate(() => { window.GlobePuzzle.achievements.bump('placed', 7); });
    await sleep(150);
    const newStats = await readStats();
    await p.evaluate(() => window.__GP_DEBUG.switchTo('p1'));
    await sleep(250);
    const backStats = await readStats();
    ok('切换档案后成就统计隔离',
      (newStats.placed || 0) >= 7 && (backStats.placed || 0) === (p1Stats.placed || 0),
      'p1=' + JSON.stringify(p1Stats) + ' new=' + JSON.stringify(newStats) + ' back=' + JSON.stringify(backStats));
    const newId = created.st.current;
    await p.evaluate((id) => window.__GP_DEBUG.switchTo(id), newId);
    await sleep(200);
    ok('切回新档案后进度恢复', ((await readStats()).placed || 0) >= 7);

    // 主题隔离：新档案设极光，切回 p1 应保持深空（弹窗遮挡左栏，走 API）
    await p.evaluate(() => window.GlobePuzzle.setTheme('aurora'));
    await sleep(250);
    await p.evaluate(() => window.__GP_DEBUG.switchTo('p1'));
    await sleep(250);
    ok('切换档案后主题偏好隔离', (await p.evaluate(() => window.GlobePuzzle.theme)) === 'deep', await p.evaluate(() => window.GlobePuzzle.theme));

    // 重命名（内联编辑）
    await p.evaluate((id) => window.__GP_DEBUG.switchTo(id), newId);
    await sleep(200);
    await p.click('#gp-profile-list .gp-profile-item.active button[data-act="rename"]');
    await p.fill('.gp-rename-input', '地理课');
    await p.click('.gp-profile-btns button[data-act="save"]');
    await sleep(200);
    ok('重命名档案生效', await p.evaluate(() => window.GPProfiles.list().some((x) => x.name === '地理课')));

    // 导出 / 导入
    const backup = await p.evaluate(() => window.GPProfiles.exportData());
    ok('导出备份含全部档案', (() => { try { return JSON.parse(backup).state.profiles.length === 2; } catch (e) { return false; } })());
    const badImport = await p.evaluate(() => window.GPProfiles.importData('{"app":"other"}'));
    ok('非法备份被拒绝且不破坏数据', badImport.ok === false && (await p.evaluate(() => window.GPProfiles.list().length)) === 2);
    const goodImport = await p.evaluate((t) => window.GPProfiles.importData(t), backup);
    ok('合法备份可回导', goodImport.ok === true && goodImport.count === 2);

    // 清空进度仅影响当前档案
    await p.evaluate(() => { window.GlobePuzzle.achievements.bump('placed', 3); });
    await p.click('#gp-profile-clear'); await p.click('#gp-profile-clear');
    await sleep(250);
    ok('清空当前档案进度', (await p.evaluate(() => window.GlobePuzzle.achievements.unlockedCount)) === 0);

    // 删除最后一个档案应被拒绝；删除非当前档案可成功
    await p.evaluate(() => window.__GP_DEBUG.switchTo('p1'));
    await sleep(200);
    await p.click('#gp-profile-list .gp-profile-item:not(.active) button[data-act="del"]');
    await p.click('#gp-profile-list .gp-profile-item:not(.active) button[data-act="del"]');
    await sleep(250);
    ok('删除多余档案', (await p.evaluate(() => window.GPProfiles.list().length)) === 1);
    const delLast = await p.evaluate(() => window.GPProfiles.remove('p1'));
    ok('至少保留一个档案', delLast.ok === false);

    await p.keyboard.press('Escape');
    await sleep(150);
    ok('Esc 关闭档案弹窗', await p.evaluate(() => !document.getElementById('gp-profile').classList.contains('show')));
  }

  /* ---------------- 4. 赞赏 ---------------- */
  await p.click('#gp-tip-btn');
  await sleep(250);
  const tip = await p.evaluate(() => ({
    shown: document.getElementById('gp-tip').classList.contains('show'),
    qr: document.getElementById('gp-tip-qr').getAttribute('src'),
    save: !!document.getElementById('gp-tip-save'),
    text: (document.getElementById('gp-tip') || {}).textContent
  }));
  ok('赞赏弹窗可打开', tip.shown);
  ok('赞赏码为本地资源（非外链）', /^(data:image|assets\/sponsor-qr\.png)/.test(tip.qr || ''), (tip.qr || '').slice(0, 60));
  ok('保存二维码按钮存在', tip.save);
  ok('赞赏说明含自愿与无外链承诺', /自愿/.test(tip.text || '') && /不请求任何外部接口/.test(tip.text || ''));
  await shot(p, 'v2.5-release-tip.png');
  await p.keyboard.press('Escape');
  await sleep(150);
  ok('Esc 关闭赞赏弹窗', await p.evaluate(() => !document.getElementById('gp-tip').classList.contains('show')));
  await p.click('#gp-support-btn');
  await sleep(200);
  ok('左栏支持卡可打开赞赏', await p.evaluate(() => document.getElementById('gp-tip').classList.contains('show')));
  await p.keyboard.press('Escape');

  /* ---------------- 5. 键盘：输入框守卫 / 相机 / 焦点 ---------------- */
  if (FULL) {
    const before = await p.evaluate(() => ({ text: document.getElementById('gp-progress-text').textContent, rot: window.GlobePuzzle._internals.globeGroup.rotation.y }));
    await p.click('#gp-find-input');
    await p.type('#gp-find-input', 'river');
    await p.keyboard.press('Backspace');
    await sleep(250);
    const after = await p.evaluate(() => ({ text: document.getElementById('gp-progress-text').textContent, val: document.getElementById('gp-find-input').value, flat: document.getElementById('gp-flat').classList.contains('show') }));
    ok('输入框内打字不触发全局快捷键', after.val === 'rive' && !after.flat, JSON.stringify(after));
    ok('输入 r/f/Backspace 未重置拼图', before.text === after.text, before.text + ' -> ' + after.text);
    await p.evaluate(() => { document.getElementById('gp-find-input').blur(); document.getElementById('gp-canvas').focus(); });
    await p.keyboard.press('ArrowRight');
    await sleep(150);
    const rot = await p.evaluate(() => window.GlobePuzzle._internals.globeGroup.rotation.y);
    ok('方向键可旋转地球', Math.abs(rot - before.rot) > 0.01, 'delta=' + (rot - before.rot));
    const focusOutline = await p.evaluate(() => getComputedStyle(document.getElementById('gp-canvas')).outlineStyle);
    ok('画布焦点有可见描边', focusOutline !== 'none', focusOutline);
    await p.keyboard.press('0');
    await sleep(120);
  }

  /* ---------------- 6. 响应式 ---------------- */
  for (const size of [[820, 900], [390, 780], [360, 740]]) {
    await p.setViewportSize({ width: size[0], height: size[1] });
    await sleep(450);
    const r = await p.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      tip: (() => { const e = document.getElementById('gp-tip-btn'); const b = e.getBoundingClientRect(); return b.width > 0 && b.right <= window.innerWidth + 1; })(),
      profile: (() => { const e = document.getElementById('gp-profile-btn'); const b = e.getBoundingClientRect(); return b.width > 0 && b.right <= window.innerWidth + 1; })(),
      // 该面板默认带 hidden 属性（切到洋流模式才由 JS 移除）。
      // 临时去掉 hidden 后若仍 display:none，说明 CSS 误隐藏了它（旧 nth-child 规则的 bug）。
      currentsHidden: (() => {
        const e = document.getElementById('gp-currents-panel');
        if (!e) return 'missing';
        const was = e.hidden; e.hidden = false;
        const d = getComputedStyle(e).display;
        e.hidden = was; return d;
      })()
    }));
    ok(size[0] + 'px 无横向溢出', r.sw <= r.cw + 1, r.sw + '/' + r.cw);
    ok(size[0] + 'px 顶栏档案与赞赏按钮可见且不越界', r.tip && r.profile, JSON.stringify(r));
    if (size[0] <= 820) ok(size[0] + 'px 洋流联动面板不再被误隐藏', r.currentsHidden !== 'none', r.currentsHidden);
    if (size[0] === 360) await shot(p, 'v2.5-release-360.png');
  }
  await p.setViewportSize({ width: 1440, height: 900 });

  /* ---------------- 7. 坏存档 / 旧存档迁移 / WebGL 兜底 ---------------- */
  if (FULL) {
    const badCases = ['null', '[]', '"oops"', '{"__proto__":{"x":1},"stats":{"placed":-5},"unlocked":{"a":"x"}}'];
    for (let i = 0; i < badCases.length; i++) {
      const c = await b.newContext({ viewport: { width: 900, height: 640 } });
      const q = await c.newPage();
      const ew = watch(q);
      await q.addInitScript((val) => {
        try { localStorage.setItem('gp-achievements-v1::p1', val); } catch (e) { /* ignore */ }
      }, badCases[i]);
      await q.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
      let okBoot = true;
      try { await ready(q, 60000); } catch (e) { okBoot = false; }
      const st = await q.evaluate(() => ({
        ready: window.__GP_READY === true,
        ach: window.GlobePuzzle && window.GlobePuzzle.achievements.all.length,
        fail: !!document.getElementById('gp-boot-fail')
      }));
      ok('坏存档自愈 #' + (i + 1) + ' 正常启动', okBoot && st.ready && st.ach === 15 && !st.fail && ew.errs.length === 0, JSON.stringify(ew.errs));
      await c.close();
    }

    // 旧版单存档迁移
    const mc = await b.newContext({ viewport: { width: 900, height: 640 } });
    const mq = await mc.newPage();
    await mq.addInitScript(() => {
      try {
        localStorage.removeItem('gp-profiles-v1');
        localStorage.removeItem('gp-profiles-v1:migrated');
        localStorage.setItem('gp-achievements-v1', JSON.stringify({ stats: { placed: 42 }, unlocked: { 'first-piece': 1 } }));
        localStorage.setItem('gp-theme', 'daylight');
      } catch (e) { /* ignore */ }
    });
    await mq.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await ready(mq);
    const mig = await mq.evaluate(() => ({
      theme: window.GlobePuzzle.theme,
      achKey: window.GPProfiles.saveKey('gp-achievements-v1'),
      stored: localStorage.getItem(window.GPProfiles.saveKey('gp-achievements-v1')),
      themeStored: localStorage.getItem(window.GPProfiles.saveKey('gp-theme')),
      legacy: localStorage.getItem('gp-achievements-v1'),
      count: window.GlobePuzzle.achievements.unlockedCount
    }));
    ok('旧存档无损迁移：主题', mig.theme === 'daylight' && mig.themeStored === 'daylight', JSON.stringify(mig));
    ok('旧存档无损迁移：成就', /"placed":42/.test(mig.stored || '') && mig.count >= 1, mig.stored);
    ok('旧键原样保留（可回退）', /"placed":42/.test(mig.legacy || ''));
    await mc.close();

    // WebGL 不可用 → 明确失败卡
    const wc = await b.newContext({ viewport: { width: 900, height: 640 } });
    const wq = await wc.newPage();
    await wq.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (String(type).toLowerCase().indexOf('webgl') >= 0) return null;
        return orig.apply(this, arguments);
      };
    });
    await wq.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(1600);
    const fb = await wq.evaluate(() => {
      const box = document.getElementById('gp-boot-fail');
      return { shown: !!box, text: box ? box.textContent : '', btn: !!(box && box.querySelector('button')) };
    });
    ok('WebGL 失败显示兜底卡', fb.shown && /WebGL|显卡|硬件加速/.test(fb.text), fb.text.slice(0, 90));
    ok('兜底卡提供重新加载入口', fb.btn);
    await shot(wq, 'v2.5-release-webgl-fallback.png');
    await wc.close();
  }

  console.log('=== 汇总：' + pass + ' PASS / ' + fail + ' FAIL ===');
  await ctx.close();
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
