/* ============================================================
 * game.js — 拆装游戏引擎
 * 阶段：dis（拆解：点按拆下）→ assemble（组装：拖放吸附）→ done（庆祝评星）
 * 数据：data.js (TOYS) / 存档：api.js (apiSaveProgress)
 * ============================================================ */

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

const params = new URLSearchParams(location.search);
const toyId = params.get('toy') || 'car';
const modeParam = params.get('mode');
const mode = ['easy', 'mid', 'hard'].includes(modeParam) ? modeParam : 'easy';
const toy = TOYS[toyId] || TOYS.car;

const SCENE_W = 480, SCENE_H = 360;
/* 吸附半径随难度收紧：简单宽容、困难要求对得更准 */
const SNAP_R = mode === 'easy' ? 66 : mode === 'mid' ? 48 : 34;

const ICON_VOLUME = '<svg class="icon" viewBox="0 0 24 24"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>';
const ICON_VOLUME_X = '<svg class="icon" viewBox="0 0 24 24"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
const ICON_STAR = '<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

const PRAISES = ['好样的！', '真棒！', '小手真巧！', '太厉害了！', '咔哒，装好啦！'];

const S = {
  phase: 'dis',
  sound: localStorage.getItem('ttw_sound') !== 'off',
  mistakes: 0,
  startAt: Date.now(),
  drag: null,
  idleTimer: null,
  beadCount: 0,
  limit: 0,        // 限时总秒数（仅顺序挑战）
  remaining: 0,
  timerId: null,
  score: 0
};

/* 参与本局的零件：简单只玩 easy 件（staticInEasy 件预装展示）；中度/困难全部零件 */
const partsInScene = toy.parts.filter(p => mode !== 'easy' || p.easy || p.staticInEasy);
const playable = partsInScene.filter(p => mode !== 'easy' || p.easy);

/* ---------- DOM ---------- */
const stage = q('#stage');
const partLayer = q('#partLayer');
const ghostLayer = q('#ghostLayer');
const baseLayer = q('#baseLayer');
const tray = q('#tray');
const bubble = q('#bubble');
const phasePill = q('#phasePill');
const progressPill = q('#progressPill');
const timerPill = q('#timerPill');

function say(text) { bubble.textContent = text; }

function setPos(el, x, y) {
  el.style.left = (x / SCENE_W * 100) + '%';
  el.style.top = (y / SCENE_H * 100) + '%';
}

function toScene(e) {
  const rect = stage.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * SCENE_W,
    y: (e.clientY - rect.top) / rect.height * SCENE_H
  };
}

/* ---------- 音效（WebAudio 合成，无外部资源） ---------- */
let AC = null;
function ensureAudio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
}
function tone(freq, dur, type = 'triangle', gain = 0.14, slideTo, when = 0) {
  if (!S.sound) return;
  ensureAudio();
  if (!AC) return;
  const t0 = AC.currentTime + when;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t0); o.stop(t0 + dur);
}
const soundPop = () => tone(500, .09, 'square', .1, 900);
const soundSnap = () => { tone(440, .08); tone(660, .12, 'triangle', .14, null, .07); };
const soundError = () => tone(220, .18, 'sawtooth', .08, 140);
const soundWin = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, 'triangle', .14, null, i * .13));

/* ---------- 初始化场景 ---------- */
function init() {
  q('#toyName').textContent = toy.name;
  baseLayer.innerHTML = toy.base;

  // 虚线轮廓（仅可玩零件）
  ghostLayer.innerHTML = playable
    .map(p => `<g class="ghost" data-id="${p.id}" transform="translate(${p.x} ${p.y})">${p.svg}</g>`)
    .join('');

  // 零件（初始全部安装在场景里）
  partsInScene.forEach(p => {
    const el = document.createElement('div');
    el.className = 'part' + (p.isBead ? ' bead' : '');
    el.dataset.id = p.id;
    el.style.width = (p.w / SCENE_W * 100) + '%';
    el.style.aspectRatio = p.w + ' / ' + p.h;
    el.style.zIndex = p.z || 2;
    el.innerHTML = `<svg viewBox="0 0 ${p.w} ${p.h}">${p.svg}</svg>`;
    setPos(el, p.x, p.y);
    p.el = el;
    p.installed = true;
    p.isStatic = !playable.includes(p);
    if (p.isStatic) el.classList.add('static');

    el.addEventListener('click', () => {
      if (S.phase === 'dis' && !p.isStatic && p.installed) tryRemove(p);
    });
    el.addEventListener('pointerdown', e => {
      if (S.phase === 'assemble' && !p.installed) startDrag(e, p);
    });
    partLayer.appendChild(el);
  });

  document.body.classList.add('phase-dis');
  phasePill.textContent = '第一步 · 拆一拆';
  updateProgress();
  say('按顺序拆：先拆最外面的零件哦！');
  resetIdle();
}

