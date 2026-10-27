/**
 * 档案一致性校验（真实浏览器）
 * ---------------------------------------------------------------
 * 校验「总账」和「明细」两套统计是否对得上，这两个曾经是脱节的：
 *
 *   A. 双人对战：每题的科目/每日明细都记了，但总答题数(totalQ)没加
 *      → 正确率的分母偏小，学情页上下两块数据自相矛盾
 *   B. 同屏对战：saveProfile(旧快照) 在 bumpDaily / awardGameXP 之后执行
 *      → 每日任务进度和 XP 被覆盖回写，等于白打
 *
 * 用法：node scripts/e2e-profile-consistency.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANK = new Map();
for (const q of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'questions.json'), 'utf8'))) {
  BANK.set(q.text, q.options[q.correct]);
}
const answerOf = t => BANK.get(t) || '';
const wait = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = (cond, msg, extra = '') => {
  console.log((cond ? '✅ ' : '❌ ') + msg + (extra ? `  ${extra}` : ''));
  if (!cond) fail.push(msg + (extra ? ` (${extra})` : ''));
};

/** 读当前孩子档案（与页面内 activeChild 一致），并带上诊断信息 */
const readProfile = async page => {
  const r = await page.evaluate(() => {
    const child = (typeof activeChild === 'function') ? activeChild() : null;
    const key = 'klt_profile_' + child;
    const all = Object.keys(localStorage).filter(k => k.startsWith('klt_profile_'));
    let data = {};
    try { data = JSON.parse(localStorage.getItem(key)) || {}; } catch { }
    return { child, key, all, data };
  });
  r.diag = `child=${r.child} 档案键=${r.all.join(',')}`;
  return r;
};

const browser = await chromium.launch({ channel: 'msedge' });

/* ══════════════ A. 双人对战：总账必须跟着明细一起长 ══════════════ */
console.log('\n── A. 双人对战：totalQ / totalCorrect 是否同步 ──');
{
  const A = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const B = await browser.newPage({ viewport: { width: 430, height: 900 } });
  A.on('pageerror', e => console.log('   [A pageerror]', e.message));
  B.on('pageerror', e => console.log('   [B pageerror]', e.message));
  await A.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await B.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });

  const before = await readProfile(A);
  const ROUNDS = 5;   // 滑块 min=5，低于 5 会被浏览器钳制

  await A.getByText('我是家长').click();
  await A.locator('#btnAdv').click();
  await A.evaluate(n => {
    const d = document.getElementById('delayRange'); d.value = '0'; d.dispatchEvent(new Event('input'));
    const r = document.getElementById('roundsRange'); r.value = String(n); r.dispatchEvent(new Event('input'));
  }, ROUNDS);
  await A.locator('#btnCreate').click();
  await A.waitForSelector('#wait.active', { timeout: 10000 });
  const code = (await A.locator('#codeBig').textContent()).trim();

  await B.getByText('我是孩子').click();
  await B.locator('#inCode').fill(code);
  await B.locator('#btnJoin').click();
  await A.waitForSelector('#game.active', { timeout: 15000 });
  await B.waitForSelector('#game.active', { timeout: 15000 });

  // 双方都答对（延迟 0 秒，家长可立即作答）
  const ready = n => {
    const el = document.getElementById('roundInfo');
    return !!el && el.textContent.includes(`第 ${n}/`);
  };
  for (let i = 0; i < ROUNDS; i++) {
    // 对局可能已结束（前一轮等超时导致滞后），别再去点不可见的按钮
    if (await A.locator('#end.active').count()) break;

    const okA = await A.waitForFunction(ready, i + 1, { timeout: 6000 }).then(() => true).catch(() => false);
    if (!okA) break;                       // 跳题或已结束，剩余交给超时逻辑
    await B.waitForFunction(ready, i + 1, { timeout: 6000 }).catch(() => { });

    const qt = (await A.locator('#qtext').textContent()).trim();
    const truth = answerOf(qt);
    const opts = await A.locator('#answers .ans').allTextContents();
    const idx = opts.findIndex(o => o.trim() === truth);
    if (idx < 0) continue;
    // 短超时 + 失败容忍：点击落在 reveal 阶段会被前端 pointer-events 拦下，
    // 这里只需保证「尽力作答」，一致性断言不依赖每一题都点中
    await A.locator('#answers .ans').nth(idx).click({ timeout: 2500 }).catch(() => { });
    await B.locator('#answers .ans').nth(idx).click({ timeout: 2500 }).catch(() => { });
    await wait(600);
  }

  // 最坏情况：5 题全部走满 15 秒超时 ≈ 90s，等待窗口必须留够，
  // 否则会在对局中途读档案，得到「totalQ 没涨」的假失败
  let ended = true;
  await A.waitForSelector('#end.active', { timeout: 180000 }).catch(() => { ended = false; });
  check(ended, '对战应在合理时间内结束并进入结算页');
  const after = await readProfile(A);
  // 结算页上家长的实际得分：作为 totalCorrect 的独立参照
  const shownParent = Number((await A.locator('#fP').textContent().catch(() => '0')).trim()) || 0;

  const sumSubj = p => Object.values(p.subj || {}).reduce((s, x) => s + (x.q || 0), 0);
  const b0 = before.data, a0 = after.data;
  const dQ = (a0.totalQ || 0) - (b0.totalQ || 0);
  const dC = (a0.totalCorrect || 0) - (b0.totalCorrect || 0);
  const dSubjQ = sumSubj(a0) - sumSubj(b0);
  console.log(`   ${before.diag} | before(totalQ=${b0.totalQ || 0}) after(totalQ=${a0.totalQ || 0})`);

  check(dQ === ROUNDS, `对战 ${ROUNDS} 题后 totalQ 应 +${ROUNDS}`, `实际 +${dQ}`);
  check(dSubjQ === ROUNDS, `分科目明细应 +${ROUNDS}`, `实际 +${dSubjQ}`);
  check(dQ === dSubjQ,
    '总答题数与分科目明细的增量必须一致（两块统计不能脱节）',
    `totalQ +${dQ} vs 明细 +${dSubjQ}`);
  check(dC === shownParent,
    '总答对数应等于结算页得分',
    `档案 +${dC} vs 结算页 ${shownParent}`);

  await A.close(); await B.close();
}

