// studio.js — 视频工坊：X 光透视风渲染 + 浏览器内录制导出视频
//
// 对标抖音上流行的「人体完整结构动画」竖屏视频：
//   · A 风格：纯黑背景、银白半透明人体、心脏实体高亮、缓慢环绕
//   · B 风格：深蓝底、蓝色发光半透明骨骼
//
// 画面配方（这是「像不像」的关键）：
//   1. 环境层（皮肤/骨骼/肌肉/其它器官）→ 菲涅尔边缘光 + 加色混合的 X 光鬼影
//   2. 主体器官 → 保留原始解剖材质，染成解剖色，做成「实体」渲染并加自发光，
//      这样心是心、肺是肺，一眼能认，而不是一团看不出形状的亮线
//   3. 相机按主体真实包围盒自动取景（管你心脏 8cm 还是全身 170cm，都填满画面）
//
// 录制：canvas.captureStream + MediaRecorder（优先 MP4/H.264，回退 WebM），
// 竖屏时把画布切成 1080×1920 再录，导出即可直接发抖音。
import * as THREE from '../lib/three.module.js';
import { refine } from './surface.js';
import { createOrganMaterial, createOrganAnim, waveAmpFor } from './organ.js';
import { createLinkage } from './linkage.js';
import { createPathway } from './pathways.js';
import { createHeartVessels } from './heartvessels.js';
import { createCase, drawCaseHud, CASES } from './pathology.js';

// 主体 key → 组织类型（大肠沿用肠管的蠕动参数）
const KIND = { largeBowel: 'intestine' };

// 联动主体里每个器官自己的组织类型与解剖色
const ORGAN_KIND = {
  heart: 'heart', lungs: 'lungs', brain: 'brain', liver: 'liver',
  stomach: 'stomach', kidney: 'kidney', smallIntestine: 'intestine',
  largeIntestine: 'intestine', spleen: 'liver',
};
const ORGAN_TINT = {
  heart: 0x9c3a3c, lungs: 0xff8f8f, brain: 0xf27f98, liver: 0xd4644f,
  stomach: 0xe89a72, kidney: 0xe0707c, smallIntestine: 0xffab7a,
  largeIntestine: 0xe08a6a, spleen: 0xb05a6a,
};
// 器官专属细节模式（organ.js uDetail）
const DETAIL = { heart: 1, brain: 2, lungs: 3, liver: 4, stomach: 5, intestine: 6, kidney: 7 };

/* ---------------- 风格预设 ---------------- */
// layers：环境层的鬼影参数（不同风格 = 不同底色调）
// dim：有主体时环境层压低到多少，主体才跳出来
const STYLES = {
  noir: {
    name: 'X光黑银',
    bg: 0x000000,
    grade: { bloom: 1.75, exposure: 1.0, sat: 0.9, vignette: 0.64, grain: 0.03, ca: 0.0028,
             shadowTint: [0.008, 0.012, 0.028], highlightTint: [0.02, 0.018, 0.016] },
    layers: {
      daily:    { color: 0xc9d6ea, pow: 3.4, fill: 0.006, int: 0.85 },
      skeleton: { color: 0xe6eefb, pow: 2.7, fill: 0.014, int: 1.0 },
      muscle:   { color: 0x9db2d4, pow: 3.2, fill: 0.004, int: 0.5 },
      organ:    { color: 0x8fa6c8, pow: 3.2, fill: 0.004, int: 0.45 },
    },
    dim: { daily: 0.22, skeleton: 0.34, muscle: 0.10, organ: 0.06 },
  },
  scan: {
    name: '蓝光扫描',
    bg: 0x020a18,
    grade: { bloom: 1.7, exposure: 1.06, sat: 1.12, vignette: 0.6, grain: 0.026, ca: 0.0024,
             shadowTint: [0.0, 0.014, 0.05], highlightTint: [0.0, 0.028, 0.05] },
    layers: {
      daily:    { color: 0x2a6fd8, pow: 3.0, fill: 0.01, int: 0.7 },
      skeleton: { color: 0x66baff, pow: 2.5, fill: 0.018, int: 1.05 },
      muscle:   { color: 0x2e8fd0, pow: 3.0, fill: 0.006, int: 0.45 },
      organ:    { color: 0x3aa0e0, pow: 3.0, fill: 0.007, int: 0.5 },
    },
    dim: { daily: 0.24, skeleton: 0.36, muscle: 0.10, organ: 0.06 },
  },
  aurora: {
    name: '翡翠透视',
    bg: 0x01100c,
    grade: { bloom: 1.7, exposure: 1.04, sat: 1.05, vignette: 0.62, grain: 0.028, ca: 0.0024,
             shadowTint: [0.0, 0.022, 0.014], highlightTint: [0.0, 0.03, 0.02] },
    layers: {
      daily:    { color: 0x2fbf9a, pow: 3.1, fill: 0.008, int: 0.75 },
      skeleton: { color: 0x7ff0cf, pow: 2.6, fill: 0.018, int: 1.02 },
      muscle:   { color: 0x2a9a80, pow: 3.0, fill: 0.006, int: 0.45 },
      organ:    { color: 0x3ab89a, pow: 3.0, fill: 0.007, int: 0.5 },
    },
    dim: { daily: 0.22, skeleton: 0.34, muscle: 0.10, organ: 0.06 },
  },
};

