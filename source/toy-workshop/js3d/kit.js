/* ============================================================
 * kit.js — 3D 模型构建工具箱
 * 提供：配色、材质缓存、几何体缓存、零件组合、线框幽灵、齿齿轮/车轮
 * 所有玩具模型都用「图元数组」描述，见 models.js
 * ============================================================ */
import * as THREE from 'three';

/* ---------- 配色 ---------- */
export const PA = {
  wood: '#C98A4B', woodD: '#A96F35', woodL: '#E3B37B',
  red: '#E4572E', redD: '#B93E1E', org: '#F4A259',
  yellow: '#FFC53D', green: '#4CAF50', greenD: '#2F8B44',
  teal: '#2E9E9B', blue: '#3B82C4', blueD: '#2A5F91', sky: '#7FC4E8',
  purple: '#8E6BC8', purpleD: '#6B4F9E', purpleL: '#B49BE0', pink: '#F08CA0',
  metal: '#B8BEC6', metalD: '#7C8794', steel: '#D5DBE2',
  tire: '#3A3632', white: '#F7F3EA', cream: '#FFF3DC',
  dark: '#2E2A26', glass: '#BFE3F0', gold: '#E8B23A'
};

/* ---------- 材质缓存 ---------- */
const mcache = new Map();
export function mat(c, o = {}) {
  const op = o.op ?? 1;
  const key = [c, o.m ?? 0, o.ro ?? 0.72, op, o.dbl ? 1 : 0, o.em ?? 0].join('|');
  let m = mcache.get(key);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(c),
    metalness: o.m ?? 0,
    roughness: o.ro ?? 0.72,
    side: o.dbl ? THREE.DoubleSide : THREE.FrontSide,
    transparent: op < 1,
    opacity: op
  });
  if (o.em !== undefined) {
    m.emissive = new THREE.Color(typeof o.em === 'string' ? o.em : c);
    m.emissiveIntensity = typeof o.em === 'number' ? o.em : 0.35;
  }
  if (op < 1) m.depthWrite = false;
  mcache.set(key, m);
  return m;
}

const gcache = new Map();
function geom(pr) {
  const k = JSON.stringify([pr.t, pr.s, pr.rt, pr.rb, pr.h, pr.rad, pr.tube, pr.arc, pr.seg, pr.a, pr.b, pr.d, pr.pts, pr.holes, pr.len, pr.turns, pr.bore]);
  let g = gcache.get(k);
  if (g) return g;
  switch (pr.t) {
    case 'b': g = new THREE.BoxGeometry(pr.s[0], pr.s[1], pr.s[2]); break;
    /* 圆柱：pr.bore>0 时用 Lathe 旋成「带轴孔的套筒」，真正挖空，供轴瓦/衬套使用 */
    case 'c': {
      const bore = pr.bore || 0, seg = pr.seg || 24;
      if (bore > 0 && bore < Math.min(pr.rt, pr.rb ?? pr.rt)) {
        const half = pr.h / 2, rb = pr.rb ?? pr.rt;
        g = new THREE.LatheGeometry([
          new THREE.Vector2(bore, -half),
          new THREE.Vector2(rb, -half),
          new THREE.Vector2(pr.rt, half),
          new THREE.Vector2(bore, half),
          new THREE.Vector2(bore, -half)
        ], seg);
      } else {
        g = new THREE.CylinderGeometry(pr.rt, pr.rb ?? pr.rt, pr.h, seg);
      }
      break;
    }
    case 'k': g = new THREE.ConeGeometry(pr.rad, pr.h, pr.seg || 22); break;
    case 's': g = new THREE.SphereGeometry(pr.rad, pr.seg || 22, (pr.seg || 22) / 2); break;
    case 'o': g = new THREE.TorusGeometry(pr.rad, pr.tube, pr.seg2 || 10, pr.seg || 36, pr.arc ?? Math.PI * 2); break;
    case 'p': g = new THREE.PlaneGeometry(pr.s[0], pr.s[1]); break;
    /* 轮廓挤出：pts 是平面闭合点列（XY），沿 Z 挤出 d，居中；holes 为内孔点列 */
    case 'pf': {
      const sh = new THREE.Shape();
      pr.pts.forEach((pt, i) => i ? sh.lineTo(pt[0], pt[1]) : sh.moveTo(pt[0], pt[1]));
      sh.closePath();
      (pr.holes || []).forEach(hp => {
        const h = new THREE.Path();
        hp.forEach((pt, i) => i ? h.lineTo(pt[0], pt[1]) : h.moveTo(pt[0], pt[1]));
        h.closePath();
        sh.holes.push(h);
      });
      g = new THREE.ExtrudeGeometry(sh, { depth: pr.d, bevelEnabled: false, curveSegments: 6, steps: 1 });
      g.translate(0, 0, -pr.d / 2);
      break;
    }
    /* 螺旋管：轴沿 X，rad 螺旋半径、tube 管径、len 长度、turns 圈数 */
    case 'hd': {
      const len = pr.len ?? 2, turns = pr.turns ?? 6, rad = pr.rad ?? 0.3;
      const N = Math.max(36, Math.round(turns * 28));
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, a = t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3((t - 0.5) * len, Math.cos(a) * rad, Math.sin(a) * rad));
      }
      g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, pr.tube ?? 0.06, 8, false);
      break;
    }
    default: g = new THREE.BoxGeometry(1, 1, 1);
  }
  gcache.set(k, g);
  return g;
}

