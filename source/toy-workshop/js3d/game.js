/* ============================================================
 * game.js — 三维拆装玩法
 * 第一步「拆一拆」：按顺序点零件，拆下后放进零件架
 * 第二步「装一装」：从零件架取件，转动模型找到位置，点目标装回
 *
 * 新增：零件清单双向联动、限定提示次数、螺纹拧合、角度对正、
 *       失误/步数上限、用户档案与本地排行结算
 * ============================================================ */
import { TOYS3D, TOY_ORDER3D } from './models.js';
import { Stage } from './engine.js';
import { levelOfMode, paramsOf, starsFor, scoreFor, stepLimitOf, LEVEL_NAME, MODE_OF_LEVEL, unlockState } from './levels.js';
import { Store } from './store.js';

const q = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const toyId = TOYS3D[params.get('toy')] ? params.get('toy') : 'car';
const mode = levelOfMode(params.get('mode'));
const modeKey = MODE_OF_LEVEL[mode];
const toy = TOYS3D[toyId];
const user = Store.currentUser();

/* 试玩：该档尚未正式解锁时，允许完整体验但不计成绩 */
const un = unlockState(mode, Store.statsOf());
const trial = params.get('trial') === '1' && !un.open;
const base = paramsOf(mode);
const LV = trial
  ? { ...base, hints: Infinity, time: 0, maxMiss: 0, extraSteps: 0, marker: true, markerDelay: 0, ghost: true }
  : base;

/* 本关参与拆装的零件：简单级只取 easy 件，其余全开（与旧版一致） */
const playable = toy.parts.filter(p => mode === 1 ? p.easy === true : true);
const byId = new Map(playable.map(p => [p.id, p]));
const total = playable.length;
const STEP_CAP = trial ? 0 : stepLimitOf(mode, total);

const S = {
  phase: 'dis',
  mistakes: 0,
  steps: 0,
  startAt: Date.now(),
  removed: new Set(),
  assembled: new Set(),
  selected: null,
  busy: false,
  done: false,
  focusId: null,
  hintFocusTimer: 0,
  hoverId: null,
  lastAct: Date.now(),
  hintsLeft: LV.hints,
  twist: null,
  listOpen: false
};

let stage;
let timerId = null;
let trayList = [];

/* ---------------- 工具 ---------------- */
function setBubble(text, tone) {
  const b = q('bubble');
  b.textContent = text;
  b.classList.remove('warn', 'good');
  if (tone) b.classList.add(tone);
}

function nameOf(id) { return (byId.get(id) || {}).n || '零件'; }

function paintOf(p) {
  const first = (p.b || []).find(x => x.c);
  return first ? first.c : '#B8BEC6';
}

function insertShuffled(arr, item) {
  if (!LV.shuffle) { arr.push(item); return; }
  const i = Math.floor(Math.random() * (arr.length + 1));
  arr.splice(i, 0, item);
}

