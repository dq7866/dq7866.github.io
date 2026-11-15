// surface.js — 解剖网格的「重构面」处理
//
// CT 分割出来的器官网格面数有限（胃只有 2400 面、心 6800 面），特写时轮廓
// 会露出明显的折线和小平面。这里用三步把它变成可特写的曲面：
//   1) 焊接重复顶点（分割结果常有重合点，不焊平滑会沿缝裂开）
//   2) 中点细分（1 面 → 4 面，按原始面数自适应 1~2 次）
//   3) Taubin 平滑（λ/μ 交替，去台阶但几乎不缩体积，保住脑沟回、肠皱褶）
// 结果只在视频工坊里用，退出即还原，不影像常规视图。
import * as THREE from '../lib/three.module.js';

/* ---------------- 顶点焊接 ---------------- */
// 位置量化到 tol 后做键，完全重合的点合并；同时把 color 一起带过去。
// color 可能是 Int8/Uint8 规范化存储（GLTF 常见），要还原成 0~1 再写入新数组。
function weld(geo, tol = 2.5e-5) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const idx = geo.index;
  const n = pos.count;
  const P = pos.array;
  const C = col ? col.array : null;
  const cs = col ? col.itemSize : 0;
  // Int8 规范化除以 127，Uint8 除以 255；Float 存储本来就是 0~1
  let cDiv = 1;
  if (col && col.normalized) {
    cDiv = col.array instanceof Int8Array ? 127 : 255;
  }
  const map = new Map();
  const remap = new Int32Array(n);
  const outP = [], outC = [];
  const inv = 1 / tol;
  for (let i = 0; i < n; i++) {
    const x = Math.round(P[i * 3] * inv);
    const y = Math.round(P[i * 3 + 1] * inv);
    const z = Math.round(P[i * 3 + 2] * inv);
    const key = x + ',' + y + ',' + z;
    let j = map.get(key);
    if (j === undefined) {
      j = outP.length / 3;
      outP.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (C) for (let k = 0; k < cs; k++) outC.push(C[i * cs + k] / cDiv);
      map.set(key, j);
    }
    remap[i] = j;
  }
  if (outP.length / 3 === n) return null;   // 没有重合点，让调用方走克隆路径

  const src = idx ? idx.array : null;
  const tri = src ? src.length : n;
  const outI = [];
  for (let t = 0; t < tri; t += 3) {
    const a = remap[src ? src[t] : t];
    const b = remap[src ? src[t + 1] : t + 1];
    const c = remap[src ? src[t + 2] : t + 2];
    if (a === b || b === c || a === c) continue;   // 退化面（焊接后塌掉）
    outI.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  if (C) g.setAttribute('color', new THREE.Float32BufferAttribute(outC, cs));
  g.setIndex(outI);
  return g;
}

