// organ.js — 特写器官的「生物组织」材质 + 器官自身的生理动态
//
// 原来的器官只是「白材质染个色 + 一点自发光」，所以看着像塑料模型。
// 真实器官在特写下有三个特征，这里逐一补上：
//   1) 表面不是纯色：有斑驳的色差、毛细血管网、湿润的高光
//   2) 肉会透光：边缘逆光处泛出组织本身的红色（次表面散射的近似）
//   3) 一直在动：心跳搏动、肺呼吸、胃肠蠕动、脑随脉搏微胀
import * as THREE from '../lib/three.module.js';
import { cardiac } from './cardiac.js';

/* ---------------- 着色器片段 ---------------- */
const NOISE = /* glsl */`
float h31(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x),
                 mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x),
                 mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

const VERT_PARS = /* glsl */`
uniform float uWave;      // 蠕动相位
uniform float uWaveAmp;   // 蠕动幅度（局部单位）
uniform float uPulse;     // 动脉压力波
uniform float uHeartMode; // 1 = 启用顶点级心肌收缩
uniform float uCardSys;   // 心室收缩
uniform float uCardAtr;   // 心房收缩
uniform float uCardTwist; // 心肌螺旋扭转
uniform vec4  uHeartBox;  // mesh 局部空间：minY / maxY / 轴心 X / 轴心 Z
varying vec3 vObjP;
varying vec3 vWorldP;
varying vec3 vViewDirW;

// 心肌纤维是螺旋排列的：收缩时心尖与心底反向拧转（torsion），
// 等容舒张期又快速解开（untwist）。整体等比缩放做不出这个「拧毛巾」。
float heartTwist(float h) {
  return uCardTwist * (0.19 * (1.0 - h) - 0.12 * h) + 0.048 * uCardSys * (1.0 - h);
}
`;

const VERT_MAIN = /* glsl */`
if (uHeartMode > 0.5) {
  float hN = clamp((position.y - uHeartBox.x) / max(1e-5, uHeartBox.y - uHeartBox.x), 0.0, 1.0);
  // 心室在下半部、心房/心底在上半部：两者收缩相位相反
  float vent = 1.0 - smoothstep(0.48, 0.90, hN);
  float atr  = smoothstep(0.66, 0.97, hN);
  float con  = uCardSys * vent;
  float fill = uCardAtr * atr;
  // 室壁增厚：横径向内收（心腔缩小），外壁横径变化只有 ~9%
  vec2 rd = position.xz - uHeartBox.zw;
  transformed.xz -= rd * (0.115 * con - 0.042 * fill);
  // 长轴缩短：心底向心尖下降，心尖基本固定
  transformed.y -= (position.y - uHeartBox.x) * (0.095 * uCardSys - 0.028 * fill);
  // 螺旋扭转
  float ang = heartTwist(hN);
  float ca = cos(ang), sa = sin(ang);
  vec2 q = transformed.xz - uHeartBox.zw;
  transformed.xz = uHeartBox.zw + vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
  // 心尖搏动：收缩期心尖向前上方顶一下（可在体表摸到的 apex beat）
  transformed.z += 0.0075 * uCardSys * (1.0 - hN);
  transformed.y += 0.0030 * uCardAtr;
}
// 蠕动：沿局部 Y 传播的行波，只对胃/肠这类管腔器官生效（uWaveAmp=0 时是空操作）
float wv = sin(position.y * 26.0 - uWave * 3.4) * uWaveAmp;
transformed.x += wv * 0.55;
transformed.z += wv * 0.42;
// 形变后的局部坐标：结构化纹理（冠状沟、脂肪）要跟着肉一起动
vObjP = transformed;
vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;
vec4 mvW = viewMatrix * vec4(vWorldP, 1.0);
vViewDirW = normalize(-mvW.xyz);
`;

// 法线也要跟着扭转，否则心肌拧了 8° 而高光不跟着转，看着像贴纸
const NORMAL_MAIN = /* glsl */`
if (uHeartMode > 0.5) {
  float hN = clamp((position.y - uHeartBox.x) / max(1e-5, uHeartBox.y - uHeartBox.x), 0.0, 1.0);
  float ang = heartTwist(hN);
  float ca = cos(ang), sa = sin(ang);
  vec2 q = objectNormal.xz;
  objectNormal.xz = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
}
`;

const FRAG_PARS = /* glsl */`
uniform vec3 uTint;
uniform vec3 uVeinColor;
uniform vec3 uSssColor;
uniform vec3 uScanColor;
uniform float uTime;
uniform float uVein;      // 血管网强度
uniform float uSss;       // 边缘透光强度
uniform float uWet;       // 湿润高光
uniform float uScan;      // 扫描带的世界 Y（-999 表示关闭）
uniform float uPulse;
uniform float uDetail;    // 器官专属细节模式（0 关 / 1 心 / 2 脑 / 3 肺 / 4 肝 / 5 胃 / 6 肠 / 7 肾）
uniform float uObjH;      // 主体世界高度（纹理频率按「每器官周期数」归一化）
uniform float uCardSys;   // 心室收缩期（冠脉被挤压、心肌略缺血变暗）
uniform float uCardAtr;   // 心房收缩期
uniform float uHeartMode;
uniform vec4  uHeartBox;  // mesh 局部：minY/maxY/轴心X/轴心Z
uniform float uFlush;     // 血流抵达时的潮红（联动动画用）
varying vec3 vObjP;
varying vec3 vWorldP;
varying vec3 vViewDirW;
${NOISE}
`;

const FRAG_COLOR = /* glsl */`
// —— 程序化组织纹理 ——
// 频率纪律：varying vWorldP 是三角形逐片线性插值，噪声频率超过「网格顶点跨度」
// 就会在三角形边界相位跳变——渲染成满屏的三角形碎斑。所有纹理统一用
// nP = 世界坐标 / 器官高度 归一化，最细不超过 ~12 周期/器官。
vec3 nP3 = vWorldP / max(uObjH, 1e-4);
float f1 = fbm(nP3 * 2.5);
float f2 = vnoise(nP3 * 6.0);
float f3 = vnoise(nP3 * 11.0);

