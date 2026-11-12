// 桥接轴：凡是传动图里「同轴耦合（非齿轮啮合）且轴向留有大缝」的一对零件，
// 自动生成一根细轴把两段轮毂连起来。这样配合对之间不再「逻辑上连着、实体上断开」，
// 也不用逐一手工给 12 张图纸补轴——图纸一改，轴自动跟着改。
//
// 设计要点：
//  · 只处理 flip=false 的「同轴耦合」边；齿轮啮合（flip=true）中心距是传动比依据，不补轴。
//  · 两零件轴向错开超过 0.6 格才补（否则本来就有可见轴/紧贴，不必画蛇添足）。
//  · 垂直错心 ≤ 1.05 格的也补：这类是「求解器判为同轴、但两零件轴心差半格~一格」的
//    真实联轴器工况（3 格盘件轴在半格、2 格支承件轴在整数格的几何奇偶差），补一根
//    直轴把两段轮毂连起来，正是现场「轴略偏、靠联轴器找正」的样子，不再悬空；
//    错心再大（>1.05）才视为假耦合跳过，交给蓝图重排。
//  · 轴线段若会穿进第三件「非镗孔」积木（如实心底板/旋转实体），直接跳过这根轴，避免制造新的穿模。
import * as THREE from '../lib/three.module.js';
import { buildDrivetrain } from './drive.js';
import { getShape } from './shapes.js';
import { shapeRot, shapeBounds, FIT } from './geom.js';

// v1.26 配合标准：芯轴半径不再「细得像根针」。
// 轮类零件的统一配合孔 FIT.boreR = 0.205（已含倒角，实际有效孔径 ≈0.185），
// 原来轴半径只有 0.12×0.92 ≈ 0.11 —— 孔比轴粗了近一倍，看上去就是「飞轮套在一根细针上」。
// 现在按配合来：轴半径 0.176，单边留 0.009 的装配间隙，孔轴贴合、能转但不旷。
const SHAFT_R = +(FIT.boreR - 0.029).toFixed(3);
const AXLE_COLOR = 0x9aa3ad; // 钢轴灰
// 直轴只补「真正同轴」的配对：垂直错心 ≤0.12 格（差一根头发）才连线。
// 原来放宽到 1.05 格，结果是两段轮毂之间斜着插一根轴——肉眼一眼看出是斜插，
// 比不补还糟。错心大的配对交给「各自的穿轴 + 轴向延伸」表达（见 addHubStubs）。
const MAX_PERP = 0.12;
let _mat = null;

/**
 * 判定一个零件 id 是不是「子转子」（drive.js 给同轴套装件派生的 `xxx:rotor` 副本）。
 * 注意：id 可能是数字（World.add 给缺省 id 的积木自动编号 1,2,3…），
 * 直接调 .endsWith 会抛 TypeError —— 这里统一先转字符串再判断。
 */
const isRotorId = id => String(id ?? '').endsWith(':rotor');
function axleMat() {
  if (!_mat) _mat = new THREE.MeshStandardMaterial({ color: AXLE_COLOR, metalness: 0.8, roughness: 0.3 });
  return _mat;
}

// 这些形状的实体允许轴「穿过去」：机架/底板（轴从安装孔/轴承座孔里过）、
// 以及轴承/轴承座/联轴器/螺母座这类「轴就套在孔里」的零件。
// 真正不能穿的是旋转实体（齿轮/轮/轮胎/皮带轮/凸轮/电机……），那里再画轴会成穿透。
const BORE_SHAPES = new Set([
  'plate2x4', 'plate4x4', 'plate2x2', 'brick4', 'brick2', 'cube', 'cube2',
  'portal', 'gusset', 'rail', 'column', 'frame', 'base', 'beam',
  'bolt', 'nut', 'washer', 'bearing', 'pillow', 'coupling', 'leadNut', 'motor',
  'shaftSpan', 'shaftLong',
]);

