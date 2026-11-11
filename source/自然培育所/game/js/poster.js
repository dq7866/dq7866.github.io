/* ============================================================
   海报导出（Canvas 本地绘制，不引入任何第三方库）
   —— 年报 / 成就卡共用一套排版工具，保证单文件版离线可用
   ============================================================ */

const POSTER_FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Source Han Sans SC",sans-serif';

// 圆角矩形
function pRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 竖版渐变底 + 细颗粒感
function pBackdrop(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
  g.addColorStop(0, '#0d1a15');
  g.addColorStop(0.55, '#0a1411');
  g.addColorStop(1, '#08100d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 右上角一圈柔光，避免纯色发闷
  const rg = ctx.createRadialGradient(W * 0.82, H * 0.1, 0, W * 0.82, H * 0.1, W * 0.7);
  rg.addColorStop(0, 'rgba(120,200,160,0.16)');
  rg.addColorStop(1, 'rgba(120,200,160,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

function pText(ctx, txt, x, y, opt) {
  const o = opt || {};
  ctx.font = `${o.weight || 400} ${o.size || 14}px ${POSTER_FONT}`;
  ctx.fillStyle = o.color || '#dfe9e2';
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'alphabetic';
  if (o.maxW) {
    // 超宽截断加省略号
    let s = String(txt);
    if (ctx.measureText(s).width > o.maxW) {
      while (s.length > 1 && ctx.measureText(s + '…').width > o.maxW) s = s.slice(0, -1);
      s += '…';
    }
    ctx.fillText(s, x, y);
    return;
  }
  ctx.fillText(String(txt), x, y);
}

function pCard(ctx, x, y, w, h, opt) {
  const o = opt || {};
  pRoundRect(ctx, x, y, w, h, o.r || 14);
  ctx.fillStyle = o.fill || 'rgba(255,255,255,0.035)';
  ctx.fill();
  if (o.stroke !== false) {
    ctx.strokeStyle = o.stroke || 'rgba(140,200,165,0.13)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// 进度条：底色 + 填充
function pBar(ctx, x, y, w, h, pct, color) {
  pRoundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  const pw = Math.max(2, w * Math.max(0, Math.min(1, pct / 100)));
  pRoundRect(ctx, x, y, pw, h, h / 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// 海报落款
function pFooter(ctx, W, H, note) {
  ctx.save();
  ctx.strokeStyle = 'rgba(140,200,165,0.12)';
  ctx.beginPath(); ctx.moveTo(40, H - 62); ctx.lineTo(W - 40, H - 62); ctx.stroke();
  pText(ctx, '自然培育所 · NATURE LAB', 40, H - 38, { size: 13, color: '#7f9489', weight: 600 });
  pText(ctx, note || '', W - 40, H - 38, { size: 12, color: '#5f7268', align: 'right' });
  ctx.restore();
}

// 生成并下载
function posterDownload(canvas, name) {
  try {
    canvas.toBlob(blob => {
      if (!blob) { toast('图片生成失败', 'warn'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('图片已保存到下载目录', 'good');
    }, 'image/png');
  } catch (e) { toast('图片生成失败（浏览器限制）', 'warn'); }
}

const GRADE_COLOR = { S: '#e3b64d', A: '#79c9a0', B: '#6ea9c9', C: '#9aa39c', D: '#b5766a' };

/* ---------- 年报海报 ---------- */
function exportReportPoster() {
  if (typeof buildReport !== 'function') return;
  const r = buildReport(S);
  const ov = r.overview;
  const W = 900, H = 1280, DPR = 2;
  const cv = document.createElement('canvas');
  cv.width = W * DPR; cv.height = H * DPR;
  const ctx = cv.getContext('2d');
  ctx.scale(DPR, DPR);
  pBackdrop(ctx, W, H);

  // 标题
  pText(ctx, '培育年报', 56, 100, { size: 44, weight: 700, color: '#eaf4ed' });
  pText(ctx, `第 1 天 — 第 ${ov.gameDays} 天 · 共 ${ov.rounds} 轮 · 你的第 ${S.level || 1} 级`,
    56, 134, { size: 15, color: '#7f9489' });
  if (S.title) pText(ctx, `称号 · ${S.title}`, W - 56, 100, { size: 16, color: '#c9a24b', align: 'right', weight: 600 });

  // 六宫格核心数据
  const cards = [
    [ov.rate + '%', '成功率'],
    [ov.avgQ, '平均品质'],
    [ov.bestQ, '最高品质'],
    [ov.totalEarn, '累计收入'],
    [ov.earnPerDay, '日均收入'],
    [ov.totalDays, '培育天数']
  ];
  const cw = (W - 112 - 24 * 2) / 3, ch = 96;
  cards.forEach((c, i) => {
    const x = 56 + (i % 3) * (cw + 24), y = 176 + Math.floor(i / 3) * (ch + 20);
    pCard(ctx, x, y, cw, ch);
    pText(ctx, c[0], x + 20, y + 52, { size: 32, weight: 700, color: i === 0 && ov.rate < 60 ? '#d98b7a' : '#eaf4ed' });
    pText(ctx, c[1], x + 20, y + 76, { size: 13, color: '#7f9489' });
  });

  // 物种表现 Top 8
  let y = 420;
  pText(ctx, '物种表现', 56, y, { size: 19, weight: 700, color: '#dfe9e2' });
  pText(ctx, '按平均品质排序', W - 56, y, { size: 12, color: '#5f7268', align: 'right' });
  y += 22;
  const tops = r.species.slice(0, 8);
  if (!tops.length) {
    pText(ctx, '还没有成功的培育记录', 56, y + 24, { size: 13, color: '#5f7268' });
    y += 48;
  } else {
    tops.forEach(sp => {
      const noOk = !sp.ok;
      pText(ctx, sp.name, 56, y + 13, { size: 13, color: '#c4d3ca', maxW: 96 });
      if (noOk) {
        pText(ctx, '无成功记录', 160, y + 13, { size: 11.5, color: '#5f7268' });
        pText(ctx, `${sp.n} 次均失败`, 690, y + 13, { size: 11, color: '#5f7268' });
      } else {
        pBar(ctx, 160, y + 3, 470, 11, sp.avgQ, sp.avgQ >= 85 ? '#79c9a0' : sp.avgQ >= 70 ? '#d0b25c' : '#c0786c');
        pText(ctx, sp.avgQ, 642, y + 13, { size: 13, weight: 600, color: '#dfe9e2', align: 'right' });
        pText(ctx, `${sp.ok}/${sp.n} · 均 ${sp.avgDays} 天`, 690, y + 13, { size: 11, color: '#5f7268' });
      }
      y += 26;
    });
    y += 10;
  }

  // 品质分布
  pText(ctx, '品质分布', 56, y + 8, { size: 19, weight: 700, color: '#dfe9e2' });
  pText(ctx, `${ov.success} 次收获`, W - 56, y + 8, { size: 12, color: '#5f7268', align: 'right' });
  y += 32;
  r.dist.forEach(d => {
    pText(ctx, d.g, 56, y + 12, { size: 14, weight: 700, color: GRADE_COLOR[d.g] });
    pBar(ctx, 84, y + 3, 470, 11, d.pct, GRADE_COLOR[d.g]);
    pText(ctx, `${d.n} 件 · ${d.pct}%`, 566, y + 12, { size: 12, color: '#8fa196' });
    y += 26;
  });
  y += 14;

  // 宠物区块（只有数据才画）
  const gs = S.stats || {};
  if (gs.eggs || gs.bondMax) {
    pCard(ctx, 56, y, W - 112, 92);
    pText(ctx, '宠物养成', 76, y + 28, { size: 15, weight: 700, color: '#dfe9e2' });
    const items = [
      ['累计收蛋', (gs.eggs || 0) + ' 枚'],
      ['蛋收入', Math.round(gs.eggEarn || 0) + ' 币'],
      ['最高默契', (gs.bondMax || 0) + ''],
      ['默契满值', (gs.bondFull || 0) + ' 只']
    ];
    items.forEach((it, i) => {
      const x = 76 + i * 190;
      pText(ctx, it[1], x, y + 62, { size: 20, weight: 700, color: '#c9a24b' });
      pText(ctx, it[0], x, y + 80, { size: 11, color: '#7f9489' });
    });
    y += 112;
  }

  // 结论 tips（最多 3 条）
  if (r.tips && r.tips.length) {
    pText(ctx, '数据给出的结论', 56, y + 8, { size: 19, weight: 700, color: '#dfe9e2' });
    y += 30;
    r.tips.slice(0, 3).forEach(t => {
      const tone = t.tone === 'bad' ? '#c0786c' : t.tone === 'ok' ? '#79c9a0' : '#d0b25c';
      ctx.fillStyle = tone;
      ctx.beginPath(); ctx.arc(62, y + 7, 3, 0, Math.PI * 2); ctx.fill();
      // 结论文字可能较长，按宽度手动折行
      const maxW = W - 132;
      const raw = String(t.t).replace(/<[^>]+>/g, '');
      let line = '', ly = y + 12;
      for (const ch of raw) {
        if (ctx.measureText(line + ch).width > maxW) { pText(ctx, line, 76, ly, { size: 12, color: '#a8bab0' }); line = ch; ly += 20; }
        else line += ch;
      }
      if (line) { pText(ctx, line, 76, ly, { size: 12, color: '#a8bab0' }); ly += 20; }
      y = ly + 4;
    });
  }

  pFooter(ctx, W, H, `第 ${ov.gameDays} 天 · ${S.records ? S.records.length : 0} 份档案`);
  posterDownload(cv, `naturelab-report-day${S.day || 1}.png`);
}

/* ---------- 成就海报 ---------- */
function exportAchievePoster() {
  if (typeof ACHIEVEMENTS === 'undefined') return;
  const W = 900, H = 1110, DPR = 2;
  const cv = document.createElement('canvas');
  cv.width = W * DPR; cv.height = H * DPR;
  const ctx = cv.getContext('2d');
  ctx.scale(DPR, DPR);
  pBackdrop(ctx, W, H);

  const un = ACHIEVEMENTS.filter(a => S.achv[a.id]).length;
  const pct = Math.round((un / ACHIEVEMENTS.length) * 100);
  pText(ctx, '成就档案', 56, 100, { size: 44, weight: 700, color: '#eaf4ed' });
  pText(ctx, `第 ${S.day || 1} 天 · 已达成 ${un} / ${ACHIEVEMENTS.length} · ${pct}%`, 56, 134, { size: 15, color: '#7f9489' });
  pText(ctx, `${pct}%`, W - 56, 108, { size: 46, weight: 700, color: pct >= 100 ? '#e3b64d' : pct >= 50 ? '#79c9a0' : '#7f9489', align: 'right' });

  // 总进度条
  pBar(ctx, 56, 158, W - 112, 9, pct, pct >= 100 ? '#e3b64d' : '#79c9a0');

  // 按分类分组展示
  const CAT = { grow: '培育', quality: '品质', breed: '选育', codex: '图鉴', econ: '经济', biz: '经营', pet: '宠物' };
  const groups = {};
  ACHIEVEMENTS.forEach(a => { const c = a.cat || 'grow'; (groups[c] = groups[c] || []).push(a); });

  let y = 206;
  Object.keys(CAT).forEach(c => {
    const list = groups[c];
    if (!list) return;
    const got = list.filter(a => S.achv[a.id]).length;
    pText(ctx, CAT[c], 56, y, { size: 14, weight: 700, color: '#8fa196' });
    pText(ctx, `${got}/${list.length}`, 120, y, { size: 12, color: '#5f7268' });
    y += 10;
    const colW = (W - 112 - 12) / 2;
    list.forEach((a, i) => {
      const cx2 = 56 + (i % 2) * (colW + 12);
      const cy = y + Math.floor(i / 2) * 40;
      const done = !!S.achv[a.id];
      pCard(ctx, cx2, cy, colW, 34, {
        r: 9,
        fill: done ? 'rgba(201,162,75,0.10)' : 'rgba(255,255,255,0.022)',
        stroke: done ? 'rgba(201,162,75,0.28)' : 'rgba(140,200,165,0.09)'
      });
      pText(ctx, done ? '✓' : '·', cx2 + 12, cy + 22, {
        size: done ? 14 : 16, weight: 700, color: done ? '#c9a24b' : '#3f5048'
      });
      pText(ctx, a.name, cx2 + 30, cy + 16, { size: 12.5, weight: 600, color: done ? '#e8dcc0' : '#6b7d73', maxW: colW - 110 });
      pText(ctx, done ? `第 ${S.achv[a.id]} 天` : `+${a.reward || 60} 币`, cx2 + colW - 12, cy + 22, {
        size: 10.5, color: done ? '#8b7c56' : '#4b5b52', align: 'right'
      });
    });
    y += Math.ceil(list.length / 2) * 40 + 18;
  });

  pFooter(ctx, W, H, `成就奖励累计 ${ACHIEVEMENTS.reduce((a, c) => a + (c.reward || 0), 0)} 币`);
  posterDownload(cv, `naturelab-achv-day${S.day || 1}.png`);
}
