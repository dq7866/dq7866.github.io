// 主程序
import * as THREE from '../lib/three.module.js';
import { SHAPES, SHAPE_CATS, PALETTE, getShape, COLOR_HEX } from './shapes.js';
import { loadCustomShapes, saveCustom, deleteCustom, findCustom, toShapeDef, MAX_VOX } from './customShapes.js';
import { shapeRot, shapeBounds, buildBrickGeometry, rodPose, CONROD_PIN } from './geom.js';
import { World, makeMaterial, setStuds } from './world.js';
import { OrbitCam, fitCameraToBox } from './camera.js';
import { buildEnvironment } from './env.js';
import { renderOne, disposeIconKit, makeThumbCanvas, disposeOffscreen } from './icons.js';
import { MODELS, DIFFS, diffOf } from './blueprints.js';
import { buildDrivetrain, pistonStroke, sliderTravel } from './drive.js';
import { sfx, setSoundEnabled } from './audio.js';
import { DropAnimator, DebrisSystem } from './physics.js';
import { score as scoreModel, centerList, LEVELS } from './challenge.js';
import { say, sayNow, setSpeechEnabled, speechSupported, whenVoicesReady, randomPraise } from './speech.js';
import { APP_VERSION, APP_DATE, CHANGELOG, KEYS, FAQ } from './about.js';
import { installErrorGuard, setErrorNotifier, safeRun } from './errors.js';
import { checkCatalog } from './catalog-check.js';
import {
  initAchievements, setAchievementNotify, track, trackShape, trackColor,
  trackStars, trackCastleClear, resetSession, renderAchievements,
} from './achievements.js';

// ===================== 渲染器 / 场景 =====================
// 先把全局错误兜底装上：之后任何未捕获异常都会进控制台并给用户一句人话提示，
// 而不是让界面静默卡住（"点了没反应"是用户最没法自助的故障）
installErrorGuard();

const canvas = document.getElementById('scene');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (err) {
  showNoWebGL();
  throw err;
}

function showNoWebGL() {
  document.getElementById('noWebGL').classList.remove('hidden');
  const l = document.getElementById('loading');
  if (l) l.remove();
}

// 检测上下文丢失（某些驱动会中途失效）
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  showNoWebGL();
});
// 像素比封顶：桌面 2x 足够清晰；触屏设备（手机/平板）封到 1.5x，
// 否则 3x 屏要渲染 9 倍像素，中低端机直接掉到十几帧。
const DPR_CAP = (() => {
  try { return matchMedia('(pointer: coarse)').matches ? 1.5 : 2; } catch { return 2; }
})();
renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x141a38, 62, 150);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
camera.position.set(22, 20, 26);

const env = buildEnvironment(scene, renderer);
const orbit = new OrbitCam(camera, canvas);
const world = new World(scene);
const dropAnim = new DropAnimator();
const debris = new DebrisSystem(scene);

// ===================== 自适应取景 =====================
/** 当前积木的世界包围盒；空场时按图纸占位格兜底（挑战模式还没开始搭） */
function modelBox(list) {
  world.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(world.group);
  if (!box.isEmpty()) return box.expandByScalar(0.28);
  const b = new THREE.Box3();
  for (const d of list || []) {
    const sh = shapeRot(getShape(d.shapeId), d.rx || 0, d.ry || 0, d.rz || 0);
    for (const c of sh.cells) {
      b.expandByPoint(new THREE.Vector3(d.x + c.c, d.y + c.l, d.z + c.r));
      b.expandByPoint(new THREE.Vector3(d.x + c.c + 1, d.y + c.l + 1, d.z + c.r + 1));
    }
  }
  return b.isEmpty() ? b : b.expandByScalar(0.28);
}

/** 图纸 / 挑战加载：按模型的真实尺寸取景，小图不空一大圈、高塔不裁顶 */
function frameModel(model, expand = 0) {
  const cam = model?.cam;
  const box = modelBox(model?.list);
  if (!cam || box.isEmpty()) return;
  const fit = fitCameraToBox(box, cam.theta, cam.phi, camera.fov, camera.aspect, 1.08 * (1 + expand));
  orbit.flyTo(cam.theta, cam.phi, fit.dist, fit.target);
}

/** 顶视 / 正视 / 环绕三个预设同样跟着当前模型走；「飞近」保持刻意贴近 */
function frameView(theta, phi) {
  const box = modelBox();
  if (box.isEmpty()) box.set(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 4, 4));
  const fit = fitCameraToBox(box, theta, phi, camera.fov, camera.aspect, 1.08);
  orbit.flyTo(theta, phi, fit.dist, fit.target);
}

// 几何缓存（键必须包含三轴旋转，否则旋转后拿到的还是旧几何）
const geoCache = new Map();
function geoFor(shape, params = {}) {
  // 缓存键要带零件参数：图纸里 16 齿和 8 齿的齿轮是两块不同几何
  const pk = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join(',');
  const k = `${shape.id}#${shape.rx || 0},${shape.ry || 0},${shape.rz || 0}#${pk}`;
  if (!geoCache.has(k)) geoCache.set(k, buildBrickGeometry(shape, params));
  return geoCache.get(k);
}

// ===================== 状态 =====================
const state = {
  shapeId: 'cube',
  color: 'red',
  rx: 0,
  ry: 0,
  rz: 0,
  tool: 'place',
  hover: null,
  selected: null,   // 选择模式下当前选中的零件（只查看、不修改）
  pickMode: false,  // 正在「存为形状」：点积木就是往选区里加减
  picked: [],       // 选区里的积木（引用，保存前按 id 校验存活）
  blueprint: null,  // 当前正在搭的图纸 {id,name,icon,count}；null = 自由创作
  snap: true,
};

let lineStart = null;   // 连排工具的起点（第一次点击位置）

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-5, -5);
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
let pointerInside = false;
let elapsed = 0;

const rotNow = () => shapeRot(getShape(state.shapeId), state.rx, state.ry, state.rz);
const boundsNow = () => shapeBounds(rotNow());

// ===================== 幽灵积木 =====================
const ghost = new THREE.Group();
scene.add(ghost);
let ghostMesh = null;
let ghostMat = null;

function rebuildGhost() {
  if (ghostMesh) {
    ghost.remove(ghostMesh);
    ghostMat?.dispose();
    ghostMesh = null;
  }
  const shape = rotNow();
  const { group } = geoFor(shape);
  ghostMesh = group.clone(true);
  const hex = COLOR_HEX[state.color] ?? 0xffffff;
  ghostMat = new THREE.MeshStandardMaterial({
    color: hex,
    emissive: new THREE.Color(hex).multiplyScalar(0.22),
    roughness: 0.35,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  ghostMesh.traverse(o => { if (o.isMesh) { o.material = ghostMat; o.castShadow = false; o.receiveShadow = false; } });
  ghost.add(ghostMesh);
  ghost.visible = false;
}

// 旋转动画
let ghostSpin = { x: 0, y: 0, z: 0 };
let spinTarget = { x: 0, y: 0, z: 0 };

// ===================== 吸附计算 =====================
function alignOffset(v, span) { return Math.round(v) - Math.floor((span - 1) / 2); }

function nearestFree(x, y, z) {
  if (y >= 0 && world.canPlace(state.shapeId, state.rx, state.ry, state.rz, x, y, z)) return { x, y, z, mode: 'place' };
  // 关闭「吸附对齐」时不做邻近兜底：指哪就必须能放哪，放不下就提示
  if (!state.snap) return { x, y, z, mode: 'place', invalid: true };
  const cands = [];
  for (let dy = 0; dy <= 6; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        cands.push({ x: x + dx, y: Math.max(0, y + dy), z: z + dz, d: dx * dx + dz * dz + dy * dy * 2.4 });
      }
    }
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) {
    if (world.canPlace(state.shapeId, state.rx, state.ry, state.rz, c.x, c.y, c.z)) return { ...c, mode: 'place' };
  }
  return { x, y, z, mode: 'place', invalid: true };
}

function computeHover() {
  if (replaying) return null;      // 回放过程中不显示落点框，免得和动画打架
  if (!pointerInside) return null;
  raycaster.setFromCamera(pointer, camera);
  const b = boundsNow();

  if (state.tool === 'erase' || state.tool === 'paint' || state.tool === 'adjust' || state.tool === 'select') {
    const hits = raycaster.intersectObjects(world.meshes(), true);
    if (hits.length) {
      const brick = brickFrom(hits[0].object);
      if (brick) return { x: brick.x, y: brick.y, z: brick.z, brick, mode: state.tool };
    }
    return null;
  }

  const hits = raycaster.intersectObjects(world.meshes(), true)
    // 装饰件是 Sprite，没有 face（没有面法线），下面的 hit.face.normal 会直接崩。
    // 而且装饰件是"看穿"的贴纸：它不该挡住落点判定，射线应当穿过去命中它后面的
    // 地面/实心积木。所以这里把 Sprite 命中过滤掉。
    .filter(hh => hh.face && !(hh.object.userData && hh.object.userData.sprite));
  if (hits.length) {
    const hit = hits[0];
    const n = _hitNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    const p = hit.point;
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);

    let gx, gy, gz;
    if (ay >= ax && ay >= az) {
      gx = Math.floor(p.x); gz = Math.floor(p.z);
      gy = Math.round(p.y);
      if (n.y < 0) gy = Math.max(0, gy - 1);
    } else if (ax >= az) {
      gx = Math.floor(p.x + n.x * 0.5); gz = Math.floor(p.z);
      gy = Math.max(0, Math.round(p.y - 0.02));
    } else {
      gx = Math.floor(p.x); gz = Math.floor(p.z + n.z * 0.5);
      gy = Math.max(0, Math.round(p.y - 0.02));
    }
    return nearestFree(alignOffset(gx, b.w), gy, alignOffset(gz, b.d));
  }

  if (!raycaster.ray.intersectPlane(plane, hitPoint)) return null;
  return nearestFree(alignOffset(hitPoint.x, b.w), 0, alignOffset(hitPoint.z, b.d));
}

/** 选择模式下，把一块积木翻译成结构化信息：名字 + 角色 + 关键参数 + 位置 */
function partInfo(brick) {
  const d = getShape(brick.shapeId);
  if (!d) return { name: '未知零件', roles: [], params: [], pos: '' };
  const roles = [];
  if (d.power) roles.push('动力源');
  if (d.spin) roles.push('转动件');
  if (d.slide) roles.push('往复件');
  if (d.conrod) roles.push('连杆');
  if (d.rack) roles.push('齿条');
  if (d.chain) roles.push('链条');
  if (d.belt) roles.push('皮带');
  if (d.bevel) roles.push('锥齿轮');
  if (d.geneva) roles.push('槽轮');
  if (d.ratchet) roles.push('棘轮');
  if (d.deform) roles.push('弹性件');
  if (d.fix) roles.push('紧固件');
  if (!roles.length) roles.push('结构件');
  const params = [];
  if (d.teeth) params.push(`${brick.params?.teeth || d.teeth} 齿`);
  if (d.pdef) for (const p of d.pdef) {
    const v = brick.params?.[p.key] ?? p.def;
    if (v !== undefined) params.push(`${p.label || p.name || p.key} ${typeof p.fmt === 'function' ? p.fmt(v) : v}`);
  }
  return { name: d.name, roles, params, pos: `@(${brick.x},${brick.y},${brick.z})` };
}

/** 一句话描述（底部提示条用） */
function describePart(brick) {
  const i = partInfo(brick);
  const par = i.params.length ? ` · ${i.params.join(' ')}` : '';
  return `${i.name} · ${i.roles.join('/')}${par} ${i.pos}（选择模式：只查看，不改动）`;
}

// —— 选择信息卡：点中零件后一直显示它的名称/角色/参数，直到取消选择 ——
const selInfoEl = document.getElementById('selInfo');
function showSelInfo(brick) {
  if (!selInfoEl) return;
  const i = partInfo(brick);
  document.getElementById('siName').textContent = i.name;
  document.getElementById('siTag').textContent = i.roles[0] || '结构件';
  document.getElementById('siRole').textContent = i.roles.slice(1).join(' / ') || '静态结构件 · 不参与传动';
  const pEl = document.getElementById('siParams');
  pEl.innerHTML = '';
  for (const p of i.params) {
    const s = document.createElement('span');
    s.textContent = p;
    pEl.appendChild(s);
  }
  if (!i.params.length) pEl.innerHTML = '<span>无参数</span>';
  document.getElementById('siPos').textContent = `格子位置 ${i.pos.slice(1)}`;
  selInfoEl.classList.remove('hidden');
}
function hideSelInfo() { if (selInfoEl) selInfoEl.classList.add('hidden'); }

// —— 当前图纸徽标：从图纸页点进来后一直显示图纸名称 ——
const bpBadgeEl = document.getElementById('bpBadge');
function setBlueprint(model) {
  state.blueprint = model ? { id: model.id, name: model.name, icon: model.icon, count: model.list.length } : null;
  if (!bpBadgeEl) return;
  if (!model) { bpBadgeEl.classList.add('hidden'); return; }
  document.getElementById('bpBadgeName').textContent = `${model.icon || ''} ${model.name}`.trim();
  document.getElementById('bpBadgeMeta').textContent = `${model.list.length} 块`;
  bpBadgeEl.classList.remove('hidden');
  syncBlueprintCards();
}
/** 让图纸页的卡片高亮与「当前图纸」保持一致（翻回图纸页也能看出在搭哪张） */
function syncBlueprintCards() {
  const id = state.blueprint?.id || null;
  for (const c of bpCards) c.el.classList.toggle('bp-active', !!id && c.model.id === id);
}
if (bpBadgeEl) {
  document.getElementById('bpBadgeClose').onclick = () => {
    setBlueprint(null);
    hint('已退出这张图纸，可以继续自由创作', '#9ff6ff');
  };
}

function brickFrom(obj) {
  let o = obj;
  while (o && o.userData.brickId === undefined) o = o.parent;
  if (!o) return null;
  return world.brickById(o.userData.brickId);
}

// ===================== 辅助可视化 =====================
const fpGroup = new THREE.Group();
const fpEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
  new THREE.LineBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.95 })
);
fpEdge.rotation.x = -Math.PI / 2;
fpGroup.add(fpEdge);
const fpFill = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0x66e9ff, transparent: true, opacity: 0.12, depthWrite: false })
);
fpFill.rotation.x = -Math.PI / 2;
fpFill.position.y = 0.002;
fpGroup.add(fpFill);
fpGroup.visible = false;
scene.add(fpGroup);

const hl = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xff5470, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })
);
hl.visible = false;
scene.add(hl);

// 选择模式：被选中零件的持久高亮框（与悬停框 hl 区分——hl 跟随鼠标、selBox 跟随选中件）
const selBox = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x6bff9e, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide })
);
selBox.visible = false;
scene.add(selBox);

const ripple = new THREE.Mesh(
  new THREE.RingGeometry(0.34, 0.46, 40),
  new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
);
ripple.rotation.x = -Math.PI / 2;
ripple.visible = false;
scene.add(ripple);
let rippleLife = 1;

// 粒子池
const POP_MAX = 90;
const popGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
const popMesh = new THREE.InstancedMesh(
  popGeo,
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }),
  POP_MAX
);
popMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
popMesh.count = 0;
popMesh.frustumCulled = false;
scene.add(popMesh);

const popParticles = [];
for (let i = 0; i < POP_MAX; i++) {
  popParticles.push({ life: 0, max: 1, v: new THREE.Vector3(), p: new THREE.Vector3(), s: 1, color: new THREE.Color(0xffffff) });
}
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

function spawnPop(x, y, z, count, hex) {
  let placed = 0;
  for (const pt of popParticles) {
    if (placed >= count) break;
    if (pt.life > 0) continue;
    pt.life = 0.6 + Math.random() * 0.3;
    pt.max = pt.life;
    pt.p.set(x + (Math.random() - 0.5) * 1.0, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 1.0);
    pt.v.set((Math.random() - 0.5) * 3.2, 2.4 + Math.random() * 3, (Math.random() - 0.5) * 3.2);
    pt.s = 0.6 + Math.random() * 0.8;
    pt.color.setHex(hex);
    placed++;
  }
}

function updatePops(dt) {
  let idx = 0;
  for (const pt of popParticles) {
    if (pt.life > 0) {
      pt.life -= dt;
      pt.v.y -= 13 * dt;
      pt.p.addScaledVector(pt.v, dt);
      const k = Math.max(0, pt.life / pt.max);
      _s.setScalar(Math.max(0.001, pt.s * k));
      _m4.compose(pt.p, _q.identity(), _s);
      popMesh.setMatrixAt(idx, _m4);
      popMesh.setColorAt(idx, pt.color);
      idx++;
    }
  }
  popMesh.count = idx;
  popMesh.instanceMatrix.needsUpdate = true;
  if (popMesh.instanceColor) popMesh.instanceColor.needsUpdate = true;
}