/* ---------------- 剔除嵌套寄生壳 ---------------- */
// CT 分割网格常带一层独立的「内壳」（心腔内壁等）：顶点各自独立、边各自流形，
// 绕向传播管不到它。内壳与外壳穿插，在特写下表现为满屏的三角形碎斑。
// 判定不能用包围盒（颅骨的面骨也在颅盖包围盒里，会误删！）——
// 用射线：从分量表面沿法线朝外发射，若立即命中「别的分量」，才是被包裹的内壳。
function dropNestedShells(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  if (!idx) return geo;
  const I = idx.array;
  const nv = pos.count;
  const nf = I.length / 3;

  // 并查集：边连接的顶点属同一分量
  const par = new Int32Array(nv);
  for (let i = 0; i < nv; i++) par[i] = i;
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.length; t += 3) {
    const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]);
    if (a !== b) par[a] = b;
    if (a !== c && b !== c) par[b] = c;
  }
  const compOf = new Map();           // root -> comp
  const comps = [];
  const faceComp = new Int32Array(nf);
  const P = pos.array;
  for (let f = 0; f < nf; f++) {
    const root = find(I[f * 3]);
    let comp = compOf.get(root);
    if (!comp) {
      comp = { id: comps.length, faces: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      compOf.set(root, comp);
      comps.push(comp);
    }
    comp.faces.push(f);
    faceComp[f] = comp.id;
    for (let e = 0; e < 3; e++) {
      const p3 = I[f * 3 + e] * 3;
      for (let k = 0; k < 3; k++) {
        if (P[p3 + k] < comp.min[k]) comp.min[k] = P[p3 + k];
        if (P[p3 + k] > comp.max[k]) comp.max[k] = P[p3 + k];
      }
    }
  }
  if (comps.length < 2) return geo;   // 单分量，无事可做

  // 廉价预筛：中心落在「更大分量」包围盒内的才值得做射线测试
  const dim = c => [c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]];
  const center = c => [(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2];
  const cand = [];
  for (const a of comps) {
    const ca = center(a), da = dim(a);
    const maxA = Math.max(da[0], da[1], da[2]);
    for (const b of comps) {
      if (a === b) continue;
      const db = dim(b);
      if (Math.max(db[0], db[1], db[2]) <= maxA * 1.1) continue;
      const cb = center(b);
      const inside = ca[0] > cb[0] - db[0] * 0.42 && ca[0] < cb[0] + db[0] * 0.42 &&
                     ca[1] > cb[1] - db[1] * 0.42 && ca[1] < cb[1] + db[1] * 0.42 &&
                     ca[2] > cb[2] - db[2] * 0.42 && ca[2] < cb[2] + db[2] * 0.42;
      if (inside) { cand.push(a); break; }
    }
  }
  if (!cand.length) return geo;

  // 射线遮挡测试：朝外发射，多数命中其它分量 = 被包裹的内壳
  const mesh = new THREE.Mesh(geo);
  geo.computeBoundingSphere();
  const ray = new THREE.Raycaster();
  const A = new THREE.Vector3(), Bv = new THREE.Vector3(), Cv = new THREE.Vector3(),
        cen = new THREE.Vector3(), nor = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(),
        org = new THREE.Vector3();
  const drop = new Set();
  for (const a of cand) {
    const da = dim(a);
    const far = Math.max(da[0], da[1], da[2]) * 1.5;
    const faces = a.faces;
    const samples = Math.min(8, faces.length);
    let hits = 0, tested = 0;
    for (let s = 0; s < samples; s++) {
      const f = faces[Math.floor(s * faces.length / samples)] * 3;
      const ia = I[f] * 3, ib = I[f + 1] * 3, ic = I[f + 2] * 3;
      A.set(P[ia], P[ia + 1], P[ia + 2]);
      Bv.set(P[ib], P[ib + 1], P[ib + 2]);
      Cv.set(P[ic], P[ic + 1], P[ic + 2]);
      e1.subVectors(Bv, A); e2.subVectors(Cv, A);
      nor.crossVectors(e1, e2).normalize();
      if (!isFinite(nor.x) || nor.lengthSq() < 0.5) continue;
      cen.copy(A).add(Bv).add(Cv).multiplyScalar(1 / 3);
      org.copy(cen).addScaledVector(nor, far * 0.01);
      ray.set(org, nor);
      ray.far = far;
      const list = ray.intersectObject(mesh, false);
      for (const h of list) {
        if (h.faceIndex === undefined) continue;
        if (faceComp[h.faceIndex] !== a.id) { hits++; break; }
      }
      tested++;
    }
    if (tested && hits / tested >= 0.6) drop.add(a.id);
  }
  if (!drop.size) return geo;

  const keep = [];
  for (let f = 0; f < nf; f++) {
    if (drop.has(faceComp[f])) continue;
    keep.push(I[f * 3], I[f * 3 + 1], I[f * 3 + 2]);
  }
  if (!keep.length || keep.length === I.length) return geo;
  const g = geo.clone();
  g.setIndex(keep);
  return g;
}

