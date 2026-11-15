# -*- coding: utf-8 -*-
"""把构建脚本生成的 geodata-*.js 内联进展览用的单文件 game.js。

构建脚本输出的是 ES module（export const），打包后的 game.js 里是
`  var NATURE_CONTINENTS = [...]` 形式的一行常量。本脚本按变量名定位那一行，
用新数据整行替换，其余代码不动。

用法：python splice_geodata.py  （在 构建脚本/ 目录下运行）
"""
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(HERE, '..', '原型', 'game.js')
SOURCES = [
    ('geodata-nature.js', ['NATURE_CONTINENTS', 'NATURE_SUBREGIONS']),
    ('geodata-climate.js', ['CLIMATE_BELTS', 'NATURE_CLIMATE']),
    ('geodata-rivers.js', ['RIVERS']),
    ('geodata-mountains.js', ['MOUNTAIN_RANGES']),
    ('geodata-currents.js', ['CURRENTS', 'PRESSURE_CENTERS']),
    ('geodata-countries.js', ['COUNTRIES']),
    ('geodata-thematic.js', ['THEMATIC_MOUNTAINS', 'THEMATIC_RIVERS', 'THEMATIC_CURRENTS',
                             'THEMATIC_SEAS', 'THEMATIC_BELTS', 'THEMATIC_PEAKS', 'THEMATIC_COUNTRIES']),
]
# 多行数组（原文件里是逐行手写的那种），整块替换成一行
BLOCKS = set()   # 数据已全部压成单行；若再遇到多行块再往里加


def read_const(path, name):
    s = io.open(path, encoding='utf-8').read()
    key = 'export const %s = ' % name
    i = s.index(key) + len(key)
    j = s.index(';\n', i)
    return s[i:j]


def main():
    lines = io.open(GAME, encoding='utf-8').read().split('\n')
    for fname, names in SOURCES:
        path = os.path.join(HERE, fname)
        for name in names:
            payload = read_const(path, name)
            json.loads(payload)                      # 校验：必须是合法 JSON
            pat = re.compile(r'^\s*var %s = ' % re.escape(name))
            idx = [i for i, l in enumerate(lines) if pat.match(l)]
            if len(idx) != 1:
                raise SystemExit('定位 %s 失败：命中 %d 行' % (name, len(idx)))
            start = idx[0]
            # 数据块可能是单行，也可能是多行 JSON（geodata-currents.js 保留了缩进）。
            # 统一从起始行向下找第一个以 `;` 结尾的行作为块尾，整段替换。
            # 早先只替换首行，多行数据会在第二次运行时残留旧内容。
            end = start
            while not lines[end].rstrip().endswith(';'):
                end += 1
                if end - start > 20000:
                    raise SystemExit('定位 %s 的结尾失败' % name)
            lines[start:end + 1] = ['  var %s = %s;' % (name, payload)]
            print('%-18s → 行 %d，%.1f KB' % (name, idx[0] + 1, len(payload.encode('utf-8')) / 1024))
    io.open(GAME, 'w', encoding='utf-8').write('\n'.join(lines))
    print('game.js  %.1f KB' % (os.path.getsize(GAME) / 1024))


if __name__ == '__main__':
    main()
