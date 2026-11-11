'use strict';

/**
 * 把《自然培育所》的游戏源码发布到 /naturelab/
 *
 * 为什么不在 source/ 下直接生成页面：
 *   source/自然培育所/ 是完整开发包（含 .bat、审计报告、tools/、19MB 单文件版），
 *   整个目录发布出去既浪费流量，也会把内部文档暴露到公网。
 *   _config.yml 里已 exclude 整个目录，这里只挑选真正要上线的 game/ 子目录。
 *
 * 产物：
 *   public/naturelab/index.html
 *   public/naturelab/css|js|assets/...
 *
 * 幂等：每次构建先删后拷，避免旧文件残留。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'source', '自然培育所', 'game');
const DEST = path.join(ROOT, 'public', 'naturelab');

function countFiles(dir) {
  let n = 0, bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(p);
      n += sub.n; bytes += sub.bytes;
    } else {
      n++; bytes += fs.statSync(p).size;
    }
  }
  return { n, bytes };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[naturelab] 找不到 source/自然培育所/game/，跳过');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(path.join(ROOT, 'public'))) {
    console.error('[naturelab] public/ 不存在，请先运行 hexo generate');
    process.exitCode = 1;
    return;
  }

  fs.rmSync(DEST, { recursive: true, force: true });
  fs.cpSync(SRC, DEST, { recursive: true });

  const { n, bytes } = countFiles(DEST);
  console.log('[naturelab] 已发布 %s 个文件（%s MB）到 /naturelab/', n, (bytes / 1048576).toFixed(1));
}

main();
