'use strict';

/**
 * 全站搜索索引生成
 *
 * 为什么自己写：
 *   Butterfly 的 local_search 只索引 Hexo 文章，而本站只有 2 篇文章，
 *   真正的内容是 130+ 个独立静态页面（edu 43 / games 27 / toolbox 30 / forest 21 …）。
 *   那些页面不在 Hexo 的文章体系里，任何主题的内置搜索都搜不到。
 *
 * 做法：
 *   hexo generate 之后扫 public/ 下的 HTML，提取标题/描述/小标题/正文摘要，
 *   输出 public/search-index.json。前端 /site-search.js 拉这份索引做本地检索。
 *
 * 体积控制：
 *   每页正文摘要截断到 180 字，整份索引预计 80–120 KB（gzip 后约 30 KB）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_FILE = path.join(PUBLIC_DIR, 'search-index.json');

/** 不参与搜索的路径（相对 public/） */
const SKIP_DIRS = [
  'admin',            // 站长后台，不该被搜到
  'assets', 'img', 'images', 'audio', 'videos', 'zhz',
  'js', 'css', 'fonts',
  'parent-child-knowledge-game',   // 被 exclude，理论上不存在，双保险
  'forest/assets', 'forest/object-extraction-result',
  'games/knowledge',  // SPA，内容不在静态 HTML 里
];

/** 不参与搜索的单页 */
const SKIP_FILES = ['404.html', 'login-test.html'];

const MAX_BODY = 180;      // 每页正文摘要字数
const MAX_ITEMS = 400;     // 索引条目上限，防失控

function shouldSkip(relPath) {
  if (SKIP_FILES.includes(relPath)) return true;
  const norm = relPath.split(path.sep).join('/');
  return SKIP_DIRS.some(d => norm === d || norm.startsWith(d + '/'));
}

/** 去掉标签、压缩空白、解码常见实体 */
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function pick(html, re) {
  const m = html.match(re);
  return m ? stripHtml(m[1]) : '';
}

function extract(html) {
  const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = pick(html, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i)
    || pick(html, /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i);
  const h1 = pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  // 小标题拼起来当关键词，命中率比正文高
  const heads = [];
  const hRe = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let m;
  while ((m = hRe.exec(html)) && heads.length < 8) {
    const t = stripHtml(m[1]);
    if (t && t.length <= 40) heads.push(t);
  }
  // 正文：去掉导航/页脚噪音后取开头
  const body = stripHtml(
    html.replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<header[\s\S]*?<\/header>/gi, ' ')
  ).slice(0, MAX_BODY * 2);

  return { title, desc, h1, heads, body };
}

/** 文件相对路径 → 站点 URL */
function toUrl(relPath) {
  let u = '/' + relPath.split(path.sep).join('/');
  u = u.replace(/\/index\.html$/, '/');
  return u;
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(PUBLIC_DIR, full);
    if (e.isDirectory()) {
      if (shouldSkip(rel)) continue;
      walk(full, out);
    } else if (e.isFile() && e.name.endsWith('.html')) {
      if (shouldSkip(rel)) continue;
      out.push(rel);
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error('[search] public/ 不存在，请先运行 hexo generate');
    process.exitCode = 1;
    return;
  }

  const files = walk(PUBLIC_DIR);
  const items = [];

  for (const rel of files) {
    if (items.length >= MAX_ITEMS) break;
    let html;
    try {
      html = fs.readFileSync(path.join(PUBLIC_DIR, rel), 'utf8');
    } catch {
      continue;
    }
    if (html.length < 200) continue;   // 空壳页跳过

    const { title, desc, h1, heads, body } = extract(html);
    const name = title || h1 || toUrl(rel);
    const summary = desc || h1 || body.slice(0, MAX_BODY);

    if (!name && !summary) continue;

    items.push({
      u: toUrl(rel),
      t: name.replace(/^知作坊\s*[·｜|]\s*/, '').trim() || toUrl(rel),
      d: summary.slice(0, MAX_BODY),
      k: heads.join(' '),        // 小标题，用于提高命中率
    });
  }

  // 文章排前面（访客更常找文章与教育内容）
  const rank = u => {
    if (u.startsWith('/20')) return 0;          // /2026/xx/xx/slug
    if (u.startsWith('/edu/')) return 1;
    if (u.startsWith('/games/')) return 2;
    if (u.startsWith('/toolbox/')) return 3;
    if (u === '/') return 4;
    return 5;
  };
  items.sort((a, b) => rank(a.u) - rank(b.u) || a.u.localeCompare(b.u));

  const payload = { v: 1, n: items.length, items };
  const json = JSON.stringify(payload);
  fs.writeFileSync(OUT_FILE, json, 'utf8');

  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log('[search] 索引已生成：%s 条 · %s KB → public/search-index.json', items.length, kb);
}

main();
