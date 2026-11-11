/* ============================================================
   Nature Lab · 培育统计
   把散落在 records / stats / codex 里的数据整理成一份"经营报告"
   目标：让玩家一眼看清"我擅长什么、亏在哪、下一步该试什么"
   ============================================================ */

// 从档案里聚合出完整统计（纯函数，不碰 DOM）
function buildReport(st) {
  const recs = (st.records || []);
  const ok = recs.filter(r => r.success);
  const bad = recs.filter(r => !r.success);


  // ---- 1. 累计概览 ----
  const days = recs.reduce((a, r) => a + (r.days || 0), 0);
  const totalEarn = Math.round(st.stats.totalEarn || 0);
  const overview = {
    rounds: st.stats.rounds || 0,
    success: ok.length,
    failed: bad.length,
    rate: recs.length ? Math.round((ok.length / recs.length) * 100) : 0,
    bestQ: st.stats.bestQ || 0,
    avgQ: ok.length ? Math.round(ok.reduce((a, r) => a + (r.quality || 0), 0) / ok.length) : 0,
    totalDays: days,
    totalEarn,
    earnPerDay: days ? Math.round(totalEarn / days) : 0,
    gameDays: st.day || 1
  };

  // ---- 2. 物种表现 ----
  const bySpecies = {};
  recs.forEach(r => {
    const k = r.species || 'unknown';
    const o = bySpecies[k] || (bySpecies[k] = { id: k, n: 0, ok: 0, sumQ: 0, bestQ: 0, days: 0 });
    o.n += 1;
    o.days += r.days || 0;
    if (r.success) {
      o.ok += 1;
      o.sumQ += r.quality || 0;
      o.bestQ = Math.max(o.bestQ, r.quality || 0);
    }
  });
  const species = Object.values(bySpecies).map(o => {
    const sp = (typeof SPECIES !== 'undefined' && SPECIES[o.id]) || { name: o.id, emoji: '·' };
    return {
      id: o.id, name: sp.name, emoji: sp.emoji || '·',
      n: o.n, ok: o.ok,
      rate: o.n ? Math.round((o.ok / o.n) * 100) : 0,
      avgQ: o.ok ? Math.round(o.sumQ / o.ok) : 0,
      bestQ: o.bestQ,
      avgDays: o.n ? Math.round(o.days / o.n) : 0
    };
  }).sort((a, b) => b.avgQ - a.avgQ);

  // ---- 3. 品质分布 ----
  const grades = ['S', 'A', 'B', 'C', 'D'];
  const dist = grades.map(g => ({
    g,
    n: ok.filter(r => r.grade === g).length,
    pct: ok.length ? Math.round((ok.filter(r => r.grade === g).length / ok.length) * 100) : 0
  }));

  // ---- 4. 失败归因 ----
  const cause = {};
  bad.forEach(r => {
    const c = r.cause || '未知原因';
    cause[c] = (cause[c] || 0) + 1;
  });
  const causes = Object.entries(cause)
    .map(([name, n]) => ({ name, n, pct: bad.length ? Math.round((n / bad.length) * 100) : 0 }))
    .sort((a, b) => b.n - a.n);

  // ---- 5. 健康曲线：把每轮均健康按 20 分一档做分布 ----
  const buckets = [
    { lo: 90, hi: 100, label: '90–100', n: 0, tone: 'ok' },
    { lo: 75, hi: 89, label: '75–89', n: 0, tone: 'ok' },
    { lo: 60, hi: 74, label: '60–74', n: 0, tone: 'mid' },
    { lo: 40, hi: 59, label: '40–59', n: 0, tone: 'mid' },
    { lo: 0, hi: 39, label: '0–39', n: 0, tone: 'bad' }
  ];
  recs.forEach(r => {
    const h = r.avgHp == null ? 100 : r.avgHp;
    const b = buckets.find(x => h >= x.lo && h <= x.hi);
    if (b) b.n += 1;
  });
  const maxB = Math.max(1, ...buckets.map(b => b.n));

  // ---- 6. 结论与建议（按数据给出，不是套话） ----
  const tips = [];
  if (!recs.length) {
    tips.push({ tone: 'info', t: '还没有完成过一轮培育，先跑通一次完整的生长周期。' });
  } else {
    if (overview.rate >= 90) tips.push({ tone: 'ok', t: `成功率 ${overview.rate}%，环境控制已经很稳，可以开始追 S 级而不是只求活。` });
    else if (overview.rate < 60) tips.push({ tone: 'bad', t: `成功率只有 ${overview.rate}%，问题出在"活下来"这一步——先检查最短板的那种环境指标，别急着扩产。` });
    if (overview.avgQ < 70 && overview.success >= 3) tips.push({ tone: 'mid', t: `平均品质 ${overview.avgQ} 分，离 S 级（92）还差一截。品质是全程均值，中途掉几天就补不回来。` });
    if (causes.length) tips.push({ tone: 'mid', t: `最常见的死因是「${causes[0].name}」（占失败 ${causes[0].pct}%），针对它调一次参数比全面乱调更有效。` });
    if (species.length >= 2) {
      const best = species[0], worst = species[species.length - 1];
      if (best.avgQ - worst.avgQ >= 8) tips.push({ tone: 'info', t: `你在「${best.name}」上的均分（${best.avgQ}）明显高于「${worst.name}」（${worst.avgQ}），后者可能不是你的问题，而是它本身对环境更挑剔。` });
    }
    const notTried = (typeof SPECIES_ORDER !== 'undefined' ? SPECIES_ORDER : []).filter(id => !bySpecies[id]);
    if (notTried.length) {
      const names = notTried.map(id => (SPECIES[id] || {}).name || id).join('、');
      tips.push({ tone: 'info', t: `还有 ${notTried.length} 个物种没养过：${names}。收藏进度和「博物学家」成就都要求全物种通晓。` });
    }
    if (overview.earnPerDay && overview.earnPerDay < 40) tips.push({ tone: 'mid', t: `日均收入只有 ${overview.earnPerDay} 币。与其多开几个位，不如把一个位的品质从 B 拉到 A——高等级的价格是非线性的。` });
  }
  // ---- 远缘嫁接表现（有实验才给结论，没做过不硬凑） ----
  const gs = st.stats || {};
  const graftN = gs.grafts || 0;
  const graftTake = gs.graftTake || 0;
  const graftFalse = gs.graftFalse || 0;
  if (graftN >= 3) {
    const rate = Math.round(graftTake / graftN * 100);
    if (rate >= 40) {
      tips.push({ tone: 'ok', t: `嫁接 ${graftN} 次成活 ${graftTake} 株（${rate}%），命中率不错——嫁接体的售价加成比普通品质提升更划算，值得扩大产量。` });
    } else if (graftFalse / graftN >= 0.35) {
      tips.push({ tone: 'mid', t: `嫁接 ${graftN} 次里有 ${graftFalse} 次"假活"，这类失败最贵——它先让你以为成了。挑亲和度 30% 以上的同科组合，比硬试跨科稳妥。` });
    } else {
      tips.push({ tone: 'info', t: `嫁接 ${graftN} 次成活 ${graftTake} 株（${rate}%），偏低但正常。跨科嫁接本就是赌，先在同科里攒出稳定的嫁接体，再拿它们去试不可能的组合。` });
    }
  } else if (graftN > 0) {
    tips.push({ tone: 'info', t: `只试过 ${graftN} 次嫁接，样本还太小。多试几次再判断哪种组合值得投入。` });
  }

  // ---- 宠物维度表现（养过才给结论） ----
  const pet = st.stats || {};
  const eggs = pet.eggs || 0, bondMax = pet.bondMax || 0, bondFull = pet.bondFull || 0, broody = pet.broody || 0;
  const petDays = (st.slots || []).filter(sl => sl.plot && (typeof PET_KIND !== 'undefined') && PET_KIND[sl.plot.speciesId]).length;
  if (eggs >= 20) {
    tips.push({ tone: 'ok', t: `累计收蛋 ${eggs} 枚。产蛋对光照很敏感——把补光灯排进日常，成鸡期的产出能再抬两成。` });
  }
  if (bondMax >= 58 && bondFull === 0) {
    tips.push({ tone: 'info', t: `宠物默契最高到过 ${bondMax}，离满值不远。狗要每天陪、猫要少打扰，最后一段通常卡在环境舒适度上。` });
  }
  if (bondFull >= 1) {
    tips.push({ tone: 'ok', t: `有 ${bondFull} 只宠物默契满值（售价 +70%）。这条线的收益比再练一只普通的更划算——优先保住它。` });
  }
  if (broody >= 3) {
    tips.push({ tone: 'info', t: `经历过 ${broody} 次抱窝。抱窝期间蛋会攒着但停产，看见提示就先把蛋收了，少亏一点。` });
  }
  const runaway = pet.runaway || 0, damages = pet.damages || 0;
  if (runaway >= 1) {
    tips.push({ tone: 'mid', t: `有 ${runaway} 只猫离家出走。猫的耐心是"躲藏天数 + 默契"双重判定——看见"往门口看"的警告就立刻改造环境，否则就真的走了。` });
  }
  if (damages >= 3) {
    tips.push({ tone: 'mid', t: `狗拆过 ${damages} 次家（修理费不便宜）。狗不会走，但环境长期不及格它就会闹——把它的环境舒适度拉上 62 才是正解。` });
  }

  return { overview, species, dist, causes, buckets, maxB, tips, hasData: recs.length > 0, petStat: { eggs, bondMax, bondFull, broody, runaway, damages } };
}
