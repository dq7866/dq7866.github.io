/* ============================================================
   Nature Lab · UI
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.round(n).toLocaleString('zh-CN');

let S = loadGame() || DEFAULT_STATE();
let currentSlot = S.slots[0].id;
let paused = false;
let tickAcc = 0;
let lastTs = 0, uiAcc = 0;

const HAB = { soil: '陆地 · 土壤', water: '水生 · 池塘', land: '陆地 · 笼舍', hive: '蜂箱 · 巢内', dark: '暗室 · 菌床' };
// 难度星级：满格 5，实心表示难度。
// 早先写死 3 格，难度 4 的物种（仓鸮）会让 "○".repeat(负数) 抛 RangeError —— 这里统一成常量
const DIFF_MAX = 5;
function stars(n) {
  const k = Math.max(0, Math.min(DIFF_MAX, n || 1));
  return '●'.repeat(k) + '○'.repeat(DIFF_MAX - k);
}
// 场景背景：水生用池塘，其余用温室；菌类与蜂箱在温室内部区域
const HAB_BG = { water: 'bg_pond' };
function habIcon(h) { return h === 'water' ? 's_water' : 's_soil'; }
// 补水动作在不同栖息地叫法不同：笼舍换垫料、蜂箱补湿、菌床喷水
const WATER_ACT = { soil: '浇水', land: '换垫料', hive: '加湿盘', dark: '喷水' };
// 每个栖息地一条玩法提示，替代"水体是活系统"那段
const HAB_NOTE = {
  land: '兔无汗腺，气温超过 26℃ 就热应激；更要紧的是垫料：湿了会烂脚、氨气上来会伤呼吸道，所以"换垫料"要勤。',
  hive: '蜂群自己会控温到 35℃，但要消耗蜂蜜。巢内一旦闷湿，幼虫会得白垩病；通风和保温必须同时管住。',
  dark: '菌丝怕光也怕闷：出菇期 CO₂ 一高就只长柄不长盖。喷水要少量多次，直接浇在菇上会让菌盖发黏变褐。'
};

// 同一栖息地里住着不同物种，通用提示会张冠李戴，所以按物种覆盖
const SPECIES_NOTE = {
  duck: '雏鸭是早成鸟，出壳就能走，但绒羽不防水。头两周必须保温 30℃ 上下，湿了要立刻烘干，否则失温极快。',
  tortoise: '幼龟出壳后两周内不要开食，它在消耗卵黄囊。湿度不足会隆背，而隆背不可逆——宁湿勿干。',
  silkworm: '蚕怕闷不怕湿。五龄期食量占一生 85%，叶要足、要新鲜；眠期（蜕皮前静止）千万别翻动。',
  owl: '仓鸮育雏要每天投喂。雏鸟聋盲、大小不均，老大抢食最凶，弱雏要单独补喂，否则会被压死。',
  chicken: '雏鸡出壳就能走，但绒毛不保温。头一周要 32℃，每周降 3℃；温度不够会扎堆，底层的会被压死。',
  dog: '幼犬 3–16 周是社会化窗口，见过的才算"正常"。断奶期别喂牛奶——犬乳糖酶活性低，直接腹泻。',
  cat: '幼猫牛磺酸必须从肉里来，它自己合成不了。缺了先夜盲、再全盲，心肌也会扩张——不可逆。'
};

// 部分素材主体不在正中，按图片名给出 focal point 微调（避免主体偏出画面）
const ORB_POS = {
  tomato_flower: '46% 58%',
  tomato_fruit: '48% 52%',
  tomato_sprout: '50% 56%',
  strawberry_flower: '50% 54%',
  sunflower_flower: '50% 56%'
};

// 统一资源入口：单文件版会被替换为读 base64 映射，普通版读文件路径
function spr(name) {
  if (typeof ASSET_MAP !== 'undefined' && ASSET_MAP[name]) return ASSET_MAP[name];
  return 'assets/sprites/' + name + '.webp';
}

// ---------- 环境 ----------
function baseWeather() { return weatherForDay(S.day); }

function daylightHours() {
  const h = S.clock;
  if (h < 6 || h > 19) return 0;
  return Math.sin(((h - 6) / 13) * Math.PI) * 12;
}

function slotWater(slotId) {
  const slot = S.slots.find(s => s.id === slotId);
  if (!slot || !slot.plot) return 55;
  const sp = SPECIES[slot.plot.speciesId];
  const v = baseWeather().soilWater + (slot.plot.waterBonus || 0);
  return clamp(Math.round(Math.max(v, sp.env.water[0] - 10)), 5, 100);
}

// 当日累计日照（小时）：由当前时刻的日照强度折算，模拟"全天受光总量"
function cumulativeLight() {
  const peak = 12;
  const frac = daylightHours() / peak;          // 0..1 当前强度
  const elapsed = clamp((S.clock - 6) / 13, 0, 1); // 白天进度
  const area = elapsed * elapsed * (3 - 2 * elapsed); // 平滑积分近似
  return clamp(frac * 0.25 + area * peak, 0, 16);
}

// 当日基准气温：天气已给出全天代表值，昼夜只做小幅修正（避免与天气重复叠加）
function dayTempBase(w) {
  const night = daylightHours() <= 2;
  return w.tempBase + (night ? -2.0 : 0);
}

// 季节压制经升级抵消后的剩余值（唯一真源，envFor / autoAdjust 共用）
function seasonEff() {
  const ef = applySeasonResist(seasonEnvMod(S.day), S);
  // 恶劣季节设备效率：基准 80%，保温层可提升到 110%（满级时反而更强）
  ef.devEff = Math.min(1.1, 0.8 + upgradeBonus(S).devEff);
  return ef;
}

// 各栖息地的稳定 pH：笼舍垫料、蜂箱巢内、菌床基质都不会随天气大幅漂移
const HAB_PH = { water: 7.35, land: 6.9, hive: 6.6, dark: 6.0 };

function envPH(plot, w) {
  const sp = plot && typeof SPECIES !== 'undefined' ? SPECIES[plot.speciesId] : null;
  const h = sp ? sp.habitat : 'soil';
  if (h === 'soil') return w.phBase;
  return HAB_PH[h] !== undefined ? HAB_PH[h] : w.phBase;
}

function envFor(slot) {
  const w = baseWeather();
  const plot = slot && slot.plot;
  const d = plot ? deviceDelta(plot.devices, plot.autoEff) : { temp: 0, humid: 0, light: 0 };
  const st = (plot && plot.settings) || {};
  const ef = seasonEff();
  // settings 存的是"相对本季节基准的偏移"（玩家手动微调量），默认 0
  // 这样季节与升级生效时，玩家不需要重新调一遍
  const wTemp = dayTempBase(w);
  const evDrop = (plot && plot.eventTempDrop) || 0;
  const temp = wTemp + ef.temp + (st.dTemp || 0) - evDrop;
  const humid = w.humidBase + ef.humid + (st.dHumid || 0);
  // 室内栖息地不直接吃室外日光：
  //   暗室（菌床/蚕房）只有门窗漏进的一点散射光，按 12% 折算
  //   巢箱（蜂箱/鸮巢）内部几乎全黑，按 6% 折算
  // 否则"要几乎无光"的物种在正午必被判为光照超标，永远不适。
  const hab = plot && SPECIES[plot.speciesId] ? SPECIES[plot.speciesId].habitat : 'soil';
  const lightBase = cumulativeLight();
  const lightMul = hab === 'dark' ? 0.12 : hab === 'hive' ? 0.06 : 1;
  const light = lightBase * lightMul + ef.light * lightMul + (st.dLight || 0);
  const harsh = Math.abs(ef.temp) > 0.5 || Math.abs(ef.water) > 0.5;
  const devEff = harsh ? ef.devEff : 1;
  return {
    temp: +(temp + d.temp * devEff).toFixed(1),
    humid: clamp(Math.round(humid + d.humid * devEff), 10, 100),
    light: +Math.max(0, light + d.light * devEff).toFixed(1),
    // pH 基准按栖息地取：池塘水 7.35、蜂箱/菌床/笼舍有自己的稳定环境值，
    // 只有土培作物才真正随天气（雨水、蒸发）漂移
    soilPH: plot ? envPH(plot, w) : w.phBase,
    water: clamp(slotWater(slot.id) + ef.water, 5, 100),
    // 池塘水体参数（陆地物种无此两项）
    do: plot && plot.pond ? +(clamp(plot.pond.do + d.do * devEff, 1, 12)).toFixed(2) : undefined,
    ammonia: plot && plot.pond ? +(clamp(plot.pond.ammonia + d.ammonia, 0, 3)).toFixed(2) : undefined,
    clarity: plot && plot.pond ? Math.round(plot.pond.clarity || 78) : undefined
  };
}

// ---------- 渲染 ----------
function renderAll() {
  if (typeof ensureDailyTasks === 'function') ensureDailyTasks(S);
  renderTopbar(); renderSlots(); renderStageScene(); renderPanel(); renderLog(); renderStock();
  if (typeof renderTaskChip === 'function') renderTaskChip();
  if (typeof renderQuestChip === 'function') renderQuestChip();
}
function mobileLayout() { return window.innerWidth <= 700; }

function lightRefresh() {
  renderTopbar(); lightStage(); lightSlots();
  // BGM 跟随场景：当前培育位的栖息地 + 昼夜（bgmSetScene 内部去重，重复调用无开销）
  if (typeof bgmSetScene === 'function' && typeof bgmOn === 'function' && bgmOn()) {
    const sl = activeSlot();
    const kind = sl && sl.plot && SPECIES[sl.plot.speciesId] ? SPECIES[sl.plot.speciesId].habitat : 'soil';
    bgmSetScene(kind, S.clock < 6 || S.clock > 19);
    if (typeof bgmSetSeason === 'function' && typeof seasonForDay === 'function') {
      bgmSetSeason(seasonForDay(S.day).key);
    }
  }
}

function renderTopbar() {
  $('#dayNum').textContent = S.day;
  const h = Math.floor(S.clock), m = Math.floor((S.clock % 1) * 60);
  if (!mobileLayout()) $('#clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const w = baseWeather();
  $('#weatherName').textContent = w.name;
  const sea = seasonForDay(S.day);
  const sn = $('#seasonName'), sl = $('#seasonLeft');
  if (sn) sn.textContent = sea.name;
  if (sl) sl.textContent = `${daysToNextSeason(S.day)}d`;
  const sc2 = $('#seasonChip');
  if (sc2) sc2.title = `${sea.name}季 · ${sea.tag}\n距下个季节 ${daysToNextSeason(S.day)} 天`;
  $('#weatherIcon').innerHTML = weatherGlyph(w.key);
  $('#coins').textContent = fmt(S.coins);
  const need = XP_PER_LEVEL(S.level);
  $('#level').textContent = S.level;
  $('#xpBar').style.width = Math.min(100, (S.xp / need) * 100) + '%';
  $('#xpText').textContent = `${S.xp} / ${need}`;
  $('#btnPause').innerHTML = paused ? `${icon('play')} 继续` : `${icon('pause')} 暂停`;
  $('#btnPause').setAttribute('aria-pressed', String(!!paused));
  const on = $('#orderNum');
  if (on) on.textContent = (S.orders || []).filter(o => o.expire > S.day).length;
  const un = $('#upNum');
  if (un) {
    const total = UPGRADES.reduce((a, u) => a + u.max, 0);
    const got = UPGRADES.reduce((a, u) => a + upgradeLevel(S, u.id), 0);
    un.textContent = `${got}/${total}`;
  }
  const sc = $('#slotCount');
  if (sc) sc.textContent = `${S.slots.filter(s => s.unlocked).length} / ${S.slots.length}`;
}

function weatherGlyph(k) {
  const map = {
    sunny: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2.5 12h2M19.5 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/></svg>',
    cloudy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 2.5v1.5M2.5 8H4M4.6 4.6l1 1"/><path d="M8 19h9.5a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6-.8A3.6 3.6 0 0 0 8 19Z"/></svg>',
    rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M7 15h10a3.2 3.2 0 0 0 0-6.4 4.6 4.6 0 0 0-8.8-.8A3.6 3.6 0 0 0 7 15Z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/></svg>',
    hot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M2.5 12h2M19.5 12h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/></svg>',
    cold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2v20M3.6 6.9l16.8 10.2M20.4 6.9 3.6 17.1"/><path d="M9.5 4 12 6l2.5-2M9.5 20l2.5-2 2.5 2"/></svg>'
  };
  return map[k] || map.sunny;
}

function renderSlots() {
  const wrap = $('#slots');
  wrap.innerHTML = '';
  S.slots.forEach(slot => {
    const el = document.createElement('div');
    el.className = 'slot' + (slot.id === currentSlot ? ' active' : '') + (slot.unlocked ? '' : ' locked');
    el.id = `slot-${slot.id}`;
    if (!slot.unlocked) {
      el.innerHTML = `<div class="slot-locked">
        <div class="lockIcon">${icon('leaf')}</div>
        <div class="lockTxt">扩建第 ${slot.id} 区</div>
        <button class="btn small" data-unlock="${slot.id}">${slotPrice(slot)} 币${levelPerk(S).slotDiscount < 1 ? `<i class="perkTag">-${Math.round((1 - levelPerk(S).slotDiscount) * 100)}%</i>` : ''}</button>
      </div>`;
    } else if (!slot.plot) {
      el.innerHTML = `<div class="slot-empty">
        <div class="plus">＋</div><div class="emptyTxt">空置培育位</div>
        <button class="btn small ghost" data-plant="${slot.id}">选种培育</button>
      </div>`;
    } else {
      const sp = SPECIES[slot.plot.speciesId];
      const st = sp.stages[Math.min(slot.plot.stage, sp.stages.length - 1)];
      const pct = Math.round(slot.plot.progress * 100);
      const lb = strainLabel(slot.plot.vig);
      let badge = '';
      if (slot.plot.status === 'dead') badge = `<span class="badge dead">枯萎</span>`;
      else if (slot.plot.status === 'ready') badge = `<span class="badge ready">可收获</span>`;
      else if (slot.plot.disease) badge = `<span class="badge sick">${slot.plot.disease.n}</span>`;
      el.innerHTML = `
        <div class="slotThumb" style="background-image:url(${spr(st.img)})">
          <div class="slotMask"></div>${badge}
        </div>
        <div class="slotMeta">
          <div class="slotName">${sp.name} <small>· ${st.name}</small><i class="genTag" style="color:${lb.c}">G${slot.plot.gen || 1}</i></div>
          <div class="miniBar"><i style="width:${pct}%;${slot.plot.status === 'dead' ? 'background:#7a4b42' : ''}"></i></div>
          <div class="slotSub">健康 ${Math.round(slot.plot.health)} · 第 ${slot.plot.age} 天</div>
        </div>`;
    }
    el.addEventListener('click', e => {
      const u = e.target.closest('[data-unlock]');
      if (u) { tryUnlock(+u.dataset.unlock); return; }
      const p = e.target.closest('[data-plant]');
      if (p) { openPicker(+p.dataset.plant); return; }
      if (!slot.unlocked) return;
      currentSlot = slot.id;
      renderAll();
    });
    wrap.appendChild(el);
  });
}

function lightSlots() {
  S.slots.forEach(slot => {
    const el = $(`#slot-${slot.id}`); if (!el || !slot.plot) return;
    const bar = el.querySelector('.miniBar i');
    if (bar) bar.style.width = Math.round(slot.plot.progress * 100) + '%';
    const sub = el.querySelector('.slotSub');
    if (sub) sub.textContent = `健康 ${Math.round(slot.plot.health)} · 第 ${slot.plot.age} 天`;
  });
}

function activeSlot() { return S.slots.find(s => s.id === currentSlot); }

/* ---------- 3D 场景同步 ----------
   原则：静态背景图永远保留在最底层，3D 画布只是"叠上去"的一层。
   这样任何时刻 3D 挂掉（WebGL 上下文丢失、驱动黑名单、低端机崩），
   玩家看到的仍然是那张好看的背景图，不会出现纯黑画面。 */
function scene3dSync(kind) {
  if (typeof S3 === 'undefined') return;
  const cv = document.getElementById('scene3dCanvas');
  const sc = document.getElementById('scene');
  const off = () => {
    if (cv) cv.classList.remove('on');
    if (sc) sc.classList.remove('has3d');
    if (typeof scene3dStop === 'function') scene3dStop();
  };
  if (!cv) { off(); return; }

  if (!scene3dPreferred()) { off(); return; }
  if (!S3.ok) {
    if (!scene3dInit(cv)) {
      // 初始化失败（无 WebGL / 无 THREE）：记住失败，别再反复试
      cv.dataset.dead = '1';
      off();
      return;
    }
  }
  if (cv.dataset.dead === '1') { off(); return; }

  const night = S.clock < 6 || S.clock > 19;
  if (S3.kind !== kind || S3.night !== night) {
    scene3dBuild(kind, night);
    S3.night = night;
  }
  cv.classList.add('on');
  if (sc) sc.classList.add('has3d');
  scene3dResize(cv);
  scene3dStart();
}

/* 宠物姿态：环境差会"躲起来"，出走预警时会"门口徘徊"——状态直接画在场景里 */
function petPoseOf(plot, sp) {
  if (!plot || plot.status === 'dead' || typeof petKindOf !== 'function') return '';
  const k = petKindOf(sp);
  if (!k || k.kind !== 'bond') return '';
  if (plot.bondHidden === 'hidden') return 'pet-hide';
  if (plot.runawayWarned && (plot.bond || 0) < 25) return 'pet-pace';
  return '';
}

function renderStageScene() {
  const slot = activeSlot();
  const scene = $('#scene');
  if (!slot) return;
  if (!slot.plot) {
    scene.className = 'scene empty';
    scene.innerHTML = `
      <div class="sceneBg" style="background-image:url(${spr('bg_greenhouse')})"></div>
      <div class="sceneGrain"></div>
      <div class="lightRays"></div>
      <div class="dust">${_dust()}</div>
      <div class="sceneVignette"></div>
      <div class="sceneEmpty">
        <div class="bigPlus">＋</div>
        <h3>这个培育位还空着</h3>
        <p>挑一株生命，调对它的环境，看它从一颗种子走到结果</p>
        <button class="btn primary" data-plant="${slot.id}">选择物种</button>
      </div>`;
    scene.querySelector('[data-plant]').addEventListener('click', () => openPicker(slot.id));
    scene3dSync('soil');
    return;
  }
  const plot = slot.plot, sp = SPECIES[plot.speciesId];
  const st = sp.stages[Math.min(plot.stage, sp.stages.length - 1)];
  const isWater = sceneKindOf(sp) === 'water';
  const grade = plot.status === 'ready' ? qualityGrade(plot.quality) : null;
  const env = envFor(slot);
  const ev = evaluateEnv(sp, env, plot.stage);
  const nv = evaluateNutrition(sp, plot.stage, plot.fertilized);

  const wKey = baseWeather().key;
  const mood = plantMood(ev, nv, plot);
  const petPose = petPoseOf(plot, sp);
  scene.className = 'scene' + (S.clock < 6 || S.clock > 19 ? ' night' : '')
    + (wKey === 'rain' ? ' rain' : '') + ' mood-' + mood.key;
  scene.dataset.stage = plot.stage;
  scene.innerHTML = `
    <div class="sceneBg" style="background-image:url(${spr(isWater ? 'bg_pond' : 'bg_greenhouse')})"></div>
    <canvas class="scene3dCanvas" id="scene3dCanvas"></canvas>
    <div class="sceneGrain"></div>
    <div class="lightRays"></div>
    <div class="dust">${_dust()}</div>
    <div class="rainSheet"></div>
    <div class="sceneVignette"></div>
    <div class="moodFx"></div>
    <div class="hero${petPose ? ' ' + petPose : ''}">
      <div class="heroImg ${plot.status === 'dead' ? 'dead' : ''}" style="background-image:url(${spr(st.img + '_orb')});background-position:${ORB_POS[st.img] || 'center'};transform:scale(${heroScale(plot.stage, sp.stages.length)})">
        <div class="heroSheen"></div>
      </div>
      <div class="heroShadow"></div>
    </div>
    <div class="hud hud-tl">
      <div class="speciesTag">${plot.graft ? plot.graft.name : sp.name}<span>${plot.graft ? `${SPECIES[plot.graft.host].name} 砧 · ${SPECIES[plot.graft.scion].name} 穗` : sp.latin}</span></div>
      <div class="habTag">${icon(habIcon(sp.habitat))} ${HAB[sp.habitat] || sp.habitat}${plot.graft ? ' · <b class="graftBadge">嫁接体</b>' : ''}</div>
      <div class="stagePath">${sp.stages.map((s, i) => `<span class="dot ${i < plot.stage ? 'done' : i === plot.stage ? 'cur' : ''}"><i></i>${s.name}</span>`).join('<em>›</em>')}</div>
    </div>
    <div class="hud hud-tr">
      ${plot.disease ? `<div class="alertChip sick">${icon('warning')}<div><b>${plot.disease.n}</b><em>${plot.disease.t}</em></div></div>` : ''}
      ${ev.score < 55 && plot.status !== 'dead' ? `<div class="alertChip warn">${icon('warning')}<div><b>环境胁迫</b><em>${ev.worst.name}偏离适宜区间</em></div></div>` : ''}
      ${nv.score < 50 && plot.status !== 'dead' ? `<div class="alertChip warn">${icon('warning')}<div><b>营养失衡</b><em>生长速率明显下降</em></div></div>` : ''}
      ${petPose === 'pet-hide' ? `<div class="alertChip warn">${icon('paw')}<div><b>它躲在角落里</b><em>这个环境让它没有安全感</em></div></div>` : ''}
      ${petPose === 'pet-pace' ? `<div class="alertChip bad">${icon('paw')}<div><b>它在门口徘徊</b><em>再不管它，它就要走了</em></div></div>` : ''}
      ${grade ? `<div class="alertChip good"><div><b style="color:${grade.color}">可收获 · ${grade.label}</b><em>品质评分 ${plot.quality}</em></div></div>` : ''}
    </div>
    <div class="hud hud-bl">
      <div class="lifeStrip">
        <div class="lifeRow"><span>健康</span><div class="bar"><i class="${plot.health < 40 ? 'red' : ''}" style="width:${plot.health}%"></i></div><b>${Math.round(plot.health)}</b></div>
        <div class="lifeRow"><span>本阶段</span><div class="bar"><i class="green" style="width:${plot.progress * 100}%"></i></div><b>${Math.round(plot.progress * 100)}%</b></div>
        <div class="lifeRow"><span>适生</span><div class="bar"><i class="blue" style="width:${ev.score}%"></i></div><b>${ev.score}</b></div>
      </div>
    </div>
    <div class="dayPlate"><span>第 ${plot.age} 天</span><em>${st.name}期</em></div>
    ${plot.status === 'ready' ? `<div class="readyOverlay"><div class="readyCard">
        <div class="gradeBig" style="color:${grade.color}">${grade.rank}</div>
        <div class="readyTitle">培育完成</div>
        <div class="readySub">${sp.name} · 品质评分 ${plot.quality}</div>
        <div class="readyMeta">历时 ${plot.age} 天 · 平均健康 ${Math.round(plot.history.reduce((a, b) => a + b, 0) / Math.max(1, plot.history.length))}</div>
        <button class="btn primary" id="btnHarvest">收获，并留下自留种</button>
      </div></div>` : ''}
    ${plot.status === 'dead' ? `<div class="readyOverlay"><div class="readyCard deadCard">
        <div class="gradeBig" style="color:#e0796c">✕</div>
        <div class="readyTitle">培育失败</div>
        <div class="readySub">死因：${plot.deathCause || '环境不适'}</div>
        <div class="readyMeta">${sp.name} · 存活 ${plot.age} 天</div>
        <button class="btn primary" id="btnClear">清理培育位</button>
      </div></div>` : ''}
  `;
  const hb = $('#btnHarvest'); if (hb) hb.addEventListener('click', doHarvest);
  const cb = $('#btnClear'); if (cb) cb.addEventListener('click', doClear);
  scene3dSync(sceneKindOf(sp));
}

/* 主体图的缩放：按"走完全程的比例"插值，而不是写死 5 档。
   物种阶段数不一样（鸡有 6 个），写死数组下标会在第 5 阶段取到 undefined。 */
const HERO_SCALES = [0.82, 0.88, 1.0, 1.06, 1.1];
function heroScale(stage, total) {
  const n = Math.max(1, (total || 5) - 1);
  const t = Math.max(0, Math.min(1, (stage || 0) / n));
  const pos = t * (HERO_SCALES.length - 1);
  const i = Math.floor(pos), j = Math.min(HERO_SCALES.length - 1, i + 1);
  const f = pos - i;
  return (HERO_SCALES[i] + (HERO_SCALES[j] - HERO_SCALES[i]) * f).toFixed(3);
}

/* 3D 场景与背景图按"物种"而非纯栖息地决定：
   绿头鸭住笼舍（land），但它需要水面，摆在温室台架上很违和；
   这类"同一栖息地但要另一套布景"的物种在这里单独指定。 */
const SCENE_KIND_SP = { duck: 'water' };

function sceneKindOf(sp) {
  if (!sp) return 'soil';
  if (SCENE_KIND_SP[sp.id]) return SCENE_KIND_SP[sp.id];
  return sp.habitat || 'soil';
}

// 依环境推导"植物状态"，用于画面色调与粒子反馈
function plantMood(ev, nv, plot) {
  if (plot.status === 'dead') return { key: 'dead' };
  const w = ev.worst;
  if (ev.worstF > 0.72) return { key: 'good' };
  if (w.key === 'temp') return { key: w.v < w.range[0] ? 'cold' : 'hot' };
  if (w.key === 'humid') return { key: w.v < w.range[0] ? 'dryair' : 'wet' };
  if (w.key === 'light') return { key: w.v < w.range[0] ? 'dark' : 'sun' };
  if (w.key === 'water') return { key: w.v < w.range[0] ? 'drought' : 'flood' };
  return { key: 'good' };
}

