# -*- coding: utf-8 -*-
"""最小 netCDF3 (CDF-1) 解析器 + 生成 globe-puzzle 的 dem-grid.js

用途：把 NOAA ETOPO（ERDDAP 抽样的 1° 全球高程）转成前端可直接用的紧凑网格。

仅支持 classic 格式（big-endian，32/16/8 位数值），够用即可。

用法（两步，均需联网）：
    # 1) 取 1° 全球格网（etopo360 原始 1' 网格，按 60 点抽样）
    curl -s "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo360.nc\
?altitude%5B0:60:10799%5D%5B0:60:21599%5D" -o etopo1.nc
    # 2) 转前端网格
    python tools/build_dem.py etopo1.nc src/dem-grid.js

注意：ERDDAP 会 429 限流（等 40s 再试）；大子集用 .csv 会被截断，.nc 更稳（约 138 KB）。
"""
import base64
import struct
import sys

NC_BYTE, NC_CHAR, NC_SHORT, NC_INT, NC_FLOAT, NC_DOUBLE = 1, 2, 3, 4, 5, 6
SIZES = {NC_BYTE: ('b', 1), NC_CHAR: ('c', 1), NC_SHORT: ('h', 2), NC_INT: ('i', 4),
         NC_FLOAT: ('f', 4), NC_DOUBLE: ('d', 8)}


class Reader:
    def __init__(self, buf):
        self.b = buf
        self.p = 0

    def u32(self):
        v = struct.unpack_from('>I', self.b, self.p)[0]
        self.p += 4
        return v

    def name(self):
        n = self.u32()
        s = self.b[self.p:self.p + n].decode('utf-8', 'replace')
        self.p += n
        self.p += (-n) % 4  # 4 字节对齐
        return s


def parse(path):
    buf = open(path, 'rb').read()
    assert buf[:3] == b'CDF', 'not netCDF'
    version = buf[3]
    assert version == 1, 'only CDF-1 supported, got %d' % version
    r = Reader(buf)
    r.p = 4
    numrecs = r.u32()
    r.u32()  # tag NC_DIMENSION (0x0A)
    ndims = r.u32()
    dims = []
    for _ in range(ndims):
        name = r.name()
        size = r.u32()
        dims.append((name, size if size != 0 else numrecs))
    # 全局属性
    r.u32()  # tag NC_ATTRIBUTE
    nag = r.u32()
    for _ in range(nag):
        r.name()
        t = r.u32()
        n = r.u32()
        r.p += SIZES[t][1] * n
        r.p += (-SIZES[t][1] * n) % 4
    r.u32()  # tag NC_VARIABLE
    nvars = r.u32()
    variables = []
    for _ in range(nvars):
        name = r.name()
        nd = r.u32()
        dimids = [r.u32() for _ in range(nd)]
        r.u32()  # tag NC_ATTRIBUTE (变量的属性表)
        nva = r.u32()
        for _ in range(nva):
            r.name()
            t = r.u32()
            n = r.u32()
            r.p += SIZES[t][1] * n
            r.p += (-SIZES[t][1] * n) % 4
        typ = r.u32()
        vsize = r.u32()
        begin = r.u32()
        variables.append({'name': name, 'dimids': dimids, 'type': typ,
                          'vsize': vsize, 'begin': begin})
    out = {}
    for v in variables:
        shape = [dims[i][1] for i in v['dimids']]
        fmt, esz = SIZES[v['type']]
        count = 1
        for s in shape:
            count *= s
        raw = buf[v['begin']:v['begin'] + esz * count]
        vals = struct.unpack('>%d%s' % (count, fmt), raw)
        out[v['name']] = (shape, list(vals))
    return dims, out


def main(path, out_js):
    dims, data = parse(path)
    shape, alt = data['altitude']
    lat = data['latitude'][1]
    lon = data['longitude'][1]
    H, W = shape
    print('grid %dx%d  lat[%s..%s] lon[%s..%s]' % (H, W, lat[0], lat[-1], lon[0], lon[-1]))
    print('alt min %d max %d' % (min(alt), max(alt)))

    # 转 int16，单位米。
    # 陆上用正值；海里保留真实水深（原来的 -500 截断会把大陆架 / 洋盆 / 海沟压成同一深度，
    # 海洋深浅分层就没法做了）。球面几何对海面只取「是否为负」，所以放开下限不影响陆地起伏。
    vals = []
    for v in alt:
        iv = int(round(v))
        iv = max(-11000, min(8848, iv))
        vals.append(iv)

    packed = struct.pack('<%dh' % len(vals), *vals)  # little-endian，前端直接按 Int16 读
    b64 = base64.b64encode(packed).decode('ascii')

    lat0 = lat[0]
    lon0 = lon[0]
    dlat = (lat[-1] - lat[0]) / (H - 1)
    dlon = (lon[-1] - lon[0]) / (W - 1)

    js = []
    js.append('// 真实地形高程网格（NOAA ETOPO，经 ERDDAP 抽稀为 1°×1° 全球格网）\n')
    js.append('//\n')
    js.append('// 数据来源：NOAA National Centers for Environmental Information (NCEI), ETOPO 全球地形起伏模型，\n')
    js.append('//           公有领域（U.S. Government work），经 NOAA CoastWatch ERDDAP `etopo360` 数据集按 60 点抽样获得。\n')
    js.append('// 用途：为球面壳片提供真实海拔起伏（米），替代此前的程序化示意山脊。\n')
    js.append('// 说明：1° 网格为全球一致的概略地形，用于观感与「地形大势」科普，不作高程量算依据；\n')
    js.append('//       实际生产级地形需更高分辨率 DEM（如 30 m SRTM / 1:5 万 DEM）并单独说明数据源。\n')
    js.append('// 生成：tools/build_dem.py（本文件为产物，勿手改）\n')
    js.append('\n')
    js.append('export const DEM = {\n')
    js.append("  width: %d,          // 经向格点数\n" % W)
    js.append("  height: %d,         // 纬向格点数\n" % H)
    js.append("  lon0: %s,         // 首列中心经度（自西向东递增，0..360）\n" % lon0)
    js.append("  lat0: %s,         // 首行中心纬度（自南向北递增，-90 起）\n" % lat[0])
    js.append("  dlon: %s,        // 经向步长（度，东向为正）\n" % round(dlon, 6))
    js.append("  dlat: %s,        // 纬向步长（度，北向为正）\n" % round(dlat, 6))
    js.append('  b64: `\n')
    # 每 96 字符换行，避免单行过长拖慢编辑器
    for i in range(0, len(b64), 96):
        js.append(b64[i:i + 96] + '\n')
    js.append("`,\n};\n")
    open(out_js, 'w', encoding='utf-8').write(''.join(js))
    print('wrote %s  (%.1f KB)' % (out_js, len(''.join(js)) / 1024))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
