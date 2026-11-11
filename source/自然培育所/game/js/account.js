/* ============================================================
   Nature Lab · 本地账号与档案（v2.0）
   ------------------------------------------------------------
   为什么是"本地档案"而不是"注册登录"：
   本作是纯前端、零网络请求的离线游戏，没有服务器可托管账号。
   商业上正确的等价物是「本机多用户档案」：
     - 一个浏览器 / 一台设备上可以有多个玩家档案
     - 每个档案拥有独立的存档槽、偏好设置、教学进度、成就
     - 可选 PIN 隐私锁，防止同机误入
     - 档案可导出/导入，用于换设备或备份
   数据边界：全部写入 localStorage，不上传、不统计、不追踪。
   PIN 只做同机访问控制，不是加密，不能防住能开 DevTools 的人。

   存储布局：
     全局键   naturelab.accounts.v1     档案注册表
              naturelab.account.current  当前档案 id
     档案键   naturelab.u<id>.<原名>     每个档案一个命名空间
   旧版单档案键（naturelab.save.v1…）在首次升级时迁入第一个档案。
   ============================================================ */

const NL_APP_VERSION = '2.0';
const NL_ACC_KEY = 'naturelab.accounts.v1';
const NL_CUR_KEY = 'naturelab.account.current';
const NL_GLOBAL_KEYS = new Set([NL_ACC_KEY, NL_CUR_KEY]);
const NL_AVATARS = ['🌱', '🌿', '🌸', '🍅', '🦋', '🐝', '🐟', '🐢', '🍄', '🐈'];
const NL_NAME_MAX = 16;
const NL_PIN_MIN = 4;
const NL_PIN_MAX = 12;

/* ---------------- 基础工具 ---------------- */
function nlEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function nlParse(raw, fb) {
  try { const v = JSON.parse(raw); return v == null ? fb : v; } catch (e) { return fb; }
}
function nlUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function nlHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function nlSalt() {
  try {
    const a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return nlHex(a);
  } catch (e) {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
// 纯 JS 兜底哈希：无 WebCrypto（部分 file:// / 老旧浏览器）时使用。
// 20000 轮 FNV-1a，目的只是让 PIN 不以明文落盘，不宣称密码学强度。
function nlFnv(pin, salt) {
  const s = salt + ':' + pin + ':' + salt;
  let h = 0x811c9dc5;
  for (let r = 0; r < 20000; r++) {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= r;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
async function nlPinHash(pin, salt, algo) {
  if (algo === 'fnv') return 'fnv:' + nlFnv(pin, salt);
  try {
    const data = new TextEncoder().encode('naturelab|' + salt + '|' + pin + '|' + salt);
    const buf = await (window.crypto || crypto).subtle.digest('SHA-256', data);
    return 'sha256:' + nlHex(buf);
  } catch (e) {
    return 'fnv:' + nlFnv(pin, salt);
  }
}

/* ---------------- 档案数据层 ---------------- */
function nlNormalizeAccount(a) {
  const pin = a && a.pin && a.pin.hash ? {
    algo: a.pin.algo === 'fnv' ? 'fnv' : 'sha256',
    salt: String(a.pin.salt || ''),
    hash: String(a.pin.hash || ''),
    requireOnLaunch: a.pin.requireOnLaunch !== false
  } : null;
  return {
    id: String(a && a.id ? a.id : nlUid()),
    name: String((a && a.name) || '培育员').slice(0, NL_NAME_MAX),
    avatar: NL_AVATARS.indexOf(a && a.avatar) >= 0 ? a.avatar : '🌱',
    createdAt: (a && a.createdAt) || Date.now(),
    lastPlayedAt: (a && a.lastPlayedAt) || (a && a.createdAt) || Date.now(),
    pin
  };
}

let NL_ACCOUNTS = (() => {
  try {
    const raw = nlParse(localStorage.getItem(NL_ACC_KEY), []);
    return Array.isArray(raw) ? raw.filter(x => x && x.id).map(nlNormalizeAccount) : [];
  } catch (e) { return []; }
})();
let NL_ACTIVE_ID = (() => {
  try { return localStorage.getItem(NL_CUR_KEY) || ''; } catch (e) { return ''; }
})();
let NL_NS = 'naturelab.';
let NL_FIRST_RUN = false;
let NL_LOCKED = false;
let NL_COOL = 0;
let NL_FAILS = 0;

function nlFind(id) {
  for (let i = 0; i < NL_ACCOUNTS.length; i++) if (NL_ACCOUNTS[i].id === id) return NL_ACCOUNTS[i];
  return null;
}
function nlActive() { return nlFind(NL_ACTIVE_ID) || NL_ACCOUNTS[0] || null; }
function nlPersistAccounts() {
  try {
    localStorage.setItem(NL_ACC_KEY, JSON.stringify(NL_ACCOUNTS));
    if (NL_ACTIVE_ID) localStorage.setItem(NL_CUR_KEY, NL_ACTIVE_ID);
  } catch (e) { /* 存储写满时保持内存态，UI 会给出提示 */ }
}
function nlNs(id) { return 'naturelab.u' + id + '.'; }
function nlPrefixOf(acc) { return acc ? nlNs(acc.id) : 'naturelab.'; }

// 所有以 prefix 开头的 localStorage 键（复制一份，避免边遍历边改动）
function nlKeysWithPrefix(prefix) {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) out.push(k);
    }
  } catch (e) { }
  return out;
}

// 旧版键 → 第一个档案。只搬一次；失败时保留原键，避免丢档。
function nlMigrateLegacy(id) {
  const prefix = nlNs(id);
  const legacy = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf('naturelab.') !== 0) continue;
      if (NL_GLOBAL_KEYS.has(k) || k.indexOf('naturelab.u') === 0) continue;
      legacy.push(k);
    }
  } catch (e) { return; }
  legacy.forEach(k => {
    try {
      localStorage.setItem(prefix + k.slice('naturelab.'.length), localStorage.getItem(k));
      localStorage.removeItem(k);
    } catch (e) { /* 空间不足：保留旧键 */ }
  });
}

