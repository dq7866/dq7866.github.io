// 形状库：积木由"占位格"组成
// 格坐标 c=列(X) r=行(Z) l=层(Y)，单位 = 1 格
const G = (c, r, l = 0) => ({ c, r, l });

function box(w, d, h = 1) {
  const out = [];
  for (let l = 0; l < h; l++) for (let r = 0; r < d; r++) for (let c = 0; c < w; c++) out.push(G(c, r, l));
  return out;
}

/** 由 2D 图案生成，每行一个字符串，'#' 表示有积木（行 = Z 方向） */
function pattern(rows) {
  const out = [];
  const w = Math.max(...rows.map(r => r.length));
  rows.forEach((row, r) => {
    const pad = (w - row.length) / 2;
    [...row].forEach((ch, c) => {
      if (ch === '#') out.push(G(Math.round(c + pad), r, 0));
    });
  });
  return out;
}

/** 一圈格子（圆环/管子用：中间留空，可以穿东西过去） */
function ringCells(w, d, h) {
  const out = [];
  for (let l = 0; l < h; l++)
    for (let r = 0; r < d; r++)
      for (let c = 0; c < w; c++) {
        const edge = c === 0 || c === w - 1 || r === 0 || r === d - 1;
        if (edge) out.push(G(c, r, l));
      }
  return out;
}

/**
 * 竖立圆环的占位格（月洞环）：w×h 的方框里取内外半径之间的环带，
 * 中间留空当门洞。格心和圆心按 0.5 偏移算，格子与拱石实体才对得上。
 */
function bandCells(w, h, rIn, rOut) {
  const out = [];
  const cx = w / 2, cy = h / 2;
  for (let l = 0; l < h; l++) {
    for (let c = 0; c < w; c++) {
      const d = Math.hypot(c + 0.5 - cx, l + 0.5 - cy);
      if (d >= rIn && d <= rOut) out.push(G(c, 0, l));
    }
  }
  return out;
}

/** 半圆拱的占位格：圆心落在底边中点，往上取一环楔形拱石 */
function archCells(w, h, rIn, rOut) {
  const out = [];
  const cx = w / 2;
  for (let l = 0; l < h; l++) {
    for (let c = 0; c < w; c++) {
      const d = Math.hypot(c + 0.5 - cx, l + 0.5);
      if (d >= rIn && d <= rOut) out.push(G(c, 0, l));
    }
  }
  return out;
}

// cat：base 基础 / round 圆弧球 / slope 斜面阶梯 / fun 造型装饰
// geo + size：外观用真正的曲面实体（占位格照旧，保证吸附与稳固判定）

// ===== 齿轮参数化 =====
// 节圆半径 = 齿数 × 模数（模数取 0.097，16 齿正好占满 3×3 格）。
// 两个齿轮要咬合，模数必须一样——全套零件共用这一个模数，几何与
// 传动解算（drive.js 的齿数比）都从这里取数。
export const GEAR_MODULE = 0.097;
export const gearR = teeth => teeth * GEAR_MODULE;

/** 齿数滑块的参数定义（大齿轮 8–16、小齿轮 5–10） */
const gearP = (min, max, def) => ({
  key: 'teeth', label: '齿数', min, max, step: 1, def,
  fmt: v => `${v} 齿`,
});

