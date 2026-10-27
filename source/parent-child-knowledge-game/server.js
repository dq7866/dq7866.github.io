/**
 * ⚡ 知识擂台 · 双机对战 —— 本地服务端
 *
 * 线上版本的服务端（静态托管 + /api/questions 题库接口 + WebSocket 房间同步）
 * 无法从云端下载源码，本文件按客户端实际使用的协议在本地等价重建，并在此之上继续开发：
 *   - GET  /                    静态页面（public/）
 *   - GET  /api/questions       取题：grade / subject / n / level（难度会真正生效）
 *   - GET  /api/health          健康检查
 *   - GET  /api/profile/:code   读取学习档案（跨设备同步）
 *   - PUT  /api/profile/:code   写入学习档案
 *   - WS   /                    房间协议：create / join / answer / rematch
 *
 *   后台管理（需登录，见 lib/bank-store.js）：
 *   - GET  /admin                       题库管理界面
 *   - POST /api/admin/login             登录，返回令牌
 *   - GET  /api/admin/summary           统计（年级×科目矩阵、知识点、修订计数）
 *   - GET  /api/admin/questions         列表（筛选/搜索/分页）
 *   - POST /api/admin/questions         新增
 *   - PUT  /api/admin/questions/:id     修改
 *   - DELETE /api/admin/questions/:id   删除
 *   - POST /api/admin/questions/:id/restore  恢复删除
 *   - POST /api/admin/bulk              批量删除 / 批量修改 / 批量恢复
 *   - GET  /api/admin/audit             操作日志
 *   - GET  /api/admin/export            导出当前生效题库
 *   - POST /api/admin/import            批量导入
 *
 * 启动：npm start   默认 http://localhost:3000    后台：/admin
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createBankStore, SUBJECTS, GRADES, ValidationError, normalizeQuestion } from './lib/bank-store.js';
import { buildWorkbook, buildTemplate, parseWorkbook } from './lib/xlsx-io.js';
import { hashPassword, verifyPassword, isLegacyPlaintext } from './lib/admin-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const PROFILE_FILE = path.join(DATA_DIR, 'profiles.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin', 'auth.json');
const PORT = Number(process.env.PORT || 3000);
const ROUND_TIME = 15;            // 每题秒数（客户端按 m.time*1000 倒计时）
const REVEAL_DELAY = 1000;        // 双方都作答后，公布答案前的停顿
const NEXT_ROUND_DELAY = 2600;    // 公布答案到下一题的间隔

/* ------------------------------- 题库 ------------------------------- */
const bank = createBankStore(DATA_DIR);
bank.load();

// 生效题库快照：随管理端改动刷新
let QUESTIONS = bank.all;

const gradesOf = q => (q.grades && q.grades.length ? q.grades : [q.grade]);