/* ---------- 拆装顺序判定 ----------
 * seq 小 = 组装时先装 / 拆解时后拆
 * seq 大 = 组装时后装 / 拆解时先拆
 */
const seqOf = p => p.seq || 0;

function canRemove(p) {
  return !playable.some(o => o.installed && o !== p && seqOf(o) > seqOf(p));
}

/* 阻碍拆解的零件：还裝着的、seq 更大的那一批里最靠后的 */
function removeBlocker(p) {
  return playable
    .filter(o => o.installed && o !== p && seqOf(o) > seqOf(p))
    .sort((a, b) => seqOf(b) - seqOf(a))[0];
}

function canInstall(p) {
  return !playable.some(o => !o.installed && o !== p && seqOf(o) < seqOf(p));
}

/* 阻碍组装的零件：还没装的、seq 更小的那一批里最靠前的 */
function installBlocker(p) {
  return playable
    .filter(o => !o.installed && o !== p && seqOf(o) < seqOf(p))
    .sort((a, b) => seqOf(a) - seqOf(b))[0];
}

/* 当前应该操作的零件（用于提示） */
function nextToRemove() {
  return playable
    .filter(o => o.installed && canRemove(o))
    .sort((a, b) => seqOf(b) - seqOf(a))[0];
}
function nextToInstall() {
  return playable
    .filter(o => !o.installed && canInstall(o))
    .sort((a, b) => seqOf(a) - seqOf(b))[0];
}

function tryRemove(p) {
  ensureAudio();
  const blocker = removeBlocker(p);
  if (blocker) {
    S.mistakes++;
    say(`先拆下【${blocker.name}】哦`);
    p.el.classList.add('shake');
    setTimeout(() => p.el.classList.remove('shake'), 420);
    soundError();
    resetIdle();
    return;
  }
  p.installed = false;
  soundPop();
  p.el.classList.add('lifting');
  setTimeout(() => {
    p.el.classList.remove('lifting');
    flyToTray(p.el);
  }, 240);
  updateProgress();
  resetIdle();

  if (playable.every(o => !o.installed)) {
    setTimeout(startAssemble, 800);
  }
}

/* 零件飞入零件架（FLIP 动画） */
function flyToTray(el) {
  const r1 = el.getBoundingClientRect();
  el.classList.add('in-tray');
  el.style.left = ''; el.style.top = ''; el.style.width = ''; el.style.aspectRatio = '';
  tray.appendChild(el);
  const r2 = el.getBoundingClientRect();
  const scale = r2.width ? r1.width / r2.width : 1;
  el.style.transform = `translate(${r1.left - r2.left}px, ${r1.top - r2.top}px) scale(${scale})`;
  requestAnimationFrame(() => {
    el.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1)';
    el.style.transform = '';
    setTimeout(() => { el.style.transition = ''; }, 480);
  });
}

/* ---------- 阶段切换 ---------- */
function startAssemble() {
  S.phase = 'assemble';
  document.body.classList.remove('phase-dis');
  document.body.classList.add('phase-assemble');
  phasePill.textContent = '第二步 · 装一装';
  phasePill.classList.add('assemble');
  q('#trayLabel').textContent = '零件架 · 拖到虚线轮廓上';
  banner('现在把它装回去吧！');
  updateProgress();
  resetIdle();
  const next = nextToInstall();
  if (next) say(next.hint);
}

/* ---------- 阶段二：组装（拖放） ---------- */
function startDrag(e, p) {
  e.preventDefault();
  ensureAudio();
  const el = p.el;
  el.classList.remove('in-tray');
  el.style.width = (p.w / SCENE_W * 100) + '%';
  el.style.aspectRatio = p.w + ' / ' + p.h;
  partLayer.appendChild(el);
  S.drag = { p, pos: null };
  el.classList.add('dragging');
  moveDrag(e);
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag, { once: true });
  resetIdle();
}

function moveDrag(e) {
  if (!S.drag) return;
  const { p } = S.drag;
  const pos = toScene(e);
  S.drag.pos = pos;
  setPos(p.el, pos.x - p.w / 2, pos.y - p.h / 2);
}

