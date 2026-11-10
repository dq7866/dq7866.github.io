/* ============================================================
 * build-single-3d.js — 把 3D 版打包成「双击即玩」的离线单文件
 *
 * 用法：node build-single-3d.js
 * 输出（与本脚本同目录）：
 *   toy-workshop-3d.html   大厅（双击打开）
 *   play-3d.html           游戏页（由大厅自动跳转）
 *
 * 原理：浏览器禁止 file:// 下加载 ES Module，所以把
 *   three.module.min.js / OrbitControls.js / js3d/*.js
 * 全部改写成普通脚本，按依赖顺序内联进 HTML。
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const R = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ---------- 1. three.module.min.js -> window.THREE ---------- */
function wrapThree(src) {
  const m = src.match(/export\s*\{([\s\S]*?)\}\s*;?\s*$/);
  if (!m) throw new Error('three: 未找到结尾的 export 块');
  const pairs = m[1].split(',').map(s => s.trim()).filter(Boolean).map(item => {
    const parts = item.split(/\s+as\s+/);
    return parts.length === 2 ? `${parts[1]}:${parts[0]}` : `${item}:${item}`;
  });
  const body = src.slice(0, m.index) + `\nreturn {${pairs.join(',')}};\n`;
  return `window.THREE = (function(){\n'use strict';\n${body}\n})();\n`;
}

/* ---------- 2. ESM -> IIFE ---------- */
function convert(src) {
  const exported = [];
  let out = src.replace(/^import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
    (_, ns, spec) => `const ${ns} = __mod(${JSON.stringify(spec)});`);
  out = out.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]\s*;?/gm,
    (_, names, spec) => `const {${names.replace(/\n/g, ' ')}} = __mod(${JSON.stringify(spec)});`);
  out = out.replace(/^export\s+(async\s+function|function|class|const|let|var)\s+([\w$]+)/gm,
    (_, kw, name) => { exported.push(name); return `${kw} ${name}`; });
  out = out.replace(/^export\s*\{([\s\S]*?)\}\s*;?/gm, (_, list) => {
    list.split(',').map(s => s.trim()).filter(Boolean).forEach(item => {
      const p = item.split(/\s+as\s+/);
      exported.push((p[1] || p[0]).trim());
    });
    return '';
  });
  if (/^export\s/m.test(out)) throw new Error('仍有未处理的 export 语句');
  if (/^import\s/m.test(out)) throw new Error('仍有未处理的 import 语句');
  return { code: out, exported };
}

function asModule(name, src) {
  const { code, exported } = convert(src);
  return `__REG[${JSON.stringify(name)}] = (function(){\n'use strict';\n${code}\nreturn {${exported.join(',')}};\n})();\n`;
}

function asEntry(src) {
  const { code } = convert(src);
  return `(function(){\n'use strict';\n${code}\n})();\n`;
}

/* ---------- 3. 组装 ---------- */
function buildBundle(entryFile) {
  return `(function(){
var __REG = Object.create(null);
function __mod(spec){
  if (spec === 'three') return window.THREE;
  if (spec.indexOf('OrbitControls') >= 0) return __REG.__orbit;
  return __REG[spec.replace(/^\\.\\//,'').replace(/\\.js$/,'')];
}
${wrapThree(R('vendor/three.module.min.js'))}
${asModule('__orbit', R('vendor/OrbitControls.js'))}
${asModule('kit', R('js3d/kit.js'))}
${asModule('models', R('js3d/models.js'))}
${asModule('levels', R('js3d/levels.js'))}
${asModule('store', R('js3d/store.js'))}
${asModule('engine', R('js3d/engine.js'))}
${asModule('mech-models', R('js3d/mech-models.js'))}
${asEntry(R('js3d/' + entryFile))}
})();`;
}

