/* 学情分析 + 错题分组练 E2E（真实 Edge）
 * 玩法：注入一份"有历史"的档案，验证掌握度分级、最该练排序、练这组只出该知识点题。
 * 跑法：node scripts/e2e-study.mjs  （需先启动服务） */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });

const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text());
});

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

/* 造一份可预期的档案：周长反复错、形近字待突破、面积已掌握、分数刚接触 */
const now = Date.now();
const profile = {
  xp: { mix: 320 }, games: 5, totalQ: 60, totalCorrect: 42, perfect: 0, bestStreak: 4,
  badges: [], totalSec: 900,
  wrongs: [
    { subj: '数学', text: '长方形长 6 厘米、宽 3 厘米，周长是多少？', options: ['18 厘米', '9 厘米', '27 厘米', '12 厘米'], correct: '18 厘米', kp: '周长', times: 3, at: now },
    { subj: '数学', text: '一个正方形的边长是 5 厘米，面积是多少？', options: ['25 平方厘米', '20 平方厘米', '10 平方厘米', '55 平方厘米'], correct: '25 平方厘米', kp: '面积', times: 1, at: now - 1000 },
    { subj: '语文', text: '「拔」和「拨」哪个是「拔河」的字？', options: ['拔', '拨', '跋', '钹'], correct: '拔', kp: '形近字', times: 1, at: now - 2000 },
  ],
  kpStat: {
    '数学|周长': { subj: '数学', kp: '周长', q: 10, c: 6, at: now },      // 60% → 巩固中
    '数学|面积': { subj: '数学', kp: '面积', q: 8, c: 8, at: now },       // 100% → 已掌握
    '数学|分数': { subj: '数学', kp: '分数', q: 2, c: 0, at: now },       // q<3 → 刚接触
    '语文|形近字': { subj: '语文', kp: '形近字', q: 5, c: 2, at: now },   // 40% → 待突破
    '英语|词汇·家庭': { subj: '英语', kp: '词汇·家庭', q: 6, c: 6, at: now }, // 已掌握
  },
  subj: { 数学: { q: 20, c: 14 }, 语文: { q: 20, c: 12 }, 英语: { q: 20, c: 16 } },
  hist: {},
};
for (let i = 0; i < 3; i++) {
  const d = new Date(); d.setDate(d.getDate() - i);
  profile.hist[d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()] = { q: 10, c: 7, sec: 300 };
}

await p.addInitScript(([prof]) => {
  localStorage.setItem('klt_active_child', '测试娃');
  localStorage.setItem('klt_profile_测试娃', prof);
}, [JSON.stringify(profile)]);

await p.goto(BASE, { waitUntil: 'networkidle' });

console.log('\n▸ 打开学情分析');
await p.evaluate(() => window.openStudy());
await p.waitForSelector('#study.active', { timeout: 8000 });
await p.waitForTimeout(600);

const summary = await p.locator('#stSummary').textContent();
console.log('  摘要：', summary);
ok('摘要显示累计题数与正确率', /累计 60 题/.test(summary) && /70%/.test(summary), summary);
ok('摘要显示连续学习天数', /连续 3 天/.test(summary), summary);

const body = await p.locator('#stBody').innerText();
ok('掌握度总览：已掌握 2 个', /已掌握\s*2/.test(body), body.slice(0, 120));
ok('掌握度总览：待突破 1 个', /待突破\s*1/.test(body));
ok('掌握度总览：巩固中 1 个', /巩固中\s*1/.test(body));
ok('掌握度总览：刚接触 1 个', /刚接触\s*1/.test(body));
ok('掌握度包含"还没练"的知识点（对照课程表）', /还没练\s*[1-9]\d*/.test(body));