/* ---------- 单个图元 → Mesh ---------- */
const UP = new THREE.Vector3(0, 1, 0);
function meshOf(pr) {
  const m = new THREE.Mesh(geom(pr), mat(pr.c, pr.bore ? Object.assign({}, pr, { dbl: true }) : pr));
  if (pr.t === 'd') {
    const a = new THREE.Vector3(...pr.a), b = new THREE.Vector3(...pr.b);
    const dir = b.clone().sub(a);
    const len = dir.length();
    m.geometry = new THREE.CylinderGeometry(pr.rad, pr.rad, len, pr.seg || 14);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
  } else {
    if (pr.p) m.position.fromArray(pr.p);
    if (pr.rot) m.rotation.set(pr.rot[0] || 0, pr.rot[1] || 0, pr.rot[2] || 0);
  }
  if (pr.sc) m.scale.fromArray(pr.sc);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ---------- 零件 → Group ---------- */
export function buildGroup(prims, partId) {
  const g = new THREE.Group();
  (prims || []).forEach(pr => g.add(meshOf(pr)));
  if (partId) g.userData.partId = partId;
  const box = new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  g.userData.size = size;
  g.userData.center = center;
  g.userData.radius = Math.max(size.x, size.y, size.z) / 2 || 0.4;
  return g;
}

/* ---------- 幽灵（半透明）副本 ---------- */
let ghostMat = null;
function getGhostMat() {
  if (!ghostMat) {
    ghostMat = new THREE.MeshBasicMaterial({
      color: 0x3aa6ff, transparent: true, opacity: 0.22,
      depthWrite: false, side: THREE.DoubleSide
    });
  }
  return ghostMat;
}
export function buildGhost(prims) {
  const g = buildGroup(prims);
  g.traverse(o => { if (o.isMesh) { o.material = getGhostMat(); o.castShadow = false; o.receiveShadow = false; } });
  g.userData.ghost = true;
  return g;
}

/* ---------- 常用复合件 ---------- */
/* 车轮：轴向 Z，可绕 X 滚动 */
export function WHEEL(r, p, tireC = PA.tire, hubC = PA.yellow, w) {
  const thick = w || r * 0.42;
  return [
    { t: 'c', rt: r, h: thick, p, rot: [Math.PI / 2, 0, 0], c: tireC, ro: 0.95 },
    { t: 'c', rt: r * 0.62, h: thick * 1.04, p, rot: [Math.PI / 2, 0, 0], c: hubC, ro: 0.6 },
    { t: 'c', rt: r * 0.15, h: thick * 1.12, p, rot: [Math.PI / 2, 0, 0], c: PA.steel, m: 0.8, ro: 0.35 }
  ];
}

/* 齿轮：位于 XY 平面，轴向 Z */
export function GEAR(r, teeth, thick, c, o = {}) {
  const out = [{ t: 'c', rt: r, h: thick, p: [0, 0, 0], rot: [Math.PI / 2, 0, 0], c, m: o.m ?? 0.45, ro: 0.42 }];
  const tw = (2 * Math.PI * r / teeth) * 0.6;
  for (let i = 0; i < teeth; i++) {
    const a = i / teeth * Math.PI * 2;
    const R = r + r * 0.08;
    out.push({
      t: 'b', s: [tw, r * 0.18, thick], c,
      p: [Math.cos(a) * R, Math.sin(a) * R, 0], rot: [0, 0, a],
      m: o.m ?? 0.45, ro: 0.42
    });
  }
  out.push({ t: 'c', rt: r * 0.22, h: thick * 1.05, p: [0, 0, 0], rot: [Math.PI / 2, 0, 0], c: PA.metalD, m: 0.7, ro: 0.4 });
  return out;
}

/* 车轮辐条 */
export function SPOKES(r, p, n = 6, c = PA.steel) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI;
    arr.push({ t: 'b', s: [r * 0.06, r * 2, 0.02], p, rot: [0, 0, a], c, m: 0.7, ro: 0.4 });
  }
  return arr;
}

/* 圆周排列的挡条（风扇网罩） */
export function RADIAL(n, rInner, rOuter, thick, p, c = PA.metal, axis = 'z') {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const mid = (rInner + rOuter) / 2;
    const len = rOuter - rInner;
    const p2 = [p[0] + Math.cos(a) * mid, p[1] + Math.sin(a) * mid, p[2]];
    const rot = axis === 'z' ? [0, 0, a] : [0, 0, a];
    arr.push({ t: 'b', s: [len, thick, thick * 1.6], p: p2, rot, c, m: 0.6, ro: 0.45 });
  }
  return arr;
}
