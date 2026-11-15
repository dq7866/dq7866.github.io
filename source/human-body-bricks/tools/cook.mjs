// cook.mjs — 离线烘焙：把两个解剖 GLB 处理成一个干净的标准 GLB
//   1) 反量化 + 世界变换（统一到米）
//   2) 按「形状」合并同部位的 40+ 块网格
//   3) 网格简化（控制体积，保住形状）
//   4) 每个形状以自身包围盒中心为原点，中心写进节点平移
//   5) 全身对齐：脚底 y=0、左右/前后居中
// 产物：assets/body.glb（无任何扩展，Float32 顶点）
// 用法：node tools/cook.mjs [--ratio=0.3] [--debug]
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from './lib/GLTFLoader.mjs';
import { MeshoptDecoder } from '../lib/meshopt_decoder.module.js';
import { MeshoptSimplifier } from './lib/meshopt_simplifier.module.js';
import { partIdOf } from '../src/asset-map.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const RATIO = Number(args.ratio || 0.30);   // 目标三角形比例（下限，误差优先）
const ERROR = Number(args.error || 0.004); // 简化误差容限（相对部件尺寸），越小越保形
const DEBUG = !!args.debug;
const TARGET_SIZE = Number(args.mb || 4.6); // 期望产物大小(MB)，超出就继续压三角形

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const loadGLB = file => {
  const buf = fs.readFileSync(path.join(ROOT, 'assets', 'source', file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => loader.parse(ab, '', res, rej));
};

// ---------- 属性读取：按 glTF 的归一化规则还原成 GPU 看到的值 ----------
function reader(attr) {
  const { array, itemSize, normalized } = attr;
  let mul = 1;
  if (normalized) {
    if (array instanceof Int8Array) mul = 1 / 127;
    else if (array instanceof Uint8Array) mul = 1 / 255;
    else if (array instanceof Int16Array) mul = 1 / 32767;
    else if (array instanceof Uint16Array) mul = 1 / 65535;
  }
  const stride = attr.isInterleavedBufferAttribute ? attr.data.stride : itemSize;
  const offset = attr.isInterleavedBufferAttribute ? attr.offset : 0;
  const base = attr.isInterleavedBufferAttribute ? attr.data.array : array;
  return {
    count: attr.count,
    itemSize,
    get(i, k) { return base[i * stride + offset + k] * mul; },
  };
}

// 把一层 meshes 烘焙成「每个形状一份 Float32 缓冲」
// residual=true 时，没归到任何形状的结构按大层归入 otherBone / otherMuscle / otherOrgan，
// 保证外形完整（这些在应用里只做视觉填充，不进零件盘、不可拾取）
function bake(scene, source, extraMatrix, residual = false) {
  scene.updateMatrixWorld(true);
  const buckets = new Map();
  let meshes = 0, skipped = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3();

  const residualId = meta => {
    const l = String(meta.layer || '');
    if (l.includes('muscle')) return 'otherMuscle';
    if (l === 'skeleton') return 'otherBone';
    return null;
  };

  scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const meta = o.userData || {};
    const name = meta.name || meta.structure || o.name || '';
    let id = partIdOf(source, name, meta);
    let isResidual = false;
    if (!id) {
      if (!residual) { skipped.push(name); return; }
      id = residualId(meta);
      if (!id) { skipped.push(name); return; }
      isResidual = true;
    }

    const geo = o.geometry;
    const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color;
    if (!P) return;
    const rp = reader(P), rn = N ? reader(N) : null, rc = C ? reader(C) : null;
    // 没有顶点色的数据集（CT 器官）用材质基础色当常量顶点色，保住每个器官自己的颜色
    let flat = null;
    if (!rc && o.material && o.material.color) {
      const c = o.material.color;
      flat = [c.r, c.g, c.b];
    }

    const M = extraMatrix ? extraMatrix.clone().multiply(o.matrixWorld) : o.matrixWorld.clone();
    const NM = new THREE.Matrix3().getNormalMatrix(M);

    const idx = geo.index ? geo.index.array : null;
    const count = idx ? idx.length : rp.count;

    let b = buckets.get(id);
    if (!b) { b = { id, residual: isResidual, pos: [], nrm: [], col: [], idx: [], base: 0, src: [], tris: 0 }; buckets.set(id, b); }
    b.src.push(name);

    for (let i = 0; i < rp.count; i++) {
      v.set(rp.get(i, 0), rp.get(i, 1), rp.get(i, 2)).applyMatrix4(M);
      b.pos.push(v.x, v.y, v.z);
      if (rn) {
        n.set(rn.get(i, 0), rn.get(i, 1), rn.get(i, 2)).applyMatrix3(NM).normalize();
        b.nrm.push(n.x, n.y, n.z);
      } else b.nrm.push(0, 1, 0);
      if (rc) b.col.push(rc.get(i, 0), rc.get(i, 1), rc.get(i, 2), rc.itemSize > 3 ? rc.get(i, 3) : 1);
      else if (flat) b.col.push(flat[0], flat[1], flat[2], 1);
      else b.col.push(1, 1, 1, 1);
    }
    for (let i = 0; i < count; i++) b.idx.push((idx ? idx[i] : i) + b.base);
    b.base += rp.count;
    b.tris += count / 3;
    meshes++;
  });

  for (const b of buckets.values()) {
    b.pos = new Float32Array(b.pos);
    b.nrm = new Float32Array(b.nrm);
    b.col = new Float32Array(b.col);
    b.idx = new Uint32Array(b.idx);
  }
  return { buckets, meshes, skipped };
}

