// 建造世界：占位表 / 增删改 / 撤销重做 / 持久化
import * as THREE from '../lib/three.module.js';
import { buildBrickGeometry, shapeAt, shapeRot, shapeBounds, studsEnabled, setStudsOn } from './geom.js';
import { getShape, COLOR_HEX, SHAPES } from './shapes.js';
import { buildAxleGroup } from './axles.js';

const geoCache = new Map();

/** 六邻方向：判断"贴住"用 */
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// 装配变换用的临时对象（每块积木每次调整都复用，不产生 GC 垃圾）
const _eul = new THREE.Euler();
const _qf = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export function brickGeometry(shape, params) {
  // 缓存键带凸点开关 + 零件参数：切凸点 / 改齿数节数后同形状会重新构建，不会读到旧几何
  // 自定义形状改一次就要重建：键里带 rev，编辑保存后旧的缓存自然失配
  const k = `${shape.id}@${shape.rev || 0}#${shape.rx || 0},${shape.ry || 0},${shape.rz || 0}#s${studsEnabled() ? 1 : 0}`
    + (params && Object.keys(params).length ? `#p${JSON.stringify(params)}` : '');
  if (!geoCache.has(k)) geoCache.set(k, buildBrickGeometry(shape, params));
  return geoCache.get(k);
}

/**
 * 切换积木凸点显示。返回全场积木的序列化快照，调用方用它
 * clear + 重新 add 一遍（旧网格挂着旧几何，必须重放才能换新外观）。
 */
export function setStuds(v) {
  setStudsOn(v);
  for (const [k, g] of geoCache) {
    // 只清凸点模式对应的旧缓存，另一模式的留给切换回来时复用
    if ((k.endsWith('#s1')) === !!v) geoCache.delete(k);
  }
}

/**
 * 材质按颜色共享：全场积木最多只用 12 个材质（= 调色板颜色数），
 * 而不是每块一个（200 块就是 200 个），大幅省显存与 GPU 状态切换。
 * 注意：共享材质不能随某块积木删除而 dispose，只在整局清空时统一回收。
 */
const matCache = new Map();

/**
 * 材质按「颜色 + 金属感」共享。机械件/连接件用金属材质（高 metalness），
 * 看起来像钢件而不是塑料玩具——这也是"物理真实感"的一部分。
 */
