// 传动系统解算：从摆好的机械零件里算出「谁带动谁、转速比、方向」，
// 再由主循环按这份计划逐帧驱动网格旋转 / 活塞往复。
// 纯数学模块：不依赖 DOM 与 three.js，单元测试可以直接跑（tmp/pbtest/test-drive.mjs）。
//
// 物理规则（尽量贴近真实机械）：
//  · 同轴耦合   —— 两根转轴平行、轴心几乎重合（轴穿进轴毂），转速同向同速；
//                  隔得远的中间必须有轴杆（传动轴/曲轴/电机）连着才算同一根轴
//  · 齿轮咬合   —— 轴平行、中心距 ≈ 两轮节圆半径之和，反向旋转，转速比 = 半径反比
//  · 链条/皮带  —— 链节两端各挂一个转轮或另一节链，同向传动
//  · 曲柄滑块   —— 曲轴转 θ，连杆把偏心运动变成活塞的往复：s(θ) = r·cosθ + √(L² − r²sin²θ)
import { getShape, gearR, GEAR_MODULE } from './shapes.js';
import { shapeRot, shapeBounds, CONROD_PIN, buildBrickGeometry } from './geom.js';

/** 六邻方向：判断连杆/活塞/链节跟曲轴是否贴着 */
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const AXV = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/**
 * 支承 / 储能件：轴承、轴承座、飞轮。
 * 真机器里它们套在轴上（所以仍参与「同轴耦合」的连通），但自己没有齿，
 * 绝不能跟别的轮子判定成「齿轮咬合」；运转时轴承座外壳也是静止的。
 */
const SUPPORT_IDS = new Set(['bearing', 'pillow', 'flywheel']);
const isSupport = p => SUPPORT_IDS.has(p.def.id);

/** 与 geom.js 格子旋转完全一致的向量旋转：先绕 X、再绕 Z、最后绕 Y（各 90° 步进） */
export function rotVec(v, rx = 0, ry = 0, rz = 0) {
  let [x, y, z] = v;
  for (let i = 0; i < rx; i++) { const t = y; y = z; z = -t; }   // (x,y,z)→(x,z,−y)
  for (let i = 0; i < rz; i++) { const t = x; x = -y; y = t; }   // (x,y,z)→(−y,x,z)
  for (let i = 0; i < ry; i++) { const t = x; x = -z; z = t; }   // (x,y,z)→(−z,y,x)
  return [x, y, z];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scaleV = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return scaleV(a, 1 / l); };

/** 曲柄滑块：活塞相对静止位置沿滑动轴的位移（经典解析解） */
export function pistonStroke(theta, r, L) {
  const s = Math.sin(theta), c = Math.cos(theta);
  const root = L * L - r * r * s * s;
  return r * c + Math.sqrt(Math.max(0, root)) - (r + L);
}

/**
 * 偏置曲柄滑块的精确行程：解 |S0 + s·Pp − P(θ)| = L，返回 s。
 *
 * 为什么不能再用活塞行程的教科书公式 r·cosθ + √(L²−r²sin²θ)：
 * 那个式子假定「曲柄中心、活塞销、滑动轴三者共线」。图纸里的活塞是按格子摆的，
 * 轴线往往偏离曲轴中心（这就是真实的偏置曲柄滑块），硬套公式会让连杆长度
 * 在每个相位都不等于两端孔距 —— 表现出来就是连杆插进活塞、插进曲柄盘。
 * 这里直接解二次方程，任意偏置都精确，连杆就能当刚体摆。
 */
export function sliderTravel(theta, C0, U0, W, r, S0, Pp, L) {
  const c = Math.cos(theta), sn = Math.sin(theta);
  let k = 0, q = 0;
  for (let i = 0; i < 3; i++) {
    const E = S0[i] - C0[i] - r * (c * U0[i] + sn * W[i]);
    k += Pp[i] * E;
    q += E * E;
  }
  q -= L * L;
  const disc = k * k - q;
  if (!(disc > 0)) return 0;
  return -k + Math.sqrt(disc);      // θ=0 时取 0，行程从图纸原位起步
}

// 轴心缓存：world 建好积木会把 userData.axis 记在 brick.axis 上（运行时零成本）；
// 纯数据路径（单元测试、图纸自检、桥接轴）没有 world，这里按几何现算一次并缓存。
const _pinCache = new Map();
// 零件自己烘焙出来的销点（曲轴销 / 活塞销）。传动层一律用它，不再假设「局部 +Y 转一下就对了」。
function pinOf(shape, params) {
  const key = (shape.geo || shape.id) + '|' + (shape.rx || 0) + ',' + (shape.ry || 0) + ',' + (shape.rz || 0)
    + '|' + JSON.stringify(params || {});
  if (_pinCache.has(key)) return _pinCache.get(key);
  let v = null;
  try {
    const { group } = buildBrickGeometry(shape, params || {});
    if (group.userData.pin) v = group.userData.pin;
  } catch (e) { v = null; }
  _pinCache.set(key, v);
  return v;
}

