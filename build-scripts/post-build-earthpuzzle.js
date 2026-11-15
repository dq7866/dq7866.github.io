'use strict';

/**
 * 把《地球拼图 · 自然地理版》发布到 /earth-puzzle/
 *
 * 为什么单独做一步，而不是让 Hexo 直接复制 source/ 目录：
 *   1. source/地球拼图-自然地理版/ 是完整开发包：data/ 有 58MB 原始 geojson 与
 *      地形瓦片、截图/ 26MB、发布/ 5MB 单文件版、构建脚本/ 3.7MB。整目录上站
 *      既浪费流量，也会把内部工具与中间产物暴露到公网。
 *   2. 原型/ 下的源码把逻辑拆成 profiles.js → game.js → app-addons.js 三个脚本，
 *      顺序有依赖（app-addons 顶层要读 window.GPProfiles / window.GlobePuzzle）。
 *      访问门 post-build-works-guard.js 只会延迟「最后一个」本地脚本；若保留三份
 *      外链，另存副本仍能拿到主程序，门槛等于没做，且动态放行不保证执行顺序。
 *      所以线上版把三者按原顺序合并成单个 app.js：访问门延迟它一个即可，
 *      顺序由拼接保证，还少两次跨境请求。
 *   3. 访问门下主脚本要等 guard 校验通过才动态加载，而 <head> 的兜底计时从
 *      DOMContentLoaded 起算。线上跨境冷加载 5MB 可能超过 9 秒，因此把带
 *      data-wg-lazy 的场景放宽到 25 秒；本地源码版与单文件版仍是 9 秒。
 *
 * 运行时依赖（缺一不可）：
 *   index.html / style.css / app.js / assets/sponsor-qr.png / assets/og-cover.png
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'source', '地球拼图-自然地理版', '原型');
const DEST = path.join(ROOT, 'public', 'earth-puzzle');

const FILES = [
  'style.css',
  'assets/sponsor-qr.png',   // 赞赏弹窗收款码（单文件发布版另由 build_single.py 内联）
  'assets/og-cover.png',     // 1200×630 社交分享封面，页面本身不加载
];

// 顺序不可调整：档案命名空间 → 3D 引擎 → 发布级增强层
const SCRIPTS = ['profiles.js', 'game.js', 'app-addons.js'];

function copyOne(rel) {
  const s = path.join(SRC, rel);
  const d = path.join(DEST, rel);
  if (!fs.existsSync(s)) throw new Error('缺少运行时文件：' + rel);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.copyFileSync(s, d);
  return fs.statSync(d).size;
}

function buildBundle() {
  const parts = SCRIPTS.map((name) => {
    const p = path.join(SRC, name);
    if (!fs.existsSync(p)) throw new Error('缺少脚本：' + name);
    const code = fs.readFileSync(p, 'utf8');
    if (/<\/script/i.test(code)) throw new Error(name + ' 含 </script 字面量，不能直接合并');
    return '/* ---- 源：' + name + ' ---- */\n' + code;
  });
  return parts.join('\n;\n') + '\n';
}

function buildHtml() {
  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const head = /<script src="profiles\.js"><\/script>\s*/;
  const tail = /<script src="game\.js"><\/script>\s*<script src="app-addons\.js"><\/script>/;
  if ((html.match(head) || []).length !== 1) throw new Error('定位 profiles.js 引用失败');
  if ((html.match(tail) || []).length !== 1) throw new Error('定位 game.js / app-addons.js 引用失败');
  html = html.replace(head, '');
  html = html.replace(tail, '<script src="app.js"></script>');

  // 访问门延迟加载时放宽启动超时；无访问门的环境保持 9 秒
  const from = '}, 9000);';
  const to = "}, (document.querySelector('script[data-wg-lazy]') ? 25000 : 9000));";
  if (html.split(from).length !== 2) throw new Error('定位启动超时失败，index.html 结构可能已变');
  html = html.replace(from, to);

  if (/<script src="(profiles|game|app-addons)\.js">/.test(html)) throw new Error('仍有旧脚本外链');
  return html;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[earthpuzzle] 找不到 source/地球拼图-自然地理版/原型/，跳过');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(path.join(ROOT, 'public'))) {
    console.error('[earthpuzzle] public/ 不存在，请先运行 hexo generate');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(DEST, { recursive: true });
  let bytes = 0;
  for (const rel of FILES) bytes += copyOne(rel);

  const bundle = buildBundle();
  fs.writeFileSync(path.join(DEST, 'app.js'), bundle, 'utf8');
  bytes += Buffer.byteLength(bundle, 'utf8');

  const html = buildHtml();
  fs.writeFileSync(path.join(DEST, 'index.html'), html, 'utf8');
  bytes += Buffer.byteLength(html, 'utf8');

  // 兜底：若 _config.yml 的 exclude 对中文目录名未生效，Hexo 会把整个开发包
  // 复制成 public/地球拼图-自然地理版/，形成一个不带访问门的旁路入口。
  // 这里统一清掉，保证线上只有 /earth-puzzle/ 一个规范路径。
  const stray = path.join(ROOT, 'public', '地球拼图-自然地理版');
  if (fs.existsSync(stray)) {
    fs.rmSync(stray, { recursive: true, force: true });
    console.log('[earthpuzzle] 已清理 public/ 下的开发包副本（exclude 未生效的兜底）');
  }

  console.log('[earthpuzzle] 已发布 5 个运行时文件（%s MB）到 /earth-puzzle/，3 脚本已合并为 app.js',
    (bytes / 1048576).toFixed(2));
}

main();
