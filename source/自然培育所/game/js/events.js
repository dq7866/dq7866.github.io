/* 随机事件：给每一天制造"也许会发生点什么"的期待与决策点
   原则：
   - 事件必须可理解、有明确选择，不做纯随机惩罚
   - 好事件略多于坏事件，避免挫败感
   - 每个事件 2-3 个选项，各有代价与收益，形成真实的取舍 */
const EVENT_POOL = [
  {
    id: 'gale', name: '狂风过境', icon: 'wind', weight: 8, minDay: 4,
    desc: '气象台预警今晚有大风。温室顶棚还撑得住，但连续补光的老旧线路有点悬。',
    opts: [
      { t: '加固顶棚，平安度过', cost: 60, eff: { log: '顶棚加固完成，什么也没发生。', toast: '平安度过' } },
      { t: '冒险照常运行 · 可能受损', cost: 0, eff: { loseHealth: 12, log: '大风掀掉一角棚膜，所有培育位健康 −12', toast: '棚膜受损' } }
    ]
  },
  {
    id: 'pest', name: '虫害预警', icon: 'warning', weight: 9, minDay: 3,
    desc: '附近农田爆发蚜虫，风向正朝你的温室。要不要提前布防？',
    opts: [
      { t: '全面喷洒，防住虫害', cost: 45, eff: { log: '预防性喷洒完成，虫害未侵入', toast: '防住了' } },
      { t: '只喷一处 · 其余可能染病', cost: 0, eff: { disease: 0.5, log: '只护住了一处，其余有概率染病', toast: '部分防护' } }
    ]
  },
  {
    id: 'rush', name: '客户加急', icon: 'coin', weight: 8, minDay: 5,
    desc: '一位老客户临时加急要货，愿意付更高的价格，但要求三天内交付。',
    opts: [
      { t: '接下加急单 · 三天内出货收益 ×2', cost: 0, eff: { rush: 3, log: '接下加急单，三天内出售收益翻倍', toast: '加急单已接' } },
      { t: '婉拒，保持节奏', cost: 0, eff: { log: '婉拒了这次加急，保持节奏', toast: '保持节奏' } }
    ]
  },
  {
    id: 'grant', name: '科研补助', icon: 'flask', weight: 5, minDay: 8,
    desc: '自然课堂看到你的培育记录，愿意资助一笔小微研究经费。',
    opts: [
      { t: '接受补助 · 收入 120 币', cost: 0, eff: { coin: 120, log: '收到科研补助 120 币', toast: '补助到账' } },
      { t: '换成良种 · 获得 G2 种子', cost: 0, eff: { seed: true, log: '用补助换成了一粒优质种子', toast: '获得良种' } }
    ]
  },
  {
    id: 'cold', name: '寒潮预警', icon: 'snow', weight: 7, minDay: 6,
    desc: '一股寒潮将在今晚抵达，气温会骤降。你有两个选择。',
    opts: [
      { t: '连夜加盖保温帘', cost: 80, eff: { log: '保温帘及时架好，寒潮没有造成损失', toast: '保温到位' } },
      { t: '硬扛 · 今夜降温 5℃', cost: 0, eff: { tempDrop: 5, log: '寒潮直接灌进温室，今夜气温额外 −5℃', toast: '寒潮来袭' } }
    ]
  },
  {
    id: 'market', name: '市集行情', icon: 'basket', weight: 6, minDay: 5,
    desc: '集市上传来消息：某类作物突然紧俏，价格一时走高。',
    opts: [
      { t: '立刻跟进出货 · 今日 +35%', cost: 0, eff: { priceBoost: 1.35, log: '抓住行情，今日出售价格 +35%', toast: '行情不错' } },
      { t: '按原计划，稳妥为上', cost: 0, eff: { log: '没有跟风，稳妥为上', toast: '' } }
    ]
  },
  {
    id: 'visitor', name: '同行来访', icon: 'leaf', weight: 6, minDay: 4,
    desc: '邻镇的老培育员路过，想看看你的温室，愿意交换一点经验。',
    opts: [
      { t: '请教经验 · 获得 60 经验', cost: 0, eff: { xp: 60, log: '与老培育员交流，获得 60 经验', toast: '学到不少' } },
      { t: '请他帮忙改进 · 下次改造 7 折', cost: 120, eff: { upgradeDiscount: true, log: '老培育员指出几处改进，下次改造 7 折', toast: '改进建议已记录' } }
    ]
  },
  {
    id: 'bloom', name: '花期惊喜', icon: 'sun', weight: 6, minDay: 3,
    desc: '一位来访的摄影师想拍摄你温室里最有生机的一株，愿意出价。',
    opts: [
      { t: '同意拍摄 · 收入 90 币', cost: 0, eff: { coin: 90, log: '拍摄合作完成，收入 90 币', toast: '合作愉快' } },
      { t: '让它安静生长 · 健康 +6', cost: 0, eff: { health: 6, log: '让植株安静生长，健康 +6', toast: '不打扰它' } }
    ]
  },
  {
    id: 'leak', name: '管道渗漏', icon: 'drop', weight: 6, minDay: 5,
    desc: '巡夜时发现灌溉管路在渗水，土壤有些过湿。',
    opts: [
      { t: '立即检修管路', cost: 40, eff: { log: '管路修好，问题解决', toast: '检修完成' } },
      { t: '等白天再说 · 土壤偏湿', cost: 0, eff: { waterOver: 8, log: '渗漏持续一夜，土壤含水偏高', toast: '有点湿' } }
    ]
  },
  {
    id: 'quiet', name: '平静的一天', icon: 'leaf', weight: 10, minDay: 1,
    desc: '天气温和，没有意外，温室里只有叶片轻轻摆动的声音。',
    opts: [
      { t: '静静待一会儿 · 全员健康 +4', cost: 0, eff: { health: 4, xp: 12, log: '安静的午后，所有植株状态略好', toast: '难得的平静' } }
    ]
  },
  {
    id: 'storm', name: '雷暴夜', icon: 'warning', weight: 5, minDay: 7,
    desc: '积雨云压顶，雷电预警。温室的补光灯和温控最怕跳闸——跳一次，一晚全白费。',
    opts: [
      { t: '全部断电，靠保温被硬扛', cost: 0, eff: { tempDrop: 3, log: '雷暴夜全屋断电，气温掉了 3℃，但线路安然无恙', toast: '有惊无险' } },
      { t: '加装浪涌保护 · 保住设备', cost: 70, eff: { log: '浪涌保护顶住了雷击，设备没受任何影响', toast: '设备无恙' } }
    ]
  },
  {
    id: 'hail', name: '冰雹预警', icon: 'snow', weight: 5, minDay: 6,
    desc: '雷达图上一片红——半小时后可能有冰雹。顶棚硬扛得住，但外露的植株要遭殃。',
    opts: [
      { t: '抢收外层植株进棚 · 少量折损', cost: 0, eff: { loseHealth: 5, log: '抢救及时，外层植株只擦伤了些（全员健康 −5）', toast: '抢收完成' } },
      { t: '盖防雹网 · 花钱消灾', cost: 55, eff: { log: '防雹网架好，冰雹砸在网上一层白响，棚里毫发无损', toast: '防住了' } }
    ]
  },
  {
    id: 'blackout', name: '临时停电', icon: 'warning', weight: 5, minDay: 6,
    desc: '电网检修，今晚全片停电 6 小时。设备全停，温室只能靠自身的保温蓄热硬撑。',
    opts: [
      { t: '提前烧热水蓄热，能撑一会儿', cost: 30, eff: { tempDrop: 1.5, log: '热水袋和蓄热砖撑过停电夜，气温只降了一点', toast: '撑过来了' } },
      { t: '随它去，明早再说', cost: 0, eff: { tempDrop: 4, log: '停电夜设备全停，气温掉了 4℃', toast: '冷了一夜' } }
    ]
  },
  {
    id: 'bees', name: '蜜蜂来访', icon: 'leaf', weight: 6, minDay: 4,
    desc: '一窝野蜜蜂在温室周边转悠。它们会顺手帮你授粉，但也可能蜇到人。',
    opts: [
      { t: '留着它们 · 授粉有好处', cost: 0, eff: { health: 6, xp: 20, log: '蜜蜂在花间忙了一整天，全员健康 +6', toast: '授粉成功' } },
      { t: '请人移走 · 花点钱买个安心', cost: 35, eff: { log: '蜂群被安全移走，往后几天不用担心被蜇', toast: '移走了' } }
    ]
  },
  {
    id: 'museum', name: '博物馆征集', icon: 'book', weight: 4, minDay: 9,
    desc: '自然博物馆在征集标本级 specimen，出价很高——但要求 S 级品相，且收走就不还了。',
    opts: [
      { t: '从收获仓挑一件 S 级送去', cost: 0, eff: { museum: true, log: '博物馆收下了你的 S 级标本，报酬可观', toast: '征集达成' } },
      { t: '舍不得，留在自己手里', cost: 0, eff: { xp: 25, log: '你把最好的那件留了下来。有些东西不是钱能算的', toast: '留下了' } }
    ]
  },
  {
    id: 'runoff', name: '暴雨汇流', icon: 'drop', weight: 6, minDay: 5,
    desc: '一场急暴雨，棚外的水正往里灌。排水沟可能顶不住。',
    opts: [
      { t: '疏通排水沟', cost: 25, eff: { log: '排水沟疏通了，积水很快退掉，没有影响', toast: '处理及时' } },
      { t: '赌雨停 · 可能积水', cost: 0, eff: { waterOver: 10, disease: 0.3, log: '雨水倒灌，土壤含水偏高，还有烂根风险', toast: '进水了' } }
    ]
  },
  {
    // 寻回事件：只有出走过的玩家会遇到，且需要有空位才给"接回来"选项
    id: 'catReturn', name: '门口的猫', icon: 'paw', weight: 7, minDay: 2,
    cond: st => (st.stats && st.stats.runaway > 0) && st.slots.some(sl => sl.unlocked && !sl.plot),
    desc: '清晨开门时，门口蹲着一只熟悉的身影——是之前出走的那只猫。它瘦了些，但没有跑开，正抬头看你。',
    opts: [
      { t: '把它接回来 · 默契从「接纳」重新开始', cost: 0, eff: { adoptBack: true, log: '出走的那只猫回来了。这次别再让它躲在角落里', toast: '它回来了' } },
      { t: '塞给它一些吃的，让它去想去的地方', cost: 25, eff: { xp: 30, log: '喂了它一顿，看着它消失在巷口。也许这样对它更好', toast: '目送它离开' } }
    ]
  },
  {
    // 水生线专属：水质波动，考验玩家对氨氮/溶氧的关注
    id: 'algae', name: '藻华预警', icon: 'drop', weight: 6, minDay: 8,
    cond: st => st.slots.some(sl => sl.plot && SPECIES[sl.plot.speciesId] && SPECIES[sl.plot.speciesId].habitat === 'water'),
    desc: '水池泛起一层绿膜。光照足、氨氮高的水体最容易爆藻——藻一多，夜里溶氧会被抢光。',
    opts: [
      { t: '遮光 + 换水 · 花钱换稳定', cost: 45, eff: { log: '遮阳网拉上，换掉三分之一的水，绿膜当天就退了', toast: '水质稳住了' } },
      { t: '先观察，也许明天自己会散', cost: 0, eff: { disease: 0.35, loseHealth: 4, log: '藻华没散，水里溶氧掉了一截，水生生物状态转差', toast: '水质恶化' } }
    ]
  },
  {
    // 土壤线专属：连作障碍——提醒玩家翻耕轮作
    id: 'salt', name: '土壤返盐', icon: 'basket', weight: 6, minDay: 10,
    cond: st => st.slots.some(sl => sl.plot && SPECIES[sl.plot.speciesId] && SPECIES[sl.plot.speciesId].habitat === 'soil'),
    desc: '地表结出一层白色晶斑。长期施用同一种肥、缺少淋洗，盐分就会往表层聚——根系吸水越来越费劲。',
    opts: [
      { t: '大水淋洗 + 翻耕改良', cost: 40, eff: { log: '灌透一遍再翻耕，盐分被压回下层，土面重新变得松软', toast: '改良完成' } },
      { t: '继续用着，看能不能扛过去', cost: 0, eff: { loseHealth: 6, log: '盐分没降，根系吸不上水，土壤作物健康 −6', toast: '没管它' } }
    ]
  },
  {
    // 暗室线专属：菌包污染，考验无菌意识
    id: 'mold', name: '菌包污染', icon: 'warning', weight: 6, minDay: 9,
    cond: st => st.slots.some(sl => sl.plot && SPECIES[sl.plot.speciesId] && SPECIES[sl.plot.speciesId].habitat === 'dark'),
    desc: '一包菌料上冒出几点绿霉。霉菌繁殖比菌丝快得多，隔壁几包都在同一间暗室里。',
    opts: [
      { t: '立刻隔离并消毒整间', cost: 35, eff: { log: '污染包移出烧掉，暗室用酒精擦过一遍，其余几包无恙', toast: '隔离及时' } },
      { t: '只挑掉霉点，省下这笔钱', cost: 0, eff: { disease: 0.45, loseHealth: 5, log: '霉点挑掉了，但孢子已经散开，周边菌包陆续出现杂菌', toast: '扩散了' } }
    ]
  }
];

