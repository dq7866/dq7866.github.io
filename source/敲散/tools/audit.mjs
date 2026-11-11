#!/usr/bin/env node
/* ============================================================
   敲散 · 发布前自检（零依赖，Node 18+）
   运行：node tools/audit.mjs
   覆盖：结构 / 语法 / 离线 / 形状 / 动画 / 档案 / 单文件 / 版式
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(ROOT, f));

const out = [];
const ok = (name, cond, detail = '') => out.push({ name, pass: !!cond, detail });

/* 1. 结构 */
const files = ['src/index.html', 'src/styles.css', 'src/app.js', 'src/profile.js', 'QiaoSan.html', 'README.md'];
files.forEach(f => ok('文件存在：' + f, exists(f)));

const html = read('src/index.html');
const css = read('src/styles.css');
const app = read('src/app.js');
const profile = read('src/profile.js');
const single = read('QiaoSan.html');

ok('index 引入 profile.js 与 app.js', html.includes('src="profile.js"') && html.includes('src="app.js"'));
ok('脚本顺序 profile → app', html.indexOf('profile.js') < html.indexOf('app.js'));

/* 2. 语法（不执行） */
for (const [name, code] of [['app.js', app], ['profile.js', profile]]) {
  try { new vm.Script(code, { filename: name }); ok('语法通过：' + name, true); }
  catch (e) { ok('语法通过：' + name, false, e.message); }
}

/* 3. 离线与依赖 */
ok('单文件无外部 script', !/<script\s+src=/i.test(single));
ok('单文件无外部样式', !/<link[^>]+stylesheet/i.test(single));
ok('源码无 fetch/XHR', !/\bfetch\s*\(|XMLHttpRequest/.test(app + profile));
ok('源码无 http(s) 资源引用', !/https?:\/\/[^\s"']+\.(js|css|png|jpg|webp)/.test(app + profile + html));

/* 4. CSS 与版式 */
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
const open = (stripped.match(/{/g) || []).length, close = (stripped.match(/}/g) || []).length;
ok('CSS 括号平衡', open === close, open + ' / ' + close);
ok('设置面板固定宽度 460px', /#panel\{[^}]*width:min\(460px/.test(css));
ok('窄屏仍为全宽底部抽屉', /@media \(max-width:560px\)[\s\S]{0,200}#panel\{[^}]*width:100%/.test(css));
ok('弹窗/锁屏样式存在', css.includes('.modalCard') && css.includes('.lkScreen'));

/* 5. 形状 / 动画 / 破裂 */
const shapes = ['rounded', 'hex', 'star', 'heart', 'none'];
shapes.forEach(s => ok('形状实现：' + s, app.includes("shape === '" + s + "'")));
ok('无形状跳过主体绘制', app.includes("if (shape === 'none')"));
ok('六种形状选项', ['bubble', 'rounded', 'hex', 'star', 'heart', 'none'].every(v => html.includes('data-v="' + v + '"') && html.includes('segShape')));
ok('大小差异三档', ['0', '0.14', '0.3'].every(v => html.includes('data-v="' + v + '"')) && html.includes('segSize'));
ok('入场动画五种', ['fly', 'float', 'fall', 'pop', 'none'].every(v => app.includes("'" + v + "'")));
ok('破裂样式三种', ['crack', 'blast', 'puff'].every(v => app.includes("'" + v + "'")) && html.includes('segBurst'));
ok('入场期间不可命中', app.includes('b.entA < 0.45'));
ok('烟雾粒子绘制', app.includes("p.type === 'puff'"));

/* 6. 用户体系 */
ok('档案注册表键', profile.includes("qs.accounts.v1") && profile.includes("qs.current"));
ok('档案命名空间', profile.includes("'qs.u'"));
ok('PIN SHA-256 + fallback', profile.includes('sha256:') && profile.includes("'fnv'"));
ok('PIN 失败冷却 30 秒', profile.includes('30000'));
ok('档案导出', profile.includes('qiaosan-profile'));
ok('档案导入', profile.includes('importProfile'));
ok('删除档案清空命名空间', profile.includes('keysWithPrefix(prefixOf(acc))'));
ok('旧版 yt_ 迁移', profile.includes("keysWithPrefix('yt_')"));

/* 7. 帮助 / 关于 / 无障碍 */
['helpModal', 'aboutModal', 'profileModal'].forEach(id => ok('弹窗存在：' + id, html.includes('id="' + id + '"')));
ok('帮助内容含键盘操作', html.includes('Shift + 点击') && html.includes('<b>Space</b>'));
ok('关于含隐私声明', html.includes('不收集、不上传') && html.includes('适龄提示'));
ok('弹窗焦点陷阱', app.includes("e.key !== 'Tab'"));
ok('全局异常兜底', app.includes("addEventListener('error'"));
ok('保存失败提示', app.includes('__QS_ON_SAVE_ERROR'));

/* 8. 单文件一致性 */
ok('单文件包含 profile 逻辑', single.includes('qs.accounts.v1'));
ok('单文件包含形状逻辑', single.includes("shape === 'heart'"));
ok('单文件体积 > 100KB', single.length > 100000, (single.length / 1024).toFixed(1) + ' KB');
ok('单文件无未内联的 src 引用', !single.includes('src="app.js"'));

/* 9. 版本一致 */
ok('页面版本 3.0', html.includes('敲散 v3.0'));
ok('README 版本 3.0', read('README.md').includes('当前版本：v3.0'));
ok('Electron 版本 3.0', read('electron/package.json').includes('"version": "3.0.0"'));

/* 10. id 唯一 */
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
ok('HTML id 唯一', dup.length === 0, [...new Set(dup)].join(', '));

/* 输出 */
const pass = out.filter(x => x.pass).length;
const fail = out.length - pass;
console.log('\n敲散 · 发布前自检\n' + '='.repeat(46));
out.forEach(r => console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.detail ? '  [' + r.detail + ']' : '')));
console.log('='.repeat(46));
console.log(`合计 ${out.length} 项：通过 ${pass}，失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