/* ---------- 4. 生成 HTML ---------- */
function inlineHtml(htmlFile, bundle, replacements) {
  let html = R(htmlFile);
  const css = R('style3d.css');
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/g, '');
  html = html.replace(/<script type="module" src="[^"]*"><\/script>/g, '');
  html = html.replace(/<link rel="stylesheet" href="style3d\.css">/g, `<style>\n${css}\n</style>`);
  for (const [from, to] of replacements) html = html.split(from).join(to);
  html = html.replace('</body>', `<script>\n${bundle}\n</script>\n</body>`);
  if (html.includes('importmap')) throw new Error('importmap 未移除');
  if (html.includes('href="style3d.css"')) throw new Error('样式未内联');
  return html;
}

const hallBundle = buildBundle('hall.js').replace(/play\.html\?/g, 'play-3d.html?');
const playBundle = buildBundle('game.js');

const hall = inlineHtml('index.html', hallBundle, [
  ['href="play.html?', 'href="play-3d.html?'],
  ['href="mech.html"', 'href="mech-3d.html"'],
  /* 单文件版没有开发页与 classic/ 目录，指回自身与单文件 2D 版 */
  ['href="classic/index.html"', 'href="toy-workshop-classic.html"'],
  ['href="index.html"', 'href="toy-workshop-3d.html"']
]);

/* game.js 里写死了 index.html / play.html，改成单文件版页面 */
const playSrc = playBundle
  .replace(/'index\.html'/g, "'toy-workshop-3d.html'")
  .replace(/play\.html\?/g, 'play-3d.html?')
  .replace(/classic\/index\.html/g, 'toy-workshop-classic.html');

const play = inlineHtml('play.html', playSrc, [
  ['href="index.html"', 'href="toy-workshop-3d.html"']
]);

checkScriptSafe(hall, 'toy-workshop-3d.html');
checkScriptSafe(play, 'play-3d.html');

/* 机械原理馆：清单页 + 演示页 */
const mechHallBundle = buildBundle('mech-hall.js').replace(/mech-play\.html\?/g, 'mech-play-3d.html?');
const mechHall = inlineHtml('mech.html', mechHallBundle, [
  ['href="mech-play.html?', 'href="mech-play-3d.html?'],
  ['href="index.html"', 'href="toy-workshop-3d.html"']
]);

const mechPlayBundle = buildBundle('mech.js');
const mechPlay = inlineHtml('mech-play.html', mechPlayBundle, [
  ['href="mech.html"', 'href="mech-3d.html"'],
  ['href="index.html"', 'href="toy-workshop-3d.html"'],
  ['mech-play.html?', 'mech-play-3d.html?']
]);

checkScriptSafe(mechHall, 'mech-3d.html');
checkScriptSafe(mechPlay, 'mech-play-3d.html');

fs.writeFileSync(path.join(__dirname, 'toy-workshop-3d.html'), hall);
fs.writeFileSync(path.join(__dirname, 'play-3d.html'), play);
fs.writeFileSync(path.join(__dirname, 'mech-3d.html'), mechHall);
fs.writeFileSync(path.join(__dirname, 'mech-play-3d.html'), mechPlay);

console.log('已生成 toy-workshop-3d.html  ' + (hall.length / 1024).toFixed(1) + ' KB');
console.log('已生成 play-3d.html           ' + (play.length / 1024).toFixed(1) + ' KB');
console.log('已生成 mech-3d.html           ' + (mechHall.length / 1024).toFixed(1) + ' KB');
console.log('已生成 mech-play-3d.html      ' + (mechPlay.length / 1024).toFixed(1) + ' KB');

/* 内联脚本里出现 </script> 会截断页面，提前报错 */
function checkScriptSafe(html, label) {
  const parts = html.split('<script>').slice(1);
  parts.forEach(p => {
    const end = p.indexOf('</script>');
    if (end < 0) throw new Error(`${label}: 找不到脚本结束标签`);
    if (p.indexOf('</script>', end + 9) >= 0) {
      throw new Error(`${label}: 内联脚本里出现多余 </script>，需要转义`);
    }
  });
}
