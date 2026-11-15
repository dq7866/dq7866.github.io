// physio.js — 生理过程动画层
//
// 13 套动画都是「曲线 + 流动粒子」：血管、消化道、神经、气道等先用 CatmullRom
// 曲线定义路径（单位米，坐标取自 body.glb 的真实包围盒），再用半透明管体
// 勾出管道，粒子沿弧长匀速前进。器官层在这一层里会转成半透明，
// 才能看见里面的流动。前八套写在下面的 FLOWS 里，补完的五套在
// physio-extra.js，构建前 Object.assign 合并。
//
// 动画只改三类东西：physio 组自己的网格、心脏/胃/肺等形状的 scale 与位置。
// 拆装补间进行中的形状（records.busy）一律跳过，避免和拆解动画打架。
import * as THREE from '../lib/three.module.js';
import { PHYSIO_BY_ID } from './physio-data.js';
import { EXTRA_FLOWS, EXTRA_DECOR, EXTRA_MOTION } from './physio-extra.js';
import { bodyMeta } from './body.js';

// 坐标基准：1.71 米体高。回退到程序化模型时按实际体高整体缩放。
const BASE_HEIGHT = 1.71;

/* ---------------- 路径定义 ---------------- */
// k: 每米半径；count: 粒子数；gap: 粒子在弧长上的间隔；duration: 走完一遍秒数
const FLOWS = {
  circulation: [
    {
      id: 'pulmonary', closed: true, duration: 4.4, count: 64, size: 0.0052, radius: 0.0086, tube: 0.14, tubeOpacity: 0.12,
      colors: [[0, 0x5b8ef0], [0.32, 0x5b8ef0], [0.40, 0xffc46b], [0.48, 0xff5a6a], [1, 0xff5a6a]],
      points: [
        [0.020, 1.300, 0.035], [0.050, 1.325, 0.020], [0.080, 1.345, -0.005],
        [0.095, 1.310, -0.030], [0.070, 1.265, -0.035], [0.035, 1.235, -0.025],
        [-0.005, 1.240, -0.030], [-0.050, 1.270, -0.035], [-0.085, 1.310, -0.030],
        [-0.090, 1.345, -0.010], [-0.060, 1.360, 0.005], [-0.025, 1.335, 0.025],
      ],
    },
    {
      id: 'systemic', closed: true, duration: 5.2, count: 92, size: 0.0058, radius: 0.0098, tube: 0.13, tubeOpacity: 0.12,
      colors: [[0, 0xff5a6a], [0.42, 0xff5a6a], [0.50, 0xffc46b], [0.58, 0x5b8ef0], [1, 0x5b8ef0]],
      points: [
        [0.010, 1.335, 0.035], [0.015, 1.378, 0.020], [0.005, 1.406, 0.000],
        [-0.005, 1.386, -0.025], [0.010, 1.320, -0.048], [0.012, 1.180, -0.050],
        [0.014, 1.050, -0.050], [0.006, 0.960, -0.044], [0.002, 0.900, -0.034],
        [-0.004, 0.878, -0.028], [0.004, 0.900, -0.052], [0.004, 1.000, -0.062],
        [0.005, 1.160, -0.060], [0.000, 1.260, -0.040], [-0.010, 1.300, 0.000],
      ],
    },
    {
      id: 'cerebral', closed: true, duration: 5.6, count: 54, size: 0.0050, radius: 0.0056, tube: 0.15, tubeOpacity: 0.13,
      colors: [[0, 0xff5a6a], [0.40, 0xff5a6a], [0.48, 0xffc46b], [0.56, 0x5b8ef0], [1, 0x5b8ef0]],
      points: [
        [0.010, 1.352, 0.010], [0.022, 1.420, -0.010], [0.026, 1.480, -0.022],
        [0.026, 1.532, -0.026], [0.016, 1.570, -0.016], [0.000, 1.598, 0.000],
        [-0.016, 1.616, 0.002], [-0.022, 1.632, -0.012], [0.004, 1.640, -0.026],
        [0.024, 1.628, -0.028], [0.034, 1.598, -0.022], [0.036, 1.562, -0.026],
        [0.032, 1.516, -0.028], [0.026, 1.450, -0.026], [0.018, 1.380, -0.012],
      ],
    },
    {
      id: 'arm', both: true, closed: true, duration: 6.0, count: 46, size: 0.0050, radius: 0.0060, tube: 0.14, tubeOpacity: 0.1,
      colors: [[0, 0xff5a6a], [0.46, 0xff5a6a], [0.54, 0xffc46b], [0.62, 0x5b8ef0], [1, 0x5b8ef0]],
      points: [
        [-0.055, 1.392, -0.005], [-0.095, 1.400, 0.000], [-0.150, 1.370, 0.000],
        [-0.190, 1.280, -0.010], [-0.220, 1.160, -0.010], [-0.240, 1.060, 0.000],
        [-0.260, 0.970, 0.010], [-0.280, 0.890, 0.020], [-0.305, 0.810, 0.045],
        [-0.312, 0.880, 0.000], [-0.285, 0.950, -0.020], [-0.255, 1.050, -0.025],
        [-0.225, 1.180, -0.030], [-0.180, 1.300, -0.030], [-0.120, 1.380, -0.020],
        [-0.060, 1.396, -0.020],
      ],
    },
    {
      id: 'leg', both: true, closed: true, duration: 4.6, count: 58, size: 0.0054, radius: 0.0084, tube: 0.14, tubeOpacity: 0.11,
      colors: [[0, 0xff5a6a], [0.44, 0xff5a6a], [0.50, 0xffc46b], [0.58, 0x5b8ef0], [1, 0x5b8ef0]],
      points: [
        [-0.002, 0.912, -0.030], [-0.060, 0.900, -0.020], [-0.095, 0.800, 0.000],
        [-0.098, 0.620, 0.000], [-0.100, 0.450, 0.005], [-0.100, 0.250, 0.000],
        [-0.100, 0.090, 0.010], [-0.112, 0.050, 0.050], [-0.120, 0.080, -0.010],
        [-0.116, 0.280, -0.020], [-0.116, 0.500, -0.025], [-0.116, 0.700, -0.030],
        [-0.090, 0.880, -0.040], [-0.030, 0.900, -0.050],
      ],
    },
  ],

  digestion: [
    {
      id: 'food', duration: 22, count: 8, size: 0.0100, radius: 0.0088, tube: 0.18, tubeOpacity: 0.26,
      tubeColor: 0xc79a63, gap: 0.007, wrap: 1.14, tension: 0.42,
      colors: [[0, 0xf7d9a8], [0.16, 0xf0b26a], [0.30, 0xd9a45c], [1, 0xb9824a]],
      points: [
        [0.000, 1.575, 0.055], [0.000, 1.545, 0.030], [0.000, 1.520, 0.005],
        [0.000, 1.480, -0.010], [0.000, 1.400, -0.015], [0.005, 1.320, -0.012],
        [0.015, 1.255, 0.000], [0.030, 1.215, 0.025], [0.058, 1.180, 0.035],
        [0.045, 1.150, 0.020], [0.018, 1.136, 0.030], [0.000, 1.130, 0.020],
        [-0.020, 1.115, 0.015], [-0.032, 1.085, 0.005], [-0.048, 1.055, 0.000],
        [-0.062, 1.028, 0.005], [0.020, 1.018, 0.010], [0.090, 1.000, 0.005],
        [0.020, 0.980, 0.000], [-0.062, 0.960, 0.005], [0.010, 0.946, 0.010],
        [0.082, 0.930, 0.005], [-0.010, 0.916, 0.005], [-0.072, 0.905, 0.000],
        [-0.092, 0.960, -0.020], [-0.096, 1.050, -0.030], [-0.090, 1.130, -0.035],
        [-0.040, 1.166, -0.035], [0.030, 1.176, -0.035], [0.085, 1.160, -0.030],
        [0.096, 1.080, -0.030], [0.080, 1.000, -0.025], [0.040, 0.930, -0.020],
        [0.010, 0.895, -0.015], [0.000, 0.862, -0.020],
      ],
    },
    {
      id: 'water', duration: 13, count: 7, size: 0.0072, radius: 0, tube: 0,
      gap: 0.006, wrap: 1.3, endU: 0.72, tension: 0.42,
      colors: [[0, 0xd6f4ff], [0.4, 0x8fe3ff], [1, 0x5bc8ef]],
      points: [
        [0.000, 1.578, 0.062], [0.000, 1.545, 0.032], [0.000, 1.480, -0.008],
        [0.000, 1.360, -0.012], [0.010, 1.270, 0.000], [0.030, 1.200, 0.028],
        [0.030, 1.160, 0.020], [0.000, 1.132, 0.018], [-0.020, 1.110, 0.012],
        [-0.032, 1.080, 0.004], [-0.050, 1.050, 0.000], [-0.060, 1.020, 0.004],
        [0.010, 1.000, 0.008], [0.060, 0.975, 0.004], [-0.020, 0.950, 0.002],
      ],
    },
    {
      id: 'urine', duration: 11, count: 7, size: 0.0062, radius: 0.0040, tube: 0.16, tubeOpacity: 0.2,
      gap: 0.05, wrap: 1.18, tubeColor: 0xd8a94a,
      colors: [[0, 0xffe08a], [1, 0xffc23a]],
      points: [
        [-0.080, 1.150, -0.045], [-0.070, 1.080, -0.040], [-0.055, 1.000, -0.030],
        [-0.030, 0.940, -0.010], [-0.005, 0.905, 0.005], [0.000, 0.898, 0.002],
      ],
    },
  ],

  neural: [
    {
      id: 'spinal', duration: 2.8, count: 22, size: 0.0064, radius: 0.0034, tube: 0.26, tubeOpacity: 0.28,
      gap: 0.055, wrap: 1.16,
      colors: [[0, 0xfff6c0], [1, 0xffb020]],
      points: [
        [-0.005, 1.665, -0.025], [0.000, 1.610, -0.038], [0.000, 1.555, -0.045],
        [0.000, 1.490, -0.055], [0.000, 1.400, -0.060], [0.000, 1.300, -0.065],
        [0.000, 1.180, -0.065], [0.000, 1.060, -0.065], [0.000, 0.960, -0.070],
        [0.000, 0.900, -0.075],
      ],
    },
    {
      id: 'nerveArm', both: true, duration: 2.4, count: 20, size: 0.0060, radius: 0.0032, tube: 0.22, tubeOpacity: 0.24,
      gap: 0.06, wrap: 1.2,
      colors: [[0, 0xfff6c0], [1, 0xffb020]],
      points: [
        [0.005, 1.470, -0.050], [0.040, 1.440, -0.035], [0.100, 1.410, -0.025],
        [0.160, 1.380, -0.020], [0.200, 1.300, -0.020], [0.230, 1.180, -0.020],
        [0.250, 1.070, 0.000], [0.270, 0.960, 0.015], [0.285, 0.890, 0.025],
        [0.305, 0.810, 0.045],
      ],
    },
    {
      id: 'nerveLeg', both: true, duration: 2.8, count: 20, size: 0.0060, radius: 0.0032, tube: 0.22, tubeOpacity: 0.24,
      gap: 0.06, wrap: 1.2,
      colors: [[0, 0xfff6c0], [1, 0xffb020]],
      points: [
        [0.005, 1.030, -0.055], [0.045, 0.985, -0.040], [0.090, 0.930, -0.020],
        [0.105, 0.860, -0.010], [0.105, 0.720, 0.000], [0.105, 0.560, 0.000],
        [0.105, 0.460, 0.010], [0.105, 0.300, 0.000], [0.105, 0.120, 0.000],
        [0.115, 0.050, 0.030],
      ],
    },
    {
      id: 'senseArm', both: true, duration: 3.0, count: 16, size: 0.0050, radius: 0.0028, tube: 0.14, tubeOpacity: 0.16,
      gap: 0.075, wrap: 1.25,
      colors: [[0, 0xc4b5fd], [1, 0x8b5cf6]],
      points: [
        [0.305, 0.812, 0.045], [0.285, 0.892, 0.022], [0.265, 0.965, 0.012],
        [0.245, 1.075, -0.005], [0.222, 1.190, -0.028], [0.195, 1.305, -0.030],
        [0.155, 1.385, -0.032], [0.090, 1.420, -0.040], [0.020, 1.460, -0.052],
        [0.000, 1.560, -0.048], [-0.005, 1.640, -0.030],
      ],
    },
  ],

  breath: [
    {
      id: 'air', pingpong: true, duration: 2.7, count: 44, size: 0.0060, radius: 0.0068, tube: 0.20, tubeOpacity: 0.24,
      gap: 0.036, tubeColor: 0x7fd8f0,
      colors: [[0, 0xe0fbff], [0.6, 0x9fe8ff], [1, 0x6fd0ff]],
      colorsBack: [[0, 0xa9bfd4], [1, 0x7f9bb8]],
      points: [
        [0.000, 1.615, 0.080], [0.000, 1.590, 0.060], [0.000, 1.552, 0.040],
        [0.000, 1.512, 0.020], [0.000, 1.460, 0.015], [0.000, 1.420, 0.010],
        [0.000, 1.392, 0.005], [0.030, 1.380, 0.000], [0.065, 1.360, -0.010],
        [0.088, 1.340, -0.020], [0.075, 1.300, -0.030], [0.050, 1.260, -0.020],
        [0.000, 1.242, -0.010], [-0.050, 1.260, -0.020], [-0.075, 1.300, -0.030],
        [-0.088, 1.340, -0.020], [-0.065, 1.360, -0.010],
      ],
    },
  ],

  immune: [
    {
      id: 'patrolArm', both: true, closed: true, duration: 9, count: 34, size: 0.0050, radius: 0.0040, tube: 0.09, tubeOpacity: 0.08,
      gap: 0.045, wrap: 1.1, tension: 0.5,
      colors: [[0, 0xffffff], [1, 0xf2efe6]],
      points: [
        [-0.05, 1.32, -0.02], [-0.12, 1.30, 0.0], [-0.18, 1.22, 0.0],
        [-0.24, 1.10, 0.02], [-0.27, 0.95, 0.04], [-0.30, 0.82, 0.06],
        [-0.31, 0.78, 0.05], [-0.28, 0.86, 0.02], [-0.23, 1.00, -0.01],
        [-0.16, 1.18, -0.02], [-0.09, 1.28, -0.02],
      ],
    },
    {
      id: 'patrolLeg', both: true, closed: true, duration: 10, count: 30, size: 0.0050, radius: 0.0040, tube: 0.09, tubeOpacity: 0.08,
      gap: 0.05, wrap: 1.1, tension: 0.5,
      colors: [[0, 0xffffff], [1, 0xf2efe6]],
      points: [
        [-0.05, 1.05, -0.03], [-0.06, 0.85, -0.02], [-0.09, 0.60, 0],
        [-0.10, 0.35, 0.0], [-0.11, 0.15, 0.03], [-0.11, 0.07, 0.0],
        [-0.12, 0.30, -0.02], [-0.11, 0.55, -0.03], [-0.08, 0.82, -0.04],
        [-0.05, 1.02, -0.04],
      ],
    },
  ],

  lymphatic: [
    {
      id: 'lymphLeg', both: true, duration: 11, count: 30, size: 0.0050, radius: 0.0040, tube: 0.09, tubeOpacity: 0.1,
      gap: 0.05, wrap: 1.05, endU: 0.97, tension: 0.5,
      colors: [[0, 0x9fe0c0], [1, 0x6fcfa0]],
      points: [
        [-0.11, 0.07, 0.0], [-0.10, 0.30, 0], [-0.08, 0.55, 0],
        [-0.06, 0.78, 0.0], [-0.05, 0.92, 0.0], [-0.04, 1.05, 0.0],
        [-0.03, 1.18, 0.0], [-0.02, 1.28, 0.0], [-0.01, 1.33, 0.0],
      ],
    },
    {
      id: 'lymphArm', both: true, duration: 9, count: 24, size: 0.0050, radius: 0.0040, tube: 0.09, tubeOpacity: 0.1,
      gap: 0.06, wrap: 1.08, endU: 0.97, tension: 0.5,
      colors: [[0, 0x9fe0c0], [1, 0x6fcfa0]],
      points: [
        [-0.31, 0.79, 0.05], [-0.27, 0.92, 0.02], [-0.21, 1.08, 0.0],
        [-0.15, 1.20, 0.0], [-0.10, 1.27, 0.0], [-0.05, 1.32, 0.0],
      ],
    },
  ],

  endocrine: [
    {
      id: 'hormoneThyroid', closed: true, duration: 12, count: 34, size: 0.0050, radius: 0.0040, tube: 0.09, tubeOpacity: 0.1,
      gap: 0.04, wrap: 1.1, tension: 0.5,
      colors: [[0, 0xffd27a], [1, 0xffb04a]],
      points: [
        [0, 1.46, 0.0], [0, 1.40, -0.02], [0, 1.33, 0.0], [0, 1.22, -0.03],
        [0, 1.08, -0.03], [0.02, 0.98, -0.02], [0, 1.10, -0.04], [0, 1.26, -0.02],
        [0, 1.42, 0.0],
      ],
    },
    {
      id: 'hormoneAdrenal', both: true, closed: true, duration: 12, count: 32, size: 0.0050, radius: 0.0040, tube: 0.09, tubeOpacity: 0.1,
      gap: 0.045, wrap: 1.1, tension: 0.5,
      colors: [[0, 0xc9a8ff], [1, 0xa87fff]],
      points: [
        [-0.05, 1.00, -0.04], [-0.04, 1.12, -0.03], [-0.02, 1.24, -0.02],
        [0, 1.32, 0.0], [0.03, 1.24, -0.02], [0.05, 1.12, -0.02],
        [-0.02, 1.04, -0.03], [-0.05, 0.96, -0.04],
      ],
    },
  ],

  motion: [
    {
      id: 'cmdArm', both: true, closed: true, duration: 8, count: 18, size: 0.0050, radius: 0.0030, tube: 0.12, tubeOpacity: 0.14,
      gap: 0.07, wrap: 1.15, tension: 0.5,
      colors: [[0, 0xfff6c0], [1, 0xffb020]],
      points: [
        [0, 1.47, -0.05], [-0.05, 1.40, -0.04], [-0.12, 1.33, -0.03],
        [-0.19, 1.26, -0.02], [-0.25, 1.19, 0.0],
      ],
    },
    {
      id: 'cmdLeg', both: true, closed: true, duration: 8, count: 18, size: 0.0050, radius: 0.0030, tube: 0.12, tubeOpacity: 0.14,
      gap: 0.07, wrap: 1.15, tension: 0.5,
      colors: [[0, 0xfff6c0], [1, 0xffb020]],
      points: [
        [0, 1.05, -0.05], [-0.03, 0.96, -0.04], [-0.07, 0.85, -0.03],
        [-0.10, 0.70, -0.02], [-0.11, 0.55, 0.0],
      ],
    },
  ],
};

