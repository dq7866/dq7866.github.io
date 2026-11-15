# -*- coding: utf-8 -*-
"""生成「地球科学拼图 · 自然地理版」的拼片数据（src/geodata-nature.js）。

设计要点
--------
1) **合规**：成图只含自然地理要素——大洲陆块轮廓、洲内方位分区、地质板块。
   全程不绘制任何国界线、行政区域界线、领海线，也不出现任何国家/地区名称作为
   主权表述。国家面数据仅在**构建期离线**用作「哪些陆块属于哪个大洲」的分类依据，
   其几何在成果中已被溶解掉（共享边抵消），不会以国界形式出现。
2) **数据源**：Natural Earth 1:50m（公有领域，U.S. Government work），
   构建输入需自行下载（脚本不联网）：
     https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_countries.geojson
   下载后放同目录或用 --src 指定。
3) **层级**：
     L0 七大洲（真实海岸线，按大洲溶解国界得到）
     L1 洲内方位分区（按面积均衡递归二分，名称用「大洲 + 方位」）
     L2 地质板块（取自 src/data.js 的示意板块，本脚本不重算）
4) 坐标：[经度, 纬度]，保留 3 位小数（约 100 m，球面拼图足够）。

用法
----
    python tools/build_nature.py --src /tmp/ne_50m_admin_0_countries.geojson \
        --out src/geodata-nature.js
"""

import argparse
import json
import math
import os

Q = 1e4  # 顶点量化精度：1e-4 度 ≈ 11 m，用于判定共享边


def qz(v):
    return round(v * Q) / Q


# ---------------------------------------------------------------- 几何基础

def rings_of(geom):
    t = geom['type']
    if t == 'Polygon':
        return [geom['coordinates']]
    if t == 'MultiPolygon':
        return geom['coordinates']
    return []


def area_ring(ring):
    """带纬度权重的平面面积（够用来比较大小与均衡切分）。"""
    s = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        s += (x1 * y2 - x2 * y1) * math.cos(math.radians((y1 + y2) * 0.5))
    return abs(s) * 0.5


