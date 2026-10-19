/* ============================================
   欢乐游戏盒 - 公共模块
   包含：音效引擎、用户系统、排行榜、礼花特效
   ============================================ */

/* ---------- 音效引擎 (Web Audio API 合成) ---------- */
const Sound = (() => {
  let ctx = null;
  let bgmGain = null;
  let sfxGain = null;
  let bgmOsc = null;
  let bgmInterval = null;
  let enabled = true;
  let bgmVolume = 0.15;
  let sfxVolume = 0.4;

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      bgmGain = ctx.createGain();
      sfxGain = ctx.createGain();
      bgmGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
      bgmGain.gain.value = bgmVolume;
      sfxGain.gain.value = sfxVolume;
    } catch(e) { console.warn('Web Audio not supported'); }
  }

  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, duration, type = 'sine', vol = 1, delay = 0) {
    if (!enabled || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(sfxGain);
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  return {
    init, resume,
    click() { resume(); tone(660, 0.08, 'square', 0.3); },
    select() { resume(); tone(880, 0.1, 'sine', 0.25); },
    match(combo = 1) {
      resume();
      const base = 523;
      for (let i = 0; i < 3; i++) {
        tone(base * Math.pow(1.26, i), 0.15, 'triangle', 0.4, i * 0.06);
      }
      if (combo >= 2) {
        tone(base * 2, 0.2, 'sine', 0.5, 0.2);
        tone(base * 2.5, 0.25, 'sine', 0.5, 0.3);
      }
    },
    combo(n) {
      resume();
      const notes = [523, 659, 784, 1047, 1319];
      for (let i = 0; i < Math.min(n, 5); i++) {
        tone(notes[i], 0.12, 'square', 0.35, i * 0.05);
      }
    },
    swap() { resume(); tone(440, 0.06, 'sine', 0.2); },
    invalid() { resume(); tone(200, 0.15, 'sawtooth', 0.3); },
    win() {
      resume();
      const notes = [523, 659, 784, 1047, 1319, 1568];
      notes.forEach((f, i) => tone(f, 0.25, 'triangle', 0.5, i * 0.12));
    },
    lose() {
      resume();
      tone(400, 0.3, 'sawtooth', 0.4);
      tone(300, 0.3, 'sawtooth', 0.4, 0.15);
      tone(200, 0.5, 'sawtooth', 0.4, 0.3);
    },
    levelup() {
      resume();
      [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.3, 'sine', 0.5, i * 0.08));
    },
    startBGM() {
      resume();
      if (bgmInterval || !enabled) return;
      const melody = [262, 330, 392, 523, 392, 330, 262, 196,
                      262, 330, 392, 659, 523, 392, 330, 262];
      let i = 0;
      bgmInterval = setInterval(() => {
        if (!ctx || !enabled) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = melody[i % melody.length];
        osc.connect(gain);
        gain.connect(bgmGain);
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t);
        osc.stop(t + 0.45);
        i++;
      }, 450);
    },
    stopBGM() {
      if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
    },
    setBGMVolume(v) {
      bgmVolume = v;
      if (bgmGain) bgmGain.gain.value = v;
      localStorage.setItem('bgmVolume', v);
    },
    setSFXVolume(v) {
      sfxVolume = v;
      if (sfxGain) sfxGain.gain.value = v;
      localStorage.setItem('sfxVolume', v);
    },
    setEnabled(on) {
      enabled = on;
      localStorage.setItem('soundEnabled', on ? '1' : '0');
      if (!on) this.stopBGM();
    },
    isEnabled() { return enabled; },
    loadSettings() {
      const b = localStorage.getItem('bgmVolume');
      const s = localStorage.getItem('sfxVolume');
      const e = localStorage.getItem('soundEnabled');
      if (b !== null) { bgmVolume = parseFloat(b); }
      if (s !== null) { sfxVolume = parseFloat(s); }
      if (e !== null) { enabled = e === '1'; }
    }
  };
})();

