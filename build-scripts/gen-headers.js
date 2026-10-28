'use strict';

/**
 * 生成 Cloudflare Pages 的 _headers 文件
 *
 * 为什么需要：
 *   实测线上所有资源都是 `Cache-Control: public, max-age=0, must-revalidate`，
 *   而请求被路由到 LAX（洛杉矶）节点 —— 每个资源每次访问都要付 1.3–2 秒跨境
 *   TTFB 去回源验证。首页 DOM 就绪 3.1 秒主要就是这么来的，跟文件大小无关
 *   （pjax.min.js 17KB、site-search.js 12KB，传输只占 0.01–0.2 秒）。
 *
 * 策略：
 *   - 主题/第三方资源带 ?v= 版本号 → 1 年 immutable，升级时版本号变自然失效
 *   - 图片/音频/视频 → 30 天，forest 音频属于不变内容，给 1 年
 *   - 本站会变的脚本（site-search.js / zhz/*）→ 1 小时，兼顾更新与回源
 *   - HTML 保持 max-age=0，保证发文后立刻可见
 *
 * 注意：hexo 会忽略 source/ 下以 _ 开头的文件，所以 _headers 不能放 source/，
 *       必须在构建后直接写进输出目录。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', '_headers');

const RULES = `# 由 build-scripts/gen-headers.js 生成，请勿手改
# Cloudflare Pages _headers 语法：路径模式 + 缩进两条空格的响应头

# ---- 全局安全响应头（对所有路径生效）----
# HSTS：本域名未做 ICP 备案，走 http:// 有被运营商劫持插广告的实际风险，
#   劫持注入的内容反过来会让浏览器安全库把整站判定为"风险内容"。
#   已实测 http 会 301 到 https，这里让浏览器记住，连第一次明文请求都不发。
#   只给 30 天、不加 includeSubDomains / preload —— 以后换域名或换托管能退得回来。
/*
  Strict-Transport-Security: max-age=2592000
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

# ---- HTML：始终回源，保证发文后立刻可见 ----
/*.html
  Cache-Control: public, max-age=0, must-revalidate

# ---- 主题与第三方资源（引用时带 ?v=版本号，可永久缓存）----
/js/*
  Cache-Control: public, max-age=31536000, immutable
/css/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable

# ---- 本站会变的脚本与样式：1 小时 ----
/site-search.js
  Cache-Control: public, max-age=3600
/zhz/*
  Cache-Control: public, max-age=3600
/stats.js
  Cache-Control: public, max-age=3600
/site-cards.js
  Cache-Control: public, max-age=3600
/ads.js
  Cache-Control: public, max-age=3600
/gate.js
  Cache-Control: public, max-age=3600

# ---- forest 音频与视频：内容不变，给 1 年（604MB 的主要包袱）----
/forest/assets/audio/*
  Cache-Control: public, max-age=31536000, immutable
/forest/assets/videos/*
  Cache-Control: public, max-age=31536000, immutable
/forest/assets/models/*
  Cache-Control: public, max-age=31536000, immutable

# ---- 其余静态资源：30 天 ----
/forest/assets/*
  Cache-Control: public, max-age=2592000
/img/*
  Cache-Control: public, max-age=2592000
/images/*
  Cache-Control: public, max-age=2592000
/audio/*
  Cache-Control: public, max-age=2592000
*.png
  Cache-Control: public, max-age=2592000
*.jpg
  Cache-Control: public, max-age=2592000
*.jpeg
  Cache-Control: public, max-age=2592000
*.webp
  Cache-Control: public, max-age=2592000
*.gif
  Cache-Control: public, max-age=2592000
*.svg
  Cache-Control: public, max-age=2592000
*.ico
  Cache-Control: public, max-age=2592000
*.woff2
  Cache-Control: public, max-age=31536000, immutable
*.mp3
  Cache-Control: public, max-age=2592000
*.mp4
  Cache-Control: public, max-age=2592000

# ---- 安全：不要给 HTML 之外的目录做自动列表 ----
/admin/*
  X-Robots-Tag: noindex
`;

function main() {
  const dir = path.dirname(OUT);
  if (!fs.existsSync(dir)) {
    console.error('[headers] public/ 不存在，请先运行 hexo generate');
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(OUT, RULES, 'utf8');
  const n = RULES.split('\n').filter(l => l && !l.startsWith('#') && !l.startsWith(' ')).length;
  console.log('[headers] 已生成 public/_headers（%s 条路径规则）', n);
}

main();
