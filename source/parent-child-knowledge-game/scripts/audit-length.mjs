/**
 * 答案长度体检：找出「靠选项长短就能猜出答案」的题
 *
 * 为什么单独一个脚本：
 *   audit-bank.mjs 是通用体检（9 类问题），输出的是汇总数字。
 *   这一类是直接影响游戏公平性的内容问题——孩子在答题界面看到四个选项，
 *   如果正确答案明显更长（或更短），不用读题也能选对，练习就失去意义。
 *   需要一份能直接定位到「哪道题、哪个知识点、该怎么改」的清单，
 *   方便人工逐条修文案。
 *
 * 用法：
 *   node scripts/audit-length.mjs              列出问题（按知识点汇总）
 *   node scripts/audit-length.mjs --detail     逐题列出（可导出给人工修）
 *   node scripts/audit-length.mjs --kp 安全     只看某个知识点
 *   node scripts/audit-length.mjs --threshold 4  判定阈值（默认 4 字）
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const QS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json'), 'utf8'));

const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : ''; };
const THRESHOLD = Number(val('--threshold') || 4);
const onlyKp = val('--kp');
const detail = has('--detail');

/** 选项长度差异：正确答案长度 与 干扰项平均长度 之差 */
function lengthDiff(q) {
  const o = q.options || [];
  if (o.length !== 4) return null;
  const L = o.map(x => String(x).length);
  const right = L[q.correct];
  const others = L.filter((_, i) => i !== q.correct);
  const avg = others.reduce((a, b) => a + b, 0) / others.length;
  return { right, avg, diff: right - avg };
}

const rows = [];
for (const q of QS) {
  if (onlyKp && q.kp !== onlyKp) continue;
  const m = lengthDiff(q);
  if (!m) continue;
  if (Math.abs(m.diff) < THRESHOLD) continue;
  rows.push({ q, ...m });
}

const dir = m => (m.diff > 0 ? '正确项偏长' : '正确项偏短');

console.log(`题库 ${QS.length} 道 · 长度差阈值 ${THRESHOLD} 字`);
console.log(`疑似可猜答案：${rows.length} 道（${(rows.length / QS.length * 100).toFixed(1)}%）`);

if (!rows.length) {
  console.log('✅ 没有可猜答案的题');
  process.exit(0);
}

/* 按知识点汇总：文案要改的是「这一组题的选项写法」，不是单道题 */
const byKp = new Map();
for (const r of rows) {
  const key = r.q.subj + '|' + r.q.kp;
  if (!byKp.has(key)) byKp.set(key, []);
  byKp.get(key).push(r);
}
const groups = [...byKp.entries()].sort((a, b) => b[1].length - a[1].length);

console.log('\n=== 按知识点汇总（改这一组的选项文案最划算）===');
console.log('知识点'.padEnd(28) + '题数  偏长  偏短  建议');
for (const [key, list] of groups) {
  const [subj, kp] = key.split('|');
  const longer = list.filter(r => r.diff > 0).length;
  const shorter = list.length - longer;
  // 建议：偏长说明正确项写得太啰嗦；偏短说明正确项太简略
  let tip;
  if (longer > shorter) tip = '把正确项写短些，或把干扰项写长些';
  else tip = '把正确项写完整些，或把干扰项写短些';
  console.log(
    `${(subj + '·' + kp).padEnd(26)}${String(list.length).padStart(4)}  ${String(longer).padStart(4)}  ${String(shorter).padStart(4)}  ${tip}`
  );
}

if (detail) {
  console.log('\n=== 逐题明细 ===');
  for (const r of rows) {
    const o = r.q.options;
    console.log(`\n[${r.q.subj}·${r.q.kp}] ${r.q.text}`);
    console.log(`  ✅ 正确答案：${o[r.q.correct]}  （${r.right} 字）`);
    console.log('  干扰项：' + o.filter((_, i) => i !== r.q.correct).map((x, i) => `${x}（${String(x).length}字）`).join(' / '));
    console.log(`  → ${dir(r)}，差 ${Math.abs(r.diff).toFixed(1)} 字`);
  }
}

console.log('\n=== 说明 ===');
console.log('「正确项偏长」：答案是一句完整做法，干扰项是短语 → 孩子按长度就能猜中。');
console.log('「正确项偏短」：答案是短语，干扰项是长句 → 同理。');
console.log('修法一（推荐）：把同一知识点下的选项都改成同一种句式，长度自然接近。');
console.log('修法二：在 data/facts/*.json 的 pool 里补上长度合适的错误做法。');
console.log('改完跑 npm run build:bank 重建，再跑本脚本复查。');
