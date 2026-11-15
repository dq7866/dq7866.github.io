// 头雕（hair.glb, yaw 50°）脸部特征检测：虹膜/眉/唇/鼻尖，输出坐标供烘焙裁片用
import fs from 'node:fs';
const YAW = 50 * Math.PI / 180, TRIM = 0.26;

// —— 最小 GLB 解析（与 cook-daily 同约定）——
function loadModel(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
  let binOff = -1, binLen = 0;
  for (let off = 20 + jsonLen; off < b.length - 4; off++) {
    if (b.readUInt32LE(off + 4) === 0x004e4942) { binLen = b.readUInt32LE(off); binOff = off + 8; break; }
  }
  const bin = b.subarray(binOff, binOff + binLen);
  const read = (acc) => {
    const v = json.bufferViews[acc.bufferView];
    const d = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength);
    const n = acc.count, comp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
    if (acc.componentType === 5126) return new Float32Array(d.buffer, d.byteOffset, n * comp);
    if (acc.componentType === 5125) return new Uint32Array(d.buffer, d.byteOffset, n * comp);
    if (acc.componentType === 5123) return new Uint16Array(d.buffer, d.byteOffset, n * comp);
    if (acc.componentType === 5121) return new Uint8Array(d.buffer, d.byteOffset, n * comp);
    if (acc.componentType === 5120) return new Int8Array(d.buffer, d.byteOffset, n * comp);
    throw new Error('componentType ' + acc.componentType);
  };
  const mesh = { pos: null, col: null, idx: null };
  const prim = json.meshes[0].primitives[0];
  mesh.pos = read(json.accessors[prim.attributes.POSITION]);
  if (prim.attributes.COLOR_0 !== undefined) {
    const c = read(json.accessors[prim.attributes.COLOR_0]);
    const norm = json.accessors[prim.attributes.COLOR_0].normalized;
    const f = new Float32Array(n0 => n0)(c.length);
    for (let i = 0; i < c.length; i++) f[i] = norm ? c[i] / 255 : c[i];
    mesh.col = f;
  }
  mesh.idx = read(json.accessors[prim.indices]);
  return mesh;
}

const m = loadModel('assets/source/ai/ai-models/hair.glb');
// 注意 mesh 级 vs 节点级：hair.glb 可能有多 mesh，这里粗略取第一个 prim（若不够再扩展）
console.log('verts', m.pos.length / 3, 'tris', m.idx.length / 3, 'hasColor', !!m.col);
