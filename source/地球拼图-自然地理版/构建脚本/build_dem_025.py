# -*- coding: utf-8 -*-
"""把 Mapzen terrarium z=4 瓦片（AWS Terrain Tiles，公有领域）重采样为
0.25° 等经纬全球高程格网，极区（|lat| > 85.05°，墨卡托缺失）用现有 1°
dem-grid.js 数据填充，再按非线性断点表量化成 1 字节/点，输出 dem-grid.js。

用法：python build_dem_025.py   （在 构建脚本/ 目录下运行；需联网下载瓦片，
瓦片缓存在 data/terrarium/，已下载的不会重复下载）
"""
import base64
import io
import json
import math
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
TILE_DIR = os.path.join(DATA, 'terrarium')
OUT = os.path.join(HERE, 'dem-grid.js')
OLD_GRID = os.path.join(HERE, 'dem-grid.js')  # 下载前读取旧 1° 数据

Z = 4                      # 16x16 瓦片，总 4096x4096 墨卡托像素
TILE_PX = 256
W = 1440                   # 输出列数（0.25°）
H = 721                    # 输出行数（纬度中心 -90..90 步长 0.25）
MERC_MAX = 85.05112877980659

# 量化断点表：[米, 量化值]，线性插值。海岸带与浅海加密，与教学地球仪同思路。
Q = [
    [-11000, 0], [-9000, 10], [-8000, 20], [-7000, 32], [-6000, 44],
    [-5000, 58], [-4000, 74], [-3000, 92], [-2500, 104], [-2000, 117],
    [-1500, 130], [-1000, 142], [-600, 152], [-300, 160], [-200, 165],
    [-100, 170], [-50, 174], [-20, 178], [0, 183],
    [50, 188], [100, 193], [200, 200], [300, 207], [500, 216],
    [750, 224], [1000, 230], [1500, 237], [2000, 242], [2500, 246],
    [3000, 249], [4000, 252], [5000, 253], [6000, 254], [8848, 255],
]


def m2q(m):
    if m <= Q[0][0]:
        return Q[0][1]
    for i in range(len(Q) - 1):
        m0, q0 = Q[i]
        m1, q1 = Q[i + 1]
        if m0 <= m < m1:
            return round(q0 + (q1 - q0) * (m - m0) / (m1 - m0))
    return Q[-1][1]


def q2m(q):
    QL = Q
    if q <= QL[0][1]:
        return QL[0][0]
    for i in range(len(QL) - 1):
        m0, q0 = QL[i]
        m1, q1 = QL[i + 1]
        if q0 <= q < q1:
            return m0 + (m1 - m0) * (q - q0) / (q1 - q0)
    return QL[-1][0]


def tile_path(z, x, y):
    return os.path.join(TILE_DIR, '%d_%d_%d.png' % (z, x, y))


def fetch_tile(z, x, y):
    p = tile_path(z, x, y)
    if os.path.exists(p) and os.path.getsize(p) > 500:
        return p
    url = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png' % (z, x, y)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'globe-puzzle/1.0'})
            with urllib.request.urlopen(req, timeout=45) as r:
                data = r.read()
            with open(p, 'wb') as f:
                f.write(data)
            return p
        except Exception as e:
            if attempt == 2:
                raise
    return p


def load_merc_grid():
    """下载全部瓦片并拼成 (4096, 4096) float32 墨卡托高程（米）。"""
    os.makedirs(TILE_DIR, exist_ok=True)
    n = 1 << Z
    jobs = [(x, y) for y in range(n) for x in range(n)]
    print('下载 %d 块 terrarium z=%d 瓦片…' % (len(jobs), Z))
    with ThreadPoolExecutor(max_workers=12) as ex:
        paths = list(ex.map(lambda j: fetch_tile(Z, j[0], j[1]), jobs))
    grid = [[None] * (n * TILE_PX) for _ in range(n * TILE_PX)]
    import numpy  # noqa
    full = numpy.zeros((n * TILE_PX, n * TILE_PX), dtype=numpy.float32)
    for (x, y), p in zip(jobs, paths):
        im = Image.open(p)
        if im.mode != 'RGB':
            im = im.convert('RGB')
        a = numpy.asarray(im, dtype=numpy.uint16)
        elev = (a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256.0) - 32768.0
        full[y * TILE_PX:(y + 1) * TILE_PX, x * TILE_PX:(x + 1) * TILE_PX] = elev
    return full


