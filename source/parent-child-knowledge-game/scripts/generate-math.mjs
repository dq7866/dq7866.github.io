/**
 * 数学题库程序化生成器
 * 每个模板按知识点出题，答案由程序计算，保证正确；干扰项取常见错解与邻近数。
 * 输出：data/bank/gen-math-g{1..6}.json（与人工题库同格式）
 *
 * 用法：node scripts/generate-math.mjs [每年级题量，默认每模板 12 题]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'bank');
const PER = Number(process.argv[2] || 12);

/* ---------------------------- 基础工具 ---------------------------- */
let seed = 20261026;
function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = n => (Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(Math.round(n * 100) / 100));

const numVal = s => {
  const t = String(s).trim().replace(/−/g, '-');
  const fr = t.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fr) return Number(fr[1]) / Number(fr[2]);
  if (!/[0-9]/.test(t)) return NaN;   // 纯文字选项不参与数值比较
  const n = Number(t.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

function opts(correct, cands) {
  const set = [];
  const seen = new Set([String(correct)]);
  const seenVal = new Set([numVal(correct)]);
  for (const c of cands) {
    const s = String(c);
    const v = numVal(s);
    if (s !== '' && s !== 'undefined' && s !== 'null' && !seen.has(s) && !(Number.isFinite(v) && seenVal.has(v))) {
      seen.add(s); if (Number.isFinite(v)) seenVal.add(v);
      set.push(s);
      if (set.length === 3) break;
    }
  }
  // 数值答案可继续兜底；字符串答案必须由调用方给足 3 个干扰项，否则弃题
  if (set.length < 3 && Number.isFinite(Number(correct)) && String(correct).trim() !== '') {
    let k = 1;
    while (set.length < 3 && k < 100) {
      const v = Math.round((Number(correct) + k * 3) * 100) / 100;
      const s = String(v);
      if (!seen.has(s) && !seenVal.has(v)) { seen.add(s); seenVal.add(v); set.push(s); }
      k++;
    }
  }
  // 带单位的数值答案（如“24 平方厘米”“7 小时”）按同单位做邻近值
  // 注意：比较必须用整个选项的数值（numVal），不能只看数字部分——
  // 否则 "1/5" 的数字部分是 1，会和 1 混在一起，造出与 2/10 等值的选项。
  if (set.length < 3) {
    const m = String(correct).match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (m) {
      const n = Number(m[1]), unit = m[2];
      for (const d of [1, -1, 2, -2, 10, -10, 5, -5, 3, -3, 4, -4]) {
        if (set.length >= 3) break;
        const v = Math.round((n + d) * 100) / 100;
        if (v <= 0 && n > 0) continue;
        const str = `${v}${unit}`;
        const vv = numVal(str);
        if (seen.has(str)) continue;
        if (Number.isFinite(vv) && seenVal.has(vv)) continue;
        seen.add(str); if (Number.isFinite(vv)) seenVal.add(vv); set.push(str);
      }
    }
  }
  if (set.length < 3) return null;
  const all = shuffle([String(correct), ...set]);
  return { options: all, a: all.indexOf(String(correct)) };
}

/** 题目累加器 */
function makeBag() { return []; }
const gcd2 = (a, b) => (b ? gcd2(b, a % b) : a);

const fmtNum = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
  if (typeof v === 'string' && /^-?\d+\.\d{3,}$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : v;
  }
  return v;
};

function addQ(bag, text, correct, cands, kp, lv = 2) {
  correct = fmtNum(correct);
  cands = cands.map(fmtNum);
  const res = opts(correct, cands);
  if (!res) { console.warn('⚠️ 干扰项不足，弃题：', text); return; }
  const key = text.replace(/\s+/g, '');
  if (bag.some(q => q.t.replace(/\s+/g, '') === key)) return;
  bag.push({ t: text, o: res.options, a: res.a, kp, lv });
}

/* ---------------------------- 各年级模板 ---------------------------- */
const TEMPLATES = {};

/* ============ 一年级 ============ */
TEMPLATES[1] = [
  { kp: '加减法', lv: 1, gen(b) {
    const a = ri(1, 9), c = ri(1, 9);
    addQ(b, `${a} + ${c} = ?`, a + c, [a + c + 1, a + c - 1, a + c + 2, a * c], '加减法', 1);
    const x = ri(5, 18), y = ri(1, x - 1);
    addQ(b, `${x} − ${y} = ?`, x - y, [x - y + 1, x - y - 1, x + y, x - y + 2], '加减法', 1);
  }},
  { kp: '20以内进位加法', lv: 2, gen(b) {
    const a = ri(6, 9), c = ri(11 - a, 9);
    addQ(b, `${a} + ${c} = ?`, a + c, [a + c - 10, a + c + 1, a + c - 1, a + c + 10], '20以内进位加法', 2);
  }},
  { kp: '100以内加减法', lv: 2, gen(b) {
    const a = ri(21, 79), c = ri(11, 20);
    addQ(b, `${a} + ${c} = ?`, a + c, [a + c - 10, a + c + 10, a + c - 1, a + c + 2], '100以内加减法', 2);
    const x = ri(40, 99), y = ri(11, 39);
    addQ(b, `${x} − ${y} = ?`, x - y, [x - y + 10, x - y - 10, x + y, x - y + 1], '100以内加减法', 2);
  }},
  { kp: '数的认识', lv: 2, gen(b) {
    const n = ri(11, 98);
    addQ(b, `与 ${n} 相邻的两个数是？`, `${n - 1} 和 ${n + 1}`, [`${n} 和 ${n + 1}`, `${n - 2} 和 ${n}`, `${n + 1} 和 ${n + 2}`], '数的认识', 2);
    const t = ri(2, 9) * 10;
    addQ(b, `${t} 里面有几个十？`, t / 10, [t / 10 + 1, t / 10 - 1, t], '数的认识', 1);
  }},
  { kp: '认识钟表', lv: 2, gen(b) {
    const h = ri(1, 12);
    addQ(b, `钟面上时针指向 ${h}，分针指向 12，现在是几时？`, `${h}时`, [`${h}时半`, `${h + 1}时`, `${h === 1 ? 12 : h - 1}时`], '认识钟表', 2);
  }},
  { kp: '人民币', lv: 2, gen(b) {
    const y = ri(2, 9);
    addQ(b, `1 元可以换几个 1 角？`, '10 个', ['5 个', '100 个', '2 个'], '人民币', 1);
    addQ(b, `${y} 元 = 多少角？`, `${y * 10} 角`, [`${y} 角`, `${y * 100} 角`, `${y * 10 + 10} 角`], '人民币', 2);
  }},
  { kp: '应用题', lv: 2, gen(b) {
    const a = ri(3, 12), c = ri(2, 9);
    addQ(b, `小明有 ${a} 个苹果，妈妈又买来 ${c} 个，一共有多少个？`, a + c, [a + c + 1, a - c, a + c - 1, a * c], '应用题', 2);
    const t = ri(8, 20), g = ri(2, t - 1);
    addQ(b, `树上有 ${t} 只小鸟，飞走了 ${g} 只，还剩多少只？`, t - g, [t + g, t - g + 1, t - g - 1, t], '应用题', 2);
  }},
  { kp: '比多少', lv: 2, gen(b) {
    const a = ri(6, 19), c = ri(2, a - 1);
    addQ(b, `${a} 比 ${c} 多几？`, a - c, [a + c, a - c + 1, a - c - 1], '比多少', 2);
  }},
];

/* ============ 二年级 ============ */
TEMPLATES[2] = [
  { kp: '表内乘法', lv: 1, gen(b) {
    const a = ri(2, 9), c = ri(2, 9);
    addQ(b, `${a} × ${c} = ?`, a * c, [a * c + a, a * c - a, a + c, a * c + 1], '表内乘法', 1);
  }},
  { kp: '表内除法', lv: 2, gen(b) {
    const a = ri(2, 9), c = ri(2, 9);
    addQ(b, `${a * c} ÷ ${c} = ?`, a, [a + 1, a - 1, c, a * c], '表内除法', 2);
  }},
  { kp: '万以内加减', lv: 2, gen(b) {
    const a = ri(120, 890), c = ri(110, 900);
    addQ(b, `${a} + ${c} = ?`, a + c, [a + c + 100, a + c - 100, a + c + 10, a + c - 1], '万以内加减', 2);
    const x = ri(500, 990), y = ri(110, 480);
    addQ(b, `${x} − ${y} = ?`, x - y, [x - y + 100, x - y - 100, x + y, x - y + 10], '万以内加减', 2);
  }},
  { kp: '长度单位', lv: 2, gen(b) {
    const m = ri(2, 9);
    addQ(b, `${m} 米 = 多少厘米？`, `${m * 100} 厘米`, [`${m * 10} 厘米`, `${m * 1000} 厘米`, `${m + 100} 厘米`], '长度单位', 2);
    const cm = ri(2, 9) * 10;
    addQ(b, `${cm} 厘米 = 多少分米？`, `${cm / 10} 分米`, [`${cm} 分米`, `${cm / 100} 分米`, `${cm / 10 + 1} 分米`], '长度单位', 3);
  }},
  { kp: '时间单位', lv: 2, gen(b) {
    const h = ri(2, 6);
    addQ(b, `${h} 时 = 多少分？`, `${h * 60} 分`, [`${h * 100} 分`, `${h * 30} 分`, `${h * 60 + 10} 分`], '时间单位', 2);
    addQ(b, '1 分 = 多少秒？', '60 秒', ['100 秒', '30 秒', '10 秒'], '时间单位', 1);
  }},
  { kp: '找规律', lv: 3, gen(b) {
    const s = ri(2, 9), d = ri(2, 9);
    const seq = [s, s + d, s + 2 * d, s + 3 * d];
    addQ(b, `找规律填数：${seq.join('、')}、（　）`, s + 4 * d, [s + 5 * d, s + 4 * d + d * 2, s + 3 * d, s + 4 * d - 1], '找规律', 3);
  }},
  { kp: '应用题', lv: 2, gen(b) {
    const a = ri(3, 9), c = ri(3, 9);
    addQ(b, `每盒有 ${a} 支铅笔，${c} 盒一共有多少支？`, a * c, [a + c, a * c + a, a * c - 1, a * c + c], '应用题', 2);
    const g = ri(3, 9), each = ri(2, 9);
    const total = g * each;
    addQ(b, `${total} 个苹果平均分给 ${g} 个小朋友，每人几个？`, each, [each + 1, each - 1, g, total], '应用题', 3);
  }},
  { kp: '认识角', lv: 2, gen(b) {
    addQ(b, '一个三角形有几个角？', '3 个', ['4 个', '2 个', '6 个'], '认识角', 1);
    addQ(b, '一个长方形有几个直角？', '4 个', ['2 个', '3 个', '6 个'], '认识角', 2);
  }},
];

