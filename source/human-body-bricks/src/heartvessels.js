// heartvessels.js — 心脏的冠状动脉网 + 大血管根部
//
// 光有一块红色的肉，再怎么调材质也不像心脏：真实心脏标本最抓眼的是
//   · 心底那几根粗管子（主动脉弓、肺动脉干、上下腔静脉、肺静脉）
//   · 贴着心外膜、在室间沟与房室沟里走行的冠状动脉，主支一路分出对角支/钝缘支
//
// 冠脉要「长在肉上」而不是飘在空中：从重构后的网格顶点建一张柱坐标半径查表
// R(h, θ)（h=沿长轴高度、θ=绕长轴方位 → 该处最外表面到中轴的半径），
// 曲线点 = 中轴 + (R + 一点点外扩)·方向。沟槽处 R 自然变小，血管就落进沟里。
// 这比逐点 Raycaster 快两个数量级，且不会把血管埋进肉里。
import * as THREE from '../lib/three.module.js';
import { vesselGeometry, createVesselMaterial, updateVesselMaterials } from './vascular.js';

const TAU = Math.PI * 2;

/* ---------------- 心外膜半径查表 ---------------- */
function buildRadialMap(meshes, rels) {
  const box = new THREE.Box3();
  const tmp = new THREE.Vector3();
  for (let k = 0; k < meshes.length; k++) {
    const p = meshes[k].geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      tmp.fromBufferAttribute(p, i).applyMatrix4(rels[k]);
      box.expandByPoint(tmp);
    }
  }
  if (box.isEmpty()) return null;
  const minY = box.min.y, spanY = Math.max(1e-5, box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) * 0.5;
  const cz = (box.min.z + box.max.z) * 0.5;

  const NA = 96, NH = 56;
  const R = new Float32Array(NA * NH);
  for (let k = 0; k < meshes.length; k++) {
    const p = meshes[k].geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      tmp.fromBufferAttribute(p, i).applyMatrix4(rels[k]);
      const h = (tmp.y - minY) / spanY;
      if (h < 0 || h > 1) continue;
      const dx = tmp.x - cx, dz = tmp.z - cz;
      let a = Math.atan2(dz, dx);
      if (a < 0) a += TAU;
      const ia = Math.min(NA - 1, Math.floor(a / TAU * NA));
      const ih = Math.min(NH - 1, Math.max(0, Math.floor(h * NH)));
      const r = Math.hypot(dx, dz);
      const q = ih * NA + ia;
      if (r > R[q]) R[q] = r;
    }
  }
  // 空 bin：用相邻 bin 填（心尖/心底附近顶点稀疏），再轻度平滑去掉单顶点噪点
  const src = R.slice();
  for (let pass = 0; pass < 3; pass++) {
    for (let ih = 0; ih < NH; ih++) {
      for (let ia = 0; ia < NA; ia++) {
        const q = ih * NA + ia;
        if (R[q] > 0) continue;
        let sum = 0, n = 0;
        for (let dh = -1; dh <= 1; dh++) {
          const jh = ih + dh;
          if (jh < 0 || jh >= NH) continue;
          for (let da = -1; da <= 1; da++) {
            const ja = (ia + da + NA) % NA;
            const v = R[jh * NA + ja];
            if (v > 0) { sum += v; n++; }
          }
        }
        if (n) src[q] = sum / n;
      }
    }
    R.set(src);
  }
  const sm = new Float32Array(NA * NH);
  for (let ih = 0; ih < NH; ih++) {
    for (let ia = 0; ia < NA; ia++) {
      let sum = R[ih * NA + ia] * 2, w = 2;
      for (let da = -1; da <= 1; da += 2) {
        const v = R[ih * NA + (ia + da + NA) % NA];
        if (v > 0) { sum += v; w++; }
      }
      for (let dh = -1; dh <= 1; dh += 2) {
        const jh = ih + dh;
        if (jh >= 0 && jh < NH && R[jh * NA + ia] > 0) { sum += R[jh * NA + ia]; w++; }
      }
      sm[ih * NA + ia] = sum / w;
    }
  }

  function sampleR(h, a) {
    const hh = Math.max(0, Math.min(0.9999, h)) * NH - 0.5;
    const ih0 = Math.max(0, Math.min(NH - 1, Math.floor(hh)));
    const ih1 = Math.min(NH - 1, ih0 + 1);
    const fh = Math.max(0, Math.min(1, hh - ih0));
    let aa = a % TAU;
    if (aa < 0) aa += TAU;
    const af = aa / TAU * NA - 0.5;
    const ia0 = ((Math.floor(af) % NA) + NA) % NA;
    const ia1 = (ia0 + 1) % NA;
    const fa = Math.max(0, Math.min(1, af - Math.floor(af)));
    const r00 = sm[ih0 * NA + ia0], r01 = sm[ih0 * NA + ia1];
    const r10 = sm[ih1 * NA + ia0], r11 = sm[ih1 * NA + ia1];
    return (r00 * (1 - fa) + r01 * fa) * (1 - fh) + (r10 * (1 - fa) + r11 * fa) * fh;
  }

  return {
    minY, spanY, cx, cz, box, sampleR,
    point(h, a, lift = 0.002) {
      const r = Math.max(0.004, sampleR(h, a));
      // 沿「估计表面法线」外扩，而不是纯径向：心底是圆顶，纯径向外推
      // 根本到不了表面外，冠脉就整根埋在肉里只剩 1px 的边。
      // dr/dy 由半径查表的纵向梯度估计，法线 = normalize(径向 - dr/dy·Y)。
      const dh = 1 / NH;
      const h0 = Math.max(0, h - dh), h1 = Math.min(1, h + dh);
      const dr = (sampleR(h1, a) - sampleR(h0, a)) / Math.max(1e-6, (h1 - h0) * spanY);
      const nx = Math.cos(a), ny = Math.max(-3, Math.min(3, -dr)), nz = Math.sin(a);
      const nl = Math.hypot(nx, ny, nz) || 1;
      return new THREE.Vector3(
        cx + r * nx + nx / nl * lift,
        minY + h * spanY + ny / nl * lift,
        cz + r * nz + nz / nl * lift
      );
    },
  };
}