function _dust() {
  let h = '';
  for (let i = 0; i < 14; i++) {
    const l = (i * 37 + 11) % 96, t = (i * 53 + 23) % 88;
    const dur = 9 + ((i * 7) % 11), delay = -(i * 1.7) % dur;
    const sz = i % 4 === 0 ? 3 : 2;
    h += `<i style="left:${l}%;top:${t}%;width:${sz}px;height:${sz}px;animation-duration:${dur}s;animation-delay:${delay}s"></i>`;
  }
  return h;
}

function lightStage() {
  const slot = activeSlot();
  if (!slot || !slot.plot) return;
  const p = slot.plot, scene = $('#scene');
  const rows = scene.querySelectorAll('.lifeRow');
  if (rows[0]) { rows[0].querySelector('.bar i').style.width = p.health + '%'; rows[0].querySelector('b').textContent = Math.round(p.health); }
  if (rows[1]) { rows[1].querySelector('.bar i').style.width = p.progress * 100 + '%'; rows[1].querySelector('b').textContent = Math.round(p.progress * 100) + '%'; }
  const sp = SPECIES[p.speciesId];
  const st = sp.stages[Math.min(p.stage, sp.stages.length - 1)];
  const hi = scene.querySelector('.heroImg');
  if (hi) {
    const hero = hi.parentElement;
    const pose = petPoseOf(p, sp);
    if (hero) {
      hero.classList.toggle('pet-hide', pose === 'pet-hide');
      hero.classList.toggle('pet-pace', pose === 'pet-pace');
    }
    const url = `url(${spr(st.img + '_orb')})`;
    if (!hi.style.backgroundImage.includes(st.img + '_orb')) {
      hi.classList.remove('enter'); void hi.offsetWidth; hi.classList.add('enter');
    }
    hi.style.backgroundImage = url;
    hi.classList.toggle('dead', p.status === 'dead');
    const growth = heroScale(p.stage, SPECIES[p.speciesId].stages.length);
    hi.style.transform = `scale(${growth})`;
  }
  const dp = scene.querySelector('.dayPlate');
  if (dp) { dp.querySelector('span').textContent = `第 ${p.age} 天`; dp.querySelector('em').textContent = st.name + '期'; }
}

// ---------- 控制面板 ----------
function renderPanel() {
  const slot = activeSlot();
  const panel = $('#panel');
  if (!slot || !slot.plot) {
    panel.innerHTML = `<div class="panelEmpty">${icon('sprout')}<p>选中一个培育位后<br/>在这里安装设备、调节环境</p></div>`;
    return;
  }
  const plot = slot.plot, sp = SPECIES[plot.speciesId];
  const env = envFor(slot);
  const ev = evaluateEnv(sp, env, plot.stage);
  const nv = evaluateNutrition(sp, plot.stage, plot.fertilized);
  const need = nv.need;
  const isWater = sceneKindOf(sp) === 'water';
  const stName = sp.stages[Math.min(plot.stage, sp.stages.length - 1)].name;
  const dev = plot.devices || {};
  const adv = advice(sp, env, plot.stage, ev);

  // 每项环境指标：当前值 / 适宜区间 / 设备加成
  const d = deviceDelta(dev, plot.autoEff);
  const gauge = (key, label, unit, value, range, tol, extra, devAmt) => {
    const f = fitness(value, range, tol || 0.45);
    const cls = f > 0.9 ? 'ok' : f > 0.45 ? 'mid' : 'bad';
    const min = extra.min, max = extra.max;
    const lo = clamp(((range[0] - min) / (max - min)) * 100, 0, 100);
    const hi = clamp(((range[1] - min) / (max - min)) * 100, 0, 100);
    const pos = clamp(((value - min) / (max - min)) * 100, 0, 100);
    return `<div class="gauge ${cls}">
      <div class="gLabel"><span>${label}</span><b>${value}${unit}</b></div>
      <div class="gTrack">
        <div class="gZone" style="left:${lo}%;width:${Math.max(hi - lo, 1)}%"></div>
        <div class="gDot" style="left:${pos}%"></div>
      </div>
      <div class="gRange">${range[0]}–${range[1]}${unit}${devAmt ? `<i class="devAmt">${devAmt > 0 ? '+' : ''}${devAmt}</i>` : ''}</div>
    </div>`;
  };

  const devBtn = (key, label, effect, active) => `
    <button class="devBtn ${active ? 'on' : ''}" data-dev="${key}">
      <i>${icon(DEVICE_ICON[key] || 'sun')}</i>
      <span>${label}</span>
      <small>${effect}</small>
      <em class="devLed"></em>
    </button>`;

  // 氨氮是"越低越好"的反向指标，热力学条要反过来画
  const amGauge = (v, hi, devAmt) => {
    const f = v <= hi ? 1 : Math.max(0, 1 - (v - hi) / (hi * 2 + 0.15));
    const cls = f > 0.9 ? 'ok' : f > 0.45 ? 'mid' : 'bad';
    const max = hi * 3;
    const pos = clamp((v / max) * 100, 0, 100);
    const zone = clamp((hi / max) * 100, 0, 100);
    return `<div class="gauge ${cls}">
      <div class="gLabel"><span>氨氮</span><b>${v} mg/L</b></div>
      <div class="gTrack">
        <div class="gZone" style="left:0;width:${zone}%"></div>
        <div class="gDot" style="left:${pos}%"></div>
      </div>
      <div class="gRange">安全 0–${hi} mg/L${devAmt ? `<i class="devAmt">${devAmt > 0 ? '+' : ''}${devAmt.toFixed(2)}</i>` : ''}</div>
    </div>`;
  };

  const nutBar = (k, full) => {
    const v = plot.fertilized[k], n = need[k];
    const d = v - n;
    const cls = Math.abs(d) <= 12 ? 'ok' : d > 0 ? 'over' : 'under';
    return `<div class="nutRow">
      <span class="nutName">${full}</span>
      <div class="nutBarWrap">
        <div class="nutNeed" style="left:${n}%"></div>
        <div class="nutBar ${cls}" style="width:${clamp(v, 0, 100)}%"></div>
      </div>
      <b>${Math.round(v)}</b><em class="${cls}">${d > 12 ? '+' : ''}${Math.round(d)}</em>
    </div>`;
  };

  const tip = nv.score > 85 ? '配比接近该阶段需求，枝叶与花果都能兼顾。'
    : nv.deficit.N > 12 ? '氮不足：叶色偏淡、抽枝缓慢。'
      : nv.deficit.P > 12 ? '磷不足：根系弱，花芽分化差。'
        : nv.deficit.K > 12 ? '钾不足：抗逆性差，果实糖度低。'
          : '某元素过量会抑制其他元素吸收，注意配平。';

  panel.innerHTML = `
    <div class="panelHead">
      <div class="phTitle">${sp.name}<small>${stName}期</small><i class="genTag" style="color:${strainLabel(plot.vig).c};font-style:normal">G${plot.gen || 1}</i></div>
      <div class="phSub">${sp.category} · 难度 ${stars(sp.difficulty)} · <span style="color:${strainLabel(plot.vig).c}">${strainLabel(plot.vig).t}</span> 活力 ${plot.vig > 0 ? '+' : ''}${plot.vig || 0}</div>
    </div>

    <div class="advice ${adv.level}">
      <span class="advIcon">${icon(adv.icon)}</span>
      <div><b>${adv.title}</b><em>${adv.text}</em></div>
    </div>

    <section class="psec">
      <div class="secTitle">环境读数<span class="secScore ${ev.score > 75 ? 'ok' : ev.score > 50 ? 'mid' : 'bad'}">适生 ${ev.score}</span></div>
      ${gauge('temp', '温度', '℃', env.temp.toFixed(1), sp.env.temp, 0.45, { min: 2, max: 40 }, d.temp)}
      ${gauge('humid', '湿度', '%', Math.round(env.humid), sp.env.humid, 0.45, { min: 20, max: 100 }, d.humid)}
      ${gauge('light', '日照', 'h', env.light.toFixed(1), sp.env.light, 0.5, { min: 0, max: 16 }, d.light)}
      ${isWater ? '' : gauge('water', (typeof H2O_LABEL !== 'undefined' && H2O_LABEL[sp.habitat]) || '含水', '%', Math.round(env.water), sp.env.water, 0.5, { min: 0, max: 100 }, 0)}
    </section>

    ${isWater ? pondBlock(slot) : soilBlock(slot)}
    ${typeof petBlock === 'function' ? petBlock(slot) : ''}

    <section class="psec">
      <div class="secTitle">增减设备<span class="secScore">点一下开关</span></div>
      <div class="devGrid">
        ${devBtn('heater', '加温', '+4℃', dev.heater)}
        ${devBtn('cooler', '降温', '−4℃', dev.cooler)}
        ${isWater
          ? `${devBtn('aerator', '增氧泵', '溶氧 +2.4', dev.aerator)}
             ${devBtn('filter', '生态过滤', '氨氮 −0.22', dev.filter)}
             ${devBtn('canopy', '遮光棚', '光照 −2h', dev.canopy)}
             ${devBtn('change', '换水', '22 币 / 次', false)}`
          : `${devBtn('humid', '加湿', '+12%', dev.humid)}
             ${devBtn('dry', '除湿', '−12%', dev.dry)}
             ${devBtn('lamp', '补光', '+3.5h', dev.lamp)}
             ${devBtn('shade', '遮阳', '−2.5h', dev.shade)}`}
      </div>
      <div class="fineRow">
        <button class="btn small ghost" data-act="water" ${isWater ? 'disabled' : ''}>${icon('drop')} ${WATER_ACT[sp.habitat] || '浇水'} +22%</button>
        <button class="btn small ghost" data-act="autoAdjust">一键调到适宜</button>
      </div>
      ${isWater ? `<div class="pondNote">水体是活系统：溶氧每天被鱼消耗、氨氮每天由残饵累积。增氧泵常开、过滤定期开，氨氮逼近 0.25 就换一次水。</div>`
        : ((SPECIES_NOTE[sp.id] || HAB_NOTE[sp.habitat]) ? `<div class="pondNote">${SPECIES_NOTE[sp.id] || HAB_NOTE[sp.habitat]}</div>` : '')}
      ${upgradeLevel(S, 'auto') ? `<div class="autoBar">
        <span class="autoDot"></span>自动调控运行中（Lv.${upgradeLevel(S, 'auto')}）${upgradeLevel(S, 'auto') >= 2 ? ' · 含自动补水' : ''} · ${upgradeLevel(S, 'auto') * 4} 币/天
      </div>` : ''}
    </section>

    <section class="psec">
      <div class="secTitle">营养配比<span class="secScore ${nv.score > 75 ? 'ok' : nv.score > 50 ? 'mid' : 'bad'}">均衡 ${nv.score}</span></div>
      ${nutBar('N', '氮')}${nutBar('P', '磷')}${nutBar('K', '钾')}
      <div class="nutTip">白线是此阶段需求量，色条是当前供给。${tip}</div>
      <div class="feedRow">
        <button class="btn small" data-feed="N">氮肥</button>
        <button class="btn small" data-feed="P">磷肥</button>
        <button class="btn small" data-feed="K">钾肥</button>
        <button class="btn small primary" data-feed="auto">按阶段配肥</button>
      </div>
    </section>

    <section class="psec">
      <div class="secTitle">养护处置</div>
      <div class="actRow">
        <button class="btn small warn" data-act="cure" ${plot.disease ? '' : 'disabled'}>${icon('flask')} 防治病害 ${plot.disease ? '30 币' : '（无病害）'}</button>
        <button class="btn small danger" data-act="abandon">${icon('recycle')} 放弃重来</button>
      </div>
    </section>

    <section class="psec">
      <div class="secTitle">健康曲线<span class="secScore">${plot.history.length} 天记录</span></div>
      <div class="chartWrap"><canvas id="chart"></canvas></div>
    </section>

    <section class="psec">
      <div class="secTitle">${stName}期 · 科普</div>
      <p class="stageDesc">${sp.stages[Math.min(plot.stage, sp.stages.length - 1)].desc}</p>
      <div class="facts">${sp.facts.map(f => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('')}</div>
    </section>
  `;
  bindPanelEvents();
  drawChart(plot);
}

const DEVICE_ICON = { heater: 'fire', cooler: 'wind', humid: 'drop', dry: 'fan', lamp: 'sun', shade: 'shade',
  aerator: 'fan', filter: 'recycle', change: 'drop', canopy: 'shade' };

// 给出当前最该做的一件事
function advice(sp, env, stageIdx, ev) {
  const worst = ev.worst;
  const short = Math.abs(worst.v < worst.range[0] ? worst.range[0] - worst.v : worst.v - worst.range[1]);
  const map = {
    temp: { low: ['温度偏低', '开「加温」，或关掉降温风扇', 'fire'], high: ['温度偏高', '开「降温」或「遮阳」，加强通风', 'snow'] },
    humid: { low: ['空气太干', '开「加湿」雾化；土培可先浇水', 'drop'], high: ['湿度过高', '开「除湿」，加大通风', 'fan'] },
    light: { low: ['日照不足', '开「补光」灯，或把遮阳网收起来', 'sun'], high: ['日照过强', '拉开「遮阳」网，注意叶片灼伤', 'shade'] },
    water: { low: ['土壤偏干', '点「浇水」，或把含水调高', 'drop'], high: ['土壤过湿', '暂停浇水，加强通风蒸发', 'wind'] },
    soilPH: { low: ['土壤偏酸', '少量石灰调碱', 'flask'], high: ['土壤偏碱', '补充有机质调酸', 'flask'] },
    do: { low: ['溶氧不足', '开「增氧泵」；遮光棚会加重缺氧，先别开', 'wind'], high: ['溶氧过饱和', '关掉增氧泵，气泡过多会让鱼应激', 'fan'] },
    ammonia: { low: ['水质良好', '保持过滤运行即可', 'drop'], high: ['氨氮超标', '开「生态过滤」并换一次水，同时减少投喂', 'warning'] }
  };
  const key = worst.key;
  const dir = worst.v < worst.range[0] ? 'low' : 'high';
  const m = map[key] && map[key][dir];
  if (!m) return { level: 'ok', icon: 'leaf', title: '环境适宜', text: '保持现状，等它慢慢长大' };
  if (ev.score >= 82) {
    // 装了自动调控就别再催玩家动手了，只做告知
    if (upgradeLevel(S, 'auto')) {
      const covered = worst.f >= 0.85;
      return { level: 'ok', icon: 'leaf', title: '自动调控维持中',
        text: covered ? `${worst.name}在可接受范围边缘，自动系统已接管` : `${worst.name}${dir === 'low' ? '偏' : '偏'}${dir === 'low' ? '低' : '高'}，可能超出温室功率` };
    }
    return { level: 'ok', icon: 'leaf', title: '状态良好', text: `${worst.name}略${dir === 'low' ? '低' : '高'}，可以顺手调一下` };
  }
  return {
    level: ev.score >= 55 ? 'warn' : 'bad',
    icon: 'warning',
    title: `${m[0]}（${worst.name}${dir === 'low' ? '低' : '高'} ${short.toFixed(key === 'do' || key === 'ammonia' ? 2 : key === 'light' ? 1 : 0)}${worst.unit}）`,
    text: m[1]
  };
}

// 池塘生态模块：水体不是"一块地"，用另一套语言描述它的状态与打理节奏
function pondBlock(slot) {
  const p = slot && slot.plot; if (!p || !p.pond) return '';
  const P = p.pond;
  const env = envFor(slot);
  const doOk = env.do >= 6.0 && env.do <= 9.5;
  const amOk = env.ammonia <= 0.25;
  const cl = P.clarity || 78;
  const clTxt = cl > 75 ? ['清澈', 'ok'] : cl > 55 ? ['微浑', 'mid'] : ['浑浊', 'bad'];
  const fresh = P.days || 0;
  const freshTxt = fresh < 4 ? '刚换过水' : fresh < 9 ? '水质尚新' : fresh < 15 ? '该打理了' : '久未换水';
  const chainTxt = amOk ? '氮循环通畅：氨被硝化细菌持续转成低毒硝酸盐' : '氮循环被压垮：氨的生成速度超过硝化速度，鳃部开始受损';
  // 溶氧要区分三档：低于下限=缺氧、高于上限=过饱和（同样应激），中间才是舒适
  const dLo = 6.0, dHi = 9.5;
  const doState = env.do < dLo ? ['bad', '缺氧'] : env.do > dHi ? ['mid', '过饱和'] : env.do > 9.0 ? ['mid', '偏高'] : ['ok', '充足'];
  const d = deviceDelta(p.devices, p.autoEff);
  const devAero = d.do ? +d.do.toFixed(1) : 0;
  const doPos = Math.max(0, Math.min(100, ((env.do - 1) / 11) * 100));
  const doZone = [((dLo - 1) / 11) * 100, ((dHi - dLo) / 11) * 100];
  const amPos = Math.max(0, Math.min(100, (env.ammonia / 0.75) * 100));
  const amZone = (0.25 / 0.75) * 100;
  return `<section class="psec">
    <div class="secTitle">池塘生态<span class="secScore ${doOk && amOk ? 'ok' : 'bad'}">${doOk && amOk ? '水质稳定' : '需要打理'}</span></div>
    <div class="pondStat">
      <div class="psItem ${doState[0]}"><b>${env.do}</b><span>溶氧 mg/L · ${doState[1]}${devAero ? ` 泵+${devAero}` : ''}</span>
        <div class="psTrack"><i style="left:${doZone[0]}%;width:${doZone[1]}%"></i><em style="left:${doPos}%"></em></div></div>
      <div class="psItem ${amOk ? 'ok' : 'bad'}"><b>${env.ammonia}</b><span>氨氮 mg/L · ${amOk ? '安全' : '超标'}</span>
        <div class="psTrack"><i style="left:0;width:${amZone}%"></i><em style="left:${amPos}%"></em></div></div>
      <div class="psItem ${clTxt[1]}"><b>${cl}%</b><span>浊度 · ${clTxt[0]}</span></div>
      <div class="psItem ${fresh < 9 ? 'ok' : 'mid'}"><b>${fresh} 天</b><span>${freshTxt}</span></div>
    </div>
    <div class="pondChain ${amOk ? 'ok' : 'bad'}">${chainTxt}</div>
    <div class="pondTip">${amOk && doOk
      ? '眼下不用动。留意溶氧每天会掉 0.3 左右，掉到 6.0 以下鱼会浮头。'
      : amOk ? '溶氧偏低：开「增氧泵」；若同时开着遮光棚，它会压氧，先关掉。'
        : '氨氮超标：先开「生态过滤」并换水，再把氮肥降下来（投喂过量是主因）。'}</div>
  </section>`;
}

// 地力模块：连作疲劳的可视化 + 翻耕 + 轮作建议
// 地力在不同栖息地有不同叫法：土壤叫地力、笼舍叫垫料环境、蜂箱叫巢脾状态、菌床叫基质
const SOIL_WORD = {
  soil: { name: '地力', act: '翻耕改良', empty: '空置' },
  land: { name: '垫料卫生', act: '清栏换垫', empty: '空栏' },
  hive: { name: '巢脾状态', act: '换脾清巢', empty: '空箱' },
  dark: { name: '基质状态', act: '更换菌包', empty: '撤包' }
};
// 同栖息地的不同物种，"基质状态/更换菌包"对蚕不适用
const SOIL_WORD_SP = {
  duck: { name: '池水洁净', act: '换池水', empty: '空池' },
  tortoise: { name: '垫材洁净', act: '换垫材', empty: '空箱' },
  silkworm: { name: '蚕座卫生', act: '除沙扩座', empty: '空匾' },
  owl: { name: '巢箱卫生', act: '清巢换屑', empty: '空巢' },
  chicken: { name: '鸡舍卫生', act: '清粪换垫', empty: '空舍' },
  dog: { name: '犬舍卫生', act: '清洗消毒', empty: '空笼' },
  cat: { name: '猫砂清洁', act: '全换猫砂', empty: '空舍' }
};

function soilBlock(slot) {
  if (typeof soilOf !== 'function') return '';
  const spNow = slot.plot ? SPECIES[slot.plot.speciesId] : null;
  const wd = (spNow && SOIL_WORD_SP[spNow.id]) || SOIL_WORD[(spNow && spNow.habitat) || 'soil'] || SOIL_WORD.soil;
  const so = soilOf(S, slot.id);
  const f = so.fatigue;
  const stt = soilState(f);
  const pen = soilPenalty(S, slot.id);
  const cost = soilFixCost(S, slot.id);
  const hint = rotationHint(S, slot.id);
  const suggest = hint.suggest.slice(0, 3).map(id => SPECIES[id].name).join('、');
  const pct = Math.round(f);
  const diseasePct = Math.round(pen.disease * 100);
  return `<section class="psec">
    <div class="secTitle">${wd.name}<span class="secScore" style="color:${stt.color}">${stt.name} ${pct}</span></div>
    <div class="soilBar"><i style="width:${pct}%;background:${stt.color}"></i></div>
    <div class="soilFx">
      ${pen.env > 0.005 ? `<span class="sx bad">适生 −${(pen.env * 100).toFixed(0)}</span>` : '<span class="sx ok">适生 无影响</span>'}
      ${pen.yield > 0.005 ? `<span class="sx bad">产量 −${(pen.yield * 100).toFixed(0)}%</span>` : '<span class="sx ok">产量 正常</span>'}
      ${diseasePct > 0 ? `<span class="sx bad">病害 +${diseasePct}%</span>` : '<span class="sx ok">病害 正常</span>'}
    </div>
    <div class="soilTip">${f >= 34
      ? `${wd.name}已经劣化，上一轮是 <b>${hint.last ? SPECIES[hint.last].name : '—'}</b>。下一轮建议换成 <b>${suggest}</b>，或${wd.empty}几天让它自然恢复。`
      : `${wd.name}良好。同一槽位连续养同一物种会累积劣化，换物种或${wd.empty}可恢复。`}</div>
    ${cost > 0 ? `<button class="btn small ghost" data-act="till" ${S.coins < cost ? 'disabled' : ''}>${wd.act} ${cost} 币</button>` : ''}
  </section>`;
}

function bindPanelEvents() {
  $$('#panel [data-dev]').forEach(b => b.addEventListener('click', () => toggleDevice(b.dataset.dev)));
  $$('#panel [data-feed]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.feed, plot = activeSlot().plot; if (!plot) return;
    if (k === 'auto') {
      const need = SPECIES[plot.speciesId].nutrition[Math.min(plot.stage, SPECIES[plot.speciesId].nutrition.length - 1)];
      plot.fertilized = { N: need.N, P: need.P, K: need.K };
      hitTask('feed2');
      toast(`已按${SPECIES[plot.speciesId].stages[Math.min(plot.stage, SPECIES[plot.speciesId].stages.length - 1)].name}期需求配肥`, 'good');
    }
    else if (k === 'mix') ['N', 'P', 'K'].forEach(x => plot.fertilized[x] = clamp(plot.fertilized[x] + 20, 0, 100));
    else { plot.fertilized[k] = clamp(plot.fertilized[k] + 22, 0, 100); hitTask('feed2'); }
    renderPanel(); saveGame(S);
  }));
  $$('#panel [data-act]').forEach(b => b.addEventListener('click', () => handleAction(b.dataset.act)));
}

function toggleDevice(key) {
  const slot = activeSlot(), plot = slot && slot.plot; if (!plot) return;
  plot.devices = plot.devices || {};
  const e = DEVICE_EFFECT[key];
  // 换水是一次性动作：扣钱、立刻改善水质，不留开关状态
  if (e && e.once) {
    if (S.coins < e.cost) return toast('金币不足，换一次水要 22 币', 'warn');
    S.coins -= e.cost;
    const P = plot.pond || (plot.pond = { do: 6.6, ammonia: 0.12, clarity: 78, days: 0 });
    P.ammonia = clamp(P.ammonia + e.ammonia, 0, 3);
    P.do = clamp(P.do + e.do, 1.2, 12);
    P.clarity = clamp((P.clarity || 78) + 26, 20, 100);
    sfx('refill');
    addLog(S, `${SPECIES[plot.speciesId].name} 换水，氨氮降至 ${P.ammonia.toFixed(2)}`, 'good');
    toast(`换水完成，氨氮 −0.35、溶氧 +0.6（−${e.cost} 币）`, 'good');
    hitTask('adjust3');
    renderAll(); saveGame(S);
    return;
  }
  plot.devices[key] = !plot.devices[key];
  sfx('device');
  // 互斥：加温/降温、加湿/除湿、补光/遮阳、增氧/遮光棚
  const pairs = { heater: 'cooler', cooler: 'heater', humid: 'dry', dry: 'humid', lamp: 'shade', shade: 'lamp', aerator: 'canopy', canopy: 'aerator' };
  if (plot.devices[key] && pairs[key]) plot.devices[pairs[key]] = false;
  hitTask('dev2');
  hitTask('adjust3');
  toast(`${e.label}已${plot.devices[key] ? '开启' : '关闭'}${plot.devices[key] ? '（' + e.tip + '）' : ''}`, plot.devices[key] ? 'good' : 'info');
  renderAll(); saveGame(S);
}

