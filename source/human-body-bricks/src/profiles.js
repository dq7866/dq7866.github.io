// profiles.js — 本地用户档案：多档案切换、每档案独立进度、旧存档无损迁移
//
// 设计边界：这是纯前端的「本地档案」，不是云端账号体系。
// 没有注册、没有密码、没有服务器，全部数据只写浏览器 localStorage，
// 不联网、不上传；换设备 / 换浏览器 / 清缓存不会同步（面板里也会如实写明）。
// 需要真正的账号与跨设备同步时，再接后端服务。

export const LEGACY_SAVE_KEY = 'human-body-bricks-v1'; // 加档案功能之前的单存档键
export const PROFILES_KEY = 'hb-profiles-v1';          // 档案清单 + 当前档案 id
export const SAVE_PREFIX = 'hb-save-v1::';             // 每份进度：SAVE_PREFIX + 档案 id

const DEFAULT_ID = 'p1';
const COLORS = ['#6fd9e8', '#f0a880', '#a6d8a0', '#c7a6e8', '#f2cf7a', '#8fb4f2'];

const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 隐私模式忽略 */ } };
const del = k => { try { localStorage.removeItem(k); } catch { /* 隐私模式忽略 */ } };
const parse = (raw, fb) => { try { return JSON.parse(raw) ?? fb; } catch { return fb; } };
const clean = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 12);

function write(d) { set(PROFILES_KEY, JSON.stringify(d)); }

function read() {
  const raw = get(PROFILES_KEY);
  let d = raw ? parse(raw, null) : null;
  if (!d || !Array.isArray(d.list) || !d.list.length) {
    // 首次进入：建默认档案；若存在旧版单存档，原样搬进默认档案，一条进度都不丢
    const legacy = get(LEGACY_SAVE_KEY);
    d = { current: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: '我', color: COLORS[0], created: Date.now() }] };
    if (legacy && !get(SAVE_PREFIX + DEFAULT_ID)) set(SAVE_PREFIX + DEFAULT_ID, legacy);
    write(d);
  } else {
    d.list = d.list.filter(p => p && p.id);
    if (!d.list.length) d.list.push({ id: DEFAULT_ID, name: '我', color: COLORS[0], created: Date.now() });
    if (!d.list.some(p => p.id === d.current)) d.current = d.list[0].id;
  }
  return d;
}

export function currentSaveKey() { return SAVE_PREFIX + read().current; }
export function currentProfile() {
  const d = read();
  return { ...(d.list.find(p => p.id === d.current) || d.list[0]) };
}

export function statOf(id) {
  const s = parse(get(SAVE_PREFIX + id), {}) || {};
  return {
    learned: Array.isArray(s.learned) ? s.learned.length : 0,
    badges: Array.isArray(s.badges) ? s.badges.length : 0,
    system: typeof s.system === 'string' ? s.system : 'body',
  };
}

export function listProfiles() {
  const d = read();
  return d.list.map(p => ({ ...p, active: p.id === d.current, stats: statOf(p.id) }));
}

export function addProfile(name) {
  const nm = clean(name);
  if (!nm) return null;
  const d = read();
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  d.list.push({ id, name: nm, color: COLORS[d.list.length % COLORS.length], created: Date.now() });
  d.current = id;
  write(d);
  return id;
}

export function switchProfile(id) {
  const d = read();
  if (!d.list.some(p => p.id === id)) return false;
  d.current = id;
  write(d);
  return true;
}

export function renameProfile(id, name) {
  const nm = clean(name);
  if (!nm) return false;
  const d = read();
  const p = d.list.find(x => x.id === id);
  if (!p) return false;
  p.name = nm;
  write(d);
  return true;
}

export function removeProfile(id) {
  const d = read();
  if (d.list.length <= 1 || !d.list.some(p => p.id === id)) return false;
  d.list = d.list.filter(p => p.id !== id);
  del(SAVE_PREFIX + id);
  if (d.current === id) d.current = d.list[0].id;
  write(d);
  return true;
}

export function clearCurrentSave() { del(SAVE_PREFIX + read().current); }

// 仅供验证脚本 / 排查使用：把档案系统恢复到初始状态
export function resetProfileSystem() {
  const d = read();
  d.list.forEach(p => del(SAVE_PREFIX + p.id));
  del(PROFILES_KEY);
}