// 补完的 5 套（泌尿过滤 / 吞咽与发声 / 运动响应 / 损伤修复 / 视觉与听觉）
// 曲线定义在独立模块里，这里并进同一张表，Flow 构建与 update 逻辑完全复用。
Object.assign(FLOWS, EXTRA_FLOWS);

/* ---------------- 工具 ---------------- */

function makeColorAt(keys) {
  const list = keys.map(([u, hex]) => ({ u, c: new THREE.Color(hex) }));
  const out = new THREE.Color();
  return (u) => {
    if (!list.length) return out.setHex(0xffffff);
    if (u <= list[0].u) return out.copy(list[0].c);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (u <= b.u) {
        const f = b.u - a.u < 1e-6 ? 0 : (u - a.u) / (b.u - a.u);
        return out.copy(a.c).lerp(b.c, f);
      }
    }
    return out.copy(list[list.length - 1].c);
  };
}

const tmpObj = new THREE.Object3D();
const tmpVec = new THREE.Vector3();
const QUAD = new THREE.PlaneGeometry(1, 1);

/* ---------------- 着色器：发光粒子 + 脉搏血管 ---------------- */

// 粒子：面向相机的软边光斑。核心亮、边缘快速衰减，叠加后自然形成细胞群。
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
  mv.xy += position.xy * aSize;   // 视图空间内展开，自动近大远小
  gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAG = /* glsl */`
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(1.0, 0.12, d);
  float glow = pow(core, 3.2);
  vec3 col = vColor * (0.42 + 1.55 * glow);
  float a = (0.22 * core + 0.92 * glow) * vAlpha;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

// 血管：沿管长行进的亮度波（像心脏把血推过去），叠加菲涅尔边缘光形成体积感
const TUBE_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const TUBE_FRAG = /* glsl */`
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;
uniform float uSpeed;
uniform float uRepeat;
uniform float uOpacity;
uniform float uBeat;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float u = vUv.x;
  vec3 base = mix(uColorA, uColorB, u);
  float wave = sin((u * uRepeat - uTime * uSpeed) * 6.28318);
  wave = pow(max(wave, 0.0), 3.0);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
  float a = uOpacity * (0.5 + 0.9 * wave) * (0.5 + 1.7 * fres);
  vec3 col = base * (0.45 + 1.9 * wave + 1.0 * fres) * uBeat;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

