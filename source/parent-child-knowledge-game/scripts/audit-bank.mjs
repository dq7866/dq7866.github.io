/* 题库体检：把"会让孩子困惑/让家长不信任"的数据问题一次性挖出来
 * 跑法：node scripts/audit-bank.mjs
 * 只看问题，不改数据。 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const QS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json'), 'utf8'));
const CURR = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/curriculum.json'), 'utf8'));

const norm = s => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
const findings = [];
function add(kind, level, q, detail) {
  findings.push({ kind, level, id: q && q.id, subj: q && q.subj, text: q && q.text, detail });
}

/* ---------- 1. 结构性错误（必须为 0） ---------- */
QS.forEach(q => {
  const o = q.options || [];
  if (o.length !== 4) return add('选项不是4个', 'fatal', q, o.length + ' 个');
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return add('correct 越界', 'fatal', q, String(q.correct));
  if (o[q.correct] !== q.answer) return add('answer 与 correct 不一致', 'fatal', q, `correct=${q.correct} 但 answer=${q.answer}`);
  if (o.some(x => !String(x).trim())) return add('空选项', 'fatal', q, JSON.stringify(o));
  const seen = new Map();
  o.forEach((x, i) => { const k = norm(x); if (seen.has(k)) add('选项重复', 'fatal', q, `第${seen.get(k) + 1}项与第${i + 1}项都是「${x}」`); else seen.set(k, i); });
  if (!String(q.text || '').trim()) add('空题干', 'fatal', q, '');
  if (!q.kp) add('缺知识点', 'warn', q, '');
  if (!Array.isArray(q.grades) || !q.grades.length) add('缺 grades', 'warn', q, String(q.grade));
  if (![1, 2, 3].includes(q.level)) add('难度异常', 'warn', q, String(q.level));
});