function handleAction(act) {
  const slot = activeSlot(), plot = slot && slot.plot; if (!plot) return;
  const sp = SPECIES[plot.speciesId];
  if (act === 'water') { sfx('water'); plot.waterBonus = (plot.waterBonus || 0) + 22; toast('已浇水，土壤含水 +22%'); hitTask('water2'); }
  if (act === 'egg') { collectEggs(slot); }
  if (act === 'play') { petPlay(slot); }
  if (act === 'autoAdjust') {
    const t = targetEnv(sp, plot.stage);
    plot.devices = {};
    // 手动一键：偏移有上限、设备只用单台（自动调控才是成组运行 + 2 级自动补水）
    solveEnv(plot, t, { manual: true });
    plot.waterBonus = t.water - seasonEff().water - baseWeather().soilWater;
    // 手动能力有物理上限：蜂箱要 34℃、菌床几乎不能有光，这些靠单台设备 + ±3 偏移够不到。
    // 与其让玩家以为"调适失灵"，不如直接说清楚差在哪、要装什么才能补上。
    let after = 100;
    try {
      after = evaluateEnv(sp, envFor(slot), plot.stage).score;
    } catch (e) { /* 计算失败不影响主流程 */ }
    if (after < 85) {
      const w = evaluateEnv(sp, envFor(slot), plot.stage).worst;
      toast(`已调到手动极限（适生 ${after}）：${w.name}还差一截，需靠温室改造或自动调控补足`, 'warn');
      addLog(S, `手动调节已到上限，短板为「${w.name}」`, 'info');
    } else {
      toast('已按该阶段最优区间调节', 'good');
    }
    hitTask('adjust3');
  }
  if (act === 'till') {
    const cost = soilFixCost(S, slot.id);
    if (!cost) return;
    if (S.coins < cost) return toast('金币不足', 'warn');
    S.coins -= cost;
    soilOf(S, slot.id).fatigue = 0;
    soilOf(S, slot.id).hist = [];
    S.stats.tills = (S.stats.tills || 0) + 1;
    addLog(S, `第 ${slot.id} 区完成翻耕，地力恢复`, 'good');
    toast('翻耕完成，地力已恢复', 'good');
    renderAll(); saveGame(S);
    return;
  }
  if (act === 'cure') {
    if (!plot.disease) return;
    hitTask('cure1');
    if (S.coins < 30) return toast('金币不足', 'warn');
    S.coins -= 30; plot.disease = null; plot.diseaseDays = 0; plot.health = Math.min(100, plot.health + 14);
    toast('病害已控制', 'good');
  }
  if (act === 'abandon') {
    if (!confirm('放弃这株？投入的种子与时间不会返还。')) return;
    abandonPlot(slot);
    toast('培育位已清理');
  }
  renderAll(); saveGame(S);
}

function abandonPlot(slot) {
  const p = slot.plot;
  S.stats.rounds = (S.stats.rounds || 0) + 1;   // 放弃也算一轮，与年报成功率口径（按 records）一致
  S.stats.failed += 1;
  S.records.unshift(makeRecord(slot, Object.assign({}, p, { deathCause: '主动放弃' }), false));
  const cx = S.codex[p.speciesId] || { seen: [], harvested: 0, failed: 0, best: 0 };
  cx.failed = (cx.failed || 0) + 1; S.codex[p.speciesId] = cx;
  addLog(S, `${SPECIES[p.speciesId].name} 被放弃`, 'bad');
  slot.plot = null;
  if (S.records.length > 80) S.records.length = 80;
  pulseAchievements();
}

function drawChart(plot) {
  const c = $('#chart'); if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 300, h = 74;
  c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const data = plot.history.length ? plot.history : [100];
  const n = Math.max(data.length, 2);
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach(p => { ctx.beginPath(); ctx.moveTo(0, h * p); ctx.lineTo(w, h * p); ctx.stroke(); });
  const pt = (v, i) => [ (i / (n - 1)) * w, h - (v / 100) * (h - 8) - 4 ];
  const col = plot.health < 45 ? '#e0796c' : '#5bd09a';
  ctx.beginPath();
  data.forEach((v, i) => { const [x, y] = pt(v, i); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, plot.health < 45 ? 'rgba(224,121,108,.28)' : 'rgba(91,208,154,.3)');
  grad.addColorStop(1, 'rgba(91,208,154,0)');
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  const [lx, ly] = pt(data[data.length - 1], data.length - 1);
  ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, 7); ctx.fillStyle = col; ctx.fill();
}

function renderLog() {
  const box = $('#logList'); if (!box) return;
  box.innerHTML = S.log.slice(0, 10).map(l => `<div class="logItem ${l.k}"><span class="logDay">D${l.d}</span><span>${l.t}</span></div>`).join('') || `<div class="logEmpty">暂无记录</div>`;
}

// ---------- 行为 ----------
let pickerSlot = 1;
function openPicker(slotId) {
  pickerSlot = slotId;
  $('#toasts').innerHTML = '';   // 清掉残留提示，避免压住选种卡片
  const grid = $('#pickerGrid');
  grid.innerHTML = SPECIES_ORDER.map(id => {
    const sp = SPECIES[id];
    const cx = S.codex[id] || { seen: [], harvested: 0, failed: 0 };
    const owned = S.inventory[id] || 0;
    const price = seedPrice(sp);
    const hab = icon(habIcon(sp.habitat));
    return `<div class="speciesCard" data-pick="${id}">
      <div class="scImg" style="background-image:url(${spr(sp.stages[sp.stages.length - 1].img)})">
        <div class="scDiff">${stars(sp.difficulty)}</div>
        <div class="scHab">${hab}</div>
      </div>
      <div class="scBody">
        <div class="scName">${sp.name}</div>
        <div class="scLatin">${sp.latin}</div>
        <div class="scBlurb">${sp.blurb}</div>
        <div class="scEnv">适宜 ${sp.env.temp[0]}–${sp.env.temp[1]}℃ · ${sp.env.humid[0]}–${sp.env.humid[1]}% · 光照 ${sp.env.light[0]}–${sp.env.light[1]}h</div>
        ${sp.need ? `<div class="scNeed">${sp.need}</div>` : ''}
        <div class="scFoot"><span class="scOwn">持有 ${owned.length} 粒${bestStrain(id)}</span>
          <button class="btn small ${owned.length > 0 ? 'primary' : ''}">${owned.length > 0 ? '播种' : `买入 ${price}`}</button></div>
        <div class="scCodex">图鉴 ${cx.seen.length}/5 · 成功 ${cx.harvested} · 失败 ${cx.failed}</div>
      </div>
    </div>`;
  }).join('');
  $$('.speciesCard', grid).forEach(card => card.addEventListener('click', () => {
    const id = card.dataset.pick;
    const seeds = seedList(id);
    // 只有"种子确实有差别"时才让玩家挑，否则直接播最优那粒（避免无意义的重复选择）
    const distinct = new Set(seeds.map(s => s.gen + ':' + s.vig)).size;
    if (seeds.length > 1 && distinct > 1) openSeedPicker(pickerSlot, id);
    else plantTo(pickerSlot, id);
  }));
  sfx('open');
  $('#picker').classList.add('show');
  // 模态互斥：避免多个弹窗叠在一起互相遮挡
  ['#seedModal', '#crossModal', '#orderModal', '#upModal', '#harvestModal', '#helpModal', '#aboutModal'].forEach(s => {
    const el = $(s); if (el) el.classList.remove('show');
  });
}

// 种子清单（旧存档为数字，自动迁移为对象）
function seedList(id) {
  let v = S.inventory[id];
  if (!Array.isArray(v)) {
    const n = Number(v) || 0;
    v = [];
    for (let i = 0; i < n; i++) v.push({ gen: 1, vig: 0 });
    S.inventory[id] = v;
  }
  return v;
}
function bestStrain(id) {
  const l = seedList(id);
  if (!l.length) return '';
  const b = l.reduce((a, s) => (s.vig > a.vig ? s : a));
  const lb = strainLabel(b.vig);
  return ` · 最佳 <i style="color:${lb.c};font-style:normal">G${b.gen} ${lb.t}</i>`;
}

// 多粒种子时：按代与活力排序，让玩家自选播哪一粒
let seedPickCtx = null;
function openSeedPicker(slotId, speciesId) {
  seedPickCtx = { slotId, speciesId };
  const sp = SPECIES[speciesId];
  const list = seedList(speciesId).slice().sort((a, b) => b.vig - a.vig || b.gen - a.gen);
  const box = $('#seedList');
  box.innerHTML = list.map((s, i) => {
    const lb = strainLabel(s.vig);
    const vb = vigBonus(s.vig), vs = vigSpeed(s.vig);
    const vigTint = s.vig > 0 ? '#7ddc9b' : s.vig < 0 ? '#e0796c' : '#9fb8a4';
    return `<div class="seedRow" data-seed="${i}">
      <span class="seedGen">G${s.gen}</span>
      <span class="seedTag" style="color:${lb.c}">${lb.t}</span>
      <span class="seedVig">活力 <b style="color:${vigTint}">${s.vig > 0 ? '+' : ''}${s.vig}</b></span>
      <span class="seedFx">评分 ${vb > 0 ? '+' : ''}${vb.toFixed(1)} · 生长 ×${vs.toFixed(2)}</span>
      <button class="btn small primary">播种</button>
    </div>`;
  }).join('');
  $$('.seedRow', box).forEach(r => r.addEventListener('click', () => {
    const s = list[Number(r.dataset.seed)];
    plantSeed(slotId, speciesId, s);
  }));
  $('#seedModal').querySelector('h2').textContent = `选择${sp.name}种子`;
  // 关键：先收起物种选择，否则种子弹窗被压在下面，玩家以为"点了没反应"
  $('#picker').classList.remove('show');
  sfx('open');
  $('#seedModal').classList.add('show');
}

function plantSeed(slotId, speciesId, strain) {
  const slot = S.slots.find(s => s.id === slotId);
  if (!slot || !slot.unlocked) return;
  sfx('plant');
  const sp = SPECIES[speciesId];
  const list = seedList(speciesId);
  const idx = list.findIndex(s => s === strain || (s.gen === strain.gen && s.vig === strain.vig));
  if (idx < 0) return;
  list.splice(idx, 1);
  $('#seedModal').classList.remove('show');
  $('#picker').classList.remove('show');
  const fatigueAdd = applyCropRotation(S, slotId, speciesId);
  slot.plot = newPlot(speciesId, { gen: strain.gen, vig: strain.vig });
  slot.plot.bornDay = S.day;
  const sp_ = soilPenalty(S, slotId);
  slot.plot.soilFatigue = soilOf(S, slotId).fatigue;
  if (fatigueAdd > 0) {
    addLog(S, `连作警告：第 ${slotId} 区地力下降（疲劳 ${Math.round(slot.plot.soilFatigue)}），适生与产量受影响`, 'bad');
  }
  // 播种时按当前季节预置偏移：瞄准本阶段最优，并保证光照不低于下限
  const t0 = targetEnv(sp, 0);
  const ef0 = seasonEff(), w0 = baseWeather();
  const wT = dayTempBase(w0);
  const targetL = Math.max(t0.light, sp.env.light[0] + 0.6);
  slot.plot.settings = {
    dTemp: +(t0.temp - wT - ef0.temp).toFixed(1),
    dHumid: Math.round(t0.humid - w0.humidBase - ef0.humid),
    dLight: +(targetL - cumulativeLight() - ef0.light).toFixed(1)
  };
  slot.plot.waterBonus = (t0.water - ef0.water - w0.soilWater);
  slot.plot.devices = {};
  currentSlot = slotId;
  addLog(S, `${sp.name} G${strain.gen} 开始培育（第 ${slotId} 区）`, 'info');
  markSeen(speciesId, sp.stages[0].key);
  renderAll(); saveGame(S);
  toast(`${sp.name} G${strain.gen} 已播种${strain.vig > 0 ? '，活力 +' + strain.vig : ''}`, 'good');
}

function plantTo(slotId, speciesId) {
  const slot = S.slots.find(s => s.id === slotId);
  if (!slot || !slot.unlocked) return;
  const sp = SPECIES[speciesId];
  const seeds = seedList(speciesId);
  const price = seedPrice(sp);
  if (!seeds.length) {
    if (S.coins < price) return toast('金币不足，无法买入种子', 'warn');
    S.coins -= price; floatCoins(-price); seeds.push({ gen: 1, vig: 0 });
  }
  // 自动播活力最高的一粒
  const best = seeds.reduce((a, s) => (s.vig > a.vig ? s : a));
  plantSeed(slotId, speciesId, best);
}

// 槽位实际价格（含等级折扣）
function slotPrice(slot) { return Math.round(slot.price * levelPerk(S).slotDiscount); }

function tryUnlock(slotId) {
  const slot = S.slots.find(s => s.id === slotId);
  if (!slot || slot.unlocked) return;
  const price = slotPrice(slot);
  if (S.coins < price) return toast(`还需 ${price - S.coins} 金币`, 'warn');
  S.coins -= price; floatCoins(-price); slot.unlocked = true; const old = slot.price; slot.price = old * 2;
  addXp(S, 30);
  addLog(S, `扩建第 ${slotId} 区完成`, 'good');
  renderAll(); saveGame(S); toast('培育区已扩建', 'good');
}

// 收获仓：单位估值（品质越高越值钱）
function fridgeUnitPrice(spId, quality) {
  const sp = SPECIES[spId];
  const q = quality || 70;
  let evMult = 1;
  if (S.rush && S.rush.until >= S.day) evMult *= S.rush.mult;
  if (S.priceBoost && S.priceBoost.until >= S.day) evMult *= S.priceBoost.mult;
  const base = 6 + sp.yield.base * 4 * Math.pow(q / 100, 1.5);
  return Math.round(base * marketFactor(spId, S.day) * evMult);
}

// 收获仓按批次存储：{ speciesId: [{q:品质, n:数量}] }，旧存档为数字则迁移
function fridgeBatches(k) {
  let v = S.fridge[k];
  if (typeof v === 'number') { v = v > 0 ? [{ q: 78, n: v }] : []; S.fridge[k] = v; }
  if (!Array.isArray(v)) { v = []; S.fridge[k] = v; }
  return v;
}
function fridgeAdd(k, q, n) {
  const list = fridgeBatches(k);
  const hit = list.find(b => Math.abs(b.q - q) < 0.5);
  if (hit) hit.n += n; else list.push({ q, n });
  list.sort((a, b) => b.q - a.q);
}
function fridgeCount() {
  let n = 0;
  Object.keys(S.fridge).forEach(k => fridgeBatches(k).forEach(b => { n += b.n; }));
  return n;
}
function fridgeValue() {
  let v = 0;
  Object.keys(S.fridge).forEach(k => {
    fridgeBatches(k).forEach(b => { v += b.n * fridgeUnitPrice(k, b.q); });
  });
  return Math.round(v);
}

function doHarvest() {
  const slot = activeSlot(), plot = slot.plot; if (!plot) return;
  const sp = SPECIES[plot.speciesId];
  const val = harvestValue(sp, plot.quality);
  // 宠物的第二条结算线：产蛋量与默契在这里折进金币
  const petInfo = (typeof petSettle === 'function') ? petSettle(plot, sp, val) : null;
  const ub = upgradeBonus(S);
  // 土壤疲劳减产（连作的代价）
  const spn = typeof soilPenalty === 'function' ? soilPenalty(S, slot.id) : { yield: 0 };
  if (spn.yield > 0) {
    val.amount = Math.max(1, Math.round(val.amount * (1 - spn.yield)));
    plot.soilLossNote = Math.round(spn.yield * 100);
  }
  if (ub.yieldPct > 0) {
    val.amount = Math.round(val.amount * (1 + ub.yieldPct));
    val.coins = Math.round(val.coins * (1 + ub.yieldPct * 0.8));
  }
  // 嫁接体加成：产量与售价双重上浮，这是"赌一把"的回报
  if (plot.graft && plot.graft.bonus) {
    const gb = plot.graft.bonus;
    val.amount = Math.max(1, Math.round(val.amount * (gb.yield || 1)));
    val.coins = Math.round(val.coins * (gb.price || 1));
    plot.graftNote = { name: plot.graft.name, yld: gb.yield, price: gb.price };
  }
  S.coins += val.coins; floatCoins(val.coins);
  S.stats.rounds = (S.stats.rounds || 0) + 1;
  S.stats.success = (S.stats.success || 0) + 1;
  S.stats.totalEarn = (S.stats.totalEarn || 0) + val.coins;
  S.stats.bestQ = Math.max(S.stats.bestQ || 0, plot.quality);
  S.records.unshift(makeRecord(slot, plot, true));
  if (S.records.length > 80) S.records.length = 80;
  fridgeAdd(plot.speciesId, plot.quality, val.amount);
  const cx = S.codex[plot.speciesId] || { seen: [], harvested: 0, failed: 0 };
  cx.harvested += 1; S.codex[plot.speciesId] = cx;
  const gain = Math.round(plot.quality * 0.6 + 20);
  addXp(gain);
  addLog(S, `${sp.name} G${plot.gen || 1} 收获 ${val.amount}${sp.yield.unit}（${qualityGrade(plot.quality).label}），+${val.coins} 币`, 'good');
  // 选育：后代活力由母本活力+本代表现+突变决定
  const child = breedStrain({ gen: plot.gen || 1, vig: plot.vig || 0 }, plot.quality);
  const seeds = seedList(plot.speciesId);
  seeds.push({ gen: child.gen, vig: child.vig });
  if (plot.quality >= 80) seeds.push({ gen: child.gen, vig: child.vig }); // A 级以上多留一粒
  slot.plot = null;
  renderAll(); saveGame(S);
  const g = qualityGrade(plot.quality);
  hitTask('harvest1');
  // 成就检查（收获结算后）
  const got = checkAchievements(S);
  showHarvest(sp, plot, val, g, gain, got, child, petInfo);
}

// 成就脉冲检查：失败、跨天、收获后都会触发
function pulseAchievements() {
  // 先查物种通晓，给奖励
  if (typeof checkMastery === 'function') {
    const newly = checkMastery(S);
    newly.forEach((id, i) => setTimeout(() => {
      S.coins += 150; floatCoins(150);
      sfx('mile');
      toast(`通晓「${SPECIES[id].name}」里程碑，+150 币`, 'good');
      addLog(S, `已通晓 ${SPECIES[id].name} 的全部里程碑，奖励 150 币`, 'good');
      renderTopbar(); saveGame(S);
    }, 300 + i * 900));
  }
  const got = checkAchievements(S);
  got.forEach((a, i) => setTimeout(() => {
    const rw = a.reward || 60;
    S.coins += rw; floatCoins(rw);
    addXp(S, 20);
    sfx('achv'); if (typeof bgmAccent === 'function') bgmAccent('good');
    toast(`🏆 解锁成就「${a.name}」 +${rw} 币：${a.desc}`, 'good');
    addLog(S, `成就达成「${a.name}」，奖励 ${rw} 币`, 'good');
    renderTopbar(); saveGame(S);
  }, 500 + i * 1400));
  // 主线手账：与成就同一节奏检查，达成即发奖励
  if (typeof checkQuests === 'function') {
    const qs = checkQuests(S);
    if (qs.length) { renderQuestChip(); saveGame(S); }
  }
}

// 收获结算弹窗
function showHarvest(sp, plot, val, g, gain, achvGot, child, petInfo) {
  const m = $('#harvestModal'); if (!m) { toast(`收获 ${val.amount}${sp.yield.unit}，+${val.coins} 金币，留下自留种`, 'good'); return; }
  $('#hvGrade').textContent = g.rank;
  $('#hvGrade').style.background = g.color;
  $('#hvName').textContent = sp.name;
  $('#hvScore').textContent = `品质 ${plot.quality} · ${g.label}`;
  $('#hvScore').style.color = g.color;
  const fact = sp.facts[Math.floor(Math.random() * sp.facts.length)];
  const lb = strainLabel(child ? child.vig : 0);
  const mutTxt = child && child.mut
    ? `<span class="hvMut ${child.mut.dir}">${child.mut.dir === 'up' ? '▲ 正向突变' : '▼ 劣变'} ${child.mut.d.toFixed(1)}</span>`
    : '';
  $('#hvRow').innerHTML = `
    <span>${icon('basket')} 收获 <b>${val.amount}</b>${sp.yield.unit}</span>
    <span>${icon('coin')} +<b>${val.coins}</b> 币</span>
    <span>经验 +<b>${gain}</b></span>
    <span>自留种 <b>G${child ? child.gen : 1} ×${plot.quality >= 80 ? 2 : 1}</b></span>`;
  // 宠物的第二条结算线单独占一行，不和"收获量/金币"混在一起——它讲的是另一件事
  const petHtml = (typeof petHarvestRow === 'function') ? petHarvestRow(petInfo) : '';
  $('#hvStrain').innerHTML = petHtml + (child
    ? `<div class="hvStrainLine">
         <span>子代 <b style="color:${lb.c}">G${child.gen} ${lb.t}</b></span>
         <span>活力 <b>${child.vig > 0 ? '+' : ''}${child.vig}</b></span>
         <span class="hvCalc">母本 ${child.inherit > 0 ? '+' : ''}${child.inherit} · 本代 ${child.fresh > 0 ? '+' : ''}${child.fresh}</span>
         ${mutTxt}
       </div>`
    : '');
  $('#hvFact').innerHTML = `<b>${fact.q}</b>${fact.a}`;
  m.classList.add('show');
  // 成就 toast 延迟弹出，避免与结算同时刷屏
  sfxHarvestGrade(g ? g.rank : 'B');
  if (typeof bgmAccent === 'function') bgmAccent('good');   // BGM 层的上行琶音呼应
  achvGot.forEach((a, i) => setTimeout(() => {
    const rw = a.reward || 60;
    S.coins += rw; addXp(S, 20); floatCoins(rw);
    toast(`🏆 解锁成就「${a.name}」 +${rw} 币：${a.desc}`, 'good'); sfx('achv');
    addLog(S, `成就达成「${a.name}」，奖励 ${rw} 币`, 'good');
    renderTopbar();
  }, 900 + i * 1400));
}

const ACHV_CAT = {
  grow: '培育', quality: '品质', breed: '选育', codex: '图鉴', econ: '经济', biz: '经营', pet: '宠物'
};

function renderAchievements() {
  const strip = $('#achvStrip'); if (!strip) return;
  const un = ACHIEVEMENTS.filter(a => S.achv[a.id]).length;
  // 按分类分组，未解锁但有进度的显示"差多少"，避免玩家面对一堆黑格子不知道从哪下手
  const groups = {};
  ACHIEVEMENTS.forEach(a => {
    const c = a.cat || 'grow';
    (groups[c] = groups[c] || []).push(a);
  });
  const head = `<div class="achvHead">
    <span>成就 <b>${un}</b> / ${ACHIEVEMENTS.length}</span>
    <span class="achvPct">${Math.round((un / ACHIEVEMENTS.length) * 100)}%</span>
    <button class="btn ghost tiny achvExp" id="btnAchvPoster">导出成就卡</button>
  </div>`;
  const body = Object.keys(groups).map(c => {
    const list = groups[c];
    const got = list.filter(a => S.achv[a.id]).length;
    return `<div class="achvGroup">
      <div class="achvGT">${ACHV_CAT[c] || c}<em>${got}/${list.length}</em></div>
      <div class="achvRow">${list.map(a => {
        const done = S.achv[a.id];
        let pg = null;
        if (!done && typeof a.prog === 'function') {
          try {
            const [cur, need, unit] = a.prog(S);
            if (need > 0 && cur > 0 && cur < need) pg = `${cur}/${need}${unit ? ' ' + unit : ''}`;
          } catch (e) {}
        }
        return `<div class="achv ${done ? 'on' : ''} ${pg ? 'prog' : ''}" title="${a.desc}${pg ? `（当前 ${pg}）` : ''}">
          <span class="achvIc">${icon(a.icon)}</span>
          <span class="achvTx"><b>${a.name}</b>
            <small>${done ? `第 ${done} 天` : pg ? `<i class="achvProg">${pg}</i>` : a.desc} <em class="achvRw">+${a.reward || 60} 币</em></small></span>
        </div>`;
      }).join('')}</div>
    </div>`;
  }).join('');
  strip.innerHTML = head + body;
  const ap = $('#btnAchvPoster');
  if (ap) ap.addEventListener('click', () => {
    if (typeof exportAchievePoster === 'function') { sfx('open'); exportAchievePoster(); }
    else toast('导出模块未加载', 'warn');
  });
}

// ---------- 温室改造 ----------
function renderUpgrades() {
  const box = $('#upList'); if (!box) return;
  const sm = seasonEnvMod(S.day);
  box.innerHTML = UPGRADES.map(u => {
    const lv = upgradeLevel(S, u.id);
    const cost = upPrice(u.id);
    const maxed = lv >= u.max;
    const afford = cost !== null && S.coins >= cost;
    const now = u.tip(lv), next = maxed ? null : u.tip(lv + 1);
    // 本季是否正被压制（用于高亮建议）
    const relevant =
      (u.id === 'insul' && sm.temp < 0) || (u.id === 'light' && sm.light < 0) ||
      (u.id === 'irrig' && sm.water < 0) || (u.id === 'vent' && sm.temp > 0);
    return `<div class="upCard ${maxed ? 'maxed' : ''} ${relevant && !maxed ? 'hit' : ''}">
      <div class="upHead">
        <span class="upIc">${icon(u.icon)}</span>
        <span class="upName">${u.name}</span>
        <span class="upLv">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>
      </div>
      <div class="upDesc">${u.desc}</div>
      <div class="upNow">当前：<b>${now}</b></div>
      ${maxed ? '<div class="upNext dim">已达最高等级</div>'
        : `<div class="upNext">升级后：<b>${next}</b></div>
           <button class="btn small ${afford ? 'primary' : ''}" data-up="${u.id}" ${afford ? '' : 'disabled'}>${afford ? `改造 ${cost} 币` : `需 ${cost} 币`}</button>`}
    </div>`;
  }).join('');
  $$('#upList [data-up]').forEach(b => b.addEventListener('click', () => buyUpgrade(b.dataset.up)));
}

function upPrice(id) {
  const c = upgradeCost(S, id);
  if (c === null) return null;
  let d = levelPerk(S).upDiscount;
  if (S.upDiscount) d = Math.min(d, S.upDiscount);
  return Math.round(c * d);
}

function buyUpgrade(id) {
  const cost = upPrice(id);
  if (cost === null) return;
  if (S.coins < cost) return toast('金币不足', 'warn');
  S.coins -= cost;
  S.upgrades = S.upgrades || {};
  S.upgrades[id] = upgradeLevel(S, id) + 1;
  addXp(S, 25);
  const u = UPGRADES.find(x => x.id === id);
  addLog(S, `温室改造：${u.name} 提升至 Lv.${S.upgrades[id]}`, 'good');
  renderAll(); saveGame(S); renderUpgrades();
  toast(`${u.name} 已升级至 Lv.${S.upgrades[id]}`, 'good');
  pulseAchievements();
}

