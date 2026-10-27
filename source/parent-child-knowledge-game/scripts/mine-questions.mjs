/**
 * 从云端线上接口取样，重建本地题库。
 * 云端服务端源码不可获取，但 /api/questions 的返回就是题库本身，
 * 通过多轮随机抽样可把题池穷举出来（同一题重复出现率很高，池子不大）。
 *
 * 用法：node scripts/mine-questions.mjs
 * 产物：data/questions.json
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SOURCE_BASE || 'https://ab8fba5caddf747de.app.workbuddy.host';
const SHARE = process.env.SHARE_CODE || 'QKMIHGWLMW';
const GRADES = [1, 2, 3, 4, 5, 6, 7];
const SUBJECTS = ['语文', '数学', '科学', '英语', '安全'];
const ROUNDS = 34;          // 每个（年级×科目）抽样轮数
const CONCURRENCY = 6;
const IDLE_STOP = 12;       // 连续 N 轮没有新题就提前收工

async function fetchBatch(grade, subject) {
  const url = `${BASE}/api/questions?grade=${grade}&subject=${encodeURIComponent(subject)}&n=10&level=2&sharecode=${SHARE}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (attempt === 2) return null;
      await new Promise(res => setTimeout(res, 800));
    }
  }
  return null;
}

function normalize(q, grade) {
  // 云端返回的 options 可能混有数字，统一转字符串；correct 是正确答案下标
  const options = (q.options || []).map(o => String(o));
  if (options.length !== 4) return null;
  const idx = Number.isInteger(q.correct) ? q.correct : 0;
  return {
    grade,
    subj: q.subj || '综合',
    text: String(q.text || '').trim(),
    options,
    correct: idx,                 // 保留云端下标，服务端出题时会重新洗牌
    answer: options[idx] || '',
  };
}

async function minePair(grade, subject) {
  const seen = new Map();
  let idle = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const batch = await fetchBatch(grade, subject);
    if (!batch || !Array.isArray(batch)) break;
    let fresh = 0;
    for (const raw of batch) {
      const q = normalize(raw, grade);
      if (!q || !q.text) continue;
      const key = `${subject}|${q.text}`;
      if (!seen.has(key)) { seen.set(key, q); fresh++; }
    }
    idle = fresh === 0 ? idle + 1 : 0;
    if (idle >= IDLE_STOP) break;
  }
  return [...seen.values()];
}

async function runPool(tasks, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < tasks.length) {
      const idx = cursor++;
      results[idx] = await worker(tasks[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

const pairs = [];
for (const g of GRADES) for (const s of SUBJECTS) pairs.push({ grade: g, subject: s });

console.log(`开始取样：${pairs.length} 组（年级×科目），每组最多 ${ROUNDS} 轮…`);
let done = 0;
const perPair = await runPool(pairs, async ({ grade, subject }) => {
  const list = await minePair(grade, subject);
  done++;
  console.log(`  [${done}/${pairs.length}] ${grade}年级 ${subject} → ${list.length} 题`);
  return list;
});

// 合并（同一题可能在多个科目/年级重复出现，按 文本+选项 去重，年级取最小）
const merged = new Map();
for (const list of perPair) {
  for (const q of list || []) {
    const key = `${q.text}||${q.options.join('|')}`;
    if (!merged.has(key)) merged.set(key, { ...q, grades: [q.grade] });
    else {
      const cur = merged.get(key);
      if (!cur.grades.includes(q.grade)) cur.grades.push(q.grade);
      if (q.grade < cur.grade) { cur.grade = q.grade; }
    }
  }
}

const questions = [...merged.values()]
  .sort((a, b) => a.grade - b.grade || a.subj.localeCompare(b.subj, 'zh'));

const outDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'harvested.json'), JSON.stringify(questions, null, 1), 'utf8');

const byGrade = {};
for (const q of questions) {
  byGrade[q.grade] = byGrade[q.grade] || {};
  byGrade[q.grade][q.subj] = (byGrade[q.grade][q.subj] || 0) + 1;
}
console.log('\n共采集 ' + questions.length + ' 道题');
console.table(byGrade);
