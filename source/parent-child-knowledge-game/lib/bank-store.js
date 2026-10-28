/**
 * 题库存储层 —— 后台管理的数据核心
 *
 * 设计要点（为什么不是一个 questions.json 改到底）：
 *   data/questions.json   是构建产物（scripts/build-bank.mjs 生成），随时可能被重建覆盖
 *   data/admin/overlay.json 是管理端的「人工修订层」：新增 / 修改 / 删除三张表
 * 两者在加载时合并成「生效题库」，重建 questions.json 不会冲掉管理员的操作。
 *
 * 题目 id 由 科目+题干 的哈希确定性生成——只要题干不改，重建后 id 不变，
 * 修订层就能一直命中；管理员新增的题用独立的 a 前缀 id，改题干也不影响引用。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SUBJECTS = ['语文', '数学', '科学', '英语', '品德', '安全'];
export const GRADES = [1, 2, 3, 4, 5, 6];

const norm = s => String(s == null ? '' : s).replace(/\s+/g, '').replace(/[“”‘’"']/g, '').trim();

/** 基础题库里的题：id 由内容决定 */
export function contentId(subj, text) {
  return 'q' + crypto.createHash('sha1').update(norm(subj) + '|' + norm(text)).digest('hex').slice(0, 10);
}

export function newId() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export class ValidationError extends Error {
  constructor(msg) { super(msg); this.status = 400; }
}

/** 把任意输入整理成合法题目对象，非法则抛 ValidationError */
export function normalizeQuestion(input, prev = null) {
  const src = { ...(prev || {}), ...(input || {}) };

  const text = String(src.text == null ? '' : src.text).trim();
  if (!text) throw new ValidationError('题干不能为空');
  if (text.length > 300) throw new ValidationError('题干最多 300 字');

  const subj = String(src.subj || '').trim();
  if (!SUBJECTS.includes(subj)) throw new ValidationError('科目必须是：' + SUBJECTS.join(' / '));

  let options = Array.isArray(src.options) ? src.options.map(o => String(o == null ? '' : o).trim()) : [];
  if (options.length !== 4) throw new ValidationError('必须正好 4 个选项');
  if (options.some(o => !o)) throw new ValidationError('选项不能有空值');
  if (options.some(o => o.length > 60)) throw new ValidationError('单个选项最多 60 字');
  const seen = new Set();
  for (const o of options) {
    const k = norm(o);
    if (seen.has(k)) throw new ValidationError('选项内容有重复：' + o);
    seen.add(k);
  }

  let correct = Number(src.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) {
    throw new ValidationError('正确答案必须是 0-3 的选项下标');
  }

  let grades = Array.isArray(src.grades) ? src.grades : (src.grade ? [src.grade] : []);
  grades = [...new Set(grades.map(Number).filter(g => GRADES.includes(g)))].sort((a, b) => a - b);
  if (!grades.length) throw new ValidationError('至少选一个适用年级');

  let level = Number(src.level);
  if (![1, 2, 3].includes(level)) level = 2;

  const kp = String(src.kp || '').trim().slice(0, 24) || subj + '基础';

  return {
    subj,
    text,
    options,
    correct,
    answer: options[correct],   // 始终与 options 同步，避免出现两套答案
    grades,
    grade: grades[0],
    kp,
    level,
  };
}

