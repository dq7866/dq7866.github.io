/* ============================================================
   远缘嫁接：把两种不同物种接在一起，赌一个"不该存在的东西"
   ------------------------------------------------------------
   与杂交育种的区别：
   - 杂交：同种内两粒种子融合，追求活力与代数（稳定、可积累）
   - 嫁接：跨物种强行拼接，追求"突变产物"（高赔率、多数失败）

   科学依据：嫁接的本质是维管束能否对接，取决于形成层亲和性。
   同科植物亲和度高（番茄×茄子虽不在本作内，但番茄自嫁接可行）；
   跨科基本不亲和，但现实中确有烟草×番茄、向日葵×菊芋等远缘尝试，
   成功率极低却偶有奇迹——本作把这个"极低"具化成可感知的概率。

   失败有两种：
   - 不亲和：接穗直接枯死，损失接穗（扣钱扣种子）
   - 假活：接活了一段时间，某天突然萎蔫（扣更多钱）
   ============================================================ */

const GRAFT_COST = 120;          // 每台手术的基础场地费（比杂交贵，因为是实验性质）

/* 亲和度表：键为排序后的两物种 id 用 | 连接。
   未列出的组合走默认 0.05（几乎必败），这是远缘嫁接的常态。 */
const GRAFT_TABLE = {
  // ---- 同科：高亲和 ----
  'tomato|strawberry':   { aff: 0.42, name: '茄莓藤',   note: '同为蔷薇/茄科边缘，能接活但果实性状混沌' },
  'monarch|bee':         { aff: 0.30, name: '传粉双生', note: '同为昆虫，翼膜能融合，但代谢节奏对不上' },
  'frog|koi':            { aff: 0.34, name: '两栖鳞',   note: '同为水生变温动物，鳃与皮肤呼吸能互补' },
  'rabbit|bee':          { aff: 0.18, name: '绒毛蜂',   note: '哺乳的绒毛与昆虫蜡腺拼接，产物极不稳定' },
  'rabbit|mush':         { aff: 0.22, name: '菌绒',     note: '菌丝沿毛囊生长，形成会呼吸的绒毯' },
  'frog|rabbit':         { aff: 0.20, name: '湿绒',     note: '一湿一干，体表分泌物与毛皮互相排斥' },
  'sunflower|tomato':    { aff: 0.38, name: '向阳茄',   note: '同为双子叶草本，茎径接近，最经典的远缘尝试' },
  'sunflower|strawberry':{ aff: 0.36, name: '葵莓',     note: '花托与舌状花融合，结果期错位' },
  'strawberry|tomato':   { aff: 0.35, name: '莓茄果',   note: '浆果与穗状果共株，只结一种' },
  'koi|mush':            { aff: 0.12, name: '水菌',     note: '菌丝在水里几乎不长，靠鱼体黏液勉强存活' },
  'monarch|mush':        { aff: 0.09, name: '羽菌',     note: '菌丝侵占翅脉，翅膀会变厚变重' },
  'bee|mush':            { aff: 0.10, name: '蜜菌',     note: '菌丝吃蜂巢里的糖，长出甜味的菇' },
  'koi|bee':             { aff: 0.08, name: '鳞翅空',   note: '一个在水下、一个在空中，只有名义上的嫁接' },
  'sunflower|bee':       { aff: 0.26, name: '花蜂',     note: '蜂在花盘上筑巢，形成半共生结构' },
  'sunflower|monarch':   { aff: 0.24, name: '寄蝶葵',   note: '幼虫在葵茎里越冬，卵与花托同源' },
  // ---- 第二轮：卵生宠物 ----
  'duck|tortoise':       { aff: 0.30, name: '壳羽',     note: '一中空一甲壳，都是"卵里的东西"，钙代谢意外相容' },
  'duck|frog':           { aff: 0.28, name: '水陆双生', note: '同为水陆两栖的卵生者，皮膜与羽膜能部分对接' },
  'tortoise|koi':        { aff: 0.26, name: '甲鳞',     note: '盾片与鱼鳞同源（真皮骨化），嫁接处会形成硬环' },
  'silkworm|monarch':    { aff: 0.40, name: '双丝蝶',   note: '同为鳞翅目，丝腺与翅脉沟通顺畅，最接近同科' },
  'silkworm|bee':        { aff: 0.24, name: '丝蜜',     note: '丝腺与蜡腺并存，产出会拉丝的金色巢脾' },
  'owl|duck':            { aff: 0.20, name: '羽卵',     note: '同为卵生鸟，但一支退化了飞行、一支升华了它' },
  'owl|bee':             { aff: 0.16, name: '夜巡',     note: '羽盘与复眼拼接，能听见蜂翅的次声' },
  'owl|rabbit':          { aff: 0.14, name: '猎绒',     note: '捕食者与猎物的拼接，排斥反应极强但偶有奇迹' },
  'tortoise|mush':       { aff: 0.15, name: '甲菌',     note: '菌丝沿盾片缝隙生长，长出会移动的菌床' },
  // ---- 第三轮：家养宠物 ----
  'chicken|owl':         { aff: 0.32, name: '双禽',     note: '同为鸟纲，一支为产蛋选育、一支为捕猎选育，龙骨与羽序能对上' },
  'chicken|duck':        { aff: 0.36, name: '禽羽',     note: '同是卵生早成鸟，蹼与爪的发育程序只差几个开关' },
  'chicken|tortoise':    { aff: 0.22, name: '卵壳',     note: '都在硬壳里完成发育，钙代谢天然同源' },
  'chicken|silkworm':    { aff: 0.18, name: '羽丝',     note: '丝腺沿羽轴延伸，长出的羽毛会拉丝' },
  'chicken|monarch':     { aff: 0.16, name: '鳞羽',     note: '一个用鳞片盖翅、一个用羽毛盖身，覆盖方案倒是互通' },
  'dog|cat':             { aff: 0.34, name: '犬猫同体', note: '同为食肉目，消化道几乎一致——但行为回路互斥，会整天跟自己打架' },
  'dog|rabbit':          { aff: 0.30, name: '追影',     note: '捕食者与猎物的经典拼接，嗅觉与奔跑被同时放大' },
  'cat|rabbit':          { aff: 0.26, name: '跃绒',     note: '同样的后肢弹跳架构，结合处会形成额外的弹力筋' },
  'dog|owl':             { aff: 0.14, name: '夜猎',     note: '嗅觉与听觉接管同一条神经，产物会对着声音吠' },
  'cat|owl':             { aff: 0.20, name: '夜瞳',     note: '同为夜行捕食者，瞳孔开合机制高度一致，成功率意外的高' },
  'cat|bee':             { aff: 0.12, name: '绒刺',     note: '软毛与螫针拼接，产物极度敏感易怒' },
  'dog|bee':             { aff: 0.10, name: '猎锋',     note: '嗅觉系统与蜂的辨向系统互相干扰' },
  'cat|koi':             { aff: 0.16, name: '爪鳞',     note: '猫的反射速度与鱼的侧线感知耦合，能"摸到"水的振动' },
  'dog|mush':            { aff: 0.11, name: '菌犬',     note: '菌丝沿毛囊生长，长出会走动的菌落' },
  'chicken|sunflower':   { aff: 0.20, name: '葵禽',     note: '都在向阳处获得能量，叶片与羽翼能重叠生长' },
  'chicken|tomato':      { aff: 0.09, name: '苗禽',     note: '一株一禽，营养通路几乎不兼容' },
  'koi|jelly':           { aff: 0.22, name: '鲤蜃',     note: '同为静水滤食者，循环系统竟能共享同一股水流' },
  'frog|jelly':          { aff: 0.15, name: '蛙蜃',     note: '两栖皮肤与水母中胶层靠渗透压勉强握手' },
  'aloe|tomato':         { aff: 0.07, name: '昼夜之争', note: 'CAM 与 C3 的气孔时序完全相反，维管束整夜打架' },
  'aloe|sunflower':      { aff: 0.12, name: '旱葵',     note: '向日葵的热烈遇上芦荟的克制，长成抗旱的怪东西' },
  'jelly|aloe':          { aff: 0.04, name: '陆海之隔', note: '一个 95% 是水，一个 90% 是纤维——几乎不可能' }
};