export const SHAPES = [
  // —— 基础 ——
  { id: 'cube',     name: '方块',   tag: '万用', cat: 'base', cells: box(1, 1, 1) },
  { id: 'brick2',   name: '两格砖', tag: '墙体', cat: 'base', cells: box(2, 1, 1) },
  { id: 'brick4',   name: '四格砖', tag: '地基', cat: 'base', cells: box(4, 1, 1) },
  { id: 'brick6',   name: '六格砖', tag: '长梁', cat: 'base', cells: box(6, 1, 1) },
  { id: 'plate2x2', name: '方板',   tag: '地板', cat: 'base', cells: box(2, 2, 1) },
  { id: 'plate2x4', name: '长板',   tag: '平台', cat: 'base', cells: box(4, 2, 1) },
  { id: 'plate4x4', name: '大地板', tag: '广场', cat: 'base', cells: box(4, 4, 1) },
  { id: 'cube2',    name: '大立方', tag: '体积', cat: 'base', cells: box(2, 2, 2) },
  { id: 'column',   name: '立柱',   tag: '高度', cat: 'base', cells: box(1, 1, 4) },
  // —— 带孔积木：真通孔，螺钉穿过、螺母从背面拧上（紧固件才有地方"插进去"） ——
  { id: 'holeBrick', name: '带孔砖',  tag: '每格通孔', cat: 'hole', geo: 'holeBrick', size: [2, 2, 1], studs: 'none', cells: box(2, 2, 1) },
  { id: 'holeBeam',  name: '带孔梁',  tag: '四孔梁',   cat: 'hole', geo: 'holeBrick', size: [1, 4, 1], studs: 'none', cells: box(1, 4, 1) },
  { id: 'holeBlock', name: '带孔大块', tag: '两层通孔', cat: 'hole', geo: 'holeBrick', size: [2, 2, 2], studs: 'none', cells: box(2, 2, 2) },
  { id: 'holePlate', name: '带孔长板', tag: '4×2板',   cat: 'hole', geo: 'holeBrick', size: [4, 2, 1], studs: 'none', cells: box(4, 2, 1) },
  { id: 'holePlate4', name: '带孔大板', tag: '4×4板',  cat: 'hole', geo: 'holeBrick', size: [4, 4, 1], studs: 'none', cells: box(4, 4, 1) },
  { id: 'holeCube',  name: '带孔方块', tag: '1格通孔', cat: 'hole', geo: 'holeBrick', size: [1, 1, 1], studs: 'none', cells: box(1, 1, 1) },
  // v1.31 形状补齐：大尺寸变体（巨板/超长梁/特大方），大场景不用再拼小砖
  { id: 'plate6x6', name: '巨幅板', tag: '6×6板', cat: 'base', cells: box(6, 6, 1) },
  { id: 'beam8',    name: '八格梁', tag: '超长梁', cat: 'base', cells: box(8, 1, 1) },
  { id: 'cube3',    name: '特大方', tag: '3×3体', cat: 'base', cells: box(3, 3, 3) },
  { id: 'corner',   name: '转角',   tag: '拐弯', cat: 'base', cells: [
      G(0, 0), G(0, 1), G(0, 2), G(1, 2), G(2, 2),
    ] },

  // —— 圆弧 / 球 / 管 ——
  { id: 'cyl',      name: '圆柱',   tag: '圆柱体', cat: 'round', geo: 'cylinder', size: [2, 2, 2], studs: 'center', cells: box(2, 2, 2) },
  { id: 'cylTall',  name: '长圆柱', tag: '塔身',   cat: 'round', geo: 'cylinder', size: [2, 2, 3], studs: 'center', cells: box(2, 2, 3) },
  { id: 'rod',      name: '圆棒',   tag: '轴杆',   cat: 'round', geo: 'cylinder', size: [1, 1, 3], studs: 'center', cells: box(1, 1, 3) },
  { id: 'disc',     name: '圆盘',   tag: '车轮',   cat: 'round', geo: 'cylinder', size: [3, 3, 1], studs: 'center', cells: box(3, 3, 1) },
  { id: 'cone',     name: '圆锥',   tag: '尖顶',   cat: 'round', geo: 'cone',     size: [2, 2, 2], studs: 'center', cells: box(2, 2, 2) },
  { id: 'dome',     name: '圆顶',   tag: '半球',   cat: 'round', geo: 'dome',     size: [2, 2, 1], studs: 'center', cells: box(2, 2, 1) },
  { id: 'ball',     name: '圆球',   tag: '球体',   cat: 'round', geo: 'sphere',   size: [2, 2, 2], studs: 'center', cells: box(2, 2, 2) },
  { id: 'ballS',    name: '小球',   tag: '弹珠',   cat: 'round', geo: 'sphere',   size: [1, 1, 1], studs: 'center', cells: box(1, 1, 1) },
  { id: 'tube',     name: '圆管',   tag: '管状体', cat: 'round', geo: 'tube',     size: [3, 3, 2], studs: 'ring',   cells: ringCells(3, 3, 2) },
  { id: 'ring',     name: '圆环',   tag: '甜甜圈', cat: 'round', geo: 'ring',     size: [3, 3, 1], studs: 'none',   cells: ringCells(3, 3, 1) },

  // v1.31 形状补齐：半圆板 / 半管槽 / 锥台
  { id: 'halfDisc', name: '半圆板', tag: '月牙台', cat: 'round', geo: 'halfDisc',  size: [2, 1, 2], studs: 'none', cells: box(2, 1, 2) },
  { id: 'halfPipe', name: '半管槽', tag: '水槽滑道', cat: 'round', geo: 'halfPipe',  size: [2, 1, 2], studs: 'none', cells: box(2, 1, 2) },
  { id: 'frustum',  name: '锥台',   tag: '花盆桶', cat: 'round', geo: 'frustum',   size: [2, 2, 2], studs: 'none', cells: box(2, 2, 2) },

  // —— 斜面 / 阶梯 ——
  { id: 'ramp',     name: '斜坡',   tag: '屋顶',   cat: 'slope', cells: [
      G(0, 0, 2), G(1, 0, 2),
      G(0, 1, 1), G(1, 1, 1),
      G(0, 2, 0), G(1, 2, 0),
    ] },
  { id: 'wedge',    name: '楔形',   tag: '斜块',   cat: 'slope', geo: 'wedge', size: [2, 1, 1], studs: 'none', cells: box(2, 1, 1) },
  { id: 'wedgeL',   name: '长楔形', tag: '滑梯',   cat: 'slope', geo: 'wedge', size: [4, 1, 1], studs: 'none', cells: box(4, 1, 1) },
  { id: 'roof',     name: '人字顶', tag: '屋脊',   cat: 'slope', geo: 'prism', size: [3, 2, 2], studs: 'none', cells: box(3, 2, 2) },
  { id: 'stairs',   name: '台阶',   tag: '楼梯',   cat: 'slope', cells: [
      G(0, 0, 0), G(1, 0, 0), G(0, 1, 0), G(1, 1, 0), G(0, 2, 0), G(1, 2, 0),
      G(0, 1, 1), G(1, 1, 1), G(0, 2, 1), G(1, 2, 1),
      G(0, 2, 2), G(1, 2, 2),
    ] },
  // 楔形拱石拼出来的圆：一整圈/半圈拱券，外观是一块块带缝的拱石
  { id: 'moonRing', name: '月洞环', tag: '圆洞门', cat: 'slope', geo: 'archRing', size: [6, 1, 6], studs: 'none', cells: bandCells(6, 6, 2, 3) },
  { id: 'archTop',  name: '拱券',   tag: '石拱桥', cat: 'slope', geo: 'archTop',  size: [6, 1, 3], studs: 'none', cells: archCells(6, 3, 2, 3) },
  { id: 'chamfer',  name: '切角砖', tag: '磨圆角', cat: 'slope', geo: 'chamfer',  size: [1, 1, 1], studs: 'none', cells: box(1, 1, 1) },

  // v1.31 形状补齐：1/4 圆弯角 / 弯道桥 / 梯形块（对照单元积木国标清单）
  { id: 'quarter',   name: '直角扇', tag: '圆角转台', cat: 'slope', geo: 'quarter',    size: [2, 2, 1], studs: 'none', cells: box(2, 2, 1) },
  { id: 'curvePath', name: '弯道桥', tag: '小弯曲', cat: 'slope', geo: 'curvePath',  size: [2, 2, 1], studs: 'none', cells: box(2, 2, 1) },
  { id: 'trapezoid', name: '梯形块', tag: '护坡堤岸', cat: 'slope', geo: 'trapezoid', size: [2, 1, 1], studs: 'none', cells: box(2, 1, 1) },

  // —— 造型 / 装饰 ——
  // 拱门/窗框的外观是一块竖着的墙板，占位格也必须竖着，
  // 否则"立着的门"却占了一片平地，会和墙砖悄悄叠在一起
  { id: 'arch',     name: '拱门',   tag: '圆拱',   cat: 'fun', geo: 'arch', size: [3, 1, 3], studs: 'grid', cells: [
      G(0, 0, 0), G(0, 0, 1), G(0, 0, 2),
      G(2, 0, 0), G(2, 0, 1), G(2, 0, 2),
      G(1, 0, 2),
    ] },
  { id: 'window',   name: '窗框',   tag: '细节',   cat: 'fun', cells: [
      G(0, 0, 0), G(2, 0, 0), G(0, 0, 1), G(2, 0, 1), G(0, 0, 2), G(2, 0, 2),
    ] },
  { id: 'tri',      name: '三角',   tag: '尖角',   cat: 'fun', cells: [
      G(1, 0, 1), G(0, 1, 0), G(1, 1, 0), G(2, 1, 0),
    ] },
  { id: 'tetra',    name: '金字塔', tag: '纪念碑', cat: 'fun', cells: [
      G(1, 1, 0), G(0, 1, 0), G(2, 1, 0), G(1, 0, 0), G(1, 2, 0), G(1, 1, 1),
    ] },
  { id: 'plus',     name: '十字块', tag: '交叉',   cat: 'fun', cells: [
      G(1, 0), G(0, 1), G(1, 1), G(2, 1), G(1, 2),
    ] },
  { id: 'hex',      name: '六棱柱', tag: '蜂巢',   cat: 'fun', geo: 'hex',  size: [2, 2, 1], studs: 'center', cells: box(2, 2, 1) },
  { id: 'tpiece',   name: 'T形件',  tag: '丁字三通', cat: 'fun', cells: [
      G(-1, 0, 0), G(0, 0, 0), G(1, 0, 0), G(0, 0, 1),
    ] },
  { id: 'star',     name: '星星',   tag: '闪光',   cat: 'fun', geo: 'star', size: [3, 3, 1], studs: 'center', cells: box(3, 3, 1) },
  { id: 'heart',    name: '爱心',   tag: '礼物',   cat: 'fun', cells: pattern([
      '.##.##.',
      '#######',
      '#######',
      '.#####.',
      '..###..',
      '...#...',
    ]) },

  // —— 连接件：贴着积木放，用来把构件固定住（fix 标记见下方说明） ——
  { id: 'rivet', name: '铆钉',   tag: '铆接',  cat: 'join', geo: 'rivet', size: [1, 1, 1], studs: 'none', fix: true, sink: 0.1,  cells: box(1, 1, 1) },
  { id: 'screw', name: '螺钉',   tag: '螺丝',  cat: 'join', geo: 'screw', size: [1, 1, 1], studs: 'none', fix: true, sink: 0.14, cells: box(1, 1, 1) },
  { id: 'bolt',  name: '螺栓',   tag: '加螺母', cat: 'join', geo: 'bolt',  size: [1, 1, 1], studs: 'none', fix: true, sink: 0.12, cells: box(1, 1, 1) },
  { id: 'nut',   name: '螺母',   tag: '六角',   cat: 'join', geo: 'nut',   size: [1, 1, 1], studs: 'none', fix: true, sink: 0.06, cells: box(1, 1, 1) },
  { id: 'washer', name: '垫圈',  tag: '平垫',   cat: 'join', geo: 'washer', size: [1, 1, 1], studs: 'none', fix: true, sink: 0.02, cells: box(1, 1, 1) },
  { id: 'tenon', name: '卯榫',   tag: '榫接',  cat: 'join', geo: 'tenon', size: [1, 1, 1], studs: 'none', fix: true, sink: 0.18, cells: box(1, 1, 1) },
  { id: 'peg',   name: '木钉',   tag: '木工',  cat: 'join', geo: 'peg',   size: [1, 1, 1], studs: 'none', fix: true, sink: 0.22, cells: box(1, 1, 1) },
  { id: 'glue',  name: '粘合胶', tag: '胶接',  cat: 'join', geo: 'glue',  size: [1, 1, 1], studs: 'none', fix: true, cells: box(1, 1, 1) },

  // —— 咬合结构：榫头伸出去、卯口吃进来、销子打个对穿 ——
  // fix:true 表示"自带锁扣"：可以顶着柱子悬挑出去，不必下面垫东西
  { id: 'tenonBar',   name: '凸榫梁', tag: '榫头外露', cat: 'lock', geo: 'tenonBar',   size: [2, 1, 1], studs: 'none', keep: true, fix: true, cells: box(2, 1, 1) },
  { id: 'mortiseBar', name: '卯眼梁', tag: '透卯口',   cat: 'lock', geo: 'mortiseBar', size: [2, 1, 1], studs: 'none', keep: true, fix: true, cells: box(2, 1, 1) },
  { id: 'pin',        name: '穿销',   tag: '钉穿两层', cat: 'lock', geo: 'pin',        size: [1, 1, 1], studs: 'none', fix: true, sink: 0.42, cells: box(1, 1, 1) },
  { id: 'clamp',      name: '卡箍',   tag: '跨缝锁扣', cat: 'lock', geo: 'clamp',      size: [1, 1, 1], studs: 'none', keep: true, fix: true, cells: box(1, 1, 1) },
  { id: 'dovetail',   name: '燕尾榫', tag: '越压越紧', cat: 'lock', geo: 'dovetail',   size: [1, 1, 1], studs: 'none', cells: box(1, 1, 1) },

  // —— 机械传动：齿轮、轮、轴、链、带、电机 ——
  // 齿轮/车轮默认"竖着立"（跟真机器一样），按 Q 键可以放倒当转盘
  // spin：绕哪根轴转（默认朝向下）· r：节圆半径 · hub：轴毂半径（同轴判定用）
  // power：动力源转速（rad/s）· pinR：曲柄销偏距 · slide：活塞滑动方向 · chain/conrod：传动标记
  // pdef：装配台里可以调的「主要参数」——改了立即重建几何、传动比也跟着变
  { id: 'motor',     name: '电机',   tag: '转速可调', cat: 'mech', geo: 'motor', size: [2, 2, 2], studs: 'none', keep: true, spin: 'x', r: 0.5, hub: 0.65, power: 2.4, cells: box(2, 2, 2),
    pdef: [{ key: 'power', label: '转速', min: 0.5, max: 6, step: 0.1, def: 2.4, fmt: v => `${v.toFixed(1)} rad/s` }] },
  { id: 'axle',      name: '传动轴', tag: '带键槽',  cat: 'mech', geo: 'axle',  size: [3, 1, 1], studs: 'none', spin: 'x', r: 0.25, hub: 0.3,  cells: box(3, 1, 1) },
  { id: 'coupling',  name: '联轴器', tag: '同轴对接', cat: 'mech', geo: 'coupling', size: [2, 1, 1], studs: 'none', spin: 'x', r: 0.35, hub: 0.62, coupling: true, cells: box(2, 1, 1) },
  { id: 'universal', name: '万向节', tag: '成角传动', cat: 'mech', geo: 'universal', size: [2, 1, 1], studs: 'none', spin: 'x', r: 0.3, hub: 0.4, universal: true, cells: box(2, 1, 1) },
  { id: 'gearBig',   name: '大齿轮', tag: '齿数可调', cat: 'mech', geo: 'gear16', size: [3, 1, 3], studs: 'none', spin: 'z', r: gearR(16), teeth: 16, hub: 0.75, cells: box(3, 1, 3),
    pdef: [gearP(8, 16, 16)] },
  { id: 'gearSmall', name: '小齿轮', tag: '齿数可调', cat: 'mech', geo: 'gear10', size: [2, 1, 2], studs: 'none', spin: 'z', r: gearR(10), teeth: 10, hub: 0.6,  cells: box(2, 1, 2),
    pdef: [gearP(5, 10, 10)] },
  { id: 'worm',      name: '蜗杆',   tag: '头数可调', cat: 'mech', geo: 'worm',  size: [2, 1, 1], studs: 'none', spin: 'x', r: 0.32, hub: 0.3, worm: true, starts: 1, cells: box(2, 1, 1),
    pdef: [{ key: 'starts', label: '头数', min: 1, max: 3, step: 1, def: 1, fmt: v => `${v} 头` }] },
  // 齿轮齿条：齿轮一转，齿条就笔直地推出去——机床工作台、汽车转向机都用它
  { id: 'rack',      name: '齿条',   tag: '走直线',  cat: 'mech', geo: 'rack',  size: [4, 1, 1], studs: 'none', rack: true, cells: box(4, 1, 1) },
  { id: 'pulley',    name: '皮带轮', tag: 'V 形槽',  cat: 'mech', geo: 'pulley', size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.95, hub: 0.6,  cells: box(2, 1, 2) },
  { id: 'belt',      name: '皮带',   tag: '长度可调', cat: 'mech', geo: 'belt',  size: [2, 1, 1], studs: 'none', belt: true, cells: box(2, 1, 1),
    pdef: [{ key: 'links', label: '长度', min: 2, max: 8, step: 1, def: 2, fmt: v => `${v} 段` }] },
  { id: 'chain',     name: '链条',   tag: '节数可调', cat: 'mech', geo: 'chain',  size: [2, 1, 1], studs: 'none', chain: true, keep: true, cells: box(2, 1, 1),
    pdef: [{ key: 'links', label: '节数', min: 2, max: 10, step: 1, def: 3, fmt: v => `${v} 节` }] },
  { id: 'tire',      name: '车轮',   tag: '轮胎轮毂', cat: 'mech', geo: 'tire',  size: [3, 1, 3], studs: 'none', spin: 'z', r: 1.48, hub: 0.55, cells: box(3, 1, 3) },

  // —— v1.28 补齐的机械零件：蜗轮、链轮、法兰、气缸、阀、花键轴、双联齿轮 ——
  // 机械设计里常用的几大类这里都能找到对应件：齿轮/蜗轮/链轮/双联轮（传动）、
  // 曲轴/曲柄盘/偏心轮/凸轮（把转动变成往复或摆动）、轴/花键轴/联轴器/法兰（连轴）、
  // 轴承/轴承座/导轨/滑块（支承导向）、螺栓螺母垫圈销（紧固）。
  { id: 'wormWheel', name: '蜗轮',   tag: '配蜗杆减速', cat: 'mech', geo: 'wormWheel', size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.94, hub: 0.62, teeth: 24, cells: box(2, 1, 2),
    pdef: [{ key: 'teeth', label: '齿数', min: 16, max: 32, step: 1, def: 24, fmt: v => `${v} 齿` }] },
  { id: 'sprocket',  name: '链轮',   tag: '咬链条',   cat: 'mech', geo: 'sprocket',  size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.9,  hub: 0.55, teeth: 12, cells: box(2, 1, 2),
    pdef: [{ key: 'teeth', label: '齿数', min: 8, max: 20, step: 1, def: 12, fmt: v => `${v} 齿` }] },
  { id: 'gearStep',  name: '双联齿轮', tag: '一级换速', cat: 'mech', geo: 'gearStep', size: [3, 1, 3], studs: 'none', spin: 'z', r: 1.16, hub: 0.5, teeth: 12, cells: box(3, 1, 3),
    pdef: [{ key: 'teeth', label: '大轮齿数', min: 10, max: 16, step: 1, def: 12, fmt: v => `${v} 齿` }] },
  { id: 'flange',    name: '法兰',   tag: '盘面对接', cat: 'part', geo: 'flange',    size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.92, hub: 0.6, cells: box(2, 1, 2) },
  { id: 'splineShaft', name: '花键轴', tag: '滑移传动', cat: 'mech', geo: 'splineShaft', size: [3, 1, 1], studs: 'none', spin: 'x', r: 0.24, hub: 0.3, cells: box(3, 1, 1) },

  // —— 机械机构：把转动变成各种运动的花样 ——
  { id: 'crank',     name: '曲轴',   tag: '销距可调', cat: 'mech2', geo: 'crank', size: [3, 1, 1], studs: 'none', spin: 'x', r: 0.3,  hub: 0.35, power: 2.4, cells: box(3, 1, 1),
    pdef: [{ key: 'pinR', label: '销偏距', min: 0.15, max: 0.5, step: 0.01, def: 0.3, fmt: v => v.toFixed(2) }] },
  // v1.26：连杆加长到 3 格（原来 2 格）。2 格的连杆两端轴孔距只有 1.27 格，
  // 而卧式曲柄滑块的销距是 2.2 格左右 —— 硬把短连杆套上去，两端必然插进曲柄盘和活塞里，
  // 这正是"连杆穿模"的根因。3 格连杆的孔距 2.27 格，正好等于实际销距，两端真正套在销上。
  { id: 'conrod',    name: '连杆',   tag: '两端轴孔', cat: 'mech2', geo: 'conrod', size: [1, 1, 3], studs: 'none', conrod: true, cells: box(1, 1, 3) },
  { id: 'piston',    name: '活塞',   tag: '往复运动', cat: 'mech2', geo: 'piston', size: [1, 1, 2], studs: 'none', slide: 'y', cells: box(1, 1, 2) },
  { id: 'cam',       name: '凸轮',   tag: '升程可调', cat: 'mech2', geo: 'cam',   size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.62, hub: 0.4,  cells: box(2, 1, 2),
    pdef: [{ key: 'lift', label: '升程', min: 0.2, max: 0.7, step: 0.01, def: 0.42, fmt: v => `${Math.round(v * 100)}%` }] },
  // 槽轮机构（马耳他十字）：拨盘转一整圈，槽轮只「哒」地步进一格，
  // 电影放映机、自动机床的转位都靠它——拨销进槽才带动，出槽就锁死
  { id: 'genevaDrive', name: '拨盘', tag: '槽轮主动', cat: 'mech2', geo: 'genevaDrive', size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.9, hub: 0.6, pinR: 1.05, power: 2.4, genevaPin: true, keep: true, cells: box(2, 2, 2),
    pdef: [{ key: 'pinR', label: '销距', min: 0.6, max: 1.2, step: 0.01, def: 1.05, fmt: v => v.toFixed(2) }] },
  { id: 'genevaWheel', name: '槽轮', tag: '间歇步进', cat: 'mech2', geo: 'genevaWheel', size: [3, 1, 3], studs: 'none', spin: 'z', r: 1.48, hub: 0.7, geneva: true, slots: 4, cells: box(3, 1, 3),
    pdef: [{ key: 'slots', label: '槽数', min: 3, max: 6, step: 1, def: 4, fmt: v => `${v} 槽` }] },
  // 棘轮棘爪：只能往一个方向转，倒转就被爪子卡住——卷扬机、手扳葫芦的防倒转
  { id: 'ratchet',   name: '棘轮',   tag: '齿数可调', cat: 'mech2', geo: 'ratchet', size: [3, 1, 3], studs: 'none', spin: 'z', r: 1.45, hub: 0.76, ratchet: true, cells: box(3, 1, 3),
    pdef: [{ key: 'teeth', label: '齿数', min: 8, max: 20, step: 1, def: 12, fmt: v => `${v} 齿` }] },
  { id: 'pawl',      name: '棘爪',   tag: '防倒转',  cat: 'mech2', geo: 'pawl',  size: [1, 1, 2], studs: 'none', slide: 'y', keep: true, cells: box(1, 1, 2) },
  { id: 'leadScrew', name: '丝杠',   tag: '螺距可调', cat: 'mech2', geo: 'leadScrew', size: [3, 1, 1], studs: 'none', spin: 'x', r: 0.22, hub: 0.28, cells: box(3, 1, 1),
    pdef: [{ key: 'lead', label: '螺距', min: 0.18, max: 0.5, step: 0.01, def: 0.3, fmt: v => v.toFixed(2) }] },
  { id: 'leadNut',   name: '丝杠螺母', tag: '走直线', cat: 'mech2', geo: 'leadNut', size: [1, 1, 1], studs: 'none', slide: 'x', cells: box(1, 1, 1) },
  { id: 'crankDisc', name: '曲柄盘', tag: '圆盘曲柄', cat: 'mech2', geo: 'crankDisc', size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.92, hub: 0.5, power: 2.4, cells: box(2, 1, 2),
    pdef: [{ key: 'pinR', label: '销偏距', min: 0.15, max: 0.6, step: 0.01, def: 0.3, fmt: v => v.toFixed(2) }] },
  { id: 'eccentric', name: '偏心轮', tag: '偏心往复', cat: 'mech2', geo: 'eccentric', size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.72, hub: 0.5, power: 2.0, cells: box(2, 1, 2),
    pdef: [{ key: 'eccR', label: '偏心距', min: 0.12, max: 0.34, step: 0.01, def: 0.22, fmt: v => v.toFixed(2) }] },
  { id: 'flywheel',  name: '飞轮',   tag: '储能稳速', cat: 'mech2', geo: 'flywheel', size: [3, 1, 3], studs: 'none', spin: 'z', r: 1.45, hub: 0.76, cells: box(3, 1, 3) },
  { id: 'spring',    name: '发条',   tag: '圈数可调', cat: 'mech2', geo: 'spring', size: [2, 2, 1], studs: 'none', spin: 'y', r: 0.82, hub: 0.5, power: 1.8, cells: box(2, 2, 1),
    pdef: [{ key: 'turns', label: '圈数', min: 1.5, max: 4, step: 0.1, def: 2.6, fmt: v => `${v.toFixed(1)} 圈` }] },
  { id: 'coilSpring', name: '压簧',  tag: '圈数可调', cat: 'mech2', geo: 'coilSpring', size: [1, 1, 2], studs: 'none', deform: 'y', cells: box(1, 1, 2),
    pdef: [{ key: 'turns', label: '圈数', min: 3, max: 10, step: 1, def: 6, fmt: v => `${v} 圈` }] },

  // —— 机械零件：支撑、导向与标准件 ——
  { id: 'bearing',   name: '轴承',   tag: '滚珠',    cat: 'part', geo: 'bearing', size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.85, hub: 0.5, cells: box(2, 1, 2) },
  { id: 'pillow',    name: '轴承座', tag: '支承轴',  cat: 'part', geo: 'pillow', size: [2, 2, 2], studs: 'none', spin: 'z', r: 0.7, hub: 0.45, cells: box(2, 2, 2) },
  { id: 'rail',      name: '导轨',   tag: '直线导向', cat: 'part', geo: 'rail',  size: [4, 1, 1], studs: 'none', cells: box(4, 1, 1) },
  { id: 'slider',    name: '滑块',   tag: '直线运动', cat: 'part', geo: 'slider', size: [1, 1, 1], studs: 'none', slide: 'x', cells: box(1, 1, 1) },
  { id: 'cylinderBlock', name: '气缸', tag: '活塞往复', cat: 'part', geo: 'cylinderBlock', size: [1, 1, 2], studs: 'none', slide: 'y', cells: box(1, 1, 2) },
  { id: 'valve',     name: '阀',     tag: '配汽止回', cat: 'part', geo: 'valve',     size: [1, 1, 2], studs: 'none', slide: 'y', cells: box(1, 1, 2) },
  { id: 'gusset',    name: '筋板',   tag: '三角加强', cat: 'part', geo: 'gusset', size: [2, 1, 2], studs: 'none', fix: true, cells: box(2, 1, 2) },

  // —— v1.21 装配连接件 ——
  // 传动解算允许「同轴但隔了 2~3 格」的两件互相带动（联轴器/轴承座接力），
  // 可实体上那段是空的，看起来就是断开的悬空件。跨接光轴把这段补成看得见的轴，
  // 半径 = 统一配合轴，能真正穿进轮毂的通孔而不切进实体；轴肩外径 < 配合孔，
  // 两端正好顶住相邻件的轮毂端面。axisY 用来对齐不同高度零件的轴心（盘件 1.5、机座件 0.96）。
  { id: 'shaftSpan', name: '跨接轴',   tag: '两格接长', cat: 'part', geo: 'shaftSpan', size: [2, 1, 1], studs: 'none', keep: true, cells: box(2, 1, 1) },
  { id: 'shaftLong', name: '长跨接轴', tag: '四格接长', cat: 'part', geo: 'shaftSpan', size: [4, 1, 1], studs: 'none', keep: true, cells: box(4, 1, 1) },
  // 轴套/隔套：套在跨接轴上填两轮之间的端面间隙，中心孔就是统一配合孔，轴穿过去不打架
  { id: 'bushing',   name: '轴套',     tag: '端面隔套', cat: 'part', geo: 'bushing',  size: [1, 1, 1], studs: 'none', keep: true, cells: box(1, 1, 1) },
  // 机座支柱：把悬空的轴承座、轴端、滑块托到底板上，顶端 U 形槽正好抱住细轴
  { id: 'pedestal',  name: '机座支柱', tag: '托轴落地', cat: 'part', geo: 'pedestal', size: [1, 1, 2], studs: 'none', cells: box(1, 1, 2) },
  // v1.22 机座平台：整片连续底座，顶面两条 T 槽凸棱 + 四角沉头安装孔。
  // 以前机构零件直接摆在地上、只垫三块散板，俯视就是一大片空白和"悬空"；
  // 现在机构整体坐到平台上一层，每个零件脚下都有实体，装配关系一眼看得出来。
  { id: 'machineBase', name: '机座平台', tag: 'T槽安装孔', cat: 'part', geo: 'machineBase', size: [4, 4, 1], studs: 'none', fix: true, cells: box(4, 4, 1) },

  // —— v1.19 巧妙机构件：参考「63 个机械结构动图」里的换向、往复、摆动、夹紧与让位 ——
  // bevel：锥齿轮把动力拐 90°；yoke：苏格兰轭输出纯正弦往复；oscillate：摇杆只摆不转
  { id: 'bevelGear',  name: '锥齿轮', tag: '垂直换向', cat: 'mech', geo: 'bevelGear', size: [2, 1, 2], studs: 'none', spin: 'z', r: 0.9, hub: 0.55, teeth: 12, bevel: true, cells: box(2, 1, 2),
    pdef: [{ key: 'teeth', label: '齿数', min: 8, max: 16, step: 1, def: 12, fmt: v => `${v} 齿` }] },
  { id: 'scotchYoke', name: '苏格兰轭', tag: '正弦往复', cat: 'mech2', geo: 'scotchYoke', size: [3, 1, 2], studs: 'none', slide: 'x', yoke: true, cells: box(3, 1, 2) },
  { id: 'rocker',     name: '摇杆',   tag: '左右摆动', cat: 'mech2', geo: 'rocker', size: [3, 1, 1], studs: 'none', spin: 'z', r: 0.3, hub: 0.4, oscillate: true, keep: true, cells: box(3, 1, 1) },
  { id: 'toggleLink', name: '肘杆',   tag: '死点自锁', cat: 'mech2', geo: 'toggleLink', size: [3, 1, 1], studs: 'none', keep: true, cells: box(3, 1, 1) },
  { id: 'clampJaw',   name: '夹爪',   tag: '双向夹紧', cat: 'mech2', geo: 'clampJaw', size: [2, 1, 2], studs: 'none', cells: box(2, 1, 2) },
  // 门形机架：占位中间是空的，往复运动的活塞/连杆可以从门洞里穿过去——
  // 真机器的机架都会给运动件留行程空间，不能用一整块实心砖把路堵死
  { id: 'portal',     name: '龙门架', tag: '中空让位', cat: 'part', geo: 'portal', size: [3, 1, 3], studs: 'none', keep: true, portal: true, cells: [
      G(0, 0, 0), G(0, 0, 1), G(0, 0, 2),
      G(2, 0, 0), G(2, 0, 1), G(2, 0, 2),
      G(1, 0, 2),
    ] },
];

