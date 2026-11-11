/* ============================================================
   Nature Lab · 引擎
   环境模拟 / 生长曲线 / 病害 / 收获 / 繁殖循环 / 存档
   ============================================================ */

const SAVE_VERSION = 2;          // 存档结构版本：v1→v2 见 MIGRATIONS
const LEGACY_SAVE_KEY = 'naturelab.save.v1';
// 所有存储键必须经过档案命名空间：account.js 会比本文件先加载
const _storeKey = (typeof storeKey === 'function') ? storeKey : (n => 'naturelab.' + n);
const SAVE_KEY = _storeKey('save.v1');

const DEFAULT_STATE = () => ({
  version: SAVE_VERSION,
  day: 1,
  clock: 0,            // 0..24 小时
  running: true,
  speed: 1,            // 1x 2x 4x
  coins: 120,
  xp: 0,
  level: 1,
  slots: [
    { id: 1, unlocked: true,  speciesId: null, plot: null },
    { id: 2, unlocked: false, speciesId: null, plot: null, price: 180 },
    { id: 3, unlocked: false, speciesId: null, plot: null, price: 360 },
    { id: 4, unlocked: false, speciesId: null, plot: null, price: 620 }
  ],
  inventory: { tomato: 3, strawberry: 2, sunflower: 2, monarch: 1, frog: 1, koi: 0, rabbit: 1, bee: 0, mush: 2 },
  fridge: { tomato: [], strawberry: [], sunflower: [], monarch: [], frog: [], koi: [] }, // 收获仓（按品质分批）
  codex: {},           // 物种 -> { seen:[stageKey], harvested:n, failed:n, best:质量最高分 }
  records: [],         // 培育档案：每一轮的完整履历
  log: [],
  stats: { rounds: 0, success: 0, failed: 0, bestQ: 0, totalEarn: 0,
           grafts: 0, graftTake: 0, graftFail: 0, graftFalse: 0 },
  grafts: [],       // 嫁接体库（远缘嫁接的产物）
  achv: {},            // 成就 -> 解锁日
  orders: [],          // 进行中的订单
  upgrades: {},        // 温室改造等级
  devices: {},         // 每个槽位的设备状态
  daily: {}            // 每日目标：{ d<day>: { list:[], bonus:false } }
});

// 新建一个培育体
// strain: { gen, vig } —— 母本信息； vig 为活力加成（-6..+12），来自上一代品质与突变
function newPlot(speciesId, strain) {
  const sp = SPECIES[speciesId];
  const st = strain || { gen: 1, vig: 0 };
  return {
    speciesId,
    gen: st.gen || 1,
    vig: st.vig || 0,
    stage: 0,
    progress: 0,          // 当前阶段 0..1
    age: 0,               // 培育总天数
    health: 100,
    stress: 0,            // 累积胁迫
    disease: null,
    diseaseTimer: 0,
    diseaseDays: 0,
    watered: true,
    fertilized: { N: 40, P: 40, K: 40 },
    status: 'growing',    // growing | ready | dead | wilting
    history: [],          // 生命曲线数据
    lastScore: 100,
    bornDay: 1,
    events: [],
    settings: {},       // 玩家设定的温/湿/光/酸化
    devices: { lamp: false, heater: false, fan: false, shade: false, spray: false },
    pond: sp.habitat === 'water' ? { do: 6.6, ammonia: 0.12, clarity: 78, days: 0 } : null,
    minHp: 100
  };
}

// ---------- 池塘水质推演 ----------
// 溶氧被"生物耗氧"拉低、被增氧泵与藻类抬升；氨氮由残饵与排泄累积、被过滤与换水清除。
// 设计意图：静置不管会缓慢恶化，逼迫玩家周期性打理，而不是调好一次放到底。
const POND_TARGET = { do: [6.0, 9.5], ammonia: [0, 0.25] };
const _cl = (v, a, b) => Math.max(a, Math.min(b, v));

function pondTick(plot, sp, n) {
  if (!plot.pond) plot.pond = { do: 6.6, ammonia: 0.12, clarity: 78, days: 0 };
  const P = plot.pond;
  const w = baseWeather();
  const stageK = 1 + plot.stage * 0.22;                 // 越大越耗氧、排氨越多
  const biom = stageK * (1 + (plot.fertilized.N > 70 ? 0.25 : 0));  // 投喂过量会加重污染
  const hot = w.key === 'hot' ? 1.5 : w.key === 'cold' ? 0.6 : 1;
  // 溶氧扣减按"已开设备之后"的富余量算：泵开得越大，同样一池鱼消耗掉的绝对值越多
  // 否则设备加成会被固定扣减直接吃掉，玩家会觉得"开了没效果"
  const lvP = plot.autoEff && typeof plot.autoEff === 'object' ? plot.autoEff.do : 1;
  const aeroLvl = (plot.devices && plot.devices.aerator) ? (lvP > 1 ? 2 : 1) : 0;
  const doReal = P.do + aeroLvl * DEVICE_EFFECT.aerator.do;   // 池内实际溶氧
  const night = S.clock < 6 || S.clock > 19;
  const photo = night ? 0 : 1.1;
  // 耗氧 = 基础代谢（与溶氧无关）+ 呼吸项（随溶氧线性上升）
  // 这样低溶氧时鱼会憋着降低代谢，曲线能自己收敛到平衡点，不会一路穿零
  const consume = biom * (0.40 + doReal * 0.018);
  let dDo = (0.24 * hot + photo * 0.42 - consume) * n;
  if (P.do < 4.2) dDo += (4.2 - P.do) * 0.35 * n;    // 水面复氧托底，避免直接归零
  if (aeroLvl) dDo += aeroLvl * 0.7 * n - (doReal - 8.2) * 0.3 * n;   // 泵把溶氧往 8.2 推（区间中位偏上）
  // 氨氮：累积 − 自然硝化（浓度越高硝化越快，因此不会无限累积）
  let dAm = (biom * 0.032 - 0.004 - P.ammonia * 0.09) * n;
  P.do = _cl(P.do + dDo, 1.2, 12);
  P.ammonia = _cl(P.ammonia + dAm, 0, 3);
  // 浊度：残饵与藻类堆积，换水/过滤改善
  P.clarity = _cl((P.clarity || 78) + (biom > 1.2 ? -1.8 : 0.4) * n, 20, 100);
  P.days = (P.days || 0) + n;
  return P;
}

