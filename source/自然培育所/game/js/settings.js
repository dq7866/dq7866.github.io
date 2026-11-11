/* ============================================================
   Nature Lab · 设置
   商业游戏标配的一层「偏好设置」，与存档分离（存在 localStorage，
   换存档不重置）。每一项都必须有实际行为，不做装饰性开关。

   设置项：
   - 音量滑杆（连续 0–100）
   - 减少动效（系统 prefers-reduced-motion 也会自动跟随）
   - 全屏
   - 色盲友好（高对比 + 状态图标替代纯色区分）
   - 界面字号（小/中/大）
   ============================================================ */

const PREF_KEY = (typeof storeKey === 'function') ? storeKey('prefs') : 'naturelab.prefs';

const DEFAULT_PREFS = {
  reduceMotion: false,   // 减少动效
  colorBlind: false,     // 色盲友好
  fontScale: 1,          // 1 = 中，0.92 = 小，1.12 = 大
  autoPause: true,       // 标签页失焦自动暂停
};

let _prefs = null;

function prefs() {
  if (_prefs) return _prefs;
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); } catch (e) { raw = null; }
  _prefs = Object.assign({}, DEFAULT_PREFS, raw || {});
  // 首次运行：跟随系统"减少动效"偏好
  if (!raw) {
    try {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) {
        _prefs.reduceMotion = true;
      }
    } catch (e) {}
  }
  return _prefs;
}

function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs())); } catch (e) {}
}

// 把偏好落到 DOM：根元素加 data 属性，CSS 侧统一响应
function applyPrefs() {
  const p = prefs();
  const root = document.documentElement;
  root.dataset.reduceMotion = p.reduceMotion ? '1' : '0';
  root.dataset.colorBlind = p.colorBlind ? '1' : '0';
  root.style.setProperty('--fontScale', p.fontScale);
}

function setPref(key, val) {
  const p = prefs();
  p[key] = val;
  savePrefs();
  applyPrefs();
  return p[key];
}

/* ---------------- 全屏 ---------------- */
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (!isFullscreen()) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        const r = req.call(el);
        if (r && r.catch) r.catch(() => toast('当前浏览器不允许全屏，可按 F11', 'warn'));
      } else {
        toast('当前环境不支持全屏，可按 F11', 'warn');
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  } catch (e) { toast('全屏切换失败', 'warn'); }
}

