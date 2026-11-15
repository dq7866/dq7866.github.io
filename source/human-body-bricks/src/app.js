// app.js — 人体积木 · 拆解与搭建
// 玩法：三层系统（骨骼/肌肉/器官）独立拆装；每个形状带七项功能与注意事项。
import * as THREE from '../lib/three.module.js';
import { OrbitCam } from './camera.js';
import { SYSTEMS, PARTS, ALL_PARTS, PART_BY_ID, SYSTEM_BY_ID, partsOf, validateData } from './data.js';
import {
  createPartGroup, groupOfRecord, setHighlight, setGhost, setGroupOpacity, partMaterials,
  loadBodyAssets, setAssetParts, bodyMeta,
} from './body.js';
import { createPhysio } from './physio.js';
import { createPostFX } from './postfx.js';
import { createCinema } from './cinema.js';
import { createFilm } from './film.js';
import { createStudio } from './studio.js';
import { refine } from './surface.js';
import { PHYSIO, PHYSIO_BY_ID, PHYSIO_MORE } from './physio-data.js';
import { THEMES, THEME_BY_ID, THEME_KEY, loadThemeId, saveThemeId, applyTheme } from './theme.js';
import {
  currentSaveKey, currentProfile, listProfiles, addProfile, renameProfile,
  removeProfile, switchProfile, clearCurrentSave, resetProfileSystem, statOf,
} from './profiles.js';

// 每份档案一份独立存档；currentSaveKey() 首次调用时会自动迁移旧版单存档
const SAVE_KEY = currentSaveKey();
const $ = id => document.getElementById(id);

if (validateData(true).length) {
  console.warn('人体形状数据存在不合规项，已在上方列出');
}

// 发布级存档校验：localStorage 可能被旧版本、手动修改、扩展或其它页面写成任意内容。
// 早期版本直接 new Set(saved.learned)，遇到数字会抛 TypeError 让整个 app 白屏；
// system = '__proto__' 还会命中 Object.prototype 导致后续 .map 崩。
// 这里把所有字段规范化成「已知 id 的字符串数组 / 合法系统 id」，并把脏数据自愈写回。
const VALID_PART_IDS = new Set(ALL_PARTS.map(p => p.id));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const idsOf = v => Array.isArray(v)
  ? [...new Set(v.filter(x => typeof x === 'string' && VALID_PART_IDS.has(x)))]
  : [];
const sysIdsOf = v => Array.isArray(v)
  ? [...new Set(v.filter(x => typeof x === 'string' && hasOwn(SYSTEM_BY_ID, x)))]
  : [];

function loadSave() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { raw = null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const clean = {
    system: typeof raw.system === 'string' && hasOwn(SYSTEM_BY_ID, raw.system) ? raw.system : 'body',
    sound: raw.sound !== false,
    learned: idsOf(raw.learned),
    removed: idsOf(raw.removed),
    built: idsOf(raw.built),
    badges: sysIdsOf(raw.badges),
  };
  const dirty = raw.system !== clean.system || raw.sound !== clean.sound
    || ['learned', 'removed', 'built', 'badges'].some(k =>
      !Array.isArray(raw[k]) || raw[k].length !== clean[k].length
      || raw[k].some((v, i) => v !== clean[k][i]));
  if (dirty) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(clean)); } catch { /* 隐私模式忽略 */ }
  }
  return clean;
}
const saved = loadSave();
const state = {
  mode: 'explore',
  system: hasOwn(SYSTEM_BY_ID, saved.system) ? saved.system : 'body',
  selected: null,
  carrying: null,
  sound: saved.sound !== false,
  learned: new Set(saved.learned || []),
  removed: new Set(saved.removed || []),   // 已放进零件盘
  built: new Set(saved.built || []),
  // 已离体：从身体上拆下来、但仍浮在身体旁边（不进零件盘，可以点回去）
  loose: new Set(),
  badges: new Set(saved.badges || []),
  // 生理动画：同时只播一套；播放状态不写本机存档，避免一进来就动
  physio: null,
  physioDock: false,
  physioPlaying: true,
  physioSpeed: 1,
  // 影片模式：接管相机与图层透明度，期间忽略常规交互
  film: false,
};

function persist() {
  try {
    localStorage.setItem(currentSaveKey(), JSON.stringify({
      system: state.system,
      sound: state.sound,
      learned: [...state.learned],
      removed: [...state.removed],
      built: [...state.built],
      badges: [...state.badges],
    }));
  } catch { /* 隐私模式下忽略 */ }
}

/* ---------------- 3D 场景 ---------------- */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090e1a);
scene.fog = new THREE.FogExp2(0x090e1a, 0.022);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(10, 8, 14);

const cam = new OrbitCam(camera, canvas);
const compactView = window.innerWidth <= 900;
const homeTarget = new THREE.Vector3(0, compactView ? 3.7 : 4.2, 0);
const homeDist = compactView ? 17 : 13.2;
cam.target.copy(homeTarget);
cam._targetGoal.copy(homeTarget);
cam.theta = cam._thetaG = -0.42;
cam.phi = cam._phiG = 1.19;
cam.dist = cam._distG = homeDist;
cam.minDist = compactView ? 8 : 6.5;
cam.maxDist = 26;
cam.minPhi = 0.35;
cam.maxPhi = 1.5;

// 影视化管线：HDR + Bloom + 电影调色；只在生理动画里启用，避免常态拖性能
const postfx = createPostFX(renderer, scene, camera);
const cinema = createCinema({ camera, cam, scene, postfx });
// 用户一动相机，自动运镜就让位
canvas.addEventListener('pointerdown', () => cinema.touch(), { passive: true });
canvas.addEventListener('wheel', () => cinema.touch(), { passive: true });

/* ---------------- 影片模式 ---------------- */
// 影片期间的图层透明度由 film.js 逐帧给，必须绕开 setGroupOpacity 的
// needsUpdate（那个会触发着色器重编译，逐帧调用直接卡死）
function filmLayer(group, v) {
  if (!group) return;
  const tr = v < 0.999;
  group.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const m = o.material;
    m.transparent = tr;
    m.opacity = v;
    m.depthWrite = v > 0.55;
  });
  group.visible = v > 0.012;
}

const film = createFilm({
  camera, cam, postfx,
  meta: () => bodyMeta,
  getSystem: () => state.system,
  getPhysio: () => state.physio,
  setLayer: (name, v) => filmLayer(layerGroups[name], v),
  // 光环：特写镜头里淡出，免得横线穿过器官；宽镜头恢复
  setHalo: v => { haloBase = haloFull * v; haloMats.forEach(m => { m.opacity = haloBase; }); },
  onStart: () => {
    state.film = true;
    if (state.physio) closePhysio();
    if (state.mode === 'build') setMode('explore');
    state.selected = null;
    state.carrying = null;
    clearHighlight();
    applyVisibility();   // 先把离体/拆下的形状归位，影片期间画面才干净
    // 纪录片字幕是白字：无论当前主题深浅，影片都压成影院黑，退出再回填当前主题。
    // 地面/网格/微尘也要一起收起，否则浅色主题会在黑底上留一块刺眼的白色舞台。
    scene.background.set(FILM_BG);
    if (scene.fog) scene.fog.color.set(FILM_BG);
    ground.visible = false; grid.visible = false; dust.visible = false;
    renderTray();
    renderCard();
  },
  onEnd: snap => {
    state.film = false;
    // 用 applyTheme 整体回填（含雾、地面、网格、灯光），主题在影片期间换过也不会串色
    applyTheme(themeId, themeHooks);
    const showStage = !studio.active;
    ground.visible = showStage; grid.visible = showStage; dust.visible = showStage;
    if (snap) {
      cam.theta = cam._thetaG = snap.theta;
      cam.phi = cam._phiG = snap.phi;
      cam.dist = cam._distG = snap.dist;
      cam._targetGoal.copy(snap.target);
      cam.target.copy(snap.target);
    }
    applyLayers();
    applyVisibility();
    renderTray();
    renderCard();
    syncFilmBtn();
  },
});

function syncFilmBtn() {
  const b = $('btnFilm');
  if (!b) return;
  b.classList.toggle('on', film.active);
  b.setAttribute('aria-pressed', String(film.active));
}

const hemi = new THREE.HemisphereLight(0xbcd7ff, 0x1a2233, 1.15);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
key.position.set(7, 12, 8);
key.castShadow = true;
key.shadow.mapSize.set(1536, 1536);
key.shadow.camera.near = 2;
key.shadow.camera.far = 34;
key.shadow.camera.left = -9;
key.shadow.camera.right = 9;
key.shadow.camera.top = 12;
key.shadow.camera.bottom = -3;
key.shadow.bias = -0.0008;
scene.add(key);

const rim = new THREE.DirectionalLight(0x6fb7e8, 1.5);
rim.position.set(-8, 6, -9);
scene.add(rim);

const fill = new THREE.PointLight(0x7fe0d0, 0.9, 24, 2);
fill.position.set(0, 3.4, 6);
scene.add(fill);

// 地面
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(12, 64),
  new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 0.96, metalness: 0.04 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

// 网格：主题会换颜色，重建而不是改顶点色
let grid = new THREE.GridHelper(24, 48, 0x1e2c44, 0x141e30);
grid.material.transparent = true;
grid.material.opacity = 0.55;
grid.position.y = 0.005;
scene.add(grid);
function setGridColors(c1, c2, opacity) {
  const g = new THREE.GridHelper(24, 48, c1, c2);
  g.material.transparent = true;
  g.material.opacity = opacity;
  g.position.y = 0.005;
  g.visible = grid.visible;   // 工坊/影片把网格藏起来时，换主题别把它放出来
  scene.remove(grid);
  grid.geometry.dispose();
  grid.material.dispose();
  grid = g;
  scene.add(g);
}

// 呼吸光环：三层系统各一圈
const haloMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.13, side: THREE.DoubleSide });
const halos = [
  { mesh: new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.012, 8, 120), haloMat(0x9fe3ff)), y: 2.2, speed: 0.12 },
  { mesh: new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.01, 8, 120), haloMat(0xffb3a7)), y: 3.9, speed: -0.09 },
  { mesh: new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.009, 8, 120), haloMat(0x8fe6c8)), y: 5.6, speed: 0.06 },
];
halos.forEach(h => {
  h.mesh.rotation.x = Math.PI / 2.12;
  h.mesh.position.y = h.y;
  scene.add(h.mesh);
});
const haloMats = halos.map(h => h.mesh.material);
let haloBase = 0.13;
let haloFull = 0.13;   // 主题可调的光环基准亮度；影片/工坊按系数 v 缩放它

// 微尘
const dustGeo = new THREE.BufferGeometry();
{
  const n = 220, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 14;
    arr[i * 3 + 1] = Math.random() * 9;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 14;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
}
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0x86c5e8, size: 0.045, transparent: true, opacity: 0.5, depthWrite: false,
}));
scene.add(dust);

/* ---------------- 部件实例 ---------------- */
// bodyRoot：米制模型 → 场景单位，缩放与落脚点由资源加载后决定
const bodyRoot = new THREE.Group();
scene.add(bodyRoot);

const layerGroups = {
  skeleton: new THREE.Group(),
  muscle: new THREE.Group(),
  organ: new THREE.Group(),
  daily: new THREE.Group(),
};
Object.values(layerGroups).forEach(g => bodyRoot.add(g));

// 空位（幽灵）单独成组：不参与整层透明度，也不参与射线拾取
const ghostGroups = {
  skeleton: new THREE.Group(),
  muscle: new THREE.Group(),
  organ: new THREE.Group(),
  daily: new THREE.Group(),
};
Object.values(ghostGroups).forEach(g => bodyRoot.add(g));

const records = new Map();

// 影片/工坊这类「自带画面」的视图退场后，背景要回填当前主题色而不是进场前的旧色。
const FILM_BG = 0x05070c;   // 影院黑：影片字幕是白字，浅色主题下也必须压成暗场
function currentThemeBg() {
  return THEME_BY_ID[document.documentElement.dataset.theme]?.scene.bg ?? THEME_BY_ID.deep.scene.bg;
}