/* ---------- 2. 占位符/程序残渣漏进题干 ---------- */
// 注意大小写：banana 里含 "nana"，用 /i 会误判成 NaN
const junk = /(\{x\}|\{y\}|\bundefined\b|\bNaN\b|\bnull\b|\[object|TODO|FIXME|待填)/;
QS.forEach(q => {
  if (junk.test(q.text)) add('题干含占位符/残渣', 'fatal', q, q.text);
  (q.options || []).forEach(o => { if (junk.test(o)) add('选项含占位符/残渣', 'fatal', q, String(o)); });
});

/* ---------- 3. 无意义选项（一律四选一时会误导） ---------- */
const lazyOpt = /^(以上都对|以上都不对|以上都是|以上都不是|全都对|都不对)$/;
QS.forEach(q => {
  (q.options || []).forEach(o => {
    if (lazyOpt.test(String(o).trim())) add('无意义选项', 'warn', q, String(o));
  });
});

/* ---------- 4. 语义倒置/自问自答（家长最反感的一类） ---------- */
// 反转题：题干以「"XXX"时应…」开头，答案却是场景描述而不是做法
const reversed = /^[“"][^”"]{2,40}[”"]时(应采取的做法|的正确做法|应该怎么做|应如何处理)是？/;
QS.forEach(q => { if (reversed.test(q.text)) add('语义倒置反转题', 'fatal', q, q.text); });

// 反转题加强检测：题干是「某个做法」的引用，却在问"正确做法/态度"——必然问反了
const revBad = /[”」]的(正确)?(做法|态度|处理方法|应对方法)是？|[”」]对应(的)?正确做法是/;
QS.forEach(q => { if (revBad.test(q.text)) add('语义倒置反转题', 'fatal', q, q.text); });

// 干扰项与题干毫无共同用词（提示人工抽查：可能是别道题的答案串进来）
const bg2 = s => { const t = String(s).replace(/\s+/g, ''); const o = new Set(); for (let i = 0; i < t.length - 1; i++) o.add(t.slice(i, i + 2)); return o; };
const hit2 = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };
QS.forEach(q => {
  const o = q.options || [];
  if (o.length !== 4 || String(q.text).length < 8) return;
  const tb = bg2(q.text);
  const hits = o.map(x => hit2(bg2(x), tb));
  if (hits[q.correct] > 0 && hits.filter((_, i) => i !== q.correct).every(h => h === 0)) {
    add('干扰项疑似与题干无关（待抽查）', 'info', q, o.map((x, i) => (i === q.correct ? '✓' : '') + x).join(' | '));
  }
});

/* ---------- 5. 数值类答案自相矛盾（同值不同写法混在选项里） ---------- */
// 只比较"整个选项就是一个数（可带单位）"的情况，且单位必须一致，
// 否则「20厘米 vs 20米」「3点 vs 3点半」会被误判成同一个数。
function parsedNum(s) {
  s = String(s).trim().replace(/[，,\s]/g, '').replace(/[−–—]/g, '-');
  let m = s.match(/^(-?\d+)\/(\d+)$/);
  if (m) return { v: Number(m[1]) / Number(m[2]), u: '' };
  m = s.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (m) return { v: Number(m[1]) / 100, u: '%' };
  m = s.match(/^(-?\d+(?:\.\d+)?)([^\d]*)$/);
  if (m) return { v: Number(m[1]), u: m[2] };
  return null;
}
QS.forEach(q => {
  const o = q.options || [];
  if (/最简|约分/.test(q.text)) return;   // 「写成最简分数」类题，未约分选项是有意的干扰项
  const ps = o.map(parsedNum);
  if (ps.every(v => v === null)) return;
  const map = new Map();
  ps.forEach((pv, i) => {
    if (!pv) return;
    const key = pv.u + '|' + pv.v.toFixed(6);
    if (map.has(key)) add('选项数值等价（同一答案两种写法）', 'fatal', q,
      `第${map.get(key) + 1}项「${o[map.get(key)]}」与第${i + 1}项「${o[i]}」数值相同`);
    else map.set(key, i);
  });
});

/* ---------- 6. 重复题（同题干出现多次） ---------- */
const byText = new Map();
QS.forEach(q => {
  const k = norm(q.subj) + '|' + norm(q.text);
  if (!byText.has(k)) byText.set(k, []);
  byText.get(k).push(q);
});
let dupGroups = 0, dupItems = 0;
byText.forEach((list, k) => {
  if (list.length > 1) {
    dupGroups++; dupItems += list.length - 1;
    // 只报答案不一致的（真正有害：同一题两个不同答案）
    const answers = new Set(list.map(x => norm(x.answer)));
    const grades = new Set(list.map(x => (x.grades || [x.grade]).join(',')));
    if (answers.size > 1) add('同题干但答案不同', 'fatal', list[0], `${list.length} 条，答案：${[...answers].join(' / ')}`);
    else if (grades.size > 1) add('同题干重复（年级不同）', 'warn', list[0], `${list.length} 条：${[...grades].join(' | ')}`);
  }
});

/* ---------- 7. 知识点游离 / 年级声明与内容对不上 ---------- */
const ALIAS = CURR.aliasesBySubject || {};
const canon = (subj, kp) => (ALIAS[subj] || {})[kp] || kp;
const std = new Map();
Object.entries(CURR.subjects).forEach(([s, list]) => list.forEach(it => std.set(s + '|' + it.kp, it)));

const orphan = new Map();
QS.forEach(q => {
  const key = q.subj + '|' + canon(q.subj, q.kp);
  if (!std.has(key)) orphan.set(key, (orphan.get(key) || 0) + 1);
});
orphan.forEach((n, k) => add('游离知识点（不在课程表）', 'warn', { id: '-', subj: k.split('|')[0], text: k.split('|')[1] }, n + ' 道'));

// 声明的年级里，题目数为 0 的槽位（等于声明了却教不到）
const slot = new Map();
QS.forEach(q => (q.grades || [q.grade]).forEach(g => {
  const key = q.subj + '|' + canon(q.subj, q.kp) + '|' + g;
  slot.set(key, (slot.get(key) || 0) + 1);
}));
std.forEach((it, key) => {
  const [, kp] = key.split('|');
  it.grades.forEach(g => {
    const n = slot.get(key + '|' + g) || 0;
    if (n < it.min) add('知识点槽位不达标', 'warn', { id: '-', subj: key.split('|')[0], text: kp }, `${g} 年级 ${n} 道（要求 ${it.min}）`);
  });
});

/* ---------- 7.5 答案泄露：正确答案长度明显异于干扰项（一眼能猜） ---------- */
QS.forEach(q => {
  const o = q.options || [];
  if (o.length !== 4) return;
  const L = o.map(x => String(x).length);
  const right = L[q.correct];
  const others = L.filter((_, i) => i !== q.correct);
  const avgOther = others.reduce((a, b) => a + b, 0) / others.length;
  if (Math.abs(right - avgOther) >= 6 && (right / avgOther >= 2 || avgOther / right >= 2)) {
    add('答案长度泄露（一眼猜出）', 'warn', q,
      `答案「${o[q.correct]}」${right} 字，其余平均 ${avgOther.toFixed(1)} 字`);
  }
});

/* ---------- 7.6 同一知识点同一grade 答案高度集中（蒙对率高） ---------- */
const slotAns = new Map();
QS.forEach(q => (q.grades || [q.grade]).forEach(g => {
  const key = q.subj + '|' + canon(q.subj, q.kp) + '|' + g;
  if (!slotAns.has(key)) slotAns.set(key, []);
  slotAns.get(key).push(norm(q.answer));
}));
slotAns.forEach((list, key) => {
  if (list.length < 6) return;
  const freq = new Map();
  list.forEach(a => freq.set(a, (freq.get(a) || 0) + 1));
  const [topAns, topN] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  // 阈值 60%：be 动词、运算顺序这类知识点本来就有常见答案，
  // 只有同一答案占到六成以上才说明孩子能盲猜
  if (topN / list.length >= 0.6) {
    const [subj, kp, g] = key.split('|');
    add('答案高度集中（可蒙对）', 'warn', { id: '-', subj, text: kp },
      `${g} 年级 ${list.length} 道里 ${topN} 道答案是「${topAns}」（${Math.round(topN / list.length * 100)}%）`);
  }
});

/* ---------- 8. 极端长度（手机上会溢出/挤爆） ---------- */
QS.forEach(q => {
  if (String(q.text).length > 60) add('题干过长（>60字）', 'warn', q, String(q.text).length + ' 字：' + q.text.slice(0, 40) + '…');
  (q.options || []).forEach(o => {
    if (String(o).length > 26) add('选项过长（>26字）', 'warn', q, String(o).length + ' 字：' + o.slice(0, 30));
  });
});

/* ---------- 9. 答案位置分布（只影响体验，不影响正确性） ---------- */
const pos = [0, 0, 0, 0];
QS.forEach(q => pos[q.correct]++);

/* ---------- 汇总 ---------- */
const fatal = findings.filter(f => f.level === 'fatal');
const warn = findings.filter(f => f.level === 'warn');
const info = findings.filter(f => f.level === 'info');
const byKind = new Map();
findings.forEach(f => byKind.set(f.kind + '|' + f.level, (byKind.get(f.kind + '|' + f.level) || 0) + 1));

console.log(`题库 ${QS.length} 道 · 检查项 9 类`);
console.log(`\n=== 问题汇总 ===`);
if (!findings.length) console.log('  无');
[...byKind.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
  const [kind, level] = k.split('|');
  const mark = level === 'fatal' ? '❌' : level === 'warn' ? '⚠️ ' : 'ℹ️ ';
  console.log(`  ${mark} ${kind.padEnd(24)} ${String(n).padStart(4)} 处`);
});

