// 本地用户档案 + 赞赏机制回归
//
// 用法：
//   node tools/verify-user-tip.cjs                                   # 源码版（8900）
//   node tools/verify-user-tip.cjs "file:///.../人体积木.html?auto=1" single
//   node tools/verify-user-tip.cjs "http://127.0.0.1:8902/index.html?auto=1" pub
//
// 覆盖：DOM 入口 / 二维码真实加载 / 弹窗开关与保存 / 浅色主题可读性 /
//       旧存档无损迁移 / 多档案 CRUD / 进度隔离 / 清空只清当前档案 / 零运行时报错。
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

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errs = [], badResponses = [];
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  // 本地 8902 以 public/human-body 为根，访问门脚本 /works-guard.js 会 404；
  // 线上站点根目录有这个文件。单独记录，避免把真实资源失败一起掩盖掉。
  p.on('response', r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });
  let promptAnswer = '';
  p.on('dialog', d => { if (d.type() === 'prompt') d.accept(promptAnswer); else d.accept(); });

  const ready = async () => {
    for (let i = 0; i < 4; i++) {
      try {
        await p.waitForFunction(() => window.__HB_DEBUG && window.__HB_DEBUG.records.size > 0,
          null, { timeout: 120000 });
        await sleep(400);
        return;
      } catch (e) { if (i === 3) throw e; await sleep(600); }
    }
  };
  // 会触发 location.reload() 的动作：先挂上导航等待，再点，最后等新页面就绪
  const reloadAction = async fn => {
    const nav = p.waitForNavigation({ waitUntil: 'load', timeout: 120000 }).catch(() => {});
    await fn();
    await nav;
    await ready();
  };
  const list = () => p.evaluate(() => window.__HB_DEBUG.profiles.list());
  const idOf = async name => (await list()).find(x => x.name === name)?.id;

  await p.goto(URL, { waitUntil: 'load' });
  await ready();

  /* ---------- 1) DOM 与入口 ---------- */
  const a0 = await p.evaluate(() => {
    const ids = ['profileChip', 'btnProfile', 'btnTip', 'supportCard', 'profilePanel',
      'profileList', 'profileNewName', 'profileAdd', 'tipModal', 'tipQr', 'tipSave'];
    const img = document.getElementById('tipQr');
    const cs = getComputedStyle(document.querySelector('.left-panel'));
    return {
      missing: ids.filter(i => !document.getElementById(i)),
      chip: document.getElementById('profileChip').textContent,
      coffeeText: document.getElementById('btnTip').textContent.trim(),
      qr: { complete: img.complete, w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute('src').slice(0, 40) },
      saveDownload: document.getElementById('tipSave').getAttribute('download'),
      profiles: window.__HB_DEBUG.profiles.list(),
      saveKey: window.__HB_DEBUG.profiles.saveKey(),
      leftPanelBg: cs.backgroundColor,
    };
  });
  ok('顶栏 / 左侧 / 面板 / 弹窗 DOM 齐全', a0.missing.length === 0, `missing=${a0.missing.join(',')}`);
  ok('顶栏赞赏按钮带文字、昵称显示当前档案', a0.coffeeText === '赞赏' && a0.chip.length > 0,
    `coffee=${a0.coffeeText} chip=${a0.chip}`);
  ok('收款码真实加载（983×1132）', a0.qr.complete && a0.qr.w === 983 && a0.qr.h === 1132,
    `${a0.qr.w}x${a0.qr.h}`);
  ok(TAG === 'single' ? '单文件版二维码已内联 data URI' : '源码 / 发布版二维码走 assets 路径',
    TAG === 'single' ? a0.qr.src.startsWith('data:image/png;base64,') : a0.qr.src.includes('sponsor-qr.png'),
    a0.qr.src);
  ok('保存二维码按钮带 download 文件名', /\.png$/.test(a0.saveDownload || ''), a0.saveDownload);

  /* ---------- 2) 赞赏弹窗 ---------- */
  await p.click('#btnTip'); await sleep(250);
  const t1 = await p.evaluate(() => ({
    show: document.getElementById('tipModal').classList.contains('show'),
    href: document.getElementById('tipSave').getAttribute('href'),
    steps: document.querySelector('.tip-steps')?.textContent || '',
    note: document.querySelector('.tip-modal-card .help-note')?.textContent || '',
  }));
  ok('点顶栏「赞赏」打开弹窗', t1.show);
  ok('弹窗含扫码说明与自愿声明', t1.steps.includes('微信') && t1.steps.includes('支付宝') && t1.note.includes('自愿'));
  ok('保存二维码 href 已指向当前图片', !!t1.href && t1.href.length > 20);
  await p.screenshot({ path: path.join(REVIEW, `user-tip-${TAG}-modal.png`) });
  await p.keyboard.press('Escape'); await sleep(200);
  ok('Esc 关闭赞赏弹窗', await p.evaluate(() => !document.getElementById('tipModal').classList.contains('show')));
  await p.click('#supportCard'); await sleep(200);
  ok('左侧支持卡也能打开弹窗', await p.evaluate(() => document.getElementById('tipModal').classList.contains('show')));
  await p.click('#tipModal', { position: { x: 4, y: 4 } }); await sleep(200);
  ok('点遮罩关闭弹窗', await p.evaluate(() => !document.getElementById('tipModal').classList.contains('show')));

  /* ---------- 3) 明亮主题下弹窗可读 ---------- */
  await p.evaluate(() => window.__HB_DEBUG.theme.set('daylight'));
  await sleep(250);
  await p.click('#btnTip'); await sleep(250);
  const light = await p.evaluate(() => {
    const h2 = document.querySelector('.tip-modal-card h2');
    const rgb = s => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
    return {
      scheme: document.documentElement.dataset.scheme,
      title: rgb(getComputedStyle(h2).color),
      qrBg: getComputedStyle(document.getElementById('tipQr')).backgroundColor,
      sub: rgb(getComputedStyle(document.querySelector('.tip-sub')).color),
      saveBg: getComputedStyle(document.getElementById('tipSave')).backgroundImage,
    };
  });
  ok('浅色主题已生效', light.scheme === 'light', light.scheme);
  ok('浅色下标题为深色字（不白底白字）', light.title.every(v => v < 120), String(light.title));
  ok('浅色下正文为深色字', light.sub.every(v => v < 160), String(light.sub));
  ok('二维码始终白底，扫码不受主题影响', /255,\s*255,\s*255/.test(light.qrBg), light.qrBg);
  ok('浅色下「保存二维码」主按钮未被半透明底盖成白底白字',
    /gradient/.test(light.saveBg), light.saveBg.slice(0, 60));
  await p.screenshot({ path: path.join(REVIEW, `user-tip-${TAG}-light.png`) });
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.__HB_DEBUG.theme.set('deep'));

  /* ---------- 4) 档案面板 ---------- */
  await p.click('#btnProfile'); await sleep(250);
  const f0 = await p.evaluate(() => ({
    hidden: document.getElementById('profilePanel').hidden,
    rows: document.querySelectorAll('#profilePanel .pf-item').length,
    now: document.getElementById('profileNowName').textContent,
    stat: document.getElementById('profileNowStat').textContent,
    note: document.querySelector('.pf-note')?.textContent || '',
  }));
  ok('档案面板打开并列出档案', !f0.hidden && f0.rows === 1, `rows=${f0.rows}`);
  ok('面板标明纯本地、不同步边界', f0.note.includes('不上传') && f0.note.includes('不会同步'));
  ok('面板显示当前档案名与学习统计', f0.now === '我' && /已认识/.test(f0.stat), `${f0.now} / ${f0.stat}`);
  await p.screenshot({ path: path.join(REVIEW, `user-tip-${TAG}-profile.png`) });
  await p.keyboard.press('Escape'); await sleep(150);
  ok('Esc 关闭档案面板', await p.evaluate(() => document.getElementById('profilePanel').hidden));

  /* ---------- 5) 旧版单存档无损迁移 ---------- */
  await p.evaluate(() => {
    window.__HB_DEBUG.profiles.reset();
    localStorage.setItem('human-body-bricks-v1', JSON.stringify({
      learned: ['skull', 'heart'], badges: ['body'], system: 'body', sound: true,
    }));
  });
  await reloadAction(() => p.reload());
  const mig = await p.evaluate(() => ({
    n: window.__HB_DEBUG.profiles.list().length,
    name: window.__HB_DEBUG.profiles.current().name,
    learned: window.__HB_DEBUG.state.learned.size,
    badges: window.__HB_DEBUG.state.badges.size,
    raw: JSON.parse(localStorage.getItem(window.__HB_DEBUG.profiles.saveKey()) || '{}'),
  }));
  ok('首次进入自动建默认档案「我」', mig.n === 1 && mig.name === '我', `${mig.n}/${mig.name}`);
  ok('旧版学习进度与徽章无损迁移', mig.learned === 2 && mig.badges === 1 && (mig.raw.learned || []).length === 2,
    `learned=${mig.learned} badges=${mig.badges}`);

  /* ---------- 6) 新建档案并自动切换 ---------- */
  await p.click('#btnProfile');
  await p.fill('#profileNewName', '小明');
  await reloadAction(() => p.click('#profileAdd'));
  const nw = await p.evaluate(() => ({
    list: window.__HB_DEBUG.profiles.list(),
    cur: window.__HB_DEBUG.profiles.current().name,
    learned: window.__HB_DEBUG.state.learned.size,
    chip: document.getElementById('profileChip').textContent,
  }));
  ok('新建档案「小明」并自动切换、进度从零开始',
    nw.list.length === 2 && nw.cur === '小明' && nw.learned === 0, `n=${nw.list.length} cur=${nw.cur} learned=${nw.learned}`);
  ok('顶栏昵称同步为新档案', nw.chip === '小明', nw.chip);

  /* ---------- 7) 进度按档案隔离 ---------- */
  await p.evaluate(() => window.__HB_DEBUG.selectPart('skull'));
  await sleep(250);
  const own = await p.evaluate(() => ({
    learned: window.__HB_DEBUG.state.learned.size,
    raw: JSON.parse(localStorage.getItem(window.__HB_DEBUG.profiles.saveKey()) || '{}').learned || [],
  }));
  ok('新档案写进自己的存档键', own.learned === 1 && own.raw.length === 1, `learned=${own.learned}`);
  const meId = await idOf('我');
  await p.click('#btnProfile');
  await reloadAction(() => p.click(`.pf-item[data-id="${meId}"] button[data-act="switch"]`));
  const back = await p.evaluate(() => ({ cur: window.__HB_DEBUG.profiles.current().name, learned: window.__HB_DEBUG.state.learned.size }));
  ok('切回「我」恢复原有 2 条进度', back.cur === '我' && back.learned === 2, `${back.cur}/${back.learned}`);
  ok('「小明」的进度仍独立保留', (await list()).find(x => x.name === '小明').stats.learned === 1);

  /* ---------- 8) 清空进度只清当前档案 ---------- */
  await reloadAction(() => p.click('#btnReset'));
  const clr = await p.evaluate(() => ({ learned: window.__HB_DEBUG.state.learned.size, list: window.__HB_DEBUG.profiles.list() }));
  ok('「清空进度」只清当前档案', clr.learned === 0 && clr.list.length === 2,
    `learned=${clr.learned} profiles=${clr.list.length}`);
  ok('其它档案进度不受影响', clr.list.find(x => x.name === '小明').stats.learned === 1);

  /* ---------- 9) 重命名与删除 ---------- */
  await p.click('#btnProfile');
  const xId = await idOf('小明');
  promptAnswer = '小红';
  await p.click(`.pf-item[data-id="${xId}"] button[data-act="rename"]`);
  await sleep(250);
  const rn = await list();
  ok('重命名档案生效', rn.some(x => x.name === '小红') && !rn.some(x => x.name === '小明'),
    rn.map(x => x.name).join('/'));
  await p.click(`.pf-item[data-id="${xId}"] button[data-act="remove"]`);
  await sleep(300);
  const rm = await p.evaluate(id => ({
    list: window.__HB_DEBUG.profiles.list(),
    orphan: localStorage.getItem('hb-save-v1::' + id),
    cur: window.__HB_DEBUG.profiles.current().name,
  }), xId);
  ok('删除档案连同其进度，且保留至少一个', rm.list.length === 1 && rm.orphan === null && rm.cur === '我',
    `n=${rm.list.length} orphan=${rm.orphan}`);

  /* ---------- 10) 帮助说明 + 零报错 ---------- */
  const help = await p.evaluate(() => document.getElementById('helpModal').textContent);
  ok('玩法说明新增「本地用户档案 / 支持作者」章节', help.includes('本地用户档案') && help.includes('支持作者'));
  const netErr = badResponses.filter(u => !/works-guard\.js/.test(u));
  ok('除本地访问门脚本路径差异外零资源加载失败', netErr.length === 0, netErr.slice(0, 3).join(' | '));
  const realErrs = errs.filter(e => !/Failed to load resource/.test(e));
  ok('零运行时报错（脚本异常 / 控制台错误）', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  // 收尾：恢复干净初始状态，避免影响同一浏览器配置下的其它脚本
  await p.evaluate(() => window.__HB_DEBUG.profiles.reset());

  console.log(`\n=== ${TAG} 用户档案 / 赞赏回归：${pass} 项通过，${fail} 项失败 ===`);
  await b.close();
  if (fail) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