/* ---------------- 绕向一致性（消灭黑斑的关键） ---------------- */
// CT 分割网格常混有绕向相反的面片：顶点法线在对立绕向的交界处相互抵消趋零，
// 渲染出来就是满屏的黑色碎三角。这里做 BFS 传播：相邻两个面若以相同方向穿过
// 共享边，说明绕向矛盾，把后者翻转。只假设流形一致，不假设凸——肠管这种
// 环形结构也安全。
function orientFaces(geo) {
  const idx = geo.index;
  if (!idx) return geo;
  const I = idx.array;
  const P = geo.attributes.position.array;
  const nf = I.length / 3;

  // 无向边 → 邻接面列表（流形边只有 2 个面；3+ 的非流形边跳过）
  const edgeMap = new Map();
  const ek = (a, b) => a < b ? a * 16777216 + b : b * 16777216 + a;
  const adj = Array.from({ length: nf }, () => []);
  for (let f = 0; f < nf; f++) {
    for (let e = 0; e < 3; e++) {
      const a = I[f * 3 + e], b = I[f * 3 + (e + 1) % 3];
      if (a === b) continue;
      const k = ek(a, b);
      let list = edgeMap.get(k);
      if (!list) { list = []; edgeMap.set(k, list); }
      list.push(f);
    }
  }
  for (const list of edgeMap.values()) {
    if (list.length === 2) {
      adj[list[0]].push(list[1]);
      adj[list[1]].push(list[0]);
    }
  }

  // 某面某边当前的行进方向（读取实时索引，翻转后自动跟随）
  const dirOf = (f, a, b) => {
    for (let e = 0; e < 3; e++) {
      const u = I[f * 3 + e], v = I[f * 3 + (e + 1) % 3];
      if (u === a && v === b) return 1;
      if (u === b && v === a) return -1;
    }
    return 0;
  };
  const flip = f => {
    const t = f * 3;
    const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp;
  };

  const seen = new Uint8Array(nf);
  const stack = [];
  for (let seed = 0; seed < nf; seed++) {
    if (seen[seed]) continue;
    seen[seed] = 1;
    stack.length = 0; stack.push(seed);
    const compFaces = [seed];
    while (stack.length) {
      const f = stack.pop();
      for (let e = 0; e < 3; e++) {
        const a = I[f * 3 + e], b = I[f * 3 + (e + 1) % 3];
        if (a === b) continue;
        const list = edgeMap.get(ek(a, b));
        if (!list || list.length !== 2) continue;
        const g = list[0] === f ? list[1] : list[0];
        if (seen[g]) continue;
        // 同方向穿过共享边 = 绕向矛盾 → 翻转邻居
        const dA = dirOf(f, a, b);
        const dB = dirOf(g, a, b);
        if (dA && dB && dA === dB) flip(g);
        seen[g] = 1;
        stack.push(g);
        compFaces.push(g);
      }
    }
    // 整体朝向判定：沿法线朝外发射，若多数立即打到「同一分量的另一侧」，
    // 说明整个分量绕向朝内，统一翻转。（质心投票对凹形骨板会误判，弃用）
    const compFaceSet = new Set(compFaces);
    let hits = 0, tested = 0;
    {
      const mesh = new THREE.Mesh(geo);
      geo.computeBoundingSphere();
      const ray = new THREE.Raycaster();
      const A = new THREE.Vector3(), Bv = new THREE.Vector3(), Cv = new THREE.Vector3(),
            cen = new THREE.Vector3(), nor = new THREE.Vector3(),
            e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), org = new THREE.Vector3();
      let diag = geo.boundingSphere ? geo.boundingSphere.radius * 2 : 1;
      const faces = compFaces;
      const samples = Math.min(10, faces.length);
      for (let s = 0; s < samples; s++) {
        const f = faces[Math.floor(s * faces.length / samples)] * 3;
        const ia = I[f] * 3, ib = I[f + 1] * 3, ic = I[f + 2] * 3;
        A.set(P[ia], P[ia + 1], P[ia + 2]);
        Bv.set(P[ib], P[ib + 1], P[ib + 2]);
        Cv.set(P[ic], P[ic + 1], P[ic + 2]);
        e1.subVectors(Bv, A); e2.subVectors(Cv, A);
        nor.crossVectors(e1, e2);
        if (nor.lengthSq() < 1e-20) continue;
        nor.normalize();
        cen.copy(A).add(Bv).add(Cv).multiplyScalar(1 / 3);
        org.copy(cen).addScaledVector(nor, diag * 0.005);
        ray.set(org, nor);
        ray.far = diag * 1.2;
        const list = ray.intersectObject(mesh, false);
        for (const h of list) {
          if (h.faceIndex === undefined) continue;
          if (compFaceSet.has(h.faceIndex)) { hits++; break; }
        }
        tested++;
      }
    }
    if (tested && hits / tested >= 0.55) for (const f of compFaces) flip(f);
  }
  idx.needsUpdate = true;
  return geo;
}

/* ---------------- 中点细分 ---------------- */
// 每条边缓存一个中点，保证相邻三角形共用同一个新顶点（不然会出现裂缝）
function subdivideOnce(geo) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const idx = geo.index;
  const P = pos.array;
  const C = col ? col.array : null;
  const cs = col ? col.itemSize : 0;
  const n = pos.count;
  const I = idx ? idx.array : null;
  const tri = I ? I.length : n;

  const outP = [];
  for (let i = 0; i < n * 3; i++) outP.push(P[i]);
  const outC = C ? Array.from(C) : null;
  const edge = new Map();
  const outI = [];

  const mid = (a, b) => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const key = lo * n + hi;
    let m = edge.get(key);
    if (m === undefined) {
      m = outP.length / 3;
      outP.push(
        (P[lo * 3] + P[hi * 3]) * 0.5,
        (P[lo * 3 + 1] + P[hi * 3 + 1]) * 0.5,
        (P[lo * 3 + 2] + P[hi * 3 + 2]) * 0.5
      );
      if (C) for (let k = 0; k < cs; k++) outC.push((C[lo * cs + k] + C[hi * cs + k]) * 0.5);
      edge.set(key, m);
    }
    return m;
  };

  for (let t = 0; t < tri; t += 3) {
    const a = I ? I[t] : t;
    const b = I ? I[t + 1] : t + 1;
    const c = I ? I[t + 2] : t + 2;
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    outI.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  if (outC) g.setAttribute('color', new THREE.Float32BufferAttribute(outC, cs));
  g.setIndex(outI);
  return g;
}

