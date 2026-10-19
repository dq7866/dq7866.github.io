/* 注册 Service Worker，让应用可离线使用、可「添加到主屏幕」 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW 注册失败：", e));
  });
}
