'use strict';
/* =================《心动狂潮》手机版 Demo v2 =================
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
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,300);
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
  if(qualManual)return;   // v69：玩家手动选过画质档 → 自适应不再覆盖
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
// v69：是否有其它全屏面板正开着（图鉴 / 三选一 / 打赏 / 分享卡 / 新手引导）——用于避免面板叠层
let bgAutoPaused=false;
function panelBusy(){
  for(const id of ['codex','modal','tipOv','shareOv','tutorial','aboutOv']){   // v73：关于面板同样视为「面板占用」，避免叠层与后台误暂停
    const el=document.getElementById(id);
    if(el&&getComputedStyle(el).display!=='none')return true;}
  return false;}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    // v69：切后台时把 paused 一并置真，保证后台绝不空转渲染（省电 / 防烫）
    if(typeof started!=='undefined'&&started&&!hardPause){hardPause=true;paused=true;bgAutoPaused=true;
      const pb=document.getElementById('pauseBtn');if(pb)pb.textContent='▶';}
  }else if(typeof started!=='undefined'&&started&&hardPause&&bgAutoPaused){
    // v69：只对「本次后台暂停」负责。回到前台时若已有面板开着（图鉴/三选一/打赏/引导），
    // 直接恢复游玩，不叠加暂停面板；否则弹出暂停面板，明确告知「已暂停」，由玩家决定何时继续。
    bgAutoPaused=false;
    if(panelBusy()){hardPause=false;paused=false;
      const pb=document.getElementById('pauseBtn');if(pb)pb.textContent='⏸';}
    else if(typeof pauseOpen==='function')pauseOpen();
  }
});
// 依据设备能力给个合理的初始档（低内存/低核数直接中档起步）
// 注意：真正的 applyQuality 调用在脚本末尾（game init 阶段），此处仅决定档位
(function initQuality(){
  const mem=navigator.deviceMemory||4,cores=navigator.hardwareConcurrency||4;
  if(mem<=2||cores<=4){QUAL.level=1;QUAL.shadow=false;QUAL.rain=true;QUAL.grade=true;}
})();

// ========== v69：玩家设置（音量 / 画质档 / 震动）==========
// 独立存储键，与存档（znxtx_save_v1）、打赏（znxtx_tips_v1）完全解耦：清档不会重置偏好。
const SET_KEY='znxtx_set_v1';
const DEFAULT_SET={sfxVol:.8,musVol:.7,qual:'auto',vib:1};
let SET=Object.assign({},DEFAULT_SET);
function loadSet(){
  try{const s=localStorage.getItem(SET_KEY);
    SET=s?Object.assign({},DEFAULT_SET,JSON.parse(s)):Object.assign({},DEFAULT_SET);}
  catch(e){SET=Object.assign({},DEFAULT_SET);}
  // 类型兜底：手改 localStorage 也不会产生 NaN / 越界值
  for(const k of ['sfxVol','musVol'])if(typeof SET[k]!=='number'||!isFinite(SET[k]))SET[k]=DEFAULT_SET[k];
  SET.sfxVol=Math.max(0,Math.min(1,SET.sfxVol));SET.musVol=Math.max(0,Math.min(1,SET.musVol));
  SET.qual=(SET.qual==='auto'||SET.qual==='2'||SET.qual==='1'||SET.qual==='0')?SET.qual:'auto';
  SET.vib=SET.vib?1:0;
  return SET;}
function writeSet(){try{localStorage.setItem(SET_KEY,JSON.stringify(SET));}catch(e){}}
// 震动反馈（设置里可关；不支持震动的设备静默跳过，绝不因震动报错打断游戏）
function vib(p){if(!SET||!SET.vib)return;try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}}
// 玩家手动选过画质档后，帧率自适应不再覆盖玩家选择
let qualManual=false;
function setQualityLevel(v){
  if(v==='auto'){qualManual=false;
    const mem=navigator.deviceMemory||4,cores=navigator.hardwareConcurrency||4;
    QUAL.level=(mem<=2||cores<=4)?1:2;}
  else{qualManual=true;QUAL.level=+v;}
  QUAL.shadow=QUAL.level>=2;QUAL.grade=QUAL.level>=1;QUAL.rain=QUAL.level>=1;
  try{applyQuality();}catch(e){}
  SET.qual=String(v);writeSet();}
// 硬上限：极端局（无尽后期 / 深渊高层）下限制实体与粒子总量，避免内存与帧率失控
const MAX_ENEMIES=120,MAX_PARTS=320;
function enemyBudget(){return Math.max(0,MAX_ENEMIES-enemies.length);}

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
// ---------- 修为境界体系 ----------
const REALMS=['炼体','练气','凝气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫','心动大帝'];
const LAYERS=['前期','中期','后期'];
function realmName(lvl){const r=Math.min(REALMS.length-1,Math.floor((lvl-1)/3)),l=LAYERS[(lvl-1)%3];
  return r>=REALMS.length-1?'心动大帝':`${REALMS[r]}·${l}`;}
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
function metalMat(col,rough,mtl){return new THREE.MeshStandardMaterial({color:col,roughness:rough===undefined?.4:rough,metalness:mtl===undefined?.85:mtl,envMapIntensity:1,emissive:col,emissiveIntensity:0});}
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
  gift:['手写情书','樱花标本','天台汽水'],
  trait:{n:'🌙 满月担保',d:'结缘后持续回血；恋人必杀可瞬间回满全场'},role:'担保人',
  stages:[
   {text:'（她把你拉进教学楼后的樱花道，眼眶红红的）"军团长带着半个年级的人，在操场等你。你……是不是也骗过我？"',choices:[
     {t:'🙈 嘴甜路线：「他们来找我，是因为我眼里只有你。」（出示礼物）',tag:'+12好感 +剧情奖励',aff:12,fx:s=>{s.gift();}},
     {t:'😈 腹黑路线：「吃醋的校花最好看，晚晴同学。」',tag:'+心动值 招来情敌',aff:-5,fx:()=>{S.scum=Math.min(100,S.scum+35);spawnJealous(2);}}]},
   {text:'"……礼物我很喜欢。但你得发誓——这辈子只对我一个人好。"',choices:[
     {t:'💍 真诚路线：「我发誓。拿这条命发誓。」',tag:'+20好感 结缘同行（自动回血）',aff:20,fx:()=>{recruit(0);}},
     {t:'🎭 浪子术路线：「我的心，比整个操场还大。」',tag:'+大量心动值 招来情敌',aff:-8,fx:()=>{S.scum=100;spawnJealous(3);}}]},
   {text:'"周末的樱花祭……就我们两个人去，好不好？"（她攥着两张票）',choices:[
     {t:'🌸 温柔路线：「花已经开了，走吧。」',tag:'+22好感 约会：修为大涨',aff:22,fx:()=>{gainXp(60);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'📱 敷衍路线：「再说吧，我最近有点忙。」',tag:'-10好感',aff:-10,fx:()=>{tip('😢 她默默收起了电影票…');}}]},
   {text:'"军团长说得没错……你身边还有人。我全都知道了。"',choices:[
     {t:'🕊️ 坦白路线：「是我错了。之后只有你。」',tag:'+26好感 恋人达成（回血+伤害）',aff:26,fx:()=>{recruit(0);S.dmgMul*=1.15;}},
     {t:'😏 摊牌路线：「反正你也离不开我，不是吗？」',tag:'+50心动值 引来4名情敌',aff:-12,fx:()=>{S.scum=Math.min(100,S.scum+50);spawnJealous(4);}}]},
   // —— 扩充剧情 5~8：误会 / 反转 / 家庭 / 抉择 ——
   {text:'（她把一张照片拍在樱花道的栏杆上）"这是你和苏曼在霓虹底下的合照。解释一下？"',choices:[
     {t:'📸 圆谎路线：「那是在帮你打听她家的情报！」',tag:'+10好感 但埋下隐患',aff:10,fx:()=>{S.scum=Math.min(100,S.scum+25);tip('🕵️ 她半信半疑地收起了照片…');}},
     {t:'😇 坦诚路线：「我不想骗你。可那晚我满脑子都是你。」',tag:'+18好感 +回血',aff:18,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+40);}},
     {t:'💔 冷酷路线：「查岗查到我头上了？」',tag:'-14好感 招来情敌',aff:-14,fx:()=>{spawnJealous(3);tip('😤 她红着眼眶跑开了…');}}]},
   {text:'（她突然挽住你的手臂）"讨债的人都在校门口了。你先跟我回家，好不好？"',choices:[
     {t:'🎁 备礼路线：「阿姨喜欢什么？我全买。」',tag:'+20好感 +碎片',aff:20,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);S.hp=Math.min(S.maxHp,S.hp+20);}},
     {t:'😅 逃避路线：「见我这么优秀的女婿，阿姨会自卑的。」',tag:'-8好感',aff:-8,fx:()=>{tip('😑 她："你少贫了。"');}}]},
   {text:'"我拿到了国外交换的名额……这一年，正好躲开这场讨债。"（她攥紧了衣角）',choices:[
     {t:'✈️ 成全路线：「去吧，我等你回来。」',tag:'+24好感 恋人羁绊加深',aff:24,fx:()=>{recruit(0);S.dmgMul*=1.1;S.regen+=1;}},
     {t:'🖐️ 挽留路线：「别走。留下来，我们一起还。」',tag:'+16好感 +巨额心动值',aff:16,fx:()=>{S.scum=Math.min(100,S.scum+40);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'🎩 放手路线：「去吧，反正我也没空陪你。」',tag:'-16好感',aff:-16,fx:()=>{tip('💧 她笑着说了声"好"，转身走了。');}}]},
   {text:'"如果……我遇到更好的人，你会祝福我吗？"（她盯着你的眼睛）',choices:[
     {t:'💍 一生路线：「不会。因为没人比我更懂你。」',tag:'+30好感 恋人圆满（全属性）',aff:30,fx:()=>{recruit(0);S.dmgMul*=1.2;S.pickR*=1.3;}},
     {t:'🌪️ 修罗路线：「祝福？我会让他后悔出生。」',tag:'+60心动值 +伤害翻倍',aff:-6,fx:()=>{S.scum=100;S.dmgMul*=1.35;spawnJealous(5);}}]}]},
 {name:'御姐 · 苏曼',col:0x9d4edd,hair:0x14101e,ribbon:0x7209b7,face:'🍷',
  gift:['陈年红酒','黑胶唱片','夜雨里的伞'],
  trait:{n:'🍷 夜行情报',d:'结缘后伤害提升；恋人必杀召陨星清扫全场'},role:'线人',
  stages:[
   {text:'（霓虹在杯里晃）"小弟弟，昨晚在夜店里搂着别人跳舞的，是不是你？"',choices:[
     {t:'😎 撒谎路线：「那是你的双胞胎妹妹吧？我可只认你。」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'😏 坦白路线：「是我。但你敢说你不吃醋？」',tag:'+心动值 +伤害提升',aff:6,fx:()=>{S.scum=Math.min(100,S.scum+40);S.dmgMul*=1.1;}}]},
   {text:'"有点意思。想追我？先证明你能在这场雨夜的讨债局里活下来。"',choices:[
     {t:'⚔️ 并肩路线：「那就让我背你杀出去！」',tag:'+20好感 结缘：曼姐压阵（伤害+25%）',aff:20,fx:()=>{recruit(1);}},
     {t:'🌹 浪漫路线：（单膝下跪献上 999 朵玫瑰）',tag:'+16好感 +碎片 +回血',aff:16,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);S.hp=Math.min(S.maxHp,S.hp+40);}}]},
   {text:'"我下周三包了个天台。缺个……男伴。你来不来？"',choices:[
     {t:'🤵 绅士路线：「西装我已经熨好了。」',tag:'+24好感 约会：好感与修为双涨',aff:24,fx:()=>{gainXp(60);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'🍺 随意路线：「天台太闷，不如直接去喝酒？」',tag:'-6好感',aff:-6,fx:()=>{tip('😑 她挑了挑眉："幼稚。"');}}]},
   {text:'"我已经很久没对谁认真过了。这场债，你打算怎么替我扛？"',choices:[
     {t:'💎 承诺路线：「那就认真到底。」',tag:'+28好感 恋人达成（伤害+30%）',aff:28,fx:()=>{recruit(1);S.dmgMul*=1.3;}},
     {t:'🌊 浪子路线：「认真？那不是我的人设。」',tag:'+50心动值 +巨额伤害',aff:-14,fx:()=>{S.scum=Math.min(100,S.scum+50);S.dmgMul*=1.2;}}]},
   // —— 扩充剧情 5~8 ——
   {text:'（她把一张账单推到你面前）"彩礼的账已经寄到我店里了。签个字，我替你压下去。"',choices:[
     {t:'🖊️ 签约路线：「只要能天天见到你，什么合同都签。」',tag:'+18好感 +碎片',aff:18,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);}},
     {t:'🃏 反将路线：「我签。但得加一条——你归我。」',tag:'+22好感 +心动值',aff:22,fx:()=>{S.scum=Math.min(100,S.scum+30);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'🚪 拒绝路线：「我不会被谁困住的。」',tag:'-10好感 +伤害提升',aff:-10,fx:()=>{S.dmgMul*=1.15;tip('😏 她笑了："果然有意思。"');}}]},
   {text:'"夜里有三个人堵在我店门口，塞了一沓你的欠条。"（她眼神危险）',choices:[
     {t:'🛡️ 护花路线：「告诉我是谁，我去会会。」',tag:'+24好感 招来精英情敌',aff:24,fx:()=>{spawnJealous(2);S.dmgMul*=1.1;}},
     {t:'🍷 潇洒路线：「让他们来。正好缺个沙包。」',tag:'+18好感 +心动值',aff:18,fx:()=>{S.scum=Math.min(100,S.scum+35);}}]},
   {text:'"明天是我生日。别买礼物，人来了就行——今晚的雨很大。"',choices:[
     {t:'🎂 用心路线：「礼物不用买，因为我就是最好的礼物。」',tag:'+26好感 约会圆满',aff:26,fx:()=>{gainXp(70);S.hp=S.maxHp;}},
     {t:'💰 世俗路线：（刷了张卡买了块表送她）',tag:'+14好感',aff:14,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+35);}}]},
   {text:'"这么久，你是我唯一没看透的人。"（她第一次露出脆弱）',choices:[
     {t:'🌟 唯一路线：「那就别看了，信我一次。」',tag:'+30好感 恋人圆满（伤害+拾取）',aff:30,fx:()=>{recruit(1);S.dmgMul*=1.25;S.pickR*=1.3;}},
     {t:'🕶️ 保命路线：「看透了，你就不会喜欢我了。」',tag:'+55心动值 +巨额伤害',aff:-8,fx:()=>{S.scum=100;S.dmgMul*=1.4;}}]}]},
 {name:'邻家甜妹 · 糖糖',col:0xf9a03f,hair:0x5a3a1e,ribbon:0xffd60a,face:'🍬',
  gift:['喜糖','捧花编的花绳','保温桶'],
  trait:{n:'🍬 甜味掩护',d:'结缘后移速与拾取提升；恋人必杀令全场被魅惑'},role:'逃婚同谋',
  stages:[
   {text:'（她抱着托盘从甜品台小跑过来）"喏，喜糖！你上次说喜欢甜的……对吧？"',choices:[
     {t:'🥰 嘴甜路线：「你递来的，白开水都是甜的。」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+25);}},
     {t:'❄️ 高冷路线：「我不吃甜的。你别乱花钱。」',tag:'-5好感 +心动值',aff:-5,fx:()=>{S.scum=Math.min(100,S.scum+30);}}]},
   {text:'"等下你要从后门走吗？我带你绕过伴娘团……真的。"',choices:[
     {t:'🤝 守护路线：「那说好了，你跟紧我。」',tag:'+20好感 结缘：糖糖跟随（移速+拾取）',aff:20,fx:()=>{recruit(2);}},
     {t:'😈 海王路线：「带我走？整条走廊的伴娘我都带走。」',tag:'+大量心动值 招来情敌',aff:-10,fx:()=>{S.scum=100;spawnJealous(2);}}]},
   {text:'"我把捧花拆了，编了条花绳……会不会太土了呀？"',choices:[
     {t:'🎀 暖心路线：「全场最漂亮的那条。」（当场系上）',tag:'+24好感 约会：回血+碎片',aff:24,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+S.maxHp*.3);for(let i=0;i<6;i++)mkOrb(player.position);}},
     {t:'🙃 毒舌路线：「确实有点土，不过配你。」',tag:'-8好感',aff:-8,fx:()=>{tip('🥺 她低下头把围巾藏到背后…');}}]},
   {text:'"等一下逃出去以后……我该怎么办呀？"',choices:[
     {t:'🏡 守护路线：「先找个地方住下，房本写你名字。」',tag:'+26好感 恋人达成（拾取+回血）',aff:26,fx:()=>{recruit(2);S.pickR*=1.6;S.regen+=1;}},
     {t:'🎈 自由路线：「人总要往前看的嘛。」',tag:'+45心动值',aff:-12,fx:()=>{S.scum=Math.min(100,S.scum+45);}}]},
   // —— 扩充剧情 5~8 ——
   {text:'"化妆间里都在说……你去过晚晴姐的房间。是真的吗？"',choices:[
     {t:'🤥 抵赖路线：「她们看错了，我一直在甜品台。」',tag:'+8好感 隐患累积',aff:8,fx:()=>{S.scum=Math.min(100,S.scum+30);}},
     {t:'🥺 示弱路线：「对不起，我……只是不忍心拒绝别人。」',tag:'+16好感 +回血',aff:16,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+45);}},
     {t:'😏 挑衅路线：「你管得着吗？」',tag:'-12好感 招来情敌',aff:-12,fx:()=>{spawnJealous(3);}}]},
   {text:'（她抱着一个保温桶）"我把汤藏在甜品台下面，从早上就炖着……你要不要喝一口？"',choices:[
     {t:'🍲 感动路线：（一口喝干）「再来三碗！」',tag:'+22好感 +回血',aff:22,fx:()=>{S.hp=S.maxHp;}},
     {t:'🕐 敷衍路线：「我赶时间，下次吧。」',tag:'-10好感',aff:-10,fx:()=>{tip('😔 保温桶还热着，人却走了。');}}]},
   {text:'"我拿到外地的工作了……可这婚礼还没散场。我该走吗？"（她期待地看着你）',choices:[
     {t:'🚄 追随路线：「那我也去。哪里有你哪里就是家。」',tag:'+26好感 恋人羁绊',aff:26,fx:()=>{recruit(2);S.regen+=1;S.spd*=1.08;}},
     {t:'📞 异地路线：「先各自努力，以后再会合。」',tag:'+12好感',aff:12,fx:()=>{gainXp(50);}},
     {t:'💔 甩手路线：「那就好好发展，别回头。」',tag:'-18好感 +心动值',aff:-18,fx:()=>{S.scum=Math.min(100,S.scum+45);tip('💧 她抱着保温桶，站了很久。');}}]},
   {text:'"满场的债主都说你是花心大萝卜……可我不信。你告诉我，我该信吗？"',choices:[
     {t:'🕊️ 从良路线：「这次是真的。我只想好好待你。」',tag:'+30好感 恋人圆满（全属性）',aff:30,fx:()=>{recruit(2);S.pickR*=1.4;S.regen+=1;S.hp=S.maxHp;}},
     {t:'🎭 双面路线：「信不信，看你自己的心。」',tag:'+60心动值 +伤害翻倍',aff:-4,fx:()=>{S.scum=100;S.dmgMul*=1.4;spawnJealous(4);}}]}]},
 {name:'冷艳学姐 · 夜冰',col:0x4cc9f0,hair:0x1a2430,ribbon:0x4cc9f0,face:'❄️',
  gift:['冰美式','旧账册','冻了三年的一封信'],
  trait:{n:'❄️ 冰账护读',d:'结缘后获得减伤；恋人必杀冻结并减速全场'},role:'记账人',
  stages:[
   {text:'（她合上那本旧账册，眼神像结了冰的湖面）"又是你。这些债，都是我替你记的。"',choices:[
     {t:'☕ 投喂路线：「那用一杯冰美式，换一页旧账。」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'😎 狂妄路线：「记得这么清楚，是因为放不下我吧。」',tag:'+心动值 +伤害提升',aff:4,fx:()=>{S.scum=Math.min(100,S.scum+35);S.dmgMul*=1.1;}}]},
   {text:'"你这种人我见得多了。说吧，这次想骗我什么？"',choices:[
     {t:'📖 真诚路线：「骗你什么？骗你陪我把账还到天亮。」',tag:'+20好感 结缘：学姐护读（冰甲减伤）',aff:20,fx:()=>{recruit(3);}},
     {t:'🎭 承认路线：「骗你的心，顺便骗个长期饭票。」',tag:'+大量心动值 招来情敌',aff:-10,fx:()=>{S.scum=100;spawnJealous(2);}}]},
   {text:'（她递来一张旧电影票）"三年前的场次，你没来。今晚补上——别误会，只是顺路。"',choices:[
     {t:'🎬 珍惜路线：「顺路也好，陪我补完三年前那一场。」',tag:'+24好感 约会：修为大涨',aff:24,fx:()=>{gainXp(60);S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'📱 敷衍路线：「补票？重看一眼不还是一样。」',tag:'-10好感',aff:-10,fx:()=>{tip('❄️ 她收回票，眼里的光也结了冰…');}}]},
   {text:'"我的名额，被你的谎言顶掉了。"（她第一次露出脆弱）',choices:[
     {t:'⚔️ 出头路线：「告诉我是谁。剩下的交给我。」',tag:'+28好感 恋人达成（减伤+伤害）',aff:28,fx:()=>{recruit(3);S.dmgMul*=1.25;S.armor+=8;}},
     {t:'🌊 冷漠路线：「成年人的世界，哪有公平。」',tag:'+50心动值 +巨额伤害',aff:-14,fx:()=>{S.scum=Math.min(100,S.scum+50);S.dmgMul*=1.25;}}]},
   // —— 扩充剧情 5~8 ——
   {text:'（她把一沓旧信推到你面前）"把这些谎话都对上，我就考虑原谅你。"',choices:[
     {t:'🧠 对账路线：（提笔三分钟全对上了）「好了，现在可以原谅我了吗？」',tag:'+22好感 +碎片',aff:22,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);}},
     {t:'😏 无赖路线：「账对不上，但撩你很在行。」',tag:'+16好感 +心动值',aff:16,fx:()=>{S.scum=Math.min(100,S.scum+30);}}]},
   {text:'"门外有人在喊你的名字——晚晴、苏曼，还有他们。我在等你的解释。"（冰面出现裂纹）',choices:[
     {t:'🕊️ 坦白路线：「都是真的。但只有你让我不想走。」',tag:'+18好感 裂缝弥合',aff:18,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+45);}},
     {t:'🤥 诡辩路线：「她们只是来还债的。」',tag:'+8好感 隐患累积',aff:8,fx:()=>{S.scum=Math.min(100,S.scum+35);}},
     {t:'💔 冷硬路线：「我的事，不用向你汇报。」',tag:'-14好感 招来情敌',aff:-14,fx:()=>{spawnJealous(3);}}]},
   {text:'"我申请了极北的研究站，三年。账我抄完了，人我要走了。"（她低着头）',choices:[
     {t:'❄️ 守望路线：「三年而已。冰在，我就在。」',tag:'+26好感 恋人羁绊',aff:26,fx:()=>{recruit(3);S.armor+=6;S.regen+=1;}},
     {t:'🚄 追随路线：「北方的雪，我陪你看三年。」',tag:'+24好感',aff:24,fx:()=>{gainXp(70);S.hp=S.maxHp;}},
     {t:'💔 放手路线：「祝前程似锦，后会无期。」',tag:'-18好感 +心动值',aff:-18,fx:()=>{S.scum=Math.min(100,S.scum+45);tip('🥶 她说"好"，书页被风撕了一角。');}}]},
   {text:'（雪落满肩，她把旧账的最后一页撕下来）"大家都说你花心。可我冻了这么多年……只有你融得进来。"',choices:[
     {t:'💍 融冰路线：「那从今天起，你的冬天由我负责。」',tag:'+30好感 恋人圆满（全属性）',aff:30,fx:()=>{recruit(3);S.armor+=8;S.dmgMul*=1.2;S.pickR*=1.2;}},
     {t:'🌪️ 寒冬路线：「融化的冰，才最好骗。」',tag:'+60心动值 +伤害翻倍',aff:-6,fx:()=>{S.scum=100;S.dmgMul*=1.4;spawnJealous(5);}}]}]},
// —— v65：女主扩编 4 位（g5~g8：校医/总裁/网球学妹/古风文艺） ——
 {name:'校医 · 白甜甜',col:0xffb3c6,hair:0x2a1a30,ribbon:0xffe0ea,face:'💉',
  gift:['海盐糖','加厚绷带','热可可'],
  trait:{n:'💉 随船急诊',d:'结缘后持续回血；恋人必杀回满并叠加减伤'},role:'随船医师',
  stages:[
   {text:'（她把冰凉的听诊器按在你胸口，像贴在浪上）"又带着伤回来？这是第几次替别人挨了。"',choices:[
     {t:'🩹 撒娇路线：「那医生要多照顾我一点呀。」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+40);}},
     {t:'😏 得寸进尺路线：「光治疗可不够，要负责到底。」',tag:'+心动值',aff:-4,fx:()=>{S.scum=Math.min(100,S.scum+30);spawnJealous(2);}}]},
   {text:'"王座下只有这一间诊所。汤我分了两碗——也给别的伤号盛了一碗。"（她偷偷看你喝哪碗）',choices:[
     {t:'💝 专一路线：「我只喝你亲手盛的这碗。」',tag:'+20好感 结缘（持续回血）',aff:20,fx:()=>{recruit(4);}},
     {t:'🍵 直男路线：「哪碗都一样吧。」',tag:'-10好感',aff:-10,fx:()=>{tip(' :( 她默默端走了两碗汤…');}}]},
   {text:'"潮水会一直涨到王座台阶。灯还亮着，你知道我在等谁吗？"',choices:[
     {t:'🌙 心动路线：「等一个会为你关灯的人。」',tag:'+26好感 恋人达成（回血强化）',aff:26,fx:()=>{recruit(4);S.regen+=2;}}]}]},
 {name:'总裁 · 顾清梨',col:0xc9a86a,hair:0x1a1420,ribbon:0xe8c98a,face:'📋',
  gift:['手冲咖啡','冰原供需清单','钢笔'],
  trait:{n:'📋 供需核算',d:'结缘后收益加成；恋人必杀高伤并撒落碎片'},role:'供需核算师',
  stages:[
   {text:'（她合上冰原的供需清单，抬起眼）"上个月的账，和你昨晚的谎言，先解释哪个？"',choices:[
     {t:'📋 干练路线：「都不是问题，问题是您想听哪个版本。」',tag:'+12好感',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'😅 支吾路线：「那个……冰原上的账，说不清的。」',tag:'-8好感',aff:-8,fx:()=>{tip('📝 她在备忘录上记了一笔…');}}]},
   {text:'"我的时间按分钟计价。但这片永夜——我破例给了你整个下午。"',choices:[
     {t:'⏳ 珍惜路线：「那我把一整颗心都排进日程。」',tag:'+20好感 结缘（金币加成）',aff:20,fx:()=>{recruit(5);}},
     {t:'🤑 贪心路线：「那顺便把这次押运的钱结一下？」',tag:'+心动值',aff:-6,fx:()=>{S.scum=Math.min(100,S.scum+35);}}]},
   {text:'"董事会问我，为什么在极夜冰原上陪一个花心的男人守夜。"（她笑了）',choices:[
     {t:'👑 共谋路线：「因为他们不知道，您守夜的时候有多迷人。」',tag:'+28好感 恋人达成（暴击提升）',aff:28,fx:()=>{recruit(5);S.dmgMul*=1.2;}}]}]},
 {name:'学妹 · 陈飞飞',col:0x8fd3ff,hair:0x3a2418,ribbon:0xffffff,face:'🎾',
  gift:['冰镇汽水','球拍握把胶','伴娘捧花'],
  trait:{n:'🎾 应援节奏',d:'结缘后攻速与移速提升；恋人必杀魅惑全场并重置冲刺'},role:'伴娘',
  stages:[
   {text:'（她把球拍甩上肩，堵在喜宴门口）"学姐们说你很能跑？今天这场婚礼，我看你能跑到哪去！"',choices:[
     {t:'⚡ 应战路线：「比就比，输的人答应对方一件事。」',tag:'+12好感 +移速',aff:12,fx:()=>{S.spd*=1.08;}},
     {t:'🤺 逗她路线：「我输了，你就得请我喝汽水。」',tag:'+10好感',aff:10,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+20);}}]},
   {text:'"我从小到大没输过……直到撞见你这只不肯上台的新郎。"',choices:[
     {t:'🤝 拉拢路线：「那组队吧，双打冠军＋逃婚冠军。」',tag:'+20好感 结缘（攻速提升）',aff:20,fx:()=>{recruit(6);}},
     {t:'😌 凡尔赛路线：「习惯就好，我从来不上台。」',tag:'+心动值',aff:-6,fx:()=>{S.scum=Math.min(100,S.scum+28);}}]},
   {text:'（她红着脸递上一瓶水）"喏，加量的。别、别多想！"',choices:[
     {t:'💗 心动路线：「想了。从你甩台本那天就开始了。」',tag:'+28好感 恋人达成（移速+回血）',aff:28,fx:()=>{recruit(6);S.spd*=1.15;S.regen+=1;}}]}]},
 {name:'文艺 · 温砚秋',col:0xb8a9e8,hair:0x14101e,ribbon:0xd8ccff,face:'🪭',
  gift:['诗集','桂花酿','银杏书签'],
  trait:{n:'🖋️ 落笔定局',d:'结缘后经验加成；恋人必杀墨色冻结并猛涨修为'},role:'证婚人',
  stages:[
   {text:'（她摇着纸扇坐在记名簿后）"他们说你是花心大少。这场婚宴的宾客名单，我倒想亲自核一核。"',choices:[
     {t:'🖌️ 风雅路线：「名单如墨，您是宣纸，一试便知。」',tag:'+12好感',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
     {t:'🎭 坦荡路线：「花心是真的，但对你可以例外。」',tag:'+心动值 +好感',aff:4,fx:()=>{S.scum=Math.min(100,S.scum+20);}}]},
   {text:'"我在喜帖背面写了半阕词，写你的部分——始终不敢落笔。"',choices:[
     {t:'📖 接笔路线：「那我替你写完：『愿逐月华流照君』。」',tag:'+20好感 结缘（经验加成）',aff:20,fx:()=>{recruit(7);}},
     {t:'🖊️ 狂草路线：「别写了，词牌名我都想好了——《心动狂》。」',tag:'+大量心动值',aff:-8,fx:()=>{S.scum=Math.min(100,S.scum+45);}}]},
   {text:'"若我随你逃出这场婚宴……你可会护我这支笔？"',choices:[
     {t:'🖋️ 誓约路线：「笔在人在，砚秋所至，皆是坦途。」',tag:'+28好感 恋人达成（经验+碎片）',aff:28,fx:()=>{recruit(7);}}]}]},
];

// —— v74：角色差异化加深 ——
// 后 4 位女主（甜甜 / 清梨 / 飞飞 / 砚秋）剧情线由 3 段补齐到 8 段，与前 4 位同级深度；
// 每条分支都锚定她们各自的章节世界（第五章·深海王座 / 第六章·极夜冰原 / 第七章·婚宴修罗场）
// 与身份（随船医师 / 供需核算师 / 伴娘 / 证婚人），让角色不再只剩名字与配色不同。
const NPC_EXTRA_V74=[
 [4,[
  {text:'（舱底进了水，她一边扎绷带一边数着伤员）"止血带只够三个人用。你先说——救谁？"',choices:[
    {t:'🩹 分诊路线：「先救还能打的，剩下的我背出去。」',tag:'+18好感 +回血',aff:18,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+50);}},
    {t:'⚖️ 公平路线：「你是医师，你定顺序，我照做。」',tag:'+12好感 +碎片',aff:12,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);}},
    {t:'😏 私心路线：「先治我，别人排后面。」',tag:'-10好感 +心动值',aff:-10,fx:()=>{S.scum=Math.min(100,S.scum+30);tip('💉 她看了你一眼，什么也没说。');}}]},
  {text:'（她拎着一串钥匙站在锁着的药柜前）"王座底下的药都在这儿。要开柜，先回答我一个问题。"',choices:[
    {t:'🔑 直言路线：「问吧。我没什么不能说的。」',tag:'+20好感 结缘（持续回血）',aff:20,fx:()=>{recruit(4);S.regen+=1;}},
    {t:'🗝️ 交易路线：「钥匙给我，我陪你守一整夜。」',tag:'+14好感 +心动值',aff:14,fx:()=>{S.scum=Math.min(100,S.scum+30);}}]},
  {text:'（她摊开两粒药，一粒白，一粒蓝）"白的止痛，蓝的会让你忘了今天。你选。"',choices:[
    {t:'💊 忍痛路线：（吞下白色的）「疼也要记得你。」',tag:'+26好感 恋人达成（回血强化）',aff:26,fx:()=>{recruit(4);S.regen+=1;S.hp=S.maxHp;}},
    {t:'🌀 逃避路线：（拿起蓝色的）「忘了更轻松。」',tag:'-16好感 +心动值',aff:-16,fx:()=>{S.scum=Math.min(100,S.scum+45);tip('💉 她把蓝色那粒收回药瓶，瓶子晃了一下。');}}]},
  {text:'"潮水退了，我要去岸上开一间诊所。船上这些人……你替我看完，好不好？"',choices:[
    {t:'🏥 随行路线：「诊所开在我打得到的地方，我就去。」',tag:'+26好感 恋人羁绊（回血+拾取）',aff:26,fx:()=>{recruit(4);S.regen+=1;S.pickR*=1.2;}},
    {t:'⚓ 留守路线：「船不能没人。你留下，我做船员。」',tag:'+18好感 +回血',aff:18,fx:()=>{S.hp=S.maxHp;}},
    {t:'🌊 放行路线：「去吧，医生不该只守一条船。」',tag:'-10好感 +修为',aff:-10,fx:()=>{gainXp(60);}}]},
  {text:'"全船的伤号都喊我甜甜医生。可我只想给一个人留最后一针——你知道是谁。"',choices:[
    {t:'💍 唯一路线：「留着吧。以后只准给我打。」',tag:'+30好感 恋人圆满（全属性）',aff:30,fx:()=>{recruit(4);S.regen+=1;S.dmgMul*=1.15;}},
    {t:'🌪️ 客人路线：「医生对谁都一样，才专业。」',tag:'+55心动值 +伤害提升',aff:-8,fx:()=>{S.scum=100;S.dmgMul*=1.3;spawnJealous(3);}}]}
 ]],
 [5,[
  {text:'（她把冰原补给表推到你面前）"燃料只够撑到天亮。给队伍，还是给我那台制热机？"',choices:[
    {t:'🧮 核算路线：「按人头算。制热机归你。」',tag:'+20好感 结缘（收益加成）',aff:20,fx:()=>{recruit(5);gainXp(60);}},
    {t:'🔥 全给路线：「全给队伍。你冷就靠着我。」',tag:'+24好感 +回血',aff:24,fx:()=>{S.hp=S.maxHp;}},
    {t:'📉 止损路线：「烧了制热机，反正你撑得住。」',tag:'-12好感',aff:-12,fx:()=>{tip('📋 她在清单上划掉一行，动作很轻。');}}]},
  {text:'"极夜第七天，董事会发了最后通牒——要我押你回去结账。你的意思呢？"',choices:[
    {t:'🤝 结盟路线：「那就一起把账本撕了。」',tag:'+26好感 恋人达成（暴击提升）',aff:26,fx:()=>{recruit(5);S.dmgMul*=1.15;}},
    {t:'📊 服从路线：「按合同办，我不怪你。」',tag:'+14好感 +修为',aff:14,fx:()=>{gainXp(50);}},
    {t:'🚪 撇清路线：「你交你的差，我跑我的路。」',tag:'-14好感 +心动值',aff:-14,fx:()=>{S.scum=Math.min(100,S.scum+40);}}]},
  {text:'（她把钢笔按进你掌心）"签了这份，你就是我的。签不签？"',choices:[
    {t:'✍️ 落笔路线：「条款不用看。」',tag:'+30好感 恋人圆满（暴击+回血）',aff:30,fx:()=>{recruit(5);S.dmgMul*=1.2;S.regen+=1;}},
    {t:'🖋️ 反签路线：（把笔递回去）「该你签一辈子。」',tag:'+22好感 +心动值',aff:22,fx:()=>{S.scum=Math.min(100,S.scum+25);}}]},
  {text:'"董事会加了三成利息。我算过——动我的股份就能压下去。你希望我压吗？"',choices:[
    {t:'🏛️ 担纲路线：「别动股份。这债我自己还。」',tag:'+26好感 恋人羁绊（减伤）',aff:26,fx:()=>{recruit(5);S.armor+=6;}},
    {t:'📈 划算路线：「压吧。你亏的，我以后补给你。」',tag:'+16好感 +碎片',aff:16,fx:()=>{for(let i=0;i<8;i++)mkOrb(player.position);}},
    {t:'🧊 旁观路线：「生意归生意，你说了算。」',tag:'-12好感 +心动值',aff:-12,fx:()=>{S.scum=Math.min(100,S.scum+35);}}]},
  {text:'"冰原的最后一个下午，我把日程空出来了——你要拿它做什么？"',choices:[
    {t:'☕ 独处路线：「什么都不做。就坐着看你。」',tag:'+30好感 恋人圆满（全属性）',aff:30,fx:()=>{recruit(5);S.dmgMul*=1.15;S.regen+=1;}},
    {t:'💼 谈单路线：「谈一单，让整条街都挂你的招牌。」',tag:'+18好感 +收益',aff:18,fx:()=>{gainXp(70);S.scum=Math.min(100,S.scum+20);}}]}
 ]],
 [6,[
  {text:'（她把球拍横在喜宴长廊当路障）"伴娘团把出口堵死了。跑，还是打？我陪你。"',choices:[
    {t:'🏃 突围路线：「跑。你断后，我开路。」',tag:'+20好感 结缘（攻速提升）',aff:20,fx:()=>{recruit(6);S.spd*=1.08;}},
    {t:'🎾 应战路线：「打。让她们见识下球技。」',tag:'+24好感 +伤害',aff:24,fx:()=>{S.dmgMul*=1.1;spawnJealous(2);}}]},
  {text:'"学姐们说今天你必须上台。我倒觉得——你下不来台的样子更帅。"',choices:[
    {t:'😌 顺毛路线：「那就只让你一个人看。」',tag:'+26好感 恋人达成（移速）',aff:26,fx:()=>{recruit(6);S.spd*=1.1;}},
    {t:'🎤 上台路线：「行，我上台。掌声归你。」',tag:'+16好感 +心动值',aff:16,fx:()=>{S.scum=Math.min(100,S.scum+35);}}]},
  {text:'（她把伴娘捧花塞进你手里）"接着。这场婚礼的新娘是谁，你说了算。"',choices:[
    {t:'💍 换人路线：「捧花该在新娘手里。走，我们换个人结婚。」',tag:'+30好感 恋人圆满（移速+回血）',aff:30,fx:()=>{recruit(6);S.spd*=1.12;S.regen+=1;}},
    {t:'🤾 抛回路线：（把捧花抛向人群）「谁抢到算谁的。」',tag:'-14好感 +心动值',aff:-14,fx:()=>{S.scum=Math.min(100,S.scum+40);}}]},
  {text:'"陪我打一场。输的人要答应对方一件事——这个赌注，你敢不敢接？"',choices:[
    {t:'🏆 应赌路线：「接。我输了就留下来陪你打一整个夏天。」',tag:'+26好感 恋人羁绊（攻速+移速）',aff:26,fx:()=>{recruit(6);S.spd*=1.1;S.dmgMul*=1.1;}},
    {t:'🤝 平局路线：「打成平局吧，谁也不欠谁。」',tag:'+12好感 +回血',aff:12,fx:()=>{S.hp=Math.min(S.maxHp,S.hp+30);}},
    {t:'🙃 让球路线：「我故意输，你是不是更开心？」',tag:'-8好感 +心动值',aff:-8,fx:()=>{S.scum=Math.min(100,S.scum+25);}}]},
  {text:'（终场哨响，她抱着球拍站在灯下）"散场了。你还会来找我打球吗？"',choices:[
    {t:'🌙 约定路线：「明天。明天后天，每一天。」',tag:'+30好感 恋人圆满（移速+回血）',aff:30,fx:()=>{recruit(6);S.spd*=1.12;S.regen+=1;S.hp=S.maxHp;}},
    {t:'📅 随口路线：「有空就来。」',tag:'-16好感 +心动值',aff:-16,fx:()=>{S.scum=Math.min(100,S.scum+45);tip('🎾 她把球拍又甩上肩，笑得比刚才用力。');}}]}
 ]],
 [7,[
  {text:'（她提笔停在婚书的新郎一栏）"这里要写名字。你打算写谁的？"',choices:[
    {t:'🖌️ 留白路线：「空着。这场婚，不该有新郎。」',tag:'+20好感 结缘（经验加成）',aff:20,fx:()=>{recruit(7);gainXp(60);}},
    {t:'🎭 玩笑路线：「写你的名字——反正你也没写完。」',tag:'+14好感 +心动值',aff:14,fx:()=>{S.scum=Math.min(100,S.scum+30);}}]},
  {text:'"宾客名单上有你八个名字。我一笔一笔核过了——七个是假的，一个是真的。"',choices:[
    {t:'🕊️ 承认路线：「那一个是真的。你猜是谁。」',tag:'+26好感 恋人达成（经验+碎片）',aff:26,fx:()=>{recruit(7);for(let i=0;i<8;i++)mkOrb(player.position);}},
    {t:'🃏 耍赖路线：「八个都是真的，你也算一个。」',tag:'+18好感 +心动值',aff:18,fx:()=>{S.scum=Math.min(100,S.scum+35);}}]},
  {text:'（雪落在砚台上，她蘸了墨）"最后一句留给你。写了，就是定局。"',choices:[
    {t:'📜 定局路线：「写：砚秋与郎君，此后共砚。」',tag:'+30好感 恋人圆满（经验+碎片）',aff:30,fx:()=>{recruit(7);gainXp(70);}},
    {t:'🔥 焚稿路线：（折起婚书）「不写。这场宴，我们自己散。」',tag:'-6好感 +巨额伤害',aff:-6,fx:()=>{S.scum=100;S.dmgMul*=1.3;}}]},
  {text:'"词写了半阕，落款一直空着。你说——该盖哪一枚章？"',choices:[
    {t:'🔖 联名路线：「两枚并排。你的在前。」',tag:'+26好感 恋人羁绊（经验+回血）',aff:26,fx:()=>{recruit(7);gainXp(60);S.hp=Math.min(S.maxHp,S.hp+40);}},
    {t:'🖊️ 独署路线：「盖你的。这是你的词。」',tag:'+16好感 +修为',aff:16,fx:()=>{gainXp(60);}},
    {t:'🗑️ 撤稿路线：「撕了吧，留着不好看。」',tag:'-14好感 +心动值',aff:-14,fx:()=>{S.scum=Math.min(100,S.scum+40);}}]},
  {text:'（她合上纸扇，挡在喜宴的鞭炮声前）"散场以后，我只有这一支笔了。你要吗？"',choices:[
    {t:'🖋️ 接笔路线：「要。笔在人在，往后我替你研墨。」',tag:'+30好感 恋人圆满（经验+碎片）',aff:30,fx:()=>{recruit(7);gainXp(70);for(let i=0;i<8;i++)mkOrb(player.position);}},
    {t:'🎋 收扇路线：「笔留着。人跟我就行。」',tag:'+20好感 +心动值',aff:20,fx:()=>{S.scum=Math.min(100,S.scum+25);}}]}
 ]],
];
for(const _v74e of NPC_EXTRA_V74){const _v74d=NPC_DEFS[_v74e[0]];if(_v74d)_v74d.stages=_v74d.stages.concat(_v74e[1]);}
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
   .map(x=>`<div class="aff">${porTag(x.i,34)}<span class="affBar"><div style="width:${x.v}%"></div></span>`+
     `<span class="h">${affLevel(x.v)}</span>`+
     `<span style="color:#9ad0ff;font-size:11px;margin-left:6px">${x.d.role||''}</span>`+
     `<span style="color:#c9a7eb;font-size:11px;margin-left:6px">${(x.d&&x.d.trait&&x.d.trait.n)||''}</span></div>`).join('');}
function spawnJealous(n){n=Math.min(n,enemyBudget());for(let i=0;i<n;i++)mkEnemy('chaser');
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
// v67：面部贴面图集列数 = 8 位女主（列 0-7）+ 男主（列 8），shader 与索引校验共用此常量
const FACE_CARD_COLS=9;
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
  vec2 uv=vec2((uIdx+clamp(vUv2.x,0.0,1.0))*(1.0/${FACE_CARD_COLS}.0), vUv2.y);
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
  // v67：显式钳制采样 —— 防止索引越界时取到相邻格（ClampToEdge 是 three 默认值，此处写明）
  t.wrapS=THREE.ClampToEdgeWrapping;t.wrapT=THREE.ClampToEdgeWrapping;
  FACE_CARD=t;return t;}
const _faceCardMats={};
function faceCardMat(idx){
  if(!(idx>=0&&idx<FACE_CARD_COLS))return null;
  initFaceCard();
  if(!FACE_CARD)return null;
  if(_faceCardMats[idx])return _faceCardMats[idx];
  const m=new THREE.ShaderMaterial({uniforms:{uAtlas:{value:FACE_CARD},uIdx:{value:idx},uPow:{value:1}},
    vertexShader:FACE_CARD_VERT,fragmentShader:FACE_CARD_FRAG,
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  _faceCardMats[idx]=m;return m;}
// v70b 补回：v69c 误删的真人头「发色表/发丝纹理缓存」声明（buildRealHead/hairTopTex 依赖）
const HEAD_HAIR_COL=[0x6d534b,0x2d262f,0xc67b32,0x344351,0x1c1719]; // 由立绘顶部区域采样得出
const _hairTexCache={};
// 沿头壳轮廓生成贴面网格（faceSurface 保证贴合，不悬浮不陷入）
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
  vec2 uv=vec2((uIdx+vUv2.x)*(1.0/${FACE_CARD_COLS}.0), vUv2.y);
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
  // v67：索引必须落在图集列范围内，否则退化为纯色头壳（不再取到错误的第 5 格）
  if(!(idx>=0&&idx<FACE_CARD_COLS))return null;
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
  // v63/v64：女主整体替换为全身数字人（8 位女主 g1~g8，DH2_API 免 TDZ）
  if(typeof DH2_API!=='undefined'&&DH2_API.ready()){
    DH2_API.attach(g,'g'+(idx+1),1.62);
  }
  return{g,j,face:j.face};}
// v60：男主整颗头也换成真人头（v67：图集第 9 格 idx=8，前 8 格为女主）。
// FACE_CARD_B64 注入点在后续 script 块（跨块时序），此处轮询重试直到图集可用。
(function(){let n=0;(function tryMount(){
  try{
    if(typeof attachRealHead==='function'&&typeof heroFig!=='undefined'&&heroFig&&heroFig.j&&!heroFig.j.realHead){
      attachRealHead(heroFig.j,8,{skin:0xffdcbc,long:false});
      return;}
  }catch(e){}
  if(++n<40)setTimeout(tryMount,300);})();})();
// 邂逅改为循环事件：每30秒随机一位女主出现（好感越高冷却越短）
let npcCd=[30,36,42,48,34,40,36,44];
let npcTimer=14;
function trySpawnNpc(){if(npcs.length||dlgActive)return;
  // 已结缘（恋人未满）的女主仍可约会升温
  // v68 主线绑定出场：当前章对应的女主任何时候都在候选池里（不受冷却限制），
  // 让「每章主线都有一位女主角」成为可预期的节奏，而不是全靠随机邂逅。
  const pref=(chapter>=CHAPTERS.length-1)?[NPC_DEFS.length-2,NPC_DEFS.length-1]:[chapter];
  const pool=NPC_DEFS.map((_,i)=>i).filter(i=>pref.indexOf(i)>=0||npcCd[i]<=0);
  if(!pool.length)return;
  const idx=pool[Math.floor(Math.random()*pool.length)];
  spawnNpc(idx);npcCd[idx]=affinity[idx]>=60?18:30;}
function spawnNpc(idx){
  // 清掉同一位残留的NPC，避免堆积
  for(let i=npcs.length-1;i>=0;i--)if(npcs[i].userData.idx===idx){scene.remove(npcs[i]);dh2ReleaseHost(npcs[i]);npcs.splice(i,1);}
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
  tip(`💕 结缘成功！${def.name} 并肩作战！（特质：${(def.trait&&def.trait.n)||'专属羁绊'}）`);sfx.evo();
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
  mates.map(i=>`<div class="mate" data-i="${i}">${porTag(i,50,'',`border-radius:50%;border-width:2px;`)}</div>`).join('');}
function mateAtkFx(idx){const el=document.querySelector(`#mates .mate[data-i="${idx}"]`);
  if(!el)return;el.classList.remove('atk');void el.offsetWidth;el.classList.add('atk');}
// 对话（含好感度结算）
let dlgActive=false,dialogueSpeaker=null;

// ============ v46 · 情感剧情深化：抉择痕迹系统 ============
// 设计目标：此前 8 段剧情 × 每段 2-3 选项，选完就消失，玩家感受不到「我做过选择」。
// v46 给每个选项打上**倾向标签**，选完后累积成三种人格倾向，并在后续剧情中**可见地生效**：
//   · 真心（sincere）—— 选坦白/成全/守候 → 提高恋人质量、降低情敌
//   · 浪子术（player）—— 选撒满/摊牌/纵欲 → 提高伤害与心动值、增加情敌
//   · 圆滑（slick）  —— 选圆谎/逃避/敷衍 → 提高收益（碎片/心币）但埋下隐患
// 倾向不只是数字，还会：① 改变结局文案；② 解锁专属结局称号；③ 影响 NPC 说话的语气。
const ALIGN_DEF={
  sincere:{n:'真心',ic:'🕊️',col:'#7fd4ff',d:'她记得你说过的每一句话'},
  player: {n:'浪子术',ic:'😈',col:'#ff4d6d',d:'你记得自己说过的每一句谎'},
  slick:  {n:'圆滑',ic:'🎭',col:'#c77dff',d:'谁都没记住，除了你自己'},
};
function alignOf(){return (SAVE.align=SAVE.align||{sincere:0,player:0,slick:0});}
function alignAdd(k,v){
  const a=alignOf();if(!a[k])a[k]=0;
  a[k]=(a[k]||0)+v;writeSave();}
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
// 倾向推断：按选项文案里的关键词判定（无需改动 30+ 条既有剧情数据）
// 优先级：先判浪子术（最强否定词），再判真心（承诺词），最后兜底圆滑（回避词）
const _ALIGN_KW={
  player:['心动值','摊牌','腹黑','撒死','撒谎','敷衍','冷酷','放手','修罗','纵欲','占有','海王','双开'],
  sincere:['坦白','真诚','成全','守候','温柔','一生','发誓','只有你','一起','真心','圆谎'],
  slick:['圆滑','逃避','回避','再说','半信','打听','打听','情报'],
};
function alignOfChoice(text){
  const t=String(text||'');
  // 浪子术：明确带「心动值」或强负面词
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
const NPC_PORTRAITS=["data:image/jpeg;base64,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","data:image/jpeg;base64,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","data:image/jpeg;base64,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","data:image/jpeg;base64,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","data:image/jpeg;base64,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","data:image/jpeg;base64,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","data:image/jpeg;base64,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","data:image/jpeg;base64,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"];
/* v67:AI 面部贴面图集（9 联：8 位女主 idx0-7 + 男主 idx8，羽化由 shader 做）
   列 0-3 沿用 v59 原格；列 4-7 由对应立绘 NPC_PORTRAITS[4..7] 裁切（与 0-3 同款取景）；列 8 沿用原男主格 */
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
  // v66：层级改为「身体中轴(bodyG) → 髋线(pitchG) → 躯干」，左右腿直接挂 bodyG。
  // 修正此前三件贴片各自绕不同枢轴旋转（腿绕各自髋轴、躯干绕自身中心）造成的
  // 水平/纵深错位——表现为左大腿根与臀部之间露出空白缝。
  const bodyG=new THREE.Group(); g.add(bodyG);
  const hipY=H-tH;
  // v66.1：躯干底沿相对髋线再向下覆盖 OV —— 贴片在非零 yaw 下有 ±0.002 的 z 偏移，
  // 投影后仍会留下不到 1px 的亚像素缝；用一小段重叠彻底封死，且不影响总高（上沿仍在 H）。
  const OV=0.012;
  const pitchG=new THREE.Group(); pitchG.position.y=hipY; bodyG.add(pitchG);
  const torso=new THREE.Mesh(new THREE.PlaneGeometry(tW,tH+OV),mkMat('t'));
  torso.geometry.translate(0,tH-(tH+OV)/2,0);   // v66.1 原点仍在髋线：上沿对齐头顶、底沿再向下探 OV 盖住亚像素髋缝
  torso.position.y=0;
  torso.userData.noOutline=true;torso.userData.dh2=true;torso.renderOrder=4;
  torso.frustumCulled=false;
  pitchG.add(torso);
  // 左右腿（pivot 在髋部切线，geometry 平移使旋转绕髋）
  let legL=null,legR=null;
  if(!d.ns&&yc>0){
    const legH=H*(1-yc), legW=W/2;
    legL=new THREE.Mesh(new THREE.PlaneGeometry(legW,legH),mkMat('l'));
    legL.geometry.translate(0,-legH/2,0);
    legL.position.set(-legW/2,hipY,0.002);
    legR=new THREE.Mesh(new THREE.PlaneGeometry(legW,legH),mkMat('r'));
    legR.geometry.translate(0,-legH/2,0);
    legR.position.set(legW/2,hipY,0.002);
    legL.userData.noOutline=true;legL.userData.dh2=true;legL.renderOrder=3;legL.frustumCulled=false;
    legR.userData.noOutline=true;legR.userData.dh2=true;legR.renderOrder=3;legR.frustumCulled=false;
    bodyG.add(legL);bodyG.add(legR);
  }
  const sh=blobShadow(Math.max(.65,W*.42));
  g.add(sh);
  const inst={g,bodyG,pitchG,torso,legL,legR,H,W,id,phase:Math.random()*7,spd:7,lastPos:new THREE.Vector3(),moving:false,baseY:0};
  DH2_HUMANS.push(inst);
  return inst;}