function nlCreateAccount(name, avatar, opts) {
  const acc = nlNormalizeAccount({
    id: nlUid(),
    name: String(name || '培育员').trim().slice(0, NL_NAME_MAX) || '培育员',
    avatar: avatar || '🌱',
    createdAt: Date.now(),
    lastPlayedAt: Date.now()
  });
  NL_ACCOUNTS.push(acc);
  if (!opts || opts.persist !== false) nlPersistAccounts();
  return acc;
}
function nlSetActive(id) {
  if (!nlFind(id)) return false;
  NL_ACTIVE_ID = id;
  try { localStorage.setItem(NL_CUR_KEY, id); } catch (e) { }
  const acc = nlFind(id);
  if (acc) { acc.lastPlayedAt = Date.now(); nlPersistAccounts(); }
  return true;
}
function nlDeleteAccount(id) {
  const acc = nlFind(id);
  if (!acc) return false;
  nlKeysWithPrefix(nlNs(id)).forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
  NL_ACCOUNTS = NL_ACCOUNTS.filter(a => a.id !== id);
  if (NL_ACTIVE_ID === id) NL_ACTIVE_ID = NL_ACCOUNTS.length ? NL_ACCOUNTS[0].id : '';
  nlPersistAccounts();
  return true;
}
function nlRename(id, name) {
  const acc = nlFind(id); if (!acc) return false;
  const n = String(name || '').trim().slice(0, NL_NAME_MAX);
  if (!n) return false;
  acc.name = n;
  nlPersistAccounts();
  return true;
}
function nlSetAvatar(id, avatar) {
  const acc = nlFind(id); if (!acc || NL_AVATARS.indexOf(avatar) < 0) return false;
  acc.avatar = avatar;
  nlPersistAccounts();
  return true;
}
async function nlSetPin(id, pin) {
  const acc = nlFind(id); if (!acc) return false;
  const salt = nlSalt();
  const algo = (window.crypto && window.crypto.subtle) ? 'sha256' : 'fnv';
  const hash = await nlPinHash(pin, salt, algo);
  acc.pin = { algo: algo, salt: salt, hash: hash, requireOnLaunch: true };
  nlPersistAccounts();
  return true;
}
function nlClearPin(id) {
  const acc = nlFind(id); if (!acc) return false;
  acc.pin = null; nlPersistAccounts(); return true;
}
async function nlVerifyPin(acc, pin) {
  if (!acc || !acc.pin) return true;
  const h = await nlPinHash(pin, acc.pin.salt, acc.pin.algo);
  return h === acc.pin.hash;
}