/* ============ 三年级 ============ */
TEMPLATES[3] = [
  { kp: '多位数乘一位数', lv: 2, gen(b) {
    const a = ri(12, 89), c = ri(3, 9);
    addQ(b, `${a} × ${c} = ?`, a * c, [a * c + c, a * c - c, a * c + 10, a + c], '多位数乘一位数', 2);
  }},
  { kp: '两位数乘两位数', lv: 2, gen(b) {
    const a = ri(11, 49), c = ri(11, 29);
    addQ(b, `${a} × ${c} = ?`, a * c, [a * c + a, a * c - c, a * c + 10, a + c], '两位数乘两位数', 3);
  }},
  { kp: '除数是一位数的除法', lv: 2, gen(b) {
    const c = ri(3, 9), a = ri(11, 99);
    addQ(b, `${a * c} ÷ ${c} = ?`, a, [a + 1, a - 1, a * 10, c], '除数是一位数的除法', 2);
  }},
  { kp: '分数初步', lv: 2, gen(b) {
    const d = ri(4, 9), n1 = ri(1, d - 2), n2 = ri(1, d - n1 - 1);
    addQ(b, `${n1}/${d} + ${n2}/${d} = ?`, `${n1 + n2}/${d}`, [`${n1 + n2}/${d * 2}`, `${n1 * n2}/${d}`, `${n1 + n2 + 1}/${d}`], '分数初步', 3);
    const n = ri(1, d - 1);
    addQ(b, `${n}/${d} 是几分之几？读作？`, `${d}分之${n}`, [`${n}分之${d}`, `${d}分之${d - n}`, `${n}分之${n}`], '分数初步', 2);
  }},
  { kp: '面积与周长', lv: 2, gen(b) {
    const l = ri(4, 15), w = ri(2, 9);
    addQ(b, `长方形长 ${l} 厘米，宽 ${w} 厘米，周长是多少？`, `${2 * (l + w)} 厘米`, [`${l + w} 厘米`, `${l * w} 厘米`, `${2 * (l + w) + 2} 厘米`], '面积与周长', 2);
    addQ(b, `长方形长 ${l} 厘米，宽 ${w} 厘米，面积是多少？`, `${l * w} 平方厘米`, [`${2 * (l + w)} 平方厘米`, `${l + w} 平方厘米`, `${l * w + w} 平方厘米`], '面积与周长', 2);
    const s = ri(3, 12);
    addQ(b, `正方形边长 ${s} 厘米，面积是多少？`, `${s * s} 平方厘米`, [`${4 * s} 平方厘米`, `${s * s + s} 平方厘米`, `${2 * s} 平方厘米`], '面积与周长', 2);
  }},
  { kp: '年月日', lv: 2, gen(b) {
    const y = pick([2016, 2018, 2020, 2023, 2024, 2025]);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    addQ(b, `${y} 年全年有多少天？`, leap ? '366 天' : '365 天', [leap ? '365 天' : '366 天', '364 天', '360 天'], '年月日', 3);
    const m = pick([1, 3, 5, 7, 8, 10, 12, 4, 6, 9, 11]);
    const days = [1, 3, 5, 7, 8, 10, 12].includes(m) ? 31 : 30;
    addQ(b, `${m} 月有多少天？`, `${days} 天`, [days === 31 ? '30 天' : '31 天', '28 天', '29 天'], '年月日', 2);
  }},
  { kp: '小数的初步认识', lv: 2, gen(b) {
    const a = ri(1, 6), c = ri(1, 3);
    addQ(b, `0.${a} + 0.${c} = ?`, fmt((a + c) / 10), [fmt((a + c) / 100), fmt((a + c + 1) / 10), fmt(a * c / 10)], '小数的初步认识', 2);
  }},
  { kp: '单位换算', lv: 2, gen(b) {
    const km = ri(2, 9);
    addQ(b, `${km} 千米 = 多少米？`, `${km * 1000} 米`, [`${km * 100} 米`, `${km * 10} 米`, `${km * 1000 + 100} 米`], '单位换算', 2);
    const t = ri(2, 9);
    addQ(b, `${t} 吨 = 多少千克？`, `${t * 1000} 千克`, [`${t * 100} 千克`, `${t * 10} 千克`, `${t * 1000 + 10} 千克`], '单位换算', 2);
  }},
  { kp: '估算', lv: 2, gen(b) {
    const a = ri(19, 49), c = ri(19, 49);
    const est = Math.round(a / 10) * 10 * (Math.round(c / 10) * 10);
    addQ(b, `估算 ${a} × ${c} 大约是？`, est, [est + 100, est - 100, est + 500], '估算', 3);
  }},
];

/* ============ 四年级 ============ */
TEMPLATES[4] = [
  { kp: '三位数乘两位数', lv: 2, gen(b) {
    const a = ri(105, 799), c = ri(12, 89);
    addQ(b, `${a} × ${c} = ?`, a * c, [a * c + a, a * c - c, a * c + 100, a + c], '三位数乘两位数', 2);
  }},
  { kp: '除数是两位数的除法', lv: 2, gen(b) {
    const c = ri(12, 79), a = ri(11, 60);
    addQ(b, `${a * c} ÷ ${c} = ?`, a, [a + 1, a - 1, a * 10, c], '除数是两位数的除法', 2);
  }},
  { kp: '四则混合运算', lv: 3, gen(b) {
    const a = ri(3, 12), c = ri(3, 12), d = ri(2, 20);
    addQ(b, `${a} × ${c} + ${d} = ?`, a * c + d, [a * c + d + a, (a + c) * d, a * (c + d), a * c], '四则混合运算', 3);
    const x = ri(10, 40), y = ri(2, 9), z = ri(2, 9);
    addQ(b, `${x} × ${y} − ${z} × ${y} = ?`, (x - z) * y, [x * y - z, x * y + z, (x - z) * z, x - z], '四则混合运算', 3);
  }},
  { kp: '大数的认识', lv: 2, gen(b) {
    const w = ri(12, 980);
    addQ(b, `${w}0000 改写成用“万”作单位的数是？`, `${w}万`, [`${w}0万`, `${w}亿`, `${w / 10}万`], '大数的认识', 2);
    const n = ri(1000, 9999);
    addQ(b, `${n} 省略百位后面的尾数约是？`, `${Math.round(n / 100) * 100}`, [`${Math.floor(n / 100) * 100}`, `${Math.floor(n / 1000) * 1000}`, `${n + 100}`], '大数的认识', 3);
  }},
  { kp: '公顷与平方千米', lv: 3, gen(b) {
    const h = ri(2, 9);
    addQ(b, `${h} 公顷 = 多少平方米？`, `${h * 10000} 平方米`, [`${h * 1000} 平方米`, `${h * 100} 平方米`, `${h * 100000} 平方米`], '公顷与平方千米', 3);
  }},
  { kp: '角的度量', lv: 2, gen(b) {
    const a = ri(20, 89);
    addQ(b, `一个角是 ${a}°，它的余角是多少度？`, `${90 - a}°`, [`${180 - a}°`, `${a}°`, `${90 + a}°`], '角的度量', 3);
    const bd = pick([30, 45, 60, 90, 120, 135]);
    addQ(b, `一个角是 ${bd}°，它的补角是多少度？`, `${180 - bd}°`, [`${90 - bd}°`, `${bd}°`, `${360 - bd}°`], '角的度量', 3);
  }},
  { kp: '平均数', lv: 2, gen(b) {
    const k = 4, base = ri(70, 90);
    const arr = [base, base + ri(2, 8), base - ri(2, 6), base + ri(1, 6)];
    const sum = arr.reduce((x, y) => x + y, 0);
    if (sum % k === 0) addQ(b, `四次成绩分别是 ${arr.join('、')}，平均分是多少？`, sum / k, [sum / k + 1, sum / k - 1, sum / k + 2], '平均数', 3);
    const avg = ri(60, 90), cnt = 4;
    addQ(b, `${cnt} 个数的平均数是 ${avg}，它们的总和是多少？`, avg * cnt, [avg + cnt, avg * cnt + 4, avg * cnt - 4], '平均数', 3);
  }},
  { kp: '速度时间路程', lv: 2, gen(b) {
    const v = ri(40, 90), t = ri(2, 8);
    addQ(b, `汽车每小时行 ${v} 千米，${t} 小时行多少千米？`, `${v * t} 千米`, [`${v + t} 千米`, `${v * t + 10} 千米`, `${v * t - 10} 千米`], '速度时间路程', 2);
    const v2 = ri(50, 90), d = v2 * ri(2, 6);
    addQ(b, `路程 ${d} 千米，速度每小时 ${v2} 千米，需要几小时？`, `${d / v2} 小时`, [`${d / v2 + 1} 小时`, `${d / v2 - 1} 小时`, `${d} 小时`], '速度时间路程', 3);
  }},
];

/* ============ 五年级 ============ */
TEMPLATES[5] = [
  { kp: '小数乘法', lv: 2, gen(b) {
    const a = ri(11, 49) / 10, c = ri(2, 9);
    addQ(b, `${fmt(a)} × ${c} = ?`, fmt(a * c), [fmt(a * c * 10), fmt(a * c / 10), fmt(a * c + 0.1)], '小数乘法', 2);
  }},
  { kp: '小数除法', lv: 2, gen(b) {
    const a = ri(2, 9), c = ri(2, 9);
    const d = a * c;
    addQ(b, `${fmt(d / 10)} ÷ ${a} = ?`, fmt(c / 10), [fmt(c), fmt(c / 100), fmt(c / 10 + 1)], '小数除法', 3);
  }},
  { kp: '分数加减', lv: 3, gen(b) {
    const d = pick([12, 15, 18, 20, 24]);
    const n1 = ri(1, d / 2 - 1), n2 = ri(1, d / 2 - 1);
    if ((n1 + n2) % d === 0) return;
    addQ(b, `${n1}/${d} + ${n2}/${d} = ?`, `${n1 + n2}/${d}`, [`${n1 + n2}/${d * 2}`, `${n1 * n2}/${d}`, `${n1 + n2 + 1}/${d}`], '分数加减', 3);
  }},
  { kp: '因数与倍数', lv: 3, gen(b) {
    const g = pick([6, 8, 9, 10, 12]);
    const a = g * ri(2, 5), c = g * ri(3, 7);
    const gcd = (x, y) => (y ? gcd(y, x % y) : x);
    addQ(b, `${a} 和 ${c} 的最大公因数是？`, gcd(a, c), [Math.min(a, c), g * 2, gcd(a, c) * 2], '因数与倍数', 3);
    addQ(b, `${a} 和 ${c} 的最小公倍数是？`, (a * c) / gcd(a, c), [a * c, Math.max(a, c), (a * c) / gcd(a, c) + 1], '因数与倍数', 3);
  }},
  { kp: '多边形面积', lv: 2, gen(b) {
    const base = ri(6, 18), h = ri(3, 12);
    addQ(b, `平行四边形底 ${base} 厘米，高 ${h} 厘米，面积是多少？`, `${base * h} 平方厘米`, [`${base * h / 2} 平方厘米`, `${base + h} 平方厘米`, `${base * h + base} 平方厘米`], '多边形面积', 2);
    const b1 = ri(3, 9), b2 = b1 + 2 * ri(1, 4), hh = ri(2, 8);
    addQ(b, `梯形上底 ${b1} 厘米，下底 ${b2} 厘米，高 ${hh} 厘米，面积是多少？`, `${(b1 + b2) * hh / 2} 平方厘米`, [`${(b1 + b2) * hh} 平方厘米`, `${(b1 + b2) * hh / 2 + hh} 平方厘米`, `${b1 + b2 + hh} 平方厘米`], '多边形面积', 3);
  }},
  { kp: '长方体与正方体', lv: 3, gen(b) {
    const l = ri(2, 8), w = ri(2, 8), h = ri(2, 8);
    addQ(b, `长方体长 ${l} 厘米、宽 ${w} 厘米、高 ${h} 厘米，体积是多少？`, `${l * w * h} 立方厘米`, [`${2 * (l * w + l * h + w * h)} 立方厘米`, `${l * w + h} 立方厘米`, `${l + w + h} 立方厘米`], '长方体与正方体', 3);
    addQ(b, `长方体长 ${l} 厘米、宽 ${w} 厘米、高 ${h} 厘米，表面积是多少？`, `${2 * (l * w + l * h + w * h)} 平方厘米`, [`${l * w * h} 平方厘米`, `${l * w + l * h + w * h} 平方厘米`, `${4 * (l + w + h)} 平方厘米`], '长方体与正方体', 3);
  }},
  { kp: '体积单位换算', lv: 3, gen(b) {
    const m = ri(2, 9);
    addQ(b, `${m} 立方米 = 多少立方分米？`, `${m * 1000} 立方分米`, [`${m * 100} 立方分米`, `${m * 10} 立方分米`, `${m * 10000} 立方分米`], '体积单位换算', 3);
  }},
  { kp: '简易方程', lv: 2, gen(b) {
    const x = ri(2, 19), bb = ri(2, 19);
    addQ(b, `x + ${bb} = ${x + bb}，x = ?`, x, [x + bb, x + 1, bb], '简易方程', 2);
    const y = ri(2, 9), c = ri(2, 9);
    addQ(b, `${y}x = ${y * c}，x = ?`, c, [y * c, c + 1, y], '简易方程', 3);
  }},
  { kp: '植树问题', lv: 3, gen(b) {
    const len = ri(20, 100), gap = ri(2, 10);
    if (len % gap !== 0) return;
    addQ(b, `一条 ${len} 米的小路，每隔 ${gap} 米栽一棵树（两端都栽），共栽多少棵？`, len / gap + 1, [len / gap, len / gap - 1, len / gap + 2], '植树问题', 3);
  }},
  { kp: '鸡兔同笼', lv: 3, gen(b) {
    const chicken = ri(3, 12), rabbit = ri(2, 10);
    const heads = chicken + rabbit, feet = chicken * 2 + rabbit * 4;
    addQ(b, `鸡兔同笼，共 ${heads} 个头、${feet} 只脚，鸡有几只？`, chicken, [rabbit, chicken + 1, chicken - 1], '鸡兔同笼', 3);
  }},
];