function fmt(s) {
  const m = Math.floor(s / 60), x = s % 60;
  return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

/* 当前可操作（顺序合法）的零件 */
function availableIds() {
  const pool = playable.filter(p => S.phase === 'dis' ? !S.removed.has(p.id) : !S.assembled.has(p.id));
  if (!pool.length) return [];
  const seqs = pool.map(p => p.seq);
  const target = S.phase === 'dis' ? Math.max(...seqs) : Math.min(...seqs);
  return pool.filter(p => p.seq === target).map(p => p.id);
}

function toyLevels(t) { return t.levels && t.levels.length ? t.levels : [t.level]; }

/* ---------------- HUD ---------------- */
function updateHud() {
  const n = S.phase === 'dis' ? S.removed.size : S.assembled.size;
  q('progressPill').textContent = `${S.phase === 'dis' ? '拆' : '装'} ${n}/${total}`;
  const hintBtn = q('hintBtn');
  hintBtn.hidden = !LV.hints;
  if (LV.hints) {
    q('hintCount').textContent = LV.hints === Infinity ? '∞' : S.hintsLeft;
    hintBtn.classList.toggle('off', S.hintsLeft <= 0);
  }
  const extra = q('extraPill');
  if (STEP_CAP || LV.maxMiss) {
    extra.hidden = false;
    extra.textContent = STEP_CAP
      ? `步 ${S.steps}/${STEP_CAP} · 误 ${S.mistakes}/${LV.maxMiss}`
      : `误 ${S.mistakes}/${LV.maxMiss}`;
  } else {
    extra.hidden = true;
  }
}

/* ---------------- 零件高亮 ---------------- */
function clearFocus() {
  S.focusId = null;
  stage.highlight(null, false);
  stage.dimExcept(null, false);
  stage.showArrow(null, false);
  document.querySelectorAll('.pl-row.hl').forEach(r => r.classList.remove('hl'));
}

function applyFocus(id, arrow = true) {
  S.focusId = id;
  stage.highlight(id, true);
  stage.dimExcept([id], true);
  if (arrow) stage.showArrow(id, true);
  document.querySelectorAll('.pl-row').forEach(r => r.classList.toggle('hl', r.dataset.id === id));
  const row = document.querySelector(`.pl-row[data-id="${id}"]`);
  if (row && S.listOpen) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* 悬停：3D ↔ 清单 双向点亮 */
function hoverPart(id) {
  if (S.hoverId === id) return;
  S.hoverId = id;
  document.querySelectorAll('.pl-row').forEach(r => r.classList.toggle('hover', r.dataset.id === id));
  if (!id) {
    if (S.focusId) applyFocus(S.focusId, false);
    else { stage.highlight(null, false); stage.dimExcept(null, false); }
    return;
  }
  stage.highlight(id, true);
  stage.dimExcept([id], true);
  q('pickTip').hidden = false;
  q('pickTip').textContent = nameOf(id);
}

function bindHover() {
  const cv = q('scene');
  let last = 0, dragging = false, downX = 0, downY = 0;
  cv.addEventListener('pointerdown', e => { dragging = false; downX = e.clientX; downY = e.clientY; });
  cv.addEventListener('pointermove', e => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragging = true;
    if (dragging || S.done || S.busy || S.twist) { q('pickTip').hidden = true; return; }
    const now = Date.now();
    if (now - last < 70) return;
    last = now;
    const hit = stage.pick(e.clientX, e.clientY);
    const id = hit && kindOfHit(hit);
    hoverPart(id || null);
    const tip = q('pickTip');
    if (id) {
      tip.hidden = false;
      tip.textContent = nameOf(id);
      const r = cv.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left + 12) + 'px';
      tip.style.top = (e.clientY - r.top + 10) + 'px';
    } else {
      tip.hidden = true;
    }
  });
  cv.addEventListener('pointerleave', () => { hoverPart(null); q('pickTip').hidden = true; });
}

/* 只对可拆装零件做悬停提示 */
function kindOfHit(hit) {
  if (!hit) return null;
  if (S.phase === 'dis') return S.removed.has(hit.id) ? null : (byId.has(hit.id) ? hit.id : null);
  return S.assembled.has(hit.id) ? null : (byId.has(hit.id) ? hit.id : null);
}

/* ---------------- 零件清单 ---------------- */
const TAG_TXT = {
  tw: n => `拧${n}圈`,
  view: () => '需对正',
  seq: n => `第${n}步`
};

