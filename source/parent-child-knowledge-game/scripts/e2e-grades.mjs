import { chromium } from 'playwright';

const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('response', r => { if (r.status() >= 400) errs.push('http' + r.status() + ': ' + r.url()); });

await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

// 1) 年级/科目选项数量
const gCount = await p.locator('#gChips .chip').count();
const sChips = await p.locator('#sChips .chip').allTextContents();
console.log('首页年级选项:', gCount, '个 →', (await p.locator('#gChips .chip').allTextContents()).join(' '));
console.log('首页科目选项:', sChips.join(' '));
await p.screenshot({ path: './docs/shot-grades.png' });

// 2) 单人闯关：选六年级 + 品德，答一题
await p.locator('text=单人闯关').first().click();
await p.waitForTimeout(400);
await p.locator('#sgChips .chip[data-g="6"]').click();
await p.locator('#ssChips .chip[data-s="品德"]').click();
console.log('选中年级:', await p.locator('#sgChips .chip.on').textContent(), '科目:', await p.locator('#ssChips .chip.on').textContent());
await p.locator('text=开始闯关').first().click();
await p.waitForSelector('#solo.active', { timeout: 15000 });
await p.waitForSelector('#soloAns .ans', { timeout: 15000 });
await p.waitForTimeout(500);
console.log('六年级品德题目:', await p.locator('#soloText').textContent() + ' / ' + await p.locator('#soloSubj').textContent());
await p.screenshot({ path: './docs/shot-grade6-quiz.png' });
await p.locator('#soloAns .ans').first().click();
await p.waitForTimeout(1600);
console.log('作答后状态:', await p.evaluate(() => document.getElementById('soloStatus')?.textContent));

// 3) 对战创建房间：选五年级 + 科学
await p.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await p.locator('text=家长创建房间').first().click();
await p.waitForTimeout(300);
const rg = await p.locator('#gChips .chip').count();
console.log('对战页年级选项:', rg, '个');
await p.locator('#gChips .chip[data-g="5"]').click();
await p.locator('#sChips .chip[data-s="科学"]').click();
console.log('对战选中:', await p.locator('#gChips .chip.on').textContent(), await p.locator('#sChips .chip.on').textContent());

console.log('ERRORS:', errs.length ? errs.join(' | ') : 'none');
await b.close();