const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 按难度组织候选池：目标难度优先，其次相邻难度，最后兜底 */
function poolByLevel(grade, subject, level) {
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
function takeBalanced(pool, count) {
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
 * 把一道题整理成下发格式：
 *   - 选项顺序打乱，同时把正确项下标跟着搬过去
 *   - correct 越界的脏题直接跳过，不让它流到客户端变成无解题
 *   - 选项文本重复时也安全（用原索引定位，不靠 indexOf 找文本）
 */
function presentQuestion(q, fallbackKp) {
  const n = (q.options || []).length;
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= n) return null;
  const order = shuffle(q.options.map((_, i) => i));
  return {
    subj: q.subj,
    text: q.text,
    options: order.map(i => q.options[i]),
    correct: order.indexOf(q.correct),
    kp: q.kp || (fallbackKp ? String(fallbackKp) : q.subj + '基础'),
    grade: q.grade,
    level: q.level,
  };
}

/** 取题：返回已洗牌选项的结果，correct 为正确答案下标 */
function drawQuestions({ grade, subject, n = 10, level = 2, kp = '' }) {
  const count = Math.min(Math.max(Number(n) || 10, 1), 50);
  const lv = Math.min(Math.max(Number(level) || 2, 1), 3);
  let pool = poolByLevel(grade, subject, level);

  // 指定知识点时：优先用「本年级 + 本科目 + 该知识点」的题；
  // 不够就放开年级（同科目同学段优先），再不够才用同知识点任意年级题。
  // 这样「练这组」永远练得到对应知识点，而不会被抽成其他知识点。
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

  // 补足题数：绝不重复同一道题（原实现用 i++ % pool.length 循环，会把 1 道题重复 10 次）
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
  // 补足时不能破坏知识点约束：指定了 kp 就只补同知识点的题。
  // 否则「练这组」会混进别的知识点（实测：请求 kp=加法 返回了 8 个不同知识点的题）。
  // 同知识点补完仍不够 → 就少给几题，不拿别的知识点充数。
  if (picked.length < count && !kp) {
    const sameSubj = (subject && subject !== 'mix')
      ? QUESTIONS.filter(q => q.subj === subject)
      : QUESTIONS;
    shuffle(sameSubj).forEach(push);
  }

  return picked.map(q => presentQuestion(q, kp)).filter(Boolean);
}

/* ------------------------------ 档案存储 ---------------------------- */
let profiles = {};
try { profiles = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8')); } catch { profiles = {}; }

let saveTimer = null;
function persistProfiles() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(PROFILE_FILE, JSON.stringify(profiles, null, 1), 'utf8', err => {
      if (err) console.error('档案写入失败', err.message);
    });
  }, 150);
}