function renderList() {
  const box = q('partList');
  const rows = playable.slice().sort((a, b) => b.seq - a.seq);
  box.innerHTML = rows.map(p => {
    const n = S.phase === 'dis' ? S.removed.size : S.assembled.size;
    const done = S.phase === 'dis' ? S.removed.has(p.id) : S.assembled.has(p.id);
    const isNext = availableIds().includes(p.id);
    const tags = [];
    if (p.tw) tags.push(TAG_TXT.tw(p.tw));
    if (p.view) tags.push(TAG_TXT.view());
    if (p.mesh) tags.push('啮合');
    return `<button class="pl-row${done ? ' done' : ''}${isNext ? ' next' : ''}" data-id="${p.id}">
      <span class="dot" style="--c:${paintOf(p)}"></span>
      <span class="nm">${p.n}</span>
      <span class="tags">${tags.map(t => `<i>${t}</i>`).join('')}</span>
      <span class="stx">${done ? (S.phase === 'dis' ? '已拆' : '已装') : (isNext ? '待操作' : '被挡')}</span>
    </button>`;
  }).join('');
  q('listCount').textContent = `${S.phase === 'dis' ? S.removed.size : S.assembled.size}/${total}`;
  box.querySelectorAll('.pl-row').forEach(row => {
    const id = row.dataset.id;
    row.addEventListener('mouseenter', () => hoverPart(id));
    row.addEventListener('mouseleave', () => hoverPart(null));
    row.addEventListener('click', () => {
      if (S.busy || S.done) return;
      applyFocus(id, true);
      stage.focusPart(id, 700);
      setBubble(`已定位【${nameOf(id)}】，转一圈看看它在哪一面`);
      if (S.phase === 'asm' && trayList.includes(id)) selectPart(id);
      else if (S.phase === 'dis') { /* 仅定位 */ }
    });
  });
}

/* ---------------- 零件架 ---------------- */
function renderTray() {
  const tray = q('tray');
  tray.innerHTML = '';
  trayList.forEach(id => {
    const p = byId.get(id);
    const btn = document.createElement('button');
    btn.className = 'chip' + (S.selected === id ? ' sel' : '');
    btn.dataset.id = id;
    btn.innerHTML = `<span class="dot" style="--c:${paintOf(p)}"></span><span class="nm">${p.n}</span>`;
    btn.addEventListener('mouseenter', () => hoverPart(id));
    btn.addEventListener('mouseleave', () => hoverPart(null));
    if (S.phase === 'asm') {
      btn.addEventListener('click', () => selectPart(id));
    } else {
      btn.disabled = true;
      btn.classList.add('locked');
    }
    tray.appendChild(btn);
  });
  if (!trayList.length) {
    const d = document.createElement('div');
    d.className = 'tray-empty';
    d.textContent = S.phase === 'dis' ? '拆下来的零件会放在这里' : '零件架空了';
    tray.appendChild(d);
  }
}

/* ---------------- 选择零件 ---------------- */
function selectPart(id) {
  if (S.busy || S.done) return;
  S.selected = id;
  stage.clearGhosts();
  stage.clearMarkers();
  const p = byId.get(id);
  if (LV.ghost) stage.showGhost(p, true);
  if (LV.marker) stage.showMarker(p, true);
  S.lastAct = Date.now();
  renderTray();
  const okNow = availableIds().includes(id);
  if (!okNow) {
    const need = availableIds().map(nameOf).join('、');
    setBubble(`先装【${need}】，它被压在里面`, 'warn');
    return;
  }
  applyFocus(id, false);
  let msg = `把【${p.n}】装回去：转动模型找到它的位置，点一下`;
  if (p.view) msg = `把【${p.n}】装回去：要转到${dirName(p.view.az)}看准榫眼才能对正`;
  if (p.tw) msg += `，装到位后还要拧 ${p.tw} 圈`;
  setBubble(msg);
}

function dirName(az) {
  const a = normAz(az);
  if (Math.abs(a) < 0.7) return '正面';
  if (Math.abs(Math.abs(a) - Math.PI) < 0.7) return '背面';
  return a > 0 ? '右侧' : '左侧';
}