// 视频工坊：X 光透视风 + 录制导出
const studio = createStudio({
  scene, camera, renderer, postfx, records, bodyMeta,
  layerGroups, canvas, cam,
  setHalo: v => { haloBase = haloFull * v; haloMats.forEach(m => { m.opacity = haloBase; }); },
  // 工坊自带影棚背景；退场时按当前主题回填，避免换主题后背景退回进工坊前的颜色
  getThemeBg: currentThemeBg,
  // X 光画面里地面/网格/尘埃都会穿帮，进出工坊时整体隐藏/恢复
  setStage: on => {
    const show = on && !film.active;
    ground.visible = show; grid.visible = show; dust.visible = show;
  },
  onProgress: (p, t, dur) => {
    const el = $('srProg'), tv = $('srTime');
    if (el) el.style.width = `${(p * 100).toFixed(1)}%`;
    if (tv) {
      const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      tv.textContent = `${fmt(t)} / ${fmt(dur)}`;
    }
  },
  onSaved: name => {
    toast(`已导出：${name}（浏览器下载目录）`, 'ok', 4200);
    studioPanel.hidden = !!studio.isCase;   // 病理课堂保持左面板收起，画面才干净
    if (studio.isCase && clinicVisible) clinicPanel.hidden = false;
    $('studioRecUI').hidden = true;
    resetRecButtons();
  },
});

/* ---------------- 主题外观 ----------------
 * 顶栏调色盘按钮打开主题面板；选中后界面配色、场景氛围、灯光色温一起换装，
 * 选择存 localStorage（独立于学习进度，清空进度不会清主题）。
 */
let themeId = loadThemeId();
const themeHooks = {
  scene, ground, dust, halos, haloMats,
  // 工坊与影片都自带画面；期间换主题只改界面/灯光，不覆盖它们的背景
  ownsBackground: () => studio.active || film.active,
  setGrid: setGridColors,
  setHaloFull: v => {
    haloFull = v;
    // 影片/工坊接管光环时先只记基准值，退场恢复（setHalo(1)）时自然用新值点亮
    if (!film.active && !studio.active) {
      haloBase = v;
      haloMats.forEach(m => { m.opacity = v; });
    }
  },
  lights: { hemi, key, rim, fill },
};

function renderThemePanel() {
  const w = $('themeList');
  w.innerHTML = '';
  let lastScheme = '';
  for (const t of THEMES) {
    const scheme = t.scheme || 'dark';
    if (scheme !== lastScheme) {
      const g = document.createElement('div');
      g.className = 'theme-group';
      g.textContent = scheme === 'light' ? '明亮主题' : '深色氛围';
      w.appendChild(g);
      lastScheme = scheme;
    }
    const b = document.createElement('button');
    b.className = 'theme-item' + (t.id === themeId ? ' on' : '');
    b.dataset.theme = t.id;
    b.title = `${t.name} · ${t.hint}`;
    b.innerHTML = `
      <span class="ti-sw">${t.swatch.map(c => `<i style="background:${c}"></i>`).join('')}</span>
      <span class="ti-txt"><b>${t.name}</b><em>${t.hint}</em></span>
      <span class="ti-check">✓</span>`;
    w.appendChild(b);
  }
}

function setTheme(id, { silent = false } = {}) {
  const t = applyTheme(id, themeHooks);
  themeId = t.id;
  saveThemeId(t.id);
  renderThemePanel();
  document.documentElement.dataset.theme = t.id;
  if (!silent) toast(`主题已切换：${t.name}`, 'ok', 1600);
}

function openThemePanel() {
  $('themePanel').hidden = false;
  $('btnTheme').setAttribute('aria-pressed', 'true');
  renderThemePanel();
  navPush('theme');
}
function closeThemePanel() {
  $('themePanel').hidden = true;
  $('btnTheme').setAttribute('aria-pressed', 'false');
}

$('btnTheme').addEventListener('click', () => {
  if ($('themePanel').hidden) openThemePanel();
  else closeThemePanel();
});
$('themeClose').addEventListener('click', closeThemePanel);
$('themeList').addEventListener('click', e => {
  const b = e.target.closest('button[data-theme]');
  if (!b) return;
  setTheme(b.dataset.theme);
  closeThemePanel();
  b.blur();
});
// 点击面板外面关闭（顶栏按钮自己会切换，不算"外面"）
document.addEventListener('pointerdown', e => {
  if ($('themePanel').hidden) return;
  if (e.target.closest('#themePanel') || e.target.closest('#btnTheme')) return;
  closeThemePanel();
});

// 启动时应用记住的主题（deep = 原始观感，不切换则画面完全不变）
setTheme(themeId, { silent: true });

/* ---------------- 本地用户档案 ----------------
 * 多个档案各存一份学习进度，切换档案重载页面以彻底重建内存状态
 * （state 里的 learned / removed / built / badges 都是 Set，重载最干净）。
 * 全部只写 localStorage，不联网、不上传、无账号密码。
 */
function syncProfileChip() {
  const p = currentProfile();
  const chip = $('profileChip');
  if (chip) {
    chip.textContent = p.name;
    chip.style.setProperty('--pf-color', p.color || '#6fd9e8');
    chip.title = `当前档案：${p.name} · 点开管理档案`;
  }
  const btn = $('btnProfile');
  btn.title = `我的档案 · 当前：${p.name}`;
  btn.setAttribute('aria-label', `我的档案，当前 ${p.name}`);
}

function pfEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderProfilePanel() {
  const w = $('profileList');
  w.innerHTML = '';
  const cur = currentProfile();
  $('profileNowName').textContent = cur.name;
  $('profileNowDot').style.background = cur.color || '#6fd9e8';
  $('profileNowStat').textContent =
    `已认识 ${$('statLearn').textContent} · 徽章 ${$('statBadge').textContent}`;

  for (const p of listProfiles()) {
    const row = pfEl('div', 'pf-item' + (p.active ? ' on' : ''));
    row.dataset.id = p.id;
    const dot = pfEl('span', 'pf-dot');
    dot.style.background = p.color || '#6fd9e8';
    const txt = pfEl('span', 'pf-txt');
    txt.appendChild(pfEl('b', '', p.name));
    txt.appendChild(pfEl('em', '', `已认识 ${p.stats.learned} · 徽章 ${p.stats.badges}${p.active ? ' · 当前' : ''}`));
    const acts = pfEl('span', 'pf-acts');
    const sw = pfEl('button', 'pf-mini', p.active ? '当前' : '切换');
    sw.dataset.act = 'switch';
    sw.disabled = p.active;
    const rn = pfEl('button', 'pf-mini', '✎');
    rn.dataset.act = 'rename'; rn.title = '重命名';
    const rm = pfEl('button', 'pf-mini pf-del', '✕');
    rm.dataset.act = 'remove'; rm.title = '删除此档案及其进度';
    acts.append(sw, rn, rm);
    row.append(dot, txt, acts);
    w.appendChild(row);
  }
}

function openProfilePanel() {
  $('profilePanel').hidden = false;
  $('btnProfile').setAttribute('aria-pressed', 'true');
  renderProfilePanel();
  navPush('profile');
}
function closeProfilePanel() {
  $('profilePanel').hidden = true;
  $('btnProfile').setAttribute('aria-pressed', 'false');
}
function switchToProfile(id) {
  if (!id || !switchProfile(id)) return;
  location.reload();
}
function addProfileNow() {
  const input = $('profileNewName');
  const name = input.value.trim();
  if (!name) { toast('先给新档案起个名字', 'info', 1600); input.focus(); return; }
  if (!addProfile(name)) { toast('名字不能为空', 'info', 1600); return; }
  location.reload();                 // 新建后直接切到新档案
}

$('btnProfile').addEventListener('click', () => {
  if ($('profilePanel').hidden) openProfilePanel(); else closeProfilePanel();
});
$('profileChip').addEventListener('click', () => openProfilePanel());
$('profileClose').addEventListener('click', closeProfilePanel);
$('profileAdd').addEventListener('click', addProfileNow);
$('profileNewName').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addProfileNow(); }
});
$('profileList').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  const row = e.target.closest('.pf-item');
  if (!row) return;
  const id = row.dataset.id;
  if (!btn) { switchToProfile(id); return; }
  const p = listProfiles().find(x => x.id === id);
  switch (btn.dataset.act) {
    case 'switch': switchToProfile(id); break;
    case 'rename': {
      const name = window.prompt('给这个档案起个名字（最多 12 字）', p ? p.name : '');
      if (name != null && renameProfile(id, name)) { renderProfilePanel(); syncProfileChip(); }
      break;
    }
    case 'remove': {
      if (listProfiles().length <= 1) { toast('至少要保留一个档案', 'info', 1600); break; }
      if (!window.confirm(`删除档案「${p ? p.name : ''}」？该档案的学习进度也会一并删除，且无法恢复。`)) break;
      const wasCurrent = p && p.active;
      if (removeProfile(id)) { if (wasCurrent) location.reload(); else renderProfilePanel(); }
      break;
    }
  }
});
document.addEventListener('pointerdown', e => {
  if ($('profilePanel').hidden) return;
  if (e.target.closest('#profilePanel') || e.target.closest('#btnProfile') || e.target.closest('#profileChip')) return;
  closeProfilePanel();
});

/* ---------------- 赞赏 / 打赏 ----------------
 * 静态收款码图片，不经任何服务器；打赏完全自愿，与功能权限无关。
 */
function openTipModal() {
  const img = $('tipQr');
  $('tipSave').href = img.currentSrc || img.src;
  $('tipModal').classList.add('show');
  navPush('tip');
}
function closeTipModal() { $('tipModal').classList.remove('show'); }

$('btnTip').addEventListener('click', openTipModal);
$('supportCard').addEventListener('click', openTipModal);
$('tipSave').href = $('tipQr').currentSrc || $('tipQr').src;
$('tipModal').addEventListener('click', e => {
  if (e.target.id === 'tipModal' || e.target.closest('[data-close]')) closeTipModal();
});

syncProfileChip();

function buildRecords() {
  // ALL_PARTS：解剖形状（骨骼/肌肉/器官）+ 日常人体形状，全部构建并注册
  for (const part of ALL_PARTS) {
    const group = createPartGroup(part);
    const ghost = createPartGroup(part);
    setGhost(ghost, bodyMeta.source !== 'glb'); // 真实模型太重，不算描边
    ghost.visible = false;
    layerGroups[part.system].add(group);
    ghostGroups[part.system].add(ghost);
    records.set(part.id, {
      part, group, ghost,
      base: group.position.clone(),
      ghostMats: partMaterials(ghost),
      mats: partMaterials(group),
      anim: null,
    });
  }
  // 每个形状单独材质，避免高亮/淡出互相影响
  records.forEach(r => { r.mats.forEach(m => { m.userData.baseOpacity = 1; }); });
}

/* ---------------- 残差层：模型里没单独成形的结构，只做视觉填充 ---------------- */
// 真实人体里还有三百多条小肌肉（手内肌、肋间肌、足底肌…），它们不参与拆装与知识卡，
// 但少了它们身体会漏空。挂到对应大层下，跟随该层一起淡入淡出。
const ambient = [];

function buildAmbient(extras) {
  if (!extras) return;
  extras.forEach((rec, id) => {
    const layer = id === 'otherBone' ? 'skeleton' : (id === 'otherMuscle' ? 'muscle' : 'organ');
    const group = groupOfRecord(id, rec);
    (layerGroups[layer] || layerGroups.muscle).add(group);
    ambient.push({ id, group, mats: partMaterials(group) });
  });
}

/* ---------------- 视图状态 ---------------- */
function isCurrent(id) { return PART_BY_ID[id] && PART_BY_ID[id].system === state.system; }

