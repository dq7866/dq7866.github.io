/* ============================================================
   风驰骑行 —— 成长进度（/bike/js/progress.js）
   ------------------------------------------------------------
   两块内容：
   1) 每日任务：每天 0 点按日期种子从任务池抽 3 条，三项全完成有额外奖励
   2) 赛季：按自然月（如 2026-10），每趟按成绩换算赛季积分，积分可换档位奖励
   数据都存在 Save 的本地存档里（key: windrider.save.v2）
   ============================================================ */
var Progress = (function () {
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ================= 每日任务 ================= */
  var BONUS = 150;   // 三项全完成的额外奖励

  var POOL = [
    { id: 'rides3',    type: 'rides',  target: 3,    reward: 80,  text: '完成 3 趟骑行' },
    { id: 'rides5',    type: 'rides',  target: 5,    reward: 140, text: '完成 5 趟骑行' },
    { id: 'dist4k',    type: 'dist',   target: 4000, reward: 90,  text: '累计骑行 4 公里' },
    { id: 'dist8k',    type: 'dist',   target: 8000, reward: 160, text: '累计骑行 8 公里' },
    { id: 'coin40',    type: 'coins',  target: 40,   reward: 80,  text: '捡到 40 枚金币' },
    { id: 'coin80',    type: 'coins',  target: 80,   reward: 150, text: '捡到 80 枚金币' },
    { id: 'trick150',  type: 'trick',  target: 150,  reward: 80,  text: '累计技巧分 150' },
    { id: 'trick300',  type: 'trick',  target: 300,  reward: 140, text: '累计技巧分 300' },
    { id: 'rec1',      type: 'record', target: 1,    reward: 120, text: '刷新任意赛道纪录' },
    { id: 'tb_valley', type: 'track',  target: 1, track: 'valley',   reward: 90,  text: '完成一趟「起伏乡道」' },
    { id: 'tb_mount',  type: 'track',  target: 1, track: 'mountain', reward: 110, text: '完成一趟「盘山公路」' },
    { id: 'tb_narrow', type: 'track',  target: 1, track: 'narrow',   reward: 130, text: '完成一趟「峡谷窄道」' },
    { id: 'tb_rain',   type: 'track',  target: 1, track: 'rain',     reward: 130, text: '完成一趟「雨天湿滑」' },
    { id: 'tb_wind',   type: 'track',  target: 1, track: 'wind',     reward: 130, text: '完成一趟「风口风原」' }
  ];

  function dayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function ensureDaily() {
    var d = Save.get(), k = dayKey();
    if (!d.missions || d.missions.date !== k || !Array.isArray(d.missions.items)) {
      var r = rng(hash('wr-' + k)), idx = [], i;
      for (i = 0; i < POOL.length; i++) idx.push(i);
      for (i = idx.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      var items = idx.slice(0, 3).map(function (n) {
        var m = POOL[n];
        return { id: m.id, type: m.type, target: m.target, track: m.track || '', text: m.text, reward: m.reward, prog: 0, done: false, claimed: false };
      });
      d.missions = { date: k, items: items, bonus: false };
      Save.save();
    }
    return d.missions;
  }

  function addProgress(type, val, trackId) {
    var m = ensureDaily();
    for (var i = 0; i < m.items.length; i++) {
      var it = m.items[i];
      if (it.done || it.type !== type) continue;
      if (type === 'track') { if (it.track !== trackId) continue; it.prog = it.target; }
      else it.prog = Math.min(it.target, it.prog + (val || 0));
      if (it.prog >= it.target) it.done = true;
    }
    Save.save();
  }

  function claim(id) {
    var m = ensureDaily(), it = null;
    for (var i = 0; i < m.items.length; i++) if (m.items[i].id === id) it = m.items[i];
    if (!it || !it.done || it.claimed) return null;
    it.claimed = true;
    var got = it.reward, bonus = 0, all = true;
    for (var k = 0; k < m.items.length; k++) if (!m.items[k].claimed) all = false;
    if (all && !m.bonus) { m.bonus = true; bonus = BONUS; }
    Save.addCoins(got + bonus);
    Save.save();
    return { got: got, bonus: bonus, reward: it.reward };
  }

  function dailySummary() {
    var m = ensureDaily(), done = 0, claimed = 0;
    for (var i = 0; i < m.items.length; i++) { if (m.items[i].done) done++; if (m.items[i].claimed) claimed++; }
    return {
      date: m.date, items: m.items, bonus: m.bonus,
      done: done, claimed: claimed, total: m.items.length,
      ready: done > claimed, allDone: done === m.items.length
    };
  }

  /* ================= 赛季 ================= */
  var TIERS = [
    { p: 300,  coins: 200,  icon: '🥉', name: '青铜' },
    { p: 800,  coins: 500,  icon: '🥈', name: '白银' },
    { p: 1500, coins: 1200, icon: '🥇', name: '黄金' }
  ];
  // 赛道难度系数：越难每趟挣的赛季积分越多
  var DIFF = { city: 1.0, valley: 1.15, mountain: 1.3, narrow: 1.5, rain: 1.5, wind: 1.5 };

  function seasonKey() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function seasonName() { var d = new Date(); return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月赛季'; }

  function ensureSeason() {
    var d = Save.get(), k = seasonKey();
    if (!d.season || d.season.id !== k) {
      d.season = { id: k, points: 0, rides: 0, synced: 0, claimed: [] };
      Save.save();
    }
    if (!Array.isArray(d.season.claimed)) d.season.claimed = [];
    if (typeof d.season.synced !== 'number') d.season.synced = 0;
    return d.season;
  }

  function pointsFor(r) {
    var base = Math.max(8, 52 - (r.time || 0) * 0.35) + (r.trick || 0) * 0.05 + (r.coins || 0) * 0.15;
    var mul = DIFF[r.trackId] || 1;
    return Math.max(5, Math.round(base * mul));
  }

  /* 完赛统一入口：结算时调用一次，驱动每日任务进度 + 赛季积分 */
  function onFinish(r) {
    addProgress('rides', 1);
    addProgress('dist', r.dist || 0);
    addProgress('coins', r.coins || 0);
    addProgress('trick', Math.round(r.trick || 0));
    if (r.record) addProgress('record', 1);
    addProgress('track', 1, r.trackId);

    var se = ensureSeason();
    var pts = pointsFor(r);
    se.points += pts; se.rides++;
    Save.save();
    return { points: pts, points_total: se.points };
  }

  function claimTier(p) {
    var se = ensureSeason(), tier = null;
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].p === p) tier = TIERS[i];
    if (!tier || se.points < tier.p || se.claimed.indexOf(p) >= 0) return 0;
    se.claimed.push(p);
    Save.addCoins(tier.coins);
    Save.save();
    return tier.coins;
  }

  function seasonSummary() {
    var se = ensureSeason();
    var tiers = TIERS.map(function (t) {
      return { p: t.p, coins: t.coins, icon: t.icon, name: t.name, got: se.points >= t.p, claimed: se.claimed.indexOf(t.p) >= 0 };
    });
    return { id: se.id, points: se.points, rides: se.rides, tiers: tiers };
  }

  /* 供云同步：未提交的增量积分 */
  function syncDelta() {
    var se = ensureSeason();
    return Math.max(0, se.points - (se.synced || 0));
  }
  function markSynced() {
    var se = ensureSeason();
    se.synced = se.points;
    Save.save();
  }

  return {
    daily: dailySummary,
    claim: claim,
    ensureDaily: ensureDaily,
    season: seasonSummary,
    seasonName: seasonName,
    claimTier: claimTier,
    syncDelta: syncDelta,
    markSynced: markSynced,
    onFinish: onFinish,
    pointsFor: pointsFor
  };
})();