function normAz(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function azDiff(a, b) { return Math.abs(normAz(a - b)); }

/* ---------------- 拆解 ---------------- */
async function tryRemove(id) {
  if (S.busy) return;
  const p = byId.get(id);
  if (S.removed.has(id)) return;
  const avail = availableIds();
  if (!avail.includes(id)) {
    S.mistakes++;
    S.lastAct = Date.now();
    const need = avail.map(nameOf).slice(0, 2).join('、');
    setBubble(`【${p.n}】被外面的零件挡住了，先拆【${need}】`, 'warn');
    stage.shake(id);
    updateHud();
    checkFail();
    return;
  }
  S.busy = true;
  setBubble(`拆下【${p.n}】，放到零件架`);
  await stage.animateOut(id);
  S.removed.add(id);
  insertShuffled(trayList, id);
  clearFocus();
  renderTray();
  renderList();
  updateHud();
  S.busy = false;
  S.lastAct = Date.now();
  if (S.removed.size === total) toAssemble();
}

/* ---------------- 拧合手势 ---------------- */
function runTwist(p) {
  return new Promise(resolve => {
    const c = stage.projectPart(p.id) || { x: innerWidth / 2, y: innerHeight / 2 };
    const need = p.tw;
    let got = 0, last = null, finished = false;
    S.twist = { need, got: 0 };
    stage.controls.enabled = false;
    q('twist').classList.add('show');
    q('twistFill').style.width = '0%';
    q('twistText').textContent = `按住并绕着【${p.n}】画圈，把螺纹拧紧（0/${need} 圈）`;

    const finishTwist = () => {
      if (finished) return;
      finished = true;
      removeEventListener('pointermove', onMove);
      q('twistSkip').removeEventListener('click', onSkip);
      S.twist = null;
      q('twist').classList.remove('show');
      stage.controls.enabled = true;
      resolve(true);
    };
    const onSkip = () => {
      S.mistakes++;
      updateHud();
      finishTwist();
    };
    const onMove = e => {
      const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
      if (last !== null) {
        let d = a - last;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < 1.2) got += Math.abs(d) / (Math.PI * 2);
        const n = Math.min(need, Math.floor(got));
        if (n !== S.twist.got) {
          S.twist.got = n;
          q('twistFill').style.width = Math.min(100, got / need * 100) + '%';
          q('twistText').textContent = `继续拧……（${n}/${need} 圈）`;
        }
        if (got >= need - 0.001) finishTwist();
      }
      last = a;
    };
    addEventListener('pointermove', onMove);
    q('twistSkip').addEventListener('click', onSkip);
  });
}

/* ---------------- 组装 ---------------- */
async function tryPlace(id, x, y) {
  if (S.busy) return;
  const p = byId.get(id);
  const avail = availableIds();
  if (!avail.includes(id)) {
    S.mistakes++;
    const need = avail.map(nameOf).slice(0, 2).join('、');
    setBubble(`装不进去，先装【${need}】`, 'warn');
    S.lastAct = Date.now();
    updateHud();
    checkFail();
    return;
  }
  /* 多角度对正：先看镜头方位是否对准榫眼（不计失误，只提示） */
  if (p.view && LV.align) {
    const tol = Math.min(p.view.tol, LV.align * Math.PI / 180);
    if (azDiff(stage.azimuth(), p.view.az) > tol) {
      setBubble(`【${p.n}】的榫眼在${dirName(p.view.az)}，把模型转到${dirName(p.view.az)}再装`, 'warn');
      stage.showArrow(p.id, true);
      return;
    }
  }
  const hit = stage.pickTarget(x, y, id, LV.tol);
  if (!hit) {
    S.mistakes++;
    S.lastAct = Date.now();
    setBubble(`这里不是【${p.n}】的位置，转一转模型再找`, 'warn');
    stage.shake(id);
    updateHud();
    checkFail();
    return;
  }
  S.busy = true;
  stage.clearMarkers();
  stage.clearGhosts();
  stage.showMarker(p, false);
  stage.showGhost(p, false);
  stage.showArrow(p.id, false);

  /* 螺纹件：先拧到位再落位 */
  if (p.tw && LV.twist) {
    setBubble(`对上了！按住【${p.n}】绕着画圈拧紧`);
    await runTwist(p);
  }

  await stage.animateIn(id);
  S.assembled.add(id);
  trayList = trayList.filter(t => t !== id);
  S.selected = null;
  clearFocus();
  renderTray();
  renderList();
  updateHud();
  S.busy = false;
  S.lastAct = Date.now();
  if (S.assembled.size === total) finish(true);
  else setBubble('装好一个，继续从零件架挑下一个');
}

