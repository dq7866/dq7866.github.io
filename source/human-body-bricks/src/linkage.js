// linkage.js — 全身器官联动动画
//
// 把心、肺、脑、肝、胃、肾、肠、脾用血管网络连成一个整体：
//   · 路线全部从 records 的真实包围盒取锚点（心脏在哪、肝多大，管线就怎么走），
//     不写死坐标，换模型/换缩放都自动跟随
//   · 肺循环（红出蓝回）、颈动脉/颈静脉（脑）、肝动脉/肝静脉、门静脉
//     （胃肠脾→肝）、肾动脉/肾静脉、上下肢体循环闭环
//   · 管体 = 行波亮度脉冲（血从心脏一波一波推出去），粒子 = 柔光血细胞沿管流动
//   · 「血流到达」：每条路线按弧长算延迟，器官在血流抵达的瞬间整体搏动 + 亮起，
//     形成从心脏向外一圈圈点亮全身的节奏感
import * as THREE from '../lib/three.module.js';
import { CARDIAC_T, arterialWave } from './cardiac.js';
import { vesselGeometry, createVesselMaterial, updateVesselMaterials } from './vascular.js';

/* ---------------- 着色器：血细胞粒子 ---------------- */
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

// 血细胞：暗红/青紫的实心小体，中央略亮，绝不发光（发光会把血管变成 LED 灯带）
const PARTICLE_FRAG = /* glsl */`
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float body = smoothstep(1.0, 0.28, d);
  float core = pow(smoothstep(0.72, 0.0, d), 2.0);
  vec3 col = vColor * (0.62 + 0.48 * core);
  float a = (0.42 * body + 0.30 * core) * vAlpha;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

/* ---------------- 颜色渐变取样 ---------------- */
function colorAt(keys) {
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

// 心动周期 / 动脉压力波统一由 cardiac.js 提供（与心肌收缩、冠脉严格同相位）
const waveAt = (t, delay) => arterialWave((t - delay) / CARDIAC_T);

// 柔光粒子贴图（器官到货闪光的光晕）
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

// 血管壁的解剖色：不要荧光色，真实血管在灯下是暗红 / 青紫 / 紫褐
const ARTERY = 0xc44848;
const VEIN = 0x5a6fa0;
const PORTAL = 0x825b8e;
const CAPILLARY = 0xd08a5c;   // 毛细血管床的过渡暖色

/**
 * @param {object} hooks { records, bodyMeta, organs, scene }
 *   organs: [{ id, group, mats }] — 参与联动的器官（已换好生物材质）
 */
export function createLinkage(hooks) {
  const s = hooks.bodyMeta.scale || 1;
  const group = new THREE.Group();
  const disposables = [];
  const tubeMats = [];
  const flashes = [];          // { mats, delay, sprite, mat, base }
  const organs = hooks.organs || [];

  /* ---------- 锚点：全部从真实包围盒来 ---------- */
  const anchorBox = id => {
    const rec = hooks.records.get(id);
    if (!rec || !rec.group) return null;
    const box = new THREE.Box3().setFromObject(rec.group);
    if (box.isEmpty()) return null;
    return { c: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()), box };
  };
  const A = {};
  for (const id of ['heart', 'lungs', 'brain', 'liver', 'stomach', 'kidney',
                    'smallIntestine', 'largeIntestine', 'spleen',
                    'cervical', 'thoracic', 'lumbar', 'arms', 'legs', 'pelvis']) {
    A[id] = anchorBox(id);
  }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const routes = [];
  const addRoute = (o) => { if (o.pts.length >= 2) routes.push(o); };

  const H = A.heart, L = A.lungs, B = A.brain, LV = A.liver,
        ST = A.stomach, KD = A.kidney, SI = A.smallIntestine,
        LI = A.largeIntestine, SP = A.spleen,
        NK = A.cervical, TH = A.thoracic, LM = A.lumbar,
        ARM = A.arms, LEG = A.legs;
  const hS = H ? H.size.y : 0.1;
  const Hc = H ? H.c : null;

  if (Hc && L) {
    const lS = L.size;
    // 肺循环：心 → 肺（动脉血其实是缺氧血去换气，动画上用蓝出红回更直观）
    addRoute({ id: 'pulmOut', pts: [Hc.clone(), Hc.clone().add(V(0.010 * s, hS * 0.55, 0.008 * s)),
      L.c.clone().add(V(-lS.x * 0.22, -lS.y * 0.38, 0)), L.c.clone()],
      closed: false, duration: 1.5, size: 0.0060 * s, radius: 0.0058 * s, tube: 0.3,
      colors: colorAt([[0, VEIN], [0.55, VEIN], [0.72, CAPILLARY], [1, ARTERY]]),
      flash: { id: 'lungs', at: 0.88 } });
    addRoute({ id: 'pulmIn', pts: [L.c.clone(), L.c.clone().add(V(lS.x * 0.24, -lS.y * 0.34, 0)),
      Hc.clone().add(V(-0.010 * s, hS * 0.5, -0.008 * s)), Hc.clone()],
      closed: false, duration: 1.5, size: 0.0060 * s, radius: 0.0054 * s, tube: 0.27,
      colors: colorAt([[0, ARTERY], [1, VEIN]]),
      flash: { id: 'heart', at: 0.95 } });
  }
  if (Hc && B && NK) {
    const nS = NK.size, bS = B.size;
    // 颈动脉：心 → 主动脉弓 → 颈前 → 颅底 → 脑
    addRoute({ id: 'carotid', pts: [
      Hc.clone(), Hc.clone().add(V(0.006 * s, hS * 0.6, -0.010 * s)),
      NK.c.clone().add(V(0.004 * s, nS.y * 0.3, nS.z * 0.75)),
      B.c.clone().add(V(0.004 * s, -bS.y * 0.55, 0.004 * s)),
      B.c.clone().add(V(0, -bS.y * 0.15, 0))],
      closed: false, duration: 2.6, size: 0.0056 * s, radius: 0.0056 * s, tube: 0.28,
      colors: colorAt([[0, ARTERY], [1, ARTERY]]),
      flash: { id: 'brain', at: 0.94 } });
    // 颈静脉：脑 → 心（走颈侧）
    addRoute({ id: 'jugular', pts: [
      B.c.clone().add(V(-0.006 * s, -bS.y * 0.3, -0.004 * s)),
      NK.c.clone().add(V(-0.010 * s, nS.y * 0.2, 0)),
      Hc.clone().add(V(-0.008 * s, hS * 0.55, 0)), Hc.clone()],
      closed: false, duration: 2.6, size: 0.0056 * s, radius: 0.0052 * s, tube: 0.26,
      colors: colorAt([[0, VEIN], [1, VEIN]]) });
  }
  if (Hc && LV && TH) {
    const tS = TH.size, lS = LV.size;
    // 肝动脉：心 → 降主动脉（贴脊柱前）→ 肝
    addRoute({ id: 'hepaticA', pts: [
      Hc.clone().add(V(0, -hS * 0.45, 0)),
      TH.c.clone().add(V(0.004 * s, tS.y * 0.15, tS.z * 0.85)),
      LV.c.clone().add(V(0, lS.y * 0.55, lS.z * 0.2)),
      LV.c.clone()],
      closed: false, duration: 2.0, size: 0.0056 * s, radius: 0.0054 * s, tube: 0.27,
      colors: colorAt([[0, ARTERY], [1, ARTERY]]),
      flash: { id: 'liver', at: 0.92 } });
    // 肝静脉：肝 → 心（偏脊柱侧回心）
    addRoute({ id: 'hepaticV', pts: [
      LV.c.clone().add(V(0.006 * s, lS.y * 0.45, -lS.z * 0.3)),
      TH.c.clone().add(V(0, tS.y * 0.3, tS.z * 0.6)),
      Hc.clone().add(V(0, -hS * 0.4, -0.006 * s)), Hc.clone()],
      closed: false, duration: 2.0, size: 0.0056 * s, radius: 0.0050 * s, tube: 0.25,
      colors: colorAt([[0, PORTAL], [0.3, VEIN], [1, VEIN]]) });
  }
  if (LV && SI) {
    // 门静脉：小肠 → 肝（消化吸收的养分先入肝再回心）
    addRoute({ id: 'portal', pts: [
      SI.c.clone().add(V(0, SI.size.y * 0.4, -SI.size.z * 0.2)),
      LV.c.clone().add(V(-0.008 * s, -LV.size.y * 0.5, -0.004 * s)),
      LV.c.clone().add(V(0, -LV.size.y * 0.2, 0))],
      closed: false, duration: 3.2, size: 0.0052 * s, radius: 0.0050 * s, tube: 0.26,
      colors: colorAt([[0, PORTAL], [1, PORTAL]]),
      flash: { id: 'liver', at: 0.9 } });
  }
  if (LV && SP) {
    // 脾静脉 → 门静脉 → 肝
    addRoute({ id: 'splenic', pts: [
      SP.c.clone(), SP.c.clone().add(V(SP.size.x * 0.4, SP.size.y * 0.3, 0)),
      LV.c.clone().add(V(-LV.size.x * 0.4, 0, 0)), LV.c.clone().add(V(0, -LV.size.y * 0.25, 0))],
      closed: false, duration: 3.4, size: 0.0050 * s, radius: 0.0046 * s, tube: 0.23,
      colors: colorAt([[0, PORTAL], [1, PORTAL]]) });
  }
  if (LV && LI) {
    // 大肠 → 门静脉 → 肝
    addRoute({ id: 'colic', pts: [
      LI.c.clone().add(V(LI.size.x * 0.35, LI.size.y * 0.45, 0)),
      LV.c.clone().add(V(-0.010 * s, -LV.size.y * 0.45, 0)),
      LV.c.clone().add(V(0, -LV.size.y * 0.25, 0))],
      closed: false, duration: 3.6, size: 0.0050 * s, radius: 0.0046 * s, tube: 0.23,
      colors: colorAt([[0, PORTAL], [1, PORTAL]]) });
  }
  if (Hc && KD && LM) {
    const kS = KD.size, lS = LM.size;
    for (const side of [-1, 1]) {
      const kx = KD.c.x + side * kS.x * 0.28;
      // 肾动脉：心 → 腹主动脉 → 肾门
      addRoute({ id: `renalA${side}`, pts: [
        Hc.clone().add(V(0, -hS * 0.5, 0)),
        LM.c.clone().add(V(0, lS.y * 0.35, lS.z * 0.8)),
        V(kx, KD.c.y + kS.y * 0.1, LM.c.z + lS.z * 0.5),
        V(kx, KD.c.y, LM.c.z + lS.z * 0.55)],
        closed: false, duration: 2.3, size: 0.0052 * s, radius: 0.0048 * s, tube: 0.25,
        colors: colorAt([[0, ARTERY], [1, ARTERY]]),
        flash: { id: 'kidney', at: 0.95 } });
      // 肾静脉：肾 → 下腔静脉 → 心
      addRoute({ id: `renalV${side}`, pts: [
        V(kx, KD.c.y - kS.y * 0.05, LM.c.z + lS.z * 0.5),
        LM.c.clone().add(V(0, lS.y * 0.45, lS.z * 0.7)),
        Hc.clone().add(V(0, -hS * 0.45, -0.004 * s)), Hc.clone()],
        closed: false, duration: 2.3, size: 0.0052 * s, radius: 0.0045 * s, tube: 0.23,
        colors: colorAt([[0, VEIN], [1, VEIN]]) });
    }
  }
  if (Hc && ST && SI) {
    // 腹腔干：心 → 胃（胃左动脉走向）
    addRoute({ id: 'gastric', pts: [
      Hc.clone().add(V(0, -hS * 0.5, 0)),
      ST.c.clone().add(V(0.006 * s, ST.size.y * 0.55, ST.size.z * 0.2)),
      ST.c.clone()],
      closed: false, duration: 2.2, size: 0.0052 * s, radius: 0.0048 * s, tube: 0.25,
      colors: colorAt([[0, ARTERY], [1, ARTERY]]),
      flash: { id: 'stomach', at: 0.9 } });
    // 肠系膜上动脉：心 → 小肠
    addRoute({ id: 'mesenteric', pts: [
      Hc.clone().add(V(0, -hS * 0.55, 0)),
      SI.c.clone().add(V(0.004 * s, SI.size.y * 0.5, SI.size.z * 0.3)),
      SI.c.clone().add(V(-SI.size.x * 0.2, 0, 0))],
      closed: false, duration: 2.8, size: 0.0052 * s, radius: 0.0048 * s, tube: 0.25,
      colors: colorAt([[0, ARTERY], [1, ARTERY]]) });
  }
  if (Hc && ARM) {
    // 上肢体循环闭环：心 → 锁骨下 → 臂 → 手 → 尺侧回流 → 心
    const aC = ARM.c, aS = ARM.size;
    for (const side of [-1, 1]) {
      const x = side => side * aS.x * 0.42;
      addRoute({ id: `brach${side}`, pts: [
        Hc.clone().add(V(side * 0.012 * s, hS * 0.3, 0)),
        V(aC.x + x(side), aC.y + aS.y * 0.42, aC.z),
        V(aC.x + x(side), aC.y, aC.z),
        V(aC.x + x(side) * 1.1, aC.y - aS.y * 0.42, aC.z + 0.01 * s),
        V(aC.x + x(side) * 1.05 + 0.012 * s, aC.y - aS.y * 0.40, aC.z),
        V(aC.x + x(side) * 0.95, aC.y - aS.y * 0.1, aC.z),
        Hc.clone().add(V(side * 0.014 * s, hS * 0.2, 0))],
        closed: true, duration: 4.8, size: 0.0054 * s, radius: 0.0048 * s, tube: 0.21,
        colors: colorAt([[0, ARTERY], [0.42, ARTERY], [0.58, CAPILLARY], [0.72, VEIN], [1, VEIN]]) });
    }
  }
  if (Hc && LEG && LM) {
    // 下肢体循环闭环：心 → 髂外 → 股动脉 → 足 → 回流 → 心
    const lC = LEG.c, lS = LEG.size;
    for (const side of [-1, 1]) {
      const lx = side * lS.x * 0.38;
      addRoute({ id: `fem${side}`, pts: [
        Hc.clone().add(V(side * 0.010 * s, -hS * 0.5, 0)),
        LM.c.clone().add(V(side * 0.012 * s, -lS.y * 0.06, lS.z * 0.5)),
        V(lC.x + lx, lC.y + lS.y * 0.3, lC.z),
        V(lC.x + lx, lC.y - lS.y * 0.35, lC.z),
        V(lC.x + lx + 0.012 * s, lC.y - lS.y * 0.455, lC.z + 0.012 * s),
        V(lC.x + lx + 0.014 * s, lC.y - lS.y * 0.30, lC.z),
        V(lC.x + lx + 0.012 * s, lC.y, lC.z),
        Hc.clone().add(V(side * 0.012 * s, -hS * 0.4, 0))],
        closed: true, duration: 5.6, size: 0.0056 * s, radius: 0.0052 * s, tube: 0.23,
        colors: colorAt([[0, ARTERY], [0.44, ARTERY], [0.56, CAPILLARY], [0.70, VEIN], [1, VEIN]]) });
    }
  }

  // 控制点之间补一个带侧向偏移的中点，让长距离管路有解剖性的自然蜿蜒，
  // 而不是几段绷直的电线（尤其四肢闭环，原来跨度太大显得很假）。
  function soften(pts, closed) {
    const out = [];
    const N = closed ? pts.length : pts.length - 1;
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a.clone());
      const d = new THREE.Vector3().subVectors(b, a);
      const len = d.length();
      if (len > 1e-6) {
        d.divideScalar(len);
        const side = new THREE.Vector3().crossVectors(d, up);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        const amp = Math.min(len * 0.075, 0.022 * s);
        out.push(a.clone().lerp(b, 0.5).addScaledVector(side, amp * Math.sin(i * 2.17 + 0.6)));
      }
    }
    if (!closed) out.push(pts[pts.length - 1].clone());
    return out;
  }

  /* ---------- 实体血管：变半径管壁 + 沿弧长传播的脉搏波 ---------- */
  for (const r of routes) {
    r.curve = new THREE.CatmullRomCurve3(soften(r.pts, !!r.closed), !!r.closed, 'catmullrom', 0.5);
    const len = r.curve.getLength();
    r.len = len;
    const segs = Math.max(48, Math.min(160, Math.round(len / (0.006 * s))));
    const portal = /portal|splenic|colic/.test(r.id);
    const venous = portal || /In$|V$|V-|jugular/.test(r.id);
    const geo = vesselGeometry(r.curve, u => {
      // 近心端粗、远心端细；起点略膨大，接上心脏/分叉处不突兀
      const taper = 1 - 0.58 * u;
      const bulb = 1 + 0.14 * Math.exp(-Math.pow(u / 0.08, 2));
      return r.radius * 0.72 * taper * bulb;
    }, segs, 9, !!r.closed);
    const mat = createVesselMaterial({
      color: r.colors(0).clone(), colorEnd: r.colors(1).clone(),
      opacity: Math.min(0.78, 0.52 + r.tube * 0.55),
      depthTest: false,             // 血管造影式透视：透过器官也看得见
      travel: Math.min(0.55, Math.max(0.10, r.duration * 0.17)),
      phase: portal ? 0.34 : (venous ? 0.22 : 0.045),
      pulseAmp: portal ? 0.022 : (venous ? 0.030 : 0.135),
      flowSpeed: 0.55 + 0.25 / Math.max(1, r.duration),
      flowStr: venous ? 0.14 : 0.24,
    });
    tubeMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 16;
    mesh.frustumCulled = false;
    group.add(mesh);
    disposables.push(geo, mat);
    if (r.flash) r.flash.delay = (r.flash.at ?? 1) * r.duration;
  }

  /* ---------- 粒子：柔光血细胞 ---------- */
  const quad = new THREE.PlaneGeometry(1, 1);
  const inst = new THREE.InstancedBufferGeometry();
  inst.index = quad.index;
  inst.setAttribute('position', quad.attributes.position);
  inst.setAttribute('uv', quad.attributes.uv);
  const items = [];
  for (let ri = 0; ri < routes.length; ri++) {
    const r = routes[ri];
    const n = Math.max(14, Math.min(72, Math.round(r.len / (0.013 * s))));
    for (let i = 0; i < n; i++) {
      items.push({ r: ri, u0: i / n + Math.random() * 0.4 / n,
        size: r.size * 0.52 * (0.72 + Math.random() * 0.65), alpha: 0.55 + Math.random() * 0.35 });
    }
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
      c.copy(r.colors(it.u0 % 1));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    });
    inst.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
    inst.setAttribute('aSize', new THREE.InstancedBufferAttribute(siz, 1));
    inst.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
    inst.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alp, 1));
    const pmat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.NormalBlending,
    });
    const pts = new THREE.Mesh(inst, pmat);
    pts.renderOrder = 17;
    pts.frustumCulled = false;
    group.add(pts);
    disposables.push(inst, pmat);
  }

  /* ---------- 器官到货：血色潮红 + 极淡光晕 ---------- */
  const flashOf = new Map();   // organId -> min delay
  for (const r of routes) {
    if (!r.flash) continue;
    const prev = flashOf.get(r.flash.id);
    if (prev === undefined || r.flash.delay < prev) flashOf.set(r.flash.id, r.flash.delay);
  }
  for (const o of organs) {
    const delay = o.id === 'heart' ? 0 : flashOf.get(o.id);
    if (delay === undefined) continue;
    const box = new THREE.Box3().setFromObject(o.group);
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3());
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xc85258,
      transparent: true, opacity: 0.0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(box.getCenter(new THREE.Vector3()));
    const sc = Math.max(size.x, size.y, size.z) * 1.25;
    sp.scale.set(sc, sc, 1);
    sp.renderOrder = 18;
    group.add(sp);
    disposables.push(mat);
    flashes.push({ mats: o.mats, delay, sprite: sp, mat, base: sc });
  }

  /* ---------- 每帧 ---------- */
  function update(t) {
    updateVesselMaterials(tubeMats, t);
    const b = waveAt(t, 0);
    if (N) {
      const off = inst.attributes.aOffset.array;
      for (let i = 0; i < N; i++) {
        const it = items[i];
        const r = routes[it.r];
        // 血流速度按心动周期调制：收缩射血期快、舒张期慢（不再匀速漂移）
        const u = (it.u0 + (t + 0.10 * Math.sin(t * Math.PI * 2 / CARDIAC_T)) / r.duration) % 1;
        const p = r.curve.getPointAt(u);
        off[i * 3] = p.x; off[i * 3 + 1] = p.y; off[i * 3 + 2] = p.z;
      }
      inst.attributes.aOffset.needsUpdate = true;
    }
    for (const f of flashes) {
      const arrive = waveAt(t, f.delay);
      for (const m of f.mats) {
        const u = m.userData.uni;
        if (!u) continue;
        u.uPulse.value = b * 0.35 + arrive * 0.75;
        if (u.uFlush) u.uFlush.value = arrive;             // 组织潮红，而非霓虹发光
        if (u.uSss) {
          if (u.uSssBase === undefined) u.uSssBase = u.uSss.value;
          u.uSss.value = u.uSssBase * (1 + 0.22 * arrive);
        }
      }
      f.mat.opacity = 0.16 * arrive;
      const k = 1 + 0.10 * arrive;
      f.sprite.scale.set(f.base * k, f.base * k, 1);
    }
  }

  function dispose() {
    // 闪光期间改过的材质 uniform 还原
    for (const f of flashes) {
      for (const m of f.mats) {
        const u = m.userData.uni;
        if (u && u.uSssBase !== undefined) { u.uSss.value = u.uSssBase; delete u.uSssBase; }
        if (u) { u.uPulse.value = 0; if (u.uFlush) u.uFlush.value = 0; }
      }
    }
    hooks.scene.remove(group);
    disposables.forEach(d => d.dispose && d.dispose());
    quad.dispose();
  }

  return { group, update, dispose };
}
