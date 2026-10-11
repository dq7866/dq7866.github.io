/* 冰火守门人 —— Service Worker：首次加载后整站离线可用（游戏本体 + 3D 贴图素材）
   缓存策略：stale-while-revalidate —— 先用缓存秒开，后台静默拉新版供下次使用。
   改动本站资源后务必把 CACHE 版本号 +1，否则老用户看不到更新。 */
var CACHE = 'guardian-v2';
var ASSETS = [
  './',
  './index.html',
  './css/guardian.css',
  './js/save.js',
  './js/scenes.js',
  './js/progress.js',
  './js/sprites.js',
  './js/engine3d.js',
  './js/game.js',
  './js/cloud.js',
  './js/net.js',
  './js/main.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './img/ground-frost.webp',
  './img/ground-lava.webp',
  './img/ground-forest.webp',
  './img/ground-sand.webp',
  './img/ground-stone.webp',
  './img/sky-frost.webp',
  './img/sky-lava.webp',
  './img/sky-forest.webp',
  './img/sky-sand.webp',
  './img/sky-stone.webp',
  './img/deco-pine.webp',
  './img/deco-boulder.webp',
  './img/deco-icespike.webp',
  './img/deco-brazier.webp',
  './img/deco-pillar.webp',
  './img/deco-banner.webp',
  './img/deco-cactus.webp'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
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
  /* 只接管同源资源；云端通道（另一域名）与门卫脚本一律直连 */
  if (url.origin !== location.origin) return;
  if (url.pathname === '/gate.js' || url.pathname === '/zhz/zhz.css') return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
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