/* ---------------- 设置面板 ---------------- */
function openSettings() {
  const p = prefs();
  const box = $('#settingsBody');
  if (!box) return;

  const vol = Math.round((typeof soundVol === 'function' ? soundVol() : 0.7) * 100);

  box.innerHTML = `
    <div class="setRow">
      <div class="setLabel"><h4>音效音量</h4><p>氛围级反馈，不是音效轰炸。拖到 0 等同静音。</p></div>
      <div class="setCtrl">
        <input type="range" id="setVol" min="0" max="100" step="1" value="${vol}" aria-label="音效音量">
        <b id="setVolVal">${vol}%</b>
      </div>
    </div>

    <div class="setRow">
      <div class="setLabel"><h4>氛围音乐</h4><p>程序化生成的环境铺底（无音频文件）。独立于音效静音，可单独关。</p></div>
      <div class="setCtrl"><button class="switch ${(typeof bgmOn === 'function' && bgmOn()) ? 'on' : ''}" id="setBgm" role="switch" aria-checked="${(typeof bgmOn === 'function' && bgmOn())}" aria-label="氛围音乐"><i></i></button></div>
    </div>

    <div class="setRow" id="bgmVolRow" style="${(typeof bgmOn === 'function' && bgmOn()) ? '' : 'opacity:.45;pointer-events:none;'}">
      <div class="setLabel"><h4>音乐音量</h4><p>只影响氛围音乐，音效音量在上方单独调。</p></div>
      <div class="setCtrl">
        <input type="range" id="setBgmVol" min="0" max="100" step="1" value="${Math.round((typeof bgmVol === 'function' ? bgmVol() : 0.5) * 100)}" aria-label="音乐音量">
        <b id="setBgmVolVal">${Math.round((typeof bgmVol === 'function' ? bgmVol() : 0.5) * 100)}%</b>
      </div>
    </div>

    <div class="setRow">
      <div class="setLabel"><h4>减少动效</h4><p>关闭粒子、飘字、卡片入场和场景呼吸。系统开了「减少动态效果」时会自动打开。</p></div>
      <div class="setCtrl"><button class="switch ${p.reduceMotion ? 'on' : ''}" id="setMotion" role="switch" aria-checked="${p.reduceMotion}" aria-label="减少动效"><i></i></button></div>
    </div>

    <div class="setRow">
      <div class="setLabel"><h4>色盲友好</h4><p>提升对比度，并把「好/坏」的纯色区分改成<b>图标 + 颜色</b>双通道，红绿色弱也能分辨。</p></div>
      <div class="setCtrl"><button class="switch ${p.colorBlind ? 'on' : ''}" id="setCB" role="switch" aria-checked="${p.colorBlind}" aria-label="色盲友好"><i></i></button></div>
    </div>

    <div class="setRow">
      <div class="setLabel"><h4>界面字号</h4><p>只放大文字，不改变布局比例。</p></div>
      <div class="setCtrl">
        <div class="segGroup" id="setFont">
          <button data-fs="0.92" class="${p.fontScale < 1 ? 'on' : ''}">小</button>
          <button data-fs="1" class="${Math.abs(p.fontScale - 1) < 0.02 ? 'on' : ''}">中</button>
          <button data-fs="1.12" class="${p.fontScale > 1.05 ? 'on' : ''}">大</button>
        </div>
      </div>
    </div>

    <div class="setRow">
      <div class="setLabel"><h4>切到后台自动暂停</h4><p>切走标签页就停表，回来继续。避免挂机时进度乱涨。</p></div>
      <div class="setCtrl"><button class="switch ${p.autoPause ? 'on' : ''}" id="setAutoP" role="switch" aria-checked="${p.autoPause}" aria-label="切到后台自动暂停"><i></i></button></div>
    </div>

    <div class="setRow">
      <div class="setLabel"><h4>档案与用户</h4><p>当前档案：<b>${typeof NL !== 'undefined' && NL.active() ? nlEsc(NL.active().name) : '本机档案'}</b>。多用户、PIN 隐私锁、导入导出都在这里。</p></div>
      <div class="setCtrl"><button class="btn ghost" id="setAccOpen">管理档案</button></div>
    </div>

    <div class="setRow">
      <div class="setLabel"><h4>全屏</h4><p>沉浸模式，隐藏浏览器边框。也可按 F11。</p></div>
      <div class="setCtrl"><button class="btn ghost" id="setFull">${isFullscreen() ? '退出全屏' : '进入全屏'}</button></div>
    </div>`;

  // 音量滑杆
  const volEl = $('#setVol'), volVal = $('#setVolVal');
  if (volEl) {
    volEl.addEventListener('input', () => {
      const v = parseInt(volEl.value, 10) || 0;
      volVal.textContent = v + '%';
      if (typeof setSoundVol === 'function') setSoundVol(v / 100);
      // 拖动时给个短促试听（限流，避免连续爆音）
      if (typeof sfx === 'function' && v > 0) {
        const now = Date.now();
        if (!openSettings._last || now - openSettings._last > 260) {
          openSettings._last = now;
          sfx('click');
        }
      }
    });
  }

  // BGM 开关 + 音量
  const bgmSw = $('#setBgm');
  if (bgmSw && typeof setBgmOn === 'function') {
    bgmSw.addEventListener('click', () => {
      const on = setBgmOn(!bgmOn());
      bgmSw.classList.toggle('on', on);
      bgmSw.setAttribute('aria-checked', String(on));
      const row = $('#bgmVolRow');
      if (row) { row.style.opacity = on ? '' : '.45'; row.style.pointerEvents = on ? '' : 'none'; }
      toast(on ? '氛围音乐已开启' : '氛围音乐已关闭');
    });
  }
  const bgmVolEl = $('#setBgmVol'), bgmVal = $('#setBgmVolVal');
  if (bgmVolEl && typeof setBgmVol === 'function') {
    bgmVolEl.addEventListener('input', () => {
      const v = parseInt(bgmVolEl.value, 10) || 0;
      if (bgmVal) bgmVal.textContent = v + '%';
      setBgmVol(v / 100);
    });
  }

  const bindSwitch = (sel, key, after) => {
    const b = $(sel); if (!b) return;
    b.addEventListener('click', () => {
      const on = !prefs()[key];
      setPref(key, on);
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      if (after) after(on);
    });
  };
  bindSwitch('#setMotion', 'reduceMotion', on => toast(on ? '已减少动效' : '动效已恢复'));
  bindSwitch('#setCB', 'colorBlind', on => toast(on ? '已开启色盲友好配色' : '已恢复标准配色'));
  bindSwitch('#setAutoP', 'autoPause');

  const fg = $('#setFont');
  if (fg) {
    $$('button', fg).forEach(b => b.addEventListener('click', () => {
      $$('button', fg).forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      setPref('fontScale', parseFloat(b.dataset.fs));
    }));
  }

  const fb = $('#setFull');
  if (fb) fb.addEventListener('click', () => {
    toggleFullscreen();
    setTimeout(() => { fb.textContent = isFullscreen() ? '退出全屏' : '进入全屏'; }, 120);
  });

  const accBtn = $('#setAccOpen');
  if (accBtn) accBtn.addEventListener('click', () => {
    $('#settingsModal').classList.remove('show');
    if (typeof NL !== 'undefined' && NL.openAccount) NL.openAccount();
  });

  $('#settingsModal').classList.add('show');
  // 点击遮罩关闭（与其它模态框一致）
  const modal = $('#settingsModal');
  if (modal && !modal._boundClick) {
    modal._boundClick = true;
    modal.addEventListener('click', e => {
      if (e.target.id === 'settingsModal') modal.classList.remove('show');
    });
  }
}

