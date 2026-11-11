/* 经营手账：五章主线任务链。
   与每日目标不同：主线是贯穿整个经营的成长线，每步一次性奖励，全章完成给称号。
   设计原则：每步都能在正常游玩中自然达成，不逼玩家刷单一样的东西。 */

const QUESTS = [
  {
    id: 'ch1', name: '第一章 · 开荒', title: '立足温室',
    intro: '从一粒种子到一间像样的温室——把根基打稳。',
    steps: [
      { id: 'q101', name: '破土',      desc: '完成第一次收获',              test: s => (s.stats.success || 0) >= 1,  reward: { coin: 80,  xp: 40 } },
      { id: 'q102', name: '渐入佳境',  desc: '累计完成 3 次收获',           test: s => (s.stats.success || 0) >= 3,  reward: { coin: 120, xp: 60 } },
      { id: 'q103', name: '扩建',      desc: '拥有 3 个可用培育位',         test: s => (s.slots || []).filter(x => x.unlocked).length >= 3, reward: { coin: 150, xp: 70 } },
      { id: 'q104', name: '第一笔外快', desc: '完成 3 笔收购订单',           test: s => (s.stats.orders || 0) >= 3,   reward: { coin: 180, xp: 80 } }
    ]
  },
  {
    id: 'ch2', name: '第二章 · 品质', title: '匠心培育',
    intro: '量有了，该追求质了。温室的口碑从 A 级开始。',
    steps: [
      { id: 'q201', name: '精品意识',  desc: '收获一件 A 级以上产物',        test: s => (s.records || []).some(r => r.success && (r.grade === 'S' || r.grade === 'A')), reward: { coin: 150, xp: 70 } },
      { id: 'q202', name: '特级出品',  desc: '收获一件 S 级产物',            test: s => (s.records || []).some(r => r.grade === 'S'), reward: { coin: 250, xp: 110 } },
      { id: 'q203', name: '博物笔记',  desc: '图鉴累计解锁 20 个阶段',       test: s => Object.values(s.codex || {}).reduce((a, c) => a + (c.seen || []).length, 0) >= 20, reward: { coin: 200, xp: 90 } },
      { id: 'q204', name: '火候到位',  desc: '研究等级达到 3 级',            test: s => (s.level || 1) >= 3, reward: { coin: 220, xp: 100 } }
    ]
  },
  {
    id: 'ch3', name: '第三章 · 经营', title: '行家里手',
    intro: '温室不只是种东西的地方——让它自己转起来。',
    steps: [
      { id: 'q301', name: '现代化',    desc: '任意一项温室改造达到满级',      test: s => Object.values(s.upgrades || {}).some(v => v >= 2), reward: { coin: 260, xp: 110 } },
      { id: 'q302', name: '供货稳定',  desc: '累计完成 10 笔订单',           test: s => (s.stats.orders || 0) >= 10,  reward: { coin: 300, xp: 130 } },
      { id: 'q303', name: '万贯家财',  desc: '累计收入超过 10000 币',        test: s => (s.stats.totalEarn || 0) >= 10000, reward: { coin: 400, xp: 160 } },
      { id: 'q304', name: '越冬者',    desc: '在冬季收获一件 A 级以上产物',   test: s => (s.records || []).some(r => { try { return r.success && (r.grade === 'S' || r.grade === 'A') && seasonForDay(r.when).key === 'winter'; } catch (e) { return false; } }), reward: { coin: 350, xp: 150 } }
    ]
  },
  {
    id: 'ch4', name: '第四章 · 生命', title: '万物有灵',
    intro: '培育到最后，拼的不是产量——是你怎么对待活物。',
    steps: [
      { id: 'q401', name: '初次亲近',  desc: '任一宠物默契达到「亲近」档',    test: s => (s.stats.bondMax || 0) >= 58, reward: { coin: 200, xp: 90 } },
      { id: 'q402', name: '蛋筐渐满',  desc: '累计收蛋 20 枚',               test: s => (s.stats.eggs || 0) >= 20,    reward: { coin: 240, xp: 100 } },
      { id: 'q403', name: '生死相托',  desc: '把一只宠物的默契养到满值',      test: s => (s.stats.bondFull || 0) >= 1, reward: { coin: 380, xp: 150 } },
      { id: 'q404', name: '博物学家',  desc: '全部物种通晓图鉴里程碑',        test: s => { if (typeof SPECIES_ORDER === 'undefined' || typeof mastered !== 'function') return false; return SPECIES_ORDER.every(id => mastered(s, id)); }, reward: { coin: 600, xp: 260 } }
    ]
  },
  {
    id: 'ch5', name: '第五章 · 规模', title: '温室主人',
    intro: '到这里你已经会养了。接下来是把"会养"变成"养得好、卖得稳"。',
    steps: [
      { id: 'q501', name: '四面开花',  desc: '拥有全部 4 个培育位',          test: s => (s.slots || []).filter(x => x.unlocked).length >= 4, reward: { coin: 400, xp: 170 } },
      { id: 'q502', name: '全品种试种', desc: '图鉴解锁全部 18 个物种',        test: s => { if (typeof SPECIES_ORDER === 'undefined') return false; return SPECIES_ORDER.every(id => (s.codex || {})[id] && ((s.codex[id] || {}).seen || []).length > 0); }, reward: { coin: 500, xp: 220 } },
      { id: 'q503', name: '熟客满堂',  desc: '任意 3 家客户都成为熟客以上',    test: s => { if (typeof CLIENTS === 'undefined') return false; const r = (s.stats || {}).clientRep || {}; return CLIENTS.filter(c => (r[c.id] || 0) >= 3).length >= 3; }, reward: { coin: 550, xp: 240 } },
      { id: 'q504', name: '万元温室',  desc: '累计收入超过 30000 币',        test: s => (s.stats.totalEarn || 0) >= 30000, reward: { coin: 800, xp: 340 } }
    ]
  }
];