// ---------- 简化 + 居中 ----------
async function simplifyPart(b, targetTris, error) {
  const verts = b.pos.length / 3;
  const pos = new Float32Array(verts * 3);
  pos.set(b.pos);

  // 先按位置焊接（同一位置的多份顶点合并），否则边不连续、简化会留裂缝
  const map = new Map(), remap = new Uint32Array(verts);
  let next = 0;
  const welded = new Float32Array(verts * 3);
  for (let i = 0; i < verts; i++) {
    const k = `${Math.round(pos[i * 3] * 2e5)},${Math.round(pos[i * 3 + 1] * 2e5)},${Math.round(pos[i * 3 + 2] * 2e5)}`;
    let j = map.get(k);
    if (j === undefined) { j = next++; map.set(k, j); welded[j * 3] = pos[i * 3]; welded[j * 3 + 1] = pos[i * 3 + 1]; welded[j * 3 + 2] = pos[i * 3 + 2]; }
    remap[i] = j;
  }
  const widx = new Uint32Array(b.idx.length);
  for (let i = 0; i < b.idx.length; i++) widx[i] = remap[b.idx[i]];
  const wpos = welded.subarray(0, next * 3);

  const target = Math.max(3, Math.round(targetTris * 3));
  const [sidx, err] = MeshoptSimplifier.simplify(widx, wpos, 3, Math.min(target, widx.length), error, ['LockBorder']);
  const useIdx = sidx.length < widx.length ? sidx : widx;

  const uverts = next;
  const uNrm = new Float32Array(uverts * 3), uCol = new Float32Array(uverts * 4);
  for (let i = 0; i < verts; i++) {
    const j = remap[i];
    if (uNrm[j * 3] === 0 && uNrm[j * 3 + 1] === 0 && uNrm[j * 3 + 2] === 0) {
      uNrm[j * 3] = b.nrm[i * 3]; uNrm[j * 3 + 1] = b.nrm[i * 3 + 1]; uNrm[j * 3 + 2] = b.nrm[i * 3 + 2];
      uCol[j * 4] = b.col[i * 4]; uCol[j * 4 + 1] = b.col[i * 4 + 1]; uCol[j * 4 + 2] = b.col[i * 4 + 2]; uCol[j * 4 + 3] = b.col[i * 4 + 3];
    }
  }
  // 法线重新归一化（焊接后可能没单位长度）
  for (let i = 0; i < uverts; i++) {
    const x = uNrm[i * 3], y = uNrm[i * 3 + 1], z = uNrm[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    uNrm[i * 3] = x / l; uNrm[i * 3 + 1] = y / l; uNrm[i * 3 + 2] = z / l;
    if (l === 1 && x === 0 && y === 0 && z === 0) { uNrm[i * 3 + 1] = 1; }
  }

  // 压实：简化只改索引，被丢弃的顶点仍占空间，这里只保留真正被引用的顶点
  const used = new Map();
  for (let i = 0; i < useIdx.length; i++) {
    const o = useIdx[i];
    if (!used.has(o)) used.set(o, used.size);
  }
  const n = used.size;
  const cpos = new Float32Array(n * 3), cnrm = new Float32Array(n * 3), ccol = new Float32Array(n * 4);
  for (const [o, j] of used) {
    cpos[j * 3] = wpos[o * 3]; cpos[j * 3 + 1] = wpos[o * 3 + 1]; cpos[j * 3 + 2] = wpos[o * 3 + 2];
    cnrm[j * 3] = uNrm[o * 3]; cnrm[j * 3 + 1] = uNrm[o * 3 + 1]; cnrm[j * 3 + 2] = uNrm[o * 3 + 2];
    ccol[j * 4] = uCol[o * 4]; ccol[j * 4 + 1] = uCol[o * 4 + 1]; ccol[j * 4 + 2] = uCol[o * 4 + 2]; ccol[j * 4 + 3] = uCol[o * 4 + 3];
  }
  const cidx = new Uint32Array(useIdx.length);
  for (let i = 0; i < useIdx.length; i++) cidx[i] = used.get(useIdx[i]);

  return { pos: cpos, nrm: cnrm, col: ccol, idx: cidx, err, before: widx.length / 3, after: cidx.length / 3 };
}

// ---------- GLB 写出 ----------
function buildGLB(parts, outFile) {
  const bin = [];
  let binLen = 0;
  const json = {
    asset: { version: '2.0', generator: 'human-body-bricks cook.mjs' },
    scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [],
    materials: [{
      name: 'tissue', doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.0, roughnessFactor: 0.62 },
    }],
  };
  const pushView = (ab, target) => {
    while (binLen % 4) { bin.push(Buffer.alloc(1)); binLen++; }
    const off = binLen;
    bin.push(ab); binLen += ab.length;
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: ab.length, ...(target ? { target } : {}) });
    return json.bufferViews.length - 1;
  };
  const addAcc = (view, comp, count, type, extra = {}) => {
    json.accessors.push({ bufferView: view, componentType: comp, count, type, ...extra });
    return json.accessors.length - 1;
  };

  // 根节点
  json.nodes.push({ name: 'Body', children: [] });
  json.scenes[0].nodes = [0];

  for (const p of parts) {
    const pv = pushView(Buffer.from(p.pos.buffer, p.pos.byteOffset, p.pos.byteLength), 34962);
    const nv = pushView(Buffer.from(p.nrmI8.buffer, p.nrmI8.byteOffset, p.nrmI8.byteLength), 34962);
    const cv = pushView(Buffer.from(p.colU8.buffer, p.colU8.byteOffset, p.colU8.byteLength), 34962);
    const iv = pushView(Buffer.from(p.idx.buffer, p.idx.byteOffset, p.idx.byteLength), 34963);

    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p.pos[i + k]); max[k] = Math.max(max[k], p.pos[i + k]);
    }
    const aP = addAcc(pv, 5126, p.pos.length / 3, 'VEC3', { min, max });
    const aN = addAcc(nv, 5120, p.nrmI8.length / 3, 'VEC3', { normalized: true });
    const aC = addAcc(cv, 5121, p.colU8.length / 4, 'VEC4', { normalized: true });
    const aI = addAcc(iv, 5125, p.idx.length, 'SCALAR');

    json.meshes.push({ name: p.id, primitives: [{ attributes: { POSITION: aP, NORMAL: aN, COLOR_0: aC }, indices: aI, material: 0, mode: 4 }] });
    json.nodes.push({
      name: p.id, mesh: json.meshes.length - 1, translation: p.center,
      ...(p.residual ? { extras: { residual: true } } : {}),
    });
    json.nodes[0].children.push(json.nodes.length - 1);
  }

  const binBuf = Buffer.concat(bin);
  const padded = Buffer.concat([binBuf, Buffer.alloc((4 - binBuf.length % 4) % 4)]);
  json.buffers.push({ byteLength: padded.length });

  let jsonStr = JSON.stringify(json);
  while (jsonStr.length % 4) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  const total = 12 + 8 + jsonBuf.length + 8 + padded.length;
  const head = Buffer.alloc(12);
  head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.write('JSON', 4, 'ascii');
  const bh = Buffer.alloc(8); bh.writeUInt32LE(padded.length, 0); bh.write('BIN\0', 4, 'ascii');

  fs.writeFileSync(outFile, Buffer.concat([head, jh, jsonBuf, bh, padded]));
  return { total, json: jsonBuf.length, bin: padded.length, parts: parts.length };
}

