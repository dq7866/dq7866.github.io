'use strict';

/**
 * 把《敲散》的游戏源码发布到 /qiaosan/
 *
 * source/敲散/ 是完整开发包（含单文件版、Electron 壳、启动脚本、文档），
 * 这些不随站点发布；只复制真正上线的 src/ 目录。
 *
 * 产物：
 *   public/qiaosan/index.html
 *   public/qiaosan/styles.css
 *   public/qiaosan/profile.js
 *   public/qiaosan/app.js
 *
 * 幂等：每次构建先删后拷。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'source', '敲散', 'src');
const DEST = path.join(ROOT, 'public', 'qiaosan');

function countFiles(dir) {
  let n = 0, bytes = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const s = countFiles(p); n += s.n; bytes += s.bytes; }
    else { n++; bytes += fs.statSync(p).size; }
  }
  return { n, bytes };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[qiaosan] 找不到 source/敲散/src/，跳过');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(path.join(ROOT, 'public'))) {
    console.error('[qiaosan] public/ 不存在，请先运行 hexo generate');
    process.exitCode = 1;
    return;
  }
  fs.rmSync(DEST, { recursive: true, force: true });
  fs.cpSync(SRC, DEST, { recursive: true, filter: src => !path.basename(src).startsWith('.') });
  const { n, bytes } = countFiles(DEST);
  console.log('[qiaosan] 已发布 %s 个文件（%s KB）到 /qiaosan/', n, (bytes / 1024).toFixed(1));
}

main();