/* ---------------- 启动引导 ---------------- */
function nlBootstrap() {
  if (!NL_ACCOUNTS.length) {
    const acc = nlCreateAccount('培育员', '🌱', { persist: false });
    nlMigrateLegacy(acc.id);
    NL_ACTIVE_ID = acc.id;
    NL_FIRST_RUN = true;
    nlPersistAccounts();
  } else {
    if (!nlFind(NL_ACTIVE_ID)) NL_ACTIVE_ID = NL_ACCOUNTS[0].id;
    nlPersistAccounts();
  }
  NL_NS = nlNs(NL_ACTIVE_ID);
}
nlBootstrap();

// 供其他模块使用的键名解析：所有模块的 localStorage 键都必须过这一层
function storeKey(name) { return NL_NS + name; }

/* ---------------- 对外 API ---------------- */
const NL = {
  version: NL_APP_VERSION,
  avatars: NL_AVATARS,
  accounts: () => NL_ACCOUNTS.slice(),
  active: nlActive,
  activeId: () => NL_ACTIVE_ID,
  needsLock: () => !!(nlActive() && nlActive().pin && nlActive().pin.requireOnLaunch !== false),
  prefixOf: nlPrefixOf,
  find: nlFind,
  create: nlCreateAccount,
  rename: nlRename,
  setAvatar: nlSetAvatar,
  setPin: nlSetPin,
  clearPin: nlClearPin,
  verifyPin: nlVerifyPin,
  deleteAccount: nlDeleteAccount,
  switchTo: nlSetActive,
  locked: () => NL_LOCKED,
  lockNow: function () { nlLock(false); },
  openAccount: function () { nlRenderAccount(true); }
};
try { window.NL = NL; } catch (e) { }

/* ============================================================
   UI：档案管理
   ============================================================ */
let _accDraftAvatar = null;
let _pinMode = null;          // null | 'set' | 'change' | 'remove'
let _accBound = false;
let _accMsg = '';

function nlDaysAgo(ts) {
  const d = Math.max(0, Date.now() - (ts || Date.now()));
  const day = Math.floor(d / 86400000);
  if (day <= 0) return '今天';
  if (day === 1) return '昨天';
  if (day < 30) return day + ' 天前';
  return Math.floor(day / 30) + ' 个月前';
}
function nlAccSummary() {
  const out = [];
  try {
    if (typeof S !== 'undefined' && S) {
      out.push('第 ' + (S.day || 1) + ' 天');
      out.push('Lv.' + (S.level || 1));
      out.push((S.records || []).length + ' 份档案');
    }
  } catch (e) { }
  return out;
}

