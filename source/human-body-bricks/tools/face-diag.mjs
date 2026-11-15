// 从 daily.glb 的 hair 节点 dump 眼部/脸颊区域顶点统计
import fs from 'node:fs';
const b = fs.readFileSync('assets/daily.glb');
const jsonLen = b.readUInt32LE(12);
const json = JSON.parse(b.slice(20, 20 + jsonLen).toString('utf8'));
let binLen = 0, binOff = -1;
for (let off = 20 + jsonLen; off < b.length - 4; off++) {
  if (b.readUInt32LE(off + 4) === 0x004e4942) { binLen = b.readUInt32LE(off); binOff = off + 8; break; }
}
const bin = b.subarray(binOff, binOff + binLen);
const nodeName = process.argv[2] || 'hair';
const nodeIdx = json.nodes.findIndex(n => n.name === nodeName);
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
  throw new Error('ct ' + acc.componentType);
};
const P0 = rd(prim.attributes.POSITION), C = rd(prim.attributes.COLOR_0);
const P = new Float32Array(P0.length);
for (let i = 0; i < P0.length; i++) P[i] = P0[i] + T[i % 3];
const n = P.length / 3;
console.log(`节点 ${nodeName}: ${n} 顶点`);
const lum = i => 0.299 * C[i * 4] / 255 + 0.587 * C[i * 4 + 1] / 255 + 0.114 * C[i * 4 + 2] / 255;
// 眼带（y 1.60-1.65）低饱和亮色与暗色分布
let bright = [], dark = [];
for (let i = 0; i < n; i++) {
  const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
  if (y < 1.595 || y > 1.655 || z < 0.09) continue;
  const r = C[i * 4] / 255, g = C[i * 4 + 1] / 255, b2 = C[i * 4 + 2] / 255;
  const L = lum(i), sat = Math.max(r, g, b2) - Math.min(r, g, b2);
  if (L > 0.66 && sat < 0.09) bright.push([x, y, z, L, sat]);
  if (L < 0.5) dark.push([x, y, z, L, sat]);
}
console.log(`眼带亮色 ${bright.length} 暗色 ${dark.length}`);
for (const [tag, arr] of [['亮', bright], ['暗', dark]]) {
  arr.sort((a, b2) => b2[3] - a[3]);
  console.log(`  ${tag} 前8:`, arr.slice(0, 8).map(v => `(${v[0].toFixed(3)},${v[1].toFixed(3)},${v[2].toFixed(3)} L${v[3].toFixed(2)} S${v[4].toFixed(2)})`).join(' '));
}
// x 分布（眼带内 z>0.10 的全部顶点）
const bins = new Map();
for (let i = 0; i < n; i++) {
  const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
  if (y < 1.595 || y > 1.655 || z < 0.10) continue;
  const k = Math.round(x * 100) / 100;
  if (!bins.has(k)) bins.set(k, { n: 0, zMax: -Infinity, lumMax: 0, lumMin: 1 });
  const bb = bins.get(k); bb.n++;
  if (z > bb.zMax) bb.zMax = z;
  const L = lum(i);
  if (L > bb.lumMax) bb.lumMax = L;
  if (L < bb.lumMin) bb.lumMin = L;
}
console.log('眼带 x 分箱（5cm 带内）:');
for (const [k, v] of [...bins.entries()].sort((a, b2) => a[0] - b2[0])) console.log(`  x=${k.toFixed(2)} n=${v.n} zMax=${v.zMax.toFixed(3)} L∈[${v.lumMin.toFixed(2)},${v.lumMax.toFixed(2)}]`);
// 脸颊区域：y 1.565-1.62，x 0.02-0.06 的 z 分布
const cb = new Map();
for (let i = 0; i < n; i++) {
  const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
  const ax = Math.abs(x);
  if (y < 1.560 || y > 1.625 || ax < 0.02 || ax > 0.065 || z < 0.0) continue;
  const k = `${Math.round(y * 100) / 100}`;
  if (!cb.has(k)) cb.set(k, { n: 0, zMax: -Infinity, axMin: 1, axMax: 0 });
  const v = cb.get(k); v.n++;
  if (z > v.zMax) v.zMax = z;
  v.axMin = Math.min(v.axMin, ax); v.axMax = Math.max(v.axMax, ax);
}
console.log('脸颊区域 y 分箱:');
for (const [k, v] of [...cb.entries()].sort((a, b2) => a[0] - b2[0])) console.log(`  y=${k} n=${v.n} zMax=${v.zMax.toFixed(3)} |x|∈[${v.axMin.toFixed(3)},${v.axMax.toFixed(3)}]`);

