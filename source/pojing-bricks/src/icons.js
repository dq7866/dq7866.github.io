// 图标渲染：用同一套几何在离屏渲染器里画出积木小图
import * as THREE from '../lib/three.module.js';
import { buildBrickGeometry, shapeBounds } from './geom.js';

const SIZE = 192;   // 2x 余量：按钮放大后图标依然锐利

/**
 * 按类别着色：一眼区分"基础/圆弧/斜面/造型"四大类，
 * 33 个形状缩略图不再是同一种颜色的模糊剪影。
 */
const CAT_COLORS = {
  base: 0xe0884e,   // 暖砖橙——方块砖块
  round: 0x53b8e0,  // 天空蓝——圆柱球体
  slope: 0x67b56d,  // 草地绿——斜面楼梯
  fun: 0xc06ad0,    // 葡萄紫——造型装饰
  lock: 0x5ec9a8,   // 铜绿——榫卯咬合件
  join: 0xe8b64b,   // 金属黄——铆钉螺钉连接件
  mech: 0x93a6cc,   // 钢灰蓝——齿轮轴链机械件
};
function catColor(shape) { return CAT_COLORS[shape.cat] || 0xe0884e; }

/**
 * 离屏渲染器全局只建一个（浏览器 WebGL 上下文通常上限 16 个，
 * 每张图纸各建一个会挤爆上限，导致主画面或缩略图渲染失败）
 */
let offscreen = null;
function offscreenRenderer() {
  if (!offscreen) {
    offscreen = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    offscreen.setPixelRatio(1);
    offscreen.toneMapping = THREE.ACESFilmicToneMapping;
    offscreen.toneMappingExposure = 1.15;
  }
  return offscreen;
}

/** 图纸全部渲染完后释放（之后若还要用会自动重建） */
export function disposeOffscreen() {
  if (!offscreen) return;
  try { offscreen.dispose(); offscreen.forceContextLoss?.(); } catch { }
  offscreen = null;
}

/** 把当前离屏画布内容拷进一张 2D 画布（WebGL 画布会被后续渲染覆盖，必须立刻拷贝） */
function grab(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(offscreen.domElement, 0, 0, w, h);
  return cv;
}

// 图标用的场景/相机/材质只建一次，之后每个形状复用；
// 形状从 17 种涨到 33 种后，一次性全渲染会明显拖慢启动，所以改成
// 由 main.js 分帧调用 renderOne()，画完再 disposeIconKit() 收尾。
let kit = null;
function iconKit() {
  if (kit) return kit;
  const renderer = offscreenRenderer();
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5566aa, 1.45));
  // 主光更亮 + 侧逆光勾边：形状轮廓在深色按钮底上立得住，不再是一团剪影
  const d1 = new THREE.DirectionalLight(0xffffff, 3.4); d1.position.set(4, 7, 5); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xa9c4ff, 1.6); d2.position.set(-5, 3, -4); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0xffe2b8, 1.2); d3.position.set(2, -4, -6); scene.add(d3);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const holder = new THREE.Group();
  scene.add(holder);
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.42, metalness: 0.02,
  });
  kit = { renderer, scene, camera, holder, mat };
  return kit;
}

/** 渲染单个形状的小图（可带零件参数），返回可直接 drawImage 的 2D 画布 */
export function renderOne(shape, params = {}) {
  if (shape.sprite) return decoIcon(shape);
  const { renderer, scene, camera, holder, mat } = iconKit();
  while (holder.children.length) holder.remove(holder.children[0]);

  const { group } = buildBrickGeometry(shape, params);
  const b = shapeBounds(shape);
  group.traverse(o => { if (o.isMesh) o.material = mat; });
  group.position.set(-b.w / 2, 0, -b.d / 2);
  holder.add(group);

  mat.color.setHex(catColor(shape));

  const span = Math.max(b.w, b.d, b.h * 1.15);
  // 收紧机距：形状在按钮里占得更满（约 82%），小方块也能看清轮廓
  const dist = span * 2.08 + 1.4;
  camera.position.set(dist * 0.62, dist * 0.58, dist * 0.92);
  camera.lookAt(0, (b.h * 0.98) / 2, 0);

  renderer.render(scene, camera);
  const cv = grab(SIZE, SIZE);
  // 临时几何体用完即释放（几何本体在 geoCache 里另有副本）
  group.traverse(o => { if (o.isMesh) o.geometry?.dispose(); });
  return cv;
}

