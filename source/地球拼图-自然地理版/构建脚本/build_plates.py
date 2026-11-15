# -*- coding: utf-8 -*-
"""生成 globe-puzzle 的地质板块数据（PB2002 真实板块边界）

数据源：Peter Bird, "An updated digital model of plate boundaries",
        G3, 4(3), 1027, 2003（PB2002）。
        GeoJSON 转制：Hugo Ahlenius / Nordpil（github.com/fraxen/tectonicplates），
        许可：ODC Attribution License 1.0（需署名，允许商用）。

产出：src/geodata-plates.js —— 52 个板块的球面多边形（含洞），带中文名、
      球面面积、相邻板块、知识卡字段。板块多边形是全球无缝剖分，拼起来即整个球壳。

用法：
    python tools/build_plates.py --src /tmp/pb_plates.json --out src/geodata-plates.js

注意：本文件只做几何整理（合并同码要素、去重、简化），不做任何投影或重算，
      板块边界原样保留 PB2002 的形态。
"""

import argparse
import json
import math
import io

R_EARTH = 6371.0088  # km，IUGG 平均半径

# 代码 → 中文名 / 英文名
NAMES = {
    'AF': ('非洲板块', 'African Plate'),
    'AN': ('南极洲板块', 'Antarctic Plate'),
    'SO': ('索马里板块', 'Somali Plate'),
    'IN': ('印度板块', 'Indian Plate'),
    'AU': ('澳大利亚板块', 'Australian Plate'),
    'EU': ('欧亚板块', 'Eurasian Plate'),
    'NA': ('北美洲板块', 'North American Plate'),
    'SA': ('南美洲板块', 'South American Plate'),
    'NZ': ('纳斯卡板块', 'Nazca Plate'),
    'PA': ('太平洋板块', 'Pacific Plate'),
    'AR': ('阿拉伯板块', 'Arabian Plate'),
    'SU': ('巽他板块', 'Sunda Plate'),
    'TI': ('帝汶板块', 'Timor Plate'),
    'KE': ('克马德克板块', 'Kermadec Plate'),
    'TO': ('汤加板块', 'Tonga Plate'),
    'NI': ('纽阿福欧板块', 'Niuafo’ou Plate'),
    'WL': ('伍德拉克板块', 'Woodlark Plate'),
    'MO': ('毛克板块', 'Maoke Plate'),
    'SB': ('南俾斯麦板块', 'South Bismarck Plate'),
    'SS': ('所罗门海板块', 'Solomon Sea Plate'),
    'NB': ('北俾斯麦板块', 'North Bismarck Plate'),
    'NH': ('新赫布里底板块', 'New Hebrides Plate'),
    'CA': ('加勒比板块', 'Caribbean Plate'),
    'CO': ('科科斯板块', 'Cocos Plate'),
    'OK': ('鄂霍次克板块', 'Okhotsk Plate'),
    'JF': ('胡安·德富卡板块', 'Juan de Fuca Plate'),
    'AP': ('阿尔蒂普拉诺板块', 'Altiplano Plate'),
    'ND': ('北安第斯板块', 'North Andes Plate'),
    'ON': ('冲绳板块', 'Okinawa Plate'),
    'PS': ('菲律宾海板块', 'Philippine Sea Plate'),
    'AM': ('阿穆尔板块', 'Amur Plate'),
    'CL': ('加罗林板块', 'Caroline Plate'),
    'MA': ('马里亚纳板块', 'Mariana Plate'),
    'FT': ('富图纳板块', 'Futuna Plate'),
    'SC': ('斯科舍板块', 'Scotia Plate'),
    'SL': ('设得兰板块', 'Shetland Plate'),
    'AS': ('爱琴海板块', 'Aegean Sea Plate'),
    'AT': ('安纳托利亚板块', 'Anatolian Plate'),
    'YA': ('扬子板块', 'Yangtze Plate'),
    'BU': ('缅甸板块', 'Burma Plate'),
    'RI': ('里维拉板块', 'Rivera Plate'),
    'BH': ('鸟头板块', 'Birds Head Plate'),
    'MS': ('马鲁古海板块', 'Molucca Sea Plate'),
    'BS': ('班达海板块', 'Banda Sea Plate'),
    'MN': ('马努斯板块', 'Manus Plate'),
    'CR': ('康韦礁板块', 'Conway Reef Plate'),
    'BR': ('巴尔莫勒尔礁板块', 'Balmoral Reef Plate'),
    'EA': ('复活节板块', 'Easter Plate'),
    'JZ': ('胡安·费尔南德斯板块', 'Juan Fernandez Plate'),
    'GP': ('加拉帕戈斯板块', 'Galapagos Plate'),
    'SW': ('南桑威奇板块', 'Sandwich Plate'),
    'PM': ('巴拿马板块', 'Panama Plate'),
}

# 七大主板块（其余为次级板块）
MAJOR = ['PA', 'NA', 'EU', 'AF', 'AN', 'AU', 'SA', 'IN']