// ---------- 订单 ----------
function renderOrders() {
  const box = $('#orderList'); if (!box) return;
  const list = (S.orders || []).filter(o => o.expire > S.day);
  if (!list.length) {
    box.innerHTML = `<div class="orderEmpty">当前没有订单。<br/>市集每天会放出新的需求，也可以手动刷新。</div>`;
    return;
  }
  box.innerHTML = list.map(o => {
    const sp = SPECIES[o.species];
    const cl = clientOf(o.client);
    const days = Math.max(0, o.expire - S.day);
    // 是否已可交付：扫描收获仓
    let can = false, batchNote = '';
    fridgeBatches(o.species).forEach(b => {
      if (orderFit(o, o.species, b.q, b.n)) { can = true; batchNote = `品质 ${Math.round(b.q)} ×${b.n}`; }
    });
    return `<div class="orderCard ${can ? 'ready' : ''} ${o.chain ? 'chain' : ''}">
      <div class="odHead">
        <span class="odClient">${cl.name}</span>
        ${o.chain ? `<span class="odChain">连锁单</span>` : ''}
        <span class="odTag" style="background:${qualityGrade(o.minQ).color}">${qualityGrade(o.minQ).rank}</span>
        <span class="odDays">${days} 天</span>
      </div>
      <div class="odBody">
        <div class="odWant"><b>${sp.name} ${sp.yield.name}</b> ×${o.qty}</div>
        <div class="odReq">品质 ≥ ${o.minQ}${o.minGen ? ` · G${o.minGen} 以上` : ''}</div>
        <div class="odNote">${cl.note}${(() => { const mt = marketTag(o.species, S.day); return mt.f !== 1 ? ` · <i class="mkTag" style="color:${mt.c};font-style:normal">${mt.t} ${mt.f > 1 ? '＋' : ''}${Math.round((mt.f - 1) * 100)}%</i>` : ''; })()}${(() => { const t = repTier(S, o.client); return t ? ` · <b class="odRep">${t.name} +${Math.round(t.bonus * 100)}%</b>` : ''; })()}</div>
      </div>
      <div class="odFoot">
        <span class="odReward">${icon('coin')} ${o.reward}</span>
        <button class="btn small ${can ? 'primary' : ''}" data-deliver="${o.id}" ${can ? '' : 'disabled'}>${can ? '交付' : '缺货'}</button>
      </div>
    </div>`;
  }).join('');
  $$('#orderList [data-deliver]').forEach(b => b.addEventListener('click', () => deliverOrder(b.dataset.deliver)));
}

function fridgeHasS() {
  return Object.values(S.fridge || {}).some(list => (list || []).some(b => b.n > 0 && b.q >= 92));
}

function deliverOrder(oid) {
  const list = S.orders || [];
  const idx = list.findIndex(o => o.id === oid);
  if (idx < 0) return;
  const o = list[idx];
  const batches = fridgeBatches(o.species);
  // 找品质刚好够用、且数量足够的最省批次（低品质优先消耗）
  const cand = batches.filter(b => orderFit(o, o.species, b.q, b.n)).sort((a, b) => a.q - b.q)[0];
  if (!cand) return toast('没有符合要求的库存', 'warn');
  cand.n -= o.qty;
  if (cand.n <= 0) batches.splice(batches.indexOf(cand), 1);
  S.coins += o.reward; floatCoins(o.reward);
  S.stats.totalEarn = (S.stats.totalEarn || 0) + o.reward;
  S.stats.orders = (S.stats.orders || 0) + 1;
  S.stats.orderEarn = (S.stats.orderEarn || 0) + o.reward;
  hitTask('order1');
  // 熟客度：交满 3 单升级为熟客，交满 6 单解锁连锁单
  const up = bumpRep(S, o.client);
  if (up) {
    addLog(S, `${clientOf(o.client).name} 已成为你的${up.name}（订单溢价 +${Math.round(up.bonus * 100)}%）`, 'good');
    toast(`${clientOf(o.client).name}：${up.name}达成，订单溢价 +${Math.round(up.bonus * 100)}%`, 'good');
  }
  list.splice(idx, 1);
  const sp = SPECIES[o.species];
  addLog(S, `向${clientOf(o.client).name}交付 ${sp.yield.name} ×${o.qty}，+${o.reward} 币`, 'good');
  // 立即补一单，保持节奏
  makeOrders(S);
  renderAll(); saveGame(S); renderOrders(); renderStock();
  toast(`订单完成，获得 ${o.reward} 金币`, 'good');
  sfx('coin');
  if (up) sfx('mile');
  pulseAchievements();
}

function refreshOrders(force) {
  const cost = 20;
  if (!force) { if (S.coins < cost) return toast('金币不足', 'warn'); S.coins -= cost; }
  S.orders = [];
  makeOrders(S);
  renderAll(); saveGame(S); renderOrders();
  toast(force ? '已发布新需求' : '已刷新订单（-20 币）', 'good');
}

// ---------- 杂交育种 ----------
let crossCtx = { species: null, A: null, B: null };

function openCross() {
  // 默认选持有种子最多的物种
  const ids = SPECIES_ORDER.filter(id => seedList(id).length >= 2);
  if (!ids.length) return toast('至少需要 2 粒同种种子才能杂交', 'warn');
  crossCtx = { species: ids[0], A: null, B: null };
  renderCross();
  $('#crossModal').classList.add('show');
}

function renderCross() {
  const bank = $('#crossBank');
  const ids = SPECIES_ORDER.filter(id => seedList(id).length >= 2);
  const tabs = ids.map(id => `<button class="crTab ${id === crossCtx.species ? 'on' : ''}" data-crsp="${id}">${SPECIES[id].name} ${seedList(id).length}</button>`).join('');
  const list = germplasm(S, crossCtx.species);
  const selA = crossCtx.A, selB = crossCtx.B;
  const rows = list.map((s, i) => {
    const lb = strainLabel(s.vig);
    const isA = selA && selA.idx === s.idx, isB = selB && selB.idx === s.idx;
    return `<div class="crSeed ${isA ? 'asA' : ''} ${isB ? 'asB' : ''}" data-crpick="${s.idx}">
      <span class="seedGen">G${s.gen}</span>
      <span class="seedTag" style="color:${lb.c}">${lb.t}</span>
      <span class="seedVig">活力 <b>${s.vig > 0 ? '+' : ''}${s.vig}</b></span>
      <span class="crMark">${isA ? 'A' : isB ? 'B' : ''}</span>
    </div>`;
  }).join('');
  bank.innerHTML = `<div class="crTabs">${tabs}</div><div class="crList">${rows}</div>`;

  const fmtParent = (p, tag) => {
    if (!p) return `<span class="csHint">点下面的种子选为亲本 ${tag}</span>`;
    const lb = strainLabel(p.vig);
    return `<div class="csName">亲本 ${tag}</div>
      <div class="csMeta">G${p.gen} · <span style="color:${lb.c}">${lb.t}</span></div>
      <div class="csVig">活力 ${p.vig > 0 ? '+' : ''}${p.vig}</div>`;
  };
  $('#crossA').innerHTML = fmtParent(selA, 'A');
  $('#crossB').innerHTML = fmtParent(selB, 'B');
  $('#crossA').classList.toggle('filled', !!selA);
  $('#crossB').classList.toggle('filled', !!selB);

  // 预览：预估区间（不暴露随机结果，只给范围）
  const pv = $('#crossPreview');
  const btn = $('#btnCross');
  if (selA && selB) {
    const lo = Math.max(VIG_MIN, Math.min(VIG_MAX, ((selA.vig + selB.vig) / 2 + 0.8 - 4.8)));
    const hi = Math.max(VIG_MIN, Math.min(VIG_MAX, Math.min(Math.max(selA.vig, selB.vig) + 3, (selA.vig + selB.vig) / 2 + 2.4 + 12)));
    pv.innerHTML = `<span>预估子代活力 <b>${lo.toFixed(1)} ~ ${hi.toFixed(1)}</b></span>
      <span class="crNote">含 ±12 大突变可能 · 代数 G${Math.max(selA.gen, selB.gen) + 1}</span>`;
    btn.disabled = S.coins < CROSS_COST;
    btn.textContent = S.coins < CROSS_COST ? `金币不足（需 ${CROSS_COST}）` : `开始杂交（${CROSS_COST} 币）`;
  } else {
    pv.innerHTML = `<span class="crNote">选择两粒种子后这里会显示预估结果</span>`;
    btn.disabled = true;
    btn.textContent = `开始杂交（${CROSS_COST} 币）`;
  }
  $$('.crTab', bank).forEach(t => t.addEventListener('click', () => {
    crossCtx.species = t.dataset.crsp; crossCtx.A = null; crossCtx.B = null; renderCross();
  }));
  $$('.crSeed', bank).forEach(el => el.addEventListener('click', () => {
    const idx = +el.dataset.crpick;
    const s = germplasm(S, crossCtx.species).find(x => x.idx === idx);
    if (!s) return;
    if (crossCtx.A && crossCtx.A.idx === idx) { crossCtx.A = null; renderCross(); return; }
    if (crossCtx.B && crossCtx.B.idx === idx) { crossCtx.B = null; renderCross(); return; }
    if (!crossCtx.A) crossCtx.A = s; else crossCtx.B = s;
    renderCross();
  }));
}

function doCross() {
  const { species, A, B } = crossCtx;
  if (!A || !B) return;
  if (S.coins < CROSS_COST) return toast('金币不足', 'warn');
  const list = seedList(species);
  const sa = list[A.idx], sb = list[B.idx];
  if (!sa || !sb) return toast('种子已变化，请重新选择', 'warn');
  const child = crossBreed(sa, sb);
  S.coins -= CROSS_COST; floatCoins(-CROSS_COST);
  // 移除两粒亲本（按引用删除，避免索引错位）
  const ia = list.indexOf(sa), ib = list.indexOf(sb);
  [ia, ib].sort((x, y) => y - x).forEach(i => { if (i >= 0) list.splice(i, 1); });
  list.push({ gen: child.gen, vig: child.vig, lineage: child.lineage, cross: true });
  addLog(S, `杂交成功：G${child.gen} 活力 ${child.vig > 0 ? '+' : ''}${child.vig}${child.mut ? '（变异）' : ''}`, 'good');
  crossCtx.A = null; crossCtx.B = null;
  renderCross(); renderAll(); saveGame(S);
  const lb = strainLabel(child.vig);
  $('#crossPreview').innerHTML = `<span class="crResult">子代 <b style="color:${lb.c}">G${child.gen} ${lb.t}</b> · 活力 <b>${child.vig > 0 ? '+' : ''}${child.vig}</b>${child.mut ? `<em class="hvMut ${child.mut.dir}">${child.mut.dir === 'up' ? '▲' : '▼'} ${child.mut.d.toFixed(1)}</em>` : ''}</span>`;
  pulseAchievements();
  toast(`杂交得到 G${child.gen} ${lb.t}（活力 ${child.vig > 0 ? '+' : ''}${child.vig}）`, 'good');
}

// ---------- 存档导入导出 ----------
function exportSave() {
  try {
    const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const who = (typeof NL !== 'undefined' && NL.active()) ? NL.active().name : 'naturelab';
    a.download = 'naturelab-' + String(who).replace(/[\\/:*?"<>|]/g, '_') + '-day' + S.day + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('存档已导出（建议同时到「档案」面板导出完整档案）', 'good');
  } catch (e) { toast('导出失败', 'warn'); }
}
function importSave(file) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) return toast('文件过大，已拒绝导入', 'warn');
  const rd = new FileReader();
  rd.onload = () => {
    let s = null;
    try { s = JSON.parse(rd.result); } catch (e) { return toast('存档文件不是有效 JSON', 'warn'); }
    if (typeof validateSaveShape !== 'function' || !validateSaveShape(s)) return toast('存档结构校验失败，未导入', 'warn');
    if (!confirm('导入会覆盖当前存档位的进度，确定继续？')) return;
    try {
      saveGame(s);
      toast('存档已导入，即将刷新', 'good');
      setTimeout(() => location.reload(), 600);
    } catch (e) { toast('存档写入失败，可能是本地空间不足', 'warn'); }
  };
  rd.readAsText(file);
}

function doClear() {
  const slot = activeSlot(); if (!slot.plot) return;
  const plot = slot.plot;
  S.stats.rounds = (S.stats.rounds || 0) + 1;
  S.stats.failed = (S.stats.failed || 0) + 1;
  S.records.unshift(makeRecord(slot, plot, false));
  if (S.records.length > 80) S.records.length = 80;
  const cx = S.codex[plot.speciesId] || { seen: [], harvested: 0, failed: 0, best: 0 };
  cx.failed = (cx.failed || 0) + 1; S.codex[plot.speciesId] = cx;
  addLog(S, `${SPECIES[plot.speciesId].name} 培育失败（${plot.deathCause || '环境不适'}）`, 'bad');
  slot.plot = null; renderAll(); saveGame(S);
  pulseAchievements();
}

// 单批出售：只卖某一品质档，好货可以留着等订单
function sellBatch(k, q) {
  const batches = fridgeBatches(k);
  const b = batches.find(x => Math.abs(x.q - q) < 0.01 && x.n > 0);
  if (!b) return;
  const unit = fridgeUnitPrice(k, b.q);
  const total = b.n * unit;
  S.coins += total; floatCoins(total);
  S.stats.totalEarn = (S.stats.totalEarn || 0) + total;
  addLog(S, `售出 ${SPECIES[k].name}（${qualityGrade(b.q).rank}）×${b.n}，+${total} 币`, 'good');
  sfx('coin');
  toast(`+${total} 币`, 'good');
  b.n = 0;
  S.fridge[k] = batches.filter(x => x.n > 0);
  hitTask('sell3');
  renderAll(); renderStock(); saveGame(S);
}

function sellAll() {
  let total = 0, cnt = 0;
  Object.keys(S.fridge).forEach(k => {
    fridgeBatches(k).forEach(b => {
      total += b.n * fridgeUnitPrice(k, b.q);
      cnt += b.n;
    });
    S.fridge[k] = [];
  });
  if (!cnt) return toast('收获仓是空的', 'warn');
  hitTask('sell3', Math.min(3, cnt));
  S.coins += total; floatCoins(total);
  S.stats.totalEarn = (S.stats.totalEarn || 0) + total;
  addLog(S, `出售 ${cnt} 件产物，+${total} 币`, 'good');
  toast(`出售 ${cnt} 件，获得 ${total} 金币`, 'good');
  renderAll(); saveGame(S); renderStock();
}

function renderStock() {
  const body = $('#stockBody');
  if (!body) return;
  const sea = seasonForDay(S.day);
  const hot = SPECIES_ORDER.filter(id => marketFactor(id, S.day) > 1.2).map(id => SPECIES[id].name);
  const cold = SPECIES_ORDER.filter(id => marketFactor(id, S.day) < 0.85).map(id => SPECIES[id].name);
  const bar = $('#seasonBar');
  if (bar) bar.innerHTML = `<span>当前 <b>${sea.name}季</b> · ${sea.tag}</span>
    <span style="margin-left:auto">${hot.length ? `旺销：<b>${hot.join('、')}</b>` : '无旺销品'}${cold.length ? ` ｜ 压价：${cold.join('、')}` : ''}</span>`;
  const rows = [];
  Object.keys(S.fridge).forEach(k => fridgeBatches(k).forEach(b => { if (b.n > 0) rows.push({ k, b }); }));
  rows.sort((x, y) => y.b.q - x.b.q);
  if (!rows.length) {
    body.innerHTML = `<div class="stockEmpty">${icon('leaf')}<p>还没有收获物。<br/>把一株生命养到最后一个阶段，收获后就会存进这里。</p></div>`;
  } else {
    body.innerHTML = rows.map(({ k, b }) => {
      const sp = SPECIES[k];
      const g = qualityGrade(b.q);
      const unit = fridgeUnitPrice(k, b.q);
      const mt = marketTag(k, S.day);
      return `<div class="stockRow">
        <div class="stImg" style="background-image:url(${spr(sp.stages[sp.stages.length - 1].img)})"></div>
        <div class="stInfo"><b>${sp.yield.name}<i class="stGrade" style="background:${g.color}">${g.rank}</i><i class="mkTag" style="color:${mt.c};border:1px solid ${mt.c}44">${mt.t}</i></b><em>${sp.name} · 品质 ${Math.round(b.q)} · 单价 ${unit} 币</em></div>
        <div class="stNum">×${b.n}</div>
        <div class="stVal">${b.n * unit}</div>
        <button class="btn small ghost stSell" data-sell="${k}|${b.q}">售出</button>
      </div>`;
    }).join('');
  }
  $$('[data-sell]', body).forEach(btn => btn.addEventListener('click', () => {
    const [k, q] = btn.dataset.sell.split('|');
    sellBatch(k, +q);
  }));
  const v = fridgeValue();
  const sv = $('#stockValue'); if (sv) sv.textContent = fmt(v);
  const sn = $('#stockNum');
  if (sn) sn.textContent = fridgeCount();
}

function renderRecords() {
  const box = $('#recordList');
  if (!box) return;
  const recs = S.records || [];
  const st = S.stats || {};
  const head = `<div class="recStats">
    <div><b>${st.rounds || 0}</b><em>总轮次</em></div>
    <div><b>${st.success || 0}</b><em>成功</em></div>
    <div><b>${st.failed || 0}</b><em>失败</em></div>
    <div><b>${st.bestQ || 0}</b><em>最高品质</em></div>
  </div>`;
  if (!recs.length) {
    box.innerHTML = head + `<div class="recEmpty">还没有完成过一轮培育。<br/>走完全部阶段收获一次，这里就会留下记录。</div>`;
    return;
  }
  box.innerHTML = head + recs.slice(0, 30).map(r => `
    <div class="recItem ${r.success ? 'ok' : 'bad'}">
      <div class="recGrade">${r.grade}</div>
      <div class="recMain">
        <b>${r.name}</b>
        <span>${r.days} 天 · 均健康 ${r.avgHp} · 最低 ${r.minHp}</span>
        <em>${r.success ? `品质 ${r.quality} · 最高到${r.peakStage}` : `死于${r.cause}`}</em>
      </div>
      <div class="recDay">D${r.when}</div>
    </div>`).join('');
}

// 培育统计：把 records 聚合成一张"经营体检表"
// 远缘嫁接专项：只在真做过实验时出现，没做过不占版面
function graftSection() {
  const gs = (S && S.stats) || {};
  const n = gs.grafts || 0;
  if (!n) return '';
  const take = gs.graftTake || 0, fail = gs.graftFail || 0, fls = gs.graftFalse || 0;
  const pct = v => Math.round((v / n) * 100);
  const owned = (S.grafts || []).length;
  return `
    <div class="rpSec">远缘嫁接 <em>${n} 次实验</em></div>
    <div class="rpGrid rpGrid4">
      <div class="rpCard ok"><b>${pct(take)}%</b><span>成活率</span></div>
      <div class="rpCard"><b>${take}</b><span>接活</span></div>
      <div class="rpCard mid"><b>${fls}</b><span>假活</span></div>
      <div class="rpCard bad"><b>${fail}</b><span>不亲和</span></div>
    </div>
    <div class="rpGraftBar">
      <i class="ok" style="width:${pct(take)}%"></i>
      <i class="mid" style="width:${pct(fls)}%"></i>
      <i class="bad" style="width:${pct(fail)}%"></i>
    </div>
    <div class="rpNote">当前持有嫁接体 <b>${owned}</b> 株 · 假活占 ${pct(fls)}%（这类失败最贵，它先让你以为成了）</div>`;
}

function petSection() {
  const gs = (S && S.stats) || {};
  const eggs = gs.eggs || 0, bondMax = gs.bondMax || 0, bondFull = gs.bondFull || 0, broody = gs.broody || 0;
  const runaway = gs.runaway || 0, damages = gs.damages || 0;
  if (!eggs && !bondMax && !broody && !runaway && !damages) return '';
  return `
    <div class="rpSec">宠物养成 <em>产蛋与默契</em></div>
    <div class="rpGrid rpGrid4">
      <div class="rpCard ok"><b>${eggs}</b><span>累计收蛋</span></div>
      <div class="rpCard"><b>${bondMax}</b><span>最高默契</span></div>
      <div class="rpCard mid"><b>${bondFull}</b><span>默契满值</span></div>
      <div class="rpCard ${broody ? 'bad' : ''}"><b>${broody}</b><span>抱窝次数</span></div>
      <div class="rpCard ${runaway ? 'bad' : ''}"><b>${runaway}</b><span>猫出走</span></div>
      <div class="rpCard ${damages ? 'bad' : ''}"><b>${damages}</b><span>狗拆家</span></div>
    </div>
    <div class="rpNote">${eggs
      ? `蛋是鸡的第二条现金流，可随时收；默契满值的宠物售价 <b>+70%</b>。猫出走和狗拆家都源自环境长期不及格——不是运气差。`
      : `宠物专属维度按天累积：鸡攒蛋，狗和猫攒默契——平时怎么对待它，收获时就怎么回报你。`}</div>`;
}

function renderReport() {
  const box = $('#reportBody'); if (!box) return;
  if (typeof buildReport !== 'function') { box.innerHTML = '<div class="recEmpty">统计模块未加载</div>'; return; }
  const r = buildReport(S);
  const ov = r.overview;

  const card = (v, l, tone) => `<div class="rpCard ${tone || ''}"><b>${v}</b><span>${l}</span></div>`;

  const speciesRows = r.species.length ? r.species.map(sp => {
    const tone = sp.avgQ >= 85 ? 'ok' : sp.avgQ >= 70 ? 'mid' : 'bad';
    return `<div class="rpSp">
      <span class="rpSpName">${sp.name}</span>
      <span class="rpSpBar"><i class="${tone}" style="width:${Math.max(4, sp.avgQ)}%"></i></span>
      <span class="rpSpNum">${sp.avgQ}</span>
      <span class="rpSpMeta">${sp.ok}/${sp.n} 成功 · 均 ${sp.avgDays} 天</span>
    </div>`;
  }).join('') : '<div class="recEmpty sm">还没有成功的培育记录</div>';

  const distRows = r.dist.map(d => `
    <div class="rpDist">
      <span class="rpG">${d.g}</span>
      <span class="rpDBar"><i class="g${d.g}" style="width:${d.pct}%"></i></span>
      <span class="rpDN">${d.n} <em>${d.pct}%</em></span>
    </div>`).join('');

  const causeRows = r.causes.length ? r.causes.slice(0, 5).map(c => `
    <div class="rpCause"><span>${c.name}</span><i style="width:${c.pct}%"></i><b>${c.n}</b></div>`).join('')
    : '<div class="rpEmptyLine">没有失败记录——保持住</div>';

  const healthRows = r.buckets.map(b => `
    <div class="rpHl ${b.tone}">
      <span>${b.label}</span>
      <span class="rpHBar"><i style="width:${Math.round((b.n / r.maxB) * 100)}%"></i></span>
      <b>${b.n}</b>
    </div>`).join('');

  const tipRows = r.tips.map(t => `<div class="rpTip ${t.tone}">${t.t}</div>`).join('');

  box.innerHTML = `
    <div class="rpHead">
      <div class="rpTitle">培育年报</div>
      <div class="rpSub">第 1 天 — 第 ${ov.gameDays} 天 · 共 ${ov.rounds} 轮</div>
      <button class="btn ghost tiny rpExport" id="btnRpPoster">导出图片</button>
    </div>
    <div class="rpGrid">
      ${card(ov.rate + '%', '成功率', ov.rate >= 85 ? 'ok' : ov.rate >= 60 ? 'mid' : 'bad')}
      ${card(ov.avgQ, '平均品质', ov.avgQ >= 85 ? 'ok' : ov.avgQ >= 70 ? 'mid' : 'bad')}
      ${card(ov.bestQ, '最高品质', 'ok')}
      ${card(ov.totalEarn, '累计收入', 'econ')}
      ${card(ov.earnPerDay, '日均收入', ov.earnPerDay >= 40 ? 'ok' : 'mid')}
      ${card(ov.totalDays, '培育天数', '')}
    </div>

    <div class="rpSec">物种表现 <em>按平均品质排序</em></div>
    <div class="rpSpecies">${speciesRows}</div>

    <div class="rpTwo">
      <div>
        <div class="rpSec">品质分布 <em>${ov.success} 次收获</em></div>
        <div class="rpDistBox">${distRows}</div>
      </div>
      <div>
        <div class="rpSec">健康度分布 <em>每轮均健康</em></div>
        <div class="rpHlBox">${healthRows}</div>
      </div>
    </div>

    ${graftSection()}
    ${petSection()}

    <div class="rpSec">失败归因 <em>${ov.failed} 次</em></div>
    <div class="rpCauseBox">${causeRows}</div>

    <div class="rpSec">数据给出的结论</div>
    <div class="rpTips">${tipRows}</div>
  `;
  const pb = $('#btnRpPoster');
  if (pb) pb.addEventListener('click', () => {
    if (typeof exportReportPoster === 'function') { sfx('open'); exportReportPoster(); }
    else toast('导出模块未加载', 'warn');
  });
}

function addXp(n) {
  S.xp += n;
  let need = XP_PER_LEVEL(S.level);
  const ups = [];
  while (S.xp >= need) {
    S.xp -= need; S.level += 1;
    const u = LEVEL_UNLOCKS[S.level];
    sfx('levelup');
    if (u) { S.coins += u.coin; floatCoins(u.coin); ups.push(`Lv.${S.level} ${u.text}（+${u.coin} 币）`); }
    else ups.push(`Lv.${S.level}`);
    need = XP_PER_LEVEL(S.level);
  }
  if (ups.length) {
    toast(`等级提升：${ups.join(' · ')}`, 'good');
    ups.forEach(t => addLog(S, t.startsWith('Lv.') ? `升级 ${t}` : t, 'good'));
    renderTopbar();
  }
}

function markSeen(speciesId, stageKey) {
  const cx = S.codex[speciesId] || { seen: [], harvested: 0, failed: 0 };
  if (!cx.seen.includes(stageKey)) cx.seen.push(stageKey);
  S.codex[speciesId] = cx;
}

function toast(msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2400);
  setTimeout(() => t.remove(), 3000);
}

// ---------- 主循环 ----------
const DAY_SECONDS = 14;
const TIME_SCALE = 2.6;   // 生长速率整体倍率：一轮完整的生命约 12–20 天

