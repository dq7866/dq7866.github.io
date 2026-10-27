/**
 * 题库与判分逻辑（Workers / Pages Functions 共用）
 *
 * 纯函数模块，不依赖任何运行时特定 API，
 * 因此 Workers 的 fetch 入口和 Pages Functions 的文件路由都能 import。
 */

/** 洗牌（Fisher-Yates）。题目顺序的随机性不影响公平性，
 *  真正的防作弊靠服务端判分——correct 字段不下发到浏览器。 */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const gradesOf = q => (q.grades && q.grades.length ? q.grades : [q.grade]);

/** 按难度组织候选池：目标难度优先，其次相邻，最后兜底 */
export function poolByLevel(QUESTIONS, grade, subject, level) {
  const lv = Math.min(Math.max(Number(level) || 2, 1), 3);
  let list = QUESTIONS.filter(q => gradesOf(q).includes(Number(grade)));
  if (!list.length) list = QUESTIONS.filter(q => q.grade === Number(grade));
  if (!list.length) list = QUESTIONS.slice();
  if (subject && subject !== 'mix') {
    const bySubj = list.filter(q => q.subj === subject);
    if (bySubj.length) list = bySubj;
  }
  const exact = list.filter(q => q.level === lv);
  const near = list.filter(q => q.level === lv - 1 || q.level === lv + 1);
  const rest = list.filter(q => q.level !== lv && q.level !== lv - 1 && q.level !== lv + 1);
  return [...shuffle(exact), ...shuffle(near), ...shuffle(rest)];
}

/** 大混战时按科目轮转取题，避免连着好几道同一科 */
export function takeBalanced(pool, count) {
  const buckets = new Map();
  for (const q of pool) {
    if (!buckets.has(q.subj)) buckets.set(q.subj, []);
    buckets.get(q.subj).push(q);
  }
  const keys = [...buckets.keys()];
  const out = [];
  let round = 0;
  while (out.length < count && round < 200) {
    let progressed = false;
    for (const k of keys) {
      if (out.length >= count) break;
      const b = buckets.get(k);
      if (b.length) { out.push(b.shift()); progressed = true; }
    }
    if (!progressed) break;
    round++;
  }
  return out;
}

/**
 * 题库稳定序号：同一份 questions.json 里下标固定，
 * 与选项顺序无关，客户端无法据此推断答案。
 */
export function buildQidIndex(QUESTIONS) {
  const map = new Map();
  QUESTIONS.forEach((q, i) => {
    const key = q.subj + '||' + q.text;
    if (!map.has(key)) map.set(key, i);
  });
  return map;
}

/**
 * 取题。
 * @param keepAnswer false（默认）→ 输出不含 correct，防作弊
 *                    true  → 保留 correct，仅服务端内部判分用（DO 场景）
 */
export function drawQuestions(QUESTIONS, qidIndex, opts) {
  const { grade, subject, n = 10, level = 2, kp = '', keepAnswer = false } = opts || {};
  const count = Math.min(Math.max(Number(n) || 10, 1), 50);
  const lv = Math.min(Math.max(Number(level) || 2, 1), 3);
  let pool = poolByLevel(QUESTIONS, grade, subject, level);

  // 指定知识点时：优先本年级本科目，不够放开年级。
  // 补足时始终保持 kp 约束——不拿别的知识点充数。
  if (kp) {
    const wantKp = String(kp);
    const byKp = arr => arr.filter(q => String(q.kp || '') === wantKp);
    const sameGrade = byKp(pool);
    if (sameGrade.length) {
      pool = sameGrade;
    } else {
      const sameSubj = byKp(QUESTIONS.filter(q => !subject || subject === 'mix' || q.subj === subject));
      const anyKp = byKp(QUESTIONS);
      pool = sameSubj.length ? sameSubj : anyKp;
    }
  }

  let picked;
  if (!subject || subject === 'mix') {
    const exact = pool.filter(q => q.level === lv);
    picked = exact.length >= count ? takeBalanced(exact, count) : takeBalanced(pool, count);
  } else {
    picked = pool.slice(0, count);
  }

  const used = new Set(picked.map(q => q.subj + '||' + q.text));
  const push = q => {
    if (picked.length >= count) return;
    const k = q.subj + '||' + q.text;
    if (used.has(k)) return;
    used.add(k);
    picked.push(q);
  };
  pool.forEach(push);
  if (picked.length < count && kp) {
    QUESTIONS.filter(q => String(q.kp || '') === String(kp)).forEach(push);
  }
  if (picked.length < count && !kp) {
    const sameSubj = (subject && subject !== 'mix')
      ? QUESTIONS.filter(q => q.subj === subject)
      : QUESTIONS;
    shuffle(sameSubj).forEach(push);
  }

  const out = [];
  for (const q of picked) {
    if (!Array.isArray(q.options) || q.options.length !== 4) continue;
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= 4) continue;
    const order = shuffle(q.options.map((_, i) => i));
    const id = qidIndex.get(q.subj + '||' + q.text);
    const item = {
      subj: q.subj,
      text: q.text,
      options: order.map(i => q.options[i]),
      kp: q.kp || (kp ? String(kp) : q.subj + '基础'),
      grade: q.grade,
      level: q.level,
      qid: id === undefined ? -1 : id,
    };
    if (keepAnswer) {
      // 服务端自用：记录打乱后的正确项下标
      item.correct = order.indexOf(q.correct);
    }
    out.push(item);
  }
  return out;
}

/** 判分：客户端提交选项文本，服务端比对 */
export function gradeAnswer(QUESTIONS, qid, picked) {
  const q = QUESTIONS[Number(qid)];
  if (!q || !Array.isArray(q.options) || q.options.length !== 4) {
    return { error: '题目不存在' };
  }
  const right = q.options[q.correct];
  const ok = String(picked).trim() === String(right).trim();
  return { ok, correct: right };
}

/** 统一 JSON 响应 */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
  });
}