function endDrag() {
  if (!S.drag) return;
  const { p, pos } = S.drag;
  S.drag = null;
  p.el.classList.remove('dragging');
  window.removeEventListener('pointermove', moveDrag);

  const slotCenter = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  const d = pos ? Math.hypot(pos.x - slotCenter.x, pos.y - slotCenter.y) : Infinity;

  if (d < SNAP_R) { trySnap(p); return; }

  // 靠近了别的零件的轮廓 → 放错位置的正向引导
  const wrong = playable.find(o => !o.installed && o !== p && pos &&
    Math.hypot(pos.x - (o.x + o.w / 2), pos.y - (o.y + o.h / 2)) < SNAP_R * 0.9);
  if (wrong) {
    S.mistakes++;
    say('这里不对哦，看看它像哪个轮廓？');
    soundError();
  }
  flyToTray(p.el);
  resetIdle();
}

function trySnap(p) {
  const blocker = installBlocker(p);
  if (blocker) {
    S.mistakes++;
    say(`先装上【${blocker.name}】哦`);
    p.el.classList.add('shake');
    setTimeout(() => p.el.classList.remove('shake'), 420);
    soundError();
    flyToTray(p.el);
    resetIdle();
    return;
  }

  p.installed = true;
  setPos(p.el, p.x, p.y);
  p.el.classList.add('installed', 'snap-pop');
  setTimeout(() => p.el.classList.remove('snap-pop'), 400);
  soundSnap();
  spawnSparkles(p.x + p.w / 2, p.y + p.h / 2);

  // 算珠数数（数感启蒙）
  if (p.isBead) {
    S.beadCount++;
    say(`第 ${S.beadCount} 颗算珠！`);
  } else {
    say(PRAISES[Math.floor(Math.random() * PRAISES.length)]);
  }

  updateProgress();
  resetIdle();

  if (playable.every(o => o.installed)) {
    setTimeout(finish, 500);
  }
}

/* ---------- 完成 ---------- */
function finish() {
  S.phase = 'done';
  stopTimer();
  stage.classList.add('celebrating');
  banner('完成啦！');
  soundWin();
  confetti(90);

  const stars = S.mistakes <= 1 ? 3 : S.mistakes <= 3 ? 2 : 1;
  // 计分：基础分 + 剩余时间奖励 - 误操作扣分（仅顺序挑战计入）
  S.score = mode === 'hard'
    ? Math.max(50, 300 + S.remaining * 10 - S.mistakes * 60)
    : 0;
  apiSaveProgress(toyId, mode, stars, S.score);
  setTimeout(() => showDone(stars), 1600);
}

function showDone(stars) {
  const secs = Math.round((Date.now() - S.startAt) / 1000);
  const praises = { 3: '完美！几乎没有出错', 2: '很棒！再试一次冲满星', 1: '完成啦！继续加油' };
  q('#doneTitle').textContent = `${toy.name}装好了！`;
  q('#doneStars').innerHTML = [1, 2, 3].map(i =>
    ICON_STAR.replace('class="icon"', `class="icon ${i <= stars ? 'on' : 'off'}"`)
  ).join('');
  q('#doneSub').textContent = `${praises[stars]} · 用时 ${secs} 秒`;

  const scoreEl = q('#doneScore');
  if (mode === 'hard') {
    scoreEl.hidden = false;
    scoreEl.textContent = `本局得分 ${S.score} · 误操作 ${S.mistakes} 次`;
  } else {
    scoreEl.hidden = true;
  }

  q('#donePreview').innerHTML = assembledPreview(toy, '60 30 360 300');

  /* 下一关：同一难度等级内轮转，不跳到别的等级去 */
  const levelOf = id => (typeof TOY_LEVEL !== 'undefined' ? TOY_LEVEL[id] : 1);
  const sameLevel = TOY_ORDER.filter(id => levelOf(id) === levelOf(toyId));
  const idx = sameLevel.indexOf(toyId);
  const next = sameLevel[(idx + 1) % sameLevel.length];
  q('#nextBtn').href = `game.html?toy=${next}&mode=${mode}`;
  q('#doneModal').classList.add('show');
}

/* ---------- 限时（顺序挑战） ---------- */
function startTimer() {
  if (mode !== 'hard') { timerPill.hidden = true; return; }
  S.limit = 25 + playable.length * 12;
  S.remaining = S.limit;
  timerPill.hidden = false;
  renderTimer();
  S.timerId = setInterval(() => {
    S.remaining--;
    renderTimer();
    if (S.remaining <= 0) timeUp();
  }, 1000);
}

function renderTimer() {
  const m = String(Math.floor(S.remaining / 60)).padStart(2, '0');
  const s = String(S.remaining % 60).padStart(2, '0');
  timerPill.textContent = `${m}:${s}`;
  timerPill.classList.toggle('urgent', S.remaining <= 15);
}

function stopTimer() {
  clearInterval(S.timerId);
  S.timerId = null;
}

function timeUp() {
  if (S.phase === 'done') return;
  S.phase = 'done';
  stopTimer();
  stopIdle();
  soundError();
  timerPill.textContent = '00:00';
  q('#timeoutModal').classList.add('show');
}