export const SHAPE_CATS = [
  { id: 'base',  name: '基础' },
  { id: 'hole',  name: '带孔' },
  { id: 'round', name: '圆弧球' },
  { id: 'slope', name: '斜面拱' },
  { id: 'fun',   name: '造型' },
  { id: 'lock',  name: '咬合' },
  { id: 'join',  name: '连接' },
  { id: 'mech',  name: '传动' },
  { id: 'mech2', name: '机构' },
  { id: 'part',  name: '零件' },
  { id: 'deco',  name: '装饰' },
  { id: 'my',    name: '我的' },
];

/** 自定义形状（玩家自己拼的）：与内置条目同构，直接进 SHAPES，
 *  这样图标、放置、稳固判定、存档全都不用特判。 */
export function addCustomShape(def) {
  if (!def || !def.id) return;
  const i = SHAPES.findIndex(x => x.id === def.id);
  if (i >= 0) SHAPES.splice(i, 1, def); else SHAPES.push(def);
}

export function removeCustomShape(id) {
  const i = SHAPES.findIndex(x => x.id === id);
  if (i >= 0) SHAPES.splice(i, 1);
}

/**
 * 连接件（fix:true）不是结构积木，而是"紧固件"：
 *  - 必须贴着别的积木才能放（见 World.canPlace）
 *  - 稳固检查里它自己不算悬空，并且会把它贴住的积木一起钉牢
 */