/** 图标全部画完后释放临时场景（WebGL 渲染器本身留给缩略图复用） */
export function disposeIconKit() {
  if (!kit) return;
  kit.mat.dispose();
  while (kit.holder.children.length) kit.holder.remove(kit.holder.children[0]);
  kit = null;
}

/**
 * 装饰件的小图（v1.29.0）
 *
 * 装饰件是 Sprite 贴图，没有实体几何：丢进 3D 离屏渲染器只会得到一片空白
 * （WebGL 渲染时贴图往往还没 load 完）。这里直接在 2D 画布上等比摆放原图，
 * 又快又清楚，还不用占一个 WebGL 上下文。
 *
 * 图片是异步的：第一次调用先返回空白画布，load 完再往同一张画布上补画——
 * 因此**必须**把这个画布留在 DOM 里，不要中途 dispose。
 */
const _decoImg = new Map();
export function decoIcon(shape, size = SIZE) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  const paint = img => {
    ctx.clearRect(0, 0, size, size);
    const pad = size * 0.08;
    const k = Math.min((size - pad * 2) / img.width, (size - pad * 2) / img.height);
    const w = img.width * k, h = img.height * k;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  };
  let rec = _decoImg.get(shape.sprite);
  if (!rec) {
    const img = new Image();
    rec = { img, ready: false, waiters: [] };
    _decoImg.set(shape.sprite, rec);
    img.onload = () => { rec.ready = true; rec.waiters.forEach(f => f(img)); rec.waiters.length = 0; };
    img.onerror = () => { rec.waiters.length = 0; };
    img.src = shape.sprite;
  }
  if (rec.ready) paint(rec.img);
  else rec.waiters.push(paint);
  return cv;
}

/** 图纸缩略图：临时场景渲染整个模型 */
export function makeThumbCanvas(model, list, addBrickToScene) {
  const W = 400, H = 300;
  const r = offscreenRenderer();
  // 缩略图卡片实际只显示 200px 宽左右，2 倍像素 + 1024 阴影图纯属浪费：
  // 8 张连着渲染时这点开销会被放大成肉眼可见的卡顿
  r.setPixelRatio(1.5);
  r.setSize(W, H, false);
  r.setClearColor(0x0f1330, 1);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.18;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1330);
  scene.fog = new THREE.Fog(0x0f1330, 46, 110);

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2c52, 2.0));
  const dl = new THREE.DirectionalLight(0xfff2dd, 3.0);
  dl.position.set(14, 22, 12);
  dl.castShadow = true;
  dl.shadow.mapSize.set(512, 512);
  dl.shadow.camera.left = -22; dl.shadow.camera.right = 22;
  dl.shadow.camera.top = 22; dl.shadow.camera.bottom = -22;
  dl.shadow.normalBias = 0.04;
  scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0x7c9cff, 1.1);
  dl2.position.set(-10, 8, -12);
  scene.add(dl2);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(70, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a2148, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  list.forEach(d => addBrickToScene(scene, d));

  const cam = model.cam || { theta: -0.75, phi: 1.05, dist: 24 };
  const sp = Math.sin(cam.phi);
  const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 400);
  const targetY = 2;
  camera.position.set(
    cam.dist * sp * Math.sin(cam.theta),
    cam.dist * Math.cos(cam.phi) + targetY,
    cam.dist * sp * Math.cos(cam.theta)
  );
  camera.lookAt(0, targetY, 0);

  r.render(scene, camera);
  const cv = grab(W, H);
  // 注意：缩略图里的积木用的是主场景共享的几何与材质缓存，绝不能在这里 dispose，
  // 否则主画面的积木会一起被销毁。这里只丢弃本场景独有的地面。
  ground.geometry.dispose();
  ground.material.dispose();
  return cv;
}