// v1.28.1：**自带轴颈**的零件不再外挂穿轴。
// 曲轴、曲柄盘、偏心轮在几何里就把主轴颈车出来了（半径 mainR），而桥接轴是统一
// SHAFT_R=0.176 的钢轴 —— 比曲轴轴颈还粗，于是整根曲轴被一根银色圆杆从头包到尾，
// 看上去就是「一根银灰直杆 + 几片黄色凸起」，转起来还以为是连杆在穿它。
// 这些零件必须自己表达轴，任何外来轴都不许再从它们身上过。
const OWN_JOURNAL = new Set(['crank', 'crankDisc', 'eccentric', 'splineShaft', 'gearStep']);

/** 一个轴线段：从 a 到 b 的世界坐标（带微小收缩，两端藏进轮毂里） */
function segmentBlocked(a, b, others, rad = 0) {
  // 线段 a→b 是否与任一 other AABB 相交（rad = 轴半径，按半径膨胀，避免"轴擦着实体过"）
  const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-6) return true;
  const u = [dir[0] / len, dir[1] / len, dir[2] / len];
  for (const o of others) {
    if (o.shapeId && BORE_SHAPES.has(o.shapeId)) continue; // 机架/轴承座/联轴器：轴从孔里过，不算挡
    const lo = o.lo, hi = o.hi;
    let tEnter = 0, tExit = len;
    let ok = true;
    for (let k = 0; k < 3; k++) {
      const o0 = a[k], d = u[k];
      if (Math.abs(d) < 1e-8) {
        if (o0 < lo[k] - rad || o0 > hi[k] + rad) { ok = false; break; }
      } else {
        let t1 = (lo[k] - rad - o0) / d, t2 = (hi[k] + rad - o0) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tEnter = Math.max(tEnter, t1);
        tExit = Math.min(tExit, t2);
      }
    }
    if (ok && tEnter <= tExit && tExit > 0.05 && tEnter < len - 0.05) return true;
  }
  return false;
}

/** 返回需要补的轴线段（世界坐标，含端点索引用于排除自身） */
export function axleSegments(list, prePlan) {
  const norm = list.map((d, i) => ({ ...d, id: d.id ?? `#${i}` }));
  const plan = prePlan || buildDrivetrain(norm);
  const byId = new Map(plan.parts.map(p => [p.id, p]));
  const out = [];
  const seen = new Set();
  for (const e of plan.edges) {
    if (e.flip) continue;
    const A = byId.get(e.a), B = byId.get(e.b);
    if (!A || !B || !A.axis || !B.axis) continue;
    if (isRotorId(A.id) || isRotorId(B.id)) continue;
    const key = String(e.a) < String(e.b) ? e.a + '|' + e.b : e.b + '|' + e.a;
    if (seen.has(key)) continue;
    seen.add(key);
    const ca = A.center, cb = B.center;
    const ax = A.axis;
    const dx = cb[0] - ca[0], dy = cb[1] - ca[1], dz = cb[2] - ca[2];
    const along = dx * ax[0] + dy * ax[1] + dz * ax[2];
    const perp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
    if (Math.abs(along) < 0.6) continue;   // 本来就有可见轴 / 紧贴，不必补
    if (perp > MAX_PERP) continue;         // 错心过大视为假耦合，跳过（蓝图重排去解决）
    out.push({ a: ca, b: cb, ai: e.a, bi: e.b });
  }
  // 补充：传动图没把「隔了 >2.8 格、但中间有同轴线旋转件」的两件直接连边，
  // 可真实机器里它们就是同一根长轴的两段（如 凸轮↔飞轮↔轴承）。
  // 这里把这种「同轴、错心≤MAX_PERP、间距≤3.5、不被旋转实体挡」的配对也补一根轴。
  const rotators = plan.parts.filter(p => p.axis && !isRotorId(p.id));
  for (let i = 0; i < rotators.length; i++) {
    for (let j = i + 1; j < rotators.length; j++) {
      const A = rotators[i], B = rotators[j];
      if (Math.abs(A.axis[0] * B.axis[0] + A.axis[1] * B.axis[1] + A.axis[2] * B.axis[2]) < 0.9) continue;
      const dx = B.center[0] - A.center[0], dy = B.center[1] - A.center[1], dz = B.center[2] - A.center[2];
      const along = dx * A.axis[0] + dy * A.axis[1] + dz * A.axis[2];
      const aw = Math.abs(along);
      if (aw < 0.6 || aw > 3.5) continue;
      const perp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
      if (perp > MAX_PERP) continue;
      const ka = String(A.id), kb = String(B.id);
      const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: A.center, b: B.center, ai: A.id, bi: B.id });
    }
  }
  return out;
}

