/* ============================================================
 * mech.js — 机械原理馆 · 演示页
 *   观察：播放 / 暂停 / 单步 / 调速 / 拖进度，零件跟着动
 *   拆装：停在 θ=0，按顺序点零件拆下，再按顺序点虚影装回
 * ============================================================ */
import { MECHS, MECH_ORDER, MECH_GROUPS } from './mech-models.js';
import { Stage } from './engine.js';

const KEY = 'ttw_mech_v1';
const TAU = Math.PI * 2, D2R = Math.PI / 180, R2D = 180 / Math.PI;
const $ = s => document.querySelector(s);

/* ---------------- 本机记录 ---------------- */
const store = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
store.seen = store.seen || {};
store.built = store.built || {};
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { } };

/* ---------------- 选中机构 ---------------- */
const q = new URLSearchParams(location.search);
const id = MECHS[q.get('id')] ? q.get('id') : MECH_ORDER[0];
const mech = MECHS[id];
const grp = MECH_GROUPS.find(g => g.id === mech.group);

store.seen[id] = 1; persist();

document.title = `${mech.name} · 机械原理馆`;
$('#mName').textContent = mech.name;
$('#mGroup').textContent = grp.name;
$('#mTag').textContent = mech.tag;
$('#lessonWhat').textContent = mech.lesson.what;
$('#lessonKey').textContent = mech.lesson.key;
$('#lessonWhere').textContent = mech.lesson.where;
$('#metrics').innerHTML = (mech.metrics || [])
  .map(m => `<span class="m-metric"><i>${m.label}</i><b>${m.text}</b></span>`).join('');
$('#minfo').textContent = `${mech.parts.length} 个可拆零件 · ${mech.summary}`;

/* ---------------- 舞台 ---------------- */
const stage = new Stage($('#scene'));
stage.setToy(mech);

/* 把每个零件的旋转中心搬到 pivot：只改局部坐标，世界位置不变 */
mech.parts.forEach(part => {
  const g = stage.parts.get(part.id);
  if (!g) return;
  const pv = part.pivot || [0, 0, 0];
  g.children.forEach(c => c.position.set(c.position.x - pv[0], c.position.y - pv[1], c.position.z - pv[2]));
  g.position.set(pv[0], pv[1], pv[2]);
  const c = g.userData.center;
  c.set(c.x - pv[0], c.y - pv[1], c.z - pv[2]);
  g.userData.home = { x: pv[0], y: pv[1], z: pv[2] };
});

/* ---------------- 姿态 ---------------- */
let th = 0;
let playing = true;
let speed = 1;
let mode = 'observe';         // observe | teach
let phase = 'dis';            // teach 内：dis | asm
let removed = [];             // 已拆下的零件 id（按拆下顺序）
let busy = false;

const roSpans = [];
function buildReadout() {
  const host = $('#readout');
  host.innerHTML = '';
  roSpans.length = 0;
  (mech.pose(0).readout || []).forEach(r => {
    const d = document.createElement('div');
    d.className = 'm-ro';
    const k = document.createElement('i'), v = document.createElement('b');
    k.textContent = r.k; v.textContent = r.v;
    d.append(k, v); host.appendChild(d);
    roSpans.push(v);
  });
}
buildReadout();

function applyPose(t) {
  const p = mech.pose(t);
  mech.parts.forEach(part => {
    const g = stage.parts.get(part.id);
    if (!g || !g.visible) return;
    const m = p[part.id] || {};
    const h = g.userData.home;
    g.position.set(
      h.x + (m.p ? m.p[0] : 0),
      h.y + (m.p ? m.p[1] : 0),
      h.z + (m.p ? m.p[2] : 0)
    );
    g.rotation.set(m.r ? m.r[0] : 0, m.r ? m.r[1] : 0, m.r ? m.r[2] : 0);
  });
  roSpans.forEach((el, i) => { if (p.readout[i]) el.textContent = p.readout[i].v; });
  $('#angOut').textContent = `${Math.round(((t * R2D) % 360 + 360) % 360)}°`;
}

/* ---------------- 播放循环 ---------------- */
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'observe' && playing && !busy) {
    th = (th + dt * speed * mech.input.speed * D2R) % TAU;
    applyPose(th);
    $('#range').value = Math.round(th * R2D);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
applyPose(0);

/* ---------------- 提示 ---------------- */
let toastT = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2400);
}

