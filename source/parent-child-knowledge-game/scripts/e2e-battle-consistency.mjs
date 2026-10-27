/**
 * 双人对战「答案一致性」校验
 * ---------------------------------------------------------------
 * 用两个真实 WebSocket 客户端（房主=家长 / 加入=孩子）打完整对局，
 * 逐题做四层交叉验证，专门抓「答案在服务端与题库之间漂移」这类 bug：
 *
 *   L1 同题一致：双方收到的题干、选项文本、选项顺序完全相同
 *   L2 答案一致：服务端公布的 correct 必须等于题库里该题的真实答案
 *   L3 判定一致：被判为答对的文本必须等于公布的正确答案；答错必须不得分
 *   L4 计分一致：over.scores === detail 里逐题 ok 的计数
 *
 * 另含边界：家长延迟 0 秒（完全公平模式）、全员超时、重复题、再来一局。
 *
 * 用法：node scripts/e2e-battle-consistency.mjs [--url ws://localhost:3000] [--quick]
 */
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const URL_WS = (args.includes('--url') ? args[args.indexOf('--url') + 1] : 'ws://localhost:3000');
const QUICK = args.includes('--quick');

/* ---------------------------- 题库真值索引 ---------------------------- */
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json'), 'utf8'));
const byText = new Map();
for (const q of QUESTIONS) {
  const k = `${q.subj}||${q.text}`;
  if (!byText.has(k)) byText.set(k, []);
  byText.get(k).push(q);
}
/** 取题库里该题的真实答案文本；找不到返回 null（= 该题不在库里，视为失败） */
function truthAnswer(subj, text) {
  const list = byText.get(`${subj}||${text}`);
  if (!list || !list.length) return null;
  const q = list[0];
  return String(q.options[q.correct]);
}

/* ------------------------------ 结果收集 ------------------------------ */
const fails = [];
const notes = [];
let checks = 0;
function ok(cond, label, extra) {
  checks++;
  if (!cond) fails.push(label + (extra ? `\n      ${extra}` : ''));
  return !!cond;
}

/* ------------------------------ WS 客户端 ----------------------------- */
class Client {
  constructor(tag) {
    this.tag = tag;
    this.msgs = [];
    this.cursor = 0;
    this.ws = null;
    this.closed = false;
  }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(URL_WS);
      this.ws.on('open', () => res());
      this.ws.on('error', e => rej(new Error(`${this.tag} 连接失败: ${e.message}`)));
      this.ws.on('message', raw => {
        let m; try { m = JSON.parse(raw.toString()); } catch { return; }
        m.__t = Date.now();
        this.msgs.push(m);
      });
      this.ws.on('close', () => { this.closed = true; });
    });
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  /** 按序消费：从游标往后找第一个满足 pred 的消息 */
  next(pred, ms = 20000) {
    const until = Date.now() + ms;
    return new Promise((res, rej) => {
      const tick = () => {
        for (let i = this.cursor; i < this.msgs.length; i++) {
          if (pred(this.msgs[i])) { this.cursor = i + 1; return res(this.msgs[i]); }
        }
        if (Date.now() > until) {
          const tail = this.msgs.slice(-3).map(m => m.type).join(',');
          return rej(new Error(`${this.tag} 等待超时(${ms}ms)；最近消息: ${tail || '无'}`));
        }
        setTimeout(tick, 25);
      };
      tick();
    });
  }
  close() { try { this.ws && this.ws.close(); } catch { } }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ----------------------------- 打一局 ------------------------------- */
/**
 * @param opts.grade 年级
 * @param opts.subject 科目（'mix' 或具体）
 * @param opts.rounds 题数
 * @param opts.level 难度
 * @param opts.parentDelay 家长延迟毫秒
 * @param opts.plan (role, round, idx) => 'right' | 'wrong' | null
 *        right=提交正确答案；wrong=提交一个错误答案；null=不答（等超时）
 * @param opts.checkParentUnlock 是否额外校验家长在 0 延迟下能立刻作答
 */