# 以大陆地壳为主的板块（决定配色偏暖）
CONTINENTAL = {'AF', 'AN', 'EU', 'NA', 'SA', 'AU', 'IN', 'AR', 'SO', 'AM', 'YA', 'AT', 'AS',
               'BU', 'SU', 'TI', 'OK', 'ND', 'AP', 'PM', 'CA', 'WL', 'MO', 'BH', 'NB', 'SB', 'MN'}

# 板块配色：像地质图那样「相邻板块一定不同色」，用图着色分配（不是按陆地/海洋分）。
PALETTE = ['#c98a5b', '#7fa6c9', '#a3c08d', '#d8b76d', '#a892c9',
           '#6fbfb5', '#cf8f95', '#93a8b8', '#c9a06f', '#8fb8d0']


# ------------------------------------------------------------------ 几何工具
def ring_area(ring):
    """球面面积（km²），用球面多边形面积公式。ring: [[lon,lat],...]"""
    if len(ring) < 3:
        return 0.0
    total = 0.0
    n = len(ring)
    for i in range(n):
        lon1, lat1 = math.radians(ring[i][0]), math.radians(ring[i][1])
        lon2, lat2 = math.radians(ring[(i + 1) % n][0]), math.radians(ring[(i + 1) % n][1])
        total += (lon2 - lon1) * (2 + math.sin(lat1) + math.sin(lat2))
    return abs(total) * R_EARTH * R_EARTH / 2.0


def planar_area(ring):
    t = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        t += x1 * y2 - x2 * y1
    return abs(t) / 2.0


def perp(p, a, b):
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def dp(points, tol):
    """Douglas-Peucker（迭代版，避免深递归）。"""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        dmax, idx = -1.0, -1
        for k in range(i + 1, j):
            d = perp(points[k], points[i], points[j])
            if d > dmax:
                dmax, idx = d, k
        if dmax > tol:
            keep[idx] = True
            stack.append((i, idx))
            stack.append((idx, j))
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tol):
    if len(ring) < 4:
        return ring
    # 环首尾相同则去掉尾部再简化，最后补回
    closed = ring[0] == ring[-1]
    pts = ring[:-1] if closed else ring
    if len(pts) < 4:
        return pts
    out = dp(pts, tol)
    return out if len(out) >= 3 else pts


def norm(ring):
    """只把经纬度夹到合法区间，**不做经度环绕**。

    PB2002 的板块多边形已经在 ±180 处剖分好（如太平洋板块是 3 块），
    若把 180 折成 -180，一个贴着日界线的环会突然横跨全图，面积与三角化全毁。
    """
    out = []
    for x, y in ring:
        lon = max(-180.0, min(180.0, x))
        out.append([round(lon, 3), round(max(-90.0, min(90.0, y)), 3)])
    # 去掉连续重复点
    ded = []
    for p in out:
        if not ded or abs(p[0] - ded[-1][0]) > 1e-9 or abs(p[1] - ded[-1][1]) > 1e-9:
            ded.append(p)
    if len(ded) > 2 and ded[0] == ded[-1]:
        ded.pop()
    return ded


