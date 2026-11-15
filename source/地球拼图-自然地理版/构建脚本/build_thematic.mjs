// 生成「专题片」数据：山脉 / 河流 / 洋流 三套可拆装的拼片几何。
//
// 输入（同目录，构建期产物）：
//   geodata-mountains.js  MOUNTAIN_RANGES  山脉范围面（Natural Earth 1:50m，公有领域）
//   geodata-rivers.js     RIVERS           河流中心线（Natural Earth 1:10m，公有领域）
//   geodata-currents.js   CURRENTS         洋流示意流路（手写教学数据）
// 输出：
//   geodata-thematic.js   THEMATIC_MOUNTAINS / THEMATIC_RIVERS / THEMATIC_CURRENTS
//
// 三套数据的坐标都是 [lon, lat]；面片统一成 polygons = [[外环, 洞...], ...]，
// 与 game.js 里 buildMultiPolygonPiece() 的输入一致。
// 河流与洋流原本是线：这里按球面法向把中心线加宽成带状面，才能当拼片拆装。
//
// 用法：node build_thematic.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R_EARTH = 6371.0088;
const D2R = Math.PI / 180;

function readConst(file, name) {
  // 这些 geodata 是 Python 脚本在 Windows 上写的，行尾是 CRLF，不能按 ';\n' 找结尾
  const s = fs.readFileSync(path.join(HERE, file), 'utf8').replace(/\r\n/g, '\n');
  const key = `export const ${name} = `;
  const i = s.indexOf(key);
  if (i < 0) throw new Error(`${file} 里找不到 ${name}`);
  const start = i + key.length;
  const end = s.indexOf('];', start);
  if (end < 0) throw new Error(`${file} 里 ${name} 没有正常结尾`);
  return JSON.parse(s.slice(start, end + 1));
}

const round2 = (v) => Math.round(v * 100) / 100;
const ununit = (v) => {
  const lon = Math.atan2(v[0], v[2]) / D2R;
  const lat = Math.asin(Math.max(-1, Math.min(1, v[1]))) / D2R;
  return [lon, lat];
};
const unit = (lon, lat) => {
  const la = lat * D2R, lo = lon * D2R, c = Math.cos(la);
  return [c * Math.sin(lo), Math.sin(la), c * Math.cos(lo)];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** 把离散经度连续化，跨日界处不再跳回 -180 */
function unwrapPath(p) {
  const out = [p[0].slice()];
  for (let i = 1; i < p.length; i++) {
    let lon = p[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, p[i][1]]);
  }
  return out;
}

/** 球面多边形面积（km²）：Δλ × (2 + sinφ1 + sinφ2) 求和 */
function ringAreaK(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    s += (lon2 - lon1) * D2R * (2 + Math.sin(lat1 * D2R) + Math.sin(lat2 * D2R));
  }
  return Math.abs(s) * R_EARTH * R_EARTH / 2;
}

function polyArea(poly) {
  let a = ringAreaK(poly[0]);
  for (let i = 1; i < poly.length; i++) a -= ringAreaK(poly[i]);
  return Math.max(0, a);
}

/** 球面质心：顶点单位向量求和后归一化（面积加权太慢，范围面顶点密度已经近似均匀） */
function centroidOf(polys) {
  let sx = 0, sy = 0, sz = 0;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [lon, lat] of ring) {
        const v = unit(lon, lat);
        sx += v[0]; sy += v[1]; sz += v[2];
      }
    }
  }
  return ununit(norm([sx, sy, sz]));
}

function bboxOf(polys) {
  let lon0 = 1e9, lon1 = -1e9, lat0 = 1e9, lat1 = -1e9;
  for (const poly of polys) {
    for (const ring of poly) {
      const r = unwrapPath(ring);
      for (const [lon, lat] of r) {
        if (lon < lon0) lon0 = lon;
        if (lon > lon1) lon1 = lon;
        if (lat < lat0) lat0 = lat;
        if (lat > lat1) lat1 = lat;
      }
    }
  }
  return { lon0, lon1, lat0, lat1 };
}

/** 抽稀采样点：训练判定用「点到片的最近角距」，长条片不能只比中心点 */
function samplePoints(polys) {
  const all = [];
  for (const poly of polys) for (const ring of poly) for (const p of ring) all.push(p);
  if (all.length <= 40) return all.map(([lon, lat]) => [round2(lon), round2(lat)]);
  const step = all.length / 40;
  const out = [];
  for (let i = 0; i < 40; i++) {
    const [lon, lat] = all[Math.floor(i * step)];
    out.push([round2(lon), round2(lat)]);
  }
  return out;
}

/** 「约 20°S–35°N，60°–120°E」这种跨度描述 */
function spanText(bb) {
  const lat = (v) => Math.abs(v).toFixed(0) + '°' + (v >= 0 ? 'N' : 'S');
  const lon = (v) => {
    const x = ((v % 360) + 540) % 360 - 180;
    return Math.abs(x).toFixed(0) + '°' + (x >= 0 ? 'E' : 'W');
  };
  return `约 ${lat(bb.lat0)}–${lat(bb.lat1)}，${lon(bb.lon0)}–${lon(bb.lon1)}`;
}

/** 沿大圆在子午/纬线之间加密：每 step 度一个点，避免带状面出现长直边 */
function densify(p, step = 0.8) {
  const out = [p[0].slice()];
  for (let i = 1; i < p.length; i++) {
    const [lo0, la0] = p[i - 1], [lo1, la1] = p[i];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(lo1 - lo0), Math.abs(la1 - la0)) / step));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      out.push([lo0 + (lo1 - lo0) * t, la0 + (la1 - la0) * t]);
    }
  }
  return out;
}