/* ============ 六年级 ============ */
TEMPLATES[6] = [
  { kp: '分数乘除', lv: 2, gen(b) {
    const gcd = (x, y) => (y ? gcd(y, x % y) : x);
    const d1 = pick([3, 4, 5, 6, 8]), n1 = ri(1, d1 - 1);
    const d2 = pick([3, 4, 5, 6, 8]), n2 = ri(1, d2 - 1);
    const num = n1 * n2, den = d1 * d2, gg = gcd(num, den);
    addQ(b, `${n1}/${d1} × ${n2}/${d2} = ?`, `${num / gg}/${den / gg}`, [`${n1 + n2}/${d1 + d2}`, `${num}/${den}`, `${n1 * d2}/${d1 * n2}`], '分数乘除', 3);
    const dn = d1 * n2, nn = n1 * d2, g2 = gcd(nn, dn);
    if (nn / g2 !== dn / g2) {
      addQ(b, `${n1}/${d1} ÷ ${n2}/${d2} = ?`, `${nn / g2}/${dn / g2}`, [`${n2}/${d2}`, `${n1 * n2}/${d1 * d2}`, `${nn + 1}/${dn}`], '分数乘除', 3);
    }
  }},
  { kp: '比', lv: 2, gen(b) {
    const k1 = ri(2, 6), k2 = ri(2, 7);
    const mul = ri(2, 5);
    addQ(b, `${k1 * mul}:${k2 * mul} 化成最简整数比是？`, `${k1}:${k2}`, [`${k1 * mul}:${k2}`, `${k1}:${k2 * mul}`, `${k1 + 1}:${k2}`], '比', 2);
  }},
  { kp: '百分数', lv: 2, gen(b) {
    const total = pick([40, 50, 80, 100, 200]), pct = pick([10, 20, 25, 50, 75]);
    addQ(b, `${total} 的 ${pct}% 是多少？`, (total * pct) / 100, [(total * pct) / 100 + 5, (total * pct) / 100 - 5, total / pct], '百分数', 2);
    const orig = pick([80, 120, 200, 400]), disc = pick([8, 9]);
    addQ(b, `一件商品原价 ${orig} 元，打 ${disc} 折后售价是多少元？`, fmt(orig * disc / 10), [fmt(orig * disc / 100), fmt(orig - disc), fmt(orig + disc)], '百分数', 3);
  }},
  { kp: '圆', lv: 3, gen(b) {
    const r = ri(2, 10);
    addQ(b, `圆的半径是 ${r} 厘米，周长是多少厘米？（π取3.14）`, fmt(2 * 3.14 * r), [fmt(3.14 * r), fmt(3.14 * r * r), fmt(2 * 3.14 * r + 3.14)], '圆', 3);
    addQ(b, `圆的半径是 ${r} 厘米，面积是多少平方厘米？（π取3.14）`, fmt(3.14 * r * r), [fmt(2 * 3.14 * r), fmt(3.14 * r), fmt(3.14 * r * r * 2)], '圆', 3);
  }},
  { kp: '圆柱与圆锥', lv: 3, gen(b) {
    const s = ri(5, 30), h = ri(3, 12);
    addQ(b, `圆柱底面积 ${s} 平方厘米，高 ${h} 厘米，体积是多少立方厘米？`, s * h, [s * h / 3, s + h, s * h * 3], '圆柱与圆锥', 3);
    addQ(b, `圆锥底面积 ${s} 平方厘米，高 ${h} 厘米，体积是多少立方厘米？`, fmt(s * h / 3), [s * h, fmt(s * h / 2), s + h], '圆柱与圆锥', 3);
  }},
  { kp: '负数', lv: 2, gen(b) {
    const a = ri(1, 9), c = ri(1, 9);
    if (a === c) return;
    addQ(b, `−${a} 和 −${c} 相比，哪个数大？`, a < c ? `−${a}` : `−${c}`, [a < c ? `−${c}` : `−${a}`, '一样大', '无法比较'], '负数', 3);
    addQ(b, `比 0 小 ${a} 的数是？`, `−${a}`, [`${a}`, `0`, `−${a + 1}`], '负数', 2);
  }},
  { kp: '比例尺', lv: 3, gen(b) {
    const scale = pick([100000, 500000, 1000000, 2000000]);
    const cm = ri(2, 9);
    addQ(b, `比例尺是 1:${scale}，图上 ${cm} 厘米表示实际多少千米？`, `${fmt(cm * scale / 100000)} 千米`, [`${fmt(cm * scale / 10000)} 千米`, `${fmt(cm * scale / 1000)} 千米`, `${cm} 千米`], '比例尺', 3);
  }},
  { kp: '利息与折扣', lv: 3, gen(b) {
    const p = pick([1000, 2000, 5000]), rate = pick([2, 3, 4]), years = ri(1, 3);
    addQ(b, `存 ${p} 元，年利率 ${rate}%，存 ${years} 年，利息是多少元？`, fmt(p * rate / 100 * years), [fmt(p * rate / 100), fmt(p + p * rate / 100 * years), fmt(p * rate * years)], '利息与折扣', 3);
  }},
  { kp: '按比例分配', lv: 3, gen(b) {
    const k1 = ri(1, 4), k2 = ri(1, 5);
    const unit = ri(10, 50);
    const total = (k1 + k2) * unit;
    addQ(b, `把 ${total} 按 ${k1}:${k2} 分配，较多的一份是多少？`, Math.max(k1, k2) * unit, [Math.min(k1, k2) * unit, total / 2, Math.max(k1, k2) * unit + unit], '按比例分配', 3);
  }},
];

/* ---------- 补充知识点：方向位置 / 图形运动 / 统计与概率 ---------- */
TEMPLATES[2].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '地图上通常是“上北下南”，那么地图的左边是哪个方向？', '西', ['东', '北', '南'], '方向与位置', 2);
  addQ(b, '地图上通常是“上北下南”，那么地图的右边是哪个方向？', '东', ['西', '北', '南'], '方向与位置', 2);
  addQ(b, '小明在小红的东面，那么小红在小明的？', '西面', ['东面', '南面', '北面'], '方向与位置', 3);
}});
TEMPLATES[3].push({ kp: '图形的运动', lv: 2, gen(b) {
  const shapes = [['正方形', 4], ['长方形', 2], ['等边三角形', 3], ['圆', 0], ['等腰三角形', 1]];
  const [name, n] = pick(shapes);
  if (n === 0) addQ(b, '圆有多少条对称轴？', '无数条', ['1条', '2条', '4条'], '图形的运动', 3);
  else addQ(b, `${name}有几条对称轴？`, `${n}条`, [`${n + 1}条`, `${Math.max(1, n - 1)}条`, `${n + 2}条`], '图形的运动', 3);
}});
TEMPLATES[4].push({ kp: '统计与可能性', lv: 2, gen(b) {
  const r = ri(1, 8), w = ri(1, 8);
  if (r !== w) addQ(b, `袋子里有 ${r} 个红球、${w} 个白球，任意摸一个，摸到红球的可能性比白球？`,
    r > w ? '大' : '小', [r > w ? '小' : '大', '一样大', '无法判断'], '统计与可能性', 3);
  const d1 = ri(2, 6), d2 = d1 + ri(1, 4);
  addQ(b, `转盘上红色占 ${d1} 份、黄色占 ${d2} 份，指针停在哪种颜色的可能性小？`, '红色', ['黄色', '一样大', '无法判断'], '统计与可能性', 3);
}});
TEMPLATES[5].push({ kp: '统计图', lv: 2, gen(b) {
  addQ(b, '要清楚地看出各种数量的多少，最适合用哪种统计图？', '条形统计图', ['折线统计图', '扇形统计图', '统计表'], '统计图', 2);
  addQ(b, '要表示数量增减变化的情况，最适合用哪种统计图？', '折线统计图', ['条形统计图', '扇形统计图', '统计表'], '统计图', 3);
}});
TEMPLATES[6].push({ kp: '扇形统计图', lv: 3, gen(b) {
  const pct = pick([10, 20, 25, 30, 40, 50, 60, 75]);
  addQ(b, `扇形统计图中，某部分占整体的 ${pct}%，它对应的圆心角是多少度？`, `${pct * 3.6}°`, [`${pct}°`, `${pct * 3.6 + 36}°`, `${360 - pct * 3.6}°`], '扇形统计图', 3);
}});