export function makeMaterial(hex, metal = 0) {
  const key = `${hex}|${metal}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshPhysicalMaterial({
    color: hex,
    roughness: metal ? 0.32 : 0.34,
    metalness: metal ? 0.68 : 0.03,
    clearcoat: metal ? 0.25 : 0.6,
    clearcoatRoughness: 0.35,
    sheen: metal ? 0 : 0.35,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0xffffff),
  });
  m.envMapIntensity = metal ? 1.1 : 0.85;
  matCache.set(key, m);
  return m;
}

/** 零件要不要用金属材质：机械 / 连接 / 咬合三类看着都该是"五金件" */
export function isMetalShape(shapeId) {
  const def = getShape(shapeId);
  return def && (def.cat === 'mech' || def.cat === 'join' || def.cat === 'lock') ? 1 : 0;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.bricks = [];
    this.occ = new Map();
    this.byId = new Map();   // id → 积木，射线命中后要立刻反查（原来用 find 是 O(n)）
    this.undoStack = [];
    this.redoStack = [];
    this.onChange = null;
    this._uid = 0;
    this._meshList = null;   // 供射线检测复用（脏时才重建）
    // 桥接轴：传动图里「同轴且有轴向缝」的配对，自动生成细轴把两段轮毂连起来。
    // 它是静止子网格（零件绕它转，正是真实场景），不进 occ/byId，删块不会误删。
    this.axleGroup = new THREE.Group();
    this.axleGroup.name = 'axleGroup';
    this.group.add(this.axleGroup);
  }

  /** 按 id 取积木（O(1)，每帧射线命中都会用到） */
  brickById(id) { return this.byId.get(id) || null; }

  static getG(c) { return `${c.x},${c.y},${c.z}`; }

  /** 积木 → 应用了三轴旋转后的形状（老存档没有 rx/rz，默认 0，向后兼容） */
  static rotOf(b) {
    return shapeRot(getShape(b.shapeId), b.rx || 0, b.ry || 0, b.rz || 0);
  }

  cellsOf(brick) {
    const shape = World.rotOf(brick);
    return shape.cells.map(c => ({ x: brick.x + c.c, y: brick.y + c.l, z: brick.z + c.r }));
  }

  canPlace(shapeId, rx, ry, rz, x, y, z, ignoreId = null) {
    if (y < 0) return false;
    const def = getShape(shapeId);
    const shape = shapeRot(def, rx || 0, ry || 0, rz || 0);
    for (const c of shape.cells) {
      const b = this.occ.get(World.getG({ x: x + c.c, y: y + c.l, z: z + c.r }));
      if (b && b.id !== ignoreId) return false;
    }
    // 连接件（铆钉/螺钉/卯榫/粘合胶…）是"紧固件"，必须贴着一块积木才放得下，
    // 不能凭空浮在半空——否则玩家会以为它是普通小方块。
    if (def.fix) {
      let touch = false;
      for (const c of shape.cells) {
        for (const [dx, dy, dz] of N6) {
          const nb = this.occ.get(World.getG({ x: x + c.c + dx, y: y + c.l + dy, z: z + c.r + dz }));
          if (nb && nb.id !== ignoreId) { touch = true; break; }
        }
        if (touch) break;
      }
      if (!touch) return false;
    }
    return true;
  }

  /** 直接往场景里加一个积木（可选记录撤销） */
  add(data, { record = true } = {}) {
    const brick = { ...data };
    if (!brick.id) brick.id = ++this._uid;
    else this._uid = Math.max(this._uid, brick.id);

    const shape = World.rotOf(brick);
    const bounds = shapeBounds(shape);
    const { group } = brickGeometry(shape, brick.params);
    if (group.userData.pin) brick.pin = group.userData.pin.slice();
    if (group.userData.holes) brick.brickHoles = group.userData.holes.map(h => h.slice());
    if (group.userData.holeNormal) brick.brickHoleNormal = group.userData.holeNormal.slice();
    if (group.userData.axis) brick.axis = group.userData.axis.slice();

    const mesh = group.clone(true);
    // 一块积木只建一个材质，所有子网格共享（省掉成倍的材质开销）
    const mat = makeMaterial(COLOR_HEX[brick.color] ?? 0xcccccc, isMetalShape(brick.shapeId));
    brick.material = mat;
    // 例外：多选存下来的形状自带每格颜色（userData.color），那些子网格用自己的色
    mesh.traverse(o => {
      if (!o.isMesh) return;
      const own = o.userData && o.userData.color;
      o.material = own ? makeMaterial(COLOR_HEX[own] ?? 0xcccccc, isMetalShape(brick.shapeId)) : mat;
    });
    mesh.position.set(brick.x + bounds.w / 2, brick.y * 1.0, brick.z + bounds.d / 2);
    mesh.userData.brickId = brick.id;

    this.group.add(mesh);
    brick.mesh = mesh;
    this.applyXform(brick);   // 应用装配变换（缩放/细转/微移；新积木是默认值）
    this.bricks.push(brick);
    this.byId.set(brick.id, brick);
    this.cellsOf(brick).forEach(c => this.occ.set(World.getG(c), brick));

    // 出场动画统一交给 DropAnimator（main.js 放完自己加弹跳），
    // 这里不再维护第二套缩放动画，免得两套一起改 position.y 打架
    if (record) { this.pushUndo({ type: 'add', data: this.serialize(brick) }); }
    this.emit();
    return brick;
  }

  remove(id, { record = true } = {}) {
    const i = this.bricks.findIndex(b => b.id === id);
    if (i < 0) return false;
    const brick = this.bricks[i];
    this.cellsOf(brick).forEach(c => this.occ.delete(World.getG(c)));
    this.group.remove(brick.mesh);
    this.bricks.splice(i, 1);
    this.byId.delete(id);
    if (record) { this.pushUndo({ type: 'remove', data: this.serialize(brick) }); }
    this.emit();
    return true;
  }

  paint(id, color, { record = true } = {}) {
    const brick = this.bricks.find(b => b.id === id);
    if (!brick || brick.color === color) return false;
    const prev = brick.color;
    brick.color = color;
    // 换的是"共享材质引用"，不是改材质颜色——否则同色积木会一起变色
    const mat = makeMaterial(COLOR_HEX[color] ?? 0xcccccc, isMetalShape(brick.shapeId));
    brick.material = mat;
    brick.mesh.traverse(o => { if (o.isMesh) o.material = mat; });
    if (record) { this.pushUndo({ type: 'paint', id, color, prev }); }
    this.emit();
    return true;
  }

  // ===================== 装配变换（缩放 / 细转 / 微移） =====================

  /** 读一块积木的装配变换（缺省 = 原厂状态） */
  xformOf(b) {
    return {
      scale: b.scale || 1,
      erx: b.erx || 0, ery: b.ery || 0, erz: b.erz || 0,
      ox: b.ox || 0, oy: b.oy || 0, oz: b.oz || 0,
    };
  }

  /**
   * 把装配变换落到网格上。原点是"占地底面中心"，旋转/缩放要绕
   * 积木几何中心转才自然（像拿在手里转，而不是钉在底面上翻）。
   * 顺带把异形件的 sink（穿销钉进下层）也补上——之前 mesh.position
   * 直接覆盖导致下沉量丢失，这里一并修掉。
   */
  applyXform(brick) {
    if (!brick.mesh) return;
    const def = getShape(brick.shapeId);
    const shape = World.rotOf(brick);
    const b = shapeBounds(shape);
    const s = brick.scale || 1;
    _eul.set(brick.erx || 0, brick.ery || 0, brick.erz || 0, 'XYZ');
    _qf.setFromEuler(_eul);
    const ox = brick.ox || 0, oy = brick.oy || 0, oz = brick.oz || 0;
    const Oy = brick.y + oy - (def.sink || 0);
    // 底面中心 O 与静止中心 C
    _v1.set(brick.x + b.w / 2 + ox, Oy, brick.z + b.d / 2 + oz);
    _v2.set(0, b.h / 2 * s, 0);
    brick.mesh.quaternion.copy(_qf);
    brick.mesh.scale.setScalar(s);
    // position = C − q·half：绕中心 C 旋转、按 s 缩放后底面中心仍落在 O
    brick.mesh.position.copy(_v1).add(_v2)
      .sub(_v3.copy(_v2).applyQuaternion(_qf));
  }

  /** 设置装配变换（可记撤销）。data 是 xformOf 形状的子集 */
  setXform(brick, data, { record = true } = {}) {
    const prev = this.xformOf(brick);
    Object.assign(brick, data);
    this.applyXform(brick);
    if (record) this.pushUndo({ type: 'xform', id: brick.id, prev, next: this.xformOf(brick) });
    this.emit();
  }

  // ===================== 零件参数（齿数 / 节数 / 销距…） =====================

  /**
   * 设置零件参数并立即重建几何。record 时入撤销栈——拖动滑块的过程
   * 不记撤销（record:false），松手才用拖动前的值记一条，一次 Ctrl+Z 退整档。
   */
  setParam(brick, key, value, { record = true, prev = undefined } = {}) {
    const before = prev !== undefined ? prev : brick.params?.[key] ?? null;
    brick.params = { ...(brick.params || {}), [key]: value };
    this.rebuildMesh(brick);
    if (record) this.pushUndo({ type: 'param', id: brick.id, key, prev: before, next: value });
    this.emit();
  }

  /** 用当前数据重建一块积木的网格（改参数后调用），保留材质与装配变换 */
  rebuildMesh(brick) {
    const shape = World.rotOf(brick);
    if (brick.mesh) this.group.remove(brick.mesh);
    const { group } = brickGeometry(shape, brick.params);
    // 零件自带的铰接销 / 通孔孔心（活塞销、连杆大小头），动画按真实位置去套
    if (group.userData.pin) brick.pin = group.userData.pin.slice();
    if (group.userData.holes) brick.brickHoles = group.userData.holes.map(h => h.slice());
    if (group.userData.holeNormal) brick.brickHoleNormal = group.userData.holeNormal.slice();
    if (group.userData.axis) brick.axis = group.userData.axis.slice();
    const mesh = group.clone(true);
    mesh.traverse(o => { if (o.isMesh) o.material = brick.material; });
    mesh.userData.brickId = brick.id;
    brick.mesh = mesh;
    this.group.add(mesh);
    this.applyXform(brick);
    this._meshList = null;
  }

  serialize(b) {
    const d = {
      id: b.id, shapeId: b.shapeId, color: b.color,
      rx: b.rx || 0, ry: b.ry || 0, rz: b.rz || 0,
      x: b.x, y: b.y, z: b.z,
    };
    // 装配变换只在偏离默认值时才写入，存档保持紧凑
    const xf = this.xformOf(b);
    if (xf.scale !== 1 || xf.erx || xf.ery || xf.erz || xf.ox || xf.oy || xf.oz) {
      d.scale = +xf.scale.toFixed(2);
      d.erx = +xf.erx.toFixed(3); d.ery = +xf.ery.toFixed(3); d.erz = +xf.erz.toFixed(3);
      d.ox = +xf.ox.toFixed(2); d.oy = +xf.oy.toFixed(2); d.oz = +xf.oz.toFixed(2);
    }
    // 零件参数（齿数/节数/销距…）只在设过时才写入
    if (b.params && Object.keys(b.params).length) d.params = { ...b.params };
    return d;
  }

  /**
   * 把本帧内直接加进来的若干块积木合并成一条撤销记录
   * （镜像对称一次放两块，一次撤销就能全退掉）
   */
  commitBatch(list) {
    if (!list.length) return;
    if (list.length === 1) this.pushUndo({ type: 'add', data: list[0] });
    else this.pushUndo({ type: 'batch', ops: list.map(d => ({ type: 'add', data: d })) });
    this.emit();
  }

  /** 入栈一条撤销记录（超出上限丢最早的，防止长时间游玩内存无限增长） */
  pushUndo(op) {
    this.undoStack.push(op);
    if (this.undoStack.length > 300) this.undoStack.splice(0, this.undoStack.length - 300);
    this.redoStack.length = 0;
  }

  /** 对一批操作整体执行反操作（撤销用，倒序；重做用，正序） */
  _applyBatch(ops) {
    const rev = [...ops].reverse();
    for (const op of rev) {
      if (op.type === 'add') this.remove(op.data.id, { record: false });
      else if (op.type === 'remove') this.add(op.data, { record: false });
      else if (op.type === 'paint') this.paint(op.id, op.prev, { record: false });
    }
  }

  toJSON() { return this.bricks.map(b => this.serialize(b)); }

  load(list, { clear = true } = {}) {
    if (clear) this.clear(false);
    list.forEach(d => this.add(d, { record: false }));
    this.refreshAxles();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.emit();
  }

  /** 按当前积木重新生成桥接轴（传动图同轴且有轴向缝的配对才补） */
  refreshAxles() {
    if (!this.axleGroup) return;
    this.axleGroup.clear();
    const g = buildAxleGroup(this.bricks);
    while (g.children.length) this.axleGroup.add(g.children[0]);
  }

  clear(emit = true) {
    [...this.bricks].forEach(b => {
      this.cellsOf(b).forEach(c => this.occ.delete(World.getG(c)));
      this.group.remove(b.mesh);
    });
    this.bricks.length = 0;
    this.byId.clear();
    this.occ.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    if (this.axleGroup) this.axleGroup.clear();
    if (emit) this.emit();
  }

  undo() {
    const op = this.undoStack.pop();
    if (!op) return false;
    if (op.type === 'add') { this.remove(op.data.id, { record: false }); this.redoStack.push(op); }
    else if (op.type === 'remove') { this.add(op.data, { record: false }); this.redoStack.push(op); }
    else if (op.type === 'paint') { this.paint(op.id, op.prev, { record: false }); this.redoStack.push(op); }
    else if (op.type === 'xform') {
      const b = this.byId.get(op.id);
      if (b) { Object.assign(b, op.prev); this.applyXform(b); }
      this.redoStack.push(op);
    }
    else if (op.type === 'param') { this._applyParam(op.id, op.key, op.prev); this.redoStack.push(op); }
    else if (op.type === 'batch') { this._applyBatch(op.ops); this.redoStack.push(op); }
    this.emit();
    return true;
  }

  redo() {
    const op = this.redoStack.pop();
    if (!op) return false;
    if (op.type === 'add') { this.add(op.data, { record: false }); this.undoStack.push(op); }
    else if (op.type === 'remove') { this.remove(op.data.id, { record: false }); this.undoStack.push(op); }
    else if (op.type === 'paint') { this.paint(op.id, op.color, { record: false }); this.undoStack.push(op); }
    else if (op.type === 'xform') {
      const b = this.byId.get(op.id);
      if (b) { Object.assign(b, op.next); this.applyXform(b); }
      this.undoStack.push(op);
    }
    else if (op.type === 'param') { this._applyParam(op.id, op.key, op.next); this.undoStack.push(op); }
    else if (op.type === 'batch') { for (const inner of op.ops) { if (inner.type === 'add') this.add(inner.data, { record: false }); } this.undoStack.push(op); }
    this.emit();
    return true;
  }

  /** 应用一次参数回滚（撤销/重做共用）：null 表示回到「没设过参数」的原厂状态 */
  _applyParam(id, key, value) {
    const b = this.byId.get(id);
    if (!b) return;
    if (value === null || value === undefined) {
      if (b.params) { delete b.params[key]; if (!Object.keys(b.params).length) delete b.params; }
    } else {
      b.params = { ...(b.params || {}), [key]: value };
    }
    this.rebuildMesh(b);
  }

  /** 供射线检测用的网格数组（缓存，积木增删时才重建） */
  meshes() {
    if (!this._meshList) this._meshList = this.bricks.map(b => b.mesh);
    return this._meshList;
  }

  emit() { this._meshList = null; this.onChange && this.onChange(this); }
}

export { SHAPES };
