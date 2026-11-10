/* ============================================================
 * build-single.js — 把多文件版合并成单文件 HTML
 *
 * 用法（需要 Node.js，无需安装依赖）：
 *     node build-single.js
 *
 * 输出：toy-workshop-classic.html（与源码同目录，根目录）
 * 用途：把 classic/ 下的 index.html + game.html 合并为一个可直接双击打开
 *       的文件，大厅与游戏页在同一页面内切换，不依赖本地服务器。
 *
 * 注意：本脚本依赖源文件里的若干代码锚点（见下方 replace）。
 *       如果改了 classic/game.js 的初始化结构，请同步更新对应匹配串，
 *       否则脚本会报错提示某个锚点未命中。
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'classic');
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');

/* 断言式替换：锚点未命中时直接失败，避免生成坏文件 */
function must(src, from, to, label) {
  if (!src.includes(from)) {
    throw new Error(`锚点未命中：${label}\n请检查源码是否变动，或在 build-single.js 中更新该匹配串。`);
  }
  return src.replace(from, to);
}

const stylesCss = read('styles.css');
const gameCss = read('game.css');
const dataJs = read('data.js');
const apiJs = read('api.js');
let appJs = read('app.js');
let gameJs = read('game.js');

/* ---------- 抽取两个页面的 body 内容 ---------- */
const indexHtml = read('index.html');
const homeBody = indexHtml.split('<body data-page="home">')[1].split('<script src="data.js">')[0];

const gameHtml = read('game.html');
const gameBody = gameHtml.split('<body class="phase-dis">')[1].split('<script src="data.js">')[0];

/* ---------- 大厅：初始化改为可重复调用的 refreshLobby ---------- */
appJs = must(appJs,
  `(async () => {
  const res = await apiLoadProgress();
  progress = res.data;
  renderMode();
})();`,
  `async function refreshLobby() {
  const res = await apiLoadProgress();
  progress = res.data;
  renderMode();
}
window.refreshLobby = refreshLobby;
refreshLobby();`,
  'app.js 初始化 IIFE'
);
const lobbyWrapped = `;(function () {\n${appJs}\n})();`;

/* ---------- 游戏：URL 参数改为内部状态 ---------- */
gameJs = must(gameJs,
  `const params = new URLSearchParams(location.search);
const toyId = params.get('toy') || 'car';
const modeParam = params.get('mode');
const mode = ['easy', 'mid', 'hard'].includes(modeParam) ? modeParam : 'easy';
const toy = TOYS[toyId] || TOYS.car;`,
  `let toyId = 'car';
let mode = 'easy';
let toy = TOYS.car;`,
  'game.js URL 参数解析'
);

gameJs = must(gameJs,
  `const SNAP_R = mode === 'easy' ? 66 : mode === 'mid' ? 48 : 34;`,
  `let SNAP_R = 66;`,
  'game.js SNAP_R 常量'
);

gameJs = must(gameJs,
  `const partsInScene = toy.parts.filter(p => mode !== 'easy' || p.easy || p.staticInEasy);
const playable = partsInScene.filter(p => mode !== 'easy' || p.easy);`,
  `let partsInScene = [];
let playable = [];`,
  'game.js partsInScene 常量'
);

gameJs = gameJs.replaceAll('location.reload()', 'startGame(toyId, mode)');

gameJs = must(gameJs,
  `init();
startTimer();`,
  `/* ---------- 单文件版：开局 / 退出 ---------- */
function startGame(id, m) {
  toyId = TOYS[id] ? id : 'car';
  mode = ['easy', 'mid', 'hard'].includes(m) ? m : 'easy';
  toy = TOYS[toyId];
  SNAP_R = mode === 'easy' ? 66 : mode === 'mid' ? 48 : 34;
  partsInScene = toy.parts.filter(p => mode !== 'easy' || p.easy || p.staticInEasy);
  playable = partsInScene.filter(p => mode !== 'easy' || p.easy);

  stopTimer(); stopIdle();
  S.phase = 'dis'; S.mistakes = 0; S.startAt = Date.now();
  S.drag = null; S.beadCount = 0; S.score = 0;
  partLayer.innerHTML = ''; tray.innerHTML = ''; ghostLayer.innerHTML = '';
  stage.classList.remove('celebrating');
  phasePill.classList.remove('assemble');
  q('#trayLabel').textContent = '零件架';
  q('#doneModal').classList.remove('show');
  q('#timeoutModal').classList.remove('show');
  q('#stepsModal').classList.remove('show');
  document.body.classList.remove('phase-assemble');

  showScreen('game');
  init();
  startTimer();
}

function exitGame() {
  stopTimer(); stopIdle();
  S.drag = null;
  q('#doneModal').classList.remove('show');
  q('#timeoutModal').classList.remove('show');
  q('#stepsModal').classList.remove('show');
  document.body.classList.remove('phase-dis', 'phase-assemble');
  showScreen('home');
  if (window.refreshLobby) window.refreshLobby();
}

window.startGame = startGame;
window.exitGame = exitGame;`,
  'game.js 启动调用'
);
const gameWrapped = `;(function () {\n${gameJs}\n})();`;

/* ---------- 路由：屏幕切换 + 拦截原本的跳页链接 ---------- */
const coordinator = `
function showScreen(name) {
  document.querySelector('#homeScreen').hidden = name !== 'home';
  document.querySelector('#gameScreen').hidden = name !== 'game';
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const a = e.target.closest('a');
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (href === 'index.html') {
    e.preventDefault();
    exitGame();
  } else if (href.indexOf('game.html') === 0) {
    e.preventDefault();
    const u = new URL(href, location.href);
    startGame(u.searchParams.get('toy'), u.searchParams.get('mode'));
  }
});
`;

/* ---------- 组装 ---------- */
const out = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>巧手拆装工坊 · 单文件版</title>
<style>
${stylesCss}
</style>
<style>
${gameCss}
</style>
</head>
<body>

<div id="homeScreen">
${homeBody}
</div>

<div id="gameScreen" hidden>
${gameBody}
</div>

<script>
${dataJs}
</script>
<script>
${apiJs}
</script>
<script>
${coordinator}
</script>
<script>
${lobbyWrapped}
</script>
<script>
${gameWrapped}
</script>
</body>
</html>
`;

const dest = path.join(__dirname, 'toy-workshop-classic.html');
fs.writeFileSync(dest, out);
console.log(`已生成 ${path.basename(dest)}  ${(out.length / 1024).toFixed(1)} KB`);