/* ------------------------------ 静态服务 ----------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

/** 原样收二进制（Excel 上传用） */
function readRaw(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('文件超过 12MB')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // 目录穿越防护：必须用 path.relative 判断"是否仍在 public 之内"，
  // 不能用 filePath.startsWith(PUBLIC_DIR) —— 那是前缀匹配，
  // E:\...\public_evil 也会 startsWith('E:\...\public')，能读到 public 之外的兄弟目录。
  const filePath = path.resolve(PUBLIC_DIR, '.' + path.sep + rel.replace(/^[/\\]+/, ''));
  const inside = path.relative(PUBLIC_DIR, filePath);
  if (inside.startsWith('..') || path.isAbsolute(inside)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const CODE_RE = /^[A-Za-z0-9]{4,12}$/;

/* ---------------------------- 后台管理鉴权 ---------------------------- */
/** 口令记录：{ algo:'scrypt', salt, hash } 或旧版 { password:'明文' } */
function loadAdminRecord() {
  try {
    const doc = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
    if (doc && (doc.hash || doc.password)) return doc;
  } catch { /* 首次运行还没有配置文件 */ }
  return null;
}
function saveAdminRecord(rec) {
  fs.mkdirSync(path.dirname(ADMIN_FILE), { recursive: true });
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(rec, null, 1), 'utf8');
}

/**
 * 内存中保存口令哈希（不保留明文）。
 * 首次运行：优先读 ADMIN_PASSWORD 环境变量，否则用默认口令并立即落盘为哈希，
 * 这样磁盘上从一开始就没有明文。
 */
function initAdminAuth() {
  const rec = loadAdminRecord();
  if (rec) {
    // 旧版明文文件：升级成哈希，升级后磁盘不再有明文
    if (isLegacyPlaintext(rec)) {
      const upgraded = hashPassword(rec.password);
      saveAdminRecord(upgraded);
      return upgraded;
    }
    return rec;
  }
  const first = hashPassword(process.env.ADMIN_PASSWORD || 'admin123');
  saveAdminRecord(first);
  return first;
}
const ADMIN_REC = initAdminAuth();
const SESSION_SALT = crypto.randomBytes(16).toString('hex');
const tokens = new Map();  // token -> 过期时间
const TOKEN_TTL = 12 * 3600 * 1000;

/* 登录失败限流：同一 IP 连续错 10 次后短暂锁定，挡住在线爆破。
 * 锁定时间刻意不长（60 秒）——这是个局域网家庭应用，
 * 家里几台设备可能共用一个出口 IP，锁 5 分钟会误伤自家人正常登录。 */
const LOGIN_FAIL = new Map();   // ip -> { n, first, until }
const LOGIN_MAX = 10;
const LOGIN_LOCK_MS = 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
function loginBlocked(ip) {
  const rec = LOGIN_FAIL.get(ip);
  if (!rec) return false;
  if (rec.until && rec.until > Date.now()) return true;
  if (rec.until && rec.until <= Date.now()) { LOGIN_FAIL.delete(ip); return false; }
  // 超出统计窗口的旧失败不计入
  if (Date.now() - rec.first > LOGIN_WINDOW_MS) { LOGIN_FAIL.delete(ip); }
  return false;
}
function noteLoginFail(ip) {
  const now = Date.now();
  const rec = LOGIN_FAIL.get(ip) || { n: 0, first: now, until: 0 };
  if (now - rec.first > LOGIN_WINDOW_MS) { rec.n = 0; rec.first = now; }
  rec.n++;
  if (rec.n >= LOGIN_MAX) { rec.until = now + LOGIN_LOCK_MS; rec.n = 0; rec.first = now; }
  LOGIN_FAIL.set(ip, rec);
}
const clientIp = req => {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
};

const issueToken = () => {
  const t = crypto.createHash('sha256').update(SESSION_SALT + Date.now() + crypto.randomBytes(16)).digest('hex').slice(0, 32);
  tokens.set(t, Date.now() + TOKEN_TTL);
  return t;
};
function authOk(req) {
  const t = req.headers['x-admin-token'] || new URL(req.url, 'http://x').searchParams.get('token');
  if (!t) return false;
  const exp = tokens.get(String(t));
  if (!exp) return false;
  if (exp < Date.now()) { tokens.delete(String(t)); return false; }
  return true;
}
function requireAuth(req, res) {
  if (authOk(req)) return true;
  sendJson(res, 401, { error: '未登录或登录已过期' });
  return false;
}
const refreshBank = () => { QUESTIONS = bank.all; };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  if (pathname === '/api/questions') {
    const data = drawQuestions({
      grade: url.searchParams.get('grade') || 1,
      subject: url.searchParams.get('subject') || 'mix',
      n: url.searchParams.get('n') || 10,
      level: url.searchParams.get('level') || 2,
      kp: url.searchParams.get('kp') || '',
    });
    return sendJson(res, 200, data);
  }

  /* 课程标准：前端用它列出「还没练过」的知识点 */
  if (pathname === '/api/curriculum') {
    let curr = null;
    try { curr = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'curriculum.json'), 'utf8')); } catch { curr = null; }
    if (!curr) return sendJson(res, 404, { error: '课程表不存在' });
    const subj = url.searchParams.get('subj');
    const subjects = subj
      ? { [subj]: curr.subjects[subj] || [] }
      : curr.subjects;
    return sendJson(res, 200, { subjects, aliasesBySubject: curr.aliasesBySubject || {} });
  }

  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      questions: QUESTIONS.length,
      profiles: Object.keys(profiles).length,
      rooms: rooms.size,
      uptime: Math.round(process.uptime()),
    });
  }

  /* ============================ 后台管理 API ============================ */
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (loginBlocked(ip)) {
      return sendJson(res, 429, { error: '登录失败次数过多，请 1 分钟后再试' });
    }
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { error: '请求体不是合法 JSON' }); }
    if (!verifyPassword(String(body.password || ''), ADMIN_REC)) {
      noteLoginFail(ip);
      return sendJson(res, 401, { error: '密码不正确' });
    }
    LOGIN_FAIL.delete(ip);
    return sendJson(res, 200, { token: issueToken(), ttl: TOKEN_TTL });
  }

  if (pathname === '/api/admin/password' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { error: '请求体不是合法 JSON' }); }
    const pw = String(body.password || '').trim();
    if (pw.length < 6) return sendJson(res, 400, { error: '新密码至少 6 位' });
    const rec = hashPassword(pw);
    saveAdminRecord(rec);
    ADMIN_REC.algo = rec.algo;      // ADMIN_REC 是 const，改内容而不是换引用
    ADMIN_REC.salt = rec.salt;
    ADMIN_REC.hash = rec.hash;
    ADMIN_REC.updatedAt = rec.updatedAt;
    delete ADMIN_REC.password;
    tokens.clear();                       // 改密后所有会话失效
    return sendJson(res, 200, { token: issueToken() });
  }

  if (pathname === '/api/admin/summary' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    return sendJson(res, 200, { ...bank.stats(), counts: bank.counts, subjects: SUBJECTS, grades: GRADES });
  }

  if (pathname === '/api/admin/questions' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const q = url.searchParams;
    return sendJson(res, 200, bank.query({
      grade: q.get('grade'), subj: q.get('subj'), level: q.get('level'),
      kp: q.get('kp'), keyword: q.get('keyword'), source: q.get('source'),
      status: q.get('status'), page: q.get('page'), size: q.get('size'),
    }));
  }

  if (pathname === '/api/admin/questions' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { error: '请求体不是合法 JSON' }); }
    try {
      const rec = bank.create(body);
      refreshBank();
      return sendJson(res, 201, { ok: true, question: rec });
    } catch (e) {
      return sendJson(res, e.status || 400, { error: e.message, dupId: e.dupId });
    }
  }

  const mQ = pathname.match(/^\/api\/admin\/questions\/([^/]+)(\/restore)?$/);
  if (mQ) {
    if (!requireAuth(req, res)) return;
    const id = decodeURIComponent(mQ[1]);

    if (mQ[2] === '/restore') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
      try {
        const rec = bank.restore(id);
        refreshBank();
        return sendJson(res, 200, { ok: true, question: rec });
      } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
    }

    if (req.method === 'GET') {
      const rec = bank.byId(id);
      if (!rec) return sendJson(res, 404, { error: '题目不存在' });
      return sendJson(res, 200, rec);
    }
    if (req.method === 'PUT') {
      let body;
      try { body = await readBody(req); } catch { return sendJson(res, 400, { error: '请求体不是合法 JSON' }); }
      try {
        const rec = bank.update(id, body);
        refreshBank();
        return sendJson(res, 200, { ok: true, question: rec });
      } catch (e) { return sendJson(res, e.status || 400, { error: e.message, dupId: e.dupId }); }
    }
    if (req.method === 'DELETE') {
      try {
        const rec = bank.remove(id);
        refreshBank();
        return sendJson(res, 200, { ok: true, removed: rec });
      } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
    }
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  if (pathname === '/api/admin/bulk' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { error: '请求体不是合法 JSON' }); }
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (!ids.length) return sendJson(res, 400, { error: '没有选中题目' });
    if (ids.length > 500) return sendJson(res, 400, { error: '单次最多处理 500 道' });
    const action = String(body.action || '');
    if (!['delete', 'restore', 'update'].includes(action)) return sendJson(res, 400, { error: '未知操作' });
    const result = bank.bulk(action, ids, body.patch);
    refreshBank();
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/admin/audit' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    return sendJson(res, 200, bank.auditLog(Number(url.searchParams.get('limit')) || 100));
  }

  if (pathname === '/api/admin/export' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const rows = bank.exportAll();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="questions-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    });
    return res.end(JSON.stringify(rows, null, 1));
  }

  if (pathname === '/api/admin/export.xlsx' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const q = url.searchParams;
    // 支持「按当前筛选条件导出」：只给某个年级/科目做表格时不必导全量
    let rows = bank.exportAll();
    if (q.get('scoped') === '1') {
      const kw = (q.get('keyword') || '').replace(/\s+/g, '').toLowerCase();
      const num = k => (q.get(k) ? Number(q.get(k)) : null);
      rows = rows.filter(r => {
        const g = num('grade'), lv = num('level');
        const subj = q.get('subj'), kp = q.get('kp');
        if (g && !(r.grades || [r.grade]).includes(g)) return false;
        if (subj && subj !== 'all' && r.subj !== subj) return false;
        if (lv && Number(r.level) !== lv) return false;
        if (kp && kp !== 'all' && r.kp !== kp) return false;
        if (kw) {
          const hay = (r.text + r.kp + (r.options || []).join('')).replace(/\s+/g, '').toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        return true;
      });
    }
    const buf = buildWorkbook(rows);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="questions-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    return res.end(buf);
  }

  if (pathname === '/api/admin/template.xlsx' && req.method === 'GET') {
    if (!requireAuth(req, res)) return;
    const buf = buildTemplate();
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="questions-template.xlsx"',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    return res.end(buf);
  }

  if (pathname === '/api/admin/import.xlsx' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;

    let buf;
    try { buf = await readRaw(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
    if (!buf.length) return sendJson(res, 400, { error: '没有收到文件内容' });

    let parsed;
    try { parsed = parseWorkbook(buf); }
    catch (e) { return sendJson(res, 400, { error: '表格解析失败：' + e.message }); }

    if (parsed.rows.length > 2000) {
      return sendJson(res, 400, { error: `表里有 ${parsed.rows.length} 行，单次最多 2000 道` });
    }

    const dry = url.searchParams.get('dry') === '1';
    const mode = url.searchParams.get('mode') === 'upsert' ? 'upsert' : 'create';

    /* 第一步：先算出每行要干什么，不落库 */
    const plan = [];
    const seen = new Set();          // 同一份表格内部的重复
    for (const r of parsed.rows) {
      if (r.error) { plan.push({ row: r.row, action: 'error', error: r.error, text: '' }); continue; }

      const q0 = r.question;
      let target = null;
      if (mode === 'upsert' && r.id) {
        const rec = bank.byId(r.id);
        if (rec) target = rec;
      }

      let norm;
      try { norm = normalizeQuestion(q0, target || null); }
      catch (e) { plan.push({ row: r.row, action: 'error', error: e.message, text: String(q0.text || '').slice(0, 30) }); continue; }

      const sig = norm.subj + '|' + norm.text.replace(/\s+/g, '').toLowerCase();
      if (seen.has(sig)) {
        plan.push({ row: r.row, action: 'skip', error: '表格里前面已有同一道题', text: norm.text.slice(0, 30) });
        continue;
      }
      seen.add(sig);

      if (!target) {
        const dup = bank.probe(norm);
        if (dup) {
          if (mode === 'upsert') target = dup;
          else {
            plan.push({ row: r.row, action: 'skip', error: '题库里已有这道题', text: norm.text.slice(0, 30) });
            continue;
          }
        }
      }

      plan.push({
        row: r.row, action: target ? 'update' : 'create',
        id: target ? target.id : null, question: norm, text: norm.text.slice(0, 30),
      });
    }

    const tally = plan.reduce((a, p) => (a[p.action] = (a[p.action] || 0) + 1, a), {});
    const brief = {
      sheet: parsed.sheet, mode,
      total: parsed.rows.length,
      create: tally.create || 0,
      update: tally.update || 0,
      skip: tally.skip || 0,
      error: tally.error || 0,
      unknownColumns: parsed.unknown.slice(0, 10),
      preview: plan.filter(p => p.action !== 'error').slice(0, 8).map(p => ({
        row: p.row, action: p.action, text: p.text, id: p.id,
      })),
      failed: plan.filter(p => p.action === 'error' || p.action === 'skip')
        .slice(0, 200).map(p => ({ row: p.row, action: p.action, error: p.error, text: p.text })),
    };

    if (dry) return sendJson(res, 200, { dry: true, ...brief });

    /* 第二步：真正写库（整批放进事务：只重建一次索引、只落盘一次） */
    let created = 0, updated = 0, skipped = 0, failed = 0;
    const fails = [];
    bank.transaction(() => {
      for (const p of plan) {
        if (p.action === 'error' || p.action === 'skip') {
          if (p.action === 'error') failed++; else skipped++;
          continue;
        }
        try {
          if (p.action === 'update') { bank.update(p.id, p.question); updated++; }
          else { bank.create(p.question); created++; }
        } catch (e) {
          if (e.status === 409) skipped++;
          else { failed++; if (fails.length < 100) fails.push({ row: p.row, error: e.message, text: p.text }); }
        }
      }
    });
    refreshBank();
    return sendJson(res, 200, {
      ok: created + updated,
      created, updated, skipped, failed,
      failedRows: fails,
    });
  }

  if (pathname === '/api/admin/import' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = await readBody(req, 8 * 1024 * 1024); } catch { return sendJson(res, 400, { error: '请求体不是合法 JSON' }); }
    const rows = Array.isArray(body) ? body : (Array.isArray(body.questions) ? body.questions : null);
    if (!rows) return sendJson(res, 400, { error: '需要题目数组' });
    if (rows.length > 2000) return sendJson(res, 400, { error: '单次最多导入 2000 道' });
    const okIds = [], failed = [];
    bank.transaction(() => {
      for (const row of rows) {
        try { okIds.push(bank.create(row).id); }
        catch (e) { failed.push({ text: String(row && row.text || '').slice(0, 40), error: e.message }); }
      }
    });
    refreshBank();
    return sendJson(res, 200, { ok: okIds.length, failed: failed.slice(0, 50), failedCount: failed.length });
  }

  if (pathname === '/api/admin/reset' && req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body;
    try { body = await readBody(req); } catch { body = {}; }
    if (body.confirm !== 'RESET') return sendJson(res, 400, { error: '需要 confirm: "RESET" 才执行' });
    const r = bank.resetOverlay();
    refreshBank();
    return sendJson(res, 200, { ok: true, ...r });
  }

  /* 学习档案同步：同步码 ↔ 档案 JSON */
  if (pathname.startsWith('/api/profile/')) {
    const code = decodeURIComponent(pathname.slice('/api/profile/'.length)).trim();
    if (!CODE_RE.test(code)) return sendJson(res, 400, { error: '同步码格式不对（4-12 位字母或数字）' });

    if (req.method === 'GET') {
      const rec = profiles[code];
      if (!rec) return sendJson(res, 404, { error: '这个同步码还没有档案' });
      return sendJson(res, 200, rec);
    }
    if (req.method === 'PUT') {
      let body;
      try { body = await readBody(req); }
      catch (e) { return sendJson(res, 400, { error: '请求体不是合法 JSON' }); }
      const profile = body && body.profile;
      if (!profile || typeof profile !== 'object') return sendJson(res, 400, { error: '缺少 profile' });
      const updatedAt = Number(body.updatedAt) || Date.now();
      const prev = profiles[code];
      // 旧数据不覆盖新数据
      if (prev && Number(prev.updatedAt) > updatedAt) {
        return sendJson(res, 200, { conflict: true, ...prev });
      }
      profiles[code] = { code, profile, updatedAt, savedAt: Date.now() };
      persistProfiles();
      return sendJson(res, 200, { ok: true, code, updatedAt });
    }
    return sendJson(res, 405, { error: 'method not allowed' });
  }

  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });

  // 后台管理界面：/admin（允许省略 .html）
  if (pathname === '/admin' || pathname === '/admin/') {
    req.url = '/admin.html';
    return serveStatic(req, res, '/admin.html');
  }

  serveStatic(req, res, pathname);
});