function nlRenderAccount(open) {
  const body = document.getElementById('accBody');
  if (!body) return;
  const acc = nlActive();
  if (!acc) return;
  if (_accDraftAvatar === null) _accDraftAvatar = acc.avatar;
  const hasPin = !!acc.pin;
  const stats = nlAccSummary();
  const metas = (typeof slotSummaries === 'function') ? slotSummaries() : {};

  const avOpts = NL_AVATARS.map(a =>
    `<button class="accAvOpt ${a === _accDraftAvatar ? 'on' : ''}" data-avatar="${a}" aria-label="选择头像 ${a}" aria-pressed="${a === _accDraftAvatar}">${a}</button>`
  ).join('');

  const pinBlock = hasPin ? `
    <div class="accRow">
      <div class="accInfo">
        <b>已开启 PIN 隐私锁</b>
        <span>启动时要求输入 · 4–12 位数字 · 只防同机误入，不是加密</span>
      </div>
      <div class="accOps">
        <button class="btn small ghost" data-a="pin-change">修改</button>
        <button class="btn small ghost" data-a="pin-remove">移除</button>
        <button class="btn small ghost" data-a="lock-now">立即锁定</button>
      </div>
    </div>` : `
    <div class="accRow">
      <div class="accInfo">
        <b>未设置 PIN</b>
        <span>同一台设备上的其他使用者可以直接打开这个档案</span>
      </div>
      <div class="accOps"><button class="btn small" data-a="pin-set">设置 PIN</button></div>
    </div>`;

  let pinForm = '';
  if (_pinMode) {
    const needOld = _pinMode !== 'set';
    const needNew = _pinMode !== 'remove';
    pinForm = `<div class="pinForm">
      ${needOld ? '<input class="accInput" id="accPinOld" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" placeholder="当前 PIN">' : ''}
      ${needNew ? '<input class="accInput" id="accPinNew" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="新 PIN（4–12 位数字）">' : ''}
      ${needNew ? '<input class="accInput" id="accPinNew2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="12" placeholder="再输一次">' : ''}
      <button class="btn small primary" data-a="pin-submit">${_pinMode === 'remove' ? '确认移除' : '保存'}</button>
      <button class="btn small ghost" data-a="pin-cancel">取消</button>
    </div>
    <div class="accErr" id="accPinErr"></div>`;
  }

  const list = NL_ACCOUNTS.map(a => {
    const cur = a.id === acc.id;
    return `<div class="accRow ${cur ? 'cur' : ''}">
      <span class="accAv">${a.avatar}</span>
      <div class="accInfo">
        <b>${nlEsc(a.name)}${a.pin ? ' <i class="accLock" title="已设置 PIN">🔒</i>' : ''}${cur ? ' <i class="accCur">当前</i>' : ''}</b>
        <span>${cur ? '正在游玩' : '上次游玩 ' + nlDaysAgo(a.lastPlayedAt)} · 创建于 ${new Date(a.createdAt).toLocaleDateString('zh-CN')}</span>
      </div>
      <div class="accOps">
        ${cur ? '' : `<button class="btn small" data-a="switch" data-id="${a.id}">切换</button>`}
        ${cur ? '' : `<button class="btn small danger" data-a="del" data-id="${a.id}">删除</button>`}
      </div>
    </div>`;
  }).join('');

  const slotLine = [1, 2, 3].map(i => {
    const m = metas[i];
    return (m && !m.empty) ? `存档 ${i}：第 ${m.day} 天` : `存档 ${i}：空`;
  }).join(' · ');

  body.innerHTML = `
    <div class="accTop">
      <div class="accAvatarBig">${_accDraftAvatar}</div>
      <div class="accTopMain">
        <label class="accLabel">档案名称</label>
        <input class="accInput accNameInput" id="accNameInput" maxlength="${NL_NAME_MAX}" value="${nlEsc(acc.name)}" aria-label="档案名称">
        <div class="accLabel" style="margin-top:10px">头像</div>
        <div class="accAvGrid">${avOpts}</div>
        <div class="accStat">${stats.length ? stats.join(' · ') + ' · ' : ''}${slotLine}</div>
        <div class="accTopOps">
          <button class="btn small primary" data-a="save-profile">保存资料</button>
        </div>
      </div>
    </div>

    <div class="accSec">登录与安全</div>
    ${pinBlock}
    ${pinForm}

    <div class="accSec">本机档案 <em>${NL_ACCOUNTS.length} 个</em></div>
    <div class="accList">${list}</div>
    <div class="accNew">
      <input class="accInput" id="accNewName" maxlength="${NL_NAME_MAX}" placeholder="新档案名称" aria-label="新档案名称">
      <button class="btn small" data-a="create">新建档案</button>
    </div>

    <div class="accSec">数据与隐私</div>
    <div class="accRow">
      <div class="accInfo">
        <b>全部数据保存在这台设备的浏览器里</b>
        <span>无账号服务器、无网络请求、无统计埋点。清理浏览器站点数据会连同存档一起删除。</span>
      </div>
    </div>
    <div class="accDataOps">
      <button class="btn small ghost" data-a="export-one">导出当前档案</button>
      <button class="btn small ghost" data-a="export-all">导出全部档案</button>
      <button class="btn small ghost" data-a="import">导入档案包</button>
      <button class="btn small danger" data-a="wipe">清除本机全部数据</button>
      <input type="file" id="accImportFile" accept=".json,application/json" hidden>
    </div>
    <div class="accNote">
      隐私说明：本作不收集、不上传任何个人信息。<b>PIN 只是同机访问锁</b>，数据在浏览器中并非加密存储；
      共用电脑请使用独立的操作系统账户。换设备前请先「导出当前档案」。
    </div>
    <div class="accErr" id="accMsg">${_accMsg ? nlEsc(_accMsg) : ''}</div>`;

  if (!_accBound) {
    _accBound = true;
    const modal = document.getElementById('accountModal');
    if (modal) {
      modal.addEventListener('click', e => {
        const av = e.target.closest('[data-avatar]');
        if (av) { _accDraftAvatar = av.getAttribute('data-avatar'); nlRenderAccount(); return; }
        const btn = e.target.closest('[data-a]');
        if (!btn) return;
        nlAccountAction(btn.getAttribute('data-a'), btn);
      });
      const close = modal.querySelector('.xBtn');
      if (close) close.addEventListener('click', () => { modal.classList.remove('show'); });
      modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
    }
  }
  const file = document.getElementById('accImportFile');
  if (file) file.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) nlImportFile(f);
    e.target.value = '';
  });
  if (open) {
    const modal = document.getElementById('accountModal');
    if (modal) {
      modal.classList.add('show');
      const inp = document.getElementById('accNameInput');
      if (inp) { try { inp.focus({ preventScroll: true }); } catch (er) { } }
    }
  }
}

