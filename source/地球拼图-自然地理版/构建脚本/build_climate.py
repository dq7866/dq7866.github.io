# -*- coding: utf-8 -*-
"""生成「柯本气候区」拼片（src/geodata-climate.js）。

与 v1.1 的「按纬线切五带」不同，本版用的是**实测气候分类**：

  数据：Köppen–Geiger 气候分类（Peel, Finlayson & McMahon 2007），
       0.1° 全球格网，矢量化后 4303 个多边形，30 个气候型（Af…EF）。
       经 github.com/rjerue/koppen-map 的 raw-data.json 取得（原始图层
       IGRAC / Kartoza: other_climate_2007_koppen_geiger）。
       2026-11 下载，构建期离线使用，不随产品分发原始数据。

  分组：按柯本第一级字母归为 5 个气候带 A/B/C/D/E（热带 / 干旱 / 温带 /
       冷温带 / 极地），再按大洲切开 —— 因此每片是「某大洲的某气候带」，
       轮廓是真实气候边界，而不是纬线。

  拼接：原始数据是栅格矢量化的结果，所有边都落在 0.1° 网格上、且只沿经纬
       方向。这里把每条边拆成 0.1° 的单位边再互相抵消（奇偶溶解），
       所以同一气候带内相邻碎块之间的接缝会被完全消掉，不留网格线。

用法：
    python build_climate.py --kg data/koppen-raw.json \\
        --src geodata-nature.js --out geodata-climate.js
"""

import argparse
import io
import json
import math
from collections import defaultdict

R_EARTH = 6371.0088
CELL = 0.1          # 源数据网格边长（度）

# ---------------------------------------------------------------- 五个气候带
BELTS = [
    {'id': 'A', 'name': '热带', 'en': 'Tropical', 'color': '#cf5a3c',
     'desc': '最冷月均温 ≥ 18℃，全年高温，无真正冬季',
     'veg': '热带雨林、热带季雨林、热带草原（萨瓦纳）',
     'fact': '赤道附近全年受太阳直射，上升气流强、降水多；亚马孙与刚果盆地是两大热带雨林中心。'},
    {'id': 'B', 'name': '干旱带', 'en': 'Arid', 'color': '#d9ab52',
     'desc': '蒸发量大于降水量，降水不足以支持成片森林',
     'veg': '热带荒漠、温带荒漠、荒漠草原（草原化荒漠）',
     'fact': '副热带高压下沉气流与深居内陆共同造成干旱；撒哈拉—阿拉伯—中亚—澳大利亚内陆在图上连成一条跨越三洲的干旱带。'},
    {'id': 'C', 'name': '温带', 'en': 'Temperate', 'color': '#6ba26a',
     'desc': '最冷月均温 0–18℃，四季分明，冬季不严寒',
     'veg': '亚热带常绿阔叶林、地中海硬叶灌丛、温带落叶阔叶林',
     'fact': '人口与耕地最集中的气候带；地中海气候（Cs）夏干冬雨，是温带里唯一「雨热不同期」的类型。'},
    {'id': 'D', 'name': '冷温带', 'en': 'Cold (Continental)', 'color': '#4a7fa6',
     'desc': '最冷月均温 < 0℃，冬季严寒漫长，年较差极大',
     'veg': '针叶林（泰加林）、温带草原、针阔混交林',
     'fact': '只出现在北半球的大陆内部与东岸；西伯利亚的奥伊米亚康极端低温可达 −67℃，是北半球寒极。'},
    {'id': 'E', 'name': '极地带', 'en': 'Polar', 'color': '#a7c0d4',
     'desc': '最热月均温 < 10℃，无乔木生长，可有极昼极夜',
     'veg': '苔原（冻原）、极地荒漠、冰盖',
     'fact': 'ET 苔原与 EF 冰盖的分界是最热月 0℃；南极与格陵兰属冰盖，环北冰洋沿岸属苔原。'},
]

