/* ============================================================
 * store.js — 本地档案层（纯 localStorage，无后端）
 * 负责：多用户档案、进度/星级/最佳用时与步数、成就、本地排行榜、
 *       以及云端排行榜接口占位（enabled:false，留好扩展位）
 * ============================================================ */
import { LEVEL_OF_MODE, LEVEL_ORDER, unlockState } from './levels.js';

const KEY = 'ttw3d_users_v2';
const OLD_KEY = 'ttw3d_progress_v1';
const MAX_USERS = 6;
const BOARD_MAX = 20;

export const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🐰', '🐻', '🦉', '🐧', '🦁'];

/* ---------- 成就表 ---------- */
export const ACHS = [
  { id: 'first', name: '初次上手', icon: '🔧', desc: '完成第一次拆装', test: c => c.res && c.res.stars > 0 },
  { id: 'perfect', name: '分毫不差', icon: '🎯', desc: '零失误完成一关', test: c => c.res && c.res.miss === 0 },
  { id: 'speed', name: '手比脑快', icon: '⚡', desc: '90 秒内完成一件简单级', test: c => c.res && c.res.lv === 1 && c.res.time <= 90 },
  { id: 'wood2', name: '木工学徒', icon: '🪵', desc: '完成 2 件木器', test: c => countWood(c.data) >= 2 },
  { id: 'gear', name: '啮合大师', icon: '⚙️', desc: '完成齿轮箱或八音盒', test: c => hasClear(c.data, ['gearbox', 'musicBox']) },
  { id: 'hard3', name: '困难三星', icon: '🔩', desc: '在困难级拿到 3 星', test: c => c.res && c.res.lv === 3 && c.res.stars === 3 },
  { id: 'master', name: '名师出高徒', icon: '🏅', desc: '通关大师级任意一关', test: c => (c.stats.clears[4] || 0) >= 1 },
  { id: 'grand', name: '一代宗师', icon: '👑', desc: '通关宗师级任意一关', test: c => (c.stats.clears[5] || 0) >= 1 },
  { id: 'collect', name: '收藏家', icon: '📦', desc: '在 12 件玩具上留下记录', test: c => c.stats.clearToys >= 12 },
  { id: 'allstar', name: '满天星', icon: '✨', desc: '累计获得 60 颗星', test: c => c.stats.totalStars >= 60 }
];

/* ---------- 内部读写 ---------- */
let cache = null;

function blankUser() {
  return { toys: {}, ach: {}, board: {}, woodSet: {} };
}

function uid() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function readOld() {
  try {
    const o = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    return o && typeof o === 'object' ? o : null;
  } catch { return null; }
}

/* 旧进度（ttw3d_progress_v1）→ 新结构，避免老玩家丢星 */
function migrate() {
  const u = { id: 'u1', name: '小小工程师', avatar: AVATARS[0], created: Date.now() };
  const data = blankUser();
  const old = readOld();
  if (old) {
    Object.keys(old).forEach(toyId => {
      if (!old[toyId] || typeof old[toyId] !== 'object') return;
      Object.keys(old[toyId]).forEach(mode => {
        const r = old[toyId][mode] || {};
        if (!r.stars && !r.bestScore) return;
        data.toys[toyId] = data.toys[toyId] || {};
        data.toys[toyId][mode] = {
          stars: r.stars || 0,
          best: { time: 0, steps: 0, score: r.bestScore || 0 },
          plays: 1,
          last: Date.now()
        };
      });
    });
  }
  return { v: 2, cur: u.id, users: [u], data: { [u.id]: data } };
}

