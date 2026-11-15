// physio-extra.js — 生理动画「补完包」：原帮助面板里 5 项待做动画
//
//   泌尿过滤 / 吞咽与发声 / 运动响应 / 损伤修复 / 视觉与听觉
//
// 与 physio.js 的八套共用同一套「CatmullRom 曲线 + 半透明管 + 流动粒子」语言，
// 但各自额外挂了组织标记（肾小球、会厌、声带、骨痂、鼓膜…），并让真实解剖
// 形状跟着周期动起来。做成独立模块是为了不让 physio.js 继续膨胀：
//
//   EXTRA_FLOWS   → Object.assign 进 FLOWS
//   EXTRA_DECOR   → build() 时按 modeId 调用，往场景里加柔光标记
//   EXTRA_MOTION  → applyMotion() 时按 modeId 调用，驱动形状与标记
//   EXTRA_LOOK    → cinema.js 的电影调色
//
// 坐标与 physio.js 一致：1.71 米体高的局部米制，脸朝 +z，x 左右对称。
// 所有坐标在 Flow 与装饰里统一乘 k()（= 实际体高 / 1.71）。
import * as THREE from '../lib/three.module.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const pulse = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));

/* ---------------- 五套曲线路径 ---------------- */
export const EXTRA_FLOWS = {
  /* 泌尿过滤：肾动脉入球 → 肾小球滤过 → 肾小管重吸收 → 集合管 → 输尿管 → 膀胱 → 排尿 */
  urinary: [
    {
      id: 'renalIn', both: true, duration: 6.5, count: 26, size: 0.0052,
      radius: 0.0042, tube: 0.10, tubeOpacity: 0.11,
      colors: [[0, 0xff6a72], [1, 0xd94a58]],
      points: [
        [0.010, 1.330, 0.020], [0.018, 1.250, -0.018], [0.050, 1.180, -0.035], [0.080, 1.140, -0.045],
      ],
    },
    {
      id: 'filtrate', both: true, duration: 9.0, count: 36, size: 0.0058,
      radius: 0.0036, tube: 0.10, tubeOpacity: 0.17, tubeColor: 0xffd98a,
      colors: [[0, 0xfff4c8], [0.42, 0xffd873], [1, 0xf2ac36]],
      points: [
        [0.080, 1.140, -0.045], [0.096, 1.112, -0.040], [0.090, 1.078, -0.035],
        [0.070, 1.066, -0.030], [0.064, 1.088, -0.030], [0.078, 1.102, -0.032],
        [0.070, 1.044, -0.035], [0.060, 1.020, -0.030], [0.050, 1.000, -0.025],
        [0.040, 0.965, -0.020], [0.034, 0.930, -0.015], [0.024, 0.905, -0.010],
        [0.008, 0.890, 0.000],
      ],
    },
    // 重吸收：蓝色粒子从肾小管「回到」毛细血管，_counter-流_ 直观表现 99% 被收回
    {
      id: 'reabsorb', both: true, duration: 7.5, count: 20, size: 0.0048, radius: 0, tube: 0,
      gap: 0.06, wrap: 1.08,
      colors: [[0, 0x9fe8ff], [1, 0x6fb8e8]],
      points: [
        [0.072, 1.078, -0.032], [0.055, 1.105, -0.030], [0.034, 1.160, -0.030], [0.016, 1.220, -0.020],
      ],
    },
    {
      id: 'void', duration: 4.2, count: 10, size: 0.0054,
      radius: 0.0032, tube: 0.07, tubeOpacity: 0.12,
      gap: 0.10, wrap: 1.12,
      colors: [[0, 0xffd873], [1, 0xe8a83c]],
      points: [
        [0.000, 0.890, 0.005], [0.000, 0.874, 0.020], [0.000, 0.854, 0.035], [0.000, 0.830, 0.045],
      ],
    },
  ],

  /* 吞咽与发声：食团经咽入食管；气流 pingpong 往返；发声气流由肺经喉冲出口鼻 */
  swallow: [
    {
      id: 'bolus', duration: 4.8, count: 9, size: 0.0095,
      radius: 0.0065, tube: 0.16, tubeOpacity: 0.20, tubeColor: 0xd9a469,
      gap: 0.11, wrap: 1.15,
      colors: [[0, 0xf7d9a8], [1, 0xc98a4e]],
      points: [
        [0.000, 1.575, 0.078], [0.000, 1.545, 0.046], [0.000, 1.500, 0.020],
        [0.000, 1.474, 0.006], [0.000, 1.446, -0.005], [0.000, 1.402, -0.015],
        [0.000, 1.340, -0.020], [0.000, 1.280, -0.015], [0.000, 1.222, 0.000],
        [0.020, 1.192, 0.020],
      ],
    },
    {
      id: 'air', pingpong: true, duration: 2.6, count: 30, size: 0.0052,
      radius: 0.0058, tube: 0.14, tubeOpacity: 0.18, tubeColor: 0x8fd8f0,
      gap: 0.05,
      colors: [[0, 0xdaf7ff], [1, 0x74d0f5]],
      colorsBack: [[0, 0xa9c4d8], [1, 0x7f9bb8]],
      points: [
        [0.000, 1.600, 0.090], [0.000, 1.550, 0.050], [0.000, 1.500, 0.020],
        [0.000, 1.465, 0.012], [0.000, 1.430, 0.005], [0.000, 1.400, 0.000],
        [0.000, 1.375, -0.005], [0.050, 1.350, -0.015], [0.075, 1.300, -0.020],
        [-0.075, 1.300, -0.020],
      ],
    },
    {
      id: 'voice', duration: 3.4, count: 24, size: 0.0048, radius: 0, tube: 0,
      gap: 0.055, wrap: 1.10,
      colors: [[0, 0xffe6a0], [1, 0xffb84a]],
      points: [
        [0.000, 1.300, -0.020], [0.000, 1.360, -0.010], [0.000, 1.420, 0.002],
        [0.000, 1.455, 0.012], [0.000, 1.490, 0.025], [0.000, 1.545, 0.055],
        [0.000, 1.590, 0.100], [0.000, 1.610, 0.170],
      ],
    },
  ],

  /* 运动响应：红色动脉流加速灌腿、蓝色静脉回流、青色呼吸变快、内脏血流相对变少 */
  exertion: [
    {
      id: 'heartToLeg', both: true, duration: 2.6, count: 42, size: 0.0062,
      radius: 0.0068, tube: 0.12, tubeOpacity: 0.15,
      colors: [[0, 0xff5a4a], [0.5, 0xff8a5c], [1, 0xffc27a]],
      points: [
        [0.010, 1.330, 0.030], [0.012, 1.200, -0.030], [0.020, 1.050, -0.040],
        [0.050, 0.900, -0.030], [0.090, 0.750, 0.000], [0.100, 0.550, 0.000],
        [0.100, 0.320, 0.000], [0.110, 0.120, 0.020],
      ],
    },
    {
      id: 'venousReturn', both: true, duration: 3.2, count: 30, size: 0.0054,
      radius: 0.0056, tube: 0.10, tubeOpacity: 0.09,
      colors: [[0, 0x6f9ad8], [1, 0x9fc4f0]],
      points: [
        [0.110, 0.120, -0.020], [0.100, 0.350, -0.020], [0.090, 0.620, -0.020],
        [0.050, 0.880, -0.040], [0.010, 1.050, -0.050], [0.000, 1.240, -0.030],
      ],
    },
    {
      id: 'lungFast', pingpong: true, duration: 1.8, count: 38, size: 0.0058,
      radius: 0.0060, tube: 0.14, tubeOpacity: 0.19, tubeColor: 0x8fe6ff,
      gap: 0.04,
      colors: [[0, 0xe6fbff], [1, 0x74d8ff]],
      colorsBack: [[0, 0xa9bfd4], [1, 0x7f9bb8]],
      points: [
        [0.000, 1.600, 0.090], [0.000, 1.500, 0.030], [0.000, 1.430, 0.010],
        [0.000, 1.385, 0.000], [0.070, 1.330, -0.020], [0.060, 1.270, -0.020],
      ],
    },
    // 内脏血流「让路」：粒子最少、最慢、最暗，与腿部密集橙红形成对比
    {
      id: 'gutSpare', duration: 6.5, count: 12, size: 0.0040,
      radius: 0.0030, tube: 0.06, tubeOpacity: 0.05,
      colors: [[0, 0xb9824a], [1, 0x8a6038]],
      points: [
        [0.010, 1.320, 0.000], [0.020, 1.220, -0.020], [0.030, 1.160, 0.000], [0.050, 1.100, 0.010],
      ],
    },
  ],

  /* 损伤修复：血小板聚集、成骨细胞到骨折处、修复细胞到拉伤处、血栓机化后再通 */
  repair: [
    {
      id: 'platelet', both: true, duration: 5.5, count: 28, size: 0.0052,
      radius: 0.0040, tube: 0.09, tubeOpacity: 0.12,
      colors: [[0, 0xffd9d0], [1, 0xff7a68]],
      points: [
        [0.020, 1.200, -0.030], [0.050, 1.000, -0.030], [0.080, 0.750, -0.020],
        [0.100, 0.500, 0.000], [0.110, 0.360, 0.010],
      ],
    },
    {
      id: 'osteoblast', both: true, duration: 7.5, count: 24, size: 0.0054,
      radius: 0.0036, tube: 0.08, tubeOpacity: 0.11,
      colors: [[0, 0xfff0b8], [1, 0xe8b45a]],
      points: [
        [-0.100, 1.200, -0.020], [-0.180, 1.120, 0.000], [-0.240, 1.020, 0.020], [-0.280, 0.960, 0.030],
      ],
    },
    {
      id: 'myoblast', both: true, duration: 8.2, count: 22, size: 0.0050,
      radius: 0.0034, tube: 0.08, tubeOpacity: 0.10,
      colors: [[0, 0xbff5d8], [1, 0x6fd6a8]],
      points: [
        [0.030, 0.900, -0.020], [0.070, 0.780, 0.000], [0.100, 0.680, 0.020], [0.110, 0.620, 0.030],
      ],
    },
    {
      id: 'recanal', duration: 6.0, count: 18, size: 0.0046,
      radius: 0.0030, tube: 0.07, tubeOpacity: 0.08,
      colors: [[0, 0x8fe6ff], [1, 0x5fb0e8]],
      points: [
        [0.100, 0.500, -0.020], [0.110, 0.380, 0.000], [0.110, 0.300, 0.010], [0.100, 0.220, 0.020],
      ],
    },
  ],

  /* 视觉与听觉：光线聚焦视网膜 → 视神经入脑；声波经鼓膜耳蜗 → 听神经入脑 */
  senses: [
    {
      id: 'lightRay', both: true, duration: 3.2, count: 30, size: 0.0066,
      radius: 0.0018, tube: 0.06, tubeOpacity: 0.24, tubeColor: 0xffe9a8,
      gap: 0.038, wrap: 1.10,
      colors: [[0, 0xfff8d8], [1, 0xffd86a]],
      points: [
        [0.030, 1.635, 0.340], [0.030, 1.635, 0.200], [0.030, 1.635, 0.135],
        [0.030, 1.635, 0.115], [0.026, 1.633, 0.095], [0.020, 1.632, 0.060],
        [0.012, 1.632, 0.020],
      ],
    },
    {
      id: 'optic', both: true, duration: 3.2, count: 20, size: 0.0058,
      radius: 0.0014, tube: 0.05, tubeOpacity: 0.20, tubeColor: 0xffd86a,
      gap: 0.055, wrap: 1.10,
      colors: [[0, 0xffd86a], [1, 0xffe9a8]],
      points: [
        [0.012, 1.632, 0.020], [0.010, 1.635, -0.010], [0.008, 1.640, -0.035], [0.000, 1.645, -0.055],
      ],
    },
    {
      id: 'soundWave', both: true, duration: 2.8, count: 32, size: 0.0064,
      radius: 0.0016, tube: 0.06, tubeOpacity: 0.22, tubeColor: 0x8fd8ff,
      gap: 0.036, wrap: 1.10,
      colors: [[0, 0xa8e8ff], [1, 0x5fb8f0]],
      points: [
        [-0.300, 1.590, 0.060], [-0.220, 1.585, 0.050], [-0.150, 1.580, 0.040],
        [-0.105, 1.578, 0.030], [-0.090, 1.575, 0.010], [-0.082, 1.572, -0.010],
        [-0.075, 1.570, -0.025],
      ],
    },
    {
      id: 'auditory', both: true, duration: 2.8, count: 18, size: 0.0056,
      radius: 0.0014, tube: 0.05, tubeOpacity: 0.18, tubeColor: 0x7fd0ff,
      gap: 0.055, wrap: 1.10,
      colors: [[0, 0x7fd0ff], [1, 0xffe0a0]],
      points: [
        [-0.075, 1.570, -0.025], [-0.060, 1.590, -0.035], [-0.040, 1.615, -0.040], [0.000, 1.635, -0.050],
      ],
    },
  ],
};

