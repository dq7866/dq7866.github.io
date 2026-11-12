// 占位格 → 实体几何
import * as THREE from '../lib/three.module.js';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';
import { GEAR_MODULE } from './shapes.js';

export const CELL = 1;        // 一格宽度
export const PLATE = 1;       // 一层高度（与格子等高，堆叠才能严丝合缝）
export const BODY_H = 0.99;   // 实体高度（几乎与格子等高，只留一根发丝缝）
// v1.26 贴合标准：积木与积木之间只留「一条细线」当分界。
// 原来 GAP=0.004 + BEVEL=0.07 —— 倒角 0.07 格意味着每块积木上下四周都被削掉一大圈，
// 两块拼在一起时接缝两侧各退 0.07，视觉上就是一条又宽又深的沟，积木像悬空没挨上。
// 现在倒角收到 0.018（只剩一道极细的磨边），横向内缩 0.006（1/170 格，仅防 Z-fighting），
// 贴合面真正贴住，接缝就是一条细线。
export const GAP = 0.006;     // 实体横向内缩（贴合而非悬空，接缝只作分界）
export const STUD_R = 0.26;
export const STUD_H = 0.14;
export const BEVEL = 0.018;

/** 层间缝：1/250 格，肉眼几乎不可见，只为避免两个面完全共面产生闪面 */
export const SEAM_Y = 0.004;

/** 带孔积木 / 通孔件的孔径：螺钉杆 0.125、螺栓杆 0.10 都能穿过，头还盖得住 */
export const HOLE_R = 0.19;

/**
 * v1.20 装配配合标准（借鉴 toy-workshop 机械原理馆的 autoBore：细销轴穿过粗圆柱时自动挖孔）
 * 目标：像 SolidWorks 装配体一样，轴伸进轮毂的「孔」里，而不是插进实心肉里。
 *  - shaftR   标准轴半径（电机出轴、传动轴轴端）
 *  - boreR    所有装在轴上的轮类零件的统一配合孔半径（孔轴单边间隙 0.05）
 *  - flangeR  轴端挡圈/键/拨爪的最大半径，必须 < boreR，才不会撞孔壁
 *  - gap      粗大机件（端盖、风扇罩、凸台）沿轴向要收进占位格半宽这么多，
 *             否则相邻两格的端面会互相嵌入 0.05 格，干涉检查会报过盈。
 * 约定：只有半径 ≤ flangeR 的细轴允许伸出占位格去接相邻零件。
 */
// boreR 已含 extrude/annulus 的 0.02 倒角余量：实际有效孔径 ≈0.185，
// 轴端最粗的挡圈 0.15 仍能带着 0.035 单边间隙穿过，不会擦到孔壁。
export const FIT = { shaftR: 0.13, boreR: 0.205, flangeR: 0.15, gap: 0.03 };

/**
 * 连杆两端轴孔的中心（连杆局部坐标，原点在占位底面中心，+y 指向小头）。
 * 曲柄滑块动画必须按这两个数把孔套到销上——以前按"孔在 0 和 2"摆，
 * 实际孔在 0.44 / 2.71，两端各偏出 0.4 格，肉眼看就是连杆插进曲柄和活塞里。
 */
export const CONROD_PIN = (() => {
  // 杆身长 2.40 格、两端孔心 0.30 / 2.15 → 孔距 1.85 格。
  // 这个长度是"配"出来的：卧式曲柄滑块在图上的实际销距就是 1.85 格，
  // 孔距必须等于销距，连杆才是刚体、两端孔才同时套在销上（不需要任何拉伸）。
  const len = 2.40, y0 = 0.30, y1 = 2.15;
  return { len, y0, y1, span: y1 - y0 };
})();
/** 活塞销中心的高度（局部坐标）：与 geom 里 piston 的 pin 位置一致 */
export const PISTON_PIN_Y = h => h * PLATE * 0.42 * 0.5;
/** 轮毂配合孔：不小于统一孔径，也保证外圈还有壁厚 */
const bore = r => Math.max(FIT.boreR, r);
/** 平键/键槽块的内边缘必须让出配合孔 */
const keyAt = (halfW, prefer) => Math.max(prefer, FIT.boreR + halfW + 0.012);

const key = (x, y, z) => `${x}|${y}|${z}`;

/** 贪心合并：把相邻格子合成大长方体，减少面数、让积木更"整" */
export function mergeCells(cells) {
  const map = new Map();
  cells.forEach(c => map.set(key(c.c, c.r, c.l), c));
  const used = new Set();
  const boxes = [];
  const has = (c, r, l) => map.has(key(c, r, l)) && !used.has(key(c, r, l));

  const sorted = [...map.values()].sort((a, b) => a.l - b.l || a.r - b.r || a.c - b.c);

  for (const s of sorted) {
    if (used.has(key(s.c, s.r, s.l))) continue;
    const { c: c0, r: r0, l: l0 } = s;

    let w = 1;
    while (has(c0 + w, r0, l0)) w++;

    let d = 1;
    outer: while (true) {
      const rr = r0 + d;
      for (let i = 0; i < w; i++) if (!has(c0 + i, rr, l0)) break outer;
      d++;
    }

    let h = 1;
    outerY: while (true) {
      const ll = l0 + h;
      for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (!has(c0 + i, r0 + j, ll)) break outerY;
      h++;
    }

    for (let l = 0; l < h; l++) for (let r = 0; r < d; r++) for (let c = 0; c < w; c++) used.add(key(c0 + c, r0 + r, l0 + l));
    boxes.push({ c0, r0, l0, w, d, h });
  }
  return boxes;
}

