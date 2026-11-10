/* ============================================================
 * hall.js — 3D 大厅：玩家档案、五档难度、分类筛选、排行与成就
 * ============================================================ */
import { TOYS3D, TOY_ORDER3D } from './models.js';
import { LEVEL_ORDER, MODE_OF_LEVEL, LEVEL_NAME, LEVELS, unlockState } from './levels.js';
import { Store } from './store.js';
import { ThumbRenderer } from './engine.js';

const q = s => document.querySelector(s);
const MODE_KEY = 'ttw3d_mode';

const thumbs = new Map();
let thumbmer = null;
let thumbFailed = false;
let queue = [];

let lv = 1;
const saved = localStorage.getItem(MODE_KEY);
if (saved) {
  const found = LEVEL_ORDER.find(l => MODE_OF_LEVEL[l] === saved);
  if (found) lv = found;
}
let filter = '全部';
let boardMode = MODE_OF_LEVEL[lv];

/* ---------------- 基础 ---------------- */
function levelsOf(toy) {
  return toy.levels && toy.levels.length ? toy.levels : [toy.level];
}

function partCount(toy, level) {
  return level === 1 ? toy.parts.filter(p => p.easy === true).length : toy.parts.length;
}

function stars(n) {
  return Array.from({ length: 3 }, (_, i) => `<span class="st ${i < n ? 'on' : ''}">★</span>`).join('');
}

function fmt(s) {
  if (!s) return '--:--';
  const m = Math.floor(s / 60), x = s % 60;
  return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

function toast(msg) {
  const t = q('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function toysOf(level) {
  return TOY_ORDER3D.filter(id => levelsOf(TOYS3D[id]).includes(level));
}

/* ---------------- 用户条 ---------------- */
function renderUser() {
  const u = Store.currentUser();
  const st = Store.statsOf();
  q('#userAvatar').textContent = u.avatar;
  q('#userName').textContent = u.name;
  q('#userStars').textContent = `${st.totalStars} 星 · ${st.clearToys} 件完成`;
  q('#userStat').innerHTML = LEVEL_ORDER.map(l => {
    const total = toysOf(l).length;
    return `<span>${LEVEL_NAME[l]} <b>${st.clears[l] || 0}</b>/${total}</span>`;
  }).join('');
}

/* ---------------- 难度页签 ---------------- */
function renderModeBar() {
  const st = Store.statsOf();
  q('#modeBar').innerHTML = LEVEL_ORDER.map(l => {
    const lvInfo = LEVELS[l];
    const un = unlockState(l, st);
    const cls = `mode-btn${l === lv ? ' active' : ''}${un.open ? '' : ' locked'}`;
    const lock = un.open ? '' : '<span class="lock-ico">🔒</span>';
    const tip = un.open ? `${lvInfo.name}：已解锁` : `${lvInfo.name}：未解锁（${un.cond}），可试玩`;
    return `<button class="${cls}" data-lv="${l}" role="tab" title="${tip}">
      ${lvInfo.name} ${lock}<span>${lvInfo.short}</span>
    </button>`;
  }).join('');
  q('#modeBar').querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      lv = Number(btn.dataset.lv);
      boardMode = MODE_OF_LEVEL[lv];
      localStorage.setItem(MODE_KEY, boardMode);
      filter = '全部';
      renderModeBar();
      renderFilters();
      renderGrid();
      const un = unlockState(lv, Store.statsOf());
      if (!un.open) toast(`第 ${lv} 档还没有正式解锁，先试玩一关：${un.text}`);
    });
  });
  const p = LEVELS[lv];
  const un = unlockState(lv, st);
  q('#modeDesc').textContent = `第 ${lv} 档 · ${p.name}：${p.desc}`;
  const box = q('#modeLock');
  if (!box) return;
  box.hidden = un.open;
  if (!un.open) {
    box.innerHTML = `<span class="lock-line"><b>🔒 未正式解锁</b> · 解锁条件：${un.cond} · 当前进度：${un.tip}</span>
      <span class="lock-bar"><i style="width:${Math.round(un.pct * 100)}%"></i></span>
      <span class="lock-tip">现在可以先试玩：零件与提示全开、不限时，成绩不计入星级、进度与排行榜。</span>`;
  }
}

/* ---------------- 分类筛选 ---------------- */
function tagsOf(level) {
  const set = [];
  toysOf(level).forEach(id => {
    const t = TOYS3D[id].tag;
    if (set.indexOf(t) < 0) set.push(t);
  });
  return ['全部'].concat(set);
}