/** Chaikin 一次：把折线的尖角磨圆，带状面边缘不会出现锯齿缺口 */
function chaikin(p, times = 1) {
  let cur = p;
  for (let k = 0; k < times; k++) {
    const out = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

/**
 * 把中心线加宽成球面带状面。
 * halfDeg 是半宽（度，按球面弧长算），高纬不会因为经线收敛而变窄。
 */
function ribbonPolygon(path, halfDeg) {
  const pts = unwrapPath(path);
  const half = halfDeg * D2R;
  // 经度必须连续：跨日界的洋流（北太平洋暖流、西风漂流）如果左右岸各自回到 ±180，
  // 三角化时会出现跨越 360° 的长边，细分后直接炸成几十万三角形。
  const seq = (lon, lat, prev) => {
    let l = lon;
    if (prev != null) {
      while (l - prev > 180) l -= 360;
      while (l - prev < -180) l += 360;
    }
    return l;
  };
  const left = [], right = [];
  let prevL = null, prevR = null;
  for (let i = 0; i < pts.length; i++) {
    const [lon, lat] = pts[i];
    const p = unit(lon, lat);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let t = norm(add(unit(b[0], b[1]), unit(a[0], a[1]), -1));
    if (!Number.isFinite(t[0])) t = [0, 0, 1];
    let side = cross(p, t);
    if (Math.hypot(...side) < 1e-9) continue;
    side = norm(side);
    // 在球面上沿 side 走 half 弧度，再拉回单位球
    const lPt = ununit(norm(add(p, side, Math.sin(half))));
    const rPt = ununit(norm(add(p, side, -Math.sin(half))));
    prevL = seq(lPt[0], lPt[1], prevL);
    prevR = seq(rPt[0], rPt[1], prevR);
    left.push([round2(prevL), round2(lPt[1])]);
    right.push([round2(prevR), round2(rPt[1])]);
  }
  // 右岸反向接回起点时，以左岸末点为参考重新展开
  const tail = [];
  let prev = prevL;
  for (let i = right.length - 1; i >= 0; i--) {
    prev = seq(right[i][0], right[i][1], prev);
    tail.push([round2(prev), right[i][1]]);
  }
  // 两端加半圆帽：平切的端头像被剪断的胶带，圆头才像一条「水带」
  const capArc = (endIdx) => {
    const [lon, lat] = pts[endIdx];
    const p = unit(lon, lat);
    const a = pts[Math.max(0, endIdx - 1)], b = pts[Math.min(pts.length - 1, endIdx + 1)];
    let t = norm(add(unit(b[0], b[1]), unit(a[0], a[1]), -1));
    if (!Number.isFinite(t[0])) t = [0, 0, 1];
    let side = norm(cross(p, t));
    if (endIdx === 0) t = [-t[0], -t[1], -t[2]];
    const arr = [];
    for (let i = 1; i < 7; i++) {
      const ang = Math.PI * i / 7;
      // 半圆方向：从 +side 扫到 -side，同时向端外凸出
      const d = [
        side[0] * Math.cos(ang) + t[0] * Math.sin(ang),
        side[1] * Math.cos(ang) + t[1] * Math.sin(ang),
        side[2] * Math.cos(ang) + t[2] * Math.sin(ang)
      ];
      arr.push(ununit(norm(add(p, norm(d), Math.sin(half)))));
    }
    return arr;
  };
  const head = capArc(0).reverse();     // 起点帽：从右岸回到左岸
  const endCap = capArc(pts.length - 1); // 终点帽：从左岸转到右岸
  const raw = head.concat(left, endCap, tail);
  const ring = [];
  let ringPrev = null;
  for (const [lon, lat] of raw) {
    ringPrev = seq(lon, lat, ringPrev);
    ring.push([round2(ringPrev), round2(lat)]);
  }
  if (ring.length >= 4) ring.push(ring[0].slice());
  return [ring];
}

// ── 山脉 ────────────────────────────────────────────────────────────────
// rank ≤ 2 是 Natural Earth 标注的 29 条主要山脉；再补 6 条教学常见的中/东部山脉。
const MOUNTAIN_EXTRA = new Set(['喀尔巴阡山脉', '斯堪的纳维亚山脉', '德拉肯斯堡山脉', '比利牛斯山', '祁连山', '南岭']);
// 环极分布的山脉（绕南极一圈）做成一块拼片就是半个地球，且极点处三角化不稳，不单列
const MOUNTAIN_SKIP = new Set(['横贯南极山脉', '毛德皇后山脉', '彭萨科拉山脉']);

const MT_TEXT = {
  横贯南极山脉: ['横贯南极洲，从罗斯海伸到威德尔海，是南极大陆的脊梁。', '全长约 3,500 km，最高峰文森峰 4,892 m，是南极最高点。'],
  安第斯山脉: ['沿南美洲西缘南北纵贯，是世界上最长的陆上山脉。', '长约 7,000 km，最高峰阿空加瓜山 6,961 m，为亚洲之外最高峰。'],
  落基山脉: ['北美洲的脊梁，从阿拉斯加一路南下到新墨西哥。', '长约 4,800 km，黄石、大分水岭都在这条山系上。'],
  阿巴拉契亚山脉: ['北美洲东部的古生代褶皱山，南北走向。', '长约 2,400 km，因长期侵蚀山势低缓，是「老年期山地」的典型。'],
  布鲁克斯山脉: ['阿拉斯加北坡的东西向山脉，紧贴北冰洋岸。', '是北极圈内的重要气候屏障，把北冰洋的冷空气挡在北坡。'],
  毛德皇后山脉: ['南极洲内陆的巨大山脉，大部分被冰盖掩埋。', '只有峰顶露出冰面，是研究南极冰下地形的关键地区。'],
  大分水岭: ['澳大利亚东部沿海，南北纵贯。', '长约 3,500 km，是太平洋流域与印度洋流域的分水岭。'],
  阿特拉斯山脉: ['非洲西北部，东西走向，横贯摩洛哥、阿尔及利亚。', '挡住撒哈拉沙漠的北扩，北坡冬雨充沛，南坡干旱。'],
  阿尔泰山脉: ['亚洲中部，西北—东南走向，跨中国、蒙古、俄罗斯、哈萨克斯坦。', '最高峰友谊峰 4,374 m，是额尔齐斯河的发源地。'],
  埃塞俄比亚高原: ['东非高原的主体，平均海拔 2,000–3,000 m，被称「非洲屋脊」。', '东非大裂谷从高原中部穿过，是尼罗河青尼罗河的发源地。'],
  天山山脉: ['横贯中亚，东西长约 2,500 km，把新疆分成南北两半。', '托木尔峰 7,439 m，是中国境内天山最高峰，冰川资源丰富。'],
  喜马拉雅山脉: ['亚洲南部，弧形东西走向，是地球上最高的山脉。', '长约 2,450 km，珠穆朗玛峰 8,848.86 m，为世界最高峰。'],
  大兴安岭: ['中国东北，南北走向，是内蒙古高原与东北平原的分界。', '也是中国季风区与非季风区、内流区与外流区的重要界线。'],
  乌拉尔山脉: ['欧亚两洲的传统分界，南北长约 2,500 km。', '山势低缓古老，最高峰 1,895 m，矿产丰富。'],
  外兴安岭: ['俄罗斯远东，东西走向，黑龙江流域与勒拿河流域的分水岭。', '山势不高，但纬度高，永久冻土广布。'],
  昆仑山脉: ['亚洲最长山脉之一，东西横贯青藏高原北缘。', '长约 2,500 km，与秦岭—淮河一样是中国重要的地理分界带。'],
  海岸山脉: ['北美洲太平洋沿岸，从阿拉斯加延伸到加利福尼亚。', '多峡湾、冰川与温带雨林，是北美降水最多的地区之一。'],
  安南山脉: ['中南半岛的脊梁，西北—东南走向。', '长约 1,100 km，是湄公河与南海沿岸水系的分水岭。'],
  兴都库什山脉: ['亚洲中部，阿富汗与巴基斯坦之间，西南—东北走向。', '长约 800 km，山口历来是南北交通要道。'],
  扎格罗斯山脉: ['伊朗高原西南缘，西北—东南走向。', '长约 1,500 km，是波斯湾油田的形成背景（褶皱背斜储油）。'],
  彭萨科拉山脉: ['南极洲横贯南极山脉的一段，位于毛德皇后地。', '南极内陆考察的重要参考地形。'],
  阿尔卑斯山: ['欧洲中南部，弧形东西走向，是欧洲最高山系。', '长约 1,200 km，勃朗峰 4,808 m，是莱茵河、多瑙河、波河的发源地。'],
  埃尔斯沃思山脉: ['南极洲最高山脉，位于南极半岛根部。', '文森峰 4,892 m 就在这条山脉上，是南极登山的目标。'],
  阿拉斯加山脉: ['阿拉斯加中南部，东西走向，与太平洋岸平行。', '迪纳利山 6,190 m，是北美洲最高峰。'],
  高加索山脉: ['黑海与里海之间，西北—东南走向，是欧洲最高山系之一。', '厄尔布鲁士峰 5,642 m，是欧洲最高峰（按主脊线划界）。'],
  喀斯喀特山脉: ['北美洲西岸的火山弧，从加拿大延伸到加州北部。', '雷尼尔山、圣海伦斯火山都在这里，是环太平洋火山带的一段。'],
  喀喇昆仑山脉: ['亚洲中部的高大山系，与喜马拉雅平行。', 'K2 海拔 8,611 m，是世界第二高峰，冰川密度极高。'],
  帕米尔高原: ['亚洲中部，多条巨大山脉在此交汇，被称「亚洲屋脊」。', '平均海拔 4,000 m 以上，是古丝绸之路的必经之地。'],
  西瓦利克山脉: ['喜马拉雅山南麓的低缓前山，海拔约 900 m。', '由喜马拉雅冲刷下来的碎屑堆积而成，是「前山带」的典型。'],
  喀尔巴阡山脉: ['中东欧，呈弧形走向，环绕匈牙利平原。', '长约 1,500 km，山势不高，多温泉与盐矿。'],
  斯堪的纳维亚山脉: ['北欧斯堪的纳维亚半岛，南北纵贯。', '西坡陡峭直插峡湾，东坡平缓，是冰川侵蚀地貌的教科书地区。'],
  德拉肯斯堡山脉: ['非洲南部，沿莱索托东缘呈弧形崖壁。', '玄武岩层构成 3,000 m 以上的高原边缘，崖壁落差上千米。'],
  比利牛斯山: ['欧洲西南部，东西走向，是伊比利亚半岛与欧洲大陆之间的天然屏障。', '长约 430 km，最高峰阿内托峰 3,404 m。'],
  祁连山: ['中国青海与甘肃之间，西北—东南走向。', '冰川融水滋养河西走廊，是内陆干旱区重要的水源地。'],
  南岭: ['中国江南地区，东西走向的一系列山脉的总称。', '长江水系与珠江水系的分水岭，也是南亚热带与中亚热带的分界。']
};

function buildMountains() {
  const src = readConst('geodata-mountains.js', 'MOUNTAIN_RANGES')
    .filter((r) => (r.rank <= 2 || MOUNTAIN_EXTRA.has(r.name)) && !MOUNTAIN_SKIP.has(r.name));
  const colors = ['#8f6642', '#9d7048', '#7d5a3c', '#a67a52'];
  const out = [];
  for (const r of src) {
    const polys = (r.polygons || []).filter((p) => p && p[0] && p[0].length >= 3);
    if (!polys.length) continue;
    let area = 0;
    for (const p of polys) area += polyArea(p);
    const bb = bboxOf(polys);
    const [lon, lat] = centroidOf(polys);
    const text = MT_TEXT[r.name] || ['', ''];
    out.push({
      id: '',
      name: r.name,
      en: r.en,
      color: colors[out.length % colors.length],
      center: [round2(lon), round2(lat)],
      span: round2(Math.min(Math.max(bb.lon1 - bb.lon0, bb.lat1 - bb.lat0), 90)),
      inset: 0.999,
      thin: 0.06,
      samples: samplePoints(polys),
      polygons: polys,
      knowledge: {
        area: `范围面约 ${(area / 1e4).toFixed(area > 1e6 ? 0 : 1)} 万 km²`,
        span: spanText(bb),
        terrain: text[0],
        fact: text[1]
      }
    });
  }
  // 面积大的排前面：托盘与关卡列表里先出现「主角」
  out.sort((a, b) => parseFloat(b.knowledge.area.replace(/[^\d.]/g, '')) - parseFloat(a.knowledge.area.replace(/[^\d.]/g, '')));
  out.forEach((m, i) => { m.id = 'MT-' + String(i + 1).padStart(2, '0'); });
  return out;
}

// ── 河流 ────────────────────────────────────────────────────────────────
// Natural Earth 把一条河按河段拆成多个要素、还常用不同名字（长江 = Jinsha + Chang Jiang），
// 所以这里按「别名组」合并。aliases 里任一段都算这条河。
const RIVERS_SEL = {
  长江: { aliases: ['Chang Jiang', 'Jinsha', 'Yangtze'], en: 'Yangtze', terrain: '中国第一大河，发源于唐古拉山各拉丹冬雪峰，自西向东注入东海。', fact: '全长约 6,300 km，世界第三长河；三峡以下江宽水深，是黄金水道。' },
  黄河: { aliases: ['Huang'], en: 'Yellow River', terrain: '发源于巴颜喀拉山，呈「几」字形流经黄土高原，注入渤海。', fact: '全长约 5,464 km，含沙量世界第一，下游河床高出两岸成为「地上河」。' },
  黑龙江: { aliases: ['Heilong Jiang', 'Amur'], en: 'Amur', terrain: '亚洲东北部大河，发源于大兴安岭西侧，向东注入鄂霍次克海。', fact: '全长约 4,440 km，封冻期长，是北半球典型的寒温带大河。' },
  雅鲁藏布江: { aliases: ['Yarlung', 'Brahmaputra'], en: 'Yarlung Tsangpo', terrain: '发源于喜马拉雅山北麓，东流后在南迦巴瓦峰附近形成世界最深的大峡谷。', fact: '全长约 2,057 km，出境后称布拉马普特拉河，注入孟加拉湾。' },
  湄公河: { aliases: ['Mekong', 'Lancang'], en: 'Mekong', terrain: '上游为中国境内的澜沧江，发源于青海，纵贯中南半岛后注入南海。', fact: '全长约 4,350 km，是东南亚最重要的国际河流与渔业水源。' },
  亚马逊河: { aliases: ['Amazonas', 'Ucayali'], en: 'Amazon', terrain: '发源于安第斯山，横贯南美赤道地区，注入大西洋。', fact: '全长约 6,400 km，流量约占全球河流入海总量的五分之一。' },
  巴拉那河: { aliases: ['Paraná'], en: 'Paraná', terrain: '南美洲第二大河，发源于巴西高原，向南汇入拉普拉塔河。', fact: '全长约 4,880 km，中游有著名的伊瓜苏瀑布。' },
  奥里诺科河: { aliases: ['Orinoco'], en: 'Orinoco', terrain: '南美洲北部大河，流经圭亚那高原西缘，注入大西洋。', fact: '全长约 2,140 km，洪水期与亚马逊水系相通。' },
  密西西比河: { aliases: ['Mississippi'], en: 'Mississippi', terrain: '北美洲最长河流，发源于落基山，纵贯中部平原注入墨西哥湾。', fact: '全长约 6,020 km，流域是美国最重要的农业区。' },
  马更些河: { aliases: ['Mackenzie'], en: 'Mackenzie', terrain: '加拿大最长河流，发源于大奴湖，向西北注入北冰洋。', fact: '全长约 4,241 km，流域内多湖泊与永久冻土。' },
  育空河: { aliases: ['Yukon'], en: 'Yukon', terrain: '北美洲西北部大河，发源于加拿大育空地区，向西注入白令海。', fact: '全长约 3,190 km，是北极圈附近重要的航运与鲑鱼通道。' },
  哥伦比亚河: { aliases: ['Columbia'], en: 'Columbia', terrain: '北美洲西岸大河，发源于落基山，注入太平洋。', fact: '全长约 2,000 km，水能资源丰富，干流多大型水坝。' },
  尼罗河: { aliases: ['Nile', 'Victoria Nile', 'Albert Nile', 'White Nile', 'Blue Nile'], en: 'Nile', terrain: '发源于东非高原，向北纵贯撒哈拉，注入地中海。', fact: '全长约 6,650 km，是世界最长河流之一，下游形成广阔的尼罗河三角洲。' },
  刚果河: { aliases: ['Congo'], en: 'Congo', terrain: '发源于东非高原，横贯刚果盆地，注入大西洋。', fact: '全长约 4,700 km，是非洲流量最大的河流，水能蕴藏量世界前列。' },
  尼日尔河: { aliases: ['Niger'], en: 'Niger', terrain: '西非大河，呈弧形流经几内亚、马里、尼日尔，注入几内亚湾。', fact: '全长约 4,200 km，内陆三角洲是西非重要的农牧区。' },
  赞比西河: { aliases: ['Zambezi'], en: 'Zambezi', terrain: '非洲南部大河，发源于赞比亚北部，向东注入印度洋。', fact: '全长约 2,574 km，中游有维多利亚瀑布。' },
  伏尔加河: { aliases: ['Volga'], en: 'Volga', terrain: '欧洲最长河流，发源于瓦尔代丘陵，向南注入里海。', fact: '全长约 3,530 km，是俄罗斯的内河航运主干。' },
  多瑙河: { aliases: ['Danube'], en: 'Danube', terrain: '欧洲第二长河，发源于德国西南部，向东注入黑海。', fact: '全长约 2,850 km，是世界上流经国家最多的河流之一。' },
  鄂毕河: { aliases: ['Ob'], en: 'Ob', terrain: '西伯利亚西部大河，发源于阿尔泰山，向北注入北冰洋。', fact: '全长约 3,650 km，春季融雪形成巨大的泛滥。' },
  叶尼塞河: { aliases: ['Yenisey', 'Verkhniy Yenisey', 'Bol’shoy Yenisey'], en: 'Yenisey', terrain: '西伯利亚中部大河，发源于萨彦岭，向北注入北冰洋。', fact: '全长约 3,487 km，是西伯利亚水量最大的河流。' },
  勒拿河: { aliases: ['Lena'], en: 'Lena', terrain: '西伯利亚东部大河，发源于贝加尔湖以西，向北注入北冰洋。', fact: '全长约 4,400 km，下游形成巨大的三角洲。' },
  印度河: { aliases: ['Indus'], en: 'Indus', terrain: '发源于青藏高原冈底斯山，向西北流经克什米尔，注入阿拉伯海。', fact: '全长约 3,180 km，是南亚干旱区最重要的灌溉水源。' },
  恒河: { aliases: ['Ganges'], en: 'Ganges', terrain: '发源于喜马拉雅山南麓，向东南流经印度北部平原，注入孟加拉湾。', fact: '全长约 2,525 km，与布拉马普特拉河共同形成世界最大的三角洲。' },
  墨累河: { aliases: ['Murray'], en: 'Murray', terrain: '澳大利亚最长河流，发源于大分水岭西侧，注入南大洋。', fact: '全长约 2,508 km，是澳大利亚最重要的灌溉水源。' }
};

const normName = (s) => s.replace(/\s+/g, ' ').trim();

function buildRivers() {
  const src = readConst('geodata-rivers.js', 'RIVERS');
  const out = [];
  for (const [zh, meta] of Object.entries(RIVERS_SEL)) {
    const want = new Set(meta.aliases.map(normName));
    // 只取「整名匹配」：Lena 不会误收 Magdalena，Ob 也不会误收 Kobuk
    const segs = src.filter((r) => want.has(normName(r.name)));
    if (!segs.length) continue;
    const polys = [];
    let lenKm = 0;
    for (const seg of segs) {
      const p = unwrapPath(seg.path);
      for (let k = 1; k < p.length; k++) {
        const [lo0, la0] = p[k - 1], [lo1, la1] = p[k];
        const dLat = (la1 - la0) * D2R;
        const dLon = (lo1 - lo0) * D2R * Math.cos((la0 + la1) / 2 * D2R);
        lenKm += Math.hypot(dLat, dLon) * R_EARTH;
      }
      // 半宽 0.55°：真实河宽在地图上不到 1 px，做成拼片必须夸张到能抓
      const poly = ribbonPolygon(p, 0.5);
      if (poly[0].length >= 5) polys.push(poly);
    }
    if (!polys.length) continue;
    const bb = bboxOf(polys);
    // 取最长的一段的中点作为「这条河」的代表位置（同名河被数据切成多段）
    const longest = segs.slice().sort((a, b) => b.path.length - a.path.length)[0];
    const mid = longest.path[Math.floor(longest.path.length / 2)];
    out.push({
      id: '',
      name: zh,
      en: meta.en,
      color: '#63c4e6',
      center: [round2(mid[0]), round2(mid[1])],
      // 细长片：span 收窄一点，托盘里才会放大成能抓住的尺寸
      span: round2(Math.min(Math.max(Math.max(bb.lon1 - bb.lon0, bb.lat1 - bb.lat0) * 0.4, 6), 14)),
      inset: 0.9995,
      step: 4,
      thin: 0.045,
      plain: true,
      lengthKm: Math.round(lenKm),
      samples: samplePoints(polys),
      polygons: polys,
      knowledge: {
        area: `河道总长（数据）约 ${Math.round(lenKm / 10) * 10} km`,
        span: spanText(bb),
        terrain: meta.terrain,
        fact: meta.fact
      }
    });
  }
  out.sort((a, b) => b.lengthKm - a.lengthKm);
  out.forEach((m, i) => { m.id = 'RV-' + String(i + 1).padStart(2, '0'); });
  return out;
}

// ── 洋流 ────────────────────────────────────────────────────────────────
// 只取「年平均态」：季风洋流、索马里沿岸流各留冬季一片，夏季反向写进说明，
// 免得同一海域两片叠在一起互相压住。
const CURRENT_EN = {
  '北赤道暖流': 'North Equatorial Current',
  '黑潮（日本暖流）': 'Kuroshio',
  '北太平洋暖流': 'North Pacific Current',
  '阿拉斯加暖流': 'Alaska Current',
  '加利福尼亚寒流': 'California Current',
  '赤道逆流': 'Equatorial Counter Current',
  '南赤道暖流': 'South Equatorial Current',
  '东澳大利亚暖流': 'East Australian Current',
  '秘鲁寒流': 'Peru Current',
  '西风漂流': 'West Wind Drift',
  '墨西哥湾暖流': 'Gulf Stream',
  '北大西洋暖流': 'North Atlantic Drift',
  '挪威暖流': 'Norwegian Current',
  '加那利寒流': 'Canary Current',
  '拉布拉多寒流': 'Labrador Current',
  '东格陵兰寒流': 'East Greenland Current',
  '巴西暖流': 'Brazil Current',
  '本格拉寒流': 'Benguela Current',
  '厄加勒斯暖流': 'Agulhas Current',
  '西澳大利亚寒流': 'West Australian Current',
  '季风洋流（冬 · 西流）': 'Monsoon Current',
  '索马里沿岸流（冬 · 南流）': 'Somali Current'
};
// 同名洋流分布在不同大洋，拼片名必须带海域，否则训练题会歧义
const CURRENT_OCEAN = {
  '北赤道暖流': [['（太平洋）', 'Pacific'], ['（大西洋）', 'Atlantic']],
  '南赤道暖流': [['（太平洋）', 'Pacific'], ['（大西洋）', 'Atlantic'], ['（印度洋）', 'Indian']]
};
const CURRENT_RENAME = {
  '季风洋流（冬 · 西流）': ['季风洋流（北印度洋）', '夏季西南季风下整条环流反向东流，是季风环流最直接的证据。'],
  '索马里沿岸流（冬 · 南流）': ['索马里沿岸流', '夏季同一岸线变成离岸流，深层冷水上涌形成索马里寒流。']
};

function buildCurrents() {
  const src = readConst('geodata-currents.js', 'CURRENTS');
  const out = [];
  const used = {};
  let i = 0;
  for (const c of src) {
    if (c.months && c.months.join(',') === '7') continue;   // 夏季态：只作说明，不单独成片
    const rename = CURRENT_RENAME[c.name];
    let name = rename ? rename[0] : c.name;
    let suffix = '', enSuffix = '';
    if (CURRENT_OCEAN[c.name]) {
      const k = used[c.name] = (used[c.name] || 0) + 1;
      const pair = CURRENT_OCEAN[c.name][k - 1] || ['', ''];
      suffix = pair[0];
      enSuffix = pair[1] ? ' (' + pair[1] + ')' : '';
      name += suffix;
    }
    const path = chaikin(densify(unwrapPath(c.path), 1.2), 1);
    const halfDeg = Math.max(0.6, (c.width || 0.075) / 2 / 2.6 * 180 / Math.PI * 1.15);
    const poly = ribbonPolygon(path, halfDeg);
    if (poly[0].length < 5) continue;
    const bb = bboxOf([poly]);
    const mid = path[Math.floor(path.length / 2)];
    const inKm = Math.round(halfDeg * 2 * 111);
    out.push({
      id: 'OC-' + String(++i).padStart(2, '0'),
      name,
      en: (CURRENT_EN[c.name] || 'Ocean Current') + enSuffix,
      color: c.kind === 'warm' ? '#ee6a45' : '#49a9e6',
      kind: c.kind,
      center: [round2(mid[0]), round2(mid[1])],
      span: round2(Math.min(Math.max(Math.max(bb.lon1 - bb.lon0, bb.lat1 - bb.lat0) * 0.4, 8), 16)),
      inset: 0.9995,
      step: 999,
      thin: 0.045,
      plain: true,
      samples: samplePoints([poly]),
      polygons: [poly],
      knowledge: {
        area: `带宽约 ${inKm} km（示意）`,
        span: spanText(bb),
        terrain: c.kind === 'warm'
          ? '暖流：自低纬流向高纬，水温高于流经海面'
          : '寒流：自高纬流向低纬，水温低于流经海面',
        fact: (rename ? rename[1] + ' ' : '') + (c.effect || '')
      }
    });
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════
//  v2.2：海洋 / 气压带·风带 / 山峰·海沟 / 国家点位片
//  前三套是「面 / 线」转片，这四套是「面溶解」「纬向环带」「点转圆片」。
// ══════════════════════════════════════════════════════════════════════

// ── 通用几何：闭合环 → 抽稀 → 溶解 → 嵌套 ────────────────────────────

/** GeoJSON 的环首尾点重复，先去掉，后面按「隐式闭合」处理 */
function openRing(ring) {
  const r = ring.map((p) => [p[0], p[1]]);
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  return r;
}

/** Douglas–Peucker：公差单位是度 */
function dp(pts, tol) {
  if (pts.length < 4) return pts;
  const n = pts.length;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], ay = pts[a][1];
    const dx = pts[b][0] - ax, dy = pts[b][1] - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let best = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + pts[b][0] * ay - pts[b][1] * ax) / len;
      if (d > best) { best = d; idx = i; }
    }
    if (best > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : pts;
}

const planarArea = (r) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};

/** Sutherland–Hodgman：把闭合环裁到一条经线的一侧（keepGreater=true 保留 lon≥value） */
function clipHalfPlane(ring, value, keepGreater) {
  const out = [];
  const inside = (p) => (keepGreater ? p[0] >= value : p[0] <= value);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push([a[0], a[1]]);
    if (ia !== ib) {
      const t = (value - a[0]) / (b[0] - a[0] || 1e-12);
      out.push([value, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** 以 180° 为窗宽把环裁开，每块再折回 [-180,180]。
 *  窗宽取 180 而不是 360：三维里三角化的跨度越大，球面上那片越平，
 *  半球以内还能看成曲面，整圈就会拉成平板。 */
function clipToWindow(ring, lo, hi) {
  let c = clipHalfPlane(ring, lo, true);
  if (c.length < 3) return null;
  c = clipHalfPlane(c, hi, false);
  if (c.length < 3 || planarArea(c) < 1e-9) return null;
  return c;
}

/** 绕极盖面：NE 用「沿日界线冲上极点再折返」的零宽刺来闭合北冰洋，
 *  这条刺交给三角化就是一堆退化的零面积三角形，越往极点越容易出黑斑。
 *  这里去掉刺，改沿极点补一条真正的顶边（经度从东端走到西端），
 *  环就变成「海岸线 + 极点顶边」的干净盖面。 */
function closeOverPole(r) {
  const hasPole = r.some((p) => Math.abs(p[1]) > 89.99);
  if (!hasPole) return null;
  const top = r.find((p) => Math.abs(p[1]) > 89.99)[1] > 0 ? 90 : -90;
  const body = [];
  for (const p of r) {
    if (Math.abs(p[1]) > 89.99) continue;
    const q = body[body.length - 1];
    if (!q || Math.abs(p[0] - q[0]) > 1e-4 || Math.abs(p[1] - q[1]) > 1e-4) body.push([p[0], p[1]]);
  }
  if (body.length < 3) return null;
  body.push([body[body.length - 1][0], top], [body[0][0], top]);
  return body;
}

/** 把任意环规整成「每块都落在 [-180,180] 的一批环」。
 *
 *  北冰洋是绕极盖面、南大洋是环带，它们的环展开后跨度正好 360°：
 *  首尾看似同一条经线，坐标却差一整圈。原样交给三角化，那条「闭合边」
 *  就成了一条横贯全图的长边——平面展开图里表现为整块蓝色矩形，
 *  三维里则从极区拉出一大片盖住陆地。
 *
 *  顺序：经度归一到 0–360 → 连续展开 → （盖面）沿极点封顶 → 按 180° 窗裁块。 */
function splitRingToWorld(ring) {
  let r = unwrapPath(ring.map((p) => [((p[0] % 360) + 360) % 360, p[1]]));
  const cap = closeOverPole(r);
  if (cap) r = cap;
  let minx = Infinity, maxx = -Infinity;
  for (const p of r) {
    if (p[0] < minx) minx = p[0];
    if (p[0] > maxx) maxx = p[0];
  }
  const out = [];
  const start = Math.floor(minx / 180) * 180;
  for (let lo = start; lo < maxx; lo += 180) {
    const piece = clipToWindow(r, lo, lo + 180);
    if (!piece) continue;
    // 整块平移回 [-180,180]：逐点取模会把 +180 折成 -180，
    // 两个相邻窗口的块就会互相套成「洞」，这里按窗口统一平移。
    const shift = -360 * Math.round(lo / 360);
    out.push(piece.map((p) => [p[0] + shift, p[1]]));
  }
  return out;
}

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 按包含层数把环分成 outer / hole，返回 polygons = [[外环, 洞...], ...] */
function nestPolys(rings) {
  const info = rings.map((r) => ({ r, a: planarArea(r), depth: 0 })).sort((x, y) => y.a - x.a);
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      if (pointInRing(info[j].r[0], info[i].r)) info[j].depth++;
    }
  }
  const polys = [];
  const owners = [];
  for (const it of info) {
    if (it.depth % 2 === 0) {
      polys.push([it.r]);
      owners.push(it);
    }
  }
  for (const it of info) {
    if (it.depth % 2 === 0) continue;
    // 挂到包含它、面积最小的那个外环上
    let best = -1;
    for (let i = 0; i < owners.length; i++) {
      if (pointInRing(it.r[0], owners[i].r) && (best < 0 || owners[i].a < owners[best].a)) best = i;
    }
    if (best >= 0) polys[best].push(it.r);
  }
  return polys;
}

/** 球面多边形面积（Chamberlain–Duquette 公式），洞按环序相减。
 *  每条边的经差先归一到 ±180：环的闭合边若跨日界线，不归一就会多算一圈。
 *  绕极的环（净经差非 0）这个公式不成立，直接跳过——五大洋就是这种情况，
 *  它们的面积改用教材通行口径。 */
function sphericalAreaKm2(polys) {
  let total = 0;
  for (const poly of polys) {
    for (let h = 0; h < poly.length; h++) {
      const ring = poly[h];
      let sum = 0, wind = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        let dl = b[0] - a[0];
        while (dl > 180) dl -= 360;
        while (dl < -180) dl += 360;
        wind += dl;
        sum += dl * D2R * (2 + Math.sin(a[1] * D2R) + Math.sin(b[1] * D2R));
      }
      if (Math.abs(wind) > 90) continue;
      const km2 = Math.abs(sum) * R_EARTH * R_EARTH / 2;
      total += h === 0 ? km2 : -km2;
    }
  }
  return total;
}

const fmtKm2 = (km2) => {
  const wan = Math.round(km2 / 1e4);
  return `约 ${String(wan).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 万 km²`;
};

/** 以 (lon,lat) 为圆心、radiusDeg 为半径的球面小圆，转成环 */
function discRing(lon, lat, radiusDeg, n = 26) {
  const cosLat = Math.max(0.12, Math.cos(lat * D2R));
  const ring = [];
  for (let i = 0; i < n; i++) {
    const b = (i / n) * Math.PI * 2;
    const dLat = radiusDeg * Math.sin(b);
    const dLon = (radiusDeg * Math.cos(b)) / cosLat;
    ring.push([round2(lon + dLon), round2(Math.max(-89.4, Math.min(89.4, lat + dLat)))]);
  }
  return ring;
}

// ── 海洋：NE 1:10m 海域面，同名（南北太平洋 / 南北大西洋）溶解成一片 ──

const OCEAN_NAME = {
  太平洋: ['太平洋', 'Pacific Ocean'],
  大西洋: ['大西洋', 'Atlantic Ocean'],
  印度洋: ['印度洋', 'Indian Ocean'],
  北冰洋: ['北冰洋', 'Arctic Ocean'],
  南冰洋: ['南大洋', 'Southern Ocean']
};

// NE 的 name_zh 混了繁体，个别译名与教材不同
const SEA_ZH_FIX = {
  巴芬灣: '巴芬湾', 孟加拉灣: '孟加拉湾', 哈德森湾: '哈德逊湾', 裏海: '里海',
  比斯開灣: '比斯开湾', 巴倫支海: '巴伦支海', 愛爾蘭海: '爱尔兰海',
  波的尼亞灣: '波尼亚湾', 阿曼灣: '阿曼湾', 西里伯斯海: '苏拉威西海'
};

// 海峡 / 水道太细，做成拼片几乎看不见；几个与南大洋重复的边缘海也去掉
const SEA_SKIP = new Set([
  'Bahía de Campeche', 'Bellingshausen Sea', 'Scotia Sea', 'Amundsen Sea',
  'Davis Strait', 'Drake Passage', 'Luzon Strait', 'Mozambique Channel',
  'Hudson Strait', 'English Channel'
]);

const SEA_FACT = {
  地中海: '介于欧、亚、非三洲之间，面积约 250 万 km²，是世界最大的陆间海；直布罗陀海峡是它与大西洋的唯一通道。',
  加勒比海: '大西洋西部、中美洲以东，面积约 275 万 km²，是沿岸多国通往大西洋的航道要冲。',
  南海: '西太平洋边缘海，面积约 350 万 km²，是连接太平洋与印度洋的重要通道。',
  红海: '印度洋西北的狭长海盆，因沿岸红色藻类得名；是苏伊士运河通航后欧亚最短航线的必经水域。',
  波斯湾: '印度洋西北的海湾，是世界石油储量与产量最集中的海域，出口几乎全部经霍尔木兹海峡。',
  黑海: '介于东南欧与小亚细亚之间，深层水缺氧；经土耳其海峡与地中海相连。',
  波罗的海: '北欧的内海，盐度极低（约 7‰），冬季北部结冰，是世界盐度最低的海域之一。',
  北海: '大西洋东北的边缘海，位于欧洲大陆与不列颠岛之间，是世界著名的渔场与油气产区。',
  白令海: '太平洋最北的边缘海，被阿留申群岛与阿拉斯加环抱；冬季大部结冰。',
  日本海: '西太平洋边缘海，被日本列岛、库页岛与亚洲大陆围合，深海盆水深超过 3,000 m。',
  鄂霍次克海: '西北太平洋边缘海，冬季海冰南界可到 45°N 附近，是世界纬度最低的结冰海域之一。',
  珊瑚海: '南太平洋边缘海，面积约 480 万 km²，是世界最大的海；大堡礁位于其西缘。',
  塔斯曼海: '澳大利亚与新西兰之间，是南半球西风带经过的海域，风浪大。',
  孟加拉湾: '印度洋东北部，是世界最大的海湾；受西南季风影响，夏季表层环流逆转。',
  阿拉伯海: '印度洋西北部，北印度洋季风环流的核心海域，夏季索马里沿岸出现强上升流。',
  威德尔海: '南大洋的一部分，深入南极洲海岸，是世界最冷、最清的海域之一，底层水的重要生成地。',
  罗斯海: '南大洋的一部分，南界为罗斯冰架，是南极洲附近最深入的海域。',
  菲律宾海: '西太平洋的深海盆，菲律宾海沟与马里亚纳海沟都在其西缘，深度超过 1 万 m。',
  墨西哥湾: '大西洋西部、北美南岸，受墨西哥湾暖流影响，是世界最大的暖流发源地。',
  哈德逊湾: '加拿大东北部的巨大海湾，面积约 120 万 km²，冬季几乎全部结冰，盐度低。',
  拉布拉多海: '北大西洋西北部，是北大西洋深层水形成的关键海域之一。',
  阿拉斯加湾: '北太平洋东北部，受阿拉斯加暖流影响，沿岸冬季不冻。',
  波弗特海: '北冰洋的一部分，位于阿拉斯加与加拿大北岸外，夏季海冰覆盖度变化最剧烈的海域之一。'
};

// 五大洋的面积用教材通行口径。按 NE 范围面算出来的是「开阔洋面」，
// 不含相邻边缘海（太平洋只算出约 1.39 亿 km²），与教材数差一成多，
// 卡片上给读者看的口径必须和教科书一致。
const OCEAN_AREA = {
  太平洋: 16525, 大西洋: 9166, 印度洋: 7056, 北冰洋: 1406, 南大洋: 2033
};

function buildSeas() {
  const src = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'ne_10m_marine.geojson'), 'utf8'));
  const out = [];
  let seq = 0;

  // 1) 五大洋：按中文名把南北两半收进同一片（太平洋 / 大西洋各由两块拼成）
  //    NE 的南北两半分界在赤道、又在日界线上断开，顶点对不齐，共享边抵消不掉，
  //    所以不做溶解，直接「一片多环」；这类片把侧壁厚度设为 0，接缝处不留台阶。
  const oceanGroups = new Map();
  for (const f of src.features) {
    const p = f.properties;
    if (p.featurecla !== 'ocean') continue;
    const key = OCEAN_NAME[p.name_zh];
    if (!key) continue;
    if (!oceanGroups.has(key[0])) oceanGroups.set(key[0], { en: key[1], rings: [] });
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      for (const ring of poly) oceanGroups.get(key[0]).rings.push(openRing(ring));
    }
  }
  for (const [name, g] of oceanGroups) {
    // 经度统一到 0–360 并连续展开，再按 180° 窗裁进 [-180,180]：
    // 跨日界线的片会自然分成左右两块，绕极的片（北冰洋、南大洋）也会被切开，
    // 这样三维和平面展开用的是同一套合法经纬度，不会出现横贯全图的假边。
    const rings = [];
    for (const r of g.rings) for (const part of splitRingToWorld(r)) rings.push(dp(part, 0.08));
    const polys = nestPolys(rings).filter((p) => p[0].length >= 3);
    if (!polys.length) continue;
    const bb = bboxOf(polys), [lon, lat] = centroidOf(polys);
    out.push({
      id: 'SE-' + String(++seq).padStart(2, '0'),
      name,
      en: g.en,
      color: '#3f6fbe',
      center: [round2(lon), round2(lat)],
      span: round2(Math.min(Math.max(bb.lon1 - bb.lon0, bb.lat1 - bb.lat0), 90)),
      inset: 0.999,
      step: 2.5,
      // 0 = 不出侧壁：太平洋 / 大西洋是南北两半分块拼成的，赤道和日界线
      // 上会有两条重合的边，留侧壁就会显出一道白线，像球面上被划了一刀
      thin: 0,
      // 微抬升：底图海洋球在 2.565，色片贴地形算出的半径可能落到它下面，
      // 抬 0.5% 球半径（约 30 km，肉眼无感）保证色片始终在底图之上，不出 z 闪烁。
      lift: 0.013,
      plain: true,
      flat: true,
      samples: samplePoints(polys),
      polygons: polys,
      knowledge: {
        area: `约 ${OCEAN_AREA[name].toLocaleString('en-US')} 万 km²（含边缘海）`,
        span: spanText(bb),
        terrain: '大洋：世界大洋的五大分区，界线按习惯划分，不是自然边界',
        fact: SEA_FACT[name] || ''
      }
    });
  }

  // 2) 主要边缘海：scalerank ≤ 2，去掉海峡 / 水道
  const seas = src.features.filter((f) => {
    const p = f.properties;
    if (p.featurecla !== 'sea' && p.featurecla !== 'bay' && p.featurecla !== 'gulf') return false;
    if (p.scalerank > 2) return false;
    return !SEA_SKIP.has(p.name);
  });
  for (const f of seas) {
    const p = f.properties;
    const g = f.geometry;
    const rawPolys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const rings = [];
    for (const poly of rawPolys) for (const ring of poly) {
      for (const part of splitRingToWorld(openRing(ring))) rings.push(dp(part, 0.06));
    }
    const polys = nestPolys(rings).filter((q) => q[0].length >= 3);
    if (!polys.length) continue;
    const bb = bboxOf(polys), [lon, lat] = centroidOf(polys);
    const km2 = sphericalAreaKm2(polys);
    const name = SEA_ZH_FIX[p.name_zh] || p.name_zh;
    const isBay = p.featurecla === 'bay' || p.featurecla === 'gulf';
    out.push({
      id: 'SE-' + String(++seq).padStart(2, '0'),
      name,
      en: p.name,
      color: isBay ? '#42b09a' : '#3f9dc9',
      center: [round2(lon), round2(lat)],
      span: round2(Math.min(Math.max(bb.lon1 - bb.lon0, bb.lat1 - bb.lat0), 60)),
      inset: 0.999,
      step: 2.5,
      // 0 = 不出侧壁：海域是贴着海面的色片，加厚度会在海岸线处露出一圈暗带，
      // 看着像海岸被挖开一条沟；和五大洋用同一套处理。
      thin: 0,
      // 抬升略低于五大洋，避免和相邻色片出现台阶
      lift: 0.011,
      plain: true,
      flat: true,
      samples: samplePoints(polys),
      polygons: polys,
      knowledge: {
        area: `${fmtKm2(km2)}（范围面估算）`,
        span: spanText(bb),
        terrain: isBay ? '海湾：三面被陆地环绕、一面通海的水域' : '边缘海：位于大陆与大洋之间、被岛链部分隔开的水域',
        fact: SEA_FACT[name] || ''
      }
    });
  }
  return out;
}