function readAll() {
  if (cache) return cache;
  let all = null;
  try { all = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { all = null; }
  if (!all || !Array.isArray(all.users) || !all.users.length) all = migrate();
  if (!all.data) all.data = {};
  all.users.forEach(u => { if (!all.data[u.id]) all.data[u.id] = blankUser(); });
  if (!all.data[all.cur]) all.cur = all.users[0].id;
  cache = all;
  return all;
}

function saveAll() {
  try { localStorage.setItem(KEY, JSON.stringify(readAll())); } catch { /* 隐私模式忽略 */ }
}

export function userData(id) {
  const all = readAll();
  const key = id || all.cur;
  if (!all.data[key]) all.data[key] = blankUser();
  const d = all.data[key];
  if (!d.toys) d.toys = {};
  if (!d.ach) d.ach = {};
  if (!d.board) d.board = {};
  if (!d.woodSet) d.woodSet = {};
  return d;
}

/* ---------- 档案 ---------- */
export function listUsers() {
  return readAll().users.slice();
}

export function currentUser() {
  const all = readAll();
  return all.users.find(u => u.id === all.cur) || all.users[0];
}

export function switchUser(id) {
  const all = readAll();
  if (!all.users.some(u => u.id === id)) return false;
  all.cur = id;
  saveAll();
  return true;
}

export function addUser(name, avatar) {
  const all = readAll();
  if (all.users.length >= MAX_USERS) return { ok: false, msg: `最多 ${MAX_USERS} 个档案` };
  const nm = String(name || '').trim().slice(0, 10) || `玩家${all.users.length + 1}`;
  const u = {
    id: uid(), name: nm,
    avatar: AVATARS.includes(avatar) ? avatar : AVATARS[all.users.length % AVATARS.length],
    created: Date.now()
  };
  all.users.push(u);
  all.data[u.id] = blankUser();
  all.cur = u.id;
  saveAll();
  return { ok: true, user: u };
}

export function renameUser(id, name) {
  const all = readAll();
  const u = all.users.find(x => x.id === id);
  if (!u) return false;
  const nm = String(name || '').trim().slice(0, 10);
  if (!nm) return false;
  u.name = nm;
  saveAll();
  return true;
}

export function setAvatar(id, avatar) {
  const all = readAll();
  const u = all.users.find(x => x.id === id);
  if (!u || !AVATARS.includes(avatar)) return false;
  u.avatar = avatar;
  saveAll();
  return true;
}

export function removeUser(id) {
  const all = readAll();
  if (all.users.length <= 1) return { ok: false, msg: '至少要保留一个档案' };
  const i = all.users.findIndex(u => u.id === id);
  if (i < 0) return { ok: false };
  all.users.splice(i, 1);
  delete all.data[id];
  if (all.cur === id) all.cur = all.users[0].id;
  saveAll();
  return { ok: true };
}

/* ---------- 进度 ---------- */
export function recordOf(toyId, mode, userId) {
  const d = userData(userId);
  return (d.toys[toyId] && d.toys[toyId][mode]) || null;
}

export function statsOf(userId) {
  const d = userData(userId);
  const clears = {};
  LEVEL_ORDER.forEach(lv => { clears[lv] = 0; });
  let totalStars = 0, clearToys = 0;
  Object.keys(d.toys).forEach(toyId => {
    const rec = d.toys[toyId] || {};
    let best = 0;
    const lvDone = {};
    Object.keys(rec).forEach(mode => {
      const r = rec[mode];
      if (!r) return;
      const st = r.stars || 0;
      if (st > best) best = st;
      const lv = LEVEL_OF_MODE[mode] || 1;
      if (st > 0) lvDone[lv] = true;
    });
    totalStars += best;
    if (best > 0) clearToys++;
    Object.keys(lvDone).forEach(lv => { clears[lv] = (clears[lv] || 0) + 1; });
  });
  return { totalStars, clearToys, clears };
}

export function unlockedLevels(userId) {
  const st = statsOf(userId);
  const out = {};
  LEVEL_ORDER.forEach(lv => { out[lv] = unlockState(lv, st).open; });
  return out;
}

/* ---------- 排行榜（本地） ---------- */
export function board(mode, userId) {
  const d = userData(userId);
  return (d.board[mode] || []).slice();
}

function pushBoard(d, entry) {
  const arr = d.board[entry.mode] || (d.board[entry.mode] = []);
  arr.push(entry);
  arr.sort((a, b) => (b.score - a.score) || (a.time - b.time) || (a.steps - b.steps));
  if (arr.length > BOARD_MAX) arr.length = BOARD_MAX;
  const idx = arr.indexOf(entry);
  return idx >= 0 ? idx + 1 : 0;
}

/* ---------- 结算 ---------- */
function hasClear(data, ids) {
  return ids.some(id => {
    const rec = data.toys[id];
    if (!rec) return false;
    return Object.keys(rec).some(m => rec[m] && rec[m].stars > 0);
  });
}

function countWood(data) {
  const set = data.woodSet || {};
  return Object.keys(set).filter(id => set[id]).length;
}

export function submitResult(res, userId) {
  const all = readAll();
  const uidNow = userId || all.cur;
  const d = userData(uidNow);
  const user = all.users.find(u => u.id === uidNow) || currentUser();

  d.toys[res.toyId] = d.toys[res.toyId] || {};
  const old = d.toys[res.toyId][res.mode] || null;
  const rec = old || { stars: 0, best: { time: 0, steps: 0, score: 0 }, plays: 0 };
  rec.plays = (rec.plays || 0) + 1;
  rec.last = Date.now();
  const newBest = { stars: false, time: false, score: false };
  if (res.stars > (rec.stars || 0)) { rec.stars = res.stars; newBest.stars = true; }
  if (!rec.best.time || (res.time > 0 && res.time < rec.best.time)) { rec.best.time = res.time; newBest.time = true; }
  if (!rec.best.steps || (res.steps > 0 && res.steps < rec.best.steps)) { rec.best.steps = res.steps; }
  if ((res.score || 0) > (rec.best.score || 0)) { rec.best.score = res.score; newBest.score = true; }
  d.toys[res.toyId][res.mode] = rec;
  if (res.wood) { d.woodSet = d.woodSet || {}; d.woodSet[res.toyId] = 1; }

  const entry = {
    name: user.name, avatar: user.avatar, toyId: res.toyId, toyName: res.toyName,
    mode: res.mode, score: res.score || 0, time: res.time, steps: res.steps, ts: Date.now()
  };
  const rank = res.score ? pushBoard(d, entry) : 0;

  const stats = statsOf(uidNow);
  const ctx = { res, data: d, stats, totalStars: stats.totalStars };
  const newAch = [];
  ACHS.forEach(a => {
    if (d.ach[a.id]) return;
    let ok = false;
    try { ok = !!a.test(ctx); } catch { ok = false; }
    if (ok) { d.ach[a.id] = Date.now(); newAch.push(a); }
  });

  saveAll();
  return { rec, newBest, rank, newAch, stats };
}

export function achievementsOf(userId) {
  const d = userData(userId);
  return ACHS.map(a => ({ ...a, got: !!d.ach[a.id], at: d.ach[a.id] || 0 }));
}

/* ---------- 云端排行榜占位 ----------
 * 以后接入后端时把 enabled 改成 true，并实现下面两个方法即可；
 * 页面只需判断 CloudBoard.enabled 决定是否显示「云端」页签。 */
export const CloudBoard = {
  enabled: false,
  endpoint: '',
  async submit() { return { ok: false, msg: '云端排行榜尚未接入' }; },
  async fetch() { return { ok: false, list: [], msg: '云端排行榜尚未接入' }; }
};

export const Store = {
  AVATARS, ACHS, CloudBoard,
  listUsers, currentUser, switchUser, addUser, renameUser, setAvatar, removeUser,
  userData, recordOf, statsOf, unlockedLevels, board, submitResult, achievementsOf
};