function applyLayers() {
  // 影片模式自己逐帧控制图层透明度，这里不许插手
  if (state.film) return;
  // 视频工坊同样自己接管画面，普通图层逻辑让位
  if (studio.active) return;
  // 日常人体：只显示 daily 层；其余模式下把 daily 层藏起来（opacity=0 同时置 visible=false）
  setGroupOpacity(layerGroups.daily, state.system === 'daily' ? 1 : 0);
  // 生理动画：三层同时在场，但都转成半透明，里面的流动才看得见。
  // depthWrite 由 setGroupOpacity 按透明度自动关掉，透明器官不会挡住粒子。
  if (state.physio) {
    const neural = state.physio === 'neural';
    const breath = state.physio === 'breath';
    // 运动联动与运动响应都要看得见肌肉收缩/肢体摆动，肌肉层留亮一些
    const motion = state.physio === 'motion' || state.physio === 'exertion';
    setGroupOpacity(layerGroups.skeleton, motion ? 0.9 : (neural ? 0.5 : 0.22));
    setGroupOpacity(layerGroups.muscle, motion ? 0.85 : (neural ? 0.45 : 0.12));
    setGroupOpacity(layerGroups.organ, breath ? 0.55 : (motion ? 0.3 : (neural ? 0.35 : 0.5)));
    return;
  }
  // 正常人体：三层同时可见、平衡呈现——骨骼做淡淡支架，肌肉为主体但略透，
  // 器官透出轮廓，整体像一具完整、正常站立的人，又能隐约看见里面的骨架与脏器。
  if (state.system === 'body') {
    setGroupOpacity(layerGroups.skeleton, 0.5);
    setGroupOpacity(layerGroups.muscle, 0.6);
    setGroupOpacity(layerGroups.organ, 0.55);
    return;
  }
  if (state.system === 'daily') {
    // 日常人体：只留 daily 层，解剖三层全部隐藏
    setGroupOpacity(layerGroups.skeleton, 0);
    setGroupOpacity(layerGroups.muscle, 0);
    setGroupOpacity(layerGroups.organ, 0);
    return;
  }
  const sk = state.system === 'skeleton' ? 1 : (state.system === 'muscle' ? 0.16 : 0.1);
  setGroupOpacity(layerGroups.skeleton, sk);
  setGroupOpacity(layerGroups.muscle, state.system === 'muscle' ? 1 : 0);
  setGroupOpacity(layerGroups.organ, state.system === 'organ' ? 1 : 0);
}

// 搭建时哪些系统是「待装配集合」：正常人体 = 三系统并集，其它 = 自身
function buildSystems() {
  return state.system === 'body' ? ['skeleton', 'muscle', 'organ'] : [state.system];
}

function applyVisibility() {
  records.forEach((r, id) => {
    r.ghost.visible = false;
    r.group.visible = !state.removed.has(id);
    r.group.scale.setScalar(1);
    r.group.rotation.set(0, 0, 0);
    r.group.position.copy(r.base);
    r.mats.forEach(m => { m.opacity = 1; m.transparent = false; m.depthWrite = true; });
    if (state.mode === 'build' && buildSystems().includes(r.part.system)) {
      const done = state.built.has(id);
      const loose = state.loose.has(id) && !state.removed.has(id);
      r.group.visible = done || loose;
      r.ghost.visible = !done;
    }
    // 已离体的形状：浮在身体旁边（位置由 id 固定推导，多次刷新不跳位）
    if (state.loose.has(id) && !state.removed.has(id)) {
      r.loosePos = looseTarget(id, r);
      r.group.visible = true;
      r.group.position.copy(r.loosePos);
      r.group.rotation.set(0, 0.32, 0);
      r.mats.forEach(m => { m.transparent = true; m.depthWrite = false; m.opacity = 0.95; });
    }
  });
  applyLayers();
  clearHighlight();
}

/* ---------------- 选择与知识卡 ---------------- */
function systemColor(id) { return SYSTEM_BY_ID[id].color; }

// 知识卡底部按钮：状态不同，能做的事不同（单击 / 双击与按钮等价）
function cardActions(p, { removed, built, loose }) {
  if (removed) return `<button class="btn primary" data-action="install">装回身体</button>`;
  if (state.mode === 'explore') {
    if (loose) {
      return `<button class="btn primary" data-action="install">装回身体</button>
              <button class="btn ghost" data-action="tray">放进零件盘</button>`;
    }
    return `<button class="btn ghost" data-action="detach">拆下（离开身体）</button>
            <button class="btn subtle" data-action="tray">直接放进零件盘</button>`;
  }
  if (built) return `<button class="btn done" disabled>已经装好了</button>`;
  if (loose) return `<button class="btn primary" data-action="install">装回这个位置</button>`;
  return `<button class="btn primary" data-action="pick">拿起去安装</button>`;
}

