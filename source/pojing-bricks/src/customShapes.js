// 自定义形状：玩家自己用"小方块"堆出来的零件
// 存成一个格子集合（与内置积木完全同构），所以吸附、稳固判定、渲染、存档全都天然可用。
import { addCustomShape, removeCustomShape } from './shapes.js';

const KEY = 'pojing.customShapes.v1';
export const MAX_VOX = 6;          // 6×6×6 的小方块，最多 216 格
let seq = 0;

function readRaw() {
  try {
    const s = localStorage.getItem(KEY);
    const arr = s ? JSON.parse(s) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function writeRaw(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch (e) { console.warn('自定义形状保存失败', e); return false; }
}

/** 把格子集合规整到原点（最小 c/r/l 归零），并算出尺寸。
 *  接受两种写法：[c, r, l] 或 { c, r, l, color }（后者是从主平台多选存下来的，带颜色）。 */
export function normalizeCells(cells) {
  if (!cells || !cells.length) return null;
  const at = (x, i) => (Array.isArray(x) ? x[i] : [x.c, x.r, x.l][i]);
  const cs = cells.map(c => at(c, 0)), rs = cells.map(c => at(c, 1)), ls = cells.map(c => at(c, 2));
  const c0 = Math.min(...cs), r0 = Math.min(...rs), l0 = Math.min(...ls);
  const seen = new Set(), out = [];
  for (const cell of cells) {
    const c = at(cell, 0), r = at(cell, 1), l = at(cell, 2);
    const k = `${c},${r},${l}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const color = Array.isArray(cell) ? cell[3] : cell.color;
    out.push(color ? [c - c0, r - r0, l - l0, color] : [c - c0, r - r0, l - l0]);
  }
  const w = Math.max(...out.map(c => c[0])) + 1;
  const d = Math.max(...out.map(c => c[1])) + 1;
  const h = Math.max(...out.map(c => c[2])) + 1;
  return { cells: out, w, d, h };
}

/** 数据 → 形状定义（与 shapes.js 里的内置条目同构） */
export function toShapeDef(rec) {
  const n = normalizeCells(rec.cells);
  if (!n) return null;
  return {
    id: rec.id,
    name: rec.name || '自定义',
    tag: `自己拼的 · ${n.cells.length} 格`,
    cat: 'my',
    custom: true,
    rev: rec.rev || 0,
    // 带颜色的一并带上：渲染时按色分组，搭的小屋存成形状后配色不丢
    cells: n.cells.map(([c, r, l, color]) => (color ? { c, r, l, color } : { c, r, l })),
  };
}

export function listCustom() {
  return readRaw().filter(r => r && r.id && Array.isArray(r.cells) && r.cells.length);
}

/** 启动时把所有自定义形状挂进形状库 */
export function loadCustomShapes() {
  let n = 0;
  for (const rec of listCustom()) {
    const def = toShapeDef(rec);
    if (def) { addCustomShape(def); n++; }
  }
  return n;
}

export function saveCustom({ id, name, cells, max = MAX_VOX ** 3 }) {
  const n = normalizeCells(cells);
  if (!n) return { ok: false, msg: '至少放一个小方块' };
  if (n.cells.length > max) return { ok: false, msg: `太大了（${n.cells.length} 格，上限 ${max} 格）` };
  const old = id ? readRaw().find(r => r.id === id) : null;
  const rec = {
    id: id || `my${Date.now().toString(36)}${(seq++).toString(36)}`,
    name: (name || '').trim().slice(0, 8) || '自定义',
    cells: n.cells,
    rev: (old ? (old.rev || 0) + 1 : 0),   // 编辑后要重建几何，缓存键跟着变
  };
  const list = readRaw().filter(r => r.id !== rec.id);
  list.push(rec);
  if (!writeRaw(list)) return { ok: false, msg: '浏览器存储写不进去' };
  const def = toShapeDef(rec);
  addCustomShape(def);
  return { ok: true, rec, def };
}

export function deleteCustom(id) {
  const list = readRaw().filter(r => r.id !== id);
  writeRaw(list);
  removeCustomShape(id);
}

export function findCustom(id) {
  return listCustom().find(r => r.id === id) || null;
}