/* ---------- 用户系统 (localStorage) ---------- */
const User = (() => {
  const USERS_KEY = 'match_users';
  const CURRENT_KEY = 'match_current_user';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveAll(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

  function register(name, password) {
    name = name.trim();
    if (!name || !password) return { ok: false, msg: '请输入用户名和密码' };
    if (name.length > 12) return { ok: false, msg: '用户名最多12个字符' };
    const users = getAll();
    if (users[name]) return { ok: false, msg: '用户名已存在' };
    users[name] = {
      name, password,
      level: 1, exp: 0,
      totalScore: 0, gamesPlayed: 0, wins: 0,
      bestScore: 0, bestTime: null,
      createdAt: Date.now()
    };
    saveAll(users);
    return { ok: true, user: users[name] };
  }

  function login(name, password) {
    const users = getAll();
    const u = users[name.trim()];
    if (!u) return { ok: false, msg: '用户不存在' };
    if (u.password !== password) return { ok: false, msg: '密码错误' };
    localStorage.setItem(CURRENT_KEY, name);
    return { ok: true, user: u };
  }

  function logout() { localStorage.removeItem(CURRENT_KEY); }

  function current() {
    const name = localStorage.getItem(CURRENT_KEY);
    if (!name) return null;
    return getAll()[name] || null;
  }

  function updateCurrent(patch) {
    const name = localStorage.getItem(CURRENT_KEY);
    if (!name) return null;
    const users = getAll();
    if (!users[name]) return null;
    Object.assign(users[name], patch);
    saveAll(users);
    return users[name];
  }

  function addScore(score, won, timeUsed) {
    // 本地累积层：金币 / 全局统计 / 每日任务 / 成就 —— 存于 localStorage，未登录同样生效
    const type = window.__gameType || 'unknown';
    Stats.recordGame(type, score, won);
    const coinReward = Math.max(1, Math.floor(score / 100));
    Coins.add(coinReward);
    Stats.recordCoins(coinReward);
    setTimeout(() => Achievement.check(), 200);

    // 账号层：经验 / 等级 / 个人最高分 —— 仅登录用户
    const u = current();
    if (!u) return null;
    u.totalScore += score;
    u.gamesPlayed++;
    if (won) u.wins++;
    if (score > u.bestScore) u.bestScore = score;
    if (won && (u.bestTime === null || timeUsed < u.bestTime)) u.bestTime = timeUsed;
    u.exp += Math.floor(score / 100);
    while (u.exp >= u.level * 100) {
      u.exp -= u.level * 100;
      u.level++;
    }
    return updateCurrent(u);
  }

  function leaderboard(limit = 10) {
    const users = Object.values(getAll());
    return users
      .sort((a, b) => b.bestScore - a.bestScore)
      .slice(0, limit)
      .map((u, i) => ({ rank: i + 1, name: u.name, level: u.level, bestScore: u.bestScore, wins: u.wins }));
  }

  return { register, login, logout, current, updateCurrent, addScore, leaderboard };
})();

/* ---------- 礼花特效 ---------- */
function launchFireworks(container) {
  const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff6348'];
  for (let burst = 0; burst < 5; burst++) {
    setTimeout(() => {
      const cx = Math.random() * container.clientWidth;
      const cy = Math.random() * container.clientHeight * 0.5 + container.clientHeight * 0.1;
      const color = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:6px;height:6px;border-radius:50%;background:${color};pointer-events:none;z-index:9999;box-shadow:0 0 8px ${color};`;
        container.appendChild(p);
        const ang = (i / 30) * Math.PI * 2;
        const dist = 60 + Math.random() * 60;
        p.animate([
          { transform: 'translate(-50%,-50%)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(ang)*dist}px), calc(-50% + ${Math.sin(ang)*dist}px))`, opacity: 0 }
        ], { duration: 800 + Math.random()*400, easing: 'cubic-bezier(0,.5,.5,1)' });
        setTimeout(() => p.remove(), 1300);
      }
      Sound.win();
    }, burst * 400);
  }
}

/* ---------- 祝贺文字 ---------- */
const PRAISES = ['太棒了！', '太厉害了！', '继续加油！', '完美通关！', '你是消除大师！', '无人能敌！', '超级棒！'];
function getPraise() { return PRAISES[Math.floor(Math.random() * PRAISES.length)]; }

/* ---------- 时间格式化 ---------- */
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

Sound.loadSettings();

// 自动从URL推断当前游戏类型
if (!window.__gameType) {
  const page = (location.pathname.split('/').pop() || 'index').replace('.html', '');
  window.__gameType = page;
}

/* ============================================
   金币系统
   ============================================ */