// ---------- CT → Écorché 标定 ----------
const boxOfBucket = b => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < b.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    mn[k] = Math.min(mn[k], b.pos[i + k]); mx[k] = Math.max(mx[k], b.pos[i + k]);
  }
  return { min: mn, max: mx };
};

// 两个开放数据集的体型不同，逐轴缩放会把器官横向撑大（脾就从肋弓侧方穿出来）。
// 这里用等比缩放 + 三个可靠标志对齐：
//   前方 → 胸骨体前缘（保证器官不会顶穿胸壁）
//   下方 → 骨盆下缘
//   横向 → 两髋中心（身体中线）
function computeCTTransform(ecBuckets, ecScene, ctScene) {
  const boxOf = o => new THREE.Box3().setFromObject(o);
  const ecNode = name => {
    const o = ecScene.getObjectByName(name);
    if (!o) throw new Error('Écorché 缺少节点 ' + name);
    return boxOf(o);
  };
  const ctNode = name => {
    const o = ctScene.getObjectByName(name);
    if (!o) throw new Error('CT 缺少节点 ' + name);
    return boxOf(o);
  };
  ctScene.updateMatrixWorld(true);
  ecScene.updateMatrixWorld(true);

  // 等比缩放：C7 → 骶骨 的节段长度比（两侧都是稳定骨性标志）
  const ecC7 = ecNode('Seventh_cervical_vertebra'), ecSac = ecNode('Sacrum');
  const ctC7 = ctNode('vertebrae_C7'), ctSac = ctNode('sacrum');
  const ecSeg = ecC7.getCenter(new THREE.Vector3()).y - ecSac.getCenter(new THREE.Vector3()).y;
  const ctSeg = ctC7.getCenter(new THREE.Vector3()).y - ctSac.getCenter(new THREE.Vector3()).y;
  const s = ecSeg / ctSeg;

  // 前方：胸骨体前缘对齐（略微后收 5mm，留出软骨厚度）
  const ecSternumFront = ecNode('Body_of_sternum').max.z;
  const ctSternumFront = ctNode('sternum').max.z;
  const tz = ecSternumFront - 0.005 - s * ctSternumFront;

  // 下方：骨盆下缘对齐
  const ecPelvisBottom = boxOfBucket(ecBuckets.get('pelvis')).min[1];
  const ctHipBottom = Math.min(ctNode('hip_left').min.y, ctNode('hip_right').min.y, ctSac.min.y);
  const ty = ecPelvisBottom - s * ctHipBottom;

  // 横向：两髋中心对齐到中线
  const ctx = (ctNode('hip_left').getCenter(new THREE.Vector3()).x + ctNode('hip_right').getCenter(new THREE.Vector3()).x) / 2;
  const ecx = (boxOfBucket(ecBuckets.get('pelvis')).min[0] + boxOfBucket(ecBuckets.get('pelvis')).max[0]) / 2;
  const tx = ecx - s * ctx;

  console.log(`CT→Écorché：C7→骶骨 ${(ecSeg * 100).toFixed(1)}cm / ${(ctSeg * 100).toFixed(1)}cm，等比 ${s.toFixed(4)}，平移 ${[tx, ty, tz].map(v => v.toFixed(3)).join('/')}`);

  const M = new THREE.Matrix4().makeScale(s, s, s);
  M.setPosition(tx, ty, tz);
  return M;
}