/* ---------------- 零件清单 ---------------- */
function partState(p) {
  if (!removed.includes(p.id)) return mode === 'teach' ? '在机' : '';
  return '已拆';
}
function renderParts() {
  const host = $('#partList');
  host.innerHTML = '';
  [...mech.parts].sort((a, b) => a.seq - b.seq).forEach((p, i) => {
    const row = document.createElement('button');
    row.className = 'm-part';
    row.dataset.id = p.id;
    row.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span>
      <span class="nm">${p.n}</span>
      <span class="st">${partState(p)}</span>`;
    row.addEventListener('mouseenter', () => { if (mode === 'observe') stage.highlight(p.id, true); });
    row.addEventListener('mouseleave', () => { if (mode === 'observe') stage.highlight(p.id, false); });
    row.addEventListener('click', () => {
      stage.highlight(p.id, false);
      stage.highlight(p.id, true);
      setTimeout(() => stage.highlight(p.id, false), 1600);
      toast(`${p.n}：${p.hint}`);
    });
    host.appendChild(row);
  });
  $('#partCount').textContent = `${mech.parts.length - removed.length}/${mech.parts.length}`;
}
renderParts();

/* ---------------- 拆装 ---------------- */
function resetParts() {
  removed = [];
  busy = false;
  stage.clearGhosts();
  stage.clearMarkers();
  stage.showArrow(null, false);
  mech.parts.forEach(p => {
    const g = stage.parts.get(p.id);
    if (!g) return;
    g.visible = true;
    g.scale.setScalar(1);
  });
  applyPose(0);
  renderParts();
}

function nextRemove() {
  const left = mech.parts.filter(p => !removed.includes(p.id));
  return left.sort((a, b) => b.seq - a.seq)[0] || null;
}
function nextInstall() {
  const left = mech.parts.filter(p => removed.includes(p.id));
  return left.sort((a, b) => a.seq - b.seq)[0] || null;
}

/* 底部主按钮：直接给出下一步该拆/该装哪件，点画布以外的入口 */
function syncStepBtn() {
  const btn = $('#stepPartBtn');
  if (!btn) return;
  if (mode !== 'teach') { btn.hidden = true; return; }
  btn.hidden = false;
  const w = phase === 'dis' ? nextRemove() : nextInstall();
  btn.disabled = busy || !w;
  btn.textContent = w ? `${phase === 'dis' ? '拆下' : '装回'}「${w.n}」` : '完成';
}
$('#stepPartBtn').addEventListener('click', () => {
  if (busy || mode !== 'teach') return;
  const w = phase === 'dis' ? nextRemove() : nextInstall();
  if (!w) return;
  if (phase === 'dis') detach(w); else attach(w);
});

function detach(p) {
  const g = stage.parts.get(p.id);
  if (!g) return;
  busy = true;
  stage.highlight(p.id, false);
  syncStepBtn();
  const out = p.out || [0, 0, 1.9];
  const h = g.userData.home;
  stage._tween(430, t => {
    const e = 1 - Math.pow(1 - t, 3);
    g.position.set(h.x + out[0] * e, h.y + out[1] * e, h.z + out[2] * e);
    g.scale.setScalar(1 - 0.35 * e);
  }, () => {
    g.visible = false;
    g.position.set(h.x, h.y, h.z);
    g.scale.setScalar(1);
    removed.push(p.id);
    busy = false;
    renderParts();
    if (removed.length === mech.parts.length) {
      phase = 'asm';
      refreshGhosts();
      toast('全拆完了。按顺序点虚线位置，把零件装回去');
    } else {
      toast(`拆下 ${p.n}。下一步：${nextRemove().n}`);
    }
    syncStepBtn();
  });
}

function attach(p) {
  const g = stage.parts.get(p.id);
  if (!g) return;
  busy = true;
  const out = p.out || [0, 0, 1.9];
  const h = g.userData.home;
  g.visible = true;
  g.position.set(h.x + out[0], h.y + out[1], h.z + out[2]);
  g.scale.setScalar(0.55);
  syncStepBtn();
  stage._tween(380, t => {
    const e = 1 - Math.pow(1 - t, 3);
    g.position.set(h.x + out[0] * (1 - e), h.y + out[1] * (1 - e), h.z + out[2] * (1 - e));
    g.scale.setScalar(0.55 + 0.45 * e);
  }, () => {
    g.position.set(h.x, h.y, h.z);
    g.scale.setScalar(1);
    g.rotation.set(0, 0, 0);
    removed = removed.filter(x => x !== p.id);
    busy = false;
    renderParts();
    refreshGhosts();
    if (!removed.length) {
      store.built[id] = 1; persist();
      phase = 'dis';
      toast('装好了 · 这条机构记为「已掌握」');
      stage.showArrow(null, false);
      setTimeout(() => { if (mode === 'teach') setMode('observe'); }, 1000);
    } else {
      toast(`装回 ${p.n}。下一件：${nextInstall().n}`);
    }
    syncStepBtn();
  });
}

function refreshGhosts() {
  stage.clearGhosts();
  stage.showArrow(null, false);
  if (phase !== 'asm') { stage.showArrow(null, false); return; }
  removed.forEach(rid => {
    const p = mech.parts.find(x => x.id === rid);
    if (p) stage.showGhost(p, true);
  });
  const nx = nextInstall();
  if (nx) stage.showArrow(nx.id, true);
}

/* ---------------- 点击 ---------------- */
let downX = null, downY = null;
const canvas = $('#scene');
window.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; }, true);

/* 射线没打中时，用零件中心的屏幕投影兜底，细杆也好点 */
function pickNear(cx, cy) {
  const hit = stage.pick(cx, cy);
  if (hit) return hit;
  let best = null, bd = 52;
  mech.parts.forEach(p => {
    if (!stage.parts.get(p.id) || !stage.parts.get(p.id).visible) return;
    const s = stage.projectPart(p.id);
    if (!s || !s.visible) return;
    const d = Math.hypot(s.x - cx, s.y - cy);
    if (d < bd) { bd = d; best = p.id; }
  });
  return best ? { id: best } : null;
}

function shakePart(p) {
  const g = stage.parts.get(p.id);
  if (!g) return;
  const h = g.userData.home;
  stage._tween(340, t => {
    const a = Math.sin(t * Math.PI * 6) * 0.12 * (1 - t);
    g.position.set(h.x + a, h.y, h.z);
  }, () => g.position.set(h.x, h.y, h.z));
}

canvas.addEventListener('pointerup', e => {
  if (busy) return;
  if (downX !== null && Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return;
  downX = null;

  if (mode === 'observe') {
    const hit = pickNear(e.clientX, e.clientY);
    if (!hit) return;
    const p = mech.parts.find(x => x.id === hit.id);
    if (!p) return;
    stage.highlight(p.id, true);
    setTimeout(() => stage.highlight(p.id, false), 1800);
    toast(`${p.n}：${p.hint}`);
    return;
  }

  if (phase === 'dis') {
    const hit = pickNear(e.clientX, e.clientY);
    const want = nextRemove();
    if (!want) return;
    if (!hit) { toast('没点到零件，转一下视角再试'); return; }
    if (hit.id !== want.id) {
      const p = mech.parts.find(x => x.id === hit.id);
      if (p) shakePart(p);
      toast(`先拆「${want.n}」，${p ? p.n : '这个零件'}要等它让开`);
      return;
    }
    detach(want);
    return;
  }

  /* 装回：点虚影位置 */
  const want = nextInstall();
  if (!want) return;
  if (stage.pickTarget(e.clientX, e.clientY, want.id, 0.62)) { attach(want); return; }
  const s = stage.projectPart(want.id);
  if (s && s.visible && Math.hypot(s.x - e.clientX, s.y - e.clientY) < 56) { attach(want); return; }
  toast(`这里不是安装位。按顺序先装「${want.n}」`);
});

/* ---------------- 模式 ---------------- */
function setMode(m) {
  if (busy) return;
  mode = m;
  const btn = $('#modeBtn');
  if (m === 'teach') {
    playing = false;
    th = 0;
    phase = 'dis';
    resetParts();
    $('#modeBtn').textContent = '观察';
    $('#modePill').textContent = '拆装模式';
    document.body.classList.add('teach');
    stage.fitCamera();
    toast(`拆装模式：先拆最外侧的「${nextRemove().n}」`);
  } else {
    stage.clearGhosts();
    stage.showArrow(null, false);
    stage.clearMarkers();
    mech.parts.forEach(p => {
      const g = stage.parts.get(p.id);
      if (g) { g.visible = true; g.scale.setScalar(1); }
    });
    removed = [];
    phase = 'dis';
    $('#modeBtn').textContent = '拆装';
    $('#modePill').textContent = '观察模式';
    document.body.classList.remove('teach');
    playing = true;
    applyPose(th);
    renderParts();
    toast('观察模式：零件按运动规律联动');
  }
  btn.classList.toggle('on', m === 'teach');
  $('#playBtn').disabled = m === 'teach';
  $('#stepBack').disabled = m === 'teach';
  $('#stepFwd').disabled = m === 'teach';
  $('#range').disabled = m === 'teach';
  $('#speed').disabled = m === 'teach';
  syncStepBtn();
}
$('#modeBtn').addEventListener('click', () => setMode(mode === 'teach' ? 'observe' : 'teach'));

/* ---------------- 播放控制 ---------------- */
function setPlaying(v) {
  playing = v;
  $('#playBtn').textContent = v ? '暂停' : '播放';
  $('#playBtn').classList.toggle('on', v);
}
setPlaying(true);
$('#playBtn').addEventListener('click', () => setPlaying(!playing));
$('#stepBack').addEventListener('click', () => { setPlaying(false); th = (th - 5 * D2R + TAU) % TAU; applyPose(th); $('#range').value = Math.round(th * R2D); });
$('#stepFwd').addEventListener('click', () => { setPlaying(false); th = (th + 5 * D2R) % TAU; applyPose(th); $('#range').value = Math.round(th * R2D); });
$('#range').addEventListener('input', e => { setPlaying(false); th = (+e.target.value) * D2R; applyPose(th); });
$('#speed').addEventListener('change', e => { speed = +e.target.value; });
$('#resetBtn').addEventListener('click', () => stage.fitCamera());

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); if (mode === 'observe') setPlaying(!playing); }
  if (e.code === 'ArrowLeft' && mode === 'observe') $('#stepBack').click();
  if (e.code === 'ArrowRight' && mode === 'observe') $('#stepFwd').click();
});