const Coins = (() => {
  const KEY = 'game_coins';
  function get() { return parseInt(localStorage.getItem(KEY) || '0'); }
  function set(v) { localStorage.setItem(KEY, v); }
  function add(n) { const v = get() + n; set(v); return v; }
  function spend(n) { const v = get(); if (v < n) return false; set(v - n); return true; }
  return { get, set, add, spend };
})();

/* ============================================
   统计系统 (供成就/任务使用)
   ============================================ */
const Stats = (() => {
  const KEY = 'game_stats';
  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }
  function saveAll(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
  function get(field, def = 0) { return getAll()[field] ?? def; }
  function set(field, val) { const d = getAll(); d[field] = val; saveAll(d); }
  function inc(field, n = 1) { set(field, get(field) + n); }
  function pushUnique(field, val) {
    const d = getAll();
    if (!d[field]) d[field] = [];
    if (!d[field].includes(val)) d[field].push(val);
    saveAll(d);
  }
  return {
    totalGames: () => get('totalGames'),
    totalWins: () => get('totalWins'),
    bestScore: () => get('bestScore'),
    totalCoins: () => get('totalCoins'),
    playedTypes: () => (getAll().playedTypes || []).length,
    recordGame(type, score, won) {
      inc('totalGames');
      if (won) inc('totalWins');
      if (score > get('bestScore')) set('bestScore', score);
      pushUnique('playedTypes', type);
      DailyTask.update(type, score, won);
    },
    recordCoins(n) { inc('totalCoins', n); }
  };
})();

/* ============================================
   成就系统 (数据驱动)
   ============================================ */
const Achievement = (() => {
  const KEY = 'game_achievements';
  const DEFS = [
    { id: 'first_game', name: '初出茅庐', desc: '完成第一局游戏', icon: '🎮', target: 1, getValue: () => Stats.totalGames() },
    { id: 'games_10', name: '游戏达人', desc: '累计游玩10局', icon: '🕹️', target: 10, getValue: () => Stats.totalGames() },
    { id: 'games_50', name: '游戏狂魔', desc: '累计游玩50局', icon: '🔥', target: 50, getValue: () => Stats.totalGames() },
    { id: 'score_1000', name: '千分俱乐部', desc: '单局得分超过1000', icon: '💯', target: 1000, getValue: () => Stats.bestScore() },
    { id: 'score_5000', name: '高分王者', desc: '单局得分超过5000', icon: '👑', target: 5000, getValue: () => Stats.bestScore() },
    { id: 'wins_5', name: '初尝胜果', desc: '累计获胜5局', icon: '🏅', target: 5, getValue: () => Stats.totalWins() },
    { id: 'wins_20', name: '常胜将军', desc: '累计获胜20局', icon: '🏆', target: 20, getValue: () => Stats.totalWins() },
    { id: 'all_games', name: '全能玩家', desc: '尝试过所有类型游戏', icon: '🌟', target: 20, getValue: () => Stats.playedTypes() },
    { id: 'coins_500', name: '小富翁', desc: '累计获得500金币', icon: '💰', target: 500, getValue: () => Stats.totalCoins() },
  ];

  function getUnlocked() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); }
    catch { return new Set(); }
  }
  function saveUnlocked(s) { localStorage.setItem(KEY, JSON.stringify([...s])); }

  function check() {
    const unlocked = getUnlocked();
    const newly = [];
    DEFS.forEach(a => {
      if (unlocked.has(a.id)) return;
      if (a.getValue() >= a.target) {
        unlocked.add(a.id);
        newly.push(a);
      }
    });
    if (newly.length > 0) {
      saveUnlocked(unlocked);
      newly.forEach(a => {
        Coins.add(50);
        Stats.recordCoins(50);
        showToast(`🏅 成就解锁：${a.name}！+50金币`);
      });
    }
    return newly;
  }

  function list() {
    const unlocked = getUnlocked();
    return DEFS.map(a => ({
      ...a,
      current: Math.min(a.getValue(), a.target),
      unlocked: unlocked.has(a.id),
      progress: Math.min(1, a.getValue() / a.target)
    }));
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#ffd700,#ff8c00);color:#fff;padding:12px 24px;border-radius:24px;font-weight:700;font-size:0.9rem;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-width:90vw;text-align:center;';
    t.textContent = msg;
    document.body.appendChild(t);
    t.animate([
      { opacity: 0, transform: 'translateX(-50%) translateY(-20px)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
      { opacity: 1, transform: 'translateX(-50%) translateY(0)', offset: 0.7 },
      { opacity: 0, transform: 'translateX(-50%) translateY(-20px)' }
    ], { duration: 3000, easing: 'ease' });
    setTimeout(() => t.remove(), 3000);
  }

  return { check, list, DEFS };
})();

