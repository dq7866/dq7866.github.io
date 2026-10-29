// 《心动狂潮》Service Worker —— 预缓存 + 离线可用 + 可热更新
// v69 重写要点：
//  ① 缓存名 = 前缀 + 资源版本号（版本号随 sw.js?b=xxx 注册参数传入），发版即换新缓存，
//     彻底修掉「老用户永远拿到旧 core.js」的问题；② 预缓存补全 icon.svg / manifest.json；
//  ③ install 失败自动重试，不再静默吞错；④ 静态资源改 stale-while-revalidate（秒开 + 后台更新）；
//  ⑤ HTML 网络优先并带超时兜底，弱网也能立刻进游戏。
var CACHE_PREFIX='znxtx-1792758142';   // 保留原前缀，便于清理历史缓存
var BUILD=(function(){
  try{
    var u=new URL(self.location.href);
    var b=u.searchParams.get('b');
    if(b&&/^[A-Za-z0-9._-]{1,32}$/.test(b))return b;
  }catch(e){}
  return 'default';
})();
var CACHE=CACHE_PREFIX+'-'+BUILD;
var LIST=["./index.html","./manifest.json","./icon.svg","./og.png",
  "./icon-192.png","./icon-512.png",
  "./assets/three.js","./assets/core.js","./assets/mat2.js","./assets/env2.js",
  "./assets/dh2.js","./assets/fx2.js","./assets/tipcode.png"];

function precache(retry){
  return caches.open(CACHE).then(function(c){
    return Promise.all(LIST.map(function(u){
      return c.add(new Request(u,{cache:'reload'})).catch(function(err){
        if(retry>0){
          return new Promise(function(res){
            setTimeout(function(){res(c.add(new Request(u,{cache:'reload'})).catch(function(){self.__precacheFail=(self.__precacheFail||[]).concat([u]);}));},700);
          });
        }
        self.__precacheFail=(self.__precacheFail||[]).concat([u]);
        return null;
      });
    }));
  });
}

self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(precache(2));                 // v69：每个资源最多重试 2 次，且失败会被记录
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){
      return (k===CACHE)?null:caches.delete(k);   // 只保留当前版本缓存
    }));
  }).then(function(){return self.clients.claim();}));
});

self.addEventListener('message',function(e){
  if(e.data==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET')return;
  var u;try{u=new URL(r.url);}catch(x){return;}
  if(u.origin!==location.origin)return;                    // CDN / 第三方不劫持
  var isHTML=/index\.html$|\/$/.test(u.pathname);
  var isStatic=/\.(js|json|css|svg|png|jpg|jpeg|ico|webp|woff2?)$/i.test(u.pathname);
  if(!isHTML&&!isStatic)return;

  // ① 页面：网络优先，4 秒超时或失败则回落到缓存（弱网也能立刻进游戏）
  if(isHTML){
    e.respondWith(new Promise(function(resolve){
      var settled=false;
      var to=setTimeout(function(){
        if(settled)return;settled=true;
        caches.match('index.html').then(function(m){resolve(m||Response.error());});
      },4000);
      fetch(r).then(function(res){
        if(settled)return;settled=true;clearTimeout(to);
        try{var cp=res.clone();caches.open(CACHE).then(function(c){c.put('index.html',cp);});}catch(x){}
        resolve(res);
      }).catch(function(){
        if(settled)return;settled=true;clearTimeout(to);
        caches.match(r).then(function(m){return m||caches.match('index.html');}).then(function(m){resolve(m||Response.error());});
      });
    }));
    return;
  }

  // ② 静态资源：stale-while-revalidate —— 命中即返回（秒开），同时在后台拉新写回缓存
  e.respondWith(
    caches.match(r).then(function(m){
      var net=fetch(r).then(function(res){
        if(res&&res.status===200&&res.type==='basic'){
          try{var cp=res.clone();caches.open(CACHE).then(function(c){c.put(r,cp);});}catch(x){}
        }
        return res;
      }).catch(function(){return null;});
      if(m)return m;                                     // 有缓存：立即返回，后台更新
      return net.then(function(res){
        if(res)return res;
        return caches.match(r).then(function(m2){return m2||Response.error();});
      });
    })
  );
});