# 30 个气候型的中文名（用于卡片里说明「以哪几型为主」）
SUB_CN = {
    'Af': '热带雨林', 'Am': '热带季风', 'Aw': '热带草原',
    'BWh': '热带沙漠', 'BWk': '温带沙漠', 'BSh': '热带草原化荒漠', 'BSk': '温带草原化荒漠',
    'Csa': '地中海（热夏）', 'Csb': '地中海（暖夏）', 'Csc': '地中海（冷夏）',
    'Cwa': '亚热带季风（热夏）', 'Cwb': '亚热带高原（暖夏）', 'Cwc': '亚热带高原（冷夏）',
    'Cfa': '副热带湿润', 'Cfb': '温带海洋性', 'Cfc': '温带海洋性（冷夏）',
    'Dsa': '大陆性夏干（热夏）', 'Dsb': '大陆性夏干（暖夏）', 'Dsc': '大陆性夏干（冷夏）',
    'Dsd': '大陆性夏干（严寒）',
    'Dwa': '大陆性冬干（热夏）', 'Dwb': '大陆性冬干（暖夏）', 'Dwc': '大陆性冬干（冷夏）',
    'Dwd': '大陆性冬干（严寒）',
    'Dfa': '大陆性湿润（热夏）', 'Dfb': '大陆性湿润（暖夏）', 'Dfc': '大陆性湿润（冷夏）',
    'Dfd': '大陆性湿润（严寒）',
    'ET': '苔原', 'EF': '冰盖',
}


# ---------------------------------------------------------------- 几何

def ring_area(ring):
    """球面面积（km²）。"""
    if len(ring) < 3:
        return 0.0
    t = 0.0
    n = len(ring)
    for i in range(n):
        lon1, lat1 = math.radians(ring[i][0]), math.radians(ring[i][1])
        lon2, lat2 = math.radians(ring[(i + 1) % n][0]), math.radians(ring[(i + 1) % n][1])
        t += (lon2 - lon1) * (2 + math.sin(lat1) + math.sin(lat2))
    return abs(t) * R_EARTH * R_EARTH / 2.0


def plane_area(ring):
    """带纬度权重的平面面积（平方度），用于排序与阈值过滤。"""
    s = 0.0
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        s += (x1 * y2 - x2 * y1) * math.cos(math.radians((y1 + y2) * 0.5))
    return abs(s) * 0.5


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y):
            if x < (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi:
                inside = not inside
        j = i
    return inside


def dp_simplify(ring, tol):
    """Douglas–Peucker 闭合环简化（迭代）。"""
    n = len(ring)
    if n <= 4:
        return ring
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
            dist = math.hypot(px - ax, py - ay) if ln < 1e-12 else abs(dy * (px - ax) - dx * (py - ay)) / ln
            if dist > best:
                best, bi = dist, k
        if best > tol and bi > 0:
            keep[bi % n] = True
            stack.append((a, bi))
            stack.append((bi, b))
    out = [ring[i] for i in range(n) if keep[i]]
    return out if len(out) >= 3 else ring


def unit_edges(ring):
    """把落在 0.1° 网格上的边拆成单位边，保证相邻碎块的共享边能一一对上。"""
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        ix1, iy1 = int(round(x1 / CELL)), int(round(y1 / CELL))
        ix2, iy2 = int(round(x2 / CELL)), int(round(y2 / CELL))
        if ix1 == ix2 and iy1 == iy2:
            continue
        if ix1 == ix2:
            step = 1 if iy2 > iy1 else -1
            for j in range(iy1, iy2, step):
                yield ((ix1, j), (ix1, j + step))
        elif iy1 == iy2:
            step = 1 if ix2 > ix1 else -1
            for j in range(ix1, ix2, step):
                yield ((j, iy1), (j + step, iy1))
        else:                      # 理论上不会出现（源数据全为经纬向边）
            yield ((ix1, iy1), (ix2, iy2))


def dissolve(rings):
    """单位边奇偶抵消 → 组装成闭合环。"""
    cnt = {}
    for ring in rings:
        for a, b in unit_edges(ring):
            k = (a, b) if a < b else (b, a)
            cnt[k] = cnt.get(k, 0) + 1
    edges = [k for k, v in cnt.items() if v % 2 == 1]
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)
    used = set()
    loops = []
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
        if ok and len(loop) >= 4:
            loops.append([[p[0] * CELL, p[1] * CELL] for p in loop])
    return loops


def nest(rings):
    """按包含层数区分外环与洞，返回 [[outer, hole...], ...]。"""
    info = [{'ring': r, 'area': plane_area(r), 'depth': 0} for r in rings]
    info.sort(key=lambda d: -d['area'])
    for i, d in enumerate(info):
        pt = d['ring'][0]
        depth = 0
        for j in range(i):
            if info[j]['area'] > d['area'] * 2.0 and point_in_ring(pt[0], pt[1], info[j]['ring']):
                depth += 1
        d['depth'] = depth
    outers = [d for d in info if d['depth'] % 2 == 0]
    holes = [d for d in info if d['depth'] % 2 == 1]
    parent = {id(d): [] for d in outers}
    for h in holes:
        best = None
        for o in outers:
            if o['area'] > h['area'] * 2.0 and point_in_ring(h['ring'][0][0], h['ring'][0][1], o['ring']):
                if best is None or o['area'] < best['area']:
                    best = o
        if best is not None:
            parent[id(best)].append(h['ring'])
    return [[o['ring']] + parent[id(o)] for o in outers]