/* ---------------- 场景装饰：柔光标记 ---------------- */
// ctx: { g, rec, k, softGlow }；统一把需要逐帧更新的对象推入 rec.extra
function mark(ctx, colorHex, size, opacity, pos, kind, fields = {}) {
  const m = ctx.softGlow(colorHex, size * ctx.k, opacity);
  m.position.set(pos[0] * ctx.k, pos[1] * ctx.k, pos[2] * ctx.k);
  ctx.g.add(m);
  ctx.rec.extra.push({ mesh: m, kind, base: size * ctx.k, ...fields });
  return m;
}

export const EXTRA_DECOR = {
  urinary(ctx) {
    for (const s of [-1, 1]) {
      mark(ctx, 0xffe08a, 0.022, 0.72, [s * 0.082, 1.140, -0.045], 'glomerulus', { side: s });
    }
    mark(ctx, 0xffc44e, 0.042, 0.60, [0, 0.890, 0.012], 'bladderGlow');
    mark(ctx, 0x9fe8ff, 0.016, 0.45, [0, 1.100, -0.030], 'reabsorbGlow');
  },
  swallow(ctx) {
    mark(ctx, 0xffb27a, 0.030, 0.80, [0, 1.468, 0.016], 'epiglottis');
    for (const s of [-1, 1]) {
      mark(ctx, 0xffe6a0, 0.016, 0.80, [s * 0.012, 1.452, 0.016], 'vocal', { side: s });
    }
    mark(ctx, 0x9fe8ff, 0.020, 0.40, [0, 1.400, 0.002], 'trachea');
  },
  exertion(ctx) {
    for (const s of [-1, 1]) {
      mark(ctx, 0xff8a5c, 0.055, 0.50, [s * 0.100, 0.620, 0.030], 'heat', { side: s });
    }
    mark(ctx, 0xff5a6a, 0.040, 0.55, [0.020, 1.300, 0.040], 'heartGlow');
    mark(ctx, 0x8fe6ff, 0.045, 0.42, [0, 1.300, -0.020], 'lungGlow');
  },
  repair(ctx) {
    mark(ctx, 0xff5a4a, 0.040, 0.90, [-0.280, 0.960, 0.030], 'lesion', { tone: 'fracture' });
    mark(ctx, 0xff5a4a, 0.035, 0.90, [0.110, 0.620, 0.030], 'lesion', { tone: 'strain' });
    mark(ctx, 0xff4a3a, 0.030, 0.92, [0.110, 0.360, 0.020], 'clot');
  },
  senses(ctx) {
    for (const s of [-1, 1]) {
      mark(ctx, 0xfff5d0, 0.014, 0.78, [s * 0.012, 1.632, 0.020], 'retina', { side: s });
      mark(ctx, 0x8fe0ff, 0.022, 0.66, [s * 0.090, 1.575, 0.012], 'eardrum', { side: s });
    }
    mark(ctx, 0xffd86a, 0.026, 0.65, [0.000, 1.648, -0.055], 'visualCortex');
    mark(ctx, 0xc9a8ff, 0.026, 0.65, [-0.020, 1.628, -0.050], 'audioCortex');
  },
};

