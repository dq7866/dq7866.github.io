// 图纸：示例模型 + 目标提示
// 每条记录 {shapeId, ry, color, x, y, z}；ry 为绕 Y 轴 90° 的倍数
// rx（绕 X 轴）可选：竖板/竖环等立起来的形状用它
// 约定：沿 X 走的墙用 ry=0 的两格砖/四格砖，沿 Z 走的墙用 ry=1；
//       拱门、窗框本身就是竖直墙板（3 宽 × 1 深 × 3 高），直接嵌在墙里。
// 每块积木都要有支撑（下方有积木，或落在地面上），模型才符合直觉。
import { getShape } from './shapes.js';
import { shapeRot } from './geom.js';
import { applyAssemblyFit } from './assembly-fit.js';

function push(list, shapeId, ry, color, x, y, z, rx = 0, extra = null) {
  const it = { shapeId, ry, color, x, y, z };
  if (rx) it.rx = rx;
  if (extra) Object.assign(it, extra);
  list.push(it);
}

/**
 * 一行一行地砌墙：跳过被占住的格子，空档用两格砖填，
 * 单数空档把方块放在正中间（左右对称，砌出来才对得齐）。
 */
function fillRow(L, color, x0, len, y, z, blocked) {
  let x = x0;
  const end = x0 + len;
  while (x < end) {
    if (blocked.has(`${x},${y}`)) { x++; continue; }
    let e = x;
    while (e < end && !blocked.has(`${e},${y}`)) e++;
    const run = e - x;
    if (run % 2 === 1) {
      const m = Math.floor(run / 2);
      push(L, 'cube', 0, color, x + m, y, z);
      fillRun(L, color, x, m, y, z, false);
      fillRun(L, color, x + m + 1, m, y, z, true);
    } else {
      fillRun(L, color, x, run, y, z, false);
    }
    x = e;
  }
}

/** 铺一段空档：偶数全用两格砖；单数在外侧收一块方块（flip 决定哪头是外侧） */
function fillRun(L, color, start, len, y, z, flip) {
  if (len <= 0) return;
  let from = start;
  if (len % 2 === 1) {
    push(L, 'cube', 0, color, flip ? start + len - 1 : start, y, z);
    from = flip ? start : start + 1;
  }
  for (let k = 0; k < Math.floor(len / 2); k++) push(L, 'brick2', 0, color, from + k * 2, y, z);
}

/** 把一块 w×h 的方框区域标成"已占用"（月洞环 + 门洞用） */
function ringBlocked(w, h, rIn, rOut, cx, cy, ox, oy) {
  const out = new Set();
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const d = Math.hypot(x + 0.5 - (w / 2), y + 0.5 - (h / 2));
      if (d <= rOut) out.add(`${ox + x},${oy + y}`);
    }
  }
  return out;
}

/* ===================== 简单 ===================== */

/**
 * 木马摇摇：一块长板当摇椅、一块长板当马背，
 * 六种形状拼出一只会摇的小马。
 */
function rockingHorse() {
  const L = [];
  // 两条摇板（落地）
  push(L, 'brick4', 0, 'brown', 0, 0, 0);
  push(L, 'brick4', 0, 'brown', 0, 0, 2);
  // 四条小腿
  for (const [lx, lz] of [[1, 0], [2, 0], [1, 2], [2, 2]]) push(L, 'cube', 0, 'brown', lx, 1, lz);
  push(L, 'brick2', 0, 'brown', 1, 0, 1);   // 落地横撑把两条摇板连成一体，两侧仍留空
  // 马背（2×4 板，一头搭在腿上）
  push(L, 'plate2x4', 0, 'orange', 0, 2, 0);
  // 马头、鬃毛、马尾、鞍座
  push(L, 'cube2', 0, 'white', 2, 3, 0);
  push(L, 'brick2', 1, 'red', 1, 3, 0);
  push(L, 'cube', 0, 'red', 0, 3, 0);
  push(L, 'cube', 0, 'orange', 0, 3, 1);
  return L;
}

/** 小方桌：四条腿 + 一块桌面 + 桌上摆件 */
function table() {
  const L = [];
  for (const [lx, lz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) {
    push(L, 'cube', 0, 'brown', lx, 0, lz);
    push(L, 'cube', 0, 'brown', lx, 1, lz);
    push(L, 'cube', 0, 'brown', lx, 2, lz);
  }
  push(L, 'plate4x4', 0, 'orange', 0, 3, 0);
  push(L, 'cube', 0, 'red', 1, 4, 1);
  push(L, 'ballS', 0, 'yellow', 1, 5, 1);
  return L;
}

/** 路灯：底座、灯杆、灯罩和顶珠 */
function lamp() {
  const L = [];
  push(L, 'plate2x2', 0, 'gray', 0, 0, 0);
  push(L, 'column', 0, 'navy', 0, 1, 0);
  push(L, 'cube', 0, 'yellow', 0, 5, 0);
  push(L, 'plate2x2', 0, 'brown', 0, 6, 0);
  push(L, 'ballS', 0, 'white', 0, 7, 0);
  return L;
}

/** 木板凳：四条腿、座板、软垫和靠背 */
function bench() {
  const L = [];
  for (const [lx, lz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) {
    push(L, 'cube', 0, 'brown', lx, 0, lz);
    push(L, 'cube', 0, 'brown', lx, 1, lz);
  }
  push(L, 'plate2x4', 0, 'orange', 0, 2, 0);
  push(L, 'plate2x4', 0, 'orange', 0, 2, 2);
  push(L, 'plate2x2', 0, 'red', 1, 3, 1);
  push(L, 'brick2', 0, 'brown', 0, 3, 3);
  push(L, 'brick2', 0, 'brown', 2, 3, 3);
  push(L, 'plate2x4', 0, 'orange', 0, 4, 3, 1);
  return L;
}

/** 小狗：长身子、四条短腿，坐得端端正正 */
function dog() {
  const L = [];
  // 身体 8 长 × 2 深
  push(L, 'brick4', 0, 'brown', 0, 1, 1);
  push(L, 'brick4', 0, 'brown', 4, 1, 1);
  push(L, 'brick4', 0, 'brown', 0, 1, 2);
  push(L, 'brick4', 0, 'brown', 4, 1, 2);
  // 四条腿
  for (const [lx, lz] of [[0, 1], [7, 1], [0, 2], [7, 2]]) push(L, 'cube', 0, 'brown', lx, 0, lz);
  // 尾巴
  push(L, 'cube', 0, 'brown', 0, 2, 2);
  push(L, 'cube', 0, 'white', 0, 3, 2);
  // 项圈、头、耳朵
  push(L, 'cube', 0, 'red', 7, 2, 1);
  push(L, 'cube', 0, 'brown', 7, 3, 1);
  push(L, 'cube', 0, 'navy', 7, 4, 1);
  return L;
}

/* ===================== 中度 ===================== */

/** 红墙：十二格长墙 + 镂空花窗 + 压顶 */
function redWall() {
  const L = [];
  push(L, 'brick4', 0, 'red', 0, 0, 0);
  push(L, 'brick4', 0, 'red', 4, 0, 0);
  push(L, 'brick4', 0, 'red', 8, 0, 0);
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick4', 0, 'red', 0, y, 0);
    push(L, 'brick4', 0, 'red', 7, y, 0);
    push(L, 'cube', 0, 'red', 11, y, 0);
  }
  for (let y = 1; y <= 3; y++) {
    push(L, 'cube', 0, 'teal', 4, y, 0);
    push(L, 'cube', 0, 'teal', 6, y, 0);
  }
  push(L, 'brick6', 0, 'gray', 0, 4, 0);
  push(L, 'brick6', 0, 'gray', 6, 4, 0);
  push(L, 'cone', 0, 'orange', 1, 5, 0);
  push(L, 'cone', 0, 'orange', 9, 5, 0);
  return L;
}

/**
 * 榫卯板凳：老木匠的做法——凳腿之间不用钉子，
 * 用卯榫把管脚枨（横撑）顶在腿上，座面再用木钉、铆钉锁死。
 */
function tenonBench() {
  const L = [];
  // 四条凳腿（两格高）
  for (const [lx, lz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) {
    push(L, 'cube', 0, 'brown', lx, 0, lz);
    push(L, 'cube', 0, 'brown', lx, 1, lz);
  }
  // 管脚枨：卯榫顶着横撑（前后各一条，左右各一条）
  push(L, 'tenon', 0, 'yellow', 1, 0, 0);
  push(L, 'tenon', 0, 'yellow', 2, 0, 0);
  push(L, 'tenon', 0, 'yellow', 1, 0, 3);
  push(L, 'tenon', 0, 'yellow', 2, 0, 3);
  push(L, 'tenon', 0, 'yellow', 0, 0, 1);
  push(L, 'tenon', 0, 'yellow', 3, 0, 1);
  push(L, 'brick2', 0, 'orange', 1, 1, 0);
  push(L, 'brick2', 0, 'orange', 1, 1, 3);
  push(L, 'brick2', 1, 'orange', 0, 1, 1);
  push(L, 'brick2', 1, 'orange', 3, 1, 1);
  // 座面
  push(L, 'plate2x4', 0, 'orange', 0, 2, 0);
  push(L, 'plate2x4', 0, 'orange', 0, 2, 2);
  // 座面上：前面两颗铆钉、后面两颗木钉
  push(L, 'rivet', 0, 'yellow', 0, 3, 0);
  push(L, 'rivet', 0, 'yellow', 3, 3, 0);
  push(L, 'peg', 0, 'yellow', 0, 3, 3);
  push(L, 'peg', 0, 'yellow', 3, 3, 3);
  return L;
}

/** 红顶小屋：地基、墙体、拱门、后窗和烟囱 */
function cottage() {
  const L = [];
  for (let x = 0; x < 6; x += 2) for (let z = 0; z < 6; z += 2) push(L, 'plate2x2', 0, 'brown', x, 0, z);
  // 前墙 z0：中间留三格给拱门
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 0, 'white', 0, y, 0);
    push(L, 'cube', 0, 'white', 5, y, 0);
  }
  push(L, 'arch', 0, 'brown', 2, 1, 0);
  // 后墙 z5：中间两格换成湖蓝窗
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 0, 'white', 0, y, 5);
    push(L, 'cube', 0, 'teal', 2, y, 5);
    push(L, 'cube', 0, 'teal', 3, y, 5);
    push(L, 'brick2', 0, 'white', 4, y, 5);
  }
  // 侧墙
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 1, 'white', 0, y, 1);
    push(L, 'brick2', 1, 'white', 0, y, 3);
    push(L, 'brick2', 1, 'white', 5, y, 1);
    push(L, 'brick2', 1, 'white', 5, y, 3);
  }
  // 屋内立柱：托住平顶的正中一块
  push(L, 'cube', 0, 'brown', 2, 1, 2);
  push(L, 'cube', 0, 'brown', 2, 2, 2);
  push(L, 'cube', 0, 'brown', 2, 3, 2);
  // 平顶
  for (let x = 0; x < 6; x += 2) for (let z = 0; z < 6; z += 2) push(L, 'plate2x2', 0, 'red', x, 4, z);
  // 屋顶围沿
  for (let x = 0; x < 6; x += 2) {
    push(L, 'brick2', 0, 'red', x, 5, 0);
    push(L, 'brick2', 0, 'red', x, 5, 5);
  }
  push(L, 'brick2', 1, 'red', 0, 5, 1);
  push(L, 'brick2', 1, 'red', 0, 5, 3);
  push(L, 'brick2', 1, 'red', 5, 5, 1);
  push(L, 'brick2', 1, 'red', 5, 5, 3);
  // 烟囱
  push(L, 'cube', 0, 'gray', 4, 5, 2);
  push(L, 'cube', 0, 'gray', 4, 6, 2);
  return L;
}

/** 小跑车：底盘、车身一圈、座舱和四个轮子 */
function car() {
  const L = [];
  for (let x = 0; x < 6; x += 2) for (let z = 0; z < 6; z += 2) push(L, 'plate2x2', 0, 'navy', x, 0, z);
  // 车身一圈（前/后沿 X，两侧沿 Z）
  for (const x of [0, 2, 4]) {
    push(L, 'brick2', 0, 'red', x, 1, 0);
    push(L, 'brick2', 0, 'red', x, 1, 5);
  }
  for (const z of [1, 3]) {
    push(L, 'brick2', 1, 'red', 0, 1, z);
    push(L, 'brick2', 1, 'red', 5, 1, z);
  }
  // 车身内的地板（座舱要有东西托着）
  push(L, 'plate2x2', 0, 'navy', 2, 1, 2);
  // 车头盖与车尾甲板
  for (const [px, pz] of [[0, 0], [2, 0], [4, 0], [0, 2], [4, 2], [0, 4], [4, 4]]) {
    push(L, 'plate2x2', 0, 'orange', px, 2, pz);
  }
  // 座舱
  push(L, 'cube2', 0, 'yellow', 2, 2, 2);
  // 车轮（车身外，落在地面上）
  push(L, 'holeCube', 0, 'white', 0, 0, -1);   // 底盘四角改成带孔方块：螺栓能穿过、螺母从下面锁
  push(L, 'holeCube', 0, 'white', 5, 0, -1);
  push(L, 'holeCube', 0, 'white', 0, 0, 6);
  push(L, 'holeCube', 0, 'white', 5, 0, 6);
  // 轮毂螺栓（一整副：头 + 垫圈 + 螺母）+ 底盘三角筋板 + 车轴滚珠轴承
  push(L, 'bolt', 0, 'gray', 0, 1, -1);
  push(L, 'bolt', 0, 'gray', 5, 1, 6);
  push(L, 'gusset', 0, 'orange', 2, 1, 4);
  push(L, 'bearing', 0, 'white', 2, 0, 6);
  return L;
}

