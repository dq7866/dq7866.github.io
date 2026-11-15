# -*- coding: utf-8 -*-
"""从 Natural Earth 河流中心线生成「专题图层 · 河流」的真实数据。

v1.8 起改用 1:10m 精度（比 1:50m 细约 5 倍，河道弯曲不再被拉直）：
  ne_10m_rivers_lake_centerlines.geojson（Natural Earth，公有领域）
只保留 featurecla = River（不含湖心线），按 scalerank 与长度筛选后做
Douglas–Peucker 简化；每条附带宽度档 w（1 支流 / 2 二级 / 3 干流），
前端按档画不同粗细的三角带——WebGL 的线宽恒为 1px，只能靠带子做粗细。

用法：python build_rivers.py --src data/ne_10m_rivers.geojson --out geodata-rivers.js
"""

import argparse
import io
import json
import math


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


def length(pts):
    return sum(math.hypot(pts[i + 1][0] - pts[i][0],
                          (pts[i + 1][1] - pts[i][1]) * math.cos(math.radians((pts[i][1] + pts[i + 1][1]) / 2)))
               for i in range(len(pts) - 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='data/ne_50m_rivers.geojson')
    ap.add_argument('--out', default='geodata-rivers.js')
    ap.add_argument('--tol', type=float, default=0.12)
    ap.add_argument('--max-rank', type=int, default=8)
    ap.add_argument('--min-length', type=float, default=1.2, help='总长小于该值（度）的支流丢弃')
    args = ap.parse_args()

    data = json.load(io.open(args.src, encoding='utf-8'))
    out = []
    for f in data['features']:
        p = f['properties']
        if p.get('featurecla') != 'River':
            continue
        if (p.get('scalerank') or 99) > args.max_rank:
            continue
        g = f['geometry']
        parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
        for part in parts:
            pts = [(round(x, 2), round(y, 2)) for x, y in part]
            pts = [pts[0]] + [q for i, q in enumerate(pts[1:], 1) if q != pts[i - 1]]
            if len(pts) < 2 or length(pts) < args.min_length:
                continue
            pts = dp(pts, args.tol)
            if len(pts) < 2:
                continue
            rank = p.get('scalerank') or 9
            tier = 3 if rank <= 3 else (2 if rank <= 6 else 1)
            out.append({'name': p.get('name') or '', 'w': tier,
                        'path': [[x, y] for x, y in pts]})

    out.sort(key=lambda r: -length([tuple(v) for v in r['path']]))
    js = '''// 河流中心线 —— 自动生成，请勿手改
// 数据：Natural Earth 1:10m rivers + lake centerlines（public domain），
//       仅取 featurecla=River，按 scalerank 与总长筛选，Douglas–Peucker 简化 %g°；
//       w=3 干流 / 2 二级 / 1 支流（按 scalerank 分档）。
// 说明：为示意性自然要素，不表示精确河宽与岸线，不作为地理依据；不含任何界线。
export const RIVERS = %s;
''' % (args.tol, json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    io.open(args.out, 'w', encoding='utf-8').write(js)
    print('河流 %d 条，点数 %d，%.1f KB' % (
        len(out), sum(len(r['path']) for r in out), len(js.encode('utf-8')) / 1024))


if __name__ == '__main__':
    main()