function renderFilters() {
  const tags = tagsOf(lv);
  if (tags.indexOf(filter) < 0) filter = '全部';
  q('#filterBar').innerHTML = tags.map(t =>
    `<button class="fchip${t === filter ? ' on' : ''}" data-tag="${t}">${t}</button>`
  ).join('');
  q('#filterBar').querySelectorAll('.fchip').forEach(b => {
    b.addEventListener('click', () => {
      filter = b.dataset.tag;
      renderFilters();
      renderGrid();
    });
  });
}

/* ---------------- 卡片 ---------------- */
function renderGrid() {
  const mode = MODE_OF_LEVEL[lv];
  const trial = !unlockState(lv, Store.statsOf()).open;
  const ids = toysOf(lv).filter(id => filter === '全部' || TOYS3D[id].tag === filter);
  const grid = q('#toyGrid');
  grid.innerHTML = ids.map((id, i) => {
    const toy = TOYS3D[id];
    const rec = Store.recordOf(id, mode);
    const n = rec ? rec.stars || 0 : 0;
    const best = rec && rec.best && rec.best.time && !trial
      ? `<p class="best-t">最佳 ${fmt(rec.best.time)}${rec.best.score ? ` · ${rec.best.score} 分` : ''}</p>`
      : '';
    const wood = toy.tag === '木工坊' ? '<span class="badge wood">木工坊</span>' : '';
    const badge = trial ? '<span class="badge lock">试玩</span>' : wood;
    const href = `play.html?toy=${id}&mode=${mode}${trial ? '&trial=1' : ''}`;
    return `
      <a class="card${trial ? ' is-trial' : ''}" style="--d:${0.05 + i * 0.05}s" href="${href}">
        <div class="thumb" data-toy="${id}">
          ${badge}
          <span class="spin"></span>
        </div>
        <div class="info">
          <h3>${toy.name}</h3>
          <p class="meta"><span class="tg">${toy.tag}</span><span>${partCount(toy, lv)} 个零件</span></p>
          <div class="stars">${trial ? '<span class="trial-tip">试玩 · 不计星</span>' : stars(n)}</div>
          ${best}
        </div>
      </a>`;
  }).join('');
  if (!ids.length) {
    grid.innerHTML = '<div class="board-empty">这个分类下暂时还没有玩具</div>';
  }
  queue = ids.slice();
  pumpThumbs();
}

function pumpThumbs() {
  if (!queue.length || thumbFailed) return;
  if (!thumbmer) {
    try { thumbmer = new ThumbRenderer(420, 300); }
    catch (e) {
      thumbFailed = true;
      document.querySelectorAll('.thumb').forEach(b => {
        b.innerHTML = '<div class="thumb-na">此设备不支持 3D 预览<br>仍可进入游戏试试</div>';
      });
      return;
    }
  }
  const id = queue.shift();
  let url = thumbs.get(id);
  if (!url) {
    try {
      url = thumbmer.render(TOYS3D[id]);
      thumbs.set(id, url);
    } catch (e) {
      thumbFailed = true;
      document.querySelectorAll('.thumb').forEach(b => {
        b.innerHTML = '<div class="thumb-na">此设备不支持 3D 预览</div>';
      });
      return;
    }
  }
  if (url) {
    const box = document.querySelector(`.thumb[data-toy="${id}"]`);
    if (box) {
      const badge = box.querySelector('.badge');
      box.innerHTML = `<img src="${url}" alt="${TOYS3D[id].name}">`;
      if (badge) box.appendChild(badge);
    }
  }
  requestAnimationFrame(pumpThumbs);
}

/* ---------------- 档案弹窗 ---------------- */
function openMask(id) { q(id).classList.add('show'); }
function closeMask(id) { q(id).classList.remove('show'); }

function renderUsers() {
  const cur = Store.currentUser();
  const list = Store.listUsers();
  q('#userList').innerHTML = list.map(u => {
    const st = Store.statsOf(u.id);
    const isCur = u.id === cur.id;
    return `<div class="urow${isCur ? ' cur' : ''}" data-uid="${u.id}">
      <span class="uav">${u.avatar}</span>
      <span class="info2"><b>${u.name}${isCur ? ' · 当前' : ''}</b><span>${st.totalStars} 星 · ${st.clearToys} 件完成 · ${(u.created ? new Date(u.created) : new Date()).toLocaleDateString('zh-CN')}</span></span>
      ${isCur ? '' : '<button class="mini primary" data-act="switch">切换</button>'}
      <button class="mini" data-act="rename">改名</button>
      ${list.length > 1 ? '<button class="mini danger" data-act="del">删除</button>' : ''}
    </div>`;
  }).join('');
  q('#userList').querySelectorAll('.urow').forEach(row => {
    const uid = row.dataset.uid;
    row.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'switch') {
          Store.switchUser(uid);
          closeMask('#profileModal');
          refreshAll();
          toast('已切换档案');
        } else if (act === 'rename') {
          const u = Store.listUsers().find(x => x.id === uid);
          const nm = prompt('新的昵称（最多 10 个字）', u ? u.name : '');
          if (nm && Store.renameUser(uid, nm)) { renderUsers(); refreshAll(); toast('昵称已更新'); }
        } else if (act === 'del') {
          if (!confirm('删除这个档案？星级和排行会一起清空。')) return;
          const r = Store.removeUser(uid);
          if (!r.ok) { q('#profileMsg').textContent = r.msg || '删除失败'; return; }
          renderUsers();
          refreshAll();
          toast('档案已删除');
        }
      });
    });
  });
}