/** 苹果树：树干、三层树冠，还有红苹果 */
function tree() {
  const L = [];
  for (let x = 0; x < 4; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'brown', x, 0, z);
  push(L, 'column', 0, 'brown', 1, 1, 1);
  push(L, 'column', 0, 'brown', 2, 1, 1);
  push(L, 'cube', 0, 'brown', 1, 5, 1);
  push(L, 'cube2', 0, 'green', 0, 6, 0);
  push(L, 'cube2', 0, 'green', 2, 6, 0);
  push(L, 'cube2', 0, 'green', 0, 6, 2);
  push(L, 'cube2', 0, 'green', 2, 6, 2);
  push(L, 'cube2', 0, 'green', 1, 8, 1);
  push(L, 'ballS', 0, 'green', 1, 10, 1);
  // 苹果
  push(L, 'cube', 0, 'red', 0, 8, 1);
  push(L, 'cube', 0, 'red', 3, 8, 2);
  return L;
}

/* ===================== 困难 ===================== */

/** 瞭望塔：四根立柱撑起小屋，考验平衡 */
function tower() {
  const L = [];
  for (let x = 0; x < 4; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'gray', x, 0, z);
  for (const [cx, cz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) push(L, 'column', 0, 'orange', cx, 1, cz);
  for (let x = 0; x < 4; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'yellow', x, 5, z);
  // 塔顶小屋（4×4 一圈）
  for (const x of [0, 2]) {
    push(L, 'brick2', 0, 'purple', x, 6, 0);
    push(L, 'brick2', 0, 'purple', x, 6, 3);
  }
  push(L, 'brick2', 1, 'purple', 0, 6, 1);
  push(L, 'brick2', 1, 'purple', 3, 6, 1);
  push(L, 'plate2x2', 0, 'purple', 1, 6, 1);   // 塔顶屋面：把尖顶接到四圈檐口上
  push(L, 'cone', 0, 'teal', 1, 7, 1);
  push(L, 'ballS', 0, 'white', 1, 9, 1);
  return L;
}

/** 人字顶小屋：拱门、山墙小窗、连续屋脊和烟囱 */
function hut() {
  const L = [];
  push(L, 'plate2x4', 0, 'brown', 0, 0, 0);
  push(L, 'plate2x2', 0, 'brown', 4, 0, 0);
  push(L, 'plate2x2', 0, 'brown', 0, 0, 2);
  push(L, 'plate2x2', 0, 'brown', 2, 0, 2);
  push(L, 'plate2x2', 0, 'brown', 4, 0, 2);
  // 前墙 z0：中间三格留给拱门
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 0, 'white', 0, y, 0);
    push(L, 'cube', 0, 'white', 5, y, 0);
  }
  push(L, 'arch', 0, 'brown', 2, 1, 0);
  // 后墙 z2
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 0, 'white', 0, y, 2);
    push(L, 'brick2', 0, 'white', 2, y, 2);
    push(L, 'brick2', 0, 'white', 4, y, 2);
  }
  // 山墙 x0 / x5（z1），中层湖蓝小窗点缀
  for (let y = 1; y <= 3; y++) {
    const c = y === 2 ? 'teal' : 'white';
    push(L, 'cube', 0, c, 0, y, 1);
    push(L, 'cube', 0, c, 5, y, 1);
  }
  // 屋顶：三块人字顶立起来（ry=1：脊线沿 X 连成一整条，坡向前后）
  push(L, 'roof', 1, 'red', 0, 4, 0);
  push(L, 'roof', 1, 'red', 2, 4, 0);
  push(L, 'roof', 1, 'red', 4, 4, 0);
  // 烟囱
  push(L, 'cube2', 0, 'gray', 2, 6, 1);
  return L;
}

/** 小帆船：船体、甲板、船舱、桅杆与旗杆 */
function ship() {
  const L = [];
  for (let x = 0; x < 8; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'navy', x, 0, z);
  // 船舷：前后沿 X，两舷沿 Z
  for (const x of [0, 2, 4, 6]) {
    push(L, 'brick2', 0, 'blue', x, 1, 0);
    push(L, 'brick2', 0, 'blue', x, 1, 3);
  }
  // 两舷（一条 1×2 的砖正好盖住 z1..2）
  push(L, 'brick2', 1, 'blue', 0, 1, 1);
  push(L, 'brick2', 1, 'blue', 7, 1, 1);
  // 甲板
  for (const z of [1, 2]) for (const x of [1, 3, 5]) push(L, 'brick2', 0, 'white', x, 1, z);
  // 船舱
  push(L, 'cube2', 0, 'white', 2, 2, 1);
  push(L, 'plate2x2', 0, 'red', 2, 4, 1);
  // 桅杆 + 顶灯
  push(L, 'column', 0, 'brown', 6, 2, 1);
  push(L, 'ballS', 0, 'yellow', 6, 6, 1);
  return L;
}

/** 大火箭：箭体、尾焰底座和整流罩，倒计时发射！ */
function rocket() {
  const L = [];
  for (let x = 0; x < 4; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'gray', x, 0, z);
  // 尾焰底座
  for (const [cx, cz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) push(L, 'cube', 0, 'red', cx, 1, cz);
  push(L, 'brick2', 1, 'red', 0, 1, 1);
  push(L, 'brick2', 1, 'red', 3, 1, 1);
  push(L, 'brick2', 0, 'red', 1, 1, 0);
  push(L, 'brick2', 0, 'red', 1, 1, 3);
  // 箭体
  push(L, 'cube2', 0, 'white', 0, 2, 0);
  push(L, 'cube2', 0, 'white', 2, 2, 0);
  push(L, 'cube2', 0, 'white', 0, 2, 2);
  push(L, 'cube2', 0, 'white', 2, 2, 2);
  push(L, 'cube2', 0, 'white', 0, 4, 0);
  push(L, 'cube2', 0, 'white', 2, 4, 0);
  push(L, 'cube2', 0, 'white', 0, 4, 2);
  push(L, 'cube2', 0, 'teal', 2, 4, 2);      // 一块舷窗板
  // 整流罩
  for (let x = 0; x < 4; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'red', x, 6, z);
  push(L, 'cube2', 0, 'red', 1, 7, 1);
  push(L, 'cube', 0, 'red', 1, 9, 1);
  return L;
}

/**
 * 悬挑雨棚：两根立柱撑两道大梁，梁头探出去，
 * 靠螺栓托架和粘合胶把探出的大梁牢牢"锁"在柱头上。
 */
function canopy() {
  const L = [];
  // 地梁
  push(L, 'plate2x4', 0, 'gray', 0, 0, 0);
  push(L, 'plate2x4', 0, 'gray', 0, 0, 2);
  // 两根立柱
  push(L, 'column', 0, 'navy', 0, 1, 0);
  push(L, 'column', 0, 'navy', 0, 1, 3);
  // 大梁探出：柱头一端落地，另一端悬空
  push(L, 'brick6', 0, 'orange', 0, 5, 0);
  push(L, 'brick6', 0, 'orange', 0, 5, 3);
  // 螺栓托架 + 粘合胶：把大梁钉牢在柱头上（螺栓自带垫圈与螺母，不必另摆）
  push(L, 'bolt', 0, 'yellow', 1, 4, 0);
  push(L, 'bolt', 0, 'yellow', 2, 4, 0);
  push(L, 'glue', 0, 'yellow', 1, 4, 3);
  push(L, 'glue', 0, 'yellow', 2, 4, 3);
  // 顶板铺在两道大梁上
  push(L, 'holePlate', 0, 'red', 0, 6, 0);   // 雨棚顶板改成带孔长板：螺钉真的穿过板面
  push(L, 'holePlate', 0, 'red', 0, 6, 2);
  // 顶板铆钉：四颗都要真的落在顶板边缘，不能飘在板外当装饰
  push(L, 'screw', 0, 'yellow', 0, 7, 0);
  push(L, 'screw', 0, 'yellow', 3, 7, 0);
  push(L, 'screw', 0, 'yellow', 0, 7, 3);
  push(L, 'screw', 0, 'yellow', 3, 7, 3);
  return L;
}

/**
 * 宫墙丁顺砌：故宫城墙的砌法——
 * 下碱灰砖、上身红砖，一顺一丁交错咬缝，头顶琉璃瓦脊。
 */
function palaceWall() {
  const L = [];
  // 白石台基（两进深）
  for (let x = 0; x < 12; x += 4) {
    push(L, 'brick4', 0, 'white', x, 0, 0);
    push(L, 'brick4', 0, 'white', x, 0, 1);
  }
  // 下碱：灰砖两皮
  for (let x = 0; x < 12; x += 4) push(L, 'brick4', 0, 'gray', x, 1, 0);
  push(L, 'brick2', 0, 'gray', 0, 2, 0);
  push(L, 'brick4', 0, 'gray', 2, 2, 0);
  push(L, 'brick4', 0, 'gray', 6, 2, 0);
  push(L, 'brick2', 0, 'gray', 10, 2, 0);
  // 上身：红砖一顺一丁，丁石用白条石点出来
  for (let x = 0; x < 12; x += 4) push(L, 'brick4', 0, 'red', x, 3, 0);
  push(L, 'brick2', 0, 'white', 0, 4, 0);
  push(L, 'brick4', 0, 'red', 2, 4, 0);
  push(L, 'brick4', 0, 'red', 6, 4, 0);
  push(L, 'brick2', 0, 'white', 10, 4, 0);
  for (let x = 0; x < 12; x += 4) push(L, 'brick4', 0, 'red', x, 5, 0);
  // 冰盘檐
  for (let x = 0; x < 12; x += 4) push(L, 'brick4', 0, 'gray', x, 6, 0);
  // 椽子 + 琉璃瓦
  for (let x = 0; x < 12; x += 4) push(L, 'brick4', 0, 'brown', x, 7, 0);
  for (let x = 0; x < 12; x += 4) push(L, 'brick4', 0, 'yellow', x, 8, 0);
  // 正脊两端的鸱吻
  push(L, 'cone', 0, 'orange', 1, 9, 0);
  push(L, 'cone', 0, 'orange', 10, 9, 0);
  return L;
}

/* ===================== 大师 ===================== */

/** 六角亭：台基、四柱、栏杆、出檐和攒尖顶 */
function pavilion() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);
  for (const [cx, cz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) push(L, 'column', 0, 'red', cx, 1, cz);
  push(L, 'brick2', 0, 'red', 1, 1, 0);
  push(L, 'brick2', 0, 'red', 1, 1, 3);
  push(L, 'brick2', 1, 'red', 0, 1, 1);
  push(L, 'brick2', 1, 'red', 3, 1, 1);
  for (let x = 0; x < 4; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'brown', x, 5, z);
  push(L, 'cone', 0, 'teal', 1, 6, 1);
  push(L, 'ballS', 0, 'yellow', 1, 8, 1);
  return L;
}

/** 石拱桥：半圆拱券撑起桥面，桥头还立着石墩 */
function archBridge() {
  const L = [];
  for (let z = 0; z < 2; z++) {
    push(L, 'archTop', 0, 'gray', 0, 0, z);
    // 拱肩：只补拱券两端的空档（1..4 已经属于拱券本身）
    for (const sx of [0, 5]) push(L, 'cube', 0, 'gray', sx, 2, z);
    for (let x = 0; x < 6; x += 2) push(L, 'brick2', 0, 'brown', x, 3, z);
  }
  for (const [px, pz] of [[0, 0], [0, 1], [5, 0], [5, 1]]) push(L, 'cube', 0, 'white', px, 4, pz);
  return L;
}

/**
 * 月亮门：灰砖墙上开一轮圆月洞。
 * 圆洞不是一块光滑的"甜甜圈"，而是 12 块楔形拱石砌成的整圈月洞环，
 * 石缝清晰可见——这才是现实里砖石砌圆拱的做法。
 */
function moonGate() {
  const L = [];
  const W = 10, H = 8;        // 墙宽 10 格、高 8 格
  const RX = 2;               // 月洞环落点（6 格宽 → 占 x2..7）
  push(L, 'moonRing', 0, 'white', RX, 0, 0);
  // 环身 + 洞里都不能再砌墙
  const blocked = ringBlocked(6, 6, 2, 3, 0, 0, RX, 0);
  for (let y = 0; y < H; y++) fillRow(L, 'gray', 0, W, y, 0, blocked);
  // 压顶：左右各探出半格，做成一条出檐
  for (let x = -1; x < 11; x += 4) push(L, 'brick4', 0, 'brown', x, H, 0);
  push(L, 'cube', 0, 'orange', -1, H + 1, 0);
  push(L, 'cube', 0, 'orange', 10, H + 1, 0);
  return L;
}

/** 城堡：四座塔楼、拱门和中央瞭望台 */
function castle() {
  const L = [];
  for (let x = 0; x < 8; x += 4) for (let z = 0; z < 8; z += 4) push(L, 'plate4x4', 0, 'gray', x, 0, z);
  // 四角塔楼
  for (const [tx, tz] of [[0, 0], [7, 0], [0, 7], [7, 7]]) {
    push(L, 'column', 0, 'blue', tx, 1, tz);
    push(L, 'cube', 0, 'blue', tx, 5, tz);
    push(L, 'cube', 0, 'red', tx, 6, tz);
  }
  // 前墙 z0：中间三格嵌拱门
  const gate = new Set();
  for (let y = 1; y <= 3; y++) for (let x = 2; x <= 4; x++) gate.add(`${x},${y}`);
  for (let y = 1; y <= 3; y++) fillRow(L, 'white', 1, 6, y, 0, gate);
  push(L, 'arch', 0, 'brown', 2, 1, 0);
  // 后墙 z7
  for (let y = 1; y <= 3; y++) fillRow(L, 'white', 1, 6, y, 7, new Set());
  // 侧墙 x0 / x7（z1..6）
  for (let y = 1; y <= 3; y++) {
    for (const z of [1, 3, 5]) {
      push(L, 'brick2', 1, 'white', 0, y, z);
      push(L, 'brick2', 1, 'white', 7, y, z);
    }
  }
  // 中央瞭望台
  for (const [cx, cz] of [[3, 3], [4, 3], [3, 4], [4, 4]]) push(L, 'column', 0, 'red', cx, 1, cz);
  push(L, 'plate2x2', 0, 'red', 3, 5, 3);
  return L;
}

/**
 * 斗拱：中国古建的"屋顶弹簧"——柱头上一层层纵横交替的拱臂，
 * 层层出跳把屋檐托出去，纪录片里拆解古建时最先讲的就是它。
 */
