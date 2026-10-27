/**
 * 题库批量生成器
 * 数据来源：
 *   1) data/facts/*.json    —— 人工整理的知识点事实表（成对事实，可正问/反问）
 *   2) data/facts/chinese.json —— 古诗、成语词目、近反义词、多音字、量词、修辞/病句/标点
 *   3) data/raw/idiom.json    —— 公开成语语料（chinese-xinhua），提供释义
 *   4) data/raw/xiehouyu.json —— 公开歇后语语料
 * 输出：data/bank/gen-{科目}-g{年级}.json
 *
 * 用法：node scripts/generate-bank.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const FACTS = path.join(ROOT, 'data', 'facts');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'bank');

let seed = 77213;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/* 题目按 年级→科目 归集 */
const bags = new Map(); // `${g}|${subj}` -> [q]
function bagOf(g, subj) {
  const k = `${g}|${subj}`;
  if (!bags.has(k)) bags.set(k, []);
  return bags.get(k);
}
const seen = new Set(); // `${subj}|${text}` 全局去重

/**
 * 长度平衡：四个选项的长度要接近，否则孩子能靠"哪个最长/最短"猜答案。
 *
 * 做法：把干扰项按与正确答案的长度差排序，优先取最接近的几个；
 * 数量不够时再放宽（先放宽到 2 倍长度差，再取剩余的）。
 * 这样既保住了随机性（同一长度档内仍随机），又消掉了"一眼猜出"。
 */
function balanceByLength(correct, distractors, n = 3) {
  const cLen = String(correct).length;
  const scored = distractors.map(d => ({ d, diff: Math.abs(String(d).length - cLen) }));
  const close = scored.filter(x => x.diff <= 2);
  const mid = scored.filter(x => x.diff > 2 && x.diff <= 4);
  const far = scored.filter(x => x.diff > 4);
  // 先在「长度接近」里随机取，不够再依次放宽
  const pick = (pool, need) => {
    if (!need || !pool.length) return [];
    return shuffle(pool).slice(0, need).map(x => x.d);
  };
  let need = n;
  const out = [];
  for (const group of [close, mid, far]) {
    if (!need) break;
    const got = pick(group, need);
    out.push(...got);
    need -= got.length;
  }
  return out;
}

function add(g, subj, text, correct, distract, kp, lv) {
  const key = `${g}|${subj}|${text.replace(/\s+/g, '')}`;
  if (seen.has(key)) return false;
  const cand = [correct, ...distract].map(String);
  const uniq = [];
  for (const c of cand) if (c && !uniq.includes(c)) uniq.push(c);
  if (uniq.length < 4) return false;
  // 长度平衡：先按长度筛出更合适的干扰项，不够再退回原始候选
  const balanced = balanceByLength(correct, uniq.filter(c => c !== String(correct)), 3);
  const pool = balanced.length === 3 ? balanced : uniq.filter(c => c !== String(correct)).slice(0, 3);
  const four = shuffle([String(correct), ...pool]);
  seen.add(key);
  bagOf(g, subj).push({ t: text, o: four, a: four.indexOf(String(correct)), kp, lv });
  return true;
}
/* 取同组其它答案作干扰项。
 * 多取一些候选（默认 8 个）交给 add() 的长度平衡去筛，
 * 否则候选本身就少，挑不出长度接近的干扰项。 */
const otherVals = (items, idx, correct, n = 8) => {
  const pool = [...new Set(items.map(it => it[idx]))].filter(v => String(v) !== String(correct));
  return shuffle(pool).slice(0, n);
};

/* set.pool：该主题下的"典型错误做法"干扰池。
 * 用于安全/品德这类"答案是一句完整做法"的题——同组其他题的答案往往答非所问，
 * 直接拿来当干扰项会出现"孩子的做法也没错，只是问了另一件事"，甚至靠长度就能猜答案。 */
