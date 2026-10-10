/* 风驰骑行 —— Service Worker：首次加载后整站离线可用（游戏本体 + AI 贴图素材，约 0.7MB） */
var CACHE = 'windrider-v3';
var ASSETS = [
  './',
  './index.html',
  './css/bike.css',
  './js/save.js',
  './js/progress.js',
  './js/sprites.js',
  './js/engine.js',
  './js/controls.js',
  './js/game.js',
  './js/cloud.js',
  './js/main.js',
  './manifest.webmanifest',
  './img/tex-asphalt.webp',
  './img/tex-asphalt-wet.webp',
  './img/tex-grass.webp',
  './img/tex-dry.webp',
  './img/mat-carbon.webp',
  './img/mat-fabric.webp',
  './img/mat-leather.webp',
  './img/mat-rubber.webp',
  './img/tree-broad.webp',
  './img/tree-pine.webp',
  './img/tree-poplar.webp',
  './img/tree-bush.webp',
  './img/rock-boulder.webp',
  './img/cactus.webp',
  './img/rock-pile.webp',
  './img/cone.webp',
  './img/barrier.webp',
  './img/sign.webp',
  './img/lamp.webp',
  './img/cliff.webp',
  './img/turbine.webp',
  './img/sky-day.webp',
  './img/sky-dusk.webp',
  './img/sky-rain.webp'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 单个文件失败不影响整体安装
      return Promise.all(ASSETS.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  // 只接管同源资源；云端通道（另一域名）一律直连
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        // 后台悄悄更新，下次进来就是新版
        fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        }).catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
