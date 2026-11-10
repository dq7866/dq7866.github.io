/* ============================================================
 * mech-models.js — 机械原理馆：机构数据 + 运动学
 *
 * 与玩具工坊的区别：
 *   · 这里每个零件除了图元，还提供一个纯函数 pose(θ)
 *   · pose 返回每个零件相对「θ=0 姿态」的刚体变换：
 *       { r:[x,y,z] }  绕 pivot 的欧拉角
 *       { p:[dx,dy,dz] } 相对 home 的位移
 *     两者可同时给：先绕 pivot 转，再整体平移，正好描述连杆的刚体运动
 *   · 所有图元都按 θ=0 姿态直接写在世界坐标里，缩略图渲染器不用改
 *
 * 38 件清单（分批实现，⭐ = 已上线）
 *   一、连杆家族（批 1，7 件）
 *     ⭐ 曲柄摇杆 / 双曲柄 / 曲柄滑块 / 摆动导杆 / 曲柄摇块 / 平行四连杆 / 牛头刨六杆
 *   二、凸轮与间歇（批 2，7 件）
 *     ⭐ 盘形凸轮尖顶从动件 / 滚子从动件凸轮 / 偏心轮 / 槽轮(日内瓦) /
 *     棘轮棘爪 / 不完全齿轮 / 凸轮分度机构
 *   三、齿轮与轮系（批 3，8 件）
 *     ⭐ 外啮合齿轮对 / 内啮合 / 齿轮齿条 / 蜗轮蜗杆 / 行星齿轮 /
 *     差速器 / 锥齿轮换向 / 谐波减速器
 *   四、传动与调速（批 4，7 件）
 *     ⭐ 皮带传动 / 链传动 / 锥轮无级变速 / 丝杠螺母 / 万向节 /
 *     超越离合器 / 离心调速器
 *   五、夹持与蓄能（批 5，5 件）
 *     ⭐ 杠杆 / 滑轮组 / 剪式升降 / 卷簧蓄能 / 棘轮扳手
 *   六、击发时序（批 6，4 件，抽象结构，不做写实外观）
 *     ⭐ 旋转闭锁 / 击锤与阻铁 / 扳机联动 / 转轮定位
 * ============================================================ */
import { PA } from './kit.js';

const TAU = Math.PI * 2, HF = Math.PI / 2;

/* ---------------- 二维几何 ---------------- */
const V = (x, y) => ({ x, y });
const ang = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);
const dd = r => r * 180 / Math.PI;
const dg = r => `${Math.round(((dd(r) % 360) + 360) % 360)}°`;
const rd = (r, n = 1) => `${dd(r).toFixed(n)}°`;

function wrap(a) {
  let x = a;
  while (x > Math.PI) x -= TAU;
  while (x < -Math.PI) x += TAU;
  return x;
}

/* 两圆交点：以 c1 为圆心 r1，c2 为圆心 r2，sign 选分支 */
function circleHit(c1, r1, c2, r2, sign) {
  const dx = c2.x - c1.x, dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = dx / d, uy = dy / d;
  return V(c1.x + a * ux - sign * h * uy, c1.y + a * uy + sign * h * ux);
}

/* ---------------- 建模小工具 ----------------
 * rig(y0)：把机构平面的 y=0 抬到 y0 高度，机架落在 y=0 的地面上
 */
function rig(y0) {
  const Y = y => y0 + y;
  const R = {
    Y,
    /* 圆杆：a、b 是机构平面内的点 [x,y] */
    rod(a, b, rad, c, z = 0) {
      return { t: 'd', a: [a[0], Y(a[1]), z], b: [b[0], Y(b[1]), z], rad, c, m: .15, ro: .5 };
    },
    /* 销轴：沿 Z 轴 */
    pin(x, y, r = 0.075, h = 0.5, z = 0, c = PA.metal) {
      return { t: 'c', rt: r, h, p: [x, Y(y), z], rot: [HF, 0, 0], c, m: .9, ro: .28 };
    },
    /* 圆盘（曲柄盘 / 轮毂） */
    disc(x, y, r, c, th = 0.16, z = 0) {
      return { t: 'c', rt: r, h: th, p: [x, Y(y), z], rot: [HF, 0, 0], c, m: .2, ro: .55 };
    },
    hub(x, y, r, h, c, z = 0) {
      return { t: 'c', rt: r, h, p: [x, Y(y), z], rot: [HF, 0, 0], c, m: .75, ro: .35 };
    },
    box(x, y, w, h, d, c, z = 0, ro = .6) {
      return { t: 'b', s: [w, h, d], p: [x, Y(y), z], c, ro };
    },
    /* 机架：底板 + 每个固定铰点的后立柱、轴心支臂与轴承环
     * 立柱立在底板后缘（机构平面之后），再用一根沿 Z 的支臂伸到轴心，
     * 支臂穿在轮毂里，保证绕轴整圈转动的零件扫不到任何实体。 */
    /* pivots 可写 x，也可写 { x, z }：z 表示轴承座移出旋转面（如内齿圈从背面支承） */
    base(x0, x1, pivots = [], depth = 0.9) {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      const zB = -0.58;                               // 后立柱所在平面
      const out = [
        { t: 'b', s: [w, 0.24, depth], p: [cx, 0.12, 0], c: PA.wood, ro: .84 },
        { t: 'b', s: [w + 0.2, 0.08, depth + 0.14], p: [cx, 0.035, 0], c: PA.woodD, ro: .86 },
        /* 后缘横梁：给后立柱一个落脚点，不让立柱悬空 */
        { t: 'b', s: [w, 0.24, 0.24], p: [cx, 0.12, zB], c: PA.wood, ro: .84 }
      ];
      pivots.forEach(pv => {
        const x = typeof pv === 'number' ? pv : pv.x;
        const zb = typeof pv === 'number' ? 0 : (pv.z ?? 0);
        const fixed = typeof pv !== 'number' && pv.z !== undefined;
        const front = typeof pv !== 'number' ? (pv.front ?? null) : null;
        const top = Y(0);                             // 轴心高度
        out.push({ t: 'b', s: [0.18, top + 0.16, 0.12], p: [x, (top + 0.16) / 2, zB], c: PA.woodD, ro: .8 });
        /* 轴瓦（外圈）与内轴：先按默认长度生成；等全部零件建好后由 fitPivotSupports()
         * 统一收进「后立柱 → 最近零件背面」这段自由区间，绝不伸进任何零件实体。
         * 指定了 z 的铰点表示轴承座固定在这个深度（如从背面支承内齿圈）；
         * 指定了 front 表示轴承前端不许越过这个 z（如平台会摆下来扫过该轴心）。 */
        out.push({ t: 'c', rt: 0.22, h: 0.36, p: [x, top, zb], rot: [HF, 0, 0], c: PA.woodL, ro: .72, bore: 0.17, _pv: 1, _px: x, _py: top, _zb: zb, _fixed: fixed ? 1 : 0, _front: front });
        out.push({ t: 'c', rt: 0.085, h: 0.28, p: [x, top, zb], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3, _pv: 1, _isAxle: 1, _px: x, _py: top, _zb: zb, _fixed: fixed ? 1 : 0, _front: front });
      });
      return out;
    }
  };
  return R;
}

/* ---------------- 轮廓图元 ----------------
 * 凸轮、齿轮、棘轮、槽轮这类带曲线外形的零件，用「平面点列 + 挤出」描述，
 * 比堆几十个小方块干净，也更容易做得像真零件。
 * 点列一律用机构平面坐标（含 rig 抬高后的 y），所以 p 只留 z。
 */
function prof(pts, d, c, z = 0, o = {}) {
  return { t: 'pf', pts, d, p: [0, 0, z], c, m: o.m ?? .3, ro: o.ro ?? .5 };
}
function radiusRing(cx, cy, rf, n = 240) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, r = rf(a);
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}
/* 环形扇区：槽轮的一瓣、锁止弧都用它 */
function sectorRing(cx, cy, rIn, rOut, a0, a1, n = 18) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    out.push([cx + rOut * Math.cos(a), cy + rOut * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + (a1 - a0) * i / n;
    out.push([cx + rIn * Math.cos(a), cy + rIn * Math.sin(a)]);
  }
  return out;
}
/* 齿形半径函数：cover 为有齿的角范围（从 phase 起），其余落在齿根圆 */
function teethRF(rRoot, rTip, teeth, phase = 0, cover = TAU) {
  const step = TAU / teeth;
  return a => {
    const u = (((a - phase) % TAU) + TAU) % TAU;
    if (u > cover - 1e-9) return rRoot;
    const f = (u % step) / step;
    if (f < .12) return rRoot;
    if (f < .30) return rRoot + (rTip - rRoot) * (f - .12) / .18;
    if (f < .70) return rTip;
    if (f < .88) return rTip - (rTip - rRoot) * (f - .70) / .18;
    return rRoot;
  };
}
/* 棘轮齿形：缓升、陡落，只能单向推动 */
function ratchetRF(rRoot, rTip, teeth, phase = 0) {
  const step = TAU / teeth;
  return a => {
    const u = (((a - phase) % TAU) + TAU) % TAU;
    const f = (u % step) / step;
    if (f < .10 || f > .97) return rRoot;
    return rRoot + (rTip - rRoot) * (f - .10) / .87;
  };
}
/* 从底板顶面立到机构坐标 yTop 处的方柱（world y 计算） */
function pillar(x, yTop, y0, c = PA.woodD, z = -0.42, w = 0.16) {
  const h = Math.max(0.1, y0 + yTop - 0.24);
  return { t: 'b', s: [w, h, w], p: [x, 0.24 + h / 2, z], c, ro: .8 };
}
/* 平滑阶跃 0→1 */
const smooth = u => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };

/* ---------------- 齿轮常用件 ----------------
 * 齿轮一律按「模数 m + 齿数 z」生成齿廓。分度圆半径 r = m·z/2，
 * 齿顶 r + m，齿根 r − 1.25m。点列以自身圆心为原点，再靠 p 摆到世界位置。
 */
function gearPts(z, m, phase = 0, n) {
  const rp = z * m / 2;
  return radiusRing(0, 0, teethRF(rp - 1.25 * m, rp + m, z, phase), n || Math.max(180, Math.round(z * 14)));
}
/* 实心齿轮盘：cy 已是抬升后的世界 y，rot 可选（用于改变轴向） */
function gearAt(z, m, cx, cy, d, c, phase = 0, zz = 0, o = {}) {
  return { t: 'pf', pts: gearPts(z, m, phase), d, p: [cx, cy, zz], c, m: o.m ?? .45, ro: o.ro ?? .42, rot: o.rot };
}
/* 内齿圈：外圆 + 齿廓内孔（rTip 齿尖、rRoot 齿根） */
function ringAt(cx, cy, rOut, rTip, rRoot, z, phase, d, c, zz = 0, o = {}) {
  const rf = teethRF(0, 1, z, phase);
  const hole = radiusRing(0, 0, a => rRoot - (rRoot - rTip) * rf(a), Math.max(200, Math.round(z * 14)));
  return { t: 'pf', pts: radiusRing(0, 0, () => rOut, 140), holes: [hole], d, p: [cx, cy, zz], c, m: o.m ?? .4, ro: o.ro ?? .45, rot: o.rot };
}

/* ---------------- 带传动常用件 ----------------
 * 开口带中心线：两轮外公切线 + 两段包角圆弧（顺时针一圈）
 */
function loopPath(A, B, r1, r2, n = 20) {
  const th = Math.atan2(B.y - A.y, B.x - A.x);
  const d = Math.hypot(B.x - A.x, B.y - A.y);
  const ph = Math.acos(Math.max(-1, Math.min(1, -(r2 - r1) / d)));
  const P = (C, r, a) => [C.x + r * Math.cos(th + a), C.y + r * Math.sin(th + a)];
  const pts = [P(A, r1, ph), P(B, r2, ph)];
  for (let i = 1; i < n; i++) pts.push(P(B, r2, ph - 2 * ph * i / n));
  pts.push(P(B, r2, -ph), P(A, r1, -ph));
  for (let i = 1; i < n; i++) pts.push(P(A, r1, -ph - (TAU - 2 * ph) * i / n));
  return pts;
}
/* 皮带环：中心线两侧各偏 w，成一圈带状闭合轮廓 */
function bandPts(A, B, r1, r2, w, n = 20) {
  const c = loopPath(A, B, r1, r2, n), m = c.length, out = [], inn = [];
  for (let i = 0; i < m; i++) {
    const p = c[i], q = c[(i + 1) % m], o = c[(i - 1 + m) % m];
    const tx = q[0] - o[0], ty = q[1] - o[1], L = Math.hypot(tx, ty) || 1;
    const nx = -ty / L, ny = tx / L;
    out.push([p[0] + nx * w, p[1] + ny * w]);
    inn.push([p[0] - nx * w, p[1] - ny * w]);
  }
  return out.concat(inn.reverse());
}
/* 链条：沿中心线等弧长摆一串链节 */
function chainB(A, B, r1, r2, count, sx, sy, c) {
  const c0 = loopPath(A, B, r1, r2, 24), m = c0.length;
  const seg = [], len = [];
  let tot = 0;
  for (let i = 0; i < m; i++) {
    const p = c0[i], q = c0[(i + 1) % m], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    seg.push([p, q, d]); len.push(tot); tot += d;
  }
  const out = [];
  for (let k = 0; k < count; k++) {
    const s = k / count * tot;
    let i = 0;
    while (i < m - 1 && len[i + 1] <= s) i++;
    const [p, q, d] = seg[i], u = Math.min(1, Math.max(0, (s - len[i]) / (d || 1)));
    const x = p[0] + (q[0] - p[0]) * u, y = p[1] + (q[1] - p[1]) * u;
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    out.push({ t: 'b', s: [sx, sy, .11], p: [x, y, -.14], rot: [0, 0, a], c, m: .5, ro: .45 });
  }
  return out;
}

/* ============================================================
 * 1. 曲柄摇杆机构
 *    机架 d=4.0、曲柄 r=1.0、连杆 l=3.2、摇杆 k=2.0
 * ============================================================ */
