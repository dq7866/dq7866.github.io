/* 风驰骑行 —— 本地存档（localStorage）+ 玩家标识 + 改装数据 */
var Save = (function () {
  var KEY = 'windrider.save.v2';
  var KEY_OLD = 'windrider.save.v1';

  var DEF = {
    playerId: '',         // 玩家标识（首次运行生成，云存档/排行榜的钥匙）
    nickname: '',         // 昵称
    coins: 0,             // 金币
    xp: 0,                // 经验（由骑行获得，决定等级）
    best: {},             // { trackId: 秒 }
    bestMs: {},           // { trackId: 毫秒（云同步用） }
    ghost: {},            // { trackId: 自己的最佳轨迹（离线也能跟自己比） }
    unlocked: ['commuter'],
    upgrades: {},         // { tire|aero|drive|susp|brake : 0..5 }
    totalDist: 0,         // 累计里程（米）
    sensorOn: false,
    soundOn: true,
    cloudOn: true,        // 云同步开关
    lastSync: 0,
    rides: 0,
    missions: null,       // 每日任务 { date, items[{id,type,target,text,reward,prog,done,claimed}], bonus }
    season: null          // 赛季进度 { id:'2026-10', points, rides, claimed[] }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function uid() {
    var s = '';
    var h = 'abcdef0123456789';
    for (var i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)];
    return s;
  }

  function load() {
    var d = clone(DEF);
    // 迁移旧存档
    try {
      var oldRaw = localStorage.getItem(KEY_OLD);
      if (oldRaw) {
        var o = JSON.parse(oldRaw);
        for (var k in o) if (o.hasOwnProperty(k)) d[k] = o[k];
        localStorage.removeItem(KEY_OLD);
      }
    } catch (e) {}
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var n = JSON.parse(raw);
        for (var k2 in n) if (n.hasOwnProperty(k2)) d[k2] = n[k2];
      }
    } catch (e) {}

    if (!Array.isArray(d.unlocked) || !d.unlocked.length) d.unlocked = ['commuter'];
    if (typeof d.best !== 'object' || !d.best) d.best = {};
    if (typeof d.bestMs !== 'object' || !d.bestMs) d.bestMs = {};
    if (typeof d.ghost !== 'object' || !d.ghost) d.ghost = {};
    if (typeof d.upgrades !== 'object' || !d.upgrades) d.upgrades = {};
    if (typeof d.xp !== 'number' || !isFinite(d.xp) || d.xp < 0) d.xp = 0;
    if (typeof d.coins !== 'number' || !isFinite(d.coins) || d.coins < 0) d.coins = 0;
    if (!d.playerId || typeof d.playerId !== 'string' || d.playerId.length < 8) d.playerId = uid();
    if (typeof d.nickname !== 'string') d.nickname = '';
    if (!d.missions || typeof d.missions !== 'object') d.missions = null;
    if (!d.season || typeof d.season !== 'object') d.season = null;
    d._lvReward = 0;
    return d;
  }

  var data = load();
  function flush() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  flush(); // 首次运行即落盘（生成 playerId）

  /* 等级：靠经验（骑行所得）成长，1 级起步，60 级封顶 */
  function levelOf(xp) {
    var lv = Math.floor(Math.sqrt((xp || 0) / 240)) + 1;
    return Math.max(1, Math.min(60, lv));
  }
  function xpForLevel(lv) { return Math.pow(lv - 1, 2) * 240; }

  var onChange = null;

  return {
    get: function () { return data; },
    save: flush,
    playerId: function () { return data.playerId; },
    nickname: function () { return data.nickname; },
    setNickname: function (v) {
      data.nickname = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 12);
      flush(); return data.nickname;
    },
    level: function () { return levelOf(data.xp); },
    xpInLevel: function () {
      var lv = levelOf(data.xp), a = xpForLevel(lv), b = xpForLevel(lv + 1);
      return { cur: Math.max(0, data.xp - a), need: Math.max(1, b - a), level: lv };
    },
    addCoins: function (n) { data.coins = Math.max(0, Math.round(data.coins + n)); flush(); return data.coins; },
    addXp: function (n) {
      var before = levelOf(data.xp);
      data.xp = Math.max(0, data.xp + Math.round(n));
      var after = levelOf(data.xp);
      var reward = 0;
      if (after > before) {
        // 升级奖励：每升一级送「等级 × 50」金币
        for (var lv = before + 1; lv <= after; lv++) reward += lv * 50;
        data.coins = Math.max(0, data.coins + reward);
      }
      data._lvReward = reward;
      flush();
      return after > before ? after : 0; // 返回升级后的新等级，没升级返回 0
    },
    lastLevelReward: function () { return data._lvReward || 0; },
    titleOf: function (lv) {
      lv = lv | 0;
      if (lv >= 60) return '传奇骑手';
      if (lv >= 50) return '骑行大师';
      if (lv >= 40) return '骑行达人';
      if (lv >= 30) return '风驰骑手';
      if (lv >= 20) return '骑行好手';
      if (lv >= 10) return '熟练骑手';
      if (lv >= 5) return '上路骑手';
      return '骑行新手';
    },
    title: function () { return this.titleOf(levelOf(data.xp)); },
    has: function (id) { return data.unlocked.indexOf(id) >= 0; },
    unlock: function (id) { if (this.has(id) === false) { data.unlocked.push(id); flush(); } },
    bestOf: function (tid) { return data.best[tid] == null ? null : data.best[tid]; },
    bestMsOf: function (tid) { return data.bestMs[tid] || null; },
    // 返回 true 表示破了纪录
    setBest: function (tid, sec, ghostStr) {
      var old = data.best[tid];
      var rec = false;
      if (old == null || sec < old) {
        data.best[tid] = sec;
        data.bestMs[tid] = Math.round(sec * 1000);
        if (ghostStr) data.ghost[tid] = ghostStr;
        rec = true;
      } else if (ghostStr && !data.ghost[tid]) {
        data.ghost[tid] = ghostStr;
      }
      flush(); return rec;
    },
    myGhost: function (tid) { return data.ghost[tid] || null; },
    addDist: function (m) { data.totalDist += Math.max(0, m | 0); flush(); },

    /* ---------- 改装 ---------- */
    up: function (part) { return data.upgrades[part] || 0; },
    setUp: function (part, lv) { data.upgrades[part] = Math.max(0, Math.min(5, lv | 0)); flush(); },

    setSensor: function (v) { data.sensorOn = !!v; flush(); },
    setSound: function (v) { data.soundOn = !!v; flush(); },
    setCloud: function (v) { data.cloudOn = !!v; flush(); },
    setLastSync: function (t) { data.lastSync = t; flush(); },
    incRide: function () { data.rides++; flush(); },

    /* 用云端数据覆盖本地（仅当云端更新，或本地是空档时） */
    adoptCloud: function (c) {
      if (!c) return false;
      try {
        if (typeof c.nickname === 'string' && c.nickname) data.nickname = c.nickname.slice(0, 12);
        if (typeof c.coins === 'number' && c.coins > data.coins) data.coins = c.coins;
        if (typeof c.xp === 'number' && c.xp > data.xp) data.xp = c.xp;
        if (typeof c.total_dist === 'number' && c.total_dist > data.totalDist) data.totalDist = c.total_dist;
        if (typeof c.rides === 'number' && c.rides > data.rides) data.rides = c.rides;
        var un = typeof c.unlocked === 'string' ? JSON.parse(c.unlocked) : c.unlocked;
        if (Array.isArray(un)) for (var i = 0; i < un.length; i++) if (data.unlocked.indexOf(un[i]) < 0) data.unlocked.push(un[i]);
        var ug = typeof c.upgrades === 'string' ? JSON.parse(c.upgrades) : c.upgrades;
        if (ug && typeof ug === 'object') for (var p in ug) if ((data.upgrades[p] || 0) < (ug[p] || 0)) data.upgrades[p] = ug[p];
        var b = typeof c.best === 'string' ? JSON.parse(c.best) : c.best;
        if (b && typeof b === 'object') for (var t in b) {
          var v = Number(b[t]);
          if (isFinite(v) && v > 0 && (data.best[t] == null || v < data.best[t])) {
            data.best[t] = v; data.bestMs[t] = Math.round(v * 1000);
          }
        }
        flush();
        return true;
      } catch (e) { return false; }
    },
    payload: function () {
      return {
        nickname: data.nickname || '匿名骑手',
        coins: data.coins, level: levelOf(data.xp), xp: data.xp,
        totalDist: data.totalDist, unlocked: data.unlocked,
        upgrades: data.upgrades, best: data.best, rides: data.rides
      };
    },
    reset: function () { data = clone(DEF); data.playerId = uid(); flush(); }
  };
})();