const poolVals = (pool, correct, n = 8) => {
  const cand = [...new Set(pool.map(String).filter(v => v && v.trim()))]
    .filter(v => v.trim() !== String(correct).trim());
  return shuffle(cand).slice(0, n);
};

/* ---------------- 1) 成对事实表（科学/品德/安全/英语等） ---------------- */
let pairCount = 0;
for (const f of fs.readdirSync(FACTS).filter(f => f.endsWith('.json'))) {
  const doc = JSON.parse(fs.readFileSync(path.join(FACTS, f), 'utf8'));
  const subj = doc.subject;
  for (const set of doc.sets || []) {
    // 形态二：items4 = [[题干, 正确答案, 干扰1, 干扰2, 干扰3], ...]
    // 适合语法/计算类题目——干扰项必须自己指定，不能从同组答案里取
    if (Array.isArray(set.items4)) {
      for (const g of set.grade) {
        for (const row of set.items4) {
          const [q, ok, ...dis] = row;
          if (!q || !ok) continue;
          const text = set.fwd ? set.fwd.replace('{x}', q) : q;
          if (dis.filter(Boolean).length >= 3) add(g, subj, text, ok, dis.slice(0, 3), set.kp, set.lv || 2);
        }
      }
      continue;
    }
    const items = set.items.filter(it => it[0] && it[1] && it[1].length >= 1);
    // 有干扰池时，答案不必来自同组其他题，题目再少也能出道好题
    const hasPool = Array.isArray(set.pool) && set.pool.length >= 3;
    if (items.length < (hasPool ? 1 : 4)) continue;
    for (const g of set.grade) {
      for (const [x, y] of items) {
        if (set.fwd) {
          const d = Array.isArray(set.pool) && set.pool.length >= 3
            ? poolVals(set.pool, y)
            : otherVals(items, 1, y);
          // 候选现在会多取（供长度平衡筛选），最终能否成题交给 add() 判定
          if (d.length >= 3 && add(g, subj, set.fwd.replace('{x}', x), y, d, set.kp, set.lv || 2)) pairCount++;
        }
        if (set.rev) {
          const d = otherVals(items, 0, x);
          if (d.length >= 3 && add(g, subj, set.rev.replace('{y}', y), x, d, set.kp, set.lv || 2)) pairCount++;
        }
      }
    }
  }
}

/* ---------------- 2) 语文专项 ---------------- */
const cn = JSON.parse(fs.readFileSync(path.join(FACTS, 'chinese.json'), 'utf8'));
let cnCount = 0;

/* 2.1 古诗 */
const poemLines = cn.poems.map(p => p.l[1]);
const authors = [...new Set(cn.poems.map(p => p.a))];
const dynasties = [...new Set(cn.poems.map(p => p.d))];
const themes = [...new Set(cn.poems.map(p => p.theme))];
for (const p of cn.poems) {
  const g = p.g;
  if (add(g, '语文', `“${p.l[0]}”的下一句是？`, p.l[1], otherVals(cn.poems.map(x => x.l), 1, p.l[1]).concat(shuffle(poemLines).slice(0, 3)), '古诗积累', 2)) cnCount++;
  if (add(g, '语文', `《${p.t}》的作者是？`, p.a, shuffle(authors.filter(a => a !== p.a)).slice(0, 3), '古诗积累', 2)) cnCount++;
  if (add(g, '语文', `《${p.t}》的作者是哪个朝代的？`, p.d, shuffle(dynasties.filter(d => d !== p.d)).slice(0, 3), '文学常识', 2)) cnCount++;
  if (add(g, '语文', `《${p.t}》主要写的是？`, p.theme, shuffle(themes.filter(t => t !== p.theme)).slice(0, 3), '古诗积累', 3)) cnCount++;
}

/* 2.3 近反义词 */
for (const p of cn.pairs) {
  const isSyn = p.k === 'syn';
  const same = cn.pairs.filter(x => x.k === p.k && x.x !== p.x);
  const d = shuffle(same).slice(0, 3).map(x => x.y);
  if (add(p.g, '语文', `“${p.x}”的${isSyn ? '近义词' : '反义词'}是？`, p.y, d, isSyn ? '近反义词' : '近反义词', 2)) cnCount++;
}