// 依据物种与阶段计算"当前理想环境"
// 池水的 pH 与陆地土壤不是一回事：水体靠碳酸盐缓冲，同一片区域常年稳定在 7.2–7.8
// 若沿用地基土壤 pH（6.4）会让所有水生物种开局就"pH 不适"，这是典型的数值错配
const POND_PH = 7.35;
// 各栖息地的稳定 pH（与 ui.js 的 HAB_PH 保持一致，用于自动调控反解目标）
const ENGINE_HAB_PH = { water: POND_PH, land: 6.9, hive: 6.6, dark: 6.0 };

function targetEnv(sp, stageIdx) {
  const e = sp.env;
  const mid = arr => (arr[0] + arr[1]) / 2;
  // 幼苗/幼虫期偏暖湿，结果/变态期略干
  // 阶段偏移只有 5 档，但物种阶段数不都是 5（鸡是 6）——按比例映射到最近的一档
  const SHIFTS = [0, 0.4, 0.2, 0, -0.3];
  const sIdx = Math.min(SHIFTS.length - 1, Math.round((stageIdx / Math.max(1, sp.stages.length - 1)) * (SHIFTS.length - 1)));
  const shift = SHIFTS[sIdx];
  return {
    temp: mid(e.temp) + shift * 2,
    humid: mid(e.humid) + shift * 3,
    light: mid(e.light) + shift * 0.6,
    soilPH: ENGINE_HAB_PH[sp.habitat] !== undefined ? ENGINE_HAB_PH[sp.habitat] : mid(e.soilPH),
    water: mid(e.water) - (sp.habitat === 'water' ? 0 : shift * 6)
  };
}

// 单项适宜度 0..1（区间内 1，越界线性衰减）
function fitness(value, range, tol = 0.45) {
  const [lo, hi] = range;
  const span = Math.max(hi - lo, 0.001);
  if (value >= lo && value <= hi) return 1;
  const d = value < lo ? (lo - value) : (value - hi);
  const limit = span * tol * 2;
  return Math.max(0, 1 - d / limit);
}

// 含水维度的叫法随栖息地变化，底下的物理意义是同一个
const H2O_LABEL = { soil: '土壤含水', land: '垫料含水', hive: '巢内含水', dark: '菌床含水' };
// 同一栖息地住着不同物种，"菌床含水"用在蚕房上就是张冠李戴，按物种覆盖
const H2O_LABEL_SP = {
  duck: '水池水位', tortoise: '垫材含水', silkworm: '蚕座湿度', owl: '巢箱湿度',
  chicken: '饮水水位', dog: '饮水水位', cat: '饮水水位'
};

// 综合环境评分（0..100）与最短板
function evaluateEnv(sp, env, stageIdx) {
  const e = sp.env;
  const items = [
    { key: 'temp', name: '温度', v: env.temp, f: fitness(env.temp, e.temp), unit: '℃', range: e.temp },
    { key: 'humid', name: '湿度', v: env.humid, f: fitness(env.humid, e.humid), unit: '%', range: e.humid },
    { key: 'light', name: '光照', v: env.light, f: fitness(env.light, e.light), unit: 'h', range: e.light },
    { key: 'soilPH', name: 'pH', v: env.soilPH, f: fitness(env.soilPH, e.soilPH, 0.3), unit: '', range: e.soilPH }
  ];
  // 含水不区分陆/水：笼舍垫料含水、蜂箱内湿度、菌床含水都由同一维度表达，
  // 只是"含水"的称呼不同，数值语义一致，避免为每个栖息地造一套并行量表
  if (sp.habitat !== 'water') {
    items.push({ key: 'water', name: H2O_LABEL_SP[sp.id] || H2O_LABEL[sp.habitat] || '含水', v: env.water, f: fitness(env.water, e.water), unit: '%', range: e.water });
  }
  // 水生池：溶氧与氨氮是真正的命门，必须计入适生评分，否则"水质"只是装饰
  if (sp.habitat === 'water' && sp.water) {
    if (env.do !== undefined) items.push({ key: 'do', name: '溶氧', v: env.do, f: fitness(env.do, sp.water.do, 0.4), unit: '', range: sp.water.do });
    if (env.ammonia !== undefined) {
      // 氨氮是"越低越好"型指标：区间上限之外线性恶化，下限 0 永远合格
      const am = env.ammonia, hi = sp.water.ammonia[1];
      const af = am <= hi ? 1 : Math.max(0, 1 - (am - hi) / (hi * 2 + 0.15));
      items.push({ key: 'ammonia', name: '氨氮', v: am, f: af, unit: '', range: [0, hi], inverse: true });
    }
  }
  const worst = items.reduce((a, b) => (a.f < b.f ? a : b));
  // 加权：短板权重更高
  const avg = items.reduce((s, i) => s + i.f, 0) / items.length;
  const score = Math.round((avg * 0.55 + worst.f * 0.45) * 100);
  return { score, worst, items, avg, worstF: worst.f };
}

