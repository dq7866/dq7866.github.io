/* 订单系统：甲方指定物种 / 最低品质 / 代数，按品质溢价收购 */

// 与收获仓同一套定价基准（fridgeUnitPrice 在 ui.js 中），这里只提供系数
const ORDER_MAX = 3;          // 同时挂出的订单数量
const ORDER_TTL = 12;         // 订单有效期（游戏天）

const CLIENTS = [
  { id: 'market', name: '社区市集', mult: 1.15, strict: 0,  note: '走量，品质过得去就行' },
  { id: 'school', name: '自然课堂', mult: 1.40, strict: 66, note: '教学展示，B 级以上' },
  { id: 'hotel',  name: '湖畔餐厅', mult: 1.65, strict: 80, note: '只要 A 级以上的鲜货' },
  { id: 'flora',  name: '花艺工作室', mult: 1.85, strict: 84, note: '花艺布展用，只收品相端正的' },
  { id: 'photo',  name: '摄影棚',   mult: 2.40, strict: 90, needGen: 3, note: '拍广告要上镜：S 级 + G3 以上种源' },
  { id: 'lab',    name: '育种研究所', mult: 2.10, strict: 88, needGen: 2, note: '高代高活力的种质' },
  // 中期补充：让"药用"和"活体展示"两条线各有专属买家，而不是所有客户都只看品质
  { id: 'herb',  name: '中药铺',   mult: 1.75, strict: 78, tag: 'medicinal',
    note: '要药用栽培：芦荟、鸡、蜂产品这些讲究有效成分' },
  { id: 'aqua',  name: '水族馆',   mult: 1.62, strict: 74, tag: 'aquatic',
    note: '活体展示：水生生物优先，状态好比个头更重要' }
];

const MEDICINAL = ['aloe', 'chicken', 'bee', 'mush'];

function orderRoll(rnd, day) {
  const r = typeof rnd === 'function' ? rnd : Math.random;
  const cl = CLIENTS[Math.floor(r() * CLIENTS.length)];
  // 旺季的物种更容易被下单（需求旺）
  const pool = [];
  SPECIES_ORDER.forEach(id => {
    const f = marketFactor(id, day || 1);
    let w = f > 1.2 ? 3 : f < 0.85 ? 1 : 2;
    // 带 tag 的客户只做本行生意：中药铺收药用，水族馆收水生
    if (cl.tag === 'medicinal') w = MEDICINAL.includes(id) ? w * 4 : 0;
    if (cl.tag === 'aquatic') w = SPECIES[id].habitat === 'water' ? w * 4 : 0;
    for (let i = 0; i < w; i++) pool.push(id);
  });
  if (!pool.length) {   // 兜底：tag 客户找不到货时退回普通池，避免死循环
    SPECIES_ORDER.forEach(id => pool.push(id));
  }
  const spId = pool[Math.floor(r() * pool.length)];
  const sp = SPECIES[spId];
  // 要求越严，数量越少
  const baseQty = cl.strict >= 88 ? 1 : cl.strict >= 80 ? 2 : 3;
  const qty = Math.max(1, Math.round(baseQty * (sp.yield.base >= 3 ? 2 : 1)));
  const minQ = Math.min(96, Math.max(cl.strict, 55) + Math.floor(r() * 7) - 2);
  const minGen = cl.needGen ? cl.needGen + Math.floor(r() * 2) : 0;
  // 每单位收购价直接锚定「散卖单价」，再乘客户倍率与品质溢价。
  // 早期版本用 (6 + base*4) 另起一套基数，导致订单与收获仓/市场价脱节：
  // 社区市集 44% 的订单比散卖还亏，摄影棚却高达散卖 8 倍。
  const scat = (typeof fridgeUnitPrice === 'function') ? fridgeUnitPrice(spId, minQ) : (6 + sp.yield.base * 4);
  const qualityBump = Math.pow(minQ / 78, 1.15);   // 品质要求越高越值钱，但指数收敛
  const bulk = Math.pow(qty, -0.22);               // 量越小越贵，幅度比早期版缓和
  const unit = scat * cl.mult * qualityBump * bulk;
  // 保底：任何订单都不该低于同品质散卖（订单是"锁定买家"，价值必须为正）
  const reward = Math.max(Math.round(unit * qty), Math.round(scat * qty * 1.05));
  return {
    id: 'o' + Date.now().toString(36) + Math.floor(r() * 1e4).toString(36),
    client: cl.id, species: spId, qty, minQ, minGen,
    unit: Math.round(unit), reward, expire: 0
  };
}