# ------------------------------------------------------------------ 主流程
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--tol', type=float, default=0.06, help='简化容差（度）')
    args = ap.parse_args()

    data = json.load(io.open(args.src, encoding='utf-8'))
    buckets = {}   # code -> [polys]
    order = []
    for f in data['features']:
        code = f['properties'].get('Code')
        if not code:
            continue
        geom = f['geometry']
        if geom['type'] == 'Polygon':
            polys = [geom['coordinates']]
        elif geom['type'] == 'MultiPolygon':
            polys = geom['coordinates']
        else:
            continue
        if code not in buckets:
            buckets[code] = []
            order.append(code)
        buckets[code].extend(polys)

    # 简化 + 面积
    plates = []
    for code in order:
        polys = []
        for poly in buckets[code]:
            rings = []
            for k, ring in enumerate(poly):
                s = simplify_ring(ring, args.tol if k == 0 else args.tol * 0.6)
                s = norm(s)
                if len(s) < 3:
                    continue
                if planar_area(s) < 0.05:   # 丢掉退化的碎片环（<0.05 平方度）
                    continue
                rings.append(s)
            if rings:
                polys.append(rings)
        if not polys:
            continue
        # 面积（外环减洞）
        area = 0.0
        for rings in polys:
            area += ring_area(rings[0])
            for h in rings[1:]:
                area -= ring_area(h)
        big = max(polys, key=lambda rings: ring_area(rings[0]))
        r = big[0]
        cx = sum(p[0] for p in r) / len(r)
        cy = sum(p[1] for p in r) / len(r)
        cn, en = NAMES.get(code, (code, code))
        plates.append({
            'code': code, 'name': cn, 'en': en,
            'area': area, 'polys': polys, 'center': [round(cx, 2), round(cy, 2)],
        })

    plates.sort(key=lambda p: -p['area'])

    # 相邻板块：量化顶点后寻找共享边（PB2002 各板块共用同一条边界折线）
    def q(p):
        return (round(p[0], 2), round(p[1], 2))

    seg_owner = {}
    for i, pl in enumerate(plates):
        for rings in pl['polys']:
            for ring in rings:
                n = len(ring)
                for j in range(n):
                    a, b = q(ring[j]), q(ring[(j + 1) % n])
                    if a == b:
                        continue
                    key = (a, b) if a <= b else (b, a)
                    seg_owner.setdefault(key, set()).add(i)

    neigh = [dict() for _ in plates]
    for key, owners in seg_owner.items():
        if len(owners) < 2:
            continue
        a, b = key
        length = math.hypot((a[0] - b[0]) * math.cos(math.radians(a[1])), a[1] - b[1])
        for i in owners:
            for j in owners:
                if i != j:
                    neigh[i][j] = neigh[i].get(j, 0.0) + length

    # 相邻板块是「无向图」，用贪心着色保证相邻两片不同色（地质图惯例）
    adj = [set(neigh[i].keys()) for i in range(len(plates))]
    order = sorted(range(len(plates)), key=lambda i: -len(adj[i]))
    color_of = [None] * len(plates)
    for i in order:
        used = {color_of[j] for j in adj[i] if color_of[j] is not None}
        free = [c for c in PALETTE if c not in used]
        # 四色定理保证 free 非空；从可用色里轮着取，颜色分布更均匀（不然会退化成 4 色）
        color_of[i] = free[i % len(free)] if free else PALETTE[0]
    ncolor = len({c for c in color_of})
    print('着色：%d 色（相邻不重色）' % ncolor)

    # 组装输出
    out_pieces = []
    for idx, pl in enumerate(plates):
        code = pl['code']
        major = code in MAJOR
        cont = code in CONTINENTAL
        color = color_of[idx]
        nb = sorted(neigh[idx].items(), key=lambda kv: -kv[1])[:4]
        nb_names = '、'.join(plates[j]['name'].replace('板块', '') for j, _ in nb)
        kind = '主要板块' if major else '次级板块'
        crust = '以大陆地壳为主' if cont else '以大洋地壳为主'
        knowledge = {
            'area': '约 %.0f 万 km²' % (pl['area'] / 1e4),
            'span': '全球岩石圈被切成 52 个板块，本板块为%s之一' % kind,
            'terrain': crust + '；边界即地震与火山的主要发生带',
            'fact': ('相邻板块：%s。板块在软流圈之上缓慢移动，边界处的挤压 / 张裂 / '
                     '错动造就了全球主要山系、海沟与洋中脊。' % (nb_names or '无')),
        }
        out_pieces.append({
            'id': 'PL-' + code,
            'gb': '',
            'name': pl['name'],
            'en': pl['en'],
            'parentId': 'EARTH',
            'level': 1,
            'kind': kind,
            'drillKey': 'PL-' + code,
            'coarse': False,
            'color': color,
            'center': pl['center'],
            'span': None,
            'polygons': pl['polys'],
            'knowledge': knowledge,
        })

    body = json.dumps(out_pieces, ensure_ascii=False, separators=(',', ':'))
    js = '''// 地质板块数据（PB2002）—— 自动生成，请勿手改
//
// 数据源：Peter Bird, "An updated digital model of plate boundaries",
//         Geochemistry Geophysics Geosystems, 4(3), 1027, 2003.
//         GeoJSON 转制：Hugo Ahlenius / Nordpil（github.com/fraxen/tectonicplates）
//         许可：Open Data Commons Attribution License 1.0（需署名，允许商用）
// 生成：tools/build_plates.py（合并同码要素 → 简化 %.2f° → 球面面积 / 相邻板块）
// 说明：52 个板块是全球岩石圈的无缝剖分，拼起来就是一整层球壳；边界为 PB2002 实测形态。

export const PLATE_BOUNDARIES_LICENSE = 'PB2002 · Peter Bird (2003) · 转制 Hugo Ahlenius/Nordpil · ODC-BY 1.0';

export const NATURE_PLATES = %s;
''' % (args.tol, body)

    io.open(args.out, 'w', encoding='utf-8').write(js)
    total = sum(p['area'] for p in plates)
    print('plates: %d  顶点 %d  全球面积 %.0f 万 km²（地球 %.0f 万 km²）'
          % (len(plates), sum(len(r) for p in plates for rings in p['polys'] for r in rings),
             total / 1e4, 5.10e8 / 1e4))
    print('最大：%s  最小：%s' % (plates[0]['name'], plates[-1]['name']))
    for p in plates[:6]:
        print('  %-4s %-12s %8.0f 万 km²' % (p['code'], p['name'], p['area'] / 1e4))


if __name__ == '__main__':
    main()
