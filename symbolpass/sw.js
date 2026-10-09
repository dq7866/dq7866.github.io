/* 符号通行证 离线缓存（由 build.js 生成，请勿手改）
   核心资产在安装时预缓存；体积较大的书稿与总表在首次访问时按需缓存。 */
const VER = 'symbolpass-v20261009';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest', './guide.html',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png',
  './apple-touch-icon.png', './favicon-32.png'
];
const LAZY = ['./book.html', './symbols.html'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(VER).then(function(c){ return c.addAll(PRECACHE); }).then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(ks){
      return Promise.all(ks.filter(function(k){ return k !== VER; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if(url.origin !== location.origin) return;                 /* 只管自己域名下的请求 */
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function(hit){
      if(hit) return hit;
      return fetch(e.request).then(function(res){
        if(res && res.ok && LAZY.some(function(p){ return url.pathname.endsWith(p.slice(1)); })){
          const copy = res.clone();
          caches.open(VER).then(function(c){ c.put(e.request, copy); });
        }
        return res;
      }).catch(function(){
        /* 完全离线且未缓存时，退回应用页 */
        return caches.match('./index.html');
      });
    })
  );
});