// 营养适宜度
function evaluateNutrition(sp, stageIdx, fert) {
  const need = sp.nutrition[Math.min(stageIdx, sp.nutrition.length - 1)];
  const dN = Math.abs(fert.N - need.N), dP = Math.abs(fert.P - need.P), dK = Math.abs(fert.K - need.K);
  const pen = (dN + dP + dK) / 3 / 100; // 0..1
  const score = Math.round(Math.max(0, 100 - pen * 130));
  return { score, need, deficit: { N: need.N - fert.N, P: need.P - fert.P, K: need.K - fert.K } };
}
// 设备对环境的修正（每个设备给出确定的调整量）
const DEVICE_EFFECT = {
  heater: { label: '加温器', icon: 'fire', temp: +4, cost: 0, tip: '温度 +4℃' },
  cooler: { label: '降温风扇', icon: 'wind', temp: -4, cost: 0, tip: '温度 −4℃' },
  humid:  { label: '加湿雾化', icon: 'drop', humid: +12, cost: 0, tip: '湿度 +12%' },
  dry:    { label: '除湿通风', icon: 'fan', humid: -12, cost: 0, tip: '湿度 −12%' },
  lamp:   { label: '补光灯', icon: 'sun', light: +3.5, cost: 0, tip: '光照 +3.5h' },
  shade:  { label: '遮阳网', icon: 'shade', light: -2.5, cost: 0, tip: '光照 −2.5h' },
  // ---- 池塘专属 ----
  aerator: { label: '增氧泵', icon: 'fan', do: +2.4, cost: 0, tip: '溶氧 +2.4mg/L', water: true },
  filter:  { label: '生态过滤', icon: 'recycle', ammonia: -0.22, cost: 0, tip: '氨氮 −0.22mg/L', water: true },
  change:  { label: '换水', icon: 'drop', ammonia: -0.35, do: +0.6, cost: 22, tip: '氨氮 −0.35、溶氧 +0.6，每次 22 币', water: true, once: true },
  canopy:  { label: '遮光棚', icon: 'shade', light: -2.0, temp: -1.5, cost: 0, tip: '光照 −2h、水温 −1.5℃', water: true }
};

// 把设备开关折算为环境增量
// lv 可为数字（全部维度同一档）或 { temp, humid, light }（各维度独立档位）
function deviceDelta(dev, lv) {
  const d = { temp: 0, humid: 0, light: 0, do: 0, ammonia: 0 };
  if (!dev) return d;
  const k = key => {
    if (typeof lv === 'number') return lv > 1 ? 2 : 1;
    if (lv && lv[key]) return lv[key] > 1 ? 2 : 1;
    return 1;
  };
  const kt = k('temp'), kh = k('humid'), kl = k('light'), kd = k('do'), ka = k('ammonia');
  if (dev.heater) d.temp += DEVICE_EFFECT.heater.temp * kt;
  if (dev.cooler) d.temp += DEVICE_EFFECT.cooler.temp * kt;
  if (dev.humid) d.humid += DEVICE_EFFECT.humid.humid * kh;
  if (dev.dry) d.humid += DEVICE_EFFECT.dry.humid * kh;
  if (dev.lamp) d.light += DEVICE_EFFECT.lamp.light * kl;
  if (dev.shade) d.light += DEVICE_EFFECT.shade.light * kl;
  // 池塘
  if (dev.aerator) d.do += DEVICE_EFFECT.aerator.do * kd;
  if (dev.filter) d.ammonia += DEVICE_EFFECT.filter.ammonia * ka;
  if (dev.change) { d.ammonia += DEVICE_EFFECT.change.ammonia; d.do += DEVICE_EFFECT.change.do; }
  if (dev.canopy) { d.light += DEVICE_EFFECT.canopy.light; d.temp += DEVICE_EFFECT.canopy.temp; }
  return d;
}

// 生成一条培育档案
function makeRecord(slot, plot, success) {
  const sp = SPECIES[plot.speciesId];
  return {
    id: Date.now() + '-' + slot.id,
    species: plot.speciesId,
    // 嫁接体记录自己的名字与亲本，档案里才能一眼看出"这不是普通番茄"
    name: plot.graft ? plot.graft.name : sp.name,
    graft: plot.graft ? { name: plot.graft.name, host: plot.graft.host, scion: plot.graft.scion } : null,
    success,
    quality: success ? plot.quality : 0,
    grade: success ? qualityGrade(plot.quality).rank : '—',
    days: plot.age,
    avgHp: Math.round((plot.history.length ? plot.history.reduce((a, b) => a + b, 0) / plot.history.length : plot.health)),
    minHp: Math.round(plot.minHp ?? plot.health),
    cause: success ? '' : (plot.deathCause || '环境不适'),
    peakStage: sp.stages[Math.min(plot.stage, sp.stages.length - 1)].name,
    when: S.day
  };
}