/* ================== 补齐：数与代数 ================== */
TEMPLATES[2].push({ kp: '数的认识', lv: 2, gen(b) {
  const n = ri(120, 989);
  const h = Math.floor(n / 100), t = Math.floor(n / 10) % 10, o = n % 10;
  addQ(b, `${n} 中，十位上的数字是几？`, t, [h, o, h + t], '数的认识', 2);
  addQ(b, `${h} 个百、${t} 个十和 ${o} 个一组成的数是？`, n, [n + 10, n - 10, h * 100 + t * 10], '数的认识', 2);
  addQ(b, `比 ${n} 大 1 的数是？`, n + 1, [n - 1, n + 10, n + 2], '数的认识', 1);
}});
TEMPLATES[3].push({ kp: '数的认识', lv: 2, gen(b) {
  const n = ri(1000, 9999);
  const th = Math.floor(n / 1000), hu = Math.floor(n / 100) % 10;
  addQ(b, `${n} 中，千位上的数字是几？`, th, [hu, n % 10, Math.floor(n / 10) % 10], '数的认识', 2);
  addQ(b, `由 ${th} 个千和 ${hu} 个百组成的数是？`, th * 1000 + hu * 100, [th * 1000 + hu * 10, th * 100 + hu * 1000, th * 1000 + hu], '数的认识', 2);
}});
TEMPLATES[4].push({ kp: '数的认识', lv: 2, gen(b) {
  addQ(b, '最小的六位数是多少？', 100000, [99999, 100001, 10000], '数的认识', 2);
  addQ(b, '一亿里面有多少个一千万？', 10, [100, 1000, 10000], '数的认识', 2);
  const n = ri(2, 9);
  addQ(b, `${n}0000 省略万位后面的尾数约是多少万？`, `${n}万`, [`${n + 1}万`, `${n - 1}万`, `${n}0万`], '数的认识', 3);
}});
TEMPLATES[3].push({ kp: '小数的认识', lv: 2, gen(b) {
  const n = ri(1, 9);
  addQ(b, `0.${n} 表示把一个整体平均分成 10 份，取其中的几份？`, `${n} 份`, [`${10 - n} 份`, '1 份', '10 份'], '小数的认识', 2);
  addQ(b, `把 1 米平均分成 10 份，其中 3 份是多少米？`, '0.3 米', ['3 米', '0.03 米', '1.3 米'], '小数的认识', 2);
}});
TEMPLATES[4].push({ kp: '小数的认识', lv: 2, gen(b) {
  const a = (ri(10, 99) / 10).toFixed(1), c = (ri(10, 99) / 10).toFixed(1);
  const big = Math.max(a, c), small = Math.min(a, c);
  if (big !== small) addQ(b, `${big} 和 ${small} 中，较大的数是？`, big, [small, `${small}0`, `${big}0`], '小数的认识', 2);
  addQ(b, '小数点右边第一位是什么位？', '十分位', ['百分位', '千分位', '个位'], '小数的认识', 1);
}});
TEMPLATES[3].push({ kp: '分数的认识', lv: 2, gen(b) {
  const d = ri(3, 9), n = ri(1, d - 1);
  addQ(b, `把一个整体平均分成 ${d} 份，取其中 ${n} 份，用分数表示是？`, `${n}/${d}`, [`${d}/${n}`, `${n + 1}/${d}`, `${n}/${d + 1}`], '分数的认识', 2);
  addQ(b, `${n}/${d} 的分数单位是？`, `1/${d}`, [`1/${n}`, `${n}/${d}`, `1/${d + 1}`], '分数的认识', 3);
}});
TEMPLATES[4].push({ kp: '分数的认识', lv: 2, gen(b) {
  const d = pick([2, 4, 5, 8]), k = ri(1, d - 1);
  addQ(b, `${k}/${d} 表示把单位“1”平均分成 ${d} 份取 ${k} 份，也可以看成把整体平均分成 ${d / gcd2(k, d)} 份取几份？`, `${k / gcd2(k, d)} 份`, [`${k} 份`, `${d} 份`, `${k + 1} 份`], '分数的认识', 3);
  addQ(b, '分子和分母相同的分数（0 除外）等于？', 1, [0, 2, 0.5], '分数的认识', 2);
}});
TEMPLATES[5].push({ kp: '分数的认识', lv: 2, gen(b) {
  const d = ri(3, 12), d2 = ri(3, 12);
  const v1 = 1 / d, v2 = 1 / d2;
  if (d !== d2) addQ(b, `1/${Math.max(d, d2)} 和 1/${Math.min(d, d2)} 相比，哪个大？`, `1/${Math.min(d, d2)}`, [`1/${Math.max(d, d2)}`, '一样大', '无法比较'], '分数的认识', 3);
  addQ(b, '分数的分子相当于除法中的什么？', '被除数', ['除数', '商', '余数'], '分数的认识', 2);
}});
TEMPLATES[3].push({ kp: '加减法', lv: 2, gen(b) {
  const a = ri(120, 880), c = ri(120, 880);
  addQ(b, `${a} + ${c} = ?`, a + c, [a + c + 10, a + c - 10, a + c + 100], '加减法', 2);
  addQ(b, `${a + c + 50} − ${a} = ?`, c + 50, [c, c + 40, c + 60], '加减法', 2);
}});
TEMPLATES[5].push({ kp: '四则混合运算', lv: 2, gen(b) {
  const a = ri(2, 12), c = ri(2, 9), d = ri(2, 20);
  addQ(b, `${a} × ${c} + ${d} = ?`, a * c + d, [a * (c + d), a * c - d, a + c * d], '四则混合运算', 2);
  addQ(b, `计算 ${d} + ${a} × ${c} 时，应该先算什么？`, '先算乘法', ['先算加法', '从左往右算', '先算减法'], '四则混合运算', 1);
}});
TEMPLATES[4].push({ kp: '运算定律', lv: 2, gen(b) {
  const a = ri(11, 89), c = ri(11, 89);
  const law = ri(1, 3);
  if (law === 1) addQ(b, `${a} + ${c} = ${c} + ${a} 用的是？`, '加法交换律', ['加法结合律', '乘法交换律', '乘法分配律'], '运算定律', 2);
  else if (law === 2) addQ(b, `(${a} + ${c}) + ${a} = ${a} + (${c} + ${a}) 用的是？`, '加法结合律', ['加法交换律', '乘法交换律', '乘法分配律'], '运算定律', 2);
  else addQ(b, `${a} × (${c} + 1) = ${a} × ${c} + ${a} 用的是？`, '乘法分配律', ['加法交换律', '加法结合律', '乘法结合律'], '运算定律', 3);
  const k = pick([2, 4, 5, 8, 25]);
  addQ(b, `${k} × 25 × 4 = ${k} × (25 × 4)，用的是？`, '乘法结合律', ['乘法交换律', '乘法分配律', '加法结合律'], '运算定律', 3);
  addQ(b, '125 × 8 = ?', 1000, [100, 10000, 800], '运算定律', 2);
}});
TEMPLATES[4].push({ kp: '小数四则运算', lv: 2, gen(b) {
  const a = ri(10, 99) / 10, c = ri(10, 99) / 10;
  const sum = Math.round((a + c) * 10) / 10;
  addQ(b, `${a} + ${c} = ?`, sum, [Math.round((sum + 0.1) * 10) / 10, Math.round((sum - 0.1) * 10) / 10, Math.round((sum + 1) * 10) / 10], '小数四则运算', 2);
  const x = ri(2, 9) / 10, y = ri(2, 9);
  const p = Math.round(x * y * 10) / 10;
  addQ(b, `${x} × ${y} = ?`, p, [Math.round(p * 10) / 10, Math.round((p + 1) * 10) / 10, Math.round((p - 0.1) * 10) / 10], '小数四则运算', 3);
}});
TEMPLATES[5].push({ kp: '小数四则运算', lv: 2, gen(b) {
  const a = ri(20, 99) / 10, c = ri(2, 9) / 10;
  const q = Math.round((a / c) * 100) / 100;
  addQ(b, `${a} ÷ ${c} = ?`, q, [Math.round(q * 10), Math.round((q + 1) * 100) / 100, Math.round((q * 10) * 100) / 100], '小数四则运算', 3);
  const x = ri(11, 49) / 10;
  addQ(b, `${x} × 10 = ?`, Math.round(x * 100) / 10, [Math.round(x * 100), Math.round(x * 1000) / 100, Math.round(x * 10) / 10], '小数四则运算', 2);
}});
TEMPLATES[5].push({ kp: '分数四则运算', lv: 3, gen(b) {
  const d = pick([3, 4, 5, 6, 8, 10]);
  const a = ri(1, d - 2), c = ri(1, d - a - 1 > 0 ? d - a - 1 : 1);
  const sum = a + c;
  if (sum < d) addQ(b, `${a}/${d} + ${c}/${d} = ?`, `${sum}/${d}`, [`${sum}/${d + 1}`, `${sum + 1}/${d}`, `${a * c}/${d}`], '分数四则运算', 3);
  const n1 = ri(1, 5), d1 = pick([2, 3, 4, 5]);
  const n2 = ri(1, 5), d2 = pick([2, 3, 4, 5]);
  const num = n1 * n2, den = d1 * d2;
  const gg = gcd2(num, den);
  addQ(b, `${n1}/${d1} × ${n2}/${d2} = ?`, `${num / gg}/${den / gg}`, [`${n1 + n2}/${d1 + d2}`, `${num}/${den + 1}`, `${num + 1}/${den}`], '分数四则运算', 3);
}});
TEMPLATES[6].push({ kp: '分数四则运算', lv: 3, gen(b) {
  const d1 = pick([2, 3, 4, 5, 6]), n1 = ri(1, d1 - 1);
  const d2 = pick([2, 3, 4, 5, 6]), n2 = ri(1, d2 - 1);
  const nn = n1 * d2, dd = d1 * n2, g1 = gcd2(nn, dd);
  if (nn / g1 !== dd / g1) addQ(b, `${n1}/${d1} ÷ ${n2}/${d2} = ?`, `${nn / g1}/${dd / g1}`, [`${n2}/${d2}`, `${n1 * n2}/${d1 * d2}`, `${nn + 1}/${dd}`], '分数四则运算', 3);
  const whole = ri(2, 9), part = pick([2, 3, 4, 5]);
  addQ(b, `${whole} 的 1/${part} 是多少？`, `${whole}/${part}`, [`${whole * part}`, `${whole - part}`, `${part}/${whole}`], '分数四则运算', 2);
}});
TEMPLATES[4].push({ kp: '估算', lv: 2, gen(b) {
  const a = ri(101, 499), c = ri(101, 499);
  const est = Math.round(a / 100) * 100 + Math.round(c / 100) * 100;
  addQ(b, `估算 ${a} + ${c}，结果大约是多少？`, est, [est + 100, est - 100, est + 10], '估算', 2);
  const m = ri(2, 9), n = ri(11, 49);
  addQ(b, `估算 ${n} × ${m}，结果大约是多少？`, Math.round(n / 10) * 10 * m, [Math.round(n / 10) * 10 * m + 100, Math.round(n / 10) * 10 * m - 100, n * m + 50], '估算', 3);
}});
TEMPLATES[2].push({ kp: '单位换算', lv: 2, gen(b) {
  const n = ri(2, 9);
  addQ(b, `${n} 米 = ? 厘米`, n * 100, [n * 10, n * 1000, n * 100 + 10], '单位换算', 2);
  addQ(b, `${n} 元 = ? 角`, n * 10, [n, n * 100, n * 10 + 10], '单位换算', 2);
}});
TEMPLATES[4].push({ kp: '单位换算', lv: 2, gen(b) {
  const n = ri(2, 9);
  addQ(b, `${n} 吨 = ? 千克`, n * 1000, [n * 100, n * 10, n * 1000 + 100], '单位换算', 2);
  addQ(b, `${n} 公顷 = ? 平方米`, n * 10000, [n * 1000, n * 100, n * 10000 + 1000], '单位换算', 3);
}});
TEMPLATES[5].push({ kp: '单位换算', lv: 2, gen(b) {
  const n = ri(2, 9);
  addQ(b, `${n} 升 = ? 毫升`, n * 1000, [n * 100, n * 10, n * 1000 + 500], '单位换算', 2);
  addQ(b, '1 立方米 = ? 立方分米', 1000, [100, 10000, 10], '单位换算', 3);
}});
TEMPLATES[1].push({ kp: '时间与日期', lv: 1, gen(b) {
  addQ(b, '钟面上，时针走一大格是几小时？', 1, [5, 12, 60], '时间与日期', 1);
  addQ(b, '分针走一圈，时针走多少？', '一大格', ['一小格', '一圈', '半圈'], '时间与日期', 2);
  const h = ri(1, 11);
  addQ(b, `${h} 时再过 1 小时是几时？`, h + 1, [h, h + 2, h - 1], '时间与日期', 1);
}});
TEMPLATES[2].push({ kp: '时间与日期', lv: 2, gen(b) {
  const n = ri(2, 5);
  addQ(b, `${n} 时 = ? 分`, n * 60, [n * 100, n * 30, n * 60 + 10], '时间与日期', 2);
  addQ(b, '一年有多少个月？', 12, [10, 24, 365], '时间与日期', 1);
}});
TEMPLATES[3].push({ kp: '时间与日期', lv: 2, gen(b) {
  addQ(b, '平年全年有多少天？', 365, [366, 360, 364], '时间与日期', 2);
  addQ(b, '闰年二月有多少天？', 29, [28, 30, 31], '时间与日期', 2);
  addQ(b, '下面哪个月是 31 天？', '七月', ['四月', '六月', '九月'], '时间与日期', 2);
  const n = ri(2, 4);
  addQ(b, `${n} 分 = ? 秒`, n * 60, [n * 100, n * 30, n * 60 + 6], '时间与日期', 2);
}});
TEMPLATES[2].push({ kp: '人民币', lv: 2, gen(b) {
  const y = ri(2, 9), j = ri(1, 9);
  addQ(b, `${y} 元 ${j} 角 = ? 角`, y * 10 + j, [y + j, y * 100 + j, y * 10], '人民币', 2);
  const price = ri(3, 9), pay = 10;
  addQ(b, `买一件 ${price} 元的文具，付 10 元，应找回多少元？`, pay - price, [pay - price + 1, pay - price - 1, price], '人民币', 2);
}});
TEMPLATES[6].push({ kp: '比与比例', lv: 3, gen(b) {
  const a = ri(2, 9), c = ri(2, 9), k = ri(2, 6);
  const g1 = gcd2(a, c);
  addQ(b, `${a * k} : ${c * k} 化成最简整数比是？`, `${a / g1}:${c / g1}`, [`${a}:${c + 1}`, `${c}:${a}`, `${a * k}:${c}`], '比与比例', 3);
  const x = ri(2, 9), y = ri(2, 9), m = ri(2, 6);
  addQ(b, `解比例：${x} : ${y} = ${x * m} : ?`, y * m, [y, y * m + y, x * m], '比与比例', 3);
}});
TEMPLATES[6].push({ kp: '正反比例', lv: 3, gen(b) {
  addQ(b, '单价一定时，总价和数量成什么比例？', '正比例', ['反比例', '不成比例', '无法确定'], '正反比例', 3);
  addQ(b, '路程一定时，速度和时间成什么比例？', '反比例', ['正比例', '不成比例', '无法确定'], '正反比例', 3);
  addQ(b, '圆的周长和直径成什么比例？', '正比例', ['反比例', '不成比例', '无法确定'], '正反比例', 3);
}});
TEMPLATES[6].push({ kp: '比例尺', lv: 3, gen(b) {
  const s = pick([100, 1000, 10000]);
  addQ(b, `比例尺 1:${s} 表示图上 1 厘米相当于实际多少厘米？`, s, [s / 10, s * 10, 1], '比例尺', 3);
  addQ(b, '图上距离 3 厘米，比例尺 1:1000，实际距离是多少厘米？', 3000, [300, 30000, 1000], '比例尺', 3);
}});