/** 带倒角的盒子（把 8 个角往里收一点，得到圆润的积木边） */
function roundedBox(w, h, d, r) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const pos = geo.attributes.position;
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const sx = Math.sign(v.x) || 1, sy = Math.sign(v.y) || 1, sz = Math.sign(v.z) || 1;
    if (Math.abs(v.x) > hw - 1e-4 && Math.abs(v.y) > hh - 1e-4 && Math.abs(v.z) > hd - 1e-4) {
      v.x -= sx * r;
      v.y -= sy * r;
      v.z -= sz * r;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

let _stud = null;
function studGeo() {
  if (!_stud) _stud = new THREE.CylinderGeometry(STUD_R, STUD_R * 0.92, STUD_H, 12, 1, false);
  return _stud;
}

/**
 * 积木凸点（乐高式啮合圆点）开关：
 * 默认关闭——光面积木更接近真实木工/砌砖的"接触面贴合"搭法，
 * 设置面板「积木凸点」可随时打开。切换后由 world.setStuds 清几何缓存并重放积木。
 */
let STUDS_ON = false;
export function setStudsOn(v) { STUDS_ON = !!v; }
export function studsEnabled() { return STUDS_ON; }

// ===================== 异形实体 =====================
// 占位格仍然是整数格（吸附、碰撞、稳固检查全靠它），
// 但外观改用真正的曲面/异形几何体，这样"圆柱就是圆的、球就是球的"，
// 而不是拿小方块一级级堆出来的锯齿近似。
// 返回值统一放在局部坐标：x∈[-w/2,w/2]  z∈[-d/2,d/2]  y∈[0,h]

function extrude(shape2d, depth, bevel = 0.028) {
  const g = new THREE.ExtrudeGeometry(shape2d, {
    depth: Math.max(0.02, depth - bevel * 2),
    bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 24,
  });
  return g;
}

/** 沿 Y 轴立起来的拉伸体（ExtrudeGeometry 默认沿 +Z，转一下让它竖直） */
function extrudeY(shape2d, height) {
  const g = extrude(shape2d, height);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** 正 n 边形轮廓（外接圆半径 R） */
function polyShape(R, n, rot = 0) {
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const x = Math.cos(a) * R, y = Math.sin(a) * R;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function starShape(R, r, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? R : r;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** 顶部凸点的排布方式：中心一个 / 环上一圈 / 按格子 / 不要 */
function studsFor(mode, w, d, h) {
  const out = [];
  const top = h * PLATE - 0.06;
  const put = (x, z, r = STUD_R) => {
    const s = new THREE.CylinderGeometry(r, r * 0.92, STUD_H, 14, 1, false);
    s.translate(x, top + STUD_H / 2 - 0.012, z);
    out.push(s);
  };
  if (mode === 'none') return out;
  if (mode === 'center') { put(0, 0, Math.min(0.34, Math.min(w, d) * 0.3)); return out; }
  if (mode === 'ring') {
    const R = Math.min(w, d) / 2 - GAP, rm = (R + R * 0.5) / 2;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      put(Math.cos(a) * rm, Math.sin(a) * rm);
    }
    return out;
  }
  // grid：按顶层格心排布
  for (let c = 0; c < w; c++) for (let r = 0; r < d; r++) put(c + 0.5 - w / 2, r + 0.5 - d / 2);
  return out;
}

/**
 * 把一段圆环切成 n 块"楔形拱石"（2D 轮廓，圆心在原点，角度从 a0 转到 a1）。
 * 石块之间留一道细缝，孩子一眼就能看出这是"一块块石头拼起来的圆"，
 * 而不是一个光滑的塑料圈——这是月亮门、石拱桥的关键质感。
 */
function voussoirs(R, r, n, a0 = 0, a1 = Math.PI * 2, gap = 0.05) {
  const out = [];
  const span = a1 - a0;
  const half = Math.min(gap, (span / n) * 0.32) / 2;
  for (let i = 0; i < n; i++) {
    const s0 = a0 + (i / n) * span + half;
    const s1 = a0 + ((i + 1) / n) * span - half;
    if (s1 - s0 <= 0.01) continue;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, R, s0, s1, false);
    sh.absarc(0, 0, r, s1, s0, true);
    sh.closePath();
    out.push(sh);
  }
  return out;
}

/** 齿轮 2D 轮廓（XY 平面，中心在原点）：梯形齿 + 中心轴孔 */
function gearProfile(R, teeth, holeR) {
  const s = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  const rRoot = R * 0.84;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const seq = [[0, rRoot], [0.13, R], [0.37, R], [0.5, rRoot], [0.76, rRoot]];
    seq.forEach(([t, r], j) => {
      const ang = a + step * t;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  if (holeR) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return s;
}

/**
 * 槽轮轮廓：轮缘开 N 条由外向内收窄的深槽（马耳他十字那种），
 * 拨销伸进槽里推着走，出槽就被锁止弧扣住——间歇步进的灵魂。
 */
function genevaProfile(Ro, Rr, n, wall) {
  const s = new THREE.Shape();
  const step = (Math.PI * 2) / n;
  const th = step * 0.3;          // 齿（槽之间的材料）在轮缘占的半角
  for (let i = 0; i < n; i++) {
    const a = i * step;
    // 齿顶弧：沿外圆从 a−th 走到 a+th
    const nSeg = 7;
    for (let k = 0; k <= nSeg; k++) {
      const ang = a - th + (k / nSeg) * th * 2;
      const x = Math.cos(ang) * Ro, y = Math.sin(ang) * Ro;
      if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    // 槽：从轮缘收到槽底，走一段槽底弧再回到下一个齿
    const a1 = a + th + wall, a2 = a + step - th - wall;
    s.lineTo(Math.cos(a1) * Rr, Math.sin(a1) * Rr);
    const nSeg2 = 5;
    for (let k = 1; k <= nSeg2; k++) {
      const ang = a1 + ((a2 - a1) * k) / nSeg2;
      s.lineTo(Math.cos(ang) * Rr, Math.sin(ang) * Rr);
    }
    s.lineTo(Math.cos(a + step - th) * Ro, Math.sin(a + step - th) * Ro);
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.max(Rr * 0.32, FIT.boreR), 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

/**
 * 螺旋齿面（蜗杆 / 丝杠的螺纹）：沿 +X 轴扫掠一圈梯形牙型。
 * 真蜗杆的螺纹是"绕着轴盘上去的一条梯形凸棱"，不是缠在轴上的圆管，
 * 所以这里直接算顶点：每个采样位置给出牙根/牙顶的四个角点再连成面。
 */
function screwThread(len, rRoot, rTip, pitch, starts = 1, seg = 16) {
  const pos = [], idx = [];
  const turns = Math.max(0.4, len / pitch);
  const N = Math.max(10, Math.round(turns * seg));
  const wR = pitch * 0.52, wT = pitch * 0.2;     // 牙根宽 / 牙顶宽（梯形）
  const prof = [
    [-wR / 2, rRoot],
    [-wT / 2, rTip],
    [wT / 2, rTip],
    [wR / 2, rRoot],
  ];
  for (let s = 0; s < starts; s++) {
    const base = pos.length / 3;
    const phase = (s / starts) * Math.PI * 2;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const x = -len / 2 + u * len;
      const a = (x / pitch) * Math.PI * 2 + phase;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const [dx, r] of prof) pos.push(x + dx, r * ca, r * sa);
    }
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        const a0 = base + i * 4 + k, b0 = base + i * 4 + k2;
        const a1 = base + (i + 1) * 4 + k, b1 = base + (i + 1) * 4 + k2;
        idx.push(a0, a1, b1, a0, b1, b0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 棘轮轮廓：齿背是一段缓坡，齿面是陡直的"坎"，所以只能往一个方向转 */
function ratchetProfile(R, n, holeR) {
  const s = new THREE.Shape();
  const step = (Math.PI * 2) / n;
  const rRoot = R * 0.8;
  for (let i = 0; i < n; i++) {
    const a0 = i * step;
    const aTip = a0 + step * 0.82;
    if (i === 0) s.moveTo(Math.cos(a0) * rRoot, Math.sin(a0) * rRoot);
    else s.lineTo(Math.cos(a0) * rRoot, Math.sin(a0) * rRoot);
    s.lineTo(Math.cos(aTip) * R, Math.sin(aTip) * R);
    s.lineTo(Math.cos(a0 + step) * rRoot, Math.sin(a0 + step) * rRoot);
  }
  s.closePath();
  if (holeR) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return s;
}

/** 哑铃形链板（滚子链的内外链板就是这个形状：两端圆头、中间收腰） */
/** 二维凸包（Andrew 单调链）——给"几个圆的并集"求外轮廓用 */
function convexHull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

/**
 * 曲柄臂（曲柄脸颊）轮廓：绕主轴的大圆 + 绕曲柄销的小圆 + 对侧配重圆，
 * 取三圆并集的凸包。真曲轴的臂就是一块这样的"梨形"锻件——
 * 一个封闭轮廓挤出成一片实体，网格是**单一闭合壳**，不会自相交。
 */
function crankWebShape(p, Rw, Rp, Rc, cwY) {
  const pts = [];
  const ring = (cx, cy, r) => {
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  ring(0, 0, Rw);
  ring(0, p, Rp);
  ring(0, cwY, Rc);
  const hull = convexHull2(pts);
  const s = new THREE.Shape();
  hull.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function plateShape(pitch, r) {
  const s = new THREE.Shape();
  s.moveTo(-pitch / 2, r);
  s.lineTo(pitch / 2, r);
  s.absarc(pitch / 2, 0, r, Math.PI / 2, -Math.PI / 2, false);
  s.lineTo(-pitch / 2, -r);
  s.absarc(-pitch / 2, 0, r, -Math.PI / 2, -Math.PI * 1.5, false);
  s.closePath();
  return s;
}

/** 跑道形轮廓（皮带外/内轮廓）：两端半圆必须往外凸，绕向错了会自交 */
function runwayShape(L, hh, holeHh) {
  const s = new THREE.Shape();
  const rx = L / 2 - hh;
  s.moveTo(-rx, hh);
  s.lineTo(rx, hh);
  s.absarc(rx, 0, hh, Math.PI / 2, -Math.PI / 2, true);
  s.lineTo(-rx, -hh);
  s.absarc(-rx, 0, hh, -Math.PI / 2, -Math.PI * 1.5, true);
  s.closePath();
  if (holeHh) {
    const hole = new THREE.Path();
    const rx2 = L / 2 - hh;
    hole.moveTo(-rx2, holeHh);
    hole.lineTo(rx2, holeHh);
    hole.absarc(rx2, 0, holeHh, Math.PI / 2, -Math.PI / 2, true);
    hole.lineTo(-rx2, -holeHh);
    hole.absarc(-rx2, 0, holeHh, -Math.PI / 2, -Math.PI * 1.5, true);
    hole.closePath();
    s.holes.push(hole);
  }
  return s;
}

/** 辐板轮：轮缘 + 若干辐条 + 轮毂（齿轮、飞轮、皮带轮共用的"工业感"骨架） */
function spokedWheel(solids, R, rimIn, dep, spokes, opts = {}) {
  // 轮缘外径不能超过齿根圆，否则齿圈外面会鼓出一圈"看不见的肉"
  const rimMid = (R + rimIn) / 2;
  const rimT = Math.min((R - rimMid) * 0.9, dep * 0.4);
  const rim = new THREE.TorusGeometry(rimMid, rimT, 8, 34);
  solids.push(rim);
  const hubR = Math.max(opts.hubR ?? R * 0.3, FIT.boreR + 0.06);
  // v1.20：轮毂是带真实通孔的环，不是实心饼（原来只用一个 torus 假装"看起来有孔"，
  // 电机出轴其实插在实心金属里，SolidWorks 干涉检查必然报过盈）
  const hub = annulus(hubR, FIT.boreR, dep * 0.86);
  solids.push(hub);
  // 孔口凸台：端面上一圈加厚，既是机加工件该有的样子，也不堵配合孔
  const lip = annulus(hubR * 0.86, FIT.boreR, 0.07, 0.01);
  lip.translate(0, 0, dep * 0.44);
  solids.push(lip);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + (opts.phase || 0);
    const arm = new THREE.BoxGeometry(rimIn * 0.94 - hubR * 0.5, Math.min(0.2, R * 0.12), dep * 0.42);
    arm.translate(hubR * 0.6 + (rimIn * 0.94 - hubR * 0.5) / 2, 0, 0);
    arm.rotateZ(a);
    solids.push(arm);
  }
  return hubR;
}

/**
 * 实体环：带真实端面厚度的环形件（外圈、内圈、挡边、法兰都用它）。
 * Torus 看着像"甜甜圈"，机加工件其实是有平端面、有壁厚的环。
 */
function annulus(Ro, Ri, dep, bevel = 0.018) {
  const s = new THREE.Shape();
  s.absarc(0, 0, Ro, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, Ri, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = extrude(s, Math.max(0.08, dep), bevel);
  g.translate(0, 0, -Math.max(0.08, dep) / 2);
  return g;
}

/** 实心六角柱（带或不带通孔）：六角螺母、螺栓头都用它整体成型 */
function hexSolid(R, holeR, height, along = 'y') {
  const s = polyShape(R, 6, Math.PI / 6);
  if (holeR > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  const g = extrude(s, height, 0.022);
  if (along === 'y') g.rotateX(-Math.PI / 2);
  else g.translate(0, 0, -height / 2);
  return g;
}

/** 工字梁截面：两片翼缘 + 中间腹板，连杆/机架梁靠它省料又抗弯 */
function iBeam(solids, len, wid, thk, web) {
  for (const sgn of [-1, 1]) {
    const f = new THREE.BoxGeometry(wid, len, web);
    f.translate(0, 0, sgn * (thk / 2 - web / 2));
    solids.push(f);
  }
  solids.push(new THREE.BoxGeometry(web, len, Math.max(0.04, thk - web * 2)));
}

/** 一圈沉头安装孔位（用小圆柱当孔口凸台，视觉上"这里有螺栓"） */
function holeBosses(solids, positions, r, dep, axis = 'y') {
  for (const [x, y, z] of positions) {
    const b = new THREE.CylinderGeometry(r, r, dep, 12);
    if (axis === 'y') b.translate(x, y, z);
    else if (axis === 'z') { b.rotateX(Math.PI / 2); b.translate(x, y, z); }
    else { b.rotateZ(Math.PI / 2); b.translate(x, y, z); }
    solids.push(b);
  }
}

function specialParts(kind, w, d, h, studMode = 'grid', params = {}) {
  const solids = [];
  // rigidRods：刚性导杆（不随压缩缩放）。压簧中心穿一根导杆、两端略长出弹簧座，
  // 视觉上立刻是「坐在导杆上的回程弹簧」，而不是悬空的一圈钢丝；也呼应几何注释里
  // 「弹簧座中心留导杆孔让顶杆穿过」的设计意图。它作为独立子网格，动画里只缩放簧身。
  const rigidRods = [];
  // rotor：随轴自转的「芯轴/转子」部件，单独成网格，运转时只有它转、机壳静止。
  // rotorCenter 是旋转前的局部轴心，assembleSpecial 会把它一起转到最终坐标系。
  const rotor = [];
  let rotorCenter = [0, 0, 0];
  // pin：零件上的「铰接销」在局部坐标里的位置（活塞销、连杆小头…）。
  // assembleSpecial 会把它转到最终姿态，动画里连杆就按这个点去套销——
  // 不再靠"估算"，所以活塞摆倒之后销的位置也是准的。
  let pin = null;
  // holes：零件上"通孔的孔心"（连杆两端大小头），装配时一起烘焙到最终姿态。
  // 动画按这两个点做刚体摆放，孔心永远精确落在销上——而不是靠"假定的杆长"。
  let holes = null;
  // lift：把整块零件抬一点，让它的上下表面和「格子砖」完全齐平。
  // 普通砖是 roundedBox(高 0.96) 放在 [0.018, 0.978]，异形件却是 [0, h]——
  // 带孔砖要嵌进墙里，必须跟格子砖对齐，否则顶面会陷下去一条缝。
  let lift = 0;
  const bh = h * PLATE - SEAM_Y;        // 与方块积木同高，堆叠才齐平
  const R = Math.min(w, d) / 2 - GAP;
  const dep = d - GAP * 2;

  switch (kind) {
    // 带孔砖：整块砖挖真通孔（ExtrudeGeometry 的 holes），
    // 螺钉杆能真的穿过去、螺母从背面拧上——而不是"钉进实心肉里"。
    case 'holeBrick': {
      // 与方块砖同一个外廓口径：ExtrudeGeometry 的 bevelSize 会把轮廓再向外推 0.028，
      // 所以这里先内缩，成品尺寸才和普通砖对齐（不凸出去顶邻居）。
      const hw = w / 2 - 0.052, hd = d / 2 - 0.052;
      const hh = h * PLATE - SEAM_Y - 2 * BEVEL;
      const cr = Math.min(0.14, Math.min(hw, hd) * 0.34);   // 外轮廓圆角
      const s2 = new THREE.Shape();
      s2.moveTo(-hw + cr, -hd);
      s2.lineTo(hw - cr, -hd); s2.absarc(hw - cr, -hd + cr, cr, -Math.PI / 2, 0, false);
      s2.lineTo(hw, hd - cr);  s2.absarc(hw - cr, hd - cr, cr, 0, Math.PI / 2, false);
      s2.lineTo(-hw + cr, hd); s2.absarc(-hw + cr, hd - cr, cr, Math.PI / 2, Math.PI, false);
      s2.lineTo(-hw, -hd + cr); s2.absarc(-hw + cr, -hd + cr, cr, Math.PI, Math.PI * 1.5, false);
      s2.closePath();
      // 孔位：**每格一个**，正对格子中心。螺钉/螺母按格摆放，落上去就必然对着孔，
      // 不用为了对齐孔位去记坐标——这也是"带孔砖"该有的用法。
      const hr = HOLE_R;
      const pts = [];
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < d; j++) pts.push([i + 0.5 - w / 2, j + 0.5 - d / 2]);
      }
      for (const [hx, hz] of pts) {
        const p = new THREE.Path();
        p.absarc(hx, hz, hr, 0, Math.PI * 2, true);
        s2.holes.push(p);
      }
      const g = extrudeY(s2, hh);
      solids.push(g);
      // 孔口加一圈沉台：真零件的孔口都倒过角，光秃秃的直筒不像加工件
      const ringS = new THREE.Shape();
      ringS.absarc(0, 0, hr + 0.1, 0, Math.PI * 2, false);
      const ringH = new THREE.Path();
      ringH.absarc(0, 0, hr, 0, Math.PI * 2, true);
      ringS.holes.push(ringH);
      for (const [hx, hz] of pts) {
        const cg = extrude(ringS, 0.07, 0.01);
        cg.rotateX(Math.PI / 2);
        cg.translate(hx, hh - 0.038, -hz);   // 沉台顶面与砖面齐平（-0.028 bevel + 0.01 半厚）
        solids.push(cg);
      }
      holes = pts.map(([hx, hz]) => [hx, 0, -hz]);
      lift = BEVEL;                         // 与格子砖对齐：整体抬 0.018
      break;
    }
    case 'cylinder': {
      const g = new THREE.CylinderGeometry(R, R, bh, 30, 1, false);
      g.translate(0, bh / 2, 0);
      solids.push(g);
      break;
    }
    case 'cone': {
      const g = new THREE.ConeGeometry(R, bh, 30, 1, false);
      g.translate(0, bh / 2, 0);
      solids.push(g);
      break;
    }
    case 'sphere': {
      const g = new THREE.SphereGeometry(1, 28, 18);
      g.scale(Math.max(0.05, w / 2 - GAP), Math.max(0.05, h * PLATE / 2 - GAP), Math.max(0.05, d / 2 - GAP));
      g.translate(0, h * PLATE / 2, 0);
      solids.push(g);
      break;
    }
    case 'dome': {
      const rx = Math.max(0.05, w / 2 - GAP), rz = Math.max(0.05, d / 2 - GAP);
      const g = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(rx, bh, rz);
      const cap = new THREE.CircleGeometry(1, 28);
      cap.rotateX(Math.PI / 2);           // 法线朝下，把半球底口封上
      cap.scale(rx, 1, rz);
      solids.push(g, cap);
      break;
    }
    case 'tube': {
      const ri = R * 0.5;
      const s = new THREE.Shape();
      s.absarc(0, 0, R, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, ri, 0, Math.PI * 2, true);
      s.holes.push(hole);
      solids.push(extrudeY(s, bh));
      break;
    }
    case 'ring': {
      // 由 12 块楔形拱石拼成的圆环（原来是光滑的甜甜圈，看不出是砌出来的）
      const rt = Math.min(bh / 2, R * 0.42);
      const segs = voussoirs(R - 0.02, Math.max(0.05, R - rt * 2), 12, 0, Math.PI * 2, 0.06);
      segs.forEach(s => solids.push(extrudeY(s, bh)));
      break;
    }
    case 'hex': {
      solids.push(extrudeY(polyShape(R, 6, Math.PI / 6), bh));
      break;
    }
    case 'star': {
      solids.push(extrudeY(starShape(R, R * 0.45), bh));
      break;
    }
    case 'wedge': {   // 直角三棱柱：一侧落地、一侧抬起，做斜坡/滑梯
      const bw = w - GAP * 2;
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, 0); s.lineTo(bw / 2, 0); s.lineTo(-bw / 2, bh); s.closePath();
      const g = extrude(s, dep);
      g.translate(0, 0, -dep / 2);
      solids.push(g);
      break;
    }
    case 'prism': {   // 对称三棱柱：人字屋顶、山尖
      const bw = w - GAP * 2;
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, 0); s.lineTo(bw / 2, 0); s.lineTo(0, bh); s.closePath();
      const g = extrude(s, dep);
      g.translate(0, 0, -dep / 2);
      solids.push(g);
      break;
    }
    case 'arch': {    // 一整块带圆拱门洞的墙板
      const bw = w - GAP * 2;
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, 0); s.lineTo(bw / 2, 0); s.lineTo(bw / 2, bh); s.lineTo(-bw / 2, bh); s.closePath();
      const a = bw * 0.29, ha = bh * 0.42;
      const hole = new THREE.Path();
      hole.moveTo(-a, 0); hole.lineTo(-a, ha);
      hole.absarc(0, ha, a, Math.PI, 0, true);   // 上半圆
      hole.lineTo(a, 0); hole.closePath();
      s.holes.push(hole);
      const g = extrude(s, dep);
      g.translate(0, 0, -dep / 2);
      solids.push(g);
      break;
    }
    case 'archRing': {   // 竖立的月洞环：一整圈楔形拱石，中间透空当门洞
      const Ro = Math.min(w, h * PLATE) / 2 - 0.03;
      const Ri = Ro * (2 / 3) + 0.03;
      const segs = voussoirs(Ro, Ri, 12, 0, Math.PI * 2, 0.06);
      segs.forEach(s => {
        const g = extrude(s, dep);
        g.translate(0, 0, -dep / 2);
        solids.push(g);
      });
      break;
    }
    case 'archTop': {    // 半圆拱券：坐在一条水平线上，7 块拱石往上收成半圆
      const Ro = w / 2 - 0.03;
      const Ri = Ro * (2 / 3) + 0.03;
      const segs = voussoirs(Ro, Ri, 7, 0, Math.PI, 0.07);
      segs.forEach(s => {
        const g = extrude(s, dep);
        g.translate(0, 0, -dep / 2);
        solids.push(g);
      });
      break;
    }
    case 'chamfer': {    // 切角砖：一个角被斜着削掉，用来把方形洞口磨成圆
      const bw = w - GAP * 2, bd = d - GAP * 2;
      const cut = Math.min(bw, bd) * 0.52;
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, -bd / 2);
      s.lineTo(bw / 2, -bd / 2);
      s.lineTo(bw / 2, bd / 2 - cut);
      s.lineTo(bw / 2 - cut, bd / 2);
      s.lineTo(-bw / 2, bd / 2);
      s.closePath();
      solids.push(extrudeY(s, bh));
      break;
    }
    case 'halfDisc': {   // 半圆板：平放的半圆，拼月牙台、喷泉池沿、剧场看台
      const s = new THREE.Shape();
      s.absarc(0, 0, R, 0, Math.PI, false);
      s.closePath();
      solids.push(extrudeY(s, bh));
      break;
    }
    case 'quarter': {    // 直角扇：90° 扇形实心块，圆角转台、滑道转角
      const s = new THREE.Shape();
      s.absarc(0, 0, R, -Math.PI / 2, 0, false);
      s.lineTo(0, 0);
      s.closePath();
      solids.push(extrudeY(s, bh));
      break;
    }
    case 'curvePath': {  // 弯道桥：90° 环带（外弧 + 内弧），赛道弯道、小弯曲
      const s = new THREE.Shape();
      s.absarc(0, 0, R, -Math.PI / 2, 0, false);
      s.absarc(0, 0, R * 0.5, 0, -Math.PI / 2, true);
      s.closePath();
      solids.push(extrudeY(s, bh));
      break;
    }
    case 'halfPipe': {   // 半管槽：开口朝上的 U 形槽，水槽、滑道、滚珠轨道
      const t = Math.max(0.12, R * 0.14);
      const s = new THREE.Shape();
      s.absarc(0, 0, R, Math.PI, Math.PI * 2, false);     // 外弧：下半圆，口朝上
      s.absarc(0, 0, R - t, Math.PI * 2, Math.PI, true);  // 内弧反向收回来
      s.closePath();
      const g = extrude(s, dep);
      g.scale(1, bh / R, 1);            // 槽深压到一格高，跟别的砖齐平
      g.translate(0, bh, -dep / 2);
      solids.push(g);
      break;
    }
    case 'frustum': {    // 锥台：上小下大，花盆、木桶、塔基
      const g = new THREE.CylinderGeometry(R * 0.62, R, bh, 28, 1, false);
      g.translate(0, bh / 2, 0);
      solids.push(g);
      break;
    }
    case 'trapezoid': {  // 梯形块：上窄下宽，护坡、堤岸、屋顶收边
      const bw = w - GAP * 2, bd = d - GAP * 2;
      const k = 0.42;                       // 顶部收窄比例
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, -bd / 2);
      s.lineTo(bw / 2, -bd / 2);
      s.lineTo(bw / 2 * (1 - k), bd / 2);
      s.lineTo(-bw / 2 * (1 - k), bd / 2);
      s.closePath();
      solids.push(extrudeY(s, bh));
      break;
    }
    case 'rivet': {      // 铆钉：圆帽压在接缝上
      const capR = Math.min(0.3, Math.min(w, d) * 0.3);
      const head = new THREE.CylinderGeometry(capR, capR * 1.08, 0.1, 18);
      head.translate(0, 0.05, 0);
      const dome = new THREE.SphereGeometry(capR * 0.86, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 0.6, 1);
      dome.translate(0, 0.1, 0);
      solids.push(head, dome);
      break;
    }
    case 'screw': {      // 螺钉：圆头十字槽 + 带螺纹的杆
      const head = new THREE.CylinderGeometry(0.27, 0.27, 0.09, 18);
      head.translate(0, 0.045, 0);
      const shaft = new THREE.CylinderGeometry(0.125, 0.09, 0.6, 14);
      shaft.translate(0, 0.09 + 0.3, 0);
      solids.push(head, shaft);
      for (let i = 0; i < 3; i++) {
        const t = new THREE.TorusGeometry(0.132, 0.026, 6, 16);
        t.rotateX(Math.PI / 2);
        t.translate(0, 0.24 + i * 0.16, 0);
        solids.push(t);
      }
      for (let i = 0; i < 2; i++) {
        const slot = new THREE.BoxGeometry(0.34, 0.03, 0.055);
        slot.rotateY(i * Math.PI / 2);
        slot.translate(0, 0.093, 0);
        solids.push(slot);
      }
      break;
    }
    case 'bolt': {       // 螺栓：六角头 + 平垫 + 螺杆 + 螺母（一整副紧固件）
      const head = new THREE.CylinderGeometry(0.28, 0.28, 0.14, 6);
      head.translate(0, 0.07, 0);
      // v1.27：垫圈做进螺栓里。以前图纸要在旁边另摆一片「垫圈」积木，
      // 可它既套不上螺栓头也不夹任何东西，纯属摆设——现在一副螺栓自带垫圈和螺母。
      const wash = new THREE.CylinderGeometry(0.25, 0.25, 0.04, 18);
      wash.translate(0, 0.16, 0);
      const shaft = new THREE.CylinderGeometry(0.1, 0.1, 0.62, 12);
      shaft.translate(0, 0.18 + 0.31, 0);
      const nut = new THREE.CylinderGeometry(0.21, 0.21, 0.12, 6);
      nut.translate(0, 0.68, 0);
      solids.push(head, wash, shaft, nut);
      break;
    }
    case 'tenon': {      // 卯榫：方榫头 + 两道燕尾楔 + 根部箍
      const post = new THREE.BoxGeometry(0.26, bh * 0.86, 0.26);
      post.translate(0, bh * 0.43, 0);
      solids.push(post);
      for (const sgn of [-1, 1]) {
        const wing = new THREE.BoxGeometry(0.42, 0.11, 0.26);
        wing.translate(sgn * 0.23, bh * 0.6, 0);
        solids.push(wing);
      }
      const collar = new THREE.CylinderGeometry(0.19, 0.19, 0.08, 8);
      collar.translate(0, bh * 0.16, 0);
      solids.push(collar);
      break;
    }
    case 'peg': {        // 木钉：上细下粗的圆木销，顶上一颗圆头
      const body = new THREE.CylinderGeometry(0.125, 0.2, bh * 0.86, 14);
      body.translate(0, bh * 0.43, 0);
      const cap = new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.translate(0, bh * 0.86, 0);
      solids.push(body, cap);
      break;
    }
    case 'glue': {       // 粘合胶：一摊圆润的胶点，边上溅开三小滴
      const main = new THREE.SphereGeometry(0.36, 20, 12);
      main.scale(1, 0.42, 1);
      main.translate(0, 0.15, 0);
      solids.push(main);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        const d2 = new THREE.SphereGeometry(0.12, 12, 8);
        d2.scale(1, 0.52, 1);
        d2.translate(Math.cos(a) * 0.37, 0.06, Math.sin(a) * 0.37);
        solids.push(d2);
      }
      break;
    }

    // ========== 咬合结构：榫头 / 卯口 / 穿销 / 卡箍 / 燕尾 ==========
    case 'tenonBar': {   // 凸榫梁：梁端伸出一截榫头，插进旁边构件里
      const H = h * PLATE;
      const beam = new THREE.BoxGeometry(w - 0.02, H - 0.02, d - 0.06);
      beam.translate(0, H / 2, 0);
      const ten = new THREE.BoxGeometry(0.44, H * 0.46, Math.min(0.62, d * 0.62));
      ten.translate(w / 2 + 0.13, H * 0.5, 0);
      solids.push(beam, ten);
      break;
    }
    case 'mortiseBar': { // 卯眼梁：梁端挖一个透卯口，等着榫头穿进来
      const H = h * PLATE;
      const bw = w - 0.02, bd = d - 0.02;
      const slot = 0.5, gapY = H * 0.46;
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, 0);
      s.lineTo(bw / 2, 0);
      s.lineTo(bw / 2, H - 0.01);
      s.lineTo(-bw / 2, H - 0.01);
      s.lineTo(-bw / 2, (H + gapY) / 2);
      s.lineTo(-bw / 2 + slot, (H + gapY) / 2);
      s.lineTo(-bw / 2 + slot, (H - gapY) / 2);
      s.lineTo(-bw / 2, (H - gapY) / 2);
      s.closePath();
      const g = extrude(s, bd, 0.02);
      g.translate(0, 0, -bd / 2);
      solids.push(g);
      break;
    }
    case 'pin': {        // 穿销：一截木销从上面钉穿两层积木
      const H = h * PLATE;
      const body = new THREE.CylinderGeometry(0.115, 0.1, H * 1.35, 14);
      body.translate(0, H * 0.675, 0);
      const head = new THREE.CylinderGeometry(0.2, 0.2, 0.075, 16);
      head.translate(0, H * 1.35 - 0.02, 0);
      solids.push(body, head);
      break;
    }
    case 'clamp': {      // 卡箍：一条铁带跨过接缝，两头向下扣住两块积木
      const H = h * PLATE;
      const span = w + 0.78;
      const top = new THREE.BoxGeometry(span, 0.1, 0.44);
      top.translate(0, H - 0.05, 0);
      solids.push(top);
      for (const sgn of [-1, 1]) {
        const leg = new THREE.BoxGeometry(0.1, H * 0.78, 0.44);
        leg.translate(sgn * (span / 2 - 0.05), H - 0.05 - H * 0.39, 0);
        solids.push(leg);
      }
      break;
    }
    case 'dovetail': {   // 燕尾榫：下窄上宽的楔块，越压越紧
      const H = h * PLATE;
      const bw = w - 0.02, bd = d - 0.02;
      const s = new THREE.Shape();
      s.moveTo(-bw * 0.26, 0);
      s.lineTo(bw * 0.26, 0);
      s.lineTo(bw * 0.5, H - 0.01);
      s.lineTo(-bw * 0.5, H - 0.01);
      s.closePath();
      const g = extrude(s, bd, 0.02);
      g.translate(0, 0, -bd / 2);
      solids.push(g);
      break;
    }

    // ========== 机械零件 ==========
    case 'gear16':
    case 'gear10': {     // 齿轮：竖直立着，齿能咬住相邻齿轮
      // 齿数是参数：节圆半径 = 齿数 × 模数（与 drive.js 的齿数比传动同一套数）
      const teeth = Math.round(params.teeth || (kind === 'gear16' ? 16 : 10));
      const Rr = teeth * GEAR_MODULE;
      const dpt = Math.max(0.28, d - 0.06);
      if (teeth >= 11) {
        // 大齿轮做成辐板轮：齿圈 + 五根辐条 + 轮毂（实心饼不像工业件）
        const rimIn = Rr * 0.76;
        const g = extrude(gearProfile(Rr, teeth, rimIn), dpt, 0.02);
        g.translate(0, 0, -dpt / 2);
        solids.push(g);
        const hubR = spokedWheel(solids, Rr * 0.99, rimIn, dpt, 5, { hubR: Rr * 0.26 });
        // 键槽：轮毂上开一道方槽，轴上的平键卡进去才不会打滑
        const key = new THREE.BoxGeometry(0.09, 0.14, dpt * 0.86);
        key.translate(keyAt(0.045, hubR * 0.86), 0, 0);
        solids.push(key);
      } else {
        const g = extrude(gearProfile(Rr, teeth, Math.max(Rr * 0.2, FIT.boreR)), dpt, 0.02);
        g.translate(0, 0, -dpt / 2);
        const hub = annulus(Math.max(Rr * 0.34, FIT.boreR + 0.08), FIT.boreR, dpt * 0.9);
        const boss = annulus(Math.max(Rr * 0.4, FIT.boreR + 0.1), FIT.boreR, 0.09);
        boss.translate(0, 0, dpt * 0.48);
        solids.push(g, hub, boss);
      }
      break;
    }
    case 'tire': {       // 车轮：胎圈 + 轮毂 + 轮辐 + 胎面花纹
      const R = Math.min(w, h * PLATE) / 2 - 0.02;
      const dep = Math.max(0.34, d - 0.06);
      const tire = new THREE.TorusGeometry(R - 0.2, 0.2, 10, 30);
      const rimIn = R - 0.33;
      const rim = annulus(rimIn, FIT.boreR, dep * 0.72);
      const hubR = Math.max(R * 0.24, FIT.boreR + 0.07);
      const hub = annulus(hubR, FIT.boreR, dep * 1.02);
      solids.push(tire, rim, hub);
      // 辐条从轮毂外缘辐射到轮辋，不再穿过中心孔（真轮辐不会挡住车轴）
      const spokeLen = rimIn - hubR;
      for (let i = 0; i < 4; i++) {
        for (const sgn of [-1, 1]) {
          const sp = new THREE.BoxGeometry(spokeLen, 0.1, dep * 0.22);
          sp.translate(sgn * (hubR + spokeLen / 2), 0, 0);
          sp.rotateZ((i / 4) * Math.PI);
          solids.push(sp);
        }
      }
      for (let i = 0; i < 16; i++) {
        const t = new THREE.BoxGeometry(0.16, 0.1, dep * 0.9);
        t.translate(0, R - 0.03, 0);
        t.rotateZ((i / 16) * Math.PI * 2);
        solids.push(t);
      }
      break;
    }
    case 'pulley': {     // 皮带轮：两侧挡边夹出一道 V 形槽，辐板镂空
      const Rr = Math.min(w, h * PLATE) / 2 - 0.05;
      const dpt = Math.max(0.3, d - 0.06);
      const rimH = 0.1;
      for (const sgn of [-1, 1]) {
        const f = annulus(Rr, FIT.boreR, rimH, 0.012);
        f.translate(0, 0, sgn * (dpt / 2 - rimH / 2));
        solids.push(f);
      }
      // V 形槽底（比挡边细一圈，皮带正好卡进去）；整只轮从挡边到轮毂都带配合通孔
      const groove = annulus(Rr * 0.82, FIT.boreR, dpt * 0.46);
      const hubR = Math.max(Rr * 0.24, FIT.boreR + 0.07);
      const hub = annulus(hubR, FIT.boreR, dpt * 0.9);
      const lip = annulus(hubR * 0.92, FIT.boreR, 0.05, 0.008);
      lip.translate(0, 0, dpt * 0.45);
      solids.push(groove, hub, lip);
      // 轮毂凸台收进占位格（原来外沿 0.51，会和相邻零件端面嵌进去 0.05 格）
      for (const sgn of [-1, 1]) {
        const boss = annulus(hubR * 1.35, FIT.boreR, 0.08);
        boss.translate(0, 0, sgn * (dpt / 2 - 0.02));
        solids.push(boss);
      }
      const key = new THREE.BoxGeometry(0.06, 0.1, dpt * 1.1);
      key.translate(keyAt(0.03, hubR * 0.88), 0, 0);
      solids.push(key);
      for (let i = 0; i < 4; i++) {          // 四根辐条：铸造皮带的典型骨架
        const arm = new THREE.BoxGeometry(Rr * 0.78 - hubR, 0.15, dpt * 0.28);
        arm.translate(hubR + (Rr * 0.78 - hubR) / 2, 0, 0);
        arm.rotateZ((i / 4) * Math.PI * 2 + Math.PI / 4);
        solids.push(arm);
      }
      break;
    }
    case 'axle': {       // 传动轴：实心轴身 + 两端轴肩 + 平键 + 退刀槽 + 端部倒角
      const r = Math.min(d, h * PLATE) / 2 * 0.62;
      const len = w - 0.04;
      const sh = new THREE.CylinderGeometry(r, r, len * 0.96, 26);
      sh.rotateZ(Math.PI / 2);
      solids.push(sh);
      for (const sgn of [-1, 1]) {
        const c = new THREE.CylinderGeometry(r * 1.28, r * 1.28, 0.12, 22);
        c.rotateZ(Math.PI / 2);
        c.translate(sgn * (len / 2 - 0.07), 0, 0);
        // 退刀槽：轴肩内侧一圈细颈，车削件都有
        const neck = new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.06, 18);
        neck.rotateZ(Math.PI / 2);
        neck.translate(sgn * (len / 2 - 0.16), 0, 0);
        // 端部倒角
        const cham = new THREE.CylinderGeometry(r * 0.72, r * 0.9, 0.07, 18);
        cham.rotateZ(Math.PI / 2);
        cham.translate(sgn * (len / 2 - 0.02), 0, 0);
        solids.push(c, neck, cham);
      }
      // 平键：嵌在轴上的键槽里，露出上半截把扭矩传给齿轮
      const key = new THREE.BoxGeometry(len * 0.52, 0.11, 0.16);
      key.translate(0, r * 0.94, 0);
      solids.push(key);
      for (const sgn of [-1, 1]) {           // 键槽两侧的槽壁
        const wall = new THREE.BoxGeometry(len * 0.54, 0.07, 0.045);
        wall.translate(0, r * 0.96, sgn * 0.1);
        solids.push(wall);
      }
      break;
    }
    case 'crank': {      // 曲轴：两端主轴颈 + 两片带配重的曲柄臂 + 中间连杆轴颈（曲柄销）
      const r = Math.min(d, h * PLATE) / 2 * 0.44;
      const p = Math.max(0.12, params.pinR ?? 0.3);   // 曲柄半径＝销偏距，连杆行程由它决定
      // 轴向要留 0.16 格余量：两端轴肩若把 3 格长占满，会压到相邻齿轮的辐板端面
      const len = w - 0.16;
      // v1.28.1：主轴颈 0.16 → 0.189。桥接轴统一 0.176，原来比轴颈还粗，
      // 一根银灰圆杆把曲轴从头包到尾，看上去就是"直杆 + 几片黄凸起"。
      // 现在轴颈比任何外挂轴都粗，外来轴一律藏在里面，曲轴从任何角度看都是单色的整根曲轴。
      const mainR = Math.min(0.19, r * 0.86);         // 主轴颈半径（须 > 桥接轴 0.176，< 轴承孔径 0.205）
      const pinR = Math.min(0.140, mainR * 0.90);     // 曲柄销半径（必须小于连杆大端轴瓦内径 0.169）
      const webT = 0.16;                              // 曲柄臂厚
      const webX = Math.max(0.38, (mainR + pinR) * 1.10);  // 两片曲柄臂中心到轴心的距离
      const Rw = 0.23;                                // 臂的"大圆头"半径（绕主轴）
      const Rp = Math.max(pinR + 0.05, 0.21);         // 臂的"小圆头"半径（绕曲柄销）
      const Rc = 0.29;                                // 配重圆头半径
      const cwY = -0.18;                              // 配重圆心（销的对侧）
      // v1.28：曲柄臂以前是"2D 轮廓挤出 + 绕 Z 转 90°"，挤出方向（Z）没跟着转，
      // 两片臂就成了**平行于轴线的鳍片**——从侧面看整根曲轴只是一根直杆加两个小凸台，
      // 连杆来回摆时看着就像从杆子里穿过去。真曲轴的臂必须**垂直于轴线**：
      // 这里改用「绕主轴的大圆头 + 绕销的小圆头 + 等宽腰板 + 对侧配重圆头」拼出真的曲柄臂，
      // 臂面法线沿 X，厚度 webT —— 从任何角度看都是标准曲轴。
      for (const sgn of [-1, 1]) {
        // 主轴颈：只做曲柄臂外侧那一段，中段留空，连杆大头在两臂之间摆
        const shLen = len / 2 - webX - webT / 2;
        if (shLen > 0.05) {
          const sh = new THREE.CylinderGeometry(mainR, mainR, shLen, 24);
          sh.rotateZ(Math.PI / 2);
          sh.translate(sgn * (webX + webT / 2 + shLen / 2), 0, 0);
          solids.push(sh);
          const ch = new THREE.CylinderGeometry(mainR * 0.78, mainR * 0.96, 0.05, 20);  // 轴端倒角
          ch.rotateZ(Math.PI / 2);
          ch.translate(sgn * (len / 2 - 0.025), 0, 0);
          solids.push(ch);
        }
        // 轴肩放大倍数随轴颈加粗同步收小，保证外径与 v1.27（0.229）持平，不去顶相邻零件
        const shoulder = new THREE.CylinderGeometry(mainR * 1.22, mainR * 1.22, 0.1, 20);
        shoulder.rotateZ(Math.PI / 2);
        shoulder.translate(sgn * (len / 2 - 0.07), 0, 0);
        solids.push(shoulder);

        // 曲柄臂＝一张"梨形"轮廓挤出（大圆头绕主轴、小圆头绕销、下方配重圆），
        // 单壳实体、不自相交：看起来是整块锻件，射线奇偶检查也不会被内部面误导。
        // 挤出方向先转成沿 X（臂面垂直于曲轴轴线），否则又变成"平行于轴的鳍片"。
        const web = extrude(crankWebShape(p, Rw, Rp, Rc, cwY), webT, 0.016);
        web.translate(0, 0, -webT / 2);
        web.rotateY(Math.PI / 2);
        web.translate(sgn * webX, 0, 0);
        solids.push(web);

        // 主轴颈与臂的交界圆角：车削/锻造件都有，也让"轴插进板里"的观感消失
        const fil = new THREE.TorusGeometry(mainR * 1.02, 0.036, 8, 22);
        fil.rotateY(Math.PI / 2);
        fil.translate(sgn * (webX + webT / 2 - 0.005), 0, 0);
        solids.push(fil);
      }
      // 连杆轴颈（曲柄销）：穿在两片曲柄臂之间，端部补圆角
      const pinGeo = new THREE.CylinderGeometry(pinR, pinR, webX * 2 - webT + 0.04, 24);
      pinGeo.rotateZ(Math.PI / 2);
      pinGeo.translate(0, p, 0);
      solids.push(pinGeo);
      for (const sgn of [-1, 1]) {
        const t = new THREE.TorusGeometry(pinR * 1.02, 0.028, 8, 18);
        t.rotateY(Math.PI / 2);
        t.translate(sgn * (webX - webT / 2 + 0.005), p, 0);
        solids.push(t);
      }
      // v1.27：把曲柄销的局部位置交出去。以前传动层按「局部 +Y 旋转后就是销方向」硬算，
      // 图纸把曲轴转倒（rx/ry/rz）之后销的实际朝向就变了，连杆大头的圆心与销错开 0.42 格，
      // 杆子于是每圈都从曲轴实体里穿过。销点由几何烘焙，谁转都不会错。
      pin = [0, p, 0];
      break;
    }
    case 'conrod': {     // 连杆：工字梁杆身 + 可拆分大端轴瓦盖 + 小端衬套
      const rBig = Math.min(0.36, Math.min(w, d) * 0.36);
      const rSmall = rBig * 0.6;
      const dep = Math.min(0.30, d * 0.6);
      const y0 = CONROD_PIN.y0, y1 = CONROD_PIN.y1;   // 与动画共用同一组孔心
      // 大端：有壁厚的实体轴瓦环
      const big = annulus(rBig, rBig * 0.56, dep);
      big.translate(0, y0, 0);
      solids.push(big);
      const bearing = annulus(rBig * 0.58, rBig * 0.47, dep * 0.82);
      bearing.translate(0, y0, 0);
      solids.push(bearing);
      // 剖分式大端盖：真连杆的大头是拆开来套上曲轴的
      // v1.28：剖分盖以前顶面顶到 y0−rBig−0.02，整块板横切过轴瓦孔的下缘
      // （板顶离孔心只有 0.01，孔内径 0.169），曲柄销一插进去就被板"咬"住 0.004～0.14。
      // 盖板是抱在轴瓦外面的，顶面必须停在轴瓦外圆上，一点都不能进孔。
      const cap = new THREE.BoxGeometry(rBig * 2.1, 0.14, dep * 1.02);
      cap.translate(0, y0 - rBig - 0.07, 0);
      solids.push(cap);
      for (const sgn of [-1, 1]) {
        const b = new THREE.CylinderGeometry(0.055, 0.055, rBig * 1.5, 8);
        b.translate(sgn * rBig * 0.78, y0 - rBig * 0.55, 0);
        const head = hexSolid(0.085, 0, 0.075, 'y');
        head.translate(sgn * rBig * 0.78, y0 - rBig * 1.35, 0);
        solids.push(b, head);
      }
      // 小端：活塞销衬套
      const small = annulus(rSmall, rSmall * 0.48, dep * 0.84);
      small.translate(0, y1, 0);
      solids.push(small);
      // 工字梁杆身：中间细、两边有翼缘，抗弯又不笨重
      const beam = [];
      // v1.28：杆身起点从「大端孔心」退到「轴瓦外圈」——杆身不该横穿轴瓦孔，
      // 真连杆的杆身是熔进大端凸台的，孔里只有曲柄销。留 0.198 > 轴瓦内径 0.169，
      // 销再粗也不会顶到杆身端面。
      const beamY0 = y0 + rBig * 0.55;
      iBeam(beam, Math.max(0.2, y1 - beamY0), rBig * 1.1, dep * 0.92, 0.1);
      beam.forEach(g => { g.translate(0, (beamY0 + y1) / 2, 0); solids.push(g); });
      holes = [[0, y0, 0], [0, y1, 0]];   // 大端孔心 / 小端孔心
      break;
    }
    case 'piston': {     // 活塞：带环槽的活塞头 + **开口裙部** + 活塞销 + 杆 + 十字头
      const H = h * PLATE;
      // 直径取到格子边上（0.85 格半径）：裙腔内径必须能容下连杆小头（Ø0.43），
      // 太细的活塞会把小头挤到壁外面，看起来就是连杆穿进活塞。
      const r = Math.min(w, d) / 2 * 0.85;
      const bodyH = H * 0.42;
      const wallT = Math.max(0.12, r * 0.26);      // 裙壁厚
      // 活塞头：顶部实心盘（顶面略收）
      const crown = new THREE.CylinderGeometry(r * 0.95, r, bodyH * 0.26, 24);
      crown.translate(0, bodyH * 0.88, 0);
      // 裙部：薄壁筒，**底部敞开**。真活塞内部是空的，连杆小头就在这个腔里摆动；
      // 早先裙部被做成实心圆柱，连杆小头一动就整条埋进塑料里——这就是"运动件插进实体"。
      const skirt = annulus(r * 0.87, r * 0.87 - wallT, bodyH * 0.72, 0.012);
      skirt.rotateX(Math.PI / 2);
      skirt.translate(0, bodyH * 0.36, 0);
      solids.push(crown, skirt);
      // 两道压缩环 + 一道油环：都是**环带**（中间通孔），不会把裙腔堵成实心
      for (const f of [0.42, 0.62, 0.82]) {
        const ring = annulus(r * 1.02, r * 0.8, 0.045, 0.008);
        ring.rotateX(Math.PI / 2);
        ring.translate(0, bodyH * f, 0);
        solids.push(ring);
      }
      // 活塞销：轴线走 **Z 向**（垂直于气缸轴 Y，也与连杆孔轴同向）。
      // 早先销沿 X，图纸再 rz 一转，销就变成竖直的——连杆的孔是横的，
      // 两者轴线差 90°，连杆小头只能硬穿进活塞壁里。销沿 Z 之后，
      // 「绕 Z 转 90°」一次就把气缸轴放平、销仍旧横着，机构和图纸才对得上。
      const pinY = bodyH * 0.44;
      const pinGeo = new THREE.CylinderGeometry(0.095, 0.095, r * 2.1, 14);
      pinGeo.rotateX(Math.PI / 2);
      pinGeo.translate(0, pinY, 0);
      solids.push(pinGeo);
      pin = [0, pinY, 0];   // 连杆小头就套在这里
      for (const sgn of [-1, 1]) {
        const clip = new THREE.TorusGeometry(0.075, 0.022, 6, 12);
        clip.translate(0, pinY, sgn * r * 1.06);
        solids.push(clip);
      }
      const rod = new THREE.CylinderGeometry(0.11, 0.11, H - bodyH - 0.08, 14);
      rod.translate(0, bodyH + (H - bodyH - 0.08) / 2, 0);
      const head = new THREE.BoxGeometry(0.44, 0.14, 0.44);
      head.translate(0, H - 0.07, 0);
      solids.push(rod, head);
      break;
    }
    case 'chain': {      // 滚子链：内外双层链板 + 滚子 + 销轴 + 铆头
      // 占地固定，节数变多＝节距变短（链节更密），外观不会拉出格子去穿透别的积木
      const H = h * PLATE;
      const links = Math.max(2, Math.min(12, Math.round(params.links || 3)));
      // 端点滚子还带一个半径，两节链相邻格时若 total=w-0.16，两只端滚子会互嵌 0.1 格；
      // 收到 w-0.26 后最外沿正好落在格边界上，两节链相切而不过盈。
      const total = w - 0.30;
      const pitch = total / links;
      const rr = Math.min(0.17, pitch * 0.42);   // 链板圆头半径随节距缩放
      const rollerR = Math.min(0.13, pitch * 0.3);
      const plateGap = 0.34, plateT = 0.09;
      const cy = H / 2;
      for (let i = 0; i < links; i++) {
        const x = -total / 2 + pitch * (i + 0.5);
        for (const sgn of [-1, 1]) {
          for (const layer of [0, 1]) {
            if (layer === 1 && i % 2) continue;  // 外链板隔节压一片，跟真链一样交替
            const zc = sgn * (plateGap / 2 + layer * plateT * 1.2);
            // 三件套链板：中间收腰条 + 两端圆头，比整块拉伸几何轻得多
            const bar = new THREE.BoxGeometry(pitch * 0.86, rr * 1.25, plateT);
            bar.translate(x, cy, zc);
            solids.push(bar);
            for (const side of [-1, 1]) {
              const head = new THREE.CylinderGeometry(rr, rr, plateT, 8);
              head.rotateX(Math.PI / 2);
              head.translate(x + side * pitch * 0.5, cy, zc);
              solids.push(head);
            }
          }
        }
      }
      for (let i = 0; i <= links; i++) {
        const x = -total / 2 + pitch * i;
        const roller = new THREE.CylinderGeometry(rollerR, rollerR, plateGap - plateT * 0.5, 10);
        roller.rotateX(Math.PI / 2);
        roller.translate(x, cy, 0);
        const pin = new THREE.CylinderGeometry(rollerR * 0.42, rollerR * 0.42, plateGap + plateT * 3.6, 8);
        pin.rotateX(Math.PI / 2);
        pin.translate(x, cy, 0);
        solids.push(roller, pin);
        for (const sgn of [-1, 1]) {         // 销轴两端的铆头
          const rivet = new THREE.CylinderGeometry(rollerR * 0.65, rollerR * 0.65, 0.04, 8);
          rivet.rotateX(Math.PI / 2);
          rivet.translate(x, cy, sgn * (plateGap / 2 + plateT * 2.1));
          solids.push(rivet);
        }
      }
      break;
    }
    case 'spring': {     // 发条：把扁钢带盘成螺旋（不是圆管线圈），带宽、方轴、外挂钩都在
      const turns = Math.max(1.2, params.turns || 2.6);
      const R1 = Math.min(w, d) / 2 - 0.18;
      const N = Math.round(46 * turns);
      const bw = 0.075;                       // 钢带径向宽度
      const outer = [], inner = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const a = t * Math.PI * 2 * turns;
        const r = 0.16 + (R1 - 0.16) * t;
        outer.push([Math.cos(a) * (r + bw / 2), Math.sin(a) * (r + bw / 2)]);
        inner.push([Math.cos(a) * (r - bw / 2), Math.sin(a) * (r - bw / 2)]);
      }
      const s = new THREE.Shape();
      s.moveTo(outer[0][0], outer[0][1]);
      outer.forEach(p => s.lineTo(p[0], p[1]));
      for (let i = N; i >= 0; i--) s.lineTo(inner[i][0], inner[i][1]);
      s.closePath();
      const band = extrude(s, 0.34, 0.008);   // 细带用极小的倒角，免得相邻圈粘住
      band.rotateX(-Math.PI / 2);
      band.translate(0, 0.3, 0);
      solids.push(band);
      // 中心方轴（上发条的轴）+ 外端挂钩
      const arbor = new THREE.BoxGeometry(0.2, 0.56, 0.2);
      arbor.translate(0, 0.48, 0);
      const cap = hexSolid(0.16, 0, 0.1, 'y');
      cap.translate(0, 0.78, 0);
      const hook = new THREE.BoxGeometry(0.1, 0.34, 0.16);
      hook.translate(R1, 0.47, 0);
      solids.push(arbor, cap, hook);
      break;
    }
    case 'motor': {      // 电机：带散热筋的机身 + 前后端盖 + 风扇罩 + 接线盒 + 底脚 + 出轴
      const H = h * PLATE;
      const len = w - 0.14;
      const r = Math.min(d, H) / 2 * 0.74;
      const cy = H * 0.48;
      const body = new THREE.CylinderGeometry(r, r, len, 26);
      body.rotateZ(Math.PI / 2);
      body.translate(0, cy, 0);
      solids.push(body);
      // 铸造散热筋：一圈圈薄环，电机外壳不是光溜溜的筒
      for (let i = 0; i < 7; i++) {
        const fin = new THREE.CylinderGeometry(r * 1.09, r * 1.09, 0.055, 26);
        fin.rotateZ(Math.PI / 2);
        fin.translate(-len / 2 + 0.17 + i * (len - 0.34) / 6, cy, 0);
        solids.push(fin);
      }
      // v1.20：端盖/风扇罩收进占位格半宽（原来外沿 1.01 / 1.11，和相邻格零件端面互嵌 0.05 格）
      for (const sgn of [-1, 1]) {
        const cap = new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.12, 26);
        cap.rotateZ(Math.PI / 2);
        cap.translate(sgn * (len / 2 - 0.04), cy, 0);
        solids.push(cap);
      }
      // 尾部风扇罩是静止外壳；罩里的风扇叶轮装在转子上，会跟着芯轴转
      const fanX = -len / 2 + 0.06;
      const fan = new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.16, 22);
      fan.rotateZ(Math.PI / 2);
      fan.translate(fanX, cy, 0);
      solids.push(fan);
      for (let i = 0; i < 3; i++) {
        const vane = new THREE.BoxGeometry(0.07, r * 0.62, 0.16);
        vane.rotateX((i / 3) * Math.PI * 2);
        vane.translate(fanX, cy, 0);
        rotor.push(vane);
      }
      // ===== 转子：出轴、轴肩、平键、轴端联轴器法兰，全部随芯轴自转 =====
      // 真电机通电后只有转子转，机身/散热筋/接线盒/底脚是钉在机座上的定子。
      // v1.20 统一配合：轴伸上所有零件（轴肩、挡圈、平键、拨爪）半径都 ≤ FIT.flangeR，
      // 小于轮毂配合孔 FIT.boreR，才能像真机器那样「穿进孔里」而不是插进实心轮毂。
      const shaft = new THREE.CylinderGeometry(FIT.shaftR, FIT.shaftR, 0.6, 14);
      shaft.rotateZ(Math.PI / 2);
      shaft.translate(len / 2 + 0.16, cy, 0);
      const boss = new THREE.CylinderGeometry(FIT.flangeR, FIT.flangeR, 0.12, 16);
      boss.rotateZ(Math.PI / 2);
      boss.translate(len / 2 + 0.1, cy, 0);
      const flange = new THREE.CylinderGeometry(FIT.flangeR, FIT.flangeR, 0.1, 18);
      flange.rotateZ(Math.PI / 2);
      flange.translate(len / 2 + 0.42, cy, 0);
      const key = new THREE.BoxGeometry(0.36, 0.055, 0.09);
      key.translate(len / 2 + 0.22, cy + 0.14, 0);
      const outboard = [shaft, boss, flange, key];
      // 挡圈上三只偏心爪：光圆柱转起来看不出角速度，有爪才看得见"轴在转"
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const jaw = new THREE.BoxGeometry(0.06, 0.075, 0.075);
        jaw.translate(len / 2 + 0.44, cy + Math.cos(a) * 0.1, Math.sin(a) * 0.1);
        outboard.push(jaw);
      }
      // params.stub：短轴电机。3 格高的大盘件（棘轮/飞轮）轮心比 2 格电机轴心高半格，
      // 长轴伸过去必然斜插进盘体；这类并排布置改用短轴，转子仍在转但不越出机座。
      if (params.stub) for (const g of outboard) g.translate(-0.44, 0, 0);
      rotor.push(...outboard);
      rotorCenter = [0, H / 2, 0];
      // 接线盒 + 电缆接头
      const box = new THREE.BoxGeometry(0.56, 0.24, 0.46);
      box.translate(0, cy + r + 0.1, 0);
      const lid = new THREE.BoxGeometry(0.62, 0.06, 0.52);
      lid.translate(0, cy + r + 0.25, 0);
      const gland = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10);
      gland.translate(0.2, cy + r + 0.3, 0);
      solids.push(box, lid, gland);
      // 底脚：整块铸铁底板 + 两条带安装孔的脚
      const basePlate = new THREE.BoxGeometry(len * 0.9, 0.26, d * 0.9);
      basePlate.translate(0, 0.13, 0);
      solids.push(basePlate);
      for (const sgn of [-1, 1]) {
        const foot = new THREE.BoxGeometry(len * 0.9, 0.1, 0.2);
        foot.translate(0, 0.3, sgn * d * 0.36);
        solids.push(foot);
        for (const sx of [-1, 1]) {
          const hole = new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10);
          hole.translate(sx * len * 0.32, 0.34, sgn * d * 0.36);
          solids.push(hole);
        }
      }
      break;
    }
    case 'cam': {        // 凸轮：偏心圆盘 + 轴孔，转起来能顶动从动件（升程是参数）
      const R = Math.min(w, h * PLATE) / 2 * 0.62;
      const dep = Math.max(0.24, d - 0.06);
      const lift = Math.min(0.75, Math.max(0.15, params.lift ?? 0.42));
      const prof = new THREE.Shape();
      prof.absarc(R * lift, 0, R, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, Math.max(R * 0.22, FIT.boreR), 0, Math.PI * 2, true);
      prof.holes.push(hole);
      const g = extrude(prof, dep, 0.02);
      g.translate(0, 0, -dep / 2);
      solids.push(g);
      // 轮毂凸台 + 键槽：凸轮是靠键锁在轴上的，不是一片光板
      for (const sgn of [-1, 1]) {
        const boss = annulus(Math.max(R * 0.42, FIT.boreR + 0.08), FIT.boreR, 0.1);
        boss.translate(0, 0, sgn * (dep / 2 - 0.02));
        solids.push(boss);
      }
      const key = new THREE.BoxGeometry(0.06, 0.12, dep * 1.12);
      key.translate(keyAt(0.03, R * 0.21), 0, 0);
      solids.push(key);
      break;
    }
    case 'worm': {       // 蜗杆：轴芯 + 真正盘上去的梯形螺纹（头数是参数）
      const len = w - 0.04;
      const starts = Math.max(1, Math.round(params.starts || 1));
      const rRoot = 0.2, rTip = 0.34;
      const core = new THREE.CylinderGeometry(rRoot * 0.99, rRoot * 0.99, len, 20);
      core.rotateZ(Math.PI / 2);
      solids.push(core);
      for (const sgn of [-1, 1]) {           // 两端轴肩（装轴承的位置）
        const c = new THREE.CylinderGeometry(rRoot * 1.55, rRoot * 1.55, 0.12, 18);
        c.rotateZ(Math.PI / 2);
        c.translate(sgn * (len / 2 - 0.06), 0, 0);
        solids.push(c);
      }
      // 螺纹段：导程 0.36，一圈圈往右绕；头数越多同时咬合的牙就越多
      solids.push(screwThread(len * 0.84, rRoot, rTip, 0.36, starts, 18));
      break;
    }
    case 'genevaDrive': {  // 拨盘：圆盘 + 拨销（销距是参数）+ 一段锁止弧
      const R = Math.min(w, d) / 2 - 0.08;
      const dep = Math.max(0.24, d - 0.06);
      const disc = new THREE.CylinderGeometry(R, R, dep, 26);
      disc.rotateX(Math.PI / 2);
      const boss = new THREE.CylinderGeometry(R * 0.3, R * 0.3, dep * 1.25, 14);
      boss.rotateX(Math.PI / 2);
      solids.push(disc, boss);
      const Rp = Math.max(0.25, params.pinR ?? 1.05);
      if (Rp > R * 0.85) {
        // 销在盘外：伸一条拨臂把销架出去（真机构的曲柄销常这么装）
        const arm = new THREE.BoxGeometry(Rp - R * 0.3, 0.12, dep * 0.5);
        arm.translate((Rp + R * 0.3) / 2, 0, 0);
        solids.push(arm);
      }
      // v1.20 销轴让位：拨盘 1 格高、槽轮 3 格高，轴心差 1.08 格是历史布局的
      // 「容差耦合」。原来一根 2.5 格长的销会斜插进槽轮盘体，改成只穿过拨盘
      // 本身、露出销头的短销（借鉴 toy-workshop 机械原理馆 fitPins 的让位做法）。
      const pin = new THREE.CylinderGeometry(0.09, 0.09, dep * 1.15, 10);
      pin.rotateX(Math.PI / 2);
      pin.translate(Rp, 0, 0);
      solids.push(pin);
      // 锁止弧：销的对侧一段凸弧，拨销离开槽的半圈里把轮子扣住
      const lock = new THREE.TorusGeometry(Math.min(R + 0.12, Rp * 0.95), 0.09, 8, 22, 1.1);
      lock.rotateZ(Math.PI - 0.55);
      solids.push(lock);
      break;
    }
    case 'genevaWheel': {  // 槽轮：轮缘开 N 条深槽（槽数是参数），销进槽才被带动
      const Ro = Math.min(w, h * PLATE) / 2 - 0.02;
      // v1.20：槽底要开得比「拨销最深点」更深。标准四槽机构里销最深到
      // C − Rp ≈ 0.40，原来 Rr = 0.38·Ro ≈ 0.56，销其实撞在槽底实体里。
      const Rr = Ro * 0.24;                // 槽底半径 ≈0.355，留出让位
      const dep = Math.max(0.26, d - 0.06);
      const slots = Math.max(3, Math.round(params.slots || 4));
      const g = extrude(genevaProfile(Ro, Rr, slots, Rr * 0.12), dep, 0.02);
      g.translate(0, 0, -dep / 2);
      const hub = annulus(Math.max(Rr * 0.62, FIT.boreR + 0.08), FIT.boreR, dep * 0.94);
      solids.push(g, hub);
      for (const sgn of [-1, 1]) {
        const boss = annulus(Math.max(Rr * 0.66, FIT.boreR + 0.1), FIT.boreR, 0.08);
        boss.translate(0, 0, sgn * (dep * 0.48));
        solids.push(boss);
      }
      break;
    }
    // ========== 机械传动补充：齿条 / 皮带 / 万向节 / 联轴器 ==========
    case 'rack': {       // 齿条：加厚基体 + 同模数梯形齿 + 两端端块 + 沉头安装孔
      const m = GEAR_MODULE;
      const p = Math.PI * m;                  // 齿距（与齿轮同模数才咬得上）
      const ha = m * 2.2, baseH = 0.54;
      const n = Math.max(6, Math.floor((w - 0.18) / p));
      const x0 = -(n * p) / 2;
      const s2 = new THREE.Shape();
      s2.moveTo(x0, 0.02);
      s2.lineTo(x0 + n * p, 0.02);
      s2.lineTo(x0 + n * p, baseH);
      for (let i = n - 1; i >= 0; i--) {      // 从右往左逐个描齿
        const xc = x0 + p * (i + 0.5);
        s2.lineTo(xc + p * 0.27, baseH);
        s2.lineTo(xc + p * 0.16, baseH + ha);
        s2.lineTo(xc - p * 0.16, baseH + ha);
        s2.lineTo(xc - p * 0.27, baseH);
      }
      s2.lineTo(x0, baseH);
      s2.closePath();
      const rg = extrude(s2, d * 0.9, 0.014);
      rg.translate(0, 0, -d * 0.45);
      solids.push(rg);
      for (const sgn of [-1, 1]) {            // 两端的安装端块
        const lug = new THREE.BoxGeometry(0.18, 0.96, d * 0.9);
        lug.translate(sgn * (w / 2 - 0.1), 0.48, 0);
        solids.push(lug);
        const lugBolt = new THREE.CylinderGeometry(0.07, 0.07, d * 0.98, 10);
        lugBolt.rotateX(Math.PI / 2);
        lugBolt.translate(sgn * (w / 2 - 0.1), 0.72, 0);
        solids.push(lugBolt);
      }
      // 基体侧面的沉头孔位：长齿条靠它们锁在工作台上
      holeBosses(solids, [[-w * 0.28, 0.27, d * 0.46], [w * 0.28, 0.27, d * 0.46]], 0.075, 0.06, 'z');
      break;
    }
    case 'belt': {       // 皮带：有厚度的闭合胶带，外圈带加强筋、直线段有接头卡扣
      // 和链条一样占地固定；长度参数决定"齿距密度"，不是把带子拉出格子
      const seg = Math.max(2, Math.round(params.links || 2));
      const L = w - 0.16, hh = Math.min(0.36, L * 0.26), t = 0.3;
      const g = extrude(runwayShape(L, hh, hh - 0.13), t, 0.018);
      g.translate(0, h * PLATE / 2, -t / 2);
      solids.push(g);
      // 带体内侧的同步齿 / 加强层：上下直线段各一排凸筋
      const n = Math.max(3, Math.round(seg * 3));
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + hh + 0.08 + (i + 0.5) * (L - 2 * hh - 0.16) / n;
        for (const sgn of [-1, 1]) {
          const rib = new THREE.BoxGeometry(Math.min(0.1, (L - 2 * hh) / n * 0.7), 0.055, t * 1.04);
          rib.translate(x, h * PLATE / 2 + sgn * (hh - 0.055), 0);
          solids.push(rib);
        }
      }
      // 接头卡扣：真皮带/同步带都有个能拆的接头
      const clip = new THREE.BoxGeometry(0.22, hh * 0.5, t * 1.35);
      clip.translate(0, h * PLATE / 2 + hh, 0);
      solids.push(clip);
      break;
    }
    case 'universal': {  // 万向节：两个厚实的 Y 形叉 + 十字轴 + 四只滚针轴承杯
      const cy = h * PLATE / 2;
      for (const sgn of [-1, 1]) {
        const hub2 = new THREE.CylinderGeometry(0.27, 0.27, 0.3, 18);
        hub2.rotateZ(Math.PI / 2);
        hub2.translate(sgn * 0.64, cy, 0);
        solids.push(hub2);
        // 叉臂：厚钢板从轮毂伸到十字轴，两对互相垂直
        for (const a of [-1, 1]) {
          const fork = new THREE.BoxGeometry(0.72, 0.2, 0.2);
          fork.translate(sgn * 0.3, cy + (sgn < 0 ? 0 : a * 0.26), sgn < 0 ? a * 0.26 : 0);
          solids.push(fork);
          // 滚针轴承杯：十字轴每个轴端都压进叉臂孔里
          const cup = new THREE.CylinderGeometry(0.115, 0.115, 0.09, 12);
          if (sgn < 0) { cup.rotateX(Math.PI / 2); cup.translate(-0.05, cy, a * 0.26); }
          else { cup.translate(0.05, cy + a * 0.26, 0); }
          solids.push(cup);
        }
        const shaft2 = new THREE.CylinderGeometry(0.13, 0.13, 0.26, 14);
        shaft2.rotateZ(Math.PI / 2);
        shaft2.translate(sgn * 0.88, cy, 0);
        solids.push(shaft2);
      }
      const cy1 = new THREE.CylinderGeometry(0.075, 0.075, 0.6, 12);
      cy1.translate(0, cy, 0);
      const cy2 = new THREE.CylinderGeometry(0.075, 0.075, 0.6, 12);
      cy2.rotateX(Math.PI / 2);
      cy2.translate(0, cy, 0);
      const knuckle = new THREE.SphereGeometry(0.12, 12, 9);
      knuckle.translate(0, cy, 0);
      solids.push(cy1, cy2, knuckle);
      break;
    }
    case 'coupling': {   // 联轴器：两片法兰 + 中间弹性块 + 四颗螺栓
      const cy = h * PLATE / 2;
      for (const sgn of [-1, 1]) {
        const f = new THREE.CylinderGeometry(0.4, 0.4, 0.22, 22);
        f.rotateZ(Math.PI / 2);
        f.translate(sgn * 0.62, cy, 0);
        solids.push(f);
      }
      const elast = new THREE.CylinderGeometry(0.28, 0.28, 0.66, 18);
      elast.rotateZ(Math.PI / 2);
      elast.translate(0, cy, 0);
      solids.push(elast);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const y2 = cy + Math.cos(a) * 0.3, z2 = Math.sin(a) * 0.3;
        const bolt2 = new THREE.CylinderGeometry(0.045, 0.045, 1.52, 8);
        bolt2.rotateZ(Math.PI / 2);
        bolt2.translate(0, y2, z2);
        const head = new THREE.CylinderGeometry(0.085, 0.085, 0.08, 6);
        head.rotateZ(Math.PI / 2);
        head.translate(0.78, y2, z2);
        solids.push(bolt2, head);
      }
      break;
    }

    // ========== 机械机构补充：棘轮 / 棘爪 / 丝杠 / 飞轮 / 压簧 ==========
    case 'ratchet': {    // 棘轮：齿背是缓坡、齿面是陡坎，所以只能往一个方向转
      const n = Math.max(8, Math.round(params.teeth || 12));
      const Ro = Math.min(w, h * PLATE) / 2 - 0.05;
      const dpt = Math.max(0.28, d - 0.06);
      const g = extrude(ratchetProfile(Ro, n, Math.max(Ro * 0.22, FIT.boreR)), dpt, 0.02);
      g.translate(0, 0, -dpt / 2);
      const hub = annulus(Math.max(Ro * 0.32, FIT.boreR + 0.08), FIT.boreR, dpt * 0.94);
      solids.push(g, hub);
      // 轮毂端面 + 键槽：棘轮靠键和卷筒轴一起转
      const boss = annulus(Math.max(Ro * 0.36, FIT.boreR + 0.1), FIT.boreR, 0.08);
      boss.translate(0, 0, dpt * 0.48);
      const key = new THREE.BoxGeometry(0.07, 0.12, dpt * 1.12);
      key.translate(keyAt(0.035, Ro * 0.19), 0, 0);
      solids.push(boss, key);
      break;
    }
    case 'pawl': {       // 棘爪：带钩的爪子，顶住棘轮齿面就不许倒转
      const H = h * PLATE;
      const s2 = new THREE.Shape();
      s2.moveTo(-0.17, 0.02);
      s2.lineTo(0.17, 0.02);
      s2.lineTo(0.13, H * 0.52);
      s2.lineTo(0.3, H * 0.8);
      s2.lineTo(0.05, H * 0.94);
      s2.lineTo(-0.13, H * 0.56);
      s2.closePath();
      const g = extrude(s2, d * 0.5, 0.014);
      g.translate(0, 0, -d * 0.25);
      const boss = new THREE.CylinderGeometry(0.19, 0.19, d * 0.62, 14);
      boss.rotateX(Math.PI / 2);
      boss.translate(0, 0.2, 0);
      solids.push(g, boss);
      break;
    }
    case 'leadScrew': {  // 丝杠：粗实的梯形螺纹 + 两端轴承位 + 端部扳手方头
      const len = w - 0.04;
      const lead = Math.max(0.16, params.lead ?? 0.3);
      const rRoot = 0.19, rTip = 0.32;
      const core = new THREE.CylinderGeometry(rRoot, rRoot, len, 20);
      core.rotateZ(Math.PI / 2);
      solids.push(core);
      for (const sgn of [-1, 1]) {
        // 轴承位：比螺纹根径粗一圈，装上轴承才不会磨到螺纹
        const j = new THREE.CylinderGeometry(0.24, 0.24, 0.26, 18);
        j.rotateZ(Math.PI / 2);
        j.translate(sgn * (len / 2 - 0.1), 0, 0);
        const collar = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 18);
        collar.rotateZ(Math.PI / 2);
        collar.translate(sgn * (len / 2 - 0.26), 0, 0);
        solids.push(j, collar);
      }
      // 端部方头：扳手/联轴器夹住的地方
      const square = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      square.translate(len / 2 + 0.06, 0, 0);
      solids.push(square);
      solids.push(screwThread(len * 0.76, rRoot, rTip, lead, 1, 18));
      break;
    }
    case 'leadNut': {    // 丝杠螺母：方框抱住丝杠 + 法兰 + 四颗螺栓 + 油嘴
      const S = Math.min(w, d) * 0.88;
      const wall = 0.22, inner = S - wall * 2;
      for (const sgn of [-1, 1]) {
        const top = new THREE.BoxGeometry(S, wall, S);
        top.translate(0, h * PLATE / 2 + sgn * (inner / 2 + wall / 2), 0);
        solids.push(top);
      }
      for (const sgn of [-1, 1]) {
        const side = new THREE.BoxGeometry(S, inner, wall);
        side.translate(0, h * PLATE / 2, sgn * (inner / 2 + wall / 2));
        const side2 = new THREE.BoxGeometry(wall, inner, S);
        side2.translate(sgn * (inner / 2 + wall / 2), h * PLATE / 2, 0);
        solids.push(side, side2);
      }
      // 法兰盘 + 螺栓头
      const fl = new THREE.CylinderGeometry(S * 0.56, S * 0.56, 0.1, 16);
      fl.rotateZ(Math.PI / 2);
      fl.translate(S * 0.42, h * PLATE / 2, 0);
      solids.push(fl);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const b2 = new THREE.CylinderGeometry(0.045, 0.045, 0.16, 6);
        b2.rotateZ(Math.PI / 2);
        b2.translate(S * 0.42, h * PLATE / 2 + Math.cos(a) * S * 0.34, Math.sin(a) * S * 0.34);
        solids.push(b2);
      }
      // 内部铜衬套（能看到螺纹孔）+ 顶部油嘴
      const bush = annulus(S * 0.21, S * 0.14, S * 0.9);
      bush.rotateY(Math.PI / 2);
      bush.translate(0, h * PLATE / 2, 0);
      const oil = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8);
      oil.translate(0, h * PLATE / 2 + S * 0.56, 0);
      solids.push(bush, oil);
      break;
    }
    case 'flywheel': {   // 飞轮：有壁厚的实心轮缘 + 轮毂键槽 + 六根铸造辐条
      const Ro = Math.min(w, h * PLATE) / 2 - 0.05;
      const dpt = Math.max(0.3, d - 0.06);
      const rim = annulus(Ro, Ro * 0.74, dpt * 0.86);
      solids.push(rim);
      for (const sgn of [-1, 1]) {           // 轮缘端面的加厚凸台
        const edge = annulus(Ro * 0.99, Ro * 0.88, 0.055);
        edge.translate(0, 0, sgn * dpt * 0.43);
        solids.push(edge);
      }
      const hub = annulus(Math.max(Ro * 0.3, FIT.boreR + 0.08), FIT.boreR, dpt * 0.82);
      solids.push(hub);
      const key = new THREE.BoxGeometry(0.09, 0.14, dpt * 0.86);
      key.translate(keyAt(0.045, Ro * 0.245), 0, 0);
      solids.push(key);
      for (let i = 0; i < 6; i++) {
        const arm = new THREE.BoxGeometry(Ro * 0.66, 0.21, dpt * 0.42);
        arm.translate(Ro * 0.28 + Ro * 0.33, 0, 0);
        arm.rotateZ((i / 6) * Math.PI * 2);
        solids.push(arm);
      }
      break;
    }
    case 'coilSpring': { // 压簧：加粗的圆钢丝 + 两端并紧的磨平座圈
      const H = h * PLATE;
      const turns = Math.max(3, Math.round(params.turns || 6));
      const Rc = Math.min(w, d) / 2 * 0.62;
      const N = turns * 20;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const a = t * Math.PI * 2 * turns;
        pts.push(new THREE.Vector3(Math.cos(a) * Rc, 0.12 + t * (H - 0.24), Math.sin(a) * Rc));
      }
      solids.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, 0.078, 8, false));
      for (const y of [0.07, H - 0.07]) {      // 端部两圈并紧、端面磨平
        const ring2 = annulus(Rc + 0.078, Rc - 0.078, 0.09);
        ring2.rotateX(Math.PI / 2);
        ring2.translate(0, y, 0);
        solids.push(ring2);
      }
      // 两端弹簧压盖 / 弹簧座：中心留导杆孔让顶杆穿过去。
      // 真机器上压簧不会是一根光秃秃竖着的钢丝，两头一定压在座圈里；
      // 加完这两片，视觉上立刻「收口」，压缩时顶盖不动、底盖跟着顶杆走。
      for (const y of [0.05, H - 0.05]) {
        const cap = annulus(Rc + 0.12, 0.17, 0.08, 0.012);
        cap.rotateX(Math.PI / 2);
        cap.translate(0, y, 0);
        solids.push(cap);
      }
      // 刚性导杆：沿弹簧轴线（局部 Y）穿过簧心，两端收在座圈以内（不超出外观占位、
      // 不探出底面），所以几何校验照常通过；簧身被压缩时它保持原长，
      // 隔着簧圈缝隙能看见「弹簧套在导杆上」，呼应几何注释里「座圈中心留导杆孔」的意图。
      const rodR = Math.min(0.09, Rc * 0.35);
      const rod = new THREE.CylinderGeometry(rodR, rodR, Math.max(0.2, H - 0.3), 10);
      rod.translate(0, H / 2, 0);
      rigidRods.push(rod);
      break;
    }

    // ========== v1.19 巧妙机构：换向 / 往复 / 摆动 / 夹紧 / 让位 ==========
    // 灵感来自知乎「63 个机械结构动图」：圆锥齿轮换向(62)、平面滑槽与往复(8/24)、
    // 凸轮双摇杆(43)、肘杆夹紧(49–51)、夹爪(58)。全部沿用「占位格 + 实体外观」契约。
    case 'bevelGear': {  // 锥齿轮：齿长在锥面上，两根互相垂直的轴靠它换向
      const R = Math.min(w, h * PLATE) / 2 - 0.07;
      const H = h * PLATE;
      const cz = H / 2;
      const L = Math.max(0.42, d * 0.62);
      const cone = new THREE.CylinderGeometry(R * 0.88, R * 0.42, L, 24);
      cone.rotateX(Math.PI / 2);             // 轴由 Y 转到 Z，大端朝 +Z
      cone.translate(0, cz, 0);
      solids.push(cone);
      const n = 12;                          // 大端一圈沿锥面倾斜的梯形锥齿
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const tooth = new THREE.BoxGeometry(R * 0.25, R * 0.19, L * 1.02);
        tooth.rotateZ(a + Math.PI / 2);
        tooth.translate(Math.cos(a) * R * 0.79, cz + Math.sin(a) * R * 0.79, 0);
        solids.push(tooth);
      }
      const hub = annulus(Math.max(R * 0.34, FIT.boreR + 0.08), FIT.boreR, 0.14);
      hub.translate(0, cz, L / 2 + 0.02);
      const back = annulus(Math.max(R * 0.38, FIT.boreR + 0.1), FIT.boreR, 0.1);
      back.translate(0, cz, -L / 2 - 0.02);
      const key = new THREE.BoxGeometry(0.06, 0.11, L * 1.15);
      key.translate(keyAt(0.03, R * 0.2), cz, 0);
      solids.push(hub, back, key);
      break;
    }
    case 'scotchYoke': { // 苏格兰轭：曲柄销在竖槽里滑，输出纯正弦往复
      const H = h * PLATE, cy = H / 2;
      const bw = w * 0.72, bh = H * 0.76;
      const sw = 0.36, sh = bh * 0.84;
      const s = new THREE.Shape();
      s.moveTo(-bw / 2, cy - bh / 2);
      s.lineTo(bw / 2, cy - bh / 2);
      s.lineTo(bw / 2, cy + bh / 2);
      s.lineTo(-bw / 2, cy + bh / 2);
      s.closePath();
      const hole = new THREE.Path();          // 与外轮廓反向，挤出后才真是通槽
      hole.moveTo(-sw / 2, cy - sh / 2);
      hole.lineTo(-sw / 2, cy + sh / 2);
      hole.lineTo(sw / 2, cy + sh / 2);
      hole.lineTo(sw / 2, cy - sh / 2);
      hole.closePath();
      s.holes.push(hole);
      const dep = Math.max(0.3, d - 0.06);
      const frame = extrude(s, dep, 0.02);
      frame.translate(0, 0, -dep / 2);
      solids.push(frame);
      for (const sgn of [-1, 1]) {           // 两端输出杆 + 杆端法兰
        const rod = new THREE.BoxGeometry(w * 0.15, 0.18, dep * 0.7);
        rod.translate(sgn * (bw / 2 + w * 0.075), cy, 0);
        const cap = annulus(0.14, 0.07, 0.09);
        cap.rotateY(Math.PI / 2);
        cap.translate(sgn * (bw / 2 + w * 0.15), cy, 0);
        solids.push(rod, cap);
      }
      const pin = new THREE.CylinderGeometry(0.13, 0.13, dep * 1.12, 14);
      pin.rotateX(Math.PI / 2);
      pin.translate(0, cy, 0);
      solids.push(pin);                      // 槽里那颗曲柄销滚子
      break;
    }
    case 'rocker': {     // 摇杆：四杆机构里只左右摆、不整圈转的那根
      const cy = h * PLATE / 2, L = w * 0.84;
      const arm = new THREE.BoxGeometry(L, 0.2, Math.max(0.24, d * 0.5));
      arm.translate(0, cy, 0);
      solids.push(arm);
      for (const sgn of [-1, 1]) {
        const eye = annulus(0.19, 0.09, 0.26);
        eye.translate(sgn * L / 2, cy, 0);
        solids.push(eye);
      }
      const pivot = annulus(0.26, 0.11, 0.34);
      pivot.translate(0, cy, 0);
      const pin = new THREE.CylinderGeometry(0.09, 0.09, 0.46, 12);
      pin.rotateX(Math.PI / 2);
      pin.translate(0, cy, 0);
      solids.push(pivot, pin);
      break;
    }
    case 'toggleLink': { // 肘杆：两根连杆略微过死点，夹紧后自己锁住
      const cy = h * PLATE / 2, half = w * 0.4;
      for (const sgn of [-1, 1]) {
        const bar = new THREE.BoxGeometry(half, 0.17, Math.max(0.24, d * 0.5));
        bar.rotateZ(sgn * 0.22);
        bar.translate(sgn * half / 2, cy + sgn * 0.13, 0);
        solids.push(bar);
        const eye = annulus(0.16, 0.08, 0.24);
        eye.translate(sgn * half, cy + sgn * 0.26, 0);
        solids.push(eye);
      }
      const knee = annulus(0.2, 0.09, 0.3);
      knee.translate(0, cy, 0);
      const pin = new THREE.CylinderGeometry(0.085, 0.085, 0.42, 12);
      pin.rotateX(Math.PI / 2);
      pin.translate(0, cy, 0);
      solids.push(knee, pin);
      break;
    }
    case 'clampJaw': {   // 夹爪：一对带防滑齿的 L 形钳口 + 底部滑轨
      const H = h * PLATE, bd = Math.max(0.5, d * 0.8);
      for (const sgn of [-1, 1]) {
        const base = new THREE.BoxGeometry(w * 0.36, 0.24, bd);
        base.translate(sgn * w * 0.28, 0.12, 0);
        const jaw = new THREE.BoxGeometry(0.2, H * 0.7, bd);
        jaw.translate(sgn * w * 0.4, H * 0.42, 0);
        solids.push(base, jaw);
        for (let i = 0; i < 4; i++) {
          const t = new THREE.BoxGeometry(0.06, 0.08, bd * 0.9);
          t.translate(sgn * w * 0.31, 0.3 + i * 0.22, 0);
          solids.push(t);
        }
      }
      const slide = new THREE.BoxGeometry(w * 0.9, 0.12, bd * 0.4);
      slide.translate(0, 0.06, 0);
      solids.push(slide);
      break;
    }
    case 'portal': {     // 门形机架：中间掏空，让往复件从门洞穿过而不撞机壳
      const H = h * PLATE, bd = Math.max(0.4, d * 0.76);
      const legW = w * 0.22, lx = w / 2 - legW / 2 - 0.04;
      for (const sgn of [-1, 1]) {
        const leg = new THREE.BoxGeometry(legW, H * 0.94, bd);
        leg.translate(sgn * lx, H * 0.47, 0);
        const foot = new THREE.BoxGeometry(legW * 1.6, 0.12, bd * 1.25);
        foot.translate(sgn * lx, 0.06, 0);
        const hole = new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10);
        hole.translate(sgn * lx, 0.14, 0);
        solids.push(leg, foot, hole);
      }
      const beam = new THREE.BoxGeometry(w - 0.08, 0.3, bd);
      beam.translate(0, H * 0.94 - 0.15, 0);
      const rib = new THREE.BoxGeometry(w * 0.5, 0.12, bd * 0.5);
      rib.translate(0, H * 0.94 - 0.34, 0);
      solids.push(beam, rib);
      break;
    }

    // ========== 机械零件补充：轴承 / 轴承座 / 导轨 / 滑块 / 筋板 ==========
    // ===== v1.21 装配连接件：把「逻辑同轴、实体断开」的传动链补成看得见的装配体 =====
    case 'shaftSpan': {  // 跨接轴：细光轴 + 两端带孔轴承座；轴穿进轮毂通孔，绝不切进实体
      const axisY = Math.max(FIT.flangeR + 0.12, Number(params.axisY) || 0.5);
      const len = w - 0.08;
      const ar = FIT.shaftR;
      const core = new THREE.CylinderGeometry(ar, ar, len, 16);
      core.rotateZ(Math.PI / 2);
      core.translate(0, axisY, 0);
      solids.push(core);
      for (let i = 0; i < 3; i++) {         // 花键浅棱：一眼看出这是传动轴不是棍子
        const a = i / 3 * Math.PI * 2;
        const k = new THREE.BoxGeometry(len * 0.46, 0.03, 0.04);
        k.rotateX(a);
        k.translate(0, axisY + Math.cos(a) * (ar + 0.012), Math.sin(a) * (ar + 0.012));
        solids.push(k);
      }
      const ringRo = FIT.boreR + 0.11;
      const postH = Math.max(0.08, axisY - ringRo);
      for (const sgn of [-1, 1]) {
        const x = sgn * (len / 2 - 0.14);
        const foot = new THREE.BoxGeometry(0.3, 0.08, 0.46);
        foot.translate(x, 0.04, 0);
        const post = new THREE.BoxGeometry(0.17, postH, 0.34);
        post.translate(x, postH / 2, 0);
        const ring = annulus(ringRo, FIT.boreR, 0.16);
        ring.rotateY(Math.PI / 2);
        ring.translate(x, axisY, 0);
        solids.push(foot, post, ring);
      }
      break;
    }
    case 'bushing': {    // 轴套/隔套：带配合孔的环 + 安装脚，套在轴上填两轮端面间隙
      const axisY = Math.max(FIT.boreR + 0.14, Number(params.axisY) || 0.5);
      const ring = annulus(axisY, FIT.boreR, Math.max(0.3, w * 0.94));
      ring.rotateY(Math.PI / 2);
      const foot = new THREE.BoxGeometry(w * 0.5, 0.1, 0.4);
      foot.translate(0, -axisY + 0.05, 0);
      solids.push(ring, foot);
      break;
    }
    case 'pedestal': {   // 机座支柱：托住悬空的轴端/轴承座，顶端带孔抱住细轴
      const axisY = Math.max(0.42, Number(params.axisY) || h * PLATE - 0.34);
      const foot = new THREE.BoxGeometry(w * 0.86, 0.16, d * 0.82);
      foot.translate(0, 0.08, 0);
      const cupR = FIT.boreR + 0.12;
      const postH = Math.max(0.12, axisY - cupR);
      const post = new THREE.BoxGeometry(w * 0.36, postH, d * 0.6);
      post.translate(0, postH / 2, 0);
      const cup = annulus(cupR, FIT.boreR, w * 0.7);
      cup.rotateY(Math.PI / 2);
      cup.translate(0, axisY, 0);
      solids.push(foot, post, cup);
      break;
    }
    case 'machineBase': { // 机座平台：厚底板 + 两条 T 槽凸棱 + 四角沉头安装孔
      const bw = w - 0.08, bd = d - 0.08;
      const slabH = bh * 0.76;
      // 底板用带孔挤出体：四角安装孔是**真通孔**，螺栓能穿过去从下面锁螺母，
      // 而不是"沉头孔做到一半就到底了"——那样螺栓是插在实心铁里的。
      const holeAt = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) holeAt.push([sx * (bw / 2 - 0.26), sz * (bd / 2 - 0.26)]);
      const baseS = new THREE.Shape();
      const hw2 = bw / 2 - 0.012, hd2 = bd / 2 - 0.012, rc = 0.1;
      baseS.moveTo(-hw2 + rc, -hd2);
      baseS.lineTo(hw2 - rc, -hd2); baseS.absarc(hw2 - rc, -hd2 + rc, rc, -Math.PI / 2, 0, false);
      baseS.lineTo(hw2, hd2 - rc);  baseS.absarc(hw2 - rc, hd2 - rc, rc, 0, Math.PI / 2, false);
      baseS.lineTo(-hw2 + rc, hd2); baseS.absarc(-hw2 + rc, hd2 - rc, rc, Math.PI / 2, Math.PI, false);
      baseS.lineTo(-hw2, -hd2 + rc); baseS.absarc(-hw2 + rc, -hd2 + rc, rc, Math.PI, Math.PI * 1.5, false);
      baseS.closePath();
      for (const [hx, hz] of holeAt) {
        const p = new THREE.Path();
        p.absarc(hx, hz, HOLE_R, 0, Math.PI * 2, true);
        baseS.holes.push(p);
      }
      const slab = extrudeY(baseS, slabH);
      solids.push(slab);
      for (const sgn of [-1, 1]) {          // T 槽凸棱：机构底脚就卡在这两条棱之间
        const rib = new THREE.BoxGeometry(bw * 0.94, 0.1, 0.16);
        rib.translate(0, slabH + 0.05, sgn * bd * 0.27);
        solids.push(rib);
      }
      for (const [hx, hz] of holeAt) {
        const boss = annulus(0.24, HOLE_R, 0.09, 0.008);
        boss.rotateX(Math.PI / 2);
        boss.translate(hx, slabH + 0.045, hz);
        solids.push(boss);
      }
      holes = holeAt.map(([hx, hz]) => [hx, slabH, hz]);
      break;
    }
    case 'bearing': {    // 开式深沟球轴承：实体外圈 + 实体内圈 + 保持架 + 一圈能看见的滚珠
      const Ro = Math.min(w, h * PLATE) / 2 - 0.06;
      const dep = Math.max(0.32, d * 0.82);
      const outer = annulus(Ro, Ro * 0.76, dep);
      const inner = annulus(Ro * 0.5, Ro * 0.31, dep * 1.02);
      const cage = annulus(Ro * 0.69, Ro * 0.57, 0.06);
      solids.push(outer, inner, cage);
      // 两面都留敞口，滚珠和沟道才看得见（不加盖子糊成实心饼）
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const ball = new THREE.SphereGeometry(Ro * 0.145, 10, 8);
        ball.translate(Math.cos(a) * Ro * 0.64, Math.sin(a) * Ro * 0.64, 0);
        solids.push(ball);
      }
      break;
    }
    case 'pillow': {     // 轴承座：底板 + 座体 + 剖分轴承盖 + 盖螺栓 + 油嘴
      const cy = h * PLATE * 0.62;
      const base = new THREE.BoxGeometry(w * 0.92, 0.2, d * 0.8);
      base.translate(0, 0.1, 0);
      const body = new THREE.BoxGeometry(w * 0.66, cy * 0.88, d * 0.6);
      body.translate(0, 0.2 + cy * 0.44, 0);
      const ring2 = annulus(w * 0.34, w * 0.2, d * 0.66);
      ring2.translate(0, cy, 0);
      const bore = annulus(w * 0.2, w * 0.15, d * 0.68);
      bore.translate(0, cy, 0);
      solids.push(base, body, ring2, bore);
      for (const sgn of [-1, 1]) {             // 剖分面 + 盖螺栓 + 地脚螺栓
        const split = new THREE.BoxGeometry(w * 0.18, 0.08, d * 0.68);
        split.translate(sgn * w * 0.3, cy + w * 0.12, 0);
        const bt = new THREE.CylinderGeometry(0.075, 0.075, 0.28, 8);
        bt.translate(sgn * w * 0.3, cy + w * 0.22, 0);
        const foot = new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8);
        foot.translate(sgn * w * 0.36, 0.24, 0);
        solids.push(split, bt, foot);
      }
      // 顶部油嘴：轴承座要定期加润滑脂
      const nipple = new THREE.CylinderGeometry(0.055, 0.055, 0.16, 8);
      nipple.translate(0, cy + w * 0.34 + 0.08, 0);
      const nippleHead = hexSolid(0.075, 0, 0.075, 'y');
      nippleHead.translate(0, cy + w * 0.34 + 0.18, 0);
      solids.push(nipple, nippleHead);
      break;
    }
    case 'rail': {       // 直线导轨：加厚底板 + 中间凸轨 + 两条淬硬滚道 + 沉头孔
      const base = new THREE.BoxGeometry(w * 0.97, 0.24, d * 0.92);
      base.translate(0, 0.12, 0);
      // v1.21：凸轨抬到接近格顶，滑块骑上去才是「坐在导轨上」而不是悬 0.4 格
      const rib = new THREE.BoxGeometry(w * 0.97, 0.32, d * 0.38);
      rib.translate(0, 0.7, 0);
      solids.push(base, rib);
      for (const sgn of [-1, 1]) {             // 两侧滚道（滑块滚珠就压在这两条圆钢上）
        const way = new THREE.CylinderGeometry(0.055, 0.055, w * 0.9, 10);
        way.rotateZ(Math.PI / 2);
        way.translate(0, 0.84, sgn * d * 0.16);
        solids.push(way);
        // 端面挡块，防止滑块冲出轨道
        const stop = new THREE.BoxGeometry(0.16, 0.38, d * 0.92);
        stop.translate(sgn * (w / 2 - 0.1), 0.61, 0);
        solids.push(stop);
      }
      const holes = [];
      for (let i = 0; i < Math.max(2, Math.round(w / 1.5)); i++) {
        holes.push([-w * 0.42 + i * (w * 0.84 / Math.max(1, Math.round(w / 1.5) - 1)), 0.25, 0]);
      }
      holeBosses(solids, holes, 0.07, 0.05, 'y');
      break;
    }
    case 'slider': {     // 滑块：实体鞍座 + 前后端盖 + 顶面安装孔 + 注油嘴
      const S = Math.min(w, d) * 0.9;
      const H2 = h * PLATE;
      const top = new THREE.BoxGeometry(S, 0.24, S);
      top.translate(0, H2 - 0.12, 0);
      solids.push(top);
      for (const sgn of [-1, 1]) {
        const side = new THREE.BoxGeometry(0.22, H2 * 0.74, S);
        side.translate(sgn * (S / 2 - 0.11), H2 * 0.5, 0);
        solids.push(side);
        // 前后端盖 + 刮油片
        const endCap = new THREE.BoxGeometry(S, H2 * 0.46, 0.1);
        endCap.translate(0, H2 * 0.5, sgn * (S / 2 - 0.03));
        solids.push(endCap);
        for (const dz of [-1, 1]) {            // 内部滚轮
          const wheel = new THREE.CylinderGeometry(0.085, 0.085, 0.14, 12);
          wheel.rotateX(Math.PI / 2);
          wheel.translate(sgn * (S / 2 - 0.13), H2 * 0.3, dz * (S / 2 - 0.16));
          solids.push(wheel);
        }
      }
      // 顶面四颗安装螺纹孔 + 侧面注油嘴
      holeBosses(solids, [
        [-S * 0.28, H2, -S * 0.28], [S * 0.28, H2, -S * 0.28],
        [-S * 0.28, H2, S * 0.28], [S * 0.28, H2, S * 0.28],
      ], 0.065, 0.05, 'y');
      const grease = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8);
      grease.rotateZ(Math.PI / 2);
      grease.translate(S / 2 + 0.04, H2 * 0.62, 0);
      solids.push(grease);
      break;
    }
    case 'gusset': {     // 筋板：三角板挖减重孔 + 两条翻边（真钣金件都翻边抗弯）
      const W = w * 0.92, H2 = h * PLATE * 0.92, T = d * 0.74;
      const s2 = new THREE.Shape();
      s2.moveTo(-W / 2, 0.02);
      s2.lineTo(W / 2, 0.02);
      s2.lineTo(-W / 2, H2);
      s2.closePath();
      const hole = new THREE.Path();
      hole.absarc(-W * 0.1, H2 * 0.28, Math.min(W, H2) * 0.16, 0, Math.PI * 2, true);
      s2.holes.push(hole);
      const g = extrude(s2, T, 0.016);
      g.translate(0, 0, -T / 2);
      solids.push(g);
      // 斜边加厚肋：方向要跟斜边一致（从右下指向左上），否则会穿成一根交叉棍
      const rib = new THREE.BoxGeometry(Math.hypot(W, H2) * 0.94, 0.1, T * 0.4);
      rib.rotateZ(Math.PI - Math.atan2(H2, W));
      rib.translate(0, H2 * 0.5, 0);
      const foot = new THREE.BoxGeometry(W, 0.09, T * 1.12);
      foot.translate(0, 0.05, 0);
      const upright = new THREE.BoxGeometry(0.09, H2 * 0.82, T * 1.12);
      upright.translate(-W / 2 + 0.05, H2 * 0.41, 0);
      solids.push(rib, foot, upright);
      break;
    }
    case 'nut': {        // 螺母：整体六角棱柱挖通孔（不再是六块薄板拼的空壳）
      const Ro = Math.min(w, d) / 2 * 0.88;
      const H = h * PLATE * 0.9;
      const g = hexSolid(Ro, Ro * 0.46, H);
      solids.push(g);
      // 顶面倒角 + 内螺纹示意
      const cham = annulus(Ro * 0.92, Ro * 0.5, 0.05);
      cham.rotateX(Math.PI / 2);
      cham.translate(0, H, 0);
      solids.push(cham);
      for (let i = 0; i < 3; i++) {
        const th = new THREE.TorusGeometry(Ro * 0.48, 0.026, 5, 16);
        th.rotateX(Math.PI / 2);
        th.translate(0, H * (0.22 + i * 0.28), 0);
        solids.push(th);
      }
      break;
    }
    case 'washer': {     // 垫圈：扁平圆环，垫在螺栓头下面分散压力
      const Ro = Math.min(w, d) / 2 * 0.9;
      const s2 = new THREE.Shape();
      s2.absarc(0, 0, Ro, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, Ro * 0.42, 0, Math.PI * 2, true);
      s2.holes.push(hole);
      const g = extrudeY(s2, h * PLATE * 0.34);
      solids.push(g);
      break;
    }

    // ===== v1.28 补充的机械零件：把常用传动/机构/标准件补齐 =====
    case 'wormWheel': {  // 蜗轮：斜齿圈 + 辐板 + 轮毂，配蜗杆用（减速比大、可自锁）
      const teeth = Math.round(params.teeth || 24);
      const Rr = Math.min(w, d) / 2 * 0.94;
      const dpt = Math.max(0.3, d - 0.06);
      const rimIn = Rr * 0.8;
      const g = extrude(gearProfile(Rr, teeth, rimIn), dpt, 0.018);
      g.translate(0, 0, -dpt / 2);
      solids.push(g);
      // 斜齿：齿顶沿轴向错开一个螺旋角，蜗轮才有"斜"的样子
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        const tw = (Math.PI * 2 * Rr) / teeth * 0.52;
        for (const sgn of [-1, 1]) {
          const t = new THREE.BoxGeometry(tw, (Rr * 0.09), dpt * 0.42);
          t.rotateZ(a + Math.PI / 2);
          t.translate(Math.cos(a) * (Rr + Rr * 0.035), Math.sin(a) * (Rr + Rr * 0.035), sgn * dpt * 0.23);
          solids.push(t);
        }
      }
      const hubR = spokedWheel(solids, rimIn * 0.99, rimIn, dpt, 4, { hubR: Math.max(Rr * 0.28, FIT.boreR * 1.3) });
      const boss = annulus(hubR * 1.25, FIT.boreR, 0.1);
      boss.translate(0, 0, dpt * 0.5);
      solids.push(boss);
      break;
    }
    case 'sprocket': {   // 链轮：齿仓咬住链条，辐板带减重孔
      const teeth = Math.round(params.teeth || 12);
      const Rr = Math.min(w, d) / 2 * 0.9;
      const dpt = Math.max(0.24, d * 0.34);
      const rootR = Rr * 0.84;
      const hubR = Math.max(Rr * 0.3, FIT.boreR + 0.09);
      const rim = annulus(rootR, rootR * 0.74, dpt);
      const hub = annulus(hubR, FIT.boreR, dpt * 1.12);
      solids.push(rim, hub);
      const pitch = (Math.PI * 2 * rootR) / teeth;
      for (let i = 0; i < teeth; i++) {          // 齿：根部宽、齿顶窄（链轮的齿是"齿仓"两侧的凸台）
        const a = (i / teeth) * Math.PI * 2;
        const tooth = new THREE.CylinderGeometry(pitch * 0.36, pitch * 0.46, dpt, 8);
        tooth.rotateX(Math.PI / 2);
        tooth.translate(Math.cos(a) * (rootR + pitch * 0.18), Math.sin(a) * (rootR + pitch * 0.18), 0);
        solids.push(tooth);
      }
      for (let i = 0; i < 4; i++) {              // 辐条
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const sp = new THREE.BoxGeometry(rootR * 0.74 - hubR, 0.11, dpt * 0.5);
        sp.translate((rootR * 0.74 + hubR) / 2, 0, 0);
        sp.rotateZ(a);
        solids.push(sp);
      }
      break;
    }
    case 'eccentric': {  // 偏心轮：偏心圆盘 + 外抱箍，把转动变成往复
      const R = Math.min(w, d) / 2 * 0.72;
      const p = Math.max(0.12, params.eccR ?? 0.22);
      const dpt = Math.max(0.22, d * 0.3);
      const disc = annulus(R, FIT.boreR, dpt);
      disc.translate(0, p, 0);
      solids.push(disc);
      const strap = annulus(R * 1.16, R * 1.02, dpt * 0.66);
      strap.translate(0, p, 0);
      solids.push(strap);
      // 抱箍拉杆耳：把往复引出去
      const eye = annulus(R * 0.34, R * 0.2, dpt * 0.5);
      eye.translate(0, p + R * 1.16 + R * 0.2, 0);
      solids.push(eye);
      const neck = new THREE.BoxGeometry(R * 0.42, R * 0.4, dpt * 0.5);
      neck.translate(0, p + R * 1.05, 0);
      solids.push(neck);
      pin = [0, p, 0];
      break;
    }
    case 'crankDisc': {  // 曲柄盘：一块圆盘 + 偏心曲柄销（最简单的曲柄，配连杆用）
      const R = Math.min(w, d) / 2 * 0.92;
      const p = Math.max(0.12, params.pinR ?? 0.3);
      const dpt = Math.max(0.24, d * 0.3);
      const disc = annulus(R, FIT.boreR, dpt);
      solids.push(disc);
      const boss = annulus(R * 0.3, FIT.boreR, dpt * 1.25);
      solids.push(boss);
      const pinGeo = new THREE.CylinderGeometry(0.13, 0.13, dpt * 2.0, 16);
      pinGeo.rotateX(Math.PI / 2);
      pinGeo.translate(0, p, 0);
      solids.push(pinGeo);
      const pinBoss = annulus(R * 0.26, 0.13, dpt * 0.8);
      pinBoss.translate(0, p, 0);
      solids.push(pinBoss);
      pin = [0, p, 0];
      break;
    }
    case 'flange': {     // 法兰：两片对接盘 + 止口 + 螺栓圈，管件/联轴的标准接口
      const R = Math.min(w, d) / 2 * 0.92;
      const dpt = Math.max(0.2, d * 0.22);
      for (const sgn of [-1, 1]) {
        const pl = annulus(R, FIT.boreR, dpt * 1.1);
        pl.translate(0, 0, sgn * dpt * 0.62);
        solids.push(pl);
        const spigot = annulus(R * 0.62, R * 0.5, dpt * 0.5);
        spigot.translate(0, 0, sgn * dpt * 1.35);
        solids.push(spigot);
      }
      for (let i = 0; i < 6; i++) {               // 六颗连接螺栓 + 螺母
        const a = (i / 6) * Math.PI * 2;
        const bt = new THREE.CylinderGeometry(0.06, 0.06, dpt * 2.6, 8);
        bt.rotateX(Math.PI / 2);
        bt.translate(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, 0);
        const nut = new THREE.CylinderGeometry(0.1, 0.1, dpt * 0.4, 6);
        nut.rotateX(Math.PI / 2);
        nut.translate(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, dpt * 1.2);
        solids.push(bt, nut);
      }
      break;
    }
    case 'cylinderBlock': {  // 气缸：缸筒 + 端盖 + 散热片 + 进排气口，活塞在里面往复
      const Ro = Math.min(w, d) / 2 * 0.9;
      const H = h * PLATE;
      const wall = Math.max(0.1, Ro * 0.16);
      const tube = annulus(Ro, Ro - wall, H * 0.86);
      tube.rotateX(Math.PI / 2);
      tube.translate(0, H * 0.5, 0);
      solids.push(tube);
      const head = annulus(Ro * 1.06, FIT.boreR, H * 0.14);   // 缸盖（带进排气通道）
      head.rotateX(Math.PI / 2);
      head.translate(0, H * 0.93, 0);
      solids.push(head);
      for (let i = 0; i < 4; i++) {                            // 散热片
        const fin = annulus(Ro * 1.12, Ro * 0.98, 0.05);
        fin.rotateX(Math.PI / 2);
        fin.translate(0, H * (0.62 + i * 0.09), 0);
        solids.push(fin);
      }
      const port = new THREE.CylinderGeometry(Ro * 0.2, Ro * 0.2, Ro * 0.7, 12);
      port.rotateZ(Math.PI / 2);
      port.translate(Ro * 0.95, H * 0.86, 0);
      solids.push(port);
      const base = annulus(Ro * 1.15, Ro * 0.4, 0.09);         // 缸座法兰
      base.rotateX(Math.PI / 2);
      base.translate(0, 0.045, 0);
      solids.push(base);
      break;
    }
    case 'valve': {      // 阀：阀体 + 阀杆 + 阀盘 + 弹簧座（配汽/止回都能用）
      const Ro = Math.min(w, d) / 2 * 0.82;
      const H = h * PLATE;
      const body = annulus(Ro, Ro * 0.46, H * 0.42);
      body.rotateX(Math.PI / 2);
      body.translate(0, H * 0.56, 0);
      solids.push(body);
      const guide = annulus(Ro * 0.4, Ro * 0.16, H * 0.3);
      guide.rotateX(Math.PI / 2);
      guide.translate(0, H * 0.84, 0);
      solids.push(guide);
      const stem = new THREE.CylinderGeometry(Ro * 0.13, Ro * 0.13, H * 0.78, 10);
      stem.translate(0, H * 0.5, 0);
      solids.push(stem);
      const plate = new THREE.CylinderGeometry(Ro * 0.62, Ro * 0.5, H * 0.09, 20);
      plate.translate(0, H * 0.31, 0);
      solids.push(plate);
      const seat = annulus(Ro * 0.72, Ro * 0.5, H * 0.11);
      seat.rotateX(Math.PI / 2);
      seat.translate(0, H * 0.34, 0);
      solids.push(seat);
      break;
    }
    case 'gearStep': {   // 双联齿轮（塔轮）：一大一小两只齿轮同轴，一级就换速
      const teeth1 = Math.round(params.teeth || 14);
      const R1 = teeth1 * GEAR_MODULE;
      const R2 = R1 * 0.62;
      const dpt = Math.max(0.2, d * 0.26);
      for (const [R, tz, teeth] of [[R1, -dpt * 0.62, teeth1], [R2, dpt * 0.62, Math.max(6, Math.round(teeth1 * 0.62))]]) {
        const g = extrude(gearProfile(R, teeth, Math.max(R * 0.34, FIT.boreR * 1.3)), dpt, 0.016);
        g.translate(0, 0, tz - dpt / 2);
        solids.push(g);
      }
      const hub = annulus(Math.max(R2 * 0.5, FIT.boreR + 0.07), FIT.boreR, dpt * 2.4);
      solids.push(hub);
      break;
    }
    case 'splineShaft': { // 花键轴：轴身 + 六条纵向花键，能带动齿轮又能轴向滑移
      const R = Math.min(w, d) / 2 * 0.52;
      const len = w - 0.06;
      const sh = new THREE.CylinderGeometry(R, R, len, 20);
      sh.rotateZ(Math.PI / 2);
      solids.push(sh);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const rib = new THREE.BoxGeometry(len * 0.94, R * 0.46, R * 0.34);
        rib.translate(0, R * 1.16, 0);
        rib.rotateX(a);
        solids.push(rib);
      }
      for (const sgn of [-1, 1]) {                 // 两端中心孔（顶尖孔）
        const c = new THREE.CylinderGeometry(R * 0.3, R * 0.3, 0.06, 12);
        c.rotateZ(Math.PI / 2);
        c.translate(sgn * (len / 2 - 0.02), 0, 0);
        solids.push(c);
      }
      break;
    }

    default: return null;
  }
  return { solids, studs: studsFor(studMode, w, d, h), rotor, rotorCenter, pin, holes, lift, rigidRods };
}
/**
 * 由形状生成几何体
 * 返回值原点在"占地中心 + 底面 0"，方便直接放到格子上
 */