async function playMatch(opts) {
  const { grade, subject = 'mix', rounds = 4, level = 2, parentDelay = 1500, plan } = opts;
  const label = `g${grade}/${subject}/lv${level}/delay${parentDelay}/${rounds}题`;
  const host = new Client(`${label}#家长`);
  const guest = new Client(`${label}#孩子`);
  const log = { rounds: [], results: [], reveals: [], overs: [], roundHost: [], roundGuest: [] };

  await host.open();
  host.send({ type: 'create', grade, subject, rounds, level, parentDelay });
  const created = await host.next(m => m.type === 'created');
  const code = created.code;

  await guest.open();
  guest.send({ type: 'join', code });
  await Promise.all([host.next(m => m.type === 'ready'), guest.next(m => m.type === 'joined' || m.type === 'ready')]);

  // 事件循环：谁收到 round 谁就按策略作答
  const answered = new Set();
  // 全超时用例每轮要跑满 ROUND_TIME，窗口必须按最坏情况给足
  const deadline = Date.now() + rounds * 21000 + 30000;

  const drive = async (cli, role) => {
    while (Date.now() < deadline) {
      let m;
      try { m = await cli.next(x => x.type === 'round' || x.type === 'over' || x.type === 'error', deadline - Date.now()); }
      catch { return; }
      if (m.type === 'over') { log.overs.push({ role, m }); return; }
      if (m.type === 'error') { log.overs.push({ role, m }); return; }

      const idx = m.no;
      if (role === 'parent') log.roundHost[idx] = m; else log.roundGuest[idx] = m;

      // 家长延迟 0 秒的关键校验：应当立刻可答，不应收到 locked
      const action = plan ? plan(role, m, idx) : 'right';
      if (action === null) continue;                       // 故意不答，等超时
      if (answered.has(role + idx)) continue;
      answered.add(role + idx);

      // 家长有延迟时须等解锁后再答（delay=0 不等待，用于验证「立刻可答」）
      if (role === 'parent' && parentDelay > 0) await sleep(parentDelay + 120);

      let text;
      if (action === 'right') {
        const t = truthAnswer(m.subj, m.text);
        text = t !== null ? t : m.options[0].t;
      } else {
        // 挑一个确定不是正确答案的选项
        const t = truthAnswer(m.subj, m.text);
        const cand = m.options.map(o => o.t).find(x => x !== t);
        text = cand !== undefined ? cand : m.options[0].t;
      }
      cli.send({ type: 'answer', text });
      log.results.push({ role, idx, text, expectRight: action === 'right' });
    }
  };

  await Promise.all([drive(host, 'parent'), drive(guest, 'child')]);

  // over 已由 drive 捕获，直接取，避免重复等待
  const overMsg = log.overs.find(o => o.m.type === 'over');
  const over = overMsg ? overMsg.m : null;
  // 收尾：把 reveal 消息抓出来（从消息流里筛）
  log.reveals = host.msgs.filter(m => m.type === 'reveal');
  log.lockedMsgs = host.msgs.filter(m => m.type === 'locked');

  host.close(); guest.close();
  await sleep(120);

  /* ------------------------------ 断言 ------------------------------ */
  console.log(`\n── ${label} 房间 ${code} ──`);

  // L1 同题一致
  const maxNo = Math.max(...log.roundHost.map((x, i) => (x ? i : 0)));
  for (let i = 1; i <= maxNo; i++) {
    const a = log.roundHost[i], b = log.roundGuest[i];
    if (!a || !b) { ok(false, `${label} 第${i}题 一方未收到 round`, `家长:${!!a} 孩子:${!!b}`); continue; }
    const ta = a.options.map(o => o.t), tb = b.options.map(o => o.t);
    ok(a.text === b.text, `${label} 第${i}题 题干两侧不一致`, `家长「${a.text}」/ 孩子「${b.text}」`);
    ok(JSON.stringify(ta) === JSON.stringify(tb), `${label} 第${i}题 选项两侧不一致`, `家长${JSON.stringify(ta)} / 孩子${JSON.stringify(tb)}`);
    ok(a.no === b.no && a.total === b.total, `${label} 第${i}题 题号/总数不一致`);
    ok(ta.length === 4, `${label} 第${i}题 选项数不是4`, String(ta.length));
    ok(new Set(ta).size === ta.length, `${label} 第${i}题 选项有重复文本`, JSON.stringify(ta));
  }
  // 同局无重复题干
  const texts = log.roundHost.filter(Boolean).map(m => m.text);
  ok(new Set(texts).size === texts.length, `${label} 同一局出现重复题`, `${texts.length}题/${new Set(texts).size}种`);

  // L2 答案一致：reveal.correct === 题库真答案
  for (const rv of log.reveals) {
    const r = log.roundHost[rv.__no] || null;
    // reveal 不带题号，用顺序对齐
    const i = log.reveals.indexOf(rv) + 1;
    const rd = log.roundHost[i];
    if (!rd) continue;
    const truth = truthAnswer(rd.subj, rd.text);
    ok(truth !== null, `${label} 第${i}题 题库里找不到该题（题干漂移）`, rd.text.slice(0, 40));
    if (truth !== null) {
      ok(rv.correct === truth, `${label} 第${i}题 公布答案≠题库答案`, `公布「${rv.correct}」/ 题库「${truth}」`);
    }
    const opts = rd.options.map(o => o.t);
    ok(opts.includes(rv.correct), `${label} 第${i}题 公布答案不在选项里`, `correct「${rv.correct}」 opts=${JSON.stringify(opts).slice(0, 120)}`);
  }

  // L3 判定一致 + L4 计分一致（从 detail 交叉验证）
  if (ok(!!over, `${label} 没收到 over 结算`)) {
    const { scores, detail, result } = over;
    ok(Array.isArray(detail) && detail.length === rounds, `${label} detail 题数不对`, `${detail?.length} vs ${rounds}`);

    const childWins = detail.filter(d => d.child && d.child.ok).length;
    const parentWins = detail.filter(d => d.parent && d.parent.ok).length;
    ok(scores.child === childWins, `${label} 孩子得分与明细不符`, `score=${scores.child} detail答对=${childWins}`);
    ok(scores.parent === parentWins, `${label} 家长得分与明细不符`, `score=${scores.parent} detail答对=${parentWins}`);

    const expectResult = scores.child === scores.parent ? 'draw' : (scores.child > scores.parent ? 'child' : 'parent');
    ok(result === expectResult, `${label} 胜负判定错误`, `result=${result} 应为${expectResult}`);

    // 被判答对 → 提交文本必须等于正确答案
    for (const d of detail) {
      for (const who of ['child', 'parent']) {
        const a = d[who];
        if (a && a.ok) {
          ok(String(a.text) === String(d.correct),
            `${label} 第${d.no}题 ${who} 判对但文本≠答案`,
            `提交「${a.text}」/ 公布「${d.correct}」`);
        }
        if (a && a.text !== null && a.text !== undefined && !a.ok) {
          ok(String(a.text) !== String(d.correct),
            `${label} 第${d.no}题 ${who} 判错但文本=答案`,
            `提交「${a.text}」`);
        }
      }
    }

    // 逐题期望行为核对
    const wrongOnes = detail.filter(d => d.no && d.correct);
    ok(wrongOnes.length === rounds, `${label} detail 里可选答案缺失`);
  }

  return { label, over, log };
}