function dougong() {
  const L = [];
  push(L, 'cube2', 0, 'red', 2, 0, 2);            // 柱
  push(L, 'plate2x2', 0, 'gray', 2, 2, 2);        // 大斗
  push(L, 'brick4', 0, 'gray', 1, 3, 2);          // 泥道拱（横，石色）
  push(L, 'brick4', 1, 'brown', 2, 4, 1);         // 华拱（纵，木色）
  push(L, 'brick4', 0, 'gray', 1, 5, 2);          // 泥道拱二层
  push(L, 'brick4', 1, 'brown', 2, 6, 1);         // 华拱二层
  push(L, 'plate4x4', 0, 'brown', 1, 7, 1);       // 柱头枋
  // 四根椽子出跳
  push(L, 'brick2', 1, 'brown', 2, 8, 0);
  push(L, 'brick2', 1, 'brown', 2, 8, 4);
  push(L, 'brick2', 0, 'brown', 0, 8, 2);
  push(L, 'brick2', 0, 'brown', 4, 8, 2);
  // 四颗散斗托住檐板四角
  for (const [sx, sz] of [[1, 1], [3, 1], [1, 3], [3, 3]]) push(L, 'cube', 0, 'gray', sx, 8, sz);
  push(L, 'plate4x4', 0, 'brown', 1, 9, 1);       // 檐板
  // 瓦钉（木钉）钉住檐口
  push(L, 'peg', 0, 'yellow', 1, 10, 1);
  push(L, 'peg', 0, 'yellow', 4, 10, 4);
  // 宝顶
  push(L, 'cone', 0, 'teal', 2, 10, 2);
  push(L, 'ballS', 0, 'yellow', 2, 12, 2);
  return L;
}

/**
 * 飞檐亭：屋檐四角高高翘起——
 * 檐枋围一圈、檐板探出去，角上小珠收尾，檐口还挂着钉饰风铃。
 */
function flyingPavilion() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);        // 台基
  // 六根柱：四角檐柱 + 两侧中柱，中央还有金柱
  for (const [cx, cz] of [[0, 0], [3, 0], [0, 3], [3, 3], [0, 1], [3, 1]]) push(L, 'column', 0, 'red', cx, 1, cz);
  push(L, 'column', 0, 'brown', 1, 1, 1);
  // 檐枋一圈
  push(L, 'brick2', 0, 'red', 0, 5, 0);
  push(L, 'brick2', 0, 'red', 2, 5, 0);
  push(L, 'brick2', 0, 'red', 0, 5, 3);
  push(L, 'brick2', 0, 'red', 2, 5, 3);
  push(L, 'brick2', 1, 'red', 0, 5, 1);
  push(L, 'brick2', 1, 'red', 3, 5, 1);
  // 金柱顶上的十字梁
  push(L, 'brick2', 1, 'brown', 1, 5, 1);
  // 檐板：探出到柱子外面一圈
  for (const [px, pz] of [[-1, -1], [1, -1], [3, -1], [-1, 1], [3, 1], [-1, 3], [1, 3], [3, 3]]) {
    push(L, 'plate2x2', 0, 'brown', px, 6, pz);
  }
  push(L, 'plate2x2', 0, 'brown', 1, 6, 1);       // 顶心板
  // 四角翘角 + 顶珠
  for (const [qx, qz] of [[-1, -1], [4, -1], [-1, 4], [4, 4]]) {
    push(L, 'cube', 0, 'teal', qx, 7, qz);
    push(L, 'ballS', 0, 'yellow', qx, 8, qz);
  }
  // 檐口四颗钉饰风铃
  for (const [rx, rz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) push(L, 'rivet', 0, 'yellow', rx, 7, rz);
  // 宝顶
  push(L, 'cone', 0, 'teal', 1, 7, 1);
  push(L, 'ballS', 0, 'yellow', 1, 9, 1);
  return L;
}

/* ===================== 宗师 ===================== */

/** 宝塔：台基、实心塔身、层层出檐，顶上还有塔刹 */
function pagoda() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);
  // 一层塔身（实心 4×4，两格高）
  push(L, 'cube2', 0, 'red', 0, 1, 0);
  push(L, 'cube2', 0, 'red', 2, 1, 0);
  push(L, 'cube2', 0, 'red', 0, 1, 2);
  push(L, 'cube2', 0, 'red', 2, 1, 2);
  // 一层出檐（6×6 挑出）
  for (let x = -1; x <= 3; x += 2) for (let z = -1; z <= 3; z += 2) push(L, 'plate2x2', 0, 'brown', x, 3, z);
  // 二层塔身
  push(L, 'cube2', 0, 'red', 1, 4, 1);
  // 二层出檐（4×4）
  for (const [ex, ez] of [[0, 0], [2, 0], [0, 2], [2, 2]]) push(L, 'plate2x2', 0, 'brown', ex, 6, ez);
  // 攒尖顶与塔刹
  push(L, 'cone', 0, 'teal', 1, 7, 1);
  push(L, 'ballS', 0, 'yellow', 1, 9, 1);
  push(L, 'ballS', 0, 'orange', 1, 10, 1);
  return L;
}

/** 城门楼：厚城墙里开一条月洞门隧道，墙顶再起一座小楼 */
function gateTower() {
  const L = [];
  const W = 10, H = 6, D = 2;
  for (let z = 0; z < D; z++) push(L, 'moonRing', 0, 'white', 2, 0, z);
  const blocked = ringBlocked(6, 6, 2, 3, 0, 0, 2, 0);
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) fillRow(L, 'gray', 0, W, y, z, blocked);
  // 墙顶平台（把两层城墙连成一片）
  for (let x = 0; x < W; x += 2) push(L, 'plate2x2', 0, 'gray', x, H, 0);
  // 楼身四柱
  for (const [cx, cz] of [[2, 0], [5, 0], [2, 1], [5, 1]]) push(L, 'column', 0, 'red', cx, H + 1, cz);
  // 楼板与屋顶
  push(L, 'plate2x2', 0, 'red', 2, H + 5, 0);
  push(L, 'plate2x2', 0, 'red', 4, H + 5, 0);
  push(L, 'roof', 1, 'teal', 2, H + 6, 0);
  push(L, 'roof', 1, 'teal', 4, H + 6, 0);
  push(L, 'ballS', 0, 'yellow', 3, H + 8, 1);
  return L;
}

/** 大殿：高台基、厚墙开门、一条长长的屋脊 */
function greatHall() {
  const L = [];
  // 台基：8 宽 × 2 深
  push(L, 'plate2x4', 0, 'gray', 0, 0, 0);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 0);
  // 殿身：前后两道墙，中间留一道两格宽的门
  const door = new Set(['3,1', '4,1', '3,2', '4,2']);
  for (let z = 0; z < 2; z++) for (let y = 1; y <= 3; y++) fillRow(L, 'white', 0, 8, y, z, door);
  // 檐口
  push(L, 'plate2x4', 0, 'brown', 0, 4, 0);
  push(L, 'plate2x4', 0, 'brown', 4, 4, 0);
  // 屋顶：四片人字顶连成一条屋脊
  for (let x = 0; x < 8; x += 2) push(L, 'roof', 1, 'red', x, 5, 0);
  // 正脊装饰
  push(L, 'cube', 0, 'yellow', 3, 7, 1);
  push(L, 'cube', 0, 'yellow', 4, 7, 1);
  return L;
}

/**
 * 鲁班锁：榫卯井字编织架——
 * 十根木梁横一层、纵一层交替咬合，梁与梁互相搭着才立得住，
 * 顶上还露出两颗榫头。纪录片里"一颗钉子不用盖起宫殿"说的就是这套手艺。
 */
function lubanLock() {
  const L = [];
  // 五层井字编织：偶数层横梁，奇数层纵梁
  for (let y = 0; y <= 4; y++) {
    const c = y % 2 ? 'orange' : 'brown';
    if (y % 2 === 0) {
      push(L, 'brick4', 0, c, 0, y, 1);
      push(L, 'brick4', 0, c, 0, y, 2);
    } else {
      push(L, 'brick4', 1, c, 1, y, 0);
      push(L, 'brick4', 1, c, 2, y, 0);
    }
  }
  // 顶上露出的两颗榫头
  push(L, 'tenon', 0, 'yellow', 1, 5, 1);
  push(L, 'tenon', 0, 'yellow', 2, 5, 2);
  return L;
}

/* ===================== 机械机构 ===================== */

/**
 * 机械图纸的一条通用规矩（v1.16 起）：
 *  · 转动件要有「轴承 / 轴承座」托住，长轴之间用「联轴器」一节节接起来；
 *  · 机架靠「筋板」抗扭，接缝上「螺栓 + 垫圈 + 螺母」锁死；
 *  · 走直线的机构配「导轨 + 滑块」，回程交给「压簧」；
 *  · 「飞轮」靠惯性抹平转速波动。
 * 运转模拟里各司其职：支承件外壳不跟着转，直线件真的会走。
 */

/** 齿轮减速箱：大-大-小三级咬合；手摇轴/飞轮/联轴器都与齿轮同轴，真的带得动轮系 */
function gearTrain() {
  const L = [];
  // 箱座：前排放齿轮，后排放支承件
  push(L, 'plate2x4', 0, 'gray', 0, 0, 1);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 1);
  push(L, 'plate2x4', 0, 'gray', 0, 0, 3);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 3);
  // 齿轮咬合：三个齿轮的齿刚好互相吃进去一点（齿数比决定谁转得快）
  push(L, 'gearBig', 0, 'blue', 0, 0, 0);
  push(L, 'gearBig', 0, 'gray', 3, 0, 0);
  push(L, 'gearSmall', 0, 'orange', 6, 0, 0);
  push(L, 'motor', 1, 'navy', 6, 1, 1);
  // ry=1 把摇柄轴转到 Z 向，跟齿轮同轴：拔掉电机手摇也能带动整条轮系
  push(L, 'crank', 1, 'yellow', 0, 1, 1);
  push(L, 'flywheel', 0, 'teal', 3, 1, 1);
  // 两端滚珠轴承托住输出轴，联轴器把轴一节节接长（同样 ry=1 对轴）
  push(L, 'bearing', 0, 'white', 1, 1, 3);
  push(L, 'bearing', 0, 'white', 4, 1, 3);
  push(L, 'coupling', 1, 'yellow', 6, 1, 3);
  // 检修滑道：导轨上骑一只滑块；筋板抗扭，轴承盖上螺栓/螺母/垫圈锁死
  push(L, 'rail', 0, 'blue', 2, 1, 4);
  push(L, 'slider', 0, 'yellow', 3, 2, 4);
  push(L, 'gusset', 0, 'orange', 0, 1, 4);
  // 轴承盖螺栓：拧在滚珠轴承顶面上，不再悬在半空当摆设
  push(L, 'bolt', 0, 'gray', 1, 3, 3);
  return L;
}

/** 链传动小车：滚子链把电机动力送到前轮，右侧通轴带动后轮，发条盒套后桥储能 */
function clockworkCar() {
  const L = [];
  for (const [wx, wz] of [[0, 0], [5, 0], [0, 3], [5, 3]]) push(L, 'tire', 0, 'navy', wx, 0, wz);
  // v1.21：车头电机与左后轮的轴心天然差半格（轮盘 3 格高、机座 2 格高），
  // 长轴会斜插进轮胎实体。改用短轴转子，动力由链条与通轴传给车桥。
  push(L, 'motor', 1, 'navy', 0, 0, 1, 0, { params: { stub: true } });
  // 滚子链：电机 → 左前轮 → 右前轮（两节链首尾相接，端点挂在轮毂上）
  push(L, 'chain', 0, 'gray', 2, 0, 1);
  push(L, 'chain', 0, 'gray', 4, 0, 1);
  // 右侧一根通轴联轴器：像左侧电机那样把前后轮串成同轴，四轮都吃得到扭矩
  push(L, 'coupling', 1, 'yellow', 6, 0, 1);
  // 发条盒放倒（rx=1）套在后桥轴上储能，轴与车轮同为 Z 向，真的跟着车轴转
  push(L, 'spring', 0, 'gray', 1, 0, 4, 1);
  // 底盘
  push(L, 'holePlate', 0, 'red', 0, 3, 0);   // 车顶板带孔：螺栓/螺母对锁得起来
  push(L, 'holePlate', 0, 'red', 0, 3, 2);
  push(L, 'holePlate', 0, 'red', 4, 3, 0);
  push(L, 'plate2x4', 0, 'red', 4, 3, 2);
  push(L, 'cube2', 0, 'yellow', 1, 4, 1);
  push(L, 'cube', 0, 'white', 0, 4, 1);
  push(L, 'cube', 0, 'yellow', 5, 4, 1);   // 车尾盖板（原发条盒已挪到后桥）
  // 前 / 后车轴的滚珠轴承
  push(L, 'bearing', 0, 'white', 3, 0, 0);
  push(L, 'bearing', 0, 'white', 3, 0, 3);
  // 底盘加强筋 + 轮毂螺栓：原来那两根「避震压簧」没有往复行程、永远不会压缩，
  // 摆在底盘上纯属装饰，直接去掉让车架更紧凑；真会动的压簧留给凸轮/棘爪/苏格兰轭机构
  push(L, 'gusset', 0, 'orange', 6, 4, 3);
  push(L, 'bolt', 0, 'gray', 3, 4, 1);
  return L;
}

/** 卷扬机：手摇曲轴带卷筒轴，滚珠轴承/轴承座托住长轴，飞轮稳速，筋板抗扭 */
function winch() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);
  push(L, 'plate4x4', 0, 'gray', 4, 0, 0);   // 加宽机座，给支承排腾地方
  push(L, 'column', 0, 'red', 0, 1, 0);
  push(L, 'column', 0, 'red', 3, 1, 0);
  push(L, 'axle', 0, 'yellow', 0, 1, 1);     // 卷筒轴
  push(L, 'crank', 0, 'yellow', 0, 1, 2);    // 手柄：和卷筒同轴，一摇整根轴都转
  push(L, 'cube2', 0, 'navy', 0, 5, 0);      // 柱顶配重护罩（不假装是传动手轮）
  push(L, 'chain', 0, 'gray', 0, 1, 3);      // 吊索
  push(L, 'cube2', 0, 'yellow', 2, 1, 3);    // 吊钩重块
  // 支承排：轴承 + 轴承座 + 飞轮
  push(L, 'bearing', 0, 'white', 3, 1, 1);
  push(L, 'pillow', 0, 'white', 5, 1, 1);
  // 飞轮装在卷筒轴的左端：ry=1 把轮盘转成与卷筒轴同向（X），真机就是这样稳速的
  push(L, 'flywheel', 1, 'teal', -1, 0, 1);
  // 立柱根部的三角筋板 + 手轮旁的压紧螺栓
  push(L, 'gusset', 0, 'orange', 0, 2, 3);
  push(L, 'bolt', 0, 'gray', 2, 5, 0);
  return L;
}

