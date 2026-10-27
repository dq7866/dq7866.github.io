/**
 * 合并题库：人工新增题（data/bank/*.json，带知识点与难度）
 *        + 线上采集题（data/harvested.json，只有题干和选项）
 * 产出 data/questions.json。
 *
 * 采集题没有知识点标签，用关键词规则补标；难度默认 2（进阶），
 * 明显的简单加减标 1，多步/换算/推理类标 2~3。
 *
 * 用法：node scripts/build-bank.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'data', 'bank');
const HARVEST = path.join(ROOT, 'data', 'harvested.json');
const OUT = path.join(ROOT, 'data', 'questions.json');
const CURRICULUM = path.join(ROOT, 'data', 'curriculum.json');

/* -------- 知识点归一：把历史/规则产生的杂乱名字统一到课程标准名 -------- */
const CURR = JSON.parse(fs.readFileSync(CURRICULUM, 'utf8'));
const canonKp = (subj, kp) => {
  const bySubj = (CURR.aliasesBySubject || {})[subj] || {};
  if (bySubj[kp]) return bySubj[kp];
  return (CURR.aliases || {})[kp] || kp;
};

// 「面积与周长」这类历史混装标签改名后会串知识点，按题干里的关键词纠正回来
const fixMixedKp = (subj, kp, text) => {
  if (subj !== '数学') return kp;
  const t = String(text);
  if (kp === '面积' && /周长/.test(t) && !/面积/.test(t)) return '周长';
  if (kp === '周长' && /面积/.test(t) && !/周长/.test(t)) return '面积';
  return kp;
};

// 长方形/长方体习惯上「长」不小于「宽」，生成器偶有写反，这里统一纠正（换数不影响面积周长体积）
const fixRectDims = text => {
  const t = String(text);
  if (!/面积|周长|体积|表面积/.test(t)) return t;
  if (/多多少|少多少|相差|是.*的几倍|几倍/.test(t)) return t;
  return t.replace(
    /长\s*(\d+(?:\.\d+)?)([^0-9]{0,6})宽\s*(\d+(?:\.\d+)?)/,
    (m, a, mid, b) => (Number(a) >= Number(b) ? m : `长 ${b}${mid}宽 ${a}`),
  );
};

/* ---------------------- 采集题的知识点打标规则 ---------------------- */
const RULES = {
  语文: [
    [/反义词|近义词/, '近反义词'],
    [/几画|笔顺|偏旁|加一笔|加两笔|结构/, '笔画笔顺'],
    [/古诗|下一句|作者|《/, '古诗积累'],
    [/成语/, '成语积累'],
    [/量词|一（/, '量词'],
    [/拼音|音节|声母|韵母/, '拼音识字'],
    [/句子|标点|问句|感叹/, '句子表达'],
    [/意思|意思接近|形容|词语/, '词语理解'],
  ],
  数学: [
    [/周长|面积|对称|三角形|正方形|长方形|圆形|图形/, '图形与几何'],
    [/时|分|秒|月|日|星期|年/, '时间'],
    [/元|角|分钱|钱/, '人民币'],
    [/米|厘米|分米|千米|克|千克|吨/, '单位换算'],
    [/×|÷|倍|平均分/, '乘除法'],
    [/[+\-−]\s*\d|\d\s*[+\-−]/, '加减法'],
    [/规律|下一个|括号里/, '规律与逻辑'],
    [/一共|还剩|买了|多少/, '应用题'],
  ],
  科学: [
    [/动物|鸟|鱼|虫|猫|狗|兔|青蛙|蚕|蚂蚁/, '动物'],
    [/植物|叶|根|花|种子|树/, '植物'],
    [/天气|雨|雪|风|云|彩虹|季节|温度/, '天气与季节'],
    [/水|冰|蒸发|凝结/, '水与空气'],
    [/光|影子|镜子|声音/, '光与声'],
    [/磁|电/, '磁与电'],
    [/身体|呼吸|心脏|牙|骨|眼睛/, '人体健康'],
    [/太阳|月亮|星星|地球/, '地球与宇宙'],
  ],
  英语: [
    [/数字|几|“?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)/i, '颜色数字'],
    [/颜色|color|red|blue|green|yellow|black|white/i, '颜色数字'],
    [/问候|hello|good|thank|sorry|bye|morning|night/i, '日常问候'],
    [/妈妈|爸爸|mother|father|sister|brother|family/i, '家庭与朋友'],
    [/吃|喝|apple|banana|milk|rice|bread|egg|water/i, '食物饮料'],
    [/动物|cat|dog|bird|fish|rabbit|tiger/i, '动物'],
    [/句子|意思|name|how|what|where/i, '简单句型'],
  ],
  安全: [
    [/马路|红灯|车|斑马线|安全带|骑车/, '交通安全'],
    [/陌生人|骗|跟走|中奖/, '防拐防骗'],
    [/插座|电|烫|燃气|热水|门铃/, '居家安全'],
    [/吃|药品|过期|洗手|食品/, '饮食卫生'],
    [/老师|同学|教室|走廊|学校/, '校园安全'],
    [/水|游泳|河|溺水/, '野外与水边'],
    [/电话|火灾|地震|电梯|受伤|出血/, '应急求助'],
  ],
};

