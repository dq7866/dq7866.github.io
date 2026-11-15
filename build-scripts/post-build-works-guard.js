'use strict';

/**
 * 五件「我的作品」的访问门槛注入（构建期，只改 public/ 产物）
 *
 * 背景：
 *   阿东担心别人 Ctrl+S 把网页存下来就能整套搬走。纯前端不可能绝对防住，
 *   但可以把「保存副本直接可用」变成「保存副本只剩一页说明」。
 *
 * 为什么放在构建期而不是改源文件：
 *   - source/自然培育所/game/、source/敲散/src/ 是开发包，本地 file:// 双击调试
 *     不该被门槛挡住；只有上线产物 public/ 才需要。
 *   - 巧手拆装工坊有多个 1MB 单文件 HTML，逐个手改容易漏。统一扫描注入，
 *     新增页面自动覆盖，且幂等可重复跑。
 *
 * 每个 HTML 做三件事：
 *   1. <head> 最前面插入「内联环境哨兵」——必须内联，否则另存为网页时
 *      外链的 /works-guard.js 根本不会被保存，门槛就形同虚设。
 *      哨兵负责：非本站域名 / file:// 直接清空页面；5 秒兜底恢复主脚本，
 *      避免 guard.js 加载失败时整个游戏打不开。
 *   2. 引入 /works-guard.js（启动门、打赏面板、水印、Ctrl+S 拦截）。
 *   3. 把最后一个本地 <script src> 改成 data-wg-src，等守护层校验通过后才加载。
 *      这样「只存 HTML」拿到的页面缺主逻辑，就算绕过哨兵也跑不起来。
 *
 * 由 npm run build 在 hexo generate 及两个 post-build 拷贝脚本之后调用。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');

// 目录 -> 作品 key（与 works-guard.js 的 WORKS 表一致）
const DIRS = {
  naturelab: 'naturelab',
  qiaosan: 'qiaosan',
  'pojing-bricks': 'pojing',
  'toy-workshop': 'toy',
  'human-body': 'humanbody',
};

const GUARD_TAG = '<script src="/works-guard.js" defer></script>';
const MARK = 'data-wg="1"';

// 允许在线运行的域名：正式域、Cloudflare 预览域、另一托管镜像、本机调试
const HOSTS = '(dq7866\\.online|www\\.dq7866\\.online|[\\w-]+\\.dq7866-git\\.pages\\.dev|[\\w-]+\\.workbuddy\\.host|localhost|127\\.0\\.0\\.1|\\[::1\\])';

/**
 * 内联哨兵。刻意不依赖任何外部文件、不用模板字符串、不用可选链，
 * 保证另存为网页后在任何浏览器里都能独立跑起来。
 */
const SENTINEL = [
  '<script ' + MARK + '>',
  '(function(){',
  '  var p=location.protocol,h=location.hostname;',
  '  var ok=(p==="http:"||p==="https:")&&/^' + HOSTS + '$/.test(h);',
  '  window.__WG_OK=ok;',
  '  function overlay(){',
  '    var d=document.createElement("div");',
  '    d.setAttribute("data-wg-overlay","1");',
  '    d.setAttribute("style","position:fixed;inset:0;z-index:2147483647;background:#f7f5f1;color:#2b2b2b;font:15px/1.8 -apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;display:flex!important;align-items:center;justify-content:center;padding:24px;text-align:center;box-sizing:border-box");',
  '    d.innerHTML=\'<div style="max-width:480px"><div style="font-size:42px;line-height:1">&#129520;</div>\' +',
  '      \'<h1 style="font-size:21px;margin:14px 0 10px;color:#1f1d1a">这是保存下来的离线副本，不能运行</h1>\' +',
  '      \'<p style="color:#6b625a;margin:0 0 18px">这些作品只授权在知作坊在线运行。保存到本地、换个域名或整站镜像，都拿不到运行许可，主程序也不会加载。</p>\' +',
  '      \'<p style="color:#6b625a;margin:0 0 22px">在线版一直免费，收藏网址就能随时回来玩；想要能断网用的单文件版，请到「支持作者」里了解领取方式。</p>\' +',
  '      \'<a href="https://dq7866.online/" style="display:inline-block;padding:10px 22px;border-radius:999px;background:#ff4d00;color:#fff;text-decoration:none;font-weight:700">回到知作坊 &#8594;</a>\' +',
  '      \'<div style="margin-top:18px;font-size:12px;color:#a49b92">&#169; 知作坊 · 作品版权归作者所有</div></div>\';',
  '    try{document.body.replaceChildren(d);}catch(e){document.body.innerHTML="";document.body.appendChild(d);}',
  '    try{window.stop();}catch(e){}',
  '  }',
  '  if(!ok){',
  '    document.documentElement.setAttribute("data-wg-blocked","1");',
  '    var s=document.createElement("style");',
  '    s.textContent=\'html[data-wg-blocked="1"] body>*:not([data-wg-overlay]){display:none!important}\';',
  '    (document.head||document.documentElement).appendChild(s);',
  '    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",overlay);else overlay();',
  '    return;',
  '  }',
  '  // guard.js 若加载失败，5 秒后自动放行主脚本，保证线上可用性优先',
  '  window.__WG_RESUME=function(){',
  '    var list=document.querySelectorAll("script[data-wg-src]");',
  '    for(var i=0;i<list.length;i++){',
  '      var old=list[i];if(old.getAttribute("data-wg-done"))continue;',
  '      old.setAttribute("data-wg-done","1");',
  '      var n=document.createElement("script");',
  '      for(var j=0;j<old.attributes.length;j++){',
  '        var a=old.attributes[j];',
  '        if(a.name==="src"||a.name.indexOf("data-wg")===0)continue;',
  '        n.setAttribute(a.name,a.value);',
  '      }',
  '      n.src=old.getAttribute("data-wg-src");',
  '      document.body.appendChild(n);',
  '    }',
  '    window.__WG_READY=true;',
  '  };',
  '  window.__WG_TIMER=setTimeout(function(){if(!window.__WG_READY&&window.__WG_RESUME)window.__WG_RESUME();},5000);',
  '})();',
  '</script>',
].join('\n');