/* ---------------- 主体预设 ---------------- */
// part：要实体高亮的形状 id；tint：解剖色（实体渲染时乘在原始材质上）
// az：初始机位方位角；orbit：整段环绕弧度；fov：垂直视场角
// 距离不写死——按主体真实包围球自动算，心脏就贴近拍、全身就拉远
const SUBJECTS = {
  // 器官
  brain:      { name: '大脑', part: ['brain'], tint: 0xf27f98, az: -0.35, orbit: 2.0, fov: 32 },
  // 心肌是暗红棕的肉，不是鲜红塑料；上方的大血管根部需要多留一点取景余量
  heart:      { name: '心脏', part: ['heart'], tint: 0x9c3a3c, az: -0.5, orbit: 1.9, fov: 32,
                margin: { v: 1.78, h: 1.68, f: 1.06 } },
  lungs:      { name: '肺', part: ['lungs'], tint: 0xff8f8f, az: -0.55, orbit: 1.8, fov: 34 },
  liver:      { name: '肝', part: ['liver'], tint: 0xd4644f, az: -0.6, orbit: 1.9, fov: 34 },
  stomach:    { name: '胃', part: ['stomach'], tint: 0xe89a72, az: -0.6, orbit: 1.9, fov: 34 },
  kidney:     { name: '肾', part: ['kidney'], tint: 0xe0707c, az: -0.75, orbit: 1.8, fov: 33 },
  intestine:  { name: '小肠', part: ['smallIntestine'], tint: 0xffab7a, az: -0.5, orbit: 2.0, fov: 35 },
  largeBowel: { name: '大肠', part: ['largeIntestine'], tint: 0xe08a6a, az: -0.5, orbit: 2.0, fov: 35 },
  // 骨骼
  skull:      { name: '颅骨', part: ['skull'], tint: 0xffe3b8, az: -0.4, orbit: 2.0, fov: 32 },
  ribcage:    { name: '胸廓', part: ['ribs', 'sternum'], tint: 0xffe9c8, az: -0.55, orbit: 1.8, fov: 36 },
  spine:      { name: '脊柱', part: ['cervical', 'thoracic', 'lumbar', 'sacrum'], tint: 0xffe9c8, az: -0.45, orbit: 1.9, fov: 34 },
  pelvis:     { name: '骨盆', part: ['pelvis'], tint: 0xffe3b8, az: -0.5, orbit: 1.8, fov: 34 },
  // 全身
  skeleton:   { name: '全身骨骼', part: null, az: -0.6, orbit: 1.5, fov: 34 },
  body:       { name: '全身透视', part: null, az: -0.6, orbit: 1.5, fov: 34,
                layersOverride: { daily: { color: 0xdde7f5, pow: 3.0, fill: 0.012, int: 1.0 } } },
  // 联动：所有脏器实体在场，血管网络把它们连成一体
  circuit:      { name: '全身联动', link: 'full', az: -1.15, orbit: 2.6, fov: 38,
                  part: ['heart', 'lungs', 'brain', 'liver', 'stomach', 'kidney',
                         'smallIntestine', 'largeIntestine', 'spleen'] },
  circuitTorso: { name: '脏器联动', link: 'torso', az: -1.05, orbit: 2.3, fov: 36,
                  part: ['heart', 'lungs', 'liver', 'stomach', 'kidney',
                         'smallIntestine', 'largeIntestine', 'spleen'] },
  // 系统联动：神经冲动从脑沿脊髓下传，脏器依次应答；取景额外带上头与四肢锚点
  neuro:  { name: '神经联动', path: 'neuro', az: -1.0, orbit: 2.4, fov: 38,
            part: ['brain', 'heart', 'lungs', 'liver', 'stomach', 'kidney',
                   'smallIntestine', 'largeIntestine', 'spleen'],
            frame: ['skull', 'arms', 'hands', 'legs', 'feet'],
            margin: { v: 1.22, h: 1.30, f: 1.04 }, dimScale: 0.55 },
  digest: { name: '消化链联动', path: 'digest', az: -0.85, orbit: 2.1, fov: 36,
            part: ['stomach', 'smallIntestine', 'largeIntestine', 'liver', 'heart', 'spleen'],
            frame: ['lungs', 'pelvis'],
            margin: { v: 1.30, h: 1.42, f: 1.04 }, dimScale: 0.90 },
  // 免疫：淋巴管网 + 白细胞巡游 + 淋巴结级联激活 + 病灶聚集 + 抗体播散；
  // 取景要连四肢一起入画，青绿加色通路才读得出来，背景再压一档
  immune: { name: '免疫联动', path: 'immune', az: -1.0, orbit: 2.4, fov: 38,
            part: ['heart', 'lungs', 'brain', 'liver', 'stomach', 'kidney',
                   'smallIntestine', 'largeIntestine', 'spleen'],
            frame: ['skull', 'arms', 'hands', 'legs', 'feet', 'pelvis'],
            margin: { v: 1.22, h: 1.30, f: 1.04 }, dimScale: 0.52, organDim: 0.62 },

  // 病理课堂：舞台长在人体对应部位，四周的 X 光轮廓负责交代「在哪」，
  // 逐幕字幕由 HUD 图层画进画面（也进导出视频）。part 为空 → 不替换器官网格。
  // 舞台纵向跨度比器官大得多，取景留足边距，别把血管上下裁掉
  caseCarotid:  { name: CASES.carotid.name,  case: 'carotid',  part: [], az: -0.32, orbit: 1.5, fov: 34,
                  margin: { v: 1.56, h: 1.38, f: 1.02 }, dimScale: 0.42 },
  caseCoronary: { name: CASES.coronary.name, case: 'coronary', part: [], az: -0.38, orbit: 1.5, fov: 34,
                  margin: { v: 1.56, h: 1.38, f: 1.02 }, dimScale: 0.42 },
  caseStent:    { name: CASES.stent.name,    case: 'stent',    part: [], az: -0.38, orbit: 1.5, fov: 34,
                  margin: { v: 1.56, h: 1.38, f: 1.02 }, dimScale: 0.42 },
  caseStone:    { name: CASES.stone.name,    case: 'stone',    part: [], az: -0.30, orbit: 1.5, fov: 34,
                  margin: { v: 1.56, h: 1.38, f: 1.02 }, dimScale: 0.42 },
  caseStroke:   { name: CASES.stroke.name,   case: 'stroke',   part: [], az: -0.35, orbit: 1.5, fov: 34,
                  margin: { v: 1.56, h: 1.38, f: 1.02 }, dimScale: 0.42 },
  caseDVT:      { name: CASES.dvt.name,      case: 'dvt',      part: [], az: -0.32, orbit: 1.5, fov: 34,
                  margin: { v: 1.56, h: 1.38, f: 1.02 }, dimScale: 0.42 },
};

/* ---------------- 环境层：X 光鬼影材质 ---------------- */
// MeshPhongMaterial + onBeforeCompile 注入菲涅尔：view 夹角越大越亮。
// 本体色全黑 + 加色混合 → 画面里只剩边缘光，叠加处自然变亮（X 光密度感）。
// 用 Phong 是为了白嫖 skinning：GLTF 蒙皮网格在基础材质管线里会自动带骨变换。
function ghostMaterial({ color, pow, fill, int }) {
  const m = new THREE.MeshPhongMaterial({
    color: 0x000000,
    specular: 0x000000,
    shininess: 0,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = shader => {
    shader.uniforms.uGlowColor = { value: new THREE.Color(color) };
    shader.uniforms.uFill = { value: fill };
    shader.uniforms.uPow = { value: pow };
    shader.uniforms.uInt = { value: int };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlowN;\nvarying vec3 vGlowV;')
      .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvGlowN = normalize(transformedNormal);')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGlowV = normalize(-mvPosition.xyz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlowN;\nvarying vec3 vGlowV;\nuniform vec3 uGlowColor;\nuniform float uFill;\nuniform float uPow;\nuniform float uInt;')
      .replace('vec3 totalEmissiveRadiance = emissive;',
        'vec3 totalEmissiveRadiance = uGlowColor * (uFill + uInt * pow(clamp(1.0 - abs(dot(normalize(vGlowN), normalize(vGlowV))), 0.0, 1.0), uPow));');
  };
  return m;
}

/* ---------------- 影棚环境贴图 ---------------- */
// 器官的湿润高光（clearcoat）需要有东西可反射，纯黑背景会让它变成死板的哑光。
// 这里现做一张「暗房 + 两盏柔光箱」的等距柱状贴图，PMREM 预过滤后给 scene.environment。
function studioEnv(renderer) {
  const W = 256, H = 128;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);                       // 0 上 1 下
    const sky = Math.pow(1 - v, 2.2);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      // 两团柔光：一暖一冷，模拟摄影棚的主光与轮廓光
      const d1 = Math.hypot((u - 0.28) * 2.6, (v - 0.30) * 2.0);
      const d2 = Math.hypot((u - 0.76) * 2.6, (v - 0.42) * 2.0);
      const k1 = Math.exp(-d1 * d1 * 5.0);
      const k2 = Math.exp(-d2 * d2 * 6.0);
      const i = (y * W + x) * 4;
      data[i]     = 14 + sky * 16 + k1 * 205 + k2 * 120;
      data[i + 1] = 18 + sky * 20 + k1 * 195 + k2 * 150;
      data[i + 2] = 26 + sky * 30 + k1 * 170 + k2 * 205;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(renderer);
  pm.compileEquirectangularShader();
  const rt = pm.fromEquirectangular(tex);
  pm.dispose();
  tex.dispose();
  return rt.texture;
}