// ── 气压带·风带：三圈环流切成 13 条整圈纬向环带 ─────────────────────

// 纬度区间与左栏覆盖层同一套教学取值（0–90° 首尾相接，不重叠不留缝）
const BELT_DEFS = [
  { name: '极地高压带（北）', en: 'Polar High (N)', lat0: 78, lat1: 90, type: 'high',
    fact: '极地终年低温，空气冷却下沉堆积成高压；近地面气流向南辐散，构成极地东风的风源。' },
  { name: '极地东风（北）', en: 'Polar Easterlies (N)', lat0: 70, lat1: 78, type: 'wind:polar',
    fact: '极地高压流向副极地低压，受地转偏向力右偏成东北风；与西风相遇处形成极锋。' },
  { name: '副极地低压带（北）', en: 'Subpolar Low (N)', lat0: 55, lat1: 70, type: 'low',
    fact: '西风与极地东风在此辐合上升，形成低压带；冰岛低压、阿留申低压就是它在海洋上的残留。' },
  { name: '盛行西风（北）', en: 'Westerlies (N)', lat0: 40, lat1: 55, type: 'wind:west',
    fact: '副热带高压流向副极地低压，北半球右偏成西南风；它把海洋水汽带向大陆西岸，西欧温带海洋性气候由此形成。' },
  { name: '副热带高压带（北）', en: 'Subtropical High (N)', lat0: 24, lat1: 40, type: 'high',
    fact: '高空大气下沉堆积成高压，空气干燥；世界主要沙漠带（撒哈拉、阿拉伯、北美西南）几乎都在这条带上。' },
  { name: '东北信风（北）', en: 'NE Trade Winds', lat0: 7, lat1: 24, type: 'wind:trade',
    fact: '副热带高压流向赤道低压，北半球右偏成东北风；风向稳定，是帆船时代跨大西洋航行的动力。' },
  { name: '赤道低压带', en: 'Equatorial Low', lat0: -7, lat1: 7, type: 'low',
    fact: '太阳终年直射、空气受热上升，形成全球最强的低压带；全年多对流雨，即赤道多雨带。' },
  { name: '东南信风（南）', en: 'SE Trade Winds', lat0: -24, lat1: -7, type: 'wind:trade',
    fact: '与北半球对称，南半球左偏成东南风；两支信风在赤道附近辐合，形成赤道辐合带。' },
  { name: '副热带高压带（南）', en: 'Subtropical High (S)', lat0: -40, lat1: -24, type: 'high',
    fact: '南半球副热带高压带比北半球完整得多，因为南半球这一纬度带上几乎全是海洋。' },
  { name: '盛行西风（南）', en: 'Westerlies (S)', lat0: -55, lat1: -40, type: 'wind:west',
    fact: '南半球西风带海面辽阔、摩擦力小，风力极强，被称为「咆哮西风带」；西风漂流由此绕南极一圈。' },
  { name: '副极地低压带（南）', en: 'Subpolar Low (S)', lat0: -70, lat1: -55, type: 'low',
    fact: '南半球这一带是连续的海洋，低压带比北半球完整，是南极绕极流与气旋活动频繁的地带。' },
  { name: '极地东风（南）', en: 'Polar Easterlies (S)', lat0: -78, lat1: -70, type: 'wind:polar',
    fact: '南极冰盖强烈辐射冷却形成极地高压，气流向外流出并左偏成东南风，是南极下降风的一部分。' },
  { name: '极地高压带（南）', en: 'Polar High (S)', lat0: -90, lat1: -78, type: 'high',
    fact: '南极大陆是地球上最冷的陆地，冰盖上空形成常年强高压，是全球大气环流的重要冷源。' }
];

