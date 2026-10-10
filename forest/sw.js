/* 智慧林间学堂 · Service Worker
   设计：核心（HTML/manifest/图标）缓存优先保离线可开；
   assets 大资产（音频/照片/模型，~40MB）按需缓存、命中即离线，超 800 条先进先出。
   file:// 直开时注册脚本有协议守卫，本文件根本不会被执行。 */
const CACHE = "wisdom-forest-web-v1";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./assets/icon-192.png", "./assets/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 只管同源，外链照片直接走网络
  if (/\/assets\//.test(url.pathname)) {
    /* 大资产：缓存优先（离线兜底），未命中才回源并顺手入库 */
    e.respondWith(
      caches.match(req).then(hit =>
        hit ||
        fetch(req).then(res => {
          if (res.ok) {
            const cp = res.clone();
            caches.open(CACHE).then(c => { c.put(req, cp); trim(c); });
          }
          return res;
        }).catch(() => hit)
      )
    );
    return;
  }
  /* 核心文件：网络优先（保证更新），断网回落缓存 */
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const cp = res.clone();
        caches.open(CACHE).then(c => c.put(req, cp));
      }
      return res;
    }).catch(() => caches.match(req).then(h => h || caches.match("./index.html")))
  );
});
/* 容量护栏：运行时缓存超过 800 条时按加入顺序清理（大资产总量可控） */
function trim(cache) {
  cache.keys().then(keys => {
    if (keys.length <= 800) return;
    keys.slice(0, keys.length - 800).forEach(k => cache.delete(k));
  });
}
