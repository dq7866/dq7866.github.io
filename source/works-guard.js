/* works-guard.js — 知作坊「我的作品」在线运行守护层
 *
 * 配套 build-scripts/post-build-works-guard.js 使用。
 * 设计原则（2026-11-13）：
 *   1. 在线版永久免费、不设付费墙；门槛只针对「另存副本 / 整站镜像 / 批量抓取」。
 *   2. 纯前端不可能绝对防住，目标是让保存下来的网页不能直接用、下载离线包
 *      必须走作者通道，而不是假装做了加密。
 *   3. 可用性优先：guard.js 挂掉时由内联哨兵 5 秒兜底，游戏照常能玩。
 *   4. 不依赖任何第三方库、不改动原作品源码，样式与 DOM 全部自带。
 *
 * 覆盖：/naturelab/ /qiaosan/ /pojing-bricks/ /toy-workshop/ /human-body/
 */
(function () {
  'use strict';

  if (!window.__WG_OK) return;          // 非授权环境，内联哨兵已经处理
  if (window.__WG_BOOTED) return;
  window.__WG_BOOTED = true;
  clearTimeout(window.__WG_TIMER);      // guard 正常加载，撤掉哨兵的兜底定时器

  var MAP = {
    naturelab: 'naturelab',
    qiaosan: 'qiaosan',
    'pojing-bricks': 'pojing',
    'toy-workshop': 'toy',
    'human-body': 'humanbody'
  };
  var WORKS = {
    naturelab:  { name: '自然培育所', color: '#2e7d5b', line: '把一株生命从种子养到收获' },
    qiaosan:    { name: '敲散 · 解压气泡', color: '#5b46ff', line: '把烦心事做成气泡，两三下敲碎它' },
    pojing:     { name: '破境积木', color: '#ff6f3c', line: '147 种形状、59 张图纸的 3D 搭建世界' },
    toy:        { name: '巧手拆装工坊', color: '#ff7a45', line: '24 件玩具、38 个机构的 3D 拆装闯关' },
    humanbody:  { name: '人体积木', color: '#c8503f', line: '把真实解剖模型拆成骨块、肌肉与内脏，边拆边学' }
  };
  var seg = (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
  var APP = MAP[seg] || 'pojing';
  var W = WORKS[APP];
  var WECHAT = 'Huangld';
  var QR = '/images/works-sponsor-qr.png';

  /* ---------- 样式（自带，不依赖站点 CSS） ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.wg-root{position:fixed;right:14px;bottom:14px;z-index:2147482000;display:flex;align-items:center;gap:8px;' +
      'font:13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}',
    '.wg-mark{font-size:11px;color:#8a8078;background:rgba(255,255,255,.82);border:1px solid rgba(0,0,0,.07);' +
      'padding:5px 9px;border-radius:999px;backdrop-filter:blur(6px);white-space:nowrap}',
    '.wg-btn{border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.92);color:#2b2b2b;cursor:pointer;' +
      'padding:7px 12px;border-radius:999px;font-size:12px;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,.08);' +
      'backdrop-filter:blur(6px);white-space:nowrap}',
    '.wg-btn:hover{background:#fff;border-color:rgba(255,77,0,.35)}',
    '.wg-btn--main{background:' + W.color + ';color:#fff;border-color:transparent}',
    '.wg-btn--main:hover{background:' + W.color + ';filter:brightness(1.08)}',
    '.wg-veil{position:fixed;inset:0;z-index:2147482100;background:rgba(18,16,14,.58);' +
      'display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;' +
      'font:15px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}',
    '.wg-card{width:min(480px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:16px;' +
      'box-shadow:0 24px 70px rgba(0,0,0,.28);padding:26px 26px 22px;color:#2b2b2b;position:relative}',
    '.wg-card h2{margin:0 0 6px;font-size:20px;color:#1f1d1a}',
    '.wg-card h3{margin:20px 0 8px;font-size:15px;color:#1f1d1a}',
    '.wg-card p{margin:0 0 12px;color:#5f5851}',
    '.wg-card small{color:#8a8078}',
    '.wg-x{position:absolute;top:14px;right:16px;border:0;background:none;font-size:22px;line-height:1;' +
      'color:#9a9188;cursor:pointer}',
    '.wg-qr{display:block;width:min(260px,72%);margin:14px auto 8px;border:1px solid #eee;border-radius:10px}',
    '.wg-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}',
    '.wg-link{color:#ff4d00;text-decoration:none;font-weight:600}',
    '.wg-note{background:#faf7f3;border:1px solid #f0e9e0;border-radius:10px;padding:12px 14px;' +
      'font-size:13px;color:#6b625a;margin-top:12px}',
    '.wg-check{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:#5f5851;margin:16px 0}',
    '.wg-check input{margin-top:4px;flex:none}',
    '.wg-hold{display:block;width:100%;padding:13px;border:0;border-radius:10px;background:' + W.color +
      ';color:#fff;font-size:15px;font-weight:700;cursor:pointer;position:relative;overflow:hidden;touch-action:none}',
    '.wg-hold span{position:relative;z-index:2}',
    '.wg-hold i{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,255,255,.24);z-index:1}',
    '.wg-hold.wg-holding i{width:100%;transition:width .9s linear}',
    '.wg-toast{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:2147482200;' +
      'background:#25211d;color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.24);opacity:0;transition:opacity .2s;pointer-events:none;max-width:86vw;text-align:center}',
    '.wg-toast.wg-on{opacity:1}',
    '@media (max-width:520px){.wg-mark{display:none}.wg-root{right:10px;bottom:10px;gap:6px}.wg-btn{padding:6px 10px}}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- 小工具 ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'wg-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('wg-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('wg-on'); }, 3200);
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制：' + text); },
        function () { toast('复制失败，请手动记下：' + text); });
    } else {
      toast('请手动记下：' + text);
    }
  }
  function store(key, val) {
    try { if (val == null) return localStorage.getItem(key); localStorage.setItem(key, val); }
    catch (e) { return null; }
  }

  /* ---------- 常驻角标：署名 + 两个入口 ---------- */
  var root = el('div', 'wg-root');
  var mark = el('span', 'wg-mark', '© 知作坊 · ' + W.name);
  var btnSupport = el('button', 'wg-btn wg-btn--main', '♡ 支持作者');
  var btnOffline = el('button', 'wg-btn', '⬇ 离线版');
  root.appendChild(mark);
  root.appendChild(btnOffline);
  root.appendChild(btnSupport);
  document.body.appendChild(root);

  /* ---------- 弹层 ---------- */
  var veil = null;
  var gatePending = false;
  function close(restoreGate) {
    if (veil) { veil.remove(); veil = null; }
    // 从启动门里点开打赏/离线面板后关掉，要把门放回来，否则游戏永远不加载
    if (restoreGate && gatePending && !window.__WG_READY) gate();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(true); }, true);

  function open(title, bodyHtml, onMount) {
    close(false);
    veil = el('div', 'wg-veil');
    veil.addEventListener('click', function (e) { if (e.target === veil) close(true); });
    var card = el('div', 'wg-card');
    var x = el('button', 'wg-x', '×');
    x.setAttribute('aria-label', '关闭');
    x.onclick = function () { close(true); };
    card.appendChild(x);
    card.appendChild(el('h2', '', title));
    card.appendChild(el('div', '', bodyHtml));
    veil.appendChild(card);
    document.body.appendChild(veil);
    if (onMount) onMount(card);
  }

  function supportPanel() {
    open('支持一下 ' + W.name, [
      '<p>' + W.line + '。在线版一直免费、不设付费墙，也不插广告。</p>',
      '<p>这几件作品是下班后一格一格做出来的。若它陪你或孩子度过了一段不错的时光，欢迎扫码随意支持，金额不限；不打赏也照样完整玩。</p>',
      '<img class="wg-qr" src="' + QR + '" alt="微信 / 支付宝打赏码">',
      '<p style="text-align:center;margin:0"><small>打开微信 / 支付宝【扫一扫】</small></p>',
      '<div class="wg-note">支持后想要能断网用的单文件离线版，加微信 <b>' + WECHAT +
        '</b> 或到留言板说一声，我发你领取码和包。批量使用、转载或商用请先联系授权。</div>',
      '<div class="wg-row">',
      '<button class="wg-btn" id="wgCopyWx">复制微信号</button>',
      '<a class="wg-btn" href="/board/" target="_blank" rel="noopener">去留言板</a>',
      '<a class="wg-btn" href="/support/" target="_blank" rel="noopener">支持与授权说明</a>',
      '</div>'
    ].join(''), function (card) {
      card.querySelector('#wgCopyWx').onclick = function () { copy(WECHAT); };
    });
  }

  function offlinePanel() {
    open('离线版怎么领', [
      '<p>站内只提供在线版，<b>不开放公开下载</b>。这样既能保证你打开的始终是最新版，也避免作品被整包搬走后改头换面。</p>',
      '<h3>领取方式</h3>',
      '<p>1. 在「支持作者」里扫码随意支持一下；<br>' +
        '2. 加微信 <b>' + WECHAT + '</b> 或到<a class="wg-link" href="/board/" target="_blank" rel="noopener">留言板</a>说一句作品名；<br>' +
        '3. 我把<b>一次性领取码</b>和对应的单文件包发给你，解压后双击即可断网使用。</p>',
      '<div class="wg-note">离线包只供个人留存与家庭使用，请勿二次分发、去除署名或用于商业用途。网盘批量下载、 classroom / 机构授权请单独联系。</div>',
      '<div class="wg-row">',
      '<button class="wg-btn" id="wgCopyMsg">复制领取留言</button>',
      '<button class="wg-btn wg-btn--main" id="wgGoSupport">去看打赏码</button>',
      '</div>'
    ].join(''), function (card) {
      card.querySelector('#wgCopyMsg').onclick = function () {
        copy('你好，我想要《' + W.name + '》的离线单文件版，已支持，麻烦发一下领取码。');
      };
      card.querySelector('#wgGoSupport').onclick = supportPanel;
    });
  }

  btnSupport.onclick = supportPanel;
  btnOffline.onclick = offlinePanel;

  /* ---------- 针对「保存网页」的轻度干扰 ---------- */
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      toast('在线版收藏网址即可；保存的副本不能运行。离线单文件版请点「离线版」了解领取');
    }
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (e.target.closest && e.target.closest('input,textarea,[contenteditable]')) return;
    e.preventDefault();
  }, true);
  document.addEventListener('dragstart', function (e) { e.preventDefault(); }, true);

  /* ---------- 启动门：首次 / 每 7 天一次轻量确认 ---------- */
  function resume() {
    if (window.__WG_READY) return;
    if (window.__WG_RESUME) { window.__WG_RESUME(); return; }
    // 极少数情况下哨兵没注入（例如手工引入本脚本），仍要保证主脚本能起来
    var list = document.querySelectorAll('script[data-wg-src]');
    for (var i = 0; i < list.length; i++) {
      var old = list[i];
      if (old.getAttribute('data-wg-done')) continue;
      old.setAttribute('data-wg-done', '1');
      var n = document.createElement('script');
      for (var j = 0; j < old.attributes.length; j++) {
        var a = old.attributes[j];
        if (a.name === 'src' || a.name.indexOf('data-wg') === 0) continue;
        n.setAttribute(a.name, a.value);
      }
      n.src = old.getAttribute('data-wg-src');
      document.body.appendChild(n);
    }
    window.__WG_READY = true;
  }

  var KEY = 'wg.pass.' + APP;
  var force = /[?&]wg=gate(?:[&#]|$)/.test(location.search);
  var bot = /bot|spider|crawler|headlesschrome|lighthouse/i.test(navigator.userAgent) || navigator.webdriver;
  var last = Number(store(KEY) || 0);
  var fresh = Date.now() - last < 7 * 24 * 3600 * 1000;

  function gate() {
    gatePending = true;
    open('进入 ' + W.name, [
      '<p>' + W.line + '。<b>在线免费，无广告、无内购</b>，收藏这个网址就能随时回来。</p>',
      '<div class="wg-check"><input type="checkbox" id="wgAgree" checked>' +
        '<label for="wgAgree">我理解：本作品仅授权在本站在线体验，不整站抓取、不镜像分发、不去除署名，也不作商业转售。</label></div>',
      '<button class="wg-hold" id="wgHold"><i></i><span>按住 1 秒进入</span></button>',
      '<p style="margin:12px 0 0"><small>只是确认一下是真人，不会收集任何信息。7 天内不再出现。</small></p>',
      '<div class="wg-row"><button class="wg-btn" id="wgWhy">为什么有这一步？</button>' +
        '<button class="wg-btn" id="wgTip">支持作者</button></div>'
    ].join(''), function (card) {
      var hold = card.querySelector('#wgHold');
      var agree = card.querySelector('#wgAgree');
      var timer = null;
      var done = false;
      function pass() {
        if (done) return;
        if (!agree.checked) { toast('请先勾选使用说明'); return; }
        done = true;
        clearTimeout(timer);
        store(KEY, String(Date.now()));
        gatePending = false;
        close(false);
        resume();
      }
      function begin(e) {
        if (done || timer) return;
        if (e && e.cancelable) e.preventDefault();
        hold.classList.add('wg-holding');
        timer = setTimeout(pass, 900);
      }
      function cancel() { clearTimeout(timer); timer = null; hold.classList.remove('wg-holding'); }
      hold.addEventListener('pointerdown', begin);
      hold.addEventListener('pointerup', cancel);
      hold.addEventListener('pointerleave', cancel);
      hold.addEventListener('pointercancel', cancel);
      hold.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') begin(e); });
      hold.addEventListener('keyup', cancel);
      card.querySelector('#wgWhy').onclick = function () {
        toast('为防止整站抓取与镜像分发加的轻确认；不影响正常游玩，也不收集信息');
      };
      card.querySelector('#wgTip').onclick = supportPanel;
    });
  }

  if ((bot || fresh) && !force) resume();
  else gate();
})();
