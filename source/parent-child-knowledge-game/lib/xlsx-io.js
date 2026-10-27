/**
 * Excel（.xlsx / .xls / .csv）导入导出
 *
 * 设计目标：老师/家长拿到导出的表格，直接用 Excel 或 WPS 改，改完再导回来。
 * 因此：
 *   1. 列名宽松匹配 —— 可以调换列顺序、改列名（用常见别名），甚至只写必要列；
 *   2. 正确答案支持「A」「1」「选项原文」三种写法，避免用户猜格式；
 *   3. 年级支持「1」「1,2」「1-3」「三年级」（中文数字也认）；
 *   4. 导出的表带「题目ID」，回传时可选择「按 ID 覆盖」做原地更新。
 */
import XLSX from 'xlsx';
import { SUBJECTS } from './bank-store.js';

/** 导出表头（顺序即导出列顺序） */
export const HEADER = [
  '题目ID', '科目', '年级', '难度', '知识点', '题干',
  '选项A', '选项B', '选项C', '选项D', '正确答案', '状态', '来源',
];

const WIDTHS = [12, 7, 7, 6, 16, 52, 18, 18, 18, 18, 10, 7, 7];

/** 列名归一：去空白、标点、括号，转小写 */
const nk = s => String(s == null ? '' : s)
  .replace(/[\s\u3000:：()（）\[\]【】.、\-_/\\*#]/g, '')
  .toLowerCase();

/** 列名 → 字段。只做全等匹配，避免「题目」和「题目ID」互相吃掉 */
const FIELD_ALIASES = {
  id: ['题目id', 'id', '编号', '题号', '唯一id'],
  subj: ['科目', '学科', '课程', 'subject'],
  grades: ['年级', '适用年级', '年级段', 'grade', 'grades'],
  level: ['难度', '难易度', '难易', 'level', '难度等级'],
  kp: ['知识点', '考点', '知识块', '知识领域', 'kp'],
  text: ['题干', '题目', '问题', '题目内容', '题面', 'text', 'question'],
  o0: ['选项a', '选项1', 'a', '甲'],
  o1: ['选项b', '选项2', 'b', '乙'],
  o2: ['选项c', '选项3', 'c', '丙'],
  o3: ['选项d', '选项4', 'd', '丁'],
  correct: ['正确答案', '答案', '正确选项', 'answer', 'correct'],
};

const IGNORED = new Set(['状态', '来源', '序号', '备注', 'remark', 'status', 'source']);

const ALIAS_INDEX = new Map();
for (const [field, names] of Object.entries(FIELD_ALIASES)) {
  for (const n of names) ALIAS_INDEX.set(n, field);
}

/* ------------------------------ 字段解析 ------------------------------ */

const CN_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/** 「1」「1,2」「1、2」「1-3」「三年级」→ [1] / [1,2] / [1,2,3] */
export function parseGrades(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return [];
  // 全角数字 → 半角
  s = s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[一二三四五六]/g, ch => String(CN_DIGIT[ch]));
  s = s.replace(/[，、;；/|]/g, ',');

  const out = new Set();
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    const range = part.match(/^(\d)[-~到至](\d)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      for (let g = a; g <= b; g++) if (g >= 1 && g <= 6) out.add(g);
      continue;
    }
    const digits = part.replace(/[^\d]/g, '');
    if (!digits) continue;
    for (const ch of digits) {
      const g = Number(ch);
      if (g >= 1 && g <= 6) out.add(g);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** 「易 / 中等 / 难」「1 / 2 / 3」→ 1|2|3 */
export function parseLevel(raw, dflt = 2) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return dflt;
  if (/易|简单|容易|基础|低|easy/i.test(s)) return 1;
  if (/中|普通|一般|medium|normal/i.test(s)) return 2;
  if (/难|困难|高|挑战|hard/i.test(s)) return 3;
  const n = Number(s.replace(/[^\d]/g, ''));
  return [1, 2, 3].includes(n) ? n : dflt;
}

const squeeze = s => String(s == null ? '' : s).replace(/[\s\u3000"'“”‘’]/g, '').toLowerCase();

/** 「B」「2」「选项b」「选项原文」→ 下标 0-3，认不出来返回 -1 */
export function parseCorrect(raw, options) {
  const t = squeeze(raw);
  if (!t) return -1;

  const byText = options.findIndex(o => squeeze(o) === t);
  if (byText >= 0) return byText;

  const letter = t.match(/^(?:选项|答案)?([abcd])$/);
  if (letter) return 'abcd'.indexOf(letter[1]);

  const num = t.match(/^(?:第)?([0-4])(?:个|项|选项)?$/);
  if (num) {
    const v = Number(num[1]);
    // 0 → 第一个，1-4 → 第 1-4 个（按人的习惯，1 就是 A）
    return v === 0 ? 0 : v - 1;
  }

  const loose = options.findIndex(o => o && t.includes(squeeze(o)));
  return loose;
}

/* ------------------------------ 表头解析 ------------------------------ */

function mapHeader(cells) {
  const fields = {};
  let matched = 0;
  const unknown = [];
  (cells || []).forEach((cell, i) => {
    const key = nk(cell);
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(fields, ALIAS_INDEX.get(key))) return;
    const field = ALIAS_INDEX.get(key);
    if (field) {
      if (fields[field] == null) { fields[field] = i; matched++; }
    } else if (!IGNORED.has(key)) {
      unknown.push(String(cell).trim());
    }
  });
  return { fields, matched, unknown };
}

/* ------------------------------ 读 ------------------------------ */

/**
 * 解析上传的表格 → 题目草稿数组
 * @returns {{sheet:string, mapping:object, unknown:string[], rows:Array}}
 *   rows: [{ row:number, id:string, question:object|null, error:string|null }]
 */
export function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  if (!wb.SheetNames.length) throw new Error('这个文件里没有工作表');

  const sheetName = wb.SheetNames.find(n => /题目|题库|questions?/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('读不到工作表内容');

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
  if (!aoa.length) throw new Error('工作表是空的');

  let headerAt = -1;
  let mapping = null;
  for (let i = 0; i < Math.min(aoa.length, 8); i++) {
    const m = mapHeader(aoa[i]);
    if (m.fields.text != null && m.fields.subj != null && m.fields.correct != null && m.matched >= 4) {
      headerAt = i; mapping = m; break;
    }
  }
  if (headerAt < 0) {
    throw new Error('没认出表头：至少需要「科目」「题干」「选项A~D」「正确答案」这几列，可直接下载模板对照');
  }

  const f = mapping.fields;
  const cell = (row, field) => (f[field] == null ? '' : String(row[f[field]] == null ? '' : row[f[field]]).trim());

  const rows = [];
  for (let r = headerAt + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every(c => String(c == null ? '' : c).trim() === '')) continue;
    const lineNo = r + 1;   // Excel 行号（1 起）
    const draft = {
      id: cell(row, 'id'),
      subj: cell(row, 'subj'),
      text: cell(row, 'text'),
      options: [cell(row, 'o0'), cell(row, 'o1'), cell(row, 'o2'), cell(row, 'o3')],
      grades: parseGrades(cell(row, 'grades')),
      level: parseLevel(cell(row, 'level')),
      kp: cell(row, 'kp'),
    };
    const correct = parseCorrect(cell(row, 'correct'), draft.options);

    // 结构层面的问题先在这里挡掉，给出行号，别丢给 store 报一句看不懂的话
    let error = null;
    if (!draft.text) error = '题干为空';
    else if (!draft.subj) error = '科目为空';
    else if (!SUBJECTS.includes(draft.subj)) error = `科目「${draft.subj}」不认识`;
    else if (draft.options.filter(Boolean).length !== 4) error = '选项必须 4 个都填';
    else if (correct < 0) error = `正确答案「${cell(row, 'correct')}」对不上任何选项`;
    else if (!draft.grades.length) error = '年级没填或超出 1-6';

    const question = error ? null : {
      subj: draft.subj,
      text: draft.text,
      options: draft.options,
      correct,
      grades: draft.grades,
      grade: draft.grades[0],
      kp: draft.kp || draft.subj + '基础',
      level: draft.level,
    };

    rows.push({ row: lineNo, id: draft.id, question, error });
  }

  return { sheet: sheetName, mapping: mapping.fields, unknown: mapping.unknown, rows };
}

/* ------------------------------ 写 ------------------------------ */

const GUIDE = [
  ['题库导入填写说明'],
  [''],
  ['一、怎么用'],
  ['1. 在「题目」工作表里一行写一道题，第一行表头请不要删。'],
  ['2. 填完保存为 .xlsx，回到后台点「导入」，选这个文件即可（也可以存成 .csv，但要用 UTF-8 编码）。'],
  ['3. 只想新增题：把「题目ID」列整列留空。想改已有的题：从「导出」得到的表里改，ID 会跟着回来。'],
  [''],
  ['二、每一列怎么填'],
  ['列名', '必填', '说明'],
  ['题目ID', '否', '留空=新增；填了且库里存在=更新那道题。建议直接从导出文件改。'],
  ['科目', '是', '只能是：' + SUBJECTS.join(' / ')],
  ['年级', '是', '1-6。多个年级用逗号隔开，例如 1,2；也可以写 1-3 表示一到三年级。'],
  ['难度', '否', '填 1/2/3，或「易」「中等」「难」。不填默认 2。'],
  ['知识点', '否', '例如「分数的意义」。不填会归到「科目+基础」。'],
  ['题干', '是', '最多 300 字。不要带题号。'],
  ['选项A~D', '是', '四个选项都要填，不能重复，每项最多 60 字。'],
  ['正确答案', '是', '填 A / B / C / D；也可以填 1-4（1 就是 A），或直接填该选项的原文。'],
  ['状态 / 来源', '否', '导出时自动生成，导入时忽略，改了也没用。'],
  [''],
  ['三、导入时会发生什么'],
  ['· 每行都会单独校验，坏行会带 Excel 行号回报，好行照常导入，不会因为一行出错整批失败。'],
  ['· 题干+科目完全相同的题会被判为重复，默认跳过；选了「按 ID 覆盖」则按 ID 更新。'],
  ['· 单次最多 2000 道。'],
];

/** 把题目数组写成 xlsx Buffer */
export function buildWorkbook(rows, { sheetName = '题目' } = {}) {
  const data = [HEADER];
  for (const q of rows) {
    data.push([
      q.id || '',
      q.subj || '',
      (q.grades && q.grades.length ? q.grades : [q.grade]).filter(Boolean).join(','),
      q.level || 2,
      q.kp || '',
      q.text || '',
      ...(q.options || []).slice(0, 4),
      'ABCD'[q.correct] ?? '',
      q.source === 'admin' ? '新增' : '原题',
      q.source || 'base',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = WIDTHS.map(w => ({ wch: w }));
  ws['!freeze'] = 'A2';
  if (data.length > 1) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: HEADER.length - 1 } }),
    };
  }

  const guide = XLSX.utils.aoa_to_sheet(GUIDE);
  guide['!cols'] = [{ wch: 14 }, { wch: 6 }, { wch: 88 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, guide, '填写说明');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** 空白模板：表头 + 3 行示例 */
export function buildTemplate() {
  return buildWorkbook([
    {
      id: '', subj: '数学', grades: [3], level: 1, kp: '分数的意义',
      text: '把一个圆平均分成 4 份，其中的 1 份是这个圆的几分之几？',
      options: ['四分之一', '二分之一', '三分之一', '五分之一'], correct: 0, source: 'admin',
    },
    {
      id: '', subj: '语文', grades: [2, 3], level: 2, kp: '形近字',
      text: '「已经」和「以经」哪个写法正确？',
      options: ['已经', '以经', '己经', '已径'], correct: 0, source: 'admin',
    },
    {
      id: '', subj: '科学', grades: [4], level: 3, kp: '光',
      text: '下面哪种物体不是光源？',
      options: ['太阳', '点亮的电灯', '月亮', '燃烧的蜡烛'], correct: 2, source: 'admin',
    },
  ], { sheetName: '题目' });
}