/* 2.4 多音字 */
for (const item of cn.poly) {
  const readings = [...new Set(cn.poly.flatMap(p => p.items.map(i => i[1])))];
  for (const [word, py] of item.items) {
    const d = shuffle(readings.filter(r => r !== py)).slice(0, 3);
    if (add(item.g, '语文', `在“${word}”中，“${item.ch}”读作？`, py, d, '多音字', 2)) cnCount++;
  }
}

/* 2.5 量词 */
const mws = [...new Set(cn.mw.map(m => m.m))];
for (const m of cn.mw) {
  const d = shuffle(mws.filter(x => x !== m.m)).slice(0, 3);
  if (add(m.g, '语文', `一（　）${m.n}，括号里应填？`, m.m, d, '量词', 1)) cnCount++;
}

/* 2.6 修辞/病句/标点 */
for (const set of cn.sets) {
  const items = set.items;
  for (const g of set.grade) {
    for (const [x, y] of items) {
      const d = otherVals(items, 1, y);
      if (d.length >= 3 && add(g, '语文', set.fwd.replace('{x}', x), y, d, set.kp, set.lv)) cnCount++;
    }
  }
}

/* ---------------- 3) 英语 ---------------- */
const en = JSON.parse(fs.readFileSync(path.join(FACTS, 'english.json'), 'utf8'));
let enCount = 0;
const byTheme = {};
for (const w of en.words) (byTheme[w.th] = byTheme[w.th] || []).push(w);
for (const w of en.words) {
  const theme = byTheme[w.th];
  const dm = shuffle(theme.filter(x => x.w !== w.w)).slice(0, 3).map(x => x.m);
  if (add(w.g, '英语', `“${w.w}”是什么意思？`, w.m, dm, `词汇·${w.th}`, 1)) enCount++;
  const dw = shuffle(theme.filter(x => x.m !== w.m)).slice(0, 3).map(x => x.w);
  if (add(w.g, '英语', `“${w.m}”的英文是？`, w.w, dw, `词汇·${w.th}`, 2)) enCount++;
}
const pasts = en.verbs.map(v => v.p);
for (const v of en.verbs) {
  const d = shuffle(pasts.filter(p => p !== v.p)).slice(0, 3);
  if (add(v.g, '英语', `“${v.b}”的过去式是？`, v.p, d, '动词过去式', 2)) enCount++;
}
const plurals = en.plurals.map(p => p.p);
for (const p of en.plurals) {
  const d = shuffle(plurals.filter(x => x !== p.p)).slice(0, 3);
  if (add(p.g, '英语', `“${p.s}”的复数是？`, p.p, d, '名词复数', 2)) enCount++;
}
const comps = en.comps.map(c => c.c);
for (const c of en.comps) {
  const d = shuffle(comps.filter(x => x !== c.c)).slice(0, 3);
  if (add(c.g, '英语', `“${c.a}”的比较级是？`, c.c, d, '比较级', 2)) enCount++;
}

/* ---------------- 输出 ---------------- */
fs.mkdirSync(OUT, { recursive: true });
let files = 0, total = 0;
const byGS = {};
for (const [key, list] of bags) {
  if (!list.length) continue;
  const [g, subj] = key.split('|');
  const doc = { grade: Number(g), subjects: { [subj]: list } };
  const file = path.join(OUT, `gen-${subj}-g${g}.json`);
  fs.writeFileSync(file, JSON.stringify(doc, null, 1), 'utf8');
  byGS[g] = byGS[g] || {};
  byGS[g][subj] = list.length;
  files++; total += list.length;
}
console.log(`事实表题 ${pairCount} · 语文 ${cnCount} · 英语 ${enCount}`);
console.log(`写出 ${files} 个文件，共 ${total} 题`);
console.table(byGS);