function computeQuality(plot, lastScore) {
  // 主因子：全程适生分均值（培育期间每一天的环境+营养综合表现）
  const avgFit = plot.fitN ? plot.fitSum / plot.fitN : (lastScore || plot.lastScore || 70);
  const h = plot.health;
  const minHp = plot.minHp ?? 100;
  let q = avgFit * 0.52 + h * 0.18 + minHp * 0.14 + (lastScore || plot.lastScore || 0) * 0.16;
  // 病害困扰天数扣分（最多 -15）
  if (plot.diseaseDays) q -= Math.min(15, plot.diseaseDays * 3.5);
  // 极端环境暴露扣分（最多 -12）
  if (plot.extremeDays) q -= Math.min(12, plot.extremeDays * 4);
  if (plot.disease) q -= 6;
  // 等级硬门槛：适生分均值不达标，品质封顶
  if (avgFit < 89) q = Math.min(q, 89);   // 进不了 S（S 需 ≥92）
  if (avgFit < 78) q = Math.min(q, 74);   // 进不了 A
  if (avgFit < 62) q = Math.min(q, 60);   // 进不了 B
  return Math.max(15, Math.min(100, Math.round(q)));
}

function qualityGrade(q) {
  if (q >= 92) return { label: 'S 特级', color: '#f6d365', rank: 'S' };
  if (q >= 80) return { label: 'A 优质', color: '#7ddc9b', rank: 'A' };
  if (q >= 66) return { label: 'B 合格', color: '#84c7ea', rank: 'B' };
  if (q >= 50) return { label: 'C 次品', color: '#e6b86a', rank: 'C' };
  return { label: 'D 劣质', color: '#e0796c', rank: 'D' };
}