const _axisCache = new Map();
function axisOf(shape, params) {
  const key = (shape.geo || shape.id) + '|' + (shape.rx || 0) + ',' + (shape.ry || 0) + ',' + (shape.rz || 0)
    + '|' + JSON.stringify(params || {});
  if (_axisCache.has(key)) return _axisCache.get(key);
  let v = null;
  try {
    const { group } = buildBrickGeometry(shape, params || {});
    if (group.userData.axis) v = group.userData.axis;
  } catch (e) { v = null; }
  _axisCache.set(key, v);
  return v;
}

/** 把一块积木解读成传动节点；不是传动件返回 null */
export function mechPart(brick) {
  const def = getShape(brick.shapeId);
  if (!def.spin && !def.slide && !def.chain && !def.belt && !def.conrod && !def.rack && !def.bevel) return null;
  const shape = shapeRot(def, brick.rx || 0, brick.ry || 0, brick.rz || 0);
  const b = shapeBounds(shape);
  const cells = shape.cells.map(c => ({ x: brick.x + c.c, y: brick.y + c.l, z: brick.z + c.r }));
  const rot = [brick.rx || 0, brick.ry || 0, brick.rz || 0];
  // v1.22 亚格装配层：ox/oy/oz 是「实体相对占位格中心的微调」，
  // 传动中心必须跟着一起挪，否则旋转件会绕错误的轴心自转（看着像偏心晃动）。
  // cells 仍保持整数格——六邻贴合/支撑判定属于搭建逻辑，不该被装配微调扰动。
  const off = [brick.ox || 0, brick.oy || 0, brick.oz || 0];
  // v1.27 轴心用零件自己的（几何包围盒中心），而不是占位格中心。
  // 曲轴只有 0.46 格高、拨盘 0.84 格高，格心与真实轴心差 0.2~0.6 格；
  // 按格心转，整件会绕着空气画圈，连杆/拨销就跟着跑偏、插进别的零件里。
  const ax = brick.axis || axisOf(shape, brick.params);
  // 水平方向：普通件几何本身就是居中的（ax≈0）；keep 件（外伸件）按占位格中心算，
  // 免得改动它们原有的对位关系。竖直方向一律用零件自己的轴心。
  const center = [
    brick.x + b.w / 2 + off[0] + (ax && !def.keep ? ax[0] : 0),
    brick.y + off[1] + (ax ? ax[1] : b.h / 2),
    brick.z + b.d / 2 + off[2] + (ax && !def.keep ? ax[2] : 0),
  ];
  // 零件参数：装配台里改的齿数/节数/销距/转速，直接改写传动特性
  const params = brick.params || {};
  const teeth = def.teeth ? (params.teeth || def.teeth) : 0;
  const part = {
    id: brick.id, shapeId: brick.shapeId, def, cells, center,
    axis: def.spin ? norm(rotVec(AXV[def.spin], ...rot)) : null,
    slide: def.slide ? norm(rotVec(AXV[def.slide], ...rot)) : null,
    r: teeth ? gearR(teeth) : (def.r || 0),
    teeth,
    starts: def.starts || 0,
    slots: def.slots ? Math.round(params.slots || def.slots) : 0,
    hub: def.hub || 0.4,
    // 销偏距这类「只写在 pdef 里、没有顶层字段」的参数，图纸里没存 params 时也要取默认值，
    // 否则 buildDrivetrain 读到 0，曲轴转得欢、活塞却一动不动
    pinR: params.pinR ?? def.pinR ?? (def.pdef || []).find(p => p.key === 'pinR')?.def ?? 0,
    power: def.power ? (params.power ?? def.power) : 0,
    lead: def.id === 'leadScrew' ? (params.lead ?? 0.3) : 0,
    lift: def.id === 'cam' ? (params.lift ?? 0.42) : 0,
    // 只有轴承/轴承座的外圈是钉死在机架上的静止件；飞轮是储能轮，必须跟着轴转
    staticPart: def.id === 'bearing' || def.id === 'pillow',
    bevel: !!def.bevel,
    yoke: !!def.yoke,
    oscillate: !!def.oscillate,
  };
  if (def.chain || def.belt) {
    // 链节/皮带沿自身长轴的两端挂点。实体化后外观占地固定（节数只改链节密度、
    // 不会把带子拉出格子），所以解算的挂点也必须跟着几何的固定长度走，
    // 否则会出现"看着只跨两格、解算却挂到五格外"的假传动。
    const halfLen = ((def.size && def.size[0]) || 2) / 2 - 0.08;
    const dir = norm(rotVec(AXV.x, ...rot));
    part.ends = [add(center, scaleV(dir, halfLen)), sub(center, scaleV(dir, halfLen))];
  }
  if (def.rack) {
    // 齿条的长轴：齿轮沿着它滚，齿条就沿这条轴走直线
    part.rackDir = norm(rotVec(AXV.x, ...rot));
  }
  return part;
}