// —— 眼部聚类（修正 z 过滤后）——
const eyeDark = [];
for (let i = 0; i < n; i++) {
  const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
  if (z < 0.085) continue;
  if (y < 1.598 || y > 1.648) continue;
  if (Math.abs(x) > 0.075) continue;
  if (lum(i) > 0.55) continue;
  eyeDark.push([x, y, z]);
}
const cl = [];
for (const d of eyeDark) {
  let best = null, bd = 0.009;
  for (const c of cl) {
    const dd = Math.hypot(d[0] - c.cx, d[1] - c.cy, d[2] - c.cz);
    if (dd < bd) { bd = dd; best = c; }
  }
  if (best) { best.n++; best.cx += (d[0] - best.cx) / best.n; best.cy += (d[1] - best.cy) / best.n; best.cz += (d[2] - best.cz) / best.n; }
  else cl.push({ n: 1, cx: d[0], cy: d[1], cz: d[2] });
}
console.log('眼部暗色聚类（z>0.085, y 1.598-1.648, L<0.55）:');
cl.filter(c => c.n >= 6).sort((a, b2) => b2.n - a.n).forEach((c, i) => console.log(`  簇${i}: n=${c.n} c=(${c.cx.toFixed(3)}, ${c.cy.toFixed(3)}, ${c.cz.toFixed(3)})`));

// —— 眼位推算：暗色顶点按 (1-L) 加权质心（虹膜最暗，权重最大）——
for (const side of [-1, 1]) {
  let sx = 0, sy = 0, sz = 0, sw = 0;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (x * side < 0.012 || x * side > 0.072) continue;
    if (y < 1.610 || y > 1.634) continue;
    if (z < 0.09) continue;
    const L = lum(i);
    if (L > 0.62) continue;
    const w = (0.62 - L) + 0.05;
    sx += x * w; sy += y * w; sz += z * w; sw += w;
  }
  if (sw > 0) console.log(`  眼位(${side > 0 ? '右' : '左'}): (${(sx / sw).toFixed(3)}, ${(sy / sw).toFixed(3)}, ${(sz / sw).toFixed(3)}) w=${sw.toFixed(2)}`);
}

// —— 疣状物颜色采样：内眼角 / 下巴 区域的三角形颜色 vs 附近皮肤 ——
function triColors(px, pc, pi) {
  const out = [];
  for (let t = 0; t < pi.length; t += 3) {
    const a = pi[t], b2 = pi[t + 1], c2 = pi[t + 2];
    const cx = (px[a * 3] + px[b2 * 3] + px[c2 * 3]) / 3;
    const cy = (px[a * 3 + 1] + px[b2 * 3 + 1] + px[c2 * 3 + 1]) / 3;
    const cz = (px[a * 3 + 2] + px[b2 * 3 + 2] + px[c2 * 3 + 2]) / 3;
    const r = (pc[a * 4] + pc[b2 * 4] + pc[c2 * 4]) / (3 * 255), g = (pc[a * 4 + 1] + pc[b2 * 4 + 1] + pc[c2 * 4 + 1]) / (3 * 255), bl = (pc[a * 4 + 2] + pc[b2 * 4 + 2] + pc[c2 * 4 + 2]) / (3 * 255);
    out.push({ cx, cy, cz, r, g, b: bl, lum: 0.299 * r + 0.587 * g + 0.114 * bl, sat: Math.max(r, g, bl) - Math.min(r, g, bl) });
  }
  return out;
}