// ---------- 成就系统 ----------
const ACHIEVEMENTS = [
  { id: 'first', reward: 60,   cat: 'grow', icon: 'sprout', name: '破土',        desc: '完成第一次收获',            prog: s => [s.stats.success || 0, 1, '次收获'], test: s => (s.stats.success || 0) >= 1 },
  { id: 'sRank', reward: 100, cat: 'quality',   icon: 'leaf',   name: '特级培育师',   desc: '收获一件 S 级产物',          test: s => (s.records || []).some(r => r.grade === 'S') },
  { id: 'ten', reward: 80,     cat: 'grow', icon: 'recycle',name: '十轮耕耘',    desc: '累计完成 10 轮培育（含失败）', prog: s => [s.stats.rounds || 0, 10, '轮'], test: s => (s.stats.rounds || 0) >= 10 },
  { id: 'rich', reward: 80,    cat: 'econ', icon: 'coin',   name: '小康培育所',   desc: '金币持有量达到 3000', prog: s => [s.coins, 3000, '币'], test: s => s.coins >= 3000 },
  { id: 'earn', reward: 120,    cat: 'econ', icon: 'coin',   name: '行家出手',    desc: '累计收入超过 10000 金币', prog: s => [Math.round(s.stats.totalEarn || 0), 10000, '币'], test: s => (s.stats.totalEarn || 0) >= 10000 },
  { id: 'full', reward: 80, cat: 'codex',    icon: 'book',   name: '读完一生',    desc: '任一物种解锁全部 5 个阶段',   test: s => Object.values(s.codex || {}).some(c => (c.seen || []).length >= 5) },
  { id: 'all25', reward: 120,   cat: 'codex', icon: 'book',   name: '万物生长',    desc: '图鉴累计解锁 25 个阶段', prog: s => [Object.values(s.codex || {}).reduce((a, c) => a + (c.seen || []).length, 0), 25, '阶段'], test: s => Object.values(s.codex || {}).reduce((a, c) => a + (c.seen || []).length, 0) >= 25 },
  { id: 'zero', reward: 100, cat: 'quality',    icon: 'basket', name: '零损失',      desc: '收获 5 次且从未培育失败',     test: s => (s.stats.success || 0) >= 5 && !(s.stats.failed) },
  { id: 'gen3', reward: 80,    cat: 'breed', icon: 'sprout', name: '第三代',      desc: '培育到第 3 代', prog: s => [Math.max(0, ...(s.slots || []).map(sl => sl.plot ? sl.plot.gen || 1 : 0)), 3, '代'], test: s => (s.slots || []).some(sl => sl.plot && (sl.plot.gen || 1) >= 3) },
  { id: 'elite', reward: 120, cat: 'breed',   icon: 'fire',   name: '优系诞生',    desc: '获得一株活力 ≥10 的优系',     test: s => (s.slots || []).some(sl => sl.plot && (sl.plot.vig || 0) >= 10) },
  { id: 'cross', reward: 120, cat: 'breed',   icon: 'flask',  name: '育种家',      desc: '完成一次杂交',              test: s => (s.inventory ? Object.values(s.inventory).some(v => Array.isArray(v) && v.some(x => x && x.cross)) : false) },
  { id: 'graft1', reward: 100,  cat: 'breed', icon: 'sprout', name: '越界者',      desc: '接活第一株远缘嫁接体',      test: s => (s.stats && (s.stats.graftTake || 0) >= 1) },
  { id: 'graft10', reward: 140, cat: 'breed', icon: 'sprout', name: '缝合匠',      desc: '累计完成 10 次嫁接实验',    prog: s => [(s.stats && s.stats.grafts) || 0, 10, '次'], test: s => (s.stats && (s.stats.grafts || 0)) >= 10 },
  { id: 'graft5', reward: 160,  cat: 'breed', icon: 'sprout', name: '造物者',      desc: '手中同时保有三株嫁接体',    prog: s => [(s.grafts || []).length, 3, '株'], test: s => (s.grafts || []).length >= 3 },
  { id: 'order1', reward: 60, cat: 'econ',  icon: 'coin',   name: '第一桶金',    desc: '完成第一笔订单',             test: s => (s.stats.orders || 0) >= 1 },
  { id: 'order10', reward: 120, cat: 'econ', icon: 'basket', name: '金牌供应',    desc: '累计完成 10 笔订单', prog: s => [s.stats.orders || 0, 10, '单'], test: s => (s.stats.orders || 0) >= 10 },
  { id: 'up1', reward: 80, cat: 'biz',     icon: 'fire',   name: '初装温室',    desc: '完成第一次温室改造',          test: s => Object.values(s.upgrades || {}).some(v => v > 0) },
  { id: 'upmax', reward: 140, cat: 'biz',   icon: 'sun',    name: '现代化温室',  desc: '任意一项改造达到满级',        test: s => Object.values(s.upgrades || {}).some(v => v >= 2) },
  { id: 'winter', reward: 120, cat: 'quality',  icon: 'snow',   name: '越冬者',      desc: '在冬季收获一次 A 级以上产物',   test: s => (s.records || []).some(r => { try { return r.success && (r.grade === 'S' || r.grade === 'A') && seasonForDay(r.when).key === 'winter'; } catch (e) { return false; } }) },
  { id: 'robot', reward: 200, cat: 'biz',   icon: 'recycle',name: '无人值守',    desc: '自动调控满级且照常收获一次 A 级以上', test: s => { if (!((s.upgrades || {}).auto >= 2)) return false; return (s.records || []).some(r => r.success && (r.grade === 'S' || r.grade === 'A')); } },
  { id: 'soilfix', reward: 80, cat: 'biz', icon: 'drop',   name: '休养生息',    desc: '完成一次翻耕改良',           test: s => (s.stats.tills || 0) >= 1 },
  { id: 'egg30', reward: 80, cat: 'pet', icon: 'egg',     name: '蛋筐渐满',    desc: '累计收蛋 30 枚',  prog: s => [(s.stats && s.stats.eggs) || 0, 30, '枚'], test: s => (s.stats && (s.stats.eggs || 0)) >= 30 },
  { id: 'egg100', reward: 160, cat: 'pet', icon: 'egg',    name: '养鸡专业户',  desc: '累计收蛋 100 枚', prog: s => [(s.stats && s.stats.eggs) || 0, 100, '枚'], test: s => (s.stats && (s.stats.eggs || 0)) >= 100 },
  { id: 'brood', reward: 80, cat: 'pet', icon: 'fire',    name: '抱窝观察员',  desc: '经历一次抱窝（并等它自己结束）', test: s => (s.stats && (s.stats.broody || 0)) >= 1 },
  { id: 'bond1', reward: 80, cat: 'pet', icon: 'paw',     name: '初次亲近',    desc: '任一宠物默契达到「亲近」档', test: s => (s.stats && (s.stats.bondMax || 0)) >= 58 },
  { id: 'bondFull', reward: 160, cat: 'pet', icon: 'paw',  name: '生死相托',    desc: '把一只宠物的默契养到满值', test: s => (s.stats && (s.stats.bondFull || 0)) >= 1 },
  { id: 'secondChance', reward: 160, cat: 'pet', icon: 'paw', name: '失而复得', desc: '出走的猫回来时把它接回来，并让默契重新到「亲近」', test: s => (s.stats && (s.stats.readopt || 0)) >= 1 && (s.stats.bondMax || 0) >= 58 },
  { id: 'evolve', reward: 260,  cat: 'codex', icon: 'recycle',name: '博物学家',    desc: '全部物种通晓里程碑',     prog: s => { if (typeof SPECIES_ORDER === 'undefined' || typeof mastered !== 'function') return [0, 1, '']; const n = SPECIES_ORDER.filter(id => mastered(s, id)).length; return [n, SPECIES_ORDER.length, '物种']; }, test: s => { if (typeof SPECIES_ORDER === 'undefined' || typeof mastered !== 'function') return false; return SPECIES_ORDER.every(id => mastered(s, id)); } }
];
function checkAchievements(st) {
  const got = [];
  ACHIEVEMENTS.forEach(a => {
    if (!st.achv[a.id]) {
      try { if (a.test(st)) { st.achv[a.id] = st.day; got.push(a); } } catch (e) {}
    }
  });
  return got;
}

function harvestValue(sp, quality) {
  const base = sp.yield.base;
  const mult = quality / 100;
  return { amount: Math.max(1, Math.round(base * (0.5 + mult * 0.9))), coins: Math.round(34 + base * 34 * Math.pow(mult, 1.6)) };
}

// 种子定价：必须与 harvestValue 联动，否则会出现"种子比收成还贵"的倒挂。
// 难度越高利润率越高（简单物种保底能养活自己，困难物种打好了回报显著）。
const SEED_MARGIN = { 1: 0.30, 2: 0.55, 3: 0.95, 4: 1.35 };
function seedPrice(sp) {
  const bB = harvestValue(sp, 75).coins;          // 以 B 级品质为定价基准
  const m = SEED_MARGIN[sp.difficulty] || 0.55;
  return Math.max(30, Math.min(220, Math.round(bB / (1 + m) / 5) * 5));
}