function insideBox(p, o) {
  for (let k = 0; k < 3; k++) if (p[k] < o.lo[k] - 1e-6 || p[k] > o.hi[k] + 1e-6) return false;
  return true;
}
/** 从 p 沿 dir 走多远离开 box（slab 法），拿不到就给 Infinity */
function exitParam(p, dir, o) {
  let tExit = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dir[k]) < 1e-8) continue;
    const t = dir[k] > 0 ? (o.hi[k] - p[k]) / dir[k] : (o.lo[k] - p[k]) / dir[k];
    if (t >= 0 && t < tExit) tExit = t;
  }
  return tExit;
}
/**
 * v1.28.1：把轴段「修剪」到自带轴颈零件（曲轴等）的外面。
 * 曲轴两端有轴颈、中段是两片臂夹着曲柄销的**空档**，一根外来轴从中间穿过去，
 * 反而比曲轴本身更像"一根直杆"——这正是用户看到的银灰圆杆。
 * 规则：端点落在曲轴体内的，沿轴推到它的端面外；两端都在体内的，这根轴整根不要。
 */
function pushOutOfBoxes(a, b, boxes) {
  if (!boxes.length) return [a, b];
  let A = a.slice(), B = b.slice();
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz) || 1;
  const u = [dx / L, dy / L, dz / L];
  for (const o of boxes) {
    const inA = insideBox(A, o), inB = insideBox(B, o);
    if (inA && inB) return null;                    // 整段埋在曲轴里，没必要画
    if (inA) {
      const t = exitParam(A, u, o);
      if (t < Infinity) A = [A[0] + u[0] * (t + 0.02), A[1] + u[1] * (t + 0.02), A[2] + u[2] * (t + 0.02)];
    }
    if (inB) {
      const t = exitParam(B, [-u[0], -u[1], -u[2]], o);
      if (t < Infinity) B = [B[0] - u[0] * (t + 0.02), B[1] - u[1] * (t + 0.02), B[2] - u[2] * (t + 0.02)];
    }
  }
  return [A, B];
}

/** 计算每张积木的世界 AABB（含 ox/oy/oz 微调），用于轴穿越裁剪 */function brickAABBs(list) {
  return list.map(d => {
    const sh = shapeRot(getShape(d.shapeId), d.rx || 0, d.ry || 0, d.rz || 0);
    const bb = shapeBounds(sh);
    // shapeBounds 给的是 w(沿x) / h(沿y) / d(沿z)，这里按几何原点在格子中心处理
    return { shapeId: d.shapeId,
             lo: [d.x - bb.w / 2 + (d.ox || 0), d.y + (d.oy || 0), d.z - bb.d / 2 + (d.oz || 0)],
             hi: [d.x + bb.w / 2 + (d.ox || 0), d.y + bb.h + (d.oy || 0), d.z + bb.d / 2 + (d.oz || 0)] };
  });
}

