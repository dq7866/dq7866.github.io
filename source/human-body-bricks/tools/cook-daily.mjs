// cook-daily.mjs — 「日常人体」离线烘焙
//   1) 解析 AI 身体 GLB（自写轻量解析器：POSITION/NORMAL/TEXCOORD/indices + baseColor 贴图）
//   2) 贴图按 UV 采样成顶点色（运行时走 body.js 的顶点色材质，零改动）
//   3) 归一化：脚底 y=0、左右前后居中、缩放到 1.71 m
//   4) 按几何区域把身体切分成 10 块：head/neck/chest/abdomen/arms/hands/fingers/legs/feet/toes
//   5) 五官小件（ai-models/<name>.glb）按头部标志点定位安装；eyes/ears 镜像成双侧
//   6) 逐部件 meshopt 简化，写出 assets/daily.glb + daily.meta.json
//      （与 body.glb 同约定：节点名 = 部件 id，节点平移 = 部件中心，米制，脚底 y=0）
// 用法：node tools/cook-daily.mjs [--debug]
import * as THREE from '../lib/three.module.js';
import { MeshoptSimplifier } from './lib/meshopt_simplifier.module.js';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const AI = path.join(ROOT, 'assets', 'source', 'ai', 'ai-models');
const DEBUG = process.argv.includes('--debug');

// ---------- 分块阈值（米制，人高 1.71）——按切片实测标定 ----------
// 手臂分割线：每个 y 高度上「躯干/腿」与「手臂」之间存在 x 空隙，
// 线性插值（y=1.1 处 0.165，y=0.7 处约 0.21），肩部以上固定 0.17
const armThr = y => y >= 1.15 ? 0.17 : 0.165 + (1.1 - y) * 0.11;
const SEG = {
  head:     { test: v => v.y > 1.495 },
  neck:     { test: v => v.y > 1.44 && v.y <= 1.495 && Math.abs(v.x) < 0.08 },
  arms:     { test: v => Math.abs(v.x) > armThr(v.y) && v.y > 0.88 && v.y <= 1.47 },
  hands:    { test: v => Math.abs(v.x) > armThr(v.y) && v.y > 0.78 && v.y <= 0.88 },
  fingers:  { test: v => Math.abs(v.x) > armThr(v.y) && v.y > 0.62 && v.y <= 0.78 },
  chest:    { test: v => v.y > 1.18 && v.y <= 1.44 },
  abdomen:  { test: v => v.y > 0.86 && v.y <= 1.18 },
  legs:     { test: v => v.y > 0.09 && v.y <= 0.88 },
  feet:     { test: v => v.y <= 0.09 && v.z < 0.05 },
  toes:     { test: v => v.y <= 0.09 && v.z >= 0.05 },
};
const BODY_PARTS = ['head', 'neck', 'arms', 'hands', 'fingers', 'chest', 'abdomen', 'legs', 'feet', 'toes'];

// ---------- 五官安装参数（相对头部包围盒；截图迭代后微调） ----------
// 头部包围盒：chinY=box.min.y, topY=box.max.y, hh=高度, hw=宽, faceZ=box.max.z（脸朝 +z）
const FACE = {
  // 头雕（含发型+脸）：裁颈后作「头发」部件套在光头上——装上=有发型，拆下=露光头
  hair:   { headBust: true, size: 0.30, trimFrac: 0.26, rot: [0, 50, 0], dy: 0.50, dx: 0, dz: -0.115 },
  // AI 已生成成对模型（两球/两耳/两颊），不需要镜像
  eyes:   { size: 0.053, dy: 0.60, dx: 0.033, dz: 0.012, rot: [0, 0, 0] },
  nose:   { size: 0.090, dy: 0.42, dx: 0, dz: 0.010, rot: [0, 0, 0] },
  mouth:  { size: 0.038, dy: 0.235, dx: 0, dz: 0.008, rot: [0, 0, 0] },
  lips:   { size: 0.036, dy: 0.235, dx: 0, dz: 0.012, rot: [0, 0, 0] },
  teeth:  { size: 0.052, dy: 0.26, dx: 0, dz: 0.004, rot: [0, 0, 0] },
  ears:   { size: 0.036, dy: 0.52, dx: 0.052, dz: -0.012, rot: [0, 0, 0] },
  cheeks: { size: 0.045, dy: 0.40, dx: 0.042, dz: 0.004, rot: [0, 0, 0] },
};
// dy：相对 chin 的高度比例（乘头部高）；dx：左右偏移（乘头部宽）；dz：向前偏移
// mirror: true → 模型本体作为 +x 侧，克隆一份镜像到 -x 侧
// size: 'hair' 表示用头部尺寸公式，数字表示目标包围盒最大维（米）

// 眼位标定（tools/eye-mark2.cjs：截图核对 + 射线反求，hair.glb 不变即恒定）
const EYE_CAL = { lx: -0.0426, rx: 0.0325, y: 1.634, z: 0.111 };