export const PALETTE = [
  { id: 'red',    name: '消防红', hex: 0xe63946 },
  { id: 'orange', name: '阳光橙', hex: 0xff8a3d },
  { id: 'yellow', name: '柠檬黄', hex: 0xffd166 },
  { id: 'green',  name: '草地绿', hex: 0x3fbf6f },
  { id: 'teal',   name: '湖蓝绿', hex: 0x1fb6a6 },
  { id: 'blue',   name: '天空蓝', hex: 0x3a86ff },
  { id: 'navy',   name: '深海蓝', hex: 0x2b3a8f },
  { id: 'purple', name: '葡萄紫', hex: 0x8b5cf6 },
  { id: 'pink',   name: '樱花粉', hex: 0xff8fb1 },
  { id: 'brown',  name: '巧克力', hex: 0x9c6644 },
  { id: 'white',  name: '云朵白', hex: 0xf1f3f8 },
  { id: 'gray',   name: '岩石灰', hex: 0x8d99ae },
];


/* ===================== 装饰件（v1.29.0） =====================
 * 森林/自然题材的水彩插画，做成始终朝向相机的贴图（billboard）。
 * 它们只占 1 格、不承重、不进稳固判定，作用是给积木作品加环境氛围——
 * 小屋旁边站一只鹿、门前放条长凳、院子里栽两棵树。
 * 素材两个来源：站内 forest 图库的现成插画（动物），以及为了补齐
 * 「树/长凳/路灯」这类布景新画的同风格水彩贴纸，压缩后每张 20~110KB。
 * sprite = 图片路径，h = 世界高度（格），aspect = 宽/高，
 * kw = 隐藏搜索词（标题里不显示，但搜得到）。 */