/* ------------------------------ 房间协议 ----------------------------- */
const wss = new WebSocketServer({ server });
const rooms = new Map();

const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const clearTimers = room => {
  for (const k of ['unlockTimer', 'roundTimer', 'revealTimer', 'nextTimer']) {
    if (room[k]) { clearTimeout(room[k]); room[k] = null; }
  }
};

function newCode() {
  for (let i = 0; i < 200; i++) {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    if (!rooms.has(c)) return c;
  }
  return String(Date.now()).slice(-4);
}

function createRoom(ws, msg) {
  const code = newCode();
  const room = {
    code,
    host: ws,
    guest: null,
    grade: msg.grade || 1,
    subject: msg.subject || 'mix',
    rounds: Math.min(Math.max(Number(msg.rounds) || 10, 3), 30),
    parentDelay: Math.min(Math.max(Number(msg.parentDelay) || 0, 0), 8000),
    level: Math.min(Math.max(Number(msg.level) || 2, 1), 3),
    questions: [],
    idx: 0,
    scores: { child: 0, parent: 0 },
    answers: { child: null, parent: null },
    detail: [],              // 逐题明细，回合结束时随 over 下发用于复盘
    state: 'waiting',
    roundStart: 0,
    current: null,
    createdAt: Date.now(),
    overAt: 0,
  };
  rooms.set(code, room);
  ws.roomCode = code;
  ws.role = 'parent';
  send(ws, { type: 'created', code });
  return room;
}

