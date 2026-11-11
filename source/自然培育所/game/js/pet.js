/* ============================================================
   Nature Lab · 宠物的差异化结算维度
   问题：笼舍里已经住着兔子、绿头鸭、陆龟、鸡、狗、猫 6 个物种，
   如果继续用同一套"长大 → 按品质卖钱"的公式，它们只是换了张皮。

   解法：给三种家养宠物各自一条独立的第二条结算线——
     · 鸡  → 产蛋量（光照 × 蛋白 × 钙，抱窝期归零）
     · 狗  → 默契度（陪伴 × 遵守"少打扰"的养法）
     · 猫  → 默契度（但它是另一套逻辑：不能抱，靠干净与垂直空间）

   设计要点：两条线都必须是"期间持续积累"的，而不是收获时一次性判定。
   否则玩家会把它当成另一种品质分，而不是另一种玩法。
   ============================================================ */

/* 哪些物种有第二条线。键名即 petKind，值为中文名与图标 */
const PET_KIND = {
  chicken: { kind: 'egg', label: '产蛋', icon: '🥚' },
  dog: { kind: 'bond', label: '默契', icon: '🐾' },
  cat: { kind: 'bond', label: '默契', icon: '🐾' }
};

function petKindOf(sp) {
  if (!sp || !PET_KIND[sp.id]) return null;
  return PET_KIND[sp.id];
}

/* ---------------- 蛋 ---------------- */

// 每只鸡的"产蛋潜力"：资质 × 品质。资质随代数与活力上浮，这是选育的意义所在
function eggPotential(plot, sp) {
  const vig = plot.vig || 0;
  const gen = plot.gen || 1;
  return 0.55 + (plot.quality || 0) / 100 * 0.45 + vig * 0.012 + (gen - 1) * 0.02;
}

// 当前处于哪个阶段（按 key 判断，不按数字——阶段数组以后加长也不会错位）
function stageKeyOf(plot, sp) {
  const st = sp.stages[Math.min(plot.stage, sp.stages.length - 1)];
  return st ? st.key : '';
}
// 产蛋期的阶段 key：从"开产"开始，到"成鸡"是高峰
const EGG_STAGES = ['laying', 'adult'];

// 当日产蛋基数：光照与蛋白是硬瓶颈，钙不足会下软壳蛋
function eggDaily(plot, sp, env, nv) {
  if (EGG_STAGES.indexOf(stageKeyOf(plot, sp)) < 0) return 0;  // 孵化到中鸡都不产蛋
  if (plot.broody) return 0;                 // 抱窝：完全停产
  if (plot.health < 40) return 0;
  const light = Math.max(0, env.light);
  // 光照：16h 达到饱和，12h 以下急剧下降（与真实产蛋曲线同形）
  // 累计日照口径下，傍晚能到 10–12h；饱和点取 13h，
  // 意思是"白天自然光基本够，但冬季缺光时补光灯真的有用"
  const lightF = Math.min(1, Math.pow(light / 13, 1.15));
  // 营养评估只给出"需求 need"与"亏缺 deficit"，实际供给 = need - deficit
  const need = nv ? nv.need : { N: 60, P: 40, K: 55 };
  const def = nv ? nv.deficit : { N: 0, P: 0, K: 0 };
  const n = Math.max(0, need.N - def.N);
  const p = Math.max(0, need.P - def.P);
  // 蛋白：60 是产蛋的合理供给线。低于 55 明显掉产，往上收益递减
  const nF = Math.min(1.05, Math.pow(n / 60, 0.85));
  // 钙（P 在游戏里兼作矿物质，见 data.js 注释）不足 → 软壳蛋
  const softShell = p < 42;
  const raw = eggDailyBase(stageKeyOf(plot, sp)) * lightF * nF * (softShell ? 0.6 : 1) * eggPotential(plot, sp);
  plot.softShell = softShell;
  return raw;
}

function eggDailyBase(stageKey) {
  // 开产期是爬坡，成鸡是高峰；1.7 只是上限，实际受光照/蛋白/资质三重打折
  if (stageKey === 'adult') return 0.78;
  if (stageKey === 'laying') return 0.45;
  return 0;
}

