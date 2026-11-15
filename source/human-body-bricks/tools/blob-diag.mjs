// 疣状物颜色采样：内眼角/下巴 vs 皮肤基准
import fs from 'node:fs';
const b = fs.readFileSync('assets/daily.glb');
const jsonLen = b.readUInt32LE(12);
const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
let binLen = 0, binOff = -1;
for (let off = 20 + jsonLen; off < b.length - 4; off++) {
  if (b.readUInt32LE(off + 4) === 0x004e4942) { binLen = b.readUInt32LE(off); binOff = off + 8; break; }
}
const bin = b.subarray(binOff, binOff + binLen);
const nodeIdx = json.nodes.findIndex(n => n.name === 'hair');
const mesh = json.meshes[json.nodes[nodeIdx].mesh];
const prim = mesh.primitives[0];
const T = json.nodes[nodeIdx].translation || [0, 0, 0];
const rd = (ai) => {
  const acc = json.accessors[ai];
  const v = json.bufferViews[acc.bufferView];
  const d = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength);
  const comp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  if (acc.componentType === 5126) return new Float32Array(d.buffer, d.byteOffset, acc.count * comp);
  if (acc.componentType === 5121) return new Uint8Array(d.buffer, d.byteOffset, acc.count * comp);
  if (acc.componentType === 5125) return new Uint32Array(d.buffer, d.byteOffset, acc.count * comp);
  throw new Error('ct ' + acc.componentType);
};
const P0 = rd(prim.attributes.POSITION), C = rd(prim.attributes.COLOR_0), I = rd(prim.indices);
const P = new Float32Array(P0.length);
for (let i = 0; i < P0.length; i++) P[i] = P0[i] + T[i % 3];
const regions = {
  内眼角L: (x, y) => x < -0.004 && x > -0.036 && y > 1.612 && y < 1.648,
  内眼角R: (x, y) => x > 0.004 && x < 0.036 && y > 1.612 && y < 1.648,
  下巴:    (x, y) => Math.abs(x) < 0.022 && y > 1.538 && y < 1.578,
  额头基准: (x, y) => Math.abs(x) < 0.04 && y > 1.665 && y < 1.695,
  脸颊基准: (x, y) => Math.abs(x) > 0.03 && Math.abs(x) < 0.055 && y > 1.585 && y < 1.605,
};
for (const [name, inR] of Object.entries(regions)) {
  const rows = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b2 = I[t + 1], c2 = I[t + 2];
    const cx = (P[a * 3] + P[b2 * 3] + P[c2 * 3]) / 3;
    const cy = (P[a * 3 + 1] + P[b2 * 3 + 1] + P[c2 * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b2 * 3 + 2] + P[c2 * 3 + 2]) / 3;
    if (!inR(cx, cy)) continue;
    const r = (C[a * 4] + C[b2 * 4] + C[c2 * 4]) / (3 * 255), g = (C[a * 4 + 1] + C[b2 * 4 + 1] + C[c2 * 4 + 1]) / (3 * 255), bl = (C[a * 4 + 2] + C[b2 * 4 + 2] + C[c2 * 4 + 2]) / (3 * 255);
    rows.push({ cz, r, g, b: bl, lum: 0.299 * r + 0.587 * g + 0.114 * bl, sat: Math.max(r, g, bl) - Math.min(r, g, bl) });
  }
  rows.sort((x, y) => y.cz - x.cz);
  const n = rows.length;
  const avg = (f) => n ? rows.reduce((s, q) => s + f(q), 0) / n : NaN;
  const front = rows.slice(0, Math.max(1, Math.floor(n * 0.3))); // 最外凸 30%
  const favg = (f) => front.reduce((s, q) => s + f(q), 0) / front.length;
  console.log(`${name}: n=${n} 全体 lum=${avg(q => q.lum).toFixed(2)} sat=${avg(q => q.sat).toFixed(2)} r=${avg(q => q.r).toFixed(2)}  外凸30% lum=${favg(q => q.lum).toFixed(2)} sat=${favg(q => q.sat).toFixed(2)} r=${favg(q => q.r).toFixed(2)} g=${favg(q => q.g).toFixed(2)} b=${favg(q => q.b).toFixed(2)} zMax=${rows[0] ? rows[0].cz.toFixed(3) : '?'}`);
}
