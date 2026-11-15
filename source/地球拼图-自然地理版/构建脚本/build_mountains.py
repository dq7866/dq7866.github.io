# -*- coding: utf-8 -*-
"""从 Natural Earth 1:50m 地理区域面生成「专题图层 · 山脉」的真实数据。

原来 RIDGES 是 9 条手绘折线（喜马拉雅、安第斯……），走向靠估、只有毛虫符号。
现在改用 Natural Earth 的山脉范围面：
  ne_50m_geography_regions_polys.geojson（public domain）
筛选 FEATURECLA = "Range/mtn"（129 个要素），按中文名合并同名碎块
（横贯南极山脉、毛德王后山脉在源数据里被拆成两块），
再做 Douglas–Peucker 简化，输出「面」而不是「线」，
由前端在球面上铺成半透明山体阴影。

注意：源数据的属性名是全大写（FEATURECLA / NAME / NAME_ZH），
与同目录的河流文件（小写）不同，这里两种都兼容。

用法：python build_mountains.py --src data/ne_50m_regions_polys.geojson --out geodata-mountains.js
"""

import argparse
import io
import json
import math

# 源数据的 NAME_ZH 混用繁体与旧译名，统一转成简体并按大陆常用译名订正。
TRAD = {
    '脈': '脉', '亞': '亚', '爾': '尔', '興': '兴', '庫': '库', '薩': '萨',
    '羅': '罗', '納': '纳', '維': '维', '蘭': '兰', '圖': '图', '魯': '鲁',
    '倫': '伦', '內': '内', '華': '华', '馬': '马', '幾': '几', '欽': '钦',
    '擔': '担', '陰': '阴', '嶺': '岭', '東': '东', '溫': '温', '烏': '乌',
    '磯': '矶', '札': '扎', '蘇': '苏', '頓': '顿', '紐': '纽', '懷': '怀',
    '賈': '贾', '灣': '湾', '蓋': '盖', '韋': '韦', '麥': '麦', '爾': '尔',
    '賓': '宾', '愛': '爱', '澤': '泽', '廣': '广', '寧': '宁', '陝': '陕',
}

# 常见山脉的大陆标准译名（源数据中的繁体与旧译名差异较大，直接订正）
FIX = {
    '安地斯山脈': '安第斯山脉',
    '洛磯山脈': '落基山脉',
    '衣索比亞高原': '埃塞俄比亚高原',
    '札格羅斯山脈': '扎格罗斯山脉',
    '帕米爾高原': '帕米尔高原',
    '興都庫什山脈': '兴都库什山脉',
    '艾爾高原': '阿伊尔高原',
    '毛德王后山脈': '毛德皇后山脉',
    '毛德王后山脈': '毛德皇后山脉',
    '提贝斯提高原': '提贝斯提高原',
    '阿哈革山脉': '阿哈加尔山脉',
    '內華達山脈': '内华达山脉',
    'S. Nevada': '内华达山脉（西班牙）',
    '圭亚那地盾': '圭亚那高原',
    '哈德拉毛': '哈德拉毛山地',
    '钦山脉': '钦丘陵',
    '納加丘陵': '那加丘陵',
    '水晶山脉': '克里斯托山脉',
    '中央高地': '中央高地',
    '恰帕斯州馬德雷山脈': '恰帕斯马德雷山脉',
    '玻利維亞瑞阿爾山脈': '玻利维亚雷亚尔山脉',
    '布蘭卡山脈': '布兰卡山脉',
    '秘魯西部山脈': '秘鲁西部山脉',
    '秘魯東部山脈': '秘鲁东部山脉',
    '哥倫比亞東部山脈': '哥伦比亚东部山脉',
}


def simp(text):
    for a, b in TRAD.items():
        text = text.replace(a, b)
    return text


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        ln = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for k in range(a + 1, b):
            px, py = pts[k]
            dist = math.hypot(px - ax, py - ay) if ln < 1e-12 else abs(dy * (px - ax) - dx * (py - ay)) / ln
            if dist > best:
                best, bi = dist, k
        if best > tol:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [pts[i] for i in range(len(pts)) if keep[i]]


