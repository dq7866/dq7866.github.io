// body.js — 真实解剖模型装配层
// 运行时只读 assets/body.glb（由 tools/cook.mjs 离线烘焙：两个开放数据集已合并、
// 简化、换算成米、脚底 y=0）。几何是纯 Float32，无量化、无压缩扩展。
//
// 节点名就是应用里的「形状 id」，几何已按形状中心居中，节点平移即形状中心。
// 这样运行时不需要再做标定、也不需要猜名字。
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { buildProceduralGroup } from './body-lite.js';

/** 装配结果：partId -> { meshes:[{mesh}], box, center, residual } */
let ASSET = null;

/** 人体在世界里的缩放：模型是米制，场景需要约 7.7 单位高 */
export const bodyMeta = {
  source: 'procedural',
  scale: 1,
  height: 7.7,
  minY: 0,
  stats: { parts: 0, triangles: 0 },
};

const gltfLoader = new GLTFLoader();

function parseGLB(buffer) {
  return new Promise((resolve, reject) => gltfLoader.parse(buffer, '', resolve, reject));
}

async function fetchBuffer(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} 加载失败 HTTP ${res.status}`);
  const total = Number(res.headers.get('Content-Length') || 0);
  if (!res.body || !onProgress || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded / total);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out.buffer;
}

/** 单文件版：模型以 base64 内嵌，双击打开也能看到真实解剖模型 */
function embeddedBuffer(varName = '__HB_EMBEDDED_BODY__') {
  const b64 = globalThis[varName];
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** 解析一个烘焙 GLB，把节点并入 parts/extras（body.glb 与 daily.glb 共用同一约定） */
function collectNodes(gltf, parts, extras, boxAll, stats) {
  gltf.scene.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const id = o.name;
    if (!id) return;
    const g = o.geometry;
    const a = g.attributes.position;
    if (!a) return;
    g.computeBoundingBox();
    // 烘焙 GLB 若缺 POSITION accessor 的 min/max，GLTFLoader 会算出半径 0 的
    // 包围球 → 射线拾取全部失败（能看见却点不中）。这里强制重算兜底。
    g.computeBoundingSphere();

    // 每个形状一份材质，互不干扰（高亮 / 淡出 / 幽灵都要能单独改）
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.015,
      vertexColors: !!g.attributes.color,
      side: THREE.DoubleSide, // 薄片结构（肌肉包膜、心包）双面渲染更稳
    });

    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.partId = id;

    const center = o.position.clone();
    const box = g.boundingBox.clone().translate(center);
    const residual = !!(o.userData && o.userData.residual);

    const rec = { id, center, box, meshes: [{ mesh }], residual };
    (residual ? extras : parts).set(id, rec);

    boxAll.union(box);
    stats.triangles += (g.index ? g.index.count : a.count) / 3;
  });
}

/**
 * 加载烘焙后的解剖模型。
 * @param {{base?:string, onProgress?:(stage:string,k:number)=>void}} opts
 * @returns {Promise<{parts:Map, extras:Map, scale:number, height:number, minY:number}>}
 */
export async function loadBodyAssets({ base = 'assets/', onProgress } = {}) {
  const report = (stage, k) => onProgress && onProgress(stage, k);
  report('load', 0);

  const embedded = embeddedBuffer('__HB_EMBEDDED_BODY__');
  const buf = embedded || await fetchBuffer(`${base}body.glb`, k => report('load', k));
  report('parse', 0);
  const gltf = await parseGLB(buf);

  const parts = new Map();
  const extras = new Map();
  const boxAll = new THREE.Box3();
  const stats = { triangles: 0 };

  collectNodes(gltf, parts, extras, boxAll, stats);

  if (!parts.size) throw new Error('body.glb 里没有可识别的形状节点');

  // 日常人体模型（可选缺失）：节点名 = 日常部位 id，并入同一张装配表
  try {
    const dailyBuf = embeddedBuffer('__HB_EMBEDDED_DAILY__') || await fetchBuffer(`${base}daily.glb`);
    const dailyGltf = await parseGLB(dailyBuf);
    collectNodes(dailyGltf, parts, extras, boxAll, stats);
  } catch (e) {
    // daily.glb 缺失/损坏不致命：日常部位回退到程序化造型
    console.warn('daily.glb 加载失败，日常部位回退程序化造型：', e.message);
  }

  bodyMeta.source = 'glb';
  bodyMeta.height = boxAll.max.y - boxAll.min.y;
  bodyMeta.minY = boxAll.min.y;
  bodyMeta.scale = 7.7 / bodyMeta.height;
  bodyMeta.stats = { parts: parts.size, triangles: Math.round(stats.triangles) };

  return {
    parts,
    extras,
    scale: bodyMeta.scale,
    height: bodyMeta.height,
    minY: boxAll.min.y,
  };
}

/**
 * 程序化解剖牙列：AI 牙齿 3D 生成队列受并发限制一直没到货，这里做完整替代。
 * 上下颌各 16 颗恒牙（切牙 / 尖牙 / 前磨牙 / 磨牙按真实比例渐变），
 * 米制坐标与 daily.glb 的头部对齐，唇线间微微露齿，保证形状看得见也点得中。
 * 几何与材质共享，拾取 / 高亮 / 淡出 / 幽灵空位全部复用既有通用逻辑。
 */
function createTeethGroup(part) {
  const g = new THREE.Group();
  g.name = 'teeth-procedural';
  // 拾取靠 partId 沿父链找形状，程序化造型必须自己挂上，否则看得见却点不中
  g.userData.partId = part.id;
  const u = bodyMeta.source === 'glb' ? 1 : 8 / 1.71;

  const crownGeo = new THREE.SphereGeometry(1, 12, 9);
  // 不上自发光/强高光：bloom 会把 32 颗牙糊成一条亮白线
  const enamel = new THREE.MeshPhysicalMaterial({
    color: 0xc9c2b2, roughness: 0.62, metalness: 0,
    clearcoat: 0.18, clearcoatRoughness: 0.40,
  });
  const rootMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbb98f, roughness: 0.68, metalness: 0,
  });

  // 一侧 8 颗：中切牙 → 侧切牙 → 尖牙 → 前磨牙 ×2 → 磨牙 ×3
  // [近远中宽, 冠高, 唇舌径]，单位米
  const SPECS = [
    [0.0044, 0.0092, 0.0040], [0.0039, 0.0086, 0.0039],
    [0.0045, 0.0108, 0.0044], [0.0048, 0.0082, 0.0050],
    [0.0048, 0.0080, 0.0050], [0.0062, 0.0076, 0.0060],
    [0.0059, 0.0072, 0.0058], [0.0052, 0.0067, 0.0052],
  ];

  for (const row of [1, -1]) {            // 1 上颌，-1 下颌
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const a = (i + 0.5) / 8 * Math.PI * 0.55;
        const x = side * (0.040 * Math.sin(a));       // 牙弓由中线向两侧展开
        // 门牙略前露于唇线（既像微露齿，也让它在拾取时压过 mouth 贴片），
        // 后牙逐颗退向咽侧；下排整体再收进唇后，避免上下牙连成一条白线
        const z = 0.1262 + (i <= 1 ? 0.0040 : 0) - 0.042 * (1 - Math.cos(a))
                  - (row < 0 ? 0.0035 : 0);
        const [w, h, d] = SPECS[i];
        // 上下牙之间留一道暗缝，远看才不会连成一条白线
        const y = row > 0 ? 1.5740 : 1.5575;

        const crown = new THREE.Mesh(crownGeo, enamel);
        crown.position.set(x * u, y * u, z * u);
        crown.scale.set(w * u, h * 0.42 * u, d * u);
        g.add(crown);

        const root = new THREE.Mesh(crownGeo, rootMat);
        root.position.set(x * u, (y + row * h * 0.38) * u, (z - 0.0015) * u);
        root.scale.set(w * 0.52 * u, h * 0.30 * u, d * 0.52 * u);
        g.add(root);

        crown.userData.partId = part.id;
        root.userData.partId = part.id;
      }
    }
  }
  return g;
}

/** 组装：把一个形状的网格塞进 Group，并把 Group 原点放到形状中心 */
export function createPartGroup(part) {
  const rec = ASSET && ASSET.get(part.id);
  if (!rec || !rec.meshes.length) {
    // 牙齿：AI 资产未到货时用解剖牙列补齐，不再留「模型生成中」的空缺
    if (part.id === 'teeth') return createTeethGroup(part);
    // 日常人体：AI 模型未到货时保持空缺（零件盘标注「生成中」），
    // 不回退到旧的程序化体块——避免和真人观感混在一起
    if (part.system === 'daily') return new THREE.Group();
    // 兜底：程序化建模（膈肌等模型未收录的形状也走这里）
    const g = buildProceduralGroup(part);
    if (bodyMeta.source === 'glb') {
      // 程序化造型按 8 单位体高建模，这里换算成米制。
      // 注意：烘焙到子网格，不能改 group.scale——applyVisibility 每帧会把它重置成 1
      const k = bodyMeta.height / 8;
      g.traverse(o => {
        if (!o.isMesh) return;
        o.position.multiplyScalar(k);
        o.scale.multiplyScalar(k);
      });
      g.position.multiplyScalar(k);
    }
    return g;
  }
  return groupOfRecord(part.id, rec);
}

/** 由装配记录生成一个 Group（形状本体与残差层共用） */
export function groupOfRecord(id, rec) {
  const group = new THREE.Group();
  group.position.copy(rec.center);
  rec.meshes.forEach(({ mesh }) => {
    const m = mesh.clone();       // 共享几何与材质，独立 transform
    m.position.set(0, 0, 0);      // 几何本身已按形状中心居中
    m.userData.partId = id;
    group.add(m);
  });
  group.userData.partId = id;
  return group;
}

/** 供 app.js 在资源加载完成后注入装配结果 */
export function setAssetParts(map) { ASSET = map; }

/** 收集部件里的所有材质（用于高亮 / 透视 / 幽灵） */
export function partMaterials(group) {
  const set = new Set();
  group.traverse(o => { if (o.isMesh) set.add(o.material); });
  return [...set];
}

export function setHighlight(group, on) {
  group.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const m = o.material;
    if (!m.emissive) return;
    if (on) {
      if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissive.getHex();
      m.emissive.setHex(0x2f7f9e);
      m.emissiveIntensity = 0.55;
    } else if (m.userData.baseEmissive !== undefined) {
      m.emissive.setHex(m.userData.baseEmissive);
      m.emissiveIntensity = 1;
    }
  });
}

export function setGhost(group, withEdges = true) {
  group.traverse(o => {
    if (!o.isMesh) return;
    o.material = new THREE.MeshStandardMaterial({
      color: 0x7fd8ea,
      transparent: true,
      opacity: 0.13,
      roughness: 0.9,
      metalness: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    o.castShadow = false;
    // 描边让空位看得清；真实模型三角形太多，算边缘会卡，跳过
    if (withEdges && !o.userData.edge) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(o.geometry, 32),
        new THREE.LineBasicMaterial({ color: 0x8fe3f2, transparent: true, opacity: 0.5 })
      );
      o.add(edges);
      o.userData.edge = edges;
    }
  });
  group.userData.ghost = true;
}

/** 整体透明度（骨骼透视/淡出） */
export function setGroupOpacity(group, opacity) {
  group.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const m = o.material;
    if (!m.userData.userOpacity) m.userData.userOpacity = 1;
    m.userData.userOpacity = opacity;
    m.transparent = opacity < 1;
    m.opacity = opacity;
    m.depthWrite = opacity > 0.6;
    m.needsUpdate = true;
  });
  group.visible = opacity > 0.02;
}
