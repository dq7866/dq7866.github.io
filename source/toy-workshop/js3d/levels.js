/* ============================================================
 * levels.js — 难度参数的唯一来源
 * 大厅页签、游戏页规则、解锁判定都从这里取，避免多处写死。
 *
 * 兼容说明：1~3 档的参数与旧版 game.js / hall.js 完全一致
 *   easy : 吸附 1.15、有轮廓与目标圈、不打乱、不限时
 *   mid  : 吸附 0.80、有轮廓与目标圈、打乱、不限时
 *   hard : 吸附 0.55、无轮廓、目标圈延迟 7s、打乱、限时 210s
 * ============================================================ */

export const LEVEL_ORDER = [1, 2, 3, 4, 5];

export const MODE_OF_LEVEL = { 1: 'easy', 2: 'mid', 3: 'hard', 4: 'master', 5: 'grand' };
export const LEVEL_OF_MODE = { easy: 1, mid: 2, hard: 3, master: 4, grand: 5 };
export const LEVEL_NAME = { 1: '简单', 2: '中度', 3: '困难', 4: '大师', 5: '宗师' };

export const LEVELS = {
  1: {
    lv: 1, mode: 'easy', name: '简单', short: '少零件 · 有提示',
    desc: '只拆主要零件，吸附宽松、轮廓与目标圈常驻，零件架按顺序摆放。',
    tol: 1.15, shuffle: false, ghost: true, marker: true, markerDelay: 0,
    hints: Infinity, time: 0, maxMiss: 0, extraSteps: 0,
    twist: false, align: 0, xray: true,
    starRule: 'normal', scorePerMiss: 10, scorePerTime: 15
  },
  2: {
    lv: 2, mode: 'mid', name: '中度', short: '全零件 · 顺序严',
    desc: '零件全开，顺序更严格，拆下的零件会打乱放进零件架。',
    tol: 0.8, shuffle: true, ghost: true, marker: true, markerDelay: 0,
    hints: Infinity, time: 0, maxMiss: 0, extraSteps: 0,
    twist: false, align: 0, xray: true,
    starRule: 'normal', scorePerMiss: 10, scorePerTime: 15
  },
  3: {
    lv: 3, mode: 'hard', name: '困难', short: '精密件 · 限时计分',
    desc: '精密件与啮合件最多，无轮廓提示、吸附最准，限时 3 分 30 秒并计分。',
    tol: 0.55, shuffle: true, ghost: false, marker: false, markerDelay: 7000,
    hints: 0, time: 210, maxMiss: 0, extraSteps: 0,
    twist: false, align: 0, xray: false,
    starRule: 'normal', scorePerMiss: 10, scorePerTime: 8
  },
  4: {
    lv: 4, mode: 'master', name: '大师', short: '多件啮合 · 拧合对正',
    desc: '多件同时啮合，螺纹件要按住绕圈拧紧，部分零件必须转到背面视角才对得准榫眼；提示只有 3 次，限时 7 分钟。',
    tol: 0.42, shuffle: true, ghost: false, marker: false, markerDelay: 12000,
    hints: 3, time: 420, maxMiss: 8, extraSteps: 0,
    twist: true, align: 20, xray: false,
    starRule: 'timed', scorePerMiss: 12, scorePerTime: 7
  },
  5: {
    lv: 5, mode: 'grand', name: '宗师', short: '严格顺序 · 限步限时',
    desc: '角度容差最小、同时入榫件最多，提示只剩 1 次，失误 4 次或步数超限即判失败；限时 10 分钟，三星要求零失误且用时不超过 6 分钟。',
    tol: 0.3, shuffle: true, ghost: false, marker: false, markerDelay: 0,
    hints: 1, time: 600, maxMiss: 4, extraSteps: 6,
    twist: true, align: 12, xray: false,
    starRule: 'timed', scorePerMiss: 15, scorePerTime: 6
  }
};

/* 解锁条件：1~3 档默认全开，保持既有行为 */
export const UNLOCK_REQ = {
  1: { stars: 0, note: '默认开启' },
  2: { stars: 0, note: '默认开启' },
  3: { stars: 0, note: '默认开启' },
  4: { stars: 9, note: '累计 9 颗星后正式开启' },
  5: { stars: 15, masterClears: 1, note: '大师级通关 1 件且累计 15 颗星后正式开启' }
};

export function levelOfMode(mode) {
  return LEVEL_OF_MODE[mode] || 1;
}

export function modeOfLevel(lv) {
  return MODE_OF_LEVEL[lv] || 'easy';
}

export function paramsOf(lv) {
  return LEVELS[lv] || LEVELS[1];
}

/* 步数上限：拆 + 装各一次是保底量，再给一点容错 */
export function stepLimitOf(lv, partCount) {
  const p = paramsOf(lv);
  if (!p.extraSteps) return 0;
  return partCount * 2 + p.extraSteps;
}

/* 星级：1~3 档沿用旧规则；4~5 档叠加用时门槛 */
export function starsFor(lv, miss, secs) {
  const p = paramsOf(lv);
  if (p.starRule === 'timed') {
    const fast = secs <= Math.floor(p.time * 0.6);
    if (miss === 0 && fast) return 3;
    if (miss <= 2) return 2;
    return 1;
  }
  if (miss === 0) return 3;
  if (miss <= 2) return 2;
  return 1;
}

/* 得分：1~3 档与旧版公式一致 */
export function scoreFor(lv, miss, secs) {
  const p = paramsOf(lv);
  const penalty = Math.floor(secs / p.scorePerTime);
  return Math.max(10, Math.round(100 - miss * p.scorePerMiss - penalty));
}

/* 解锁状态：open 是否正式开启；未开启也可以试玩（trial） */
export function unlockState(lv, stats) {
  const req = UNLOCK_REQ[lv] || { stars: 0 };
  const stars = stats ? stats.totalStars || 0 : 0;
  const masterClears = stats && stats.clears ? stats.clears[4] || 0 : 0;
  const needMaster = req.masterClears || 0;
  const needStars = req.stars || 0;
  const cond = [
    needStars ? `累计 ${needStars} 星` : '',
    needMaster ? `大师级通关 ${needMaster} 件` : ''
  ].filter(Boolean).join(' + ') || '默认开启';
  if (lv <= 3) {
    return {
      open: true, trial: false, cond, text: req.note,
      cur: { stars, masterClears }, need: { stars: needStars, masterClears: needMaster },
      pct: 1, tip: ''
    };
  }
  const okStars = Math.min(stars, needStars);
  const okMaster = Math.min(masterClears, needMaster);
  const open = stars >= needStars && masterClears >= needMaster;
  const parts = [];
  if (needStars) parts.push(`累计 ${needStars} 星（当前 ${okStars}/${needStars}）`);
  if (needMaster) parts.push(`大师级通关 ${needMaster} 件（当前 ${okMaster}/${needMaster}）`);
  const raw = needMaster
    ? (needStars ? stars / needStars : 1) * 0.7 + masterClears / needMaster * 0.3
    : (needStars ? stars / needStars : 1);
  const pct = Math.min(1, Math.max(0, raw));
  return {
    open, trial: !open, cond, text: open ? '已解锁' : '还需：' + parts.join('，'),
    cur: { stars, masterClears }, need: { stars: needStars, masterClears: needMaster },
    pct: open ? 1 : Math.min(0.97, pct), tip: parts.join(' · ')
  };
}
