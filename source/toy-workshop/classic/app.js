/* ============================================================
 * app.js — 大厅页逻辑：难度切换、玩具卡片渲染、家长弹窗
 * 数据来源：data.js (TOYS) / api.js (apiLoadProgress)
 * ============================================================ */

const MODE_KEY = 'ttw_mode';
const MODE_DESC = {
  easy: '简单级：零件少、吸附宽松、有提示，先把「从外到内拆、从内到外装」走熟',
  mid: '中等级：零件全开，顺序和配合都更严格，吸附范围收紧，适合已经上手的孩子',
  hard: '困难级：大件与精密件，零件最多、吸附最准、没有提示，并限时计分'
};
const LEVEL_OF = { easy: 1, mid: 2, hard: 3 };

const ICON_STAR = '<svg class="icon" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const ICON_PLAY = '<svg class="icon" viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg>';

let mode = LEVEL_OF[localStorage.getItem(MODE_KEY)] ? localStorage.getItem(MODE_KEY) : 'easy';
let progress = {};

/* 每个玩具在当前难度下的可玩零件数 */
function partCount(toy) {
  return toy.parts.filter(p => mode !== 'easy' || p.easy).length;
}

function starIcons(n) {
  let html = '';
  for (let i = 1; i <= 3; i++) {
    html += ICON_STAR.replace('class="icon"', `class="icon ${i <= n ? 'on' : 'off'}"`);
  }
  return html;
}

function renderGrid() {
  const grid = document.querySelector('#toyGrid');
  const level = LEVEL_OF[mode];
  grid.innerHTML = TOY_ORDER.filter(id => TOY_LEVEL[id] === level).map((id, i) => {
    const toy = TOYS[id];
    const rec = (progress[id] || {})[mode];
    const best = rec && rec.bestScore ? `最高 ${rec.bestScore} 分` : '';
    return `
      <a class="toy-card reveal" style="--d:${0.12 + i * 0.07}s" href="game.html?toy=${id}&mode=${mode}">
        <span class="toy-play" aria-hidden="true">${ICON_PLAY}</span>
        <div class="toy-preview">${assembledPreview(toy)}</div>
        <div class="toy-info">
          <h3>${toy.name}</h3>
          <p class="toy-meta"><span class="tag">${toy.tag}</span><span>${partCount(toy)} 个零件</span></p>
          <div class="toy-stars" aria-label="已获得 ${rec ? rec.stars : 0} 星">${starIcons(rec ? rec.stars : 0)}</div>
          ${best ? `<p class="toy-best">${best}</p>` : ''}
        </div>
      </a>`;
  }).join('');
}

function renderModeSwitch() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  document.querySelector('#modeDesc').textContent = MODE_DESC[mode];
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    localStorage.setItem(MODE_KEY, mode);
    renderMode();
  });
});

function renderMode() {
  renderModeSwitch();
  renderGrid();
}

/* 家长须知弹窗 */
const parentModal = document.querySelector('#parentModal');
document.querySelector('#parentBtn').addEventListener('click', () => parentModal.classList.add('show'));
document.querySelector('#parentClose').addEventListener('click', () => parentModal.classList.remove('show'));
parentModal.addEventListener('click', e => { if (e.target === parentModal) parentModal.classList.remove('show'); });

/* 初始化：读存档 → 渲染 */
(async () => {
  const res = await apiLoadProgress();
  progress = res.data;
  renderMode();
})();
