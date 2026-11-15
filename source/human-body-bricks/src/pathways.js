// pathways.js — 系统联动之二/三/四：神经冲动、消化链、免疫防御
//
// 与 linkage.js（循环系统）并列，共用同一套「真实包围盒取锚点」的思路，
// 但三套系统的表现语言完全不同：
//   · 神经：细的髓鞘管，郎飞结处明暗分节，一串**离散的金色动作电位**沿管
//     以有限速度往下跑（脑 → 脊髓 → 脏器 → 四肢），脉冲抵达哪个器官，
//     哪个器官就短暂应答（潮红 + 光晕），像一张会放电的神经网络
//   · 消化：粗一些的消化管，管壁带**蠕动收缩环**（顶点级径向内凹），
//     暖色食糜团被推着走；小肠段分出金色的养分粒子走门静脉入肝，
//     再由肝入心、随血送到全身，器官按「胃→肠→肝→心→脑」的顺序亮起
//   · 免疫：青绿色**淋巴管 + 瓣膜分节**，白细胞沿管慢速巡游；颈/腋/纵隔/
//     肠系膜/腹股沟一整串**淋巴结**按回流方向依次激活（膨胀 + 扩散环），
//     中枢免疫器官（骨髓 / 胸腺 / 脾 / 扁桃体）常亮呼吸；肺内病灶处
//     白细胞成群聚集收拢，随后金色抗体沿血路播散到脑、肝、肾、肺
//
// 全部路线都由 records 的真实包围盒算出来，换模型/换缩放自动跟随。
import * as THREE from '../lib/three.module.js';
import { vesselGeometry } from './vascular.js';

/* ---------------- 通路管壁着色器 ---------------- */
// 自定义 ShaderMaterial（不是血管的 MeshPhysical）：神经要的是「鞘 + 尖峰」，
// 消化要的是「黏膜 + 蠕动环」，都不需要 PBR 反射。
const WALL_VERT = /* glsl */`
attribute float aU;
attribute float aR;
uniform float uTime;
uniform float uSpeed;
uniform float uSqueeze;     // 蠕动收缩幅度（神经为 0）
varying float vU;
varying vec3 vN;
varying vec3 vV;
void main() {
  vU = aU;
  // 收缩环沿弧长推进：fract 每圈一个环，指数窗让它成为局部凹陷而非整管缩放
  float w = fract(aU * 3.0 - uTime * uSpeed * 0.30) - 0.5;
  float squeeze = -uSqueeze * exp(-w * w * 26.0);
  vec3 p = position + normal * (aR * squeeze);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const WALL_FRAG = /* glsl */`
uniform vec3 uBase;
uniform vec3 uPulseCol;
uniform float uTime;
uniform float uSpeed;
uniform float uCount;
uniform float uWidth;
uniform float uPhase;
uniform float uOpacity;
uniform float uSegments;
uniform float uGain;        // 管壁基质亮度增益（神经要在 X 光鬼影上读得出来）
uniform float uPulseGain;   // 脉冲尖峰单独收亮，避免 bloom 把冷色管洗成白线
varying float vU;
varying vec3 vN;
varying vec3 vV;
void main() {
  // 一串等间距的脉冲：x = u*count - t*speed，fract 每跨 1 出一个尖峰；
  // 改 t 时整串沿 u 正方向平移，就是「信号在往前跑」而不是「整条管一起闪」
  float x = vU * uCount - uTime * uSpeed + uPhase;
  float f = fract(x) - 0.5;
  float spike = exp(-f * f / max(1e-4, uWidth * uWidth));
  // 分节：神经 = 密集郎飞结，消化 = 稀疏结肠袋
  float seg = abs(fract(vU * uSegments) - 0.5) * 2.0;
  float myelin = mix(0.40, 1.0, smoothstep(0.02, 0.42, seg));
  // 圆柱体积感靠 Fresnel 亮度，不靠加色洗白
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.7);
  vec3 col = uBase * myelin * (0.46 + 0.66 * fres) * uGain
           + uPulseCol * spike * (1.30 + 0.95 * fres) * uPulseGain;
  float a = uOpacity * (0.58 + 0.42 * fres + 0.95 * spike * uPulseGain);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

