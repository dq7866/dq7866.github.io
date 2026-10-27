/**
 * 家长延迟边界校验（真实浏览器双端）
 * ---------------------------------------------------------------
 * 专测「家长延迟解锁」这条时间线的两端边界，这是对战公平性的开关：
 *
 *   场景 1  延迟 = 0 秒（界面提示「完全公平模式」）
 *           家长必须在第一帧就能作答 —— 不应被锁住
 *   场景 2  延迟 = 3 秒
 *           家长在解锁前点击应被拒（不扣分、不提交），解锁后能正常作答
 *
 * 判定方式不看动画、只看事实：答案按钮是否被服务端回执染色（correct/wrong）。
 * 用法：node scripts/e2e-battle-lock.mjs
 */
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/';
const wait = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (cond, msg, extra = '') => {
  console.log((cond ? '✅ ' : '❌ ') + msg + (extra ? `  ${extra}` : ''));
  if (!cond) fail.push(msg);
};

const browser = await chromium.launch({ channel: 'msedge' });

/** 开一局，返回 [家长页, 孩子页, 房间码]
 *  delayTicks：延迟滑块的刻度值，1 刻度 = 100ms（滑块 0~40 即 0~4 秒） */
async function openMatch(delayTicks, rounds = 3) {
  const A = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const B = await browser.newPage({ viewport: { width: 430, height: 900 } });
  for (const p of [A, B]) {
    p.on('pageerror', e => console.log('   pageerror:', e.message));
  }
  await A.goto(URL, { waitUntil: 'domcontentloaded' });
  await B.goto(URL, { waitUntil: 'domcontentloaded' });

  await A.getByText('我是家长').click();
  // 打开高级设置，设置延迟与题数
  await A.locator('#btnAdv').click();
  await A.evaluate(([d, r]) => {
    const dr = document.getElementById('delayRange');
    dr.value = String(d); dr.dispatchEvent(new Event('input'));
    const rr = document.getElementById('roundsRange');
    rr.value = String(r); rr.dispatchEvent(new Event('input'));
  }, [delayTicks, rounds]);

  await A.locator('#btnCreate').click();
  await A.waitForSelector('#wait.active', { timeout: 10000 });
  const code = (await A.locator('#codeBig').textContent()).trim();

  await B.getByText('我是孩子').click();
  await B.locator('#inCode').fill(code);
  await B.locator('#btnJoin').click();

  await A.waitForSelector('#game.active', { timeout: 15000 });
  await B.waitForSelector('#game.active', { timeout: 15000 });
  return [A, B, code];
}

/** 家长页第一题的作答结果：返回被服务端回执染色的按钮数 */
async function paintedCount(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#answers .ans')].filter(b =>
      b.classList.contains('correct') || b.classList.contains('wrong')).length);
}

/* ────────────────── 场景 1：延迟 0 秒，家长必须立刻可答 ────────────────── */
console.log('\n── 场景 1：家长延迟 0 秒（完全公平模式）──');
{
  const [A, B] = await openMatch(0, 3);

  // 等第一题渲染完
  await A.waitForFunction(() => document.querySelectorAll('#answers .ans').length === 4, null, { timeout: 15000 });

  const bannerTxt = (await A.locator('#banner').textContent()).trim();
  check(!/解锁/.test(bannerTxt), '延迟0秒不应提示「等待解锁」', `banner="${bannerTxt}"`);

  // 立刻点第一个选项（不做任何等待）
  await A.locator('#answers .ans').first().click();
  await wait(1200);

  const painted = await paintedCount(A);
  check(painted > 0, '延迟0秒：家长点选项后应收到判定回执', `染色按钮 ${painted} 个`);

  const cls = await A.locator('#answers .ans').first().getAttribute('class');
  check(/correct|wrong/.test(cls || ''), '延迟0秒：作答被服务端受理（按钮已染对/错色）', `class="${cls}"`);

  await A.close(); await B.close();
}

/* ────────────────── 场景 2：延迟 3 秒，锁定期点击应被拒 ────────────────── */
console.log('\n── 场景 2：家长延迟 3 秒 ──');
{
  const [A, B] = await openMatch(30, 3);

  await A.waitForFunction(() => document.querySelectorAll('#answers .ans').length === 4, null, { timeout: 15000 });

  const bannerTxt = (await A.locator('#banner').textContent()).trim();
  check(/解锁/.test(bannerTxt), '延迟3秒应提示等待解锁', `banner="${bannerTxt}"`);

  // 锁定期内点击：不应提交
  await A.locator('#answers .ans').first().click();
  await wait(400);
  const paintedLocked = await paintedCount(A);
  check(paintedLocked === 0, '锁定期点击不应被提交', `染色按钮 ${paintedLocked} 个`);

  // 等解锁事件（不靠固定 sleep，避免机器快慢导致误判）
  // 判据用真实状态：家长卡片是否还带 locked 样式，而不是猜文案
  let unlocked = true;
  await A.waitForFunction(
    () => !document.getElementById('plP').classList.contains('locked'),
    null, { timeout: 8000 }
  ).catch(() => { unlocked = false; });
  const banner2 = (await A.locator('#banner').textContent()).trim();
  check(unlocked, '延迟结束后家长应解除锁定', `banner="${banner2}"`);
  check(/抢答|公平模式/.test(banner2), '解锁后 banner 应提示可以抢答', `banner="${banner2}"`);

  await A.locator('#answers .ans').nth(1).click();
  await wait(1200);
  const paintedUnlocked = await paintedCount(A);
  check(paintedUnlocked > 0, '解锁后家长作答应被受理', `染色按钮 ${paintedUnlocked} 个`);

  await A.close(); await B.close();
}

await browser.close();
console.log('\n════════ 结果 ════════');
if (fail.length) {
  console.log(`❌ ${fail.length} 项失败：`);
  fail.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log('✅ 延迟边界全部符合预期');
