/* ============================================================
   远缘嫁接 · 界面层
   与杂交育种共用一套视觉语言（.crossPick / .crSeed / .csName 等），
   因为玩家对它们的心智模型是同一类"把两个东西拼起来"。
   区别在于：嫁接多了「亲和度仪表」和「结果分级」，失败要有痛感。
   ============================================================ */

let graftCtx = { host: null, scion: null };

function graftSpeciesPool() {
  // 只要有种子（或已解锁）就能当亲本，避免"想试却没材料"的挫败
  return SPECIES_ORDER.filter(id => seedCount(id) > 0 || (S.codex[id] && S.codex[id].seen.length > 0));
}

function seedCount(id) {
  const inv = S.inventory[id];
  if (Array.isArray(inv)) return inv.length;
  // 新档/老档可能把库存存成纯数字（"3 粒"），统一折算，避免候选池误判为空
  const n = Number(inv);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function openGraft() {
  const pool = graftSpeciesPool();
  if (pool.length < 2) return toast('至少需要两个已解锁的物种才能尝试嫁接', 'warn');
  graftCtx = { host: graftCtx.host || pool[0], scion: graftCtx.scion || pool[1] };
  if (graftCtx.host === graftCtx.scion) graftCtx.scion = pool.find(x => x !== graftCtx.host);
  renderGraft();
  $('#graftModal').classList.add('show');
}

function renderGraft() {
  renderGraftBank();       // 库存先渲染：下面的分支有多个提前 return，不能放在末尾
  const pool = graftSpeciesPool();
  const hostSp = SPECIES[graftCtx.host], scionSp = SPECIES[graftCtx.scion];
  const ok = hostSp && scionSp && graftCtx.host !== graftCtx.scion;

  // ---- 两个槽位：砧木 / 接穗 ----
  const slotHtml = (sp, tag, cls) => {
    if (!sp) return `<span class="csHint">点左侧列表选择${tag}</span>`;
    const seeds = seedCount(sp.id);
    return `<div class="csName">${tag} · ${sp.name}</div>
      <div class="csMeta">${sp.latin}</div>
      <div class="csVig">持有 ${seeds} 份 · ${HAB[sp.habitat] || sp.habitat}</div>`;
  };
  $('#graftA').innerHTML = slotHtml(hostSp, '砧木（根）', 'A');
  $('#graftB').innerHTML = slotHtml(scionSp, '接穗（枝）', 'B');
  $('#graftA').classList.toggle('filled', !!hostSp);
  $('#graftB').classList.toggle('filled', !!scionSp);

  // ---- 候选列表：分两栏，各自可点选 ----
  const col = (tag, cur) => `<div class="gpCol" data-gpcol="${tag}">
    <div class="gpColHead">选为${tag === 'host' ? '砧木' : '接穗'}</div>
    ${pool.map(id => {
      const sp = SPECIES[id];
      const on = cur === id;
      return `<button class="gpItem ${on ? 'on' : ''}" data-gpsp="${id}" data-gptag="${tag}">
        <span class="gpName">${sp.name}</span>
        <span class="gpN">×${seedCount(id)}</span>
      </button>`;
    }).join('')}
  </div>`;
  $('#graftPick').innerHTML = col('host', graftCtx.host) + col('scion', graftCtx.scion);

  // ---- 亲和度仪表 ----
  const pv = $('#graftPreview');
  const btn = $('#btnGraft');
  if (!ok) {
    pv.innerHTML = `<span class="crNote">选择两个不同物种后，这里会显示亲和度与风险</span>`;
    btn.disabled = true;
    btn.textContent = `开始嫁接（${GRAFT_COST} 币）`;
    return;
  }
  const prof = graftProfile(graftCtx.host, graftCtx.scion);
  const odd = graftOdds(graftCtx.host, graftCtx.scion, 0, 0);
  const pct = Math.round(odd.p * 100);
  const lvl = odd.p >= 0.34 ? 'high' : odd.p >= 0.16 ? 'mid' : 'low';
  const lvlText = { high: '亲和良好', mid: '勉强可接', low: '近乎不亲和' }[lvl];
  const known = !!GRAFT_TABLE[graftKey(graftCtx.host, graftCtx.scion)];

  pv.innerHTML = `
    <div class="gpResult">
      <div class="gpName">${known ? prof.name : '未记载组合'}</div>
      <div class="gpNote">${prof.note}</div>
    </div>
    <div class="gpMeter">
      <div class="gpMeterTop"><span>成活率预估</span><b class="${lvl}">${pct}% · ${lvlText}</b></div>
      <div class="gpBar"><i class="${lvl}" style="width:${pct}%"></i></div>
      <div class="gpWarn">${pct < 20
        ? '⚠ 失败会枯死接穗，并额外损失 60 币清理费'
        : pct < 40
          ? '成功率一般：接活后可获得独特嫁接体，售价高于普通货'
          : '该组合亲和性较好，值得一试'}</div>
    </div>`;

  const lackA = seedCount(graftCtx.host) < 1, lackB = seedCount(graftCtx.scion) < 1;
  if (lackA || lackB) {
    const who = lackA ? SPECIES[graftCtx.host].name : SPECIES[graftCtx.scion].name;
    btn.disabled = true;
    btn.textContent = `${who} 没有可用的种质`;
    return;
  }
  btn.disabled = S.coins < GRAFT_COST;
  btn.textContent = S.coins < GRAFT_COST ? `金币不足（需 ${GRAFT_COST}）` : `开始嫁接（${GRAFT_COST} 币）`;
}

function doGraftClick() {
  if (S.coins < GRAFT_COST) return;
  const a = graftCtx.host, b = graftCtx.scion;
  if (!a || !b || a === b) return;
  // 嫁接要真的消耗材料：两边各取一份。不消耗的话玩家可以无限刷，失去"赌"的重量
  const ga = seedList(a), gb = seedList(b);
  if (!ga.length || !gb.length) return toast('双方都需要至少一份种质才能嫁接', 'warn');
  S.coins -= GRAFT_COST;
  ga.shift(); gb.shift();
  const res = doGraft(a, b);
  sfx('device');                        // 手术时的金属器械声
  const hostSp = SPECIES[a], scionSp = SPECIES[b];

  if (res.kind === 'take') {
    const g = {
      id: 'g' + Date.now() + '-' + Math.floor(Math.random() * 999),
      host: a, scion: b, name: res.prof.name,
      vig: res.vig, gen: res.gen, bonus: res.bonus,
      day: S.day
    };
    graftStore(S).push(g);
    S.stats.grafts = (S.stats.grafts || 0) + 1;
    S.stats.graftTake = (S.stats.graftTake || 0) + 1;
    hitTask('graft');
    addLog(S, `嫁接成功：「${res.prof.name}」（${hostSp.name} 砧 + ${scionSp.name} 穗）`, 'good');
    sfx('achv');
    showGraftResult('take', res, g);
  } else if (res.kind === 'false') {
    const extra = 60;
    S.coins = Math.max(0, S.coins - extra);
    S.stats.grafts = (S.stats.grafts || 0) + 1;
    S.stats.graftFalse = (S.stats.graftFalse || 0) + 1;
    addLog(S, `嫁接假活：接穗活了几天后萎蔫，另付 ${extra} 币清理`, 'bad');
    sfx('alarm');
    showGraftResult('false', res, null, extra);
  } else {
    S.stats.grafts = (S.stats.grafts || 0) + 1;
    S.stats.graftFail = (S.stats.graftFail || 0) + 1;
    addLog(S, `嫁接失败：${scionSp.name} 接穗与 ${hostSp.name} 不亲和`, 'bad');
    sfx('dead');
    showGraftResult('fail', res, null);
  }
  saveGame(S);
  renderGraft();
}

function showGraftResult(kind, res, g, extra) {
  const box = $('#graftResult');
  const map = {
    take: { t: '接 活 了', cls: 'ok', d: '维管束成功对接，形成层开始愈合。这是一株在自然界不会出现的植物。' },
    false: { t: '假 活', cls: 'warn', d: `接口初步愈合，但第 ${2 + Math.floor(Math.random() * 4)} 天接穗突然萎蔫——亲和性不足的典型表现。` },
    fail: { t: '不 亲 和', cls: 'bad', d: '切口褐变、接穗失水。两种植物的维管组织根本无法对话。' }
  }[kind];
  box.className = 'graftResult show ' + map.cls;
  box.innerHTML = `
    <div class="grTitle ${map.cls}">${map.t}</div>
    <div class="grDesc">${map.d}</div>
    ${kind === 'take' ? `
      <div class="grBody">
        <div class="grStat"><span>名称</span><b>${g.name}</b></div>
        <div class="grStat"><span>活力</span><b>${g.vig > 0 ? '+' : ''}${g.vig}</b></div>
        <div class="grStat"><span>产量</span><b>+${Math.round((g.bonus.yield - 1) * 100)}%</b></div>
        <div class="grStat"><span>售价</span><b>+${Math.round((g.bonus.price - 1) * 100)}%</b></div>
      </div>
      <div class="grHint">已存入「嫁接体」库，可直接播到任一培育位。</div>` : `
      <div class="grBody"><div class="grStat"><span>额外损失</span><b>−${kind === 'false' ? extra : 0} 币</b></div></div>
      <div class="grHint">远缘嫁接本就是概率游戏。同科组合的成功率更高，可以换个配方再试。</div>`}`;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// 嫁接体库：在杂交弹窗里加一个页签，或在图鉴里单独展示
function renderGraftBank() {
  const list = graftStore(S);
  const box = $('#graftBankList');
  if (!box) return;
  const cnt = $('#graftBankCount');
  if (cnt) cnt.textContent = list.length;
  if (!list.length) {
    box.innerHTML = `<div class="gbEmpty">还没有嫁接体。去「远缘嫁接」试一次——多数会失败，但接活的每一株都是孤品。</div>`;
    return;
  }
  box.innerHTML = list.map(g => `
    <div class="gbRow">
      <div class="gbName">${g.name}</div>
      <div class="gbMeta">${SPECIES[g.host] ? SPECIES[g.host].name : g.host} 砧 · ${SPECIES[g.scion] ? SPECIES[g.scion].name : g.scion} 穗 · G${g.gen}</div>
      <div class="gbVig">活力 ${g.vig > 0 ? '+' : ''}${g.vig}</div>
      <button class="btn small" data-graftplant="${g.id}">播种</button>
    </div>`).join('');
}