// ===================== 操作 =====================
function doAction() {
  if (replaying) { hint('回放中，再点一次「回放搭建」可以停下', '#9ff6ff'); return; }
  // 快速轻点时两帧之间可能没有渲染循环，这里强制重算悬停，保证放置判定即时
  state.hover = computeHover();
  const h = state.hover;
  if (!h) return;

  // 选择工具：只查看不修改。点零件选中并显示信息，点空处取消选择。
  if (state.tool === 'select') {
    // 拾取模式（存为形状）：点积木就是加/减选区，点空处清空
    if (state.pickMode) {
      if (!h.brick) {
        state.picked = [];
        state.selected = null;
        hideSelInfo();
        updatePickBar();
        hint('点积木挑零件，挑完点下面的「存为形状」', '#9ff6ff');
        return;
      }
      const i = state.picked.findIndex(b => b.id === h.brick.id);
      if (i >= 0) state.picked.splice(i, 1); else state.picked.push(h.brick);
      state.selected = h.brick;
      showSelInfo(h.brick);
      sfx.pick();
      updatePickBar();
      hint(`已选 ${state.picked.length} 块（再点一次取消这一块）`, '#6bff9e');
      updateHint();
      return;
    }
    if (!h.brick) {
      state.selected = null;
      hideSelInfo();
      hint('已取消选择', '#9ff6ff');
      updateHint();
      return;
    }
    state.selected = h.brick;
    sfx.pick();
    showSelInfo(h.brick);
    hint(describePart(h.brick), '#6bff9e');
    updateHint();
    return;
  }

  // 装配工具：点零件弹出装配台，点空处收起
  if (state.tool === 'adjust') {
    if (!h.brick) { closeXform(); return; }
    openXform(h.brick);
    return;
  }
  if (state.tool === 'erase') {
    if (!h.brick) return;
    const br = h.brick;
    const sb = shapeBounds(shapeRot(getShape(br.shapeId), br.rx || 0, br.ry || 0, br.rz || 0));
    debris.burst(
      br.x + sb.w / 2, br.y + sb.h / 2, br.z + sb.d / 2,
      sb.w, sb.h, sb.d, COLOR_HEX[br.color] ?? 0xcccccc, 16
    );
    world.remove(br.id);
    sfx.remove();
    // 比拼规则：拆掉对方一块后同样换手，否则可以一直拆。
    // 注意要扣"被拆那块的主人"的分，否则拆对方的块会扣到自己头上
    if (versus.active) {
      const owner = br._by || versus.turn;
      versus.counts[owner] = Math.max(0, (versus.counts[owner] || 0) - 1);
      versus.turn = versus.turn === 'A' ? 'B' : 'A';
      versusUpdate();
    }
    say('拆掉啦，重新想想怎么搭。', { rate: 1.02, pulse: 1 });
    return;
  }
  if (state.tool === 'paint') {
    if (!h.brick) return;
    if (world.paint(h.brick.id, state.color)) sfx.paint();
    return;
  }
  if (h.invalid) { hint('这里放不下，稍微挪一下'); return; }

  // 连排工具：点第一下定起点，点第二下把中间整排填满
  if (state.tool === 'line') { runLineFill(h); return; }

  // 挑战模式：超出积木预算后不再允许放置
  if (challenge.active && challenge.level && world.bricks.length >= challenge.level.budget) {
    hint(`积木用完啦（限 ${challenge.level.budget} 块），点「验收」看得分`, '#ffb4b4');
    return;
  }

  // 成就统计
  track('place');
  trackShape(state.shapeId);

  const b = boundsNow();
  const added = [];
  const brick = world.add({ shapeId: state.shapeId, rx: state.rx, ry: state.ry, rz: state.rz, color: state.color, x: h.x, y: h.y, z: h.z }, { record: false });
  // 装饰件是水彩贴图（billboard），经不起实心积木那种"压扁回弹"的落地动画——
  // 那会让贴图忽宽忽窄，看着像散架/拆解。装饰件直接原地出现即可。
  const isDecoSprite = !!getShape(state.shapeId).sprite;
  if (brick && brick.mesh && !isDecoSprite) {
    dropAnim.add(brick.mesh, h.y, { drop: 1.8, bounce: 0.3 });
  }
  added.push(world.serialize(brick));

  // 镜像对称：在 X=0 平面另一侧同步放一块，搭对称建筑事半功倍
  const mirrorBox = document.getElementById('optMirror');
  // 比拼时关掉镜像：一次动作出两块，一方会凭空多拿一倍，规则说不清
  if (mirrorBox && mirrorBox.checked && !versus.active) {
    const mx = -h.x - b.w;
    if (!(mx === h.x) && world.canPlace(state.shapeId, state.rx, state.ry, state.rz, mx, h.y, h.z)) {
      const m2 = world.add({ shapeId: state.shapeId, rx: state.rx, ry: state.ry, rz: state.rz, color: state.color, x: mx, y: h.y, z: h.z }, { record: false });
      if (m2 && m2.mesh) dropAnim.add(m2.mesh, h.y, { drop: 2.1, bounce: 0.3, delay: 0.07 });
      added.push(world.serialize(m2));
      track('mirror');
      if (!isDecoSprite) spawnPop(mx + b.w / 2, h.y + 0.5, h.z + b.d / 2, 6, COLOR_HEX[state.color] ?? 0xffffff);
    }
  }
  world.commitBatch(added);

  sfx.place();
  if (versus.active) {
    brick._by = versus.turn;
    versus.counts[versus.turn]++;
    versusUpdate();
    versus.turn = versus.turn === 'A' ? 'B' : 'A';
    versusUpdate();
    hint(versus.turn === 'A' ? '🔴 轮到红方' : '🔵 轮到蓝方', versus.turn === 'A' ? '#ff8a8a' : '#7fc4ff');
  }
  say(randomPraise(), { rate: 1.06 });

  if (!isDecoSprite) {
    ripple.position.set(h.x + b.w / 2, h.y + 0.03, h.z + b.d / 2);
    ripple.scale.setScalar(Math.max(b.w, b.d) * 0.9);
    ripple.material.opacity = 0.9;
    ripple.visible = true;
    rippleLife = 0;

    spawnPop(h.x + b.w / 2, h.y + 0.5, h.z + b.d / 2, 8, COLOR_HEX[state.color] ?? 0xffffff);
  }

  // 带参数的机械件：刚放下就把装配台推出来，齿数/节数/销距当场就能调
  const defP = getShape(brick.shapeId);
  if (defP.pdef && !versus.active && !challenge.active) {
    openXform(brick);
    hint(`「${defP.name}」已放下 · 在这里调${defP.pdef.map(p => p.label).join(' / ')}，也可以调大小和角度`, '#9ff6ff');
  }
}

/** 连排填充：从起点到当前点，沿主轴逐格放积木（一次撤销退整排） */
function runLineFill(h) {
  const b = boundsNow();
  if (!lineStart) {
    lineStart = h;
    sfx.select();
    hint('起点定好了，再点一下终点就填满这一排', '#9ff6ff');
    say('再点一下终点。', { rate: 1.05 });
    return;
  }
  const a = lineStart;
  lineStart = null;

  // 选跨度最大的轴作为填充方向
  const dx = h.x - a.x, dy = h.y - a.y, dz = h.z - a.z;
  const axis = Math.abs(dx) >= Math.abs(dz) && Math.abs(dx) >= Math.abs(dy) ? 'x'
    : Math.abs(dz) >= Math.abs(dy) ? 'z' : 'y';
  const stepOf = { x: b.w, y: b.h, z: b.d }[axis];
  const total = Math.abs({ x: dx, y: dy, z: dz }[axis]);
  const dir = Math.sign({ x: dx, y: dy, z: dz }[axis]) || 1;
  const count = Math.min(40, Math.floor(total / stepOf));  // 上限 40 块，防手滑

  if (count < 1) { hint('两点太近了，隔远一点再点', '#ffb4b4'); return; }

  const added = [];
  let ok = 0;
  for (let i = 0; i <= count; i++) {
    const p = { x: a.x, y: a.y, z: a.z };
    p[axis] = a[axis] + dir * stepOf * i;
    if (challenge.active && challenge.level && world.bricks.length + added.length >= challenge.level.budget) {
      hint(`积木用完啦（限 ${challenge.level.budget} 块）`, '#ffb4b4');
      break;
    }
    if (!world.canPlace(state.shapeId, state.rx, state.ry, state.rz, p.x, p.y, p.z)) continue;
    const br = world.add({ shapeId: state.shapeId, rx: state.rx, ry: state.ry, rz: state.rz, color: state.color, ...p }, { record: false });
    if (br && br.mesh) dropAnim.add(br.mesh, p.y, { drop: 1.6 + i * 0.06, bounce: 0.3, delay: i * 0.05 });
    added.push(world.serialize(br));
    ok++;
    if (versus.active) versus.counts[versus.turn]++;
  }
  if (!ok) { hint('这一排放不下，换个位置试试', '#ffb4b4'); return; }

  world.commitBatch(added);
  track('place', ok);
  trackShape(state.shapeId);
  if (versus.active) {
    // 连排算当前玩家的一步，整排放完才换手，否则一方能一直连放
    versus.turn = versus.turn === 'A' ? 'B' : 'A';
    versusUpdate();
  }
  sfx.place();
  hint(`连排放了 ${ok} 块`, '#ffd77a');
  say(`一下子放了 ${ok} 块！`, { rate: 1.05 });
}

function hint(msg, color = '#ffb4b4') {
  const el = document.getElementById('dockHint');
  el.textContent = msg;
  el.style.color = color;
  clearTimeout(hint._t);
  hint._t = setTimeout(() => { el.style.color = ''; updateHint(); }, 1600);
}

/** 顶部大 toast：用于成就解锁等重要提示 */
let toastTimer = 0;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) { hint(msg, '#ffd77a'); return; }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// 全局异常 → 一句人话（详细堆栈仍在控制台），去重限流由 errors.js 负责。
// 面向孩子/家长不暴露英文堆栈里的内部细节，只说"发生了什么、你可以怎么办"。
setErrorNotifier(() => toast('⚠️ 刚才那一步没成功，已经记下来了。再试一次就行，反复出现可以刷新页面'));

// ===================== 装配台：零件缩放 / 细转 / 微移 =====================
// 现实里装配零件从不只是"整格一放"：先量一量、转个角度、挪半格再固定。
// 装配台给出 0.4–3× 缩放、45° 三轴细转和 0.25 格微移，全部实时预览、可撤销。
const xfPanel = document.getElementById('xformPanel');
const xfName = document.getElementById('xfName');
const xfScale = document.getElementById('xfScale');
const xfScaleV = document.getElementById('xfScaleV');
const xfParams = document.getElementById('xfParams');
let xfTarget = null;   // 正在装配的积木
let xfPrev = null;     // 本轮交互的撤销基线（松手 / 点按钮时才入栈）

/** 装配台里的「参数」区：齿数、节数、销距……改了立即重建几何 */
function buildXfParams(brick) {
  xfParams.innerHTML = '';
  const def = getShape(brick.shapeId);
  const defs = def.pdef || [];
  if (!defs.length) { xfParams.classList.add('hidden'); return; }
  xfParams.classList.remove('hidden');
  const title = document.createElement('div');
  title.className = 'xf-param-title';
  title.textContent = '参数 · 改了立即生效，传动比跟着变';
  xfParams.appendChild(title);
  for (const p of defs) {
    const val = brick.params?.[p.key] ?? p.def;
    const row = document.createElement('div');
    row.className = 'xf-param';
    row.innerHTML = `<span>${p.label}</span>`
      + `<input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${val}">`
      + `<b>${p.fmt(val)}</b>`;
    const input = row.querySelector('input');
    const valEl = row.querySelector('b');
    let dragPrev = null;   // 拖动开始时的值：松手按它记一条撤销
    input.addEventListener('pointerdown', () => {
      dragPrev = brick.params?.[p.key] ?? p.def;
    });
    input.addEventListener('input', () => {
      const v = +input.value;
      world.setParam(brick, p.key, v, { record: false });
      valEl.textContent = p.fmt(v);
    });
    input.addEventListener('change', () => {
      world.setParam(brick, p.key, +input.value, { record: true, prev: dragPrev });
      dragPrev = null;
      sfx.select();
    });
    xfParams.appendChild(row);
  }
}

function openXform(brick) {
  xfTarget = brick;
  xfPrev = world.xformOf(brick);
  xfName.textContent = `${getShape(brick.shapeId).name}`;
  xfScale.value = brick.scale || 1;
  xfScaleV.textContent = `${(brick.scale || 1).toFixed(2)}×`;
  buildXfParams(brick);
  xfPanel.classList.remove('hidden');
  sfx.select();
  const hasP = (getShape(brick.shapeId).pdef || []).length;
  hint(hasP ? '装配台：拖参数滑块改齿数/节数等，也可调姿态，搭完去按「▶ 运转」'
            : '装配台：拖「大小」滑块，按转向/微移按钮调姿态，搭完去按「▶ 运转」', '#9ff6ff');
}

function closeXform() {
  xfTarget = null;
  xfPanel.classList.add('hidden');
}

function xfApply(data, record = false) {
  if (!xfTarget) return;
  world.setXform(xfTarget, data, { record });
  if (record) xfPrev = world.xformOf(xfTarget);
}

xfScale.addEventListener('input', () => {
  xfApply({ scale: +xfScale.value });
  xfScaleV.textContent = `${(+xfScale.value).toFixed(2)}×`;
});
xfScale.addEventListener('change', () => xfApply({ scale: +xfScale.value }, true));

// 45° 细转（X/Y/Z 各一对）
xfPanel.querySelectorAll('[data-ax]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!xfTarget) return;
    const [ax, dir] = [btn.dataset.ax, +btn.dataset.dir];
    const step = Math.PI / 4 * dir;
    xfApply({ [`er${ax}`]: (xfTarget[`er${ax}`] || 0) + step }, true);
    sfx.rotate();
  });
});
// 0.25 格微移（水平两向 + 升降）
xfPanel.querySelectorAll('[data-mv]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!xfTarget) return;
    const [ax, dir] = btn.dataset.mv.split(',');
    xfApply({ [`o${ax}`]: +(((xfTarget[`o${ax}`] || 0) + 0.25 * +dir).toFixed(2)) }, true);
    sfx.select();
  });
});
document.getElementById('xfReset').addEventListener('click', () => {
  if (!xfTarget) return;
  world.setXform(xfTarget, { scale: 1, erx: 0, ery: 0, erz: 0, ox: 0, oy: 0, oz: 0 }, true);
  xfScale.value = 1;
  xfScaleV.textContent = '1.00×';
  xfPrev = world.xformOf(xfTarget);
  sfx.undo();
});
document.getElementById('xfClose').addEventListener('click', closeXform);

// ===================== 传动模拟：按物理关系让机构转起来 =====================
// 「运转」不是乱转：先由 drive.js 解算谁带动谁（同轴共转、齿轮咬合反向变速、
// 链条同向传动、曲柄滑块往复），这里只负责按解算结果逐帧驱动网格。
let run = null;
const btnRun = document.getElementById('btnRun');
const btnRunStop = document.getElementById('btnRunStop');
const runSpeedEl = document.getElementById('runSpeed');

function startRun() {
  if (run) return;
  const plan = buildDrivetrain(world.bricks);
  if (!plan.hasSource) {
    hint('先放一个「电机」或「曲轴」当动力源（对准轴、贴着齿轮），再按运转', '#ffb4b4');
    sfx.pick();
    return;
  }
  const bases = new Map();
  for (const p of plan.parts) {
    const brick = world.brickById(p.id);
    if (!brick?.mesh) continue;
    bases.set(p.id, { pos: brick.mesh.position.clone(), quat: brick.mesh.quaternion.clone(), scale: brick.mesh.scale.clone() });
  }
  // 压簧不在传动节点里，但要单独记下原始位置与缩放，停止时才能弹回原长
  for (const sp of plan.springs) {
    const brick = world.brickById(sp.id);
    if (!brick?.mesh) continue;
    bases.set(sp.id, {
      pos: brick.mesh.position.clone(), quat: brick.mesh.quaternion.clone(),
      scale: brick.mesh.scale.clone(),
    });
  }
  // 槽轮初始相位：看拨销此刻指向哪，才知道什么时候进槽、什么时候锁死
  for (const gv of plan.genevas) {
    const drv = plan.byId.get(gv.driveId);
    const wh = plan.byId.get(gv.wheelId);
    const drvBase = bases.get(gv.driveId);
    if (!drv || !wh || !drvBase) continue;
    const pinDir = new THREE.Vector3(1, 0, 0).applyQuaternion(drvBase.quat);   // 拨销方向
    const axV = new THREE.Vector3(drv.axis[0], drv.axis[1], drv.axis[2]);
    const D = new THREE.Vector3(wh.center[0] - drv.center[0], wh.center[1] - drv.center[1], wh.center[2] - drv.center[2]);
    D.addScaledVector(axV, -D.dot(axV)).normalize();                          // 指向槽轮（⊥轴分量）
    gv.psi0 = Math.atan2(new THREE.Vector3().crossVectors(pinDir, D).dot(axV), pinDir.dot(D));
    gv.theta = 0; gv.eng = false; gv.off = 0;
  }
  run = { plan, bases, crankTheta: new Map(), genevaTheta: new Map() };
  btnRun.classList.add('hidden');
  btnRunStop.classList.remove('hidden');
  const n = plan.groups.filter(g => g.hasSource).reduce((s, g) => s + g.members.length, 0)
    + plan.genevas.filter(gv => {
      const grp = plan.groups.find(g => g.members.some(m => m.id === gv.driveId));
      return grp?.hasSource;
    }).length;
  hint(`传动模拟中：${n} 个零件在按传动关系运转 · 再按一次停止`, '#9ff6ff');
  // 传动解读：把这段机构的原理念一遍（齿数比、自锁、步进……）
  if (plan.notes.length) {
    toast(`⚙ ${plan.notes.join('；')}`);
    say(plan.notes[0], { rate: 1.0 });
  } else {
    say('转起来啦，看看动力怎么传！', { rate: 1.05 });
  }
}

function stopRun() {
  if (!run) return;
  // 曲柄/连杆/活塞是"绝对摆放"，停止时恢复原位；齿轮车轮停在当前角度（像断了电）
  for (const l of run.plan.linkages) {
    for (const id of [l.crankId, l.conrodId, l.pistonId, ...(l.followers || [])]) {
      const base = run.bases.get(id);
      const brick = world.brickById(id);
      if (base && brick?.mesh) {
        brick.mesh.position.copy(base.pos);
        brick.mesh.quaternion.copy(base.quat);
        if (base.scale) brick.mesh.scale.copy(base.scale);
      }
    }
  }
  // 齿条 / 丝杠螺母这类直线件同样回到出发点
  for (const sl of run.plan.slides) {
    const base = run.bases.get(sl.id);
    const brick = world.brickById(sl.id);
    if (base && brick?.mesh) brick.mesh.position.copy(base.pos);
  }
  // 苏格兰轭、摇杆、电机芯轴也回正；电机机身从来没转过，不用动
  for (const y of run.plan.yokes || []) {
    const base = run.bases.get(y.id), brick = world.brickById(y.id);
    if (base && brick?.mesh) brick.mesh.position.copy(base.pos);
  }
  for (const os of run.plan.oscillators || []) {
    const base = run.bases.get(os.id), brick = world.brickById(os.id);
    if (base && brick?.mesh) { brick.mesh.position.copy(base.pos); brick.mesh.quaternion.copy(base.quat); }
  }
  for (const g of run.plan.groups) for (const m of g.members) {
    if (m.def.id !== 'motor') continue;
    const rot = rotorOf(world.brickById(m.id));
    if (rot) { rot.quaternion.identity(); rot.position.set(0, 0, 0); }
  }
  // 压簧恢复原长、原位置
  for (const sp of run.plan.springs || []) {
    const base = run.bases.get(sp.id), brick = world.brickById(sp.id);
    if (base && brick?.mesh) {
      brick.mesh.position.copy(base.pos);
      if (base.scale) brick.mesh.scale.copy(base.scale);
    }
  }
  run = null;
  btnRun.classList.remove('hidden');
  btnRunStop.classList.add('hidden');
}

