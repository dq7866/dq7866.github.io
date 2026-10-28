/* 生活换算 · 全能手册 —— Service Worker
   作用：把工具页缓存下来，断网也能用；只缓存同源 GET 请求。
   更新策略：网络优先，失败回落缓存；缓存名带版本，新版本自动清旧缓存。 */
const CACHE = 'lifeconv-v33';
const CORE = ['./units.html', './units.webmanifest', './units-icon-192.png', './units-icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 汇率接口等跨域请求不接管

  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./units.html')))
  );
});