/** 心跳：一次收缩期 + 一次舒张早期，约 72 次/分 */
function heartBeat(t) {
  const p = (t / 0.84) % 1;
  const s = Math.exp(-Math.pow((p - 0.08) / 0.055, 2));
  const d = 0.45 * Math.exp(-Math.pow((p - 0.30) / 0.075, 2));
  return s + d;
}

/* ---------------- 柔光粒子贴图（腺体、淋巴结、病菌共用） ---------------- */
let GLOW_TEX = null;
function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  GLOW_TEX = new THREE.CanvasTexture(cv);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  return GLOW_TEX;
}

/** 一个朝向相机的柔光点：比实心球体更像"发光组织"，也更容易被 Bloom 接住 */
function softGlow(colorHex, size, opacity = 0.85) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: colorHex,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size, size, 1);
  sp.renderOrder = 6;
  return sp;
}

/** 一条流动：曲线 + 管体 + 粒子 */
class Flow {
  constructor(def, k) {
    this.def = def;
    this.group = new THREE.Group();
    this.group.name = `flow-${def.id}${def.mirror ? '-L' : ''}`;
    const pts = def.points.map(p => new THREE.Vector3((def.mirror ? -p[0] : p[0]) * k, p[1] * k, p[2] * k));
    this.curve = new THREE.CatmullRomCurve3(pts, !!def.closed, 'catmullrom', def.tension ?? 0.5);
    const segs = 320;
    this.samples = this.curve.getSpacedPoints(segs);
    this.segs = segs;
    this.colorAt = makeColorAt(def.colors || [[0, 0xffffff]]);
    this.colorBack = def.colorsBack ? makeColorAt(def.colorsBack) : this.colorAt;
    this.n = def.count;
    // 每颗粒子大小略有差异，看起来才像一群细胞而不是一串珠子
    this.sizeVar = new Float32Array(this.n);
    this.phase = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.sizeVar[i] = 0.7 + 0.5 * Math.abs(Math.sin(i * 12.9898 + (def.duration || 3)));
      this.phase[i] = Math.abs(Math.sin(i * 4.7731 + 1.7)) * 6.28318;
    }
    this.colorTmp = new THREE.Color();
    const beatClock = { v: 1 };