// 抽取一个事件（同一天不重复触发；部分事件按季节加权——雷暴夏天多、寒潮冰雹冬天多）
const EVENT_SEASON_W = {
  storm: { summer: 2.2, spring: 1.4, autumn: 1, winter: 0.4 },
  hail:  { summer: 0.5, spring: 1,   autumn: 1.4, winter: 2.2 },
  cold:  { summer: 0,   spring: 0.6, autumn: 1.4, winter: 2.4 },
  // 藻华：夏季高温强光 + 冬季水体少流动，两头都容易爆
  algae: { summer: 2.0, spring: 1,   autumn: 0.7, winter: 1.2 },
  // 返盐：夏秋蒸发最猛，盐分往上走
  salt:  { summer: 1.8, spring: 0.8, autumn: 1.5, winter: 0.5 },
  // 菌包污染：梅雨与闷湿最凶
  mold:  { summer: 1.6, spring: 1.3, autumn: 1,   winter: 0.6 },
  heatwave: null
};
function rollEvent(st, rnd) {
  const r = typeof rnd === 'function' ? rnd : Math.random;
  let sk = 'spring';
  try { sk = seasonForDay(st.day || 1).key; } catch (e) {}
  const pool = EVENT_POOL.filter(e => (st.day || 1) >= (e.minDay || 1) && (!e.cond || e.cond(st)));
  const weighted = pool.map(e => {
    const w = (EVENT_SEASON_W[e.id] || {})[sk];
    return { e, w: e.weight * (w === 0 ? 0 : (w || 1)) };
  }).filter(x => x.w > 0);
  const total = weighted.reduce((a, x) => a + x.w, 0);
  let x = r() * total;
  for (const it of weighted) { x -= it.w; if (x <= 0) return it.e; }
  return weighted.length ? weighted[weighted.length - 1].e : pool[0];
}

// 今天是否出事件：约 40% 概率
function maybeEvent(st, rnd) {
  const r = typeof rnd === 'function' ? rnd : Math.random;
  if ((st.day || 1) < 2) return null;
  if (r() > 0.40) return null;
  return rollEvent(st, r);
}