def plane_area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(s) / 2


def prop(p, key):
    v = p.get(key)
    if v is None:
        v = p.get(key.lower())
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='data/ne_50m_regions_polys.geojson')
    ap.add_argument('--out', default='geodata-mountains.js')
    ap.add_argument('--tol', type=float, default=0.07)
    ap.add_argument('--min-area', type=float, default=0.12, help='环面积小于该值（平方度）丢弃')
    ap.add_argument('--max-rank', type=int, default=4)
    args = ap.parse_args()

    data = json.load(io.open(args.src, encoding='utf-8'))
    groups = {}
    order = []
    for f in data['features']:
        p = f['properties']
        if (prop(p, 'FEATURECLA') or '') != 'Range/mtn':
            continue
        rank = prop(p, 'SCALERANK')
        if rank is None:
            rank = 99
        if rank > args.max_rank:
            continue
        zh = prop(p, 'NAME_ZH') or ''
        en = prop(p, 'NAME') or ''
        # 同名碎块合并（南极被拆成两块）；没有中文名时退化为英文名做键
        key = zh or en
        if not key:
            continue
        polys = []
        g = f['geometry']
        parts = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for part in parts:
            rings = []
            for r in part:
                pts = [(round(x, 3), round(y, 3)) for x, y in r]
                pts = [pts[0]] + [q for i, q in enumerate(pts[1:], 1) if q != pts[i - 1]]
                if len(pts) < 4:
                    continue
                if pts[0] != pts[-1]:
                    pts.append(pts[0])
                pts = dp(pts, args.tol)
                if len(pts) < 4 or pts[0] != pts[-1]:
                    if pts[0] != pts[-1]:
                        pts.append(pts[0])
                    if len(pts) < 4:
                        continue
                rings.append(pts)
            if not rings:
                continue
            if plane_area(rings[0]) < args.min_area:
                continue
            polys.append([[list(v) for v in ring] for ring in rings])
        if not polys:
            continue
        if key not in groups:
            groups[key] = {'name': '', 'en': en, 'rank': rank, 'polygons': []}
            order.append(key)
        groups[key]['polygons'].extend(polys)
        groups[key]['rank'] = min(groups[key]['rank'], rank)
        if zh and not groups[key]['name']:
            groups[key]['name'] = zh

    # 订正表先跟着转一遍简体，这样「繁体原名」与「简体原名」都能命中
    fix2 = {}
    for k, v in FIX.items():
        fix2[k] = v
        fix2[simp(k)] = v

    out = []
    for key in order:
        g = groups[key]
        raw = g['name'] or g['en']
        name = fix2.get(raw) or fix2.get(simp(raw)) or simp(raw)
        out.append({'name': name, 'en': g['en'], 'rank': g['rank'], 'polygons': g['polygons']})

    out.sort(key=lambda r: -sum(plane_area(poly[0]) for poly in r['polygons']))
    pts = sum(len(r2) for r in out for poly in r['polygons'] for r2 in poly)

    js = '''// 山脉范围 —— 自动生成，请勿手改
// 数据：Natural Earth 1:50m geography regions polygons（public domain），
//       取 FEATURECLA = "Range/mtn" 的 %d 个要素，同名碎块合并为 %d 条山脉，
//       按 Douglas–Peucker 简化 %g°；输出为面（外环 + 洞），供球面铺山体阴影。
// 说明：为自然地理要素的粗略范围，不代表精确山脊线或高程，不含任何界线。
export const MOUNTAIN_RANGES = %s;
''' % (129, len(out), args.tol, json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    io.open(args.out, 'w', encoding='utf-8').write(js)
    print('山脉 %d 条，环 %d 个，点数 %d，%.1f KB' % (
        len(out), sum(len(r['polygons']) for r in out), pts, len(js.encode('utf-8')) / 1024))
    for r in out[:12]:
        print('  ', r['name'], r['en'], r['rank'], sum(plane_area(p[0]) for p in r['polygons']))


if __name__ == '__main__':
    main()
