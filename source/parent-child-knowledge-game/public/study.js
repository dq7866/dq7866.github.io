/* =====================================================================
 * 知识擂台 · 学情分析
 *   1) 把答题记录按「科目 × 知识点」聚合成掌握度（已掌握/巩固中/待突破/刚接触/还没练）
 *   2) 家长最关心的「哪类题反复错」——按错误次数 + 正确率排出最该练的知识点
 *   3) 每个知识点都能一键开练（只练这一组，不掺别的知识点）
 *
 * 依赖 index.html 的全局：loadProfile / defaultProfile / activeChild /
 * show / $ / startPractice / todayKey
 * ===================================================================== */
(function () {
  'use strict';

  const id = s => document.getElementById(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SUBJ_ORDER = ['语文', '数学', '英语', '科学', '品德', '安全'];

  /* 掌握度分级：给家长一句人话，而不是一堆百分比 */
  function masteryOf(q, c) {
    if (!q) return { label: '还没练', color: '#94a3b8', rank: 4 };
    const acc = c / q;
    if (q < 3) return { label: '刚接触', color: '#38bdf8', rank: 3 };
    if (acc >= 0.85) return { label: '已掌握', color: '#4ade80', rank: 0 };
    if (acc >= 0.6) return { label: '巩固中', color: '#facc15', rank: 2 };
    return { label: '待突破', color: '#f87171', rank: 1 };
  }

  /* 错题本按知识点分组（同一道题再错只累计次数，不重复堆叠） */
  function wrongGroups(p) {
    const map = new Map();
    (p.wrongs || []).forEach(w => {
      if (!w || !w.text) return;
      const kp = w.kp || (w.subj + '基础');
      const key = w.subj + '|' + kp;
      if (!map.has(key)) map.set(key, { subj: w.subj, kp, items: [], times: 0 });
      const o = map.get(key);
      o.items.push(w);
      o.times += (w.times || 1);
    });
    return [...map.values()].sort((a, b) => b.times - a.times || b.items.length - a.items.length);
  }

  /* 连续学习天数 */
  function streakDays(hist) {
    let n = 0;
    const d = new Date();
    for (; ;) {
      const key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
      const h = hist[key];
      if (!h || !h.q) break;
      n += 1;
      d.setDate(d.getDate() - 1);
      if (n > 400) break;
    }
    return n;
  }

  /* 汇总：真实统计 + 错题兜底 + 课程标准里还没练过的知识点 */
  async function collect() {
    const p = Object.assign(defaultProfile(), loadProfile());
    const stat = new Map();

    Object.values(p.kpStat || {}).forEach(x => {
      if (!x || !x.kp) return;
      const key = x.subj + '|' + x.kp;
      stat.set(key, { subj: x.subj, kp: x.kp, q: x.q || 0, c: x.c || 0, at: x.at || 0 });
    });

    // 老档案没有 kpStat：用错题本里的知识点兜底，至少能显示"这里错过"
    (p.wrongs || []).forEach(w => {
      if (!w || !w.kp) return;
      const key = w.subj + '|' + w.kp;
      if (stat.has(key)) return;
      stat.set(key, { subj: w.subj, kp: w.kp, q: w.times || 1, c: 0, at: w.at || 0 });
    });

    // 课程标准：用于显示"还没练过"的知识点（看广度有没有漏）
    let curr = null;
    try {
      const r = await fetch('/api/curriculum');
      if (r.ok) curr = await r.json();
    } catch (e) { /* 离线也能看已练部分 */ }

    if (curr && curr.subjects) {
      Object.entries(curr.subjects).forEach(([subj, list]) => {
        (list || []).forEach(it => {
          const key = subj + '|' + it.kp;
          if (!stat.has(key)) stat.set(key, { subj, kp: it.kp, q: 0, c: 0, at: 0 });
        });
      });
    }

    const wrongMap = new Map();
    wrongGroups(p).forEach(g => wrongMap.set(g.subj + '|' + g.kp, g));

    const rows = [...stat.values()].map(x => {
      const w = wrongMap.get(x.subj + '|' + x.kp);
      const acc = x.q ? x.c / x.q : 0;
      return Object.assign({}, x, {
        acc,
        wrong: w ? w.times : 0,
        wrongItems: w ? w.items.length : 0,
        m: masteryOf(x.q, x.c),
      });
    });

    return { p, rows };
  }

  /* 最该练的排序：错误次数权重最高，其次低正确率，其次练得少的 */
  function priority(rows) {
    return rows
      .filter(r => r.wrong > 0 || (r.q >= 2 && r.acc < 0.85))
      .map(r => {
        const score = r.wrong * 30 + (1 - r.acc) * 60 + Math.min(r.q, 8) * 2;
        return Object.assign({}, r, { score });
      })
      .sort((a, b) => b.score - a.score);
  }

  function bar(acc, color) {
    const w = Math.max(2, Math.round(acc * 100));
    return `<div style="height:8px;background:rgba(255,255,255,.16);border-radius:99px;overflow:hidden;flex:1;min-width:60px">
      <div style="height:100%;width:${w}%;background:${color};border-radius:99px"></div></div>`;
  }

  function practiceBtn(subj, kp) {
    return `<button data-subj="${esc(subj)}" data-kp="${esc(kp)}"
      onclick="startPractice(this.dataset.kp,this.dataset.subj)"
      style="border:none;border-radius:99px;padding:4px 12px;font-size:12px;font-weight:900;cursor:pointer;
      background:linear-gradient(90deg,#ef4444,#f97316);color:#fff;white-space:nowrap">练这组</button>`;
  }

  async function openStudy() {
    show('study');
    id('stSummary').textContent = '正在统计…';
    id('stBody').innerHTML = `<div class="card" style="width:100%;text-align:center;font-size:13px">⏳ 正在汇总学情…</div>`;

    let data;
    try { data = await collect(); }
    catch (e) {
      id('stBody').innerHTML = `<div class="card" style="width:100%">统计失败：${esc(e.message)}</div>`;
      return;
    }
    const { p, rows } = data;
    const totalQ = p.totalQ || 0;
    const acc = totalQ ? Math.round((p.totalCorrect || 0) / totalQ * 100) : 0;
    const hist = p.hist || {};
    const days = Object.keys(hist).filter(k => (hist[k].q || 0) > 0).length;
    const streak = streakDays(hist);

    id('stSummary').textContent =
      `${activeChild()} · 累计 ${totalQ} 题 · 正确率 ${acc}% · 学习 ${days} 天` +
      (streak > 1 ? ` · 连续 ${streak} 天 🔥` : '');

    /* ---- 1. 掌握度总览 ---- */
    const cnt = { ok: 0, mid: 0, bad: 0, fresh: 0, none: 0 };
    rows.forEach(r => {
      if (r.m.label === '已掌握') cnt.ok++;
      else if (r.m.label === '巩固中') cnt.mid++;
      else if (r.m.label === '待突破') cnt.bad++;
      else if (r.m.label === '刚接触') cnt.fresh++;
      else cnt.none++;
    });
    const total = rows.length || 1;

    let html = `<div class="card" style="width:100%;margin-bottom:12px">
      <h3>📌 知识点掌握度（共 ${rows.length} 个）</h3>
      <div style="display:flex;height:14px;border-radius:99px;overflow:hidden;margin:6px 0 10px;background:rgba(255,255,255,.15)">
        ${[['ok', '#4ade80'], ['mid', '#facc15'], ['bad', '#f87171'], ['fresh', '#38bdf8'], ['none', '#64748b']]
        .map(([k, c]) => cnt[k] ? `<div style="width:${cnt[k] / total * 100}%;background:${c}"></div>` : '').join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:rgba(255,255,255,.9)">
        <span>🟢 已掌握 <b>${cnt.ok}</b></span>
        <span>🟡 巩固中 <b>${cnt.mid}</b></span>
        <span>🔴 待突破 <b>${cnt.bad}</b></span>
        <span>🔵 刚接触 <b>${cnt.fresh}</b></span>
        <span>⚪ 还没练 <b>${cnt.none}</b></span>
      </div>
    </div>`;

    /* ---- 2. 最该练的 5 个 ---- */
    const top = priority(rows).slice(0, 5);
    const freshRows = rows.filter(r => r.q === 0).slice(0, 3);
    html += `<div class="card" style="width:100%;margin-bottom:12px">
      <h3>🎯 最该练的 ${top.length || 0} 个知识点</h3>`;
    if (!top.length) {
      html += `<div style="font-size:13px;color:#4ade80;padding:6px 0">✨ 暂时没有反复错的知识点，保持每天一局的节奏就好。</div>`;
      if (freshRows.length) {
        html += `<div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:6px">想拓新的话，这几个知识点还没练过：</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${freshRows.map(r => `<span style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);border-radius:99px;padding:4px 6px 4px 12px;font-size:12px">
            ${esc(r.subj)}·${esc(r.kp)} ${practiceBtn(r.subj, r.kp)}</span>`).join('')}</div>`;
      }
    } else {
      html += top.map((r, i) => {
        const pct = r.q ? Math.round(r.acc * 100) : 0;
        const why = r.wrong >= 2 ? `反复错 ${r.wrong} 次`
          : (r.q && r.acc < 0.85) ? `正确率 ${pct}%（${r.c}/${r.q}）`
          : r.wrong ? '错过 1 次，练一轮巩固下'
          : '还没练过';
        return `<div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.18);
            border-left:3px solid ${r.m.color};border-radius:10px;padding:9px 11px;margin-bottom:7px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:800">${i + 1}. ${esc(r.subj)}·${esc(r.kp)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.75);margin-top:2px">${esc(why)}</div>
          </div>
          ${practiceBtn(r.subj, r.kp)}
        </div>`;
      }).join('');
      html += `<div style="font-size:11px;color:rgba(255,255,255,.65);margin-top:4px">
        排序依据：错得越多、正确率越低排越前。「练这组」只出这个知识点的题。</div>`;
    }
    html += `</div>`;

    /* ---- 3. 分科明细 ---- */
    const bySubj = new Map();
    rows.forEach(r => {
      if (!bySubj.has(r.subj)) bySubj.set(r.subj, []);
      bySubj.get(r.subj).push(r);
    });
    const subjKeys = [...bySubj.keys()].sort((a, b) => {
      const ia = SUBJ_ORDER.indexOf(a), ib = SUBJ_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    html += `<div class="card" style="width:100%"><h3>📚 分科知识点明细</h3>`;
    if (!subjKeys.length) {
      html += `<div style="font-size:13px;color:rgba(255,255,255,.7);padding:10px 0">还没有数据，先去闯一关吧～</div>`;
    }
    subjKeys.forEach(subj => {
      const list = bySubj.get(subj).slice().sort((a, b) => a.m.rank - b.m.rank || b.wrong - a.wrong || a.kp.localeCompare(b.kp));
      const done = list.filter(r => r.q > 0).length;
      const subjAcc = (() => {
        const q = list.reduce((s, r) => s + r.q, 0), c = list.reduce((s, r) => s + r.c, 0);
        return q ? Math.round(c / q * 100) : null;
      })();
      html += `<details style="margin-bottom:8px;background:rgba(0,0,0,.18);border-radius:10px;padding:8px 11px">
        <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;font-size:13px">
          <b style="flex:1">${esc(subj)}
            <span style="color:rgba(255,255,255,.7);font-weight:400">练过 ${done}/${list.length}</span></b>
          <span style="color:${subjAcc === null ? '#94a3b8' : subjAcc >= 85 ? '#4ade80' : subjAcc >= 60 ? '#facc15' : '#f87171'};font-weight:800">
            ${subjAcc === null ? '—' : subjAcc + '%'}</span>
        </summary>
        <div style="margin-top:8px">`;
      list.forEach(r => {
        const pct = r.q ? Math.round(r.acc * 100) : 0;
        html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px dashed rgba(255,255,255,.1)">
          <span style="flex:0 0 40%;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.kp)}</span>
          ${r.q ? bar(r.acc, r.m.color) : `<div style="flex:1;min-width:60px"></div>`}
          <span style="flex:0 0 auto;font-size:11px;color:${r.m.color};min-width:52px;text-align:right">
            ${r.q ? pct + '% · ' + r.c + '/' + r.q : '0 题'}</span>
          <span style="flex:0 0 auto;font-size:11px;color:rgba(255,255,255,.7);min-width:42px;text-align:right">${r.m.label}</span>
          ${practiceBtn(r.subj, r.kp)}
        </div>`;
      });
      html += `</div></details>`;
    });
    html += `</div>`;

    id('stBody').innerHTML = html;
  }

  /* 暴露给 index.html 的档案页使用 */
  window.wrongGroups = wrongGroups;
  window.openStudy = openStudy;
  window.kpMasteryOf = masteryOf;
})();