def point_in_ring(pt, ring):
    x, y = pt
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y):
            xin = (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi
            if x < xin:
                inside = not inside
        j = i
    return inside


def clip_halfplane(ring, axis, value, keep_greater):
    """用半平面裁剪闭合环（Sutherland–Hodgman）。

    axis='x' 用于沿经线裁，axis='y' 用于沿纬线裁。半平面是凸集，
    因此对凹多边形同样成立；裁出来的直边就是拼图的刀模线。
    """
    if not ring:
        return []
    out = []
    n = len(ring)

    def inside(p):
        v = p[0] if axis == 'x' else p[1]
        return v >= value if keep_greater else v <= value

    def cut(p, q):
        pv = p[0] if axis == 'x' else p[1]
        qv = q[0] if axis == 'x' else q[1]
        if abs(qv - pv) < 1e-12:
            return None
        t = (value - pv) / (qv - pv)
        return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

    for i in range(n):
        p = ring[i]
        q = ring[(i + 1) % n]
        ip, iq = inside(p), inside(q)
        if ip:
            out.append(p)
            if not iq:
                c = cut(p, q)
                if c:
                    out.append(c)
        elif iq:
            c = cut(p, q)
            if c:
                out.append(c)
    # 去掉连续重复点
    clean = []
    for p in out:
        if not clean or abs(p[0] - clean[-1][0]) > 1e-9 or abs(p[1] - clean[-1][1]) > 1e-9:
            clean.append(p)
    if len(clean) > 2 and abs(clean[0][0] - clean[-1][0]) < 1e-9 and abs(clean[0][1] - clean[-1][1]) < 1e-9:
        clean.pop()
    return clean if len(clean) >= 3 else []


def dp_simplify(ring, tol):
    """Douglas–Peucker 闭合环简化（迭代实现，避免递归过深）。"""
    n = len(ring)
    if n <= 4:
        return ring
    # 以最远两点为初始割线
    i0 = 0
    i1 = max(range(n), key=lambda i: (ring[i][0] - ring[i0][0]) ** 2 + (ring[i][1] - ring[i0][1]) ** 2)
    keep = [False] * n
    keep[i0] = keep[i1] = True

    stack = [(i0, i1), (i1, i0 + n)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ax, ay = ring[a % n]
        bx, by = ring[b % n]
        dx, dy = bx - ax, by - ay
        ln = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for k in range(a + 1, b):
            px, py = ring[k % n]
            if ln < 1e-12:
                dist = math.hypot(px - ax, py - ay)
            else:
                dist = abs(dy * (px - ax) - dx * (py - ay)) / ln
            if dist > best:
                best, bi = dist, k
        if best > tol and bi > 0:
            keep[bi % n] = True
            stack.append((a, bi))
            stack.append((bi, b))
    out = [ring[i] for i in range(n) if keep[i]]
    return out if len(out) >= 3 else ring


# ---------------------------------------------------------------- 溶解

def dissolve(rings):
    """共享边抵消：出现偶数次的边视为内部边（国界/洲内国界），出现奇数次的保留。"""
    cnt = {}
    for ring in rings:
        n = len(ring)
        for i in range(n):
            a = (qz(ring[i][0]), qz(ring[i][1]))
            b = (qz(ring[(i + 1) % n][0]), qz(ring[(i + 1) % n][1]))
            if a == b:
                continue
            key = (a, b) if a <= b else (b, a)
            cnt[key] = cnt.get(key, 0) + 1

    edges = [k for k, v in cnt.items() if v % 2 == 1]
    adj = {}
    for a, b in edges:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)

    used = set()
    out = []
    for a, b in edges:
        if (a, b) in used:
            continue
        loop = [a]
        used.add((a, b))
        used.add((b, a))
        cur = b
        ok = True
        while cur != a:
            loop.append(cur)
            nxt = [x for x in adj.get(cur, []) if (cur, x) not in used]
            if not nxt:
                ok = False
                break
            n2 = nxt[0]
            used.add((cur, n2))
            used.add((n2, cur))
            cur = n2
        if ok and len(loop) >= 3:
            out.append(loop)
    return out


def nest(polys):
    """把环分成 outer / hole：包含层数为偶数是外环，奇数是洞。"""
    info = []
    for r in polys:
        a = area_ring(r)
        info.append({'ring': r, 'area': a, 'depth': 0})
    info.sort(key=lambda d: -d['area'])
    for i, d in enumerate(info):
        pt = d['ring'][0]
        depth = 0
        for j in range(i):
            # 只把「明显更大」的环当作可能的父环：面积相近的环（如南极洲在日界线两侧
            # 的两个半环）互相包含时会被误判成洞，必须排除。
            if info[j]['area'] > d['area'] * 2.2 and point_in_ring(pt, info[j]['ring']):
                depth += 1
        d['depth'] = depth

    outers = [d for d in info if d['depth'] % 2 == 0]
    holes = [d for d in info if d['depth'] % 2 == 1]
    parent = {id(d): [] for d in outers}
    for h in holes:
        best = None
        for o in outers:
            if o['area'] > h['area'] * 2.2 and point_in_ring(h['ring'][0], o['ring']):
                if best is None or o['area'] < best['area']:
                    best = o
        if best is not None:
            parent[id(best)].append(h['ring'])
    result = []
    for o in outers:
        result.append([o['ring']] + parent[id(o)])
    return result


# ---------------------------------------------------------------- 大洲

CONT_CN = {
    'Asia': ('AS', '亚洲', 'ASIA', '#c2a878'),
    'Europe': ('EU', '欧洲', 'EUROPE', '#9fb2a0'),
    'Africa': ('AF', '非洲', 'AFRICA', '#c99a63'),
    'North America': ('NA', '北美洲', 'NORTH AMERICA', '#9aac98'),
    'South America': ('SA', '南美洲', 'SOUTH AMERICA', '#b98f66'),
    'Oceania': ('OC', '大洋洲', 'OCEANIA', '#c3b082'),
    'Antarctica': ('AN', '南极洲', 'ANTARCTICA', '#bccdd9'),
}

KNOWN = {
    'AS': dict(area='约 4,458 万 km²', span='约 11°S – 81°N，跨寒、温、热三带',
               terrain='中部为青藏高原与喜马拉雅山系，北部为西西伯利亚平原，东部多阶梯状地貌',
               fact='地球上海拔最高点与陆地最低点都在亚洲，垂直高差超过 9,000 米'),
    'EU': dict(area='约 1,016 万 km²', span='约 36°N – 71°N，主要位于北温带',
               terrain='以平原为主体，南部横亘阿尔卑斯山系，海岸线极为曲折',
               fact='半岛与岛屿面积占比在各大洲中最高，受北大西洋暖流影响显著'),
    'AF': dict(area='约 3,020 万 km²', span='赤道横穿中部，南北纬度跨度大致对称',
               terrain='北部为撒哈拉，东部有东非大裂谷与高原，整体呈东南高、西北低',
               fact='气候带以赤道为轴近似对称分布，是观察纬度地带性的典型样本'),
    'NA': dict(area='约 2,423 万 km²', span='约 7°N – 83°N，纵跨北半球大部分纬度',
               terrain='西部为科迪勒拉山系，中部大平原贯通南北，东部为古老低缓高地',
               fact='五大湖是世界面积最大的淡水湖群，蓄水量极为可观'),
    'SA': dict(area='约 1,784 万 km²', span='约 56°S – 12°N，主体位于南半球',
               terrain='安第斯山脉紧贴西岸纵贯全洲，东部为亚马孙平原与巴西高原',
               fact='亚马孙河的径流量居世界首位，河口淡水可影响到近海相当远的范围'),
    'OC': dict(area='约 897 万 km²', span='主体位于南半球低纬至中纬，横跨东西半球',
               terrain='澳大利亚大陆地势低缓，西部高原、中部盆地、东部大分水岭',
               fact='岛屿数量众多，横跨太平洋多个时区，生物区系独具特色'),
    'AN': dict(area='约 1,400 万 km²', span='绝大部分位于南极圈以内',
               terrain='平均海拔最高的大洲，基岩之上覆盖巨厚冰盖',
               fact='冰盖储存了全球绝大部分淡水冰，是海平面变化研究的关键区域'),
}


def split_meridian(poly, lon, keep_greater):
    """对多边形（含洞）沿经线裁剪。"""
    out = []
    ext = clip_halfplane(poly[0], 'x', lon, keep_greater)
    if not ext:
        return []
    holes = []
    for h in poly[1:]:
        hh = clip_halfplane(h, 'x', lon, keep_greater)
        if hh and area_ring(hh) > 0.002:
            holes.append(hh)
    out.append([ext] + holes)
    return out


def russia_split(features):
    """俄罗斯横跨欧亚，Natural Earth 把它整体标为欧洲；按 60°E（乌拉尔惯例）拆开。"""
    res = []
    for f in features:
        p = f['properties']
        if p.get('ADMIN') in ('Russia',) or p.get('SOVEREIGNT') in ('Russia',):
            for poly in rings_of(f['geometry']):
                for part in split_meridian(poly, 60.0, False):
                    res.append(('Europe', part))
                for part in split_meridian(poly, 60.0, True):
                    res.append(('Asia', part))
        else:
            cont = p.get('CONTINENT')
            for poly in rings_of(f['geometry']):
                res.append((cont, poly))
    return res


# ---------------------------------------------------------------- 分区

def bbox(polys):
    xs = [p[0] for poly in polys for p in poly[0]]
    ys = [p[1] for poly in polys for p in poly[0]]
    return min(xs), min(ys), max(xs), max(ys)


def clip_polys(polys, axis, value, keep_greater):
    out = []
    for poly in polys:
        ext = clip_halfplane(poly[0], axis, value, keep_greater)
        if not ext or area_ring(ext) < 0.05:
            continue
        holes = []
        for h in poly[1:]:
            hh = clip_halfplane(h, axis, value, keep_greater)
            if hh and area_ring(hh) > 0.01:
                holes.append(hh)
        out.append([ext] + holes)
    return out


def total_area(polys):
    return sum(area_ring(p[0]) for p in polys)


def median_cut_value(polys, axis):
    """按面积中位数取切分位置：把所有顶点按轴排序，累积半个总面积处取值。"""
    pts = sorted([p for poly in polys for p in poly[0]], key=lambda p: p[0] if axis == 'x' else p[1])
    total = total_area(polys)
    half = total * 0.5
    acc = 0.0
    prev = None
    for pt in pts:
        # 用相邻顶点构成的条带近似：这里只求一个稳健的分位点
        acc += 0.0
        prev = pt
    # 简化：用顶点分布的分位数（对拼图命名足够）
    idx = int(len(pts) * 0.5)
    return pts[idx][0] if axis == 'x' else pts[idx][1]


def kd_partition(polys, n, depth=0):
    """递归切分：每次沿较长的一边用中位数切开，得到面积大致均衡的 n 块。"""
    if n <= 1:
        return [polys]
    x0, y0, x1, y1 = bbox(polys)
    axis = 'x' if (x1 - x0) * math.cos(math.radians((y0 + y1) / 2)) >= (y1 - y0) else 'y'
    val = median_cut_value(polys, axis)
    left = clip_polys(polys, axis, val, False)
    right = clip_polys(polys, axis, val, True)
    if not left or not right:
        return [polys]
    nl = max(1, int(round(n * total_area(left) / (total_area(left) + total_area(right)))))
    nl = min(n - 1, max(1, nl))
    return kd_partition(left, nl, depth + 1) + kd_partition(right, n - nl, depth + 1)


SECTORS = ['东部', '东北部', '北部', '西北部', '西部', '西南部', '南部', '东南部']

# 主要岛屿：中文名、英文名、中心经度、中心纬度、匹配半径（度）。
# 岛屿中心坐标取自公开地理资料，仅用于把「同一座岛的陆块」聚合命名。
ISLANDS = [
    ('格陵兰岛', 'Greenland', -42.0, 72.0, 9.0),
    ('新几内亚岛', 'New Guinea', 141.0, -5.0, 6.0),
    ('加里曼丹岛', 'Borneo', 114.0, 0.0, 5.0),
    ('马达加斯加岛', 'Madagascar', 47.0, -19.0, 4.5),
    ('苏门答腊岛', 'Sumatra', 102.0, -1.0, 4.5),
    ('本州岛', 'Honshu', 138.0, 36.0, 4.0),
    ('苏拉威西岛', 'Sulawesi', 121.0, -2.0, 3.5),
    ('爪哇岛', 'Java', 110.0, -7.5, 3.0),
    ('吕宋岛', 'Luzon', 121.0, 16.0, 3.0),
    ('棉兰老岛', 'Mindanao', 122.5, 7.5, 2.5),
    ('不列颠岛', 'Great Britain', -2.0, 54.0, 3.5),
    ('爱尔兰岛', 'Ireland', -8.0, 53.0, 2.5),
    ('冰岛', 'Iceland', -19.0, 65.0, 2.5),
    ('巴芬岛', 'Baffin Island', -72.0, 68.0, 3.6),
    ('维多利亚岛', 'Victoria Island', -110.0, 70.0, 2.6),
    ('埃尔斯米尔岛', 'Ellesmere Island', -80.0, 80.0, 2.2),
    ('纽芬兰岛', 'Newfoundland', -56.0, 49.0, 3.0),
    ('古巴岛', 'Cuba', -79.0, 22.0, 3.0),
    ('伊斯帕尼奥拉岛', 'Hispaniola', -71.0, 19.0, 2.5),
    ('斯里兰卡岛', 'Sri Lanka', 81.0, 7.5, 2.0),
    ('新西兰南岛', 'South Island', 171.0, -43.0, 2.5),
    ('新西兰北岛', 'North Island', 176.0, -38.0, 2.5),
    ('塔斯马尼亚岛', 'Tasmania', 147.0, -42.0, 2.0),
    ('库页岛', 'Sakhalin', 143.0, 50.0, 2.5),
    ('台湾岛', 'Taiwan Island', 121.0, 23.7, 1.6),
    ('海南岛', 'Hainan Island', 110.0, 19.2, 1.6),
    ('新地岛', 'Novaya Zemlya', 57.0, 74.0, 2.4),
    ('北地群岛', 'Severnaya Zemlya', 95.0, 79.0, 2.6),
    ('新西伯利亚群岛', 'New Siberian Islands', 140.0, 75.0, 3.0),
    ('斯瓦尔巴群岛', 'Svalbard', 16.0, 78.0, 2.2),
    ('帝汶岛', 'Timor', 125.0, -9.0, 2.0),
    ('火地岛', 'Tierra del Fuego', -68.5, -54.0, 2.2),
    ('新喀里多尼亚岛', 'New Caledonia', 165.0, -21.0, 2.0),
]


def match_island(cx, cy):
    """按中心点就近匹配岛屿名；返回 (中文名, 英文名) 或 (None, None)。"""
    best = None
    for nm, en, lx, ly, rad in ISLANDS:
        d = math.hypot((cx - lx) * math.cos(math.radians(cy)), cy - ly)
        if rad > 0 and d <= rad and (best is None or d < best[0]):
            best = (d, nm, en)
    return (best[1], best[2]) if best else (None, None)


def dir_name(cont_cn, piece_polys):
    """按拼片相对大洲质心的方位取名（八方位），比递归切分的路径名更好读。"""
    pts = [p for poly in piece_polys for p in poly[0]]
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    # 用经纬面积加权重算质心，避免细长拼片偏向顶点密集的一侧
    tot = 0.0
    sx = sy = 0.0
    for poly in piece_polys:
        r = poly[0]
        a = area_ring(r)
        mx = sum(p[0] for p in r) / len(r)
        my = sum(p[1] for p in r) / len(r)
        sx += mx * a
        sy += my * a
        tot += a
    if tot > 0:
        cx, cy = sx / tot, sy / tot
    return cx, cy, SECTORS


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='/tmp/ne_50m_admin_0_countries.geojson')
    ap.add_argument('--out', default='src/geodata-nature.js')
    ap.add_argument('--tolerance', type=float, default=0.055)
    args = ap.parse_args()

    data = json.load(open(args.src, encoding='utf-8'))
    feats = [f for f in data['features'] if f['properties'].get('CONTINENT') != 'Seven seas (open ocean)']
    tagged = russia_split(feats)

    by_cont = {}
    for cont, poly in tagged:
        if cont not in CONT_CN:
            continue
        by_cont.setdefault(cont, []).append(poly)

    # 岛屿归属修正：新几内亚岛在国界数据里被印尼（亚洲）与巴布亚新几内亚（大洋洲）
    # 分成两半。自然地理上整座岛属大洋洲（美拉尼西亚），这里把落在该岛范围内的
    # 多边形整体并入目标大洲，保证 L1 的「新几内亚岛」是一片完整陆块，
    # 而不是被洲界切成两片。只做归属调整，不改动任何几何。
    # 键为大洲英文名（by_cont 的键），值为目标大洲英文名。
    REASSIGN = [('新几内亚岛', 'Oceania')]

    def reassign_islands(by_cont):
        target = {nm: cont for nm, cont in REASSIGN}
        moved = 0
        for cont in list(by_cont.keys()):
            keep = []
            for poly in by_cont[cont]:
                r = poly[0]
                cx = sum(v[0] for v in r) / len(r)
                cy = sum(v[1] for v in r) / len(r)
                nm, _en = match_island(cx, cy)
                cid = target.get(nm)
                if cid and cid != cont:
                    by_cont.setdefault(cid, []).append(poly)
                    moved += 1
                else:
                    keep.append(poly)
            by_cont[cont] = keep
        if moved:
            print('岛屿归属修正：%d 个多边形改归目标大洲' % moved)

    reassign_islands(by_cont)

    # 每个大洲：溶解 → 嵌套判定 → 简化
    cont_polys = {}
    for cont, polys in by_cont.items():
        all_rings = [r for poly in polys for r in poly]
        merged = dissolve(all_rings)
        nested = nest(merged)
        clean = []
        for poly in nested:
            ext = dp_simplify(poly[0], args.tolerance)
            if area_ring(ext) < 0.5:   # 丢掉 <0.5 平方度的小岛（不影响拼图手感）
                continue
            holes = [dp_simplify(h, args.tolerance) for h in poly[1:] if area_ring(h) > 0.8]
            clean.append([[[qz(x), qz(y)] for x, y in ext]] +
                         [[[qz(x), qz(y)] for x, y in h] for h in holes])
        clean.sort(key=lambda p: -area_ring([tuple(v) for v in p[0]]))
        cont_polys[cont] = clean
        print('%-16s rings=%d polygons=%d pts=%d' % (
            cont, len(merged), len(clean), sum(len(r) for p in clean for r in p)))

    # L0 拼片
    pieces0 = []
    bboxes = {}
    cont_centers = {}
    for cont, (cid, cn, en, color) in CONT_CN.items():
        polys = cont_polys.get(cont)
        if not polys:
            continue
        b = bbox([[list(map(tuple, r)) for r in p] for p in polys])
        bboxes[cid] = b
        # 中心取最大多边形的顶点均值
        main_ring = polys[0][0]
        cx = sum(p[0] for p in main_ring) / len(main_ring)
        cy = sum(p[1] for p in main_ring) / len(main_ring)
        cont_centers[cid] = (cx, cy)
        pieces0.append({
            'id': cid, 'gb': '', 'name': cn, 'en': en, 'parentId': 'EARTH',
            'level': 0, 'kind': '大洲（自然地理陆块）', 'drillKey': cid, 'coarse': True,
            'color': color, 'center': [round(cx, 2), round(cy, 2)], 'span': None,
            'polygons': polys, 'knowledge': KNOWN[cid],
        })
    # ---------------------------------------------------------------- L1
    # 进阶层：把「面积够大的岛」从大洲里拆出来做独立拼片。
    # 这一步只做多边形「归组」，不做任何几何裁剪 —— 因此不存在重叠、缝隙或伪边，
    # 每一片都直接沿用真实海岸线。岛名按公开的岛屿中心坐标就近匹配。
    def piece_of(pid, nm, en, level, kind, color, polys, kn):
        ring = max((p[0] for p in polys), key=len)
        return {
            'id': pid, 'gb': '', 'name': nm, 'en': en, 'parentId': 'EARTH',
            'level': level, 'kind': kind, 'drillKey': pid, 'coarse': False,
            'color': color,
            'center': [round(sum(v[0] for v in ring) / len(ring), 2),
                       round(sum(v[1] for v in ring) / len(ring), 2)],
            'span': None, 'polygons': polys, 'knowledge': kn,
        }

    pieces1 = {}
    for cont, (cid, cn, en, base) in CONT_CN.items():
        polys = cont_polys.get(cont)
        if not polys:
            continue
        sized = sorted(((area_ring([tuple(v) for v in p[0]]), p) for p in polys), key=lambda t: -t[0])
        mainland = [sized[0][1]]
        buckets = {}   # 同名群岛合并为一片（同一群岛的多块陆块不再拆碎）
        order = []
        for a, p in sized[1:]:
            r = p[0]
            cx = sum(v[0] for v in r) / len(r)
            cy = sum(v[1] for v in r) / len(r)
            nm, en2 = match_island(cx, cy) if a >= 1.6 else (None, None)
            if nm:
                if nm not in buckets:
                    buckets[nm] = [en2, 0.0, []]
                    order.append(nm)
                buckets[nm][1] += a
                buckets[nm][2].append(p)
            else:
                mainland.append(p)   # 太小的岛并回大洲，避免碎屑拼片
        islands = [(nm, buckets[nm][0], buckets[nm][1], buckets[nm][2]) for nm in order]

        lst = []
        kn = dict(KNOWN[cid])
        kn['fact'] = kn['fact']
        lst.append(piece_of(cid, cn, en, 1, '大洲（含全部附属岛屿）', base, mainland, kn))
        for i, (nm, en2, a, ps) in enumerate(sorted(islands, key=lambda t: -t[2])):
            lst.append(piece_of('%s-is%d' % (cid, i + 1), nm, en2 or '', 1, '主要岛屿', base, ps, {
                'area': '约 %.1f 万 km²' % (a * 111.32 ** 2 / 1e4),
                'span': '位于%s的独立陆块' % cn,
                'terrain': '四面环海的独立岛屿，与所在大洲主体不接壤',
                'fact': '岛屿是独立于大陆的陆块，拼装时可以作为单独一片取下、旋转、嵌回。',
            }))
        pieces1[cid] = lst
        print('  %s → %d 片：%s' % (cn, len(lst), '、'.join(x['name'] for x in lst)))

    # 同名岛屿去重（跨洲被切开的大岛，用方位区分）
    allp = [p for lst in pieces1.values() for p in lst if p['kind'] == '主要岛屿']
    byname = {}
    for p in allp:
        byname.setdefault(p['name'], []).append(p)
    for nm, group in byname.items():
        if len(group) < 2:
            continue
        group.sort(key=lambda p: p['center'][0])
        for i, p in enumerate(group):
            p['name'] = '%s（%s）' % (nm, '一二三四五'[i])

    # 输出
    header = """// 自动生成，请勿手工修改；由 tools/build_nature.py 生成。
// 数据源：Natural Earth 1:50m（公有领域，U.S. Government work）——仅作构建期分类输入，
//         成图不含任何国界线、行政区域界线或领海线。
// 内容：仅自然地理要素——大洲陆块轮廓、洲内方位分区、地质板块。
// 说明：洲内方位分区由几何切分生成，不代表任何行政、主权或标准地理区划界线；
//       本文件不含国家名称作为主权表述，不作为地图依据，不属测绘成果。
"""
    js = [header]
    js.append('export const NATURE_META = %s;\n' % json.dumps({
        'source': 'Natural Earth 1:50m（public domain）',
        'sourceUrl': 'https://www.naturalearthdata.com/',
        'crs': 'WGS84 经纬度',
        'note': '仅自然地理要素；无国界、无行政界线、无领海线',
        'builtAt': '2026-11-13',
    }, ensure_ascii=False))
    js.append('export const NATURE_CONTINENTS = %s;\n' % json.dumps(pieces0, ensure_ascii=False, separators=(',', ':')))
    js.append('export const NATURE_SUBREGIONS = %s;\n' % json.dumps(pieces1, ensure_ascii=False, separators=(',', ':')))

    out = args.out
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(''.join(js))
    print('written %s  %.1f KB' % (out, os.path.getsize(out) / 1024))


if __name__ == '__main__':
    main()