// ---------- 主流程 ----------
await MeshoptSimplifier.ready;

const ecorche = await loadGLB('ecorche.glb');
const ct = await loadGLB('ct_body.glb');

const ec = bake(ecorche.scene, 'ecorche', null, true);
const CT_TO_EC = computeCTTransform(ec.buckets, ecorche.scene, ct.scene);
const ctk = bake(ct.scene, 'ct', CT_TO_EC, false);
console.log(`Écorché: ${ec.meshes} 网格 → ${ec.buckets.size} 形状  (未映射 ${ec.skipped.length} 个)`);
console.log(`CT     : ${ctk.meshes} 网格 → ${ctk.buckets.size} 形状  (未映射 ${ctk.skipped.length} 个)`);

// 合并两份来源（同名形状以 Écorché 优先）
const merged = new Map(ec.buckets);
for (const [id, b] of ctk.buckets) if (!merged.has(id)) merged.set(id, b);

const list = [...merged.values()];
list.sort((a, b) => b.tris - a.tris);

// 三角面预算：按比例砍，给小块留底。
// 残差层（几百块小肌肉）是身体的「外层皮肤」，压太狠会碎成尖刺，所以额度给得更宽。
const parts = [];
let totalBefore = 0, totalAfter = 0;
for (const b of list) {
  const targetTris = b.residual
    ? Math.min(Math.max(Math.round(b.tris * 0.22), 4000), 70000)
    : Math.min(Math.max(Math.round(b.tris * RATIO), 1200), 26000);
  const r = await simplifyPart(b, targetTris, ERROR);
  totalBefore += r.before; totalAfter += r.after;
  const colU8 = new Uint8Array(r.col.length);
  for (let i = 0; i < r.col.length; i++) colU8[i] = Math.max(0, Math.min(255, Math.round(r.col[i] * 255)));
  const nrmI8 = new Int8Array(r.nrm.length);
  for (let i = 0; i < r.nrm.length; i++) nrmI8[i] = Math.max(-127, Math.min(127, Math.round(r.nrm[i] * 127)));

  parts.push({
    id: b.id, residual: !!b.residual, pos: r.pos, nrm: r.nrm, nrmI8, col: r.col, colU8, idx: r.idx,
    center: [0, 0, 0], _c: null, src: b.src,
    stat: { before: r.before, after: r.after, verts: r.pos.length / 3, meshes: b.src.length, err: +r.err.toFixed(4) },
  });
}

