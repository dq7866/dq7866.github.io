/* 地球拼图 · v2.5 发布级增强层
 * 依赖：profiles.js（本地档案）、game.js（GlobePuzzle API）。
 * 职责：档案面板 / 赞赏弹窗 / 支持卡 / 键盘相机 / 弹窗焦点管理 / 动态 SEO /
 *       启动健康检查。不改动 3D 引擎与地理数据。
 * 设计约束：任何一步失败都不能阻断主程序；纯本地，不发起任何网络请求。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var P = window.GPProfiles;
  var GP = window.GlobePuzzle || null;
  var MODAL_IDS = ['gp-help', 'gp-about', 'gp-ach', 'gp-profile', 'gp-tip'];
  var lastFocus = null, syncing = false, toastTimer = null;

  function toast(msg, ms) {
    var el = $('gp-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }
  function escText(s) { return String(s == null ? '' : s); }

  /* ---------------- 弹窗：互斥 + 焦点管理 ---------------- */
  function openModal(id) {
    var el = $(id);
    if (!el) return;
    lastFocus = document.activeElement;
    MODAL_IDS.forEach(function (m) { if (m !== id && $(m)) $(m).classList.remove('show'); });
    el.classList.add('show');
    if (id === 'gp-profile') renderProfile();
    var f = el.querySelector('button, input, [tabindex]');
    if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
  }
  function closeModal(id) {
    var el = $(id);
    if (el) el.classList.remove('show');
    if (lastFocus && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    }
    lastFocus = null;
  }
  function closeAll() {
    MODAL_IDS.forEach(function (m) { if ($(m)) $(m).classList.remove('show'); });
  }
  window.addEventListener('DOMContentLoaded', function () {
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function (muts) {
      if (syncing) return;
      syncing = true;
      for (var i = 0; i < muts.length; i++) {
        var el = muts[i].target, was = muts[i].oldValue || '';
        var had = was.indexOf('show') >= 0, has = el.classList.contains('show');
        if (has && !had) {
          lastFocus = document.activeElement;
          MODAL_IDS.forEach(function (m) { if ($(m) && $(m) !== el) $(m).classList.remove('show'); });
          if (el.id === 'gp-profile') renderProfile();
          var f = el.querySelector('button, input, [tabindex]');
          if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ } }
        } else if (!has && had && lastFocus && document.contains(lastFocus)) {
          try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
          lastFocus = null;
        }
      }
      syncing = false;
    });
    MODAL_IDS.forEach(function (m) {
      if ($(m)) obs.observe($(m), { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
  });

  /* ---------------- 本地档案 ---------------- */
  function profileChip() {
    var c = $('gp-profile-chip');
    if (!c || !P) return;
    c.textContent = P.current().name;
    c.setAttribute('aria-label', '当前本地档案：' + P.current().name + '，点击切换档案');
  }

  function statLine(p) {
    var s = P.statsOf(p.id);
    return '成就 ' + s.unlocked + '/15 · 累计归位 ' + s.placed + ' 片';
  }

  function renderProfile() {
    if (!P) return;
    var list = $('gp-profile-list'), cur = P.current();
    var nameEl = $('gp-profile-current-name'), statEl = $('gp-profile-current-stat');
    if (nameEl) nameEl.textContent = cur.name;
    if (statEl) statEl.textContent = '（' + statLine(cur) + ' · 主题 ' + themeLabel(cur.theme) + '）';
    profileChip();
    if (!list) return;
    list.textContent = '';
    P.list().forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'gp-profile-item' + (p.id === cur.id ? ' active' : '');
      row.setAttribute('role', 'listitem');
      row.dataset.id = p.id;

      var meta = document.createElement('div');
      meta.className = 'gp-profile-meta';
      var b = document.createElement('b');
      b.textContent = p.name;
      var sp = document.createElement('span');
      sp.textContent = (p.id === cur.id ? '使用中 · ' : '') + statLine(p);
      meta.appendChild(b); meta.appendChild(sp);

      var btns = document.createElement('div');
      btns.className = 'gp-profile-btns';
      if (p.id !== cur.id) {
        var sw = mkBtn('切换', 'switch');
        btns.appendChild(sw);
      }
      btns.appendChild(mkBtn('改名', 'rename'));
      if (P.list().length > 1) btns.appendChild(mkBtn('删除', 'del'));
      row.appendChild(meta); row.appendChild(btns);
      list.appendChild(row);
    });
  }

  function mkBtn(text, act) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'gp-mini'; b.dataset.act = act; b.textContent = text;
    return b;
  }
  function themeLabel(t) {
    return ({ deep: '深空', aurora: '极光', dawn: '黎明', daylight: '白昼晴空' })[t] || '深空';
  }

  /** 切换档案：重载成就 → 刷新 UI → 应用该档案主题 → 重开一局（内存进度不串档） */
  function applyProfile(p) {
    if (!GP) return;
    try { if (GP.achievements && GP.achievements.reload) GP.achievements.reload(); } catch (e) { /* 忽略 */ }
    try { if (GP.refreshAchievements) GP.refreshAchievements(); } catch (e) { /* 忽略 */ }
    try { GP.setTheme(p && p.theme ? p.theme : 'deep'); } catch (e) { /* 忽略 */ }
    try { GP.reset(); } catch (e) { /* 忽略 */ }
    renderProfile();
  }

  function bindProfile() {
    if (!P) return;
    var openBtn = $('gp-profile-btn'), chip = $('gp-profile-chip'), support = $('gp-support-btn');
    if (openBtn) openBtn.addEventListener('click', function () { openModal('gp-profile'); });
    if (chip) {
      chip.addEventListener('click', function () { openModal('gp-profile'); });
      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal('gp-profile'); }
      });
    }
    if ($('gp-profile-close')) $('gp-profile-close').addEventListener('click', function () { closeModal('gp-profile'); });
    if (support) support.addEventListener('click', function () { openModal('gp-tip'); });

    var list = $('gp-profile-list');
    if (list) list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!btn) return;
      var row = btn.closest('.gp-profile-item');
      if (!row) return;
      var id = row.dataset.id, act = btn.dataset.act;

      if (act === 'switch') {
        var r = P.switchTo(id);
        if (r.ok) { applyProfile(r.profile); toast('已切换到档案：' + r.profile.name); }
      } else if (act === 'rename') {
        startRename(row, id);
      } else if (act === 'del') {
        if (btn.dataset.confirm === '1') {
          var d = P.remove(id);
          if (d.ok) { applyProfile(d.next); toast('档案已删除'); }
          else toast(d.error);
        } else {
          btn.dataset.confirm = '1';
          btn.textContent = '确认删除';
          btn.classList.add('gp-mini-danger');
          setTimeout(function () {
            if (!btn.isConnected) return;
            btn.dataset.confirm = ''; btn.textContent = '删除'; btn.classList.remove('gp-mini-danger');
          }, 3500);
        }
      }
    });

    var newInput = $('gp-profile-new-name'), newBtn = $('gp-profile-new-btn');
    function doCreate() {
      var r = P.create(newInput ? newInput.value : '');
      if (!r.ok) { toast(r.error); return; }
      if (newInput) newInput.value = '';
      applyProfile(r.profile);
      toast('已新建并切换到档案：' + r.profile.name);
    }
    if (newBtn) newBtn.addEventListener('click', doCreate);
    if (newInput) newInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doCreate(); }
    });

    var exportBtn = $('gp-profile-export'), importBtn = $('gp-profile-import'), file = $('gp-profile-file');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      try {
        var text = P.exportData(), blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = '地球拼图-档案备份-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        toast('备份已导出');
      } catch (e) { toast('导出失败：' + (e && e.message)); }
    });
    if (importBtn && file) {
      importBtn.addEventListener('click', function () { file.click(); });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          var r = P.importData(String(fr.result || ''));
          if (!r.ok) { toast('导入失败：' + r.error); }
          else { applyProfile(P.current()); toast('已导入 ' + r.count + ' 个档案'); }
        };
        fr.onerror = function () { toast('文件读取失败'); };
        fr.readAsText(f, 'utf-8');
        file.value = '';
      });
    }

    var clear = $('gp-profile-clear');
    if (clear) clear.addEventListener('click', function () {
      if (clear.dataset.confirm === '1') {
        P.clearProgress();
        if (GP) {
          try { if (GP.achievements && GP.achievements.reload) GP.achievements.reload(); } catch (e) { /* 忽略 */ }
          try { if (GP.refreshAchievements) GP.refreshAchievements(); } catch (e) { /* 忽略 */ }
        }
        renderProfile();
        clear.dataset.confirm = ''; clear.textContent = '清空当前进度';
        clear.classList.remove('gp-danger-on');
        toast('当前档案的成就已清空');
      } else {
        clear.dataset.confirm = '1'; clear.textContent = '再点一次确认清空';
        clear.classList.add('gp-danger-on');
        setTimeout(function () {
          if (!clear.isConnected) return;
          clear.dataset.confirm = ''; clear.textContent = '清空当前进度';
          clear.classList.remove('gp-danger-on');
        }, 3500);
      }
    });

    P.onChange(function () { renderProfile(); });
    if (GP && GP.on) {
      try { GP.on('theme:change', function () { if ($('gp-profile') && $('gp-profile').classList.contains('show')) renderProfile(); }); }
      catch (e) { /* 忽略 */ }
    }
    renderProfile();
  }

  function startRename(row, id) {
    var meta = row.querySelector('.gp-profile-meta'), btns = row.querySelector('.gp-profile-btns');
    if (!meta || !btns || row.querySelector('input')) return;
    meta.style.display = 'none';
    btns.textContent = '';
    var input = document.createElement('input');
    input.type = 'text'; input.maxLength = 16; input.className = 'gp-rename-input';
    input.value = (P.list().filter(function (p) { return p.id === id; })[0] || {}).name || '';
    input.setAttribute('aria-label', '修改档案名称');
    var save = mkBtn('保存', 'save'), cancel = mkBtn('取消', 'cancel');
    btns.appendChild(input); btns.appendChild(save); btns.appendChild(cancel);
    input.focus(); input.select();
    function finish(ok) {
      if (ok) {
        var r = P.rename(id, input.value);
        if (!r.ok) { toast(r.error); return; }
        toast('档案已重命名');
      }
      renderProfile();
    }
    save.addEventListener('click', function () { finish(true); });
    cancel.addEventListener('click', function () { finish(false); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
  }

  /* ---------------- 赞赏 ---------------- */
  function bindTip() {
    var btn = $('gp-tip-btn'), close = $('gp-tip-close'), save = $('gp-tip-save');
    if (btn) btn.addEventListener('click', function () { openModal('gp-tip'); });
    if (close) close.addEventListener('click', function () { closeModal('gp-tip'); });
    if (save) save.addEventListener('click', function () {
      var img = $('gp-tip-qr');
      if (!img || !img.getAttribute('src')) { toast('二维码未加载'); return; }
      try {
        var a = document.createElement('a');
        a.href = img.getAttribute('src');
        a.download = '地球拼图-赞赏码.png';
        document.body.appendChild(a); a.click(); a.remove();
        toast('二维码已保存，可用微信 / 支付宝扫一扫');
      } catch (e) { toast('保存失败，请长按图片保存'); }
    });
    // 图片缺失时给出文字兜底，不留下破图
    var img = $('gp-tip-qr');
    if (img) img.addEventListener('error', function () {
      var wrap = img.parentNode;
      if (wrap) {
        img.style.display = 'none';
        var p = document.createElement('p');
        p.className = 'gp-tip-caption';
        p.textContent = '二维码图片未加载，请从项目目录 assets/sponsor-qr.png 打开。';
        wrap.appendChild(p);
      }
    });
  }

  /* ---------------- 键盘相机（画布聚焦后可用） ---------------- */
  function bindCameraKeys() {
    if (!GP || !GP._internals) return;
    var cam = GP._internals.camera, globe = GP._internals.globeGroup;
    if (!cam || !globe) return;
    window.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      var step = e.shiftKey ? 0.18 : 0.08, k = e.key, handled = true;
      if (k === 'ArrowLeft') globe.rotation.y -= step;
      else if (k === 'ArrowRight') globe.rotation.y += step;
      else if (k === 'ArrowUp') globe.rotation.x = Math.max(-1.2, globe.rotation.x - step);
      else if (k === 'ArrowDown') globe.rotation.x = Math.min(1.2, globe.rotation.x + step);
      else if (k === '+' || k === '=') cam.position.z = Math.max(4.2, cam.position.z - 0.6);
      else if (k === '-' || k === '_') cam.position.z = Math.min(26, cam.position.z + 0.6);
      else if (k === '0') { globe.rotation.set(0, 0, 0); cam.position.z = 10; }
      else handled = false;
      if (handled) { e.preventDefault(); cam.updateProjectionMatrix(); }
    });
  }

  /* ---------------- 动态 SEO：部署到任意路径都给出正确的 canonical / OG ---------------- */
  function fixSeo() {
    if (!/^https?:/.test(location.protocol)) return;
    try {
      var base = location.href.split('#')[0].split('?')[0];
      if (!/\/$/.test(base)) base = base.replace(/[^/]*$/, '');
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical) canonical.href = base;
      var set = function (sel, val) { var m = document.querySelector(sel); if (m) m.setAttribute('content', val); };
      set('meta[property="og:url"]', base);
      var cover = new URL('assets/og-cover.png', base).href;
      set('meta[property="og:image"]', cover);
      set('meta[name="twitter:image"]', cover);
    } catch (e) { /* 忽略：静态 meta 仍在 */ }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    bindProfile();
    bindTip();
    bindCameraKeys();
    fixSeo();
    profileChip();
    window.__GP_DEBUG = {
      ready: function () { return !!window.__GP_READY; },
      errors: function () { return (window.__GP_ERRORS || []).slice(); },
      webgl: function () { return window.__GP_WEBGL_OK; },
      profiles: function () { return P ? P.state() : null; },
      saveKey: function (b) { return P ? P.saveKey(b) : b; },
      openProfile: function () { openModal('gp-profile'); },
      openTip: function () { openModal('gp-tip'); },
      closeAll: closeAll,
      switchTo: function (id) { var r = P.switchTo(id); if (r.ok) applyProfile(r.profile); return r; },
      create: function (n) { var r = P.create(n); if (r.ok) applyProfile(r.profile); return r; },
      version: function () { return GP ? GP.version : null; },
      theme: function () { return GP ? GP.theme : null; }
    };
    window.__GP_ADDONS_READY = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
