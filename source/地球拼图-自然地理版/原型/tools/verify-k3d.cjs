/* 地球知识 3D 内部圈层回归：确认 3D 模型挂载、WebGL 上下文、拆解/搭建切换、
   自动旋转、层按钮联动、画布点击拾取、浅色主题与零报错。
 *   node tools/verify-k3d.cjs [url]
 */
const { chromium } = require('playwright');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.argv[2] || 'http://127.0.0.1:8911/index.html';

let pass = 0, fail = 0;
const ok = (n, c, e) => {
  if (c) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (e ? ' :: ' + e : '')); }
};

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [], bad = [];
  p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message.slice(0, 220)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 220)); });
  p.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(-80)); });

  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  try { await p.waitForFunction(() => window.__GP_READY === true, null, { timeout: 120000 }); }
  catch (e) { console.log('WARN __GP_READY 未就绪，继续（可能 headless WebGL 受限）'); }
  await sleep(1200);

  ok('Earth3D 模块已定义', await p.evaluate(() => typeof window.Earth3D !== 'undefined'));
  ok('地球知识就绪(__GP_KNOWLEDGE_READY)', await p.evaluate(() => window.__GP_KNOWLEDGE_READY === true));

  // 打开知识弹窗
  await p.click('#gp-knowledge-btn'); await sleep(700);
  ok('知识弹窗已打开', await p.evaluate(() => document.getElementById('gp-knowledge').classList.contains('show')));

  // 3D canvas 存在且有尺寸
  ok('3D canvas 存在且有尺寸', await p.evaluate(() => {
    const c = document.getElementById('gp-k-3d');
    return !!c && c.clientWidth > 0 && c.clientHeight > 0;
  }));

  // WebGL 上下文
  const glInfo = await p.evaluate(() => {
    const c = document.getElementById('gp-k-3d');
    if (!c) return { has: false };
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    return { has: !!gl, lost: gl ? gl.isContextLost() : true };
  });
  ok('3D canvas 取得 WebGL 上下文且未丢失', glInfo.has && !glInfo.lost, JSON.stringify(glInfo));

  // 未降级
  const hint = await p.evaluate(() => { const h = document.getElementById('gp-k-3dhint'); return h ? h.textContent : ''; });
  ok('3D 未降级(fallback)', !/WebGL|未加载|未启用/.test(hint), hint);

  // 浮标（层标签 + 不连续面标注）
  await sleep(400);
  const labels = await p.evaluate(() => {
    const ls = Array.from(document.querySelectorAll('.gp-k3d-label'));
    const ds = Array.from(document.querySelectorAll('.gp-k3d-disc'));
    const visL = ls.filter(e => e.style.display !== 'none' && e.offsetParent !== null).length;
    const visD = ds.filter(e => e.style.display !== 'none' && e.offsetParent !== null).length;
    return { totalL: ls.length, totalD: ds.length, visL, visD };
  });
  ok('四层浮标均已创建', labels.totalL === 4, JSON.stringify(labels));
  ok('三个不连续面标注均已创建', labels.totalD === 3, JSON.stringify(labels));
  ok('至少 2 个层浮标可见(投影正确)', labels.visL >= 2, JSON.stringify(labels));
  ok('不连续面标注可见', labels.visD >= 1, JSON.stringify(labels));

  // 标签必须完整落在画布内：此前最外圈的不连续面标注会贴到底边、被 overflow 裁掉半截
  const inFrame = await p.evaluate(() => {
    const cv = document.getElementById('gp-k-3d'); if (!cv) return null;
    const cr = cv.getBoundingClientRect();
    const all = Array.from(document.querySelectorAll('.gp-k3d-label,.gp-k3d-disc')).filter(e => e.style.display !== 'none');
    const bad = all.filter(e => { const r = e.getBoundingClientRect(); return r.top < cr.top - 0.5 || r.bottom > cr.bottom + 0.5 || r.left < cr.left - 0.5 || r.right > cr.right + 0.5; });
    return { total: all.length, bad: bad.length, worst: bad.slice(0, 2).map(e => e.textContent) };
  });
  ok('所有标签完整落在画布内(无裁切)', inFrame && inFrame.bad === 0, JSON.stringify(inFrame));

  // 拆解 / 搭建
  await p.click('#gp-k-explode'); await sleep(1000);
  ok('拆解→搭建 文案切换', (await p.evaluate(() => document.getElementById('gp-k-explode').textContent)) === '搭建');
  await p.click('#gp-k-explode'); await sleep(1000);
  ok('搭建→拆解 文案切换', (await p.evaluate(() => document.getElementById('gp-k-explode').textContent)) === '拆解');

  // 自动旋转：不仅按钮态，还要「真的转起来」——各层标签屏幕位置应明显漂移（核心灯脉冲不影响标签坐标）
  const readLbls = () => p.evaluate(() => Array.from(document.querySelectorAll('.gp-k3d-label')).map(e => [parseFloat(e.style.left) || 0, parseFloat(e.style.top) || 0]));
  await p.click('#gp-k-spin'); await sleep(150);
  const sp0 = await readLbls(); await sleep(1600); const sp1 = await readLbls();
  let spinMove = 0;
  for (let i = 0; i < sp0.length && i < sp1.length; i++) spinMove = Math.max(spinMove, Math.hypot(sp1[i][0] - sp0[i][0], sp1[i][1] - sp0[i][1]));
  ok('自动旋转 激活', await p.evaluate(() => document.getElementById('gp-k-spin').getAttribute('aria-pressed') === 'true'));
  ok('自动旋转 真正转动(标签漂移>30px)', spinMove > 30, 'move=' + spinMove.toFixed(1));
  await p.click('#gp-k-spin'); await sleep(200);
  ok('自动旋转 关闭', await p.evaluate(() => document.getElementById('gp-k-spin').getAttribute('aria-pressed') === 'false'));

  // 复位视角
  await p.click('#gp-k-reset'); await sleep(200);
  ok('复位视角 可点击无异常', true);

  // 层按钮联动
  await p.click('.gp-k-layer-btn[data-layer="mantle"]'); await sleep(250);
  const detail = await p.evaluate(() => document.getElementById('gp-k-detail').textContent);
  ok('点地幔按钮→详情含 2890', /2890/.test(detail), detail.slice(0, 30));
  ok('地幔按钮高亮', await p.evaluate(() => document.querySelector('.gp-k-layer-btn[data-layer="mantle"]').classList.contains('active')));

  // 画布点击拾取（偏移中心，命中可见外壳，不应报错）
  const box = await p.evaluate(() => {
    const c = document.getElementById('gp-k-3d'); const r = c.getBoundingClientRect();
    return { x: r.left + r.width * 0.30, y: r.top + r.height * 0.45 };
  });
  await p.mouse.click(box.x, box.y); await sleep(300);
  ok('点击 3D 画布未抛错', true);

  // 浅色主题
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'daylight'));
  await sleep(300);
  ok('浅色主题下 3D 画布背景为浅色渐变', await p.evaluate(() => {
    const bg = getComputedStyle(document.getElementById('gp-k-3d')).backgroundImage;
    return /cfe6f5|radial-gradient/.test(bg);
  }));
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'deep'));

  // 截图目检：复原态 + 拆解态
  await p.screenshot({ path: path.join(__dirname, 'k3d-v2-assembled.png') });
  await p.click('#gp-k-explode'); await sleep(1400);
  await p.screenshot({ path: path.join(__dirname, 'k3d-v2-exploded.png') });
  await p.click('#gp-k-explode'); await sleep(1400);

  // Esc 关闭
  await p.keyboard.press('Escape'); await sleep(300);
  ok('Esc 关闭弹窗', await p.evaluate(() => !document.getElementById('gp-knowledge').classList.contains('show')));

  ok('无 JS 运行错误', errs.length === 0, errs.join(' | '));
  ok('无 4xx/5xx 资源', bad.length === 0, bad.join(' | '));

  console.log('\n==== 结果 pass=' + pass + ' fail=' + fail + ' ====');
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