function nlAccMsg(text, bad) {
  _accMsg = text || '';
  const el = document.getElementById('accMsg');
  if (el) { el.textContent = text || ''; el.style.color = bad ? 'var(--red)' : ''; }
}

async function nlAccountAction(action, btn) {
  const acc = nlActive();
  if (!acc) return;
  const pinErr = t => { const el = document.getElementById('accPinErr'); if (el) el.textContent = t; };

  if (action === 'save-profile') {
    const inp = document.getElementById('accNameInput');
    const name = (inp && inp.value || '').trim();
    if (!name) return nlAccMsg('档案名称不能为空', true);
    nlRename(acc.id, name);
    nlSetAvatar(acc.id, _accDraftAvatar);
    nlAccMsg('资料已保存');
    nlApplyIdentity();
    nlRenderAccount();

  } else if (action === 'pin-set') {
    _pinMode = 'set'; nlRenderAccount();
  } else if (action === 'pin-change') {
    _pinMode = 'change'; nlRenderAccount();
  } else if (action === 'pin-remove') {
    _pinMode = 'remove'; nlRenderAccount();
  } else if (action === 'pin-cancel') {
    _pinMode = null; nlRenderAccount();
  } else if (action === 'pin-submit') {
    const mode = _pinMode;
    const oldEl = document.getElementById('accPinOld');
    const newEl = document.getElementById('accPinNew');
    const new2El = document.getElementById('accPinNew2');
    if (acc.pin && oldEl) {
      const ok = await nlVerifyPin(acc, oldEl.value);
      if (!ok) return pinErr('当前 PIN 不正确');
    }
    if (mode !== 'remove') {
      const pin = newEl ? newEl.value : '';
      if (!/^\d{4,12}$/.test(pin)) return pinErr('PIN 必须是 4–12 位数字');
      if (!new2El || new2El.value !== pin) return pinErr('两次输入的 PIN 不一致');
      await nlSetPin(acc.id, pin);
    } else {
      nlClearPin(acc.id);
    }
    _pinMode = null;
    _accMsg = mode === 'remove' ? 'PIN 已移除' : 'PIN 已更新';
    nlApplyIdentity();
    nlRenderAccount();

  } else if (action === 'lock-now') {
    document.getElementById('accountModal').classList.remove('show');
    nlLock(false);

  } else if (action === 'switch') {
    const id = btn.getAttribute('data-id');
    if (typeof saveGame === 'function' && typeof S !== 'undefined') { try { saveGame(S); } catch (e) { } }
    if (nlSetActive(id)) location.reload();

  } else if (action === 'del') {
    const id = btn.getAttribute('data-id');
    const target = nlFind(id);
    if (!target) return;
    if (!confirm(`删除档案「${target.name}」？\n该档案的所有存档、成就与设置都会一并清除，不可恢复。`)) return;
    nlDeleteAccount(id);
    nlAccMsg('档案已删除');
    nlRenderAccount();

  } else if (action === 'create') {
    const inp = document.getElementById('accNewName');
    const name = (inp && inp.value || '').trim() || ('培育员 ' + (NL_ACCOUNTS.length + 1));
    if (typeof saveGame === 'function' && typeof S !== 'undefined') { try { saveGame(S); } catch (e) { } }
    const made = nlCreateAccount(name, _accDraftAvatar || '🌱');
    nlSetActive(made.id);
    location.reload();

  } else if (action === 'export-one') {
    nlDownload(nlExportOne(), 'naturelab-profile-' + nlSafeFile(acc.name) + '.json');
    nlAccMsg('当前档案已导出');

  } else if (action === 'export-all') {
    nlDownload(nlExportAll(), 'naturelab-all-profiles-' + new Date().toISOString().slice(0, 10) + '.json');
    nlAccMsg('全部档案已导出');

  } else if (action === 'import') {
    const f = document.getElementById('accImportFile');
    if (f) f.click();

  } else if (action === 'wipe') {
    if (!confirm('清除本机全部数据？\n所有档案、存档、成就和设置都会被删除，不可恢复。')) return;
    if (!confirm('再次确认：这是不可撤销的删除操作。建议先导出备份。')) return;
    nlKeysWithPrefix('naturelab.').forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
    location.reload();
  }
}

