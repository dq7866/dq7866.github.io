'use strict';
/* =================《渣男行天下》手机版 Demo v2 =================
   设计范式参考：弹壳特攻队 / 吸血鬼幸存者 / Hades
   - 虚拟摇杆 + 全自动攻击（手机端核心操作）
   - 5武器+4被动，满级进化合成（Build深度）
   - 6种敌人 + 精英 + 双阶段Boss（带地面预警）
   - 伤害数字 / 屏震 / 粒子 / WebAudio音效
==================================================================*/
/* v66:平铺材质AI贴图（地砖/沥青/楼体立面/360天际线，webp 无缝） */
const MAT2=window.__ZA__&&window.__ZA__.MAT2?window.__ZA__.MAT2:{};const _mat2Cache={};
// v66：平铺材质加载（地砖/沥青/楼体立面/360天际线）。repeat 贴图统一用 MirroredRepeat，
// 天然消接缝；务必用 sRGB 编码，否则整体发白。
function matTex(id,repX,repY){
  const k=id+'|'+repX+'|'+repY;
  if(_mat2Cache[k])return _mat2Cache[k];
  let d=null;try{d=MAT2&&MAT2[id];}catch(e){d=null;}
  if(!d)return null;
  const t=new THREE.TextureLoader().load('data:image/webp;base64,'+d.t);
  t.wrapS=t.wrapT=THREE.MirroredRepeatWrapping;
  if(repX)t.repeat.set(repX,repY||repX);
  t.anisotropy=4;t.encoding=THREE.sRGBEncoding;
  _mat2Cache[k]=t;return t;}
// v66：360 城市天际线天空盒（失败回退纯色）
function matSkyTex(){
  let d=null;try{d=MAT2&&MAT2['sky'];}catch(e){d=null;}
  if(!d)return null;
  const t=new THREE.TextureLoader().load('data:image/webp;base64,'+d.t);
  t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;
  t.mapping=THREE.EquirectangularReflectionMapping;
  t.encoding=THREE.sRGBEncoding;
  return t;}

// ---------- 渲染基础 ----------
const scene=new THREE.Scene();
// v66：AI 生成的 360° 城市天际线天空盒（真正的远景城市，不再是纯色 + 雾）
scene.background=new THREE.Color(0x0a0512);
scene.fog=new THREE.FogExp2(0x2a1046,0.012);
// v66：天空穹顶（BackSide 巨球，贴 AI 全景）。用 Mesh 而非 scene.background，
// 是因为昼夜系统会每帧改写 background；用 mesh 才能把时段色「染色」到天际线上。
let skyDome=null;
(function(){
  const t=matSkyTex();if(!t)return;
  const geo=new THREE.SphereGeometry(260,32,20);
  const mat=new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide,fog:false,depthWrite:false});
  skyDome=new THREE.Mesh(geo,mat);skyDome.renderOrder=-1;skyDome.frustumCulled=false;
  skyDome.userData.noOutline=true;scene.add(skyDome);})();
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,300);
let renderer=null,WEBGL_OK=true;
try{
  const _t=document.createElement('canvas');
  if(!(_t.getContext('webgl')||_t.getContext('experimental-webgl')))throw new Error('no webgl');
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
}catch(err){
  WEBGL_OK=false;console.warn('WebGL 不可用，进入降级模式',err);
  document.body.insertAdjacentHTML('beforeend',
   `<div id="webglFail" style="position:fixed;inset:0;z-index:9999;background:#120a1e;display:flex;align-items:center;justify-content:center;">
     <div style="max-width:320px;text-align:center;color:#e8d5f0;font-family:inherit;padding:24px;border:1px solid #4a2a6e;border-radius:14px;background:#1e1230;">
       <div style="font-size:40px">🎮</div>
       <div style="font-size:18px;font-weight:bold;margin:10px 0;color:#ffd60a">设备暂不支持 3D 渲染</div>
       <div style="font-size:13px;line-height:1.7;opacity:.8">请尝试：更换 Chrome / Safari 最新版浏览器，或在系统设置中开启「硬件加速」后刷新重试。</div>
       <button onclick="location.reload()" style="margin-top:16px;padding:10px 28px;border:none;border-radius:20px;background:linear-gradient(90deg,#9d4edd,#ff4d9e);color:#fff;font-size:15px">🔄 重新尝试</button>
     </div></div>`);
  throw err;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement);
// 电影级色调映射 + 软阴影（照片感关键）
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.NoToneMapping; // v30：赛璐璐动画风禁用 ACES（ACES 会把亮色去饱和推白）
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
// v52：统一 resize 入口（全屏切换 / 旋屏 / 键盘弹出 都走这里）
function onResize(){
  const w=innerWidth,h=innerHeight;
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setSize(w,h);
  // 全屏时浏览器 DPR 可能变化（投屏/缩放），跟着画质档位重算一次
  if(typeof QUAL!=='undefined'&&QUAL&&QUAL.dpr)renderer.setPixelRatio(Math.min(QUAL.dpr,devicePixelRatio||1));
  document.body.classList.toggle('fsTall',!!fsElement()&&h>w);
}
addEventListener('resize',onResize);
addEventListener('orientationchange',()=>{setTimeout(onResize,180);setTimeout(onResize,520);});
// ---------- 自适应画质（保帧率 · 省电 · 防烫） ----------
// 三档：2=高(DPR 2 + 阴影) / 1=中(DPR 1.5 无阴影) / 0=低(DPR 1 无阴影·简后期)
const QUAL={level:2,dpr:2,shadow:true,grade:true,rain:true};
let qualAcc=0,qualFrames=0,qualLow=0,qualHigh=0;
QUAL._dprCap=Math.min(devicePixelRatio,2);
function applyQuality(){
  const px=QUAL.level===2?2:QUAL.level===1?1.5:1;
  renderer.setPixelRatio(Math.min(devicePixelRatio,px));
  renderer.shadowMap.enabled=QUAL.shadow;
  renderer.setSize(innerWidth,innerHeight);
  if(typeof rain!=='undefined'&&rain)rain.visible=(QUAL.rain&&CHAPTERS[chapter%CHAPTERS.length].rain);
  if(typeof scene==='undefined'||!scene)return;
  // 遍历场景关闭/开启阴影投射，减少 draw call
  scene.traverse(o=>{if(o.isMesh&&o.material&&o.castShadow!==undefined)o.castShadow=QUAL.shadow;});
}
function autoQuality(dt,fps){
  qualAcc+=dt;qualFrames++;
  if(qualAcc>=1.5){const f=qualFrames/qualAcc;qualAcc=0;qualFrames=0;
    if(f<38&&QUAL.level>0){qualLow++;qualHigh=0;if(qualLow>=2){QUAL.level--;QUAL.shadow=QUAL.level>=2;
      QUAL.grade=QUAL.level>=1;QUAL.rain=QUAL.level>=1;applyQuality();
      tip(QUAL.level===1?'⚙️ 已切至均衡画质（保流畅）':'⚙️ 已切至流畅画质（省电模式）');qualLow=0;}}
    else if(f>56&&QUAL.level<2){qualHigh++;qualLow=0;if(qualHigh>=4){QUAL.level++;QUAL.shadow=QUAL.level>=2;
      QUAL.grade=QUAL.level>=1;QUAL.rain=QUAL.level>=1;applyQuality();qualHigh=0;}}
    else{qualLow=0;qualHigh=0;}}
}
// 切后台自动暂停 + 恢复
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(typeof started!=='undefined'&&started&&!hardPause){hardPause=true;
    const pb=document.getElementById('pauseBtn');if(pb)pb.textContent='▶';}}
});
// 依据设备能力给个合理的初始档（低内存/低核数直接中档起步）
// 注意：真正的 applyQuality 调用在脚本末尾（game init 阶段），此处仅决定档位
(function initQuality(){
  const mem=navigator.deviceMemory||4,cores=navigator.hardwareConcurrency||4;
  if(mem<=2||cores<=4){QUAL.level=1;QUAL.shadow=false;QUAL.rain=true;QUAL.grade=true;}
})();

const ambient=new THREE.AmbientLight(0x8855bb,.18);scene.add(ambient);
scene.add(new THREE.HemisphereLight(0x9b6bd8,0x3a1f2e,.28)); // 天光反弹
const key=new THREE.DirectionalLight(0xffa0d8,.8);key.position.set(8,18,6);
key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-40;key.shadow.camera.right=40;
key.shadow.camera.top=40;key.shadow.camera.bottom=-40;scene.add(key);
const p1=new THREE.PointLight(0x4cc9f0,.3,70);p1.position.set(-20,12,-14);scene.add(p1);
const p2=new THREE.PointLight(0xf72585,.35,70);p2.position.set(20,10,16);scene.add(p2);

// ---------- 天空穹顶（黄昏渐变+星空+云层） ----------
(function skyDome(){const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d');
  const grad=g.createLinearGradient(0,0,0,512);
  grad.addColorStop(0,'#0d0620');grad.addColorStop(.45,'#2a1046');
  grad.addColorStop(.75,'#6b2a68');grad.addColorStop(.92,'#b34a7d');grad.addColorStop(1,'#e07a9a');
  g.fillStyle=grad;g.fillRect(0,0,1024,512);
  for(let i=0;i<380;i++){g.fillStyle=`rgba(255,255,255,${.15+Math.random()*.7})`;
    g.fillRect(Math.random()*1024,Math.random()*280,Math.random()<.12?2:1,1);}
  for(let i=0;i<16;i++){const x=Math.random()*1024,y=60+Math.random()*140,w=120+Math.random()*260;
    const cg=g.createRadialGradient(x,y,10,x,y,w);
    cg.addColorStop(0,'rgba(255,170,200,.16)');cg.addColorStop(1,'rgba(255,170,200,0)');
    g.fillStyle=cg;g.beginPath();g.arc(x,y,w,0,7);g.fill();}
  g.fillStyle='rgba(255,230,200,.9)';g.beginPath();g.arc(820,120,34,0,7);g.fill();
  g.fillStyle='rgba(255,220,180,.25)';g.beginPath();g.arc(820,120,52,0,7);g.fill();
  const t=new THREE.CanvasTexture(c);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(120,24,16),
    new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide,fog:false}));
  scene.add(dome);})();

// 地面：都市广场贴图（无缝地砖平铺）—— v31：中央爱心广场拆为独立贴花，纹素密度 4x→10x 提清晰
function groundTex(){const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  g.fillStyle='#1b1524';g.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=64)for(let x=0;x<512;x+=64){
    g.fillStyle=((x+y)/64)%2?'#221a30':'#1e1729';g.fillRect(x+2,y+2,60,60);
    g.strokeStyle='rgba(255,140,210,.12)';g.strokeRect(x+2,y+2,60,60);
    // 砖面磨损噪点（打破均匀感，近看不糊）
    for(let i=0;i<12;i++){g.fillStyle=`rgba(${Math.random()<.5?'255,255,255':'0,0,0'},${.02+Math.random()*.05})`;
      g.fillRect(x+Math.random()*54,y+Math.random()*54,2+Math.random()*5,2+Math.random()*5);}}
  // 碎光点
  for(let i=0;i<260;i++){g.fillStyle=`hsla(${300+Math.random()*50},70%,${50+Math.random()*35}%,${.1+Math.random()*.4})`;
    g.beginPath();g.arc(Math.random()*512,Math.random()*512,Math.random()*1.8+.6,0,7);g.fill();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(10,10);
  try{t.anisotropy=renderer.capabilities.getMaxAnisotropy();}catch(e){}
  return t;}
// 中央爱心广场贴花（独立贴地贴花，不再随地面平铺重复）
function heartDecalTex(){const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  const grad=g.createRadialGradient(256,256,40,256,256,250);
  grad.addColorStop(0,'rgba(247,37,133,.34)');grad.addColorStop(1,'rgba(247,37,133,0)');
  g.fillStyle=grad;g.fillRect(0,0,512,512);
  g.fillStyle='rgba(255,100,180,.42)';g.beginPath();
  g.moveTo(256,195);g.bezierCurveTo(256,132,132,132,132,216);g.bezierCurveTo(132,286,256,336,256,404);
  g.bezierCurveTo(256,336,380,286,380,216);g.bezierCurveTo(380,132,256,132,256,195);g.fill();
  return new THREE.CanvasTexture(c);}
const ARENA=42;
// 地面凹凸/粗糙度贴图（质感）
function noiseCanvas(size){const c=document.createElement('canvas');c.width=c.height=size;
  const g=c.getContext('2d');g.fillStyle='#808080';g.fillRect(0,0,size,size);
  for(let i=0;i<size*size/3;i++){const v=100+Math.random()*80;
    g.fillStyle=`rgba(${v},${v},${v},.5)`;g.fillRect(Math.random()*size,Math.random()*size,2,2);}
  return c;}
function noiseTex(rep=25,size=256){const t=new THREE.CanvasTexture(noiseCanvas(size));
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);return t;}
// v31：灰度高度图 → 切线空间法线贴图（真实凹凸光影，替代 bumpMap 近似）
function heightToNormal(src,strength){strength=strength||1;
  const w=src.width,h=src.height,s=src.getContext('2d').getImageData(0,0,w,h).data;
  const out=document.createElement('canvas');out.width=w;out.height=h;
  const og=out.getContext('2d'),od=og.createImageData(w,h),d=od.data;
  const hv=(x,y)=>{x=(x+w)%w;y=(y+h)%h;return s[(y*w+x)*4]/255;};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=(hv(x+1,y)-hv(x-1,y))*strength,dy=(hv(x,y+1)-hv(x,y-1))*strength;
    const inv=1/Math.sqrt(dx*dx+dy*dy+1),i=(y*w+x)*4;
    d[i]=(-dx*inv*.5+.5)*255;d[i+1]=(-dy*inv*.5+.5)*255;d[i+2]=inv*255;d[i+3]=255;}
  og.putImageData(od,0,0);
  const t=new THREE.CanvasTexture(out);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
const groundNormal=heightToNormal(noiseCanvas(256),2.4);groundNormal.repeat.set(30,30);
// 粗糙度变化图：局部磨亮/湿滑区域，反射不再均匀像"塑料布"
const groundRough=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  g.fillStyle='#7a7a7a';g.fillRect(0,0,256,256);
  for(let i=0;i<44;i++){const x=Math.random()*256,y=Math.random()*256,r=18+Math.random()*54;
    const rg=g.createRadialGradient(x,y,2,x,y,r);
    rg.addColorStop(0,'rgba(40,40,40,.5)');rg.addColorStop(1,'rgba(40,40,40,0)');
    g.fillStyle=rg;g.fillRect(x-r,y-r,r*2,r*2);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(6,6);return t;})();
const _gMap=(()=>{try{return matTex('pave',26,26);}catch(e){return null;}})();
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),
  new THREE.MeshStandardMaterial({map:_gMap||groundTex(),roughness:.62,metalness:.12,
    normalMap:groundNormal,normalScale:new THREE.Vector2(.5,.5),
    roughnessMap:groundRough,
    envMap:(()=>{const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');
      const gd=g.createLinearGradient(0,0,0,128);
      gd.addColorStop(0,'#2a1046');gd.addColorStop(.5,'#6b2a68');gd.addColorStop(.75,'#ffb0d0');
      gd.addColorStop(1,'#5a2a50');g.fillStyle=gd;g.fillRect(0,0,256,128);
      // 霓虹光斑（反射源）
      [[40,90,'#ff4d9e'],[110,86,'#ffd60a'],[180,92,'#4cc9f0'],[70,80,'#ff8fa3']].forEach(([x,y,c2])=>{
        const rg=g.createRadialGradient(x,y,1,x,y,26);rg.addColorStop(0,c2);rg.addColorStop(1,'rgba(0,0,0,0)');
        g.fillStyle=rg;g.fillRect(x-26,y-26,52,52);});
      const t=new THREE.CanvasTexture(c);t.mapping=THREE.EquirectangularReflectionMapping;return t;})(),
    envMapIntensity:.85}));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
// v66：AI 沥青环城马路（把单调的"一整片地砖"换成真实街道层次：内圈广场 + 外圈车道）
(function(){try{
  const t=matTex('road',11,11);if(!t)return;
  const m=new THREE.Mesh(new THREE.RingGeometry(16.5,30,72,1),
    new THREE.MeshStandardMaterial({map:t,roughness:.88,metalness:.04}));
  // y 必须低于积水(.012~.014)与爱心贴花(.018)，否则雨天环城路面上的水坑会被整片盖住
  m.rotation.x=-Math.PI/2;m.position.y=.009;m.receiveShadow=true;
  m.userData.aiRoad=true;scene.add(m);}catch(e){}})();
// 中央爱心广场贴花（v31：贴地防 z-fighting，随玩家全图唯一）
const heartDecal=new THREE.Mesh(new THREE.CircleGeometry(9,44),
  new THREE.MeshLambertMaterial({map:heartDecalTex(),transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-2}));
heartDecal.rotation.x=-Math.PI/2;heartDecal.position.y=.018;scene.add(heartDecal);
// 人物接触阴影（贴地软圆影，廉价但极提真实感）
function blobShadow(s=1){const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d');const rg=g.createRadialGradient(32,32,4,32,32,30);
  rg.addColorStop(0,'rgba(0,0,0,.42)');rg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=rg;g.fillRect(0,0,64,64);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(1.5*s,1.5*s),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.y=.03;m.userData.isShadow=true;return m;}
// 边界光柱
const wall=new THREE.Mesh(new THREE.CylinderGeometry(ARENA,ARENA,.5,64,1,true),
  new THREE.MeshBasicMaterial({color:0xf72585,transparent:true,opacity:.18,side:THREE.DoubleSide}));
wall.position.y=.25;scene.add(wall);

// ---------- 雨天积水与实时反射（v28） ----------
// 低分辨率 CubeCamera 抓取场景作为水洼环境反射源（按画质节流），配合法线扰动/湿度渐变
const PUDDLE_N=14;
const puddleGroup=new THREE.Group();puddleGroup.visible=false;scene.add(puddleGroup);
const puddleAlpha=(()=>{const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d');
  const rg=g.createRadialGradient(64,64,10,64,64,62);
  rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(.68,'rgba(255,255,255,.85)');
  rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=rg;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})();
const puddleNormal=(()=>{const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d');g.fillStyle='#8080ff';g.fillRect(0,0,128,128);
  for(let i=0;i<240;i++){g.strokeStyle=`rgba(${128+((Math.random()*60-30)|0)},128,${252-((Math.random()*40)|0)},.45)`;
    g.lineWidth=1;g.beginPath();g.arc(Math.random()*128,Math.random()*128,1+Math.random()*4,0,7);g.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);return t;})();
let cubeRT=null,cubeCam=null,cubeOK=true,cubeTick=0;
try{
  cubeRT=new THREE.WebGLCubeRenderTarget(64,{format:THREE.RGBFormat,generateMipmaps:true,
    minFilter:THREE.LinearMipmapLinearFilter});
  cubeCam=new THREE.CubeCamera(.5,140,cubeRT);scene.add(cubeCam);
}catch(err){cubeOK=false;console.warn('CubeCamera 不可用，积水改用静态反射贴图',err);}
// 霓虹倒影光斑（叠加在水洼上，模拟霓虹灯映在积水里的光）
const puddleGlowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d');
  const rg=g.createRadialGradient(64,64,4,64,64,60);
  rg.addColorStop(0,'rgba(255,255,255,.85)');rg.addColorStop(.4,'rgba(255,255,255,.26)');
  rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=rg;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})();
const PUDDLE_NEON=[0xff4d9e,0x4cc9f0,0xffd60a,0xc77dff];
const PUDDLES=[];
for(let i=0;i<PUDDLE_N;i++){
  const rad=1.5+Math.random()*3.2;
  const m=new THREE.Mesh(new THREE.CircleGeometry(rad,26),
    new THREE.MeshStandardMaterial({color:0x0b1220,metalness:.98,roughness:.04,
      transparent:true,opacity:0,alphaMap:puddleAlpha,depthWrite:false,
      envMap:cubeOK?cubeRT.texture:ground.material.envMap,envMapIntensity:1.7,
      normalMap:puddleNormal,normalScale:new THREE.Vector2(.22,.22)}));
  m.rotation.x=-Math.PI/2;m.position.y=.014;
  const a=Math.random()*7,rr=6+Math.random()*(ARENA-9);
  m.position.set(Math.cos(a)*rr,.014,Math.sin(a)*rr);
  const gl=new THREE.Mesh(new THREE.CircleGeometry(rad*.92,20),
    new THREE.MeshBasicMaterial({map:puddleGlowTex,color:PUDDLE_NEON[i%PUDDLE_NEON.length],
      transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
  gl.rotation.x=-Math.PI/2;gl.position.y=.012;gl.renderOrder=2;
  m.add(gl);
  m.userData={base:rad,ph:Math.random()*7,sx:.7+Math.random()*.9,sz:.7+Math.random()*.9,glow:gl};
  puddleGroup.add(m);PUDDLES.push(m);}
let puddleWet=0;
function updatePuddles(dt,t,wet){
  puddleWet+=(wet-puddleWet)*Math.min(1,dt*1.15);
  const vis=puddleWet>.32;   // 仅雨天/雷暴（wet≥1）形成明显水洼，浓雾只是地面微湿
  puddleGroup.visible=vis;
  // 湿地联动：地面越湿越光滑、反射越强（雨停后逐渐恢复）
  const k=Math.min(1,Math.max(0,(puddleWet-.05)/.9));
  ground.material.roughness=.45-.25*k;
  ground.material.metalness=.35+.30*k;
  ground.material.envMapIntensity=.85+.55*k;
  if(!vis)return;
  const op=Math.min(.92,Math.max(0,puddleWet-.15)*.95);
  for(const m of PUDDLES){m.material.opacity=op;
    const s=1+Math.sin(t*.7+m.userData.ph)*.02;
    m.scale.set(s*m.userData.sx,s*m.userData.sz,1);
    m.material.normalMap.offset.set(Math.sin(t*.3+m.userData.ph)*.03,Math.cos(t*.24)*.03);
    // 霓虹倒影光斑：随水波呼吸明灭
    m.userData.glow.material.opacity=op*(.30+.22*Math.sin(t*1.3+m.userData.ph*2));}
  if(!cubeOK||!QUAL.rain)return;
  // 实时反射抓取（抓取时隐藏水洼本体避免反馈）
  // 低帧率设备自适应降频：基础档 ×2/×4（软件渲染/低端机保护）
  cubeTick++;
  const _skip=dt>.06?2:dt>.04?1:0;
  const every=(QUAL.level>=3?6:QUAL.level>=2?12:24)<<_skip;
  if(puddleWet>.3&&cubeTick%every===0){
    cubeCam.position.set(player.position.x,1.3,player.position.z);
    puddleGroup.visible=false;
    try{cubeCam.update(renderer,scene);}catch(err){cubeOK=false;}
    puddleGroup.visible=true;}
}

// ---------- 雨丝粒子（雨夜氛围） ----------
const RAIN_N=900;
const rainGeo=new THREE.BufferGeometry();
const rainPos=new Float32Array(RAIN_N*3),rainSpd=new Float32Array(RAIN_N);
for(let i=0;i<RAIN_N;i++){rainPos[i*3]=(Math.random()-.5)*90;rainPos[i*3+1]=Math.random()*32;
  rainPos[i*3+2]=(Math.random()-.5)*90;rainSpd[i]=16+Math.random()*14;}
rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0xbfe4ff,size:.13,
  transparent:true,opacity:.65,depthWrite:false}));
scene.add(rain);
// 地面涟漪（雨落水花，周期性亮环）
const ripples=[];
const rippleGeo=new THREE.RingGeometry(.15,.3,14);
function spawnRipple(){if(ripples.length>14)return;
  const wet=Math.min(1,((WEATHERS[envWeather]&&WEATHERS[envWeather].wet)||0)/1.2);
  const m=new THREE.Mesh(rippleGeo,new THREE.MeshBasicMaterial({color:0x9fd8ff,transparent:true,
    opacity:.4+.25*wet,side:THREE.DoubleSide}));
  m.rotation.x=-Math.PI/2;
  // v28：雨天有积水时优先落在水洼内，形成清晰的积水涟漪
  if(PUDDLES.length&&wet>.3&&Math.random()<.62){
    const p=PUDDLES[Math.floor(Math.random()*PUDDLES.length)],R=p.userData.base*1.5;
    m.position.set(p.position.x+(Math.random()-.5)*R,.05,p.position.z+(Math.random()-.5)*R);
    m.userData.life=.95;m.userData.max=.95;
  }else{
    m.position.set(player.position.x+(Math.random()-.5)*34,.05,player.position.z+(Math.random()-.5)*34);
    m.userData.life=.8;m.userData.max=.8;
  }
  scene.add(m);ripples.push(m);}

// 天空漂浮心
const heartShape=new THREE.Shape();
heartShape.moveTo(0,.5);heartShape.bezierCurveTo(0,.8,-.5,.8,-.5,.3);heartShape.bezierCurveTo(-.5,-.1,0,-.3,0,-.6);
heartShape.bezierCurveTo(0,-.3,.5,-.1,.5,.3);heartShape.bezierCurveTo(.5,.8,0,.8,0,.5);
const heartGeo=new THREE.ExtrudeGeometry(heartShape,{depth:.12,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:1});
const floaters=[];
for(let i=0;i<18;i++){const m=new THREE.Mesh(heartGeo,new THREE.MeshStandardMaterial({
  color:new THREE.Color().setHSL(.86+Math.random()*.14,.8,.55),emissive:0xff2d78,emissiveIntensity:.5,metalness:.6,roughness:.3}));
  const a=Math.random()*7,r=30+Math.random()*30;
  m.position.set(Math.cos(a)*r,10+Math.random()*16,Math.sin(a)*r);
  m.scale.setScalar(1.4+Math.random()*2.6);m.rotation.y=Math.random()*7;
  m.userData={s:.2+Math.random()*.4,y:m.position.y};floaters.push(m);scene.add(m);}

// ---------- 卡通渲染（动画番剧质感） ----------
function gradTex(){const d=new Uint8Array([90,170,255]);
  const t=new THREE.DataTexture(d,3,1,THREE.LuminanceFormat);
  t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;}
const GRAD=gradTex();
function toon(color,emissive=0x000000,ei=0){return new THREE.MeshToonMaterial({color,gradientMap:GRAD,emissive,emissiveIntensity:ei});}

// ---------- 修为境界体系 ----------
const REALMS=['炼体','练气','凝气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫','渣男大帝'];
const LAYERS=['前期','中期','后期'];
function realmName(lvl){const r=Math.min(REALMS.length-1,Math.floor((lvl-1)/3)),l=LAYERS[(lvl-1)%3];
  return r>=REALMS.length-1?'渣男大帝':`${REALMS[r]}·${l}`;}
function realmIdx(lvl){return Math.floor((lvl-1)/3);}

// ========== v29：写实人物几何库（细分曲面 / 几何缓存 / 骨架化四肢 / 表情绑定） ==========
// 思路：抛弃「圆柱 + 球」的简笔画拼装，改用旋转台轮廓（Lathe）造躯干与裙摆、
// 胶囊体造四肢、椭球造颅骨与下颌，并为每个角色绑定可驱动的五官骨架。
const GEO_CACHE={};
function gc(k,fn){let v=GEO_CACHE[k];if(v===undefined){v=fn();GEO_CACHE[k]=v;}return v;}
function sph(r,w,h){return gc(`s${r}_${w}_${h}`,()=>new THREE.SphereGeometry(r,w||16,h||12));}
function sphCap(r,w,h,th){return gc(`sc${r}_${w}_${h}_${th}`,()=>new THREE.SphereGeometry(r,w||16,h||12,0,Math.PI*2,0,th));}
function sphSeg(r,w,h,ps,pl,ts,tl){return gc(`ss${r}_${w}_${h}_${ps}_${pl}_${ts}_${tl}`,()=>new THREE.SphereGeometry(r,w||16,h||12,ps,pl,ts,tl));}
function cyl(rt,rb,h,seg,hs,open){return gc(`c${rt}_${rb}_${h}_${seg}_${hs}_${open?1:0}`,
  ()=>new THREE.CylinderGeometry(rt,rb,h,seg||14,hs||1,!!open));}
function bx(w,h,d){return gc(`b${w}_${h}_${d}`,()=>new THREE.BoxGeometry(w,h,d));}
function cone(r,h,seg){return gc(`k${r}_${h}_${seg}`,()=>new THREE.ConeGeometry(r,h,seg||12));}
function pgeo(w,h){return gc(`p${w}_${h}`,()=>new THREE.PlaneGeometry(w,h));}
function torus(r,t,rs,ts,arc){return gc(`t${r}_${t}_${rs}_${ts}_${arc}`,()=>new THREE.TorusGeometry(r,t,rs,ts,arc));}
// 胶囊体（圆柱 + 两端半球）：四肢 / 指节的自然外形
function capsule(r,len,seg,capSeg){seg=seg||12;capSeg=capSeg||5;
  return gc(`q${r}_${len}_${seg}_${capSeg}`,()=>{
    const half=Math.max(.004,len*.5-r),pts=[];
    for(let i=0;i<=capSeg;i++){const a=-Math.PI/2+Math.PI/2*i/capSeg;
      pts.push(new THREE.Vector2(Math.max(.001,Math.cos(a)*r),Math.sin(a)*r-half));}
    for(let i=0;i<=capSeg;i++){const a=Math.PI/2*i/capSeg;
      pts.push(new THREE.Vector2(Math.max(.001,Math.cos(a)*r),Math.sin(a)*r+half));}
    const g=new THREE.LatheGeometry(pts,seg);g.computeVertexNormals();return g;});}
// 旋转台轮廓：躯干 / 裙摆 / 发髻等有机形体，profile=[[半径,高度],...]
function lathe(profile,seg,phiStart,phiLength){
  const ps=phiStart||0,pl=phiLength===undefined?Math.PI*2:phiLength;
  const k='L'+profile.map(p=>p[0].toFixed(3)+'x'+p[1].toFixed(3)).join('_')+'_'+(seg||18)+'_'+ps.toFixed(2)+'_'+pl.toFixed(2);
  return gc(k,()=>{const g=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(Math.max(.001,p[0]),p[1])),seg||18,ps,pl);
    g.computeVertexNormals();return g;});}
// ---------- 写实材质（PBR：皮肤 / 布料 / 发丝 / 金属 / 玻璃） ----------
// 说明：自发光预设为自身色 + 强度 0，受击闪光时抬升强度即可产生"轮廓爆闪"反馈
// v31：布料织纹 / 发丝走向微凹凸——近看不再是"塑料壳"
const fabricBump=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  g.fillStyle='#808080';g.fillRect(0,0,128,128);
  for(let i=0;i<128;i+=4){g.fillStyle='rgba(255,255,255,.15)';g.fillRect(0,i,128,2);
    g.fillStyle='rgba(0,0,0,.15)';g.fillRect(i,0,2,128);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);return t;})();
const hairBump=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  g.fillStyle='#808080';g.fillRect(0,0,128,128);
  for(let x=0;x<128;x+=2){const v=116+Math.round(Math.random()*44-22);
    g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(x,0,2,128);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,4);return t;})();
function skinMat(col){col=col===undefined?0xf6ccae:col;return new THREE.MeshStandardMaterial({color:col,roughness:.6,metalness:0,envMapIntensity:.2,emissive:col,emissiveIntensity:0});}
function clothMat(col,rough){return new THREE.MeshStandardMaterial({color:col,roughness:rough===undefined?.85:rough,metalness:.03,envMapIntensity:.35,emissive:col,emissiveIntensity:0,bumpMap:fabricBump,bumpScale:.05});}
function hairMat(col){return new THREE.MeshStandardMaterial({color:col,roughness:.52,metalness:.06,envMapIntensity:.5,emissive:col,emissiveIntensity:.03,bumpMap:hairBump,bumpScale:.04});}
function metalMat(col,rough,mtl){return new THREE.MeshStandardMaterial({color:col,roughness:rough===undefined?.4:rough,metalness:mtl===undefined?.85:mtl,envMapIntensity:1,emissive:col,emissiveIntensity:0});}
function glassMat(col,op){return new THREE.MeshStandardMaterial({color:col,roughness:.06,metalness:.35,transparent:true,opacity:op===undefined?.5:op,envMapIntensity:1.3,emissive:col,emissiveIntensity:.08});}
// ========== v30：动漫（二次元）渲染体系 ==========
// 4 阶赛璐璐渐变（比 3 阶分界更柔和，接近番剧上色）
const GRAD2=(()=>{const d=new Uint8Array([64,146,212,255]);
  const t=new THREE.DataTexture(d,4,1,THREE.LuminanceFormat);
  t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;})();
// 动漫材质：Toon 着色（忽略环境反射 → 肤色不再被环境光洗白，颜色更饱和）
function toonMat(col,ei){return new THREE.MeshToonMaterial({color:col,gradientMap:GRAD2,
  emissive:col,emissiveIntensity:ei===undefined?0:ei});}
// v54：角色专用 6 阶渐变（比场景用 4 阶多一档 —— 皮肤有「亮部/次亮/过渡/暗部/阴影」层次，
// 而不是原来 Basic 平涂的零明暗。这是「纸片人」观感的第一根因）
/* v56:AI 真人皮肤纹理（无五官平铺贴图） */
const SKIN_TEX_B64="data:image/jpeg;base64,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";
const GRAD_FIG=(()=>{const d=new Uint8Array([92,150,196,226,246,255]);
  const t=new THREE.DataTexture(d,6,1,THREE.LuminanceFormat);
  t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;})();
const _skinMatCache={};
// v56：AI 真人皮肤纹理（细孔/暖调平铺）—— 贴到角色身上获得"真人质感"
const SKIN_TEX=(typeof SKIN_TEX_B64!=='undefined')?(()=>{const t=new THREE.Texture();
  const im=new Image();im.onload=()=>{t.image=im;t.needsUpdate=true;};
  im.src=SKIN_TEX_B64;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(6,6);
  t.anisotropy=2;return t;})():null;
// v56：皮肤贴图材质 —— Toon 6 阶明暗 × 真人皮肤纹理；
// 贴图会乘色变暗，故材质色向白色回混 42% 保持原肤色
function skinToon(col){
  const c=(col===undefined?0xffd9b8:col);
  if(_skinMatCache[c])return _skinMatCache[c];
  const m=new THREE.MeshToonMaterial({color:c,gradientMap:GRAD_FIG});
  if(SKIN_TEX){m.map=SKIN_TEX;
    m.color=new THREE.Color(c).lerp(new THREE.Color(0xffffff),.60);
    m.needsUpdate=true;}
  // 暗部向暖紫偏，避免肤色暗面发灰发脏（二次元肤色惯例）
  m.emissive=new THREE.Color(c).multiplyScalar(.14);
  m.userData.rim={col:0xffd9c4,pow:2.6,str:.42};
  // v54：受击闪光仍可抬 emissiveIntensity（原有逻辑兼容）
  m.userData.baseEmissive=.14;
  _skinMatCache[c]=m;return m;
}
// v54：菲涅尔边缘光 shader（Rim）—— 视线与法线相切处补亮边
const RIM_VERT=`
varying vec3 vNW;varying vec3 vNW2;
void main(){
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  vNW=normalize(normalMatrix*normal);
  vNW2=normalize(mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;
const RIM_FRAG=`
uniform vec3 uRimCol;uniform float uRimPow;uniform float uRimStr;
varying vec3 vNW;varying vec3 vNW2;
void main(){
  float f=1.0-max(dot(normalize(vNW),normalize(-vNW2)),0.0);
  float rim=pow(f,uRimPow)*uRimStr;
  gl_FragColor=vec4(uRimCol*rim,rim);
}`;
function skinToon(col){
  const c=(col===undefined?0xffd9b8:col);
  if(_skinMatCache[c])return _skinMatCache[c];
  const m=new THREE.MeshToonMaterial({color:c,gradientMap:GRAD_FIG});
  // 暗部向暖紫偏，避免肤色暗面发灰发脏（二次元肤色惯例）
  m.emissive=new THREE.Color(c).multiplyScalar(.14);
  m.userData.rim={col:0xffd9c4,pow:2.6,str:.42};
  // v54：受击闪光仍可抬 emissiveIntensity（原有逻辑兼容）
  m.userData.baseEmissive=.14;
  _skinMatCache[c]=m;return m;
}
function clothToon(col){return toonMat(col);}
function hairToon(col,ei){return toonMat(col,ei===undefined?.06:ei);}
// 描边（倒壳法）：沿法线放大后只渲染背面 → 二次元勾线
const _outlineMat=new THREE.MeshBasicMaterial({color:0x1d1026,side:THREE.BackSide});
function markNoOutline(root){root.traverse(o=>{if(o.isMesh)o.userData.noOutline=true;});}
// v54：描边改为「世界尺度等宽」—— 按部件包围球半径反算缩放比，
// 让粗大头（Q 版头身比 1:5）与细手指的线宽一致。旧版统一 ×(1+thick) 会让头部线宽爆粗、
// 并在眼球/五官等小件上形成"熊猫眼"黑圈。
function addOutline(root,thick,col,smin,denyList){
  thick=thick||.052;smin=smin===undefined?.085:smin;
  const deny=denyList||null;
  const list=[];root.traverse(o=>{
    if(!o.isMesh||o.userData.noOutline)return;
    if(deny){for(const d of deny)if(o===d)return;}
    const m=o.material;if(!m||m.transparent||m.isSprite)return;
    const geo=o.geometry;if(!geo||!geo.attributes||!geo.attributes.position)return;
    let bad=false;for(let p=o;p;p=p.parent)if(p.userData&&p.userData.noOutline)bad=true;
    if(bad)return;
    if(!geo.boundingSphere)geo.computeBoundingSphere();
    if(!geo.boundingSphere||geo.boundingSphere.radius<smin)return;
    list.push(o);});
  const mats={};const k=thick.toFixed(4);
  for(const m of list){
    const key=(col===undefined?'def':String(col))+'_'+k;
    const om=mats[key]||(mats[key]=col===undefined?_outlineMat:new THREE.MeshBasicMaterial({color:col,side:THREE.BackSide}));
    const o=new THREE.Mesh(m.geometry,om);
    // v54：等宽线 —— r 为包围球半径，目标线宽 thick（世界单位），缩放比 = 1 + thick/r
    const r=Math.max(.001,m.geometry.boundingSphere.radius);
    const f=1+thick/r;
    o.position.copy(m.position);o.quaternion.copy(m.quaternion);
    o.scale.copy(m.scale).multiplyScalar(f);
    o.userData.isOutline=true;o.userData.noOutline=true;o.castShadow=false;o.renderOrder=-1;
    m.parent.add(o);
  }
  return list.length;}
// ---------- v30：动漫头部（旋转台塑形：颅顶饱满 → 颧骨 → 下颌收束 → 尖下巴） ----------
const HEAD_PROF=[[.001,.395],[.12,.388],[.23,.362],[.31,.312],[.358,.245],[.378,.16],[.382,.07],
  [.368,-.01],[.340,-.09],[.295,-.16],[.225,-.215],[.135,-.248],[.001,-.262]];
const HEAD_SX=.94,HEAD_SZ=.99;
function headR(y){const P=HEAD_PROF;
  if(y>=P[0][1])return P[0][0];
  if(y<=P[P.length-1][1])return P[P.length-1][0];
  for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1];
    if(y<=a[1]&&y>=b[1]){const t=(a[1]-y)/((a[1]-b[1])||1);return a[0]+(b[0]-a[0])*t;}}
  return P[0][0];}
// 面部表面 z 坐标（用于把五官精确贴在头壳上，杜绝"浮在脸外"或"埋进头里"）
function faceSurface(x,y){const r=headR(y),xr=x/HEAD_SX,ins=r*r-xr*xr;
  return ins<=0?.012:Math.sqrt(ins)*HEAD_SZ;}
function headGeo(){return gc('head30',()=>{
  // 注意：LatheGeometry 轮廓必须自下而上（y 递增），否则法线朝内、脸皮被背面剔除
  const prof=HEAD_PROF.slice().reverse().map(p=>new THREE.Vector2(Math.max(.001,p[0]),p[1]));
  const g=new THREE.LatheGeometry(prof,24);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(y<-.05){x*=Math.max(.72,1+(y+.05)*.55);}   // 下颌/下巴横向收窄 → 瓜子脸
    if(z>0)z*=1.01;else z*=1.07;                  // 前脸略饱满、后脑略鼓
    p.setXYZ(i,x,y,z);}
  p.needsUpdate=true;g.computeVertexNormals();return g;});}
// ---------- 表情骨架（可驱动的五官：眉 / 眼睑 / 瞳孔 / 嘴 / 腮红 / 泪） ----------
// 数值含义：bz=眉倾角(>0 内高外低=难过，<0=愤怒) by=眉升降 lid=眼睑开合 iris=瞳孔缩放
// m=嘴型 open=张口度 mw=嘴宽 blush=腮红 tear=泪 hx=低头角度
const EXPR={
 neutral :{bz:0,   by:0,    lid:1,   iris:1,   m:'flat',   open:0,   mw:1,   blush:0,  tear:0},
 smile   :{bz:.10, by:-.005,lid:.92, iris:1,   m:'smile',  open:.06, mw:1.05,blush:.42,tear:0},
 happy   :{bz:.18, by:-.010,lid:.52, iris:1,   m:'smile',  open:.8,  mw:1.16,blush:.55,tear:0},
 laugh   :{bz:.20, by:-.012,lid:.22, iris:1,   m:'laugh',  open:1.1, mw:1.2, blush:.6, tear:.15},
 shy     :{bz:.15, by:-.010,lid:.78, iris:1.12,m:'small',  open:.13, mw:.8,  blush:1,  tear:0, hx:.04},
 angry   :{bz:-.44,by:.018, lid:.6,  iris:.9,  m:'frown',  open:.2,  mw:1.1, blush:0,  tear:0, hx:.06},
 sad     :{bz:.36, by:-.016,lid:.95, iris:1.02,m:'frown',  open:0,   mw:.94, blush:.25,tear:0, hx:-.05},
 cry     :{bz:.42, by:-.018,lid:1.05,iris:1.06,m:'openSad',open:.85, mw:1,   blush:.2, tear:1, hx:.06},
 worry   :{bz:.30, by:-.012,lid:.9,  iris:.96, m:'frown',  open:.08, mw:.9,  blush:.15,tear:0},
 surprise:{bz:.02, by:-.024,lid:1.32,iris:1.18,m:'o',      open:.9,  mw:.85, blush:.2, tear:0},
 hurt    :{bz:-.28,by:.014, lid:.28, iris:.85, m:'wince',  open:.5,  mw:1.15,blush:0,  tear:0, hx:.09},
 cool    :{bz:-.18,by:.012, lid:.66, iris:.9,  m:'smirk',  open:0,   mw:1,   blush:0,  tear:0},
 love    :{bz:.13, by:-.012,lid:.7,  iris:1.28,m:'smile',  open:.32, mw:1.1, blush:.95,tear:0},
 shout   :{bz:-.36,by:.020, lid:.72, iris:1,   m:'o',      open:1.3, mw:1.15,blush:.1, tear:0, hx:.05},
 dead    :{bz:.18, by:0,    lid:1.25,iris:.15, m:'o',      open:.6,  mw:.8,  blush:0,  tear:0},
};
function exLerp(a,b,k){return a+(b-a)*k;}
const _blushTex=gc('blushTex',()=>{const c=document.createElement('canvas');c.width=c.height=64;const g2=c.getContext('2d');
  const rg=g2.createRadialGradient(32,32,2,32,32,30);
  rg.addColorStop(0,'rgba(255,118,148,.9)');rg.addColorStop(.55,'rgba(255,105,138,.34)');rg.addColorStop(1,'rgba(255,95,130,0)');
  g2.fillStyle=rg;g2.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);});
const FACES=[]; // 全局表情注册表（主循环统一驱动）
/* v65:环境AI资源（真实感树木/街具，webp alpha） */
const ENV2=window.__ZA__&&window.__ZA__.ENV2?window.__ZA__.ENV2:{};const TREES=[]; // 树木注册表（随风摇曳）
/* v65.1：AI 真实感道具 —— ENV2 资源 → 单面立片 + yaw 朝向相机，
   保证玩家从任意水平角度看都是正面（不像十字片那样斜看会变薄） */
const _env2Cache={},ENV2_PROPS=[];
function envTex(id){
  if(_env2Cache[id])return _env2Cache[id];
  const d=ENV2[id];if(!d)return null;
  const t=new THREE.TextureLoader().load('data:image/webp;base64,'+d.t);
  t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;
  t.encoding=THREE.sRGBEncoding;_env2Cache[id]=t;return t;}
function envProp(id,h,opts){
  const d=ENV2&&ENV2[id];
  if(!d)return null;
  opts=opts||{};
  const ar=d.ar||1;
  const W=opts.width?opts.width:h*ar;   // 也可按「宽度」定尺寸（扁平道具如花坛用这个更直观）
  const H=opts.width?(W/ar):h;
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.PlaneGeometry(W,H),
    new THREE.MeshBasicMaterial({map:envTex(id),transparent:true,depthWrite:true,
      side:THREE.DoubleSide,alphaTest:.35}));
  m.position.y=H/2;m.userData.noOutline=true;m.renderOrder=2;m.castShadow=false;
  g.add(m);
  const r=opts.shadow===false?0:Math.max(.35,W*.55);
  if(r)g.add(blobShadow(r));
  g.rotation.y=opts.rot||0;
  g.userData.bb=m;ENV2_PROPS.push(g);
  return g;}
const _envV=new THREE.Vector3(),_envQ=new THREE.Quaternion(),_envE=new THREE.Euler();
// v66：街头增设女主 NPC —— 提高城里女性密度（复用约会系统的 8 位女主立绘，
// 保证「街头看到的人」和「可攻略的她」是同一张脸）
const STREET_GIRLS=[];let _streetGirlsDone=false;
const _SG_SPOTS=[[-5.5,-6.5],[5.8,-5.2],[-5.8,5.6],[7.2,9.0],
                 [-9.5,-2.5],[10.5,2.5],[-2.5,11.5],[2.5,-13.5]];
// 每帧只创建一位：一次性创建 8 人会在开局把 24 张贴图同时上传 GPU，
// 造成 ~60ms 的掉帧尖峰（移动端更明显），摊到 8 帧就消掉了
function spawnStreetGirls(){
  if(_streetGirlsDone)return;
  const i=STREET_GIRLS.length;
  if(i>=_SG_SPOTS.length){_streetGirlsDone=true;return;}
  try{
    const mid=DH2_MAP&&DH2_MAP['g'+(i%8+1)];
    const inst=mid?mkFullHuman(mid,{height:1.60+(i%3)*0.035}):null;
    if(inst&&inst.torso&&inst.g){
      inst.g.position.set(_SG_SPOTS[i][0],0,_SG_SPOTS[i][1]);
      scene.add(inst.g);
      STREET_GIRLS.push({inst:inst,cx:_SG_SPOTS[i][0],cz:_SG_SPOTS[i][1],
        r:1.15+Math.random()*1.05,sp:.26+Math.random()*.20,
        ph:Math.random()*6.283,dir:Math.random()<.5?1:-1});
      return;}
  }catch(e){}
  // 该位创建失败也要推进游标，避免死循环
  STREET_GIRLS.push(null);
  if(STREET_GIRLS.length>=_SG_SPOTS.length)_streetGirlsDone=true;}
function tickStreetGirls(t){
  // 沿小圈踱步 —— dh2Tick 会检测到位移自动播放摆腿/起伏/呼吸
  for(const s of STREET_GIRLS){
    if(!s)continue;
    const a=s.ph+t*s.sp*s.dir;
    s.inst.g.position.set(s.cx+Math.cos(a)*s.r,0,s.cz+Math.sin(a)*s.r);}}
function envTickBillboard(){   // 自持临时变量，避免依赖后置声明引发 TDZ
  if(!ENV2_PROPS.length)return;
  for(const p of ENV2_PROPS){
    if(!p.parent||!p.userData.bb)continue;
    p.getWorldPosition(_envV);p.getWorldQuaternion(_envQ);
    _envE.setFromQuaternion(_envQ,'YXZ');
    const yaw=Math.atan2(camera.position.x-_envV.x,camera.position.z-_envV.z)-_envE.y;
    p.userData.bb.rotation.y=yaw;}}
function faceRig(o){
  o=o||{};const det=o.det===undefined?2:o.det;
  const skin=o.skin||skinMat();
  const rig={group:new THREE.Group(),parts:{},cur:Object.assign({},EXPR.neutral),tgt:EXPR.neutral,
    blinkT:0,blinkCd:1.2+Math.random()*3,det:det,speak:0};
  const whiteM=new THREE.MeshStandardMaterial({color:0xf7f9ff,roughness:.22,metalness:0});
  const irisC=o.iris===undefined?0x3a2440:o.iris;
  const irisM=new THREE.MeshStandardMaterial({color:irisC,roughness:.16,metalness:.16,emissive:irisC,emissiveIntensity:.18});
  const darkM=new THREE.MeshBasicMaterial({color:0x140d1a});
  const hiM=new THREE.MeshBasicMaterial({color:0xffffff});
  const lipM=new THREE.MeshStandardMaterial({color:o.lip===undefined?0xc4526a:o.lip,roughness:.38});
  const mouthM=new THREE.MeshBasicMaterial({color:0x3a1420});
  const tongueM=new THREE.MeshStandardMaterial({color:0xd4506a,roughness:.5});
  const teethM=new THREE.MeshStandardMaterial({color:0xfbf7f2,roughness:.26});
  const browM=new THREE.MeshStandardMaterial({color:o.brow===undefined?0x2a1c26:o.brow,roughness:.5});
  const tearM=new THREE.MeshStandardMaterial({color:0x9fd4ff,roughness:.05,metalness:.1,transparent:true,opacity:0});
  const blushM=()=>new THREE.MeshBasicMaterial({map:_blushTex,transparent:true,opacity:0,depthWrite:false});
  // —— v30 动漫大眼：眼白椭球 + 大虹膜 + 双高光 + 粗睫毛 + 外眼角睫毛 ——
  const eyeX=.126,eyeY=-.030;
  const eyeZ=faceSurface(eyeX,eyeY)-.030;
  for(const s of[-1,1]){
    const key=s<0?'L':'R';const eg=new THREE.Group();
    if(det<=0){ // 低细节：单球眼（远景小怪）
      const e=new THREE.Mesh(sph(.05,8,6),darkM);e.scale.set(1,1.2,.45);eg.add(e);
    }else{
      const ball=new THREE.Mesh(sph(.082,18,14),whiteM);ball.scale.set(.95,1.20,.45);eg.add(ball);
      const iris=new THREE.Mesh(gc('iri30',()=>new THREE.CircleGeometry(.057,20)),irisM);
      iris.position.set(-s*.008,.005,.0345);iris.scale.set(.98,.94,1);eg.add(iris); // v54：虹膜向鼻侧内收，防外斜视
      const pupil=new THREE.Mesh(gc('pup30',()=>new THREE.CircleGeometry(.0235,16)),darkM);
      pupil.position.set(-s*.008,.005,.0365);pupil.scale.set(.92,1,1);eg.add(pupil);
      if(det>=2){
        // 高光：左上一大一小 + 右下反光（动漫眼标志）
        const h1=new THREE.Mesh(gc('hi30',()=>new THREE.CircleGeometry(.0175,12)),hiM);
        h1.position.set(-.020,.030,.0385);eg.add(h1);
        const h2=new THREE.Mesh(gc('hi31',()=>new THREE.CircleGeometry(.0078,10)),hiM);
        h2.position.set(.023,-.026,.0385);eg.add(h2);
        // v54：萌系眼关键件 —— 虹膜下缘「反光环」+ 星芒高光 + 下眼睑水光
        //        这三件是《王者之心2》这类 Q 版立绘眼睛看起来「有神/会发光」的核心手法
        const glow=new THREE.Mesh(gc('iriglow54',()=>new THREE.RingGeometry(.030,.050,16,1,Math.PI*1.12,Math.PI*.76)),
          new THREE.MeshBasicMaterial({color:0xbfe8ff,transparent:true,opacity:.55,depthWrite:false}));
        glow.position.set(0,.004,.0378);eg.add(glow);
        // 星芒（四角小十字，主高光侧上方）
        const star=new THREE.Group();star.position.set(-.021,.031,.0392);eg.add(star);
        for(const rot of[0,Math.PI*.5]){
          const ray=new THREE.Mesh(gc('starRay54',()=>new THREE.CircleGeometry(.0135,4)),hiM);
          ray.scale.set(1,.20,1);ray.rotation.z=rot;star.add(ray);
        }
        rig.parts['eyeStar'+key]=star;
        // 下眼睑水光（细弧，眨眼时随眼睑压扁）
        const wet=new THREE.Mesh(gc('wet54',()=>new THREE.TorusGeometry(.060,.0055,4,14,Math.PI*.62)),hiM);
        wet.position.set(0,-.028,.0355);wet.rotation.z=Math.PI*1.19;
        rig.parts['wet'+key]=wet;eg.add(wet);
        // 上睫毛：粗弧线（外眼角上扬）
        const arc=Math.PI*1.02;
        const lash=new THREE.Mesh(gc('lash30',()=>new THREE.TorusGeometry(.074,.014,5,20,arc)),darkM);
        lash.position.set(0,.014,.030);lash.rotation.z=Math.PI*.5-arc*.5-s*.16;eg.add(lash);
        // 外眼角睫毛（一小撮翘起）
        const cl=new THREE.Mesh(gc('clash30',()=>new THREE.ConeGeometry(.018,.078,4)),darkM);
        cl.position.set(.086*s,.030,.026);cl.rotation.z=-s*Math.PI*.5;cl.rotation.y=.25*s;
        cl.scale.set(1,1,.55);eg.add(cl);
      }
      rig.parts['iris'+key]=iris;rig.parts['pupil'+key]=pupil;
    }
    eg.position.set(eyeX*s,eyeY,eyeZ);eg.rotation.y=-s*.10; // v54：眼组侧转 .22→.10（大头部下 .22 会造成外斜视）
    eg.userData.eyeY=eyeY;
    rig.parts['eye'+key]=eg;rig.group.add(eg);
    if(det>=1){ // 眉毛（细长弧，贴头皮面）
      const bg=new THREE.Group();
      const bt=gc('browArc30',()=>{const t2=new THREE.TorusGeometry(.052,.0092,5,14,Math.PI*.74);
        t2.rotateZ(Math.PI*.5-Math.PI*.37);return t2;});
      bg.add(new THREE.Mesh(bt,browM));
      bg.position.set(.128*s,.100,faceSurface(.128,.100)-.010);bg.rotation.z=-.08*s;
      bg.userData.baseRot=-.08*s;
      rig.parts['brow'+key]=bg;rig.group.add(bg);
    }
    if(det>=2){ // 腮红 + 泪滴
      const bl=new THREE.Mesh(pgeo(.15,.088),blushM());
      bl.position.set(.176*s,-.082,faceSurface(.176,-.082)-.004);
      bl.rotation.y=-s*.66;rig.parts['blush'+key]=bl;rig.group.add(bl);
      const te=new THREE.Mesh(sph(.021,8,8),tearM.clone());te.scale.set(.85,1.5,.85);
      te.position.set(.140*s,-.086,faceSurface(.140,-.086)-.012);
      rig.parts['tear'+key]=te;rig.group.add(te);
    }
  }
  // 鼻（动漫小鼻头）
  if(det>=1){const nose=new THREE.Mesh(sph(.027,10,8),skin);nose.scale.set(.66,.72,.92);
    nose.position.set(0,-.062,faceSurface(0,-.062)-.004);rig.group.add(nose);}
  // 嘴（唇弧 + 口腔 + 舌 + 齿）
  const mouth=new THREE.Group();mouth.position.set(0,-.150,faceSurface(0,-.150)-.006);rig.group.add(mouth);
  const curveGeo=gc('mcurve30',()=>{const t2=new THREE.TorusGeometry(.044,.0105,6,16,Math.PI*.86);
    t2.rotateZ(-Math.PI*.5-Math.PI*.43);return t2;});
  const curve=new THREE.Mesh(curveGeo,lipM);mouth.add(curve);
  const openM=new THREE.Mesh(sph(.045,14,10),mouthM);openM.scale.set(1,.85,.35);openM.position.y=-.012;mouth.add(openM);
  const tongue=new THREE.Mesh(sph(.030,10,8),tongueM);tongue.scale.set(1,.32,.5);mouth.add(tongue);
  const teeth=new THREE.Mesh(bx(.058,.012,.012),teethM);mouth.add(teeth);
  rig.parts.mouth=mouth;rig.parts.curve=curve;rig.parts.openM=openM;
  rig.parts.tongue=tongue;rig.parts.teeth=teeth;
  markNoOutline(rig.group); // 五官不参与描边（描边只勾轮廓：头/发/身/四肢）
  return rig;}
function applyFace(rig,dt){
  const c=rig.cur,t=rig.tgt,k=Math.min(1,dt*8);
  c.bz=exLerp(c.bz,t.bz,k);c.by=exLerp(c.by,t.by,k);c.lid=exLerp(c.lid,t.lid,k);
  c.iris=exLerp(c.iris,t.iris,k);c.open=exLerp(c.open,t.open,k);c.mw=exLerp(c.mw,t.mw,k);
  c.blush=exLerp(c.blush,t.blush,k);c.tear=exLerp(c.tear,t.tear,k);
  c.hx=exLerp(c.hx||0,t.hx||0,k);
  if(c.m!==t.m&&Math.abs(c.open-(t.open))<.02)c.m=t.m; // 嘴型切换（避免中途跳变）
  // 眨眼
  rig.blinkCd-=dt;
  if(rig.blinkCd<=0){rig.blinkT=.19;rig.blinkCd=1.8+Math.random()*3.6;}
  let blinkAmt=0;
  if(rig.blinkT>0){rig.blinkT-=dt;blinkAmt=Math.sin(Math.PI*Math.max(0,rig.blinkT)/.19);}
  const openAmt=Math.max(c.open,rig.speak);
  const lidK=Math.max(.05,c.lid*(1-blinkAmt*.93));
  for(const key of['L','R']){
    const eg=rig.parts['eye'+key];if(!eg)continue;
    eg.scale.set(1,lidK,1);
    if(rig.parts['iris'+key]){rig.parts['iris'+key].scale.setScalar(Math.max(.3,c.iris));
      rig.parts['pupil'+key].scale.setScalar(Math.max(.3,c.iris));}
    if(rig.parts['blush'+key])rig.parts['blush'+key].material.opacity=Math.max(0,c.blush)*.85;
    if(rig.parts['tear'+key]){const te=rig.parts['tear'+key];
      te.material.opacity=Math.max(0,c.tear)*.9;
      te.position.y=-.072-Math.max(0,c.tear)*.075*(0.5+0.5*Math.sin(rig.blinkCd*3));}
  }
  if(rig.parts.browL){const b0=rig.parts.browL.userData.baseRot||-.08,b1=rig.parts.browR.userData.baseRot||.08;
    rig.parts.browL.rotation.z=b0+c.bz;rig.parts.browR.rotation.z=b1-c.bz;}
  if(rig.parts.browL){rig.parts.browL.position.y=rig.parts.browR.position.y=.100+c.by;}
  const m=c.m,curve=rig.parts.curve,o=rig.parts.openM,tn=rig.parts.tongue,th=rig.parts.teeth;
  const showCurve=(m!=='o'&&m!=='laugh');
  curve.visible=showCurve;
  if(showCurve){
    const smile=(m==='smile'||m==='small'||m==='smirk'||m==='flat');
    curve.rotation.z=smile?0:Math.PI;
    curve.rotation.y=m==='smirk'?.32:0;
    const sc=m==='small'?.6:m==='flat'?.45:m==='wince'?1.12:1;
    curve.scale.set(Math.max(.4,c.mw)*sc,sc,1);
  }
  const showOpen=openAmt>.05;
  o.visible=showOpen;
  if(showOpen){
    const round=(m==='o'),wide=(m==='laugh');
    const w=(round?.5:(wide?1.15:1))*Math.max(.5,c.mw);
    const hh=round?1.25:(wide?.95:.8);
    o.scale.set(w*(1+openAmt*.22),hh*(0.55+openAmt*.5),.35);
    o.position.y=round?-.004:(wide?-.022:-.012);
    th.visible=!round&&openAmt>.45;th.position.y=round?.02:.024;
    tn.visible=openAmt>.62;tn.position.y=round?-.03:-.042;
  }else{th.visible=false;tn.visible=false;}
  if(rig.head)rig.head.rotation.x=c.hx;
}
let _facePrune=0;
function faceTick(dt){
  _facePrune+=dt;const doPrune=_facePrune>1.5;if(doPrune)_facePrune=0;
  for(let i=FACES.length-1;i>=0;i--){const r=FACES[i];
    if(doPrune&&r.owner&&!r.owner.parent){FACES.splice(i,1);continue;}
    applyFace(r,dt);}
}
function setExpr(rig,name){if(!rig)return;const e=EXPR[name];if(e&&rig.tgt!==e)rig.tgt=e;}
// 树木随风摇曳（冠层呼吸 + 主干微摆）
function treeTick(t){
  for(let i=0;i<TREES.length;i++){const tr=TREES[i];
    tr.rotation.z=Math.sin(t*.55+tr.userData.ph)*.013;
    tr.rotation.x=Math.sin(t*.42+tr.userData.ph*1.7)*.010;
    if(tr.userData.leaf){
      // v51：冠层呼吸 + 叶片抖动（幅度比 v29 大，枝叶才有"活"的感觉）
      const ph2=tr.userData.ph;
      const k=1+Math.sin(t*1.3+ph2)*.026;
      tr.userData.leaf.scale.set(k,1+Math.sin(t*1.05+ph2)*.018,k);
      // 阵风正弦叠加：慢风 + 快抖，避免机械同步摆动
      tr.userData.leaf.rotation.z=Math.sin(t*.85+ph2)*.030+Math.sin(t*2.6+ph2*1.9)*.011;
      tr.userData.leaf.rotation.x=Math.cos(t*.72+ph2*1.4)*.024;
    }
    // v65.1：AI 真实感树（十字立片）此前只注册不摇曳，这里补上与程序化树一致的慢风摆 +
    // 冠层（整体）呼吸缩放，避免全场只有老树在动显得割裂
    if(tr.userData.aiTree){
      const ph3=tr.userData.ph,s2=tr.userData.s||1;
      const k=1+Math.sin(t*1.05+ph3)*.016;
      tr.scale.set(k,1+Math.sin(t*.8+ph3)*.012,k);
      tr.rotation.z+=Math.sin(t*.75+ph3*1.4)*.016*s2;
      tr.rotation.x+=Math.cos(t*.6+ph3*1.1)*.012*s2;
    }}}
// ---------- 人体构造器（骨架化四肢 + 细节档位 det 0/1/2） ----------
// cfg:{skin,top,bottom,trim,hair,iris,ribbon,lip,brow,armCol,female,det,bulk,scale,style}
function mkFigure(cfg){
  cfg=cfg||{};
  const det=cfg.det===undefined?2:cfg.det;
  const bulk=cfg.bulk===undefined?1:cfg.bulk;
  const female=!!cfg.female;
  const scale=cfg.scale===undefined?1:cfg.scale;
  const style=cfg.style||(female?'long':'short');
  const G=new THREE.Group(),mats=[];
  const skinM=skinToon(cfg.skin);
  const mTop=clothToon(cfg.top===undefined?0x3a1a4a:cfg.top);
  const mBot=clothToon(cfg.bottom===undefined?0x241428:cfg.bottom);
  const mTrim=clothToon(cfg.trim===undefined?0xffd60a:cfg.trim);
  const mHair=hairToon(cfg.hair===undefined?0x1a1024:cfg.hair);
  const mShoe=clothToon(cfg.shoe===undefined?0x1a141f:cfg.shoe);
  const armSrc=cfg.armCol==='bottom'?mBot:cfg.armCol==='skin'?skinM:
    (cfg.armCol==='top'?mTop:(cfg.armCol!==undefined?clothToon(cfg.armCol):(female?skinM:mTop)));
  mats.push(mTop,mBot,mTrim,mHair,skinM,mShoe);
  const add=(p,mesh,cast)=>{mesh.castShadow=cast!==false;p.add(mesh);return mesh;};
  const mat=m=>{mats.push(m);return m;};
  // —— 躯干：旋转台轮廓（胯 → 腰 → 胸 → 肩 → 颈） ——
  // v62：写实成人比例 —— 躯干拉长 + 肩宽腰细，配合缩小的头，达成 7 头身真人比例
  const maleProf=[[.001,-.10],[.215,-.07],[.305,-.02],[.352*bulk,.04],[.318,.15],[.262,.30],[.302,.44],
    [.360,.58],[.418,.70],[.472,.79],[.412,.875],[.248,.935],[.240,.99],[.001,1.012]];
  // v62：女主 S 曲线保留，躯干同步拉长（腰线抬高、胯宽略收，更像真人而非 Q 版）
  const femProf=[[.001,-.10],[.218,-.07],[.312,-.02],[.362,.04],[.316,.15],[.212,.30],[.232,.44],
    [.278,.57],[.288,.68],[.268,.79],[.196,.87],[.174,.925],[.001,.945]];
  const prof=(female?femProf:maleProf).map(p=>[p[0]*bulk,p[1]]);
  const torso=new THREE.Group();torso.position.y=1.02;G.add(torso);
  const torsoMesh=add(torso,new THREE.Mesh(lathe(prof,22),mTop));torsoMesh.receiveShadow=true;
  if(female)for(const s of[-1,1]){const b=add(torso,new THREE.Mesh(sph(.088*bulk,14,10),mTop));
    b.scale.set(1,.94,.76);b.position.set(.102*bulk*s,.60,.082);}
  const belt=add(torso,new THREE.Mesh(torus((female?.288:.325)*bulk,.030*bulk,6,22),mTrim),false);
  belt.rotation.x=Math.PI/2;belt.position.y=.20;
  const neck=add(torso,new THREE.Mesh(cyl(.080*bulk,.112*bulk,.30,14),skinM));neck.position.y=.955;
  // v62：写实锁骨 —— 两侧各一条斜向圆柱，形成颈窝到肩头的骨感折线
  if(det>=2){
    for(const s of[-1,1]){
      const cl=add(torso,new THREE.Mesh(capsule(.028,.22,8,3),skinM),false);
      cl.position.set(.115*s,.905,.075);cl.rotation.z=(Math.PI*.5-.30)*s;cl.rotation.x=-.22;
      cl.scale.set(1,1,.72);
    }
  }
  // v50：颈窝阴影 + 喉结，强化男性颈部结构
  if(det>=2&&!female){
    const notch=add(torso,new THREE.Mesh(sph(.07,10,8),new THREE.MeshBasicMaterial({color:0x6d4634,transparent:true,opacity:.28,depthWrite:false})),false);
    notch.scale.set(1.5,.5,.6);notch.position.set(0,.735,.082);
    const adam=add(torso,new THREE.Mesh(sph(.034,8,6),skinM),false);
    adam.scale.set(1,1.35,.8);adam.position.set(0,.795,.088);
  }
  if(det>=2&&!female){ // 立领
    const col=add(torso,new THREE.Mesh(cyl(.158*bulk,.190*bulk,.15,14),mTrim),false);
    col.position.y=.90;
  }
  // v62：斜方肌 + 三角肌球 —— 位置随拉长的躯干上移
  if(det>=2&&!female){
    for(const s of[-1,1]){
      const trp=add(torso,new THREE.Mesh(sph(.180,12,9),mTop),false);
      trp.scale.set(1.05,.5,.82);trp.position.set(.242*s,.755,-.01);trp.rotation.z=-.30*s;
      const delt=add(torso,new THREE.Mesh(sph(.138,12,10),mTop),false);
      delt.scale.set(1,.94,.92);delt.position.set(.405*bulk*s,.705,-.005);
    }
  }
  // v62：胸肌 / 腹肌块 —— 随躯干拉长同步上移、间距放大
  if(det>=2&&!female){
    for(const s of[-1,1]){ // 胸肌
      const pec=add(torso,new THREE.Mesh(sph(.158,12,10),mTop),false);
      pec.scale.set(1,.72,.60);pec.position.set(.138*bulk*s,.545,.148);
    }
    const sternum=add(torso,new THREE.Mesh(bx(.030,.40,.05),mTop),false);
    sternum.position.set(0,.50,.188);sternum.rotation.x=.06;
    for(const s of[-1,1]){ // 腹肌
      for(let r2=0;r2<3;r2++){const ab=add(torso,new THREE.Mesh(sph(.076,10,8),mTop),false);
        ab.scale.set(1,.70,.50);ab.position.set(.070*s,.30-r2*.115,.150-r2*.010);}
    }
  }
  // —— 头部（v62：写实头身比 —— 头缩小到真人比例，颈部上移对齐拉长后的躯干） ——
  const head=new THREE.Group();head.position.y=1.30;torso.add(head);
  const skull=add(head,new THREE.Mesh(headGeo(),skinM));skull.scale.set(HEAD_SX,1,HEAD_SZ);
  // v62：真人 7 头身 —— 头部缩到 0.80（女）/0.84（男），顶点上移到颈根 .99 之上。
  // 总身高约 1.98（含腿），头高约 .60 → 约 6.9 头身，接近真人。
  const headAmp=cfg.headAmp===undefined?(female?.80:.84):cfg.headAmp;
  head.scale.setScalar(headAmp);
  head.position.y=1.30;
  head.userData.qHead=true;
  // v50：下颌线强化（半椭圆壳贴在下颌前沿，让侧脸有折角而不是鹅蛋）
  if(det>=2&&!female){
    const jaw=add(head,new THREE.Mesh(sphSeg(.322,20,12,0,Math.PI*2,Math.PI*.47,Math.PI*.60),skinM),false);
    jaw.scale.set(HEAD_SX*1.015,.96,HEAD_SZ*1.02);jaw.position.y=-.012;
  }
  if(det>=1)for(const s of[-1,1]){const ear=add(head,new THREE.Mesh(sph(.052,10,8),skinM),false);
    ear.scale.set(.38,1.05,.82);ear.position.set(.332*s,-.010,faceSurface(.332,-.010)-.030);}
  // v53：女主耳环（金环+坠珠，参考图同款气质件）
  if(det>=2&&female){
    const earringM=mat(metalMat(cfg.earring===undefined?0xffd27a:cfg.earring,.3,.9));
    for(const s of[-1,1]){
      const er=new THREE.Group();er.position.set(.338*s,-.062,faceSurface(.332,-.010)-.022);
      const ring=new THREE.Mesh(torus(.030,.007,5,14),earringM);ring.rotation.y=Math.PI*.5;er.add(ring);
      const bead=new THREE.Mesh(sph(.016,8,6),earringM);bead.position.y=-.044;er.add(bead);
      head.add(er);
    }
  }
  // 颈部阴影（动漫常用：下巴投影）
  if(det>=2){const sh=new THREE.Mesh(sph(.20,14,10),new THREE.MeshBasicMaterial({color:0x9a6b52,transparent:true,opacity:.16,depthWrite:false}));
    sh.scale.set(1,.42,.9);sh.position.set(0,-.235,.05);head.add(sh);}
  const face=faceRig({skin:skinM,iris:cfg.iris,lip:cfg.lip,brow:cfg.brow,det:det});
  face.head=head;face.owner=G;head.add(face.group);FACES.push(face);
  // v53：女主美颜层 —— 常驻淡腮红 + 眼尾上挑睫毛 + 卧蚕高光
  if(female&&det>=2){
    for(const s of[-1,1]){
      const bl2=new THREE.Mesh(pgeo(.155,.090),(()=>{const m=new THREE.MeshBasicMaterial({
        map:_blushTex,transparent:true,opacity:.34,depthWrite:false});mats.push(m);return m;})());
      bl2.position.set(.180*s,-.078,faceSurface(.180,-.078)-.003);
      bl2.rotation.y=-s*.62;face.group.add(bl2);
      // 卧蚕（眼下一条细高光，显幼态温柔）
      const aeg=new THREE.Mesh(pgeo(.085,.022),(()=>{const m=new THREE.MeshBasicMaterial({
        color:0xffffff,transparent:true,opacity:.30,depthWrite:false});mats.push(m);return m;})());
      aeg.position.set(.126*s,.032,faceSurface(.126,.032)-.002);
      aeg.rotation.y=-s*.24;face.group.add(aeg);
    }
    // 红唇更饱满（覆盖默认唇弧：加一层唇峰体）
    const lipGloss=new THREE.Mesh(sph(.040,12,8),(()=>{const m=new THREE.MeshStandardMaterial({
      color:cfg.lip===undefined?0xd14a5e:cfg.lip,roughness:.22});mats.push(m);return m;})());
    lipGloss.scale.set(1.15,.62,.42);lipGloss.position.set(0,-.148,faceSurface(0,-.148)+.002);
    face.group.add(lipGloss);
  }
  // —— 头发（v55：分束发片系统 —— 告别"泳帽感"）——
  // 设计：不再用整块球壳，而是几十片"发束卡"沿头壳排布、各带独立朝向/长度/扭转，
  // 层层叠压出体积与层次（商业 Q 版角色与 AI 生成模型的标准做法）。
  const hairG=new THREE.Group();head.add(hairG);const sway=[];
  // 底层：紧贴头壳的薄底衬（只用于堵住发束间的缝，故意做小一号不外露）
  const cap=add(hairG,new THREE.Mesh(sphCap(.405,20,14,Math.PI*.44),mHair),false);
  cap.scale.set(.955,1.005,.985);
  // 发束卡几何：上宽下窄的扁胶囊状薄片（ry 长度可调）
  const strandGeo=(len,w0,w1)=>{
    const k='strand'+len.toFixed(3)+'_'+w0.toFixed(3)+'_'+w1.toFixed(3);
    return gc(k,()=>{
      const g=new THREE.BufferGeometry();
      const seg=6,pos=[],idx=[],nor=[];
      for(let i=0;i<=seg;i++){
        const t=i/seg;
        const w=w0+(w1-w0)*t;
        const y=-len*t;
        // 叶片式微弯：沿 y 略向后收（发束贴头）
        const zc=.028*Math.sin(t*Math.PI)*t;
        pos.push(-w, y, zc,  w, y, zc);
        // 单面片法线朝前，靠 MeshToon 双面也能看，但用 DoubleSide 更省
        nor.push(0,0,1, 0,0,1);
      }
      for(let i=0;i<seg;i++){const a=i*2,b=a+1,c=a+2,d=a+3;
        idx.push(a,c,b, b,c,d);}
      g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
      g.setIndex(idx);
      return g;});
  };
  const mHairFlat=(()=>{const m=mHair.clone();m.side=THREE.DoubleSide;mats.push(m);return m;})();
  // —— 发束排布：按"头顶发旋 → 前额刘海 / 侧鬓 / 后脑"三条带分区投片 ——
  // 每条带给出 起始角、结束角、层数、每层片数、长度范围、倾斜，逐片抖动量取确定性伪随机
  const rnd=(i,n)=>{const v=Math.sin(i*12.9898+n*78.233)*43758.5453;return v-Math.floor(v);};
  const placeStrand=(ang,y,len,w0,w1,roll,pitch,tag)=>{
    // v55.2：直接按头壳轮廓函数定位 —— r = headR(y)+外扩量，保证发片永远贴壳不沉入
    const r=headR(y)+.014;
    const g2=strandGeo(len,w0,w1);
    const m=new THREE.Mesh(g2,mHairFlat);
    m.position.set(Math.sin(ang)*r, y, Math.cos(ang)*r);
    m.rotation.order='YXZ';
    m.rotation.y=ang;                 // 法线朝外
    m.rotation.x=pitch||0;            // 俯仰：正值=发梢向前贴脸/负值=向后贴脑
    m.rotation.z=roll||0;             // 沿头壳切向偏摆
    m.userData.strand=tag||'';
    hairG.add(m);return m;};
  // 1) 前额刘海带（两排）：外排长压眉、内排短填缝，均贴壳
  const fringeN=det>=2?(female?15:12):8;
  for(let i=0;i<fringeN;i++){
    const t=i/(fringeN-1), a=(t-.5)*2.55;
    const jitter=rnd(i,1);
    const len=(female?.34:.22)*(0.86+jitter*.30);
    const w0=(female?.105:.090), w1=.042;
    placeStrand(a,.205+jitter*.05,(female?len*(.86+.26*Math.abs(a)):len),
      w0,w1,(a*.30),(.34+jitter*.10),'fringe');
  }
  if(det>=2){
    const inN=8;
    for(let i=0;i<inN;i++){
      const t=i/(inN-1), a=(t-.5)*2.15, jitter=rnd(i,7);
      placeStrand(a,.285+jitter*.04,(female?.24:.16)*(0.85+jitter*.35),.075,.034,
        (a*.34),(.42),'fringeIn');
    }
  }
  // 2) 侧鬓带：太阳穴沿脸颊垂下
  for(const s of[-1,1]){
    const n2=det>=2?4:2;
    for(let i=0;i<n2;i++){
      const jitter=rnd(i,s+5);
      const ang=s*(1.20+i*.09+jitter*.05);
      const len=(female?.50:.26)*(0.90+jitter*.24);
      placeStrand(ang,.06-jitter*.03,len,.080,.036,
        (s*(.45+i*.08)),(.06),'side');
    }
  }
  // 3) 后脑覆盖带：长短两层铺满后半球
  const backN=det>=2?14:9;
  for(let i=0;i<backN;i++){
    const t=i/(backN-1), a=Math.PI+(t-.5)*3.0;
    const jitter=rnd(i,3);
    const len=(female?.36:.24)*(0.88+jitter*.28);
    placeStrand(a,.26-jitter*.06,len,.095,.044,(a*.12),(-.22-jitter*.10),'back');
  }
  if(det>=2){
    const backN2=12;
    for(let i=0;i<backN2;i++){
      const t=i/(backN2-1), a=Math.PI+(t-.5)*2.8, jitter=rnd(i,11);
      placeStrand(a,.12-jitter*.05,(female?.30:.20)*(0.85+jitter*.32),.088,.040,
        (a*.10),(-.30-jitter*.08),'back2');
    }
  }
  // 呆毛（头顶翘起一撮，Q 版灵魂件）
  if(det>=2){const aho=add(hairG,new THREE.Mesh(capsule(.030,.16,8,3),mHair),false);
    aho.position.set(.050,.425,-.040);aho.rotation.z=-.78;aho.rotation.x=-.30;aho.scale.set(1,1,.55);
    const aho2=add(hairG,new THREE.Mesh(cone(.026,.10,5),mHair),false);
    aho2.position.set(.078,.492,-.062);aho2.rotation.z=-1.02;aho2.rotation.x=-.28;aho2.scale.set(1,1,.5);}
  if(style==='long'){
    // 后长发：旋转台发mass + 5 束尖梢
    const back=new THREE.Group();back.position.set(0,.02,-.07);hairG.add(back);sway.push(back);
    // v53：女主长发加长到腰（-1.36→-1.62），更顺滑的直发轮廓
    back.add(new THREE.Mesh(lathe(female
      ?[[.001,.10],[.29,.05],[.38,-.20],[.40,-.60],[.385,-1.00],[.30,-1.34],[.185,-1.56],[.001,-1.66]]
      :[[.001,.10],[.29,.05],[.38,-.20],[.40,-.54],[.37,-.88],[.27,-1.16],[.10,-1.32],[.001,-1.36]],
      20,Math.PI*.47,Math.PI*1.06),mHair));
    const tipN=det>=2?5:3;
    for(let i=0;i<tipN;i++){const a=(i/(tipN-1)-.5)*1.5;
      const tp=add(back,new THREE.Mesh(cone(.095,female?.52:.44,5),mHair),false);
      tp.position.set(Math.sin(a)*.30,female?-1.50:-1.22,Math.cos(a)*.30-.05);
      tp.rotation.x=Math.PI+Math.sin(a)*.10;tp.scale.set(1,1,.62);}
    // 侧发/鬓发（长束收尖，随头摆动）
    for(const s of[-1,1]){
      const lock=new THREE.Group();lock.position.set(.352*s,.15,.02);hairG.add(lock);sway.push(lock);
      const lo=add(lock,new THREE.Mesh(capsule(.078,.60,10,4),mHair),false);lo.position.y=-.30;
      const tp=add(lock,new THREE.Mesh(cone(.075,.30,5),mHair),false);
      tp.position.y=-.72;tp.rotation.x=Math.PI;tp.scale.set(1,1,.62);
    }
    // v55：v53 的斜刘海胶囊束已由分束发片系统取代（原胶囊在头顶呈"贝雷帽"团块，移除）
  }else{
    // 后短发型：后脑三束翘起短尖
    const tipN=det>=2?4:3;
    for(let i=0;i<tipN;i++){const a=(i/(tipN-1)-.5)*1.7;
      const tp=add(hairG,new THREE.Mesh(cone(.085,.30,5),mHair),false);
      tp.position.set(Math.sin(a)*.38,.24,Math.cos(a)*.38-.08);
      tp.rotation.y=a;tp.rotation.x=-Math.PI*.5+.30;
      tp.scale.set(1,.9,.6);}
    if(style==='hero'){ // 发髻 + 发带结
      const bun=add(hairG,new THREE.Mesh(sph(.155,16,12),mHair),false);
      bun.scale.set(1,.92,1);bun.position.set(0,.40,-.10);
      for(let i=0;i<4;i++){const a=(i/3-.5)*1.5; // 发髻散出的尖梢
        const bs=add(hairG,new THREE.Mesh(cone(.05,.22,4),mHair),false);
        bs.position.set(Math.sin(a)*.12,.44,-.10+Math.cos(a)*.09);
        bs.rotation.z=Math.sin(a)*.7;bs.rotation.x=-.35;}
    }
  }
  // 发丝高光（动漫"天使环"）
  if(det>=2){
    const shade=gc('hairShine',()=>new THREE.TorusGeometry(.255,.030,5,18,Math.PI*.95));
    const sh2=new THREE.Mesh(shade,mat(new THREE.MeshBasicMaterial({color:cfg.shine===undefined?0xffffff:cfg.shine,
      transparent:true,opacity:.20,depthWrite:false})));
    sh2.rotation.x=Math.PI*.5-.28;sh2.rotation.z=-Math.PI*.47;sh2.position.set(0,.30,-.05);
    sh2.scale.set(1,1,.55);hairG.add(sh2);
  }
  // —— 头带/发带（v55：上移+后移藏进发间，避免横在眉间像蒙眼布；女主发片更密时可再弱化） ——
  const ribbon=add(head,new THREE.Mesh(torus(.315,.026,6,24),mat(clothMat(cfg.ribbon||0xff4d9e,.4))),false);
  ribbon.rotation.x=Math.PI/2;ribbon.scale.set(1,1,.98);
  ribbon.position.set(0,.335,-.075);
  // —— 下装：旋转台裙摆/长袍（v62：随腿加长同步下移下摆） ——
  const robeG=new THREE.Group();robeG.position.y=1.11;G.add(robeG);
  const robeProf=female
    ?[[.500,-.85],[.515,-.81],[.448,-.48],[.344,-.11],[.30,.02],[.001,.02]]
    :[[.428,-.70],[.438,-.66],[.398,-.46],[.334,-.15],[.30,.02],[.001,.02]];
  const robe=add(robeG,new THREE.Mesh(lathe(robeProf.map(p=>[p[0]*bulk,p[1]]),20),mBot),false);
  const hem=add(robeG,new THREE.Mesh(torus((female?.495:.418)*bulk,.018*bulk,5,22),mTrim),false);
  hem.rotation.x=Math.PI/2;hem.position.y=female?-.835:-.69;
  const robeChildren=[robe,hem];
  if(female&&det>=2){ // 百褶
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;
      const pl=add(robeG,new THREE.Mesh(bx(.045,.62,.03),mBot),false);
      pl.position.set(Math.sin(a)*.44,-.50,Math.cos(a)*.44);pl.rotation.y=a;pl.rotation.x=.14;}
    robeChildren.push(robeG);
  }
  // —— 四肢 ——
  const hipX=.155*bulk;
  const mkLeg=side=>{
    // v62：腿加长（髋点 1.00→1.05、大腿 .52→.60、小腿 .40→.46），配 7 头身真人比例
    const p=new THREE.Group();p.position.set(hipX*side,1.05,0);G.add(p);
    // v50：大腿上部加粗（肌肉体块）+ 小腿收细（脚踝），避免上下一样粗的圆柱感
    const thigh=add(p,new THREE.Mesh(capsule(.140*bulk,.60,12,5),female?skinM:mBot));thigh.position.y=-.30;
    if(det>=2&&!female){const quad=add(p,new THREE.Mesh(sph(.124,10,8),mBot),false);
      quad.scale.set(1,.95,.86);quad.position.set(.012*side,-.15,.028);}
    const knee=new THREE.Group();knee.position.y=-.60;p.add(knee);
    // v50：膝轴先上移 .16，再让小腿下移补齐 —— 弯曲落在膝头而非小腿肚
    const shinPivot=new THREE.Group();shinPivot.position.y=.18;knee.add(shinPivot);
    const shin=add(shinPivot,new THREE.Mesh(capsule(.096*bulk,.46,12,5),female?skinM:mBot));shin.position.y=-.40;
    if(det>=2&&!female){const calf=add(shinPivot,new THREE.Mesh(sph(.096,10,8),mBot),false);
      calf.scale.set(.92,1.34,.92);calf.position.set(0,-.29,-.048);}
    if(female){const sock=add(shinPivot,new THREE.Mesh(cyl(.103*bulk,.090*bulk,.30,12),mat(clothMat(cfg.sock||0x2a1a30,.85))),false);
      sock.position.y=-.35;}
    // v50：脚踝 + 前脚掌 + 后跟三段，鞋不再是单根胶囊
    const ankle=add(shinPivot,new THREE.Mesh(sph(.058*bulk,10,8),mShoe),false);
    ankle.scale.set(1,.86,.94);ankle.position.y=-.592;
    const foot=add(shinPivot,new THREE.Mesh(capsule(.078*bulk,.25,10,4),mShoe));
    foot.rotation.x=Math.PI/2;foot.scale.set(1,.84,1);foot.position.set(0,-.632,.058);
    if(det>=2){
      const toe=add(shinPivot,new THREE.Mesh(sph(.072*bulk,10,8),mShoe),false);
      toe.scale.set(1,.72,1.15);toe.position.set(0,-.640,.175);
      const heel=add(shinPivot,new THREE.Mesh(bx(.125,.055,.10),mShoe),false);heel.position.set(0,-.636,-.055);
    }
    p.userData.knee=knee;p.userData.ankle=ankle;return p;};
  const mkArm=side=>{
    // v62：肩点上移到拉长后的肩线（.79 区域）并略外扩
    const p=new THREE.Group();p.position.set(.425*bulk*side,.775,0);torso.add(p);
    if(female){const cap2=add(p,new THREE.Mesh(sph(.128*bulk,12,10),mTop),false);
      cap2.scale.set(1,.8,1);cap2.position.y=-.02;}
    else if(det>=2){ // 三角肌包覆（让肩关节有圆润衔接）
      const delt=add(p,new THREE.Mesh(sph(.116*bulk,12,10),armSrc),false);
      delt.scale.set(1,.92,.94);delt.position.y=-.005;}
    const upper=add(p,new THREE.Mesh(capsule(.103*bulk,.44,12,5),armSrc));upper.position.y=-.21;
    if(det>=2&&!female){const bicep=add(p,new THREE.Mesh(sph(.086,10,8),armSrc),false);
      bicep.scale.set(.94,1.18,.94);bicep.position.set(.008*side,-.17,.026);}
    const elbow=new THREE.Group();elbow.position.y=-.42;p.add(elbow);
    const fore=add(elbow,new THREE.Mesh(capsule(.086*bulk,.40,12,5),armSrc));fore.position.y=-.19;
    if(det>=2&&!female){const fa=add(elbow,new THREE.Mesh(sph(.070,10,8),armSrc),false);
      fa.scale.set(.92,1.25,.92);fa.position.set(0,-.125,.022);}
    if(det>=1&&female){const cuff=add(elbow,new THREE.Mesh(cyl(.098*bulk,.113*bulk,.09,12),mTrim),false);cuff.position.y=-.33;}
    const wrist=new THREE.Group();wrist.position.y=-.40;elbow.add(wrist);
    if(det>=1){
      const palm=add(wrist,new THREE.Mesh(sph(.088,12,10),skinM),false);palm.scale.set(1,.92,.62);palm.position.y=-.042;
      if(det>=2){
        for(let i=0;i<3;i++){const fg=add(wrist,new THREE.Mesh(capsule(.023,.105,8,3),skinM),false);
          fg.position.set((i-1)*.046,-.118,.004);fg.rotation.z=(i-1)*.15;
          if(female){ // v53：指甲油（参考图红甲细节）
            const nail=add(wrist,new THREE.Mesh(sph(.0115,6,5),
              mat(metalMat(cfg.nail===undefined?0xe84a5f:cfg.nail,.35,.4))),false);
            nail.position.set((i-1)*.046,-.176,.006);nail.scale.set(1,.8,.9);
          }}
        const thumb=add(wrist,new THREE.Mesh(capsule(.026,.085,8,3),skinM),false);
        thumb.position.set(-.072*side,-.055,.028);thumb.rotation.x=Math.PI*.5;thumb.rotation.z=.5*side;
        if(female){const tn=add(wrist,new THREE.Mesh(sph(.012,6,5),
          mat(metalMat(cfg.nail===undefined?0xe84a5f:cfg.nail,.35,.4))),false);
          tn.position.set(-.072*side,-.102,.042);}
      }else{const th2=add(wrist,new THREE.Mesh(sph(.042,8,6),skinM),false);th2.position.set(-.062*side,-.07,.02);}
    }
    p.userData.elbow=elbow;return p;};
  const legL=mkLeg(-1),legR=mkLeg(1),armL=mkArm(-1),armR=mkArm(1);
  // v50：裙摆改挂到 G（原来是世界空间独立组，胯部一动就穿帮）；脚底封口遮住小腿截断
  G.remove(robeG);G.add(robeG);robeG.position.y=1.11;
  if(det>=2){const hemCap=add(robeG,new THREE.Mesh(cyl((female?.50:.42)*bulk,(female?.46:.38)*bulk,.02,20),
    new THREE.MeshBasicMaterial({color:0x120a18})),false);
    hemCap.position.y=female?-.73:-.59;}
  // v30：动漫描边（倒壳外扩只渲染背面）——只勾头/发/躯干/四肢等大形，五官与碎件不勾
  let outlineN=0;
  if(cfg.outline===undefined?(det>=2):cfg.outline)
    outlineN=addOutline(G,cfg.outlineThick||.024,
      cfg.outlineCol===undefined?0x1d1026:cfg.outlineCol,.085,face.group.children);
  // v54：给角色主体挂「边缘光」子材质 —— 轮廓一圈亮边，把人物从背景里提出来
  {const rimMeshes=[];
    G.traverse(o=>{
      if(!o.isMesh||o.userData.isOutline||o.userData.noOutline)return;
      const m=o.material;
      if(!m||m.transparent||m.isSprite||!m.isMeshToonMaterial)return;
      let inFace=false;for(let p=o;p;p=p.parent)if(p===face.group)inFace=true;
      if(inFace)return;
      rimMeshes.push(o);});
    if(rimMeshes.length){
      const rc=cfg.rimCol===undefined?0xfff0dc:cfg.rimCol;
      const rimMat=new THREE.ShaderMaterial({
        uniforms:{uRimCol:{value:new THREE.Color(rc)},uRimPow:{value:2.4},uRimStr:{value:.55}},
        vertexShader:RIM_VERT,fragmentShader:RIM_FRAG,
        transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.FrontSide});
      mats.push(rimMat);
      for(const o of rimMeshes){
        const rm=new THREE.Mesh(o.geometry,rimMat);
        rm.position.copy(o.position);rm.quaternion.copy(o.quaternion);rm.scale.copy(o.scale);
        rm.userData.isRim=true;rm.userData.noOutline=true;rm.castShadow=false;rm.renderOrder=2;
        o.parent.add(rm);
      }
      G.userData.rimCount=rimMeshes.length;
    }}
  if(scale!==1)G.scale.setScalar(scale);
  G.add(blobShadow(1.6*bulk));
  // v50：腰带之上加一条「束腰」凹环 + 铜扣，强化窄腰视觉
  if(det>=2&&!female){
    const cinch=add(torso,new THREE.Mesh(torus(.276*bulk,.022*bulk,5,20),mTrim),false);
    cinch.rotation.x=Math.PI/2;cinch.position.y=.255;
    const buckle=add(torso,new THREE.Mesh(bx(.085,.075,.035),mTrim),false);
    buckle.position.set(0,.21,.305*bulk);
  }
  const J={torso,chest:torsoMesh,robe:robe,robeG:robeG,belt:belt,legL:legL,legR:legR,armL:armL,armR:armR,
    head:head,hair:hairG,hairSway:sway,ribbon:ribbon,face:face,root:G,
    neck:neck,
    eyeL:face.parts.eyeL,eyeR:face.parts.eyeR,
    mTop:mTop,mBot:mBot,mTrim:mTrim,mHair:mHair,skinM:skinM,robeChildren:robeChildren,
    recolor:(o)=>{if(!o)return;
      if(o.robe!==undefined){mTop.color.setHex(o.robe);mTop.emissive.setHex(o.robe);}
      if(o.chest!==undefined){mBot.color.setHex(o.chest);mBot.emissive.setHex(o.chest);}
      if(o.belt!==undefined){mTrim.color.setHex(o.belt);mTrim.emissive.setHex(o.belt);}
      if(o.ribbon!==undefined){mTrim.color.setHex(o.ribbon);mTrim.emissive.setHex(o.ribbon);}
      if(o.hair!==undefined){mHair.color.setHex(o.hair);mHair.emissive.setHex(o.hair);}
      return J;}};
  return {g:G,mats:mats,j:J};}
// ---------- 玩家（写实化骨骼人物：细分轮廓 + 五官表情绑定） ----------
const player=new THREE.Group();
const HEAD_Y=1.145; // v50：头部基准高度（颈长 +8% 后同步抬升）
const heroFig=mkFigure({top:0x5a1a6e,bottom:0x2b0f3a,trim:0xffd60a,hair:0x1a1024,skin:0xffdcbc,
  iris:0x3a2418,ribbon:0xff4d9e,armCol:'bottom',det:2,style:'hero',bulk:1,scale:1,female:false,
  outline:true,outlineCol:0x26122f});
const heroParts=heroFig.j;
// v50：把人物骨架暴露到全局，便于回归脚本逐关节测量步态相位（不影响运行时）
try{window.heroParts=heroParts;window.mkFigureTS=mkFigure;}catch(e){}
player.add(heroFig.g);
const heroFace=heroParts.face;
let hurtFxT=0,levelUpFxT=0; // v29：表情触发的临时状态计时
// ---------- 觉醒光环（随觉醒武器数量增强的视觉升华） ----------
const awakenAura=new THREE.Group();player.add(awakenAura);
const auraRingMat=new THREE.MeshBasicMaterial({color:0xd4af37,transparent:true,opacity:.5,side:THREE.DoubleSide});
let auraRings=[],auraShards=[],auraLight=null,auraCount=-1;
function syncAwakenAura(){
  const n=AWAKENS.filter(a=>W[a.key].awakened).length;
  if(n===auraCount)return;auraCount=n;
  // 清理
  auraRings.forEach(r=>awakenAura.remove(r));auraRings=[];
  auraShards.forEach(s=>awakenAura.remove(s));auraShards=[];
  if(auraLight){awakenAura.remove(auraLight);auraLight=null;}
  if(n<=0){awakenAura.visible=false;return;}
  awakenAura.visible=true;
  // 底部金环（随觉醒数增多）
  for(let i=0;i<Math.min(3,n);i++){
    const r=new THREE.Mesh(new THREE.RingGeometry(1.0+i*.35,1.12+i*.35,40),auraRingMat.clone());
    r.material.color.setHex(i===0?0xd4af37:i===1?0xffd60a:0xffe9a8);
    r.rotation.x=-Math.PI/2;r.position.y=.06+i*.02;awakenAura.add(r);auraRings.push(r);}
  // 悬浮碎晶（环绕上升）
  for(let i=0;i<n*2;i++){
    const s=new THREE.Mesh(new THREE.OctahedronGeometry(.08,0),
      new THREE.MeshStandardMaterial({color:0xffe9a8,emissive:0xffd60a,emissiveIntensity:1.6}));
    const a=i/(n*2)*Math.PI*2;const rr=1.6;const ph=Math.random()*6.283;
    s.userData={a,rr,ph,spd:.6+Math.random()*.6};
    s.position.set(Math.cos(a)*rr,1+Math.sin(ph)*.6,Math.sin(a)*rr);
    awakenAura.add(s);auraShards.push(s);}
  // 点光
  auraLight=new THREE.PointLight(0xffd60a,Math.min(.4,n*.08),5);
  auraLight.position.y=2.6;awakenAura.add(auraLight);}
function updateAwakenAura(dt,t){
  if(!awakenAura.visible)return;
  auraRings.forEach((r,i)=>{r.rotation.z+=dt*(.8+i*.4);
    r.material.opacity=.35+.25*Math.abs(Math.sin(t*2+i));});
  auraShards.forEach(s=>{const u=s.userData;
    s.position.x=Math.cos(u.a+t*u.spd)*u.rr;s.position.z=Math.sin(u.a+t*u.spd)*u.rr;
    s.position.y=1+Math.sin(t*2+u.ph)*.7;s.rotation.y+=dt*3;s.rotation.x+=dt*2;});
  if(auraLight)auraLight.intensity=Math.min(.4,auraCount*.08)*(.85+.15*Math.sin(t*4));}
scene.add(player);

// ---------- 现实感城市场景（v29 写实化：材质 / 屋顶 / 霓虹 / 弯臂街灯 / 地景） ----------
(function buildCity(){
  const winTex=(()=>{const c=document.createElement('canvas');c.width=128;c.height=256;const g=c.getContext('2d');
    g.fillStyle='#1c1430';g.fillRect(0,0,128,256);
    for(let y=8;y<250;y+=24)for(let x=8;x<120;x+=20){
      g.fillStyle=Math.random()<.4?'#ffd60a':(Math.random()<.5?'#4cc9f0':'#2a1f3d');
      g.globalAlpha=.35+Math.random()*.6;g.fillRect(x,y,12,14);}
    // 窗框阴影线，增强立体层次
    g.globalAlpha=1;g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=2;
    for(let y=0;y<256;y+=24){g.beginPath();g.moveTo(0,y);g.lineTo(128,y);g.stroke();}
    for(let x=0;x<128;x+=20){g.beginPath();g.moveTo(x,0);g.lineTo(x,256);g.stroke();}
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;})();
  // v31：楼体色彩多样化（紫/蓝/玫瑰/青灰四系），告别"全城一色紫"
  const B_HUE=[.76,.64,.87,.54],B_SAT=[.42,.32,.36,.20],B_LIT=[.30,.33,.28,.35];
  const bMats=[0,1,2,3].map(i=>{
    // v66：优先用 AI 生成的夜间楼体立面（含真实窗光），失败回退 canvas 假窗
    // 坑：Texture.clone() 若在原纹理异步加载完成前执行，clone.image 永远是 null
    // （不会有回调回填），楼体会整面空白 —— 故必须各自 load，由 matTex 缓存去重
    let t=null;
    try{t=matTex('facade',2,4+i);}catch(e){t=null;}
    if(!t){t=winTex.clone();t.needsUpdate=true;t.repeat.set(2,4+i);}
    return new THREE.MeshStandardMaterial({map:t,emissiveMap:t,emissive:new THREE.Color(0xffd9a0),emissiveIntensity:.55,
      color:new THREE.Color().setHSL(B_HUE[i],B_SAT[i],B_LIT[i]),roughness:.8});});
  const roofMat=new THREE.MeshStandardMaterial({color:0x2a2233,roughness:.9});
  const roofEdge=new THREE.MeshStandardMaterial({color:0x3a3046,roughness:.8,metalness:.1});
  const NEON=['💖 招亲','茶餐厅','修罗场','婚介所','健身房','网吧','酒吧','便利店'];
  const NEON_C=[0xff4d9e,0x4cc9f0,0xffd60a,0xf72585,0x9d4edd,0xff8fa3,0x00e0a8,0xff9e00];
  function neonSign(w,h,text,col){ // 霓虹招牌（透明底 + 发光文字/边框，夜间悬挂效果）
    const c=document.createElement('canvas');c.width=256;c.height=128;const g2=c.getContext('2d');
    g2.clearRect(0,0,256,128);
    g2.strokeStyle='#'+col.toString(16).padStart(6,'0');g2.lineWidth=7;g2.strokeRect(8,8,240,112);
    g2.shadowColor='#'+col.toString(16).padStart(6,'0');g2.shadowBlur=28;
    g2.fillStyle='#fff';g2.font='bold 60px sans-serif';g2.textAlign='center';g2.textBaseline='middle';
    g2.fillText(text,128,68);g2.fillText(text,128,68);
    const t=new THREE.CanvasTexture(c);
    return new THREE.Mesh(pgeo(1,1),new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.DoubleSide,depthWrite:false}));}
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2+.2,r=52+Math.random()*10;
    const h=10+Math.random()*22,w=5+Math.random()*4,d=5+Math.random()*4;
    const b=new THREE.Mesh(bx(w,h,d),bMats[i%4]);
    b.position.set(Math.cos(a)*r,h/2,Math.sin(a)*r);b.rotation.y=Math.random();scene.add(b);
    // 屋顶：檐口 + 屋面 + 水塔/天线
    const rf=new THREE.Mesh(bx(w*.99,.5,d*.99),roofEdge);rf.position.y=h+.25;b.add(rf);
    const rc=new THREE.Mesh(bx(w*.86,.3,d*.86),roofMat);rc.position.y=h+.62;b.add(rc);
    const wt=new THREE.Mesh(cyl(.55,.62,1.1,12),roofMat);wt.position.set(w*.2,h+1.3,-d*.15);b.add(wt);
    const ant=new THREE.Mesh(cyl(.04,.04,2.4,6),metalMat(0xb8c0d0,.35,.9));ant.position.set(-w*.22,h+1.5,d*.2);b.add(ant);
    // 霓虹招牌（挂在外墙）
    const ns=neonSign(3.4,1.7,NEON[i%NEON.length],NEON_C[i%NEON_C.length]);
    ns.scale.set(2.6,1.3,1);ns.position.set(0,h*.55,d/2+.06);b.add(ns);}
  // 街灯（v29：底座 + 弯臂 + 灯罩 + 透镜 + 光锥）
  const lampMat=metalMat(0x3a4050,.45,.8);
  const glowMat=new THREE.MeshStandardMaterial({color:0xffe9a8,emissive:0xffd60a,emissiveIntensity:1.6});
  const lensMat=new THREE.MeshStandardMaterial({color:0xfff2cc,emissive:0xffd60a,emissiveIntensity:1.1,
    transparent:true,opacity:.75,roughness:.1});
  const glowCanvas=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const gg=c.getContext('2d');
    const rg=gg.createRadialGradient(32,32,2,32,32,30);
    rg.addColorStop(0,'rgba(255,220,160,.9)');rg.addColorStop(1,'rgba(255,200,120,0)');
    gg.fillStyle=rg;gg.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2+.4,r=ARENA-4;
    const g=new THREE.Group();g.position.set(Math.cos(a)*r,0,Math.sin(a)*r);
    g.rotation.y=-a+Math.PI;g.lookAt(0,0,0);g.rotation.x=0;g.rotation.z=0;
    // v65.1：优先用 AI 真实感路灯；光源挪到贴图灯头处（图像顶部约 26% 处）
    const _aiLamp=envProp('p_lamp',5.0,{rot:0});
    if(_aiLamp){
      g.add(_aiLamp);
      const BY=_aiLamp?3.7:4.5;
      const bulb2=new THREE.Sprite(new THREE.SpriteMaterial({map:glowCanvas,
        blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
      bulb2.scale.set(2.2,2.2,1);bulb2.position.set(0,BY,0);g.add(bulb2);
      const pl=new THREE.PointLight(0xffd60a,.65,12);pl.position.set(0,BY,0);g.add(pl);
      const lightCone=new THREE.Mesh(cyl(.16,1.5,4.4,14,1,true),
        new THREE.MeshBasicMaterial({color:0xffd9a0,transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}));
      lightCone.position.set(0,BY-2.4,0);g.add(lightCone);
    }else{
    const base=new THREE.Mesh(cyl(.26,.34,.34,12),lampMat);base.position.y=.17;g.add(base);
    const pole=new THREE.Mesh(cyl(.075,.11,4.3,10),lampMat);pole.position.y=2.4;g.add(pole);
    const arm=new THREE.Mesh(cyl(.055,.065,1.5,8),lampMat);arm.rotation.z=Math.PI*.42;arm.position.set(.62,4.45,0);g.add(arm);
    const head=new THREE.Mesh(sphSeg(.34,14,10,0,Math.PI*2,0,Math.PI*.55),lampMat);
    head.rotation.z=Math.PI;head.position.set(1.28,4.62,0);g.add(head);
    const lens=new THREE.Mesh(cyl(.27,.2,.12,14),lensMat);lens.position.set(1.28,4.52,0);g.add(lens);
    const bulb=new THREE.Mesh(sph(.19,10,8),glowMat);bulb.position.set(1.28,4.5,0);g.add(bulb);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowCanvas,
      blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
    glow.scale.set(2.4,2.4,1);glow.position.copy(bulb.position);g.add(glow);
    const lightCone=new THREE.Mesh(cyl(.16,1.5,4.4,14,1,true),
      new THREE.MeshBasicMaterial({color:0xffd9a0,transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}));
      lightCone.position.set(1.2,2.3,0);g.add(lightCone);
      const pl=new THREE.PointLight(0xffd60a,.65,12);pl.position.set(1.28,4.4,0);g.add(pl);
      g.traverse(o=>{if(o.isMesh)o.castShadow=true;});}
    scene.add(g);}
  // 长椅（实物化：多条木条+铁艺支腿+靠背）
  const umbMat=new THREE.MeshStandardMaterial({color:0xd63a5a,roughness:.75,side:THREE.DoubleSide});
  const woodMat=new THREE.MeshStandardMaterial({color:0x7a4a2b,roughness:.85});
  const woodMat2=new THREE.MeshStandardMaterial({color:0x8d5836,roughness:.85});
  const ironMat=new THREE.MeshStandardMaterial({color:0x2c2f36,roughness:.55,metalness:.6});
  function bench(x,z,rot){const g=new THREE.Group();
    for(let i=0;i<3;i++){const seat=new THREE.Mesh(new THREE.BoxGeometry(2.1,.07,.14),woodMat);
      seat.position.set(0,.45,-.2+i*.2);g.add(seat);}
    for(let i=0;i<3;i++){const back=new THREE.Mesh(new THREE.BoxGeometry(2.1,.13,.06),woodMat2);
      back.position.set(0,.62+i*.15,-.3);g.add(back);}
    [-.85,.85].forEach(x2=>{const leg=new THREE.Mesh(new THREE.BoxGeometry(.09,.45,.45),ironMat);leg.position.set(x2,.22,0);g.add(leg);
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.5),ironMat);arm.position.set(x2,.62,-.05);g.add(arm);});
    g.position.set(x,0,z);g.rotation.y=rot;g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);}
  // 咖啡座（实物化：圆桌+铁艺三脚+遮阳伞+骨杆+杯碟）
  function table(x,z){const g=new THREE.Group();
    const top=new THREE.Mesh(new THREE.CylinderGeometry(.58,.58,.06,20),woodMat2);top.position.y=.76;g.add(top);
    const edge=new THREE.Mesh(new THREE.TorusGeometry(.57,.03,6,20),ironMat);edge.rotation.x=Math.PI/2;edge.position.y=.76;g.add(edge);
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2;const leg=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.76,6),ironMat);
      leg.position.set(Math.cos(a)*.3,.38,Math.sin(a)*.3);leg.rotation.x=Math.cos(a)*.16;leg.rotation.z=-Math.sin(a)*.16;g.add(leg);}
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,2.1,8),ironMat);mast.position.y=1.5;g.add(mast);
    const umb=new THREE.Mesh(new THREE.ConeGeometry(1.25,.55,12),umbMat);umb.position.y=2.45;g.add(umb);
    const tip=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),ironMat);tip.position.y=2.78;g.add(tip);
    for(let i=0;i<6;i++){const a=i/6*Math.PI*2;const rib=new THREE.Mesh(new THREE.BoxGeometry(.04,.04,1.1),ironMat);
      rib.position.set(Math.cos(a)*.55,2.28,Math.sin(a)*.55);rib.rotation.y=-a;rib.rotation.x=.12;g.add(rib);}
    const cup=new THREE.Mesh(new THREE.CylinderGeometry(.11,.09,.16,10),new THREE.MeshStandardMaterial({color:0xf2f2f2,roughness:.3}));cup.position.set(.18,.87,.1);g.add(cup);
    const saucer=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.02,14),new THREE.MeshStandardMaterial({color:0xe8e8e8,roughness:.3}));saucer.position.set(.18,.8,.1);g.add(saucer);
    g.position.set(x,0,z);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);}
  // v65.1：AI 真实感长椅优先，缺资源时回退程序化模型
  function benchAI(x,z,rot){
    const g=envProp('p_bench',1.15,{rot:rot});
    if(g){g.position.set(x,0,z);scene.add(g);return;}
    bench(x,z,rot);}
  benchAI(-12,-16,0.6);benchAI(14,-10,-1.2);benchAI(8,17,2.5);benchAI(-16,10,-0.4);
  // AI 自动售货机（沿街新增，丰富夜景层次）
  [[-14.2,-16.8],[15.8,-10.6],[10,17.6],[-17.8,10.5]].forEach(function(v){
    const g=envProp('p_vending',2.1,{rot:Math.random()*6.283});
    if(g){g.position.set(v[0],0,v[1]);scene.add(g);}});
  // —— v66 第二批 AI 街具：站牌 / 报刊亭 / 路边摊 / 出租车 / 霓虹招牌 / 邮筒 ——
  (function placeV66(){
    const put=function(id,h,x,z,rot){
      const g=envProp(id,h,{rot:rot===undefined?Math.random()*6.283:rot});
      if(!g)return null;g.position.set(x,0,z);scene.add(g);return g;};
    // 公交站牌：长椅旁成对出现，符合"候车"语义
    put('p_busstop',2.7,-10.5,-16.4,.6);put('p_busstop',2.7,12.6,-10.2,-1.1);
    put('p_busstop',2.7,9.4,17.2,2.4);
    // 报刊亭：街角两座
    put('p_kiosk',2.6,-19.2,-4.5,.35);put('p_kiosk',2.6,19.8,5.6,-1.05);
    // 日式路边摊：夜宵氛围
    put('p_stall',2.5,-11.5,15.2,2.9);put('p_stall',2.5,17.2,-15.4,-.55);
    put('p_stall',2.5,-3.5,-21.6,.15);
    // 出租车：街边停放（车头朝路）
    put('p_taxi',1.55,-17.6,7.2,1.25);put('p_taxi',1.55,20.4,-2.4,-1.9);
    // 霓虹招牌：挂在 4 个街口，夜间发光
    put('p_neon',3.2,-13.2,-12.6,.5);put('p_neon',3.2,13.4,-8.6,-1.2);
    put('p_neon',3.2,7.6,19.4,2.6);put('p_neon',3.2,-18.4,12.2,-.4);
    // 邮筒：零散分布在长椅/报刊亭附近
    put('p_mailbox',1.35,-9.8,-13.4,0);put('p_mailbox',1.35,11.2,-7.8,1.7);
    put('p_mailbox',1.35,-15.6,-2.2,.4);put('p_mailbox',1.35,16.6,9.8,-.8);
  })();
  table(-6,-20);table(19,-14);table(11,21);table(-20,4);table(2,-25);
  // 树木（v51：真正的枝叶结构 —— 主干分叉 + 二级细枝 + 独立叶片簇，不再是"锥体蘑菇"）
  const barkMat=new THREE.MeshStandardMaterial({color:0x54341f,roughness:.95,bumpMap:noiseTex(4,128),bumpScale:.25});
  const leafMats=[0x2f7a4d,0x3f9a5f,0x276843,0x4a8a55,0x1f5c3a].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.9,
    flatShading:true,bumpMap:noiseTex(3,128),bumpScale:.18,side:THREE.DoubleSide}));
  // 叶片几何（v51 核心）：单片叶子 = 极扁的尖锥（叶形：根宽梢尖），双面渲染
  // 统一成 1 种单位几何，尺寸全靠 instance matrix 缩放 → 可整树合批
  const LEAF_GEO=(()=>{const g=new THREE.ConeGeometry(.5,1,4,1,false);
    g.scale(1,.52,.30);                     // 压扁成薄片
    g.translate(0,.44,0);                   // 枢轴移到叶柄（便于向外张开）
    g.computeVertexNormals();return g;})();
  // v51 性能关键：整棵树的叶片攒进一个 InstancedMesh —— 每棵树从 ~220 draw call 降到 1
  // 以前是每片叶一个 Mesh（15 棵 = 3400+ 次绘制），移动端必掉帧
  // placeLeaf(尺度, 落点世界矩阵)：在该落点生成一圈放射状叶簇，写入 bucket
  function leafPlacer(bucket){
    const tint=[0,1,2,3,4];
    return (r,world)=>{
      const n=10,sz=r*1.55,w=r*.40;   // v53：10 片更密 + 叶更短（贴枝不分离）
      // 从落点矩阵里解出朝向与位置（枝梢空间），叶子沿枝梢方向张开
      const pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scl=new THREE.Vector3();
      world.decompose(pos,quat,scl);
      for(let i=0;i<n;i++){
        const a=(i/n)*Math.PI*2+(r*7.3%1.1);
        const t2=.72*(0.72+((i*37)%11)/22);  // v53：张开角收窄 0.95→0.72，叶子包住枝
        const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a)*t2,0,Math.sin(a)*t2));
        q.premultiply(quat);
        const sc=(0.84+((i*53)%9)/26);
        bucket.push({m:new THREE.Matrix4().compose(
          pos.clone(), q, new THREE.Vector3(w*2*sc,sz*sc,w*2*sc)),mi:tint[i%5]});
      }
    };
  }
  function branch(g,y,ang,len,r,tilt){const b=new THREE.Mesh(capsule(r,len,8,4),barkMat);
    b.position.set(0,y,0);b.rotation.z=ang;b.rotation.x=(tilt||0);
    b.position.x=Math.sin(ang)*len*.42;b.position.y=y+Math.cos(ang)*len*.38;g.add(b);return b;}
  // 递归枝：从父端出发，分 2~3 叉，末端把叶片矩阵塞进 bucket（depth 控制递归层数）
  function limb(parent,len,r,depth,dirA,dirT,bucket,placeLeaf,leafScale){
    const seg=new THREE.Mesh(capsule(r,len,7,3),barkMat);
    seg.position.y=len*.5;seg.castShadow=true;
    const piv=new THREE.Group();piv.rotation.z=dirA;piv.rotation.x=dirT;
    piv.add(seg);parent.add(piv);
    const tip=new THREE.Group();tip.position.y=len;seg.add(tip);
    if(depth<=0){
      // v53 修复"叶枝分离"：叶簇不再只悬在枝梢一个点 —— 枝梢 + 枝条中段各挂一簇，
      // 且簇心沿枝回缩 12%，让叶片包住细枝末梢
      tip.updateWorldMatrix(true,false);
      placeLeaf(leafScale,tip.matrixWorld.clone());
      const mid=new THREE.Object3D();mid.position.y=len*.50;seg.add(mid);
      mid.updateWorldMatrix(true,false);
      placeLeaf(leafScale*.82,mid.matrixWorld.clone());
      return tip;
    }
    const n=depth>=2?3:2;
    for(let i=0;i<n;i++){
      const a=(i-(n-1)/2)*(depth>=2?.72:.95);
      limb(tip,len*(.70+((i*29)%7)/40),r*.66,depth-1,
        dirA*.42+a,dirT*.55+(i%2?.22:-.18),bucket,placeLeaf,leafScale*.9);
    }
    return tip;}
  function tree(x,z,s=1,type=0){const g=new THREE.Group();
    // —— v65：AI 真实感树（ENV2 贴图，十字双面片，摇曳随 TREES 系统） ——
    // 注意：ENV2 是后置 const（TDZ），typeof 也会抛错，必须 try/catch
    let envT=null;
    try{envT=ENV2&&ENV2['t'+(type+1)];}catch(e){envT=null;}
    if(envT){
      const id='t'+(type+1);
      const tex=new THREE.TextureLoader().load('data:image/webp;base64,'+envT.t);
      tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.encoding=THREE.sRGBEncoding;
      const H=5.8*s,W=H*envT.ar;
      const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,
        side:THREE.DoubleSide,alphaTest:.4});
      for(let i=0;i<2;i++){
        const p=new THREE.Mesh(new THREE.PlaneGeometry(W,H),mat);
        p.position.y=H*.48;p.rotation.y=i*Math.PI/2;
        p.castShadow=false;p.userData.noOutline=true;p.renderOrder=3;
        g.add(p);}
      const base=new THREE.Mesh(cyl(1.05*s,.92*s,.15,14),
        new THREE.MeshStandardMaterial({color:0x35251a,roughness:1}));base.position.y=.075;g.add(base);
      g.position.set(x,0,z);g.userData.ph=Math.random()*7;g.userData.s=s;g.userData.aiTree=true;
      scene.add(g);TREES.push(g);return g;}
    // 树干：根部外扩（旋转台轮廓），比圆柱更接近真实树形
    const trunk=new THREE.Mesh(lathe([[.30,.0],[.20,.12],[.145,.5],[.125,1.2],[.13,2.0],[.16,2.5],[.10,2.72]].map(p=>[p[0]*s,p[1]*s]),12),barkMat);
    trunk.position.y=0;trunk.castShadow=true;g.add(trunk);
    // 主枝（承重骨架，粗）
    branch(g,2.1*s,.55,1.15*s,.10*s,.3);branch(g,2.3*s,-.55,1.05*s,.09*s,-.25);
    branch(g,1.85*s,1.05,.85*s,.08*s,.5);branch(g,2.2*s,.15,.9*s,.075*s,-.4);
    // 冠层：枝干骨架挂在 leaf 组下（随风摇曳时整体摆动）
    const leaf=new THREE.Group();leaf.position.y=2.42*s;g.add(leaf);g.userData.leaf=leaf;
    // 叶片矩阵先按"相对 leaf 的局部空间"收集，最后一次性合成 InstancedMesh
    const bucket=[];const place=leafPlacer(bucket);
    if(type===0){
      // —— 针叶型（松/杉）：主梢 + 轮生枝，细枝末端挂针叶簇，不是锥体 ——
      g.userData.kind='conifer';
      limb(leaf,.95*s,.055*s,1,0,0,bucket,place,.40*s);
      // 三层轮生枝（每层 4~5 支，向外下垂 35°~55°）
      for(let lv=0;lv<3;lv++){
        const cnt=lv===0?5:4;
        const holder=new THREE.Group();holder.position.y=lv*.62*s;leaf.add(holder);
        for(let i=0;i<cnt;i++){
          const a=(i/cnt)*Math.PI*2+(lv*.68);
          const rot=new THREE.Group();rot.rotation.y=a;holder.add(rot);
          const down=-(.62+lv*.16);   // 越靠下越下垂
          limb(rot,(1.05-lv*.16)*s,.045*s,1,.28+lv*.10,down,bucket,place,(.34-lv*.06)*s);
        }
      }
    }else{
      // —— 阔叶型（榕/樟）：粗干分 3 主叉，每个主叉再分细枝，末端团簇叶，形成伞状冠 ——
      g.userData.kind='broadleaf';
      const crown=new THREE.Group();crown.position.y=.12*s;leaf.add(crown);
      for(let i=0;i<3;i++){
        const a=(i/3)*Math.PI*2+.4;
        const rot=new THREE.Group();rot.rotation.y=a;crown.add(rot);
        limb(rot,1.18*s,.062*s,2,.62+i*.06,-.16,bucket,place,.52*s);
      }
      // 中心补一支出顶枝，避免冠心空洞
      limb(crown,.90*s,.05*s,2,0,0,bucket,place,.46*s);
    }
    // —— 叶簇合批：按材质分 5 组 InstancedMesh，每组 1 次 draw call ——
    // 注意：叶子挂在 leaf 组里，摇曳时会跟着转 → 矩阵必须相对 leaf 局部，不能是世界坐标
    if(bucket.length){
      leaf.updateWorldMatrix(true,false);
      const invLeaf=new THREE.Matrix4().copy(leaf.matrixWorld).invert();
      const groups=[[],[],[],[],[]];
      for(const it of bucket)groups[it.mi].push(it.m);
      let leafMeshN=0;
      for(let mi=0;mi<5;mi++){
        const arr=groups[mi];if(!arr.length)continue;
        const im=new THREE.InstancedMesh(LEAF_GEO,leafMats[mi],arr.length);
        const tmp=new THREE.Matrix4();
        for(let i=0;i<arr.length;i++){tmp.multiplyMatrices(invLeaf,arr[i]);im.setMatrixAt(i,tmp);}
        im.instanceMatrix.needsUpdate=true;
        im.castShadow=false;          // 叶片不投影，省一半阴影开销
        im.frustumCulled=false;       // 合批后包围盒不随矩阵更新，关掉剔除避免整树消失
        im.userData.isLeafBatch=true;
        leaf.add(im);leafMeshN++;
      }
      g.userData.leafBatch=leafMeshN;
      g.userData.leafCount=bucket.length;
    }
    const base=new THREE.Mesh(cyl(1.05*s,.92*s,.15,14),
      new THREE.MeshStandardMaterial({color:0x35251a,roughness:1}));base.position.y=.075;g.add(base);
    g.position.set(x,0,z);g.userData.ph=Math.random()*7;g.userData.s=s;
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    // 合批叶片最后再关一次阴影（traverse 会统一打开）
    leaf.children.forEach(o=>{if(o.isInstancedMesh)o.castShadow=false;});
    scene.add(g);TREES.push(g);}
  tree(-24,-24,1.3,0);tree(26,-22,1.1,1);tree(-28,14,1.2,2);tree(24,24,1.4,3);tree(-6,26,1,0);tree(30,4,1.2,1);tree(-30,-6,1.1,2);
  tree(-14,22,1.0,3);tree(18,12,.95,0);tree(-8,-26,1.05,1);tree(12,-25,1.1,2);
  // v51：补 4 棵小树/幼树，让林线有层次（近小远大，纵深感）
  tree(-20,-10,.72,1);tree(22,16,.68,3);tree(-2,-30,.62,0);tree(34,-8,.66,2);
  // —— v29 新增地景 ——
  const grassMat=new THREE.MeshStandardMaterial({color:0x2f6b44,roughness:.95,flatShading:true});
  const hedgeMat=new THREE.MeshStandardMaterial({color:0x27623c,roughness:.95,flatShading:true});
  const soilMat=new THREE.MeshStandardMaterial({color:0x3a2a1c,roughness:1});
  const petalMats=[0xff6b8a,0xffd60a,0xc77dff,0xff8fa3,0xf9a03f].map(c=>clothMat(c,.8));
  const stoneMat=metalMat(0x8d939e,.55,.25);
  // 绿篱（长条修剪灌木）
  function hedge(x,z,len,rot){
    // v66：AI 灌木替换球串绿篱（沿长度摆一列，尺寸/角度轻微抖动避免阵列感）
    let ok=false;try{ok=!!(ENV2&&ENV2['p_bush']);}catch(e){ok=false;}
    if(ok){
      const n=Math.max(2,Math.round(len/1.25));
      const g=new THREE.Group();let placed=0;
      for(let i=0;i<n;i++){
        const p=envProp('p_bush',1.05+Math.random()*.28,{rot:Math.random()*6.28});
        if(!p)break;
        p.position.set(-len/2+(i+.5)*(len/n),0,(Math.random()-.5)*.34);
        g.add(p);placed++;}
      if(placed>=2){g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);return;}
      scene.remove(g);}
    hedgeFallback(x,z,len,rot);}
  function hedgeFallback(x,z,len,rot){const g=new THREE.Group();
    const n=Math.max(2,Math.round(len/1.1));
    for(let i=0;i<n;i++){const b=new THREE.Mesh(sph(.5,8,6),hedgeMat);
      b.scale.set(1.15,.85,.8);b.position.set(-len/2+.55+i*(len-.1)/(n-1),.42,(Math.random()-.5)*.12);
      b.rotation.y=Math.random();b.castShadow=true;g.add(b);}
    g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);}
  hedge(-26,-14,6,.2);hedge(22,-16,7,-.6);hedge(-20,20,6,1.1);hedge(16,26,6,-2.2);hedge(28,14,5,1.4);
  // 花坛（石缘 + 泥土 + 花丛）
  function flowerBed(x,z,r){const g=new THREE.Group();
    const rim=new THREE.Mesh(torus(r,.16,8,26),stoneMat);rim.rotation.x=Math.PI/2;rim.position.y=.16;g.add(rim);
    const soil=new THREE.Mesh(cyl(r-.1,r-.05,.26,22),soilMat);soil.position.y=.13;g.add(soil);
    const n=Math.round(r*7);
    for(let i=0;i<n;i++){const a=Math.random()*7,rr=Math.random()*(r-.35);
      const st=new THREE.Mesh(cyl(.02,.02,.3,5),grassMat);st.position.set(Math.cos(a)*rr,.28,Math.sin(a)*rr);g.add(st);
      const fl=new THREE.Mesh(sph(.085,7,6),petalMats[i%petalMats.length]);
      fl.position.set(Math.cos(a)*rr,.44,Math.sin(a)*rr);fl.scale.set(1,.8,1);g.add(fl);}
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});g.position.set(x,0,z);scene.add(g);}
  // v65.1：AI 真实感花坛（贴图自带约 41° 俯视透视，故按「直径」定尺寸）
  function flowerBedAI(x,z,r){
    const g=envProp('p_flowerbed',0,{width:r*1.55,rot:Math.random()*6.283});
    if(g){g.position.set(x,0,z);scene.add(g);return;}
    flowerBed(x,z,r);}
  flowerBedAI(-13,6,1.5);flowerBedAI(13,-3,1.3);flowerBedAI(3,13,1.6);flowerBedAI(-3,-9,1.2);
  // 花盆（陶盆 + 花）
  const potMat=new THREE.MeshStandardMaterial({color:0xa8593c,roughness:.85});
  function pot(x,z,s=1){const g=new THREE.Group();
    const p=new THREE.Mesh(lathe([[.001,0],[.34,0],[.30,.42],[.42,.5],[.40,.56]].map(q=>[q[0]*s,q[1]*s]),14),potMat);
    p.castShadow=true;g.add(p);
    const bush=new THREE.Mesh(sph(.3*s,9,7),grassMat);bush.position.y=.62*s;g.add(bush);
    for(let i=0;i<5;i++){const a=Math.random()*7;
      const fl=new THREE.Mesh(sph(.07*s,7,6),petalMats[i%petalMats.length]);
      fl.position.set(Math.cos(a)*.22*s,.78*s,Math.sin(a)*.22*s);g.add(fl);}
    g.position.set(x,0,z);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);}
  pot(-9.5,-14.5,1);pot(17.5,-8.5,.9);pot(10.5,18.5,1.1);pot(-17.5,12.5,.95);pot(6,-22,1);pot(-22,-4,1.05);
  // 隔离柱（金属矮柱，环岛/路缘）
  function bollard(x,z){const g=new THREE.Group();
    const b=new THREE.Mesh(cyl(.13,.16,.85,12),metalMat(0x39404e,.4,.85));b.position.y=.43;g.add(b);
    const cap=new THREE.Mesh(sph(.135,12,8),metalMat(0x8d939e,.3,.9));cap.position.y=.88;g.add(cap);
    const band=new THREE.Mesh(cyl(.145,.145,.12,12),clothMat(0xf2f2f2,.5));band.position.y=.6;g.add(band);
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});g.position.set(x,0,z);scene.add(g);}
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2;bollard(Math.cos(a)*(ARENA-8.5),Math.sin(a)*(ARENA-8.5));}
  // 路牌（立杆 + 双向牌面）
  function sign(x,z,rot,txt,col){const g=new THREE.Group();
    const pole=new THREE.Mesh(cyl(.05,.06,2.6,8),metalMat(0x6a7280,.45,.85));pole.position.y=1.3;g.add(pole);
    const c=document.createElement('canvas');c.width=256;c.height=128;const g2=c.getContext('2d');
    g2.fillStyle='#1c5a8a';g2.fillRect(0,0,256,128);g2.strokeStyle='#fff';g2.lineWidth=6;g2.strokeRect(6,6,244,116);
    g2.fillStyle='#fff';g2.font='bold 44px sans-serif';g2.textAlign='center';g2.textBaseline='middle';
    g2.fillText(txt,128,66);
    const t=new THREE.CanvasTexture(c);
    for(const s of[-1,1]){const p=new THREE.Mesh(pgeo(1,1),
        new THREE.MeshStandardMaterial({map:t,roughness:.5,side:THREE.DoubleSide}));
      p.scale.set(1.5,.75,1);p.position.set(s*.8,2.45,0);p.rotation.y=s*Math.PI/2;g.add(p);}
    g.position.set(x,0,z);g.rotation.y=rot;g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);}
  sign(-8,8,.6,'情感街',0);sign(12,12,-1.1,'修罗大道',0);sign(-14,-20,2.2,'单身路',0);sign(20,4,-.4,'脱单广场',0);
  // 店面遮阳篷（条纹）
  const awnMats=[0xd63a5a,0x2f9e73,0xf9a03f,0x4cc9f0].map(c=>clothMat(c,.8));
  function awning(x,z,rot,col){const g=new THREE.Group();
    for(let i=0;i<6;i++){const s=new THREE.Mesh(bx(.5,.05,1.25),awnMats[(i+(col||0))%awnMats.length]);
      s.position.set(-1.25+i*.5,2.35,.62);s.rotation.x=-.28;g.add(s);}
    for(const s of[-1,1]){const rod=new THREE.Mesh(cyl(.03,.03,1.3,6),ironMat);
      rod.position.set(s*1.35,2.1,1.1);rod.rotation.x=.5;g.add(rod);}
    g.position.set(x,0,z);g.rotation.y=rot;g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);}
  awning(-11,-13,0.6,0);awning(15,-8,-1.2,1);awning(9,19,2.5,2);awning(-17,12,-0.4,3);
  // 斑马线（地面标线）
  {const zMat=new THREE.MeshBasicMaterial({color:0xdedede,transparent:true,opacity:.5,depthWrite:false});
   for(let i=0;i<7;i++){const m=new THREE.Mesh(pgeo(1.1,3.4),zMat);
     m.rotation.x=-Math.PI/2;m.rotation.z=.4;m.position.set(-14+i*1.5,.012,-2);m.renderOrder=1;scene.add(m);}}
  // 喷泉（实物化：多层水池+雕柱+水流+灯光）
  (function fountain(){const g=new THREE.Group();
    const stone=new THREE.MeshStandardMaterial({color:0x9aa3b5,roughness:.45,metalness:.2});
    const stone2=new THREE.MeshStandardMaterial({color:0x828d9e,roughness:.5,metalness:.2});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(3,3.3,.6,24),stone);base.position.y=.3;g.add(base);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(3,.16,8,32),stone2);rim.rotation.x=Math.PI/2;rim.position.y=.62;g.add(rim);
    const water=new THREE.Mesh(new THREE.CylinderGeometry(2.85,2.85,.12,24),
      new THREE.MeshStandardMaterial({color:0x3aa8d8,emissive:0x4cc9f0,emissiveIntensity:.35,transparent:true,opacity:.7,roughness:.05,metalness:.6}));
    water.position.y=.62;g.add(water);
    for(let i=0;i<4;i++){const a=i/4*Math.PI*2;const dir=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),stone2);
      dir.position.set(Math.cos(a)*2.3,.85,Math.sin(a)*2.3);g.add(dir);}
    const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.32,.5,1.5,12),stone);pillar.position.y=1.4;g.add(pillar);
    const bowl=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.15,.3,18),stone2);bowl.position.y=2.2;g.add(bowl);
    const bw=new THREE.Mesh(new THREE.CylinderGeometry(.95,.95,.1,18),
      new THREE.MeshStandardMaterial({color:0x3aa8d8,emissive:0x4cc9f0,emissiveIntensity:.4,transparent:true,opacity:.75,roughness:.05}));
    bw.position.y=2.35;g.add(bw);
    const top=new THREE.Mesh(new THREE.SphereGeometry(.34,12,10),glowMat);top.position.y=2.85;g.add(top);
    // 水流：中央水柱 + 四道弧线
    const stream=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,1.7,8),
      new THREE.MeshStandardMaterial({color:0x8fd8f5,emissive:0x4cc9f0,emissiveIntensity:.5,transparent:true,opacity:.55}));
    stream.position.y=3.0;g.add(stream);
    for(let i=0;i<4;i++){const a=i/4*Math.PI*2+.4;
      const arc=new THREE.Mesh(new THREE.TorusGeometry(.9,.055,6,10,Math.PI*.55),
        new THREE.MeshStandardMaterial({color:0x8fd8f5,emissive:0x4cc9f0,emissiveIntensity:.45,transparent:true,opacity:.5}));
      arc.position.set(Math.cos(a)*.9,2.5,Math.sin(a)*.9);arc.rotation.z=Math.PI/2;arc.rotation.y=-a;g.add(arc);}
    const fl=new THREE.PointLight(0x4cc9f0,1.1,12);fl.position.y=2.8;g.add(fl);
    g.position.set(-22,-8,0);scene.add(g);})();
  // 垃圾桶与邮筒（街景实物）
  const binMat=new THREE.MeshStandardMaterial({color:0x3d5a45,roughness:.7,metalness:.3});
  function bin(x,z){const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.42,.34,.9,14),binMat);body.position.y=.47;g.add(body);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const rib=new THREE.Mesh(new THREE.BoxGeometry(.05,.86,.05),binMat);
      rib.position.set(Math.cos(a)*.4,.47,Math.sin(a)*.4);g.add(rib);}
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.42,.05,8,16),new THREE.MeshStandardMaterial({color:0x24352a,roughness:.5,metalness:.5}));
    rim.rotation.x=Math.PI/2;rim.position.y=.92;g.add(rim);
    const lid=new THREE.Mesh(new THREE.CylinderGeometry(.36,.4,.12,14),new THREE.MeshStandardMaterial({color:0x24352a,roughness:.5,metalness:.5}));
    lid.position.y=1.0;g.add(lid);
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});g.position.set(x,0,z);scene.add(g);}
  // v65.1：AI 真实感垃圾桶优先
  function binAI(x,z){
    const g=envProp('p_bin',1.1,{rot:Math.random()*6.283});
    if(g){g.position.set(x,0,z);scene.add(g);return;}
    bin(x,z);}
  binAI(-10,-18);binAI(16,-12);binAI(9,19);
  // 红色邮筒（实物化：柱身+投信口+圆顶）
  postbox:{const red=new THREE.MeshStandardMaterial({color:0xc9264a,roughness:.5,metalness:.25});
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,1.25,16),red);body.position.y=.63;g.add(body);
    const slot=new THREE.Mesh(new THREE.BoxGeometry(.5,.1,.12),new THREE.MeshStandardMaterial({color:0x2a0d14,roughness:.8}));
    slot.position.set(0,1.05,.36);g.add(slot);
    const lid=new THREE.Mesh(new THREE.SphereGeometry(.43,16,10,0,Math.PI*2,0,1.15),red);lid.position.y=1.26;g.add(lid);
    const kn=new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshStandardMaterial({color:0xffd60a,metalness:.8,roughness:.3}));kn.position.y=1.6;g.add(kn);
    const band=new THREE.Mesh(new THREE.TorusGeometry(.43,.04,6,18),new THREE.MeshStandardMaterial({color:0x7d1730,roughness:.6}));
    band.rotation.x=Math.PI/2;band.position.y=.75;g.add(band);
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});g.position.set(-18,0,14);scene.add(g);}
})();

// ---------- 女主角NPC + 剧情邂逅（角色扮演层） ----------
// 每位女主：4 阶段剧情线，反复邂逅可升温至"恋人"
const NPC_DEFS=[
 {name:'校花 · 林晚晴',col:0xff8fa3,hair:0x2a1a30,ribbon:0xff4d9e,face:'💔',
  gift:['手写情书','草莓牛奶','篮球场门票'],
  stages:[
   {text:'（她的眼镜片后闪着泪光）"你昨天……是不是陪隔壁班的去逛街了？"',choices:[
     {t:'🙈 嘴甜路线：「那是我去帮你挑生日礼物的！」（出示礼物）',tag:'+12好感 +剧情奖励',aff:12,fx:s=>{s.gift();}},
     {t:'😈 腹黑路线：「嫉妒使你面目全非哦，晚晴同学。」',tag:'+渣男值 招来情敌',aff:-5,fx:()=>{S.scum=Math.min(100,S.scum+35);spawnJealous(2);}}]},
   {text:'"……礼物我很喜欢。但是你要发誓，以后只对我一个人好！"',choices:[
     {t:'💍 真诚路线：「我发誓，拿我游戏存档发誓。」',tag:'+20好感 结缘同行（自动回血）',aff:20,fx:()=>{recruit(0);}},
     {t:'🎭 渣术路线：「我的心，比太平洋还大。」',tag:'+大量渣男值 招来情敌',aff:-8,fx:()=>{S.scum=100;spawnJealous(3);}}]},
   {text:'"周日……要不要一起去看那部新上映的电影？"（她攥着两张票）',choices:[
     {t:'🎬 温柔路线：「已经买好爆米花了，走吧。」',tag:'+22好感 约会：修为大涨',aff:22,fx:()=>{gainXp(60);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'📱 敷衍路线：「再说吧，我最近有点忙。」',tag:'-10好感',aff:-10,fx:()=>{tip('😢 她默默收起了电影票…');}}]},
   {text:'"你身边……是不是还有别人？我全都知道了。"',choices:[
     {t:'🕊️ 坦白路线：「是我错了。之后只有你。」',tag:'+26好感 恋人达成（回血+伤害）',aff:26,fx:()=>{recruit(0);S.dmgMul*=1.15;}},
     {t:'😏 摊牌路线：「反正你也离不开我，不是吗？」',tag:'+50渣男值 引来4名情敌',aff:-12,fx:()=>{S.scum=Math.min(100,S.scum+50);spawnJealous(4);}}]},
   // —— 扩充剧情 5~8：误会 / 反转 / 家庭 / 抉择 ——
   {text:'（她把一张照片摔在桌上）"这是你和苏曼在酒吧的合照。解释一下？"',choices:[
     {t:'📸 圆谎路线：「那是在帮你打听她家的情报！」',tag:'+10好感 但埋下隐患',aff:10,fx:()=>{S.scum=Math.min(100,S.scum+25);tip('🕵️ 她半信半疑地收起了照片…');}},
     {t:'😇 坦诚路线：「我不想骗你。但那晚我满脑子都是你。」',tag:'+18好感 +回血',aff:18,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+40);}},
     {t:'💔 冷酷路线：「查岗查到我头上了？」',tag:'-14好感 招来情敌',aff:-14,fx:()=>{spawnJealous(3);tip('😤 她红着眼眶跑开了…');}}]},
   {text:'（她突然挽住你的手臂）"我妈想见见你。就这个周末。"',choices:[
     {t:'🎁 备礼路线：「阿姨喜欢什么？我全买。」',tag:'+20好感 +碎片',aff:20,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);S.hp=Math.min(S.maxHp,S.hp+20);}},
     {t:'😅 逃避路线：「见我这么优秀的女婿，阿姨会自卑的。」',tag:'-8好感',aff:-8,fx:()=>{tip('😑 她："你少贫了。"');}}]},
   {text:'"我拿到了国外交换的名额……但要走一年。"（她攥紧了衣角）',choices:[
     {t:'✈️ 成全路线：「去吧，我等你回来。」',tag:'+24好感 恋人羁绊加深',aff:24,fx:()=>{recruit(0);S.dmgMul*=1.1;S.regen+=1;}},
     {t:'🖐️ 挽留路线：「别走。留下来，我们一起。」',tag:'+16好感 +巨额渣男值',aff:16,fx:()=>{S.scum=Math.min(100,S.scum+40);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'🎩 放手路线：「去吧，反正我也没空陪你。」',tag:'-16好感',aff:-16,fx:()=>{tip('💧 她笑着说了声"好"，转身走了。');}}]},
   {text:'"如果……我遇到更好的人，你会祝福我吗？"（她盯着你的眼睛）',choices:[
     {t:'💍 一生路线：「不会。因为没人比我更懂你。」',tag:'+30好感 恋人圆满（全属性）',aff:30,fx:()=>{recruit(0);S.dmgMul*=1.2;S.pickR*=1.3;}},
     {t:'🌪️ 修罗路线：「祝福？我会让他后悔出生。」',tag:'+60渣男值 +伤害翻倍',aff:-6,fx:()=>{S.scum=100;S.dmgMul*=1.35;spawnJealous(5);}}]}]},
 {name:'御姐 · 苏曼',col:0x9d4edd,hair:0x14101e,ribbon:0x7209b7,face:'🍷',
  gift:['陈年红酒','黑胶唱片','香水'],
  stages:[
   {text:'（她摇晃着红酒杯）"小弟弟，昨晚在酒吧搂着别人跳舞的，是不是你？"',choices:[
     {t:'😎 撒谎路线：「那是你的双胞胎妹妹吧？我可只认你。」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'😏 坦白路线：「是我。但你敢说你不吃醋？」',tag:'+渣男值 +伤害提升',aff:6,fx:()=>{S.scum=Math.min(100,S.scum+40);S.dmgMul*=1.1;}}]},
   {text:'"有点意思。想追我？先证明你能在修罗场里活下来。"',choices:[
     {t:'⚔️ 并肩路线：「那就让我背你杀出去！」',tag:'+20好感 结缘：曼姐压阵（伤害+25%）',aff:20,fx:()=>{recruit(1);}},
     {t:'🌹 浪漫路线：（单膝下跪献上999朵玫瑰）',tag:'+16好感 +碎片 +回血',aff:16,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);S.hp=Math.min(S.maxHp,S.hp+40);}}]},
   {text:'"我下周三有个酒会。缺个……男伴。你有空吗？"',choices:[
     {t:'🤵 绅士路线：「西装我已经熨好了。」',tag:'+24好感 约会：好感与修为双涨',aff:24,fx:()=>{gainXp(60);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'🍺 随意路线：「酒会太闷，不如直接去喝酒？」',tag:'-6好感',aff:-6,fx:()=>{tip('😑 她挑了挑眉："幼稚。"');}}]},
   {text:'"我已经很久没对谁认真过了。你打算怎么负责？"',choices:[
     {t:'💎 承诺路线：「那就认真到底。」',tag:'+28好感 恋人达成（伤害+30%）',aff:28,fx:()=>{recruit(1);S.dmgMul*=1.3;}},
     {t:'🌊 浪子路线：「认真？那不是我的人设。」',tag:'+50渣男值 +巨额伤害',aff:-14,fx:()=>{S.scum=Math.min(100,S.scum+50);S.dmgMul*=1.2;}}]},
   // —— 扩充剧情 5~8 ——
   {text:'（她把一份合同推到你面前）"签了它。以后你就是我公司的人了。"',choices:[
     {t:'🖊️ 签约路线：「只要能天天见到你，什么合同都签。」',tag:'+18好感 +碎片',aff:18,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);}},
     {t:'🃏 反将路线：「我签。但得加一条——你归我。」',tag:'+22好感 +渣男值',aff:22,fx:()=>{S.scum=Math.min(100,S.scum+30);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'🚪 拒绝路线：「我不会被谁困住的。」',tag:'-10好感 +伤害提升',aff:-10,fx:()=>{S.dmgMul*=1.15;tip('😏 她笑了："果然有意思。"');}}]},
   {text:'"有个不长眼的小开，一直缠着我。"（她眼神危险）',choices:[
     {t:'🛡️ 护花路线：「告诉我是谁，我去会会他。」',tag:'+24好感 招来精英情敌',aff:24,fx:()=>{spawnJealous(2);S.dmgMul*=1.1;}},
     {t:'🍷 潇洒路线：「让他来。正好缺个沙包。」',tag:'+18好感 +渣男值',aff:18,fx:()=>{S.scum=Math.min(100,S.scum+35);}}]},
   {text:'"明天是我生日。别买礼物，人来就行。"',choices:[
     {t:'🎂 用心路线：「礼物不用买，因为我就是最好的礼物。」',tag:'+26好感 约会圆满',aff:26,fx:()=>{gainXp(70);S.hp=S.maxHp;}},
     {t:'💰 世俗路线：（刷了张卡买了块表送她）',tag:'+14好感',aff:14,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+35);}}]},
   {text:'"这么久，你是我唯一没看透的人。"（她第一次露出脆弱）',choices:[
     {t:'🌟 唯一路线：「那就别看了，信我一次。」',tag:'+30好感 恋人圆满（伤害+拾取）',aff:30,fx:()=>{recruit(1);S.dmgMul*=1.25;S.pickR*=1.3;}},
     {t:'🕶️ 保命路线：「看透了，你就不会喜欢我了。」',tag:'+55渣男值 +巨额伤害',aff:-8,fx:()=>{S.scum=100;S.dmgMul*=1.4;}}]}]},
 {name:'邻家甜妹 · 糖糖',col:0xf9a03f,hair:0x5a3a1e,ribbon:0xffd60a,face:'🍬',
  gift:['奶茶券','手工围巾','演唱会门票'],
  stages:[
   {text:'（她抱着奶茶小跑过来）"喏，三分糖！你上次说喜欢甜的……对吧？"',choices:[
     {t:'🥰 嘴甜路线：「你递来的，白开水都是甜的。」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+25);}},
     {t:'❄️ 高冷路线：「我不喝甜的。你别乱花钱。」',tag:'-5好感 +渣男值',aff:-5,fx:()=>{S.scum=Math.min(100,S.scum+30);}}]},
   {text:'"那……那你以后放学，可以来接我吗？"',choices:[
     {t:'🤝 守护路线：「放学门口，第一个就是我的身影。」',tag:'+20好感 结缘：糖糖跟随（移速+拾取）',aff:20,fx:()=>{recruit(2);}},
     {t:'😈 海王路线：「接你？我把整条街都接了吧。」',tag:'+大量渣男值 招来情敌',aff:-10,fx:()=>{S.scum=100;spawnJealous(2);}}]},
   {text:'"我织了条围巾……颜色会不会太土了呀？"',choices:[
     {t:'🧣 暖心路线：「全世界最暖的那条。」（当场戴上）',tag:'+24好感 约会：回血+碎片',aff:24,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.3);for(let i=0;i<6;i++)mkOrb(player.position);}},
     {t:'🙃 毒舌路线：「确实有点土，不过配你。」',tag:'-8好感',aff:-8,fx:()=>{tip('🥺 她低下头把围巾藏到背后…');}}]},
   {text:'"如果有一天你走了……我该怎么办呀？"',choices:[
     {t:'🏡 守护路线：「我不会走。买房子写你名字。」',tag:'+26好感 恋人达成（拾取+回血）',aff:26,fx:()=>{recruit(2);S.pickR*=1.6;S.regen+=1;}},
     {t:'🎈 自由路线：「人总要往前看的嘛。」',tag:'+45渣男值',aff:-12,fx:()=>{S.scum=Math.min(100,S.scum+45);}}]},
   // —— 扩充剧情 5~8 ——
   {text:'"我室友说……看见你昨天送晚晴姐回宿舍了。是真的吗？"',choices:[
     {t:'🤥 抵赖路线：「她室友看错了，那天我在图书馆。」',tag:'+8好感 隐患累积',aff:8,fx:()=>{S.scum=Math.min(100,S.scum+30);}},
     {t:'🥺 示弱路线：「对不起，我……我只是不忍心拒绝别人。」',tag:'+16好感 +回血',aff:16,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+45);}},
     {t:'😏 挑衅路线：「你管得着吗？」',tag:'-12好感 招来情敌',aff:-12,fx:()=>{spawnJealous(3);}}]},
   {text:'（她抱着一个保温桶）"我熬了汤，从早上就开始炖了……你要不要尝尝？"',choices:[
     {t:'🍲 感动路线：（一口喝干）「再来三碗！」',tag:'+22好感 +回血',aff:22,fx:()=>{S.hp=S.maxHp;}},
     {t:'🕐 敷衍路线：「我赶时间，下次吧。」',tag:'-10好感',aff:-10,fx:()=>{tip('😔 保温桶还热着，人却走了。');}}]},
   {text:'"我面试通过了！但是……要在另一个城市上班。"（她期待地看着你）',choices:[
     {t:'🚄 追随路线：「那我也去。哪里有你哪里就是家。」',tag:'+26好感 恋人羁绊',aff:26,fx:()=>{recruit(2);S.regen+=1;S.spd*=1.08;}},
     {t:'📞 异地路线：「先各自努力，以后再会合。」',tag:'+12好感',aff:12,fx:()=>{gainXp(50);}},
     {t:'💔 甩手路线：「那就好好发展，别回头。」',tag:'-18好感 +渣男值',aff:-18,fx:()=>{S.scum=Math.min(100,S.scum+45);tip('💧 她抱着保温桶，站了很久。');}}]},
   {text:'"她们都说你是渣男……可我不信。你告诉我，我该信吗？"',choices:[
     {t:'🕊️ 从良路线：「这次是真的。我只想好好待你。」',tag:'+30好感 恋人圆满（全属性）',aff:30,fx:()=>{recruit(2);S.pickR*=1.4;S.regen+=1;S.hp=S.maxHp;}},
     {t:'🎭 双面路线：「信不信，看你自己的心。」',tag:'+60渣男值 +伤害翻倍',aff:-4,fx:()=>{S.scum=100;S.dmgMul*=1.4;spawnJealous(4);}}]}]},
 {name:'冷艳学姐 · 夜冰',col:0x4cc9f0,hair:0x1a2430,ribbon:0x4cc9f0,face:'❄️',
  gift:['冰美式','绝版藏书','天文馆门票'],
  stages:[
   {text:'（她合上书，眼神像结了冰的湖面）"又是你。图书馆的位子，被我占了。"',choices:[
     {t:'☕ 投喂路线：「那用一杯冰美式换半个位子，行吗？」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'😎 狂妄路线：「占的是位子吗？是你的注意力。」',tag:'+渣男值 +伤害提升',aff:4,fx:()=>{S.scum=Math.min(100,S.scum+35);S.dmgMul*=1.1;}}]},
   {text:'"你这种人我见得多了。说吧，这次想骗我什么？"',choices:[
     {t:'📖 真诚路线：「骗你什么？骗你陪我到天亮自习。」',tag:'+20好感 结缘：学姐护读（冰甲减伤）',aff:20,fx:()=>{recruit(3);}},
     {t:'🎭 承认路线：「骗你的心，顺便骗个长期饭票。」',tag:'+大量渣男值 招来情敌',aff:-10,fx:()=>{S.scum=100;spawnJealous(2);}}]},
   {text:'（她递来一张票）"天文馆有流星雨专场。我多买了一张……别误会，只是顺路。"',choices:[
     {t:'🌠 珍惜路线：「顺路也好，陪我数完所有流星。」',tag:'+24好感 约会：修为大涨',aff:24,fx:()=>{gainXp(60);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'📱 敷衍路线：「流星雨？直播看不是一样。」',tag:'-10好感',aff:-10,fx:()=>{tip('❄️ 她收回票，眼里的光也结了冰…');}}]},
   {text:'"我保研的名额……被人顶了。"（她第一次露出脆弱）',choices:[
     {t:'⚔️ 出头路线：「告诉我他是谁。剩下的交给我。」',tag:'+28好感 恋人达成（减伤+伤害）',aff:28,fx:()=>{recruit(3);S.dmgMul*=1.25;S.armor+=8;}},
     {t:'🌊 冷漠路线：「成年人的世界，哪有公平。」',tag:'+50渣男值 +巨额伤害',aff:-14,fx:()=>{S.scum=Math.min(100,S.scum+50);S.dmgMul*=1.25;}}]},
   // —— 扩充剧情 5~8 ——
   {text:'（她把一道解不开的题推到你面前）"做不出来就别喜欢我。"',choices:[
     {t:'🧠 解题路线：（提笔三分钟解出）「好了，现在可以喜欢了吗？」',tag:'+22好感 +碎片',aff:22,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);}},
     {t:'😏 无赖路线：「我数学不好，但撩你很在行。」',tag:'+16好感 +渣男值',aff:16,fx:()=>{S.scum=Math.min(100,S.scum+30);}}]},
   {text:'"有人说你在晚晴和苏曼之间来回……我在等你的解释。"（冰面出现裂纹）',choices:[
     {t:'🕊️ 坦白路线：「都是真的。但只有你让我不想走。」',tag:'+18好感 裂缝弥合',aff:18,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+45);}},
     {t:'🤥 诡辩路线：「她们只是我的学习小组。」',tag:'+8好感 隐患累积',aff:8,fx:()=>{S.scum=Math.min(100,S.scum+35);}},
     {t:'💔 冷硬路线：「我的事，不用向你汇报。」',tag:'-14好感 招来情敌',aff:-14,fx:()=>{spawnJealous(3);}}]},
   {text:'"导师让我提前进组，去北方读博……三年。"（她低着头）',choices:[
     {t:'❄️ 守望路线：「三年而已。冰在，我就在。」',tag:'+26好感 恋人羁绊',aff:26,fx:()=>{recruit(3);S.armor+=6;S.regen+=1;}},
     {t:'🚄 追随路线：「北方的雪我陪你一起看。」',tag:'+24好感',aff:24,fx:()=>{gainXp(70);S.hp=S.maxHp;}},
     {t:'💔 放手路线：「祝前程似锦，后会无期。」',tag:'-18好感 +渣男值',aff:-18,fx:()=>{S.scum=Math.min(100,S.scum+45);tip('🥶 她说"好"，书页被风撕了一角。');}}]},
   {text:'（雪落满肩，她轻声）"大家都说你渣。可我冰封了这么多年……只有你融得进来。"',choices:[
     {t:'💍 融冰路线：「那从今天起，你的冬天由我负责。」',tag:'+30好感 恋人圆满（全属性）',aff:30,fx:()=>{recruit(3);S.armor+=8;S.dmgMul*=1.2;S.pickR*=1.2;}},
     {t:'🌪️ 寒冬路线：「融化的冰，才最好骗。」',tag:'+60渣男值 +伤害翻倍',aff:-6,fx:()=>{S.scum=100;S.dmgMul*=1.4;spawnJealous(5);}}]}]},
// —— v65：女主扩编 4 位（g5~g8：校医/总裁/网球学妹/古风文艺） ——
 {name:'校医 · 白甜甜',col:0xffb3c6,hair:0x2a1a30,ribbon:0xffe0ea,face:'💉',
  gift:['润喉糖','创可贴','热可可'],
  stages:[
   {text:'（她踮着脚替你量体温）"又受伤了？你这样让我很担心的，知道吗。"',choices:[
     {t:'🩹 撒娇路线：「那医生要多照顾我一点呀。」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+40);}},
     {t:'😏 得寸进尺路线：「光照顾可不够，要负责到底。」',tag:'+渣男值',aff:-4,fx:()=>{S.scum=Math.min(100,S.scum+30);spawnJealous(2);}}]},
   {text:'"我熬了润肺汤……给别的同学也盛了一碗。"（她偷偷看你喝哪碗）',choices:[
     {t:'💝 专一路线：「我只喝你亲手盛的这碗。」',tag:'+20好感 结缘（持续回血）',aff:20,fx:()=>{recruit(4);}},
     {t:'🍵 直男路线：「哪碗都一样吧。」',tag:'-10好感',aff:-10,fx:()=>{tip(' :( 她默默端走了两碗汤…');}}]},
   {text:'"校医室的灯总是亮到很晚……你想不想知道我在等谁？"',choices:[
     {t:'🌙 心动路线：「等一个会为你关灯的人。」',tag:'+26好感 恋人达成（回血强化）',aff:26,fx:()=>{recruit(4);S.regen+=2;}}]}]},
 {name:'总裁 · 顾清梨',col:0xc9a86a,hair:0x1a1420,ribbon:0xe8c98a,face:'📋',
  gift:['手冲咖啡','股权文件','钢笔'],
  stages:[
   {text:'（她合上文件抬起眼）"上季度的账，和你昨晚的谎言，先解释哪个？"',choices:[
     {t:'💼 干练路线：「都不是问题，问题是您想听哪个版本。」',tag:'+12好感',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'😅 支吾路线：「那个……财务上的事说不清的。」',tag:'-8好感',aff:-8,fx:()=>{tip('📝 她在备忘录上记了一笔…');}}]},
   {text:'"我的时间按分钟计价。但你——我破例给了整个下午。"',choices:[
     {t:'⏳ 珍惜路线：「那我把一整颗心都排进日程。」',tag:'+20好感 结缘（金币加成）',aff:20,fx:()=>{recruit(5);}},
     {t:'🤑 贪心路线：「那顺便把工资也结算一下？」',tag:'+渣男值',aff:-6,fx:()=>{S.scum=Math.min(100,S.scum+35);}}]},
   {text:'"董事会问我，为什么对一个游戏角色这么认真。"（她笑了）',choices:[
     {t:'👑 共谋路线：「因为他们不知道，您认真起来有多迷人。」',tag:'+28好感 恋人达成（暴击提升）',aff:28,fx:()=>{recruit(5);S.dmgMul*=1.2;}}]}]},
 {name:'学妹 · 陈飞飞',col:0x8fd3ff,hair:0x3a2418,ribbon:0xffffff,face:'🎾',
  gift:['运动饮料','网球拍握把胶','能量棒'],
  stages:[
   {text:'（她把网球拍甩上肩）"学姐们说你很能跑？敢不敢和我比一场！"',choices:[
     {t:'⚡ 应战路线：「比就比，输的人答应对方一件事。」',tag:'+12好感 +移速',aff:12,fx:()=>{S.spd*=1.08;}},
     {t:'🤺 逗她路线：「我输了，你就得请我喝汽水。」',tag:'+10好感',aff:10,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+20);}}]},
   {text:'"我从小到大没输过……直到遇见你这种不讲武德的。"',choices:[
     {t:'🤝 拉拢路线：「那组队吧，双打冠军＋修罗场冠军。」',tag:'+20好感 结缘（攻速提升）',aff:20,fx:()=>{recruit(6);}},
     {t:'😌 凡尔赛路线：「习惯就好，我从来不讲武德。」',tag:'+渣男值',aff:-6,fx:()=>{S.scum=Math.min(100,S.scum+28);}}]},
   {text:'（她红着脸递上一瓶水）"喏，加量的。别、别多想！"',choices:[
     {t:'💗 心动路线：「想了。从你甩拍子那天就开始了。」',tag:'+28好感 恋人达成（移速+回血）',aff:28,fx:()=>{recruit(6);S.spd*=1.15;S.regen+=1;}}]}]},
 {name:'文艺 · 温砚秋',col:0xb8a9e8,hair:0x14101e,ribbon:0xd8ccff,face:'🪭',
  gift:['诗集','桂花酿','银杏书签'],
  stages:[
   {text:'（她摇着纸扇浅笑）"他们说你是渣男。我倒想亲自验证一下，流言可信几分。"',choices:[
     {t:'🖌️ 飅雅路线：「流言如墨，您是宣纸，一试便知。」',tag:'+12好感',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'🎭 坦荡路线：「渣男是真的，但对你可以例外。」',tag:'+渣男值 +好感',aff:4,fx:()=>{S.scum=Math.min(100,S.scum+20);}}]},
   {text:'"我写了半阕词，写你的部分——始终不敢落笔。"',choices:[
     {t:'📖 接笔路线：「那我替你写完：『愿逐月华流照君』。」',tag:'+20好感 结缘（经验加成）',aff:20,fx:()=>{recruit(7);}},
     {t:'🖊️ 狂草路线：「别写了，词牌名我都想好了——《渣男行》。」',tag:'+大量渣男值',aff:-8,fx:()=>{S.scum=Math.min(100,S.scum+45);}}]},
   {text:'"若我随你入这场修罗场……你可会护我这支笔？"',choices:[
     {t:'🖋️ 誓约路线：「笔在人在，砚秋所至，皆是坦途。」',tag:'+28好感 恋人达成（经验+碎片）',aff:28,fx:()=>{recruit(7);}}]}]},
];
const npcStage=[0,0,0,0,0,0,0,0];
const mates=[];
const npcs=[];
const affinity=[0,0,0,0,0,0,0,0];    // 好感度 0-100
const dates=[0,0,0,0,0,0,0,0];       // 已约会次数
const npcLoverDone=[false,false,false,false,false,false,false,false];
const AFF_MAX=100;
function affLevel(v){return v>=100?'❤️恋人':v>=70?'💗心动':v>=40?'💛暧昧':v>=15?'🤍熟悉':'🤍初识';}
function addAff(idx,v,src){affinity[idx]=Math.min(AFF_MAX,affinity[idx]+v);
  renderAff();if(src)tip(`${src}（好感 ${affinity[idx]}）`);}
function renderAff(){document.getElementById('affPanel').innerHTML=
  NPC_DEFS.map((d,i)=>({d,v:affinity[i],i})).filter(x=>x.v>0||mates.includes(x.i))
   .map(x=>`<div class="aff">${porTag(x.i,26)}<span class="affBar"><div style="width:${x.v}%"></div></span>`+
     `<span class="h">${affLevel(x.v)}</span></div>`).join('');}
function spawnJealous(n){for(let i=0;i<n;i++)mkEnemy('chaser');
  setTimeout(()=>tip('😠 谎言被戳穿！情敌们杀红了眼！'),600);}
// 女主配色补充：瞳色 / 肤色 / 长袜色（v29 写实化五官所需）
const NPC_SKIN=[
 {iris:0x7a4a28,skin:0xffd6b0,sock:0x2a1a30,lip:0xd05a72},
 {iris:0x4a2a5a,skin:0xf8c9a0,sock:0x1a1018,lip:0xb3324f},
 {iris:0x8a5a20,skin:0xffd9b4,sock:0xfff2e0,lip:0xe0707f},
 {iris:0x2a6a9a,skin:0xf2bf96,sock:0x14202a,lip:0xc4526a},
 {iris:0x5a3a28,skin:0xffdcc0,sock:0xfff6f2,lip:0xe0707f},
 {iris:0x3a2a1a,skin:0xf6d0ae,sock:0x2a2018,lip:0xc05a6a},
 {iris:0x6a4a20,skin:0xf8d8b8,sock:0xffffff,lip:0xd86070},
 {iris:0x2a2a3a,skin:0xffd8b6,sock:0xd8ccff,lip:0xc85a78},
];
// —— v58：面部贴面（Face Card）——
// 把 AI 立绘的真实脸部沿头壳曲面贴合到可行走人物头上：
// 远看/近看脸就是立绘那张脸；转头、点头、发丝全部照常。对话立绘与实机人物从此"对得上"。
const FACE_CARD_VERT=`
varying vec2 vUv2;varying vec3 vN2;
void main(){vUv2=uv;vN2=normalize(normalMatrix*normal);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const FACE_CARD_FRAG=`
uniform sampler2D uAtlas;uniform float uIdx;uniform float uPow;
varying vec2 vUv2;varying vec3 vN2;
void main(){
  // v59b：贴片网格已收窄成脸型（宽随高度变化），遮罩只需裁圆角 + 轻羽化，
  // 完整保留照片中的脸（含下巴）—— 之前的强椭圆把下半脸裁掉了。
  vec2 d=(vUv2-vec2(0.5,0.5))*2.0;
  float r=length(d);
  float a=1.0-smoothstep(1.02,1.30,r);
  // 侧缘随法线背向淡出（转到侧脸自然消失，无面具边）
  float face=float(vN2.z);
  a*=smoothstep(-0.05,0.42,face);
  vec2 uv=vec2((uIdx+clamp(vUv2.x,0.0,1.0))*(1.0/5.0), vUv2.y);
  vec4 col=texture2D(uAtlas,uv);
  if(a<0.012)discard;
  gl_FragColor=vec4(col.rgb,a);
}`;
// v58：FACE_CARD 惰性初始化 —— FACE_CARD_B64 注入点在本块之后（跨块时序），
// 顶层立即执行会在 TDZ 前取到 undefined，故延后到首次 mkGirl 时再建纹理
let FACE_CARD=null;
function initFaceCard(){
  if(FACE_CARD)return FACE_CARD;
  if(typeof FACE_CARD_B64==='undefined')return null;
  const t=new THREE.Texture();
  const im=new Image();im.onload=()=>{t.image=im;t.needsUpdate=true;};im.src=FACE_CARD_B64;
  t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;
  FACE_CARD=t;return t;}
const _faceCardMats={};
function faceCardMat(idx){
  initFaceCard();
  if(!FACE_CARD)return null;
  if(_faceCardMats[idx])return _faceCardMats[idx];
  const m=new THREE.ShaderMaterial({uniforms:{uAtlas:{value:FACE_CARD},uIdx:{value:idx},uPow:{value:1}},
    vertexShader:FACE_CARD_VERT,fragmentShader:FACE_CARD_FRAG,
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  _faceCardMats[idx]=m;return m;}
// 沿头壳轮廓生成贴面网格（faceSurface 保证贴合，不悬浮不陷入）
function buildFaceCard(idx){
  const mat=faceCardMat(idx);if(!mat)return null;  const N=18,geo=new THREE.BufferGeometry(),pos=[],uv=[],idxs=[];
  // v59：收窄到"脸"的范围 —— 上缘到发际线下方（.135，不再顶到脑门），
  // 下缘到下巴（-.175），左右 ±.20（不包住鬓角与耳）。配合 shader 椭圆遮罩，避免"头盔感"。
  // v59c：贴满"脸区"—— 覆盖从发际到下巴的整个前脸，不留大片空白头壳
  const yTop=.175,yBot=-.245,xHalf=.30;
  for(let r=0;r<=N;r++){
    const v=r/N,y=yTop+(yBot-yTop)*v;
    // 随高度变化半宽：额头略窄、颧骨处最宽、下颌收窄 —— 让网格本身就有脸型
    const t=(y-yBot)/(yTop-yBot);          // 0=下巴 1=额
    const wf=.78+.30*Math.sin(Math.PI*Math.min(1,Math.max(0,t*1.12)));  // 中段最宽
    const hw=xHalf*wf;
    for(let c2=0;c2<=N;c2++){
      const u=c2/N,x=(u-.5)*2*hw;
      const z=faceSurface(x,y)+.010;   // 头壳表面 + 外扩（容差加大，防 z-fighting）
      pos.push(x,y,z);uv.push(u,1-v);
    }}
  for(let r=0;r<N;r++)for(let c2=0;c2<N;c2++){
    const a=r*(N+1)+c2,b=a+1,c3=a+N+1,d2=c3+1;
    idxs.push(a,c3,b,b,c3,d2);}
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idxs);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,mat);
  mesh.userData.faceCard=true;
  return mesh;}

// ================= v60：真人头部（Real Head）=================
// 用户诉求：人物头像不要再和原卡通头壳"贴"在一起（对不正），整颗头直接用真人头像。
// 做法：一颗独立的「真人头组」——
//   ① 皮肤头壳（椭球）承载面部贴片，贴片铺满正面并自然收边；
//   ② 发帽 = 用立绘顶部区域裁出的贴图（HarTop）包住头壳上部 —— 真人发丝质感；
//      发帽之外再用同色"发层"包住后脑/两侧，脑后挂一片真人发丝贴片；
//   ③ 头壳四角用肤色过渡，避免"照片方块飘在脸上"。
// 原卡通头壳 / 五官 / 发片 / 发带全部隐藏，仅保留表情骨架做情绪（驱动 HUD 等逻辑）。
const HEAD_HAIR_COL=[0x6d534b,0x2d262f,0xc67b32,0x344351,0x1c1719]; // 由立绘顶部区域采样得出
const _hairTexCache={};
// v60b：程序化发丝纹理 —— 底色=立绘采样发色，竖向明暗细线模拟发丝，顶部加高光。
// 不再用立绘照片裁贴图（会把脸部区域带进发帽，出现"眼睛条纹"）。
function hairTopTex(idx){
  if(_hairTexCache[idx])return _hairTexCache[idx];
  const base=new THREE.Color(HEAD_HAIR_COL[idx%HEAD_HAIR_COL.length]);
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#'+base.getHexString();g.fillRect(0,0,256,256);
  // 竖向发丝：80 条细密明暗线（低对比，避免"编织帽"感）
  for(let i=0;i<80;i++){
    const x=Math.random()*256,w=.6+Math.random()*1.1;
    const l=.5+(Math.random()-.5)*.18;
    g.strokeStyle='rgba('+(l>.5?'255,255,255':'0,0,0')+','+(Math.abs(l-.5)*.4).toFixed(3)+')';
    g.lineWidth=w;g.beginPath();
    let xx=x;g.moveTo(xx,0);
    for(let y=0;y<=256;y+=32){xx=x+Math.sin(y*.02+i)*7;g.lineTo(xx,y);}
    g.stroke();}
  // 顶部高光（天使环氛围）
  const rg=g.createLinearGradient(0,0,0,120);
  rg.addColorStop(0,'rgba(255,255,255,.22)');rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=rg;g.fillRect(0,0,256,120);
  const ht=new THREE.CanvasTexture(c);
  _hairTexCache[idx]=ht;return ht;}

// 面部贴片（真人模式）：网格铺满正面 + 在椭球上定位，法线朝外
const REAL_FACE_VERT=`
uniform vec3 uC;uniform float uRX,uRY,uRZ;
varying vec2 vUv2;varying vec3 vN2;
void main(){
  // v60c：改用普通平面定位（position 直通）—— 自定义椭球定位调试成本过高。
  // 平面由 JS 端 position/scale 定到脸区，UV 直通照片。
  vN2=normalize(normalMatrix*vec3(0.0,0.0,1.0));
  vUv2=uv;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const REAL_FACE_FRAG=`
uniform sampler2D uAtlas;uniform float uIdx;uniform vec3 uEdge;
uniform vec2 uScale2;   // 平面半宽/半高（用于把"方框边界"换算成真实距离）
varying vec2 vUv2;varying vec3 vN2;
void main(){
  vec2 uv=vec2((uIdx+vUv2.x)*(1.0/5.0), vUv2.y);
  vec4 col=texture2D(uAtlas,uv);
  // v61：椭圆脸型遮罩 —— 不再是矩形照片。d 归一化后按椭圆半径衰减，
  // 脸缘 0.78 之外开始羽化、1.0 完全消失，因此永远看不到"方框四条边"。
  vec2 d=vec2((vUv2.x-0.5)*2.0,(vUv2.y-0.5)*2.0);
  // 上窄下宽的脸型：额头略收、下巴再收，中间（颧骨）最宽
  float yy=vUv2.y;                        // 0=下巴 1=额顶
  float wf=0.90+0.12*sin(clamp(yy,0.0,1.0)*3.14159);  // 中段最宽
  float r=length(vec2(d.x/wf, d.y/1.04));
  float a=1.0-smoothstep(0.74,0.99,r);
  // 侧脸随法线背向淡出（转头自然，无面具边）
  a*=smoothstep(-0.02,0.34,vN2.z);
  if(a<0.008)discard;
  // 过渡区颜色推向肤色：立绘深色底不会在脸缘形成"月晕"
  vec3 body=mix(uEdge,col.rgb,smoothstep(0.10,0.62,a));
  gl_FragColor=vec4(body,a);}`;
function realFaceMat(idx,skinCol){
  const key='rf'+idx;
  if(_faceCardMats[key])return _faceCardMats[key];
  const t=initFaceCard();if(!t)return null;
  const c=new THREE.Color(skinCol||0xffd9b8);
  const m=new THREE.ShaderMaterial({
    uniforms:{uAtlas:{value:t},uIdx:{value:idx},uEdge:{value:c},
      uRX:{value:.352},uRY:{value:.393},uRZ:{value:.362},uScale2:{value:new THREE.Vector2(.33,.36)}},
    vertexShader:REAL_FACE_VERT,fragmentShader:REAL_FACE_FRAG,
    transparent:true,depthWrite:false,depthTest:false,
    polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  _faceCardMats[key]=m;return m;}

// 构建真人头：返回 {group, faceCard, hat, hairBack}
// v61 结构重做：
//   ① 头壳 = 「头 + 下颌 + 颈」一体化旋转体（颅顶到底座颈根连续，无断口、无底部椭圆）
//   ② 脸 = 椭圆遮罩照片（贴到一体化头壳正面，边缘羽化到肤色，看不到方框）
//   ③ 发帽 + 后脑发层 + 脑后发束
//   ④ 领口补片：盖住 3D 颈部残端与真人颈的接缝
function buildRealHead(idx,opts){
  opts=opts||{};
  const skinCol=opts.skin===undefined?0xffd9b8:opts.skin;
  const hairCol=HEAD_HAIR_COL[idx%HEAD_HAIR_COL.length];
  const grp=new THREE.Group();
  const RX=.335,RY=.375,RZ=.345;
  const skinMat2=new THREE.MeshToonMaterial({color:skinCol,gradientMap:GRAD_FIG});
  skinMat2.emissive=new THREE.Color(skinCol).multiplyScalar(.16);
  // ① 一体化头颈轮廓（旋转体，自下而上：颈根 → 颈 → 下颌 → 颧 → 颅顶）
  //    颈部半径 .148 与 3D 颈部（±.082~.118 × headAmp）自然衔接，形成连续的颈线。
  const NECK_PROF=[[.001,-.60],[.150,-.56],[.146,-.42],[.140,-.26],[.146,-.14],
    [.178,-.055],[.238,.020],[.292,.090],[.330,.165],[.352,.245],
    [.360,.330],[.352,.415],[.320,.492],[.252,.560],[.140,.604],[.001,.618]];
  const bodyProf=NECK_PROF.slice().reverse().map(p=>new THREE.Vector2(Math.max(.001,p[0]),p[1]));
  const bodyGeo=new THREE.LatheGeometry(bodyProf,32);
  { const p=bodyGeo.attributes.position;
    for(let i=0;i<p.count;i++){
      let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(y<-.02){x*=1.10;z*=1.06;}      // 颈部略加粗，避免"细棍"
      if(y>-.10){z*= y>0? .99:1.02;}     // 前脸略饱满
      if(z<0)z*=1.045;                   // 后脑略鼓
      p.setXYZ(i,x,y,z);}
    p.needsUpdate=true;bodyGeo.computeVertexNormals();}
  const body=new THREE.Mesh(bodyGeo,skinMat2);
  body.scale.set(RX/.360,1,RZ/.360);   // 归一到与旧头壳同宽
  body.position.y=-.02;
  body.userData.noOutline=true;grp.add(body);
  // ② 面部照片（椭圆遮罩）
  const fm=realFaceMat(idx,skinCol);
  if(fm){
    const fg=new THREE.PlaneGeometry(1,1,32,32);
    const fc=new THREE.Mesh(fg,fm);
    fc.userData.noOutline=true;fc.renderOrder=3;
    fc.frustumCulled=false;
    fc.position.set(0,.020,.352);fc.scale.set(.665,.755,1);
    grp.add(fc);
    grp.userData.faceCard=fc;
  }
  // ③ 发帽（从头顶包到眉上，前额切线）——覆盖整个头顶，不再露出头壳
  const ht=hairTopTex(idx);
  const hairMat2=new THREE.MeshToonMaterial({color:0xffffff,gradientMap:GRAD_FIG});
  if(ht){hairMat2.map=ht;hairMat2.color.set(0xffffff);}
  else{hairMat2.color.set(hairCol);}
  hairMat2.side=THREE.DoubleSide;
  const capG=new THREE.SphereGeometry(1,32,22,0,Math.PI*2,0,Math.PI*.42);
  const cap=new THREE.Mesh(capG,hairMat2);
  cap.scale.set(RX*1.055,RY*1.045,RZ*1.055);cap.position.set(0,.055,-.014);
  cap.userData.noOutline=true;grp.add(cap);
  // ④ 后脑/两侧发层
  const backMat=new THREE.MeshToonMaterial({color:hairCol,gradientMap:GRAD_FIG});
  backMat.emissive=new THREE.Color(hairCol).multiplyScalar(.20);backMat.side=THREE.DoubleSide;
  const backCap=new THREE.Mesh(new THREE.SphereGeometry(1,26,18,0,Math.PI*2,Math.PI*.28,Math.PI*.50),backMat);
  backCap.scale.set(RX*1.035,RY*1.025,RZ*1.035);backCap.position.z=-.024;
  backCap.userData.noOutline=true;grp.add(backCap);
  // ⑤ 脑后发束
  if(opts.long!==false){
    const tailMat=new THREE.MeshToonMaterial({color:hairCol,gradientMap:GRAD_FIG});
    if(ht){tailMat.map=ht;tailMat.color.set(0xffffff);}
    tailMat.side=THREE.DoubleSide;
    const tl=new THREE.Mesh(new THREE.PlaneGeometry(1,1,10,12),tailMat);
    const tp=tl.geometry.attributes.position;
    for(let i=0;i<tp.count;i++){
      const x=tp.getX(i),y=tp.getY(i),t=(0.5-y);
      tp.setX(i,x*(1-.40*t));tp.setZ(i,-.14*t*t);
    }
    tp.needsUpdate=true;tl.geometry.computeVertexNormals();
    tl.scale.set(.60,.78,1);tl.position.set(0,-.50,-.29);
    tl.userData.noOutline=true;grp.add(tl);
  }
  return {group:grp,hat:cap,hairBack:backCap,faceCard:grp.userData.faceCard};}

// 把真人头装到人物身上：隐藏原头壳/五官/发片/发带，挂上真人头组
function attachRealHead(j,idx,opts){
  const r=buildRealHead(idx,opts);
  if(!r)return null;
  // v62：头组缩到与缩短后的头壳同尺寸（7 头身），并整体下压使颈根埋进 3D 颈部
  r.group.scale.setScalar(.86);
  r.group.position.y=-.055;
  j.head.add(r.group);
  j.realHead=r;
  j.faceCard=r.faceCard;
  // 颈-肩过渡：补一片"斜方肌+颈根"锥台，盖住 3D 颈部残端与真人颈的接缝，
  // 让头、颈、肩连成一条顺滑曲线（不再出现"头浮在脖子上"的断口）。
  const skinCol=(opts&&opts.skin!==undefined)?opts.skin:0xffd9b8;
  const blendMat=new THREE.MeshToonMaterial({color:new THREE.Color(skinCol).multiplyScalar(.97),gradientMap:GRAD_FIG});
  blendMat.emissive=new THREE.Color(skinCol).multiplyScalar(.10);
  const blend=new THREE.Mesh(new THREE.LatheGeometry(
    [[.001,-.30],[.150,-.29],[.152,-.18],[.170,-.09],[.205,-.02],[.255,.03],[.001,.045]]
      .map(p=>new THREE.Vector2(Math.max(.001,p[0]),p[1])),24),blendMat);
  blend.position.y=.10;           // 相对真人头组（头中心），覆盖颈根到肩
  blend.userData.noOutline=true;
  r.group.add(blend);
  r.neckBlend=blend;
  // 隐藏卡通头壳（head 的直属 Mesh，排除真人头组）
  j.head.children.forEach(o=>{
    if(o===r.group)return;
    if(o.isMesh)o.visible=false;
  });
  // v60b：耳环重定位到真人头壳表面（原坐标按卡通头壳算，会嵌进真人头里）
  j.head.children.forEach(o=>{
    if(o!==r.group&&!o.isMesh&&o.type==='Group'){
      let isEr=false;for(const c2 of o.children)if(c2.isMesh&&c2.geometry&&c2.geometry.type==='TorusGeometry')isEr=true;
      if(isEr){o.position.set(o.position.x>0?.282:-.282,-.045,.24);}
    }
  });
  if(j.face&&j.face.group)j.face.group.visible=false;
  if(j.hair)j.hair.visible=false;
  if(j.ribbon)j.ribbon.visible=false;
  return r;}


function mkGirl(def){
  const idx=Math.max(0,NPC_DEFS.indexOf(def));
  const ex=NPC_SKIN[idx%NPC_SKIN.length];
  const f=mkFigure({top:def.col,bottom:def.col,trim:def.ribbon,hair:def.hair,skin:ex.skin,
    iris:ex.iris,lip:ex.lip,sock:ex.sock,ribbon:def.ribbon,female:true,det:2,style:'long',
    bulk:.96,scale:.9,armCol:'top',outline:true,outlineCol:0x2a1430});
  const g=f.g,j=f.j;
  // 发饰：蝴蝶结（双瓣）
  const bowM=clothMat(def.ribbon,.35);
  const bow=new THREE.Group();
  for(const s of[-1,1]){const w=new THREE.Mesh(sph(.062,10,8),bowM);w.scale.set(1,.72,.42);
    w.position.set(.062*s,0,.01);w.rotation.z=.35*s;bow.add(w);}
  const kn=new THREE.Mesh(sph(.026,8,8),bowM);bow.add(kn);
  bow.position.set(.30,.26,.14);bow.rotation.z=-.3;j.hair.add(bow);
  j.ribbon=bow;j.bow=bow;
  f.mats.push(bowM);
  // v60：整颗头换成真人头（不再把照片"贴"在卡通头壳上，避免对不准）
  if(initFaceCard()){
    attachRealHead(j,idx,{skin:ex.skin,long:true});
    // 发饰蝴蝶结（保留：耳侧小饰品，挂在真人头组上）
    bow.position.set(.30,.11,-.02);
    const rh=j.realHead&&j.realHead.group;
    if(rh){j.hair.remove(bow);rh.add(bow);}
  }
  // v63/v64：女主整体替换为全身数字人（4 位女主 g1~g4，DH2_API 免 TDZ）
  if(typeof DH2_API!=='undefined'&&DH2_API.ready()){
    DH2_API.attach(g,'g'+(idx+1),1.62);
  }
  return{g,j,face:j.face};}
// v60：男主整颗头也换成真人头（图集第 5 格 idx=4）。
// FACE_CARD_B64 注入点在后续 script 块（跨块时序），此处轮询重试直到图集可用。
(function(){let n=0;(function tryMount(){
  try{
    if(typeof attachRealHead==='function'&&typeof heroFig!=='undefined'&&heroFig&&heroFig.j&&!heroFig.j.realHead){
      attachRealHead(heroFig.j,4,{skin:0xffdcbc,long:false});
      return;}
  }catch(e){}
  if(++n<40)setTimeout(tryMount,300);})();})();
// 邂逅改为循环事件：每30秒随机一位女主出现（好感越高冷却越短）
let npcCd=[30,36,42,48,34,40,36,44];
let npcTimer=14;
function trySpawnNpc(){if(npcs.length||dlgActive)return;
  // 已结缘（恋人未满）的女主仍可约会升温
  const pool=NPC_DEFS.map((_,i)=>i).filter(i=>npcCd[i]<=0);
  if(!pool.length)return;
  const idx=pool[Math.floor(Math.random()*pool.length)];
  spawnNpc(idx);npcCd[idx]=affinity[idx]>=60?18:30;}
function spawnNpc(idx){
  // 清掉同一位残留的NPC，避免堆积
  for(let i=npcs.length-1;i>=0;i--)if(npcs[i].userData.idx===idx)scene.remove(npcs[i]),npcs.splice(i,1);
  const def=NPC_DEFS[idx];const h=mkGirl(def);const g=h.g;
  if(mates.includes(idx))g.scale.multiplyScalar(.85); // 已结缘再会出现为"约会状态"
  const a=Math.random()*7;
  g.position.set(player.position.x+Math.cos(a)*7,0,player.position.z+Math.sin(a)*7);
  const L=Math.hypot(g.position.x,g.position.z);if(L>ARENA-3)g.position.multiplyScalar((ARENA-3)/L);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.6,.85,24),
    new THREE.MeshBasicMaterial({color:0xffd60a,transparent:true,opacity:.7,side:THREE.DoubleSide}));
  halo.rotation.x=-Math.PI/2;halo.position.y=.08;g.add(halo);
  g.userData={def,idx,j:h.j};
  scene.add(g);npcs.push(g);
  tip(`💗 心动邂逅：${def.name} 出现在附近！靠近她！`);sfx.lvl();}
// 伙伴跟随者
const followers=[];
function recruit(idx){const def=NPC_DEFS[idx];
  if(mates.includes(idx))return;mates.push(idx);
  const h=mkGirl(def);const f=h.g;f.scale.multiplyScalar(.8);scene.add(f);
  followers.push({g:f,j:h.j,idx});renderMates();
  tip(`💕 结缘成功！${def.name} 并肩作战！`);sfx.evo();
  if(idx===0)S.regen+=1.5;
  if(idx===1)S.dmgMul*=1.25;
  if(idx===2){S.spd*=1.15;S.pickR*=1.5;}
  if(idx===3)S.armor+=6,S.dmgMul*=1.1;
  if(idx===4)S.regen+=1.2;                       // 校医：持续回血
  if(idx===5)S.scumMul=(S.scumMul||1)*1.0,S.gainMul=(S.gainMul||1)*1.2; // 总裁：收益加成
  if(idx===6)S.dmgMul*=1.12,S.spd*=1.05;         // 学妹：攻速移速
  if(idx===7){S.xpMul=(S.xpMul||1)*1.25;}        // 文艺：经验加成
  burst(f.position,0xffd60a,24,9);}
function renderMates(){document.getElementById('mates').innerHTML=
  mates.map(i=>`<div class="mate" data-i="${i}">${porTag(i,34,'',`border-radius:50%;border-width:2px;`)}</div>`).join('');}
function mateAtkFx(idx){const el=document.querySelector(`#mates .mate[data-i="${idx}"]`);
  if(!el)return;el.classList.remove('atk');void el.offsetWidth;el.classList.add('atk');}
// 对话（含好感度结算）
let dlgActive=false,dialogueSpeaker=null;

// ============ v46 · 情感剧情深化：抉择痕迹系统 ============
// 设计目标：此前 8 段剧情 × 每段 2-3 选项，选完就消失，玩家感受不到「我做过选择」。
// v46 给每个选项打上**倾向标签**，选完后累积成三种人格倾向，并在后续剧情中**可见地生效**：
//   · 真心（sincere）—— 选坦白/成全/守候 → 提高恋人质量、降低情敌
//   · 渣术（player）—— 选撒满/摊牌/纵欲 → 提高伤害与渣男值、增加情敌
//   · 圆滑（slick）  —— 选圆谎/逃避/敷衍 → 提高收益（碎片/心币）但埋下隐患
// 倾向不只是数字，还会：① 改变结局文案；② 解锁专属结局称号；③ 影响 NPC 说话的语气。
const ALIGN_DEF={
  sincere:{n:'真心',ic:'🕊️',col:'#7fd4ff',d:'她记得你说过的每一句话'},
  player: {n:'渣术',ic:'😈',col:'#ff4d6d',d:'你记得自己说过的每一句谎'},
  slick:  {n:'圆滑',ic:'🎭',col:'#c77dff',d:'谁都没记住，除了你自己'},
};
function alignOf(){return (SAVE.align=SAVE.align||{sincere:0,player:0,slick:0});}
function alignAdd(k,v){
  const a=alignOf();if(!a[k])a[k]=0;
  a[k]=(a[k]||0)+v;writeSave();}
function alignTop(){
  const a=alignOf();let best='sincere',bv=-1;
  for(const k of ['sincere','player','slick'])if((a[k]||0)>bv){bv=a[k]||0;best=k;}
  return bv<=0?null:best;
}
function alignScore(k){return alignOf()[k]||0;}

// 抉择痕迹：每次选择都记档（按 npc 索引 + 阶段），供后续剧情引用
function traceChoice(idx,si,ci,label){
  const T=(SAVE.traces=SAVE.traces||{});
  const key=idx+':'+si;
  T[key]={ci:ci,label:label||'',t:Date.now()};
  writeSave();
}
function getTrace(idx,si){const T=SAVE.traces||{};return T[idx+':'+si]||null;}
// 对话面板内的倾向条（让玩家随时看到「我正在成为什么样的人」）
function renderDlgAlign(){
  const el=document.getElementById('dlgAlign');if(!el)return;
  const a=alignOf();
  const mx=Math.max(4,a.sincere||0,a.player||0,a.slick||0);
  const dom=alignDominant();
  el.innerHTML=Object.keys(ALIGN_DEF).map(k=>{
    const d=ALIGN_DEF[k],v=a[k]||0;
    const on=dom===k;
    return `<div class="al" title="${d.d}">
      <div class="ab"><i style="width:${Math.round(v/mx*100)}%;background:${d.col};box-shadow:0 0 8px ${d.col}"></i></div>
      <span style="color:${on?d.col:'#7a6a92'};font-weight:${on?'bold':'normal'}">${d.ic}${d.n} ${v}</span></div>`;
  }).join('');
}
function traceCount(){return Object.keys(SAVE.traces||{}).length;}

// 倾向推断：按选项文案里的关键词判定（无需改动 30+ 条既有剧情数据）
// 优先级：先判渣术（最强否定词），再判真心（承诺词），最后兜底圆滑（回避词）
const _ALIGN_KW={
  player:['渣男值','摊牌','腹黑','撒死','撒谎','敷衍','冷酷','放手','修罗','纵欲','占有','海王','双开'],
  sincere:['坦白','真诚','成全','守候','温柔','一生','发誓','只有你','一起','真心','圆谎'],
  slick:['圆滑','逃避','回避','再说','半信','打听','打听','情报'],
};
function alignOfChoice(text){
  const t=String(text||'');
  // 渣术：明确带「渣男值」或强负面词
  for(const k of _ALIGN_KW.player)if(t.includes(k))return 'player';
  for(const k of _ALIGN_KW.sincere)if(t.includes(k))return 'sincere';
  for(const k of _ALIGN_KW.slick)if(t.includes(k))return 'slick';
  return 'slick'; // 兜底：不表态的一律算圆滑
}
// 倾向加权：一次选择给对应倾向 +1，给的对立倾向 -0（不做负值，避免玩家被「扣分」挫败）
function recordAlign(text){alignAdd(alignOfChoice(text),1);}

// 好感度变化浮层（视觉反馈：+20 / -8）
let affFlashEl=null;
function affFlash(v){
  if(!affFlashEl){affFlashEl=document.createElement('div');affFlashEl.className='affFlash';
    document.body.appendChild(affFlashEl);}
  if(!v)return;
  const up=v>0;
  affFlashEl.textContent=(up?'❤️ +':'💔 ')+Math.abs(v)+' 好感';
  affFlashEl.style.color=up?'#ff8fa3':'#8ab4ff';
  affFlashEl.classList.remove('run');void affFlashEl.offsetWidth;
  affFlashEl.classList.add('run');
}

// 女主动态立绘（Canvas 程序化表情） ----------
// 每阶段一个表情：0疑惑 1心动 2害羞 3质问 4误会 5期待 6落泪 7圆满（循环取模）
const FACE_MOODS=[
 {tag:'🤨 疑惑',bg:'#5a3a6e',mouth:'flat',brows:'up',tears:0,blush:0},
 {tag:'😳 心动',bg:'#6e3a5a',mouth:'smile',brows:'soft',tears:0,blush:.5},
 {tag:'😊 害羞',bg:'#7a3a52',mouth:'smile2',brows:'soft',tears:0,blush:.9},
 {tag:'😠 质问',bg:'#5a2a3a',mouth:'angry',brows:'angry',tears:0,blush:0},
 {tag:'😢 委屈',bg:'#3a3a5a',mouth:'sad',brows:'sad',tears:.6,blush:.3},
 {tag:'🥺 期待',bg:'#5a4a6e',mouth:'small',brows:'up',tears:0,blush:.6},
 {tag:'😭 落泪',bg:'#2e3a5a',mouth:'sad2',brows:'sad',tears:1,blush:.2},
 {tag:'❤️ 圆满',bg:'#6e2a4e',mouth:'bigsmile',brows:'soft',tears:.3,blush:1},
];
/* v55:AI 真人感立绘（ImageGen 生成，仅对话头像用） */
const NPC_PORTRAITS=["data:image/jpeg;base64,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","data:image/jpeg;base64,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","data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgFBgcGBQgHBgcJCAgJDBMMDAsLDBgREg4THBgdHRsYGxofIywlHyEqIRobJjQnKi4vMTIxHiU2OjYwOiwwMTD/2wBDAQgJCQwKDBcMDBcwIBsgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDD/wAARCAGAAYADASIAAhEBAxEB/8QAHAAAAQUBAQEAAAAAAAAAAAAABQECAwQGAAcI/8QAQRAAAgEDAgQDBgQFAwMDBAMAAQIDAAQREiEFMUFRE2FxBiIygZGhFEKxwSNS0eHwBxXxM2JyJIKSFiU0Q1Oisv/EABoBAAIDAQEAAAAAAAAAAAAAAAIDAAEEBQb/xAAsEQACAgICAgICAgEDBQAAAAAAAQIRAyESMQRBIlETYTJxgRQjQpGhsdHh/9oADAMBAAIRAxEAPwCiurJOTz71KrN/M31qIVIn2ryZ7CiZS3c/WpFLdz9aYo704bUuRdEgLdz9adqYfmP1pox0pRvQEocGb+Y/Wngt3P1poAFPAqm3ZTQoY9CfrTwx7n60wbUookq7JSQ/Ue5+tKGbufrTQKeKjkQXJ7muBPc/WuAzSgb70HJkO1HufrXam7n60oA6V2KnIsQFu5x60u/c0uK4ChshwJHU0oz3P1pMedOI2zUsqjsnufrSZPc0p+EfOkOOtQguT3P1rst3+9IN+tdtUslC5Pc1xJ7mkHlvXb71LKFye5+tJv3NcM11TZKEy3c/Wu1HufrXUnWoXxObUep+tMyw6n606uxtUUmiDQzdz9a7J7n60tIRVqRKsaSe5pjE9zUhFMbPWiRKojLHufrTSzDqfrT2FMNWnRNHFyepqMs2diaXnnakq/6JSG5PRiPnTCzdz9acdqa1WmyUMYt3P1qN9Xc/WpCDTCM0xEogct3P1qJ9X8x+tWGHOomWjT9AUVn1b+831qBywPxH61akFVpBvRoFoKDmc0+MVyrufWpFGBWduuh45akFNUYFPUb8qVZRw8qeorgvenjyqm/RLFAFOpByp4FVdFCAYO9OG1djNOVTVtkr7EAJp4HeuAzTgKAh1dyPelAxXVVl0dXcqXelAqFnU5sHGO1cq7gHYGlOBkEHY9qsGxmKfjKgZ37UmRjPvY9KcJETdmXccjtRJAtjSm2xyRTNum/7VKw0nAxucZBz86YAVLds9qlE5CKoHPNIxC8znyFczNjKbg+XOqtzdpbkqrKGHxO3Jf71ajZVlgsR00jzrgxLDAZvShov0J/hBXI/O+T+36U5b+ZiPdiKkjH8NsH50z8bJYSbKucxkDPltS75wQaoi6u85EJYHfMa/tzqVbrUQp0qx5K2VOfLPOhcGkRMsEUmK4MxA1RkeYPOu1eoP/dS9l2Idq7rTj5ikqv7LsTrSEZpcVwqUWMINIRnnUlIRmonRCBlxTGXtU5qJh2FMuyyIjBprL2qUjNMOxqddA9dERpjbVKwqMjfFGtl6ZGwz602pCKSjQRGQDUbLUxFMYdKl0CVpF23qtItXJB2qu4pqYLQRAyTUir9a5RuQKeox61lYwUAU8DekUdakUUJDgKcFpyrttTgN6EEQAU4DNKACNxTgO9SyzgKUClAp2NqFsjEpcbV2KXAqiCU4A0oFLjFQoQDIpQu+5p6kKG81xTWbQuT+tXQNi4wM1FJOkezOreR2J/rUMkzsGGl/IA4HzNUbnicFoG1uuoHcQgMw9SabHG2U2EVutWywuD0J2qT8Q/h+8Ixg9WrF33tPGS/hxlyvLXJqz9NqG/79cuHdEwqlSBGmOvLbbFbYeJN+hMs0InoDTRf9SUxcs5U4weVRT3kLysEdACxOGO+PWvPRxCaazDtctCQMM53wfebB8yB9qr293PJpzIXMjAAtzjB5nyp68P7Yn/UK9Gx4t7QRwK0dtNpc7auvy7etZ+Tj9vAfciWeUnJJznPr+9A72Vi8hUBiT7zA4A7VQLMRlj7vQA8zWiPixihcvJfo0je0l24bEngRqfgj2JB+lMi9oLw7NfsuRjBnx9zQCNWNtcsWYDSo5jHxDb7VFHAMg5x88Gj/DD6FPPI1lt7RTZ0pJ4hJ5q+pj8sb0Yj42SPCujEXxkxv7h+hyKwm4dhEDpPIawDjz3pVBA0tG5XHM5OP88qCWCD6GRzS9npdvxHS4WEsrncQzZGf/Fv7mi0F2LlScOMbMrDdf7V5XbX08CAQN4keQTG24Py/wCDR3hntIqMpU6H2BjLE4HbJ/z1rHl8V9o1Qyxembz3ce6wx1xSAZ371XsL2O7txJAwPcAg4NW0HiMAgyWIAArmyTTofYwjFdRaPh0HiQwSyMskx0qy74PcjtVK8tZbK5e3uFw6n5EdxVOLSsGGSMnSK2POkPKpCM00jvQWNI2GajI71KRTSM0SZZEV7VGw2qcrimkDtVoorkd6ayn5VOR3FNK+tHe9FdbICKTSDUpXfekIxV3RH+iEr9KYy1ORUbDtRp2VZVkWoHWrci1XcDI7mmRZbCQG575pyg9K4Dc1Iq0ig0cq8qkUUgGakC0Mn6RGhVG3KngVyingYoARoGacFpRTsVCWNxSgeVKKcBiqv0iCaa7G9OAyKUDAoSuhOdKABzpdsc6UrpG/PmfKrKbG5Uczgd6oyFpwx2jiHNts/XpVqUqQS59xe/LPnWP9ouNtPcfhLM6FbnIRuw9OgrVhxOT0C5UrH8c49DbI0VmA7D82cgf1NZOe8u7wzOpaWXw9lVd8ZAOB6VX4hc+OJGY+8SBHjG+NjkAf551RjJDEsSARhiNiB6/Q13MGCMEc3NmbdIjkunf8ugd8AEVAWkVHXXpVwMgN7vkcVNJbyTGRy6MVGss5ALDuCcE/c1WACvpIIIOCB961GB2+wzwu3e94pFw5GyGId2GwfIGcnpsSPpRW/gVZZVtlPgIHb3T7wVSVyfUnkOlBeHSvYTrcxZyoyWI37YHnjNaJGin9n1kEKGVvfZi+nRvzP8xOPsaVLTHQZnQ6TOAVUAZPP3QOpPeoJZFkc+Ehc8sAe6o7ZpbtQySLF4krE+++2G5Hb1OM9sVSiGPenkwg5BTsT2py0gG7ei28c624USfE2souBtyHX1qv4M2kuucg6eRJ+lTrLq+Fz6asY+1WYg3gOVmySyj38Y6k9qp/oi2UU1g4DEkdNh9jUsd+V2ZmyBjB6VJJamQbAKw7HY+lVWkm+F4xkHkT9s1Tpl24hSCUSYIcAjl5ntV1Y0l92aEtIBuF2+fPOfoKC2rlGYiENtuAcEf50otw+UsdaNMRGNWlsYHb3v8APLNJca6HRm/YW4VxC9sZTLDGJLdRlkVQPdHXavRPZO7g4nfWhibZpADjofOsBYyvLAZI4SjBslUyGZQNyB1PmPPlRj2X1cM9ouGX8MjNYyXKh9uQzgnHTBIyKwZsKk+Xs1xyfFxPRnt2/wDqXw2ORD7wPkBkfc1L7WFJLW2cj+KHK57rj+tTcEc31/dzSriRGEWe4ycUO9p3DcS8ANkQr9zv/Ssk6jjk17YGO5ZYr6QHB2riMinqBvSEYNc86ZER3FNYVLSHHzqF2Q4prCpSOlNIokyERAphU9KmK703FHaIQsp67U0qfKpyB1qM86gLRCVx86jYVYYVE422pkeiqK8gqu43q3INqrON6YiBIDJPrUijffauUEk09RSGxgoAp4GK4CngUHRZyrTq4U4DFCUzgMUoG2TypQO9OA6VQLEGDvXYpwFLgmpZQgwKUDelA35UoBJ71CMTbBNJLIscJLNjJyc8q52AOBuRWc9oeLKgEIbAU52GSxyAAB3J5U7Fjc3SBf2yv7SccZbc21qgkaQkZ5YG2/6D1rOLYSi4mWX3cITK+oDC9vUnbvj1otYWtxGZ76ZS5jkwqq40DAIzvnJ3IGOW5obdER25aX3A/vONgTnkAf5dPWu1jisapGSb5/0A714ycYCg8+Qztgcun+b1QuZtz4anCjHPl+wpZ5XlmY4Oroo6D16f5ypI7ZtWeZTnt7sfljvW+Ols5825OolJi7EhgWyetPdP4KMWQlBpye3T9xViRNCkhc559T6VCpC6hsdWx648x2qXYpqtMv8ACpUEmHj1q/xb7N8s7etEJYfw6oztmBm8RQo2AB/NjpuR5ZNBIpJYzhQoYHGSM7UUtuJSGLwpSjKOjYJ+R/vV6BToSJY553jlkVUkJYspABUDKjHzxjpk1Vv7eCJfEDI7NyROXr5dKvXGlotUeg5BBDAD6jPn0oU1rL4znJ1Eg6ue3PepRdpIgfiAgJiU7DYheRNW14mogSNh08TfBzn+wBofNw1hINwcndu1ILWb8RqjjJIPLY7dvpRUiKTDVpeW7hgqpllIOn9qkns45xrU+WrGD9OtBDBLbyEOZFH5ToJBHrRKyunOk6gCM7jcH1oJL2OjNPUiJ4Ghk97KsvY/5tUkLPE7G3OFYalGQcEcx+v2oi8a3kQx7sq+8AOtUkVY3bxDyOoYxj5Url9huFdGg9m7lWJSS3bxZDhXjk5557Dl8xRe/vbO1Z4HJtUJD5JOAf5lY4w2wyPtmslww3drdmSy0YXkfdGB332HrWi49dWPEeANLdXEUtyTuDIPEc78gO3zNA+9lbRv/Y32ss7yMXUcsY8aRUnGrOlgCCfrv86fxEytdyXMgyszko4Punfoa8O4HxFeC8SUxCcxO38SNyPdHIH1HnXvfAbrw+GPJdRLdwPAs0Zzq1p1Hy+owa5nk4XCXFv4mjFkUVzS30UFxjY/Wlqa6hikAnsAfAIzpZslf6iq4DdxXMao6MZqSsVl600gGnaWHXNcR9KoNERGKRl61KQDTCN6hZHimsKkI3pDRJkISBTSBipGGOVMbPSiRCM4ztUbLipiD0phGRRxvtFWVXFV5BuMVakHOq0g3pkXsELAc8d6eoxtXBdzTwKS37GCgUo3rgN6dgUBRwFPG1IAKcBjzqiCrSmlG5pcVRRwHKlxnlSgUtRv6BbEC5PPFcFA94k4HTNOHOnFWwCo64HmauKKbBl/OYbaSQbBASSduVYThyHjPtCmtfEVCHKlvzsPdOOuBg47sBWs9tJWteEorHSbltL9CF54U9DgE0L/ANLh41vd3UCZ8SVsNjcPnJ3zsACB8jXY8WHGLmzNnydRQbv4YrdRFHGvgW5AZWPMkHY9PX/mvPfaO6F3dy4YkZ2ByMY6nz648+m1b72hlW0jFuB4ty7khQ2feYc8Z6DBx+wrEGNIrWW5YCRVxoBO8zn83nv0p+PTti3bVIDfh0t0SMAtcybsOoPbyx+uc8qkuEjtFEecsF91V6551Ooa2jErIZLmUZG2SAeXzJ5eVD7hyGZXOtgcNg5GfXrW1bM0viirJmT+UDsOQ/ao8KzaVJc+QzU6xLIQGPLoDy/b6Vet7CSXCxoct0G1WZ6soC3VgPEfSQMDlv8AKpVgQMFKM428h+hrR2Xs+55qFzzGfeo1B7PWcQzPqcdsVOVBrHfZkoYHUErE6ry2zyq1a2RaTIU7dzg/8VrV4TAFwgcN0GcBf60i8LGrAEjHpkkD6D96HmG8RlJ+He8SgYgdedBrjhxB1CIDzr0k8OVhpdSM74xzPrVa74THkEIdCkasdTU5lfiPN3SaNveAfTzUbEU6FYpG1KPDcblTtq+dajiXCmBLKgOO/Ogdzw/wnDICNJyVPUeRokwXBoZbs9tcAM3uhtm7Z796vXMCzrlCAwJz5HqP6ULLSRTNFIC2jbDdVorZHU4GxEw2OeudqXkWrQ/E7+LKZhYorJ+TYrnb5Dt51f4e03jQ3Eym4hjXClFy0PbCjsR0qN//AE1w/ix5395QcEb4JB+xFPupAts0lqwVMhTnB1b52I5nffr8qXZJRoB8RifiFxLcq2ZXJcsOZz3716L/AKP8cklMnB53YSRhtKk42Iwftv6igFvCZuG60jhd4VJO2GXOcMMc+u2AKrcDuzwzjlrxUSSj8O6h9WT7nI9OWKHLH8sOP10Alxf9novDL+4DyBkaG7gOLmFlwG/7wOh/XmKLqyXKl4V0uPiT+lF7vhttxELI6++QAkiHDYPn1HkaynBbtbhFliyrDYjsQcEVxMuGvlE2YZ87+0ETtXYyKsXaBJgQuFkUOvof75qDTWVqjVGVqxmMUjDNP500g1BhEdqaRttUpAIppXzokQiYYqIqc1OwqNhg1aIRMD0qM1Mw61G47CmxlXZCCQVVkH61ckG1VZB1oo9lUFwN6eBk0gGDUi7CksI7G/nSgZpdNLigIcBinAZrgM09RsBUIcB2pwHWlC0oGRVANiUoG2e9LsOZpfTBztUBEIxkEbirllCXfCoMIMb8iaqBvDb3lzvvg1Jb3IEePe1bkHludh+9acUOUlYubaRhP9VLiSR5IYsKiJhpTnClsjpzOFIA/wC7tRj2Uh/2j2XgiSHwWaMlieaA7kn1OBjr6VlLuJ+K+3CxiEaLYmVg41adOBsOWdgOuM+VbXiEeIW8cEW0P8SUuSGmbIAAPmcDHYV2H8caj/kyNcpsCcQgNxPHEykyTB5JHHxBCeRPTOANumemKC8ViE02QqiC2JAQDAMhznbsAOdap4XjtjcTOTczsxVN8Z3GB3A39SuayfGJY7dGgYLqZGdyOwGTv58vmKXFtypGhJKFsz3FLqWBX97XPIo3O5Abr5ZAPy9aoW9s8gDSZYnZR2Pf050VkthcXspY+5HpDZPJtP7UW4FwnWfEkXSPPbFdBaMEk5SIeB8EeRiZI8LjJHPlvWtsOFrGvvdTnAH61d4fapEmFLZwAOnX+1X4oQDsD270DkGklogtrVEGFVfM451ZEByu+w3A7VbhgAAGftU/g78vpVdlWkUDCfhCjJ61ywCPI08+eaIiEHbpSPFkfD9ahOQOkttRzg46bVC9vj8oNF/CBHXPWo3iGo8qBlqX2Zy6sFZCuAQ2cnzoFfcMwrKybHke3lW3mixkdOeaH3dsGQjI235VFJoOrPOeK8NPiLIFIOkBh1GNqr2SSZGo/AQMgct9v3rczWCyZ1BSq7kH/M1UueAgwmWGP3kUmRTkHSCDn1/pROaeilHjKwBxiDRLBJJk+Nz/AP8AJ/agPE7aa1kJMepe426dvv8AWtd7VWBW2ilJwCuoY6gnOKia1Wa3gmlLAY0swUnQAc59Ac/WkxnwobOCyXQD4P7Qi18KIx9cGVjyQ8xtvijPEOEfiLc3lvEZId3Zi66vPOdsb7bVBPwK3aXW0MYWRSy6QSMdRt26eR61P/tlzw60F3wu4MttKwjltpQGCEcvi6djTFKL2jO4OK2bv2O9sOHvw+y4ff3Atr2ONYg0hASUjYYblnGNjQawL2PtzxXhbRtokuGniA32b3hj/wCRrL8ciW8t0nQ+G4IwrPnJ7gYyRt0/QU3hXFJLT2ggllLG4hCNHJgnAUYI35jG+B50ieK00i8epWescUlH40xIwMcKhBjocZNV6qWswuJXk2AkOcg5ByM1aGcYNcTJ/Js6EFxSRzU2n0hFLGWMYUwipKawqBWRsNqjIqao3GRRK+yd9ERBqM1MdxUbCjoiZA47VVkFW3FV5B+tMiWFcb09ccqaOZp65z5UhkHDalFcBTwN6Es4DsKcBXDY8qcN6gDZw32pw2rqUDflmqBOxj5UqrpOoAbHO9KM45U7mRnlRR7BIlDMyAYTO2RQq94knhXShwqgaV67jcsfL9hRlzpiaQEAry8/WvOuO3wXhV8Qya3ZUTUdiWJyNvL7ZFb/ABY3KgJUotlr/TS1kvuK3108SlXYDL/FpHQjtv166q2F8BdYlY6La3cSsc41OM6c9wq7+p8qDew1s3CfZi1gCsbm+lPxElm3OScchzPPaiV+dclnY2seUMn8RVPxAnO5znoSfL1FdHK02YoJvsaUSR48r4SwRa8AZCdBv5ZP09a894pPHPeXVxJyYMSAQCsefdA7k+7tXo9zGFa/jjYEpbMcjfOM8vnnPrXlJkNxemNMR+H+UDqRu3lgcvlQePHbkOyT+NIILZiJhBIv8e4k8ZyOinkAPM/YDvWvtLURxxppACjp370H4LZPdcTGPelJBOf0+Vav8PoKoww2MEnrWmxVKJ0UR2I5VehTG1MiTcDHpVqJR2waiAbJoo+WBvU2nHpXR+m1THlyrRjFT+yDTvkda7TjpmpOppNudDONdEjKyI4P6011B5VKw3prDngUsMqSJkVRmj23GaJSDGdsedU7hd9tyaW0MiwRJGurljY71ZhlhaNvGCGPBRy3LSds7+tNvIyGUgDn+1CeIXAgsbgyLqBQjB78xQPsZVoGcQ4tbHhkMDt/DaQKfdBYHURt8iDV/h9rFcWzRRrKwLMpYrsOeDjPLINYm6kJhiIcK4fGk7ZyV5fI1o+E8Ua2gjdgzSiZtYbY4JDc+XPNFOPxQMW02kWeEqZofAk05XBXDZI5+8PuPt2pYWaxS5/EpG0TkJIhbIbG+w6bcu+PPFV7a4EHEpdTEws2DjmARg4Hrg+p8qJcVgMtmZolGoII3wcgoDnJ7EHcetLSp/2XJ2jO8V8CCTwGQyWUwzGTJ8WdyCeh6gj5jYms9ctHFeRMpkDIuMSb7gnY/KtC+WjNvfj+FL7ynG6t3A7Hnis5xWzNlL/60yFFXQFBGpxnYjsPM/KtEduhctK0eoeydyLrhQdtmU4OPLFGgMaTnGehrH/6dzrJZmNRpwN1B89uflWxTKKNs77nFcLPHjNo6KdpMUE7+7zruvLFOLb75+ldWUsjZcmkNSdKaw25VAiIjFMNSkUw86haZCwqNhU7DbbnUTCmJ2iED86rvz5ZNWnHWq8uxpiCCYG+KlA7U0AAmnqOtZ2W2KoxTgKQb08DNCAKB3pa4ClxR1fRG0JTxyrsV1C1ToqhaeSFA1AYI55pgOOYp2zg/SogWQX50W0zDonLzxXmElpNxjj1tYKTohJnnYk6Q22+R2H3FenXZH4d43JGfdyvPFYnhqw8OnmlGqTxnLO+MMQBhVHYZOfM4rp+G6tisiuNBxeIwWX4uWMaLOzg8BAnMnGSB8sD1byqzwSMm4e5uiFe3QtpznErAZH/ALcqP/bmgcTI6eJcx5gth4wA/wD2S5yM457779h5UxeKKnDoEikB8VnlctzJOST9fsBW2tbM9W6RfveLRi2uUILtmVdRXIxJhkHyxWF4fE68RkKJlywVBz9T6/vV+W8ad7gqQBhQmnmNO36Y+tJwJXn4iqL+VtTYPM4/z702K4okomu9m7SZIZ7nRhmYoNsnnv6bVpb5cMpxtyG2+Ks+ydti20FQpMuph25GrHtIkNsQ8kiohGQM75q0tWZ5T+fEFxc6sx77Ggy8Tg1EeIoGcHJ2qzDxS0HxTL65pqRTDUdTbFaGw8StXxomBz51YFyr4wwz60y0kT+yc+ueppuNskZFcT1O5pdsZoHOyqEYbAj70zkaeVz86rzTLEMZ+9C9hDHOck71Vk0sSBnP6VTvuNW0J0ndjnYfvQi79oW2CQncZzQ1ZasM3BXTvsQRjPOgHtW8S8EuifiVTjBwc4oddcauZM4DA9s8vtQnjfFZZOGXEEg1Bl79f8FTg+wkwNxKJPw0G7AlskEdPdGR960K27QQW6SD3pIxIrEc8hdj9aAsxvLK3dQSYpMac52JY8/lj5V6DNaRXHsrYXUWPGtPCjfUea7g/cD7VWR9Bxe7Mu7FbpBpGqVQjHVjWD59Cf1HnRW1mxBgTvI8ROgEYDbdT5/15VR4vb7ugYAxyEITnkd+nnVK2vS0CThFRkZlf/y5kH13Iz1x3paVoj1IKPaNxK3kitoo3lQ50ltB58s5OBgjvy6UBdY7xZrC/wBUUiHSGdf4idsjqPLrz50Qlu3sDHMiSvC+DlBkjfYjcYxyz/WrjTcM41ANdwYpA2AxYs59R070a6sW3xk0+iX2Btbmxme3ugAdQYMu6sNPMGt7GBo5YzWK4G83C01XP8S3XdZdefXYcvtWp4ZxK2vIsQyAsg95SdxXK8rHJS50bcck4pfRdUZUUjDPyrkYaRvnbpTun61gGLsiIxSYqQjamYqgrI2G1MIqY71Gw3qBEbDBqFutTsM1G4zRxVkK7iq0nOrkgqrKKZEtdBTrgd6eM4poG5p4G9ZyCjPWnL6VwFOqFCjzp2K4cqXFR6ZKoTFOUVwFLVdlNnDekPu+90607571xB0nGOfKrSBuitff9FZACxB1bDpWX4jHay8RIVbtIyqEBI8oV5jDcjv2325da0l28kaHwTuoOGxyPUduVefX1+bm9uLcJHA7H3zE5RAM4zITuBy2BGe1dXw1diMzaSaIPaXjOvTZWcZUI2gxx7YJ6E5JLNvnB2HzqKadzZo2dRCacqOef8J+dDJoojdvDaObm5YHdIiqwRAb4XueXz3NEuJRSQGKzj3kfQpC4YBRueVdGUekIxS/k2Vrdisw0nVpds45EnGrH2+lFfZz/wBJxmNpQ3hMwWQg4wDjDemDiq3s5atccUijEYjcMfdByASeRoxf2Rs+Jo2MiN9BUD4k31KfPmPnUYUXaPVbKRLS0urtzjDkqOpHLA7cqwPtVd3vEbpRokJycR8tH051qvxqWvAvwkjpNJ8BYHVqXmpPmQVPzofMpWUEjBbcnFROnRngrbkZJeF38hwsLZ3z0HyzUycGvAQXhdj0yc1qkcRkamG/epJb23xkTRjYndgSAKapKiO7MvHY3ET50uCeZXofKitgJYmC6mKnfJ/SiRcNzwfOnLoODgZ9KW5ew9lyzlZhgjcdKt9KpwMu2mrinK9D61aYDQ1sgHNCOJo76gmDkUTnfAwDVFyHY5386pyLSsz78LmeVnIA8+mKcvAyfjYqvPAG5NG3Mca6pGAUb5J5UFvvavhluR/E1b4wMD9atXQTHngFsVIcux/Wg/FfZ+JoZCMsMEAZ/epofbSwlKjDAHOTqBxRWz4jaXqaEkAZhkIw0nH70MpNdhRVnlcUc3C7t4JgzAEOmDsQGyR+teiezamAeHKVa3ugAqa9sHBGD1GCPoflQ9ouCpJN4xTUB26HvUVhfQcMIseIxlIAu2rUQvUHtz8tvnQyfJaLqixxuzdUuYJEbxUTSQR1B5/Mfqaw8N09sZILlXkhYYOg7gdCO5H7V6HNdpxESqXSWMKCrtnOBtjIz9dx51hLq3RpmUliVbUuTj7ipia2mVkT0y1ZFXd7W4cPG4GG5HHfH0O2RtT4+CTxSE2UzShwQYJVyp/8WxnzwcYzTLRmCJFBCweP4Qzagu/MHG36fsZh8S5tHDrKpUZXVg8j9Gx06ijvj0C4uS2CraG5tYUxLNbxO5VYmmyc9hgb49a0ns6rG+lmZ8rIQEJOxAAB+9Z+e1vL29QxpbO0Y064gQ5HLdR8PPtitrw208OzgjJ8JlOjGckbfflWPy3r+zTg0thxD7oyMZFKd/lUMMgaMFj73ZRUq6mznYdq47Q4Q01udOIHbJ70hxjY8qAIZTGBPSpGG21MOR51AkMqNhj51LUZqyyuw2qtKKuSA5xVWUb02DCQTFPWkXmaevOkFLoWnAdRXAZNOxvU9FHAUtdSgZqFnDlS43pQK4gjlv5VBZxAApjuYyGB3HXtTsjA1bZ71yyZAHvMM8h1pkUUyrOECZZTttpzzrL3ltw2ytLi0tLeWYNIC8gCkk5G+QemefTyrVXt6sUBQQjXqyGIGSe2M5PnWJ9qpOIScSSOLIScZGDpX0OM5O9dPxqj/YmSlL+hthZ8KiaR5G8Igl9Hjhtl5Atj4RzIzv8AIUIkmWe4eYsSsza9TNvueeMeWAMdKsLaoIHtIo3chg2TjST3P+Y9amXhpaVRI6IgAEeBuxHn5b7+VbrFcOKaJ/8ATmJpvaWIGMgawMEcvlWr4zww33tDfCDCsC0sbDcas4OP86UL9iLVYfaWFBEdO3vHmcDcitTPPDa2l7xhigYTmGEE4ABBX9f0q27Yl3FMzPDb38Rexm4GUjPhEZ2KrjT9mA+QqxxPiq26yXEm46BmwB6k0M4NZSTlnV10FiQxwobOMkD/ANufnV279nbe6Q/i5znOyour55JoatjtRRl1vr/2jvjb2QL4O8rErGgPl/Xes3fXt1D+KFzfCIQM6qChzIwOCu3InnvttXodp7OSWUuvhs5iPeqV77DTXNxJcyODI7+JhSpGo8zgitUJQMuSM37M17OcX4sLiCO3kLiY6dOojpnzHKvReE8TF7H7y6ZU2ZcYxWf4V7I3fDbmOeKf+JEhVNSghcjBIGOdFuH8Huob9buS7DHJ1rp3Yds0E3F7QeNSX8jQQSHIJ2+VFbcho9+1CwuEGRjar9mTo37UEVToknqyC/fQDjmapI507ZJqxxQk4I771DDnwm0jDEbUFfJhrUbM1eSjjnFjw0T+FaxHE7hhu3YV5rxWzmjluLNlgaZZfflmyXTBI90jocj7V6rFwDhttEFFoynmzkkknuatJwnhpAwhX0NaIzjBCp43Nnm3s7ZWolMl1as0RiZGGMBj0A8/Ortlb8QsZfEtI3a0zkRsCwX51vk4ZYxZ0xaj3JyavQTeDF4cabcsDlSpZb0hkMSir9gO0ujdRATQkE9zRocMhv8AhTLIoZo87MCQVI5GpYl1tkxr9KNcFHhyZQEdCO9IrYc5aPPJfZmaK7uZeDTiDEXipC7HQ47Kw5H1rIXJcTOLhPDmzvtsTnf/AJFe13UC2/FUeNQqya42QjY5GRt9axfGLCJ7eVpI0ISVwVcbEHsRyIxV8qewou6Mha3MUQOu3kbptlwR12O1XrCcxysUidYSwOl0IVdug7+mKgjspFkBgbO/wncf1onxueRHEV1AysWQalO+kL8u/UfOhlL6H8K0yKO2gfiniav4gUHWmSDnPPHXlWltLeQ4AkdirD82d/pQ+GBkniurVRJb68MOYjGPdIP1HzrQ28YCqQ2oEaifM1gzzfYcaijo4/BOApw2xB33qbkNhikKnI35GnLkauu9YpMsacE75PypSBXVxoCxh7CmkA86e3pTalFoiOxpjCpG50x+XKrQRC/Oq0371ZkqvLzpkS0FBzp68qaOZp6ilEHAV1cBgV1RIg7FLTRsKcOdUA2OApwG1IKU7bdqsEjcbgggN360jwuBnxfiOOZ+u1SMM4PXlTs5JYjOBp+1MiymVHtY1J1Y0kbEc/Wg/HLV3snliYmaI601ryA/r/Wj2BFgkHT8TLz2pkzR3C6ZFB21YxsTjnTozcXZLMxaWEZga5ityokiWQ45Yz29arRI8rOZJDuCvfbnitRwyFIOGyWbNuC6Dpsd1/fyoCYJ4iwgtJikQbSdG2/buSfsPKupCSatC3tsu8KiVeIQzg6ZTEAvTcrtRe74XccaNrwi2cx2NqgaWTTsz8tu4G/PmT5UN4baCS1W4ZtTRYUgjGMHr9a33Co8CRtveCgeYG/7mjx7lTM2Z8Fa7Ms/AbWxXwodRVdgxquIAPhrR8b0CPBbJHLpQWEDrTtJ0XBuUbZAsY25jptUghkY+6+PvU7R7+VPRQv96nHZUtdFUWWd5JGbvirEVuiZwByqdNPaklGFyN88sUSSFNt9lWYd8Z8qsWpwPKoHULz5mpLZstjl51Xsv0RXy6tqgt8psenOrF5zz2qKLS4G+/elt7DW4lpUWRcgfKua0jJ3QH5V1uNNWuYGaYtoW7TKLWqDOEAPpTRAANgKulQTyPrUbAA8qjpIdDoZAo1jaj3DkUrk7YFBYV9/lR+yULDnkDypcFsrNpUUONxkXNtKD/8AsVSe/SsXxpndjbQMhlncuqk4yM/2rdcX961bO5U6vpvWM/21G46LgzrIuEAx+Xbl9c1nyunoLDVbBVjwSa1ugb5DbhGBIzkY50R4xbpd8ZhldtCBC4X4SCxAH2X70X9pYVW5e/uXVLKGMOzHYsQdh5mhsMonvTPJMrtMBIi9QMYC48qTmtJs0RycqYP45CsFoZYnCPGynUAMc9s+W9F7V9MUTZ2dAduWKH8fTVYuFGATpOOo5/qKtcJ9+xtVY6isQyR12/vWObuCGVqwgxGQcY9KReppoI0gk8tqU/CBWd9kOOTTaXO2+1J61H0XRx3FRnan5pj0JYjbio2p9MYd6tBIhcd+lVpatPVab70cS0FhThyFJ1pw7Uso6lHOupQtR9As6lAya7FcdgM8qhQ8V25JPeuFcOdXRQ5eRPaudBqA+Z/pTkA5n4RTWOAdfNjRIoYXZw4IwTlTtUUbB4lDYAC45cqmAP5W38+RqC3KjWNPwk4A8+VEQrcRuI7SUTybwFfCuARyXofl+9GeBW0sZmj1iSCWEmJ85zkVm/aa+sbbg13+KKyu4EUcQfDBsZDYrv8ATrjj/wCwXFlNKsk4Y+Ah2KqQCR6Cur46qHJ9GbK7+KL9lZsvEJ3WQKjR4KMdz6eea2Fm5SJD5A4rIXNtNbCCWJJhK0oPvHC6Mb4PI1rIHBt4ypBBBANMxPdisvy2RcUtg0Rlc+m9A0GG2o5xKU+AwHUUIiXqeVau5FY21HZKFAUbUmgg1KvLnTXwBkmik12UyNiFFVp7oL59KjupiW0odzUCIWmIb8u2KXyL4/Y5pmfpuatWik4quYdLjfaiNoVUdzUW2SWlohukyDmhrO8T4UGjUqBhmhskYabp60ufYUNo61vCH0Sj086IxyK4yCKD8STRGGU4YHbFWYnZVVuYxvVxlRco+wnsdyKYyjGwqOGUMM5zUuoEU200Cm4iRjDrRu3kAhAx96CZAORvV+CX3R71K5cWSfyJL3/8aYnksbHHyrCcJdZppmkaUNlW1qRpXfcEd+vOtzdktY3IBGfDYDPoa86v7/8A2SC0g4ksfgPLkyR5GnbOX7isuV3pdjMWosof6qcdlg4UeGyg67l9SuM6QiHnnlk5G3zrJ+zXtTLY3MKzfxocaSD59fWoPbn2on4ncXPD4bhZeFxyKY1QfEQSA+SM8sVmNbIsZVtSgZyB+vatkMF4ql7ELLxnaPa7i7W9gils5jJHqyUbfGB/eiHC5Wt7G3MkekFFXK7j515lwDiU1sIvDbBaNmf6D+9bjg3tNw28to4Hk8K4jXGltgT5VzM2GUFXZ0k01o0Eb+Iq4GVBJz86l1jO4qnZMy2sZ23GTg7HNWNZYbjb0rntbLZJkeRpjuBzGN8ZzUcsscKFnYKKroVuf+rHhSNs7fM0UVZEW1YNuOXfvSmmIoUAAYxtil8jQNEEIxTGz8qkY0xqgRFJyqrLVuTaqktHHsJBbYMafTRzp1KKR1OFN36U4bVO9AsUDORtyzzriQApGdxuCKUbbkZqNlJzzG/rR6BO16Tg5xSiZSRuPrVOcoCdDsT64ofccUkhAR4vEI3xkZpqjb0Eo2Hw4ZcA8zsO9KxU7b4G1YfiPtQ1s20IjYjIGvP2FZy89s+LTOUtnGNxpUb8tjmnw8TJPoCbjDtnqFxdw2iNJPMiKAScnoKy3FPa1Hjd+Gj3QQvisPXcDryrB/irsypccRuXdxvpJyO2MVHe8SFs34V1GuVAvP4Adx+1aMfiK97K/Ioq2dxniUl3eRvJL4iFUdjnO7HfPngVa9n+NwcN9plueJGU20E5Z0i+JsbqB2BOAfLNZmOV/BnVjkSSDTtzIB59sZp3FWKcWnxjLaWIHLdQSK6qxpLijnyySds93tOKQ8b4dFPYuWWeMsImcHwGB+Fh0Ge1argkkknCFMyBJEcgqrZC9cZryf8A0k0ePxEKQCQm31r1Xg0m08P8wDj5c65PPhn4eh7j/tkl64aAntQ+Jtqs3D5DJVBSQcZ2rZGXsXFaouhwBnpQ+/vBGCBux2AHWnzz6EJJ5DJqhagyyePNzPwj+UVbk5aQUY1tly0hIXXKSXYfSnTLg5XY96fG+Bg0rOp/pTUlVC+W7Bs1zeaipt0wOoY5P2q1aXukfxAV9al1A7BaiunVdniNDw9oNO9UST3q6Mg0NaedmzGdC+QyTT/DEmMKwA8+VSxxqo3Ipbi/Yxa6REEmnKmQ8unaiEQULpJqFWAG2M1zzYOc4qJcQJNsWQmFi0ZyvUVPFch1BByPWqBnJ2B59KdbowlYLy2OKqwq+y94oLDrV5JNEeT3wKHQxlpB61PLIWvBEuyxjHqetLbZGghcSaeGzN3XH1ry7/Uss0EQXdVViV6nOwr0ji0mizji5a2yfQf3ryz/AFAupVuYok0lXIyp5kDf9cUuPyzpL0i4qoOzziSMlyJD8cTIpBwAynOD9KqRKzXSohKtgLtzrScV4b+HsbSSAtraQux68/e/ehFtbzIVxq8VvcXAyd+w6muspJrRkcGmHOFMzC5njhBSNfDDEc8A4+XOhb8QZJ5niP8ADQnltk0UkLcN4a0cbgzs26bME2IVTvgnYk86zzHVohjOc7MxP5sdaBRTDlka6Dll7S8TtZdMU0gA3C52Ao/Z+19yxZLm5kjwOapnp3rK2aLJLKB4TJESXnkOBGOgUdSTUIaSWQmMBVG22/zNKn4+OS2g4+RNPs9IsuMWc76/GYsR8bFiQfmMUdsbiC52ikmlbnoByTXlnDuJXnC7kJMTpONuYYGtxwvik9xokC27HmH0lSvqRXPzePxf6N0MvNfs1AugQdMcpP8A48qkjYu5zqA86pW1zNMwE0KLrywOrGfnVtHVIG1K4PPnqFYZQp0XZM4AOM+9TW5VGrEy4zqBw2fLtUp2NJYRDJyqrLzq1JVWWjiEuwrjOacK4HJpaSWjsZ5U6kA60+NdcgBOB1PaiSFtiYYqSMf1plwpwqRNhyPe1DYVYkKQxPIW23VR27moYcIdTyBUC6nLdB2p8YP/ACLcgbeLa2kTTXRLaeRbfPyrG+0HGbqbVa2MXhht/dHT1rZ8ZuLaVw85aErvEuAdfbFec37zyXDzXsmkaiQi9fWujhwqLt7KU3JAz8I8sTG6nAOc4Q4yPM1EXt7a2Iiwgd8bdcczScQu0BKhdGroeZHp0oNcXLzOUhU4HXNb+MpCJTjDolvbk6h3YgbnlQ64d5uIyXDEklyQe/T9qnhtAHSWbLYYbdt6junAnk20hc+Z5/anQqOkZpty3IngAnwEYrhiZMdsZJ+g3qC8cG9hkUgl4UcjsSOVOgWSLhstzGjMWOlmG/hp1J/8jt8j3rr4JLOukgSRRounvhRypiVC7s3H+m10IeOSIThJ1wCOhFeuWNw0E8Urgac747GvnfgPEJbKdHjyrocjfnXo/CvbSaUKs1o8m35DnHrXF8zDL8nOJ0cLU4cT0niH8OfPMHf5VVCjVn5VX4FxiHjtg4QMktvsQ3VehH6VLGxBw3PPWmwdqxUo8dMkurbxbdlHUEVRuNcYV4xn3fh86LRYIxnnVeaIFtPKm1QCZ5+/tzMLuG3/AADp4zaFZ3AwfPtRyzveKXbKq2zIxTxArHcrTfaTgFvPGz+HtnUcbFT/ADA96X2b4ncWU9va3rxvDGpUXLEhm7ZGMDz3p6SaGttLlFWiRbi/YFvAdhtnS2cVKtxeNEx8OYIm2cEitHw6+sJYptDIql2Daxoye4z086v8P8AcPjERDIRqBG+fOi4fsU/Lr/iYyKa4umKwxySMOgBAFRww8TuZHWKIKUznJrcWUMMCyqigZkPy8qG3PEuH8PubnxJAjsykjSTkkch/SgeP22X/AKu21GJk5rPiAsTc+KcagoC9cnFZL2juuKJxFeHWt3IJi4DFG5KACTn54rXcY9oZbi0FnYWpWYSD3mwUChs7+eOlUuGcKjN9LO6l57htUsh5nbl5DyoVxW2aI/kmrlpE3srw26iR7i6upZNeAiMxIGOu9a61jGguetV4olihCqMY2xVpWCxAUtu9iZStktooEuo8hvTLVdU7O3ViTmmiXShxuTsKq8SvF4dYNJI2GYHpyHU1nlJLZai26RW9pOKRQq0hkCgDAztkDt5mvIfaHict9d+JNKjCJjoXOCADvnPXOB8qm9p+PyX12xlfTBEcxjnk96z8Za5klacqwkYadXTFP8fHxTlLtl5fUEH2keWytnf3Ckfw8wzk9ulUJL026yFAAz+6NI2Yjv1x5URuWSDh7KTpaOPIydycc/vQW50CSFXHuRx7gHr1psbbsudRVCSaltY3c5kcMR6nln70ORhrEerSmME9R5+tW2lNxwwSMcYc79B/gqrbhHnVnPwkHPQj+vTPnWiK7MUmtE3hh5CC40qcrg4ye9PMV0k2tffHPaoLW4jEvgTYDE+6xGf8FWoyjMRHcJrBwVJwRVu0qBSTdhKKNb6M24z4+AR3U+XfNEuD8WuODSLbTIVynvBxsxBxz6UHSWaCSN2UsAQVdTmtHBcw8TgaG4VVklXQJNO61ln9Po2xV7XZqRcQzRWd1ay6tRIkjO2nbt1opCQsnvZVh8S98isBaJd8MuGgvCrLjCMDkDyraxN/6iPQScKNj12xXM8iHF6NePaCUKYUvyJxqBqZx1HLoaiQt4a751HOe4FPJyNgee9YWEMfeqso33q03Oq8oGaqISCY50tJ5daWlkQ5T0pd2wg2yck+QpoB702V8OFzswIo4gNWJeYks8KCcnBPah/FZXuICkJJifIyR8QHT0q/JlYis2CeaqDt5E0O4jpCR2kLAlIy7tnTgef8o/XpW3FFyAtLsA8WuPwefCCSEZDSflB7DyFZO/lkmvI4i4GthqY76epyBvTriVOIX5l4hM72ccwjEEC4aU88KOg86mJMjO9tHHChPghPi0ltyQepUde5FdOC4rYty5aQFbh6pmSUAu7am8Q5JGeWB0ps8kcRLLHGg5nbAFP4pKLZZZVVpEiXZGPIZA3PzoVHPJfTSPclERwE0j3UXlg+W+N60RTkjNOUYaojubqSRch1VQeY3P3qqBHPIU0ymR2J16hpCkZzjGcjc86lvofCleN2I0MUJI6jmAKiYhEwgwT/AA8+XM/0p0Ul0Z5Ny7J+HNHcvNGbiS2EgEUeF1KRyCtjcZ7778xScTs5fHkbGGLHkQQe2425Y5U2wWQQm4ZUEVvqYMNIJboDjc7kYz51UttbMylcrGupm5YHfNHX0LvWyzaNJG5Wdf8A3DfFar2ZvZIZvD1ANzXO4YdqzMBhkI8ElvNj71W4xNEMq7oQfzDb+lZ8sOapmrFPg7R6/wCzd4hcT2yrHOu0kWcZHUVo59LATR50tvvzHlXkXBuKXblWUeJPGOY2LAfvW54L7QCWwaeb3olH8UAe8BnGcdxXJqWGX6N80prkjUW82cVLL72GGPOhsUmNDI4aNhlWByCKIQyahvyNbE70Y2qGyoJUORsRWe4lYNCxZU1xnn5VofhfGfSklQMPXyptF48jxu0ZIQkoY45WjVsbE7VdeLiUKq34wKFB2SQYPyFE5OGwuxIwuenSmnhpQbEY7g1af2a/y45baX/QEJHdr4jC6YCQ5OlvvUaWOtNMshYDfc5+dGhYHmPualTh+BhmA9BQN/Qf5ccekgLHblmEcEZJPXFFrO0/DD3t2POiFvbpEBoAz3qxJZmUagcH9aBszZc/LQPLnUFHMmpnJ2XPP7V34SSOXLYyKfgA+nehb0KWxpKxhpJScKK8y/1D9oWkLxrIQqncL9hWv4vxeObh7yWzErrZIyPzkcyP2rxL2nvzd8QcKRpDYwp2peCP5clekOcvxw5PsqRtJxC6WMsFjBy2Tt60VhZBcw6WwkeCATsfWqHD4Y4bqGGVv+oR4hHNBucVPbOsMzyDDRoMg9ya6M19dGSL3vtly5uTcXzIxwjkoNPLcHH3xQ+/kMkuYsn3dOD1PWq9zMRcsysQQRjyNS3JVrlmXZZP4g8j/wA5q4x4lTm5WOZzFw5RjKsp1CoAskUK+GSUbmQOvQGrN4cWqagCCcb+tPgRgiKowf15Vd0gGrYImyrjlpAxg/550Rsrdb0L4JCyKBqDHJYdCO5HKoriBJIpXkbQUY7D83Pp8q7hUR8KS5LDRFzx27fPYfOmN3HQpalsuXsNxwx1DEkcxpB5eh5US4VfGZSjc8ZUZxk+tUOIXaXFlDl3MoXZi2SV6fTlQ3h914ahnYoS3xoNx50l43KO+zQsnCWuj1Tg/wCDuok163g1AFXA1xHuPLPWtBFbTQTv4rB8quhs9M9u9YOC8aCYReHHmaMON8xyr/Mv8p71pOHcS1tasJdVuygpqIypHNT38q52fHaZuxzbaNYvNkOeYC4pwbC96it3UhSMsCc5+9OlYatjzNchjhCTjf1qvL0qdudQSnFUggmKWkA3pw50su9HdM9KV4tWHPwJjn1pR7xAI2AxSyOMTyYOke4FBpsEKbopSXHhxtIyqYl98k9Mf4K839qOMsDcQpdSKsz5uHA/6mBnSfTYYr0XjURHDDEi52/LzJG9eX8fgjf2ndpyWBBfwxg4TmfTcAfOuj4nbsGauNotcM8O2tBhGlv501BZDsNWMDy35+gHerPEx/s9lbG8mMk0Z0aOhYnL6e+3u+WKfwqNxctfXAIWJAE6fxDksxzsQAdvPFCuMYvPapWu0P4W0RC+e/p3/fNbNNi9rSJ/aTh0EPsm1y2PFmm0BiN2Gc4HoMVnLPh+u1j8QhY2UXE5P/8AHkhR88E/Si3tnxeS64csWdKByypzIHLOOmarSTaZYeGICrBI0mORkHQMr8h980/FfAzZac9+gNfRN4X42RcDGlVO+O315/Kh0QJkaNh0z860ftOEjlto4smKRda9h0H0AH3oV4aQsr4zJgHfkNudaI9bETVMqTqsEIhxiQNrlz6bL8gfqfKodDhNKkFcg7Nz7VI58cB1yZObDq3nTRoACh2LAZO2NJz670YA6JY9Q94qfLf9qL2bS+GQJW9VI+9C43mRttDDud6McOlLo3iAZAGlQBhj8jtQ+wkct1PazIy41ociRdiPpRKz41Kl3KhZU8VGLb6lY457UK4mixsHjVvD0g8veDdRVSLXKS0JZiq6vd5gdaRkxxltmiGWUXR6R7M8dMUCwyZeA9t9BPUeXcVs7G8VlGhwyHcEHY14TY8TmsXymWGdxyra8A9owUEkbakJ9+M8waCeP2i4zT0z1FdMgBGfKpAMjBoNwfi0M4XDghtj5GjCuA3l3oIy9MpxoesYyds4rmjGCMYqRSDucEGpBjG360/iq0wNlbw+ppQvTNT6dsHpypNIUUDRdnQx4xuauIAij0xvVRHwRnv0pzzqqFmOAPv5UibolWMu3UHbrWR9qeL6IHtLZueRI4P/APUfvVzi/FncvHbNudmcdB2H9ayHGn8OIjPTalx+TNEY8VbB/GeIiy9moCHIlZH0gHlk8686hxqadsERjVhupo57T3ol4fZQKd0Rtf8A8tqzZYmEAE5zWzxsXGLf2xPkZLkl9IltJpfxhlJ97c5J71alCw2S6Qf4gJJz0zjFJ+Ea1tPxEy6WZgFQncgjnXXsE0NjHK5XTJsvnjc7fOntqTQhJxTsguifFLD15c6mikBGljsRlSeQPL6HaoZNTwlhnK8/TpSIdRKNgdRRVoG9hSQC4siBnIOkjqP8IoxwyxN3HbTRYGtsNk/CcdvlWfs7kxnS2T+U5PMfv5VouBX0cLgOAYmYHIG4Pf1pM7rQ7HTewdx22a3ub+2ZdMiv4ilhjCscj77fOhNncC3tGjYDwJnDEY3yv5c/M1q/aq3LlLge94sLQszc2G+k7deVZmGJZ4lRvz4Gw5N0P7UcJJxAlBqRGkQS4fUD4RGsBegIqFoTE4CjWq4G3XnRWzs/FulhbCq5wZQCdAx1HPpv86qLBrhc6gw2YN27g+Wc71cZAyjRf4LNNJDJC+om2yyEn4B1NErW7k4fegxv/AJy65yuf5h2zQ7gGqGeRWVmDgppHXO5qZ7hVjW3eLBD6I5M4O3Ks8lcmjVB1BM9e4TcrPEkikFSmpcciatR+8u/QkVmPYW+S7tX0AIqgAIBgKfIVp0wDgcq8/lhwk4m9O1ZzfFVeU71YaoJAc+VLig60FBzNKOdIOZpy4zv03pZPRIhKe8Dz2FR6wIwjAFyCTnfA6UrhtJyfgAIwe9RNjUpPNsjHnt1p0dKhQl0MxiOIZkHPyxzrzb2ssWg4tOLbBmvFEMKjpk5J+wr0iQkvoQEAHc5ySDzoL7R2SMq3AX+KpClguSqE4O/TIrR48nGZPVGdbw4fw9ospMcaxrJI2+sqN/rjJ8gBWdh03PFtUiySvNK1wYgc4znTn0OKPcRkSNpWk/gq2vDA4KgZOR8lx/7qpezIjlsuJcakVg7qkkcewIwdJx3H9a6cU0mxLaVIzPEZI5+I3s8gGi3MahcYDtyAPz3PkDUMMxkvpnJLM7lQw5nufpmkvJhJe38KKVRZA4C75bXv/QelRNMbdl9/VITIdJ/JyG/nty6VrSpGOUt2PMv+437lzhEyFGdlUf8Ul6oMcsmPjGB026/bb51DYRyNhPDYyS7gHYBen9fpTuNOoRokyyQtzU7MwJBOe2RgU+/Qj9ggyAHKEk53I2/4FWBIkjBZQNf8y1XkyyEqADzIFRgh499ivL06ijpMVbTCcSZb3GVvng+lEbK3B3aDcb7DB+1CbCUqdMwJA646UfQTJasyZUyp7kinZh8v0pVNMfFp9jLyONkyHbyGeX1Bqgcq2QXHyqoJpoJfDmXdexxkdx3o9Nxs3PCGtZgpk9xQ2gBig5YNDktVoOCTvYLnZJYwrnSV5HTjIqO2aW1lEkLhhyKjbNNadlKgMck8mrnkxu2Nuef61Ng2rNt7O8R8VgUco55itxw/jEiIqXIJA5ON/lXjdheG3uA6hlYb4zzr0TgXEUvokOoZxjHKkTj9j4v0bu1v45R7jA+VXEmBOVNZaKAEApqU1aSa4iOC+f/ACFK5OOmM4Jmi8UY3NRS3C9TQgXFwRzXbzprNIwy759KF5GWsaCM3EI4l1O4+XP0AoPfcQmu3O5SPkFB3psyb5I3896jAAOBSuxiSIJF0RedZnjz4RiTWnuh7h3xmsf7RMAp3OR1pmNbBk9GB4tNLIwB+CMlQem+9VrfBKvLnQGGSKtvCbi2uDp1OjaxvviqSaTGC+dmGcdq6ca40jnyT5Ww1PcHi15HJdjwoUjwCBs2M42qP2hknmCvJGVSIIjKBgISDgfQVFa3cVtdAsDNAmQFfqvnRLiF7w649m7q1JMl948c0cmN9IBDKT8x9KzpcZqloe3yg97AiECT3W6emRShdMmPLbA5iosj3SRsRg+VWgucK41A/Cf7096EdjSFGGOwJ5joasW/iRv8J36g86dCYzBJFJp0vgEtzGO1OVWhUMxLKOZA2I75oey7aC0d4TbmMszIeanpVR7FHAe0cBm2CSHAbvg/sajN1oYYjSWMjIb8w9elcsrM+EZh2DHIoZRraDjO9MsMGicTMjxyH3ZFxvnHP0O/0NTWMFuyyRg+G0o2HQEHO3erVi8N+RBxAEqfc1qSXHLG3M7gVFxqJeEywGJ9SSqd+e46ilJ7r2NpVvof7OxNBflJVAZAQrkbCgfEw3iyoGYyQyZH/cp5kehP3o/YXgDiRQCFxnLbnz8xSycGha/zLO8fjAyRsAHD558uXP7cqCLqbkw5RvGlEN/6blhCWQ4UuPntW/bTqGP8FZX2L4eLC3S3ZgxiUs2FOMnlzrVAr9B1FcXyXeRm2OkhCfeIqCT96n205A2qCTnWePYYU6mnIFz7x2wTTeprshU1PsTsN+ZoUtkl0NUFzoBwx5Z61FcZddMYBeNsjfmf71KrqAepO2QeQ61C5MbjJyG+LblTFoBdjhLp/i6QVKgD1PeqfH7pLdGRg38VTqYL0AyR2x0ps9ylkuueRFgPPU2MH+9Zrj3tZw4syW0v4txlCqZK+90z8q04YtvSBdJ2zPe1Ekiez8hX3stoUnnvgH15AVduZrPg/sqnCYAGna3/AIxVsnJIY+hrL8SvLu5SSCQi3j1hlRsls8x9jQ2xnQagNf8A1cqx5kYwxP1FdeGNtLZkyTSkdBKEv5HTV/FQjJxkHn8jkVVWN5ZJVQAkMeZxsd8+nWrM8HhX+qM4Ug4B5Hbl86la0wfCjK6iv/qJC3wY/L/Xz26Vq6Mm2O/EtBYtIpzJdttKRv4YJBIHmdgP+3NUSn8FiRoBj2XqMb/tS3Fwum2I90Ea8DoAcKvyA+5q1aojYdl1rGGLAdTjYfM4owLt0CMmJc4CnB5c6SNQSJHUBDzI2+1TyK5yukZPMkZqsxwXy2r3Tk0afoBqtk8Eoim0EgRqSMYz160SjlmQgQk6eeM7cqDz+7dMOYOD67UU4aulhqbkGIA5j3T9KGSQcL9Es88V1GDJnB3DY+E1WunlMgVmbwox7gJzgeVL4n4Z8uisjeZzSMY42KkMI2GRg5+Y7UDX2EpOqIUBkcnGR0BqwYzI6RjcNtjrzrokVInKNqBO1EeCwrLxCIuPdjYE+dU39ES2G7/2Y8XhsckG00SDV050G4NxGXht5okyMNhgehr1Lh4SW1LEhc7qT0Hb51577dcL/CcRS4RSom5js1JW9DunaPSeB3AurZW5/wCdaLogI3wRWC/004g08LQO2WQYIr0S3XI2NKlGw292ReF/KBj0qKRcD4cVf0jHQVDOmRtgGkuNBKQIl5kCoxGedWpYwDmmBNt6qhvKkD7w4jORWL9oMsj/AGxWy4kfdIzsKxvHFBicnzO1OxoqTtGf9mFhbjixXMvhRSDSWxnIxjlRD2+9hZ/Z6RL2xSSThkoU+Id/DPY45A9KEGAqFYHDDcEcxWn4P7ZXUEH4Li6G8syNJRhqB+tSU5wnzhv7RI4lkiovRhIo5ZlxDGJckkhfjUdc+VNjVAx0khhsQwH0rV8U4BY3N4bn2ZvIojpL+A7lShz8IJrNTq81wTcuBKvunbb7VphlWTr/AOmfLhli1LsiNu52iQse2d/lVq01g+G0eG5gNyI7etMS3m0gxuwx3GV/tVxWlAHixNkfmB1D543p3Zn6GSqukShNOeY7H+lNW8a2dSYyEPVf02/pVksrbE43zozv8s9KiliSQkMukKN9Kj3R+4oemX/RYkmilhErBF/7mG31FQ2yqZhoYbHOAedQkEhYl0sFHIDBpLVRIdGplckKv96GW+gl9sOWUQacEzPDIASkqb4OPdBHrVvjsZvlUXSGGfSMqRga8bMPJv1oOkwQxu6n4vDfbbVnY48xRXjt293bpKQGgjQINsSQ+R7j136iktNMemmAuG3JhvI9KMBqCkcwB0P1rS8FlWG5QTKFRn0yKyhtDDr+4rLFS9w4Z1Cg5zjOARnl2ovw55HnbD4YMGXVkkjAGnPl59qmSPIvFOnTPUeFRLHHqOAzHVqG+R+XHlRGQsoyM6jyIrNeyty0iLEyZjYnSTzUj9s1pFOvfVqCnCnvXBzJqWzodHHkMYx5VC/P51OxBYA88b1BKctSEEEs+8aRih5A+prgd6jaQRqWYDAOTnaqiU+ivPDHHFJNJOyKNzlt6zE/H727knteFCSVR7pnYAKnz70Sv7mT2gaS14fILe0T3XkQZ8XffBz3H0+VdD7N2iwCIyuUTkus/TGwraoxx/y2wU7WzIXHCVkm18bv2Ync6n1fbkKq3d7wmxeWKyjmuZcoImhATPcHbfNehWvsvY3NzgQxRxxkM8mgYUfTnVH2m/BcLHicHhSPKvG8zpliGH7GnwzcqT/9F8b1Hs8v9oIb22mkM9s1qz6Z1jL5Kjpk98UGic2shRkV44yUK5wSc8we/LetV7WR3DxQvczanJAZ2yS+QOvzrL3iKrMdZY5zkLnfkc+ddXDK4o5nkQakFQQLSWQEmTQTEM4Kjvv25D51Yt4fD4MFULrlDODtkom+/MZJbl5VFxWwktbhInI0tGjv2VcZ59c1ZS0mmV2f+HaqoWOQr8Q7KO+5z2qSknGy4wfKmALi2kg4j+CkUZiVcBu2Ov1o3FF+FtzJGhi1jThjnkRvvy5cqlYQQfxpk07e6AdyAMAk/L+lDuM3TS3GgMqqihcL3xk/cmo5uWkUsaxq5bZR4jPFqZY/h3OAdh86GSZMR0DCsdydsYq1JJhG0AYXfvVYCSaQK2CDn4uSjqfKtGNUZcjbLF4whvHRRkg419thyq5w1G0uRnJjYD1xj96o3DfiLhHXOH0jHmNv2+9a/h/D8WSGSLUjNgY5g9ftmgyyqkOwRuzMtNqjbL46EGmwS+KDDIq5/KcY3+VWeP2aWN0VifUpGfMeRoW7BSGDEHnkVcXyVi5Li6ZfhdY4+gOeRrQey6g3xULnKMRv1rOZ8aJJ1I1A4bsG7/OtNwqA21zZyYLeIAx9R/Y0ElQcNm84KVfePOnn6UK/1EgR+HLINyh1MT2olYS7sqrg81PKhvtdOTwyaJjqY5LEdRjt0ApUexzVme/08uGtvaGNOYkUrXsVs+APd39a8W9lVePjUMgI2YV7JavlAT9ak1TBW1Zd1ZwdOagnO2/2p/i4wOYqKU56ZpMwolZwM8vpUU5Crtueuamx9KoX8pGdPOgoMF8QkDZHesz7QLotCADqk90VoXJLbpn5ig/FozMxYgaY8YA7k4NOiqDZnpoAEUAHYVGIc7Y+RFEJVJQZ35jalsbWW8nWGEZZzjlj5nyouKrZcW10R8D4T+KuZVnhDQIuSdI3PQA1Hx7gsMeWijWJyBpCjA5VvooYOH2f4YEEqOZHxHqaDzWLyym5uB7qZZEK5J25msay1K10apQ/IvkeWmaaCUpIi6h3GCav2t5G2PFGMdSdv3or7ScOE8EdzGi5C45Y2rP2+pJNLbgnmenrXShNTVnKywljdF+eQGTLKRnl/auWRXIRcb7AE4qF0DDSP4ZAzgnl5juKiEpD+FMACDg0UkJTJEUwXOplBQjcMP8AP8FRxT+HPoJOGOO49RmrgAnt3BZRLHgjWd2BOOf03oZPDKs4C5BJCg9QQeR9KGO2FJtILwSnwVwBKhJMkbHcjmCB3FOvJPwt5Grys8Uy4wxOAvY+nahczGSRwuw1gjHfl+9W7+7/ANwtYTcM2uFVYOOoO246kY5896qvsJSra9DJcxNkoMplDqO+FP8AQ1ftJYluo3SNirgKFc5DYPI/IfaqJQyRlOcrR7HucYI+YptjOymIyMQ6AgeWD/zVNWgo6ZvOHzm1VZY3bQgD7DIG45eeDj5Vtbe4E0KyKQBIobdu/mKwnAWNw0TFAoKBG2yCCf6mtLwC9xNNZyOA8Z/hDA3U81HpvXI8iKkn9o6i6TDhYFcg5qFqkU6sHHMZ5Yx5Ux855bZrmjb0EORzQH22umteCyCNgrTkRgnpk7/ajx5kd6zH+ocf/wBoglI1LHOpbPQHajw7mgfRe9mbRbThcSAtqwrOW5kkf0xRFSqs6NHg7nJY71V4VIs9rGwJzp0Eg+WMbUZtOETSMJpm8KE4DF+bfKjdzkwG1HsZxAizs4rYEpJMPEcjseQoLxDgl1ecNnMyJDGFJLSHTqHl1rXrJAkxkkiLSpsGkUE48qGe0HtBZ28X4idFkC7ABviz032psce+Vkh5Eox4Rj32eS+307pwiOzKKixlZX2AIbTgKPUDP3xWMmTAhJRwsp1ZzsQT/wAVrfaGO540lzcSxySq+ZBzXDEDTy2yF2wedZ++iH4lTAp/DQSCIbEYJXVjHfY/Su1gXGFIwZ5Oc7Zpbfg6ccuYERpI1UYdm7DkPpTOKyRxyAKf4ECZjjGwKjkT2ycY8t/VvDOLS8Osrd3AJLFIgBpJJO5PcAfIE0KuL55Ymd9LSXDtIxz54GfIDP2qoY23voOeVLa7KUkjXV3rnOrfUyjYBRv8uwqhNJqkOW98knAHWrs3uWh0KzPck6TnB0A7k9sn7LUMFqCPdGrP5h19BWilEyW5MoGIlgSVZj+UGpEVYrG4Jwzu6xauw3ZsfRR9aIycPjtxiZwudyo5+hqvcSxJAUhiJCsG945PLFEp30SUK7BcJeKVT/Kcg9K9J9jrkXeGljP8LtvzG+B/nKvOPG8WUKoC5OBgVp/ZHiX4W6yx92Tbnjbp8/60vyIuUbG+NJJ1Yn+oAReLqVX+HnTny6/T9qzM0RGF7bUa9q7j8TxaT3iyrtnv1z96GuoedMjPLO/lR4/jBAZVymxlufCJVs+HIMH9jV2wvZrASe8SsZBRTuB3rQWHAluLcxXAwM5zt7p8jQriXCWgmFszNg+8GI3I/tS1mjJ0FLBOGzX+zfHYOIxBPF0yqMac4zVT2nvAloyBgfF93HlzP6VhJYJuHXiurgMu6sP1I6UZM03F7iNCoGB7x6DufnROCTtEjNtU1sPexUBnuFmORlsj5V6dbvhdmxWQ9lrQQRBlGkAYGRWojdAdxvWdy5Ox3GkkElcY33pHO2R8s1XRsjbb1p4O+59KjVg6EkbKkjbvQi/kxsDRa5bRETtWZvpS8+kk4quIUNj4wWzpJ1Hr2qhxOMLEyr1XAotbIFhAxUo4P+I0y3eY4h+Qc2o3JQXyL3J0jGxWk13MY7eMux+LA2B71o7Hg54dZl1Ou4cAsw6DsKM262sMemzjVFDYBBBBPYkdallCDfoTg9D/AM1hzZ5N8apGrHBdmda9VpND4Wbozbb9qqXPE0kWaCVhFNEDqXPxDoVPXnU/tPZW80TOGCOBkMNtVefcV4hJMwSX/wDJh90SciRvsfOixY1PaCyTcNhvjvEIIrUR8iVII51jjKPHbUNG3M9D2opwu5s5Uaa7Ot41/NyoJes8ty8xQgSHUPMV0MMKbRg8maaTQUPvwjPNd9J5jzHlVW7AaNW31fAflyP7fKpLSXQsavyON2p9xiOTcaom2Ze3bH9aezGNsJtWUf4xnBPpuPOrCxNP4fh4G2kbYxjv3PT0xQ8qbeaQ7Ecx6d6u28hjaSMHeZQyjPX+/KltP0Mi10ynIWCspypL8j5c6cjqscAIyDsx7gjf7Uy/kaWeIsN2wxPcn/PtTkIeYAbIo0gj+Y7D9ftRLoD2y1Ze9PDExbAcA6ef+b0+9VIriRonUK0zgLywMA1FCSZnY7Ohxtt8/UV0rNMySKmnxXJAHyFLa+Vjk/jX7Nx7IaWgizry2rJG2d1x9DV7iUp4fx63lRsB3Kvnljbf71X9kIg7H3cLApA9f+cVN7UIJ+IPEoYPHGX2HLAH9K5UneVo6sf4o2gBDc9iMjz86aSOTcj9qh4fKZrOCTIKtGCMctxnapZNiN8+lctqmH6CB3J9arcU4Y3GOHTWKJqeVcL5HoasopeTSoyxOAO9azhfDUsrfU+8zDc9vKmYcUpy0Jy5VjX7PPPYdjw1JPx0Lu8Z0OcEmEjZlK89tjnsRW1FzqQzGQSRHdSpyCKB+1tjcWN2/GOFBvGwPGVAM5HJxnmcZBB5g4oPa8YseLQIwmexuRkukbBNXoD++45GtrXtCq/J8gj7TcR/D27TwymFk2UAfEegxXnkl3fcb4kpuWEPgSBwjnC6eWf/AJAZ9a0PHLO5u7CRvxJnjVtA1gBt/Tn0rC8WeQCO2R3nkIwD+Zxnlkc6fginv2FL4xoJ8f4/arcX1rapG0UrFl0cw3ruNj9aw08sauZEb+J3Y5NXbqxkjlMc2mFyNWgnSPmeWaqJBE9zFjLZI3xyArfCKSME2+ghxSYNfiIHMVuoiUqcrk88djknaq6RvJMEYlUUZZhyVB+5PIdyBSXXh205OdLyudQ5ty6nl1q5w68jtbIlV1XUxGlFJGgeR/mPLV0UHHOjWlaKe3THpYSXUniTZQBQdAGdCZwufLoO5zzq5xJ4uEwiKFQlww+EgZQd/U9B2yetE7yGHg1hbtM0bHHjKyjPiy4+LG3ug7Afyr51lbiXxrkuzOXc8zux9TSV83+h38I67IJBJL/EkOkEZyxxk+VUpWXVoGSDtsNquXbiIYUFids5odK3IMdzzA3NPh+hEtOmMjJacq2zKrHOcY260U4YieDIpyGVchj3oUMtJsPe7ny71fAKRNGDkA4PmcUWTaorH8XZC4aZ2f4ixx+2au8LgE/GIoSRjVjngkgVHCiJpLMACRn/ALRyH3or7NcNS6vHivI+vht0w3cHvtSpy4xbHYYOU0glb3HF+HpphtormJtgS2k7dKjurLjnFtBa0itwoyuWyTtRNre+sEiCOt3Ex91HHvL/AForZcZt4QTfJLaAc/4JwfnWDm+4JM6koL/laPPeLWIt44gXZ53BaQHA0DsR3zWq4T7P3VpZxyvESGQM2kbjbqOdVOF20ftB7VpNc6Y7UyBmHLYfCPnjFeoT2sfh5GcjkRV5vIeOomWGKMpNmY4dMYsDOKLwzBwKUcLjumOdm/mHOoZ+HXVkdRHiRj8wHL5VMeeMtBTxuLCCSjano2Ty2odDOGAwaswsznCZJran9mRxZJeyHwsg0Kt+HXF5PrRdEY/O3L+9H4rFWw0/vnt0q5oAAAwKxZvKSdQNOPE6+RUtLKG2QZGpx+Y0y8kLxkN8C+8fOp5UZsjJAqjxA4snwfibHrXPc5Slyb2bIY0tUUIZjJI6RjmukKBy3B+gxS30sjMRCoY4Bx0GeQpOFGK1tp9ThXk+Ju9C5PaCMM8cEZkbG4UZ5elMSclpBuPydIpcSs7mVs3MuxPwKedZzjfDrZoSiAo4X4xzyf1FFOLXN14bS3IS2TBYNO2CPQVhL/i0k5dUdtLnJPLNdHBjk+jN5OWMI1IoT6onZDgnO+nkadDKzK8btkAEgnfH9qY5MgDZUHtnY06IAK523GNvWup62cJ7ZeXaFVZdyoXA3742+VWhmS3SRTqxsfPyNQhR4Khjuih9u++BUiKVhaM7Z3GOXM0FaCuhLiPNtpweZUn1xp+hpbS7mtBHcRojhW0MrqCDjkD9+1cZssYxyKhs+ec5ohwSKyvklgbEUzRsWjYgZIx8BJ3HXB3B5c6VdLY1K5fEr8XgWYrxCGM+FKusL0Q8yB/nWhNjmS6EUcZOxzvn5+o51q4Ld4oPwM0fjRDAyNjlhzB5g+XzoDPYeDxFY0bCpHreVgc7+XU9AOuarHNO4hZcbTUkSuRE+sIC82HVtXLI975c/njsaIcESFbwXMymSO0Uz6e4/IPUt+lVWhd7G2mmXBgLIVzuy6s/qSDRb2Rso7y5jjnXMRl8WZgfyD8o9f8AOdKySSi/0NxwdnpPsf7NOvAUunmHjuutw3Inmd/XG9A7GKa84nxS7lRliEbBQeRyuBj5Uf4zxsR8NFjBmI3eEiRPiC9T8hWg4fwm34f7NzRzRgK0bysp3x7p++1cm2237ZucnDszHs1IW4JZ5Of4C/0q+2dvWu4PwmWD2Z4ddxkvG9umoY3XbP71zfEKx5FU2NTT6Nb7M2Ay15MOuI8/rRmZ9iaQ6beFUQYUDYCq0s3uFjy7V04pYo8TlSbyS5Mp8QYFX5YI71597RcAtrqdpYHEEpO5J2JH+c63UrmRXYdNwKyHGZ/AjuZnIYxqTSuT5WjXhRm+OX8kdmnBeGfxbmQgGRW95E2BJHQnJ3HSncN4EvD4Hkdlacga2Iyc9vIVnfZWWQ8Rn4nN7zlzGX/lyc5Pl0rayyiWHnlj160/I+HxX+RmOPL5swntVEZD0JXI2Oay6ObWdXG0gyAT+XI5/wCcq1nG1cXJDZGTWf4raG3IynuNupPL61swS1TMvlQ3zRDdRm4cyJsVxIAATnuM9OfWp+DxrJea5yFigXLHIyTzAHn/AEqt4ZmgGCQI9mzzA6GmwTExMMlcAqRnt1+9PfRlWnZop79JLJr66JllOUgTOfDHz588Z7770IgQSXCAqwkcZbeq7zvJ4as2oDGx36CrEEh/FtJpyeX+Gha+LDUrkiDiTjxDHD7wAwW/YULl9wgYBJq9dZ1u5IxvgA7mm2Vq7sJZOROy96uLUI7I05z0OsrI+FrYe+e/QVKkfiOQPm2dgO9GTAqW7auekDI79qHIrMFUABWJ2HYZyaFNy2w5RUdIrz4LCJRgA5z37fatp7P2dxbR2XjsGVyGCld1PQZ54xQHgXDZOIcXVNPuhve26DnW+u1KzWTYxqkx9jWTyZ18Td4cKbkyrxCSKGKFpYXcEnGjG1C+PcTN/DFw60UoGIL6hj0z5DnRPjU6xWkbb68tpHem+ztjJBILi4t/Fmn3JyMqO2DWOFQXN/4N+T5pY1/ku2fslwKazjijuFeZecySDVnviivAJJ/wlxZXTmSW0lMPiHO4wCPtUzW/D3R57q38JUBYlk7czmqvB+EL+DE6XEkDzuZiivyB5AjuBilTm5RakxShBP6DVpEqbk1eCKy455oOtvxGL4LhZR0DJv8AUVbtmumx4iqO5B5Vn2iSgu7GXvBoZ21x/wAOTqV5H1pkSrajw2XQf1ogZfD+J0HqaZIYrqMo8RlVh/L+9M/LJri3oUo1uiD8XEBzA+dVrni9pbgtNMiAdS2KrR+zccbMf4sm5I8SctgdqevB7WA5FpGW/mJyfqRV1EcuHorHjyzlfwVpcXAz8YXSn1bH2qxxUH/bttjq2I71MFwQBCvrr/tTeIKW4dkYyGqOvQWrRm7Dhkc8xe6ZpiNx4rZGfTlVf2k08ImW8t0VYTgSpsB64+1XrbWtwwml0qeijH3q5dW8N1avAYtSsME4yfrToTp7LyWzzrw//qK6a9vmENmn/TiLn3yPzHyrIXCapCrhQBsNI2FbviHBOK8LnZbILdW/5Ezuu22B/SsnxGxvhLJPNbupJy3rXXwzXp6ORnhrrfsGLAcbZZT25ineGwACpkE/EDmrMWrUNOx+1EBCLiEiaIB/5uX3rTy+zC410ULd/FLFhgOwGD/KBU8jkONORqbGrr/nOmm2KBjBuwHwk4bzx3/Wq/8AER1w3wA4B2OeQq00DVFxnUX6yMFIVcggbnnViGDF0buFV8IrlVZgNxsSN+eRQ7+I7nUdIG2SOlSPfmMeEQrRcwOePMGlyt9DYUtyDy38sUZWOXUjLtnmBzx6ctqivpkuYGkGdap7+Nmx6jnQ2GdTAdEmVzhR68/1pbSRzPpG/wCU1ncadmpS5aLdgTJayW/hkM2Cnr2+YH6VpOGzQcG4dLI2TI7jLbZ5bAetQ+yPDYpr1vGVmhjjM8+M7heX64rScP8AZmCT2nhE+qSzlj8WCMn4FIzz7g0qex2PRa9i7P8AFXf+8cX958YhiblGP61qPaHiKLwG8ZX0lkMQbVjLN7u31qhwNbKFbZGDNM8v5ULADOArHp3qnxJLe/8AafhXD43uPD/E+JNGyaQB0wc771i/HJy5DZVZ6DwWKKHhttbBQI0iVCvPpWd9oOGnh9zqQfwZD7vke1bO2jjij96NsncZwevSq3FrSO9tpIHGAfhJ6GhliuG+zJjzVNv0N4jMQcasDlVXiEnh2BYNuRnPeqXHrgx3AVdyOYNP4xJ/9pgK7Kyg71JSttlxh/H9lPhdx4lx4crZ1rgUA9p7UtFeQKMFlYAefSr0bEMGTII3HrS8aCzSCUH41B+dLv2a0uMtHk3shdx217JaT4CynGTWmgjdbvw4pAUHLPQVnPang72/EJZ7cHLHUd8Y/tU/s5x/Tdxrekqw21nf6962zjzXOJeN8PhIO+0fCWmtDIgXI31Ak58qyfEYpGsUk1CJo921DPLb4evz2r0pZbe7smWKQOD1B3wedY+/s1sr0hRqRz74YYx5edDiyNOn6LlHmqMaGgWVoVHhxjZdsAn175zt25U22it45z+MSQocgaWwNXTOxOPSjk/CDbcQeGF/Djm3hJOFfbkc9QTzoY1tI6LGx8STVo1g9SdsdSK6EciZz542tMH3KyWc4V1CahkFdwR5H/MHnTLdmM6qmWYsBg/eiF2Y2Z00q8asFViTkgDGex5Zzz3qIcNmvDpskBUfHnmB5np8udHa9iuDu0U2iBmKM+VznbfPzq9ACwQAAYxipnsre3YfiJlV1ONAOzkjO56KOvrURuowRIsups5z386VO5dD8VQ/kTyXYlnWFG2Huk9yeZp48Ms0ir7oBCrnpvj9BQq1lzMzkjkWzgdTgUT4TE19eJANwWGR/nlTbUVTEq5ys2XsVYG24YbxlHiTNsc8xn96IXzD8TaFpNlfOFGANqma5it7URW+NKjQoH0oTdu9xKiIQNT435CuTJ85Ns7OOPFI6K3/ANwuTOR/AjOFGeZovZK4lAEh7b0hSOx4ZFEhAVSdTH9c1DbNLc/9NmhhPxS8mYf9vb1+lJnJz/pDo/FX9haaVuJT/ghhraJgbhl2DY3Ef6Z8vWisrwlPfQH1UVQsvBghSKFAiJ0HSnySatgM0qTFVsmY2wOQun0yKcpgPMu2P+9v61EkYzlqnjCKNsZoKCbJYzChzHGAe+KnDMR2qFSvPnT9YaoJbHNqO2s+eKrzKSDu31qckdKik3zp5VOiJ7KEhKMQXcn/AMqlucHhjY6EU2YBWODipGw3DpQOi0THX0Zpxi622GaMx4WNSuAT0xQW4wt2N9zReIgwqO+2aYgp9FDiEAcs35ew/WsJ7czC2tBFHgPISAAMcuZr0m5RQMg49BXmv+oNkI7uOUNqLgjSegAG9bPGaclZkz3wdGLguWGPE97z60YsrqJ1wkmhsY3HP5UNWKMsNSYx8QPIj16VaSBVuA0S4QnZS+plH2zXXbRxaktFyUKGIkVWz1UY+fnTTEk4JfEpO+pNmXzx1qJ2ETYCrGeeAdjUkbo43Olh360qWnoZF3piwQouNKjwz7upsnO2+1Vm9n7mZz+HTU2C2ny7+lGeHsUkDMMsDjC4JP8AWtb7MWUUkr3E0m2CTnA386zzzSx7RrhhhkVNHnMHB+IxHSbWQEbjb5UZ4TwWUBprkKi5wBrAYnPIedbTiyxSFW91EOQmkn6/OqEduDIGKY6n50mXkykrZox+LFdBXhDxWHC57W2gYyTOviuN0KL+XPXJ50Y4Zf20E8MzWBglt3bX4MeF0lds5O1V+EcQ/wBvsWtvCVy0gcOX2A2yPt96fNxyKOGaOKKSVnXTraTLLs25JGPzfSlc79jeHar/ALjrPiFvw2MTz3t7DGjNLJCkJZTg7jPpil9npEveMx30l7fXAMwlEUsJAiUjIA39KEx8aN/xcXTwv4UaGNUV/cdgwIwMeWCevlWo4JeRpJHGsLqTpDlX6hdIxt51c5KEKsHhKTcmv/BshxBIZ4ldXBVAvLbc5NWEZSAUYsB1PWs/ccaX/cZV0MWWTRs+2ARv6+frRW1uUfPuhWbLEdPkKzc1dWZJY3FXR//Z","data:image/jpeg;base64,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"];
/* v59:AI 面部贴面图集（5 联：4 女 + 男主，羽化由 shader 做） */
const FACE_CARD_B64="data:image/jpeg;base64,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";
// ================= v63：视频数字人（Video Human）=================
// 彻底替换所有简构图形体：人物 = 真人视频贴片（永远面向相机）。
// 每段素材 = 彩色 mp4 + 灰度蒙版 mp4（亮度即 alpha），在 WebGL shader 里合成 —— 零 CPU 成本。
// 所有角色共用同一组 <video> 元素（同素材同相位），实例仅是不同 tint/scale 的贴片。
// 原 3D 骨架（J 关节）保留但全部隐藏 —— 步态/受击/升级等全部游戏逻辑照常运转。
/* v64:全身数字人立绘（三件切割 躯干/左腿/右腿，webp alpha） */
const DH2=window.__ZA__&&window.__ZA__.DH2?window.__ZA__.DH2:{};const DH_VERT=`
varying vec2 vUv3;
void main(){vUv3=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const DH_FRAG=`
uniform sampler2D uColor;uniform sampler2D uMask;uniform vec3 uTint;
uniform vec4 uCrop;   // x0,y0,x1,y1：截取视频里人物所在的子区域
varying vec2 vUv3;
void main(){
  vec2 uv=mix(uCrop.xy,uCrop.zw,vUv3);
  vec3 col=texture2D(uColor,uv).rgb;
  float a=texture2D(uMask,uv).r;
  a=smoothstep(0.30,0.72,a);          // 蒙版二值化过渡（离线已羽化，此步去压缩噪点）
  if(a<0.01)discard;
  gl_FragColor=vec4(col*uTint,a);}`;
const _dhShared={};    // clip → {vid, mvid, tex, mtex, ready}
const DH_HUMANS=[];    // 所有实例（主循环统一转向/更新）
const DH_CROP={        // 每段素材的人物裁剪区（新蒙版实测包围盒）
  w1:[.285,.038,.713,1.0], w2:[.238,.031,.733,1.0], w3:[.223,.038,.725,1.0],
  m1:[.197,.027,.795,1.0], m2:[.221,.038,.803,1.0], m3:[.189,.031,.803,1.0]};
// v63：各角色场景身高 / 脚底高度（协调比例的关键参数）
// （体型表 DH_BODY 见 mkVideoHuman 之后，统一 sink 语义）
function dhGet(clip){
  if(_dhShared[clip])return _dhShared[clip];
  if(typeof DH_VIDEOS==='undefined'||!DH_VIDEOS[clip])return null;
  const mk=(src)=>{const v=document.createElement('video');
    v.src=src;v.muted=true;v.loop=true;v.playsInline=true;v.preload='auto';
    v.setAttribute('playsinline','');v.setAttribute('muted','');
    try{v.play();}catch(e){}
    const t=new THREE.VideoTexture(v);
    t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;
    t.encoding=THREE.sRGBEncoding;
    return {v,t};};
  const c=mk(DH_VIDEOS[clip]), m=mk(DH_VIDEOS[clip+'_m']);
  const rec={vid:c.v,tex:c.t,mvid:m.v,mtex:m.t,ready:false};
  c.v.addEventListener('playing',()=>{rec.ready=true;},{once:true});
  _dhShared[clip]=rec;return rec;}
// 构建视频数字人：返回 {g, plane, clip}，g 需挂到场景节点下
// opts.height：贴片高度 = 人物头顶离地高度（素材可见到腰，贴地呈半身立像）
// opts.sink  ：底部沉入地面深度（遮蔽腰截断线，防"漂浮"感）
function mkVideoHuman(clip,opts){
  opts=opts||{};
  const rec=dhGet(clip);
  const g=new THREE.Group();
  if(!rec)return {g,plane:null,clip};
  const crop=new THREE.Vector4(...(DH_CROP[clip]||[.30,.02,.72,.98]));
  const mat=new THREE.ShaderMaterial({
    uniforms:{uColor:{value:rec.tex},uMask:{value:rec.mtex},
      uTint:{value:new THREE.Color(opts.tint===undefined?0xffffff:opts.tint)},
      uCrop:{value:crop}},
    vertexShader:DH_VERT,fragmentShader:DH_FRAG,transparent:true,depthWrite:false});
  const cw=crop.z-crop.x, ch=crop.w-crop.y;
  const H=(opts.height===undefined?1.72:opts.height);
  // 裁剪区像素宽高比 → 贴片宽（人物含张臂的包围盒比例自动保持真人体型）
  const W2=H*(cw*512)/(ch*288);
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(W2,H),mat);
  const sink=(opts.sink===undefined?.05:opts.sink);
  plane.position.y=H*.5-sink;                 // 头顶 = H-sink，底部沉入地面 sink
  plane.userData.noOutline=true;plane.userData.dhPlane=true;
  plane.renderOrder=4;
  g.add(plane);
  const sh=blobShadow(Math.max(.7,W2*.5));
  g.add(sh);
  const inst={g,plane,clip,rec,W:W2,H:H};
  DH_HUMANS.push(inst);
  return inst;}
// v63：隐藏一个角色组内全部 3D 形体（保留地面阴影）—— 原骨架 J 继续驱动动画逻辑，只是不再渲染
// 只隐藏根下直接子节点（部件 group），后续挂入这些组的真人头等新部件也随之不可见
function dhify(g){
  for(const c of g.children.slice()){if(c.userData&&c.userData.isShadow)continue;c.visible=false;}}
// v63 体型表：贴片高度按真人头顶离地高度设计（男 1.72 / 女 1.60，避免"巨人胸像"）
const DH_BODY={
  hero :{clip:'m1',h:1.72,sink:.05},
  woman:{h:1.60,sink:.05},
  enemy:{h:1.72,sink:.05},
  tank :{clip:'m2',h:2.10,sink:.07},
  small:{h:1.02,sink:.04},
  boss :{clip:'m3',h:2.90,sink:.09},
};
// v63：男主整体替换为真人视频数字人（原 3D 形体全隐藏，动作逻辑照常）
// v63 挂载 API：暴露到全局，避免更早 script 块中的函数在 TDZ 期触发异常
const DH_API={
  ready:()=>typeof DH2!=='undefined'&&!!DH2.hero,   // v64 起以全身立绘为准
  // role: 'woman' | 'enemy' | 'tank' | 'small' | 'boss'
  attach:(hostG,clip,role,extra)=>{
    try{
      if(!DH_API.ready())return null;
      dhify(hostG);
      const b=DH_BODY[role]||DH_BODY.enemy;
      const inst=mkVideoHuman(clip||b.clip||'m1',{height:b.h,sink:b.sink,tint:extra&&extra.tint});
      hostG.add(inst.g);
      hostG.userData.dhInst=inst;
      return inst;
    }catch(e){window.__dhErr=(window.__dhErr||[]).concat(e&&e.message);return null;}
  }};
// ==================== v64：全身数字人（AI 全身立绘 三件切割 骨骼动画） ====================
// DH2[id] = {t,l,r,w,h,ar,yc}  t=躯干(头+上身+手臂) l/r=左右腿（髋部分割）
// 运行时：腿绕髋部前后摆动（行走）、躯干呼吸起伏、整体 bounce，全部面向相机（billboard）
const DH2_HUMANS=[];
const DH2_ROLES={      // 各角色类别的身高（米）
  woman:{h:1.62}, enemy:{h:1.74}, tank:{h:2.02}, small:{h:1.06}, boss:{h:2.35},
  // v65.1：小怪分型，避免五种怪清一色同一身高
  chaser:{h:1.70}, swarm:{h:1.60}, shooter:{h:1.80}, bomber:{h:1.72},
  // v65.1：Boss 体型分层（越靠后的章节越压迫）
  b1:{h:2.20},b2:{h:2.24},b3:{h:2.20},b4:{h:2.32},b5:{h:2.28},
  b6:{h:2.36},b7:{h:2.30},b8:{h:2.40},b9:{h:2.26},b10:{h:2.44},
  b11:{h:2.34},b12:{h:2.48},b13:{h:2.30},b14:{h:2.52}};
const DH2_MAP={        // 游戏角色 → 素材ID
  hero:'hero', g1:'g1', g2:'g2', g3:'g3', g4:'g4',
  g5:'g5', g6:'g6', g7:'g7', g8:'g8',
  chaser:'e1', swarm:'e2', tank:'e3', shooter:'e4', bomber:'e5',
  b1:'b1',b2:'b2',b3:'b3',b4:'b4',b5:'b5',b6:'b6',b7:'b7',b8:'b8',b9:'b9',
  b10:'b10',b11:'b11',b12:'b12',b13:'b13',b14:'b14'};
const _dh2Cache={};
function dh2Tex(id,part){
  const k=id+'_'+part;
  if(_dh2Cache[k])return _dh2Cache[k];
  const tex=new THREE.TextureLoader().load('data:image/webp;base64,'+DH2[id][part]);
  tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;
  tex.encoding=THREE.sRGBEncoding; // v64：renderer.outputEncoding=sRGB，纹理必须同码否则发白
  _dh2Cache[k]=tex;return tex;}
function mkFullHuman(id,opts){
  opts=opts||{};
  const g=new THREE.Group();
  const d=(typeof DH2!=='undefined')&&DH2[id];
  if(!d)return {g,torso:null,legL:null,legR:null};
  const H=(opts.height||1.74);
  const W=H*d.ar;
  const mkMat=p=>new THREE.MeshBasicMaterial({map:dh2Tex(id,p),transparent:true,depthWrite:false});
  // v65.1：NOSPLIT 资源（多人横图，如 b13）不切腿，须整幅作单件铺满身高；
  // 否则 yc=0 会让 PlaneGeometry 高度为 0 → 该 Boss 完全不可见
  const isNS=!!d.ns;
  const yc=isNS?1:(d.yc||0);
  // 躯干（头顶对齐 H）
  const tH=H*yc, tW=W;
  const torso=new THREE.Mesh(new THREE.PlaneGeometry(tW,tH),mkMat('t'));
  torso.position.y=H-tH/2;
  torso.userData.noOutline=true;torso.userData.dh2=true;torso.renderOrder=4;
  torso.frustumCulled=false;
  g.add(torso);
  // 左右腿（pivot 在髋部切线，geometry 平移使旋转绕髋）
  let legL=null,legR=null;
  if(!d.ns&&yc>0){
    const legH=H*(1-yc), legW=W/2;
    const hipY=H-tH;
    legL=new THREE.Mesh(new THREE.PlaneGeometry(legW,legH),mkMat('l'));
    legL.geometry.translate(0,-legH/2,0);
    legL.position.set(-legW/2,hipY,0.002);
    legR=new THREE.Mesh(new THREE.PlaneGeometry(legW,legH),mkMat('r'));
    legR.geometry.translate(0,-legH/2,0);
    legR.position.set(legW/2,hipY,0.002);
    legL.userData.noOutline=true;legL.userData.dh2=true;legL.renderOrder=3;legL.frustumCulled=false;
    legR.userData.noOutline=true;legR.userData.dh2=true;legR.renderOrder=3;legR.frustumCulled=false;
    g.add(legL);g.add(legR);
  }
  const sh=blobShadow(Math.max(.65,W*.42));
  g.add(sh);
  const inst={g,torso,legL,legR,H,W,id,phase:Math.random()*7,spd:7,lastPos:new THREE.Vector3(),moving:false,baseY:torso.position.y};
  DH2_HUMANS.push(inst);
  return inst;}
const _dh2v=new THREE.Vector3(),_dh2q=new THREE.Quaternion(),_dh2e=new THREE.Euler();
function dh2Tick(dt){
  if(!DH2_HUMANS.length)return;
  for(const h of DH2_HUMANS){
    if(!h.torso)continue;
    // 移动检测（上一帧位置差）→ 行走摆腿 / 静止站立
    h.g.getWorldPosition(_dh2v);
    const moved=_dh2v.distanceTo(h.lastPos);
    h.moving=moved>0.0005;
    h.lastPos.copy(_dh2v);
    if(h.legL){
      if(h.moving){h.phase+=dt*(h.spd||7);
        const sw=Math.sin(h.phase)*.42;
        h.legL.rotation.x=sw;h.legR.rotation.x=-sw;
        h.torso.position.y=h.baseY+Math.abs(Math.sin(h.phase))*.03;
        h.torso.rotation.x=.05;
      }else{
        h.legL.rotation.x*=.8;h.legR.rotation.x*=.8;
        h.torso.position.y=h.baseY;
        h.torso.rotation.x*=.8;
      }
      h.torso.scale.y=1+Math.sin(h.phase*.4)*.006;  // 呼吸
    }
    // billboard：面向相机（抵消父级 yaw）
    h.g.getWorldQuaternion(_dh2q);
    _dh2e.setFromQuaternion(_dh2q,'YXZ');
    const yaw=Math.atan2(camera.position.x-_dh2v.x,camera.position.z-_dh2v.z)-_dh2e.y;
    h.torso.rotation.y=yaw;
    if(h.legL){h.legL.rotation.y=yaw;h.legR.rotation.y=yaw;}
  }
}
// v64 挂载 API（供更早 script 块调用，免 TDZ）
const DH2_API={
  ready:()=>typeof DH2!=='undefined'&&!!DH2.hero,
  attach:(hostG,role,height)=>{
    try{
      if(!DH2_API.ready())return null;
      dhify(hostG);
      const id=DH2_MAP[role]||role;
      // v65.1：DH2_ROLES 里没有 b1~b14 / chaser 等角色键，原先会全部回落到 1.74m，
      // 导致 Boss 和小怪一样高。补优先级：专属键 → Boss 通用高度 → 默认值
      let roleH=DH2_ROLES[role]&&DH2_ROLES[role].h;
      if(!roleH)roleH=/^b\d+$/.test(role)?(DH2_ROLES.boss&&DH2_ROLES.boss.h):0;
      const inst=mkFullHuman(id,{height:height||roleH||1.74});
      if(inst.torso){
        // v65.1：AI 立绘自带 blobShadow，隐藏原形体的旧阴影，避免地面出现双层加重
        for(const c of hostG.children)if(c.userData&&c.userData.isShadow)c.visible=false;
        hostG.add(inst.g);hostG.userData.dh2Inst=inst;return inst;}
      return null;
    }catch(e){window.__dh2Err=(window.__dh2Err||[]).concat(String(e&&e.message));return null;}
  }};
// v64：男主整体替换为全身数字人（置于 DH2_MAP 声明之后，避免 TDZ）
try{dhify(heroFig.g);
  const heroDH=mkFullHuman(DH2_MAP.hero,{height:1.74});
  if(heroDH.torso){player.add(heroDH.g);window.__heroDH=heroDH;}}catch(e){window.__dhHeroErr=e&&e.message;}
// 主循环调用：贴片面向相机（只取 yaw）
const _dhv=new THREE.Vector3(),_dhq=new THREE.Quaternion(),_dhe=new THREE.Euler();
function dhTick(){
  if(!DH_HUMANS.length)return;
  for(const h of DH_HUMANS){
    if(!h.plane)continue;
    h.g.getWorldPosition(_dhv);
    h.g.getWorldQuaternion(_dhq);
    _dhe.setFromQuaternion(_dhq,'YXZ');
    h.plane.rotation.y=Math.atan2(camera.position.x-_dhv.x,camera.position.z-_dhv.z)-_dhe.y;
  }
  // mask 视频跟随主视频时钟（防漂移）
  for(const k in _dhShared){
    const r=_dhShared[k];
    if(r.ready&&r.mvid&&Math.abs(r.mvid.currentTime-r.vid.currentTime)>.08){
      try{r.mvid.currentTime=r.vid.currentTime;}catch(e){}
    }
  }
}
const __porImgs={}; // v55:立绘图像缓存
// v57：统一头像组件 —— 任意 UI 位置用 AI 立绘替代 emoji
// sz: 像素尺寸；cls: 附加类名；ext: 内联样式
// v65：idx≥4 的新女主用 DH2 全身立绘当头像（裁上半身即头像）
const _dh2Ava={};
function dh2Avatar(idx){
  if(idx in _dh2Ava)return _dh2Ava[idx];
  try{const id=typeof DH2_MAP!=='undefined'&&DH2_MAP['g'+(idx+1)];
    if(id&&typeof DH2!=='undefined'&&DH2[id]&&DH2[id].t){
      _dh2Ava[idx]='data:image/webp;base64,'+DH2[id].t;return _dh2Ava[idx];}}catch(e){}
  _dh2Ava[idx]=null;return null;}
function porTag(idx,sz,cls,ext){
  const p=((typeof NPC_PORTRAITS!=='undefined')&&NPC_PORTRAITS&&NPC_PORTRAITS[idx])||dh2Avatar(idx);
  const s=sz||28;
  const st=`width:${s}px;height:${s}px;border-radius:${Math.round(s*.30)}px;object-fit:cover;object-position:50% 12%;`+
    `border:1.5px solid rgba(255,214,10,.75);box-shadow:0 0 8px rgba(247,37,133,.45);vertical-align:middle;flex:0 0 auto;`+
    (ext||'');
  if(!p)return `<span class="${cls||''}" style="${st}display:inline-flex;align-items:center;justify-content:center;
    background:rgba(60,20,70,.9);font-size:${Math.round(s*.55)}px">${NPC_DEFS[idx].face}</span>`;
  return `<img class="${cls||''}" src="${p}" style="${st}" alt="">`;
}
function drawFace(idx,stage){
  const cv=document.getElementById('dlgFace');if(!cv)return;
  const g=cv.getContext('2d');const S2=172;const m=FACE_MOODS[stage%FACE_MOODS.length];
  const def=NPC_DEFS[idx];
  const hex=c=>'#'+c.toString(16).padStart(6,'0');
  g.clearRect(0,0,S2,S2);
  // —— v57：AI 真人立绘作为头像本体（铺满整个方形画布，不再是"结构图"） ——
  const por=((typeof NPC_PORTRAITS!=='undefined')&&NPC_PORTRAITS&&NPC_PORTRAITS[idx])||dh2Avatar(idx);
  if(por){
    const im=__porImgs[idx]||(__porImgs[idx]=(()=>{const i=new Image();i.src=por;return i;})());
    const paint=()=>{
      const iw=im.naturalWidth,ih=im.naturalHeight;
      const side=Math.min(iw,ih);
      const sx=(iw-side)*.5, sy=Math.max(0,ih*.02);   // 顶对齐：保住头顶与脸
      g.save();
      g.beginPath();
      // 圆角方框（毛玻璃卡片感）
      const r=S2*.14;
      g.moveTo(r,0);g.lineTo(S2-r,0);g.quadraticCurveTo(S2,0,S2,r);
      g.lineTo(S2,S2-r);g.quadraticCurveTo(S2,S2,S2-r,S2);
      g.lineTo(r,S2);g.quadraticCurveTo(0,S2,0,S2-r);
      g.lineTo(0,r);g.quadraticCurveTo(0,0,r,0);g.closePath();g.clip();
      g.drawImage(im,sx,sy,side,side,0,0,S2,S2);
      // 情绪色调层
      if(m.tears>0){g.fillStyle='rgba(80,110,190,.20)';g.fillRect(0,0,S2,S2);}
      else if(m.blush>.7){g.fillStyle='rgba(255,110,150,.14)';g.fillRect(0,0,S2,S2);}
      else if(m.brows==='angry'){g.fillStyle='rgba(190,40,60,.13)';g.fillRect(0,0,S2,S2);}
      // 底部渐隐（承接文字，防硬切）
      const lg=g.createLinearGradient(0,S2*.62,0,S2);
      lg.addColorStop(0,'rgba(30,8,40,0)');lg.addColorStop(1,'rgba(30,8,40,.62)');
      g.fillStyle=lg;g.fillRect(0,0,S2,S2);
      g.restore();
      // 外发光描边
      g.strokeStyle='rgba(255,143,163,.85)';g.lineWidth=3;
      g.beginPath();g.roundRect?g.roundRect(1.5,1.5,S2-3,S2-3,S2*.13):g.rect(1.5,1.5,S2-3,S2-3);g.stroke();
    };
    if(im.complete&&im.naturalWidth){paint();return;}
    // 未就绪：先画渐变底，onload 后重绘
    const lg0=g.createLinearGradient(0,0,S2,S2);
    lg0.addColorStop(0,m.bg);lg0.addColorStop(1,'#2a0f35');
    g.fillStyle=lg0;g.fillRect(0,0,S2,S2);
    if(!im.onload){im.onload=()=>{drawFace(idx,stage);};}
    return;
  }
  g.fillStyle=m.bg;g.beginPath();g.arc(S2/2,S2/2,S2/2,0,7);g.fill();
  // 头发
  g.fillStyle=hex(def.hair);
  g.beginPath();g.arc(S2/2,S2*.42,S2*.34,Math.PI,0);g.fill();
  g.fillRect(S2*.16,S2*.42,S2*.06,S2*.42);
  g.fillRect(S2*.78,S2*.42,S2*.06,S2*.42);
  // 脸
  g.fillStyle='#ffe3d6';g.beginPath();g.arc(S2/2,S2*.55,S2*.26,0,7);g.fill();
  // 腮红
  if(m.blush>0){g.fillStyle=`rgba(255,120,150,${.35*m.blush})`;
    g.beginPath();g.ellipse(S2*.36,S2*.62,S2*.07,S2*.045,0,0,7);g.fill();
    g.beginPath();g.ellipse(S2*.64,S2*.62,S2*.07,S2*.045,0,0,7);g.fill();}
  // 眼睛
  const eyeY=S2*.53,eyeDX=S2*.105,eyeR=S2*.032;
  g.fillStyle='#1a1024';
  if(m.brows==='angry'){ // 眯眼
    g.save();g.translate(S2/2-eyeDX,eyeY);g.rotate(.18);g.fillRect(-eyeR*1.6,-2,eyeR*3.2,4);g.restore();
    g.save();g.translate(S2/2+eyeDX,eyeY);g.rotate(-.18);g.fillRect(-eyeR*1.6,-2,eyeR*3.2,4);g.restore();}
  else if(m.mouth==='sad'||m.mouth==='sad2'){ // 泪眼（大而圆）
    g.beginPath();g.arc(S2/2-eyeDX,eyeY,eyeR*1.35,0,7);g.fill();
    g.beginPath();g.arc(S2/2+eyeDX,eyeY,eyeR*1.35,0,7);g.fill();
    g.fillStyle='#fff';
    g.beginPath();g.arc(S2/2-eyeDX,eyeY-eyeR*.5,eyeR*.45,0,7);g.fill();
    g.beginPath();g.arc(S2/2+eyeDX,eyeY-eyeR*.5,eyeR*.45,0,7);g.fill();}
  else{
    g.beginPath();g.arc(S2/2-eyeDX,eyeY,eyeR,0,7);g.fill();
    g.beginPath();g.arc(S2/2+eyeDX,eyeY,eyeR,0,7);g.fill();
    g.fillStyle='#fff';
    g.beginPath();g.arc(S2/2-eyeDX+eyeR*.3,eyeY-eyeR*.3,eyeR*.35,0,7);g.fill();
    g.beginPath();g.arc(S2/2+eyeDX+eyeR*.3,eyeY-eyeR*.3,eyeR*.35,0,7);g.fill();}
  // 眉毛
  g.strokeStyle='#3a2030';g.lineWidth=3.4;g.lineCap='round';
  const browY=eyeY-eyeR*2.6;
  g.beginPath();
  if(m.brows==='angry'){g.moveTo(S2/2-eyeDX-eyeR*1.4,browY-4);g.lineTo(S2/2-eyeDX+eyeR*1.4,browY+5);
    g.moveTo(S2/2+eyeDX-eyeR*1.4,browY+5);g.lineTo(S2/2+eyeDX+eyeR*1.4,browY-4);}
  else if(m.brows==='sad'){g.moveTo(S2/2-eyeDX-eyeR*1.4,browY+5);g.lineTo(S2/2-eyeDX+eyeR*1.4,browY-4);
    g.moveTo(S2/2+eyeDX-eyeR*1.4,browY-4);g.lineTo(S2/2+eyeDX+eyeR*1.4,browY+5);}
  else{g.moveTo(S2/2-eyeDX-eyeR*1.4,browY);g.lineTo(S2/2-eyeDX+eyeR*1.4,browY-2);
    g.moveTo(S2/2+eyeDX-eyeR*1.4,browY-2);g.lineTo(S2/2+eyeDX+eyeR*1.4,browY);}
  g.stroke();
  // 嘴
  g.strokeStyle='#c2455e';g.lineWidth=3.6;
  const my=S2*.68;
  g.beginPath();
  if(m.mouth==='smile'||m.mouth==='bigsmile'){const w=m.mouth==='bigsmile'?S2*.11:S2*.075;
    g.arc(S2/2,my-w*.3,w,0.15*Math.PI,0.85*Math.PI);}
  else if(m.mouth==='smile2'){g.arc(S2/2,my-2,S2*.06,0.1*Math.PI,0.9*Math.PI);}
  else if(m.mouth==='sad'||m.mouth==='sad2'){g.arc(S2/2,my+S2*.05,S2*.055,1.15*Math.PI,1.85*Math.PI);}
  else if(m.mouth==='angry'){g.moveTo(S2/2-S2*.05,my+2);g.lineTo(S2/2+S2*.05,my-2);}
  else if(m.mouth==='small'){g.arc(S2/2,my,S2*.028,0,7);}
  else{g.moveTo(S2/2-S2*.045,my);g.lineTo(S2/2+S2*.045,my);}
  g.stroke();
  // 泪滴
  if(m.tears>0){g.fillStyle=`rgba(140,200,255,${.75*m.tears})`;
    const ty=S2*.58+Math.sin(performance.now()/300)*3;
    g.beginPath();g.ellipse(S2/2-eyeDX,ty,S2*.02,S2*.035,0,0,7);g.fill();
    g.beginPath();g.ellipse(S2/2+eyeDX,ty+6,S2*.02,S2*.035,0,0,7);g.fill();}
  // 发饰（蝴蝶结）
  g.fillStyle=hex(def.ribbon);
  g.beginPath();g.arc(S2*.72,S2*.22,S2*.045,0,7);g.fill();}

function startDialogue(npc){const idx=npc.userData.idx,def=npc.userData.def;
  const si=npcStage[idx]%def.stages.length;const stage=def.stages[si];
  if(!stage)return;
  dlgActive=true;paused=true;dialogueSpeaker=npc;
  // v29：3D 少女同步表情（与立绘情绪一致）
  if(npc.userData.j&&npc.userData.j.face){
    const mood=si%FACE_MOODS.length;
    npc.userData.j.face.tgt=[EXPR.surprise,EXPR.love,EXPR.shy,EXPR.angry,EXPR.sad,EXPR.worry,EXPR.cry,EXPR.happy][mood]||EXPR.shy;}
  document.getElementById('dlgName').innerHTML=
    `${porTag(idx,26,'',`margin-right:6px;`)}${def.name} <span style="color:#9d4edd;font-size:12px">好感 ${affinity[idx]}/100 · ${affLevel(affinity[idx])}</span>`;
  document.getElementById('dlgText').textContent=stage.text;
  drawFace(idx,si);
  document.getElementById('dlgFaceTag').textContent=FACE_MOODS[si%FACE_MOODS.length].tag;
  renderDlgAlign();
  const box=document.getElementById('dlgChoices');box.innerHTML='';
  stage.choices.forEach(c=>{const b=document.createElement('button');
    b.innerHTML=`${c.t}<br><span class="tag">▸ ${c.tag}</span>`;
    b.onclick=()=>{
      // v46：记录这一次抉择（倾向 + 痕迹），并给出即时视觉反馈
      try{
        recordAlign(c.t);
        traceChoice(idx,si,stage.choices.indexOf(c),c.t.slice(0,24));
        affFlash(c.aff||0);
        // 连锁：如果本段有前置痕迹，且前后倾向相反 → 她「记得」，追加一句台词
        const prev=getTrace(idx,si-1);
        if(prev&&si>0){
          const prevK=alignOfChoice(prev.label),nowK=alignOfChoice(c.t);
          if(prevK!==nowK&&prevK==='player'&&nowK==='sincere'){
            setTimeout(()=>tip2('💭 她愣了一下：「……你上次可不是这么说的。」'),700);
          }else if(prevK==='sincere'&&nowK==='player'){
            setTimeout(()=>tip2('💭 她低下头：「你在骗我，对吗？」'),700);
          }
        }
      }catch(e){}
      c.fx({gift:()=>{ // 剧情奖励：随机武器+1或回血或碎片
        const r=Math.random();
        if(r<.5){const ups=SKILLS.filter(s=>s.type==='w'&&W[s.key].lv<5);
          if(ups.length){const u=ups[Math.floor(Math.random()*ups.length)];u.up();
            tip(`🎁 她送了你礼物，${u.n} 精进！`);}else{tip('🎁 心意收到，回血！');S.hp=Math.min(S.maxHp,S.hp+40);}}
        else{for(let i=0;i<6;i++)mkOrb(player.position);tip(`🎁 她送了你「${def.gift[Math.floor(Math.random()*def.gift.length)]}」`);}}});
      // 好感结算
      if(c.aff)addAff(idx,c.aff,c.aff>0?'好感上升':null);
      if(c.aff>=22){dates[idx]++;      // 好感爆满 → 恋人专属奖励
        playDateScene(NPC_SCENE[idx]!==undefined?NPC_SCENE[idx]:idx%DATE_SCENES.length,c.aff);}   // 约会场景演出
      if(affinity[idx]>=AFF_MAX&&!npcLoverDone[idx]){npcLoverDone[idx]=true;
        S.hp=S.maxHp;S.dmgMul*=1.1;sfx.love();
        tip(`❤️ ${def.name} 成为你的恋人！（全属性提升 · 解锁专属必杀${LOVER_ULT[idx].key}）`);
        burst(player.position,0xffd60a,30,12);renderLoverBtns();}
      document.getElementById('dlg').style.display='none';
      npcStage[idx]++;dlgActive=false;dialogueSpeaker=null;
      // 若仍有待处理升级则保持暂停，否则恢复游戏
      paused=pendingLvl>0;
      scene.remove(npc);npcs.splice(npcs.indexOf(npc),1);
      // 高好感角色下次邂逅缩短冷却
      npcCd[idx]=affinity[idx]>=60?18:30;};
    box.appendChild(b);});
  document.getElementById('dlg').style.display='flex';}
// ---------- 约会场景演出（v22：好感爆满触发的一段小剧场） ----------
const DATE_SCENES=[
 {id:0,n:'校园后山 · 樱花树下',ic:'🌸',sky:0xffc2d1,petal:0xff8fa3,line:'她靠在你肩头，樱花落满两人的校服。'},
 {id:1,n:'都市天台 · 霓虹夜',ic:'🌃',sky:0x2a1a4a,petal:0x9d4edd,line:'她递给你一杯酒，眼里的城市灯火在晃。'},
 {id:2,n:'海边栈道 · 落日',ic:'🌅',sky:0xffb37a,petal:0xffd60a,line:'海风吹乱她的发，她说"就这样走下去吧"。'},
 {id:3,n:'初雪长街 · 路灯下',ic:'❄️',sky:0x9fc4e0,petal:0xdff2ff,line:'她把手塞进你口袋，说"雪天也要一起走"。'},
];
const NPC_SCENE=NPC_DEFS.map((_,i)=>i%4); // v65：8 位女主各配专属约会场景（循环复用 4 场景）
function playDateScene(idx,aff){
  const sc=DATE_SCENES[idx%DATE_SCENES.length];
  // 视觉演出：镜头拉近 + 花瓣雨 + 色闪
  zoomTo(6.2,2.2);slowMotion(.4,1.4);
  flashOverlay('rgba(255,192,209,.22)',.6);shake(.25);
  const N=26;
  for(let i=0;i<N;i++){
    const p=new THREE.Mesh(new THREE.PlaneGeometry(.22,.16),
      new THREE.MeshBasicMaterial({color:sc.petal,transparent:true,opacity:.85,side:THREE.DoubleSide}));
    p.position.copy(player.position).add(new THREE.Vector3((Math.random()-.5)*9,4+Math.random()*5,(Math.random()-.5)*9));
    p.userData={v:new THREE.Vector3((Math.random()-.5)*1.2,-1.4-Math.random()*1.2,(Math.random()-.5)*1.2),
      life:2.6,spin:(Math.random()-.5)*6,petal:true};
    scene.add(p);parts.push(p);}
  // 心形粒子
  const hearts=Math.min(8,Math.round(aff/4));
  for(let i=0;i<hearts;i++){
    const h=new THREE.Mesh(new THREE.OctahedronGeometry(.16,0),
      new THREE.MeshStandardMaterial({color:0xff4d6d,emissive:0xff4d6d,emissiveIntensity:1.5}));
    h.position.copy(player.position).add(new THREE.Vector3((Math.random()-.5)*2,1.6+Math.random()*1.2,(Math.random()-.5)*2));
    h.castShadow=true;h.userData={v:new THREE.Vector3(0,.9,.0),life:1.8,heart:true};
    scene.add(h);parts.push(h);}
  sfx.love();
  // 约会卡演出
  let el=document.getElementById('dateToast');
  if(!el){el=document.createElement('div');el.id='dateToast';document.body.appendChild(el);}
  el.innerHTML=`<div class="dtt">${sc.ic} 约会 · ${NPC_DEFS[idx].name}</div>
    <div class="dtn">${sc.n}</div><div class="dtd">${sc.line}</div>
    <div class="dtx">好感 +${aff} · 约会次数 ${dates[idx]}</div>`;
  el.style.opacity=1;el.style.transform='translate(-50%,-50%) scale(1)';
  setTimeout(()=>{el.style.opacity=0;el.style.transform='translate(-50%,-50%) scale(.88)';},2600);
  // 约会加成：全属性小幅提升
  S.dmgMul*=1.03;S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.1);
  SAVE.dateTotal=(SAVE.dateTotal||0)+1;writeSave();
  checkAch&&checkAch();
}
// 冲刺残影
const ghostMat=new THREE.MeshBasicMaterial({color:0xb5179e,transparent:true,opacity:.35});

// ---------- 音效（WebAudio 合成，无外部资源） ----------
let AC=null,muted=false;
function beep(f,dur,type='square',vol=.08,slide=0){if(muted)return;
  try{if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();
    if(AC.state==='suspended')AC.resume();
    const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;
    if(slide)o.frequency.linearRampToValueAtTime(f+slide,AC.currentTime+dur);
    g.gain.setValueAtTime(vol,AC.currentTime);g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+dur);
    o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+dur);}catch(e){}}
const sfx={shoot:()=>beep(660,.06,'square',.025,-200),hit:()=>beep(220,.08,'sawtooth',.05,-80),
  kill:()=>beep(440,.15,'triangle',.07,300),lvl:()=>{beep(523,.1,'sine',.1);setTimeout(()=>beep(784,.15,'sine',.1),90);},
  ult:()=>{beep(110,.5,'sawtooth',.14,60);beep(330,.4,'square',.06);},
  hurt:()=>beep(160,.2,'sawtooth',.09,-60),dash:()=>beep(880,.08,'sine',.05,300),
  pick:()=>beep(988,.05,'sine',.035,200),evo:()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,.15,'sine',.1),i*90));},
  // 🎵 连杀音高递增：连杀越高，音越尖（上限 12 度）
  combo:(n)=>{const lv=Math.min(12,Math.floor(n/3));const f=520*Math.pow(1.08,lv);
    beep(f,.07,'triangle',.055,60);},
  // 🎵 里程碑：双音上行
  milestone:()=>{beep(659,.09,'square',.07);setTimeout(()=>beep(988,.14,'square',.075),80);},
  // 🎵 结缘：温柔三音
  love:()=>{[523,659,880].forEach((f,i)=>setTimeout(()=>beep(f,.22,'sine',.09),i*130));},
  // 🎵 三选一开卡：金属拨弦
  card:()=>{beep(1320,.05,'square',.05,-300);setTimeout(()=>beep(880,.08,'triangle',.05,200),50);},
  // 🎵 宝箱开启：闪亮上行
  chest:()=>{[784,1046,1318].forEach((f,i)=>setTimeout(()=>beep(f,.1,'sine',.075),i*70));},
  // 🎵 挑战成功
  challenge:()=>{[659,880,1046,1318].forEach((f,i)=>setTimeout(()=>beep(f,.12,'triangle',.08),i*80));},
};
document.getElementById('muteBtn').onclick=function(){muted=!muted;this.textContent=muted?'🔇':'🔊';setAmbientMute(muted);};

// ========== v52：全屏（满屏）能力 ==========
// 设计要点：
// ① 只用标准 API + 三个前缀回退（iOS Safari 只认 webkit 前缀）
// ② iOS 上 <div> 无法 requestFullscreen —— 只提示"添加到主屏幕"绕行，不假装成功
// ③ 切换后 rAF 里 resize/像素比会被浏览器延后一拍上报，需要延后调用一次 onResize
// ④ 全屏态把 body 加 .isFs 类，让 HUD 用满屏安全区（刘海/圆角屏不被切）
let FS_ON=false;
function fsSupported(){
  const d=document;
  return !!(d.documentElement.requestFullscreen||d.documentElement.webkitRequestFullscreen||
            d.documentElement.webkitRequestFullScreen||d.documentElement.mozRequestFullScreen||
            d.documentElement.msRequestFullscreen);
}
function fsElement(){
  const d=document;
  return d.fullscreenElement||d.webkitFullscreenElement||d.mozFullScreenElement||d.msFullscreenElement||null;
}
function fsTip(msg,ms){
  let el=document.getElementById('fsTip');
  if(!el){el=document.createElement('div');el.id='fsTip';document.body.appendChild(el);}
  el.textContent=msg;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('on'),ms||1800);
}
function syncFsUI(){
  FS_ON=!!fsElement();
  const b=document.getElementById('fsBtn');
  if(b){
    b.classList.toggle('on',FS_ON);
    const ico=b.querySelector('.fsIco');
    if(ico)ico.textContent=FS_ON?'⛶':'⛶';
    b.title=FS_ON?'退出全屏':'全屏';
    b.setAttribute('aria-label',FS_ON?'退出全屏':'进入全屏');
  }
  document.body.classList.toggle('isFs',FS_ON);
  // 全屏切换后可用视口尺寸变化 → 延后一拍重新适配渲染器与 HUD
  setTimeout(()=>{try{onResize();}catch(e){}},60);
  setTimeout(()=>{try{onResize();}catch(e){}},320);
  return FS_ON;
}
function fsEnter(){
  const el=document.documentElement;
  const req=el.requestFullscreen||el.webkitRequestFullscreen||el.webkitRequestFullScreen||
            el.mozRequestFullScreen||el.msRequestFullscreen;
  if(!req){
    fsTip('当前浏览器不支持全屏 · iOS 请「添加到主屏幕」后从桌面启动',3200);
    return false;
  }
  let r;
  try{ r=req.call(el,{navigationUI:'hide'}); }
  catch(e){ try{ r=req.call(el); }catch(e2){ fsTip('全屏被浏览器拒绝',2200); return false; } }
  // 部分浏览器返回 undefined（老前缀），靠 fullscreenchange 同步状态即可
  if(r&&typeof r.then==='function'){
    r.then(()=>{syncFsUI();fsTip('已进入全屏 · 双击屏幕两指缩放可退出');}).catch(err=>{
      // 常见原因：非用户手势、iframe 未授权 allowfullscreen、iOS 不支持
      fsTip('无法进入全屏（'+((err&&err.name)||'被拒绝')+'）',2600);
    });
  }
  setTimeout(syncFsUI,120);
  return true;
}
function fsExit(){
  const d=document;
  const ex=d.exitFullscreen||d.webkitExitFullscreen||d.webkitCancelFullScreen||
           d.mozCancelFullScreen||d.msExitFullscreen;
  if(!ex)return false;
  try{const r=ex.call(d);if(r&&r.then)r.catch(()=>{});}catch(e){}
  setTimeout(syncFsUI,120);
  return true;
}
function fsToggle(){
  if(fsElement())return fsExit();
  return fsEnter();
}
(function wireFs(){
  const b=document.getElementById('fsBtn');
  if(!b)return;
  b.onclick=function(e){
    e.preventDefault();e.stopPropagation();
    try{beep&&beep(FS_ON?520:740,.08,'sine',.05);}catch(_){}
    fsToggle();
  };
  // 键盘 F / F11 快捷键（桌面调试友好；F11 由浏览器自己处理，这里只接 F）
  addEventListener('keydown',e=>{
    if(e.key==='f'||e.key==='F'){
      const tag=(e.target&&e.target.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA')return;
      if(document.getElementById('codex')&&getComputedStyle(document.getElementById('codex')).display!=='none')return;
      e.preventDefault();fsToggle();
    }
  });
  // 任何来源的进出全屏（含 ESC、浏览器手势）都要同步 UI
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(ev=>document.addEventListener(ev,()=>syncFsUI()));
  // 首次未全屏时给一次轻提示（只在支持全屏的浏览器上出现）
  if(fsSupported())setTimeout(()=>{if(!fsElement())fsTip('点右下角 ⛶ 可进入全屏',2600);},4200);
  syncFsUI();
})();
// 供回归脚本/调试读取全屏子系统状态（只读句柄）
try{window.FSAPI={get on(){return FS_ON;},toggle:fsToggle,enter:fsEnter,exit:fsExit,
  sync:syncFsUI,supported:fsSupported,tip:fsTip};}catch(e){}

// ---------- 环境音效（v22：程序化白噪 + 滤波，随天气/昼夜联动） ----------
let ambRain=null,ambWind=null,ambNight=null,ambMaster=null,ambBuf=null;
function ambNoiseBuffer(){
  if(ambBuf)return ambBuf;
  if(!AC)return null;
  const len=AC.sampleRate*2,buf=AC.createBuffer(1,len,AC.sampleRate),d=buf.getChannelData(0);
  let last=0;
  for(let i=0;i<len;i++){const w=Math.random()*2-1;last=(last+.02*w)/1.02;d[i]=last*3.2;} // 棕噪
  return ambBuf=buf;}
function ambEnsure(){
  if(muted)return false;
  try{if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();
    if(AC.state==='suspended')AC.resume();}catch(e){return false;}
  if(!ambMaster){ambMaster=AC.createGain();ambMaster.gain.value=.0;ambMaster.connect(AC.destination);}
  const nb=ambNoiseBuffer();if(!nb)return false;
  if(!ambRain){ // 雨：棕噪 + 高频带通
    const src=AC.createBufferSource();src.buffer=nb;src.loop=true;
    const hp=AC.createBiquadFilter();hp.type='highpass';hp.frequency.value=900;
    const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=6200;
    const g=AC.createGain();g.gain.value=0;
    src.connect(hp);hp.connect(lp);lp.connect(g);g.connect(ambMaster);src.start();
    ambRain={src,g};}
  if(!ambWind){ // 风：低通棕噪，慢速起伏
    const src=AC.createBufferSource();src.buffer=nb;src.loop=true;
    const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=420;
    const g=AC.createGain();g.gain.value=0;
    src.connect(lp);lp.connect(g);g.connect(ambMaster);src.start();
    ambWind={src,g};}
  if(!ambNight){ // 夜虫鸣：周期性高频脉冲由 updateAmbient 驱动
    const osc=AC.createOscillator();osc.type='sine';osc.frequency.value=4200;
    const g=AC.createGain();g.gain.value=0;
    osc.connect(g);g.connect(ambMaster);osc.start();
    ambNight={osc,g};}
  return true;}
function setAmbientMute(m){if(ambMaster)ambMaster.gain.value=m?0:(ambMaster._vol||.5);}
function updateAmbient(dt){
  if(!started||muted)return;
  if(!ambEnsure())return;
  const w=WEATHERS[envWeather],p=DAY_PHASES[envPhase];
  const target=ambMaster._vol=(muted?0:.55);
  ambMaster.gain.value+= (target-ambMaster.gain.value)*Math.min(1,dt*3);
  // 雨声强度
  const rainV=w.rainOn?(w.id==='storm'?.5:.3):0;
  ambRain.g.gain.value+=(rainV-ambRain.g.gain.value)*Math.min(1,dt*2);
  // 风声（浓雾/夜里更明显）
  const windV=.06+(w.id==='fog'?.12:0)+(p.id==='night'?.08:0);
  ambWind.g.gain.value+=(windV*ambMaster.gain.value-ambWind.g.gain.value)*Math.min(1,dt*1.5);
  // 夜虫（仅深夜·晴/雾）
  const nightV=(p.id==='night'&&!w.rainOn)?(.02+.02*Math.abs(Math.sin(performance.now()/900))):0;
  ambNight.g.gain.value+=(nightV*ambMaster.gain.value-ambNight.g.gain.value)*Math.min(1,dt*3);
  ambNight.osc.frequency.value=3800+Math.sin(performance.now()/1400)*600;
}

// ---------- Boss 专属 BGM（程序化音阶 · 无需音频文件） ----------
let bgmTimer=null,bgmStep=0;
const BGM_SCALES={
  captain:{base:110,pat:[0,3,5,7,3,5,0,7],type:'sawtooth',vol:.05}, // 小调·压迫
  mother:{base:146.8,pat:[0,4,7,12,7,4,0,-5],type:'square',vol:.045}, // 大调·审判
  mirror:{base:98,pat:[0,6,3,9,6,3,9,0],type:'triangle',vol:.05}, // 增四度·诡异
  fatherinlaw:{base:123.5,pat:[0,2,5,7,5,2,0,-3],type:'square',vol:.048}, // 五声音阶·威压
  exchorus:{base:130.8,pat:[0,4,5,7,11,7,5,4],type:'sawtooth',vol:.046}, // 利底亚·怀旧
  emcee:{base:103.8,pat:[0,1,5,6,1,6,7,0],type:'triangle',vol:.052}, // 小二度·伪神
};
function startBossBgm(bid){
  stopBossBgm();
  const sc=BGM_SCALES[bid]||BGM_SCALES.captain;bgmStep=0;
  bgmTimer=setInterval(()=>{
    if(muted||!S.alive){return;}
    const semi=sc.pat[bgmStep%sc.pat.length];
    beep(sc.base*Math.pow(2,semi/12),.28,sc.type,sc.vol);
    // 低音鼓点
    if(bgmStep%4===0)beep(sc.base/2,.18,'sine',sc.vol*1.6,-20);
    bgmStep++;},300);}
function stopBossBgm(){if(bgmTimer){clearInterval(bgmTimer);bgmTimer=null;}}

// ---------- 游戏状态 ----------
const S={hp:100,maxHp:100,scum:0,xp:0,xpNeed:10,lvl:1,kills:0,time:0,alive:true,over:false,
  spd:8.2,dmgMul:1,cdMul:1,pickR:2.6,armor:0,regen:0,critC:.08,critM:2,
  dashT:0,dashCd:6,dashing:0,ultT:0,hitCd:0,shake:0,eliteKill:0};
let paused=true,started=false;
const enemies=[],bullets=[],eBullets=[],orbs=[],parts=[],mists=[],teles=[],stools=[]; // v44：家法板凳飞行体
let dmgDivs=[];
for(let i=0;i<26;i++){const d=document.createElement('div');d.className='dmg';d.style.display='none';
  document.body.appendChild(d);dmgDivs.push(d);}
let dmgIdx=0;
function dmgNum(pos,val,crit){const d=dmgDivs[dmgIdx++%dmgDivs.length];d.style.display='block';
  d.textContent=Math.round(val);d.className='dmg'+(crit?' crit':'');
  const v=pos.clone().project(camera);
  d.style.left=((v.x*.5+.5)*innerWidth-10)+'px';d.style.top=((-v.y*.5+.5)*innerHeight-10)+'px';
  d.style.opacity=1;let n=0;const iv=setInterval(()=>{n++;d.style.top=(parseFloat(d.style.top)-3)+'px';
    if(n>=8){d.style.opacity=0;clearInterval(iv);}},30);}

/* v67:AI战斗特效（黑底发光贴图，运行期 AdditiveBlending 免抠图） */
const FX2=window.__ZA__&&window.__ZA__.FX2?window.__ZA__.FX2:{};// ---------- 武器系统 ----------
const W={ // 每把武器: lv 0未拥有 1..5, 满5可进化
  bullet:{lv:1,name:'情话弹幕',evolved:false},
  orbit:{lv:0,name:'劈腿旋风',evolved:false},
  meteor:{lv:0,name:'心碎流星',evolved:false},
  mist:{lv:0,name:'绿茶迷雾',evolved:false},
  nova:{lv:0,name:'魅力冲击',evolved:false},
  chain:{lv:0,name:'情网连锁',evolved:false},
  hook:{lv:0,name:'索命钩锁',evolved:false},
  clone:{lv:0,name:'虚情分身',evolved:false},
  wave:{lv:0,name:'桃花浪潮',evolved:false},
  // ---- v42 新增 4 把 ----
  rush:{lv:0,name:'舔狗冲锋',evolved:false},   // 近战突进，命中回血
  burst:{lv:0,name:'情感暴力',evolved:false},  // 蓄力环形冲击波
  twin:{lv:0,name:'双面人格',evolved:false},   // 召唤分身同步普攻
  curse:{lv:0,name:'拉黑诅咒',evolved:false},  // 持续掉血标记，可传染
};
const P={atk:0,spd:0,hp:0,pick:0,cdr:0}; // 被动等级
function statMul(){return{dmg:S.dmgMul,cd:S.cdMul*(1-P.cdr*.08)};}
// 计时器
const timers={bullet:0,meteor:0,mist:0,nova:0,chain:0,hook:0,clone:0,wave:0,ultBtn:0,
  rush:0,burst:0,twin:0,curse:0};

// 共享几何/材质（性能）
const G={bullet:new THREE.SphereGeometry(.2,6,6),orb:heartGeo,
  part:new THREE.SphereGeometry(.08,4,4),mist:new THREE.CylinderGeometry(2.4,2.4,.12,16),
  eBullet:new THREE.SphereGeometry(.26,6,6),tele:new THREE.RingGeometry(.1,1,24),
  meteor:new THREE.OctahedronGeometry(.5)};
const M={bullet:new THREE.MeshBasicMaterial({color:0xff8fa3}),
  eBullet:new THREE.MeshBasicMaterial({color:0x4cc9f0}),
  orb:new THREE.MeshStandardMaterial({color:0xffd60a,emissive:0xffb703,emissiveIntensity:1}),
  part:new THREE.MeshBasicMaterial({color:0xff4d9e}),
  mist:new THREE.MeshBasicMaterial({color:0x80ed99,transparent:true,opacity:.24}),
  tele:new THREE.MeshBasicMaterial({color:0xff0044,transparent:true,opacity:.35,side:THREE.DoubleSide}),
  meteor:new THREE.MeshStandardMaterial({color:0xff4d6d,emissive:0xff4d6d,emissiveIntensity:1.2}),
  ghost:new THREE.MeshBasicMaterial({color:0xb5179e,transparent:true,opacity:.3})};
const bulletMatEvo=new THREE.MeshBasicMaterial({color:0xffd60a});

// ---------- v67：AI 战斗特效（黑底贴图 + 加法混合 = 免抠图发光层） ----------
const FXGEO=new THREE.PlaneGeometry(2,2);
const FX2TEX={};let _fxImpactT=0;
function fxTexture(k){const d=(typeof FX2!=='undefined')&&FX2&&FX2[k];if(!d||!d.t)return null;
  if(!FX2TEX[k]){const img=new Image();
    const t=new THREE.Texture(img);t.encoding=THREE.sRGBEncoding;t.minFilter=THREE.LinearFilter;
    // needsUpdate 必须等图片真正解码完成再置位，否则 three 会告警
    // 「Texture marked for update but image is incomplete」
    if(img.complete&&img.width)t.needsUpdate=true;
    else img.onload=function(){t.needsUpdate=true;};
    img.src='data:image/jpeg;base64,'+d.t;
    FX2TEX[k]=t;}
  return FX2TEX[k];}
// 立牌发光层（自动朝向相机）：挂在任意网格/位置下跟随移动
function fxSprite(k,s,op){const t=fxTexture(k);if(!t)return null;
  const m=new THREE.SpriteMaterial({map:t,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,
    opacity:op===undefined?.9:op});
  const sp=new THREE.Sprite(m);sp.scale.set(s,s,1);return sp;}
// 平铺地面发光层（俯视环/雾/波纹）：life>0 时交由 parts 通道淡出+扩散
function fxFlat(k,s,life,op,grow,spin){const t=fxTexture(k);if(!t)return null;
  const m=new THREE.MeshBasicMaterial({map:t,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,
    side:THREE.DoubleSide,opacity:op===undefined?.85:op});
  const p=new THREE.Mesh(FXGEO,m);p.rotation.x=-Math.PI/2;p.scale.setScalar(s);
  if(life)p.userData={fx:1,life:life,life0:life,fxg:grow||0,fxo:op===undefined?.85:op,spin:spin||0};
  return p;}
// 通用命中爆点（节流：80ms 内只出一次，低画质档关闭）
function fxFlash(pos,s){if(QUAL.level<1)return;const now=performance.now();
  if(now-_fxImpactT<80)return;_fxImpactT=now;
  const sp=fxSprite('impact',s||1.6,.85);if(!sp)return;sp.position.copy(pos);
  sp.userData={fx:1,life:.22,life0:.22,fxo:.85};scene.add(sp);parts.push(sp);}

// 环绕玫瑰
const orbitGroup=new THREE.Group();scene.add(orbitGroup);
const roseGeo=new THREE.ConeGeometry(.24,.7,6);
const roseMat=new THREE.MeshStandardMaterial({color:0xff4d6d,emissive:0xff4d6d,emissiveIntensity:1});
const roseMatEvo=new THREE.MeshStandardMaterial({color:0xffd60a,emissive:0xff9e00,emissiveIntensity:1.4});
const roseMatAwk=new THREE.MeshStandardMaterial({color:0xd4af37,emissive:0xffd60a,emissiveIntensity:2});
function syncOrbits(){const aw=W.orbit;
  const n=Math.min(12,W.orbit.lv*(W.orbit.evolved?2:1)+(aw.bonusRing||0));
  const mat=(aw.awakened)?roseMatAwk:(W.orbit.evolved?roseMatEvo:roseMat);
  while(orbitGroup.children.length<n)orbitGroup.add(new THREE.Mesh(roseGeo,mat));
  while(orbitGroup.children.length>n)orbitGroup.remove(orbitGroup.children[0]);
  orbitGroup.children.forEach(m=>{if(m.material!==mat)m.material=mat;});}

// ---------- 敌人（卡通3D人物） ----------
// 类型: chaser 红衣情敌 / swarm 小跟班 / tank 壮汉情敌 / shooter 绿衣射手 / bomber 自爆情圣 / boss 魔王
const E_STAT={
  chaser:{hp:26,spd:3.1,r:.62,dmg:9,col:0xd63a5a,hair:0x221526},
  swarm:{hp:10,spd:4.6,r:.4,dmg:5,col:0xf77f00,hair:0x3a2a12},
  tank:{hp:110,spd:1.7,r:1,dmg:16,col:0x7a3ab0,hair:0x101018},
  shooter:{hp:34,spd:2.4,r:.55,dmg:8,col:0x2f9e73,hair:0x14261e},
  bomber:{hp:18,spd:3.8,r:.5,dmg:22,col:0xe03030,hair:0x2a1010},
};
// 通用人形构建器（v29）：转调 mkFigure，按细节档位产出不同精度的情敌
function mkHumanoid(robeCol,hairCol,scale=1,bulk=1,det=1,opt){
  opt=opt||{};
  const f=mkFigure({top:robeCol,bottom:opt.bottom===undefined?0x241428:opt.bottom,
    trim:opt.trim===undefined?0xffd60a:opt.trim,hair:hairCol,
    skin:opt.skin===undefined?0xf8cfab:opt.skin,iris:opt.iris===undefined?0x2a1620:opt.iris,
    armCol:'top',female:false,det:det,bulk:bulk,scale:scale,style:opt.style||'short',
    outline:opt.outline,outlineCol:opt.outlineCol,outlineThick:opt.outlineThick});
  return {g:f.g,mats:f.mats,j:f.j};}
function mkEnemy(type,boss=false){
  let g,mats,jj;
  if(boss){ // 巨型魔王：黑袍+披风+金角+压迫感缓步（按 bossId 定制外观）
    _bossHalo=null;_bossBid=null;_bossTheme=null;
    const bid=_bossBid=(typeof _pendingBossId!=='undefined'&&_pendingBossId)||'captain';
    g=new THREE.Group();mats=[];
    // 各 Boss 专属主色：军团长=紫金，丈母娘=金红，镜像体=青蓝，深渊之主=暗红虚空
    const theme=bid==='mother'?{robe:0x3a1a10,hair:0x1a0a05,cape:0xd4a017,acc:0xffd60a,halo:0xffd60a}
      :bid==='mirror'?{robe:0x0a1e2a,hair:0x04101a,cape:0x0077b6,acc:0x4cc9f0,halo:0x4cc9f0}
      :bid==='abyss'?{robe:0x1a0408,hair:0x0a0204,cape:0x6a0404,acc:0xff2e2e,halo:0xff2e2e}
      :bid==='thunder'?{robe:0x0a1420,hair:0x04080f,cape:0x1e4a7a,acc:0x8ad4ff,halo:0x4c9eff}
      :bid==='assassin'?{robe:0x1c2228,hair:0x0a0e12,cape:0x3a4a5a,acc:0x9aa8b8,halo:0x6a7a8a}
      :bid==='solar'?{robe:0x4a2a08,hair:0x2a1604,cape:0xff9500,acc:0xffd60a,halo:0xffb300}
      :bid==='rain'?{robe:0x0a2038,hair:0x041020,cape:0x2a6a9a,acc:0x7fc4ff,halo:0x4a9fdf}
      :bid==='seaking'?{robe:0x062a2e,hair:0x02161a,cape:0x0e7c8a,acc:0x7fffd4,halo:0x40e0d0}
      :bid==='frost'?{robe:0x0e2438,hair:0xdff4ff,cape:0x4a9fd0,acc:0xa8e6ff,halo:0xdff4ff}
      :bid==='chronos'?{robe:0x151022,hair:0xe8e4f0,cape:0x2a2440,acc:0xc8b8ff,halo:0xb8a8f0}
      :bid==='fatherinlaw'?{robe:0x1a1210,hair:0x8a8a94,cape:0x8a6a10,acc:0xffd60a,halo:0xffd60a}
      :bid==='exchorus'?{robe:0x2a0a30,hair:0x3a0a3a,cape:0x6a0a6a,acc:0xc77dff,halo:0xc77dff}
      :bid==='emcee'?{robe:0x1a0208,hair:0x0a0104,cape:0x8a0a24,acc:0xff3d6e,halo:0xff3d6e}
      :{robe:0x1a0b26,hair:0x0a0510,cape:0x7209b7,acc:0xffd60a,halo:0xff006e};
    _bossTheme=theme;
    const h=mkHumanoid(theme.robe,theme.hair,2.1,1.5,2,{bottom:0x140a10,trim:theme.acc,
      skin:bid==='mother'?0xf5c9a4:(bid==='abyss'?0xc9a3a3:(bid==='mirror'?0xdcd2dc:0xf2c4a0)),
      iris:theme.acc,style:'hero',outline:true,outlineCol:0x100610,outlineThick:.024});g=h.g;mats=h.mats;jj=h.j;
    if(jj.face){setExpr(jj.face,'angry');jj.face.tgt=EXPR.angry;}
    // 披风：垂坠在身后（肩 → 膝弯），不再罩住全身
    const cape=new THREE.Mesh(new THREE.ConeGeometry(1.05,2.15,14,1,true),
      new THREE.MeshToonMaterial({color:theme.cape,gradientMap:GRAD,side:THREE.DoubleSide}));
    cape.position.set(0,1.52,-.42);cape.rotation.x=.14;g.add(cape);mats.push(cape.material);
    // 弯角：长在头顶两侧
    for(const s of[-1,1]){const horn=new THREE.Mesh(new THREE.ConeGeometry(.13,.55,6),
      new THREE.MeshStandardMaterial({color:theme.acc,emissive:theme.acc,emissiveIntensity:1.2}));
      horn.position.set(.42*s,2.52,0);horn.rotation.z=-.5*s;g.add(horn);mats.push(horn.material);}
    // 悬浮光环：悬于头顶上方
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.8,.07,6,26),
      new THREE.MeshStandardMaterial({color:theme.halo,emissive:theme.halo,emissiveIntensity:1}));
    halo.rotation.x=Math.PI/2;halo.position.y=3.05;g.add(halo);_bossHalo=halo;mats.push(halo.material);
    // 辨识特征：丈母娘=金算盘/红包挂饰；镜像体=破碎镜面环
    if(bid==='mother'){
      const purse=new THREE.Mesh(new THREE.BoxGeometry(.45,.34,.2),
        new THREE.MeshStandardMaterial({color:0xd4a017,emissive:0xff9e00,emissiveIntensity:.5,metalness:.7,roughness:.35}));
      purse.position.set(.55,1.05,.35);purse.rotation.y=-.4;g.add(purse);mats.push(purse.material);}
    if(bid==='mirror'){
      for(let k=0;k<6;k++){const face=new THREE.Mesh(new THREE.PlaneGeometry(.5,.7),
        new THREE.MeshBasicMaterial({color:0x4cc9f0,transparent:true,opacity:.35,side:THREE.DoubleSide}));
        const a=k/6*Math.PI*2;face.position.set(Math.cos(a)*1.15,2.2,Math.sin(a)*1.15);
        face.lookAt(0,2.2,0);g.add(face);}}
    if(bid==='abyss'){ // 深渊之主：破碎虚空环 + 悬浮魔眼
      for(let k=0;k<8;k++){const shard=new THREE.Mesh(new THREE.ConeGeometry(.14,.7,4),
        new THREE.MeshStandardMaterial({color:0x6a0404,emissive:0xff2e2e,emissiveIntensity:.9,transparent:true,opacity:.85}));
        const a=k/8*Math.PI*2;shard.position.set(Math.cos(a)*1.25,2.2,Math.sin(a)*1.25);
        shard.rotation.z=a;shard.rotation.x=1.2;g.add(shard);mats.push(shard.material);}
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.26,10,8),
        new THREE.MeshStandardMaterial({color:0xff2e2e,emissive:0xff0044,emissiveIntensity:1.6}));
      eye.position.set(0,2.85,.55);g.add(eye);mats.push(eye.material);}
    if(bid==='thunder'){ // 雷神：雷电双角 + 环绕电弧环
      for(const s of[-1,1]){const horn=new THREE.Mesh(new THREE.ConeGeometry(.12,.7,4),
        new THREE.MeshStandardMaterial({color:0xdff3ff,emissive:0x8ad4ff,emissiveIntensity:1.8}));
        horn.position.set(.45*s,2.6,0);horn.rotation.z=-.6*s;g.add(horn);mats.push(horn.material);}
      const coil=new THREE.Mesh(new THREE.TorusGeometry(.85,.06,6,22),
        new THREE.MeshStandardMaterial({color:0xcfe4ff,emissive:0x4c9eff,emissiveIntensity:1.6}));
      coil.rotation.x=Math.PI/2;coil.position.y=1.72;g.add(coil);mats.push(coil.material);}
    if(bid==='seaking'){ // 海王：珍珠冠环 + 三叉戟
      for(let k=0;k<7;k++){const pearl=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),
        new THREE.MeshStandardMaterial({color:0xf0ffff,emissive:0x7fffd4,emissiveIntensity:.5,metalness:.4,roughness:.25}));
        const pa=k/7*Math.PI*2;pearl.position.set(Math.cos(pa)*1.0,2.35,Math.sin(pa)*1.0);g.add(pearl);mats.push(pearl.material);}
      const trident=new THREE.Mesh(new THREE.ConeGeometry(.16,1.25,4),
        new THREE.MeshStandardMaterial({color:0x7fffd4,emissive:0x40e0d0,emissiveIntensity:1.2,metalness:.6,roughness:.3}));
      trident.position.set(.6,1.7,.5);trident.rotation.z=-.7;g.add(trident);mats.push(trident.material);}
    if(bid==='frost'){ // 霜夜女王：冰晶王冠 + 环绕冰锥 + 霜气披纱
      for(let k=0;k<6;k++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.09,.62,4),
        new THREE.MeshStandardMaterial({color:0xdff4ff,emissive:0xa8e6ff,emissiveIntensity:1.5,transparent:true,opacity:.92}));
        const fa=k/6*Math.PI*2;
        spike.position.set(Math.cos(fa)*.55,2.62+Math.sin(k)*.06,Math.sin(fa)*.55);
        spike.rotation.z=Math.cos(fa)*.35;spike.rotation.x=-Math.sin(fa)*.35;
        g.add(spike);mats.push(spike.material);}
      for(let k=0;k<5;k++){const ic=new THREE.Mesh(new THREE.OctahedronGeometry(.22,0),
        new THREE.MeshStandardMaterial({color:0xcfeaff,emissive:0x7fd4ff,emissiveIntensity:1.1,metalness:.3,roughness:.15,transparent:true,opacity:.85}));
        const ia=k/5*Math.PI*2+Math.PI/10;
        ic.position.set(Math.cos(ia)*1.3,1.9+Math.sin(ia*2)*.3,Math.sin(ia)*1.3);
        g.add(ic);mats.push(ic.material);}
      const veil=new THREE.Mesh(new THREE.ConeGeometry(1.2,2.4,18,1,true),
        new THREE.MeshBasicMaterial({color:0xa8e6ff,transparent:true,opacity:.14,side:THREE.DoubleSide}));
      veil.position.set(0,1.5,0);g.add(veil);}
    if(bid==='chronos'){ // 四时之主：四季轮盘 + 四色光球 + 断裂时之环
      const ringCols=[0x8ad4ff,0x9aa8b8,0xffd60a,0x7fc4ff];
      for(let k=0;k<4;k++){
        const seg=new THREE.Mesh(new THREE.TorusGeometry(1.35,.05,6,20,k===0?Math.PI/2:Math.PI/2),
          new THREE.MeshStandardMaterial({color:ringCols[k],emissive:ringCols[k],emissiveIntensity:1.6}));
        seg.rotation.x=Math.PI/2;seg.rotation.z=k*Math.PI/2;seg.position.y=1.95;
        g.add(seg);mats.push(seg.material);
        const orb=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),
          new THREE.MeshStandardMaterial({color:ringCols[k],emissive:ringCols[k],emissiveIntensity:2}));
        const oa=k*Math.PI/2+Math.PI/4;
        orb.position.set(Math.cos(oa)*1.35,1.95,Math.sin(oa)*1.35);
        g.add(orb);mats.push(orb.material);}
      const hands=new THREE.Group();
      for(const ang of[0,Math.PI/2]){const hd=new THREE.Mesh(new THREE.BoxGeometry(.07,1.05,.07),
        new THREE.MeshStandardMaterial({color:0xdff4ff,emissive:0xa8e6ff,emissiveIntensity:1.2}));
        hd.position.y=.52;const hg=new THREE.Group();hg.add(hd);hg.rotation.z=ang;
        hg.position.y=3.1;hands.add(hg);}
      g.add(hands);}
    if(bid==='fatherinlaw'){ // 岳父大人：礼帽 + 领结 + 敬酒杯 + 背后家法板凳
      const hatBrim=new THREE.Mesh(new THREE.CylinderGeometry(.62,.62,.06,16),
        new THREE.MeshStandardMaterial({color:0x14100e,emissive:0x2a2018,emissiveIntensity:.5}));
      hatBrim.position.y=2.85;g.add(hatBrim);mats.push(hatBrim.material);
      const hatTop=new THREE.Mesh(new THREE.CylinderGeometry(.36,.4,.55,16),
        new THREE.MeshStandardMaterial({color:0x14100e,emissive:0x2a2018,emissiveIntensity:.5}));
      hatTop.position.y=3.12;g.add(hatTop);mats.push(hatTop.material);
      const band=new THREE.Mesh(new THREE.CylinderGeometry(.41,.41,.1,16),
        new THREE.MeshStandardMaterial({color:0xffd60a,emissive:0xffd60a,emissiveIntensity:1.4}));
      band.position.y=2.92;g.add(band);mats.push(band.material);
      const bow=new THREE.Mesh(new THREE.BoxGeometry(.42,.16,.14),
        new THREE.MeshStandardMaterial({color:0xffd60a,emissive:0xffd60a,emissiveIntensity:1.2}));
      bow.position.set(0,2.05,.42);g.add(bow);mats.push(bow.material);
      // 敬酒杯（手部挂载，招式触发时抬起）
      const cup=new THREE.Group();
      const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.2,.13,.3,10),
        new THREE.MeshStandardMaterial({color:0xfff2c0,emissive:0xffd60a,emissiveIntensity:1.0,
          transparent:true,opacity:.85}));
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.34,8),
        new THREE.MeshStandardMaterial({color:0xd4af37,emissive:0xd4af37,emissiveIntensity:1.2}));
      stem.position.y=-.3;cup.add(bowl);cup.add(stem);
      cup.position.set(.62,1.55,.18);g.add(cup);g.userData.cup=cup; // 挂到 group：u 尚未构造
      mats.push(bowl.material,stem.material);
      // 家法板凳（背后悬浮）
      const stool=new THREE.Group();
      const seat=new THREE.Mesh(new THREE.BoxGeometry(.9,.12,.5),
        new THREE.MeshStandardMaterial({color:0x6a3a12,emissive:0x2a1608,emissiveIntensity:.6}));
      stool.add(seat);
      for(const sx of[-.34,.34])for(const sz of[-.18,.18]){
        const leg=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.5,6),
          new THREE.MeshStandardMaterial({color:0x4a2a0e,emissive:0x201004,emissiveIntensity:.5}));
        leg.position.set(sx,-.3,sz);stool.add(leg);mats.push(leg.material);}
      stool.position.set(0,3.4,-1.3);stool.rotation.z=.5;
      g.add(stool);g.userData.stool=stool;mats.push(seat.material);}
    if(bid==='exchorus'){ // 前任合唱团：三张脸 + 麦克风 + 漂浮胶片
      for(let k=0;k<3;k++){
        const a=(k-1)*.62;
        const head=new THREE.Mesh(new THREE.SphereGeometry(.34,12,10),
          new THREE.MeshStandardMaterial({color:0xf2c4a0,emissive:0xc77dff,emissiveIntensity:.35,
            transparent:true,opacity:.82}));
        head.position.set(Math.sin(a)*.85,2.45-Math.abs(a)*.35,Math.cos(a)*.2);
        g.add(head);mats.push(head.material);}
      for(const sx of[-.55,.55]){
        const mic=new THREE.Group();
        const mh=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),
          new THREE.MeshStandardMaterial({color:0xc77dff,emissive:0xc77dff,emissiveIntensity:1.8}));
        const mst=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.5,8),
          new THREE.MeshStandardMaterial({color:0x2a2a34,emissive:0x101018,emissiveIntensity:.5}));
        mst.position.y=-.36;mic.add(mh);mic.add(mst);
        mic.position.set(sx,1.6,.4);g.add(mic);mats.push(mh.material,mst.material);}
      // 回忆胶片：环绕的矩形片
      const films=[];
      for(let k=0;k<5;k++){
        const f=new THREE.Mesh(new THREE.PlaneGeometry(.5,.36),
          new THREE.MeshBasicMaterial({color:0xe0c0ff,transparent:true,opacity:.35,
            side:THREE.DoubleSide}));
        const a=k/5*Math.PI*2;
        f.position.set(Math.cos(a)*1.5,1.4+k*.22,Math.sin(a)*1.5);
        f.lookAt(0,1.4+k*.22,0);g.add(f);films.push(f);}
      g.userData.films=films;}
    if(bid==='emcee'){ // 婚礼司仪·伪神：铃铛冠 + 伪神光环 + 契约书
      for(let k=0;k<5;k++){
        const a=k/5*Math.PI*2;
        const bel=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),
          new THREE.MeshStandardMaterial({color:0xffd60a,emissive:0xffd60a,emissiveIntensity:1.8}));
        bel.position.set(Math.cos(a)*.62,2.95,Math.sin(a)*.62);
        g.add(bel);mats.push(bel.material);}
      for(let k=0;k<3;k++){
        const halo2=new THREE.Mesh(new THREE.TorusGeometry(1.05+k*.32,.028,6,28),
          new THREE.MeshStandardMaterial({color:0xff3d6e,emissive:0xff3d6e,emissiveIntensity:1.5,
            transparent:true,opacity:.75-k*.18}));
        halo2.rotation.x=Math.PI/2;halo2.position.y=2.55+k*.22;
        g.add(halo2);mats.push(halo2.material);}
      // 契约书（摊开的婚书）
      const book=new THREE.Mesh(new THREE.BoxGeometry(1.0,.06,.7),
        new THREE.MeshStandardMaterial({color:0xfff0f4,emissive:0xff8fa3,emissiveIntensity:.6}));
      book.position.set(0,1.45,.75);book.rotation.x=-.5;
      g.add(book);mats.push(book.material);
      g.userData.book=book;}
  }else{if(!E_STAT[type])type='chaser'; // 未知类型兜底，防止崩溃
    const st=E_STAT[type];
    const scale=type==='tank'?1.5:(type==='swarm'?.6:1);
    const bulk=type==='tank'?1.5:1;
    const det=type==='swarm'?0:1; // 小跟班用量最少档，保证同屏数量下的帧率
    const h=mkHumanoid(st.col,st.hair,scale,bulk,det,{bottom:0x241428,
      iris:st.hair===undefined?0x2a1620:0x6a2030,
      outline:type==='tank',outlineCol:0x120a18,outlineThick:.026});
    g=h.g;mats=h.mats;jj=h.j;
    if(jj.face)setExpr(jj.face,type==='tank'?'angry':type==='bomber'?'shout':'angry');}
  const a=Math.random()*7,r=type==='boss'?20:(26+Math.random()*10);
  g.position.set(player.position.x+Math.cos(a)*r,0,player.position.z+Math.sin(a)*r);
  // v44：Boss 血量改为「按 BOSSES_DEF 定义值 + 时间微增」，让 14 位 Boss 的血量档位真正生效
  // 旧版所有 Boss 共用 (900+S.time*3)，定义表里的 hp 形同废数据。
  let bossBaseHp=900;
  if(boss){
    const bidForHp=(typeof _bossBid!=='undefined'&&_bossBid)
      ||(typeof _pendingBossId!=='undefined'&&_pendingBossId)||'';
    const bd0=bidForHp&&(typeof BOSSES_DEF!=='undefined')&&BOSSES_DEF.find(x=>x.id===bidForHp);
    if(bd0&&bd0.hp)bossBaseHp=bd0.hp;
  }
  const st=boss?{hp:(bossBaseHp+S.time*3)*D.bossHpMul,spd:2.4*D.spdMul,r:1.7,dmg:22}
    :{hp:st2(type)*D.hpMul,spd:E_STAT[type].spd*D.spdMul,r:E_STAT[type].r,dmg:E_STAT[type].dmg};
  // v44：先保留外观阶段挂上去的 cup/films/book/stool 等定制部件，再整体覆盖基础字段
  const _mk0=Object.assign({},g.userData||{});
  g.userData={..._mk0,type,boss:!!boss,...st,maxHp:st.hp,hitT:0,shootT:2+Math.random()*2,elite:false,chargeT:0,rings:0,
    ring:(boss?_bossHalo:null),mats,baseEI:mats.map(m=>m.emissiveIntensity||0),j:jj,
    // 气质步态：每种情敌走路姿态不同
    stride:(()=>{switch(boss?'boss':type){case'boss':return{f:4,a:.5,lean:.12};
      case'tank':return{f:5,a:.55,lean:.08};
      case'shooter':return{f:7,a:.4,lean:0};
      case'bomber':return{f:16,a:1.25,lean:.5};
      case'swarm':return{f:14,a:1.1,lean:.35};
      default:return{f:9,a:.85,lean:.25};}})()};
  // 精英(15%概率, 后期)
  if(!boss&&S.time>60&&Math.random()<D.eliteRate){g.scale.multiplyScalar(1.4);g.userData.hp*=3;g.userData.maxHp=g.userData.hp;
    g.userData.elite=true;g.userData.dmg*=1.6;g.userData.spd*=.85;
    // 精英金冠标记
    const crown=new THREE.Mesh(new THREE.TorusGeometry(.3,.06,5,14),
      new THREE.MeshStandardMaterial({color:0xffd60a,emissive:0xff9e00,emissiveIntensity:1.2}));
    crown.rotation.x=Math.PI/2;crown.position.y=2.75;g.add(crown);
    applyEliteAffix(g);}
  // v63/v64：敌人与 Boss 整体替换为全身数字人（按类型映射 e1~e5 / b1~b14）
  if(typeof DH2_API!=='undefined'&&DH2_API.ready()){
    const role=boss?('b'+(1+(typeof BOSSES_DEF!=='undefined'&&(function(){
      const bid=_bossBid||'';const i=BOSSES_DEF.findIndex(x=>x.id===bid);return i<0?0:i;})()||0))):type;
    DH2_API.attach(g,role);
  }
  scene.add(g);enemies.push(g);return g;}
function st2(t){const m=1+S.time/50;return Math.round(E_STAT[t].hp*m);}
// ---------- v35 精英词缀：5 种随机强化，精英生成时随机附带 ----------
const ELITE_AFFIXES=[
 {id:'swift',ic:'🏃',n:'迅捷',col:0x4cc9f0,d:'移速大幅提升',f:u=>{u.spd*=1.55;}},
 {id:'vamp',ic:'💔',n:'嗜血',col:0xff2e2e,d:'伤害你时回复自身生命',f:u=>{u.dmg*=1.15;}},
 {id:'shield',ic:'🛡️',n:'护盾',col:0x8ad4ff,d:'携带 50% 生命护盾',f:u=>{u.shield=u.maxHp*.5;}},
 {id:'boom',ic:'💥',n:'湮灭',col:0xff8fa3,d:'死亡时自爆伤人',f:u=>{}},
 {id:'split',ic:'➗',n:'分裂',col:0xc77dff,d:'死亡时分裂两只小怪',f:u=>{u.hp*=1.2;u.maxHp=u.hp;}}];
function applyEliteAffix(g){const u=g.userData;
  const af=ELITE_AFFIXES[Math.floor(Math.random()*ELITE_AFFIXES.length)];
  u.affix=af.id;af.f(u);
  setTimeout(()=>meetOnce('reflect'),3000); // v48：第一次遇到词缀精英时解释
  // 词缀色环（脚下）+ 衣着微染色
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.85,.05,6,20),
    new THREE.MeshBasicMaterial({color:af.col,transparent:true,opacity:.85}));
  ring.rotation.x=Math.PI/2;ring.position.y=.06;g.add(ring);
  u.mats.forEach(m=>{if(m.emissive){m.emissive.setHex(af.col);m.emissiveIntensity=Math.max(m.emissiveIntensity||0,.25);}});
  u.baseEI=u.mats.map(m=>m.emissiveIntensity||0);
  if(!SAVE.seenAffix)SAVE.seenAffix={};
  if(!SAVE.seenAffix[af.id]){SAVE.seenAffix[af.id]=1;writeSave();
    tip(`⚠️ 首见词缀精英：${af.ic} ${af.n} —— ${af.d}`);}
  return af;}
let _pendingBossId=null,_bossHalo=null,_bossBid=null,_bossTheme=null;
// ---------- Boss 专属招式（三者各具性格） ----------
// 👑 军团长：弹幕环 / 陨石 / 召唤电灯泡
function bossCaptain(e,u,pp,phase2,roll){
  if(roll<.4){ // 弹幕环
    const n=phase2?12:8;for(let k=0;k<n;k++){const a=k/n*Math.PI*2;
      const b=new THREE.Mesh(G.eBullet,M.eBullet);b.position.copy(e.position).setY(1);
      b.userData={v:new THREE.Vector3(Math.cos(a)*9,0,Math.sin(a)*9),dmg:14,life:2.6};scene.add(b);eBullets.push(b);}
    sfx.ult();burst(e.position,0xff006e,18,9);}
  else if(roll<.75){ // 陨石预警
    for(let k=0;k<(phase2?4:2);k++){const tp=pp.clone().add(new THREE.Vector3((Math.random()-.5)*5,0,(Math.random()-.5)*5));
      mkTele(tp,2.2,1,()=>{if(pp.distanceTo(tp)<2.2)hurtPlayer(20);burst(tp,0xff006e,16,9);shake(.35);});}}
  else{for(let k=0;k<(phase2?6:4);k++)mkEnemy('swarm');tip('😈 军团长召唤了电灯泡们！');}}
// 💍 丈母娘：彩礼账单冲击波 / 红包雨 / 三姑六婆围堵
function bossMother(e,u,pp,phase2,roll){
  if(roll<.38){ // 天价彩礼账单：扇形冲击波
    const base=Math.atan2(pp.x-e.position.x,pp.z-e.position.z),n=phase2?7:5;
    for(let k=0;k<n;k++){const a=base+(k-(n-1)/2)*.26;
      const b=new THREE.Mesh(G.eBullet,M.eBullet);b.position.copy(e.position).setY(1);
      b.userData={v:new THREE.Vector3(Math.sin(a)*11,0,Math.cos(a)*11),dmg:18,life:2.4};scene.add(b);eBullets.push(b);}
    tip('💍 「彩礼三百万，一分不能少！」');sfx.ult();burst(e.position,0xffd60a,20,10);flashOverlay('rgba(255,214,10,.18)',.35);}
  else if(roll<.72){ // 红包雨（落点密集，捡到反伤）
    for(let k=0;k<(phase2?5:3);k++){const tp=pp.clone().add(new THREE.Vector3((Math.random()-.5)*6,0,(Math.random()-.5)*6));
      mkTele(tp,1.5,.85,()=>{if(pp.distanceTo(tp)<1.5)hurtPlayer(16);burst(tp,0xff4d6d,14,8);});}
    tip('🧧 红包雨来了——但都是人情债！');}
  else{ // 三姑六婆围堵
    const n=phase2?4:3;
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2;const sp=pp.clone().add(new THREE.Vector3(Math.sin(a)*4,0,Math.cos(a)*4));
      mkEnemy('swarm');const ne=enemies[enemies.length-1];if(ne)ne.position.copy(sp);}
    tip('👵 三姑六婆：什么时候结婚？！');}
}
// 👤 命运镜像体：复制玩家奇招 / 镜像分身 / 反噬
function bossMirror(e,u,pp,phase2,roll){
  if(roll<.4){ // 复制玩家的环形玫瑰（反色）
    const n=phase2?10:6,ring=new THREE.Group();ring.position.copy(e.position);
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2;
      const b=new THREE.Mesh(G.eBullet,M.eBullet);b.position.copy(e.position).setY(1);
      b.userData={v:new THREE.Vector3(Math.cos(a)*7.5,0,Math.sin(a)*7.5),dmg:16,life:3,
        mirror:true};scene.add(b);eBullets.push(b);}
    tip('👤 「你的套路，我全会。」');sfx.ult();burst(e.position,0x4cc9f0,22,11);}
  else if(roll<.7){ // 镜像分身
    const n=phase2?3:2;
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2;const sp=pp.clone().add(new THREE.Vector3(Math.sin(a)*5,0,Math.cos(a)*5));
      mkEnemy('swarm');const ne=enemies[enemies.length-1];
      if(ne){ne.position.copy(sp);ne.userData.mirrorShade=true;ne.userData.hp*=2.5;ne.userData.maxHp=ne.userData.hp;}
      burst(sp.clone().setY(1),0x4cc9f0,12,7);}
    tip('👤 镜像分身——都是你的影子');}
  else{ // 反噬：把玩家当前移速/伤害特性弹回
    const tp=pp.clone();
    mkTele(tp,3.2,.9,()=>{if(pp.distanceTo(tp)<3.2){hurtPlayer(24);S.spd=Math.max(5.5,S.spd*.88);}
      burst(tp,0x9b5de5,20,11);shake(.5);});
    tip('👤 「反噬！」你的身法被记住了');flashOverlay('rgba(155,93,229,.25)',.4);}
}
// 🕳️ 深渊之主（v20 隐藏 Boss）：吞噬奇招 / 虚空裂隙 / 觉醒反噬
function bossAbyss(e,u,pp,phase2,roll){
  if(roll<.36){ // 吞噬奇招：偷取玩家已觉醒的武器，反打回来
    const aw=AWAKENS.filter(a=>W[a.key].awakened);
    const pick=aw.length?aw[Math.floor(Math.random()*aw.length)]:null;
    const n=phase2?14:9;const base=Math.atan2(pp.x-e.position.x,pp.z-e.position.z);
    for(let k=0;k<n;k++){const a=base+(k-(n-1)/2)*.3;
      const b=new THREE.Mesh(G.eBullet,M.eBullet);b.position.copy(e.position).setY(1);
      b.material=new THREE.MeshBasicMaterial({color:0xff2e2e});
      b.userData={v:new THREE.Vector3(Math.sin(a)*12,0,Math.cos(a)*12),dmg:20,life:2.6,abyss:true};
      scene.add(b);eBullets.push(b);}
    tip(pick?`🕳️ 「你的 ${pick.n}，现在我也会了！」`:'🕳️ 「虚空，吞噬一切。」');
    sfx.ult();burst(e.position,0xff2e2e,24,12);flashOverlay('rgba(255,46,46,.22)',.4);}
  else if(roll<.7){ // 虚空裂隙：多重落点 + 拉拽
    const n=phase2?6:4;
    for(let k=0;k<n;k++){const tp=pp.clone().add(new THREE.Vector3((Math.random()-.5)*8,0,(Math.random()-.5)*8));
      mkTele(tp,2.0,.9,()=>{
        if(pp.distanceTo(tp)<2.0){hurtPlayer(22);
          const pull=tp.clone().sub(pp).setY(0).normalize().multiplyScalar(-2);pp.add(pull);}
        burst(tp,0xff2e2e,16,10);shake(.3);});}
    tip('🕳️ 虚空裂隙撕开——别被拽进去！');}
  else{ // 深渊召唤 + 自身回血（压迫感）
    const n=phase2?7:5;
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2;const sp=pp.clone().add(new THREE.Vector3(Math.sin(a)*4.5,0,Math.cos(a)*4.5));
      mkEnemy('chaser');const ne=enemies[enemies.length-1];
      if(ne){ne.position.copy(sp);ne.userData.hp*=1.8;ne.userData.maxHp=ne.userData.hp;
        ne.userData.dmg*=1.4;ne.userData.abyssMinion=true;}
      burst(sp.clone().setY(1),0x6a0404,10,6);}
    e.userData.hp=Math.min(e.userData.maxHp,e.userData.hp+e.userData.maxHp*.04);
    tip('🕳️ 深渊低语：无数情敌涌出，深渊之主汲取生命');}
}
// ⚡ 雷神（v22 天气限定 Boss）：仅雷暴天气出现，掌控雷电
function bossThunder(e,u,pp,phase2,roll){
  if(roll<.38){ // 落雷链：连续预判玩家位置劈落
    const n=phase2?5:3;
    for(let k=0;k<n;k++){const tp=player.position.clone().add(new THREE.Vector3(joy.dx*8*k*.4,0,joy.dz*8*k*.4));
      mkTele(tp,1.6,.5+k*.12,()=>{if(pp.distanceTo(tp)<1.6)hurtPlayer(26);
        burst(tp,0x8ad4ff,18,11);shake(.35);
        const l=new THREE.PointLight(0xcfe4ff,2.6,40);l.position.copy(tp).setY(12);scene.add(l);
        setTimeout(()=>scene.remove(l),80);});}
    tip('⚡ 「雷霆不会偏袒任何人。」');sfx.ult();flashOverlay('rgba(200,225,255,.3)',.3);}
  else if(roll<.72){ // 静电场：自身周围环状电弧
    const n=phase2?16:11;
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2 + performance.now()/1000;
      const b=new THREE.Mesh(G.eBullet,M.eBullet);b.position.copy(e.position).setY(1);
      b.material=new THREE.MeshBasicMaterial({color:0x8ad4ff});
      b.userData={v:new THREE.Vector3(Math.cos(a)*10,0,Math.sin(a)*10),dmg:16,life:2.4,thunder:true};
      scene.add(b);eBullets.push(b);}
    burst(e.position,0x8ad4ff,22,12);}
  else{ // 雷暴强化：召唤雷云，随机落雷 + 自身附着电光
    for(let k=0;k<(phase2?4:2);k++){const tp=player.position.clone().add(new THREE.Vector3((Math.random()-.5)*10,0,(Math.random()-.5)*10));
      mkTele(tp,2.2,1.2,()=>{if(pp.distanceTo(tp)<2.2)hurtPlayer(18);burst(tp,0x8ad4ff,14,9);});}
    e.userData.hp=Math.min(e.userData.maxHp,e.userData.hp+e.userData.maxHp*.03);
    tip('⚡ 雷神召唤了风暴——落雷四起！');
    if(typeof envWeather!=='undefined'&&envWeather!==3){envWeather=3;envApply&&envApply();}
  }
}
// 🌧️ 雨神·潇湘（v27 细雨限定 Boss）：雨帘水幕 + 洪流冲击 + 泪雨追踪
function bossRain(e,u,pp,phase2,roll){
  if(roll<.36){ // 雨帘水幕：环形水幕墙，穿墙者受罚
    const R=phase2?7:5.5;
    for(let k=0;k<(phase2?26:18);k++){const a=k/(phase2?26:18)*Math.PI*2;
      const w=new THREE.Mesh(new THREE.PlaneGeometry(.5,2.2),
        new THREE.MeshBasicMaterial({color:0x7fc4ff,transparent:true,opacity:.55,side:THREE.DoubleSide}));
      w.position.copy(e.position).add(new THREE.Vector3(Math.cos(a)*R,1.1,Math.sin(a)*R));
      w.lookAt(e.position.x,1.1,e.position.z);
      w.userData={water:true,life:2.6,spin:.6};scene.add(w);parts.push(w);}
    mkTele(e.position.clone(),R,1.0,()=>{
      if(pp.distanceTo(e.position)<R)hurtPlayer(20);
      burst(e.position,0x7fc4ff,20,11);tip('🌊 水幕收拢——');});
    sfx.ult();}
  else if(roll<.7){ // 洪流冲击：向玩家方向冲出高伤水墙
    const d3=pp.clone().sub(e.position).setY(0).normalize();
    for(let k=0;k<(phase2?3:2);k++){
      const off=d3.clone().multiplyScalar(2+k*2.4);
      const wp=e.position.clone().add(off);
      mkTele(wp,2.0,.85+k*.15,()=>{
        if(pp.distanceTo(wp)<2.0)hurtPlayer(26);
        burst(wp,0x5ab0ff,18,12);shake(.3);});
    }
    tip('🌊 洪流奔涌而来！');sfx.hit();}
  else{ // 泪雨追踪：召唤追命雨滴雨幕
    const n=phase2?7:5;
    for(let k=0;k<n;k++){
      const b=new THREE.Mesh(G.eBullet,new THREE.MeshBasicMaterial({color:0x9ad8ff}));
      b.position.copy(e.position).setY(3+Math.random()*2);b.scale.set(.7,1.6,.7);
      const dx=pp.x-b.position.x,dz=pp.z-b.position.z;
      const d4=new THREE.Vector3(dx,0,dz).normalize();
      b.userData={v:d4.multiplyScalar(12).setY(-9),dmg:14,life:3.2,rainDrop:true};
      scene.add(b);eBullets.push(b);}
    tip('💧 泪雨如注，避无可避！');sfx.evo();}
}
// ☀️ 金乌（v26 白昼晴天限定 Boss）：日光灼烧 + 日珥喷发 + 三足金乌分身
function bossSolar(e,u,pp,phase2,roll){
  if(roll<.36){ // 日光灼烧：锁定玩家降下光柱，持续灼烧
    const tp=pp.clone();
    mkTele(tp,2.6,1.0,()=>{
      if(pp.distanceTo(tp)<2.6)hurtPlayer(22);
      for(let k=0;k<3;k++)setTimeout(()=>{
        if(S.alive&&pp.distanceTo(tp)<2.8)hurtPlayer(12);
        burst(tp,0xffd60a,16,10);},k*260);
      tip('☀️ 日光灼烧——');});
    sfx.ult();flashOverlay('rgba(255,225,150,.28)',.4);}
  else if(roll<.7){ // 日珥喷发：环状太阳风弹幕 + 拾取范围压制
    const n=phase2?20:14;
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2+performance.now()/900;
      const b=new THREE.Mesh(G.eBullet,M.eBullet);
      b.material=new THREE.MeshBasicMaterial({color:0xffd60a});
      b.position.copy(e.position).setY(1);
      b.userData={v:new THREE.Vector3(Math.cos(a)*(phase2?13:10),0,Math.sin(a)*(phase2?13:10)),
        dmg:15,life:2.6,solar:true};
      b.scale.setScalar(1.25);scene.add(b);eBullets.push(b);}
    burst(e.position,0xffd60a,24,13);}
  else{ // 三足金乌分身：召唤 3 只灼热金乌（高速自爆鸟）
    const n=phase2?5:3;
    for(let k=0;k<n;k++){const a=Math.random()*7;
      const cl=mkEnemy('bomber');
      cl.position.copy(e.position).add(new THREE.Vector3(Math.cos(a)*6,0,Math.sin(a)*6));
      cl.userData.hp=cl.userData.maxHp=(phase2?60:40);
      cl.userData.solarBird=true;cl.userData.dmg=Math.round(u.dmg*.8);
      const gm=cl.userData.mats;if(gm)gm.forEach(m=>m.color&&m.color.setHex(0xffd60a));
      cl.scale.setScalar(.9);}
    tip('🔥 三足金乌啼鸣，烈焰自天而降！');sfx.evo();}
}
// 🗡️ 雾隐刺客（v25 浓雾天气限定 Boss）：潜行隐身 + 背后突袭 + 影分身
function bossAssassin(e,u,pp,phase2,roll){
  if(roll<.36){ // 潜行突袭：隐身瞬移到玩家身后，短预警后背刺
    u.stealth=1.6;e.visible=false;
    const back=new THREE.Vector3(-joy.dx||0,0,-joy.dz||0);
    if(back.length()<.1)back.set(0,0,1);back.normalize();
    const tp=pp.clone().addScaledVector(back,2.6);
    e.position.copy(tp);
    mkTele(tp,2.2,.7,()=>{
      e.visible=true;u.stealth=0;
      if(pp.distanceTo(tp)<2.4)hurtPlayer(30);
      burst(tp,0x2a3a4a,24,14);shake(.5);flashOverlay('rgba(30,40,60,.35)',.35);
      tip('🗡️ 影从雾中来——');});
    sfx.ult();}
  else if(roll<.68){ // 烟幕弹：投掷雾弹形成遮蔽领域，玩家移速下降
    const n=phase2?4:3;
    for(let k=0;k<n;k++){const tp=pp.clone().add(new THREE.Vector3((Math.random()-.5)*14,0,(Math.random()-.5)*14));
      const m=new THREE.Mesh(new THREE.SphereGeometry(2.4,12,10),
        new THREE.MeshBasicMaterial({color:0x4a5a6a,transparent:true,opacity:.42}));
      m.position.copy(tp).setY(1.6);scene.add(m);
      const l=(k===0)?new THREE.PointLight(0x3a4a5a,1.2,30):null; // 仅首个雾弹带光源，控制光源峰值
      if(l){l.position.copy(tp).setY(8);scene.add(l);}
      parts.push({mesh:m,pt:l,userData:{smoke:true,life:4.5,ptl:l,ptLife:.5}});
    }
    u.slowT=Math.max(u.slowT||0,0);
    tip('💨 刺客引爆烟幕，视野受阻！');sfx.hit();}
  else{ // 影分身：分裂多个雾影，分身被击破后真身显形
    e.visible=false;u.stealth=2.2;
    const n=phase2?5:3;
    for(let k=0;k<n;k++){const a=Math.random()*7;
      const cl=mkEnemy('chaser');
      cl.position.copy(e.position).add(new THREE.Vector3(Math.cos(a)*5,0,Math.sin(a)*5));
      cl.userData.hp=cl.userData.maxHp=(phase2?70:45);
      cl.userData.assassinClone=true;cl.userData.dmg=Math.round(u.dmg*.6);
      const gm=cl.userData.mats;if(gm)gm.forEach(m=>m.color&&m.color.setHex(0x4a5a6a));
      cl.scale.setScalar(.85);}
    tip('👥 雾中浮现数道身影，哪个才是真身？');sfx.evo();}
}
// 🌊 深海海王·沧澜（v38 深海王座限定）：巨浪吞噬 + 珍珠弹幕 + 漩涡拉扯
function bossSeaking(e,u,pp,phase2,roll){
  if(roll<.36){ // 巨浪吞噬：三道推进浪墙
    const n=phase2?3:2;
    for(let w=0;w<n;w++){
      setTimeout(()=>{if(!e.userData.hp||e.userData.hp<=0)return;
        const dir=new THREE.Vector3(pp.x-e.position.x,0,pp.z-e.position.z).normalize();
        for(let k=0;k<(phase2?16:12);k++){const off=(k-(phase2?16:12)/2)*1.1;
          const p3=new THREE.Mesh(new THREE.PlaneGeometry(1.1,2.6),
            new THREE.MeshBasicMaterial({color:0x4cc9f0,transparent:true,opacity:.6,side:THREE.DoubleSide}));
          p3.position.copy(e.position).addScaledVector(dir,2).add(new THREE.Vector3(-dir.z*off,1.3,dir.x*off));
          p3.lookAt(e.position.x,1.3,e.position.z);
          p3.userData={pWave:true,v:dir.clone().multiplyScalar(11),dmg:22,life:2.2};
          scene.add(p3);parts.push(p3);}
        sfx.ult();},w*420);}
    tip('🌊 「潮起潮落，皆是虚妄。」');}
  else if(roll<.7){ // 珍珠弹幕：环绕珍珠散射
    const n=phase2?26:18;
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2+Math.random()*.3;
      const b=new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),
        new THREE.MeshStandardMaterial({color:0xf0ffff,emissive:0x7fffd4,emissiveIntensity:1.1,metalness:.5,roughness:.2}));
      b.position.copy(e.position).setY(1.4);
      b.userData={v:new THREE.Vector3(Math.cos(a)*(phase2?13:10),0,Math.sin(a)*(phase2?13:10)),dmg:15,life:2.8};
      scene.add(b);eBullets.push(b);}
    burst(e.position,0x7fffd4,20,11);}
  else{ // 漩涡拉扯：把玩家拽向中心并持续掉血
    const c=e.position.clone();
    const swirl=new THREE.Mesh(new THREE.RingGeometry(1.2,7,32),
      new THREE.MeshBasicMaterial({color:0x40e0d0,transparent:true,opacity:.3,side:THREE.DoubleSide}));
    swirl.rotation.x=-Math.PI/2;swirl.position.copy(c).setY(.08);
    swirl.userData={vortex:true,life:3.2,spin:2.4};scene.add(swirl);parts.push(swirl);
    let tick=0;
    const iv=setInterval(()=>{
      if(!S.alive||!e.userData.hp||e.userData.hp<=0||++tick>6){clearInterval(iv);return;}
      const d=new THREE.Vector3(pp.x-e.position.x,0,pp.z-e.position.z);
      if(d.length()<8){player.position.addScaledVector(d.normalize(),-1.1);hurtPlayer(9);}
    },500);
    tip('🌀 漩涡拉扯——无法挣脱的深情！');sfx.evo();}
}
// ❄️ 霜夜女王·凛（v39 极夜冰原限定）：冰锥囚笼 + 极寒心冻 + 冰川崩裂
function bossFrost(e,u,pp,phase2,roll){
  if(roll<.36){ // 冰锥囚笼：环形冰锥合围，圈内受创
    const R=phase2?7.5:6,n=phase2?20:15;
    for(let k=0;k<n;k++){const a=k/n*Math.PI*2;
      const cone=new THREE.Mesh(new THREE.ConeGeometry(.34,2.8,5),
        new THREE.MeshStandardMaterial({color:0xcfeaff,emissive:0x7fd4ff,emissiveIntensity:.7,transparent:true,opacity:.8,roughness:.2}));
      cone.position.copy(pp).add(new THREE.Vector3(Math.cos(a)*R,1.4,Math.sin(a)*R));
      cone.rotation.x=Math.PI;cone.userData={ice:true,life:3.0,rise:.8};
      cone.scale.y=.05;scene.add(cone);parts.push(cone);}
    mkTele(pp.clone(),R,1.1,()=>{
      if(pp.distanceTo(player.position)<R){
        if(player.position.distanceTo(pp)>R*.55)hurtPlayer(28); // 贴边者重伤，中心相对安全
        else hurtPlayer(12);}
      burst(pp,0xa8e6ff,22,12);shake(.4);});
    tip('❄️ 「冷吗？我的心比这更冷。」');sfx.ult();flashOverlay('rgba(200,240,255,.28)',.3);}
  else if(roll<.7){ // 极寒心冻：扇形冰刺 + 玩家减速
    const dir=new THREE.Vector3(pp.x-e.position.x,0,pp.z-e.position.z).normalize();
    const n=phase2?9:6;
    for(let k=0;k<n;k++){const a=Math.atan2(dir.x,dir.z)+(k-(n-1)/2)*.16;
      const spike=new THREE.Mesh(new THREE.ConeGeometry(.28,3.6,4),
        new THREE.MeshStandardMaterial({color:0xdff4ff,emissive:0x7fd4ff,emissiveIntensity:1,transparent:true,opacity:.85}));
      spike.position.copy(e.position).setY(0);
      spike.userData={iceSpike:true,dir:new THREE.Vector3(Math.sin(a),0,Math.cos(a)),v:24,life:1.4};
      spike.rotation.set(Math.PI/2,0,-a);
      scene.add(spike);parts.push(spike);}
    mkTele(pp.clone(),3.2,.9,()=>{if(pp.distanceTo(player.position)<3.2){hurtPlayer(24);S.slowT=Math.max(S.slowT||0,2.2);}});
    tip('❄️ 极寒冻结——行动变得迟缓');sfx.hit();}
  else{ // 冰川崩裂：全场碎冰雨 + 二阶段额外冰爆
    const n=phase2?14:9;
    for(let k=0;k<n;k++){
      const tp=player.position.clone().add(new THREE.Vector3((Math.random()-.5)*22,0,(Math.random()-.5)*22));
      mkTele(tp,1.8,.8+k*.09,()=>{if(pp.distanceTo(tp)<1.8)hurtPlayer(17);
        burst(tp,0xa8e6ff,14,9);
        for(let m=0;m<3;m++){const sh=new THREE.Mesh(new THREE.OctahedronGeometry(.3,0),
          new THREE.MeshBasicMaterial({color:0xdff4ff,transparent:true,opacity:.9}));
          sh.position.copy(tp).setY(1);sh.userData={v:new THREE.Vector3((Math.random()-.5)*9,5+Math.random()*3,(Math.random()-.5)*9),life:.7,dmg:7};
          scene.add(sh);parts.push(sh);}});}
    e.userData.hp=Math.min(e.userData.maxHp,e.userData.hp+e.userData.maxHp*.025);
    tip('🌨️ 永夜倾覆，冰川崩裂！');}
}
// 🕛 四时之主·时序（v39 天气 Boss 线终极）：轮转借用四系天气 Boss 的权柄
function bossChronos(e,u,pp,phase2,roll){
  const seq=['thunder','rain','solar','assassin'];
  if(u.chronoIdx===undefined)u.chronoIdx=0;
  // v40：气候试炼中，四时之主优先借用「当前相位」的权柄（与场地天气同步，压迫感更强）
  const cp=(typeof climatePhase==='function')?climatePhase():null;
  const phMap={storm:'thunder',rain:'rain',solar:'solar',fog:'assassin'};
  const pick=(cp&&roll<.55)?phMap[cp.k]:seq[u.chronoIdx%4];
  if(!(cp&&roll<.55))u.chronoIdx++;
  const SEASON={thunder:'⚡ 春雷',rain:'🌧️ 夏雨',solar:'☀️ 秋阳',assassin:'🌫️ 冬雾'};
  tip(`🕛 「${SEASON[pick]}，尽归我手。」`);
  // 借用对应 Boss 的核心招式（复用已有实现，roll 固定为第一段）
  if(pick==='thunder')bossThunder(e,u,pp,phase2,.1);
  else if(pick==='rain')bossRain(e,u,pp,phase2,.1);
  else if(pick==='solar')bossSolar(e,u,pp,phase2,.1);
  else bossAssassin(e,u,pp,phase2,.1);
  // 时之环：额外释放一圈四色弹幕
  const n=phase2?20:14;
  for(let k=0;k<n;k++){const a=k/n*Math.PI*2+performance.now()/2000;
    const cols=[0x8ad4ff,0x9aa8b8,0xffd60a,0x7fc4ff];
    const b=new THREE.Mesh(G.eBullet,M.eBullet);
    b.material=new THREE.MeshBasicMaterial({color:cols[k%4]});
    b.position.copy(e.position).setY(1.2);
    b.userData={v:new THREE.Vector3(Math.cos(a)*12,0,Math.sin(a)*12),dmg:16,life:2.6};
    scene.add(b);eBullets.push(b);}
  if(phase2){ // 二阶段：时间加速，自身移速提升
    u.spd=Math.min(u.spd*1.02,u.baseSpd*1.6||9);}
}

// ============ v44 第七章 · 婚宴修罗场 · 三位 Boss ============

// 🎩 岳父大人·陈镇岳：敬酒冲击 / 家法板凳 / 彩礼清单（三招，主打「体面的压迫」）
// 设计：他不是恶人，他是「规矩」。招式全部是「礼数」，但每一下都能打死你。
function bossFatherinlaw(e,u,pp,phase2,roll){
  if(u.cup)u.cup.rotation.x=-.9; // 举杯
  if(roll<.36){ // 敬酒冲击：抛酒杯抛物线，落点爆炸
    const n=phase2?4:2;
    const base=pp.clone();
    for(let k=0;k<n;k++){
      const tgt=base.clone().add(new THREE.Vector3((Math.random()-.5)*7,0,(Math.random()-.5)*7));
      mkTele(tgt,1.9,.9+k*.18,()=>{
        if(pp.distanceTo(tgt)<1.9)hurtPlayer(24);
        burst(tgt.clone().setY(1),0xffd60a,20,11);shake(.3);
        // 酒液飞溅：短命金色环
        const r2=new THREE.Mesh(new THREE.RingGeometry(1.2,1.9,24),
          new THREE.MeshBasicMaterial({color:0xffd60a,transparent:true,opacity:.6,side:THREE.DoubleSide}));
        r2.rotation.x=-Math.PI/2;r2.position.copy(tgt).setY(.2);
        r2.userData={fade:true,life:.4};scene.add(r2);parts.push(r2);});}
    tip('🎩 岳父：「这杯，你喝也得喝，不喝也得喝。」');sfx.ult();}
  else if(roll<.7){ // 家法板凳：背后板凳飞出，横扫扇形
    const d3=pp.clone().sub(e.position).setY(0).normalize();
    const cnt=phase2?3:2;
    for(let k=0;k<cnt;k++){
      const ang=Math.atan2(d3.x,d3.z)+(k-(cnt-1)/2)*.5;
      const st=new THREE.Group();
      const seat=new THREE.Mesh(new THREE.BoxGeometry(.9,.12,.5),
        new THREE.MeshStandardMaterial({color:0x6a3a12,emissive:0xd4af37,emissiveIntensity:.9}));
      st.add(seat);
      st.position.copy(e.position).setY(1.2);
      st.userData={v:new THREE.Vector3(Math.sin(ang)*13,0,Math.cos(ang)*13),dmg:30,life:1.5};
      scene.add(st);stools.push(st);}
    tip('🎩 岳父：「家法在此，跪下！」');sfx.hit();}
  else{ // 彩礼清单：全屏账单冲击 + 自身回血（要钱不要命）
    const R=phase2?11:8.5;
    for(let k=0;k<(phase2?30:22);k++){const a=k/(phase2?30:22)*Math.PI*2;
      const p2=new THREE.Mesh(new THREE.PlaneGeometry(.7,.9),
        new THREE.MeshBasicMaterial({color:0xfff2c0,transparent:true,opacity:.75,side:THREE.DoubleSide}));
      p2.position.copy(e.position).add(new THREE.Vector3(Math.cos(a)*1.2,1.4,Math.sin(a)*1.2));
      p2.userData={bill:true,life:1.3,a:a,v:new THREE.Vector3(Math.cos(a)*R,0,Math.sin(a)*R),t:0};
      scene.add(p2);parts.push(p2);}
    mkTele(e.position.clone(),R,1.3,()=>{
      if(pp.distanceTo(e.position)<R)hurtPlayer(28);
      shake(.5);flashOverlay('rgba(255,214,10,.28)',.5);});
    u.hp=Math.min(u.maxHp,u.hp+u.maxHp*.04);
    tip('🎩 岳父：「清单在这——房、车、聘礼，一样不能少！」');sfx.ult();}
  if(u.cup)setTimeout(()=>{if(u.cup)u.cup.rotation.x=0;},700);
}

// 🎤 前任合唱团：三重唱共鸣 / 回忆胶片 / 破音嘶吼（三人共享节奏）
// 设计：正面吃「三重共鸣」伤害翻倍——逼玩家离开正前方的舒适输出位。
function bossExchorus(e,u,pp,phase2,roll){
  // 胶片环绕动画
  if(u.films){const t0=performance.now()/1000;
    u.films.forEach((f,k)=>{const a=t0*.8+k/5*Math.PI*2;
      f.position.x=Math.cos(a)*1.5;f.position.z=Math.sin(a)*1.5;
      f.lookAt(0,f.position.y,0);});}
  if(roll<.38){ // 三重唱共鸣：三道扇形声波，正面叠加
    const d3=pp.clone().sub(e.position).setY(0).normalize();
    const baseAng=Math.atan2(d3.x,d3.z);
    const waves=phase2?3:2;
    for(let w=0;w<waves;w++){
      setTimeout(()=>{
        for(let k=0;k<(phase2?22:16);k++){
          const spread=(k/(phase2?22:16)-.5)*1.5;
          const ang=baseAng+spread;
          const b=new THREE.Mesh(new THREE.TorusGeometry(.5,.1,5,10),
            new THREE.MeshBasicMaterial({color:0xc77dff,transparent:true,opacity:.85}));
          b.position.copy(e.position).setY(1.3);
          b.userData={v:new THREE.Vector3(Math.sin(ang)*11,0,Math.cos(ang)*11),
            dmg:20,life:1.7,sonic:true};
          scene.add(b);eBullets.push(b);}
        sfx.hit();},w*260);}
    // 正面叠加惩罚：站在正前方 1.2 弧度内额外受一次
    const fwd=e.position.clone().add(d3.clone().multiplyScalar(6));
    mkTele(fwd,2.6,.8,()=>{
      if(pp.distanceTo(fwd)<2.6)hurtPlayer(16);});
    tip('🎤 三人齐唱：「你欠我的，一句都别想赖——」');sfx.ult();}
  else if(roll<.72){ // 回忆胶片：飞出的胶片变成减速区
    const n=phase2?6:4;
    for(let k=0;k<n;k++){
      const a=Math.random()*Math.PI*2;
      const dst=e.position.clone().add(new THREE.Vector3(Math.cos(a)*(4+Math.random()*8),0,Math.sin(a)*(4+Math.random()*8)));
      mkTele(dst,2.2,.7,()=>{
        if(pp.distanceTo(dst)<2.2){hurtPlayer(14);S.slowT=Math.max(S.slowT||0,1.4);}
        const f=new THREE.Mesh(new THREE.PlaneGeometry(.6,.44),
          new THREE.MeshBasicMaterial({color:0xe0c0ff,transparent:true,opacity:.5,side:THREE.DoubleSide}));
        f.position.copy(dst).setY(.9);f.rotation.x=-Math.PI/2.6;
        f.userData={fade:true,life:.9};scene.add(f);parts.push(f);});}
    tip('🎤 「这张照片你还记得吗？——那年你说过永远。」');}
  else{ // 破音嘶吼：自身周围大范围推击 + 短暂静默（无法射击）
    const R=phase2?9:7;
    mkTele(e.position.clone(),R,1.1,()=>{
      if(pp.distanceTo(e.position)<R){
        hurtPlayer(26);
        const dir=pp.clone().sub(e.position).setY(0).normalize();
        player.position.addScaledVector(dir,3.2);}
      shake(.6);flashOverlay('rgba(199,125,255,.3)',.45);});
    tip('🎤 破音！「啊啊啊啊————」');sfx.ult();}
}

// 🔔 婚礼司仪·伪神：誓词判定（全屏金圈）/ 撒花刀片 / 神谕倒计时
// 设计：唯一一个「站错位置必死」的机制型 Boss，考的是走位而不是输出。
function bossEmcee(e,u,pp,phase2,roll){
  if(u.book){u.book.rotation.y+=.06;}
  if(roll<.4){ // 「我愿意」：全屏金圈判定，只有边缘安全
    const R=phase2?13:11;
    mkTele(e.position.clone(),R,1.6,()=>{
      const d=pp.distanceTo(e.position);
      // 判定：安全区是「圈外」或「贴圈内缘 1.2 宽」
      if(d<R-1.2)hurtPlayer(42);
      shake(.7);flashOverlay('rgba(255,61,110,.34)',.6);
      // 金圈视觉
      const rg=new THREE.Mesh(new THREE.RingGeometry(R-1.2,R,48),
        new THREE.MeshBasicMaterial({color:0xffd60a,transparent:true,opacity:.55,side:THREE.DoubleSide}));
      rg.rotation.x=-Math.PI/2;rg.position.copy(e.position).setY(.15);
      rg.userData={fade:true,life:1.0};scene.add(rg);parts.push(rg);});
    tip('🔔 司仪：「请回答——你愿意吗？」');
    tip2('（站到金圈边缘！圈内会被誓词判定命中）');
    sfx.ult();}
  else if(roll<.72){ // 撒花刀片：环形花瓣，实为刀片
    const n=phase2?26:18;
    for(let k=0;k<n;k++){
      const a=k/n*Math.PI*2+performance.now()/1400;
      const p2=new THREE.Mesh(new THREE.PlaneGeometry(.42,.42),
        new THREE.MeshBasicMaterial({color:k%3?0xff8fa3:0xffd60a,transparent:true,opacity:.9,
          side:THREE.DoubleSide}));
      p2.position.copy(e.position).setY(1.6);
      p2.userData={v:new THREE.Vector3(Math.cos(a)*11,0,Math.sin(a)*11),dmg:15,life:1.9,petal:true};
      scene.add(p2);eBullets.push(p2);}
    tip('🔔 「新郎新娘，请接受大家的祝福——」');sfx.hit();}
  else{ // 神谕倒计时：三处金圈同时收缩，最后一处是安全位置
    const spots=[];
    for(let k=0;k<3;k++){
      const a=Math.random()*Math.PI*2;
      spots.push(e.position.clone().add(new THREE.Vector3(Math.cos(a)*(5+Math.random()*5),0,Math.sin(a)*(5+Math.random()*5))));}
    const safe=Math.floor(Math.random()*3);
    spots.forEach((sp,k)=>{
      mkTele(sp,2.4,1.4+k*.1,()=>{
        if(k!==safe){ // 非安全位爆炸
          if(pp.distanceTo(sp)<2.4)hurtPlayer(30);
          burst(sp.clone().setY(.8),0xff3d6e,18,10);
        }else{
          // 安全位：留下增益光点
          const g2=new THREE.Mesh(G.orb,new THREE.MeshBasicMaterial({color:0xffd60a}));
          g2.scale.setScalar(.7);g2.position.copy(sp).setY(1.2);
          g2.userData={v:new THREE.Vector3(0,0,0),life:.1,isPick:true};
          scene.add(g2);orbs.push(g2);
          S.hp=Math.min(S.maxHp,S.hp+12);}});});
    tip('🔔 「神的旨意有三处——只有一处是真的。」');
    sfx.ult();}
}

// 地面预警圈
function mkTele(pos,r,dur,cb){const m=new THREE.Mesh(G.tele,M.tele);
  m.position.copy(pos).setY(.06);m.scale.setScalar(r);m.userData={life:dur,max:dur,cb,r};
  scene.add(m);teles.push(m);}

// ---------- 伤害/粒子 ----------
function burst(pos,color=0xff4d9e,n=10,spd=7){
  fxFlash(pos,1.5); // v67 AI 命中闪光
  for(let i=0;i<n;i++){const p=new THREE.Mesh(G.part,M.part.clone());p.material.color.setHex(color);
    p.position.copy(pos);p.userData={v:new THREE.Vector3((Math.random()-.5)*spd,Math.random()*spd*.8,(Math.random()-.5)*spd),life:.55};
    scene.add(p);parts.push(p);}}
let shakeX=0,shakeY=0;
function shake(v){S.shake=Math.max(S.shake,v);}

// ---------- 武器行为 ----------
function fireBullet(){const lv=W.bullet.lv;if(!lv)return;
  const evo=W.bullet.evolved;const aw=W.bullet;
  const fused=!!aw.fused; // v42：万箭穿心
  const count=(evo?4:1)+Math.floor((lv-1)/2)+(P.atk>=3?1:0)+(aw.bonusN||0)+(fused?2:0);
  const targets=enemies.slice().sort((a,b)=>a.position.distanceToSquared(player.position)-b.position.distanceToSquared(player.position)).slice(0,count);
  const awDmg=(aw.awakened?1.4:1)*(aw.fuseDmg||1);
  for(const t of targets){const b=new THREE.Mesh(G.bullet,evo?bulletMatEvo:M.bullet);
    b.position.copy(player.position).setY(1.2);
    const dir=t.position.clone().sub(player.position).setY(0).normalize();
    if(!dir.lengthSq())dir.set(1,0,0);
    b.userData={v:dir.multiplyScalar(evo?26:20),dmg:(evo?16:9)*(1+lv*.35)*S.dmgMul*awDmg,
      life:1.5,pierce:(evo?2:0)+(aw.bonusPierce||0)+(fused?1:0),split:fused};
    if(aw.awakened){b.scale.setScalar(1.35);}
    if(fused){b.scale.setScalar(1.2);b.material=new THREE.MeshBasicMaterial({color:0xff4d9e});}
    const fbs=fxSprite('bullet',1.15,.9);if(fbs)b.add(fbs); // v67 AI 爱心弹
    scene.add(b);bullets.push(b);}
  if(bullets.length)sfx.shoot();}
function fireMeteor(){const lv=W.meteor.lv;if(!lv||!enemies.length)return;
  const evo=W.meteor.evolved;const aw=W.meteor;
  const n=(evo?4:1+Math.floor(lv/2))+(aw.bonusN||0);
  for(let i=0;i<n;i++){const t=enemies[Math.floor(Math.random()*enemies.length)];
    const pos=t?t.position.clone():player.position.clone().add(new THREE.Vector3((Math.random()-.5)*10,0,(Math.random()-.5)*10));
    mkTele(pos,2.2,.8,()=>{const m=new THREE.Mesh(G.meteor,M.meteor);m.position.copy(pos).setY(14);
      const rad=2.2*(1+(aw.radiusMul||0));
      const fms=fxSprite('meteor',3.0,.95);if(fms)m.add(fms); // v67 AI 火球
      m.userData={v:new THREE.Vector3(0,-26,0),dmg:30*(1+lv*.4)*S.dmgMul*(aw.awakened?1.35:1),r:rad,evo};scene.add(m);
      parts.push(m); // v67.1 修复：流星必须入 parts 才会被「流星下落」tick 驱动（历史上悬空 y=14 永不落地=哑弹+场景泄漏）
      m.userData.land=()=>{for(const e of enemies)if(e.position.distanceTo(pos)<rad+0.2){
        hitEnemy(e,m.userData.dmg);
        if(aw.burn)e.userData.burnT=Math.max(e.userData.burnT||0,3);}
        burst(pos,0xff4d6d,14,9);shake(.35);sfx.hit();
        const fml=fxFlat('impact',rad*1.8,.35,.9);if(fml){fml.position.copy(pos).setY(.07);scene.add(fml);parts.push(fml);} // v67 AI 落地爆环
        // v42 天罚流星：落地后残留燃烧地面
        if(aw.burnGround){
          const fm=new THREE.Mesh(new THREE.CircleGeometry(rad*.95,20),
            new THREE.MeshBasicMaterial({color:0xff8a00,transparent:true,opacity:.34}));
          fm.rotation.x=-Math.PI/2;fm.position.copy(pos).setY(.04);
          fm.userData={life:4.5,fireGround:true,dps:m.userData.dmg*.35,r:rad*.95};
          scene.add(fm);parts.push(fm);}
        ;};});}}
// 燃烧地面持续伤害（主循环调用；与迷雾共用 mists 数组语义但独立标记）
function tickFireGround(dt){
  for(let i=parts.length-1;i>=0;i--){const p=parts[i],u=p.userData;
    if(!u||!u.fireGround)continue;
    u.life-=dt;p.material.opacity=Math.max(0,.34*(u.life/4.5));
    p.rotation.z+=dt*.6;
    for(const e of enemies){if(e.userData.dead)continue;
      if(e.position.distanceTo(p.position)<u.r){hitEnemy(e,u.dps*dt,false);}}
    if(u.life<=0){scene.remove(p);parts.splice(i,1);}}}
function dropMist(){const lv=W.mist.lv;if(!lv)return;
  const aw=W.mist;const rad=1+(aw.radiusMul||0);
  const m=new THREE.Mesh(G.mist,M.mist);m.position.copy(player.position).setY(.06);
  m.userData={life:3.2,dps:(7+lv*4)*S.dmgMul*(aw.awakened?1.35:1),slow:W.mist.evolved,r:rad};
  if(W.mist.evolved||aw.awakened){m.material=new THREE.MeshBasicMaterial({color:aw.awakened?0xd4af37:0xffd60a,transparent:true,opacity:.22});}
  m.scale.setScalar(rad);
  const fmi=fxFlat('mist',2.6,.55);if(fmi){fmi.rotation.x=-Math.PI/2;fmi.position.y=.02;m.add(fmi);} // v67 AI 雾盘（随迷雾一起消散）
  scene.add(m);mists.push(m);}
function fireNova(){const lv=W.nova.lv;if(!lv)return;
  const evo=W.nova.evolved;const aw=W.nova;
  const r=((evo?7:4.5)+lv*.4)*(1+(aw.radiusMul||0));
  const ring=new THREE.Mesh(new THREE.RingGeometry(.3,1,32),
    new THREE.MeshBasicMaterial({color:aw.awakened?0xd4af37:evo?0xffd60a:0x4cc9f0,transparent:true,opacity:.7,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.copy(player.position).setY(.3);scene.add(ring);
  ring.userData={life:.4,grow:r};parts.push(ring);
  const fnv=fxFlat('nova',r*1.1,.42,.9,r*.9,.8);if(fnv){fnv.position.copy(player.position).setY(.32);scene.add(fnv);parts.push(fnv);} // v67 AI 冲击波
  for(const e of enemies)if(e.position.distanceTo(player.position)<r){
    hitEnemy(e,20*(1+lv*.4)*S.dmgMul*(aw.awakened?1.4:1));
    if(aw.stun&&e.userData.type!=='boss')e.userData.slowT=Math.max(e.userData.slowT||0,1.6);
    const kb=e.position.clone().sub(player.position).setY(0).normalize().multiplyScalar(e.userData.type==='boss'?0:2.4);
    e.position.add(kb);}
  sfx.hit();}
// v38 桃花浪潮：向面朝方向推出行进浪环，沿途击退伤害（每浪对同一目标只结算一次）
// ========== v42 四把新武器 ==========
// 🌪️ 舔狗冲锋：朝最近敌人反复突进，命中回血（越打越勇的近战曲线）
function fireRush(){const lv=W.rush.lv;if(!lv)return;
  const aw=W.rush,evo=W.rush.evolved;
  const list=enemies.filter(e=>!e.userData.dead)
    .sort((a,b)=>a.position.distanceToSquared(player.position)-b.position.distanceToSquared(player.position));
  if(!list.length)return;
  const n=(evo?2:1)+(aw.bonusN||0);
  const tgt=list[0];
  const dir=tgt.position.clone().sub(player.position).setY(0).normalize();
  const dmg=(22+lv*9)*S.dmgMul*(evo?1.35:1)*(aw.dmgMul||1);
  // 冲锋轨迹：一串残影 + 沿途判定
  const steps=6;
  for(let i=1;i<=steps;i++){
    const p=player.position.clone().addScaledVector(dir,i*1.15).setY(.9);
    const hitR=1.9;
    for(const e of enemies){if(e.userData.dead)continue;
      if(Math.hypot(e.position.x-p.x,e.position.z-p.z)<hitR){
        if(!e.userData._rushHit||e.userData._rushHit<performance.now()-260){
          hitEnemy(e,dmg);e.userData._rushHit=performance.now();
          if(evo&&aw.heal!==false)S.hp=Math.min(S.maxHp,S.hp+2);
        }
      }
    }
    const m=new THREE.Mesh(new THREE.CircleGeometry(.55,10),
      new THREE.MeshBasicMaterial({color:aw.awakened?0xd4af37:(evo?0xffd60a:0xff8fa3),transparent:true,opacity:.4}));
    m.rotation.x=-Math.PI/2;m.position.copy(p);
    m.userData={fade:true,life:.35};scene.add(m);parts.push(m);
  }
  // 玩家本体位移（不超过终点）
  const travel=Math.min(7,steps*1.15);
  player.position.addScaledVector(dir,travel);player.position.y=0;
  // 冲锋回血（未进化也有一点）
  S.hp=Math.min(S.maxHp,S.hp+(evo?3:1.5));
  for(let k=1;k<n;k++){ // 进化后追加第二、三击
    const t2=list[Math.min(k*2,list.length-1)];
    if(t2&&!t2.userData.dead)setTimeout(()=>{try{hitEnemy(t2,dmg*.85);}catch(e){}},180*k);
  }
  sfx.hit();}
// 💔 情感暴力：原地蓄力后环形炸开（大范围清场）
function fireBurst(){const lv=W.burst.lv;if(!lv)return;
  const aw=W.burst,evo=W.burst.evolved;
  const R=(4.5+lv*1.1)*(1+(aw.radiusMul||0))*(evo?1.4:1);
  const dmg=(34+lv*13)*S.dmgMul*(evo?1.4:1)*(aw.dmgMul||1);
  const rings=evo?2:1;
  for(let r=0;r<rings;r++){
    const delay=r*170;
    setTimeout(()=>{
      const m=new THREE.Mesh(new THREE.RingGeometry(R*.55,R,32),
        new THREE.MeshBasicMaterial({color:aw.awakened?0xd4af37:(evo?0xff4d6d:0xff8fa3),
          transparent:true,opacity:.7,side:THREE.DoubleSide}));
      m.rotation.x=-Math.PI/2;m.position.copy(player.position).setY(.35);
      m.userData={fade:true,life:.45};scene.add(m);parts.push(m);
      const fbz=fxFlat('burst',R*1.2,.5,.9,R*.9,.6);if(fbz){fbz.position.copy(player.position).setY(.36);scene.add(fbz);parts.push(fbz);} // v67 AI 爆发
      burst(player.position.clone().setY(.6),aw.awakened?0xd4af37:0xff4d6d,18,10);
      for(const e of enemies){if(e.userData.dead)continue;
        if(e.position.distanceTo(player.position)<R){
          hitEnemy(e,dmg);
          // 推开
          const d=e.position.clone().sub(player.position).setY(0).normalize();
          e.position.addScaledVector(d,aw.stun?2.4:1.4);
          if(aw.stun)e.userData.stunT=.5;
        }}
      shake(.35);sfx.hit();
    },delay);
  }}
// 🎭 双面人格：召唤一个影子分身，跟随玩家并同步发射普攻
const twinShadows=[];
function fireTwin(){
  const lv=W.twin.lv;if(!lv)return;
  const aw=W.twin,evo=W.twin.evolved;
  const want=1+(aw.bonusN||0)+(evo?1:0);
  // v42 绿茵迷城：站在自己的迷雾里，分身数量翻倍
  let inMist=false;
  if(W.twin.fused)for(const m of mists){
    if(player.position.distanceTo(m.position)<2.4*(m.userData.r||1)){inMist=true;break;}}
  const want2=inMist?want*2:want;
  while(twinShadows.length>want2){const o=twinShadows.pop();scene.remove(o);}
  while(twinShadows.length<want2){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.32,.38,1.2,8),
      new THREE.MeshBasicMaterial({color:0xb5179e,transparent:true,opacity:.42}));
    body.position.y=.6;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.26,8,8),
      new THREE.MeshBasicMaterial({color:0xd17fd0,transparent:true,opacity:.42}));
    head.position.y=1.45;g.add(head);
    g.userData={life:6+lv*.5};scene.add(g);twinShadows.push(g);}
  const dmg=(14+lv*6)*S.dmgMul*(evo?1.3:1);
  // 每个分身朝最近敌人射一发
  for(const g of twinShadows){
    const list=enemies.filter(e=>!e.userData.dead)
      .sort((a,b)=>a.position.distanceToSquared(g.position)-b.position.distanceToSquared(g.position));
    if(!list.length)continue;
    const t=list[0];
    const dir=t.position.clone().sub(g.position).setY(0).normalize();
    const b=new THREE.Mesh(G.bullet,new THREE.MeshBasicMaterial({color:aw.awakened?0xd4af37:0xc77dff}));
    b.position.copy(g.position).setY(1.2);
    b.userData={v:dir.multiplyScalar(15),dmg:dmg,life:1.4,pierce:aw.bonusPierce||0};
    scene.add(b);bullets.push(b);
  }}
// ☠️ 拉黑诅咒：给敌人挂持续掉血，杀死时传染给周围
function fireCurse(){const lv=W.curse.lv;if(!lv||!enemies.length)return;
  const aw=W.curse,evo=W.curse.evolved;
  const n=(2+Math.floor(lv*.8))+(aw.bonusN||0);
  const list=enemies.filter(e=>!e.userData.dead&&!e.userData.curse)
    .sort((a,b)=>a.position.distanceToSquared(player.position)-b.position.distanceToSquared(player.position))
    .slice(0,n);
  const dps=(5+lv*3.4)*S.dmgMul*(evo?1.5:1)*(aw.dmgMul||1);
  for(const e of list){
    e.userData.curse={dps:dps,t:5+lv*.6,spread:evo||aw.spread===true};
    // 诅咒标记：头顶暗红环
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.55,.06,5,14),
      new THREE.MeshBasicMaterial({color:aw.awakened?0xd4af37:0x8b1a3a,transparent:true,opacity:.85}));
    ring.rotation.x=Math.PI/2;ring.position.y=2.1;e.add(ring);
    const fcs=fxSprite('curse',1.5,.8);if(fcs)ring.add(fcs); // v67 AI 诅咒符印
    e.userData.curseRing=ring;
  }
  if(list.length)sfx.hit();}
// 诅咒持续伤害（主循环每帧调用）
function tickCurse(dt){
  for(const e of enemies){
    const c=e.userData.curse;if(!c)continue;
    c.t-=dt;
    e.userData._curseAcc=(e.userData._curseAcc||0)+c.dps*dt;
    if(e.userData._curseAcc>=1){const d=Math.floor(e.userData._curseAcc);e.userData._curseAcc-=d;
      if(!e.userData.dead)hitEnemy(e,d,false);}
    if(c.t<=0){e.userData.curse=null;
      if(e.userData.curseRing){e.remove(e.userData.curseRing);e.userData.curseRing=null;}}
  }}

// 分身跟随与消散（v42）
function updateTwinShadows(dt){
  if(!twinShadows.length)return;
  for(let i=twinShadows.length-1;i>=0;i--){
    const g=twinShadows[i];g.userData.life-=dt;
    // 围成一圈跟随玩家
    const a=performance.now()/1600+i*(Math.PI*2/twinShadows.length);
    const tx=player.position.x+Math.cos(a)*2.2, tz=player.position.z+Math.sin(a)*2.2;
    g.position.x+=(tx-g.position.x)*Math.min(1,dt*6);
    g.position.z+=(tz-g.position.z)*Math.min(1,dt*6);
    g.position.y=0;
    const left=g.userData.life/6;
    g.children.forEach(m=>{if(m.material)m.material.opacity=.42*Math.max(.25,Math.min(1,left));});
    if(g.userData.life<=0){scene.remove(g);twinShadows.splice(i,1);}
  }}
function fireWave(){const lv=W.wave.lv;if(!lv)return;
  const aw=W.wave,evo=W.wave.evolved;
  const dir=player.rotation.y;
  const n=(evo?2:1)+(aw.bonusN||0);
  for(let i=0;i<n;i++){
    const dir2=dir+(i-(n-1)/2)*.55;
    const col=aw.awakened?0xd4af37:(evo?0xffd60a:0xff8fa3);
    const m=new THREE.Mesh(new THREE.RingGeometry(.5,1.6,26),
      new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.75,side:THREE.DoubleSide}));
    m.rotation.x=-Math.PI/2;m.position.copy(player.position).setY(.5);
    const spd=11+lv*1.3;
    m.userData={wave:true,v:new THREE.Vector3(Math.sin(dir2)*spd,0,Math.cos(dir2)*spd),
      dmg:(16+lv*7)*S.dmgMul*(aw.awakened?1.3:1)*(aw.dmgMul||1),
      life:1.5,r:(2.1+lv*.18)*(1+(aw.radiusMul||0)),hit:new Set(),stun:!!aw.stun};
    const fwv=fxFlat('wave',3.4,.9,0,0,.9);if(fwv){fwv.rotation.x=0;fwv.position.y=0;m.add(fwv);} // v67 AI 花瓣波纹（父级已平铺）
    scene.add(m);parts.push(m);}
  sfx.hit();}
// 情网连锁：闪电在情敌间跳跃
const zapMat=new THREE.LineBasicMaterial({color:0x4cc9f0,transparent:true,opacity:.9});
const zapMatEvo=new THREE.LineBasicMaterial({color:0xffd60a,transparent:true,opacity:1});
function fireChain(){const lv=W.chain.lv;if(!lv||!enemies.length)return;
  const evo=W.chain.evolved;const aw=W.chain;
  const jumps=(2+lv)+(evo?4:0)+(aw.bonusN||0);
  const mat=(evo||aw.awakened)?(aw.awakened?new THREE.LineBasicMaterial({color:0xd4af37,transparent:true,opacity:1}):zapMatEvo):zapMat;const hitSet=new Set();
  let cur=enemies.slice().sort((a,b)=>a.position.distanceToSquared(player.position)-b.position.distanceToSquared(player.position))[0];
  let prevPos=player.position.clone().setY(1.4);const dmg=26*(1+lv*.35)*S.dmgMul*(aw.awakened?1.35:1);
  const jumpR=aw.bonusN?9:7;
  for(let k=0;k<jumps&&cur;k++){
    // 电弧线
    const geo=new THREE.BufferGeometry().setFromPoints([prevPos,cur.position.clone().setY(1.3)]);
    const line=new THREE.Line(geo,mat.clone());line.userData={zap:true,life:.22};scene.add(line);parts.push(line);
    hitEnemy(cur,dmg);hitSet.add(cur);prevPos=cur.position.clone().setY(1.3);
    // 跳向下一个
    let nxt=null,nd=jumpR;
    for(const e of enemies){if(hitSet.has(e)||e.userData.dead)continue;
      const d=e.position.distanceTo(cur.position);if(d<nd){nd=d;nxt=e;}}
    cur=nxt;}
  sfx.hit();}
// ⛓️ 索命钩锁：把远处情敌拽到身边（进化：双向钩锁+眩晕）
const hookMatBase=new THREE.LineBasicMaterial({color:0xff8fa3,transparent:true,opacity:.95});
const hookMatEvo=new THREE.LineBasicMaterial({color:0xffd60a,transparent:true,opacity:1});
function fireHook(){const lv=W.hook.lv;if(!lv||!enemies.length)return;
  const evo=W.hook.evolved;const aw=W.hook;const n=(evo?2:1)+(aw.bonusN||0);
  const list=enemies.slice().filter(e=>e.userData.type!=='boss').sort((a,b)=>
    b.position.distanceToSquared(player.position)-a.position.distanceToSquared(player.position)).slice(0,n);
  for(const t of list){
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      player.position.clone().setY(1.4),t.position.clone().setY(1.1)]),
      ((evo||aw.awakened)?(aw.awakened?new THREE.LineBasicMaterial({color:0xd4af37,transparent:true,opacity:1}):hookMatEvo):hookMatBase).clone());
    line.userData={zap:true,life:.35};scene.add(line);parts.push(line);
    const dir=player.position.clone().sub(t.position).setY(0).normalize();
    t.position.addScaledVector(dir,(aw.heavy?3.2:2.2)); // 拽近（朝玩家方向移动）
    hitEnemy(t,(14+lv*5)*S.dmgMul*(aw.awakened?1.4:1));
    if(evo||aw.awakened){t.userData.slowT=aw.heavy?2:1.2;burst(t.position.clone().setY(1),aw.awakened?0xd4af37:0xffd60a,8,5);}}
  if(list.length)sfx.pick();}
// 👥 虚情分身：召唤幻影吸引敌人（进化：分身爆炸+反击）
const clones=[];let cloneT=0;
function summonClone(){const lv=W.clone.lv;if(!lv)return;
  const evo=W.clone.evolved;const aw=W.clone;
  const extra=aw.bonusN||0;
  for(let ci=0;ci<1+extra;ci++){const c=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.3,.42,1.6,8),
      new THREE.MeshBasicMaterial({color:aw.awakened?0xd4af37:evo?0xffd60a:0xb5179e,transparent:true,opacity:.55}));
    body.position.y=.8;c.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.24,8,6),
      new THREE.MeshBasicMaterial({color:aw.awakened?0xd4af37:evo?0xffd60a:0xb5179e,transparent:true,opacity:.55}));
    head.position.y=1.7;c.add(head);
    const a=Math.random()*6.283;c.position.copy(player.position).add(new THREE.Vector3(Math.cos(a)*3,0,Math.sin(a)*3));
    c.userData={life:(evo?6:4.5)+(aw.awakened?2:0),evo,awakened:aw.awakened,taunt:3.2};scene.add(c);clones.push(c);}
  cloneT=0;
  burst(player.position.clone().setY(1),aw.awakened?0xd4af37:evo?0xffd60a:0xb5179e,10,6);}
function updateClones(dt){for(let i=clones.length-1;i>=0;i--){const c=clones[i],u=c.userData;
  u.life-=dt;u.taunt-=dt;
  c.children.forEach(m=>m.material.opacity=.4+.2*Math.abs(Math.sin(performance.now()/200+i)));
  c.position.y=Math.abs(Math.sin(performance.now()/300+i))*.1;
  // 吸引敌人
  if(u.taunt>0)for(const e of enemies){const d=c.position.clone().sub(e.position).setY(0);
    if(d.length()<7&&e.userData.type!=='boss')e.position.addScaledVector(d.normalize(),e.userData.spd*.6*dt);}
  if(u.life<=0){
    if(u.evo||u.awakened){ // 进化/觉醒：消散时爆发
      const boomMul=W.clone.boomMul||1;
      for(const e of enemies)if(e.position.distanceTo(c.position)<3.2)hitEnemy(e,40*S.dmgMul*boomMul);
      burst(c.position.clone().setY(1),u.awakened?0xd4af37:0xffd60a,22,10);shake(.3);}
    scene.remove(c);clones.splice(i,1);}}}
function castUlt(){if(S.scum<100||!S.alive)return;S.scum=0;S.ultT=4;ultCount++;
  tip('💥 终极·修罗场！全场争风吃醋！');sfx.ult();shake(.6);
  burst(player.position,0xf72585,36,12);
  for(const e of enemies){e.userData.charmed=S.ultT;}
  showUltBtn(false);}
function showUltBtn(on){document.getElementById('scumBar').style.boxShadow=on?'0 0 12px #f72585':'none';}
scumBarClick();
function scumBarClick(){document.getElementById('scumBar').parentElement.onclick=()=>castUlt();}

// ---------- 连杀系统 ----------
let comboN=0,comboT=0,comboBest=0;
const COMBO_RANKS=[
 {n:5,t:'🔥 连杀 ×5 · 手感火热'},
 {n:10,t:'⚡ 连杀 ×10 · 势不可挡'},
 {n:20,t:'🌟 连杀 ×20 · 修罗附体'},
 {n:35,t:'💥 连杀 ×35 · 天下无敌'},
 {n:50,t:'👑 连杀 ×50 · 渣男之神'},
];
function addCombo(){comboN++;comboT=3;
  if(comboN>comboBest)comboBest=comboN;
  const rk=COMBO_RANKS.find(r=>r.n===comboN);
  if(rk){tip(rk.t);sfx.milestone();shake(.25);burst(player.position.clone().setY(1.5),0xffd60a,14,8);
    S.scum=Math.min(100,S.scum+4);
    if(rk.n>=20)addAwakenStone(1,'连杀里程碑');}
  else sfx.combo(comboN); // 音高随连杀递增
  updateComboUI();}
function updateComboUI(){
  const el=document.getElementById('comboBox');
  if(!el)return;
  if(comboN>=3){el.style.display='block';
    el.querySelector('.cn').textContent=comboN+' 连杀';
    // 连杀越高颜色越热
    const heat=Math.min(1,comboN/50);
    el.style.color=`hsl(${30-heat*30},${70+heat*30}%,${60+heat*10}%)`;
    el.style.transform=`scale(${1+Math.min(.4,comboN*.008)})`;
  }else el.style.display='none';}
function updateCombo(dt){if(comboT>0){comboT-=dt;if(comboT<=0){comboN=0;updateComboUI();}}}
// 连击评级（v27）：按最高连杀 + 存活 + 击杀密度综合评级（v28：分数进最佳记录与排行榜）
function comboGrade(){
  const b=comboBest||0;
  const density=b>0?S.kills/Math.max(1,S.time)*10:0;
  const score=b*2+S.kills*0.6+density*1.5+(S.time>=300?20:0);
  if(score>=260)return {g:'S',n:'S · 修罗无我',c:'#ff4d6d',d:'连杀如呼吸，情敌如草芥',score:score};
  if(score>=170)return {g:'A',n:'A · 睥睨众生',c:'#ffd60a',d:'手法老练，进退自如',score:score};
  if(score>=95) return {g:'B',n:'B · 初露锋芒',c:'#4cc9f0',d:'套路渐成，尚需打磨',score:score};
  if(score>=45) return {g:'C',n:'C · 泛泛之辈',c:'#9ad0ff',d:'还在摸索渣男之道',score:score};
  return {g:'D',n:'D · 情场菜鸟',c:'#8a7aa8',d:'多练几局再来吧',score:score};}

function killEnemy(e,idx){const u=e.userData;u.dead=true;
    if(u.ghost){onGhostDefeated(e,idx);return;} // v33：影子被击溃 → 挑战成功
    burst(e.position,u.boss?0xff006e:(u.elite?0xffd60a:0xff4d9e),u.elite||u.boss?26:10);
    sfx.kill();S.kills++;if(u.elite)S.eliteKill++;
    // v32：心币（常规模式房间商店通用货币）
    if(gameMode==='normal'&&started)runCoins+=Math.round((u.boss?20:(u.elite?3:1))*(D.coinMul||1));
    if(!u.boss)addCombo();
    // v35：词缀死亡特效（湮灭自爆 / 分裂小怪）
    if(u.affix==='boom'){const tp=e.position.clone();
      burst(tp,0xff8fa3,30,13);burst(tp.clone().setY(.3),0xffd60a,16,9);shake(.45);stopFrame(.05);
      if(S.alive&&player.position.distanceTo(tp)<3.4)hurtPlayer(16);}
    else if(u.affix==='split'){for(let k=0;k<2;k++){const m=mkEnemy('swarm');
      m.userData.hp=Math.ceil(m.userData.hp*.5);m.userData.maxHp=m.userData.hp;m.userData.dmg*=.6;
      m.position.set(e.position.x+(Math.random()-.5)*2,0,e.position.z+(Math.random()-.5)*2);}}
    else if(u.affix==='twinpair'){
      // v43 双生：真正击杀一只即算击破（血量同步由 hitEnemy 处理）
      SAVE.twinKill=(SAVE.twinKill||0)+1;writeSave();
    }
    const n=u.boss?26:(u.elite?8:2);
    for(let i=0;i<n;i++)mkOrb(e.position);
    if(u.boss){bossAlive=false;bossKills++;stopBossBgm();
      const bid=u.bossId||'captain';
      SAVE.bosses[bid]=(SAVE.bosses[bid]||0)+1;writeSave();
      // v39 天气 Boss 线：击杀四系天气专属 Boss → 累积对应气候印记
      {const sealMap={thunder:'storm',assassin:'fog',solar:'solar',rain:'rain'};
       const seal=sealMap[bid];
       if(seal){SAVE.climateSeals=SAVE.climateSeals||{storm:0,fog:0,solar:0,rain:0};
         SAVE.climateSeals[seal]=(SAVE.climateSeals[seal]||0)+1;SAVE.climateKills=(SAVE.climateKills||0)+1;writeSave();
         const SEALN={storm:'⚡ 雷印',fog:'🌫️ 雾印',solar:'☀️ 日印',rain:'🌧️ 雨印'};
         const got=climateSealCount(),all=climateAllSeals();
         setTimeout(()=>{tip(`${SEALN[seal]} 已刻入命盘（${got}/4）${all?' · 四印齐聚，四时之主可挑战！':''}`);},1200);
         if(all&&!SAVE.climateBest)setTimeout(()=>tip('🕛 四时之主已苏醒——下一局可用「气候试炼」挑战'),2600);}}
      const bd=BOSSES_DEF.find(b=>b.id===bid)||{n:'军团长',col:0xff006e};
      // v44 第七章：婚宴三连战推进 + 三关全通成就
      if(WEDDING_ORDER.includes(bid)&&gameMode!=='endless'&&gameMode!=='abyss'){
        if(weddingKills===0)setTimeout(()=>meetOnce('chain'),1800); // v48：进入三连战第一次时解释
        weddingKills=Math.min(WEDDING_ORDER.length,weddingKills+1);
        SAVE.weddingBeaten=Math.max(SAVE.weddingBeaten||0,weddingKills);writeSave();
        if(weddingKills<WEDDING_ORDER.length){
          const nxt=BOSSES_DEF.find(x=>x.id===WEDDING_ORDER[weddingKills]);
          setTimeout(()=>tip(`👰 第 ${weddingKills} 关通过！下一关：${nxt?nxt.n:'?'}`),1400);
        }else{
          setTimeout(()=>{tip('🎊 婚宴三关全通——新郎终于逃出来了！');flashOverlay('rgba(255,214,10,.3)',1.0);},1400);
        }
      }
      // 无尽模式：波次计数 + 奖励补血
      if(gameMode==='endless'){
        endlessBossKills++;waveNum=endlessBossKills+1;
        S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.3);
        tip(`🏆 第 ${endlessBossKills} 波 · ${bd.n} 陨落！难度提升 · 生命回复 30%`);shake(.5);
        endlessBossT=endlessGap();
      }else if(gameMode==='abyss'){
        waveNum=abyssBossKills;
        S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.25);
        SAVE.abyssBest=Math.max(SAVE.abyssBest||0,abyssBossKills);writeSave();
        tip(`🏆 深渊之主第 ${abyssBossKills} 度陨落！虚空震颤 · 生命回复 25%`);shake(.7);
      }else if(gameMode==='climate'){
        const cw=(SAVE.bosses.chronos||0);
        S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.3);
        SAVE.climateBest=Math.max(SAVE.climateBest||0,cw);writeSave();
        tip(`🏆 四时之主第 ${cw} 度陨落！四季为你让路 · 生命回复 30%`);shake(.7);
        for(const s of CLIMATE_SEALS){if((SAVE.climateSeals[s.k]||0)===0){SAVE.climateSeals[s.k]=1;}}
        writeSave();setTimeout(()=>{if(S.alive)tip('🌀 击败四时之主，四印自动补齐');},2000);
      }else{tip(`🏆 ${bd.n} 陨落！图鉴已更新`);shake(.5);}
      slowMotion(.25,1.6);zoomTo(7.5,1.6);
      flashOverlay(bid==='abyss'?'rgba(255,46,46,.4)':bid==='thunder'?'rgba(138,212,255,.4)':bid==='mother'?'rgba(255,214,10,.35)':bid==='mirror'?'rgba(76,201,240,.35)':'rgba(255,214,10,.35)',.6);
      stopFrame(.16);
      // Boss 击杀回放：开始连续抓帧录制（主循环驱动）
      startReplayRecord(e);
      // Boss 专属掉落（本局 BOSS 击杀即掉落）
      rollBossDrop(bid);
      // 觉醒石：Boss 必掉 1 颗，无尽/深渊模式额外概率 +1
      addAwakenStone(1,'击败首领');
      if(gameMode==='endless'&&Math.random()<Math.min(.6,endlessBossKills*.12))addAwakenStone(1,'无尽波次奖励');
      if(gameMode==='abyss'&&Math.random()<Math.min(.8,abyssBossKills*.18))addAwakenStone(1,'深渊之主馈赠');}
    else if(u.elite&&Math.random()<.18){ // 精英情敌 18% 掉石
      addAwakenStone(1,'精英情敌');}
    scene.remove(e);enemies.splice(idx,1);}
function hitEnemy(e,dmg,canCrit=true){const u=e.userData;
  let d=dmg,crit=false;
  if(canCrit&&Math.random()<S.critC){d*=S.critM;crit=true;}
  d*=(D.dmgMul||1); // 每日挑战：玻璃大炮等
  if(u.boss)d*=(S.bossDmgMul||1); // 周赛徽记：对 Boss 增伤
  // v35：护盾词缀先吸收伤害
  if(u.shield>0){const ab=Math.min(u.shield,d);u.shield-=ab;d-=ab;
    if(u.shield<=0){u.shield=0;burst(e.position.clone().setY(1.5),0x8ad4ff,16,9);}}
  if(d>0)u.hp-=d;u.hitT=.1;u.mats.forEach(m=>m.emissiveIntensity=Math.max(m.emissiveIntensity||0,1.6));sfx.hit();
  // v43 双生房：真正共享血量（等额扣血）。
  // 规则：任一方血量归零时，两只一起回满 40%，且当次不判定死亡——
  // 逼玩家用爆发把「两只的总血量」一口气打空，而不是慢慢磨。
  if(d>0&&u.twinOther&&!u.twinSync&&!u.dead&&!u.twinOther.userData.dead){
    const o=u.twinOther.userData;
    u.twinSync=true;
    o.hp=Math.max(0,o.hp-d);
    if(u.hp<=0||o.hp<=0){
      u.hp=u.maxHp*.4;o.hp=o.maxHp*.4;
      burst(e.position.clone().setY(1.4),0xc77dff,22,10);
      burst(u.twinOther.position.clone().setY(1.4),0xc77dff,22,10);
      shake(.35);tip('👯 孪生共鸣！两只一起回血，要一口气打空');
      setTimeout(()=>meetOnce('twin'),1200);
      if(crit)stopFrame(.055);
      dmgNum(e.position.clone().setY(1.6),d,crit);
      u.twinSync=false;
      return; // 本次不进入斩杀判定
    }
    u.twinSync=false;
  }
  // 暴击顿帧（打击感）
  if(crit){stopFrame(.055);shake(.16);}
  dmgNum(e.position.clone().setY(1.6),d,crit);
  // v47 杀伐套（满）：暴击溅射 —— 对 3 单位内其它敌人造成 40% 伤害
  // 注意：溅射调用 hitEnemy(x, d*.4, false) 关掉暴击，天然防递归
  if(crit&&S.setWarSplash&&!u.splashSrc&&d>0){
    const c=e.position.clone();
    for(const o of enemies){
      if(o===e||o.userData.dead)continue;
      if(o.position.distanceTo(c)<=3.0){
        hitEnemy(o,d*.4,false);
        dmgNum(o.position.clone().setY(1.6),d*.4,false);
      }
    }
    if(!S._warSplashFx||S.time-S._warSplashFx>.25){
      S._warSplashFx=S.time;
      burst(c.clone().setY(1.3),0xff4d6d,10,7);
    }
  }
  if(u.hp<=0&&!u.dead)killEnemy(e,enemies.indexOf(e));}

// ---------- 碎片 ----------
function mkOrb(pos){const o=new THREE.Mesh(G.orb,M.orb);
  o.scale.setScalar(.42);
  o.position.copy(pos).setY(.5).add(new THREE.Vector3((Math.random()-.5)*1.4,0,(Math.random()-.5)*1.4));
  o.userData.spin=Math.random()*7;scene.add(o);orbs.push(o);}

// ---------- 升级三选一 ----------
const SKILLS=[
 {ic:'💘',n:'情话弹幕',type:'w',key:'bullet',d:'自动锁定情敌发射弹幕（主武器）',max:5,
   up:()=>{W.bullet.lv++}},
 {ic:'🌹',n:'劈腿旋风',type:'w',key:'orbit',d:'玫瑰环绕自身，持续切割+吸血',max:5,up:()=>{W.orbit.lv++;syncOrbits();}},
 {ic:'☄️',n:'心碎流星',type:'w',key:'meteor',d:'天降流星轰炸情敌',max:5,up:()=>W.meteor.lv++},
 {ic:'🍵',n:'绿茶迷雾',type:'w',key:'mist',d:'移动留下毒雾区域',max:5,up:()=>W.mist.lv++},
 {ic:'💙',n:'魅力冲击',type:'w',key:'nova',d:'周期性冲击波击退周围敌人',max:5,up:()=>W.nova.lv++},
 {ic:'🕸️',n:'情网连锁',type:'w',key:'chain',d:'情网闪电在情敌间连锁跳跃',max:5,up:()=>W.chain.lv++},
 {ic:'⛓️',n:'索命钩锁',type:'w',key:'hook',d:'把远处情敌一把拽到身边近距离解决',max:5,up:()=>W.hook.lv++},
 {ic:'👥',n:'虚情分身',type:'w',key:'clone',d:'留下幻影吸引火力，替你挨打',max:5,up:()=>W.clone.lv++},
 {ic:'🌊',n:'桃花浪潮',type:'w',key:'wave',d:'向面朝方向推出粉色浪潮，击退并伤害沿途情敌',max:5,up:()=>{W.wave.lv++}},
 // ---- v42 新武器 ----
 {ic:'🌪️',n:'舔狗冲锋',type:'w',key:'rush',d:'朝最近情敌反复突进，命中回血——舔到最后应有尽有',max:5,up:()=>{W.rush.lv++}},
 {ic:'💔',n:'情感暴力',type:'w',key:'burst',d:'原地蓄力后环形炸开，大范围清场并击退',max:5,up:()=>{W.burst.lv++}},
 {ic:'🎭',n:'双面人格',type:'w',key:'twin',d:'召唤影子分身环绕自身，同步发射普攻',max:5,up:()=>{W.twin.lv++}},
 {ic:'☠️',n:'拉黑诅咒',type:'w',key:'curse',d:'给情敌挂持续掉血标记，死亡时可传染',max:5,up:()=>{W.curse.lv++}},
 {ic:'⚔️',n:'坏男人之力',type:'p',key:'atk',d:'伤害 +12%',max:4,up:()=>{P.atk++;S.dmgMul*=1.12;}},
 {ic:'⏱️',n:'时间管理',type:'p',key:'cdr',d:'技能冷却 -8%',max:4,up:()=>P.cdr++},
 {ic:'👟',n:'跑得快(跑路必备)',type:'p',key:'spd',d:'移速 +9%',max:4,up:()=>{P.spd++;S.spd*=1.09;}},
 {ic:'❤️',n:'海王体质',type:'p',key:'hp',d:'生命上限 +25 并回复',max:4,up:()=>{P.hp++;S.maxHp+=25;S.hp=Math.min(S.maxHp,S.hp+25);}},
 {ic:'🧲',n:'舔狗磁铁',type:'p',key:'pick',d:'拾取范围 +45%',max:3,up:()=>{P.pick++;S.pickR*=1.45;}},
 {ic:'🎯',n:'海王直觉',type:'p',key:'crit',d:'暴击率 +8%',max:3,up:()=>S.critC+=.08},
];
const EVOS=[
 {_evo:true,ic:'🌹',n:'⚔️ 进化：千朵玫瑰葬礼',d:'劈腿旋风满级+魅力冲击：玫瑰翻倍、金色强化，吸血翻倍',need:()=>W.orbit.lv>=5&&W.nova.lv>=1&&W.nova.lv>=5,do:()=>{W.orbit.evolved=true;W.nova.evolved=true;syncOrbits();}},
 {_evo:true,ic:'💘',n:'⚔️ 进化：海王弹幕·万箭齐发',d:'情话弹幕满级+舔狗磁铁：4连发穿透弹',need:()=>W.bullet.lv>=5&&P.pick>=2,do:()=>W.bullet.evolved=true},
 {_evo:true,ic:'🍵',n:'⚔️ 进化：茶艺大师领域',d:'绿茶迷雾满级+时间管理：金色迷雾大幅减速敌人',need:()=>W.mist.lv>=5&&P.cdr>=2,do:()=>W.mist.evolved=true},
 {_evo:true,ic:'☄️',n:'⚔️ 进化：心碎陨石雨',d:'心碎流星满级+坏男人之力：一次4颗流星',need:()=>W.meteor.lv>=5&&P.atk>=2,do:()=>W.meteor.evolved=true},
 {_evo:true,ic:'🕸️',n:'⚔️ 进化：天罗情网',d:'情网连锁满级+海王直觉：跳跃翻倍、金色情网',need:()=>W.chain.lv>=5&&P.crit>=1,do:()=>W.chain.evolved=true},
 {_evo:true,ic:'⛓️',n:'⚔️ 进化：双生夺魂钩',d:'索命钩锁满级+跑得快：同时钩 2 人并击晕减速',need:()=>W.hook.lv>=5&&P.spd>=2,do:()=>W.hook.evolved=true},
 {_evo:true,ic:'👥',n:'⚔️ 进化：万影迷魂阵',d:'虚情分身满级+海王体质：分身延长且消散时爆炸',need:()=>W.clone.lv>=5&&P.hp>=1,do:()=>W.clone.evolved=true},
 {_evo:true,ic:'🌊',n:'⚔️ 进化：连天浪涌',d:'桃花浪潮满级+海王体质：双浪并发、范围更广',need:()=>W.wave.lv>=5&&P.hp>=2,do:()=>W.wave.evolved=true},
 {_evo:true,ic:'🌪️',n:'⚔️ 进化：疯狗模式',d:'舔狗冲锋满级+跑得快：双击突进、命中回血翻倍',need:()=>W.rush.lv>=5&&P.spd>=2,do:()=>W.rush.evolved=true},
 {_evo:true,ic:'💔',n:'⚔️ 进化：情绪核爆',d:'情感暴力满级+坏男人之力：双重冲击波',need:()=>W.burst.lv>=5&&P.atk>=2,do:()=>W.burst.evolved=true},
 {_evo:true,ic:'🎭',n:'⚔️ 进化：人格分裂',d:'双面人格满级+时间管理：分身 +1，射击更频',need:()=>W.twin.lv>=5&&P.cdr>=2,do:()=>W.twin.evolved=true},
 {_evo:true,ic:'☠️',n:'⚔️ 进化：社会性死亡',d:'拉黑诅咒满级+海王直觉：诅咒可传染给周围',need:()=>W.curse.lv>=5&&P.crit>=1,do:()=>W.curse.evolved=true},
];
// ---------- v42 合体进化（Fusion）：两把满级武器 → 一把超级武器 ----------
// 设计：单件进化（EVOS）是「一把武器 + 一个被动」的纵向成长；
// 合体（FUSIONS）是「两把武器」的横向融合，产出质变级效果。
// 门槛放宽为「双方 ≥4 级」，避免 20 分钟一局根本摸不到。
const FUSIONS=[
 {id:'rainbow',ic:'🌈',n:'🌈 合体：万箭穿心',d:'情话弹幕 + 桃花浪潮 → 全屏扇形弹幕，命中分裂',
  a:'bullet',b:'wave',col:0xff4d9e,
  do:()=>{W.bullet.fused=true;W.wave.fused=true;W.bullet.fuseDmg=1.6;W.wave.fuseSplit=true;}},
 {id:'shura',ic:'💫',n:'💫 合体：修罗旋转',d:'劈腿旋风 + 索命钩锁 → 环绕刃带拉扯，把情敌吸进中心',
  a:'orbit',b:'hook',col:0xffd60a,
  do:()=>{W.orbit.fused=true;W.hook.fused=true;W.orbit.suck=true;W.hook.fusedPull=true;}},
 {id:'meteor',ic:'🔥',n:'🔥 合体：天罚流星',d:'心碎流星 + 情感暴力 → 陨石落地后残留燃烧地面',
  a:'meteor',b:'burst',col:0xff8a00,
  do:()=>{W.meteor.fused=true;W.burst.fused=true;W.meteor.burnGround=true;W.burst.fireGround=true;}},
 {id:'forest',ic:'🌫️',n:'🌫️ 合体：绿茵迷城',d:'绿茶迷雾 + 双面人格 → 迷雾内分身数量翻倍且无冷却',
  a:'mist',b:'twin',col:0x7bd389,
  do:()=>{W.mist.fused=true;W.twin.fused=true;W.mist.twinBoost=true;}},
];
function fuseReady(f){
  const A=W[f.a],B=W[f.b];
  return A.lv>=4&&B.lv>=4&&!A.fused&&!B.fused;}
function fusedList(){return FUSIONS.filter(f=>W[f.a].fused||W[f.b].fused);}
function fusedCount(){return FUSIONS.filter(f=>W[f.a].fused).length;}
// ---------- 武器觉醒（进化后的第二次升华：消耗觉醒石） ----------
// 觉醒石来源：Boss 掉落概率、宝箱、连杀里程碑
let awakenStones=0;
const AWAKENS=[
 {key:'bullet',ic:'💘',n:'觉醒·万箭穿心',d:'弹幕数量 +2、穿透 +2，伤害 +30%',need:()=>W.bullet.evolved,
  do:()=>{W.bullet.awakened=true;W.bullet.bonusN=2;W.bullet.bonusPierce=2;W.bullet.dmgMul=(W.bullet.dmgMul||1)*1.3;}},
 {key:'orbit',ic:'🌹',n:'觉醒·血色荆棘',d:'玫瑰 +3 圈，吸血翻倍，切割伤害 +40%',need:()=>W.orbit.evolved,
  do:()=>{W.orbit.awakened=true;W.orbit.bonusRing=3;W.orbit.dmgMul=(W.orbit.dmgMul||1)*1.4;W.orbit.leechMul=(W.orbit.leechMul||1)*2;syncOrbits();}},
 {key:'meteor',ic:'☄️',n:'觉醒·天罚陨落',d:'流星 +3 颗、范围 +50%，附带灼烧',need:()=>W.meteor.evolved,
  do:()=>{W.meteor.awakened=true;W.meteor.bonusN=3;W.meteor.radiusMul=(W.meteor.radiusMul||1)*1.5;W.meteor.burn=true;}},
 {key:'mist',ic:'🍵',n:'觉醒·蚀骨茶雾',d:'毒雾范围 +60%，持续伤害翻倍',need:()=>W.mist.evolved,
  do:()=>{W.mist.awakened=true;W.mist.radiusMul=(W.mist.radiusMul||1)*1.6;W.mist.dmgMul=(W.mist.dmgMul||1)*2;}},
 {key:'nova',ic:'💙',n:'觉醒·魅力坍缩',d:'冲击波范围 +50%，附带击退眩晕',need:()=>W.nova.evolved,
  do:()=>{W.nova.awakened=true;W.nova.radiusMul=(W.nova.radiusMul||1)*1.5;W.nova.stun=true;}},
 {key:'chain',ic:'🕸️',n:'觉醒·天罗地网',d:'连锁目标 +4，伤害 +35%',need:()=>W.chain.evolved,
  do:()=>{W.chain.awakened=true;W.chain.bonusN=4;W.chain.dmgMul=(W.chain.dmgMul||1)*1.35;}},
 {key:'hook',ic:'⛓️',n:'觉醒·九幽勾魂',d:'钩锁 +2 目标，命中重创并禁疗',need:()=>W.hook.evolved,
  do:()=>{W.hook.awakened=true;W.hook.bonusN=2;W.hook.heavy=true;}},
 {key:'clone',ic:'👥',n:'觉醒·千影分身',d:'分身 +2 个，消散爆炸伤害翻倍',need:()=>W.clone.evolved,
  do:()=>{W.clone.awakened=true;W.clone.bonusN=2;W.clone.boomMul=(W.clone.boomMul||1)*2;}},
 {key:'wave',ic:'🌊',n:'觉醒·溺爱之潮',d:'浪潮 +1、范围 +50%，命中眩晕',need:()=>W.wave.evolved,
  do:()=>{W.wave.awakened=true;W.wave.bonusN=1;W.wave.radiusMul=(W.wave.radiusMul||1)*1.5;W.wave.stun=true;}},
];
const AWAKEN_COST=3; // 每次觉醒消耗觉醒石
function canAwaken(a){return awakenStones>=AWAKEN_COST&&a.need()&&!W[a.key].awakened;}
function rollAwakenOptions(){
  // 返回可觉醒的武器列表（进化过且未觉醒）
  return AWAKENS.filter(a=>a.need()&&!W[a.key].awakened);}
function doAwaken(key){
  const a=AWAKENS.find(x=>x.key===key);if(!a)return false;
  if(!canAwaken(a))return false;
  awakenStones-=AWAKEN_COST;a.do();syncAwakenAura();
  // v45：觉醒走 beat 模板（金 + 定格 60ms，强调「质变」）
  VFX.beat({color:'rgba(255,214,10,.34)',pulseCol:'rgba(255,214,10,.8)',
    shake:.6,slowScale:.42,slowDur:.3,freeze:60,
    text:`✨ 武器觉醒！${a.n} —— ${a.d}`});
  setTimeout(()=>VFX.calm(),1100);
  SAVE.awakenTotal=(SAVE.awakenTotal||0)+1;
  writeSave();
  setTimeout(()=>showAwakenCard(a),500);
  return true;}
function showAwakenCard(a){
  let el=document.getElementById('awakenToast');
  if(!el){el=document.createElement('div');el.id='awakenToast';document.body.appendChild(el);}
  el.innerHTML=`<div class="aw-t">✨ 武器觉醒</div>
    <div class="aw-ic">${a.ic}</div><div class="aw-n">${a.n}</div>
    <div class="aw-d">${a.d}</div>`;
  el.style.opacity=1;el.style.transform='translate(-50%,-50%) scale(1)';
  setTimeout(()=>{el.style.opacity=0;el.style.transform='translate(-50%,-50%) scale(.85)';},2400);}
function addAwakenStone(n,src){
  awakenStones+=n;
  tip(`💎 获得觉醒石 ×${n}${src?'（'+src+'）':''} · 当前 ${awakenStones}`);
  renderAwakenHud();}
let hudTick=0; // 觉醒 HUD 刷新节流
function renderAwakenHud(){
  let el=document.getElementById('awakenHud');
  if(!el){el=document.createElement('div');el.id='awakenHud';document.body.appendChild(el);}
  if(awakenStones<=0&&!AWAKENS.some(a=>W[a.key].awakened)){el.style.display='none';return;}
  el.style.display='block';
  const aw=AWAKENS.filter(a=>W[a.key].awakened).length;
  el.innerHTML=`<span class="ahS">💎 ${awakenStones}</span><span class="ahA">觉醒 ${aw}/8</span>`;}
// ---------- Boss 专属掉落（击败首脑掉稀有武器胶囊） ----------
const DROPS=[
 {id:'d_blade',ic:'🗡️',n:'绝情刃',d:'攻击力 +18%',rar:3,apply:()=>{S.dmgMul*=1.18;}},
 {id:'d_boots',ic:'👢',n:'风月靴',d:'移速 +14% 且冲刺冷却 -30%',rar:3,apply:()=>{S.spd*=1.14;S.dashCdMax=(S.dashCdMax||6)*.7;}},
 {id:'d_ring',ic:'💍',n:'孽缘戒',d:'暴击率 +12% 暴击伤害 +25%',rar:3,apply:()=>{S.critC+=.12;S.critM*=1.25;}},
 {id:'d_amulet',ic:'📿',n:'花心护符',d:'生命上限 +60 并回满',rar:2,apply:()=>{S.maxHp+=60;S.hp=S.maxHp;}},
 {id:'d_mask',ic:'🎭',n:'双面面具',d:'技能冷却 -15%',rar:2,apply:()=>{S.cdMul*=.85;}},
 {id:'d_orb',ic:'🔮',n:'修罗珠',d:'拾取范围 +80% 且经验 +40%',rar:2,apply:()=>{S.pickR*=1.8;S.xpMul=(S.xpMul||1)*1.4;}},
 {id:'d_crown',ic:'👑',n:'海王冠冕',d:'伤害 +12% 且生命上限 +40',rar:4,apply:()=>{S.dmgMul*=1.12;S.maxHp+=40;S.hp=Math.min(S.maxHp,S.hp+40);}},
 {id:'d_cloak',ic:'🧥',n:'暗夜斗篷',d:'护甲 +5 且受伤减免 15%',rar:4,apply:()=>{S.armor+=5;S.hurtReduce=(S.hurtReduce||0)+.15;}},
];
// 掉落精炼（v26）：第 n 次获得同一掉落 → 属性以 1+0.35n 倍增幅复现
function applyDropWithRefine(d,n){
  if(n<=0){d.apply();return;}
  const mul=1+n*0.35;
  // 按掉落 id 分派强化增幅（在原效果基础上追加增量）
  const R={
    d_blade:()=>{S.dmgMul*=1+(0.18*mul-0.18);},
    d_boots:()=>{S.spd*=1+(0.14*mul-0.14);},
    d_ring:()=>{S.critC+=.12*mul*.6;S.critM*=1+.25*mul*.5;},
    d_amulet:()=>{S.maxHp+=60*mul;S.hp=S.maxHp;},
    d_mask:()=>{S.cdMul*=Math.max(.55,1-(1-.85)*mul);},
    d_orb:()=>{S.pickR*=1+(0.8*mul-0.8)*.6;S.xpMul=(S.xpMul||1)*(1+.4*mul*.5);},
    d_crown:()=>{S.dmgMul*=1+.12*mul*.6;S.maxHp+=40*mul*.6;S.hp=Math.min(S.maxHp,S.hp+40);},
    d_cloak:()=>{S.armor+=5*mul*.7;S.hurtReduce=Math.min(.6,(S.hurtReduce||0)+.15*mul*.4);},
  };
  d.apply(); // 先应用本体
  if(R[d.id])R[d.id](); // 再叠加精炼增量
}

// 装备词条（v27）：每次掉落随机附加 1~2 条词条，让同一件掉落局局不同
const AFFIXES=[
 {id:'a_dmg', n:'煞气',   pre:['凌厉的','狠戾的','绝情的'], ap:(m)=>{S.dmgMul*=1+.06*m;}},
 {id:'a_hp',  n:'气血',   pre:['厚重的','沉稳的','敦实的'], ap:(m)=>{S.maxHp+=25*m;S.hp+=25*m;}},
 {id:'a_spd', n:'身法',   pre:['轻灵之','疾风之','流云之'], ap:(m)=>{S.spd*=1+.04*m;}},
 {id:'a_crit',n:'杀机',   pre:['致命的','毒辣之','嗜血之'], ap:(m)=>{S.critC+=.04*m;}},
 {id:'a_cd',  n:'悟性',   pre:['通透的','空明之','顿悟之'], ap:(m)=>{S.cdMul*=Math.max(.7,1-.05*m);}},
 {id:'a_regen',n:'回春',  pre:['生生不息的','滋养之','温润之'],ap:(m)=>{S.regen=(S.regen||0)+.4*m;}},
 {id:'a_armor',n:'铁骨',  pre:['磐石之','不动之','玄铁之'], ap:(m)=>{S.armor+=2*m;}},
 {id:'a_pick',n:'机缘',   pre:['天赐之','福缘之','拾光之'], ap:(m)=>{S.pickR*=1+.12*m;}},
 {id:'a_xp',  n:'慧根',   pre:['灵慧之','明心之','悟道之'], ap:(m)=>{S.xpMul=(S.xpMul||1)*(1+.1*m);}},
 {id:'a_scum',n:'风流',   pre:['风流的','多情之','浪荡的'], ap:(m)=>{S.scumBase=(S.scumBase||0)+3*m;}},
];
function rollAffix(rar){ // 稀有度越高词条越多越强；v28：图鉴等级提升权重与倍率，Lv.5 必定入池
  const perfect=AFFIXES.filter(a=>affixLv(a.id)>=AFFIX_LV_MAX);
  let n = rar>=4?(Math.random()<.5?2:1):1;
  if(awakenAffix()&&n<2&&Math.random()<.35)n=2;      // 有 Lv.3 词条 → 双词条概率提升
  if(perfect.length&&n<2)n=2;                        // 有满级词条 → 必定双词条
  const used=new Set(),out=[];
  const pickOne=(force)=>{
    if(force&&force.length){const p=force[Math.floor(Math.random()*force.length)];used.add(p.id);return p;}
    const pool=AFFIXES.filter(a=>!used.has(a.id));if(!pool.length)return null;
    let total=0;for(const a of pool)total+=affixWeight(a);
    let r2=Math.random()*total;
    for(const a of pool){r2-=affixWeight(a);if(r2<=0){used.add(a.id);return a;}}
    return pool[pool.length-1];};
  for(let k=0;k<n;k++){
    const a=pickOne(k===0?perfect:null);if(!a)break;
    const m=(rar>=4?2:rar>=3?1.5:1)+affixBonus(a); // 图鉴等级 → 词条倍率加成
    out.push({a,m:Math.round(m*10)/10});
  }
  return out;}
function applyAffix(list){
  if(!list||!list.length)return '';
  for(const {a,m} of list){try{a.ap(m);}catch(e){}}
  // v47：本局装备的词条记录到 equippedAffix，用于套装判定
  for(const {a} of list){equipAffix(a.id);}
  const rn=RARITY[1];
  return list.map(x=>`<span style="color:#9ad0ff">${x.a.pre[Math.floor(Math.random()*x.a.pre.length)]}·${x.a.n}</span>`).join(' ');
}

// ============ v47 · 词条套装（Affix Sets） ============
// 设计目标：10 条词条此前只作用于单条属性（煞气 +伤害、气血 +生命…），
// 玩家拿到词条只是「属性数字变大」，感知不到构筑。v47 把 10 条按**属性族**分成三套，
// 同一局内集齐 2 / 3 条同族词条 → 触发套装加成，给的是**机制级**效果而不是数字。
// 套装只是一局内的临时状态，不写入存档（避免长期膨胀）。
const AFFIX_SETS=[
 {id:'war',n:'杀伐套',ic:'⚔️',col:'#ff4d6d',
  keys:['a_dmg','a_crit','a_armor'],                // 煞气 / 杀机 / 铁骨
  t2:{d:'伤害 +8% · 暴击伤害 +15%',fx:()=>{S.dmgMul*=1.08;S.critM*=1.15;}},
  t3:{d:'暴击命中时溅射（对周围 3 单位内敌人造成 40% 伤害）',fx:()=>{S.setWarSplash=true;}},
 },
 {id:'flow',n:'灵动套',ic:'💨',col:'#4cc9f0',
  keys:['a_spd','a_cd','a_pick'],                    // 身法 / 悟性 / 机缘
  t2:{d:'移速 +6% · 冷却 -6%',fx:()=>{S.spd*=1.06;S.cdMul*=0.94;}},
  t3:{d:'冲刺后 0.8 秒内攻击间隔减半',fx:()=>{S.setFlowDash=true;}},
 },
 {id:'life',n:'生生套',ic:'🌱',col:'#7bd389',
  keys:['a_hp','a_regen','a_xp','a_scum'],           // 气血 / 回春 / 慧根 / 风流
  t2:{d:'生命上限 +12% · 每秒回血 +0.6',fx:()=>{const b=S.maxHp;S.maxHp=Math.round(b*1.12);S.hp+=S.maxHp-b;S.regen=(S.regen||0)+.6;}},
  t3:{d:'受伤时 25% 概率将伤害转为治疗',fx:()=>{S.setLifeAbsorb=true;}},
 },
];
// 本局已装备的词条（按套内 key 计数）
let equippedAffix={};
let activeSets=[];        // 已激活的套装 [{id,tier}]
function resetAffixSets(){equippedAffix={};activeSets=[];}
function equipAffix(id){
  if(!id)return;
  equippedAffix[id]=(equippedAffix[id]||0)+1;
  checkAffixSets();
}
function setProgressSet(st){
  // 同族已装备的**不同词条条数**（重复装备同一词条不叠加套装计数）
  return st.keys.filter(k=>equippedAffix[k]>0).length;
}
function checkAffixSets(){
  for(const st of AFFIX_SETS){
    const have=setProgressSet(st);
    const cur=activeSets.find(x=>x.id===st.id);
    const tier=have>=3?3:(have>=2?2:0);
    if(tier===0){
      if(cur)activeSets=activeSets.filter(x=>x.id!==st.id);
      continue;
    }
    if(!cur){
      activeSets.push({id:st.id,tier:tier});
      // 首次激活：只上最低档，再按档位补齐
      if(tier>=2)st.t2.fx();
      if(tier>=3)st.t3.fx();
      VFX.beat({color:st.col.replace('#','rgba(').length?hexToRgba(st.col,.34):'rgba(255,214,10,.3)',
        pulseCol:hexToRgba(st.col,.75),shake:.42,slowScale:.55,slowDur:.24,
        text:`${st.ic} 套装激活：${st.n} ${tier===3?'（满）':'(2/3)'}`,sfxFn:sfx.evo});
      setTimeout(()=>tip2(tier>=3?st.t3.d:st.t2.d),640);
      setTimeout(()=>meetOnce('affixSet'),1500); // v48：第一次凑出套装时解释
    }else if(tier>cur.tier){
      cur.tier=tier;
      if(tier>=3)st.t3.fx();
      VFX.beat({color:hexToRgba(st.col,.34),pulseCol:hexToRgba(st.col,.8),shake:.5,
        slowScale:.5,slowDur:.26,text:`${st.ic} ${st.n} 已满：第 3 件达成！`,sfxFn:sfx.evo});
      setTimeout(()=>tip2(st.t3.d),640);
    }
  }
}
function hexToRgba(hex,a){
  const h=String(hex).replace('#','');
  const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function setsActive(){return activeSets.length;}
function setsFull(){return activeSets.filter(x=>x.tier>=3).length;}

// ============ v48 · 首次遇见（First Encounter） ============
// 每个复杂系统第一次出现时给一次精准提示，之后永久不再打扰。
// 记录写在 SAVE.seen 里（跨局保留），玩家可在图鉴「江湖手册」重看或全部重置。
const MEET={
  fuse:{ic:'🌈',n:'合体进化',t:'两把武器都到 4 级，就会出现「合体」金色卡 —— 合成后是一把完全不同的武器',
    d:'合体会消耗掉那两把武器。优先攒「弹幕 + 旋风」这种主力组合，合体收益最大。'},
  awaken:{ic:'💎',n:'武器觉醒',t:'已进化的武器可以用 3 颗「觉醒石」再觉醒一次',
    d:'觉醒石来自 Boss 击杀与精英情敌。觉醒后武器会有质变，是后期主要强度来源。'},
  affixSet:{ic:'🧩',n:'词条套装',t:'同样风格的三条词条凑齐，会触发「套装」效果',
    d:'2 件给数值，3 件给机制。凑齐会有一次特效提示，图鉴里能看当前进度。'},
  phase:{ic:'🌀',n:'四时轮转',t:'气候试炼中每 30 秒换一个时相，天气和增益都会跟着变',
    d:'注意顶部相位条。进相时增益会精确回滚再施加，不会无限叠加。'},
  chain:{ic:'👰',n:'婚宴三连战',t:'第七章是一条命连打三关，中途不回血',
    d:'三关的血量递增（3600→3900→4600）。省着点，别在岳父那里把血打空。'},
  reflect:{ic:'🛡️',n:'精英词缀',t:'紫色光效的情敌带「词缀」，会反弹、免疫或分裂',
    d:'打它之前先看它身上的图标。反伤词缀不要用高频武器硬刚。'},
  twin:{ic:'👯',n:'孪生共鸣',t:'这两只共享血量，打 A 时 B 一起掉血',
    d:'任一只归零会双双回满 40%。要一口气把总血打空，别慢慢磨。'},
  bossHint:{ic:'🎯',n:'Boss 打法提示',t:'每个 Boss 的打法都写在图鉴里',
    d:'打开 📖 江湖档案 → 情敌首脑图鉴，能看到「出处」和「打法提示」。'},
};
function seenKey(){if(!SAVE)return {};SAVE.seen=SAVE.seen||{};return SAVE.seen;}
function hasMet(k){return !!seenKey()[k];}
// 首次遇见：第一次调用弹出提示并记录；之后静默返回 false
function meetOnce(k){
  const m=MEET[k];if(!m)return false;
  if(!SAVE)return false;          // 存档未加载（启动极早期），不记也不弹
  const s=seenKey();
  if(s[k])return false;
  s[k]=1;writeSave();
  showMeetCard(m);
  return true;
}
// 只记录不弹窗（用于不适合打断的场景）
function markMet(k){if(!SAVE)return;const s=seenKey();if(!s[k]){s[k]=1;writeSave();}}

// 遇见卡：一次只显示一张，排队播放，避免同一帧连弹
let meetQueue=[],meetBusy=false;
function showMeetCard(m){
  meetQueue.push(m);
  if(!meetBusy)drainMeetQueue();
}
function drainMeetQueue(){
  if(!meetQueue.length){meetBusy=false;return;}
  meetBusy=true;
  const m=meetQueue.shift();
  const el=document.getElementById('meetCard');
  if(!el){meetBusy=false;return;}
  el.innerHTML=`<div class="mcTag">✦ 首次遇见 · 江湖手册已收录</div>
    <div class="mcIc">${m.ic}</div>
    <div class="mcT">${m.t}</div>
    <div class="mcD">${m.d}</div>
    <button id="mcOk">知道了</button>`;
  el.style.display='block';
  el.classList.remove('in');void el.offsetWidth;el.classList.add('in');
  sfx.evo&&sfx.evo();
  VFX.rim('rgba(127,212,255,.5)',700);
  // v48：用一个「代次」标记守卫，防止旧卡片的 8 秒定时器误关新卡片
  const gen=(el._gen=(el._gen||0)+1);
  let closed=false;
  const close=()=>{
    if(closed)return;
    closed=true;
    if(el._gen!==gen)return;        // 已经不是这一张了，别动
    el.classList.remove('in');el.style.display='none';
    clearTimeout(el._t);
    setTimeout(drainMeetQueue,180);
  };
  const b=document.getElementById('mcOk');
  if(b)b.onclick=close;
  el._close=close;
  // 8 秒无操作自动收起，避免卡住战斗
  clearTimeout(el._t);
  el._t=setTimeout(()=>{if(el._gen===gen)close();},8000);
}
function closeMeetCard(){
  const el=document.getElementById('meetCard');
  if(el&&el._close)el._close();
}

// 江湖手册（图鉴内：已收录 / 未遇见 + 重看 + 全部重置）
function renderManual(){
  const el=document.getElementById('manualList');if(!el)return;
  const s=seenKey();
  const keys=Object.keys(MEET);
  const got=keys.filter(k=>s[k]).length;
  const sv=document.getElementById('svManual');
  if(sv)sv.textContent=`${got}/${keys.length} 已收录`;
  el.innerHTML=keys.map(k=>{
    const m=MEET[k],on=!!s[k];
    return `<div class="manRow ${on?'':'lock'}">
      <span class="mi">${on?m.ic:'❔'}</span>
      <div style="flex:1"><div class="mn">${on?m.n:'未遇见'}</div>
        <div class="md">${on?m.d:'在游戏中遇到该机制时自动解锁'}</div></div>
      ${on?`<button data-mk="${k}">重看</button>`:''}</div>`;}).join('')
    +`<div style="padding:4px 2px"><button id="manReset" class="manReset">🔄 重新播放全部提示</button></div>`;
  el.querySelectorAll('button[data-mk]').forEach(b=>{
    b.onclick=()=>showMeetCard(MEET[b.dataset.mk]);});
  const rs=document.getElementById('manReset');
  if(rs)rs.onclick=()=>{
    if(!SAVE)return;
    SAVE.seen={};writeSave();renderManual();
    tip('🔄 已重置 · 下次遇到这些机制会重新提示');
  };
}

// ---------- 词条图鉴与合成升阶（v28） ----------
// 掉落携带的词条会累积「词条碎片」，碎片合成升阶（Lv.1~Lv.5），永久强化该词条
const AFFIX_IC={a_dmg:'🗡️',a_hp:'❤️',a_spd:'👟',a_crit:'💀',a_cd:'🧠',
  a_regen:'🌱',a_armor:'🛡️',a_pick:'🍀',a_xp:'📖',a_scum:'💋'};
const AFFIX_LV_MAX=5;
const AFFIX_SHARD_COST=[3,5,8,12,18]; // 升到 Lv.1 ~ Lv.5 各自所需碎片
function affixRec(id){SAVE.affixCodex=SAVE.affixCodex||{};
  const r=SAVE.affixCodex[id]||(SAVE.affixCodex[id]={n:0,s:0,lv:0});
  if(typeof r.n!=='number')r.n=0;
  if(typeof r.s!=='number')r.s=0;
  if(typeof r.lv!=='number')r.lv=0;return r;}
function affixLv(id){const r=(SAVE.affixCodex||{})[id];return r&&r.lv?r.lv:0;}
function affixNeed(id){const lv=affixLv(id);return lv>=AFFIX_LV_MAX?0:AFFIX_SHARD_COST[lv];}
function affixCollected(){return AFFIXES.filter(a=>affixRec(a.id).n>0).length;}
function affixUpgraded(){return AFFIXES.filter(a=>affixLv(a.id)>0).length;}
function awakenAffix(){return AFFIXES.filter(a=>affixLv(a.id)>=3).length;}   // Lv.3+ → 开局附赠
function perfectAffix(){return AFFIXES.filter(a=>affixLv(a.id)>=AFFIX_LV_MAX).length;} // Lv.5 → 必定入池
function affixWeight(a){return 1+affixLv(a.id)*.35;}  // 图鉴等级 → 掉落出现权重
function affixBonus(a){return affixLv(a.id)*.4;}      // 图鉴等级 → 词条倍率加成
function affixCollect(id,m){const r=affixRec(id);r.n++;
  const sh=m>=2?2:1;r.s+=sh;SAVE.affixShards=(SAVE.affixShards||0)+sh;return sh;}
function affixCanSynth(a){return affixLv(a.id)<AFFIX_LV_MAX&&affixRec(a.id).s>=AFFIX_SHARD_COST[affixLv(a.id)];}
function affixLvDesc(a,lv){
  const d=[`出现倍率 +${(lv*.4).toFixed(1)}`];
  if(lv>=3)d.push('开局附赠');
  if(lv>=AFFIX_LV_MAX)d.push('掉落必带');
  return d.join(' · ');}
function affixSynth(id){
  const def=AFFIXES.find(a=>a.id===id);if(!def)return false;
  const r=affixRec(id),lv=r.lv;
  if(lv>=AFFIX_LV_MAX){tip('✦ 该词条已满级 Lv.5');return false;}
  const need=AFFIX_SHARD_COST[lv];
  if(r.s<need){tip(`✦ 碎片不足（${r.s}/${need}）`);return false;}
  r.s-=need;r.lv=lv+1;SAVE.affixSynth=(SAVE.affixSynth||0)+1;
  SAVE.bonusPts=(SAVE.bonusPts||0)+(r.lv>=3?2:1); // 升阶奖励成就点数
  writeSave();sfx.evo();showAffixToast(def,r.lv);refreshSaveUI();
  return true;}
function showAffixToast(def,lv){
  let el=document.getElementById('affixToast');
  if(!el){el=document.createElement('div');el.id='affixToast';document.body.appendChild(el);}
  el.innerHTML=`<div class="aft">✦ 词条合成升阶</div>
    <div class="afn">${AFFIX_IC[def.id]||'✦'} ${def.n} Lv.${lv}</div>
    <div class="afd">${affixLvDesc(def,lv)}</div>`;
  el.style.opacity=1;el.style.transform='translate(-50%,-50%) scale(1)';
  flashOverlay('rgba(199,125,255,.20)',.4);
  setTimeout(()=>{el.style.opacity=0;el.style.transform='translate(-50%,-50%) scale(.85)';},2200);}
function renderAffixCodex(){
  const el=document.getElementById('affixList');if(!el)return;
  const sv=document.getElementById('svAffix');
  if(sv)sv.textContent=`${affixCollected()}/${AFFIXES.length} 收集 · ${affixUpgraded()} 已升阶 · 碎片 ${SAVE.affixShards||0}`;
  el.innerHTML=AFFIXES.map(a=>{
    const r=affixRec(a.id),lv=r.lv,max=lv>=AFFIX_LV_MAX,need=AFFIX_SHARD_COST[lv];
    const got=r.n>0,can=affixCanSynth(a);
    const pct=max?100:Math.min(100,Math.round(r.s/(need||1)*100));
    return `<div class="afxRow ${max?'max':got?'':'lock'}">
      <span class="ai" style="${got?'':'filter:grayscale(1)'}">${got?(AFFIX_IC[a.id]||'✦'):'❔'}</span>
      <div style="flex:1">
        <div class="an">${got?a.n:'未知词条'}<span class="alv">Lv.${lv}/${AFFIX_LV_MAX}</span>
          <span class="ad"> · 获得 ${r.n} 次</span></div>
        <div class="ad">${got?affixLvDesc(a,lv):'掉落携带该词条后解锁图鉴'}</div>
        <div class="afxBar"><i style="width:${pct}%"></i></div>
        <div class="ad">碎片 ${r.s}/${max?'—':need}${max?' · 已满级':''}</div>
      </div>
      <button data-aid="${a.id}" ${can?'':'disabled'}>${max?'满级':can?'合成升阶':'碎片不足'}</button></div>`;}).join('');
  el.querySelectorAll('button[data-aid]').forEach(b=>{b.onclick=()=>affixSynth(b.dataset.aid);});
  renderSetCodex();}

// v47：词条套装进度（图鉴展示 + 本局实时状态）
function renderSetCodex(){
  const el=document.getElementById('setList');if(!el)return;
  const sv=document.getElementById('svSets');
  if(sv)sv.textContent=`本局激活 ${setsActive()}/3 · 满档 ${setsFull()}`;
  el.innerHTML=AFFIX_SETS.map(st=>{
    const have=setProgressSet(st);
    const act=activeSets.find(x=>x.id===st.id);
    const tier=act?act.tier:0;
    const pips=[1,2,3].map(i=>`<i style="background:${i<=have?st.col:'#2a2340'};box-shadow:${i<=have?'0 0 6px '+st.col:'none'}"></i>`).join('');
    return `<div class="afxRow" style="${tier?'':'opacity:.72'}">
      <span class="ai">${st.ic}</span>
      <div style="flex:1">
        <div class="an">${st.n}<span class="alv" style="color:${st.col}">${have}/3${tier>=3?' · 满档':tier===2?' · 二档':''}</span></div>
        <div class="stPips">${pips}</div>
        <div class="ad">2 件：${st.t2.d}</div>
        <div class="ad" style="${tier>=3?'color:'+st.col:'opacity:.6'}">3 件：${st.t3.d}</div>
        <div class="ad" style="color:#8a7aa8">组成：${st.keys.map(k=>{const a=AFFIXES.find(x=>x.id===k);return a?a.n:k;}).join(' / ')}</div>
      </div></div>`;}).join('');
}

const DROP_BY_BOSS={
 captain:['d_blade','d_ring','d_amulet','d_mask'],
 mother:['d_amulet','d_orb','d_crown','d_mask'],
 mirror:['d_boots','d_ring','d_cloak','d_crown'],
 abyss:['d_crown','d_cloak','d_blade','d_ring'],
 thunder:['d_boots','d_cloak','d_orb','d_ring'],
 assassin:['d_mask','d_blade','d_boots','d_orb'],
 solar:['d_crown','d_ring','d_cloak','d_blade'],
 rain:['d_orb','d_amulet','d_boots','d_mask'],
};
// ---------- 掉落套装（v21：同局集齐触发套装共鸣） ----------
// 每件掉落归属一个套装；同局集齐 2/3/4 件触发阶梯共鸣
const SETS=[
 {id:'s_blade',n:'绝杀四件套',ic:'⚔️',members:['d_blade','d_ring','d_crown','d_boots'],
  col:'#ff4d6d',
  tiers:[{k:2,d:'暴击率 +10%',ap:()=>{S.critC+=.10;}},
         {k:3,d:'暴击伤害 +35%',ap:()=>{S.critM*=1.35;}},
         {k:4,d:'全属性 +12%（杀意共鸣）',ap:()=>{S.dmgMul*=1.12;S.maxHp*=1.12;S.hp*=1.12;S.spd*=1.06;}}]},
 {id:'s_guard',n:'不败守护套',ic:'🛡️',members:['d_amulet','d_cloak','d_mask','d_orb'],
  col:'#4cc9f0',
  tiers:[{k:2,d:'受伤减免 +12%',ap:()=>{S.hurtReduce=(S.hurtReduce||0)+.12;}},
         {k:3,d:'护甲 +6 且每秒回血 +1',ap:()=>{S.armor+=6;S.regen=(S.regen||0)+1;}},
         {k:4,d:'生命上限 +120 并回满（守护共鸣）',ap:()=>{S.maxHp+=120;S.hp=S.maxHp;S.hurtReduce=(S.hurtReduce||0)+.08;}}]},
];
let ownedDrops={}; // 本局已获掉落（用于套装共鸣）
function setState(){const o={};for(const s of SETS)o[s.id]=s.members.filter(m=>(ownedDrops[m]||0)>0).length;return o;}
function checkSetBonus(){
  const st=setState();
  SAVE.setSeen=SAVE.setSeen||{};
  for(const s of SETS){
    const cnt=st[s.id];
    const prev=SAVE.setSeen[s.id]||0;
    if(cnt>prev){
      // 触发新达成的最高一档
      for(const t of s.tiers){if(cnt>=t.k&&prev<t.k){t.ap();
        showSetToast(s,t,cnt);}}
      SAVE.setSeen[s.id]=cnt;writeSave();
    }
  }
}
function showSetToast(s,t,cnt){
  let el=document.getElementById('setToast');
  if(!el){el=document.createElement('div');el.id='setToast';document.body.appendChild(el);}
  el.innerHTML=`<div class="st-t" style="color:${s.col}">${s.ic} 套装共鸣</div>
    <div class="st-n">${s.n} · ${t.k}/${s.members.length}</div>
    <div class="st-d">${t.d}</div>`;
  el.style.opacity=1;el.style.transform='translate(-50%,-50%) scale(1)';
  sfx.evo();flashOverlay('rgba(255,214,10,.22)',.4);shake(.4);
  setTimeout(()=>{el.style.opacity=0;el.style.transform='translate(-50%,-50%) scale(.85)';},2400);}
function rollBossDrop(bid){
  const pool=DROP_BY_BOSS[bid]||DROP_BY_BOSS.captain;
  // 稀有度加权：传奇掉落概率随波次/时间提升
  const bonus=Math.min(.35,(bossKills*0.03)+(S.time/3000));
  const r=Math.random();
  let id;
  if(r<0.18+bonus){id=pool[2+Math.floor(Math.random()*2)]||pool[pool.length-1];}
  else{id=pool[Math.floor(Math.random()*Math.min(2,pool.length))];}
  const d=DROPS.find(x=>x.id===id)||DROPS[0];
  // —— 强化累积（v26）：重复获得同一掉落 → 本局精炼层数 +1，属性增幅叠加 ——
  const refineLv=(ownedDrops[d.id]||0);
  applyDropWithRefine(d,refineLv);
  ownedDrops[d.id]=(ownedDrops[d.id]||0)+1;
  if(refineLv>0)tip(`✨ ${d.n} 精炼至 +${refineLv}（属性增幅 ×${(1+refineLv*0.35).toFixed(2)}）`);
  SAVE.dropCount=(SAVE.dropCount||0)+1;
  SAVE.dropCodex=SAVE.dropCodex||{};SAVE.dropCodex[d.id]=(SAVE.dropCodex[d.id]||0)+1;
  writeSave();
  // 随机词条（v27；v28 叠加图鉴权重/倍率）
  const affixes=rollAffix(d.rar);
  const affixTxt=applyAffix(affixes);
  SAVE.affixCount=(SAVE.affixCount||0)+affixes.length;
  // v28：词条图鉴累积（碎片）+ 可升阶提示
  const shards=affixes.map(x=>affixCollect(x.a.id,x.m));
  {const ready=AFFIXES.filter(affixCanSynth);
   if(ready.length)setTimeout(()=>tip(`✦ 词条可升阶：${ready.map(a=>a.n).join('、')}（档案 → 词条图鉴）`),2100);}
  const rn=RARITY[d.rar]||RARITY[1];
  tip(`💠 Boss 掉落：${d.ic} ${d.n}（${rn.n}）${affixTxt?' · '+affixes.map(x=>x.a.n+'×'+x.m).join(' '):''}`);
  setTimeout(()=>showDropCard(d,affixes,refineLv,shards),700);
  checkSetBonus();
  return d;}
function showDropCard(d,affixes,refine,shards){
  const rn=RARITY[d.rar]||RARITY[1];
  let el=document.getElementById('dropToast');
  if(!el){el=document.createElement('div');el.id='dropToast';document.body.appendChild(el);}
  const affixLine=(affixes&&affixes.length)?
    `<div class="dax">${affixes.map(x=>`✦ ${x.a.pre[Math.floor(Math.random()*x.a.pre.length)]}·${x.a.n} <b>×${x.m}</b>`).join('<br>')}</div>`:'';
  const shardLine=(shards&&shards.length)?
    `<div class="drf">✦ 词条碎片 +${shards.reduce((a,b)=>a+b,0)}</div>`:'';
  const refineLine=refine>0?`<div class="drf">✨ 精炼 +${refine}</div>`:'';
  el.innerHTML=`<div class="dt" style="color:${rn.col}">💠 稀有掉落</div>
    <div class="dic">${d.ic}</div><div class="dn">${d.n}${refine>0?` <span style="color:#ffd60a;font-size:13px">+${refine}</span>`:''}</div>
    <div class="dd">${d.d}</div>${affixLine}${shardLine}${refineLine}<div class="dr" style="color:${rn.col}">${rn.n}</div>`;
  el.style.opacity=1;el.style.transform='translate(-50%,-50%) scale(1)';
  sfx.evo();
  setTimeout(()=>{el.style.opacity=0;el.style.transform='translate(-50%,-50%) scale(.8)';},2200);}
function renderDropCodex(){
  const el=document.getElementById('dropList');if(!el)return;
  const dc=SAVE.dropCodex||{};
  const setHtml=SETS.map(s=>{
    const got=s.members.filter(m=>(dc[m]||0)>0).length;
    const full=got>=s.members.length;
    return `<div class="setRow" style="border-color:${full?s.col:'rgba(201,167,235,.25)'}">
      <span class="setIc">${s.ic}</span>
      <div style="flex:1"><div class="setN" style="color:${full?s.col:'#b9a6d0'}">${s.n}</div>
      <div class="setD">${s.tiers.map(t=>`${t.k}件:${t.d}`).join('  ·  ')}</div></div>
      <div class="setCk" style="color:${full?s.col:'#8a7aa8'}">${got}/${s.members.length}</div></div>`;
  }).join('');
  el.innerHTML=setHtml+
    `<div class="badgeProg" style="margin-top:6px">🎽 套装收集（图鉴）</div>`+
    DROPS.map(d=>{const has=(dc[d.id]||0)>0;const rn=RARITY[d.rar]||RARITY[1];
    const inSet=SETS.find(s=>s.members.includes(d.id));
    return `<div class="cx ${has?'':'lock'}" style="${has?`border-color:${rn.col}`:''}">
      <span class="ci" style="${has?'':`filter:grayscale(1);opacity:.4`}">${has?d.ic:'❓'}</span>
      <div style="flex:1"><div class="cn" style="color:${has?rn.col:'#8a7aa8'}">${has?d.n:'未获得'}
      ${inSet?`<span style="font-size:10px;color:${inSet.col};margin-left:5px">${inSet.ic}</span>`:''}</div>
      <div class="cd">${has?d.d:'击败首脑有机会掉落'}</div></div>
      <div class="ck">×${dc[d.id]||0}</div></div>`;}).join('')+
    `<div class="badgeProg">💠 掉落收集 <b style="color:#4cc9f0">${DROPS.filter(d=>dc[d.id]>0).length}/${DROPS.length}</b></div>`;}
let pendingLvl=0;
const meetShownThisDraft=new Set(); // v48：同一次三选一里同类提示只弹一次
function showDraft(){const pool=[];
  const h2=document.querySelector('#modal h2');if(h2)h2.textContent='✦ 渣男秘籍 · 三选一 ✦';
  // v42 合体进化最优先：两把 ≥4 级即出现（金色稀有卡）
  for(const f of FUSIONS)if(fuseReady(f)){pool.push({_fusion:true,ic:f.ic,n:f.n,d:f.d,key:f.id,do:f.do});
    if(!meetShownThisDraft.has('fuse')){meetShownThisDraft.add('fuse');meetOnce('fuse');}}
  // 进化优先
  for(const e of EVOS)if(e.need())pool.push(e);
  // 觉醒优先（有觉醒石且已进化）：每次最多给 1 个觉醒选项，保证不挤占其他选择
  if(awakenStones>=AWAKEN_COST){const aw=rollAwakenOptions();
    if(aw.length){pool.push({...aw[Math.floor(Math.random()*aw.length)],_awaken:true});
      if(!meetShownThisDraft.has('awaken')){meetShownThisDraft.add('awaken');meetOnce('awaken');}}}
  for(const s of SKILLS){
    if(s.type==='w'&&W[s.key].lv>=5)continue;
    if(s.type==='p'&&P[s.key]>=s.max)continue;
    pool.push(s);}
  const picks=[];
  while(picks.length<3&&pool.length){picks.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);}
  if(!picks.length){S.hp=Math.min(S.maxHp,S.hp+20);pendingLvl--;return;}
  const c=document.getElementById('cards');c.innerHTML='';
  picks.forEach(s=>{const isEvo=!!s._evo;
    const isAw=!!s._awaken;
    const isFu=!!s._fusion;
    const d=document.createElement('div');d.className='card'+(isFu?' fuse':(isEvo||isAw?' rare':''));
    const lvTxt=isFu?'🌈 合体':isAw?`💎 ${AWAKEN_COST} 觉醒石`:s.type==='w'?(W[s.key].evolved?'已进化':`Lv.${W[s.key].lv}→${W[s.key].lv+1}`)
      :(s.max?`Lv.${P[s.key]}→${P[s.key]+1}`:'');
    d.innerHTML=`<div class="ic">${s.ic}</div><div><h3>${s.n}</h3><p>${s.d}</p></div><div class="lv">${lvTxt}</div>`;
    d.onclick=()=>{
      if(isFu){s.do();
        // v45：合体是「质变」，给 bloom（多层光环），比单件进化高一档
        VFX.bloom({color:'rgba(255,77,158,.32)',pulseCol:'rgba(255,214,10,.7)',layers:3,
          slowScale:.3,slowDur:.45,text:'🌈 合体成功！'+s.n.replace(/^.*合体：/,'')});
        setTimeout(()=>VFX.calm(),1800);}
      else if(isAw){if(!doAwaken(s.key)){tip('💎 觉醒石不足');return;}}
      else if(isEvo){s.do();evolveCount++;
        // v45：单件进化 → beat（青紫，比合体轻一档）
        VFX.beat({color:'rgba(76,201,240,.3)',pulseCol:'rgba(76,201,240,.7)',
          shake:.4,slowScale:.5,slowDur:.24,text:'⚔️ 进化完成！'});}
      else{s.up();sfx.card();}
      document.getElementById('modal').style.display='none';pendingLvl--;
      if(pendingLvl>0)setTimeout(showDraft,80);else paused=false;};
    c.appendChild(d);});
  document.getElementById('modal').style.display='flex';}
function gainXp(v){S.xp+=v*(S.xpMul||1)*(D.xpMul||1);
  while(S.xp>=S.xpNeed){S.xp-=S.xpNeed;
    const oldR=realmIdx(S.lvl);S.lvl++;S.xpNeed=Math.round(S.xpNeed*1.28+3);pendingLvl++;
    levelUpFxT=1.1;burst(player.position,0xffd60a,18,8);
    // 突破境界：天地异象 + 冲击波伤害 + 回复
    if(realmIdx(S.lvl)>oldR){
      S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.4);
      tip(`⚡ 突破！${realmName(S.lvl)}！天地异象！`);
      sfx.evo();shake(.7);burst(player.position,0x4cc9f0,40,14);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.3,1,40),
        new THREE.MeshBasicMaterial({color:0xffd60a,transparent:true,opacity:.8,side:THREE.DoubleSide}));
      ring.rotation.x=-Math.PI/2;ring.position.copy(player.position).setY(.3);
      ring.userData={life:.7,grow:12};scene.add(ring);parts.push(ring);
      for(const e of enemies)if(e.position.distanceTo(player.position)<12)hitEnemy(e,60*S.dmgMul);}
    sfx.lvl();}}

// ---------- 触控 ----------
const joy={active:false,id:null,dx:0,dz:0};
const joyEl=document.getElementById('joy'),knob=document.getElementById('joyKnob');
function joyStart(e){const t=e.changedTouches?e.changedTouches[0]:e;
  joy.active=true;joy.id=t.identifier!==undefined?t.identifier:'mouse';joyMove(e);}
function joyMove(e){if(!joy.active)return;const ts=e.touches||[e];
  let t=null;for(const x of ts){if((x.identifier!==undefined?x.identifier:'mouse')===joy.id)t=x;}
  if(!t)return;const r=joyEl.getBoundingClientRect();
  let dx=t.clientX-(r.left+60),dy=t.clientY-(r.top+60);
  const L=Math.hypot(dx,dy)||1,cl=Math.min(L,44);
  dx=dx/L*cl;dy=dy/L*cl;knob.style.left=(35+dx)+'px';knob.style.top=(35+dy)+'px';
  joy.dx=dx/44;joy.dz=dy/44;}
function joyEnd(){joy.active=false;joy.dx=joy.dz=0;knob.style.left='35px';knob.style.top='35px';}
joyEl.addEventListener('touchstart',e=>{e.preventDefault();joyStart(e);},{passive:false});
joyEl.addEventListener('touchmove',e=>{e.preventDefault();joyMove(e);},{passive:false});
joyEl.addEventListener('touchend',joyEnd);
// 桌面鼠标摇杆
joyEl.addEventListener('mousedown',joyStart);
addEventListener('mousemove',e=>{if(joy.active&&joy.id==='mouse')joyMove(e);});
addEventListener('mouseup',joyEnd);
// 键盘
const keys={};
try{window.keys=keys;}catch(e){}  // v50：回归脚本注入按键用
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;
  if(e.code==='Space')castUlt();if(e.key==='Shift')dash();
  if(e.key==='1')useLoverUlt(0);if(e.key==='2')useLoverUlt(1);if(e.key==='3')useLoverUlt(2);});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
// 冲刺
const ghostGeo=new THREE.ConeGeometry(.6,1.5,10);
function dash(){if(S.dashCd>0||!S.alive)return;S.dashing=.22;S.dashCd=(S.dashCdMax||6);sfx.dash();
  if(S.setFlowDash){S.flowWin=.8;burst(player.position.clone().setY(1.1),0x4cc9f0,10,8);} // v47 灵动套满级
  for(let i=0;i<4;i++){const g=new THREE.Mesh(ghostGeo,M.ghost);
    g.position.copy(player.position).add(new THREE.Vector3(0,1,0));g.userData={life:.3+i*.04,ghost:true};
    scene.add(g);parts.push(g);}}
const dashBtn=document.getElementById('dashBtn');
dashBtn.addEventListener('touchstart',e=>{e.preventDefault();dash();},{passive:false});
dashBtn.addEventListener('mousedown',dash);
// 暂停
let hardPause=false;
document.getElementById('pauseBtn').onclick=function(){
  if(!started)return;hardPause=!hardPause;this.textContent=hardPause?'▶':'⏸';};
document.getElementById('codexBtn').onclick=()=>{hardPause=true;
  document.getElementById('pauseBtn').textContent='▶';
  refreshSaveUI();document.getElementById('codex').style.display='block';};
document.getElementById('codexClose').onclick=()=>{document.getElementById('codex').style.display='none';
  if(typeof closeBossViewer==='function')closeBossViewer();
  if(started){hardPause=false;document.getElementById('pauseBtn').textContent='⏸';}};
document.getElementById('resetBtn').onclick=()=>{
  if(confirm('确定清空所有存档（境界/好感/图鉴/成就）吗？')){resetSave();showEnding();}};
// 提示
let tipT=null;
function tip(msg){const t=document.getElementById('tip');t.textContent=msg;t.style.opacity=1;
  clearTimeout(tipT);tipT=setTimeout(()=>t.style.opacity=0,1400);}
// v44：第二行提示（机制教学，稍晚上屏并更持久）
function tip2(msg){clearTimeout(tip2T);
  tip2T=setTimeout(()=>{const t=document.getElementById('tip');if(!t)return;
    t.textContent=msg;t.style.opacity=1;
    clearTimeout(tipT);tipT=setTimeout(()=>t.style.opacity=0,2400);},260);}
let tip2T=0;

// ---------- 存档系统（localStorage 跨局保留） ----------
const SAVE_KEY='znxtx_save_v1';
const DEFAULT_SAVE={realmBonus:0,affinity:[0,0,0],mates:[],dates:[0,0,0],
  bosses:{},achievements:[],best:{time:0,kills:0,realm:'炼体·前期',grade:'D',gradeScore:0},totalRuns:0,letters:[],daily:{},tutDone:false,
  achPoints:0,shop:{hp:0,spd:0,weapon:0,scum:0},ranks:{normal:[],endless:[],daily:[],abyss:[]},endlessBest:0,
  abyssBest:0,awakenTotal:0,dateTotal:0,setSeen:{},
  rankCat:'normal',weeks:{},weekClear:{},dropCount:0,dropCodex:{},
  affixCodex:{},affixShards:0,affixSynth:0,
  checkin:{last:'',streak:0,total:0,day:'',week:'',rew:{}},shareCodes:{},bossReplay:{},bonusPts:0,
  // v39 天气 Boss 线：四系气候印记（各天气专属 Boss 击杀累积）+ 四时之主战绩
  climateSeals:{storm:0,fog:0,solar:0,rain:0},climateKills:0,climateBest:0,
  // v41 宿命天赋树：5 流派各 5 级 + 终极共鸣
  fate:{blade:0,vital:0,flow:0,charm:0,fate:0},fateUlt:false,
  // v46 抉择痕迹：三倾向计数 + 每次选择的痕迹
  align:{sincere:0,player:0,slick:0},traces:{},
  // v44 婚宴三连战最好成绩
  weddingBeaten:0,
  // v48 首次遇见：已收录的机制
  seen:{},
  // v49 存档结构版本（用于未来迁移）
  schemaVer:49};
let SAVE=null;
function loadSave(){try{const s=localStorage.getItem(SAVE_KEY);
    SAVE=s?Object.assign({},DEFAULT_SAVE,JSON.parse(s)):JSON.parse(JSON.stringify(DEFAULT_SAVE));
    // 兼容旧档
    if(!Array.isArray(SAVE.affinity))SAVE.affinity=[0,0,0,0];while(SAVE.affinity.length<8)SAVE.affinity.push(0);
    if(!Array.isArray(SAVE.mates))SAVE.mates=[];
    if(!SAVE.bosses)SAVE.bosses={};if(!Array.isArray(SAVE.achievements))SAVE.achievements=[];
    if(!SAVE.daily||typeof SAVE.daily!=='object')SAVE.daily={};
    if(typeof SAVE.achPoints!=='number')SAVE.achPoints=0;
    if(!SAVE.shop||typeof SAVE.shop!=='object')SAVE.shop={hp:0,spd:0,weapon:0,scum:0};
    if(!SAVE.ranks||typeof SAVE.ranks!=='object')SAVE.ranks={normal:[],endless:[],daily:[]};
    if(!Array.isArray(SAVE.ranks.normal))SAVE.ranks.normal=[];
    if(!Array.isArray(SAVE.ranks.endless))SAVE.ranks.endless=[];
    if(!Array.isArray(SAVE.ranks.daily))SAVE.ranks.daily=[];
    if(typeof SAVE.endlessBest!=='number')SAVE.endlessBest=0;
    if(!SAVE.rankCat)SAVE.rankCat='normal';
    if(!SAVE.weeks||typeof SAVE.weeks!=='object')SAVE.weeks={};
    if(!SAVE.weekClear||typeof SAVE.weekClear!=='object')SAVE.weekClear={};
    if(typeof SAVE.dropCount!=='number')SAVE.dropCount=0;
    if(!SAVE.dropCodex||typeof SAVE.dropCodex!=='object')SAVE.dropCodex={};
    // v39 兼容旧档
    if(!SAVE.climateSeals||typeof SAVE.climateSeals!=='object')SAVE.climateSeals={storm:0,fog:0,solar:0,rain:0};
    if(typeof SAVE.climateSeals.storm!=='number')SAVE.climateSeals.storm=0;
    if(typeof SAVE.climateSeals.fog!=='number')SAVE.climateSeals.fog=0;
    if(typeof SAVE.climateSeals.solar!=='number')SAVE.climateSeals.solar=0;
    if(typeof SAVE.climateSeals.rain!=='number')SAVE.climateSeals.rain=0;
    if(typeof SAVE.climateKills!=='number')SAVE.climateKills=0;
    if(typeof SAVE.climateBest!=='number')SAVE.climateBest=0;
    if(!SAVE.checkin||typeof SAVE.checkin!=='object')SAVE.checkin={last:'',streak:0,total:0,day:'',week:'',rew:{}};
    if(typeof SAVE.checkin.streak!=='number')SAVE.checkin.streak=0;
    if(typeof SAVE.checkin.total!=='number')SAVE.checkin.total=0;
    if(!SAVE.checkin.rew||typeof SAVE.checkin.rew!=='object')SAVE.checkin.rew={};
    if(!SAVE.shareCodes||typeof SAVE.shareCodes!=='object')SAVE.shareCodes={};
    if(!SAVE.bossReplay||typeof SAVE.bossReplay!=='object')SAVE.bossReplay={};
    if(typeof SAVE.bonusPts!=='number')SAVE.bonusPts=0;
    // v41 兼容旧档：宿命天赋
    if(!SAVE.fate||typeof SAVE.fate!=='object')SAVE.fate={};
    for(const k of ['blade','vital','flow','charm','fate'])
      if(typeof SAVE.fate[k]!=='number')SAVE.fate[k]=0;
    if(typeof SAVE.fateUlt!=='boolean')SAVE.fateUlt=false;
    // v28：最佳记录（评级）与词条图鉴兼容
    if(!SAVE.best||typeof SAVE.best!=='object')SAVE.best={time:0,kills:0,realm:'炼体·前期',grade:'D',gradeScore:0};
    if(typeof SAVE.best.gradeScore!=='number')SAVE.best.gradeScore=0;
    if(!SAVE.best.grade)SAVE.best.grade='D';
    if(!SAVE.affixCodex||typeof SAVE.affixCodex!=='object')SAVE.affixCodex={};
    if(typeof SAVE.affixShards!=='number')SAVE.affixShards=0;
    if(typeof SAVE.affixSynth!=='number')SAVE.affixSynth=0;
    // v33：影子对战
    if(!Array.isArray(SAVE.ghosts))SAVE.ghosts=[];
    if(typeof SAVE.ghostWins!=='number')SAVE.ghostWins=0;
    if(typeof SAVE.ghostCodeWins!=='number')SAVE.ghostCodeWins=0;
    if(typeof SAVE.ghostBest!=='number')SAVE.ghostBest=0;
    // ---- v49：统一 schema 守卫（新增字段自动兜底，不再逐条手写）----
    SAVE=guardSchema(SAVE);
  }catch(e){SAVE=JSON.parse(JSON.stringify(DEFAULT_SAVE));}
  return SAVE;}

// v49：按 DEFAULT_SAVE 的类型逐字段校验。缺字段、类型错、嵌套对象缺键，全部按默认值补齐。
// 这样以后往 DEFAULT_SAVE 加字段，老存档自动获得默认值，不需要再写兼容代码。
function guardSchema(save){
  const base=JSON.parse(JSON.stringify(DEFAULT_SAVE));
  const fix=(cur,def)=>{
    if(Array.isArray(def))return Array.isArray(cur)?cur:def;
    if(def&&typeof def==='object'){
      const out=(cur&&typeof cur==='object'&&!Array.isArray(cur))?cur:{};
      for(const k of Object.keys(def))out[k]=fix(out[k],def[k]);
      return out;
    }
    if(typeof def==='number')return typeof cur==='number'&&isFinite(cur)?cur:def;
    if(typeof def==='boolean')return typeof cur==='boolean'?cur:def;
    if(typeof def==='string')return typeof cur==='string'?cur:def;
    return cur===undefined?def:cur;
  };
  // 以默认值为骨架逐键修；老存档里额外存在但默认值没有的键，保留（向前兼容）
  const out=fix(save,base);
  for(const k of Object.keys(save||{}))if(!(k in base))out[k]=save[k];
  out.schemaVer=DEFAULT_SAVE.schemaVer;
  return out;
}
function writeSave(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(SAVE));}catch(e){}}
function resetSave(){SAVE=JSON.parse(JSON.stringify(DEFAULT_SAVE));writeSave();refreshSaveUI();}

// ---------- 成就点数与初始增益兑换 ----------
// 稀有度折算点数：普通2 / 稀有4 / 史诗8 / 传说14 / 神话22
const ACH_PTS=[0,2,4,8,14,22];
function totalAchPoints(){let p=0;for(const a of ACHIEVEMENTS)if(SAVE.achievements.includes(a.id))p+=ACH_PTS[a.r||1];
  return p+(SAVE.bonusPts||0);} // 成就折算 + 签到等额外奖励
const SHOP_DEF=[
 {k:'hp',ic:'❤️',n:'海王体质·根基',d:'每级开局生命上限 +20',max:5,cost:8},
 {k:'spd',ic:'👟',n:'身法·轻功',d:'每级开局移速 +4%',max:5,cost:6},
 {k:'scum',ic:'😈',n:'渣男气场',d:'每级开局渣男值 +8',max:3,cost:10},
 {k:'weapon',ic:'🌹',n:'先手优势',d:'开局额外解锁「劈腿旋风」等级',max:3,cost:16},
];
function shopCost(def,lv){return def.cost*(lv+1);}
function refreshShop(){
  refreshFate(); // v41：天赋树与兑换同步刷新
  const el=document.getElementById('shopBox');if(!el)return;
  const tot=totalAchPoints(),spent=SAVE.achPoints||0,avail=tot-spent;
  const fa=fateAvail(),flv=fateTotalLv();
  if(spent===0&&tot===0){el.style.display='none';return;}
  el.style.display='block';
  // 有可兑换点数时提示（但不强制展开）；v41 同时提示天赋可投点
  const mb=document.getElementById('moreBtn');
  if(mb&&!document.getElementById('morePanel').classList.contains('open')){
    let m='▾ 签到 · 分享码 · 点数兑换';
    if(fa>0)m+=`（${fa} 点待投天赋）`;
    else if(avail>0)m+=`（可用 ${avail} 点）`;
    else if(flv>0)m+=`（天赋 ${flv} 级）`;
    mb.textContent=m;}
  el.innerHTML=`<div id="shopTitle">🎖️ 成就点数兑换</div>
    <div id="shopPts">累计获得 <b>${tot}</b> 点 · 已用 ${spent} · 可用 <b>${avail}</b></div>`+
    SHOP_DEF.map(def=>{
      const lv=(SAVE.shop&&SAVE.shop[def.k])||0;
      const maxed=lv>=def.max,cost=shopCost(def,lv),ok=!maxed&&avail>=cost;
      return `<div class="shopItem"><span class="si">${def.ic}</span>
        <div class="sn"><div class="snm">${def.n} <span class="lvTag">Lv.${lv}/${def.max}</span></div>
        <div class="snd">${def.d}</div></div>
        <button data-k="${def.k}" ${ok?'':'disabled'}>${maxed?'已满级':cost+' 点'}</button></div>`;}).join('');
  el.querySelectorAll('button[data-k]').forEach(b=>{b.onclick=()=>buyUpgrade(b.dataset.k);});}
function buyUpgrade(k){
  const def=SHOP_DEF.find(x=>x.k===k);if(!def)return;
  const lv=(SAVE.shop&&SAVE.shop[k])||0;if(lv>=def.max)return;
  const avail=totalAchPoints()-(SAVE.achPoints||0);
  const cost=shopCost(def,lv);if(avail<cost){tip('🎖️ 成就点数不足');return;}
  SAVE.achPoints=(SAVE.achPoints||0)+cost;SAVE.shop[k]=lv+1;writeSave();
  sfx.evo();tip(`🎖️ 兑换成功：${def.n} Lv.${lv+1}`);
  refreshShop();refreshSaveUI();}
// 开局应用已兑换的增益
function applyRedemption(){
  const sp=SAVE.shop||{};redemption={hp:0,spd:0,weapon:0,scum:0};
  if(sp.hp){redemption.hp=sp.hp*20;S.maxHp+=redemption.hp;S.hp=S.maxHp;}
  if(sp.spd){redemption.spd=sp.spd*.04;S.spd*=1+redemption.spd;}
  if(sp.scum){redemption.scum=sp.scum*8;S.scum=redemption.scum;}
  if(sp.weapon){redemption.weapon=sp.weapon;W.orbit.lv=Math.max(W.orbit.lv,1+sp.weapon);syncOrbits();}
  const parts=[];
  if(redemption.hp)parts.push('生命+'+redemption.hp);
  if(redemption.spd)parts.push('移速+'+Math.round(redemption.spd*100)+'%');
  if(redemption.scum)parts.push('渣值+'+redemption.scum);
  if(redemption.weapon)parts.push('玫瑰Lv.'+(1+redemption.weapon));
  if(parts.length)setTimeout(()=>tip('🎖️ 成就增益生效：'+parts.join(' · ')),900);}

// ---------- v41 宿命天赋树（成就点数的长期去处） ----------
// 设计：5 条流派，每条 5 级（累进收益），全部满级后解锁「宿命共鸣」。
// 总消耗 5×5×(80+120+170+230+300)=45000... 不，实际见 FATE_DEF 的 cost 数组。
// 目标：让 68 个成就产生的点数（约 600~800）能持续投入，而不是 4 个商店项就花光。
const FATE_BRANCHES=[
 {k:'blade',ic:'⚔️',n:'锋刃之道',sub:'伤害',
  d:['伤害 +5%','伤害 +5%','伤害 +6%','伤害 +7%','伤害 +8%（累计 +31%）'],
  cost:[7,12,18,26,36],
  fx:(lv)=>{const m=[0,.05,.10,.16,.23,.31][lv];S.dmgMul*=1+m;}},
 {k:'vital',ic:'❤️🔥',n:'不屈之躯',sub:'生命',
  d:['生命上限 +20','生命上限 +24','生命上限 +28','生命上限 +34','生命上限 +44'],
  cost:[6,11,17,25,34],
  fx:(lv)=>{const add=[0,20,44,72,106,150][lv];
    if(add){S.maxHp+=add;S.hp=S.maxHp;}}},
 {k:'flow',ic:'💨',n:'身法之道',sub:'移速·冲刺',
  d:['移速 +4%','移速 +4%','冲刺冷却 -8%','移速 +5%','移速 +6% · 冲刺 -12%'],
  cost:[6,11,17,25,34],
  fx:(lv)=>{const m=[0,.04,.08,.08,.13,.19][lv];
    if(m)S.spd*=1+m;
    if(lv>=3)S.dashCdMax=(S.dashCdMax||6)*.92;
    if(lv>=5)S.dashCdMax=(S.dashCdMax||6)*.88;}},
 {k:'charm',ic:'💋',n:'魅力之道',sub:'拾取·经验',
  d:['拾取 +12%','拾取 +12%','经验 +8%','拾取 +15%','经验 +14%'],
  cost:[5,10,16,23,32],
  fx:(lv)=>{const pk=[0,.12,.24,.24,.39,.39][lv];
    if(pk)S.pickR*=1+pk;
    const xp=[0,0,0,.08,.08,.22][lv];if(xp)S.xpMul=(S.xpMul||1)*(1+xp);}},
 {k:'fate',ic:'🎲',n:'天运之道',sub:'暴击·幸运',
  d:['暴击率 +3%','暴击率 +3%','暴击伤害 +10%','暴击率 +4%','暴击伤害 +15%'],
  cost:[8,14,22,32,42],
  fx:(lv)=>{S.critC=Math.min(.9,(S.critC||0)+[0,.03,.06,.06,.10,.10][lv]);
    if(lv>=3)S.critM*=1.10;
    if(lv>=5)S.critM*=1.15;}},
];
const FATE_ULT={n:'🌌 宿命共鸣',d:'五道全满 · 开局生命 +25% · 伤害 +10% · 暴击伤害 +20%',
  cost:60,fx:()=>{S.maxHp=Math.round(S.maxHp*1.25);S.hp=S.maxHp;S.dmgMul*=1.10;S.critM*=1.20;}};
function fateLv(k){return (SAVE.fate&&SAVE.fate[k])||0;}
function fateSpent(){let p=0;for(const b of FATE_BRANCHES){const lv=fateLv(b.k);
  for(let i=0;i<lv;i++)p+=b.cost[i];}
  if(SAVE.fateUlt)p+=FATE_ULT.cost;return p;}
function fateAvail(){return totalAchPoints()-fateSpent();}
function fateAllMaxed(){return FATE_BRANCHES.every(b=>fateLv(b.k)>=b.cost.length);}
function fateTotalLv(){return FATE_BRANCHES.reduce((a,b)=>a+fateLv(b.k),0);}
function refreshFate(){
  const el=document.getElementById('fateBox');if(!el)return;
  const tot=totalAchPoints();
  if(tot<=0&&fateTotalLv()===0){el.style.display='none';return;}
  el.style.display='block';
  const avail=fateAvail(),done=fateTotalLv(),max=25;
  el.innerHTML=`<div id="fateTitle">🌌 宿命天赋</div>
    <div id="fatePts">可用 <b>${avail}</b> 点 · 已投 ${done}/${max} 级</div>`+
    FATE_BRANCHES.map(b=>{
      const lv=fateLv(b.k),maxed=lv>=b.cost.length,cost=maxed?0:b.cost[lv];
      const ok=!maxed&&avail>=cost;
      const pips=Array.from({length:b.cost.length},(_,i)=>`<i class="${i<lv?'on':''}"></i>`).join('');
      return `<div class="fateBranch ${maxed?'maxed':''}" data-b="${b.k}">
        <span class="fbIc">${b.ic}</span>
        <div class="fbN"><div class="fbName">${b.n}<small>${b.sub}</small></div>
          <div class="fbDesc">${maxed?'✅ 已满级':b.d[lv]}</div>
          <div class="fatePips">${pips}</div></div>
        <div class="fbLv">Lv.${lv}/${b.cost.length}</div>
        <button class="fbBtn" data-b="${b.k}" ${ok?'':'disabled'}>${maxed?'满':cost}</button>
      </div>`;}).join('')+
    `<div class="fateUlt">
      <div class="fuT">${SAVE.fateUlt?'✅ 已激活':'🔒 待解锁'} · ${FATE_ULT.n}</div>
      <div class="fuD">${FATE_ULT.d}${fateAllMaxed()?'':'<br><span style="color:#8a7aa8">需五道全部满级</span>'}</div>
      <button id="fateUltBtn" ${(!SAVE.fateUlt&&fateAllMaxed()&&avail>=FATE_ULT.cost)?'':'disabled'}>
        ${SAVE.fateUlt?'已共鸣':FATE_ULT.cost+' 点'}</button>
    </div>`;
  el.querySelectorAll('button.fbBtn').forEach(b=>{b.onclick=(e)=>{e.stopPropagation();buyFate(b.dataset.b);};});
  const ub=document.getElementById('fateUltBtn');
  if(ub&&!SAVE.fateUlt)ub.onclick=()=>buyFateUlt();
}
function buyFate(k){
  const b=FATE_BRANCHES.find(x=>x.k===k);if(!b)return;
  const lv=fateLv(k);if(lv>=b.cost.length)return;
  const cost=b.cost[lv];
  if(fateAvail()<cost){tip('🎖️ 成就点数不足');return;}
  SAVE.fate=SAVE.fate||{};SAVE.fate[k]=lv+1;writeSave();
  sfx.evo();tip(`🌌 ${b.n} Lv.${lv+1} · ${b.d[lv]}`);
  if(lv+1===b.cost.length){shake(.3);tip(`✨ ${b.n} 已满级！`);}
  refreshFate();refreshShop();refreshSaveUI();}
function buyFateUlt(){
  if(SAVE.fateUlt||!fateAllMaxed())return;
  if(fateAvail()<FATE_ULT.cost){tip('🎖️ 成就点数不足');return;}
  SAVE.fateUlt=true;writeSave();sfx.evo();shake(.8);
  tip('🌌 宿命共鸣觉醒！五道归一');
  burst(player.position,0xc8b8ff,40,14);
  refreshFate();refreshShop();refreshSaveUI();}
// 开局应用天赋（S 重置之后调用）
// v41.1：必须幂等——先记住「进入时的基线」，再以基线为起点一次性算出结果写回。
// 曾因在 S 上累乘、连调三次使伤害 1.31→1.56、生命 232→343 而失衡。
function applyFate(){
  const lv={};for(const b of FATE_BRANCHES)lv[b.k]=fateLv(b.k);
  // 基线：首次调用时快照「含转世/签到/兑换的原始属性」；再次调用时复用该快照。
  // 这样无论调用几次，结果都只与天赋等级有关（幂等）。
  const g=S.__fateBase||(S.__fateBase={dmg:S.dmgMul,hp:S.maxHp,spd:S.spd,crit:S.critC,
    critM:S.critM,pick:S.pickR,dash:S.dashCdMax||6,xp:S.xpMul||1});
  let dmgM=1,hpAdd=0,spdM=1,critAdd=0,critM=1,pickM=1,dashM=1,xpM=1;
  if(lv.blade>0)dmgM*=1+[0,.05,.10,.16,.23,.31][lv.blade];
  if(lv.vital>0)hpAdd+=[0,20,44,72,106,150][lv.vital];
  if(lv.flow>0){spdM*=1+[0,.04,.08,.08,.13,.19][lv.flow];
    if(lv.flow>=3)dashM*=.92; if(lv.flow>=5)dashM*=.88;}
  if(lv.charm>0){pickM*=1+[0,.12,.24,.24,.39,.39][lv.charm];
    const x=[0,0,0,.08,.08,.22][lv.charm]; if(x)xpM*=1+x;}
  if(lv.fate>0){critAdd+=[0,.03,.06,.06,.10,.10][lv.fate];
    if(lv.fate>=3)critM*=1.10; if(lv.fate>=5)critM*=1.15;}
  if(SAVE.fateUlt){hpAdd+=Math.round((g.hp+hpAdd)*.25);dmgM*=1.10;critM*=1.20;}
  // 写回：先按天赋还原到基线，再乘算天赋系数 → 多次调用结果一致
  S.dmgMul=g.dmg*dmgM;
  S.maxHp=g.hp+hpAdd;S.hp=S.maxHp;
  S.spd=g.spd*spdM;S.critC=Math.min(.9,g.crit+critAdd);
  S.critM=g.critM*critM;S.pickR=g.pick*pickM;
  S.dashCdMax=g.dash*dashM;S.xpMul=g.xp*xpM;
  const lvSum=fateTotalLv();
  if(lvSum>0)setTimeout(()=>tip(`🌌 宿命天赋 ${lvSum} 级已生效${SAVE.fateUlt?' · 已共鸣':''}`),1100);}

// ---------- 本地排行榜（Top10 · v28 带评级与最佳记录标记） ----------
const RANK_MAX=10;
const RANK_LABEL={normal:'常规',endless:'无尽',abyss:'深渊',daily:'每日',ghost:'影子'};
function gradeCol(g){return {S:'#ff4d6d',A:'#ffd60a',B:'#4cc9f0',C:'#9ad0ff',D:'#8a7aa8'}[g]||'#8a7aa8';}
function recordRank(cat,score,extra){
  SAVE.ranks=SAVE.ranks||{normal:[],endless:[],daily:[]};
  const arr=SAVE.ranks[cat]||(SAVE.ranks[cat]=[]);
  const d=new Date();
  const item={score:score,time:Math.floor(S.time),kills:S.kills,lvl:S.lvl,
    realm:realmName(S.lvl),date:`${d.getMonth()+1}/${d.getDate()}`,season:seasonKey()};
  if(extra)Object.assign(item,extra);
  // v34：同步写入赛季榜（SAVE.sRanks[赛季][分类]）
  SAVE.sRanks=SAVE.sRanks||{};
  const sk=seasonKey(),sCat=SAVE.sRanks[sk]=SAVE.sRanks[sk]||{};
  const sArr=sCat[cat]=sCat[cat]||[];
  sArr.push(item);sArr.sort((a,b)=>b.score-a.score);if(sArr.length>RANK_MAX)sArr.length=RANK_MAX;
  arr.push(item);arr.sort((a,b)=>b.score-a.score);
  if(arr.length>RANK_MAX)arr.length=RANK_MAX;
  SAVE.ranks[cat]=arr;
  return arr.indexOf(item);}
function renderRank(){
  const el=document.getElementById('rankList');if(!el)return;
  const cat=SAVE.rankCat||'normal';
  const scope=SAVE.rankScope||'season';
  const sArr=((SAVE.sRanks||{})[seasonKey()]||{})[cat]||[];
  const arr=scope==='season'?sArr:((SAVE.ranks&&SAVE.ranks[cat])||[]);
  // v34：赛季/生涯范围切换
  const sb=document.getElementById('rankScopeBar');
  if(sb){sb.innerHTML=`<span class="stSc${scope==='season'?' on':''}" data-s="season">🏅 本赛季</span>`+
      `<span class="stSc${scope==='all'?' on':''}" data-s="all">📚 生涯</span>`;
    sb.querySelectorAll('.stSc').forEach(x=>x.onclick=()=>{SAVE.rankScope=x.dataset.s;writeSave();renderRank();});}
  // v28：本机最佳记录条（最佳评级 / 最高击杀 / 最长存活 / 当前分类榜首）
  const rb=document.getElementById('rankBest');
  if(rb){const bg=SAVE.best.grade||'D';
    rb.innerHTML=`<span>🎖️ 最佳评级 <b style="color:${gradeCol(bg)}">${bg}</b></span>
      <span>🗡️ 最高击杀 <b>${SAVE.best.kills||0}</b></span>
      <span>⏳ 最长存活 <b>${wi2(SAVE.best.time||0)}</b></span>
      <span>🏆 ${RANK_LABEL[cat]||'本机'}榜首 <b>${arr.length?arr[0].score:0}</b></span>`;}
  if(!arr.length){el.innerHTML='<div class="cd" style="padding:10px 12px;color:#8a7aa8">暂无记录，来一局刷新榜单吧</div>';return;}
  el.innerHTML=arr.map((r,i)=>{
    const cls=i===0?'gold':i===1?'silver':i===2?'bronze':'';
    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
    const nb=[];
    if(r.nb&&r.nb.kills)nb.push('击杀');
    if(r.nb&&r.nb.time)nb.push('存活');
    if(r.nb&&r.nb.grade)nb.push('评级');
    return `<div class="rankRow ${cls}"><span class="rk">${medal}</span>
      <span class="rg" style="color:${gradeCol(r.grade)}">${r.grade||'—'}</span>
      <div class="rv">${r.realm} · 击杀 ${r.kills}${r.wave?' · 第'+r.wave+'波':''}</div>
      ${nb.length?`<span class="nb">🏅 ${nb.join('/')}新高</span>`:''}
      <span class="rs">${r.score}</span><span class="rd">${r.date||''}</span></div>`;}).join('');}

// ---------- 成就系统 ----------
const ACHIEVEMENTS=[
 {id:'first_blood',n:'🥇 首杀',d:'击杀第一名单身情敌',r:1,cond:()=>S.kills>=1},
 {id:'kill100',n:'🗡️ 情敌克星',d:'单局击杀 100 名',r:2,cond:()=>S.kills>=100},
 {id:'kill300',n:'⚔️ 万人斩',d:'单局击杀 300 名',r:4,cond:()=>S.kills>=300},
 {id:'boss1',n:'👑 军团长终结者',d:'击败 1 名军团长',r:2,cond:()=>bossKills>=1},
 {id:'boss3',n:'🏆 军团歼灭',d:'击败 3 名军团长',r:3,cond:()=>bossKills>=3},
 {id:'realm_jindan',n:'🌟 金丹大成',d:'修为达到金丹境',r:2,cond:()=>realmIdx(S.lvl)>=4},
 {id:'realm_huashen',n:'✨ 化神之境',d:'修为达到化神境',r:4,cond:()=>realmIdx(S.lvl)>=6},
 {id:'evolve1',n:'🔮 奇招进化',d:'完成 1 次奇招进化合成',r:1,cond:()=>evolveCount>=1},
 {id:'evolve3',n:'💫 融会贯通',d:'完成 3 次奇招进化',r:3,cond:()=>evolveCount>=3},
 {id:'lover1',n:'❤️ 初恋修成正果',d:'达成 1 位恋人',r:2,cond:()=>mates.length>=1},
 {id:'harem',n:'👑 同时撩三人',d:'三位女主全部结缘',r:5,cond:()=>mates.length>=3},
 {id:'harem4',n:'🌌 修罗场大满贯',d:'四位女主全部结缘',r:5,cond:()=>mates.length>=4},
 {id:'ice_lover',n:'❄️ 冰心融雪',d:'夜冰好感拉满并结缘',r:4,cond:()=>mates.includes(3)&&affinity[3]>=AFF_MAX},
 {id:'assassin1',n:'🗡️ 拨雾见刃',d:'击败雾隐刺客 1 次',r:3,cond:()=>(SAVE.bosses.assassin||0)>=1},
 {id:'assassin3',n:'🌫️ 雾散人空',d:'击败雾隐刺客 3 次',r:4,cond:()=>(SAVE.bosses.assassin||0)>=3},
 {id:'title_max',n:'🏷️ 称号收藏家',d:'解锁修行传奇称号',r:5,cond:()=>totalAchPoints()>=100},
 {id:'solar1',n:'☀️ 射日者',d:'击败金乌 1 次',r:3,cond:()=>(SAVE.bosses.solar||0)>=1},
 {id:'solar3',n:'🏹 后羿传人',d:'击败金乌 3 次',r:4,cond:()=>(SAVE.bosses.solar||0)>=3},
 {id:'refine3',n:'✨ 精炼入门',d:'单局将任一掉落精炼至 +2',r:2,cond:()=>Math.max(0,...Object.values(ownedDrops||{0:0}))>=3},
 {id:'rain1',n:'🌧️ 踏雨而行',d:'击败雨神·潇湘 1 次',r:3,cond:()=>(SAVE.bosses.rain||0)>=1},
 {id:'rain3',n:'🌊 潇湘夜雨',d:'击败雨神 3 次',r:4,cond:()=>(SAVE.bosses.rain||0)>=3},
 {id:'affix10',n:'✦ 词条猎人',d:'累计获得 10 条装备词条',r:2,cond:()=>(SAVE.affixCount||0)>=10},
 {id:'affix_synth1',n:'✦ 初阶合成',d:'完成 1 次词条合成升阶',r:2,cond:()=>(SAVE.affixSynth||0)>=1},
 {id:'affix_lv3',n:'✦ 词条觉醒',d:'任一词条升阶至 Lv.3',r:3,cond:()=>awakenAffix()>=1},
 {id:'affix_lv5',n:'💎 词条圆满',d:'任一词条升阶至满级 Lv.5',r:4,cond:()=>perfectAffix()>=1},
 {id:'affix_all',n:'📚 词条收藏家',d:'集齐 10 种词条图鉴',r:4,cond:()=>affixCollected()>=AFFIXES.length},
 {id:'rank1',n:'🎖️ 榜上有名',d:'在任意排行榜留下 1 条记录',r:1,
  cond:()=>['normal','endless','daily','abyss'].some(c=>(((SAVE.ranks||{})[c])||[]).length>0)},
 {id:'gradeA',n:'📈 睥睨众生',d:'单局评级达到 A 级以上',r:3,cond:()=>comboGrade().g==='S'||comboGrade().g==='A'},
 {id:'puddle',n:'💧 水洼倒影',d:'在雨天/雷暴中击杀 30 名情敌',r:2,
  cond:()=>WEATHERS[envWeather]&&WEATHERS[envWeather].wet>=1&&S.kills>=30},
 {id:'gradeS',n:'🏅 修罗无我',d:'单局获得 S 级评价',r:5,cond:()=>comboGrade().g==='S'},
 {id:'allboss',n:'⚔️ 六王皆伏',d:'击败全部六位 Boss 各 1 次',r:5,
  cond:()=>BOSSES_DEF.filter(b=>(SAVE.bosses||{})[b.id]>0).length>=BOSSES_DEF.length},
 {id:'date8',n:'💞 情场老手',d:'累计约会 8 次',r:3,cond:()=>(SAVE.dateTotal||0)>=8},
 {id:'surv10',n:'⏱️ 十分钟不倒',d:'单局存活 10 分钟',r:3,cond:()=>S.time>=600},
 {id:'challenge5',n:'⚡ 挑战达人',d:'完成 5 次限时挑战',r:2,cond:()=>challengeWins>=5},
 {id:'chest10',n:'🎁 宝箱猎人',d:'累计开启 10 个宝箱',r:2,cond:()=>chestTotal>=10},
 {id:'scumbag',n:'😈 渣男本色',d:'单局渣男值满槽释放 5 次',r:3,cond:()=>ultCount>=5},
 {id:'daily1',n:'📅 今日打卡',d:'完成 1 局每日挑战',r:1,cond:()=>(SAVE.totalRuns||0)>=1},
 {id:'daily5',n:'🗓️ 坚持不懈',d:'累计完成 5 局（任意模式）',r:3,cond:()=>(SAVE.totalRuns||0)>=5},
 {id:'combo20',n:'🔥 二十连斩',d:'单局达成 20 连杀',r:3,cond:()=>comboBest>=20},
 {id:'combo50',n:'👑 渣男之神',d:'单局达成 50 连杀',r:5,cond:()=>comboBest>=50},
 {id:'endless1',n:'🌌 无尽之路',d:'Boss 无尽模式撑过 3 波 Boss',r:3,cond:()=>endlessBossKills>=3},
 {id:'endless5',n:'💀 无尽狂徒',d:'Boss 无尽模式撑过 8 波 Boss',r:5,cond:()=>endlessBossKills>=8},
 {id:'endless900',n:'🕳️ 无尽行者',d:'Boss 无尽模式单局存活 900 秒',r:4,cond:()=>gameMode==='endless'&&S.time>=900},
 {id:'awaken1',n:'💎 觉醒初醒',d:'首次觉醒一件武器',r:3,cond:()=>(SAVE.awakenTotal||0)>=1},
 {id:'awaken8',n:'✨ 八器通神',d:'将 8 件武器全部觉醒',r:5,cond:()=>(SAVE.awakenTotal||0)>=8},
 {id:'abyss1',n:'🕳️ 深渊叩门',d:'击败深渊之主 1 度',r:4,cond:()=>gameMode==='abyss'&&abyssBossKills>=1},
 {id:'abyss5',n:'🔥 虚空征服者',d:'击败深渊之主 5 度',r:5,cond:()=>gameMode==='abyss'&&abyssBossKills>=5},
 {id:'set2',n:'🎽 初成套装',d:'单局集齐任一 2 件套装',r:3,cond:()=>SETS.some(s=>s.members.filter(m=>(ownedDrops[m]||0)>0).length>=2)},
 {id:'set4',n:'🏵️ 套装大成',d:'单局集齐任一 4 件套（共鸣全开）',r:5,cond:()=>SETS.some(s=>s.members.filter(m=>(ownedDrops[m]||0)>0).length>=4)},
 {id:'storm',n:'⛈️ 雷雨行者',d:'在雷暴天气中击杀 60 名情敌',r:3,cond:()=>WEATHERS[envWeather]&&WEATHERS[envWeather].id==='storm'&&S.kills>=60},
 {id:'night60',n:'🌙 夜行者',d:'深夜时段存活累计 60 秒',r:2,cond:()=>DAY_PHASES[envPhase]&&DAY_PHASES[envPhase].id==='night'&&S.time>=60},
 {id:'thunder1',n:'⚡ 逆天而行',d:'击败雷暴限定的雷神',r:4,cond:()=>(SAVE.bosses.thunder||0)>=1},
 {id:'thunder3',n:'🌩️ 雷霆霸主',d:'击败雷神 3 次',r:5,cond:()=>(SAVE.bosses.thunder||0)>=3},
 {id:'ghost1',n:'🥊 超越自我',d:'首次击溃自己的影子',r:4,cond:()=>(SAVE.ghostWins||0)>=1},
 {id:'ghost3',n:'👤 三度照镜',d:'累计击溃影子 3 次',r:5,cond:()=>(SAVE.ghostWins||0)>=3},
 {id:'ghostcode',n:'🎟️ 隔空打脸',d:'击溃好友分享码生成的影子',r:5,cond:()=>(SAVE.ghostCodeWins||0)>=1},
 {id:'date5',n:'💞 情场老手',d:'累计完成 5 次约会',r:3,cond:()=>(SAVE.dateTotal||0)>=5},
 {id:'dateall',n:'💘 全城情人',d:'与三位女主全部达成恋人',r:5,cond:()=>mates.length>=3||SAVE.mates.length>=3},
 {id:'season2',n:'📅 赛季常客',d:'在两个赛季均有上榜记录',r:3,cond:()=>{const sr=SAVE.sRanks||{};
   return Object.keys(sr).filter(k=>Object.values(sr[k]||{}).some(a=>a.length>0)).length>=2;}},
 {id:'season3',n:'👑 赛季王者',d:'单赛季在 3 个模式均有上榜记录',r:4,cond:()=>{const s=(SAVE.sRanks||{})[seasonKey()]||{};
   return Object.keys(s).filter(c=>(s[c]||[]).length>0).length>=3;}},
 // v39 天气 Boss 线 + 新章节
 {id:'seal1',n:'🌀 印记初刻',d:'获得首个气候印记',r:3,cond:()=>climateSealCount()>=1},
 {id:'seal4',n:'🕛 四印齐聚',d:'集齐雷/雾/日/雨四系气候印记',r:5,cond:()=>climateAllSeals()},
 {id:'chronos1',n:'⏳ 时序挑战者',d:'击败四时之主·时序',r:5,cond:()=>(SAVE.bosses.chronos||0)>=1},
 {id:'frost1',n:'❄️ 极夜征服者',d:'在极夜冰原击败霜夜女王',r:4,cond:()=>(SAVE.bosses.frost||0)>=1},
 {id:'seaking1',n:'🔱 深海弑王',d:'击败深海海王·沧澜',r:4,cond:()=>(SAVE.bosses.seaking||0)>=1},
 {id:'ch6',n:'🌌 永夜旅人',d:'抵达第六章 · 极夜冰原',r:4,cond:()=>chapter>=5},
 {id:'climate3',n:'🌀 四季通感',d:'单次气候试炼连胜四时之主 3 度',r:5,cond:()=>(SAVE.bosses.chronos||0)>=3},
 {id:'sealAll16',n:'🌗 气候主宰',d:'四系印记各累计 3 枚以上',r:5,cond:()=>{const s=SAVE.climateSeals||{};
   return CLIMATE_SEALS.every(x=>(s[x.k]||0)>=3);}},
 // v41 宿命天赋
 {id:'fate1',n:'🌌 宿命初窥',d:'点亮任一宿命天赋',r:2,cond:()=>fateTotalLv()>=1},
 {id:'fate10',n:'🌠 五道并行',d:'宿命天赋累计 10 级',r:3,cond:()=>fateTotalLv()>=10},
 {id:'fate25',n:'✨ 五道圆满',d:'宿命天赋五道全部满级',r:5,cond:()=>fateAllMaxed()},
 {id:'fateUlt',n:'🌌 宿命共鸣',d:'激活终极共鸣',r:5,cond:()=>!!SAVE.fateUlt},
 // v42 新武器与合体
 {id:'w_new1',n:'🌪️ 舔到最后',d:'把舔狗冲锋升到满级',r:2,cond:()=>W.rush.lv>=5},
 {id:'w_new4',n:'🎭 四重人格',d:'单局同时拥有全部 4 把新武器',r:4,cond:()=>W.rush.lv>0&&W.burst.lv>0&&W.twin.lv>0&&W.curse.lv>0},
 {id:'fuse1',n:'🌈 初次合体',d:'完成任意一次武器合体',r:3,cond:()=>fusedCount()>=1},
 {id:'fuse4',n:'💥 万象归一',d:'单局完成全部 4 种合体',r:5,cond:()=>fusedCount()>=4},
 // v43 事件房
 {id:'gamble_win',n:'🎰 手气不错',d:'在赌坊房押上全部并赌赢',r:3,cond:()=>(SAVE.gambleWin||0)>=1},
 {id:'gamble_all',n:'🎲 亡命赌徒',d:'累计赌赢 5 次',r:4,cond:()=>(SAVE.gambleWin||0)>=5},
 {id:'altar1',n:'🕯️ 与魔鬼交易',d:'在祭坛房签下第一张契约',r:3,cond:()=>(SAVE.altarSign||0)>=1},
 {id:'portal1',n:'🌀 抄近路的人',d:'第一次穿过传送门',r:2,cond:()=>(SAVE.portalUse||0)>=1},
 {id:'night1',n:'🍜 深夜食堂常客',d:'在夜市房花经验买过小吃',r:2,cond:()=>(SAVE.nightBuy||0)>=1},
 {id:'twin1',n:'👯 双生终结者',d:'击破一对双生情敌',r:4,cond:()=>(SAVE.twinKill||0)>=1},
 // v44 第七章 · 婚宴修罗场
 {id:'ch7',n:'👰 赴宴的人',d:'抵达第七章 · 婚宴修罗场',r:4,cond:()=>chapter>=6},
 {id:'wedding1',n:'🎩 通过岳父这一关',d:'击败岳父大人·陈镇岳',r:4,cond:()=>(SAVE.bosses||{}).fatherinlaw>0},
 {id:'wedding2',n:'🎤 让前任闭嘴',d:'击败前任合唱团',r:4,cond:()=>(SAVE.bosses||{}).exchorus>0},
 {id:'wedding3',n:'🔔 拒绝这句誓词',d:'击败婚礼司仪·伪神',r:5,cond:()=>(SAVE.bosses||{}).emcee>0},
 {id:'weddingAll',n:'🎊 逃婚成功',d:'一局内连续通过婚宴三关',r:5,cond:()=>(SAVE.weddingBeaten||0)>=3},
];
const RARITY=[
 {n:'',col:'#8a7aa8',glow:'rgba(138,122,168,.4)'},
 {n:'普通',col:'#9ad0ff',glow:'rgba(154,208,255,.45)'},
 {n:'稀有',col:'#4cc9f0',glow:'rgba(76,201,240,.55)'},
 {n:'史诗',col:'#c77dff',glow:'rgba(199,125,255,.6)'},
 {n:'传说',col:'#ffd60a',glow:'rgba(255,214,10,.7)'},
 {n:'神话',col:'#ff4d6d',glow:'rgba(255,77,109,.75)'},
];
let bossKills=0,evolveCount=0,challengeWins=0,chestTotal=0,ultCount=0;
let endlessBossKills=0;let gameMode='normal';let waveNum=1;let redemption={hp:0,spd:0,weapon:0,scum:0};
const achQueue=[];let achT=0,achPop=0;
function checkAch(){for(const a of ACHIEVEMENTS){
    if(SAVE.achievements.includes(a.id))continue;
    let ok=false;try{ok=a.cond();}catch(e){}
    if(ok){SAVE.achievements.push(a.id);achQueue.push(a);}}}
function popAch(){if(!achQueue.length)return;
  const a=achQueue.shift();achPop=2.4;
  const el=document.getElementById('achToast');
  el.innerHTML=`<div class="at">🏅 成就达成</div><div class="an">${a.n}</div><div class="ad">${a.d}</div>`;
  el.style.opacity=1;el.style.transform='translateY(0)';
  setTimeout(()=>{el.style.opacity=0;el.style.transform='translateY(-16px)';},2400);
  writeSave();sfx.evo();
  try{refreshFate();}catch(e){}} // v41：新成就带来的点数即时可用于天赋

// ---------- Boss 图鉴 ----------
const BOSSES_DEF=[
 {id:'captain',n:'正牌男友军团长',icon:'👑',d:'金色双角，紫色光环，弹幕环/陨石/召唤三连',hp:900,
  where:'第一章 初恋校园 · 常规 Boss',hint:'弹幕环扩散前有 0.5s 蓄力，冲刺穿过可躲大半'},
 {id:'mother',n:'彩礼审判·丈母娘',icon:'💍',d:'婚礼章节限定，甩出天价彩礼账单冲击波',hp:1300,
  where:'第二章 都市夜战 · 常规 Boss',hint:'账单冲击波成扇形推进，往侧向切角最省力'},
 {id:'mirror',n:'命运镜像体',icon:'👤',d:'复制玩家的奇招，反噬你的所有套路',hp:1700,
  where:'第三章 婚礼逃亡 · 常规 Boss',hint:'它只会你已装备的招——别把爆发全交给自己'},
 {id:'abyss',n:'深渊之主',icon:'🕳️',d:'深渊试炼限定，吞噬并复制你已觉醒的奇招',hp:2600,
  where:'深渊试炼 · 专属 Boss',hint:'每度苏醒都会变强，觉醒招数越多它越难缠'},
 {id:'thunder',n:'雷神·风暴主宰',icon:'⚡',d:'雷暴天气限定，落雷链与静电场环绕',hp:2200,
  where:'雷暴天气 · 替代常规 Boss',hint:'落雷有地面圈预警，看到圈就往外跑，别贪刀'},
 {id:'assassin',n:'雾隐刺客',icon:'🗡️',d:'浓雾天气限定，潜行背刺与影分身',hp:1900,
  where:'浓雾天气 · 替代常规 Boss',hint:'它总从背后出现——边打边绕圈，别站定'},
 {id:'solar',n:'金乌·烈日当空',icon:'☀️',d:'白昼晴天限定，日光灼烧与三足金乌',hp:2400,
  where:'白昼晴天 · 替代常规 Boss',hint:'日光灼烧是持续掉血，站在阴影区能减少伤害'},
 {id:'rain',n:'雨神·潇湘',icon:'🌧️',d:'细雨天气限定，雨帘水幕与洪流冲击',hp:2050,
  where:'细雨天气 · 替代常规 Boss',hint:'水幕收拢前会有一圈提示，从缝里冲出去'},
 {id:'seaking',n:'深海海王·沧澜',icon:'🌊',d:'深海王座之主，珍珠环绕巨浪吞噬，情场浪子的终局镜像',hp:2800,
  where:'第四章 前任复仇 · 常规 Boss',hint:'漩涡会把你往里拽——反方向冲刺才能挣脱'},
 {id:'frost',n:'霜夜女王·凛',icon:'❄️',d:'极夜冰原之主，冰锥囚笼与极寒心冻，冻结你的每一次心动',hp:3100,
  where:'第五章 深海王座 · 常规 Boss',hint:'冰锥囚笼圈内伤害更低——被围住时往中心跑'},
 {id:'chronos',n:'四时之主·时序',icon:'🕛',d:'四印齐聚方可挑战，昼夜轮转与四季更迭皆为其权柄',hp:4200,
  where:'气候试炼 · 集齐四印解锁',hint:'它会借用当前相位的权柄——相位切换时是最好的输出窗口'},
 // ---- v44 第七章 · 婚宴修罗场 ----
 {id:'fatherinlaw',n:'岳父大人·陈镇岳',icon:'🎩',d:'婚宴第一关：敬酒冲击与家法板凳，一句「我女儿交给你了」重如千钧',hp:3600,
  where:'第七章 婚宴修罗场 · 第一关',hint:'敬酒杯是抛物线，看到杯子抬头就往前走在落点之外'},
 {id:'exchorus',n:'前任合唱团',icon:'🎤',d:'婚宴第二关：三重唱声波与回忆胶片，三个人一起唱你欠下的账',hp:3900,
  where:'第七章 婚宴修罗场 · 第二关',hint:'合唱必须站到侧翼打——正面吃三重共鸣伤害翻倍'},
 {id:'emcee',n:'婚礼司仪·伪神',icon:'🔔',d:'婚宴终关：伪神主持仪式，用「我愿意」把你钉在祭坛上',hp:4600,
  where:'第七章 婚宴修罗场 · 终关',hint:'「我愿意」是全屏判定，只有站到金圈边缘才能躲过'},
];
// ---------- v39 天气 Boss 线：气候印记 ----------
const CLIMATE_SEALS=[
 {k:'storm',n:'雷印',ic:'⚡',boss:'thunder',w:'雷暴',col:'#8ad4ff',tip:'雷暴天气击败雷神获得'},
 {k:'fog',  n:'雾印',ic:'🌫️',boss:'assassin',w:'浓雾',col:'#9aa8b8',tip:'浓雾天气击败雾隐刺客获得'},
 {k:'solar',n:'日印',ic:'☀️',boss:'solar',w:'白昼晴天',col:'#ffd60a',tip:'白昼晴天击败金乌获得'},
 {k:'rain', n:'雨印',ic:'🌧️',boss:'rain',w:'细雨',col:'#7fc4ff',tip:'细雨天气击败雨神获得'},
];
function climateSealCount(){const s=SAVE.climateSeals||{};return CLIMATE_SEALS.filter(x=>(s[x.k]||0)>0).length;}
function climateAllSeals(){return climateSealCount()>=4;}
function climateSealHud(){
  const s=SAVE.climateSeals||{};
  const got=climateSealCount();
  const parts=CLIMATE_SEALS.map(x=>{
    const n=s[x.k]||0;
    return `<span style="color:${n>0?x.col:'#4a3f5e'};${n>0?'text-shadow:0 0 8px '+x.col+'66':''}">${n>0?x.ic:'○'}</span>`;}).join('');
  return `${parts} ${got}/4`;
}
// ---------- v40 气候试炼：四时轮转 ----------
// 设计：气候试炼中天气不再随机，而是按「雷 → 雾 → 晴 → 雨」循环，每相 30s。
// 每一相都会给玩家一种可预期的增益/代价（见 CLIMATE_PHASES），四时之主则借用当前相位的权柄。
const CLIMATE_PHASES=[
 {k:'storm', ic:'⚡', n:'雷时',w:'storm', buff:'移速 +18% · 暴击 +8%',risk:'落雷伤害 ×1.25',
  fx:[['S','spd',1.18],['S','critC','+',.08],['D','hurtMul',1.25]]},
 {k:'fog',   ic:'🌫️', n:'雾时',w:'fog',  buff:'敌人视野混乱 · 掉落 +20%',risk:'视野受限（雾浓度 ×2）',
  fx:[['D','fogMul',2],['D','coinMul',1.2]]},
 {k:'solar', ic:'☀️', n:'晴时',w:'clear',buff:'攻击间隔 -12% · 回血 1.5/s',risk:'无（喘息之机）',
  fx:[['S','cdMul',.88],['S','regen','+',1.5]]},
 {k:'rain',  ic:'🌧️', n:'雨时',w:'rain', buff:'击杀经验 +25%',risk:'地面湿滑（移速 -8%）',
  fx:[['D','xpMul',1.25],['S','spd',.92]]},
];
let climatePhaseIdx=0,climatePhaseT=30,climatePhaseName='';
// v40.1 相位增益寄存器：记录本相施加的乘/加值，切相时精确回滚，避免 30s 一轮无脑叠 buff
let phaseBuffs=[];
function climatePhase(){
  if(gameMode!=='climate')return null;
  return CLIMATE_PHASES[climatePhaseIdx%CLIMATE_PHASES.length];}
function revertPhaseBuffs(){
  for(const b of phaseBuffs)b.obj[b.key]=b.from;
  phaseBuffs=[];
}
function initClimateTrial(){
  climatePhaseIdx=0;climatePhaseT=30;climatePhaseName='';
  phaseBuffs=[];               // 新一局的 S 是全新对象，旧寄存器引用作废
  envSkipWeather=true;         // 天气由相位驱动，不参与随机滚动
  applyClimatePhase(0,true);
}
// 相位增益统一走这里：先按下标回滚旧相位，再施加新相位，保证「当前相位的净效果 = 表里写的那一行」
function applyClimatePhase(i,silent){
  revertPhaseBuffs();
  climatePhaseIdx=i%CLIMATE_PHASES.length;
  const p=CLIMATE_PHASES[climatePhaseIdx];
  // 天气与昼夜同步到该相位（雷/雨对应 storm/rain，雾对应 fog，晴对应 clear+day）
  const wi=WEATHERS.findIndex(w=>w.id===p.w);if(wi>=0){envWeather=wi;}
  if(p.k==='solar'){envPhase=1;} // 晴时强制白昼
  envApply();
  // 按表施加增益并登记（表结构：[目标, 键, 乘数] 或 [目标, 键, '+', 加值]）
  for(const e of (p.fx||[])){
    const o=e[0]==='S'?S:D;
    const from=o[e[1]];
    if(e.length===4&&e[2]==='+')o[e[1]]=(from||0)+e[3];
    else o[e[1]]=from*e[2];
    phaseBuffs.push({obj:o,key:e[1],from});
  }
  climatePhaseName=p.n;
  if(!silent){
    tip(`${p.ic} ${p.n}降临 · ${p.buff}`);
    setTimeout(()=>{if(S.alive&&gameMode==='climate')tip(`⚠️ ${p.k==='solar'?'喘息之机':p.risk}`);},2200);
    burst(player.position,{storm:0x8ad4ff,fog:0x9aa8b8,solar:0xffd60a,rain:0x7fc4ff}[p.k]||0xffffff,26,12);
    sfx.evo();
    setTimeout(()=>meetOnce('phase'),900); // v48：第一次换相时解释这套机制
  }
  refreshClimatePhaseUI();
}
function updateClimatePhase(dt){
  if(gameMode!=='climate'||!started||hardPause||!S.alive)return;
  climatePhaseT-=dt;
  if(climatePhaseT<=0){
    climatePhaseT=30;
    applyClimatePhase(climatePhaseIdx+1,false);
  }
}
function refreshClimatePhaseUI(){
  const el=document.getElementById('climatePhase');
  if(!el)return;
  if(gameMode!=='climate'){el.style.display='none';return;}
  const p=climatePhase(),nxt=CLIMATE_PHASES[(climatePhaseIdx+1)%CLIMATE_PHASES.length];
  el.style.display='block';
  el.innerHTML=`<span class="cpIc">${p.ic}</span><span class="cpN">${p.n}</span>
    <span class="cpT">${Math.ceil(climatePhaseT)}s</span>
    <span class="cpNext">→ ${nxt.ic}${nxt.n}</span>`;
}

function bossForChapter(){
  // 章节 → Boss 索引映射（v44：七章各自专属，不重复）
  const c=chapter%7;
  if(c===1)return 1;      // 第二章 → 丈母娘
  if(c===2)return 2;      // 第三章 → 命运镜像体
  if(c===3)return 8;      // 第四章 → 深海海王
  if(c===4)return 9;      // 第五章 → 霜夜女王
  if(c===5)return 6;      // 第六章 → 金乌（极夜中的烈日，反差收束）
  if(c===6)return 11;     // 第七章 → 岳父大人（三连战第一关）
  return 0;               // 第一章 → 军团长
}
// v44：第七章「婚宴修罗场」三连战——同一章内按击杀数依次递进
const WEDDING_ORDER=['fatherinlaw','exchorus','emcee'];
function weddingBossId(){
  const i=Math.min(weddingKills,WEDDING_ORDER.length-1);
  return WEDDING_ORDER[i];
}
let weddingKills=0;
function chapterBossId(){
  if((chapter%7)===6)return weddingBossId();
  return BOSSES_DEF[bossForChapter()].id;
}
function renderClimateBar(){
  const el=document.getElementById('climateBar');if(!el)return;
  const s=SAVE.climateSeals||{};const got=climateSealCount();const full=got>=4;
  const icons=CLIMATE_SEALS.map(x=>{
    const n=s[x.k]||0;
    return `<span title="${x.n} · ${x.tip}" style="color:${n>0?x.col:'#4a3f5e'};font-size:15px;${n>0?'text-shadow:0 0 8px '+x.col:''}">${n>0?x.ic:'○'}</span>`;}).join(' ');
  el.innerHTML=`<div class="cb ${full?'full':''}">
    <span class="cbn">气候印记</span> ${icons} <span style="color:${full?'#ffd60a':'#8ab4ff'}">${got}/4</span>
    ${SAVE.climateKills?`<span style="color:#6a5a8a;font-size:10.5px"> · 已斩天气 Boss ×${SAVE.climateKills}</span>`:''}
    ${full?`<button class="cbtn" id="climateChal">挑战四时之主</button>`:''}
  </div>`;
  const b=document.getElementById('climateChal');
  if(b)b.onclick=()=>{
    if(!climateAllSeals()){tip('需要集齐四系气候印记');return;}
    gameMode='climate';document.getElementById('startBtn').click();};
}
function renderSealCodex(){
  const el=document.getElementById('sealList');if(!el)return;
  const s=SAVE.climateSeals||{};const got=climateSealCount();
  const sv=document.getElementById('svSeal');if(sv)sv.textContent=` ${got}/4`;
  el.innerHTML=CLIMATE_SEALS.map(x=>{
    const n=s[x.k]||0,on=n>0;
    return `<div class="cx ${on?'':'lock'}" style="cursor:default">
      <span class="ci" style="color:${on?x.col:'#4a3f5e'};${on?'text-shadow:0 0 10px '+x.col:''}">${on?x.ic:'○'}</span>
      <div style="flex:1"><div class="cn">${on?x.ic+' '+x.n:'未获得'}</div>
      <div class="cd">${on?'已在 '+x.w+' 中击败 '+BOSSES_DEF.find(b=>b.id===x.boss).n:'需在'+x.w+'天气中击败 '+BOSSES_DEF.find(b=>b.id===x.boss).n}</div>
      </div><div class="ck">×${n}</div></div>`;}).join('')+
    `<div class="cd" style="padding:8px 12px;color:${got>=4?'#ffd60a':'#8a7aa8'};font-size:11.5px;line-height:1.7">
      ${got>=4?'✨ 四印齐聚——「挑战四时之主」已在开始界面点亮':'集齐 ⚡雷印 · 🌫️雾印 · ☀️日印 · 🌧️雨印 即可解锁气候试炼'}</div>`;
}
function renderCodex(){const h=SAVE.bosses||{};
  document.getElementById('codexList').innerHTML=BOSSES_DEF.map((b,i)=>{
    const k=h[b.id]||0;const got=k>0;
    return `<div class="cx ${got?'':'lock'}" data-bid="${got?b.id:''}" style="cursor:${got?'pointer':'default'}">
      <span class="ci" data-view="${got?i:-1}">${got?'🔄':'❓'}</span>
      <div style="flex:1"><div class="cn">${got?b.n:'未解锁'}</div>
      <div class="cd">${got?b.d:'击败后解锁图鉴'}</div>
      ${got?`<div class="cd" style="color:#8a7aa8;font-size:11px;margin-top:2px">📍 ${b.where||'—'} · ❤️ ${b.hp} HP</div>`:''}
      ${got&&b.hint?`<div class="cd" style="color:#ffd60a;font-size:11px;margin-top:2px">💡 ${b.hint}</div>`:''}
      ${got?`<div class="cd" style="color:#ffd60a;margin-top:3px">点击 🔄 查看 3D 立绘</div>`:''}</div>
      <div class="ck">×${k}</div></div>`;}).join('');
  document.querySelectorAll('#codexList .ci[data-view]').forEach(el=>{
    if(+el.dataset.view>=0)el.onclick=()=>openBossViewer(+el.dataset.view);});}
// ---------- Boss 3D 立绘旋转展示 ----------
let bossViewScene=null,bossViewRaf=0;
function openBossViewer(idx){
  const def=BOSSES_DEF[idx];if(!def)return;
  let ov=document.getElementById('bossViewer');
  if(!ov){ov=document.createElement('div');ov.id='bossViewer';
    ov.innerHTML=`<div class="bvBox"><canvas id="bvCanvas"></canvas>
      <div class="bvName"></div><div class="bvDesc"></div>
      <div class="bvHint">拖动旋转 · 双指缩放 · 点击空白关闭</div></div>`;
    document.body.appendChild(ov);}
  const cv=ov.querySelector('#bvCanvas');
  ov.querySelector('.bvName').textContent=def.icon+' '+def.n;
  ov.querySelector('.bvDesc').textContent=def.d;
  ov.style.display='flex';
  // 独立渲染器
  if(bossViewRaf)cancelAnimationFrame(bossViewRaf);
  const W2=Math.min(300,innerWidth-80),H2=W2;
  cv.width=W2*2;cv.height=H2*2;cv.style.width=W2+'px';cv.style.height=H2+'px';
  let rn;
  try{rn=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});}
  catch(e){ov.querySelector('.bvHint').textContent='⚠ 当前设备不支持 3D 预览';return;}
  rn.setPixelRatio(2);rn.setSize(W2,H2,false);
  rn.outputEncoding=THREE.sRGBEncoding;rn.toneMapping=THREE.ACESFilmicToneMapping;rn.toneMappingExposure=1.15;
  const sc=new THREE.Scene();
  const cam=new THREE.PerspectiveCamera(38,W2/H2,.1,100);
  cam.position.set(0,3.2,9);cam.lookAt(0,2.2,0);
  // 旋转地台 + 灯光
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(3,3.2,.5,32),
    new THREE.MeshStandardMaterial({color:0x1a0b26,metalness:.8,roughness:.35,
      emissive:0x3a0a5a,emissiveIntensity:.4}));
  pedestal.position.y=-.25;sc.add(pedestal);
  const ringGlow=new THREE.Mesh(new THREE.TorusGeometry(3.05,.08,8,48),
    new THREE.MeshBasicMaterial({color:0xffd60a,transparent:true,opacity:.7}));
  ringGlow.rotation.x=Math.PI/2;ringGlow.position.y=.02;sc.add(ringGlow);
  sc.add(new THREE.AmbientLight(0xffffff,.55));
  const k1=new THREE.DirectionalLight(0xffd6f7,1.3);k1.position.set(5,8,6);sc.add(k1);
  const k2=new THREE.PointLight(def.id==='mother'?0xffd60a:def.id==='mirror'?0x4cc9f0:0xff006e,2,20);
  k2.position.set(-4,4,-4);sc.add(k2);
  // 星空点缀
  const stars=new THREE.Group();
  for(let i=0;i<40;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(.05,4,4),
    new THREE.MeshBasicMaterial({color:0xffe9a8,transparent:true,opacity:.5}));
    const a=Math.random()*6.283,r=4+Math.random()*3;
    s.position.set(Math.cos(a)*r,Math.random()*6-.5,Math.sin(a)*r);stars.add(s);}
  sc.add(stars);
  // 用游戏内 mkEnemy 生成 Boss 模型（克隆材质以独立显示）
  _pendingBossId=def.id;const e=mkEnemy('boss',true);_pendingBossId=null;
  scene.remove(e);if(enemies.length&&enemies[enemies.length-1]===e)enemies.pop();
  e.position.set(0,0,0);e.rotation.y=0;
  e.userData.j&&(e.userData.j.robe&&(e.userData.j.robe.castShadow=false));
  sc.add(e);
  bossViewScene={rn,sc,cam,e,ringGlow,stars,angle:0};
  // 交互：拖动旋转
  let drag=false,lx=0,autoSpin=true;
  const getX=ev=>ev.touches?ev.touches[0].clientX:ev.clientX;
  cv.onpointerdown=ev=>{drag=true;autoSpin=false;lx=getX(ev);cv.setPointerCapture&&cv.setPointerCapture(ev.pointerId);};
  cv.onpointermove=ev=>{if(!drag)return;const x=getX(ev);e.rotation.y+=(x-lx)*.02;lx=x;};
  cv.onpointerup=cv.onpointercancel=cv.onpointerleave=()=>{drag=false;setTimeout(()=>autoSpin=true,1200);};
  ov.onclick=ev=>{if(ev.target===ov)closeBossViewer();};
  cv._autoSpin=()=>autoSpin;
  function loop(){if(!bossViewScene)return;
    const bs=bossViewScene;
    if(cv._autoSpin())bs.angle+=.01;
    bs.e.rotation.y+= (cv._autoSpin()? .012: 0);
    bs.e.position.y=Math.sin(performance.now()/600)*.08;
    bs.ringGlow.rotation.z+=.01;
    bs.stars.rotation.y+=.003;
    bs.cam.position.y=3.2+Math.sin(performance.now()/900)*.25;
    bs.cam.lookAt(0,2.2,0);
    bs.rn.render(bs.sc,bs.cam);
    bossViewRaf=requestAnimationFrame(loop);}
  loop();
  sfx.pick&&sfx.pick();}
function closeBossViewer(){
  if(bossViewRaf)cancelAnimationFrame(bossViewRaf);bossViewRaf=0;
  const ov=document.getElementById('bossViewer');if(ov)ov.style.display='none';
  bossViewScene=null;}
let achFilter='all'; // 成就墙筛选（v26）
const ACH_CAT={ // 分类：boss=Boss相关, love=情缘相关
  boss:['boss1','boss3','abyss1','abyss5','thunder1','thunder3','assassin1','assassin3','solar1','solar3','allboss'],
  love:['lover1','harem','harem4','ice_lover','date5','dateall','date8','set2','set4'],
};
function achMatched(a){
  const got=SAVE.achievements.includes(a.id);
  if(achFilter==='got')return got;
  if(achFilter==='lock')return !got;
  if(achFilter==='boss')return (ACH_CAT.boss||[]).includes(a.id)||/Boss|王|日|雷|雾/.test(a.d);
  if(achFilter==='love')return (ACH_CAT.love||[]).includes(a.id)||/好感|恋人|约会|结缘|少女/.test(a.d)||/❤️|💕|💞|❄️|🍷|🍬/.test(a.n);
  return true;}
function renderAchList(){
  const el=document.getElementById('achList');
  // 徽章墙：网格 + 稀有度描边 + 收集进度
  const got=SAVE.achievements;
  el.innerHTML=ACHIEVEMENTS.filter(achMatched).map(a=>{
    const has=got.includes(a.id);
    const r=RARITY[Math.min(a.r||1,RARITY.length-1)]||RARITY[1];
    return `<div class="badge ${has?'':'lock'}" style="${has?`border-color:${r.col};box-shadow:0 0 10px ${r.glow}`:''}"
      title="${a.d}（${r.n||'普通'}）">
      <div class="bic" style="${has?'':`filter:grayscale(1);opacity:.45`}">${a.n.split(' ')[0]}</div>
      <div class="bn">${a.n.split(' ').slice(1).join(' ')}</div>
      <div class="br" style="color:${has?r.col:'#5a4a68'}">${has?(r.n||'普通'):'未解锁'}</div>
    </div>`;}).join('')+
    (ACHIEVEMENTS.filter(achMatched).length?'':'<div style="grid-column:1/-1;text-align:center;color:#8a7aa8;padding:22px;font-size:13px">🕳️ 该分类暂无成就</div>')+
    `<div class="badgeProg">🏅 收集进度 <b style="color:#ffd60a">${got.length}/${ACHIEVEMENTS.length}</b>`+
    (got.length===ACHIEVEMENTS.length?' · <span style="color:#ff4d6d">👑 全收集达成！</span>':'')+'</div>';}
function renderDaily(){
  const el=document.getElementById('dailyList');if(!el)return;
  if(!dailyMod){el.innerHTML='';return;}
  const k=dailyKey(),sc=(SAVE.daily||{})[k]||0;
  const d=new Date(),ds=`${d.getMonth()+1}月${d.getDate()}日`;
  el.innerHTML=`<div class="cx"><span class="ci">📅</span><div style="flex:1">
    <div class="cn">${dailyMod.n}</div><div class="cd">${dailyMod.d}</div>
    <div class="cd" style="color:#ffd60a;margin-top:4px">${ds} · 今日最高分 ${sc}</div></div>
    <div class="ck">3 项</div></div>
    <div class="cd" style="padding:8px 12px;color:#9ad0ff">每日 0 点刷新 · 全服同条件公平竞速</div>`;}
function refreshSaveUI(){
  document.getElementById('svRealm').textContent=SAVE.best.realm;
  document.getElementById('svKills').textContent=SAVE.best.kills;
  document.getElementById('svRuns').textContent=SAVE.totalRuns;
  document.getElementById('svAch').textContent=SAVE.achievements.length+'/'+ACHIEVEMENTS.length;
  {const st=document.getElementById('svTitle');
   if(st){const t=currentTitle();st.innerHTML=`🏷️ 当前称号：<b>${t.n}</b> <span style="color:#8a7aa8;font-size:11px">（${t.d}）</span>`;}}
  const bd=SAVE.bosses||{};document.getElementById('svBoss').textContent=
    BOSSES_DEF.filter(b=>(bd[b.id]||0)>0).length+'/'+BOSSES_DEF.length;
  const dc=SAVE.dropCodex||{};const sd=document.getElementById('svDrop');
  if(sd)sd.textContent=DROPS.filter(d=>(dc[d.id]||0)>0).length+'/'+DROPS.length;
  renderCodex();try{renderSealCodex();}catch(e){console.warn('[SEAL]',e);}renderAchList();renderDaily();renderRank();refreshShop();renderDropCodex();renderAffixCodex();try{renderManual();}catch(e){console.warn('[MANUAL]',e);}bindRankTabs();
  meetOnce('bossHint'); // v48：第一次打开图鉴时提示「打法写在图鉴里」
  settleSeason();renderSeasonBar(); // v34：赛季结算与横幅
  if(typeof renderCheckin==='function')renderCheckin();}
// 排行榜分类切换（由 refreshSaveUI 在存档加载后首次调用时绑定）
let rankTabsBound=false;
function bindRankTabs(){if(rankTabsBound)return;rankTabsBound=true;
  const tb=document.getElementById('rankTabs');if(!tb)return;
  tb.querySelectorAll('.ctab').forEach(b=>{
    b.onclick=()=>{SAVE.rankCat=b.dataset.m;writeSave();
      tb.querySelectorAll('.ctab').forEach(x=>x.classList.toggle('on',x===b));renderRank();};});
  tb.querySelectorAll('.ctab').forEach(b=>b.classList.toggle('on',b.dataset.m===(SAVE.rankCat||'normal')));
  // 成就墙筛选（v26）
  const at=document.getElementById('achTabs');
  if(at)at.querySelectorAll('.ctab').forEach(b=>{
    b.onclick=()=>{achFilter=b.dataset.f;
      at.querySelectorAll('.ctab').forEach(x=>x.classList.toggle('on',x===b));renderAchList();};});}

// ---------- 每日挑战（日期种子 · 全服同条件） ----------
const DAILY_MODS=[
 {id:'thin',n:'🥗 清汤寡水',d:'敌人血量 -25%，但数量 +40%'},
 {id:'fat',n:'🍖 油水太足',d:'敌人血量 +35%，掉落经验 +50%'},
 {id:'rush',n:'⏱️ 兵贵神速',d:'敌人移速 +30%，结算分数 +30%'},
 {id:'glass',n:'🥂 玻璃大炮',d:'我方伤害 +50%，受到伤害 +40%'},
 {id:'sloth',n:'🐌 慢生活',d:'敌人移速 -20%，攻击冷却 +35%'},
 {id:'swarmy',n:'🐜 蚁群汹涌',d:'每波敌人 +60%'},
 {id:'elite',n:'💎 精英横行',d:'精英出现率 15%→45%'},
 {id:'bossrush',n:'👑 首脑强袭',d:'Boss 血量 +30%，提前 30% 出现'},
];
// 日期种子伪随机（mulberry32）
function seedRng(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;};}
function dailySeed(){const d=new Date();
  return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();}
let dailyMod=null,dailyBest=0;
// 修正系数容器（每日挑战用）
const D={dmgMul:1,hpMul:1,spdMul:1,bulletCdMul:1,speedMul:1,eliteRate:.15,bossEarly:1,bossHpMul:1,waveMul:1,xpMul:1,hurtMul:1,cdMul:1,scoreMul:1,fogMul:1};
function resetD(){Object.assign(D,{dmgMul:1,hpMul:1,spdMul:1,bulletCdMul:1,speedMul:1,eliteRate:.15,bossEarly:1,bossHpMul:1,waveMul:1,xpMul:1,hurtMul:1,cdMul:1,scoreMul:1,fogMul:1,coinMul:1});
  curSeason().f(D);} // v34：重置后施加当期赛季加成
function rollDaily(){
  const day=Math.floor(dailySeed()/1)+0; // 每天一个
  const rng=seedRng(day*2654435761>>>0);
  const idx=Math.floor(rng()*DAILY_MODS.length);
  dailyMod=DAILY_MODS[idx];
  dailyBest=(SAVE.daily&&SAVE.daily[day])||0;
  return dailyMod;}
function dailyKey(){return String(dailySeed());}
function recordDaily(score){
  const k=dailyKey();SAVE.daily=SAVE.daily||{};
  if(score>(SAVE.daily[k]||0)){SAVE.daily[k]=score;dailyBest=score;writeSave();return true;}
  return false;}
// 每日加分（本局表现折算）
function dailyScore(){return Math.floor(S.kills*10+S.time*2+S.lvl*50+comboBest*5);}
// 应用每日修正到敌人
function applyDailyMods(){
  if(!dailyMod)return;
  resetD();
  switch(dailyMod.id){
    case'thin':D.hpMul=.75;D.waveMul=1.4;break;
    case'fat':D.hpMul=1.35;D.xpMul=1.5;break;
    case'rush':D.spdMul=1.3;D.scoreMul=1.3;break;
    case'glass':D.dmgMul=1.5;D.hurtMul=1.4;break;
    case'sloth':D.spdMul=.8;D.cdMul=1.35;break;
    case'swarmy':D.waveMul=1.6;break;
    case'elite':D.eliteRate=.45;break;
    case'bossrush':D.bossHpMul=1.3;D.bossEarly=.7;break;}}

// ---------- 周赛主题轮换（每周一词条 · 专属奖励） ----------
// 周次编号（ISO 近似）：以 2024-01-01(周一) 为第 0 周起算
function weekIndex(){
  const base=Date.UTC(2024,0,1),now=Date.now();
  return Math.floor((now-base)/(7*86400000));}
const WEEK_MODS=[
 {id:'w_berserk',ic:'🔥',n:'狂暴之周',d:'敌我伤害同时 +50%，拼的就是手速',score:.8,scum:60},
 {id:'w_iron',ic:'🛡️',n:'铁壁之周',d:'我方受伤 -40%，但敌人血量 +60%',score:.9,scum:60},
 {id:'w_greed',ic:'💎',n:'贪婪之周',d:'经验 +80%，但精英出现率翻倍',score:.85,scum:60},
 {id:'w_swift',ic:'🌪️',n:'疾风之周',d:'全体移速 +35%，战场瞬息万变',score:.85,scum:60},
 {id:'w_horde',ic:'🐜',n:'浪潮之周',d:'每波敌人 +90%，火力覆盖压制',score:.75,scum:60},
 {id:'w_boss',ic:'👑',n:'首脑之周',d:'Boss 血量 +50% 且提前 40% 降临',score:.9,scum:60},
 {id:'w_purist',ic:'⚔️',n:'苦修之周',d:'技能冷却 +30%，冷却中的坚持',score:1.0,scum:60},
 {id:'w_chaos',ic:'🎲',n:'混沌之周',d:'综合主题：敌强我强，分数 +20%',score:1.2,scum:60},
];
const WEEK_REWARD={
 w_berserk:'🔥【狂暴徽记】起始渣男值 +40',
 w_iron:'🛡️【铁壁徽记】开局护甲 +3',
 w_greed:'💎【贪婪徽记】开局经验 +30',
 w_swift:'🌪️【疾风徽记】开局移速 +8%',
 w_horde:'🐜【浪潮徽记】开局拾取范围 +60%',
 w_boss:'👑【首脑徽记】对 Boss 伤害 +25%',
 w_purist:'⚔️【苦修徽记】开局暴击率 +8%',
 w_chaos:'🎲【混沌徽记】开局全属性小加成',
};
let weekMod=null,weekBest=0,weekCleared=false;
function rollWeek(){
  const wi=weekIndex(),rng=seedRng((wi*1013904223)>>>0);
  weekMod=WEEK_MODS[Math.floor(rng()*WEEK_MODS.length)];
  SAVE.weeks=SAVE.weeks||{};
  weekBest=SAVE.weeks[wi]||0;
  const cl=SAVE.weekClear||{};
  weekCleared=!!cl[weekMod.id];
  return weekMod;}
function weekKey(){return weekIndex();}
function weekScore(){return Math.floor(dailyScore()*(weekMod?weekMod.score:1));}
function recordWeek(score,cleared){
  const wi=weekKey();SAVE.weeks=SAVE.weeks||{};
  let better=false;
  if(score>(SAVE.weeks[wi]||0)){SAVE.weeks[wi]=score;weekBest=score;better=true;}
  if(cleared){SAVE.weekClear=SAVE.weekClear||{};if(!SAVE.weekClear[weekMod.id]){
    SAVE.weekClear[weekMod.id]=1;weekCleared=true;better=true;
    setTimeout(()=>tip(`🏅 周赛首次通关！${WEEK_REWARD[weekMod.id]}`),1400);}}
  if(better)writeSave();
  return better;}
function applyWeekMods(){
  if(!weekMod)return;
  switch(weekMod.id){
    case'w_berserk':D.dmgMul*=1.5;D.hurtMul*=1.5;break;
    case'w_iron':D.hurtMul*=.6;D.hpMul*=1.6;break;
    case'w_greed':D.xpMul*=1.8;D.eliteRate=Math.min(.9,D.eliteRate*2);break;
    case'w_swift':D.spdMul*=1.35;break;
    case'w_horde':D.waveMul*=1.9;break;
    case'w_boss':D.bossHpMul*=1.5;D.bossEarly*=.6;break;
    case'w_purist':D.cdMul*=1.3;break;
    case'w_chaos':D.dmgMul*=1.2;D.hpMul*=1.2;D.spdMul*=1.15;D.scoreMul*=1.2;D.eliteRate=Math.min(.9,D.eliteRate*1.4);break;}}
// 通关周赛（击溃 Boss / 达成 10 分钟）后获得的周赛徽记增益
function applyWeekReward(){
  const cl=SAVE.weekClear||{};const got=Object.keys(WEEK_REWARD).filter(k=>cl[k]);
  if(!got.length)return;
  for(const k of got){switch(k){
    case'w_berserk':S.scum=Math.min(100,S.scum+40);break;
    case'w_iron':S.armor+=3;break;
    case'w_greed':gainXp(30);break;
    case'w_swift':S.spd*=1.08;break;
    case'w_horde':S.pickR*=1.6;break;
    case'w_boss':S.bossDmgMul=(S.bossDmgMul||1)*1.25;break;
    case'w_purist':S.critC+=.08;break;
    case'w_chaos':S.maxHp+=30;S.hp=S.maxHp;S.spd*=1.05;S.dmgMul*=1.05;break;}}
  setTimeout(()=>tip(`🏅 周赛徽记 ×${got.length} 生效`),1200);}

// ---------- 每日签到（连续登录送成就点数） ----------
// 签到奖励阶梯：连续第 N 天的奖励
const CHECKIN_REWARDS=[
 {d:1,pts:2,ic:'🎁',dsc:'成就点数 +2'},
 {d:2,pts:3,ic:'🎁',dsc:'成就点数 +3'},
 {d:3,pts:4,ic:'💠',dsc:'成就点数 +4 + 额外碎片'},
 {d:4,pts:5,ic:'🎁',dsc:'成就点数 +5'},
 {d:5,pts:6,ic:'🌹',dsc:'成就点数 +6 + 开局玫瑰 Lv.2'},
 {d:6,pts:8,ic:'👑',dsc:'成就点数 +8 + 开局渣值 +30'},
 {d:7,pts:15,ic:'🏆',dsc:'大奖！成就点数 +15 + 全局buff'},
];
function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function yesterdayKey(){const d=new Date(Date.now()-86400000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
// ---------- v34 赛季系统：每周一轮换主题加成 + 赛季榜 + 赛季结算 ----------
function seasonKey(){const d=new Date(),t=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  t.setDate(t.getDate()+3-((t.getDay()+6)%7)); // 本周周四（ISO 周锚点）
  const jan4=new Date(t.getFullYear(),0,4);
  const wk=1+Math.round(((t-jan4)/86400000-3+((jan4.getDay()+6)%7))/7);
  return t.getFullYear()+'-S'+String(wk).padStart(2,'0');}
const SEASON_BUFFS=[
  {ic:'🌸',n:'桃花季',d:'精英情敌出现率 +60%（击杀收益更高）',f:D=>{D.eliteRate=Math.min(.9,D.eliteRate*1.6);}},
  {ic:'🎓',n:'慧根季',d:'经验获取 +25%（升级更快）',f:D=>{D.xpMul*=1.25;}},
  {ic:'💰',n:'富豪季',d:'心币产出 +35%（商店更宽裕）',f:D=>{D.coinMul*=1.35;}},
  {ic:'🔥',n:'狂热季',d:'输出伤害 +15%（打击更爽快）',f:D=>{D.dmgMul*=1.15;}},
  {ic:'🛡️',n:'铁壁季',d:'受到伤害 -15%（更耐揍）',f:D=>{D.hurtMul*=.85;}},
  {ic:'⭐',n:'名声季',d:'结算得分 +20%（冲榜更快）',f:D=>{D.scoreMul*=1.2;}}];
function curSeason(){const k=seasonKey();let h=0;
  for(let i=0;i<k.length;i++)h=(h*31+k.charCodeAt(i))>>>0;
  const b=SEASON_BUFFS[h%SEASON_BUFFS.length];
  return {key:k,num:/S(\d+)/.exec(k)[1],ic:b.ic,n:b.n,d:b.d,f:b.f};}
function renderSeasonBar(){const el=document.getElementById('seasonBar');if(!el)return;const s=curSeason();
  el.innerHTML=`<div class="dm"><span class="dmt">${s.key} · 每周一 0 点轮换</span>`+
    `<span class="dmn">${s.ic} ${s.n}</span>`+
    `<span class="dmd">赛季加成：${s.d}</span></div>`;}
function settleSeason(){const cur=seasonKey();
  if(SAVE.lastSeason&&SAVE.lastSeason!==cur){
    const prev=SAVE.lastSeason,sr=(SAVE.sRanks||{})[prev]||{};
    let cats=0;for(const c of ['normal','endless','daily','abyss','ghost'])if((sr[c]||[]).length)cats++;
    if(cats>0){addAwakenStone(cats*2,`S${/S(\d+)/.exec(prev)[1]} 赛季结算`);
      SAVE.seasonChamps=SAVE.seasonChamps||{};SAVE.seasonChamps[prev]=cats;}}
  // 赛季榜只保留当前 + 上一赛季
  if(SAVE.sRanks){const ks=Object.keys(SAVE.sRanks).sort();
    while(ks.length>2)delete SAVE.sRanks[ks.shift()];}
  SAVE.lastSeason=cur;}
function checkinAvailable(){const ci=SAVE.checkin||{};return ci.last!==todayKey();}
function doCheckin(){
  const ci=SAVE.checkin=SAVE.checkin||{last:'',streak:0,total:0,day:'',week:'',rew:{}};
  const tk=todayKey();
  if(ci.last===tk)return null;
  // 连续判断：昨天签到过则 streak+1，否则重置为 1
  ci.streak=(ci.last===yesterdayKey())?Math.min(7,(ci.streak||0)+1):1;
  ci.last=tk;ci.total=(ci.total||0)+1;
  const idx=Math.min(CHECKIN_REWARDS.length-1,ci.streak-1);
  const rw=CHECKIN_REWARDS[idx];
  // 签到奖励点数进入独立池（额外可支配点数）
  SAVE.bonusPts=(SAVE.bonusPts||0)+rw.pts;
  ci.rew[todayKey()]=idx+1;
  if(idx===4)ci.bonusRose=1;
  if(idx===5)ci.bonusScum=30;
  if(idx===6){ci.bonusAll=1;}
  writeSave();refreshSaveUI();renderCheckin();
  sfx.evo();tip(`📅 签到成功！连续 ${ci.streak} 天 · ${rw.dsc}`);
  setTimeout(()=>showCheckinCard(ci.streak,rw),600);
  return rw;}
function renderCheckin(){
  const el=document.getElementById('checkinBox');if(!el)return;
  const ci=SAVE.checkin||{streak:0,total:0,last:''};
  const avail=checkinAvailable();
  const cur=ci.last===todayKey()?ci.streak:(ci.last===yesterdayKey()?Math.min(7,(ci.streak||0)+1):1);
  el.innerHTML=`<div class="ckTitle">📅 每日签到 <span class="ckSub">连续 ${ci.streak} 天 · 累计 ${ci.total||0} 次</span></div>
    <div class="ckDots">${CHECKIN_REWARDS.map((r,i)=>{
      const got=i<ci.streak;
      return `<div class="ckDot ${got?'got':''} ${i===cur-1&&avail?'cur':''}" title="${r.dsc}">
        <span class="cdi">${got?r.ic:r.d}</span><span class="cdp">+${r.pts}</span></div>`;}).join('')}</div>
    <button id="checkinBtn" ${avail?'':'disabled'}>${avail?(ci.streak>0?`签到 · 第 ${cur} 天`:'今日签到'):'✅ 今日已签到'}</button>`;
  const btn=el.querySelector('#checkinBtn');
  if(btn&&avail)btn.onclick=()=>doCheckin();
}
function showCheckinCard(streak,rw){
  let el=document.getElementById('checkinToast');
  if(!el){el=document.createElement('div');el.id='checkinToast';document.body.appendChild(el);}
  el.innerHTML=`<div class="ct-t">📅 第 ${streak} 天签到</div>
    <div class="ct-ic">${rw.ic}</div><div class="ct-d">${rw.dsc}</div>
    ${streak>=7?'<div class="ct-b">🏆 满勤达成！</div>':''}`;
  el.style.opacity=1;el.style.transform='translate(-50%,-50%) scale(1)';
  setTimeout(()=>{el.style.opacity=0;el.style.transform='translate(-50%,-50%) scale(.85)';},2400);}

// ---------- 分享码对战（同条件种子好友对拼） ----------
// 分享码格式：ZNTX-<模式码><难度码><6位校验>
const SHARE_MODE={normal:'N',endless:'E',daily:'D',week:'W'};
const SHARE_MODE_R={N:'normal',E:'endless',D:'daily',W:'week'};
function makeShareCode(mode,seedVal){
  const m=SHARE_MODE[mode]||'N';
  const s=((seedVal>>>0)%1000000).toString(36).toUpperCase().padStart(4,'0');
  // 校验位：模式码字符码 + 种子各位和 mod 36
  let sum=m.charCodeAt(0);for(const ch of s)sum+=ch.charCodeAt(0);
  const chk=(sum%1296).toString(36).toUpperCase().padStart(2,'0');
  return `ZNTX-${m}${s}${chk}`;
}
function parseShareCode(code){
  if(!code||typeof code!=='string')return null;
  const c=code.trim().toUpperCase().replace(/\s/g,'');
  const mt=c.match(/^ZNTX-([NEDW])([0-9A-Z]{4})([0-9A-Z]{2})$/);
  if(!mt)return null;
  const[,m,s,chk]=mt;
  let sum=m.charCodeAt(0);for(const ch of s)sum+=ch.charCodeAt(0);
  if((sum%1296).toString(36).toUpperCase().padStart(2,'0')!==chk)return null;
  return {mode:SHARE_MODE_R[m]||'normal',seed:parseInt(s,36)||0,code:`ZNTX-${m}${s}${chk}`};
}
// 生成本局分享码（按当前模式与种子）
function currentShareCode(){
  let seedVal=0;
  if(gameMode==='endless')seedVal=(endlessSeed>>>0);
  else if(gameMode==='normal'&&weekMod)seedVal=(weekIndex()*7919)>>>0;
  else if(dailyMod)seedVal=(dailySeed())>>>0;
  else seedVal=((SAVE.totalRuns||0)*31+S.kills)>>>0;
  return makeShareCode(gameMode==='normal'&&weekMod?'week':gameMode,seedVal);}
// 使用好友分享码开局：以同种子重演（本局随机数序列对齐）
let shareSeed=null,shareCodeCur='';
function applyShareCode(code){
  const r=parseShareCode(code);
  if(!r)return null;
  shareSeed=r.seed;shareCodeCur=r.code;
  SAVE.shareCodes=SAVE.shareCodes||{};SAVE.shareCodes[r.code]={t:Date.now(),m:r.mode};
  // 记录为「友军挑战」，写进排行榜附带标记
  writeSave();
  setMode(r.mode==='week'?'normal':r.mode);
  return r;}
// 校验分享码并给出对比
function compareShareCode(code){
  const r=parseShareCode(code);if(!r)return null;
  SAVE.shareCodes=SAVE.shareCodes||{};
  const mine=SAVE.shareCodes[r.code];
  // 我的同模式最佳分
  let myBest=0,cat='normal';
  if(r.mode==='endless'){myBest=SAVE.endlessBest||0;cat='endless';}
  else if(r.mode==='daily'){myBest=(SAVE.daily&&SAVE.daily[String(dailySeed())])||0;cat='daily';}
  else{const arr=(SAVE.ranks&&SAVE.ranks.normal)||[];myBest=arr[0]?.score||0;cat='normal';}
  return {valid:true,mode:r.mode,code:r.code,seen:!!mine,myBest,cat};}
// 渲染分享码分数对比面板
function renderShareCompare(code){
  const el=document.getElementById('shareCmp');if(!el)return;
  const c=compareShareCode(code);
  if(!c){el.innerHTML='';return;}
  const md={normal:'常规闯关',endless:'Boss 无尽',daily:'每日挑战',week:'周赛'}[c.mode]||'常规';
  // 好友记录（本机保存过则该码即为"已挑战过"）
  const mine=SAVE.shareCodes[c.code];
  const when=mine?new Date(mine.t).toLocaleDateString():'—';
  const diff=c.myBest;
  const col=diff>0?'#ff4d6d':diff<0?'#4cc9f0':'#ffd60a';
  const verdict=c.myBest===0?'⚔️ 尚无同模式记录，一战成名！'
    :'💪 用同样的种子，超越自己的 '+c.myBest+' 分！';
  el.innerHTML=`<div class="scCmpBox">
    <div class="scCmpRow"><span>模式</span><b>${md}</b></div>
    <div class="scCmpRow"><span>我的最佳</span><b style="color:${col}">${c.myBest||'—'}</b></div>
    <div class="scCmpRow"><span>历史载入</span><b>${when}</b></div>
    <div class="scCmpTip">${verdict}</div></div>`;}
let endlessSeed=0;

// ---------- Boss 击杀回放（最后一击慢镜头） ----------
const REPLAY_FRAMES=48; // 回放采样帧数
let replayBuf=[],replayActive=false,replayPlay=0,replayGrab=0;
function startReplayRecord(boss){
  replayBuf=[];replayActive=true;replayPlay=0;replayGrab=0;
  const bd=BOSSES_DEF.find(x=>x.id===(boss.userData.bossId||'captain'))||BOSSES_DEF[0];
  replayMeta={name:bd.n,icon:bd.icon,id:boss.userData.bossId||'captain',t0:S.time,kills:S.kills,lvl:S.lvl};}
function pushReplayFrame(){
  if(!replayActive)return;
  replayBuf.push({p:player.position.clone(),r:player.rotation.y,
    e:enemies.slice(0,14).map(e=>({p:e.position.clone(),r:e.rotation.y,b:e.userData.boss?1:0,t:e.userData.type}))});
  if(replayBuf.length>REPLAY_FRAMES)replayBuf.shift();}
// 主循环驱动：连续抓帧，满 REPLAY_FRAMES 后收尾并播放
function updateReplayRecord(dt){
  if(!replayActive)return;
  replayGrab+=dt;
  if(replayGrab>=.03){replayGrab=0;pushReplayFrame();}
  if(replayBuf.length>=REPLAY_FRAMES){stopReplayRecord();playReplay();}}
function stopReplayRecord(){replayActive=false;}
// 回放 UI 渲染（画面上叠加「击杀回放」提示条 + 击杀信息）
function renderReplayOverlay(){
  let el=document.getElementById('replayBar');
  if(!el){el=document.createElement('div');el.id='replayBar';document.body.appendChild(el);}
  const m=replayMeta||{name:'首脑',icon:'👑',kills:0,lvl:1};
  const k=P=>Math.max(0,Math.min(1,P));
  el.innerHTML=`<div class="rpTag">▶ 击杀回放</div>
    <div class="rpName">${m.icon||'👑'} ${m.name||'首脑'} · 终结</div>
    <div class="rpInfo">击杀 ${m.kills||0} · 境界 ${realmName(m.lvl||1)}</div>`;
  el.style.opacity=Math.min(1,F.replayT/0.6);}
function playReplay(){
  if(replayBuf.length<8)return false;
  replayPlay=replayBuf.length; // 倒放计数
  // 保存最后一次击杀的元信息供回放显示
  SAVE.bossReplay=SAVE.bossReplay||{};
  const id=(replayMeta&&replayMeta.id)||'captain';
  SAVE.bossReplay[id]={t:Date.now(),kills:(replayMeta&&replayMeta.kills)||0,lvl:(replayMeta&&replayMeta.lvl)||1};
  writeSave();
  slowMotion(.5,1); // 回放期间的慢镜
  F.replayT=2.2;
  return true;}
let replayMeta=null;

// ---------- 演出系统（Boss登场特写 / 慢动作斩杀 / 信件开场 / 顿帧） ----------
const F={slow:1,slowT:0,zoomT:0,zoomTarget:0,bossIntro:0,bossRef:null,letterT:0,letterPage:0,replayT:0};
function slowMotion(scale,dur){F.slow=scale;F.slowT=dur;}
function zoomTo(z,dur){F.zoomTarget=z;F.zoomT=dur;}
const SLOW=1;
// 顿帧（命中定格）
let hitStop=0;function stopFrame(v){hitStop=Math.max(hitStop,v);}
// Boss 登场演出（按 Boss 定制配色与台词）
const BOSS_INTRO={
  captain:{c:'rgba(255,0,110,.28)',w:'rgba(255,0,110,.34)',t:'⚠ 正牌男友军团长 · 登场！'},
  mother:{c:'rgba(255,214,10,.30)',w:'rgba(255,214,10,.36)',t:'💍 彩礼审判·丈母娘 · 驾到！'},
  mirror:{c:'rgba(76,201,240,.30)',w:'rgba(76,201,240,.36)',t:'👤 命运镜像体 · 凝视着你！'},
  fatherinlaw:{c:'rgba(255,214,10,.30)',w:'rgba(255,214,10,.36)',t:'🎩 岳父大人 · 端着酒杯走过来了！'},
  exchorus:{c:'rgba(199,125,255,.30)',w:'rgba(199,125,255,.36)',t:'🎤 前任合唱团 · 三重唱，开嗓！'},
  emcee:{c:'rgba(255,61,110,.32)',w:'rgba(255,61,110,.38)',t:'🔔 婚礼司仪·伪神 · 主持你的葬礼！'}};
function bossIntro(b,title){F.bossIntro=2.2;F.bossRef=b;
  const bi=BOSS_INTRO[b.userData.bossId]||BOSS_INTRO.captain;
  // v45：统一走 rise 模板——压慢 → 色闪+边缘描边 → 光环扩散，节奏固定
  VFX.rise({color:bi.c,rimCol:bi.w,pulseCol:bi.w.replace(/[\d.]+\)$/,'.75)'),
    shake:.8,slowDur:2.2,zoom:6.2,zoomDur:2.2,
    sfxFn:()=>{sfx.ult();},text:bi.t,text2:'⚠ 战斗开始 · 注意脚下预警圈'});
  burst(b.position,0xff006e,48,13);
  startBossBgm(b.userData.bossId);}
// 全屏色闪
let flashEl=document.getElementById('flash');
function flashOverlay(color,dur){if(!flashEl){flashEl=document.createElement('div');flashEl.id='flash';document.body.appendChild(flashEl);}
  flashEl.style.background=color;flashEl.style.opacity=1;
  setTimeout(()=>{flashEl.style.opacity=0;},dur*1000);}

// ============ v45 · 演出套件（VFX Kit） ============
// 设计目标：此前演出是「散装」的——每个调用点自己拼 flash + shake + slowMotion + tip，
// 节奏各不相同，玩家感知不到「这是一个重要时刻」。v45 把演出抽象成三种**节奏模板**：
//   · beat  —— 单拍：一次强调（进化 / 合体 / 觉醒 / 首见词缀）
//   · rise  —— 起势：先压后放（Boss 登场 / 章节切换）
//   · bloom —— 绽放：多层叠加（大招 / 通关 / 传说成就）
// 每个模板内部统一「色闪时长 / 震屏强度 / 慢动作曲线 / 音效层次」，形成可辨识的演出语言。

const VFX={
  // 通用：屏幕脉冲光环（在 DOM 层做，不受 3D 相机影响，保证任何视角都能看到）
  pulse(color,dur=520,scale=1.9){
    let d=document.getElementById('vfxPulse');
    if(!d){d=document.createElement('div');d.id='vfxPulse';document.body.appendChild(d);}
    d.style.setProperty('--pc',color);d.style.setProperty('--ps',scale);
    d.classList.remove('run');
    void d.offsetWidth;      // 强制重排，重启动画
    d.classList.add('run');
    clearTimeout(d._t);
    d._t=setTimeout(()=>d.classList.remove('run'),dur+80);
  },
  // 通用：屏幕边缘描边（警示 / 高压）
  rim(color,dur=900){
    let d=document.getElementById('vfxRim');
    if(!d){d=document.createElement('div');d.id='vfxRim';document.body.appendChild(d);}
    d.style.setProperty('--rc',color);
    d.classList.remove('run');void d.offsetWidth;d.classList.add('run');
    clearTimeout(d._t);d._t=setTimeout(()=>d.classList.remove('run'),dur+80);
  },
  // 通用：定格帧（短暂停滞，用于强调命中/登场）
  freeze(ms=60){stopFrame(ms/1000);},

  // 模板一：单拍 beat —— 一次干净的强调
  beat(o){
    const opt=o||{};
    const c=opt.color||'rgba(255,214,10,.34)';
    flashOverlay(c,opt.hold||.26);
    shake(opt.shake||.35);
    if(opt.slow!==false)slowMotion(opt.slowScale||.55,opt.slowDur||.22);
    this.pulse(opt.pulseCol||'rgba(255,214,10,.55)',480,1.55);
    if(opt.sfx!==false)(opt.sfxFn||sfx.evo)();
    if(opt.text)tip(opt.text);
    if(opt.freeze)this.freeze(opt.freeze);
  },

  // 模板二：起势 rise —— 先压后放（Boss 登场 / 章节切换）
  // 节奏：0ms 压慢 + 收窄视野 → 220ms 色闪 + 震屏 → 420ms 光环扩散
  rise(o){
    const opt=o||{};
    const c=opt.color||'rgba(255,0,110,.3)';
    slowMotion(.16,opt.slowDur||1.5);
    zoomTo(opt.zoom||6.0,opt.zoomDur||1.7);
    setTimeout(()=>{
      flashOverlay(c,opt.hold||.5);
      shake(opt.shake||.75);
      this.rim(opt.rimCol||c,1200);
    },200);
    setTimeout(()=>{
      this.pulse(opt.pulseCol||c,760,2.6);
      if(opt.sfxFn)opt.sfxFn();
    },420);
    if(opt.text)tip(opt.text);
    if(opt.text2)setTimeout(()=>tip2(opt.text2),620);
  },

  // 模板三：绽放 bloom —— 多层叠加（大招 / 通关 / 传说成就）
  bloom(o){
    const opt=o||{};
    const c=opt.color||'rgba(255,143,163,.34)';
    slowMotion(opt.slowScale||.22,opt.slowDur||.5);
    flashOverlay(c,.18);
    shake(.5);
    let k=0;
    const layers=opt.layers||3;
    const iv=setInterval(()=>{
      k++;
      this.pulse(k===layers?opt.pulseCol||'rgba(255,214,10,.6)':c,600,1.4+k*.55);
      flashOverlay(c,.1);
      shake(.3+k*.1);
      if(k>=layers){clearInterval(iv);}
    },170);
    if(opt.sfxFn||true)(opt.sfxFn||sfx.ult)();
    if(opt.text)tip(opt.text);
    if(opt.text2)setTimeout(()=>tip2(opt.text2),500);
  },

  // 收尾：从演出状态回到常态（清掉 pulse/rim）
  calm(){
    const a=document.getElementById('vfxPulse'),b=document.getElementById('vfxRim');
    if(a)a.classList.remove('run');if(b)b.classList.remove('run');
  }
};
// 章节切换演出（起势模板的特化）
function chapterCutscene(i){
  const c=CHAPTERS[i%CHAPTERS.length];
  const col='rgba('+((c.fog>>16)&255)+','+((c.fog>>8)&255)+','+(c.fog&255)+',.42)';
  VFX.rise({color:col,rimCol:col,pulseCol:'rgba(255,214,10,.5)',
    shake:.5,slowDur:1.2,zoom:6.4,zoomDur:1.4,
    sfxFn:()=>{sfx.milestone&&sfx.milestone();},
    text:'📖 '+c.name,text2:c.desc});
}
// 开场信件（剧情引导）
const LETTERS=[
 {t:'💌 第 1 封信',b:'"听说你在大学城很出名。<br>今晚，广场见。"<br><span style="color:#ffd60a">—— 一个想认识你的人</span>'},
 {t:'💌 第 2 封信',b:'"你昨天骗了我。<br>不过……我好像有点喜欢这种危险。"<br><span style="color:#ffd60a">—— 你的孽缘</span>'},
 {t:'💌 第 3 封信',b:'"所有前任都到了。<br>你，准备好了吗？"<br><span style="color:#ff006e">—— 修罗场邀请函</span>'},
 {t:'💌 第 4 封信',b:'"海洋深处，有人为你建了王座。<br>来拿走它——如果你敢。"<br><span style="color:#40e0d0">—— 深海海王</span>'},
 {t:'💌 第 5 封信',b:'"这里永远是夜。<br>所有的雪，都替你记着那些没说出口的话。"<br><span style="color:#a8e6ff">—— 极夜里的守灯人</span>'},
 {t:'💌 第 6 封信 · 终章',b:'"四季我都替你走过了。<br>剩下的路，你自己走——但要记得回头看看我。"<br><span style="color:#b8a8f0">—— 时序</span>'},
 {t:'💌 第 7 封信 · 请帖',b:'"喜帖是红色的，字是金色的，<br>底下那行小字写着：<br>『携前任及所有债主，同赴。』"<br><span style="color:#ffd60a">—— 婚宴邀请函</span>'},
 {t:'💌 第 8 封信 · 逃出生天',b:'"你从婚宴上跑出来了，只带了一只鞋。<br>可是亲爱的，你以为婚姻是终点？<br>不，它只是第一场考试。"<br><span style="color:#ff8fa3">—— 岳父大人</span>'},
];
function showLetter(i){const L=LETTERS[i%LETTERS.length];
  document.getElementById('lt').innerHTML=L.t;
  document.getElementById('lb').innerHTML=L.b;
  const le=document.getElementById('letter');le.style.display='flex';le.style.opacity=1;
  setTimeout(()=>{le.style.opacity=0;setTimeout(()=>le.style.display='none',700);},3000);}

// ---------- 男主换装系统（各章节造型） ----------
const OUTFITS=[
 {name:'校园·白衬衫',robe:0x5a1a6e,chest:0x2b0f3a,belt:0xffd60a,ribbon:0xff4d9e,hair:0x1a1024},
 {name:'都市·黑西装',robe:0x1a1a24,chest:0x2a2a3a,belt:0xc0c0d0,ribbon:0x4cc9f0,hair:0x141018},
 {name:'婚礼·红礼服',robe:0x7a1020,chest:0x4a0a14,belt:0xffd60a,ribbon:0xffb703,hair:0x201014},
 {name:'复仇·暗紫战袍',robe:0x3a0a3a,chest:0x1a0518,belt:0xff006e,ribbon:0xf72585,hair:0x0a0510},
 {name:'深海·浪人风衣',robe:0x0a2e3a,chest:0x061e28,belt:0x40e0d0,ribbon:0x7fffd4,hair:0x06141c},
 {name:'极夜·霜狼皮裘',robe:0xdff4ff,chest:0xa8cbe0,belt:0x4a9fd0,ribbon:0x7fd4ff,hair:0xe8eef5},
 {name:'婚宴·金色燕尾',robe:0x1a0a14,chest:0x2e0a1e,belt:0xffd60a,ribbon:0xff006e,hair:0x0e0508},
];
function applyOutfit(i){const o=OUTFITS[i%OUTFITS.length];
  heroParts.recolor(o);
  heroParts.mTrim.emissive.setHex(o.belt);heroParts.mTrim.emissiveIntensity=.35;
  tip(`👔 换装：${o.name}`);}

// ---------- 女主专属必杀（恋人助战：按键触发） ----------
const LOVER_ULT=[
 {name:'晚晴·满月告白',cd:0,key:'1',
  fx:()=>{ // 全屏治疗 + 心形环绕治愈光
    S.hp=S.maxHp;flashOverlay('rgba(255,143,163,.3)',.6);
    for(let i=0;i<24;i++){const a=i/24*Math.PI*2;
      const h3=new THREE.Mesh(G.orb,new THREE.MeshBasicMaterial({color:0xff8fa3}));
      h3.scale.setScalar(.5);h3.position.copy(player.position).setY(1.5);
      h3.userData={v:new THREE.Vector3(Math.cos(a)*9,4,Math.sin(a)*9),life:.9};
      scene.add(h3);parts.push(h3);}
    tip('💗 晚晴：满月之下，我治愈你的一切！');sfx.evo();}},
 {name:'曼姐·修罗降临',cd:0,key:'2',
  fx:()=>{ // 全屏伤害
    for(let i=0;i<40;i++){const a=Math.random()*7;
      const p3=new THREE.Mesh(G.meteor,new THREE.MeshBasicMaterial({color:0x9d4edd}));
      p3.position.copy(player.position).add(new THREE.Vector3(Math.cos(a)*(8+Math.random()*14),0,Math.sin(a)*(8+Math.random()*14)));
      p3.userData={v:new THREE.Vector3(0,-30,0),life:.5,land:()=>{}};
      scene.add(p3);parts.push(p3);}
    for(const e of enemies)if(e.position.distanceTo(player.position)<22)hitEnemy(e,180*S.dmgMul);
    flashOverlay('rgba(157,78,221,.35)',.6);shake(.6);
    tip('🍷 曼姐：修罗场，由我来清场。');sfx.ult();}},
 {name:'糖糖·糖衣炮火',cd:0,key:'3',
  fx:()=>{ // 全场魅惑 + 碎片雨
    for(const e of enemies)e.userData.charmed=4;
    for(let i=0;i<20;i++)mkOrb(player.position);
    flashOverlay('rgba(249,160,63,.3)',.6);
    tip('🍬 糖糖：都别打啦，来吃糖！');sfx.lvl();}},
 {name:'夜冰·冰封千里',cd:0,key:'4',
  fx:()=>{ // 全场冻结减速 + 冰棱伤害
    for(const e of enemies){const u=e.userData;if(u.hp>0&&e.position.distanceTo(player.position)<20){u.slowT=Math.max(u.slowT||0,3.5);hitEnemy(e,120*S.dmgMul);burst(e.position.clone().setY(.8),0x4cc9f0,4,5);}}
    for(let i=0;i<26;i++){const a=i/26*Math.PI*2;
      const p4=new THREE.Mesh(new THREE.ConeGeometry(.22,1.6,5),new THREE.MeshBasicMaterial({color:0x4cc9f0}));
      p4.position.copy(player.position).setY(.8);
      const d2=new THREE.Vector3(Math.cos(a),0,Math.sin(a));
      p4.userData={v:d2.multiplyScalar(16).setY(0),life:.9};p4.rotation.x=Math.PI/2;
      scene.add(p4);parts.push(p4);}
    flashOverlay('rgba(76,201,240,.3)',.6);shake(.4);
    tip('❄️ 夜冰：冰封千里，谁也伤不了你。');sfx.ult();}},
];
const loverCd=[0,0,0,0];
function useLoverUlt(i){if(loverCd[i]>0||!S.alive)return;if(!mates.includes(i)||affinity[i]<AFF_MAX){
    tip('💔 需要她成为恋人才能使出专属必杀');return;}
  loverCd[i]=45;LOVER_ULT[i].fx();renderLoverBtns();}
function renderLoverBtns(){const box=document.getElementById('loverBtns');
  box.innerHTML=mates.filter(i=>affinity[i]>=AFF_MAX).map(i=>{
    const r=Math.max(0,loverCd[i]);
    return `<button class="lbtn${r>0?' cd':''}" data-i="${i}">${porTag(i,30)}<span>${LOVER_ULT[i].key}</span></button>`;}).join('');
  box.querySelectorAll('.lbtn').forEach(b=>{b.onclick=()=>useLoverUlt(+b.dataset.i);});}

// ---------- 多结局系统 ----------
// ---------- 称号系统（v25）：按成就/战绩自动授予最高称号 ----------
const TITLES=[
 {id:'t_lurker', n:'🌱 情场新手',   d:'初出茅庐，还不知套路为何物',   cond:()=>(SAVE.totalRuns||0)>=1},
 {id:'t_regular',n:'💼 常来常往',   d:'累计闯关 10 局',              cond:()=>(SAVE.totalRuns||0)>=10},
 {id:'t_skilled',n:'🎯 情场老手',   d:'累计约会 8 次',               cond:()=>(SAVE.dateTotal||0)>=8},
 {id:'t_ice',    n:'❄️ 融冰之人',   d:'夜冰好感拉满并结缘',           cond:()=>(SAVE.mates||[]).includes(3)&&(SAVE.affinity[3]||0)>=AFF_MAX*0.4},
 {id:'t_mult',   n:'👑 一脚踏三船', d:'三位女主全部结缘',             cond:()=>(SAVE.mates||[]).length>=3},
 {id:'t_abyss',  n:'🕳️ 深渊行者',   d:'击败深渊之主 5 度',            cond:()=>(SAVE.abyssBest||0)>0||(SAVE.bosses&&(SAVE.bosses.abyss||0)>=5)},
 {id:'t_realm',  n:'✨ 化神之上',   d:'最高境界达化神境',             cond:()=>(SAVE.best&&SAVE.best.lvl||1)>=7},
 {id:'t_grand',  n:'🌌 修罗场大满贯',d:'四位女主全部结缘',            cond:()=>(SAVE.mates||[]).length>=4},
 {id:'t_legend', n:'⚡ 修行传奇',   d:'成就点数达 100',              cond:()=>totalAchPoints()>=100},
];
function currentTitle(){let best=TITLES[0];for(const t of TITLES)if(t.cond())best=t;return best;}
function titleBadge(){const t=currentTitle();return `<span style="color:#ffd60a;font-size:12px">🏷️ ${t.n}</span>`;}
const ENDINGS=[
 // ---- v46 倾向专属结局（优先级最高：先看这一局「你成为了什么样的人」） ----
 {id:'align_sincere',name:'🕊️ 真心结局 · 一句就是一诺',
  cond:()=>alignDominant()==='sincere'&&alignScore('sincere')>=6,
  text:'你没有再撒过一次谎。每一个「好」都是真的，每一次「等我」都真的等到。<br>她后来跟朋友说：「这个人啊，笨得要死，但说话算数。」<br>—— 这大概是对渣男最高的评价了。',
  col:'#7fd4ff'},
 {id:'align_player',name:'😈 渣术结局 · 无人生还',
  cond:()=>alignDominant()==='player'&&alignScore('player')>=6,
  text:'你的每一句情话都精准命中，每一个转身都不留证据。<br>到最后，手机里 47 个置顶对话框，没有一个敢点开。<br>你赢了所有人的心，唯独没赢过自己那面镜子。',
  col:'#ff4d6d'},
 {id:'align_slick',name:'🎭 圆滑结局 · 谁都没记住',
  cond:()=>alignDominant()==='slick'&&alignScore('slick')>=6,
  text:'你从没答应过什么，也从没拒绝过什么。<br>所有人都觉得你「还不错」，但没有人说得出你到底哪里好。<br>你活成了一杯温水——不烫嘴，也暖不了人。',
  col:'#c77dff'},
 {id:'scumbag',name:'💀 孤家寡人结局',cond:()=>mates.length===0,
  text:'你把所有人都骗了一遍，最后一个人站在广场中央。<br>雨还在下，没有人再给你发消息。'},
 {id:'ice_true',name:'❄️ 冰雪奇缘·冰心结局',cond:()=>mates.length===1&&mates[0]===3&&affinity[3]>=AFF_MAX,
  text:'雪落满肩。她终于笑了，像冰川裂开第一道春光。<br>"你融化了。"她说。<br>"不，"你握紧她的手，"是你让我学会了不逃。"',
  col:'#4cc9f0'},
 {id:'harem4',name:'🌅 修罗场大满贯',cond:()=>mates.length>=4,
  text:'四位姑娘把你围在中间，气氛凝固成冰。<br>然后夜冰开口了："打一架，赢的留下。"<br>……你拔腿就跑，身后追兵与雪崩齐鸣。这是你渣男生涯最狼狈也最充实的一天。',
  col:'#ffd60a'},
 {id:'harem',name:'👑 海王结局',cond:()=>mates.length>=3,
  text:'四位姑娘同时走向你，手里都攥着同一张照片。<br>"所以，你到底选谁？"<br>……你笑了，因为你知道，你谁都不会选。'},
 {id:'true',name:'🕊️ 浪子回头·真结局',cond:()=>mates.length===1&&affinity[mates[0]]>=AFF_MAX,
  text:'你收起了那些套路，只留下一个人。<br>她问："以后还会骗我吗？"<br>你说："不会了。这次是真的。"'},
 {id:'normal',name:'🌙 未完待续',cond:()=>true,
  text:'故事还没结束。有人还在等你，有人已经走远。<br>下一局，你想成为什么样的人？'},
];
// v46：本局主导倾向（用于结局判定与 HUD）。要求明显领先，避免平票误判
function alignDominant(){
  const a=alignOf();
  const arr=[['sincere',a.sincere||0],['player',a.player||0],['slick',a.slick||0]]
    .sort((x,y)=>y[1]-x[1]);
  if(arr[0][1]<3)return null;              // 样本太少，不认定
  if(arr[0][1]-arr[1][1]<2)return null;    // 领先不足 2 次，算「摇摆」
  return arr[0][0];
}
function pickEnding(){for(const e of ENDINGS)if(e.cond())return e;return ENDINGS[ENDINGS.length-1];}
function showEnding(){const e=pickEnding();
  // ---- 存档记录（跨局延续） ----
  SAVE.totalRuns=(SAVE.totalRuns||0)+1;
  saveGhost(); // v33：本局轨迹存为影子（仅击杀数进入前 3 时会留下）
  // v28：最佳记录判定（击杀 / 存活 / 评级 → 排行榜打标 + 结算提示）
  const gNow=comboGrade();
  const nb={};
  if(S.kills>(SAVE.best.kills||0)){SAVE.best.kills=S.kills;nb.kills=true;}
  if(Math.floor(S.time)>(SAVE.best.time||0)){SAVE.best.time=Math.floor(S.time);nb.time=true;}
  if((gNow.score||0)>(SAVE.best.gradeScore||0)){SAVE.best.gradeScore=gNow.score;SAVE.best.grade=gNow.g;nb.grade=true;}
  if(S.lvl>(SAVE.best.lvl||0)){SAVE.best.lvl=S.lvl;SAVE.best.realm=realmName(S.lvl);}
  const rankExtra=()=>({grade:gNow.g,gradeName:gNow.n,nb:nb});
  SAVE.realmBonus=Math.min(12,(SAVE.best.lvl||1)-1)*0.02;
  for(let i=0;i<4;i++)SAVE.affinity[i]=Math.max(SAVE.affinity[i]||0,Math.round(affinity[i]*.4));
  for(const m of mates)if(!SAVE.mates.includes(m))SAVE.mates.push(m);
  // ---- 每日挑战计分 ----
  const dscore=Math.floor(dailyScore()*(D.scoreMul||1));
  const isNewDaily=recordDaily(dscore);
  // ---- 排行榜记录（按模式分类） ----
  let rankInfo='';let cloudScore=0;
  if(gameMode==='endless'){
    const escore=Math.floor(endlessBossKills*500+S.time*3+S.kills*4+S.lvl*30);
    cloudScore=escore;
    if(escore>(SAVE.endlessBest||0))SAVE.endlessBest=escore;
    const pos=recordRank('endless',escore,Object.assign({wave:endlessBossKills+1},rankExtra()));
    rankInfo=`<br><span style="color:#f72585;font-size:12px">👑 无尽模式 · 撑过 ${endlessBossKills} 波 Boss · 得分 ${escore}${pos===0?' <b style="color:#ffd60a">🏅 新榜首！</b>':pos<RANK_MAX?`（本机第 ${pos+1} 名）`:''}</span>`;
  }else if(gameMode==='abyss'){
    const ascore=Math.floor(abyssBossKills*1200+S.time*5+S.kills*6+S.lvl*40);
    cloudScore=ascore;
    if(ascore>(SAVE.abyssBest||0))SAVE.abyssBest=ascore;
    const pos=recordRank('abyss',ascore,Object.assign({boss:abyssBossKills},rankExtra()));
    rankInfo=`<br><span style="color:#ff2e2e;font-size:12px">🕳️ 深渊试炼 · 击败深渊之主 ${abyssBossKills} 度 · 得分 ${ascore}${pos===0?' <b style="color:#ffd60a">🏅 新榜首！</b>':pos<RANK_MAX?`（本机第 ${pos+1} 名）`:''}</span>`;
  }else if(gameMode==='ghost'){
    // v33：影子对战结算（击溃更快 = 得分更高）
    const gscore=Math.floor((ghostResult==='win'?(GHOST_TIME-Math.max(0,ghostLeft))*12+1200:0)+S.kills*8+S.lvl*20);
    cloudScore=gscore;
    if(gscore>(SAVE.ghostBest||0))SAVE.ghostBest=gscore;
    const pos=recordRank('ghost',gscore,rankExtra());
    rankInfo=`<br><span style="color:#c77dff;font-size:12px">🥊 影子对战 · ${ghostResult==='win'?'击溃影子':'未击溃'} · 得分 ${gscore}${pos===0?' <b style="color:#ffd60a">🏅 新榜首！</b>':pos<RANK_MAX?`（本机第 ${pos+1} 名）`:''}</span>`;
  }else{
    const nscore=Math.floor(S.kills*10+S.time*2+S.lvl*50+comboBest*5);
    cloudScore=nscore;
    const pos=recordRank('normal',nscore,rankExtra());
    rankInfo=`<br><span style="color:#9ad0ff;font-size:12px">📖 常规模式 · 得分 ${nscore}${pos===0?' <b style="color:#ffd60a">🏅 新榜首！</b>':pos<RANK_MAX?`（本机第 ${pos+1} 名）`:''}</span>`;
  }
  if(gameMode!=='endless'&&dailyMod){
    const pos=recordRank('daily',dscore,rankExtra());
    if(pos===0)rankInfo+=`<br><span style="color:#4cc9f0;font-size:12px">📅 每日榜 · 新纪录 ${dscore} 分</span>`;
  }
  // v37：云端提交（创个人最佳时上传云端榜 + 同步档案）
  socSubmitRun(cloudScore);
  // v28：本机新纪录提示（评级 / 击杀 / 存活）
  let bestInfo='';
  {const parts=[];
   if(nb.kills)parts.push('击杀新高');
   if(nb.time)parts.push('存活新高');
   if(nb.grade)parts.push('评级新高');
   if(parts.length)bestInfo=`<br><span style="color:#ffd60a;font-size:12px">📌 本机新纪录：${parts.join(' · ')}（评级 ${gNow.g}）</span>`;}
  // ---- 周赛计分（常规模式） ----
  let weekInfo='';
  if(gameMode==='normal'&&weekMod){
    const wscore=weekScore();
    const cleared=(bossKills>=1)||(S.time>=600);
    const isNewWeek=recordWeek(wscore,cleared);
    weekInfo=`<br><span style="color:#ff4d9e;font-size:12px">🏁 周赛 ${weekMod.ic} ${weekMod.n} · ${wscore} 分`+
      (isNewWeek?' <b style="color:#ffd60a">🏆 本周新纪录！</b>':`（本周最高 ${weekBest}）`)+
      (cleared?` · <b style="color:#7ee0a0">✅ 已通关</b>`:' · 未通关')+`</span>`;
  }
  writeSave();refreshSaveUI();
  const ov=document.getElementById('overlay');ov.style.display='flex';
  ov.querySelector('h1').textContent=gameMode==='endless'?`👑 无尽终结 · ${endlessBossKills} 波`:gameMode==='abyss'?`🕳️ 深渊沉沦 · ${abyssBossKills} 度`:gameMode==='climate'?`🕛 气候试炼 · 时序 ${(SAVE.bosses.chronos||0)} 胜`:gameMode==='ghost'?(ghostResult==='win'?'🥊 影子溃散 · 挑战成功':'🥊 挑战失败 · 影子未破'):e.name;
  const cg=SAVE.realmBonus>0?`<br><span style="color:#7ee0a0;font-size:12px">转世加成：伤害 +${Math.round(SAVE.realmBonus*100)}%（第 ${SAVE.totalRuns} 局）</span>`:'';
  const dg=(dailyMod&&gameMode!=='endless')?`<br><span style="color:#4cc9f0;font-size:12px">📅 ${dailyMod.n} · 本局 ${dscore} 分${isNewDaily?' <b style="color:#ffd60a">🏅 今日新纪录！</b>':'（今日最高 '+dailyBest+'）'}</span>`:'';
  ov.querySelector('p').innerHTML=`${gameMode==='endless'?`你在无尽挑战中倒下了，共击溃 <b style="color:#f72585">${endlessBossKills}</b> 波首脑。<br>下一波，还敢来吗？`:gameMode==='abyss'?`你在深渊试炼中倒下了，共击退深渊之主 <b style="color:#ff2e2e">${abyssBossKills}</b> 度。<br>虚空之下，仍有余烬。`:gameMode==='climate'?`你在气候试炼中倒下了，共击退四时之主 <b style="color:#b8a8f0">${(SAVE.bosses.chronos||0)}</b> 度。<br>四季仍在轮转，你的故事尚未终章。`:gameMode==='ghost'?(ghostResult==='win'?`你击溃了自己的影子 —— 那个"曾经的你"已不是对手。<br>击败影子后，影子会以更强的姿态重生。`:`影子撑住了 120 秒。<br>它记得你所有的走位习惯 —— 下次换个打法。`):e.text}<br><br>
    <span style="color:#ffd60a">存活 ${Math.floor(S.time)}s · 击杀 ${S.kills} · 境界 ${realmName(S.lvl)}${comboBest>=5?` · 最高连杀 ×${comboBest}`:''}</span><br>
    <span style="color:#c9a7eb;font-size:12px">恋人：${mates.length?mates.map(i=>NPC_DEFS[i].name+(affinity[i]>=AFF_MAX?'❤️':'')).join('、'):'无'}</span>
    <br><span style="color:#9ad0ff;font-size:12px">🏅 成就 ${SAVE.achievements.length}/${ACHIEVEMENTS.length} · 👑 图鉴 ${BOSSES_DEF.filter(b=>(SAVE.bosses||{})[b.id]>0).length}/${BOSSES_DEF.length} · 💠 掉落 ${DROPS.filter(d=>(SAVE.dropCodex||{})[d.id]>0).length}/${DROPS.length} · ✦ 词条 ${affixCollected()}/${AFFIXES.length}</span>${rankInfo}${bestInfo}${weekInfo}${dg}${cg}`;
  {const gr=comboGrade();const ge=ov.querySelector('#gradeBadge');
   if(!ge){const sp=document.createElement('div');sp.id='gradeBadge';
     sp.style.cssText='margin:8px 0;font-size:15px;font-weight:bold';
     ov.querySelector('.box').insertBefore(sp,ov.querySelector('p'));}
   ov.querySelector('#gradeBadge').innerHTML=
     `评级 <span style="color:${gr.c};font-size:22px">${gr.g}</span> <span style="color:${gr.c}">${gr.n}</span><br>
      <span style="color:#8a7aa8;font-size:11px">${gr.d}</span>`;}
  {const tt=currentTitle();const tb=ov.querySelector('#titleBadge');
   if(!tb){const sp=document.createElement('div');sp.id='titleBadge';
     sp.style.cssText='margin:6px 0;font-size:13px;color:#ffd60a';
     ov.querySelector('.box').insertBefore(sp,ov.querySelector('p'));}
   ov.querySelector('#titleBadge').innerHTML=`🏷️ 当前称号：<b>${tt.n}</b> <span style="color:#8a7aa8;font-size:11px">（${tt.d}）</span>`;}
  ov.querySelector('#startBtn').textContent='再 战 一 局';
  // 战绩分享卡按钮
  let shareBtn=ov.querySelector('#shareBtn');
  if(!shareBtn){shareBtn=document.createElement('button');shareBtn.id='shareBtn';
    shareBtn.textContent='📸 生 成 战 绩 卡';ov.querySelector('.box').appendChild(shareBtn);
    shareBtn.onclick=()=>showShareCard();}
  shareBtn.style.display='block';}

// ---------- 战绩分享卡（Canvas 绘制） ----------
function showShareCard(){
  const W2=720,H2=1080;
  const cv=document.createElement('canvas');cv.width=W2;cv.height=H2;
  const g=cv.getContext('2d');
  const e=pickEnding();
  const bg=g.createLinearGradient(0,0,W2,H2);
  bg.addColorStop(0,'#1a0b2e');bg.addColorStop(.55,'#2d0a3f');bg.addColorStop(1,'#0a0512');
  g.fillStyle=bg;g.fillRect(0,0,W2,H2);
  const halo=g.createRadialGradient(W2/2,320,40,W2/2,320,420);
  halo.addColorStop(0,'rgba(247,37,133,.42)');halo.addColorStop(1,'rgba(247,37,133,0)');
  g.fillStyle=halo;g.fillRect(0,0,W2,H2);
  g.strokeStyle='rgba(255,214,10,.55)';g.lineWidth=2;
  g.beginPath();g.moveTo(60,150);g.lineTo(W2-60,150);g.stroke();
  g.textAlign='center';
  g.fillStyle='#ff4d9e';g.font='bold 52px sans-serif';
  g.shadowColor='#f72585';g.shadowBlur=30;
  g.fillText('渣 男 行 天 下',W2/2,110);
  g.shadowBlur=0;
  g.fillStyle='#ffd60a';g.font='bold 40px sans-serif';
  g.fillText(gameMode==='endless'?`👑 无尽 · ${endlessBossKills} 波`:e.name,W2/2,250);
  g.fillStyle='rgba(201,167,235,.85)';g.font='17px sans-serif';
  g.fillText(gameMode==='endless'?'首脑轮番来袭，你撑到了最后一刻':String(e.text).replace(/<br>/g,' ').slice(0,26),W2/2,290);
  const stats=gameMode==='endless'?[
    ['存活',Math.floor(S.time)+'s'],['击溃波数','×'+endlessBossKills],['境界',realmName(S.lvl)],
    ['击杀',String(S.kills)],['最高连杀','×'+comboBest],['得分',String(Math.floor(endlessBossKills*500+S.time*3+S.kills*4+S.lvl*30))],
  ]:[
    ['存活',Math.floor(S.time)+'s'],['击杀',String(S.kills)],['境界',realmName(S.lvl)],
    ['最高连杀','×'+comboBest],['恋人',mates.length+' 位'],['成就',SAVE.achievements.length+'/'+ACHIEVEMENTS.length],
  ];
  const gx=70,gy=380,cw=270,chh=118;
  stats.forEach((s2,i)=>{
    const col=i%2,row=Math.floor(i/2);
    const x=gx+col*(cw+40),y=gy+row*chh*1.35;
    g.fillStyle='rgba(255,255,255,.05)';roundRect(g,x,y,cw,chh,14);g.fill();
    g.strokeStyle='rgba(255,214,10,.22)';g.lineWidth=1;roundRect(g,x,y,cw,chh,14);g.stroke();
    g.fillStyle='#c9a7eb';g.font='15px sans-serif';g.textAlign='left';
    g.fillText(s2[0],x+22,y+38);
    g.fillStyle='#fff';g.font='bold 30px sans-serif';
    g.fillText(s2[1],x+22,y+82);
    g.textAlign='center';});
  if(gameMode!=='endless'&&typeof dailyMod!=='undefined'&&dailyMod){
    const dscore=Math.floor(dailyScore()*(D.scoreMul||1));
    g.fillStyle='#4cc9f0';g.font='bold 19px sans-serif';
    g.fillText(`📅 今日挑战 ${dailyMod.n} · ${dscore} 分`,W2/2,gy+chh*4.35);}
  if(mates.length){
    g.fillStyle='#ff8fa3';g.font='17px sans-serif';
    g.fillText('❤️ '+mates.map(i=>NPC_DEFS[i].name.split(' · ')[1]||NPC_DEFS[i].name).join(' · '),W2/2,gy+chh*5.05);}
  g.strokeStyle='rgba(255,214,10,.35)';g.beginPath();g.moveTo(60,H2-140);g.lineTo(W2-60,H2-140);g.stroke();
  g.fillStyle='#8a7aa8';g.font='15px sans-serif';
  g.fillText('撑过 10 分钟 · 见证真结局',W2/2,H2-100);
  g.fillStyle='#ffd60a';g.font='bold 16px sans-serif';
  g.fillText('▶ 打开网页即可体验《渣男行天下》',W2/2,H2-68);
  let ovl=document.getElementById('shareOv');
  if(!ovl){ovl=document.createElement('div');ovl.id='shareOv';
    ovl.innerHTML='<div class="shBox"><img id="shareImg"><div class="shTip">长按图片保存 / 右键另存为</div>'+
      '<button id="shareClose">关 闭</button></div>';
    document.body.appendChild(ovl);
    ovl.querySelector('#shareClose').onclick=()=>{ovl.style.display='none';};}
  ovl.querySelector('#shareImg').src=cv.toDataURL('image/png');
  ovl.style.display='flex';}
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);
  g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}

const CHAPTERS=[
 {name:'第一章 · 初恋校园',fog:0x2a1046,exposure:1.0,amb:0x8855bb,keyC:0xffa0d8,rain:true,desc:'樱花与心动，一起从这里开始'},
 {name:'第二章 · 都市夜战',fog:0x0a1830,exposure:0.95,amb:0x4466aa,keyC:0x88ccff,rain:true,desc:'霓虹与谎言，谁先崩塌'},
 {name:'第三章 · 婚礼逃亡',fog:0x3a1a10,exposure:1.05,amb:0xbb7744,keyC:0xffc27a,rain:false,desc:'喜宴变修罗场，逃！'},
 {name:'第四章 · 前任复仇',fog:0x2a0620,exposure:0.9,amb:0xaa2266,keyC:0xff4d6d,rain:true,desc:'所有旧账，今夜清算'},
 {name:'第五章 · 深海王座',fog:0x04182a,exposure:0.98,amb:0x226688,keyC:0x66ccff,rain:true,desc:'海王的领域，浪涛与情网交织'},
 {name:'第六章 · 极夜冰原',fog:0x0c1a26,exposure:0.9,amb:0x4a7a9a,keyC:0xa8e6ff,rain:true,desc:'永夜冰封万里，唯有心跳未曾冻结'},
 {name:'第七章 · 婚宴修罗场',fog:0x2e0a1e,exposure:1.02,amb:0xc04080,keyC:0xffd60a,rain:false,desc:'红色喜帖，金色刀光——今天谁都不许走'},
];
// v66：把当前时段色「染色」到 AI 天际线上（night 偏暗蓝紫，day 偏亮）
function setSkyTint(col){
  if(!skyDome||!skyDome.material)return;
  skyDome.material.color.copy(col);
  // 无穹顶时退化为纯色背景，保证昼夜演出不丢
  if(!skyDome.material.map)scene.background=col.clone();}
let chapter=0,chapterBannerT=0;
let _vfxChapterFirst=true; // 首章不播演出（开局已有开场动画）
function applyChapter(i){const c=CHAPTERS[i%CHAPTERS.length];chapter=i%CHAPTERS.length;
  scene.fog.color.setHex(c.fog);
  setSkyTint(new THREE.Color(c.fog).lerp(new THREE.Color(0xffffff),.42));
  renderer.toneMappingExposure=c.exposure*1.05;
  ambient.color.setHex(c.amb);key.color.setHex(c.keyC);
  rain.visible=c.rain;
  wall.material.color.setHex(i%2?0x4cc9f0:0xf72585);
  document.getElementById('chapterName').textContent=c.name;
  document.getElementById('chapterDesc').textContent=c.desc;
  applyOutfit(i); // 章节换装
  chapterBanner();
  // v45：章节切换统一演出（首章跳过，避免与开场撞车）
  if(!_vfxChapterFirst&&i>0)chapterCutscene(i);
  _vfxChapterFirst=false;}
function chapterBanner(){const b=document.getElementById('banner');
  b.style.opacity=1;b.style.transform='translateY(0)';
  clearTimeout(chapterBannerT);
  chapterBannerT=setTimeout(()=>{b.style.opacity=0;b.style.transform='translateY(-14px)';},3200);}
let chapterT=240;
applyChapter(0);

// ---------- 昼夜 & 天气系统（v21 实景氛围） ----------
// 昼夜四相：晨曦 dawn → 白昼 day → 黄昏 dusk → 深夜 night（循环 150s）
const DAY_PHASES=[
 {id:'dawn', n:'🌅 晨曦',sunY:7, keyC:0xffb37a, ambC:0x9a6b8a, fogMix:.55, keyI:.4, rainP:.15, wet:0},
 {id:'day',  n:'☀️ 白昼',sunY:18,keyC:0xffffff, ambC:0xb08fd0, fogMix:.3,  keyI:.5,  rainP:.05, wet:0},
 {id:'dusk', n:'🌇 黄昏',sunY:9, keyC:0xff8a5c, ambC:0xa35a7a, fogMix:.6,  keyI:.45, rainP:.2, wet:0},
 {id:'night',n:'🌙 深夜',sunY:4, keyC:0x8ab4ff, ambC:0x4455aa, fogMix:.9,  keyI:.25, rainP:.3, wet:0},
];
// 天气四态
const WEATHERS=[
 {id:'clear',n:'晴',   ic:'🌤️',fogMul:1.0, rainOn:false,speed:1,  boltP:0,   wet:0},
 {id:'rain', n:'细雨', ic:'🌧️',fogMul:1.35,rainOn:true, speed:1.4,boltP:0,   wet:1},
 {id:'fog',  n:'浓雾', ic:'🌫️',fogMul:2.6, rainOn:false,speed:.9, boltP:0,   wet:.3},
 {id:'storm',n:'雷暴', ic:'⛈️',fogMul:1.7, rainOn:true, speed:2.2,boltP:.014,wet:1.5},
];
const DAY_CYCLE=150; // 一昼夜秒数（每相 37.5s）
let dayT=0, envPhase=0, envWeather=0, envWeatherT=0, envSkipWeather=false;
let lightningT=0;
function envDayIndex(){return Math.floor((dayT%DAY_CYCLE)/(DAY_CYCLE/4))%4;}
function envApply(){
  const c=CHAPTERS[chapter%CHAPTERS.length];
  const p=DAY_PHASES[envPhase],w=WEATHERS[envWeather];
  // 本章基调色与昼夜色混合
  const base=new THREE.Color(c.fog), dayC=new THREE.Color(p.ambC);
  const mixed=base.clone().lerp(new THREE.Color(p.keyC),0.25).lerp(dayC,p.fogMix*0.5);
  scene.fog.color.copy(mixed);
  setSkyTint(mixed.clone().lerp(new THREE.Color(0xffffff),.46+p.fogMix*.16));
  scene.fog.density=0.012*(w.fogMul*(p.id==='night'?1.2:1))*(D.fogMul||1);
  renderer.toneMappingExposure=c.exposure*1.05*(p.id==='night'?.92:p.id==='dawn'?1.02:1);
  ambient.color.setHex(p.ambC);key.color.setHex(p.keyC);
  key.intensity=p.keyI;key.position.set(8*Math.cos(dayT*.05),p.sunY,6+Math.sin(dayT*.05)*4);
  rain.visible=w.rainOn&&QUAL.rain;
  rain.material.size=w.id==='storm'?.16:.13;
}
function envSetPhase(i){envPhase=i%4;envApply();}
function envRollWeather(){
  const p=DAY_PHASES[envPhase];
  const r=Math.random();
  let acc=0,pick=0;
  for(let i=0;i<WEATHERS.length;i++){
    const w=WEATHERS[i];
    // 晴天偏多，昼夜影响概率
    let pw=(w.id==='clear')?0.5:(w.id==='rain')?(0.3+p.rainP*0.6):(w.id==='fog')?0.12:(0.08+p.rainP*0.4);
    acc+=pw;if(r<acc){pick=i;break;}}
  envWeather=pick;envWeatherT=22+Math.random()*24;
  // 天气切换提示（每日挑战/无尽不打扰）
  if(WEATHERS[pick].id!=='clear'&&started)tip(`${WEATHERS[pick].ic} 天气转变：${WEATHERS[pick].n}`);
  envApply();
  // v28：雨天/雷暴 → 提示地面开始积水（水洼实时反射）
  if(started&&(WEATHERS[pick].id==='rain'||WEATHERS[pick].id==='storm'))
    setTimeout(()=>{if(started)tip('💧 地面开始积水 · 水洼实时倒映霓虹');},1600);
}
function updateEnv(dt){
  if(!started||hardPause)return;
  dayT+=dt;
  const ni=envDayIndex();
  if(ni!==envPhase){envSetPhase(ni);
    if(started&&!isFinite(dayT-DAY_CYCLE))dayT=dayT%DAY_CYCLE;
    tip(`🕐 时序流转：${DAY_PHASES[ni].n}`);}
  envWeatherT-=dt;
  if(envWeatherT<=0){
    if(envSkipWeather)envWeatherT=999; // v40 气候试炼：天气由相位驱动，不由随机滚动
    else envRollWeather();}
  // 雷暴闪电
  const w=WEATHERS[envWeather];
  if(w.boltP>0){
    lightningT-=dt;
    if(Math.random()<w.boltP*dt*60||lightningT<=0){
      if(Math.random()<.5){lightningT=2+Math.random()*4;
        flashOverlay('rgba(200,225,255,.32)',.12);
        const l=new THREE.PointLight(0xcfe4ff,3,80);l.position.set(player.position.x+(Math.random()-.5)*30,22,player.position.z+(Math.random()-.5)*30);
        scene.add(l);setTimeout(()=>scene.remove(l),90);}
    }
  }
  // 雨水涟漪随天气调整
  if(w.wet>1.2&&Math.random()<dt*10)spawnRipple&&spawnRipple();
}
function envHudText(){const p=DAY_PHASES[envPhase],w=WEATHERS[envWeather];return `${p.n} ${w.ic}`;}

const chests=[];let chestT=40;
function mkChest(){const g=new THREE.Group();
  const wood=new THREE.MeshStandardMaterial({color:0x8a5a2b,roughness:.7});
  const gold=new THREE.MeshStandardMaterial({color:0xffd60a,emissive:0xff9e00,emissiveIntensity:.6,metalness:.8});
  const base=new THREE.Mesh(new THREE.BoxGeometry(1,.5,.7),wood);base.position.y=.25;g.add(base);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1.04,.2,.74),wood);lid.position.set(0,.58,-.1);lid.rotation.x=-.5;g.add(lid);
  const lock=new THREE.Mesh(new THREE.BoxGeometry(.16,.22,.08),gold);lock.position.set(0,.42,.36);g.add(lock);
  [-.42,.42].forEach(x=>{const strip=new THREE.Mesh(new THREE.BoxGeometry(.08,.52,.72),gold);strip.position.set(x,.25,0);g.add(strip);});
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.5,.7,6,12,1,true),
    new THREE.MeshBasicMaterial({color:0xffd60a,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false}));
  beam.position.y=3.4;g.add(beam);
  const a=Math.random()*7;const r=8+Math.random()*8;
  g.position.set(player.position.x+Math.cos(a)*r,0,player.position.z+Math.sin(a)*r);
  const L=Math.hypot(g.position.x,g.position.z);if(L>ARENA-3)g.position.multiplyScalar((ARENA-3)/L);
  g.userData={beam,opened:false};scene.add(g);chests.push(g);
  tip('✨ 神秘宝箱出现了！去找它！');sfx.pick();}
function openChest(c){if(c.userData.opened)return;c.userData.opened=true;chestTotal++;
  burst(c.position,0xffd60a,26,9);sfx.chest();scene.remove(c);chests.splice(chests.indexOf(c),1);
  const r=Math.random();
  if(r<.32){const ups=SKILLS.filter(s=>s.type==='w'&&W[s.key].lv<5);
    if(ups.length){const u=ups[Math.floor(Math.random()*ups.length)];u.up();tip(`🎁 宝箱：${u.n} 精进！`);}
    else{S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.5);tip('🎁 宝箱：大量回血！');}}
  else if(r<.58){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.5);tip('🎁 宝箱：回血50%！');}
  else if(r<.82){S.scum=Math.min(100,S.scum+50);tip('🎁 宝箱：渣男值暴涨！按渣值条放大招！');}
  else if(r<.9){const n=1+Math.floor(Math.random()*2);addAwakenStone(n,'神秘宝箱');}
  else{gainXp(S.xpNeed);tip('🎁 宝箱：海量心动碎片！');}}
// ---------- 限时挑战（追逐感） ----------
let challenge=null,challengeT=55;
function startChallenge(){const need=8+Math.floor(S.time/60)*3;
  challenge={need,start:S.kills,t:32};
  tip(`⚡ 限时挑战：32秒内击杀 ${need} 名情敌！奖励修为大进！`);sfx.ult();}

// ---------- 主循环 ----------
const clock=new THREE.Clock();
let spawnT=2,waveIdx=0,bossAlive=false,victory=false;
let waveInfoForce=''; // 无尽模式波次提示（临时覆盖时间显示）
let endlessBossT=0; // 无尽模式：距下一波首脑的秒数
const ENDLESS_FIRST=22, ENDLESS_MIN_GAP=11; // 首波 22s，之后间隔递减至 11s
// 无尽模式：难度随波次阶梯增长（指数曲线，配合每波 +8% 已在高波次自然失控）
const ENDLESS_CFG={hpMul:1.22,dmgMul:1.10,spdMul:1.035,spawnMul:1.08};
function endlessScale(){
  const k=Math.max(0,endlessBossKills); // 已完成波次数
  return {hpMul:Math.pow(ENDLESS_CFG.hpMul,k),dmgMul:Math.pow(ENDLESS_CFG.dmgMul,k),
    spdMul:Math.min(2.2,Math.pow(ENDLESS_CFG.spdMul,k)),spawnMul:Math.pow(ENDLESS_CFG.spawnMul,k)};}
function endlessGap(){return Math.max(ENDLESS_MIN_GAP,ENDLESS_FIRST-endlessBossKills*1.6);}
// ---------- 深渊试炼（v20 觉醒解锁的高难模式）----------
const ABYSS_CFG={hpMul:1.9,dmgMul:1.35,spdMul:1.12,spawnMul:1.5};
function abyssUnlocked(){return (SAVE.awakenTotal||0)>0;}
function abyssScale(t){ // 随存活时间持续攀升
  const k=1+t/90;
  return {hpMul:ABYSS_CFG.hpMul*Math.pow(1.06,t/30),dmgMul:ABYSS_CFG.dmgMul*(1+t/600),
    spdMul:Math.min(1.8,ABYSS_CFG.spdMul),spawnMul:ABYSS_CFG.spawnMul*Math.pow(1.03,t/30)};}
let abyssBossKills=0,abyssBossT=0;
const ABYSS_FIRST=40, ABYSS_MIN_GAP=24;
function wi2(t){t=Math.max(0,Math.ceil(t));return (t>=60?`${Math.floor(t/60)}m${String(t%60).padStart(2,'0')}s`:t+'s');}
// 时间轴: [时刻秒, 类型, 数量]
const TIMELINE=[[0,'swarm',5],[15,'chaser',4],[35,'swarm',8],[50,'shooter',3],[70,'chaser',6],
  [90,'tank',2],[100,'bomber',4],[120,'swarm',12],[140,'shooter',4],[160,'tank',3],[180,'chaser',8],
  [200,'bomber',6],[220,'swarm',16],[240,'shooter',5],[260,'tank',4],[280,'chaser',10],[300,'bomber',8]];
// ========== v32：房间路线系统（Roguelite 路线选择 · 常规/每日/周赛模式） ==========
// 每清空一间房 → 弹出三选一路线卡；不同房型有各自的刷怪构成、风险与收益
let roomIdx=1,roomQuota=0,roomKills0=0,roomPick=null,runCoins=0,roomDone=false;
let roomBannerT=0,roomXpBase=null,shopStock=null,shopDone=false;
let twinLink=false; // v43 双生房标记
const ROOMS=[
 {id:'battle',ic:'⚔️',n:'遭遇战房',tag:'稳妥',cls:'',d:'常规情敌小队轮番来袭，节奏平缓，稳拿经验与心币',
  kind:['chaser','swarm','shooter']},
 {id:'elite',ic:'💀',n:'精英房',tag:'高收益',cls:'hi',d:'精英情敌坐镇（血量翻倍），经验与心币大幅加成',
  kind:['chaser','tank'],elite:.45,coin:4,xp:1.5},
 {id:'treasure',ic:'🎁',n:'宝箱房',tag:'资源',cls:'res',d:'房内散布 2 个神秘宝箱，开启即得奇招/回血/碎片',
  kind:['swarm'],chests:2},
 {id:'shop',ic:'🏪',n:'商店房',tag:'补给',cls:'sp',d:'用心币补给：回血 / 奇招精进 / 觉醒石 / 力量',
  kind:['swarm'],shop:true},
 {id:'curse',ic:'☠️',n:'危机房',tag:'豪赌',cls:'hi',d:'情敌数量与伤害大增，但经验 ×2.5 且必得觉醒石',
  kind:['chaser','shooter','bomber','swarm'],mult:1.5,xp:2.5,coin:6,awaken:1},
 {id:'date',ic:'💕',n:'邂逅房',tag:'养成',cls:'res',d:'房内必现一位少女，好感与心币双收',
  kind:['swarm','chaser'],npc:true,coin:3},
 // ===== v43 新增 5 种事件房 =====
 {id:'gamble',ic:'🎰',n:'赌坊房',tag:'豪赌',cls:'hi',d:'押上全部心币赌一把：五成翻倍，五成归零',
  kind:['swarm'],event:'gamble',coin:0},
 {id:'altar',ic:'🕯️',n:'祭坛房',tag:'代价',cls:'hi',d:'献祭一项属性换取另一项永久强化——天下没有免费的午餐',
  kind:['chaser','shooter'],event:'altar',coin:2},
 {id:'twinroom',ic:'👯',n:'双生房',tag:'考验',cls:'hi',d:'双生情敌共享血量，必须几乎同时击杀，否则复活一只',
  kind:['chaser'],event:'twinroom',coin:5,xp:1.6},
 {id:'portal',ic:'🌀',n:'传送门房',tag:'捷径',cls:'sp',d:'跳过接下来的两间房，但放弃途中所有奖励',
  kind:['swarm'],event:'portal',coin:1},
 {id:'night',ic:'🍜',n:'夜市房',tag:'补给',cls:'sp',d:'用经验值买小吃：回血 / 加属性 / 延长时间',
  kind:['swarm'],event:'night',coin:2},
];
function roomScale(){const k=roomIdx-1;return {hpMul:1+k*.17,dmgMul:1+k*.075,spawnMul:Math.min(2.4,1+k*.06)};}

// ========== v43 事件房系统 ==========
// 进入事件房 → 先弹事件面板（不暂停战斗太久，面板一关就开打）
const EVENT_DEFS={
 // 🎰 赌坊：押上全部心币，五五开
 gamble:{
  title:'🎰 赌坊 · 押上一切',
  build:()=>{
    const bet=runCoins;
    return `<div class="evD">发牌人笑得很甜：「押多少？赢了翻倍，输了一分不剩。」</div>
      <div class="evRow"><span>当前心币</span><b>💗 ${bet}</b></div>
      <div class="evRow"><span>可押注</span><b>💗 ${bet}</b></div>
      <button class="evBtn hi" id="evGamble">🎲 押上全部（五五开）</button>
      <button class="evBtn" id="evSkip">😰 算了，我只是路过</button>`;},
 bind:()=>{
   document.getElementById('evGamble').onclick=()=>{
     const bet=runCoins;closeEventPanel();
     if(bet<=0){tip('🎰 你连心币都没有，发牌人把你轰了出去');return;}
     const win=Math.random()<.5;
     if(win){runCoins+=bet;SAVE.gambleWin=(SAVE.gambleWin||0)+1;writeSave();
       sfx.evo();shake(.5);burst(player.position,0xffd60a,26,11);
       tip(`🎉 赌赢了！心币 +${bet}（现有 ${runCoins}）`);}
     else{runCoins=0;sfx.hurt();shake(.7);
       tip(`💸 全输了……发牌人：「下次再来啊。」`);}
   };
   document.getElementById('evSkip').onclick=()=>{closeEventPanel();tip('🎰 你明智地离开了赌桌');};
 }},
 // 🕯️ 祭坛：献祭换强化
 altar:{
  title:'🕯️ 祭坛 · 代价交换',
  build:()=>`<div class="evD">烛火摇曳，供桌上有三张泛黄的契约。签哪一张，就失去什么，也得到什么。</div>
    <button class="evBtn hi" id="evA1">💔 献祭 20% 生命上限 → 伤害 +15%</button>
    <button class="evBtn hi" id="evA2">💨 献祭 10% 移速 → 暴击率 +10%</button>
    <button class="evBtn hi" id="evA3">👁️ 献祭 30% 拾取范围 → 经验 +25%</button>
    <button class="evBtn" id="evSkip">🙏 什么都不签，鞠个躬就走</button>`,
  bind:()=>{
    const pick=(fn,msg)=>{fn();SAVE.altarSign=(SAVE.altarSign||0)+1;writeSave();
      closeEventPanel();sfx.evo();shake(.4);
      burst(player.position,0x8b1a3a,24,10);tip('🕯️ '+msg);};
    document.getElementById('evA1').onclick=()=>pick(()=>{
      const cut=Math.round(S.maxHp*.2);S.maxHp-=cut;S.hp=Math.min(S.hp,S.maxHp);S.dmgMul*=1.15;},
      `献祭 ${Math.round(S.maxHp*.2)} 生命上限，伤害 +15%`);
    document.getElementById('evA2').onclick=()=>pick(()=>{S.spd*=.9;S.critC=Math.min(.9,S.critC+.10);},
      '献祭 10% 移速，暴击率 +10%');
    document.getElementById('evA3').onclick=()=>pick(()=>{S.pickR*=.7;S.xpMul=(S.xpMul||1)*1.25;},
      '献祭 30% 拾取范围，经验 +25%');
    document.getElementById('evSkip').onclick=()=>closeEventPanel();
  }},
 // 👯 双生房：不弹面板，直接改刷怪逻辑
 twinroom:{title:'👯 双生情敌',skipPanel:true},
 // 🌀 传送门：跳两房
 portal:{
  title:'🌀 传送门 · 抄近路',
  build:()=>`<div class="evD">一道漩涡悬在半空。穿过去能省下两间房的时间——但路上的一切你都拿不到了。</div>
    <div class="evRow"><span>当前房号</span><b>第 ${roomIdx} 房</b></div>
    <div class="evRow"><span>跳跃后</span><b>第 ${roomIdx+2} 房</b></div>
    <button class="evBtn hi" id="evGo">🌀 穿过去（跳过 2 房）</button>
    <button class="evBtn" id="evSkip">🚶 老实走路</button>`,
  bind:()=>{
    document.getElementById('evGo').onclick=()=>{
      closeEventPanel();SAVE.portalUse=(SAVE.portalUse||0)+1;writeSave();
      roomIdx+=2; // 选择时已 +1，再跳 2 → 直接落到 +3 那间
      sfx.evo();shake(.6);burst(player.position,0x4cc9f0,34,13);
      tip(`🌀 一跃千里！直接抵达第 ${roomIdx} 房`);
      // 强制推进章节判定
      if((roomIdx-1)%4===0&&chapter<CHAPTERS.length-1){
        applyChapter(chapter+1);tip(`📖 ${CHAPTERS[chapter].name}`);showLetter(chapter);}
      roomDone=true;} // 让房间立即判定完成，回到路线选择
    ;
    document.getElementById('evSkip').onclick=()=>closeEventPanel();
  }},
 // 🍜 夜市：用经验值买补给
 night:{
  title:'🍜 夜市 · 经验换补给',
  build:()=>{
    const xp=Math.floor(S.xp);
    return `<div class="evD">深夜的路边摊，老板娘说：「小伙子，看你打了一晚上，来点热的？」</div>
      <div class="evRow"><span>可用经验</span><b>✦ ${xp}</b></div>
      <button class="evBtn hi" id="evN1">🍜 一碗热汤（✦30）→ 回血 45%</button>
      <button class="evBtn hi" id="evN2">🍢 烤串（✦45）→ 生命上限 +30</button>
      <button class="evBtn hi" id="evN3">🍵 解酒茶（✦40）→ 移速 +6%</button>
      <button class="evBtn" id="evSkip">🌙 没钱，看看就走</button>`;},
  bind:()=>{
    const buy=(cost,fn,msg)=>{
      if(S.xp<cost){tip(`✦ 经验不足（需要 ${cost}）`);return;}
      S.xp-=cost;fn();SAVE.nightBuy=(SAVE.nightBuy||0)+1;writeSave();
      closeEventPanel();sfx.chest();tip('🍜 '+msg);};
    document.getElementById('evN1').onclick=()=>buy(30,()=>{S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.45);},'一碗热汤下肚，回血 45%');
    document.getElementById('evN2').onclick=()=>buy(45,()=>{S.maxHp+=30;S.hp+=30;},'烤串加成，生命上限 +30');
    document.getElementById('evN3').onclick=()=>buy(40,()=>{S.spd*=1.06;},'解酒茶，移速 +6%');
    document.getElementById('evSkip').onclick=()=>closeEventPanel();
  }},
};
function closeEventPanel(){
  const m=document.getElementById('modal');if(m)m.style.display='none';
  paused=false;
  if(typeof evAfterClose==='function'){const f=evAfterClose;evAfterClose=null;f();}}
let evAfterClose=null;
function openEventPanel(kind){
  const d=EVENT_DEFS[kind];if(!d||!d.build){return false;}
  const h2=document.querySelector('#modal h2');if(h2)h2.textContent=d.title;
  const c=document.getElementById('cards');c.innerHTML='';
  const box=document.createElement('div');box.className='evBox';box.innerHTML=d.build();
  c.appendChild(box);
  document.getElementById('modal').style.display='flex';paused=true;
  try{d.bind();}catch(e){console.warn('[EV]',e);}
  return true;}
function roomKills(){return S.kills-roomKills0;}
function modalHidden(){return document.getElementById('modal').style.display!=='flex';}
function startRoom(def){
  roomPick=def;roomDone=false;roomKills0=S.kills;spawnT=1.0;
  const base=6+Math.floor(roomIdx*1.7);
  roomQuota=Math.round(base*(def.id==='curse'?1.5:def.id==='elite'?.65:def.id==='treasure'?.85:1));
  // 经验倍率：以本局基准为锚，避免逐房叠乘
  if(roomXpBase===null)roomXpBase=S.xpMul||1;
  S.xpMul=roomXpBase*(def.xp||1);
  if(def.chests)for(let i=0;i<def.chests;i++)mkChest();
  if(def.npc)setTimeout(()=>{if(S.alive&&!dlgActive)trySpawnNpc();},900);
  if(def.awaken){addAwakenStone(1,'危机房豪赌');tip('☠️ 危机房开启：觉醒石 ×1 已到手，务必小心！');}
  if(def.shop){shopDone=false;let tries=0;
    const tryOpen=()=>{if(!S.alive||shopDone)return;
      if(modalHidden()){shopDone=true;openRoomShop();}
      else if(++tries<4)setTimeout(tryOpen,900);};
    setTimeout(tryOpen,600);}
  showRoomBanner(roomIdx,def);sfx.card();
  // v43：事件房 → 延迟弹面板（等横幅吸引注意后再出选项）
  if(def.event&&EVENT_DEFS[def.event]&&!EVENT_DEFS[def.event].skipPanel){
    let tries=0;
    const tryOpen=()=>{if(!S.alive||!started)return;
      if(modalHidden()){openEventPanel(def.event);}
      else if(++tries<5)setTimeout(tryOpen,700);};
    setTimeout(tryOpen,900);}
  // v43：双生房 → 刷一对共享血量的精英
  if(def.event==='twinroom'){
    setTimeout(()=>{if(!S.alive)return;
      const a=mkEnemy('tank'),b=mkEnemy('tank');
      const baseHp=160*(1+roomIdx*.22);
      for(const g of [a,b]){
        g.userData.hp=baseHp;g.userData.maxHp=baseHp;g.userData.elite=true;
        g.userData.dmg*=1.2;g.userData.twinPair=true;
        g.position.set((g===a?-1:1)*3,0,-8);applyEliteAffix(g);
        g.userData.affix='twinpair';}
      // 共享血量：一方掉血，另一方同步
      for(const g of [a,b]){const o=(g===a?b:a);
        g.userData.twinOther=o;}
      tip('👯 双生情敌登场：共享血量，只杀一只是没用的');
      twinLink=true;
    },1200);}
  // 章节推进：每 4 间房进入下一章（替代常规模式的 240 秒计时）
  if(roomIdx>1&&(roomIdx-1)%4===0){
    applyChapter(chapter+1);
    tip(`📖 ${CHAPTERS[chapter].name} —— ${CHAPTERS[chapter].desc}`);
    showLetter(chapter);burst(player.position,0x4cc9f0,30,11);shake(.35);}
}
function showRoomBanner(i,def){
  const rb=document.getElementById('roomBar');if(!rb)return;
  rb.querySelector('.rbTag').textContent=`🏠 第 ${i} 房 · ${def.ic} ${def.n}`;
  rb.querySelector('.rbSub').textContent=def.d;
  rb.style.opacity=1;roomBannerT=2.8;}
function showRouteChoice(){
  const pool=ROOMS.slice(),picks=[];
  while(picks.length<3&&pool.length)picks.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  const h2=document.querySelector('#modal h2');if(h2)h2.textContent='🚪 路线选择 · 你走向哪间房';
  const c=document.getElementById('cards');c.innerHTML='';
  picks.forEach(def=>{
    const d=document.createElement('div');d.className='card rm'+(def.cls?' '+def.cls:'');
    const coin=Math.max(3,Math.round(3+roomIdx*.7+(def.coin||0)));
    d.innerHTML=`<div class="ic">${def.ic}</div><div><h3>${def.n}</h3><p>${def.d}</p></div>`+
      `<div class="rmTag">${def.tag} 💗${coin}</div>`;
    d.onclick=()=>{
      document.getElementById('modal').style.display='none';
      const got=Math.round(coin*(D.coinMul||1));
      runCoins+=got;roomIdx++;
      tip(`🚪 进入 ${def.ic} ${def.n} · 心币 +${got}`);
      startRoom(def);paused=false;};
    c.appendChild(d);});
  document.getElementById('modal').style.display='flex';}
// 商店房：心币补给
const ROOM_SHOP=[
 {k:'heal',ic:'❤️',n:'滋补情话',d:'立即回复 50% 生命',cost:8,
  do:()=>{S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.5);}},
 {k:'skill',ic:'🌹',n:'奇招精进',d:'随机一个已解锁奇招 +1 级',cost:14,
  do:()=>{const ups=Object.keys(W).filter(k=>W[k]&&W[k].lv>0&&W[k].lv<5);
    if(!ups.length){S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.25);return '已全部满级 · 改为回血 25%';}
    const k=ups[Math.floor(Math.random()*ups.length)];W[k].lv++;if(k==='orbit')syncOrbits();
    return `「${(SKILLS.find(s=>s.key===k)||{}).n||k}」升至 Lv.${W[k].lv}`;}},
 {k:'stone',ic:'💠',n:'觉醒石',d:'觉醒石 +1（武器觉醒材料）',cost:22,
  do:()=>{addAwakenStone(1,'商店购买');}},
 {k:'power',ic:'⚡',n:'渣男力量',d:'本局伤害 +12%',cost:18,
  do:()=>{S.dmgMul*=1.12;}},
];
function openRoomShop(){
  if(!modalHidden())return; // 升级面板优先
  const h2=document.querySelector('#modal h2');if(h2)h2.textContent=`🏪 商店房 · 可用心币 💗${runCoins}`;
  const c=document.getElementById('cards');
  const render=()=>{
    if(h2)h2.textContent=`🏪 商店房 · 可用心币 💗${runCoins}`;
    c.innerHTML='';
    ROOM_SHOP.forEach(it=>{
      const afford=runCoins>=it.cost;
      const d=document.createElement('div');d.className='card rm sp'+(afford?'':' dis');
      d.innerHTML=`<div class="ic">${it.ic}</div><div><h3>${it.n}</h3><p>${it.d}</p></div>`+
        `<div class="price">💗${it.cost}</div>`;
      d.onclick=()=>{
        if(runCoins<it.cost){tip('💗 心币不足');return;}
        runCoins-=it.cost;const msg=it.do();sfx.card();
        tip(`🏪 已购买「${it.n}」${typeof msg==='string'?' · '+msg:''}`);
        render();};
      c.appendChild(d);});
    const leave=document.createElement('div');leave.className='card rm';
    leave.innerHTML=`<div class="ic">🚪</div><div><h3>离开商店</h3><p>带着补给继续闯关</p></div><div class="rmTag">出发</div>`;
    leave.onclick=()=>{document.getElementById('modal').style.display='none';paused=false;
      const hh=document.querySelector('#modal h2');if(hh)hh.textContent='✦ 渣男秘籍 · 三选一 ✦';};
    c.appendChild(leave);};
  render();
  document.getElementById('modal').style.display='flex';paused=true;}

// ========== v33：影子对战（异步 PK · 无需联网也能打"好友影子"） ==========
// 录制：每 0.5s 采样玩家轨迹，上限 10 分钟；结算时把击杀最高的 3 局存为影子。
// 挑战：影子复刻录制轨迹移动 + 发射情话弹幕，120 秒内打空其血量即胜（离线异步 PK）。
const GHOST_MAX=3,GHOST_SAMPLE=.5,GHOST_PATH_MAX=1200,GHOST_TIME=120;
let ghostRec=[],ghostRecT=0,ghostEnt=null,ghostLeft=0,ghostResult=null,ghostMinionT=16,pendingGhost=null;
function ghostPath(){
  const p=ghostRec;if(p.length<=600)return p.slice();
  const step=Math.ceil(p.length/600),out=[];
  for(let i=0;i<p.length;i+=step)out.push(p[i]);
  return out;}
function saveGhost(){
  if(ghostRec.length<12||S.kills<=0)return null;
  const d=new Date();
  const g={kills:S.kills,lvl:S.lvl,realm:realmName(S.lvl),
    lvls:Object.keys(W).map(k=>W[k].lv||0).join(''),
    path:ghostPath(),t:Date.now(),date:`${d.getMonth()+1}/${d.getDate()}`};
  SAVE.ghosts=SAVE.ghosts||[];
  SAVE.ghosts.push(g);
  SAVE.ghosts.sort((a,b)=>(b.kills||0)-(a.kills||0));
  SAVE.ghosts=SAVE.ghosts.slice(0,GHOST_MAX);
  writeSave();return g;}
// 分享码 → 确定性虚拟影子（同一个分享码永远生成同一个对手）
function ghostFromCode(code){
  const r=parseShareCode(code);if(!r)return null;
  let s=(r.seed||7919)>>>0;
  const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const kills=40+Math.floor(rnd()*140),lvl=8+Math.floor(rnd()*40);
  const path=[],n=110,a0=rnd()*7;
  for(let i=0;i<n;i++){const a=a0+i*.11,rad=5+Math.sin(i*.23)*4.5+rnd()*1.6;
    path.push([Math.round(Math.cos(a)*rad*10)/10,Math.round(Math.sin(a)*rad*10)/10]);}
  return {kills,lvl,realm:realmName(lvl),lvls:'',path,t:0,date:'分享码',fromCode:true,code:r.code};}
function ghostStats(gd){const k=Math.max(0,(gd&&gd.kills)||0);
  return {hp:Math.round(420+k*7),dmg:12+k*.20,spd:3.2+Math.min(1.4,k*.006),shots:3+Math.floor(k/70)};}
function mkGhostEntity(gd){
  gd=gd||{kills:60,path:[]};
  const st=ghostStats(gd);
  const h=mkHumanoid(0x2a0a3a,0x160520,1.06,1,2,{bottom:0x140418,trim:0xc77dff,skin:0xc0a8ce,
    iris:0xc77dff,style:'hero',outline:true,outlineCol:0x1a0620,outlineThick:.026});
  const g=h.g,mats=[];
  g.traverse(o=>{if(!o.isMesh||!o.material)return;const m=o.material;
    if(m.transparent!==undefined){m.transparent=true;m.opacity=.9;}
    if(m.emissive!==undefined&&m.emissive&&m.emissive.setHex){m.emissive.setHex(0x7b2ff7);m.emissiveIntensity=.32;}
    mats.push(m);});
  const ring=new THREE.Mesh(new THREE.RingGeometry(.7,1.05,30),
    new THREE.MeshBasicMaterial({color:0xc77dff,transparent:true,opacity:.55,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.06;g.add(ring);
  const aura=new THREE.PointLight(0x9d4edd,1.0,11);aura.position.y=1.6;g.add(aura);
  const p0=(gd.path&&gd.path.length)?gd.path[0]:[0,0];
  g.position.set(p0[0]||0,0,p0[1]||0);
  g.userData={ghost:true,gd,hp:st.hp,maxHp:st.hp,dmg:st.dmg,spd:st.spd,shots:st.shots,
    mats,baseEI:mats.map(m=>m.emissiveIntensity||0),ring,aim:0,tgt:0,shootT:1.8,hitT:0,slowT:0,
    charmed:0,type:'ghost',kickCd:3,slowF:1,j:h.j,boss:false,elite:false,
    stride:{f:9,a:.85,lean:.2}};
  scene.add(g);enemies.push(g);ghostEnt=g;
  return g;}
// 影子 AI：复刻轨迹行进 + 扇形情话弹幕 + 近身击退
function ghostAI(e,u,pp,dt,L,d){
  const path=(u.gd&&u.gd.path)||[];
  if(path.length>1){
    u.tgt=u.tgt||0;
    let ti=Math.floor(u.tgt)%path.length,tp=new THREE.Vector3(path[ti][0],0,path[ti][1]);
    const to=tp.clone().sub(e.position).setY(0),dist=to.length();
    if(dist<.6)u.tgt=(u.tgt+1)%path.length;
    else{e.position.addScaledVector(to.normalize(),Math.min(u.spd*dt,dist));}
  }else{
    const a=performance.now()/2600;
    e.position.lerp(new THREE.Vector3(Math.cos(a)*8,0,Math.sin(a)*8),Math.min(1,dt*1.2));
  }
  if(L>0)e.rotation.y=Math.atan2(d.x,d.z)+Math.PI;
  if(u.ring)u.ring.rotation.z+=dt*2.2;
  // 情话弹幕：扇形齐射
  u.shootT-=dt;
  if(u.shootT<=0&&L<26){
    u.shootT=1.5;
    const n=u.shots||3,base=Math.atan2(d.z,d.x);
    for(let i=0;i<n;i++){const ang=base+(i-(n-1)/2)*.22;
      const b=new THREE.Mesh(G.eBullet,M.eBullet);b.position.copy(e.position).setY(1);
      const v=new THREE.Vector3(Math.cos(ang),0,Math.sin(ang));
      b.userData={v:v.multiplyScalar(11),dmg:u.dmg,life:2.6};scene.add(b);eBullets.push(b);}
    sfx.hit();}
  // 近身击退
  u.kickCd-=dt;
  if(L<2.2&&u.kickCd<=0){
    u.kickCd=3;
    const kd=pp.clone().sub(e.position).setY(0);
    if(kd.lengthSq()>0)player.position.add(kd.normalize().multiplyScalar(2.2));
    hurtPlayer(u.dmg*.6);burst(e.position.clone().setY(1),0xc77dff,10,6);shake(.25);}}
function onGhostDefeated(e,idx){
  const gd=e.userData.gd||{};
  burst(e.position.clone().setY(1),0xc77dff,42,15);shake(.6);slowMotion(.25,1.8);
  scene.remove(e);enemies.splice(idx,1);ghostEnt=null;
  ghostResult='win';
  SAVE.ghostWins=(SAVE.ghostWins||0)+1;
  if(gd.fromCode)SAVE.ghostCodeWins=(SAVE.ghostCodeWins||0)+1;
  SAVE.bonusPts=(SAVE.bonusPts||0)+8;
  addAwakenStone(1,'击败影子');writeSave();
  tip('🥊 影子溃散！你比"影子"更强 —— 觉醒石 ×1 · 成就点数 +8');
  setTimeout(()=>{if(!S.alive)return;gameOver();},1200);}
function closeGhostModal(){
  document.getElementById('modal').style.display='none';paused=false;
  const h=document.querySelector('#modal h2');if(h)h.textContent='✦ 渣男秘籍 · 三选一 ✦';}
// 选定影子对手 → 切到影子模式并开局（无论从哪张卡进入都统一走这里）
function startGhostFight(gd){
  pendingGhost=gd||{kills:60,lvl:12,realm:'随机影子',path:[],date:'默认',fromCode:false};
  setMode('ghost');
  closeGhostModal();
  setTimeout(()=>document.getElementById('startBtn').click(),60);}
function openGhostSelect(){
  const h2=document.querySelector('#modal h2');if(h2)h2.textContent='🥊 影子对战 · 选择对手';
  const c=document.getElementById('cards');c.innerHTML='';
  const list=SAVE.ghosts||[];
  if(!list.length){
    const d=document.createElement('div');d.className='card rm';
    d.innerHTML=`<div class="ic">🕳️</div><div><h3>还没有自己的影子</h3><p>先打一局常规闯关，系统会把你的战斗轨迹录成影子对手</p></div><div class="rmTag">提示</div>`;
    d.onclick=()=>{document.getElementById('modal').style.display='none';};c.appendChild(d);}
  list.forEach((g,i)=>{
    const st=ghostStats(g);
    const d=document.createElement('div');d.className='card rm sp';
    d.innerHTML=`<div class="ic">🥊</div><div><h3>我的影子 #${i+1} · ${g.realm||'—'}</h3>`+
      `<p>击杀 ${g.kills||0} · 血量 ${st.hp} · 伤害 ${Math.round(st.dmg)} · ${g.date||''}</p></div><div class="rmTag">挑战</div>`;
    d.onclick=()=>startGhostFight(g);
    c.appendChild(d);});
  const cd=document.createElement('div');cd.className='card rm hi';
  cd.innerHTML=`<div class="ic">🎟️</div><div><h3>挑战好友影子 · 分享码</h3>`+
    `<p>先在「分享码」输入框粘贴好友的码，再点这里；同一码永远生成同一个对手</p></div><div class="rmTag">输入码</div>`;
  cd.onclick=()=>{
    const inp=document.getElementById('shareInput');
    const gg=ghostFromCode(inp?inp.value.trim():'');
    if(!gg){tip('🎟️ 分享码无效（格式 ZNTX-XXXXXX），请先粘贴好友分享码');return;}
    startGhostFight(gg);};
  c.appendChild(cd);
  const rnd=document.createElement('div');rnd.className='card rm';
  rnd.innerHTML=`<div class="ic">🎲</div><div><h3>随机影子</h3><p>立即生成一个未知强度的影子对手</p></div><div class="rmTag">速战</div>`;
  rnd.onclick=()=>{
    const p=[],n=110,ph=Math.random()*7;
    for(let i=0;i<n;i++){const a=ph+i*.11+(Math.random()-.5)*.05,rad=4.5+Math.sin(i*.27)*4+Math.random()*1.8;
      p.push([Math.round(Math.cos(a)*rad*10)/10,Math.round(Math.sin(a)*rad*10)/10]);}
    pendingGhost={kills:40+Math.floor(Math.random()*140),lvl:10+Math.floor(Math.random()*40),
      realm:'随机影子',path:p,date:'随机生成',fromCode:false};
    startGhostFight(pendingGhost);};
  c.appendChild(rnd);
  const back=document.createElement('div');back.className='card rm';
  back.innerHTML=`<div class="ic">↩️</div><div><h3>返回</h3><p>取消挑战，回到开局界面</p></div><div class="rmTag">取消</div>`;
  back.onclick=()=>{setMode('normal');closeGhostModal();};
  c.appendChild(back);
  document.getElementById('modal').style.display='flex';}
function loop(){requestAnimationFrame(loop);
  const rawDt=Math.min(clock.getDelta(),.05);
  try{dhTick();}catch(e){} // v63：视频数字人贴片面向相机 + 蒙版时钟同步
  try{dh2Tick(rawDt);}catch(e){} // v64：全身数字人行走/呼吸/billboard
  try{envTickBillboard();}catch(e){} // v65.1：AI 道具朝向相机
  try{spawnStreetGirls();tickStreetGirls(clock.elapsedTime);}catch(e){} // v66：街头女主踱步
  // 演出时间轴（慢动作/顿帧）
  if(F.slowT>0){F.slowT-=rawDt;if(F.slowT<=0)F.slow=1;}
  if(F.zoomT>0)F.zoomT-=rawDt;
  if(F.bossIntro>0)F.bossIntro-=rawDt;
  if(F.replayT>0){F.replayT-=rawDt;renderReplayOverlay();}
  updateReplayRecord(rawDt);
  if(hitStop>0)hitStop-=rawDt;
  const dt=rawDt*(hitStop>0?.05:F.slow);
  // 对话触发检测（独立于暂停，避免对话后卡死）
  if(started&&S.alive&&!victory&&!dlgActive){
    for(let i=npcs.length-1;i>=0;i--){const n=npcs[i];
      if(n.position.distanceTo(player.position)<1.9){startDialogue(n);break;}}}
  const t=performance.now()/1000;
  // ---- 成就检测（0.5s 节流）+ 弹窗队列 ----
  if(started&&S.alive){achT-=rawDt;if(achT<=0){achT=.5;checkAch();}}
  if(achQueue.length&&achPop<=0)popAch();
  if(achPop>0)achPop-=rawDt;
  floaters.forEach(m=>{m.position.y=m.userData.y+Math.sin(t*m.userData.s)*2;m.rotation.y+=dt*.15;});
  // 雨丝下落 + 涟漪
  {const rp=rainGeo.attributes.position.array;
    const cx=player.position.x,cz=player.position.z;
    for(let i=0;i<RAIN_N;i++){rp[i*3+1]-=rainSpd[i]*dt;
      if(rp[i*3+1]<0){rp[i*3+1]=32;rp[i*3]=(Math.random()-.5)*90+cx;rp[i*3+2]=(Math.random()-.5)*90+cz;}
      else{ // 跟随玩家视域平移
        const dx=rp[i*3]-cx;if(dx>45)rp[i*3]-=90;else if(dx<-45)rp[i*3]+=90;
        const dz=rp[i*3+2]-cz;if(dz>45)rp[i*3+2]-=90;else if(dz<-45)rp[i*3+2]+=90;}}
    rainGeo.attributes.position.needsUpdate=true;
    if(Math.random()<dt*14)spawnRipple();
    for(let i=ripples.length-1;i>=0;i--){const m=ripples[i];m.userData.life-=dt;
      const s=1+(1-m.userData.life/(m.userData.max||.8))*2.6;m.scale.set(s,s,1);
      m.material.opacity=Math.max(0,m.userData.life)*.5;
      if(m.userData.life<=0){scene.remove(m);ripples.splice(i,1);}}
    // v28：积水湿度与实时反射（雨/雷暴时地面出现水洼倒影）
    updatePuddles(dt,t,Math.min(1,(WEATHERS[envWeather].wet||0)/1.2));}
  if(hurtFxT>0)hurtFxT-=dt;if(levelUpFxT>0)levelUpFxT-=dt;
  faceTick(dt); // v29：统一驱动所有角色的表情（眨眼/口型/情绪过渡）
  treeTick(t);  // v29：树木随风摇曳
  syncAwakenAura();updateAwakenAura(dt,performance.now()/1000);
  // v32：房间横幅淡出
  if(roomBannerT>0){roomBannerT-=rawDt;if(roomBannerT<=0){const rb=document.getElementById('roomBar');if(rb)rb.style.opacity=0;}}
  // v32：房间完成 → 路线选择（置于暂停门控之外，保证升级面板结束后仍能弹出）
  if(started&&S.alive&&!victory&&roomDone&&pendingLvl<=0&&!dlgActive&&modalHidden()&&gameMode==='normal'){
    paused=true;showRouteChoice();}
  if(started&&!hardPause&&S.alive&&!victory&&!paused&&!dlgActive){
    S.time+=dt;
    // ---- 恋人必杀冷却 ----
    {let need=false;for(let i=0;i<4;i++)if(loverCd[i]>0){loverCd[i]-=dt;need=true;}
     if(need)renderLoverBtns();}
    // ---- 章节切换（常规模式改为「每 4 间房」推进，见 startRoom） ----
    if(gameMode!=='normal'){
      chapterT-=dt;
      if(chapterT<=0){chapterT=240;applyChapter(chapter+1);
        tip(`📖 ${CHAPTERS[chapter].name} —— ${CHAPTERS[chapter].desc}`);
        showLetter(chapter); // 章节信件演出
        burst(player.position,0x4cc9f0,30,11);shake(.35);}}
    // ---- 昼夜 & 天气 ----
    updateEnv(dt);
    updateClimatePhase(dt);
    updateAmbient(dt);
    // ---- 宝箱与挑战 ----
    chestT-=dt;if(chestT<=0){mkChest();chestT=38+Math.random()*14;}
    for(let i=chests.length-1;i>=0;i--){const c=chests[i];
      c.userData.beam.material.opacity=.15+.12*Math.abs(Math.sin(t*3));
      c.rotation.y+=dt*.8;
      if(c.position.distanceTo(player.position)<1.5)openChest(c);}
    if(!challenge){challengeT-=dt;if(challengeT<=0&&S.time>20){startChallenge();}}
    else{challenge.t-=dt;
      if(S.kills-challenge.start>=challenge.need){
        gainXp(Math.round(challenge.need*2.2));S.hp=Math.min(S.maxHp,S.hp+20);challengeWins++;
        tip('🏆 挑战达成！修为大进！');sfx.challenge();burst(player.position,0x4cc9f0,30,10);
        challenge=null;challengeT=70;}
      else if(challenge.t<=0){tip('💔 挑战失败…下次手速快点！');challenge=null;challengeT=60;}}
    // ---- 心动邂逅（约会循环） ----
    {npcTimer-=dt;
     for(let i=0;i<4;i++)if(npcCd[i]>0)npcCd[i]-=dt;
     if(npcTimer<=0){npcTimer=8;trySpawnNpc();}}
    // NPC表现与交互（少女步态：轻盈小碎步+裙摆发丝摇曳）
    for(let i=npcs.length-1;i>=0;i--){const n=npcs[i];const j2=n.userData.j;
      n.position.y=Math.abs(Math.sin(t*3))*.08;
      const ph=t*6+i;
      j2.armL.rotation.x=Math.sin(ph)*.3;j2.armR.rotation.x=-Math.sin(ph)*.3;
      j2.armL.rotation.z=.3;j2.armR.rotation.z=-.3;
      if(j2.armL.userData.elbow)j2.armL.userData.elbow.rotation.x=-.3-Math.sin(ph)*.18;
      if(j2.armR.userData.elbow)j2.armR.userData.elbow.rotation.x=-.3+Math.sin(ph)*.18;
      j2.legL.rotation.x=-Math.sin(ph)*.35;j2.legR.rotation.x=Math.sin(ph)*.35;
      if(j2.legL.userData.knee)j2.legL.userData.knee.rotation.x=Math.max(0,Math.sin(ph))*.4;
      if(j2.legR.userData.knee)j2.legR.userData.knee.rotation.x=Math.max(0,-Math.sin(ph))*.4;
      (j2.hairSway||[]).forEach((h2,k)=>{h2.rotation.z=Math.sin(t*2.6+k*1.7)*.13;
        h2.rotation.x=Math.sin(t*2.1+k)*.07;});
      if(j2.robeG)j2.robeG.rotation.z=Math.sin(ph)*.045;
      if(j2.robe)j2.robe.rotation.x=Math.sin(ph*2)*.05;
      if(j2.face){ // 邂逅中的少女：抬头望向玩家，说话时口型开合
        const d2=n.position.distanceTo(player.position);
        j2.face.tgt=d2<7?(dialogueSpeaker===n?EXPR.smile:EXPR.shy):EXPR.neutral;
        if(dialogueSpeaker===n&&dlgActive)j2.face.speak=Math.max(0,Math.sin(t*11)*.32+.3);
        else j2.face.speak=0;}
      n.children.forEach(c=>{if(c.geometry&&c.geometry.type==='RingGeometry')c.material.opacity=.4+.4*Math.abs(Math.sin(t*4));});
      n.lookAt(player.position.x,0,player.position.z);
      if(n.position.distanceTo(player.position)<1.9)startDialogue(n);}
    // 伙伴跟随（结缘少女优雅并走）
    followers.forEach((f,i)=>{const a=t*1.5+i*2.4;
      const tx=player.position.x-Math.sin(a)*1.6,tz=player.position.z+Math.cos(a)*1.6;
      f.g.position.lerp(new THREE.Vector3(tx,0,tz),dt*5);
      f.g.position.y=Math.abs(Math.sin(t*6+i))*.1;
      const ph=t*7+i;
      f.j.armL.rotation.x=Math.sin(ph)*.4;f.j.armR.rotation.x=-Math.sin(ph)*.4;
      f.j.legL.rotation.x=-Math.sin(ph)*.5;f.j.legR.rotation.x=Math.sin(ph)*.5;
      if(f.j.armL.userData.elbow)f.j.armL.userData.elbow.rotation.x=-.4-Math.sin(ph)*.2;
      if(f.j.armR.userData.elbow)f.j.armR.userData.elbow.rotation.x=-.4+Math.sin(ph)*.2;
      if(f.j.legL.userData.knee)f.j.legL.userData.knee.rotation.x=Math.max(0,Math.sin(ph))*.5;
      if(f.j.legR.userData.knee)f.j.legR.userData.knee.rotation.x=Math.max(0,-Math.sin(ph))*.5;
      (f.j.hairSway||[]).forEach((h2,k)=>{h2.rotation.z=Math.sin(t*2.6+k*1.9)*.15;});
      if(f.j.robeG)f.j.robeG.rotation.z=Math.sin(ph)*.05;
      if(f.j.face)f.j.face.tgt=(enemies.length&&S.alive)?EXPR.cool:EXPR.smile;
      f.g.lookAt(player.position.x,0,player.position.z);
      // —— 伙伴协战（v23）：各自流派自动攻击附近敌人 ——
      f.atkT=(f.atkT||0)-dt;
      if(f.atkT<=0&&S.alive){
        // 找 10 范围内最近敌人
        let tgt=null,best=10;
        for(const e of enemies){const d2=e.position.distanceTo(f.g.position);
          if(d2<best){best=d2;tgt=e;}}
        if(tgt){const du=tgt.userData;
          const partnerBonus=S.dmgMul*(1+.08*(mates.length-1)); // 后宫越多越强（修罗场激励）
          if(f.idx===0){ // 晚晴·治愈之心：治疗波 + 光弹
            f.atkT=1.4;
            if(S.hp<S.maxHp*.8){S.hp=Math.min(S.maxHp,S.hp+6*partnerBonus);
              burst(player.position.clone().setY(1),0xff8fa3,5,4);tip('💗 晚晴为你疗伤');mateAtkFx(0);}
            const b=new THREE.Mesh(G.orb,new THREE.MeshBasicMaterial({color:0xff8fa3}));
            b.scale.setScalar(.6);b.position.copy(f.g.position).setY(1.2);
            const dv=tgt.position.clone().sub(f.g.position).setY(0).normalize();
            b.userData={v:dv.multiplyScalar(20),life:1.2,dmg:14*partnerBonus,pierce:0};b.isPB=true;
            scene.add(b);bullets.push(b);
          }else if(f.idx===1){ // 曼姐·修罗鞭挞：范围溅射
            f.atkT=2.2;
            for(const e2 of enemies)if(e2.position.distanceTo(tgt.position)<3.5)hitEnemy(e2,26*partnerBonus);
            burst(tgt.position.clone().setY(1),0x9d4edd,8,6);shake(.15);mateAtkFx(1);
          }else if(f.idx===2){ // 糖糖·甜蜜磁铁：吸引碎片 + 迷惑
            f.atkT=2.8;
            for(const o of orbs){const d3=o.position.distanceTo(f.g.position);
              if(d3<9)o.position.lerp(f.g.position,dt*10);}
            for(const e2 of enemies)if(e2.position.distanceTo(f.g.position)<6)e2.userData.charmed=Math.max(e2.userData.charmed||0,1.2);
            burst(f.g.position.clone().setY(1),0xf9a03f,6,4);mateAtkFx(2);
          }else if(f.idx===3){ // 夜冰·冰晶刺：减速冰弹
            f.atkT=1.8;
            const b2=new THREE.Mesh(new THREE.ConeGeometry(.18,1.1,5),new THREE.MeshBasicMaterial({color:0x4cc9f0}));
            b2.position.copy(f.g.position).setY(1.2);b2.rotation.x=Math.PI/2;
            const dv2=tgt.position.clone().sub(f.g.position).setY(0).normalize();
            b2.userData={v:dv2.multiplyScalar(24),life:1.2,dmg:18*partnerBonus,pierce:0};b2.isPB=true;
            scene.add(b2);bullets.push(b2);
            const du2=tgt.userData;du2.slowT=Math.max(du2.slowT||0,1.5);mateAtkFx(3);
          }
        }else f.atkT=.5;
      }
    });
    // ---- 波次（每日挑战可增减数量 / 无尽·深渊模式随波次膨胀） ----
    if(gameMode==='endless'){
      const sc=endlessScale();
      spawnT-=dt;
      if(spawnT<=0){spawnT=2.6/sc.spawnMul;
        const kinds=['swarm','chaser','shooter','tank','bomber'];
        const ty=kinds[Math.floor(Math.random()*kinds.length)];
        const cnt=Math.max(1,Math.round((2+Math.random()*3)*sc.spawnMul));
        for(let i=0;i<cnt;i++)mkEnemy(ty);}
    }else if(gameMode==='abyss'){
      const sc=abyssScale(S.time);
      spawnT-=dt;
      if(spawnT<=0){spawnT=1.8/sc.spawnMul;
        const kinds=['chaser','shooter','tank','bomber','swarm'];
        const ty=kinds[Math.floor(Math.random()*kinds.length)];
        const cnt=Math.max(1,Math.round((3+Math.random()*3)*sc.spawnMul));
        for(let i=0;i<cnt;i++){const e=mkEnemy(ty);e.userData.hp*=sc.hpMul;e.userData.maxHp=e.userData.hp;
          e.userData.dmg*=sc.dmgMul;if(Math.random()<.3){e.userData.elite=true;e.userData.hp*=2;e.userData.maxHp=e.userData.hp;applyEliteAffix(e);}}}
    }else if(gameMode==='normal'){
      // v32：按「房间」持续刷怪，击杀达配额 → 房间完成 → 路线选择
      const sc=roomScale(),def=roomPick||ROOMS[0];
      spawnT-=dt;
      if(!roomDone&&spawnT<=0){
        spawnT=Math.max(.5,1.9/sc.spawnMul);
        const kinds=def.kind||['swarm','chaser'];
        const ty=kinds[Math.floor(Math.random()*kinds.length)];
        const cnt=Math.max(1,Math.round((2+Math.random()*2.4)*sc.spawnMul*(def.mult||1)*(D.waveMul||1)));
        for(let i=0;i<cnt;i++){const e=mkEnemy(ty);
          e.userData.hp*=sc.hpMul;e.userData.maxHp=e.userData.hp;e.userData.dmg*=sc.dmgMul;
          if(def.elite&&Math.random()<def.elite){e.userData.elite=true;e.userData.hp*=2;e.userData.maxHp=e.userData.hp;applyEliteAffix(e);}}}
      if(!roomDone&&roomKills()>=roomQuota){roomDone=true;
        // 房间清扫：残留情敌退场（Boss 保留），碎片自动吸附——"过关"收束感
        for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(e.userData.boss)continue;
          burst(e.position,0xff4d9e,7);scene.remove(e);enemies.splice(i,1);}
        for(const o of orbs)o.position.copy(player.position).setY(1);
        sfx.chest();tip(`✅ 第 ${roomIdx} 房通过！`);}}
    // ---- Boss 刷新：常规每120秒 / 无尽模式轮番来袭 / 深渊模式深渊之主坐镇 ----
    if(gameMode==='endless'){
      endlessBossT-=dt;
      if(!bossAlive&&endlessBossT<=0){
        bossAlive=true;
        const bi=endlessBossKills%3; // 三角色循环
        _pendingBossId=BOSSES_DEF[bi].id;
        const b=mkEnemy(null,true);b.userData.bossId=BOSSES_DEF[bi].id;
        _pendingBossId=null;
        // 无尽阶梯强化：每完成一波 +22% 血 / +10% 伤 / 移速渐进
        const sc=endlessScale();
        b.userData.hp*=sc.hpMul;b.userData.maxHp=b.userData.hp;
        b.userData.dmg*=sc.dmgMul;b.userData.spd*=sc.spdMul;
        waveNum=endlessBossKills+1;
        waveInfoForce=`👑 第 ${waveNum} 波`;
        bossIntro(b,`第 ${waveNum} 波 · ${BOSSES_DEF[bi].n}`);
        endlessBossT=endlessGap();}
    }else if(gameMode==='abyss'){
      abyssBossT-=dt;
      if(!bossAlive&&abyssBossT<=0){
        bossAlive=true;abyssBossKills++;
        _pendingBossId='abyss';
        const b=mkEnemy(null,true);b.userData.bossId='abyss';
        _pendingBossId=null;
        const sc=abyssScale(S.time);
        b.userData.hp*=sc.hpMul*Math.pow(1.35,abyssBossKills-1);
        b.userData.maxHp=b.userData.hp;
        b.userData.dmg*=sc.dmgMul*(1+abyssBossKills*.08);b.userData.spd*=sc.spdMul;
        waveNum=abyssBossKills;
        waveInfoForce=`🕳️ 深渊 ${abyssBossKills}`;
        bossIntro(b,`深渊之主 · 第 ${abyssBossKills} 度苏醒`);
        abyssBossT=Math.max(ABYSS_MIN_GAP,ABYSS_FIRST-abyssBossKills*2.5);}
    }else{
      const bossGate=gameMode==='climate'?70*(D.bossEarly||1):120*(D.bossEarly||1);
      if(gameMode!=='ghost'&&S.time>=bossGate&&!bossAlive&&Math.floor(S.time/bossGate)>Math.floor((S.time-dt)/bossGate)){
        bossAlive=true;
        if(gameMode==='climate'){ // 气候试炼：直接召出四时之主
          _pendingBossId='chronos';
          const b=mkEnemy(null,true);b.userData.bossId='chronos';
          _pendingBossId=null;
          const cIdx=SAVE.bosses.chronos||0;
          b.userData.hp*=(2.9+cIdx*.35);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.5;b.userData.spd*=1.12;
          waveNum=cIdx+1;
          bossIntro(b,'🕛 四时之主 · 时序');
          tip('🕛 「四季轮转，皆有定数——而你，是变数。」');
          if(SAVE.climateBest>0)setTimeout(()=>{if(S.alive)tip(`🏅 气候试炼最高连胜：${SAVE.climateBest} 度`);},2600);
        }else{
        // 天气限定 Boss：雷暴→雷神 / 浓雾→雾隐刺客（替代常规 Boss）
        const wId=WEATHERS[envWeather]&&WEATHERS[envWeather].id;
        const pId=DAY_PHASES[envPhase]&&DAY_PHASES[envPhase].id;
        const isStorm=wId==='storm',isFog=wId==='fog';
        const isSolar=(pId==='day'||pId==='dawn')&&(wId==='clear');
        const isRain=(wId==='rain');
        if(isRain){
          _pendingBossId='rain';
          const b=mkEnemy(null,true);b.userData.bossId='rain';
          _pendingBossId=null;
          const rIdx=SAVE.bosses.rain||0;
          b.userData.hp*=(1+rIdx*.2);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.12;b.userData.spd*=1.12;
          bossIntro(b,'🌧️ 雨神 · 潇湘');
          tip('🌧️ 细雨成帘，雨神踏水而来！');
        }else if(isSolar){
          _pendingBossId='solar';
          const b=mkEnemy(null,true);b.userData.bossId='solar';
          _pendingBossId=null;
          const sIdx=SAVE.bosses.solar||0;
          b.userData.hp*=(1+sIdx*.2);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.15;b.userData.spd*=1.05;
          bossIntro(b,'☀️ 金乌 · 烈日当空');
          tip('☀️ 烈日凌空，金乌蔽日！');
        }else if(isFog){
          _pendingBossId='assassin';
          const b=mkEnemy(null,true);b.userData.bossId='assassin';
          _pendingBossId=null;
          const aIdx=SAVE.bosses.assassin||0;
          b.userData.hp*=(1+aIdx*.2);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.12;b.userData.spd*=1.15;
          bossIntro(b,'🗡️ 雾隐刺客');
          tip('🌫️ 浓雾中杀机暗藏——刺客现形！');
        }else if(isStorm){
          _pendingBossId='thunder';
          const b=mkEnemy(null,true);b.userData.bossId='thunder';
          _pendingBossId=null;
          const tIdx=SAVE.bosses.thunder||0;
          b.userData.hp*=(1+tIdx*.2);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.15;b.userData.spd*=1.1;
          bossIntro(b,'⚡ 雷神 · 风暴主宰');
          tip('⚡ 雷暴中，雷神降临！');
        }else{
        const bi=bossForChapter();
        // v44：第七章三连战——Boss 由 weddingKills 决定，可能不是 bi 指向的那只
        const bidNow=chapterBossId();
        _pendingBossId=bidNow;
        const b=mkEnemy(null,true);b.userData.bossId=bidNow;
        _pendingBossId=null;
        // 按章节强化 Boss
        if(bi===1){b.userData.hp*=1.45;b.userData.maxHp=b.userData.hp;b.userData.dmg*=1.2;}
        if(bi===2){b.userData.hp*=1.9;b.userData.maxHp=b.userData.hp;b.userData.dmg*=1.35;b.userData.spd*=1.15;}
        if(bi===8){b.userData.hp*=2.2;b.userData.maxHp=b.userData.hp;b.userData.dmg*=1.4;b.userData.spd*=1.08;}
        if(bi===9){b.userData.hp*=2.45;b.userData.maxHp=b.userData.hp;b.userData.dmg*=1.45;b.userData.spd*=1.1;}
        if(bi===6){b.userData.hp*=2.55;b.userData.maxHp=b.userData.hp;b.userData.dmg*=1.5;b.userData.spd*=1.12;}
        // v44 第七章：三连战逐关递增（岳父 → 合唱团 → 伪神）
        if(bi===11){
          const st=Math.min(weddingKills,2);
          b.userData.hp*=(1+st*.28);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=(1+st*.12);b.userData.spd*=(1+st*.05);
          if(st===2)b.userData.hp*=1.15,b.userData.maxHp=b.userData.hp; // 终关额外
          waveInfoForce=`👰 婚宴第 ${st+1}/3 关`;
        }
        bossIntro(b,BOSSES_DEF.find(x=>x.id===bidNow).n);}}}}
    // ---- 移动 ----
    let mx=joy.dx,mz=joy.dz;
    mx+=(keys['d']||keys['arrowright']?1:0)-(keys['a']||keys['arrowleft']?1:0);
    mz+=(keys['s']||keys['arrowdown']?1:0)-(keys['w']||keys['arrowup']?1:0);
    const mL=Math.hypot(mx,mz);
    let movingSpd=0;
    if(mL>.01){mx/=Math.max(mL,1);mz/=Math.max(mL,1);
      const spd=S.spd*(S.dashing>0?3.4:1)*(S.slowT>0?.62:1); // v44：回忆胶片减速真正生效
      player.position.x+=mx*spd*dt;player.position.z+=mz*spd*dt;
      player.rotation.y=Math.atan2(mx,mz);
      movingSpd=spd;
      // 边界
      const L=Math.hypot(player.position.x,player.position.z);
      if(L>ARENA){player.position.x*=ARENA/L;player.position.z*=ARENA/L;}
      if(W.mist.lv&&Math.random()<dt*3)dropMist();}
    if(S.dashing>0)S.dashing-=dt;else S.dashCd=Math.max(0,S.dashCd-dt);
    if(S.slowT>0)S.slowT=Math.max(0,S.slowT-dt); // v44：减速计时
    if(S.flowWin>0)S.flowWin=Math.max(0,S.flowWin-dt); // v47：灵动套冲刺攻速窗口
    dashBtn.classList.toggle('cd',S.dashCd>0);
    // ---- v50：五相位步态（触地→承重→过渡→摆腿→着地），髋-膝-踝三关节联动 ----
    {const running=mL>.01,dashing=S.dashing>0;
      if(S.__gaitA===undefined){S.__gaitA=0;S.__gaitPh=0;}
      // 步频跟着移速走：走路 7.4Hz、冲刺 11.6Hz，急停时相位自然衰减
      const target=Math.min(1,(movingSpd||0)/3.6);
      S.__gaitA+=(target-S.__gaitA)*Math.min(1,dt*9);
      const amp=S.__gaitA*(dashing?1.16:.78);
      const freq=7.4+S.__gaitA*4.2+(dashing?1.6:0);
      S.__gaitPh+=dt*freq;
      const ph=S.__gaitPh;
      const sN=Math.sin(ph);
      // 双腿：髋部主摆 + 膝盖只做正向弯曲（抬腿不屈膝会像滑冰）
      const hipL=-sN*amp*.98,hipR=sN*amp*.98;
      heroParts.legL.rotation.x=hipL;heroParts.legR.rotation.x=hipR;
      // 膝盖：支撑腿伸直、摆动腿弯曲（用半波整流 + 相位偏移）
      const kneeL=Math.max(0,Math.sin(ph+Math.PI*.5))*amp*1.05+amp*.10;
      const kneeR=Math.max(0,Math.sin(ph-Math.PI*.5))*amp*1.05+amp*.10;
      if(heroParts.legL.userData.knee)heroParts.legL.userData.knee.rotation.x=kneeL;
      if(heroParts.legR.userData.knee)heroParts.legR.userData.knee.rotation.x=kneeR;
      // 脚踝：着地瞬间勾脚背（脚跟先落地），离地时压脚背（蹬地送腿）
      if(heroParts.legL.userData.ankle)heroParts.legL.userData.ankle.rotation.x=
        -Math.max(0,Math.cos(ph))*amp*.34+Math.max(0,-Math.cos(ph))*amp*.16;
      if(heroParts.legR.userData.ankle)heroParts.legR.userData.ankle.rotation.x=
        Math.max(0,Math.cos(ph))*amp*.34+Math.max(0,-Math.cos(ph))*amp*.16;
      // 手臂：与同侧腿反向摆；肘部随摆幅屈伸（无臂摆动=僵尸步）
      const armSwing=amp*.86;
      heroParts.armL.rotation.x=-sN*armSwing+amp*.16;
      heroParts.armR.rotation.x=sN*armSwing+amp*.16;
      // 手臂外展（肩宽的人自然外撇，贴身体会穿模）
      heroParts.armL.rotation.z=.16+amp*.05;
      heroParts.armR.rotation.z=-.16-amp*.05;
      if(heroParts.armL.userData.elbow)heroParts.armL.userData.elbow.rotation.x=
        -.14-Math.max(0,-sN)*amp*.62;
      if(heroParts.armR.userData.elbow)heroParts.armR.userData.elbow.rotation.x=
        -.14-Math.max(0,sN)*amp*.62;
      // 躯干：奔跑前倾 + 步伐侧摆 + 反向扭肩（counter-rotation，走路的核心真实感）
      const lean=dashing?.42:(S.__gaitA>.05?.16:0);
      heroParts.torso.rotation.x=lean+Math.sin(S.time*2.1)*.014*(1-S.__gaitA);
      heroParts.torso.rotation.y=-sN*amp*.14;
      heroParts.torso.rotation.z=Math.sin(ph)*.026*S.__gaitA;
      // 头部：抵消躯干扭转保持视线稳定（真实人体前庭反射）
      heroParts.head.rotation.y=sN*amp*.10;
      heroParts.head.rotation.x=-lean*.55;
      heroParts.head.position.y=HEAD_Y+(running?Math.abs(sN)*.045:Math.sin(S.time*2.1)*.016);
      // 发梢：步频驱动 + 慢速风噪叠加
      (heroParts.hairSway||[]).forEach((h2,k)=>
        h2.rotation.z=Math.sin(S.time*2.2+k*1.6)*.07-sN*amp*.09);
      heroParts.ribbon.rotation.z=sN*amp*.14;
      // 裙摆/长袍：跟随步频摆动，走动时后拖、停步时垂下
      heroParts.robeG.rotation.z=Math.sin(ph)*.055*S.__gaitA;
      heroParts.robeG.rotation.x=-amp*.10-Math.sin(ph*2)*.02*S.__gaitA;
      // ---- v50 待机礼仪：站立时重心偏移单腿 + 微侧头 + 手自然垂放 ----
      if(S.__gaitA<.10&&!dashing){
        const idle=1-S.__gaitA/.10;
        const slow=Math.sin(S.time*.85),slow2=Math.sin(S.time*.62+1.1);
        heroParts.legL.rotation.x=slow*.012*idle;
        heroParts.legR.rotation.x=-slow*.010*idle;
        if(heroParts.legL.userData.knee)heroParts.legL.userData.knee.rotation.x=.012*idle;
        if(heroParts.legR.userData.knee)heroParts.legR.userData.knee.rotation.x=.020*idle;
        heroParts.armL.rotation.x=slow2*.030*idle;
        heroParts.armR.rotation.x=-slow2*.026*idle;
        heroParts.armL.rotation.z=.155*idle;heroParts.armR.rotation.z=-.155*idle;
        heroParts.torso.rotation.x=slow2*.010*idle;
        heroParts.torso.rotation.z=(.014+slow*.012)*idle; // 重心压在一条腿上
        heroParts.torso.rotation.y=slow*.020*idle;
        heroParts.head.rotation.y=-slow*.055*idle;
        heroParts.head.rotation.z=-(.020+slow*.014)*idle; // 微微偏头，气质线
        heroParts.head.position.y=HEAD_Y+slow2*.008*idle;
        heroParts.robeG.rotation.x=slow2*.008*idle;
      }
      // ---- v53：动作状态姿态覆写（受击后仰 / 升级欢呼 / 冲刺甩臂），压在步态之上 ----
      if(hurtFxT>0){           // 受击：上半身后仰、双臂抬起护胸、下巴收
        heroParts.torso.rotation.x=-.24;
        heroParts.head.rotation.x=-.30;
        heroParts.armL.rotation.x=-1.05;heroParts.armR.rotation.x=-1.05;
        heroParts.armL.rotation.z=.34;heroParts.armR.rotation.z=-.34;
      }else if(levelUpFxT>0){  // 升级：双臂高举欢呼 + 挺胸抬头
        heroParts.armL.rotation.x=-2.65;heroParts.armR.rotation.x=-2.65;
        heroParts.armL.rotation.z=.38;heroParts.armR.rotation.z=-.38;
        heroParts.torso.rotation.x=-.12;
        heroParts.head.rotation.x=-.20;
      }else if(dashing){       // 冲刺：双臂后甩成流线型
        heroParts.armL.rotation.x=.95;heroParts.armR.rotation.x=.95;
        heroParts.armL.rotation.z=.06;heroParts.armR.rotation.z=-.06;
        heroParts.head.rotation.x=.12;
      }
      // ---- v29：男主表情随战况实时变化 ----
      {let e=EXPR.neutral;
        if(S.hp/S.maxHp<.3)e=EXPR.worry;
        if(S.dashing>0)e=EXPR.shout;
        else if(running)e=EXPR.cool;
        if(hurtFxT>0)e=EXPR.hurt;
        if(levelUpFxT>0)e=EXPR.happy;
        if(dlgActive)e=EXPR.love;
        heroFace.tgt=e;}
      // ---- v53：动作状态徽章 HUD（图标+文字随状态实时切换） ----
      {let st='🧍 站立',cls='';
        if(hurtFxT>0){st='💥 受击';cls='hot';}
        else if(levelUpFxT>0){st='🆙 升级！';cls='good';}
        else if(dlgActive){st='💘 攻略对话';cls='good';}
        else if(S.dashing>0){st='💨 冲刺';cls='hot';}
        else if(running){st='🏃 奔跑';}
        else if(hardPause){st='⏸ 暂停';}
        const asEl=document.getElementById('actState');
        if(asEl){asEl.style.display=started?'block':'none';
          if(asEl.textContent!==st)asEl.textContent=st;
          asEl.className=cls;}}
    }
    // ---- 武器计时 ----
    // v47 灵动套（满）：冲刺后 0.8 秒内攻击间隔减半
    let cd=statMul().cd;
    if(S.setFlowDash&&S.flowWin>0)cd*=.5;
    timers.bullet-=dt;if(W.bullet.lv&&timers.bullet<=0){fireBullet();timers.bullet=(W.bullet.evolved?.35:.75)*cd;}
    timers.meteor-=dt;if(W.meteor.lv&&timers.meteor<=0){fireMeteor();timers.meteor=(W.meteor.evolved?2.4:3.6)*cd;}
    timers.nova-=dt;if(W.nova.lv&&timers.nova<=0){fireNova();timers.nova=(W.nova.evolved?2.2:3.4)*cd;}
    timers.chain-=dt;if(W.chain.lv&&timers.chain<=0){fireChain();timers.chain=(W.chain.evolved?2.2:3.8)*cd;}
    timers.hook-=dt;if(W.hook.lv&&timers.hook<=0){fireHook();timers.hook=(W.hook.evolved?3.4:4.8)*cd;}
    timers.clone-=dt;if(W.clone.lv&&timers.clone<=0){summonClone();timers.clone=(W.clone.evolved?7:9)*cd;}
    timers.wave-=dt;if(W.wave.lv&&timers.wave<=0){fireWave();timers.wave=(W.wave.evolved?2.6:3.8)*cd;}
    // v42 新武器
    timers.rush-=dt;if(W.rush.lv&&timers.rush<=0){fireRush();timers.rush=(W.rush.evolved?2.0:3.2)*cd;}
    timers.burst-=dt;if(W.burst.lv&&timers.burst<=0){fireBurst();timers.burst=(W.burst.evolved?3.4:5.0)*cd;}
    timers.twin-=dt;if(W.twin.lv&&timers.twin<=0){fireTwin();timers.twin=(W.twin.evolved?.9:1.4)*cd;}
    timers.curse-=dt;if(W.curse.lv&&timers.curse<=0){fireCurse();timers.curse=(W.curse.evolved?2.6:3.8)*cd;}
    tickCurse(dt);
    tickFireGround(dt);
    updateTwinShadows(dt);
    updateClones(dt);
    // ---- 玩家子弹 ----
    for(let i=bullets.length-1;i>=0;i--){const b=bullets[i],u=b.userData;
      b.position.addScaledVector(u.v,dt);u.life-=dt;let done=u.life<=0;
      for(const e of enemies){if(u.pierce<0)break;
        if(b.position.distanceTo(e.position.clone().setY(b.position.y))<e.userData.r+.35){
          hitEnemy(e,u.dmg);if(u.pierce>0)u.pierce--;else{done=true;break;}
          // v42 万箭穿心：命中后向两侧分裂出两发小弹（每发只分裂一次，避免指数爆炸）
          if(u.split&&!u.didSplit){u.didSplit=true;
            const base=u.v.clone().setY(0).normalize();
            for(const s of [-1,1]){
              const ang=Math.atan2(base.x,base.z)+s*.55;
              const sb=new THREE.Mesh(G.bullet,new THREE.MeshBasicMaterial({color:0xff8fc8}));
              sb.position.copy(b.position);sb.scale.setScalar(.8);
              sb.userData={v:new THREE.Vector3(Math.sin(ang),0,Math.cos(ang)).multiplyScalar(17),
                dmg:u.dmg*.55,life:1.1,pierce:0};
              scene.add(sb);bullets.push(sb);}
          }
        }}
      if(done){scene.remove(b);bullets.splice(i,1);}}
    // ---- 流星下落 ----
    for(let i=parts.length-1;i>=0;i--){const p=parts[i],u=p.userData;
      // v67 AI 特效层：淡出 + 可选扩散/自旋（几何共享不 dispose，材质按实例 dispose）
      if(u.fx){u.life-=dt;const pr=Math.max(0,u.life/u.life0);
        if(u.fxg){p.scale.setScalar(p.scale.x+u.fxg*dt/u.life0);}
        p.material.opacity=u.fxo*pr;
        if(u.spin)p.rotation.z+=u.spin*dt;
        if(u.life<=0){scene.remove(p);p.material.dispose();parts.splice(i,1);}continue;}
      if(u.wave){u.life-=dt;p.position.addScaledVector(u.v,dt);
        p.material.opacity=Math.min(.8,u.life*1.4);
        for(const e of enemies){if(u.hit.has(e)||e.userData.dead)continue;
          if(e.position.distanceTo(p.position)<u.r){u.hit.add(e);
            hitEnemy(e,u.dmg);
            if(u.stun&&e.userData.type!=='boss')e.userData.slowT=Math.max(e.userData.slowT||0,1.2);
            const kb=e.position.clone().sub(p.position).setY(0).normalize().multiplyScalar(e.userData.type==='boss'?0:1.8);
            e.position.add(kb);}}
        if(u.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();parts.splice(i,1);}continue;}
      if(u.zap){u.life-=dt;p.material.opacity=Math.max(0,u.life*4);
        if(u.life<=0){scene.remove(p);parts.splice(i,1);}continue;}
      if(u.ghost){u.life-=dt;p.material.opacity=u.life*1.2;if(u.life<=0){scene.remove(p);parts.splice(i,1);}continue;}
      if(u.land){p.position.y+=u.v.y*dt;if(p.position.y<=.5){u.land();scene.remove(p);parts.splice(i,1);}continue;}
      if(u.grow!==undefined){u.life-=dt;const k=1+(1-u.life/.4)*u.grow;
        p.scale.set(k,.3,k);p.material.opacity=u.life*1.7;if(u.life<=0){scene.remove(p);parts.splice(i,1);}continue;}
      if(u.petal){u.life-=dt;p.position.addScaledVector(u.v,dt);u.v.y-=1.6*dt;
        p.rotation.z+=u.spin*dt;p.rotation.x+=u.spin*.6*dt;p.material.opacity=Math.min(.85,u.life*.7);
        if(u.life<=0){scene.remove(p);parts.splice(i,1);}continue;}
      if(u.water){u.life-=dt;p.rotation.z+=u.spin*dt;
        p.material.opacity=Math.min(.55,u.life*.4);p.position.y=1.1+Math.sin(u.life*4)*.15;
        if(u.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();parts.splice(i,1);}continue;}
      if(u.smoke){u.life-=dt;
        if(p.mesh){p.mesh.material.opacity=Math.min(.42,u.life*.5);p.mesh.scale.setScalar(1+(4.5-u.life)*.18);}
        if(p.userData.ptl){p.userData.ptLife-=dt;p.userData.ptl.intensity=Math.max(0,1.4*p.userData.ptLife*2);
          if(p.userData.ptLife<=0){scene.remove(p.userData.ptl);p.userData.ptl=null;}}
        if(u.life<=0){if(p.mesh){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();}
          if(p.userData.ptl)scene.remove(p.userData.ptl);parts.splice(i,1);}continue;}
      if(u.heart){u.life-=dt;p.position.addScaledVector(u.v,dt);u.v.y+=.4*dt;
        p.rotation.y+=dt*3;p.scale.setScalar(Math.max(.01,u.life));p.material.emissiveIntensity=u.life*1.6;
        if(u.life<=0){scene.remove(p);parts.splice(i,1);}continue;}
      if(u.pWave){u.life-=dt;p.position.addScaledVector(u.v,dt);
        p.material.opacity=Math.min(.6,u.life*1.2);
        if(!u.hitMe&&player.position.distanceTo(p.position)<2.2){u.hitMe=true;hurtPlayer(u.dmg);shake(.3);}
        if(u.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();parts.splice(i,1);}continue;}
      if(u.ice){u.life-=dt;
        if(u.rise>0){u.rise-=dt;p.scale.y=Math.min(1,(1-u.rise/.8)*1.15);}
        p.material.opacity=Math.min(.8,u.life*.55);
        if(u.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();parts.splice(i,1);}continue;}
      if(u.iceSpike){u.life-=dt;p.position.addScaledVector(u.dir,u.v*dt);
        p.material.opacity=Math.min(.85,u.life*1.2);
        if(!u.hitMe&&player.position.distanceTo(p.position)<2.4){u.hitMe=true;hurtPlayer(16);}
        if(u.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();parts.splice(i,1);}continue;}
      if(u.vortex){u.life-=dt;p.rotation.z+=u.spin*dt;
        p.material.opacity=Math.max(0,.3*(u.life/3.2));
        if(u.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose();parts.splice(i,1);}continue;}
      u.life-=dt;p.position.addScaledVector(u.v,dt);u.v.y-=14*dt;p.scale.setScalar(Math.max(.01,u.life*1.4));
      if(u.life<=0){scene.remove(p);parts.splice(i,1);}}
    // ---- 环绕玫瑰 ----
    if(orbitGroup.children.length){orbitGroup.position.copy(player.position);
      const oaw=W.orbit;const awk=oaw.awakened;
      orbitGroup.rotation.y+=dt*((awk||W.orbit.evolved)?6:4);
      const R=(awk?3.1:W.orbit.evolved?2.6:2.1);
      const oDmg=(W.orbit.evolved?34:16)*S.dmgMul*dt*(awk?1.4:1)*(W.orbit.fused?1.5:1);
      const oLeech=(W.orbit.evolved?4:1.2)*dt*(awk?2:1);
      // v42 修罗旋转：环绕刃带把周围情敌往玩家吸
      if(W.orbit.suck){
        for(const e of enemies){if(e.userData.dead||e.userData.type==='boss')continue;
          const d=e.position.distanceTo(player.position);
          if(d<R+2.6&&d>1.2){
            const dir=player.position.clone().sub(e.position).setY(0).normalize();
            e.position.addScaledVector(dir,3.2*dt);}}}
      orbitGroup.children.forEach((m,i)=>{const a=orbitGroup.rotation.y+i/orbitGroup.children.length*Math.PI*2;
        m.position.set(Math.cos(a)*R,1.1,Math.sin(a)*R);m.rotation.z=.7;
        for(const e of enemies){if(e.position.distanceTo(m.getWorldPosition(new THREE.Vector3()))<e.userData.r+.55){
          hitEnemy(e,oDmg,false);
          S.hp=Math.min(S.maxHp,S.hp+oLeech);}}});}
    // ---- 迷雾 ----
    for(let i=mists.length-1;i>=0;i--){const m=mists[i],u=m.userData;u.life-=dt;
      if(u.slow)m.material.opacity=.18+.1*Math.abs(Math.sin(u.life*8));
      for(const e of enemies)if(e.position.distanceTo(m.position)<2.4){
        e.userData.hp-=u.dps*dt;
        if(u.slow&&e.userData.type!=='boss')e.userData.slowT=.5;}
      if(u.life<=0){scene.remove(m);mists.splice(i,1);}}
    // ---- v33：影子对战计时 / 骚扰小怪 / 轨迹录制 ----
    if(gameMode==='ghost'){
      ghostLeft-=dt;
      ghostMinionT-=dt;
      if(ghostMinionT<=0){ghostMinionT=17;for(let i=0;i<3;i++)mkEnemy('swarm');}
      if(ghostLeft<=0&&!ghostResult){ghostResult='timeout';
        tip('⏰ 时间到 —— 影子撑住了，挑战失败');gameOver();}
    }else{
      ghostRecT-=dt;
      if(ghostRecT<=0&&ghostRec.length<GHOST_PATH_MAX){ghostRecT=GHOST_SAMPLE;
        ghostRec.push([Math.round(player.position.x*10)/10,Math.round(player.position.z*10)/10]);}
    }
    // ---- 敌人AI ----
    const pp=player.position;
    for(let i=enemies.length-1;i>=0;i--){const e=enemies[i],u=e.userData;
      if(u.hitT>0){u.hitT-=dt;if(u.hitT<=0)u.mats.forEach((m,k)=>m.emissiveIntensity=u.baseEI[k]);}
      // 灼烧（觉醒·天罚陨落）：持续真伤
      if(u.burnT>0){u.burnT-=dt;u.hp-=28*dt*(D.dmgMul||1);
        if(Math.random()<dt*6)burst(e.position.clone().setY(1),0xff4d6d,2,3);
        if((u.burnPuff=(u.burnPuff||0)-dt)<=0){u.burnPuff=.4;burst(e.position.clone().setY(.6),0xff9e00,2,3);}
        if(u.hp<=0&&!u.dead){killEnemy(e,i);continue;}}
      const d=pp.clone().sub(e.position).setY(0),L=d.length()||1;d.divideScalar(L);
      const slowF=(u.slowT>0)?.55:1;u.slowT=(u.slowT||0)-dt;
      if(u.charmed>0){u.charmed-=dt;e.rotation.y+=dt*7;
        for(const o of enemies)if(o!==e&&e.position.distanceTo(o.position)<1.4){o.userData.hp-=80*dt;
          if(Math.random()<dt*8)burst(o.position,0x80ed99,3,4);}
      }else if(u.ghost){ // v33：影子对手（复刻轨迹 + 情话弹幕）
        ghostAI(e,u,pp,dt,L,d);
      }else if(u.type==='shooter'){ // 射手：保持距离射击
        if(L>9){e.position.addScaledVector(d,u.spd*slowF*dt);}
        u.shootT-=dt;if(u.shootT<=0&&L<22){u.shootT=2.6;
          const b=new THREE.Mesh(G.eBullet,M.eBullet);b.position.copy(e.position).setY(1);
          b.userData={v:d.clone().multiplyScalar(10),dmg:u.dmg,life:2.2};scene.add(b);eBullets.push(b);}
      }else if(u.type==='bomber'){ // 自爆：接近后引燃
        e.position.addScaledVector(d,u.spd*dt);
        if(L<2.2){u.hp=0;mkTele(e.position.clone(),2.6,.5,()=>{
          if(pp.distanceTo(e.position)<2.6)hurtPlayer(u.dmg);burst(e.position,0xff006e,20,10);shake(.4);});
          burst(e.position,0xff006e,8);}
      }else if(u.boss){ // Boss 双阶段 + 专属招式（按 bossId 分派）
        if(u.ring){u.ring.rotation.z+=dt*3;u.ring.rotation.x+=dt*1.5;}
        const phase2=u.hp<u.maxHp*.5;u.spd=phase2?3.2:2.4;
        if(L>3) e.position.addScaledVector(d,u.spd*dt);
        u.chargeT-=dt;
        if(u.chargeT<=0){u.chargeT=phase2?2.6:4;
          const bid=u.bossId||'captain',roll=Math.random();
          if(bid==='mother')bossMother(e,u,pp,phase2,roll);
          else if(bid==='mirror')bossMirror(e,u,pp,phase2,roll);
          else if(bid==='abyss')bossAbyss(e,u,pp,phase2,roll);
          else if(bid==='thunder')bossThunder(e,u,pp,phase2,roll);
          else if(bid==='assassin')bossAssassin(e,u,pp,phase2,roll);
          else if(bid==='solar')bossSolar(e,u,pp,phase2,roll);
          else if(bid==='rain')bossRain(e,u,pp,phase2,roll);
          else if(bid==='seaking')bossSeaking(e,u,pp,phase2,roll);
          else if(bid==='frost')bossFrost(e,u,pp,phase2,roll);
          else if(bid==='chronos')bossChronos(e,u,pp,phase2,roll);
          else if(bid==='fatherinlaw')bossFatherinlaw(e,u,pp,phase2,roll);
          else if(bid==='exchorus')bossExchorus(e,u,pp,phase2,roll);
          else if(bid==='emcee')bossEmcee(e,u,pp,phase2,roll);
          else bossCaptain(e,u,pp,phase2,roll);}
      }else{ // 普通追击
        e.position.addScaledVector(d,u.spd*slowF*dt);}
      // 行走步态动画（各自气质 · v29 增加肘膝联动与发丝摆动）
      {const s=u.stride,ph=t*s.f+i*.7;
        if(u.j.armL)u.j.armL.rotation.x=Math.sin(ph)*s.a;if(u.j.armR)u.j.armR.rotation.x=-Math.sin(ph)*s.a;
        if(u.j.legL)u.j.legL.rotation.x=-Math.sin(ph)*s.a*.9;if(u.j.legR)u.j.legR.rotation.x=Math.sin(ph)*s.a*.9;
        if(u.j.armL&&u.j.armL.userData.elbow)u.j.armL.userData.elbow.rotation.x=-s.a*.7-Math.max(0,Math.sin(ph))*s.a*.5;
        if(u.j.armR&&u.j.armR.userData.elbow)u.j.armR.userData.elbow.rotation.x=-s.a*.7-Math.max(0,-Math.sin(ph))*s.a*.5;
        if(u.j.legL&&u.j.legL.userData.knee)u.j.legL.userData.knee.rotation.x=Math.max(0,Math.sin(ph))*s.a*.7;
        if(u.j.legR&&u.j.legR.userData.knee)u.j.legR.userData.knee.rotation.x=Math.max(0,-Math.sin(ph))*s.a*.7;
        if(u.j.torso)u.j.torso.rotation.x=s.lean+(u.charmed>0?Math.sin(t*20)*.15:0);
        if(u.j.robe&&u.j.robe.rotation)u.j.robe.rotation.x=Math.sin(ph*2)*.04;
        (u.j.hairSway||[]).forEach((h2,k)=>h2.rotation.z=Math.sin(t*2.4+k*1.5)*.09+Math.sin(ph)*.05);
        // v29：受击 / 魅惑 / 死亡的表情
        if(u.j.face){const f=u.j.face;
          f.tgt=u.dead?EXPR.dead:(u.hitT>0?EXPR.hurt:(u.charmed>0?EXPR.love:(u.boss?EXPR.angry:(u.type==='bomber'?EXPR.shout:EXPR.angry))));
          if(!u.boss&&u.type==='swarm')f.tgt=u.hitT>0?EXPR.hurt:EXPR.angry;
        }
      }
      // 轮廓光（Rim）：受击时整体发亮；移动时衣摆摆动
      if(u.hitT>0){u.mats.forEach(m=>{if(m.emissive)m.emissiveIntensity=Math.min(1.9,(m.emissiveIntensity||0)+.9);});}
      // 细节：腰部摇曳装饰
      {const sway=Math.sin(t*3+i)*.06;
        if(u.j.torso)u.j.torso.rotation.z=sway*.5;
        if(u.j.robe&&u.j.robe.rotation)u.j.robe.rotation.z=sway;}
      e.position.y=(u.boss?Math.abs(Math.sin(t*3))*.3:(u.type==='swarm'?Math.abs(Math.sin(t*6+i))*.25:0));
      // 碰撞伤害
      if(L<u.r+.75&&S.hitCd<=0&&u.charmed<=0){hurtPlayer(u.dmg);
        if(u.affix==='vamp')u.hp=Math.min(u.maxHp,u.hp+u.maxHp*.06);} // v35：嗜血词缀
    }
    // 统一清理死亡
    for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];
      if(e.userData.hp<=0&&!e.userData.dead)killEnemy(e,i);}
    // ---- 敌方子弹 ----
    for(let i=eBullets.length-1;i>=0;i--){const b=eBullets[i],u=b.userData;
      b.position.addScaledVector(u.v,dt);u.life-=dt;
      if(b.position.distanceTo(pp.clone().setY(1))<.85){hurtPlayer(u.dmg);scene.remove(b);eBullets.splice(i,1);continue;}
      if(u.life<=0){scene.remove(b);eBullets.splice(i,1);}}
    // ---- v44 家法板凳：飞行 + 命中 + 落地 ----
    for(let i=stools.length-1;i>=0;i--){const st=stools[i],u=st.userData;
      st.position.addScaledVector(u.v,dt);u.life-=dt;
      st.rotation.z+=dt*9;st.rotation.y+=dt*4;
      if(st.position.distanceTo(pp.clone().setY(1.2))<1.25){hurtPlayer(u.dmg);
        burst(st.position.clone(),0xd4af37,14,9);shake(.3);
        scene.remove(st);stools.splice(i,1);continue;}
      if(u.life<=0){scene.remove(st);stools.splice(i,1);}}
    // ---- 预警圈 ----
    for(let i=teles.length-1;i>=0;i--){const m=teles[i],u=m.userData;u.life-=dt;
      m.material.opacity=.2+.25*Math.abs(Math.sin(u.life*12));
      if(u.life<=0){u.cb&&u.cb();scene.remove(m);teles.splice(i,1);}}
    // ---- 碎片 ----
    for(let i=orbs.length-1;i>=0;i--){const o=orbs[i];o.userData.spin+=dt*3;
      o.rotation.y=o.userData.spin;o.rotation.x=Math.sin(o.userData.spin)*.5;
      o.position.y=.5+Math.sin(t*4+o.userData.spin)*.12;
      const d=pp.distanceTo(o.position);
      if(d<S.pickR+2)o.position.lerp(pp.clone().setY(1),dt*(3+ (S.pickR+2-d)));
      if(d<1){gainXp(1);sfx.pick();scene.remove(o);orbs.splice(i,1);}}
    // ---- 回复/绝技 ----
    if(S.regen)S.hp=Math.min(S.maxHp,S.hp+S.regen*dt);
    S.hitCd-=dt;
    updateCombo(dt);
    if(S.ultT>0){S.ultT-=dt;if(S.ultT<=0)for(const e of enemies)e.userData.charmed=0;}
    // ---- 升级 ----
    // ---- 升级（独立于对话的暂停） ----
    if(pendingLvl>0&&document.getElementById('modal').style.display!=='flex'&&!dlgActive){paused=true;showDraft();}
    // ---- 胜利 ----
    if(gameMode!=='endless'&&S.time>=600&&!victory){victory=true;
      VFX.bloom({color:'rgba(255,214,10,.34)',pulseCol:'rgba(255,214,10,.7)',layers:4,
        slowScale:.3,slowDur:2,text:'🏆 10 分钟达成！',text2:'这一局，你活下来了'});
      setTimeout(()=>VFX.calm(),2400);
      setTimeout(()=>{if(S.alive){S.alive=false;started=false;showEnding();}},1600);}
    // ---- 相机 ----
    S.shake=Math.max(0,S.shake-dt*2);
    shakeX=(Math.random()-.5)*S.shake;shakeY=(Math.random()-.5)*S.shake;
  }
  const tgt=player.position;
  const camZ=F.zoomTarget>0||F.bossIntro>0?6.2:7.8;
  const camY=F.bossIntro>0?8.5:11;
  const lerp=Math.max(F.bossIntro>0?.14:.1,F.zoomT>0?.1:.1);
  camera.position.lerp(new THREE.Vector3(tgt.x+shakeX,tgt.y+camY+shakeY,tgt.z+camZ),lerp);
  camera.lookAt(tgt.x,tgt.y,tgt.z-1.2);
  // ---- HUD ----
  document.querySelector('#hpBar div').style.width=Math.max(0,S.hp/S.maxHp*100)+'%';
  document.querySelector('#scumBar div').style.width=S.scum+'%';
  document.querySelector('#xpTop div').style.width=(S.xp/S.xpNeed*100)+'%';
  document.getElementById('lvl').textContent=realmName(S.lvl);
  const mm=String(Math.floor(S.time/60)).padStart(2,'0'),ss=String(Math.floor(S.time%60)).padStart(2,'0');
  const wi=document.getElementById('waveInfo');
  if(gameMode==='endless'){
    wi.textContent=`${wi2(endlessBossT)} · 波${waveNum} · 杀${S.kills}`;
  }else if(gameMode==='abyss'){
    wi.textContent=`${wi2(abyssBossT<0?0:abyssBossT)} · 深渊${waveNum} · 杀${S.kills}`;
  }else if(gameMode==='climate'){
    wi.textContent=`🕛 时序${waveNum} · ${climateSealHud()} · 杀${S.kills}`;
  }else if(gameMode==='ghost'){
    const gh=ghostEnt?ghostEnt.userData:null;
    wi.textContent=gh?`🥊 影子 ${Math.max(0,Math.ceil(gh.hp))}/${gh.maxHp} · ⏳${Math.ceil(Math.max(0,ghostLeft))}s`
      :`🥊 影子将至 · ⏳${Math.ceil(Math.max(0,ghostLeft))}s`;
  }else{
    wi.textContent=(started&&roomQuota>0)
      ?`🏠${roomIdx} ${Math.min(roomKills(),roomQuota)}/${roomQuota} · 💗${runCoins} · ${mm}:${ss}`
      :`${mm}:${ss} · 击杀${S.kills}`;}
  {const ei=document.getElementById('envInfo');if(ei)ei.textContent=envHudText();}
  {const cp=document.getElementById('climatePhase');
   if(cp&&cp.style.display!=='none'){const p=climatePhase();
     if(p){const t=cp.querySelector('.cpT');if(t)t.textContent=Math.ceil(climatePhaseT)+'s';}}}
  renderer.render(scene,camera);
  if(started&&!hardPause)autoQuality(rawDt,1/Math.max(rawDt,.001));
  renderGrade();
  hudTick+=rawDt;if(hudTick>=0.25){hudTick=0;renderAwakenHud();}}
// ---------- 后期：暗角 + 色彩分级 ----------
const gcv=document.createElement('canvas');gcv.width=innerWidth;gcv.height=innerHeight;
gcv.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:5;width:100%;height:100%';
document.body.appendChild(gcv);
const gg=gcv.getContext('2d');
let gradeT=0,gradeAcc=0;
function renderGrade(){
  // 低画质时仅保留濒死警示，省电
  const now=performance.now();if(now-gradeT<50)return;gradeT=now;
  if(gcv.width!==innerWidth||gcv.height!==innerHeight){gcv.width=innerWidth;gcv.height=innerHeight;}
  if(typeof QUAL!=='undefined'&&QUAL.level===0){gg.clearRect(0,0,gcv.width,gcv.height);return;}
  const w=gcv.width,h=gcv.height;
  gg.clearRect(0,0,w,h);
  // 暗角
  const rg=gg.createRadialGradient(w/2,h/2,Math.min(w,h)*.32,w/2,h/2,Math.max(w,h)*.78);
  rg.addColorStop(0,'rgba(0,0,0,0)');rg.addColorStop(.65,'rgba(10,4,20,.28)');rg.addColorStop(1,'rgba(8,2,14,.66)');
  gg.fillStyle=rg;gg.fillRect(0,0,w,h);
  // 渣男值满槽时的粉色脉冲边缘（紧张感）
  if(S.scum>=100){const p=.18+.12*Math.sin(performance.now()/200);
    const rg2=gg.createRadialGradient(w/2,h/2,Math.min(w,h)*.42,w/2,h/2,Math.max(w,h)*.7);
    rg2.addColorStop(0,'rgba(247,37,133,0)');rg2.addColorStop(1,`rgba(247,37,133,${p})`);
    gg.fillStyle=rg2;gg.fillRect(0,0,w,h);}
  // 濒死红色警示
  if(S.hp/S.maxHp<.28&&S.alive){const p=.10+.08*Math.sin(performance.now()/150);
    const rg3=gg.createRadialGradient(w/2,h/2,Math.min(w,h)*.3,w/2,h/2,Math.max(w,h)*.7);
    rg3.addColorStop(0,'rgba(255,0,60,0)');rg3.addColorStop(1,`rgba(255,0,60,${p})`);
    gg.fillStyle=rg3;gg.fillRect(0,0,w,h);}
  // 修罗场紫色全屏滤镜
  if(S.ultT>0){gg.fillStyle=`rgba(160,30,220,${.10+.05*Math.sin(performance.now()/90)})`;gg.fillRect(0,0,w,h);}
}
let hurtFlashT=0;
function hurtPlayer(d){if(S.hitCd>0)return;S.hitCd=.5;
  hurtFxT=.6; // v29：受伤表情持续时间
  const real=Math.max(1,(d-S.armor)*(D.hurtMul||1)*(1-(S.hurtReduce||0)));
  // v47 生生套（满）：25% 概率把伤害转为治疗
  if(S.setLifeAbsorb&&Math.random()<.25){
    S.hp=Math.min(S.maxHp,S.hp+real);
    sfx.orb&&sfx.orb();
    burst(player.position,0x7bd389,14,8);
    dmgNum(player.position.clone().setY(1.9),real,false);
    tip2('🌱 生生套：伤害转为治疗 +'+Math.round(real));
    if(S.hp<=0)gameOver();
    return;
  }
  S.hp-=real;sfx.hurt();shake(.3);
  burst(player.position,0xff4d6d,8,6);
  S.scum=Math.min(100,S.scum+4); // 挨打也攒渣男值（绝地反击）
  if(S.hp<=0)gameOver();}
function gameOver(){stopBossBgm();S.alive=false;started=false;showEnding();}
// 模式选择
document.querySelectorAll('#modeSel .modeBtn').forEach(b=>{
  b.onclick=()=>{
    if(b.dataset.m==='abyss'&&!abyssUnlocked()){tip('🕳️ 深渊试炼需先觉醒任一武器（通过升级三选一消耗 3 觉醒石）');return;}
    gameMode=b.dataset.m;
    document.querySelectorAll('#modeSel .modeBtn').forEach(x=>x.classList.toggle('on',x===b));
    if(b.dataset.m==='ghost')openGhostSelect();};});
function setMode(m){
  if(m==='abyss'&&!abyssUnlocked())m='normal';
  gameMode=m;document.querySelectorAll('#modeSel .modeBtn').forEach(x=>x.classList.toggle('on',x.dataset.m===m));}
function refreshAbyssLock(){
  const b=document.getElementById('abyssModeBtn');if(!b)return;
  const ok=abyssUnlocked();b.classList.toggle('lock',!ok);
  b.title=ok?'深渊试炼已解锁':`觉醒任一武器后解锁（已觉醒 ${SAVE.awakenTotal||0}/8）`;}
document.getElementById('startBtn').addEventListener('click',function startRunHandler(){
  // 重置
  for(const arr of[enemies,bullets,eBullets,orbs,teles,mists,npcs,chests,clones])for(const e of arr)scene.remove(e);
  chests.length=0;challenge=null;challengeT=55;chestT=40;
  chapterT=240;applyChapter(0);
  // 昼夜/天气初始化（每日挑战与深渊由 cfg 固定）
  dayT=0;envPhase=0;envWeather=0;envWeatherT=18;envApply();
  ownedDrops={};SAVE.setSeen={};
  for(const f of followers)scene.remove(f.g);
  followers.length=0;mates.length=0;npcStage.fill(0);
  affinity.fill(0);dates.fill(0);npcCd=[30,36,42,48];npcTimer=14;
  loverCd.fill(0);npcLoverDone.fill(false);
  if(npcLoverDone)npcLoverDone.fill(false);renderMates();renderAff();renderLoverBtns();
  document.getElementById('dlg').style.display='none';dlgActive=false;
  [enemies,bullets,eBullets,orbs,teles,mists,npcs,stools].forEach(a=>a.length=0); // v44：含家法板凳
  for(const p of parts)scene.remove(p);parts.length=0;
  Object.assign(S,{hp:100,maxHp:100,scum:0,xp:0,xpNeed:10,lvl:1,kills:0,time:0,alive:true,over:false,
    spd:8.2,dmgMul:1,cdMul:1,pickR:2.6,armor:0,regen:0,critC:.08,dashT:0,dashCd:0,dashing:0,ultT:0,hitCd:0,shake:0,
    hurtReduce:0,dashCdMax:6,bossDmgMul:1,xpMul:1,slowT:0,flowWin:0});
  delete S.__fateBase; // v41：清掉上局的天赋基线快照，本局重新快照
  resetAffixSets();    // v47：清掉上局装备的词条 / 套装激活状态
  S.setWarSplash=false;S.setFlowDash=false;S.setLifeAbsorb=false;S._warSplashFx=-9; // v47：套装满级开关复位
  // ---- 跨局继承：转世加成 + 好感延续 ----
  S.dmgMul=1+(SAVE.realmBonus||0);
  S.spd=8.2+Math.min(6,(SAVE.best.lvl||1)-1)*.05;
  for(let i=0;i<4;i++)affinity[i]=SAVE.affinity[i]||0;
  renderAff();
  if(SAVE.realmBonus>0)tip(`🔥 转世加成生效 · 伤害 +${Math.round(SAVE.realmBonus*100)}%`);
  // ---- v28：词条觉醒 → 开局附赠（图鉴 Lv.3 以上词条）
  {const aw=AFFIXES.filter(a=>affixLv(a.id)>=3);
   if(aw.length){const a=aw[Math.floor(Math.random()*aw.length)];
     try{a.ap(1+affixBonus(a));}catch(e){}
     tip(`✦ 词条觉醒：开局获得「${a.n}」（图鉴 Lv.${affixLv(a.id)}）`);}}
  bossKills=0;evolveCount=0;challengeWins=0;chestTotal=0;ultCount=0;achQueue.length=0;achT=0;achPop=0;
  weddingKills=0; // v44：婚宴三连战进度归零
  comboN=0;comboT=0;comboBest=0;updateComboUI();
  for(const k in W)W[k].lv=0,W[k].evolved=false,W[k].awakened=false,
    W[k].bonusN=0,W[k].bonusRing=0,W[k].bonusPierce=0,W[k].radiusMul=0,W[k].dmgMul=1,
    W[k].leechMul=1,W[k].boomMul=1,W[k].burn=false,W[k].stun=false,W[k].heavy=false,
    W[k].fused=false,W[k].fuseDmg=1,W[k].fuseSplit=false,W[k].suck=false,
    W[k].fusedPull=false,W[k].burnGround=false,W[k].fireGround=false,W[k].twinBoost=false;
  // v42：清掉分身与诅咒残留
  {for(const g of twinShadows)scene.remove(g);twinShadows.length=0;}
  W.bullet.lv=1;for(const k in P)P[k]=0;
  awakenStones=0;renderAwakenHud();auraCount=-1;syncAwakenAura();
  for(const k in timers)timers[k]=0;
  clones.length=0;
  syncOrbits();player.position.set(0,0,0);waveIdx=0;bossAlive=false;victory=false;pendingLvl=0;
  // ---- 无尽/深渊模式初始化 ----
  endlessBossKills=0;waveNum=1;endlessBossT=0;abyssBossKills=0;abyssBossT=ABYSS_FIRST;
  document.getElementById('overlay').style.display='none';started=true;paused=false;hardPause=false;
  const sb=document.getElementById('shareBtn');if(sb)sb.style.display='none';
  document.getElementById('pauseBtn').textContent='⏸';
  // 每日挑战：应用当日修正（无尽/深渊模式不叠加每日词条）
  if(gameMode==='endless'||gameMode==='abyss'||gameMode==='climate'){resetD();dailyMod=null;}
  // v40.1：非气候模式清掉相位锁定与残留增益，避免上一局的相位 buff 渗进新一局
  if(gameMode!=='climate'){revertPhaseBuffs();envSkipWeather=false;}
  if(gameMode==='climate')initClimateTrial();
  else{rollDaily();applyDailyMods();
    if(dailyMod){tip(`📅 今日挑战：${dailyMod.n} —— ${dailyMod.d}`);}}
  // 周赛主题叠加（常规模式生效）
  if(gameMode==='normal'&&weekMod){applyWeekMods();
    setTimeout(()=>tip(`🏁 周赛 ${weekMod.ic} ${weekMod.n}：${weekMod.d}`),1800);}
  // 成就点数兑换的初始增益
  applyRedemption();
  // v41：宿命天赋树（在 S 重置与兑换之后，作用于本局基准属性）
  applyFate();
  // 周赛徽记增益
  applyWeekReward();
  // 签到累积奖励（玫瑰/渣值/全属性）
  {const ci=SAVE.checkin||{};
   const parts=[];
   if(ci.bonusRose){W.orbit.lv=Math.max(W.orbit.lv,2);syncOrbits();parts.push('玫瑰Lv.2');}
   if(ci.bonusScum){S.scum=Math.min(100,S.scum+ci.bonusScum);parts.push('渣值+'+ci.bonusScum);}
   if(ci.bonusAll){S.maxHp+=30;S.hp=S.maxHp;S.spd*=1.06;S.dmgMul*=1.08;S.critC+=.05;parts.push('全属性');}
   if(parts.length)setTimeout(()=>tip('📅 签到累积奖励：'+parts.join(' · ')),2400);}
  // 分享码对战：显示当前分享码
  shareCodeCur=currentShareCode();
  {const mt=document.getElementById('shareMineTxt');
   if(mt)mt.innerHTML=`本局分享码：<b>${shareCodeCur}</b>（发给好友即可同条件对拼）`;}
  // ---- v32：房间路线初始化（在每日/周赛/兑换增益全部生效后锚定经验基准） ----
  {const mm2=document.getElementById('modal');if(mm2)mm2.style.display='none';
   roomIdx=1;runCoins=0;roomXpBase=null;roomDone=false;roomPick=null;
   if(gameMode==='normal'||gameMode==='climate')startRoom(ROOMS[0]);}
  // ---- v33：影子对战初始化 ----
  ghostRec=[];ghostRecT=0;ghostEnt=null;ghostResult=null;ghostMinionT=16;
  if(gameMode==='ghost'){
    resetD();dailyMod=null;ghostLeft=GHOST_TIME;
    const gd=pendingGhost||{kills:60,lvl:12,realm:'随机影子',path:[],date:'默认',fromCode:false};
    const st=ghostStats(gd);
    setTimeout(()=>{
      if(!S.alive)return;
      mkGhostEntity(gd);
      const rb=document.getElementById('roomBar');
      if(rb){rb.querySelector('.rbTag').textContent='🥊 影子现身 · 挑战开始';
        rb.querySelector('.rbSub').textContent=`血量 ${st.hp} · 伤害 ${Math.round(st.dmg)} · 限时 120 秒打空它！`;
        rb.style.opacity=1;roomBannerT=3.6;}
      tip(`🥊 影子登场（击杀 ${gd.kills||0} 的影子）—— 120 秒内打空它！`);
      sfx.lvl();
    },1500);
  }
  // 首局显示新手引导（跳过既有教学）
  if(!SAVE.tutDone){tutIdx=0;setTimeout(()=>showTut(),700);}
  else{setTimeout(()=>showLetter(0),400);}
  tip(gameMode==='endless'?'👑 无尽挑战 · 首脑轮番来袭！':'第 1 关 · 初恋校园 · 开战！');});
// ---------- 新手引导（仅首局出现） ----------
const TUT_STEPS=[
 {t:'🎮 <b>移动</b>：按住屏幕左下角拖动，虚拟摇杆控制方向',hl:'joy'},
 {t:'⚔️ <b>攻击全自动</b>：不用按攻击键，角色自动打击靠近的情敌',hl:null},
 {t:'💨 <b>冲刺</b>：点右下角 💨 或双击屏幕闪避，冲刺有冷却但能穿过弹幕',hl:'dashBtn'},
 {t:'😈 <b>渣男值绝技</b>：击杀攒满顶部粉条，点它释放「终极·修罗场」全场魅惑',hl:'scumBar'},
 {t:'✨ <b>三选一</b>：升级时选奇招或被动，满级可进化合体。撑过 10 分钟见证真结局！',hl:null},
];
let tutIdx=0,tutOn=false;
function showTut(){
  const box=document.getElementById('tutorial');box.style.display='flex';tutOn=true;hardPause=true;
  renderTutStep();}
function renderTutStep(){
  const s=TUT_STEPS[tutIdx];
  document.getElementById('tutStep').textContent=`新手引导 ${tutIdx+1}/${TUT_STEPS.length}`;
  document.getElementById('tutText').innerHTML=s.t;
  document.getElementById('tutDots').innerHTML=TUT_STEPS.map((_,i)=>`<i class="${i<=tutIdx?'on':''}"></i>`).join('');
  document.getElementById('tutNext').textContent=tutIdx===TUT_STEPS.length-1?'开始闯关':'知道了';
  // 高亮目标元素
  document.querySelectorAll('.tutHL').forEach(e=>e.classList.remove('tutHL'));
  if(s.hl){const el=document.getElementById(s.hl);if(el)el.classList.add('tutHL');}
}
function nextTut(){
  tutIdx++;
  if(tutIdx>=TUT_STEPS.length){endTut(true);}else{renderTutStep();}}
function endTut(completed){
  const box=document.getElementById('tutorial');box.style.display='none';tutOn=false;hardPause=false;
  document.querySelectorAll('.tutHL').forEach(e=>e.classList.remove('tutHL'));
  if(completed){SAVE.tutDone=true;writeSave();}
  setTimeout(()=>showLetter(0),400);}
document.getElementById('tutNext').onclick=nextTut;
document.getElementById('tutSkip').onclick=()=>endTut(true);

// ---------- 启动初始化：加载存档 + 每日挑战 + 开始界面沿用 ----------
loadSave();refreshSaveUI();rollDaily();applyDailyMods();rollWeek();
applyQuality(); // 应用初始画质档
setMode('normal'); // 默认常规模式
// 每日挑战条
(function(){
  const bar=document.getElementById('dailyBar');
  if(!bar)return;
  bar.innerHTML=`<div class="dm"><span class="dmt">📅 今日挑战</span>
    <span class="dmn">${dailyMod?dailyMod.n+' · '+dailyMod.d:'常规模式'}</span>
    <span class="dmb">今日最高分 ${dailyBest}</span></div>`;
})();
// 周赛横幅
function renderWeekBar(){
  const el=document.getElementById('weekBar');if(!el||!weekMod)return;
  const cl=SAVE.weekClear||{};
  const isNew=!cl[weekMod.id];
  el.innerHTML=`<span class="wbt">🏁 本周周赛（第 ${weekKey()%10000} 周）</span>
    <span class="wbn">${weekMod.ic} ${weekMod.n}</span>
    <span class="wbd">${weekMod.d}</span>
    <span class="wbs">本周最高分 ${weekBest} · ${isNew?'🎁 首通奖励：'+WEEK_REWARD[weekMod.id]:'✅ 已通关'}</span>`;}
renderWeekBar();
try{renderClimateBar();}catch(e){console.warn('[CLIMATE]',e);}
renderCheckin();
// 折叠面板开关
(function(){const b=document.getElementById('moreBtn'),pn=document.getElementById('morePanel');
  if(!b||!pn)return;
  b.onclick=()=>{const on=pn.classList.toggle('open');b.classList.toggle('open',on);
    b.textContent=on?'▴ 收起面板':'▾ 签到 · 分享码 · 点数兑换';};})();
// 分享码 UI 绑定
(function(){
  const inp=document.getElementById('shareInput'),msg=document.getElementById('shareMsg');
  if(!inp)return;
  const setMsg=(t,ok)=>{if(msg){msg.className=ok?'scOk':'scErr';msg.textContent=t;}};
  // 输入时实时预览对比
  inp.addEventListener('input',()=>{const v=inp.value.trim().toUpperCase();
    if(v.length>=11&&parseShareCode(v))renderShareCompare(v);
    else document.getElementById('shareCmp').innerHTML='';});
  document.getElementById('shareLoad').onclick=()=>{
    const r=applyShareCode(inp.value);
    if(!r){setMsg('❌ 分享码无效，请检查是否完整（格式 ZNTX-XXXXXX）',false);
      document.getElementById('shareCmp').innerHTML='';return;}
    const md={normal:'常规闯关',endless:'Boss 无尽',daily:'每日挑战',week:'周赛'}[r.mode]||'常规';
    setMsg(`✅ 已载入【${md}】分享码，点击「开始闯关」即可以同条件对拼！`,true);
    renderShareCompare(inp.value);
    tip(`🎟️ 已载入 ${md} 分享码`);};
  document.getElementById('shareMine').onclick=()=>{
    // 生成当前模式的分享码并填入
    const code=currentShareCode();
    inp.value=code;shareCodeCur=code;
    SAVE.shareCodes=SAVE.shareCodes||{};SAVE.shareCodes[code]={t:Date.now(),m:gameMode};writeSave();
    setMsg('📋 已生成我的分享码，复制发给好友（同条件对拼）',true);
    // 尝试复制到剪贴板
    try{navigator.clipboard&&navigator.clipboard.writeText(code);}catch(e){}
    tip('🎟️ 我的分享码已生成');};
})();
{const ov=document.getElementById('overlay');
  const b=SAVE.best||{};
  if(b.kills>0||SAVE.totalRuns>0){
    ov.querySelector('h1').textContent='渣 男 行 天 下';
    ov.querySelector('p').innerHTML=`第 ${SAVE.totalRuns} 局 · 历史最高：击杀 ${b.kills} · 境界 ${b.realm}<br>
      <span style="color:#ffd60a">🏅 成就 ${SAVE.achievements.length}/${ACHIEVEMENTS.length} · 👑 图鉴 ${BOSSES_DEF.filter(x=>(SAVE.bosses||{})[x.id]>0).length}/${BOSSES_DEF.length} · 🎖️ 点数 ${totalAchPoints()-(SAVE.achPoints||0)}</span>
      ${SAVE.endlessBest>0?`<br><span style="color:#f72585;font-size:12px">👑 无尽最高分：${SAVE.endlessBest}</span>`:''}
      ${SAVE.realmBonus>0?`<br><span style="color:#7ee0a0;font-size:12px">转世加成：伤害 +${Math.round(SAVE.realmBonus*100)}%</span>`:''}
      <br><span style="color:#9ad0ff;font-size:12px">点击「开始闯关」继承前世修为</span>`;
    ov.querySelector('#startBtn').textContent='再 战 一 局';}}
/* ================= v37 云端社交（好友 / 公会 / 云端排行榜） =================
   - SDK 由 CDN 加载（WorkBuddyCloud 全局）；加载失败或离线时全部功能优雅降级，游戏本体不受影响
   - 登录：WorkBuddy 账号登录（OAuth 回跳本站根路径）；未登录仅可查看云端榜
   - 身份隔离由数据库 RLS 保证：owner_id = auth.uid()，客户端永不传 owner_id */
const WBCFG={endpoint:'https://zhanan-game.app.workbuddy.host',
  oauthRelayBaseUrl:'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey:'wbpk_3SDxEj1w1Ea4duwTnHU6mc_o6E4sgN4cwQh0E64sjAgvcPC7JsxZjXt'};
let cloud=null,cloudOn=false,socSess=null,socMe=null,socBoardCache=null,socFriendsCache=null,socGuildCache=undefined,socTab='board';
(function(){try{
  if(!window.WorkBuddyCloud){console.warn('[SOC] SDK 未加载，社交功能进入离线模式');return;}
  cloud=WorkBuddyCloud.createWorkBuddyCloud(WBCFG);cloudOn=true;
}catch(e){console.warn('[SOC] 初始化失败',e&&e.message);}})();
const socUid=()=>socSess&&socSess.user?socSess.user.id:null;
async function socTry(fn){try{return await fn();}catch(e){console.warn('[SOC]',e&&e.message||e);return null;}}
async function socBoot(){
  if(!cloudOn){renderSoc();return;}
  // OAuth 回跳处理（WorkBuddy 账号登录后带 code 回到站点根路径）
  const url=new URL(location.href);
  if(url.searchParams.has('code')){
    const provider=url.searchParams.get('provider');
    const handler=provider==='workbuddy'?cloud.auth.handleWorkBuddyCallback:null;
    if(typeof handler==='function'){
      const r=await socTry(()=>handler.call(cloud.auth));
      if(r&&r.data&&!r.error){
        for(const k of ['code','state','provider'])url.searchParams.delete(k);
        history.replaceState(null,'',url.pathname+url.search+url.hash);
        tip('🌐 登录成功，社交功能已解锁！');
      }else if(r&&r.error){tip('登录失败：'+(r.error.message||'授权未完成'));}
    }
  }
  const s=await socTry(()=>cloud.auth.getSession());
  socSess=(s&&s.data)||null;
  if(socSess){await socEnsurePlayer();socSyncStats();}
  renderSoc();
}
async function socLogin(){
  if(!cloudOn){tip('🌐 云端不可用（请联网后重试）');return;}
  const r=await socTry(()=>cloud.auth.signInWithOAuth({provider:'workbuddy',redirectTo:location.origin+'/'}));
  if(!r||r.error){tip('登录暂不可用，请稍后再试');return;}
  if(r.data&&r.data.url)location.assign(r.data.url);
}
async function socLogout(){
  if(cloudOn)await socTry(()=>cloud.auth.signOut());
  socSess=null;socMe=null;socFriendsCache=null;socGuildCache=undefined;socBoardCache=null;
  renderSoc();tip('已退出登录');
}
async function socEnsurePlayer(){
  const uid=socUid();if(!uid)return null;
  const r=await socTry(()=>cloud.database.from('players').select('*').eq('owner_id',uid).maybeSingle());
  if(r&&r.data){socMe=r.data;
    if(SAVE.socName&&SAVE.socName!==socMe.name)
      await socTry(()=>cloud.database.from('players').update({name:SAVE.socName}).eq('owner_id',uid));
    return socMe;}
  const nm=SAVE.socName||('渣男'+Math.floor(1000+Math.random()*9000));
  SAVE.socName=nm;writeSave();
  const dn=(socSess.user&&socSess.user.name)||null;
  const ins=await socTry(()=>cloud.database.from('players').insert({name:nm,owner_name:dn}).select());
  socMe=(ins&&ins.data&&ins.data[0])||null;
  return socMe;
}
async function socRename(nm){
  nm=(nm||'').trim().slice(0,12);if(!nm)return;
  SAVE.socName=nm;writeSave();
  if(socUid())await socTry(()=>cloud.database.from('players').update({name:nm}).eq('owner_id',socUid()));
  tip('✅ 昵称已更新为 '+nm);renderSoc();
}
async function socSyncStats(){
  const uid=socUid();if(!uid)return;
  if(!socMe)await socEnsurePlayer();if(!socMe)return;
  const bk=Math.max(SAVE.best.kills||0,socMe.best_kills||0);
  const bs=Math.max(SAVE.best.gradeScore||0,socMe.best_score||0);
  const rl=Math.max(SAVE.best.lvl||1,socMe.realm||1);
  const runs=Math.max(SAVE.totalRuns||0,socMe.runs||0);
  if(bk===(socMe.best_kills||0)&&bs===(socMe.best_score||0)&&rl===(socMe.realm||1)&&runs===(socMe.runs||0))return;
  const r=await socTry(()=>cloud.database.from('players').update({best_kills:bk,best_score:bs,realm:rl,runs}).eq('owner_id',uid).select());
  if(r&&r.data&&r.data[0])socMe=r.data[0];
}
async function socSubmitRun(score){
  if(!cloudOn||!socSess||!(score>0))return;
  try{
    if(!socMe)await socEnsurePlayer();if(!socMe)return;
    if(score>(socMe.best_score||0)&&socMe.best_score>0)
      await socTry(()=>cloud.database.from('cloud_scores').insert({name:socMe.name,mode:gameMode,
        season:curSeason().key,score:Math.floor(score),kills:Math.floor(S.kills),realm:Math.floor(S.lvl)}));
    else if(!(socMe.best_score>0))
      await socTry(()=>cloud.database.from('cloud_scores').insert({name:socMe.name,mode:gameMode,
        season:curSeason().key,score:Math.floor(score),kills:Math.floor(S.kills),realm:Math.floor(S.lvl)}));
    await socSyncStats();
  }catch(e){}
}
async function socLoadBoard(){
  if(!cloudOn)return null;
  const r=await socTry(()=>cloud.database.from('cloud_scores').select('*').order('score',{ascending:false}).limit(90));
  if(!r||!r.data)return null;
  const seen=new Set(),out=[];
  for(const row of r.data){if(seen.has(row.owner_id))continue;seen.add(row.owner_id);out.push(row);if(out.length>=20)break;}
  return out;
}
async function socLoadFriends(){
  const uid=socUid();if(!cloudOn||!uid)return null;
  const e1=await socTry(()=>cloud.database.from('friend_edges').select('*').eq('owner_id',uid));
  const edges=(e1&&e1.data)||[];
  const uids=edges.map(x=>x.friend_uid);
  if(!uids.length)return [];
  const p=await socTry(()=>cloud.database.from('players').select('*').in('owner_id',uids));
  const back=await socTry(()=>cloud.database.from('friend_edges').select('owner_id').in('owner_id',uids).eq('friend_uid',uid));
  const backs=new Set(((back&&back.data)||[]).map(x=>x.owner_id));
  return uids.map(u=>{const row=(p&&p.data||[]).find(x=>x.owner_id===u)||null;
    return {uid:u,name:row?row.name:'（已隐退）',best_kills:row?row.best_kills:0,best_score:row?row.best_score:0,realm:row?row.realm:0,mutual:backs.has(u)};});
}
async function socAddFriend(code){
  const uid=socUid();if(!uid)return;
  code=(code||'').trim();if(!code){tip('请输入好友 ID');return;}
  if(code===uid){tip('不能添加自己哦');return;}
  const chk=await socTry(()=>cloud.database.from('players').select('name').eq('owner_id',code).maybeSingle());
  if(!chk||!chk.data){tip('❌ 找不到该好友 ID，请核对');return;}
  const ins=await socTry(()=>cloud.database.from('friend_edges').insert({friend_uid:code}));
  if(ins===null){tip('添加失败（可能已添加过）');return;}
  socFriendsCache=null;tip('🤝 已添加 '+chk.data.name);renderSoc();
}
async function socDelFriend(uid2){
  const uid=socUid();if(!uid)return;
  await socTry(()=>cloud.database.from('friend_edges').delete().eq('owner_id',uid).eq('friend_uid',uid2));
  socFriendsCache=null;tip('已删除');renderSoc();
}
async function socLoadGuild(){
  const uid=socUid();if(!cloudOn||!uid)return undefined;
  const g1=await socTry(()=>cloud.database.from('guilds').select('*').eq('owner_id',uid).maybeSingle());
  if(g1&&g1.data){
    const ms=await socTry(()=>cloud.database.from('guild_members').select('*').eq('guild_id',g1.data.id));
    return {guild:g1.data,role:'leader',members:(ms&&ms.data)||[]};}
  const m=await socTry(()=>cloud.database.from('guild_members').select('*').eq('owner_id',uid).maybeSingle());
  if(m&&m.data){
    const g2=await socTry(()=>cloud.database.from('guilds').select('*').eq('id',m.data.guild_id).maybeSingle());
    if(g2&&g2.data){
      const ms2=await socTry(()=>cloud.database.from('guild_members').select('*').eq('guild_id',g2.data.id));
      return {guild:g2.data,role:'member',members:(ms2&&ms2.data)||[]};}
    await socTry(()=>cloud.database.from('guild_members').delete().eq('owner_id',uid));}
  return null;
}
async function socCreateGuild(name,notice){
  name=(name||'').trim().slice(0,10);if(!name){tip('请输入公会名');return;}
  const ins=await socTry(()=>cloud.database.from('guilds').insert({name,notice:(notice||'').trim().slice(0,60)}));
  if(ins===null){tip('创建失败（公会名可能已被占用）');return;}
  socGuildCache=undefined;tip('🏰 公会「'+name+'」成立！你是会长');renderSoc();
}
async function socJoinGuild(name){
  name=(name||'').trim();if(!name){tip('请输入公会名');return;}
  const q=await socTry(()=>cloud.database.from('guilds').select('*').eq('name',name).maybeSingle());
  if(!q||!q.data){tip('❌ 没有叫「'+name+'」的公会');return;}
  const ins=await socTry(()=>cloud.database.from('guild_members').insert({guild_id:q.data.id}));
  if(ins===null){tip('加入失败（可能已在公会中）');return;}
  socGuildCache=undefined;tip('🏰 已加入「'+q.data.name+'」');renderSoc();
}
async function socLeaveGuild(){
  const uid=socUid();if(!uid)return;
  await socTry(()=>cloud.database.from('guild_members').delete().eq('owner_id',uid));
  socGuildCache=undefined;tip('已退出公会');renderSoc();
}
async function socDisbandGuild(){
  const r=await socTry(()=>cloud.database.rpc('disband_guild'));
  if(r===null){tip('解散失败');return;}
  socGuildCache=undefined;tip('公会已解散');renderSoc();
}
function socBtnLabel(){return socSess?'▾ 好友 · 公会 · 云端排行榜':'▾ 🔑 登录 · 好友 · 公会 · 排行榜';}
function socRenderLogin(){
  const el=document.getElementById('socLogin');if(!el)return;
  const sb=document.getElementById('socBtn');
  if(sb&&!sb.classList.contains('open')){sb.textContent=socBtnLabel();sb.classList.toggle('hint',!socSess);}
  if(!cloudOn){el.innerHTML='<span style="color:#8a7aa8">⚠️ 云端不可用（离线模式，游戏可正常游玩）</span>';return;}
  if(!socSess){el.innerHTML='<span>未登录 · 登录后解锁好友与公会</span><button class="socMini gold" id="socLoginBtn">使用 WorkBuddy 登录</button>';
    const b=document.getElementById('socLoginBtn');if(b)b.onclick=socLogin;return;}
  const nm=(socMe&&socMe.name)||SAVE.socName||'…';
  const uid=socUid();
  el.innerHTML=`<span style="color:#7ee0a0">● ${nm}</span>`+
    `<span class="socUid">ID: ${uid?uid.slice(0,10)+'…':''}</span>`+
    `<button class="socMini" id="socCopyId">复制ID</button><button class="socMini gray" id="socLogoutBtn">退出</button>`;
  const c=document.getElementById('socCopyId');
  if(c)c.onclick=()=>{try{navigator.clipboard&&navigator.clipboard.writeText(uid||'');tip('📋 好友 ID 已复制');}catch(e){}};
  const l=document.getElementById('socLogoutBtn');if(l)l.onclick=socLogout;
}
function socRenderBody(){
  const el=document.getElementById('socBody');if(!el)return;
  if(socTab==='board'){
    if(!socBoardCache){el.innerHTML='<div class="sempty">加载云端榜中…</div>';
      socLoadBoard().then(b=>{socBoardCache=b||[];if(socTab==='board')socRenderBody();});return;}
    if(!socBoardCache.length){el.innerHTML='<div class="sempty">云端榜虚位以待 —— 打一局创造历史！</div>';return;}
    el.innerHTML=socBoardCache.map((r,i)=>`<div class="srow${socUid()&&r.owner_id===socUid()?' me':''}">`+
      `<span class="rk">${['🥇','🥈','🥉'][i]||('#'+(i+1))}</span><span class="nm">${escHtml(r.name)}</span>`+
      `<span class="st">${r.score}分·${r.kills}杀</span><span class="st" style="color:#6a5a8a">${r.season||''}</span></div>`).join('')+
      '<div class="shint">💡 结算创个人最佳时自动上传；登录后你的名字也会出现在这里</div>';
  }else if(socTab==='friends'){
    if(!socSess){el.innerHTML='<div class="sempty">登录后添加好友，比拼战绩</div>';return;}
    if(!socFriendsCache){el.innerHTML='<div class="sempty">加载好友中…</div>';
      socLoadFriends().then(f=>{socFriendsCache=f||[];if(socTab==='friends')socRenderBody();});return;}
    let html=`<div class="socForm"><input id="socFidInput" placeholder="粘贴好友 ID（社交面板顶部可复制自己的）" maxlength="24">`+
      `<button class="socMini gold" id="socFidAdd">添加</button></div>`;
    if(socFriendsCache.length)
      html+=socFriendsCache.map(f=>`<div class="srow"><span class="nm">${escHtml(f.name)}${f.mutual?' <span class="mut">互关</span>':''}</span>`+
        `<span class="st">杀${f.best_kills}·${f.best_score}分</span><button class="socMini gray" data-fuid="${f.uid}">删</button></div>`).join('');
    else html+='<div class="sempty">还没有好友 —— 把你的 ID 发给朋友，让 TA 添加你</div>';
    html+=`<div class="shint">✏️ 昵称：</div><div class="socForm"><input id="socNameInput" placeholder="游戏昵称" maxlength="12" value="${escHtml(SAVE.socName||'')}">`+
      `<button class="socMini" id="socNameSet">改名</button></div>`;
    el.innerHTML=html;
    const inp=document.getElementById('socFidInput');
    document.getElementById('socFidAdd').onclick=()=>socAddFriend(inp?inp.value:'');
    el.querySelectorAll('[data-fuid]').forEach(b=>b.onclick=()=>socDelFriend(b.dataset.fuid));
    const ni=document.getElementById('socNameInput');
    document.getElementById('socNameSet').onclick=()=>socRename(ni?ni.value:'');
  }else{
    if(!socSess){el.innerHTML='<div class="sempty">登录后创建或加入公会</div>';return;}
    if(socGuildCache===undefined){el.innerHTML='<div class="sempty">加载公会中…</div>';
      socLoadGuild().then(g=>{socGuildCache=g;if(socTab==='guild')socRenderBody();});return;}
    if(!socGuildCache){
      el.innerHTML=`<div class="shint">🏰 创建公会（成为会长）或加入朋友的公会</div>`+
        `<div class="socForm"><input id="socGname" placeholder="公会名（≤10字）" maxlength="10"><button class="socMini gold" id="socGcreate">创建</button></div>`+
        `<div class="socForm"><input id="socGjoin" placeholder="要加入的公会名" maxlength="10"><button class="socMini" id="socGdo">加入</button></div>`;
      document.getElementById('socGcreate').onclick=()=>socCreateGuild(document.getElementById('socGname').value,'');
      document.getElementById('socGdo').onclick=()=>socJoinGuild(document.getElementById('socGjoin').value);
      return;}
    const g=socGuildCache;
    const uid=socUid();
    const all=[{owner_id:g.guild.owner_id,role:'会长'}].concat(g.members.map(m=>({owner_id:m.owner_id,role:'成员'})));
    el.innerHTML='<div class="sempty">加载成员战绩…</div>';
    socTry(()=>cloud.database.from('players').select('*').in('owner_id',all.map(a=>a.owner_id))).then(pr=>{
      const rows=(pr&&pr.data)||[];
      el.innerHTML=`<div class="guildHead"><div class="gn">🏰 ${escHtml(g.guild.name)}</div>`+
        `<div class="gd">${escHtml(g.guild.notice||'（暂无公告）')}</div>`+
        `<div class="gd">成员 ${all.length} 人 · 你是${g.role==='leader'?'会长':'成员'}</div></div>`+
        all.map(a=>{const p=rows.find(x=>x.owner_id===a.owner_id);
          return `<div class="srow${a.owner_id===uid?' me':''}"><span class="nm">${escHtml(p?p.name:'…')}${a.role==='会长'?' 👑':''}</span>`+
            `<span class="st">杀${p?p.best_kills:0}·${p?p.best_score:0}分</span></div>`;}).join('')+
        `<div class="sbtnRow">${g.role==='leader'
          ?'<button class="socMini gray" id="socGdisband">解散公会（需成员先退出）</button>'
          :'<button class="socMini gray" id="socGleave">退出公会</button>'}</div>`;
      if(g.role==='leader'){const b=document.getElementById('socGdisband');if(b)b.onclick=socDisbandGuild;}
      else{const b=document.getElementById('socGleave');if(b)b.onclick=socLeaveGuild;}
    });
  }
}
function escHtml(s){return String(s==null?'':s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));}
function renderSoc(){
  socRenderLogin();socRenderBody();
  const b=document.getElementById('socBtn');
  if(b&&!b._bound){b._bound=true;
    b.onclick=()=>{const pn=document.getElementById('socPanel');
      const on=pn.classList.toggle('open');b.classList.toggle('open',on);
      b.textContent=on?'▴ 收起社交面板':socBtnLabel();b.classList.toggle('open',on);
      b.classList.toggle('hint',!on&&!socSess);};}
  document.querySelectorAll('#socPanel .stab').forEach(t=>{
    if(t._bound)return;t._bound=true;
    t.onclick=()=>{socTab=t.dataset.t;
      document.querySelectorAll('#socPanel .stab').forEach(x=>x.classList.toggle('on',x===t));socRenderBody();};});
}
socBoot();
loop();

;(function(){try{window.__GAME_READY__=1;}catch(e){}})();