/** 与占位格旋转一致的矩阵：先绕 X、再绕 Z、最后绕 Y（见 rotX90/rotZ90/rot90） */
function rotationMatrix(rx, ry, rz) {
  const m = new THREE.Matrix4();
  const t = new THREE.Matrix4();
  for (let i = 0; i < rx; i++) { t.makeRotationX(-Math.PI / 2); m.multiply(t); }
  for (let i = 0; i < rz; i++) { t.makeRotationZ(Math.PI / 2); m.premultiply(t); }
  for (let i = 0; i < ry; i++) { t.makeRotationY(-Math.PI / 2); m.premultiply(t); }
  return m;
}

/** 把异形零件旋转到位、对齐到格子包围盒，再合并成一个整体 */
function assembleSpecial(solids, studs, rx, ry, rz, keep = false, sink = 0, rotor = [], rotorCenter = [0, 0, 0], pin = null, holes = null, cellH = 0, centerY = false, rigidRods = []) {
  const all = solids.concat(studs, rotor);
  const m = rotationMatrix(rx, ry, rz);
  if (rx || ry || rz) {
    all.forEach(g => g.applyMatrix4(m));
  }
  const box = new THREE.Box3();
  all.forEach(g => { g.computeBoundingBox(); box.union(g.boundingBox); });
  const c = box.getCenter(new THREE.Vector3());
  // v1.27 转动件按「格心」竖直对中：曲轴只有 0.71 格高、拨盘 0.84 格高、联轴器 0.79 格高，
  // 若一律把底面压到 y=0，它们的转轴就落在格子底部，而传动层认的轴是格心——
  // 差出 0.1~0.6 格，转起来整件绕空气画圈，连杆/拨销跟着跑偏插进别的零件。
  // 螺钉、垫圈这类不转的零件仍然压平底面（它们本来就该坐在面上）。
  // 转动件的转轴 = 零件自身的轴心，必须落在「占位格中心」。曲轴、拨盘这类零件
  // 相对轴心并不对称（配重挂在下面、拨臂伸到外面），按包围盒居中会把轴心带偏。
  // 几何都是**绕局部原点**造出来的，所以对中就是把原点送到 cellH/2。
  const bh = box.max.y - box.min.y;
  // 对中的条件：转动件，且几何高度没超过占位格（齿轮的齿顶会略微超出，仍按底面落地）
  const centered = centerY && cellH > 0 && bh <= cellH + 1e-3;
  // 各零件建几何时用的基准不一样：齿轮、曲轴、蜗杆、拨盘都绕局部原点造（轴心在 y=0），
  // 而联轴器、万向节、摇杆是按「层板中线」造的（cy = h/2，轴心本来就在格心）。
  // 所以对中量 = 格心 − 它自己轴心的高度，不能一律加 cellH/2，否则联轴器会整体浮起半格。
  const midY = (box.min.y + box.max.y) / 2;
  const axisLocal = Math.abs(midY - cellH / 2) < Math.abs(midY) ? cellH / 2 : 0;
  const sitY = centered ? cellH / 2 - axisLocal : -box.min.y;
  // 水平方向：几何本来就是绕局部原点造的，所以转动件不再按包围盒居中——
  // 曲轴的销伸在一侧、包围盒不对称，按盒居中会把轴心带偏 0.1 格。
  const keepXZ = keep || centered;
  const off = new THREE.Vector3(keepXZ ? 0 : -c.x, sitY, keepXZ ? 0 : -c.z);
  all.forEach(g => g.translate(off.x, off.y, off.z));

  // v1.27 转轴轴心：竖直取零件自己的轴心高度（1 格件 0.5、2 格件 1.0…），
  // 水平方向除了 keep 件（拨盘、外伸件：不平移 x/z，只能取包围盒中心）以外，
  // **一律是局部原点的落点**——曲轴的销偏在一侧、包围盒不对称，按盒心算会偏 0.07 格，
  // 销的半径就跟着缩水，连杆大头又对不上。
  const axisCenter = keep
    ? [c.x + off.x, axisLocal + off.y, c.z + off.z]
    : [off.x, axisLocal + off.y, off.z];

  const flat = g => (g.index ? g.toNonIndexed() : g);
  const bodyG = mergeGeometries(solids.map(flat), false);
  const studG = studs.length ? mergeGeometries(studs.map(flat), false) : null;
  solids.forEach(g => g.dispose());
  studs.forEach(g => g.dispose());

  const group = new THREE.Group();
  const m1 = new THREE.Mesh(bodyG, null);
  m1.castShadow = true; m1.receiveShadow = true;
  group.add(m1);
  if (studG) {
    const m2 = new THREE.Mesh(studG, null);
    m2.castShadow = true; m2.receiveShadow = true;
    group.add(m2);
  }
  // 转子单独成网格：顶点仍留在整块积木的坐标系里，但记录它自己的轴心。
  // 运转时主循环用 q + (c − q·c) 让它绕轴心自转，机身一点都不动。
  if (rotor.length) {
    const rg = mergeGeometries(rotor.map(flat), false);
    rotor.forEach(g => g.dispose());
    const mr = new THREE.Mesh(rg, null);
    mr.castShadow = true; mr.receiveShadow = true;
    const center = new THREE.Vector3(...rotorCenter).applyMatrix4(m).add(off);
    mr.userData.rotor = true;
    mr.userData.rotorCenter = [center.x, center.y, center.z];
    group.add(mr);
  }
  // 铰接销：同样把局部点转到最终姿态，存到 userData 上供动画/审计读取
  if (pin) {
    const pv = new THREE.Vector3(...pin).applyMatrix4(m).add(off);
    group.userData.pin = [pv.x, pv.y, pv.z];
  }
  // 通孔孔心：同样转到最终姿态。连杆靠这两个点做刚体摆放，
  // 无论图纸把杆子转倒（rz/ry）还是平移，孔都不会偏出销。
  if (holes) {
    group.userData.holes = holes.map(h => {
      const v = new THREE.Vector3(...h).applyMatrix4(m).add(off);
      return [v.x, v.y, v.z];
    });
    // 孔轴线（板面法线）：只转不平移
    const nv = new THREE.Vector3(0, 0, 1).applyMatrix4(m);
    group.userData.holeNormal = [nv.x, nv.y, nv.z];
  }
  // 刚性导杆：单独成网格、不随簧身压缩缩放，让「弹簧套在导杆上」一眼可见。
  // 它随整组一起旋转/定位，所以始终沿弹簧轴线穿过簧心、两端探出弹簧座。
  for (const rg of rigidRods) {
    rg.applyMatrix4(m); rg.translate(off.x, off.y, off.z);
    const mr = new THREE.Mesh(rg, null);
    mr.castShadow = true; mr.receiveShadow = true;
    mr.userData.rigidRod = true;
    group.add(mr);
  }
  // 下沉量：穿销/木钉要"钉进"下面那块积木，看起来才是插进去的
  if (sink) group.position.y = -sink;
  group.userData.axis = axisCenter;
  return { group };
}