/**
 * 每个「受驱动的旋转件」都补一段穿轴：一根细轴沿它的转轴从轮毂孔里穿过去，
 * 略微探出两头。这样任何在动的零件看上去都实实在在骑在一根轴上，不会是悬空自转。
 *
 * v1.26 改动：
 *  · 轴半径按配合孔来（0.176），不再细得像根针；轴端正好落在孔口，看得出是"配"进去的。
 *  · 不再把两根不同心的轮毂用一根斜轴硬连（那是"斜插"）。
 *    改为：每根轴沿**自己的轴心**朝同轴方向的邻件延伸，两根轴像接力一样对着，
 *    轴向连通、但各自笔直——这正是两根同心度略差的轴用联轴器对接的真实样子。
 *  · 延伸前做实体遮挡检查（按轴半径膨胀），撞到别的实体就把这一段缩短，绝不新造穿模。
 */
function addHubStubs(g, list, plan) {
  const aabbs = brickAABBs(list);
  const ownBoxes = aabbs.filter((_, i) => list[i] && OWN_JOURNAL.has(list[i].shapeId));
  const idxOf = new Map();
  list.forEach((d, i) => idxOf.set(String(d.id ?? `#${i}`), i));

  // 只有"动力组里的从动件"才需要轴；静止支承件（轴承座/机架）不画轴
  const driven = new Set();
  for (const grp of plan.groups) {
    if (!grp.hasSource) continue;
    for (const m of grp.members) driven.add(String(m.id));
  }
  const rotators = plan.parts.filter(p => p.axis && !isRotorId(p.id));
  const co = new Map(); // id → 与它**接近同心**（错心≤0.35）的最近邻件的轴向距离
  for (const a of rotators) {
    const arr = [];
    for (const b of rotators) {
      if (a === b) continue;
      const d = Math.abs(a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1] + a.axis[2] * b.axis[2]);
      if (d < 0.9) continue;
      const dx = b.center[0] - a.center[0], dy = b.center[1] - a.center[1], dz = b.center[2] - a.center[2];
      const along = dx * a.axis[0] + dy * a.axis[1] + dz * a.axis[2];
      const perp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
      // 只朝「基本同心」的邻件延伸；错心大的不伸，否则轴端会悬在半空
      if (perp > 0.35 || Math.abs(along) > 3.6) continue;
      arr.push(Math.abs(along));
    }
    if (arr.length) co.set(String(a.id), Math.min(...arr));
  }

  for (const m of rotators) {
    if (!driven.has(String(m.id))) continue;
    // 自带轴颈的零件（曲轴等）跳过：外挂的粗钢轴会把它的轴颈包住。
    // 注意 m.def 不是零件本身（拿不到 shapeId），必须按 id 回查零件表。
    const ownIdx = idxOf.get(String(m.id));
    const ownShape = ownIdx !== undefined ? list[ownIdx].shapeId : null;
    if (OWN_JOURNAL.has(ownShape)) continue;
    const ax = m.axis;
    if (m.staticPart || m.def.oscillate) continue;
    const axAbs = [Math.abs(ax[0]), Math.abs(ax[1]), Math.abs(ax[2])];
    const ai = axAbs[0] > 0.9 ? 0 : axAbs[1] > 0.9 ? 1 : 2;
    // 沿轴向的整数格跨度：轴至少要穿过这个厚度
    let lo = Infinity, hi = -Infinity;
    for (const c of m.cells) { const v = ai === 0 ? c.x : ai === 1 ? c.y : c.z; if (v < lo) lo = v; if (v > hi) hi = v; }
    const extent = (hi - lo + 1);
    // 目标半长：先够穿过自身厚度，再朝最近的同轴邻件延伸一半的轴向缝（最多 1.5 格）
    const gapHalf = co.has(String(m.id)) ? Math.min(1.5, co.get(String(m.id)) / 2) : 0;
    let half = Math.max(extent / 2 + 0.16, gapHalf);
    const own = idxOf.get(String(m.id));
    const others = aabbs.filter((_, i) => i !== own);
    const c = m.center;
    // 遮挡检查：撞到实体就一档档缩短，最短退到"刚好穿出自身"（此时一定在孔里）
    const minHalf = extent / 2 + 0.04;
    let ok = false;
    while (half >= minHalf) {
      const p1 = [c[0] - ax[0] * half, c[1] - ax[1] * half, c[2] - ax[2] * half];
      const p2 = [c[0] + ax[0] * half, c[1] + ax[1] * half, c[2] + ax[2] * half];
      if (!segmentBlocked(p1, p2, others, SHAFT_R)) { ok = true; break; }
      half *= 0.72;
    }
    if (!ok) half = minHalf;
    let p1 = [c[0] - ax[0] * half, c[1] - ax[1] * half, c[2] - ax[2] * half];
    let p2 = [c[0] + ax[0] * half, c[1] + ax[1] * half, c[2] + ax[2] * half];
    // 修剪到曲轴这类自带轴颈零件的外面：不许从它的两片臂之间穿过去
    const trimmed = pushOutOfBoxes(p1, p2, ownBoxes);
    if (!trimmed) continue;
    [p1, p2] = trimmed;
    const va = new THREE.Vector3(...p1), vb = new THREE.Vector3(...p2);
    const len = va.distanceTo(vb);
    if (len < 0.06) continue;
    const geo = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, len, 16);
    const mesh = new THREE.Mesh(geo, axleMat());
    mesh.position.copy(va).lerp(vb, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    mesh.castShadow = true;
    mesh.userData.src = 'stub:' + m.id + ':' + (ownShape || '?');
    g.add(mesh);
  }
}