// 接穗/砧木的方向性：给不同组合加一点非对称收益，让"谁接在谁身上"有意义
const GRAFT_DIR = {
  tomato: { asScion: 1.05, asStock: 0.95 },   // 番茄当接穗更好（地上部分性状强势）
  sunflower: { asScion: 1.0, asStock: 1.1 },  // 向日葵当砧木根系更强
  frog: { asScion: 0.92, asStock: 1.12 },     // 蛙当砧木（水环境承载）
  koi: { asScion: 1.08, asStock: 0.9 },
  rabbit: { asScion: 1.1, asStock: 0.88 },
  bee: { asScion: 0.86, asStock: 1.05 },
  mush: { asScion: 1.0, asStock: 1.0 },
  duck: { asScion: 1.02, asStock: 1.05 },      // 鸭当砧：体温高、循环强
  tortoise: { asScion: 1.12, asStock: 0.86 },  // 龟当穗：甲壳耐受强，当砧则代谢太慢
  silkworm: { asScion: 1.0, asStock: 1.08 },   // 蚕当砧：丝腺供给营养
  owl: { asScion: 0.9, asStock: 1.1 },         // 鸮当砧：体型与循环占优
  chicken: { asScion: 0.94, asStock: 1.08 },   // 鸡当砧：代谢旺、供血足
  dog: { asScion: 0.88, asStock: 1.15 },       // 狗当砧：体型与循环最强，当穗则排异剧烈
  cat: { asScion: 1.05, asStock: 0.92 },       // 猫当穗：反射与神经整合好，当砧太挑剔
  aloe: { asScion: 1.05, asStock: 0.9 },       // 芦荟当穗：凝胶储运营养，当砧则供水太慢
  jelly: { asScion: 0.85, asStock: 1.1 }       // 水母当砧：水体承载强，当穗则结构撑不住
};

