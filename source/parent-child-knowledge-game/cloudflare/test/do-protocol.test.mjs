/**
 * 对战协议一致性测试
 *
 * 直接对 Durable Object 跑一遍前端用的消息协议：
 *   家长 connect → create → 收到 created（带房间码）
 *   孩子 connect → join  → 收到 joined/ready
 *   双方收到 round（选项只有文本，没有 correct）
 *   家长答对 → result(ok:true)
 *   收到 reveal（含正确答案）→ over（含复盘明细）
 *
 * 用本地 workerd 起真实 Worker，验证的是线上会跑的同一份代码。
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 8797;
// 必须用 127.0.0.1：localhost 在本机会优先解析 IPv6（::1），
// 而 wrangler dev 只监听 IPv4，导致连不上。
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) { pass++; console.log('  ✅', label); }
  else { fail++; console.log('  ❌', label, detail); }
};

/* ---------------------- 1. 打包 DO Worker ---------------------- */
const bundleDir = path.join(ROOT, 'room-worker', '.test-build');
fs.mkdirSync(bundleDir, { recursive: true });
const entry = path.join(bundleDir, 'index.js');
const shared = path.join(ROOT, 'shared', 'battle-room.js');
const core = path.join(ROOT, 'shared', 'bank-core.js');
const bank = path.join(ROOT, 'bank', 'questions.json');

// 把 shared 的模块改写成从本目录解析（保持相对路径结构）
fs.writeFileSync(path.join(bundleDir, 'shared.js'),
  fs.readFileSync(shared, 'utf8')
    .replace("'../bank/questions.json'", `'./questions.json'`)
    .replace("'./bank-core.js'", `'./core.js'`));
fs.writeFileSync(path.join(bundleDir, 'core.js'),
  fs.readFileSync(core, 'utf8'));
fs.writeFileSync(path.join(bundleDir, 'questions.json'), fs.readFileSync(bank, 'utf8'));

await build({
  stdin: {
    contents: `
      export { BattleRoom } from './shared.js';
      export default { async fetch() { return new Response('room'); } };
    `,
    resolveDir: bundleDir,
    loader: 'js',
  },
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  outfile: path.join(bundleDir, 'out.mjs'), logLevel: 'warning',
});
console.log('[test] DO Worker 已打包');

/* ---------------------- 2. 起本地 workerd ---------------------- */
// 直接调 wrangler 的 JS 入口：Windows 上 node_modules/.bin 下的 shim
// 在 spawn 时容易出现 ENOENT。
const wranglerCli = path.join(ROOT, '..', '..', '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const proc = spawn(process.execPath, [
  wranglerCli,
  'dev', '--port', String(PORT),
  '--config', path.join(ROOT, 'room-worker', 'wrangler.jsonc'),
], { cwd: path.join(ROOT, 'room-worker'), stdio: ['ignore', 'pipe', 'pipe'] });
proc.stdout.on('data', d => process.stdout.write('[wrangler] ' + d));
proc.stderr.on('data', d => process.stderr.write('[wrangler] ' + d));

const waitFor = async (fn, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return true; } catch { /* 重试 */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};

// 本机设了代理环境变量，Node 的 fetch 会走代理导致连不上本地服务。
// 这里用 node:http 直连，绕开代理。
import http from 'node:http';
const localGet = (p) => new Promise((resolve, reject) => {
  const req = http.get({ host: HOST, port: PORT, path: p, timeout: 5000 }, res => {
    let body = '';
    res.on('data', c => { body += c; });
    res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(new Error('timeout')); });
});

const up = await waitFor(async () => {
  const r = await localGet('/health');
  return r.ok;
});
if (!up) {
  console.error('❌ 本地 Worker 启动失败');
  proc.kill();
  process.exit(1);
}
console.log('[test] 本地 Worker 已启动');

/* ---------------------- 3. 跑一遍对局 ---------------------- */
const log = (...a) => console.log('   ', ...a);

const connect = (label) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://${HOST}:${PORT}/ws`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    inbox.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].match(m)) { waiters[i].resolve(m); waiters.splice(i, 1); }
    }
  });
  ws.addEventListener('error', reject);
  ws.addEventListener('open', () => resolve({
    ws, inbox,
    send: obj => ws.send(JSON.stringify(obj)),
    // 必须是「消费式」匹配：把已收到的消息从队列里取走，
    // 否则第 2 轮会命中第 1 轮遗留的 round，后续作答全部无效。
    next: (match, timeout = 20000) => new Promise((res, rej) => {
      const idx = inbox.findIndex(match);
      if (idx >= 0) return res(inbox.splice(idx, 1)[0]);
      const w = { match, resolve: res };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        rej(new Error('等待消息超时: ' + match.toString().slice(0, 60)));
      }, timeout);
    }),
    close: () => ws.close(),
  }));
});

