# -*- coding: utf-8 -*-
"""把 dem-grid.js（ES module）内联成 game.js 里的 `var DEM = {...}` 多行块。

DEM 块与 geodata 不同：它是多行对象（b64 模板字符串折行），所以不能按「单行常量」
整行替换，得按起止标记整块换掉。

用法：python splice_dem.py   （在 构建脚本/ 目录下运行）
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(HERE, '..', '原型', 'game.js')
SRC = os.path.join(HERE, 'dem-grid.js')

START = '  var DEM = {'
END = '  };'


def main():
    src = io.open(SRC, encoding='utf-8').read()
    assert 'export const DEM' in src, 'dem-grid.js 里没有 export const DEM'
    block = src.replace('export const DEM', 'var DEM').rstrip('\n')
    lines = [('  ' + ln) if ln else ln for ln in block.split('\n')]

    game = io.open(GAME, encoding='utf-8').read().split('\n')
    starts = [i for i, ln in enumerate(game) if ln == START]
    if len(starts) != 1:
        raise SystemExit('定位 DEM 起始失败：命中 %d 行' % len(starts))
    start = starts[0]
    end = start
    while game[end].rstrip() != END:
        end += 1
        if end - start > 6000:
            raise SystemExit('定位 DEM 结尾失败')

    game[start:end + 1] = lines
    io.open(GAME, 'w', encoding='utf-8').write('\n'.join(game))
    print('DEM 块 → 行 %d..%d 替换为 %d 行，%.1f KB'
          % (start + 1, end + 1, len(lines), len('\n'.join(lines).encode('utf-8')) / 1024))
    print('game.js  %.1f KB' % (os.path.getsize(GAME) / 1024))


if __name__ == '__main__':
    main()