const BELT_COLOR = {
  high: '#dd7d4d',
  low: '#4f8fd4',
  'wind:west': '#57b0a4',
  'wind:trade': '#9dc25f',
  'wind:polar': '#8b9ab2'
};

function buildBelts() {
  return BELT_DEFS.map((b, i) => {
    const mid = (b.lat0 + b.lat1) / 2;
    const samples = [];
    for (let k = 0; k < 24; k++) samples.push([round2(k * 15), round2(mid)]);
    const kind = b.type.startsWith('wind') ? '风带' : '气压带';
    return {
      id: 'BL-' + String(i + 1).padStart(2, '0'),
      name: b.name,
      en: b.en,
      color: BELT_COLOR[b.type],
      center: [0, round2(mid)],
      span: 24,
      band: { lat0: b.lat0, lat1: b.lat1 },
      // 环带首尾相接（78° 的上边缘就是下一条的 78° 下边缘），出侧壁会在接缝处
      // 互相顶出一道毛边；纬度带本来就没有厚度，直接压平
      thin: 0,
      plain: true,
      samples,
      knowledge: {
        area: `${Math.abs(b.lat1 - b.lat0)}° 宽的整圈纬向环带`,
        span: `${Math.abs(b.lat0).toFixed(0)}°${b.lat0 >= 0 ? 'N' : 'S'} – ${Math.abs(b.lat1).toFixed(0)}°${b.lat1 >= 0 ? 'N' : 'S'}（整圈）`,
        terrain: kind === '气压带'
          ? (b.type === 'high' ? '高压带：气流下沉辐散' : '低压带：气流上升辐合')
          : '风带：近地面盛行风向，风向按地转偏向力偏转',
        fact: b.fact
      }
    };
  });
}