// 毛细血管：两组正交扭曲的正弦脊线取最小值，形成细密网状
float w = fbm(nP3 * 1.1) * 4.0;
float l1 = abs(sin((nP3.x * 0.75 + nP3.y * 0.42 + w) * 6.28318));
float l2 = abs(sin((nP3.z * 0.86 - nP3.y * 0.32 + w * 0.8) * 6.28318));
float vein = pow(1.0 - min(l1, l2), 10.0);
vein *= smoothstep(0.48, 0.76, fbm(nP3 * 1.8 + 4.0)) * uVein;

// 组织色：基底 + 大块色斑 + 细颗粒 + 血管暗线
vec3 base = uTint;
base *= 0.80 + 0.40 * f1;
base *= 0.94 + 0.12 * f2;
base = mix(base, base * 1.18, smoothstep(0.58, 0.92, f3) * 0.20);
base = mix(base, uVeinColor, clamp(vein, 0.0, 0.8));

// —— 器官专属细节（每种脏器一眼可辨的结构特征）——
float rghV = 0.80 + 0.55 * fbm(nP3 * 2.2 + 23.0);   // 粗糙度斑驳：湿块与干块交替
if (uDetail > 0.5) {
  float w2 = fbm(nP3 * 1.3) * 4.0;
  if (uDetail < 1.5) {
    // 心脏：冠状沟（房室沟）压暗环 + 沟内心外膜脂肪 + 螺旋心肌纤维。
    // 冠脉主支已由 heartvessels.js 用实体管贴在表面，这里不再用正弦亮线冒充血管。
    float hh = clamp((vObjP.y - uHeartBox.x) / max(1e-5, uHeartBox.y - uHeartBox.x), 0.0, 1.0);
    float ang = atan(vObjP.z - uHeartBox.w, vObjP.x - uHeartBox.z);
    float groove = 0.63 + 0.055 * sin(ang * 1.35 + 0.6);
    float sulcus = 1.0 - smoothstep(0.012, 0.052, abs(hh - groove));
    base *= 1.0 - 0.30 * sulcus;
    // 心外膜脂肪：淡黄斑块，集中在房室沟与心底大血管根部周围
    float fatN = fbm(nP3 * 3.0 + vec3(7.0, 2.0, 1.0));
    float fat = smoothstep(0.58, 0.80, fatN) * (0.45 * smoothstep(0.48, 0.86, hh) + 0.55 * sulcus);
    base = mix(base, vec3(0.55, 0.40, 0.21), clamp(fat, 0.0, 0.62) * 0.62);
    // 心肌纤维螺旋走向（频率守纪律，避免逐三角形走样成碎斑）
    float fiber = sin(hh * 9.0 + ang * 2.4 + fbm(nP3 * 1.6) * 2.0);
    base *= 1.0 - 0.045 * pow(abs(fiber), 2.0);
    base *= 0.90 + 0.16 * hh;                       // 心尖肉厚色深、心底略浅
    // 收缩期心肌挤压冠脉 → 略暗；舒张期充血 → 更鲜红（冠脉主要在舒张期灌注）
    base *= 1.0 - 0.085 * uCardSys;
    base = mix(base, base * vec3(1.12, 0.92, 0.91), 0.30 * (1.0 - uCardSys));
    rghV *= 1.0 + 0.30 * sulcus + 0.15 * fat;
  } else if (uDetail < 2.5) {
    // 大脑：脑沟回（扭曲脊线，沟底压暗、脑回提亮）
    float g1 = abs(sin((nP3.x * 2.0 + w2) * 3.4));
    float g2 = abs(sin((nP3.z * 1.8 - w2 * 0.8) * 3.2));
    float gy = pow(1.0 - min(g1, g2), 2.6);
    base *= 1.0 - 0.24 * gy;
    base = mix(base, base * 1.18, smoothstep(0.55, 0.9, gy));
    rghV *= 1.0 + 0.3 * gy;
  } else if (uDetail < 3.5) {
    // 肺：肺泡细斑驳 + 局部淤血点
    float al = vnoise(nP3 * 6.0) * 0.6 + vnoise(nP3 * 11.0) * 0.4;
    base *= 0.90 + 0.20 * al;
    base = mix(base, uVeinColor * 1.3, smoothstep(0.78, 0.95, vnoise(nP3 * 4.5)) * 0.25);
  } else if (uDetail < 4.5) {
    // 肝：肝小叶边界（压暗的网格线）+ 胆汁区淡晕
    vec2 cw = vec2(nP3.x * 2.6 + w2, nP3.z * 2.4 - w2 * 0.7);
    vec2 cf = abs(fract(cw) - 0.5);
    float lob = 1.0 - smoothstep(0.30, 0.5, max(cf.x, cf.y));
    base *= 1.0 - 0.14 * lob;
    base = mix(base, base * vec3(0.9, 1.05, 0.85), 0.25 * smoothstep(0.7, 0.95, fbm(nP3 * 1.2 + 31.0)));
  } else if (uDetail < 6.5) {
    // 胃 / 肠：黏膜皱褶横环 + 局部充血
    float fold = sin(nP3.y * 11.0 + w2 * 1.6);
    base *= 1.0 - 0.10 * pow(abs(fold), 2.0);
    base = mix(base, uVeinColor * 1.4, smoothstep(0.72, 0.94, fbm(nP3 * 2.8)) * 0.3);
  } else {
    // 肾：髓质放线（纵向亮线）+ 光滑包膜
    base = mix(base, base * 1.22, pow(max(sin(nP3.y * 3.5 + w2), 0.0), 8.0) * 0.35);
  }
}