function buildQuestions(room) {
  return drawQuestions({ grade: room.grade, subject: room.subject, n: room.rounds, level: room.level });
}

function startMatch(room) {
  room.scores = { child: 0, parent: 0 };
  room.idx = 0;
  room.detail = [];
  room.questions = buildQuestions(room);
  room.state = 'playing';
  nextRound(room);
}

function nextRound(room) {
  if (!room.guest || room.guest.readyState !== 1) { room.state = 'waiting'; return; }
  if (room.idx >= room.questions.length) return finish(room);

  const q = room.questions[room.idx];
  room.current = q;
  room.answers = { child: null, parent: null };
  room.roundStart = Date.now();
  room.state = 'playing';

  const payload = {
    type: 'round',
    no: room.idx + 1,
    total: room.questions.length,
    subj: q.subj,
    kp: q.kp,
    text: q.text,
    options: q.options.map(t => ({ t })),
    time: ROUND_TIME,
    scores: { ...room.scores },
    parentDelay: room.parentDelay,
  };
  send(room.host, payload);
  send(room.guest, { ...payload });

  if (room.parentDelay > 0) {
    room.unlockTimer = setTimeout(() => send(room.host, { type: 'unlock' }), room.parentDelay);
  }
  room.roundTimer = setTimeout(() => reveal(room, null), ROUND_TIME * 1000);
}