export function createBankStore(dataDir) {
  const BASE_FILE = path.join(dataDir, 'questions.json');
  // 题库另有「入库快照」一份，供 Cloudflare 构建用（CI 只跑 hexo generate，
  // 不跑 build:bank，所以代码库里必须有一份可用的题库）。
  // 刚克隆仓库时 data/questions.json 还不存在（它是构建产物、被 gitignore），
  // 此时回退读快照，保证 `npm start` 直接能跑，不必先手动生成。
  const BASE_FALLBACK = path.join(dataDir, '..', 'cloudflare', 'bank', 'questions.json');
  const ADMIN_DIR = path.join(dataDir, 'admin');
  const OVERLAY_FILE = path.join(ADMIN_DIR, 'overlay.json');
  const AUDIT_FILE = path.join(ADMIN_DIR, 'audit.jsonl');

  const emptyOverlay = () => ({ version: 1, patched: {}, added: [], deleted: [] });

  let base = [];        // 构建产物原样
  let overlay = emptyOverlay();
  let list = [];        // 合并后的生效题库（含所有字段 + id）
  let index = new Map();// id -> question
  let auditLines = [];

  function readOverlay() {
    try {
      const raw = JSON.parse(fs.readFileSync(OVERLAY_FILE, 'utf8'));
      return {
        version: raw.version || 1,
        patched: raw.patched && typeof raw.patched === 'object' ? raw.patched : {},
        added: Array.isArray(raw.added) ? raw.added : [],
        deleted: Array.isArray(raw.deleted) ? raw.deleted : [],
      };
    } catch { return emptyOverlay(); }
  }

  function merge() {
    const del = new Set(overlay.deleted);
    const out = [];
    for (const q of base) {
      const id = q.id || contentId(q.subj, q.text);
      if (del.has(id)) continue;
      const p = overlay.patched[id];
      const rec = p ? { ...q, ...p, id } : { ...q, id };
      if (!Array.isArray(rec.grades) || !rec.grades.length) rec.grades = [rec.grade];
      if (!rec.answer || rec.answer !== rec.options?.[rec.correct]) {
        rec.answer = (rec.options || [])[rec.correct] ?? '';
      }
      out.push(rec);
    }
    for (const a of overlay.added) {
      if (del.has(a.id)) continue;
      out.push({ ...a });
    }
    list = out;
    index = new Map(out.map(q => [q.id, q]));
    return out;
  }

  /* 查重索引：科目+题干 归一后作键 → id
   * 没有它，每次 create/update 都要线性扫全库（5000+ 道题），
   * 批量导入时是 O(n²)，实测 500 行要 30 秒。 */
  let dupIndex = new Map();
  const dupKey = q => norm(q.subj) + '|' + norm(q.text);
  function rebuildDupIndex() {
    dupIndex = new Map();
    for (const q of list) dupIndex.set(dupKey(q), q.id);
  }
  function noteDup(q) {
    dupIndex.set(dupKey(q), q.id);
  }
  function dropDup(q) {
    const k = dupKey(q);
    if (dupIndex.get(k) === q.id) dupIndex.delete(k);
  }

  function persistOverlay() {
    fs.mkdirSync(ADMIN_DIR, { recursive: true });
    const tmp = OVERLAY_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(overlay, null, 1), 'utf8');
    fs.renameSync(tmp, OVERLAY_FILE);
  }

  /* 审计日志：每条 appendFileSync 是同步磁盘 IO，
   * 批量导入 2000 行就是 2000 次同步写（实测占了大头耗时）。
   * 事务内先攒着，结束时一次性 append。 */
  let auditBuffer = [];

  function audit(action, id, detail) {
    const line = JSON.stringify({ at: new Date().toISOString(), action, id, ...detail });
    auditLines.push(line);
    if (auditLines.length > 800) auditLines = auditLines.slice(-400);
    if (batching) { auditBuffer.push(line); return; }
    try {
      fs.mkdirSync(ADMIN_DIR, { recursive: true });
      fs.appendFileSync(AUDIT_FILE, line + '\n', 'utf8');
    } catch { /* 日志失败不影响主流程 */ }
  }

  function flushAudit() {
    if (!auditBuffer.length) return;
    const buf = auditBuffer;
    auditBuffer = [];
    try {
      fs.mkdirSync(ADMIN_DIR, { recursive: true });
      fs.appendFileSync(AUDIT_FILE, buf.map(l => l + '\n').join(''), 'utf8');
    } catch { /* 日志失败不影响主流程 */ }
  }

  function load() {
    // 优先用本地构建产物；没有就退回入库快照（克隆仓库后的首次启动走这里）
    let basePath = BASE_FILE;
    if (!fs.existsSync(basePath)) {
      if (!fs.existsSync(BASE_FALLBACK)) {
        throw new Error(
          '题库文件不存在：' + BASE_FILE + '\n' +
          '请先运行 `npm run build:bank` 生成题库（约需 1-2 分钟）。'
        );
      }
      basePath = BASE_FALLBACK;
      console.log('[bank] data/questions.json 不存在，已回退读 cloudflare/bank/questions.json');
    }
    base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    overlay = readOverlay();
    merge();
    rebuildDupIndex();
    dirty = false;
    try {
      auditLines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean).slice(-400);
    } catch { auditLines = []; }
    return list;
  }

  function findDuplicate(q, exceptId) {
    const key = dupKey(q);
    const hitId = dupIndex.get(key);
    if (!hitId || hitId === exceptId) return null;
    return index.get(hitId) || null;
  }

  /* ------------------------------ 查询 ------------------------------ */
  function query(opts = {}) {
    const { grade, subj, level, kp, keyword, source, status, page = 1, size = 20 } = opts;
    const del = new Set(overlay.deleted);
    const addedIds = new Set(overlay.added.map(a => a.id));
    // 新增题被再次编辑后也算「我改过的」
    const isEdited = q => !!overlay.patched[q.id] ||
      (addedIds.has(q.id) && Number(q.updatedAt || 0) > Number(q.createdAt || 0));

    let rows = list;
    if (grade) rows = rows.filter(q => (q.grades || [q.grade]).includes(Number(grade)));
    if (subj && subj !== 'all') rows = rows.filter(q => q.subj === subj);
    if (level) rows = rows.filter(q => Number(q.level) === Number(level));
    if (kp && kp !== 'all') rows = rows.filter(q => q.kp === kp);
    if (source === 'admin') rows = rows.filter(q => addedIds.has(q.id) || overlay.patched[q.id]);
    else if (source === 'base') rows = rows.filter(q => !addedIds.has(q.id) && !overlay.patched[q.id]);
    if (status === 'added') rows = rows.filter(q => addedIds.has(q.id));
    else if (status === 'edited') rows = rows.filter(isEdited);
    else if (status === 'deleted') {
      // 已删除的题不在 list 里，从基础库或新增记录里反查
      const baseById = new Map(base.map(q => [q.id || contentId(q.subj, q.text), q]));
      rows = [...del].map(id => baseById.get(id) || overlay.added.find(a => a.id === id)).filter(Boolean);
    }
    if (keyword) {
      const kw = norm(keyword);
      rows = rows.filter(q =>
        norm(q.text).includes(kw) || norm(q.kp).includes(kw) ||
        (q.options || []).some(o => norm(o).includes(kw)));
    }

    const total = rows.length;
    const sz = Math.min(Math.max(Number(size) || 20, 5), 200);
    const pages = Math.max(1, Math.ceil(total / sz));
    const p = Math.min(Math.max(Number(page) || 1, 1), pages);
    const start = (p - 1) * sz;

    return {
      total, page: p, pages, size: sz,
      rows: rows.slice(start, start + sz).map(q => ({
        ...q,
        _added: addedIds.has(q.id),
        _edited: isEdited(q),
        _deleted: del.has(q.id),
      })),
    };
  }

  /* ------------------------------ 写入 ------------------------------ */
  /* 批量事务：批量导入时，每行都 merge()+persistOverlay() 会退化成 O(n²)。
   * 实测 500 行要 30 秒、2000 行要 2 分钟。
   * 这里把「合并索引」与「落盘」推迟到事务结束，只做一次。 */
  let batching = false;
  let dirty = false;

  /** 事务内写盘：合并一次、落盘一次 */
  function flush() {
    if (!dirty && !auditBuffer.length) return;
    dirty = false;
    merge();
    rebuildDupIndex();
    persistOverlay();
    flushAudit();
  }

  /**
   * 以事务方式执行一组写入。
   * fn 内部可以调 create/update/remove/restore，它们只改内存不落盘；
   * 事务结束后统一 merge + 落盘一次。
   */
  function transaction(fn) {
    const wasBatching = batching;
    batching = true;
    try {
      return fn();
    } finally {
      batching = wasBatching;
      if (!batching) flush();
    }
  }

  function markDirty() {
    dirty = true;
    if (!batching) flush();
  }

  function create(input) {
    const q = normalizeQuestion(input);
    const dup = findDuplicate(q);
    if (dup) throw Object.assign(new ValidationError('已有相同题干的题目：' + dup.text.slice(0, 30)), { status: 409, dupId: dup.id });
    const rec = {
      ...q,
      id: newId(),
      source: 'admin',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    overlay.added.push(rec);
    // 事务内只改内存：索引与查重表在 flush 时统一重建
    if (batching) { noteDup(rec); dirty = true; }
    else { markDirty(); }
    audit('create', rec.id, { text: rec.text });
    return rec;
  }

  function update(id, input) {
    const cur = index.get(id);
    if (!cur) throw Object.assign(new ValidationError('题目不存在'), { status: 404 });
    if (overlay.deleted.includes(id)) throw Object.assign(new ValidationError('该题已删除，请先恢复'), { status: 400 });

    const q = normalizeQuestion(input, cur);
    // 题干/科目变了要重新查重
    const dup = findDuplicate(q, id);
    if (dup) throw Object.assign(new ValidationError('与另一道题重复：' + dup.text.slice(0, 30)), { status: 409, dupId: dup.id });

    if (overlay.added.some(a => a.id === id)) {
      const rec = overlay.added.find(a => a.id === id);
      Object.assign(rec, q, { updatedAt: Date.now() });
      if (batching) { noteDup(rec); dirty = true; }
      else { markDirty(); }
      audit('update', id, { text: rec.text });
      return index.get(id) || rec;
    }
    overlay.patched[id] = {
      ...(overlay.patched[id] || {}),
      subj: q.subj, text: q.text, options: q.options, correct: q.correct,
      answer: q.answer, grades: q.grades, grade: q.grade, kp: q.kp, level: q.level,
      updatedAt: Date.now(),
    };
    if (batching) { dirty = true; }
    else { markDirty(); }
    audit('update', id, { text: q.text });
    return index.get(id);
  }

  function remove(id) {
    const cur = index.get(id);
    if (!cur) throw Object.assign(new ValidationError('题目不存在'), { status: 404 });
    // 统一软删除：新增题也记入 deleted，这样「已删除」里能找回，不会一删就没
    if (overlay.deleted.includes(id)) throw Object.assign(new ValidationError('该题已在删除列表里'), { status: 400 });
    overlay.deleted.push(id);
    delete overlay.patched[id];
    if (batching) { dropDup(cur); dirty = true; }
    else { markDirty(); }
    audit('delete', id, { text: cur.text });
    return { id, text: cur.text };
  }

  function restore(id) {
    const i = overlay.deleted.indexOf(id);
    if (i < 0) throw Object.assign(new ValidationError('该题不在删除列表里'), { status: 400 });
    overlay.deleted.splice(i, 1);
    if (batching) { dirty = true; }
    else { markDirty(); }
    audit('restore', id, {});
    return index.get(id);
  }

  function bulk(action, ids, patch) {
    const done = [];
    const failed = [];
    // 整个批量操作放进事务：中途的每条写入只改内存，
    // 结束时统一重建索引 + 落盘一次（原先每条都要全量重算，500 条要 30 秒）
    transaction(() => {
      for (const id of ids) {
        try {
          if (action === 'delete') { remove(id); done.push(id); }
          else if (action === 'restore') { restore(id); done.push(id); }
          else if (action === 'update') {
            const cur = index.get(id);
            if (!cur) { failed.push({ id, error: '题目不存在' }); continue; }
            const patch2 = { ...(patch || {}) };
            // 批量加年级：与现有年级取并集，而不是覆盖
            if (Array.isArray(patch2.addGrades) && patch2.addGrades.length) {
              patch2.grades = [...new Set([...(cur.grades || [cur.grade]), ...patch2.addGrades.map(Number)])]
                .filter(g => GRADES.includes(g)).sort((a, b) => a - b);
            }
            delete patch2.addGrades;
            update(id, { ...cur, ...patch2 });
            done.push(id);
          } else failed.push({ id, error: '未知操作' });
        } catch (e) { failed.push({ id, error: e.message }); }
      }
    });
    audit('bulk:' + action, null, { count: done.length, failed: failed.length });
    return { ok: done.length, failed };
  }

  /* ------------------------------ 统计 ------------------------------ */
  function stats() {
    const byGrade = {}, bySubject = {}, byLevel = { 1: 0, 2: 0, 3: 0 }, byKp = {};
    const matrix = {};
    for (const g of GRADES) matrix[g] = Object.fromEntries(SUBJECTS.map(s => [s, 0]));
    for (const q of list) {
      for (const g of (q.grades || [q.grade])) {
        byGrade[g] = (byGrade[g] || 0) + 1;
        if (matrix[g]) matrix[g][q.subj] = (matrix[g][q.subj] || 0) + 1;
      }
      bySubject[q.subj] = (bySubject[q.subj] || 0) + 1;
      byLevel[q.level] = (byLevel[q.level] || 0) + 1;
      byKp[q.subj + '/' + q.kp] = (byKp[q.subj + '/' + q.kp] || 0) + 1;
    }
    return {
      total: list.length,
      base: base.length,
      added: overlay.added.filter(a => !overlay.deleted.includes(a.id)).length,
      editedCount: Object.keys(overlay.patched).length,
      deleted: overlay.deleted.length,
      kpCount: Object.keys(byKp).length,
      byGrade, bySubject, byLevel, matrix,
      kpList: Object.entries(byKp).map(([kp, n]) => ({ kp, n })).sort((a, b) => b.n - a.n),
    };
  }

  function auditLog(limit = 100) {
    return auditLines.slice(-Math.min(Math.max(limit, 1), 400)).reverse().map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  }

  function exportAll() {
    return list.map(q => ({
      id: q.id, subj: q.subj, text: q.text, options: q.options, correct: q.correct,
      answer: q.answer, grades: q.grades, grade: q.grade, kp: q.kp, level: q.level, source: q.source,
    }));
  }

  /** 清空修订层（恢复出厂题库），危险操作 */
  function resetOverlay() {
    overlay = emptyOverlay();
    persistOverlay();
    merge();
    rebuildDupIndex();
    dirty = false;
    audit('reset', null, {});
    return { total: list.length };
  }

  /** 只查重不落库，给导入预检用 */
  function probe(q, exceptId) {
    return findDuplicate(q, exceptId);
  }

  return {
    load, merge, query, stats, create, update, remove, restore, bulk, transaction,
    auditLog, exportAll, resetOverlay, probe,
    get all() { return list; },
    get byId() { return id => index.get(id); },
    get counts() { return { base: base.length, effective: list.length, added: overlay.added.length, deleted: overlay.deleted.length, patched: Object.keys(overlay.patched).length }; },
  };
}