const DECO = [
  // —— 动物 ——
  { id: 'decoDeer',      name: '小鹿',   tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/deer.webp',      h: 2.3, aspect: 0.752,  kw: '鹿 动物 森林 装饰' },
  { id: 'decoFox',       name: '狐狸',   tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/fox.webp',       h: 1.7, aspect: 1.042,  kw: '狐狸 动物 森林 装饰' },
  { id: 'decoRabbit',    name: '兔子',   tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/rabbit.webp',    h: 1.3, aspect: 0.627,  kw: '兔 兔子 动物 森林 装饰' },
  { id: 'decoSquirrel',  name: '松鼠',   tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/squirrel.webp',  h: 1.2, aspect: 0.705,  kw: '松鼠 动物 森林 装饰' },
  { id: 'decoHedgehog',  name: '刺猬',   tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/hedgehog.webp',  h: 0.9, aspect: 1.498,  kw: '刺猬 动物 森林 装饰' },
  { id: 'decoOwl',       name: '猫头鹰', tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/owl.webp',       h: 1.4, aspect: 0.623,  kw: '猫头鹰 鸟 动物 森林 装饰' },
  { id: 'decoButterfly', name: '蝴蝶',   tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/butterfly.webp', h: 0.9, aspect: 1.399,   kw: '蝴蝶 昆虫 装饰' },
  { id: 'decoBee',       name: '小蜜蜂', tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/bee.webp',       h: 0.7, aspect: 0.762,   kw: '蜜蜂 蜂 昆虫 装饰' },
  // —— 布景 ——
  { id: 'decoTree',      name: '大树',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/tree.webp',      h: 3.2, aspect: 0.666, kw: '树 大树 树木 绿树 森林 装饰' },
  { id: 'decoPine',      name: '松树',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/pine.webp',      h: 3.0, aspect: 0.656, kw: '松 松树 针叶 树 圣诞树 装饰' },
  { id: 'decoBush',      name: '灌木',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/bush.webp',      h: 1.2, aspect: 1.056, kw: '灌木 草丛 绿植 装饰' },
  { id: 'decoFlower',    name: '花丛',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/flower.webp',    h: 0.85, aspect: 1.002, kw: '花 花丛 野花 花园 装饰' },
  { id: 'decoMushroom',  name: '蘑菇',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/mushroom.webp',  h: 0.7, aspect: 1.067, kw: '蘑菇 菌 装饰' },
  { id: 'decoRock',      name: '石头',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/rock.webp',      h: 0.6, aspect: 1.092, kw: '石头 岩石 鹅卵石 装饰' },
  { id: 'decoBench',     name: '长凳',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/bench.webp',     h: 0.9, aspect: 1.196, kw: '长凳 长椅 椅子 凳 公园 装饰' },
  { id: 'decoLamp',      name: '路灯',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/lamp.webp',      h: 3.0, aspect: 0.26,  kw: '路灯 灯 街灯 照明 装饰' },
  { id: 'decoSignpost',  name: '路牌',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/signpost.webp',  h: 1.8, aspect: 1.391, kw: '路牌 指示牌 木牌 装饰' },
  { id: 'decoFence',     name: '栅栏',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/fence.webp',     h: 1.2, aspect: 1.182, kw: '栅栏 篱笆 围栏 装饰' },

  // ---- v1.31 装饰补齐：家畜 5 + 飞鸟 1 + 天空 2 + 院子布景 6 ----
  { id: 'decoCat',       name: '小猫',   tag: '家畜', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/cat.webp',       h: 1.3, aspect: 0.771, kw: '猫 小猫 猫咪 动物 宠物 装饰' },
  { id: 'decoDog',       name: '小狗',   tag: '家畜', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/dog.webp',       h: 1.4, aspect: 0.855, kw: '狗 小狗 狗狗 动物 宠物 装饰' },
  { id: 'decoDuck',      name: '鸭子',   tag: '家畜', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/duck.webp',      h: 1.1, aspect: 0.841, kw: '鸭 鸭子 小鸭 动物 农场 装饰' },
  { id: 'decoSheep',     name: '绵羊',   tag: '家畜', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/sheep.webp',     h: 1.3, aspect: 0.842, kw: '羊 绵羊 小羊 农场 动物 装饰' },
  { id: 'decoPony',      name: '小马',   tag: '家畜', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/pony.webp',      h: 1.8, aspect: 0.806, kw: '马 小马 马驹 农场 动物 装饰' },
  { id: 'decoBird',      name: '小鸟',   tag: '森林', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/bird.webp',      h: 0.9, aspect: 0.949, kw: '鸟 小鸟 麻雀 飞鸟 动物 装饰' },
  { id: 'decoCloud',     name: '云朵',   tag: '天空', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/cloud.webp',     h: 1.0, aspect: 1.691, kw: '云 白云 云朵 天空 装饰' },
  { id: 'decoSun',       name: '太阳',   tag: '天空', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/sun.webp',       h: 1.2, aspect: 1.017, kw: '太阳 阳光 日头 天空 装饰' },
  { id: 'decoWell',      name: '水井',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/well.webp',      h: 2.4, aspect: 0.760, kw: '井 水井 古井 院子 装饰' },
  { id: 'decoMailbox',   name: '信箱',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/mailbox.webp',   h: 1.6, aspect: 0.602, kw: '信箱 邮箱 邮筒 邮政 院子 装饰' },
  { id: 'decoLantern',   name: '灯笼',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/lantern.webp',   h: 1.8, aspect: 0.581, kw: '灯笼 灯 红灯笼 中式 节日 装饰' },
  { id: 'decoCampfire',  name: '篝火',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/campfire.webp',  h: 1.0, aspect: 0.829, kw: '火 篝火 营火 露营 柴火 装饰' },
  { id: 'decoWindmill',  name: '风车',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/windmill.webp',  h: 2.8, aspect: 0.659, kw: '风车 磨坊 荷兰 建筑 装饰' },
  { id: 'decoSnowman',   name: '雪人',   tag: '布景', cat: 'deco', cells: [G(0, 0, 0)], sprite: 'assets/deco/snowman.webp',   h: 1.8, aspect: 0.845, kw: '雪人 雪 冬天 圣诞 装饰' },
];
SHAPES.push(...DECO);

export const COLOR_HEX = Object.fromEntries(PALETTE.map(p => [p.id, p.hex]));

export function getShape(id) {
  return SHAPES.find(s => s.id === id) || SHAPES[0];
}