/** 齿轮钟：大齿轮带小齿轮走时，飞轮当摆轮稳速，轴承托指针轴，筋板撑钟架 */
function gearClock() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);
  push(L, 'plate4x4', 0, 'gray', 4, 0, 0);
  push(L, 'column', 0, 'red', 0, 1, 0);
  push(L, 'column', 0, 'red', 3, 1, 0);
  push(L, 'brick4', 0, 'brown', 0, 5, 0);
  push(L, 'gearBig', 0, 'blue', 0, 1, 1);
  push(L, 'gearSmall', 0, 'orange', 3, 1, 1);
  push(L, 'motor', 1, 'navy', 0, 1, 2);
  // 发条盒放倒（rx=1）让卷簧轴与走时轮系同为 Z 向，才真的跟着齿轮转
  push(L, 'spring', 0, 'gray', 2, 1, 3, 1);
  push(L, 'plate2x2', 0, 'white', 1, 4, 1);  // 钟面
  push(L, 'brick2', 3, 'navy', 1, 5, 1);     // 指针
  push(L, 'cube', 0, 'yellow', 2, 1, 2);     // 钟锤
  // 走时轮系：轴承托指针轴，飞轮当摆轮、联轴器把轴接出钟架，
  // 三者都落在齿轮轴线上（Z 向），由走时轮系真正带动
  push(L, 'bearing', 0, 'white', 4, 1, 2);
  push(L, 'flywheel', 0, 'teal', 4, 1, 0);
  push(L, 'coupling', 1, 'yellow', 4, 1, 3);
  push(L, 'gusset', 0, 'orange', 6, 1, 3);
  push(L, 'bolt', 0, 'gray', 4, 3, 2);
  return L;
}

/** 卧式蒸汽机心：电机→齿轮→横置曲轴→水平连杆→活塞，导轨滑块当十字头，飞轮储功 */
function steamEngine() {
  const L = [];
  // 动力侧：电机带小齿轮咬大齿轮，大齿轮与横置曲轴同轴；飞轮在曲轴另一端储能
  push(L, 'motor', 1, 'navy', 0, 0, 0);
  push(L, 'gearSmall', 0, 'orange', 0, 0, 2);
  push(L, 'gearBig', 0, 'blue', 2, 0, 2);
  // rx=1 再 ry=1：曲轴仍横置（轴沿 Z），但曲柄销由「朝上」改成「水平指向活塞」，
  // 销画圆的平面正对活塞行程 —— 这才是卧式曲柄滑块，连杆不会别着劲
  push(L, 'crank', 1, 'yellow', 3, 0, 3, 1);
  // 原来那只飞轮摆在 x=0 的角落，既不在曲轴轴线上、连杆往回摆还会从它身体里穿过去。
  // 与其硬塞一个够不到动力的装饰轮，不如去掉，让曲柄滑块机构自己干干净净。
  push(L, 'pillow', 0, 'white', 5, 0, 0);
  push(L, 'bearing', 0, 'white', 5, 0, 2);
  // 气缸线：连杆 → 活塞 → 十字头滑块在 r=4 一行水平往复。
  // v1.21：导轨与滑块错开到 r=5 一行——连杆摆到下行相位时最低点会扫到
  // 导轨凸轨（0.13 格真实穿模），真机器的导轨也是与气缸平行另设一根，不压在连杆底下。
  push(L, 'rail', 0, 'blue', 4, 0, 5);
  push(L, 'cube', 0, 'gray', 5, 0, 4);      // 导轨让位后给活塞补一块气缸托座
  push(L, 'cube', 0, 'gray', 7, 0, 4);      // 十字头滑块托座
  // v1.26：连杆改 3 格长（孔距 2.27 格 = 实际销距），起点随之退一格，避免压到活塞
  push(L, 'conrod', 0, 'red', 2, 1, 4, 0, { rz: 1 });
  push(L, 'piston', 0, 'white', 5, 1, 4, 0, { rz: 3 });
  push(L, 'slider', 0, 'yellow', 7, 1, 4);   // 十字头与连杆/活塞同处一条水平线
  // 并列机架梁 + 横躺的回程压簧：弹簧 2 格占位沿 X、与活塞行程同轴，已贴着活塞后方
  // （x5 那格正顶在活塞 z=4 一侧），运转时随活塞行程只压不拉；机架梁 brick4 托住固定端。
  push(L, 'brick4', 0, 'gray', 4, 0, 3);
  push(L, 'coilSpring', 0, 'orange', 4, 1, 3, 0, { rz: 1 });
  push(L, 'gusset', 0, 'gray', 3, 1, 6);
  // 底座与铭牌
  push(L, 'holePlate', 0, 'gray', 0, 0, 6);  // 机脚安装板带孔，螺栓从上往下穿过孔位
  push(L, 'cube', 0, 'yellow', 1, 1, 6);
  push(L, 'bolt', 0, 'gray', 0, 1, 6);
  return L;
}

/** 槽轮步进送料：拨盘转一圈槽轮只「哒」地步进 90°，轴承托轴、导轨送工件 */
function genevaFeeder() {
  const L = [];
  // v1.22 装配重构：以前机构直接坐在地上、只垫三块散板，俯视图就是一大片空白，
  // 联轴器还孤零零伸在 z=-2。现在铺 4 块连续机座平台（x0~7 / z-2~5），
  // 整套机构**整体抬一层**坐上去——所有零件的相对位置一毫不改，
  // 槽轮步进数学（pinR=1.18）与传动契约完全不变，但每个零件脚下都有实体。
  push(L, 'machineBase', 0, 'gray', 0, 0, -2);
  push(L, 'machineBase', 0, 'gray', 4, 0, -2);
  push(L, 'machineBase', 0, 'gray', 0, 0, 2);
  push(L, 'machineBase', 0, 'gray', 4, 0, 2);
  push(L, 'motor', 1, 'navy', 2, 1, 0);
  // 销距 1.18 是调好的——销进槽正好推过一整个槽位（装配台里可以改）
  push(L, 'genevaDrive', 0, 'yellow', 2, 1, 2, 0, { params: { pinR: 1.18 } });
  push(L, 'genevaWheel', 0, 'teal', 3, 1, 4);
  // 输入轴从机架前端伸出：轴承 + 联轴器与电机轴同向（Z），真的被电机带着转
  push(L, 'bearing', 0, 'white', 0, 1, 0);
  push(L, 'coupling', 1, 'yellow', 3, 1, -2);
  push(L, 'gusset', 0, 'orange', 5, 1, 2);
  // 地脚螺栓锁在机座安装孔上（与机构同层，直接坐在平台顶面，再无悬空装饰件）
  push(L, 'bolt', 0, 'gray', 4, 1, 0);
  // 出料送料台：垫板坐机座、导轨坐垫板、滑块骑导轨，三层都有支撑不悬空
  push(L, 'plate2x4', 0, 'gray', 0, 1, 5);
  push(L, 'rail', 0, 'blue', 0, 2, 5);
  push(L, 'slider', 0, 'yellow', 1, 3, 5);
  return L;
}

/** 齿轮齿条：齿轮一转，齿条笔直推出——推拉门、机床工作台、汽车转向机都用它 */
function gearRack() {
  const L = [];
  push(L, 'rack', 0, 'gray', 0, 0, 0);
  push(L, 'gearSmall', 0, 'yellow', 1, 1, 0);
  push(L, 'motor', 1, 'navy', 1, 1, 1);
  push(L, 'plate2x2', 0, 'blue', 1, 0, 1);
  push(L, 'brick4', 0, 'blue', 0, 0, 3);
  // 端挡改坐在筋板外侧、地脚螺母上方（y=1、z=2），不再杵在齿条的直线行程里被穿过去
  push(L, 'cube', 0, 'red', 5, 1, 2);
  // 齿条背后一根导轨 + 骑在上面的滑块，长行程才不会歪
  push(L, 'rail', 0, 'blue', 0, 1, 3);
  // v1.21：滑块沿导轨挪到 x=3，完全让开电机轴端（轴心 x=2，轴端最远 x≈2.13）
  push(L, 'slider', 0, 'teal', 3, 2, 3);
  // 端挡、轴承、紧固组全部收回机架边上，仍留足齿条的直线行程
  push(L, 'gusset', 0, 'orange', 3, 0, 2);
  push(L, 'bearing', 0, 'white', 3, 1, 0);
  push(L, 'bolt', 0, 'gray', 3, 3, 0);
  return L;
}

/** 万向节传动：十字轴把动力拐过 90°，另一端用轴承座托住 */
function cardanDrive() {
  const L = [];
  push(L, 'motor', 0, 'navy', 0, 0, 0);
  push(L, 'universal', 0, 'yellow', 2, 0, 1);
  // v1.21：机架梁挪到 z=3，不再正对电机出轴——实心砖挡在轴端必然被轴端挡圈啃进去
  push(L, 'brick2', 0, 'gray', 2, 0, 3);
  push(L, 'gearSmall', 0, 'teal', 2, 1, 0);
  push(L, 'plate2x2', 0, 'gray', 4, 0, 2);
  // 从动轴的轴承座 + 筋板 + 地脚螺栓：整组贴住主动轴机架，不再散成两三堆
  push(L, 'pillow', 0, 'white', 4, 0, 0);
  push(L, 'gusset', 0, 'orange', 4, 1, 2);
  push(L, 'bolt', 0, 'gray', 4, 2, 1);
  return L;
}

/** 棘轮卷扬：只能往一个方向卷，棘爪顶住齿面；压簧负责把爪压回齿间 */
function ratchetWinch() {
  const L = [];
  push(L, 'ratchet', 0, 'teal', 0, 0, 2);
  // 大盘棘轮与电机不同心，短轴避免转子斜插进盘体（v1.20 装配干涉修复）
  push(L, 'motor', 1, 'navy', 1, 0, 0, 0, { params: { stub: true } });
  push(L, 'pawl', 0, 'red', 3, 0, 2);
  push(L, 'plate2x4', 0, 'gray', 0, 0, 3);
  push(L, 'cube', 0, 'yellow', 0, 1, 3);
  // 卷筒轴两头：滚珠轴承 + 轴承座
  push(L, 'bearing', 0, 'white', 3, 0, 0);
  push(L, 'pillow', 0, 'white', 5, 0, 0);
  // 棘爪复位压簧 + 机座筋板 + 紧固组
  push(L, 'coilSpring', 0, 'orange', 4, 1, 2);
  push(L, 'gusset', 0, 'orange', 5, 0, 2);
  push(L, 'bolt', 0, 'gray', 3, 2, 0);
  return L;
}

/** 蜗轮减速机：蜗杆转 16 圈蜗轮才转一圈，反向还推不动（自锁） */
function wormReducer() {
  const L = [];
  push(L, 'worm', 0, 'yellow', 2, 0, 1);
  push(L, 'motor', 0, 'navy', 4, 0, 0);
  push(L, 'gearBig', 0, 'teal', 2, 0, 2, 1);
  push(L, 'plate2x4', 0, 'gray', 0, 0, 5);
  push(L, 'cube', 0, 'red', 4, 0, 5);
  // 蜗杆轴：联轴器接电机、滚珠轴承托另一端；蜗轮轴坐进轴承座
  push(L, 'coupling', 0, 'yellow', 0, 0, 1);
  push(L, 'bearing', 0, 'white', 0, 0, 2);
  push(L, 'pillow', 0, 'white', 5, 0, 3);
  push(L, 'gusset', 0, 'orange', 5, 0, 5);
  push(L, 'bolt', 0, 'gray', 0, 2, 2);
  return L;
}

/** 丝杠升降台：电机→联轴器→丝杠，螺母把旋转变成直线，导轨滑块约束方向 */
function screwLift() {
  const L = [];
  // 机床底座：传动轴与工作台各占一排
  push(L, 'plate2x4', 0, 'gray', 0, 0, 0);
  push(L, 'holePlate', 0, 'gray', 4, 0, 0);
  // 一根水平传动轴：电机、联轴器、丝杠依次对接
  push(L, 'leadScrew', 0, 'yellow', 0, 1, 0, 0, { params: { lead: 0.35 } });
  push(L, 'coupling', 0, 'orange', 3, 1, 0);
  push(L, 'motor', 0, 'navy', 5, 1, 0);
  // v1.21：原轴承孔沿 Z，电机/丝杠轴却沿 X，轴端挡圈从侧面啃进外圈。
  // ry=1 把轴承孔转到 X 向，轴真正从孔里穿过去。
  push(L, 'bearing', 1, 'white', 7, 1, 0);   // 电机外侧的轴端支承（孔沿 X）
  // 丝杠螺母套在轴上（装配台里改螺距，前进速度跟着变）
  push(L, 'leadNut', 0, 'teal', 1, 2, 0);
  // 工作台导轨 + 滑块，旁边一对方板当机座
  push(L, 'plate2x4', 0, 'gray', 0, 0, 2);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 2);
  push(L, 'rail', 0, 'blue', 0, 1, 2);
  push(L, 'slider', 0, 'teal', 2, 2, 2);
  // 三角筋板抗扭 + 导轨压板螺栓
  push(L, 'gusset', 0, 'orange', 4, 1, 2);
  push(L, 'bolt', 0, 'gray', 0, 2, 2);
  return L;
}