/* ---------------- 阶段切换 ---------------- */
function toAssemble() {
  S.phase = 'asm';
  S.selected = null;
  trayList = [];
  playable.forEach(p => insertShuffled(trayList, p.id));
  renderTray();
  renderList();
  document.body.classList.add('phase-asm');
  q('phasePill').textContent = '第二步 · 装一装';
  q('trayLabel').textContent = LV.shuffle ? '零件架（顺序已打乱）' : '零件架（按顺序摆放）';
  updateHud();
  clearFocus();
  setBubble('拆完啦！现在反过来装回去：先装最里面的零件', 'good');
  S.lastAct = Date.now();
}

/* ---------------- 失败判定 ---------------- */
function checkFail() {
  if (S.done) return;
  if (LV.maxMiss && S.mistakes > LV.maxMiss) {
    finish(false, `失误超过 ${LV.maxMiss} 次`);
  }
}

/* ---------------- 结束 ---------------- */
function finish(win, reason) {
  if (S.done) return;
  S.done = true;
  if (timerId) clearInterval(timerId);
  if (S.twist) q('twist').classList.remove('show');
  stage.controls.enabled = true;
  const secs = Math.floor((Date.now() - S.startAt) / 1000);
  const st = win && !trial ? starsFor(mode, S.mistakes, secs) : 0;
  const score = win && !trial ? scoreFor(mode, S.mistakes, secs) : 0;

  let ret = null;
  if (win && !trial) {
    ret = Store.submitResult({
      toyId, toyName: toy.name, mode: modeKey, lv: mode, stars: st, time: secs,
      steps: S.steps, miss: S.mistakes, score,
      wood: toy.tag === '木工坊'
    });
  }

  q('doneStars').innerHTML = trial
    ? '<span class="trial-tip">试玩 · 不计星</span>'
    : (st
      ? Array.from({ length: 3 }, (_, i) => `<span class="st ${i < st ? 'on' : ''}">★</span>`).join('')
      : '<span class="st">☆</span>');
  q('doneTitle').textContent = trial
    ? (win ? '试玩通关！' : '试玩结束')
    : (win
      ? (st === 3 ? '完美拆装！' : '完成啦！')
      : (reason || '挑战失败'));
  q('doneSub').textContent = win
    ? `用时 ${fmt(secs)} · ${S.steps} 步 · 失误 ${S.mistakes} 次${trial ? ' · 试玩不计入成绩' : ''}`
    : `用时 ${fmt(secs)} · 失误 ${S.mistakes} 次${STEP_CAP ? ` · ${S.steps} 步` : ''}${trial ? ' · 试玩' : ''}`;

  const extra = [];
  if (trial) {
    extra.push('<span class="rec">试玩不记星级、进度和排行</span>');
    extra.push(`正式解锁还需：<b>${un.text}</b>`);
  } else if (win && ret) {
    extra.push(`得分 <b>${score}</b>`);
    if (ret.rank) extra.push(`本机排行第 <b>${ret.rank}</b> 名`);
    if (ret.newBest.stars) extra.push('<span class="rec">星级新纪录</span>');
    if (ret.newBest.time) extra.push('<span class="rec">最快用时</span>');
  }
  q('doneScore').innerHTML = extra.join(' · ');
  q('doneScore').hidden = !extra.length;

  q('doneBest').innerHTML = trial
    ? `本档还没正式解锁 · ${un.tip || un.text}`
    : (win
      ? `当前累计 <b>${Store.statsOf().totalStars}</b> 星 · 完成 <b>${Store.statsOf().clearToys}</b> 件`
      : '调整一下思路再来一次，宗师也是练出来的');

  q('doneAch').innerHTML = (ret && ret.newAch.length)
    ? `<div class="ach-new"><span>解锁成就</span>${ret.newAch.map(a => `<i title="${a.desc}">${a.icon} ${a.name}</i>`).join('')}</div>`
    : '';

  q('doneModal').classList.add('show');
  renderNext(win);
}