// v75：数字人实例与其自建资源的回收（清场/实体阵亡时调用）
//   · 只释放"已不被场景中任何对象引用"的几何与材质；dh2Tex 的共享贴图不受影响
function dh2LiveSet(){const s=new Set();
  scene.traverse(o=>{if(o.geometry)s.add(o.geometry);
    if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m)s.add(m);});});
  return s;}
const TEX_KEYS=['map','alphaMap','normalMap','emissiveMap','roughnessMap','metalnessMap','specularMap','bumpMap','aoMap','lightMap','envMap','displacementMap'];
function dh2LiveTexSet(){const s=new Set();
  scene.traverse(o=>{const m=o.material;if(!m)return;
    (Array.isArray(m)?m:[m]).forEach(x=>{if(!x)return;
      for(const k of TEX_KEYS){if(x[k])s.add(x[k]);}});});
  return s;}
function dh2DisposeTex(mat,liveT){if(!mat||!liveT)return 0;let n=0;
  for(const k of TEX_KEYS){const t=mat[k];
    if(t&&liveT&&!liveT.has(t)&&t.dispose){t.dispose();n++;}}
  return n;}
function dh2DisposeOrphan(rootG,live,geoOnly,liveT){
  if(!rootG||!rootG.traverse||!live)return 0;let n=0;
  rootG.traverse(o=>{if(o.geometry&&!live.has(o.geometry)&&o.geometry.dispose){o.geometry.dispose();n++;}
    if(!geoOnly&&o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(m&&!live.has(m)){n+=dh2DisposeTex(m,liveT);if(m.dispose)m.dispose();}});});
  return n;}