// ---------- 多代选育 ----------
// 活力 vig：优质母本的后代对环境更宽容（评分加成）且生长更快
// 活力值域：上限放宽到 30，让"持续选育"有长期回报而不是三代封顶；
// 下限 -8 防止负数雪球（触底后靠一代优质母本仍能拉回来）
const VIG_MAX = 30, VIG_MIN = -8;
function breedStrain(parent, quality, rnd) {
  const r = (typeof rnd === 'function') ? rnd : Math.random;
  const gen = (parent && parent.gen ? parent.gen : 0) + 1;
  // 遗传：母本活力衰减一半向下传递 + 本代表现决定新活力
  const inherit = (parent && parent.vig ? parent.vig : 0) * 0.62;   // 遗传占比提高，优质血统更值钱
  const fresh = (quality - 75) * 0.30;              // 75 分为中性，单代表现的影响收敛（避免一代定终身）
  let vig = inherit + fresh;
  // 突变：2% 大突变（±10），12% 小波动（±3）
  let mut = null;
  const roll = r();
  if (roll < 0.02) { const d = r() < 0.5 ? -10 : 10; vig += d; mut = { dir: d > 0 ? 'up' : 'down', d: Math.abs(d), big: true }; }
  else if (roll < 0.14) { const d = (r() * 6 - 3); vig += d; mut = { dir: d > 0 ? 'up' : 'down', d: Math.abs(d), big: false }; }
  // 回归拉力：极低的活力会被"稀释"回来（种群里总有更健康的个体），避免负数雪球
  if (vig < 0) vig = vig * 0.82;
  vig = Math.max(VIG_MIN, Math.min(VIG_MAX, Math.round(vig * 10) / 10));
  return { gen, vig, mut, inherit: Math.round(inherit * 10) / 10, fresh: Math.round(fresh * 10) / 10 };
}
// 活力转成评分加成与生长倍率
function vigBonus(vig) { return (vig || 0) * 0.55; }
function vigSpeed(vig) { return 1 + (vig || 0) * 0.012; }
function strainLabel(vig) {
  if (vig >= 9) return { t: '优系', c: '#f6d365' };
  if (vig >= 4) return { t: '良种', c: '#7ddc9b' };
  if (vig >= -2) return { t: '普通', c: '#9fb8a4' };
  return { t: '劣变', c: '#e0796c' };
}

// 环境模拟：加时间推进（天气+昼夜）

const WEATHERS = [
  { key: 'sunny',  name: '晴', icon: '☀️', tempBase: 24, humidBase: 58, phBase: 6.4, soilWater: 52, glyph: '晴' },
  { key: 'cloudy', name: '多云', icon: '⛅', tempBase: 21, humidBase: 66, phBase: 6.4, soilWater: 60, glyph: '云' },
  { key: 'rain',   name: '小雨', icon: '🌦️', tempBase: 18, humidBase: 84, phBase: 6.3, soilWater: 86, glyph: '雨' },
  { key: 'hot',    name: '闷热', icon: '🔥', tempBase: 32, humidBase: 72, phBase: 6.5, soilWater: 36, glyph: '热' },
  { key: 'cold',   name: '降温', icon: '❄️', tempBase: 11, humidBase: 74, phBase: 6.4, soilWater: 58, glyph: '寒' }
];

// 天气根据天数确定性演算（可复现）
// 季节会改写天气：冬季不会出现"闷热"，夏季不会出现"降温"
function weatherForDay(day) {
  const seq = [0, 1, 0, 2, 1, 0, 3, 0, 1, 4, 0, 1];
  let idx = seq[(day - 1) % seq.length];
  const sk = typeof seasonForDay === 'function' ? seasonForDay(day).key : null;
  if (sk === 'winter') {
    if (idx === 3) idx = 4;          // 闷热 → 降温
    else if (idx === 0) idx = 0;
  } else if (sk === 'summer') {
    if (idx === 4) idx = 2;          // 降温 → 小雨
  }
  return WEATHERS[idx];
}

const XP_PER_LEVEL = lv => Math.round(120 * Math.pow(1.45, lv - 1));

// 等级带来的实质解锁：不写进存档，由等级推导，便于随时调平衡
// 每一级都给"看得见"的东西，避免等级只是个数字
const LEVEL_UNLOCKS = {
  2:  { coin: 80,  text: '扩建培育位享 9 折' },
  3:  { coin: 120, text: '解锁「自然课堂」高阶订单说明' },
  4:  { coin: 160, text: '温室改造价格 95 折' },
  5:  { coin: 240, text: '解锁林蛙的选育数据面板' },
  6:  { coin: 300, text: '扩建培育位享 8 折' },
  8:  { coin: 420, text: '订单刷新费用减半' },
  10: { coin: 600, text: '温室改造价格 9 折' }
};

function levelPerk(st) {
  const lv = st.level || 1;
  return {
    slotDiscount: lv >= 6 ? 0.8 : lv >= 2 ? 0.9 : 1,
    upDiscount:   lv >= 10 ? 0.9 : lv >= 4 ? 0.95 : 1,
    refreshCost:  lv >= 8 ? 10 : 20
  };
}


function addLog(state, text, kind = 'info') {
  state.log.unshift({ d: state.day, t: text, k: kind });
  if (state.log.length > 60) state.log.pop();
}