/** 生成整机组装的桥接轴 THREE.Group（静止子网格，零件绕它转，正是真实场景） */
export function buildAxleGroup(list, excludeIds = new Set()) {
  const g = new THREE.Group();
  g.name = 'axleGroup';
  const norm = list.map((d, i) => ({ ...d, id: d.id ?? `#${i}` }));
  const plan = buildDrivetrain(norm);
  // 先给每个受驱动件补一根穿轴——保证没有"悬空自转"的零件
  addHubStubs(g, list, plan);
  const segs = axleSegments(list, plan);
  const aabbs = brickAABBs(list);
  // 自带轴颈的零件（曲轴等）的包围盒：穿过它们的桥接轴要退到轴颈里，不许比轴颈粗
  const ownBoxes = aabbs.filter((_, i) => list[i] && OWN_JOURNAL.has(list[i].shapeId));
  const idOf = i => norm[i].id;
  for (const s of segs) {
    // 排除端点自身那两件，其余积木的 AABB 用于穿越裁剪
    const others = aabbs.filter((_, i) => idOf(i) !== s.ai && idOf(i) !== s.bi);
    if (segmentBlocked(s.a, s.b, others, SHAFT_R)) continue;
    const a = new THREE.Vector3(s.a[0], s.a[1], s.a[2]);
    const b = new THREE.Vector3(s.b[0], s.b[1], s.b[2]);
    const len = a.distanceTo(b);
    if (len < 0.3) continue;
    const shrink = Math.min(0.1, len * 0.1);
    a.addScaledVector(b.clone().sub(a).normalize(), shrink);
    b.addScaledVector(a.clone().sub(b).normalize(), -shrink);
    // 同样修剪到曲轴端面外
    const trimmed = pushOutOfBoxes([a.x, a.y, a.z], [b.x, b.y, b.z], ownBoxes);
    if (!trimmed) continue;
    const ra = new THREE.Vector3(...trimmed[0]), rb = new THREE.Vector3(...trimmed[1]);
    const realLen = ra.distanceTo(rb);
    if (realLen < 0.06) continue;
    const geo = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, realLen, 14);
    const mesh = new THREE.Mesh(geo, axleMat());
    mesh.position.copy(ra).lerp(rb, 0.5);
    const dir = rb.clone().sub(ra).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.src = 'seg:' + s.ai + '->' + s.bi;
    g.add(mesh);
  }
  return g;
}