// 蛋的单价只在这一个地方算，面板、收蛋、结算卡三处共用，避免数字对不上
function eggUnitPrice(plot) {
  return Math.round(8 + (plot.quality || 60) * 0.14);
}

/* ---------------- 默契 ---------------- */

// 默契的"养法"完全不同：狗要陪，猫要被放过
const BOND_RULES = {
  dog: {
    // 狗把"被理会"当作奖励：陪玩是主要增长源，独处只是不掉
    // 满默契 100 分，正常节奏（每天陪一次）约 12–14 天达成
    base: 2.2,
    play: 5.4,
    rest: -0.6,
    noise: -2.6,
    hint: '狗靠陪伴建立信任：每天陪一次涨得最快；独处不掉太多，但被吓到会掉得厉害'
  },
  cat: {
    // 猫相反：过度打扰是减分项，安静与干净环境才是它的安全感
    // 满默契 100 分，什么都不做约 15 天，主动陪一次能加速但要隔两天
    base: 3.1,
    play: 2.2,
    rest: 2.0,
    noise: -4.5,
    hint: '猫不需要一直抱着：安静熟睡时涨得最多，反复打扰会掉得很快'
  }
};

function bondDaily(plot, sp, env) {
  const rule = BOND_RULES[sp.id];
  if (!rule) return 0;
  if (plot.health < 30) return 0;
  let d = rule.base;
  if (plot.bondHidden === 'hidden') d += rule.noise;        // 躲在角落 = 被惊到了
  if (plot.bondHidden === 'sleeping') d += rule.rest;       // 熟睡 = 不被打扰
  if (plot.playedToday) d += rule.play;
  // 舒适度：温度湿度越接近最优，默契涨得越快（差环境里再怎么陪也没用）
  const comfort = Math.max(0, Math.min(1, (plot.lastScore || 70) / 100));
  d *= 0.55 + comfort * 0.75;
  return d;
}

function bondStage(plot, sp) {
  const v = plot.bond || 0;
  const th = (sp && sp.id === 'dog') ? [0, 18, 40, 65, 88] : [0, 14, 34, 58, 82];
  let i = 0;
  for (let k = 0; k < th.length; k++) if (v >= th[k]) i = k;
  return i;
}

const DOG_BOND_NAME = ['陌生', '戒备', '接纳', '亲近', '生死相托'];
const CAT_BOND_NAME = ['戒备', '容忍', '熟悉', '亲近', '认主'];

function bondName(plot, sp) {
  const i = bondStage(plot, sp);
  return (sp.id === 'dog' ? DOG_BOND_NAME : CAT_BOND_NAME)[i];
}

/* ---------------- 每日推进 ---------------- */