function tagKp(subj, text) {
  for (const [re, kp] of RULES[subj] || []) if (re.test(text)) return kp;
  return subj + '基础';
}

function tagLevel(subj, text) {
  if (subj === '数学') {
    const m = text.match(/(\d+)\s*([+\-−×÷])\s*(\d+)/);
    if (m) {
      const a = Number(m[1]), b = Number(m[3]);
      const op = m[2];
      if (op === '+' || op === '−' || op === '-') return a <= 10 && b <= 10 ? 1 : (a < 100 ? 2 : 2);
      return 2;
    }
    if (/周长|面积|平均分|规律|倍/.test(text)) return 3;
    return 2;
  }
  return 2;
}

/* ------------------------------ 载入 ------------------------------ */
const merged = new Map();   // key -> question
let authored = 0, harvestedIn = 0, dupSkipped = 0;

function normText(t) {
  return String(t).replace(/\s+/g, '').replace(/[“”‘’"']/g, '').trim();
}
function keyOf(q) { return normText(q.text) + '|' + q.subj; }

function add(q, source) {
  const k = keyOf(q);
  const cur = merged.get(k);
  if (cur) {
    // 同一道题出现在多个年级：合并年级归属，别把题池缩掉
    const grades = new Set([...(cur.grades || [cur.grade]), ...(q.grades || [q.grade])]);
    cur.grades = [...grades].sort((a, b) => a - b);
    if (source === 'authored' && cur.source !== 'authored') {
      // 人工题优先（带知识点与难度标签）
      q.grades = cur.grades;
      merged.set(k, q);
      authored++;
    } else {
      dupSkipped++;
    }
    return;
  }
  merged.set(k, q);
  if (source === 'authored') authored++; else harvestedIn++;
}

/* 1) 采集题 */
const harvested = JSON.parse(fs.readFileSync(HARVEST, 'utf8'));

// 线上采样数据里混进了 grade 7（接口给的档位，小学只到 6），内容其实都是小学低中段。
// 按题干把它归回真实年级；判不出来的直接不要，避免脏年级污染题池。
const inferGrade = (subj, text) => {
  if (subj !== '数学') return null;
  const t = String(text);
  if (/长方形|正方形|周长|面积/.test(t)) return 3;
  const m = t.match(/(\d+)\s*([−\-+×÷])\s*(\d+)/);
  if (!m) return null;
  const a = Number(m[1]), op = m[2], b = Number(m[3]);
  if (op === '+' || op === '−' || op === '-') return a <= 100 && b <= 100 ? 2 : 3;
  if (op === '×') return a <= 9 && b <= 9 ? 2 : 3;
  if (op === '÷') return a <= 81 && b <= 9 ? 2 : 3;
  return null;
};

let droppedGrade = 0;
for (const q of harvested) {
  const options = (q.options || []).map(String);
  if (options.length !== 4) continue;
  const correct = Number.isInteger(q.correct) ? q.correct : 0;

  let grades = (q.grades || [q.grade]).map(Number).filter(g => g >= 1 && g <= 6);
  if (!grades.length) {
    const g2 = inferGrade(q.subj, q.text);
    if (!g2) { droppedGrade++; continue; }
    grades = [g2];
  }
  grades = [...new Set(grades)].sort((a, b) => a - b);

  add({
    grade: grades[0],
    grades,
    subj: q.subj,
    text: fixRectDims(String(q.text).trim()),
    options,
    correct,
    answer: options[correct],
    kp: fixMixedKp(q.subj, canonKp(q.subj, tagKp(q.subj, q.text)), q.text),
    level: tagLevel(q.subj, q.text),
    source: 'harvested',
  }, 'harvested');
}

/* 2) 人工题 */
for (const f of fs.readdirSync(BANK_DIR).filter(f => f.endsWith('.json'))) {
  const doc = JSON.parse(fs.readFileSync(path.join(BANK_DIR, f), 'utf8'));
  const grade = doc.grade;
  for (const [subj, list] of Object.entries(doc.subjects)) {
    for (const item of list) {
      const options = item.o.map(String);
      if (options.length !== 4) { console.warn('⚠️ 选项数不是 4：', subj, item.t); continue; }
      if (!(item.a >= 0 && item.a <= 3)) { console.warn('⚠️ 答案下标异常：', subj, item.t); continue; }
      add({
        grade,
        grades: [grade],
        subj,
        text: fixRectDims(item.t),
        options,
        correct: item.a,
        answer: options[item.a],
        kp: fixMixedKp(subj, canonKp(subj, item.kp || tagKp(subj, item.t)), item.t),
        level: item.lv || 2,
        source: 'authored',
      }, 'authored');
    }
  }
}

const questions = [...merged.values()].sort((a, b) =>
  a.grade - b.grade || a.subj.localeCompare(b.subj, 'zh') || a.level - b.level);

fs.writeFileSync(OUT, JSON.stringify(questions, null, 1), 'utf8');

/* ------------------------------ 报告 ------------------------------ */
const byGS = {}, byLv = {};
for (const q of questions) {
  byGS[q.grade] = byGS[q.grade] || {};
  byGS[q.grade][q.subj] = (byGS[q.grade][q.subj] || 0) + 1;
  byLv[q.level] = (byLv[q.level] || 0) + 1;
}
console.log(`人工题 ${authored} 道 · 采集题 ${harvestedIn} 道 · 去重跳过 ${dupSkipped} 道`);
if (droppedGrade) console.log(`丢弃年级无法判定的采集题 ${droppedGrade} 道`);
console.log(`合计 ${questions.length} 道 → data/questions.json`);

/* ---------------------- 出厂校验：年级必须在 1-6 ---------------------- */
const badGrade = questions.filter(q => {
  const gs = q.grades && q.grades.length ? q.grades : [q.grade];
  return gs.some(g => !Number.isInteger(g) || g < 1 || g > 6);
});
if (badGrade.length) {
  console.error(`❌ 有 ${badGrade.length} 道题年级越界（小学只支持 1-6）：`);
  badGrade.slice(0, 5).forEach(q => console.error('   ', JSON.stringify(q.grades || q.grade), q.subj, String(q.text).slice(0, 34)));
  process.exitCode = 1;
} else {
  console.log('✅ 年级校验通过：全部题目都在 1-6 年级范围内');
}
console.table(byGS);
console.log('难度分布：', byLv);