// 联动动画：血流抵达器官时的「潮红」，是血色变化而不是霓虹发光
base = mix(base, base * vec3(1.26, 0.84, 0.82), clamp(uFlush, 0.0, 1.0) * 0.55);

diffuseColor.rgb *= base / max(uTint, vec3(0.001));
`;

// 微起伏：用噪声梯度轻微扰动法线，表面就不是玻璃球而是有肌理的肉。
// 频率同样守纪律（≤8 周期/器官），否则法线噪声本身就会碎斑化。
// 必须注入到 <normal_fragment_begin> 之后——那里 normal 才刚被声明。
const FRAG_BUMP = /* glsl */`
{
  vec3 nP4 = vWorldP / max(uObjH, 1e-4);
  float e = 0.06;
  float h0 = fbm(nP4 * 2.6) + 0.55 * fbm(nP4 * 7.0);
  float hx = fbm((nP4 + vec3(e, 0.0, 0.0)) * 2.6) + 0.55 * fbm((nP4 + vec3(e, 0.0, 0.0)) * 7.0);
  float hy = fbm((nP4 + vec3(0.0, e, 0.0)) * 2.6) + 0.55 * fbm((nP4 + vec3(0.0, e, 0.0)) * 7.0);
  vec3 grad = vec3(hx - h0, hy - h0, 0.0) / e;
  normal = normalize(normal - grad * 0.045);
}
`;

const FRAG_EMISSIVE = /* glsl */`
{
  // 次表面散射近似：视线与法线越接近垂直（边缘），组织越透出内里的血色
  float ndv = clamp(abs(dot(normalize(normal), normalize(vViewDirW))), 0.0, 1.0);
  float sss = pow(1.0 - ndv, 2.6) * uSss;
  // 心跳时整体亮一点，像血涌进来
  sss *= 0.75 + 0.55 * uPulse;
  totalEmissiveRadiance += uSssColor * sss;

  // 扫描光带：一条沿 Y 上下走的亮线，骨骼/器官扫描的经典画面语言
  float band = smoothstep(0.016, 0.0, abs(vWorldP.y - uScan));
  totalEmissiveRadiance += uScanColor * band * 1.6;

  // 湿润感：正对视线处一层极薄的高光膜
  float wet = pow(ndv, 8.0) * uWet;
  totalEmissiveRadiance += vec3(0.055) * wet;
}
`;

/* ---------------- 器官外观参数 ---------------- */
// vein：血管网；sss：透光；wet：湿润度（纹理频率已按器官归一化，无需 grain）
const LOOK = {
  heart:    { vein: 0.85, grain: 26, sss: 0.55, wet: 0.9, veinColor: 0x7a1622, sssColor: 0xff5a63 },
  lungs:    { vein: 0.5,  grain: 34, sss: 0.42, wet: 0.7, veinColor: 0x8d3a48, sssColor: 0xff9d9d },
  brain:    { vein: 0.3,  grain: 14, sss: 0.26, wet: 0.75, veinColor: 0x8a5560, sssColor: 0xffb4c0 },
  liver:    { vein: 0.7,  grain: 20, sss: 0.40, wet: 0.85, veinColor: 0x6d2418, sssColor: 0xff7a58 },
  stomach:  { vein: 0.45, grain: 30, sss: 0.42, wet: 0.9, veinColor: 0xa33f2c, sssColor: 0xff9a6a },
  kidney:   { vein: 0.8,  grain: 24, sss: 0.38, wet: 0.8, veinColor: 0x6f1f2a, sssColor: 0xff7f8c },
  intestine:{ vein: 0.6,  grain: 28, sss: 0.48, wet: 1.0, veinColor: 0xa8492f, sssColor: 0xffa87a },
  bone:     { vein: 0.12, grain: 40, sss: 0.12, wet: 0.35, veinColor: 0x9a8b70, sssColor: 0xffe6c0 },
  default:  { vein: 0.5,  grain: 26, sss: 0.4, wet: 0.8, veinColor: 0x7d3340, sssColor: 0xff8f80 },
};

/**
 * 生成器官材质。用 MeshPhysicalMaterial 是为了拿到 clearcoat（湿润的那层膜）
 * 与 sheen（薄组织的绒感），这两样是「像不像肉」的关键。
 */
export function createOrganMaterial(tint, kind, opts = {}) {
  const L = LOOK[kind] || LOOK.default;
  const m = new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.52,
    metalness: 0.0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.42,
    sheen: 0.28,
    sheenColor: new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.4),
    sheenRoughness: 0.75,
    // 绕向已在 surface.js 里统一为「朝外」，实心器官用 FrontSide 剔除
    // 自穿插褶皱的背面（特写黑斑的来源）；薄壁骨骼仍用双面防漏光
    side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    // 底光：极轻的自发光保底，任何朝向的碎片都不会掉成纯黑
    emissive: new THREE.Color(tint).multiplyScalar(0.10),
    // 环境光反射强度调高：翻折褶皱处法线背光的碎片靠环境光提亮，不再死黑
    envMapIntensity: 2.1,
  });
  if (opts.color) m.color.copy(opts.color);

  const uni = {
    uTint: { value: new THREE.Color(tint) },
    uVeinColor: { value: new THREE.Color(L.veinColor) },
    uSssColor: { value: new THREE.Color(L.sssColor) },
    uScanColor: { value: new THREE.Color(opts.scanColor ?? 0x9fe3ff) },
    uTime: { value: 0 },
    uVein: { value: L.vein * (opts.veinScale ?? 1) },
    uSss: { value: L.sss },
    uWet: { value: L.wet },
    uScan: { value: -999 },
    uPulse: { value: 0 },
    uWave: { value: 0 },
    uWaveAmp: { value: 0 },
    uDetail: { value: opts.detail ?? 0 },
    uObjH: { value: opts.objH ?? 0.12 },
    uHeartMode: { value: opts.heartBox ? 1 : 0 },
    uHeartBox: { value: opts.heartBox || new THREE.Vector4(-0.07, 0.07, 0, 0) },
    uCardSys: { value: 0 },
    uCardAtr: { value: 0 },
    uCardTwist: { value: 0 },
    uFlush: { value: 0 },
  };
  m.userData.uni = uni;

  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uni);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + NORMAL_MAIN)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      // rghV 在 color_fragment 里算好，这里顺势调制粗糙度：湿处更亮更锐
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= clamp(rghV, 0.55, 1.35);')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n' + FRAG_BUMP)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE);
  };
  // 保证多份材质共用同一个 program 缓存键（uniform 不同不影响）
  m.customProgramCacheKey = () => 'organ-v3';
  return m;
}

/* ---------------- 器官动态 ---------------- */
// 心跳节律统一由 cardiac.js 提供：分期收缩 + 动脉压力波（重搏波），
// 心肌、冠脉、联动管网用同一个 t 算相位，才不会出现「心肌缩了血管才慢半拍亮」。
// 呼吸：吸气快、呼气慢（4.4 秒一个周期）
function breath(t) {
  const u = (t / 4.4) % 1;
  const up = 1 - Math.cos(Math.min(1, u / 0.42) * Math.PI);
  const dn = 1 - Math.cos(Math.min(1, (1 - u) / 0.58) * Math.PI);
  return 0.5 * Math.min(up, dn);
}

/**
 * 给一个器官主体建动画器：只动 group 的 scale/position，退出时一键复位。
 * @param {string} kind 主体 key
 * @param {THREE.Object3D} group 器官分组
 * @param {object} ctx { scale } 世界尺度（人体 scale）
 * @param {Array} mats 需要逐帧喂 uniform 的材质数组
 */
export function createOrganAnim(kind, group, ctx, mats) {
  const baseScale = group.scale.clone();
  const basePos = group.position.clone();
  const s = ctx.scale || 1;
  const baseWaves = mats.map(m => (m.userData.uni ? m.userData.uni.uWaveAmp.value : 0));

  return {
    update(t) {
      const C = cardiac(t);
      const b = C.pulse;          // 动脉压力波：器官光泽、SSS 随血压变化
      const br = breath(t);
      let sx = 1, sy = 1, sz = 1, dy = 0, rz = 0;

      switch (kind) {
        case 'heart':
          // 心室/心房分区收缩、螺旋扭转、长轴缩短全在顶点着色器里做，
          // 这里只留整体极轻微的「心底下沉」，避免再叠一个橡皮球缩放。
          dy = -0.0016 * s * C.sys;
          break;
        case 'lungs':
          // 肺叶随吸气膨胀，垂直方向最明显，整体被膈肌顶起
          sx = 1 + 0.048 * br;
          sy = 1 + 0.085 * br;
          sz = 1 + 0.056 * br;
          dy = 0.004 * s * br;
          break;
        case 'brain':
          // 脑随脉搏微胀（颅骨内振幅极小，只有 1%）
          sx = sy = sz = 1 + 0.012 * b;
          break;
        case 'liver':
        case 'kidney':
          // 肝、肾被膈肌带着上下走
          sx = sz = 1 + 0.008 * br;
          sy = 1 + 0.012 * br;
          dy = 0.0025 * s * br;
          break;
        case 'intestine':
        case 'stomach':
          // 管腔器官主要靠蠕动波（在着色器里），整体只做极轻起伏
          sy = 1 + 0.010 * br;
          dy = 0.0018 * s * br;
          break;
        default:
          break;
      }

      group.scale.set(baseScale.x * sx, baseScale.y * sy, baseScale.z * sz);
      group.position.set(basePos.x, basePos.y + dy, basePos.z);
      group.rotation.z = rz;

      // 逐帧 uniform：脉搏、蠕动相位、扫描带
      const scanOn = kind === 'skull' || kind === 'ribcage' || kind === 'spine' ||
                     kind === 'pelvis' || kind === 'skeleton';
      for (const m of mats) {
        const u = m.userData.uni;
        if (!u) continue;
        u.uTime.value = t;
        u.uPulse.value = b;
        if (u.uCardSys) {
          u.uCardSys.value = C.sys;
          u.uCardAtr.value = C.atrial;
          u.uCardTwist.value = C.twist;
        }
        if (u.uWaveAmp.value > 0) u.uWave.value = t;
        if (scanOn) {
          // 扫描带：从主体上沿走到下沿，走完停 1.2 秒再来
          const cyc = 4.6;
          const p = (t % cyc) / cyc;
          const k = Math.min(1, p / 0.78);
          u.uScan.value = ctx.scanTop + (ctx.scanBottom - ctx.scanTop) * k;
        }
      }
    },
    reset() {
      group.scale.copy(baseScale);
      group.position.copy(basePos);
      group.rotation.z = 0;
      mats.forEach((m, i) => {
        const u = m.userData.uni;
        if (!u) return;
        u.uScan.value = -999;
        u.uPulse.value = 0;
        if (u.uCardSys) {
          u.uCardSys.value = 0;
          u.uCardAtr.value = 0;
          u.uCardTwist.value = 0;
        }
        u.uFlush && (u.uFlush.value = 0);
        u.uWave.value = 0;
        u.uWaveAmp.value = baseWaves[i];
      });
    },
  };
}

/** 蠕动幅度：按器官包围盒高度给，管腔器官才有 */
export function waveAmpFor(kind, sizeY) {
  if (kind === 'intestine') return sizeY * 0.012;
  if (kind === 'stomach') return sizeY * 0.016;
  return 0;
}