function dh2Release(inst){
  if(!inst)return 0;let n=0;
  for(const arr of[DH2_HUMANS,DH_HUMANS]){let i=arr.indexOf(inst);
    while(i>=0){arr.splice(i,1);n++;i=arr.indexOf(inst);}}
  const g=inst.g;if(g&&g.parent)g.parent.remove(g);
  dh2DisposeOrphan(g,dh2LiveSet(),false,dh2LiveTexSet());
  inst.g=null;inst.torso=null;inst.bodyG=null;inst.pitchG=null;inst.legL=null;inst.legR=null;
  return n;}
function dh2ReleaseHost(hostG){
  try{if(!hostG||!hostG.userData)return 0;
    const inst=hostG.userData.dh2Inst;hostG.userData.dh2Inst=null;
    let n=inst?dh2Release(inst):0;
    if(hostG.parent)hostG.parent.remove(hostG);
    n+=dh2DisposeOrphan(hostG,dh2LiveSet(),false,dh2LiveTexSet());
    return n;}catch(e){return 0;}}


const _dh2v=new THREE.Vector3(),_dh2q=new THREE.Quaternion(),_dh2e=new THREE.Euler();
function dh2Tick(dt){
  if(!DH2_HUMANS.length)return;
  for(const h of DH2_HUMANS){
    if(!h||!h.torso)continue;
    // 移动检测（上一帧位置差）→ 行走摆腿 / 静止站立
    h.g.getWorldPosition(_dh2v);
    const moved=_dh2v.distanceTo(h.lastPos);
    h.moving=moved>0.0005;
    h.lastPos.copy(_dh2v);
    if(h.legL){
      if(h.moving){h.phase+=dt*(h.spd||7);
        const sw=Math.sin(h.phase)*.42;
        h.legL.rotation.x=sw;h.legR.rotation.x=-sw;            // 摆腿仍绕各自髋轴：大腿顶沿始终贴在髋线上
        h.bodyG.position.y=Math.abs(Math.sin(h.phase))*.03;     // v66：起伏改为整体抬升（只抬躯干会拉开髋缝）
        h.pitchG.rotation.x=.05;                                // v66：上身俯仰绕髋线，躯干底沿原地不动
      }else{
        h.legL.rotation.x*=.8;h.legR.rotation.x*=.8;
        h.bodyG.position.y*=.8;
        h.pitchG.rotation.x*=.8;
      }
      h.torso.scale.y=1+Math.sin(h.phase*.4)*.006;  // 呼吸（原点在底沿，向上生长，不拉缝）
    }
    // billboard：面向相机（抵消父级 yaw）
    h.g.getWorldQuaternion(_dh2q);
    _dh2e.setFromQuaternion(_dh2q,'YXZ');
    const yaw=Math.atan2(camera.position.x-_dh2v.x,camera.position.z-_dh2v.z)-_dh2e.y;
    h.bodyG.rotation.y=yaw;   // v66：躯干与双腿统一绕身体中轴旋转，三件贴片不再错位
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
  const s=sz||34;
  const st=`width:${s}px;height:${s}px;border-radius:${Math.round(s*.30)}px;object-fit:cover;object-position:50% 12%;`+
    `border:1.5px solid rgba(255,214,10,.75);box-shadow:0 0 8px rgba(247,37,133,.45);vertical-align:middle;flex:0 0 auto;`+
    (ext||'');
  if(!p)return `<span class="${cls||''}" style="${st}display:inline-flex;align-items:center;justify-content:center;
    background:rgba(60,20,70,.9);font-size:${Math.round(s*.55)}px">${NPC_DEFS[idx].face}</span>`;
  return `<img class="${cls||''}" src="${p}" style="${st}" alt="">`;
}
function drawFace(idx,stage){
  const cv=document.getElementById('dlgFace');if(!cv)return;
  const g=cv.getContext('2d');const S2=200;const m=FACE_MOODS[stage%FACE_MOODS.length];
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
    `${porTag(idx,32,'',`margin-right:6px;`)}${def.name}${def.role?(' <span style="color:#9ad0ff;font-size:11px">'+def.role+'</span>'):''} <span style="color:#9d4edd;font-size:12px">好感 ${affinity[idx]}/100 · ${affLevel(affinity[idx])}</span>`;
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
      scene.remove(npc);dh2ReleaseHost(npc);npcs.splice(npcs.indexOf(npc),1);
      // 高好感角色下次邂逅缩短冷却
      npcCd[idx]=affinity[idx]>=60?18:30;};
    box.appendChild(b);});
  document.getElementById('dlg').style.display='flex';}