/** 皮带输送台：电机带主动轮，皮带把动力送到从动轮，轴承座托住两根轴 */
function beltDrive() {
  const L = [];
  push(L, 'pulley', 0, 'yellow', 0, 0, 0);
  push(L, 'pulley', 0, 'yellow', 6, 0, 0);
  // 两节皮带首尾相接，套住两个轮（节数可在装配台里改）
  push(L, 'belt', 0, 'brown', 2, 1, 0, 0, { params: { links: 2 } });
  push(L, 'belt', 0, 'brown', 4, 1, 0, 0, { params: { links: 2 } });
  push(L, 'brick4', 0, 'gray', 2, 0, 0);   // 皮带下方的机架梁
  push(L, 'motor', 1, 'navy', 0, 0, 1);
  // 轴承 / 轴承座 / 筋板 / 螺栓组
  push(L, 'bearing', 0, 'white', 2, 0, 2);
  push(L, 'pillow', 0, 'white', 5, 0, 2);
  push(L, 'gusset', 0, 'orange', 2, 0, 3);
  push(L, 'bolt', 0, 'gray', 2, 2, 2);
  // 输送平台与端挡
  push(L, 'plate2x4', 0, 'blue', 0, 0, 4);
  push(L, 'plate2x4', 0, 'blue', 4, 0, 4);
  push(L, 'cube', 0, 'red', 7, 1, 4);
  return L;
}

/** 凸轮压簧机：凸轮顶起竖直顶杆，套在杆上的压簧被真实压缩、再把杆压回去 */
function camPress() {
  const L = [];
  push(L, 'cam', 0, 'yellow', 0, 0, 0, 0, { params: { lift: 0.5 } });
  // 飞轮是 3 格高盘件，和电机轴心差半格；短轴避免轴端拨爪擦进飞轮辐条
  push(L, 'motor', 1, 'navy', 0, 0, 1, 0, { params: { stub: true } });
  // 顶杆 rz=1 把滑动轴从 X 转到 Y，正对凸轮上方；压簧套在它头顶，随行程缩短/弹回
  push(L, 'slider', 0, 'teal', 1, 2, 0, 0, { rz: 1 });
  push(L, 'coilSpring', 0, 'orange', 1, 3, 0);
  // 门形机架放在顶杆后一排：门洞是掏空的，顶杆上下走不会撞机架（真机器都留行程通道）
  // 左柱直接坐电机壳上，右柱用一块方墩垫到同样高度
  push(L, 'cube2', 0, 'blue', 2, 0, 1);
  push(L, 'portal', 0, 'blue', 0, 2, 1);
  // 飞轮储能 + 轴承座收口：输出端就收在轴承里，不再往机架外甩一根裸轴。
  // 整机 Z 向占地因此少两格，斜视角下不再有「尾巴」，画面更紧凑。
  push(L, 'flywheel', 0, 'navy', 0, 0, 3);
  push(L, 'bearing', 0, 'white', 0, 0, 4);
  // 机架筋板与地脚螺栓：紧贴在方墩右侧，不再在远处立一根孤零零的螺栓塔
  push(L, 'gusset', 0, 'orange', 4, 0, 1);
  push(L, 'bolt', 0, 'gray', 4, 2, 1);
  return L;
}

/**
 * 锥齿轮换向台：电机横置（轴 X）咬住竖置锥齿轮（轴 Z），动力整个拐 90°。
 * 知乎 63 机构里「用凸轮调节圆锥齿轮输出轴转速」的核心就是这种垂直轴换向。
 */
function bevelDrive() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);
  push(L, 'holePlate4', 0, 'gray', 4, 0, 0);   // 安装区改带孔大板：螺栓穿过去、螺母从背面锁
  push(L, 'plate2x4', 0, 'gray', 0, 0, 4);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 4);
  // 两轴垂直相交：电机出轴沿 X，锥齿轮轴沿 Z，锥齿在锥面上互相咬住
  push(L, 'motor', 0, 'navy', 0, 1, 1);
  push(L, 'bevelGear', 0, 'yellow', 2, 1, 1);
  // 竖轴往 Z 接长：联轴器 → 皮带轮输出，两端轴承/轴承座托住
  push(L, 'coupling', 1, 'orange', 2, 1, 3);
  push(L, 'pulley', 0, 'teal', 2, 1, 5);
  push(L, 'bearing', 0, 'white', 4, 1, 5);
  push(L, 'pillow', 0, 'white', 5, 1, 1);
  // 机架抗扭 + 地脚螺栓，全部拧在底板上
  push(L, 'gusset', 0, 'orange', 4, 1, 3);
  push(L, 'bolt', 0, 'gray', 7, 1, 0);
  return L;
}

/**
 * 苏格兰轭冲床（知乎 8「平面滑槽」/24「往复直线」/43「双摇杆」）：
 * 曲柄销卡在轭的竖槽里滑，输出严格正弦往复；同一根曲轴还带一根左右摆的摇杆，
 * 横躺的压簧套在输出杆上，跟着一起压缩/回弹。
 */
function yokePress() {
  const L = [];
  push(L, 'plate2x4', 0, 'gray', 0, 0, 0);
  push(L, 'holePlate', 0, 'gray', 4, 0, 0);   // 带孔底板：冲床底脚螺栓能穿过去
  push(L, 'plate2x4', 0, 'gray', 0, 0, 2);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 2);
  // ry=1 把曲轴转成 Z 向，销才画得出 ⊥X 的圆，正好横着推进轭框
  push(L, 'crank', 1, 'yellow', 0, 1, 0);
  push(L, 'scotchYoke', 0, 'teal', 2, 1, 1);
  // 压簧放倒（rz=1）套在轭的输出端，轴与行程同为 X，运转时真实压缩
  push(L, 'coilSpring', 0, 'orange', 5, 1, 1, 0, { rz: 1 });
  push(L, 'rocker', 0, 'red', 2, 1, 3);
  // 轴端滚珠轴承 + 机架筋板 + 地脚紧固
  push(L, 'bearing', 0, 'white', 0, 1, 3);
  push(L, 'gusset', 0, 'orange', 6, 1, 2);
  // v1.27：原来的螺母/垫圈摆在螺栓旁边一格，谁都夹不住，纯属摆设——已删。
  // 螺栓本身带垫圈和螺母，位置也让开了轭的往复轴线。
  push(L, 'bolt', 0, 'gray', 7, 1, 0);
  return L;
}

/** 塔吊：塔身、吊臂、配重、滑轮；吊臂根部一台手摇卷扬给滑轮提供动力 */
function crane() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);
  push(L, 'plate2x2', 0, 'gray', 4, 0, 0);
  push(L, 'column', 0, 'yellow', 0, 1, 0);
  push(L, 'column', 0, 'yellow', 3, 1, 0);
  push(L, 'tenonBar', 0, 'orange', 0, 3, 1);
  push(L, 'mortiseBar', 0, 'orange', 2, 3, 1);
  push(L, 'brick6', 0, 'orange', 0, 5, 0);
  push(L, 'cube2', 0, 'navy', 0, 6, 0);
  push(L, 'chain', 0, 'gray', 2, 6, 0);
  push(L, 'pulley', 0, 'gray', 4, 6, 0);
  push(L, 'cone', 0, 'red', 0, 8, 0);
  push(L, 'cube2', 0, 'gray', 4, 1, 0);
  push(L, 'ballS', 0, 'yellow', 4, 3, 0);
  // 卷扬机房：两节短柱撑起平台，摇柄轴（ry=1）与吊臂滑轮同轴，手摇才真能收放吊索
  push(L, 'cube', 0, 'navy', 4, 3, 1);
  push(L, 'cube', 0, 'navy', 4, 4, 1);
  push(L, 'plate2x2', 0, 'gray', 4, 5, 1);
  push(L, 'crank', 1, 'yellow', 4, 6, 1);
  // 回转支承 + 塔身加强筋 + 地脚螺栓组
  push(L, 'bearing', 0, 'white', 6, 0, 0);
  push(L, 'gusset', 0, 'orange', 4, 1, 2);
  push(L, 'bolt', 0, 'gray', 6, 2, 0);
  return L;
}

/* ===================== 榫卯咬合 ===================== */

/** 榫卯框架：四角柱上架一圈梁，凸榫梁插进卯眼梁，榫头还打上穿销 */
function tenonFrame() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);
  for (const [cx, cz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) push(L, 'column', 0, 'red', cx, 1, cz);
  // 上枋：榫头对着卯口，转角互相吃住
  push(L, 'tenonBar', 0, 'orange', 0, 5, 0);
  push(L, 'mortiseBar', 0, 'orange', 2, 5, 0);
  push(L, 'tenonBar', 0, 'orange', 0, 5, 3);
  push(L, 'mortiseBar', 0, 'orange', 2, 5, 3);
  push(L, 'tenonBar', 1, 'brown', 0, 5, 1);
  push(L, 'mortiseBar', 1, 'brown', 3, 5, 1);
  // 穿销把梁头钉死在柱头
  for (const [px, pz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) push(L, 'pin', 0, 'yellow', px, 6, pz);
  push(L, 'plate2x2', 0, 'red', 1, 5, 1);
  return L;
}

/** 燕尾木箱：四壁全靠榫卯咬合，四角再压上燕尾榫楔子 */
function dovetailBox() {
  const L = [];
  push(L, 'plate2x4', 0, 'brown', 0, 0, 0);
  push(L, 'plate2x4', 0, 'brown', 0, 0, 2);
  for (const y of [1, 2]) {
    push(L, 'tenonBar', 0, 'orange', 0, y, 0);
    push(L, 'mortiseBar', 0, 'orange', 2, y, 0);
    push(L, 'mortiseBar', 0, 'orange', 0, y, 3);
    push(L, 'tenonBar', 0, 'orange', 2, y, 3);
    push(L, 'tenonBar', 1, 'brown', 0, y, 1);
    push(L, 'mortiseBar', 1, 'brown', 3, y, 1);
  }
  for (const [cx, cz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) push(L, 'dovetail', 0, 'yellow', cx, 3, cz);
  return L;
}

/* ===================== 难度 ===================== */
export const DIFFS = [
  { id: 1, name: '简单', color: '#63c98c' },
  { id: 2, name: '中度', color: '#4fb3e8' },
  { id: 3, name: '困难', color: '#f0a24a' },
  { id: 4, name: '大师', color: '#c879e0' },
  { id: 5, name: '宗师', color: '#ff6f7d' },
];

export function diffOf(model) {
  return DIFFS.find(d => d.id === (model.level || 1)) || DIFFS[0];
}

// cam.theta / cam.phi 决定看模型的角度；cam.dist 是早期写死的距离，
// v1.19.1 起加载时改由 main.js 的 frameModel() 按包围盒自适应取景（这里留作参考下限）。
/**
 * v1.21 双级齿轮减速箱：10 齿 → 16 齿 → 10 齿两级咬合。
 * 与旧图纸不同，这一张从一开始就按「紧密装配」排：三级齿轮共用一条轴线，
 * 支承排用跨接轴 + 轴套接成一根看得见的通轴，轴承/支柱把每个轴端都托住。
 */
function gearReducer() {
  const L = [];
  // 机座：齿轮排在 z=0，底座紧邻 z=1，支承排压在 z=3 上——三排格子面面相邻不脱节
  push(L, 'plate2x4', 0, 'gray', 0, 0, 1);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 1);
  push(L, 'plate2x4', 0, 'gray', 0, 0, 3);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 3);
  // 三级齿轮：10 → 16 → 10，中心距 3 格 ≈ 节圆半径和 2.52，齿面相切
  push(L, 'gearSmall', 0, 'orange', 0, 0, 0);
  push(L, 'gearBig', 0, 'blue', 2, 0, 0);
  push(L, 'gearSmall', 0, 'yellow', 5, 0, 0);
  // 电机与输出小齿轮同轴（ry=1 让轴沿 Z），短轴不越出机座
  push(L, 'motor', 1, 'navy', 5, 1, 1, 0, { params: { stub: true } });
  // v1.21 新零件：跨接轴 + 轴套把中间排补成一根看得见的通轴，支柱托住悬出轴端
  push(L, 'shaftSpan', 1, 'white', 0, 1, 1, 0, { params: { axisY: 0.96 } });
  push(L, 'bushing', 1, 'gray', 3, 1, 1, 0, { params: { axisY: 0.5 } });
  push(L, 'pedestal', 0, 'gray', 4, 1, 1);
  // 支承排：两只轴承托住通轴，联轴器把输出轴接长
  push(L, 'bearing', 0, 'white', 1, 1, 3);
  push(L, 'bearing', 0, 'white', 4, 1, 3);
  push(L, 'coupling', 1, 'yellow', 6, 1, 3);
  // 抗扭筋板与地脚紧固，全部贴着底板边缘
  push(L, 'gusset', 0, 'orange', 0, 1, 4);
  push(L, 'bolt', 0, 'gray', 1, 3, 3);
  return L;
}

/**
 * v1.21 锥齿轮分动台：电机横轴经一对锥齿轮拐 90°，再由皮带轮分出两路输出。
 * 借鉴机械原理馆的「轴端必有支承」：输入/输出轴两端都坐进轴承座，
 * 中间用跨接轴接长，不留隔空耦合。
 */
function bevelSplit() {
  const L = [];
  push(L, 'plate4x4', 0, 'gray', 0, 0, 0);
  push(L, 'holePlate4', 0, 'gray', 4, 0, 0);   // 带孔大板：分动台底脚用螺栓对锁
  push(L, 'plate2x4', 0, 'gray', 0, 0, 4);
  push(L, 'plate2x4', 0, 'gray', 4, 0, 4);
  // 横轴（X）→ 锥齿轮换向 → 竖轴（Z）
  push(L, 'motor', 0, 'navy', 0, 1, 1);
  push(L, 'bevelGear', 0, 'yellow', 2, 1, 1);
  push(L, 'coupling', 1, 'orange', 2, 1, 3);
  push(L, 'pulley', 0, 'teal', 2, 1, 5);
  // 新零件：跨接轴把竖轴接长、轴套填端面间隙、支柱托住悬出的皮带轮轴
  push(L, 'shaftSpan', 0, 'white', 4, 1, 5, 0, { params: { axisY: 0.96 } });
  push(L, 'bushing', 0, 'gray', 6, 1, 5, 0, { params: { axisY: 0.5 } });
  push(L, 'pedestal', 0, 'gray', 6, 1, 4);   // 坐进底板、贴着跨接轴，不再孤立在机座外
  push(L, 'bearing', 0, 'white', 4, 1, 3);
  push(L, 'pillow', 0, 'white', 5, 1, 1);
  push(L, 'gusset', 0, 'orange', 0, 1, 5);
  push(L, 'bolt', 0, 'gray', 7, 1, 0);
  return L;
}