// ===================== 装饰件：朝向相机的贴图 =====================
// 只占 1 格、不承重，作用是给作品加环境（小屋旁边的鹿、篱笆上的蝴蝶）。
// 用 Sprite 而不是 Plane：任何角度都正面朝人，不会侧过来变成一条线。
const _decoTex = new Map();
function decoTexture(url) {
  if (_decoTex.has(url)) return _decoTex.get(url);
  // file:// 直开时，运行时加载的图片在 WebGL 里上传纹理会被 CORS 拦（opaque origin），
  // 场景里的装饰件会变成一片空白——但面板缩略图（普通 <img>）是正常的，
  // 所以「缩略图看得到、放上台看不到」。这里优先用 index.html 预注入的
  // dataURL（assets/deco/sprites.js），双击打开也能正常显示。
  let src = url;
  const id = (url.match(/([\w-]+)\.\w+$/) || [])[1];
  // 注意：几何模块在 Node 下也会被加载（回归测试/审计脚本），没有 window。
  if (typeof window !== 'undefined' && window.DECO_SPRITES && id && window.DECO_SPRITES[id]) src = window.DECO_SPRITES[id];
  // 同理 TextureLoader 需要 DOM（ImageLoader 用 document.createElementNS）。
  // Node 下给一张空纹理占位：结构审计只关心 Sprite 的占位，不关心贴图内容。
  if (typeof document === 'undefined') {
    const t = new THREE.Texture();
    _decoTex.set(url, t);
    return t;
  }
  const t = new THREE.TextureLoader().load(src);
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _decoTex.set(url, t);
  return t;
}

