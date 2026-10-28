'use strict';

/**
 * 主站部署适配：给知识擂台前端注入子路径配置
 *
 * 源工程（source/parent-child-knowledge-game/public/）是「部署在根路径」写的，
 * 主站要把它挂在 /games/knowledge/ 下，所以要注入两个全局变量：
 *   window.KLT_API_BASE —— API 路径前缀（前端用它拼 /api/...）
 *   window.KLT_WS_PATH  —— WebSocket 路径前缀
 *
 * ⚠️ 注入位置很关键：必须早于 index.html 的主脚本。
 *    主脚本里 `const API_BASE = window.KLT_API_BASE || ''` 是在脚本加载时求值的，
 *    注入晚了就会拿到空字符串，请求会打到站点根路径的 /api/...（404）。
 *
 * 幂等：重复执行不会重复注入。
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'source', 'parent-child-knowledge-game', 'public');
const DEST = path.join(ROOT, 'source', 'games', 'knowledge');

const API_BASE = '/games/knowledge';

function injectConfig(html) {
  if (html.includes('window.KLT_API_BASE=')) {
    // 已注入过，替换掉旧值（路径可能变了）
    return html.replace(
      /<script>window\.KLT_API_BASE=[^<]*<\/script>\s*/,
      ''
    );
  }
  // 插到第一个 <script> 之前——那是主脚本的位置
  const marker = html.indexOf('<script>');
  if (marker < 0) return html;
  const tag = `<script>window.KLT_API_BASE="${API_BASE}";window.KLT_WS_PATH="${API_BASE}/ws";</script>\n`;
  return html.slice(0, marker) + tag + html.slice(marker);
}

function main() {
  if (!fs.existsSync(DEST)) {
    console.error('[game] source/games/knowledge/ 不存在，跳过');
    return;
  }

  // 1) 同步前端源码（主站版本 = 源工程 + 注入配置）
  for (const name of ['index.html', 'extra.js', 'study.js']) {
    const from = path.join(SRC, name);
    if (!fs.existsSync(from)) continue;
    let code = fs.readFileSync(from, 'utf8');
    if (name === 'index.html') code = injectConfig(code);
    fs.writeFileSync(path.join(DEST, name), code, 'utf8');
  }
  console.log('[game] 已同步前端到 source/games/knowledge/（API 基址 %s）', API_BASE);

  // 2) 后台管理界面不随站点发布——它有改题库、导出数据的接口
  const admin = path.join(DEST, 'admin.html');
  if (fs.existsSync(admin)) {
    fs.rmSync(admin);
    console.log('[game] 已移除 admin.html（后台管理界面不公开）');
  }
}

main();