const _qA = new THREE.Quaternion();
const _axV = new THREE.Vector3();
const _cV = new THREE.Vector3();
const _pV = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

/** 找出积木里的「转子」子网格（电机芯轴）。几何里它单独成网格，机壳是另一个网格 */
function rotorOf(brick) {
  if (!brick?.mesh) return null;
  if (brick.mesh.userData._rotor !== undefined) return brick.mesh.userData._rotor;
  let found = null;
  brick.mesh.traverse(o => { if (!found && o.userData.rotor) found = o; });
  brick.mesh.userData._rotor = found;
  return found;
}

/** 曲柄滑块：销绕 C0 画圆，活塞沿滑动轴往复，连杆跟着两点连线摆 */
function updateLinkage(l) {
  const th = l.theta;
  const c = Math.cos(th), s = Math.sin(th);
  const P = [
    l.C0[0] + l.pinR * (c * l.U0[0] + s * l.W[0]),
    l.C0[1] + l.pinR * (c * l.U0[1] + s * l.W[1]),
    l.C0[2] + l.pinR * (c * l.U0[2] + s * l.W[2]),
  ];
  // 偏置曲柄滑块的精确行程（任意偏置都成立，见 drive.js sliderTravel）
  const ds = sliderTravel(th, l.C0, l.U0, l.W, l.pinR, l.S0, l.Pp, l.L);
  const sh = l.pinShift || [0, 0, 0];

  // 活塞：沿滑动轴平移（含静止位的微小校正，让销距正好等于连杆孔距）
  const piston = world.brickById(l.pistonId);
  const pBase = run && run.bases.get(l.pistonId);
  if (piston?.mesh && pBase) {
    piston.mesh.position.set(
      pBase.pos.x + sh[0] + l.Pp[0] * ds,
      pBase.pos.y + sh[1] + l.Pp[1] * ds,
      pBase.pos.z + sh[2] + l.Pp[2] * ds
    );
  }

  // 十字头滑块：跟活塞同一行程，一根活塞杆上的人都得同步走
  for (const fid of l.followers || []) {
    const fol = world.brickById(fid);
    const fBase = run && run.bases.get(fid);
    if (fol?.mesh && fBase) {
      fol.mesh.position.set(
        fBase.pos.x + l.Pp[0] * ds,
        fBase.pos.y + l.Pp[1] * ds,
        fBase.pos.z + l.Pp[2] * ds
      );
    }
  }

  // 连杆：**刚体**。大头孔套曲柄销、小头孔套活塞销，两端孔心用几何烘焙的真实值
  // （已经含图纸的 rx/ry/rz），所以杆子被图纸转倒过也不会算歪；
  // 也不再沿杆长拉伸去凑距离——那样每次拉长都会把小头扎进活塞里。
  const rod = world.brickById(l.conrodId);
  const rBase = run && run.bases.get(l.conrodId);
  if (rod?.mesh && rBase && pBase) {
    const anchor = [
      pBase.pos.x + sh[0] + (l.pinOff ? l.pinOff[0] : 0) + l.Pp[0] * ds,
      pBase.pos.y + sh[1] + (l.pinOff ? l.pinOff[1] : 0) + l.Pp[1] * ds,
      pBase.pos.z + sh[2] + (l.pinOff ? l.pinOff[2] : 0) + l.Pp[2] * ds,
    ];
    const holes = rod.brickHoles || [[0, CONROD_PIN.y0, 0], [0, CONROD_PIN.y1, 0]];
    const pose = rodPose(holes, rod.brickHoleNormal, l.A, P, anchor);
    rod.mesh.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    rod.mesh.quaternion.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
    rod.mesh.scale.set(1, 1, 1);
  }
}

/* v1.27 直线件行程限位：齿条受机架两端挡块限制、丝杠螺母只走有效螺纹
   （撞到端头就由限位开关换向）。这里把「走到行程端」换算成驱动组的转角上限——
   组内齿轮/丝杠跟着反转，齿面和齿条始终咬合、螺母始终在螺纹上，
   既不会一路走出图纸，也不会出现「齿轮空转、齿条打滑」。 */
function slideCapOf(g) {
  if (g._rackCap !== undefined) return g._rackCap;
  let cap = null;
  for (const sl of run.plan.slides) {
    if (!sl.stroke) continue;
    const m = g.members.find(x => x.id === sl.driveId);
    if (!m) continue;
    const rr = Math.abs(sl.r * m.sign * m.factor) || 0.3;
    const c = sl.stroke / rr;
    cap = cap === null ? c : Math.min(cap, c);
  }
  g._rackCap = cap;
  return cap;
}

function updateRun(dt) {
  if (!run) return;
  const speed = +runSpeedEl.value || 1;
  for (const g of run.plan.groups) {
    if (!g.hasSource) continue;
    const cap = slideCapOf(g);
    if (cap) {
      // 转角在 [−cap, +cap] 之间往复：到端头翻向，齿条就在行程内来回走
      g.fwd = g.fwd || 1;
      let next = (g.phi || 0) + g.omega * speed * dt * g.fwd;
      if (next > cap) { next = cap; g.fwd = -1; }
      else if (next < -cap) { next = -cap; g.fwd = 1; }
      g.phi = next;
    } else {
      g.phi = (g.phi || 0) + g.omega * speed * dt;
    }
    for (const m of g.members) {
      // 轴承 / 轴承座的外圈钉死在机架上，连通关系照算但外壳不转；
      // 摇杆由后面的摆动规则单独驱动，不按整圈转处理
      if (m.staticPart || m.def.oscillate) continue;
      const brick = world.brickById(m.id);
      const base = run.bases.get(m.id);
      if (!brick?.mesh || !base) continue;
      const dth = m.sign * m.factor * g.omega * speed * dt * (g.fwd || 1);
      if (m.def.id === 'motor') {
        // 电机：机身、散热筋、接线盒、底脚都是钉在机座上的定子，只有芯轴转。
        // 转子网格绕自己的轴心自转（position = c − R·c 补偿），整机一动不动。
        const rot = rotorOf(brick);
        if (!rot) continue;
        const phi = (g.phi || 0) * m.sign * m.factor;
        _qA.setFromAxisAngle(_axV.set(m.axis[0], m.axis[1], m.axis[2]), phi);
        rot.quaternion.copy(_qA);
        const c = rot.userData.rotorCenter || [0, 0, 0];
        _cV.set(c[0], c[1], c[2]);
        _pV.copy(_cV).applyQuaternion(_qA);
        rot.position.copy(_cV).sub(_pV);
      } else if (m.def.id === 'crank') {
        // 曲轴要驱动活塞，必须精确控制绝对角度
        const t = (run.crankTheta.get(m.id) || 0) + dth;
        run.crankTheta.set(m.id, t);
        _qA.setFromAxisAngle(_axV.set(m.axis[0], m.axis[1], m.axis[2]), t);
        brick.mesh.quaternion.copy(_qA).multiply(base.quat);
        _cV.set(m.center[0], m.center[1], m.center[2]);
        brick.mesh.position.copy(base.pos).sub(_cV).applyQuaternion(_qA).add(_cV);
      } else {
        // 普通转轮：绕自身轴线增量旋转（轴穿过积木中心，不会甩出去）
        _qA.setFromAxisAngle(_axV.set(m.axis[0], m.axis[1], m.axis[2]), dth);
        brick.mesh.quaternion.premultiply(_qA);
        _cV.set(m.center[0], m.center[1], m.center[2]);
        _pV.copy(brick.mesh.position).sub(_cV).applyQuaternion(_qA);
        brick.mesh.position.copy(_cV).add(_pV);
      }
    }
    for (const l of run.plan.linkages) {
      const cm = g.members.find(m => m.id === l.crankId);
      if (!cm) continue;
      l.theta = run.crankTheta.get(l.crankId) || 0;
      updateLinkage(l);
    }
  }
  // 槽轮机构：拨销进槽的角度就是槽轮的角——进槽带动、出槽锁死（马耳他十字）
  for (const gv of run.plan.genevas) {
    const grp = run.plan.groups.find(g => g.members.some(m => m.id === gv.driveId));
    if (!grp || !grp.hasSource) continue;
    const m = grp.members.find(m => m.id === gv.driveId);
    const dth = m.sign * m.factor * grp.omega * speed * dt;
    const t = (run.genevaTheta.get(gv.driveId) || 0) + dth;
    run.genevaTheta.set(gv.driveId, t);
    // 拨销相位：销方向与"指向槽轮"方向的夹角（网格转正角 = 相位往回走）
    let rel = gv.psi0 - t;
    rel = ((rel % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;   // 折到 (−π, π]
    const x = gv.C - gv.Rp * Math.cos(rel);
    const y = gv.Rp * Math.sin(rel);
    const pinDist = Math.hypot(x, y);
    const lim = Math.PI / gv.slots;
    if (pinDist <= gv.Ro * 1.12 && Math.abs(rel) < Math.PI / 2 + 0.4) {
      // 销在槽区：槽轮角 = 销角，夹在槽距里（保证一步正好一个槽位）
      const th = Math.max(-lim, Math.min(lim, Math.atan2(y, x)));
      if (!gv.eng) { gv.eng = true; gv.off = gv.theta - th; }
      gv.theta = th + gv.off;
    } else {
      gv.eng = false;   // 出槽：锁止弧扣住，槽轮原地不动
    }
    const wb = run.plan.byId.get(gv.wheelId);
    const brick = world.brickById(gv.wheelId);
    const base = run.bases.get(gv.wheelId);
    if (wb && brick?.mesh && base) {
      _qA.setFromAxisAngle(_axV.set(wb.axis[0], wb.axis[1], wb.axis[2]), gv.theta);
      brick.mesh.quaternion.copy(_qA).multiply(base.quat);
      _cV.set(wb.center[0], wb.center[1], wb.center[2]);
      _pV.copy(base.pos).sub(_cV).applyQuaternion(_qA);
      brick.mesh.position.copy(_cV).add(_pV);
    }
  }
  // 直线传动件：齿条、丝杠螺母跟着驱动轮的累计转角走直线
  for (const sl of run.plan.slides) {
    const grp = run.plan.groups.find(g => g.members.some(m => m.id === sl.driveId));
    if (!grp || !grp.hasSource) continue;
    const m = grp.members.find(x => x.id === sl.driveId);
    const brick = world.brickById(sl.id);
    const base = run.bases.get(sl.id);
    if (!m || !brick?.mesh || !base) continue;
    const phi = (grp.phi || 0) * m.sign * m.factor;
    // 齿条 / 丝杠螺母是匀速直线；凸轮顶杆、棘爪是「抬起来—被压簧压回去」的往复，
    // 棘爪还要按棘轮齿数倍频，每转过一齿跳一次
    let s;
    if (sl.kind === 'cam' || sl.kind === 'pawl') {
      s = sl.r * (1 - Math.cos(phi * (sl.freq || 1))) / 2 * sl.sign;
    } else {
      s = phi * sl.r * sl.sign;
    }
    brick.mesh.position.set(
      base.pos.x + sl.dir[0] * s,
      base.pos.y + sl.dir[1] * s,
      base.pos.z + sl.dir[2] * s
    );
  }
  // ---- 苏格兰轭：曲柄销在竖槽里滑，输出 s = r·cosθ 的纯正弦往复 ----
  for (const y of run.plan.yokes || []) {
    const grp = run.plan.groups.find(g => g.members.some(m => m.id === y.crankId));
    if (!grp || !grp.hasSource) continue;
    const s = y.pinR * Math.cos(run.crankTheta.get(y.crankId) || 0);
    const brick = world.brickById(y.id), base = run.bases.get(y.id);
    if (!brick?.mesh || !base) continue;
    brick.mesh.position.set(base.pos.x + y.dir[0] * s, base.pos.y + y.dir[1] * s, base.pos.z + y.dir[2] * s);
  }
  // ---- 曲柄摇杆：绕支点左右摆一个角度，不整圈转 ----
  for (const os of run.plan.oscillators || []) {
    const grp = run.plan.groups.find(g => g.members.some(m => m.id === os.driveId));
    if (!grp || !grp.hasSource) continue;
    const mm = grp.members.find(m => m.id === os.driveId);
    const brick = world.brickById(os.id), base = run.bases.get(os.id);
    if (!brick?.mesh || !base) continue;
    const phi = (grp.phi || 0) * (mm?.sign || 1) * (mm?.factor || 1);
    _qA.setFromAxisAngle(_axV.set(os.axis[0], os.axis[1], os.axis[2]), os.amp * Math.sin(phi));
    brick.mesh.quaternion.copy(_qA).multiply(base.quat);
    const p = run.plan.byId.get(os.id);
    if (p) {
      _cV.set(p.center[0], p.center[1], p.center[2]);
      brick.mesh.position.copy(base.pos).sub(_cV).applyQuaternion(_qA).add(_cV);
    }
  }
  // ---- 压簧：底端跟着往复件走、顶端留在机架上，于是被真实地压紧又弹回 ----
  for (const sp of run.plan.springs || []) {
    const brick = world.brickById(sp.id), base = run.bases.get(sp.id);
    if (!brick?.mesh || !base) continue;
    let s = 0;
    if (sp.kind === 'cam' || sp.kind === 'pawl') {
      const grp = run.plan.groups.find(g => g.members.some(m => m.id === sp.driveId));
      if (!grp || !grp.hasSource) continue;
      const mm = grp.members.find(m => m.id === sp.driveId);
      const phi = (grp.phi || 0) * (mm?.sign || 1) * (mm?.factor || 1);
      s = sp.r * (1 - Math.cos(phi * (sp.freq || 1))) / 2 * sp.sign;
    } else if (sp.kind === 'yoke') {
      s = sp.r * Math.cos(run.crankTheta.get(sp.driveId) || 0);
    } else {
      const l = run.plan.linkages.find(x => x.pistonId === sp.followId);
      if (l) s = pistonStroke(l.theta || 0, l.pinR, l.L);
    }
    const move = s * sp.sense;
    // 压簧是「压缩弹簧」：只能被压短，绝不能自拉伸（没有拉力就变长是违反物理的）。
    // 所以长度比上限锁在 1.0——往复件把弹簧这端顶过来就压短，退回去弹簧回到自然长，
    // 而不是跟着退回去被拉长。固定端锚在机架上不动，只有自由端随压缩回缩。
    const ratio = Math.max(0.42, Math.min(1.0, 1 - move / sp.length));
    const a = sp.axis;
    // 只缩放簧身（children[0]）；刚性导杆（children[1], userData.rigidRod）保持原长，
    // 于是压缩时簧圈收短、导杆不动——一眼就是「弹簧套在导杆上」被压短。
    const coil = brick.mesh.children[0] || brick.mesh;
    coil.scale.set(
      1 + (ratio - 1) * Math.abs(a[0]),
      1 + (ratio - 1) * Math.abs(a[1]),
      1 + (ratio - 1) * Math.abs(a[2])
    );
    brick.mesh.position.copy(base.pos);
  }
}

btnRun.addEventListener('click', () => { if (run) stopRun(); else startRun(); });
btnRunStop.addEventListener('click', stopRun);

// ===================== 交互事件 =====================
canvas.addEventListener('pointermove', e => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  pointerInside = true;
});
canvas.addEventListener('pointerenter', () => { pointerInside = true; });
canvas.addEventListener('pointerleave', () => { pointerInside = false; });

// 右键点零件 = 打开装配台（任何工具下都管用，不用先切工具）
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(world.meshes(), true);
  if (!hits.length) return;
  const b = brickFrom(hits[0].object);
  if (b) openXform(b);
});

let down = null;
// 浏览器要求"用户手势之后"才允许出声。原来只在画布上解锁，
// 孩子要是先点了顶部按钮（撤销、换形状）再回画布，就会一路静音
const unlockAudio = () => {
  sfx.unlock();
  document.removeEventListener('pointerdown', unlockAudio);
  document.removeEventListener('keydown', unlockAudio);
};
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('keydown', unlockAudio);

canvas.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  sfx.unlock();
  // 触屏轻点不会触发 pointermove，这里补一次坐标同步，否则放置判定会失效
  if (e.pointerType === 'touch') {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    pointerInside = true;
  }
  if (!canvas._voiceUnlocked) {
    canvas._voiceUnlocked = true;
    // 浏览器要求用户手势后才能出声，这里补一句短提示
    if (!document.getElementById('tutorial').classList.contains('hidden')) return;
    say('动手试试吧。', { rate: 1.05, force: true });
  }
});
canvas.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t;
  down = null;
  // 手指触屏时抖动更大，放宽容差，避免想放置却被当成拖动
  // 只用位移判定（拖动时位移必然大），不再限制按压时长，长按放置同样有效
  const slop = e.pointerType === 'touch' ? 14 : 8;
  if (moved > slop) return;
  doAction();
});