function handleAnswer(room, ws, msg) {
  if (!room.current || room.state !== 'playing') return;
  if (typeof msg.text !== 'string') return;      // 非法载荷直接丢弃，避免 String(null) 撞答案
  const role = ws.role;
  if (role === 'parent' && Date.now() - room.roundStart < room.parentDelay) {
    send(ws, { type: 'locked' });
    return;
  }
  if (room.answers[role]) return;
  // 归一化首尾空白后再比对，防止客户端裁剪文本造成「答对却判错」
  const ok = msg.text.trim() === String(room.current.options[room.current.correct]).trim();
  room.answers[role] = { ok, text: msg.text, ms: Date.now() - room.roundStart };
  if (ok) room.scores[role] += 1;

  const result = { type: 'result', who: role, ok, score: room.scores[role] };
  send(room.host, result);
  send(room.guest, result);

  if (room.answers.child && room.answers.parent) {
    clearTimeout(room.roundTimer);
    room.revealTimer = setTimeout(() => reveal(room, role), REVEAL_DELAY);
  }
}

function reveal(room, winner) {
  if (!room.current) return;
  clearTimeout(room.roundTimer);
  room.state = 'revealing';
  const q = room.current;
  const correctText = q.options[q.correct];

  room.detail.push({
    no: room.idx + 1,
    subj: q.subj,
    kp: q.kp,
    text: q.text,
    correct: correctText,
    child: room.answers.child || { ok: false, text: null, ms: null },
    parent: room.answers.parent || { ok: false, text: null, ms: null },
  });

  const payload = { type: 'reveal', correct: correctText, winner: winner || '' };
  send(room.host, payload);
  send(room.guest, payload);

  room.idx += 1;
  room.nextTimer = setTimeout(() => nextRound(room), NEXT_ROUND_DELAY);
}