const cr1 = (() => {
  const R = rig(1.42);
  const d = 4, r = 1, l = 3.2, k = 2;
  const A = V(0, 0), D = V(d, 0), B0 = V(r, 0);
  const C0 = circleHit(B0, l, D, k, 1);
  const rodC = [C0.x, C0.y];

  return {
    id: 'crankRocker', name: '曲柄摇杆机构', group: 'linkage', tag: '四连杆',
    summary: '整圈转动 → 来回摆动',
    input: { label: '曲柄转角', speed: 52 },
    lesson: {
      what: '曲柄整圈转，摇杆只在某个角度范围内来回摆。汽车雨刷、缝纫机踏板都是它。',
      key: '四杆满足「最短杆 + 最长杆 ≤ 另两杆之和」，且最短杆与机架相邻，曲柄才能转满一圈。这里 1+4 < 3.2+2。',
      where: '雨刷器、缝纫机踏板机构、搅拌机、蒸汽机配汽阀。'
    },
    base: R.base(-1.3, 5.5, [0, 4]),
    parts: [
      {
        id: 'crank', n: '曲柄', seq: 1, pivot: [0, R.Y(0), -0.3], out: [0, 0, 2.0],
        hint: '曲柄盘在里侧，最后取下摇把和曲柄盘',
        b: [
          R.disc(0, 0, 0.38, PA.red, 0.16, -0.3),
          R.rod([0, 0], [r, 0], 0.11, PA.red, -0.3),
          R.hub(0, 0, 0.14, 0.24, PA.metalD, -0.3),
          R.pin(r, 0, 0.095, 0.375, -0.2725),
          { t: 'c', rt: 0.075, h: 0.16, p: [r, R.Y(0), -0.42], rot: [HF, 0, 0], c: PA.dark, m: .8, ro: .4 }
        ]
      },
      {
        id: 'coupler', n: '连杆', seq: 2, pivot: [B0.x, R.Y(B0.y), 0], out: [0, 0, 2.2],
        hint: '连杆两端都是铰接，拔出曲柄销后整根取下',
        b: [
          R.rod([B0.x, B0.y], rodC, 0.085, PA.blue, 0),
          R.pin(B0.x, B0.y, 0.085, 0.415, 0.1225),
          R.pin(rodC[0], rodC[1], 0.085, 0.36, 0.01)
        ]
      },
      {
        id: 'rocker', n: '摇杆', seq: 3, pivot: [d, R.Y(0), 0.3], out: [0, 0, 2.0],
        hint: '摇杆在最外侧，铰在右侧机架上，先把它从轴承里抽出',
        b: [
          R.rod([d, 0], rodC, 0.1, PA.green, 0.3),
          R.pin(rodC[0], rodC[1], 0.09, 0.37, 0.375),
          R.disc(d, 0, 0.3, PA.greenD, 0.14, 0.3),
          R.hub(d, 0, 0.12, 0.22, PA.metalD, 0.3),
          { t: 'b', s: [0.3, 0.16, 0.12], p: [rodC[0], R.Y(rodC[1]) + 0.2, 0.3], rot: [0, 0, ang(B0, C0)], c: PA.org, ro: .55 }
        ]
      }
    ],
    measure: [{ key: 'swing', label: '摇杆摆幅', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const B = V(r * Math.cos(th), r * Math.sin(th));
      const C = circleHit(B, l, D, k, 1);
      const dq = wrap(ang(B, C) - ang(B0, C0));
      const da = wrap(ang(D, C) - ang(D, C0));
      return {
        crank: { r: [0, 0, th] },
        coupler: { r: [0, 0, dq], p: [B.x - B0.x, B.y - B0.y, 0] },
        rocker: { r: [0, 0, da] },
        n: { swing: dd(da) },
        readout: [
          { k: '曲柄转角', v: dg(th) },
          { k: '连杆摆角', v: rd(dq) },
          { k: '摇杆方位', v: dg(ang(D, C)) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 2. 双曲柄机构（牵引杆式）
 *    机架 d=0.9、两曲柄 1.35 / 1.45、连杆 1.65，两根曲柄都能转满一圈
 * ============================================================ */
const cr2 = (() => {
  const R = rig(1.85);
  const d = 0.9, a = 1.35, b = 1.65, c = 1.45;
  const A = V(0, 0), D = V(d, 0), B0 = V(a, 0);
  const C0 = circleHit(B0, b, D, c, -1);
  const psi0 = ang(D, C0), phi0 = ang(B0, C0);

  return {
    id: 'doubleCrank', name: '双曲柄机构', group: 'linkage', tag: '四连杆',
    summary: '两根曲柄同向转，转速却不同',
    input: { label: '主动曲柄转角', speed: 48 },
    lesson: {
      what: '主动曲柄转一圈，从动曲柄也转一圈，但两者转角不同步，中途会快会慢。',
      key: '机架是最短杆（d=0.9），两个连架杆都能整圈转，这种四杆叫「牵引杆机构」。两曲柄错开在不同平面，避免相撞。',
      where: '机车联动轮、双曲柄搅拌器、某些印刷机送纸机构。'
    },
    base: R.base(-1.2, 2.5, [0, d]),
    parts: [
      {
        id: 'crankA', n: '主动曲柄', seq: 1, pivot: [0, R.Y(0), -0.3], out: [0, 0, 2.0],
        hint: '主动曲柄在里侧，最后拆',
        b: [
          R.disc(0, 0, 0.44, PA.red, 0.16, -0.3),
          R.rod([0, 0], [a, 0], 0.1, PA.red, -0.3),
          R.hub(0, 0, 0.15, 0.24, PA.metalD, -0.3),
          R.pin(a, 0, 0.09, 0.435, -0.3025),
          { t: 'c', rt: 0.07, h: 0.16, p: [a, R.Y(0), -0.42], rot: [HF, 0, 0], c: PA.dark, m: .8, ro: .4 }
        ]
      },
      {
        id: 'coupler', n: '连杆', seq: 2, pivot: [B0.x, R.Y(B0.y), 0], out: [0, 0, 2.2],
        hint: '连杆斜跨两根曲柄，拔出两端销轴后取下',
        b: [
          R.rod([B0.x, B0.y], [C0.x, C0.y], 0.085, PA.blue, 0),
          R.pin(B0.x, B0.y, 0.085, 0.305, 0.0675),
          R.pin(C0.x, C0.y, 0.085, 0.53, -0.075)
        ]
      },
      {
        id: 'crankB', n: '从动曲柄', seq: 3, pivot: [d, R.Y(0), 0.3], out: [0, 0, 2.0],
        hint: '从动曲柄在最外侧，先拆',
        b: [
          R.disc(d, 0, 0.44, PA.green, 0.16, 0.3),
          R.rod([d, 0], [C0.x, C0.y], 0.1, PA.green, 0.3),
          R.hub(d, 0, 0.15, 0.24, PA.metalD, 0.3),
          R.pin(C0.x, C0.y, 0.09, 0.37, 0.375)
        ]
      }
    ],
    measure: [{ key: 'ratio', label: '瞬时传动比', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const B = V(a * Math.cos(th), a * Math.sin(th));
      const C = circleHit(B, b, D, c, -1);
      const psi = ang(D, C);
      const dq = wrap(ang(B, C) - phi0);
      const dp = wrap(psi - psi0);
      const C2 = circleHit(V(a * Math.cos(th + 0.002), a * Math.sin(th + 0.002)), b, D, c, -1);
      const ratio = wrap(ang(D, C2) - psi) / 0.002;
      return {
        crankA: { r: [0, 0, th] },
        crankB: { r: [0, 0, dp] },
        coupler: { r: [0, 0, dq], p: [B.x - B0.x, B.y - B0.y, 0] },
        n: { ratio },
        readout: [
          { k: '主动曲柄', v: dg(th) },
          { k: '从动曲柄', v: dg(psi) },
          { k: '瞬时传动比', v: ratio.toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 3. 曲柄滑块机构
 *    曲柄 r=1.2、连杆 l=3.5，滑块沿水平导轨往复
 * ============================================================ */
const cr3 = (() => {
  const R = rig(1.55);
  const r = 1.2, l = 3.5;
  const B0 = V(r, 0), C0 = V(r + l, 0);

  return {
    id: 'sliderCrank', name: '曲柄滑块机构', group: 'linkage', tag: '四连杆',
    summary: '转动 → 直线往复',
    input: { label: '曲柄转角', speed: 60 },
    lesson: {
      what: '曲柄转动，通过连杆推着滑块沿导轨来回直线运动。发动机活塞、冲床都靠它。',
      key: '滑块行程正好是曲柄半径的两倍（2r=2.4）；连杆越长，运动越接近简谐，侧向力越小。',
      where: '内燃机活塞、空气压缩机、冲床、往复泵。'
    },
    base: [
      ...R.base(-1.5, 6.7, [0]),
      /* 导轨：上下各两条窄导轨条（前后分列）+ 两端夹板；
         中间留出连杆运动平面（z=0），连杆在 θ≈±105° 时从两条导轨条之间穿过 */
      R.box(3.5, 0.5, 4.0, 0.16, 0.28, PA.woodD, 0.29),
      R.box(3.5, -0.5, 4.0, 0.16, 0.28, PA.woodD, 0.29),
      R.box(3.5, 0.5, 4.0, 0.16, 0.28, PA.woodD, -0.29),
      R.box(3.5, -0.5, 4.0, 0.16, 0.28, PA.woodD, -0.29),
      R.box(1.65, 0, 0.22, 1.02, 0.08, PA.woodL, 0.44),
      R.box(1.65, 0, 0.22, 1.02, 0.08, PA.woodL, -0.44),
      R.box(5.35, 0, 0.22, 1.02, 0.08, PA.woodL, 0.44),
      R.box(5.35, 0, 0.22, 1.02, 0.08, PA.woodL, -0.44)
    ],
    parts: [
      {
        id: 'crank', n: '曲柄', seq: 1, pivot: [0, R.Y(0), -0.28], out: [0, 0, 2.0],
        hint: '曲柄盘在里侧，最后拔下摇把和曲柄盘',
        b: [
          R.disc(0, 0, 0.42, PA.red, 0.16, -0.28),
          R.rod([0, 0], [r, 0], 0.11, PA.red, -0.28),
          R.hub(0, 0, 0.14, 0.24, PA.metalD, -0.28),
          R.pin(r, 0, 0.095, 0.56, -0.16),
          { t: 'c', rt: 0.075, h: 0.16, p: [r, R.Y(0), -0.4], rot: [HF, 0, 0], c: PA.dark, m: .8, ro: .4 }
        ]
      },
      {
        id: 'coupler', n: '连杆', seq: 2, pivot: [B0.x, R.Y(0), 0], out: [0, 0, 2.2],
        hint: '连杆两端各一个铰点，拔出销轴后水平抽出',
        b: [
          R.rod([B0.x, 0], [C0.x, 0], 0.085, PA.blue, 0),
          R.pin(B0.x, 0, 0.085, 0.66, 0),
          R.pin(C0.x, 0, 0.085, 0.62, 0)
        ]
      },
      {
        id: 'slider', n: '滑块', seq: 3, pivot: [0, 0, 0], out: [0, 0, 1.9],
        hint: '滑块卡在两条导轨之间，先顺着导轨方向平着抽出来',
        b: [
          R.box(C0.x, 0, 0.9, 0.6, 0.34, PA.yellow, -0.52),
          R.box(C0.x, 0, 0.5, 0.72, 0.30, PA.org, -0.52),
          R.box(C0.x + 0.34, 0, 0.06, 0.7, 0.38, PA.metal, -0.52, .35),
          R.box(C0.x - 0.34, 0, 0.06, 0.7, 0.38, PA.metal, -0.52, .35),
          R.pin(C0.x, 0, 0.09, 0.34, -0.20)
        ]
      }
    ],
    measure: [{ key: 'stroke', label: '滑块行程', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const B = V(r * Math.cos(th), r * Math.sin(th));
      const x = r * Math.cos(th) + Math.sqrt(l * l - r * r * Math.sin(th) * Math.sin(th));
      const C = V(x, 0);
      const dq = wrap(ang(B, C) - ang(B0, C0));
      return {
        crank: { r: [0, 0, th] },
        coupler: { r: [0, 0, dq], p: [B.x - B0.x, B.y - B0.y, 0] },
        slider: { p: [x - C0.x, 0, 0] },
        n: { stroke: x },
        readout: [
          { k: '曲柄转角', v: dg(th) },
          { k: '滑块位置', v: x.toFixed(2) },
          { k: '连杆摆角', v: rd(dq) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 4. 摆动导杆机构
 *    曲柄 r=1.25 绕 A 转，导杆绕 D=(3.2,0) 摆，滑块在导杆槽里滑
 * ============================================================ */
const cr4 = (() => {
  const R = rig(2.62);
  const r = 1.25, dx = 3.2;
  const D = V(dx, 0), B0 = V(r, 0);
  const tipX = -1.8;

  return {
    id: 'oscillatingGuide', name: '摆动导杆机构', group: 'linkage', tag: '导杆',
    summary: '曲柄销在槽里滑，推动导杆摆动',
    input: { label: '曲柄转角', speed: 46 },
    lesson: {
      what: '曲柄销在导杆的长槽里滑动，同时顶着导杆绕固定铰点来回摆。',
      key: '摆角由「曲柄半径 / 机架距离」决定，sin(半摆角)=r/d。这里 r=1.25、d=3.2，半摆角约 23°。',
      where: '牛头刨床的急回机构、插床、摆动送料机构。'
    },
    base: R.base(-2.5, 4.4, [0, dx]),
    parts: [
      {
        id: 'crank', n: '曲柄', seq: 1, pivot: [0, R.Y(0), -0.32], out: [0, 0, 2.0],
        hint: '曲柄在导杆后面，最后取摇把和曲柄盘',
        b: [
          R.disc(0, 0, 0.4, PA.red, 0.16, -0.32),
          R.rod([0, 0], [r, 0], 0.11, PA.red, -0.32),
          R.hub(0, 0, 0.14, 0.24, PA.metalD, -0.32),
          R.pin(r, 0, 0.1, 0.78, -0.14),
          { t: 'c', rt: 0.075, h: 0.16, p: [r, R.Y(0), -0.42], rot: [HF, 0, 0], c: PA.dark, m: .8, ro: .4 }
        ]
      },
      {
        id: 'slider', n: '滑块', seq: 2, pivot: [r, R.Y(0), 0.3], out: [0, 0, 2.0],
        hint: '滑块装在曲柄销上、又卡在导杆槽里，先把它从槽里提出来',
        b: [
          R.box(r, 0, 0.52, 0.36, 0.56, PA.yellow, 0.3),
          R.box(r, 0, 0.3, 0.46, 0.4, PA.org, 0.3),
          R.pin(r, 0, 0.085, 0.9, 0.3)
        ]
      },
      {
        id: 'lever', n: '导杆', seq: 3, pivot: [dx, R.Y(0), 0.3], out: [0, 0, 2.0],
        hint: '导杆在最外侧，铰在右侧机架，先整根抽出',
        b: [
          R.box((dx + tipX) / 2, 0.34, dx - tipX, 0.16, 0.26, PA.blue, 0.3),
          R.box((dx + tipX) / 2, -0.34, dx - tipX, 0.16, 0.26, PA.blue, 0.3),
          R.box(tipX, 0, 0.24, 0.76, 0.26, PA.blueD, 0.3),
          R.disc(dx, 0, 0.42, PA.blueD, 0.14, 0.3),
          R.hub(dx, 0, 0.13, 0.22, PA.metalD, 0.3),
          R.pin(dx, 0, 0.09, 0.8, 0.3)
        ]
      }
    ],
    measure: [{ key: 'swing', label: '导杆摆幅', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const B = V(r * Math.cos(th), r * Math.sin(th));
      const phi = ang(D, B);
      const dp = wrap(phi - Math.PI);
      return {
        crank: { r: [0, 0, th] },
        slider: { r: [0, 0, dp], p: [B.x - B0.x, B.y - B0.y, 0] },
        lever: { r: [0, 0, dp] },
        n: { swing: dd(dp) },
        readout: [
          { k: '曲柄转角', v: dg(th) },
          { k: '导杆摆角', v: rd(dp) },
          { k: '滑块位置', v: Math.hypot(B.x - dx, B.y).toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 5. 曲柄摇块机构
 *    曲柄 r=0.9 绕 A 转，导杆穿过绕 D=(2.6,0) 摆动的摇块
 * ============================================================ */
const cr5 = (() => {
  const R = rig(1.3);
  const r = 0.9, dx = 2.6, rodLen = 4.3;
  const D = V(dx, 0), B0 = V(r, 0);
  const tip = V(r + rodLen, 0);

  return {
    id: 'oscillatingBlock', name: '曲柄摇块机构', group: 'linkage', tag: '导杆',
    summary: '导杆在摇块里滑动，摇块只摆不转',
    input: { label: '曲柄转角', speed: 50 },
    lesson: {
      what: '曲柄带着一根长导杆，导杆又穿过一个只能摆动的方套（摇块）。导杆一边转、一边在套里抽送。',
      key: '摇块摆角由曲柄半径与机架距离决定，半摆角约 arcsin(r/d)。导杆长度要盖住曲柄全周的最大伸出量。',
      where: '摆动油缸、翻斗车举升、牛头刨的另一种演化。'
    },
    base: [
      ...R.base(-1.3, 5.6, [0], 1.2),
      /* 摇块改用两侧耳轴座：夹板 + 轴承座，中间空出导杆的通道
       * 夹板从底板顶面(0.24)立到轴心高度(1.3)：y 用机构坐标写，需减掉 Y0 */
      R.box(dx, (1.3 + 0.24) / 2 - R.Y(0), 0.24, 1.3 - 0.24, 0.12, PA.woodD, 0.52),
      R.box(dx, (1.3 + 0.24) / 2 - R.Y(0), 0.24, 1.3 - 0.24, 0.12, PA.woodD, -0.52),
      { t: 'c', rt: 0.17, h: 0.14, p: [dx, R.Y(0), 0.45], rot: [HF, 0, 0], c: PA.woodL, ro: .72 },
      { t: 'c', rt: 0.17, h: 0.14, p: [dx, R.Y(0), -0.45], rot: [HF, 0, 0], c: PA.woodL, ro: .72 }
    ],
    parts: [
      {
        id: 'crank', n: '曲柄', seq: 1, pivot: [0, R.Y(0), -0.28], out: [0, 0, 2.0],
        hint: '曲柄盘最小，最后拔摇把取盘',
        b: [
          R.disc(0, 0, 0.32, PA.red, 0.16, -0.28),
          R.rod([0, 0], [r, 0], 0.1, PA.red, -0.28),
          R.hub(0, 0, 0.13, 0.24, PA.metalD, -0.28),
          R.pin(r, 0, 0.09, 0.7, -0.14),
          { t: 'c', rt: 0.07, h: 0.16, p: [r, R.Y(0), -0.4], rot: [HF, 0, 0], c: PA.dark, m: .8, ro: .4 }
        ]
      },
      {
        id: 'rod', n: '导杆', seq: 2, pivot: [r, R.Y(0), 0], out: [0, 0, 2.2],
        hint: '摇块松开后，把导杆从套里抽出来',
        b: [
          R.rod([r, 0], [tip.x, tip.y], 0.1, PA.blue, 0),
          R.pin(r, 0, 0.095, 0.62, 0),
          R.hub(tip.x - 0.18, 0, 0.13, 0.24, PA.blueD, 0),
          { t: 'b', s: [0.5, 0.26, 0.12], p: [(r + tip.x) / 2, R.Y(0) + 0.18, 0], c: PA.sky, ro: .5 }
        ]
      },
      {
        id: 'block', n: '摇块', seq: 3, pivot: [dx, R.Y(0), 0], out: [0, 0, 2.0],
        hint: '摇块在最外侧，两块侧板夹住导杆，先松开它',
        b: [
          R.box(dx, 0, 0.78, 0.9, 0.1, PA.yellow, 0.32),
          R.box(dx, 0, 0.78, 0.9, 0.1, PA.yellow, -0.32),
          R.box(dx, 0.42, 0.62, 0.14, 0.74, PA.org, 0),
          R.box(dx, -0.42, 0.62, 0.14, 0.74, PA.org, 0),
          R.pin(dx, 0, 0.09, 1.06, 0)
        ]
      }
    ],
    measure: [
      { key: 'swing', label: '摇块摆幅', unit: '°', k: 180 / Math.PI, dec: 0 },
      { key: 'span', label: '导杆抽送量', unit: '', k: 1, dec: 2 }
    ],
    pose(th) {
      const B = V(r * Math.cos(th), r * Math.sin(th));
      const phi = ang(D, B);
      const dp = wrap(phi - Math.PI);
      const span = Math.hypot(D.x - B.x, D.y - B.y);
      return {
        crank: { r: [0, 0, th] },
        rod: { r: [0, 0, dp], p: [B.x - B0.x, B.y - B0.y, 0] },
        block: { r: [0, 0, dp] },
        n: { swing: dd(dp), span },
        readout: [
          { k: '曲柄转角', v: dg(th) },
          { k: '摇块摆角', v: rd(dp) },
          { k: '导杆伸出', v: span.toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 6. 平行四连杆机构
 *    两摆杆等长 1.4，机架 2.2，平台整体平动不翻转
 * ============================================================ */
const cr6 = (() => {
  const R = rig(2.0);
  const L = 1.4, dx = 2.2;
  const B0 = V(0, L), C0 = V(dx, L);

  return {
    id: 'parallelogram', name: '平行四连杆机构', group: 'linkage', tag: '四连杆',
    summary: '平台平移，始终不翻转',
    input: { label: '摆杆转角', speed: 40 },
    lesson: {
      what: '两根等长摆杆 + 一块等长平台，组成平行四边形。摆杆怎么摆，平台都保持水平。',
      key: '对边等长且平行，平台只做平移（不转动）。摆杆长 1.4，平台就绕机架中点画半径 1.4 的圆。',
      where: '天平托盘、电梯平层、摄影机稳定架、机车联动杆。'
    },
    base: R.base(-1.2, 3.4, [0, { x: dx, front: -0.17 }]),
    parts: [
      {
        id: 'rockerA', n: '主动摆杆', seq: 1, pivot: [0, R.Y(0), -0.28], out: [0, 0, 2.0],
        hint: '主动摆杆在里侧，最后取摇把再整根拔出',
        b: [
          R.rod([0, 0], [B0.x, B0.y], 0.1, PA.red, -0.28),
          R.disc(0, 0, 0.36, PA.red, 0.16, -0.28),
          R.hub(0, 0, 0.14, 0.24, PA.metalD, -0.28),
          R.pin(B0.x, B0.y, 0.095, 0.44, -0.28),
          { t: 'c', rt: 0.075, h: 0.16, p: [0, R.Y(0), -0.42], rot: [HF, 0, 0], c: PA.dark, m: .8, ro: .4 }
        ]
      },
      {
        id: 'platform', n: '平台', seq: 2, pivot: [0, 0, 0], out: [0, 0, 2.2],
        hint: '平台两端各一个铰点，拔出两端销轴后整体取下',
        b: [
          R.box(dx / 2, L, dx + 0.1, 0.16, 0.32, PA.blue, 0),
          R.box(dx / 2, L + 0.24, dx - 0.4, 0.34, 0.32, PA.blueD, 0),
          R.pin(0, L, 0.09, 0.9, 0.05),
          R.pin(dx, L, 0.09, 0.9, 0.05),
          /* 水平仪：平台不转时气泡永远在中间 */
          { t: 'c', rt: 0.2, h: 0.1, p: [dx / 2, R.Y(L + 0.55), 0], rot: [HF, 0, 0], c: PA.glass, op: 0.55, ro: .2 },
          { t: 's', rad: 0.09, p: [dx / 2, R.Y(L + 0.58), 0], c: PA.green, em: .3, ro: .3 }
        ]
      },
      {
        id: 'rockerB', n: '从动摆杆', seq: 3, pivot: [dx, R.Y(0), 0.28], out: [0, 0, 2.0],
        hint: '从动摆杆在最外侧，先拆',
        b: [
          R.rod([dx, 0], [C0.x, C0.y], 0.1, PA.green, 0.28),
          R.disc(dx, 0, 0.36, PA.green, 0.14, 0.28),
          R.hub(dx, 0, 0.14, 0.22, PA.metalD, 0.28),
          R.pin(C0.x, C0.y, 0.095, 0.56, 0.28)
        ]
      }
    ],
    measure: [{ key: 'tilt', label: '平台倾角', unit: '°', k: 180 / Math.PI, dec: 1 }],
    pose(th) {
      const s = Math.sin(th), c = Math.cos(th);
      return {
        rockerA: { r: [0, 0, th] },
        rockerB: { r: [0, 0, th] },
        platform: { p: [L * c - 0, L * s - L, 0] },
        n: { tilt: 0 },
        readout: [
          { k: '摆杆转角', v: dg(th) },
          { k: '平台倾角', v: '0.0°' },
          { k: '平台高度', v: (L + L * s).toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 7. 牛头刨六杆机构
 *    曲柄 → 连杆 → 摇杆 → 摆杆连杆 → 滑枕（水平导轨）
 * ============================================================ */
const cr7 = (() => {
  const R = rig(1.3);
  const r = 0.9, d = 2.8, l = 2.4, k = 2.1, ext = 1.2, cLink = 1.8, yRam = 3.14;
  const D = V(d, 0), B0 = V(r, 0);
  const C0 = circleHit(B0, l, D, k, 1);
  const P0 = V(D.x + (C0.x - D.x) * ext, (C0.y) * ext);
  const dx0 = Math.sqrt(Math.max(0, cLink * cLink - Math.pow(yRam - P0.y, 2)));
  const xr0 = P0.x + dx0;
  const Q0 = V(xr0, yRam);
  const psi0 = ang(B0, C0), rk0 = ang(D, C0), lk0 = ang(P0, Q0);

  return {
    id: 'shaper', name: '牛头刨六杆机构', group: 'linkage', tag: '六杆',
    summary: '摆动变直线，回程比工作行程快',
    input: { label: '曲柄转角', speed: 55 },
    lesson: {
      what: '曲柄转一圈，经过四连杆放大摆动，再用一根摆杆连杆把摇杆的摆动变成滑枕的直线往复。',
      key: '滑枕位置由 x = Px + √(c²−(y−Py)²) 解出；摇杆摆动一次，滑枕走一个行程，回程被压缩得更快。',
      where: '牛头刨床、插床、拉床等需要「慢进快回」的机床。'
    },
    base: [
      ...R.base(-1.4, 5.8, [0, d]),
      /* 滑枕导轨：上下两条 + 右侧立柱（导轨向左延伸到滑枕最小行程之外） */
      R.box(3.05, yRam + 0.32, 5.7, 0.14, 0.9, PA.woodD),
      R.box(3.05, yRam - 0.32, 5.7, 0.14, 0.9, PA.woodD),
      R.box(5.6, 0.24 + (yRam + 0.4) / 2, 0.3, yRam + 0.4, 0.9, PA.wood),
      R.box(5.6, yRam / 2, 0.22, yRam, 0.24, PA.woodD),
      /* 左端支座做成后置抱箍：让开滑枕整段行程，板面贴在导轨后端 */
      R.box(0.3, yRam, 0.24, 1.2, 0.14, PA.woodL, -0.52)
    ],
    parts: [
      {
        id: 'crank', n: '曲柄', seq: 1, pivot: [0, R.Y(0), -0.28], out: [0, 0, 2.0],
        hint: '曲柄在整条链的输入端，最后取摇把并拔出曲柄盘',
        b: [
          R.disc(0, 0, 0.34, PA.red, 0.16, -0.28),
          R.rod([0, 0], [r, 0], 0.1, PA.red, -0.28),
          R.hub(0, 0, 0.13, 0.24, PA.metalD, -0.28),
          R.pin(r, 0, 0.09, 0.6, -0.16),
          { t: 'c', rt: 0.075, h: 0.16, p: [r, R.Y(0), -0.42], rot: [HF, 0, 0], c: PA.dark, m: .8, ro: .4 }
        ]
      },
      {
        id: 'coupler', n: '连杆', seq: 2, pivot: [B0.x, R.Y(0), 0], out: [0, 0, 2.2],
        hint: '连杆把曲柄和摇杆连起来，先拔两端销轴',
        b: [
          R.rod([B0.x, 0], [C0.x, C0.y], 0.08, PA.blue, 0),
          R.pin(B0.x, 0, 0.08, 0.68, 0),
          R.pin(C0.x, C0.y, 0.08, 0.5, 0.08)
        ]
      },
      {
        id: 'rocker', n: '摇杆', seq: 3, pivot: [d, R.Y(0), 0.28], out: [0, 0, 2.0],
        hint: '摇杆是四连杆的输出杆，还伸出一段带着摆杆连杆',
        b: [
          R.rod([d, 0], [P0.x, P0.y], 0.09, PA.green, 0.28),
          R.disc(d, 0, 0.3, PA.greenD, 0.14, 0.28),
          R.hub(d, 0, 0.12, 0.22, PA.metalD, 0.28),
          R.pin(C0.x, C0.y, 0.085, 0.52, 0.28),
          R.pin(P0.x, P0.y, 0.085, 0.52, 0.28)
        ]
      },
      {
        id: 'ramLink', n: '摆杆连杆', seq: 4, pivot: [P0.x, R.Y(P0.y), 0.56], out: [0, 0, 2.2],
        hint: '这根短连杆把摇杆的摆动传给滑枕，两端都是铰接',
        b: [
          R.rod([P0.x, P0.y], [Q0.x, Q0.y], 0.075, PA.purple, 0.56),
          R.pin(P0.x, P0.y, 0.08, 0.62, 0.56),
          R.pin(Q0.x, Q0.y, 0.08, 0.55, 0.6)
        ]
      },
      {
        id: 'ram', n: '滑枕', seq: 5, pivot: [0, 0, 0], out: [0, 0, 1.9],
        hint: '滑枕在最外侧，先顺着导轨方向平着抽出',
        b: [
          R.box(xr0, yRam, 1.0, 0.46, 0.64, PA.yellow),
          /* 顶部滑板压在导轨内面上，不再插进上导轨 */
          R.box(xr0, yRam + 0.21, 0.8, 0.08, 0.5, PA.org),
          /* 刀架装在滑枕前立面，刀刃由前侧伸出（都在导轨内腔高度带内） */
          R.box(xr0 - 0.56, yRam + 0.02, 0.26, 0.3, 0.5, PA.metalD, 0, .35),
          { t: 'b', s: [0.22, 0.18, 0.22], p: [xr0 - 0.74, R.Y(yRam - 0.04), 0], c: PA.dark, ro: .5 },
          R.pin(xr0, yRam, 0.09, 0.78, 0)
        ]
      }
    ],
    measure: [
      { key: 'stroke', label: '滑枕行程', unit: '', k: 1, dec: 2 },
      { key: 'swing', label: '摇杆摆幅', unit: '°', k: 180 / Math.PI, dec: 0 }
    ],
    pose(th) {
      const B = V(r * Math.cos(th), r * Math.sin(th));
      const C = circleHit(B, l, D, k, 1);
      const P = V(D.x + (C.x - D.x) * ext, C.y * ext);
      const dy = yRam - P.y;
      const dx2 = Math.sqrt(Math.max(0, cLink * cLink - dy * dy));
      const xr = P.x + dx2;
      const Q = V(xr, yRam);
      const dq = wrap(ang(B, C) - psi0);
      const dr = wrap(ang(D, C) - rk0);
      const dl = wrap(ang(P, Q) - lk0);
      return {
        crank: { r: [0, 0, th] },
        coupler: { r: [0, 0, dq], p: [B.x - B0.x, B.y - B0.y, 0] },
        rocker: { r: [0, 0, dr] },
        ramLink: { r: [0, 0, dl], p: [P.x - P0.x, P.y - P0.y, 0] },
        ram: { p: [xr - xr0, 0, 0] },
        n: { stroke: xr, swing: dd(dr) },
        readout: [
          { k: '曲柄转角', v: dg(th) },
          { k: '摇杆摆角', v: rd(dr) },
          { k: '滑枕位置', v: xr.toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 8. 盘形凸轮（尖顶从动件）
 *    基圆 0.82、升程 0.62，升 150° / 远休 30° / 回 140° / 近休 40°
 * ============================================================ */
const cm1 = (() => {
  const R = rig(2.15), Y0 = R.Y(0);
  const r0 = 0.82, h = 0.62;
  const law = a => {
    const deg = (((a % TAU) + TAU) % TAU) * 180 / Math.PI;
    if (deg < 150) { const u = deg / 150; return u * u * (3 - 2 * u); }
    if (deg < 180) return 1;
    if (deg < 320) { const u = (deg - 180) / 140; return 1 - u * u * (3 - 2 * u); }
    return 0;
  };
  const rAt = a => r0 + h * law(a);
  const L0 = rAt(HF);                       // θ=0 时的接触半径
  const at = th => rAt(HF - th);            // 从动件底面到凸轮中心的距离
  const camPts = radiusRing(0, Y0, rAt, 288);
  const YT = L0 + 0.80;                     // 导向座高度（顶板压在从动杆最低位置之下）

  return {
    id: 'camKnife', name: '盘形凸轮（尖顶从动件）', group: 'cam', tag: '凸轮',
    summary: '匀速转动 → 停停走走的往复',
    input: { label: '凸轮转角', speed: 52 },
    lesson: {
      what: '凸轮匀速转,从动件却按轮廓规定的节奏升起、停住、再落下。',
      key: '轮廓半径 r(φ) 就是升程曲线：这里基圆 0.82、升程 0.62，转过 150° 走完全程，远休止 30°，再用 140° 回程。尖顶从动件响应最灵，但尖角磨损也最快。',
      where: '内燃机配气凸轮、缝纫机送布凸轮、自动机床的上料凸轮。'
    },
    base: R.base(-1.7, 1.7, [0]),
    parts: [
      {
        id: 'cam', n: '盘形凸轮', seq: 1, pivot: [0, Y0, 0], out: [0, 0, 2.0],
        hint: '凸轮用键固定在轴上，退出键后整盘取下',
        b: [
          prof(camPts, 0.36, PA.purple, 0),
          R.hub(0, 0, 0.26, 0.54, PA.purpleD, 0),
          R.disc(0, 0, 0.5, PA.purpleD, 0.08, 0.24),
          R.pin(0, 0, 0.1, 1.0, 0, PA.metalD),
          { t: 'b', s: [0.16, 0.18, 0.1], p: [0.26, Y0 + 0.18, 0.24], c: PA.metal, m: .8, ro: .3 }
        ]
      },
      {
        id: 'follower', n: '从动杆', seq: 2, pivot: [0, R.Y(L0), 0], out: [0, 0, 2.1],
        hint: '从动杆插在导向座里，抽出来就能看到尖顶',
        b: [
          R.rod([0, L0], [0, L0 + 1.52], 0.075, PA.gold, 0),
          { t: 'k', rad: 0.1, h: 0.17, p: [0, R.Y(L0 + 0.085), 0], rot: [Math.PI, 0, 0], c: PA.metalD, m: .85, ro: .3 },
          R.box(0, L0 + 1.52, 0.54, 0.1, 0.28, PA.gold, 0),
          R.box(0, L0 + 1.7, 0.22, 0.26, 0.2, PA.org, 0)
        ]
      },
      {
        id: 'guide', n: '导向座', seq: 3, pivot: [0, R.Y(YT), 0], out: [0, 0, 2.2],
        hint: '导向座套住从动杆，两条腿落在底板上，整体向上抽出',
        b: [
          /* 顶板做成开叉的两片，中间留出从动杆穿过的缺口 */
          R.box(-0.32, YT, 0.42, 0.18, 0.8, PA.woodL, -0.16),
          R.box(0.32, YT, 0.42, 0.18, 0.8, PA.woodL, -0.16),
          /* 导套轴向沿从动杆方向，杆在孔里滑动，孔真正挖通 */
          { t: 'c', rt: 0.155, h: 0.42, p: [0, R.Y(YT), 0], c: PA.metalD, m: .85, ro: .3, bore: 0.09 },
          pillar(-0.42, YT, Y0),
          pillar(0.42, YT, Y0)
        ]
      }
    ],
    measure: [{ key: 'lift', label: '从动件位移', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const dy = at(th) - L0;
      return {
        cam: { r: [0, 0, th] },
        follower: { p: [0, dy + 0.03, 0] },
        n: { lift: dy },
        readout: [
          { k: '凸轮转角', v: dg(th) },
          { k: '从动件位移', v: dy.toFixed(3) },
          { k: '接触半径', v: at(th).toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 9. 滚子从动件凸轮
 *    滚子把滑动摩擦换成滚动摩擦，同样的轮廓可以跑得更快
 * ============================================================ */
const cm2 = (() => {
  const R = rig(2.05), Y0 = R.Y(0);
  const r0 = 0.9, h = 0.5, rr = 0.17;
  const law = a => {
    const deg = (((a % TAU) + TAU) % TAU) * 180 / Math.PI;
    if (deg < 120) { const u = deg / 120; return u - Math.sin(TAU * u) / TAU; }
    if (deg < 200) return 1;
    if (deg < 300) { const u = (deg - 200) / 100; return 1 - (u - Math.sin(TAU * u) / TAU); }
    return 0;
  };
  const rAt = a => r0 + h * law(a);
  const C0 = rAt(HF) + rr;                  // 滚子中心的起始高度
  const at = th => rAt(HF - th) + rr;
  const camPts = radiusRing(0, Y0, rAt, 288);
  const YT = C0 + 0.72;

  return {
    id: 'camRoller', name: '滚子从动件凸轮', group: 'cam', tag: '凸轮',
    summary: '把滑动摩擦换成滚动摩擦',
    input: { label: '凸轮转角', speed: 58 },
    lesson: {
      what: '从动件头上装一个滚子，滚子在凸轮表面滚过去，摩擦小、能承受更高转速。',
      key: '滚子中心的轨迹是「理论轮廓」，实际凸轮轮廓要沿法线内缩一个滚子半径。这里基圆 0.9、升程 0.5、滚子半径 0.17。',
      where: '汽车发动机配气机构、凸轮式自动送料、纺织机械。'
    },
    base: R.base(-1.7, 1.7, [0]),
    parts: [
      {
        id: 'cam', n: '盘形凸轮', seq: 1, pivot: [0, Y0, 0], out: [0, 0, 2.0],
        hint: '凸轮在最里侧，最后退出键再取下',
        b: [
          prof(camPts, 0.36, PA.purple, 0),
          R.hub(0, 0, 0.26, 0.54, PA.purpleD, 0),
          R.disc(0, 0, 0.48, PA.purpleD, 0.08, 0.24),
          R.pin(0, 0, 0.1, 1.0, 0, PA.metalD)
        ]
      },
      {
        id: 'follower', n: '从动杆', seq: 2, pivot: [0, R.Y(C0), 0], out: [0, 0, 2.1],
        hint: '从动杆下端是个叉口，滚子夹在叉口中间',
        b: [
          R.rod([0, C0 + 0.2], [0, C0 + 1.48], 0.075, PA.gold, 0),
          R.box(0, C0 + 0.22, 0.34, 0.56, 0.07, PA.gold, 0.27),
          R.box(0, C0 + 0.22, 0.34, 0.56, 0.07, PA.gold, -0.27),
          R.box(0, C0 + 1.48, 0.56, 0.1, 0.28, PA.gold, 0),
          R.box(0, C0 + 1.66, 0.22, 0.26, 0.2, PA.org, 0),
          R.pin(0, C0, 0.055, 0.74, 0, PA.metalD)
        ]
      },
      {
        id: 'roller', n: '滚子', seq: 3, pivot: [0, R.Y(C0), 0], out: [0, 0, 2.3],
        hint: '滚子套在叉口的小轴上，先把它取下来',
        b: [
          { t: 'c', rt: rr, h: 0.2, p: [0, R.Y(C0), 0], rot: [HF, 0, 0], c: PA.steel, m: .85, ro: .3 },
          { t: 'c', rt: 0.06, h: 0.26, p: [0, R.Y(C0), 0], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 }
        ]
      },
      {
        id: 'guide', n: '导向座', seq: 4, pivot: [0, R.Y(YT), 0], out: [0, 0, 2.2],
        hint: '导向座卡住从动杆的杆身，向上抽出',
        b: [
          /* 顶板做成开叉的两片，中间留出从动杆穿过的缺口 */
          R.box(-0.32, YT, 0.42, 0.18, 0.8, PA.woodL, -0.16),
          R.box(0.32, YT, 0.42, 0.18, 0.8, PA.woodL, -0.16),
          /* 导套轴向沿从动杆方向，杆在孔里滑动，孔真正挖通 */
          { t: 'c', rt: 0.155, h: 0.42, p: [0, R.Y(YT), 0], c: PA.metalD, m: .85, ro: .3, bore: 0.09 },
          pillar(-0.42, YT, Y0),
          pillar(0.42, YT, Y0)
        ]
      }
    ],
    measure: [{ key: 'lift', label: '从动件位移', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const c = at(th);
      const dy = c - C0;
      return {
        cam: { r: [0, 0, th] },
        follower: { p: [0, dy, 0] },
        roller: { p: [0, dy, 0], r: [0, 0, -dy / rr] },
        n: { lift: dy },
        readout: [
          { k: '凸轮转角', v: dg(th) },
          { k: '从动件位移', v: dy.toFixed(3) },
          { k: '滚子转角', v: dg(-dy / rr) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 10. 偏心轮机构
 *     偏心距 e=0.5 的圆盘代替曲柄，滑块行程 2e=1.0
 * ============================================================ */
const cm3 = (() => {
  const R = rig(1.92), Y0 = R.Y(0);
  const e = 0.5, rDisc = 0.95, l = 2.6;
  const E0 = V(e, 0), S0 = V(e + l, 0);
  const at = th => e * Math.cos(th) + Math.sqrt(l * l - Math.pow(e * Math.sin(th), 2));

  return {
    id: 'eccentric', name: '偏心轮机构', group: 'cam', tag: '偏心',
    summary: '一个偏心的圆盘顶替了曲柄',
    input: { label: '偏心轮转角', speed: 56 },
    lesson: {
      what: '圆盘的中心不装在自己的圆心，而是偏出去一段距离。转起来，这段偏心距就等于曲柄半径。',
      key: '偏心距 e 就是曲柄半径，滑块行程 = 2e = 1.0。结构比曲柄简单得多，行程小、力大，所以冲床、破碎机都爱用。',
      where: '冲床、颚式破碎机、偏心振动筛、汽车雨刷。'
    },
    base: [
      ...R.base(-1.7, 4.6, [0]),
      /* 上下导轨从偏心轮扫掠区（含套环外缘 x≤1.56）之外开始，避免盘缘切进导轨 */
      R.box(3.06, 0.46, 2.92, 0.16, 0.86, PA.woodD),
      R.box(3.06, -0.46, 2.92, 0.16, 0.86, PA.woodD),
      /* 导轨端座移到机构平面之后，让开偏心套连杆的摆动路径 */
      R.box(1.55, 0, 0.16, 1.1, 0.18, PA.woodL, -0.34, 0.7),
      R.box(4.42, 0, 0.16, 1.1, 0.18, PA.woodL, -0.34, 0.7)
    ],
    parts: [
      {
        id: 'wheel', n: '偏心轮', seq: 1, pivot: [0, Y0, 0], out: [0, 0, 2.0],
        hint: '偏心轮套在轴上，圆心和轴心错开 0.5',
        b: [
          R.disc(E0.x, E0.y, rDisc, PA.purple, 0.3, 0),
          R.hub(0, 0, 0.22, 0.36, PA.metalD, 0.18),
          R.pin(0, 0, 0.1, 1.0, 0, PA.metalD),
          { t: 'b', s: [0.16, 0.2, 0.1], p: [0.3, Y0 + 0.5, 0.2], c: PA.metal, m: .8, ro: .3 }
        ]
      },
      {
        id: 'strap', n: '偏心套连杆', seq: 2, pivot: [E0.x, Y0, 0], out: [0, 0, 2.2],
        hint: '环形套抱住偏心轮，环上连着连杆，先摘下环再抽出',
        b: [
          { t: 'o', rad: 1.06, tube: 0.08, seg: 44, p: [E0.x, Y0, 0], c: PA.metalD, m: .85, ro: .3 },
          R.rod([E0.x + 1.04, 0], [S0.x, 0], 0.09, PA.gold, 0),
          { t: 'b', s: [0.28, 0.3, 0.3], p: [E0.x + 1.11, Y0, 0], c: PA.gold, ro: .45 },
          R.pin(E0.x, 0, 0.09, 0.34, 0, PA.metalD)
        ]
      },
      {
        id: 'slider', n: '滑块', seq: 3, pivot: [0, 0, 0], out: [0, 0, 1.9],
        hint: '滑块夹在上下导轨之间，顺着导轨平着抽出',
        b: [
          /* 滑块做成上下两片夹瓦，中间留出连杆穿过的槽，不横穿连杆实体 */
          R.box(S0.x, 0, 0.86, 0.62, 0.22, PA.yellow, -0.29),
          R.box(S0.x, 0, 0.86, 0.62, 0.22, PA.yellow, 0.29),
          R.box(S0.x, 0, 0.46, 0.74, 0.22, PA.org, -0.29),
          R.box(S0.x, 0, 0.46, 0.74, 0.22, PA.org, 0.29),
          R.box(S0.x, 0.34, 0.9, 0.06, 0.72, PA.metal, 0, .35),
          R.box(S0.x, -0.34, 0.9, 0.06, 0.72, PA.metal, 0, .35),
          R.pin(S0.x, 0, 0.09, 0.24, -0.30),
          R.pin(S0.x, 0, 0.09, 0.24, 0.30)
        ]
      }
    ],
    measure: [{ key: 'stroke', label: '滑块位置', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const E = V(e * Math.cos(th), e * Math.sin(th));
      const x = at(th);
      const S = V(x, 0);
      const alpha = ang(E, S);
      return {
        wheel: { r: [0, 0, th] },
        strap: { r: [0, 0, alpha], p: [E.x - E0.x, E.y - E0.y, 0] },
        slider: { p: [x - S0.x, 0, 0] },
        n: { stroke: x },
        readout: [
          { k: '偏心轮转角', v: dg(th) },
          { k: '滑块位置', v: x.toFixed(2) },
          { k: '连杆摆角', v: rd(alpha) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 11. 槽轮（日内瓦）机构
 *     拨销半径 1.0，中心距 √2，四槽：转一圈、槽轮转 90° 停 270°
 * ============================================================ */
const cm4 = (() => {
  const R = rig(1.55), Y0 = R.Y(0);
  const rp = 1.0, dx = rp / Math.sin(Math.PI / 4);
  const RW = 1.0, half = 10 * Math.PI / 180, slots = 4;
  /* 四个扇形，扇形之间留出的缺口就是槽 */
  const wheelB = [];
  for (let i = 0; i < slots; i++) {
    const a0 = i * TAU / slots + half, a1 = (i + 1) * TAU / slots - half;
    wheelB.push(prof(sectorRing(dx, Y0, 0.27, RW, a0, a1, 22), 0.34, PA.gold, 0.16));
  }
  wheelB.push(R.hub(dx, 0, 0.27, 0.56, PA.purpleD, 0.16));
  wheelB.push(R.pin(dx, 0, 0.09, 1.3, 0.1, PA.metalD));

  /* 拨销在槽里时槽轮跟着转；其余 270° 由锁止弧卡住不动 */
  const idx = th => {
    const u = ((th - HF / 2) % TAU + TAU) % TAU;
    if (u < 3 * HF) return -Math.PI / 4;
    const p = (u - 3 * HF) / HF;
    return -Math.PI / 4 + (Math.PI / 2) * (1 - p);
  };

  return {
    id: 'geneva', name: '槽轮（日内瓦）机构', group: 'cam', tag: '间歇',
    summary: '连续转变成四分度的间歇转位',
    input: { label: '拨盘转角', speed: 46 },
    lesson: {
      what: '拨盘上的圆销进槽一次，槽轮就转过一格，随后被锁住不动，等下一圈再来。',
      key: '四槽槽轮每转一格正好 90°：拨盘转 90° 完成分度，剩下 270° 停位。中心距按 d = R / sin(180°/槽数) 定，这里 R=1.0、槽数 4，所以 d=1.414。',
      where: '电影放映机卷片、自动装配线的转位工作台、包装机。'
    },
    base: R.base(-1.6, 2.8, [0, dx]),
    parts: [
      {
        id: 'drive', n: '拨盘', seq: 1, pivot: [0, Y0, 0], out: [0, 0, 2.0],
        hint: '拨盘在里侧，最后取下',
        b: [
          R.disc(0, 0, 0.34, PA.purple, 0.16, -0.34),
          R.rod([0, 0], [rp - 0.05, 0], 0.09, PA.purple, -0.34),
          R.hub(0, 0, 0.17, 0.32, PA.purpleD, -0.34),
          R.pin(0, 0, 0.1, 1.3, -0.1, PA.metalD)
        ]
      },
      {
        id: 'pin', n: '拨销', seq: 2, pivot: [0, Y0, 0], out: [0, 0, 2.2],
        hint: '拨销插在拨盘上，拔出来才能停住槽轮',
        b: [
          { t: 'c', rt: 0.085, h: 1.02, p: [rp, Y0, 0], rot: [HF, 0, 0], c: PA.gold, m: .6, ro: .35 },
          { t: 'c', rt: 0.13, h: 0.1, p: [rp, Y0, 0.4], rot: [HF, 0, 0], c: PA.org, m: .3, ro: .5 }
        ]
      },
      {
        id: 'wheel', n: '槽轮', seq: 3, pivot: [dx, Y0, 0], out: [0, 0, 2.0],
        hint: '槽轮在最外侧，先把它从轴上取下',
        b: wheelB
      }
    ],
    measure: [{ key: 'idx', label: '槽轮转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = idx(th);
      const u = ((th - HF / 2) % TAU + TAU) % TAU;
      return {
        drive: { r: [0, 0, th] },
        pin: { r: [0, 0, th] },
        wheel: { r: [0, 0, a] },
        n: { idx: dd(a) },
        readout: [
          { k: '拨盘转角', v: dg(th) },
          { k: '槽轮转角', v: rd(a) },
          { k: '当前状态', v: u < 3 * HF ? '停位（锁止）' : '分度中' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 12. 棘轮棘爪机构
 *     摇臂摆一次，棘轮转过两齿；止回棘爪防止倒转
 * ============================================================ */
const cm5 = (() => {
  const R = rig(1.5), Y0 = R.Y(0);
  const C = V(2.7, 0), A = V(0.35, 0);
  const LA = 1.07, T0 = V(A.x + LA, 0);
  const amp = 0.4, step = TAU / 16;
  const arm = th => -amp * Math.cos(th);
  const s = th => th < Math.PI ? smooth(th / Math.PI) : 1;
  const lift = th => th > Math.PI ? -0.4 * Math.sin((th - Math.PI)) : 0;
  const wheelPts = radiusRing(C.x, Y0, ratchetRF(0.98, 1.18, 16, 0.12), 288);

  return {
    id: 'ratchet', name: '棘轮棘爪机构', group: 'cam', tag: '间歇',
    summary: '摆动变成单向的步进转动',
    input: { label: '摇臂相位', speed: 50 },
    lesson: {
      what: '摇臂来回摆，棘爪只在推的那半程咬住齿、带着棘轮走两齿；回程时棘爪从齿顶滑过，棘轮被止回棘爪按住不倒转。',
      key: '每次推进量等于棘爪扫过的弧长，这里一摆正好两齿。齿形做成缓升陡落，所以只能单向走，反方向会被齿面挡住。',
      where: '千斤顶、手扳葫芦、钟表发条上弦、扳手。'
    },
    base: [
      ...R.base(-0.7, 4.2, [A.x, C.x]),
      /* 止回棘爪的立柱下移，让开摇臂下摆时棘爪尾部扫过的范围 */
      pillar(1.45, -0.94, Y0, PA.woodD, -0.3, 0.14),
      /* 立柱顶面伸出一节托销，顶住止回棘爪轴套的背面：爪不再是悬空的 */
      { t: 'c', rt: .07, h: .26, p: [1.45, Y0 - .94, -.10], rot: [HF, 0, 0], c: PA.woodD, ro: .8 }
    ],
    parts: [
      {
        id: 'wheel', n: '棘轮', seq: 1, pivot: [C.x, Y0, 0], out: [0, 0, 2.0],
        hint: '棘轮在里侧，最后从轴上取下',
        b: [
          prof(wheelPts, 0.34, PA.gold, 0.15),
          R.hub(C.x, 0, 0.3, 0.6, PA.purpleD, 0.15),
          R.pin(C.x, 0, 0.1, 1.12, 0.06, PA.metalD),
          { t: 'c', rt: 0.14, h: 0.4, p: [C.x, Y0, 0.42], rot: [HF, 0, 0], c: PA.purple, m: .4, ro: .5 }
        ]
      },
      {
        id: 'arm', n: '摇臂', seq: 2, pivot: [A.x, Y0, 0.62], out: [0, 0, 2.0],
        hint: '摇臂铰在左侧支柱上，先把它从销轴上摘下',
        b: [
          R.rod([A.x, 0], [T0.x, 0], 0.11, PA.purple, 0.62),
          R.disc(A.x, 0, 0.3, PA.purpleD, 0.16, 0.62),
          R.hub(A.x, 0, 0.16, 1.16, PA.metalD, 0.1),
          R.box(A.x - 0.05, -0.42, 0.42, 0.5, 0.24, PA.purpleD, 0.62),
          R.pin(T0.x, 0, 0.06, 0.6, 0.62, PA.metalD)
        ]
      },
      {
        id: 'pawl', n: '棘爪', seq: 3, pivot: [T0.x, Y0, 0.15], out: [0, 0, 2.2],
        hint: '棘爪挂在摇臂端头的小轴上，爪尖落在齿槽里',
        b: [
          R.box(T0.x + 0.12, -0.06, 0.34, 0.42, 0.16, PA.org, 0.15),
          /* 尾部小方块收短上提：摇臂下摆 0.42 时也不再碰止回棘爪的轴套 */
          R.box(T0.x + 0.16, -0.2, 0.16, 0.16, 0.14, PA.metalD, 0.15),
          R.pin(T0.x, 0, 0.055, 0.66, 0.15, PA.metalD),
          { t: 'b', s: [0.12, 0.12, 0.14], p: [T0.x - 0.1, Y0 + 0.2, 0.15], c: PA.purpleD, ro: .5 }
        ]
      },
      {
        id: 'detent', n: '止回棘爪', seq: 4, pivot: [1.45, Y0 - 0.94, 0.15], out: [0, 0, 2.2],
        hint: '止回棘爪固定在立柱上，顶住齿背不让棘轮倒转',
        b: [
          R.rod([1.45, -0.9], [1.66, -0.96], 0.07, PA.metalD, 0.15),
          /* 圆头爪尖停在齿顶圆之外，齿背掠过时不穿插 */
          R.pin(1.68, -0.98, 0.085, 0.16, 0.15, PA.metalD),
          { t: 'c', rt: 0.1, h: 0.24, p: [1.45, R.Y(-0.94), 0.15], rot: [HF, 0, 0], c: PA.steel, m: .8, ro: .3 }
        ]
      }
    ],
    measure: [
      { key: 'step', label: '棘轮转角', unit: '°', k: 180 / Math.PI, dec: 0 },
      { key: 'swing', label: '摇臂摆角', unit: '°', k: 180 / Math.PI, dec: 0 }
    ],
    pose(th) {
      const ph = arm(th);
      const T = V(A.x + LA * Math.cos(ph), LA * Math.sin(ph));
      const w = -2 * step * s(th);
      const lf = lift(th);
      return {
        wheel: { r: [0, 0, w] },
        arm: { r: [0, 0, ph] },
        pawl: { r: [0, 0, -ph + lf], p: [T.x - T0.x, T.y - T0.y, 0] },
        n: { step: dd(w), swing: dd(ph) },
        readout: [
          { k: '摇臂摆角', v: rd(ph) },
          { k: '棘轮转角', v: rd(w) },
          { k: '棘爪状态', v: th > Math.PI ? '回程滑动' : '推齿前进' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 13. 不完全齿轮机构
 *     主动轮只有半圈有齿，转过这半圈带动从动轮 90°，其余时间停住
 * ============================================================ */
const cm6 = (() => {
  const R = rig(2.35), Y0 = R.Y(0);
  const dx = 2.91;
  const drivePts = radiusRing(0, Y0, teethRF(0.9, 1.02, 16, -HF, Math.PI), 288);
  /* 锁止弧：贴在主动轮盘缘外侧的一圈细弧，半径 = 中心距 − 从动轮齿顶圆，
     停位时与从动轮齿顶相切，不切进齿体 */
  const lockPts = sectorRing(0, Y0, 0.915, 0.945, HF, 3 * HF, 24);
  const drivenPts = radiusRing(dx, Y0, teethRF(1.82, 1.94, 32), 448);

  /* 有齿半圈对着从动轮时按齿数比滚动：i = 16/32 = 1/2 */
  const psi = th => {
    const u = wrap(th);
    return (u >= -HF && u <= HF) ? -u / 2 : -Math.PI / 4;
  };

  return {
    id: 'partialGear', name: '不完全齿轮机构', group: 'cam', tag: '间歇',
    summary: '缺齿一圈，从动轮只能转一截',
    input: { label: '主动轮转角', speed: 44 },
    lesson: {
      what: '主动轮只有半圈长了齿。有齿的那半圈啮合，从动轮被推着转 90°；无齿的半圈由锁止弧卡住，从动轮停住。',
      key: '从动轮转角 = 主动轮齿数 / 从动轮齿数 × 360°，这里 8/32 正好 90°。锁止弧的半径和从动轮齿顶圆相切，停位时不会窜动。',
      where: '自动机床的转塔、计数器、包装机的间歇送料。'
    },
    base: R.base(-1.5, 5.2, [0, dx]),
    parts: [
      {
        id: 'drive', n: '不完全齿轮', seq: 1, pivot: [0, Y0, 0], out: [0, 0, 2.0],
        hint: '主动轮只有半圈齿，键槽对准轴上的键',
        b: [
          prof(drivePts, 0.3, PA.purple, -0.04),
          R.hub(0, 0, 0.3, 0.56, PA.purpleD, -0.04),
          R.disc(0, 0, 0.54, PA.purpleD, 0.08, 0.16),
          R.pin(0, 0, 0.1, 1.0, -0.02, PA.metalD)
        ]
      },
      {
        id: 'lock', n: '锁止弧', seq: 2, pivot: [0, Y0, 0], out: [0, 0, 2.1],
        hint: '锁止弧和主动轮同轴，缺口处才能让从动轮转',
        b: [
          prof(lockPts, 0.3, PA.metalD, -0.04)
        ]
      },
      {
        id: 'driven', n: '从动齿轮', seq: 3, pivot: [dx, Y0, 0], out: [0, 0, 2.0],
        hint: '从动轮在最外侧，先摘下它',
        b: [
          prof(drivenPts, 0.3, PA.gold, 0.06),
          R.hub(dx, 0, 0.36, 0.62, PA.purpleD, 0.06),
          R.pin(dx, 0, 0.09, 1.1, 0.1, PA.metalD),
          { t: 'c', rt: 0.12, h: 0.42, p: [dx, Y0, 0.36], rot: [HF, 0, 0], c: PA.purple, m: .4, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'idx', label: '从动轮转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = psi(th);
      return {
        drive: { r: [0, 0, th] },
        lock: { r: [0, 0, th] },
        driven: { r: [0, 0, a] },
        n: { idx: dd(a) },
        readout: [
          { k: '主动轮转角', v: dg(th) },
          { k: '从动轮转角', v: rd(a) },
          { k: '当前状态', v: (Math.abs(wrap(th)) <= HF) ? '啮合传动' : '锁止停位' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 14. 凸轮分度机构
 *     单凸脊凸轮每转一圈，推动分度盘转过 45°（八工位）
 * ============================================================ */
const cm7 = (() => {
  const R = rig(2.0), Y0 = R.Y(0);
  const r0 = 0.95, h = 0.41, bw = 1.1, dx = 3.0;
  const rAt = a => {
    const u = (((a + Math.PI) % TAU) + TAU) % TAU - Math.PI;
    if (Math.abs(u) > bw) return r0;
    const k = Math.cos(Math.PI * u / (2 * bw));
    return r0 + h * k * k;
  };
  const camPts = radiusRing(0, Y0, rAt, 288);
  const NR = 8, RR = 1.5;
  /* 前 1.15 rad 完成一次分度，其余时间停住 */
  const psi = th => (Math.PI / 4) * smooth(th / 1.15);
  const rollB = [];
  for (let i = 0; i < NR; i++) {
    const a = i / NR * TAU, x = dx + RR * Math.cos(a), y = RR * Math.sin(a);
    rollB.push({ t: 'c', rt: 0.14, h: 0.38, p: [x, R.Y(y), 0.5], rot: [HF, 0, 0], c: PA.steel, m: .85, ro: .3 });
    rollB.push({ t: 'c', rt: 0.05, h: 0.46, p: [x, R.Y(y), 0.5], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 });
  }

  return {
    id: 'camIndexer', name: '凸轮分度机构', group: 'cam', tag: '间歇',
    summary: '一条凸脊完成一次精确分度',
    input: { label: '凸轮转角', speed: 48 },
    lesson: {
      what: '凸轮面上的凸脊扫过一圈，正好推着一个柱销把分度盘拨过一格；凸脊离开后，盘面靠圆弧段锁住不动。',
      key: '凸脊的升程曲线决定分度的加减速，做到起停都无冲击。八工位每格 45°，凸轮转一圈分一格，节拍由转速直接决定。',
      where: '加工中心刀库、自动化装配转台、包装机的多工位分度。'
    },
    base: R.base(-1.6, 5.0, [0, dx]),
    parts: [
      {
        id: 'cam', n: '分度凸轮', seq: 1, pivot: [0, Y0, 0], out: [0, 0, 2.0],
        hint: '凸轮在最里侧，最后取下',
        b: [
          prof(camPts, 0.3, PA.purple, 0.42),
          R.hub(0, 0, 0.34, 0.7, PA.purpleD, 0.3),
          R.disc(0, 0, 0.56, PA.purpleD, 0.08, 0.6),
          R.pin(0, 0, 0.1, 1.0, 0.35, PA.metalD)
        ]
      },
      {
        id: 'table', n: '分度盘', seq: 2, pivot: [dx, Y0, 0], out: [0, 0, 2.0],
        hint: '分度盘套在主轴上，先拆柱销再取盘',
        b: [
          R.disc(dx, 0, 1.4, PA.gold, 0.26, 0.85),
          R.hub(dx, 0, 0.3, 1.2, PA.purpleD, 0.45),
          R.pin(dx, 0, 0.1, 1.7, 0.5, PA.metalD),
          { t: 'c', rt: 0.5, h: 0.1, p: [dx, Y0, 1.02], rot: [HF, 0, 0], c: PA.org, m: .3, ro: .5 }
        ]
      },
      {
        id: 'rollers', n: '柱销（8 根）', seq: 3, pivot: [dx, Y0, 0], out: [0, 0, 2.2],
        hint: '八根柱销沿盘缘均布，凸轮凸脊就是推它们',
        b: rollB
      }
    ],
    measure: [{ key: 'idx', label: '分度盘转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = psi(th);
      return {
        cam: { r: [0, 0, th] },
        table: { r: [0, 0, a] },
        rollers: { r: [0, 0, a] },
        n: { idx: dd(a) },
        readout: [
          { k: '凸轮转角', v: dg(th) },
          { k: '分度盘转角', v: rd(a) },
          { k: '工位', v: `${Math.round(dd(a) / 45)} / 8` }
        ]
      };
    }
  };
})();

/* ============================================================
 * 15. 外啮合齿轮对
 *     m=0.1，z₁=20 / z₂=30，中心距 2.5，i = 1.5（转向相反）
 * ============================================================ */
const gr1 = (() => {
  const R = rig(1.85), Y0 = R.Y(0);
  const m = 0.1, z1 = 20, z2 = 30, r1 = z1 * m / 2, r2 = z2 * m / 2;
  const dx = r1 + r2, s1 = TAU / z1, s2 = TAU / z2;
  const A = V(1.25, 0), B = V(1.25 + dx, 0);
  const g1 = gearPts(z1, m, -s1 / 2), g2 = gearPts(z2, m, Math.PI - s2);

  return {
    id: 'spurPair', name: '外啮合齿轮对', group: 'gear', tag: '定传动比',
    summary: '两轮转向相反，转速按齿数反比分配',
    input: { label: '主动轮转角', speed: 44 },
    lesson: {
      what: '两只齿轮直接咬合，齿数少的转得快，两轮转向相反。',
      key: `传动比 i = z₂/z₁ = ${z2}/${z1} = ${(z2 / z1).toFixed(2)}，从动轮只转主动轮的 ${(z1 / z2).toFixed(2)} 倍，方向相反。中心距必须等于两分度圆半径之和，即 ${dx.toFixed(2)}。`,
      where: '减速箱、钟表、汽车变速器、卷扬机，几乎所有需要换速的机器。'
    },
    base: R.base(-0.35, 5.55, [A.x, B.x]),
    parts: [
      {
        id: 'g1', n: `主动齿轮 z=${z1}`, seq: 1, pivot: [A.x, Y0, 0], out: [0, 0, 2.0],
        hint: '主动轮在里侧，先拆摇把再取齿轮',
        b: [
          { t: 'pf', pts: g1, d: .3, p: [A.x, Y0, 0], c: PA.blue, m: .45, ro: .42 },
          R.hub(A.x, 0, .3, .46, PA.blueD, 0),
          R.disc(A.x, 0, .52, PA.sky, .08, .22),
          R.rod([A.x, 0], [A.x + .52, 0], .08, PA.red, .3),
          R.pin(A.x + .52, 0, .07, .4, .3, PA.redD),
          R.pin(A.x, 0, .09, .95, .05, PA.metalD)
        ]
      },
      {
        id: 'g2', n: `从动齿轮 z=${z2}`, seq: 2, pivot: [B.x, Y0, 0], out: [0, 0, 2.2],
        hint: '从动轮在最外侧，先把它从轴上取下',
        b: [
          { t: 'pf', pts: g2, d: .3, p: [B.x, Y0, 0], c: PA.gold, m: .45, ro: .42 },
          R.hub(B.x, 0, .32, .48, PA.purpleD, 0),
          R.disc(B.x, 0, .58, PA.purpleD, .08, .22),
          R.pin(B.x, 0, .09, 1.0, .05, PA.metalD),
          { t: 'c', rt: .1, h: .4, p: [B.x + .78, Y0, .18], rot: [HF, 0, 0], c: PA.org, m: .3, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'out', label: '从动轮转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = -th * z1 / z2;
      return {
        g1: { r: [0, 0, th] },
        g2: { r: [0, 0, a] },
        n: { out: dd(a) },
        readout: [
          { k: '主动轮转角', v: dg(th) },
          { k: '从动轮转角', v: rd(a) },
          { k: '传动比 i', v: (z2 / z1).toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 16. 内啮合齿轮
 *     z₁=18 小齿轮装在 z₂=30 内齿圈里，中心距 0.6，转向相同
 * ============================================================ */
const gr2 = (() => {
  const R = rig(2.10), Y0 = R.Y(0);
  const m = 0.1, z1 = 18, z2 = 30;
  const s1 = TAU / z1, s2 = TAU / z2;
  const e = z2 * m / 2 - z1 * m / 2;
  const P = V(1.5, 0), Q = V(1.5 + e, 0);
  const g1 = gearPts(z1, m, Math.PI - 8.5 * s1);
  /* 内齿圈：齿尖 1.4、齿根 1.625，180° 方向留一个齿槽给小齿轮 */
  const ringB = ringAt(Q.x, Y0, 1.78, 1.4, 1.625, z2, Math.PI - s2, .3, PA.gold, 0);
  const boltB = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    boltB.push({ t: 'c', rt: .055, h: .12, p: [Q.x + 1.71 * Math.cos(a), Y0 + 1.71 * Math.sin(a), .18], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 });
  }

  return {
    id: 'internalGear', name: '内啮合齿轮', group: 'gear', tag: '同向传动',
    summary: '小齿轮藏在内齿圈里，两轮转向相同',
    input: { label: '小齿轮转角', speed: 46 },
    lesson: {
      what: '小齿轮装在齿圈内部，齿对齿在内侧咬合，两只轮子朝同一个方向转。',
      key: `同样 i = z₂/z₁ = ${(z2 / z1).toFixed(2)}，但内啮合两轮转向相同，中心距只有齿圈半径减去小轮半径，${e.toFixed(2)}，结构比外啮合紧凑。`,
      where: '行星齿轮的内齿圈、齿轮泵、少齿差减速器、绞肉机。'
    },
    base: R.base(-0.45, 4.4, [P.x, { x: Q.x, z: -0.36 }]),
    parts: [
      {
        id: 'p1', n: `小齿轮 z=${z1}`, seq: 1, pivot: [P.x, Y0, 0], out: [0, 0, 2.2],
        hint: '小齿轮在齿圈里面，先拆摇把再往外抽',
        b: [
          { t: 'pf', pts: g1, d: .3, p: [P.x, Y0, 0], c: PA.blue, m: .45, ro: .42 },
          R.hub(P.x, 0, .3, .42, PA.blueD, 0),
          R.disc(P.x, 0, .5, PA.sky, .08, .22),
          R.rod([P.x, 0], [P.x + .5, 0], .08, PA.red, .3),
          R.pin(P.x + .5, 0, .07, .4, .3, PA.redD),
          R.pin(P.x, 0, .09, 1.1, .05, PA.metalD)
        ]
      },
      {
        id: 'ring', n: `内齿圈 z=${z2}`, seq: 2, pivot: [Q.x, Y0, 0], out: [0, 0, 2.0],
        hint: '齿圈套在小齿轮外面，最后整体取下',
        b: [
          ringB,
          ...boltB,
          R.box(Q.x, 1.62, .1, .26, .14, PA.red, .2),
          /* 背面轮毂：从齿圈背面接出，避开小齿轮扫过的整个齿盘平面；
             轮毂做成带轴孔的轴承座，机架轴瓦(r0.22)整个落在孔里，不穿实体 */
          Object.assign(R.hub(Q.x, 0, .4, .24, PA.gold, -.34), { bore: .24 })
        ]
      }
    ],
    measure: [{ key: 'out', label: '齿圈转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = th * z1 / z2;
      return {
        p1: { r: [0, 0, th] },
        ring: { r: [0, 0, a] },
        n: { out: dd(a) },
        readout: [
          { k: '小齿轮转角', v: dg(th) },
          { k: '齿圈转角', v: rd(a) },
          { k: '转向', v: '与小齿轮相同' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 17. 齿轮齿条
 *     小齿轮 z=16（r=0.8）往复摆动，齿条按 r·ψ 平动
 * ============================================================ */
const gr3 = (() => {
  const R = rig(1.62), Y0 = R.Y(0);
  const m = .1, z = 16, r = z * m / 2;
  const pch = Math.PI * m;              // 齿距 πm
  const P = V(1.9, 1.60);               // 小齿轮中心：按齿条节线（Y0+0.78）上抬一个分度圆 r=0.8
  const PY = Y0 + 1.60;                 // 小齿轮轴心高度
  const AMP = Math.PI / 4;              // 摆幅 ±45°，恰好两齿
  const NS = 15;                        // 齿条齿数
  const X0 = 1.9;
  const toothB = [];
  for (let i = 0; i < NS; i++) {
    const x = X0 + (i - (NS - 1) / 2) * pch;
    toothB.push({ t: 'b', s: [pch * .42, .21, .34], p: [x, Y0 + .78, 0], c: PA.metal, m: .5, ro: .4 });
  }
  const pinB = (() => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU + .4;
      out.push({ t: 'c', rt: .28, h: .34, p: [P.x + .42 * Math.cos(a), Y0 + P.y + .42 * Math.sin(a), 0], rot: [HF, 0, 0], c: PA.sky, m: .3, ro: .5 });
    }
    return out;
  })();
  /* 齿条两端的导轨座：下托 + 两侧挡板 */
  const guide = [];
  [-0.35, 4.15].forEach(x => {
    const h = Math.max(.1, Y0 + .22 - .24);
    guide.push({ t: 'b', s: [.24, h, .7], p: [x, .24 + h / 2, 0], c: PA.woodD, ro: .8 });
    guide.push({ t: 'b', s: [.3, .1, .76], p: [x, Y0 + .22, 0], c: PA.woodL, ro: .8 });
    guide.push({ t: 'b', s: [.24, .72, .07], p: [x, Y0 + .6, .36], c: PA.woodD, ro: .8 });
    guide.push({ t: 'b', s: [.24, .72, .07], p: [x, Y0 + .6, -.36], c: PA.woodD, ro: .8 });
  });

  /* 小齿轮轴支座：后立柱 + 沿轴支臂，把轴承抬到小齿轮实际轴心高度（避开齿盘扫掠） */
  const pinionSup = [
    { t: 'b', s: [.18, PY + .16, .12], p: [P.x, (PY + .16) / 2, -.58], c: PA.woodD, ro: .8 },
    { t: 'b', s: [.1, .1, .30], p: [P.x, PY, -.44], c: PA.woodD, ro: .8 },
    { t: 'c', rt: .22, h: .26, p: [P.x, PY, -.42], rot: [HF, 0, 0], c: PA.woodL, ro: .72, bore: .11 },
    { t: 'c', rt: .085, h: .28, p: [P.x, PY, -.42], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 }
  ];

  return {
    id: 'rackPinion', name: '齿轮齿条', group: 'gear', tag: '转动↔平动',
    summary: '齿轮转动变成齿条直线移动',
    input: { label: '小齿轮摆角', speed: 48 },
    lesson: {
      what: '小齿轮来回摆，齿条就沿导轨来回走；反过来推齿条，齿轮也会转。',
      key: `齿条走过的距离 = 小齿轮半径 × 转角，s = r·ψ。这里 r=${r.toFixed(2)}，摆 45° 对应齿条走 ${(r * AMP).toFixed(2)}；齿轮连续单向转，齿条就连续前进，每转一圈走 πd = ${(TAU * r).toFixed(2)}。`,
      where: '汽车转向器、机床工作台进给、抽屉滑轨、升降门。'
    },
    base: [...R.base(-0.85, 4.75, []), ...pinionSup, ...guide],
    parts: [
      {
        id: 'pinion', n: `小齿轮 z=${z}`, seq: 1, pivot: [P.x, Y0 + P.y, 0], out: [0, 0, 2.0],
        hint: '小齿轮在里侧，先拆摇把再取齿轮',
        b: [
          gearAt(z, m, P.x, Y0 + P.y, .32, PA.blue, -Math.PI / z * .5),
          R.hub(P.x, P.y, .28, .5, PA.blueD, 0),
          R.disc(P.x, P.y, .46, PA.sky, .08, .24),
          R.rod([P.x, P.y], [P.x + .46, P.y], .08, PA.red, .32),
          R.pin(P.x + .46, P.y, .07, .38, .32, PA.redD),
          R.pin(P.x, P.y, .09, 1.1, .05, PA.metalD),
          ...pinB
        ]
      },
      {
        id: 'rack', n: '齿条', seq: 2, pivot: [X0, Y0 + .55, 0], out: [0, 0, 2.2],
        hint: '齿条架在导轨上，顺着导轨整根抽出',
        b: [
          { t: 'b', s: [NS * pch + .3, .38, .42], p: [X0, Y0 + .48, 0], c: PA.org, ro: .6 },
          ...toothB,
          { t: 'b', s: [.08, .12, .04], p: [X0, Y0 + .55, .22], c: PA.red, ro: .5 },
          { t: 'c', rt: .05, h: .1, p: [X0, Y0 + .66, .22], rot: [HF, 0, 0], c: PA.redD, m: .8, ro: .3 }
        ]
      }
    ],
    measure: [{ key: 'x', label: '齿条位移', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const psi = AMP * Math.sin(th);
      const dx = r * psi;
      return {
        pinion: { r: [0, 0, psi] },
        rack: { p: [dx, 0, 0] },
        n: { x: dx },
        readout: [
          { k: '小齿轮转角', v: rd(psi) },
          { k: '齿条位移', v: dx.toFixed(2) },
          { k: '每转前进', v: (TAU * r).toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 18. 蜗轮蜗杆
 *     单头蜗杆 z₁=1、蜗轮 z₂=24，蜗杆转一圈蜗轮转一齿
 * ============================================================ */
const gr4 = (() => {
  const R = rig(1.60), Y0 = R.Y(0);
  const m = .1, z2 = 24, r2 = z2 * m / 2;
  const C = V(2.0, 0);
  const wr = .34, WY = r2 + wr, L = 2.3;
  const g2 = gearPts(z2, m, 0);

  return {
    id: 'wormDrive', name: '蜗轮蜗杆', group: 'gear', tag: '大减速比',
    summary: '交错轴传动，一圈只走一齿',
    input: { label: '蜗杆转角', speed: 56 },
    lesson: {
      what: '蜗杆像一根螺旋，转一圈只把蜗轮推过一个齿，所以能一次做出很大的减速比。',
      key: `单头蜗杆 i = z₂/1 = ${z2}，蜗杆转 ${z2} 圈蜗轮才转一圈；螺旋升角小，还有自锁性——蜗轮带不动蜗杆。两轴在空间里垂直交错，不相交。`,
      where: '电梯曳引机、卷扬机、减速机、机床分度头、汽车转向器。'
    },
    base: [
      ...R.base(-.6, 4.4, [C.x]),
      /* 蜗杆两端支座退到机架后侧，再用一段支臂把轴承环送到蜗杆轴线上；
         轴承环开轴孔，蜗杆轴从孔里穿过，立柱本身绝不与轴相交 */
      pillar(.52, WY, Y0, PA.woodD, -.42, .18),
      pillar(3.48, WY, Y0, PA.woodD, -.42, .18),
      { t: 'b', s: [.1, .1, .34], p: [.52, Y0 + WY, -.38], c: PA.woodD, ro: .8 },
      { t: 'c', rt: .18, h: .26, p: [.52, Y0 + WY, 0], rot: [0, 0, HF], c: PA.woodD, ro: .8, bore: .11 },
      { t: 'b', s: [.1, .1, .34], p: [3.48, Y0 + WY, -.38], c: PA.woodD, ro: .8 },
      { t: 'c', rt: .18, h: .26, p: [3.48, Y0 + WY, 0], rot: [0, 0, HF], c: PA.woodD, ro: .8, bore: .11 }
    ],
    parts: [
      {
        id: 'worm', n: '蜗杆', seq: 1, pivot: [C.x, Y0 + WY, 0], out: [0, 0, 2.0],
        hint: '蜗杆横架在两支座上，先拆摇把再整根抽出',
        b: [
          { t: 'hd', rad: wr, tube: .075, len: L, turns: 9, p: [C.x, Y0 + WY, 0], c: PA.purple, m: .7, ro: .3 },
          { t: 'c', rt: .17, h: L, p: [C.x, Y0 + WY, 0], rot: [0, 0, HF], c: PA.purpleD, m: .7, ro: .35 },
          { t: 'c', rt: .09, h: .5, p: [C.x - L / 2 - .15, Y0 + WY, 0], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .3 },
          { t: 'c', rt: .09, h: .9, p: [C.x + L / 2 + .35, Y0 + WY, 0], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .3 },
          { t: 'b', s: [.1, .56, .14], p: [C.x + L / 2 + .78, Y0 + WY + .28, 0], c: PA.red, ro: .5 },
          { t: 's', rad: .1, p: [C.x + L / 2 + .78, Y0 + WY + .56, 0], c: PA.redD, ro: .5 }
        ]
      },
      {
        id: 'wheel', n: `蜗轮 z=${z2}`, seq: 2, pivot: [C.x, Y0, 0], out: [0, 0, 2.2],
        hint: '蜗轮在最外侧，先从轴上取下',
        b: [
          { t: 'pf', pts: g2, d: .34, p: [C.x, Y0, 0], c: PA.gold, m: .45, ro: .42 },
          R.hub(C.x, 0, .34, .58, PA.purpleD, 0),
          R.disc(C.x, 0, .58, PA.purpleD, .08, .24),
          R.pin(C.x, 0, .1, 1.0, .05, PA.metalD),
          { t: 'c', rt: .1, h: .42, p: [C.x + .78, Y0, .18], rot: [HF, 0, 0], c: PA.org, m: .3, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'out', label: '蜗轮转角', unit: '°', k: 180 / Math.PI, dec: 1 }],
    pose(th) {
      const a = th / z2;
      return {
        worm: { r: [th, 0, 0] },
        wheel: { r: [0, 0, a] },
        n: { out: dd(a) },
        readout: [
          { k: '蜗杆转角', v: dg(th) },
          { k: '蜗轮转角', v: rd(a) },
          { k: '减速比 i', v: `${z2} : 1` }
        ]
      };
    }
  };
})();

/* ============================================================
 * 19. 行星齿轮
 *     太阳 z=20、行星 4×z=10、内齿圈 z=40 固定，i = 1 + 40/20 = 3
 * ============================================================ */
const gr5 = (() => {
  const R = rig(2.56), Y0 = R.Y(0);
  const m = .1, zs = 20, zp = 10, zr = 40;
  const RC = 1.5, C = V(2.6, 0);
  const DI = [0, HF, Math.PI, 3 * HF];
  /* 4 个行星轮相隔 90°，齿圈 40 齿、太阳 20 齿都能被 90° 整除，装配相位一致 */
  const PHS = [-1, 0, 1, 0].map(k => k * Math.PI / zp);
  const sunPts = gearPts(zs, m, 0);
  const ringB = ringAt(C.x, Y0, 2.32, 1.9, 2.125, zr, 0, .3, PA.blue, -.02);
  const bolts = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    bolts.push({ t: 'c', rt: .06, h: .12, p: [C.x + 2.24 * Math.cos(a), Y0 + 2.24 * Math.sin(a), .16], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 });
  }
  const carrierB = [
    R.hub(C.x, 0, .44, .2, PA.purpleD, .44),
    R.pin(C.x, 0, .1, 1.5, .3, PA.metalD)
  ];
  DI.forEach(d => {
    const x = C.x + RC * Math.cos(d), y = RC * Math.sin(d);
    carrierB.push(R.rod([C.x, 0], [x, y], .09, PA.purple, .42));
    carrierB.push({ t: 'c', rt: .07, h: .62, p: [x, Y0 + y, .24], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 });
  });

  const planets = DI.map((d, i) => ({
    id: 'p' + (i + 1), n: `行星轮 ${i + 1} z=${zp}`, seq: i + 4,
    pivot: [C.x + RC * Math.cos(d), Y0 + RC * Math.sin(d), 0], out: [0, 0, 1.8 + i * .2],
    hint: '四只行星轮各自套在行星架的销轴上，取下销轴就能拿出',
    b: [
      gearAt(zp, m, C.x + RC * Math.cos(d), Y0 + RC * Math.sin(d), .3, PA.gold, PHS[i]),
      { t: 'c', rt: .16, h: .4, p: [C.x + RC * Math.cos(d), Y0 + RC * Math.sin(d), 0], rot: [HF, 0, 0], c: PA.purpleD, m: .5, ro: .4 }
    ]
  }));

  return {
    id: 'planetary', name: '行星齿轮', group: 'gear', tag: '大减速比',
    summary: '内齿圈固定，太阳轮带动行星架减速输出',
    input: { label: '太阳轮转角', speed: 48 },
    lesson: {
      what: '太阳轮在中间转，四只行星轮一边自转一边绕着太阳轮公转，带着行星架慢慢输出。',
      key: `齿圈固定时 i = 1 + z₂/z₁ = 1 + ${zr}/${zs} = 3，太阳轮转 3 圈行星架才转 1 圈。四只行星轮同时受力，同样体积能传更大的扭矩，而且同轴进出。`,
      where: '汽车自动变速器、风电齿轮箱、机器人关节、挖掘机行走减速器。'
    },
    base: R.base(-0.15, 5.35, [C.x]),
    parts: [
      {
        id: 'sun', n: `太阳轮 z=${zs}`, seq: 1, pivot: [C.x, Y0, 0], out: [0, 0, 2.2],
        hint: '太阳轮在最外侧中心，先拆摇把再取它',
        b: [
          { t: 'pf', pts: sunPts, d: .3, p: [C.x, Y0, 0], c: PA.blue, m: .45, ro: .42 },
          R.hub(C.x, 0, .3, .6, PA.blueD, 0),
          /* 摇把盘与手柄整体挪到行星架轮毂之前，绝不穿进行星架 */
          R.disc(C.x, 0, .5, PA.sky, .08, .6),
          R.rod([C.x + .22, 0], [C.x + .62, 0], .08, PA.red, .7),
          R.pin(C.x + .62, 0, .07, .38, .7, PA.redD),
          R.pin(C.x, 0, .1, 1.2, .2, PA.metalD)
        ]
      },
      {
        id: 'carrier', n: '行星架', seq: 2, pivot: [C.x, Y0, .36], out: [0, 0, 2.0],
        hint: '行星架托着四只行星轮，最后整体取下',
        b: carrierB
      },
      {
        id: 'ring', n: `内齿圈 z=${zr}`, seq: 3, pivot: [C.x, Y0, 0], out: [0, 0, 1.8],
        hint: '齿圈固定在机座上，拆掉四只行星轮后才能取',
        b: [ringB, ...bolts]
      },
      ...planets
    ],
    measure: [{ key: 'carrier', label: '行星架转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const phi = th / 3;
      const out = {
        sun: { r: [0, 0, th] },
        carrier: { r: [0, 0, phi] },
        ring: {},
        n: { carrier: dd(phi) },
        readout: [
          { k: '太阳轮转角', v: dg(th) },
          { k: '行星架转角', v: rd(phi) },
          { k: '传动比 i', v: '3 : 1' }
        ]
      };
      DI.forEach((d, i) => {
        out['p' + (i + 1)] = {
          r: [0, 0, -th],
          p: [RC * (Math.cos(d + phi) - Math.cos(d)), RC * (Math.sin(d + phi) - Math.sin(d)), 0]
        };
      });
      return out;
    }
  };
})();

/* ============================================================
 * 20. 差速器
 *     行星架转速 = 左右半轴平均；左右可反向差速
 * ============================================================ */
const gr6 = (() => {
  const R = rig(1.66), Y0 = R.Y(0);
  const m = .065, zg = 16;
  const CY = Y0, X0 = 2.0, AMP = .75;
  const PX = .55, PY = .52;
  const sL = gearPts(zg, m, 0), sR = gearPts(zg, m, 0);
  const pl = gearPts(zg, m, Math.PI / zg * .5);
  const col = x => [
    { t: 'b', s: [.26, CY - .40, .56], p: [x, .24 + (CY - .40) / 2, 0], c: PA.woodD, ro: .8 },
    /* 轴承环开轴孔：半轴从孔里穿过，环体与被支承轴不再互穿 */
    { t: 'c', rt: .2, h: .3, p: [x, CY, 0], rot: [0, 0, HF], c: PA.woodL, ro: .72, bore: .10 }
  ];
  const side = (sx, pts, c, nm, sg, hint) => ({
    id: nm, n: '半轴锥齿轮', seq: sg, pivot: [X0 + sx, CY, 0], out: [0, 0, 2.0],
    hint: hint,
    b: [
      { t: 'pf', pts, d: .3, p: [X0 + sx, CY, 0], rot: [0, HF, 0], c, m: .45, ro: .42 },
      { t: 'c', rt: .52, rb: .2, h: .5, p: [X0 + sx + Math.sign(sx) * .4, CY, 0], rot: [0, 0, Math.sign(sx) * HF], c, m: .45, ro: .42 },
      { t: 'c', rt: .085, h: .7, p: [X0 + sx + Math.sign(sx) * .95, CY, 0], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .3 },
      { t: 'b', s: [.06, .2, .34], p: [X0 + sx + Math.sign(sx) * 1.24, CY, .18], c: PA.red, ro: .5 }
    ]
  });

  return {
    id: 'differential', name: '差速器', group: 'gear', tag: '差速分流',
    summary: '一个输入，两个输出，可以不等速',
    input: { label: '行星架转角', speed: 46 },
    lesson: {
      what: '转弯时外侧车轮要走更远，差速器让左右半轴自己差速，同时把动力平均分给两边。',
      key: '行星架转角永远等于左右半轴的平均值：φ = (φ左 + φ右)/2。这里让左右各加、减一个正弦量，平均值保持等于行星架转速，画面上能看到一边快一边慢。',
      where: '汽车后桥、四驱分动器、履带车辆转向。'
    },
    /* 两侧立柱外移到半轴锥齿轮背锥（x=0.8/3.2）之外，避免锥齿轮扫到立柱 */
    base: [...R.base(X0 - 1.75, X0 + 1.75, []), ...col(X0 - 1.4), ...col(X0 + 1.4)],
    parts: [
      {
        id: 'carrier', n: '行星架', seq: 1, pivot: [X0, CY, 0], out: [0, 0, 2.2],
        hint: '行星架就是十字轴，先拆摇把再整根抽出',
        b: [
          /* 中央轮毂 */
          { t: 'c', rt: .26, h: .7, p: [X0, CY, 0], rot: [0, 0, HF], c: PA.purpleD, m: .5, ro: .4 },
          { t: 'c', rt: .055, h: 2.24, p: [X0, CY, 0], c: PA.metalD, m: .9, ro: .3 },
          { t: 's', rad: .1, p: [X0, CY + 1.12, 0], c: PA.purpleD },
          { t: 's', rad: .1, p: [X0, CY - 1.12, 0], c: PA.purpleD },
          /* 摇把装在行星架轴线上，径向伸出，避开两只行星锥齿轮 */
          { t: 'b', s: [.1, .1, .62], p: [X0, CY, .34], c: PA.red, ro: .5 },
          { t: 's', rad: .09, p: [X0, CY, .68], c: PA.redD }
        ]
      },
      {
        id: 'plTop', n: `行星锥齿轮 1 z=${zg}`, seq: 2, pivot: [X0, CY, 0], out: [0, 0, 1.9],
        hint: '行星锥齿轮套在十字轴上，取下行星架后就能拿下',
        b: [
          { t: 'pf', pts: pl, d: .3, p: [X0, CY + PY, 0], rot: [HF, 0, 0], c: PA.gold, m: .45, ro: .42, holes: [radiusRing(0, 0, () => .07, 20)] },
          { t: 'c', rt: .5, rb: .26, h: .35, p: [X0, CY + PY + .32, 0], c: PA.gold, m: .45, ro: .42, bore: .07 }
        ]
      },
      {
        id: 'plBot', n: `行星锥齿轮 2 z=${zg}`, seq: 3, pivot: [X0, CY, 0], out: [0, 0, 1.7],
        hint: '另一只行星锥齿轮在下方，和上面那只同轴',
        b: [
          { t: 'pf', pts: pl, d: .3, p: [X0, CY - PY, 0], rot: [HF, 0, 0], c: PA.gold, m: .45, ro: .42, holes: [radiusRing(0, 0, () => .07, 20)] },
          { t: 'c', rt: .26, rb: .5, h: .35, p: [X0, CY - PY - .32, 0], c: PA.gold, m: .45, ro: .42, bore: .07 }
        ]
      },
      side(-PX, sL, PA.blue, 'sideL', 4, '左半轴锥齿轮在左边，先拆下再取行星架'),
      side(PX, sR, PA.teal, 'sideR', 5, '右半轴锥齿轮在右边，最外侧先取')
    ],
    measure: [{ key: 'diff', label: '左右转角差', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const dlt = AMP * Math.sin(th);
      const L = th + dlt, Rr = th - dlt;
      return {
        carrier: { r: [th, 0, 0] },
        plTop: { r: [th, dlt, 0] },
        plBot: { r: [th, dlt, 0] },
        sideL: { r: [L, 0, 0] },
        sideR: { r: [Rr, 0, 0] },
        n: { diff: dd(2 * dlt) },
        readout: [
          { k: '左半轴转角', v: rd(L) },
          { k: '右半轴转角', v: rd(Rr) },
          { k: '左右差速', v: rd(2 * dlt) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 21. 锥齿轮换向
 *     一对 90° 锥齿轮，1:1，换向并改变传动方向
 * ============================================================ */
const gr7 = (() => {
  const R = rig(1.2), Y0 = R.Y(0);
  const m = .1, z = 18, r = z * m / 2;
  const AX = 1.35, AY = Y0 + 1.35, AZ = r;
  const BX = AX + r;
  const gf = gearPts(z, m, 0);

  return {
    id: 'bevelGear', name: '锥齿轮换向', group: 'gear', tag: '直角换向',
    summary: '两根轴成 90°，换个方向接着传',
    input: { label: '输入轮转角', speed: 46 },
    lesson: {
      what: '两只锥齿轮的轴线垂直相交，齿咬在锥面上，把转动从一根轴递给另一根方向的轴。',
      key: '等齿数时 i = 1:1，转速不变、转向按锥面关系改变。两轴必须在空间相交成 90°，否则齿会卡住。',
      where: '手电钻、角磨机、汽车后桥主减速器、机床进给箱。'
    },
    base: [
      ...R.base(-0.6, BX + 1.5, []),
      /* 输入轴支座退到锥齿轮背面，避开锥面扫过的区域；轴承环开轴孔 */
      { t: 'b', s: [.28, AY - .50, .5], p: [AX, .24 + (AY - .50) / 2, -.02], c: PA.woodD, ro: .8 },
      { t: 'c', rt: .2, h: .36, p: [AX, AY, -.02], rot: [HF, 0, 0], c: PA.woodL, ro: .72, bore: .14 },
      { t: 'b', s: [.28, AY - .50, .5], p: [BX + 1.05, .24 + (AY - .50) / 2, 0], c: PA.woodD, ro: .8 },
      { t: 'c', rt: .2, h: .36, p: [BX + 1.05, AY, 0], rot: [0, 0, HF], c: PA.woodL, ro: .72, bore: .17 }
    ],
    parts: [
      {
        id: 'ga', n: `输入锥齿轮 z=${z}`, seq: 1, pivot: [AX, AY, AZ], out: [0, 0, 2.2],
        hint: '输入轮在正面，先拆手摇把再取齿轮',
        b: [
          { t: 'pf', pts: gf, d: .3, p: [AX, AY, AZ], c: PA.blue, m: .45, ro: .42 },
          { t: 'c', rt: .9, rb: .42, h: .5, p: [AX, AY, AZ - .4], rot: [HF, 0, 0], c: PA.blue, m: .45, ro: .42 },
          { t: 'c', rt: .16, h: .72, p: [AX, AY, AZ + .36], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
          /* 背面短轴：坐进后面的轴承座 */
          { t: 'c', rt: .13, h: .58, p: [AX, AY, -.01], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
          R.rod([AX, AY - Y0], [AX + .52, AY - Y0], .08, PA.red, AZ + .74),
          R.pin(AX + .52, AY - Y0, .07, .38, AZ + .74, PA.redD)
        ]
      },
      {
        id: 'gb', n: `输出锥齿轮 z=${z}`, seq: 2, pivot: [BX, AY, 0], out: [0, 0, 2.0],
        hint: '输出轮轴线水平朝右，转过 90° 再抽出来',
        b: [
          { t: 'pf', pts: gearPts(z, m, Math.PI / z * .5), d: .3, p: [BX, AY, 0], rot: [0, HF, 0], c: PA.gold, m: .45, ro: .42 },
          { t: 'c', rt: .9, rb: .42, h: .5, p: [BX + .4, AY, 0], rot: [0, 0, HF], c: PA.gold, m: .45, ro: .42 },
          { t: 'c', rt: .16, h: 1.8, p: [BX + .45, AY, 0], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .3 },
          { t: 'b', s: [.07, .5, .14], p: [BX + 1.38, AY + .26, 0], c: PA.red, ro: .5 },
          { t: 's', rad: .09, p: [BX + 1.38, AY + .52, 0], c: PA.redD }
        ]
      }
    ],
    measure: [{ key: 'out', label: '输出轮转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = -th;
      return {
        ga: { r: [0, 0, th] },
        gb: { r: [a, 0, 0] },
        n: { out: dd(a) },
        readout: [
          { k: '输入轮转角', v: dg(th) },
          { k: '输出轮转角', v: rd(a) },
          { k: '传动比 i', v: '1 : 1' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 22. 谐波减速器
 *     刚轮 z=40 固定、柔轮 z=38，波发生器转一圈柔轮退两齿，i = 19
 * ============================================================ */
const gr8 = (() => {
  const R = rig(2.45), Y0 = R.Y(0);
  const C = V(2.4, 0);
  const zr = 40, zf = 38, aE = 1.9, bE = 1.68;
  const ell = a => aE * bE / Math.hypot(bE * Math.cos(a), aE * Math.sin(a));
  const tRF = teethRF(0, 1, zf, 0);
  /* 柔轮：薄壁椭圆环，外缘带齿 */
  const flexPts = (() => {
    const N = 320, out = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU, rr = ell(a) + .03 + .05 * tRF(a);
      out.push([C.x + rr * Math.cos(a), Y0 + rr * Math.sin(a)]);
    }
    for (let i = N - 1; i >= 0; i--) {
      const a = i / N * TAU, rr = ell(a) - .04;
      out.push([C.x + rr * Math.cos(a), Y0 + rr * Math.sin(a)]);
    }
    return out;
  })();
  /* 波发生器：椭圆凸轮 + 两只滚轮 */
  const gA = 1.62, gB = 1.5;
  const genPts = (() => {
    const out = [];
    for (let i = 0; i < 160; i++) {
      const a = i / 160 * TAU, rr = gA * gB / Math.hypot(gB * Math.cos(a), gA * Math.sin(a));
      out.push([C.x + rr * Math.cos(a), Y0 + rr * Math.sin(a)]);
    }
    return out;
  })();
  const ringB = ringAt(C.x, Y0, 2.2, 1.86, 2.02, zr, 0, .3, PA.blue, -.2);
  const bolts = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    bolts.push({ t: 'c', rt: .055, h: .12, p: [C.x + 2.13 * Math.cos(a), Y0 + 2.13 * Math.sin(a), .02], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 });
  }

  return {
    id: 'harmonic', name: '谐波减速器', group: 'gear', tag: '大减速比',
    summary: '靠薄壁弹性变形咬合，一圈只差两个齿',
    input: { label: '波发生器转角', speed: 58 },
    lesson: {
      what: '椭圆波发生器把柔轮撑成长圆，只在长轴两端与刚轮咬合。波发生器转一圈，柔轮相对刚轮错过两个齿。',
      key: `柔轮比刚轮少 2 齿，所以 i = z柔/(z刚−z柔) = ${zf}/${zr - zf} = ${zf / (zr - zf)}，减速比极大且几乎无侧隙。椭圆长轴是「接触区」，短轴处完全脱开。`,
      where: '机器人关节、机床分度转台、半导体设备、航空航天伺服。'
    },
    base: R.base(-0.2, 5.0, [C.x]),
    parts: [
      {
        id: 'rigid', n: `刚轮 z=${zr}`, seq: 1, pivot: [C.x, Y0, 0], out: [0, 0, 1.6],
        hint: '刚轮固定不动，是最外圈的齿环',
        b: [ringB, ...bolts]
      },
      {
        id: 'flex', n: `柔轮 z=${zf}`, seq: 2, pivot: [C.x, Y0, 0], out: [0, 0, 1.9],
        hint: '柔轮是薄壁杯形件，齿在椭圆外缘上',
        b: [{ t: 'pf', pts: flexPts, d: .24, p: [0, 0, 0], c: PA.gold, m: .4, ro: .45 }]
      },
      {
        id: 'gen', n: '波发生器', seq: 3, pivot: [C.x, Y0, 0], out: [0, 0, 2.2],
        hint: '波发生器是椭圆凸轮，最里侧，最后取下',
        b: [
          { t: 'pf', pts: genPts, d: .5, p: [0, 0, .04], c: PA.purple, m: .3, ro: .5 },
          R.hub(C.x, 0, .34, .62, PA.purpleD, .04),
          R.pin(C.x, 0, .1, .9, .3, PA.metalD),
          /* 滚轮压在椭圆长轴内侧，只与柔轮接触不相穿 */
          { t: 'c', rt: .06, h: .6, p: [C.x + 1.57, Y0, .04], rot: [HF, 0, 0], c: PA.steel, m: .85, ro: .3 },
          { t: 'c', rt: .06, h: .6, p: [C.x - 1.57, Y0, .04], rot: [HF, 0, 0], c: PA.steel, m: .85, ro: .3 },
          R.rod([C.x, 0], [C.x + .6, 0], .08, PA.red, .5),
          R.pin(C.x + .6, 0, .07, .36, .5, PA.redD)
        ]
      }
    ],
    measure: [{ key: 'out', label: '柔轮转角', unit: '°', k: 180 / Math.PI, dec: 1 }],
    pose(th) {
      const genA = 4 * th;
      return {
        rigid: {},
        flex: { r: [0, 0, -2 * genA / zf] },
        gen: { r: [0, 0, genA] },
        n: { out: dd(-2 * genA / zf) },
        readout: [
          { k: '波发生器转角', v: dg(genA) },
          { k: '柔轮转角', v: rd(-2 * genA / zf) },
          { k: '减速比 i', v: `${zf / (zr - zf)} : 1` }
        ]
      };
    }
  };
})();

/* ============================================================
 * 23. 皮带传动
 *     平带开口传动，r₁=0.5 / r₂=0.75，i = 1.5（同向）
 * ============================================================ */
const bd1 = (() => {
  const R = rig(1.5), Y0 = R.Y(0);
  const r1 = .5, r2 = .75, dx = 2.2;
  const A = V(.95, 0), B = V(.95 + dx, 0);
  const AW = V(A.x, Y0), BW = V(B.x, Y0);
  const belt = bandPts(AW, BW, r1, r2, .06, 24);
  const bolts = (x, r, n, c) => {
    const o = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      o.push({ t: 'c', rt: .05, h: .1, p: [x + r * Math.cos(a), Y0 + r * Math.sin(a), .12], rot: [HF, 0, 0], c, m: .8, ro: .3 });
    }
    return o;
  };

  return {
    id: 'beltDrive', name: '皮带传动', group: 'drive', tag: '柔性传动',
    summary: '靠摩擦传递，能缓冲、可远距离',
    input: { label: '主动轮转角', speed: 46 },
    lesson: {
      what: '皮带套在两个带轮上，靠摩擦力把转动从一根轴送到另一根轴，两轮转向相同。',
      key: `带传动比 i = d₂/d₁ = ${r2}/${r1} = ${(r2 / r1).toFixed(2)}，从动轮转速是主动轮的 ${(r1 / r2).toFixed(2)} 倍。皮带靠摩擦工作，过载时会打滑，正好保护机器；但传动比不严格，也不能用在要求精确分度的场合。`,
      where: '电风扇、洗衣机、空压机、汽车正时皮带、拖拉机。'
    },
    base: [...R.base(-.2, 4.4, [A.x, B.x]), { t: 'pf', pts: belt, d: .12, p: [0, 0, -.23], c: PA.dark, m: .1, ro: .85 }],
    parts: [
      {
        id: 'p1', n: '主动带轮', seq: 1, pivot: [A.x, Y0, 0], out: [0, 0, 2.0],
        hint: '主动带轮在左侧，先拆摇把再取轮',
        b: [
          R.disc(A.x, 0, r1, PA.blue, .18, 0),
          R.disc(A.x, 0, r1 + .05, PA.blueD, .05, .12),
          R.disc(A.x, 0, r1 + .05, PA.blueD, .05, -.12),
          R.hub(A.x, 0, .17, .46, PA.blueD, 0),
          ...bolts(A.x, r1 - .16, 4, PA.metalD),
          R.rod([A.x, 0], [A.x + .48, 0], .08, PA.red, .3),
          R.pin(A.x + .48, 0, .07, .38, .3, PA.redD),
          R.pin(A.x, 0, .1, .9, .05, PA.metalD)
        ]
      },
      {
        id: 'p2', n: '从动带轮', seq: 2, pivot: [B.x, Y0, 0], out: [0, 0, 2.2],
        hint: '从动带轮在右侧，皮带要先脱开',
        b: [
          R.disc(B.x, 0, r2, PA.gold, .18, 0),
          R.disc(B.x, 0, r2 + .05, PA.org, .05, .12),
          R.disc(B.x, 0, r2 + .05, PA.org, .05, -.12),
          R.hub(B.x, 0, .2, .48, PA.org, 0),
          ...bolts(B.x, r2 - .18, 6, PA.metalD),
          R.pin(B.x, 0, .1, .95, .05, PA.metalD)
        ]
      }
    ],
    measure: [{ key: 'out', label: '从动轮转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = th * r1 / r2;
      return {
        p1: { r: [0, 0, th] },
        p2: { r: [0, 0, a] },
        n: { out: dd(a) },
        readout: [
          { k: '主动轮转角', v: dg(th) },
          { k: '从动轮转角', v: rd(a) },
          { k: '传动比 i', v: (r2 / r1).toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 24. 链传动
 *     链轮 z=12 / 24，平均传动比精确为 2，两轮同向
 * ============================================================ */
const bd2 = (() => {
  const R = rig(1.5), Y0 = R.Y(0);
  const m = .08, z1 = 12, z2 = 24;
  const r1 = z1 * m / 2, r2 = z2 * m / 2, dx = 2.1;
  const A = V(.95, 0), B = V(.95 + dx, 0);
  const AW = V(A.x, Y0), BW = V(B.x, Y0);
  const links = chainB(AW, BW, r1, r2, 52, .15, .1, PA.metalD);

  return {
    id: 'chainDrive', name: '链传动', group: 'drive', tag: '啮合传动',
    summary: '链条咬住齿，传动比准确不打滑',
    input: { label: '主动链轮转角', speed: 46 },
    lesson: {
      what: '链条一节一节咬进链轮的齿槽里，靠啮合而不是摩擦传力，所以传动比是准的。',
      key: `i = z₂/z₁ = ${z2}/${z1} = 2，两轮转向相同。链传动不打滑、能承受较大拉力、可在远距离和高温油污环境工作，但瞬时速度有微小波动，需要润滑。`,
      where: '自行车、摩托车、工业输送线、发动机正时链、起重机。'
    },
    base: [...R.base(-.2, 4.0, [A.x, B.x])],
    parts: [
      {
        id: 's1', n: `主动链轮 z=${z1}`, seq: 1, pivot: [A.x, Y0, 0], out: [0, 0, 2.0],
        hint: '主动链轮在左侧，链条先脱开再取轮',
        b: [
          { t: 'pf', pts: gearPts(z1, m, 0), d: .16, p: [A.x, Y0, 0], c: PA.blue, m: .6, ro: .38 },
          R.hub(A.x, 0, .18, .4, PA.blueD, 0),
          R.rod([A.x, 0], [A.x + .46, 0], .08, PA.red, .28),
          R.pin(A.x + .46, 0, .07, .36, .28, PA.redD),
          R.pin(A.x, 0, .1, .9, .05, PA.metalD)
        ]
      },
      {
        id: 's2', n: `从动链轮 z=${z2}`, seq: 2, pivot: [B.x, Y0, 0], out: [0, 0, 2.2],
        hint: '从动链轮在右侧，最后取下',
        b: [
          { t: 'pf', pts: gearPts(z2, m, 0), d: .16, p: [B.x, Y0, 0], c: PA.gold, m: .6, ro: .38 },
          R.hub(B.x, 0, .2, .42, PA.org, 0),
          R.disc(B.x, 0, .5, PA.org, .06, .1),
          R.pin(B.x, 0, .1, .95, .05, PA.metalD)
        ]
      },
      {
        id: 'chain', n: '链条', seq: 3, pivot: [B.x - dx / 2, Y0, 0], out: [0, 0, 2.4],
        hint: '链条整圈挂在两个链轮上，最后整体取下',
        b: links
      }
    ],
    measure: [{ key: 'out', label: '从动链轮转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = th * z1 / z2;
      return {
        s1: { r: [0, 0, th] },
        s2: { r: [0, 0, a] },
        chain: {},
        n: { out: dd(a) },
        readout: [
          { k: '主动链轮转角', v: dg(th) },
          { k: '从动链轮转角', v: rd(a) },
          { k: '传动比 i', v: `${z2} : ${z1}` }
        ]
      };
    }
  };
})();

/* ============================================================
 * 25. 锥轮无级变速
 *     摩擦轮沿锥面上下移动，接触半径连续变化 → 传动比连续可变
 * ============================================================ */
const bd3 = (() => {
  const R = rig(1.35), Y0 = R.Y(0);
  const CX = 1.45, CH = 1.3, RB = .9, RT = .3, RR = .2;
  const rAt = y => RB + (RT - RB) * (y + CH / 2) / CH;
  const AMP = .5, R0 = rAt(0);
  /* 纯滚动：滚轮转角 = ∫ r(y)/RR dθ，θ=2π 时正好回到整数圈 */
  const K_ROLL = -(RT - RB) * AMP / (RR * CH);

  return {
    id: 'cvt', name: '锥轮无级变速', group: 'drive', tag: '无级调速',
    summary: '接触半径连续变，转速比也连续变',
    input: { label: '锥轮转角', speed: 52 },
    lesson: {
      what: '摩擦轮贴着锥面滚动，锥面上下移动时接触半径连续改变，输出转速也就连续变化，没有档位。',
      key: `接触半径 r 从 ${rAt(-AMP).toFixed(2)} 变到 ${rAt(AMP).toFixed(2)}，输出与输入的转速比 = r/${RR}，在 ${(rAt(AMP) / RR).toFixed(2)} ~ ${(rAt(-AMP) / RR).toFixed(2)} 之间连续滑动。无级变速器靠的就是「改半径」而不是「换齿轮」。`,
      where: '踏板摩托车、无级变速汽车（CVT）、机床主轴、农机。'
    },
    base: [
      ...R.base(-.2, 3.6, []),
      pillar(CX, -CH / 2, Y0, PA.woodD, 0, .3),
      pillar(2.95, .95, Y0, PA.woodD, 0, .18),
      /* 横臂做成两片夹板，给上下滑动的摩擦轮支撑杆让出中间的槽 */
      { t: 'b', s: [1.05, .12, .06], p: [2.5, Y0 + .95, -.13], c: PA.woodL, ro: .75 },
      { t: 'b', s: [1.05, .12, .06], p: [2.5, Y0 + .95, .13], c: PA.woodL, ro: .75 }
    ],
    parts: [
      {
        id: 'cone', n: '主动锥轮', seq: 1, pivot: [CX, Y0, 0], out: [0, 0, 2.0],
        hint: '锥轮立在中间，先拆顶部的指示盘',
        b: [
          { t: 'c', rt: RT, rb: RB, h: CH, p: [CX, Y0, 0], c: PA.blue, m: .4, ro: .45 },
          { t: 'c', rt: .26, rb: .26, h: .06, p: [CX, Y0 + CH / 2, 0], c: PA.red, m: .3, ro: .5 },
          { t: 'c', rt: .12, h: CH * .8, p: [CX, Y0, 0], c: PA.metalD, m: .9, ro: .3 },
          { t: 'b', s: [.34, .08, .08], p: [CX + .16, Y0 + CH / 2 + .06, 0], c: PA.red, ro: .5 }
        ]
      },
      {
        id: 'roller', n: '摩擦轮', seq: 2, pivot: [CX + R0 + RR, Y0, 0], out: [0, 0, 2.2],
        hint: '摩擦轮压在锥面上，随锥面上下滑动',
        b: [
          /* 球形摩擦轮：任何转角下与锥面都是点接触，不会扫进锥体 */
          { t: 's', rad: RR, p: [CX + R0 + RR, Y0, 0], c: PA.gold, m: .45, ro: .4 },
          { t: 'c', rt: .06, h: 1.5, p: [CX + R0 + RR, Y0 + .75, 0], c: PA.metalD, m: .9, ro: .3 },
          { t: 'b', s: [.06, .05, .06], p: [CX + R0 + RR, Y0 + .2, .17], c: PA.red, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'ratio', label: '瞬时传动比', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const y = AMP * Math.sin(th);
      const rC = rAt(y), ratio = rC / RR;
      const roll = 3 * th - K_ROLL * (1 - Math.cos(th));
      return {
        cone: { r: [0, th, 0] },
        roller: { r: [0, roll, 0], p: [rC - R0, y, 0] },
        n: { ratio },
        readout: [
          { k: '锥轮转角', v: dg(th) },
          { k: '接触半径', v: rC.toFixed(2) },
          { k: '传动比', v: ratio.toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 26. 丝杠螺母
 *     丝杠转、螺母走；位移与转角严格成比例
 * ============================================================ */
const bd4 = (() => {
  const R = rig(1.45), Y0 = R.Y(0);
  const X0 = 1.75, L = 2.6, SY = Y0 + .95, PITCH = .13, TR = 1.3;
  const nx = th => -TR / 2 * Math.cos(th);

  return {
    id: 'leadScrew', name: '丝杠螺母', group: 'drive', tag: '转动→直线',
    summary: '转角与位移成严格比例，可微调',
    input: { label: '丝杠转角', speed: 50 },
    lesson: {
      what: '丝杠转动，螺母被螺纹推着沿轴向移动；丝杠转一圈，螺母正好走一个导程。',
      key: `位移 s = 导程 × 圈数，这里导程 ${PITCH}，螺母在 ±${(TR / 2).toFixed(2)} 之间往复。因为关系严格线性，机床用它做精确进给，还能自锁（螺母推不动丝杠）。`,
      where: '车床溜板箱、3D 打印机 Z 轴、千斤顶、台虎钳、电梯导轨校正。'
    },
    base: [
      ...R.base(-.2, 4.4, []),
      pillar(.4, SY - Y0 - .1, Y0, PA.woodD, 0, .2),
      pillar(3.1, SY - Y0 - .1, Y0, PA.woodD, 0, .2),
      /* 两端轴承座开轴孔：丝杠从孔里穿过 */
      { t: 'pf', pts: [[-.18, -.22], [.18, -.22], [.18, .22], [-.18, .22]], holes: [radiusRing(0, 0, () => .115, 24)], d: .3, p: [.4, SY, 0], rot: [0, HF, 0], c: PA.woodL, ro: .72 },
      { t: 'pf', pts: [[-.18, -.22], [.18, -.22], [.18, .22], [-.18, .22]], holes: [radiusRing(0, 0, () => .115, 24)], d: .3, p: [3.1, SY, 0], rot: [0, HF, 0], c: PA.woodL, ro: .72 },
      { t: 'b', s: [2.4, .1, .5], p: [X0, SY - .42, 0], c: PA.woodL, ro: .75 }
    ],
    parts: [
      {
        id: 'screw', n: '丝杠', seq: 1, pivot: [X0, SY, 0], out: [0, 0, 2.0],
        hint: '丝杠横穿两端轴承座，先拆右端手轮再整根抽出',
        b: [
          { t: 'hd', rad: .2, tube: .052, len: 2.36, turns: 20, p: [X0, SY, 0], c: PA.metal, m: .8, ro: .3 },
          { t: 'c', rt: .1, h: L, p: [X0, SY, 0], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .32 },
          { t: 'c', rt: .09, h: .7, p: [X0 - L / 2 - .32, SY, 0], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .3 },
          { t: 'c', rt: .09, h: .55, p: [X0 + L / 2 + .25, SY, 0], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .3 },
          { t: 'c', rt: .42, h: .1, p: [3.5, SY, 0], rot: [0, 0, HF], c: PA.red, m: .2, ro: .6 },
          { t: 'b', s: [.08, .34, .08], p: [3.5, SY + .2, .18], c: PA.redD, ro: .5 }
        ]
      },
      {
        id: 'nut', n: '螺母', seq: 2, pivot: [X0, SY, 0], out: [0, 0, 2.3],
        hint: '螺母套在丝杠上，顺着导轨整块取下',
        b: [
          /* 螺母内孔大于螺纹外径，螺纹从孔中穿过 */
          { t: 'c', rt: .34, h: .4, p: [X0, SY, 0], rot: [0, 0, HF], c: PA.gold, m: .4, ro: .5, bore: .27 },
          { t: 'b', s: [.3, .16, .4], p: [X0, SY - .38, 0], c: PA.org, ro: .5 },
          { t: 'b', s: [.24, .42, .24], p: [X0, SY + .45, 0], c: PA.gold, ro: .5 },
          { t: 'b', s: [.1, .1, .5], p: [X0, SY + .66, 0], c: PA.red, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'x', label: '螺母位移', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const x = nx(th), phi = TAU * (x + TR / 2) / PITCH;
      return {
        screw: { r: [phi, 0, 0] },
        nut: { p: [x, 0, 0] },
        n: { x },
        readout: [
          { k: '丝杠转角', v: rd(phi, 0) },
          { k: '螺母位移', v: x.toFixed(2) },
          { k: '导程', v: PITCH.toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 27. 万向节
 *     十字轴万向节，轴间角 β=40°，输出角速度周期波动
 * ============================================================ */
const bd5 = (() => {
  const R = rig(1.1), Y0 = R.Y(0);
  const CX = 1.75, CY = Y0 + 1.4, BETA = 40 * Math.PI / 180;
  const cb = Math.cos(BETA), sb = Math.sin(BETA);
  const UX = Math.cos(BETA), UY = Math.sin(BETA);
  const WX = Math.sin(BETA), WY = -Math.cos(BETA);
  const ph2 = th => Math.atan2(Math.sin(th), cb * Math.cos(th));
  const eul = p => {
    const sp = Math.sin(p), cp = Math.cos(p);
    const b = Math.asin(Math.max(-1, Math.min(1, sb * sp)));
    const a = Math.atan2(cb * sp, cp);
    const c = Math.atan2(-(cb * sb * (1 - cp)), cb * cb + sb * sb * cp);
    return [a, b, c];
  };
  const yoke = (sgn, c) => ([
    { t: 'b', s: [.44, .14, .1], p: [CX + UX * .18 + WX * .3 * sgn, CY + UY * .18 + WY * .3 * sgn, 0], rot: [0, 0, BETA], c, m: .5, ro: .42 },
    { t: 'b', s: [.44, .14, .1], p: [CX + UX * .18 - WX * .3 * sgn, CY + UY * .18 - WY * .3 * sgn, 0], rot: [0, 0, BETA], c, m: .5, ro: .42 }
  ]);

  return {
    id: 'universalJoint', name: '万向节', group: 'drive', tag: '变角传动',
    summary: '两轴有夹角也能传，转速忽快忽慢',
    input: { label: '输入轴转角', speed: 50 },
    lesson: {
      what: '十字轴让两根不同方向的轴连在一起转动；轴间角越大，输出轴转得越不均匀。',
      key: '单万向节的输出角速度一圈里快慢各两次：ω₂/ω₁ = cosβ /(cos²φ + cos²β·sin²φ)。所以成对使用（双万向节）并让两端的轴间角相等，才能消掉波动。',
      where: '汽车传动轴、手电钻软轴、农机动力输出、轧机接轴。'
    },
    base: [
      ...R.base(-.3, 4.2, []),
      pillar(.55, 1.2, Y0, PA.woodD, 0, .2),
      { t: 'c', rt: .2, h: .3, p: [.55, CY, 0], rot: [0, 0, HF], c: PA.woodL, ro: .72, bore: .12 },
      /* 输出轴支座前移到轴中段，把轴端摇把让到支座之外 */
      pillar(2.61, 1.91, Y0, PA.woodD, 0, .18),
      { t: 'c', rt: .2, h: .3, p: [2.61, CY + UY * 1.1, 0], rot: [0, 0, BETA - HF], c: PA.woodL, ro: .72, bore: .12 }
    ],
    parts: [
      {
        id: 'inp', n: '输入轴叉', seq: 1, pivot: [CX, CY, 0], out: [0, 0, 2.0],
        hint: '输入轴叉带摇把，先拆摇把再抽出轴',
        b: [
          R.rod([CX - 1.25, CY - Y0], [CX - .35, CY - Y0], .11, PA.blue, 0),
          { t: 'c', rt: .17, h: .34, p: [CX - .38, CY, 0], rot: [0, 0, HF], c: PA.blueD, m: .5, ro: .4 },
          { t: 'b', s: [.4, .14, .1], p: [CX - .12, CY, .3], c: PA.blue, m: .5, ro: .42 },
          { t: 'b', s: [.4, .14, .1], p: [CX - .12, CY, -.3], c: PA.blue, m: .5, ro: .42 },
          R.rod([CX - .9, CY - Y0], [CX - .9, CY - Y0 + .46], .07, PA.red, .24),
          R.pin(CX - .9, CY - Y0 + .46, .07, .34, .24, PA.redD)
        ]
      },
      {
        id: 'cross', n: '十字轴', seq: 2, pivot: [CX, CY, 0], out: [0, 0, 2.4],
        hint: '十字轴是核心件，四个轴颈分别插进两侧轴叉',
        b: [
          { t: 's', rad: .13, p: [CX, CY, 0], c: PA.metal, m: .85, ro: .28 },
          /* 轴颈止于两侧叉头轴承内端面，不再穿过叉臂 */
          { t: 'c', rt: .055, h: .44, p: [CX, CY, 0], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
          { t: 'c', rt: .055, h: .36, p: [CX, CY, 0], rot: [0, 0, Math.PI + BETA], c: PA.metalD, m: .9, ro: .3 }
        ]
      },
      {
        id: 'out', n: '输出轴叉', seq: 3, pivot: [CX, CY, 0], out: [0, 0, 2.2],
        hint: '输出轴斜向上 40°，最后取下',
        b: [
          R.rod([CX + UX * .2, CY - Y0 + UY * .2], [CX + UX * 1.55, CY - Y0 + UY * 1.55], .11, PA.gold, 0),
          ...yoke(1, PA.gold), ...yoke(-1, PA.gold),
          { t: 'b', s: [.1, .44, .1], p: [CX + UX * 1.5, CY + UY * 1.5, 0], rot: [0, 0, BETA], c: PA.red, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'out', label: '输出轴转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const p2 = ph2(th);
      const w = cb / (Math.cos(th) * Math.cos(th) + cb * cb * Math.sin(th) * Math.sin(th));
      const [a, b, c] = eul(p2);
      return {
        inp: { r: [th, 0, 0] },
        cross: { r: [th, 0, 0] },
        out: { r: [a, b, c] },
        n: { out: dd(p2) },
        readout: [
          { k: '输入转角', v: dg(th) },
          { k: '输出转角', v: rd(p2) },
          { k: '瞬时角速比', v: w.toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 28. 超越离合器
 *     内圈往复，外圈只在“驱动方向”跟着走，反向时脱开
 * ============================================================ */
const bd6 = (() => {
  const R = rig(1.55), Y0 = R.Y(0);
  const Z = 12, STEP = TAU / Z, C0 = V(1.7, 0);
  const starPts = radiusRing(0, 0, ratchetRF(.42, .62, Z, 0), 240);
  const ringB = {
    t: 'pf',
    pts: radiusRing(0, 0, () => 1.02, 120),
    holes: [radiusRing(0, 0, () => .63, 90)],
    d: .3, p: [C0.x, Y0, 0], c: PA.blue, m: .4, ro: .45
  };
  const pawl = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU + .5;
    pawl.push({ t: 'b', s: [.22, .09, .24], p: [C0.x + .72 * Math.cos(a), Y0 + .72 * Math.sin(a), .18], rot: [0, 0, a - .5], c: PA.steel, m: .7, ro: .3 });
  }
  const bolt = [];
  for (let i = 0; i < 12; i++) {
    const a = i / Z * TAU;
    bolt.push({ t: 'c', rt: .045, h: .1, p: [C0.x + .88 * Math.cos(a), Y0 + .88 * Math.sin(a), .16], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 });
  }

  return {
    id: 'overrunClutch', name: '超越离合器', group: 'drive', tag: '单向传动',
    summary: '一个方向咬住，反方向空转',
    input: { label: '内圈转角', speed: 50 },
    lesson: {
      what: '内圈朝驱动方向转时，楔块或棘爪咬住外圈一起走；内圈反向时爪松开，外圈不跟着退。',
      key: '内圈正反摆动，外圈只前进不后退，每周期前进 4 个齿（约 120°）。所以它既能单向传动，又能「超越」——输出比输入快时自动脱开，不会互相别住。',
      where: '自行车飞轮、起动机、自动变速器单向离合器、洗衣机、卷扬防坠。'
    },
    base: [
      ...R.base(-.3, 3.7, [C0.x]),
      { t: 'c', rt: 1.12, h: .06, p: [C0.x, Y0, -.32], rot: [HF, 0, 0], c: PA.woodL, m: 0, ro: .8 }
    ],
    parts: [
      {
        id: 'ring', n: '外圈（输出）', seq: 1, pivot: [C0.x, Y0, 0], out: [0, 0, 2.0],
        hint: '外圈套在最外面，先取下它才能看到内圈',
        b: [ringB, ...pawl, ...bolt]
      },
      {
        id: 'inner', n: '内圈（输入）', seq: 2, pivot: [C0.x, Y0, 0], out: [0, 0, 2.2],
        hint: '内圈是棘轮星轮，最后取下',
        b: [
          { t: 'pf', pts: starPts, d: .3, p: [C0.x, Y0, 0], c: PA.gold, m: .5, ro: .4 },
          R.hub(C0.x, 0, .26, .5, PA.org, 0),
          R.rod([C0.x, 0], [C0.x + .5, 0], .08, PA.red, .3),
          R.pin(C0.x + .5, 0, .07, .38, .3, PA.redD),
          R.pin(C0.x, 0, .1, 1.0, .05, PA.metalD)
        ]
      }
    ],
    measure: [{ key: 'out', label: '外圈转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const s = smooth(th / Math.PI);
      const inn = -4 * STEP * (1 - Math.cos(th)) / 2;
      const outA = -4 * STEP * s;
      return {
        ring: { r: [0, 0, outA] },
        inner: { r: [0, 0, inn] },
        n: { out: dd(outA) },
        readout: [
          { k: '内圈转角', v: rd(inn) },
          { k: '外圈转角', v: rd(outA) },
          { k: '状态', v: th % TAU < Math.PI ? '接合' : '超越脱开' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 29. 离心调速器
 *     转速升高，飞球外张、套筒下移
 * ============================================================ */
const bd7 = (() => {
  const R = rig(2.15), Y0 = R.Y(0);
  const CX = 1.65, HY = Y0 + 1.8, LA = 1.02;
  const A0 = .66;
  const rp = th => .5 + .3 * ((2 + .55 * Math.cos(th)) - 1.45) / 1.1;
  const armB = sg => {
    const c = sg > 0 ? PA.blue : PA.teal, z = sg * .09;
    const S0 = .13;                                   // 杆根外移，给铰点轴套让位
    return [
      /* 铰点处做带孔轴套，套在机架铰轴上——臂是「装上去」的，不是悬空的 */
      { t: 'c', rt: .12, h: .1, p: [CX, HY, z], rot: [HF, 0, 0], bore: .058, c, m: .3, ro: .45 },
      /* 左右两臂各占一个 z 平面，共铰一点但不互穿 */
      R.rod([CX + sg * S0 * Math.sin(A0), HY - Y0 - S0 * Math.cos(A0)],
        [CX + sg * LA * Math.sin(A0), HY - Y0 - LA * Math.cos(A0)], .07, c, z),
      { t: 's', rad: .21, p: [CX + sg * LA * Math.sin(A0), HY - LA * Math.cos(A0), z], c: PA.gold, m: .4, ro: .4 },
      { t: 'b', s: [.08, .3, .08], p: [CX + sg * LA * .55 * Math.sin(A0), HY - LA * .55 * Math.cos(A0), z], rot: [0, 0, sg * A0], c: PA.steel, m: .7, ro: .3 }
    ];
  };

  return {
    id: 'flyballGovernor', name: '离心调速器', group: 'drive', tag: '自动调速',
    summary: '转速一高，飞球外张自动收油门',
    input: { label: '主轴转角', speed: 54 },
    lesson: {
      what: '飞球随主轴旋转，转速越高离心力越大，球往外张，套筒沿主轴上移，再通过杠杆关小油门。',
      key: '飞球张角随转速变化，套筒位移又与张角对应：转速升高 → 张角变大 → 套筒上移 → 油门关小 → 转速回落。这是最早的自动反馈控制，瓦特用它稳定蒸汽机转速。',
      where: '蒸汽机调速、柴油机调速器、老式离心式限速器。'
    },
    base: [
      ...R.base(-.35, 3.65, [CX]),
      /* 立柱退到盘面扫掠范围（z ±0.43）之外，顶部支臂把主轴顶端挑住 */
      pillar(CX, HY + .26 - Y0, Y0, PA.woodD, -.64, .18),
      { t: 'b', s: [.14, .12, .64], p: [CX, HY + .2, -.31], c: PA.woodD, ro: .8 },
      /* 顶臂下挂耳座，耳座里穿铰轴，两根飞球臂就吊在这根轴上 */
      { t: 'b', s: [.14, .22, .18], p: [CX, HY + .13, -.30], c: PA.woodD, ro: .8 },
      { t: 'c', rt: .05, h: .52, p: [CX, HY, -.12], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
      /* 主轴分两段：下段从底板顶到驱动盘底面，上段从盘顶顶到铰点，套筒沿上段滑动 */
      { t: 'c', rt: .055, h: 2.2, p: [CX, 1.34, 0], rot: [0, 0, 0], c: PA.metalD, m: .9, ro: .3 },
      { t: 'c', rt: .05, h: 1.39, p: [CX, 3.255, 0], rot: [0, 0, 0], c: PA.metalD, m: .9, ro: .3 }
    ],
    parts: [
      {
        id: 'armL', n: '左飞球臂', seq: 1, pivot: [CX, HY, 0], out: [0, 0, 2.0],
        hint: '两根飞球臂都铰在主轴顶端',
        b: armB(-1)
      },
      {
        id: 'armR', n: '右飞球臂', seq: 2, pivot: [CX, HY, 0], out: [0, 0, 2.2],
        hint: '右臂与左臂对称',
        b: armB(1)
      },
      {
        id: 'sleeve', n: '套筒', seq: 3, pivot: [CX, HY - LA * Math.cos(A0) - .3, 0], out: [0, 0, 2.4],
        hint: '套筒套在主轴上上下滑动，靠它去带动油门杠杆',
        b: [
          { t: 'c', rt: .26, h: .3, p: [CX, HY - LA * Math.cos(A0) - .3, 0], bore: .07, c: PA.purpleD, m: .4, ro: .45 },
          { t: 'b', s: [.1, .1, .5], p: [CX + .3, HY - LA * Math.cos(A0) - .3, .18], c: PA.red, ro: .5 }
        ]
      },
      {
        id: 'drive', n: '驱动盘', seq: 4, pivot: [CX, Y0 + .35, 0], out: [0, 0, 2.6],
        hint: '驱动盘由外部动力带动，负责让飞球获得转速',
        b: [
          { t: 'c', rt: .5, h: .12, p: [CX, Y0 + .35, 0], c: PA.purple, m: .4, ro: .45 },
          ...[-1, 0, 1].map(k => ({ t: 'b', s: [.86, .06, .12], p: [CX, Y0 + .35, 0], rot: [0, k * Math.PI / 3, 0], c: PA.purpleL, ro: .5 }))
        ]
      }
    ],
    measure: [{ key: 'alpha', label: '飞球张角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const al = rp(th);
      const dy = -LA * (Math.cos(al) - Math.cos(A0));
      return {
        armL: { r: [0, 0, -(al - A0)] },
        armR: { r: [0, 0, al - A0] },
        sleeve: { p: [0, dy, 0] },
        drive: { r: [0, 2 * th, 0] },
        n: { alpha: al },
        readout: [
          { k: '主轴转角', v: dg(th) },
          { k: '飞球张角', v: rd(al) },
          { k: '套筒位移', v: dy.toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 30. 杠杆
 *     支点在中间，动力臂 1.72 / 阻力臂 0.66，摆角 ±17°
 * ============================================================ */
const cp1 = (() => {
  const R = rig(1.72), Y0 = R.Y(0);
  const F = V(1.95, 0), AE = 1.72, AL = 0.66, AMP = .30;
  const EP = V(F.x - AE, 0), LP = V(F.x + AL, 0);
  const aAt = th => AMP * Math.sin(th);
  /* 杠杆转过 a 后，杆上某点的世界位移 */
  const shift = (p, a) => {
    const dx = p.x - F.x, dy = p.y - F.y;
    return [dx * Math.cos(a) - dy * Math.sin(a) - dx, dx * Math.sin(a) + dy * Math.cos(a) - dy];
  };

  return {
    id: 'lever', name: '杠杆', group: 'clamp', tag: '省力',
    summary: '力臂越长越省力，但要多走距离',
    input: { label: '杠杆摆角', speed: 46 },
    lesson: {
      what: '一根硬杆架在支点上：短臂挂重物，长臂挂配重。长臂只要压一点点，短臂上的重物就被抬起来。',
      key: `力矩平衡：F₁·L₁ = F₂·L₂。这里动力臂 ${AE}、阻力臂 ${AL}，力臂比 ${(AE / AL).toFixed(2)}，所以只需 ${(AL / AE).toFixed(2)} 倍的力就能顶起重物，代价是动力端要多走 ${(AE / AL).toFixed(2)} 倍的距离。`,
      where: '撬棍、秤杆、开瓶器、剪刀、人体的前臂骨骼。'
    },
    base: R.base(-.05, 3.05, [F.x]),
    parts: [
      {
        id: 'bar', n: '杠杆（硬杆）', seq: 1, pivot: [F.x, Y0, 0], out: [0, 0, 2.0],
        hint: '硬杆架在中间支点上，先取下两端挂件再抬杆',
        b: [
          R.box(1.42, 0, 2.46, .15, .3, PA.org, 0),
          R.box(1.42, .085, 2.46, .04, .22, PA.yellow, 0, .5),
          R.disc(F.x, 0, .17, PA.steel, .22, -.02),
          R.hub(F.x, 0, .1, .34, PA.metalD, 0),
          R.pin(F.x, 0, .055, .46, 0, PA.metalD),
          { t: 'c', rt: .07, h: .1, p: [EP.x + .1, Y0, .2], rot: [HF, 0, 0], c: PA.red, m: .3, ro: .5 },
          { t: 'b', s: [.1, .1, .04], p: [LP.x, Y0, .18], c: PA.redD, ro: .5 }
        ]
      },
      {
        id: 'load', n: '重物（阻力端）', seq: 2, pivot: [F.x, Y0, 0], out: [0, 0, 2.2],
        hint: '重物挂在短臂一端，靠它被抬起',
        b: [
          R.rod([LP.x, -.08], [LP.x, -.36], .035, PA.metalD, 0),
          { t: 'c', rt: .09, h: .12, p: [LP.x, Y0 - .4, 0], rot: [HF, 0, 0], c: PA.metal, m: .8, ro: .3 },
          { t: 'b', s: [.46, .34, .34], p: [LP.x, Y0 - .64, 0], c: PA.blue, ro: .6 },
          { t: 'b', s: [.1, .36, .36], p: [LP.x - .2, Y0 - .64, 0], c: PA.blueD, ro: .6 },
          { t: 'b', s: [.1, .36, .36], p: [LP.x + .2, Y0 - .64, 0], c: PA.blueD, ro: .6 }
        ]
      },
      {
        id: 'effort', n: '配重（动力端）', seq: 3, pivot: [F.x, Y0, 0], out: [0, 0, 2.4],
        hint: '动力端挂小配重，它一沉，重物那头就翘起来',
        b: [
          R.rod([EP.x, -.08], [EP.x, -.28], .035, PA.metalD, 0),
          { t: 'c', rt: .07, h: .1, p: [EP.x, Y0 - .32, 0], rot: [HF, 0, 0], c: PA.metal, m: .8, ro: .3 },
          { t: 'b', s: [.3, .26, .26], p: [EP.x, Y0 - .48, 0], c: PA.red, ro: .6 },
          { t: 'c', rt: .045, h: .3, p: [EP.x, Y0 - .48, .14], rot: [HF, 0, 0], c: PA.redD, m: .3, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'lift', label: '重物升降', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const a = aAt(th), pl = shift(LP, a);
      return {
        bar: { r: [0, 0, a] },
        /* 挂件与硬杆刚性固定：绕同一支点转同一角度，相对位置恒定 */
        load: { r: [0, 0, a] },
        effort: { r: [0, 0, a] },
        n: { lift: pl[1] },
        readout: [
          { k: '杠杆摆角', v: rd(a) },
          { k: '重物升降', v: pl[1].toFixed(2) },
          { k: '力臂比', v: (AE / AL).toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 31. 滑轮组
 *     一动一定，两根绳承重：绳走 2 倍，物升 1 倍，力减半
 * ============================================================ */
const cp2 = (() => {
  const R = rig(1.65), Y0 = R.Y(0);
  const CX = 1.92, FX = 2.52, RP = .30;
  const TM = 1.25, TOP = Y0 + TM;      // 定滑轮中心：TM 为机构坐标，TOP 为世界坐标
  const XA = CX - RP, XM = CX + RP, XF = FX + RP;
  const DY = .12;                      // 吊物升程 ±
  const rope = (x, y0, y1) => R.rod([x, y0], [x, y1], .028, PA.cream, 0);
  /* 滑轮做出绳槽：轮芯半径 = RP - 绳半径，两侧挡边到 RP，绳正好落在槽里不穿实体 */
  const groove = (cx, cy, c1, c2) => [
    { t: 'c', rt: RP - .028, h: .16, p: [cx, cy, 0], rot: [HF, 0, 0], c: c1, m: .35, ro: .45 },
    { t: 'c', rt: RP, h: .05, p: [cx, cy, .105], rot: [HF, 0, 0], c: c2, m: .35, ro: .45 },
    { t: 'c', rt: RP, h: .05, p: [cx, cy, -.105], rot: [HF, 0, 0], c: c2, m: .35, ro: .45 }
  ];
  const guard = (cx, cy, a0, a1, rOut = .375) =>
    prof(sectorRing(cx, cy, .295, rOut, a0, a1, 22), .06, PA.metal, .15, { m: .7, ro: .42 });

  return {
    id: 'pulleyBlock', name: '滑轮组', group: 'clamp', tag: '省力',
    summary: '动滑轮把绳力减半，绳程加倍',
    input: { label: '拉绳行程', speed: 46 },
    lesson: {
      what: '绳索一端系在横梁上，绕过动滑轮后再绕过定滑轮向下拉。吊物挂在动滑轮上，所以是两段绳子一起承担重量。',
      key: `理想情况下每段绳承担 G/2，所以提拉力减半；代价是绳要拉出 2 倍行程：s_绳 = 2·s_物。定滑轮只改变方向、不省力；动滑轮才省力。滑轮越多，省力越多，但绳程也越长。`,
      where: '吊车、窗帘绳、旗杆绳、健身器械、电梯的配重滑轮。'
    },
    base: [
      ...R.base(.35, 3.7, []),
      pillar(1.15, TM + .32, Y0, PA.woodD, -.34, .14),
      pillar(3.2, TM + .32, Y0, PA.woodD, -.34, .14),
      { t: 'b', s: [2.25, .16, .34], p: [2.18, TOP + .24, -.34], c: PA.wood, ro: .8 },
      { t: 'b', s: [.16, .34, .1], p: [FX, TOP + .06, -.2], c: PA.woodD, ro: .8 },
      { t: 'c', rt: .05, h: .5, p: [FX, TOP, -.1], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
      guard(FX, TOP, -.95, .12, .45),
      rope(XA, TM - .02, 0),
      rope(XM, 0, TM),
      { t: 'c', rt: .07, h: .12, p: [XA, TOP - .06, 0], rot: [HF, 0, 0], c: PA.red, m: .3, ro: .5 }
    ],
    parts: [
      {
        id: 'fixed', n: '定滑轮', seq: 1, pivot: [FX, TOP, 0], out: [0, 0, 2.0],
        hint: '定滑轮挂在横梁下，只改方向不省力，先取下它',
        b: [
          ...groove(FX, TOP, PA.blue, PA.blue),
          { t: 'c', rt: .1, h: .34, p: [FX, TOP, 0], rot: [HF, 0, 0], c: PA.blueD, m: .6, ro: .35 },
          { t: 'b', s: [.1, .1, .3], p: [FX, TOP + .19, 0], c: PA.red, ro: .5 }
        ]
      },
      {
        id: 'move', n: '动滑轮', seq: 2, pivot: [CX, Y0, 0], out: [0, 0, 2.2],
        hint: '动滑轮跟着吊物一起上下，正是它省了力',
        b: [
          ...groove(CX, Y0, PA.gold, PA.gold),
          { t: 'c', rt: .1, h: .34, p: [CX, Y0, 0], rot: [HF, 0, 0], c: PA.org, m: .5, ro: .4 },
          { t: 'b', s: [.1, .1, .3], p: [CX, Y0 - .19, 0], c: PA.red, ro: .5 }
        ]
      },
      {
        id: 'block', n: '吊架与吊物', seq: 3, pivot: [CX, Y0, 0], out: [0, 0, 2.4],
        hint: '吊架罩住动滑轮，下挂钩上吊重物',
        b: [
          guard(CX, Y0, -3.5, .35),
          { t: 'b', s: [.9, .12, .2], p: [CX, Y0 - .36, 0], c: PA.metalD, m: .6, ro: .4 },
          R.rod([CX, -.42], [CX, -.58], .045, PA.metalD, 0),
          { t: 'o', rad: .1, tube: .035, p: [CX, Y0 - .62, 0], rot: [HF, 0, 0], c: PA.metal, m: .85, ro: .3 },
          R.rod([CX, -.72], [CX, -.82], .035, PA.metalD, 0),
          { t: 'b', s: [.62, .38, .4], p: [CX, Y0 - 1.02, 0], c: PA.org, ro: .6 },
          { t: 'b', s: [.64, .08, .42], p: [CX, Y0 - .85, 0], c: PA.yellow, ro: .55 },
          { t: 'b', s: [.08, .4, .42], p: [CX - .3, Y0 - 1.02, 0], c: PA.woodD, ro: .6 },
          { t: 'b', s: [.08, .4, .42], p: [CX + .3, Y0 - 1.02, 0], c: PA.woodD, ro: .6 }
        ]
      },
      {
        id: 'tail', n: '拉绳（自由端）', seq: 4, pivot: [XF, TOP, 0], out: [0, 0, 2.6],
        hint: '自由端绕过定滑轮垂下来，拉它就能提物',
        b: [
          R.rod([XF, TM - .1], [XF, -.85], .028, PA.cream, 0),
          { t: 'b', s: [.18, .26, .2], p: [XF, .82, 0], c: PA.red, ro: .55 },
          { t: 'c', rt: .05, h: .18, p: [XF, .95, 0], rot: [HF, 0, 0], c: PA.redD, m: .3, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'lift', label: '吊物升程', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const dy = DY * Math.sin(th), pull = 2 * dy;
      return {
        fixed: { r: [0, 0, -pull / RP] },
        move: { r: [0, 0, dy / RP], p: [0, dy, 0] },
        block: { p: [0, dy, 0] },
        tail: { p: [0, -pull, 0] },
        n: { lift: dy },
        readout: [
          { k: '拉出绳长', v: pull.toFixed(2) },
          { k: '吊物升程', v: dy.toFixed(2) },
          { k: '省力倍数', v: '2.0' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 32. 剪式升降
 *     两级菱形剪叉，折叠角 23°~54°，平台随之升降
 * ============================================================ */
const cp3 = (() => {
  const L = .72, PH0 = .40, PH1 = .95, CX = 1.75;
  const R = rig(.58), Y0 = R.Y(0);
  const A0 = L * Math.cos(PH0), S0 = 2 * L * Math.sin(PH0), TOP0 = 2 * S0;
  const phi = th => (PH0 + PH1) / 2 - (PH1 - PH0) / 2 * Math.cos(th);
  const linkB = (x0, y0, ang, c, z = 0) => {
    const x1 = x0 + 2 * L * Math.cos(ang), y1 = y0 + 2 * L * Math.sin(ang);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    return [
      R.rod([x0, y0], [x1, y1], .075, c, z),
      /* 交叉中心轴套分层：上下两组杆各占一个 z 平面，中间的销贯穿两者 */
      { t: 'c', rt: .13, h: .16, p: [mx, Y0 + my, z], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 },
      R.pin(x0, y0, .07, .44, 0, PA.metal),
      R.pin(x1, y1, .07, .44, 0, PA.metal)
    ];
  };

  return {
    id: 'scissorLift', name: '剪式升降', group: 'clamp', tag: '升降',
    summary: '交叉杆件越立越直，平台就升得越高',
    input: { label: '剪叉折叠角', speed: 42 },
    lesson: {
      what: '两组交叉的杆件像剪刀一样张合：底端靠拢，剪叉就立起来，平台被顶高。级数越多，升程越大。',
      key: `每一级菱形升高 2L·sinφ，n 级就是 2nL·sinφ。这里 L=${L}、两级，φ 从 23° 到 54°，平台高度从 ${(4 * L * Math.sin(PH0)).toFixed(2)} 变到 ${(4 * L * Math.sin(PH1)).toFixed(2)}。底部用丝杆或油缸把两个下铰点拉近，就能控制升降。`,
      where: '剪式升降平台、千斤顶、折叠晾衣架、汽车举升机、登机桥。'
    },
    base: [
      ...R.base(.35, 3.15, []),
      /* 底板压低、减薄，让下撑杆端销落座而不埋进板里；
       * 加厚成台座一直坐到主底板上，不再悬空 */
      { t: 'b', s: [1.66, .25, .8], p: [CX, Y0 - .215, 0], c: PA.woodL, ro: .78 },
      pillar(.86, 0, Y0, PA.woodD, -.46, .16),
      pillar(2.64, 0, Y0, PA.woodD, -.46, .16)
    ],
    parts: [
      {
        id: 'l1a', n: '下左撑杆', seq: 1, pivot: [CX - A0, Y0, 0], out: [0, 0, 2.0],
        hint: '两根下撑杆交叉铰接，下端骑在底座的滑轨上',
        b: linkB(CX - A0, 0, PH0, PA.blue, -.10)
      },
      {
        id: 'l1b', n: '下右撑杆', seq: 2, pivot: [CX + A0, Y0, 0], out: [0, 0, 2.0],
        hint: '右下撑杆与左下撑杆在中点交叉',
        b: linkB(CX + A0, 0, Math.PI - PH0, PA.blue, .10)
      },
      {
        id: 'l2a', n: '上左撑杆', seq: 3, pivot: [CX + A0, Y0 + S0, 0], out: [0, 0, 2.2],
        hint: '第二级撑杆架在第一级的铰点上，再撑起平台',
        b: linkB(CX + A0, S0, Math.PI - PH0, PA.gold, .10)
      },
      {
        id: 'l2b', n: '上右撑杆', seq: 4, pivot: [CX - A0, Y0 + S0, 0], out: [0, 0, 2.2],
        hint: '第二级撑杆与平台铰接，顶起整块台面',
        b: linkB(CX - A0, S0, PH0, PA.gold, -.10)
      },
      {
        id: 'platform', n: '平台', seq: 5, pivot: [CX, Y0 + TOP0, 0], out: [0, 0, 2.4],
        hint: '平台在最上面，随剪叉张合而升降',
        b: [
          { t: 'b', s: [1.56, .1, .66], p: [CX, Y0 + TOP0 + .12, 0], c: PA.woodL, ro: .74 },
          { t: 'b', s: [1.62, .05, .72], p: [CX, Y0 + TOP0 + .19, 0], c: PA.yellow, ro: .6 },
          { t: 'b', s: [1.5, .07, .07], p: [CX, Y0 + TOP0 + .59, -.3], c: PA.metalD, ro: .4 },
          { t: 'b', s: [.07, .4, .07], p: [CX - .72, Y0 + TOP0 + .39, -.3], c: PA.metalD, ro: .4 },
          { t: 'b', s: [.07, .4, .07], p: [CX + .72, Y0 + TOP0 + .39, -.3], c: PA.metalD, ro: .4 },
          { t: 'b', s: [.5, .3, .38], p: [CX, Y0 + TOP0 + .35, .06], c: PA.blue, ro: .6 },
          { t: 'b', s: [.52, .06, .4], p: [CX, Y0 + TOP0 + .51, .06], c: PA.blueD, ro: .5 }
        ]
      }
    ],
    measure: [{ key: 'height', label: '平台高度', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const p = phi(th), d = p - PH0;
      const a = L * Math.cos(p), dS = 2 * L * (Math.sin(p) - Math.sin(PH0));
      const hgt = TOP0 + 2 * dS;
      return {
        l1a: { r: [0, 0, d], p: [A0 - a, 0, 0] },
        l1b: { r: [0, 0, -d], p: [a - A0, 0, 0] },
        l2a: { r: [0, 0, -d], p: [a - A0, dS, 0] },
        l2b: { r: [0, 0, d], p: [A0 - a, dS, 0] },
        platform: { p: [0, 2 * dS, 0] },
        n: { height: hgt },
        readout: [
          { k: '折叠角', v: rd(p) },
          { k: '平台高度', v: hgt.toFixed(2) },
          { k: '剪叉级数', v: '2 级' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 33. 卷簧蓄能
 *     上弦两圈存能，放能时发条盒带小齿轮转 5.3 圈
 * ============================================================ */
const cp4 = (() => {
  const R = rig(1.35), Y0 = R.Y(0);
  const CX = 1.5, CY = Y0;
  const m = .045, Z1 = 40, Z2 = 12, R1 = Z1 * m / 2, R2 = Z2 * m / 2;
  const PX = CX + R1 + R2;
  const s1 = TAU / Z1, s2 = TAU / Z2;
  const WIND = 2, OUT = 1.6;                       // 上弦圈数 / 发条盒放能圈数
  /* 平面涡卷：r 从 r0 线性长到 r1，带宽 w */
  const spiralPts = (r0, r1, turns, w, n = 320) => {
    const out = [], inn = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * turns * TAU, r = r0 + (r1 - r0) * t;
      out.push([CX + (r + w) * Math.cos(a), CY + (r + w) * Math.sin(a)]);
      inn.push([CX + (r - w) * Math.cos(a), CY + (r - w) * Math.sin(a)]);
    }
    return out.concat(inn.reverse());
  };
  const ratchetPts = radiusRing(CX, CY, ratchetRF(.36, .44, 14, 0), 200);

  return {
    id: 'springStore', name: '卷簧蓄能', group: 'clamp', tag: '储能',
    summary: '上弦时把能量存在发条里，再慢慢放出来',
    input: { label: '上弦转角', speed: 44 },
    lesson: {
      what: '发条是一根卷紧的钢带：上弦时外端被拉着往里卷，弹性变形把能量存起来；松手后它要恢复原状，就带着发条盒和小齿轮一起转。',
      key: `上弦 ${WIND} 圈存下的能量，放出时发条盒倒转 ${OUT} 圈，经齿数比 z₁/z₂ = ${Z1}/${Z2} = ${(Z1 / Z2).toFixed(2)} 放大，带动小齿轮转 ${(OUT * Z1 / Z2).toFixed(2)} 圈。棘轮棘爪在上弦时打滑、放能时顶住，所以只能按一个方向上弦。`,
      where: '机械钟表、八音盒、发条玩具、安全带卷收器、手摇发电机。'
    },
    base: [
      ...R.base(.2, 3.45, []),
      pillar(CX, -0.39, Y0, PA.woodD, -.56, .2),
      pillar(PX, 0, Y0, PA.woodD, -.5, .16),
      /* 两根支承轴只顶到零件背面为止，不再伸进盒体/轮毂实体 */
      { t: 'c', rt: .12, h: .24, p: [CX, CY, -.58], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
      { t: 'c', rt: .1, h: .28, p: [PX, CY, -.38], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
      pillar(CX - .72, -.5, Y0, PA.woodD, -.52, .14)
    ],
    parts: [
      {
        id: 'drum', n: `发条盒 z=${Z1}`, seq: 1, pivot: [CX, CY, 0], out: [0, 0, 2.0],
        hint: '发条盒是带外齿的鼓形盒，发条就盘在里面',
        b: [
          gearAt(Z1, m, CX, CY, .34, PA.gold, -s1 / 2),
          { t: 'c', rt: R1 - .08, h: .1, p: [CX, CY, .18], rot: [HF, 0, 0], c: PA.org, m: .3, ro: .55 },
          { t: 'c', rt: .2, h: .5, p: [CX, CY, -.05], rot: [HF, 0, 0], c: PA.metalD, m: .8, ro: .35 },
          ...[-1, 1].map(k => ({ t: 'c', rt: .055, h: .06, p: [CX + k * .62, CY + .34, .2], rot: [HF, 0, 0], c: PA.woodD, m: .5, ro: .4 }))
        ]
      },
      {
        id: 'spring', n: '发条（卷簧）', seq: 2, pivot: [CX, CY, 0], out: [0, 0, 2.2],
        hint: '盘在发条盒里的那根钢带，就是存能量的地方',
        b: [
          prof(spiralPts(.17, .6, 2.6, .028), .07, PA.steel, .25, { m: .75, ro: .32 }),
          { t: 'c', rt: .11, h: .12, p: [CX, CY, .25], rot: [HF, 0, 0], c: PA.metalD, m: .8, ro: .3 }
        ]
      },
      {
        id: 'arbor', n: '上弦轴（含棘轮）', seq: 3, pivot: [CX, CY, 0], out: [0, 0, 2.4],
        hint: '上弦轴穿过发条盒，尾端是棘轮和上弦钥匙',
        b: [
          { t: 'c', rt: .085, h: 1.08, p: [CX, CY, .1], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
          prof(ratchetPts, .1, PA.steel, -.34, { m: .7, ro: .35 }),
          { t: 'b', s: [.5, .09, .09], p: [CX + .18, CY, .58], c: PA.red, ro: .5 },
          { t: 'b', s: [.09, .09, .09], p: [CX - .06, CY, .58], c: PA.redD, ro: .5 },
          { t: 's', rad: .09, p: [CX, CY, .66], c: PA.red, ro: .5 }
        ]
      },
      {
        id: 'pinion', n: `输出小齿轮 z=${Z2}`, seq: 4, pivot: [PX, CY, 0], out: [0, 0, 2.6],
        hint: '小齿轮与发条盒外齿啮合，把储能送出去',
        b: [
          gearAt(Z2, m, PX, CY, .3, PA.blue, Math.PI - s2),
          { t: 'c', rt: .14, h: .44, p: [PX, CY, 0], rot: [HF, 0, 0], c: PA.blueD, m: .6, ro: .35 },
          { t: 'b', s: [.07, .3, .07], p: [PX + .13, CY, .16], c: PA.sky, ro: .5 }
        ]
      },
      {
        id: 'pawl', n: '棘爪', seq: 5, pivot: [CX - .72, CY - .5, 0], out: [0, 0, 2.6],
        hint: '棘爪顶住棘轮，只允许上弦、不许自己倒转',
        b: [
          R.rod([CX - .72, -.5], [CX - .5, -.3], .055, PA.metalD, -.24),
          { t: 'b', s: [.14, .1, .12], p: [CX - .46, CY - .27, -.24], c: PA.steel, ro: .4 },
          R.pin(CX - .72, -.5, .07, .2, -.31, PA.metal)
        ]
      }
    ],
    measure: [{ key: 'out', label: '输出转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const winding = th < Math.PI;
      const wind = smooth(th / Math.PI);
      const rel = th <= Math.PI ? 0 : smooth((th - Math.PI) / Math.PI);
      const ar = WIND * TAU * wind;
      const outA = -OUT * TAU * rel;
      const pin = -outA * Z1 / Z2;
      const hop = .09 * (0.5 - 0.5 * Math.cos(TAU * WIND * wind)) * (winding ? 1 : 0);
      return {
        drum: { r: [0, 0, outA] },
        pinion: { r: [0, 0, pin] },
        spring: { r: [0, 0, ar] },
        arbor: { r: [0, 0, ar] },
        pawl: { r: [0, 0, hop] },
        n: { out: dd(pin) },
        readout: [
          { k: '状态', v: winding ? '上弦储能' : '放能输出' },
          { k: '已上弦', v: `${(WIND * wind).toFixed(1)} 圈` },
          { k: '输出转角', v: `${(pin / TAU).toFixed(1)} 圈` }
        ]
      };
    }
  };
})();

/* ============================================================
 * 34. 棘轮扳手
 *     手柄来回摆，棘爪单向推动棘轮；回程时爪尖滑过齿背
 * ============================================================ */
const cp5 = (() => {
  const R = rig(1.6), Y0 = R.Y(0);
  const CX = 2.45, CY = Y0, Z = 16, STEP = TAU / Z;
  const RT = .5, RR = .42, A = Math.PI / 4;
  const P0 = V(CX - .66, CY);
  const rPts = radiusRing(CX, CY, ratchetRF(RR, RT, Z, 0), 260);
  const hp = th => A * Math.sin(th);
  const turn = th => (((th + HF) % TAU) + TAU) % TAU;   // 以 -90° 为起点
  const rw = th => turn(th) < Math.PI ? A * (Math.sin(th) + 1) : 2 * A;
  const own = th => {
    const u = turn(th);
    if (u < Math.PI) return 0;
    return .11 * (0.5 - 0.5 * Math.cos(TAU * 4 * (u - Math.PI) / Math.PI));
  };
  const pAx = a => {
    const dx = P0.x - CX;
    return [dx * Math.cos(a) - dx, dx * Math.sin(a)];
  };

  return {
    id: 'ratchetWrench', name: '棘轮扳手', group: 'clamp', tag: '单向',
    summary: '来回摆都能上紧，回程自动打滑',
    input: { label: '手柄摆角', speed: 48 },
    lesson: {
      what: '手柄里藏着一个棘轮和一个棘爪。手柄往拧紧方向摆，棘爪咬住棘轮，带着螺母一起转；手柄往回摆，棘爪从齿背滑过去，螺母停住不动。',
      key: `每次有效摆动转过 ${4} 个齿（这里 ${Z} 齿、每齿 ${(360 / Z).toFixed(1)}°，一摆正好 ${(4 * 360 / Z).toFixed(0)}°）。所以手腕不用离开手柄，来回摆几次就把螺栓拧紧了。齿形做成缓升陡落，反向就被顶住。`,
      where: '棘轮扳手、手扳葫芦、棘轮螺丝刀、千斤顶、安全带卷收器。'
    },
    base: [
      ...R.base(.55, 3.85, []),
      pillar(CX, 0, Y0, PA.woodD, -.55, .22),
      { t: 'c', rt: .16, h: .4, p: [CX, CY, -.45], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 }
    ],
    parts: [
      {
        id: 'handle', n: '手柄（含棘爪座）', seq: 1, pivot: [CX, CY, 0], out: [0, 0, 2.0],
        hint: '手柄套在棘轮外面，先把手柄连同棘爪一起抬出来',
        b: [
          { t: 'pf', pts: radiusRing(CX, CY, () => .76, 96), holes: [radiusRing(CX, CY, () => .58, 90)], d: .18, p: [0, 0, -.25], c: PA.blue, m: .5, ro: .45 },
          { t: 'b', s: [.72, .3, .18], p: [CX - .98, CY, -.25], c: PA.blue, ro: .5 },
          { t: 'b', s: [.42, .32, .24], p: [CX - 1.5, CY, -.25], c: PA.red, ro: .55 },
          { t: 'c', rt: .1, h: .3, p: [CX, CY, -.27], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
          R.pin(P0.x, 0, .055, .5, -.05, PA.metalD),
          { t: 'b', s: [.16, .1, .16], p: [CX - .6, CY + .5, -.25], c: PA.sky, ro: .5 }
        ]
      },
      {
        id: 'pawl', n: '棘爪', seq: 2, pivot: [P0.x, CY, 0], out: [0, 0, 2.2],
        hint: '棘爪装在手柄里，爪尖顶在棘轮齿槽上',
        b: [
          { t: 'b', s: [.34, .13, .16], p: [P0.x + .15, CY, .06], c: PA.steel, ro: .4 },
          { t: 'b', s: [.11, .17, .14], p: [P0.x + .3, CY - .05, .06], c: PA.metalD, ro: .35 },
          { t: 's', rad: .06, p: [P0.x - .02, CY + .16, .06], c: PA.metalD, m: .8, ro: .3 }
        ]
      },
      {
        id: 'wheel', n: '棘轮（含套筒）', seq: 3, pivot: [CX, CY, 0], out: [0, 0, 2.4],
        hint: '棘轮套在螺栓上，只能朝一个方向转',
        b: [
          { t: 'pf', pts: rPts, d: .2, p: [0, 0, -.12], c: PA.gold, m: .5, ro: .4 },
          { t: 'c', rt: .3, h: .34, p: [CX, CY, -.02], rot: [HF, 0, 0], c: PA.org, m: .4, ro: .5 },
          { t: 'b', s: [.1, .16, .1], p: [CX + .38, CY, -.02], c: PA.red, ro: .5 }
        ]
      },
      {
        id: 'nut', n: '六角螺母（输出）', seq: 4, pivot: [CX, CY, 0], out: [0, 0, 2.6],
        hint: '螺母随棘轮一起转，这就是被拧紧的那颗',
        b: [
          { t: 'c', rt: .22, h: .18, seg: 6, p: [CX, CY, .26], rot: [HF, 0, 0], c: PA.metal, m: .85, ro: .35 },
          { t: 'c', rt: .1, h: .19, p: [CX, CY, .26], rot: [HF, 0, 0], c: PA.dark, ro: .8 }
        ]
      }
    ],
    measure: [{ key: 'turn', label: '棘轮转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const a = hp(th), r = rw(th), o = own(th), pax = pAx(a);
      return {
        handle: { r: [0, 0, a] },
        pawl: { r: [0, 0, a + o], p: [pax[0], pax[1], 0] },
        wheel: { r: [0, 0, r] },
        nut: { r: [0, 0, r] },
        n: { turn: dd(r) },
        readout: [
          { k: '手柄摆角', v: rd(a) },
          { k: '棘轮转角', v: rd(r) },
          { k: '已经过齿数', v: (r / STEP).toFixed(1) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 35. 旋转闭锁
 *     枪机先转 60° 开锁，再后退抽壳；复进到位后回转闭锁
 * ============================================================ */
const fq1 = (() => {
  const R = rig(1.68), Y0 = R.Y(0);
  const ROT = -Math.PI / 3, SLIDE = .30;
  const sp = (t, a, b) => smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));
  const rotAt = th => ROT * (sp(th, 0, .34 * Math.PI) - sp(th, 1.34 * Math.PI, 2 * Math.PI));
  const sAt = th => SLIDE * (sp(th, .34 * Math.PI, .78 * Math.PI) - sp(th, .78 * Math.PI, 1.34 * Math.PI));
  const LUG = [90, 210, 330].map(a => a / 180 * Math.PI);
  const lugs = (x, rr, sz, c) => LUG.map(a => ({
    t: 'b', s: sz, rot: [a, 0, 0], p: [x, Y0 + rr * Math.cos(a), rr * Math.sin(a)], c, ro: .42
  }));
  const BOLT = [
    { t: 'c', rt: .26, h: 1.6, p: [2.12, Y0, 0], rot: [0, 0, HF], c: PA.blue, m: .55, ro: .38 },
    ...lugs(1.42, .3, [.16, .32, .12], PA.blueD),
    { t: 'b', s: [.2, .2, .48], p: [2.28, Y0 + .34, 0], c: PA.blueD, ro: .45 },
    { t: 'c', rt: .1, h: .34, p: [2.28, Y0 + .58, 0], rot: [0, 0, 0], c: PA.red, m: .3, ro: .5 },
    { t: 's', rad: .13, p: [2.28, Y0 + .78, 0], c: PA.red, ro: .5 },
    { t: 'c', rt: .17, h: .22, p: [2.84, Y0, 0], rot: [0, 0, HF], c: PA.metalD, m: .85, ro: .3 }
  ];

  return {
    id: 'rotaryLock', name: '旋转闭锁', group: 'timing', tag: '闭锁',
    summary: '回转开锁—后退—复进—回转闭锁',
    input: { label: '击发循环', speed: 34 },
    lesson: {
      what: '枪机头上有三个闭锁凸笋。要开锁，先让枪机整体回转 60°，凸笋从节套的闭锁槽里脱出；这时枪机才能后退抽壳。复进到位后，凸笋再转回槽里把枪膛顶死。',
      key: '动作被拆成四段、严格按顺序：回转 60° → 后退 46mm → 复进 → 回转闭锁。闭锁状态下枪机根本退不动，安全性就来自这个先后顺序，而不是靠零件强度。',
      where: '栓动步枪、机炮炮闩、压力容器的旋转卡箍、快开盲板。'
    },
    base: [
      ...R.base(.35, 3.45, []),
      pillar(1.0, -.32, Y0, PA.woodD, -.3, .18),
      pillar(2.75, -.32, Y0, PA.woodD, -.3, .18),
      /* 机匣后壁的立柱：托住后壁底面，后壁不再悬空 */
      pillar(3.3, -.17, Y0, PA.woodD, -.3, .18),
      { t: 'b', s: [1.9, .1, .52], p: [2.1, Y0 - .36, 0], c: PA.wood, ro: .8 },
      /* 机匣上方做成开口（剖切）：枪机手柄回转与后退都从这里通过 */
      { t: 'c', rt: .2, h: .5, p: [.58, Y0, 0], rot: [0, 0, HF], c: PA.metalD, m: .85, ro: .3 }
    ],
    parts: [
      {
        id: 'bolt', n: '枪机（含凸笋）', seq: 1, pivot: [2.12, Y0, 0], out: [0, 0, 2.1],
        hint: '枪机带三个凸笋，先回转再后退，顺序不能颠倒',
        b: BOLT
      },
      {
        id: 'seat', n: '节套（闭锁槽）', seq: 2, pivot: [1.02, Y0, 0], out: [0, 0, 2.3],
        hint: '节套内壁有三个槽，凸笋转进槽里就锁死了',
        b: [
          { t: 'c', rt: .42, h: .45, p: [1.02, Y0, 0], rot: [0, 0, HF], c: PA.metal, m: .7, ro: .35 },
          ...lugs(1.14, .28, [.12, .34, .2], PA.metalD)
        ]
      },
      {
        id: 'recv', n: '机匣后壁', seq: 3, pivot: [3.3, Y0, 0], out: [0, 0, 2.5],
        hint: '后壁挡住枪机，限制后退行程',
        b: [
          { t: 'b', s: [.12, .34, .46], p: [3.3, Y0, 0], c: PA.woodD, ro: .75 }
        ]
      }
    ],
    measure: [{ key: 'slide', label: '枪机后退', unit: '', k: 1, dec: 2 }],
    pose(th) {
      const a = rotAt(th), s = sAt(th);
      const st = th < .34 * Math.PI ? '回转开锁' : th < .78 * Math.PI ? '后退抽壳'
        : th < 1.34 * Math.PI ? '复进推弹' : '回转闭锁';
      return {
        bolt: { r: [a, 0, 0], p: [s, 0, 0] },
        seat: {},
        recv: {},
        n: { slide: s },
        readout: [
          { k: '动作', v: st },
          { k: '回转角', v: rd(a) },
          { k: '后退量', v: s.toFixed(2) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 36. 击锤与阻铁
 *     阻铁卡住击锤待发，解脱后击锤在簧力下打击
 * ============================================================ */
const fq2 = (() => {
  const R = rig(1.15), Y0 = R.Y(0);
  const H = V(1.95, 0), S = V(1.42, -.62);
  const A0 = 165 / 180 * Math.PI, FALL = -1.92;      // 待发角 → 打击角
  const sp = (t, a, b) => smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));
  const fall = th => sp(th, .44 * Math.PI, .58 * Math.PI);
  const cock = th => sp(th, .96 * Math.PI, 1.8 * Math.PI);
  const outA = th => sp(th, .34 * Math.PI, .42 * Math.PI) - sp(th, 1.36 * Math.PI, 1.56 * Math.PI);
  const haAt = th => FALL * (fall(th) - cock(th));
  const HEAD = [H.x + .74 * Math.cos(A0), .74 * Math.sin(A0)];

  return {
    id: 'hammerSear', name: '击锤与阻铁', group: 'timing', tag: '待发',
    summary: '阻铁一解脱，击锤立刻打击',
    input: { label: '击发循环', speed: 40 },
    lesson: {
      what: '击锤被弹簧压着要往前打，但尾部的缺口被阻铁卡住，处于「待发」状态。阻铁一转过一个小角度脱开缺口，击锤就在簧力下迅速打到击针上。',
      key: '待发靠的是阻铁和缺口的面接触——只要不脱开，多大的簧力也打不出去；解脱只需很小的行程，却能放出很大的能量，这正是「扳机力小、击发力大」的原因。随后击锤被重新压倒，阻铁再滑回缺口。',
      where: '枪械击发机构、钉枪、打火机、断路器脱扣、钟表的擒纵。'
    },
    base: [
      ...R.base(.55, 3.05, []),
      { t: 'b', s: [1.9, 1.5, .1], p: [1.95, Y0 + .18, -.32], c: PA.woodD, ro: .8 },
      { t: 'c', rt: .07, h: .5, p: [H.x, Y0, -.3], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .3 },
      { t: 'c', rt: .065, h: .5, p: [S.x, Y0 - .62, -.3], rot: [0, 0, HF], c: PA.metalD, m: .9, ro: .3 },
      { t: 'b', s: [.2, .26, .26], p: [2.72, Y0 + .62, 0], c: PA.metalD, m: .7, ro: .35 },
      { t: 'c', rt: .05, h: .2, p: [2.60, Y0 + .62, 0], rot: [0, 0, HF], c: PA.steel, m: .9, ro: .25 }
    ],
    parts: [
      {
        id: 'hammer', n: '击锤', seq: 1, pivot: [H.x, Y0, 0], out: [0, 0, 2.1],
        hint: '击锤被簧力压着向前，靠尾部缺口被阻铁卡住',
        b: [
          R.rod([H.x, 0], HEAD, .09, PA.gold, 0),
          { t: 'b', s: [.3, .2, .24], p: [H.x + HEAD[0] - H.x, Y0 + HEAD[1], 0], c: PA.org, ro: .45 },
          { t: 'c', rt: .28, h: .26, p: [H.x, Y0, 0], rot: [HF, 0, 0], c: PA.gold, m: .5, ro: .4 },
          { t: 'b', s: [.18, .14, .2], p: [1.73, Y0 - .22, 0], c: PA.org, ro: .45 },
          { t: 'b', s: [.16, .2, .18], p: [2.16, Y0 + .3, 0], c: PA.org, ro: .45 },
          { t: 'o', rad: .34, tube: .028, p: [H.x, Y0, .18], rot: [HF, 0, 0], c: PA.metal, m: .85, ro: .3 },
          { t: 'o', rad: .3, tube: .028, p: [H.x, Y0, .18], rot: [HF, 0, 0], c: PA.metal, m: .85, ro: .3 }
        ]
      },
      {
        id: 'sear', n: '阻铁', seq: 2, pivot: [S.x, Y0 - .62, 0], out: [0, 0, 2.3],
        hint: '阻铁的尖端卡在击锤缺口里，转一点点就解脱',
        b: [
          R.rod([S.x, -.62], [1.70, -.36], .07, PA.steel, 0),
          { t: 'b', s: [.16, .1, .16], p: [1.74, Y0 - .36, 0], c: PA.metalD, ro: .35 },
          { t: 'c', rt: .1, h: .22, p: [S.x, Y0 - .62, 0], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 }
        ]
      }
    ],
    measure: [{ key: 'ang', label: '击锤转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const ha = haAt(th), sa = -.4 * outA(th);
      const f = fall(th), c = cock(th);
      const st = c > .02 ? '重新待击' : f < .02 ? '待发（阻铁卡住）'
        : f < .99 ? '阻铁解脱 · 击锤下落' : '打击到底';
      return {
        hammer: { r: [0, 0, ha] },
        sear: { r: [0, 0, sa] },
        n: { ang: dd(2.88 + ha) },
        readout: [
          { k: '状态', v: st },
          { k: '击锤转角', v: rd(2.88 + ha) },
          { k: '阻铁转角', v: rd(sa) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 37. 扳机联动
 *     扳机—联动杆—阻铁，把手指的行程传到阻铁尖端
 * ============================================================ */
const fq3 = (() => {
  const R = rig(1.5), Y0 = R.Y(0);
  const T = V(2.5, .05), S = V(1.55, .55);
  const sp = (t, a, b) => smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));
  const prog = th => sp(th, 0, .42 * Math.PI) - sp(th, 1.36 * Math.PI, 1.92 * Math.PI);

  return {
    id: 'triggerLink', name: '扳机联动', group: 'timing', tag: '联动',
    summary: '手指行程经连杆放大成阻铁的解脱行程',
    input: { label: '扳机行程', speed: 40 },
    lesson: {
      what: '手指往后扣扳机，扳机上端其实在往前顶；它推动一根水平联动杆，联动杆再顶阻铁的尾端，阻铁绕自己的轴转过一个小角度，尖端就从击锤缺口里滑出来。',
      key: '这是一条「位移传递链」：扳机转角 → 连杆平移 → 阻铁转角。中间任何一环有间隙（扳机空程），都会变成手感上的「虚位」。联动杆的水平布置还能把扳机从握把处「搬」到机匣内更合适的位置。',
      where: '枪械扳机组、打钉枪保险联动、机床双手操作联锁、汽车离合踏板连杆。'
    },
    base: [
      ...R.base(.5, 3.15, []),
      /* 后立板从底板顶面一直立到机匣上沿：扳机与阻铁的固定销都装在它上面 */
      { t: 'b', s: [2.0, Y0 + .66, .1], p: [1.75, .24 + (Y0 + .66) / 2, -.3], c: PA.woodD, ro: .8 },
      /* 两根固定销沿 Z 从立板伸到各自零件轴套的背面（原来是沿 X 的错轴，够不着零件） */
      { t: 'c', rt: .07, h: .13, p: [S.x, Y0 + .55, -.185], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 },
      { t: 'c', rt: .07, h: .13, p: [T.x, Y0 + .05, -.185], rot: [HF, 0, 0], c: PA.metalD, m: .9, ro: .3 }
    ],
    parts: [
      {
        id: 'trigger', n: '扳机', seq: 1, pivot: [T.x, Y0 + .05, 0], out: [0, 0, 2.1],
        hint: '扳机绕上端轴转，下端是手指扣的弧面',
        b: [
          R.rod([T.x, .05], [2.4, .42], .075, PA.blue, 0),
          R.rod([T.x, .05], [2.36, -.6], .08, PA.blue, 0),
          { t: 'b', s: [.22, .26, .2], p: [2.36, Y0 - .62, 0], c: PA.blueD, ro: .5 },
          { t: 'c', rt: .1, h: .24, p: [T.x, Y0 + .05, 0], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 }
        ]
      },
      {
        id: 'link', n: '联动杆', seq: 2, pivot: [1.9, Y0 + .38, 0], out: [0, 0, 2.3],
        hint: '水平连杆把扳机的推动原样传给阻铁',
        b: [
          /* 杆身右端面正好落在扳机上臂顶端的运动包络之外：只顶不穿 */
          { t: 'b', s: [.76, .1, .16], p: [1.93, Y0 + .38, 0], c: PA.sky, ro: .5 },
          { t: 'c', rt: .06, h: .2, p: [1.57, Y0 + .38, 0], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 }
        ]
      },
      {
        id: 'sear', n: '阻铁', seq: 3, pivot: [S.x, Y0 + .55, 0], out: [0, 0, 2.5],
        hint: '阻铁尖端挂在待发件上，尾端被连杆顶着',
        b: [
          R.rod([S.x, .55], [1.2, .58], .075, PA.steel, 0),
          R.rod([S.x, .55], [S.x, .46], .06, PA.steel, 0),
          { t: 'b', s: [.14, .12, .18], p: [1.19, Y0 + .6, 0], c: PA.metalD, ro: .35 },
          { t: 'c', rt: .1, h: .22, p: [S.x, Y0 + .55, 0], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 }
        ]
      }
    ],
    measure: [{ key: 'link', label: '联动杆位移', unit: '', k: 1, dec: 3 }],
    pose(th) {
      const p = prog(th), lk = -.13 * p;
      return {
        trigger: { r: [0, 0, .26 * p] },
        link: { p: [lk, 0, 0] },
        sear: { r: [0, 0, -.3 * p] },
        n: { link: lk },
        readout: [
          { k: '状态', v: p > .5 ? '阻铁解脱' : p > .04 ? '扳机行程中' : '待发' },
          { k: '扳机转角', v: rd(.26 * p) },
          { k: '联动杆位移', v: lk.toFixed(3) }
        ]
      };
    }
  };
})();

/* ============================================================
 * 38. 转轮定位
 *     转轮每步转 1/6 圈，定位栓落槽锁住才能击发
 * ============================================================ */
const fq4 = (() => {
  const R = rig(1.35), Y0 = R.Y(0);
  const CX = 1.75, CY = Y0, RIM = .62, N = 6;
  const sp = (t, a, b) => smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));
  const seg = TAU / N;
  /* 外圆的定位槽做成直壁窄槽：定位栓的方头能整块落进去，槽底与栓头相切 */
  const rimR = a => {
    const p = ((a % seg) + seg) % seg;
    const d = Math.abs(p - seg / 2);
    return d < .16 ? RIM - .1 : RIM;
  };
  const chamber = k => {
    const a = k * seg + seg / 2;
    return radiusRing(CX + .34 * Math.cos(a), CY + .34 * Math.sin(a), () => .13, 26);
  };
  const rotAt = th => seg * sp(th, .12 * Math.PI, .5 * Math.PI);
  const ret = th => sp(th, 0, .1 * Math.PI) - sp(th, .5 * Math.PI, .62 * Math.PI);
  const adv = th => sp(th, .04 * Math.PI, .52 * Math.PI) - sp(th, .6 * Math.PI, 1.0 * Math.PI);

  return {
    id: 'cylinderIndex', name: '转轮定位', group: 'timing', tag: '分度',
    summary: '转轮转 60° 后必须被定位栓锁住',
    input: { label: '击发循环', speed: 38 },
    lesson: {
      what: '转轮上有六个弹巢。击锤后仰的同时，拨动爪把转轮推过 60°，让下一个弹巢对准枪管；随后定位栓弹进转轮外圆的定位槽，把转轮锁死，等待击发。',
      key: `分度角 = 360°/${N} = 60°。定位栓只在「转到位」之后才落槽——先解锁、再旋转、后锁定，顺序错了就会打偏甚至炸膛。这就是间歇机构里最典型的「分度—锁定」两段时序。`,
      where: '转轮手枪、多工位转盘机、加工中心刀库、凸轮分度盘。'
    },
    base: [
      ...R.base(.35, 3.15, []),
      pillar(CX, 0, Y0, PA.woodD, -.55, .24),
      /* 前后轴承座都改成带轴孔的轴瓦：转轮轴从孔里穿过，不与座体互穿 */
      { t: 'c', rt: .17, h: .18, p: [CX, CY, -.57], rot: [HF, 0, 0], c: PA.woodL, ro: .72, bore: .13 },
      { t: 'c', rt: .17, h: .18, p: [CX, CY, .45], rot: [HF, 0, 0], c: PA.woodL, ro: .72, bore: .13 },
      /* 定位栓的导座做成 U 形抱箍：两侧夹板 + 底板，栓体在中间滑动 */
      { t: 'b', s: [.06, .26, .26], p: [CX - .16, Y0 - RIM - .16, -.16], c: PA.woodD, ro: .8 },
      { t: 'b', s: [.06, .26, .26], p: [CX + .16, Y0 - RIM - .16, -.16], c: PA.woodD, ro: .8 },
      { t: 'b', s: [.34, .05, .26], p: [CX, Y0 - RIM - .31, -.16], c: PA.woodD, ro: .8 },
      pillar(CX - 1.05, -.9, Y0, PA.woodD, -.50, .16),
      /* 拨动爪的轴座：带轴孔的轴瓦，爪绕自己的轴转，瓦体在爪的运动包络之外 */
      { t: 'c', rt: .13, h: .18, p: [CX - 1.05, Y0 - .9, -.19], rot: [HF, 0, 0], c: PA.woodL, ro: .72, bore: .1 }
    ],
    parts: [
      {
        id: 'cyl', n: '转轮（6 弹巢）', seq: 1, pivot: [CX, CY, 0], out: [0, 0, 2.1],
        hint: '六个弹巢均布，转到位才能对准枪管',
        b: [
          {
            t: 'pf', pts: radiusRing(CX, CY, rimR, 340), holes: [0, 1, 2, 3, 4, 5].map(chamber),
            d: .6, p: [0, 0, 0], c: PA.gold, m: .5, ro: .4
          },
          /* 棘齿圈长在金色轮盘外缘之外：拨动爪只咬棘齿，绝不进轮体 */
          prof(radiusRing(CX, CY, ratchetRF(.60, .70, N, 0), 160), .12, PA.org, -.35, { m: .5, ro: .4 }),
          { t: 'c', rt: .12, h: .8, p: [CX, CY, 0], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 },
          { t: 'b', s: [.1, .18, .1], p: [CX + .34, CY, .31], c: PA.red, ro: .5 }
        ]
      },
      {
        id: 'bolt', n: '定位栓', seq: 2, pivot: [CX, Y0 - RIM, 0], out: [0, 0, 2.3],
        hint: '定位栓落进外圆槽里，转轮就锁死了',
        b: [
          { t: 'b', s: [.16, .2, .2], p: [CX, Y0 - RIM - .04, -.16], c: PA.steel, ro: .4 },
          /* 方栓头：宽度按槽宽做，顶面落到槽底为止，落槽时与槽底相切 */
          { t: 'b', s: [.1, .08, .14], p: [CX, Y0 - RIM + .06, -.16], c: PA.metalD, m: .8, ro: .3 }
        ]
      },
      {
        id: 'pawl', n: '拨动爪', seq: 3, pivot: [CX - 1.05, Y0 - .9, 0], out: [0, 0, 2.5],
        hint: '拨动爪推着棘齿走一格，回程时从齿背滑过',
        b: [
          R.rod([CX - 1.05, -.9], [CX - .58, -.46], .06, PA.blue, -.35),
          /* 爪头压在棘齿圈上（半径 ≥ 轮盘外缘 0.62），只与棘齿啮合 */
          { t: 'b', s: [.12, .08, .12], p: [CX - .58, Y0 - .46, -.35], c: PA.blueD, ro: .4 },
          { t: 'c', rt: .09, h: .24, p: [CX - 1.05, Y0 - .9, -.24], rot: [HF, 0, 0], c: PA.metalD, m: .85, ro: .3 }
        ]
      }
    ],
    measure: [{ key: 'turn', label: '转轮转角', unit: '°', k: 180 / Math.PI, dec: 0 }],
    pose(th) {
      const rot = rotAt(th), r = ret(th);
      const st = th < .1 * Math.PI ? '定位栓解锁' : th < .52 * Math.PI ? '步进 60°'
        : th < .62 * Math.PI ? '定位栓落槽' : '锁定待发';
      return {
        cyl: { r: [0, 0, rot] },
        bolt: { p: [0, -.11 * r, 0] },
        pawl: { r: [0, 0, .42 * adv(th)] },
        n: { turn: dd(rot) },
        readout: [
          { k: '状态', v: st },
          { k: '转轮转角', v: rd(rot) },
          { k: '定位栓', v: r > .5 ? '抬起（解锁）' : '落槽（锁定）' }
        ]
      };
    }
  };
})();

/* ============================================================
 * 分组与清单
 * ============================================================ */
export const MECH_GROUPS = [
  { id: 'linkage', name: '连杆家族', color: PA.red, desc: '刚性杆件 + 铰链，把转动、摆动、往复运动互相转换' },
  { id: 'cam', name: '凸轮与间歇', color: '#8E6BC8', desc: '用轮廓和缺口，让从动件按规定的节拍停停走走' },
  { id: 'gear', name: '齿轮与轮系', color: PA.blue, desc: '齿数比决定转速与扭矩，换向、分流、减速都在这里' },
  { id: 'drive', name: '传动与调速', color: PA.teal, desc: '皮带、链条、丝杠、离合器，把动力送到该去的地方' },
  { id: 'clamp', name: '夹持与蓄能', color: PA.gold, desc: '杠杆、滑轮、剪叉与弹簧，省力、放大与储能' },
  { id: 'timing', name: '击发时序', color: PA.metalD, desc: '只讲抽象的闭锁、待发与释放时序，不涉及外观' }
];

/* 38 件总清单，done 表示已上线 */
export const MECH_PLAN = [
  { group: 'linkage', items: [
    { id: 'crankRocker', name: '曲柄摇杆机构', done: true },
    { id: 'doubleCrank', name: '双曲柄机构', done: true },
    { id: 'sliderCrank', name: '曲柄滑块机构', done: true },
    { id: 'oscillatingGuide', name: '摆动导杆机构', done: true },
    { id: 'oscillatingBlock', name: '曲柄摇块机构', done: true },
    { id: 'parallelogram', name: '平行四连杆机构', done: true },
    { id: 'shaper', name: '牛头刨六杆机构', done: true }
  ] },
  { group: 'cam', items: [
    { id: 'camKnife', name: '盘形凸轮（尖顶从动件）', done: true },
    { id: 'camRoller', name: '滚子从动件凸轮', done: true },
    { id: 'eccentric', name: '偏心轮机构', done: true },
    { id: 'geneva', name: '槽轮（日内瓦）机构', done: true },
    { id: 'ratchet', name: '棘轮棘爪机构', done: true },
    { id: 'partialGear', name: '不完全齿轮机构', done: true },
    { id: 'camIndexer', name: '凸轮分度机构', done: true }
  ] },
  { group: 'gear', items: [
    { id: 'spurPair', name: '外啮合齿轮对', done: true },
    { id: 'internalGear', name: '内啮合齿轮', done: true },
    { id: 'rackPinion', name: '齿轮齿条', done: true },
    { id: 'wormDrive', name: '蜗轮蜗杆', done: true },
    { id: 'planetary', name: '行星齿轮', done: true },
    { id: 'differential', name: '差速器', done: true },
    { id: 'bevelGear', name: '锥齿轮换向', done: true },
    { id: 'harmonic', name: '谐波减速器', done: true }
  ] },
  { group: 'drive', items: [
    { id: 'beltDrive', name: '皮带传动', done: true },
    { id: 'chainDrive', name: '链传动', done: true },
    { id: 'cvt', name: '锥轮无级变速', done: true },
    { id: 'leadScrew', name: '丝杠螺母', done: true },
    { id: 'universalJoint', name: '万向节', done: true },
    { id: 'overrunClutch', name: '超越离合器', done: true },
    { id: 'flyballGovernor', name: '离心调速器', done: true }
  ] },
  { group: 'clamp', items: [
    { id: 'lever', name: '杠杆', done: true },
    { id: 'pulleyBlock', name: '滑轮组', done: true },
    { id: 'scissorLift', name: '剪式升降', done: true },
    { id: 'springStore', name: '卷簧蓄能', done: true },
    { id: 'ratchetWrench', name: '棘轮扳手', done: true }
  ] },
  { group: 'timing', items: [
    { id: 'rotaryLock', name: '旋转闭锁', done: true },
    { id: 'hammerSear', name: '击锤与阻铁', done: true },
    { id: 'triggerLink', name: '扳机联动', done: true },
    { id: 'cylinderIndex', name: '转轮定位', done: true }
  ] }
];

export const MECHS = {
  crankRocker: cr1, doubleCrank: cr2, sliderCrank: cr3,
  oscillatingGuide: cr4, oscillatingBlock: cr5,
  parallelogram: cr6, shaper: cr7,
  camKnife: cm1, camRoller: cm2, eccentric: cm3, geneva: cm4,
  ratchet: cm5, partialGear: cm6, camIndexer: cm7,
  spurPair: gr1, internalGear: gr2, rackPinion: gr3, wormDrive: gr4,
  planetary: gr5, differential: gr6, bevelGear: gr7, harmonic: gr8,
  beltDrive: bd1, chainDrive: bd2, cvt: bd3, leadScrew: bd4,
  universalJoint: bd5, overrunClutch: bd6, flyballGovernor: bd7,
  lever: cp1, pulleyBlock: cp2, scissorLift: cp3, springStore: cp4, ratchetWrench: cp5,
  rotaryLock: fq1, hammerSear: fq2, triggerLink: fq3, cylinderIndex: fq4
};

export const MECH_ORDER = [
  'crankRocker', 'doubleCrank', 'sliderCrank', 'oscillatingGuide', 'oscillatingBlock', 'parallelogram', 'shaper',
  'camKnife', 'camRoller', 'eccentric', 'geneva', 'ratchet', 'partialGear', 'camIndexer',
  'spurPair', 'internalGear', 'rackPinion', 'wormDrive', 'planetary', 'differential', 'bevelGear', 'harmonic',
  'beltDrive', 'chainDrive', 'cvt', 'leadScrew', 'universalJoint', 'overrunClutch', 'flyballGovernor',
  'lever', 'pulleyBlock', 'scissorLift', 'springStore', 'ratchetWrench',
  'rotaryLock', 'hammerSear', 'triggerLink', 'cylinderIndex'
];

/* ============================================================
 * 轴瓦 / 内轴的安全收拢
 *   旧做法把轴瓦放在 z=0 并让内轴前后各伸出 0.09，
 *   结果曲柄摇杆、双曲柄这类四连杆的连杆会扫过伸出的内轴。
 *   这里在零件表建好后，按「后立柱 → 最近零件背面」这段自由区间
 *   重新摆放每一组轴瓦与内轴：它们只待在这段空隙里，不进入零件实体。
 * ============================================================ */
function primZRange(pr) {
  const rot = pr.rot || [0, 0, 0];
  const rx = rot[0] || 0, ry = rot[1] || 0, rz = rot[2] || 0;
  const pz = pr.p ? (pr.p[2] || 0) : 0;
  const near = (a) => Math.abs(Math.abs(a) - HF) < 0.02;
  if (pr.t === 'b') {
    const [sx, sy, sz] = pr.s;
    let hz = sz / 2;
    if (near(rx)) hz = sy / 2;
    else if (near(ry)) hz = sx / 2;
    else if (Math.abs(rx) > 1e-3) hz = (Math.abs(sy * Math.sin(rx)) + Math.abs(sz * Math.cos(rx))) / 2;
    else if (Math.abs(ry) > 1e-3) hz = (Math.abs(sx * Math.sin(ry)) + Math.abs(sz * Math.cos(ry))) / 2;
    return [pz - hz, pz + hz];
  }
  if (pr.t === 'c' || pr.t === 'd') {
    const r = pr.t === 'c' ? Math.max(pr.rt, pr.rb ?? pr.rt) : pr.rad;
    const h = pr.t === 'c' ? pr.h : Math.hypot(pr.b[0] - pr.a[0], pr.b[1] - pr.a[1], pr.b[2] - pr.a[2]);
    let hz;
    if (near(rx)) hz = h / 2;
    else if (near(ry) || near(rz) || Math.abs(ry) > 1e-3) hz = r;
    else if (Math.abs(rx) > 1e-3) hz = (Math.abs(h * Math.sin(rx)) + Math.abs(2 * r * Math.cos(rx))) / 2;
    else hz = r;
    const cz = pr.t === 'd' ? (pr.a[2] + pr.b[2]) / 2 : pz;
    return [cz - hz, cz + hz];
  }
  if (pr.t === 'pf') {
    const hz = Math.abs(rx) > 1e-3 || Math.abs(ry) > 1e-3 ? 0.8 : (pr.d || 0.2) / 2;
    return [pz - Math.abs(hz), pz + Math.abs(hz)];
  }
  if (pr.t === 'o') return [pz - (pr.tube || 0), pz + (pr.tube || 0)];
  if (pr.t === 's') return [pz - pr.rad, pz + pr.rad];
  if (pr.t === 'k') { const hz = Math.max(pr.rad, pr.h / 2); return [pz - hz, pz + hz]; }
  if (pr.t === 'hd') { const r = (pr.rad || .3) + (pr.tube || .06); return [pz - r, pz + r]; }
  return null;
}

function primXY(pr) {
  if (pr.t === 'd') {
    return [(pr.a[0] + pr.b[0]) / 2, (pr.a[1] + pr.b[1]) / 2,
      Math.hypot(pr.b[0] - pr.a[0], pr.b[1] - pr.a[1]) / 2 + pr.rad];
  }
  const px = pr.p ? (pr.p[0] || 0) : 0, py = pr.p ? (pr.p[1] || 0) : 0;
  if (pr.t === 'b') return [px, py, Math.hypot(pr.s[0], pr.s[1]) / 2];
  if (pr.t === 'c') {
    const r = Math.max(pr.rt, pr.rb ?? pr.rt);
    const rot = pr.rot || [0, 0, 0];
    const rx = rot[0] || 0;
    /* 轴向沿 z 时，XY 投影就是半径 r 的圆；轴向仍在 XY 平面时，投影是 2r×h 的长条 */
    const rmax = Math.abs(Math.abs(rx) - HF) < 0.02 ? r : Math.hypot(r, pr.h / 2);
    return [px, py, rmax];
  }
  if (pr.t === 'pf') {
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    (pr.pts || []).forEach(q => {
      if (q[0] < mnx) mnx = q[0]; if (q[0] > mxx) mxx = q[0];
      if (q[1] < mny) mny = q[1]; if (q[1] > mxy) mxy = q[1];
    });
    if (!isFinite(mnx)) return [px, py, 0];
    const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    return [px + cx, py + cy, Math.hypot(mxx - mnx, mxy - mny) / 2];
  }
  if (pr.t === 'o') return [px, py, pr.rad + pr.tube];
  if (pr.t === 's') return [px, py, pr.rad];
  if (pr.t === 'k') return [px, py, Math.hypot(pr.rad, pr.h / 2)];
  if (pr.t === 'hd') return [px, py, Math.hypot((pr.len || 2) / 2, (pr.rad || .3) + (pr.tube || .06))];
  return [px, py, 0];
}

function fitPivotSupports(mech) {
  const BORE = 0.17, ROUT = 0.22;
  const near = [];
  mech.parts.forEach(p => p.b.forEach(pr => {
    const z = primZRange(pr);
    if (!z) return;
    near.push({ z, pr });
  }));
  /* 同一轴心的「轴瓦 + 内轴」成组处理：整组贴着最靠后那个零件的背面站，
   * 绝不横穿任何零件的实体，也不伸进零件的运动包络。 */
  const groups = new Map();
  (mech.base || []).forEach(pr => {
    if (!pr._pv) return;
    const k = [pr._px.toFixed(3), pr._py.toFixed(3), (pr._zb ?? 0).toFixed(3)].join('|');
    if (!groups.has(k)) groups.set(k, { px: pr._px, py: pr._py, list: [] });
    groups.get(k).list.push(pr);
  });
  groups.forEach(({ px, py, list }) => {
    if (list[0]._fixed) return;                      // 指定了固定深度的轴承座，原样保留
    let back = Infinity;
    for (const it of near) {
      if (it.z[1] <= -0.50) continue;                // 已经退到后立柱之后，构不成阻挡
      if (!primHitXY(it.pr, px, py, ROUT + 0.02)) continue;   // 径向够不着轴心
      const r = it.pr.t === 'c' ? Math.max(it.pr.rt, it.pr.rb ?? it.pr.rt) : Infinity;
      if (r <= BORE + 0.006) continue;               // 整体落在轴孔里，属于配合
      if (it.z[0] < back) back = it.z[0];            // 取最靠后的零件背面
    }
    if (back === Infinity) return;                   // 轴心附近没有零件，保持默认位置
    const z1 = Math.min(back - 0.008, list[0]._front ?? 0.48);   // 轴瓦前端紧贴零件背面
    list.forEach(pr => {
      const want = pr._isAxle ? 0.22 : 0.30;
      const z0 = Math.max(z1 - want, -0.62);
      const h = Math.max(0.12, z1 - z0);
      pr.h = +h.toFixed(3);
      pr.p = [pr.p[0], pr.p[1], +(z1 - h / 2).toFixed(3)];
    });
  });
}

/* ---------------- 自动配孔 ----------------
 * 真实机械里，销轴/转轴穿过零件的地方一定有孔；
 * 数据里如果没有孔，审计器就会把它当成「实体穿越」。
 * 这里在全部机构建好后统一扫描（只看同轴情形）：
 *   1) 同轴的小轴(销) 穿过大圆柱(轴瓦/轮毂/盘) → 给大圆柱 `bore`（Lathe 真正挖空）
 *   2) 同轴的 z 向销穿过挤出轮廓(pf，齿轮/摆杆/盘) → 在轮廓里挖一个圆孔
 * 只做「同轴」的这一类；真正的实体互撞仍由 strict.mjs 报出来逐件改。
 */
function eulerAxis(rot) {
  const rx = rot[0] || 0, ry = rot[1] || 0, rz = rot[2] || 0;
  /* three.js Euler 'XYZ'：R = Rx·Ry·Rz，作用在 (0,1,0) 上 */
  let x = 0, y = 1, z = 0;
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  let x1 = x * cz - y * sz, y1 = x * sz + y * cz, z1 = z;
  let x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
  return [x2, y2 * cx - z2 * sx, y2 * sx + z2 * cx];
}

function polyHit(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}

function autoBore(mech) {
  const items = [];
  (mech.base || []).forEach(pr => items.push({ pr, owner: '#base' }));
  (mech.parts || []).forEach(p => (p.b || []).forEach(pr => items.push({ pr, owner: p.id })));
  const cyl = [];
  items.forEach(it => {
    const pr = it.pr;
    if (pr.t !== 'c' || !(pr.h > 0)) return;
    const p = pr.p || [0, 0, 0];
    cyl.push({
      ...it, p, u: eulerAxis(pr.rot || [0, 0, 0]),
      r: Math.max(pr.rt, pr.rb ?? pr.rt), h: pr.h, bore: pr.bore || 0
    });
  });
  const pins = cyl.filter(o => o.r <= 0.12);
  for (const pin of pins) {
    for (const rec of cyl) {
      if (rec === pin || rec.owner === pin.owner) continue;
      if (rec.r < pin.r + 0.03) continue;
      if (Math.abs(pin.u[0] * rec.u[0] + pin.u[1] * rec.u[1] + pin.u[2] * rec.u[2]) < 0.995) continue;
      const d = [rec.p[0] - pin.p[0], rec.p[1] - pin.p[1], rec.p[2] - pin.p[2]];
      const along = d[0] * pin.u[0] + d[1] * pin.u[1] + d[2] * pin.u[2];
      const perp = Math.hypot(d[0] - along * pin.u[0], d[1] - along * pin.u[1], d[2] - along * pin.u[2]);
      if (perp > 0.012) continue;                       // 不同轴
      const ov = Math.min(pin.h / 2, along + rec.h / 2) - Math.max(-pin.h / 2, along - rec.h / 2);
      if (ov < 0.012) continue;                         // 轴向不重叠
      const want = +(pin.r + 0.012).toFixed(3);
      if (want > rec.r - 0.025) continue;               // 壁太薄，挖不了
      if ((rec.pr.bore || 0) >= want) continue;
      rec.pr.bore = rec.bore = want;
    }
  }
  /* 挤出轮廓：z 向销穿过就在轮廓里挖个圆孔 */
  const pfs = items.filter(it => it.pr.t === 'pf' && !it.pr.rot && it.pr.pts);
  for (const pin of pins) {
    if (Math.abs(pin.u[2]) < 0.995) continue;
    for (const it of pfs) {
      const pr = it.pr;
      if (it.owner === pin.owner) continue;
      const hz = (pr.d || 0.1) / 2, cz = pr.p ? (pr.p[2] || 0) : 0;
      if (Math.min(pin.p[2] + pin.h / 2, cz + hz) - Math.max(pin.p[2] - pin.h / 2, cz - hz) < 0.012) continue;
      if (!polyHit(pin.p[0], pin.p[1], pr.pts)) continue;
      if ((pr.holes || []).some(hp => hp.every(q => Math.hypot(q[0] - pin.p[0], q[1] - pin.p[1]) < pin.r + 0.02))) continue;
      const want = +(pin.r + 0.012).toFixed(3);
      pr.holes = (pr.holes || []).concat([radiusRing(pin.p[0], pin.p[1], () => want, 40)]);
    }
  }
}

MECH_ORDER.forEach(id => fitPivotSupports(MECHS[id]));
MECH_ORDER.forEach(id => autoBore(MECHS[id]));

/* ---------------- 销轴自动让位 ----------------
 * 判定标准（用户要求）：运动件在整个运动包络里都不得与别的零件实体穿越。
 * 真实的销轴连接应该是「各自带一段销、在对方零件背面处对接」，
 * 而不是一根长销从别人身体里穿过去。
 * 这里在数据建好后统一把每根销缩短到「本零件 → 对方零件近侧面」之间；
 * 如果销整个埋进了别的零件实体（根本看不见），直接删掉。
 * 只处理轴向沿 Z 的销（机构平面内的绝大多数），其它方向的销留给审计器逐件报。
 */
function primHitXY(pr, x, y, m = 0.004) {
  const px = pr.p ? (pr.p[0] || 0) : 0, py = pr.p ? (pr.p[1] || 0) : 0;
  if (pr.t === 'b') return Math.abs(x - px) <= pr.s[0] / 2 + m && Math.abs(y - py) <= pr.s[1] / 2 + m;
  if (pr.t === 'c') {
    const r = Math.max(pr.rt, pr.rb ?? pr.rt);
    const rot = pr.rot || [0, 0, 0];
    const flat = Math.abs(Math.abs(rot[0] || 0) - HF) < 0.02;
    return Math.hypot(x - px, y - py) <= (flat ? r : Math.hypot(r, pr.h / 2)) + m;
  }
  if (pr.t === 'd') {
    const [ax, ay] = pr.a, [bx, by] = pr.b;
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    let t = ((x - ax) * dx + (y - ay) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= pr.rad + m;
  }
  if (pr.t === 'pf') return polyHit(x, y, pr.pts || []);
  if (pr.t === 'o') return Math.abs(Math.hypot(x - px, y - py) - pr.rad) <= pr.tube + m;
  if (pr.t === 's' || pr.t === 'k') return Math.hypot(x - px, y - py) <= pr.rad + m;
  if (pr.t === 'hd') return Math.abs(x - px) <= (pr.len || 2) / 2 && Math.hypot(y - py, 0) <= (pr.rad || .3) + (pr.tube || .06);
  return false;
}

function fitPins(mech) {
  const parts = mech.parts || [];
  const blockers = [];
  const pins = [];
  const push = (owner, pr) => {
    const z = primZRange(pr);
    if (!z) return;
    blockers.push({ owner, pr, z });
  };
  const pushPin = (owner, pr, r) => {
    const z = primZRange(pr);
    const px = pr.p[0] || 0, py = pr.p[1] || 0;
    pins.push({ owner, pr, r, px, py, a: z[0], b: z[1] });
  };
  (mech.base || []).forEach(pr => push('#base', pr));
  parts.forEach(p => p.b.forEach(pr => push(p.id, pr)));
  parts.forEach(p => p.b.forEach(pin => {
    if (pin.t !== 'c' || !(pin.h > 0)) return;
    const r = Math.max(pin.rt, pin.rb ?? pin.rt);
    if (r > 0.12) return;
    const rot = pin.rot || [0, 0, 0];
    if (!(Math.abs(Math.abs(rot[0] || 0) - HF) < 0.02) || Math.abs(rot[1] || 0) > 0.01 ||
      Math.abs(rot[2] || 0) > 0.01) return;                         // 只处理沿 Z 的销
    pushPin(p.id, pin, r);
  }));
  const isPin = pr => pr.t === 'c' && Math.max(pr.rt, pr.rb ?? pr.rt) <= 0.12;
  /* 第一轮：把销缩到「本零件 → 对方零件近侧面」之间（销不当作阻挡体） */
  for (const pn of pins) {
    let a = pn.a, b = pn.b;
    for (const it of blockers) {
      if (it.owner === pn.owner) continue;
      if (isPin(it.pr)) continue;
      const [l, h2] = it.z;
      if (h2 <= a + 0.004 || l >= b - 0.004) continue;              // z 不重叠
      if (!primHitXY(it.pr, pn.px, pn.py)) continue;                // 径向没打上
      if (l <= a + 0.004 && h2 >= b - 0.004) { a = b; break; }       // 整个埋住
      if (l > a + 0.004) b = Math.min(b, l - 0.006);
      if (h2 < b - 0.004) a = Math.max(a, h2 + 0.006);
    }
    pn.a = a; pn.b = b;
  }
  /* 第二轮：同轴的销与销在重叠处对接分开（各自只留在自己那一段） */
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const A = pins[i], B = pins[j];
      if (A.owner === B.owner) continue;
      if (Math.hypot(A.px - B.px, A.py - B.py) > 0.012) continue;
      if (A.b <= B.a + 0.012 || B.b <= A.a + 0.012) continue;
      /* 重叠区 [lo,hi]：按各自所在层的前后关系，在中线处断开 */
      const lo = Math.max(A.a, B.a), hi = Math.min(A.b, B.b);
      const mid = (lo + hi) / 2;
      const Ac = (A.a + A.b) / 2, Bc = (B.a + B.b) / 2;
      const [front, back] = Ac <= Bc ? [B, A] : [A, B];
      if (back.b > mid - 0.005) back.b = mid - 0.005;
      if (front.a < mid + 0.005) front.a = mid + 0.005;
    }
  }
  /* 落盘 */
  for (const pn of pins) {
    if (pn.b - pn.a < 0.04) { pn.pr._del = 1; continue; }
    pn.pr.h = +(pn.b - pn.a).toFixed(3);
    pn.pr.p = [pn.px, pn.py, +((pn.a + pn.b) / 2).toFixed(3)];
  }
  parts.forEach(p => { p.b = p.b.filter(pr => !pr._del); });
}

MECH_ORDER.forEach(id => fitPins(MECHS[id]));

/* 采样一遍，把摆幅 / 行程测出来，界面上直接用真值 */
Object.values(MECHS).forEach(m => {
  if (!m.measure) return;
  m.metrics = m.measure.map(mk => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 240; i++) {
      const v = m.pose(i / 240 * TAU).n[mk.key];
      if (typeof v === 'number' && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    return { label: mk.label, text: `${lo.toFixed(mk.dec)}${mk.unit} ~ ${hi.toFixed(mk.dec)}${mk.unit}` };
  });
});