/* ================== 补齐：图形与几何 ================== */
TEMPLATES[1].push({ kp: '图形的认识', lv: 1, gen(b) {
  addQ(b, '长方形有几条边？', 4, [3, 5, 6], '图形的认识', 1);
  addQ(b, '下面哪个图形没有角？', '圆', ['三角形', '正方形', '长方形'], '图形的认识', 1);
  addQ(b, '正方形有几条边一样长？', 4, [2, 3, 5], '图形的认识', 1);
}});
TEMPLATES[2].push({ kp: '图形的认识', lv: 1, gen(b) {
  addQ(b, '三角形有几条边？', 3, [4, 5, 6], '图形的认识', 1);
  addQ(b, '长方形对边有什么关系？', '对边相等', ['四条边都相等', '对边不相等', '只有一条边长'], '图形的认识', 2);
  addQ(b, '下面哪个图形四条边都相等、四个角都是直角？', '正方形', ['长方形', '平行四边形', '梯形'], '图形的认识', 2);
}});
TEMPLATES[3].push({ kp: '图形的认识', lv: 2, gen(b) {
  addQ(b, '三角形三个内角的和是多少度？', '180°', ['90°', '360°', '270°'], '图形的认识', 2);
  addQ(b, '四边形四个内角的和是多少度？', '360°', ['180°', '270°', '540°'], '图形的认识', 2);
  addQ(b, '有一个角是直角的三角形叫？', '直角三角形', ['锐角三角形', '钝角三角形', '等边三角形'], '图形的认识', 2);
}});
TEMPLATES[4].push({ kp: '图形的认识', lv: 2, gen(b) {
  addQ(b, '下面哪个图形具有稳定性？', '三角形', ['平行四边形', '长方形', '正方形'], '图形的认识', 2);
  addQ(b, '平行四边形容易变形，是因为它', '不稳定', ['边不相等', '角不是直角', '没有对角线'], '图形的认识', 2);
  addQ(b, '圆的直径是半径的几倍？', 2, [1, 3, 4], '图形的认识', 2);
}});
TEMPLATES[3].push({ kp: '周长', lv: 2, gen(b) {
  const a = ri(5, 15), c = ri(2, a - 1);
  addQ(b, `长方形长 ${a} 厘米、宽 ${c} 厘米，周长是多少厘米？`, (a + c) * 2, [a + c, a * c, (a + c) * 4], '周长', 3);
  const s = ri(3, 12);
  addQ(b, `正方形边长 ${s} 厘米，周长是多少厘米？`, s * 4, [s * s, s * 2, s * 4 + s], '周长', 2);
}});
TEMPLATES[4].push({ kp: '周长', lv: 2, gen(b) {
  const a = ri(6, 20), c = ri(2, a - 1);
  addQ(b, `一个长方形周长 ${(a + c) * 2} 厘米，长 ${a} 厘米，宽是多少厘米？`, c, [c + 1, c - 1, a], '周长', 3);
  const s = ri(4, 16);
  addQ(b, `正方形周长 ${s * 4} 厘米，边长是多少厘米？`, s, [s * 2, s + 4, s - 2], '周长', 3);
}});
TEMPLATES[4].push({ kp: '面积', lv: 2, gen(b) {
  const a = ri(5, 15), c = ri(2, a - 1);
  addQ(b, `长方形长 ${a} 米、宽 ${c} 米，面积是多少平方米？`, a * c, [a + c, (a + c) * 2, a * c + a], '面积', 2);
  const s = ri(3, 12);
  addQ(b, `正方形边长 ${s} 分米，面积是多少平方分米？`, s * s, [s * 4, s + s, s * s + s], '面积', 2);
}});
TEMPLATES[5].push({ kp: '面积', lv: 3, gen(b) {
  const base = ri(4, 16), h = ri(2, 10);
  addQ(b, `三角形底 ${base} 厘米、高 ${h} 厘米，面积是多少平方厘米？`, (base * h) / 2, [base * h, base + h, (base * h) / 4], '面积', 3);
  const up = ri(2, 8), down = up + ri(1, 6), hh = ri(2, 8);
  addQ(b, `梯形上底 ${up} 厘米、下底 ${down} 厘米、高 ${hh} 厘米，面积是多少平方厘米？`, ((up + down) * hh) / 2, [(up + down) * hh, (up + down + hh) / 2, up * down], '面积', 3);
  const b1 = ri(4, 12), h1 = ri(2, 8);
  addQ(b, `平行四边形底 ${b1} 分米、高 ${h1} 分米，面积是多少平方分米？`, b1 * h1, [(b1 * h1) / 2, b1 + h1, (b1 + h1) * 2], '面积', 3);
}});
TEMPLATES[5].push({ kp: '表面积与体积', lv: 3, gen(b) {
  const a = ri(2, 6);
  addQ(b, `棱长 ${a} 厘米的正方体，表面积是多少平方厘米？`, 6 * a * a, [a * a * a, 4 * a * a, 12 * a], '表面积与体积', 3);
  addQ(b, `棱长 ${a} 厘米的正方体，体积是多少立方厘米？`, a * a * a, [6 * a * a, 3 * a, a * a], '表面积与体积', 3);
  const l = ri(4, 9), w = ri(2, l - 1), h = ri(2, 5);
  addQ(b, `长 ${l} 厘米、宽 ${w} 厘米、高 ${h} 厘米的长方体，体积是多少立方厘米？`, l * w * h, [2 * (l + w + h), l * w, (l + w) * h], '表面积与体积', 3);
}});
TEMPLATES[6].push({ kp: '表面积与体积', lv: 3, gen(b) {
  const r = pick([2, 3, 4, 5]), h = ri(3, 10);
  addQ(b, `圆柱底面半径 ${r} 厘米、高 ${h} 厘米，体积是多少立方厘米？（π 取 3.14）`, Math.round(3.14 * r * r * h * 100) / 100, [Math.round(3.14 * r * h * 100) / 100, Math.round(3.14 * r * r * h / 3 * 100) / 100, Math.round(2 * 3.14 * r * h * 100) / 100], '表面积与体积', 3);
  addQ(b, `圆锥底面半径 ${r} 厘米、高 ${h} 厘米，体积是等底等高圆柱体积的几分之几？`, '1/3', ['1/2', '1/4', '2/3'], '表面积与体积', 3);
}});
TEMPLATES[6].push({ kp: '圆', lv: 3, gen(b) {
  const r = pick([1, 2, 3, 4, 5, 10]);
  addQ(b, `半径 ${r} 厘米的圆，周长是多少厘米？（π 取 3.14）`, Math.round(2 * 3.14 * r * 100) / 100, [Math.round(3.14 * r * r * 100) / 100, Math.round(3.14 * r * 100) / 100, Math.round(2 * 3.14 * r * r * 100) / 100], '圆', 3);
  addQ(b, `半径 ${r} 厘米的圆，面积是多少平方厘米？（π 取 3.14）`, Math.round(3.14 * r * r * 100) / 100, [Math.round(2 * 3.14 * r * 100) / 100, Math.round(3.14 * r * 2 * 100) / 100, Math.round(3.14 * r * 100) / 100], '圆', 3);
}});
TEMPLATES[2].push({ kp: '图形的运动', lv: 2, gen(b) {
  addQ(b, '把一张纸对折后两边完全重合，这个图形是？', '轴对称图形', ['平移图形', '旋转图形', '相似图形'], '图形的运动', 2);
  addQ(b, '电梯上下运动属于什么现象？', '平移', ['旋转', '对称', '翻转'], '图形的运动', 2);
}});
TEMPLATES[3].push({ kp: '图形的运动', lv: 2, gen(b) {
  addQ(b, '钟表指针的转动属于什么现象？', '旋转', ['平移', '对称', '折叠'], '图形的运动', 2);
  addQ(b, '长方形有几条对称轴？', 2, [1, 4, '无数条'], '图形的运动', 2);
}});
TEMPLATES[4].push({ kp: '图形的运动', lv: 2, gen(b) {
  addQ(b, '等腰三角形有几条对称轴？', 1, [2, 3, 0], '图形的运动', 3);
  addQ(b, '等边三角形有几条对称轴？', 3, [1, 2, 0], '图形的运动', 3);
  const deg = pick([90, 180, 270, 360]);
  // 原来只会出一种"会改变吗→不会改变"，12 份出来是 12 道孪生题，答案还全一样
  const kind = ri(1, 4);
  if (kind === 1) addQ(b, `图形绕某点顺时针旋转 ${deg}° 后，形状和大小会改变吗？`, '不会改变', ['会变大', '会变小', '会变形'], '图形的运动', 2);
  else if (kind === 2) addQ(b, `图形绕某点顺时针旋转 ${deg}° 后，发生变化的是什么？`, '位置和方向', ['形状', '大小', '面积'], '图形的运动', 3);
  else if (kind === 3) addQ(b, '把一个图形向右平移 5 格，再向上平移 3 格，它的形状和大小', '不会改变', ['会变大', '会变小', '会变形'], '图形的运动', 2);
  else addQ(b, `长方形绕它的中心旋转 ${deg}° 后，和原图形`, '完全重合', ['变大一些', '变小一些', '不再重合'], '图形的运动', 3);
}});
TEMPLATES[5].push({ kp: '图形的运动', lv: 2, gen(b) {
  addQ(b, '圆有多少条对称轴？', '无数条', ['1条', '2条', '4条'], '图形的运动', 3);
  addQ(b, '平移和旋转的共同点是', '都不改变图形的形状和大小', ['都改变方向', '都改变大小', '都改变形状'], '图形的运动', 3);
}});
TEMPLATES[2].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '用数对表示位置时，先写什么？', '列', ['行', '角度', '距离'], '方向与位置', 2);
  addQ(b, '第 3 列第 2 行用数对表示是？', '(3,2)', ['(2,3)', '(3,3)', '(2,2)'], '方向与位置', 2);
}});
TEMPLATES[3].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '地图上通常是“上北下南”，那么东南方向在哪个角？', '右下角', ['左上角', '右上角', '左下角'], '方向与位置', 2);
  addQ(b, '面朝北时，右手边是什么方向？', '东', ['西', '南', '北'], '方向与位置', 2);
}});
TEMPLATES[4].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '数对 (5,3) 中，第一个数表示什么？', '列', ['行', '距离', '角度'], '方向与位置', 2);
  addQ(b, '从 A 点向东走 3 格再向北走 2 格，终点相对 A 点在什么方向？', '东北方', ['西北方', '东南方', '西南方'], '方向与位置', 3);
}});
TEMPLATES[5].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '描述物体的位置，除了方向还需要知道什么？', '距离', ['颜色', '大小', '形状'], '方向与位置', 2);
  addQ(b, '北偏东 30° 表示从北方向向东偏转多少度？', '30°', ['60°', '90°', '120°'], '方向与位置', 3);
}});
TEMPLATES[6].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '比例尺 1:1000 的图上，A 到 B 相距 2 厘米，实际相距多少米？', 20, [2, 200, 2000], '方向与位置', 3);
  addQ(b, '用方向和距离确定位置时，通常以什么为观测点？', '自己所在的位置', ['太阳', '地图中心', '最近的建筑物'], '方向与位置', 2);
}});
TEMPLATES[2].push({ kp: '观察物体', lv: 2, gen(b) {
  addQ(b, '从正面观察一个正方体，最多能看到几个面？', 1, [2, 3, 6], '观察物体', 2);
  addQ(b, '从不同位置观察同一个物体，看到的形状', '可能不同', ['一定相同', '一定不同', '完全无关'], '观察物体', 2);
}});
TEMPLATES[3].push({ kp: '观察物体', lv: 2, gen(b) {
  addQ(b, '站在正方体的一个角上观察，最多能看到几个面？', 3, [1, 2, 6], '观察物体', 3);
  addQ(b, '由 4 个同样的小正方体摆成一排，从正面看到的是', '4 个正方形排成一行', ['1 个正方形', '2 个正方形', '4 个正方形排成一列'], '观察物体', 3);
}});
TEMPLATES[4].push({ kp: '观察物体', lv: 2, gen(b) {
  addQ(b, '从上面看到的图形叫', '俯视图', ['正视图', '左视图', '侧视图'], '观察物体', 2);
  addQ(b, '两个物体从正面看形状相同，它们的实际形状', '不一定相同', ['一定相同', '一定不同', '无法观察'], '观察物体', 3);
}});
TEMPLATES[5].push({ kp: '观察物体', lv: 2, gen(b) {
  addQ(b, '根据从一个方向看到的图形，能确定物体的形状吗？', '不能，需要多个方向', ['能，一个方向就够', '完全无法判断', '只能确定大小'], '观察物体', 2);
  addQ(b, '从正面、上面、左面三个方向观察，通常可以确定', '物体的形状', ['物体的颜色', '物体的重量', '物体的温度'], '观察物体', 2);
}});