// ===================== UI =====================
const ui = {
  shapeGrid: document.getElementById('shapeGrid'),
  shapeCats: document.getElementById('shapeCats'),
  shapeSearch: document.getElementById('shapeSearch'),
  shapeSearchClear: document.getElementById('shapeSearchClear'),
  shapeEmpty: document.getElementById('shapeEmpty'),
  colorGrid: document.getElementById('colorGrid'),
  statBricks: document.getElementById('statBricks'),
  statTarget: document.getElementById('statTarget'),
  dockHint: document.getElementById('dockHint'),
  tabs: document.getElementById('tabs'),
  gallery: document.getElementById('galleryPanel'),
  help: document.getElementById('helpPanel'),
  workshop: document.getElementById('workshopPanel'),
  vox: document.getElementById('voxPanel'),
  pickBar: document.getElementById('pickBar'),
  pickCount: document.getElementById('pickCount'),
  pickName: document.getElementById('pickName'),
  btnPickSave: document.getElementById('btnPickSave'),
  btnPickAll: document.getElementById('btnPickAll'),
  btnPickClear: document.getElementById('btnPickClear'),
  btnPickExit: document.getElementById('btnPickExit'),
  voxLayers: document.getElementById('voxLayers'),
  voxGrid: document.getElementById('voxGrid'),
  voxCount: document.getElementById('voxCount'),
  voxPreview: document.getElementById('voxPreview'),
  voxName: document.getElementById('voxName'),
  btnVoxSave: document.getElementById('btnVoxSave'),
  btnVoxClear: document.getElementById('btnVoxClear'),
  btnVoxDelete: document.getElementById('btnVoxDelete'),
  btnVoxClose: document.getElementById('btnVoxClose'),
};

// 形状分类：40+ 种积木平铺会翻好几屏，按类筛选更好找
let shapeCat = 'all';
let shapeQuery = '';   // 形状搜索词（空 = 按分类浏览）
const iconQueue = [];
let iconPumping = false;

/** 图标分帧渲染：每帧只花 8ms，剩下的留给主循环，启动不会卡一下 */
function queueIcon(shape, ctx, S) {
  iconQueue.push(() => {
    try {
      const cv = renderOne(shape);
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(cv, 0, 0, S, S);
    } catch (e) { console.warn('图标渲染失败', shape.id, e); }
  });
  if (!iconPumping) {
    iconPumping = true;
    requestAnimationFrame(pumpIcons);
  }
}

function pumpIcons() {
  const t0 = performance.now();
  while (iconQueue.length && performance.now() - t0 < 8) iconQueue.shift()();
  if (iconQueue.length) requestAnimationFrame(pumpIcons);
  else { iconPumping = false; disposeIconKit(); }
}

function buildShapeCats() {
  const wrap = document.getElementById('shapeCats');
  if (!wrap) return;
  wrap.innerHTML = '';
  wrap.classList.toggle('hidden', !!shapeQuery);
  [{ id: 'all', name: '全部' }, ...SHAPE_CATS].forEach(c => {
    const b = document.createElement('button');
    b.className = 'cat-chip' + (c.id === shapeCat ? ' active' : '');
    b.dataset.cat = c.id;
    b.textContent = c.name;
    b.onclick = () => { shapeCat = c.id; buildShapeCats(); buildShapes(); sfx.select(); };
    wrap.appendChild(b);
  });
}

function buildShapes() {
  iconQueue.length = 0;
  ui.shapeGrid.innerHTML = '';

  const q = shapeQuery.trim().toLowerCase();
  const catName = id => (SHAPE_CATS.find(c => c.id === id) || {}).name || '';
  // kw 是隐藏搜索词：名字里没有「树」但搜「树」也要能出来
  const hit = s => !q || `${s.name} ${s.tag || ''} ${s.kw || ''} ${catName(s.cat)} ${s.id}`.toLowerCase().includes(q);
  const shown = SHAPES.filter(s => (q ? hit(s) : (shapeCat === 'all' || s.cat === shapeCat)));
  // 空状态分两种：搜索没命中 vs「我的」这个分类还空着。文案必须分开，
  // 否则刚点进「我的」就被一句"没有匹配的形状"劝退，其实只是还没造过东西。
  if (ui.shapeEmpty) {
    ui.shapeEmpty.hidden = shown.length > 0;
    ui.shapeEmpty.textContent = q
      ? '没有匹配的形状，换个词试试。'
      : (shapeCat === 'my'
        ? '还没有自定义形状。点上面的「＋ 自定义」，用 6×6×6 的格子拼一个。'
        : '这个分类还没有形状。');
  }
  shown.forEach(shape => {
    const btn = document.createElement('button');
    btn.className = 'shape-btn' + (shape.id === state.shapeId ? ' active' : '');
    btn.dataset.id = shape.id;
    btn.dataset.cat = shape.cat;
    btn.title = `${shape.name}（${shape.tag}）`;
    // 读屏软件要能知道「当前选中的是哪一块」：aria-pressed 跟 .active 同步
    btn.setAttribute('aria-pressed', shape.id === state.shapeId ? 'true' : 'false');

    // 类别色微光铺底 + 图标同色：颜色先于文字传达"这是哪一类"
    const tint = {
      base: 'rgba(224,136,78', round: 'rgba(83,184,224', slope: 'rgba(103,181,109',
      fun: 'rgba(192,106,208', lock: 'rgba(94,201,168', join: 'rgba(232,182,75',
      mech: 'rgba(147,166,204', mech2: 'rgba(96,206,190', part: 'rgba(206,168,116',
      deco: 'rgba(118,178,132',
    }[shape.cat] || 'rgba(224,136,78';
    btn.style.background = `radial-gradient(circle at 50% 34%, ${tint},.20) 0%, ${tint},.07) 62%, rgba(255,255,255,.03) 100%)`;

    if (shape.sprite) {
      // 装饰件是贴图不是几何：直接用原图当图标，比绕 3D 离屏渲染又快又清楚
      const im = document.createElement('img');
      im.className = 'deco-ico';
      im.src = shape.sprite;
      im.alt = '';
      im.draggable = false;
      im.decoding = 'async';
      btn.appendChild(im);
    } else {
      const cv = document.createElement('canvas');
      const S = 192;
      cv.width = S; cv.height = S;
      cv.style.width = '100%'; cv.style.height = '100%';
      const ctx = cv.getContext('2d');
      queueIcon(shape, ctx, S);
      btn.appendChild(cv);
    }

    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = shape.name;
    btn.appendChild(lbl);

    // 自定义形状：角上的 ✕ 用来删掉它（已经放出去的积木不受影响，只是不能再选）
    if (shape.custom) {
      const eb = document.createElement('i');
      eb.className = 'edit-badge';
      eb.textContent = '✕';
      eb.title = '删除这个自定义形状';
      eb.onclick = e => {
        e.stopPropagation();
        if (!window.confirm(`删除形状「${shape.name}」？已经放出去的积木不会消失。`)) return;
        const wasCur = state.shapeId === shape.id;
        deleteCustom(shape.id);
        if (wasCur) state.shapeId = 'cube';
        buildShapes();
        rebuildGhost();
        toast('已删除这个形状');
      };
      btn.appendChild(eb);
      btn.title += ' · 点左上角 ✎ 可继续改';
    }

    // 可调参数的零件打上齿轮角标：一眼看出"这个零件能调齿数/节数"
    if (shape.pdef && shape.pdef.length) {
      const badge = document.createElement('i');
      badge.className = 'pbadge';
      badge.textContent = '⚙';
      btn.appendChild(badge);
      btn.title += ` · 可调 ${shape.pdef.map(p => p.label).join('/')}`;
    }

    btn.onclick = () => {
      state.shapeId = shape.id;
      state.ry = 0;
      spinTarget = { x: 0, y: 0, z: 0 };
      ghostSpin = { x: 0, y: 0, z: 0 };
      rebuildGhost();
      [...ui.shapeGrid.children].forEach(c => {
        const on = c.dataset.id === shape.id;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      sfx.select();
      if (state.tool !== 'place') setTool('place');
      updateHint();
    };
    ui.shapeGrid.appendChild(btn);
  });

  // 末尾常驻一格「＋ 存为形状」：搜索时不显示，免得打断结果。
  // v1.28.1：不再另起一个 6×6×6 的工作台 —— 就在这个搭建台上搭好，
  // 点几块积木选中，直接打包成一块新积木，颜色也一并记下来。
  if (!q) {
    const add = document.createElement('button');
    add.className = 'shape-btn add';
    add.title = '在主平台挑几块积木，存成一块新形状';
    add.setAttribute('aria-label', '把选中的积木存成新形状');
    const plus = document.createElement('span');
    plus.textContent = '＋';
    plus.style.cssText = 'font-size:26px;line-height:1;';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = '存为形状';
    add.append(plus, lbl);
    add.onclick = () => enterPickMode();
    ui.shapeGrid.appendChild(add);
  }
}

function buildColors() {
  PALETTE.forEach(p => {
    const btn = document.createElement('button');
    const hex = '#' + p.hex.toString(16).padStart(6, '0');
    btn.className = 'color-btn' + (p.id === state.color ? ' active' : '');
    btn.dataset.id = p.id;
    btn.title = p.name;
    btn.setAttribute('aria-label', `颜色：${p.name}`);
    btn.setAttribute('aria-pressed', p.id === state.color ? 'true' : 'false');
    btn.style.background = `radial-gradient(circle at 32% 28%, rgba(255,255,255,.75), ${hex} 46%, ${hex} 100%)`;
    btn.style.color = hex;
    btn.onclick = () => {
      state.color = p.id;
      trackColor(p.id);
      if (ghostMat) {
        ghostMat.color.setHex(p.hex);
        ghostMat.emissive.setHex(p.hex).multiplyScalar(0.22);
      }
      [...ui.colorGrid.children].forEach(c => {
        const on = c.dataset.id === p.id;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      sfx.pick();
    };
    ui.colorGrid.appendChild(btn);
  });
}

function setTool(tool) {
  state.tool = tool;
  lineStart = null;
  [...document.querySelectorAll('.tool')].forEach(b => {
    const on = b.dataset.tool === tool;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (tool !== 'place') { ghost.visible = false; fpGroup.visible = false; }
  if (tool !== 'erase' && tool !== 'paint') hl.visible = false;
  if (tool !== 'adjust') closeXform();
  // 离开选择模式时收起选中框，避免绿框残留在别的工具下干扰操作
  if (tool !== 'select' && state.pickMode) exitPickMode();
  if (tool !== 'select') { selBox.visible = false; state.selected = null; hideSelInfo(); }
  updateHint();
}

function updateHint() {
  // 选择模式下选中了零件：底部提示条一直显示这个零件的名称与参数，
  // 不再 1.6 秒后被通用提示覆盖掉（孩子点完还在看，名字不能自己消失）。
  if (state.tool === 'select' && state.selected) {
    const alive = world.brickById(state.selected.id);
    if (alive) {
      ui.dockHint.innerHTML = `<b class="k" style="color:#6bff9e">${describePart(alive)}</b>`;
      return;
    }
    state.selected = null;
    hideSelInfo();
  }
  // 用"当前三轴旋转后"的形状，尺寸才会跟着旋转变化（立柱躺下就该显示 1×4×1）
  const s = rotNow();
  const b = shapeBounds(s);
  const touch = matchMedia('(pointer: coarse)').matches;
  const act = touch ? '轻点放下' : '单击放下';
  const key = touch ? '' : ' · <span class="r">R</span> 旋转';
  // 立体旋转状态（俯仰/摇摆）在提示里标出来，孩子能看出积木"躺下了/侧过来了"
  const spins = [];
  if (state.ry) spins.push(`转向 ${state.ry * 90}°`);
  if (state.rx) spins.push(`俯仰 ${state.rx * 90}°`);
  if (state.rz) spins.push(`摇摆 ${state.rz * 90}°`);
  const spinTxt = spins.length ? ` · <b class="k">${spins.join(' ')}</b>` : '';

  const map = {
    place: `<b class="k">${s.name}</b> ${b.w}×${b.d}×${b.h} 格${spinTxt}${key} · ${act}`,
    rotate: `拖动观察角度 · 用底部按钮换方向${key}`,
    paint: `点一下已有积木，刷上新颜色`,
    erase: `点一下积木，把它拆掉`,
    line: `点第一下定起点，再点终点，中间自动填满一排`,
    adjust: `点一下零件打开装配台：调大小、转向、微移；点空处收起`,
    select: `选择模式：点一下零件查看它的类型与参数，再点空白处取消；只看不改`,
  };
  ui.dockHint.innerHTML = map[state.tool] || '';
}

function rotate(axis, back = false) {
  // 三轴旋转真正生效：改的是形状本身（占位格会跟着转，放下后朝向一致）
  const step = back ? 3 : 1;   // 反向转 = 正着转 3 次
  if (axis === 'y') state.ry = (state.ry + step) % 4;
  else if (axis === 'x') state.rx = (state.rx + step) % 4;
  else state.rz = (state.rz + step) % 4;

  rebuildGhost();
  // 动画：几何已经是目标朝向，这里先反着摆 90° 再转回 0，看起来就是"转过去了"
  spinTarget = { x: 0, y: 0, z: 0 };
  ghostSpin = { x: 0, y: 0, z: 0 };
  if (ghostMesh) {
    ghostSpin[axis] = back ? Math.PI / 2 : -Math.PI / 2;
    ghostMesh.rotation.set(ghostSpin.x, ghostSpin.y, ghostSpin.z);
  }
  updateHint();
  sfx.rotate();
  const id = axis === 'x' ? 'btnRotX' : axis === 'z' ? 'btnRotZ' : 'btnRotY';
  const el = document.getElementById(id);
  el?.classList.add('flash');
  setTimeout(() => el?.classList.remove('flash'), 240);
}

// ===================== 图纸 =====================
let thumbsBuilt = false;
let bpLevel = 0;              // 0 = 全部，其余按难度筛选
const bpCards = [];           // { el, model }　筛选时只切显隐，不重建卡片

/** 难度筛选条：每档带上张数，孩子一眼知道还剩几个没搭 */
function buildBpFilters() {
  const wrap = document.getElementById('bpFilters');
  if (!wrap) return;
  wrap.innerHTML = '';
  const mk = (id, name, color, n) => {
    const b = document.createElement('button');
    b.className = 'bp-chip' + (bpLevel === id ? ' active' : '');
    b.dataset.lv = id;
    b.setAttribute('aria-pressed', bpLevel === id ? 'true' : 'false');
    const dot = document.createElement('i');
    dot.style.background = color;
    b.append(dot, document.createTextNode(name));
    const em = document.createElement('em');
    em.textContent = n;
    b.appendChild(em);
    b.onclick = () => { bpLevel = id; buildBpFilters(); applyBpFilter(); sfx.select(); };
    wrap.appendChild(b);
  };
  mk(0, '全部', 'linear-gradient(135deg,#63c98c,#ff6f7d)', MODELS.length);
  DIFFS.forEach(d => mk(d.id, d.name, d.color, MODELS.filter(m => m.level === d.id).length));
}

function applyBpFilter() {
  for (const { el, model } of bpCards) {
    el.classList.toggle('hide', bpLevel !== 0 && model.level !== bpLevel);
  }
}

function buildGallery() {
  if (thumbsBuilt) return;
  thumbsBuilt = true;
  const listEl = document.getElementById('blueprintList');
  const jobs = [];
  buildBpFilters();

  // 图纸是数据，数据会写错：先整份体检一遍，问题提前打到控制台，
  // 界面上把坏图标成「暂不可用」，避免用户点进一个空场或半成品世界。
  const check = checkCatalog(MODELS);
  const badMap = new Map(check.bad.map(b => [b.model.id, b.problems]));
  if (check.bad.length) {
    console.error(`[破境积木] 图纸自检：${check.bad.length}/${check.total} 张有问题`);
    check.bad.forEach(b => console.error(` · ${b.model.name}（${b.model.id}）：${b.problems.join('；')}`));
  }

  MODELS.forEach(model => {
    const problems = badMap.get(model.id) || null;
    const add = (sc, d) => {
      const shape = shapeRot(getShape(d.shapeId), d.rx || 0, d.ry || 0, d.rz || 0);
      const { group } = geoFor(shape, d.params || {});
      const clone = group.clone(true);
      const mat = makeMaterial(COLOR_HEX[d.color] ?? 0xcccccc);
      clone.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.receiveShadow = true; } });
      const bb = shapeBounds(shape);
      clone.position.set(d.x + bb.w / 2, d.y, d.z + bb.d / 2);
      sc.add(clone);
      return clone;
    };

    // 先把卡片和文字铺出来，缩略图留占位骨架。
    // 19 张图连着渲染会占住主线程近 2 秒，改成一帧画一张，孩子立刻就能翻。
    const ph = document.createElement('div');
    ph.className = 'bp-ph';

    const card = document.createElement('div');
    card.className = 'bp-card';
    card.appendChild(ph);

    const tag = document.createElement('div');
    tag.className = 'bp-tag';
    tag.textContent = model.tag;
    card.appendChild(tag);

    // 难度徽标：颜色由浅绿到红，和筛选条一一对应
    const diff = diffOf(model);
    const lv = document.createElement('div');
    lv.className = 'bp-lv';
    lv.textContent = diff.name;
    lv.style.color = diff.color;
    lv.style.borderColor = diff.color + '66';
    card.appendChild(lv);

    // 键盘可达：卡片是 div，得自己补 role/tabindex/回车，不然读屏和纯键盘用户打不开图纸
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `图纸：${model.name}，${diff.name}，${model.list.length} 块。${model.desc}`);
    if (problems) card.setAttribute('aria-disabled', 'true');
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        card.click();
      }
    });

    const meta = document.createElement('div');
    meta.className = 'bp-meta';
    meta.innerHTML = `<b>${model.icon} ${model.name}</b><span>${model.desc} · ${model.list.length} 块</span>`;
    card.appendChild(meta);

    if (problems) {
      card.classList.add('bp-bad');
      const warn = document.createElement('div');
      warn.className = 'bp-warn';
      warn.textContent = '暂不可用';
      card.appendChild(warn);
    }

    card.onclick = () => {
      if (problems) {
        toast(`「${model.name}」这张图纸数据自检未通过，暂时打不开`);
        return;
      }
      const done = safeRun(() => {
        if (challenge.active) exitChallenge();
        if (versus.active) exitVersus();
        world.clear();
        resetSession();
        world.load(model.list.map(d => ({ ...d })));
        frameModel(model);
        ui.statTarget.textContent = model.name;
        setBlueprint(model);          // 顶部徽标显示图纸名称 + 图纸页卡片保持选中态
        closePanels();
        sfx.win();
        hint(`搭好了「${model.name}」，拆几块试试改成自己的样子`, '#ffd77a');
        return true;
      }, `载入图纸「${model.name}」`);
      if (!done) {
        // 载入中途失败：不能把用户留在「点了没反应」，清场并说明，卡片仍可再试
        safeRun(() => { world.clear(); resetSession(); }, '回滚场景');
        setBlueprint(null);
        toast(`「${model.name}」载入失败，已清空场景，请换一张试试`);
      }
    };
    listEl.appendChild(card);
    bpCards.push({ el: card, model });

    jobs.push(() => {
      let cv;
      try {
        cv = makeThumbCanvas(model, model.list, add);
      } catch (e) {
        console.warn('缩略图渲染失败', e);
        cv = document.createElement('canvas');
        cv.width = 400; cv.height = 300;
      }
      if (ph.parentNode === card) card.replaceChild(cv, ph);
    });
  });

  applyBpFilter();
  syncBlueprintCards();     // 已有「当前图纸」时，卡片要立刻是高亮态

  let i = 0;
  const step = () => {
    if (i >= jobs.length) {
      // 缩略图全部画完，释放离屏渲染器占用的 WebGL 上下文
      disposeOffscreen();
      return;
    }
    try { jobs[i++](); } catch (e) { console.warn('缩略图渲染失败', e); }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function closePanels() {
  ui.gallery.classList.add('hidden');
  ui.help.classList.add('hidden');
  ui.workshop.classList.add('hidden');
  if (ui.vox) ui.vox.classList.add('hidden');
  const lp = document.getElementById('levelPanel');
  if (lp) lp.classList.add('hidden');
  const ap = document.getElementById('aboutPanel');
  if (ap) ap.classList.add('hidden');
  [...ui.tabs.children].forEach(t => t.classList.toggle('active', t.dataset.view === 'build'));
}

/** 打开某个全屏面板（图纸/玩法/作品/关卡/关于），同时收起其它面板 */
function openFullPanel(id) {
  closePanels();
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  const tab = [...ui.tabs.children].find(t => t.dataset.view === ({ galleryPanel: 'gallery', helpPanel: 'help', workshopPanel: 'workshop' }[id] || ''));
  [...ui.tabs.children].forEach(t => t.classList.toggle('active', t === tab));
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    const v = tab.dataset.view;
    [...ui.tabs.children].forEach(t => {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ui.gallery.classList.toggle('hidden', v !== 'gallery');
    ui.help.classList.toggle('hidden', v !== 'help');
    ui.workshop.classList.toggle('hidden', v !== 'workshop');
    if (v === 'gallery') buildGallery();
    if (v === 'workshop') renderWorkshop();
    if (v === 'help') { renderAchievements(document.getElementById('achGrid')); syncHelpTab(); }
    if (v === 'build') closePanels();
    sfx.pick();
  };
});

// ===================== 帮助中心（分区切换 / 快捷键 / 常见问题） =====================
document.querySelectorAll('.help-tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.help-tab').forEach(b => b.classList.toggle('active', b === btn));
    const h = btn.dataset.h;
    document.querySelectorAll('.help-sec').forEach(s => s.classList.toggle('hidden', s.dataset.h !== h));
    sfx.pick();
  };
});

