/* v2.5 既有玩法回归：确认发布级改动（存档命名空间 / 键盘守卫 / Esc / 弹窗）
   没有影响原来的十套内容、图层、训练、找片、平面图与成就。
 *   node tools/verify-gameplay.cjs [url]
 */
const { chromium } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.argv[2] || 'http://127.0.0.1:8910/index.html';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [], bad = [];
  p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message.slice(0, 180)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 180)); });
  p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(-80)); });

  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.__GP_READY === true, null, { timeout: 90000 });
  await sleep(700);

  /* 十套内容逐个加载 */
  const modes = ['regions', 'plates', 'climate', 'mountains', 'rivers', 'currents', 'oceans', 'belts', 'peaks', 'countries'];
  const counts = {};
  for (const m of modes) {
    await p.evaluate((x) => window.GlobePuzzle.setMode(x), m);
    await sleep(m === 'countries' ? 700 : 320);
    const st = await p.evaluate(() => ({
      mode: window.GlobePuzzle.getState().mode,
      pieces: window.GlobePuzzle._internals.puzzle.pieces.length,
      progress: (document.getElementById('gp-progress-text') || {}).textContent
    }));
    counts[m] = st.pieces;
    ok('内容 ' + m + ' 加载正常且有拼片', st.mode === m && st.pieces > 0, JSON.stringify(st));
  }
  ok('七大洲默认 7 片', counts.regions === 7, String(counts.regions));
  ok('地质板块 52 片', counts.plates === 52, String(counts.plates));
  ok('柯本气候区 24 片', counts.climate === 24, String(counts.climate));
  ok('国家点位 195 片', counts.countries === 195, String(counts.countries));

  /* 难度档位 */
  await p.evaluate(() => window.GlobePuzzle.setMode('regions'));
  await sleep(250);
  const lv = await p.evaluate(() => window.GlobePuzzle.levels.map((x) => x.id));
  for (const l of lv) {
    await p.evaluate((x) => window.GlobePuzzle.setLevel(x), l);
    await sleep(280);
    const n = await p.evaluate(() => window.GlobePuzzle._internals.puzzle.pieces.length);
    ok('难度 ' + l + ' 可加载', n > 0, 'pieces=' + n);
  }

  /* 平面展开图 / 拆解 / 打散 / 全部归位 */
  await p.evaluate(() => window.GlobePuzzle.openFlat());
  await sleep(280);
  ok('平面展开图可打开', await p.evaluate(() => window.GlobePuzzle.getState().flatOpen));
  await p.evaluate(() => window.GlobePuzzle.closeFlat());
  await sleep(200);
  ok('平面展开图可关闭', await p.evaluate(() => !window.GlobePuzzle.getState().flatOpen));
  await p.evaluate(() => window.GlobePuzzle.solveAll());
  await sleep(400);
  const solved = await p.evaluate(() => (document.getElementById('gp-progress-text') || {}).textContent);
  ok('全部归位可用', /^\d+ \/ \d+/.test(solved || '') && !/^0 \//.test(solved || ''), solved);
  await p.evaluate(() => window.GlobePuzzle.detach());
  await sleep(400);
  ok('拆解已拼片可用（无异常）', true);
  await p.evaluate(() => window.GlobePuzzle.reset());
  await sleep(350);
  ok('重新打散可用', /^0 \//.test((await p.evaluate(() => (document.getElementById('gp-progress-text') || {}).textContent)) || ''));

  /* 找片 / 知识卡 */
  const found = await p.evaluate(() => window.GlobePuzzle.findPieces('法国'));
  ok('找片检索返回结果', Array.isArray(found), JSON.stringify(found).slice(0, 120));
  await p.fill('#gp-find-input', 'France');
  await sleep(250);
  ok('找片输入框可用', (await p.inputValue('#gp-find-input')) === 'France');
  await p.fill('#gp-find-input', '');
  const know = await p.evaluate(() => {
    const all = window.GlobePuzzle.findPieces('');
    const id = all.length ? all[0].id : null;
    return id ? window.GlobePuzzle.getKnowledge(id) : null;
  });
  ok('地理知识卡数据可读', !!know && typeof know === 'object');

  /* 定位训练 */
  await p.click('#gp-train-btn');
  await sleep(300);
  ok('定位训练可进入', await p.evaluate(() => !document.getElementById('gp-train').hidden));
  await p.click('#gp-train-exit');
  await sleep(200);
  ok('定位训练可退出', await p.evaluate(() => document.getElementById('gp-train').hidden));

  /* 成就 / 图层 / 语言 / 月份 / 气候联动 */
  await p.click('#gp-ach-btn');
  await sleep(250);
  ok('成就面板 15 项', (await p.locator('#gp-ach-grid .gp-ach').count()) === 15);
  await p.keyboard.press('Escape');

  const terrain = await p.evaluate(() => {
    const cb = document.getElementById('gp-terrain');
    const before = cb.checked; cb.click();
    return { before, after: cb.checked };
  });
  ok('地形起伏图层开关可用', terrain.before !== terrain.after);
  await p.evaluate(() => document.getElementById('gp-terrain').click());

  await p.click('#gp-lang button[data-lang="en"]');
  await sleep(300);
  ok('名称语言可切 English', await p.evaluate(() => document.querySelector('#gp-lang button[data-lang="en"]').classList.contains('active')));
  await p.click('#gp-lang button[data-lang="zh"]');
  await sleep(250);

  await p.evaluate(() => window.GlobePuzzle.setMode('currents'));
  await sleep(320);
  // 进入专题片时同名覆盖层会自动关闭；月份面板挂在覆盖层开关上，需先打开。
  await p.evaluate(() => window.GlobePuzzle.setLayer('currents', true));
  await sleep(320);
  await p.click('#gp-cur-months button[data-month="7"]');
  await sleep(250);
  ok('洋流 1 月 / 7 月可切', await p.evaluate(() => document.querySelector('#gp-cur-months button[data-month="7"]').classList.contains('active')));

  await p.evaluate(() => window.GlobePuzzle.setMode('climate'));
  await sleep(320);
  ok('气候联动面板出现', await p.evaluate(() => !document.getElementById('gp-belts-panel').hidden));
  const belts = await p.locator('#gp-belts button').count();
  ok('气候带图例已渲染', belts >= 3, 'count=' + belts);

  /* 四套主题 */
  for (const t of ['deep', 'aurora', 'dawn', 'daylight']) {
    await p.evaluate((x) => window.GlobePuzzle.setTheme(x), t);
    await sleep(180);
    ok('主题 ' + t + ' 可切换', (await p.evaluate(() => document.documentElement.dataset.theme)) === t);
  }

  ok('玩法回归全程零 JS 报错', errs.length === 0, JSON.stringify(errs));
  ok('玩法回归全程零 HTTP 失败', bad.length === 0, JSON.stringify(bad));
  console.log('=== 玩法回归汇总：' + pass + ' PASS / ' + fail + ' FAIL ===');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