// ---------- 约会场景演出（v22：好感爆满触发的一段小剧场） ----------
const DATE_SCENES=[
  {id:0,n:'校园樱花道 · 树下',ic:'🌸',sky:0xffc2d1,petal:0xff8fa3,line:'她靠在你肩头，樱花落满两个人的校服。'},
  {id:1,n:'霓虹天台 · 雨夜',ic:'🌃',sky:0x2a1a4a,petal:0x9d4edd,line:'她把伞往你那边偏，说"这场雨我陪你淋完"。'},
  {id:2,n:'喜宴后门 · 红毯边',ic:'💒',sky:0xffd9c2,petal:0xff6f91,line:'礼乐还在里面响，她拉着你从后门溜了出去。'},
  {id:3,n:'旧账长街 · 路灯下',ic:'🕯️',sky:0x3a1030,petal:0xff4d6d,line:'她把旧账一页页撕碎，扔进路灯下的风里。'},
  {id:4,n:'深海王座 · 潮线之上',ic:'🌊',sky:0x0a3a52,petal:0x7fffd4,line:'浪声压过所有讨债的喧哗，她替你按住了伤口。'},
  {id:5,n:'极夜冰原 · 暖炉旁',ic:'❄️',sky:0x0c1a26,petal:0xdff2ff,line:'永夜没有白天，她把炉子烧得很旺，说"再待一会儿"。'},
  {id:6,n:'婚宴天台 · 喜灯之下',ic:'🎆',sky:0x2e0a1e,petal:0xffd60a,line:'喜灯还亮着，你们在天台上把最后一杯酒喝完了。'},
];
const NPC_SCENE=NPC_DEFS.map((_,i)=>Math.min(i,6)); // v70：8 位女主的约会场景直接对齐其所在章节的世界
function playDateScene(idx,aff){
  const sc=DATE_SCENES[idx%DATE_SCENES.length];
  // 视觉演出：镜头拉近 + 花瓣雨 + 色闪
  zoomTo(4.9,2.2);slowMotion(.4,1.4);
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
// v69：拆出「音效 / 音乐」两条总线（音量可分别调节），并在首个真实用户手势解锁 AudioContext（iOS 必需）
let AC=null,muted=false,sfxGain=null,musGain=null,acUnlocked=false;
function audioEnsure(){
  try{
    if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();
    if(AC.state==='suspended')AC.resume();
    if(AC.createGain){
      if(!sfxGain){sfxGain=AC.createGain();sfxGain.gain.value=(SET?SET.sfxVol:.8);sfxGain.connect(AC.destination);}
      if(!musGain){musGain=AC.createGain();musGain.gain.value=(SET?SET.musVol:.7);musGain.connect(AC.destination);}
    }
    acUnlocked=true;
  }catch(e){return null;}
  return AC;}
['pointerdown','touchstart','mousedown','keydown'].forEach(function(ev){
  addEventListener(ev,function(){try{audioEnsure();}catch(e){}},{once:true,passive:true});});
function beep(f,dur,type='square',vol=.08,slide=0,bus='sfx'){if(muted)return;
  try{audioEnsure();if(!AC)return;
    const g0=(bus==='mus')?((SET?SET.musVol:.7)):((SET?SET.sfxVol:.8));
    if(g0<=0)return;
    const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;
    if(slide)o.frequency.linearRampToValueAtTime(f+slide,AC.currentTime+dur);
    g.gain.setValueAtTime(Math.max(.0001,vol*g0),AC.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,AC.currentTime+dur);
    o.connect(g);g.connect(bus==='mus'?(musGain||AC.destination):(sfxGain||AC.destination));
    o.start();o.stop(AC.currentTime+dur);}catch(e){}}
// 暂停菜单里的音量调节（0~1）
function setVol(kind,v){
  v=Math.max(0,Math.min(1,Number(v)||0));
  if(kind==='sfx'){SET.sfxVol=v;if(sfxGain)sfxGain.gain.value=v;}
  else{SET.musVol=v;if(musGain)musGain.gain.value=v;
    if(ambMaster)ambMaster.gain.value=(muted||v<=0)?0:(ambMaster._vol||.5);}
  writeSet();}
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
  if(!audioEnsure()||!AC)return false;
  if(!ambMaster){ambMaster=AC.createGain();ambMaster.gain.value=.0;ambMaster.connect(musGain||AC.destination);}
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
  const target=ambMaster._vol=(muted||!SET||!(SET.musVol>0))?0:.55*SET.musVol;   // v69：环境音走音乐通道音量
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
    beep(sc.base*Math.pow(2,semi/12),.28,sc.type,sc.vol,0,'mus');   // v69：Boss BGM 走音乐总线
    // 低音鼓点
    if(bgmStep%4===0)beep(sc.base/2,.18,'sine',sc.vol*1.6,-20,'mus');
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
// v69：粒子材质按颜色缓存复用（原先每颗粒子 clone 一份材质且从不 dispose → 长时间游玩材质泄漏）
const PART_MATS={};
function burstMat(color){let m=PART_MATS[color];if(!m){m=M.part.clone();m.color.setHex(color);PART_MATS[color]=m;}return m;}
function burst(pos,color=0xff4d9e,n=10,spd=7){
  fxFlash(pos,1.5); // v67 AI 命中闪光
  const room=MAX_PARTS-parts.length;if(room<=0)return;   // v69：粒子总量硬上限
  if(n>room)n=room;
  for(let i=0;i<n;i++){const p=new THREE.Mesh(G.part,burstMat(color));
    p.position.copy(pos);p.userData={v:new THREE.Vector3((Math.random()-.5)*spd,Math.random()*spd*.8,(Math.random()-.5)*spd),life:.55};
    scene.add(p);parts.push(p);}}
let shakeX=0,shakeY=0;
function shake(v){S.shake=Math.max(S.shake,v);}

// ---------- 武器行为 ----------
// v69：按距离取最近 count 个目标（保持「就近索敌」手感，代价从 O(n log n) 降到 O(n·k)）
function nearestTargets(count){
  const out=[];
  if(!count||count<=0)return out;   // v69：调用方给 0/负数时直接返回空表，避免取 worst 时越界
  const px=player.position.x,py=player.position.y,pz=player.position.z;
  for(const e of enemies){
    const d=(e.position.x-px)*(e.position.x-px)+(e.position.y-py)*(e.position.y-py)+(e.position.z-pz)*(e.position.z-pz);
    if(out.length<count)out.push({e,d});
    else{
      let worst=0;for(let i=1;i<out.length;i++)if(out[i].d>out[worst].d)worst=i;
      if(d<out[worst].d)out[worst]={e,d};
    }
  }
  out.sort((a,b)=>a.d-b.d);
  return out.map(o=>o.e);
}
function fireBullet(){const lv=W.bullet.lv;if(!lv)return;
  const evo=W.bullet.evolved;const aw=W.bullet;
  const fused=!!aw.fused; // v42：万箭穿心
  const count=(evo?4:1)+Math.floor((lv-1)/2)+(P.atk>=3?1:0)+(aw.bonusN||0)+(fused?2:0);
  const targets=nearestTargets(count);   // v69：O(n·k) 选靶，替换原先「每次射击都整表排序 + 切片」
  const awDmg=(aw.awakened?1.4:1)*(aw.fuseDmg||1);
  for(const t of targets){const b=new THREE.Mesh(G.bullet,evo?bulletMatEvo:M.bullet);
    b.position.copy(player.position).setY(1.2);
    const dir=t.position.clone().sub(player.position).setY(0).normalize();
    if(!dir.lengthSq())dir.set(1,0,0);
    b.userData={v:dir.multiplyScalar(evo?26:20),dmg:(evo?16:9)*(1+lv*.35)*S.dmgMul*awDmg,
      life:1.5,pierce:(evo?2:0)+(aw.bonusPierce||0)+(fused?1:0),split:fused};
    if(aw.awakened){b.scale.setScalar(1.35);}
    if(fused){b.scale.setScalar(1.2);b.material=(M.bulletFused||(M.bulletFused=new THREE.MeshBasicMaterial({color:0xff4d9e})));}   // v69：复用材质，避免每发新建
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
    scene.remove(c);clones.splice(i,1);dh2ReleaseHost(c);}}}