// 在 tick 里调用：把蛋与默契按天累积
function petTickDaily(plot, sp, env, nv, slot) {
  const k = petKindOf(sp);
  if (!k) return;
  if (k.kind === 'egg') {
    plot.eggs = plot.eggs || 0;
    const e = eggDaily(plot, sp, env, nv);
    plot.eggs += e;
    plot.eggToday = e;
    // 抱窝：连续 3 天适生 < 62 且处于产蛋期，有概率进入抱窝（更贴真实：抱窝由催乳素触发）
    if (!plot.broody && EGG_STAGES.indexOf(stageKeyOf(plot, sp)) >= 0 && plot.health > 55 && Math.random() < 0.012) {
      plot.broody = true; plot.broodyDay = S.day;
      S.stats.broody = (S.stats.broody || 0) + 1;
      addLog(S, `${sp.name} 开始抱窝：停产，体温升高、几乎不吃东西`, 'warn');
      toast('母鸡抱窝了，产蛋暂停——这期间能把蛋全攒下来，但要少喂点', 'info');
    }
    if (plot.broody && S.day - (plot.broodyDay || S.day) >= 3) { plot.broody = false; }
  } else if (k.kind === 'bond') {
    plot.bond = Math.max(0, Math.min(100, (plot.bond || 0) + bondDaily(plot, sp, env)));
    // 默契里程碑首次达成时给一次提示
    const st = bondStage(plot, sp);
    if (st > (plot.bondStageSeen || 0)) {
      plot.bondStageSeen = st;
      const nm = bondName(plot, sp);
      addLog(S, `${sp.name} 的默契到了「${nm}」`, 'good');
      toast(`${sp.name}到了「${nm}」——默契 ${Math.round(plot.bond)}`, 'good');
      if (st >= 4) S.stats.bondFull = (S.stats.bondFull || 0) + 1;
    }
    S.stats.bondMax = Math.max(S.stats.bondMax || 0, Math.round(plot.bond));
    // 按物种分记最高默契（图鉴宠物专页用）
    S.stats.bondSp = S.stats.bondSp || {};
    S.stats.bondSp[sp.id] = Math.max(S.stats.bondSp[sp.id] || 0, Math.round(plot.bond));
    plot.playedToday = false;

    // ---- 负反馈：环境长期糟糕时的两种后果（狗和猫的表现完全不同） ----
    // lowDays = 连续"躲起来"的天数；hidden 由 settlePartial 按舒适度打标
    if (plot.bondHidden === 'hidden') plot.lowDays = (plot.lowDays || 0) + 1;
    else plot.lowDays = 0;

    if (sp.id === 'cat') {
      // 猫：预警一次，然后真的会走。出走不可挽回——猫不是死了，是不要你了
      if (!plot.runawayWarned && plot.bond < 25 && plot.lowDays >= 2) {
        plot.runawayWarned = true;
        addLog(S, `${sp.name} 总在往门口看……它对这个环境不满意很久了`, 'warn');
        toast('猫开始往门口看了——再不管它，它可能会离开', 'warn');
      }
      if (plot.bond < 12 && plot.lowDays >= 4) {
        if (slot) petRunAway(slot, plot, sp);
        return;
      }
    } else if (sp.id === 'dog') {
      // 狗：不离家出走（忠诚），但分离焦虑会变成拆家——直接扣你的钱
      if (plot.bond < 20 && plot.lowDays >= 3 && Math.random() < 0.35) {
        const dmg = 12 + Math.floor(Math.random() * 24);
        S.coins = Math.max(0, S.coins - dmg);
        S.stats.damages = (S.stats.damages || 0) + 1;
        addLog(S, `${sp.name} 把垫料刨得到处都是：修理费 −${dmg} 币`, 'bad');
        if (typeof sfx === 'function') sfx('alarm');
        toast(`${sp.name}拆家了：修理费 −${dmg} 币`, 'bad');
      }
    }
  }
}

/* 猫离家出走：清空槽位、记一条档案、统计 +1。
   与死亡的区别：不扣成就、不算培育失败率里的"死亡"，但档案一样留着。 */
function petRunAway(slot, plot, sp) {
  slot.plot = null;
  S.stats.runaway = (S.stats.runaway || 0) + 1;
  S.records.unshift({
    id: Date.now() + '-' + slot.id,
    species: sp.id, name: sp.name, graft: null,
    success: false, quality: 0, grade: '出走',
    days: plot.age || 0,
    avgHp: Math.round(plot.health || 0), minHp: Math.round(plot.minHp ?? plot.health ?? 0),
    cause: '离家出走（默契 ' + Math.round(plot.bond || 0) + '）',
    peakStage: sp.stages[Math.min(plot.stage, sp.stages.length - 1)].name,
    when: S.day
  });
  if (S.records.length > 80) S.records.length = 80;
  addLog(S, `${sp.name} 离家出走了。默契只剩 ${Math.round(plot.bond)}，它等不下去`, 'bad');
  toast(`${sp.name} 离家出走了……`, 'bad');
  if (typeof sfx === 'function') sfx('dead');
  if (typeof renderAll === 'function') renderAll();
  saveGame(S);
}

// 摸/陪玩：主动交互，消耗一点金币换默契（狗多、猫少）
const PET_PLAY = { dog: { coins: 0, bond: 3.6, cd: 1 }, cat: { coins: 0, bond: 1.6, cd: 2 } };