// ---------- 多存档槽位 ----------
// 键名：naturelab.save.v1.slot1..3 存档本体；naturelab.save.v1.slots 存各槽摘要；
// naturelab.save.v1.slot 记当前槽位。旧的单存档键在首次加载时迁移进槽 1。
const SLOT_MAX = 3;
const SLOT_KEY = i => _storeKey(`save.v1.slot${i}`);
const SLOT_META = _storeKey('save.v1.slots');
const SLOT_CUR = _storeKey('save.v1.slot');
const backupKey = (slot, i) => _storeKey(`save.v1.bak${slot}_${i}`);
const backupDayKey = slot => _storeKey(`save.v1.bak${slot}_day`);
let CUR_SLOT = (() => {
  try {
    const n = parseInt(localStorage.getItem(SLOT_CUR) || '1', 10);
    return n >= 1 && n <= SLOT_MAX ? n : 1;
  } catch (e) { return 1; }
})();
function curSaveSlot() { return CUR_SLOT; }
function switchSaveSlot(n) {
  if (n < 1 || n > SLOT_MAX) return;
  CUR_SLOT = n;
  try { localStorage.setItem(SLOT_CUR, String(n)); } catch (e) {}
}
function slotSummaries() {
  try {
    const raw = JSON.parse(localStorage.getItem(SLOT_META) || 'null');
    if (raw && typeof raw === 'object') return raw;
  } catch (e) {}
  return {};
}
function writeSlotMeta(n, st) {
  try {
    const m = slotSummaries();
    m[n] = {
      day: st.day || 1, coins: st.coins || 0, level: st.level || 1,
      rounds: (st.stats && st.stats.rounds) || 0, when: Date.now(),
      empty: false
    };
    localStorage.setItem(SLOT_META, JSON.stringify(m));
  } catch (e) {}
}
function clearSlotMeta(n) {
  try {
    const m = slotSummaries();
    m[n] = { empty: true };
    localStorage.setItem(SLOT_META, JSON.stringify(m));
  } catch (e) {}
}

function saveGame(state) {
  try {
    localStorage.setItem(SLOT_KEY(CUR_SLOT), JSON.stringify(state));
    writeSlotMeta(CUR_SLOT, state);
    // 自动备份轮换：每 5 个游戏天滚动备份一份，每槽最多 3 份
    const lastDay = +(localStorage.getItem(backupDayKey(CUR_SLOT)) || 0);
    if ((state.day || 1) - lastDay >= 5) {
      for (let i = 3; i > 1; i--) {
        const prev = localStorage.getItem(backupKey(CUR_SLOT, i - 1));
        if (prev) localStorage.setItem(backupKey(CUR_SLOT, i), prev); else localStorage.removeItem(backupKey(CUR_SLOT, i));
      }
      localStorage.setItem(backupKey(CUR_SLOT, 1), JSON.stringify({ day: state.day, when: Date.now(), data: JSON.stringify(state) }));
      localStorage.setItem(backupDayKey(CUR_SLOT), String(state.day || 1));
    }
    return true;
  } catch (e) {
    // 写满 / 被浏览器禁用：交给上层给出可见提示，绝不静默丢进度
    try { if (typeof window.__nlOnSaveError === 'function') window.__nlOnSaveError(e); } catch (_) { }
    return false;
  }
}
// 备份摘要（按旧→新排列）
function listBackups(slot) {
  const out = [];
  for (let i = 3; i >= 1; i--) {
    try {
      const raw = localStorage.getItem(backupKey(slot, i));
      if (!raw) continue;
      const b = JSON.parse(raw);
      const st = JSON.parse(b.data);
      out.push({ idx: i, day: b.day, when: b.when, coins: st.coins || 0, records: (st.records || []).length });
    } catch (e) { }
  }
  return out;
}
function restoreBackup(slot, idx) {
  try {
    const raw = localStorage.getItem(backupKey(slot, idx));
    if (!raw) return false;
    const b = JSON.parse(raw);
    localStorage.setItem(SLOT_KEY(slot), b.data);
    const st = JSON.parse(b.data);
    writeSlotMeta(slot, st);
    return true;
  } catch (e) { return false; }
}
/* ---------------- 存档版本迁移 ----------------
   每级迁移只做"结构升级"，字段兜底仍由 loadGame 负责。
   新增结构时：SAVE_VERSION += 1，并在 MIGRATIONS 里补一条 from→to。 */
const MIGRATIONS = {
  // v1 → v2：手账/图鉴/嫁接/客户熟客度等字段是后来加的，旧档缺，这里补默认值；
  //           同时把 plot 上已废弃的 settings 绝对值清掉（现为相对偏移）
  1: (s) => {
    if (!s.quests) s.quests = { done: {}, chapters: {} };
    if (!s.codex) s.codex = {};
    if (!Array.isArray(s.grafts)) s.grafts = [];
    if (!s.stats) s.stats = { rounds: 0, success: 0, failed: 0, bestQ: 0, totalEarn: 0 };
    if (!s.stats.clientRep) s.stats.clientRep = {};
    if (!s.stats.bondSp) s.stats.bondSp = {};
    (s.slots || []).forEach(sl => {
      const p = sl.plot;
      if (p && p.settings && (p.settings.temp !== undefined || p.settings.humid !== undefined || p.settings.light !== undefined)) {
        p.settings = {};
      }
    });
    s.version = 2;
    return s;
  }
};