// 检查主线进度：自动发放达成的步骤奖励（不需要手动领——省一步操作，反馈即时）
function checkQuests(st) {
  if (!st.quests) st.quests = { done: {}, chapters: {} };
  const got = [];
  QUESTS.forEach(ch => {
    ch.steps.forEach(q => {
      if (st.quests.done[q.id]) return;
      let pass = false;
      try { pass = !!q.test(st); } catch (e) {}
      if (!pass) return;
      st.quests.done[q.id] = st.day || 1;
      if (q.reward.coin) st.coins = (st.coins || 0) + q.reward.coin;
      if (q.reward.xp && typeof addXp === 'function') addXp(q.reward.xp);
      got.push({ kind: 'step', ch: ch.name, ...q });
      addLog(st, `【${ch.name}】「${q.name}」完成：+${q.reward.coin} 币 · +${q.reward.xp} 经验`, 'good');
      toast(`手账达成「${q.name}」 +${q.reward.coin} 币`, 'good');
      if (typeof sfx === 'function') sfx('coin');
    });
    // 章节全部完成 → 称号
    if (!st.quests.chapters[ch.id] && ch.steps.every(q => st.quests.done[q.id])) {
      st.quests.chapters[ch.id] = st.day || 1;
      st.title = ch.title;
      got.push({ kind: 'chapter', chapter: ch });
      addLog(st, `【${ch.name}】全章完成，获得称号「${ch.title}」`, 'good');
      toast(`称号达成：「${ch.title}」`, 'good');
      if (typeof sfx === 'function') sfx('achv');
    }
  });
  return got;
}

function questProgress(st) {
  const total = QUESTS.reduce((a, c) => a + c.steps.length, 0);
  const done = Object.keys((st.quests || {}).done || {}).length;
  return { done, total };
}