/* ================== 补齐：统计与概率 ================== */
TEMPLATES[3].push({ kp: '条形统计图', lv: 2, gen(b) {
  addQ(b, '条形统计图最大的优点是什么？', '能清楚地看出各种数量的多少', ['能看出数量增减变化', '能看出部分与整体的关系', '能预测未来'], '条形统计图', 2);
  const base1 = ri(6, 18), diff1 = ri(1, 6);
  const a = base1, c = base1 + (rnd() < 0.5 ? diff1 : -diff1);
  addQ(b, `统计图中甲班 ${a} 人、乙班 ${c} 人，哪个班人数多？`, a > c ? '甲班' : '乙班', [a > c ? '乙班' : '甲班', '一样多', '无法判断'], '条形统计图', 2);
}});
TEMPLATES[4].push({ kp: '条形统计图', lv: 2, gen(b) {
  addQ(b, '条形统计图的直条越长，表示数量', '越多', ['越少', '不变', '不确定'], '条形统计图', 1);
  const base2 = ri(12, 38), diff2 = ri(1, 8);
  const a = base2, c = base2 + (rnd() < 0.5 ? diff2 : -diff2);
  if (a !== c) addQ(b, `甲 ${a}、乙 ${c}，两者相差多少？`, Math.abs(a - c), [a + c, Math.abs(a - c) + 5, Math.abs(a - c) - 5], '条形统计图', 3);
}});
TEMPLATES[4].push({ kp: '折线统计图', lv: 2, gen(b) {
  addQ(b, '折线统计图最大的优点是什么？', '能清楚地表示数量增减变化的情况', ['能看出数量的多少', '能看出部分与整体的关系', '能比较不同类别'], '折线统计图', 2);
  addQ(b, '折线往上走表示数量在', '增加', ['减少', '不变', '归零'], '折线统计图', 1);
}});
TEMPLATES[5].push({ kp: '折线统计图', lv: 2, gen(b) {
  addQ(b, '要记录一周每天的气温变化，最适合用', '折线统计图', ['条形统计图', '扇形统计图', '统计表'], '折线统计图', 2);
  addQ(b, '折线统计图中，线段越陡说明变化', '越大', ['越小', '没有变化', '无法判断'], '折线统计图', 2);
}});
TEMPLATES[5].push({ kp: '平均数', lv: 2, gen(b) {
  const a = ri(60, 95), c = ri(60, 95), d = ri(60, 95);
  const sum = a + c + d;
  if (sum % 3 === 0) addQ(b, `三次成绩分别是 ${a}、${c}、${d}，平均分是多少？`, sum / 3, [sum / 3 + 1, sum / 3 - 1, sum / 3 + 10], '平均数', 3);
  addQ(b, '平均数能反映一组数据的', '整体水平', ['最大値', '最小值', '排列顺序'], '平均数', 2);
}});
TEMPLATES[5].push({ kp: '中位数与众数', lv: 3, gen(b) {
  const a = ri(1, 30), c = ri(31, 60), d = ri(61, 99);
  addQ(b, `数据 ${a}、${c}、${d} 的中位数是多少？`, c, [a, d, Math.round((a + c + d) / 3)], '中位数与众数', 3);
  const m = ri(2, 9);
  addQ(b, `数据 ${m}、${m + 1}、${m}、${m + 2}、${m} 中，众数是多少？`, m, [m + 1, m + 2, m - 1], '中位数与众数', 3);
}});
TEMPLATES[6].push({ kp: '中位数与众数', lv: 3, gen(b) {
  const a = ri(1, 20), c = ri(21, 40), d = ri(41, 60), e = ri(61, 80);
  addQ(b, `数据 ${a}、${c}、${d}、${e} 的中位数是哪两个数的平均？`, `${c} 和 ${d}`, [`${a} 和 ${c}`, `${d} 和 ${e}`, `${a} 和 ${e}`], '中位数与众数', 3);
  addQ(b, '一组数据中出现次数最多的数叫', '众数', ['中位数', '平均数', '众位'], '中位数与众数', 2);
}});
TEMPLATES[4].push({ kp: '可能性', lv: 2, gen(b) {
  addQ(b, '太阳从西边升起，这件事是', '不可能的', ['一定的', '可能的', '很可能'], '可能性', 1);
  const r = ri(1, 8), w = ri(1, 8);
  if (r !== w) addQ(b, `袋里有 ${r} 个红球、${w} 个白球，摸到红球的可能性比白球`,
    r > w ? '大' : '小', [r > w ? '小' : '大', '一样大', '无法判断'], '可能性', 3);
}});
TEMPLATES[5].push({ kp: '可能性', lv: 2, gen(b) {
  const t = ri(4, 10), b1 = ri(1, t - 1);
  addQ(b, `袋中 ${t} 个球中有 ${b1} 个黑球，任意摸一个是黑球的可能性是几分之几？`, `${b1}/${t}`, [`${t}/${b1}`, `${b1 + 1}/${t}`, `${b1}/${t + 1}`], '可能性', 3);
  addQ(b, '骰子掷出 7 点的可能性是', '0', ['1/6', '1/7', '1'], '可能性', 3);
}});