// ── 山峰·海沟：点要素做成小圆片 ────────────────────────────────────

const PEAK_DEFS = [
  ['珠穆朗玛峰', 'Mount Everest', 86.925, 27.988, 8848.86, '喜马拉雅山脉主峰，位于中国与尼泊尔边界，2020 年中尼联合公布雪面高程 8,848.86 m。'],
  ['乔戈里峰', 'K2', 76.513, 35.881, 8611, '喀喇昆仑山脉主峰，世界第二高峰；山势陡峭、气候恶劣，攀登难度通常认为高于珠峰。'],
  ['干城章嘉峰', 'Kangchenjunga', 88.147, 27.703, 8586, '喜马拉雅山脉东段，世界第三高峰，位于尼泊尔与印度边界。'],
  ['阿空加瓜山', 'Aconcagua', -70.011, -32.653, 6961, '安第斯山脉最高峰，也是南美洲与西半球最高点；由火山岩构成，但并非活火山。'],
  ['钦博拉索山', 'Chimborazo', -78.817, -1.469, 6263, '厄瓜多尔的死火山。因赤道附近地球半径最大，峰顶是地表离地心最远的点。'],
  ['迪纳利山', 'Denali', -151.007, 63.069, 6190, '北美最高峰，位于阿拉斯加；2025 年恢复原名迪纳利（此前称麦金利山）。'],
  ['乞力马扎罗山', 'Kilimanjaro', 37.355, -3.067, 5895, '非洲最高峰，赤道附近的雪峰；顶部冰川近百年持续退缩，是气候变化的地标证据。'],
  ['厄尔布鲁士峰', 'Elbrus', 42.439, 43.355, 5642, '高加索山脉最高峰，通常作为欧洲最高点；是一座休眠火山，顶部有冰川。'],
  ['肯尼亚山', 'Mount Kenya', 37.308, -0.152, 5199, '非洲第二高峰，赤道上的冰川山地，冰川面积近百年大幅缩减。'],
  ['文森峰', 'Vinson Massif', -85.617, -78.525, 4892, '南极洲最高峰，位于埃尔斯沃思山脉；因极寒与偏远，是「七大洲最高峰」中最难到达的一座。'],
  ['查亚峰', 'Puncak Jaya', 137.158, -4.078, 4884, '新几内亚岛最高峰、大洋洲最高点；赤道附近仍有冰川，是热带高山冰川的稀有样本。'],
  ['勃朗峰', 'Mont Blanc', 6.865, 45.832, 4808, '阿尔卑斯山脉最高峰，西欧最高点；冰川与花岗岩峰体是登山运动的发源地。'],
  ['富士山', 'Mount Fuji', 138.727, 35.361, 3776, '日本最高峰，典型的层状活火山；最近一次喷发在 1707 年。'],
  ['科修斯科山', 'Kosciuszko', 148.262, -36.456, 2228, '澳大利亚最高峰，也是各大洲最高峰中最低的一座；山体平缓，冬季可滑雪。']
];