/**
 * 由全场积木解算传动计划。
 * 返回：
 *   parts          所有传动节点
 *   groups         旋转组 [{ rootId, omega, members: [{ id, sign, factor, axis, center, ...part }] }]
 *   linkages       曲柄滑块 [{ crankId, conrodId, pistonId, C0, A, U0, W, pinR, Pp, S0, L }]
 *   sources        动力源 id（电机优先，其次手摇曲轴）
 *   hasSource      是否有动力源
 */
export function buildDrivetrain(bricks) {
  // 图纸/测试数据里积木可能没有 id：统一兜底成 "#序号"，图内查找也走这份规范化列表
  const normBricks = bricks.map((b, i) => ({ ...b, id: b.id ?? `#${i}` }));
  const idBricks = new Map(normBricks.map(b => [b.id, b]));
  const parts = normBricks.map(mechPart).filter(Boolean);
  // 槽轮只由拨销带动（步进运动，不是匀速旋转），不进普通旋转组
  // 棘轮排在最后：单向边只进不出，先让它当根会把整组动力关在门外
  const rotators = parts.filter(p => p.axis && !p.def.geneva)
    .sort((a, b) => (a.def.ratchet ? 1 : 0) - (b.def.ratchet ? 1 : 0));
  const chains = parts.filter(p => p.def.chain || p.def.belt);
  const racks = parts.filter(p => p.def.rack);
  const conrods = parts.filter(p => p.def.conrod);
  const pistons = parts.filter(p => p.slide && !p.def.yoke);
  const yokes = parts.filter(p => p.def.yoke);
  const byId = new Map(parts.map(p => [p.id, p]));

  // 边：ωb = sign_b · factor_b · ωroot（后文在邻接图上传播）
  const edges = [];   // { a, b, ratio, flip, oneWay? }  ωb = ±ωa·ratio

  const isShaft = p => p.def.id === 'axle' || p.def.id === 'crank' || p.def.id === 'motor'
    || p.def.id === 'gearBig' || p.def.id === 'gearSmall' || p.def.id === 'pulley'
    || p.def.id === 'worm' || p.def.id === 'genevaDrive'
    || p.def.id === 'coupling' || p.def.id === 'flywheel' || p.def.id === 'bearing'
    || p.def.id === 'ratchet' || p.def.id === 'tire';

  // ---- 1) 转轴 × 转轴：同轴耦合 / 齿轮咬合 ----
  for (let i = 0; i < rotators.length; i++) {
    for (let j = i + 1; j < rotators.length; j++) {
      const a = rotators[i], b = rotators[j];
      const par = Math.abs(dot(a.axis, b.axis));
      if (par < 0.9) continue;                       // 轴不平行，转不到一起去
      const d = sub(b.center, a.center);
      const along = dot(d, a.axis);
      const perpV = sub(d, scaleV(a.axis, along));
      const perp = len(perpV);
      // 同轴：轴心落在彼此轴毂里（像真机器一样"轴穿进轮毂"）
      if (perp < a.hub + b.hub) {
        // 挨着、或中间隔一只联轴器/轴承座（真机器里轴就是这么一节节接起来的）
        let linked = Math.abs(along) < 2.8;
        if (!linked) {
          // 隔得远：中间得有轴杆连着（轴/曲轴/电机/齿轮当联轴器）
          linked = rotators.some(k => {
            if (k === a || k === b || !isShaft(k)) return false;
            const dk = sub(k.center, a.center);
            const ak = dot(dk, a.axis);
            // 中间那根轴杆必须落在 a→b 之间（同向且比 b 更近）
            if (Math.sign(ak) !== Math.sign(along) || Math.abs(ak) > Math.abs(along)) return false;
            const perpK = len(sub(dk, scaleV(a.axis, ak)));
            return perpK < a.hub + k.hub + 0.15;
          });
        }
        if (linked) {
          // 棘轮：轴能带着它转，它却带不动轴——棘爪顶住齿面就卡死了（单向）
          if (a.def.ratchet || b.def.ratchet) {
            const shaft = a.def.ratchet ? b : a;
            const rat = a.def.ratchet ? a : b;
            edges.push({ a: shaft.id, b: rat.id, ratio: 1, flip: false, oneWay: true });
          } else {
            edges.push({ a: a.id, b: b.id, ratio: 1, flip: false });
          }
        }
        continue;
      }
      // 齿轮咬合：中心距 ≈ 两轮节圆半径之和，轴向要对得齐（齿面贴齿面）。
      // 转速比用齿数比（真实齿轮定律：ωA/ωB = 齿B/齿A）
      // 轴承 / 轴承座 / 飞轮没有齿，只是套在轴上跟着连通，不参与咬合。
      // 锥齿轮走垂直轴规则、摇杆只摆不整圈转，都不参与平行轴咬合。
      if (isSupport(a) || isSupport(b)) continue;
      if (a.def.bevel || b.def.bevel || a.def.oscillate || b.def.oscillate) continue;
      if (Math.abs(perp - (a.r + b.r)) < 0.5 && Math.abs(along) < 1.2) {
        const ratio = a.teeth && b.teeth ? a.teeth / b.teeth : a.r / b.r;
        edges.push({ a: a.id, b: b.id, ratio, flip: true });
      }
    }
  }

  // ---- 1.55) 锥齿轮：两根轴互相垂直，齿在锥面上咬合，把动力拐 90° ----
  // 和平行轴齿轮不同，锥齿轮看的是「两轴垂直 + 锥顶近乎相交」，不看节圆中心距。
  for (const bg of parts) {
    if (!bg.def.bevel || !bg.axis) continue;
    for (const g of rotators) {
      if (!g.axis || g.def.bevel || g.def.oscillate || isSupport(g) || g.def.worm) continue;
      if (Math.abs(dot(bg.axis, g.axis)) > 0.35) continue;      // 两轴要垂直
      if (len(sub(g.center, bg.center)) > 2.6) continue;        // 锥顶得凑到一起
      const ratio = bg.teeth && g.teeth ? bg.teeth / g.teeth : 1;
      edges.push({ a: bg.id, b: g.id, ratio, flip: true });
    }
  }

  // ---- 1.5) 蜗轮蜗杆：轴互相垂直、中心距 ≈ 两半径和 ----
  // 蜗杆每转一圈只推蜗轮走过（头数）颗齿——单头就是大减速比；
  // 而且只能蜗杆带蜗轮，反过来蜗轮推蜗杆会被"锁死"（oneWay 单行道），
  // 这就是电梯和卷扬机不会自己倒转的原理。
  for (const wm of parts) {
    if (!wm.def.worm || !wm.axis) continue;
    for (const g of rotators) {
      if (!g.axis || g.def.worm || isSupport(g)) continue;    // 轴承不是蜗轮
      if (Math.abs(dot(wm.axis, g.axis)) > 0.25) continue;    // 要互相垂直
      const d = sub(g.center, wm.center);
      const along = dot(d, wm.axis);
      if (Math.abs(along) > 1.0) continue;                    // 蜗杆得"藏"在蜗轮齿下
      const perp = len(sub(d, scaleV(wm.axis, along)));
      if (Math.abs(perp - (wm.r + g.r)) > 0.5) continue;      // 中心距 ≈ 半径和
      const starts = wm.starts || 1;
      const ratio = g.teeth ? starts / g.teeth : wm.r / g.r;
      edges.push({ a: wm.id, b: g.id, ratio, flip: false, oneWay: true });
    }
  }

  // ---- 1.6) 齿轮齿条：齿条沿自身长轴直线走，齿轮每转一弧度它就走 r 格 ----
  // 齿条上的齿是连续排的，所以沿长轴方向站在哪儿都咬得上，只看齿面高度对不对。
  const slides = [];
  for (const rk of racks) {
    const dir = rk.rackDir;
    for (const g of rotators) {
      if (!g.axis) continue;
      if (Math.abs(dot(g.axis, dir)) > 0.4) continue;      // 齿轮轴要横着，齿才咬得住
      const d = sub(g.center, rk.center);
      const nrm = norm(cross(g.axis, dir));                // 齿面法线
      const hgt = dot(d, nrm);                             // 齿轮在齿条的哪一侧
      if (Math.abs(Math.abs(hgt) - (g.r + 0.45)) > 0.7) continue;
      if (Math.abs(dot(d, g.axis)) > 0.9) continue;
      if (Math.abs(dot(d, dir)) > 1.9) continue;
      // v1.27 行程限位：真齿条的直线行程就是它自己的长度（两端有挡块/限位开关）。
      // 以前按「轮转多少度就走多远」无限累加，齿条会一路走出图纸外。
      const rackLen = rk.def.size ? (rk.def.size[0] || 4) : 4;
      const stroke = Math.max(0.6, rackLen / 2 - 1.0);
      slides.push({ id: rk.id, driveId: g.id, r: g.r, dir, sign: Math.sign(hgt) || 1, kind: 'rack', stroke });
    }
  }
  // ---- 1.7) 丝杠螺母：丝杠转一整圈，螺母沿轴前进一个螺距 ----
  for (const sc of parts) {
    if (sc.def.id !== 'leadScrew' || !sc.axis) continue;
    for (const nt of parts) {
      if (nt.def.id !== 'leadNut') continue;
      const d = sub(nt.center, sc.center);
      const along = dot(d, sc.axis);
      const perp = len(sub(d, scaleV(sc.axis, along)));
      if (perp > 1.2 || Math.abs(along) > 2.2) continue;  // 螺母套在丝杠上，径向偏一格也算咬住
      // v1.27 同理：有效螺纹就那么长，走到头由行程开关换向，螺母不会一路旋出丝杠端头
      const screwLen = sc.def.size ? (sc.def.size[0] || 3) : 3;
      const stroke = Math.max(0.6, screwLen / 2 - 0.8);
      slides.push({ id: nt.id, driveId: sc.id, r: sc.lead / (Math.PI * 2), dir: sc.axis, sign: 1, kind: 'screw', stroke });
    }
  }

  // ---- 1.8) 万向节：两轴成 20°–70° 夹角也能把扭矩传过去（十字轴在中间摆）----
  for (const u of parts) {
    if (!u.def.universal || !u.axis) continue;
    for (const p of rotators) {
      if (p.id === u.id || p.def.universal || !p.axis) continue;
      const ca = Math.abs(dot(u.axis, p.axis));
      if (ca > 0.985) continue;                      // 完全同轴就归同轴规则管
      if (len(sub(p.center, u.center)) > 1.9) continue;
      edges.push({ a: u.id, b: p.id, ratio: 1, flip: false });
    }
  }

  // ---- 1.9) 凸轮从动件：偏心轮转一圈，顶杆被抬起一个升程，再由压簧压回去 ----
  for (const cm of parts) {
    if (cm.def.id !== 'cam' || !cm.axis) continue;
    for (const fl of parts) {
      if (!fl.slide || slides.some(s => s.id === fl.id)) continue;
      if (Math.abs(dot(cm.axis, fl.slide)) > 0.4) continue;   // 顶杆方向要垂直于凸轮轴
      const d = sub(fl.center, cm.center);
      if (Math.abs(dot(d, cm.axis)) > 1.2) continue;          // 轴向要对齐
      const alongS = dot(d, fl.slide);
      const perp = len(sub(d, scaleV(fl.slide, alongS)));
      if (perp > 1.35) continue;                             // 得贴在凸轮外缘
      if (Math.abs(alongS) < 0.4 || Math.abs(alongS) > 2.2) continue;
      slides.push({
        id: fl.id, driveId: cm.id, r: cm.lift, dir: fl.slide,
        sign: Math.sign(alongS) || 1, kind: 'cam',
      });
    }
  }

  // ---- 1.95) 棘爪：棘轮每转过一齿，爪被齿顶顶起一次，再由压簧压回齿间 ----
  // 这也是「间歇运动」的一种：棘轮匀速转，棘爪却按齿频一跳一跳。
  for (const pw of parts) {
    if (pw.def.id !== 'pawl' || !pw.slide) continue;
    for (const rt of rotators) {
      if (!rt.def.ratchet || !rt.axis) continue;
      if (len(sub(pw.center, rt.center)) > 2.8) continue;
      slides.push({ id: pw.id, driveId: rt.id, r: 0.16, dir: pw.slide, sign: 1,
        kind: 'pawl', freq: rt.teeth || 12 });
    }
  }

  // ---- 2) 链条 / 皮带：两端各挂最近的转轮或另一节链 ----
  for (const ch of chains) {
    const chDir = norm(sub(ch.ends[1], ch.ends[0]));
    for (const end of ch.ends) {
      let best = null, bestD = 1.7;
      for (const p of rotators) {
        if (Math.abs(dot(p.axis, chDir)) > 0.9) continue;   // 轮轴别顺着链方向（那样挂不住）
        const d = len(sub(p.center, end));
        if (d < bestD) { bestD = d; best = p; }
      }
      for (const c2 of chains) {
        if (c2.id === ch.id) continue;
        for (const e2 of c2.ends) {
          const d = len(sub(e2, end));
          if (d < Math.min(bestD, 1.2)) { bestD = d; best = c2; }
        }
      }
      if (best) edges.push({ a: ch.id, b: best.id, ratio: 1, flip: false });
    }
  }

  // ---- 2.5) 槽轮机构：拨盘的销扫进槽里才带动，出槽就锁死（步进） ----
  // 运动规律由 updateRun 按「销进槽的角度 = 槽轮角」实时解算，这里只配对。
  const genevas = [];
  for (const drv of parts) {
    if (!drv.def.genevaPin || !drv.axis) continue;
    for (const wh of parts) {
      if (!wh.def.geneva || !wh.axis) continue;
      if (Math.abs(dot(drv.axis, wh.axis)) < 0.9) continue;   // 两轴要平行
      const d = sub(wh.center, drv.center);
      const along = dot(d, drv.axis);
      if (Math.abs(along) > 1.6) continue;
      const perp = len(sub(d, scaleV(drv.axis, along)));
      const Rp = drv.pinR || 1.05;
      const reach = perp - Rp;                // 拨销离槽轮中心最近能到多近
      // 销得够得着槽底（约 0.38×轮半径），又不能近到穿心
      if (reach < 0.2 || reach > wh.r * 0.38 + 0.4) continue;
      genevas.push({ driveId: drv.id, wheelId: wh.id, C: perp, Rp, slots: wh.slots || 4, Ro: wh.r });
    }
  }

  // ---- 3) 邻接表 + 连通分量 + BFS 传播转速比与方向 ----
  // （链条是"传动件"不是转轴，当通路节点参与：链两端的轮子属于同一组）
  // oneWay 边（蜗杆→蜗轮）只单向传播：蜗轮反过来推不动蜗杆——自锁
  const adj = new Map();
  for (const e of edges) {
    if (!byId.has(e.a) || !byId.has(e.b)) continue;
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push({ to: e.b, ratio: e.ratio, flip: e.flip });
    if (!e.oneWay) adj.get(e.b).push({ to: e.a, ratio: 1 / e.ratio, flip: e.flip });
  }
  const groupOf = new Map();
  const groupsList = [];
  for (const p of rotators) {
    if (groupOf.has(p.id)) continue;
    const g = { rootId: p.id, members: [], omega: 0, hasSource: false };
    p.sign = 1; p.factor = 1;
    groupOf.set(p.id, g);
    const seen = new Set([p.id]);
    const queue = [p];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.axis) g.members.push(cur);
      for (const { to, ratio, flip } of (adj.get(cur.id) || [])) {
        if (seen.has(to) || !byId.has(to)) continue;
        seen.add(to);
        const nxt = byId.get(to);
        if (nxt.axis && !groupOf.has(to)) {
          nxt.sign = cur.sign * (flip ? -1 : 1);
          nxt.factor = cur.factor * ratio;
          groupOf.set(to, g);
        } else if (!nxt.axis) {
          nxt.sign = 1; nxt.factor = 1;   // 链条节点：只做通路，不改速不改向
        }
        queue.push(nxt);
      }
    }
    groupsList.push(g);
  }
  const groupsMap = groupOf;

  // ---- 4) 动力源：电机优先，其次手摇曲轴 / 拨盘，再次上紧的发条盒 ----
  const motors = rotators.filter(p => p.def.id === 'motor');
  const cranks = rotators.filter(p => p.def.id === 'crank' || p.def.genevaPin);
  const springs = rotators.filter(p => p.def.id === 'spring');
  let sources = [];
  if (motors.length) {
    sources = motors.map(p => p.id);
    for (const m of motors) {
      const g = groupsMap.get(m.id);
      if (g) g.omega = Math.max(g.omega, m.power);
    }
  } else if (cranks.length) {
    sources = cranks.map(p => p.id);
    for (const c of cranks) {
      const g = groupsMap.get(c.id);
      if (g) g.omega = Math.max(g.omega, c.power);
    }
  } else if (springs.length) {
    // 纯发条机构（发条钟、发条小车）：没有电机也能靠卷紧的钢带自己走
    sources = springs.map(p => p.id);
    for (const s of springs) {
      const g = groupsMap.get(s.id);
      if (g) g.omega = Math.max(g.omega, s.power);
    }
  }
  for (const g of groupsList) {
    if (g.omega > 0) g.hasSource = true;
  }

  // ---- 5) 曲柄滑块：曲轴 → 连杆 → 活塞 ----
  const cellsAdjacent = (ca, cb) => {
    const set = new Set(ca.map(c => `${c.x},${c.y},${c.z}`));
    return cb.some(c => N6.some(([dx, dy, dz]) => set.has(`${c.x + dx},${c.y + dy},${c.z + dz}`)));
  };
  const linkages = [];
  for (const pis of pistons) {
    const rod = conrods.find(rd => cellsAdjacent(rd.cells, pis.cells));
    if (!rod) continue;
    const cr = cranks.find(c => cellsAdjacent(c.cells, rod.cells));
    if (!cr || !cr.axis) continue;
    // 几何：曲轴中心 C0，曲柄销在 ⊥A 的平面里画半径 pinR 的圆；
    // 活塞沿滑动轴 Pp 往复，连杆把两者连起来（曲柄滑块机构）。
    const A = cr.axis;
    const brickCr = idBricks.get(cr.id) || {};
    // 销的静止方向：直接取曲轴几何烘焙出来的销点（以前按「局部 +Y 旋转」硬算，
    // 曲轴一被图纸转倒，销的实际位置就和算出来的差半格，连杆大头对不上销、整根杆穿进曲轴）
    const cb = shapeBounds(shapeRot(getShape(cr.shapeId), brickCr.rx || 0, brickCr.ry || 0, brickCr.rz || 0));
    const crankBase = [brickCr.x + cb.w / 2, brickCr.y, brickCr.z + cb.d / 2];
    const pinLocal = brickCr.pin || pinOf(shapeRot(getShape(cr.shapeId), brickCr.rx || 0, brickCr.ry || 0, brickCr.rz || 0), brickCr.params);
    const pinWorld = pinLocal ? add(crankBase, pinLocal) : null;
    const pinR = pinWorld ? len(sub(pinWorld, cr.center)) : cr.pinR;
    const U0 = pinWorld
      ? norm(sub(pinWorld, cr.center))
      : norm(rotVec([0, 1, 0], brickCr.rx || 0, brickCr.ry || 0, brickCr.rz || 0));  // 兜底：局部 +Y
    const W = norm(cross(A, U0));
    const Pp = pis.slide;
    if (Math.abs(dot(Pp, A)) > 0.9) continue;       // 活塞得垂直于曲轴装才推得动
    const brickPi = idBricks.get(pis.id) || {};
    const pisShape = shapeRot(getShape(pis.shapeId), brickPi.rx || 0, brickPi.ry || 0, brickPi.rz || 0);
    const pb = shapeBounds(pisShape);
    const pistonBase = [brickPi.x + pb.w / 2, brickPi.y, brickPi.z + pb.d / 2];   // 活塞底面中心
    // 连杆小头要套在**活塞销**上，不是活塞底面中心。销的位置由几何烘焙而来
    // （geom 把局部销心按 rx/ry/rz 转到最终姿态 → world.add 存到 brick.pin），
    // 所以活塞摆倒、缩放都不会算错。
    const pinOff = brickPi.pin || [0, 0, 0];
    const pistonPin = add(pistonBase, pinOff);
    const P0 = add(cr.center, scaleV(U0, pinR));
    // 连杆是**刚体**：L 只能等于两端孔心距（CONROD_PIN.span），不是自由变量。
    // 旧代码把 L 取成「图纸里销到销的距离」，于是动画每帧拉伸杆子去凑——
    // 杆子一拉长，小头就扎进活塞里。现在反过来：L 固定，活塞销的静止位
    // 沿同一方向微调到 L（差值通常 <0.01 格），活塞与连杆就永远严丝合缝。
    const rawL = len(sub(pistonPin, P0));
    if (rawL < cr.pinR * 1.4 || rawL > 6) continue;  // 摆得太近/太远都不成机构
    const L = CONROD_PIN.span;
    if (Math.abs(rawL - L) > 0.5) continue;          // 杆长与销距差太多 = 图纸放错了
    const uP = scaleV(sub(pistonPin, P0), 1 / rawL);
    const S0 = add(P0, scaleV(uP, L));               // 活塞销静止位（精确到刚体长度）
    const pinShift = sub(S0, pistonPin);             // 活塞姿态要跟着挪这一点点
    // 十字头：贴在活塞上、滑动轴又和活塞平行的直线件（导轨滑块），
    // 真机器里它由活塞杆带着一起走，这里同步给同样的位移
    const slideIds = new Set(slides.map(s => s.id));
    const followers = pistons
      .filter(f => f.id !== pis.id && !slideIds.has(f.id)
        && Math.abs(dot(f.slide, Pp)) > 0.9 && cellsAdjacent(f.cells, pis.cells))
      .map(f => f.id);
    linkages.push({
      crankId: cr.id, conrodId: rod.id, pistonId: pis.id,
      C0: cr.center, A, U0, W, pinR, Pp, S0, pinOff, L, pinShift,
      followers, theta: 0,
    });
  }

  // ---- 5.5) 苏格兰轭 / 摇杆 / 压簧：把「转动」翻译成别的运动 ----
  // 苏格兰轭（知乎 8、24）：曲柄销卡在竖槽里，输出是严格的 s = r·cosθ 正弦往复；
  // 摇杆（知乎 43、59）只左右摆一个角度，不整圈转。两者都靠曲柄驱动。
  const yokePlan = [];
  for (const yk of yokes) {
    let best = null, bestD = 3.4;
    for (const cr of cranks) {
      if (!cr.axis || Math.abs(dot(cr.axis, yk.slide)) > 0.4) continue;
      const d = len(sub(yk.center, cr.center));
      if (d < bestD) { bestD = d; best = cr; }
    }
    if (best) yokePlan.push({ id: yk.id, crankId: best.id, pinR: best.pinR || 0.3, dir: yk.slide });
  }
  const oscillators = [];
  for (const os of parts) {
    if (!os.def.oscillate || !os.axis) continue;
    let best = null, bestD = 3.8;
    for (const cr of cranks) {
      if (!cr.axis) continue;
      const d = len(sub(os.center, cr.center));
      if (d < bestD) { bestD = d; best = cr; }
    }
    if (best) oscillators.push({ id: os.id, driveId: best.id, amp: 0.5, axis: os.axis });
  }

  // 压簧：跟着相邻的往复件一起压缩/回弹。真弹簧不是摆设——凸轮顶杆抬起 s，
  // 压簧就短 s，抬得越高压得越紧，转过去又把它推回去。只绑定往复类行程，
  // 齿条/丝杠是单向无限走，压簧绑上去会越压越扁，所以不绑。
  const springPlan = [];
  for (const sb of normBricks) {
    const sd = getShape(sb.shapeId);
    if (!sd.deform) continue;
    const sshape = shapeRot(sd, sb.rx || 0, sb.ry || 0, sb.rz || 0);
    const sbnd = shapeBounds(sshape);
    const sc = [sb.x + sbnd.w / 2 + (sb.ox || 0), sb.y + sbnd.h / 2 + (sb.oy || 0), sb.z + sbnd.d / 2 + (sb.oz || 0)];
    const sax = norm(rotVec(AXV[sd.deform], sb.rx || 0, sb.ry || 0, sb.rz || 0));
    const targets = [];
    for (const s of slides) if (s.kind === 'cam' || s.kind === 'pawl') {
      const p = byId.get(s.id);
      if (p) targets.push({ id: s.id, driveId: s.driveId, kind: s.kind, freq: s.freq || 1,
        r: s.r, sign: s.sign, dir: s.dir, center: p.center });
    }
    for (const y of yokePlan) {
      const p = byId.get(y.id);
      if (p) targets.push({ id: y.id, driveId: y.crankId, kind: 'yoke', r: y.pinR, sign: 1, dir: y.dir, center: p.center });
    }
    for (const l of linkages) {
      const p = byId.get(l.pistonId);
      if (p) targets.push({ id: l.pistonId, driveId: l.crankId, kind: 'linkage', r: l.pinR, sign: 1, dir: l.Pp, center: p.center });
    }
    let best = null, bestD = 3.0;
    for (const t of targets) {
      if (Math.abs(dot(t.dir, sax)) < 0.6) continue;   // 压簧轴要顺着行程，不然是别着劲
      const d = len(sub(t.center, sc));
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) {
      // 压簧只能被「压短」，长度按它真正的轴向尺寸算（沿轴的格子数），
      // 不能用 h：弹簧横躺时 h 只是 1 格，沿轴其实有 2 格，否则压缩量会算小
      const axDim = Math.abs(sax[0]) > 0.5 ? sbnd.w : Math.abs(sax[1]) > 0.5 ? sbnd.h : sbnd.d;
      springPlan.push({
        id: sb.id, followId: best.id, driveId: best.driveId, kind: best.kind,
        dir: best.dir, axis: sax, r: best.r, sign: best.sign, freq: best.freq || 1,
        length: axDim, sense: Math.sign(dot(best.dir, sax)) || 1,
      });
    }
  }

  // ---- 6) 传动解读：把每一段传动关系翻译成一句话，运转时念给孩子听 ----
  const notes = [];
  const seenNote = new Set();
  const pushNote = s => { if (!seenNote.has(s)) { seenNote.add(s); notes.push(s); } };
  for (const e of edges) {
    const a = byId.get(e.a), b = byId.get(e.b);
    if (!a || !b) continue;
    if (a.def.worm) {
      const starts = a.starts || 1, tw = b.teeth || 0;
      pushNote(tw ? `蜗杆 ${starts} 头 → 蜗轮 ${tw} 齿：减速 ${(tw / starts).toFixed(1)} 倍，反向自锁`
                  : '蜗杆传动：大减速比，反向自锁');
    } else if (e.flip && a.teeth && b.teeth) {
      const k = e.ratio;
      pushNote(k >= 1 ? `${a.teeth} 齿:${b.teeth} 齿 → 加速 ${k.toFixed(2)} 倍、反向`
                      : `${a.teeth} 齿:${b.teeth} 齿 → 减速 ${(1 / k).toFixed(2)} 倍、反向`);
    }
  }
  if (chains.length && edges.some(e => byId.get(e.a)?.def.chain || byId.get(e.b)?.def.chain)) {
    pushNote('链条传动：两轮转向相同');
  }
  if (chains.some(p => p.def.belt) && edges.some(e => byId.get(e.a)?.def.belt || byId.get(e.b)?.def.belt)) {
    pushNote('皮带传动：两轮同向、允许打滑缓冲');
  }
  for (const sl of slides) {
    if (sl.kind === 'rack') {
      pushNote(`齿轮齿条：轮转一圈，齿条走 ${(Math.PI * 2 * sl.r).toFixed(1)} 格；走到两端挡块就换向`);
    } else if (sl.kind === 'cam') {
      pushNote('凸轮从动件：偏心轮转一圈，顶杆起落一次，压簧把它压回去');
    } else {
      pushNote('丝杠螺母：丝杠转一圈，螺母前进一个螺距，到头由限位开关换向');
    }
  }
  if (edges.some(e => byId.get(e.a)?.def.universal || byId.get(e.b)?.def.universal)) {
    pushNote('万向节：两轴成角也能传扭矩');
  }
  if (edges.some(e => e.oneWay && (byId.get(e.b)?.def.ratchet))) {
    pushNote('棘轮棘爪：只能单向转，倒转会被卡住');
  }
  for (const gv of genevas) {
    pushNote(`${gv.slots} 槽槽轮：拨盘每转一圈步进 ${Math.round(360 / gv.slots)}°，其余时间锁死`);
  }
  if (edges.some(e => byId.get(e.a)?.def.bevel || byId.get(e.b)?.def.bevel)) {
    pushNote('锥齿轮换向：两根轴垂直相交，动力拐 90°');
  }
  if (yokePlan.length) pushNote('苏格兰轭：曲柄销在竖槽里滑，输出严格的正弦往复');
  if (oscillators.length) pushNote('曲柄摇杆：摇杆只左右摆动，不整圈转');
  if (slides.some(s => s.kind === 'pawl')) pushNote('棘爪弹跳：棘轮转过一齿，爪被顶起又被压簧压回');
  if (springPlan.length) pushNote('压簧随动：顶杆抬起就压紧，转过去再把它弹回去');

  return {
    // groupsMap 里每个成员都指向同一个组对象，values() 会重复 → 用 Set 去重
    parts, groups: [...new Set(groupsMap.values())], linkages, genevas, slides, sources,
    yokes: yokePlan, oscillators, springs: springPlan,
    edges,
    hasSource: sources.length > 0,
    notes,
    byId,
  };
}
