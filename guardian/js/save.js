/* ============================================================
   冰火守门人 —— 本地存档（/guardian/js/save.js）
   ------------------------------------------------------------
   全部进度先写 localStorage（离线可玩），联网时再增量同步到云端。
   存档结构保持扁平，便于云端 guardian_save() 直接落库。
   ============================================================ */
var Save = (function () {
  "use strict";
  var KEY = "guardian.save.v1", PKEY = "guardian.player.v1";
  var d = null;

  function defaults() {
    return {
      v: 1, nickname: "", level: 1, xp: 0, coins: 0,
      medals: [], best: {}, runs: 0, bosses: 0, gems: 0, kills: 0,
      elites: 0, maxWave: 0, flawless: 0, duels: 0, scenes: {},
      missions: null, season: null, sound: true, tutorial: false, synced: 0,
      dailyCh: "", dailyChDone: 0
    };
  }
  function readJSON(k, def) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : def; } catch (e) { return def; }
  }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function get() {
    if (d) return d;
    d = readJSON(KEY, null) || {};
    var base = defaults();
    for (var k in base) if (!(k in d)) d[k] = base[k];
    if (!Array.isArray(d.medals)) d.medals = [];
    if (!d.best || typeof d.best !== "object") d.best = {};
    if (!d.scenes || typeof d.scenes !== "object") d.scenes = {};
    return d;
  }
  function save() { writeJSON(KEY, get()); }

  /* 玩家标识：本机首次运行生成，作为云端存档与排行榜的钥匙 */
  function playerId() {
    var id = null;
    try { id = localStorage.getItem(PKEY); } catch (e) {}
    if (id && id.length >= 8) return id;
    var a = "abcdefghijklmnopqrstuvwxyz0123456789", s = "";
    for (var i = 0; i < 16; i++) s += a[Math.floor(Math.random() * a.length)];
    try { localStorage.setItem(PKEY, s); } catch (e) {}
    return s;
  }

  function addXp(n) {
    var s = get();
    s.xp += Math.max(0, Math.round(n || 0));
    var up = 0;
    while (s.level < 60 && s.xp >= Config.xpFor(s.level)) { s.xp -= Config.xpFor(s.level); s.level++; up++; }
    save();
    return up;
  }
  function addCoins(n) { var s = get(); s.coins = Math.max(0, s.coins + Math.round(n || 0)); save(); }
  function bump(field, n) { var s = get(); s[field] = (s[field] || 0) + (n === undefined ? 1 : n); save(); }

  function bestOf(modeKey) { return get().best[modeKey] || null; }
  function setBest(modeKey, rec) {
    var s = get(), cur = s.best[modeKey];
    if (!cur || rec.score > cur.score) { s.best[modeKey] = rec; save(); return true; }
    return false;
  }

  function unlockedScenes() {
    var lv = get().level, out = [];
    Config.SCENES.forEach(function (sc) { if (lv >= sc.unlock) out.push(sc.id); });
    return out;
  }
  /* 难度解锁门槛：休闲/标准默认开，挑战 3 级，地狱 6 级 */
  var DIFF_UNLOCK = { easy: 1, normal: 1, hard: 3, hell: 6 };
  function diffUnlocked(id) { return get().level >= (DIFF_UNLOCK[id] || 1); }

  function setNick(n) {
    var s = get();
    n = String(n || "").replace(/\s+/g, " ").trim().slice(0, 12);
    s.nickname = n;
    save();
    return n;
  }
  function nick() { return get().nickname || "匿名守门人"; }

  /* 云同步：把本地整体覆盖为云端（云端为准，仅在云端更"新"时由调用方决定） */
  function mergeCloud(cloud) {
    if (!cloud || !cloud.found) return false;
    var s = get();
    s.level = Math.max(s.level, Number(cloud.level) || 1);
    s.xp = Math.max(s.xp, Number(cloud.xp) || 0);
    s.coins = Math.max(s.coins, Number(cloud.coins) || 0);
    s.runs = Math.max(s.runs, Number(cloud.runs) || 0);
    try {
      var md = JSON.parse(cloud.medals || "[]");
      if (Array.isArray(md)) md.forEach(function (m) { if (s.medals.indexOf(m) < 0) s.medals.push(m); });
    } catch (e) {}
    try {
      var bt = JSON.parse(cloud.best || "{}");
      if (bt && typeof bt === "object") for (var k in bt) if (!s.best[k] || (bt[k].score || 0) > (s.best[k].score || 0)) s.best[k] = bt[k];
    } catch (e) {}
    if (cloud.nickname && !s.nickname) s.nickname = cloud.nickname;
    save();
    return true;
  }

  return {
    get: get, save: save, defaults: defaults, playerId: playerId,
    addXp: addXp, addCoins: addCoins, bump: bump,
    bestOf: bestOf, setBest: setBest, unlockedScenes: unlockedScenes,
    diffUnlocked: diffUnlocked, setNick: setNick, nick: nick, mergeCloud: mergeCloud
  };
})();
