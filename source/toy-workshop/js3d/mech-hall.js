/* ============================================================
 * mech-hall.js — 机械原理馆 · 清单页
 *   分组展示 38 件机构；已上线的出卡片，缩略图按需渲染
 * ============================================================ */
import { MECH_PLAN, MECH_GROUPS, MECHS } from './mech-models.js';
import { ThumbRenderer } from './engine.js';

const KEY = 'ttw_mech_v1';
const $ = s => document.querySelector(s);

const store = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
const seen = store.seen || {}, built = store.built || {};

const live = MECH_PLAN.reduce((n, g) => n + g.items.filter(i => i.done).length, 0);
const total = MECH_PLAN.reduce((n, g) => n + g.items.length, 0);
$('#hallStat').textContent = `已上线 ${live} / ${total} 件 · 全部可动画、可拆装`;
$('#hallBar').style.width = `${Math.round(live / total * 100)}%`;

function badge(id) {
  if (built[id]) return '<span class="badge done">已掌握</span>';
  if (seen[id]) return '<span class="badge seen">已看过</span>';
  return '';
}

const host = $('#hallGroups');
host.innerHTML = MECH_PLAN.map(gp => {
  const meta = MECH_GROUPS.find(g => g.id === gp.group);
  const on = gp.items.filter(i => i.done);
  const off = gp.items.filter(i => !i.done);
  const cards = on.map((it, i) => {
    const m = MECHS[it.id];
    if (!m) return '';
    return `
      <div class="card mech-card" style="--d:${0.04 + i * 0.04}s">
        <a class="card-hit" href="mech-play.html?id=${it.id}">
          <div class="thumb" data-mech="${it.id}">
            ${badge(it.id)}
            <span class="spin"></span>
          </div>
          <div class="info">
            <h3>${m.name}</h3>
            <p class="meta"><span class="tg">${m.tag}</span><span>${m.parts.length} 个可拆零件</span></p>
            <p class="sub">${m.summary}</p>
          </div>
        </a>
        <a class="card-act" href="mech-play.html?id=${it.id}&mode=teach">🔧 拆装练习 · ${m.parts.length} 件</a>
      </div>`;
  }).join('');

  const soon = off.length
    ? `<div class="m-soon"><b>待上线 ${off.length} 件</b>${off.map(i => `<span>${i.name}</span>`).join('')}</div>`
    : '';

  return `
    <section class="m-group">
      <div class="m-group-head">
        <h2><i style="background:${meta.color}"></i>${meta.name}</h2>
        <span>${on.length} 件已上线${off.length ? ` · ${off.length} 件待做` : ''}</span>
      </div>
      <p class="m-group-desc">${meta.desc}</p>
      ${cards ? `<div class="grid mech-grid">${cards}</div>` : ''}
      ${soon}
    </section>`;
}).join('');

/* ---------------- 缩略图：进入视口才建 3D 场景 ---------------- */
let thumbmer = null, failed = false;
const queue = [];
let pumping = false;

function pump() {
  if (pumping || failed || !queue.length) return;
  pumping = true;
  if (!thumbmer) {
    try { thumbmer = new ThumbRenderer(420, 300); }
    catch (e) {
      failed = true;
      document.querySelectorAll('.thumb[data-mech]').forEach(b => {
        b.innerHTML = '<div class="thumb-na">此设备不支持 3D 预览</div>';
      });
      pumping = false;
      return;
    }
  }
  const id = queue.shift();
  const box = document.querySelector(`.thumb[data-mech="${id}"]`);
  let url = null;
  try { url = thumbmer.render(MECHS[id]); } catch (e) { url = null; }
  if (box) {
    const b = box.querySelector('.badge');
    if (url) {
      box.innerHTML = `<img src="${url}" alt="${MECHS[id].name}">`;
      if (b) box.appendChild(b);
    } else {
      box.innerHTML = '<div class="thumb-na">缩略图生成失败<br>仍可点进去看</div>';
    }
  }
  const gap = url ? 90 : 0;
  setTimeout(() => { pumping = false; pump(); }, gap);
}

if (window.IntersectionObserver) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      queue.push(en.target.dataset.mech);
      pump();
    });
  }, { rootMargin: '320px 0px' });
  document.querySelectorAll('.thumb[data-mech]').forEach(el => io.observe(el));
} else {
  document.querySelectorAll('.thumb[data-mech]').forEach(el => queue.push(el.dataset.mech));
  pump();
}