/* ===================== v1.31 场景图纸：积木 + 装饰件 ===================== */
// 装饰件（Sprite）占 1 格、不承重也不参与稳固判定，所以可以摆在任意空地。
// 摆放约定：站在地台**上面一格**（y = 地台顶 + 1），不要和地台同格。

/** 童话小院：一栋 6×6 小木屋 + 后院里的树、篱笆、长凳、路灯和小狗 */
function cottageYard() {
  const L = [];
  // 屋基（6×6），院子另铺两片 4×4 在 z6-9
  for (let x = 0; x < 6; x += 2) for (let z = 0; z < 6; z += 2) push(L, 'plate2x2', 0, 'brown', x, 0, z);
  // 前墙 z0：左边两格砖 + 中间拱门（占 x2-4）+ 右边方块
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 0, 'white', 0, y, 0);
    push(L, 'cube', 0, 'white', 5, y, 0);
  }
  push(L, 'arch', 0, 'brown', 2, 1, 0);
  // 后墙 z5：中间两格开窗
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 0, 'white', 0, y, 5);
    push(L, 'cube', 0, 'teal', 2, y, 5);
    push(L, 'cube', 0, 'teal', 3, y, 5);
    push(L, 'brick2', 0, 'white', 4, y, 5);
  }
  // 两侧墙
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 1, 'white', 0, y, 1);
    push(L, 'brick2', 1, 'white', 0, y, 3);
    push(L, 'brick2', 1, 'white', 5, y, 1);
    push(L, 'brick2', 1, 'white', 5, y, 3);
  }
  // 屋内立柱：托住平顶正中一块，否则中间那块楼上没支撑
  push(L, 'cube', 0, 'brown', 2, 1, 2);
  push(L, 'cube', 0, 'brown', 2, 2, 2);
  push(L, 'cube', 0, 'brown', 2, 3, 2);
  // 平顶 + 烟囱
  for (let x = 0; x < 6; x += 2) for (let z = 0; z < 6; z += 2) push(L, 'plate2x2', 0, 'red', x, 4, z);
  push(L, 'cube', 0, 'gray', 4, 5, 2);
  push(L, 'cube', 0, 'gray', 4, 6, 2);
  // 后院地台（8×4），装饰件站在上面一格
  for (let x = 0; x < 8; x += 4) push(L, 'plate4x4', 0, 'gray', x, 0, 6);
  push(L, 'decoTree', 0, 'green', 1, 1, 7);
  push(L, 'decoFence', 0, 'brown', 3, 1, 6);
  push(L, 'decoBench', 0, 'brown', 5, 1, 7);
  push(L, 'decoLamp', 0, 'gray', 7, 1, 7);
  push(L, 'decoDog', 0, 'brown', 6, 1, 8);
  push(L, 'decoFlower', 0, 'green', 2, 1, 8);
  return L;
}

/** 街角公园：两棵大树夹着长凳，路灯、路牌、花丛、蝴蝶和小鸟 */
function cornerPark() {
  const L = [];
  for (let x = 0; x < 8; x += 4) for (let z = 0; z < 8; z += 4) push(L, 'plate4x4', 0, 'gray', x, 0, z);
  push(L, 'decoTree', 0, 'green', 1, 1, 1);
  push(L, 'decoTree', 0, 'green', 6, 1, 1);
  push(L, 'decoBench', 0, 'brown', 3, 1, 2);
  push(L, 'decoLamp', 0, 'gray', 1, 1, 6);
  push(L, 'decoSignpost', 0, 'brown', 6, 1, 6);
  push(L, 'decoFlower', 0, 'green', 3, 1, 6);
  push(L, 'decoFlower', 0, 'green', 6, 1, 4);
  push(L, 'decoRock', 0, 'gray', 0, 1, 4);
  push(L, 'decoButterfly', 0, 'orange', 4, 1, 4);
  push(L, 'decoBird', 0, 'red', 2, 1, 3);
  return L;
}

/** 森林一角：松树与大树、蘑菇、小鹿、灌木、石头，树边蹲着猫头鹰 */
function forestCorner() {
  const L = [];
  for (let z = 0; z < 8; z += 4) push(L, 'plate4x4', 0, 'green', 0, 0, z);
  push(L, 'decoPine', 0, 'green', 0, 1, 0);
  push(L, 'decoPine', 0, 'green', 2, 1, 6);
  push(L, 'decoTree', 0, 'green', 1, 1, 4);
  push(L, 'decoMushroom', 0, 'red', 3, 1, 2);
  push(L, 'decoMushroom', 0, 'red', 2, 1, 1);
  push(L, 'decoDeer', 0, 'brown', 1, 1, 2);
  push(L, 'decoBush', 0, 'green', 0, 1, 4);
  push(L, 'decoRock', 0, 'gray', 3, 1, 0);
  push(L, 'decoOwl', 0, 'brown', 0, 1, 2);
  push(L, 'decoBird', 0, 'red', 3, 1, 5);
  return L;
}

/** 农家院：4×4 小屋 + 院子里的围栏、水井、绵羊、鸭子和小马 */
function farmYard() {
  const L = [];
  // 屋基 4×4
  for (let x = 0; x < 4; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'gray', x, 0, z);
  // 前墙 z0：方块 + 拱门（arch 本身 3 格高，占 x1-3、y1-3）
  for (let y = 1; y <= 3; y++) push(L, 'cube', 0, 'yellow', 0, y, 0);
  push(L, 'arch', 0, 'brown', 1, 1, 0);
  // 后墙 z3
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 0, 'yellow', 0, y, 3);
    push(L, 'brick2', 0, 'yellow', 2, y, 3);
  }
  // 两侧墙（沿 Z 占 z1-2）
  for (let y = 1; y <= 3; y++) {
    push(L, 'brick2', 1, 'yellow', 0, y, 1);
    push(L, 'brick2', 1, 'yellow', 3, y, 1);
  }
  // 屋顶（拱门顶在 y3，屋顶抬到 y4 才不撞）
  for (let x = 0; x < 4; x += 2) for (let z = 0; z < 4; z += 2) push(L, 'plate2x2', 0, 'red', x, 4, z);
  // 院子地台（8×4）
  for (let x = 0; x < 8; x += 4) push(L, 'plate4x4', 0, 'green', x, 0, 4);
  push(L, 'decoFence', 0, 'brown', 4, 1, 4);
  push(L, 'decoFence', 0, 'brown', 5, 1, 4);
  push(L, 'decoFence', 0, 'brown', 6, 1, 4);
  push(L, 'decoMailbox', 0, 'brown', 7, 1, 4);
  push(L, 'decoWell', 0, 'gray', 5, 1, 6);
  push(L, 'decoSheep', 0, 'white', 4, 1, 6);
  push(L, 'decoSheep', 0, 'white', 6, 1, 6);
  push(L, 'decoDuck', 0, 'yellow', 7, 1, 6);
  push(L, 'decoPony', 0, 'brown', 2, 1, 5);
  push(L, 'decoBush', 0, 'green', 0, 1, 6);
  return L;
}

/** 雪人庭院：雪地上两个雪人、松树、灯笼和一堆篝火 */
function winterYard() {
  const L = [];
  for (let x = 0; x < 8; x += 4) push(L, 'plate4x4', 0, 'white', x, 0, 0);
  push(L, 'decoSnowman', 0, 'white', 1, 1, 1);
  push(L, 'decoSnowman', 0, 'white', 5, 1, 2);
  push(L, 'decoPine', 0, 'green', 0, 1, 3);
  push(L, 'decoPine', 0, 'green', 6, 1, 3);
  push(L, 'decoLantern', 0, 'red', 0, 1, 0);
  push(L, 'decoCampfire', 0, 'orange', 3, 1, 2);
  push(L, 'decoRock', 0, 'gray', 7, 1, 0);
  return L;
}

/* ===================== v1.32 更多场景图纸：积木 + 装饰 ===================== */

/** 铺地台：按 2 格步长铺 2×2 方板（长宽取偶数即可，不用凑 4 的倍数） */
function floorOf(L, color, w, d, y = 0) {
  for (let x = 0; x < w; x += 2) for (let z = 0; z < d; z += 2) push(L, 'plate2x2', 0, color, x, y, z);
}

/** 沿 X 砌墙（1 格深）：奇数长度先在左端放一块方块，其余用两格砖——上下层自然对齐 */
function wallX(L, color, x0, len, y, z, h = 1) {
  for (let k = 0; k < h; k++) {
    let x = x0;
    if (len % 2) { push(L, 'cube', 0, color, x, y + k, z); x++; }
    for (; x < x0 + len; x += 2) push(L, 'brick2', 0, color, x, y + k, z);
  }
}

/** 沿 Z 砌墙（1 格宽）：ry=1 的两格砖占 1 格宽、2 格深 */
function wallZ(L, color, x, z0, len, y, h = 1) {
  for (let k = 0; k < h; k++) {
    let z = z0;
    if (len % 2) { push(L, 'cube', 0, color, x, y + k, z); z++; }
    for (; z < z0 + len; z += 2) push(L, 'brick2', 1, color, x, y + k, z);
  }
}

/** 月洞门小院：6 格高的月洞门院墙 + 红灯、大树、长凳、石灯，院里一只小猫 */
function moonlightYard() {
  const L = [];
  floorOf(L, 'gray', 12, 8);
  // 院墙在 z0（画面最里侧）：正中一轮 6×6 月洞门，两侧各 3 格宽红墙，墙顶压一条通长石檐
  push(L, 'moonRing', 0, 'white', 3, 1, 0);
  wallX(L, 'red', 0, 3, 1, 0, 6);
  wallX(L, 'red', 9, 3, 1, 0, 6);
  for (let cx = 0; cx < 12; cx += 2) push(L, 'plate2x2', 0, 'gray', cx, 7, 0);
  // 院里：一棵大树撑起半院阴凉，墙角石头与花丛，月洞门边挂两盏灯笼
  push(L, 'decoTree', 0, 'green', 1, 1, 6);
  push(L, 'decoLantern', 0, 'red', 2, 1, 1);
  push(L, 'decoLantern', 0, 'red', 9, 1, 1);
  push(L, 'decoBench', 0, 'brown', 5, 1, 3);
  push(L, 'decoRock', 0, 'gray', 0, 1, 2);
  push(L, 'decoFlower', 0, 'green', 2, 1, 2);
  push(L, 'decoBush', 0, 'green', 10, 1, 2);
  push(L, 'decoLamp', 0, 'gray', 11, 1, 4);
  push(L, 'decoCat', 0, 'brown', 6, 1, 2);
  push(L, 'decoBird', 0, 'red', 4, 1, 6);
  push(L, 'decoBush', 0, 'green', 3, 1, 6);
  push(L, 'decoFlower', 0, 'green', 8, 1, 6);
  push(L, 'decoRock', 0, 'gray', 6, 1, 6);
  return L;
}

/** 露营营地：一顶三角帐篷、一堆篝火、围坐的石头和长凳，四周松树与灌木 */
function campsite() {
  const L = [];
  floorOf(L, 'green', 8, 8);
  // 帐篷：两块人字顶前后拼起来（脊线沿 Z），3 宽 4 深
  push(L, 'roof', 0, 'orange', 2, 1, 1);
  push(L, 'roof', 0, 'orange', 2, 1, 3);
  // 帐篷门口铺一块地垫
  push(L, 'plate2x2', 0, 'brown', 2, 1, 5);
  push(L, 'decoCampfire', 0, 'orange', 4, 1, 6);
  push(L, 'decoRock', 0, 'gray', 6, 1, 6);
  push(L, 'decoRock', 0, 'gray', 5, 1, 5);
  push(L, 'decoBench', 0, 'brown', 0, 1, 6);
  push(L, 'decoPine', 0, 'green', 0, 1, 0);
  push(L, 'decoTree', 0, 'green', 7, 1, 3);
  push(L, 'decoBush', 0, 'green', 7, 1, 0);
  push(L, 'decoMushroom', 0, 'red', 0, 1, 2);
  push(L, 'decoBird', 0, 'red', 6, 1, 1);
  push(L, 'decoDeer', 0, 'brown', 5, 1, 2);
  return L;
}

/** 风车牧场：红顶谷仓 + 大风车，围栏里绵羊、小马、鸭子，门口立着信箱 */
function windmillFarm() {
  const L = [];
  floorOf(L, 'green', 12, 8);
  // 谷仓 4×4（z4..7，门朝外）：正面拱门 + 右侧方柱，红瓦平顶，屋顶一个灰烟囱
  push(L, 'arch', 0, 'white', 7, 1, 7);
  for (let y = 1; y <= 3; y++) push(L, 'cube', 0, 'white', 10, y, 7);
  wallX(L, 'white', 7, 4, 1, 4, 3);
  wallZ(L, 'white', 7, 5, 2, 1, 3);
  wallZ(L, 'white', 10, 5, 2, 1, 3);
  for (const [rx, rz] of [[7, 4], [9, 4], [7, 6], [9, 6]]) push(L, 'plate2x2', 0, 'red', rx, 4, rz);
  push(L, 'cube', 0, 'gray', 10, 5, 5);
  push(L, 'cube', 0, 'gray', 10, 6, 5);
  // 牧场：风车当照壁，草场上散着牲口，前面一道木栅栏
  push(L, 'decoWindmill', 0, 'white', 2, 1, 2);
  push(L, 'decoWell', 0, 'gray', 0, 1, 3);
  push(L, 'decoMailbox', 0, 'brown', 6, 1, 6);
  push(L, 'decoPony', 0, 'brown', 1, 1, 0);
  push(L, 'decoSheep', 0, 'white', 4, 1, 1);
  push(L, 'decoSheep', 0, 'white', 5, 1, 0);
  push(L, 'decoDuck', 0, 'yellow', 3, 1, 2);
  push(L, 'decoFence', 0, 'brown', 7, 1, 0);
  push(L, 'decoFence', 0, 'brown', 8, 1, 0);
  push(L, 'decoFence', 0, 'brown', 9, 1, 0);
  push(L, 'decoFence', 0, 'brown', 10, 1, 0);
  push(L, 'decoTree', 0, 'green', 0, 1, 6);
  push(L, 'decoBush', 0, 'green', 11, 1, 2);
  return L;
}

