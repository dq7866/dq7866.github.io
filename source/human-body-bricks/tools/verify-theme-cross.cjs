// 主题外观 × 大视图交叉回归：视频工坊 / 影片模式 / 生理动画进出后配色仍一致
//
// 历史 bug：工坊进场把 scene.background 换成自己的 Color 对象，退场又还原旧引用。
// 若在工坊里换主题，主题色会盖掉影棚背景，且退出后背景退回旧主题色。
// 本脚本锁住这条链路：工坊期间不覆盖影棚色，退场后回填当前主题色。
// 影片模式同理：字幕是白字，进场压成影院黑，退场按当前主题整体回填；
// 浅色主题下这条尤其要紧，否则浅底白字会糊成一片。
const { chromium } = require('playwright');
const path = require('path');

const URL = process.argv[2] || 'http://127.0.0.1:8900/index.html?auto=1';
const TAG = process.argv[3] || 'dev';
const REVIEW = path.resolve(__dirname, '..', 'review');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hx = n => ('000000' + n.toString(16)).slice(-6);
const near = (a, b) => {
  if (!a || !b) return false;
  const x = parseInt(a, 16), y = parseInt(b, 16);
  return [16, 8, 0].every(sh => Math.abs(((x >> sh) & 255) - ((y >> sh) & 255)) <= 2);
};
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
};

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|works-guard\.js|404/.test(t)) return;
    errs.push('[console] ' + t);
  });

  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records.size > 0, null, { timeout: 120000 });
  await sleep(900);

  const snap = () => p.evaluate(() => {
    const d = window.__HB_DEBUG, H = d.theme.hooks;
    return {
      id: d.theme.get(),
      cssBg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      sceneBg: d.scene.background.getHexString(),
      key: H.lights.key.color.getHexString(),
      ground: H.ground.material.color.getHexString(),
      stageVisible: H.ground.visible,
      studio: d.studio.active, film: d.film.active, physio: d.state.physio,
    };
  });
  const pick = async id => {
    await p.click('#btnTheme'); await sleep(150);
    await p.click(`#themeList button[data-theme="${id}"]`); await sleep(300);
  };

  // 1) 先换到暖夜橙，再进工坊
  await pick('ember');
  let s = await snap();
  ok('准备：ember 已生效', s.id === 'ember' && s.cssBg === '#170f08' && near(s.sceneBg, '170f08'));

  await p.click('#btnStudio');
  await sleep(1600);
  s = await snap();
  ok('视频工坊已进场并接管背景', s.studio === true && !near(s.sceneBg, '170f08'),
    `studio=${s.studio} bg=${s.sceneBg}`);
  ok('工坊进场保留主题界面配色', s.cssBg === '#170f08');
  const studioBg = s.sceneBg;

  // 2) 工坊进行中换主题：界面/灯光跟着换，影棚背景不被主题色覆盖
  await pick('plum');
  s = await snap();
  ok('工坊内切换主题 → 界面配色生效', s.id === 'plum' && s.cssBg === '#120a1e', `css=${s.cssBg}`);
  ok('工坊内切换主题 → 灯光同步换色', near(s.key, 'fff0f8'), `key=${s.key}`);
  ok('工坊影棚背景未被主题色覆盖', s.sceneBg === studioBg && !near(s.sceneBg, '120a1e'), `bg=${s.sceneBg}`);
  await p.screenshot({ path: path.join(REVIEW, `theme-${TAG}-cross-studio.png`) });

  // 3) 退出工坊：背景回填当前主题色，地面/网格恢复，灯光不串色
  await p.click('#btnStudio');
  await sleep(1000);
  s = await snap();
  ok('工坊退场后背景 = 当前主题 plum', s.studio === false && near(s.sceneBg, '120a1e'), `bg=${s.sceneBg}`);
  ok('工坊退场后地面/灯光/舞台一致', near(s.ground, '181026') && near(s.key, 'fff0f8') && s.stageVisible === true,
    `ground=${s.ground} key=${s.key} stage=${s.stageVisible}`);

  // 4) 生理动画进出（cinema 自带轮廓光，不能顶掉主题背景/灯光）
  await p.evaluate(() => window.__HB_DEBUG.openPhysio('circulation'));
  await sleep(1300);
  s = await snap();
  ok('生理动画中主题背景/灯光保持不变', !!s.physio && near(s.sceneBg, '120a1e') && near(s.key, 'fff0f8'),
    `physio=${s.physio} bg=${s.sceneBg} key=${s.key}`);
  await p.click('#physioExit');
  await sleep(700);
  s = await snap();
  ok('退出生理动画后主题仍为 plum', !s.physio && s.id === 'plum' && near(s.sceneBg, '120a1e'));

  // 5) 影片模式进出（film 会保存/恢复背景引用，验证就地换色不失效）
  await p.click('#btnFilm');
  await sleep(1800);
  s = await snap();
  ok('影片模式压成影院黑（白字字幕可读）', s.film === true && near(s.sceneBg, '05070c'),
    `film=${s.film} bg=${s.sceneBg}`);
  ok('影片模式收起地面/网格/微尘', s.stageVisible === false, `stage=${s.stageVisible}`);
  // 影片模式是沉浸式全屏，canvas 会盖住顶栏按钮；用 Esc（film.js 内建退出）收尾
  await p.keyboard.press('Escape');
  await sleep(900);
  s = await snap();
  ok('退出影片后主题仍为 plum', s.film === false && near(s.sceneBg, '120a1e') &&
    s.cssBg === '#120a1e' && s.stageVisible === true,
    `bg=${s.sceneBg} css=${s.cssBg} stage=${s.stageVisible}`);
  await p.screenshot({ path: path.join(REVIEW, `theme-${TAG}-cross-after.png`) });

  // 6) 浅色主题 × 大视图：明亮主题下进出工坊 / 影片 / 生理动画，明暗与背景都不能串色
  await pick('daylight');
  s = await snap();
  const day = await p.evaluate(() => ({
    scheme: document.documentElement.dataset.scheme,
    text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
  }));
  ok('浅色主题 daylight 已生效', s.id === 'daylight' && day.scheme === 'light' &&
    s.cssBg === '#eef3fa' && near(s.sceneBg, 'e8f0fa') && /^#(0|1|2|3)/.test(day.text),
    `scheme=${day.scheme} text=${day.text} bg=${s.sceneBg}`);

  await p.click('#btnStudio'); await sleep(1400);
  s = await snap();
  ok('浅色下工坊进场仍由影棚接管背景', s.studio === true && !near(s.sceneBg, 'e8f0fa'), `bg=${s.sceneBg}`);
  await p.click('#btnStudio'); await sleep(900);
  s = await snap();
  ok('浅色下工坊退场回填浅色背景', s.studio === false && near(s.sceneBg, 'e8f0fa') && s.cssBg === '#eef3fa',
    `bg=${s.sceneBg} css=${s.cssBg}`);

  await p.click('#btnFilm'); await sleep(1600);
  s = await snap();
  ok('浅色下影片仍压成影院黑', s.film === true && near(s.sceneBg, '05070c') && s.stageVisible === false,
    `bg=${s.sceneBg} stage=${s.stageVisible}`);
  await p.keyboard.press('Escape'); await sleep(800);
  s = await snap();
  ok('浅色下退出影片回填浅色背景与舞台', s.film === false && near(s.sceneBg, 'e8f0fa') && s.stageVisible === true,
    `bg=${s.sceneBg} stage=${s.stageVisible}`);

  await p.evaluate(() => window.__HB_DEBUG.openPhysio('circulation'));
  await sleep(1200);
  s = await snap();
  ok('浅色下生理动画不冲掉主题', !!s.physio && near(s.sceneBg, 'e8f0fa'), `bg=${s.sceneBg}`);
  await p.click('#physioExit'); await sleep(600);
  s = await snap();
  ok('浅色下退出生理动画主题不变', !s.physio && near(s.sceneBg, 'e8f0fa') && s.cssBg === '#eef3fa');
  await p.screenshot({ path: path.join(REVIEW, `theme-${TAG}-cross-daylight.png`) });

  // 7) 还原默认主题，保证不影响后续用例
  await p.evaluate(() => window.__HB_DEBUG.theme.set('deep'));
  await sleep(250);
  s = await snap();
  ok('恢复 deep 默认观感', s.id === 'deep' && near(s.sceneBg, '090e1a') && near(s.key, 'fff0dc'));
  ok('零运行时报错', errs.length === 0, errs.slice(0, 4).join(' | '));

  console.log(`\n=== ${TAG} 主题×大视图交叉回归：${pass} PASS / ${fail} FAIL ===`);
  await b.close();
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