/* ---------------- 构造器 ---------------- */
/**
 * @param {object} o { rec, bodyMeta }
 *   rec: records.get('heart')，其 group 下挂生成的血管（自动跟随心跳缩放/扭转）
 * @returns { group, update(t), dispose() }
 */
export function createHeartVessels({ rec }) {
  const root = new THREE.Group();
  root.name = 'heart-vessels';
  rec.group.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(rec.group.matrixWorld).invert();

  const meshes = [], rels = [];
  rec.group.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    meshes.push(o);
    rels.push(new THREE.Matrix4().multiplyMatrices(invRoot, o.matrixWorld));
  });
  const map = buildRadialMap(meshes, rels);
  if (!map) return { group: root, update() {}, dispose() {} };

  const disposables = [];
  const mats = [];
  const S = map.box.getSize(new THREE.Vector3());
  const unit = Math.max(0.02, Math.max(S.x, S.y, S.z) * 0.5);   // 半个器官尺寸，用于比例化半径

  /** 加一根血管：变半径管 + 脉搏波材质 */
  function addVessel(points, opt) {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    const segs = Math.max(24, Math.min(80, points.length * 3));
    const r0 = opt.r0, r1 = opt.r1;
    // 粗管（心底大血管）与细管（冠脉）用不同的曝光/底光：
    // 冠脉若按大血管那套打光，饱和血红会被影棚灯洗成白线。
    const isBig = r0 > 0.045 * unit;
    const radiusAt = u => {
      const base = r0 + (r1 - r0) * Math.pow(u, 0.85);
      // 根部主动脉窦 / 分叉起始处略膨大，接口更自然
      const bulb = opt.bulb ? 1 + opt.bulb * Math.exp(-Math.pow(u / 0.10, 2)) : 1;
      return base * bulb;
    };
    const depthTest = opt.depthTest ?? true;
    const geo = vesselGeometry(curve, radiusAt, segs, opt.radial || 9);
    const mat = createVesselMaterial({
      color: opt.color, colorEnd: opt.colorEnd,
      opacity: opt.opacity ?? 0.97,
      travel: opt.travel ?? 0.10,
      phase: opt.phase ?? 0,
      pulseAmp: opt.pulseAmp ?? 0.10,
      flowSpeed: opt.flowSpeed ?? 0.8,
      flowStr: opt.flowStr ?? 0.22,
      depthTest,
      // 心脏表面的血管不需要「造影透视」那层亮，收一点高光才像贴着肉的血管
      emissiveScale: opt.emissiveScale ?? (isBig ? 0.14 : 0.08),
      env: opt.env ?? (isBig ? 1.2 : 0.9),
      exposure: opt.exposure ?? (isBig ? 0.85 : 0.72),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = opt.order ?? 14;
    mesh.frustumCulled = false;
    root.add(mesh);
    disposables.push(geo, mat);
    mats.push(mat);

    // 开放管的末端是平截的，看着像被切断的木棍；补一个圆钝的断端
    if (opt.capEnd !== false) {
      const endColor = new THREE.Color(opt.colorEnd ?? opt.color);
      const capGeo = new THREE.SphereGeometry(radiusAt(1) * 0.98, 12, 8);
      const capExp = opt.exposure ?? (isBig ? 0.85 : 0.72);
      const capMat = new THREE.MeshPhysicalMaterial({
        color: endColor.clone().multiplyScalar(capExp),
        emissive: endColor.clone().multiplyScalar(0.08 * capExp),
        roughness: 0.46, clearcoat: 0.40,
        transparent: true, opacity: opt.opacity ?? 0.97,
        depthWrite: false, depthTest,
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.copy(curve.getPointAt(1));
      cap.renderOrder = opt.order ?? 14;
      cap.frustumCulled = false;
      root.add(cap);
      disposables.push(capGeo, capMat);
    }
  }

  /* ---- 一、冠状动脉：主支贴面走沟，二级分支斜向下分出 ---- */
  // a 是绕长轴方位角；drift 让主支沿沟略有摆动而不是笔直的经线
  const CORONARY = [
    { id: 'lad',  a0: 1.35, drift: 0.42, h0: 0.90, h1: 0.10, r0: 0.054 * unit, r1: 0.019 * unit,
      color: 0xff6f52, colorEnd: 0xc04038, phase: 0.26, travel: 0.20, pulseAmp: 0.085,
      twigs: [{ at: 0.72, da: 0.62, span: 0.26 }, { at: 0.48, da: -0.55, span: 0.24 },
              { at: 0.30, da: 0.50, span: 0.18 }] },
    { id: 'lcx',  a0: 2.62, drift: -0.30, h0: 0.88, h1: 0.55, r0: 0.048 * unit, r1: 0.022 * unit,
      color: 0xf86850, colorEnd: 0xb83c38, phase: 0.27, travel: 0.17, pulseAmp: 0.075,
      twigs: [{ at: 0.80, da: -0.58, span: 0.22 }, { at: 0.60, da: -0.45, span: 0.18 }] },
    { id: 'rca',  a0: 3.95, drift: 0.34, h0: 0.89, h1: 0.24, r0: 0.051 * unit, r1: 0.020 * unit,
      color: 0xf96a50, colorEnd: 0xbb3e38, phase: 0.27, travel: 0.19, pulseAmp: 0.075,
      twigs: [{ at: 0.66, da: 0.60, span: 0.22 }, { at: 0.42, da: 0.48, span: 0.18 }] },
    { id: 'pda',  a0: 5.20, drift: -0.26, h0: 0.52, h1: 0.09, r0: 0.034 * unit, r1: 0.015 * unit,
      color: 0xe06050, colorEnd: 0xa83838, phase: 0.29, travel: 0.15, pulseAmp: 0.070,
      twigs: [{ at: 0.62, da: -0.44, span: 0.16 }] },
  ];
  const lift = 0.034 * unit;      // 外扩：让管子半个截面露出心外膜
  for (const br of CORONARY) {
    const N = 26;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const h = br.h0 + (br.h1 - br.h0) * u;
      const a = br.a0 + br.drift * Math.sin(u * Math.PI * 0.85) + 0.055 * Math.sin(u * 9.0);
      pts.push(map.point(h, a, lift));
    }
    // 真实心脏标本里冠脉是躺在房室沟 / 室间沟的黄色脂肪垫里的，
    // 先铺一条更宽、更淡的脂肪沟，再让红色血管压在上面，血管才「长在肉上」
    addVessel(pts.map(p => p.clone()), {
      r0: br.r0 * 1.55, r1: br.r1 * 1.55,
      color: 0xd8b987, colorEnd: 0xb99a68,
      opacity: 0.52, pulseAmp: 0.018, flowStr: 0.05,
      travel: br.travel, phase: br.phase, radial: 8,
      capEnd: false, order: 13, emissiveScale: 0.04, env: 0.8, exposure: 0.58,
    });
    addVessel(pts, { ...br, bulb: 0.18, radial: 8 });

    // 二级分支：从主支某处斜着分出，越往末端越细
    (br.twigs || []).forEach((tw, k) => {
      const aAt = br.a0 + br.drift * Math.sin((1 - tw.at) * Math.PI * 0.85) + 0.055 * Math.sin((1 - tw.at) * 9.0);
      const bp = [];
      const M = 9;
      for (let i = 0; i <= M; i++) {
        const u = i / M;
        const h = Math.max(0.07, tw.at - tw.span * u);
        const a = aAt + tw.da * u;
        bp.push(map.point(h, a, lift * 0.85));
      }
      addVessel(bp, {
        r0: br.r0 * 0.56, r1: br.r1 * 0.72,
        color: br.color, colorEnd: br.colorEnd,
        phase: br.phase + 0.03 + k * 0.01, travel: 0.09, pulseAmp: 0.055,
        radial: 7,
      });
    });
  }
  // 心大静脉：与前降支伴行、颜色青紫、几乎不搏动
  {
    const pts = [];
    for (let i = 0; i <= 22; i++) {
      const u = i / 22;
      const h = 0.88 - 0.72 * u;
      const a = 1.35 + 0.42 * Math.sin(u * Math.PI * 0.85) + 0.20;
      pts.push(map.point(h, a, lift * 1.05));
    }
    addVessel(pts, {
      r0: 0.024 * unit, r1: 0.014 * unit, color: 0x6b6088, colorEnd: 0x4d466c,
      phase: 0.05, travel: 0.12, pulseAmp: 0.018, flowStr: 0.16, radial: 8,
    });
  }

  /* ---- 二、心底大血管根部（心脏标本最好认的部分） ---- */
  const top = map.minY + map.spanY * 0.88;
  const hi = map.minY + map.spanY;
  const X = map.cx, Z = map.cz;
  const P = (x, y, z) => new THREE.Vector3(X + x * unit, y, Z + z * unit);
  const yUp = d => hi + d * unit;

  // 主动脉：升主动脉 → 主动脉弓（向后上再向左下）→ 降主动脉一小段
  addVessel([
    P(-0.05, top, 0.02), P(-0.045, yUp(0.10), 0.03), P(-0.035, yUp(0.24), 0.02),
    P(-0.01, yUp(0.40), -0.02), P(0.05, yUp(0.50), -0.10), P(0.12, yUp(0.52), -0.20),
    P(0.17, yUp(0.44), -0.27), P(0.18, yUp(0.30), -0.30), P(0.18, yUp(0.16), -0.30),
  ], {
    r0: 0.095 * unit, r1: 0.065 * unit, bulb: 0.22,
    color: 0xdd7a68, colorEnd: 0xb04a48, phase: 0.035, travel: 0.07,
    pulseAmp: 0.17, flowStr: 0.26, radial: 12,
  });
  // 主动脉弓三分支（头臂干 / 左颈总 / 左锁骨下）
  [[-0.02, 0.52, 0.00, 0.05, 0.90], [0.06, 0.53, -0.09, 0.11, 0.88], [0.13, 0.51, -0.19, 0.17, 0.86]]
    .forEach(([x, d, z, x2, d2], k) => {
      addVessel([
        P(x, yUp(d), z), P(x + (x2 - x) * 0.4, yUp(d + 0.16), z), P(x2, yUp(d2), z - 0.02),
      ], {
        r0: 0.031 * unit, r1: 0.022 * unit, color: 0xd97060, colorEnd: 0xad4846,
        phase: 0.08 + k * 0.01, travel: 0.06, pulseAmp: 0.13, radial: 8,
      });
    });
  // 肺动脉干 + 左右肺动脉（走在主动脉前方，偏暗紫红）
  addVessel([
    P(0.20, top - 0.01 * unit, 0.30), P(0.21, yUp(0.12), 0.32), P(0.20, yUp(0.30), 0.28),
    P(0.12, yUp(0.40), 0.20),
  ], {
    r0: 0.082 * unit, r1: 0.060 * unit, bulb: 0.12,
    color: 0xc06068, colorEnd: 0x8d424e, phase: 0.05, travel: 0.07,
    pulseAmp: 0.12, flowStr: 0.2, radial: 11,
  });
  addVessel([P(0.12, yUp(0.40), 0.20), P(0.34, yUp(0.38), 0.06), P(0.52, yUp(0.32), -0.06)], {
    r0: 0.048 * unit, r1: 0.032 * unit, color: 0xb35662, colorEnd: 0x82404e,
    phase: 0.09, travel: 0.08, pulseAmp: 0.09, radial: 9,
  });
  addVessel([P(0.12, yUp(0.40), 0.20), P(-0.06, yUp(0.37), 0.06), P(-0.24, yUp(0.30), -0.10)], {
    r0: 0.046 * unit, r1: 0.031 * unit, color: 0xb35662, colorEnd: 0x82404e,
    phase: 0.09, travel: 0.08, pulseAmp: 0.09, radial: 9,
  });
  // 上腔静脉（右后上方，青紫、几乎不搏动）
  addVessel([
    P(-0.34, yUp(0.62), -0.24), P(-0.32, yUp(0.38), -0.22), P(-0.28, yUp(0.10), -0.18),
    P(-0.26, top, -0.14),
  ], {
    r0: 0.070 * unit, r1: 0.060 * unit, color: 0x7184ae, colorEnd: 0x4c5c8e,
    phase: 0.0, travel: 0.05, pulseAmp: 0.022, flowStr: 0.16, radial: 10,
  });
  // 下腔静脉（后下方短干）
  addVessel([
    P(-0.24, map.minY - 0.30 * unit, -0.24), P(-0.24, map.minY + 0.02 * unit, -0.20),
    P(-0.22, map.minY + 0.22 * unit, -0.16),
  ], {
    r0: 0.064 * unit, r1: 0.058 * unit, color: 0x6a79a6, colorEnd: 0x495888,
    phase: 0.0, travel: 0.05, pulseAmp: 0.018, flowStr: 0.16, radial: 10,
  });
  // 肺静脉：左右各两根短干从后方进入左房（含氧血，颜色偏鲜红）
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const zz = -0.30 - k * 0.10;
      addVessel([
        P(side * (0.52 + k * 0.06), yUp(0.10 + k * 0.05), zz),
        P(side * 0.30, yUp(0.04), zz + 0.04),
        P(side * 0.14, top - 0.02 * unit, -0.16),
      ], {
        r0: 0.039 * unit, r1: 0.032 * unit, color: 0xd06a60, colorEnd: 0xa54848,
        phase: 0.12, travel: 0.06, pulseAmp: 0.070, radial: 8,
      });
    }
  }

  rec.group.add(root);

  return {
    group: root,
    update(t) { updateVesselMaterials(mats, t); },
    dispose() {
      rec.group.remove(root);
      disposables.forEach(d => d.dispose && d.dispose());
    },
  };
}