function renderNext(win) {
  const peers = TOY_ORDER3D.filter(id => toyLevels(TOYS3D[id]).includes(mode));
  const idx = peers.indexOf(toyId);
  const next = peers[(idx + 1) % peers.length];
  const btn = q('nextBtn');
  btn.href = `play.html?toy=${next}&mode=${modeKey}${trial ? '&trial=1' : ''}`;
  btn.textContent = win ? '下一个玩具' : '换一件试试';
}

/* ---------------- 计时 ---------------- */
function startTimer() {
  const pill = q('timerPill');
  pill.hidden = !LV.time;
  if (!LV.time) return;
  pill.textContent = fmt(LV.time);
  timerId = setInterval(() => {
    if (S.done) return;
    const left = LV.time - Math.floor((Date.now() - S.startAt) / 1000);
    pill.textContent = fmt(Math.max(0, left));
    if (left <= 0) { finish(false, '时间到啦'); return; }
    pill.classList.toggle('danger', left <= 30);
  }, 500);
}

/* ---------------- 交互 ---------------- */
function handleTap(x, y) {
  if (S.busy || S.done || S.twist) return;
  S.lastAct = Date.now();
  if (S.phase === 'dis') {
    const hit = stage.pick(x, y);
    if (!hit) return;
    if (!byId.has(hit.id)) return;
    S.steps++;
    updateHud();
    tryRemove(hit.id);
  } else {
    if (!S.selected) { setBubble('先在下面的零件架里挑一个零件'); return; }
    S.steps++;
    updateHud();
    if (STEP_CAP && S.steps > STEP_CAP) { finish(false, `步数超过 ${STEP_CAP} 步`); return; }
    tryPlace(S.selected, x, y);
  }
}

function bindPointer() {
  const cv = q('scene');
  let down = null;
  cv.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  });
  cv.addEventListener('pointerup', e => {
    if (!down || e.pointerId !== down.id) { down = null; return; }
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    const moved = Math.hypot(dx, dy);
    const quick = Date.now() - down.t < 700;
    down = null;
    if (moved > 9 || !quick) return;
    handleTap(e.clientX, e.clientY);
  });
  cv.addEventListener('pointercancel', () => { down = null; });
}

/* 提示按钮 */
function useHint() {
  if (S.done || S.busy) return;
  if (S.hintsLeft <= 0) { setBubble('提示次数用完了，接下来靠自己啦', 'warn'); return; }
  const id = (S.phase === 'asm' && S.selected) ? S.selected : availableIds()[0];
  if (!id) return;
  S.hintsLeft--;
  updateHud();
  const p = byId.get(id);
  applyFocus(id, true);
  stage.focusPart(id, 760);
  setBubble(`看这里：【${p.n}】—— ${p.hint}`);
  clearTimeout(S.hintFocusTimer);
  S.hintFocusTimer = setTimeout(() => { if (!S.done && S.focusId === id) { /* 保留高亮直到操作 */ } }, 9000);
}

/* 空闲提示 */
function idleLoop() {
  setInterval(() => {
    if (S.done || S.busy || S.twist) return;
    const idle = Date.now() - S.lastAct;
    if (LV.markerDelay && S.phase === 'asm' && S.selected && idle > LV.markerDelay) {
      const p = byId.get(S.selected);
      if (p) { stage.showMarker(p, true); stage.showArrow(p.id, true); }
      return;
    }
    if (LV.hints !== Infinity) return;
    if (idle < 8000) return;
    S.lastAct = Date.now();
    if (S.phase === 'dis') {
      const id = availableIds()[0];
      if (id) setBubble(`试试点一下【${nameOf(id)}】`);
    } else if (!S.selected) {
      setBubble('从零件架里挑一个零件试试');
    } else {
      const p = byId.get(S.selected);
      stage.showGhost(p, true);
      stage.showMarker(p, true);
      setBubble(`【${p.n}】的位置在闪蓝圈，转动模型找找看`);
    }
  }, 1000);
}

