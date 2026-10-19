/* global hexo */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Hexo 自定义部署器：把 public 目录直接上传到 Cloudflare Pages
// 用法（_config.yml）：
// deploy:
//   - type: cloudflare
//     project: dq7866
//     branch: main
//     dir: public

function findNode() {
  const exec = process.execPath;
  const base = path.basename(exec).toLowerCase();
  if (base === 'node.exe' || base === 'node') return exec;

  // 在 LobsterAI 等宿主里 process.execPath 可能不是真正的 node，
  // 回退到常见安装路径，避免 wrangler 的 argv 被宿主改写。
  const candidates = [
    process.env.NODE_EXE,
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'node';
}

function runOnce(nodeExe, cliArgs, baseDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeExe, cliArgs, { cwd: baseDir, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error('wrangler 退出码 ' + code));
    });
  });
}

module.exports = function (args) {
  const baseDir = this.base_dir;
  const project = args.project || 'dq7866';
  const branch = args.branch || 'main';
  const dir = args.dir || 'public';
  const cli = path.join(baseDir, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js');

  if (!fs.existsSync(cli)) {
    return Promise.reject(new Error('找不到 wrangler，请先在项目目录执行 npm install'));
  }

  const nodeExe = findNode();
  const cliArgs = [
    cli, 'pages', 'deploy', dir,
    '--project-name', project,
    '--branch', branch,
    '--commit-dirty=true'
  ];

  hexo.log.info('Deploying to Cloudflare Pages: %s (branch: %s)', project, branch);

  // 国内到 Cloudflare API 偶发 fetch failed，失败后自动重试一次
  return runOnce(nodeExe, cliArgs, baseDir).catch(err => {
    hexo.log.warn('Cloudflare 部署失败，5 秒后重试一次：%s', err.message);
    return new Promise(resolve => setTimeout(resolve, 5000))
      .then(() => runOnce(nodeExe, cliArgs, baseDir));
  });
};

hexo.extend.deployer.register('cloudflare', module.exports);