/* ---------------- 粒子：动作电位 / 食糜团 / 养分 ---------------- */
const PARTICLE_VERT = /* glsl */`
attribute vec3 aOffset;
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = uv;
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
  mv.xy += position.xy * aSize;
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = /* glsl */`
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float body = smoothstep(1.0, 0.18, d);
  float core = pow(smoothstep(0.62, 0.0, d), 2.0);
  gl_FragColor = vec4(vColor * (0.58 + 0.72 * core), clamp((0.40 * body + 0.46 * core) * vAlpha, 0.0, 1.0));
}`;

let GLOW_TEX = null;
function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.24, 'rgba(255,255,255,0.66)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  GLOW_TEX = new THREE.CanvasTexture(cv);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  return GLOW_TEX;
}

let RING_TEX = null;
/** 淋巴结激活时向外扩散的一圈薄环（用 Sprite 省掉朝向相机的计算） */
function ringTexture() {
  if (RING_TEX) return RING_TEX;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.60, 'rgba(255,255,255,0)');
  g.addColorStop(0.76, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.86, 'rgba(255,255,255,0.34)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  RING_TEX = new THREE.CanvasTexture(cv);
  RING_TEX.colorSpace = THREE.SRGBColorSpace;
  return RING_TEX;
}

/* ---------------- 两套系统的画面配方 ---------------- */
const CFG = {
  neuro: {
    base: 0xd8b878, pulse: 0xffe6a0, particle: 0xfff0c4, glow: 0xffd98a,
    blending: THREE.AdditiveBlending, opacity: 0.92,
    segments: 30, width: 0.066, responseWidth: 0.11, glowStrength: 0.34,
    gain: 2.15, pulseGain: 1.0,
    particleBlending: THREE.AdditiveBlending,
  },
  digest: {
    base: 0xb2734c, pulse: 0xffbe6b, particle: 0xffd88e, glow: 0xffb86a,
    blending: THREE.NormalBlending, opacity: 0.86,
    segments: 7, width: 0.085, responseWidth: 0.22, glowStrength: 0.24,
    gain: 1.0, pulseGain: 1.0,
    particleBlending: THREE.NormalBlending,
  },
  immune: {
    base: 0x36b3a6, pulse: 0xc9fff4, particle: 0xbdf5ec, glow: 0x72e8cc,
    blending: THREE.AdditiveBlending, opacity: 0.78,
    segments: 22, width: 0.072, responseWidth: 0.16, glowStrength: 0.15,
    // 加色青绿在黑底上很容易被推成白线：增益压到 1.3 才保得住「淋巴液」的冷色
    gain: 1.30, pulseGain: 0.52,
    particleBlending: THREE.AdditiveBlending,
  },
};
// 器官应答时的「潮红」强度：免疫应答比神经信号更明显
const FLUSH = { neuro: 0.28, digest: 0.65, immune: 0.55 };

/** 控制点之间补侧向偏移的中点，避免长距离管子绷成直线 */
function soften(pts, s) {
  const out = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push(a.clone());
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len > 1e-6) {
      d.divideScalar(len);
      const side = new THREE.Vector3().crossVectors(d, up);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const amp = Math.min(len * 0.06, 0.018 * s);
      out.push(a.clone().lerp(b, 0.5).addScaledVector(side, amp * Math.sin(i * 2.31 + 0.7)));
    }
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

/**
 * @param {object} hooks { records, bodyMeta, organs, scene, system }
 *   system: 'neuro' | 'digest' | 'immune'
 *   organs: [{ id, group, mats }]（studio 里已换好生物材质的实体器官）
 */
export function createPathway(hooks) {
  const kind = hooks.system === 'immune' ? 'immune'
             : hooks.system === 'digest' ? 'digest' : 'neuro';
  const C = CFG[kind];
  const s = hooks.bodyMeta.scale || 1;
  const group = new THREE.Group();
  const disposables = [];
  const wallMats = [];
  const flashes = [];
  const nodes = [];            // 免疫专属：淋巴结 / 中枢免疫器官 / 病灶
  const organs = hooks.organs || [];
  const NODE_PERIOD = 9;       // 淋巴结依次激活的一个周期（秒）

  /* ---------- 锚点：真实包围盒 ---------- */
  const A = new Map();
  for (const id of ['brain', 'skull', 'eyes', 'nose', 'mouth', 'neck', 'cervical', 'thoracic', 'lumbar',
                    'sacrum', 'coccyx', 'ribs', 'sternum', 'heart', 'lungs', 'liver', 'stomach', 'kidney', 'spleen',
                    'smallIntestine', 'largeIntestine', 'arms', 'hands', 'legs', 'feet', 'pelvis', 'bladder']) {
    const rec = hooks.records.get(id);
    if (!rec || !rec.group) continue;
    const box = new THREE.Box3().setFromObject(rec.group);
    if (!box.isEmpty()) A.set(id, { c: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) });
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const has = (...ids) => ids.every(id => A.has(id));
  // pt(id, fx, fy, fz)：锚点中心 + 包围盒尺寸的比例偏移
  const pt = (id, fx = 0, fy = 0, fz = 0) => {
    const a = A.get(id);
    return a.c.clone().add(V(a.size.x * fx, a.size.y * fy, a.size.z * fz));
  };

  const routes = [];
  const add = o => { if (o.pts.length >= 2) routes.push(o); };

  if (kind === 'neuro') {
    /* 中枢：脑 → 椎管 → 骶尾，一串电位沿脊髓往下跑 */
    if (has('brain', 'cervical', 'thoracic', 'lumbar', 'sacrum')) {
      add({ id: 'cord', pts: [
        pt('brain', 0, -0.50, -0.12), pt('cervical', 0, 0.40, -0.22),
        pt('thoracic', 0, 0.18, -0.24), pt('lumbar', 0, -0.10, -0.22),
        pt('sacrum', 0, 0.20, -0.10)],
        radius: 0.0105 * s, count: 7, speed: 1.45, squeeze: 0,
        flash: [{ id: 'brain', at: 0.05 }], dot: 0.9 });
      // 脑神经短支：到眼、到颌面
      for (const id of ['eyes', 'mouth']) {
        if (!A.has(id)) continue;
        add({ id: `cranial-${id}`, pts: [pt('brain', 0, -0.28, 0.15), pt(id, 0, 0.1, -0.1), pt(id)],
          radius: 0.0056 * s, count: 2, speed: 2.35, squeeze: 0, dot: 0.7 });
      }
    }
    /* 迷走神经：脑 → 颈 → 心/肺 → 胃 → 肝 → 肠，一条长链串起胸腹腔 */
    if (has('brain', 'heart', 'lungs', 'stomach', 'liver', 'smallIntestine')) {
      add({ id: 'vagus', pts: [
        pt('brain', -0.05, -0.55, 0.18),
        has('neck') ? pt('neck', -0.05, 0.30, 0.25) : pt('brain', -0.08, -0.75, 0.20),
        pt('heart', -0.05, 0.42, 0.10), pt('lungs', -0.05, -0.28, 0.12),
        pt('stomach', 0.02, 0.42, 0.10), pt('liver', -0.12, -0.20, 0.10),
        pt('smallIntestine', -0.05, 0.32, 0.10)],
        radius: 0.0080 * s, count: 8, speed: 1.25, squeeze: 0,
        flash: [
          { id: 'heart', at: 0.36 }, { id: 'lungs', at: 0.48 },
          { id: 'stomach', at: 0.70 }, { id: 'liver', at: 0.82 },
          { id: 'smallIntestine', at: 0.94 },
        ], dot: 0.85 });
    }
    /* 交感链：胸段两侧下行，分支到肾、脾 */
    if (has('thoracic', 'kidney', 'lumbar')) {
      for (const side of [-1, 1]) {
        add({ id: `symp${side}`, pts: [
          pt('thoracic', side * 0.16, 0.34, -0.16),
          pt('thoracic', side * 0.20, -0.20, -0.16),
          pt('lumbar', side * 0.18, 0.26, -0.14),
          pt('kidney', side * 0.24, 0.06, -0.10)],
          radius: 0.0062 * s, count: 4, speed: 1.75, squeeze: 0,
          flash: [{ id: 'kidney', at: 0.92 }], dot: 0.7 });
      }
    }
    /* 肋间神经：胸段逐节向两侧发出弧形分支，神经网络才有「树」的密度 */
    if (has('thoracic', 'ribs')) {
      const th = A.get('thoracic'), rib = A.get('ribs');
      for (let i = 0; i < 6; i++) {
        const fy = 0.36 - i * 0.135;
        for (const side of [-1, 1]) {
          add({ id: `inter${i}_${side}`, pts: [
            pt('thoracic', side * 0.05, fy, -0.20),
            pt('thoracic', side * 0.22, fy - 0.02, 0.02),
            V(rib.c.x + side * rib.size.x * 0.34,
              th.c.y + th.size.y * fy - th.size.y * 0.04,
              rib.c.z + rib.size.z * 0.10)],
            radius: 0.0028 * s, count: 2, speed: 1.95, squeeze: 0, dot: 0.55 });
        }
      }
    }
    /* 臂丛 → 手；腰骶丛 → 足 */
    if (has('cervical', 'arms', 'hands')) {
      for (const side of [-1, 1]) {
        add({ id: `brach${side}`, pts: [
          pt('cervical', side * 0.22, -0.20, 0),
          pt('arms', side * 0.30, 0.34, 0.02), pt('arms', side * 0.36, -0.30, 0.02),
          pt('hands', side * 0.18, 0, 0)],
          radius: 0.0062 * s, count: 5, speed: 2.05, squeeze: 0, dot: 0.7 });
      }
    }
    if (has('lumbar', 'legs', 'feet')) {
      for (const side of [-1, 1]) {
        add({ id: `sciatic${side}`, pts: [
          pt('lumbar', side * 0.20, -0.30, -0.10),
          pt('legs', side * 0.26, 0.34, 0.02), pt('legs', side * 0.28, -0.30, 0.02),
          pt('feet', side * 0.14, 0, 0)],
          radius: 0.0068 * s, count: 6, speed: 1.90, squeeze: 0, dot: 0.7 });
      }
    }
  } else if (kind === 'digest') {
    /* 消化管：胃 → 小肠 → 大肠，管壁蠕动环推着食糜走 */
    if (has('stomach', 'smallIntestine', 'largeIntestine')) {
      add({ id: 'bolus', pts: [
        pt('stomach', 0.05, 0.40, 0.05), pt('stomach', -0.05, -0.42, 0.08),
        pt('smallIntestine', 0.02, 0.44, 0.06), pt('smallIntestine', -0.10, -0.10, 0.10),
        pt('smallIntestine', 0.08, -0.42, 0.08),
        pt('largeIntestine', 0.30, 0.42, 0.04), pt('largeIntestine', -0.28, -0.20, 0.04),
        pt('largeIntestine', 0, -0.45, 0.02)],
        radius: 0.0115 * s, count: 3, speed: 0.46, squeeze: 0.30,
        flash: [
          { id: 'stomach', at: 0.10 }, { id: 'smallIntestine', at: 0.48 },
          { id: 'largeIntestine', at: 0.90 },
        ], dot: 1.45 });
    }
    /* 吸收：小肠 → 门静脉 → 肝；大肠水与电解质也汇入 */
    if (has('smallIntestine', 'liver')) {
      add({ id: 'absorb', pts: [
        pt('smallIntestine', -0.10, 0.30, -0.14),
        pt('liver', -0.18, -0.44, -0.10), pt('liver', 0, -0.12, 0)],
        radius: 0.0056 * s, count: 5, speed: 1.35, squeeze: 0.08,
        flash: [{ id: 'liver', at: 0.90 }], dot: 0.62,
        base: 0xd6a468, pulse: 0xffdf95, particle: 0xffe7a8 });
      if (A.has('largeIntestine')) {
        add({ id: 'water', pts: [
          pt('largeIntestine', 0.22, 0.34, -0.12),
          pt('liver', 0.16, -0.42, -0.10), pt('liver', 0.02, -0.16, 0)],
          radius: 0.0042 * s, count: 3, speed: 1.05, squeeze: 0.06,
          dot: 0.55, base: 0xc09060, pulse: 0xffd891, particle: 0xffe0a0 });
      }
    }
    /* 养分入血：肝 → 心 → 脑 / 四肢，金色粒子随血播散 */
    if (has('liver', 'heart', 'brain', 'lungs')) {
      add({ id: 'toBrain', pts: [
        pt('liver', 0.04, 0.42, -0.06), pt('heart', 0, 0.10, 0),
        pt('lungs', 0, -0.15, 0.10), pt('brain', 0, -0.42, 0.05)],
        radius: 0.0050 * s, count: 4, speed: 1.55, squeeze: 0,
        flash: [{ id: 'heart', at: 0.34 }, { id: 'brain', at: 0.94 }],
        dot: 0.60, base: 0xc98a5e, pulse: 0xffd784, particle: 0xffe9ad });
      if (has('legs', 'feet')) {
        add({ id: 'toBody', pts: [
          pt('heart', -0.04, -0.35, 0), pt('legs', 0.16, 0.34, 0.02),
          pt('legs', 0.16, -0.34, 0.02), pt('feet', 0.10, 0, 0)],
          radius: 0.0044 * s, count: 4, speed: 1.45, squeeze: 0,
          dot: 0.55, base: 0xc98a5e, pulse: 0xffd784, particle: 0xffe9ad });
      }
    }
  } else {
    /* ================= 免疫：淋巴回流 / 白细胞巡游 / 病灶应答 ================= */
    // ① 下肢毛细淋巴 → 腹股沟结 → 髂/腰干 → 乳糜池 → 胸导管 → 左静脉角 → 心
    if (has('feet', 'legs', 'pelvis', 'lumbar', 'thoracic', 'heart')) {
      for (const side of [-1, 1]) {
        add({ id: `lymphLeg${side}`, pts: [
          pt('feet', side * 0.16, 0, 0),
          pt('legs', side * 0.26, -0.30, 0.06), pt('legs', side * 0.26, 0.32, 0.06),
          pt('pelvis', side * 0.30, -0.34, 0.14),
          pt('lumbar', side * 0.18, 0.08, 0.20),
          pt('thoracic', side * 0.10, 0.18, 0.18),
          pt('heart', -0.06, 0.36, 0.02)],
          radius: 0.0082 * s, count: 5, speed: 0.72, squeeze: 0.10, dot: 1.10,
          flash: [{ id: 'heart', at: 0.98 }] });
      }
    }
    // ② 上肢 → 腋淋巴结 → 锁骨下干 → 静脉角（左右各一支，右侧走右淋巴导管）
    if (has('hands', 'arms', 'ribs', 'heart')) {
      for (const side of [-1, 1]) {
        add({ id: `lymphArm${side}`, pts: [
          pt('hands', side * 0.16, 0, 0),
          pt('arms', side * 0.34, -0.30, 0.04), pt('arms', side * 0.30, 0.34, 0.04),
          V(A.get('ribs').c.x + side * A.get('ribs').size.x * 0.30,
            A.get('ribs').c.y + A.get('ribs').size.y * 0.30,
            A.get('ribs').c.z + A.get('ribs').size.z * 0.08),
          pt('heart', side * 0.14, 0.42, 0.04)],
          radius: 0.0074 * s, count: 4, speed: 0.86, squeeze: 0.10, dot: 1.05 });
      }
    }
    // ③ 头颈：鼻咽/扁桃体 → 颈深淋巴结 → 锁骨下干
    if (has('nose', 'mouth', 'neck', 'heart')) {
      add({ id: 'lymphHead', pts: [
        pt('nose', 0, -0.10, -0.10), pt('mouth', 0, -0.12, -0.10),
        pt('neck', 0, 0.10, 0.16), pt('neck', 0, -0.34, 0.14),
        pt('heart', 0, 0.44, 0.06)],
        radius: 0.0070 * s, count: 4, speed: 0.90, squeeze: 0.10, dot: 1.05 });
    }
    // ④ 肠系膜淋巴：小肠/大肠 → 肠系膜结 → 乳糜池 → 肝/脾
    if (has('smallIntestine', 'largeIntestine', 'liver', 'spleen', 'lumbar', 'stomach')) {
      add({ id: 'lymphGut', pts: [
        pt('smallIntestine', -0.12, 0.10, 0.16), pt('smallIntestine', 0.14, -0.16, 0.16),
        pt('largeIntestine', 0.24, 0.30, 0.10),
        pt('lumbar', 0.10, 0.16, 0.20),
        pt('liver', -0.06, -0.40, -0.06)],
        radius: 0.0086 * s, count: 4, speed: 0.68, squeeze: 0.12, dot: 1.20,
        flash: [{ id: 'liver', at: 0.92 }, { id: 'smallIntestine', at: 0.22 }] });
      add({ id: 'lymphSpleen', pts: [
        pt('spleen', 0, 0, 0.06), pt('stomach', -0.20, 0.10, 0.02),
        pt('lumbar', -0.10, 0.14, 0.18)],
        radius: 0.0060 * s, count: 3, speed: 0.95, squeeze: 0.06, dot: 1.00,
        flash: [{ id: 'spleen', at: 0.10 }] });
    }
    // ⑤ 白细胞免疫监视：骨髓/胸腺/脾 → 心 → 肺 → 脑 → 外周（随血巡游）
    if (has('sternum', 'heart', 'lungs', 'brain', 'pelvis')) {
      add({ id: 'patrolCore', pts: [
        pt('pelvis', 0, 0.20, -0.08), pt('sternum', 0, -0.10, -0.10),
        pt('sternum', 0, 0.34, -0.10), pt('heart', 0, 0.12, 0),
        pt('lungs', 0, -0.10, 0.10), pt('brain', 0, -0.44, 0.04)],
        radius: 0.0062 * s, count: 6, speed: 1.05, squeeze: 0,
        flash: [{ id: 'lungs', at: 0.72 }, { id: 'brain', at: 0.96 }],
        dot: 0.82, base: 0x48b9ae, pulse: 0xbdf7ec, particle: 0xd9fff6 });
      if (has('legs', 'feet')) {
        add({ id: 'patrolBody', pts: [
          pt('heart', -0.04, -0.32, 0), pt('legs', 0.16, 0.32, 0.02),
          pt('legs', 0.16, -0.32, 0.02), pt('feet', 0.10, 0, 0)],
          radius: 0.0048 * s, count: 5, speed: 1.12, squeeze: 0,
          dot: 0.78, base: 0x48b9ae, pulse: 0xbdf7ec, particle: 0xd9fff6 });
      }
    }
    // ⑥ 病原入侵（红）与抗原递呈：鼻咽 → 肺内病灶 → 纵隔淋巴结
    if (has('nose', 'mouth', 'lungs', 'heart')) {
      add({ id: 'invader', pts: [
        pt('nose', 0, -0.10, 0.06), pt('mouth', 0, -0.16, 0.06),
        pt('lungs', 0.24, 0.10, 0.16), pt('lungs', 0.26, -0.06, 0.18)],
        radius: 0.0048 * s, count: 3, speed: 0.62, squeeze: 0,
        dot: 0.95, base: 0xb2403a, pulse: 0xff6b52, particle: 0xff8a6a });
      add({ id: 'antigen', pts: [
        pt('lungs', 0.26, -0.06, 0.18), pt('lungs', 0.10, 0.12, 0.10),
        pt('heart', 0, 0.34, -0.10)],
        radius: 0.0052 * s, count: 3, speed: 0.80, squeeze: 0.06,
        dot: 0.95, base: 0xd06a48, pulse: 0xffb27a, particle: 0xffc79a });
    }
    // ⑦ 抗体播散：脾/纵隔结 → 心 → 脑 / 肝 / 肾 / 肺，金色一波压过红色入侵
    if (has('spleen', 'heart', 'brain', 'liver', 'kidney', 'lungs', 'smallIntestine')) {
      add({ id: 'antibodyBrain', pts: [
        pt('spleen', 0, 0.10, 0), pt('heart', 0, 0.10, 0),
        pt('lungs', 0, -0.10, 0.08), pt('brain', 0, -0.44, 0.04)],
        radius: 0.0058 * s, count: 4, speed: 1.30, squeeze: 0,
        flash: [{ id: 'heart', at: 0.30 }, { id: 'lungs', at: 0.58 }, { id: 'brain', at: 0.96 }],
        dot: 0.90, base: 0xc99a46, pulse: 0xffd889, particle: 0xffe4a8 });
      add({ id: 'antibodyGut', pts: [
        pt('heart', 0.04, -0.24, 0), pt('liver', 0.06, 0.24, 0.04),
        pt('kidney', 0.12, 0.02, -0.06), pt('smallIntestine', 0, 0.20, 0.10)],
        radius: 0.0050 * s, count: 4, speed: 1.18, squeeze: 0,
        flash: [{ id: 'liver', at: 0.40 }, { id: 'kidney', at: 0.70 }],
        dot: 0.86, base: 0xc99a46, pulse: 0xffd889, particle: 0xffe4a8 });
    }
  }

  /* ---------- 管壁 ---------- */
  for (const r of routes) {
    const curve = new THREE.CatmullRomCurve3(soften(r.pts, s), false, 'catmullrom', 0.5);
    r.curve = curve;
    r.len = curve.getLength();
    const segs = Math.max(56, Math.min(176, Math.round(r.len / (0.005 * s))));
    const geo = vesselGeometry(curve, u => {
      const taper = 1 - 0.32 * u;
      const bulb = 1 + 0.10 * Math.exp(-Math.pow(u / 0.07, 2));
      return r.radius * taper * bulb;
    }, segs, 9);
    const uni = {
      uTime: { value: 0 }, uSpeed: { value: r.speed }, uCount: { value: r.count },
      uWidth: { value: C.width }, uPhase: { value: (r.id.length * 0.137) % 1 },
      uOpacity: { value: C.opacity }, uSegments: { value: C.segments },
      uGain: { value: C.gain },
      uPulseGain: { value: C.pulseGain },
      uSqueeze: { value: r.squeeze || 0 },
      uBase: { value: new THREE.Color(r.base ?? C.base) },
      uPulseCol: { value: new THREE.Color(r.pulse ?? C.pulse) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: WALL_VERT, fragmentShader: WALL_FRAG, uniforms: uni,
      transparent: true, depthWrite: false, depthTest: false,
      // 免疫是加色管：双面会让前后壁各加一次亮度，叠 bloom 直接洗成白线；
      // 只画外壁，冷青绿才留得住（神经/消化仍用双面保住细管可读性）
      blending: C.blending, side: kind === 'immune' ? THREE.FrontSide : THREE.DoubleSide,
    });
    wallMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 16;
    mesh.frustumCulled = false;
    group.add(mesh);
    disposables.push(geo, mat);

    // 单个脉冲从起点走到终点耗时 count/speed；器官应答延迟按弧长比例算
    r.travel = r.count / r.speed;
    for (const f of (r.flash || [])) if (f.id) f.delay = (f.at ?? 1) * r.travel;
  }

  /* ---------- 免疫专属：一整串淋巴结 + 中枢免疫器官 + 病灶 ---------- */
  // 位置全部由真实包围盒推出来：颈深结贴颈、腋结在腋窝、纵隔结在心底部、
  // 肠系膜结贴小肠、腹股沟结在骨盆下缘；骨髓/胸腺/脾/扁桃体是「中枢」常亮。
  const nodeGeo = new THREE.SphereGeometry(1, 14, 10);
  disposables.push(nodeGeo);
  if (kind === 'immune') {
    const TONE = {
      lymph:   { base: 0x3fae9f, hot: 0xa9f0dc },
      central: { base: 0xd8a45e, hot: 0xffe0a0 },
      marrow:  { base: 0xd97852, hot: 0xffb98a },
      lesion:  { base: 0xe0493f, hot: 0xff9d76 },
    };
    const defs = [
      { id: 'tonsil',   at: 'mouth',           fx: 0,     fy: 0.02,  fz: -0.14, r: 0.013, tone: 'central', phase: 0.04 },
      { id: 'cervL',    at: 'neck',            fx: -0.20, fy: 0.14,  fz: 0.18,  r: 0.014, phase: 0.15 },
      { id: 'cervR',    at: 'neck',            fx: 0.20,  fy: 0.14,  fz: 0.18,  r: 0.014, phase: 0.18 },
      { id: 'axilL',    at: 'arms',            fx: -0.30, fy: 0.34,  fz: 0.02,  r: 0.015, phase: 0.29 },
      { id: 'axilR',    at: 'arms',            fx: 0.30,  fy: 0.34,  fz: 0.02,  r: 0.015, phase: 0.32 },
      { id: 'thymus',   at: 'sternum',         fx: 0,     fy: 0.34,  fz: -0.12, r: 0.018, tone: 'central', phase: 0.10 },
      { id: 'marrowS',  at: 'sternum',         fx: 0,     fy: -0.12, fz: -0.08, r: 0.015, tone: 'marrow',  phase: 0.22 },
      { id: 'marrowP',  at: 'pelvis',          fx: 0,     fy: 0.18,  fz: -0.10, r: 0.017, tone: 'marrow',  phase: 0.25 },
      { id: 'spleenN',  at: 'spleen',          fx: 0,     fy: 0,     fz: 0.04,  r: 0.021, tone: 'central', phase: 0.36 },
      { id: 'mediast',  at: 'heart',           fx: 0,     fy: 0.36,  fz: -0.12, r: 0.017, phase: 0.47, focus: true },
      { id: 'lesion',   at: 'lungs',           fx: 0.26,  fy: 0.02,  fz: 0.18,  r: 0.020, tone: 'lesion',  phase: 0.43, focus: true },
      { id: 'mesent',   at: 'smallIntestine',  fx: 0,     fy: 0.06,  fz: 0.18,  r: 0.017, phase: 0.58 },
      { id: 'paraAo',   at: 'lumbar',          fx: 0,     fy: 0.10,  fz: 0.22,  r: 0.015, phase: 0.68 },
      { id: 'inguL',    at: 'pelvis',          fx: -0.30, fy: -0.36, fz: 0.16,  r: 0.015, phase: 0.79 },
      { id: 'inguR',    at: 'pelvis',          fx: 0.30,  fy: -0.36, fz: 0.16,  r: 0.015, phase: 0.82 },
    ];
    for (const d of defs) {
      if (!A.has(d.at)) continue;
      const tone = d.tone || 'lymph';
      // 结节放大到肉眼可读即可，再大就成了卡通灯泡（0.68 仍比真实比例夸张数倍）
      const r = d.r * s * 0.68;
      const pos = pt(d.at, d.fx, d.fy, d.fz);
      const base = new THREE.Color(TONE[tone].base);
      const hot = new THREE.Color(TONE[tone].hot);

      // 实体反而不是加色：加色球叠上 bloom 会变成一颗纯白灯泡（不是淋巴结）。
      // 用普通混合的深青绿椭圆做「结」的肉，激活亮度交给外面那层加色光晕/扩散环。
      const coreMat = new THREE.MeshBasicMaterial({
        color: base.clone(), transparent: true, opacity: 0.80,
        blending: THREE.NormalBlending, depthWrite: false, depthTest: false,
      });
      const core = new THREE.Mesh(nodeGeo, coreMat);
      // 淋巴结是扁的蚕豆/胶囊，不是发光灯泡：横向略宽、纵向略扁
      core.position.copy(pos); core.scale.set(r * 1.20, r * 0.78, r * 0.95);
      core.rotation.z = (d.phase * 7.3) % 1.2 - 0.6;
      core.renderOrder = 19; core.frustumCulled = false;
      group.add(core);

      // 线框壳也不加色：加色网格叠 bloom 会糊成一整块白斑，看不出「被膜」结构
      const shellMat = new THREE.MeshBasicMaterial({
        color: base.clone(), wireframe: true, transparent: true, opacity: 0.42,
        blending: THREE.NormalBlending, depthWrite: false, depthTest: false,
      });
      const shell = new THREE.Mesh(nodeGeo, shellMat);
      shell.position.copy(pos); shell.scale.setScalar(r * 1.55);
      shell.renderOrder = 19; shell.frustumCulled = false;
      group.add(shell);

      const haloMat = new THREE.SpriteMaterial({
        map: glowTexture(), color: base.clone(), transparent: true, opacity: 0.035,
        depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Sprite(haloMat);
      halo.position.copy(pos); halo.scale.set(r * 2.3, r * 2.3, 1);
      halo.renderOrder = 19;
      group.add(halo);

      const ringMat = new THREE.SpriteMaterial({
        map: ringTexture(), color: hot.clone(), transparent: true, opacity: 0,
        depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Sprite(ringMat);
      ring.position.copy(pos); ring.scale.set(r * 2, r * 2, 1);
      ring.renderOrder = 20;
      group.add(ring);

      disposables.push(coreMat, shellMat, haloMat, ringMat);
      nodes.push({ id: d.id, pos, r, tone, phase: d.phase, focus: !!d.focus,
                   shape: new THREE.Vector3(1.20, 0.78, 0.95),
                   base, hot, core, coreMat, shell, shellMat, halo, haloMat, ring, ringMat, act: 0 });
    }
  }

  /* ---------- 粒子：骑在脉冲上的亮点 ---------- */
  const quad = new THREE.PlaneGeometry(1, 1);
  const inst = new THREE.InstancedBufferGeometry();
  inst.index = quad.index;
  inst.setAttribute('position', quad.attributes.position);
  inst.setAttribute('uv', quad.attributes.uv);
  const items = [];
  for (let ri = 0; ri < routes.length; ri++) {
    const r = routes[ri];
    // 每条管放 count 组、每组 2 个亮点，位置与 shader 的尖峰相位对齐
    for (let k = 0; k < r.count; k++) {
      for (let j = 0; j < 2; j++) {
        items.push({ r: ri,
          u0: (k + 0.5) / r.count + (j - 0.5) * 0.012,
          size: r.radius * 3.4 * (r.dot ?? 1) * (0.75 + Math.random() * 0.5),
          alpha: 0.5 + Math.random() * 0.4 });
      }
    }
  }
  // 免疫专属：病灶 / 引流淋巴结周围成群巡游的白细胞，激活时向中心收拢变亮
  if (kind === 'immune') {
    nodes.forEach((n, ni) => {
      if (!n.focus) return;
      for (let k = 0; k < 26; k++) {
        items.push({
          r: 0, u0: 0, gather: ni,
          phase: Math.random() * Math.PI * 2,
          rad: 0.7 + Math.random() * 1.7,
          spin: 0.55 + Math.random() * 0.95,
          size: n.r * (0.40 + Math.random() * 0.48),
          alpha: 0.42 + Math.random() * 0.45,
          hex: k % 5 === 0 ? 0xff8a6a : 0xc9f5ea,
        });
      }
    });
  }
  const N = items.length;
  if (N) {
    const off = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const col = new Float32Array(N * 3);
    const alp = new Float32Array(N);
    const c = new THREE.Color();
    items.forEach((it, i) => {
      const r = routes[it.r];
      siz[i] = it.size;
      alp[i] = it.alpha;
      c.setHex(it.hex ?? r.particle ?? C.particle);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    });
    inst.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3).setUsage(THREE.DynamicDrawUsage));
    inst.setAttribute('aSize', new THREE.InstancedBufferAttribute(siz, 1));
    inst.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
    inst.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alp, 1).setUsage(THREE.DynamicDrawUsage));
    const pmat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG,
      transparent: true, depthWrite: false, depthTest: false,
      blending: C.particleBlending,
    });
    const pts = new THREE.Mesh(inst, pmat);
    pts.renderOrder = 17;
    pts.frustumCulled = false;
    group.add(pts);
    disposables.push(inst, pmat);
  }

  /* ---------- 器官应答：脉冲抵达 → 潮红 + 淡光晕 ---------- */
  const delayOf = new Map();
  for (const r of routes) {
    for (const f of (r.flash || [])) {
      if (!f.id) continue;
      const prev = delayOf.get(f.id);
      if (prev === undefined || f.delay < prev) delayOf.set(f.id, f.delay);
    }
  }
  for (const o of organs) {
    const delay = delayOf.get(o.id);
    if (delay === undefined) continue;
    const box = new THREE.Box3().setFromObject(o.group);
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3());
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: C.glow,
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(box.getCenter(new THREE.Vector3()));
    const sc = Math.max(size.x, size.y, size.z) * 1.30;
    sp.scale.set(sc, sc, 1);
    sp.renderOrder = 18;
    group.add(sp);
    disposables.push(mat);
    // 到货节拍跟「负责这条应答的路线」同频：脉冲每 1/speed 秒来一次
    const beatSpeed = routes.reduce((mx, r) =>
      (r.flash || []).some(x => x.id === o.id && Math.abs(x.delay - delay) < 1e-4)
        ? Math.max(mx, r.speed) : mx, 0) || 1.5;
    flashes.push({ mats: o.mats, delay, beatSpeed, sprite: sp, mat, base: sc });
  }

  /* ---------- 每帧 ---------- */
  function arrive(t, delay, speed) {
    const x = (t - delay) * speed + 0.5;
    const ph = ((x % 1) + 1) % 1;
    const d = ph - 0.5;
    return Math.exp(-(d * d) / (C.responseWidth * C.responseWidth));
  }
  function update(t) {
    for (const m of wallMats) m.uniforms.uTime.value = t;

    // 淋巴结：按回流方向依次激活（膨胀 → 变白 → 向外扩出一圈环）；
    // 中枢免疫器官改为缓慢呼吸，病灶用红色更强的一拍
    for (const n of nodes) {
      const q = (((t / NODE_PERIOD - n.phase) % 1) + 1) % 1;
      const d = Math.min(q, 1 - q);
      const central = n.tone === 'central' || n.tone === 'marrow';
      const a = central
        ? 0.30 + 0.26 * (0.5 + 0.5 * Math.sin(t * 0.75 + n.phase * 12.0))
        : Math.exp(-(d * d) / (0.065 * 0.065));
      n.act = a;
      n.coreMat.color.copy(n.base).lerp(n.hot, Math.min(1, a * 0.55));
      // 保持蚕豆形比例，只整体放大；线框壳略微外扩，读得出「结」的结构
      const kc = n.r * (1 + 0.50 * a), ks = n.r * 1.55 * (1 + 0.25 * a);
      n.core.scale.set(n.shape.x * kc, n.shape.y * kc, n.shape.z * kc);
      n.shell.scale.set(n.shape.x * ks, n.shape.y * ks, n.shape.z * ks);
      n.shellMat.opacity = 0.40 + 0.22 * a;
      n.haloMat.opacity = 0.03 + 0.13 * a;
      const hs = n.r * (2.3 + 1.2 * a);
      n.halo.scale.set(hs, hs, 1);
      const rq = Math.min(q / 0.32, 1);
      const rs = n.r * (2.0 + 12.0 * rq);
      n.ring.scale.set(rs, rs, 1);
      n.ringMat.opacity = q < 0.32 ? (1 - rq) * 0.30 * (central ? 0.45 : 1) : 0;
    }

    if (N) {
      const off = inst.attributes.aOffset.array;
      const alpArr = inst.attributes.aAlpha.array;
      for (let i = 0; i < N; i++) {
        const it = items[i];
        if (it.gather !== undefined) {
          // 白细胞绕病灶巡游；淋巴结激活时半径收拢、亮度抬升 = 「聚集亮起」
          const n = nodes[it.gather];
          const ang = it.phase + t * 0.72 * it.spin;
          const rr = it.rad * n.r * (2.8 - 1.85 * n.act);
          off[i * 3]     = n.pos.x + Math.cos(ang) * rr;
          off[i * 3 + 1] = n.pos.y + Math.sin(ang * 1.7) * rr * 0.55;
          off[i * 3 + 2] = n.pos.z + Math.sin(ang) * rr;
          alpArr[i] = it.alpha * (0.28 + 0.72 * n.act);
          continue;
        }
        const r = routes[it.r];
        // 与着色器同一相位：vU = (n + t*speed)/count
        const u = (it.u0 + t * r.speed / r.count) % 1;
        const p = r.curve.getPointAt(u);
        off[i * 3] = p.x; off[i * 3 + 1] = p.y; off[i * 3 + 2] = p.z;
        alpArr[i] = it.alpha;
      }
      inst.attributes.aOffset.needsUpdate = true;
      inst.attributes.aAlpha.needsUpdate = true;
    }
    for (const f of flashes) {
      const a = arrive(t, f.delay, f.beatSpeed);
      for (const m of f.mats) {
        const u = m.userData && m.userData.uni;
        if (!u) continue;
        u.uPulse.value = a * 0.85;
        if (u.uFlush) u.uFlush.value = a * (FLUSH[kind] ?? 0.28);
        if (u.uSss) {
          if (u.uSssBase === undefined) u.uSssBase = u.uSss.value;
          u.uSss.value = u.uSssBase * (1 + 0.30 * a);
        }
      }
      f.mat.opacity = C.glowStrength * a;
      const k = 1 + 0.16 * a;
      f.sprite.scale.set(f.base * k, f.base * k, 1);
    }
  }

  function dispose() {
    for (const f of flashes) {
      for (const m of f.mats) {
        const u = m.userData && m.userData.uni;
        if (!u) continue;
        if (u.uSssBase !== undefined) { u.uSss.value = u.uSssBase; delete u.uSssBase; }
        u.uPulse.value = 0;
        if (u.uFlush) u.uFlush.value = 0;
      }
    }
    hooks.scene.remove(group);
    disposables.forEach(d => d.dispose && d.dispose());
    quad.dispose();
  }

  return { group, update, dispose, routeCount: routes.length, nodeCount: nodes.length,
           particleCount: N };
}