/** 让分区按钮回到默认的「玩法」页（每次打开帮助面板时调用） */
function syncHelpTab() {
  const first = document.querySelector('.help-tab');
  if (first) first.click();
}

// 快捷键表：触屏设备没有键盘，相关条目换成触屏说法
function buildKeysTable() {
  const el = document.getElementById('keysTable');
  if (!el) return;
  el.innerHTML = '';
  const touch = matchMedia('(pointer: coarse)').matches;
  KEYS.forEach(row => {
    if (touch && /^[A-Z]/.test(row.k)) return;   // 触屏上隐去纯键盘键
    const d = document.createElement('div');
    d.className = 'keys-row';
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = row.k;
    const s = document.createElement('span');
    s.className = 'd';
    s.textContent = row.d;
    d.append(k, s);
    el.appendChild(d);
  });
  if (touch) {
    const p = document.createElement('p');
    p.className = 'help-note';
    p.textContent = '当前是触屏设备，快捷键不适用：手指按住地面再松开就是放置，滑动转视角，两指捏合缩放。';
    el.appendChild(p);
  }
}

function buildFAQ() {
  const el = document.getElementById('faqList');
  if (!el) return;
  el.innerHTML = '';
  FAQ.forEach(item => {
    const box = document.createElement('div');
    box.className = 'faq-item';
    const q = document.createElement('button');
    q.className = 'faq-q';
    q.type = 'button';
    q.textContent = item.q;
    q.onclick = () => { box.classList.toggle('open'); sfx.pick(); };
    const a = document.createElement('div');
    a.className = 'faq-a';
    a.textContent = item.a;      // 用 textContent，内容里没有 HTML，避免注入
    box.append(q, a);
    el.appendChild(box);
  });
}

// ===================== 关于 =====================
function buildAbout() {
  const v = document.getElementById('aboutVer');
  if (v) v.textContent = 'v' + APP_VERSION;
  const d = document.getElementById('aboutDate');
  if (d) d.textContent = APP_DATE;
  const ver = document.getElementById('appVer');
  if (ver) ver.textContent = 'v' + APP_VERSION;

  // 界面上的数量文案全部由数据源现算：形状/图纸/关卡加过一次以后，
  // 静态文案很容易忘了改（上一版还写着"59 种形状""44 张图纸"，实际是 90/46）
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
  setTxt('bpTotal', MODELS.length);
  setTxt('aboutShapeCount', SHAPES.length);
  setTxt('aboutColorCount', PALETTE.length);
  setTxt('aboutModelCount', MODELS.length);
  setTxt('aboutLevelCount', LEVELS.length);

  const box = document.getElementById('changelog');
  if (!box) return;
  box.innerHTML = '';
  CHANGELOG.forEach(it => {
    const d1 = document.createElement('div');
    d1.className = 'cl-item';
    const vv = document.createElement('div');
    vv.className = 'cl-ver';
    vv.textContent = it.ver;
    const sp = document.createElement('span');
    sp.textContent = it.date;
    vv.appendChild(sp);
    const nt = document.createElement('div');
    nt.className = 'cl-note';
    // 更新日志是我们自己写的常量，里面的 <b> 只用于高亮，安全
    nt.innerHTML = it.notes.map(n => '· ' + n).join('<br>');
    d1.append(vv, nt);
    box.appendChild(d1);
  });
}

function openAbout() {
  const g = document.getElementById('achGrid');
  if (g) renderAchievements(g);
  openFullPanel('aboutPanel');
  sfx.pick();
}
document.getElementById('btnAbout').onclick = openAbout;
document.getElementById('btnHelpAbout').onclick = openAbout;
document.getElementById('btnAboutClose').onclick = closePanels;
document.getElementById('btnAboutTut').onclick = () => { closePanels(); showTutorial(true); };

document.querySelectorAll('.tool').forEach(btn => {
  btn.onclick = () => { setTool(btn.dataset.tool); sfx.pick(); };
});

document.querySelectorAll('[data-cam]').forEach(btn => {
  btn.onclick = () => {
    const v = btn.dataset.cam;
    if (v === 'top') frameView(orbit.theta, 0.26);
    if (v === 'front') frameView(0, 1.33);
    if (v === 'orbit') frameView(-0.8, 1.02);
    if (v === 'fly') orbit.flyTo(orbit.theta + 0.6, 1.2, 13, new THREE.Vector3(0, 2.4, 0));
    document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b === btn));
    sfx.pick();
  };
});

document.getElementById('btnRotX').onclick = () => rotate('x');
document.getElementById('btnRotY').onclick = () => rotate('y');
document.getElementById('btnRotZ').onclick = () => rotate('z');

const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');
btnUndo.onclick = () => { if (world.undo()) { sfx.undo(); track('undo'); } };
btnRedo.onclick = () => { if (world.redo()) sfx.pick(); };

let clearArmed = false;
const btnClear = document.getElementById('btnClear');
btnClear.onclick = () => {
  if (!clearArmed) {
    clearArmed = true;
    hint('再点一次「清空」就全部拆掉', '#ff9b9b');
    setTimeout(() => { clearArmed = false; }, 2600);
    return;
  }
  clearArmed = false;
  world.clear();
  resetSession();
  setBlueprint(null);
  ui.statTarget.textContent = '自由创作';
  hint('地面清空了，开始新的创作', '#9ff6ff');
  sfx.remove();
};

// ---- 偏好记忆：开关状态存下来，下次打开还是孩子习惯的样子 ----
const PREF_KEY = 'pojing-bricks-prefs';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; } })();
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { } }

/** 复选框类开关：读存档恢复 → 应用 → 变更时落盘 */
function bindSwitch(id, key, apply) {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof prefs[key] === 'boolean') el.checked = prefs[key];
  apply(el.checked, true);                       // 恢复时静默，不弹提示
  el.addEventListener('change', () => {
    prefs[key] = el.checked;
    savePrefs();
    apply(el.checked, false);
  });
}

/** 图标按钮类开关（用 .on 表示开启） */
function bindOnButton(id, key, apply) {
  const el = document.getElementById(id);
  if (!el) return;
  const on = typeof prefs[key] === 'boolean' ? prefs[key] : true;
  el.classList.toggle('on', on);
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
  apply(on, true);
  el.addEventListener('click', () => {
    const now = !el.classList.contains('on');
    el.classList.toggle('on', now);
    el.setAttribute('aria-pressed', now ? 'true' : 'false');
    prefs[key] = now;
    savePrefs();
    apply(now, false);
  });
}

bindSwitch('optGrid', 'grid', v => env.setGridVisible(v));
bindSwitch('optSnap', 'snap', v => { state.snap = v; });
bindSwitch('optShadow', 'shadow', v => {
  renderer.shadowMap.enabled = v;
  renderer.shadowMap.needsUpdate = true;
});
bindSwitch('optMirror', 'mirror', (v, initial) => {
  // 比拼中镜像本来就不生效，别在这个时候给个"已开启"的假承诺
  if (initial) return;
  hint(v ? '🪞 镜像对称已开启：放一块，两边同时出现' : '镜像对称已关闭', '#9ff6ff');
  if (v) sfx.pick();
});
/* 积木凸点：默认关闭（光面贴合更接近真实木工搭法），打开后乐高式圆点。
   几何缓存在 world.setStuds 里按模式清理，旧网格必须 clear + 重放才换新外观。 */
bindSwitch('optStuds', 'studs', (v, initial) => {
  setStuds(v);
  const snap = world.toJSON();
  world.clear(false);
  snap.forEach(d => world.add(d, { record: false }));
  world.emit();
  if (!initial) hint(v ? '🔴 乐高式凸点已打开' : '🪵 光面贴合模式：凸点已隐藏', '#9ff6ff');
});
bindOnButton('btnSound', 'sound', (on, initial) => {
  setSoundEnabled(on);
  if (!initial && on) sfx.pick();
});
document.getElementById('btnFreeBuild').onclick = () => {
  // 回到自由创作时，必须一并退出挑战/比拼，否则世界清空了但关卡状态还挂着
  if (challenge.active) exitChallenge();
  if (versus.active) exitVersus();
  world.clear();
  resetSession();
  setBlueprint(null);
  closePanels();
  ui.statTarget.textContent = '自由创作';
};
document.getElementById('btnCloseHelp').onclick = closePanels;
document.getElementById('btnReplayTut').onclick = () => {
  closePanels();
  showTutorial(true);
};

// ---- 草稿自动保存：孩子关掉浏览器也不丢作品 ----
const DRAFT_KEY = 'pojing-bricks-draft';
let draftTimer = 0;

function saveDraft() {
  try {
    // 挑战/比拼进行中不存草稿：否则下次启动会把关卡半成品当成普通作品恢复，
    // 名字还挂着关卡名，状态对不上
    if (challenge.active || versus.active) return;
    if (world.bricks.length) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: ui.statTarget.textContent, data: world.toJSON() }));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch { /* 存储满时静默跳过 */ }
}

world.onChange = w => {
  ui.statBricks.textContent = w.bricks.length;
  // 世界变了，之前标出来的"悬空"结论就可能过时了，直接撤掉标记
  if (wobbleGroup) clearWobble();
  // 积木增删后传动关系要重算：正在运转就先停下来
  if (run) stopRun();
  // 装配台正选中的积木被拆掉了：收起面板
  if (xfTarget && !world.brickById(xfTarget.id)) closeXform();
  btnUndo.disabled = w.undoStack.length === 0;
  btnRedo.disabled = w.redoStack.length === 0;
  if (challenge.active) scheduleChallengeUI();

  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 900);
};

// 关页面/切后台时立刻补存一次：平时是 900ms 防抖，
// 搭完最后一块就关掉的话，那 900ms 根本来不及，等于白搭
addEventListener('pagehide', () => { clearTimeout(draftTimer); saveDraft(); });
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { clearTimeout(draftTimer); saveDraft(); }
});

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') { e.preventDefault(); if (world.undo()) { sfx.undo(); track('undo'); } return; }
  if (mod && k === 'y') { e.preventDefault(); world.redo(); sfx.pick(); return; }
  switch (k) {
    // 按住 Shift 就是反着转，转过头了不用连按三下
    case 'r': rotate('y', e.shiftKey); break;
    case 'q': rotate('x', e.shiftKey); break;
    case 'e': rotate('z', e.shiftKey); break;
    case 'arrowleft': case 'arrowright': {
      e.preventDefault();
      const i = SHAPES.findIndex(s => s.id === state.shapeId);
      const n = SHAPES[(i + (k === 'arrowleft' ? -1 : 1) + SHAPES.length) % SHAPES.length].id;
      ui.shapeGrid.querySelector(`.shape-btn[data-id="${n}"]`)?.click();
      break;
    }
    case '1': setTool('place'); break;
    case '2': setTool('rotate'); break;
    case '3': setTool('paint'); break;
    case '4': setTool('erase'); break;
    case '5': setTool('line'); break;
    case '6': setTool('adjust'); break;
    case '7': setTool('select'); break;
    case 'escape': closeInfo(); closePanels(); closeXform(); stopRun(); break;
    default: break;
  }
});

// ===================== 主循环 =====================
const clock = new THREE.Clock();

// 复用平面/向量，避免每帧分配触发 GC 抖动
const _hoverPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3);
const _hoverPoint = new THREE.Vector3();
const _ghostGoal = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();   // 面法线每帧都要取，别每帧 new 一个

function updateGhost(dt) {
  const h = state.hover;
  const b = boundsNow();

  if ((state.tool === 'place' || state.tool === 'line') && pointerInside) {
    let gx, gy, gz;
    if (h) { gx = h.x; gy = h.y; gz = h.z; }
    else {
      raycaster.setFromCamera(pointer, camera);
      if (!raycaster.ray.intersectPlane(_hoverPlane, _hoverPoint)) { ghost.visible = false; return; }
      gx = alignOffset(_hoverPoint.x, b.w); gy = 3.2; gz = alignOffset(_hoverPoint.z, b.d);
    }
    ghost.visible = true;
    _ghostGoal.set(gx + b.w / 2, gy + 0.06, gz + b.d / 2);
    ghost.position.lerp(_ghostGoal, 1 - Math.pow(0.00002, dt));
    ghostMat.opacity = h && !h.invalid ? 0.62 : 0.3;

    if (ghostMesh) {
      const k = 1 - Math.pow(0.0005, dt);
      ghostSpin.x += (spinTarget.x - ghostSpin.x) * k;
      ghostSpin.y += (spinTarget.y - ghostSpin.y) * k;
      ghostSpin.z += (spinTarget.z - ghostSpin.z) * k;
      ghostMesh.rotation.set(ghostSpin.x, ghostSpin.y, ghostSpin.z);
    }
  } else {
    ghost.visible = false;
  }

  if (h && (state.tool === 'place' || state.tool === 'line')) {
    fpGroup.visible = true;
    fpGroup.position.set(h.x + b.w / 2, 0.015, h.z + b.d / 2);
    fpEdge.scale.set(b.w, b.d, 1);
    fpFill.scale.set(b.w, b.d, 1);
    const ok = !h.invalid;
    fpEdge.material.color.setHex(ok ? 0x9ff6ff : 0xff5470);
    fpFill.material.color.setHex(ok ? (state.tool === 'line' ? 0xffd77a : 0x66e9ff) : 0xff5470);
    fpFill.material.opacity = 0.08 + Math.abs(Math.sin(elapsed * 3)) * 0.1;
  } else {
    fpGroup.visible = false;
  }

  if (state.tool === 'adjust' && xfTarget) {
    // 装配台选中件：青色呼吸框，按装配后的缩放显示
    const sb = shapeBounds(shapeRot(getShape(xfTarget.shapeId), xfTarget.rx || 0, xfTarget.ry || 0, xfTarget.rz || 0));
    const sc = xfTarget.scale || 1;
    hl.visible = true;
    hl.position.set(xfTarget.x + sb.w / 2, xfTarget.y + sb.h / 2 * sc, xfTarget.z + sb.d / 2);
    hl.scale.set(sb.w * sc * 1.04, sb.h * sc * 1.02, sb.d * sc * 1.04);
    hl.material.color.setHex(0x66e9ff);
    hl.material.opacity = 0.22 + Math.abs(Math.sin(elapsed * 5)) * 0.12;
  } else if ((state.tool === 'erase' || state.tool === 'paint' || state.tool === 'select') && h && h.brick) {
    const br = h.brick;
    const sb = shapeBounds(shapeRot(getShape(br.shapeId), br.rx || 0, br.ry || 0, br.rz || 0));
    hl.visible = true;
    hl.position.set(br.x + sb.w / 2, br.y + sb.h / 2, br.z + sb.d / 2);
    hl.scale.set(sb.w * 1.04, sb.h * 1.02, sb.d * 1.04);
    hl.material.color.setHex(
      state.tool === 'erase' ? 0xff5470
        : state.tool === 'select' ? 0x6bff9e
          : (COLOR_HEX[state.color] ?? 0xffffff)
    );
    hl.material.opacity = 0.22 + Math.abs(Math.sin(elapsed * 5)) * 0.12;
  } else {
    hl.visible = false;
  }

  // 选择模式下，已选中的零件挂一个持久绿框，鼠标移开也还在，方便对照信息
  if (state.tool === 'select' && state.selected && world.brickById(state.selected.id)) {
    const br = world.brickById(state.selected.id);
    const sb = shapeBounds(shapeRot(getShape(br.shapeId), br.rx || 0, br.ry || 0, br.rz || 0));
    selBox.visible = true;
    selBox.position.set(br.x + sb.w / 2, br.y + sb.h / 2, br.z + sb.d / 2);
    selBox.scale.set(sb.w * 1.08, sb.h * 1.06, sb.d * 1.08);
    selBox.material.opacity = 0.18 + Math.abs(Math.sin(elapsed * 3)) * 0.12;
  } else {
    selBox.visible = false;
  }

  canvas.style.cursor = (state.tool === 'place' || state.tool === 'line')
    ? (h && !h.invalid ? 'crosshair' : 'default')
    : state.tool === 'select'
      ? (h && h.brick ? 'pointer' : 'default')
      : (h && h.brick ? 'pointer' : 'default');
}