function petPlay(slot) {
  const plot = slot && slot.plot; if (!plot) return;
  const sp = SPECIES[plot.speciesId];
  const k = petKindOf(sp);
  if (!k || k.kind !== 'bond') return toast('这个物种没有默契维度', 'warn');
  if (plot.playedToday) return toast(`今天已经陪过了，${sp.name}需要休息`, 'info');
  const cfg = PET_PLAY[sp.id] || { bond: 1 };
  plot.playedToday = true;
  plot.bond = Math.min(100, (plot.bond || 0) + cfg.bond);
  if (typeof sfx === 'function') sfx('coin');
  toast(`陪 ${sp.name} 待了一会儿，默契 +${cfg.bond}`, 'good');
  if (typeof hitTask === 'function') hitTask('play1');
  renderStageScene(); renderPanel(); renderTopbar(); saveGame(S);
  petPlayFx(sp.id === 'dog' ? 'bounce' : 'heart');
}

// 陪玩即时反馈：狗=开心小跳，猫=懒懒地冒爱心（符合两种性格）
function petPlayFx(kind) {
  const scene = document.getElementById('scene'); if (!scene) return;
  const hero = scene.querySelector('.hero'); if (!hero) return;
  if (kind === 'bounce') {
    hero.classList.remove('play-bounce'); void hero.offsetWidth; hero.classList.add('play-bounce');
    setTimeout(() => hero.classList.remove('play-bounce'), 1200);
  } else {
    hero.classList.remove('play-heart'); void hero.offsetWidth; hero.classList.add('play-heart');
    setTimeout(() => hero.classList.remove('play-heart'), 1600);
  }
  const fx = document.createElement('div');
  fx.className = 'playFx ' + (kind === 'bounce' ? 'fxHearts fast' : 'fxHearts');
  for (let i = 0; i < 7; i++) {
    const l = 26 + (i * 17) % 52, delay = i * 0.11;
    fx.innerHTML += `<i style="left:${l}%;animation-delay:${delay}s;--s:${0.8 + (i % 3) * 0.22}"></i>`;
  }
  scene.appendChild(fx);
  setTimeout(() => fx.remove(), 2400);
}

// 收蛋：产蛋期可随时收，不用等整个培养周期结束——这是与"收获"并列的第二条现金流
function collectEggs(slot) {
  const plot = slot && slot.plot; if (!plot) return;
  const sp = SPECIES[plot.speciesId];
  if (!petKindOf(sp) || petKindOf(sp).kind !== 'egg') return;
  const n = Math.floor(plot.eggs || 0);
  if (n <= 0) return toast('还没有蛋可收', 'info');
  const per = eggUnitPrice(plot);
  const coins = n * per;
  plot.eggs -= n;
  S.coins += coins; if (typeof floatCoins === 'function') floatCoins(coins);
  S.stats.totalEarn = (S.stats.totalEarn || 0) + coins;
  S.stats.eggs = (S.stats.eggs || 0) + n;
  S.stats.eggEarn = (S.stats.eggEarn || 0) + coins;
  // 蛋按"鸡"的物种 id 入库，但品质单独压低——它是蛋，不是成鸡，不能直接当整只卖
  fridgeAdd('chicken', Math.min(99, 45 + (plot.quality || 60) * 0.25), n);
  plot.eggsSold = (plot.eggsSold || 0) + n;
  plot.eggsSoldCoins = (plot.eggsSoldCoins || 0) + coins;
  addLog(S, `收蛋 ${n} 枚，+${coins} 币`, 'good');
  if (typeof hitTask === 'function') hitTask('egg1');
  if (typeof sfx === 'function') sfx('coin');
  toast(`收蛋 ${n} 枚，+${coins} 币`, 'good');
  renderStageScene(); renderPanel(); renderTopbar(); saveGame(S);
}

/* ---------------- 结算（在 doHarvest 里调用） ---------------- */

// 返回结算卡额外一行用的数据；同时把加成折进 coins
function petSettle(plot, sp, val) {
  const k = petKindOf(sp);
  if (!k) return null;
  if (k.kind === 'egg') {
    const eggs = Math.floor(plot.eggs || 0);
    const per = eggUnitPrice(plot);
    const coin = eggs * per;
    val.coins += coin;
    return {
      kind: 'egg', icon: '🥚',
      line: `存蛋 <b>${eggs}</b> 枚 × ${per} 币`,
      coin,
      extra: plot.broody ? '（抱窝中，停产）' : (plot.softShell ? '（钙不足，有软壳蛋）' : ''),
      label: '产蛋'
    };
  }
  const bond = Math.round(plot.bond || 0);
  const bonus = 1 + bond / 100 * 0.7;          // 默契满 → 售价 +70%
  const add = Math.round(val.coins * (bonus - 1));
  val.coins += add;
  return {
    kind: 'bond', icon: '🐾',
    line: `默契 <b>${bondName(plot, sp)}</b> ${bond}`,
    coin: add,
    extra: `售价 +${Math.round((bonus - 1) * 100)}%`,
    label: '默契'
  };
}

