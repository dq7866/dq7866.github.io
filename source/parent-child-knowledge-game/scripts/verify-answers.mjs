/**
 * 数学题答案自校验：把能程序重算的题型全部重算一遍，找出「选项里没有正确答案」的错题。
 * 用法：node scripts/verify-answers.mjs [--fix]
 *
 * 只校验规则明确的题型（四则运算、分数运算、周长体积表面积、简单应用题），
 * 文字类/找规律类跳过，所以输出的是「可验证部分」的结论。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'questions.json');
const FIX = process.argv.includes('--fix');

const questions = JSON.parse(fs.readFileSync(FILE, 'utf8'));

/** 把答案字符串变成可比较的数：支持 1/2、18厘米、-3、2.5 */
function toNum(s) {
  const t = String(s == null ? '' : s).replace(/[−–—]/g, '-').replace(/\s/g, '');
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const m = t.match(/^-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const N = '(\\d+(?:\\.\\d+)?)';
const OP = '([+\\-−×÷])';

/** 题型规则：返回期望值（数），认不出返回 null */
const RULES = [
  // 纯算式 a + b = ?
  {
    name: '四则运算',
    re: new RegExp(`^${N}\\s*${OP}\\s*${N}\\s*=\\s*\\?$`),
    calc: (m) => {
      const [a, b] = [Number(m[1]), Number(m[3])];
      switch (m[2]) {
        case '+': return a + b;
        case '-': case '−': return a - b;
        case '×': return a * b;
        case '÷': return b === 0 ? null : a / b;
      }
      return null;
    },
  },
  // 连乘加 a × b + c = ?
  {
    name: '乘加混合',
    re: new RegExp(`^${N}\\s*×\\s*${N}\\s*\\+\\s*${N}\\s*=\\s*\\?$`),
    calc: m => Number(m[1]) * Number(m[2]) + Number(m[3]),
  },
  // 分数四则 a/b + c/d = ?
  {
    name: '分数四则',
    re: new RegExp(`^${N}/${N}\\s*${OP}\\s*${N}/${N}\\s*=\\s*\\?$`),
    calc: (m) => {
      const a = Number(m[1]) / Number(m[2]);
      const b = Number(m[4]) / Number(m[5]);
      switch (m[3]) {
        case '+': return a + b;
        case '-': case '−': return a - b;
        case '×': return a * b;
        case '÷': return b === 0 ? null : a / b;
      }
      return null;
    },
  },
  // 长方形周长
  {
    name: '长方形周长',
    re: new RegExp(`^长\\s*${N}\\s*(?:厘米|分米|米|毫米)[、，]\\s*宽\\s*${N}\\s*(?:厘米|分米|米|毫米)的长方形周长是？$`),
    calc: m => 2 * (Number(m[1]) + Number(m[2])),
  },
  // 长方形面积
  {
    name: '长方形面积',
    re: new RegExp(`^长\\s*${N}\\s*(?:厘米|分米|米|毫米)[、，]\\s*宽\\s*${N}\\s*(?:厘米|分米|米|毫米)的长方形面积是？$`),
    calc: m => Number(m[1]) * Number(m[2]),
  },
  // 长方体体积
  {
    name: '长方体体积',
    re: new RegExp(`^长\\s*${N}\\s*(?:厘米|分米|米)[、，]\\s*宽\\s*${N}\\s*(?:厘米|分米|米)[、，]\\s*高\\s*${N}\\s*(?:厘米|分米|米)的长方体体积是？$`),
    calc: m => Number(m[1]) * Number(m[2]) * Number(m[3]),
  },
  // 长方体表面积
  {
    name: '长方体表面积',
    re: new RegExp(`^长\\s*${N}\\s*(?:厘米|分米|米)[、，]\\s*宽\\s*${N}\\s*(?:厘米|分米|米)[、，]\\s*高\\s*${N}\\s*(?:厘米|分米|米)的长方体表面积是？$`),
    calc: m => {
      const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
      return 2 * (a * b + a * c + b * c);
    },
  },
  // 每盒铅笔
  {
    name: '乘法应用题',
    re: new RegExp(`^每盒有\\s*${N}\\s*支铅笔[，,]\\s*${N}\\s*盒一共有多少支？$`),
    calc: m => Number(m[1]) * Number(m[2]),
  },
  // 小鸟飞走
  {
    name: '减法应用题',
    re: new RegExp(`^树上有\\s*${N}\\s*只小鸟[，,]\\s*飞走了\\s*${N}\\s*只[，,]\\s*还剩多少只？$`),
    calc: m => Number(m[1]) - Number(m[2]),
  },
  // 比 a 大 b 的数是
  {
    name: '比大小',
    re: new RegExp(`^比\\s*${N}\\s*大\\s*${N}\\s*的数是？$`),
    calc: m => Number(m[1]) + Number(m[2]),
  },
  // 正方形周长
  {
    name: '正方形周长',
    re: new RegExp(`^边长\\s*${N}\\s*(?:厘米|分米|米|毫米)的正方形周长是？$`),
    calc: m => 4 * Number(m[1]),
  },
  // 正方形面积
  {
    name: '正方形面积',
    re: new RegExp(`^边长\\s*${N}\\s*(?:厘米|分米|米|毫米)的正方形面积是？$`),
    calc: m => Number(m[1]) ** 2,
  },
];

const bad = [];
const checked = {};
const unverifiable = [];

for (const q of questions) {
  if (q.subj !== '数学') continue;
  const text = String(q.text || '').replace(/\s+/g, ' ').trim();

  let matched = null;
  for (const rule of RULES) {
    const m = text.match(rule.re);
    if (m) { matched = { rule, m }; break; }
  }
  if (!matched) { unverifiable.push(q); continue; }

  const expect = matched.rule.calc(matched.m);
  if (expect == null || !Number.isFinite(expect)) { unverifiable.push(q); continue; }

  checked[matched.rule.name] = (checked[matched.rule.name] || 0) + 1;

  const opts = (q.options || []).map(toNum);
  const actual = toNum(q.answer);

  // 正确答案本身要与期望值一致
  const answerOk = actual != null && Math.abs(actual - expect) < 0.011;
  // 并且选项里必须真的有这个值（防止 answer 与 options 脱节）
  const inOptions = opts.some(v => v != null && Math.abs(v - expect) < 0.011);

  if (!answerOk || !inOptions) {
    bad.push({
      id: q.id || '(构建时会生成)', grade: q.grade, kp: q.kp, text: q.text,
      options: q.options, answer: q.answer, expect: Math.round(expect * 1000) / 1000,
      reason: !answerOk ? '答案与算出结果不符' : '选项里找不到正确答案',
    });
  }
}

/* ------------------------------ 报告 ------------------------------ */
console.log('可程序校验的题目：');
for (const [k, v] of Object.entries(checked)) console.log('  ' + k.padEnd(10) + v + ' 道');
const total = Object.values(checked).reduce((a, b) => a + b, 0);
console.log(`  合计 ${total} 道（占数学题 ${(total / questions.filter(q => q.subj === '数学').length * 100).toFixed(1)}%）`);

if (!bad.length) {
  console.log('\n✅ 全部可校验题目答案正确，选项里都能找到对应正确答案');
} else {
  console.log(`\n❌ 发现 ${bad.length} 道有问题的题目：`);
  bad.slice(0, 30).forEach(b => {
    console.log(`   [${b.grade}年级·${b.kp}] ${b.text}`);
    console.log(`      选项 ${JSON.stringify(b.options)} | 标注答案 ${b.answer} | 应为 ${b.expect} | ${b.reason}`);
  });
  if (bad.length > 30) console.log(`   …… 另有 ${bad.length - 30} 道`);
  if (FIX) {
    const badIds = new Set(bad.map(b => b.id));
    const kept = questions.filter(q => !badIds.has(q.id));
    fs.writeFileSync(FILE, JSON.stringify(kept, null, 1), 'utf8');
    console.log(`\n已按 --fix 移除 ${questions.length - kept.length} 道错题 → data/questions.json`);
    console.log('（注意：重新 npm run build:bank 会覆盖此修改，错题应从生成器或事实表源头修）');
  }
}

process.exitCode = bad.length && !FIX ? 1 : 0;