function pickMime() {
  const cands = [
    'video/mp4;codecs=avc1.640028',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  for (const t of cands) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function createStudio(hooks) {
  // hooks: { scene, camera, renderer, postfx, layerGroups, records, bodyMeta, canvas,
  //          setHalo(v), setStage(on), onProgress(p,t,dur), onSaved(name, ext) }
  let on = false;
  let style = null, subject = null;
  let t = 0;                 // 循环路径时间
  let saved = null;          // 退出还原快照
  let focus = new THREE.Vector3();
  let distW = 10;            // 相机距离（世界单位）
  let hW = 10;
  const swapped = [];        // { mesh, mat }
  const geoSwapped = [];     // { mesh, geo }：重构过的几何，退出时还原
  let focusMats = [];
  let anims = [];
  let linkage = null;
  let pathway = null;
  let heartVessels = null;
  let caseShow = null;       // 病理课堂舞台
  let stageLights = null;
  let envTex = null;
  let prevEnv = null;
  let hud = null;            // 字幕 HUD：后处理之后叠加，才会被录进视频

  let recording = false;
  let recorder = null, chunks = [], recT0 = 0, recDur = 12, mime = '';
  let recW = 0, recH = 0, stopSilent = false;
  let recResolution = { w: 1080, h: 1920 };

  /* ---------- 交互视角状态 ---------- */
  // 自动环绕不再按 t 直接算绝对角，而是每帧把角速度积分进 view.az：
  // 这样「拖拽旋转 / 开关自动环绕 / 暂停」都不会让镜头跳一下。
  const view = {
    az: 0,                 // 累计水平角（自动环绕 + 用户拖拽）
    phi: 0,                // 用户俯仰增量
    zoom: 1,               // 缩放倍率
    panX: 0, panY: 0,      // 平移（以取景距离为单位）
    autoOrbit: true,
    paused: false,
    speed: 1,
  };
  const pointers = new Map();
  let drag = null;
  let pinchDist = 0;

  /* ---------- 视角预设 & 书签 ---------- */
  // 预设用「绝对机位角」描述（az=0 是正对 +Z），应用时减去主体的初始角，
  // 这样心脏特写和全身透视切到「正面」都是同一个观察方向。
  // 切换用 0.62s 平滑过渡，而不是硬切——录像里才像一个真正的摇镜。
  const VIEW_PRESETS = [
    { id: 'front',  name: '正面',     key: '1', az: 0,     phi: 1.42, zoom: 1.00, panX: 0, panY: 0 },
    { id: 'threeQ', name: '左前 3/4', key: '2', az: -0.62, phi: 1.30, zoom: 1.06, panX: 0, panY: 0 },
    { id: 'side',   name: '侧面',     key: '3', az: -1.55, phi: 1.42, zoom: 1.04, panX: 0, panY: 0 },
    { id: 'back',   name: '背面',     key: '4', az: 3.14,  phi: 1.42, zoom: 1.00, panX: 0, panY: 0 },
    { id: 'top',    name: '俯视',     key: '5', az: -0.55, phi: 0.50, zoom: 0.92, panX: 0, panY: 0 },
    { id: 'macro',  name: '微距特写', key: '6', az: -0.50, phi: 1.36, zoom: 1.95, panX: 0, panY: 0 },
  ];
  const MARK_KEY = 'hb-studio-marks-v1';
  const MARK_MAX = 24;
  let tween = null;        // { from, to, t, dur }
  let activeMark = '';     // 'preset:front' 或书签 id
  let marks = loadMarks();

  function loadMarks() {
    try {
      const raw = localStorage.getItem(MARK_KEY);
      const a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a.filter(m => m && m.id && m.view).slice(-MARK_MAX) : [];
    } catch { return []; }
  }
  function persistMarks() {
    try { localStorage.setItem(MARK_KEY, JSON.stringify(marks)); } catch { /* file:// 或隐私模式 */ }
  }
  function captureView() {
    // 过渡中保存的是「目标机位」，避免存到半路的中间帧
    if (tween) return { ...tween.to };
    return { az: view.az, phi: view.phi, zoom: view.zoom, panX: view.panX, panY: view.panY };
  }
  function clampView(v) {
    return {
      az: v.az || 0,
      phi: THREE.MathUtils.clamp(v.phi || 0, -1.0, 1.15),
      zoom: THREE.MathUtils.clamp(v.zoom || 1, 0.42, 3.4),
      panX: THREE.MathUtils.clamp(v.panX || 0, -0.85, 0.85),
      panY: THREE.MathUtils.clamp(v.panY || 0, -0.85, 0.85),
    };
  }
  function applyViewValues(v, smooth = true, mark = '') {
    const dst = clampView(v);
    activeMark = mark;
    // 「定机位」就意味着固定镜头：应用预设/书签时停掉自动环绕，
    // 否则角速度会立刻把刚落定的正面/侧面慢慢推开（按 O 可随时恢复）。
    view.autoOrbit = false;
    if (!smooth || !on) {
      tween = null;
      Object.assign(view, dst);
    } else {
      // 从当前这一帧的真实角度起过渡（若正在上一段过渡中，就从中间接上，不跳镜）
      const from = { az: view.az, phi: view.phi, zoom: view.zoom,
                     panX: view.panX, panY: view.panY };
      tween = { from, to: dst, t: 0, dur: 0.62 };
    }
    return { ...dst };
  }
  function applyPreset(id) {
    const p = VIEW_PRESETS.find(x => x.id === id);
    if (!p || !subject) return false;
    const baseAz = subject.az ?? -0.5;
    const basePhi = subject.phi ?? 1.37;
    applyViewValues({ az: p.az - baseAz, phi: p.phi - basePhi,
                      zoom: p.zoom, panX: p.panX, panY: p.panY }, true, `preset:${p.id}`);
    return true;
  }
  function saveBookmark(name) {
    const nm = String(name || '').trim().slice(0, 18) || `机位 ${marks.length + 1}`;
    const m = {
      id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: nm,
      subject: subject ? subject.key : '',
      subjectName: subject ? subject.name : '',
      view: captureView(),
      autoOrbit: view.autoOrbit,
      speed: view.speed,
    };
    marks.push(m);
    if (marks.length > MARK_MAX) marks.shift();
    persistMarks();
    activeMark = m.id;
    tween = null;
    return { ...m };
  }
  function applyBookmark(id) {
    const m = marks.find(x => x.id === id);
    if (!m) return false;
    applyViewValues(m.view, true, m.id);   // 同为定机位：环绕由 applyViewValues 统一停下
    return true;
  }
  function deleteBookmark(id) {
    const i = marks.findIndex(x => x.id === id);
    if (i < 0) return false;
    marks.splice(i, 1);
    persistMarks();
    if (activeMark === id) activeMark = '';
    return true;
  }
  function renameBookmark(id, name) {
    const m = marks.find(x => x.id === id);
    if (!m) return false;
    const nm = String(name || '').trim().slice(0, 18);
    if (!nm) return false;
    m.name = nm;
    persistMarks();
    return true;
  }
  function cycleBookmark(dir) {
    if (!marks.length) return false;
    const i = marks.findIndex(x => x.id === activeMark);
    const next = (i + dir + marks.length) % marks.length;
    return applyBookmark(marks[next].id);
  }

  function zoomBy(f) {
    tween = null;
    activeMark = '';
    view.zoom = THREE.MathUtils.clamp(view.zoom * f, 0.42, 3.4);
  }
  function resetView() {
    tween = null;
    activeMark = '';
    view.az = 0; view.phi = 0; view.zoom = 1;
    view.panX = 0; view.panY = 0;
  }

  /* ---------- 画布输入：拖动旋转 / 滚轮与双指缩放 / Shift 平移 ---------- */
  function bindInput() {
    const cv = hooks.canvas;
    if (!cv) return;
    cv.addEventListener('pointerdown', e => {
      if (!on || (e.pointerType === 'mouse' && e.button === 2)) return;
      // 手动操作优先：打断正在进行的机位过渡，并取消高亮
      tween = null;
      activeMark = '';
      try { cv.setPointerCapture(e.pointerId); } catch { /* 某些浏览器不允许重复 capture */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 1 };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        drag = null;
      }
    }, { passive: true });

    cv.addEventListener('pointermove', e => {
      if (!on) return;
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && nd > 0) zoomBy(nd / pinchDist);
        pinchDist = nd;
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) {
        const k = 0.0016 / Math.sqrt(view.zoom);
        view.panX = THREE.MathUtils.clamp(view.panX - dx * k, -0.85, 0.85);
        view.panY = THREE.MathUtils.clamp(view.panY + dy * k, -0.85, 0.85);
      } else {
        view.az -= dx * 0.0062;
        view.phi = THREE.MathUtils.clamp(view.phi + dy * 0.0048, -1.0, 1.15);
      }
    }, { passive: true });

    const end = e => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (!pointers.size) drag = null;
    };
    cv.addEventListener('pointerup', end, { passive: true });
    cv.addEventListener('pointercancel', end, { passive: true });

    cv.addEventListener('wheel', e => {
      if (!on) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0012));
    }, { passive: false });
    cv.addEventListener('dblclick', () => { if (on) resetView(); });
  }
  bindInput();

  /* ---------- 心脏网格的局部包围盒 ---------- */
  // 顶点级心肌收缩需要知道「哪端是心尖、哪端是心底、中轴在哪」。
  // 世界包围盒要换算回 mesh 的局部空间（顶点着色器里用的是 position 局部坐标），
  // 这样换模型 / 换缩放都不用改常量。
  function heartLocalBox(rec) {
    rec.group.updateMatrixWorld(true);
    const world = new THREE.Box3().setFromObject(rec.group);
    let target = null;
    rec.group.traverse(o => { if (!target && o.isMesh) target = o; });
    if (!target || world.isEmpty()) return new THREE.Vector4(-0.07, 0.07, 0, 0);
    const lb = world.clone().applyMatrix4(new THREE.Matrix4().copy(target.matrixWorld).invert());
    return new THREE.Vector4(lb.min.y, lb.max.y,
      (lb.min.x + lb.max.x) * 0.5, (lb.min.z + lb.max.z) * 0.5);
  }

  /* ---------- 材质替换 ---------- */
  function applyMaterials() {
    const lv = { ...style.layers, ...(subject.layersOverride || {}) };
    const dim = subject.part ? style.dim : null;

    // 主体网格集合：这些不能套鬼影材质，要留给自己做实体
    const focusMeshes = new Set();
    const focusRecs = [];
    for (const id of (subject.part || [])) {
      const rec = hooks.records.get(id);
      if (!rec || !rec.group) continue;
      focusRecs.push(rec);
      rec.group.traverse(o => { if (o.isMesh && o.material) focusMeshes.add(o); });
    }

    // 1) 环境层鬼影
    for (const key of ['daily', 'skeleton', 'muscle', 'organ']) {
      const group = hooks.layerGroups[key];
      if (!group) continue;
      // 病理课堂是「病灶放大镜」：人体四层在局部特写下会叠成满屏白色加色网，
      // 直接隐藏；发生位置由 HUD 的人体定位图 + 舞台自带的解剖地标线交代。
      group.visible = !subject.case;
      if (!group.visible) continue;
      const p = { ...lv[key] };
      if (!p) continue;
      // 系统联动的金色/暖色通路要在鬼影之上读得出来，背景再压一档
      const f = (dim ? (dim[key] ?? 1) : 1) * (subject.dimScale ?? 1);
      // 病理特写里皮肤/肌肉的 X 光鬼影放大后会变成满屏白乱线，盖住病变血管；
      // 只留一层极淡的骨骼轮廓做位置参照，定位交给 HUD 上的人体小图
      const caseDim = subject.case ? ((key === 'daily' || key === 'muscle') ? 0.06 : 0.16) : 1;
      p.int *= f * caseDim;
      p.fill *= f * caseDim;
      if (f <= 0.001) continue;
      const mat = ghostMaterial(p);
      group.traverse(o => {
        if (!o.isMesh || !o.material) return;
        if (focusMeshes.has(o)) return;
        swapped.push({ mesh: o, mat: o.material });
        o.material = mat;
        o.castShadow = false;
      });
    }

    // 2) 主体：几何重构 + 生物组织材质
    const box = new THREE.Box3();
    focusRecs.forEach(r => box.expandByObject(r.group));
    const size = box.isEmpty() ? new THREE.Vector3(0.2, 0.2, 0.2) : box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 0.2;
    //（纹理频率已按 uObjH 归一化，不再需要 sizeScale）
    const isNetwork = !!(subject.link || subject.path);
    const kindOf = id => isNetwork ? (ORGAN_KIND[id] || id) : (KIND[subject.key] || subject.key);
    const tintOf = id => isNetwork ? (ORGAN_TINT[id] || subject.tint) : subject.tint;
    // 只有心脏特写做顶点级心肌收缩（联动里的器官太小，看不出形变却要多花开销）
    const heartBox = (!isNetwork && subject.key === 'heart' && focusRecs.length)
      ? heartLocalBox(focusRecs[0]) : null;

    let organs = [];
    if (focusMeshes.size) {
      const mats = [];
      organs = [];
      for (const rec of focusRecs) {
        const kind = kindOf(rec.part.id);
        const rb = new THREE.Box3().setFromObject(rec.group);
        const rs = rb.isEmpty() ? size : rb.getSize(new THREE.Vector3());
        const recMats = [];
        rec.group.traverse(o => {
          if (!o.isMesh || !o.material || !focusMeshes.has(o)) return;
          if (!isNetwork) {
            // 特写主体：细分 + Taubin 平滑，把 CT 网格的台阶和折线抹掉；
            // 联动主体器官很小，跳过重构省时间
            const raw = o.geometry;
            const fine = refine(raw);
            if (fine !== raw) {
              geoSwapped.push({ mesh: o, geo: raw });
              o.geometry = fine;
            }
          }
          const m = createOrganMaterial(tintOf(rec.part.id), kind, {
            detail: DETAIL[kind] || 0,
            objH: rs.y,
            heartBox,
            // 绕向已在 surface.js 统一朝外：全部单面渲染，剔除折叠背面碎斑
            doubleSide: false,
          });
          // 心肌是深红棕的肉，环境反射拉满会被洗成粉色塑料；特写单独收一点
          if (kind === 'heart' && !isNetwork) m.envMapIntensity = 1.5;
          // 免疫联动有 9 个实体器官同时在场，叠加加色淋巴管后躯干容易过曝成一片白；
          // 只压联动主体的实体器官亮度，青绿管网反而更跳出来（其它主体不受影响）
          if (isNetwork && subject.organDim) {
            const k = subject.organDim;
            m.color.multiplyScalar(k);
            m.emissive.multiplyScalar(k);
            m.envMapIntensity *= k;
          }
          const u = m.userData.uni;
          u.uWaveAmp.value = waveAmpFor(kind, rs.y);
          // 骨骼类给一条扫描光带（自上而下），这是医学扫描片的标志性语言
          u.uScan.value = -999;
          swapped.push({ mesh: o, mat: o.material, ro: o.renderOrder });
          o.material = m;
          o.castShadow = false;
          // 环境层 X 光鬼影是透明加色、不写深度，默认会盖在实体器官上，
          // 在心脏表面留下一堆白色肋骨/血管线。特写主体放进透明队列并后绘制、
          // 同时写深度，实体肉就把这些穿帮的鬼影压住了（透视感仍在周围）。
          // 联动主体由多片肺叶组成，改透明会让叶间裂隙变成黑带，保持不透明。
          if (!isNetwork) {
            m.transparent = true;
            m.opacity = 1;
            m.depthWrite = true;
            o.renderOrder = 12;
          }
          recMats.push(m);
          mats.push(m);
        });
        organs.push({ id: rec.part.id, group: rec.group, mats: recMats });
      }
      focusMats = mats;
    } else {
      focusMats = [];
    }
    return { recs: focusRecs, box, size, organs };
  }

  function restoreMaterials() {
    for (const g of Object.values(hooks.layerGroups)) if (g) g.visible = true;
    for (const { mesh, mat, ro } of swapped) {
      mesh.material = mat;
      if (ro !== undefined) mesh.renderOrder = ro;
    }
    swapped.length = 0;
    for (const { mesh, geo } of geoSwapped) {
      mesh.geometry = geo;
      geo.computeBoundingSphere();
    }
    geoSwapped.length = 0;
    focusMats = [];
  }

  /* ---------- 主体包围盒 & 自动取景 ---------- */
  function frameFromBox(box, s, aspect, maxDist = 7.5 * s) {
    box.getCenter(focus);
    const size = box.getSize(new THREE.Vector3());

    // 竖屏时横向视场窄、横屏时纵向窄——按包围盒两个方向分别算距离取大者。
    // 器官主体留足边距（器官占画面约一半，四周保留身体轮廓做参照），
    // 全身主体则收紧边距让人物撑满画面。联动主体取景介于两者之间。
    const m = subject.margin || (subject.part ? { v: 1.5, h: 1.62, f: 1.1 } : { v: 1.14, h: 1.34, f: 1.05 });
    if ((subject.link || subject.path) && !subject.margin) { m.v = 1.34; m.h = 1.44; }
    const fovV = THREE.MathUtils.degToRad(subject.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
    const halfV = size.y * 0.5 * m.v;
    const halfH = Math.max(size.x, size.z) * 0.5 * m.h;
    distW = Math.max(halfV / Math.tan(fovV / 2), halfH / Math.tan(fovH / 2)) * m.f;
    distW = Math.max(0.22 * s, Math.min(distW, maxDist));
    hW = focus.y;
  }

  function computeFraming(recs) {
    const s = hooks.bodyMeta.scale || 1;
    const aspect = hooks.camera.aspect || 0.56;
    // 病理课堂：只按舞台包围盒取景，人体轮廓留在四周做位置参照（不撑开画面）
    if (caseShow) {
      const cb = new THREE.Box3().setFromObject(caseShow.group);
      if (!cb.isEmpty()) {
        frameFromBox(cb, s, aspect, 12 * s);
        // 字幕卡占画面下方，舞台整体上移一点，别让病变被卡片压住
        focus.y -= cb.getSize(new THREE.Vector3()).y * 0.12;
        hW = focus.y;
        return;
      }
    }
    const box = new THREE.Box3();
    if (recs.length) {
      recs.forEach(r => box.expandByObject(r.group));
    } else {
      // 全身：用整个人体包围盒
      ['daily', 'skeleton', 'muscle', 'organ'].forEach(k => {
        const g = hooks.layerGroups[k];
        if (g) box.expandByObject(g);
      });
    }
    // 系统联动（神经等）要连四肢一起入画：追加几个骨架锚点撑开取景盒
    for (const id of (subject.frame || [])) {
      const r = hooks.records.get(id);
      if (r && r.group) box.expandByObject(r.group);
    }
    if (box.isEmpty()) {
      focus.set(0, (hooks.bodyMeta.height || 1.75) * s * 0.55, 0);
      distW = 2.6 * s;
      return;
    }
    frameFromBox(box, s, aspect);
  }

  /* ---------- 影棚灯：主光 / 补光 / 轮廓光，始终跟着相机 ---------- */
  function setupStage() {
    if (!stageLights) {
      const group = new THREE.Group();
      const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
      const fill = new THREE.DirectionalLight(0x86a8ff, 1.5);
      const rim = new THREE.DirectionalLight(0xd2ecff, 2.6);
      [key, fill, rim].forEach(l => {
        l.castShadow = false;
        group.add(l);
        group.add(l.target);
      });
      stageLights = { group, key, fill, rim };
    }
    hooks.scene.add(stageLights.group);
    if (!envTex) envTex = studioEnv(hooks.renderer);
    prevEnv = hooks.scene.environment;
    hooks.scene.environment = envTex;
  }

  function placeStage() {
    if (!stageLights) return;
    const c = hooks.camera.position;
    const dir = new THREE.Vector3().subVectors(c, focus).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const d = Math.max(0.5, distW * 1.8);

    // 主光：相机左前方 35°、抬高，负责塑造体积
    const kd = dir.clone().applyAxisAngle(up, 0.62);
    kd.y += 0.9; kd.normalize();
    stageLights.key.position.copy(focus).addScaledVector(kd, d);
    stageLights.key.target.position.copy(focus);

    // 补光：右下方、冷色、低强度，把暗部提起来又不抹平明暗
    const fd = dir.clone().applyAxisAngle(up, -1.05);
    fd.y -= 0.35; fd.normalize();
    stageLights.fill.position.copy(focus).addScaledVector(fd, d);
    stageLights.fill.target.position.copy(focus);

    // 轮廓光：从主体背后打来，勾出边缘（器官轮廓之所以能"跳"出来就靠它）
    const rd = dir.clone().negate();
    rd.y += 0.55; rd.normalize();
    stageLights.rim.position.copy(focus).addScaledVector(rd, d);
    stageLights.rim.target.position.copy(focus);

    stageLights.group.updateMatrixWorld();
  }

  function teardownStage() {
    if (stageLights) hooks.scene.remove(stageLights.group);
    hooks.scene.environment = prevEnv ?? null;
    prevEnv = null;
  }

  /* ---------- 字幕 HUD：画在后处理之后，才能被 canvas.captureStream 录进去 ---------- */
  function initHud() {
    if (hud) return hud;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 2;
    const ctx2d = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, side: THREE.DoubleSide,
    });
    const sc = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    cam.position.z = 1;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    quad.renderOrder = 999;
    sc.add(quad);
    hud = { cv, ctx2d, tex, mat, sc, cam, quad };
    return hud;
  }

  function renderOverlay() {
    if (!on || !caseShow) return;
    const H = initHud();
    const sz = hooks.renderer.getSize(new THREE.Vector2());
    const w = Math.max(2, Math.round(sz.x)), h = Math.max(2, Math.round(sz.y));
    const dpr = Math.min(2, hooks.renderer.getPixelRatio() || 1);
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (H.cv.width !== cw || H.cv.height !== ch) {
      H.cv.width = cw; H.cv.height = ch;
      H.tex.needsUpdate = true;
    }
    const c = H.ctx2d;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCaseHud(c, w, h, caseShow.info, caseShow.stageAt(t), { speed: view.speed });
    H.frames = (H.frames || 0) + 1;
    H.tex.needsUpdate = true;
    // 后处理已经把成片写进默认帧缓冲，这里只叠加、绝不能清屏
    const prev = hooks.renderer.autoClear;
    hooks.renderer.autoClear = false;
    hooks.renderer.setRenderTarget(null);
    hooks.renderer.render(H.sc, H.cam);
    hooks.renderer.autoClear = prev;
  }

  function disposeHud() {
    if (!hud) return;
    hud.tex.dispose(); hud.mat.dispose(); hud.quad.geometry.dispose();
    hud = null;
  }

  function buildAnims(recs, box, size, organs) {
    anims = [];
    if (!recs.length || !focusMats.length) return;
    const pad = Math.max(0.008, size.y * 0.08);
    const ctx = {
      scale: hooks.bodyMeta.scale || 1,
      scanTop: box.max.y + pad,
      scanBottom: box.min.y - pad,
    };
    for (const rec of recs) {
      const network = !!(subject.link || subject.path);
      const kind = network ? (ORGAN_KIND[rec.part.id] || rec.part.id)
                           : (KIND[subject.key] || subject.key);
      const mats = network
        ? ((organs.find(o => o.id === rec.part.id) || {}).mats || focusMats)
        : focusMats;
      anims.push(createOrganAnim(kind, rec.group, ctx, mats));
    }
  }

  /* ---------- 进出场 ---------- */
  function enter(styleKey, subjectKey) {
    if (on) exit();
    style = STYLES[styleKey] || STYLES.noir;
    subject = SUBJECTS[subjectKey]
      ? { ...SUBJECTS[subjectKey], key: subjectKey }
      : { ...SUBJECTS.heart, key: 'heart' };

    saved = {
      bg: hooks.scene.background,
      aspect: hooks.camera.aspect,
      fov: hooks.camera.fov,
      camEnabled: hooks.cam ? hooks.cam.enabled : true,
      size: { w: hooks.canvas.width, h: hooks.canvas.height,
              sw: hooks.canvas.style.width, sh: hooks.canvas.style.height,
              sl: hooks.canvas.style.left, st: hooks.canvas.style.top },
      grade: { ...hooks.postfx.grade,
               shadowTint: hooks.postfx.grade.shadowTint.toArray(),
               highlightTint: hooks.postfx.grade.highlightTint.toArray() },
      lens: { ...hooks.postfx.lens },
    };

    hooks.scene.background = new THREE.Color(style.bg);
    // 工坊自己接管相机：把常规 OrbitCam 的输入关掉，避免两套控制互相打架
    if (hooks.cam) hooks.cam.enabled = false;
    pointers.clear(); drag = null; pinchDist = 0;
    resetView();
    if (hooks.setHalo) hooks.setHalo(0);     // 光环横线会破坏 X 光画面
    if (hooks.setStage) hooks.setStage(false); // 地面/网格/尘埃也会穿帮

    const g = hooks.postfx.grade, L = style.grade;
    g.bloom = L.bloom; g.exposure = L.exposure; g.sat = L.sat;
    g.vignette = L.vignette; g.grain = L.grain; g.ca = L.ca;
    g.shadowTint.fromArray(L.shadowTint); g.highlightTint.fromArray(L.highlightTint);
    hooks.postfx.lens.on = true;
    hooks.postfx.lens.aperture = 0.3;
    hooks.postfx.lens.streak = 0;
    hooks.postfx.lens.zoom = 0;

    hooks.camera.fov = subject.fov;
    hooks.camera.updateProjectionMatrix();

    // 先把材质换上（同时拿到主体记录），再按主体尺寸定机位
    const { recs, box, size, organs } = applyMaterials();
    // 心脏特写：冠脉网 + 大血管根部作为心脏 group 的子节点，跟随心肌一起搏动。
    // 在取景之前建好，包围盒会把向上伸出的主动脉弓一并算进去。
    if (!subject.case && !subject.link && subject.key === 'heart' && recs.length) {
      heartVessels = createHeartVessels({ rec: recs[0], bodyMeta: hooks.bodyMeta });
    }
    // 病理课堂：舞台自己带血管/病变/器械，取景按舞台包围盒算
    if (subject.case) {
      caseShow = createCase({
        key: subject.case, records: hooks.records, bodyMeta: hooks.bodyMeta,
      });
      hooks.scene.add(caseShow.group);
      caseShow.update(0);
    }
    computeFraming(recs);
    hooks.postfx.lens.range = Math.max(0.4, distW * 0.42);

    setupStage();
    buildAnims(recs, box, size, organs);
    if (subject.link && organs.length) {
      linkage = createLinkage({
        records: hooks.records, bodyMeta: hooks.bodyMeta,
        organs, scene: hooks.scene,
      });
      hooks.scene.add(linkage.group);
    }
    if (subject.path && organs.length) {
      pathway = createPathway({
        records: hooks.records, bodyMeta: hooks.bodyMeta,
        organs, scene: hooks.scene, system: subject.path,
      });
      hooks.scene.add(pathway.group);
    }

    on = true;
    t = 0;
  }

  function exit() {
    if (!on) return;
    // 正在录制时退出：先停录并同步把画布尺寸还原（onstop 是异步的，等它来不及）
    if (recording) {
      stopRecording(true);
      restoreCanvas();
    }
    anims.forEach(a => a.reset());
    anims = [];
    if (linkage) { linkage.dispose(); linkage = null; }
    if (pathway) { pathway.dispose(); pathway = null; }
    if (heartVessels) { heartVessels.dispose(); heartVessels = null; }
    if (caseShow) { caseShow.dispose(); caseShow = null; }
    restoreMaterials();
    teardownStage();
    const s = saved;
    hooks.scene.background = s.bg;
    // 工坊期间可能换过主题：s.bg 是进场时保存的主题 Color 引用，
    // 回填当前主题色，保证界面、灯光、背景三者一致（主题切换时不会盖掉工坊影棚色）。
    if (hooks.getThemeBg) hooks.scene.background.set(hooks.getThemeBg());
    if (hooks.cam) hooks.cam.enabled = s.camEnabled;
    pointers.clear(); drag = null; pinchDist = 0;
    if (hooks.setHalo) hooks.setHalo(1);
    if (hooks.setStage) hooks.setStage(true);
    const g = hooks.postfx.grade;
    g.bloom = s.grade.bloom; g.exposure = s.grade.exposure; g.sat = s.grade.sat;
    g.vignette = s.grade.vignette; g.grain = s.grade.grain; g.ca = s.grade.ca;
    g.shadowTint.fromArray(s.grade.shadowTint); g.highlightTint.fromArray(s.grade.highlightTint);
    Object.assign(hooks.postfx.lens, s.lens);
    hooks.camera.fov = s.fov;
    hooks.camera.aspect = s.aspect;
    hooks.camera.updateProjectionMatrix();
    saved = null;
    on = false;
    style = null; subject = null;
  }

  /* ---------- 相机路径 ---------- */
  // LOOP 秒一个循环：自动环绕的角速度在 update 里积分进 view.az，
  // 这里只做「呼吸推拉 + 用户视角」的合成，所以暂停/拖拽/开关环绕都不会跳镜。
  const LOOP = 12;
  function orbitOmega(tSec) {
    const u = (tSec % LOOP) / LOOP;
    // 环绕缓动（起落慢、中间匀速）的导数：∫ = u - 0.10·sin(2πu)/(2π)
    return (subject.orbit ?? 1.8) * (1 - 0.10 * Math.cos(u * Math.PI * 2)) / LOOP;
  }
  function driveCamera(tSec) {
    const c = hooks.camera;
    const u = (tSec % LOOP) / LOOP;
    // 起幅：开头略远，1.2 秒内推到位（镜头"落定"的感觉）
    const intro = 1 + 0.14 * Math.exp(-tSec * 1.35);
    const az = (subject.az ?? -0.5) + view.az;
    const push = Math.sin(u * Math.PI * 2) * 0.13;
    const ph = THREE.MathUtils.clamp(
      (subject.phi ?? 1.37) + view.phi + Math.sin(u * Math.PI * 2 + 0.7) * 0.022, 0.18, 2.86);
    const d = distW * (1 - push) * intro / view.zoom;

    // 相机右 / 上基向量（由 az、ph 解析得到），用于 Shift+拖动的平移
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    const up = new THREE.Vector3(-Math.sin(az) * Math.cos(ph), Math.sin(ph),
                                 -Math.cos(az) * Math.cos(ph));
    const look = focus.clone()
      .addScaledVector(right, view.panX * d)
      .addScaledVector(up, view.panY * d);
    look.y += Math.sin(u * Math.PI * 2 + 1.9) * distW * 0.012;
    const shake = 0.003 * d;
    c.position.set(
      look.x + d * Math.sin(ph) * Math.sin(az) + Math.sin(tSec * 2.1) * shake,
      look.y + d * Math.cos(ph) + Math.sin(tSec * 2.7 + 1.3) * shake * 0.8,
      look.z + d * Math.sin(ph) * Math.cos(az)
    );
    const roll = Math.sin(tSec * 0.7 + 0.3) * 0.006;   // 极轻的侧滚，稳定器手感
    c.up.set(Math.sin(roll), Math.cos(roll), 0);
    c.lookAt(look);
  }

  /* ---------- 录制 ---------- */
  function applyResolution(w, h) {
    hooks.renderer.setSize(w, h, false);       // 不动 CSS
    hooks.postfx.setSize(w, h);
    hooks.camera.aspect = w / h;
    hooks.camera.updateProjectionMatrix();
    const vw = window.innerWidth, vh = window.innerHeight;
    const k = Math.min(vw / w, vh / h);
    hooks.canvas.style.width = `${Math.round(w * k)}px`;
    hooks.canvas.style.height = `${Math.round(h * k)}px`;
    hooks.canvas.style.left = `${Math.round((vw - w * k) / 2)}px`;
    hooks.canvas.style.top = `${Math.round((vh - h * k) / 2)}px`;
  }

  function startRecording(dur, orientation) {
    if (!on || recording) return false;
    // 导出必须按 1× 实时走：暂停/慢放会把导出的时长和节奏弄乱
    view.paused = false;
    view.speed = 1;
    mime = pickMime();
    if (!mime) return false;
    // 病理课堂导出的是整段讲解（5 幕），不能按 8/12/20 秒截断
    recDur = caseShow ? caseShow.total : dur;
    const vertical = orientation !== 'horizontal';
    recW = vertical ? recResolution.w : Math.min(1920, Math.round(window.innerWidth * (window.devicePixelRatio || 1)));
    recH = vertical ? recResolution.h : Math.min(1080, Math.round(window.innerHeight * (window.devicePixelRatio || 1)));
    applyResolution(recW, recH);
    // 画幅变了要按新的 aspect 重新取景，否则竖屏里主体会被裁掉
    const recs = (subject.part || []).map(id => hooks.records.get(id)).filter(r => r && r.group);
    computeFraming(recs);
    t = 0;
    chunks = [];
    const stream = hooks.canvas.captureStream(60);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      recording = false;
      const silent = stopSilent;
      stopSilent = false;
      // 退出工坊时顺带停录：丢弃残片，不当成一次正常导出
      if (!silent && subject && style && chunks.length) {
        const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mime });
        const name = `人体${subject.name}-${style.name}-${recW}x${recH}.${ext}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        if (hooks.onSaved) hooks.onSaved(name, ext);
      }
      chunks = [];
      if (saved) restoreCanvas();
    };
    recorder.start(250);
    stopSilent = false;
    recT0 = t;
    recording = true;
    return true;
  }

  function restoreCanvas() {
    if (!saved) return;
    applyResolution(saved.size.w, saved.size.h);
    const st = hooks.canvas.style;
    st.width = saved.size.sw; st.height = saved.size.sh;
    st.left = saved.size.sl; st.top = saved.size.st;
    hooks.camera.aspect = saved.aspect;
    hooks.camera.updateProjectionMatrix();
    if (!subject) return;
    const recs = (subject.part || []).map(id => hooks.records.get(id)).filter(r => r && r.group);
    computeFraming(recs);
  }

  function stopRecording(silent) {
    if (!recording || !recorder) return;
    stopSilent = !!silent;
    recorder.stop();
  }

  /* ---------- 每帧 ---------- */
  function update(dt) {
    if (!on) return;
    // 机位过渡：暂停时也照样推进，定格画面下切换预设仍是一段平滑摇镜
    if (tween) {
      tween.t += dt;
      const k = Math.min(1, tween.t / tween.dur);
      const e = k * k * (3 - 2 * k);       // smoothstep
      const f = tween.from, d = tween.to;
      view.az = f.az + (d.az - f.az) * e;
      view.phi = f.phi + (d.phi - f.phi) * e;
      view.zoom = f.zoom + (d.zoom - f.zoom) * e;
      view.panX = f.panX + (d.panX - f.panX) * e;
      view.panY = f.panY + (d.panY - f.panY) * e;
      if (k >= 1) tween = null;
    }
    if (!view.paused) {
      const step = dt * view.speed;
      t += step;
      // 自动环绕按角速度积分；关掉时只是停止累加，镜头停在原地（无跳变）
      // 过渡期间先让位给机位插值，否则两条路径会互相打架
      if (view.autoOrbit && !tween) view.az += step * orbitOmega(t);
      anims.forEach(a => a.update(t));
      if (linkage) linkage.update(t);   // 联动到货脉冲在器官动画之后覆盖 uPulse / uFlush
      if (pathway) pathway.update(t);
      if (heartVessels) heartVessels.update(t);
      if (caseShow) caseShow.update(t);  // 病理课堂：同一时间轴驱动病变 + 字幕幕次
    }
    // 暂停时仍驱动相机：用户照样能旋转、缩放、平移地观察定格画面
    driveCamera(t);
    placeStage();
    hooks.postfx.lens.focus = focus.distanceTo(hooks.camera.position) * 0.96;
    if (recording && hooks.onProgress) {
      const done = t - recT0;
      hooks.onProgress(Math.min(1, done / recDur), Math.min(done, recDur), recDur);
      if (done >= recDur) stopRecording(false);
    }
  }

  return {
    enter, exit, update, renderOverlay,
    startRecording, stopRecording,
    /* ---- 病理课堂 ---- */
    cases: CASES,
    get isCase() { return !!caseShow; },
    get caseInfo() { return caseShow ? caseShow.info : null; },
    get caseStage() { return caseShow ? caseShow.stageAt(t) : null; },
    get caseDuration() { return caseShow ? caseShow.total : 0; },
    get hudInfo() { return hud ? { w: hud.cv.width, h: hud.cv.height, frames: hud.frames || 0 } : null; },
    get recordingDuration() { return recording ? recDur : 0; },
    seek: sec => {
      if (!on || !caseShow) return false;
      t = THREE.MathUtils.clamp(+sec || 0, 0, caseShow.total - 0.001);
      caseShow.update(t);
      return t;
    },
    get active() { return on; },
    get recording() { return recording; },
    get mimeInfo() { return pickMime(); },
    get styleName() { return style ? style.name : ''; },
    get subjectName() { return subject ? subject.name : ''; },
    styles: STYLES,
    subjects: SUBJECTS,
    setResolution: (w, h) => { recResolution = { w, h }; },
    // 交互控制（UI / 快捷键 / 验证脚本共用）
    setPaused: v => { view.paused = !!v; return view.paused; },
    togglePaused: () => { view.paused = !view.paused; return view.paused; },
    setAutoOrbit: v => { view.autoOrbit = !!v; return view.autoOrbit; },
    setSpeed: v => { view.speed = THREE.MathUtils.clamp(+v || 1, 0.25, 2.5); return view.speed; },
    zoomBy, resetView,
    rotateBy: (dAz, dPhi) => {
      tween = null;
      activeMark = '';
      view.az += dAz;
      view.phi = THREE.MathUtils.clamp(view.phi + dPhi, -1.0, 1.15);
    },
    get view() {
      return { az: +view.az.toFixed(4), phi: +view.phi.toFixed(4), zoom: +view.zoom.toFixed(4),
               panX: +view.panX.toFixed(4), panY: +view.panY.toFixed(4),
               autoOrbit: view.autoOrbit, paused: view.paused, speed: view.speed, t: +t.toFixed(3),
               mark: activeMark, moving: !!tween };
    },
    /* ---- 视角预设 & 书签 ---- */
    presets: VIEW_PRESETS,
    applyPreset,
    applyView: (v, smooth = true) => applyViewValues(v, smooth),
    get bookmarks() { return marks.map(m => ({ ...m })); },
    saveBookmark, applyBookmark, deleteBookmark, renameBookmark, cycleBookmark,
    get activeMark() { return activeMark; },
    get markSignature() {
      return marks.map(m => `${m.id}:${m.name}`).join('|') + '#' + activeMark;
    },
    get subjectKey() { return subject ? subject.key : ''; },
    get pathwayInfo() {
      return pathway ? { routes: pathway.routeCount, nodes: pathway.nodeCount,
                         particles: pathway.particleCount } : null;
    },
    // 调试：当前取景参数
    get framing() { return { focus: focus.toArray().map(v => +v.toFixed(3)), dist: +distW.toFixed(3), h: +hW.toFixed(3) }; },
  };
}