/* ---------- 拆解步骤预览 ---------- */
function openSteps() {
  const list = q('#stepsList');
  const ordered = playable.slice().sort((a, b) => seqOf(b) - seqOf(a));
  list.innerHTML = ordered.map((p, i) => `
    <li class="${p.installed ? '' : 'done'}">
      <span class="step-num">${i + 1}</span>
      <span class="step-thumb"><svg viewBox="0 0 ${p.w} ${p.h}">${p.svg}</svg></span>
      <span class="step-name">${p.name}</span>
      <span class="step-tag">${p.installed ? '待拆' : '已拆'}</span>
    </li>`).join('');
  q('#stepsNote').textContent = '按编号顺序拆，装回去时倒着来';
  q('#stepsModal').classList.add('show');
}

/* ---------- 反馈小件 ---------- */
function banner(text) {
  const b = q('#phaseBanner');
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth; // 重新触发动画
  b.classList.add('show');
}

function spawnSparkles(cx, cy) {
  for (let i = 0; i < 3; i++) {
    const s = document.createElement('i');
    s.className = 'sparkle';
    s.style.left = (cx / SCENE_W * 100) + '%';
    s.style.top = (cy / SCENE_H * 100) + '%';
    const ang = Math.random() * Math.PI * 2;
    s.style.setProperty('--sx', Math.cos(ang) * 30 + 'px');
    s.style.setProperty('--sy', Math.sin(ang) * 30 - 14 + 'px');
    stage.appendChild(s);
    setTimeout(() => s.remove(), 750);
  }
}

function confetti(n) {
  const box = q('#confetti');
  const colors = ['#FF7A45', '#2EC4B6', '#FFC53D', '#FF5A5A', '#4D96FF'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    const size = 8 + Math.random() * 8;
    c.style.left = Math.random() * 100 + '%';
    c.style.width = size + 'px';
    c.style.height = (Math.random() > .5 ? size : size * .45) + 'px';
    c.style.background = colors[i % colors.length];
    if (Math.random() > .6) c.style.borderRadius = '50%';
    c.style.animationDelay = (Math.random() * .5) + 's';
    c.style.animationDuration = (1.7 + Math.random() * 1.2) + 's';
    box.appendChild(c);
  }
  setTimeout(() => { box.innerHTML = ''; }, 3400);
}

/* ---------- 进度与提示 ---------- */
function updateProgress() {
  const total = playable.length;
  const done = S.phase === 'dis'
    ? playable.filter(o => !o.installed).length
    : playable.filter(o => o.installed).length;
  progressPill.textContent = `${done}/${total}`;
}

/* 5 秒无操作 → 脉冲提示下一步 */
function resetIdle() {
  clearTimeout(S.idleTimer);
  if (mode === 'hard') return;   // 困难模式不给操作提示
  S.idleTimer = setTimeout(suggest, 5000);
}
function stopIdle() {
  clearTimeout(S.idleTimer);
  S.idleTimer = null;
}

function suggest() {
  if (S.phase === 'dis') {
    const t = nextToRemove();
    if (t) {
      t.el.classList.add('suggest');
      setTimeout(() => t.el.classList.remove('suggest'), 1900);
      say(`试试拆下【${t.name}】`);
    }
  } else if (S.phase === 'assemble') {
    const t = nextToInstall();
    if (t) {
      const g = ghostLayer.querySelector(`g.ghost[data-id="${t.id}"]`);
      if (g) {
        g.classList.add('pulse');
        setTimeout(() => g.classList.remove('pulse'), 2300);
      }
      t.el.classList.add('suggest');
      setTimeout(() => t.el.classList.remove('suggest'), 1900);
      say(t.hint);
    }
  }
  resetIdle();
}

/* ---------- 顶栏事件 ---------- */
const soundBtn = q('#soundBtn');
function renderSound() { soundBtn.innerHTML = S.sound ? ICON_VOLUME : ICON_VOLUME_X; }
soundBtn.addEventListener('click', () => {
  S.sound = !S.sound;
  localStorage.setItem('ttw_sound', S.sound ? 'on' : 'off');
  renderSound();
  if (S.sound) soundPop();
});
renderSound();

q('#retryBtn').addEventListener('click', () => location.reload());
q('#timeoutRetryBtn').addEventListener('click', () => location.reload());

/* 拆解步骤预览弹窗 */
const stepsModal = q('#stepsModal');
q('#stepsBtn').addEventListener('click', openSteps);
q('#stepsClose').addEventListener('click', () => stepsModal.classList.remove('show'));
stepsModal.addEventListener('click', e => { if (e.target === stepsModal) stepsModal.classList.remove('show'); });

init();
startTimer();