function migrateSave(s) {
  if (!s || typeof s.version !== 'number') return false;
  let v = s.version;
  let guard = 0;
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn || guard++ > 20) return false;
    try { s = fn(s) || s; } catch (e) { return false; }
    if (s.version <= v) return false;   // 迁移没推进版本号 = 写错了，拒绝继续
    v = s.version;
  }
  return v === SAVE_VERSION;
}

// 存档结构校验：导入、加载、备份回滚都走这一道，避免半截数据把游戏打崩。
function validateSaveShape(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  if (typeof s.version !== 'number' || s.version > SAVE_VERSION) return false;
  if (!Array.isArray(s.slots) || s.slots.length < 1 || s.slots.length > 8) return false;
  if (!isFinite(s.day) || s.day < 1) return false;
  if (!isFinite(s.coins)) return false;
  if (s.records && !Array.isArray(s.records)) return false;
  if (s.log && !Array.isArray(s.log)) return false;
  if (s.inventory && typeof s.inventory !== 'object') return false;
  if (s.fridge && typeof s.fridge !== 'object') return false;
  return true;
}

// 把一份原始存档补齐默认字段；结构不对时返回 null
function normalizeLoadedSave(s) {
  if (!validateSaveShape(s)) return null;
  if (!migrateSave(s)) return null;
  if (!s.achv) s.achv = {};
  if (!s.orders) s.orders = [];
  if (!s.upgrades) s.upgrades = {};
  (s.slots || []).forEach(sl => {
    const p = sl.plot;
    if (p && p.settings && (p.settings.temp !== undefined || p.settings.humid !== undefined || p.settings.light !== undefined)) {
      p.settings = {};
    }
    if (p && SPECIES[p.speciesId] && SPECIES[p.speciesId].habitat === 'water' && !p.pond) {
      p.pond = { do: 6.6, ammonia: 0.12, clarity: 78, days: 0 };
    }
  });
  if (!s.inventory) s.inventory = {};
  if (!s.fridge) s.fridge = {};
  if (!s.codex) s.codex = {};
  SPECIES_ORDER.forEach(id => {
    if (s.inventory[id] === undefined) s.inventory[id] = 0;
    if (!Array.isArray(s.fridge[id])) s.fridge[id] = [];
  });
  if (!s.stats) s.stats = { rounds: 0, success: 0, failed: 0, bestQ: 0, totalEarn: 0 };
  if (!Array.isArray(s.grafts)) s.grafts = [];
  ['grafts', 'graftTake', 'graftFail', 'graftFalse'].forEach(k => {
    if (s.stats[k] === undefined) s.stats[k] = 0;
  });
  return s;
}

// 损坏存档先隔离再清主键：用户还有机会在控制台/数据面板里找回原文
function quarantineCorrupt(raw) {
  try {
    if (raw && raw.length < 2 * 1024 * 1024) {
      localStorage.setItem(_storeKey('save.v1.corrupt'), JSON.stringify({ when: Date.now(), slot: CUR_SLOT, raw: raw }));
      window.__nlCorrupt = { slot: CUR_SLOT, when: Date.now() };
    }
  } catch (e) { }
  try { localStorage.removeItem(SLOT_KEY(CUR_SLOT)); } catch (e) { }
}

function loadGame() {
  let raw = null;
  try {
    // 旧版单存档迁移：只迁一次（迁完保留旧键，用户回滚旧代码也不丢档）
    const single = localStorage.getItem(LEGACY_SAVE_KEY) || localStorage.getItem(SAVE_KEY);
    if (CUR_SLOT === 1 && !localStorage.getItem(SLOT_KEY(1)) && single) {
      raw = single;
      try { localStorage.setItem(SLOT_KEY(1), raw); } catch (e) { }
    } else {
      raw = localStorage.getItem(SLOT_KEY(CUR_SLOT));
    }
  } catch (e) { return null; }

  if (raw) {
    try {
      const s = JSON.parse(raw);
      const ok = normalizeLoadedSave(s);
      if (ok) return ok;
    } catch (e) { }
    quarantineCorrupt(raw);
  }

  // 主档缺失/损坏：按 1→3 由新到旧尝试备份，避免直接开新档把旧进度覆盖掉
  for (let i = 1; i <= 3; i++) {
    try {
      const braw = localStorage.getItem(backupKey(CUR_SLOT, i));
      if (!braw) continue;
      const b = JSON.parse(braw);
      const s = JSON.parse(b.data);
      const ok = normalizeLoadedSave(s);
      if (ok) {
        window.__nlRecovered = { slot: CUR_SLOT, day: b.day, when: b.when };
        try { localStorage.setItem(SLOT_KEY(CUR_SLOT), b.data); } catch (e) { }
        return ok;
      }
    } catch (e) { }
  }
  return null;
}
function resetGame() {
  try { localStorage.removeItem(SLOT_KEY(CUR_SLOT)); } catch (e) {}
  clearSlotMeta(CUR_SLOT);
}
// 删除任意槽位（含摘要）；不能删除正在玩的槽——先切走再删
function eraseSlot(n) {
  if (n === CUR_SLOT) return false;
  try { localStorage.removeItem(SLOT_KEY(n)); } catch (e) {}
  clearSlotMeta(n);
  return true;
}
// 在指定槽位上写一份"新开局"（不切换过去，由调用方决定是否切换）
function primeSlot(n) {
  try { localStorage.removeItem(SLOT_KEY(n)); } catch (e) {}
  clearSlotMeta(n);
}
