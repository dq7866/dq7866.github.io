'use strict';

/**
 * Pages Worker（高级模式）落地
 *
 * Pages 的 Git 集成部署有两条路：
 *   1. functions/ 目录  —— 只在 wrangler pages dev 本地预览时用
 *   2. 输出目录里的 _worker.js —— Git 集成部署时真正生效的方式
 *
 * 主项目走的是 Git 集成（构建命令 npm ci --omit=dev && npm run build），
 * 所以必须把 _worker.js 落到 public/ 里，Pages 才会启用高级模式。
 *
 * ⚠️ 安全要点：题库含每道题的 correct 字段，绝不能作为独立文件放进 public/，
 *    否则任何人都能下载题库、直接看答案。
 *    这里用 esbuild 打包 —— 题库以 JSON import 的形式被内联进单个 JS 文件，
 *    public/ 下不留任何题库文件。
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'source', 'parent-child-knowledge-game', 'cloudflare');

async function main() {
  if (!fs.existsSync(OUT)) {
    console.error('[worker] public/ 不存在，跳过');
    return;
  }
  if (!fs.existsSync(path.join(SRC, 'bank', 'questions.json'))) {
    console.error('[worker] 题库不存在，跳过：', path.join(SRC, 'bank', 'questions.json'));
    process.exitCode = 1;
    return;
  }

  const esbuild = require('esbuild');
  const outfile = path.join(OUT, '_worker.js');

  await esbuild.build({
    entryPoints: [path.join(SRC, 'pages-worker.js')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile,
    legalComments: 'none',
    logLevel: 'warning',
  });

  // 清理上一次可能残留的 _worker/ 目录（里面有可下载的题库）
  const stale = path.join(OUT, '_worker');
  if (fs.existsSync(stale)) {
    fs.rmSync(stale, { recursive: true, force: true });
  }

  const kb = (fs.statSync(outfile).size / 1024).toFixed(0);
  console.log('[worker] 已生成 public/_worker.js（Pages 高级模式，题库已内联，%s KB）', kb);
}

main().catch(err => {
  console.error('[worker] 构建失败：', err.message);
  process.exitCode = 1;
});
