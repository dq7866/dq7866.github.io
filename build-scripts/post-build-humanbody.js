'use strict';

/**
 * 把《人体积木》的游戏源码发布到 /human-body/
 *
 * 为什么不在 source/ 下直接发布：
 *   source/human-body-bricks/ 是完整开发包，除了线上要用的运行时，
 *   还包含 assets/source/ 下的两个原始解剖数据集（16 MB）、tools/ 烘焙脚本、
 *   review/ 截图、src/ 与 7 MB 的单文件版。整目录上站既浪费流量，
 *   也会把内部工具与中间产物暴露到公网。_config.yml 已整目录 exclude，
 *   这里只挑运行时必需的几个文件。
 *
 * 运行时依赖（缺一不可）：
 *   index.html / game.js / style.css / assets/body.glb / assets/daily.glb / assets/body.meta.json / assets/sponsor-qr.png / assets/og-cover.png
 *   body.glb 是可拆可装的真实解剖模型，缺失时游戏会回退到程序化造型，
 *   因此这里把它列为必需项，缺了直接报错而不是静默降级。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'source', 'human-body-bricks');
const DEST = path.join(ROOT, 'public', 'human-body');

const FILES = [
  'index.html',
  'game.js',
  'style.css',
  'assets/body.glb',
  'assets/daily.glb',
  'assets/body.meta.json',
  'assets/sponsor-qr.png',   // 赞赏弹窗的收款码（单文件版另由 build_single.py 内联）
  'assets/og-cover.png',     // 社交分享封面（og:image，页面本身不加载它）
];

function copyOne(rel) {
  const s = path.join(SRC, rel);
  const d = path.join(DEST, rel);
  if (!fs.existsSync(s)) throw new Error('缺少运行时文件：' + rel);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.copyFileSync(s, d);
  return fs.statSync(d).size;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[humanbody] 找不到 source/human-body-bricks/，跳过');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(path.join(ROOT, 'public'))) {
    console.error('[humanbody] public/ 不存在，请先运行 hexo generate');
    process.exitCode = 1;
    return;
  }

  let bytes = 0;
  for (const rel of FILES) bytes += copyOne(rel);
  console.log('[humanbody] 已发布 %s 个文件（%s MB）到 /human-body/', FILES.length, (bytes / 1048576).toFixed(2));
}

main();