function nlSafeFile(s) {
  return String(s || 'profile').replace(/[\\/:*?"<>|]/g, '_').slice(0, 24);
}
function nlDownload(text, filename) {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { } }, 1000);
  } catch (e) { nlAccMsg('导出失败', true); }
}

/* ---------------- 导出 / 导入 ---------------- */
function nlExportOne() {
  const acc = nlActive();
  const prefix = nlNs(acc.id);
  const data = {};
  nlKeysWithPrefix(prefix).forEach(k => {
    try { data[k.slice(prefix.length)] = localStorage.getItem(k); } catch (e) { }
  });
  return JSON.stringify({
    app: 'naturelab-profile',
    schema: 1,
    appVersion: NL_APP_VERSION,
    exportedAt: new Date().toISOString(),
    profile: { name: acc.name, avatar: acc.avatar, pin: acc.pin ? { algo: acc.pin.algo, salt: acc.pin.salt, hash: acc.pin.hash } : null },
    data: data
  }, null, 2);
}
function nlExportAll() {
  const profiles = NL_ACCOUNTS.map(acc => {
    const prefix = nlNs(acc.id);
    const data = {};
    nlKeysWithPrefix(prefix).forEach(k => {
      try { data[k.slice(prefix.length)] = localStorage.getItem(k); } catch (e) { }
    });
    return {
      name: acc.name,
      avatar: acc.avatar,
      createdAt: acc.createdAt,
      pin: acc.pin ? { algo: acc.pin.algo, salt: acc.pin.salt, hash: acc.pin.hash } : null,
      data: data
    };
  });
  return JSON.stringify({
    app: 'naturelab-bundle',
    schema: 1,
    appVersion: NL_APP_VERSION,
    exportedAt: new Date().toISOString(),
    profiles: profiles
  }, null, 2);
}

