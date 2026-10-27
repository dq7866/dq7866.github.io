/**
 * 回归自测：把本轮修掉的几个真 bug 钉死，防止回归。
 *
 * 覆盖：
 *   1. 静态服务目录穿越（public 前缀兄弟目录）
 *   2. 知识点(kp)过滤不被补足逻辑绕过
 *   3. 管理员口令哈希存储 + 旧明文文件自动升级
 *   4. 登录失败限流
 *   5. 档案写入不互相覆盖（单人结算的每日任务进度）
 *
 * 用法：node scripts/test-security.mjs [baseUrl]
 * 需要服务端已启动（默认 http://localhost:3000）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = process.argv[2] || 'http://localhost:3000';

let pass = 0, fail = 0;
const ok = (cond, msg, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + msg + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + msg + (extra ? '  ' + extra : '')); }
};
const group = t => console.log('\n── ' + t + ' ──');

/* ───────────── 1. 静态服务目录穿越 ───────────── */
group('静态服务：目录穿越必须被挡住');
{
  const evilDir = path.join(ROOT, 'public_evil_test');
  fs.mkdirSync(evilDir, { recursive: true });
  fs.writeFileSync(path.join(evilDir, 'x.txt'), 'SECRET');
  try {
    // 用 %2e%2e 编码，避免 curl/浏览器先把 .. 归一化掉
    const r = await fetch(BASE + '/%2e%2e%2fpublic_evil_test%2fx.txt');
    const body = await r.text();
    ok(r.status === 403 || !body.includes('SECRET'),
      'public_evil_test/x.txt 读不到（兄弟目录前缀绕过已堵住）', `HTTP ${r.status}`);
  } finally {
    fs.rmSync(evilDir, { recursive: true, force: true });
  }

  // 上层目录同样读不到
  const r2 = await fetch(BASE + '/%2e%2e%2fpackage.json');
  ok(r2.status === 403, 'package.json（上一层）读不到', `HTTP ${r2.status}`);

  // 正常静态资源仍然可用
  const r3 = await fetch(BASE + '/');
  ok(r3.status === 200, '首页仍然可访问', `HTTP ${r3.status}`);
  const r4 = await fetch(BASE + '/extra.js');
  ok(r4.status === 200, 'extra.js 仍然可访问', `HTTP ${r4.status}`);
}

/* ───────────── 2. 知识点过滤 ───────────── */
group('知识点过滤：只出该知识点的题');
{
  const get = async q => (await fetch(BASE + '/api/questions?' + q)).json();

  // 存在的知识点：结果必须全是这个 kp
  const okKp = await get('grade=1&subject=' + encodeURIComponent('数学') + '&kp=' + encodeURIComponent('加减法') + '&n=10');
  const kpSet = [...new Set(okKp.map(x => x.kp))];
  ok(okKp.length > 0 && kpSet.length === 1 && kpSet[0] === '加减法',
    '存在的 kp 返回的题全是该知识点', `${okKp.length} 题 · ${JSON.stringify(kpSet)}`);

  // 不存在的知识点：不能拿别的知识点充数
  const badKp = await get('grade=1&subject=' + encodeURIComponent('数学') + '&kp=' + encodeURIComponent('不存在的知识点XYZ') + '&n=10');
  const badSet = [...new Set(badKp.map(x => x.kp))];
  ok(badSet.every(k => k === '不存在的知识点XYZ'),
    '不存在的 kp 不会返回其它知识点的题', `${badKp.length} 题 · ${JSON.stringify(badSet)}`);

  // 题干重复不能出现
  const texts = okKp.map(x => x.text);
  ok(new Set(texts).size === texts.length, '同一批题里没有重复题干', `${texts.length} 题`);

  // 每个题的 correct 必须在选项范围内
  ok(okKp.every(x => Number.isInteger(x.correct) && x.correct >= 0 && x.correct < x.options.length),
    'correct 下标都落在选项范围内');
}

/* ───────────── 3. 管理员口令 ───────────── */
group('管理员口令：哈希存储');
{
  const authFile = path.join(ROOT, 'data', 'admin', 'auth.json');
  const rec = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  ok(typeof rec.password !== 'string', 'auth.json 里没有明文口令');
  ok(rec.algo === 'scrypt' && !!rec.salt && !!rec.hash, '口令以 scrypt+salt 形式存储');

  // 正确口令可登录（用独立来源 IP，避开限流测试的锁定）
  const pw = process.env.ADMIN_PASSWORD || 'admin123';
  const ip = 'pwtest-' + Date.now();
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ password: pw }),
  });
  const d = await r.json().catch(() => ({}));
  ok(r.status === 200 && !!d.token, '正确口令可以登录', `HTTP ${r.status}`);

  // 错误口令被拒
  const r2 = await fetch(BASE + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ password: 'wrong-password-' + Date.now() }),
  });
  ok(r2.status === 401, '错误口令被拒绝', `HTTP ${r2.status}`);
}

/* ───────────── 4. 登录限流 ───────────── */
group('登录限流：连续失败后锁定');
{
  // 放到最后测：它会把来源 IP 锁 5 分钟，测完再跑其它用例会撞上 429。
  // 用 X-Forwarded-For 区分来源，避免影响同机的其它用例。
  const ip = 'ratelimit-' + Date.now();
  let blocked = false, lastStatus = 0;
  // 阈值与服务端一致（LOGIN_MAX=10），多发几次确保越过阈值
  for (let i = 0; i < 14; i++) {
    const r = await fetch(BASE + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ password: 'bad-' + ip }),
    });
    lastStatus = r.status;
    if (r.status === 429) { blocked = true; break; }
  }
  ok(blocked, '连续失败后触发限流（429）', `最后一次 HTTP ${lastStatus}`);

  // 换个来源 IP 不应被牵连
  const r2 = await fetch(BASE + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': 'other-' + Date.now() },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || 'admin123' }),
  });
  ok(r2.status === 200, '其它来源 IP 不受影响', `HTTP ${r2.status}`);
}