function listHtml(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listHtml(p, out);
    else if (e.isFile() && /\.html?$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** 把最后一个本地 <script src> 改成延迟加载 */
function delayLastScript(html) {
  const re = /<script\b([^>]*?)\bsrc\s*=\s*(["'])(.*?)\2([^>]*?)\s*>/gi;
  const hits = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[3];
    if (/^(https?:)?\/\//i.test(url) || /^data:/i.test(url)) continue;
    hits.push({ start: m.index, end: m.index + m[0].length, before: m[1], url, after: m[4] });
  }
  if (!hits.length) return { html, delayed: null };
  const t = hits[hits.length - 1];
  let attrs = (t.before + ' ' + t.after).replace(/\bsrc\s*=\s*(["']).*?\1/i, '').replace(/\s+/g, ' ').trim();
  attrs = attrs.replace(/\/$/, '').trim();
  const tag = '<script' + (attrs ? ' ' + attrs : '') + ' data-wg-src="' + t.url + '" data-wg-lazy="1"><\/script>';
  return { html: html.slice(0, t.start) + tag + html.slice(t.end), delayed: t.url };
}

const SENTINEL_RE = /<script data-wg="1">[\s\S]*?<\/script>/;

function injectOne(file, work) {
  let html = fs.readFileSync(file, 'utf8');
  // 已经注入过：只把哨兵整块升级到最新版（以后改规则不用手工清 public 重来）
  if (SENTINEL_RE.test(html)) {
    const upgraded = html.replace(SENTINEL_RE, SENTINEL);
    if (upgraded !== html) fs.writeFileSync(file, upgraded, 'utf8');
    return { exists: true, changed: upgraded !== html };
  }

  const lazy = delayLastScript(html);
  html = lazy.html;

  const headRe = /<head([^>]*)>/i;
  const block = SENTINEL + '\n' + GUARD_TAG + '\n';
  if (headRe.test(html)) html = html.replace(headRe, (all) => all + '\n' + block);
  else html = block + html;

  fs.writeFileSync(file, html, 'utf8');
  return { skipped: false, delayed: lazy.delayed };
}

function main() {
  if (!fs.existsSync(PUB)) {
    console.error('[works-guard] public/ 不存在，请先运行 hexo generate');
    process.exitCode = 1;
    return;
  }
  let files = 0, injected = 0, delayed = 0, upgraded = 0;
  const detail = [];
  for (const [dir, work] of Object.entries(DIRS)) {
    const list = listHtml(path.join(PUB, dir), []);
    let a = 0, b = 0;
    for (const f of list) {
      const r = injectOne(f, work);
      files++;
      if (r.exists) {
        if (r.changed) upgraded++;
        continue;
      }
      injected++; a++;
      if (r.delayed) { delayed++; b++; }
    }
    detail.push(dir + ': ' + a + ' 新注入 / ' + b + ' 延迟 / ' + list.length + ' 共');
  }
  console.log('[works-guard] 扫描 %d 个 HTML，新注入 %d，哨兵升级 %d，延迟主脚本 %d', files, injected, upgraded, delayed);
  detail.forEach((d) => console.log('  - ' + d));
  const guard = path.join(PUB, 'works-guard.js');
  if (fs.existsSync(guard)) console.log('  - public/works-guard.js %s KB', (fs.statSync(guard).size / 1024).toFixed(1));
  else console.warn('  - 警告：public/works-guard.js 缺失，哨兵会在 5 秒后自动放行');
}

main();