/* ══════════════ B. 同屏对战：每日进度与 XP 不能被旧快照覆盖 ══════════════ */
console.log('\n── B. 同屏对战：daily / XP 是否落盘 ──');
{
  const P = await browser.newPage({ viewport: { width: 430, height: 900 } });
  P.on('pageerror', e => console.log('   [P pageerror]', e.message));
  await P.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });

  const before = await readProfile(P);
  const bd = before.data;
  const baseDaily = (bd.daily && bd.daily.date === new Date().toISOString().slice(0, 10))
    ? (bd.daily.correct || 0) : 0;
  const baseXp = (bd.xp && bd.xp.mix) || 0;

  await P.locator('#extraModes button').nth(0).click();
  await P.waitForSelector('#duoSetup.active', { timeout: 8000 });
  await P.getByText('开始对战').click();
  await P.waitForSelector('#duoPlay.active', { timeout: 15000 });

  // 同屏对战固定 10 题，孩子与家长各答一次
  for (let i = 0; i < 10; i++) {
    try {
      await P.waitForFunction(n => {
        const el = document.getElementById('duoRound');
        return el && el.textContent.startsWith(`${n}/`);
      }, i + 1, { timeout: 15000 });
    } catch { break; }

    const qt = (await P.locator('#duoText').textContent().catch(() => '')).trim();
    const truth = answerOf(qt);
    const cBtns = await P.locator('#duoCAns button').allTextContents().catch(() => []);
    const ci = cBtns.findIndex(t => t.trim() === truth);
    if (ci >= 0) await P.locator('#duoCAns button').nth(ci).click({ timeout: 5000 }).catch(() => { });
    await wait(250);
    const pBtns = await P.locator('#duoPAns button').allTextContents().catch(() => []);
    const pi = pBtns.findIndex(t => t.trim() === truth);
    if (pi >= 0) await P.locator('#duoPAns button').nth(pi).click({ timeout: 5000 }).catch(() => { });
    await wait(450);
  }
  await wait(1200);

  const after = await readProfile(P);
  const ad = after.data;
  const dailyCorrect = (ad.daily && ad.daily.correct) || 0;
  const xpMix = (ad.xp && ad.xp.mix) || 0;

  check(dailyCorrect > baseDaily, '同屏对战应累计每日「答对」进度', `前 ${baseDaily} → 后 ${dailyCorrect}`);
  check(xpMix > baseXp, '同屏对战应发放 XP', `前 ${baseXp} → 后 ${xpMix}`);
  check((ad.totalQ || 0) > (bd.totalQ || 0), '同屏对战应累计总答题数', `${bd.totalQ || 0} → ${ad.totalQ || 0}`);

  await P.close();
}

await browser.close();
console.log('\n════════ 结果 ════════');
if (fail.length) {
  console.log(`❌ ${fail.length} 项失败：`);
  fail.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log('✅ 档案总账与明细一致，每日进度与 XP 未丢失');