function castUlt(){if(S.scum<100||!S.alive)return;S.scum=0;S.ultT=4;ultCount++;vib(35);
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
 {n:50,t:'👑 连杀 ×50 · 心动之神'},
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
  if(score>=45) return {g:'C',n:'C · 泛泛之辈',c:'#9ad0ff',d:'还在摸索万人迷之道',score:score};
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
    else if(u.affix==='split'){for(let k=0;k<2;k++){if(enemyBudget()<=0)break;const m=mkEnemy('swarm');
      m.userData.hp=Math.ceil(m.userData.hp*.5);m.userData.maxHp=m.userData.hp;m.userData.dmg*=.6;
      m.position.set(e.position.x+(Math.random()-.5)*2,0,e.position.z+(Math.random()-.5)*2);}}
    else if(u.affix==='twinpair'){
      // v43 双生：真正击杀一只即算击破（血量同步由 hitEnemy 处理）
      SAVE.twinKill=(SAVE.twinKill||0)+1;writeSave();
    }
    const n=u.boss?26:(u.elite?8:2);
    for(let i=0;i<n;i++)mkOrb(e.position);
    if(u.boss){bossAlive=false;if(u.form==='debt')debtBossAlive=false; // v72：讨债形态陨落才放开主线门闩
      bossKills++;stopBossBgm();vib([0,26,45,26]);   // v69：击杀首领震动反馈
      const bid=u.bossId||'captain';
      SAVE.bosses[bid]=(SAVE.bosses[bid]||0)+1;
      // v72 Boss 双重身份：同 id 的「讨债形态」与「遭遇战／试炼形态」分别计数（图鉴分开展示）
      if(u.form){SAVE.bossForms=SAVE.bossForms||{};const fk=bid+':'+u.form;SAVE.bossForms[fk]=(SAVE.bossForms[fk]||0)+1;}
      writeSave();
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
      // v68 章门结算：击败「本章讨债 Boss」才算过章；终章按婚宴三连战进度推进，三关全通直接判胜
      if(gameMode==='normal'&&chapterPhase==='boss'){
        if(chapter===CHAPTERS.length-1){
          if(WEDDING_ORDER.includes(bid)){
            if(weddingKills>=WEDDING_ORDER.length)triggerVictory();
            else chapterBossDown=false; // 三连战未完：保持章门开启，主循环继续召唤下一关 Boss
          }
        }else if(bid===chapterBossId()&&u.storyBoss)chapterBossDown=true; // v71c：必须是标记登场的本章讨债 Boss
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
      }else{tip(`🏆 ${bd.n}${u.form==='trial'?'（遭遇战形态）':''} 陨落！图鉴已更新`);shake(.5);}
      slowMotion(.25,1.6);zoomTo(6.0,1.6);
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
    scene.remove(e);enemies.splice(idx,1);dh2ReleaseHost(e);}
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
  const h2=document.querySelector('#modal h2');if(h2)h2.textContent='✦ 心动秘籍 · 三选一 ✦';
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
addEventListener('keydown',e=>{const _tn=e.target&&e.target.tagName;if(_tn==='INPUT'||_tn==='TEXTAREA')return;   // v73：在分享码 / 存档码输入框里打字，不再触发冲刺、必杀与暂停
  keys[e.key.toLowerCase()]=true;
  if(e.code==='Space')castUlt();if(e.key==='Shift')dash();
  if(e.key>='1'&&e.key<='8')useLoverUlt(+e.key-1);
  if(e.key==='Escape'||e.key==='p'||e.key==='P'){e.preventDefault();   // v69：键盘也可暂停
    if(e.key==='Escape'){const ao=document.getElementById('aboutOv');
      if(ao&&ao.style.display==='flex'&&typeof closeAbout==='function'){closeAbout();return;}
      const to=document.getElementById('tipOv');
      if(to&&to.style.display==='flex'&&typeof hideTipOverlay==='function'){hideTipOverlay(false);return;}}
    if(typeof panelBusy==='function'&&panelBusy())return;
    pauseToggle();}
  if((e.key==='m'||e.key==='M')){const mb=document.getElementById('muteBtn');if(mb)mb.click();}   // v69：快捷静音
});   // v67：恋人必杀扩到 8 位（1~8）
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
// 暂停 & 设置面板（v69）
let hardPause=false;
function setTxt(id,t){const e=document.getElementById(id);if(e)e.textContent=String(t);}
function pauseOpen(){
  if(!started||typeof tutOn!=='undefined'&&tutOn)return;
  if(typeof panelBusy==='function'&&panelBusy())return;   // v69：有其它全屏面板时不叠层
  const pm=document.getElementById('pauseMenu');if(!pm)return;
  hardPause=true;paused=true;
  const pb=document.getElementById('pauseBtn');if(pb)pb.textContent='▶';
  syncPauseUI();pm.style.display='flex';}
function pauseClose(){
  const pm=document.getElementById('pauseMenu');if(pm)pm.style.display='none';
  try{if(typeof closeBossViewer==='function')closeBossViewer();}catch(e){}
  if(started&&!(typeof tutOn!=='undefined'&&tutOn)){hardPause=false;paused=false;
    const pb=document.getElementById('pauseBtn');if(pb)pb.textContent='⏸';}}
function pauseToggle(){const pm=document.getElementById('pauseMenu');
  if(pm&&pm.style.display==='flex')pauseClose();else pauseOpen();}
function syncPauseUI(){
  const pv=k=>Math.round(((SET&&SET[k])||0)*100);
  const ms=document.getElementById('pmMus'),ss=document.getElementById('pmSfx');
  if(ms)ms.value=String(pv('musVol'));if(ss)ss.value=String(pv('sfxVol'));
  setTxt('pmMusV',pv('musVol'));setTxt('pmSfxV',pv('sfxVol'));
  const curQ=qualManual?String(QUAL.level):'auto';
  document.querySelectorAll('#pmQual button').forEach(b=>b.classList.toggle('on',b.dataset.q===curQ));
  document.querySelectorAll('#pmVib button').forEach(b=>b.classList.toggle('on',b.dataset.v===(SET.vib?'1':'0')));
  setTxt('pmVer',(typeof APP_BUILD!=='undefined'?APP_BUILD:(window.APP_BUILD||'—')));}
function bindPauseMenu(){
  const pm=document.getElementById('pauseMenu');if(!pm||pm._b)return;pm._b=true;
  const ms=document.getElementById('pmMus'),ss=document.getElementById('pmSfx');
  if(ms)ms.oninput=()=>{setVol('mus',ms.value/100);setTxt('pmMusV',ms.value);};
  if(ss)ss.oninput=()=>{setVol('sfx',ss.value/100);setTxt('pmSfxV',ss.value);beep(760,.05,'sine',.05);};
  document.querySelectorAll('#pmQual button').forEach(b=>b.onclick=()=>{
    const q=b.dataset.q;setQualityLevel(q==='auto'?'auto':(+q));syncPauseUI();
    tip('⚙️ 画质已切换：'+({auto:'自动',2:'高',1:'中',0:'低'})[q]);});
  document.querySelectorAll('#pmVib button').forEach(b=>b.onclick=()=>{
    SET.vib=(b.dataset.v==='1')?1:0;writeSet();vib(30);syncPauseUI();});
  const r=document.getElementById('pmResume'),rr=document.getElementById('pmRestart'),hm=document.getElementById('pmHome');
  if(r)r.onclick=pauseClose;
  if(rr)rr.onclick=()=>{pauseClose();const b=document.getElementById('startBtn');if(b)b.click();};
  if(hm)hm.onclick=()=>{pauseClose();goHome();};}
// 清场：只清运行时实体，不动存档与成长数据（返回主菜单 / 重开都用它）
function clearRunScene(){
  const _dh=[],_pt=[];
  for(const arr of[enemies,bullets,eBullets,orbs,teles,mists,npcs,chests,clones,stools])for(const e of arr){
    if(e&&e.userData&&e.userData.dh2Inst)_dh.push(e.userData.dh2Inst);
    scene.remove(e);}
  [enemies,bullets,eBullets,orbs,teles,mists,npcs,chests,clones,stools].forEach(a=>a.length=0);
  for(const p of parts){_pt.push(p);scene.remove(p);}parts.length=0;
  for(const f of followers){
    if(f&&f.g&&f.g.userData&&f.g.userData.dh2Inst)_dh.push(f.g.userData.dh2Inst);
    scene.remove(f.g);}
  followers.length=0;
  for(const g of twinShadows)scene.remove(g);twinShadows.length=0;
  const _live=dh2LiveSet();                       // v75：清场后回收数字人与粒子自建的 GPU 资源
  for(const inst of _dh)dh2Release(inst);
  for(const p of _pt)dh2DisposeOrphan(p,_live,true);
  bossAlive=false;debtBossAlive=false; // v73：清场时形态门闩一并归零
  const rb=document.getElementById('roomBar');if(rb)rb.style.opacity=0;
  const dl=document.getElementById('dlg');if(dl)dl.style.display='none';}
// 返回主菜单：结束本局但完整保留存档与成长（原先只能在结算界面回主界面）
function goHome(){
  if(!started)return;
  stopBossBgm();
  S.alive=false;started=false;paused=true;hardPause=true;
  clearRunScene();
  const ov=document.getElementById('overlay');
  if(ov){
    ov.style.display='flex';
    ov.querySelector('h1').textContent='心动狂潮';
    ov.querySelector('p').innerHTML='左侧摇杆移动 · 攻击全自动 · 💨 冲刺闪避<br>击杀攒<b style="color:#ffd60a">心动值</b>，满槽点心动值条释放<b style="color:#ff8fa3">「终极·修罗场」</b><br>8 大奇招 + 被动，满级可<b style="color:#ffd60a">进化合体</b> · 打穿七章讨债局，终章定「带谁走」';
    const gb=ov.querySelector('#gradeBadge');if(gb)gb.remove();
    const tb=ov.querySelector('#titleBadge');if(tb)tb.remove();
    const sz=ov.querySelector('#startBtn');if(sz)sz.textContent='开 始 闯 关';
    const sb=ov.querySelector('#shareBtn');if(sb)sb.style.display='none';}
  const pb=document.getElementById('pauseBtn');if(pb)pb.textContent='⏸';
  try{refreshSaveUI();}catch(e){}
  tip('已返回主菜单 · 存档与成长数据均已保留');}
document.getElementById('pauseBtn').onclick=pauseToggle;
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
const DEFAULT_SAVE={realmBonus:0,affinity:[0,0,0,0,0,0,0,0],mates:[],dates:[0,0,0,0,0,0,0,0],
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
  // v72 Boss 双重身份：按「id:形态」（如 thunder:debt / thunder:trial）分别统计击杀，图鉴分开展示
  bossForms:{},
  schemaVer:67};
let SAVE=null;
function loadSave(){try{const s=localStorage.getItem(SAVE_KEY);
    const raw=s?JSON.parse(s):null;
    const fromVer=(raw&&typeof raw.schemaVer==='number')?raw.schemaVer:0;   // v69：读出旧档版本号，用于分级迁移
    SAVE=raw?Object.assign({},DEFAULT_SAVE,raw):JSON.parse(JSON.stringify(DEFAULT_SAVE));
    // 兼容旧档
    if(!Array.isArray(SAVE.affinity))SAVE.affinity=[0,0,0,0];while(SAVE.affinity.length<8)SAVE.affinity.push(0);
    if(!Array.isArray(SAVE.dates))SAVE.dates=[0,0,0,0];while(SAVE.dates.length<8)SAVE.dates.push(0);
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
    // ---- v69：先按来源版本做分级迁移，再交给统一 schema 守卫 ----
    SAVE=migrateSave(SAVE,fromVer);
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
// v69：分级迁移 —— 此前 schemaVer 只写不读，跨代差异全靠通用兜底；现按来源版本显式处理
function migrateSave(save,fromVer){
  const out=save||{};
  // v67→v68 主线化改造：「结缘人数」与「结局」解耦，finalChoice 由数字升级为 'none'|'all'|'1:序号'
  if(fromVer&&fromVer<68&&out.finalChoice!==undefined&&typeof out.finalChoice!=='string'){
    const v=out.finalChoice;
    out.finalChoice=(typeof v==='number')?(v>=0?'1:'+v:'none'):'none';
  }
  // 远古档（无 schemaVer）标记来源，便于排查；不影响任何玩法与数值
  if(!fromVer)out._legacyNoVer=true;
  out._fromVer=fromVer||0;
  return out;}
function writeSave(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(SAVE));}catch(e){}}
function resetSave(){SAVE=JSON.parse(JSON.stringify(DEFAULT_SAVE));writeSave();refreshSaveUI();}

// ---------- 成长打赏（按章节成长阶段触发 · 完全自愿 · 不卡关） ----------
// 已打赏记录用独立 localStorage 键保存，与存档解耦：清档 / 换档 / 重新开局都不会让已打赏的阶段再弹窗。
const TIP_KEY='znxtx_tips_v1';
function tipsPaid(){try{const v=JSON.parse(localStorage.getItem(TIP_KEY)||'{}');return(v&&typeof v==='object'&&!Array.isArray(v))?v:{};}catch(e){return {};}}
function tipMarkPaid(ch){const v=tipsPaid();v[ch]=1;try{localStorage.setItem(TIP_KEY,JSON.stringify(v));}catch(e){}}
let tipOvCh=null,tipOvQueue=null,tipOvSelfPaused=false,tipOvTimer=null,tipOvBound=false;
function bindTipOverlay(){
  const p=document.getElementById('toPaid'),l=document.getElementById('toLater'),q=document.getElementById('toQr');
  if(p)p.onclick=()=>hideTipOverlay(true);
  if(l)l.onclick=()=>hideTipOverlay(false);
  if(q)q.onerror=()=>{q.className='toQr toQrMiss';
    const n=document.getElementById('toQrNote');if(n)n.textContent='打赏码图片未加载：请把收款码存为 assets/tipcode.png';};
}
// 成长阶段（章节）到达时调用：该阶段已打赏则静默跳过
// force=true 表示玩家自己点了常驻打赏入口（开始界面「打赏支持作者」或游戏内 ❤），此时已打赏的阶段也能打开
function showTipOverlay(ch,force){
  if(ch===null||ch===undefined||ch<0)return;
  const paid=!!tipsPaid()[ch];
  if(paid&&!force)return;                        // 已打赏的成长阶段 → 不再自动提示
  const o=document.getElementById('tipOv');if(!o)return;
  if(o.style.display==='flex'){if(!force)tipOvQueue=ch;return;}   // 已有弹窗 → 自动提示排队，前一个收起后再提示
  if(!tipOvBound){tipOvBound=true;bindTipOverlay();}
  tipOvCh=ch;
  const nm=document.getElementById('toCh');
  if(nm)nm.textContent=((typeof CHAPTERS!=='undefined')&&CHAPTERS[ch])?`第 ${ch+1} 章 · ${CHAPTERS[ch].name}`:'当前成长阶段';
  const pb=document.getElementById('toPaid');
  if(pb)pb.textContent=paid?'❤ 再支持一次':'我已打赏 ❤';
  const nt=document.getElementById('toNote');
  if(nt)nt.textContent=paid?'这一章你已经支持过了，真心感谢 ❤ 每一章都可以重复游玩。':'已打赏的成长阶段不会再提示；每一章都可以重复游玩。';
  o.style.display='flex';
  tipOvSelfPaused=(typeof started!=='undefined')&&started&&!hardPause&&!paused;
  if(tipOvSelfPaused)paused=true;
  clearTimeout(tipOvTimer);
  tipOvTimer=setTimeout(()=>hideTipOverlay(false),60000);  // 60 秒无操作自动收起，绝不打断游玩
}
function hideTipOverlay(paid){
  const o=document.getElementById('tipOv');if(!o)return;
  clearTimeout(tipOvTimer);tipOvTimer=null;
  const ch=tipOvCh;
  if(paid&&ch!==null&&ch!==undefined){
    tipMarkPaid(ch);
    tip('❤ 收到你的心意！愿玩得开心快乐～');
  }
  o.style.display='none';tipOvCh=null;
  // 点了「稍后再说」→ 常驻 ❤ 按钮呼吸提示；打赏后熄灭
  const tb=document.getElementById('tipBtn');
  if(tb)tb.classList.toggle('pulse',!paid);
  if(tipOvSelfPaused){tipOvSelfPaused=false;if(!hardPause)paused=false;}
  if(tipOvQueue!==null&&tipOvQueue!==undefined){const nx=tipOvQueue;tipOvQueue=null;setTimeout(()=>showTipOverlay(nx),420);}
}
// 常驻打赏入口：开始界面的「打赏支持作者」+ 游戏内 ❤ 按钮（手动打开不受「已打赏」限制）
function bindTipEntry(){
  const open=()=>showTipOverlay((typeof chapter==='number'&&chapter>=0)?chapter:0,true);
  const b=document.getElementById('tipBtn'),e=document.getElementById('tipEntry');
  if(b&&!b._tipBound){b._tipBound=true;b.onclick=open;}
  if(e&&!e._tipBound){e._tipBound=true;e.onclick=open;}
}

// ---------- 成就点数与初始增益兑换 ----------
// 稀有度折算点数：普通2 / 稀有4 / 史诗8 / 传说14 / 神话22
const ACH_PTS=[0,2,4,8,14,22];
function totalAchPoints(){let p=0;for(const a of ACHIEVEMENTS)if(SAVE.achievements.includes(a.id))p+=ACH_PTS[a.r||1];
  return p+(SAVE.bonusPts||0);} // 成就折算 + 签到等额外奖励
const SHOP_DEF=[
 {k:'hp',ic:'❤️',n:'海王体质·根基',d:'每级开局生命上限 +20',max:5,cost:8},
 {k:'spd',ic:'👟',n:'身法·轻功',d:'每级开局移速 +4%',max:5,cost:6},
 {k:'scum',ic:'😈',n:'心动气场',d:'每级开局心动值 +8',max:3,cost:10},
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
  if(redemption.scum)parts.push('心动值+'+redemption.scum);
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
 {id:'scumbag',n:'😈 心动本色',d:'单局心动值满槽释放 5 次',r:3,cond:()=>ultCount>=5},
 {id:'daily1',n:'📅 今日打卡',d:'完成 1 局每日挑战',r:1,cond:()=>(SAVE.totalRuns||0)>=1},
 {id:'daily5',n:'🗓️ 坚持不懈',d:'累计完成 5 局（任意模式）',r:3,cond:()=>(SAVE.totalRuns||0)>=5},
 {id:'combo20',n:'🔥 二十连斩',d:'单局达成 20 连杀',r:3,cond:()=>comboBest>=20},
 {id:'combo50',n:'👑 心动之神',d:'单局达成 50 连杀',r:5,cond:()=>comboBest>=50},
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
  where:'第一章 初恋校园 · 章末讨债 Boss',hint:'弹幕环扩散前有 0.5s 蓄力，冲刺穿过可躲大半'},
 {id:'mother',n:'彩礼审判·丈母娘',icon:'💍',d:'婚礼章节限定，甩出天价彩礼账单冲击波',hp:1300,
  where:'第三章 婚礼逃亡 · 章末讨债 Boss',hint:'账单冲击波成扇形推进，往侧向切角最省力'},
 {id:'mirror',n:'命运镜像体',icon:'👤',d:'复制玩家的奇招，反噬你的所有套路',hp:1700,
  where:'第四章 前任复仇 · 章末讨债 Boss',hint:'它只会你已装备的招——别把爆发全交给自己'},
 {id:'abyss',n:'深渊之主',icon:'🕳️',d:'深渊试炼限定，吞噬并复制你已觉醒的奇招',hp:2600,
  where:'深渊试炼 · 专属 Boss',hint:'每度苏醒都会变强，觉醒招数越多它越难缠'},
 {id:'thunder',n:'雷神·风暴主宰',icon:'⚡',d:'第二章之主：夜巡风暴的裁决者，落雷链与静电场环绕',hp:2200,
  where:'第二章 都市夜战 · 章末讨债 Boss ｜ 兼雷暴气候试炼之主',hint:'落雷有地面圈预警，看到圈就往外跑，别贪刀'},
 {id:'assassin',n:'雾隐刺客',icon:'🗡️',d:'浓雾天气限定，潜行背刺与影分身',hp:1900,
  where:'浓雾天气遭遇战 · 非主线',hint:'它总从背后出现——边打边绕圈，别站定'},
 {id:'solar',n:'金乌·烈日当空',icon:'☀️',d:'白昼晴天限定，日光灼烧与三足金乌',hp:2400,
  where:'白昼天气遭遇战 · 非主线',hint:'日光灼烧是持续掉血，站在阴影区能减少伤害'},
 {id:'rain',n:'雨神·潇湘',icon:'🌧️',d:'细雨天气限定，雨帘水幕与洪流冲击',hp:2050,
  where:'细雨天气遭遇战 · 非主线',hint:'水幕收拢前会有一圈提示，从缝里冲出去'},
 {id:'seaking',n:'深海海王·沧澜',icon:'🌊',d:'深海王座之主，珍珠环绕巨浪吞噬，情场浪子的终局镜像',hp:2800,
  where:'第五章 深海王座 · 章末讨债 Boss',hint:'漩涡会把你往里拽——反方向冲刺才能挣脱'},
 {id:'frost',n:'霜夜女王·凛',icon:'❄️',d:'极夜冰原之主，冰锥囚笼与极寒心冻，冻结你的每一次心动',hp:3100,
  where:'第六章 极夜冰原 · 章末讨债 Boss',hint:'冰锥囚笼圈内伤害更低——被围住时往中心跑'},
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
// ---------- v72 · Boss 身份形态表（雷神双重身份的真正落点） ----------
// 背景：雷神（id thunder）既是「第二章 都市夜战 · 章末讨债 Boss」，又是「雷暴天气遭遇战之主」。
//   此前这层双重身份只写在 BOSSES_DEF[].where 的文案里——代码层面同 id、同强化口径、同计数，无法区分。
// v72 起，身份成为一等代码概念：
//   · 每个 Boss 单位带 userData.form：'debt' 讨债形态（主线）｜ 'trial' 试炼／遭遇战形态（非主线）；
//   · 章门（chapterBossDown）只认 form==='debt' 且带 storyBoss 标记的单位；
//   · 主线门闩 debtBossAlive 与 bossAlive 解耦，遭遇战不再推迟讨债 Boss；
//   · 同 id 的遭遇战形态可「就地转正」为讨债形态（不刷第二只同 id 单位）；
//   · 两种形态分别计数（SAVE.bossForms），图鉴、登场标题、击杀提示分别标注。
// v73 加固：① 120 秒节奏提前来犯的「本章 Boss」统一标 trial（不带 storyBoss，不能过章、不顶替主线局）；
//   ② 同 id 遭遇战一律「就地转正」为讨债形态（转正即满血），任何章节都不会出现同 id 两只 Boss；
//   ③ storyBossBoost 幂等（同一单位只吃一次形态强化，杜绝 1.45×1.45 超标）；
//   ④ debtBossAlive 在换章 / 清场 / 新局三处一并复位，避免跨局门闩残留导致主线门卡死。
const BOSS_FORMS={
 thunder:{dual:true,forms:[
  {k:'debt', n:'讨债人形态', tag:'📖',where:'第二章 都市夜战 · 章末讨债 Boss',
   desc:'清满本章 3 间房后强制登场 · 击败才过章 · 吃章节强化 hp×1.45 / dmg×1.2'},
  {k:'trial',n:'雷暴遭遇战形态',tag:'🌩️',where:'雷暴天气遭遇战 · 非主线',
   desc:'雷暴刷出 · 不过章、不占主线门 · 气候试炼「雷时」权柄与它同源'}]},
 rain:{dual:false,forms:[{k:'trial',n:'遭遇战形态',tag:'🌧️',where:'细雨天气遭遇战 · 非主线',desc:'细雨刷出 · 非主线'}]},
 solar:{dual:false,forms:[{k:'trial',n:'遭遇战形态',tag:'☀️',where:'白昼晴天遭遇战 · 非主线',desc:'白昼晴天刷出 · 非主线'}]},
 assassin:{dual:false,forms:[{k:'trial',n:'遭遇战形态',tag:'🗡️',where:'浓雾天气遭遇战 · 非主线',desc:'浓雾刷出 · 非主线'}]},
 chronos:{dual:false,forms:[{k:'trial',n:'试炼形态',tag:'🕛',where:'气候试炼 · 集齐四印解锁',desc:'气候试炼专属 · 非主线'}]},
};
function bossFormDef(bid,form){const d=BOSS_FORMS[bid];if(!d)return null;return d.forms.find(f=>f.k===form)||null;}
function bossFormTag(bid,form){const f=bossFormDef(bid,form);return f?'（'+f.n+' · '+(form==='debt'?'主线':'非主线')+'）':'';}
function formKills(bid,form){const m=SAVE.bossForms||{};return m[bid+':'+form]||0;}
// 打上身份标记：'debt' 讨债形态同时带 storyBoss 标记（v71c 契约：章门只认这一位）
function markBossForm(b,form){
  const u=b&&b.userData;if(!u)return b;
  u.form=form;
  u.storyBoss=(form==='debt');
  return b;}
function findLiveTrialBoss(bid){
  for(const e of enemies){const u=e&&e.userData;if(u&&u.boss&&u.bossId===bid&&u.form==='trial')return e;}
  return null;}
// 同 id 的「遭遇战形态」就地升格为「讨债形态」：不另刷第二只同 id 单位，主线讨债局也不会被顶掉。
// 注（v73）：升格即刻满血，形态强度与「直接刷出」的讨债 Boss 完全一致。
function promoteBossToDebt(b,bi){
  if(!b||!b.userData)return null;
  markBossForm(b,'debt');
  storyBossBoost(b,bi);
  b.userData.hp=b.userData.maxHp; // v73：转正即满血——讨债形态强度与直接刷出完全一致，避免半血转正绕过主线门
  bossAlive=true;debtBossAlive=true;
  bossIntro(b,(BOSSES_DEF.find(x=>x.id===b.userData.bossId)||{}).n||'讨债人');
  return b;}

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
    // v72 雷神双重身份：气候试炼「雷时」的落雷权柄与雷神（遭遇战形态）同源，明确点出这层关系
    if(p.k==='storm')setTimeout(()=>{if(S.alive&&gameMode==='climate')tip('⚡ 雷时 · 四时之主借用了雷神（遭遇战形态）的落雷权柄');},3600);
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
  // 章节 → 章末讨债 Boss 索引（v71c 重排：章末讨债人与章节名气质一一对应，消除与世界观的错位）
  const c=chapter%7;
  if(c===1)return 4;      // 第二章 都市夜战 → 夜巡雷神·风暴主宰
  if(c===2)return 1;      // 第三章 婚礼逃亡 → 彩礼审判·丈母娘
  if(c===3)return 2;      // 第四章 前任复仇 → 命运镜像体
  if(c===4)return 8;      // 第五章 深海王座 → 深海海王·沧澜
  if(c===5)return 9;      // 第六章 极夜冰原 → 霜夜女王·凛
  if(c===6)return 11;     // 第七章 婚宴修罗场 → 岳父大人（三连战第一关）
  return 0;               // 第一章 初恋校园 → 正牌男友军团长
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
      ${got&&STORY_LINK[b.id]&&STORY_LINK[b.id].hero?`<div class="cd" style="color:#ff8fc8;font-size:11px;margin-top:2px">🕯️ 本章线人：${STORY_LINK[b.id].hero}（${STORY_LINK[b.id].role}）</div>`:''}
      ${got&&BOSS_FORMS[b.id]&&BOSS_FORMS[b.id].dual?`<div class="cd" style="color:#c8b8ff;font-size:11px;margin-top:2px">⚔️ 双重身份：${BOSS_FORMS[b.id].forms.map(f=>`${f.tag} ${f.n}（${f.k==='debt'?'主线':'非主线'} · 击败 ${formKills(b.id,f.k)} 次）`).join(' ｜ ')}</div>`:''}
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
  const W2=Math.min(340,innerWidth-56),H2=W2;
  cv.width=W2*2;cv.height=H2*2;cv.style.width=W2+'px';cv.style.height=H2+'px';
  let rn;
  try{rn=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});}
  catch(e){ov.querySelector('.bvHint').textContent='⚠ 当前设备不支持 3D 预览';return;}
  rn.setPixelRatio(2);rn.setSize(W2,H2,false);
  rn.outputEncoding=THREE.sRGBEncoding;rn.toneMapping=THREE.ACESFilmicToneMapping;rn.toneMappingExposure=1.15;
  const sc=new THREE.Scene();
  const cam=new THREE.PerspectiveCamera(38,W2/H2,.1,100);
  cam.position.set(0,2.45,8.4);cam.lookAt(0,2.42,0);
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
    bs.cam.position.y=2.45+Math.sin(performance.now()/900)*.03;
    bs.cam.lookAt(0,2.42,0);
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
 w_berserk:'🔥【狂暴徽记】起始心动值 +40',
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
 {d:6,pts:8,ic:'👑',dsc:'成就点数 +8 + 开局心动值 +30'},
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
  // v72 Boss 双重身份：登记在 BOSS_FORMS 里的 Boss（雷神），登场标题直接标出此刻是哪一种身份
  const dualTag=bossFormTag((b.userData||{}).bossId,(b.userData||{}).form);
  // v45：统一走 rise 模板——压慢 → 色闪+边缘描边 → 光环扩散，节奏固定
  VFX.rise({color:bi.c,rimCol:bi.w,pulseCol:bi.w.replace(/[\d.]+\)$/,'.75)'),
    shake:.8,slowDur:2.2,zoom:6.2,zoomDur:2.2,
    sfxFn:()=>{sfx.ult();},text:bi.t+dualTag,text2:'⚠ 战斗开始 · 注意脚下预警圈'});
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
    zoomTo(opt.zoom||4.9,opt.zoomDur||1.7);
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
 {t:'💌 第 1 封信',b:'"听说你在大学城很出名。<br>传单贴满了半个年级——署名是你的军团长。<br>今晚，广场见。我替你压着。"<br><span style="color:#ff8fc8">—— 林晚晴</span>'},
 {t:'💌 第 2 封信',b:'"霓虹街的停电记录，是我递给他的。<br>别怪雷，先怪你欠下的那些夜。<br>躲雨的伞，还是放在老地方。"<br><span style="color:#4cc9f0">—— 苏曼</span>'},
 {t:'💌 第 3 封信',b:'"彩礼的账单上，也有我的名字。<br>捧花我拆了，红毯我踩了，喜宴的后门我替你开着。<br>——从后门跑。"<br><span style="color:#ffd60a">—— 糖糖</span>'},
 {t:'💌 第 4 封信',b:'"旧账册在我手上，每一页都记着你骗过的人。<br>今晚它们会一起站起来，长成你的样子。<br>——我替你翻到最后一页。"<br><span style="color:#a8c8e8">—— 夜冰</span>'},
 {t:'💌 第 5 封信',b:'"深海里有人替你建了王座，也有人替你把债都数清了。<br>潮水漫上台阶之前，先来诊所一趟——绷带我都加厚了。"<br><span style="color:#7fd4ff">—— 白甜甜</span>'},
 {t:'💌 第 6 封信 · 终章前夜',b:'"这里的夜不会亮，女王说：冰封的旧账要一起烧。<br>供需清单在我这儿，活下去的每一分钟我都替你算了价。<br>——先活着，再谈走完。"<br><span style="color:#c8b8ff">—— 顾清梨</span>'},
 {t:'💌 第 7 封信 · 请帖',b:'"喜帖是红色的，字是金色的，<br>底下那行小字写着：<br>『携前任及所有债主，同赴。』"<br><span style="color:#ffd60a">—— 婚宴邀请函</span><br><span style="color:#ff8fc8">（宾客名单由温砚秋核定：她把你排在了最后一排；伴娘陈飞飞给你留着侧门。）</span>'},
 {t:'💌 第 8 封信 · 逃出生天',b:'"你从婚宴上跑出来了，只带了一只鞋。<br>可是亲爱的，你以为婚姻是终点？<br>不，它只是第一场考试。"<br><span style="color:#ff8fa3">—— 岳父大人</span>'},
];
function showLetter(i,after){const L=LETTERS[i%LETTERS.length];
  document.getElementById('lt').innerHTML=L.t;
  document.getElementById('lb').innerHTML=L.b;
  const le=document.getElementById('letter');le.style.display='flex';le.style.opacity=1;
  setTimeout(()=>{le.style.opacity=0;setTimeout(()=>{le.style.display='none';
    if(typeof after==='function')setTimeout(after,120);},700);},3000);}

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
 {name:'晚晴·满月告白',cd:40,key:'1',
  fx:()=>{ // 全屏治疗 + 心形环绕治愈光
    S.hp=S.maxHp;flashOverlay('rgba(255,143,163,.3)',.6);
    for(let i=0;i<24;i++){const a=i/24*Math.PI*2;
      const h3=new THREE.Mesh(G.orb,new THREE.MeshBasicMaterial({color:0xff8fa3}));
      h3.scale.setScalar(.5);h3.position.copy(player.position).setY(1.5);
      h3.userData={v:new THREE.Vector3(Math.cos(a)*9,4,Math.sin(a)*9),life:.9};
      scene.add(h3);parts.push(h3);}
    tip('💗 晚晴：满月之下，我治愈你的一切！');sfx.evo();}},
 {name:'曼姐·修罗降临',cd:50,key:'2',
  fx:()=>{ // 全屏伤害
    for(let i=0;i<40;i++){const a=Math.random()*7;
      const p3=new THREE.Mesh(G.meteor,new THREE.MeshBasicMaterial({color:0x9d4edd}));
      p3.position.copy(player.position).add(new THREE.Vector3(Math.cos(a)*(8+Math.random()*14),0,Math.sin(a)*(8+Math.random()*14)));
      p3.userData={v:new THREE.Vector3(0,-30,0),life:.5,land:()=>{}};
      scene.add(p3);parts.push(p3);}
    for(const e of enemies)if(e.position.distanceTo(player.position)<22)hitEnemy(e,180*S.dmgMul);
    flashOverlay('rgba(157,78,221,.35)',.6);shake(.6);
    tip('🍷 曼姐：修罗场，由我来清场。');sfx.ult();}},
 {name:'糖糖·糖衣炮火',cd:42,key:'3',
  fx:()=>{ // 全场魅惑 + 碎片雨
    for(const e of enemies)e.userData.charmed=4;
    for(let i=0;i<20;i++)mkOrb(player.position);
    flashOverlay('rgba(249,160,63,.3)',.6);
    tip('🍬 糖糖：都别打啦，来吃糖！');sfx.lvl();}},
 {name:'夜冰·冰封千里',cd:44,key:'4',
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
 {name:'甜甜·急救处方',cd:38,key:'5',
  fx:()=>{ // 全屏治疗 + 药香回血球 + 减伤护盾
    S.hp=S.maxHp;S.hurtReduce=Math.min(.45,(S.hurtReduce||0)+.15);
    for(let i=0;i<14;i++)mkOrb(player.position);
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2;
      const p5=new THREE.Mesh(G.orb,new THREE.MeshBasicMaterial({color:0x7ee0a0}));
      p5.scale.setScalar(.45);p5.position.copy(player.position).setY(1.4);
      p5.userData={v:new THREE.Vector3(Math.cos(a)*7,3.2,Math.sin(a)*7),life:.9};
      scene.add(p5);parts.push(p5);}
    flashOverlay('rgba(126,224,160,.28)',.6);
    tip('🏥 甜甜：别硬撑，先给你做个全身检查~');sfx.evo();}},
 {name:'清梨·并购风暴',cd:52,key:'6',
  fx:()=>{ // 全屏高伤 + 碎片雨
    for(const e of enemies)if(e.position.distanceTo(player.position)<24)hitEnemy(e,220*S.dmgMul);
    for(let i=0;i<24;i++)mkOrb(player.position);
    for(let i=0;i<26;i++){const a=Math.random()*7;
      const p6=new THREE.Mesh(G.meteor,new THREE.MeshBasicMaterial({color:0xffd60a}));
      p6.position.copy(player.position).add(new THREE.Vector3(Math.cos(a)*(7+Math.random()*13),0,Math.sin(a)*(7+Math.random()*13)));
      p6.userData={v:new THREE.Vector3(0,-34,0),life:.5,land:()=>{}};
      scene.add(p6);parts.push(p6);}
    flashOverlay('rgba(255,214,10,.30)',.6);shake(.55);
    tip('💼 清梨：这家公司，我收定了。');sfx.ult();}},
 {name:'飞飞·应援冲刺',cd:36,key:'7',
  fx:()=>{ // 全场魅惑 + 冲刺重置 + 冲刺冷却缩短（有下限，不无限叠加）
    for(const e of enemies)e.userData.charmed=4;
    S.dashCd=0;S.dashCdMax=Math.max(2,(S.dashCdMax||6)-.5);
    for(let i=0;i<20;i++){const a=i/20*Math.PI*2;
      const p7=new THREE.Mesh(G.orb,new THREE.MeshBasicMaterial({color:0xff8fa3}));
      p7.scale.setScalar(.4);p7.position.copy(player.position).setY(1.2);
      p7.userData={v:new THREE.Vector3(Math.cos(a)*8,2.6,Math.sin(a)*8),life:.8};
      scene.add(p7);parts.push(p7);}
    flashOverlay('rgba(255,143,163,.30)',.6);
    tip('📣 飞飞：学长加油！我把全场都喊停啦！');sfx.lvl();}},
 {name:'砚秋·落笔封神',cd:40,key:'8',
  fx:()=>{ // 全场墨色冻结 + 修为大涨
    for(const e of enemies){const u=e.userData;if(u.hp>0&&e.position.distanceTo(player.position)<22){u.slowT=Math.max(u.slowT||0,3.2);hitEnemy(e,140*S.dmgMul);burst(e.position.clone().setY(.8),0x4b3f72,4,5);}}
    gainXp(Math.max(40,(S.xpNeed||10)*.8));
    for(let i=0;i<24;i++){const a=Math.random()*7;
      const p8=new THREE.Mesh(new THREE.PlaneGeometry(.9,.26),new THREE.MeshBasicMaterial({color:0x2a1a3a,transparent:true,opacity:.85,side:THREE.DoubleSide}));
      p8.position.copy(player.position).add(new THREE.Vector3(Math.cos(a)*(6+Math.random()*11),1.1+Math.random()*1.6,Math.sin(a)*(6+Math.random()*11)));
      p8.userData={v:new THREE.Vector3(Math.cos(a)*3.2,1.6,Math.sin(a)*3.2),life:.9};
      scene.add(p8);parts.push(p8);}
    flashOverlay('rgba(75,63,114,.34)',.6);
    tip('🖋️ 砚秋：这一笔落下，便是定局。');sfx.ult();}},
];
const loverCd=[0,0,0,0,0,0,0,0];
function useLoverUlt(i){if(!LOVER_ULT[i])return;if(loverCd[i]>0||!S.alive)return;if(!mates.includes(i)||affinity[i]<AFF_MAX){
    tip('💔 需要她成为恋人才能使出专属必杀');return;}
  loverCd[i]=LOVER_ULT[i].cd||45;LOVER_ULT[i].fx();renderLoverBtns();}