/** 海边灯塔：礁石岛上的白塔红灯，木栈桥从岸边一路搭到岛上，桥头堆货、坐着人 */
function lighthouseCoast() {
  const L = [];
  floorOf(L, 'blue', 12, 8);
  // 礁石岛：两层灰石，台面与栈桥齐平
  for (const y of [1, 2]) {
    for (const [x, z] of [[8, 0], [10, 0], [8, 2], [10, 2]]) push(L, 'plate2x2', 0, 'gray', x, y, z);
  }
  // 灯塔：圆柱塔身 + 红圆顶 + 顶珠
  push(L, 'cylTall', 0, 'white', 9, 3, 1);
  push(L, 'dome', 0, 'red', 9, 6, 1);
  push(L, 'ballS', 0, 'yellow', 9, 7, 1);
  // 木栈桥：桥面架到与岛面齐平，四根木桩踩在海床上——桥下透得出海，
  // 才看得出是"伸进海里的桥"，而不是平铺在水面上的一块木板
  for (let x = 0; x < 8; x += 2) {
    push(L, 'cube', 0, 'brown', x, 1, 3);
    push(L, 'cube', 0, 'brown', x, 2, 3);
    push(L, 'plate2x2', 0, 'brown', x, 3, 2);
  }
  // 桥头堆两只小货箱、一条长凳
  push(L, 'cube', 0, 'brown', 5, 4, 2);
  push(L, 'cube', 0, 'brown', 6, 4, 3);
  push(L, 'decoBench', 0, 'brown', 0, 4, 2);
  // 装饰：岛上的礁石与花、天上两只海鸥
  push(L, 'decoRock', 0, 'gray', 8, 3, 3);
  push(L, 'decoFlower', 0, 'green', 11, 3, 0);
  push(L, 'decoBush', 0, 'green', 11, 3, 3);
  push(L, 'decoBird', 0, 'white', 7, 5, 0);
  push(L, 'decoBird', 0, 'white', 2, 5, 6);
  return L;
}

/** 圣诞小屋：雪地上的红顶木屋、烟囱、两个雪人、松树、灯笼与一堆篝火 */
function christmasCabin() {
  const L = [];
  floorOf(L, 'white', 8, 8);
  // 小屋 4×4：正面拱门 + 右侧柱，红瓦平顶
  push(L, 'arch', 0, 'brown', 2, 1, 5);
  for (let y = 1; y <= 3; y++) push(L, 'cube', 0, 'brown', 5, y, 5);
  wallX(L, 'brown', 2, 4, 1, 2, 3);
  wallZ(L, 'brown', 2, 3, 2, 1, 3);
  wallZ(L, 'brown', 5, 3, 2, 1, 3);
  for (const [rx, rz] of [[2, 2], [4, 2], [2, 4], [4, 4]]) push(L, 'plate2x2', 0, 'red', rx, 4, rz);
  push(L, 'cube', 0, 'gray', 4, 5, 3);
  push(L, 'cube', 0, 'gray', 4, 6, 3);
  // 雪人与冬日布景
  push(L, 'decoSnowman', 0, 'white', 0, 1, 0);
  push(L, 'decoSnowman', 0, 'white', 6, 1, 6);
  push(L, 'decoPine', 0, 'green', 0, 1, 4);
  push(L, 'decoPine', 0, 'green', 7, 1, 3);
  push(L, 'decoLantern', 0, 'red', 1, 1, 6);
  push(L, 'decoCampfire', 0, 'orange', 6, 1, 0);
  push(L, 'decoRock', 0, 'gray', 7, 1, 6);
  push(L, 'decoDeer', 0, 'brown', 1, 1, 0);
  return L;
}

/** 喷泉广场：双层石雕喷泉立在广场中心，四角长凳、路灯与花丛环绕 */
function fountainPlaza() {
  const L = [];
  floorOf(L, 'gray', 8, 8);
  // 喷泉：圆柱基座 → 圆盘水钵 → 细水柱 → 顶珠
  push(L, 'cyl', 0, 'white', 3, 1, 3);
  push(L, 'disc', 0, 'blue', 2, 3, 2);
  push(L, 'rod', 0, 'white', 3, 4, 3);
  push(L, 'ballS', 0, 'yellow', 3, 7, 3);
  // 广场四角：树、灯、长凳
  push(L, 'decoTree', 0, 'green', 0, 1, 0);
  push(L, 'decoTree', 0, 'green', 6, 1, 6);
  push(L, 'decoLamp', 0, 'gray', 6, 1, 0);
  push(L, 'decoLamp', 0, 'gray', 0, 1, 6);
  push(L, 'decoBench', 0, 'brown', 2, 1, 0);
  push(L, 'decoBench', 0, 'brown', 5, 1, 4);
  push(L, 'decoFlower', 0, 'green', 1, 1, 2);
  push(L, 'decoFlower', 0, 'green', 6, 1, 2);
  push(L, 'decoBird', 0, 'red', 4, 1, 1);
  push(L, 'decoCat', 0, 'brown', 1, 1, 5);
  return L;
}

/** 花园凉亭：四根朱柱撑起 6×6 的方亭，亭顶一个尖锥，亭外花木扶疏 */
function gardenPavilion() {
  const L = [];
  floorOf(L, 'green', 8, 8);
  for (const [cx, cz] of [[1, 1], [5, 1], [1, 5], [5, 5]]) push(L, 'column', 0, 'red', cx, 1, cz);
  // 亭顶：6×6 大板压住四柱，上面再收一级 4×4，正中起一枚锥顶——两级屋檐才有亭子的样子
  push(L, 'plate6x6', 0, 'brown', 0, 5, 0);
  for (const rx of [1, 3]) for (const rz of [1, 3]) push(L, 'plate2x2', 0, 'brown', rx, 6, rz);
  push(L, 'cone', 0, 'teal', 2, 7, 2);
  push(L, 'ballS', 0, 'yellow', 3, 9, 3);
  // 亭内一条长凳，亭外一圈花草树石
  push(L, 'decoBench', 0, 'brown', 3, 1, 3);
  push(L, 'decoFlower', 0, 'green', 0, 1, 6);
  push(L, 'decoFlower', 0, 'green', 6, 1, 6);
  push(L, 'decoBush', 0, 'green', 7, 1, 0);
  push(L, 'decoTree', 0, 'green', 7, 1, 6);
  push(L, 'decoLamp', 0, 'gray', 0, 1, 0);
  push(L, 'decoRock', 0, 'gray', 6, 1, 3);
  push(L, 'decoBird', 0, 'red', 7, 1, 3);
  return L;
}

/** 屋顶花园：两层小楼，楼顶围一圈栏杆，栏杆里养花、摆长凳、晒着太阳的猫 */
function rooftopGarden() {
  const L = [];
  floorOf(L, 'gray', 8, 8);
  // 一层：正面（z7）拱门 + 两侧柱，其余三面实墙，共 4 层高（下两层白、上两层黄＝两层楼）
  push(L, 'arch', 0, 'brown', 2, 1, 7);
  for (let y = 1; y <= 3; y++) {
    const col = y <= 2 ? 'white' : 'yellow';
    push(L, 'cube', 0, col, 1, y, 7);
    push(L, 'cube', 0, col, 5, y, 7);
    push(L, 'cube', 0, col, 6, y, 7);
  }
  for (let x = 1; x <= 6; x += 2) push(L, 'brick2', 0, 'yellow', x, 4, 7);   // 门楣 y4 补满
  wallX(L, 'white', 1, 6, 1, 2, 2);             // 后墙（下）
  wallX(L, 'yellow', 1, 6, 3, 2, 2);            // 后墙（上）
  wallZ(L, 'white', 1, 3, 4, 1, 2);             // 左墙（下）
  wallZ(L, 'yellow', 1, 3, 4, 3, 2);            // 左墙（上）
  wallZ(L, 'white', 6, 3, 4, 1, 2);             // 右墙（下）
  wallZ(L, 'yellow', 6, 3, 4, 3, 2);            // 右墙（上）
  // 屋内立柱：托住楼板正中，免得中间那块板悬空
  push(L, 'column', 0, 'yellow', 3, 1, 4);
  // 楼板
  for (const rx of [1, 3, 5]) for (const rz of [2, 4, 6]) push(L, 'plate2x2', 0, 'red', rx, 5, rz);
  // 屋顶栏杆（一圈方块）
  for (let x = 1; x <= 6; x++) { push(L, 'cube', 0, 'white', x, 6, 2); push(L, 'cube', 0, 'white', x, 6, 7); }
  for (let z = 3; z <= 6; z++) { push(L, 'cube', 0, 'white', 1, 6, z); push(L, 'cube', 0, 'white', 6, 6, z); }
  // 屋顶花园
  push(L, 'decoFlower', 0, 'green', 2, 6, 3);
  push(L, 'decoFlower', 0, 'green', 5, 6, 3);
  push(L, 'decoBench', 0, 'brown', 3, 6, 3);
  push(L, 'decoBush', 0, 'green', 2, 6, 5);
  push(L, 'decoLantern', 0, 'red', 5, 6, 5);
  push(L, 'decoCat', 0, 'brown', 3, 6, 5);
  // 楼下门前
  push(L, 'decoMailbox', 0, 'brown', 0, 1, 7);
  push(L, 'decoBush', 0, 'green', 0, 1, 4);
  push(L, 'decoTree', 0, 'green', 7, 1, 5);
  return L;
}