function tick() {
  // 单帧里出任何意外都不能让整个循环停摆：一旦 requestAnimationFrame 断掉，
  // 画面就永久定住，孩子只会以为"游戏坏了"，连原因都看不出来
  try {
    frame();
  } catch (e) {
    console.error('渲染帧出错', e);
  }
  requestAnimationFrame(tick);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  orbit.update(dt);
  env.update(elapsed);
  state.hover = computeHover();
  updateGhost(dt);
  dropAnim.update(dt);
  debris.update(dt);
  updatePops(dt);
  updateRun(dt);

  if (wobbleGroup && wobbleMat) {
    wobbleMat.opacity = 0.45 + Math.abs(Math.sin(elapsed * 4)) * 0.5;
  }

  if (ripple.visible) {
    rippleLife += dt;
    const k = rippleLife / 0.6;
    ripple.material.opacity = Math.max(0, 0.9 * (1 - k));
    ripple.scale.multiplyScalar(1 + dt * 3.2);
    if (k >= 1) ripple.visible = false;
  }

  renderer.render(scene, camera);
}



// ===================== 上手引导 / 语音开关 / 降级 =====================
const TUT_KEY = 'pojing-bricks-tutorial-done';

// 平板/手机上没有鼠标和键盘，引导文案要跟着换说法，
// 否则孩子会照着"按 R 键"在屏幕上找键盘
const IS_TOUCH = (() => {
  try { return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1; }
  catch { return false; }
})();

const TUT_STEPS = [
  {
    icon: '👆', title: '先挑一块积木',
    text: IS_TOUCH
      ? '左边是积木形状，下面是颜色。手指点一下方块，再点一个你喜欢的颜色。'
      : '左边是积木形状，下面是颜色。鼠标点一下方块，再点一个你喜欢的颜色。',
  },
  {
    icon: '🔄', title: '让它转个身',
    text: IS_TOUCH
      ? '点屏幕下方「转向」，积木就会转 90°。上下两个按钮是「俯仰」和「摇摆」，能把积木立起来或躺下去。'
      : '按 R 键，或者点屏幕下方「转向」，积木就会转 90°。斜坡、拱门、三角块一定要转对了才放得进去。',
  },
  {
    icon: '🏠', title: '放下去，搭起来',
    text: IS_TOUCH
      ? '手指按在地面上别动，会浮出一个青色的落点框；松开手指，积木就放在那儿了。想换个角度看，就用手指在空处滑动；两指捏一捏可以拉近拉远。'
      : '鼠标移到地面，会出现一个青色的落点框。单击放下积木；再放到已有积木顶上，就能一层层往上堆。拖动是转视角，按住 Shift 拖动平移，滚轮缩放。',
  },
];

let tutIdx = 0;

function showTutorial(force = false) {
  if (!force && localStorage.getItem(TUT_KEY) === '1') return;
  tutIdx = 0;
  document.getElementById('tutorial').classList.remove('hidden');
  renderTutStep();
}

function renderTutStep() {
  const st = TUT_STEPS[tutIdx];
  document.getElementById('tutStep').textContent = `${tutIdx + 1} / ${TUT_STEPS.length}`;
  document.getElementById('tutIcon').textContent = st.icon;
  document.getElementById('tutTitle').textContent = st.title;
  document.getElementById('tutText').textContent = st.text;
  const dots = document.querySelectorAll('#tutDots i');
  dots.forEach((d, i) => {
    d.classList.toggle('on', i === tutIdx);
    d.style.display = i < TUT_STEPS.length ? '' : 'none';
  });
  const nextBtn = document.getElementById('tutNext');
  nextBtn.textContent = tutIdx === TUT_STEPS.length - 1 ? '开始搭建' : '下一步';
  sayNow(st.text, { rate: 1.02 });
}

function closeTutorial() {
  document.getElementById('tutorial').classList.add('hidden');
  localStorage.setItem(TUT_KEY, '1');
  sayNow('开始吧，随便搭点什么。', { rate: 1.04 });
}

document.getElementById('tutNext').onclick = () => {
  if (tutIdx < TUT_STEPS.length - 1) { tutIdx++; renderTutStep(); }
  else closeTutorial();
};
document.getElementById('tutSkip').onclick = closeTutorial;

// ---- 语音开关 ----
const btnVoice = document.getElementById('btnVoice');
bindOnButton('btnVoice', 'voice', (on, initial) => {
  setSpeechEnabled(on);
  if (initial) return;
  if (on) sayNow('语音引导已打开。', { rate: 1.04 });
  else hint('语音已关闭', '#9ff6ff');
});

// 浏览器没有可用语音（有些系统没装中文语音包）时，把按钮标成不可用，
// 免得孩子一直点却什么都没听到
function refreshVoiceSupport() {
  if (speechSupported()) return;
  btnVoice.classList.add('unsupported');
  btnVoice.title = '当前浏览器没有可用的中文语音';
  btnVoice.classList.remove('on');
  setSpeechEnabled(false);
}
whenVoicesReady(refreshVoiceSupport);
setTimeout(refreshVoiceSupport, 2000);


// ===================== 双人轮流比拼 =====================
const versus = { active: false, turn: 'A', counts: { A: 0, B: 0 } };

function versusUpdate() {
  document.getElementById('vsCountA').textContent = versus.counts.A;
  document.getElementById('vsCountB').textContent = versus.counts.B;
  document.getElementById('vsA').classList.toggle('active', versus.turn === 'A');
  document.getElementById('vsB').classList.toggle('active', versus.turn === 'B');
  document.getElementById('vsTurn').textContent = versus.turn === 'A' ? '红方回合' : '蓝方回合';
}

function startVersus() {
  // 走正规出口，否则关卡的参考影子会留在场上，和比拼的画面混在一起
  if (challenge.active) exitChallenge();
  versus.active = true;
  versus.turn = 'A';
  versus.counts = { A: 0, B: 0 };
  world.clear();
  resetSession();
  document.getElementById('versusCard').hidden = false;
  setBlueprint(null);
  ui.statTarget.textContent = '双人比拼';
  closePanels();
  versusUpdate();
  orbit.flyTo(-0.8, 1.02, 26, new THREE.Vector3(0, 1.5, 0));
  sfx.win();
  sayNow('双人比拼开始！红方先放。', { rate: 1.02 });
  hint('👥 红方先放一块', '#ff8a8a');
}

function exitVersus() {
  versus.active = false;
  document.getElementById('versusCard').hidden = true;
  ui.statTarget.textContent = '自由创作';
  hint('已退出比拼', '#9ff6ff');
}

function endVersus() {
  const { A, B } = versus.counts;
  let title, desc;
  if (A === B) { title = '平分秋色！'; desc = `红方 ${A} 块，蓝方 ${B} 块，握手言和`; }
  else if (A > B) { title = '红方获胜！'; desc = `红方 ${A} 块 vs 蓝方 ${B} 块`; }
  else { title = '蓝方获胜！'; desc = `蓝方 ${B} 块 vs 红方 ${A} 块`; }

  const modal = document.getElementById('resultModal');
  const stars = document.querySelectorAll('#rsStars i');
  stars.forEach(el => el.classList.remove('on'));
  const win = Math.max(A, B);
  stars.forEach((el, i) => { if (i < Math.min(3, Math.ceil(win / 6))) el.classList.add('on'); });
  document.getElementById('rsTitle').textContent = title;
  document.getElementById('rsDesc').textContent = desc;
  ['Cover', 'Color', 'Clean'].forEach(k => {
    document.getElementById('rs' + k).style.width = '0%';
    document.getElementById('rs' + k + 'Txt').textContent = '';
  });
  document.getElementById('rsNext').style.display = 'none';
  document.getElementById('rsRetry').textContent = '再来一场';
  document.getElementById('rsRetry').onclick = () => { hideResult(); startVersus(); };
  document.getElementById('rsExit').onclick = () => { hideResult(); exitVersus(); };
  modal.classList.remove('hidden');
  sfx.win();
  sayNow(title + desc, { rate: 1.02 });
}

document.getElementById('btnStartVersus').onclick = startVersus;
document.getElementById('btnVsEnd').onclick = endVersus;
document.getElementById('btnVsQuit').onclick = exitVersus;

// ===================== 关卡挑战 =====================
const CH_KEY = 'pojing-bricks-stars';
const challenge = {
  active: false,
  level: null,
  target: [],
  lastPct: 0,
  lastScore: null,   // 最近一次评分结果，验收弹窗直接复用
};

function chStars() {
  try { return JSON.parse(localStorage.getItem(CH_KEY) || '{}'); } catch { return {}; }
}
function chSaveStars(id, n) {
  const all = chStars();
  if (!all[id] || all[id] < n) { all[id] = n; }
  try { localStorage.setItem(CH_KEY, JSON.stringify(all)); } catch { }
}

function buildLevelList() {
  const el = document.getElementById('levelList');
  const best = chStars();
  el.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const model = MODELS.find(m => m.id === lv.modelId);
    const card = document.createElement('div');
    card.className = 'lv-card';
    // 星数按图纸记（lv.modelId），关卡顺序调整后星星不会串到别的模型上；
    // 老存档用的是关卡 id，这里做一次兜底读取
    const starNum = best[lv.modelId] ?? best[lv.id] ?? 0;
    card.innerHTML = `
      <div class="lv-idx">${i + 1}</div>
      <b>${model ? model.icon : ''} ${lv.name}</b>
      <p>${lv.hint}</p>
      <div class="lv-meta">
        <span>限 ${lv.budget} 块</span>
        ${starNum ? `<span class="best">${'★'.repeat(starNum)}${'☆'.repeat(3 - starNum)}</span>` : '<span>未挑战</span>'}
      </div>`;
    card.onclick = () => startChallenge(lv.id);
    el.appendChild(card);
  });
}

function startChallenge(levelId) {
  const lv = LEVELS.find(l => l.id === levelId);
  if (!lv) return;
  if (versus.active) exitVersus();
  const model = MODELS.find(m => m.id === lv.modelId);
  if (!model) return;

  challenge.active = true;
  challenge.level = lv;
  challenge.target = centerList(model.list.map(d => ({ ...d })));
  challenge.lastPct = 0;
  buildReference(challenge.target);
  const refBtn = document.getElementById('btnChRef');
  if (refBtn) refBtn.textContent = '👻 显示参考影子';

  world.clear();
  resetSession();
  document.getElementById('challengeCard').hidden = false;
  document.getElementById('chName').textContent = lv.name;
  setBlueprint(null);
  ui.statTarget.textContent = lv.name;
  closePanels();
  updateChallengeUI();

  frameModel(model, 0.18);   // 挑战要留出照着搭建的操作空间，取景稍退一点
  sfx.win();
  sayNow(`挑战开始！用 ${lv.budget} 块积木，搭出${lv.name}。`, { rate: 1.02 });
  hint(`挑战：${lv.name} · 最多 ${lv.budget} 块`, '#ffd77a');
}

// ---- 挑战参考影子：把目标模型以半透明幽灵形式摆在场景里，孩子可以照着搭 ----
let refGroup = null;
let refVisible = false;
const refMatCache = new Map();

function refMaterial(hex) {
  let m = refMatCache.get(hex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: hex, transparent: true, opacity: 0.2,
      depthWrite: false, roughness: 0.6, metalness: 0,
    });
    refMatCache.set(hex, m);
  }
  return m;
}

function buildReference(list) {
  clearReference();
  refGroup = new THREE.Group();
  for (const d of list) {
    // 三轴都要带上：图纸里只要有立起来/躺下去的块，影子不跟着转就会和目标错位
    const shape = shapeRot(getShape(d.shapeId), d.rx || 0, d.ry || 0, d.rz || 0);
    const { group } = geoFor(shape);
    const clone = group.clone(true);
    const mat = refMaterial(COLOR_HEX[d.color] ?? 0xcccccc);
    clone.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
    const bb = shapeBounds(shape);
    clone.position.set(d.x + bb.w / 2, d.y, d.z + bb.d / 2);
    refGroup.add(clone);
  }
  refGroup.visible = false;
  scene.add(refGroup);
}

function clearReference() {
  if (refGroup) {
    scene.remove(refGroup);
    refGroup = null;
  }
  refVisible = false;
}

function toggleReference() {
  if (!refGroup) return;
  refVisible = !refVisible;
  refGroup.visible = refVisible;
  const btn = document.getElementById('btnChRef');
  if (btn) btn.textContent = refVisible ? '👻 隐藏参考影子' : '👻 显示参考影子';
  sfx.pick();
  if (refVisible) say('影子打开了，把积木搭到影子上就行。', { rate: 1.03 });
}

function exitChallenge() {
  challenge.active = false;
  challenge.level = null;
  challenge.target = [];
  clearReference();
  document.getElementById('challengeCard').hidden = true;
  ui.statTarget.textContent = '自由创作';
  hint('已退出挑战，随便搭吧', '#9ff6ff');
}

// 评分防抖：连排一次放 5 块会触发 5 次全量比对，合并成一次即可
let chTimer = 0;
function scheduleChallengeUI() {
  clearTimeout(chTimer);
  chTimer = setTimeout(updateChallengeUI, 120);
}

function updateChallengeUI() {
  if (!challenge.active) return;
  const lv = challenge.level;
  const used = world.bricks.length;
  const over = used > lv.budget;
  document.getElementById('chBudget').textContent = `${used} / ${lv.budget} 块`;
  document.getElementById('chBudget').style.color = over ? '#ff8a8a' : '';
  document.getElementById('chBar').style.width = Math.min(100, (used / lv.budget) * 100) + '%';

  const s = scoreModel(challenge.target, world.toJSON());
  challenge.lastPct = s.pct;
  document.getElementById('chPct').textContent = s.pct + '%';
  const stars = document.querySelectorAll('#chStars i');
  stars.forEach((el, i) => el.classList.toggle('on', i < s.stars));
  challenge.lastScore = s;
}

function showResult() {
  const s = challenge.lastScore || scoreModel(challenge.target, world.toJSON());
  const lv = challenge.level;
  const modal = document.getElementById('resultModal');
  const stars = document.querySelectorAll('#rsStars i');
  stars.forEach((el, i) => {
    el.classList.remove('on');
  });
  void modal.offsetWidth;
  stars.forEach((el, i) => { if (i < s.stars) el.classList.add('on'); });

  const titles = ['再试一次吧', '有点样子了！', '搭得真像！', '完美还原！'];
  document.getElementById('rsTitle').textContent = titles[s.stars] || titles[0];
  document.getElementById('rsDesc').textContent =
    s.stars === 3 ? `太厉害了，和图纸有 ${s.pct}% 像！` :
      s.stars === 2 ? `和图纸的相似度是 ${s.pct}%，再调整一下就是三星` :
        s.stars === 1 ? `相似度 ${s.pct}%，看看哪里不一样` :
          `相似度只有 ${s.pct}%，先看看图纸的样子`;

  ['Cover', 'Color', 'Clean'].forEach((k, i) => {
    const v = [s.cover, s.color, s.clean][i];
    const bar = document.getElementById('rs' + k);
    bar.style.width = '0%';
    setTimeout(() => { bar.style.width = v + '%'; }, 60 + i * 90);
    document.getElementById('rs' + k + 'Txt').textContent = v + '%';
  });

  const nextBtn = document.getElementById('rsNext');
  const idx = LEVELS.findIndex(l => l.id === lv.id);
  const hasNext = idx >= 0 && idx < LEVELS.length - 1;
  nextBtn.style.display = hasNext ? '' : 'none';
  nextBtn.onclick = () => { hideResult(); startChallenge(LEVELS[idx + 1].id); };
  document.getElementById('rsRetry').onclick = () => { hideResult(); startChallenge(lv.id); };
  document.getElementById('rsExit').onclick = () => { hideResult(); exitChallenge(); };

  modal.classList.remove('hidden');
  chSaveStars(lv.modelId, s.stars);
  // 成就：累计星数 + 通关城堡
  const total = Object.values(chStars()).reduce((a, b) => a + b, 0);
  trackStars(total);
  if (s.stars >= 1 && lv.modelId === 'castle') trackCastleClear();

  if (s.stars >= 2) {
    sfx.win();
    sayNow(s.stars === 3 ? '太棒了，三星！你真是个小小建筑师。' : '不错哦，两颗星！再试一次能不能拿三星。', { rate: 1.03 });
  } else {
    sayNow('别灰心，再看一眼图纸，试试哪里不一样。', { rate: 1.02 });
  }
}

function hideResult() {
  document.getElementById('resultModal').classList.add('hidden');
}

