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
 * 幂等：采用覆盖式复制（同名文件直接覆盖），不做整目录删除。
 *   原先"先 rmSync 整个目录再拷"会一次删掉 200+ 文件，本机安全删除保护
 *   会直接拦下（SAFE_DELETE_BULK_CONFIRM_REQUIRED），npm run build 后半条链
 *   就全断了。线上 Cloudflare 每次全新 clone，public 本来就是干净的，
 *   覆盖式复制没有任何副作用；本地若想清掉残留文件，手动删一次目录即可。
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

/** 逐文件复制：不用 fs.cpSync 一次性搬 200+ 文件。
 *  Windows 下批量复制容易触发 EMFILE / 句柄占用，本机实测 cpSync 会静默中断
 *  （进程退出 127、没有任何报错），导致 npm run build 后半条链全部不执行。
 *  改成同步逐个复制，每步都是独立小操作，日志也更可控。
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
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

  copyDir(SRC, DEST);   // 覆盖同名文件，不整目录删除

  const { n, bytes } = countFiles(DEST);
  console.log('[naturelab] 已发布 %s 个文件（%s MB）到 /naturelab/', n, (bytes / 1048576).toFixed(1));
}

main();