function finish(room) {
  clearTimers(room);
  room.state = 'over';
  room.overAt = Date.now();
  const { child, parent } = room.scores;
  const result = child === parent ? 'draw' : (child > parent ? 'child' : 'parent');
  const payload = { type: 'over', scores: { child, parent }, result, detail: room.detail };
  send(room.host, payload);
  send(room.guest, payload);
}

function joinRoom(ws, msg) {
  const code = String(msg.code || '').trim();
  const room = rooms.get(code);
  if (!room) return send(ws, { type: 'error', msg: '房间不存在，请检查房间码' });
  if (room.guest && room.guest.readyState === 1) return send(ws, { type: 'error', msg: '房间已满，请换一局' });

  room.guest = ws;
  ws.roomCode = code;
  ws.role = 'child';
  send(ws, { type: 'joined' });
  send(room.host, { type: 'ready' });
  send(ws, { type: 'ready' });
  setTimeout(() => { if (room.guest === ws) startMatch(room); }, 700);
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'create') return void createRoom(ws, msg);
    if (msg.type === 'join') return void joinRoom(ws, msg);

    const room = rooms.get(ws.roomCode);
    if (!room) return send(ws, { type: 'error', msg: '房间已失效，请重新创建' });

    if (msg.type === 'answer') return void handleAnswer(room, ws, msg);
    if (msg.type === 'rematch') {
      send(room.host, { type: 'rematch' });
      send(room.guest, { type: 'rematch' });
      clearTimers(room);
      room.idx = 0;
      room.scores = { child: 0, parent: 0 };
      room.detail = [];
      room.questions = buildQuestions(room);
      room.nextTimer = setTimeout(() => nextRound(room), 800);
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    if (room.host === ws) {
      send(room.guest, { type: 'info', msg: '房主已离开，房间关闭' });
      clearTimers(room);
      rooms.delete(room.code);
    } else {
      room.guest = null;
      room.state = 'waiting';
      clearTimers(room);
    }
  });
});

