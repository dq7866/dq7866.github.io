/* =====================================================================
 * 知识擂台 · 扩展模块
 *   1) 对局复盘（逐题对错 + 知识点薄弱项 + 给家长的建议）
 *   2) 学习档案跨设备同步（同步码 ↔ 服务端 /api/profile）
 *   3) 新玩法：同屏对战 / 错题挑战赛 / 极速 60 秒
 *
 * 本文件独立加载在 index.html 主脚本之后，复用其全局函数与变量，
 * 只做"包装 + 新增界面"，不改动原有答题流程。
 * ===================================================================== */
(function () {
  'use strict';

  const id = s => document.getElementById(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------------------------------------------------------- */
  /* 公共：拉题                                                       */
  /* ---------------------------------------------------------------- */
  async function fetchQuestions(grade, subject, n, level) {
    const r = await fetch(`${API_BASE}/api/questions?grade=${grade}&subject=${encodeURIComponent(subject)}&n=${n}&level=${level}`);
    if (!r.ok) throw new Error('取题失败');
    return r.json();
  }

  function currentGrade(chipSel) {
    const el = document.querySelector(chipSel + ' .on');
    return el ? el.dataset.g : '1';
  }
  function currentSubject(chipSel) {
    const el = document.querySelector(chipSel + ' .on');
    return el ? el.dataset.s : 'mix';
  }

  /* 知识点聚合：把错题按 kp 归类，返回 [{kp, wrong, total}] 按错误数降序 */
  function groupByKp(items) {
    const map = new Map();
    for (const it of items) {
      const kp = it.kp || (it.subj + '基础');
      if (!map.has(kp)) map.set(kp, { kp, wrong: 0, total: 0 });
      const o = map.get(kp);
      o.total += 1;
      if (!it.ok) o.wrong += 1;
    }
    return [...map.values()].sort((a, b) => b.wrong - a.wrong || b.total - a.total);
  }

  /* 根据数据生成给家长的可行建议（不是泛泛的鼓励话） */
  function adviceFor({ childRight, total, childWrongKp, avgMs }) {
    const out = [];
    const acc = total ? Math.round(childRight / total * 100) : 0;
    const top = childWrongKp.filter(k => k.wrong > 0).slice(0, 2);
    if (top.length) {
      out.push(`优先补【${top.map(t => t.kp).join('】【')}】：本局这两块共错 ${top.reduce((s, t) => s + t.wrong, 0)} 题，今晚花 5 分钟口头过一遍，明天再战一局验证。`);
    }
    if (acc >= 80) out.push(`孩子本局正确率 ${acc}%，可以试着把难度调高一档，或者换成更高年级的题目。`);
    else if (acc < 50) out.push(`正确率 ${acc}%，先把家长延迟调长 1～2 秒、题数降到 5 题，让孩子多体验"答对"的感觉。`);
    if (avgMs && avgMs > 9000) out.push(`平均每题用时 ${(avgMs / 1000).toFixed(1)} 秒，偏慢。可以教他先扫一遍选项，再回题干找关键词。`);
    if (!out.length) out.push('本局数据平稳，保持每天一局的节奏即可。');
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* 1. 对局复盘                                                      */
  /* ---------------------------------------------------------------- */
  function ensureBlock(afterEl, blockId) {
    let el = id(blockId);
    if (el) return el;
    el = document.createElement('div');
    el.id = blockId;
    el.className = 'card';
    el.style.cssText = 'width:min(92vw,460px);max-height:34vh;overflow-y:auto;text-align:left;font-size:13px;margin-bottom:12px';
    if (afterEl && afterEl.parentNode) afterEl.insertAdjacentElement('afterend', el);
    return el;
  }

  function renderBattleReview(m) {
    const detail = m && Array.isArray(m.detail) ? m.detail : [];
    const endScreen = id('end');
    if (!endScreen) return;
    const box = ensureBlock(id('wrongCard') || id('rSub'), 'reviewCard');
    if (!detail.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';

    const cRight = detail.filter(d => d.child && d.child.ok).length;
    const pRight = detail.filter(d => d.parent && d.parent.ok).length;
    const cTimes = detail.filter(d => d.child && d.child.ms != null).map(d => d.child.ms);
    const avgMs = cTimes.length ? Math.round(cTimes.reduce((a, b) => a + b, 0) / cTimes.length) : 0;

    // 孩子视角的错误知识点（按知识点聚合，含答对信息）
    const kpRows = groupByKp(detail.map(d => ({ kp: d.kp, subj: d.subj, ok: !!(d.child && d.child.ok) })));
    const tips = adviceFor({ childRight: cRight, total: detail.length, childWrongKp: kpRows, avgMs });

    let html = `<h3>🔍 本局复盘 · ${detail.length} 题</h3>`;
    html += `<div style="display:flex;gap:10px;color:#fff;margin-bottom:10px;flex-wrap:wrap">
      <span style="background:rgba(59,130,246,.28);padding:5px 10px;border-radius:99px">🧒 答对 ${cRight}/${detail.length}</span>
      <span style="background:rgba(249,115,22,.28);padding:5px 10px;border-radius:99px">👨 答对 ${pRight}/${detail.length}</span>
      ${avgMs ? `<span style="background:rgba(255,255,255,.16);padding:5px 10px;border-radius:99px">⏱ 平均 ${(avgMs / 1000).toFixed(1)}s</span>` : ''}
    </div>`;

    const weak = kpRows.filter(k => k.wrong > 0);
    if (weak.length) {
      html += `<div style="margin-bottom:10px">
        <div style="color:#fbbf24;font-weight:800;margin-bottom:4px">📉 孩子薄弱知识点</div>
        ${weak.slice(0, 4).map(k => `<div style="color:#fff;display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed rgba(255,255,255,.15)">
          <span>${esc(k.kp)}</span><span style="color:#f87171">错 ${k.wrong}/${k.total}</span></div>`).join('')}
      </div>`;
    }

    html += `<div style="color:#93c5fd;font-weight:800;margin-bottom:4px">📋 逐题明细</div>`;
    html += detail.map(d => {
      const c = d.child || {}, p = d.parent || {};
      const mark = (o) => o.ok ? '<span style="color:#4ade80">✔</span>'
        : (o.text == null ? '<span style="color:#94a3b8">—</span>' : '<span style="color:#f87171">✘</span>');
      const cTime = c.ms != null ? `<span style="color:rgba(255,255,255,.55);font-size:11px"> ${(c.ms / 1000).toFixed(1)}s</span>` : '';
      return `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.12);color:#fff">
        <div style="font-size:12px;opacity:.75">${d.no}. 【${esc(d.subj)}${d.kp ? ' · ' + esc(d.kp) : ''}】</div>
        <div style="font-weight:700">${esc(d.text)}</div>
        <div style="font-size:12px;margin-top:2px">🧒 ${mark(c)}${cTime} &nbsp; 👨 ${mark(p)}</div>
        ${(!c.ok && c.text) ? `<div style="font-size:12px;color:rgba(255,255,255,.6)">孩子选了「${esc(c.text)}」</div>` : ''}
        <div style="font-size:12px;color:#4ade80">✅ ${esc(d.correct)}</div>
      </div>`;
    }).join('');

    html += `<div style="margin-top:10px;background:rgba(250,204,21,.14);border-radius:12px;padding:10px;color:#fff">
      <div style="font-weight:800;color:#facc15;margin-bottom:4px">💡 给家长的建议</div>
      ${tips.map(t => `<div style="margin:4px 0;line-height:1.55">· ${esc(t)}</div>`).join('')}
    </div>`;

    box.innerHTML = html;
    // 复盘也进档案：把错题知识点累计起来，供看板用
    try {
      mutateProfile(p => {
        p.kpWrong = p.kpWrong || {};
        for (const d of detail) {
          if (d.child && !d.child.ok) {
            const k = d.kp || (d.subj + '基础');
            p.kpWrong[k] = (p.kpWrong[k] || 0) + 1;
          }
        }
      });
    } catch (e) { /* 忽略 */ }
  }

  function renderSoloReview() {
    const pool = (typeof soloPool !== 'undefined' && soloPool) ? soloPool : [];
    if (!pool.length) return;
    const box = ensureBlock(id('soloWrongCard'), 'soloReviewCard');
    box.style.display = 'block';

    const kpRows = groupByKp(pool.map(q => ({
      kp: q.kp || (q.subj + '基础'),
      subj: q.subj,
      ok: !soloWrongs.some(w => w.text === q.text),
    })));
    const right = soloScore;
    const tips = adviceFor({ childRight: right, total: pool.length, childWrongKp: kpRows, avgMs: 0 });

    box.innerHTML = `<h3>🔍 本轮复盘</h3>
      <div style="color:#fff;margin-bottom:8px">答对 ${right}/${pool.length} 题${
        soloWrongs.length ? `，错题已记入错题本` : '，全对！'}</div>
      ${kpRows.filter(k => k.wrong > 0).length ? `<div style="color:#fbbf24;font-weight:800;margin-bottom:4px">📉 本轮薄弱知识点</div>
        ${kpRows.filter(k => k.wrong > 0).slice(0, 4).map(k => `<div style="color:#fff;display:flex;justify-content:space-between;padding:3px 0">
          <span>${esc(k.kp)}</span><span style="color:#f87171">错 ${k.wrong}/${k.total}</span></div>`).join('')}` : ''}
      <div style="margin-top:10px;background:rgba(250,204,21,.14);border-radius:12px;padding:10px;color:#fff">
        <div style="font-weight:800;color:#facc15;margin-bottom:4px">💡 建议</div>
        ${tips.map(t => `<div style="margin:4px 0;line-height:1.55">· ${esc(t)}</div>`).join('')}
      </div>`;
  }

  /* 包装原有结算函数：原逻辑先跑，再叠加复盘 */
  const _onOver = window.onOver;
  window.onOver = function (m) {
    _onOver.call(this, m);
    try { renderBattleReview(m); } catch (e) { console.warn('复盘渲染失败', e); }
  };

  const _soloEnd = window.soloEnd;
  window.soloEnd = function () {
    _soloEnd.call(this);
    try { renderSoloReview(); } catch (e) { console.warn('复盘渲染失败', e); }
  };

  /* 包装单人作答：把知识点带进错题本，并支持"错题挑战赛"消错 */
  const _soloAnswer = window.soloAnswer;
  window.soloAnswer = function (btn, o) {
    const q = (typeof soloPool !== 'undefined' && soloPool) ? soloPool[soloIdx] : null;
    _soloAnswer.call(this, btn, o);
    try {
      if (!q) return;
      const last = soloWrongs[soloWrongs.length - 1];
      if (last && last.text === q.text && !last.kp) {
        last.kp = q.kp || (q.subj + '基础');
        mutateProfile(p => {
          const idx = (p.wrongs || []).findIndex(w => w.text === q.text);
          if (idx >= 0) p.wrongs[idx].kp = last.kp;
        });
      }
      if (window.__challenge && window.__challenge.active && o && o.ok) {
        // 错题挑战赛：答对即从错题本消除
        mutateProfile(p => {
          const before = (p.wrongs || []).length;
          p.wrongs = (p.wrongs || []).filter(w => w.text !== q.text);
          if (p.wrongs.length < before) {
            window.__challenge.killed += (before - p.wrongs.length);
          }
        });
      }
    } catch (e) { /* 忽略 */ }
  };

  /* ---------------------------------------------------------------- */
  /* 2. 学习档案跨设备同步                                            */
  /* ---------------------------------------------------------------- */
  const CODE_KEY = 'klt_sync_code';
  const TS_KEY = 'klt_profile_ts';
  let pushTimer = null, syncState = '';

  const newCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  const getCode = () => localStorage.getItem(CODE_KEY) || '';
  function setCode(c) {
    localStorage.setItem(CODE_KEY, c);
    renderSyncCard();
  }

  function localUpdatedAt() { return Number(localStorage.getItem(TS_KEY) || 0); }

  async function pushProfile(force) {
    const code = getCode();
    if (!code) return;
    const profile = loadProfile();
    const updatedAt = localUpdatedAt() || Date.now();
    try {
      syncState = '同步中…'; renderSyncCard();
      const r = await fetch(API_BASE+'/api/profile/' + encodeURIComponent(code), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, updatedAt }),
      });
      const data = await r.json();
      if (data && data.conflict) {
        // 服务端更新：拉下来覆盖本地
        localStorage.setItem('klt_profile_' + activeChild(), JSON.stringify(data.profile));
        localStorage.setItem(TS_KEY, String(data.updatedAt));
        syncState = '已拉取服务端较新档案';
      } else {
        syncState = '已同步 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      }
      renderSyncCard();
    } catch (e) {
      syncState = '同步失败（离线时不影响本地使用）';
      renderSyncCard();
    }
    if (force) toast('📡 ' + syncState);
  }

  function debouncePush() {
    if (!getCode()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushProfile(false), 1500);
  }

  async function pullProfile() {
    const code = getCode();
    if (!code) return;
    try {
      const r = await fetch(API_BASE+'/api/profile/' + encodeURIComponent(code));
      if (r.status === 404) { syncState = '同步码已就绪，等待首次上传'; renderSyncCard(); return; }
      const data = await r.json();
      const remoteTs = Number(data.updatedAt || 0);
      if (remoteTs > localUpdatedAt()) {
        localStorage.setItem('klt_profile_' + activeChild(), JSON.stringify(data.profile));
        localStorage.setItem(TS_KEY, String(remoteTs));
        syncState = '已从云端恢复档案';
        toast('📡 已同步云端档案');
      } else {
        syncState = '云端与你本地一致';
      }
      renderSyncCard();
    } catch (e) {
      syncState = '离线，暂时无法同步';
      renderSyncCard();
    }
  }

  /* 包装 saveProfile：写入时间戳并触发同步 */
  const _saveProfile = window.saveProfile;
  window.saveProfile = function (p) {
    _saveProfile.call(this, p);
    localStorage.setItem(TS_KEY, String(Date.now()));
    debouncePush();
  };

  function renderSyncCard() {
    const card = id('syncCard');
    if (!card) return;
    const code = getCode();
    card.innerHTML = `<h3>📡 跨设备同步</h3>
      <div style="color:#fff;font-size:13px;line-height:1.6;margin-bottom:8px">
        ${code
        ? `同步码：<b style="font-size:20px;letter-spacing:3px;color:#facc15">${esc(code)}</b><br>
             在另一台设备的「我的档案」里输入这个码，就能接着用同一份档案。`
        : `还没有同步码。生成一个，就能把这份档案带到手机或平板上继续用。`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${code
        ? `<button onclick="window.__sync.copy()" style="border:none;border-radius:99px;padding:8px 16px;font-weight:800;font-size:13px;background:rgba(255,255,255,.2);color:#fff;cursor:pointer">复制同步码</button>
             <button onclick="window.__sync.now()" style="border:none;border-radius:99px;padding:8px 16px;font-weight:800;font-size:13px;background:#38bdf8;color:#062a3a;cursor:pointer">立即同步</button>
             <button onclick="window.__sync.unbind()" style="border:none;border-radius:99px;padding:8px 16px;font-weight:800;font-size:13px;background:rgba(255,255,255,.14);color:#fff;cursor:pointer">解绑</button>`
        : `<button onclick="window.__sync.create()" style="border:none;border-radius:99px;padding:8px 18px;font-weight:900;font-size:13px;background:linear-gradient(90deg,#22c55e,#4ade80);color:#052e16;cursor:pointer">生成同步码</button>`}
        <input id="syncInput" placeholder="输入已有同步码" maxlength="12"
          style="flex:1;min-width:120px;border:none;border-radius:99px;padding:8px 14px;font-size:13px;outline:none">
        <button onclick="window.__sync.bind()" style="border:none;border-radius:99px;padding:8px 16px;font-weight:800;font-size:13px;background:#facc15;color:#7c2d12;cursor:pointer">绑定</button>
      </div>
      <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:8px">${esc(syncState || '本地档案始终可用，同步只是把它带到其他设备')}</div>`;
  }

  window.__sync = {
    create() {
      setCode(newCode());
      localStorage.setItem(TS_KEY, String(Date.now()));
      pushProfile(true);
      toast('✅ 同步码已生成，记下来就能在别的设备用');
    },
    async copy() {
      const code = getCode();
      if (!code) return;
      try { await navigator.clipboard.writeText(code); toast('📋 已复制：' + code); }
      catch (e) { toast('同步码：' + code); }
    },
    now() { pushProfile(true); },
    bind() {
      const input = id('syncInput');
      const v = ((input && input.value) || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(v)) { toast('同步码是 4-12 位字母或数字'); return; }
      setCode(v);
      pullProfile().then(() => pushProfile(false));
      toast('已绑定 ' + v);
    },
    unbind() {
      localStorage.removeItem(CODE_KEY);
      syncState = '已解绑，仅保留本地档案';
      renderSyncCard();
      toast('已解绑');
    },
  };

  /* 在「我的档案」页插入同步卡片 */
  function mountSyncCard() {
    const profile = id('profile');
    if (!profile || id('syncCard')) return;
    const card = document.createElement('div');
    card.id = 'syncCard';
    card.className = 'card';
    card.style.cssText = 'width:min(92vw,460px);text-align:left;font-size:13px;margin-bottom:12px';
    const btnRow = profile.lastElementChild;
    profile.insertBefore(card, btnRow);
    renderSyncCard();
  }

  /* ---------------------------------------------------------------- */
  /* 3. 新玩法                                                        */
  /* ---------------------------------------------------------------- */

  /* ---- 3.1 同屏对战 ---- */
  const duo = { active: false, pool: [], idx: 0, score: { c: 0, p: 0 }, locked: { c: false, p: false }, answered: false };

  function buildDuoSetup() {
    const el = document.createElement('div');
    el.className = 'screen';
    el.id = 'duoSetup';
    el.innerHTML = `
      <div class="logo" style="font-size:min(8vw,40px)">🤝 同屏对战</div>
      <div class="sub">一台设备，两人各占一边抢答</div>
      <div class="card" style="width:min(92vw,420px)">
        <h3>📚 选择年级</h3>
        <div class="chips" id="dgChips">
          <div class="chip on" data-g="1">一年级</div><div class="chip" data-g="2">二年级</div><div class="chip" data-g="3">三年级</div>
          <div class="chip" data-g="4">四年级</div><div class="chip" data-g="5">五年级</div><div class="chip" data-g="6">六年级</div>
        </div>
        <h3 style="margin-top:12px">🎯 选择科目</h3>
        <div class="chips" id="dsChips">
          <div class="chip on" data-s="mix">大混战</div><div class="chip" data-s="语文">语文</div><div class="chip" data-s="数学">数学</div>
          <div class="chip" data-s="科学">科学</div><div class="chip" data-s="英语">英语</div><div class="chip" data-s="品德">品德</div><div class="chip" data-s="安全">安全</div>
        </div>
      </div>
      <button class="btn" onclick="window.__duo.start()">开始对战</button>
      <div class="status" id="duoStatus"></div>
      <button class="btn blue" style="width:auto;padding:12px 30px;margin-top:12px" onclick="location.reload()">🏠 返回大厅</button>`;
    document.body.appendChild(el);
    el.querySelectorAll('#dgChips .chip').forEach(c => c.onclick = () => {
      el.querySelectorAll('#dgChips .chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
    });
    el.querySelectorAll('#dsChips .chip').forEach(c => c.onclick = () => {
      el.querySelectorAll('#dsChips .chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
    });
  }

  function buildDuoPlay() {
    const el = document.createElement('div');
    el.className = 'screen';
    el.id = 'duoPlay';
    el.style.cssText = 'position:fixed;inset:0;padding:12px;justify-content:space-between';
    el.innerHTML = `
      <div style="width:100%;display:flex;align-items:center;justify-content:space-between;color:#fff;font-weight:900">
        <span style="color:#93c5fd">🧒 孩子 <span id="duoC">0</span></span>
        <span style="font-size:13px;opacity:.85" id="duoRound">1/10</span>
        <span style="color:#fdba74"><span id="duoP">0</span> 家长 👨</span>
      </div>
      <div class="qcard" style="width:100%;max-width:560px;margin:6px 0">
        <div class="banner pk" id="duoBanner">⚔️ 谁先答对谁得分</div>
        <div class="qmeta" id="duoMeta"></div>
        <div class="qtext" id="duoText" style="font-size:min(5vw,20px)"></div>
      </div>
      <div style="width:100%;max-width:560px">
        <div style="color:#93c5fd;font-weight:800;font-size:13px;margin:4px 0">🧒 孩子作答</div>
        <div id="duoCAns" style="display:grid;grid-template-columns:1fr 1fr;gap:6px"></div>
        <div style="color:#fdba74;font-weight:800;font-size:13px;margin:8px 0 4px">👨 家长作答</div>
        <div id="duoPAns" style="display:grid;grid-template-columns:1fr 1fr;gap:6px"></div>
      </div>`;
    document.body.appendChild(el);
  }

  const answerBtnStyle = (color) =>
    `border:none;border-radius:12px;padding:12px 8px;font-size:13px;font-weight:800;color:#fff;` +
    `background:${color};cursor:pointer;box-shadow:0 4px 0 rgba(0,0,0,.25);transition:.12s`;

  window.__duo = {
    async start() {
      const g = currentGrade('#dgChips'), s = currentSubject('#dsChips');
      const st = id('duoStatus');
      if (st) st.textContent = '取题中…';
      let pool;
      try { pool = await fetchQuestions(g, s, 10, 2); }
      catch (e) { if (st) st.textContent = '取题失败，请确认服务已启动'; return; }
      duo.pool = pool; duo.idx = 0; duo.score = { c: 0, p: 0 }; duo.active = true;
      if (!id('duoPlay')) buildDuoPlay();
      show('duoPlay');
      nextDuo();
    },
    close() { duo.active = false; }
  };

  function nextDuo() {
    if (!duo.active) return;
    if (duo.idx >= duo.pool.length) return endDuo();
    const q = duo.pool[duo.idx];
    duo.answered = false;
    duo.locked = { c: false, p: false };
    id('duoRound').textContent = `${duo.idx + 1}/${duo.pool.length}`;
    id('duoC').textContent = duo.score.c;
    id('duoP').textContent = duo.score.p;
    id('duoMeta').textContent = `科目：${q.subj}` + (q.kp ? ` · ${q.kp}` : '');
    id('duoText').textContent = q.text;
    id('duoBanner').className = 'banner pk';
    id('duoBanner').textContent = '⚔️ 谁先答对谁得分';

    const colors = ['linear-gradient(135deg,#ef4444,#f87171)', 'linear-gradient(135deg,#3b82f6,#60a5fa)',
      'linear-gradient(135deg,#f59e0b,#fbbf24)', 'linear-gradient(135deg,#22c55e,#4ade80)'];
    const fill = (boxId, who, tint) => {
      const box = id(boxId);
      box.innerHTML = '';
      q.options.forEach((text, i) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = answerBtnStyle(colors[i]);
        if (tint) b.style.boxShadow = 'inset 0 0 0 2px ' + tint;
        b.onclick = () => duoAnswer(who, i, b);
        box.appendChild(b);
      });
    };
    fill('duoCAns', 'c', 'rgba(147,197,253,.5)');
    fill('duoPAns', 'p', 'rgba(253,186,116,.5)');
  }

  function duoAnswer(who, i, btn) {
    if (duo.answered || duo.locked[who]) return;
    const q = duo.pool[duo.idx];
    const ok = i === q.correct;
    if (!ok) {
      duo.locked[who] = true;
      btn.style.opacity = '.35';
      btn.textContent = '✘ ' + btn.textContent;
      if (who === 'c') sndNO(); else beep(180, .2, 'sawtooth', .1);
      // 两边都答错或都被锁 → 公布答案
      if (duo.locked.c && duo.locked.p) return revealDuo(null);
      return;
    }
    duo.answered = true;
    duo.score[who] += 1;
    id(who === 'c' ? 'duoC' : 'duoP').textContent = duo.score[who];
    sndOK();
    id('duoBanner').textContent = who === 'c' ? '🧒 孩子抢到了！' : '👨 家长抢到了！';
    revealDuo(who, btn);
  }

  function revealDuo(winner, btn) {
    const q = duo.pool[duo.idx];
    // 标出正确答案
    ['duoCAns', 'duoPAns'].forEach(boxId => {
      [...id(boxId).children].forEach((b, i) => {
        b.style.pointerEvents = 'none';
        if (i === q.correct) b.style.boxShadow = '0 0 0 3px #fff, 0 0 18px #22c55e';
      });
    });
    if (!winner) {
      id('duoBanner').className = 'banner wait';
      id('duoBanner').textContent = '😅 都没答对，正确答案：' + q.options[q.correct];
    }
    duo.idx += 1;
    setTimeout(nextDuo, 1300);
  }

  function endDuo() {
    duo.active = false;
    const c = duo.score.c, p = duo.score.p;
    const res = c === p ? 'draw' : (c > p ? 'c' : 'p');
    // 计入档案：整段结算走同一入口，一次写入
    // （早先先 saveProfile(prof) 再 bumpDaily/awardGameXP，
    //   后两者各自 load→save，会用旧快照把先写的覆盖回去）
    let xpMsg = '';
    try {
      const gxp = mutateProfile(prof => {
        prof.totalQ = (prof.totalQ || 0) + duo.pool.length;
        prof.totalCorrect = (prof.totalCorrect || 0) + c;
        const d = daily(prof);
        d.correct = (d.correct || 0) + c;
        if (res === 'c') d.wins = (d.wins || 0) + 1;
        const oldLv = subjLevel(prof.xp.mix || 0);
        const gain = c * 8 + (res === 'c' ? 40 : res === 'draw' ? 20 : 8);
        prof.xp.mix = (prof.xp.mix || 0) + gain;
        return { oldLv, newLv: subjLevel(prof.xp.mix || 0), gain };
      });
      xpMsg = `（孩子 +${gxp.gain} XP${gxp.newLv > gxp.oldLv ? ' · 段位晋升！' : ''}）`;
      renderHomeQuests();
    } catch (e) { xpMsg = ''; }
    const el = document.createElement('div');
    el.className = 'screen active';
    el.id = 'duoEnd';
    el.innerHTML = `
      <div class="trophy">${res === 'c' ? '🏆' : res === 'p' ? '💪' : '🤝'}</div>
      <div class="rt">${res === 'c' ? '孩子赢了！' : res === 'p' ? '家长赢了！' : '平局！'}</div>
      <div class="rs">${xpMsg}</div>
      <div class="board">
        <div class="sb c"><div class="n">${c}</div><div style="font-size:13px;opacity:.85">🧒 孩子</div></div>
        <div class="sb"><div class="n" style="color:#fff">:</div></div>
        <div class="sb p"><div class="n">${p}</div><div style="font-size:13px;opacity:.85">👨 家长</div></div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
        <button class="btn" style="width:auto;padding:14px 30px" onclick="document.getElementById('duoEnd').remove();window.__duo.start()">🔄 再来一局</button>
        <button class="btn blue" style="width:auto;padding:14px 30px" onclick="location.reload()">🏠 返回大厅</button>
      </div>`;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.body.appendChild(el);
    confetti();
  }

  /* ---- 3.2 错题挑战赛（复用单人闯关界面，答对即消错） ---- */
  window.__challengeStart = async function () {
    const p = Object.assign(defaultProfile(), loadProfile());
    const wrongs = (p.wrongs || []).filter(w => Array.isArray(w.options) && w.options.length === 4);
    if (wrongs.length < 3) { toast('错题本里至少要有 3 道题，先去闯几关吧～'); return; }
    const pool = wrongs.slice(0, 10).map(w => ({
      subj: w.subj,
      text: w.text,
      options: w.options.slice(),
      correct: Math.max(0, w.options.indexOf(w.correct)),
      kp: w.kp || (w.subj + '基础'),
    }));
    window.__challenge = { active: true, killed: 0, total: pool.length };
    soloPool = pool; soloIdx = 0; soloScore = 0; soloXP = 0; soloStreak = 0; soloWrongs = [];
    soloGrade = '1'; soloSubject = 'mix';
    soloT0 = Date.now();
    show('solo');
    id('soloTitle').textContent = '错题挑战';
    id('soloScore').textContent = 0;
    id('soloStreak').textContent = '';
    toast('📒 只考错题：答对一题就消灭一题');
    nextSolo();
  };

  const _soloEnd2 = window.soloEnd; // 已被上面包装过，这里再包一层用于收尾提示
  window.soloEnd = function () {
    const ch = window.__challenge;
    _soloEnd2.call(this);
    if (ch && ch.active) {
      ch.active = false;
      setTimeout(() => toast(`🗑 本轮消灭 ${ch.killed}/${ch.total} 道错题`), 600);
      window.__challenge = null;
    }
  };

  /* ---- 3.3 极速 60 秒 ---- */
  const combo = { pool: [], i: 0, score: 0, mult: 1, streak: 0, best: 0, right: 0, left: 60, timer: null, running: false, busy: false };

  function buildCombo() {
    const el = document.createElement('div');
    el.className = 'screen';
    el.id = 'combo';
    el.style.cssText = 'position:fixed;inset:0;padding:12px;justify-content:flex-start';
    el.innerHTML = `
      <div style="width:100%;max-width:560px;display:flex;justify-content:space-between;color:#fff;font-weight:900;margin-bottom:6px">
        <span>⏱ <span id="cbLeft">60</span>s</span>
        <span style="color:#facc15">🏅 <span id="cbScore">0</span></span>
        <span style="color:#f472b6">×<span id="cbMult">1.0</span></span>
      </div>
      <div class="timerwrap" style="width:100%;max-width:560px"><div class="timerbar" id="cbBar" style="width:100%"></div></div>
      <div class="qcard" style="width:100%;max-width:560px;margin:10px 0">
        <div class="banner pk" id="cbBanner">🔥 连对越多，倍率越高</div>
        <div class="qmeta" id="cbMeta"></div>
        <div class="qtext" id="cbText"></div>
      </div>
      <div class="answers" id="cbAns" style="max-width:560px"></div>`;
    document.body.appendChild(el);
  }

  window.__combo = {
    async start() {
      if (!id('combo')) buildCombo();
      try { combo.pool = await fetchQuestions(currentGrade('#sgChips'), currentSubject('#ssChips'), 12, 2); }
      catch (e) { toast('取题失败，请确认服务已启动'); return; }
      Object.assign(combo, { i: 0, score: 0, mult: 1, streak: 0, best: 0, right: 0, left: 60, running: true, busy: false });
      show('combo');
      id('cbBar').style.width = '100%';
      nextCombo();
      clearInterval(combo.timer);
      combo.timer = setInterval(() => {
        combo.left -= 0.1;
        if (combo.left <= 0) { combo.left = 0; endCombo(); }
        id('cbLeft').textContent = Math.ceil(combo.left);
        id('cbBar').style.width = (combo.left / 60 * 100) + '%';
        id('cbBar').classList.toggle('danger', combo.left <= 10);
      }, 100);
    }
  };

  async function nextCombo() {
    if (!combo.running) return;
    if (combo.i >= combo.pool.length) {
      // 题用完了再补一批（60 秒内可能答很快）
      try {
        const more = await fetchQuestions(currentGrade('#sgChips'), currentSubject('#ssChips'), 12, 2);
        combo.pool = combo.pool.concat(more);
      } catch (e) { /* 用旧的兜底 */ }
      if (combo.i >= combo.pool.length) combo.i = 0;
    }
    const q = combo.pool[combo.i];
    combo.i += 1;
    combo.busy = false;
    id('cbMeta').textContent = `${q.subj}${q.kp ? ' · ' + q.kp : ''}`;
    id('cbText').textContent = q.text;
    const box = id('cbAns');
    box.innerHTML = '';
    const cls = ['a', 'b', 'c', 'd'];
    q.options.forEach((text, i) => {
      const b = document.createElement('button');
      b.className = 'ans ' + cls[i];
      b.textContent = text;
      b.onclick = () => comboAnswer(q, i, b);
      box.appendChild(b);
    });
  }

  function comboAnswer(q, i, btn) {
    if (!combo.running || combo.busy) return;
    combo.busy = true;
    const ok = i === q.correct;
    const buttons = [...id('cbAns').children];
    buttons.forEach((b, k) => {
      b.style.pointerEvents = 'none';
      if (k === q.correct) b.classList.add('correct');
      else b.classList.add('dim');
    });
    if (ok) {
      const gained = Math.round(10 * combo.mult);
      combo.score += gained;
      combo.streak += 1;
      combo.right += 1;
      combo.mult = Math.min(3, +(combo.mult + 0.2).toFixed(1));
      combo.best = Math.max(combo.best, combo.streak);
      sndOK();
      id('cbBanner').className = 'banner pk';
      id('cbBanner').textContent = `+${gained} 分 · 连对 ${combo.streak}`;
    } else {
      combo.streak = 0;
      combo.mult = 1;
      sndNO();
      id('cbBanner').className = 'banner wait';
      id('cbBanner').textContent = '✘ 正确答案：' + q.options[q.correct];
    }
    id('cbScore').textContent = combo.score;
    id('cbMult').textContent = combo.mult.toFixed(1);
    setTimeout(nextCombo, ok ? 420 : 900);
  }

  function endCombo() {
    combo.running = false;
    clearInterval(combo.timer);
    const gained = Math.round(combo.score / 10);
    let lvMsg = '';
    try {
      const gxp = mutateProfile(prof => {
        const d = daily(prof);
        d.correct = (d.correct || 0) + combo.right;
        const oldLv = subjLevel(prof.xp.mix || 0);
        prof.xp.mix = (prof.xp.mix || 0) + gained;
        return { oldLv, newLv: subjLevel(prof.xp.mix || 0) };
      });
      lvMsg = `+${gained} XP${gxp.newLv > gxp.oldLv ? ' · 段位晋升！' : ''}`;
      renderHomeQuests();
    } catch (e) { /* 忽略 */ }
    const el = document.createElement('div');
    el.className = 'screen active';
    el.id = 'comboEnd';
    el.innerHTML = `
      <div class="trophy">${combo.score >= 300 ? '🚀' : combo.score >= 150 ? '🔥' : '⏱'}</div>
      <div class="rt">${combo.score} 分</div>
      <div class="rs">最高连对 ${combo.best} 题 · 答对 ${combo.right} 题 ${lvMsg ? '· ' + lvMsg : ''}</div>
      <div class="board">
        <div class="sb"><div class="n" style="color:#facc15">${combo.score}</div><div style="font-size:13px;opacity:.85">得分</div></div>
        <div class="sb"><div class="n" style="color:#f472b6">${combo.best}</div><div style="font-size:13px;opacity:.85">最高连击</div></div>
        <div class="sb"><div class="n" style="color:#4ade80">${combo.right}</div><div style="font-size:13px;opacity:.85">答对</div></div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
        <button class="btn" style="width:auto;padding:14px 30px" onclick="document.getElementById('comboEnd').remove();window.__combo.start()">🔄 再来一次</button>
        <button class="btn blue" style="width:auto;padding:14px 30px" onclick="location.reload()">🏠 返回大厅</button>
      </div>`;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.body.appendChild(el);
    if (combo.score >= 150) confetti();
  }

  /* ---------------------------------------------------------------- */
  /* 首页入口 + 初始化                                                */
  /* ---------------------------------------------------------------- */
  function mountHomeEntries() {
    const home = id('home');
    if (!home || id('extraModes')) return;
    const wrap = document.createElement('div');
    wrap.id = 'extraModes';
    wrap.className = 'card';
    wrap.style.cssText = 'width:min(92vw,460px);text-align:center;padding:14px';
    wrap.innerHTML = `<h3 style="margin-bottom:8px">🎮 更多玩法</h3>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button onclick="show('duoSetup')" style="border:none;border-radius:14px;padding:12px 10px;font-size:13px;font-weight:900;color:#fff;cursor:pointer;background:linear-gradient(135deg,#0ea5e9,#22d3ee);box-shadow:0 4px 0 rgba(0,0,0,.25);flex:1;min-width:96px">🤝 同屏对战<small style="display:block;font-weight:500;font-size:11px;opacity:.9">一台设备两人玩</small></button>
        <button onclick="window.__challengeStart()" style="border:none;border-radius:14px;padding:12px 10px;font-size:13px;font-weight:900;color:#fff;cursor:pointer;background:linear-gradient(135deg,#ef4444,#f97316);box-shadow:0 4px 0 rgba(0,0,0,.25);flex:1;min-width:96px">📒 错题挑战<small style="display:block;font-weight:500;font-size:11px;opacity:.9">答对就消灭错题</small></button>
        <button onclick="window.__combo.start()" style="border:none;border-radius:14px;padding:12px 10px;font-size:13px;font-weight:900;color:#fff;cursor:pointer;background:linear-gradient(135deg,#8b5cf6,#a78bfa);box-shadow:0 4px 0 rgba(0,0,0,.25);flex:1;min-width:96px">⚡ 极速60秒<small style="display:block;font-weight:500;font-size:11px;opacity:.9">连击倍率加分</small></button>
      </div>`;
    home.appendChild(wrap);
  }

  function init() {
    buildDuoSetup();
    mountHomeEntries();
    mountSyncCard();
    // 启动时如果绑过同步码，先尝试拉取云端档案
    if (getCode()) pullProfile();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* 打开档案页时确保同步卡片存在（页面可能被整体重绘） */
  const _openProfile = window.openProfile;
  window.openProfile = function () {
    _openProfile.call(this);
    mountSyncCard();
    if (getCode()) pullProfile();
  };
})();
