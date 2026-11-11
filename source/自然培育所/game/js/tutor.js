/* ============================================================
   Nature Lab · 新手教学
   与旧的"六条文字说明"不同，这里是一套真正的分步引导：
   - 每一步指向一个真实 DOM 控件（高亮 + 说明气泡）
   - 能判断玩家是否真的做了那件事（不是只看"点了下一步"）
   - 可以跳过、可以随时从帮助里重看、可以中途退出
   状态存在 localStorage（键 naturelab.tutor），与存档无关：
   教的是"人"，不是"某一轮游戏"。
   ============================================================ */

const TUTOR_KEY = (typeof storeKey === 'function') ? storeKey('tutor') : 'naturelab.tutor';

const TUTOR_STEPS = [
  {
    key: 'pick',
    target: '.slot[data-slot="1"], .slot',
    title: '第一步：选一个培育位',
    text: '左边是第一块地。点它，再挑一个物种——番茄最简单，建议从它开始。',
    // 完成条件：槽位里有成长中的培育体
    done: () => !!(typeof S !== 'undefined' && S.slots[0] && S.slots[0].plot),
    hint: '点左边的培育位卡片',
    pos: 'right'
  },
  {
    key: 'species',
    target: '#picker .speciesCard, #picker',
    title: '第二步：挑物种',
    text: '番茄是一年生草本，环境宽容、反馈直接。它的适宜区间写在卡片上，稍后会用到。',
    done: () => !!(typeof S !== 'undefined' && S.slots[0] && S.slots[0].plot),
    hint: '在弹窗里点「番茄」',
    pos: 'right',
    optional: true
  },
  {
    key: 'env',
    target: '#panel .psec:nth-of-type(1)',
    title: '第三步：看环境读数',
    text: '这四条是温度、湿度、日照、含水。绿色区段就是它舒服的范围，白点跑到区段外就会掉健康。',
    done: () => {
      if (typeof S === 'undefined' || !S.slots[0] || !S.slots[0].plot) return false;
      const p = S.slots[0].plot;
      try {
        const ev = evaluateEnv(SPECIES[p.speciesId], envFor(S.slots[0]), p.stage);
        return ev.score >= 85;               // 真的调进了绿区
      } catch (e) { return false; }
    },
    hint: '用下面的设备把读数推进绿区',
    pos: 'left'
  },
  {
    key: 'device',
    target: '#panel .devGrid',
    title: '第四步：用设备调节',
    text: '点一下开关就生效，相反的两台自动互斥。拿不准就点下面的「一键调到适宜」。',
    done: () => {
      const p = (typeof S !== 'undefined' && S.slots[0]) ? S.slots[0].plot : null;
      if (!p) return false;
      return Object.values(p.devices || {}).some(Boolean) || !!p.autoEff;
    },
    hint: '开任意一台设备，或点「一键调到适宜」',
    pos: 'left'
  },
  {
    key: 'feed',
    target: '#panel [data-feed="auto"]',
    title: '第五步：配一次营养',
    text: '氮长叶、磷促根与花、钾管抗逆和品质。点「按阶段配肥」，它会按当前阶段自动配平。每进一个阶段都要再配一次。',
    done: () => {
      const p = (typeof S !== 'undefined' && S.slots[0]) ? S.slots[0].plot : null;
      if (!p) return false;
      const _sp = SPECIES[p.speciesId];
      const need = _sp.nutrition[Math.min(p.stage, _sp.nutrition.length - 1)];
      const f = p.fertilized || {};
      const d = (Math.abs(f.N - need.N) + Math.abs(f.P - need.P) + Math.abs(f.K - need.K)) / 3;
      return d <= 12;
    },
    hint: '点「按阶段配肥」',
    pos: 'left'
  },
  {
    key: 'wait',
    target: '#speedGroup, .speedGroup',
    title: '第六步：让它长大',
    text: '时间会自动走。想快点点右上角 2x / 4x。走完全部阶段就能收获——中途别让它掉太久。',
    done: () => {
      const p = (typeof S !== 'undefined' && S.slots[0]) ? S.slots[0].plot : null;
      return !!(p && (p.stage >= 2 || p.status === 'ready'));
    },
    hint: '等它进入幼苗期之后（约 5 个游戏天）',
    pos: 'bottom',
    loose: true
  },
  {
    key: 'harvest',
    target: '#btnHarvest, #panel',
    title: '第七步：收获',
    text: '成熟后点「收获」。品质 S/A/B/C/D 取决于全程平均表现，不是最后一天。收获会留下自留种，直接开下一轮。',
    done: () => !!(typeof S !== 'undefined' && S.stats && (S.stats.success || 0) >= 1),
    hint: '走到成熟并点「收获」',
    pos: 'left',
    optional: true
  },
  {
    key: 'quest',
    target: '#btnQuest, #btnTask',
    title: '第八步：看看经营手账',
    text: '顶栏「手账」是贯穿全程的主线：五章 20 步，达成即自动发奖励。不知道接下来干什么时，先看它。',
    done: () => !!(document.getElementById('questModal') || {}).classList?.contains('show'),
    hint: '点顶栏「手账」',
    pos: 'bottom',
    optional: true
  }
];

let tutorIdx = 0;
let tutorOn = false;
let tutorTimer = null;

function tutorSeen() {
  try { return localStorage.getItem(TUTOR_KEY) === 'done'; } catch (e) { return false; }
}
function tutorMarkDone() {
  try { localStorage.setItem(TUTOR_KEY, 'done'); } catch (e) {}
}
function tutorReset() {
  try { localStorage.removeItem(TUTOR_KEY); } catch (e) {}
}