const TRENCH_DEFS = [
  ['马里亚纳海沟', 'Mariana Trench', 142.2, 11.35, -10909, '太平洋西部，挑战者深渊深约 −10,909 m，是地球表面最低点；太平洋板块在此俯冲到菲律宾海板块之下。'],
  ['汤加海沟', 'Tonga Trench', -175.0, -23.0, -10882, '南太平洋，世界第二深海沟；太平洋板块俯冲到印度—澳大利亚板块之下，汤加火山弧与之平行。'],
  ['菲律宾海沟', 'Philippine Trench', 126.5, 10.0, -10540, '西太平洋，深度超过 1 万 m；与马里亚纳海沟同属西太平洋俯冲带体系。'],
  ['日本海沟', 'Japan Trench', 144.0, 38.5, -8412, '日本东侧，2011 年东北地方太平洋近海地震的震源区，引发了大海啸。'],
  ['波多黎各海沟', 'Puerto Rico Trench', -66.5, 19.8, -8376, '大西洋最深的地方；北美板块与加勒比板块的边界。'],
  ['秘鲁—智利海沟', 'Peru–Chile Trench', -72.0, -23.0, -8065, '南美西岸外，纳斯卡板块俯冲到南美板块之下，形成安第斯山脉与沿岸地震带。'],
  ['爪哇海沟', 'Java Trench', 110.0, -10.5, -7290, '印度洋东缘，印度—澳大利亚板块俯冲到巽他板块之下，2004 年印度洋大地震的破裂带在此。'],
  ['死海', 'Dead Sea', 35.5, 31.5, -430, '约旦裂谷中的内陆盐湖，湖面约 −430 m，是陆地表面最低点；盐度约 34%，浮力极大。']
];