/* ───────────── 5. 档案写入互不覆盖 ───────────── */
group('档案写入：多处修改不能互相覆盖');
{
  // 忠实复刻早先 soloEnd 的写法：
  //   const p = loadProfile();        // ← 快照（此时 daily 计数还是 0）
  //   bumpDaily('soloRounds', 1);     // ← 内部自己 load→改→save，daily 变成 1
  //   bumpDaily('correct', 8);        // ← daily 变成 (1, 8)
  //   saveProfile(p);                 // ← 旧快照回写，daily 被打回 (0, 0)
  const legacyDaily = (() => {
    const store = { daily: { date: '2026-01-01', soloRounds: 0, correct: 0, wins: 0, claims: [] } };
    const load = () => JSON.parse(JSON.stringify(store));
    const save = p => { store.daily = p.daily; };
    const bumpDaily = (key, n) => { const p = load(); p.daily[key] = (p.daily[key] || 0) + n; save(p); };
    const snapshot = load();           // 结算前的快照：daily 还是 0
    bumpDaily('soloRounds', 1);
    bumpDaily('correct', 8);
    save(snapshot);                   // ← 旧快照回写，覆盖掉上面的 bump
    return store.daily;
  })();
  ok(legacyDaily.soloRounds === 0 && legacyDaily.correct === 0,
    '复现旧写法确实会丢进度（说明这条测试有意义）', JSON.stringify(legacyDaily));

  // 新写法：全部走 mutateProfile（读一次 → 改 → 写一次）
  const newDaily = (() => {
    const store = { daily: { date: '2026-01-01', soloRounds: 0, correct: 0, wins: 0, claims: [] } };
    const load = () => JSON.parse(JSON.stringify(store));
    const save = p => { store.daily = p.daily; };
    const mutateProfile = fn => { const p = load(); fn(p); save(p); return p; };
    mutateProfile(p => {
      p.daily.soloRounds = (p.daily.soloRounds || 0) + 1;
      p.daily.correct = (p.daily.correct || 0) + 8;
    });
    return store.daily;
  })();
  ok(newDaily.soloRounds === 1 && newDaily.correct === 8,
    '新写法（单一写入入口）不丢进度', JSON.stringify(newDaily));

  // 真实页面：走真实的单人结算路径，确认每日任务进度确实落盘
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      // 造一个干净的档案，只留这一项统计
      localStorage.setItem('klt_profile_回归测试', JSON.stringify({
        xp: { mix: 0 }, games: 0, totalQ: 0, totalCorrect: 0, perfect: 0, bestStreak: 0,
        wrongs: [], badges: [], subj: {}, hist: {}, kpStat: {}, totalSec: 0,
      }));
      localStorage.setItem('klt_active_child', '回归测试');
    });
    await page.reload({ waitUntil: 'networkidle' });

    // 直接驱动结算路径（soloEnd），避免真答 10 题要 150 秒
    await page.evaluate(() => {
      soloPool = [
        { subj: '数学', text: '1+1=？', options: ['2', '3', '4', '5'], correct: 0, kp: '加减法' },
        { subj: '数学', text: '2+2=？', options: ['3', '4', '5', '6'], correct: 1, kp: '加减法' },
        { subj: '数学', text: '3+3=？', options: ['5', '6', '7', '8'], correct: 1, kp: '加减法' },
      ];
      soloIdx = 3;
      soloScore = 2;
      soloXP = 30;
      soloStreak = 2;
      soloWrongs = [{ subj: '数学', text: '3+3=？', correct: '6', options: ['5', '6', '7', '8'], kp: '加减法', at: Date.now() }];
      soloEnd();
    });
    await page.waitForSelector('#soloEnd.active', { timeout: 15000 });

    const after = await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('klt_profile_回归测试') || '{}');
      return { daily: p.daily, games: p.games, totalQ: p.totalQ, totalCorrect: p.totalCorrect, xp: (p.xp || {}).mix, wrongs: (p.wrongs || []).length };
    });
    const dk = new Date();
    const today = dk.getFullYear() + '-' + (dk.getMonth() + 1) + '-' + dk.getDate();
    const d = after.daily && after.daily.date === today ? after.daily : {};
    ok((d.soloRounds || 0) >= 1, '单人结算后每日「完成轮数」已累加', `soloRounds=${d.soloRounds}`);
    ok((d.correct || 0) >= 1, '单人结算后每日「答对题数」已累加', `correct=${d.correct}`);
    ok(after.games >= 1 && after.totalQ === 3, '单人结算后总账已累加', `games=${after.games} totalQ=${after.totalQ}`);
    ok(after.totalCorrect === 2, '总答对数正确', `totalCorrect=${after.totalCorrect}`);
    ok(after.xp >= 30, 'XP 已发放', `xp=${after.xp}`);
    ok(after.wrongs === 1, '错题已入档案', `wrongs=${after.wrongs}`);
    ok(errors.length === 0, '结算过程无 JS 报错', errors.join('; '));

    // 清理测试档案
    await page.evaluate(() => {
      localStorage.removeItem('klt_profile_回归测试');
      localStorage.setItem('klt_active_child', '孩子');
    });
    await page.close();
  } finally {
    await browser.close();
  }
}

console.log('\n════════ 结果 ════════');
console.log(`${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