/* ---------------- Taubin 平滑 ---------------- */
// 拉普拉斯平滑会缩体积，正负系数交替（Taubin λ|μ）可抵消收缩，
// 台阶和折线被抹平，而脑沟、肠管的起伏还能留住。
function taubin(geo, iters = 3, lambda = 0.55, mu = -0.58) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  if (!idx) return geo;
  const P = pos.array;
  const I = idx.array;
  const n = pos.count;

  // CSR 邻接表（槽位按 index 出现次数分配，退化面会让部分槽位空着，用 -1 标记）
  const deg = new Int32Array(n);
  for (let i = 0; i < I.length; i++) deg[I[i]]++;
  const off = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) off[i + 1] = off[i] + deg[i];
  const adj = new Int32Array(off[n]).fill(-1);
  const cur = off.slice(0, n);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (a === b || b === c || a === c) continue;   // 退化面不产生邻接
    adj[cur[a]++] = b; adj[cur[a]++] = c;
    adj[cur[b]++] = a; adj[cur[b]++] = c;
    adj[cur[c]++] = a; adj[cur[c]++] = b;
  }

  const tmp = new Float32Array(n * 3);
  const step = k => {
    for (let i = 0; i < n; i++) {
      const s = off[i], e = off[i + 1];
      let d = 0, ax = 0, ay = 0, az = 0;
      for (let j = s; j < e; j++) {
        const q = adj[j];
        if (q < 0) continue;
        const p3 = q * 3;
        ax += P[p3]; ay += P[p3 + 1]; az += P[p3 + 2];
        d++;
      }
      if (!d) {
        tmp[i * 3] = P[i * 3]; tmp[i * 3 + 1] = P[i * 3 + 1]; tmp[i * 3 + 2] = P[i * 3 + 2];
        continue;
      }
      const f = 1 / d;
      tmp[i * 3] = P[i * 3] + k * (ax * f - P[i * 3]);
      tmp[i * 3 + 1] = P[i * 3 + 1] + k * (ay * f - P[i * 3 + 1]);
      tmp[i * 3 + 2] = P[i * 3 + 2] + k * (az * f - P[i * 3 + 2]);
    }
    P.set(tmp);
  };

  for (let it = 0; it < iters; it++) {
    step(lambda);
    step(mu);
  }
  pos.needsUpdate = true;
  return geo;
}

/* ---------------- 对外：按面数自适应重构 ---------------- */
const cache = new WeakMap();

/**
 * @param {THREE.BufferGeometry} src 原始几何
 * @returns {THREE.BufferGeometry} 重构后的几何（同源只算一次）
 */
export function refine(src) {
  const hit = cache.get(src);
  if (hit) return hit;

  const tri = src.index ? src.index.count / 3 : src.attributes.position.count / 3;
  let g;
  try {
    g = weld(src);
    if (!g) {
      // 没有重合点可焊。也必须克隆：原几何的 normal 可能是 Int8 规范化存储，
      // 直接在其上 computeVertexNormals 会因 TypedArray 整数截断把法线全变 0（渲染全黑），
      // 且原地修改会污染常规视图使用的原几何。
      g = src.clone();
    }
    // 先剔除嵌套寄生壳（内层壳会与外壳穿插出碎斑），再统一绕向、细分
    g = dropNestedShells(g);
    orientFaces(g);
    g.deleteAttribute('normal');
    // 面数少的多补几刀：细分越密，法线插值越细，褶皱翻折处的碎片越小越淡
    const rounds = tri < 7000 ? 3 : (tri < 24000 ? 1 : 0);
    for (let i = 0; i < rounds; i++) g = subdivideOnce(g);
    // 细分后 2~3 轮 Taubin：刚好抹掉台阶，又不会把器官揉成一坨
    taubin(g, rounds ? 3 : 2);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
  } catch (e) {
    console.warn('[surface] refine failed, fallback to raw', e);
    g = src;
  }
  cache.set(src, g);
  return g;
}
