// 《渣男行天下》Service Worker —— 预缓存 + 离线可用
var CACHE='znxtx-1792299624';
var LIST=["./index.html", "./assets/three.js", "./assets/core.js", "./assets/mat2.js", "./assets/env2.js", "./assets/dh2.js", "./assets/fx2.js"];
self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(LIST.map(function(u){
      return c.add(u).catch(function(){return null;});
    }));
  }));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){return k===CACHE?null:caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET')return;
  var u;try{u=new URL(r.url);}catch(x){return;}
  if(u.origin!==location.origin)return;              // CDN / 第三方不劫持
  if(!/\.(js|json|css|png|jpg|jpeg|ico)$/i.test(u.pathname)&&!/\/$/.test(u.pathname)&&!/index\.html$/.test(u.pathname))return;
  // 网络优先拿 HTML（便于更新），缓存优先拿静态资源（二次秒开）
  if(/index\.html$|\/$/.test(u.pathname)){
    e.respondWith(
      fetch(r).then(function(res){
        var cp=res.clone();caches.open(CACHE).then(function(c){c.put(r,cp);}).catch(function(){});
        return res;
      }).catch(function(){return caches.match(r).then(function(m){return m||caches.match('index.html');});})
    );
    return;
  }
  e.respondWith(
    caches.match(r).then(function(m){
      if(m)return m;
      return fetch(r).then(function(res){
        if(res&&res.status===200&&res.type==='basic'){
          var cp=res.clone();caches.open(CACHE).then(function(c){c.put(r,cp);}).catch(function(){});
        }
        return res;
      });
    })
  );
});