function el(sel) {
  if (!sel) return null;
  const parts = sel.split(',').map(s => s.trim());
  for (const p of parts) {
    const e = document.querySelector(p);
    if (e) return e;
  }
  return null;
}

// 把高亮框对准目标元素（元素可能不在视口内，先滚动）
function tutorPlace() {
  const box = document.getElementById('tutorSpot');
  const card = document.getElementById('tutorCard');
  const step = TUTOR_STEPS[tutorIdx];
  if (!box || !card || !step) return;
  const t = el(step.target);
  if (!t) { box.style.display = 'none'; return; }
  const r = t.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) { box.style.display = 'none'; return; }
  const pad = 8;
  box.style.display = 'block';
  box.style.left = Math.max(4, r.left - pad) + 'px';
  box.style.top = Math.max(4, r.top - pad) + 'px';
  box.style.width = Math.min(window.innerWidth - 8, r.width + pad * 2) + 'px';
  box.style.height = Math.min(window.innerHeight - 8, r.height + pad * 2) + 'px';

  // 气泡：优先放在目标右侧，空间不够就换边/上下
  const cw = 300, ch = card.offsetHeight || 170;
  let x, y;
  const pos = step.pos || 'right';
  const fitRight = r.right + cw + 24 < window.innerWidth;
  const fitLeft = r.left - cw - 24 > 0;
  if (pos === 'left' && fitLeft) { x = r.left - cw - 16; y = r.top; }
  else if (pos === 'right' && fitRight) { x = r.right + 16; y = r.top; }
  else if (fitRight) { x = r.right + 16; y = r.top; }
  else if (fitLeft) { x = r.left - cw - 16; y = r.top; }
  else { x = Math.max(12, Math.min(window.innerWidth - cw - 12, r.left)); y = r.bottom + 14; }
  y = Math.max(74, Math.min(window.innerHeight - ch - 14, y));
  x = Math.max(12, Math.min(window.innerWidth - cw - 12, x));
  card.style.left = x + 'px';
  card.style.top = y + 'px';
  card.style.width = cw + 'px';
}

function tutorRender() {
  const step = TUTOR_STEPS[tutorIdx];
  const card = document.getElementById('tutorCard');
  if (!step || !card) return;
  const total = TUTOR_STEPS.length;
  card.innerHTML = `
    <div class="tutTop"><span class="tutNo">${tutorIdx + 1} / ${total}</span>
      <button class="tutSkip" id="tutSkip">跳过教学</button></div>
    <h4>${step.title}</h4>
    <p>${step.text}</p>
    <div class="tutHint">${step.optional ? '（此步可跳过）' : ''}${step.hint}</div>
    <div class="tutOps">
      <button class="btn small ghost" id="tutPrev" ${tutorIdx === 0 ? 'disabled' : ''}>上一步</button>
      <button class="btn small" id="tutNext">${tutorIdx >= total - 1 ? '完成' : (step.optional ? '跳过这步' : '下一步')}</button>
    </div>`;
  document.getElementById('tutSkip').onclick = () => tutorEnd(true);
  document.getElementById('tutPrev').onclick = () => { tutorIdx = Math.max(0, tutorIdx - 1); tutorRefresh(); };
  document.getElementById('tutNext').onclick = () => {
    if (tutorIdx >= total - 1) return tutorEnd(false);
    // 非必做步骤允许直接越过；必做步骤没完成时提示一句但不强锁（避免玩家卡死在教学里）
    tutorIdx++; tutorRefresh();
  };
  // 已完成的步骤显示对勾
  try {
    if (step.done()) card.classList.add('done'); else card.classList.remove('done');
  } catch (e) {}
  tutorPlace();
}

function tutorRefresh() {
  tutorRender();
}

// 每 500ms 检查一次当前步是否真的被完成了——完成了就自动进下一步
function tutorTick() {
  if (!tutorOn) return;
  const step = TUTOR_STEPS[tutorIdx];
  if (!step) return;
  let ok = false;
  try { ok = !!step.done(); } catch (e) { ok = false; }
  const card = document.getElementById('tutorCard');
  if (card) card.classList.toggle('done', ok);
  if (ok && !step.keep) {
    // 给玩家 700ms 看到"完成了"的反馈，再前进
    if (!step._pending) {
      step._pending = true;
      setTimeout(() => {
        step._pending = false;
        if (!tutorOn) return;
        if (tutorIdx < TUTOR_STEPS.length - 1) { tutorIdx++; tutorRefresh(); }
        else tutorEnd(false);
      }, 800);
    }
  }
  tutorPlace();
}

function tutorStart(force) {
  if (!force && tutorSeen()) return;
  tutorOn = true;
  tutorIdx = 0;
  TUTOR_STEPS.forEach(s => { s._pending = false; });
  const layer = document.getElementById('tutorLayer');
  if (layer) layer.classList.add('show');
  tutorRefresh();
  if (tutorTimer) clearInterval(tutorTimer);
  tutorTimer = setInterval(tutorTick, 500);
  window.addEventListener('resize', tutorPlace);
  window.addEventListener('scroll', tutorPlace, true);
}

function tutorEnd(skipped) {
  tutorOn = false;
  if (tutorTimer) { clearInterval(tutorTimer); tutorTimer = null; }
  const layer = document.getElementById('tutorLayer');
  if (layer) layer.classList.remove('show');
  window.removeEventListener('resize', tutorPlace);
  window.removeEventListener('scroll', tutorPlace, true);
  tutorMarkDone();
  if (typeof toast === 'function') {
    if (skipped) toast('教学已跳过，随时可在「更多 › 帮助 › 新手教学」里重看', 'info');
    else { if (typeof sfx === 'function') sfx('achv'); toast('教学完成 · 接下来就看你的了', 'good'); }
  }
}