function renderLoverBtns(){const box=document.getElementById('loverBtns');
  box.innerHTML=mates.filter(i=>affinity[i]>=AFF_MAX&&LOVER_ULT[i]).map(i=>{
    const r=Math.max(0,loverCd[i]);
    return `<button class="lbtn${r>0?' cd':''}" title="${LOVER_ULT[i].name}" data-i="${i}">${porTag(i,44)}<span>${LOVER_ULT[i].key}</span></button>`;}).join('');
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
// v68 终章抉择：把「结缘名单（给成就/称号用）」与「最终带走谁（给结局用）」彻底解耦。
// 于是同一局既能结缘多人拿「修罗场大满贯」成就，又能在终章收心走真结局——两套目标不再互斥。
// 兜底口径：没走到「终章抉择」就结束时（阵亡 / 无尽·深渊·影子等非常规模式），
// 按旧的「结缘数量」口径自动补一个抉择，保证既有结局与成就判定完全不变。
function ensureFinal(){
  if(typeof S.finalChoice!=='string')
    S.finalChoice=(mates.length>=3)?'all':(mates.length===1?'1:'+mates[0]:'none');
  return S.finalChoice;}
function singleChoice(){const f=ensureFinal();
  return (f.indexOf('1:')===0)?(+f.slice(2)):-1;}
function finalKind(){return ensureFinal();}
const ENDINGS=[
 // ---- v46 倾向专属结局（优先级最高：先看这一局「你成为了什么样的人」） ----
 {id:'align_sincere',name:'🕊️ 真心结局 · 一句就是一诺',
  cond:()=>finalKind()==='none'&&alignDominant()==='sincere'&&alignScore('sincere')>=6,
  text:'你没有再撒过一次谎。每一个「好」都是真的，每一次「等我」都真的等到。<br>她后来跟朋友说：「这个人啊，笨得要死，但说话算数。」<br>—— 这大概是对情场浪子最高的评价了。',
  col:'#7fd4ff'},
 {id:'align_player',name:'😈 浪子术结局 · 无人生还',
  cond:()=>finalKind()==='none'&&alignDominant()==='player'&&alignScore('player')>=6,
  text:'你的每一句情话都精准命中，每一个转身都不留证据。<br>到最后，手机里 47 个置顶对话框，没有一个敢点开。<br>你赢了所有人的心，唯独没赢过自己那面镜子。',
  col:'#ff4d6d'},
 {id:'align_slick',name:'🎭 圆滑结局 · 谁都没记住',
  cond:()=>finalKind()==='none'&&alignDominant()==='slick'&&alignScore('slick')>=6,
  text:'你从没答应过什么，也从没拒绝过什么。<br>所有人都觉得你「还不错」，但没有人说得出你到底哪里好。<br>你活成了一杯温水——不烫嘴，也暖不了人。',
  col:'#c77dff'},
 {id:'scumbag',name:'💀 孤家寡人结局',cond:()=>finalKind()==='none'&&mates.length===0,
  text:'你把所有人都骗了一遍，最后一个人站在广场中央。<br>雨还在下，没有人再给你发消息。'},
 {id:'ice_true',name:'❄️ 冰雪奇缘·冰心结局',cond:()=>singleChoice()===3&&affinity[3]>=AFF_MAX,
  text:'雪落满肩。她终于笑了，像冰川裂开第一道春光。<br>"你融化了。"她说。<br>"不，"你握紧她的手，"是你让我学会了不逃。"',
  col:'#4cc9f0'},
 {id:'harem4',name:'🌅 修罗场大满贯',cond:()=>finalKind()==='all'&&mates.length>=4,
  text:'四位姑娘把你围在中间，气氛凝固成冰。<br>然后夜冰开口了："打一架，赢的留下。"<br>……你拔腿就跑，身后追兵与雪崩齐鸣。这是你情场生涯最狼狈也最充实的一天。',
  col:'#ffd60a'},
 {id:'harem',name:'👑 海王结局',cond:()=>finalKind()==='all'&&mates.length>=3,
  text:'四位姑娘同时走向你，手里都攥着同一张照片。<br>"所以，你到底选谁？"<br>……你笑了，因为你知道，你谁都不会选。'},
 {id:'true',name:'🕊️ 浪子回头·真结局',cond:()=>singleChoice()>=0&&affinity[singleChoice()]>=AFF_MAX,
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
  // v67：8 位女主的好感与约会次数全部跨局保存（此前只存前 4 位）
  for(let i=0;i<NPC_DEFS.length;i++){SAVE.affinity[i]=Math.max(SAVE.affinity[i]||0,Math.round(affinity[i]*.4));
    SAVE.dates[i]=Math.max(SAVE.dates[i]||0,dates[i]||0);}
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
  g.fillText('心 动 狂 潮',W2/2,110);
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
  g.fillText('打穿七章讨债局 · 终章定带谁走',W2/2,H2-100);
  g.fillStyle='#ffd60a';g.font='bold 16px sans-serif';
  g.fillText('▶ 打开网页即可体验《心动狂潮》',W2/2,H2-68);
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

// v68：每一章都带一套独立的「本章机制」mech（刷怪倍率/精英率/敌速/敌血/持续掉血/清房配额），
// 由 applyChapter 应用到 chapterMech，再由刷怪与主循环按章读取——章节不再只是换皮。
const CHAPTERS=[
 {name:'第一章 · 初恋校园',fog:0x2a1046,exposure:1.0,amb:0x8855bb,keyC:0xffa0d8,rain:true,desc:'樱花与心动，一起从这里开始',
  mech:{tag:'常规节奏 · 教学章',spawnMul:1,elite:0,spd:1,hp:1,drain:0,quota:1}},
 {name:'第二章 · 都市夜战',fog:0x0a1830,exposure:0.95,amb:0x4466aa,keyC:0x88ccff,rain:true,desc:'霓虹与谎言，谁先崩塌',
  mech:{tag:'夜战 · 视野收窄',spawnMul:1.12,elite:.06,spd:1.08,hp:1.05,drain:0,quota:1}},
 {name:'第三章 · 婚礼逃亡',fog:0x3a1a10,exposure:1.05,amb:0xbb7744,keyC:0xffc27a,rain:false,desc:'喜宴变修罗场，逃！',
  mech:{tag:'逃亡 · 追债狂潮',spawnMul:1.3,elite:.08,spd:1.06,hp:1.05,drain:.4,quota:.85}},
 {name:'第四章 · 前任复仇',fog:0x2a0620,exposure:0.9,amb:0xaa2266,keyC:0xff4d6d,rain:true,desc:'所有旧账，今夜清算',
  mech:{tag:'复仇 · 精英环伺',spawnMul:1.15,elite:.22,spd:1.05,hp:1.18,drain:.6,quota:1}},
 {name:'第五章 · 深海王座',fog:0x04182a,exposure:0.98,amb:0x226688,keyC:0x66ccff,rain:true,desc:'海王的领域，浪涛与情网交织',
  mech:{tag:'漩涡 · 步履维艰',spawnMul:1.2,elite:.14,spd:1.16,hp:1.2,drain:1,quota:1.05}},
 {name:'第六章 · 极夜冰原',fog:0x0c1a26,exposure:0.9,amb:0x4a7a9a,keyC:0xa8e6ff,rain:true,desc:'永夜冰封万里，唯有心跳未曾冻结',
  mech:{tag:'极寒 · 持续失温',spawnMul:1.25,elite:.14,spd:1.1,hp:1.25,drain:1.6,quota:1.1}},
 {name:'第七章 · 婚宴修罗场',fog:0x2e0a1e,exposure:1.02,amb:0xc04080,keyC:0xffd60a,rain:false,desc:'红色喜帖，金色刀光——今天谁都不许走',
  mech:{tag:'终章 · 三连战',spawnMul:1.35,elite:.2,spd:1.08,hp:1.3,drain:1,quota:1.15}},
];
// v66：把当前时段色「染色」到 AI 天际线上（night 偏暗蓝紫，day 偏亮）
function setSkyTint(col){
  if(!skyDome||!skyDome.material)return;
  skyDome.material.color.copy(col);
  // 无穹顶时退化为纯色背景，保证昼夜演出不丢
  if(!skyDome.material.map)scene.background=col.clone();}
let chapter=0,chapterBannerT=0;
// ========== v68 · 主线核心：七章讨债线 ==========
// 一句话玩法目的：你是被「全场追债」的花心浪子——要打穿七场「讨债局」，
// 并在终章决定：最后只带一个人走，还是把所有人都得罪干净。
// 每章 = 一份讨债状（谁来找你 / 罪名 / 你要做什么）。章节推进不再看时间，只看这份状子结没结：
//   清满本章 CHAPTER_ROOMS 间房 → 章末「讨债 Boss」登场 → 击败它才过章（终章为婚宴三连战）。
const CHAPTER_ROOMS=3;
let chapterRoom=0;        // 本章已清房数
let chapterClock=0;       // 本章累计时间：驱动被重新启用的 TIMELINE 波次（原本是死代码）
let chapterWaveIdx=0;     // 本章已放过第几波
let chapterPhase='rooms'; // 'rooms'=清房段 | 'boss'=章末讨债 Boss 段
let chapterBossDown=false;
// v72 · 雷神双重身份：debtBossAlive 只统计「讨债形态（主线）」Boss，与「场上有任何 Boss」（bossAlive）解耦，
// 于是雷暴遭遇战形态在场时，章末讨债 Boss 仍能按时登场（不再被同 id 遭遇战顶掉节奏）。
let debtBossAlive=false;
let chapterMech={spawnMul:1,elite:0,spd:1,hp:1,drain:0,quota:1,tag:'常规节奏'};
const STORY=[
 {debtor:'正牌男友军团长',charge:'脚踏多船 · 证据确凿',goal:'清 3 房，正面打散讨债军团',hero:'林晚晴',role:'担保人'},
 {debtor:'夜巡雷神 · 风暴主宰',charge:'雨夜旧账 · 一道雷一道雷地算',goal:'清 3 房，在雷暴里站到最后',hero:'苏曼',role:'线人'},
 {debtor:'彩礼审判 · 丈母娘',charge:'始乱终弃 · 欠一句交代',goal:'清 3 房，接下那张天价彩礼账单',hero:'糖糖',role:'逃婚同谋'},
 {debtor:'命运镜像体',charge:'你骗过的人，都记着你',goal:'清 3 房，击败你自己的镜像',hero:'夜冰',role:'记账人'},
 {debtor:'深海海王 · 沧澜',charge:'抢人姻缘 · 前任集体申诉',goal:'清 3 房，从漩涡里杀出来',hero:'白甜甜',role:'随船医师'},
 {debtor:'霜夜女王 · 凛',charge:'冰封旧账 · 永夜里的不速之客',goal:'清 3 房，把极寒里的旧账烧掉',hero:'顾清梨',role:'供需核算师'},
 {debtor:'岳父大人 · 陈镇岳',charge:'婚宴逃席 · 三关连斩',goal:'连过三关：岳父 → 合唱团 → 伪司仪',hero:'温砚秋 · 陈飞飞',role:'证婚人 · 伴娘'},
];
// v71d：讨债人 ↔ 本章女主 关系网（与 bossForChapter 的配对表一一对应）——讨债线与情感线互为因果
const STORY_LINK={
 captain:STORY[0],thunder:STORY[1],mother:STORY[2],mirror:STORY[3],
 seaking:STORY[4],frost:STORY[5],fatherinlaw:STORY[6],exchorus:STORY[6],emcee:STORY[6]};
let _vfxChapterFirst=true; // 首章不播演出（开局已有开场动画）
function applyChapter(i){const c=CHAPTERS[i%CHAPTERS.length];chapter=i%CHAPTERS.length;
  chapterMech=Object.assign({spawnMul:1,elite:0,spd:1,hp:1,drain:0,quota:1,tag:'常规节奏'},c.mech||{});
  chapterRoom=0;chapterClock=0;chapterWaveIdx=0;chapterPhase='rooms';chapterBossDown=false;debtBossAlive=false; // v73：换章/新局一律放开主线门闩，避免跨局残留卡死主线门
  scene.fog.color.setHex(c.fog);
  setSkyTint(new THREE.Color(c.fog).lerp(new THREE.Color(0xffffff),.42));
  renderer.toneMappingExposure=c.exposure*1.05;
  ambient.color.setHex(c.amb);key.color.setHex(c.keyC);
  rain.visible=c.rain;
  wall.material.color.setHex(i%2?0x4cc9f0:0xf72585);
  document.getElementById('chapterName').textContent=c.name;
  {const st=STORY[i%STORY.length]; // v68：横幅直接说清这一章要做什么（讨债状）
   document.getElementById('chapterDesc').textContent=st?`${c.desc} · 讨债状：${st.goal}`+(st.hero?` ｜ 线人：${st.hero}（${st.role}）`:''):c.desc;}
  applyOutfit(i); // 章节换装
  chapterBanner();
  // v45：章节切换统一演出（首章跳过，避免与开场撞车）
  if(!_vfxChapterFirst&&i>0)chapterCutscene(i);
  _vfxChapterFirst=false;}
function chapterBanner(){const b=document.getElementById('banner');
  b.style.opacity=1;b.style.transform='translateY(0)';
  clearTimeout(chapterBannerT);
  chapterBannerT=setTimeout(()=>{b.style.opacity=0;b.style.transform='translateY(-14px)';},3200);}
// ---------- v71 · 章节过场对白（讨债人 x 本章女主）----------
// 只是「字幕条」：不暂停、不阻断操作；自动收起，也可点 ✕ 或点卡片立即关闭。
// 位置固定在底部控制区之上、居中卡片的下方，避开 banner/信件/toast/摇杆/技能键。
const CHAPTER_TALK=[
 {d:{who:'正牌男友军团长',line:'半个年级都收到了传单。今天你就是大学城最大的笑话。'},
  h:{who:'林晚晴',line:'别怕。操场那头的樱花道，我替你看着。'}},
 {d:{who:'夜巡雷神 · 风暴主宰',line:'雨夜里的账，一道雷一道雷地算。这条街的灯，我替你灭。'},
  h:{who:'苏曼',line:'停电记录是我递出去的——旧账翻完，你才走得出这条霓虹街。'}},
 {d:{who:'彩礼审判 · 丈母娘',line:'彩礼的账，我女儿替你还了三年——今天连本带利一起算。'},
  h:{who:'糖糖',line:'账单我压下去了！捧花我拆了，跟我从后门跑。'}},
 {d:{who:'命运镜像体',line:'你骗过的人，我全都记着。我就是你亲手养出来的那个你。'},
  h:{who:'夜冰',line:'旧账册在我手上。有我在，它翻不出再多一页。'}},
 {d:{who:'深海海王 · 沧澜',line:'抢人姻缘的账，前任们替你来讨。深海之下，你也逃不掉。'},
  h:{who:'白甜甜',line:'王座下就这一间诊所。潮水涨到台阶前，我都在这儿。'}},
 {d:{who:'霜夜女王 · 凛',line:'永夜是我的，冰封的旧账也是。敢上来的人，先冻掉半颗心。'},
  h:{who:'顾清梨',line:'供需清单在我这儿。要烧掉旧账，先把活下去的每一分钟算清。'}},
 {d:{who:'岳父大人 · 陈镇岳',line:'「我女儿交给你了」？先把这三关过了，再谈这句话。'},
  h:{who:'温砚秋',line:'宾客名单我核过了。你敢逃席，我就替你把半阕词写完。'},
  h2:{who:'陈飞飞',line:'伴娘团我带来了！要拦人，还是要递捧花，你一句话。'}},
];
let chTalkT=null,chTalkAfter=null;   // v71b：对白收起后的回调（用来把打赏提示排在过场对白之后，避免弹层互相遮盖）
function hideChapterTalk(){const el=document.getElementById('chTalk');if(!el)return;
  el.classList.remove('show');clearTimeout(chTalkT);
  const a=chTalkAfter;chTalkAfter=null;
  if(typeof a==='function')setTimeout(a,420);}   // 等淡出动画(0.35s)结束再触发后续弹层
function chapterTalk(i,after){
  const t=CHAPTER_TALK[i%CHAPTER_TALK.length];if(!t)return;
  let el=document.getElementById('chTalk');
  if(!el){el=document.createElement('div');el.id='chTalk';
    el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    el.innerHTML='<div class="ctCard">'+
      '<button class="ctX" type="button" aria-label="关闭过场对白">✕</button>'+
      '<div class="ctRow"><span class="ctWho"></span><span class="ctLine"></span></div>'+
      '<div class="ctRow"><span class="ctWho her"></span><span class="ctLine"></span></div>'+
      '<div class="ctRow third"><span class="ctWho her"></span><span class="ctLine"></span></div>'+
      '</div>';
    el.addEventListener('click',hideChapterTalk);
    document.body.appendChild(el);}
  const rows=el.querySelectorAll('.ctRow');
  rows[0].querySelector('.ctWho').textContent=t.d.who+'：';
  rows[0].querySelector('.ctLine').textContent='「'+t.d.line+'」';
  rows[1].querySelector('.ctWho').textContent=t.h.who+'：';
  rows[1].querySelector('.ctLine').textContent='「'+t.h.line+'」';
  const r3=rows[2];
  if(r3){const q=t.h2;r3.style.display=q?'':'none';
    r3.querySelector('.ctWho').textContent=q?q.who+'：':'';
    r3.querySelector('.ctLine').textContent=q?'「'+q.line+'」':'';}
  chTalkAfter=(typeof after==='function')?after:null;
  el.classList.add('show');
  clearTimeout(chTalkT);
  chTalkT=setTimeout(hideChapterTalk,7200);}
let chapterT=240;
applyChapter(0);

// ========== v68 · 主线推进函数（把章节做成「讨债状」，而不是计时器） ==========
// 章内波次：启用原本存在但全工程无引用的 TIMELINE（死代码），每章重放一遍，
// 让每一章都有「渐进加压 → 高潮 → 收束」的节奏，而不是一成不变的匀速刷怪。
function chapterWaveTick(dt){
  if(gameMode!=='normal'||!started||!S.alive||victory)return;
  chapterClock+=dt;
  while(chapterWaveIdx<TIMELINE.length&&chapterClock>=TIMELINE[chapterWaveIdx][0]){
    const row=TIMELINE[chapterWaveIdx];chapterWaveIdx++;
    const cnt=Math.min(12,Math.max(1,Math.round(row[2]*(1+chapter*.06)*(chapterMech.spawnMul||1))));
    for(let i=0;i<cnt;i++){const e=mkEnemy(row[1]);
      e.userData.hp*=chapterMech.hp;e.userData.maxHp=e.userData.hp;
      e.userData.dmg*=1+(chapterMech.hp-1)*.6;e.userData.spd*=chapterMech.spd;}
    if(chapterWaveIdx%3===0)tip(`🌊 讨债第 ${chapterWaveIdx} 波 · 情敌加压`);}
}
// 章末讨债 Boss：清满 CHAPTER_ROOMS 间房后「强制登场」（不再等 120 秒计时），
// 而且必须是本章专属 Boss——击败它才算过章；终章则是婚宴三连战。
function storyBossBoost(b,bi){
  const u0=b&&b.userData;if(!u0)return;
  // v73：幂等——同一单位只吃一次形态强化；遭遇战形态「就地转正」时复用已生效的强化，
  //   不会把雷神叠成 1.45×1.45 的超标强度。
  if(u0.debtBoosted)return;u0.debtBoosted=true;
  if(bi===4)     {b.userData.hp*=1.45;b.userData.dmg*=1.2;}      // 第二章 · 雷神
  else if(bi===1)  {b.userData.hp*=1.9;b.userData.dmg*=1.35;b.userData.spd*=1.15;}   // 第三章 · 丈母娘
  else if(bi===2)  {b.userData.hp*=2.2;b.userData.dmg*=1.4;b.userData.spd*=1.08;}    // 第四章 · 镜像体
  else if(bi===8)  {b.userData.hp*=2.45;b.userData.dmg*=1.45;b.userData.spd*=1.1;}   // 第五章 · 深海海王
  else if(bi===9)  {b.userData.hp*=2.55;b.userData.dmg*=1.5;b.userData.spd*=1.12;}   // 第六章 · 霜夜女王
  else if(bi===11) {const st=Math.min(weddingKills,2);
    b.userData.hp*=(1+st*.28);b.userData.dmg*=(1+st*.12);b.userData.spd*=(1+st*.05);}
  b.userData.maxHp=b.userData.hp;}
function spawnStoryBoss(){
  // v72：主线门的占用判定从「场上有任何 Boss」改为「场上已有讨债形态 Boss」——
  // 于是雷暴遭遇战形态的雷神在场时，本章讨债 Boss 仍会按时登场（节奏不再被同 id 遭遇战顶掉）。
  if(!started||!S.alive||victory||debtBossAlive||chapterPhase!=='boss')return;
  const bi=bossForChapter(),bidNow=chapterBossId();
  const st=STORY[chapter%STORY.length];
  // v73：只要场上有同 id 的「遭遇战形态」（雷暴雷神、或 120 秒节奏提前来犯的同 id Boss），
  //   一律就地转正为讨债形态——不再按 dual 区分，任何章节都不会出现同 id 两只 Boss。
  const conv=findLiveTrialBoss(bidNow);
  if(conv){
    promoteBossToDebt(conv,bi);
    tip('📖 '+((BOSSES_DEF.find(x=>x.id===bidNow)||{}).n||'讨债人')+'卸下遭遇战之相，露出讨债人真身——讨债局正式开始');
    if(st)setTimeout(()=>{if(S.alive)tip(`📖 讨债人「${st.debtor}」上门：「${st.charge}」`+(st.hero?` ｜ 本章线人：${st.hero}（${st.role}）`:''));},1200);
    return;}
  bossAlive=true;debtBossAlive=true; // v72：讨债形态占用的是独立的 debt 门闩，不再是 bossAlive
  _pendingBossId=bidNow;
  const b=mkEnemy(null,true);b.userData.bossId=bidNow;_pendingBossId=null;
  markBossForm(b,'debt'); // v71c/v72：讨债形态=章末讨债 Boss 的专属身份，章门只认这一位（天气遭遇战同 id 不算过章）
  storyBossBoost(b,bi);
  bossIntro(b,(BOSSES_DEF.find(x=>x.id===bidNow)||{}).n||'讨债人');
  if(st)tip(`📖 讨债人「${st.debtor}」上门：「${st.charge}」`+(st.hero?` ｜ 本章线人：${st.hero}（${st.role}）`:''));}
// 胜利：不再看「活满 600 秒」，而是「打穿终章 · 婚宴三连战」——目标唯一、口径统一。
function triggerVictory(){
  if(victory)return;victory=true;
  VFX.bloom({color:'rgba(255,214,10,.34)',pulseCol:'rgba(255,214,10,.7)',layers:4,
    slowScale:.3,slowDur:2,text:'🏆 婚宴三关全通！',text2:'七场讨债局，你活到了最后'});
  setTimeout(()=>VFX.calm(),2400);
  // v69：终章胜利才播第 8 封信「逃出生天」。此前信件调用传入的章节号上限为 6，这封信常规永远看不到。
  showLetter(LETTERS.length-1);
  // 信件层（#letter z=16）会被弹出层（#modal z=60）盖住，故等信件淡出后再开终章抉择。
  setTimeout(()=>{if(S.alive){S.alive=false;started=false;
    if(gameMode==='normal')showFinalChoice();else showEnding();}},3800);}
// 终章抉择：把「结缘名单（给成就/称号用）」与「最终带走谁（给结局用）」彻底解耦，
// 于是同一局既能结缘多人拿「修罗场大满贯」，又能在终章收心走真结局——两套目标不再互斥。
function showFinalChoice(){
  const m=document.getElementById('modal'),c=document.getElementById('cards');
  if(!m||!c){showEnding();return;}
  const h2=m.querySelector('h2');if(h2)h2.textContent='💌 终章 · 你要带谁走？';
  c.innerHTML='';
  const mk=(ic,label,desc,val)=>{const d=document.createElement('div');d.className='card';
    d.innerHTML=`<div class="ic">${ic}</div><div><h3>${label}</h3><p>${desc}</p></div>`;
    d.onclick=()=>{m.style.display='none';S.finalChoice=val;showEnding();};
    c.appendChild(d);};
  for(const i of mates.slice()){
    const nm=(NPC_DEFS[i]&&NPC_DEFS[i].name)||('第 '+(i+1)+' 位女主');
    mk('💗',`只带 ${nm} 走`,'收心认账，只留一个人（好感满 ❤ 走真结局）','1:'+i);}
  mk('🚶','谁都不带','把所有人得罪干净，一个人走出婚宴','none');
  if(mates.length>=3)mk('👑','全都带走','修罗场大满贯——你确定扛得住？','all');
  m.style.display='flex';paused=true;}

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
  else if(r<.82){S.scum=Math.min(100,S.scum+50);tip('🎁 宝箱：心动值暴涨！按心动值条放大招！');}
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
      // v68 主线：传送门只跳房号，不跳章节——过章一律走「清满 3 房 → 章末讨债 Boss → 击败」这条唯一主线门。
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
  chapterRoom++; // v68 主线：每章固定 CHAPTER_ROOMS 间房，清满即进入「章末讨债 Boss」段
  const base=6+Math.floor(roomIdx*1.7);
  roomQuota=Math.round(base*(def.id==='curse'?1.5:def.id==='elite'?.65:def.id==='treasure'?.85:1)*(chapterMech.quota||1));
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
  // v68 主线：过章不再看时间/房数取模，而是「清满本房 → 章末讨债 Boss 登场 → 击败才算过章」。
  // 过章判定见主循环 normal 分支与 killEnemy 的章门结算；startRoom 只负责计数与让本章机制生效。
}
function showRoomBanner(i,def){
  const rb=document.getElementById('roomBar');if(!rb)return;
  rb.querySelector('.rbTag').textContent=`📖 第 ${chapter+1}/${CHAPTERS.length} 章 · 第 ${chapterRoom}/${CHAPTER_ROOMS} 房 · ${def.ic} ${def.n}`;
  {const stl=STORY[chapter];rb.querySelector('.rbSub').textContent=(stl?`讨债状：${stl.goal}`+(stl.hero?` ｜ 线人：${stl.hero}`:'')+' ｜ ':'')+def.d;}
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
 {k:'power',ic:'⚡',n:'心动力量',d:'本局伤害 +12%',cost:18,
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
      const hh=document.querySelector('#modal h2');if(hh)hh.textContent='✦ 心动秘籍 · 三选一 ✦';};
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
  const h=document.querySelector('#modal h2');if(h)h.textContent='✦ 心动秘籍 · 三选一 ✦';}
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
  // v68：章末讨债 Boss 段不出路线选择——先打完这场「讨债局」再决定走向哪间房
  if(started&&S.alive&&!victory&&roomDone&&pendingLvl<=0&&!dlgActive&&modalHidden()&&gameMode==='normal'&&chapterPhase!=='boss'){
    paused=true;showRouteChoice();}
  if(started&&!hardPause&&S.alive&&!victory&&!paused&&!dlgActive){
    S.time+=dt;
    // ---- 恋人必杀冷却 ----
    {let need=false;for(let i=0;i<loverCd.length;i++)if(loverCd[i]>0){loverCd[i]-=dt;need=true;}
     if(need)renderLoverBtns();}
    // ---- 章节切换：常规模式走「清 3 房 → 章末讨债 Boss → 击败才过章」的主线门（v68）；其余模式保留 240 秒计时 ----
    if(gameMode!=='normal'){
      chapterT-=dt;
      if(chapterT<=0){chapterT=240;applyChapter(chapter+1);
        tip(`📖 ${CHAPTERS[chapter].name} —— ${CHAPTERS[chapter].desc}`);
        showLetter(chapter,()=>chapterTalk(chapter,()=>showTipOverlay(chapter))); // 章末信件 → 过场对白 → 打赏提示（依次播放，互不遮盖）
        burst(player.position,0x4cc9f0,30,11);shake(.35);}}
    else{
      // ① 章末门：清满 3 房后强制召唤「本章讨债 Boss」（不再等 120 秒计时）
      if(S.alive&&!victory&&chapterPhase==='boss'&&!chapterBossDown&&!debtBossAlive)spawnStoryBoss(); // v72：主线门只被「讨债形态」占用
      // ② 击败讨债 Boss → 推进下一章（终章三连战全通由 killEnemy 直接判胜）
      if(chapterPhase==='boss'&&chapterBossDown&&chapter<CHAPTERS.length-1){
        chapterPhase='rooms';
        applyChapter(chapter+1);
        tip(`📖 ${CHAPTERS[chapter].name} —— ${CHAPTERS[chapter].desc}`);
        tip2(`⚙ 本章机制：${chapterMech.tag} ｜ ${(STORY[chapter]||{}).charge||''}`);
        showLetter(chapter,()=>chapterTalk(chapter,()=>showTipOverlay(chapter))); // 过场对白收尾后再弹打赏提示
        burst(player.position,0x4cc9f0,30,11);shake(.35);}
      // ③ 章内波次（启用 TIMELINE）+ 本章机制消耗（极寒/漩涡的持续掉血）
      chapterWaveTick(dt);
      if(chapterMech.drain>0&&S.hp>0){S.hp=Math.max(0,S.hp-chapterMech.drain*dt);if(S.hp<=0)gameOver();}}
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
     for(let i=0;i<npcCd.length;i++)if(npcCd[i]>0)npcCd[i]-=dt;
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
        const cnt=Math.min(enemyBudget(),Math.max(1,Math.round((2+Math.random()*3)*sc.spawnMul)));   // v69：实体硬上限，防后期失控
        for(let i=0;i<cnt;i++)mkEnemy(ty);}
    }else if(gameMode==='abyss'){
      const sc=abyssScale(S.time);
      spawnT-=dt;
      if(spawnT<=0){spawnT=1.8/sc.spawnMul;
        const kinds=['chaser','shooter','tank','bomber','swarm'];
        const ty=kinds[Math.floor(Math.random()*kinds.length)];
        const cnt=Math.min(enemyBudget(),Math.max(1,Math.round((3+Math.random()*3)*sc.spawnMul)));   // v69：实体硬上限
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
        const cnt=Math.min(enemyBudget(),Math.max(1,Math.round((2+Math.random()*2.4)*sc.spawnMul*(def.mult||1)*(D.waveMul||1)*(chapterMech.spawnMul||1))));   // v69：实体硬上限
        for(let i=0;i<cnt;i++){const e=mkEnemy(ty);
          e.userData.hp*=sc.hpMul*(chapterMech.hp||1);e.userData.maxHp=e.userData.hp;
          e.userData.dmg*=sc.dmgMul;e.userData.spd*=chapterMech.spd||1;
          if((def.elite&&Math.random()<def.elite)||(chapterMech.elite&&Math.random()<chapterMech.elite)){
            e.userData.elite=true;e.userData.hp*=2;e.userData.maxHp=e.userData.hp;applyEliteAffix(e);}}}
      if(!roomDone&&roomKills()>=roomQuota){roomDone=true;
        // v68 主线：清满本章最后一间房 → 打开章末「讨债 Boss」门（强制登场，不再等 120 秒计时）
        if(chapterRoom>=CHAPTER_ROOMS&&chapterPhase==='rooms'){chapterPhase='boss';
          tip(`📖 讨债状已清——${(STORY[chapter]||{}).debtor||'讨债人'}要上门了！`);}
        // 房间清扫：残留情敌退场（Boss 保留），碎片自动吸附——"过关"收束感
        for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(e.userData.boss)continue;
          burst(e.position,0xff4d9e,7);scene.remove(e);enemies.splice(i,1);dh2ReleaseHost(e);}
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
          markBossForm(b,'trial'); // v72：气候试炼属非主线试炼形态
          const cIdx=SAVE.bosses.chronos||0;
          b.userData.hp*=(2.9+cIdx*.35);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.5;b.userData.spd*=1.12;
          waveNum=cIdx+1;
          bossIntro(b,'🕛 四时之主 · 时序');
          tip('🕛 「四季轮转，皆有定数——而你，是变数。」');
          if(SAVE.climateBest>0)setTimeout(()=>{if(S.alive)tip(`🏅 气候试炼最高连胜：${SAVE.climateBest} 度`);},2600);
        }else{
        // 天气遭遇战 Boss（非主线 · v72 起统一标记为 trial 形态）：雷暴→雷神 / 浓雾→雾隐刺客 / 白昼→金乌 / 细雨→雨神
        const wId=WEATHERS[envWeather]&&WEATHERS[envWeather].id;
        const pId=DAY_PHASES[envPhase]&&DAY_PHASES[envPhase].id;
        const isStorm=wId==='storm',isFog=wId==='fog';
        const isSolar=(pId==='day'||pId==='dawn')&&(wId==='clear');
        const isRain=(wId==='rain');
        if(isRain){
          _pendingBossId='rain';
          const b=mkEnemy(null,true);b.userData.bossId='rain';
          _pendingBossId=null;
          markBossForm(b,'trial'); // v72：天气遭遇战一律非主线（试炼／遭遇战形态）
          const rIdx=SAVE.bosses.rain||0;
          b.userData.hp*=(1+rIdx*.2);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.12;b.userData.spd*=1.12;
          bossIntro(b,'🌧️ 雨神 · 潇湘');
          tip('🌧️ 细雨成帘，雨神踏水而来！');
        }else if(isSolar){
          _pendingBossId='solar';
          const b=mkEnemy(null,true);b.userData.bossId='solar';
          _pendingBossId=null;
          markBossForm(b,'trial'); // v72：天气遭遇战一律非主线（试炼／遭遇战形态）
          const sIdx=SAVE.bosses.solar||0;
          b.userData.hp*=(1+sIdx*.2);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.15;b.userData.spd*=1.05;
          bossIntro(b,'☀️ 金乌 · 烈日当空');
          tip('☀️ 烈日凌空，金乌蔽日！');
        }else if(isFog){
          _pendingBossId='assassin';
          const b=mkEnemy(null,true);b.userData.bossId='assassin';
          _pendingBossId=null;
          markBossForm(b,'trial'); // v72：天气遭遇战一律非主线（试炼／遭遇战形态）
          const aIdx=SAVE.bosses.assassin||0;
          b.userData.hp*=(1+aIdx*.2);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.12;b.userData.spd*=1.15;
          bossIntro(b,'🗡️ 雾隐刺客');
          tip('🌫️ 浓雾中杀机暗藏——刺客现形！');
        }else if(isStorm){
          _pendingBossId='thunder';
          const b=mkEnemy(null,true);b.userData.bossId='thunder';
          _pendingBossId=null;
          markBossForm(b,'trial'); // v72 雷神双重身份 · 遭遇战形态：与第二章章末「讨债人形态」同 id 不同身份，非主线、不计过章
          const tIdx=SAVE.bosses.thunder||0;
          b.userData.hp*=(1+tIdx*.2);b.userData.maxHp=b.userData.hp;
          b.userData.dmg*=1.15;b.userData.spd*=1.1;
          bossIntro(b,'⚡ 雷神 · 风暴主宰');
          tip('⚡ 雷暴中，雷神以「遭遇战形态」现身（非主线 · 不计过章）');
        }else{
        // v73：120 秒节奏先到一步的「本章 Boss 遭遇战形态」——它不是章末讨债 Boss，
        //   因此标记为 'trial'（不带 storyBoss）：可以提前来犯，但既不打开章门、也不顶掉主线讨债局。
        //   若玩家在它存活时清满 3 房，spawnStoryBoss() 会让它「就地转正」为讨债形态（满血）。
        //   于是「清满 3 房 → 讨债 Boss 登场 → 击败才过章」的唯一主线门依旧成立，也不会出现同 id 两只。
        const bi=bossForChapter();
        // v44：第七章三连战——Boss 由 weddingKills 决定，可能不是 bi 指向的那只
        const bidNow=chapterBossId();
        _pendingBossId=bidNow;
        const b=mkEnemy(null,true);b.userData.bossId=bidNow;
        _pendingBossId=null;
        markBossForm(b,'trial'); // v73：节奏遭遇战形态（非主线，不带 storyBoss）
        storyBossBoost(b,bi);    // v73：与章末讨债 Boss 共用同一份强化实现，杜绝两份重复梯子
        if(bi===11){const st=Math.min(weddingKills,2);
          if(st===2){b.userData.hp*=1.15;b.userData.maxHp=b.userData.hp;} // 终关额外
          waveInfoForce=`👰 婚宴第 ${st+1}/3 关`;}
        bossIntro(b,(BOSSES_DEF.find(x=>x.id===bidNow)||{}).n||'讨债人');}}}}
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
              const sb=new THREE.Mesh(G.bullet,(M.bulletSplit||(M.bulletSplit=new THREE.MeshBasicMaterial({color:0xff8fc8}))));   // v69：复用材质
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
    // ---- 胜利：v68 起常规模式以「打穿终章 · 婚宴三连战」为唯一通关条件（见 triggerVictory）。
    //      存活时间只作为成就（⏱️ 十分钟不倒）与周赛通关的判定，不再作为通关条件——目标口径由此统一。
    // ---- 相机 ----
    S.shake=Math.max(0,S.shake-dt*2);
    shakeX=(Math.random()-.5)*S.shake;shakeY=(Math.random()-.5)*S.shake;
  }
  const tgt=player.position;
  const camZ=F.zoomTarget>0||F.bossIntro>0?4.1:3.58;
  const camY=F.bossIntro>0?5.8:5.62;
  const lerp=Math.max(F.bossIntro>0?.14:.1,F.zoomT>0?.1:.1);
  camera.position.lerp(new THREE.Vector3(tgt.x+shakeX,tgt.y+camY+shakeY,tgt.z+camZ),lerp);
  camera.lookAt(tgt.x,tgt.y,tgt.z-1.05);
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
    // v68：常规模式 HUD 常驻显示「第几章 / 本章第几房」——玩家一眼看得到主线目标
    wi.textContent=(started&&roomQuota>0)
      ?(chapterPhase==='boss'
        ?`📖${chapter+1}/${CHAPTERS.length}·👑讨债人现身·💗${runCoins}·${mm}:${ss}`
        :`📖${chapter+1}/${CHAPTERS.length}·🏠${Math.min(roomKills(),roomQuota)}/${roomQuota}·💗${runCoins}·${mm}:${ss}`)
      :`📖${chapter+1}/${CHAPTERS.length}·${mm}:${ss}·击杀${S.kills}`;}
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
  // 心动值满槽时的粉色脉冲边缘（紧张感）
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
  S.hp-=real;sfx.hurt();shake(.3);vib(18);   // v69：受击震动反馈
  burst(player.position,0xff4d6d,8,6);
  S.scum=Math.min(100,S.scum+4); // 挨打也攒心动值（绝地反击）
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
document.getElementById('startBtn').addEventListener('click',function startRunHandler(){
  // 重置
  for(const arr of[enemies,bullets,eBullets,orbs,teles,mists,npcs,chests,clones,stools])for(const e of arr)scene.remove(e);   // v69：补 stools，避免跨局残留
  chests.length=0;challenge=null;challengeT=55;chestT=40;
  chapterT=240;applyChapter(0);
  // 昼夜/天气初始化（每日挑战与深渊由 cfg 固定）
  dayT=0;envPhase=0;envWeather=0;envWeatherT=18;envApply();
  ownedDrops={};SAVE.setSeen={};
  for(const f of followers)scene.remove(f.g);
  followers.length=0;mates.length=0;npcStage.fill(0);
  affinity.fill(0);dates.fill(0);npcCd=[30,36,42,48,34,40,36,44];npcTimer=14;
  loverCd.fill(0);npcLoverDone.fill(false);
  if(npcLoverDone)npcLoverDone.fill(false);renderMates();renderAff();renderLoverBtns();
  document.getElementById('dlg').style.display='none';dlgActive=false;
  [enemies,bullets,eBullets,orbs,teles,mists,npcs,stools].forEach(a=>a.length=0); // v44：含家法板凳
  for(const p of parts)scene.remove(p);parts.length=0;
  Object.assign(S,{hp:100,maxHp:100,scum:0,xp:0,xpNeed:10,lvl:1,kills:0,time:0,alive:true,over:false,
    spd:8.2,dmgMul:1,cdMul:1,pickR:2.6,armor:0,regen:0,critC:.08,dashT:0,dashCd:0,dashing:0,ultT:0,hitCd:0,shake:0,
    hurtReduce:0,dashCdMax:6,bossDmgMul:1,xpMul:1,slowT:0,flowWin:0,finalChoice:null});
  delete S.__fateBase; // v41：清掉上局的天赋基线快照，本局重新快照
  resetAffixSets();    // v47：清掉上局装备的词条 / 套装激活状态
  S.setWarSplash=false;S.setFlowDash=false;S.setLifeAbsorb=false;S._warSplashFx=-9; // v47：套装满级开关复位
  // ---- 跨局继承：转世加成 + 好感延续 ----
  S.dmgMul=1+(SAVE.realmBonus||0);
  S.spd=8.2+Math.min(6,(SAVE.best.lvl||1)-1)*.05;
  for(let i=0;i<NPC_DEFS.length;i++){affinity[i]=SAVE.affinity[i]||0;dates[i]=SAVE.dates[i]||0;}
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
  syncOrbits();player.position.set(0,0,0);waveIdx=0;bossAlive=false;debtBossAlive=false;victory=false;pendingLvl=0;
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
  // 签到累积奖励（玫瑰/心动值/全属性）
  {const ci=SAVE.checkin||{};
   const parts=[];
   if(ci.bonusRose){W.orbit.lv=Math.max(W.orbit.lv,2);syncOrbits();parts.push('玫瑰Lv.2');}
   if(ci.bonusScum){S.scum=Math.min(100,S.scum+ci.bonusScum);parts.push('心动值+'+ci.bonusScum);}
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
  else{setTimeout(()=>showLetter(0,()=>chapterTalk(0)),400);}
  tip(gameMode==='endless'?'👑 无尽挑战 · 首脑轮番来袭！':'📖 第一章 · 初恋校园 · 讨债状：清 3 房，打散讨债军团！');});
// ---------- 新手引导（仅首局出现） ----------
const TUT_STEPS=[
 {t:'🎮 <b>移动</b>：按住屏幕左下角拖动，虚拟摇杆控制方向',hl:'joy'},
 {t:'⚔️ <b>攻击全自动</b>：不用按攻击键，角色自动打击靠近的情敌',hl:null},
 {t:'💨 <b>冲刺</b>：点右下角 💨 或双击屏幕闪避，冲刺有冷却但能穿过弹幕',hl:'dashBtn'},
 {t:'😈 <b>心动值绝技</b>：击杀攒满顶部粉条，点它释放「终极·修罗场」全场魅惑',hl:'scumBar'},
 {t:'📖 <b>主线</b>：每章清 3 间房 → 章末「讨债 Boss」登场 → 击败它才进下一章；打穿第七章的婚宴三连战，再决定带谁走！',hl:null},
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
  setTimeout(()=>showLetter(0,()=>chapterTalk(0)),400);}
document.getElementById('tutNext').onclick=nextTut;
document.getElementById('tutSkip').onclick=()=>endTut(true);

// ---------- 启动初始化：加载存档 + 每日挑战 + 开始界面沿用 ----------
loadSet();            // v69：先载入玩家设置（音量 / 画质档 / 震动）
bindPauseMenu();      // v69：绑定暂停 & 设置面板
loadSave();refreshSaveUI();rollDaily();applyDailyMods();rollWeek();
applyQuality(); // 应用初始画质档
if(SET.qual!=='auto')setQualityLevel(SET.qual); // v69：玩家上次手动选的画质档优先于自适应
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
/* ---------- v73：关于 / 隐私与打赏说明（合规知情入口） ---------- */
function closeAbout(){const o=document.getElementById('aboutOv');if(!o)return;o.classList.remove('on');o.style.display='none';}
function openAbout(){
  const pn=document.getElementById('morePanel');if(pn)pn.classList.remove('open');
  const mb=document.getElementById('moreBtn');
  if(mb){mb.classList.remove('open');mb.textContent='▾ 签到 · 分享码 · 点数兑换';}
  const o=document.getElementById('aboutOv');if(!o)return;o.classList.add('on');o.style.display='flex';}
(function bindAbout(){
  const b=document.getElementById('aboutBtn'),cl=document.getElementById('aboutClose'),pa=document.getElementById('pmAbout'),o=document.getElementById('aboutOv');
  if(!o)return;
  if(b)b.onclick=openAbout;if(pa)pa.onclick=openAbout;if(cl)cl.onclick=closeAbout;
  o.addEventListener('click',e=>{if(e.target===o)closeAbout();});
})();
/* ---------- v73：存档迁移（导出 / 导入存档码；换机或清缓存前先备份） ---------- */
(function bindSaveIO(){
  const ta=document.getElementById('saveIOTxt'),ex=document.getElementById('saveExp'),im=document.getElementById('saveImp');
  if(!ex||!im)return;
  const PFX='ZNTX-SAVE-';
  const enc=s=>{const b=new TextEncoder().encode(s);let o='',C=8192;
    for(let i=0;i<b.length;i+=C)o+=String.fromCharCode.apply(null,b.subarray(i,i+C));return btoa(o);};
  const dec=s=>{const bin=atob(s),u=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new TextDecoder('utf-8').decode(u);};
  const usable=v=>{try{const o=JSON.parse(v);return !!(o&&typeof o==='object'&&!Array.isArray(o)&&('schemaVer' in o)&&o.best&&Array.isArray(o.affinity));}catch(e){return false;}};
  ex.onclick=()=>{try{
    const code=PFX+enc(JSON.stringify(SAVE));
    if(ta)ta.value=code;
    const say=ok=>tip(ok?'💾 存档码已生成并复制到剪贴板，请妥善保存':'💾 存档码已生成，请长按文本框复制保存');
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(code).then(()=>say(true)).catch(()=>say(false));
      else say(false);
    }catch(x){say(false);}
  }catch(e){tip('❌ 存档码生成失败');}};
  im.onclick=()=>{
    const v=((ta&&ta.value)||'').replace(/\s+/g,'');
    if(!v){tip('请先粘贴存档码');return;}
    if(v.indexOf(PFX)!==0){tip('❌ 存档码格式不对（应以 '+PFX+' 开头）');return;}
    let obj=null;try{obj=JSON.parse(dec(v.slice(PFX.length)));}catch(e){obj=null;}
    if(!usable(JSON.stringify(obj))){tip('❌ 存档码无法解析或不是本作的存档');return;}
    if(!confirm('导入会覆盖本机当前存档（境界 / 好感 / 图鉴 / 成就 / 章节进度），确定继续吗？'))return;
    try{
      const fv=(typeof obj.schemaVer==='number')?obj.schemaVer:0;
      let s=Object.assign({},DEFAULT_SAVE,obj);
      s=migrateSave(s,fv);s=guardSchema(s);
      SAVE=s;writeSave();tip('✅ 存档已导入，正在重新载入…');
      setTimeout(()=>location.reload(),700);}catch(e){tip('❌ 导入失败，已保留原存档');}};
})();
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
    ov.querySelector('h1').textContent='心 动 狂 潮';
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
  cloudOn:false,   // v73：云端社交默认关闭（第三方 CDN SDK 已移除），本作 100% 自包含；如需启用请置 true 并恢复 SDK 脚本
  publishableKey:'wbpk_3SDxEj1w1Ea4duwTnHU6mc_o6E4sgN4cwQh0E64sjAgvcPC7JsxZjXt'};