export const MODELS = [
  {
    id: 'table', name: '小方桌', tag: '生活', icon: '🪵', level: 1,
    desc: '四条腿、桌面，还摆了个小果盘',
    list: table(),
    cam: { theta: -0.95, phi: 1.1, dist: 16 },
  },
  {
    id: 'rockingHorse', name: '木马摇摇', tag: '玩具', icon: '🐴', level: 1,
    desc: '六种形状拼出一只摇摇晃晃的小木马',
    list: rockingHorse(),
    cam: { theta: -1.05, phi: 1.12, dist: 17 },
  },
  {
    id: 'lamp', name: '路灯', tag: '生活', icon: '🏮', level: 1,
    desc: '底座、灯杆、灯罩和顶珠',
    list: lamp(),
    cam: { theta: -0.9, phi: 1.08, dist: 15 },
  },
  {
    id: 'bench', name: '木板凳', tag: '生活', icon: '🪑', level: 1,
    desc: '四条腿、座板、软垫和靠背',
    list: bench(),
    cam: { theta: -1.0, phi: 1.1, dist: 17 },
  },
  {
    id: 'dog', name: '小狗', tag: '动物', icon: '🐶', level: 1,
    desc: '长身子、四条短腿，坐得端端正正',
    list: dog(),
    cam: { theta: -1.15, phi: 1.12, dist: 15 },
  },
  {
    id: 'redWall', name: '红墙', tag: '园林', icon: '🧱', level: 2,
    desc: '长墙、镂空花窗和石质压顶',
    list: redWall(),
    cam: { theta: -0.9, phi: 1.05, dist: 26 },
  },
  {
    id: 'cottage', name: '红顶小屋', tag: '建筑', icon: '🏠', level: 2,
    desc: '地基、墙体、拱门、后窗和烟囱',
    list: cottage(),
    cam: { theta: -0.75, phi: 1.02, dist: 24 },
  },
  {
    id: 'car', name: '小跑车', tag: '机械', icon: '🚗', level: 2,
    desc: '底盘、车身、座舱和四个轮子，轮毂螺栓与底盘筋板',
    list: car(),
    cam: { theta: -1.05, phi: 1.12, dist: 24 },
  },
  {
    id: 'tree', name: '苹果树', tag: '自然', icon: '🌳', level: 2,
    desc: '树干、三层树冠，还有红苹果',
    list: tree(),
    cam: { theta: -0.65, phi: 1.12, dist: 32 },
  },
  {
    id: 'tenonBench', name: '榫卯板凳', tag: '木工', icon: '🪚', level: 2,
    desc: '管脚枨用卯榫顶着凳腿，座面木钉铆钉锁死',
    list: tenonBench(),
    cam: { theta: -1.0, phi: 1.08, dist: 18 },
  },
  {
    id: 'tower', name: '瞭望塔', tag: '挑战', icon: '🗼', level: 3,
    desc: '四根立柱撑起小屋，考验平衡',
    list: tower(),
    cam: { theta: -0.6, phi: 1.1, dist: 24 },
  },
  {
    id: 'hut', name: '人字顶小屋', tag: '建筑', icon: '🏡', level: 3,
    desc: '拱门、山墙小窗、连续屋脊和烟囱',
    list: hut(),
    cam: { theta: -0.8, phi: 1.08, dist: 22 },
  },
  {
    id: 'ship', name: '小帆船', tag: '想象', icon: '⛵', level: 3,
    desc: '船体、甲板、船舱与桅杆',
    list: ship(),
    cam: { theta: -0.9, phi: 1.05, dist: 26 },
  },
  {
    id: 'rocket', name: '大火箭', tag: '航天', icon: '🚀', level: 3,
    desc: '箭体、尾焰底座和整流罩，倒计时发射！',
    list: rocket(),
    cam: { theta: -0.7, phi: 1.15, dist: 28 },
  },
  {
    id: 'canopy', name: '悬挑雨棚', tag: '机械', icon: '🏗️', level: 3,
    desc: '螺栓托架把探出的大梁锁在柱头上',
    list: canopy(),
    cam: { theta: -1.0, phi: 1.1, dist: 22 },
  },
  {
    id: 'palaceWall', name: '宫墙丁顺砌', tag: '古建', icon: '🏮', level: 3,
    desc: '下碱灰砖、上身红砖，一顺一丁交错咬缝',
    list: palaceWall(),
    cam: { theta: -0.9, phi: 1.05, dist: 30 },
  },
  {
    id: 'pavilion', name: '六角亭', tag: '园林', icon: '⛩️', level: 4,
    desc: '台基、四柱栏杆，头顶一枚攒尖顶',
    list: pavilion(),
    cam: { theta: -0.85, phi: 1.08, dist: 22 },
  },
  {
    id: 'archBridge', name: '石拱桥', tag: '园林', icon: '🌉', level: 4,
    desc: '半圆拱券撑起桥面，桥头还有石墩',
    list: archBridge(),
    cam: { theta: -1.0, phi: 1.06, dist: 20 },
  },
  {
    id: 'moonGate', name: '月亮门', tag: '园林', icon: '🌕', level: 4,
    desc: '十二块楔形拱石砌成的圆月洞，砖缝清晰可见',
    list: moonGate(),
    cam: { theta: -0.85, phi: 1.05, dist: 26 },
  },
  {
    id: 'castle', name: '城堡', tag: '史诗', icon: '🏰', level: 4,
    desc: '四座塔楼、拱门和中央瞭望台',
    list: castle(),
    cam: { theta: -0.75, phi: 1.05, dist: 34 },
  },
  {
    id: 'dougong', name: '斗拱', tag: '古建', icon: '🏛️', level: 4,
    desc: '纵横拱臂层层出跳，把屋檐托出去',
    list: dougong(),
    cam: { theta: -0.75, phi: 1.0, dist: 26 },
  },
  {
    id: 'flyingPavilion', name: '飞檐亭', tag: '古建', icon: '🎐', level: 4,
    desc: '檐板探出柱外一圈，四角高高翘起挂顶珠',
    list: flyingPavilion(),
    cam: { theta: -0.85, phi: 1.06, dist: 24 },
  },
  {
    id: 'pagoda', name: '宝塔', tag: '古建', icon: '🗾', level: 5,
    desc: '台基、实心塔身、层层出檐和塔刹',
    list: pagoda(),
    cam: { theta: -0.8, phi: 1.04, dist: 24 },
  },
  {
    id: 'gateTower', name: '城门楼', tag: '古建', icon: '🏯', level: 5,
    desc: '厚城墙开一条月洞隧道，墙顶再起小楼',
    list: gateTower(),
    cam: { theta: -0.95, phi: 1.02, dist: 40 },
  },
  {
    id: 'greatHall', name: '大殿', tag: '古建', icon: '⛩', level: 5,
    desc: '八格台基、厚墙开门、一条长长的屋脊',
    list: greatHall(),
    cam: { theta: -0.9, phi: 1.05, dist: 26 },
  },
  {
    id: 'lubanLock', name: '鲁班锁', tag: '巧件', icon: '🧩', level: 5,
    desc: '十根木梁井字编织，一颗钉子不用照样立得住',
    list: lubanLock(),
    cam: { theta: -0.95, phi: 1.05, dist: 20 },
  },
  {
    id: 'gearTrain', name: '齿轮传动', tag: '机械', icon: '⚙️', level: 2,
    desc: '三级齿轮咬合；摇柄/飞轮/联轴器都与齿轮同轴，轴承托轴、导轨滑块当检修滑道',
    list: gearTrain(),
    cam: { theta: -0.9, phi: 1.05, dist: 26 },
  },
  {
    id: 'clockworkCar', name: '发条小车', tag: '机械', icon: '🚙', level: 3,
    desc: '滚子链把电机送到前轮，右侧通轴带动后轮，四轮都吃扭矩；发条盒套后桥储能，底盘不再摆无用的装饰簧',
    list: clockworkCar(),
    cam: { theta: -0.95, phi: 1.06, dist: 26 },
  },
  {
    id: 'winch', name: '卷扬机', tag: '机械', icon: '🏗', level: 3,
    desc: '手摇曲轴带卷筒轴，飞轮装在轴端稳速，轴承座托长轴、筋板抗扭，钢丝绳吊重物',
    list: winch(),
    cam: { theta: -0.9, phi: 1.05, dist: 26 },
  },
  {
    id: 'dovetailBox', name: '燕尾木箱', tag: '木工', icon: '🧰', level: 3,
    desc: '四壁全靠榫卯咬合，四角压上燕尾榫',
    list: dovetailBox(),
    cam: { theta: -0.9, phi: 1.05, dist: 20 },
  },
  {
    id: 'gearClock', name: '齿轮钟', tag: '机械', icon: '🕰', level: 4,
    desc: '大齿轮带小齿轮走时，飞轮当摆轮，发条盒与联轴器都挂在走时轴上，滚珠轴承托指针轴',
    list: gearClock(),
    cam: { theta: -0.9, phi: 1.04, dist: 26 },
  },
  {
    id: 'crane', name: '塔吊', tag: '机械', icon: '🏗️', level: 4,
    desc: '塔身榫卯腰梁、吊臂滑轮；根部手摇卷扬给滑轮供力，回转支承用滚珠轴承',
    list: crane(),
    cam: { theta: -0.85, phi: 1.03, dist: 30 },
  },
  {
    id: 'steamEngine', name: '蒸汽机心', tag: '机械', icon: '🚂', level: 4,
    desc: '卧式曲柄滑块：电机只转芯轴→齿轮→横置曲轴→水平连杆→活塞；导轨滑块当十字头，滑阀压簧随活塞行程压缩回弹',
    list: steamEngine(),
    cam: { theta: 0.85, phi: 1.0, dist: 24 },
  },
  {
    id: 'genevaFeeder', name: '槽轮步进', tag: '机械', icon: '🎰', level: 3,
    desc: '拨盘转一圈槽轮只步进 90°；联轴器从机架前端接长输入轴、与电机同轴，导轨送工件',
    list: genevaFeeder(),
    cam: { theta: -0.85, phi: 1.06, dist: 20 },
  },
  {
    id: 'wormReducer', name: '蜗轮减速机', tag: '机械', icon: '🌀', level: 3,
    desc: '蜗杆转 16 圈蜗轮才转一圈，反向自锁；联轴器接电机、轴承座托蜗轮轴',
    list: wormReducer(),
    cam: { theta: -0.85, phi: 1.05, dist: 20 },
  },
  {
    id: 'gearRack', name: '齿轮齿条', tag: '机械', icon: '🛠', level: 3,
    desc: '齿轮一转齿条笔直推出；背后导轨＋滑块防歪，端挡移到行程外让位，筋板加固机架',
    list: gearRack(),
    cam: { theta: -0.8, phi: 1.0, dist: 18 },
  },
  {
    id: 'cardanDrive', name: '万向节传动', tag: '机械', icon: '🧭', level: 4,
    desc: '十字轴把动力拐 90°；从动轴坐进轴承座，地脚螺栓固定',
    list: cardanDrive(),
    cam: { theta: -0.95, phi: 1.02, dist: 18 },
  },
  {
    id: 'ratchetWinch', name: '棘轮卷扬', tag: '机械', icon: '⚓', level: 4,
    desc: '棘爪顶住齿面只能单向卷；棘轮每转过一齿，爪被顶起一次、压簧跟着压缩再把它压回，轴承座托卷筒轴',
    list: ratchetWinch(),
    cam: { theta: -0.8, phi: 1.05, dist: 20 },
  },
  {
    id: 'screwLift', name: '丝杠升降台', tag: '机械', icon: '🛗', level: 3,
    desc: '电机→联轴器→丝杠，螺母把旋转变成直线；导轨滑块约束方向、轴端有轴承支承',
    list: screwLift(),
    cam: { theta: -0.85, phi: 1.02, dist: 18 },
  },
  {
    id: 'beltDrive', name: '皮带输送台', tag: '机械', icon: '📦', level: 3,
    desc: '皮带套住主/从动轮同向传动；长度参数改的是齿距密度，占地始终两格',
    list: beltDrive(),
    cam: { theta: -0.85, phi: 1.05, dist: 20 },
  },
  {
    id: 'camPress', name: '凸轮压簧机', tag: '机械', icon: '🔨', level: 4,
    desc: '凸轮顶起竖直顶杆，带压盖的压簧被真实压缩再把它压回；输出端收在轴承里，中空龙门架给行程让位——自动冲床原型',
    list: camPress(),
    // 保持正对门洞的角度：压簧与顶杆的压缩过程是这台机器的主角，不能被门柱挡住
    cam: { theta: -0.85, phi: 1.04, dist: 20 },
  },
  {
    id: 'bevelDrive', name: '锥齿轮换向台', tag: '机械', icon: '🔀', level: 4,
    desc: '电机横轴咬住竖置锥齿轮，动力整个拐 90°；联轴器接长竖轴、皮带轮输出，轴承座托住两端',
    list: bevelDrive(),
    cam: { theta: -0.9, phi: 1.02, dist: 22 },
  },
  {
    id: 'yokePress', name: '苏格兰轭冲床', tag: '机械', icon: '⚒', level: 5,
    desc: '曲柄销在轭的竖槽里滑，输出纯正弦往复；压簧随行程压缩回弹，同一根曲轴还带一根摆动摇杆',
    list: yokePress(),
    cam: { theta: -0.9, phi: 1.04, dist: 20 },
  },
  {
    id: 'gearReducer', name: '双级减速箱', tag: '机械', icon: '⚙️', level: 4,
    desc: '10→16→10 两级齿轮减速；跨接轴与轴套把三段轴接成一根通轴，每个轴端都有支承',
    list: gearReducer(),
    cam: { theta: -0.85, phi: 1.02, dist: 20 },
  },
  {
    id: 'bevelSplit', name: '锥齿轮分动台', tag: '机械', icon: '🔀', level: 4,
    desc: '电机横轴经锥齿轮拐 90°再由皮带轮分出两路；输入/输出轴两端都坐进轴承座',
    list: bevelSplit(),
    cam: { theta: -0.9, phi: 1.04, dist: 22 },
  },
  {
    id: 'tenonFrame', name: '榫卯框架', tag: '古建', icon: '🪵', level: 4,
    desc: '凸榫梁插进卯眼梁，柱头再打穿销',
    list: tenonFrame(),
    cam: { theta: -0.9, phi: 1.05, dist: 22 },
  },
  // v1.31：积木 + 装饰件组合的场景图纸（装饰件不承重，专门用来配风景）
  {
    id: 'cottageYard', name: '童话小院', tag: '场景', icon: '🏡', level: 2,
    desc: '一栋小木屋，院里一棵大树、一道篱笆、一条长凳，路灯下蹲着小狗',
    list: cottageYard(),
    cam: { theta: -0.95, phi: 1.06, dist: 26 },
  },
  {
    id: 'cornerPark', name: '街角公园', tag: '场景', icon: '🌳', level: 1,
    desc: '两棵大树夹着长凳，路灯、路牌、花丛和蝴蝶，天上一朵云一个太阳',
    list: cornerPark(),
    cam: { theta: -0.9, phi: 1.02, dist: 26 },
  },
  {
    id: 'forestCorner', name: '森林一角', tag: '场景', icon: '🌲', level: 1,
    desc: '松树与大树、蘑菇、小鹿和灌木，树梢上蹲着猫头鹰',
    list: forestCorner(),
    cam: { theta: -1.0, phi: 1.04, dist: 26 },
  },
  {
    id: 'farmYard', name: '农家院', tag: '场景', icon: '🐑', level: 2,
    desc: '围栏里一栋小屋、一口水井，绵羊和鸭子散在草地上，门口立着信箱',
    list: farmYard(),
    cam: { theta: -0.92, phi: 1.05, dist: 28 },
  },
  {
    id: 'winterYard', name: '雪人庭院', tag: '场景', icon: '⛄', level: 1,
    desc: '两个雪人站在雪地上，松树、灯笼和一堆篝火，冬天的院子',
    list: winterYard(),
    cam: { theta: -0.95, phi: 1.03, dist: 26 },
  },
  // v1.32：再来 8 张场景图纸，都是「积木搭房子、装饰当风景」
  {
    id: 'moonlightYard', name: '月洞门小院', tag: '场景', icon: '🏮', level: 3,
    desc: '六格高的月洞门院墙，两侧红墙压石檐，院里一棵大树、两盏灯笼、一条长凳',
    list: moonlightYard(),
    cam: { theta: -0.92, phi: 1.03, dist: 34 },
  },
  {
    id: 'campsite', name: '露营营地', tag: '场景', icon: '🏕️', level: 1,
    desc: '一顶三角帐篷、一堆篝火、围坐的石凳，松树下一只小鹿探头',
    list: campsite(),
    cam: { theta: -0.98, phi: 1.04, dist: 26 },
  },
  {
    id: 'windmillFarm', name: '风车牧场', tag: '场景', icon: '🌬️', level: 3,
    desc: '红顶谷仓配大风车，草场上绵羊、小马、鸭子，木栅栏围住半个院子',
    list: windmillFarm(),
    cam: { theta: -0.9, phi: 1.03, dist: 34 },
  },
  {
    id: 'lighthouseCoast', name: '海边灯塔', tag: '场景', icon: '🗼', level: 2,
    desc: '礁石岛上立着白塔红灯，木栈桥伸进海里，桥头堆着一箱货、摆着长凳',
    list: lighthouseCoast(),
    cam: { theta: -0.88, phi: 1.02, dist: 34 },
  },
  {
    id: 'christmasCabin', name: '圣诞小屋', tag: '场景', icon: '🎄', level: 2,
    desc: '雪地里的红顶木屋，屋顶一个灰烟囱，雪人、松树、灯笼和一堆篝火',
    list: christmasCabin(),
    cam: { theta: -0.96, phi: 1.03, dist: 26 },
  },
  {
    id: 'fountainPlaza', name: '喷泉广场', tag: '场景', icon: '⛲', level: 2,
    desc: '双层石雕喷泉立在正中，水柱顶着一颗金珠，四角是树、灯、长凳和花丛',
    list: fountainPlaza(),
    cam: { theta: -0.94, phi: 1.04, dist: 26 },
  },
  {
    id: 'gardenPavilion', name: '花园凉亭', tag: '场景', icon: '🍃', level: 2,
    desc: '四根朱柱撑起六格见方的亭顶，锥尖顶着金珠，亭外花草扶疏',
    list: gardenPavilion(),
    cam: { theta: -0.96, phi: 1.02, dist: 28 },
  },
  {
    id: 'rooftopGarden', name: '屋顶花园', tag: '场景', icon: '🌿', level: 3,
    desc: '两层小楼的屋顶围一圈白栏杆，栏杆里种花、摆长凳，猫在晒太阳',
    list: rooftopGarden(),
    cam: { theta: -0.94, phi: 1.02, dist: 30 },
  },
];

// v1.22：应用亚格装配收敛补丁。补丁表为空时这里完全无副作用，
// 所有既有图纸的行为与 v1.21 逐字节一致。
applyAssemblyFit(MODELS);