console.log(`\n=== 严重问题样本（最多 40 条）===`);
fatal.slice(0, 40).forEach(f =>
  console.log(`  [${f.subj}·${f.id}] ${String(f.text).slice(0, 36)} → ${f.detail}`));

console.log(`\n=== 重复题 ===`);
console.log(`  同题干分组 ${dupGroups} 组，多余副本 ${dupItems} 条`);

console.log(`\n=== 答案位置分布（服务端会洗牌，仅参考）===`);
console.log('  ' + pos.map((n, i) => String.fromCharCode(65 + i) + ':' + n).join('  '));

console.log(`\n=== 长度极值 ===`);
const longest = QS.slice().sort((a, b) => String(b.text).length - String(a.text).length)[0];
console.log(`  最长题干 ${String(longest.text).length} 字：${longest.text}`);
const longestOpt = QS.flatMap(q => (q.options || []).map(o => ({ o, q })))
  .sort((a, b) => String(b.o).length - String(a.o).length)[0];
console.log(`  最长选项 ${String(longestOpt.o).length} 字：${longestOpt.o}`);

console.log(`\n=== 结论：严重 ${fatal.length} 处 · 提醒 ${warn.length} 处 · 待抽查 ${info.length} 处 ===`);
if (fatal.length) process.exitCode = 1;
