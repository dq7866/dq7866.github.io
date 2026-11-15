// vascular.js — 实体血管：变半径管几何 + 会随脉搏鼓动的血管壁
//
// 之前的管路是「加色发光的正弦亮度带」+ 霓虹粒子，本质是 LED 灯带，不像血管。
// 真实血管的三个可辨特征这里都做出来：
//   1) 管径沿程渐变（近心端粗、远心端细），分叉处自然收细
//   2) 不透明/半透明的血管壁，有湿润高光、纵向纤维纹、透出的血色明暗
//   3) 脉搏波：动脉压力波（收缩主峰 + 重搏波）沿血管以有限速度传播，
//      近心端先鼓、远心端晚一拍鼓——看得见的「脉搏」，不是整条管子一起闪
import * as THREE from '../lib/three.module.js';
import { CARDIAC_T, CARDIAC_GLSL } from './cardiac.js';

/**
 * 变半径管。Three 自带 TubeGeometry 半径恒定，血管必须有锥度，
 * 所以按 Frenet 帧自己生成；额外带 aU（归一化弧长）与 aR（该处半径）
 * 两个自定义 attribute，供顶点着色器按弧长做脉搏相位延迟与径向鼓包。
 */
export function vesselGeometry(curve, radiusFn, segs = 72, radial = 9, closed = false) {
  const frames = curve.computeFrenetFrames(segs, closed);
  const pos = [], nor = [], uvs = [], aU = [], aR = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, P);
    const r = Math.max(1e-6, radiusFn(u));
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = ca * N.x + sa * B.x;
      const ny = ca * N.y + sa * B.y;
      const nz = ca * N.z + sa * B.z;
      pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      nor.push(nx, ny, nz);
      uvs.push(u, j / radial);
      aU.push(u);
      aR.push(r);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(aR, 1));
  g.computeBoundingSphere();
  return g;
}

const VERT_PARS = /* glsl */`
attribute float aU;
attribute float aR;
uniform float uTime;
uniform float uPeriod;
uniform float uTravel;     // 脉搏从起点传到终点所需时间（秒）
uniform float uPhase;      // 该条血管相对心脏的起始相位偏移
uniform float uPulseAmp;   // 管壁径向鼓包比例
varying float vVU;
varying float vVPulse;
varying vec3 vVN;
varying vec3 vVView;
${CARDIAC_GLSL}
`;

const VERT_MAIN = /* glsl */`
vVU = aU;
float ph = (uTime - uTravel * aU - uPhase) / uPeriod;
float pw = arterialWave(ph);
vVPulse = pw;
transformed += normal * (aR * uPulseAmp * pw);
vVN = normalize(normalMatrix * normal);
vec4 mvV = modelViewMatrix * vec4(transformed, 1.0);
vVView = normalize(-mvV.xyz);
`;

const FRAG_PARS = /* glsl */`
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uTime;
uniform float uFlowSpeed;
uniform float uFlowStr;
uniform float uExposure;   // 血管壁亮度：影棚灯很强，不压会把饱和血红洗成白线
varying float vVU;
varying float vVPulse;
varying vec3 vVN;
varying vec3 vVView;
`;

const FRAG_COLOR = /* glsl */`
{
  // 血管壁本色：起点到终点渐变（动脉由鲜红转暗红、静脉由青紫转暗蓝）
  vec3 wall = mix(uColA, uColB, clamp(vVU, 0.0, 1.0));
  // 血流透出管壁的明暗行波：是颜色深浅，不是自发光
  float flow = 0.5 + 0.5 * sin((vVU * 5.0 - uTime * uFlowSpeed) * 6.28318);
  wall *= 0.87 + uFlowStr * flow;
  // 脉搏波到达时管壁充血，颜色更鲜、更亮（重搏波会带出第二下微亮）
  wall *= 1.0 + 0.26 * vVPulse;
  wall = mix(wall, wall * vec3(1.14, 0.88, 0.86), 0.42 * vVPulse);
  // 边缘 Fresnel：血管壁的圆柱体积感，靠亮度而非加色实现
  float fres = pow(1.0 - abs(dot(normalize(vVN), normalize(vVView))), 2.0);
  wall += wall * fres * 0.20;
  diffuseColor.rgb = wall * uExposure;
}
`;

/**
 * @param {object} o
 *   color / colorEnd 血管壁颜色（线性空间由 THREE.Color 处理）
 *   opacity          不透明度（联动透视管路用 0.7~0.85）
 *   travel           脉搏从近心端传到远端的秒数（越长越能看出"一鼓一鼓往外跑"）
 *   pulseAmp         管壁径向扩张比例（主动脉 0.16、小动脉 0.08、静脉 0.03）
 *   flowSpeed        血流明暗行波速度
 *   depthTest        透视联动管网可关；心脏表面冠脉必须开
 */
export function createVesselMaterial(o = {}) {
  const base = new THREE.Color(o.color ?? 0xb23c40);
  const m = new THREE.MeshPhysicalMaterial({
    // 保底色：万一自定义注入失效，血管仍是血色，不会掉成黑线或白管
    color: base.clone(),
    // 底光是关键：血管壁细且湿润，纯靠反射光在暗房里会变成黑绳
    emissive: base.clone().multiplyScalar(o.emissiveScale ?? 0.22),
    roughness: 0.46,
    metalness: 0,
    clearcoat: 0.42,
    clearcoatRoughness: 0.38,
    sheen: 0.12,
    transparent: true,
    opacity: o.opacity ?? 0.92,
    depthWrite: false,
    depthTest: o.depthTest ?? true,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    envMapIntensity: o.env ?? 2.0,
  });
  const uni = {
    uTime: { value: 0 },
    uPeriod: { value: CARDIAC_T },
    uTravel: { value: o.travel ?? 0.10 },
    uPhase: { value: o.phase ?? 0 },
    uPulseAmp: { value: o.pulseAmp ?? 0.12 },
    uColA: { value: new THREE.Color(o.color ?? 0xb23c40) },
    uColB: { value: new THREE.Color(o.colorEnd ?? o.color ?? 0x8d2b32) },
    uFlowSpeed: { value: o.flowSpeed ?? 0.75 },
    uFlowStr: { value: o.flowStr ?? 0.22 },
    uExposure: { value: o.exposure ?? 1 },
  };
  m.userData.uni = uni;
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uni);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR);
  };
  m.customProgramCacheKey = () => 'vessel-v1';
  return m;
}

/** 逐帧喂时间；mats 里可混有其它材质（自动跳过） */
export function updateVesselMaterials(mats, t) {
  for (const m of mats) {
    const u = m && m.userData && m.userData.uni;
    if (u && u.uTime) u.uTime.value = t;
  }
}