// 导入：支持三种文件
//   1) naturelab-bundle   多档案包 → 逐个导入为新档案
//   2) naturelab-profile  单档案包 → 导入为新档案
//   3) 旧版裸存档 JSON      → 写入当前存档槽（校验通过才写）
function nlImportFile(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) return nlAccMsg('文件过大（>8MB），已拒绝导入', true);
  const rd = new FileReader();
  rd.onload = () => {
    let obj = null;
    try { obj = JSON.parse(rd.result); } catch (e) { return nlAccMsg('不是有效的 JSON 文件', true); }
    try {
      if (obj && obj.app === 'naturelab-bundle' && Array.isArray(obj.profiles)) {
        const names = [];
        obj.profiles.slice(0, 20).forEach(p => {
          const acc = nlCreateAccount(p.name || '导入档案', p.avatar || '🌱');
          if (p.pin && p.pin.hash && p.pin.salt) {
            acc.pin = { algo: p.pin.algo === 'fnv' ? 'fnv' : 'sha256', salt: String(p.pin.salt), hash: String(p.pin.hash), requireOnLaunch: true };
          }
          const prefix = nlNs(acc.id);
          Object.keys(p.data || {}).forEach(k => {
            if (typeof p.data[k] === 'string' && k.length < 120) {
              try { localStorage.setItem(prefix + k, p.data[k]); } catch (e) { }
            }
          });
          names.push(acc.name);
        });
        if (!names.length) return nlAccMsg('档案包里没有可导入的档案', true);
        nlSetActive(NL_ACCOUNTS[NL_ACCOUNTS.length - 1].id);
        nlPersistAccounts();
        alert('已导入 ' + names.length + ' 个档案（含原 PIN 设置），即将切换到最后一个导入的档案。');
        location.reload();

      } else if (obj && obj.app === 'naturelab-profile' && obj.data) {
        const acc = nlCreateAccount(obj.profile && obj.profile.name || '导入档案', obj.profile && obj.profile.avatar || '🌱');
        const pin = obj.profile && obj.profile.pin;
        if (pin && pin.hash && pin.salt) {
          acc.pin = { algo: pin.algo === 'fnv' ? 'fnv' : 'sha256', salt: String(pin.salt), hash: String(pin.hash), requireOnLaunch: true };
        }
        nlPersistAccounts();
        const prefix = nlNs(acc.id);
        Object.keys(obj.data).forEach(k => {
          if (typeof obj.data[k] === 'string' && k.length < 120) {
            try { localStorage.setItem(prefix + k, obj.data[k]); } catch (e) { }
          }
        });
        nlSetActive(acc.id);
        alert('档案「' + acc.name + '」已导入（含原 PIN），即将切换。');
        location.reload();

      } else if (obj && typeof obj.version === 'number' && Array.isArray(obj.slots)) {
        // 裸存档：交给引擎校验后再覆盖当前槽
        if (typeof validateSaveShape === 'function' && !validateSaveShape(obj)) return nlAccMsg('存档结构校验失败，未导入', true);
        saveGame(obj);
        alert('存档已导入到当前档案，即将刷新。');
        location.reload();

      } else {
        nlAccMsg('无法识别的文件格式', true);
      }
    } catch (e) {
      nlAccMsg('导入失败：' + (e && e.message ? e.message : '未知错误'), true);
    }
  };
  rd.readAsText(file);
}

/* ---------------- 启动锁屏 ---------------- */
function nlApplyIdentity() {
  const acc = nlActive();
  const av = document.getElementById('accAvatar');
  const nm = document.getElementById('accName');
  if (av && acc) av.textContent = acc.avatar;
  if (nm && acc) nm.textContent = acc.name;
  const btn = document.getElementById('btnAccount');
  if (btn && acc) btn.title = '档案：' + acc.name + '（点击管理）';
}

function nlLockCard() { return document.getElementById('lockCard'); }

function nlLockViewMain(acc) {
  const card = nlLockCard();
  if (!card) return;
  card.innerHTML = `
    <div class="lockAvatar">${acc.avatar}</div>
    <h2>${nlEsc(acc.name)}</h2>
    <p class="lockSub">此档案已设置 PIN · 输入后继续</p>
    <input class="lockPin" id="lockPin" type="password" inputmode="numeric" maxlength="12"
      autocomplete="current-password" placeholder="••••" aria-label="输入 PIN">
    <button class="btn primary lockBtn" id="lockGo">解 锁</button>
    <div class="lockErr" id="lockErr"></div>
    <div class="lockFoot">
      <button id="lockSwitch">切换档案</button>
      <button id="lockForgot">忘记 PIN？</button>
    </div>`;
  const input = document.getElementById('lockPin');
  const err = t => { const x = document.getElementById('lockErr'); if (x) x.textContent = t; };
  const go = async () => {
    if (NL_COOL > Date.now()) { err('尝试次数过多，请稍后重试'); return; }
    const pin = input ? input.value : '';
    if (!pin) { err('请输入 PIN'); return; }
    if (await nlVerifyPin(acc, pin)) { NL_FAILS = 0; nlUnlock(); }
    else {
      NL_FAILS++;
      if (NL_FAILS >= 5) { NL_COOL = Date.now() + 30000; NL_FAILS = 0; err('尝试次数过多，已锁定 30 秒'); }
      else err('PIN 不正确（还可尝试 ' + (5 - NL_FAILS) + ' 次）');
      if (input) { input.value = ''; input.focus(); }
    }
  };
  document.getElementById('lockGo').addEventListener('click', go);
  if (input) {
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 12); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) { } }, 60);
  }
  document.getElementById('lockSwitch').addEventListener('click', () => nlLockViewProfiles(acc));
  document.getElementById('lockForgot').addEventListener('click', () => nlLockViewForgot(acc));
}

