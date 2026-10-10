/* 风驰骑行 —— 本地存档（localStorage） */
var Save = (function () {
  var KEY = 'windrider.save.v1';
  var DEF = {
    coins: 0,             // 金币总数
    best: {},             // { trackId: 秒 }
    unlocked: ['commuter'],// 已解锁车辆
    totalDist: 0,         // 累计里程（米）
    sensorOn: false,      // 体感开关
    rides: 0,             // 骑行次数
    soundOn: true
  };
  var data = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEF);
      var o = JSON.parse(raw);
      var d = clone(DEF);
      for (var k in o) if (o.hasOwnProperty(k)) d[k] = o[k];
      if (!Array.isArray(d.unlocked) || !d.unlocked.length) d.unlocked = ['commuter'];
      if (typeof d.best !== 'object' || !d.best) d.best = {};
      return d;
    } catch (e) { return clone(DEF); }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function flush() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }

  return {
    get: function () { return data; },
    save: flush,
    addCoins: function (n) { data.coins = Math.max(0, data.coins + n); flush(); return data.coins; },
    has: function (id) { return data.unlocked.indexOf(id) >= 0; },
    unlock: function (id) { if (!this.has(id)) { data.unlocked.push(id); flush(); } },
    bestOf: function (tid) { return data.best[tid] || null; },
    // 返回 true 表示破了纪录
    setBest: function (tid, sec) {
      var old = data.best[tid];
      if (old == null || sec < old) { data.best[tid] = sec; flush(); return true; }
      return false;
    },
    addDist: function (m) { data.totalDist += m; flush(); },
    setSensor: function (v) { data.sensorOn = !!v; flush(); },
    setSound: function (v) { data.soundOn = !!v; flush(); },
    incRide: function () { data.rides++; flush(); },
    reset: function () { data = clone(DEF); flush(); }
  };
})();
