/* 每日目标：给玩家一个明确的"今天该做什么"，并给可观的周转奖励
   设计原则：
   - 目标必须由玩家行为达成，不做"在线时长"这类无意义指标
   - 奖励以金币/种子为主，避免直接给品质（那会破坏核心循环）
   - 每天 3 个，全部完成后给额外宝箱，鼓励一天打满 */
const TASK_POOL = [
  { id: 'water2',  name: '浇两次水',        desc: '任一培育位累计浇水 2 次',       need: 2, coin: 26, xp: 6 },
  { id: 'adjust3', name: '勤看环境',        desc: '打开培育位并调节环境 3 次',     need: 3, coin: 30, xp: 8 },
  { id: 'feed2',   name: '科学配肥',        desc: '配肥 2 次',                     need: 2, coin: 28, xp: 7 },
  { id: 'sell3',   name: '出货',            desc: '出售 3 批次产物',               need: 3, coin: 34, xp: 9 },
  { id: 'order1',  name: '接单交付',        desc: '完成 1 笔订单',                 need: 1, coin: 46, xp: 14 },
  { id: 'harvest1',name: '收获一轮',        desc: '收获 1 次（任意等级）',         need: 1, coin: 40, xp: 12 },
  { id: 'keep90',  name: '保持状态',        desc: '让任一培育位适生 ≥ 90 持续到次日', need: 1, coin: 32, xp: 8 },
  { id: 'cure1',   name: '及时防治',        desc: '处理 1 次病害',                 need: 1, coin: 24, xp: 6 },
  { id: 'dev2',    name: '设备调度',        desc: '开关设备 2 次',                 need: 2, coin: 20, xp: 5 },
  { id: 'graft',   name: '越界实验',        desc: '完成 1 次远缘嫁接（接活与否都算）', need: 1, coin: 52, xp: 18 },
  // ---- 宠物专属：only 条件过滤，没养对应宠物就不会抽到 ----
  { id: 'egg1',    name: '拾捡鸡蛋',        desc: '收一次蛋（养鸡时出现）',         need: 1, coin: 30, xp: 9, only: { species: 'chicken' } },
  { id: 'play1',   name: '陪伴时光',        desc: '陪狗或猫待一次（养它时出现）',   need: 1, coin: 26, xp: 8, only: { petKind: 'bond' } }
];

// 任务是否对当前玩家可用：宠物任务只在相应宠物"正在养"时进入抽取池
// （当天已生成的任务不重算——中途才开养的，第二天自然会刷出来）
function taskAvailable(t, st) {
  if (!t.only || !st) return true;
  const plots = (st.slots || []).filter(sl => sl.plot).map(sl => sl.plot);
  if (t.only.species) return plots.some(p => p.speciesId === t.only.species);
  if (t.only.petKind) return plots.some(p => {
    if (typeof petKindOf !== 'function') return false;
    const sp = SPECIES[p.speciesId];
    const k = petKindOf(sp);
    return k && k.kind === t.only.petKind;
  });
  return true;
}

function taskDayKey(day) { return 'd' + day; }

// 每天生成 3 个不重复目标（同一天内稳定）
function makeDailyTasks(day, rnd, st) {
  const r = typeof rnd === 'function' ? rnd : Math.random;
  const pool = TASK_POOL.filter(t => taskAvailable(t, st));
  const pick = [];
  while (pick.length < 3 && pool.length) {
    const i = Math.floor(r() * pool.length);
    pick.push(pool.splice(i, 1)[0]);
  }
  return pick.map(t => ({ id: t.id, name: t.name, desc: t.desc, need: t.need, coin: t.coin, xp: t.xp, prog: 0, done: false, got: false }));
}

function ensureDailyTasks(st) {
  st.daily = st.daily || {};
  const k = taskDayKey(st.day);
  if (!st.daily[k] || !Array.isArray(st.daily[k].list) || !st.daily[k].list.length) {
    st.daily[k] = { list: makeDailyTasks(st.day, null, st), bonus: false, fresh: true };
  }
  // 只保留最近 3 天（按天数数值排序，避免 d10 排在 d2 前面被误删）
  const keys = Object.keys(st.daily).sort((a, b) => (+a.slice(1)) - (+b.slice(1)));
  keys.slice(0, Math.max(0, keys.length - 3)).forEach(x => delete st.daily[x]);
  return st.daily[k];
}

// 打点：type 为 TASK_POOL 的 id（可带数值）
function progressTask(st, id, add) {
  const d = ensureDailyTasks(st);
  const t = d.list.find(x => x.id === id);
  if (!t || t.done) return null;
  t.prog = Math.min(t.need, t.prog + (add === undefined ? 1 : add));
  if (t.prog >= t.need) { t.done = true; return t; }
  return null;
}

function dailyAllDone(st) {
  const d = ensureDailyTasks(st);
  return d.list.every(t => t.done);
}
