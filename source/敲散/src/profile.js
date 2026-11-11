/* ============================================================
   敲散 · 本地用户档案（v3.0）
   ------------------------------------------------------------
   纯离线游戏没有服务器，用户管理落地为「本机多档案」：
   - 每个档案独立保存设置、局数、连击纪录与偏好
   - 可选 PIN 隐私锁（同机误入防护，不是加密）
   - 支持新建 / 切换 / 改名 / 换头像 / 删除 / 导出
   存储布局：
     qs.accounts.v1        档案注册表
     qs.current            当前档案 id
     qs.u<id>.yt_*         档案内游戏数据（沿用旧键名，便于迁移）
   旧版 yt_* 键首次启动自动迁入默认档案。
   ============================================================ */
(function () {
  'use strict';

  const ACC_KEY = 'qs.accounts.v1';
  const CUR_KEY = 'qs.current';
  const GLOBAL_KEYS = [ACC_KEY, CUR_KEY];
  const AVATARS = ['🙂', '🌙', '🍀', '🔥', '🫧', '🐱', '🌊', '⭐'];
  const PIN_MIN = 4, PIN_MAX = 12;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hex = buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

  function salt() {
    try {
      const a = new Uint8Array(12);
      (window.crypto || window.msCrypto).getRandomValues(a);
      return hex(a);
    } catch (e) { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  }
  function fnv(pin, s) {
    const str = s + ':' + pin + ':' + s;
    let h = 0x811c9dc5;
    for (let r = 0; r < 16000; r++) {
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      h ^= r; h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
  async function hashPin(pin, s, algo) {
    if (algo === 'fnv') return 'fnv:' + fnv(pin, s);
    try {
      const data = new TextEncoder().encode('qiaosan|' + s + '|' + pin + '|' + s);
      const buf = await (window.crypto || crypto).subtle.digest('SHA-256', data);
      return 'sha256:' + hex(buf);
    } catch (e) { return 'fnv:' + fnv(pin, s); }
  }

  function normalize(a) {
    const pin = a && a.pin && a.pin.hash ? {
      algo: a.pin.algo === 'fnv' ? 'fnv' : 'sha256',
      salt: String(a.pin.salt || ''),
      hash: String(a.pin.hash || ''),
      requireOnLaunch: a.pin.requireOnLaunch !== false
    } : null;
    return {
      id: String(a && a.id ? a.id : uid()),
      name: String((a && a.name) || '玩家').slice(0, 12),
      avatar: AVATARS.indexOf(a && a.avatar) >= 0 ? a.avatar : '🙂',
      createdAt: (a && a.createdAt) || Date.now(),
      lastPlayedAt: (a && a.lastPlayedAt) || (a && a.createdAt) || Date.now(),
      pin
    };
  }

  let accounts = [];
  try {
    const raw = JSON.parse(localStorage.getItem(ACC_KEY) || '[]');
    accounts = Array.isArray(raw) ? raw.filter(x => x && x.id).map(normalize) : [];
  } catch (e) { accounts = []; }
  let activeId = '';
  try { activeId = localStorage.getItem(CUR_KEY) || ''; } catch (e) { }

  let locked = false;
  let fails = 0;
  let coolUntil = 0;
  let firstRun = false;
  let pinMode = null;
  let draftAvatar = null;
  let msg = '';
  let bound = false;

  function find(id) { return accounts.find(a => a.id === id) || null; }
  function active() { return find(activeId) || accounts[0] || null; }
  function prefixOf(acc) { return 'qs.u' + (acc ? acc.id : 'guest') + '.'; }
  function persist() {
    try {
      localStorage.setItem(ACC_KEY, JSON.stringify(accounts));
      if (activeId) localStorage.setItem(CUR_KEY, activeId);
    } catch (e) { }
  }
  function keysWithPrefix(p) {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(p) === 0) out.push(k);
      }
    } catch (e) { }
    return out;
  }
  function migrateLegacy(acc) {
    const p = prefixOf(acc);
    const old = keysWithPrefix('yt_');
    old.forEach(k => {
      try { localStorage.setItem(p + k, localStorage.getItem(k)); localStorage.removeItem(k); } catch (e) { }
    });
    // 旧版没有档案概念：把第一次进入也算一局，避免统计从 0 开始显得突兀
  }
  function create(name, avatar, opts) {
    const acc = normalize({ id: uid(), name: name || '玩家', avatar: avatar || '🙂' });
    accounts.push(acc);
    if (!opts || opts.persist !== false) persist();
    return acc;
  }
  function setActive(id) {
    if (!find(id)) return false;
    activeId = id;
    const acc = find(id);
    if (acc) { acc.lastPlayedAt = Date.now(); }
    persist();
    return true;
  }
  function removeAccount(id) {
    const acc = find(id);
    if (!acc) return false;
    keysWithPrefix(prefixOf(acc)).forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
    accounts = accounts.filter(a => a.id !== id);
    if (activeId === id) activeId = accounts.length ? accounts[0].id : '';
    persist();
    return true;
  }

  // 首次启动：建档 + 迁移旧数据
  (function bootstrap() {
    if (!accounts.length) {
      const acc = create('玩家', '🙂', { persist: false });
      migrateLegacy(acc);
      activeId = acc.id;
      firstRun = true;
      persist();
    } else if (!find(activeId)) {
      activeId = accounts[0].id;
      persist();
    }
  })();

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(prefixOf(active()) + 'yt_' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem(prefixOf(active()) + 'yt_' + k, JSON.stringify(v)); return true; }
      catch (e) {
        if (window.__QS_ON_SAVE_ERROR) window.__QS_ON_SAVE_ERROR(e);
        return false;
      }
    },
    raw() {
      const p = prefixOf(active());
      const out = {};
      keysWithPrefix(p).forEach(k => { try { out[k.slice(p.length)] = localStorage.getItem(k); } catch (e) { } });
      return out;
    }
  };

  /* ---------------- 档案面板 ---------------- */
  function daysAgo(ts) {
    const d = Math.floor(Math.max(0, Date.now() - (ts || Date.now())) / 86400000);
    if (d <= 0) return '今天';
    if (d === 1) return '昨天';
    return d + ' 天前';
  }
  function statsOf(acc) {
    try {
      const raw = localStorage.getItem(prefixOf(acc) + 'yt_stats');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function render(open) {
    const body = document.getElementById('pfBody');
    if (!body) return;
    const acc = active();
    if (!acc) return;
    if (draftAvatar === null) draftAvatar = acc.avatar;
    const st = statsOf(acc);
    const avatars = AVATARS.map(a =>
      '<button class="avOpt ' + (a === draftAvatar ? 'on' : '') + '" data-av="' + a + '" aria-label="选择头像 ' + a + '">' + a + '</button>'
    ).join('');
    const pinBlock = acc.pin ? (
      '<div class="pfRow"><div class="pfInfo"><b>已开启 PIN 隐私锁</b><span>启动时需输入 · 只防同机误入，不是加密</span></div>' +
      '<div class="pfOps"><button class="mini" data-pf="pinChange">修改</button><button class="mini" data-pf="pinRemove">移除</button><button class="mini" data-pf="lockNow">立即锁定</button></div></div>'
    ) : (
      '<div class="pfRow"><div class="pfInfo"><b>未设置 PIN</b><span>同一台设备上的其他人可以直接打开</span></div>' +
      '<div class="pfOps"><button class="mini" data-pf="pinSet">设置 PIN</button></div></div>'
    );
    let form = '';
    if (pinMode) {
      const needOld = pinMode !== 'set';
      const needNew = pinMode !== 'remove';
      form = '<div class="pfForm">' +
        (needOld ? '<input class="pfInput" id="pfPinOld" type="password" inputmode="numeric" maxlength="12" placeholder="当前 PIN">' : '') +
        (needNew ? '<input class="pfInput" id="pfPinNew" type="password" inputmode="numeric" maxlength="12" placeholder="新 PIN（4–12 位）">' : '') +
        (needNew ? '<input class="pfInput" id="pfPinNew2" type="password" inputmode="numeric" maxlength="12" placeholder="再输一次">' : '') +
        '<button class="mini" data-pf="pinSubmit">' + (pinMode === 'remove' ? '确认移除' : '保存') + '</button>' +
        '<button class="mini ghost" data-pf="pinCancel">取消</button></div>' +
        '<div class="pfErr" id="pfPinErr"></div>';
    }
    const list = accounts.map(a => {
      const cur = a.id === acc.id;
      return '<div class="pfRow ' + (cur ? 'cur' : '') + '">' +
        '<span class="pfAv">' + a.avatar + '</span>' +
        '<div class="pfInfo"><b>' + esc(a.name) + (a.pin ? ' <i class="pfLock">🔒</i>' : '') + (cur ? ' <i class="pfCur">当前</i>' : '') + '</b>' +
        '<span>' + (cur ? '正在游玩' : '上次 ' + daysAgo(a.lastPlayedAt)) + ' · 创建于 ' + new Date(a.createdAt).toLocaleDateString('zh-CN') + '</span></div>' +
        '<div class="pfOps">' + (cur ? '' : '<button class="mini" data-pf="switch" data-id="' + a.id + '">切换</button>' +
          '<button class="mini danger" data-pf="del" data-id="' + a.id + '">删除</button>') + '</div></div>';
    }).join('');

    body.innerHTML =
      '<div class="pfTop">' +
        '<div class="pfAvatarBig">' + draftAvatar + '</div>' +
        '<div class="pfTopMain">' +
          '<label class="pfLabel">档案名称</label>' +
          '<input class="pfInput pfName" id="pfNameInput" maxlength="12" value="' + esc(acc.name) + '" aria-label="档案名称">' +
          '<div class="pfLabel" style="margin-top:10px">头像</div>' +
          '<div class="pfAvas">' + avatars + '</div>' +
          '<div class="pfStats">累计 ' + (st.rounds || 0) + ' 局 · 敲碎 ' + (st.pops || 0) + ' 个 · 最高 COMBO ×' + (st.bestCombo || 0) + '</div>' +
          '<button class="mini" data-pf="save">保存资料</button>' +
        '</div>' +
      '</div>' +
      '<div class="pfSec">登录与安全</div>' + pinBlock + form +
      '<div class="pfSec">本机档案 <em>' + accounts.length + ' 个</em></div>' +
      '<div class="pfList">' + list + '</div>' +
      '<div class="pfNew"><input class="pfInput" id="pfNewName" maxlength="12" placeholder="新档案名称" aria-label="新档案名称">' +
      '<button class="mini" data-pf="create">新建档案</button></div>' +
      '<div class="pfSec">数据与隐私</div>' +
      '<div class="pfNote">全部数据只保存在本机浏览器，不上传、不统计、不追踪。清理站点数据会连同档案一起删除；换设备前请先导出档案。</div>' +
      '<div class="pfData"><button class="mini" data-pf="export">导出当前档案</button>' +
      '<button class="mini danger" data-pf="wipe">清除本机全部数据</button></div>' +
      '<div class="pfErr" id="pfMsg">' + (msg ? esc(msg) : '') + '</div>';

    if (!bound) {
      bound = true;
      const modal = document.getElementById('profileModal');
      if (modal) {
        modal.addEventListener('click', e => {
          const av = e.target.closest('[data-av]');
          if (av) { draftAvatar = av.getAttribute('data-av'); render(); return; }
          const btn = e.target.closest('[data-pf]');
          if (!btn) return;
          act(btn.getAttribute('data-pf'), btn);
        });
        const close = modal.querySelector('[data-pf-close]');
        if (close) close.addEventListener('click', () => closeModal());
      }
    }
    if (open) openModal();
  }

  function openModal() {
    render(false);
    const m = document.getElementById('profileModal');
    if (m) m.classList.add('on');
    const s = document.getElementById('modalScrim');
    if (s) s.classList.add('on');
  }
  function closeModal() {
    const m = document.getElementById('profileModal');
    if (m) m.classList.remove('on');
    const s = document.getElementById('modalScrim');
    if (s && !document.querySelector('.modalCard.on')) s.classList.remove('on');
  }

  function setMsg(t, bad) {
    msg = t || '';
    const el = document.getElementById('pfMsg');
    if (el) { el.textContent = t || ''; el.style.color = bad ? '#ff8f8f' : ''; }
  }

  async function act(action, btn) {
    const acc = active();
    if (!acc) return;
    const pinErr = t => { const el = document.getElementById('pfPinErr'); if (el) el.textContent = t; };

    if (action === 'save') {
      const inp = document.getElementById('pfNameInput');
      const name = (inp && inp.value || '').trim();
      if (!name) return setMsg('档案名称不能为空', true);
      acc.name = name.slice(0, 12);
      acc.avatar = draftAvatar;
      persist();
      setMsg('资料已保存');
      render();
      refreshHud();

    } else if (action === 'pinSet') { pinMode = 'set'; render(); }
    else if (action === 'pinChange') { pinMode = 'change'; render(); }
    else if (action === 'pinRemove') { pinMode = 'remove'; render(); }
    else if (action === 'pinCancel') { pinMode = null; render(); }
    else if (action === 'pinSubmit') {
      const mode = pinMode;
      const oldEl = document.getElementById('pfPinOld');
      const n1 = document.getElementById('pfPinNew');
      const n2 = document.getElementById('pfPinNew2');
      if (acc.pin && oldEl) {
        const ok = await verify(acc, oldEl.value);
        if (!ok) return pinErr('当前 PIN 不正确');
      }
      if (mode !== 'remove') {
        const pin = n1 ? n1.value : '';
        if (!/^\d{4,12}$/.test(pin)) return pinErr('PIN 必须是 4–12 位数字');
        if (!n2 || n2.value !== pin) return pinErr('两次输入的 PIN 不一致');
        const s = salt();
        const algo = (window.crypto && window.crypto.subtle) ? 'sha256' : 'fnv';
        acc.pin = { algo: algo, salt: s, hash: await hashPin(pin, s, algo), requireOnLaunch: true };
      } else {
        acc.pin = null;
      }
      pinMode = null;
      persist();
      msg = mode === 'remove' ? 'PIN 已移除' : 'PIN 已更新';
      render();

    } else if (action === 'lockNow') {
      closeModal();
      lock();

    } else if (action === 'switch') {
      const id = btn.getAttribute('data-id');
      if (setActive(id)) location.reload();

    } else if (action === 'del') {
      const id = btn.getAttribute('data-id');
      const t = find(id);
      if (!t) return;
      if (!confirm('删除档案「' + t.name + '」？\n该档案的设置与统计会一并清除，不可恢复。')) return;
      removeAccount(id);
      setMsg('档案已删除');
      render();

    } else if (action === 'create') {
      const inp = document.getElementById('pfNewName');
      const name = (inp && inp.value || '').trim() || ('玩家 ' + (accounts.length + 1));
      const a = create(name, draftAvatar || '🙂');
      setActive(a.id);
      location.reload();

    } else if (action === 'export') {
      const p = prefixOf(acc);
      const data = {};
      keysWithPrefix(p).forEach(k => { try { data[k.slice(p.length)] = localStorage.getItem(k); } catch (e) { } });
      const blob = new Blob([JSON.stringify({
        app: 'qiaosan-profile', schema: 1, exportedAt: new Date().toISOString(),
        profile: { name: acc.name, avatar: acc.avatar }, data: data
      }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qiaosan-profile-' + acc.name.replace(/[\\/:*?"<>|]/g, '_') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 800);
      setMsg('档案已导出');

    } else if (action === 'wipe') {
      if (!confirm('清除本机全部数据？所有档案与统计都会被删除，不可恢复。')) return;
      if (!confirm('再次确认：建议先导出档案。')) return;
      keysWithPrefix('qs.').forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
      keysWithPrefix('yt_').forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
      location.reload();
    }
  }

  /* ---------------- 锁屏 ---------------- */
  async function verify(acc, pin) {
    if (!acc || !acc.pin) return true;
    return (await hashPin(pin, acc.pin.salt, acc.pin.algo)) === acc.pin.hash;
  }
  function lockCard() { return document.getElementById('qsLockCard'); }

  function viewMain(acc) {
    const card = lockCard(); if (!card) return;
    card.innerHTML =
      '<div class="lkAvatar">' + acc.avatar + '</div>' +
      '<h2>' + esc(acc.name) + '</h2>' +
      '<p class="lkSub">此档案已设置 PIN · 输入后继续</p>' +
      '<input class="lkPin" id="lkPin" type="password" inputmode="numeric" maxlength="12" placeholder="••••" aria-label="输入 PIN">' +
      '<button class="lkBtn" id="lkGo">解 锁</button>' +
      '<div class="lkErr" id="lkErr"></div>' +
      '<div class="lkFoot"><button id="lkSwitch">切换档案</button><button id="lkForgot">忘记 PIN？</button></div>';
    const input = document.getElementById('lkPin');
    const err = t => { const e = document.getElementById('lkErr'); if (e) e.textContent = t; };
    const go = async () => {
      if (coolUntil > Date.now()) return err('尝试次数过多，请稍后再试');
      if (!input.value) return err('请输入 PIN');
      if (await verify(acc, input.value)) { fails = 0; unlock(); }
      else {
        fails++;
        if (fails >= 5) { coolUntil = Date.now() + 30000; fails = 0; err('尝试次数过多，已锁定 30 秒'); }
        else err('PIN 不正确（还可尝试 ' + (5 - fails) + ' 次）');
        input.value = ''; input.focus();
      }
    };
    document.getElementById('lkGo').addEventListener('click', go);
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => { try { input.focus(); } catch (e) { } }, 80);
    document.getElementById('lkSwitch').addEventListener('click', () => viewList(acc));
    document.getElementById('lkForgot').addEventListener('click', () => viewForgot(acc));
  }
  function viewList(acc) {
    const card = lockCard(); if (!card) return;
    card.innerHTML = '<h2 style="letter-spacing:2px">切换档案</h2><p class="lkSub">有 PIN 的档案会在载入后再次要求输入</p>' +
      '<div class="lkList">' + accounts.map(a =>
        '<button class="lkProf" data-lk="' + a.id + '"><span>' + a.avatar + '</span><b>' + esc(a.name) + '</b><em>' + (a.pin ? '已设 PIN' : '无 PIN') + '</em></button>'
      ).join('') + '</div><div class="lkFoot"><button id="lkBack">返回</button></div>';
    card.querySelectorAll('[data-lk]').forEach(b => b.addEventListener('click', () => {
      setActive(b.getAttribute('data-lk')); location.reload();
    }));
    document.getElementById('lkBack').addEventListener('click', () => viewMain(acc));
  }
  function viewForgot(acc) {
    const card = lockCard(); if (!card) return;
    card.innerHTML = '<div class="lkAvatar">🔑</div><h2>无法找回 PIN</h2>' +
      '<p class="lkSub">PIN 只以哈希保存在本机，没有服务器可以重置。忘记后只能清除该档案数据。</p>' +
      '<button class="lkBtn danger" id="lkWipe">清除本档案数据</button>' +
      '<div class="lkErr" id="lkErr"></div><div class="lkFoot"><button id="lkBack">返回</button></div>';
    document.getElementById('lkBack').addEventListener('click', () => viewMain(acc));
    document.getElementById('lkWipe').addEventListener('click', () => {
      if (!confirm('清除档案「' + acc.name + '」的全部数据？不可恢复。')) return;
      removeAccount(acc.id);
      if (!accounts.length) create('玩家', '🙂');
      setActive(accounts[0].id);
      location.reload();
    });
  }
  function lock() {
    const acc = active();
    if (!acc || !acc.pin || locked) return;
    locked = true;
    let el = document.getElementById('qsLock');
    if (!el) {
      el = document.createElement('div');
      el.id = 'qsLock';
      el.className = 'lkScreen';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.innerHTML = '<div class="lkCard" id="qsLockCard"></div>';
      document.body.appendChild(el);
    }
    el.style.display = 'grid';
    viewMain(acc);
  }
  function unlock() {
    locked = false;
    const el = document.getElementById('qsLock');
    if (el) el.remove();
  }
  function needsLock() { return !!(active() && active().pin && active().pin.requireOnLaunch !== false); }

  function refreshHud() {
    const acc = active();
    const el = document.getElementById('pfAvatar');
    if (el && acc) el.textContent = acc.avatar;
  }

  function init() {
    refreshHud();
    const btn = document.getElementById('profileBtn');
    if (btn) btn.addEventListener('click', openModal);
    const scrim = document.getElementById('modalScrim');
    if (scrim) scrim.addEventListener('click', () => {
      document.querySelectorAll('.modalCard.on').forEach(m => m.classList.remove('on'));
      scrim.classList.remove('on');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modalCard.on').forEach(m => m.classList.remove('on'));
        if (scrim) scrim.classList.remove('on');
      }
    });
    if (firstRun && typeof window.__QS_TOAST === 'function') {
      setTimeout(() => window.__QS_TOAST('已创建本地档案「玩家」，点右上角头像可改名 / 加 PIN'), 900);
    }
    if (needsLock()) lock();
  }

  window.QS = {
    store: store,
    active: active,
    accounts: () => accounts.slice(),
    prefix: () => prefixOf(active()),
    openProfile: openModal,
    init: init,
    locked: () => locked,
    needsLock: needsLock
  };
})();