document.getElementById('btnChCheck').onclick = () => {
  if (world.bricks.length < 3) { hint('先多搭几块再验收吧', '#ffb4b4'); return; }
  showResult();
};
document.getElementById('btnChQuit').onclick = exitChallenge;
document.getElementById('btnChRef').onclick = toggleReference;
document.getElementById('btnStartChallenge').onclick = () => {
  ui.gallery.classList.add('hidden');
  document.getElementById('levelPanel').classList.remove('hidden');
  buildLevelList();
  [...ui.tabs.children].forEach(t => t.classList.toggle('active', t.dataset.view === 'build'));
};
document.getElementById('btnLvClose').onclick = () => {
  document.getElementById('levelPanel').classList.add('hidden');
  closePanels();
};

// ===================== 我的作品（存档） =====================
const WS_KEY = 'pojing-bricks-works';

function wsAll() {
  try { return JSON.parse(localStorage.getItem(WS_KEY) || '[]'); } catch { return []; }
}
function wsSaveAll(list) {
  try { localStorage.setItem(WS_KEY, JSON.stringify(list.slice(0, 24))); return true; }
  catch { hint('存储空间不足，先删掉一些旧作品', '#ffb4b4'); return false; }
}

function renderWorkshop() {
  const list = wsAll();
  const el = document.getElementById('wsList');
  el.innerHTML = '';
  if (!list.length) {
    el.innerHTML = '<div class="ws-empty">还没有作品——搭点什么，然后点「存起来」</div>';
    return;
  }
  [...list].reverse().forEach(item => {
    const d = document.createElement('div');
    d.className = 'ws-item';
    // 作品名来自用户输入/导入文件，一律用 textContent，避免注入
    const nm = document.createElement('b');
    nm.textContent = String(item.name ?? '').slice(0, 40);
    const meta = document.createElement('span');
    meta.textContent = `${item.count} 块 · ${item.date}`;
    d.append(nm, meta);
    if (item.thumb) {
      const img = document.createElement('img');
      img.className = 'ws-thumb';
      img.src = item.thumb;
      img.alt = '';
      d.insertBefore(img, d.firstChild);
    }
    const ops = document.createElement('div');
    ops.className = 'ws-ops';

    const load = document.createElement('button');
    // 存档可能被手改坏、也可能是老版本写的：坏了就禁用打开，
    // 直接 load 进去会在 world.add 里拿到不存在的形状，整页卡死
    const broken = !validBrickList(item.data);
    load.textContent = broken ? '数据损坏' : '打开';
    if (broken) {
      load.disabled = true;
      load.classList.add('broken');
      load.title = '这个作品的数据不完整，打不开了';
    }
    load.onclick = () => {
      if (broken) return;
      if (challenge.active) exitChallenge();
      if (versus.active) exitVersus();
      world.clear();
      resetSession();
      world.load(item.data.map(x => ({ ...x })));
      setBlueprint(null);
      ui.statTarget.textContent = item.name;
      closePanels();
      sfx.win();
      hint(`打开了「${item.name}」`, '#9ff6ff');
    };

    const exp = document.createElement('button');
    exp.textContent = '导出';
    exp.onclick = () => downloadJSON(item);

    const del = document.createElement('button');
    del.textContent = '删除';
    del.className = 'del';
    // 作品删了就找不回来，误点一下太可惜——要点第二下才真删（和"清空"一个套路）
    let delArmed = false;
    del.onclick = () => {
      if (!delArmed) {
        delArmed = true;
        del.textContent = '真的删？';
        del.classList.add('armed');
        setTimeout(() => {
          if (!del.isConnected) return;
          delArmed = false;
          del.textContent = '删除';
          del.classList.remove('armed');
        }, 2600);
        return;
      }
      wsSaveAll(list.filter(x => x.id !== item.id));
      renderWorkshop();
      sfx.remove();
      hint(`已删除「${item.name}」`, '#ffb4b4');
    };

    ops.append(load, exp, del);
    d.appendChild(ops);
    el.appendChild(d);
  });
}

function downloadJSON(item) {
  const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${item.name}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 给作品拍一张小缩略图（200×140 的 JPEG，约 8KB，存进 localStorage 压力可控） */
function captureThumb() {
  try {
    renderer.render(scene, camera);          // 不保留绘制缓冲，取图前必须补渲染一帧
    const W = 200, H = 140;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(renderer.domElement, 0, 0, W, H);
    return cv.toDataURL('image/jpeg', 0.68);
  } catch { return null; }
}

function wsMakeItem(name) {
  return {
    // 只用 Date.now() 的话，连着存两个作品会拿到同一个 id，
    // 删除时按 id 过滤就会一次删掉两个
    id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    name,
    date: new Date().toLocaleDateString('zh-CN'),
    count: world.bricks.length,
    thumb: captureThumb(),
    data: world.toJSON(),
  };
}

document.getElementById('btnWsSave').onclick = () => {
  if (!world.bricks.length) { hint('地面上还没有积木，先搭一点吧', '#ffb4b4'); return; }
  const list = wsAll();
  const name = prompt('给作品起个名字：', ui.statTarget.textContent === '自由创作' ? '我的作品 ' + (list.length + 1) : ui.statTarget.textContent);
  if (!name) return;
  list.push(wsMakeItem(name));
  track('save');
  // 落盘失败就别谎报「已保存」——用户下次打开发现作品没了才是真事故
  if (!wsSaveAll(list)) { renderWorkshop(); return; }
  renderWorkshop();
  sfx.win();
  hint(`「${name}」已保存`, '#ffd77a');
};

document.getElementById('btnWsShot').onclick = () => {
  // WebGL 画布默认不保留绘制缓冲，必须先补渲染一帧再导出，否则截图常为空白
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `破境积木-${Date.now()}.png`;
  a.click();
  track('photo');
  sfx.paint();
  hint('照片已保存', '#9ff6ff');
};

document.getElementById('btnWsExport').onclick = () => {
  if (!world.bricks.length) { hint('地面上还没有积木，先搭一点吧', '#ffb4b4'); return; }
  const name = prompt('导出文件名：', '我的作品');
  if (!name) return;
  downloadJSON(wsMakeItem(name));
  sfx.paint();
};

const BRICK_LIMIT = 6000;

/**
 * 校验作品数据：每条都必须是合法的积木记录，防止坏文件把程序搞崩。
 *
 * 注意形状必须用 id 白名单比对，不能用 getShape()：
 * getShape 对未知道形状会回退成方块，用它做校验等于什么都没拦住，
 * 坏文件里的怪形状会静默变成一堆方块，孩子还以为是自己导出错了。
 */
function validBrickList(data) {
  if (!Array.isArray(data) || !data.length || data.length > BRICK_LIMIT) return false;
  const ids = new Set(SHAPES.map(s => s.id));
  return data.every(d =>
    d && typeof d.shapeId === 'string' && ids.has(d.shapeId) &&
    Number.isInteger(d.x) && Number.isInteger(d.y) && Number.isInteger(d.z) &&
    Math.abs(d.x) <= 500 && Math.abs(d.z) <= 500 && d.y >= 0 && d.y <= 400 &&
    [d.rx, d.ry, d.rz].every(v => v === undefined || (Number.isInteger(v) && v >= 0 && v <= 3)) &&
    (d.color === undefined || typeof d.color === 'string')
  );
}

document.getElementById('btnWsImport').onclick = () => document.getElementById('wsFileInput').click();

// 导入前先挡一道：太大的文件解析会卡死主线程，块数太多会让画面掉到个位数帧率
const IMPORT_MAX_BYTES = 6 * 1024 * 1024;   // 6MB
const IMPORT_MAX_BRICKS = 6000;             // 块

document.getElementById('wsFileInput').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > IMPORT_MAX_BYTES) {
    hint('文件太大了（上限 6MB），换一个小一点的作品文件', '#ffb4b4');
    e.target.value = '';
    return;
  }
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      const data = Array.isArray(obj) ? obj : obj.data;
      if (!validBrickList(data)) throw 0;
      if (data.length > IMPORT_MAX_BRICKS) {
        hint(`作品有 ${data.length} 块，超过 ${IMPORT_MAX_BRICKS} 块上限`, '#ffb4b4');
        e.target.value = '';
        return;
      }
      const name = (obj.name || f.name.replace(/\.json$/i, '')).slice(0, 40);
      if (challenge.active) exitChallenge();
      if (versus.active) exitVersus();
      world.clear();
      resetSession();
      world.load(data.map(d => ({ ...d })));
      setBlueprint(null);
      ui.statTarget.textContent = name;
      closePanels();
      sfx.win();
      hint(`导入了「${name}」`, '#9ff6ff');
    } catch {
      hint('这个文件不是有效的作品文件', '#ffb4b4');
    }
    e.target.value = '';
  };
  r.readAsText(f);
};

document.getElementById('btnWsClose').onclick = closePanels;

// ===================== 零件清单 / 稳固检查 / 回放搭建 =====================
// 对标同类搭建软件的三件套：用料清单、结构稳定性提示、搭建过程重演
const infoModal = document.getElementById('infoModal');

function openInfo(title, desc) {
  document.getElementById('infoTitle').textContent = title;
  document.getElementById('infoDesc').textContent = desc;
  document.getElementById('infoBody').innerHTML = '';
  infoModal.classList.remove('hidden');
  sfx.pick();
}
function closeInfo() { infoModal.classList.add('hidden'); }
document.getElementById('infoClose').onclick = closeInfo;
infoModal.addEventListener('click', e => { if (e.target === infoModal) closeInfo(); });

/** 按形状统计用料（孩子可以借此数一数、分分类） */
function openParts() {
  if (!world.bricks.length) { hint('地面上还没有积木，先搭一点吧', '#ffb4b4'); return; }
  const map = new Map();
  const colors = new Set();
  for (const b of world.bricks) {
    const s = getShape(b.shapeId);
    const cur = map.get(b.shapeId) || { name: s ? s.name : b.shapeId, tag: s ? s.tag : '', n: 0 };
    cur.n++;
    map.set(b.shapeId, cur);
    if (b.color) colors.add(b.color);
  }
  const rows = [...map.values()].sort((a, b) => b.n - a.n);
  const total = world.bricks.length;
  const max = rows[0].n;

  openInfo('零件清单', `一共 ${total} 块积木，用了 ${rows.length} 种形状 · ${colors.size} 种颜色`);
  const body = document.getElementById('infoBody');
  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'parts-row';
    const nm = document.createElement('div');
    nm.className = 'pname';
    const b1 = document.createElement('b');
    b1.textContent = r.name;
    const sp = document.createElement('span');
    sp.style.cssText = 'font-size:10.5px;color:var(--text-dim)';
    sp.textContent = r.tag;
    nm.append(b1, sp);
    const bar = document.createElement('div');
    bar.className = 'pbar';
    const i = document.createElement('i');
    i.style.width = Math.round((r.n / max) * 100) + '%';
    bar.appendChild(i);
    const num = document.createElement('div');
    num.className = 'pnum';
    num.textContent = r.n + ' 块';
    row.append(nm, bar, num);
    body.appendChild(row);
  });
  const foot = document.createElement('div');
  foot.className = 'parts-total';
  foot.innerHTML = '<span>合计</span>';
  const fb = document.createElement('span');
  fb.textContent = total + ' 块';
  foot.appendChild(fb);
  body.appendChild(foot);
}

/**
 * 找出下面没有支撑的积木（同类软件里的 stability check）
 *
 * 连接件（铆钉/螺钉/螺栓/卯榫/木钉/粘合胶）参与判定：
 *  - 它自己不算结构积木，永远不会被判成悬空
 *  - 它贴住的积木视作"已经钉牢"，不再算悬空（这就是"用紧固件实现稳定性"）
 */
const N6DIR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function findUnstable() {
  const isFix = b => !!getShape(b.shapeId).fix;
  // 装饰件（v1.29.0）是贴着画面的纸片，没有重量也不托举别人：
  // 它自己永远不算悬空（否则摆在半空的蝴蝶会一直抖），
  // 下面的装饰件也不能当支撑（否则一只兔子顶着两层楼也算稳）
  const isDeco = b => !!getShape(b.shapeId).sprite;
  const bad = [];
  const pinned = [];
  for (const b of world.bricks) {
    if (isFix(b) || isDeco(b)) continue;
    const cells = world.cellsOf(b);
    let supported = false;
    for (const c of cells) {
      if (c.y <= 0) { supported = true; break; }            // 直接落在地面上
      const below = world.occ.get(World.getG({ x: c.x, y: c.y - 1, z: c.z }));
      if (below && below.id !== b.id && !isFix(below) && !isDeco(below)) { supported = true; break; }   // 下面另有积木托着
    }
    if (supported) continue;
    // 有没有紧固件贴在它身上
    let fixed = false;
    outer: for (const c of cells) {
      for (const [dx, dy, dz] of N6DIR) {
        const nb = world.occ.get(World.getG({ x: c.x + dx, y: c.y + dy, z: c.z + dz }));
        if (nb && nb.id !== b.id && isFix(nb)) { fixed = true; break outer; }
      }
    }
    if (fixed) pinned.push(b); else bad.push(b);
  }
  return { bad, pinned };
}

let wobbleGroup = null;
let wobbleMat = null;
function clearWobble() {
  if (wobbleGroup) {
    wobbleGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    scene.remove(wobbleGroup);
    wobbleGroup = null;
  }
  if (wobbleMat) { wobbleMat.dispose(); wobbleMat = null; }
  document.getElementById('btnStability')?.classList.remove('active');
}

function showWobble(list) {
  clearWobble();
  if (!list.length) return;
  wobbleMat = new THREE.LineBasicMaterial({ color: 0xff5470, transparent: true, opacity: 0.9, depthTest: false });
  wobbleGroup = new THREE.Group();
  for (const b of list) {
    const sb = shapeBounds(World.rotOf(b));
    const box = new THREE.BoxGeometry(sb.w * 1.05, sb.h * 1.05, sb.d * 1.05);
    const geo = new THREE.EdgesGeometry(box);
    box.dispose();
    const line = new THREE.LineSegments(geo, wobbleMat);
    line.position.set(b.x + sb.w / 2, b.y + sb.h / 2, b.z + sb.d / 2);
    line.renderOrder = 999;
    wobbleGroup.add(line);
  }
  scene.add(wobbleGroup);
  document.getElementById('btnStability')?.classList.add('active');
}

function openStability() {
  if (!world.bricks.length) { hint('地面上还没有积木，先搭一点吧', '#ffb4b4'); return; }
  if (wobbleGroup) { clearWobble(); hint('已取消标记', '#9ff6ff'); return; }
  const { bad, pinned } = findUnstable();
  if (!bad.length) {
    showWobble([]);
    openInfo('稳固检查', pinned.length ? `有 ${pinned.length} 块靠连接件固定住了` : '');
    document.getElementById('infoBody').innerHTML =
      '<div class="info-ok">✓ 很稳！每块积木下面都有东西托着</div>'
      + (pinned.length
        ? `<p class="info-warn" style="border-color:rgba(255,207,92,.35);color:var(--accent-2)">`
          + `其中 ${pinned.length} 块本来是悬空的，被你用铆钉 / 螺钉 / 卯榫 / 粘合胶固定住了。</p>`
        : '');
    sfx.win();
    say('搭得很稳，一块都不会掉下来。', { rate: 1.03 });
    return;
  }
  showWobble(bad);
  openInfo('稳固检查', `有 ${bad.length} 块积木下面空着`);
  document.getElementById('infoBody').innerHTML =
    '<p class="info-warn">这些积木被标上了<b style="color:#ff8585">红色边框</b>：它们下面没有别的积木撑着，'
    + '现实里一松手就会掉下来。<br><br>想让它变稳，可以在下面补一块、把它挪到别的积木上面，'
    + '或者拿<b style="color:#e8b64b">铆钉 / 螺钉 / 卯榫 / 粘合胶</b>把它钉在旁边结实的积木上。</p>'
    + (pinned.length ? `<p class="info-warn" style="border-color:rgba(255,207,92,.35);color:var(--accent-2)">`
      + `另外有 ${pinned.length} 块已经靠连接件固定住了，不用管。</p>` : '')
    + '<br><br>提示：红色的标记会随着你继续搭建自动消失。';
  hint(`有 ${bad.length} 块悬空了，看红色边框`, '#ffb4b4');
}

/** 按搭建顺序重演一遍（对应同类软件的说明书，孩子更喜欢看动画） */
let replayTimer = 0;
let replaying = false;
function stopReplay() {
  clearTimeout(replayTimer);
  replaying = false;
  document.getElementById('btnReplayBuild')?.classList.remove('active');
  world.bricks.forEach(b => { if (b.mesh) b.mesh.visible = true; });
}
function replayBuild() {
  if (replaying) { stopReplay(); hint('回放停下了', '#9ff6ff'); return; }
  if (!world.bricks.length) { hint('地面上还没有积木，先搭一点吧', '#ffb4b4'); return; }
  const list = world.bricks.slice();
  replaying = true;
  document.getElementById('btnReplayBuild')?.classList.add('active');
  closeInfo();
  clearWobble();
  list.forEach(b => { if (b.mesh) b.mesh.visible = false; });
  hint('回放中…再点一次按钮可以停下', '#9ff6ff');
  let i = 0;
  const gap = Math.max(55, Math.min(150, 4200 / list.length));
  const step = () => {
    if (!replaying) return;
    if (i >= list.length) {
      stopReplay();
      sfx.win();
      hint(`搭完啦，一共 ${list.length} 块`, '#ffd77a');
      return;
    }
    const b = list[i++];
    if (b.mesh) {
      b.mesh.visible = true;
      dropAnim.add(b.mesh, b.y, { drop: 2.2, bounce: 0.3 });
    }
    sfx.place();
    replayTimer = setTimeout(step, gap);
  };
  step();
}

document.getElementById('btnParts').onclick = openParts;
document.getElementById('btnStability').onclick = openStability;
document.getElementById('btnReplayBuild').onclick = replayBuild;

function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.fov = w / h < 0.85 ? 60 : 42;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
  renderer.setSize(w, h);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 220));

