/**
 * 真实浏览器 E2E：验证双端对战 + 复盘面板 + 同屏对战 + 极速60秒 + 档案同步卡片
 * 依赖：npm i -D playwright（用系统 Edge，channel: 'msedge'）
 * 用法：node scripts/e2e-ui.mjs
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
const log = (...a) => console.log(...a);
const fail = [];
const check = (cond, msg) => { log((cond ? '✅ ' : '❌ ') + msg); if (!cond) fail.push(msg); };

const browser = await chromium.launch({ channel: 'msedge' });

/* ---------------- A. 双端对战 + 复盘 ---------------- */
const A = await browser.newPage({ viewport: { width: 430, height: 900 } });
const B = await browser.newPage({ viewport: { width: 430, height: 900 } });
const errors = [];
for (const [name, p] of [['A', A], ['B', B]]) {
  p.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
}

await A.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await B.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

// 首页扩展入口是否注入成功
const modes = await A.locator('#extraModes button').count();
check(modes === 3, `首页「更多玩法」入口 ${modes} 个（应为 3）`);

// 家长创建房间，题数调到 4 题
await A.getByText('我是家长').click();
await A.evaluate(() => {
  const r = document.getElementById('roundsRange');
  r.value = '4';
  r.dispatchEvent(new Event('input'));
});
await A.locator('#btnCreate').click();
await A.waitForSelector('#wait.active', { timeout: 10000 });
const code = (await A.locator('#codeBig').textContent()).trim();
log('   房间码：' + code);

await B.getByText('我是孩子').click();
await B.locator('#inCode').fill(code);
await B.locator('#btnJoin').click();
await A.waitForSelector('#game.active', { timeout: 15000 });
await B.waitForSelector('#game.active', { timeout: 15000 });
check(true, '双端进入对战界面');

// 逐题作答：孩子全对、家长全错
for (let i = 0; i < 4; i++) {
  await B.waitForFunction(n => {
    const el = document.getElementById('roundInfo');
    return el && el.textContent.includes(n + '/');
  }, i + 1, { timeout: 20000 });
  const qText = await B.locator('#qtext').textContent();
  const truth = answerOf(qText.trim());
  const opts = await B.locator('#answers .ans').allTextContents();
  const wrongIdx = opts.findIndex(o => o.trim() !== truth);

  await wait(700);
  await B.locator('#answers .ans').nth(opts.findIndex(o => o.trim() === truth)).click();
  await wait(1700);   // 等家长解锁
  if (wrongIdx >= 0) await A.locator('#answers .ans').nth(wrongIdx).click();
  await wait(500);
}

await A.waitForSelector('#end.active', { timeout: 25000 });
const reviewText = await A.locator('#reviewCard').innerText().catch(() => '');
check(reviewText.includes('本局复盘'), '结算页出现复盘面板');
check(reviewText.includes('薄弱知识点') || reviewText.includes('答对'), '复盘包含统计/薄弱项');
check(/给家长的建议/.test(reviewText), '复盘包含给家长的建议');
check(reviewText.includes('逐题明细'), '复盘包含逐题明细');
await A.screenshot({ path: './shot-review.png' });

const scoreTxt = await A.locator('#fC').textContent();
check(scoreTxt.trim() === '4', `孩子得分显示 ${scoreTxt}（应为 4）`);

/* ---------------- B. 同屏对战 ---------------- */
await B.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await B.locator('#extraModes button').nth(0).click();
await B.waitForSelector('#duoSetup.active', { timeout: 8000 });
await B.getByText('开始对战').click();
await B.waitForSelector('#duoPlay.active', { timeout: 15000 });
const duoQ = (await B.locator('#duoText').textContent()).trim();
const duoTruth = answerOf(duoQ);
const childBtns = await B.locator('#duoCAns button').allTextContents();
const k = childBtns.findIndex(t => t.trim() === duoTruth);
await B.locator('#duoCAns button').nth(k).click();
await wait(400);
const duoScore = await B.locator('#duoC').textContent();
check(duoScore.trim() === '1', `同屏对战：孩子答对后得分 ${duoScore}（应为 1）`);
await B.screenshot({ path: './shot-duo.png' });

/* ---------------- C. 极速 60 秒 ---------------- */
await B.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await B.locator('#extraModes button').nth(2).click();
await B.waitForSelector('#combo.active', { timeout: 10000 });
await B.waitForSelector('#cbAns .ans', { timeout: 10000 });
for (let i = 0; i < 3; i++) {
  const t = (await B.locator('#cbText').textContent()).trim();
  const truth = answerOf(t);
  const labels = await B.locator('#cbAns .ans').allTextContents();
  const idx = labels.findIndex(x => x.trim() === truth);
  if (idx >= 0) await B.locator('#cbAns .ans').nth(idx).click();
  await wait(700);
}
const cbScore = await B.locator('#cbScore').textContent();
const cbMult = await B.locator('#cbMult').textContent();
check(Number(cbScore) > 0, `极速模式得分 ${cbScore}（应 > 0）`);
check(Number(cbMult) > 1, `连击倍率 ${cbMult}（应 > 1.0）`);
await B.screenshot({ path: './shot-combo.png' });

/* ---------------- D. 档案同步卡片 ---------------- */
await B.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await B.getByText('📊 我的档案').click();
await B.waitForSelector('#profile.active', { timeout: 8000 });
const hasSync = await B.locator('#syncCard').count();
check(hasSync === 1, '档案页出现「跨设备同步」卡片');
await B.getByText('生成同步码').click();
await wait(1200);
const syncTxt = await B.locator('#syncCard').innerText();
const codeMatch = syncTxt.match(/同步码：\s*([A-Z0-9]{6})/);
check(!!codeMatch, '生成并显示 6 位同步码：' + (codeMatch ? codeMatch[1] : '无'));
await B.screenshot({ path: './shot-sync.png' });

// 服务端是否真的存下这份档案
if (codeMatch) {
  const r = await fetch('http://localhost:3000/api/profile/' + codeMatch[1]);
  check(r.ok, '服务端已存储该同步码的档案（HTTP ' + r.status + '）');
}

/* ---------------- 结果 ---------------- */
log('\n页面错误：' + (errors.length ? errors.join(' | ') : '无'));
check(errors.length === 0, '无 JS 运行时报错');
await browser.close();
log(fail.length ? `\n❌ 失败 ${fail.length} 项：\n - ` + fail.join('\n - ') : '\n✅ 全部 UI 检查通过');
process.exit(fail.length ? 1 : 0);
