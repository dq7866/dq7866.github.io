// 成就系统：里程碑式奖励，鼓励孩子探索游戏的每个角落
// 事件驱动：main.js 在对应动作处调用 ach.track('place') 等，解锁自动弹提示

const KEY = 'pojing-bricks-ach';

/** 成就定义：id / 图标 / 名称 / 说明 / 达成条件（stats 快照 => bool） */
export const ACHIEVEMENTS = [
  { id: 'first',   icon: '🧱', name: '第一块积木', desc: '放下你的第一块积木',            test: s => s.place >= 1 },
  { id: 'b50',     icon: '🔨', name: '小小建筑师', desc: '累计放置 50 块积木',            test: s => s.place >= 50 },
  { id: 'b200',    icon: '🏗️', name: '建筑大师',   desc: '累计放置 200 块积木',           test: s => s.place >= 200 },
  { id: 'shape6',  icon: '🧩', name: '形状收藏家', desc: '一局里用过 6 种不同形状',        test: s => s.shapes >= 6 },
  { id: 'color8',  icon: '🎨', name: '调色师',     desc: '一局里用过 8 种不同颜色',        test: s => s.colors >= 8 },
  { id: 'heart',   icon: '💖', name: '爱心建筑师', desc: '用爱心积木搭点浪漫的东西',       test: s => s.heart >= 1 },
  { id: 'mirror',  icon: '🪞', name: '对称魔法师', desc: '用镜像模式放置 20 次积木',       test: s => s.mirror >= 20 },
  { id: 'undo20',  icon: '⏪', name: '后悔药',     desc: '撤销 20 次（谁还没手滑过呢）',   test: s => s.undo >= 20 },
  { id: 'stars9',  icon: '⭐', name: '星星收集者', desc: '关卡挑战累计拿到 9 颗星',        test: s => s.stars >= 9 },
  { id: 'stars18', icon: '🌟', name: '星星大师',   desc: '关卡挑战累计拿到 18 颗星',       test: s => s.stars >= 18 },
  { id: 'castle',  icon: '🏰', name: '城主大人',   desc: '通过第 8 关「城堡」',            test: s => s.castle >= 1 },
  { id: 'photo',   icon: '📷', name: '摄影师',     desc: '给作品拍一张照片',              test: s => s.photo >= 1 },
  { id: 'save3',   icon: '💾', name: '收藏家',     desc: '保存 3 个作品到作品架',          test: s => s.save >= 3 },
];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { }
}

// shapes / colors 是"一局内"的量，绝不跨局累加，因此不放进默认统计里，
// 也不写进存档（写进去的话，上一局的 6 种形状会带进新一局，开局就白送成就）
const BASE = { place: 0, mirror: 0, undo: 0, photo: 0, save: 0, stars: 0, castle: 0, heart: 0 };
let stats = { ...BASE };
let unlocked = {};
let onChange = null;   // main.js 注入：解锁时弹 toast / 语音

export function initAchievements() {
  const d = load();
  stats = { ...BASE, ...d.stats, shapes: 0, colors: 0 };
  unlocked = d.unlocked || {};
}

export function setAchievementNotify(fn) { onChange = fn; }


/** 解锁检测（内部） */
function check() {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (unlocked[a.id]) continue;
    if (a.test(stats)) {
      unlocked[a.id] = Date.now();
      changed = true;
      onChange && onChange(a);
    }
  }
  if (changed) {
    const { shapes, colors, ...persist } = stats;   // 局内计数不落盘
    save({ stats: persist, unlocked });
  }
}

/** 计数类事件：place / mirror / undo / photo / save / heart */
export function track(event, n = 1) {
  if (event in stats) {
    stats[event] += n;
    check();
  }
}

/** 用了某个形状（一局内去重计数） */
const shapeSet = new Set();
export function trackShape(shapeId) {
  shapeSet.add(shapeId);
  stats.shapes = Math.max(stats.shapes || 0, shapeSet.size);
  if (shapeId === 'heart') track('heart');
  check();
}

/** 用了某个颜色（一局内去重计数） */
const colorSet = new Set();
export function trackColor(colorId) {
  colorSet.add(colorId);
  stats.colors = Math.max(stats.colors || 0, colorSet.size);
  check();
}

/** 星数用"最高累计"语义：传入当前总星数 */
export function trackStars(total) {
  stats.stars = Math.max(stats.stars || 0, total);
  check();
}

export function trackCastleClear() { track('castle'); }

/** 新的一局（自由创作/新关卡）时重置一局内的去重集合与局内计数 */
export function resetSession() {
  shapeSet.clear();
  colorSet.clear();
  stats.shapes = 0;
  stats.colors = 0;
}

/** 渲染成就格子到指定容器（main.js 调用） */
export function renderAchievements(el) {
  el.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const got = !!unlocked[a.id];
    const d = document.createElement('div');
    d.className = 'ach-card' + (got ? ' got' : '');
    d.innerHTML = `<span class="ach-icon">${a.icon}</span><b>${a.name}</b><p>${a.desc}</p><i>${got ? '已达成 ✓' : '未达成'}</i>`;
    el.appendChild(d);
  }
}
