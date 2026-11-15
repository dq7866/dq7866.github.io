/* 地球拼图 · 本地档案（用户管理）
 * 纯本地、无账号、不联网、不上传：档案只写在本机 localStorage。
 * 每个档案拥有独立的成就统计与主题偏好，键名为 "<原键>::<档案 id>"。
 * 旧版单存档（gp-achievements-v1 / gp-theme）在首次启动时无损迁移到默认档案。
 *
 * 依赖：无。必须在 game.js 之前加载，供主程序读取命名空间键。
 * 对外：window.GPProfiles
 */
(function () {
  'use strict';

  var KEY = 'gp-profiles-v1';
  var LEGACY_ACH = 'gp-achievements-v1';
  var LEGACY_THEME = 'gp-theme';
  var DEFAULT_ID = 'p1';
  var MAX_PROFILES = 12;
  var MAX_NAME = 16;
  var ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
  var SAFE_KEY_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

  var mem = {};                 // localStorage 不可用时的内存兜底
  var listeners = [];
  var state = null;

  function readRaw(k) {
    try { return localStorage.getItem(k); }
    catch (e) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; }
  }
  function writeRaw(k, v) {
    try { localStorage.setItem(k, v); }
    catch (e) { mem[k] = v; }
  }
  function removeRaw(k) {
    try { localStorage.removeItem(k); }
    catch (e) { delete mem[k]; }
  }
  function now() { return Date.now(); }
  function uid() {
    return 'p' + now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function cleanName(s) {
    return String(s == null ? '' : s).replace(/[\r\n\t<>]/g, ' ').trim().slice(0, MAX_NAME);
  }
  function isPlainObject(o) {
    return !!o && typeof o === 'object' && !Array.isArray(o);
  }

  function normalize(raw) {
    if (!isPlainObject(raw) || !Array.isArray(raw.profiles)) return null;
    var seen = Object.create(null), list = [];
    for (var i = 0; i < raw.profiles.length && list.length < MAX_PROFILES; i++) {
      var p = raw.profiles[i];
      if (!isPlainObject(p) || !ID_RE.test(String(p.id)) || seen[p.id]) continue;
      var name = cleanName(p.name) || '档案 ' + (list.length + 1);
      seen[p.id] = 1;
      list.push({
        id: String(p.id),
        name: name,
        createdAt: Number.isFinite(p.createdAt) ? p.createdAt : now(),
        lastUsed: Number.isFinite(p.lastUsed) ? p.lastUsed : now(),
        theme: typeof p.theme === 'string' && /^[a-z]{1,20}$/.test(p.theme) ? p.theme : ''
      });
    }
    if (!list.length) return null;
    var cid = String(raw.current || '');
    if (!seen[cid]) cid = list[0].id;
    return { current: cid, profiles: list };
  }

  function persist() {
    writeRaw(KEY, JSON.stringify(state));
    emit();
  }
  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](snapshot()); } catch (e) { /* 单个监听失败不影响其它 */ }
    }
  }
  function snapshot() {
    return {
      current: state.current,
      profiles: state.profiles.map(function (p) { return Object.assign({}, p); })
    };
  }

  /* 首次启动：把旧版单存档复制到默认档案命名空间，旧键原样保留（可回退）。 */
  function migrateLegacy() {
    var ach = readRaw(LEGACY_ACH);
    var theme = readRaw(LEGACY_THEME);
    if (ach != null) writeRaw(LEGACY_ACH + '::' + DEFAULT_ID, ach);
    if (theme != null) {
      writeRaw(LEGACY_THEME + '::' + DEFAULT_ID, theme);
      state.profiles[0].theme = /^[a-z]{1,20}$/.test(theme) ? theme : '';
    }
    writeRaw(KEY, JSON.stringify(state));
    // 迁移标记：即使旧存档为空也写，避免每次启动重复判定
    writeRaw(KEY + ':migrated', '1');
  }

  function init() {
    var raw = readRaw(KEY);
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    var s = normalize(parsed);
    if (s) {
      state = s;
      if (!parsed || parsed.current !== s.current || parsed.profiles.length !== s.profiles.length) persist();
    } else {
      state = {
        current: DEFAULT_ID,
        profiles: [{ id: DEFAULT_ID, name: '我', createdAt: now(), lastUsed: now(), theme: '' }]
      };
      if (raw != null) writeRaw(KEY, JSON.stringify(state)); // 坏存档自愈写回
      else writeRaw(KEY, JSON.stringify(state));
      if (readRaw(KEY + ':migrated') !== '1') migrateLegacy();
    }
  }

  function current() {
    for (var i = 0; i < state.profiles.length; i++) if (state.profiles[i].id === state.current) return state.profiles[i];
    state.current = state.profiles[0].id;
    return state.profiles[0];
  }

  /** 把任意存档键映射到当前档案命名空间。 */
  function saveKey(base) {
    if (!SAFE_KEY_RE.test(String(base))) return String(base);
    return base + '::' + current().id;
  }

  var api = {
    KEY: KEY,
    LEGACY_ACH: LEGACY_ACH,
    LEGACY_THEME: LEGACY_THEME,
    state: snapshot,
    current: function () { return Object.assign({}, current()); },
    list: function () { return snapshot().profiles; },
    saveKey: saveKey,

    /** 当前档案的成就统计（供 UI 展示，不改动主程序内部状态） */
    statsOf: function (id) {
      var key = LEGACY_ACH + '::' + String(id);
      var raw = readRaw(key);
      if (!raw) return { unlocked: 0, placed: 0, complete: 0 };
      try {
        var d = JSON.parse(raw);
        if (!isPlainObject(d)) return { unlocked: 0, placed: 0, complete: 0 };
        var u = isPlainObject(d.unlocked) ? Object.keys(d.unlocked).length : 0;
        var st = isPlainObject(d.stats) ? d.stats : {};
        return {
          unlocked: u,
          placed: Number.isFinite(st.placed) ? st.placed : 0,
          complete: Number.isFinite(st.complete) ? st.complete : 0
        };
      } catch (e) { return { unlocked: 0, placed: 0, complete: 0 }; }
    },

    create: function (name) {
      if (state.profiles.length >= MAX_PROFILES) return { ok: false, error: '最多 ' + MAX_PROFILES + ' 个档案' };
      var n = cleanName(name) || '新档案';
      var p = { id: uid(), name: n, createdAt: now(), lastUsed: now(), theme: '' };
      state.profiles.push(p);
      state.current = p.id;
      persist();
      return { ok: true, profile: Object.assign({}, p) };
    },

    rename: function (id, name) {
      var n = cleanName(name);
      if (!n) return { ok: false, error: '名称不能为空' };
      for (var i = 0; i < state.profiles.length; i++) {
        if (state.profiles[i].id === id) { state.profiles[i].name = n; persist(); return { ok: true }; }
      }
      return { ok: false, error: '档案不存在' };
    },

    remove: function (id) {
      if (state.profiles.length <= 1) return { ok: false, error: '至少保留一个档案' };
      var idx = -1;
      for (var i = 0; i < state.profiles.length; i++) if (state.profiles[i].id === id) idx = i;
      if (idx < 0) return { ok: false, error: '档案不存在' };
      var removed = state.profiles.splice(idx, 1)[0];
      // 删除档案时一并清掉它的存档，避免 localStorage 里堆积孤儿数据
      removeRaw(LEGACY_ACH + '::' + removed.id);
      removeRaw(LEGACY_THEME + '::' + removed.id);
      if (state.current === removed.id) state.current = state.profiles[0].id;
      persist();
      return { ok: true, next: Object.assign({}, current()) };
    },

    switchTo: function (id) {
      for (var i = 0; i < state.profiles.length; i++) {
        if (state.profiles[i].id === id) {
          state.current = id;
          state.profiles[i].lastUsed = now();
          persist();
          return { ok: true, profile: Object.assign({}, current()) };
        }
      }
      return { ok: false, error: '档案不存在' };
    },

    setTheme: function (name) {
      var p = current();
      if (typeof name === 'string' && /^[a-z]{1,20}$/.test(name)) { p.theme = name; persist(); }
    },

    /** 清空当前档案的成就（主题与档案本身保留） */
    clearProgress: function () {
      writeRaw(saveKey(LEGACY_ACH), JSON.stringify({ stats: {}, unlocked: {} }));
      return true;
    },

    /** 备份：导出全部档案 + 各自的成就/主题，纯 JSON 文本 */
    exportData: function () {
      var out = { app: 'globe-puzzle-nature', schema: 1, exportedAt: new Date().toISOString(), state: snapshot(), saves: {} };
      for (var i = 0; i < state.profiles.length; i++) {
        var id = state.profiles[i].id;
        out.saves[id] = {
          achievements: readRaw(LEGACY_ACH + '::' + id),
          theme: readRaw(LEGACY_THEME + '::' + id)
        };
      }
      return JSON.stringify(out, null, 2);
    },

    /** 恢复：严格校验后整包导入，坏数据一律拒绝而不是写坏现有存档 */
    importData: function (text) {
      var d;
      try { d = JSON.parse(text); } catch (e) { return { ok: false, error: '不是合法的 JSON 备份文件' }; }
      if (!isPlainObject(d) || d.app !== 'globe-puzzle-nature' || !isPlainObject(d.saves)) {
        return { ok: false, error: '备份格式不匹配' };
      }
      var s = normalize(d.state);
      if (!s) return { ok: false, error: '备份里的档案列表无效' };
      for (var i = 0; i < s.profiles.length; i++) {
        var id = s.profiles[i].id, save = d.saves[id];
        if (!save) continue;
        if (save.achievements != null) {
          try {
            var a = JSON.parse(save.achievements);
            if (isPlainObject(a) && isPlainObject(a.stats) && isPlainObject(a.unlocked)) {
              writeRaw(LEGACY_ACH + '::' + id, JSON.stringify(a));
            }
          } catch (e) { /* 忽略单条坏数据 */ }
        }
        if (typeof save.theme === 'string' && /^[a-z]{1,20}$/.test(save.theme)) {
          writeRaw(LEGACY_THEME + '::' + id, save.theme);
        }
      }
      state = s;
      writeRaw(KEY, JSON.stringify(state));
      writeRaw(KEY + ':migrated', '1');
      emit();
      return { ok: true, count: s.profiles.length };
    },

    onChange: function (fn) {
      if (typeof fn === 'function') { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }
      return function () {};
    }
  };

  init();
  window.GPProfiles = api;
})();