let cloud=null,cloudOn=false,socSess=null,socMe=null,socBoardCache=null,socFriendsCache=null,socGuildCache=undefined,socTab='board';
(function(){try{
  if(!WBCFG.cloudOn){console.warn('[SOC] 云端社交已关闭（自包含离线版）：第三方 SDK 依赖已移除；如需启用请设 WBCFG.cloudOn=true 并恢复 SDK 脚本');return;}
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
  const nm=SAVE.socName||('心动'+Math.floor(1000+Math.random()*9000));
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
  if(!cloudOn)return;   // v73：云端关闭时直接返回（原先缺云可用性前置，离线点按会抛错）
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
// ========== v69：健壮性加固 ==========
// ① 全局错误兜底：任何未捕获异常 / 未处理的 Promise 拒绝都不再静默白屏
let __errShown=0;
function __reportErr(msg,src){
  try{console.warn('[心动狂潮] 已兜底异常:',msg,src||'');}catch(e){}
  if(__errShown>=3)return;__errShown++;
  try{tip('⚠️ 出现异常，已自动兜底：'+String(msg||'').slice(0,60));}catch(e){}
  if(!window.__GAME_READY__){
    try{const b=document.getElementById('__boot');
      if(b)b.innerHTML='<div class="bl">⚠️</div><div class="bt">启动未完成</div>'+
        '<div class="be">'+String(msg||'').slice(0,120)+'<br>请刷新重试；若反复出现，请把机型反馈给作者。</div>'+
        '<button class="bk" onclick="location.reload()">重新加载</button>';}catch(e){}
  }
}
addEventListener('error',function(e){__reportErr((e&&e.message)||'脚本错误',(e&&e.filename)||'');});
addEventListener('unhandledrejection',function(e){
  const r=e&&e.reason;__reportErr('异步异常 '+((r&&(r.message||r))||''),'');});
// ② WebGL 上下文丢失 / 恢复：移动端切后台被系统回收显存时不再表现为「游戏卡死黑屏」
(function(){
  const cv=renderer&&renderer.domElement;if(!cv)return;
  cv.addEventListener('webglcontextlost',function(e){
    e.preventDefault();
    try{hardPause=true;paused=true;
      const pb=document.getElementById('pauseBtn');if(pb)pb.textContent='▶';
      tip('⚠️ 图形上下文中断，正在恢复…');}catch(x){}},false);
  cv.addEventListener('webglcontextrestored',function(){
    try{applyQuality();tip('✅ 图形上下文已恢复，继续游戏即可');}catch(x){}},false);
})();
// ③ 内存自检：粒子 / 实体池随局数增长时给出一次可操作提示（不打断游戏）
let __memWarned=false;
setInterval(function(){
  if(__memWarned||!started)return;
  if(parts.length>=MAX_PARTS*.9||enemies.length>=MAX_ENEMIES*.9){
    __memWarned=true;tip('📱 场面过大，已自动限制特效数量以保流畅');}
},15000);

socBoot();
loop();

;(function(){try{bindTipEntry();window.__GAME_READY__=1;}catch(e){}})();
