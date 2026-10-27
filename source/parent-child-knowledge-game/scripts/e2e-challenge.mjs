/**
 * E2E：错题挑战赛——预置错题本 → 挑战全对 → 验证错题被消灭 + 单人复盘出现
 * 用法：node scripts/e2e-challenge.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BANK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'questions.json'), 'utf8'))
  .filter(q => q.grade <= 3).slice(0, 40);
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = console.log;
const fail = [];
const check = (c, m) => { log((c ? '✅ ' : '❌ ') + m); if (!c) fail.push(m); };

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));

// 预置 3 道错题
const wrongs = BANK.slice(0, 3).map(q => ({
  subj: q.subj, text: q.text, options: q.options, correct: q.options[q.correct], kp: q.kp,
}));
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
await page.evaluate(w => {
  localStorage.clear();
  localStorage.setItem('klt_profile_孩子', JSON.stringify({
    xp: {}, games: 0, totalQ: 10, totalCorrect: 7, perfect: 0, bestStreak: 0,
    wrongs: w, badges: [], subj: {}, hist: {}, totalSec: 0,
  }));
}, wrongs);
await page.reload({ waitUntil: 'networkidle' });

await page.locator('#extraModes button').nth(1).click();
await page.waitForSelector('#solo.active', { timeout: 10000 });
log('   错题挑战已开始，题目数：' + await page.locator('#soloRound').textContent());

// 逐题答对
for (let i = 0; i < 3; i++) {
  await page.waitForSelector('#soloAns .ans', { timeout: 10000 });
  const t = (await page.locator('#soloText').textContent()).trim();
  const q = BANK.find(x => x.text.trim() === t);
  const truth = q ? q.options[q.correct] : null;
  const labels = await page.locator('#soloAns .ans').allTextContents();
  const idx = labels.findIndex(x => x.trim() === truth);
  await page.locator('#soloAns .ans').nth(idx).click();
  await wait(1700);
}

await page.waitForSelector('#soloEnd.active', { timeout: 20000 });
const review = await page.locator('#soloReviewCard').innerText().catch(() => '');
check(review.includes('本轮复盘'), '单人结算出现复盘面板');
const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('klt_profile_孩子')));
check(prof.wrongs.length === 0, `错题本剩余 ${prof.wrongs.length} 道（答对 3 道应全部消灭）`);
await page.screenshot({ path: './shot-challenge.png' });

log('\n页面错误：' + (errs.length ? errs.join(' | ') : '无'));
check(errs.length === 0, '无 JS 运行时报错');
await browser.close();
log(fail.length ? '❌ 有失败项' : '✅ 错题挑战全部通过');
process.exit(fail.length ? 1 : 0);