// 最该练：周长（错3次 + 60%）应排第一
const topCard = p.locator('#stBody .card').nth(1);
const topText = await topCard.innerText();
console.log('\n▸ 最该练（前 3 行）\n' + topText.split('\n').slice(0, 6).map(l => '  ' + l).join('\n'));
ok('第一条是「数学·周长」（错得最多）', /1\.\s*数学·周长/.test(topText), topText.split('\n')[1]);
ok('显示"反复错 3 次"', /反复错 3 次/.test(topText));

// 点第一组「练这组」，验证只出该知识点的题
const firstBtn = topCard.locator('button', { hasText: '练这组' }).first();
await firstBtn.click();
await p.waitForSelector('#solo.active', { timeout: 10000 });
await p.waitForSelector('#soloAns .ans', { timeout: 10000 });
await p.waitForTimeout(400);

const kpInfo = await p.evaluate(() => ({
  title: document.getElementById('soloTitle').textContent,
  pool: (typeof soloPool !== 'undefined' && soloPool ? soloPool : []).map(q => q.kp),
  len: (typeof soloPool !== 'undefined' && soloPool ? soloPool.length : 0),
}));
console.log('  练习标题：', kpInfo.title, '| 题量：', kpInfo.len, '| 知识点：', [...new Set(kpInfo.pool)].join(','));
ok('专项练习标题带知识点', /周长/.test(kpInfo.title), kpInfo.title);
ok('题目都在同一知识点内', kpInfo.pool.length > 0 && kpInfo.pool.every(k => k === '周长'), JSON.stringify(kpInfo.pool));
ok('题量不超过 10', kpInfo.len <= 10, String(kpInfo.len));

// 错题本分组
console.log('\n▸ 错题本分组');
await p.evaluate(() => window.openProfile());
await p.waitForSelector('#profile.active', { timeout: 8000 });
await p.waitForTimeout(400);
const groups = await p.locator('#profWrongList details').count();
const profText = await p.locator('#profWrongList').innerText();
ok('错题本按知识点分成 3 组', groups === 3, String(groups));
ok('分组显示"数学·周长"', /数学·周长/.test(profText), profText.slice(0, 100));
ok('分组显示"累计错 3 次"（折叠状态也看得到）', /累计错 3 次/.test(profText), profText.slice(0, 160));
ok('每组都有「练这组」按钮', await p.locator('#profWrongList button', { hasText: '练这组' }).count() === 3,
  String(await p.locator('#profWrongList button', { hasText: '练这组' }).count()));
ok('底部有"错题全册连练"和"学情分析"入口',
  await p.locator('#profWrong .profBtnRow button').count() === 2);

// 从错题本分组点练这组 → 仍只出该 kp
await p.locator('#profWrongList details').nth(2).locator('button', { hasText: '练这组' }).click();
await p.waitForSelector('#solo.active', { timeout: 10000 });
await p.waitForTimeout(600);
const kp2 = await p.evaluate(() => ({
  title: document.getElementById('soloTitle').textContent,
  pool: (typeof soloPool !== 'undefined' && soloPool ? soloPool : []).map(q => q.kp),
}));
ok('从错题本点"练这组"也锁定同一知识点',
  kp2.pool.length > 0 && new Set(kp2.pool).size === 1 && kp2.title.includes(kp2.pool[0]),
  kp2.title + ' / ' + JSON.stringify([...new Set(kp2.pool)]));

// 家长看板入口
await p.evaluate(() => window.openDashboard());
await p.waitForSelector('#dashboard.active', { timeout: 8000 });
await p.waitForTimeout(500);
const dbText = await p.locator('#dbBody').innerText();
ok('看板出现知识点学情入口', /知识点学情/.test(dbText) && /打开学情分析/.test(dbText));

await p.evaluate(() => window.openStudy());
await p.waitForTimeout(500);
await p.screenshot({ path: './docs/study-analysis.png', fullPage: false });

console.log('\nERRORS:', errs.length ? errs.join(' | ') : 'none');
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await b.close();
if (fail || errs.length) process.exitCode = 1;