function nlLockViewProfiles(acc) {
  const card = nlLockCard();
  if (!card) return;
  card.innerHTML = `
    <h2 style="letter-spacing:2px">切换档案</h2>
    <p class="lockSub">有 PIN 的档案会在载入后再次要求输入</p>
    <div class="lockList">${NL_ACCOUNTS.map(a => `
      <button class="lockProf ${a.id === acc.id ? 'cur' : ''}" data-lock-id="${a.id}">
        <span class="lockProfAv">${a.avatar}</span>
        <span class="lockProfTxt"><b>${nlEsc(a.name)}</b><em>${a.pin ? '已设 PIN' : '无 PIN'} · 上次 ${nlDaysAgo(a.lastPlayedAt)}</em></span>
      </button>`).join('')}</div>
    <div class="lockFoot"><button id="lockBack">返回</button></div>`;
  card.querySelectorAll('[data-lock-id]').forEach(b => b.addEventListener('click', () => {
    nlSetActive(b.getAttribute('data-lock-id'));
    location.reload();
  }));
  document.getElementById('lockBack').addEventListener('click', () => nlLockViewMain(acc));
}

function nlLockViewForgot(acc) {
  const card = nlLockCard();
  if (!card) return;
  card.innerHTML = `
    <div class="lockAvatar">🔑</div>
    <h2 style="letter-spacing:1px">无法找回 PIN</h2>
    <p class="lockSub">PIN 只以哈希保存在本机，没有服务器可以重置。若确实忘记，只能清除这个档案的全部数据。</p>
    <button class="btn danger lockBtn" id="lockWipe">清除本档案数据</button>
    <div class="lockErr" id="lockErr"></div>
    <div class="lockFoot"><button id="lockBack">返回</button></div>`;
  document.getElementById('lockBack').addEventListener('click', () => nlLockViewMain(acc));
  document.getElementById('lockWipe').addEventListener('click', () => {
    if (!confirm(`清除档案「${acc.name}」的全部数据？不可恢复。`)) return;
    if (!confirm('最后确认：删除后无法找回存档。')) return;
    nlDeleteAccount(acc.id);
    if (!NL_ACCOUNTS.length) nlCreateAccount('培育员', '🌱');
    nlSetActive(NL_ACCOUNTS[0].id);
    location.reload();
  });
}

function nlLock(quiet) {
  if (NL_LOCKED) return;
  const acc = nlActive();
  if (!acc || !acc.pin) return;
  NL_LOCKED = true;
  let el = document.getElementById('lockScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lockScreen';
    el.className = 'lockScreen';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '档案 PIN 解锁');
    document.body.appendChild(el);
  }
  el.style.display = 'grid';
  el.innerHTML = '<div class="lockCard" id="lockCard"></div>';
  nlLockViewMain(acc);
  const app = document.querySelector('.app');
  if (app) app.setAttribute('aria-hidden', 'true');
}

function nlUnlock() {
  NL_LOCKED = false;
  const el = document.getElementById('lockScreen');
  if (el) el.remove();
  const app = document.querySelector('.app');
  if (app) app.removeAttribute('aria-hidden');
  if (typeof toast === 'function') toast('已解锁，继续培育', 'good');
}

/* ---------------- 初始化 ---------------- */
function nlInitAccountUI() {
  nlApplyIdentity();
  const btn = document.getElementById('btnAccount');
  if (btn) {
    btn.addEventListener('click', () => { if (typeof sfx === 'function') sfx('open'); nlRenderAccount(true); });
  }
  // 首次升级：旧存档已迁入默认档案，给一句说明，并提示可改名
  if (NL_FIRST_RUN && typeof toast === 'function') {
    setTimeout(() => {
      toast('已建立本地档案「培育员」，点右上角头像可改名 / 加 PIN / 新建档案', 'good');
    }, 1200);
  }
  if (NL.needsLock()) nlLock(true);
}
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', nlInitAccountUI);
}