function makeOrders(st, rnd) {
  const list = (st.orders || []).filter(o => o.expire > st.day);
  let guard = 0;
  while (list.length < ORDER_MAX && guard++ < 60) {
    // 熟客有 30% 概率直接下连锁单（占一个订单位）
    const c = (list.length < ORDER_MAX - 0 && !list.some(x => x.chain)) && Math.random() < 0.30
      ? chainOrder(st, rnd) : null;
    const o = c || orderRoll(rnd, st.day);
    if (list.some(x => x.client === o.client && x.species === o.species)) continue;
    o.expire = st.day + ORDER_TTL;
    list.push(o);
  }
  st.orders = list;
  return list;
}

// 判断一批产物能否满足订单
function orderFit(order, speciesId, quality, amount) {
  if (order.species !== speciesId) return false;
  if (quality < order.minQ) return false;
  return amount >= order.qty;
}

function clientOf(id) { return CLIENTS.find(c => c.id === id) || CLIENTS[0]; }

/* ---------------- 熟客度与连锁单 ----------------
   同一客户累计交满 3 单 → 成为熟客（+8% 溢价），满 6 单 → 连锁客户（解锁连锁单）
   连锁单：同一物种一次 3 件、品质要求略低、价格更高——但必须一次交齐 */
const REP_TIERS = [
  { n: 3, name: '熟客', bonus: 0.08 },
  { n: 6, name: '连锁客户', bonus: 0.15 }
];

function clientRep(st, clientId) {
  return (st.stats && st.stats.clientRep && st.stats.clientRep[clientId]) || 0;
}

function repTier(st, clientId) {
  const n = clientRep(st, clientId);
  let t = null;
  REP_TIERS.forEach(r => { if (n >= r.n) t = r; });
  return t;
}

function bumpRep(st, clientId) {
  st.stats.clientRep = st.stats.clientRep || {};
  st.stats.clientRep[clientId] = (st.stats.clientRep[clientId] || 0) + 1;
  const before = st.stats.clientRep[clientId] - 1;
  const now = REP_TIERS.find(r => before < r.n && st.stats.clientRep[clientId] >= r.n);
  return now;
}

// 连锁单：只给熟客，数量固定 3，价格按 1.35 倍结算（比三笔散单更划算）
function chainOrder(st, rnd) {
  const r = (typeof rnd === 'function') ? rnd : Math.random;
  const vip = CLIENTS.filter(c => repTier(st, c.id));
  if (!vip.length) return null;
  const cl = vip[Math.floor(r() * vip.length)];
  const tier = repTier(st, cl.id);
  const pool = SPECIES_ORDER.filter(id => SPECIES[id].yield.base >= 2);
  const spId = pool[Math.floor(r() * pool.length)];
  const minQ = Math.max(55, cl.strict - 8);
  const qty = 3;
  // 与普通订单同一套基准（散卖单价），叠熟客加成与连锁单溢价
  const scat = (typeof fridgeUnitPrice === 'function') ? fridgeUnitPrice(spId, minQ) : (6 + SPECIES[spId].yield.base * 4);
  const unit = scat * cl.mult * (1 + tier.bonus) * Math.pow(minQ / 78, 1.15) * 1.30;
  const reward = Math.max(Math.round(unit * qty), Math.round(scat * qty * 1.12));
  return {
    id: 'c' + Date.now().toString(36) + Math.floor(r() * 1e4).toString(36),
    client: cl.id, species: spId, qty, minQ, minGen: 0,
    unit: Math.round(unit), reward, expire: 0, chain: true
  };
}