// ---------- GLB 轻量解析 ----------
function parseGLB(file) {
  const buf = fs.readFileSync(file);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error(`${file}: 不是 GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
  // 容错定位 BIN chunk：chunk 头是 [length(4)][type(4)]，扫描到 type 魔数后
  // 从其前 4 字节读长度（兼容 jsonLen 不含 padding 的非常规写入器）
  let bin = null;
  for (let off = 20 + jsonLen; off <= 20 + jsonLen + 16; off += 4) {
    if (buf.readUInt32LE(off) === 0x004e4942) {
      const binLen = buf.readUInt32LE(off - 4);
      bin = buf.slice(off + 4, off + 4 + binLen);
      break;
    }
  }
  return { json, bin };
}

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORMD = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessor(json, bin, index) {
  const a = json.accessors[index];
  const bv = json.bufferViews[a.bufferView];
  const Arr = COMP[a.componentType];
  const nc = NCOMP[a.type];
  const stride = bv.byteStride || nc * Arr.BYTES_PER_ELEMENT;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const norm = a.normalized ? NORMD[a.componentType] : 1;
  // float 紧凑存储时直接建 TypedArray 视图
  if (a.componentType === 5126 && !bv.byteStride) {
    const arr = new Float32Array(bin.buffer, bin.byteOffset + base, a.count * nc);
    return { count: a.count, nc, get: i => Array.from(arr.subarray(i * nc, i * nc + nc)) };
  }
  const dv = new DataView(bin.buffer, bin.byteOffset);
  return {
    count: a.count, nc,
    get: i => {
      const o = base + i * stride;
      const out = new Array(nc);
      for (let k = 0; k < nc; k++) {
        const p = o + k * Arr.BYTES_PER_ELEMENT;
        out[k] = (a.componentType === 5126 ? dv.getFloat32(p, true)
          : a.componentType === 5125 ? dv.getUint32(p, true)
          : a.componentType === 5123 ? dv.getUint16(p, true)
          : a.componentType === 5122 ? dv.getInt16(p, true)
          : a.componentType === 5121 ? dv.getUint8(p)
          : dv.getInt8(p)) / norm;
      }
      return out;
    },
  };
}

function indices(json, bin, index) {
  const a = json.accessors[index];
  const Arr = COMP[a.componentType];
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const dv = new DataView(bin.buffer, bin.byteOffset);
  const out = new Uint32Array(a.count);
  for (let i = 0; i < a.count; i++) {
    const p = base + i * Arr.BYTES_PER_ELEMENT;
    out[i] = a.componentType === 5125 ? dv.getUint32(p, true) : a.componentType === 5123 ? dv.getUint16(p, true) : dv.getUint8(p);
  }
  return out;
}

function decodePNG(json, bin, imageIndex) {
  const img = json.images[imageIndex];
  const bv = json.bufferViews[img.bufferView];
  // 修正：bufferView 可能带 padding 或截短，从 view 起点一直走到 IEND 为止
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let raw = bin.slice(bv.byteOffset || 0);
  if (!raw.subarray(0, 8).equals(sig)) throw new Error('image 不是 PNG');
  let off = 8;
  for (;;) {
    const len = raw.readUInt32BE(off);
    const type = raw.readUInt32LE(off + 4);
    off += 12 + len; // len(4)+type(4)+data+crc(4)
    if (type === 0x444e4549) break; // IEND（LE 读取 "IEND"）
    if (off + 8 > raw.length) throw new Error('PNG 缺少 IEND');
  }
  raw = raw.slice(0, off);
  const png = PNG.sync.read(raw);
  return { w: png.width, h: png.height, data: png.data };
}

// node 树 → 每个 primitive：{pos, nrm, uv, idx, texIndex}
function extractMeshes(json, bin) {
  const out = [];
  const walk = (node, parentM) => {
    const M = new THREE.Matrix4();
    if (node.matrix) M.fromArray(node.matrix);
    else {
      M.compose(
        new THREE.Vector3().fromArray(node.translation || [0, 0, 0]),
        new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(node.scale || [1, 1, 1]),
      );
    }
    M.premultiply(parentM);
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      const v3 = new THREE.Vector3();
      for (const prim of mesh.primitives) {
        const P = accessor(json, bin, prim.attributes.POSITION);
        // 把节点世界变换直接应用到顶点（原始数据可能是 Z-up，靠节点旋转转正）
        const pw = { count: P.count, get: i => {
          const p = P.get(i);
          v3.set(p[0], p[1], p[2]).applyMatrix4(M);
          return [v3.x, v3.y, v3.z];
        } };
        const UV = prim.attributes.TEXCOORD_0 !== undefined ? accessor(json, bin, prim.attributes.TEXCOORD_0) : null;
        const idx = prim.indices !== undefined ? indices(json, bin, prim.indices) : null;
        const mat = json.materials[prim.material] || {};
        const texIndex = mat.pbrMetallicRoughness?.baseColorTexture?.index;
        const tex = texIndex !== undefined ? json.textures[texIndex].source : null;
        out.push({ P: pw, UV, idx, tex, factor: mat.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1] });
      }
    }
    (node.children || []).forEach(c => walk(json.nodes[c], M));
  };
  (json.scenes[json.scene || 0].nodes || []).forEach(ni => walk(json.nodes[ni], new THREE.Matrix4()));
  return out;
}

// 贴图 UV 采样 → 每顶点 rgba
function sampleColors(mesh, texMap) {
  const n = mesh.P.count;
  const col = new Float32Array(n * 4);
  const tex = mesh.tex !== null ? texMap.get(mesh.tex) : null;
  const f = mesh.factor;
  for (let i = 0; i < n; i++) {
    if (tex && mesh.UV) {
      const [u, v] = mesh.UV.get(i);
      const x = Math.min(tex.w - 1, Math.max(0, Math.round(u * (tex.w - 1))));
      const y = Math.min(tex.h - 1, Math.max(0, Math.round(v * (tex.h - 1))));
      const o = (y * tex.w + x) * 4;
      col[i * 4] = (tex.data[o] / 255) * f[0];
      col[i * 4 + 1] = (tex.data[o + 1] / 255) * f[1];
      col[i * 4 + 2] = (tex.data[o + 2] / 255) * f[2];
      col[i * 4 + 3] = (tex.data[o + 3] / 255) * f[3];
    } else {
      col[i * 4] = f[0]; col[i * 4 + 1] = f[1]; col[i * 4 + 2] = f[2]; col[i * 4 + 3] = 1;
    }
  }
  return col;
}

// 展开一个 GLB 为统一世界坐标的网格
function loadModel(file) {
  const { json, bin } = parseGLB(file);
  const texMap = new Map();
  (json.images || []).forEach((img, i) => {
    if (img.mimeType === 'image/png') texMap.set(i, decodePNG(json, bin, i));
  });
  const prims = extractMeshes(json, bin);
  const vb = [], cb = [], ib = [];
  let base = 0;
  const v = new THREE.Vector3();
  for (const prim of prims) {
    const col = sampleColors(prim, texMap);
    for (let i = 0; i < prim.P.count; i++) {
      const p = prim.P.get(i);
      v.set(p[0], p[1], p[2]);
      vb.push(v.x, v.y, v.z);
      cb.push(col[i * 4], col[i * 4 + 1], col[i * 4 + 2], col[i * 4 + 3]);
    }
    for (let i = 0; i < (prim.idx ? prim.idx.length : prim.P.count); i++) {
      ib.push((prim.idx ? prim.idx[i] : i) + base);
    }
    base += prim.P.count;
  }
  return { pos: new Float32Array(vb), col: new Float32Array(cb), idx: new Uint32Array(ib) };
}

// 归一化：算包围盒 → 缩放/平移（可选目标尺寸与锚点）
function bboxOf(m) {
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < m.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      box.min[k] = Math.min(box.min[k], m.pos[i + k]);
      box.max[k] = Math.max(box.max[k], m.pos[i + k]);
    }
  }
  return box;
}

function transform(m, f) {
  for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    m.pos[i] = f[0][0] * x + f[0][1] * y + f[0][2] * z + f[0][3];
    m.pos[i + 1] = f[1][0] * x + f[1][1] * y + f[1][2] * z + f[1][3];
    m.pos[i + 2] = f[2][0] * x + f[2][1] * y + f[2][2] * z + f[2][3];
  }
  // 法线/颜色未带（身体网格在切分后由原法线旋转；五官小件重新计算法线）
}

function scaleTo(m, matrix) {
  // matrix = {s, t:[tx,ty,tz]} 等比
  for (let i = 0; i < m.pos.length; i += 3) {
    m.pos[i] = m.pos[i] * matrix.s + matrix.t[0];
    m.pos[i + 1] = m.pos[i + 1] * matrix.s + matrix.t[1];
    m.pos[i + 2] = m.pos[i + 2] * matrix.s + matrix.t[2];
  }
}

// ---------- 主流程 ----------
await MeshoptSimplifier.ready;

// 归一化前：检测轴向（有些导出器写 Z-up）。最长轴映射为身高(Y)，次长轴为宽度(X)，
// 剩余轴为深度(Z)；若映射后是左手系，翻转深度轴保持右手系。
function reaxis(m) {
  const box = bboxOf(m);
  const ext = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
  const order = [0, 1, 2].sort((a, b) => ext[b] - ext[a]); // [身高轴, 宽度轴, 深度轴]
  if (order[0] === 1 && order[1] === 0) return; // 已是 Y-up / X 宽
  const up = order[0], side = order[1], depth = 3 - up - side;
  const g = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  g[0][side] = 1; g[1][up] = 1; g[2][depth] = 1;
  const det = g[0][0] * (g[1][1] * g[2][2] - g[1][2] * g[2][1]) - g[0][1] * (g[1][0] * g[2][2] - g[1][2] * g[2][0]) + g[0][2] * (g[1][0] * g[2][1] - g[1][1] * g[2][0]);
  if (det < 0) g[2][depth] = -1;
  transform(m, g);
}

console.log('解析 AI 身体…');
// 优先用写实着装人体（bodyReal，ai_queue 生成）；缺失时回退到 mannequin 风 body
const bodyFile = fs.existsSync(path.join(AI, 'bodyReal.glb')) ? path.join(AI, 'bodyReal.glb') : path.join(AI, 'body.glb');
console.log(`  身体来源: ${path.basename(bodyFile)}`);
const body = loadModel(bodyFile);
reaxis(body);
const rawBox = bboxOf(body);
const rawH = rawBox.max[1] - rawBox.min[1];
console.log(`  原始: ${(body.idx.length / 3).toLocaleString()} 三角形, 轴向修正后高 ${rawH.toFixed(3)}, bbox min ${rawBox.min.map(v => v.toFixed(2))} max ${rawBox.max.map(v => v.toFixed(2))}`);

// 归一化到 1.71m：等比、脚底 y=0、x/z 居中
const S = 1.71 / rawH;
const cx = (rawBox.min[0] + rawBox.max[0]) / 2, cz = (rawBox.min[2] + rawBox.max[2]) / 2;
transform(body, [
  [S, 0, 0, -S * cx],
  [0, S, 0, -S * rawBox.min[1]],
  [0, 0, S, -S * cz],
]);
const bodyBox = bboxOf(body);
console.log(`  归一化后: 高 ${(bodyBox.max[1] - bodyBox.min[1]).toFixed(3)}m 宽 ${(bodyBox.max[0] - bodyBox.min[0]).toFixed(3)}m 深 ${(bodyBox.max[2] - bodyBox.min[2]).toFixed(3)}m`);

// 手臂横向边界：肩宽（躯干半宽）+ 余量。取躯干最大宽的 0.62 倍作为分界。
const torsoW = (bodyBox.max[0] - bodyBox.min[0]);
const armX = torsoW * 0.30;
console.log(`  armX = ${(armX).toFixed(3)}m`);

// ---------- 身体按三角形质心分块 ----------
const buckets = new Map();
for (const id of BODY_PARTS) buckets.set(id, { id, pos: [], col: [], idx: [], base: 0 });
const vmap = new Map(); // 原顶点索引 → {partId, localIndex}
const tri = [0, 0, 0];
let unassigned = 0;
for (let t = 0; t < body.idx.length; t += 3) {
  tri[0] = body.idx[t]; tri[1] = body.idx[t + 1]; tri[2] = body.idx[t + 2];
  // 质心
  const gx = (body.pos[tri[0] * 3] + body.pos[tri[1] * 3] + body.pos[tri[2] * 3]) / 3;
  const gy = (body.pos[tri[0] * 3 + 1] + body.pos[tri[1] * 3 + 1] + body.pos[tri[2] * 3 + 1]) / 3;
  const gz = (body.pos[tri[0] * 3 + 2] + body.pos[tri[1] * 3 + 2] + body.pos[tri[2] * 3 + 2]) / 3;
  const c = { x: gx, y: gy, z: gz };
  let partId = null;
  for (const id of BODY_PARTS) { if (SEG[id].test(c, { armX })) { partId = id; break; } }
  if (!partId) { partId = gy > 0.86 ? 'abdomen' : 'legs'; unassigned++; }
  const b = buckets.get(partId);
  const newBase = b.base;
  for (const vi of tri) {
    const key = partId + ':' + vi;
    let li = vmap.get(key);
    if (li === undefined) {
      li = b.base++;
      vmap.set(key, li);
      b.pos.push(body.pos[vi * 3], body.pos[vi * 3 + 1], body.pos[vi * 3 + 2]);
      b.col.push(body.col[vi * 4], body.col[vi * 4 + 1], body.col[vi * 4 + 2], body.col[vi * 4 + 3]);
    }
    b.idx.push(li);
  }
}
console.log(`  分块完成（未命中回填 ${unassigned} 三角形）:`);
for (const b of buckets.values()) console.log(`    ${b.id.padEnd(9)} ${(b.idx.length / 3).toLocaleString()} 三角形`);

// ---------- 五官小件 ----------
// 重算法线（面法线平均）
function recomputeNormals(part) {
  const n = part.pos.length / 3;
  const nrm = new Float32Array(n * 3);
  for (let t = 0; t < part.idx.length; t += 3) {
    const a = part.idx[t] * 3, b2 = part.idx[t + 1] * 3, c2 = part.idx[t + 2] * 3;
    const ux = part.pos[b2] - part.pos[a], uy = part.pos[b2 + 1] - part.pos[a + 1], uz = part.pos[b2 + 2] - part.pos[a + 2];
    const vx = part.pos[c2] - part.pos[a], vy = part.pos[c2 + 1] - part.pos[a + 1], vz = part.pos[c2 + 2] - part.pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b2, c2]) { nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
  }
  return nrm;
}

// 网格镜像（-x）：顶点取反 x，法线取反 x，索引绕序翻转
function mirrorMesh(src) {
  const pos = new Float32Array(src.pos.length);
  const col = new Float32Array(src.col.length);
  const idx = new Uint32Array(src.idx.length);
  pos.set(src.pos); col.set(src.col); idx.set(src.idx);
  for (let i = 0; i < pos.length; i += 3) pos[i] = -pos[i];
  for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  return { pos, col, idx };
}

// 把 mesh 从自身包围盒搬到目标位置（等比缩放到 size 米，max 维度对齐）
function placeMesh(mesh, sizeM, opts) {
  const box = bboxOf(mesh);
  const dims = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
  const maxDim = Math.max(...dims);
  const s = sizeM / maxDim;
  // 平移到包围盒中心在原点，再放到目标
  const cx2 = (box.min[0] + box.max[0]) / 2, cy2 = (box.min[1] + box.max[1]) / 2, cz2 = (box.min[2] + box.max[2]) / 2;
  for (let i = 0; i < mesh.pos.length; i += 3) {
    const x = (mesh.pos[i] - cx2) * s;
    const y = (mesh.pos[i + 1] - cy2) * s;
    const z = (mesh.pos[i + 2] - cz2) * s;
    // 应用欧拉旋转（XYZ 序）
    let rx = x, ry = y, rz = z;
    if (opts.rot) {
      const [ax, ay, az] = opts.rot.map(d => d * Math.PI / 180);
      // 绕 x
      let t2 = ry * Math.cos(ax) - rz * Math.sin(ax); rz = ry * Math.sin(ax) + rz * Math.cos(ax); ry = t2;
      // 绕 y
      t2 = rx * Math.cos(ay) + rz * Math.sin(ay); rz = -rx * Math.sin(ay) + rz * Math.cos(ay); rx = t2;
      // 绕 z
      t2 = rx * Math.cos(az) - ry * Math.sin(az); ry = rx * Math.sin(az) + ry * Math.cos(az); rx = t2;
    }
    mesh.pos[i] = rx + opts.px;
    mesh.pos[i + 1] = ry + opts.py;
    mesh.pos[i + 2] = rz + opts.pz;
  }
}

// 头部包围盒（在 head 分块里）
const headPart = buckets.get('head');
const headBox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (let i = 0; i < headPart.pos.length; i += 3) {
  for (let k = 0; k < 3; k++) {
    headBox.min[k] = Math.min(headBox.min[k], headPart.pos[i + k]);
    headBox.max[k] = Math.max(headBox.max[k], headPart.pos[i + k]);
  }
}
const chinY = headBox.min[1], topY = headBox.max[1], hh = topY - chinY;
const hw = headBox.max[0] - headBox.min[0];
const faceZ = headBox.max[2];
console.log(`头部 bbox: 高 ${hh.toFixed(3)}m 宽 ${hw.toFixed(3)}m 脸面 z=${faceZ.toFixed(3)}  chin=${chinY.toFixed(3)}`);

const FACE_PARTS = ['hair', 'eyes', 'nose', 'mouth', 'lips', 'teeth', 'ears', 'cheeks'];
const FACE_BUST_FACE_Z = {}; // 头雕放好后记录其脸面 z（眼/鼻高度），五官小件贴面定位
const LAND = {};             // 头雕烘焙五官地标（自动检测）：nose 鼻尖 / mouth 嘴 / eye 眼窝
const PATCHES = {};          // 头雕表面裁出的五官贴片（零对位误差），存在时优先于 AI 独立件

// 眼位：单侧暗色顶点按 (0.62-亮度) 加权质心（虹膜最暗、权重最大）
function eyeCentroid(bucket, side, eyeY, noseTipZ) {
  const P = bucket.pos, C = bucket.col;
  let sx = 0, sy = 0, sz = 0, sw = 0;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (!isFinite(x + y + z)) continue; // AI 模型里偶发 NaN 顶点，会穿透范围判断污染质心
    if (x * side < 0.012 || x * side > 0.072) continue;
    if (y < eyeY - 0.013 || y > eyeY + 0.012) continue;
    if (z < noseTipZ - 0.06) continue;
    const lum = 0.299 * C[i * 4] + 0.587 * C[i * 4 + 1] + 0.114 * C[i * 4 + 2];
    if (!(lum <= 0.62)) continue; // NaN 也挡掉
    const w = 0.62 - lum + 0.05;
    sx += x * w; sy += y * w; sz += z * w; sw += w;
  }
  if (!(sw >= 2)) return null;
  return { x: sx / sw, y: sy / sw, z: sz / sw };
}

// 从头雕裁一片：pred(三角形质心) 选面，沿法线外移 offset 防 Z-fighting
function carvePatch(bucket, pred, offset, headC) {
  const P = bucket.pos, C = bucket.col, I = bucket.idx;
  const pos = [], col = [], idx = [];
  const remap = new Map();
  let next = 0;
  const get = (src) => {
    let li = remap.get(src);
    if (li === undefined) {
      li = next++; remap.set(src, li);
      pos.push(P[src * 3], P[src * 3 + 1], P[src * 3 + 2]);
      col.push(C[src * 4], C[src * 4 + 1], C[src * 4 + 2], C[src * 4 + 3]);
    }
    return li;
  };
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b2 = I[t + 1], c2 = I[t + 2];
    const cx = (P[a * 3] + P[b2 * 3] + P[c2 * 3]) / 3;
    const cy = (P[a * 3 + 1] + P[b2 * 3 + 1] + P[c2 * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b2 * 3 + 2] + P[c2 * 3 + 2]) / 3;
    const lumA = 0.299 * (C[a * 4] + C[b2 * 4] + C[c2 * 4]) / 3
               + 0.587 * (C[a * 4 + 1] + C[b2 * 4 + 1] + C[c2 * 4 + 1]) / 3
               + 0.114 * (C[a * 4 + 2] + C[b2 * 4 + 2] + C[c2 * 4 + 2]) / 3;
    if (!pred(cx, cy, cz, lumA)) continue;
    idx.push(get(a), get(b2), get(c2));
  }
  if (!idx.length) return null;
  // 顶点法线（面积加权），朝「远离头心」一侧外移
  const nrm = new Float32Array(next * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b2 = idx[t + 1], c2 = idx[t + 2];
    const ux = pos[b2 * 3] - pos[a * 3], uy = pos[b2 * 3 + 1] - pos[a * 3 + 1], uz = pos[b2 * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c2 * 3] - pos[a * 3], vy = pos[c2 * 3 + 1] - pos[a * 3 + 1], vz = pos[c2 * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b2, c2]) { nrm[o * 3] += nx; nrm[o * 3 + 1] += ny; nrm[o * 3 + 2] += nz; }
  }
  for (let i = 0; i < next; i++) {
    let nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const dx = pos[i * 3] - headC[0], dy = pos[i * 3 + 1] - headC[1], dz = pos[i * 3 + 2] - headC[2];
    if (nx * dx + ny * dy + nz * dz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    pos[i * 3] += nx * offset; pos[i * 3 + 1] += ny * offset; pos[i * 3 + 2] += nz * offset;
  }
  return { pos: new Float32Array(pos), col: new Float32Array(col), idx: new Uint32Array(idx) };
}
for (const name of FACE_PARTS) {
  // 头雕贴片优先：直接用裁好的片（含顶点色），不再用 AI 独立件（对位难、易双重五官）
  if (PATCHES[name]) {
    const pb = PATCHES[name];
    buckets.set(name, { id: name, pos: Array.from(pb.pos), col: Array.from(pb.col), idx: Array.from(pb.idx) });
    console.log(`  + ${name}: 头雕贴片 ${pb.idx.length / 3} 三角形`);
    continue;
  }
  const file = path.join(AI, name + '.glb');
  if (!fs.existsSync(file)) { console.log(`  - ${name}: 模型未生成，跳过（运行时回退程序化）`); continue; }
  const cfg = FACE[name];
  const m = loadModel(file);
  let rawTris = m.idx.length / 3;

  if (cfg.headBust) {
    // 头雕裁颈：按三角形质心裁掉颈部以下，保留头部（含发型）
    const b0 = bboxOf(m);
    const h0 = b0.max[1] - b0.min[1];
    const cutY = b0.min[1] + cfg.trimFrac * h0;
    const pos2 = [], col2 = [], idx2 = [];
    const remap = new Map();
    let next = 0;
    for (let t = 0; t < m.idx.length; t += 3) {
      const i0 = m.idx[t], i1 = m.idx[t + 1], i2 = m.idx[t + 2];
      const cy = (m.pos[i0 * 3 + 1] + m.pos[i1 * 3 + 1] + m.pos[i2 * 3 + 1]) / 3;
      if (cy < cutY) continue;
      for (const src of [i0, i1, i2]) {
        let li = remap.get(src);
        if (li === undefined) {
          li = next++; remap.set(src, li);
          pos2.push(m.pos[src * 3], m.pos[src * 3 + 1], m.pos[src * 3 + 2]);
          col2.push(m.col[src * 4], m.col[src * 4 + 1], m.col[src * 4 + 2], m.col[src * 4 + 3]);
        }
        idx2.push(li);
      }
    }
    m.pos = new Float32Array(pos2); m.col = new Float32Array(col2); m.idx = new Uint32Array(idx2);
    rawTris = m.idx.length / 3;
    console.log(`  ~ ${name}: 裁颈 @${cfg.trimFrac} → ${(h0 * 100).toFixed(0)}% 保留 ${rawTris.toLocaleString()} 三角形`);
  }

  // 目标位置（dx/dz 为绝对米；dy 为相对 chin 的头部高度比例）
  const px = cfg.dx || 0;
  const py = chinY + cfg.dy * hh;
  const pz = faceZ + cfg.dz;

  if (cfg.headBust) {
    // 头雕：按裁剪后包围盒「高度」定标，中心对齐身体头部中心（微调 dy/dz）
    const b = bboxOf(m);
    const bh = b.max[1] - b.min[1];
    const s = cfg.size / bh;
    const cx2 = (b.min[0] + b.max[0]) / 2, cy2 = (b.min[1] + b.max[1]) / 2, cz2 = (b.min[2] + b.max[2]) / 2;
    for (let i = 0; i < m.pos.length; i += 3) {
      let x = (m.pos[i] - cx2) * s, y = (m.pos[i + 1] - cy2) * s, z = (m.pos[i + 2] - cz2) * s;
      // 应用欧拉旋转（XYZ 序）
      if (cfg.rot) {
        const [ax, ay, az] = cfg.rot.map(d => d * Math.PI / 180);
        let t2 = y * Math.cos(ax) - z * Math.sin(ax); z = y * Math.sin(ax) + z * Math.cos(ax); y = t2;
        t2 = x * Math.cos(ay) + z * Math.sin(ay); z = -x * Math.sin(ay) + z * Math.cos(ay); x = t2;
        t2 = x * Math.cos(az) - y * Math.sin(az); y = x * Math.sin(az) + y * Math.cos(az); x = t2;
      }
      m.pos[i] = x + px;
      m.pos[i + 1] = y + py;
      m.pos[i + 2] = z + pz;
    }
    // 脸部精对位：发型不对称会使包围盒中心偏离脸面——检测放置后鼻尖（仅认肤色顶点，
    // 排除额前发丝的干扰），整体平移使鼻尖落在 (0, chinY+0.42hh, faceZ+0.012)，
    // 盖住身体头部五官防穿透
    let tip2 = { z: -Infinity };
    for (let i = 0; i < m.pos.length; i += 3) {
      const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
      if (Math.abs(x) > 0.03) continue;
      if (y < chinY + 0.28 * hh || y > chinY + 0.62 * hh) continue;
      const lum = 0.299 * m.col[i * 4] + 0.587 * m.col[i * 4 + 1] + 0.114 * m.col[i * 4 + 2];
      if (lum < 0.45) continue; // 头发是深色的，鼻尖是肤色
      if (z > tip2.z) tip2 = { x, y, z };
    }
    if (tip2.z > -Infinity) {
      const sx = 0 - tip2.x, sy = chinY + 0.42 * hh - tip2.y, sz = faceZ + 0.012 - tip2.z;
      for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] += sx; m.pos[i + 1] += sy; m.pos[i + 2] += sz; }
      console.log(`  ~ ${name}: 脸部精对位 平移(${sx.toFixed(3)}, ${sy.toFixed(3)}, ${sz.toFixed(3)})`);
    }
    const bb = bboxOf(m);
    console.log(`  ~ ${name}: bbox x[${bb.min[0].toFixed(3)},${bb.max[0].toFixed(3)}] y[${bb.min[1].toFixed(3)},${bb.max[1].toFixed(3)}] z[${bb.min[2].toFixed(3)},${bb.max[2].toFixed(3)}]  身体头部 x[${headBox.min[0].toFixed(3)},${headBox.max[0].toFixed(3)}] z[${headBox.min[2].toFixed(3)},${headBox.max[2].toFixed(3)}]`);
  } else {
    const size = cfg.size === 'hair' ? Math.max(hw * cfg.sx, hh * cfg.sy) : cfg.size;
    // —— 地标对齐：有烘焙地标时直接对位（替代比例硬编码） ——
    if (name === 'eyes' && LAND.eye) {
      // 眼球件：按目标球径（0.095×头雕高）等比缩放，两球分别平移到瞳距位置，
      // 球面前缘对齐眼窝面
      const box = bboxOf(m);
      let lx = 0, ln = 0, rx = 0, rn = 0, lmin = Infinity, lmax = -Infinity, rmin = Infinity, rmax = -Infinity, frontZ = -Infinity;
      for (let i = 0; i < m.pos.length; i += 3) {
        const x = m.pos[i];
        if (x < 0) { lx += x; ln++; if (x < lmin) lmin = x; if (x < -0.02 && x > lmax) lmax = x; }
        else { rx += x; rn++; if (x > 0.02 && x < rmin) rmin = x; if (x > rmax) rmax = x; }
        if (m.pos[i + 2] > frontZ) frontZ = m.pos[i + 2];
      }
      lx /= ln; rx /= rn;
      const r0 = Math.max((lmax - lmin), (rmax - rmin)) / 2; // 原生球半径
      const s = (0.095 * LAND.bustH) / (2 * r0);
      const cy2 = (box.min[1] + box.max[1]) / 2;
      for (let i = 0; i < m.pos.length; i += 3) {
        let x = m.pos[i] * s;
        const y = (m.pos[i + 1] - cy2) * s + LAND.eye.y;
        const z = (m.pos[i + 2] - frontZ) * s + LAND.eye.z + 0.004;
        x += x < 0 ? -LAND.eye.sep / 2 - lx * s : LAND.eye.sep / 2 - rx * s;
        m.pos[i] = x; m.pos[i + 1] = y; m.pos[i + 2] = z;
      }
      console.log(`  ~ eyes: 原生球径 ${(2 * r0).toFixed(3)} → 缩放 ${s.toFixed(2)} 球径 ${(0.095 * LAND.bustH).toFixed(3)} 瞳距 ${LAND.eye.sep.toFixed(3)}`);
    } else if (name === 'nose' && LAND.nose) {
      // 鼻件：件内鼻尖（z 最大顶点簇质心）对齐烘焙鼻尖
      const box = bboxOf(m);
      const dims = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
      const s = size / Math.max(...dims);
      let tipZ = -Infinity;
      for (let i = 0; i < m.pos.length; i += 3) if (m.pos[i + 2] > tipZ) tipZ = m.pos[i + 2];
      let tx = 0, ty = 0, tn = 0;
      for (let i = 0; i < m.pos.length; i += 3) {
        if (m.pos[i + 2] > tipZ - 0.002) { tx += m.pos[i]; ty += m.pos[i + 1]; tn++; }
      }
      tx /= tn; ty /= tn;
      for (let i = 0; i < m.pos.length; i += 3) {
        m.pos[i] = (m.pos[i] - tx) * s + LAND.nose.x;
        m.pos[i + 1] = (m.pos[i + 1] - ty) * s + LAND.nose.y - 0.012; // 检测点为眉弓，鼻件 tip 目标略低（经验值）
        m.pos[i + 2] = (m.pos[i + 2] - tipZ) * s + LAND.nose.z + 0.006;
      }
      console.log(`  ~ nose: 鼻尖(${tx.toFixed(3)},${ty.toFixed(3)}) → 烘焙鼻尖(${LAND.nose.x.toFixed(3)},${LAND.nose.y.toFixed(3)},${LAND.nose.z.toFixed(3)}) 缩放 ${s.toFixed(2)}`);
    } else {
      let pzo = pz;
      if (name === 'eyes' && FACE_BUST_FACE_Z.eye != null) pzo = FACE_BUST_FACE_Z.eye + 0.008;
      if (name === 'nose' && FACE_BUST_FACE_Z.nose != null) pzo = FACE_BUST_FACE_Z.nose + 0.008;
      if (name === 'mouth' && LAND.mouth) pzo = LAND.mouth.z + 0.004;
      placeMesh(m, size, { px, py, pz: pzo, rot: cfg.rot });
    }
  }

  // 展开（大数组不能 spread，会爆栈）
  const bucket = { id: name, pos: Array.from(m.pos), col: Array.from(m.col), idx: Array.from(m.idx) };
  if (cfg.mirror) {
    // 镜像件并入同一部件（运行时部件 id 只有 eyes/ears/cheeks，没有 xxxR）
    const mm = mirrorMesh(m);
    const base2 = bucket.pos.length / 3;
    for (let i = 0; i < mm.pos.length; i++) bucket.pos.push(mm.pos[i]);
    for (let i = 0; i < mm.col.length; i++) bucket.col.push(mm.col[i]);
    for (let i = 0; i < mm.idx.length; i++) bucket.idx.push(mm.idx[i] + base2);
  }
  buckets.set(name, bucket);
  console.log(`  + ${name}: ${rawTris.toLocaleString()} 三角形 → 定位 [${px.toFixed(3)}, ${py.toFixed(3)}, ${pz.toFixed(3)}]`);
  // 头雕放好后，检测它脸上烘焙五官的实际位置，供五官小件直接对位
  if (name === 'hair') {
    const BUST_EYE = { y: chinY + 0.60 * hh, z: -Infinity };
    const BUST_NOSE = { y: chinY + 0.42 * hh, z: -Infinity };
    for (let i = 0; i < bucket.pos.length; i += 3) {
      const y = bucket.pos[i + 1];
      if (Math.abs(y - BUST_EYE.y) < 0.012 && Math.abs(bucket.pos[i]) < 0.045) BUST_EYE.z = Math.max(BUST_EYE.z, bucket.pos[i + 2]);
      if (Math.abs(y - BUST_NOSE.y) < 0.012 && Math.abs(bucket.pos[i]) < 0.035) BUST_NOSE.z = Math.max(BUST_NOSE.z, bucket.pos[i + 2]);
    }
    if (BUST_EYE.z > -Infinity) { FACE_BUST_FACE_Z.eye = BUST_EYE.z; console.log(`  · 头雕眼线 z=${BUST_EYE.z.toFixed(3)}`); }
    if (BUST_NOSE.z > -Infinity) { FACE_BUST_FACE_Z.nose = BUST_NOSE.z; console.log(`  · 头雕鼻线 z=${BUST_NOSE.z.toFixed(3)}`); }

    // —— 自动检测烘焙五官地标 ——
    const P = bucket.pos, C = bucket.col;
    LAND.bustH = cfg.size;
    const bustFront = Math.max(FACE_BUST_FACE_Z.nose || 0, FACE_BUST_FACE_Z.eye || 0);
    // 鼻尖：中线区 y∈[0.28,0.55]hh 最凸点（仅认肤色，排除发丝）
    let tip = { z: -Infinity };
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (Math.abs(x) > 0.022) continue;
      if (y < chinY + 0.28 * hh || y > chinY + 0.55 * hh) continue;
      const lum = 0.299 * C[i * 4] + 0.587 * C[i * 4 + 1] + 0.114 * C[i * 4 + 2];
      if (lum < 0.45) continue;
      if (z > tip.z) tip = { x, y, z };
    }
    if (tip.z > -Infinity) { LAND.nose = tip; console.log(`  · 烘焙鼻尖 y=${tip.y.toFixed(3)} z=${tip.z.toFixed(3)}`); }
    // 嘴：中线区 y∈[0.08,0.28]hh 最凸点
    let lip = { z: -Infinity };
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (Math.abs(x) > 0.025) continue;
      if (y < chinY + 0.08 * hh || y > chinY + 0.28 * hh) continue;
      if (z > lip.z) lip = { x, y, z };
    }
    if (lip.z > -Infinity) { LAND.mouth = lip; console.log(`  · 烘焙嘴唇 y=${lip.y.toFixed(3)} z=${lip.z.toFixed(3)}`); }
    // 眼：几何法（暗色顶点检测被眉毛/发际干扰，弃用）——
    // 眼线高度 = 鼻尖 + 0.14×头雕高；瞳距 = 0.43×眼线处脸宽（肤色顶点量，排除深色头发）；z = 眼位处表面
    if (LAND.nose) {
      const bustH = cfg.size;
      const eyeY = LAND.nose.y - 0.004; // 检测点实为眉弓最高点，眼窝略低（经验值）
      let fxMin = Infinity, fxMax = -Infinity;
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        if (Math.abs(y - eyeY) > 0.008) continue;
        if (z < LAND.nose.z - 0.05) continue;
        const lum = 0.299 * C[i * 4] + 0.587 * C[i * 4 + 1] + 0.114 * C[i * 4 + 2];
        if (lum < 0.45) continue; // 排除头发
        if (x < fxMin) fxMin = x;
        if (x > fxMax) fxMax = x;
      }
      if (fxMax > fxMin) {
        const sep = 0.43 * (fxMax - fxMin);
        let zl = -Infinity, zr = -Infinity;
        for (let i = 0; i < P.length; i += 3) {
          const x = P[i], y = P[i + 1], z = P[i + 2];
          if (Math.abs(y - eyeY) > 0.012) continue;
          if (Math.abs(x + sep / 2) < 0.014 && z > zl) zl = z;
          if (Math.abs(x - sep / 2) < 0.014 && z > zr) zr = z;
        }
        if (zl > -Infinity && zr > -Infinity) {
          LAND.eye = { y: eyeY, z: Math.min(zl, zr), sep };
          console.log(`  · 烘焙眼位（几何推算） y=${eyeY.toFixed(3)} 瞳距=${sep.toFixed(3)} 眼窝面 z=${Math.min(zl, zr).toFixed(3)}（肤色脸宽 ${(fxMax - fxMin).toFixed(3)}）`);
        }
      }
    }

    // —— 瑕疵处理（多种方案均失败，放弃）：AI 头雕内眼角/下巴的轻微凸起保留，
    // 明日 AI 新人体模型到货后重烘焙自然消失
    const bustBox = bboxOf(bucket);
    const depth = bustBox.max[2] - bustBox.min[2];


    // —— 眼位检测：暗色顶点按亮度加权质心（虹膜最暗权重最大），左右各取一侧 ——
    // 依据实测：眼窝是凹陷区（z 比鼻尖低 3~4cm），暗色聚类太碎、眼白不够亮，加权质心最稳
    let faceFront = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (Math.abs(x) > 0.03 || z <= faceFront) continue;
      if (y < chinY + 0.2 * hh || y > chinY + 0.6 * hh) continue;
      const lum = 0.299 * C[i * 4] + 0.587 * C[i * 4 + 1] + 0.114 * C[i * 4 + 2];
      if (lum < 0.45) continue;
      faceFront = z;
    }
    const noseTipY = LAND.nose ? LAND.nose.y : chinY + 0.42 * hh;
    const noseTipZ = LAND.nose ? LAND.nose.z : faceFront;
    const eyeY2 = noseTipY + 0.045; // 实测：眼位在鼻尖上方约 4.5cm（bust 0.30m 尺度）
    const eyeL = eyeCentroid(bucket, -1, eyeY2, noseTipZ);
    const eyeR = eyeCentroid(bucket, 1, eyeY2, noseTipZ);
    if (EYE_CAL) {
      LAND.iris = EYE_CAL;
      console.log(`  · 眼位（标定值） L(${EYE_CAL.lx},${EYE_CAL.y},${EYE_CAL.z}) R(${EYE_CAL.rx}) 检测值 L(${eyeL ? eyeL.x.toFixed(3) : '?'}) R(${eyeR ? eyeR.x.toFixed(3) : '?'})`);
    } else if (eyeL && eyeR) {
      LAND.iris = { lx: eyeL.x, rx: eyeR.x, y: (eyeL.y + eyeR.y) / 2, z: (eyeL.z + eyeR.z) / 2 };
      console.log(`  · 眼位 左(${eyeL.x.toFixed(3)},${eyeL.y.toFixed(3)},${eyeL.z.toFixed(3)}) 右(${eyeR.x.toFixed(3)},${eyeR.y.toFixed(3)},${eyeR.z.toFixed(3)}) 瞳距=${(eyeR.x - eyeL.x).toFixed(3)}`);
    }

    // —— 唇（颜色）：偏红顶点质心 ——
    let lipC = { n: 0, x: 0, y: 0, z: 0 };
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (Math.abs(x) > 0.035 || z < faceFront - 0.03) continue;
      if (y < eyeY2 - 0.09 || y > eyeY2 - 0.02) continue;
      const r = C[i * 4], g = C[i * 4 + 1], b2 = C[i * 4 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b2;
      if (r - b2 < 0.07 || r - g < 0.02 || lum > 0.66 || lum < 0.18) continue;
      lipC.n++; lipC.x += x; lipC.y += y; lipC.z += z;
    }
    if (lipC.n > 8) { lipC.x /= lipC.n; lipC.y /= lipC.n; lipC.z /= lipC.n; console.log(`  · 唇心(颜色) (${lipC.x.toFixed(3)}, ${lipC.y.toFixed(3)}, ${lipC.z.toFixed(3)}) n=${lipC.n}`); }
    else lipC = null;

    // —— 五官贴片裁切 ——
    const headC = [0, (bustBox.min[1] + bustBox.max[1]) / 2, (bustBox.min[2] + bustBox.max[2]) / 2 - 0.02];
    if (LAND.iris) {
      // 眼贴片：左右各一个椭圆（以标定/检测到的实际眼位为中心）
      const eyePred = (cx, cy, cz) => {
        if (cz < noseTipZ - 0.055) return false;
        if (cy < LAND.iris.y - 0.024 || cy > LAND.iris.y + 0.022) return false;
        const dl = Math.hypot(cx - LAND.iris.lx, (cy - LAND.iris.y) * 1.3);
        const dr = Math.hypot(cx - LAND.iris.rx, (cy - LAND.iris.y) * 1.3);
        return Math.min(dl, dr) < 0.022;
      };
      PATCHES.eyes = carvePatch(bucket, eyePred, 0.001, headC);
      // 鼻贴片：桥部窄 → 翼部宽
      {
        const nosePred = (cx, cy, cz) => {
          if (cz < faceFront - 0.012) return false;
          if (Math.abs(cx) > 0.019) return false;
          if (cy > eyeY2 + 0.006 || cy < noseTipY - 0.022) return false;
          const w = cy > noseTipY ? 0.0075 + (1 - (cy - noseTipY) / (eyeY2 + 0.006 - noseTipY)) * 0.0045
                                   : 0.0165 + (noseTipY - cy) * 0.35;
          return Math.abs(cx) < Math.min(w, 0.019);
        };
        PATCHES.nose = carvePatch(bucket, nosePred, 0.0012, headC);
      }
      if (lipC) {
        PATCHES.lips = carvePatch(bucket, (cx, cy, cz) =>
          cz > lipC.z - 0.012 && Math.abs(cx) < 0.022 && Math.abs(cy - lipC.y) < 0.0085, 0.0012, headC);
        PATCHES.mouth = carvePatch(bucket, (cx, cy, cz) =>
          cz > lipC.z - 0.014 && Math.abs(cx) < 0.030 && cy > lipC.y - 0.020 && cy < lipC.y + 0.016, 0.0022, headC);
      }
      // 脸颊：两侧对称椭圆区（肤色顶点，排除发丝）
      const cheekPred = (cx, cy, cz, lumA) => {
        if (cz < noseTipZ - 0.055) return false;
        if (cy < eyeY2 - 0.052 || cy > eyeY2 - 0.008) return false;
        if (lumA < 0.42) return false;
        const ax = Math.abs(cx);
        return ax > 0.024 && ax < 0.052;
      };
      PATCHES.cheeks = carvePatch(bucket, cheekPred, 0.0018, headC);
      // 耳：两侧最外圈（|x| 接近头雕最宽处）、眼线上下的窄带
      const earX = Math.min(bustBox.max[0], -bustBox.min[0]) - 0.016;
      const earPred = (cx, cy, cz) => {
        if (Math.abs(cx) < earX) return false;
        if (cy < eyeY2 - 0.004 || cy > eyeY2 + 0.044) return false;
        return cz > bustBox.min[2] + depth * 0.32;
      };
      PATCHES.ears = carvePatch(bucket, earPred, 0.0012, headC);
      for (const [k, v] of Object.entries(PATCHES)) {
        if (v) console.log(`  + 贴片 ${k}: ${v.idx.length / 3} 三角形`);
        else delete PATCHES[k];
      }
    }
  }
}

// ---------- 简化 + 写出（与 cook.mjs 同约定） ----------
async function simplifyPart(pos, col, idx, targetTris, error = 0.0025) {
  const verts = pos.length / 3;
  const map = new Map(), remap = new Uint32Array(verts);
  let next = 0;
  const welded = new Float32Array(verts * 3);
  for (let i = 0; i < verts; i++) {
    const k = `${Math.round(pos[i * 3] * 2e5)},${Math.round(pos[i * 3 + 1] * 2e5)},${Math.round(pos[i * 3 + 2] * 2e5)}`;
    let j = map.get(k);
    if (j === undefined) { j = next++; map.set(k, j); welded[j * 3] = pos[i * 3]; welded[j * 3 + 1] = pos[i * 3 + 1]; welded[j * 3 + 2] = pos[i * 3 + 2]; }
    remap[i] = j;
  }
  const widx = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) widx[i] = remap[idx[i]];
  const wpos = welded.subarray(0, next * 3);
  const target = Math.max(3, Math.round(targetTris * 3));
  const [sidx] = MeshoptSimplifier.simplify(widx, wpos, 3, Math.min(target, widx.length), error, ['LockBorder']);
  const useIdx = sidx.length < widx.length ? sidx : widx;
  const uCol = new Float32Array(next * 4);
  for (let i = 0; i < verts; i++) {
    const j = remap[i];
    if (uCol[j * 4] === 0 && uCol[j * 4 + 1] === 0 && uCol[j * 4 + 2] === 0) {
      uCol[j * 4] = col[i * 4]; uCol[j * 4 + 1] = col[i * 4 + 1]; uCol[j * 4 + 2] = col[i * 4 + 2]; uCol[j * 4 + 3] = col[i * 4 + 3];
    }
  }
  const used = new Map();
  for (let i = 0; i < useIdx.length; i++) {
    const o = useIdx[i];
    if (!used.has(o)) used.set(o, used.size);
  }
  const n = used.size;
  const cpos = new Float32Array(n * 3), ccol = new Float32Array(n * 4);
  for (const [o, j] of used) {
    cpos[j * 3] = wpos[o * 3]; cpos[j * 3 + 1] = wpos[o * 3 + 1]; cpos[j * 3 + 2] = wpos[o * 3 + 2];
    ccol[j * 4] = uCol[o * 4]; ccol[j * 4 + 1] = uCol[o * 4 + 1]; ccol[j * 4 + 2] = uCol[o * 4 + 2]; ccol[j * 4 + 3] = uCol[o * 4 + 3];
  }
  const cidx = new Uint32Array(useIdx.length);
  for (let i = 0; i < useIdx.length; i++) cidx[i] = used.get(useIdx[i]);
  return { pos: cpos, col: ccol, idx: cidx, after: cidx.length / 3 };
}

// 部件面数预算（总 ~140k）
const BUDGET = {
  head: 26000, neck: 6000, chest: 16000, abdomen: 14000, arms: 14000, hands: 9000,
  fingers: 8000, legs: 16000, feet: 8000, toes: 7000,
  hair: 20000, eyes: 5000, nose: 6000, mouth: 6000, lips: 5000, teeth: 5000, ears: 5000, cheeks: 4000,
};
const BUDGET_R = { eyesR: 5000, earsR: 5000, cheeksR: 4000 };

const parts = [];
let totalAfter = 0;
for (const b of buckets.values()) {
  const budget = BUDGET[b.id] ?? BUDGET_R[b.id] ?? 8000;
  const pos = new Float32Array(b.pos), col = new Float32Array(b.col), idx = new Uint32Array(b.idx);
  const r = await simplifyPart(pos, col, idx, budget);
  // 身体头部缩到 94%（平时被头雕罩住防穿模；拆下头发露出的光头略小不明显）
  if (b.id === 'head') {
    const hb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i < r.pos.length; i += 3)
      for (let k = 0; k < 3; k++) { hb.min[k] = Math.min(hb.min[k], r.pos[i + k]); hb.max[k] = Math.max(hb.max[k], r.pos[i + k]); }
    const hc = [0, 1, 2].map(k => (hb.min[k] + hb.max[k]) / 2);
    for (let i = 0; i < r.pos.length; i += 3)
      for (let k = 0; k < 3; k++) r.pos[i + k] = hc[k] + (r.pos[i + k] - hc[k]) * 0.94;
    console.log(`  ~ head: 缩放 0.94 中心 [${hc.map(v => v.toFixed(3)).join(', ')}]`);
  }
  // 居中：包围盒中心
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < r.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      box.min[k] = Math.min(box.min[k], r.pos[i + k]);
      box.max[k] = Math.max(box.max[k], r.pos[i + k]);
    }
  }
  const c = [0, 1, 2].map(k => +(((box.min[k] + box.max[k]) / 2)).toFixed(5));
  if (r.after && isFinite(c[0]) && isFinite(c[1]) && isFinite(c[2])) {
    for (let i = 0; i < r.pos.length; i += 3) for (let k = 0; k < 3; k++) r.pos[i + k] -= c[k];
    parts.push({ id: b.id, center: c, ...r });
    totalAfter += r.after;
    console.log(`  ${b.id.padEnd(9)} ${r.after.toLocaleString()} 三角形  center [${c.join(', ')}]`);
  } else {
    console.log(`  (跳过空部件 ${b.id})`);
  }
}
console.log(`合计 ${totalAfter.toLocaleString()} 三角形`);

// GLB 写出（复用 cook.mjs 的格式：position f32 / normal 归一化 int8 / color u8）
function buildGLB(parts, outFile) {
  const bin = [];
  let binLen = 0;
  const json = {
    asset: { version: '2.0', generator: 'human-body-bricks cook-daily.mjs' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [],
    materials: [{
      name: 'tissue', doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.0, roughnessFactor: 0.62 },
    }],
  };
  const pushView = (u8, target) => {
    while (binLen % 4) { bin.push(Buffer.alloc(1)); binLen++; }
    const off = binLen;
    bin.push(u8); binLen += u8.length;
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: u8.length, ...(target ? { target } : {}) });
    return json.bufferViews.length - 1;
  };
  const addAcc = (view, comp, count, type, extra = {}) => {
    json.accessors.push({ bufferView: view, componentType: comp, count, type, ...extra });
    return json.accessors.length - 1;
  };
  json.nodes.push({ name: 'DailyBody', children: [] });
  for (const p of parts) {
    const nrm = recomputeNormals(p);
    // int8 法线
    const n8 = new Int8Array(nrm.length);
    for (let i = 0; i < nrm.length; i++) n8[i] = Math.max(-127, Math.min(127, Math.round(nrm[i] * 127)));
    const c8 = new Uint8Array(p.col.length);
    for (let i = 0; i < p.col.length; i++) c8[i] = Math.round(Math.max(0, Math.min(1, p.col[i])) * 255);
    const nodeIndex = json.nodes.length;
    json.nodes.push({ name: p.id, mesh: json.meshes.length, translation: p.center });
    // POSITION accessor 必须带真实 min/max：GLTFLoader 用它算包围球/盒，
    // 缺失或全 0 会让包围球半径归零 → 射线拾取永远失败（拆解点不中）
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) {
      const v = p.pos[i + k];
      if (v < mn[k]) mn[k] = v;
      if (v > mx[k]) mx[k] = v;
    }
    json.meshes.push({
      primitives: [{
        attributes: {
          POSITION: addAcc(pushView(new Uint8Array(p.pos.buffer, p.pos.byteOffset, p.pos.byteLength), 34962), 5126, p.pos.length / 3, 'VEC3', { min: mn.map(v => +v.toFixed(6)), max: mx.map(v => +v.toFixed(6)) }),
          NORMAL: addAcc(pushView(new Uint8Array(n8.buffer, n8.byteOffset, n8.byteLength), 34962), 5120, p.pos.length / 3, 'VEC3', { normalized: true }),
          COLOR_0: addAcc(pushView(c8, 34962), 5121, p.pos.length / 3, 'VEC4', { normalized: true }),
        },
        indices: addAcc(pushView(new Uint8Array(p.idx.buffer, p.idx.byteOffset, p.idx.byteLength), 34963), 5125, p.idx.length, 'SCALAR'),
        material: 0,
      }],
    });
    json.nodes[0].children.push(nodeIndex);
  }
  const binBuf = Buffer.concat(bin);
  json.buffers = [{ byteLength: binBuf.length }]; // bufferViews 都引用 buffer 0，必须声明
  const jsonStr = Buffer.from(JSON.stringify(json), 'utf8');
  const pad2 = l => Buffer.alloc((4 - (l % 4)) % 4, 0x20); // 规范：JSON 块用空格补齐
  const jPadded = Buffer.concat([jsonStr, pad2(jsonStr.length)]);
  const bPadded = Buffer.concat([binBuf, pad2(binBuf.length)]);
  const total = 12 + 8 + jPadded.length + 8 + bPadded.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jPadded.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bPadded.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(outFile, Buffer.concat([head, jh, jPadded, bh, bPadded]));
  return { total: fs.statSync(outFile).size, json: jsonStr.length, bin: binBuf.length };
}

const OUT = path.join(ROOT, 'assets', 'daily.glb');
const info = buildGLB(parts, OUT);
console.log(`写出 ${OUT}  ${(info.total / 1048576).toFixed(2)} MB`);

// meta（运行时不需要，但方便核对）
const meta = {
  generatedAt: new Date().toISOString(),
  file: 'assets/daily.glb',
  unit: 'meter',
  shapeCount: parts.length,
  triangles: totalAfter,
  shapes: Object.fromEntries(parts.map(p => [p.id, { center: p.center, triangles: p.after }])),
  sources: [{ id: 'ai-daily', file: 'assets/source/ai/ai-models/*.glb', license: 'AI 生成（腾讯混元 3D），站内使用' }],
};
fs.writeFileSync(path.join(ROOT, 'assets', 'daily.meta.json'), JSON.stringify(meta, null, 1));
console.log('写出 assets/daily.meta.json');
