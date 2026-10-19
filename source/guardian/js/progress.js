/* ============================================================
   冰火守门人 —— 成长与追求感（/guardian/js/progress.js）
   ------------------------------------------------------------
   ① 勋章成就：12 枚，覆盖波次 / 尾巴 / 巨像 / 场景 / 联机
   ② 每日任务：每天 0 点按日期种子抽 3 条，全清有额外奖励
   ③ 月度赛季：按自然月累计积分，四档奖励（青铜→钻石）
   数据落在本地存档，联网时赛季积分增量同步到云端。
   ============================================================ */
var Progress = (function () {
  "use strict";
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ================= 勋章 ================= */
  var MEDALS = [
    { id: "first",    name: "初次守门", icon: "🛡", desc: "完成第一局" },
    { id: "w10",      name: "十波不破", icon: "🔟", desc: "单局守到第 10 波" },
    { id: "w20",      name: "二十波",   icon: "💪", desc: "单局守到第 20 波" },
    { id: "w30",      name: "三十波",   icon: "🏆", desc: "单局守到第 30 波" },
    { id: "tail30",   name: "贪心尾巴", icon: "🐍", desc: "单次结算 30 颗宝石" },
    { id: "flawless", name: "滴水不漏", icon: "✨", desc: "一局不漏怪守到第 8 波" },
    { id: "boss3",    name: "巨像猎手", icon: "👑", desc: "累计击杀 3 只巨像" },
    { id: "boss10",   name: "巨像克星", icon: "⚡", desc: "累计击杀 10 只巨像" },
    { id: "hell15",   name: "地狱行者", icon: "💀", desc: "地狱难度守到第 15 波" },
    { id: "allscene", name: "踏遍五境", icon: "🗺", desc: "五张场景各玩过一局" },
    { id: "gems200",  name: "宝石商人", icon: "💎", desc: "累计结算 200 颗宝石" },
    { id: "duel",     name: "同台竞技", icon: "🤝", desc: "完成一局联机对战" }
  ];
  var MEDAL_MAP = {};
  MEDALS.forEach(function (m) { MEDAL_MAP[m.id] = m; });

  function medalIds() { return Save.get().medals || []; }
  function hasMedal(id) { return medalIds().indexOf(id) >= 0; }
  /* 检查所有勋章条件，返回本次新解锁的列表 */
  function checkMedals(stats) {
    var s = Save.get(), got = [];
    function give(id) { if (s.medals.indexOf(id) < 0) { s.medals.push(id); got.push(MEDAL_MAP[id]); } }
    if (s.runs >= 1) give("first");
    if (stats.maxWave >= 10 || s.maxWave >= 10) give("w10");
    if (stats.maxWave >= 20 || s.maxWave >= 20) give("w20");
    if (stats.maxWave >= 30 || s.maxWave >= 30) give("w30");
    if (stats.bestTail >= 30) give("tail30");
    if (stats.flawless) give("flawless");
    if (s.bosses >= 3) give("boss3");
    if (s.bosses >= 10) give("boss10");
    if (stats.hellWave >= 15) give("hell15");
    if (Object.keys(s.scenes || {}).length >= Config.SCENES.length) give("allscene");
    if (s.gems >= 200) give("gems200");
    if (s.duels >= 1) give("duel");
    if (got.length) Save.save();
    return got;
  }

  /* ================= 每日任务 ================= */
  var BONUS = 180;
  var POOL = [
    { id: "runs3",    type: "runs",   target: 3,     reward: 60,  text: "完成 3 局守门" },
    { id: "runs5",    type: "runs",   target: 5,     reward: 110, text: "完成 5 局守门" },
    { id: "score8k",  type: "score",  target: 8000,  reward: 90,  text: "单局得分达到 8000" },
    { id: "score15k", type: "score",  target: 15000, reward: 150, text: "单局得分达到 15000" },
    { id: "kill60",   type: "kills",  target: 60,    reward: 80,  text: "累计击杀 60 只魔物" },
    { id: "kill140",  type: "kills",  target: 140,   reward: 150, text: "累计击杀 140 只魔物" },
    { id: "gem40",    type: "gems",   target: 40,    reward: 80,  text: "累计结算 40 颗宝石" },
    { id: "gem90",    type: "gems",   target: 90,    reward: 150, text: "累计结算 90 颗宝石" },
    { id: "elite6",   type: "elites", target: 6,     reward: 100, text: "击杀 6 只精英魔物" },
    { id: "wave12",   type: "wave",   target: 12,    reward: 110, text: "单局守到第 12 波" },
    { id: "hard1",    type: "diff",   target: 1, diff: "hard",  reward: 120, text: "完成一局「挑战」难度" },
    { id: "hell1",    type: "diff",   target: 1, diff: "hell",  reward: 170, text: "完成一局「地狱」难度" },
    { id: "sc-lava",  type: "scene",  target: 1, scene: "lava",    reward: 90,  text: "在「熔岩裂谷」完成一局" },
    { id: "sc-forest",type: "scene",  target: 1, scene: "forest",  reward: 100, text: "在「翡翠林地」完成一局" },
    { id: "sc-citadel",type:"scene",  target: 1, scene: "citadel", reward: 130, text: "在「幽都城门」完成一局" }
  ];

  function dayKey() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function seasonKey() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function seasonName() { var d = new Date(); return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月赛季"; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function ensureDaily() {
    var d = Save.get(), k = dayKey();
    if (!d.missions || d.missions.date !== k || !Array.isArray(d.missions.items)) {
      var r = rng(hash("gk-" + k)), idx = [], i;
      for (i = 0; i < POOL.length; i++) idx.push(i);
      for (i = idx.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      var items = idx.slice(0, 3).map(function (n) {
        var m = POOL[n];
        return { id: m.id, type: m.type, target: m.target, diff: m.diff || "", scene: m.scene || "",
                 text: m.text, reward: m.reward, prog: 0, done: false, claimed: false };
      });
      d.missions = { date: k, items: items, bonus: false };
      Save.save();
    }
    return d.missions;
  }
  function addProgress(type, val, extra) {
    var m = ensureDaily();
    for (var i = 0; i < m.items.length; i++) {
      var it = m.items[i];
      if (it.done || it.type !== type) continue;
      if (type === "scene") { if (it.scene !== extra) continue; it.prog = it.target; }
      else if (type === "diff") { if (it.diff !== extra) continue; it.prog = it.target; }
      else if (type === "wave" || type === "score") it.prog = Math.max(it.prog, val);   // 单局峰值
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
    var bonus = 0, all = true;
    for (var k = 0; k < m.items.length; k++) if (!m.items[k].claimed) all = false;
    if (all && !m.bonus) { m.bonus = true; bonus = BONUS; }
    Save.addCoins(it.reward + bonus);
    Save.save();
    return { got: it.reward, bonus: bonus };
  }
  function dailySummary() {
    var m = ensureDaily(), done = 0, claimed = 0;
    for (var i = 0; i < m.items.length; i++) { if (m.items[i].done) done++; if (m.items[i].claimed) claimed++; }
    return { date: m.date, items: m.items, bonus: m.bonus, done: done, claimed: claimed, total: m.items.length,
             ready: done > claimed, allDone: done === m.items.length };
  }

  /* ================= 赛季 ================= */
  var TIERS = [
    { p: 400,  coins: 200,  icon: "🥉", name: "青铜" },
    { p: 1000, coins: 600,  icon: "🥈", name: "白银" },
    { p: 2000, coins: 1500, icon: "🥇", name: "黄金" },
    { p: 3500, coins: 3000, icon: "💠", name: "钻石" }
  ];
  var DIFF_MUL = { easy: 0.7, normal: 1, hard: 1.4, hell: 2.0 };

  function ensureSeason() {
    var d = Save.get(), k = seasonKey();
    if (!d.season || d.season.id !== k) {
      d.season = { id: k, points: 0, runs: 0, synced: 0, claimed: [] };
      Save.save();
    }
    if (!Array.isArray(d.season.claimed)) d.season.claimed = [];
    if (typeof d.season.synced !== "number") d.season.synced = 0;
    return d.season;
  }
  function pointsFor(r) {
    var base = Math.max(10, Math.round((r.score || 0) / 130) + (r.wave || 0) * 4);
    return Math.max(5, Math.round(base * (DIFF_MUL[r.diffId] || 1)));
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
    return {
      id: se.id, name: seasonName(), points: se.points, runs: se.runs,
      tiers: TIERS.map(function (t) {
        return { p: t.p, coins: t.coins, icon: t.icon, name: t.name,
                 got: se.points >= t.p, claimed: se.claimed.indexOf(t.p) >= 0 };
      })
    };
  }
  function syncDelta() { var se = ensureSeason(); return Math.max(0, se.points - (se.synced || 0)); }
  function markSynced() { var se = ensureSeason(); se.synced = se.points; Save.save(); }

  /* ================= 每日挑战 ================= */
  var DAILY_REWARD = 200;
  function dailyChallengeDone() { return Save.get().dailyCh === dayKey(); }
  function claimDailyChallenge() {
    var s = Save.get(), k = dayKey();
    if (s.dailyCh === k) return 0;
    s.dailyCh = k;
    s.dailyChDone = (s.dailyChDone || 0) + 1;
    Save.addCoins(DAILY_REWARD);
    Save.save();
    return DAILY_REWARD;
  }

  /* ================= 统一结算入口 ================= */
  /* r = { sceneId, diffId, score, wave, gem, tail, kills, elites, bosses, flawless, durationMs, duel } */
  function onFinish(r) {
    var s = Save.get();
    s.runs++; Save.bump("kills", r.kills || 0); Save.bump("elites", r.elites || 0);
    Save.bump("bosses", r.bosses || 0); Save.bump("gems", r.gem || 0);
    if (r.duel) Save.bump("duels", 1);
    s = Save.get();
    s.maxWave = Math.max(s.maxWave || 0, r.wave || 0);
    s.scenes[r.sceneId] = (s.scenes[r.sceneId] || 0) + 1;
    if (r.flawless) s.flawless = (s.flawless || 0) + 1;
    Save.save();

    /* 每日任务 */
    addProgress("runs", 1);
    addProgress("kills", r.kills || 0);
    addProgress("gems", r.gem || 0);
    addProgress("elites", r.elites || 0);
    addProgress("score", r.score || 0);
    addProgress("wave", r.wave || 0);
    addProgress("scene", 1, r.sceneId);
    addProgress("diff", 1, r.diffId);

    /* 赛季积分 */
    var se = ensureSeason();
    var pts = pointsFor(r);
    se.points += pts; se.runs++;
    Save.save();

    /* 经验与金币 */
    var xp = Math.round((r.score || 0) / 60 + (r.wave || 0) * 3);
    var lvUps = Save.addXp(xp);
    var coinMul = (Config.diffById(r.diffId) || {}).coinMul || 1;
    var coins = Math.round(((r.score || 0) / 220 + (r.gem || 0) * 1.2 + (r.bosses || 0) * 30) * coinMul);
    Save.addCoins(coins);

    var medals = checkMedals({
      maxWave: r.wave || 0, bestTail: r.tail || 0, flawless: r.flawless,
      hellWave: r.diffId === "hell" ? (r.wave || 0) : 0
    });

    return { xp: xp, coins: coins, points: pts, levelUps: lvUps, medals: medals,
             level: Save.get().level, seasonPoints: se.points };
  }

  return {
    MEDALS: MEDALS, MEDAL_MAP: MEDAL_MAP, hasMedal: hasMedal, medalIds: medalIds,
    daily: dailySummary, claim: claim, ensureDaily: ensureDaily,
    season: seasonSummary, seasonName: seasonName, claimTier: claimTier,
    syncDelta: syncDelta, markSynced: markSynced,
    DAILY_REWARD: DAILY_REWARD, dailyChallengeDone: dailyChallengeDone, claimDailyChallenge: claimDailyChallenge,
    dayKey: dayKey,
    onFinish: onFinish, pointsFor: pointsFor, TIERS: TIERS
  };
})();
