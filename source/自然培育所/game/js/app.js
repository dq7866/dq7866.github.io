/* ============================================================
   Nature Lab · 应用外壳（v2.0）
   ------------------------------------------------------------
   放在最后加载，只做"商业软件该有但游戏逻辑不需要知道"的事：
   1. 全局异常兜底：未捕获错误不白屏，给出可恢复提示
   2. 弹窗可访问性：role/aria-modal、焦点陷阱、关闭后焦点归还
   3. 存储写入失败提示（配额满 / 隐私模式禁止写入）
   4. 退出/切后台前保存，降低丢进度概率
   5. 启动看门狗：初始化失败时提供"重新加载 / 导出数据"入口
   ============================================================ */
(function () {
  'use strict';

  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /* ---------------- 1. 弹窗可访问性 ---------------- */
  let lastFocus = null;
  let activeLayer = null;

  function topLayer() {
    const open = Array.prototype.slice.call(document.querySelectorAll('.modal.show'));
    if (open.length) return open[open.length - 1];
    const lock = document.getElementById('lockScreen');
    if (lock && lock.style.display !== 'none') return lock;
    return null;
  }
  function focusables(root) {
    return Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE)).filter(el => {
      if (el.offsetParent === null && el.getClientRects().length === 0) return false;
      return true;
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    const layer = topLayer();
    if (!layer) return;
    const list = focusables(layer);
    if (!list.length) { e.preventDefault(); return; }
    const first = list[0], last = list[list.length - 1];
    const active = document.activeElement;
    if (!layer.contains(active)) { e.preventDefault(); first.focus(); return; }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }, true);

  function syncLayer() {
    const layer = topLayer();
    if (layer === activeLayer) return;
    if (activeLayer && !layer && lastFocus && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { }
    }
    activeLayer = layer;
    if (layer) {
      lastFocus = document.activeElement;
      setTimeout(function () {
        const list = focusables(layer);
        const preferred = layer.querySelector('[autofocus]') || list[0];
        if (preferred) { try { preferred.focus({ preventScroll: true }); } catch (e) { } }
      }, 40);
    }
  }

  function initA11y() {
    const modals = document.querySelectorAll('.modal');
    Array.prototype.forEach.call(modals, function (m) {
      if (!m.getAttribute('role')) m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
    });
    const obs = new MutationObserver(syncLayer);
    Array.prototype.forEach.call(modals, function (m) {
      obs.observe(m, { attributes: true, attributeFilter: ['class'] });
    });
    const lock = document.getElementById('lockScreen');
    if (lock) obs.observe(lock, { attributes: true, attributeFilter: ['style', 'class'] });
    // 锁屏是动态插入的，监听 body 子节点变化
    new MutationObserver(syncLayer).observe(document.body, { childList: true });
  }

  /* ---------------- 2. 存储失败提示 ---------------- */
  let storageWarned = false;
  function storageWarning() {
    let el = document.getElementById('storageWarn');
    if (!el) {
      el = document.createElement('div');
      el.id = 'storageWarn';
      el.className = 'storageWarn';
      el.setAttribute('role', 'alert');
      el.innerHTML = '<span>本地存储空间不足，最新进度可能没有保存。请导出存档后清理浏览器站点数据。</span><button type="button">管理档案</button>';
      document.body.appendChild(el);
      el.querySelector('button').addEventListener('click', function () {
        if (window.NL && NL.openAccount) NL.openAccount();
      });
    }
    el.classList.add('show');
    if (!storageWarned) {
      storageWarned = true;
      if (typeof toast === 'function') toast('本地存储写入失败：请导出存档备份', 'warn');
    }
  }
  window.__nlOnSaveError = storageWarning;

  /* ---------------- 3. 全局异常兜底 ---------------- */
  let lastReport = 0;
  function report(kind, detail) {
    try { console.error('[NatureLab]', kind, detail); } catch (e) { }
    const now = Date.now();
    if (now - lastReport < 15000) return;
    lastReport = now;
    if (window.__nlBooted && typeof toast === 'function') {
      toast('出现异常，已尽量保存进度。若反复出现，请导出存档后刷新页面。', 'warn');
    }
  }
  window.addEventListener('error', function (e) {
    if (e && e.target && e.target !== window && e.target.tagName) return; // 资源加载错误不弹
    report('error', e && (e.message || e.error));
  });
  window.addEventListener('unhandledrejection', function (e) {
    report('promise', e && e.reason);
  });

  /* ---------------- 4. 退出/切后台保存 ---------------- */
  function flushSave() {
    try {
      if (typeof S !== 'undefined' && S && typeof saveGame === 'function') saveGame(S);
    } catch (e) { }
  }
  window.addEventListener('beforeunload', flushSave);
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flushSave();
  });

  /* ---------------- 5. 启动看门狗 ---------------- */
  function fatalPanel() {
    if (document.getElementById('fatalPanel')) return;
    const el = document.createElement('div');
    el.id = 'fatalPanel';
    el.className = 'fatalPanel';
    el.innerHTML = '<div class="fatalCard">' +
      '<h2>游戏没有正常启动</h2>' +
      '<p>可能是浏览器过旧、脚本被拦截，或本地数据异常。你的存档仍在浏览器里，先尝试刷新；若仍失败，可导出数据后再清理。</p>' +
      '<div class="fatalOps"><button class="btn primary" id="fatalReload">重新加载</button>' +
      '<button class="btn ghost" id="fatalExport">导出存档</button></div>' +
      '<div class="fatalHint">浏览器要求：Chrome / Edge 90+、Firefox 90+、Safari 15+</div>' +
      '</div>';
    document.body.appendChild(el);
    document.getElementById('fatalReload').addEventListener('click', function () { location.reload(); });
    document.getElementById('fatalExport').addEventListener('click', function () {
      try {
        if (typeof exportSave === 'function') return exportSave();
        if (window.NL && NL.openAccount) return NL.openAccount();
        alert('无法直接导出，请在浏览器控制台执行：localStorage.getItem("naturelab.accounts.v1")');
      } catch (e) { }
    });
  }
  const bootStart = Date.now();
  const watchdog = setInterval(function () {
    if (window.__nlBooted || document.querySelector('#slots .slot')) {
      window.__nlBooted = true;
      clearInterval(watchdog);
      const f = document.getElementById('fatalPanel');
      if (f) f.remove();
      return;
    }
    if (Date.now() - bootStart > 15000) fatalPanel();
  }, 2000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initA11y);
  } else {
    initA11y();
  }
})();
