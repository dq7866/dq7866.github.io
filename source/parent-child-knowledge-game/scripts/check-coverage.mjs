/**
 * 知识点覆盖体检
 * 对照 data/curriculum.json（课程标准知识点表）检查题库是否齐全：
 *   - 每个规范知识点在每个适用年级的题量是否达到 min
 *   - 题库里是否存在不属于课程表的「游离知识点」
 * 用法：node scripts/check-coverage.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curriculum.json'), 'utf8'));
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'questions.json'), 'utf8'));

const ALIAS = cur.aliases || {};
const ALIAS_BY_SUBJ = cur.aliasesBySubject || {};
const canon = (subj, kp) => (ALIAS_BY_SUBJ[subj] || {})[kp] || ALIAS[kp] || kp;

const gradesOf = q => (q.grades && q.grades.length ? q.grades : [q.grade]);

// 统计：subject|kp|grade -> count
const counts = new Map();
// 规范名集合（用于识别游离知识点）
const known = new Map(); // subject -> Set(kp)
for (const [subj, list] of Object.entries(cur.subjects)) {
  known.set(subj, new Set(list.map(x => x.kp)));
}

const orphans = new Map(); // subject -> Map(kp -> count)
for (const q of questions) {
  const subj = q.subj;
  const kp = canon(subj, q.kp || '');
  for (const g of gradesOf(q)) {
    const k = `${subj}|${kp}|${g}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (!known.get(subj) || !known.get(subj).has(kp)) {
    if (!orphans.has(subj)) orphans.set(subj, new Map());
    const m = orphans.get(subj);
    m.set(kp, (m.get(kp) || 0) + 1);
  }
}

const rows = [];
let gaps = 0, totalSlots = 0, coveredSlots = 0;
for (const [subj, list] of Object.entries(cur.subjects)) {
  for (const item of list) {
    for (const g of item.grades) {
      totalSlots++;
      const have = counts.get(`${subj}|${item.kp}|${g}`) || 0;
      if (have >= item.min) coveredSlots++;
      else gaps++;
      rows.push({ 科目: subj, 知识点: item.kp, 年级: g, 现有: have, 目标: item.min, 缺口: Math.max(0, item.min - have) });
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, orphans: Object.fromEntries([...orphans].map(([s, m]) => [s, Object.fromEntries(m)])) }, null, 1));
  process.exit(0);
}

/* 输出：按科目汇总 + 明细缺口 */
const bySubj = {};
for (const r of rows) {
  if (!bySubj[r.科目]) bySubj[r.科目] = { slots: 0, ok: 0, 缺口题数: 0, 缺知识点: new Set() };
  const s = bySubj[r.科目];
  s.slots++;
  if (r.现有 >= r.目标) s.ok++; else s.缺知识点.add(r.知识点);
  s.缺口题数 += r.缺口;
}

console.log(`题库总量：${questions.length} 道`);
console.log(`课程表知识点：${[...known.values()].reduce((a, s) => a + s.size, 0)} 个，覆盖槽位（知识点×年级）${totalSlots} 个\n`);
console.log('=== 科目汇总 ===');
console.table(Object.entries(bySubj).map(([科目, s]) => ({
  科目,
  '达标槽位': `${s.ok}/${s.slots}`,
  '达标率': ((s.ok / s.slots) * 100).toFixed(0) + '%',
  待补题量: s.缺口题数,
  缺知识点数: s.缺知识点.size,
})));

console.log('\n=== 缺口明细（按科目） ===');
const order = ['语文', '数学', '英语', '科学', '品德', '安全'];
for (const subj of order) {
  const miss = rows.filter(r => r.科目 === subj && r.现有 < r.目标);
  if (!miss.length) { console.log(`\n【${subj}】✅ 全部达标`); continue; }
  const byKp = new Map();
  for (const m of miss) {
    if (!byKp.has(m.知识点)) byKp.set(m.知识点, []);
    byKp.get(m.知识点).push(m);
  }
  console.log(`\n【${subj}】不达标 ${byKp.size} 个知识点`);
  for (const [kp, arr] of byKp) {
    const gs = arr.map(a => `G${a.年级}(${a.现有}/${a.目标})`).join(' ');
    console.log(`  · ${kp}  ${gs}`);
  }
}

console.log('\n=== 游离知识点（不在课程表里，需归一或补充进课程表） ===');
let orphanTotal = 0;
for (const [subj, m] of orphans) {
  const items = [...m.entries()].sort((a, b) => b[1] - a[1]);
  orphanTotal += items.length;
  console.log(`【${subj}】${items.length} 个：` + items.map(([k, v]) => `${k}(${v})`).join('  '));
}
if (!orphanTotal) console.log('无');

console.log(`\n=== 结论：${coveredSlots}/${totalSlots} 槽位达标（${((coveredSlots / totalSlots) * 100).toFixed(1)}%），待补 ${gaps} 个槽位 ===`);
if (gaps > 0) process.exitCode = 1;