/* ---------------- 面板区块 ---------------- */

function petBlock(slot) {
  const plot = slot && slot.plot; if (!plot) return '';
  const sp = SPECIES[plot.speciesId];
  const k = petKindOf(sp); if (!k) return '';
  if (k.kind === 'egg') {
    const eggs = Math.floor(plot.eggs || 0);
    const per = eggUnitPrice(plot);
    const light = (typeof envFor === 'function') ? envFor(slot).light : 0;
    return `<section class="psec petSec">
      <div class="secTitle">🥚 产蛋<span class="secScore" style="color:#f6d365">${eggs} 枚</span></div>
      <div class="soilBar"><i style="width:${Math.min(100, eggs * 4)}%;background:linear-gradient(90deg,#f6d365,#e0a24c)"></i></div>
      <div class="petRows">
        <span class="pr"><em>今日</em><b>${(plot.eggToday || 0).toFixed(2)}</b></span>
        <span class="pr"><em>光照</em><b class="${light < 12 ? 'bad' : 'ok'}">${light.toFixed(1)}h</b></span>
        <span class="pr"><em>状态</em><b class="${plot.broody ? 'bad' : 'ok'}">${plot.broody ? '抱窝停产' : (plot.softShell ? '缺钙·软壳' : '正常')}</b></span>
      </div>
      <div class="petTip">${EGG_STAGES.indexOf(stageKeyOf(plot, sp)) < 0
        ? '还没到产蛋期：走到「开产」阶段才开始下蛋，成鸡是高峰。'
        : (plot.broody
          ? '抱窝中：产蛋归零，蛋会一直攒着。3 天后自动结束。'
          : (light < 12 ? '光照不足 12h，产蛋明显偏低——补光到 16h 基本就饱和了。' : '光照达标。钙（P）低于 42 会下软壳蛋。'))}</div>
      <button class="btn small ghost" data-act="egg" ${eggs <= 0 ? 'disabled' : ''}>收蛋 ${eggs} 枚 · +${eggs * per} 币</button>
    </section>`;
  }
  // 默契
  const bond = Math.round(plot.bond || 0);
  const nm = bondName(plot, sp);
  const st = bondStage(plot, sp);
  const rule = BOND_RULES[sp.id];
  return `<section class="psec petSec">
    <div class="secTitle">🐾 默契<span class="secScore" style="color:#9ecbff">${nm} ${bond}</span></div>
    <div class="soilBar"><i style="width:${bond}%;background:linear-gradient(90deg,#7fb2ff,#9ecbff)"></i></div>
    <div class="bondDots">${[0, 1, 2, 3, 4].map(i => `<span class="bd ${i <= st ? 'on' : ''}"></span>`).join('')}</div>
    <div class="petRows">
      <span class="pr"><em>售价加成</em><b class="ok">+${Math.round(bond / 100 * 70)}%</b></span>
      <span class="pr"><em>今日</em><b>${plot.playedToday ? '已陪伴' : '未陪伴'}</b></span>
    </div>
    <div class="petTip">${rule.hint}</div>
    <button class="btn small ghost" data-act="play" ${plot.playedToday ? 'disabled' : ''}>${plot.playedToday ? '今天已陪伴' : '陪它待一会儿'}</button>
  </section>`;
}

/* ---------------- 结算卡的额外行 ---------------- */

function petHarvestRow(info) {
  if (!info) return '';
  return `<div class="hvPet ${info.kind}">
    <span>${info.icon} ${info.label}：${info.line}</span>
    <span>+<b>${info.coin}</b> 币</span>
    ${info.extra ? `<em>${info.extra}</em>` : ''}
  </div>`;
}
