/* 种质库与杂交育种：把两粒同种种子杂交，融合活力并提高突变率 */
const CROSS_COST = 60;            // 每次杂交的场地费
const CROSS_MUT = { big: 0.06, small: 0.20 };  // 杂交的突变概率（高于自然繁殖的 2% / 12%）

// 两粒种子杂交：子代活力取两者均值再上浮，突变率更高
function crossBreed(a, b, rnd) {
  const r = (typeof rnd === 'function') ? rnd : Math.random;
  const gen = Math.max(a.gen || 1, b.gen || 1) + 1;
  const base = ((a.vig || 0) + (b.vig || 0)) / 2;
  const best = Math.max(a.vig || 0, b.vig || 0);
  // 杂种优势：均值之上小幅增益；但不能凭空超过最优亲本太多
  const heterosis = 1.6 + (r() * 1.6 - 0.8);
  let vig = Math.min(base + heterosis, best + 3);
  let mut = null;
  const roll = r();
  if (roll < CROSS_MUT.big) { const d = r() < 0.45 ? -12 : 12; vig += d; mut = { dir: d > 0 ? 'up' : 'down', d: Math.abs(d), big: true }; }
  else if (roll < CROSS_MUT.small) { const d = r() * 8 - 4; vig += d; mut = { dir: d > 0 ? 'up' : 'down', d: Math.abs(d), big: false }; }
  vig = Math.max(VIG_MIN, Math.min(VIG_MAX, Math.round(vig * 10) / 10));
  return { gen, vig, mut, heterosis: Math.round(heterosis * 10) / 10, lineage: mergeLineage(a, b) };
}

// 血缘：保留最近 4 条来源描述
function mergeLineage(a, b) {
  const la = (a.lineage && a.lineage.length) ? a.lineage.slice(0, 2) : [`G${a.gen}·${(a.vig || 0) > 0 ? '+' : ''}${a.vig || 0}`];
  const lb = (b.lineage && b.lineage.length) ? b.lineage.slice(0, 2) : [`G${b.gen}·${(b.vig || 0) > 0 ? '+' : ''}${b.vig || 0}`];
  return [`G${a.gen}×G${b.gen}`].concat(la, lb).slice(0, 4);
}

// 种质库：某物种当前持有的种子（不包含正在培育的植株）
function germplasm(st, speciesId) {
  const inv = st.inventory[speciesId];
  if (!Array.isArray(inv)) return [];
  return inv.map((s, i) => ({ idx: i, gen: s.gen || 1, vig: s.vig || 0 }))
    .sort((x, y) => y.vig - x.vig);
}
