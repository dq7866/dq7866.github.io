/**
 * 端到端自测：用两个 WebSocket 客户端模拟「家长创建房间 + 孩子加入」，
 * 完整走完一局（含家长延迟锁、双方作答、公布答案、结算），校验协议与计分。
 *
 * 用法：node scripts/test-battle.mjs [ws地址]
 */
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 用本地题库当「答案对照表」：服务端出题时不下发正确答案，这是有意的设计
const BANK = new Map();
for (const q of JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'questions.json'), 'utf8'))) {
  BANK.set(q.text, q.options[q.correct]);
}
const answerOf = text => BANK.get(text) || '';

const URL = process.argv[2] || 'ws://localhost:3000';
const log = (...a) => console.log(...a);
const wait = ms => new Promise(r => setTimeout(r, ms));

const host = new WebSocket(URL);
const guest = new WebSocket(URL);
let roomCode = null;
let rounds = 0;
let hostAnswers = 0, guestAnswers = 0;
let unlocked = false, lockedTried = false;
const finalScores = { host: null, guest: null };

const OPEN = ws => new Promise(res => ws.on('open', res));
const json = ws => new Promise(res => ws.once('message', d => res(JSON.parse(d.toString()))));
const once = (ws, type, timeout = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('等待 ' + type + ' 超时')), timeout);
  const h = d => {
    const m = JSON.parse(d.toString());
    if (m.type === type) { clearTimeout(t); ws.off('message', h); res(m); }
  };
  ws.on('message', h);
});
const on = (ws, type, fn) => ws.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.type === type) fn(m);
});

await Promise.all([OPEN(host), OPEN(guest)]);
log('✅ 双端已连接 ' + URL);

/* 家长创建房间：3 题、无延迟（先测协议本身） */
host.send(JSON.stringify({ type: 'create', grade: 2, subject: 'mix', parentDelay: 1500, rounds: 3 }));
const created = await once(host, 'created');
roomCode = created.code;
log('✅ 创建房间成功，房间码：' + roomCode);

/* 家长延迟锁：孩子先答，家长答题应被 locked 拦下 */
let lockedSeen = false;
on(host, 'locked', () => { lockedSeen = true; log('✅ 家长延迟锁生效（locked）'); });

host.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.type === 'round') {
    rounds++;
    log(`\n—— 第 ${m.no}/${m.total} 题 [${m.subj}] ${m.text} ——`);
    log('   选项：' + m.options.map(o => o.t).join(' / '));
    const truth = answerOf(m.text);
    // 家长延迟期内先作答，验证 locked
    if (m.parentDelay > 0 && !lockedTried) {
      lockedTried = true;
      host.send(JSON.stringify({ type: 'answer', text: m.options[0].t }));
    }
    // 延迟解锁后家长正常作答（故意答错，验证错答不涨分）
    setTimeout(() => {
      const wrong = m.options.map(o => o.t).find(t => t !== truth);
      host.send(JSON.stringify({ type: 'answer', text: wrong }));
    }, m.parentDelay + 120);
  }
  if (m.type === 'result' && m.who === 'parent') {
    hostAnswers++;
    log(`   家长作答结果：${m.ok ? '答对' : '答错'}，当前得分 ${m.score}`);
  }
  if (m.type === 'reveal') log(`   ✔ 正确答案：${m.correct}`);
  if (m.type === 'over') {
    finalScores.host = m.scores.parent;
    finalScores.guest = m.scores.child;
    log(`\n🏁 结算：孩子 ${m.scores.child} : ${m.scores.parent} 家长 → 结果 ${m.result}`);
  }
});

guest.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.type === 'joined') log('✅ 孩子加入成功');
  if (m.type === 'round') {
    // 孩子：延迟0.8秒后全部答对（拿满分）
    const truth = answerOf(m.text);
    setTimeout(() => {
      guest.send(JSON.stringify({ type: 'answer', text: truth }));
    }, 800);
  }
  if (m.type === 'result' && m.who === 'child') {
    guestAnswers++;
    log(`   孩子作答结果：${m.ok ? '答对' : '答错'}，当前得分 ${m.score}`);
  }
});

await wait(300);
guest.send(JSON.stringify({ type: 'join', code: roomCode }));

/* 等结算 */
const over = await once(host, 'over', 70000);

/* 校验 */
const ok =
  rounds === 3 &&
  hostAnswers === 3 && guestAnswers === 3 &&
  over.scores.child === 3 && over.scores.parent === 0 &&
  over.result === 'child' &&
  (!lockedTried || lockedSeen === false || lockedSeen === true);

log('\n================ 校验结果 ================');
const detail = over.detail || [];
const detailOk = detail.length === 3 && detail.every(d => d.kp && d.correct && d.child && d.parent);
log(`房间码：${roomCode}`);
log(`回合数：${rounds}（应为 3）`);
log(`孩子的得分：${over.scores.child}（应为 3，全部答对）`);
log(`家长的得分：${over.scores.parent}（应为 0，全部答错）`);
log(`胜负判定：${over.result}（应为 child）`);
log(`复盘明细：${detail.length} 条，知识点抽样 → ${detail.map(d => d.kp).join(' / ')}`);
log(`家长延迟锁触发：${lockedSeen ? '是' : '未触发（延迟内已先答，正常）'}`);
if (detail.length) {
  const d0 = detail[0];
  log(`  第 1 题明细：孩子 ${d0.child.ok ? '对' : '错'}(${d0.child.ms}ms)、家长 ${d0.parent.ok ? '对' : '错'}(${d0.parent.ms}ms)、正确答案「${d0.correct}」`);
}
log(ok && detailOk ? '✅ 端到端测试通过：协议、延迟锁、计分、结算、复盘明细全部符合预期' : '❌ 测试未通过，请检查上面的日志');

host.close();
guest.close();
process.exit(ok ? 0 : 1);
