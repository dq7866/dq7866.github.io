/* =============================================================
   知作坊 · 广告加载器（ads.js）
   -------------------------------------------------------------
   设计原则：
   1. 默认完全关闭 —— 未填 client 时不加载任何第三方脚本、不发任何请求、
      不插入任何 DOM，对页面零影响、零性能损耗；
   2. 一处配置全站生效 —— 拿到广告代码后只改本文件顶部的 CONFIG；
   3. 可排除页面 —— 隐私政策、关于、404 等页不放广告。
   ============================================================= */
(function () {
  'use strict';

  /* ===================== 配置区（唯一需要改的地方） ===================== */
  var CONFIG = {
    enabled: false,                    // ← 拿到广告账号后改为 true
    // Google AdSense 的 publisher ID，形如 'ca-pub-1234567890123456'
    client: '',                        // ← 填入你的 ca-pub-xxxxxxxxxxxxxxx
    // 自动广告（推荐）：Google 自动挑选位置与时机，含 anchor / vignette 等高收益形式
    autoAds: true,
    // 手动广告位：容器 CSS 选择器 → 广告位 ID（在 AdSense 后台「广告单元」里创建后获得）
    slots: {
      // '#ad-slot-game': '1234567890',
      // '#ad-slot-post': '0987654321'
    },
    // 这些路径不放广告（前缀匹配）
    exclude: ['/privacy/', '/about/', '/404.html', '/admin/']
  };
  /* ===================== 配置区结束 ===================== */

  if (!CONFIG.enabled || !CONFIG.client) return;   // 未启用：直接退出，什么都不做

  var path = location.pathname;
  for (var i = 0; i < CONFIG.exclude.length; i++) {
    if (path.indexOf(CONFIG.exclude[i]) === 0) return;
  }

  // 1) 注入 AdSense 全局脚本（只注入一次）
  if (!document.querySelector('script[src*="adsbygoogle"]')) {
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CONFIG.client;
    document.head.appendChild(s);
  }
  window.adsbygoogle = window.adsbygoogle || [];

  // 2) 自动广告：开启后 Google 自行决定展示位置与形式
  if (CONFIG.autoAds) {
    // 自动广告无需手动位；AdSense 后台开启「自动广告」即可
  }

  // 3) 手动广告位：找到容器就填充
  function fillSlots() {
    Object.keys(CONFIG.slots).forEach(function (sel) {
      var box = document.querySelector(sel);
      if (!box || box.dataset.adFilled) return;
      box.dataset.adFilled = '1';
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', CONFIG.client);
      ins.setAttribute('data-ad-slot', CONFIG.slots[sel]);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      box.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* 忽略 */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillSlots);
  } else {
    fillSlots();
  }
})();
