/* 土壤疲劳与轮作
   设计目的：给"一直种同一种作物"设一个软上限，逼玩家轮作或投入修复成本。
   - 每个槽位记录最近几次种过的物种
   - 连作同一科系会累积疲劳，疲劳降低适生与产量、提高病害概率
   - 换物种（尤其换科）会自然恢复；休耕（空置）恢复更快
   - 可花金币"翻耕改良"立即清空疲劳 */
const SOIL_MAX = 100;          // 疲劳值上限
const SOIL_PER_REPEAT = 22;    // 同物种连作一次 +22
const SOIL_PER_SAME_FAMILY = 10; // 同科不同种 +10
const SOIL_DECAY_BARE = 26;    // 空置每天 -26
const SOIL_DECAY_CROP = 3;     // 有作物每天 -3（自然降解）

// 科属归类（用于判断"同科连作"）
const FAMILY = {
  tomato: 'solanaceae', strawberry: 'rosaceae', sunflower: 'asteraceae',
  monarch: 'nymphalidae', frog: 'ranidae',
  koi: 'cyprinidae', rabbit: 'leporidae', bee: 'apidae', mush: 'pleurotaceae',
  // 第二轮：卵生宠物
  duck: 'anatidae', tortoise: 'testudinidae', silkworm: 'bombycidae', owl: 'tytonidae',
  // 第三轮：家养宠物
  chicken: 'phasianidae', dog: 'canidae', cat: 'felidae'
};

function soilOf(st, slotId) {
  st.soil = st.soil || {};
  if (!st.soil[slotId]) st.soil[slotId] = { fatigue: 0, hist: [] };
  if (!Array.isArray(st.soil[slotId].hist)) st.soil[slotId].hist = [];
  return st.soil[slotId];
}

// 播种时结算连作疲劳
function applyCropRotation(st, slotId, speciesId) {
  const s = soilOf(st, slotId);
  const last = s.hist[s.hist.length - 1];
  let add = 0;
  if (last === speciesId) add = SOIL_PER_REPEAT;
  else if (last && FAMILY[last] && FAMILY[last] === FAMILY[speciesId]) add = SOIL_PER_SAME_FAMILY;
  s.fatigue = Math.min(SOIL_MAX, s.fatigue + add);
  s.hist.push(speciesId);
  if (s.hist.length > 6) s.hist.shift();
  return add;
}

// 每日结算：空置恢复更快
function tickSoil(st, n) {
  st.slots.forEach(sl => {
    const s = soilOf(st, sl.id);
    const rate = (sl.plot && sl.plot.status === 'growing') ? SOIL_DECAY_CROP : SOIL_DECAY_BARE;
    s.fatigue = Math.max(0, s.fatigue - rate * n);
  });
}

// 疲劳带来的负面影响（0..1 的比例）
function soilPenalty(st, slotId) {
  const f = soilOf(st, slotId).fatigue;
  return {
    env: f / SOIL_MAX * 0.16,      // 适生分最多 -16
    yield: f / SOIL_MAX * 0.30,    // 产量最多 -30%
    disease: f / SOIL_MAX * 0.18   // 病害概率最多 +18%
  };
}

const SOIL_STATES = [
  { max: 12, key: 'fresh',  name: '地力充沛', color: '#7ddc9b' },
  { max: 34, key: 'ok',     name: '正常',     color: '#a9c9a0' },
  { max: 58, key: 'tired',  name: '略显疲劳', color: '#e6b86a' },
  { max: 78, key: 'heavy',  name: '严重疲劳', color: '#e08f6c' },
  { max: 101, key: 'spent', name: '地力枯竭', color: '#e0796c' }
];
function soilState(f) {
  return SOIL_STATES.find(s => f < s.max) || SOIL_STATES[SOIL_STATES.length - 1];
}

// 翻耕改良价格：疲劳越高越贵
function soilFixCost(st, slotId) {
  const f = soilOf(st, slotId).fatigue;
  if (f < 8) return 0;
  return Math.round(30 + f * 1.6);
}

// 建议下茬种什么（给玩家明确指引）
function rotationHint(st, slotId) {
  const s = soilOf(st, slotId);
  const last = s.hist[s.hist.length - 1];
  const pool = SPECIES_ORDER.filter(id => id !== last);
  // 优先不同科且当前季节市价不差的作物
  const diffFamily = pool.filter(id => FAMILY[id] !== FAMILY[last]);
  const sameFam = pool.filter(id => FAMILY[id] === FAMILY[last]);
  const mf = id => (typeof marketFactor === 'function' ? marketFactor(id, st.day) : 1);
  const ranked = diffFamily.slice().sort((a, b) => mf(b) - mf(a));
  return { last, suggest: ranked.length ? ranked : sameFam };
}