/* ---------------- 首次用户手势：解锁音频并启动 BGM ---------------- */
function initBgmGesture() {
  const kick = () => {
    document.removeEventListener('pointerdown', kick);
    document.removeEventListener('keydown', kick);
    if (typeof bgmOn === 'function' && bgmOn() && typeof bgmStart === 'function') bgmStart();
  };
  document.addEventListener('pointerdown', kick, { once: false });
  document.addEventListener('keydown', kick, { once: false });
}

/* ---------------- 初始化：监听全屏与系统偏好变化 ---------------- */
function initPrefs() {
  applyPrefs();
  initBgmGesture();

  // 全屏状态变化时按钮文案跟着走（用户按 Esc 退出也能同步）
  const sync = () => {
    const b = $('#setFull');
    if (b) b.textContent = isFullscreen() ? '退出全屏' : '进入全屏';
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);

  // 系统"减少动效"变化时跟随（只在用户没手动改过时）
  try {
    if (window.matchMedia) {
      const mq = matchMedia('(prefers-reduced-motion: reduce)');
      const on = e => {
        // 用户手动设过就不覆盖；这里只在系统开启时被动跟随
        if (e.matches && !prefs().reduceMotion) setPref('reduceMotion', true);
      };
      if (mq.addEventListener) mq.addEventListener('change', on);
      else if (mq.addListener) mq.addListener(on);
    }
  } catch (e) {}

  // 后台自动暂停
  document.addEventListener('visibilitychange', () => {
    if (!prefs().autoPause) return;
    if (document.hidden) {
      if (typeof S !== 'undefined' && S && !S.paused) {
        S.paused = true;
        initPrefs._autoPaused = true;
        if (typeof renderTopbar === 'function') renderTopbar();
      }
    } else if (initPrefs._autoPaused) {
      initPrefs._autoPaused = false;
      if (typeof S !== 'undefined' && S) {
        S.paused = false;
        if (typeof renderTopbar === 'function') renderTopbar();
        if (typeof toast === 'function') toast('已回来，继续计时');
      }
    }
  });
}