function renderCard() {
  const panel = $('cardPanel');
  const p = state.selected ? PART_BY_ID[state.selected] : null;
  if (!p) {
    panel.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">🫀</div>
        <h3>从一个形状开始</h3>
        <p>身体被拆成 <b>${ALL_PARTS.length}</b> 个可拆可装的形状，每个形状都有 <b>七项功能作用</b> 和 <b>注意事项</b>。</p>
        <ul class="empty-steps">
          <li><span>1</span>左侧默认是「正常人体」，点开看完整站立的人；也能切换骨骼 / 肌肉 / 器官</li>
          <li><span>2</span>点击身体上的形状，读它的七项功能与注意事项</li>
          <li><span>3</span>拆下来，再在重建模式把零件装回身体</li>
        </ul>
        <div class="empty-stats">
          <div><b>${state.learned.size}</b><em>已认识</em></div>
          <div><b>${ALL_PARTS.length - state.learned.size}</b><em>待探索</em></div>
          <div><b>${state.badges.size}</b><em>系统徽章</em></div>
        </div>
      </div>`;
    panel.classList.remove('has-card');
    return;
  }
  const sys = SYSTEM_BY_ID[p.system];
  const removed = state.removed.has(p.id);
  const built = state.built.has(p.id);
  const loose = state.loose.has(p.id);
  const canQuiz = learnedCount(p.system) === partsOf(p.system).length;
  panel.classList.add('has-card');
  panel.innerHTML = `
    <div class="card-head" style="--accent:${sys.color}">
      <div class="card-top">
        <span class="sys-chip">${sys.name} · ${sys.blurb}</span>
        <button class="card-close" data-action="close" aria-label="收起知识卡">✕</button>
      </div>
      <h2>${p.name}<em>${p.en}</em></h2>
      <p class="card-tag">${p.tag}</p>
      ${p.bones ? `<div class="bone-list"><b>本块含 ${p.bones.length} 项骨性结构</b><span>${p.bones.join(' · ')}</span></div>` : ''}
      <div class="card-state">
        <span class="${state.learned.has(p.id) ? 'on' : ''}">已认识</span>
        <span class="${loose ? 'on' : ''}">已离体</span>
        <span class="${removed ? 'on' : ''}">已在零件盘</span>
        <span class="${built ? 'on' : ''}">已装回</span>
      </div>
    </div>

    <div class="card-body">
      <section class="funcs">
        <h3><i>7</i>七项功能作用</h3>
        <ol>${p.funcs.map(f => `<li>${f}</li>`).join('')}</ol>
      </section>
      <section class="caution">
        <h3>⚠ 注意事项</h3>
        <p>${p.caution}</p>
      </section>
      <section class="care">
        <h3>💚 守护提示</h3>
        <p>${p.tip}</p>
      </section>
    </div>

    <div class="card-actions">
      ${cardActions(p, { removed, built, loose })}
      <button class="btn subtle" data-action="quiz" ${canQuiz ? '' : 'disabled title="先认识这个系统的全部形状"'}>${state.badges.has(p.system) ? '再测一次' : '系统挑战'}</button>
    </div>
    <p class="card-hint">单击形状：离开身体 / 装回　双击形状：放进零件盘　双击零件盘：看它该在哪</p>`;
}

function selectPart(id, opts = {}) {
  if (!isCurrent(id)) {
    state.system = PART_BY_ID[id].system;
    renderSystemTabs();
    renderTip();
    renderTray();
    applyVisibility();
  }
  if (state.selected) clearHighlight();
  state.selected = id;
  const r = records.get(id);
  if (r && r.group.visible) setHighlight(r.group, true);
  if (!state.learned.has(id)) {
    state.learned.add(id);
    persist();
    renderStats();
    renderSystemTabs();
    const total = partsOf(PART_BY_ID[id].system).length;
    if (learnedCount(PART_BY_ID[id].system) === total) {
      toast(`${SYSTEM_BY_ID[PART_BY_ID[id].system].name}系统已全部认识，可以挑战系统徽章了`, 'ok', 4200);
    }
  }
  renderCard();
  if (!opts.keepTooltip) hideTooltip();
}

function clearHighlight() {
  records.forEach(r => setHighlight(r.group, false));
}

/* ---------------- 拆下（离体） / 装回 / 放进零件盘 ---------------- */
const anims = [];
function tween(dur, fn, done) {
  const a = { t: 0, dur, fn, done };
  anims.push(a);
  return a;
}
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeBack = k => { const c = 1.70158 + 1; return 1 + c * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2); };

const UP = new THREE.Vector3(0, 1, 0);
// 离体距离：人体局部坐标（米）。1.75 m 高的人，浮出约 0.5~0.8 m 就明显离开轮廓了。
const LOOSE_DIST = 0.58;

/** 离体位置：从身体中轴朝外推开，按 id 哈希给固定方位，刷新/重启不会跳位 */
function looseTarget(id, r) {
  const b = r.base;
  const v = new THREE.Vector3(b.x, 0, b.z);
  // 中轴上的形状（脊柱、脏器、头）没有径向方向，统一朝相机一侧浮出
  if (v.lengthSq() < 0.0025) v.set(0.18, 0, 1);
  v.normalize();
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  v.applyAxisAngle(UP, ((h % 13) - 6) * 0.2);           // 同一侧的多个形状扇开，避免叠在一起
  const dist = LOOSE_DIST * (0.88 + ((h % 5) / 5) * 0.42);
  return new THREE.Vector3(b.x + v.x * dist, b.y + 0.04 + ((h % 3) - 1) * 0.05, b.z + v.z * dist);
}

/** 把整块形状放大一点，让离体的小骨头也看得清 */
function busyMats(r) { r.mats.forEach(m => { m.transparent = true; m.depthWrite = false; }); }

/** 单击身体上的形状：离开身体一定距离，浮在旁边（不动零件盘） */
function detachLoose(id) {
  const r = records.get(id);
  if (!r || state.removed.has(id) || state.loose.has(id) || r.busy) return;
  state.loose.add(id);
  state.built.delete(id);
  busyMats(r);
  const start = r.group.position.clone();
  const target = looseTarget(id, r);
  r.loosePos = target;
  r.busy = true;
  playSound('detach');
  tween(0.46, k => {
    const e = easeOut(k);
    r.group.position.lerpVectors(start, target, e);
    r.group.rotation.y = e * 0.32;
    r.mats.forEach(m => { m.opacity = 1 - 0.05 * e; });
  }, () => {
    r.busy = false;
    // 搭建模式里它本该在哪，用蓝色空位标出来
    if (state.mode === 'build' && buildSystems().includes(r.part.system) && !state.built.has(id)) {
      r.ghost.visible = true;
    }
  });
  if (state.selected === id) clearHighlight();
  renderTray();
  renderCard();
  renderStats();
  renderSystemTabs();
}

/** 双击形状：飞进零件盘（缩小淡出，朝零件盘方向飞） */
function detachToTray(id) {
  const r = records.get(id);
  if (!r || state.removed.has(id) || r.busy) return;
  state.loose.delete(id);
  state.built.delete(id);
  state.removed.add(id);
  persist();
  renderTray();                       // 先渲染，零件盘才量得到真实位置
  busyMats(r);
  r.busy = true;
  const start = r.group.position.clone();
  const rot0 = r.group.rotation.y;
  const target = trayLocalTarget();
  playSound('detach');
  tween(0.5, k => {
    const e = easeOut(k);
    r.group.position.lerpVectors(start, target, e);
    r.group.rotation.y = rot0 + e * 0.9;
    r.group.scale.setScalar(1 - 0.78 * e);
    r.mats.forEach(m => { m.opacity = 1 - e; });
  }, () => {
    r.group.visible = false;
    r.group.position.copy(r.base);
    r.group.rotation.set(0, 0, 0);
    r.group.scale.setScalar(1);
    r.mats.forEach(m => { m.opacity = 1; m.transparent = false; m.depthWrite = true; });
    r.busy = false;
    if (state.mode === 'build' && buildSystems().includes(r.part.system)) r.ghost.visible = true;
  });
  if (state.selected === id) clearHighlight();
  renderTray();
  renderCard();
  renderStats();
  renderSystemTabs();
}

/** 零件盘中心的屏幕位置 → 场景局部坐标（形状朝这里飞） */
function trayLocalTarget() {
  const wrap = document.querySelector('.tray-wrap');
  const rect = wrap ? wrap.getBoundingClientRect() : null;
  const cx = rect && rect.width ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const cy = rect && rect.height ? rect.top + rect.height / 2 : window.innerHeight - 70;
  const v = new THREE.Vector3((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1, 0.5);
  v.unproject(camera).sub(camera.position).normalize();
  const wp = camera.position.clone().addScaledVector(v, Math.min(Math.max(cam.dist * 0.6, 5), 9));
  bodyRoot.updateMatrixWorld();
  return bodyRoot.worldToLocal(wp);
}

function install(id, viaBuild) {
  const r = records.get(id);
  if (!r) return;
  const wasRemoved = state.removed.delete(id);
  const wasLoose = state.loose.delete(id);
  if (viaBuild) state.built.add(id);
  persist();
  r.group.visible = true;
  r.ghost.visible = false;
  const fromLoose = wasLoose && !wasRemoved;
  const startPos = r.group.position.clone();
  const rot0 = r.group.rotation.y;
  r.mats.forEach(m => { m.transparent = true; m.depthWrite = false; });
  if (!fromLoose) r.mats.forEach(m => { m.opacity = 0; });
  r.busy = true;
  playSound('install');

  if (fromLoose) {
    // 从浮出的位置滑回身体原位
    tween(0.52, k => {
      const e = easeOut(k);
      r.group.position.lerpVectors(startPos, r.base, e);
      r.group.rotation.y = rot0 * (1 - e);
      r.mats.forEach(m => { m.opacity = 0.95 + 0.05 * e; });
    }, () => {
      r.group.position.copy(r.base);
      r.group.rotation.set(0, 0, 0);
      r.group.scale.setScalar(1);
      r.mats.forEach(m => { m.opacity = 1; m.transparent = false; m.depthWrite = true; });
      r.busy = false;
      flashInstalled(id, r);
    });
  } else {
    r.group.position.copy(r.base);
    r.group.rotation.set(0, 0, 0);
    tween(0.52, k => {
      const e = easeBack(Math.min(1, k));
      r.group.scale.setScalar(0.35 + 0.65 * e);
      r.mats.forEach(m => { m.opacity = Math.min(1, k * 1.5); });
    }, () => {
      r.group.scale.setScalar(1);
      r.mats.forEach(m => { m.opacity = 1; m.transparent = false; m.depthWrite = true; });
      r.busy = false;
      flashInstalled(id, r);
    });
  }
  renderTray();
  renderCard();
  renderStats();
  renderSystemTabs();
  return wasRemoved;
}

// 装好后给一点光晕反馈
function flashInstalled(id, r) {
  setHighlight(r.group, true);
  setTimeout(() => { if (state.selected !== id) setHighlight(r.group, false); }, 420);
}

/* ---------------- 双击零件盘：在模型上标出它该在哪 ---------------- */
const GHOST_BASE = { opacity: 0.13, color: 0x7fd8ea, edge: 0x8fe3f2, edgeOpacity: 0.5 };
let locateTimer = 0;

function resetGhostLook(r) {
  r.ghost.scale.setScalar(1);
  r.ghostMats.forEach(m => { m.opacity = GHOST_BASE.opacity; m.color.setHex(GHOST_BASE.color); });
  r.ghost.traverse(o => {
    if (o.isLineSegments) { o.material.opacity = GHOST_BASE.edgeOpacity; o.material.color.setHex(GHOST_BASE.edge); }
  });
}

function showLocation(id) {
  const r = records.get(id);
  if (!r) return;
  const p = PART_BY_ID[id];
  if (p.system !== state.system) setSystem(p.system);
  clearTimeout(locateTimer);

  // 只让这一个空位亮起来，其它先藏掉——视线自然落到它身上
  records.forEach(o => { o.ghost.visible = false; resetGhostLook(o); });
  const g = r.ghost;
  g.visible = true;
  g.scale.setScalar(1.05);
  r.ghostMats.forEach(m => { m.opacity = 0.5; m.color.setHex(0xffd479); });
  g.traverse(o => {
    if (o.isLineSegments) { o.material.opacity = 0.95; o.material.color.setHex(0xffe6a3); }
  });

  // 形状还在身上：叠加高亮，等于"已经在这里"
  const onBody = !state.removed.has(id) && !state.loose.has(id);
  if (onBody) setHighlight(r.group, true);

  // 相机看一眼它的位置（保持当前视角，只改注视点与距离）
  bodyRoot.updateMatrixWorld();
  const wp = r.base.clone();
  bodyRoot.localToWorld(wp);
  cam.flyTo(cam.theta, cam.phi, Math.min(Math.max(cam.dist * 0.82, 7), 11.5), wp);

  toast(onBody ? `「${p.name}」就在这里` : `「${p.name}」该装在这个位置`, 'ok', 2400);
  playSound('select');

  locateTimer = setTimeout(() => {
    records.forEach(o => { o.ghost.visible = false; resetGhostLook(o); });
    applyVisibility();
  }, 2400);
}


/* ---------------- 系统切换 / 搭建模式 ---------------- */
function setSystem(id) {
  if (state.physio) closePhysio();
  state.system = id;
  state.selected = null;
  state.carrying = null;
  persist();
  applyVisibility();
  renderSystemTabs();
  renderTray();
  renderTip();
  renderCard();
  renderStats();
  if (state.mode === 'build') toast(`重建「${SYSTEM_BY_ID[id].name}」：把零件盘里的形状拖到蓝色空位`, 'info', 3200);
}

function setMode(mode) {
  if (state.mode === mode) return;
  if (mode === 'build' && state.physio) closePhysio();
  state.mode = mode;
  state.selected = null;
  state.carrying = null;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('app').dataset.mode = mode;
  applyVisibility();
  renderTray();
  renderCard();
  renderTip();
  renderStats();
  if (mode === 'build') {
    toast('重建模式：把零件盘里的形状拖回蓝色空位，双击零件盘可看位置', 'info', 3600);
  } else {
    toast('探索模式：单击形状离开身体，再单击装回，双击放进零件盘', 'info', 3200);
  }
}

/* ---------------- 面板渲染 ---------------- */
function learnedCount(systemId) {
  return partsOf(systemId).filter(p => state.learned.has(p.id)).length;
}

function renderSystemTabs() {
  const wrap = $('systemList');
  wrap.innerHTML = SYSTEMS.map(s => {
    const total = partsOf(s.id).length;
    const got = learnedCount(s.id);
    const pct = Math.round(got / total * 100);
    const badge = state.badges.has(s.id);
    return `
      <button class="sys-card ${state.system === s.id ? 'active' : ''}" data-sys="${s.id}" style="--accent:${s.color}">
        <span class="sys-dot"></span>
        <span class="sys-main">
          <b>${s.name}<em>${s.en}</em></b>
          <i>${s.blurb}</i>
          <span class="bar"><span style="width:${pct}%"></span></span>
        </span>
        <span class="sys-meta">${got}/${total}${badge ? '<u title="已获得系统徽章">★</u>' : ''}</span>
      </button>`;
  }).join('');
  wrap.querySelectorAll('.sys-card').forEach(btn => {
    btn.addEventListener('click', () => setSystem(btn.dataset.sys));
  });
}

function renderStats() {
  const parts = partsOf(state.system);
  const learn = parts.filter(p => state.learned.has(p.id)).length;
  const total = parts.length;
  $('statLearn').textContent = `${learn}/${total}`;
  $('statBadge').textContent = `${state.badges.size}/${SYSTEMS.length}`;
  $('learnBar').style.width = `${total ? learn / total * 100 : 0}%`;
}

function renderTip() {
  const s = SYSTEM_BY_ID[state.system];
  $('tipTitle').textContent = `${s.name} · 守护提示`;
  $('tipList').innerHTML = s.tips.map(t => `<li>${t}</li>`).join('');
}

function chipHtml(p, mode) {
  const sys = SYSTEM_BY_ID[p.system];
  // 日常人体：AI 模型还没到货的部件（空 Group）显示「生成中」，不允许拆装
  const pending = p.system === 'daily' && records.get(p.id) && records.get(p.id).group.children.length === 0;
  const disabled = (mode === 'build' && state.built.has(p.id)) || pending;
  return `<button class="chip ${state.carrying === p.id ? 'carrying' : ''} ${disabled ? 'disabled' : ''}" data-chip="${p.id}" style="--accent:${sys.color}" ${disabled ? 'disabled' : ''}>
    <span class="chip-dot"></span><b>${p.name}</b><i>${pending ? '⏳ 模型生成中' : p.tag}</i>
  </button>`;
}

function renderTray() {
  const tray = $('tray');
  const isBuild = state.mode === 'build';
  let list;
  if (isBuild) {
    list = partsOf(state.system).filter(p => !state.built.has(p.id));
  } else {
    list = ALL_PARTS.filter(p => p.system === state.system && state.removed.has(p.id));
  }
  const title = isBuild ? '零件盘 · 拖到身体上 / 双击看位置' : '零件盘 · 单击装回 / 双击看位置';
  $('trayReset').hidden = !isBuild;
  $('trayTitle').textContent = title;
  document.querySelector('.tray-wrap').classList.toggle('show', list.length > 0);
  if (!list.length) {
    tray.innerHTML = '';
    return;
  }
  tray.innerHTML = list.map(p => chipHtml(p, state.mode)).join('');
  tray.querySelectorAll('.chip').forEach(chip => bindChip(chip));
}

/* ---------------- 交互：点选 / 拖放 ---------------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downPos = null;
let hoverId = null;

function pickAt(clientX, clientY) {
  ndc.x = (clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const list = [];
  // 「正常人体」只拾取解剖三层；daily 层在非 daily 模式下隐藏（visible=false），
  // 但 Raycaster 不检查祖先 visible，必须显式排除，否则看不见的日常体块会挡住点击。
  const pickGroups = state.system === 'body'
    ? [layerGroups.skeleton, layerGroups.muscle, layerGroups.organ]
    : [layerGroups[state.system]];
  pickGroups.forEach(g => g.traverse(o => {
    if (!o.isMesh) return;
    let p = o;
    while (p && !p.userData.partId) p = p.parent;
    if (!p) return;
    const rec = records.get(p.userData.partId);
    if (!rec || rec.group.visible === false) return;
    list.push(o);
  }));
  const hits = ray.intersectObjects(list, false);
  for (const h of hits) {
    let p = h.object;
    while (p && !p.userData.partId) p = p.parent;
    if (p) return p.userData.partId;
  }
  return null;
}

function ghostAt(clientX, clientY) {
  let best = null;
  const v = new THREE.Vector3();
  records.forEach(r => {
    if (r.part.system !== state.system || !r.ghost.visible) return;
    r.ghost.getWorldPosition(v).project(camera); // 空位在世界坐标里投影
    const sx = (v.x + 1) / 2 * window.innerWidth;
    const sy = (-v.y + 1) / 2 * window.innerHeight;
    const d = Math.hypot(sx - clientX, sy - clientY);
    if (!best || d < best.d) best = { r, d };
  });
  return best && best.d < 150 ? best.r : null;
}

function highlightGhost(rec) {
  records.forEach(r => {
    const on = r === rec;
    r.ghostMats.forEach(m => {
      m.opacity = on ? 0.32 : 0.12;
      m.color.setHex(on ? 0xc8f6ff : 0x7fd8ea);
    });
    r.ghost.traverse(o => {
      if (o.isLineSegments) {
        o.material.opacity = on ? 1 : 0.45;
        o.material.color.setHex(on ? 0xd8fbff : 0x8fe3f2);
      }
    });
    if (on) r.ghost.scale.setScalar(1.03); else r.ghost.scale.setScalar(1);
  });
  canvas.style.cursor = rec ? 'copy' : 'default';
}

function tryPlace(clientX, clientY) {
  if (!state.carrying) return;
  const rec = ghostAt(clientX, clientY);
  if (!rec) {
    toast('把形状拖到身体上的蓝色空位', 'info', 2200);
    return;
  }
  if (rec.part.id !== state.carrying) {
    playSound('wrong');
    toast(`这个位置属于「${rec.part.name}」，再想想它在哪`, 'warn', 2600);
    rec.ghost.traverse(o => { if (o.isMesh) o.material.color.setHex(0xff8a7a); });
    setTimeout(() => highlightGhost(null), 420);
    return;
  }
  const id = state.carrying;
  state.carrying = null;
  recordSuccess(id);
  highlightGhost(null);
  renderTray();
}

function recordSuccess(id) {
  const wasNew = !state.built.has(id);
  install(id, true);
  state.learned.add(id);
  persist();
  playSound('correct');
  const sys = SYSTEM_BY_ID[PART_BY_ID[id].system];
  const total = partsOf(sys.id).length;
  const builtCount = partsOf(sys.id).filter(p => state.built.has(p.id)).length;
  if (wasNew) {
    toast(`装对了：${PART_BY_ID[id].name} · ${builtCount}/${total}`, 'ok', 2200);
  }
  // 手机上搭建时不自动弹整张知识卡，避免挡住零件盘；点装好的形状仍可阅读
  if (window.innerWidth <= 900) {
    state.selected = null;
    clearHighlight();
    renderCard();
  } else {
    selectPart(id);
  }
  if (builtCount === total) {
    setTimeout(() => {
      toast(`${sys.name}系统重建完成，试试系统挑战`, 'ok', 4200);
      openQuiz(sys.id);
    }, 500);
  }
  renderTray();
  renderStats();
}

/* 单击 / 双击分发
   单击身体上的形状 → 离体浮在旁边；单击离体的形状 → 装回；
   双击任意形状 → 飞进零件盘。单击要等 240ms 确认没有第二击，避免双击时误拆。 */
let pendingTap = null;
const TAP_DELAY = 240;
const DOUBLE_GAP = 520;
let lastChipTap = { id: null, t: 0 };

function queueTap(id, kind) {
  const now = performance.now();
  if (pendingTap && pendingTap.id === id && now - pendingTap.t < DOUBLE_GAP) {
    clearTimeout(pendingTap.timer);
    pendingTap = null;
    onDoubleTap(id);
    return;
  }
  if (pendingTap) {
    clearTimeout(pendingTap.timer);
    const prev = pendingTap;
    pendingTap = null;
    onSingleTap(prev.id, prev.kind);
  }
  const timer = setTimeout(() => { pendingTap = null; onSingleTap(id, kind); }, TAP_DELAY);
  pendingTap = { id, kind, t: now, timer };
}

function onSingleTap(id, kind) {
  const name = PART_BY_ID[id].name;
  if (kind === 'loose') {
    // 搭建模式里点回去 = 装回原位（同时记为已装好）
    install(id, state.mode === 'build');
    selectPart(id);
    toast(`已装回：${name}`, 'ok', 1800);
    return;
  }
  detachLoose(id);
  selectPart(id);
  toast(`「${name}」已离开身体 · 再单击装回，双击放进零件盘`, 'info', 2800);
}

function onDoubleTap(id) {
  const name = PART_BY_ID[id].name;
  detachToTray(id);
  selectPart(id);
  toast(`「${name}」已放进零件盘 · 双击零件盘看它该在哪`, 'ok', 2800);
}

function bindChip(chip) {
  const id = chip.dataset.chip;
  const name = PART_BY_ID[id].name;
  let timer = 0, downX = 0, downY = 0;

  const move = ev => {
    if (state.mode === 'build') highlightGhost(ghostAt(ev.clientX, ev.clientY));
  };
  const up = ev => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    const dragged = Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY) > 12;
    if (dragged && state.mode === 'build') { tryPlace(ev.clientX, ev.clientY); return; }
    highlightGhost(null);

    const now = performance.now();
    const dbl = lastChipTap.id === id && now - lastChipTap.t < 460;
    lastChipTap = { id, t: now };
    if (dbl) {
      // 双击零件盘：在模型上标出它的位置
      clearTimeout(timer);
      state.carrying = null;
      renderTray();
      showLocation(id);
      return;
    }
    if (state.mode === 'build') {
      state.carrying = id;
      renderTray();
      toast(`已拿起「${name}」，点身体上的蓝色空位放下`, 'info', 2400);
      return;
    }
    // 探索模式：单击零件盘 → 装回（等一拍，双击时不装）
    timer = setTimeout(() => {
      install(id, false);
      selectPart(id);
      toast(`已装回：${name}`, 'ok', 1800);
    }, TAP_DELAY);
  };

  chip.addEventListener('pointerdown', e => {
    if (e.button !== 0 || chip.disabled) return;
    e.preventDefault();
    downX = e.clientX; downY = e.clientY;
    if (state.mode === 'build') {
      state.carrying = id;
      chip.classList.add('carrying');
      toast(`已拿起「${name}」，拖到身体上的空位或直接点空位`, 'info', 2400);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  });
}

// 点击画布
canvas.addEventListener('pointerdown', e => {
  downPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', e => {
  if (!downPos) return;
  const moved = Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y);
  downPos = null;
  if (film.active || studio.active) return;
  if (moved > 8) return;
  // 生理动画进行时不做拆装拾取，避免把讲解面板挤掉
  if (state.physio) return;
  if (state.mode === 'build' && state.carrying) {
    const rec = ghostAt(e.clientX, e.clientY);
    if (rec) { tryPlace(e.clientX, e.clientY); return; }
    toast('先看看蓝色空位的形状轮廓，再放上去', 'info', 2200);
    return;
  }
  const id = pickAt(e.clientX, e.clientY);
  if (!id) {
    if (state.mode === 'build') toast('单击身体上的形状可拆下，双击可放进零件盘', 'info', 2200);
    return;
  }
  const loose = state.loose.has(id) && !state.removed.has(id);
  queueTap(id, loose ? 'loose' : 'body');
});

// 悬停提示
canvas.addEventListener('pointermove', e => {
  if (film.active || studio.active || cam.dragging || state.physio) { hideTooltip(); return; }
  if (state.mode === 'build' && state.carrying) {
    highlightGhost(ghostAt(e.clientX, e.clientY));
    hideTooltip();
    return;
  }
  const id = pickAt(e.clientX, e.clientY);
  if (id !== hoverId) {
    hoverId = id;
    canvas.style.cursor = id ? 'pointer' : 'grab';
  }
  if (id) {
    const p = PART_BY_ID[id];
    const loose = state.loose.has(id) && !state.removed.has(id);
    showTooltip(`${p.name} · ${loose ? '单击装回' : '单击拆下'} / 双击进零件盘`, e.clientX, e.clientY);
  } else hideTooltip();
});
canvas.addEventListener('pointerleave', () => { hoverId = null; hideTooltip(); });

/* ---------------- 提示与音效 ---------------- */
let toastTimer = 0;
function toast(msg, kind = 'info', dur = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, dur);
}

function showTooltip(text, x, y) {
  const el = $('tooltip');
  el.textContent = text;
  el.classList.add('show');
  el.style.left = `${x + 14}px`;
  el.style.top = `${y - 34}px`;
}
function hideTooltip() { $('tooltip').classList.remove('show'); }

let audio = null;
function playSound(kind) {
  if (!state.sound) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = { select: [440, 0.05], detach: [220, 0.12], install: [520, 0.14], correct: [660, 0.18], wrong: [180, 0.2] };
    const [f, d] = freqs[kind] || [440, 0.08];
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = kind === 'wrong' ? 'sawtooth' : 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.07, audio.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + d);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + d + 0.02);
  } catch { /* 忽略音频异常 */ }
}

/* ---------------- 生理动画 ---------------- */
let physio = null;
let physioPanelMode = null;

// 看不同过程时的取景：血液/消化要贴近躯干，神经/呼吸看全身。
// world: true 表示已经是世界坐标，不再乘人体缩放。
const PHYSIO_FOCUS = {
  circulation: { y: 1.22, dist: 8.6, phi: 1.12 },
  digestion: { y: 1.06, dist: 7.6, phi: 1.18 },
  neural: { y: 4.2, dist: 12.5, phi: 1.16, theta: -1.35, world: true },
  breath: { y: 1.32, dist: 8.4, phi: 1.12 },
  immune: { y: 0.95, dist: 9.4, phi: 1.16 },
  lymphatic: { y: 1.0, dist: 9.6, phi: 1.16 },
  endocrine: { y: 1.18, dist: 8.8, phi: 1.14 },
  motion: { y: 4.2, dist: 12.5, phi: 1.14, theta: -1.55, world: true },
  // 补完的 5 套：肾与膀胱看中下腹、吞咽发声与视觉听觉看头颈、
  // 运动响应与损伤修复要看全身（含四肢）。
  urinary: { y: 1.15, dist: 9.6, phi: 1.16, theta: -0.55 },
  swallow: { y: 1.42, dist: 7.4, phi: 1.22, theta: -0.60 },
  exertion: { y: 4.2, dist: 12.5, phi: 1.14, theta: -1.50, world: true },
  repair: { y: 1.08, dist: 10.8, phi: 1.16, theta: -0.62 },
  senses: { y: 1.60, dist: 6.6, phi: 1.24, theta: -0.78 },
};

function physioChips() {
  const wrap = $('physioModes');
  wrap.innerHTML = PHYSIO.map(m => `
    <button class="pb-chip ${state.physio === m.id ? 'active' : ''}" data-physio="${m.id}" style="--accent:${m.color}" aria-pressed="${state.physio === m.id}">
      <i></i><b>${m.name}</b><em>${m.tag}</em>
    </button>`).join('');
  wrap.querySelectorAll('.pb-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.physio;
      if (state.physio === id) closePhysio({ keepDock: true });
      else openPhysio(id);
    });
  });
  // 13 套排不下，渲染后把当前套滚到可视中间，避免"以为只有前几套"
  const active = wrap.querySelector('.pb-chip.active');
  if (active) {
    const ar = active.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    wrap.scrollBy({ left: (ar.left - wr.left) - (wr.width - ar.width) / 2, behavior: 'smooth' });
  }
}

// 桌面端补两个翻页按钮；窄屏直接横向滑动
const scrollChips = dir => $('physioModes').scrollBy({ left: dir * 240, behavior: 'smooth' });
$('physioScrollL').addEventListener('click', () => scrollChips(-1));
$('physioScrollR').addEventListener('click', () => scrollChips(1));

function renderPhysioChrome() {
  const on = !!state.physio;
  $('app').dataset.physio = on ? 'on' : 'off';
  $('app').dataset.dock = state.physioDock ? 'on' : 'off';
  $('btnPhysio').classList.toggle('on', state.physioDock || on);
  $('btnPhysio').setAttribute('aria-pressed', String(on));
  $('physioBar').classList.toggle('show', state.physioDock || on);
  $('physioPlay').textContent = state.physioPlaying ? '暂停' : '继续';
  $('physioPlay').classList.toggle('paused', !state.physioPlaying);
  $('physioSpeed').textContent = `${state.physioSpeed}×`;
  physioChips();
}

function renderPhysioPanel(force) {
  const panel = $('physioPanel');
  const rp = document.querySelector('.right-panel');
  if (!state.physio) {
    panel.innerHTML = '';
    panel.classList.remove('show');
    rp.classList.remove('physio-open');
    physioPanelMode = null;
    return;
  }
  const m = PHYSIO_BY_ID[state.physio];
  if (force || physioPanelMode !== m.id) {
    physioPanelMode = m.id;
    panel.innerHTML = `
      <div class="pp-head" style="--accent:${m.color}">
        <div class="pp-top">
          <span class="sys-chip">${m.name} · ${m.en}</span>
          <button class="card-close" data-physio-close aria-label="退出动画">✕</button>
        </div>
        <h2>${m.name}<em>${m.tag}</em></h2>
        <p class="pp-intro">${m.intro}</p>
        <div class="pp-bar"><span id="physioFill"></span></div>
      </div>
      <ol class="pp-steps">
        ${m.steps.map((s, i) => `<li data-step="${i}"><b><i>${i + 1}</i>${s.title}</b><p>${s.detail}</p></li>`).join('')}
      </ol>
      <div class="pp-tip"><b>💚 守护提示</b><p>${m.tip}</p></div>
      <div class="pp-foot"><button class="btn subtle" data-physio-close>退出动画</button></div>`;
    panel.querySelectorAll('[data-physio-close]').forEach(b => {
      b.addEventListener('click', () => closePhysio({ keepDock: true }));
    });
  }
  panel.classList.add('show');
  rp.classList.add('physio-open');
  markPhysioStep(physio ? physio.step : 0);
}

function markPhysioStep(idx) {
  const panel = $('physioPanel');
  if (!panel || idx == null) return;
  panel.querySelectorAll('.pp-steps li').forEach((li, i) => {
    li.classList.toggle('active', i === idx);
    li.classList.toggle('done', i < idx);
  });
  const active = panel.querySelector('.pp-steps li.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function focusCamera(id) {
  const f = PHYSIO_FOCUS[id];
  if (!f) return;
  const s = bodyMeta.scale || 1;
  const y = f.world ? f.y : f.y * s;
  cam.flyTo(f.theta != null ? f.theta : cam.theta, f.phi, f.dist, new THREE.Vector3(0, y, 0));
}

function restoreCamera() {
  const compact = window.innerWidth <= 900;
  cam.flyTo(-0.42, 1.19, compact ? 17 : 13.2, new THREE.Vector3(0, compact ? 3.7 : 4.2, 0));
}

function openPhysio(id) {
  const m = PHYSIO_BY_ID[id];
  if (!m) return;
  const dockWasOpen = state.physioDock;
  if (state.mode === 'build') setMode('explore');
  state.physio = id;
  state.physioDock = true;
  state.physioPlaying = true;
  state.selected = null;
  state.carrying = null;
  clearHighlight();
  if (physio) {
    physio.setMode(id);
    physio.setPlaying(true);
    physio.setSpeed(state.physioSpeed);
  }
  applyLayers();
  renderPhysioChrome();
  renderPhysioPanel(true);
  focusCamera(id);
  cinema.enter(id);
  playSound('install');
  renderCard();
  if (!dockWasOpen) navPush('dock');
  navPush('physio');
}

function closePhysio({ keepDock = false } = {}) {
  state.physio = null;
  state.physioPlaying = true;
  if (!keepDock) state.physioDock = false;
  if (physio) physio.setMode(null);
  cinema.exit();
  applyVisibility();       // 把动画改过的缩放 / 位置还原
  renderPhysioChrome();
  renderPhysioPanel(true);
  renderCard();
  restoreCamera();
}

/* ---------------- 系统挑战 ---------------- */
function openQuiz(systemId) {
  const sys = SYSTEM_BY_ID[systemId];
  if (learnedCount(systemId) < partsOf(systemId).length) {
    toast(`先把「${sys.name}」的 ${partsOf(systemId).length} 个形状都点开读一遍`, 'warn', 3000);
    return;
  }
  const modal = $('quizModal');
  const quiz = sys.quiz;
  modal.innerHTML = `
    <div class="modal-card quiz-card" style="--accent:${sys.color}">
      <button class="modal-x" data-close="quiz">✕</button>
      <span class="sys-chip">${sys.name} · 系统挑战</span>
      <h2>把结构变成身体的记忆</h2>
      <p class="quiz-sub">3 道题，答对 2 道即可获得「${sys.name}」徽章。</p>
      <form id="quizForm">
        ${quiz.map((q, i) => `
          <div class="quiz-q" data-q="${i}">
            <b>${i + 1}. ${q.q}</b>
            <div class="opts">
              ${q.options.map((op, j) => `<label><input type="radio" name="q${i}" value="${j}"><span>${op}</span></label>`).join('')}
            </div>
            <p class="why">${q.why}</p>
          </div>`).join('')}
        <div class="quiz-actions">
          <button type="submit" class="btn primary">提交答案</button>
          <button type="button" class="btn subtle" data-close="quiz">稍后再做</button>
        </div>
      </form>
      <div class="quiz-result" id="quizResult"></div>
    </div>`;
  modal.classList.add('show');
  navPush('quiz');
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.classList.remove('show')));
  const form = modal.querySelector('#quizForm');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    let right = 0;
    quiz.forEach((q, i) => {
      const sel = form.querySelector(`input[name="q${i}"]:checked`);
      const wrap = form.querySelector(`.quiz-q[data-q="${i}"]`);
      wrap.classList.remove('right', 'wrong');
      if (!sel) return;
      const ok = Number(sel.value) === q.a;
      wrap.classList.add(ok ? 'right' : 'wrong');
      wrap.querySelectorAll('label').forEach(l => {
        const v = Number(l.querySelector('input').value);
        l.classList.toggle('correct', v === q.a);
        l.classList.toggle('bad', v === Number(sel.value) && !ok);
      });
      if (ok) right++;
    });
    const pass = right >= 2;
    if (pass) {
      state.badges.add(systemId);
      persist();
      renderSystemTabs();
      renderStats();
      renderCard();
      playSound('correct');
    } else {
      playSound('wrong');
    }
    const out = modal.querySelector('#quizResult');
    out.className = `quiz-result show ${pass ? 'pass' : 'fail'}`;
    out.innerHTML = pass
      ? `<b>答对 ${right}/3，获得「${sys.name}」徽章 ★</b>
         <p>${sys.tips[0]}</p>
         <p>${sys.tips[1]}</p>
         <p>${sys.tips[2]}</p>`
      : `<b>答对 ${right}/3，还差一点</b><p>看看上面标绿的正确答案，再试一次。</p>
         <button class="btn subtle" id="quizRetry">再试一次</button>`;
    const retry = out.querySelector('#quizRetry');
    if (retry) retry.addEventListener('click', () => openQuiz(systemId));
  });
}

/* ---------------- 结局面板 / 帮助 / 重置 ---------------- */
function toggleHelp(show) {
  $('helpModal').classList.toggle('show', show);
}

function resetAll() {
  const p = currentProfile();
  if (!confirm(`清空「${p.name}」的学习与拆装进度，从头开始？其它档案不受影响。`)) return;
  clearCurrentSave();
  location.reload();
}

/* ---------------- 事件绑定 ---------------- */
document.querySelectorAll('.mode-btn').forEach(b => {
  b.addEventListener('click', () => setMode(b.dataset.mode));
});
$('cardPanel').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = state.selected;
  if (action === 'close') { state.selected = null; clearHighlight(); renderCard(); return; }
  if (!id) return;
  if (action === 'detach') { detachLoose(id); selectPart(id); }
  if (action === 'tray') { detachToTray(id); selectPart(id); }
  if (action === 'install') { install(id); selectPart(id); }
  if (action === 'pick') {
    state.carrying = id;
    renderTray();
    toast(`已拿起「${PART_BY_ID[id].name}」，拖到身体空位上`, 'info', 2600);
  }
  if (action === 'quiz') openQuiz(PART_BY_ID[id].system);
});
$('btnSound').addEventListener('click', () => {
  state.sound = !state.sound;
  persist();
  $('btnSound').classList.toggle('off', !state.sound);
  $('btnSound').setAttribute('aria-pressed', String(state.sound));
  toast(state.sound ? '音效已打开' : '音效已关闭', 'info', 1400);
});
$('btnHelp').addEventListener('click', () => { toggleHelp(true); navPush('help'); });
$('btnFilm').addEventListener('click', () => {
  if (film.active) film.stop();
  else {
    if (state.physio) closePhysio();
    film.start();
    navPush('film');
    toast('影片模式：Esc 退出 · 空格暂停 · → 下一章', 'info', 3200);
  }
  syncFilmBtn();
});

/* ---------------- 视频工坊 ---------------- */
const studioBtn = $('btnStudio');
const studioPanel = $('studioPanel');
let studioStyle = 'noir', studioSubject = 'heart', studioFormat = 'v', studioDur = 12;
const SUBJECT_KEYS = Object.keys(studio.subjects);

function studioOpen() {
  if (film.active) { film.stop(); syncFilmBtn(); }
  if (state.physio) closePhysio();
  if (state.mode === 'build') setMode('explore');
  state.selected = null;
  state.carrying = null;
  state.loose.clear();
  clearHighlight();
  applyVisibility();
  studio.enter(studioStyle, studioSubject);
  document.getElementById('app').classList.add('studioing');
  studioBtn.classList.add('on');
  studioBtn.setAttribute('aria-pressed', 'true');
  studioPanel.hidden = false;
  $('studioCtl').hidden = false;
  studioCtlSig = '';
  studioMarkSig = '';
  syncStudioCtl();
  resetRecButtons();
  const mime = studio.mimeInfo;
  $('studioMime').textContent = studio.isCase
    ? `病理课堂：自动录制整段 ${Math.round(studio.caseDuration)} 秒讲解（字幕会一起进视频）`
    : (mime
      ? `输出格式：${mime.startsWith('video/mp4') ? 'MP4 (H.264)' : 'WebM'} · 直接发抖音/视频号`
      : '当前浏览器不支持录制，请用 Edge 或 Chrome');
  if (studio.isCase) { renderClinicStages(); syncClinic(); }
  clinicSetPanel(clinicVisible);
  navPush('studio');
}

function studioClose() {
  studio.exit();
  document.getElementById('app').classList.remove('studioing');
  studioBtn.classList.remove('on');
  studioBtn.setAttribute('aria-pressed', 'false');
  studioPanel.hidden = true;
  $('studioCtl').hidden = true;
  $('studioRecUI').hidden = true;
  clinicPanel.hidden = true;
  clinicBtn.classList.remove('on');
  clinicBtn.setAttribute('aria-pressed', 'false');
  applyLayers();
  applyVisibility();
}

/* ---------------- 病理课堂：病例选择 / 逐幕讲解 / 快捷键 ----------------
 * 画面里的字幕由 studio.renderOverlay 直接画进 WebGL canvas（也会进导出视频），
 * 这里这层 DOM 只负责「看得更细」：点幕跳转、展开说明、预防/注意/急救清单。
 */
const clinicBtn = $('btnClinic');
const clinicPanel = $('clinicPanel');
let clinicVisible = true;
let clinicSig = '';
const isCaseKey = k => !!(studio.subjects[k] && studio.subjects[k].case);

function fillList(id, arr) {
  const w = $(id);
  w.innerHTML = '';
  for (const x of (arr || [])) {
    const li = document.createElement('li');
    li.textContent = x;
    w.appendChild(li);
  }
}

function renderClinicStages() {
  const info = studio.caseInfo;
  if (!info) return;
  $('cpName').textContent = info.name;
  $('cpSite').textContent = `${info.cat} · ${info.site}`;
  const w = $('clinicStages');
  w.innerHTML = '';
  info.stages.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'cp-stage';
    b.dataset.stage = String(i);
    b.title = s.kicker;
    b.innerHTML = `<i>${String(i + 1).padStart(2, '0')}</i><span>${s.title}</span>`;
    w.appendChild(b);
  });
  fillList('cpPrevent', info.prevent);
  fillList('cpCaution', info.caution);
  fillList('cpEmergency', info.emergency);
  clinicSig = '';
}

function syncClinic() {
  if (!studio.active || !studio.isCase) return;
  const st = studio.caseStage;
  if (!st) return;
  const sig = `${studio.subjectKey}|${st.index}|${studio.view.paused}`;
  if (sig === clinicSig) return;
  clinicSig = sig;
  $('cpStageNum').textContent = `${st.number} / ${st.count}　${String(st.stage.kicker).replace(/^\d+\s*·\s*/, '')}`;
  $('cpStageTitle').textContent = st.stage.title;
  $('cpDetail').textContent = st.stage.detail || '';
  fillList('cpLines', st.stage.lines);
  $('clinicStages').querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', +b.dataset.stage === st.index));
  $('clinicPlay').textContent = studio.view.paused ? '▶ 继续' : '⏸ 暂停';
  $('clinicPlay').classList.toggle('on', studio.view.paused);
}

function clinicSetPanel(on) {
  clinicVisible = !!on;
  const show = clinicVisible && studio.active && studio.isCase;
  clinicPanel.hidden = !show;
  clinicBtn.classList.toggle('on', show);
  clinicBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
  // 病理课堂把左侧工坊面板和底部控制条收起来，避免 DOM 压住画面里的字幕卡；
  // 操作集中到讲解面板，拖动/滚轮/空格/1–6 等快捷键仍然有效
  if (studio.active) {
    const caseOn = studio.isCase;
    studioPanel.hidden = caseOn || studio.recording;
    $('studioCtl').hidden = caseOn;
    $('clinicCases').querySelectorAll('button').forEach(b =>
      b.classList.toggle('on', b.dataset.subject === studioSubject));
  }
}

function resetRecButtons() {
  const rb = $('studioRec');
  rb.textContent = '● 开始录制';
  rb.classList.remove('rec');
  const cr = $('clinicRec');
  cr.textContent = '● 录制整段讲解';
  cr.classList.remove('rec');
}

function startStudioRec() {
  if (studio.recording) { studio.stopRecording(false); return; }
  const okRec = studio.startRecording(studioDur, studioFormat);
  if (!okRec) { toast('录制失败：请换 Edge 或 Chrome 浏览器', 'warn', 3200); return; }
  studioPanel.hidden = true;
  if (studio.isCase) clinicPanel.hidden = true;
  $('studioRecUI').hidden = false;
  const recSec = studio.isCase ? studio.caseDuration : studioDur;
  const shape = studioFormat === 'v' ? '竖屏 1080×1920' : '横屏 16:9';
  toast(studio.isCase
    ? `开始录制整段讲解 ${Math.round(recSec)} 秒（${shape}）：字幕与部位定位图会一起进视频`
    : `开始录制 ${recSec} 秒（${shape}），画面会自动缩小——这是正常的`, 'info', 3400);
  const rb = $('studioRec');
  rb.textContent = '■ 停止录制';
  rb.classList.add('rec');
  const cr = $('clinicRec');
  cr.textContent = '■ 停止录制';
  cr.classList.add('rec');
}

function clinicSeek(idx) {
  if (!studio.isCase || !studio.caseInfo) return;
  const n = studio.caseInfo.stages.length;
  const i = ((idx % n) + n) % n;
  studio.seek(i * (studio.caseDuration / n) + 0.08);
  syncClinic();
}

function openClinic() {
  if (!studio.active) {
    selectSubject('caseCarotid');
    studioOpen();
  } else if (!isCaseKey(studioSubject)) {
    selectSubject('caseCarotid');
  } else if (clinicVisible && !clinicPanel.hidden) {
    clinicSetPanel(false);
    return;
  }
  clinicSetPanel(true);
  renderClinicStages();
  syncClinic();
  toast('病理课堂 · 5 幕讲清位置 / 原理 / 处置 / 预防，, . 翻幕', 'info', 3200);
}

clinicBtn.addEventListener('click', openClinic);
$('clinicClose').addEventListener('click', () => clinicSetPanel(false));
$('clinicStages').addEventListener('click', e => {
  const b = e.target.closest('button[data-stage]');
  if (b) { clinicSeek(+b.dataset.stage); b.blur(); }
});
$('clinicPrev').addEventListener('click', () => {
  const st = studio.caseStage; if (st) clinicSeek(st.index - 1);
});
$('clinicNext').addEventListener('click', () => {
  const st = studio.caseStage; if (st) clinicSeek(st.index + 1);
});
$('clinicPlay').addEventListener('click', () => {
  studio.togglePaused();
  syncStudioCtl();
  syncClinic();
});

studioBtn.addEventListener('click', () => {
  if (studio.active) studioClose();
  else studioOpen();
});
$('studioClose').addEventListener('click', studioClose);

// Esc 收起弹层：主题 / 档案 / 赞赏 / 帮助 / 系统挑战，再是工坊。
// 影片模式在 film.js 里有自己的 Esc 退出逻辑，这里刻意不碰，避免 stop() 被调两次。
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('themePanel').hidden) { closeThemePanel(); return; }
  if (!$('profilePanel').hidden) { closeProfilePanel(); return; }
  if ($('tipModal').classList.contains('show')) { closeTipModal(); return; }
  if ($('helpModal').classList.contains('show')) { toggleHelp(false); return; }
  if ($('quizModal').classList.contains('show')) { $('quizModal').classList.remove('show'); return; }
  if (studio.active && !studio.recording) studioClose();
});

/* ---------------- 浏览返回：视图栈 + 浏览器历史 ----------------
 * 打开一个主视图（帮助 / 系统挑战 / 主题 / 影片 / 工坊 / 生理动画 / 动画条）时压一条
 * 浏览器历史；按浏览器「← 后退」逐层关闭视图，全部关完再后退才真正离开页面。
 * 界面上的 ✕、"收起"等按钮关闭视图后，对应历史记录会变成"空退一步"——无害。
 * 单文件 file:// 打开时 pushState 可能被浏览器拒绝（origin 为 null），
 * 自动降级为纯内部栈：画面左下角的 ‹ 返回 按钮仍然逐层可用。
 */
const navStack = [];
let navHistOK = true;
function navPush(view) {
  navStack.push(view);
  if (!navHistOK) return;
  try { history.pushState({ hb: view }, '', location.href); }
  catch { navHistOK = false; }   // file:// 等环境：降级，只记内部栈
}
const navIsOpen = {
  quiz:   () => $('quizModal').classList.contains('show'),
  help:   () => $('helpModal').classList.contains('show'),
  theme:  () => !$('themePanel').hidden,
  profile: () => !$('profilePanel').hidden,
  tip:    () => $('tipModal').classList.contains('show'),
  film:   () => film.active,
  studio: () => studio.active,
  physio: () => !!state.physio,
  dock:   () => state.physioDock,
};
function navClose(id) {
  switch (id) {
    case 'quiz':   $('quizModal').classList.remove('show'); break;
    case 'help':   if (navIsOpen.help()) toggleHelp(false); break;
    case 'theme':  closeThemePanel(); break;
    case 'profile': closeProfilePanel(); break;
    case 'tip':    closeTipModal(); break;
    case 'film':   if (film.active) { film.stop(); syncFilmBtn(); } break;
    case 'studio': if (studio.active && !studio.recording) studioClose(); break;
    case 'physio': if (state.physio) closePhysio({ keepDock: true }); break;
    case 'dock':   if (state.physioDock) { state.physioDock = false; renderPhysioChrome(); } break;
  }
}
const NAV_ORDER = ['tip', 'profile', 'quiz', 'help', 'theme', 'film', 'studio', 'physio', 'dock'];
function navAnyOpen() { return NAV_ORDER.some(id => navIsOpen[id]()); }
function closeTopView() {
  for (const id of NAV_ORDER) {
    if (navIsOpen[id]()) { navClose(id); return id; }
  }
  return null;
}
window.addEventListener('popstate', () => {
  // 浏览器后退：弹一层。栈顶视图已被界面按钮关掉时，这一下只消耗多余的历史记录
  const top = navStack.pop();
  if (top) navClose(top);
});

/* 画面左下角的返回按钮：有视图打开就退一层；都没有就按浏览器习惯返回上一页 */
$('backBtn').addEventListener('click', () => {
  if (closeTopView()) return;
  if (history.length > 1) history.back();
  else toast('已经在起始页了', 'info', 1600);
});
let backBtnSig = '';
function syncBackBtn() {
  // 录制中隐藏，避免误触；其余时间常驻：没打开任何视图时就是「返回上一页」
  const show = !studio.recording;
  if (show !== backBtnSig) {
    backBtnSig = show;
    $('backBtn').hidden = !show;
  }
}

/* ---- 工坊交互控制：暂停 / 自动环绕 / 速度 / 缩放 / 复位 / 定机位 / 书签 ---- */
let studioCtlSig = '';
let studioMarkSig = '';
const SPEEDS = [0.5, 1, 1.5, 2];

/* 定机位按钮只生成一次；书签列表按内容签名增量重绘，避免每帧刷 DOM */
function renderStudioPresets() {
  const w = $('studioPresets');
  w.innerHTML = '';
  for (const p of studio.presets) {
    const b = document.createElement('button');
    b.className = 'sc-chip';
    b.dataset.mark = `preset:${p.id}`;
    b.title = `切到「${p.name}」机位（快捷键 ${p.key}）`;
    b.innerHTML = `<i>${p.key}</i>${p.name}`;
    w.appendChild(b);
  }
}
function renderStudioMarks() {
  const w = $('studioMarks');
  const list = studio.bookmarks;
  const act = studio.activeMark;
  w.innerHTML = '';
  if (!list.length) {
    const e = document.createElement('span');
    e.className = 'sc-empty';
    e.textContent = '暂无，调好机位点「＋ 存书签」';
    w.appendChild(e);
    return;
  }
  for (const m of list) {
    const b = document.createElement('button');
    b.className = 'sc-chip sc-user' + (m.id === act ? ' on' : '');
    b.dataset.mark = m.id;
    b.title = `${m.subjectName || m.subject || '机位'} · 双击重命名`;
    b.textContent = m.name;
    w.appendChild(b);
  }
}
renderStudioPresets();
renderStudioMarks();

$('studioPresets').addEventListener('click', e => {
  const b = e.target.closest('button[data-mark]');
  if (!b) return;
  studio.applyPreset(b.dataset.mark.slice(7));
  syncStudioCtl();
  b.blur();
});
$('studioMarks').addEventListener('click', e => {
  const b = e.target.closest('button[data-mark]');
  if (!b) return;
  studio.applyBookmark(b.dataset.mark);
  syncStudioCtl();
  b.blur();
});
$('studioMarks').addEventListener('dblclick', e => {
  const b = e.target.closest('button[data-mark]');
  if (!b) return;
  const m = studio.bookmarks.find(x => x.id === b.dataset.mark);
  if (!m) return;
  const name = window.prompt('重命名机位书签', m.name);
  if (name !== null && name.trim()) studio.renameBookmark(m.id, name.trim());
  syncStudioCtl();
});

function syncStudioCtl() {
  const v = studio.view;
  const sig = `${v.paused}|${v.autoOrbit}|${v.speed}|${v.zoom.toFixed(2)}|${v.mark}`;
  if (sig !== studioCtlSig) {
    studioCtlSig = sig;
    const play = $('studioPlay'), orbit = $('studioOrbit');
    play.textContent = v.paused ? '▶ 继续' : '⏸ 暂停';
    play.classList.toggle('on', v.paused);
    orbit.textContent = v.autoOrbit ? '⟳ 自动环绕' : '⏹ 环绕已停';
    orbit.classList.toggle('on', v.autoOrbit);
    $('studioSpeed').textContent = `${v.speed}×`;
    $('studioZoomVal').textContent = `×${v.zoom.toFixed(2)}`;
    document.querySelectorAll('#studioPresets .sc-chip').forEach(b =>
      b.classList.toggle('on', b.dataset.mark === v.mark));
  }
  const ms = studio.markSignature;
  if (ms !== studioMarkSig) {
    studioMarkSig = ms;
    renderStudioMarks();
  }
}
const ctlClick = (id, fn) => $(id).addEventListener('click', e => { fn(); syncStudioCtl(); e.currentTarget.blur(); });
ctlClick('studioPlay', () => studio.togglePaused());
ctlClick('studioOrbit', () => studio.setAutoOrbit(!studio.view.autoOrbit));
ctlClick('studioSpeed', () => {
  const i = SPEEDS.indexOf(studio.view.speed);
  studio.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
});
ctlClick('studioZoomIn', () => studio.zoomBy(1.22));
ctlClick('studioZoomOut', () => studio.zoomBy(1 / 1.22));
ctlClick('studioReset', () => studio.resetView());

function studioSaveMark() {
  const input = $('studioMarkName');
  const m = studio.saveBookmark(input.value);
  input.value = '';
  toast(`已保存机位书签「${m.name}」`, 'ok', 1800);
}
function studioDeleteMark() {
  const id = studio.activeMark;
  if (!id || !id.startsWith('m')) { toast('先点选一个书签，再点 ✕ 删除', 'info', 1800); return; }
  studio.deleteBookmark(id);
  toast('书签已删除', 'info', 1500);
}
ctlClick('studioMarkSave', studioSaveMark);
ctlClick('studioMarkDel', studioDeleteMark);
$('studioMarkName').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    studioSaveMark();
    syncStudioCtl();
    e.currentTarget.blur();
  }
});

window.addEventListener('keydown', e => {
  if (!studio.active) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return;
  const k = e.key;
  if (e.code === 'Space') { e.preventDefault(); studio.togglePaused(); }
  else if (k === 'o' || k === 'O') studio.setAutoOrbit(!studio.view.autoOrbit);
  else if (k === 'r' || k === 'R') studio.resetView();
  else if (k === '+' || k === '=') studio.zoomBy(1.18);
  else if (k === '-' || k === '_') studio.zoomBy(1 / 1.18);
  else if (k === 'ArrowLeft') { e.preventDefault(); studio.rotateBy(0.12, 0); }
  else if (k === 'ArrowRight') { e.preventDefault(); studio.rotateBy(-0.12, 0); }
  else if (k === 'ArrowUp') { e.preventDefault(); studio.rotateBy(0, -0.09); }
  else if (k === 'ArrowDown') { e.preventDefault(); studio.rotateBy(0, 0.09); }
  else if (/^[1-6]$/.test(k)) {
    const p = studio.presets[+k - 1];
    if (p) studio.applyPreset(p.id);
  }
  else if (k === 'b' || k === 'B') studioSaveMark();
  else if (k === '[') studio.cycleBookmark(-1);
  else if (k === ']') studio.cycleBookmark(1);
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); studioDeleteMark(); }
  else if (studio.isCase && (k === ',' || k === '<')) {
    const st = studio.caseStage; if (st) clinicSeek(st.index - 1);
  }
  else if (studio.isCase && (k === '.' || k === '>')) {
    const st = studio.caseStage; if (st) clinicSeek(st.index + 1);
  }
  else if (studio.isCase && (k === 'c' || k === 'C')) clinicSetPanel(!clinicVisible);
  else return;
  syncStudioCtl();
});

const bindStudioOpts = (id, cb) => {
  const w = $(id);
  w.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    w.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    cb(b.dataset);
  });
};
bindStudioOpts('studioStyle', d => { studioStyle = d.style; if (studio.active) studio.enter(studioStyle, studioSubject); });

// 主体按钮分三组（器官 / 骨骼 / 整体），选中态跨组互斥
const subjectGroups = ['studioSubject', 'studioBone', 'studioWhole', 'studioLink', 'studioSystem', 'studioCase'];
const selectSubject = key => {
  if (!SUBJECT_KEYS.includes(key)) return;
  studioSubject = key;
  subjectGroups.forEach(id => {
    const w = $(id);
    if (!w) return;
    w.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.subject === key));
  });
  if (studio.active) {
    studio.enter(studioStyle, studioSubject);
    if (studio.isCase) {
      renderClinicStages();
      syncClinic();
      clinicSetPanel(clinicVisible);
    } else {
      clinicPanel.hidden = true;
      clinicBtn.classList.remove('on');
      clinicBtn.setAttribute('aria-pressed', 'false');
      if (!studio.recording) {
        studioPanel.hidden = false;
        $('studioCtl').hidden = false;
      }
    }
  }
};
subjectGroups.forEach(id => {
  const w = $(id);
  if (!w) return;
  w.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) selectSubject(b.dataset.subject);
  });
});

bindStudioOpts('studioFormat', d => { studioFormat = d.format; });
bindStudioOpts('studioDur', d => { studioDur = +d.dur; });

$('studioRec').addEventListener('click', startStudioRec);
$('clinicRec').addEventListener('click', startStudioRec);
$('clinicSettings').addEventListener('click', () => { studioPanel.hidden = !studioPanel.hidden; });
$('clinicCases').addEventListener('click', e => {
  const b = e.target.closest('button[data-subject]');
  if (b) { selectSubject(b.dataset.subject); b.blur(); }
});
$('helpModal').addEventListener('click', e => {
  if (e.target.id === 'helpModal' || e.target.closest('[data-close]')) toggleHelp(false);
});
$('btnReset').addEventListener('click', resetAll);

$('btnPhysio').addEventListener('click', () => {
  if (state.physio) { closePhysio(); return; }
  state.physioDock = !state.physioDock;
  if (state.physioDock) navPush('dock');
  renderPhysioChrome();
  if (state.physioDock) toast('13 套生理动画已全部上线，左右滑动选择想看的过程', 'info', 3000);
});
$('physioPlay').addEventListener('click', () => {
  state.physioPlaying = !state.physioPlaying;
  if (physio) physio.setPlaying(state.physioPlaying);
  renderPhysioChrome();
});
$('physioSpeed').addEventListener('click', () => {
  const seq = [0.6, 1, 1.6];
  const i = seq.indexOf(state.physioSpeed);
  state.physioSpeed = seq[(i + 1) % seq.length];
  if (physio) physio.setSpeed(state.physioSpeed);
  renderPhysioChrome();
});
$('physioExit').addEventListener('click', () => {
  if (state.physio) closePhysio();
  else { state.physioDock = false; renderPhysioChrome(); }
});
$('trayReset').addEventListener('click', () => {
  const list = partsOf(state.system);
  if (!list.some(p => state.built.has(p.id))) { toast('这一层还没有装回去的形状', 'info', 1800); return; }
  list.forEach(p => state.built.delete(p.id));
  state.loose.clear();
  state.selected = null;
  state.carrying = null;
  persist();
  applyVisibility();
  renderTray();
  renderCard();
  renderStats();
  renderSystemTabs();
  toast(`「${SYSTEM_BY_ID[state.system].name}」已重新拆空，可以再来一次`, 'ok', 2400);
});
$('startBtn').addEventListener('click', () => {
  $('intro').classList.add('hide');
  setTimeout(() => $('intro').remove(), 700);
});

/* ---------------- 动画循环 ---------------- */
const clock = new THREE.Clock();
let elapsed = 0;
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  if (film.active) film.update(dt);   // 影片：先把机位目标写好，再由 cam.update 平滑落位
  cam.update(dt);
  film.post();                        // 手持微抖必须在 cam.update 之后叠加
  cinema.update(dt);   // 自动运镜 / 轮廓光：必须在 cam.update 之后，否则会被覆盖
  studio.update(dt, elapsed);         // 视频工坊接管相机：必须最后写，覆盖上面所有机位
  if (studio.active) syncStudioCtl(); // 滚轮/双指缩放后同步控制条读数
  if (studio.active && studio.isCase) syncClinic(); // 病理课堂幕次/讲解面板同步
  syncBackBtn();                        // 录制中隐藏返回按钮，避免误触

  // 生理动画（粒子流动 + 心跳 / 蠕动 / 呼吸形变）
  if (physio) physio.update(dt);
  if (state.physio) {
    const fill = $('physioFill');
    if (fill && physio) fill.style.width = `${(physio.phase * 100).toFixed(1)}%`;
  }

  // 部件动画
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i];
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    a.fn(k);
    if (k >= 1) { anims.splice(i, 1); a.done && a.done(); }
  }

  // 幽灵呼吸
  if (state.mode === 'build') {
    const pulse = 0.1 + 0.045 * (0.5 + 0.5 * Math.sin(elapsed * 2.2));
    records.forEach((r, id) => {
      if (r.part.system !== state.system || !r.ghost.visible) return;
      if (r.ghost.scale.x > 1.01) return; // 悬停态不覆盖
      r.ghostMats.forEach(m => { if (m.opacity < 0.25) m.opacity = pulse; });
    });
  }

  // 离体形状轻微浮动：和身上那块一眼区分开
  if (state.loose.size) {
    records.forEach((r, id) => {
      if (!state.loose.has(id) || r.busy || !r.loosePos || !r.group.visible) return;
      const ph = (id.charCodeAt(0) % 7) * 0.9;
      r.group.position.y = r.loosePos.y + Math.sin(elapsed * 1.5 + ph) * 0.022;
      r.group.rotation.y = 0.32 + Math.sin(elapsed * 0.75 + ph) * 0.16;
    });
  }

  halos.forEach((h, i) => { h.mesh.rotation.z += h.speed * dt; });
  dust.rotation.y += dt * 0.012;
  fill.intensity = 0.85 + Math.sin(elapsed * 1.4) * 0.15;

  postfx.render(dt);
  studio.renderOverlay();       // 病理课堂字幕叠在成片之上，随 canvas 一起录进视频
  requestAnimationFrame(tick);
}

let wasCompact = window.innerWidth <= 900;
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
  const nowCompact = window.innerWidth <= 900;
  if (nowCompact !== wasCompact) {
    wasCompact = nowCompact;
    cam.minDist = nowCompact ? 8 : 6.5;
    cam.flyTo(cam.theta, cam.phi, nowCompact ? 17 : 13.2,
      new THREE.Vector3(0, nowCompact ? 3.7 : 4.2, 0));
  }
}
window.addEventListener('resize', onResize);

/* 键盘操控 3D 场景：canvas 可聚焦，方向键旋转、+/- 缩放、0 复位。
   只在 canvas 自身聚焦时生效，不会与影片 / 视频工坊的全局快捷键冲突。 */
canvas.addEventListener('keydown', e => {
  if (!cam.enabled || state.film || studio.active) return;
  const step = e.shiftKey ? 0.26 : 0.11;
  let used = true;
  switch (e.key) {
    case 'ArrowLeft':  cam.nudge(step, 0); break;
    case 'ArrowRight': cam.nudge(-step, 0); break;
    case 'ArrowUp':    cam.nudge(0, -step * 0.7); break;
    case 'ArrowDown':  cam.nudge(0, step * 0.7); break;
    case '+': case '=': cam.nudge(0, 0, 1 / 1.14); break;
    case '-': case '_': cam.nudge(0, 0, 1.14); break;
    case '0': cam.flyTo(-0.75, 1.02, homeDist, homeTarget); break;
    default: used = false;
  }
  if (used) e.preventDefault();
});

// 版本号在 index.html 的 <meta name="app-version"> 里定义，帮助面板与验证脚本同源读取
const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content || '1.5.0';

// 调试钩子（仅本地排查用）
window.__HB_DEBUG = {
  version: APP_VERSION,
  booted: () => !!window.__HB_BOOTED,
  camera, cam, records, state, selectPart, setSystem, setMode, bodyMeta, scene,
  layerGroups, ghostGroups, pickAt, install, renderTray, applyVisibility,
  detach: detachToTray,          // 兼容旧验证脚本：detach = 放进零件盘
  detachLoose, detachToTray, showLocation, looseTarget, queueTap, onSingleTap, onDoubleTap,
  openPhysio, closePhysio, getPhysio: () => physio,
  film, postfx, cinema, studio,
  theme: { get: () => themeId, set: setTheme, list: THEMES, hooks: themeHooks },
  profiles: {
    list: listProfiles, current: currentProfile, saveKey: currentSaveKey,
    statOf, add: addProfile, rename: renameProfile, remove: removeProfile,
    switch: switchProfile, clear: clearCurrentSave, reset: resetProfileSystem,
  },
  tip: { open: openTipModal, close: closeTipModal },
  refine,
  T: { Box3: THREE.Box3, Vector3: THREE.Vector3, Mesh: THREE.Mesh, Raycaster: THREE.Raycaster,
       MeshBasicMaterial: THREE.MeshBasicMaterial, MeshNormalMaterial: THREE.MeshNormalMaterial },
};

/* ---------------- 启动：先载入解剖模型，再装配形状 ---------------- */
function setLoadProgress(text, pct) {
  const el = $('loader');
  if (!el) return;
  const tip = el.querySelector('.loader-text');
  const bar = el.querySelector('.loader-bar i');
  if (tip && text) tip.textContent = text;
  if (bar && pct != null) bar.style.width = `${Math.min(100, Math.round(pct * 100))}%`;
}

function hideLoader() {
  const el = $('loader');
  if (!el) return;
  el.classList.add('hide');
  setTimeout(() => el.remove(), 600);
}

async function boot() {
  $('app').dataset.mode = state.mode;
  $('btnSound').classList.toggle('off', !state.sound);
  setLoadProgress('正在载入真实解剖模型…', 0.02);

  let assetRes = null;
  try {
    assetRes = await loadBodyAssets({
      onProgress: (stage, k) => {
        if (stage === 'load') setLoadProgress(`载入骨骼·肌肉·内脏模型 ${Math.round(k * 100)}%`, 0.04 + k * 0.9);
        else if (stage === 'parse') setLoadProgress('解析模型并建立形状…', 0.97);
      },
    });
    setAssetParts(assetRes.parts);
    bodyRoot.scale.setScalar(assetRes.scale);
    bodyRoot.position.y = -assetRes.minY * assetRes.scale;
    console.info(`[人体积木] 已载入真实模型：${bodyMeta.stats.parts} 个形状 / ${bodyMeta.stats.triangles.toLocaleString()} 三角形，缩放 ${assetRes.scale.toFixed(2)}`);
  } catch (err) {
    console.warn('[人体积木] 解剖模型不可用，回退到程序化建模（功能完整，造型简化）：', err);
    setLoadProgress('模型不可用，使用简化造型…', 1);
  }

  buildRecords();
  buildAmbient(assetRes && assetRes.extras);
  physio = createPhysio({
    bodyRoot,
    records,
    onStep: (idx, phase, modeId) => { if (modeId === state.physio) markPhysioStep(idx); },
  });
  const more = $('physioMore');
  if (more) more.innerHTML = PHYSIO_MORE.map(t => `<span>${t}</span>`).join('');
  applyVisibility();
  renderSystemTabs();
  renderTray();
  renderTip();
  renderCard();
  renderStats();
  hideLoader();
  window.__HB_BOOTED = true;
  const verEl = $('appVersion');
  if (verEl) verEl.textContent = `v${APP_VERSION}`;

  // ?auto 直接进入场景（演示 / 截图用）
  if (new URLSearchParams(location.search).has('auto')) {
    const intro = $('intro');
    if (intro) intro.remove();
  }
  tick();
}

// 启动链任何一步抛错都不能让用户永远停在「正在载入」上
boot().catch(err => {
  console.error('[人体积木] 启动失败：', err);
  if (window.__HB_FAIL) {
    window.__HB_FAIL('载入时遇到了问题',
      `${String((err && err.message) || err || '')}。请刷新页面重试；若一直出现，可换用较新的浏览器或清理站点数据，学习进度保存在本机不会丢失。`);
  }
});