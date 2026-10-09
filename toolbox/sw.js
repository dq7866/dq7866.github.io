/* 免费工具箱 · Service Worker
   策略：同源资源「网络优先（强制绕过 HTTP 缓存）」，失败时回退到本地缓存 —— 既保证总会拿到最新文件，又能离线使用。 */
const CACHE = "toolbox-online-v1";
const ASSETS = [
  "index.html",
  "tts-tools.html",
  "game-moyu.html",
  "idphoto-tools.html",
  "ocr-tools.html",
  "player.html",
  "file-tools.html",
  "image-tools.html",
  "pdf-tools.html",
  "qr-tools.html",
  "sheet-tools.html",
  "color-tools.html",
  "random-tools.html",
  "md-tools.html",
  "av-tools.html",
  "capture-tools.html",
  "asr-tools.html",
  "calculator.html",
  "timestamp-tools.html",
  "regex-tools.html",
  "json-tools.html",
  "encode-tools.html",
  "pomodoro.html",
  "notes.html",
  "diff-tools.html",
  "chart-tools.html",
  "clipboard-tools.html",
  "password-safe.html",
  "ai-tools.html",
  "batch-image.html",
  "assets/css/app.css",
  "assets/js/shapes.js",
  "assets/js/status.js",
  "assets/js/enhance.js",
  "assets/js/tts-tools.js",
  "assets/js/idphoto-tools.js",
  "assets/js/ocr-tools.js",
  "assets/app.ico",
  "assets/js/player.js",
  "assets/js/recent-files.js",
  "assets/js/file-tools.js",
  "assets/js/prefs.js",
  "assets/js/i18n.js",
    "assets/js/theme-colors.js",
  "assets/js/image-tools.js",
  "assets/js/pdf-tools.js",
  "assets/js/qr-tools.js",
  "assets/js/sheet-tools.js",
  "assets/js/color-tools.js",
  "assets/js/random-tools.js",
  "assets/js/md-tools.js",
  "assets/js/av-tools.js",
  "assets/js/capture-tools.js",
  "assets/js/asr-tools.js",
  "assets/js/calculator.js",
  "assets/js/timestamp-tools.js",
  "assets/js/regex-tools.js",
  "assets/js/json-tools.js",
  "assets/js/encode-tools.js",
  "assets/js/pomodoro.js",
  "assets/js/notes.js",
  "assets/js/diff-tools.js",
  "assets/js/chart-tools.js",
  "assets/js/clipboard-tools.js",
  "assets/js/password-safe.js",
  "assets/js/ai-tools.js",
  "assets/js/batch-image.js",
  "assets/js/pwa.js",
  "assets/vendor/jszip.min.js",
  "assets/vendor/pdf-lib.min.js",
  "assets/vendor/pdf.min.js",
  "assets/vendor/pdf.worker.min.js",
  "assets/vendor/xlsx.full.min.js",
  "assets/vendor/qr-code-styling.min.js",
  "assets/vendor/jsqr.min.js",
  "assets/vendor/marked.min.js",
  "assets/vendor/purify.min.js",
  "assets/vendor/jsbarcode.all.min.js",
  "assets/icon.svg",
  "assets/og-image.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      await Promise.all(
        ASSETS.map(async (u) => {
          try {
            const r = await fetch(u, { cache: "reload" });
            if (r && r.ok) await c.put(u, r);
          } catch (err) {
            /* 离线时忽略 */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (!sameOrigin) return;

  e.respondWith(
    fetch(req, { cache: "reload" })
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