/* ---------------- 器官动作 ---------------- */
// ctx: { t, phase, k, scaleOf, rotateGroup, rec, beat }
const C_HOT = new THREE.Color(0xff5a4a);
const C_BONE = new THREE.Color(0xffd27a);
const C_MUSCLE = new THREE.Color(0x8fe8b4);
const C_FADE = new THREE.Color(0x7fa8c8);
const C_CLOT_OLD = new THREE.Color(0x8a3b3b);
const C_VOCAL_IDLE = new THREE.Color(0x8096a8);
const C_VOCAL_ON = new THREE.Color(0xffe6a0);
const C_EPI_IDLE = new THREE.Color(0xffb27a);
const C_EPI_ON = new THREE.Color(0xff8a5a);

export const EXTRA_MOTION = {
  urinary({ t, phase, scaleOf, rec, beat }) {
    // 0–0.68 充盈、0.68–0.88 排空、之后重新蓄尿
    const fill = phase < 0.68
      ? ease(phase / 0.68)
      : 1 - ease((phase - 0.68) / 0.20);
    const f = clamp(fill, 0, 1);
    const b = 0.86 + 0.30 * f;
    scaleOf('bladder', b, 1 + 0.16 * (b - 1), b);
    const kp = 1 + 0.022 * beat(t);
    scaleOf('kidney', kp, kp, kp);
    for (const e of rec.extra) {
      if (e.kind === 'glomerulus') {
        const p = 0.55 + 0.45 * beat(t);
        e.mesh.material.opacity = 0.35 + 0.45 * p;
        e.mesh.scale.setScalar(e.base * (0.85 + 0.4 * p));
      } else if (e.kind === 'bladderGlow') {
        e.mesh.material.opacity = 0.20 + 0.55 * f;
        e.mesh.scale.setScalar(e.base * (0.8 + 0.8 * f));
      } else if (e.kind === 'reabsorbGlow') {
        e.mesh.material.opacity = 0.20 + 0.40 * pulse(phase, 0.46, 0.17);
        e.mesh.scale.setScalar(e.base * (0.9 + 0.3 * pulse(phase, 0.46, 0.17)));
      }
    }
  },

  swallow({ t, phase, scaleOf, rec }) {
    const sw = Math.sin(ease((phase - 0.16) / 0.20) * Math.PI); // 会厌下盖：0→1→0
    const cover = clamp(sw, 0, 1);
    const voice = clamp((phase - 0.55) / 0.12, 0, 1) * (1 - clamp((phase - 0.88) / 0.10, 0, 1));
    for (const e of rec.extra) {
      if (e.kind === 'epiglottis') {
        e.mesh.material.color.copy(C_EPI_IDLE).lerp(C_EPI_ON, cover);
        e.mesh.material.opacity = 0.45 + 0.5 * cover;
        e.mesh.scale.setScalar(e.base * (0.9 + 1.05 * cover));
      } else if (e.kind === 'vocal') {
        const vib = 0.5 + 0.5 * Math.sin(t * 58 + e.side * 1.4);
        e.mesh.material.color.copy(C_VOCAL_IDLE).lerp(C_VOCAL_ON, voice);
        e.mesh.material.opacity = 0.22 + 0.70 * voice * (0.55 + 0.45 * vib);
        e.mesh.scale.setScalar(e.base * (0.9 + 0.55 * voice * vib));
      } else if (e.kind === 'trachea') {
        e.mesh.material.opacity = 0.14 + 0.38 * (1 - cover);
      }
    }
    scaleOf('stomach', 1 + 0.012 * Math.sin(t * 2.0), 1, 1);
  },

  exertion({ t, scaleOf, rotateGroup, rec }) {
    // 快心率 0.52 秒一次；呼吸 1.8 秒一次；摆臂迈腿 1.1 秒一次
    const cp = (t / 0.52) % 1;
    const hb = pulse(cp, 0.08, 0.055) + 0.45 * pulse(cp, 0.30, 0.075);
    scaleOf('heart', 1 + 0.075 * hb, 1 - 0.035 * hb, 1 + 0.055 * hb);
    const br = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 1.8);
    const l = 1 + 0.085 * br;
    scaleOf('lungs', l, l * 0.98, l);
    const rib = 1 + 0.022 * br;
    scaleOf('ribs', rib, 1 + 0.012 * br, rib);
    const a = 0.42 * Math.sin(t * Math.PI * 2 / 1.1);
    const aLeg = 0.36 * Math.sin(t * Math.PI * 2 / 1.1 + Math.PI);
    ['humerus', 'radius', 'ulna', 'carpal', 'metacarpal', 'phalangesHand', 'biceps'].forEach(id =>
      rotateGroup(id, { x: 0, y: 1.26, z: 0 }, 'x', a));
    ['femur', 'tibia', 'fibula', 'tarsal', 'metatarsal', 'phalangesFoot', 'quadriceps'].forEach(id =>
      rotateGroup(id, { x: 0, y: 0.9, z: 0 }, 'x', aLeg));
    const tw = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 1.1);
    scaleOf('quadriceps', 1 + 0.055 * tw, 1 + 0.014 * tw, 1 + 0.055 * tw);
    scaleOf('biceps', 1 + 0.028 * tw, 1, 1 + 0.028 * tw);
    const intensity = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 / 3.5));
    for (const e of rec.extra) {
      if (e.kind === 'heat') {
        e.mesh.material.opacity = 0.20 + 0.52 * intensity;
        e.mesh.scale.setScalar(e.base * (0.85 + 0.38 * intensity));
      } else if (e.kind === 'heartGlow') {
        e.mesh.material.opacity = 0.25 + 0.55 * hb;
        e.mesh.scale.setScalar(e.base * (0.9 + 0.55 * hb));
      } else if (e.kind === 'lungGlow') {
        e.mesh.material.opacity = 0.18 + 0.38 * br;
        e.mesh.scale.setScalar(e.base * (0.9 + 0.38 * br));
      }
    }
  },

  repair({ t, phase, scaleOf, rec }) {
    const inf = ease(phase / 0.14) * (1 - ease((phase - 0.24) / 0.14)); // 炎症峰（来得快、退得慢）
    const heal = ease((phase - 0.28) / 0.38);                            // 骨痂/肉芽生长期
    const rem = ease((phase - 0.72) / 0.28);                             // 重塑收尾
    for (const e of rec.extra) {
      if (e.kind === 'lesion') {
        const target = e.tone === 'fracture' ? C_BONE : C_MUSCLE;
        e.mesh.material.color.copy(C_HOT).lerp(target, heal).lerp(C_FADE, 0.45 * rem);
        e.mesh.material.opacity = clamp(0.40 + 0.45 * inf + 0.15 * heal - 0.30 * rem, 0.08, 1);
        e.mesh.scale.setScalar(e.base * Math.max(0.3, 0.7 + 0.25 * inf + 1.45 * heal - 0.75 * rem));
      } else if (e.kind === 'clot') {
        const size = 0.35 + 1.15 * ease((phase - 0.08) / 0.30) - 1.05 * ease((phase - 0.68) / 0.28);
        e.mesh.material.color.copy(C_HOT).lerp(C_CLOT_OLD, heal);
        e.mesh.material.opacity = clamp(0.30 + 0.55 * Math.min(1, size) - 0.28 * rem, 0.06, 1);
        e.mesh.scale.setScalar(e.base * Math.max(0.12, size));
      }
    }
    // 炎症期骨折端尚未固定，轻微错动；修复期骨痂把它「焊」住并略胀；重塑期回稳
    const knit = clamp(heal - rem, 0, 1);
    const wobble = 0.028 * inf * Math.sin(t * 9);   // 骨折端未固定的细颤
    const swell = 0.030 * inf;                      // 炎症期红肿（单调可见）
    scaleOf('radius', 1 + swell + wobble + 0.018 * knit, 1, 1 + swell + wobble + 0.018 * knit);
    scaleOf('ulna', 1 + swell * 0.7 - wobble * 0.6 + 0.012 * knit, 1, 1 + swell * 0.7 - wobble * 0.6 + 0.012 * knit);
    scaleOf('quadriceps', 1 + 0.040 * inf, 1, 1 + 0.040 * inf);
  },

  senses({ t, phase, scaleOf, rec }) {
    const visual = clamp((phase - 0.02) / 0.55, 0, 1) * (1 - clamp((phase - 0.60) / 0.14, 0, 1));
    const audio = clamp((phase - 0.60) / 0.12, 0, 1);
    for (const e of rec.extra) {
      if (e.kind === 'retina') {
        const flick = 0.75 + 0.25 * Math.sin(t * 7 + e.side);
        e.mesh.material.opacity = clamp((0.22 + 0.68 * visual) * flick, 0.05, 1);
        e.mesh.scale.setScalar(e.base * (0.9 + 0.32 * visual));
      } else if (e.kind === 'eardrum') {
        const vib = 0.5 + 0.5 * Math.sin(t * 46 + e.side * 0.8);
        e.mesh.material.opacity = clamp((0.18 + 0.66 * audio) * (0.55 + 0.45 * vib), 0.05, 1);
        e.mesh.scale.setScalar(e.base * (0.85 + 0.60 * audio * vib));
      } else if (e.kind === 'visualCortex') {
        e.mesh.material.opacity = 0.16 + 0.68 * visual;
        e.mesh.scale.setScalar(e.base * (0.85 + 0.42 * visual));
      } else if (e.kind === 'audioCortex') {
        e.mesh.material.opacity = 0.16 + 0.68 * audio;
        e.mesh.scale.setScalar(e.base * (0.85 + 0.42 * audio));
      }
    }
    const bp = 1 + 0.012 * (visual + audio);
    scaleOf('brain', bp, bp, bp);
  },
};