/* 心跳保活：清掉僵死的连接，避免房间被占用 */
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/* 僵尸房间回收：连着页面不动不会释放房间，长期运行会把内存吃掉 */
const ROOM_IDLE_MS = Number(process.env.ROOM_IDLE_MS) || 30 * 60 * 1000;   // 未开局闲置
const ROOM_OVER_MS = Number(process.env.ROOM_OVER_MS) || 10 * 60 * 1000;   // 已结束停留
const ROOM_SWEEP_MS = Number(process.env.ROOM_SWEEP_MS) || 60 * 1000;      // 扫描间隔
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = room.state === 'over'
      ? now - (room.overAt || room.createdAt || now)
      : now - (room.createdAt || now);
    const limit = room.state === 'over' ? ROOM_OVER_MS : ROOM_IDLE_MS;
    if (idle < limit) continue;
    clearTimers(room);
    try { room.host && room.host.terminate(); } catch { }
    try { room.guest && room.guest.terminate(); } catch { }
    rooms.delete(code);
  }
}, ROOM_SWEEP_MS).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ 知识擂台已启动：http://localhost:${PORT}`);
  console.log(`   题库 ${QUESTIONS.length} 道 · 本地档案 ${Object.keys(profiles).length} 份 · 端口 ${PORT}`);
});