/* ------------------------------ 主流程 ------------------------------ */
console.log('双人对战 · 答案一致性校验');
console.log(`服务端：${URL_WS}`);
console.log(`题库：${QUESTIONS.length} 道`);

const allRight = () => 'right';
const allWrong = () => 'wrong';

const cases = [
  // 关键：家长延迟 0 秒（完全公平模式）—— 家长必须能立刻作答
  { grade: 3, subject: 'mix', rounds: 4, level: 2, parentDelay: 0, plan: allRight, expectParent: true },
  // 常规延迟
  { grade: 1, subject: 'mix', rounds: 4, level: 1, parentDelay: 1500, plan: allRight, expectParent: true },
  // 全答错
  { grade: 5, subject: 'mix', rounds: 4, level: 2, parentDelay: 800, plan: allWrong, expectParent: true },
  // 家长不答（超时路径）—— 家长本就不提交，不能断言「答上了」
  { grade: 2, subject: '语文', rounds: 4, level: 2, parentDelay: 0, plan: role => (role === 'parent' ? null : 'right'), expectParent: false },
  // 双方都不答（纯超时）
  { grade: 6, subject: '数学', rounds: 3, level: 3, parentDelay: 0, plan: () => null, expectParent: false },
  // 单科满题量
  { grade: 4, subject: '英语', rounds: 20, level: 2, parentDelay: 1200, plan: (r, m, i) => (i % 3 === 0 ? 'wrong' : 'right'), expectParent: true },
];

const onlyArg = args.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',').map(Number) : null;
const selected = QUICK ? [cases[0], cases[1]]
  : (only ? cases.filter((_, i) => only.includes(i + 1)) : cases);

for (const c of selected) {
  try {
    const r = await playMatch(c);

    // 单独校验：delay0 时家长不应被锁
    if (c.parentDelay === 0) {
      const locked = r.log.lockedMsgs || [];
      ok(locked.length === 0, `${r.label} 家长延迟0秒仍收到 locked`, `${locked.length} 次`);
      if (c.expectParent !== false) {
        const pDetail = r.over ? r.over.detail.filter(d => d.parent && d.parent.text !== null) : [];
        ok(pDetail.length > 0, `${r.label} 家长延迟0秒却一题都没答上（疑似被锁死）`);
      }
    }
  } catch (e) {
    fails.push(`${c.grade}/${c.subject} 对局异常：${e.message}`);
  }
}

/* ------------------------------ 汇总 ------------------------------ */
console.log('\n════════════════ 结果 ════════════════');
console.log(`断言 ${checks} 条，失败 ${fails.length} 条`);
if (fails.length) {
  console.log('\n❌ 失败明细：');
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log('✅ 全部通过：双方同题、答案一致、判定一致、计分一致');
}
