/* 物种里程碑：把"养过一次"变成"养好过、养深过"
   每个物种 6 个里程碑，全部达成算该物种"通晓"，给一次额外奖励
   统计全部数据来自 records / codex / 现有存档，无需额外记录 */
function speciesMilestones(st, id) {
  const sp = SPECIES[id];
  const recs = (st.records || []).filter(r => r.species === id);
  const ok = recs.filter(r => r.success);
  const cx = (st.codex || {})[id] || { seen: [] };
  const bestQ = ok.reduce((a, r) => Math.max(a, r.quality || 0), 0);
  const bestGen = ok.reduce((a, r) => Math.max(a, r.gen || 1), 0);
  return [
    { key: 'see',   name: '初见',      desc: '解锁全部 5 个阶段',       got: (cx.seen || []).length >= 5, prog: (cx.seen || []).length, need: 5 },
    { key: 'first', name: '养活',      desc: '首次成功收获',           got: ok.length >= 1, prog: Math.min(1, ok.length), need: 1 },
    { key: 'gradeA',name: 'A 级水准',  desc: '收获一次 A 级以上',      got: bestQ >= 82, prog: bestQ >= 82 ? 1 : 0, need: 1, note: bestQ ? `最高 ${Math.round(bestQ)}` : '' },
    { key: 'gradeS',name: '特级',      desc: '收获一次 S 级',          got: bestQ >= 92, prog: bestQ >= 92 ? 1 : 0, need: 1, note: bestQ ? `最高 ${Math.round(bestQ)}` : '' },
    { key: 'gen3',  name: '三代同堂',  desc: '培育到第 3 代',          got: bestGen >= 3, prog: Math.min(3, bestGen), need: 3, note: bestGen ? `当前 G${bestGen}` : '' },
    { key: 'veteran',name:'五轮老手',  desc: '累计成功收获 5 轮',      got: ok.length >= 5, prog: Math.min(5, ok.length), need: 5 }
  ];
}

// 物种是否已"通晓"（全部里程碑达成）
function mastered(st, id) {
  return speciesMilestones(st, id).every(m => m.got);
}

// 全物种收集完成度
function collectionProgress(st) {
  const total = SPECIES_ORDER.length * 6;
  let got = 0, masteredN = 0;
  SPECIES_ORDER.forEach(id => {
    const ms = speciesMilestones(st, id);
    got += ms.filter(m => m.got).length;
    if (ms.every(m => m.got)) masteredN++;
  });
  return { got, total, pct: Math.round(got / total * 100), mastered: masteredN };
}

// 检查是否有新通晓的物种（用于发奖励）
function checkMastery(st) {
  st.mastery = st.mastery || {};
  const newly = [];
  SPECIES_ORDER.forEach(id => {
    if (!st.mastery[id] && mastered(st, id)) {
      st.mastery[id] = st.day || 1;
      newly.push(id);
    }
  });
  return newly;
}