function buildPeaks() {
  const out = [];
  PEAK_DEFS.forEach(([name, en, lon, lat, h, fact], i) => {
    const r = 1.15;
    const ring = discRing(lon, lat, r);
    out.push({
      id: 'PK-' + String(i + 1).padStart(2, '0'),
      name, en,
      color: '#d9a05b',
      center: [round2(lon), round2(lat)],
      span: 8,
      inset: 0.999,
      step: 999,
      thin: 0.05,
      plain: true,
      lift: 0.004 + (i % 5) * 0.0015,
      samples: ring.filter((_, k) => k % 3 === 0),
      polygons: [[ring]],
      knowledge: {
        area: `海拔 ${h.toLocaleString('en-US')} m`,
        span: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}，${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
        terrain: '山峰：陆地上的突出高点（海拔为峰顶真高，非地形格网插值）',
        fact
      }
    });
  });
  TRENCH_DEFS.forEach(([name, en, lon, lat, h, fact], i) => {
    const ring = discRing(lon, lat, 1.3);
    out.push({
      id: 'TR-' + String(i + 1).padStart(2, '0'),
      name, en,
      color: '#7d8fd0',
      center: [round2(lon), round2(lat)],
      span: 8,
      inset: 0.999,
      step: 999,
      thin: 0.05,
      plain: true,
      lift: 0.004 + (i % 5) * 0.0015,
      samples: ring.filter((_, k) => k % 3 === 0),
      polygons: [[ring]],
      knowledge: {
        area: name === '死海' ? `湖面 ${h} m` : `最深处 ${h.toLocaleString('en-US')} m`,
        span: `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}，${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`,
        terrain: '海沟：大洋底部的狭长深槽，多分布在板块俯冲带',
        fact
      }
    });
  });
  return out;
}