function initProfileForm() {
  const sel = q('#newUserAvatar');
  sel.innerHTML = Store.AVATARS.map(a => `<option value="${a}">${a}</option>`).join('');
  q('#newUserForm').addEventListener('submit', e => {
    e.preventDefault();
    const nm = q('#newUserName').value;
    const r = Store.addUser(nm, sel.value);
    if (!r.ok) { q('#profileMsg').textContent = r.msg || '创建失败'; return; }
    q('#newUserName').value = '';
    q('#profileMsg').textContent = '档案已创建并切换';
    renderUsers();
    refreshAll();
  });
}

/* ---------------- 排行榜 ---------------- */
function renderBoard() {
  q('#boardTabs').innerHTML = LEVEL_ORDER.map(l => {
    const m = MODE_OF_LEVEL[l];
    return `<button class="${m === boardMode ? 'on' : ''}" data-mode="${m}">${LEVEL_NAME[l]}</button>`;
  }).join('');
  q('#boardTabs').querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { boardMode = b.dataset.mode; renderBoard(); });
  });
  const list = Store.board(boardMode).slice(0, 12);
  q('#boardList').innerHTML = list.length
    ? list.map((e, i) => `<li>
        <span class="rk">${i + 1}</span>
        <span class="who"><b>${e.name}</b><span>${e.toyName || ''}</span></span>
        <span class="tm">${fmt(e.time)} · ${e.steps || 0} 步</span>
        <span class="sc">${e.score}</span>
      </li>`).join('')
    : '<li class="board-empty">还没有成绩，先去玩一关吧</li>';
  q('#boardSub').textContent = `当前：${LEVEL_NAME[LEVEL_ORDER.find(l => MODE_OF_LEVEL[l] === boardMode)]}档 · 按得分排序`;
  q('#boardCloud').textContent = Store.CloudBoard.enabled ? '' : '云端排行榜接口已预留，接入后可跨设备比拼';
}

/* ---------------- 成就 ---------------- */
function renderAch() {
  const list = Store.achievementsOf();
  const got = list.filter(a => a.got).length;
  q('#achSub').textContent = `已解锁 ${got}/${list.length} · 通关、零失误、限时挑战都能拿成就`;
  q('#achGrid').innerHTML = list.map(a =>
    `<div class="ach${a.got ? ' got' : ''}">
      <span class="ic">${a.got ? a.icon : '🔒'}</span>
      <span class="nm">${a.name}</span>
      <span class="ds">${a.desc}</span>
    </div>`).join('');
}

/* ---------------- 刷新 ---------------- */
function refreshAll() {
  renderUser();
  renderModeBar();
  renderFilters();
  renderGrid();
}

/* ---------------- 事件绑定 ---------------- */
q('#userChip').addEventListener('click', () => {
  renderUsers();
  q('#profileMsg').textContent = '';
  openMask('#profileModal');
});
q('#profileClose').addEventListener('click', () => closeMask('#profileModal'));
q('#profileModal').addEventListener('click', e => { if (e.target.id === 'profileModal') closeMask('#profileModal'); });

q('#boardBtn').addEventListener('click', () => { renderBoard(); openMask('#boardModal'); });
q('#boardClose').addEventListener('click', () => closeMask('#boardModal'));
q('#boardModal').addEventListener('click', e => { if (e.target.id === 'boardModal') closeMask('#boardModal'); });

q('#achBtn').addEventListener('click', () => { renderAch(); openMask('#achModal'); });
q('#achClose').addEventListener('click', () => closeMask('#achModal'));
q('#achModal').addEventListener('click', e => { if (e.target.id === 'achModal') closeMask('#achModal'); });

q('#guideBtn').addEventListener('click', () => openMask('#guideModal'));
q('#guideClose').addEventListener('click', () => closeMask('#guideModal'));
q('#guideModal').addEventListener('click', e => { if (e.target.id === 'guideModal') closeMask('#guideModal'); });

initProfileForm();
renderUser();
renderModeBar();
renderFilters();
renderGrid();