/* ---------------- 启动 ---------------- */
function boot() {
  q('toyName').textContent = toy.name;
  q('levelPill').textContent = `${LEVEL_NAME[mode]}级`;
  q('levelPill').dataset.lv = mode;
  q('trialPill').hidden = !trial;
  document.title = `${toy.name} · 巧手拆装工坊 3D${trial ? '（试玩）' : ''}`;
  q('userTag').textContent = `${user.avatar} ${user.name}`;

  try {
    stage = new Stage(q('scene'));
  } catch (e) {
    q('stageWrap').innerHTML = `
      <div class="no-gl">
        <b>你的浏览器不支持 WebGL</b>
        <p>3D 版需要 WebGL 支持。请更新浏览器（Chrome / Edge / Safari 新版），或先玩经典 2D 版。</p>
        <a class="btn primary" href="classic/index.html">打开经典 2D 版</a>
      </div>`;
    return;
  }
  stage.setToy(toy, mode);
  bindPointer();
  bindHover();
  renderTray();
  renderList();
  updateHud();
  startTimer();
  idleLoop();

  q('backBtn').addEventListener('click', e => {
    e.preventDefault();
    location.href = 'index.html';
  });
  q('xrayBtn').hidden = !LV.xray;
  q('xrayBtn').addEventListener('click', () => {
    stage.setXray(!stage.xray);
    q('xrayBtn').classList.toggle('on', stage.xray);
    setBubble(stage.xray ? '透视模式：外壳变透明，可以看到内部结构' : '已恢复正常显示');
  });
  q('resetBtn').addEventListener('click', () => {
    stage.resetView();
    clearFocus();
    setBubble('视角已回正');
  });
  q('autoBtn').addEventListener('click', () => {
    stage.controls.autoRotate = !stage.controls.autoRotate;
    stage.controls.autoRotateSpeed = 1.6;
    q('autoBtn').classList.toggle('on', stage.controls.autoRotate);
  });
  q('hintBtn').addEventListener('click', useHint);
  q('listBtn').addEventListener('click', () => {
    S.listOpen = !S.listOpen;
    q('listPanel').classList.toggle('show', S.listOpen);
    q('listBtn').classList.toggle('on', S.listOpen);
  });
  q('listClose').addEventListener('click', () => {
    S.listOpen = false;
    q('listPanel').classList.remove('show');
    q('listBtn').classList.remove('on');
  });
  q('stepsBtn').addEventListener('click', () => {
    const ol = q('stepsList');
    ol.innerHTML = playable.slice().sort((a, b) => b.seq - a.seq)
      .map(p => `<li><b>${p.n}</b><span>第 ${p.seq} 步</span></li>`).join('');
    q('stepsModal').classList.add('show');
  });
  q('stepsClose').addEventListener('click', () => q('stepsModal').classList.remove('show'));
  q('stepsModal').addEventListener('click', e => {
    if (e.target === q('stepsModal')) q('stepsModal').classList.remove('show');
  });
  q('retryBtn').addEventListener('click', () => location.reload());
  q('doneClose').addEventListener('click', () => q('doneModal').classList.remove('show'));
  q('doneHome').href = 'index.html';

  window.addEventListener('resize', () => stage.resize());

  const starts = availableIds().map(nameOf).join(' 或 ');
  setBubble(`先拆【${starts}】`);
  if (trial) {
    setTimeout(() => setBubble('试玩中：本档还没正式解锁，提示不限次、不限时，成绩不计入星级与排行'), 4500);
  } else if (LV.hints && LV.hints !== Infinity) {
    setTimeout(() => setBubble(`本关只有 ${LV.hints} 次提示，想清楚再用`), 4000);
  }

  /* 自动化测试用的调试入口，仅在 ?debug=1 时挂出 */
  if (params.get('debug') === '1') {
    window.__tw = { stage, S, playable, availableIds, tryRemove, selectPart, tryPlace, finish, updateHud, renderList };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
