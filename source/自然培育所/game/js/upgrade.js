/* 温室升级：用金币换取永久性的环境抗性与产能加成 */
// 每项 3 级，价格递增；effect 为每级带来的固定收益
const UPGRADES = [
  {
    id: 'insul', name: '保温层', icon: 'fire', max: 3,
    desc: '墙体加装隔热层，低温季节少掉温，设备在寒季也更耐用',
    cost: [140, 260, 400],
    // 每级：抵消 2℃ 季节温度压制 + 设备效率折扣减少 0.2
    effect: lv => ({ seasonTemp: lv * 2.6, devEff: lv * 0.1 }),
    tip: lv => lv ? `寒冷压制 −${(lv * 2.6).toFixed(1)}℃，设备效率 ${Math.min(110, Math.round((0.8 + lv * 0.1) * 100))}%` : '未加装'
  },
  {
    id: 'light', name: '补光系统', icon: 'sun', max: 3,
    desc: '顶部 LED 补光带，短日照季节自动补足光照',
    cost: [110, 210, 340],
    effect: lv => ({ seasonLight: lv * 0.8 }),
    tip: lv => lv ? `季节光照压制 −${(lv * 0.8).toFixed(1)}h` : '未安装'
  },
  {
    id: 'irrig', name: '滴灌网', icon: 'drop', max: 3,
    desc: '自动补水，减缓土壤蒸发，旱季不必频繁浇水',
    cost: [90, 170, 270],
    effect: lv => ({ waterSave: lv * 2.2, seasonWater: lv * 2 }),
    tip: lv => lv ? `每日少蒸发 ${(lv * 2.2).toFixed(1)}%，季节水分压制 −${lv * 2}` : '未铺设'
  },
  {
    id: 'vent', name: '通风降温', icon: 'wind', max: 2,
    desc: '侧窗与循环风机，夏季高温压制明显减弱',
    cost: [120, 240],
    effect: lv => ({ seasonHot: lv * 1.4 }),
    tip: lv => lv ? `夏季高温压制 −${(lv * 1.4).toFixed(1)}℃` : '未改造'
  },
  {
    id: 'auto', name: '自动调控', icon: 'recycle', max: 2,
    desc: '温湿度与光照按目标自动维持；运行要耗电，每槽位每天扣维护费，2 级起还能自动补水',
    cost: [360, 680],
    effect: lv => ({ autoLevel: lv, autoCost: lv * 4 }),
    tip: lv => lv === 0 ? '未安装' : lv === 1 ? `自动维持温/湿/光 · 每槽 ${lv * 4} 币/天` : `全部自动化（含补水）· 每槽 ${lv * 4} 币/天`
  },
  {
    id: 'yield', name: '育苗架', icon: 'sprout', max: 3,
    desc: '立体育苗架与营养液循环，提升单位产量',
    cost: [180, 280, 400],
    effect: lv => ({ yieldPct: lv * 0.18 }),
    tip: lv => lv ? `收获金币 +${Math.round(lv * 18)}%` : '未搭建'
  }
];

function upgradeLevel(st, id) { return (st.upgrades && st.upgrades[id]) || 0; }

// 汇总所有升级的实际加成
function upgradeBonus(st) {
  const out = { seasonTemp: 0, seasonLight: 0, seasonWater: 0, seasonHot: 0, devEff: 0, waterSave: 0, yieldPct: 0 };
  UPGRADES.forEach(u => {
    const lv = upgradeLevel(st, u.id);
    if (!lv) return;
    const e = u.effect(lv);
    Object.keys(e).forEach(k => { out[k] = (out[k] || 0) + e[k]; });
  });
  return out;
}

// 升级只用于"抵消压制"，绝不制造反向优势：
// 保温层只在寒冷季节把温度往上拉，且拉回不超过当天天气本身的水平。
function applySeasonResist(seasonMod, st) {
  const ub = upgradeBonus(st);
  const out = { temp: seasonMod.temp, humid: seasonMod.humid, light: seasonMod.light, water: seasonMod.water };
  // 寒冷压制：最多抵消掉压制本身
  if (out.temp < 0) out.temp = Math.min(0, out.temp + ub.seasonTemp);
  // 高温压制
  if (out.temp > 0) out.temp = Math.max(0, out.temp - ub.seasonHot);
  // 干燥
  if (out.humid < 0) out.humid = Math.min(0, out.humid + ub.seasonTemp * 0.6);
  if (out.light < 0) out.light = Math.min(0, out.light + ub.seasonLight);
  if (out.water < 0) out.water = Math.min(0, out.water + ub.seasonWater);
  return out;
}

function upgradeCost(st, id) {
  const u = UPGRADES.find(x => x.id === id);
  const lv = upgradeLevel(st, id);
  if (!u || lv >= u.max) return null;
  return u.cost[lv];
}