// 器官「装入腔体」：两套数据的头颅/躯干姿态不同，靠整体平移没法同时对齐胸腔和颅腔，
// 所以对已经确定容器的器官再做一次贴合，保证不穿出外壳。
// 颅腔不能用颅骨包围盒代替（那个含面部），取「眼眶以上」的颅骨顶点来估计。
function craniumBox(skull, yMin) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let n = 0;
  for (let i = 0; i < skull.pos.length; i += 3) {
    if (skull.pos[i + 1] < yMin) continue;
    n++;
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], skull.pos[i + k]);
      mx[k] = Math.max(mx[k], skull.pos[i + k]);
    }
  }
  return n > 100 ? { mn, mx, n } : null;
}

function fitInto(parts, organId, box, margin = 0.88, label = '颅腔') {
  const o = parts.find(p => p.id === organId);
  if (!o || !box) return;
  const ob = { mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < o.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    ob.mn[k] = Math.min(ob.mn[k], o.pos[i + k]);
    ob.mx[k] = Math.max(ob.mx[k], o.pos[i + k]);
  }
  const s = Math.min(1, ...[0, 1, 2].map(k => (box.mx[k] - box.mn[k]) * margin / (ob.mx[k] - ob.mn[k])));
  const oc = [0, 1, 2].map(k => (ob.mn[k] + ob.mx[k]) / 2);
  const bc = [0, 1, 2].map(k => (box.mn[k] + box.mx[k]) / 2);
  for (let i = 0; i < o.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    o.pos[i + k] = bc[k] + (o.pos[i + k] - oc[k]) * s;
  }
  console.log(`装入${label} ${organId}：等比 ${s.toFixed(3)}，中心 ${bc.map(v => v.toFixed(3)).join('/')}`);
}

{
  const skull = parts.find(p => p.id === 'skull');
  const eye = parts.find(p => p.id === 'eye');
  if (skull && eye) {
    let eyeMin = Infinity;
    for (let i = 1; i < eye.pos.length; i += 3) eyeMin = Math.min(eyeMin, eye.pos[i]);
    const cb = craniumBox(skull, eyeMin + 0.004);
    if (cb) {
      console.log(`颅腔估计：${cb.n} 个顶点，尺寸 ${[0, 1, 2].map(k => ((cb.mx[k] - cb.mn[k]) * 100).toFixed(1)).join('×')}cm`);
      fitInto(parts, 'brain', cb, 0.9, '颅腔');
    }
  }
}

// 最终自检：胸腔里的器官不能穿出胸廓
{
  const find = id => parts.find(p => p.id === id);
  const boxOf = p => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], p.pos[i + k]); mx[k] = Math.max(mx[k], p.pos[i + k]);
    }
    return { mn, mx };
  };
  // 胸廓已拆成「肋骨」与「胸骨」两块，这里取两者的并集当作胸廓盒子
  const ribParts = ['ribs', 'sternum'].map(find).filter(Boolean);
  if (ribParts.length) {
    const rb = ribParts.reduce((acc, p) => {
      const b = boxOf(p);
      for (let k = 0; k < 3; k++) {
        acc.mn[k] = Math.min(acc.mn[k], b.mn[k]);
        acc.mx[k] = Math.max(acc.mx[k], b.mx[k]);
      }
      return acc;
    }, { mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] });
    const rows = ['lungs', 'heart', 'stomach', 'spleen', 'liver', 'kidney'].map(id => {
      const p = find(id);
      if (!p) return `${id} 缺失`;
      const b = boxOf(p);
      const over = Math.max(...[0, 1, 2].map(k => Math.max(rb.mn[k] - b.mn[k], b.mx[k] - rb.mx[k])));
      return `${id}${over <= 0 ? '✓' : ` 超出${(over * 100).toFixed(1)}cm`}`;
    });
    console.log('胸腔自检:', rows.join('  '));
  }
}