try {
  console.log('\n── 对战房间协议 ──');
  const host = await connect('家长');
  const guest = await connect('孩子');

  // 1) 家长建房
  host.send({ type: 'create', grade: 3, subject: '数学', parentDelay: 0, rounds: 3 });
  const created = await host.next(m => m.type === 'created');
  ok(!!created.code && /^\d{4}$/.test(created.code), '家长建房收到 4 位房间码', JSON.stringify(created));

  // 2) 孩子加入
  guest.send({ type: 'join', code: created.code });
  const joined = await guest.next(m => m.type === 'joined');
  ok(!!joined, '孩子收到 joined');
  const readyHost = await host.next(m => m.type === 'ready');
  ok(!!readyHost, '家长收到 ready');
  const readyGuest = await guest.next(m => m.type === 'ready');
  ok(!!readyGuest, '孩子收到 ready');

  // 3) 出题（验证不下发 correct）
  const round1 = await host.next(m => m.type === 'round');
  ok(!!round1, '家长收到 round');
  ok(round1.options?.length === 4, 'round 含 4 个选项', JSON.stringify(round1.options?.length));
  ok(round1.options.every(o => typeof o.t === 'string'), '选项只有文本字段 t');
  ok(!('correct' in round1), 'round 不含 correct 字段（防作弊）');
  const round1g = await guest.next(m => m.type === 'round');
  ok(round1g.text === round1.text, '双方收到同一道题');

  // 4) 家长作答
  host.send({ type: 'answer', text: round1.options[0].t });
  const res = await host.next(m => m.type === 'result');
  ok(res.who === 'parent', 'result.who = parent');
  ok(typeof res.ok === 'boolean', 'result.ok 是布尔值');
  ok(typeof res.score === 'number', 'result.score 是数字');

  // 5) 孩子作答 → 触发 reveal
  guest.send({ type: 'answer', text: round1.options[1].t });
  const reveal = await host.next(m => m.type === 'reveal');
  ok(!!reveal.correct, 'reveal 带正确答案', JSON.stringify(reveal));
  const revealG = await guest.next(m => m.type === 'reveal');
  ok(!!revealG.correct, '孩子也收到 reveal');

  // 6) 走完 3 轮 → over
  //    每轮节奏：双方作答 → 1s 后 reveal → 2.6s 后下一题，
  //    所以最后一轮结束后还要等 nextRound 走到头才结算。
  for (let i = 2; i <= 3; i++) {
    const r = await host.next(m => m.type === 'round');
    ok(!!r, `第 ${i} 题已下发`);
    host.send({ type: 'answer', text: r.options[0].t });
    guest.send({ type: 'answer', text: r.options[1].t });
    await host.next(m => m.type === 'reveal');
  }
  const over = await host.next(m => m.type === 'over', 40000);
  ok(!!over, '收到 over 结算');
  ok(!!over.scores && 'child' in over.scores && 'parent' in over.scores, 'over 含双方比分', JSON.stringify(over.scores));
  ok(['draw', 'child', 'parent'].includes(over.result), 'over.result 合法', over.result);
  ok(Array.isArray(over.detail) && over.detail.length === 3, 'over.detail 有 3 条复盘明细', String(over.detail?.length));
  ok(!!over.detail[0].correct, '复盘明细含正确答案');
  const overG = await guest.next(m => m.type === 'over', 10000);
  ok(!!overG, '孩子也收到 over');

  // 7) 房间已满
  const guest2 = await connect('第二个孩子');
  guest2.send({ type: 'join', code: created.code });
  const errFull = await guest2.next(m => m.type === 'error');
  ok(!!errFull && errFull.msg.includes('已满'), '第三个人加入被拒（房间已满）', JSON.stringify(errFull));
  guest2.close();

  // 8) 不存在的房间码
  const guest3 = await connect('乱码玩家');
  guest3.send({ type: 'join', code: '0000' });
  const errNo = await guest3.next(m => m.type === 'error');
  ok(!!errNo && errNo.msg.includes('不存在'), '加入不存在的房间被拒', JSON.stringify(errNo));
  guest3.close();

  host.close(); guest.close();
} catch (e) {
  fail++;
  console.error('  ❌ 测试异常:', e.message);
}

fs.rmSync(bundleDir, { recursive: true, force: true });
proc.kill();

console.log('\n' + '─'.repeat(46));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