function graftKey(a, b) {
  return [a, b].sort().join('|');
}

function graftProfile(a, b) {
  const row = GRAFT_TABLE[graftKey(a, b)];
  if (row) return row;
  return { aff: 0.05, name: '未知组合', note: '亲和性极低，几乎必然枯死——但有些东西只在不可能里长出来' };
}

/* 实际成功率：亲和度 × 方向修正 × 状态修正
   - 代数越高越难（远缘嫁接对遗传背景敏感）
   - 物种活力越高越容易（vig 是种子活力）
   - 冬季成功率再打八折（形成层活动弱） */
function graftOdds(a, b, vigA, vigB) {
  const prof = graftProfile(a, b);
  const dirA = (GRAFT_DIR[a] && GRAFT_DIR[a].asStock) || 1;
  const dirB = (GRAFT_DIR[b] && GRAFT_DIR[b].asScion) || 1;
  const dir = (dirA + dirB) / 2;
  const vigBonus = Math.max(0, (vigA + vigB) / 2) * 0.012;
  const season = (typeof seasonForDay === 'function' && S && seasonForDay(S.day).key === 'winter') ? 0.8 : 1;
  const p = Math.min(0.92, Math.max(0.02, prof.aff * dir * season + vigBonus));
  return { p, prof, dir };
}

/* 执行嫁接。返回结果对象，调用方负责扣费、写档、弹窗。
   结果类型：
   - take   ：接活，得到"嫁接体"种质（品质上浮、活力提升）
   - false  ：假活，接活一小段时间后萎蔫（再多扣一笔）
   - fail   ：不亲和，接穗直接枯死
*/
function doGraft(a, b, rnd) {
  const r = (typeof rnd === 'function') ? rnd : Math.random;
  const seedA = seedList(a)[0] || { vig: 0, gen: 1 };
  const seedB = seedList(b)[0] || { vig: 0, gen: 1 };
  const { p, prof, dir } = graftOdds(a, b, seedA.vig, seedB.vig);
  const roll = r();
  if (roll < p) {
    // 接活：活力取双亲均值上浮，远缘优势更大但波动也大
    const base = ((seedA.vig || 0) + (seedB.vig || 0)) / 2;
    const boost = 2.2 + r() * 3.4;            // 远缘杂种优势高于同种杂交
    const mut = r() < 0.22 ? (r() < 0.5 ? 8 : -6) : 0;
    const vig = Math.max(VIG_MIN, Math.min(VIG_MAX, +(base + boost + mut).toFixed(1)));
    return {
      kind: 'take', prof, p,
      vig, gen: Math.max(seedA.gen || 1, seedB.gen || 1),
      bonus: { yield: +(1.15 + r() * 0.45).toFixed(2), price: +(1.2 + r() * 0.6).toFixed(2) },
      host: a, scion: b
    };
  }
  // 一成的失败是"假活"——更贵，因为它骗了你
  if (r() < 0.34) return { kind: 'false', prof, p };
  return { kind: 'fail', prof, p };
}

/* 嫁接体：存在 S.grafts 里，是独立于普通种质的一类"变异种"
   结构 { id, host, scion, name, vig, gen, bonus, day, tag } */
function graftStore(st) {
  if (!Array.isArray(st.grafts)) st.grafts = [];
  return st.grafts;
}

// 成功的嫁接体可以直接播到培育位，长出来的就是"嫁接体"形态
function plantGraft(st, graftId, slotId) {
  const g = graftStore(st).find(x => x.id === graftId);
  if (!g) return null;
  const plot = newPlot(g.host);
  plot.graft = { id: g.id, name: g.name, host: g.host, scion: g.scion, bonus: g.bonus };
  plot.vig = g.vig;
  plot.gen = g.gen;
  plot.hybridName = g.name;
  return plot;
}

/* 嫁接体的市场溢价：比同品质普通货贵 20%–80%，
   但只有"懂行"的客户（育种研究所、自然课堂）会收，市集不认。 */
function graftPremium(st, speciesId) {
  if (!Array.isArray(st.grafts)) return 0;
  const g = st.grafts.find(x => x.host === speciesId);
  return g ? (g.bonus.price || 1) : 0;
}

// 图鉴用的嫁接体清单（按名称去重）
function graftCodex(st) {
  const seen = new Set();
  return graftStore(st)
    .filter(g => { if (seen.has(g.name)) return false; seen.add(g.name); return true; })
    .slice(0, 24);
}