// 每个形状以自身包围盒中心为原点
for (const p of parts) {
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], p.pos[i + k]); max[k] = Math.max(max[k], p.pos[i + k]);
  }
  const c = [0, 1, 2].map(k => (min[k] + max[k]) / 2);
  for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) p.pos[i + k] -= c[k];
  p._c = c;
}

// 全身对齐：脚底 y=0，左右/前后居中
let gmin = [Infinity, Infinity, Infinity], gmax = [-Infinity, -Infinity, -Infinity];
for (const p of parts) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) {
    mn[k] = Math.min(mn[k], p.pos[i + k]); mx[k] = Math.max(mx[k], p.pos[i + k]);
  }
  for (let k = 0; k < 3; k++) {
    gmin[k] = Math.min(gmin[k], p._c[k] + mn[k]);
    gmax[k] = Math.max(gmax[k], p._c[k] + mx[k]);
  }
}
const shift = [-(gmin[0] + gmax[0]) / 2, -gmin[1], -(gmin[2] + gmax[2]) / 2];
for (const p of parts) p.center = [+(p._c[0] + shift[0]).toFixed(5), +(p._c[1] + shift[1]).toFixed(5), +(p._c[2] + shift[2]).toFixed(5)];

const out = args.out ? path.resolve(args.out) : path.join(ROOT, 'assets', 'body.glb');const info = buildGLB(parts, out);

console.log('全身尺寸(m):', [0, 1, 2].map(k => (gmax[k] - gmin[k]).toFixed(3)).join(' × '));
console.log(`三角形 ${totalBefore.toLocaleString()} → ${totalAfter.toLocaleString()} (${(totalAfter / totalBefore * 100).toFixed(0)}%)`);
console.log(`写出 ${out}  ${(info.total / 1048576).toFixed(2)} MB  (json ${(info.json / 1024).toFixed(0)}KB + bin ${(info.bin / 1048576).toFixed(2)}MB)`);
const residualParts = parts.filter(p => p.residual);
if (residualParts.length) {
  console.log('残差层（仅作视觉填充）:', residualParts.map(p => `${p.id} ${p.stat.meshes}网格/${p.stat.after}三角形`).join('，'));
}

if (DEBUG) {
  console.log('\n形状明细:');
  for (const p of parts) {
    console.log(`  ${p.id.padEnd(16)} 网格${String(p.stat.meshes).padStart(3)}  三角形 ${String(p.stat.before).padStart(6)} → ${String(p.stat.after).padStart(6)}  顶点 ${p.stat.verts}  center ${p.center.join(', ')}`);
  }
}

// 元数据（运行时用形状 id 直接对应，不需要再猜名字）
const meta = {
  generatedAt: new Date().toISOString(),
  file: 'assets/body.glb',
  unit: 'meter',
  bounds: {
    min: gmin.map((v, k) => +(v + shift[k]).toFixed(4)),
    max: gmax.map((v, k) => +(v + shift[k]).toFixed(4)),
  },
  shapeCount: parts.length,
  triangles: totalAfter,
  shapes: Object.fromEntries(parts.map(p => [p.id, {
    center: p.center, triangles: p.stat.after, vertices: p.stat.verts, sourceMeshes: p.stat.meshes,
    ...(p.residual ? { residual: true } : {}),
  }])),
  sources: [
    { id: 'ecorche', file: 'ecorche.glb', license: 'CC BY-SA 4.0', author: 'Charles (Charleeh/ecorche)', geometry: 'BodyParts3D + Z-Anatomy' },
    { id: 'ct', file: 'ct_body.glb', license: 'CC BY 4.0', author: 'codepawl/ct-anatomy-glb', geometry: 'TotalSegmentator v2.0.1' },
  ],
};
const metaFile = args.out ? args.out.replace(/\.glb$/, '.meta.json') : path.join(ROOT, 'assets', 'body.meta.json');
const metaOut = args.out ? path.resolve(metaFile) : metaFile;
fs.writeFileSync(metaOut, JSON.stringify(meta, null, 1));
console.log('写出', metaOut);