function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
  if (paused || (typeof NL !== 'undefined' && NL.locked && NL.locked())) return;
  const dayDelta = (dt / DAY_SECONDS) * S.speed;
  S.clock += dayDelta * 24;
  if (S.clock >= 24) { S.clock -= 24; advanceDays(1); }
  tickAcc += dayDelta;
  if (tickAcc >= 0.2) { settlePartial(tickAcc); tickAcc = 0; }
  uiAcc += dt;
  if (uiAcc > 0.4) { uiAcc = 0; lightRefresh(); }
}

function settlePartial(frac) {
  S.slots.forEach(slot => {
    if (!slot.plot || !slot.unlocked) return;
    const plot = slot.plot;
    if (plot.status === 'ready' || plot.status === 'dead') return;
    const sp = SPECIES[plot.speciesId];
    const env = envFor(slot);
    const ev = evaluateEnv(sp, env, plot.stage);
    const nv = evaluateNutrition(sp, plot.stage, plot.fertilized);
    const spn = typeof soilPenalty === 'function' ? soilPenalty(S, slot.id) : { env: 0, yield: 0 };
    plot.soilFatigue = typeof soilOf === 'function' ? soilOf(S, slot.id).fatigue : 0;
    plot.soilPen = spn;
    const soilLoss = spn.env * 100;   // 疲劳换算成百分制扣分
    const score = Math.round((ev.score - soilLoss) * 0.7 + nv.score * 0.3 + vigBonus(plot.vig));
    const rate = Math.pow(Math.max(0, (score - 15) / 85), 1.15) * vigSpeed(plot.vig);
    // 温度越过耐受极限（±8℃）会急性损伤，短时间内致死
    const extreme = env.temp < sp.env.temp[0] - 8 || env.temp > sp.env.temp[1] + 8;
    plot.extreme = extreme;
    if (extreme) plot.stress = (plot.stress || 0) + frac * 1.9;
    const frag = sp.fragility[Math.min(plot.stage, sp.fragility.length - 1)];
    const needDays = Math.max(0.6, sp.days[Math.min(plot.stage, sp.days.length - 1)] * frag);
    plot.progress += (frac / needDays) * rate * TIME_SCALE;
    plot.lastScore = score;
    // 宠物"情绪"：分数低时随机渲染成躲起来或熟睡，直接影响默契的每日增量
    if (typeof petKindOf === 'function' && petKindOf(sp) && petKindOf(sp).kind === 'bond') {
      if (!plot.bondHidden || Math.random() < 0.02 * frac) {
        if (score < 62) plot.bondHidden = 'hidden';
        else if (score > 85) plot.bondHidden = 'sleeping';
        else plot.bondHidden = '';
      }
    }
    plot.fitSum = (plot.fitSum || 0) + score * frac;
    plot.fitN = (plot.fitN || 0) + frac;
    if (extreme) plot.extremeDays = (plot.extremeDays || 0) + frac;
    if (plot.disease) plot.diseaseDays = (plot.diseaseDays || 0) + frac;
    if (score < 25) plot.stress += frac; else if (!plot.extreme) plot.stress = Math.max(0, plot.stress - frac * 0.5);

    if (score >= 70) plot.health = Math.min(100, plot.health + (score - 70) * 0.05 * frac);
    else plot.health -= (70 - score) * 0.035 * frac * frag;
    if (plot.disease) plot.health -= plot.disease.s * 0.35 * frac;
    plot.minHp = Math.min(plot.minHp ?? 100, plot.health);

    if (plot.health <= 0 || plot.stress > 3.2) {
      plot.health = 0; plot.status = 'dead'; sfx('dead'); shakeScreen('lg');
      if (typeof bgmAccent === 'function') bgmAccent('bad');
      plot.age = Math.max(plot.age, Math.ceil(S.day - (plot.bornDay || S.day)));
      plot.deathCause = plot.disease ? plot.disease.n : ev.worst.name + '长期偏离';
      addLog(S, `${sp.name} 死亡（${plot.deathCause}）`, 'bad');
      if (slot.id === currentSlot) renderAll();
      saveGame(S); return;
    }
    if (plot.progress >= 1) {
      if (plot.stage >= sp.stages.length - 1) {
        plot.progress = 1; plot.status = 'ready'; plot.stress = 0;
        plot.quality = computeQuality(plot, score);
        markSeen(sp.id, sp.stages[plot.stage].key);
        addLog(S, `${sp.name} 可以收获了`, 'good');
        if (slot.id === currentSlot) renderAll();
      } else {
        plot.progress = 0; plot.stage += 1;
        plot.fertilized = { N: Math.max(10, plot.fertilized.N * 0.72), P: Math.max(10, plot.fertilized.P * 0.72), K: Math.max(10, plot.fertilized.K * 0.72) };
        markSeen(sp.id, sp.stages[plot.stage].key);
        addLog(S, `${sp.name} 进入「${sp.stages[plot.stage].name}」`, 'info');
        if (slot.id === currentSlot) { renderAll(); toast(`${sp.name} 进入${sp.stages[plot.stage].name}期`, 'good'); }
      }
      plot.history.push(Math.round(plot.health));
    }
  });
  saveGame(S);
}

// 把"手动微调偏移"折到目标值：偏移有上限（温室本体能力有限），
// 超出部分留给设备补足。CAP 越小，季节/天气缺口越依赖设备与改造。
const SET_CAP = { temp: 3, humid: 10, light: 3 };
const SET_CAP_AUTO = { temp: 4.5, humid: 14, light: 4.2 };

// 统一的环境求解：给定目标值，算出 settings 偏移 + 设备开关。
// manual=false（自动调控）时偏移更宽、设备可成组运行（等效 ×2）；
// manual=true（一键调到适宜）按单台设备 + 窄偏移，保持"手动不如自动"的取舍。
function solveEnv(p, t, opts) {
  const manual = !!(opts && opts.manual);
  const CAP = manual ? SET_CAP : SET_CAP_AUTO;
  const ef = seasonEff(), w = baseWeather();
  const wT = dayTempBase(w), baseH = w.humidBase, baseL = cumulativeLight();
  const cl = (v, c) => Math.max(-c, Math.min(c, v));
  p.settings = {
    dTemp: +cl(t.temp - wT - ef.temp, CAP.temp).toFixed(1),
    dHumid: Math.round(cl(t.humid - baseH - ef.humid, CAP.humid)),
    dLight: +cl(t.light - baseL - ef.light, CAP.light).toFixed(1)
  };
  const dy = { temp: wT + ef.temp + p.settings.dTemp, humid: baseH + ef.humid + p.settings.dHumid, light: baseL + ef.light + p.settings.dLight };
  const gap = { temp: t.temp - dy.temp, humid: t.humid - dy.humid, light: t.light - dy.light };
  const eff = Math.min(1.1, ef.devEff);
  const dev = {};
  // 单台设备能力（乘季节效率）；自动模式成组运行（Lv2 才有的"设备联动"）
  const layers = manual ? 1 : 2;
  // 单台/成组的可调档位：缺口在这个范围内才开对应档数设备，
  // 否则只开能覆盖的最大档（不硬开第二组造成反向超调）
  const maxTemp = 4 * eff;
  const needTemp = Math.abs(gap.temp);
  const tLayers = needTemp > 0 ? Math.min(layers, Math.max(1, Math.round(needTemp / maxTemp))) : 0;
  const maxHum = 12 * eff;
  const needHum = Math.abs(gap.humid);
  const hLayers = needHum > 0 ? Math.min(layers, Math.max(1, Math.round(needHum / maxHum))) : 0;
  const maxLight = 3.5 * eff;
  const needLight = Math.abs(gap.light);
  const lLayers = needLight > 0 ? Math.min(layers, Math.max(1, Math.round(needLight / maxLight))) : 0;
  const take = (pos, neg, g, dead, n) => {
    if (Math.abs(g) < dead || !n) return;
    if (g > 0) dev[pos] = true; else dev[neg] = true;
  };
  take('heater', 'cooler', gap.temp, Math.max(0.8, maxTemp * 0.3), tLayers);
  take('humid', 'dry', gap.humid, Math.max(2, maxHum * 0.3), hLayers);
  take('lamp', 'shade', gap.light, Math.max(0.5, maxLight * 0.3), lLayers);
  p.devices = dev;
  // 各维度独立成组：温度够一份就只开一组加温，光照缺得多才开两组补光
  let lt = tLayers > 1 ? 2 : 1, lh = hLayers > 1 ? 2 : 1, ll = lLayers > 1 ? 2 : 1;
  // 闭环微调：设备已开时，按"开启后的实际值"回算偏移，消除超调
  // envFor 里设备增量统一乘 devEff，这里必须用同一口径，否则会反复震荡
  const devEff2 = (Math.abs(ef.temp) > 0.5 || Math.abs(ef.water) > 0.5) ? Math.min(1.1, ef.devEff) : 1;
  const fix = (actual, target, cap) => cl(target - actual, cap);
  if (dev.lamp || dev.shade) {
    const unitL = (dev.lamp ? DEVICE_EFFECT.lamp.light : 0) + (dev.shade ? DEVICE_EFFECT.shade.light : 0);
    // 单组最大能力（设备 + 偏移上限）；够不到目标就必须上第二组
    const oneCap = baseL + ef.light + unitL * devEff2 + CAP.light;
    const twoCap = baseL + ef.light + unitL * 2 * devEff2 + CAP.light;
    if (ll > 1 && t.light > oneCap) ll = Math.min(layers, 2);           // 必须两组
    else if (ll > 1 && t.light <= oneCap) ll = 1;                        // 一组够用
    else if (ll === 1 && t.light > oneCap && twoCap > oneCap) ll = Math.min(layers, 2);
    const realL = baseL + ef.light + unitL * ll * devEff2;   // 开灯后的真实值（未计偏移）
    p.settings.dLight = +fix(realL, t.light, CAP.light).toFixed(1);
  }
  if (dev.heater || dev.cooler) {
    const dt = (dev.heater ? DEVICE_EFFECT.heater.temp * lt : 0) + (dev.cooler ? DEVICE_EFFECT.cooler.temp * lt : 0);
    const realT = wT + ef.temp + dt * devEff2;
    p.settings.dTemp = +fix(realT, t.temp, CAP.temp).toFixed(1);
    if (lt > 1 && Math.abs(t.temp - realT) <= maxTemp * 0.7) lt = 1;
  }
  if (dev.humid || dev.dry) {
    const dh = (dev.humid ? DEVICE_EFFECT.humid.humid * lh : 0) + (dev.dry ? DEVICE_EFFECT.dry.humid * lh : 0);
    const realH = baseH + ef.humid + dh * devEff2;
    p.settings.dHumid = Math.round(fix(realH, t.humid, CAP.humid));
    if (lh > 1 && Math.abs(t.humid - realH) <= maxHum * 0.7) lh = 1;
  }
  p.autoEff = { temp: lt, humid: lh, light: ll };
  // 面板提示用：偏移已封顶后仍差的量（这部分只能靠继续升级温室）
  p.autoGap = { temp: t.temp - (wT + ef.temp + p.settings.dTemp), humid: t.humid - (baseH + ef.humid + p.settings.dHumid), light: t.light - (baseL + ef.light + p.settings.dLight) };
  return { gap, dy };
}

// 自动调控：按当前阶段最优值维持环境（依赖温室"自动调控"改造）
function autoRegulate(slot) {
  const lv = upgradeLevel(S, 'auto');
  if (!lv) return;
  const p = slot.plot; if (!p || p.status !== 'growing') return;
  const sp = SPECIES[p.speciesId];
  const t = targetEnv(sp, p.stage);
  solveEnv(p, t, { manual: false });
  // 2 级含自动补水：按阶段目标补，而不是卡在适生下限（否则冬季压水就掉出区间）
  if (lv >= 2 && sp.habitat !== 'water') {
    const wGoal = t.water;
    const cur = slotWater(slot.id);
    if (cur < wGoal - 1) p.waterBonus = (p.waterBonus || 0) + (wGoal - cur + 3);
  }
  // 池塘：自动调控只接管温度与光照，水质仍要玩家自己管（这是水体玩法的主体）
  if (sp.habitat === 'water' && p.pond) {
    // 但缺氧到危险线时必须自动开泵，否则自动调控反而成了"放任致死"
    if (p.pond.do < sp.water.do[0] - 0.5 && p.devices) p.devices.aerator = true;
  }
}

function advanceDays(n) {
  // 结算"保持状态"：昨天任一槽位适生 ≥90 则打点
  try {
    const anyGood = S.slots.some(sl => sl.unlocked && sl.plot && sl.plot.status === 'growing'
      && evaluateEnv(SPECIES[sl.plot.speciesId], envFor(sl), sl.plot.stage).score >= 90);
    if (anyGood) hitTask('keep90');
  } catch (e) { /* 任务系统异常不应阻断主流程 */ }
  S.day += n;
  // 先结算土壤蒸发，再跑自动调控——否则补完水又被蒸发一次性扣掉
  S.slots.forEach(slot => {
    const p = slot.plot; if (!p || (p.status !== 'growing' && p.status !== 'ready')) return;
    const wfloor = SPECIES[p.speciesId].env.water[0] - 10 - baseWeather().soilWater;
    const wSave = upgradeBonus(S).waterSave;
    p.waterBonus = Math.max(wfloor, (p.waterBonus || 0) - Math.max(2, 7 - wSave) - (baseWeather().key === 'hot' ? 6 : 0));
  });
  if (typeof tickSoil === 'function') tickSoil(S, n);
  // 池塘水质推演：溶氧衰减、氨氮累积（水生物种专属）
  S.slots.forEach(slot => {
    const p = slot.plot;
    if (!p || !p.pond || (p.status !== 'growing' && p.status !== 'ready')) return;
    if (typeof pondTick === 'function') pondTick(p, SPECIES[p.speciesId], n);
  });
  // 清理过期的事件效果（加急单、行情、寒潮、改造折扣）
  if (S.rush && S.rush.until < S.day) delete S.rush;
  if (S.priceBoost && S.priceBoost.until < S.day) delete S.priceBoost;
  if (S.upDiscount) delete S.upDiscount;
  S.slots.forEach(sl => { if (sl.plot && sl.plot.eventTempDrop) delete sl.plot.eventTempDrop; });
  // 自动调控按新一天的天气刷新（蒸发后再补，补偿才留得住）
  S.slots.forEach(sl => { if (sl.unlocked && sl.plot) autoRegulate(sl); });
  // 自动调控的电力/维护费：按运行中的槽位收费，逼玩家在"省心"和"省钱"之间取舍
  const autoLv = upgradeLevel(S, 'auto');
  if (autoLv) {
    const running = S.slots.filter(sl => sl.unlocked && sl.plot && sl.plot.status === 'growing').length;
    const fee = running * autoLv * 4 * n;
    if (fee > 0) {
      S.coins = Math.max(0, S.coins - fee);
      if (fee >= 8) addLog(S, `自动调控运行费 −${fee} 币`, 'info');
    }
  }
  S.slots.forEach(slot => {
    const p = slot.plot; if (!p || (p.status !== 'growing' && p.status !== 'ready')) return;
    p.age += n;
    p.history.push(Math.round(p.health));
    if (p.history.length > 240) p.history.shift();
    const spn = soilPenalty(S, slot.id);
    if (!p.disease && p.health < 65 && Math.random() < 0.1 + spn.disease) {
      const sp = SPECIES[p.speciesId];
      const list = sp.habitat === 'water'
        ? [{ n: '水霉病', s: 2.2, t: '有机质堆积引发真菌感染' }, { n: '氨中毒', s: 3, t: '氨氮累积，鳃部受损' }]
        : [{ n: '叶斑病', s: 2.0, t: '湿度偏高时易发' }, { n: '白粉病', s: 1.8, t: '通风不良易爆发' }, { n: '蚜虫', s: 1.5, t: '聚集嫩梢刺吸汁液' }];
      p.disease = list[Math.floor(Math.random() * list.length)];
      p.diseaseDays = 0;
      sfx('alarm');
      addLog(S, `${sp.name} 出现${p.disease.n}`, 'bad');
    }
    if (p.disease) p.diseaseDays += 1;
    // 宠物专属维度：产蛋量与默契按天累积（见 js/pet.js）
    if (typeof petTickDaily === 'function') {
      const sp = SPECIES[p.speciesId];
      if (typeof petKindOf === 'function' && petKindOf(sp)) {
        petTickDaily(p, sp, envFor(slot), evaluateNutrition(sp, p.stage, p.fertilized), slot);
      }
    }
  });
  const w = baseWeather();
  // 设备设定（温/湿/光/pH）持续生效，跨天只刷新天气与蒸发；未手动设定则跟随天气
  if (S.orders) {
    const before = S.orders.length;
    makeOrders(S);
    if (S.orders.length > before) addLog(S, '市集放出了新的收购需求', 'info');
  }
  addLog(S, `第 ${S.day} 天 · ${w.name}，气温 ${w.tempBase}℃，湿度 ${w.humidBase}%`, 'info');
  // 每日目标刷新提示（放在 addLog 之后，避免在渲染链路里递归）
  try {
    const dd = ensureDailyTasks(S);
    if (dd.fresh) {
      dd.fresh = false;
      addLog(S, `今日目标：${dd.list.map(t => t.name).join(' · ')}`, 'info');
    }
  } catch (e) { /* 任务系统异常不阻断主流程 */ }
  pulseAchievements();
  renderAll(); saveGame(S);
  // 跨天时有概率触发事件（第 2 天起）
  if (n >= 1 && Math.random() < 0.4) setTimeout(() => fireEvent(), 400);
}

// ---------- 图鉴 ----------
// 里程碑条：每个物种 6 枚徽章，通了算"通晓"
function milestoneStrip(id) {
  if (typeof speciesMilestones !== 'function') return '';
  const ms = speciesMilestones(S, id);
  const done = ms.filter(m => m.got).length;
  const all = done === ms.length;
  return `<div class="msWrap ${all ? 'all' : ''}">
    <div class="msHead">里程碑 <b>${done}/${ms.length}</b>${all ? '<i class="msBadge">已通晓</i>' : ''}</div>
    <div class="msRow">${ms.map(m => `
      <span class="msChip ${m.got ? 'on' : ''}" title="${m.desc}${m.note ? '（' + m.note + '）' : ''}">
        ${m.got ? '✓' : '○'} ${m.name}
      </span>`).join('')}</div>
  </div>`;
}

/* 图鉴里的宠物专行：鸡狗猫多显示一块"宠物档案"，把第二条结算线的积累亮出来 */
function petCodexStrip(id) {
  if (typeof PET_KIND === 'undefined' || !PET_KIND[id]) return '';
  const gs = S.stats || {};
  const k = PET_KIND[id];
  let inner = '';
  if (k.kind === 'egg') {
    inner = `<span>累计收蛋 <b>${gs.eggs || 0}</b> 枚</span><span>抱窝 <b>${gs.broody || 0}</b> 次</span><span>累计蛋收入 <b>${Math.round(gs.eggEarn || 0)}</b> 币</span>`;
  } else if (k.kind === 'bond') {
    const bm = (gs.bondSp || {})[id] || 0;
    // 档位阈值必须与 pet.js bondStage 一致（狗 [18,40,65,88]，猫 [14,34,58,82]），否则图鉴显示的档名会和实际弹出的不符
    const th = id === 'dog' ? [88, 65, 40, 18] : [82, 58, 34, 14];
    const names = id === 'dog' ? ['满值', '亲近', '接纳', '戒备'] : ['满值', '亲近', '熟悉', '容忍'];
    let tier = bm > 0 ? (id === 'dog' ? '陌生' : '戒备') : '陌生';
    for (let i = 0; i < th.length; i++) { if (bm >= th[i]) { tier = names[i]; break; } }
    inner = `<span>最高默契 <b>${bm}</b>（${tier}）</span><span>默契满值 <b>${gs.bondFull || 0}</b> 只</span>${id === 'cat' ? `<span>出走 <b>${gs.runaway || 0}</b> 次</span>` : `<span>拆家 <b>${gs.damages || 0}</b> 次</span>`}`;
  }
  return `<div class="cxPet"><i>${k.icon}</i>${inner}</div>`;
}

function renderCodex() {
  const box = $('#codexBody2');
  const cp = typeof collectionProgress === 'function' ? collectionProgress(S) : null;
  const cpEl = $('#collectBar');
  if (cpEl && cp) {
    cpEl.innerHTML = `<div class="cpTop"><span>收藏完成度</span><b>${cp.got}/${cp.total}（${cp.pct}%）</b></div>
      <div class="cpBar"><i style="width:${cp.pct}%"></i></div>
      <div class="cpNote">已通晓物种 <b>${cp.mastered}</b> / ${SPECIES_ORDER.length} · 全部通晓可解锁「博物学家」成就</div>`;
  }
  box.innerHTML = SPECIES_ORDER.map(id => {
    const sp = SPECIES[id];
    const cx = S.codex[id] || { seen: [], harvested: 0, failed: 0 };
    return `<div class="codexRow">
      <div class="cxHead">
        <div class="cxTitle">${sp.name}<span>${sp.latin}</span><i class="cxHab ${sp.habitat}">${(HAB[sp.habitat] || '').split(' · ').pop()}</i></div>
        <div class="cxStat">已解锁 ${cx.seen.length}/5 · 成功 ${cx.harvested} · 失败 ${cx.failed}</div>
      </div>
      <div class="cxStrip">${sp.stages.map((s, i) => {
        const un = cx.seen.includes(s.key);
        return `<div class="cxStage ${un ? '' : 'lock'}" style="background-image:url(${spr(s.img)})">
          <div class="cxLabel">${i + 1}. ${s.name}</div>${un ? '' : '<div class="cxMask">未解锁</div>'}
        </div>`;
      }).join('')}</div>
      ${milestoneStrip(id)}
      ${petCodexStrip(id)}
      <div class="cxEnv">适宜环境　${sp.env.temp[0]}–${sp.env.temp[1]}℃ · 湿度 ${sp.env.humid[0]}–${sp.env.humid[1]}% · 光照 ${sp.env.light[0]}–${sp.env.light[1]}h · pH ${sp.env.soilPH[0]}–${sp.env.soilPH[1]}${sp.habitat !== 'water' ? ` · ${(typeof H2O_LABEL !== 'undefined' && H2O_LABEL[sp.habitat]) || '含水'} ${sp.env.water[0]}–${sp.env.water[1]}%` : ''}${sp.water ? ` · 溶氧 ${sp.water.do[0]}–${sp.water.do[1]}mg/L · 氨氮 ≤${sp.water.ammonia[1]}mg/L` : ''}</div>
      <div class="cxFacts">${sp.facts.map(f => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('')}</div>
    </div>`;
  }).join('');
}