/* ---------------- 电影调色（cinema.js 使用） ---------------- */
export const EXTRA_LOOK = {
  urinary: {
    accent: 0xffd777, rim: 0x8fe0ff, rimI: 1.8, fillI: 0.48,
    bloom: 1.55, exposure: 1.04, sat: 1.06, vignette: 0.52, grain: 0.026,
    shadow: [0.030, 0.026, 0.052], highlight: [0.052, 0.042, 0.016],
    orbit: 0.052, shake: 0.008, dolly: 0.34,
  },
  swallow: {
    accent: 0xffb27a, rim: 0x9fd8ff, rimI: 1.9, fillI: 0.5,
    bloom: 1.6, exposure: 1.05, sat: 1.08, vignette: 0.55, grain: 0.027,
    shadow: [0.044, 0.026, 0.018], highlight: [0.052, 0.034, 0.016],
    orbit: 0.045, shake: 0.007, dolly: 0.30,
  },
  exertion: {
    accent: 0xff8a5c, rim: 0xffb27a, rimI: 2.1, fillI: 0.52,
    bloom: 1.75, exposure: 1.03, sat: 1.14, vignette: 0.56, grain: 0.030,
    shadow: [0.046, 0.022, 0.020], highlight: [0.058, 0.030, 0.014],
    orbit: 0.085, shake: 0.012, dolly: 0.46,
  },
  repair: {
    accent: 0x9ce8b4, rim: 0x9fe0ff, rimI: 1.85, fillI: 0.47,
    bloom: 1.6, exposure: 1.03, sat: 1.05, vignette: 0.54, grain: 0.027,
    shadow: [0.018, 0.038, 0.040], highlight: [0.026, 0.050, 0.030],
    orbit: 0.05, shake: 0.008, dolly: 0.32,
  },
  senses: {
    accent: 0xa9d8ff, rim: 0xffd86a, rimI: 2.0, fillI: 0.46,
    bloom: 1.85, exposure: 1.0, sat: 1.10, vignette: 0.58, grain: 0.028,
    shadow: [0.014, 0.028, 0.062], highlight: [0.048, 0.040, 0.018],
    orbit: 0.042, shake: 0.006, dolly: 0.28,
  },
};