    if (def.tube) {
      const len = this.curve.getLength();
      const tubeColor = def.tubeColor || (def.colors && def.colors[0][1]) || 0xffffff;
      const endColor = def.colors && def.colors.length ? def.colors[def.colors.length - 1][1] : tubeColor;
      this.tubeMat = new THREE.ShaderMaterial({
        vertexShader: TUBE_VERT,
        fragmentShader: TUBE_FRAG,
        uniforms: {
          uColorA: { value: new THREE.Color(tubeColor) },
          uColorB: { value: new THREE.Color(endColor) },
          uTime: { value: 0 },
          uSpeed: { value: 1.1 / (def.duration || 4) },
          uRepeat: { value: Math.max(2, Math.round(len * 14)) },
          uOpacity: { value: (def.tubeOpacity ?? Math.min(0.18, def.tube * 0.65)) * 1.15 },
          uBeat: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.tube = new THREE.Mesh(
        new THREE.TubeGeometry(this.curve, Math.max(60, Math.min(300, Math.round(len * 22))), (def.radius || 0.005) * k, 10, !!def.closed),
        this.tubeMat
      );
      this.tube.renderOrder = 3;
      this.group.add(this.tube);
    }

    // 粒子几何：一个四边形 + 每实例的属性
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = QUAD.index;
    geo.setAttribute('position', QUAD.attributes.position);
    geo.setAttribute('uv', QUAD.attributes.uv);
    this.offsets = new Float32Array(this.n * 3);
    this.sizes = new Float32Array(this.n);
    this.colors = new Float32Array(this.n * 3);
    this.alphas = new Float32Array(this.n);
    this.aOffset = new THREE.InstancedBufferAttribute(this.offsets, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.InstancedBufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOffset', this.aOffset);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aAlpha', this.aAlpha);
    geo.instanceCount = this.n;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.group.add(this.mesh);
    this.beatClock = beatClock;
  }

  pointAt(u) {
    const x = Math.max(0, Math.min(1, u)) * this.segs;
    const i0 = Math.floor(x);
    const i1 = Math.min(this.segs, i0 + 1);
    return tmpVec.copy(this.samples[i0]).lerp(this.samples[i1], x - i0);
  }

  update(t) {
    const d = this.def;
    const span = d.pingpong ? 2 : (d.closed ? 1 : (d.wrap || 1));
    const endU = d.endU || 1;
    const base = (t / d.duration) % span;
    const beat = 1 + 0.16 * heartBeat(t);

    if (this.tubeMat) {
      this.tubeMat.uniforms.uTime.value = t;
      this.tubeMat.uniforms.uBeat.value = 0.9 + 0.28 * heartBeat(t);
    }

    for (let i = 0; i < this.n; i++) {
      const raw = base + i * (d.gap || (1 / this.n));
      let u, back = false, vis = true, fade = 1;

      if (d.pingpong) {
        const p = raw % 2;
        back = p > 1;                       // 前半程吸气、后半程呼气，粒子到肺泡后原路返回
        u = back ? 2 - p : p;
      } else if (d.closed) {
        u = raw - Math.floor(raw);
      } else {
        u = raw % span;
        vis = u <= endU;
        fade = Math.min(1, Math.min(u, endU - u) / 0.05);
        if (d.endU && u > endU - 0.06) fade = Math.max(0, (endU - u) / 0.06);
      }

      if (!vis || fade <= 0.01) {
        this.alphas[i] = 0;
        this.sizes[i] = 0.0001;
        continue;
      }
      const pnt = this.pointAt(u);
      const wobble = 0.82 + 0.3 * Math.sin(t * 5.5 + i * 1.7);
      const s = d.size * 2.7 * this.sizeVar[i] * wobble * Math.max(0.15, fade);
      const ph = this.phase[i];
      // 轻微湍流：血细胞在管腔里不是走直线
      const wob = 0.0016 * d.size * 120;
      this.offsets[i * 3] = pnt.x + Math.sin(t * 1.9 + ph) * wob;
      this.offsets[i * 3 + 1] = pnt.y + Math.cos(t * 2.3 + ph * 1.3) * wob * 0.7;
      this.offsets[i * 3 + 2] = pnt.z + Math.sin(t * 1.5 + ph * 0.8) * wob;
      this.sizes[i] = s;
      const c = back ? this.colorBack(u) : this.colorAt(u);
      this.colors[i * 3] = c.r;
      this.colors[i * 3 + 1] = c.g;
      this.colors[i * 3 + 2] = c.b;
      this.alphas[i] = Math.min(1, 0.85 * fade) * (0.85 + 0.3 * wobble) * beat;
    }
    this.aOffset.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.group.traverse(o => {
      if (o === this.mesh) return;
      if (o.isMesh && o.geometry && o.geometry !== QUAD) o.geometry.dispose();
    });
    this.mesh.geometry.dispose();
    this.mesh = null;
    this.group.removeFromParent();
  }
}

/* ---------------- 主类 ---------------- */

export function createPhysio({ bodyRoot, records, onStep }) {
  const root = new THREE.Group();
  root.name = 'physio';
  root.visible = false;
  bodyRoot.add(root);

  const built = new Map(); // modeId -> { group, flows }
  const state = {
    mode: null,
    playing: true,
    speed: 1,
    t: 0,
    phase: 0,
    step: -1,
  };

  const k = () => (bodyMeta.height > 0 ? bodyMeta.height / BASE_HEIGHT : 1);

  function build(modeId) {
    if (built.has(modeId)) return built.get(modeId);
    const defs = FLOWS[modeId] || [];
    const g = new THREE.Group();
    g.visible = false;
    const flows = [];
    defs.forEach(d => {
      flows.push(new Flow(d, k()));
      // both：左右对称的结构，镜像再生成一条，四肢不会只亮一边
      if (d.both) flows.push(new Flow({ ...d, id: `${d.id}L`, mirror: true }, k()));
    });
    flows.forEach(f => g.add(f.group));

    const rec = { group: g, flows, glow: null, extra: [] };
    if (modeId === 'neural') {
      const glow = softGlow(0xfff2b0, 0.075 * k(), 0.9);
      glow.position.set(-0.005 * k(), 1.660 * k(), -0.022 * k());
      g.add(glow);
      rec.glow = glow;
    }
    // 免疫：手部的「病菌」——白细胞靠近后会被吞噬（循环中缩小消失）
    if (modeId === 'immune') {
      [[-0.31, 0.79, 0.05], [0.31, 0.79, 0.05], [-0.11, 0.07, 0.0], [0.11, 0.07, 0.0]].forEach(p => {
        const m = softGlow(0xff5a6a, 0.055 * k(), 0.95);
        m.position.set(p[0] * k(), p[1] * k(), p[2] * k());
        g.add(m);
        rec.extra.push({ mesh: m, kind: 'germ' });
      });
    }
    // 淋巴：沿途淋巴结（腹股沟、腋下）作为过滤「安检站」
    if (modeId === 'lymphatic') {
      [[-0.05, 0.92, 0], [0.05, 0.92, 0], [-0.16, 1.25, 0], [0.16, 1.25, 0]].forEach(p => {
        const m = softGlow(0x7fdcb0, 0.07 * k(), 0.6);
        m.position.set(p[0] * k(), p[1] * k(), p[2] * k());
        g.add(m);
        rec.extra.push({ mesh: m, kind: 'node' });
      });
    }
    // 内分泌：腺体（甲状腺、垂体、肾上腺）作为激素来源，随循环脉冲发光
    if (modeId === 'endocrine') {
      [[0, 1.46, 0, 0xffd27a], [0, 1.62, -0.02, 0xc9a8ff], [-0.05, 1.00, -0.04, 0xffe08a], [0.05, 1.00, -0.04, 0xffe08a]].forEach(p => {
        const m = softGlow(p[3], 0.062 * k(), 0.75);
        m.position.set(p[0] * k(), p[1] * k(), p[2] * k());
        g.add(m);
        rec.extra.push({ mesh: m, kind: 'gland' });
      });
    }
    // 补完的 5 套：肾小球 / 会厌声带 / 肌肉热区 / 损伤灶 / 视网膜鼓膜等标记
    const deco = EXTRA_DECOR[modeId];
    if (deco) deco({ g, rec, k: k(), softGlow });
    root.add(g);
    built.set(modeId, rec);
    return rec;
  }

  // 心跳节律统一用模块级的 heartBeat，血管脉冲与器官搏动保持同一节拍
  const beat = heartBeat;

  const MOTION_IDS = ['heart', 'stomach', 'smallIntestine', 'lungs', 'ribs', 'diaphragm', 'biceps', 'quadriceps', 'largeIntestine',
    'humerus', 'radius', 'ulna', 'carpal', 'metacarpal', 'phalangesHand', 'femur', 'tibia', 'fibula', 'tarsal', 'metatarsal', 'phalangesFoot'];

  function resetMotion() {
    MOTION_IDS.forEach(id => {
      const r = records.get(id);
      if (!r || r.busy) return;
      r.group.scale.set(1, 1, 1);
      r.group.position.copy(r.base);
      r.group.rotation.set(0, 0, 0);
    });
  }

  // 绕任意轴、以 pivot 为支点旋转某个形状（骨骼绕关节运动用）。
  // 因为左右肢体已合并进同一形状，绕身体中央竖轴（Y）旋转会让两侧自然反相摆动，
  // 正好像走路时摆臂、迈腿——既真实又不缺肢。
  function rotateGroup(id, pivot, axis, angle) {
    const r = records.get(id);
    if (!r || r.busy) return;
    const b = r.base;
    const dx = b.x - pivot.x, dy = b.y - pivot.y, dz = b.z - pivot.z;
    const c = Math.cos(angle), s = Math.sin(angle);
    let nx = dx, ny = dy, nz = dz;
    if (axis === 'x') { ny = dy * c - dz * s; nz = dy * s + dz * c; }
    else if (axis === 'y') { nx = dx * c + dz * s; nz = -dx * s + dz * c; }
    else { nx = dx * c - dy * s; ny = dx * s + dy * c; }
    r.group.position.set(pivot.x + nx, pivot.y + ny, pivot.z + nz);
    r.group.rotation[axis] = angle;
  }

  function scaleOf(id, sx, sy, sz) {
    const r = records.get(id);
    if (!r || r.busy || !r.group.visible) return;
    r.group.scale.set(sx, sy, sz);
  }

  function applyMotion(modeId, phase) {
    const rec = built.get(modeId);
    // 补完的 5 套动作在独立模块里，统一注入同一组形状驱动函数
    const extra = EXTRA_MOTION[modeId];
    if (extra) {
      extra({ t: state.t, phase, k: k(), scaleOf, rotateGroup, rec, records, beat });
      return;
    }
    if (modeId === 'circulation') {
      const b = 1 + 0.055 * beat(state.t);
      scaleOf('heart', b * 1.02, b * 0.97, b);
      return;
    }
    if (modeId === 'digestion') {
      // 胃：慢速揉搓（横向略胀、纵向压扁）
      const s = Math.sin(state.t * 2.6);
      scaleOf('stomach', 1 + 0.030 * s, 1 - 0.028 * s, 1 + 0.018 * s);
      // 小肠：蠕动波
      const p = 1 + 0.010 * Math.sin(state.t * 1.9);
      scaleOf('smallIntestine', p, 1 + (p - 1) * 0.6, p);
      return;
    }
    if (modeId === 'neural') {
      // 手臂：每当神经冲动抵达肘部，肱二头肌抽动一下
      const ca = (state.t / 2.4) % 1;
      const tw = Math.max(0, Math.sin(Math.max(0, Math.min(1, (ca - 0.52) / 0.22)) * Math.PI));
      scaleOf('biceps', 1 + 0.05 * tw, 1 + 0.012 * tw, 1 + 0.05 * tw);
      // 腿：股四头肌
      const cl = (state.t / 2.8) % 1;
      const tw2 = Math.max(0, Math.sin(Math.max(0, Math.min(1, (cl - 0.55) / 0.24)) * Math.PI));
      scaleOf('quadriceps', 1 + 0.035 * tw2, 1 + 0.008 * tw2, 1 + 0.035 * tw2);
      // 大脑随神经活动轻微搏动（真实形状动起来）
      const bp = 1 + 0.03 * Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2)), 2);
      scaleOf('brain', bp, bp, bp);
      return;
    }
    if (modeId === 'breath') {
      // 吸气前半程：膈肌下降变平，肋骨上抬外扩，肺被拉开
      const inhale = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
      const l = 1 + 0.055 * inhale;
      scaleOf('lungs', l, l * 0.985, l);
      const rib = 1 + 0.014 * inhale;
      scaleOf('ribs', rib, 1 + 0.008 * inhale, 1 + 0.012 * inhale);
      const dia = records.get('diaphragm');
      if (dia && !dia.busy && dia.group.visible) {
        dia.group.position.copy(dia.base);
        dia.group.position.y -= 0.018 * inhale * k();
        dia.group.scale.set(1, 1 - 0.12 * inhale, 1);
      }
    }
    if (modeId === 'immune') {
      // 白细胞在血管与组织间巡逻（粒子）；病菌随循环先胀大、再被吞噬消失
      rec.extra.forEach(e => {
        if (e.kind !== 'germ') return;
        let s;
        if (phase < 0.2) s = phase / 0.2;
        else if (phase < 0.5) s = 1 - (phase - 0.2) / 0.3;
        else s = 0;
        e.mesh.scale.setScalar(Math.max(0.0001, 0.055 * s) * k());
        e.mesh.material.opacity = 0.95 * Math.max(0, Math.min(1, s));
      });
      // 免疫器官（脾）随免疫监视而搏动——真实形状动起来
      const ip = 1 + 0.035 * Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2)), 2);
      scaleOf('spleen', ip, ip, ip);
      return;
    }
    if (modeId === 'lymphatic') {
      // 淋巴结随淋巴流经而一闪一闪，像在过滤安检
      rec.extra.forEach(e => {
        if (e.kind !== 'node') return;
        const pulse = 0.35 + 0.5 * Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2 + 1.2)), 2);
        e.mesh.material.opacity = pulse;
      });
      // 淋巴器官（脾）随回流而搏动——真实形状动起来
      const lp = 1 + 0.03 * Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2 + 0.6)), 2);
      scaleOf('spleen', lp, lp, lp);
      return;
    }
    if (modeId === 'endocrine') {
      // 腺体随循环脉冲发光，表示正在分泌激素
      rec.extra.forEach(e => {
        if (e.kind !== 'gland') return;
        const pulse = 0.4 + 0.55 * Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2)), 2);
        e.mesh.material.opacity = pulse;
      });
      // 激素到达的靶器官：心、肝、肾、股四头肌轻微搏动
      const tgt = 1 + 0.04 * Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2)), 2);
      scaleOf('heart', tgt, tgt, tgt);
      scaleOf('liver', tgt, tgt, tgt);
      scaleOf('kidney', tgt, tgt, tgt);
      scaleOf('quadriceps', tgt, tgt, tgt);
      return;
    }
    if (modeId === 'motion') {
      // 绕身体的左右横轴（X）旋转整条肢体：手臂、腿在矢状面里前后摆，
      // 像走路迈步；左右因在轴两侧而同步摆动。幅度随相位来回，配合肌肉收缩鼓起。
      const a = 0.5 * Math.sin(phase * Math.PI * 2);
      const aLeg = 0.42 * Math.sin(phase * Math.PI * 2 + Math.PI);
      ['humerus', 'radius', 'ulna', 'carpal', 'metacarpal', 'phalangesHand', 'biceps'].forEach(id =>
        rotateGroup(id, { x: 0, y: 1.26, z: 0 }, 'x', a));
      ['femur', 'tibia', 'fibula', 'tarsal', 'metatarsal', 'phalangesFoot', 'quadriceps'].forEach(id =>
        rotateGroup(id, { x: 0, y: 0.9, z: 0 }, 'x', aLeg));
      // 肌肉收缩鼓起（肱二头肌弯臂、股四头肌伸膝）
      const armTw = Math.max(0, Math.sin(((phase) % 1) * Math.PI));
      scaleOf('biceps', 1 + 0.05 * armTw, 1 + 0.012 * armTw, 1 + 0.05 * armTw);
      const legTw = Math.max(0, Math.sin(((phase + 0.5) % 1) * Math.PI));
      scaleOf('quadriceps', 1 + 0.04 * legTw, 1 + 0.01 * legTw, 1 + 0.04 * legTw);
      return;
    }
  }

  function stepIndex(modeId, phase) {
    const m = PHYSIO_BY_ID[modeId];
    if (!m) return -1;
    let idx = 0;
    for (let i = 0; i < m.steps.length; i++) if (phase >= m.steps[i].at) idx = i;
    return idx;
  }

  function setMode(modeId) {
    if (state.mode === modeId) return;
    resetMotion();
    if (state.mode && built.has(state.mode)) built.get(state.mode).group.visible = false;
    state.mode = modeId || null;
    state.t = 0;
    state.phase = 0;
    state.step = -1;
    root.visible = !!modeId;
    if (!modeId) return;
    const rec = build(modeId);
    rec.group.visible = true;
    rec.flows.forEach(f => f.update(0));
    const idx = stepIndex(modeId, 0);
    state.step = idx;
    onStep && onStep(idx, 0, modeId);
  }

  function setPlaying(on) { state.playing = !!on; }
  function setSpeed(v) { state.speed = v || 1; }

  function update(dt) {
    if (!state.mode) return;
    const m = PHYSIO_BY_ID[state.mode];
    if (!m) return;
    if (state.playing) state.t += dt * state.speed;
    const phase = (state.t / m.cycle) % 1;
    state.phase = phase;
    const rec = built.get(state.mode);
    if (rec) {
      rec.flows.forEach(f => f.update(state.t));
      if (rec.glow) {
        const pulse = 0.4 + 0.9 * Math.pow(Math.max(0, Math.sin(state.t * 2.2)), 2);
        rec.glow.scale.setScalar(0.075 * pulse * k());
      }
    }
    applyMotion(state.mode, phase);
    const idx = stepIndex(state.mode, phase);
    if (idx !== state.step) {
      state.step = idx;
      onStep && onStep(idx, phase, state.mode);
    }
  }

  return {
    root,
    state,
    setMode,
    setPlaying,
    setSpeed,
    update,
    getMode: () => state.mode,
    getModeId: () => state.mode,
    getActive: () => state.mode != null,
    get built() { return built; },
    get phase() { return state.phase; },
    get step() { return state.step; },
    reset: () => { resetMotion(); },
  };
}