/* ============================================
   每日任务系统
   ============================================ */
const DailyTask = (() => {
  const KEY = 'daily_tasks';
  const TASK_TYPES = [
    { id: 'play3', desc: '游玩3局游戏', target: 3, reward: 30, field: 'play' },
    { id: 'play5', desc: '游玩5局游戏', target: 5, reward: 60, field: 'play' },
    { id: 'score500', desc: '单局得分超过500', target: 500, reward: 40, field: 'score' },
    { id: 'score1000', desc: '单局得分超过1000', target: 1000, reward: 80, field: 'score' },
    { id: 'win2', desc: '获胜2局', target: 2, reward: 50, field: 'win' },
    { id: 'win3', desc: '获胜3局', target: 3, reward: 80, field: 'win' },
    { id: 'diff3', desc: '尝试3种不同游戏', target: 3, reward: 60, field: 'type' },
  ];

  function todayStr() { return new Date().toISOString().slice(0,10); }

  function getTasks() {
    let data;
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
    const today = todayStr();
    if (!data || data.date !== today) {
      const shuffled = [...TASK_TYPES].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 3).map(t => ({ ...t, progress: 0, claimed: false, types: [] }));
      data = { date: today, tasks: selected };
      localStorage.setItem(KEY, JSON.stringify(data));
    }
    return data;
  }

  function update(type, score, won) {
    const data = getTasks();
    data.tasks.forEach(t => {
      if (t.claimed) return;
      if (t.field === 'play') t.progress++;
      else if (t.field === 'score') t.progress = Math.max(t.progress, score);
      else if (t.field === 'win' && won) t.progress++;
      else if (t.field === 'type') {
        if (!t.types.includes(type)) { t.types.push(type); t.progress = t.types.length; }
      }
    });
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function claim(idx) {
    const data = getTasks();
    const t = data.tasks[idx];
    if (!t || t.claimed || t.progress < t.target) return false;
    t.claimed = true;
    localStorage.setItem(KEY, JSON.stringify(data));
    Coins.add(t.reward);
    Stats.recordCoins(t.reward);
    return t.reward;
  }

  function list() { return getTasks().tasks; }
  return { update, claim, list, todayStr };
})();

/* ============================================
   道具系统
   ============================================ */
const Item = (() => {
  const KEY = 'game_items';
  const DEFS = {
    hint: { name: '提示卡', desc: '显示正确答案', icon: '💡', price: 50 },
    undo: { name: '撤销符', desc: '撤销上一步操作', icon: '↩️', price: 30 },
    extra: { name: '续命丹', desc: '失败时复活一次', icon: '❤️', price: 80 },
    freeze: { name: '冰冻卡', desc: '暂停倒计时5秒', icon: '❄️', price: 40 },
    shuffle: { name: '洗牌符', desc: '重新打乱局面', icon: '🔀', price: 35 },
  };

  function getInventory() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }
  function saveInv(inv) { localStorage.setItem(KEY, JSON.stringify(inv)); }

  function buy(id) {
    const def = DEFS[id];
    if (!def) return { ok: false, msg: '道具不存在' };
    if (!Coins.spend(def.price)) return { ok: false, msg: '金币不足' };
    const inv = getInventory();
    inv[id] = (inv[id] || 0) + 1;
    saveInv(inv);
    return { ok: true };
  }

  function count(id) { return getInventory()[id] || 0; }

  function use(id) {
    const inv = getInventory();
    if (!inv[id] || inv[id] <= 0) return false;
    inv[id]--;
    saveInv(inv);
    return true;
  }

  function list() { return DEFS; }
  function inventory() { return getInventory(); }

  return { DEFS, buy, count, use, list, inventory };
})();

/* ============================================
   游戏结束统一处理
   注意：内部直接委托 User.addScore，不要在调用 addScore 的
   同时再调用本方法，否则统计与金币会重复记账。
   ============================================ */
const Game = (() => {
  function end(type, score, won) {
    return User.addScore(score, won, 0);
  }
  return { end };
})();