/* ================== 补齐：典型应用题 ================== */
TEMPLATES[3].push({ kp: '应用题', lv: 2, gen(b) {
  const a = ri(12, 45), c = ri(6, 9);
  addQ(b, `每盒有 ${c} 支铅笔，${a} 盒一共有多少支？`, a * c, [a + c, a * c + c, a * c - c], '应用题', 2);
  const total = ri(60, 200), used = ri(10, 50);
  addQ(b, `图书角有 ${total} 本书，借出 ${used} 本，还剩多少本？`, total - used, [total + used, total - used + 10, used], '应用题', 2);
}});
TEMPLATES[4].push({ kp: '应用题', lv: 3, gen(b) {
  const n = ri(3, 9), each = ri(12, 45), rest = ri(20, 80);
  addQ(b, `学校买了 ${n} 箱书，每箱 ${each} 本，又买了 ${rest} 本，一共多少本？`, n * each + rest, [n * each, n * each - rest, n + each + rest], '应用题', 3);
  const price = ri(3, 15), num = ri(2, 9);
  addQ(b, `每支笔 ${price} 元，买 ${num} 支需要多少元？`, price * num, [price + num, price * num + price, price * num - num], '应用题', 2);
}});
TEMPLATES[5].push({ kp: '应用题', lv: 3, gen(b) {
  const a = ri(20, 60), c = ri(2, 9);
  addQ(b, `果园有 ${a} 棵苹果树，梨树的棵数是苹果树的 ${c} 倍，梨树有多少棵？`, a * c, [a + c, a * c + a, a / c].map(v => Number.isInteger(v) ? v : a * c + 1), '应用题', 3);
  const total = ri(200, 600), part = ri(2, 5);
  addQ(b, `一本书 ${total} 页，已看 ${Math.floor(total / part)} 页，还剩多少页？`, total - Math.floor(total / part), [Math.floor(total / part), total + Math.floor(total / part), total - Math.floor(total / part) + 10], '应用题', 3);
}});
TEMPLATES[6].push({ kp: '应用题', lv: 3, gen(b) {
  const price = ri(20, 90), off = pick([0.8, 0.9, 0.75]);
  const pay = Math.round(price * off * 10) / 10;
  addQ(b, `一件商品原价 ${price} 元，打 ${off * 10} 折后是多少元？`, pay, [price, Math.round(price * (2 - off) * 10) / 10, Math.round((price - off) * 10) / 10], '应用题', 3);
  const total = ri(300, 900), pct = pick([10, 20, 25, 40]);
  addQ(b, `一本书共 ${total} 页，第一天看了全书的 ${pct}%，看了多少页？`, (total * pct) / 100, [(total * pct) / 100 + 10, total - (total * pct) / 100, pct], '应用题', 3);
}});
TEMPLATES[5].push({ kp: '植树问题', lv: 3, gen(b) {
  const n = ri(4, 12);
  addQ(b, `在一条 ${n * 5} 米长的小路一旁每隔 5 米栽一棵树（两端都栽），一共要栽多少棵？`, n + 1, [n, n - 1, n + 2], '植树问题', 3);
  addQ(b, `把一根木头锯成 ${n} 段，需要锯几次？`, n - 1, [n, n + 1, n - 2], '植树问题', 3);
}});
TEMPLATES[5].push({ kp: '行程问题', lv: 3, gen(b) {
  const v = ri(40, 90), t = ri(2, 6);
  addQ(b, `一辆汽车每小时行 ${v} 千米，${t} 小时行多少千米？`, v * t, [v + t, v * t + v, v * t - t], '行程问题', 3);
  const a = ri(40, 70), c = ri(40, 70), h = ri(2, 5);
  if (a !== c) addQ(b, `两人同时从相距 ${(a + c) * h} 千米的两地相向而行，速度分别每小时 ${a} 千米和 ${c} 千米，几小时相遇？`, h, [h + 1, h - 1, Math.round((a + c) / 2)], '行程问题', 3);
}});
TEMPLATES[6].push({ kp: '行程问题', lv: 3, gen(b) {
  const v = ri(50, 90), t = ri(2, 6);
  addQ(b, `甲地到乙地 ${v * t} 千米，汽车每小时行 ${v} 千米，需要几小时？`, t, [t + 1, t - 1, v], '行程问题', 3);
  const fast = ri(60, 90), slow = ri(30, 55);
  if (fast > slow) addQ(b, `两人同地同时同向而行，速度分别每小时 ${fast} 千米和 ${slow} 千米，1 小时后相距多少千米？`, fast - slow, [fast + slow, slow, fast], '行程问题', 3);
}});
TEMPLATES[6].push({ kp: '工程问题', lv: 3, gen(b) {
  addQ(b, '一项工程甲单独做 6 天完成，甲每天完成这项工程的几分之几？', '1/6', ['1/3', '6', '1/12'], '工程问题', 3);
  addQ(b, '甲 4 天完成、乙 6 天完成同一项工程，两人合作一天完成几分之几？', '5/12', ['1/10', '1/2', '2/5'], '工程问题', 3);
  addQ(b, '一项工程甲单独做 10 天完成，乙单独做 15 天完成，两人合作几天完成？', 6, [5, 12, 25], '工程问题', 3);
}});
TEMPLATES[4].push({ kp: '和差倍问题', lv: 3, gen(b) {
  const small = ri(10, 40), diff = ri(2, 20);
  const big = small + diff;
  addQ(b, `两数之和是 ${small + big}，差是 ${diff}，较大的数是多少？`, big, [small, small + diff + 1, big + diff], '和差倍问题', 3);
  addQ(b, `两数之和是 ${small + big}，差是 ${diff}，较小的数是多少？`, small, [big, small - 1, small + 1], '和差倍问题', 3);
}});
TEMPLATES[5].push({ kp: '和差倍问题', lv: 3, gen(b) {
  const small = ri(6, 20), k = ri(2, 5);
  const big = small * k, sum = small + big;
  addQ(b, `甲数是乙数的 ${k} 倍，两数之和是 ${sum}，乙数是多少？`, small, [big, small + k, small - 1], '和差倍问题', 3);
  addQ(b, `甲数是乙数的 ${k} 倍，两数之和是 ${sum}，甲数是多少？`, big, [small, sum - big + 1, big + k], '和差倍问题', 3);
}});
TEMPLATES[4].push({ kp: '优化与搭配', lv: 3, gen(b) {
  const a = ri(2, 4), c = ri(2, 4);
  addQ(b, `${a} 件上衣和 ${c} 条裤子搭配，一共有几种穿法？`, a * c, [a + c, a * c + 1, a * c - 1], '优化与搭配', 3);
  addQ(b, '沏茶时，为了尽快喝上茶，应该先做什么？', '烧水的同时洗茶杯、找茶叶', ['先洗茶杯再烧水', '先找茶叶再烧水', '一件一件慢慢做'], '优化与搭配', 3);
}});
TEMPLATES[5].push({ kp: '优化与搭配', lv: 3, gen(b) {
  const n = ri(3, 6);
  addQ(b, `${n} 个人两两握手一次，一共握手多少次？`, (n * (n - 1)) / 2, [n * n, n * (n - 1), n + (n - 1)], '优化与搭配', 3);
  addQ(b, '烙一张饼要 4 分钟（每面 2 分钟），一次能烙 2 张，烙 3 张饼最少要几分钟？', 6, [8, 10, 12], '优化与搭配', 3);
}});
TEMPLATES[1].push({ kp: '找规律', lv: 2, gen(b) {
  const s = ri(1, 5), step = ri(1, 3);
  addQ(b, `找规律填数：${s}、${s + step}、${s + step * 2}、?`, s + step * 3, [s + step * 2, s + step * 4, s + step * 2 + 1], '找规律', 2);
  addQ(b, `找规律填数：${s}、${s + 2}、${s + 4}、?`, s + 6, [s + 5, s + 7, s + 8], '找规律', 2);
}});
TEMPLATES[3].push({ kp: '找规律', lv: 2, gen(b) {
  const s = ri(2, 6), r = ri(2, 3);
  addQ(b, `找规律填数：${s}、${s * r}、${s * r * r}、?`, s * r * r * r, [s * r * r, s * r * r * r + r, s * r * 2], '找规律', 3);
  addQ(b, '按“△○□△○□……”的规律，第 10 个图形是？', '△', ['○', '□', '无法确定'], '找规律', 3);
}});