/* 自动备份列表：展示本槽位的滚动备份，可一键回滚 */
function renderBackups() {
  const box = $('#bakList'); if (!box) return;
  if (typeof listBackups !== 'function') { box.innerHTML = ''; return; }
  const list = listBackups(CUR_SLOT || 1);
  if (!list.length) {
    box.innerHTML = `<div class="bakEmpty">还没有备份。每过 5 个游戏天会自动存一份，最多保留 3 份——手滑重档时它就是最后一道保险。</div>`;
    return;
  }
  box.innerHTML = list.map(b => {
    const d = new Date(b.when);
    const t = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<div class="bakRow">
      <span class="bakTag">备份 ${4 - b.idx}</span>
      <span>第 <b>${b.day}</b> 天</span><span>${t}</span><span>${b.records} 份档案 · ${b.coins} 币</span>
      <button class="btn ghost tiny" data-bak="${b.idx}">回滚到此</button>
    </div>`;
  }).join('');
  $$('#bakList [data-bak]').forEach(btn => btn.addEventListener('click', () => {
    const idx = +btn.dataset.bak;
    if (!confirm('回滚到这份自动备份？当前进度会被覆盖（可先手动导出留底）。')) return;
    if (restoreBackup(CUR_SLOT || 1, idx)) {
      toast('已回滚，即将刷新页面', 'good');
      sfx('close');
      setTimeout(() => location.reload(), 900);
    } else toast('回滚失败', 'warn');
  }));
}

// ---------- 经营手账（主线任务链） ----------
function renderQuests() {
  const box = $('#questBody'); if (!box) return;
  if (typeof QUESTS === 'undefined') return;
  if (!S.quests) S.quests = { done: {}, chapters: {} };
  const titleEl = $('#questTitle');
  if (titleEl) titleEl.textContent = S.title ? `称号 · ${S.title}` : '';
  const chIcon = on => `<i class="qChk ${on ? 'on' : ''}">${on ? '✓' : ''}</i>`;
  box.innerHTML = QUESTS.map(ch => {
    const chDone = ch.steps.every(q => S.quests.done[q.id]);
    return `<div class="qChapter ${chDone ? 'chDone' : ''}">
      <div class="qChHead">
        <b>${ch.name}</b>
        <span>${ch.steps.filter(q => S.quests.done[q.id]).length}/${ch.steps.length}${chDone ? ` · 称号「${ch.title}」` : ''}</span>
      </div>
      <div class="qChIntro">${ch.intro}</div>
      ${ch.steps.map(q => {
        const dn = !!S.quests.done[q.id];
        return `<div class="qStep ${dn ? 'done' : ''}">
          ${chIcon(dn)}
          <div class="qMain">
            <b>${q.name}</b><span>${q.desc}</span>
          </div>
          <div class="qReward">+${q.reward.coin} 币<div>+${q.reward.xp} 经验</div></div>
          ${dn ? `<em class="qWhen">第 ${S.quests.done[q.id]} 天达成</em>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function renderQuestChip() {
  const el = $('#questNum'); if (!el || typeof questProgress !== 'function') return;
  const p = questProgress(S);
  el.textContent = `${p.done}/${p.total}`;
  const btn = $('#btnQuest');
  if (btn) btn.title = p.done >= p.total ? '主线全部完成' : `主线进度 ${p.done}/${p.total}`;
}

// ---------- 初始化 ----------
function showGuide() {
  const g = $('#guide');
  if (!g) return;
  // 老玩家已经看过引导卡：跳过卡片，但没做过分步教学的仍要补一次
  let seenGuide = false;
  try { seenGuide = localStorage.getItem((typeof storeKey === 'function') ? storeKey('guide') : 'naturelab.guide') === '1'; } catch (e) {}
  if (seenGuide) {
    if (typeof tutorStart === 'function') setTimeout(() => tutorStart(false), 800);
    return;
  }
  g.classList.add('show');
  $('#guideClose').addEventListener('click', () => {
    g.classList.remove('show');
    localStorage.setItem((typeof storeKey === 'function') ? storeKey('guide') : 'naturelab.guide', '1');
    // 点"开始培育"就该真的开始：直接打开第一个空位的选种界面
    const empty = S.slots.find(s => s.unlocked && !s.plot);
    if (empty) {
      currentSlot = empty.id;
      renderAll();
      setTimeout(() => openPicker(empty.id), 220);
    }
    // 分步教学接在引导卡后面：玩家已经有心理准备，这时教最有效
    if (typeof tutorStart === 'function') setTimeout(() => tutorStart(false), 900);
  });
}

// ---------- 帮助与关于 ----------
const HELP_TABS = {
  basics: {
    t: '基础', body: `
      <h3>一轮培育的完整流程</h3>
      <div class="hFlow">
        <span>选种</span><i>→</i><span>幼苗</span><i>→</i><span>生长</span><i>→</i><span>开花</span><i>→</i><span>结果</span><i>→</i><span>收获</span><i>→</i><span>留种</span>
      </div>
      <p>一轮培育共需 15–30 个游戏天（14 秒 = 1 天，物种与阶段数不同会略有差异）。时间会自动流逝，也可用右上角 1x / 2x / 4x 加速，或点「暂停」定格慢慢调。</p>
      <h3>每个阶段要做的三件事</h3>
      <ol class="hList">
        <li><b>把环境调进绿区。</b>温度、湿度、日照、含水四项各有适宜区间，偏差越大健康掉得越快。</li>
        <li><b>补一次营养。</b>点「按阶段配肥」，系统按当前阶段需求自动配好 N/P/K。进入新阶段后需求会变，要再配一次。</li>
        <li><b>处理病害。</b>健康度长期低于 65 会随机生病，一次损失 3–5 分并持续掉血，30 币「防治」可清除。</li>
      </ol>
      <h3>健康度怎么变化</h3>
      <table class="hTable">
        <tr><th>条件</th><th>效果</th></tr>
        <tr><td>适生评分 ≥ 85</td><td class="good">健康 +1.6/天</td></tr>
        <tr><td>适生评分 70–85</td><td>健康 +0.8/天</td></tr>
        <tr><td>适生评分 50–70</td><td class="warn">健康 −0.6/天</td></tr>
        <tr><td>适生评分 &lt; 50</td><td class="bad">健康 −2.2/天，生长停滞</td></tr>
        <tr><td>健康归零</td><td class="bad">植株枯死，本轮失败（不留种）</td></tr>
      </table>
      <p class="hTip">生长速度 = 基础速度 × 适生系数 × 活力加成。适生越高，长得越快，也越不容易在季节转换时崩盘。</p>`
  },
  env: {
    t: '环境与设备', body: `
      <h3>五项环境参数</h3>
      <table class="hTable">
        <tr><th>参数</th><th>由什么决定</th><th>怎么调</th></tr>
        <tr><td>温度</td><td>天气基准 + 昼夜 + 季节 + 手动偏移 + 设备</td><td>加温器 +4℃ / 降温风扇 −4℃ / 手动偏移 ±3℃</td></tr>
        <tr><td>湿度</td><td>天气 + 季节 + 偏移 + 设备</td><td>加湿雾化 +12% / 除湿通风 −12%</td></tr>
        <tr><td>日照</td><td>当日累计日照 + 季节 + 偏移 + 设备</td><td>补光灯 +3.5h / 遮阳网 −2.5h</td></tr>
        <tr><td>含水</td><td>土壤基础 + 浇水 + 季节压制 − 每日蒸发</td><td>点「浇水」+22%，会随天蒸发</td></tr>
        <tr><td>pH</td><td>当前天气（固定）</td><td>不可调，作为背景约束参考</td></tr>
      </table>
      <h3>设备开关规则</h3>
      <p>六台设备都是"开关"而非"旋钮"，点一下即生效。相反的一对自动互斥（开加温会自动关降温）。</p>
      <p class="hTip"><b>恶劣季节设备效率打 8 折</b>：冬夏两季设备只能发挥 80% 的幅度，保温层每级 +10%，满级 110% 反而更强。这也是"温室改造"存在的意义。</p>
      <h3>三个快速操作的区别</h3>
      <table class="hTable">
        <tr><th>操作</th><th>能力</th><th>适用</th></tr>
        <tr><td>一键调到适宜</td><td>偏移 ±3℃、单台设备</td><td>免费，日常应急</td></tr>
        <tr><td>自动调控 Lv1</td><td>偏移 ±4.5℃、设备可成组、每日自动</td><td>700 币 + 4 币/天/槽</td></tr>
        <tr><td>自动调控 Lv2</td><td>同上 + 自动补水</td><td>1600 币 + 8 币/天/槽</td></tr>
      </table>
      <p class="hTip">自动调控每天推进时重算一次，会做闭环修正避免超调。但它<b>不解病害、不配肥</b>——那些还得你来。</p>`
  },
  quality: {
    t: '品质判定', body: `
      <h3>品质分的构成</h3>
      <table class="hTable">
        <tr><th>来源</th><th>权重</th><th>说明</th></tr>
        <tr><td>全程平均适生</td><td>52%</td><td>每一天的适生分取平均，<b>不是最后一天</b></td></tr>
        <tr><td>平均健康度</td><td>18%</td><td>掉血的天数越多分越低</td></tr>
        <tr><td>最低健康</td><td>14%</td><td>一次濒死经历会拉低整轮成绩</td></tr>
        <tr><td>末次体检</td><td>16%</td><td>收获前那一刻的状态</td></tr>
        <tr><td>病害天数</td><td>每病天 −3.5</td><td>最多扣 15 分</td></tr>
        <tr><td>极端环境天数</td><td>每极端天 −4</td><td>最多扣 12 分</td></tr>
        <tr><td>活力加成</td><td>+0～+6.6</td><td>来自亲本代数与选育</td></tr>
      </table>
      <h3>等级门槛</h3>
      <div class="hGrades">
        <span class="sg S">S ≥ 92</span><span class="sg A">A ≥ 82</span><span class="sg B">B ≥ 70</span><span class="sg C">C ≥ 56</span><span class="sg D">D &lt; 56</span>
      </div>
      <p class="hTip"><b>S 级需要全程平均适生 ≥ 89</b>。这意味着"调一次就不管"拿不到 S——你必须持续跟住每个阶段的变化。这也是游戏中后期的主要挑战。</p>
      <h3>产量与售价</h3>
      <p>产量随阶段完整度与育苗架等级提升；单价按品质指数增长（品质 93 与 55 的同种作物价格差 60%+）。收获仓<b>按批次分别计价</b>，不会把 S 级和 C 级混算。</p>`
  },
  graft: {
    t: '远缘嫁接', body: `
      <h3>嫁接和杂交有什么不同</h3>
      <p>杂交是<b>同种</b>两粒种子融合，追求活力与代数，稳定、可积累。嫁接是<b>跨物种</b>硬拼，追求"自然界不该存在的东西"——高赔率、多数失败。</p>
      <div class="hFormula">成活率 = 亲和度 × 方向修正 × 季节系数</div>
      <h3>亲和度决定一切</h3>
      <p>嫁接的本质是维管束能否对接，取决于形成层亲和性。游戏把 9 个物种的所有两两组合都写进了亲和表：</p>
      <table class="hTable">
        <tr><th>组合类型</th><th>亲和度</th><th>实际成活率</th><th>说明</th></tr>
        <tr><td>同科近缘</td><td class="good">0.34 – 0.42</td><td class="good">35% – 42%</td><td>番茄×向日葵、草莓×番茄</td></tr>
        <tr><td>同纲异科</td><td>0.18 – 0.30</td><td>20% – 32%</td><td>帝王蝶×蜜蜂、林蛙×锦鲤</td></tr>
        <tr><td>跨界尝试</td><td class="bad">0.09 – 0.12</td><td class="bad">8% – 14%</td><td>锦鲤×平菇、帝王蝶×平菇</td></tr>
        <tr><td>未记载组合</td><td class="bad">0.05</td><td class="bad">约 4%</td><td>表外的任意搭配</td></tr>
      </table>
      <h3>方向也有意义</h3>
      <p>同一个组合，"谁当砧木、谁当接穗"结果不同。把向日葵当砧木（根系强）比反过来成功率高约 10%；蛙当砧木能借水环境承载；兔当接穗比当砧木更好。</p>
      <h3>三种结果</h3>
      <ul class="hList">
        <li><b>接活</b>：得到一株命名嫁接体，活力按双亲均值上浮 2.2–5.6，产量 +15%～+60%，售价 +20%～+80%。可直接播到任一培育位。</li>
        <li><b>假活</b>：接口初步愈合，2–5 天后接穗突然萎蔫。除了场地费，再扣 60 币清理费——这是最贵的一种失败，因为它先让你以为成了。</li>
        <li><b>不亲和</b>：切口褐变，接穗当场枯死。只损失场地费与材料。</li>
      </ul>
      <h3>成本与消耗</h3>
      <p>每次嫁接 <b>120 币</b>，并<b>消耗砧木与接穗各一份种质</b>。这意味着嫁接是真正的"消耗型实验"，不能无脑刷。</p>
      <p class="hTip">冬季形成层活动弱，成功率打八折。想让最难的组合成型，挑春夏做。</p>
      <h3>嫁接体怎么用</h3>
      <p>接活的嫁接体存在「嫁接体库」里，播种后培育位会显示它的专属名字和「嫁接体」标识，产量与售价加成在收获时结算。图鉴的培育档案也会记录它的名字与双亲——它们是这一局独有的。</p>
      <div style="margin:10px 0 14px"><button class="btn small primary" id="btnOpenGraftFromHelp">打开远缘嫁接</button></div>
      <h3>三个相关成就</h3>
      <ul class="hList">
        <li><b>越界者</b>：接活第一株嫁接体</li>
        <li><b>缝合匠</b>：累计完成 10 次嫁接实验</li>
        <li><b>造物者</b>：手中同时保有三株嫁接体</li>
      </ul>`
  },
  breed: {
    t: '选育与杂交', body: `
      <h3>自留种：活力的来源</h3>
      <p>每次收获都会留下一粒种子。它的活力由<strong>本代品质</strong>与<strong>亲本活力</strong>共同决定：</p>
      <div class="hFormula">活力 = 亲本活力 × 0.62 + (品质 − 75) × 0.30</div>
      <p>另有 12% 概率产生 ±3 的随机波动，2% 概率产生 ±10 的大突变。活力范围 −8 到 +30，且负数会乘以 0.82 做"回归"——防止一次失误把血统永久拖垮。</p>
      <table class="hTable">
        <tr><th>活力</th><th>评分加成</th><th>生长速度</th><th>典型达成</th></tr>
        <tr><td>+25</td><td>+13.8</td><td>×1.30</td><td class="good">长期只留 S 级母本（约 25 代）</td></tr>
        <tr><td>+16</td><td>+8.8</td><td>×1.19</td><td class="good">稳定 S 级（约 15 代）</td></tr>
        <tr><td>+8</td><td>+4.4</td><td>×1.10</td><td class="good">稳定 A 级（约 12 代）</td></tr>
        <tr><td>0</td><td>0</td><td>×1.00</td><td>普通（一直 B 级）</td></tr>
        <tr><td>−7</td><td>−3.9</td><td>×0.92</td><td class="bad">长期只留 C 级母本</td></tr>
      </table>
      <p class="hTip">选育是一条<b>会走回头路</b>的曲线：稳定 B 级（75 分）只是原地踏步，A 级才真正抬升血统，S 级坚持十几代才见分晓。品质掉档要立刻补回——低分母本会把活力往下拖。</p>
      <h3>杂交：跨血缘的组合</h3>
      <p>图鉴里点「杂交」，选两粒不同代数/活力的种子作亲本：</p>
      <ul class="hList">
        <li>基础值取两亲本活力的平均</li>
        <li>杂种优势 1.6～3.2（两次随机叠加），且不超过较优亲本 +3</li>
        <li>6% 概率 ±12 大突变、20% 概率 ±4 波动</li>
        <li>消耗 60 币，双方血缘会被记录（避免近亲反复回交）</li>
      </ul>
      <p class="hTip">杂交是突破单线选育天花板的唯一手段：两株 +6 和 +8 的父母，可能生出 +7.9 的后代，也可能爆出 +12。</p>`
  },
  econ: {
    t: '经济与季节', body: `
      <h3>金币从哪来</h3>
      <ol class="hList">
        <li><b>散卖</b>：收获仓里逐批出售，价格 = 基础价 × 品质系数 × 季节系数。</li>
        <li><b>订单</b>：4 类客户按物种、最低品质、代数下单，通常比散卖高 15%–110%。</li>
        <li><b>活动奖励</b>：成就解锁与等级提升会带来少量补给。</li>
      </ol>
      <h3>八类客户</h3>
      <table class="hTable">
        <tr><th>客户</th><th>倍率</th><th>门槛</th><th>专收</th></tr>
        <tr><td>社区市集</td><td>×1.15</td><td>无</td><td>全部物种</td></tr>
        <tr><td>自然课堂</td><td>×1.40</td><td>B 级（≥66）</td><td>全部物种</td></tr>
        <tr><td>湖畔餐厅</td><td>×1.65</td><td>A 级（≥80）</td><td>全部物种</td></tr>
        <tr><td>中药铺</td><td>×1.75</td><td>B+ 级（≥78）</td><td>芦荟、蜜蜂、平菇、鸡</td></tr>
        <tr><td>水族馆</td><td>×1.62</td><td>B+ 级（≥74）</td><td>水生：林蛙、锦鲤、海月水母</td></tr>
        <tr><td>花艺工作室</td><td>×1.85</td><td>A 级（≥84）</td><td>全部物种</td></tr>
        <tr><td>育种研究所</td><td>×2.10</td><td>A 级且 G2+</td><td>全部物种</td></tr>
        <tr><td>摄影棚</td><td>×2.40</td><td>S 级且 G3+</td><td>全部物种</td></tr>
      </table>
      <p><b>定价 = 散卖单价 × 客户倍率 × (品质/78)^1.15 × 数量^-0.22</b>，并设硬性保底：任何订单都不低于同品质散卖 ×1.05。同时挂 3 单，12 天过期，20 币可手动刷新。</p>
      <p class="hTip">「专收」客户只做本行生意——中药铺和水族馆不会来问番茄。这让药用栽培（芦荟）和活体展示（水母）两条线各有稳定买家，而不是所有客户都只盯品质。</p>
      <p class="hTip">熟客体系：同一客户累计交满 3 单成为<b>熟客</b>（溢价 +8%），满 6 单升级为<b>连锁客户</b>（+15%，并有概率下连锁单：同物种 3 件、品质要求略降、价格 +30%）。</p>
      <h3>四季</h3>
      <table class="hTable">
        <tr><th>季节</th><th>环境压制</th><th>旺季物种</th></tr>
        <tr><td>春</td><td>湿度 +5%（有利）</td><td>草莓、林蛙 ×1.35</td></tr>
        <tr><td>夏</td><td>+2.5℃、−5% 湿、+1.4h 光</td><td>番茄、向日葵、帝王蝶 ×1.35</td></tr>
        <tr><td>秋</td><td>无</td><td>向日葵 ×1.35</td></tr>
        <tr><td>冬</td><td class="bad">−7℃、−9% 湿、−2h 光</td><td>仅草莓 ×1.0，其余 ×0.72</td></tr>
      </table>
      <p class="hTip">每季 10 天。冬季是最难的季节——它同时压低温度、湿度、光照和设备效率，且番茄、向日葵、帝王蝶、林蛙全部淡季。要么砸钱改造温室，要么趁淡季前清完库存。</p>`
  },
  pets: {
    t: '宠物养成', body: `
      <h3>宠物不走"长大卖钱"那条路</h3>
      <p>鸡、狗、猫各有一条<strong>专属的第二条结算线</strong>，都按天累积、和收获并列结算。它不在收获那一刻才判定——平时的每一天都在计分。</p>
      <h3>鸡：产蛋量</h3>
      <table class="hTable">
        <tr><th>因素</th><th>影响</th></tr>
        <tr><td>阶段</td><td>「开产」开始下蛋，「成鸡」是高峰；中鸡之前为 0</td></tr>
        <tr><td>光照</td><td>累计日照 13h 饱和，冬天/阴天明显偏低，补光灯有效</td></tr>
        <tr><td>蛋白 (N)</td><td>供给 60 是合理线，低于 55 明显掉产</td></tr>
        <tr><td>钙 (P)</td><td>低于需求会下「软壳蛋」，产量打 6 折</td></tr>
        <tr><td>抱窝</td><td>每天 1.2% 概率触发，连续 3 天停产，之后自动结束</td></tr>
      </table>
      <p class="hTip">蛋随时可收（面板「收蛋」按钮），不用等收获——这是鸡专属的第二条现金流。鸡蛋按批次入库，品质按蛋单独计。</p>
      <h3>狗与猫：默契度（0–100）</h3>
      <p>两者都用 5 档关系：「陌生/戒备 → 戒备/容忍 → 接纳/熟悉 → 亲近 → 生死相托/认主」。每上一档都会弹提示，首次到满档记一次成就。默契满值后收获时<strong>售价 +70%</strong>。</p>
      <table class="hTable">
        <tr><th>档位阈值</th><th>第 1 档</th><th>第 2 档</th><th>第 3 档</th><th>第 4 档</th><th>满值</th></tr>
        <tr><td>狗</td><td>陌生 0</td><td>戒备 18</td><td>接纳 40</td><td>亲近 65</td><td>生死相托 88</td></tr>
        <tr><td>猫</td><td>戒备 0</td><td>容忍 14</td><td>熟悉 34</td><td>亲近 58</td><td>认主 82</td></tr>
      </table>
      <p class="hTip">猫整体比狗低一档门槛——猫的「亲近」58 分就到，狗要到 65。成就「初次亲近」按先到者（猫）计。</p>
      <table class="hTable">
        <tr><th>行为</th><th>狗</th><th>猫</th></tr>
        <tr><td>什么都不做</td><td class="warn">+2.2/天</td><td class="good">+3.1/天</td></tr>
        <tr><td>每天陪一次</td><td class="good">+5.4/天（最快）</td><td>+2.2/天（收益低）</td></tr>
        <tr><td>环境舒适（熟睡）</td><td>−0.6/天</td><td class="good">+2.0/天（最快）</td></tr>
        <tr><td>环境差（躲起来）</td><td class="bad">−2.6/天</td><td class="bad">−4.5/天</td></tr>
      </table>
      <p class="hTip">狗是"被理会就开心"，猫是"别来烦我才舒服"——两种养法相反，但都要求环境先调好：适生低于 62 时再怎么陪也涨不动。表中数值按满舒适度计，实际每日涨幅 = 数值 ×（0.55 + 舒适度 × 0.75），环境越差涨得越慢。</p>
      <h3>与收获的关系</h3>
      <p>收获结算卡会多出一行：鸡显示<strong>存蛋 × 单价</strong>折算金币；狗猫显示<strong>默契档位与售价加成</strong>。宠物本体收获后，这些积累一起清算。</p>
      <h3>长期冷落的后果</h3>
      <p>默契不是只有"涨得慢"——宠物连续躲在角落里，会真的付出代价。狗和猫的表现<strong>完全相反</strong>：</p>
      <table class="hTable">
        <tr><th>宠物</th><th>预警</th><th>后果</th></tr>
        <tr><td>狗</td><td>无（它哪也不去）</td><td>分离焦虑变成<strong>拆家</strong>：默契 &lt; 20 且连续 3 天躲藏后，每天有概率掏一笔修理费（12–35 币），越多天不管越容易拆</td></tr>
        <tr><td>猫</td><td>默契 &lt; 25 且连续 2 天躲藏时，会"总在往门口看"——这是唯一一次警告</td><td>默契 &lt; 12 且连续 4 天躲藏后<strong>离家出走</strong>：槽位清空、不可挽回，档案记一笔「出走」，出走数进统计</td></tr>
      </table>
      <p class="hTip">狗是忠诚的惩罚（扣钱、可承受），猫是决绝的惩罚（清槽、不回头）。两者共享同一个触发条件——"环境舒适度长期不及格"——所以调好环境永远比事后补救便宜。</p>
      <p>但故事不总是糟糕结局：如果它真的走了，之后某天清晨，<strong>它可能会蹲回门口看你</strong>。那是唯一一次把它接回来的机会——默契会从「接纳」重新开始，但这一次你知道该怎么养了。</p>`
  },
  pond: {
    t: '池塘水体', body: `
      <h3>水生和陆生不是一套账</h3>
      <p>锦鲤这类水生物种，养在<strong>池塘</strong>而不是土壤里。温度、湿度、光照照样要管，但真正决定它活不活得下去的是两件事：<b>溶氧</b>和<b>氨氮</b>。</p>
      <div class="hFlow">
        <span>残饵与排泄</span><i>→</i><span>氨（剧毒）</span><i>→</i><span>硝化细菌</span><i>→</i><span>硝酸盐（毒性低）</span>
      </div>
      <p class="hTip">这条氮循环一旦"堵住"，氨就会在水里越积越高。锦鲤的鳃直接泡在水里，氨氮超标的伤害比陆地植物的"叶斑病"快得多。</p>
      <h3>两项水体指标</h3>
      <table class="hTable">
        <tr><th>指标</th><th>适宜范围</th><th>怎么变好</th><th>怎么变坏</th></tr>
        <tr><td><b>溶氧</b></td><td>6.0–9.5 mg/L</td><td>增氧泵（+2.4）、换水（+0.6）、白天藻类光合</td><td>鱼越大越耗氧、高温天、夜间没有光合</td></tr>
        <tr><td><b>氨氮</b></td><td>0–0.25 mg/L</td><td>生态过滤（−0.22）、换水（−0.35）</td><td>残饵与排泄累积，投喂过量（氮肥 >70）会加速</td></tr>
      </table>
      <h3>池塘专属设备</h3>
      <table class="hTable">
        <tr><th>设备</th><th>效果</th><th>使用要点</th></tr>
        <tr><td>增氧泵</td><td class="good">溶氧 +2.4 mg/L</td><td>最基础的一件，建议常开。它和遮光棚互斥（遮光会抑制藻类产氧）</td></tr>
        <tr><td>生态过滤</td><td class="good">氨氮 −0.22 mg/L</td><td>把氨转成低毒硝酸盐，长期开着最省心</td></tr>
        <tr><td>换水</td><td class="good">氨氮 −0.35、溶氧 +0.6</td><td><b>一次性动作，每次 22 币</b>，不留开关。氨氮逼近 0.25 就该换</td></tr>
        <tr><td>遮光棚</td><td>光照 −2h、水温 −1.5℃</td><td>夏天防晒降温用，但会压氧，别和增氧泵对着用</td></tr>
      </table>
      <h3>为什么不能"调好一次放到底"</h3>
      <p>水体是活的：鱼每天在耗氧、在排氨。放着不管，溶氧大约<strong>每天掉 0.25–0.5 mg/L</strong>，氨氮稳步上升，8–10 天后就会跌破红线。所以池塘玩法是<b>周期性打理</b>，不是一次性调参。</p>
      <p class="hTip">装了「自动调控」之后，系统会在溶氧掉到危险线时自动帮你开泵——但氨氮它不管，那是你自己的活。</p>
      <h3>浊度</h3>
      <p>投喂过量或长期不换水，浊度会下降（水变浑）。浊度目前只做提示，不影响评分，但它是最早的预警信号：看到水开始浑，就该想想是不是喂多了。</p>`
  },
  events: {
    t: '随机事件', body: `
      <h3>每天会有事发生</h3>
      <p>从第 2 天起，每跨一天约有 <strong>40%</strong> 概率触发一个事件。事件会弹出让你选择——大多数都有代价与收益的取舍，没有绝对正确的答案。</p>
      <p class="hTip">事件在跨天时触发；如果你正在调节参数，它会等你停手后弹出，不会打断操作。</p>
      <h3>事件类型</h3>
      <table class="hTable">
        <tr><th>事件</th><th>典型选择</th></tr>
        <tr><td>狂风过境</td><td>加固（60 币）／ 硬扛（健康 −12）</td></tr>
        <tr><td>虫害预警</td><td>全面喷洒（45 币）／ 只护一处（50% 染病）</td></tr>
        <tr><td>客户加急</td><td>接单（3 天出货 ×2）／ 婉拒</td></tr>
        <tr><td>科研补助</td><td>120 币 ／ 换一粒 G2 良种</td></tr>
        <tr><td>寒潮预警</td><td>保温帘（80 币）／ 硬扛（今夜 −5℃）</td></tr>
        <tr><td>市集行情</td><td>跟进出货（今日 +35%）／ 原计划</td></tr>
        <tr><td>同行来访</td><td>请教（+60 经验）／ 请改进（120 币换 7 折改造）</td></tr>
        <tr><td>花期惊喜</td><td>同意拍摄（+90 币）／ 安静生长（健康 +6）</td></tr>
        <tr><td>管道渗漏</td><td>立即检修（40 币）／ 缓一夜（土壤偏湿）</td></tr>
        <tr><td>雷暴夜</td><td>全屋断电（气温 −3℃）／ 浪涌保护（70 币）</td></tr>
        <tr><td>冰雹预警</td><td>抢收外层（健康 −5）／ 盖防雹网（55 币）</td></tr>
        <tr><td>临时停电</td><td>烧水蓄热（30 币，−1.5℃）／ 随它去（−4℃）</td></tr>
        <tr><td>蜜蜂来访</td><td>留着授粉（全员健康 +6）／ 请人移走（35 币）</td></tr>
        <tr><td>暴雨汇流</td><td>疏通排水（25 币）／ 赌雨停（含水 +10、30% 烂根）</td></tr>
        <tr><td class="warn">博物馆征集</td><td>交一件 S 级（≥92）换 3 倍散卖价／ 舍不得，留着</td></tr>
        <tr><td>平静的一天</td><td>全员健康 +4，+12 经验</td></tr>
        <tr><td class="warn">门口的猫</td><td>只在有猫出走过时出现：接回来（默契从「接纳」重来）／ 喂一顿（25 币换 30 经验）</td></tr>
        <tr><td class="warn">藻华预警</td><td>有水生生物时出现：遮光换水（45 币）／ 先观察（35% 水霉、健康 −4）</td></tr>
        <tr><td class="warn">土壤返盐</td><td>有土壤作物时出现：大水淋洗翻耕（40 币）／ 硬扛（健康 −6）</td></tr>
        <tr><td class="warn">菌包污染</td><td>有食用菌时出现：隔离消毒（35 币）／ 只挑霉点（45% 杂菌扩散、健康 −5）</td></tr>
      </table>
      <h3>怎么判断该选哪个</h3>
      <ul class="hList">
        <li><b>看当前现金。</b>低于 100 币时优先选免费且损失可控的选项，"硬扛"通常比破产好。</li>
        <li><b>看收益窗口。</b>加急单的 3 天 ×2 只有在你有存货或即将收获时才值得接。</li>
        <li><b>看长期价值。</b>同行来访的 7 折改造在你要连买几项改造时价值远超 120 币。</li>
      </ul>`
  },
  soil: {
    t: '地力与轮作', body: `
      <h3>为什么不能一直种同一种</h3>
      <p>每个培育位有自己的<strong>地力</strong>。同一区连续种同一物种，地力会累积疲劳；同科不同种（如番茄与……）累得慢一些；换到不同科则完全不累加。</p>
      <table class="hTable">
        <tr><th>操作</th><th>地力变化</th></tr>
        <tr><td>连作同一物种</td><td class="bad">疲劳 +22</td></tr>
        <tr><td>换同科物种</td><td class="warn">疲劳 +10</td></tr>
        <tr><td>换不同科物种</td><td class="good">不累加</td></tr>
        <tr><td>有作物在长</td><td>每天 −3（自然降解）</td></tr>
        <tr><td>空置该区</td><td class="good">每天 −26（休耕恢复快）</td></tr>
      </table>
      <h3>疲劳的三种代价</h3>
      <table class="hTable">
        <tr><th>项目</th><th>满疲劳时</th></tr>
        <tr><td>适生分</td><td class="bad">−16 分</td></tr>
        <tr><td>产量</td><td class="bad">−30%</td></tr>
        <tr><td>病害概率</td><td class="bad">+18%</td></tr>
      </table>
      <p class="hTip">地力面板就在环境读数下方，会实时显示状态与三项影响。疲劳 ≥34 时建议换茬；实在赶时间可以花金币「翻耕改良」立即清零（疲劳越高越贵）。</p>
      <h3>一些实用轮作组合</h3>
      <ul class="hList">
        <li><b>番茄 → 林蛙 → 番茄</b>：跨科轮作，两边都不累加，适合只养两种熟悉物种的玩家。</li>
        <li><b>番茄 → 草莓 → 向日葵 → 帝王蝶 → 林蛙</b>：五科轮一圈，地力几乎不涨，还能吃满各季旺季。</li>
        <li><b>追求 S 级时不要连作</b>：疲劳直接扣 16 分适生，S 级门槛 92 分会变得几乎不可达。</li>
      </ul>`
  },
  quest: {
    t: '经营手账', body: `
      <h3>一条贯穿全程的主线，而不是又一份清单</h3>
      <p>顶栏「手账」里有 <strong>五章 20 步</strong>主线任务。它和每日目标不同：每日目标是当天的周转，手账是整段经营的成长轨迹。</p>
      <table class="hTable">
        <tr><th>章节</th><th>主题</th><th>核心考验</th></tr>
        <tr><td>第一章 · 开荒</td><td>立足温室</td><td>完成收获、扩建到 3 个培育位、接 3 笔订单</td></tr>
        <tr><td>第二章 · 品质</td><td>匠心培育</td><td>A 级、S 级各出一件，图鉴 20 阶段，研究 3 级</td></tr>
        <tr><td>第三章 · 经营</td><td>行家里手</td><td>改造满级、10 笔订单、累计收入 1 万、冬季出 A 级</td></tr>
        <tr><td>第四章 · 生命</td><td>万物有灵</td><td>宠物默契到「亲近」乃至满值、收 20 枚蛋、全物种通晓</td></tr>
        <tr><td>第五章 · 规模</td><td>温室主人</td><td>4 个培育位全开、18 物种全试种、3 家客户的熟客、累计收入 3 万</td></tr>
      </table>
      <h3>几个设计上的取舍</h3>
      <ul class="hList">
        <li><b>不用手动领取。</b>达成即自动结算，金币与经验当场到账——少一步操作，反馈也更及时。</li>
        <li><b>和成就共用触发节奏。</b>收获、跨天、交付订单等关键动作后统一检查，不会漏判。</li>
        <li><b>章节全通给称号。</b>第一章「立足温室」、第二章「匠心培育」、第三章「行家里手」、第四章「万物有灵」、第五章「温室主人」。称号显示在手账标题旁，也是你走到哪一步的标记。</li>
        <li><b>不逼刷。</b>每一步都能在正常经营里自然达成，没有"做 50 次同样的事"这种凑数步骤。</li>
      </ul>
      <p class="hTip">卡住时看手账最快：它会告诉你下一步该干什么，比翻帮助文档直观。</p>`
  },
  stats: {
    t: '统计与成就', body: `
      <h3>「统计」这一页是干什么的</h3>
      <p>右下角面板有三个标签：<b>动态</b>（最近发生的事）、<b>档案</b>（每一轮的履历）、<b>统计</b>（把档案汇总成一份年报）。统计页只读，不改任何数据，但它是唯一能告诉你「我到底擅长什么」的地方。</p>
      <h3>六项核心指标</h3>
      <table class="hTable">
        <tr><th>指标</th><th>含义</th><th>怎么变好</th></tr>
        <tr><td>成功率</td><td>成功收获 ÷ 总轮次</td><td>先求活：把最短板的那项环境指标拉进绿区</td></tr>
        <tr><td>平均品质</td><td>只统计成功的那些轮次</td><td>品质是<b>全程均值</b>，中途掉几天就补不回来，稳定比冲刺重要</td></tr>
        <tr><td>最高品质</td><td>历史最好的一次</td><td>追 S 级（≥92）需要全程适生均值 ≥89</td></tr>
        <tr><td>累计收入 / 日均收入</td><td>卖货与订单的总和 ÷ 培育天数</td><td>高品质的价格是非线性的，把一个位从 B 拉到 A 比多开一个位更划算</td></tr>
        <tr><td>培育天数</td><td>所有轮次的天数之和</td><td>—</td></tr>
      </table>
      <h3>三张分布图怎么看</h3>
      <ul class="hList">
        <li><b>物种表现</b>：按平均品质排序，条形旁边的「3/4 成功」是成功率。均分差距大，说明你偏心某个物种，或者某个物种本身更挑剔。</li>
        <li><b>品质分布</b>：S/A/B/C/D 各占多少。<b>如果 B 占比过半</b>，说明你的问题不是"养不活"，而是"停在了及格线"。</li>
        <li><b>健康度分布</b>：每轮的平均健康分档。<b>60–74 那一档如果很大</b>，代表这些轮次中途长期处在胁迫里，是拉低品质的主因。</li>
      </ul>
      <h3>失败归因</h3>
      <p>系统会把每轮的死因归类（环境不适、病害、缺水……）。<b>针对占比最高的那一个去调</b>，效率远高于全面乱调。</p>
      <h3>成就系统</h3>
      <p>共 <b>19 项</b>，分六类：培育、品质、经济、图鉴、选育、经营。在图鉴顶部按分类展示。</p>
      <ul class="hList">
        <li>已解锁的显示 <b>解锁日期</b>；</li>
        <li>未解锁但已有进度的，直接显示 <b>差多少</b>（例如「8600/10000 币」），不用猜；</li>
        <li>还没有进度的灰显描述，点一下会告诉你具体条件。</li>
      </ul>
      <p class="hTip">成就不是纯粹的勋章：「博物学家」要求全部物种通晓里程碑，「无人值守」要求自动调控满级——它们其实是把你推向"试试别的玩法"的引导。</p>`
  },
  tutor: {
    t: '新手教学', body: `
      <h3>随时可以重看</h3>
      <p>第一次进入游戏时，会有一套<b>分步教学</b>：每一步指向屏幕上的真实控件，做完自动进入下一步。中途可以跳过，之后想重看就点下面的按钮。</p>
      <div style="margin:10px 0 14px"><button class="btn small primary" id="btnReplayTutor">重新播放教学</button></div>
      <h3>八步分别教什么</h3>
      <table class="hTable">
        <tr><th>步骤</th><th>你要做的事</th><th>为什么重要</th></tr>
        <tr><td>1 选位</td><td>点第一块培育位</td><td>没选位就不会有下文</td></tr>
        <tr><td>2 选种</td><td>挑番茄</td><td>番茄环境宽容，适合第一次</td></tr>
        <tr><td>3 看读数</td><td>把适生评分推进 85</td><td>这是整个游戏的核心指标</td></tr>
        <tr><td>4 开设备</td><td>开任意一台，或一键调适宜</td><td>学会用设备而不是改数字</td></tr>
        <tr><td>5 配肥</td><td>点「按阶段配肥」</td><td>营养偏差 12 以内算合格</td></tr>
        <tr><td>6 等长大</td><td>等它进幼苗期</td><td>理解时间会自动流逝</td></tr>
        <tr><td>7 收获</td><td>成熟后收获</td><td>完成一次完整循环</td></tr>
        <tr><td>8 手账</td><td>打开「手账」看主线</td><td>之后不知道做什么时，答案都在这里</td></tr>
      </table>
      <p class="hTip">教学只教"怎么操作"，不代替你做决策。真正影响品质的是全程的适生均值——这一点教学里没强调，但你迟早会自己发现。</p>`
  },
  slots: {
    t: '多存档', body: `
      <h3>三个独立存档位</h3>
      <p>顶栏「存档」可以管理 <b>三个互不干扰的存档位</b>。每个位保存完整进度（培育位、图鉴、成就、金币、每日目标全都在内）。</p>
      <h3>什么时候该用新存档位</h3>
      <ul class="hList">
        <li><b>想重新体验前期</b>：后期全解锁后，前期的"钱不够、位置不够"那种紧张感就没了，开新档才找得回来。</li>
        <li><b>想试另一种玩法</b>：比如一个档专攻品质、另一个档专攻订单与扩张，两边的数据可以对比。</li>
        <li><b>怕手滑</b>：重要进度留在存档 1，实验性玩法放存档 2，怎么折腾都不心疼。</li>
      </ul>
      <h3>切换与覆盖的规则</h3>
      <table class="hTable">
        <tr><th>操作</th><th>会发生什么</th></tr>
        <tr><td>切换到别的存档</td><td><b>先把当前进度落盘</b>，再载入目标存档并刷新页面</td></tr>
        <tr><td>覆盖新开</td><td>该槽位进度清空，从第 1 天 120 币重新开始，<b>会二次确认</b></td></tr>
        <tr><td>重开本档</td><td>清空当前存档并重开，<b>同样二次确认</b></td></tr>
        <tr><td>删除某个存档</td><td>只对非当前槽位开放，删除后不可恢复</td></tr>
      </table>
      <p class="hTip">导出/导入存档（在图鉴页）作用于<b>当前槽位</b>。想备份某个档，先切过去再导出。</p>
      <h3>旧存档怎么办</h3>
      <p>如果你之前玩过单存档版本，第一次打开新版时，旧进度会<b>自动迁移到存档 1</b>，不需要任何操作。</p>`
  },
  scene3d: {
    t: '3D 场景', body: `
      <h3>这是什么</h3>
      <p>舞台背景是一层真正用 <b>Three.js</b> 实时渲染的立体场景，会跟着你的培育位自动切换成对应的空间：</p>
      <table class="hTable">
        <tr><th>栖息地</th><th>立体场景</th></tr>
        <tr><td>土壤 / 笼舍</td><td>温室大棚：钢架拱顶、两排台架上的盆花、中央走道</td></tr>
        <tr><td>池塘</td><td>水体：水面波纹起伏、岸边石堆、水草随流摆动</td></tr>
        <tr><td>蜂箱</td><td>巢内：一整面琥珀色六边形巢脾（带蜜盖）、木质巢框</td></tr>
        <tr><td>暗室</td><td>菌床：多层出菇架、菌包、成簇的伞盖</td></tr>
      </table>

      <h3>要不要开</h3>
      <p>顶栏的 <b>3D</b> 按钮随时开关，选择会记住，下次打开还是你上次的样子。开或关都<b>不影响任何数值</b>——健康、适生分、产量全部由环境参数决定，3D 只是把环境"画出来"。</p>
      <p>关掉后用的是绘制好的背景图，观感更统一、也更省电。开着时画面更有纵深，能看见台架排到远处的样子。</p>

      <h3>机器带不动怎么办</h3>
      <p>程序自己会判断：</p>
      <ul>
        <li>浏览器不支持 WebGL，或显卡被驱动拉黑 → <b>直接不显示 3D</b>，按钮变灰，用背景图，不会出现黑屏</li>
        <li>跑起来帧率低于 18 → <b>先自动降分辨率</b>；还不行就自己关掉 3D 退回背景图</li>
        <li>中途显卡上下文丢失 → 背景图始终垫在最底下，你看到的仍然是完整画面</li>
      </ul>
      <p class="hTip">如果你特意想看 3D 但按钮是灰的，多半是无痕/隐私模式禁用了 WebGL，换普通窗口打开即可。</p>`
  },
  sound: {
    t: '音效说明', body: `
      <h3>这是什么声音</h3>
      <p>游戏里的全部声音都是浏览器<b>现场合成</b>的（Web Audio），没有加载任何音频文件，所以单文件版在断网时照样有声音。</p>
      <table class="hTable">
        <tr><th>声音</th><th>什么时候出现</th></tr>
        <tr><td>簌的一声土响</td><td>播种——种子落进松土</td></tr>
        <tr><td>水声</td><td>浇水、换水</td></tr>
        <tr><td>继电器"嗒"</td><td>设备开/关</td></tr>
        <tr><td>三音上行</td><td>收获。S 级会多一层高音——<b>听得出来这次收得好</b></td></tr>
        <tr><td>金币双音</td><td>售出获得金币</td></tr>
        <tr><td>四音级进</td><td>升级</td></tr>
        <tr><td>钟声</td><td>解锁成就 / 物种通晓</td></tr>
        <tr><td>小二度不安音程</td><td><b>出事了</b>：植株生病。听到就该打开面板看</td></tr>
        <tr><td>下行小调</td><td>一株培育体死亡</td></tr>
      </table>
      <h3>音量与静音</h3>
      <p>右上角「🔊 音效」是一键开关；想调大小，点「⚙ 设置」拖<b>音量滑杆</b>（0–100）。两者都保存在浏览器里，不占存档位。</p>
      <p class="hTip">整体音量压得比较低，是氛围反馈而不是音效轰炸。如果还是嫌吵，直接静音即可，不影响任何玩法。</p>
      <h3>更多偏好（更多 › 设置）</h3>
      <table class="hTable">
        <tr><th>项目</th><th>作用</th></tr>
        <tr><td>氛围音乐</td><td>程序化生成的环境铺底，独立开关与音量，与音效静音<b>互不影响</b>。还会跟着场景与四季双重变奏：<b>场景</b>——温室白天 / 夜晚（低八度、更稀疏）/ 水景（清亮 + 流水声）/ 蜂房（明亮密集）/ 暗房（低沉缓慢）；<b>四季</b>——春基准、夏升高更明亮、秋转暖、冬低沉稀疏。种什么、什么季节，听感都不一样。收获与成就时 BGM 会奏一段上行琶音呼应，死亡与恶性事件则涌起低音小二度</td></tr>
        <tr><td>减少动效</td><td>关掉粒子、数字飘字、屏幕震动、卡片入场和场景呼吸。系统开了「减少动态效果」会自动跟随</td></tr>
        <tr><td>色盲友好</td><td>提升对比度，状态改「图标 + 颜色」双通道。品质本就用 S/A/B/C/D 字母区分，不依赖颜色</td></tr>
        <tr><td>界面字号</td><td>小 / 中 / 大三档，只放大正文，不改布局比例</td></tr>
        <tr><td>切后台自动暂停</td><td>切走标签页就停表，回来继续。避免挂机时进度乱涨</td></tr>
        <tr><td>全屏</td><td>沉浸模式，也可直接按 F11</td></tr>
      </table>
      <p class="hTip">偏好与存档是<b>分离</b>的：切换存档不会重置这些设置。</p>`
  },
  keys: {
    t: '快捷、设置与存档', body: `
      <h3>时间控制</h3>
      <table class="hTable">
        <tr><th>操作</th><th>说明</th></tr>
        <tr><td>1x / 2x / 4x</td><td>时间流速，14 秒 = 1 天（1x）</td></tr>
        <tr><td>暂停</td><td>停止时间流逝，方便慢慢调参</td></tr>
        <tr><td>Esc</td><td>关闭当前弹窗</td></tr>
      </table>
      <h3>存档</h3>
      <ul class="hList">
        <li>每天自动存入浏览器 localStorage（键名 <code>naturelab.save.v1</code>）</li>
        <li>图鉴底部可<b>导出 JSON</b>，换设备或清缓存后<b>导入恢复</b></li>
        <li>「重置」会清空全部进度，不可撤销</li>
      </ul>
      <h3>常见问题</h3>
      <details class="hFaq"><summary>植株一直不长怎么办？</summary><p>先看右侧「适生」。低于 50 时生长几乎停滞，通常是温度或日照偏离太远。点「一键调到适宜」紧急回正，再检查是否漏了配肥。</p></details>
      <details class="hFaq"><summary>为什么收获只有 B 级？</summary><p>可能原因：中途有几天适生低于 70、发病未及时治、或某个阶段没配肥。品质是全程平均，单靠最后一天拉高无效。</p></details>
      <details class="hFaq"><summary>钱不够买种子？</summary><p>种子价按「该物种 B 级品质的收成 ÷ (1+利润率)」算，简单物种便宜（番茄 80 币）、困难物种反而有溢价空间（仓鸮仅 45 币但收成高）。开局 120 币只够买一粒番茄——它是唯一能让你稳赚的起步选择，把它养到 A 级以上，一轮就能回本并留下下一粒种子。</p></details>
      <details class="hFaq"><summary>冬季养不活怎么办？</summary><p>优先买「保温层」（140 币起），它同时抵消寒冷压制和设备效率折扣，是最划算的第一笔投资。</p></details>`
  },
  live: {
    t: '数值速查', body: `
      <h3>当前存档的实时数值</h3>
      <p>这一页不是固定文档——每次打开都会按你现在的存档重新算一遍，方便你判断「下一步钱花在哪」。</p>
      <div id="liveStat"></div>
      <h3>怎么用这份表</h3>
      <ul class="hList">
        <li><b>看待分配余量。</b>「每小时收入」是你现在这套配置的产出速度，扩建/升级的回本周期都靠它算。</li>
        <li><b>看离家底最近的一项。</b>「缺口」列会直接告诉你还差多少，不用自己减。</li>
        <li><b>看升级是否划算。</b>育苗架每级 +18% 收获金币，按你当前的轮次收入算回本轮数；超过 20 轮就先别买。</li>
      </ul>`
  }
};

// 数值速查页的动态渲染：每次打开帮助时重算
function renderLiveStat() {
  const box = document.getElementById('liveStat');
  if (!box) return;
  const ub = (typeof upgradeBonus === 'function') ? upgradeBonus(S) : { yieldPct: 0 };
  const netAvg = SPECIES_ORDER.reduce((a, id) => {
    const sp = SPECIES[id];
    return a + (harvestValue(sp, 75).coins - seedPrice(sp));
  }, 0) / SPECIES_ORDER.length;
  const slots = (S.slots || []).filter(s => s.unlocked).length;
  const perRound = Math.round(netAvg * slots * (1 + (ub.yieldPct || 0)));
  const roundDays = 23;
  const perDay = Math.round(perRound / roundDays);
  const upCost = document.getElementById('_dummy'); // 占位，避免误用
  const nextSlot = (S.slots || []).find(s => !s.unlocked);
  const row = (k, v, note) => `<tr><td>${k}</td><td class="good"><b>${v}</b></td><td>${note || ''}</td></tr>`;

  const rows = [
    row('培育位', `${slots} / 4`, nextSlot ? `下一位 ${nextSlot.price} 币，约 ${Math.ceil(nextSlot.price / Math.max(1, perRound))} 轮` : '已全部解锁'),
    row('单轮净利（平均）', `≈ ${Math.round(netAvg)} 币`, '按 18 物种 B 级品质的均值'),
    row('每轮总收入（含升级）', `${perRound} 币`, ub.yieldPct ? `育苗架加成 +${Math.round(ub.yieldPct * 100)}%` : '未搭建育苗架'),
    row('日均收入（估）', `≈ ${perDay} 币`, `按每轮 ${roundDays} 天、单槽计；接入订单后通常翻倍`),
    row('金币', `${S.coins} 币`, S.coins < 100 ? '低于 100，事件里优先选免费方案' : ''),
    row('累计收入', `${Math.round((S.stats && S.stats.totalEarn) || 0)} 币`, ''),
    row('成功率', `${(S.stats && S.stats.rounds) ? Math.round(((S.stats.success || 0) / S.stats.rounds) * 100) : 0}%`, `共 ${(S.stats && S.stats.rounds) || 0} 轮`),
    row('图鉴进度', `${SPECIES_ORDER.filter(id => (S.codex || {})[id] && (S.codex[id].seen || []).length).length} / 18 物种`, ''),
    row('成就', `${ACHIEVEMENTS.filter(a => S.achv && S.achv[a.id]).length} / ${ACHIEVEMENTS.length}`, `累计可领 ${ACHIEVEMENTS.filter(a => S.achv && S.achv[a.id]).reduce((a, c) => a + (c.reward || 0), 0)} 币`),
    row('手账', `${typeof questProgress === 'function' ? (questProgress(S).done || 0) : 0} / ${QUESTS.reduce((a, c) => a + c.steps.length, 0)} 步`, S.title ? `当前称号「${S.title}」` : '尚无称号'),
    row('熟客', `${Object.values((S.stats && S.stats.clientRep) || {}).filter(n => n >= 3).length} 家`, '交满 3 单成为熟客'),
    row('订单收入', `${Math.round((S.stats && S.stats.orderEarn) || 0)} 币`, '占总收入的比例越高，说明你在"卖"上比"种"更强')
  ].join('');

  // 升级回本速算
  const yld = (typeof UPGRADES !== 'undefined') ? UPGRADES.find(u => u.id === 'yield') : null;
  const yLv = (S.upgrades && S.upgrades.yield) || 0;
  let upNote = '';
  if (yld) {
    if (yLv >= yld.max) upNote = '<li>育苗架已满级（+54% 收获金币）。</li>';
    else {
      const cost = yld.cost[yLv];
      const gain = Math.round(perRound * 0.18);
      const back = Math.ceil(cost / Math.max(1, gain));
      upNote = `<li>育苗架 ${yLv}→${yLv + 1} 级：花 ${cost} 币，每轮多约 ${gain} 币，<b>${back} 轮回本</b>${back > 20 ? '（偏慢，先扩建培育位更划算）' : '（划算）'}。</li>`;
    }
  }

  box.innerHTML = `<table class="hTable">
      <tr><th>项目</th><th>当前值</th><th>说明 / 缺口</th></tr>
      ${rows}
    </table>
    <ul class="hList">${upNote}</ul>`;
}

// ---------- 多存档槽位 UI ----------
function renderSlotList() {
  const box = $('#slotList'); if (!box) return;
  const metas = typeof slotSummaries === 'function' ? slotSummaries() : {};
  let rows = '';
  for (let i = 1; i <= 3; i++) {
    const cur = i === curSaveSlot();
    const m = metas[i];
    const has = m && !m.empty;
    let sum = '空存档位 · 开始新的一局';
    if (has) {
      const d = new Date(m.when || Date.now());
      const dt = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      sum = `第 ${m.day} 天 · Lv.${m.level} · ${m.coins} 币 · ${m.rounds} 轮 · <em>${dt}</em>`;
    }
    rows += `<div class="slotRow ${cur ? 'cur' : ''} ${has ? '' : 'empty'}">
      <div class="slotInfo">
        <b>存档 ${i}${cur ? '<i class="slotNow">当前</i>' : ''}</b>
        <span>${sum}</span>
      </div>
      <div class="slotOps">
        ${cur ? '' : has ? `<button class="btn small" data-slotgo="${i}">切换</button>` : `<button class="btn small" data-slotgo="${i}">移过去</button>`}
        ${cur
          ? `<button class="btn small ghost" data-slotnew="${i}">重开本档</button>`
          : `<button class="btn small ghost" data-slotnew="${i}">${has ? '覆盖新开' : '新开'}</button>`}
        ${(!cur && has) ? `<button class="btn small danger" data-slotdel="${i}">删除</button>` : ''}
      </div>
    </div>`;
  }
  box.innerHTML = rows;
  $$('#slotList [data-slotgo]').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.slotgo;
    if (n === curSaveSlot()) return;
    saveGame(S);                    // 走之前先把当前档落盘
    switchSaveSlot(n);
    toast(`已切换到存档 ${n}，正在载入…`, 'good');
    setTimeout(() => location.reload(), 500);
  }));
  $$('#slotList [data-slotnew]').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.slotnew;
    const has = metas[n] && !metas[n].empty;
    if (has && !confirm(`存档 ${n} 已有进度，确定覆盖重开？此操作不可撤销。`)) return;
    if (n === curSaveSlot()) {
      if (!confirm('重开当前存档？全部进度清空，不可撤销。')) return;
      resetGame();
    } else {
      primeSlot(n);
      switchSaveSlot(n);
    }
    setTimeout(() => location.reload(), 400);
  }));
  $$('#slotList [data-slotdel]').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.slotdel;
    if (!confirm(`彻底删除存档 ${n}？不可恢复。`)) return;
    eraseSlot(n);
    toast(`存档 ${n} 已删除`, 'info');
    renderSlotList();
  }));
}