// ── 国家点位片：195 国，每国一个小圆片，圆心是首都 ─────────────────

const CONT_COLOR = { AF: '#c98d4e', AS: '#c9b45e', EU: '#8f9ad6', NA: '#7fbf9a', SA: '#d08a8a', OC: '#6fb8c8' };
const CONT_ZH = { AF: '非洲', AS: '亚洲', EU: '欧洲', NA: '北美洲', SA: '南美洲', OC: '大洋洲' };

function buildCountries() {
  const src = readConst('geodata-countries.js', 'COUNTRIES');
  return src.map((c, i) => {
    // 片半径按标注等级分档：v2.3 整体放大约三成——195 片铺在球面上时
    // 原来的 0.75°–1.05° 只有两三个像素，点都点不准。放大后仍远小于国界范围。
    const r = c.r <= 2 ? 1.35 : c.r === 3 ? 1.18 : 1.0;
    const ring = discRing(c.x, c.y, r);
    const cap = c.capz || c.cap;
    return {
      id: 'CP-' + c.a,
      name: c.zh,
      en: c.en,
      color: CONT_COLOR[c.c] || '#9aa7b8',
      center: [round2(c.x), round2(c.y)],
      span: 8,
      inset: 0.999,
      step: 999,
      thin: 0.05,
      plain: true,
      // 欧洲小国密集，圆片会叠在一起；按序微抬升避免共面闪烁
      lift: 0.004 + (i % 6) * 0.0013,
      samples: ring.filter((_, k) => k % 3 === 0),
      polygons: [[ring]],
      knowledge: {
        area: `首都 ${cap}`,
        span: `${CONT_ZH[c.c] || ''} · ${Math.abs(c.x).toFixed(1)}°${c.x >= 0 ? 'E' : 'W'} ${Math.abs(c.y).toFixed(1)}°${c.y >= 0 ? 'N' : 'S'}`,
        terrain: '点位片：圆心是首都位置，片的大小按标注等级分档，不代表领土范围，也不表示国界',
        fact: `${c.zh}（${c.en}），首都${cap}，位于${CONT_ZH[c.c] || ''}。`
      }
    };
  });
}

// ── 输出 ────────────────────────────────────────────────────────────────
const mountains = buildMountains();
const rivers = buildRivers();
const currents = buildCurrents();
const seas = buildSeas();
const belts = buildBelts();
const peaks = buildPeaks();
const countries = buildCountries();

const header = [
  '// 专题片数据 —— 自动生成，请勿手改（构建脚本/build_thematic.mjs）',
  '// 山脉：Natural Earth 1:50m 山脉范围面（public domain），{rank<=2} ∪ 6 条教学常见山脉',
  '// 河流：Natural Earth 1:10m 河流中心线（public domain），按球面法向加宽 1.1° 成带状面',
  '// 洋流：教学示意流路（非实测流场），加宽成带状面；季风洋流只保留冬季态',
  '// 海洋：Natural Earth 1:10m 海域面（public domain），同名海域溶解成一片；五大洋 + 主要边缘海',
  '// 气压带·风带：13 条整圈纬向环带（教学取值），band = {lat0, lat1}，由 buildBandPiece() 建几何',
  '// 山峰·海沟：点要素转小圆片，片心即峰顶 / 海沟位置',
  '// 国家点位片：每国一个小圆片，圆心是首都；只表示点位，不含国界与领土轮廓',
  '// 面的结构：polygons = [[外环, 洞...], ...]，环为 [lon, lat]，供 buildMultiPolygonPiece() 使用',
  ''
].join('\n');

const lines = [
  header,
  `export const THEMATIC_MOUNTAINS = ${JSON.stringify(mountains)};\n`,
  `export const THEMATIC_RIVERS = ${JSON.stringify(rivers)};\n`,
  `export const THEMATIC_CURRENTS = ${JSON.stringify(currents)};\n`,
  `export const THEMATIC_SEAS = ${JSON.stringify(seas)};\n`,
  `export const THEMATIC_BELTS = ${JSON.stringify(belts)};\n`,
  `export const THEMATIC_PEAKS = ${JSON.stringify(peaks)};\n`,
  `export const THEMATIC_COUNTRIES = ${JSON.stringify(countries)};\n`
];
const outFile = path.join(HERE, 'geodata-thematic.js');
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');

console.log(
  `山脉 ${mountains.length} 片 · 河流 ${rivers.length} 片 · 洋流 ${currents.length} 片 · ` +
  `海洋 ${seas.length} 片 · 环带 ${belts.length} 片 · 山峰海沟 ${peaks.length} 片 · 国家点位 ${countries.length} 片`
);
console.log(`输出 ${outFile}  ${(fs.statSync(outFile).size / 1024).toFixed(1)} KB`);