/* ================== 补齐第二轮：把薄弱知识点的题量做厚 ================== */
TEMPLATES[1].push({ kp: '图形的认识', lv: 1, gen(b) {
  addQ(b, '三角形有几个角？', 3, [4, 5, 2], '图形的认识', 1);
  addQ(b, '正方形有几个角？', 4, [3, 5, 6], '图形的认识', 1);
  addQ(b, '生活中车轮的形状是', '圆', ['正方形', '三角形', '长方形'], '图形的认识', 1);
  addQ(b, '长方形有几条长边？', 2, [1, 3, 4], '图形的认识', 1);
}});
TEMPLATES[2].push({ kp: '图形的认识', lv: 1, gen(b) {
  addQ(b, '长方形有几个直角？', 4, [1, 2, 3], '图形的认识', 1);
  addQ(b, '正方形是特殊的长方形吗？', '是', ['不是', '有时是', '无法判断'], '图形的认识', 2);
  addQ(b, '平行四边形的对边', '平行且相等', ['互相垂直', '长度不等', '只有一条'], '图形的认识', 2);
  addQ(b, '一个三角形最多有几个直角？', 1, [2, 3, 0], '图形的认识', 3);
}});
TEMPLATES[3].push({ kp: '图形的认识', lv: 2, gen(b) {
  addQ(b, '等边三角形的三条边', '都相等', ['都不相等', '只有两条相等', '无法确定'], '图形的认识', 2);
  addQ(b, '三个角都是锐角的三角形叫', '锐角三角形', ['直角三角形', '钝角三角形', '等边三角形'], '图形的认识', 2);
  addQ(b, '有一个角是钝角的三角形叫', '钝角三角形', ['锐角三角形', '直角三角形', '等腰三角形'], '图形的认识', 2);
  addQ(b, '梯形有几条边？', 4, [3, 5, 6], '图形的认识', 2);
  addQ(b, '长方形相邻两条边互相', '垂直', ['平行', '重合', '相交但不垂直'], '图形的认识', 3);
}});
TEMPLATES[4].push({ kp: '图形的认识', lv: 2, gen(b) {
  addQ(b, '从直线外一点到这条直线所画的线段中，最短的是', '垂直线段', ['斜线段', '水平线段', '任意一条'], '图形的认识', 3);
  addQ(b, '两条直线相交成直角，这两条直线', '互相垂直', ['互相平行', '重合', '无法判断'], '图形的认识', 2);
  addQ(b, '在同一平面内不相交的两条直线叫', '平行线', ['垂线', '射线', '线段'], '图形的认识', 2);
  addQ(b, '过一点可以画几条直线？', '无数条', ['1条', '2条', '3条'], '图形的认识', 3);
  addQ(b, '角的大小与两条边画得长短', '无关', ['有关，边越长角越大', '有关，边越长角越小', '无法确定'], '图形的认识', 3);
}});
TEMPLATES[2].push({ kp: '观察物体', lv: 2, gen(b) {
  addQ(b, '从侧面观察一个正方体，看到的形状是', '正方形', ['长方形', '三角形', '圆'], '观察物体', 2);
  addQ(b, '站在不同位置观察同一个物体，看到的形状', '可能不同', ['一定相同', '一定不同', '看不见'], '观察物体', 2);
  addQ(b, '从上面看一个圆柱，看到的形状是', '圆', ['长方形', '三角形', '正方形'], '观察物体', 2);
}});
TEMPLATES[3].push({ kp: '观察物体', lv: 2, gen(b) {
  addQ(b, '从正面看一个圆柱，看到的形状是', '长方形', ['圆', '三角形', '正方形'], '观察物体', 2);
  addQ(b, '从上面看一个球，看到的形状是', '圆', ['长方形', '三角形', '正方形'], '观察物体', 2);
  addQ(b, '只从一个方向看到的图形，能否确定物体的形状？', '不能', ['能', '一定能', '有时能确定大小'], '观察物体', 3);
}});
TEMPLATES[4].push({ kp: '观察物体', lv: 2, gen(b) {
  addQ(b, '从左侧看到的图形叫', '左视图', ['俯视图', '正视图', '后视图'], '观察物体', 2);
  addQ(b, '由 3 个同样的小正方体摆成“L”形，从上面看到的是', '3 个正方形', ['1 个正方形', '2 个正方形', '4 个正方形'], '观察物体', 3);
  addQ(b, '观察物体时，站得越高看到的范围', '越大', ['越小', '不变', '无法判断'], '观察物体', 2);
}});
TEMPLATES[5].push({ kp: '观察物体', lv: 2, gen(b) {
  addQ(b, '从正面、左面、上面三个方向观察长方体，最多能看到几种不同的面？', 3, [1, 2, 6], '观察物体', 3);
  addQ(b, '根据从两个方向看到的图形，一般能确定物体的', '大致形状', ['准确重量', '颜色', '温度'], '观察物体', 2);
  addQ(b, '用小正方体搭一个立体图形，从一个方向看到的正方形个数', '不能确定总数', ['就是总个数', '总比总数多', '总比总数少'], '观察物体', 3);
}});
TEMPLATES[2].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '地图上通常是“上北下南、左西右东”，那么上方表示', '北', ['南', '东', '西'], '方向与位置', 1);
}});
TEMPLATES[3].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '面朝南时，左手边是什么方向？', '东', ['西', '南', '北'], '方向与位置', 2);
  addQ(b, '东北方向介于哪两个方向之间？', '东和北', ['东和南', '西和北', '西和南'], '方向与位置', 2);
  addQ(b, '太阳升起的方向是', '东', ['西', '南', '北'], '方向与位置', 1);
  addQ(b, '面朝东时，背后是什么方向？', '西', ['东', '南', '北'], '方向与位置', 2);
}});
TEMPLATES[4].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '数对 (a,b) 中，b 表示什么？', '行', ['列', '距离', '角度'], '方向与位置', 2);
  addQ(b, '数对 (2,4) 和 (4,2) 表示的位置', '不同', ['相同', '相邻', '无法比较'], '方向与位置', 3);
  addQ(b, '第 1 列第 1 行用数对表示是', '(1,1)', ['(0,0)', '(1,0)', '(0,1)'], '方向与位置', 2);
  addQ(b, '从 A 点向南走 3 格再向西走 2 格，终点相对 A 点在什么方向？', '西南方', ['东南方', '西北方', '东北方'], '方向与位置', 3);
  addQ(b, '在同一幅图中，数对 (3,5) 向右平移 2 格后是', '(5,5)', ['(3,7)', '(1,5)', '(5,3)'], '方向与位置', 3);
}});
TEMPLATES[5].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '描述方向时，“北偏东 40°”也可以说成', '东偏北 50°', ['东偏北 40°', '南偏东 40°', '北偏西 40°'], '方向与位置', 3);
  addQ(b, '确定物体位置的两个要素是', '方向和距离', ['颜色和大小', '形状和重量', '高度和温度'], '方向与位置', 2);
  addQ(b, '在平面图上，比例尺越大，表示的实际范围', '越小', ['越大', '不变', '无法判断'], '方向与位置', 3);
  addQ(b, '以学校为观测点，商店在学校东面 200 米处，那么学校在商店的', '西面 200 米处', ['东面 200 米处', '南面 200 米处', '北面 200 米处'], '方向与位置', 3);
}});
TEMPLATES[6].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '图上距离 4 厘米、比例尺 1:5000，实际距离是多少米？', 200, [20, 2000, 5000], '方向与位置', 3);
  addQ(b, '用方向和距离描述位置时，距离通常用哪两个单位？', '米和千米', ['克和千克', '秒和分', '升和毫升'], '方向与位置', 2);
  addQ(b, '如果 B 地在 A 地的东北方向，那么 A 地在 B 地的什么方向？', '西南方', ['东北方', '西北方', '东南方'], '方向与位置', 3);
  addQ(b, '在比例尺 1:1000 的图上，5 厘米表示实际距离多少米？', 50, [5, 500, 5000], '方向与位置', 3);
}});
TEMPLATES[4].push({ kp: '折线统计图', lv: 2, gen(b) {
  addQ(b, '要表示一个学生六年的身高变化，最适合用', '折线统计图', ['条形统计图', '扇形统计图', '统计表'], '折线统计图', 2);
  addQ(b, '折线统计图中，线段水平说明数量', '没有变化', ['增加', '减少', '归零'], '折线统计图', 2);
  addQ(b, '折线统计图既能表示数量多少，又能表示', '数量增减变化', ['部分与整体的关系', '平均数', '排列顺序'], '折线统计图', 3);
}});
TEMPLATES[5].push({ kp: '折线统计图', lv: 2, gen(b) {
  addQ(b, '对比两个城市一年的气温变化，可以把两条折线画在', '同一幅统计图里', ['两张统计表里', '扇形统计图里', '条形统计图里'], '折线统计图', 3);
  addQ(b, '折线统计图的横轴通常表示', '时间或其他类别', ['数量', '百分比', '圆心角'], '折线统计图', 2);
  addQ(b, '折线统计图中最高点表示', '数量的最大值', ['数量的最小值', '数量的平均值', '数量的总和'], '折线统计图', 2);
}});
TEMPLATES[5].push({ kp: '平均数', lv: 2, gen(b) {
  addQ(b, '平均数 = ?', '总数 ÷ 份数', ['总数 × 份数', '份数 ÷ 总数', '最大值 − 最小值'], '平均数', 1);
  addQ(b, '一组数据的平均数是 85，其中每个数都加 5，新的平均数是', 90, [85, 80, 5], '平均数', 3);
  addQ(b, '平均数一定比这组数据中的最大值小、比最小值大吗？', '一定', ['不一定', '一定不', '无法判断'], '平均数', 3);
}});
TEMPLATES[5].push({ kp: '运算定律', lv: 2, gen(b) {
  addQ(b, '99 × 25 = (100 − 1) × 25 用的是？', '乘法分配律', ['乘法交换律', '乘法结合律', '加法结合律'], '运算定律', 3);
  addQ(b, '125 × 32 × 25 最简便的算法是', '把 32 拆成 8×4 再结合', ['从左往右依次相乘', '先算 32×25', '把 125 拆成 100+25'], '运算定律', 3);
  addQ(b, 'a × b = b × a 表示的是', '乘法交换律', ['乘法结合律', '乘法分配律', '加法交换律'], '运算定律', 2);
  addQ(b, '(a + b) × c = a × c + b × c 表示的是', '乘法分配律', ['乘法结合律', '乘法交换律', '加法结合律'], '运算定律', 2);
  addQ(b, '45 + 68 + 55 = (45 + 55) + 68 用的是', '加法交换律和结合律', ['乘法分配律', '乘法交换律', '减法的性质'], '运算定律', 3);
}});
TEMPLATES[6].push({ kp: '正反比例', lv: 3, gen(b) {
  addQ(b, '工作总量一定时，工作效率和工作时间成什么比例？', '反比例', ['正比例', '不成比例', '无法确定'], '正反比例', 3);
  addQ(b, '正方形的周长和边长成什么比例？', '正比例', ['反比例', '不成比例', '无法确定'], '正反比例', 3);
  addQ(b, '判断两种量成正比例的关键是', '比值一定', ['乘积一定', '和一定', '差一定'], '正反比例', 3);
}});
TEMPLATES[6].push({ kp: '工程问题', lv: 3, gen(b) {
  addQ(b, '一项工程甲单独做 12 天完成，乙单独做 6 天完成，两人合作几天完成？', 4, [3, 8, 18], '工程问题', 3);
  addQ(b, '修一条路，甲队 20 天完成，乙队 30 天完成，两队合修一天完成几分之几？', '1/12', ['1/50', '1/10', '1/25'], '工程问题', 3);
}});
TEMPLATES[2].push({ kp: '图形的运动', lv: 2, gen(b) {
  addQ(b, '推开抽屉属于什么现象？', '平移', ['旋转', '对称', '翻转'], '图形的运动', 2);
  addQ(b, '正方形有几条对称轴？', 4, [1, 2, '无数条'], '图形的运动', 3);
}});
TEMPLATES[5].push({ kp: '图形的运动', lv: 2, gen(b) {
  addQ(b, '把一个图形向右平移 5 格，图形的形状和大小', '都不变', ['都改变', '只变大小', '只变形状'], '图形的运动', 2);
  addQ(b, '旋转的三要素是', '旋转中心、方向、角度', ['长、宽、高', '上、下、左', '颜色、大小、形状'], '图形的运动', 3);
  addQ(b, '轴对称图形沿对称轴对折后，两边', '完全重合', ['部分重合', '不重合', '大小不同'], '图形的运动', 2);
  addQ(b, '一个图形绕中心旋转 360° 后与原图', '完全重合', ['方向相反', '大小改变', '不重合'], '图形的运动', 3);
}});


/* ================== 补齐第三轮：最后几个缺口 ================== */
TEMPLATES[4].push({ kp: '数的认识', lv: 2, gen(b) {
  addQ(b, '一个数的最高位是千万位，这个数是几位数？', '八位数', ['七位数', '九位数', '六位数'], '数的认识', 3);
  addQ(b, '10 个一千万是多少？', '一亿', ['一千万', '十万', '十亿'], '数的认识', 2);
}});
TEMPLATES[5].push({ kp: '运算定律', lv: 2, gen(b) {
  addQ(b, '在计算 2.5 × 4 × 8 时，最简便的是先算', '4 × 8', ['2.5 × 4', '2.5 × 8', '按顺序算'], '运算定律', 3);
  addQ(b, 'a + (b + c) = (a + b) + c 表示的是', '加法结合律', ['加法交换律', '乘法结合律', '乘法分配律'], '运算定律', 2);
}});
TEMPLATES[2].push({ kp: '图形的运动', lv: 2, gen(b) {
  addQ(b, '把图形向左平移 3 格，图形的形状', '不变', ['变大', '变小', '变形'], '图形的运动', 2);
}});
TEMPLATES[5].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, 'A 在 B 的北偏东 40° 方向，那么 B 在 A 的', '南偏西 40° 方向', ['北偏西 40° 方向', '正南方向', '正东方向'], '方向与位置', 3);
  addQ(b, '在图上，A 点向东 3 格、向北 2 格到 B 点，B 点相对 A 点的方向是', '东北', ['东南', '西北', '西南'], '方向与位置', 2);
}});

TEMPLATES[5].push({ kp: '方向与位置', lv: 2, gen(b) {
  addQ(b, '面朝东南方向站立时，左手边是哪个方向？', '东北', ['西南', '西北', '正南'], '方向与位置', 2);
  addQ(b, '面朝西南方向站立时，右手边是哪个方向？', '西北', ['东北', '东南', '正东'], '方向与位置', 2);
}});
/* ---------------------------- 生成 ---------------------------- */
let total = 0;
for (const g of [1, 2, 3, 4, 5, 6]) {
  const bag = makeBag();
  for (const tpl of TEMPLATES[g]) {
    for (let i = 0; i < PER; i++) tpl.gen(bag);
  }
  const doc = { grade: g, subjects: { 数学: bag } };
  fs.writeFileSync(path.join(OUT_DIR, `gen-math-g${g}.json`), JSON.stringify(doc, null, 1), 'utf8');
  const kpCount = {};
  bag.forEach(q => { kpCount[q.kp] = (kpCount[q.kp] || 0) + 1; });
  console.log(`G${g}: ${bag.length} 题 · ${Object.keys(kpCount).length} 个知识点`);
  total += bag.length;
}
console.log(`数学生成完成，共 ${total} 题`);