function renderHelp(key) {
  const tab = HELP_TABS[key] || HELP_TABS.basics;
  const box = $('#helpBody');
  if (box) box.innerHTML = tab.body;
  // 「数值速查」是动态页：渲染完正文后再按当前存档重算一遍
  if (key === 'live' && typeof renderLiveStat === 'function') {
    try { renderLiveStat(); } catch (e) { console.warn('live stat', e); }
  }
}
// 等级权益一览（嵌入图鉴）
function renderLevelPanel() {
  const box = $('#levelPanel'); if (!box) return;
  const lv = S.level || 1;
  const pk = levelPerk(S);
  const rows = Object.keys(LEVEL_UNLOCKS).map(Number).sort((a, b) => a - b).map(l => {
    const u = LEVEL_UNLOCKS[l];
    const on = lv >= l;
    return `<div class="lvRow ${on ? 'on' : ''}">
      <span class="lvNo">Lv.${l}</span>
      <span class="lvTxt">${u.text}</span>
      <span class="lvGift">${on ? '已享有' : `+${u.coin} 币`}</span>
    </div>`;
  }).join('');
  box.innerHTML = `
    <div class="lvNow">当前 <b>Lv.${lv}</b> · 培育位 ${pk.slotDiscount < 1 ? `${(pk.slotDiscount * 10).toFixed(1)} 折` : '原价'} ·
      改造 ${pk.upDiscount < 1 ? `${(pk.upDiscount * 10).toFixed(1)} 折` : '原价'} · 订单刷新 ${pk.refreshCost} 币</div>
    <div class="lvList">${rows}</div>`;
}