function spriteGroup(shape) {
  const group = new THREE.Group();
  const h = shape.h || 1.4;
  const w = h * (shape.aspect || 0.8);
  const mat = new THREE.SpriteMaterial({
    map: decoTexture(shape.sprite),
    transparent: true,
    depthWrite: false,
    alphaTest: 0.02,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(w, h, 1);
  sp.center.set(0.5, 0);          // 锚点挪到底边中点：图片"站"在格子上，不像悬空的贴纸
  sp.position.set(0, 0, 0);
  sp.userData.sprite = true;
  sp.renderOrder = 2;
  group.add(sp);
  group.userData.isDeco = true;
  return { group };
}

export function buildBrickGeometry(shape, params = {}) {
  // 装饰贴图：没有实体几何，直接交给 Sprite
  if (shape.sprite) return spriteGroup(shape);
  const cells = shape.cells;
  // 没传参数时用零件自己声明的默认值（齿数/节数/螺距…），
  // 否则几何会跟装配台里的初始状态对不上
  if (shape.pdef) {
    let need = false;
    for (const d of shape.pdef) if (params[d.key] === undefined) { need = true; break; }
    if (need) {
      const p = { ...params };
      for (const d of shape.pdef) if (p[d.key] === undefined) p[d.key] = d.def;
      params = p;
    }
  }

  // 异形件（圆柱/球/圆锥/管/拱/齿轮/榫头…）：外观走真正的曲面几何，占位仍用格子
  if (shape.geo && shape.size) {
    const [w0, d0, h0] = shape.size;
    const sp = specialParts(shape.geo, w0, d0, h0, STUDS_ON ? (shape.studs || 'grid') : 'none', params);
    if (sp && sp.solids.length) {
      const res = assembleSpecial(sp.solids, sp.studs, shape.rx || 0, shape.ry || 0, shape.rz || 0,
        !!shape.keep, shape.sink || 0, sp.rotor || [], sp.rotorCenter || [0, 0, 0],
        sp.pin || null, sp.holes || null, shapeBounds(shape).h, !!(shape.spin || shape.oscillate),
        sp.rigidRods || []);
      if (sp.lift) {
        res.group.children.forEach(m => m.geometry.translate(0, sp.lift, 0));
        if (res.group.userData.axis) res.group.userData.axis[1] += sp.lift;
      }
      return res;
    }
  }

  const cs = cells.map(c => c.c), rs = cells.map(c => c.r);
  const offX = -(Math.min(...cs) + Math.max(...cs) + 1) / 2;
  const offZ = -(Math.min(...rs) + Math.max(...rs) + 1) / 2;
  const sg = studGeo();

  // 一组格子 → 合并后的实体/凸点几何。偏移基准用**全体**格子的包围盒算好传进来，
  // 这样分色时各组各算各的也不会错位。
  const buildPart = (subset) => {
    const boxes = mergeCells(subset);
    const solids = [];
    const studs = [];
    for (const b of boxes) {
      const w = b.w - GAP * 2;
      const d = b.d - GAP * 2;
      const h = b.h * PLATE - SEAM_Y; // 多层合并时按层数取高，只留层间细缝
      const g = roundedBox(w, h, d, BEVEL);
      g.translate(
        (b.c0 + b.w / 2) + offX,
        b.l0 * PLATE + h / 2,
        (b.r0 + b.d / 2) + offZ
      );
      solids.push(g);

      const topY = b.l0 * PLATE + h;
      if (!STUDS_ON) continue;                 // 光面模式：不生成顶面啮合圆点
      for (let x = 0; x < b.w; x++) {
        for (let z = 0; z < b.d; z++) {
          const s = sg.clone();
          s.translate(b.c0 + x + 0.5 + offX, topY + STUD_H / 2 - 0.012, b.r0 + z + 0.5 + offZ);
          studs.push(s);
        }
      }
    }
    const body = mergeGeometries(solids, false);
    const stud = studs.length ? mergeGeometries(studs, false) : null;
    solids.forEach(g => g.dispose());
    studs.forEach(g => g.dispose());
    return { body, stud };
  };

  const mk = (geo, color) => {
    const m = new THREE.Mesh(geo, null);
    m.castShadow = true; m.receiveShadow = true;
    if (color) m.userData.color = color;
    return m;
  };

  // v1.28.1：带颜色的格子（从主平台多选存下来的形状）按颜色分组出多个 mesh，
  // world.js 见到 userData.color 就各自上色，不被整块统一色覆盖 —— 搭的小屋
  // 存成形状后，墙是墙的色、屋顶还是屋顶的色。
  const palette = [...new Set(cells.map(c => c.color).filter(Boolean))];
  if (palette.length) {
    const group = new THREE.Group();
    group.userData.keepColors = true;
    for (const col of palette) {
      const sub = cells.filter(c => (c.color || palette[0]) === col);
      if (!sub.length) continue;
      const { body, stud } = buildPart(sub);
      group.add(mk(body, col));
      if (stud) group.add(mk(stud, col));
    }
    return { group };
  }

  const { body, stud } = buildPart(cells);
  const group = new THREE.Group();
  group.add(mk(body, null));
  if (stud) group.add(mk(stud, null));
  return { group };
}

export function shapeBounds(shape) {
  const cs = shape.cells.map(c => c.c);
  const rs = shape.cells.map(c => c.r);
  const ls = shape.cells.map(c => c.l);
  return {
    w: Math.max(...cs) - Math.min(...cs) + 1,
    d: Math.max(...rs) - Math.min(...rs) + 1,
    h: Math.max(...ls) - Math.min(...ls) + 1,
  };
}

/** 绕 Y 轴旋转 step×90° */
function rot90(cell, step) {
  let { c, r } = cell;
  for (let i = 0; i < step; i++) { const nc = -r; const nr = c; c = nc; r = nr; }
  return { c, r, l: cell.l };
}

function normalize(cells) {
  const mc = Math.min(...cells.map(c => c.c));
  const mr = Math.min(...cells.map(c => c.r));
  const ml = Math.min(...cells.map(c => c.l));
  return cells.map(c => ({ c: c.c - mc, r: c.r - mr, l: c.l - ml }));
}

/** 绕 X 轴 90°：(c,r,l) → (c, l, -r) */
function rotX90(c) { return { c: c.c, r: c.l, l: -c.r }; }
/** 绕 Z 轴 90°：(c,r,l) → (-l, r, c) */
function rotZ90(c) { return { c: -c.l, r: c.r, l: c.c }; }

const rotCache = new Map();

/**
 * 三轴旋转后的形状（缓存）
 * 变换顺序：先绕 X、再绕 Z、最后绕 Y，与界面上的旋转按钮顺序一致
 */
export function shapeRot(shape, rx = 0, ry = 0, rz = 0) {
  rx = ((rx % 4) + 4) % 4; ry = ((ry % 4) + 4) % 4; rz = ((rz % 4) + 4) % 4;
  const k = `${shape.id}#${rx},${ry},${rz}`;
  const hit = rotCache.get(k);
  if (hit) return hit;
  let cells = shape.cells;
  for (let i = 0; i < rx; i++) cells = cells.map(rotX90);
  for (let i = 0; i < rz; i++) cells = cells.map(rotZ90);
  for (let i = 0; i < ry; i++) cells = cells.map(c => rot90(c, 1));
  const res = { ...shape, cells: normalize(cells), rx, ry, rz };
  rotCache.set(k, res);
  return res;
}

/**
 * 连杆刚体姿态：两端孔心 + 板面法线（都是烘焙后的真实值）摆到 曲柄销 P 与活塞销 anchor 上。
 * 只做刚体旋转/平移——不再沿杆长拉伸去"凑"销距，那样小头必然扎进活塞。
 * 返回纯数组，主循环与审计脚本共用同一套算法。
 */
export function rodPose(holes, normal, axis, P, A) {
  const H0 = new THREE.Vector3(...holes[0]);
  const H1 = new THREE.Vector3(...holes[1]);
  const uL = H1.clone().sub(H0).normalize();
  const nL = new THREE.Vector3(...(normal || [0, 0, 1])).normalize();
  const dir = new THREE.Vector3(...A).sub(new THREE.Vector3(...P));
  const dl = dir.length() || 1;
  dir.divideScalar(dl);
  const q = new THREE.Quaternion();
  const ax = axis ? new THREE.Vector3(...axis).normalize() : null;
  if (ax && Math.abs(nL.dot(ax)) > 0.9) {
    // 平面曲柄滑块：整根杆只在垂直于曲轴轴的平面里转，绕轴一次旋转即可，
    // 不会像 setFromUnitVectors 那样把板面拧歪
    const ang = Math.atan2(uL.clone().cross(dir).dot(ax) * (nL.dot(ax) > 0 ? 1 : -1), uL.dot(dir));
    q.setFromAxisAngle(ax, ang);
  } else {
    q.setFromUnitVectors(uL, dir);
  }
  const off = H0.clone().applyQuaternion(q);
  return { pos: [P[0] - off.x, P[1] - off.y, P[2] - off.z], quat: [q.x, q.y, q.z, q.w], len: dl };
}

/** 只绕 Y 轴旋转（保留给只需要水平旋转的调用方） */
export function shapeAt(shape, ry) {
  return shapeRot(shape, 0, ry, 0);
}

/** 预生成所有形状的几何体 */
export function warmGeometry(shapes, ryList = [0, 1, 2, 3]) {
  const cache = new Map();
  for (const s of shapes) {
    for (const ry of ryList) {
      const sh = shapeAt(s, ry);
      cache.set(`${s.id}#${ry}`, buildBrickGeometry(sh));
    }
  }
  return cache;
}