/* v1.28 形状搜索：名字/别名/分类都能搜，输入即过滤（防抖 120ms）。
   "/" 或 Ctrl+K 聚焦搜索框，Esc 清空并回到分类浏览。 */
let searchTimer = 0;
function initShapeSearch() {
  const box = ui.shapeSearch, clr = ui.shapeSearchClear;
  if (!box) return;
  const apply = () => {
    const v = box.value || '';
    shapeQuery = v.trim();
    if (clr) clr.hidden = !shapeQuery;
    buildShapeCats();
    buildShapes();
  };
  box.addEventListener('input', () => {
    if (clr) clr.hidden = !box.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(apply, 120);
  });
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape') { box.value = ''; apply(); box.blur(); e.stopPropagation(); }
  });
  if (clr) clr.onclick = () => { box.value = ''; apply(); box.focus(); };
  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '');
    if ((e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      box.focus(); box.select();
    }
  });
}

// ===================== 自定义形状工作台（v1.28） =====================
// 状态：cells 用 "c,r,l" 字符串集合存，跟内置形状的占位格完全同构。
const vox = { id: null, name: '', cells: new Set(), layer: 0 };
const VOXN = MAX_VOX;

function voxShapeOf() {
  if (!vox.cells.size) return null;
  const cells = [...vox.cells].map(k => k.split(',').map(Number));
  return toShapeDef({ id: '__vox', name: vox.name || '预览', cells });
}

function buildVoxLayers() {
  if (!ui.voxLayers) return;
  ui.voxLayers.innerHTML = '';
  for (let l = 0; l < VOXN; l++) {
    const b = document.createElement('button');
    b.className = 'vox-layer' + (l === vox.layer ? ' active' : '');
    b.textContent = `第 ${l + 1} 层`;
    // 这层已经有几块，一眼就知道哪层有东西
    let n = 0;
    for (const k of vox.cells) if (Number(k.split(',')[2]) === l) n++;
    if (n) {
      const i = document.createElement('i');
      i.textContent = n;
      b.appendChild(i);
    }
    b.onclick = () => { vox.layer = l; buildVoxLayers(); buildVoxGrid(); sfx.select(); };
    ui.voxLayers.appendChild(b);
  }
}

function buildVoxGrid() {
  if (!ui.voxGrid) return;
  ui.voxGrid.innerHTML = '';
  ui.voxGrid.setAttribute('aria-label', `第 ${vox.layer + 1} 层格子`);
  for (let r = 0; r < VOXN; r++) {
    for (let c = 0; c < VOXN; c++) {
      const cell = document.createElement('button');
      const k = `${c},${r},${vox.layer}`;
      cell.className = 'vox-cell' + (vox.cells.has(k) ? ' on' : '');
      // 下面一层有东西的格子打个淡点，方便往上叠
      if (!vox.cells.has(k) && vox.layer > 0 && vox.cells.has(`${c},${r},${vox.layer - 1}`)) cell.classList.add('below');
      cell.title = `第 ${vox.layer + 1} 层 · 第 ${r + 1} 行 第 ${c + 1} 列`;
      cell.onclick = () => {
        if (vox.cells.has(k)) vox.cells.delete(k); else vox.cells.add(k);
        buildVoxLayers(); buildVoxGrid(); updateVoxPreview(); sfx.select();
      };
      cell.oncontextmenu = e => {
        e.preventDefault();
        if (vox.cells.delete(k)) { buildVoxLayers(); buildVoxGrid(); updateVoxPreview(); }
      };
      ui.voxGrid.appendChild(cell);
    }
  }
  if (ui.voxCount) ui.voxCount.textContent = `已放 ${vox.cells.size} 块 · 点格子放/取，右键也能取`;
}

let voxPreviewTimer = 0;
function updateVoxPreview() {
  clearTimeout(voxPreviewTimer);
  voxPreviewTimer = setTimeout(() => {
    const cv = ui.voxPreview;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const def = voxShapeOf();
    if (!def) {
      ctx.fillStyle = 'rgba(233,238,248,.35)';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('点左边格子开始拼', cv.width / 2, cv.height / 2);
      return;
    }
    try {
      const icon = renderOne(def);
      const S = Math.min(cv.width, cv.height) * 0.92;
      ctx.drawImage(icon, (cv.width - S) / 2, (cv.height - S) / 2, S, S);
    } catch (e) { console.warn('预览失败', e); }
  }, 90);
}

// ===================== 存为形状：主平台多选打包成一块新积木 =====================
// v1.28.1：取代原来的 6×6×6 独立工作台。这里直接吃搭建台上的东西——
// 选中几块积木，就把它们占的格子（连同颜色）打包成一个形状，跟内置积木完全同构。
const PICK_MAX_CELLS = 512;   // 打包后的总格数上限，够搭一栋小房子

function enterPickMode() {
  state.pickMode = true;
  state.picked = [];
  state.selected = null;
  setTool('select');
  if (ui.pickBar) ui.pickBar.hidden = false;
  updatePickBar();
  hint('点积木挑零件（再点一次取消），挑完点「存为形状」', '#9ff6ff');
}

function exitPickMode() {
  state.pickMode = false;
  state.picked = [];
  state.selected = null;
  if (ui.pickBar) ui.pickBar.hidden = true;
  hideSelInfo();
}

function updatePickBar() {
  state.picked = state.picked.filter(b => b && world.brickById(b.id));
  if (ui.pickCount) ui.pickCount.textContent = `已选 ${state.picked.length} 块`;
  if (ui.btnPickSave) ui.btnPickSave.disabled = state.picked.length === 0;
}

/** 把选区展开成格子（带颜色）。曲面件（齿轮/圆柱…）没法用格子表达外形，收集名字交给调用方提示。 */
function collectPickedCells() {
  const cells = [];
  const bad = [];
  for (const b of state.picked) {
    const live = world.brickById(b.id);
    if (!live) continue;
    const def = getShape(live.shapeId);
    if (!def) continue;
    if (def.geo) { bad.push(def.name); continue; }
    const sh = shapeRot(def, live.rx || 0, live.ry || 0, live.rz || 0);
    for (const c of sh.cells) {
      cells.push({ c: live.x + c.c, r: live.z + c.r, l: live.y + c.l, color: live.color });
    }
  }
  return { cells, bad };
}

function savePickedShape() {
  const { cells, bad } = collectPickedCells();
  if (!cells.length) {
    hint(bad.length ? `${bad[0]} 是曲面件，存不成方块形状` : '先点几块积木', '#ffb27a');
    return;
  }
  if (bad.length) {
    hint(`选区里有 ${bad.length} 个曲面件（如 ${bad[0]}），先取消它们再存`, '#ffb27a');
    return;
  }
  const name = (ui.pickName && ui.pickName.value) || '';
  const r = saveCustom({ name, cells, max: PICK_MAX_CELLS });
  if (!r.ok) { hint('存不下来：' + (r.msg || ''), '#ff8a8a'); return; }
  sfx.select();
  state.shapeId = r.rec.id;
  shapeCat = 'my';
  exitPickMode();
  buildShapeCats();
  buildShapes();
  rebuildGhost();
  setTool('place');
  updateHint();
  toast(`「${r.rec.name}」已存进「我的」，可以像普通积木一样用了`);
}

function pickAll() {
  state.picked = world.bricks.filter(b => {
    const def = getShape(b.shapeId);
    return def && !def.geo;      // 只要方块类，曲面件打包不进格子
  });
  updatePickBar();
  hint(`已全选 ${state.picked.length} 块方块件`, '#6bff9e');
}

function initPickBar() {
  if (!ui.pickBar) return;
  if (ui.btnPickSave) ui.btnPickSave.onclick = () => savePickedShape();
  if (ui.btnPickAll) ui.btnPickAll.onclick = () => pickAll();
  if (ui.btnPickClear) ui.btnPickClear.onclick = () => {
    state.picked = [];
    updatePickBar();
    hint('已清空选区', '#9ff6ff');
  };
  if (ui.btnPickExit) ui.btnPickExit.onclick = () => { exitPickMode(); hint('已退出存形状', '#9ff6ff'); };
}

function openVox(rec) {
  vox.id = rec ? rec.id : null;
  vox.name = rec ? rec.name : '';
  vox.cells = new Set((rec ? rec.cells : []).map(([c, r, l]) => `${c},${r},${l}`));
  vox.layer = 0;
  if (ui.voxName) ui.voxName.value = vox.name;
  if (ui.btnVoxDelete) ui.btnVoxDelete.hidden = !rec;
  openFullPanel('voxPanel');
  buildVoxLayers();
  buildVoxGrid();
  updateVoxPreview();
}

function closeVox() {
  if (ui.vox) ui.vox.classList.add('hidden');
  closePanels();
  [...ui.tabs.children].forEach(t => t.classList.toggle('active', t.dataset.view === 'build'));
}

function saveVox() {
  const name = (ui.voxName && ui.voxName.value) || '';
  const r = saveCustom({ id: vox.id, name, cells: [...vox.cells].map(k => k.split(',').map(Number)) });
  if (!r.ok) { toast(r.msg || '存不下来'); return; }
  vox.id = r.rec.id;
  state.shapeId = r.rec.id;
  shapeCat = 'my';
  closeVox();
  buildShapeCats();
  buildShapes();
  rebuildGhost();
  setTool('place');
  updateHint();
  toast(`「${r.rec.name}」已放进「我的」`);
  sfx.select();
}

function initVoxPanel() {
  if (!ui.voxGrid) return;
  if (ui.btnVoxClose) ui.btnVoxClose.onclick = () => closeVox();
  if (ui.btnVoxSave) ui.btnVoxSave.onclick = () => saveVox();
  if (ui.btnVoxClear) ui.btnVoxClear.onclick = () => {
    vox.cells.clear();
    buildVoxLayers(); buildVoxGrid(); updateVoxPreview();
  };
  if (ui.btnVoxDelete) ui.btnVoxDelete.onclick = () => {
    if (!vox.id) return;
    deleteCustom(vox.id);
    if (state.shapeId === vox.id) state.shapeId = 'cube';
    vox.id = null;
    closeVox();
    buildShapes();
    rebuildGhost();
    toast('已删除这个自定义形状');
  };
  if (ui.voxName) {
    ui.voxName.addEventListener('input', () => { vox.name = ui.voxName.value; });
  }
}

// 左侧「积木形状」面板可拖拽调宽：窄屏或装饰分类挤不下时，把面板拉宽一点，
// 长名字的装饰件/机械件就能排开。宽度存本地，下次进来沿用。
const LEFTBAR_W_KEY = 'pojing-bricks-leftbar-w';
function setupLeftbarResize() {
  const bar = document.getElementById('leftbar');
  if (!bar) return;
  const MIN = 150;
  // 上限不再是死数：拖到接近屏幕一半都允许，避免"扩到 380 就拖不动了"。
  const maxW = () => Math.max(MIN, Math.min(640, Math.round(innerWidth * 0.58)));
  const docEl = document.documentElement;
  const clamp = v => Math.max(MIN, Math.min(maxW(), Math.round(v)));

  const handle = document.createElement('div');
  handle.id = 'leftbarResizer';
  handle.className = 'aside-resizer';
  handle.title = '拖动调整形状面板宽度';
  handle.setAttribute('aria-label', '拖动调整形状面板宽度');
  document.body.appendChild(handle);

  const position = () => {
    const r = bar.getBoundingClientRect();
    if (!r.height) return;
    handle.style.left = (r.left + r.width - 6) + 'px';
    handle.style.top = r.top + 'px';
    handle.style.height = Math.min(r.height, window.innerHeight - r.top - 8) + 'px';
  };
  const setW = px => {
    const w = clamp(px);
    bar.style.width = w + 'px';                        // 内联宽度优先于媒体查询
    docEl.style.setProperty('--leftbar-w', w + 'px');
    position();
    return w;
  };

  const saved = parseInt(localStorage.getItem(LEFTBAR_W_KEY) || '', 10);
  if (Number.isFinite(saved)) setW(saved);
  requestAnimationFrame(position);

  let drag = false, sx = 0, sw = 0;
  handle.addEventListener('pointerdown', e => {
    drag = true; sx = e.clientX; sw = bar.getBoundingClientRect().width;
    handle.classList.add('dragging');
    try { handle.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => { if (drag) setW(sw + (e.clientX - sx)); });
  const end = e => {
    if (!drag) return;
    drag = false; handle.classList.remove('dragging');
    try { handle.releasePointerCapture(e.pointerId); } catch {}
    const w = Math.round(bar.getBoundingClientRect().width);
    try { localStorage.setItem(LEFTBAR_W_KEY, String(w)); } catch {}
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);

  window.addEventListener('resize', position);
  if (window.ResizeObserver) new ResizeObserver(position).observe(bar);
}

// ===================== 形状悬停放大预览 =====================
// 形状面板里的按钮太小（尤其长梁、多格件），孩子选之前看不清长什么样。
// 鼠标在按钮上停 200ms，就在面板右侧浮出 212px 的大图：
// 普通形状走离屏 3D 渲染（renderOne），装饰件直接用原图（img）。
// 预览是纯展示（pointer-events:none），鼠标可以直接"穿过"它去搭建台放积木。
function setupShapePreview() {
  const pv = document.getElementById('shapePreview');
  if (!pv || !ui.shapeGrid) return;
  const cv = pv.querySelector('canvas');
  const im = pv.querySelector('img');
  const name = pv.querySelector('.sp-name');
  let cur = null, timer = 0;

  const hide = () => { clearTimeout(timer); cur = null; pv.hidden = true; };

  const show = btn => {
    const shape = SHAPES.find(s => s.id === btn.dataset.id);
    if (!shape) return;
    if (shape.sprite) {
      cv.style.display = 'none';
      im.style.display = 'block';
      im.src = shape.sprite;
    } else {
      cv.style.display = 'block';
      im.style.display = 'none';
      const c = renderOne(shape);
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(c, 0, 0, cv.width, cv.height);
    }
    name.textContent = shape.tag ? `${shape.name} · ${shape.tag}` : shape.name;
    const bar = document.getElementById('leftbar').getBoundingClientRect();
    pv.hidden = false;
    const r = pv.getBoundingClientRect();
    let top = btn.getBoundingClientRect().top + btn.getBoundingClientRect().height / 2 - r.height / 2;
    top = Math.max(8, Math.min(innerHeight - r.height - 10, top));
    pv.style.left = Math.min(bar.right + 10, innerWidth - r.width - 8) + 'px';
    pv.style.top = top + 'px';
  };

  ui.shapeGrid.addEventListener('mouseover', e => {
    const btn = e.target.closest('.shape-btn');
    if (!btn || btn.dataset.id === cur) return;
    clearTimeout(timer);
    cur = btn.dataset.id;
    timer = setTimeout(() => show(btn), 200);   // 扫过面板时不闪，停一下才出
  });
  ui.shapeGrid.addEventListener('mouseleave', hide);
  ui.shapeGrid.addEventListener('mouseout', e => {
    // 移到按钮间隙也算离开
    if (!e.relatedTarget || !e.relatedTarget.closest?.('.shape-btn')) hide();
  });
  // 兜底：点别处（切标签、点颜色、点画布）或滚动面板时收起浮层。
  // 否则切到「图纸」后形状面板都不见了，浮层还挂在屏幕上。
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest?.('#shapeGrid') && !e.target.closest?.('#shapePreview')) hide();
  }, true);
  window.addEventListener('scroll', hide, true);
}

function init() {
  resize();
  loadCustomShapes();
  buildShapeCats();
  buildShapes();
  setupLeftbarResize();
  setupShapePreview();
  initShapeSearch();
  initPickBar();
  initVoxPanel();
  buildColors();
  setTool('place');
  rebuildGhost();
  updateHint();

  // 商业发布信息：版本号、更新日志、快捷键表、常见问题
  buildAbout();
  buildKeysTable();
  buildFAQ();

  // 成就系统
  initAchievements();
  setAchievementNotify(a => {
    toast(`🎉 达成成就「${a.name}」`);
    sfx.win();
    say(`恭喜达成成就，${a.name}！`, { rate: 1.05 });
  });

  // 启动时优先恢复上次未完成的草稿，没有则载入示例小屋
  let restored = false;
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (draft && validBrickList(draft.data)) {
      world.load(draft.data.map(x => ({ ...x })));
      ui.statTarget.textContent = String(draft.name || '自由创作').slice(0, 40);
      restored = true;
    }
  } catch { }
  if (!restored) {
    world.load(MODELS[0].list.map(d => ({ ...d })));
    ui.statTarget.textContent = '自由创作';
  }

  orbit.dist = 48;
  orbit.flyTo(-0.85, 1.0, 26, new THREE.Vector3(0, 1.8, 0));

  if (restored) setTimeout(() => hint('已恢复上次的作品，继续搭吧', '#9ff6ff'), 1600);

  tick();

  setTimeout(showTutorial, 1200);

  setTimeout(() => {
    const l = document.getElementById('loading');
    if (!l) return;
    l.classList.add('done');
    setTimeout(() => l.remove(), 700);
  }, 400);
}

/** 启动失败兜底：宁可给一句人话 + 重试按钮，也不要永久停在加载页 */
function showBootFail(err) {
  console.error('[破境积木] 启动失败：', err);
  const l = document.getElementById('loading');
  if (l) l.remove();
  if (document.getElementById('bootFail')) return;
  const el = document.createElement('div');
  el.id = 'bootFail';
  el.className = 'nowebgl';
  el.innerHTML = `<div class="nowebgl-card">
      <div style="font-size:38px">🧰</div>
      <h2>启动时遇到了一点问题</h2>
      <p>游戏没能正常完成初始化。你的草稿保存在本机，刷新页面通常就能恢复。</p>
      <ul>
        <li>点下面的按钮重新加载</li>
        <li>反复出现的话，换用最新版 Chrome / Edge 试试</li>
        <li>技术细节可以在浏览器控制台查看</li>
      </ul>
      <p style="margin-top:16px"><button class="ghost-btn accent" id="bootFailRetry">重新加载</button></p>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#bootFailRetry').onclick = () => location.reload();
}

try {
  init();
} catch (err) {
  showBootFail(err);
}