function openHelp(key) {
  renderHelp(key || 'basics');
  $$('[data-htab]').forEach(x => x.classList.toggle('on', x.dataset.htab === (key || 'basics')));
  $('.helpBox').scrollTop = 0;
  sfx('open');
  $('#helpModal').classList.add('show');
}

function openAbout() {
  const v = $('#aboutVer'), a = $('#aboutAchv'), t = $('#aboutTime');
  const sp = $('#aboutSp'), stg = $('#aboutStage');
  if (v) v.textContent = (typeof NL_APP_VERSION !== 'undefined') ? NL_APP_VERSION : '2.0';
  if (a) a.textContent = (typeof ACHIEVEMENTS !== 'undefined') ? ACHIEVEMENTS.length : 28;
  if (sp) sp.textContent = SPECIES_ORDER.length;
  if (stg) stg.textContent = SPECIES_ORDER.reduce((n, id) => n + SPECIES[id].stages.length, 0);
  if (t) {
    const d = S.day || 1;
    t.textContent = `你的第 ${d} 天 · ${S.records ? S.records.length : 0} 份培育档案`;
  }
  const aacc = $('#aboutAcc');
  if (aacc && typeof NL !== 'undefined' && NL.active()) aacc.textContent = NL.active().name;
  $('#aboutModal').classList.add('show');
}

// ---------- 随机事件 ----------
let pendingEvent = null;

function fireEvent() {
  if (typeof maybeEvent !== 'function') return;
  const ev = maybeEvent(S);
  if (!ev) return;
  pendingEvent = ev;
  $('#evName').textContent = ev.name;
  $('#evDesc').textContent = ev.desc;
  const ic = $('#evIcon');
  ic.innerHTML = icon(ev.icon || 'leaf');
  $('#evOpts').innerHTML = ev.opts.map((o, i) => {
    const afford = !o.cost || S.coins >= o.cost;
    const noStock = ev.id === 'museum' && i === 0 && !fridgeHasS();
    return `<button class="evOpt" data-opt="${i}" ${afford && !noStock ? '' : 'disabled'} title="${noStock ? '收获仓里没有 S 级存货' : ''}">
      <span>${o.t}</span>
      <span class="evCost ${o.cost ? '' : 'free'}">${noStock ? '缺 S 级' : o.cost ? o.cost + ' 币' : '免费'}</span>
    </button>`;
  }).join('');
  $$('#evOpts [data-opt]').forEach(b => b.addEventListener('click', () => chooseEvent(+b.dataset.opt)));
  sfx('event');
  $('#eventModal').classList.add('show');
}

function chooseEvent(i) {
  const ev = pendingEvent;
  if (!ev) return;
  const o = ev.opts[i];
  if (!o) return;
  if (o.cost && S.coins < o.cost) return toast('金币不足', 'warn');
  if (o.cost) S.coins -= o.cost;
  const e = o.eff || {};

  if (e.coin) { S.coins += e.coin; floatCoins(e.coin); }
  if (e.xp) addXp(e.xp);
  if (e.log) addLog(S, `【${ev.name}】${e.log}`, e.loseHealth || e.tempDrop ? 'bad' : 'info');
  if (e.loseHealth || e.disease) { shakeScreen('sm'); if (typeof bgmAccent === 'function') bgmAccent('bad'); }   // 恶性选项轻震一下，配合小二度不安音程
  if (e.toast) toast(e.toast, 'good');

  // 对所有培育位施加影响
  S.slots.forEach(sl => {
    const p = sl.plot; if (!p) return;
    if (e.loseHealth) p.health = Math.max(0, p.health - e.loseHealth);
    if (e.health) p.health = Math.min(100, p.health + e.health);
    if (e.disease && Math.random() < e.disease && !p.disease) {
      p.disease = { n: '蚜虫', s: 1.5, t: '聚集嫩梢刺吸汁液' };
      p.diseaseDays = 0;
    }
    if (e.tempDrop) p.eventTempDrop = e.tempDrop;
    if (e.waterOver) p.waterBonus = (p.waterBonus || 0) + e.waterOver;
  });

  if (e.rush) { S.rush = { until: S.day + e.rush, mult: 2 }; }
  if (e.priceBoost) { S.priceBoost = { until: S.day, mult: e.priceBoost }; }
  if (e.upgradeDiscount) { S.upDiscount = 0.7; }
  if (e.seed) {
    const id = SPECIES_ORDER[Math.floor(Math.random() * SPECIES_ORDER.length)];
    seedList(id).push({ gen: 2, vig: 3 });
    addLog(S, `获得 ${SPECIES[id].name} G2 良种一粒`, 'good');
  }
  if (e.museum) {
    // 博物馆征集：交出收获仓里品质最高的一件（要求 S 级 ≥92），报酬按该件散卖价的 3 倍
    let best = null;
    Object.keys(S.fridge || {}).forEach(spId => {
      (S.fridge[spId] || []).forEach(b => { if (b.n > 0 && (!best || b.q > best.q)) best = { spId, ...b }; });
    });
    if (!best || best.q < 92) {
      toast('收获仓里没有 S 级（≥92）的存货', 'warn');
      addLog(S, `【${ev.name}】收获仓里没有拿得出手的 S 级，征集只好作罢`, 'warn');
    } else {
      best.n -= 1;
      if (best.n <= 0) S.fridge[best.spId] = (S.fridge[best.spId] || []).filter(b => b.n > 0);
      const val = Math.round(fridgeUnitPrice(best.spId, best.q) * 3);
      S.coins += val;
      S.stats.totalEarn = (S.stats.totalEarn || 0) + val;
      S.stats.museum = (S.stats.museum || 0) + 1;
      addLog(S, `【${ev.name}】${SPECIES[best.spId].name}（品质 ${Math.round(best.q)}）入馆，报酬 ${val} 币`, 'good');
      toast(`标本入馆，+${val} 币`, 'good');
      sfx('coin');
    }
  }
  if (e.adoptBack) {
    // 寻回出走的猫：放进第一个空位，默契从「接纳」档重新开始，但保留警惕（bondHidden 视环境重算）
    const slot = S.slots.find(sl => sl.unlocked && !sl.plot);
    if (slot) {
      if (!seedList('cat').length) seedList('cat').push({ gen: 1, vig: 3 });
      plantTo(slot.id, 'cat');
      const p = slot.plot;
      if (p) {
        p.stage = Math.min(4, SPECIES.cat.stages.length - 1);
        p.health = 72; p.quality = Math.max(p.quality || 0, 60);
        p.bond = 34; p.bondHidden = null; p.lowDays = 0; p.runawayWarned = false; p.playedToday = true;
        S.stats.readopt = (S.stats.readopt || 0) + 1;
      }
    }
  }

  pendingEvent = null;
  $('#eventModal').classList.remove('show');
  S.events = S.events || { seen: 0 };
  S.events.seen++;
  sfx('event');
  if (e.adoptBack) sfx('mile');   // 寻回爱宠，值得一段上行音
  renderAll(); saveGame(S);
}

// ---------- 每日目标 ----------
// 打点入口：任何行为达成目标时给即时反馈，避免玩家"做完了也不知道"
function hitTask(id, add) {
  if (typeof progressTask !== 'function') return;
  const completed = progressTask(S, id, add);
  renderTaskChip();
  if (completed) {
    toast(`目标达成：${completed.name}（+${completed.coin} 币）`, 'good');
    addLog(S, `完成目标「${completed.name}」`, 'good');
  }
  saveGame(S);
}

function claimTask(id) {
  const d = ensureDailyTasks(S);
  const t = d.list.find(x => x.id === id);
  if (!t || !t.done || t.got) return;
  t.got = true;
  S.coins += t.coin;
  addXp(S, t.xp);
  toast(`领取 ${t.coin} 币`, 'good');
  // 三个都领完给宝箱
  if (d.list.every(x => x.got) && !d.bonus) {
    d.bonus = true;
    const extra = 60 + S.day * 2;
    S.coins += extra;
    S.inventory.tomato = S.inventory.tomato || [];
    addLog(S, `今日目标全部达成，宝箱 +${extra} 币`, 'good');
    toast(`今日目标全清！额外奖励 +${extra} 币`, 'good');
  }
  renderTaskChip();
  renderDailyPanel();
  renderTopbar();
  saveGame(S);
}

function claimAllTasks() {
  const d = ensureDailyTasks(S);
  d.list.filter(t => t.done && !t.got).forEach(t => { t.got = true; S.coins += t.coin; addXp(S, t.xp); });
  if (d.list.every(x => x.got) && !d.bonus) {
    d.bonus = true;
    const extra = 60 + S.day * 2;
    S.coins += extra;
    toast(`今日目标全清！+${extra} 币`, 'good');
    addLog(S, `今日目标全部达成，宝箱 +${extra} 币`, 'good');
  }
  renderTaskChip(); renderDailyPanel(); renderTopbar(); saveGame(S);
}

function renderTaskChip() {
  const el = $('#taskNum');
  if (!el) return;
  const d = ensureDailyTasks(S);
  const done = d.list.filter(t => t.done).length;
  const claimable = d.list.filter(t => t.done && !t.got).length;
  el.textContent = `${done}/3`;
  const btn = $('#btnTask');
  if (btn) {
    btn.classList.toggle('hasReward', claimable > 0);
    btn.title = claimable ? `${claimable} 个目标可领取` : '每日目标';
  }
}

function renderDailyPanel() {
  const box = $('#dailyBody');
  if (!box) return;
  const d = ensureDailyTasks(S);
  box.innerHTML = d.list.map(t => {
    const pct = Math.round((t.prog / t.need) * 100);
    return `<div class="taskRow ${t.done ? 'done' : ''}">
      <div class="tkTop">
        <span class="tkName">${t.name}</span>
        <span class="tkProg">${t.prog}/${t.need}</span>
      </div>
      <div class="tkDesc">${t.desc}</div>
      <div class="tkBar"><i style="width:${pct}%"></i></div>
      <div class="tkFoot">
        <span class="tkReward">${icon('coin')} ${t.coin} · ${t.xp} 经验</span>
        ${t.done && !t.got ? `<button class="btn small primary" data-claim="${t.id}">领取</button>`
          : t.got ? '<span class="tkOk">已领取</span>' : ''}
      </div>
    </div>`;
  }).join('') + `<div class="taskBonus ${d.bonus ? 'got' : ''}">
      <span>${d.bonus ? '今日宝箱已领' : `全部完成再得宝箱（${60 + S.day * 2} 币）`}</span>
      ${d.list.some(t => t.done && !t.got) ? '<button class="btn small primary" id="btnClaimAll">一键领取</button>' : ''}
    </div>`;
  $$('[data-claim]', box).forEach(b => b.addEventListener('click', () => claimTask(b.dataset.claim)));
  const all = $('#btnClaimAll');
  if (all) all.addEventListener('click', claimAllTasks);
}

function init() {
  $('#btnPause').addEventListener('click', () => { paused = !paused; renderTopbar(); });
  $$('[data-speed]').forEach(b => b.addEventListener('click', () => {
    S.speed = +b.dataset.speed;
    $$('[data-speed]').forEach(x => {
      const on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', String(on));
    });
  }));
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    const t = b.dataset.tab;
    $('#recordsPane').style.display = t === 'records' ? 'block' : 'none';
    $('#logPane').style.display = t === 'log' ? 'block' : 'none';
    const rp = $('#reportPane'); if (rp) rp.style.display = t === 'report' ? 'block' : 'none';
    if (t === 'records') renderRecords();
    if (t === 'report') renderReport();
  }));
  $('#pickerClose').addEventListener('click', () => $('#picker').classList.remove('show'));
  $('#picker').addEventListener('click', e => { if (e.target.id === 'picker') $('#picker').classList.remove('show'); });
  $('#btnReset').addEventListener('click', () => { if (confirm(`清空当前存档（存档 ${curSaveSlot()}），重新开始？`)) { resetGame(); location.reload(); } });
  $('#btnCodex').addEventListener('click', () => { renderCodex(); renderAchievements(); renderLevelPanel(); renderBackups(); sfx('open');
  $('#codexModal').classList.add('show'); });
  $('#btnExport').addEventListener('click', exportSave);
  // ---- 「更多」菜单：把帮助/设置/关于收进一个下拉，给顶栏省出空间 ----
  const btnMore = $('#btnMore'), moreMenu = $('#moreMenu');
  const closeMore = () => {
    if (!moreMenu) return;
    moreMenu.classList.remove('open');
    btnMore.setAttribute('aria-expanded', 'false');
  };
  const openMore = () => {
    if (!moreMenu) return;
    moreMenu.classList.add('open');
    btnMore.setAttribute('aria-expanded', 'true');
    // 第一个菜单项聚焦，键盘可用
    const first = moreMenu.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  };
  if (btnMore && moreMenu) {
    btnMore.addEventListener('click', e => {
      e.stopPropagation();
      moreMenu.classList.contains('open') ? closeMore() : openMore();
      sfx('open');
    });
    // 点菜单外的任何地方关闭
    document.addEventListener('click', e => {
      if (!moreMenu.classList.contains('open')) return;
      if (e.target.closest('.moreWrap')) return;
      closeMore();
    });
    // Esc 关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && moreMenu.classList.contains('open')) closeMore();
    });
    // 菜单内键盘上下移动
    moreMenu.addEventListener('keydown', e => {
      const items = [...moreMenu.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    });
  }

  $('#btnHelp').addEventListener('click', () => { closeMore(); openHelp(); });
  // 帮助正文里的"重看教学"按钮：正文是动态渲染的，用委托
  document.addEventListener('click', e => {
    if (e.target && e.target.id === 'btnReplayTutor') {
      ['#helpModal'].forEach(s => { const m = $(s); if (m) m.classList.remove('show'); });
      if (typeof tutorStart === 'function') tutorStart(true);
    }
    if (e.target && e.target.id === 'btnOpenGraftFromHelp') {
      $('#helpModal').classList.remove('show');
      if (typeof openGraft === 'function') openGraft();
    }
  });
  $('#btnTask').addEventListener('click', () => {
    $('#dailyDay').textContent = S.day;
    renderDailyPanel();
    $('#dailyModal').classList.add('show');
  });
  $('#dailyModal').addEventListener('click', e => { if (e.target.id === 'dailyModal') $('#dailyModal').classList.remove('show'); });
  $('#btnQuest').addEventListener('click', () => { renderQuests(); sfx('open'); $('#questModal').classList.add('show'); });
  $('#questClose').addEventListener('click', () => $('#questModal').classList.remove('show'));
  $('#questModal').addEventListener('click', e => { if (e.target.id === 'questModal') $('#questModal').classList.remove('show'); });
  $('#btnAbout').addEventListener('click', () => { closeMore(); openAbout(); });
  $('#btnAboutHelp').addEventListener('click', () => { $('#aboutModal').classList.remove('show'); openHelp(); });
  $('#helpModal').addEventListener('click', e => { if (e.target.id === 'helpModal') $('#helpModal').classList.remove('show'); });
  $('#aboutModal').addEventListener('click', e => { if (e.target.id === 'aboutModal') $('#aboutModal').classList.remove('show'); });
  $$('[data-close]').forEach(b => b.addEventListener('click', () => { sfx('close'); $('#' + b.dataset.close).classList.remove('show'); }));
  // 音效开关：状态持久化在 localStorage，与存档无关（换存档不重置）
  // 图标按钮：文字放 title/aria-label，视觉上只留图标，省顶栏宽度
  const syncSoundBtn = () => {
    const b = $('#btnSound'); if (!b) return;
    const muted = soundMuted();
    b.textContent = muted ? '🔇' : '🔊';
    b.title = muted ? '当前静音，点击开启音效' : '音效开启，点击静音';
    b.setAttribute('aria-label', muted ? '当前静音，点击开启音效' : '音效开启，点击静音');
  };
  syncSoundBtn();
  $('#btnSound').addEventListener('click', () => { toggleSound(); syncSoundBtn(); if (!soundMuted()) sfx('coin'); });
  // 设置面板
  const bs = $('#btnSettings');
  if (bs) bs.addEventListener('click', () => { closeMore(); sfx('open'); openSettings(); });
  if (typeof initPrefs === 'function') initPrefs();
  // 3D 开关：只在 WebGL 可用时才可切换；不可用时按钮置灰并说明原因
  const sync3dBtn = () => {
    const b = $('#btn3d'); if (!b) return;
    const can = typeof webglAvailable === 'function' && webglAvailable();
    b.classList.toggle('on', can && scene3dPreferred());
    b.setAttribute('aria-pressed', String(!!(can && scene3dPreferred())));
    if (!can) {
      b.disabled = true;
      b.title = '此设备/浏览器不支持 WebGL，已使用静态背景';
      b.style.opacity = '.4';
    } else {
      b.title = scene3dPreferred() ? '3D 场景已开启，点击改用静态背景' : '当前为静态背景，点击开启 3D 场景';
    }
  };
  sync3dBtn();
  $('#btn3d').addEventListener('click', () => {
    if (typeof webglAvailable === 'function' && !webglAvailable()) return;
    const next = !scene3dPreferred();
    scene3dSet(next);
    // 关掉时把已有渲染器彻底停掉并清空，避免后台空转吃 GPU
    if (!next && typeof S3 !== 'undefined' && S3.renderer) {
      scene3dStop();
      S3.kind = null;
      const cv = document.getElementById('scene3dCanvas');
      if (cv) cv.classList.remove('on');
    }
    sync3dBtn();
    renderStageScene();
    toast(next ? '已开启 3D 场景' : '已切回静态背景', 'ok');
  });
  $('#btnSlots').addEventListener('click', () => { renderSlotList(); sfx('open'); $('#slotModal').classList.add('show'); });
  $$('[data-htab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-htab]').forEach(x => x.classList.toggle('on', x === b));
    renderHelp(b.dataset.htab);
  }));
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', e => { if (e.target.files[0]) importSave(e.target.files[0]); e.target.value = ''; });
  $('#btnUpgrade').addEventListener('click', () => { renderUpgrades(); sfx('open');
  $('#upModal').classList.add('show'); });
  $('#upClose').addEventListener('click', () => $('#upModal').classList.remove('show'));
  $('#upModal').addEventListener('click', e => { if (e.target.id === 'upModal') $('#upModal').classList.remove('show'); });
  $('#btnOrder').addEventListener('click', () => { renderOrders(); sfx('open');
  $('#orderModal').classList.add('show'); });
  $('#orderClose').addEventListener('click', () => $('#orderModal').classList.remove('show'));
  $('#orderModal').addEventListener('click', e => { if (e.target.id === 'orderModal') $('#orderModal').classList.remove('show'); });
  $('#btnOrderRefresh').addEventListener('click', () => refreshOrders(false));
  $('#seedClose').addEventListener('click', () => $('#seedModal').classList.remove('show'));
  $('#crossClose').addEventListener('click', () => $('#crossModal').classList.remove('show'));
  $('#crossModal').addEventListener('click', e => { if (e.target.id === 'crossModal') $('#crossModal').classList.remove('show'); });
  $('#btnCross').addEventListener('click', doCross);
  $('#btnCrossOpen').addEventListener('click', () => { $('#codexModal').classList.remove('show'); openCross(); });
  $('#btnGraftOpen').addEventListener('click', () => { $('#codexModal').classList.remove('show'); openGraft(); });
  // ---- 远缘嫁接 ----
  $('#graftClose').addEventListener('click', () => $('#graftModal').classList.remove('show'));
  $('#graftModal').addEventListener('click', e => { if (e.target.id === 'graftModal') $('#graftModal').classList.remove('show'); });
  $('#btnGraft').addEventListener('click', doGraftClick);
  $('#graftPick').addEventListener('click', e => {
    const b = e.target.closest('.gpItem');
    if (!b) return;
    const id = b.dataset.gpsp, tag = b.dataset.gptag;
    // 两边不能是同一物种：选重了就自动把另一侧换成别的
    if (tag === 'host') {
      if (graftCtx.scion === id) {
        const other = graftSpeciesPool().find(x => x !== id);
        if (!other) return;
        graftCtx.scion = other;
      }
      graftCtx.host = id;
    } else {
      if (graftCtx.host === id) {
        const other = graftSpeciesPool().find(x => x !== id);
        if (!other) return;
        graftCtx.host = other;
      }
      graftCtx.scion = id;
    }
    sfx('click');
    renderGraft();
  });
  // 嫁接体播种：点「播种」直接用当前选中槽位
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-graftplant]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.graftplant;
    const slot = S.slots.find(s => s.unlocked && !s.plot) || S.slots.find(s => s.id === currentSlot);
    if (!slot) return toast('没有空的培育位', 'warn');
    if (slot.plot) return toast('该培育位已有培育中，请先收获或放弃', 'warn');
    const plot = plantGraft(S, id, slot.id);
    if (!plot) return toast('嫁接体不存在', 'warn');
    slot.plot = plot;
    graftStore(S).splice(graftStore(S).findIndex(x => x.id === id), 1);
    $('#graftModal').classList.remove('show');
    currentSlot = slot.id;
    sfx('plant');
    toast(`「${plot.graft.name}」已播到第 ${slot.id} 区`, 'good');
    addLog(S, `播种嫁接体「${plot.graft.name}」`, 'good');
    renderAll(); saveGame(S);
  });
  $('#seedModal').addEventListener('click', e => { if (e.target.id === 'seedModal') $('#seedModal').classList.remove('show'); });
  $('#hvClose').addEventListener('click', () => $('#harvestModal').classList.remove('show'));
  $('#harvestModal').addEventListener('click', e => { if (e.target.id === 'harvestModal') $('#harvestModal').classList.remove('show'); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.modal.show').forEach(m => m.classList.remove('show'));
  });
  $('#btnStock').addEventListener('click', () => { renderStock(); sfx('open');
  $('#stockModal').classList.add('show'); });
  $('#stockClose').addEventListener('click', () => $('#stockModal').classList.remove('show'));
  $('#stockModal').addEventListener('click', e => { if (e.target.id === 'stockModal') $('#stockModal').classList.remove('show'); });
  $('#btnSellAll').addEventListener('click', sellAll);
  $('#btnExpand').addEventListener('click', () => {
    const t = $('.tail');
    t.classList.toggle('expanded');
    $('#btnExpand span').textContent = t.classList.contains('expanded') ? '收起' : '展开';
    setTimeout(() => { if (activeSlot() && activeSlot().plot) drawChart(activeSlot().plot); }, 320);
  });
  $('.expIc').innerHTML = ICONS.chevron;
  $('#codexClose').addEventListener('click', () => $('#codexModal').classList.remove('show'));
  $('#codexModal').addEventListener('click', e => { if (e.target.id === 'codexModal') $('#codexModal').classList.remove('show'); });
  $('#brandMark').innerHTML = ICONS.leaf;
  const gm = $('#guideMark'); if (gm) { gm.innerHTML = ICONS.sprout; gm.style.color = '#8fd9b0'; gm.style.display = 'grid'; gm.style.placeItems = 'center'; }
  const am = $('#aboutMark'); if (am) { am.innerHTML = ICONS.leaf; am.style.color = '#8fd9b0'; am.style.display = 'grid'; am.style.placeItems = 'center'; }
  $('#coinIcon').innerHTML = ICONS.coin;
  $('#bookIcon').innerHTML = ICONS.book;
  const si = $('#stockIcon'); if (si) si.innerHTML = ICONS.basket;
  const ti = $('#taskIcon'); if (ti) ti.innerHTML = ICONS.leaf;

  if (!S.log.length) addLog(S, '欢迎来到自然培育所。选一个培育位，挑一株生命开始。', 'info');
  if (!(S.orders || []).length || !S.orders.some(o => o.expire > S.day)) makeOrders(S);
  renderAll(); renderCodex();
  showGuide();
  window.__nlBooted = true;
  // 存档损坏 → 自动回滚到备份时，必须让玩家知道发生了什么
  if (window.__nlRecovered) {
    setTimeout(() => toast(`存档损坏，已从第 ${window.__nlRecovered.day} 天的备份恢复`, 'warn'), 700);
    delete window.__nlRecovered;
  } else if (window.__nlCorrupt) {
    setTimeout(() => toast('检测到损坏的存档，已隔离；可在「档案」面板导出排查', 'warn'), 700);
    delete window.__nlCorrupt;
  }
  requestAnimationFrame(loop);
}
document.addEventListener('DOMContentLoaded', init);