# ---------------------------------------------------------------- 输入

def load_continents(path):
    s = io.open(path, encoding='utf-8').read()
    key = 'export const NATURE_CONTINENTS = '
    i = s.index(key) + len(key)
    j = s.index(';\n', i)
    return json.loads(s[i:j])


def load_koppen(path):
    data = json.load(io.open(path, encoding='utf-8'))
    feats = data['features'] if isinstance(data, dict) else data
    out = []
    for f in feats:
        code = (f['properties'].get('climate') or '').split(' ')[0].strip()
        if not code or code[0] not in 'ABCDE':
            continue
        g = f['geometry']
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        out.append((code, polys))
    return out


# ---------------------------------------------------------------- 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kg', default='data/koppen-raw.json')
    ap.add_argument('--src', default='geodata-nature.js')
    ap.add_argument('--out', default='geodata-climate.js')
    ap.add_argument('--tol', type=float, default=0.09, help='简化容差（度）')
    ap.add_argument('--min-area', type=float, default=0.22, help='丢弃小于该面积（平方度）的碎块')
    args = ap.parse_args()

    conts = load_continents(args.src)
    # 大洲面索引（含每个环的 bbox，先筛后判）
    index = []
    for c in conts:
        for poly in c['polygons']:
            r = poly[0]
            xs = [p[0] for p in r]
            ys = [p[1] for p in r]
            index.append((c['id'], c['name'], c['en'], min(xs), min(ys), max(xs), max(ys), r))
    index.sort(key=lambda t: -(t[5] - t[3]) * (t[6] - t[4]))

    def which_continent(pts):
        """先按质心判，判不到再试顶点；返回 (id, name, en)。"""
        for x, y in pts:
            hits = [t for t in index if t[3] - 0.2 <= x <= t[5] + 0.2 and t[4] - 0.2 <= y <= t[6] + 0.2]
            for t in hits:
                if point_in_ring(x, y, t[7]):
                    return t[0], t[1], t[2]
        return None

    koppen = load_koppen(args.kg)
    buckets = defaultdict(lambda: {'rings': [], 'by_code': defaultdict(float), 'cid': None, 'cn': '', 'en': ''})
    orphan = 0.0
    for code, polys in koppen:
        outer = polys[0][0]
        cx = sum(p[0] for p in outer) / len(outer)
        cy = sum(p[1] for p in outer) / len(outer)
        pts = [(cx, cy), (outer[0][0], outer[0][1]), (outer[len(outer) // 2][0], outer[len(outer) // 2][1])]
        hit = which_continent(pts)
        if not hit:
            orphan += sum(plane_area(r) for r in polys[0])
            continue
        b = buckets[(hit[0], code[0])]
        b['cid'], b['cn'], b['en'] = hit
        for poly in polys:
            for r in poly:
                b['rings'].append(r)
        a = sum(ring_area(r) for poly in polys for r in poly)
        b['by_code'][code] += a

    print('气候多边形 %d 个，未归入任何大洲的面积 %.1f 平方度' % (len(koppen), orphan))

    pieces = []
    for (cid, letter), b in sorted(buckets.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        belt = next(x for x in BELTS if x['id'] == letter)
        loops = dissolve(b['rings'])
        polys = nest(loops)
        kept = []
        for poly in polys:
            ext = dp_simplify(poly[0], args.tol)
            if plane_area(ext) < args.min_area:
                continue
            holes = [dp_simplify(h, args.tol) for h in poly[1:] if plane_area(h) > args.min_area * 0.4]
            kept.append([[[round(x, 3), round(y, 3)] for x, y in ext]] +
                        [[[round(x, 3), round(y, 3)] for x, y in h] for h in holes])
        if not kept:
            continue
        # 南极：整块大陆只有 ET/EF 两型，气候边界没有信息量；而 Peel 的陆地掩膜不含
        # 冰架，照搬会在罗斯冰架、龙尼冰架处留下空洞。这里直接用大洲陆块几何，
        # 既补齐冰架，也让南极这一片与「大洲」档完全重合。
        if cid == 'AN':
            cont = next((c for c in conts if c['id'] == 'AN'), None)
            if cont:
                kept = [[[list(v) for v in ring] for ring in poly] for poly in cont['polygons']]
        kept.sort(key=lambda p: -plane_area(p[0]))
        area = sum(ring_area(p[0]) for p in kept)
        if area < 2e5:
            continue
        # 纬度范围
        lats = [v[1] for p in kept for v in p[0]]
        lat0, lat1 = min(lats), max(lats)

        def t(v):
            return ('南纬 ' if v < 0 else '北纬 ') + '%d°' % round(abs(v))

        # 主要气候型（按面积占比）
        tot = sum(b['by_code'].values()) or 1.0
        top = sorted(b['by_code'].items(), key=lambda kv: -kv[1])[:2]
        comp = '、'.join('%s %s（约 %d%%）' % (k, SUB_CN.get(k, k), round(v / tot * 100))
                        for k, v in top if v / tot > 0.04)
        ring = kept[0][0]
        # 标签锚点用多边形面积质心（顶点均值在多边形上会被密集顶点拉偏，标签容易落到海里）
        a2 = cx = cy = 0.0
        n2 = len(ring)
        for i in range(n2):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % n2]
            cr = x1 * y2 - x2 * y1
            a2 += cr
            cx += (x1 + x2) * cr
            cy += (y1 + y2) * cr
        if abs(a2) > 1e-9:
            cx, cy = cx / (3 * a2), cy / (3 * a2)
        else:
            cx = sum(p[0] for p in ring) / n2
            cy = sum(p[1] for p in ring) / n2
        pieces.append({
            'id': '%s-%s' % (cid, letter),
            'gb': '',
            'name': '%s · %s' % (b['cn'], belt['name']),
            'en': '%s · %s' % (b['en'], belt['en'].upper()),
            'parentId': 'EARTH', 'level': 1, 'kind': '气候带', 'drillKey': letter,
            'coarse': False, 'color': belt['color'],
            'center': [round(cx, 2), round(cy, 2)], 'span': None,
            'polygons': kept,
            'knowledge': {
                'area': '约 %.0f 万 km²' % (area / 1e4),
                'span': '约 %s – %s' % (t(lat0), t(lat1)),
                'terrain': '%s；主要气候型：%s' % (belt['desc'], comp or SUB_CN.get(top[0][0], top[0][0])),
                'fact': belt['fact'],
            },
        })
        print('  %-3s %-4s %3d 块  面积 %8.0f 万 km²  纬度 %.0f~%.0f' % (
            cid, letter, len(kept), area / 1e4, lat0, lat1))

    order = {b['id']: i for i, b in enumerate(BELTS)}
    pieces.sort(key=lambda p: (order[p['drillKey']], -sum(ring_area(q[0]) for q in p['polygons'])))

    belts_out = [{'id': b['id'], 'name': b['name'], 'en': b['en'], 'color': b['color']} for b in BELTS]
    total = sum(sum(ring_area(q[0]) for q in p['polygons']) for p in pieces)
    js = '''// 柯本气候区拼片 —— 自动生成，请勿手改
//
// 生成：build_climate.py
// 数据：Köppen–Geiger 气候分类（Peel, Finlayson & McMahon 2007），0.1° 全球格网
//       经 github.com/rjerue/koppen-map 的 raw-data.json 转制（原始图层：
//       IGRAC / Kartoza · other_climate_2007_koppen_geiger）。
// 方法：30 个气候型按柯本第一级字母归为 A/B/C/D/E 五带，再按大洲切开；
//       轮廓是实测气候边界，不是纬线。原始边全部落在 0.1° 网格上，
//       构建时拆成单位边互相抵消（奇偶溶解），碎块之间的接缝已完全消除。
// 说明：数据代表 20 世纪后期（约 1951–2000）的常年平均状况，非某一年的实况；
//       气候分类为科学划分，不代表任何行政或主权界线。

export const CLIMATE_BELTS = %s;

export const NATURE_CLIMATE = %s;
''' % (json.dumps(belts_out, ensure_ascii=False, separators=(',', ':')),
       json.dumps(pieces, ensure_ascii=False, separators=(',', ':')))
    io.open(args.out, 'w', encoding='utf-8').write(js)
    print('拼片 %d 片  总面积 %.0f 万 km²  %.1f KB' % (
        len(pieces), total / 1e4, len(js.encode('utf-8')) / 1024))


if __name__ == '__main__':
    main()