def load_old_grid():
    """读旧 dem-grid.js 的 1° Int16 数据，作极区填充（宽松正则，忽略注释）。"""
    src = io.open(OLD_GRID, encoding='utf-8').read()
    obj = {}
    for key in ('width', 'height', 'lon0', 'lat0', 'dlon', 'dlat'):
        obj[key] = float(re.search(r'%s:\s*(-?[\d.]+)' % key, src).group(1))
        if key in ('width', 'height'):
            obj[key] = int(obj[key])
    mb = re.search(r'b64:\s*`([^`]*)`', src, re.S)
    b64 = mb.group(1).replace('\n', '').replace(' ', '')
    bin_ = base64.b64decode(b64)
    import numpy
    data = numpy.frombuffer(bin_, dtype='<i2')
    return data.reshape(obj['height'], obj['width']), obj


def main():
    import numpy

    merc = load_merc_grid()
    print('墨卡托网格:', merc.shape)

    def merc_y(lat):
        cl = max(-MERC_MAX, min(MERC_MAX, lat))
        return (1 - math.log(math.tan(math.radians(cl)) +
                             1 / math.cos(math.radians(cl))) / math.pi) / 2

    # y 像素查表（每 0.01° 一项）
    ys = [merc_y(-90 + i * 0.01) * merc.shape[0] for i in range(18001)]

    out = numpy.zeros((H, W), dtype=numpy.float32)
    for row in range(H):
        lat = -90 + row * 0.25
        if abs(lat) > MERC_MAX:
            continue  # 稍后用旧 1° 数据填
        fy = merc_y(lat) * merc.shape[0]
        y0 = min(int(fy), merc.shape[0] - 2)
        t = fy - y0
        row_a = merc[y0]
        row_b = merc[y0 + 1]
        for col in range(W):
            lon = -180 + col * 0.25
            fx = (lon + 180) / 360 * merc.shape[1]
            x0 = min(int(fx), merc.shape[1] - 2)
            tx = fx - x0
            a = row_a[x0] * (1 - tx) + row_a[x0 + 1] * tx
            b = row_b[x0] * (1 - tx) + row_b[x0 + 1] * tx
            out[row, col] = a * (1 - t) + b * t
        if row % 120 == 0:
            print('  行 %d/%d' % (row, H))

    old, oldobj = load_old_grid()
    oH, oW = oldobj['height'], oldobj['width']
    for row in range(H):
        lat = -90 + row * 0.25
        if abs(lat) <= MERC_MAX:
            continue
        oy = min(oH - 1, max(0, int(round((lat - oldobj['lat0']) / oldobj['dlat']))))
        for col in range(W):
            lon = -180 + col * 0.25
            ox = int(round((lon - oldobj['lon0']) / oldobj['dlon'])) % oW
            out[row, col] = old[oy, ox]
    print('极区 %d 行已用 1° 数据填充' % (2 * round((90 - MERC_MAX) / 0.25)))

    bytes_out = bytearray(W * H)
    k = 0
    for row in range(H):
        for col in range(W):
            bytes_out[k] = m2q(out[row, col])
            k += 1
    b64 = base64.b64encode(bytes(bytes_out)).decode('ascii')

    txt = '''// 0.25° 全球高程格网：Mapzen terrarium z=4（AWS Terrain Tiles，公有领域）
// 极区 |lat|>85.05° 由原 ETOPO 1° 格网填充；1 字节非线性量化（断点见 q）。
// 生成：构建脚本/build_dem_025.py（本文件为产物，勿手改）
export const DEM = {
  width: %d,
  height: %d,
  lon0: -180.0,
  lat0: -90.0,
  dlon: 0.25,
  dlat: 0.25,
  q: %s,
  b64: `%s`
};
''' % (W, H, json.dumps(Q, ensure_ascii=False), '\n'.join(
        b64[i:i + 120] for i in range(0, len(b64), 120)))
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(txt)
    print('写出 %s（b64 %d 字符）' % (OUT, len(b64)))

    # 抽样校验：珠峰 / 马里亚纳 / 撒哈拉 / 上海
    for name, lon, lat in [('珠峰', 86.925, 27.988), ('马里亚纳', 142.2, 11.35),
                           ('撒哈拉', 15, 23), ('上海', 121.47, 31.23),
                           ('极点', 0, -89)]:
        col = int((lon + 180) / 0.25) % W
        row = min(H - 1, max(0, int((lat + 90) / 0.25)))
        print('  %-6s %.2f,%.2f -> %.0f m' % (name, lon, lat, out[row, col]))


if __name__ == '__main__':
    main()
