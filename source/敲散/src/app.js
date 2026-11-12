(function(){
'use strict';

/* ============================================================
   0. 工具
   ============================================================ */
const $ = s => document.querySelector(s);
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const rand = (a,b) => a + Math.random()*(b-a);
const lerp = (a,b,t) => a+(b-a)*t;
function rgba(hex,a){
  const n = parseInt(hex.slice(1),16);
  return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
}
function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; const t=arr[i];arr[i]=arr[j];arr[j]=t; }
  return arr;
}
const store = (window.QS && window.QS.store) ? window.QS.store : {
  get(k,d){ try{ const v=localStorage.getItem('yt_'+k); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem('yt_'+k, JSON.stringify(v)); }catch(e){} }
};

/* 运行环境：桌面（精细指针 + 悬浮）还是移动端 */
const IS_DESK = (()=>{
  try {
    if ('ontouchstart' in window) return false;
    return window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  } catch(e){ return false; }
})();
if (IS_DESK) document.documentElement.classList.add('desk');

/* ============================================================
   1. 内容池
   ============================================================ */
const THEMES = {
  commute:{
    name:'通勤烦事', mode:'text',
    items:['加班','迟到','KPI','挤','困','烦','堵','开会','改稿','早八','末班车','甲方']
  },
  burnout:{
    name:'内耗清单', mode:'text',
    items:['焦虑','内耗','emo','失眠','拖延','比较','社交','疲惫','想太多','自我怀疑']
  },
  bugs:{
    name:'打虫子', mode:'emoji',
    items:['🦟','🐜','🪳','🐛','🕷️','🪰','🐌','🐞'],
    fallback:['蚊','蚁','蟑','虫','蛛','蝇']
  },
  patterns:{
    name:'小人·动植物', mode:'emoji',
    items:['🤬','🐱','🐰','🦆','🐠','🌵','🍄','🌸','⚡','😤'],
    fallback:['man','cat','rabbit','bird','fish','cactus','mushroom','flower','bolt','man']
  },
  faces:{
    name:'臭脸', mode:'emoji',
    items:['😤','😩','🤯','😑','🥱','😖','🙄','😮\u200d💨'],
    fallback:['怒','丧','炸','呆','困','苦']
  },
  diy:{ name:'自定义', mode:'auto', items:[] },
  pals:{ name:'森林伙伴', mode:'gallery', items:[] },
  items:{ name:'万物图鉴', mode:'gallery', items:[] }
};
const PHRASES = ['今天也辛苦了','都敲散了','这一站，轻一点','烦恼已碎，请下车','你比泡泡结实'];
const MARKS = ['草','切','淦','啧','啪','哎','哈','嗤','咔'];
const PALETTE = [
  {h:264, c1:'#a99bff', c2:'#6a4dff'},
  {h:188, c1:'#6feadf', c2:'#1e93ad'},
  {h:330, c1:'#ff93c4', c2:'#d93c85'},
  {h:38,  c1:'#ffc57e', c2:'#d9761f'},
  {h:214, c1:'#82bcff', c2:'#2f6fe0'},
  {h:150, c1:'#8ef0b0', c2:'#26a269'}
];
const HARD = { easy:{mul:0.70}, normal:{mul:1.0}, hard:{mul:1.40} };
/* 字效字号倍率 */
const MARK_SIZE = { s:0.72, m:1.0, l:1.32, xl:1.68 };

/* ============================================================
   1.2 烦恼雨：难度 / 背景主题 / 形状池
   ============================================================ */
const DIFF = {
  chill:  { name:'悠闲', speed:0.60, spawn:1.34, hp:0.85, max:4, lives:4 },
  normal: { name:'标准', speed:1.00, spawn:0.98, hp:1.00, max:6, lives:3 },
  frenzy: { name:'狂潮', speed:1.58, spawn:0.72, hp:1.22, max:7, lives:2 }
};
const SHAPES = ['bubble','rounded','hex','star','heart'];
const BG_SETS = {
  chill:  ['dusk','mist','aurora'],
  normal: ['cyber','neon','deep'],
  frenzy: ['lava','inferno','toxic']
};
const BG = {
  neon:  {a:'#151233',b:'#0d0b20',c:'#070510',
          g1:'rgba(120,88,255,0.30)',g2:'rgba(45,210,196,0.16)',g3:'rgba(255,86,160,0.13)',
          gv:'rgba(140,110,255,0.5)',gt:'rgba(80,230,215,0.42)',gp:'rgba(255,120,180,0.35)',
          deco:'grid',decoC:'rgba(140,120,255,0.055)'},
  cyber: {a:'#0b1c2e',b:'#06111d',c:'#03070e',
          g1:'rgba(40,150,255,0.28)',g2:'rgba(60,235,215,0.18)',g3:'rgba(255,70,190,0.13)',
          gv:'rgba(60,150,255,0.5)',gt:'rgba(60,235,215,0.42)',gp:'rgba(255,80,200,0.32)',
          deco:'grid',decoC:'rgba(60,200,255,0.06)'},
  deep:  {a:'#0d1032',b:'#080a1e',c:'#04030e',
          g1:'rgba(90,80,255,0.26)',g2:'rgba(120,90,255,0.16)',g3:'rgba(40,200,255,0.12)',
          gv:'rgba(110,90,255,0.5)',gt:'rgba(80,180,255,0.4)',gp:'rgba(160,110,255,0.32)',
          deco:'stars',decoC:'rgba(200,210,255,0.35)'},
  dusk:  {a:'#2b1731',b:'#190e23',c:'#0a0511',
          g1:'rgba(255,120,180,0.26)',g2:'rgba(255,180,120,0.13)',g3:'rgba(150,110,255,0.14)',
          gv:'rgba(255,130,190,0.45)',gt:'rgba(255,190,140,0.35)',gp:'rgba(160,120,255,0.32)',
          deco:'bokeh',decoC:'rgba(255,180,220,0.10)'},
  mist:  {a:'#1b2c34',b:'#101d25',c:'#070d13',
          g1:'rgba(120,220,220,0.20)',g2:'rgba(180,200,255,0.14)',g3:'rgba(255,200,220,0.10)',
          gv:'rgba(120,225,220,0.4)',gt:'rgba(170,200,255,0.34)',gp:'rgba(255,200,220,0.28)',
          deco:'bokeh',decoC:'rgba(200,240,240,0.09)'},
  aurora:{a:'#10263a',b:'#0a1728',c:'#050810',
          g1:'rgba(80,255,200,0.22)',g2:'rgba(140,110,255,0.22)',g3:'rgba(255,120,200,0.12)',
          gv:'rgba(80,255,200,0.42)',gt:'rgba(140,110,255,0.42)',gp:'rgba(255,120,200,0.3)',
          deco:'stars',decoC:'rgba(180,255,240,0.32)'},
  lava:  {a:'#2e1015',b:'#1b0811',c:'#0b0409',
          g1:'rgba(255,86,60,0.32)',g2:'rgba(255,170,60,0.17)',g3:'rgba(180,40,120,0.16)',
          gv:'rgba(255,90,60,0.5)',gt:'rgba(255,175,70,0.42)',gp:'rgba(200,50,130,0.34)',
          deco:'embers',decoC:'rgba(255,150,80,0.5)'},
  inferno:{a:'#36110a',b:'#1f0805',c:'#0c0303',
          g1:'rgba(255,140,40,0.32)',g2:'rgba(255,60,60,0.18)',g3:'rgba(120,20,90,0.16)',
          gv:'rgba(255,150,50,0.5)',gt:'rgba(255,70,70,0.42)',gp:'rgba(140,30,110,0.34)',
          deco:'embers',decoC:'rgba(255,120,60,0.55)'},
  toxic: {a:'#10271c',b:'#0a1a13',c:'#050c09',
          g1:'rgba(140,255,120,0.20)',g2:'rgba(60,255,200,0.17)',g3:'rgba(200,255,60,0.12)',
          gv:'rgba(150,255,120,0.42)',gt:'rgba(60,255,200,0.4)',gp:'rgba(200,255,80,0.3)',
          deco:'embers',decoC:'rgba(170,255,140,0.45)'}
};
function randomShape(){
  return SHAPES[(Math.random()*SHAPES.length)|0];
}
function bgKeyFor(){
  if (S.gameMode !== 'rain') return 'neon';
  const set = BG_SETS[S.diff] || BG_SETS.normal;
  return set[(Math.max(1, S.rain.level) - 1) % set.length];
}

/* ============================================================
   1.5 内置矢量图案（无 emoji 字体也能显示的小人 / 动植物）
   ============================================================ */
const ICONS = {
  man(g,s){
    g.save(); g.strokeStyle='#fff'; g.fillStyle='#fff';
    g.lineWidth=s*0.11; g.lineCap='round'; g.lineJoin='round';
    g.beginPath(); g.arc(0,-s*0.45,s*0.30,0,6.283); g.stroke();
    g.beginPath(); g.moveTo(-s*0.18,-s*0.53); g.lineTo(-s*0.06,-s*0.47); g.stroke();
    g.beginPath(); g.moveTo(s*0.18,-s*0.53); g.lineTo(s*0.06,-s*0.47); g.stroke();
    g.beginPath(); g.arc(0,-s*0.32,s*0.10,0.15*Math.PI,0.85*Math.PI); g.stroke();
    g.beginPath(); g.moveTo(0,-s*0.15); g.lineTo(0,s*0.35); g.stroke();
    g.beginPath(); g.moveTo(0,-s*0.06); g.lineTo(-s*0.44,-s*0.26); g.stroke();
    g.beginPath(); g.moveTo(0,-s*0.06); g.lineTo(s*0.46,-s*0.44); g.stroke();
    g.beginPath(); g.moveTo(0,s*0.35); g.lineTo(-s*0.32,s*0.85); g.stroke();
    g.beginPath(); g.moveTo(0,s*0.35); g.lineTo(s*0.32,s*0.85); g.stroke();
    g.restore();
  },
  cat(g,s){
    g.save(); g.strokeStyle='#fff'; g.fillStyle='#fff';
    g.lineWidth=s*0.09; g.lineCap='round'; g.lineJoin='round';
    g.beginPath(); g.arc(0,s*0.12,s*0.58,0,6.283); g.stroke();
    g.beginPath(); g.moveTo(-s*0.50,-s*0.10); g.lineTo(-s*0.36,-s*0.62); g.lineTo(-s*0.04,-s*0.36); g.stroke();
    g.beginPath(); g.moveTo(s*0.50,-s*0.10); g.lineTo(s*0.36,-s*0.62); g.lineTo(s*0.04,-s*0.36); g.stroke();
    g.beginPath(); g.arc(-s*0.22,s*0.04,s*0.055,0,6.283); g.fill();
    g.beginPath(); g.arc(s*0.22,s*0.04,s*0.055,0,6.283); g.fill();
    g.beginPath(); g.arc(0,s*0.36,s*0.13,0.2*Math.PI,0.8*Math.PI); g.stroke();
    g.lineWidth=s*0.05;
    g.beginPath(); g.moveTo(-s*0.66,s*0.20); g.lineTo(-s*0.32,s*0.26); g.stroke();
    g.beginPath(); g.moveTo(s*0.66,s*0.20); g.lineTo(s*0.32,s*0.26); g.stroke();
    g.restore();
  },
  rabbit(g,s){
    g.save(); g.strokeStyle='#fff'; g.fillStyle='#fff';
    g.lineWidth=s*0.09; g.lineCap='round'; g.lineJoin='round';
    g.beginPath(); g.ellipse(-s*0.26,-s*0.58,s*0.14,s*0.36,-0.18,0,6.283); g.stroke();
    g.beginPath(); g.ellipse(s*0.26,-s*0.58,s*0.14,s*0.36,0.18,0,6.283); g.stroke();
    g.beginPath(); g.arc(0,s*0.20,s*0.52,0,6.283); g.stroke();
    g.beginPath(); g.arc(-s*0.20,s*0.12,s*0.05,0,6.283); g.fill();
    g.beginPath(); g.arc(s*0.20,s*0.12,s*0.05,0,6.283); g.fill();
    g.beginPath(); g.arc(0,s*0.36,s*0.11,0.15*Math.PI,0.85*Math.PI); g.stroke();
    g.beginPath(); g.moveTo(0,s*0.36); g.lineTo(0,s*0.48); g.stroke();
    g.restore();
  },
  bird(g,s){
    g.save(); g.strokeStyle='#fff'; g.fillStyle='#fff';
    g.lineWidth=s*0.09; g.lineCap='round'; g.lineJoin='round';
    g.beginPath(); g.arc(-s*0.05,s*0.08,s*0.52,0,6.283); g.stroke();
    g.beginPath(); g.moveTo(s*0.42,-s*0.06); g.lineTo(s*0.74,s*0.04); g.lineTo(s*0.42,s*0.16); g.closePath(); g.fill();
    g.beginPath(); g.arc(s*0.10,-s*0.10,s*0.055,0,6.283); g.fill();
    g.beginPath(); g.arc(-s*0.42,s*0.10,s*0.24,0.5,3.4); g.stroke();
    g.beginPath(); g.moveTo(-s*0.10,s*0.60); g.lineTo(-s*0.10,s*0.86); g.stroke();
    g.beginPath(); g.moveTo(s*0.14,s*0.60); g.lineTo(s*0.14,s*0.86); g.stroke();
    g.restore();
  },
  fish(g,s){
    g.save(); g.strokeStyle='#fff'; g.fillStyle='#fff';
    g.lineWidth=s*0.09; g.lineCap='round'; g.lineJoin='round';
    g.beginPath(); g.ellipse(-s*0.06,0,s*0.56,s*0.38,0,0,6.283); g.stroke();
    g.beginPath(); g.moveTo(s*0.48,0); g.lineTo(s*0.82,-s*0.30); g.lineTo(s*0.82,s*0.30); g.closePath(); g.stroke();
    g.beginPath(); g.arc(-s*0.34,-s*0.06,s*0.055,0,6.283); g.fill();
    g.beginPath(); g.arc(0,0,s*0.20,-0.9,0.9); g.stroke();
    g.restore();
  },
  cactus(g,s){
    g.save(); g.strokeStyle='#fff';
    g.lineWidth=s*0.16; g.lineCap='round';
    g.beginPath(); g.moveTo(0,-s*0.85); g.lineTo(0,s*0.75); g.stroke();
    g.beginPath(); g.moveTo(-s*0.42,-s*0.10); g.lineTo(-s*0.42,-s*0.42); g.stroke();
    g.beginPath(); g.moveTo(-s*0.42,-s*0.10); g.lineTo(0,-s*0.10); g.stroke();
    g.beginPath(); g.moveTo(s*0.42,s*0.05); g.lineTo(s*0.42,-s*0.28); g.stroke();
    g.beginPath(); g.moveTo(s*0.42,s*0.05); g.lineTo(0,s*0.05); g.stroke();
    g.lineWidth=s*0.04;
    g.beginPath(); g.moveTo(-s*0.10,-s*0.55); g.lineTo(-s*0.22,-s*0.60); g.stroke();
    g.beginPath(); g.moveTo(s*0.10,-s*0.30); g.lineTo(s*0.22,-s*0.36); g.stroke();
    g.restore();
  },
  mushroom(g,s){
    g.save(); g.strokeStyle='#fff'; g.fillStyle='#fff';
    g.lineWidth=s*0.09; g.lineCap='round';
    g.beginPath(); g.arc(0,-s*0.10,s*0.62,Math.PI,0); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(-s*0.22,-s*0.10); g.lineTo(-s*0.18,s*0.70); g.stroke();
    g.beginPath(); g.moveTo(s*0.22,-s*0.10); g.lineTo(s*0.18,s*0.70); g.stroke();
    g.beginPath(); g.moveTo(-s*0.18,s*0.70); g.lineTo(s*0.18,s*0.70); g.stroke();
    g.beginPath(); g.arc(-s*0.24,-s*0.38,s*0.07,0,6.283); g.fill();
    g.beginPath(); g.arc(s*0.14,-s*0.52,s*0.055,0,6.283); g.fill();
    g.restore();
  },
  flower(g,s){
    g.save(); g.strokeStyle='#fff'; g.fillStyle='#fff';
    g.lineWidth=s*0.08;
    for (let i=0;i<5;i++){
      const a = -Math.PI/2 + i*(Math.PI*2/5);
      g.beginPath(); g.arc(Math.cos(a)*s*0.42, Math.sin(a)*s*0.42, s*0.24, 0, 6.283); g.stroke();
    }
    g.beginPath(); g.arc(0,0,s*0.16,0,6.283); g.fill();
    g.restore();
  },
  bolt(g,s){
    g.save(); g.fillStyle='#fff';
    g.beginPath();
    g.moveTo(s*0.18,-s*0.85); g.lineTo(-s*0.36,s*0.10); g.lineTo(-s*0.04,s*0.10);
    g.lineTo(-s*0.18,s*0.85); g.lineTo(s*0.36,-s*0.10); g.lineTo(s*0.04,-s*0.10);
    g.closePath(); g.fill();
    g.restore();
  }
};

/* ============================================================
   2. 状态
   ============================================================ */
const S = {
  mode:'intro',
  bubbles:[], parts:[], ghosts:[], rings:[], marks:[],
  items:[], phrase:'', rline:'',
  count: store.get('count',0),
  theme: store.get('theme','commute'),
  qty: store.get('qty', 5),
  trigger: store.get('trigger','tap'),
  hard: store.get('hard','normal'),
  pack: store.get('pack','bubble'),
  vib: store.get('vib', true),
  snd: store.get('snd', true),
  diy: store.get('diy', ['甲方','加班','早八']),
  markWords: store.get('markWords', MARKS.slice()),
  markSize: store.get('markSize','m'),
  shape: store.get('shape','bubble'),
  sizeVar: clamp(parseFloat(store.get('sizeVar',0)) || 0, 0, 0.4),
  entrance: store.get('entrance','mix'),
  burst: store.get('burst','mix'),
  stats: Object.assign({rounds:0,pops:0,taps:0,bestCombo:0}, store.get('stats',{})),
  picData: store.get('picData', []),
  pics: [],
  gameMode: store.get('gameMode','zen'),
  diff: store.get('diff','normal'),
  cloudRank: store.get('cloudRank', false) === true,
  wx: store.get('wx', true) !== false,
  board: store.get('board', []),
  rain: {
    active:false, score:0, pops:0, bursts:0, lives:3, level:1, miss:0,
    chain:0, chainT:0, maxChain:0, spawnT:0, elapsed:0, rank:0, best:false,
    weather:0, heat:0, taps:[], missHeat:0, drops:[], bolt:null, wT:0, nextBolt:0, chipT:0
  },
  scores: [],
  combo: 0, lastHitT: 0, comboUntil: 0,
  boltFlash: 0,
  shakeAmp: 0, flash: 0,
  hover: null,
  cardUrl:'',
  tapCount: 0
};

/* ============================================================
   3. 画布
   ============================================================ */
const cv = $('#scene');
const ctx = cv.getContext('2d', {alpha:false});
let W=0, H=0, DPR=1, bgCanvas=null, glowV=null, glowT=null, glowP=null;

function resize(){
  W = Math.round(innerWidth); H = Math.round(innerHeight);
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  cv.style.width = W+'px'; cv.style.height = H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  buildBackdrop(bgKeyFor());
  if (S.bubbles.length && !S.rain.active) placeBubbles();
}

let noiseCanvas = null;
function noiseTile(size, alpha){
  if (noiseCanvas) return noiseCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size,size);
  for (let i=0;i<img.data.length;i+=4){
    const v = (Math.random()*255)|0;
    img.data[i]=v; img.data[i+1]=v; img.data[i+2]=v; img.data[i+3]=alpha;
  }
  g.putImageData(img,0,0);
  noiseCanvas = c;
  return c;
}
function radialGlow(color,size){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
  rg.addColorStop(0,color);
  rg.addColorStop(0.5,color.replace(/[\d.]+\)$/,'0.32)'));
  rg.addColorStop(1,color.replace(/[\d.]+\)$/,'0)'));
  g.fillStyle = rg; g.fillRect(0,0,size,size);
  return c;
}
const GLOW_CACHE = {};
function glowOf(hex){
  if (!GLOW_CACHE[hex]) GLOW_CACHE[hex] = radialGlow(rgba(hex,0.55),128);
  return GLOW_CACHE[hex];
}

function buildBackdrop(key){
  const p = BG[key] || BG.neon;
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.round(W*DPR); bgCanvas.height = Math.round(H*DPR);
  const g = bgCanvas.getContext('2d');
  g.setTransform(DPR,0,0,DPR,0,0);

  const lg = g.createLinearGradient(W*0.15,0,W*0.85,H);
  lg.addColorStop(0,p.a); lg.addColorStop(0.42,p.b); lg.addColorStop(1,p.c);
  g.fillStyle = lg; g.fillRect(0,0,W,H);

  const g1 = g.createRadialGradient(W*0.18,H*0.14,0,W*0.18,H*0.14,Math.max(W,H)*0.62);
  g1.addColorStop(0,p.g1); g1.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = g1; g.fillRect(0,0,W,H);

  const g2 = g.createRadialGradient(W*0.88,H*0.78,0,W*0.88,H*0.78,Math.max(W,H)*0.52);
  g2.addColorStop(0,p.g2); g2.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = g2; g.fillRect(0,0,W,H);

  const g3 = g.createRadialGradient(W*0.55,H*1.02,0,W*0.55,H*1.02,Math.max(W,H)*0.42);
  g3.addColorStop(0,p.g3); g3.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = g3; g.fillRect(0,0,W,H);

  // 主题装饰：网格 / 星点 / 光斑 / 飞燼
  if (p.deco === 'grid'){
    g.strokeStyle = p.decoC; g.lineWidth = 1;
    const step = Math.max(46, Math.round(Math.min(W,H)/13));
    for (let x=0; x<W; x+=step){
      g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke();
    }
    for (let y=0; y<H; y+=step){
      g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke();
    }
  } else if (p.deco === 'stars'){
    const n = Math.round((W*H)/9000);
    for (let i=0;i<n;i++){
      const x = Math.random()*W, y = Math.random()*H, r = Math.random()*1.5+0.3;
      g.globalAlpha = 0.25 + Math.random()*0.65;
      g.fillStyle = p.decoC;
      g.beginPath(); g.arc(x,y,r,0,6.283); g.fill();
    }
    g.globalAlpha = 1;
  } else if (p.deco === 'bokeh'){
    for (let i=0;i<9;i++){
      const x = Math.random()*W, y = Math.random()*H, r = Math.min(W,H)*(0.06+Math.random()*0.16);
      const bg = g.createRadialGradient(x,y,0,x,y,r);
      bg.addColorStop(0,p.decoC); bg.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle = bg; g.fillRect(x-r,y-r,r*2,r*2);
    }
  } else if (p.deco === 'embers'){
    const n = Math.round((W*H)/12000);
    for (let i=0;i<n;i++){
      const x = Math.random()*W, y = Math.random()*H, r = Math.random()*1.8+0.4;
      g.globalAlpha = 0.15 + Math.random()*0.55;
      g.fillStyle = p.decoC;
      g.beginPath(); g.arc(x,y,r,0,6.283); g.fill();
    }
    g.globalAlpha = 1;
  }

  g.globalAlpha = 0.42;
  g.fillStyle = g.createPattern(noiseTile(128,13),'repeat');
  g.fillRect(0,0,W,H);
  g.globalAlpha = 1;

  const vg = g.createRadialGradient(W*0.5,H*0.44,Math.min(W,H)*0.22,W*0.5,H*0.5,Math.max(W,H)*0.86);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.62)');
  g.fillStyle = vg; g.fillRect(0,0,W,H);

  glowV = radialGlow(p.gv,160);
  glowT = radialGlow(p.gt,160);
  glowP = radialGlow(p.gp,160);
}

/* ============================================================
   4. 音效（WebAudio 实时合成）
   ============================================================ */
const AU = {
  ctx:null, master:null, noise:null, ok:false,
  init(){
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try{ this.ctx = new AC(); }catch(e){ return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<len;i++) d[i] = Math.random()*2-1;
    this.noise = buf;
    this.ok = true;
  },
  resume(){
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  amb:null,
  ambient(level){
    if (!S.snd){ level = 0; }
    if (!this.ctx) this.init();
    this.resume();
    if (!this.ok) return;
    if (!this.amb){
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise; src.loop = true;
      const rf = this.ctx.createBiquadFilter();
      rf.type = 'bandpass'; rf.frequency.value = 1500; rf.Q.value = 0.65;
      const rg = this.ctx.createGain(); rg.gain.value = 0;
      src.connect(rf); rf.connect(rg); rg.connect(this.master);
      const wf = this.ctx.createBiquadFilter();
      wf.type = 'lowpass'; wf.frequency.value = 420;
      const wg = this.ctx.createGain(); wg.gain.value = 0;
      src.connect(wf); wf.connect(wg); wg.connect(this.master);
      src.start();
      this.amb = { src, rg, wg };
    }
    const now = this.ctx.currentTime;
    const rain = level >= 3 ? 0.075 : (level === 2 ? 0.05 : 0);
    const wind = level >= 2 ? 0.026 : (level === 1 ? 0.02 : 0);
    this.amb.rg.gain.setTargetAtTime(rain, now, 0.9);
    this.amb.wg.gain.setTargetAtTime(wind, now, 1.1);
  },
  thunder(delay){
    if (!S.snd || !this.ok) return;
    const t = this.ctx.currentTime + (delay || 0.2);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(340, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.9);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(72, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.95);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.15, t + 0.09);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 1.55);
  },
  burst(t,dur,freq,q,gain,type,rate){
    if (!this.ok) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = rate || rand(0.92,1.08);
    const f = this.ctx.createBiquadFilter(); f.type = type||'bandpass';
    f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, rand(0,0.4)); src.stop(t+dur+0.02);
  },
  tone(t,freq,dur,gain,type,slideTo){
    if (!this.ok) return;
    const o = this.ctx.createOscillator();
    o.type = type||'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t+dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t+0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t+dur+0.03);
  },
  play(kind, power){
    if (!S.snd) return;
    if (!this.ctx) this.init();
    this.resume();
    if (!this.ok) return;
    const t = this.ctx.currentTime + 0.004;
    const p = power === undefined ? 0.6 : power;

    if (kind === 'hit'){
      this.burst(t, 0.045, 1500 + p*2200, 1.1, 0.13 + p*0.15);
      this.tone(t, 150 + p*90, 0.07 + p*0.05, 0.10 + p*0.12, 'sine', 70);
      return;
    }
    if (kind === 'crack'){
      this.burst(t, 0.035, 5200, 0.9, 0.10, 'highpass');
      this.tone(t, 1800, 0.05, 0.03, 'triangle', 1200);
      return;
    }
    if (kind === 'miss'){
      this.tone(t, 240, 0.26, 0.15, 'sine', 78);
      this.burst(t, 0.12, 300, 0.8, 0.11, 'lowpass');
      return;
    }
    if (kind === 'level'){
      [523, 659, 784, 1046].forEach((f,i)=>this.tone(t + i*0.055, f, 0.34, 0.055/(1+i*0.25), 'sine'));
      return;
    }
    const pack = S.pack;
    if (pack === 'bubble'){
      this.burst(t, 0.085, rand(1100,1600), 1.1, 0.30 + p*0.10);
      this.tone(t, rand(430,520), 0.13, 0.17, 'sine', 150);
      this.tone(t+0.015, rand(900,1200), 0.07, 0.06, 'triangle');
      this.tone(t, 66, 0.20, 0.16 + p*0.10, 'sine', 40);
    } else if (pack === 'glass'){
      this.burst(t, 0.18, 3600, 0.7, 0.24, 'highpass');
      for (let i=0;i<4;i++) this.tone(t+i*0.012, rand(2400,4200), rand(0.10,0.22), 0.06, 'sine');
      this.tone(t, 780, 0.09, 0.05, 'triangle', 500);
      this.tone(t, 72, 0.20, 0.15 + p*0.10, 'sine', 42);
    } else {
      const base = [880, 1174, 1568][(Math.random()*3)|0];
      [1,1.5,2.02,2.66].forEach((m,i)=>{
        this.tone(t + i*0.02, base*m*rand(0.995,1.005), 1.0 - i*0.14, 0.075/(i+1), 'sine');
      });
      this.burst(t, 0.06, 6000, 0.8, 0.08, 'highpass');
      this.tone(t, 66, 0.18, 0.12 + p*0.08, 'sine', 40);
    }
  }
};
function vibrate(ms){
  if (!S.vib) return;
  if (navigator.vibrate){ try{ navigator.vibrate(ms); }catch(e){} }
}

/* ============================================================
   5. emoji 支持检测
   ============================================================ */
let EMOJI_OK = false;
(function detectEmoji(){
  try{
    const c = document.createElement('canvas');
    c.width = c.height = 28;
    const g = c.getContext('2d');
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText('😤', 14, 15);
    const d = g.getImageData(0,0,28,28).data;
    let colored = 0, ink = 0;
    for (let i=0;i<d.length;i+=4){
      if (d[i+3] > 30){
        ink++;
        const mx = Math.max(d[i],d[i+1],d[i+2]), mn = Math.min(d[i],d[i+1],d[i+2]);
        if (mx-mn > 22) colored++;
      }
    }
    EMOJI_OK = colored > 20 && ink > 40;
  }catch(e){ EMOJI_OK = false; }
})();

/* ============================================================
   6. 回合构建 & 布局
   ============================================================ */
function currentItems(){
  if (S.theme === 'diy'){
    const arr = (S.diy && S.diy.length) ? S.diy.slice() : ['烦'];
    return { items: arr, kind: 'auto' };
  }
  if (S.theme === 'pics'){
    if (!S.pics.length) return { items: ['贴图'], kind: 'text' };
    return { items: S.pics.map((p,i)=>'#img'+i), kind: 'image' };
  }
  if (S.theme === 'pals' || S.theme === 'items'){
    const g = (window.QS_GALLERY || {})[S.theme];
    const list = (g && g.items && g.items.length) ? g.items : [];
    if (!list.length) return { items: ['图鉴'], kind: 'text' };
    return { items: list.map(x=>x.id), kind: 'gallery' };
  }
  const t = THEMES[S.theme] || THEMES.commute;
  if (S.theme === 'patterns'){
    if (!EMOJI_OK) return { items: (t.fallback||['man']).slice(), kind: 'icon' };
    return { items: t.items.slice(), kind: 'emoji' };
  }
  let items = t.items.slice();
  let kind = t.mode;
  if (kind === 'emoji' && !EMOJI_OK){ items = (t.fallback || ['烦']).slice(); kind = 'text'; }
  return { items: items, kind: kind };
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
function isEmojiStr(str){
  try { return str.length <= 4 && EMOJI_RE.test(str); } catch(e){ return false; }
}

function slotLayout(n){
  const cx = W/2, cy = H*0.455, minWH = Math.min(W,H);
  const out = [];
  if (n === 1){
    out.push({x:cx, y:cy, r:clamp(minWH*0.22, 74, 168)});
  } else if (n === 2){
    const r = clamp(minWH*0.155, 54, 112);
    out.push({x:cx - r*1.20, y:cy, r:r}, {x:cx + r*1.20, y:cy, r:r});
  } else if (n <= 5){
    const R = Math.min(W*0.305, H*0.225);
    const rr = clamp(minWH*0.112, 44, 96);
    for (let i=0;i<n;i++){
      const a = -Math.PI/2 + i*(Math.PI*2/n);
      out.push({x: cx + Math.cos(a)*R, y: cy + Math.sin(a)*R*1.28, r: rr*rand(0.94,1.06)});
    }
  } else {
    const cols = 3, rows = Math.ceil(n/cols);
    const availW = Math.min(W*0.90, 520);
    const availH = Math.min(H*0.58, 560);
    const gx = availW/cols, gy = availH/rows;
    const rr = Math.min(gx*0.42, gy*0.42, 66);
    for (let i=0;i<n;i++){
      const c = i%cols, rw = Math.floor(i/cols);
      const inRow = Math.min(cols, n - rw*cols);
      const off = (cols - inRow)*gx/2;
      out.push({x: cx - availW/2 + gx/2 + off + c*gx, y: cy - availH/2 + gy/2 + rw*gy, r: rr*rand(0.94,1.04)});
    }
  }
  return out;
}

const _mcv = document.createElement('canvas').getContext('2d');
function measure(text, size){
  _mcv.font = '600 ' + size + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  return _mcv.measureText(text).width;
}
// 不同形状的可用正文宽度（星形/心形收缩得最利）
function fitWidth(shape, r){
  if (shape === 'star' || shape === 'heart') return r*1.06;
  if (shape === 'hex') return r*1.52;
  if (shape === 'none') return r*1.86;
  return r*1.46;
}

/* ---------- 形状 / 入场 / 破裂样式 ---------- */
function pickBurstStyle(){
  if (S.burst !== 'mix') return S.burst;
  const r = Math.random();
  return r < 0.45 ? 'crack' : (r < 0.78 ? 'blast' : 'puff');
}
function makeEntrance(i, n){
  if (S.entrance === 'none') return null;
  const type = S.entrance === 'mix'
    ? ['fly','float','fall','pop'][(Math.random()*4)|0]
    : S.entrance;
  const dir = Math.random() < 0.5 ? -1 : 1;
  const spec = { type:type, delay:i*0.06 + rand(0,0.12), dur:rand(0.55,0.85), t:0,
                 fx:0, fy:0, fs:0.8, fr:0 };
  if (type === 'fly'){
    spec.fx = dir*(W*0.72 + 140); spec.fy = rand(-80,80);
    spec.fs = 0.5; spec.fr = dir*0.7; spec.dur = rand(0.55,0.78);
  } else if (type === 'float'){
    spec.fx = rand(-100,100); spec.fy = H*0.30;
    spec.fs = 0.66; spec.fr = rand(-0.35,0.35); spec.dur = rand(0.75,1.0);
  } else if (type === 'fall'){
    spec.fx = rand(-70,70); spec.fy = -H*0.42;
    spec.fs = 0.74; spec.fr = rand(-0.5,0.5); spec.dur = rand(0.6,0.9);
  } else {
    spec.fs = 0.12; spec.fr = rand(-0.25,0.25); spec.dur = rand(0.42,0.6);
  }
  return spec;
}
function easeOutBack(p){
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3*Math.pow(p-1,3) + c1*Math.pow(p-1,2);
}
// 统一的形状路径：气泡、圆角、六边、星形、心形
function shapePath(g, shape, r){
  g.beginPath();
  if (shape === 'rounded'){
    const s = r*0.9, k = r*0.32;
    g.moveTo(-s+k,-s); g.lineTo(s-k,-s); g.quadraticCurveTo(s,-s,s,-s+k);
    g.lineTo(s,s-k); g.quadraticCurveTo(s,s,s-k,s);
    g.lineTo(-s+k,s); g.quadraticCurveTo(-s,s,-s,s-k);
    g.lineTo(-s,-s+k); g.quadraticCurveTo(-s,-s,-s+k,-s);
    g.closePath();
  } else if (shape === 'hex'){
    for (let i=0;i<6;i++){
      const a = -Math.PI/2 + i*Math.PI/3;
      const x = Math.cos(a)*r, y = Math.sin(a)*r;
      i ? g.lineTo(x,y) : g.moveTo(x,y);
    }
    g.closePath();
  } else if (shape === 'star'){
    for (let i=0;i<10;i++){
      const rad = i%2 ? r*0.46 : r;
      const a = -Math.PI/2 + i*Math.PI/5;
      const x = Math.cos(a)*rad, y = Math.sin(a)*rad;
      i ? g.lineTo(x,y) : g.moveTo(x,y);
    }
    g.closePath();
  } else if (shape === 'heart'){
    const s = r*0.95;
    g.moveTo(0, s*0.72);
    g.bezierCurveTo(-s*0.22, s*0.50, -s*1.02, s*0.12, -s*0.62, -s*0.38);
    g.bezierCurveTo(-s*0.34, -s*0.72, -s*0.06, -s*0.62, 0, -s*0.38);
    g.bezierCurveTo(s*0.06, -s*0.62, s*0.34, -s*0.72, s*0.62, -s*0.38);
    g.bezierCurveTo(s*1.02, s*0.12, s*0.22, s*0.50, 0, s*0.72);
    g.closePath();
  } else {
    g.arc(0,0,r,0,Math.PI*2);
  }
}

function buildRound(){
  S.parts.length = 0; S.ghosts.length = 0; S.rings.length = 0; S.marks.length = 0;
  S.bubbles.length = 0; S.combo = 0; S.tapCount = 0;
  const conf = currentItems();
  const pool = conf.items.length ? conf.items : ['烦'];
  const n = clamp(S.qty, 1, 9);

  const picked = [];
  const bag = shuffle(pool.slice());
  for (let i=0;i<n;i++) picked.push(bag[i % bag.length]);

  const slots = slotLayout(n);
  picked.forEach((word,i)=>{
    const p = PALETTE[i % PALETTE.length];
    const s = slots[i];
    let kind;
    if (conf.kind === 'auto') kind = isEmojiStr(word) ? 'emoji' : 'text';
    else kind = conf.kind;
    const b = {
      word: word, kind: kind, pic: null,
      x:s.x, y:s.y, r:s.r,
      ox:0, oy:0, vx:0, vy:0,
      q:0, qv:0, rot:0,
      dmg:0, cracked:false, dead:false, deadAt:0,
      phase: rand(0,9), hard: HARD[S.hard].mul * rand(0.92,1.1),
      c1:p.c1, c2:p.c2, h:p.h,
      shape: S.shape === 'mix' ? randomShape() : S.shape, burstType: pickBurstStyle(),
      sizeF: 1 + rand(-S.sizeVar, S.sizeVar),
      entOX:0, entOY:0, entS:1, entR:0, entA:1, ent:null,
      grad:null, fs:0, cracks:null, flash:0
    };
    if (kind === 'image' && S.pics.length) b.pic = S.pics[i % S.pics.length];
    if (kind === 'gallery'){
      const g = galleryFind(word);
      if (g){ b.pic = { img: imgFor(g.src), label: g.label, emoji: g.emoji }; b.word = g.label; }
      else { b.kind = 'text'; b.word = '图鉴'; }
    }
    S.bubbles.push(b);
    b.ent = makeEntrance(i, n);
    if (b.ent) b.entA = 0;
  });
  S.items = picked.slice();
  S.kinds = S.bubbles.map(b=>b.kind);
  S.roundPics = S.bubbles.map(b=>b.pic || null);
  placeBubbles();
  renderDots();
}

function placeBubbles(){
  const n = S.bubbles.length;
  const slots = slotLayout(n);
  const v = clamp(parseFloat(S.sizeVar) || 0, 0, 0.4);
  const fit = 1 / (1 + v * 0.55);
  S.bubbles.forEach((b,i)=>{
    const s = slots[i];
    b.x = s.x; b.y = s.y;
    b.r = s.r * (b.sizeF || 1) * fit;
    b.grad = null;
    if (b.kind === 'text'){
      let fs = b.r*0.60;
      const cap = fitWidth(b.shape, b.r);
      for (let k=0;k<12;k++){
        if (measure(b.word, fs) <= cap) break;
        fs *= 0.92;
      }
      b.fs = fs;
    } else if (b.kind === 'emoji'){
      b.fs = b.r*1.02;
    } else {
      b.fs = 0;
    }
  });
}

/* ============================================================
   7. 输入：敲击 / 摇晃
   ============================================================ */
const motion = { gx:0, gy:0, gz:9.8, mag:0, peak:0, has:false, lastT:0, swingT:0, lastRaw:0 };
let motionAttached = false;
const SHAKE_THR = 4.2;

function onDev(e){
  const ag = e.accelerationIncludingGravity;
  const ac = e.acceleration;
  let x=0,y=0,z=0;
  if (ag){ x=ag.x||0; y=ag.y||0; z=ag.z||0; }
  else if (ac){ x=ac.x||0; y=ac.y||0; z=ac.z||0; }

  motion.gx += (x - motion.gx)*0.06;
  motion.gy += (y - motion.gy)*0.06;
  motion.gz += (z - motion.gz)*0.06;

  let lx,ly,lz;
  if (ac && (ac.x!==null || ac.y!==null || ac.z!==null)){ lx=ac.x||0; ly=ac.y||0; lz=ac.z||0; }
  else { lx = x - motion.gx; ly = y - motion.gy; lz = z - motion.gz; }

  const raw = Math.sqrt(lx*lx + ly*ly + lz*lz);
  motion.peak = Math.max(motion.peak, raw);
  motion.mag = raw > motion.mag ? lerp(motion.mag, raw, 0.6) : lerp(motion.mag, raw, 0.2);
  motion.has = true;
  motion.lastT = performance.now();

  // 摇晃模式：每次摆动上升沿算一次“敲击”
  if (S.trigger === 'shake' && (S.mode === 'play' || S.mode === 'armed')){
    const now = performance.now();
    if (raw > SHAKE_THR && motion.lastRaw <= SHAKE_THR && now - motion.swingT > 170){
      motion.swingT = now;
      const alive = S.bubbles.filter(b=>!b.dead);
      if (alive.length){
        const target = alive[(Math.random()*alive.length)|0];
        attack(target.x + target.ox, target.y + target.oy, clamp(0.62 + raw/46, 0.62, 1.0), target);
      }
    }
  }
  motion.lastRaw = raw;
}

function attachMotion(){
  if (motionAttached) return;
  window.addEventListener('devicemotion', onDev, {passive:true});
  motionAttached = true;
}
function detachMotion(){
  if (!motionAttached) return;
  window.removeEventListener('devicemotion', onDev);
  motionAttached = false;
}
async function requestMotion(){
  try{
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'){
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') return false;
    }
  }catch(e){ return false; }
  attachMotion();
  return true;
}

/* 力度估算：接触面积 + 压力(若设备支持) + 敲击瞬间加速度峰值 + 节奏 */
function estimatePower(e){
  let p = IS_DESK ? 0.84 : (motion.has ? 0.52 : 0.70);
  const w = e.width || 1, h = e.height || 1;
  const area = Math.sqrt(Math.max(1, w*h));
  p += clamp((area - 5)/32, 0, 0.20);
  if (typeof e.pressure === 'number' && e.pressure > 0 && Math.abs(e.pressure - 0.5) > 0.03){
    p += clamp((e.pressure - 0.3)*0.55, 0, 0.28);
  }
  p += clamp(motion.peak/16, 0, 0.30);
  const gap = performance.now() - S.lastHitT;
  p += clamp((380 - gap)/380, 0, 1) * 0.10;
  // 桌面：Shift + 左键 / 鼠标右键 = 重击（一击爆破）
  if (IS_DESK && (e.button === 2 || e.shiftKey)) p = Math.max(p, 1.45);
  return clamp(p, 0.35, 1.55);
}

function bubblePos(b){
  return { x: b.x + b.ox + (b.entOX||0), y: b.y + b.oy + (b.entOY||0), r: b.r * (b.entS||1) };
}

function pickBubble(x,y){
  let best = null, bd = 1e9;
  for (const b of S.bubbles){
    if (b.dead || (b.entA !== undefined && b.entA < 0.45)) continue;
    const p = bubblePos(b);
    const d = Math.hypot(x-p.x, y-p.y);
    if (d < p.r*(S.rain.active ? 1.34 : 1.18) && d < bd){ best = b; bd = d; }
  }
  if (best) return best;
  for (const b of S.bubbles){
    if (b.dead || (b.entA !== undefined && b.entA < 0.45)) continue;
    const p = bubblePos(b);
    const d = Math.hypot(x-p.x, y-p.y);
    if (d < p.r*2.6 && d < bd){ best = b; bd = d; }
  }
  return best;
}

cv.addEventListener('pointerdown', e=>{
  if (e.target !== cv) return;
  e.preventDefault();
  if (S.mode === 'intro' || S.mode === 'done') return;
  if (window.QS && QS.locked && QS.locked()) return;
  const x = e.clientX, y = e.clientY;
  const power = estimatePower(e);
  attack(x, y, power, pickBubble(x, y));
}, {passive:false});

/* 桌面：悬停高亮（鼠标移到气泡上给一点反馈） */
if (IS_DESK){
  cv.addEventListener('pointermove', e=>{
    if (e.target !== cv || S.mode === 'intro' || S.mode === 'done'){ S.hover = null; return; }
    let best = null, bd = 1e9;
    for (const b of S.bubbles){
      if (b.dead) continue;
      const p = bubblePos(b);
      const d = Math.hypot(e.clientX-p.x, e.clientY-p.y);
      if (d < p.r*1.06 && d < bd){ best = b; bd = d; }
    }
    S.hover = best;
  });
  cv.addEventListener('pointerleave', ()=>{ S.hover = null; });
  // 右键 = 重击，屏蔽系统菜单
  window.addEventListener('contextmenu', e=>{ if (e.target === cv) e.preventDefault(); });
}

window.addEventListener('keydown', e=>{
  if (e.code === 'Space' && (S.mode === 'play' || S.mode === 'armed')){
    e.preventDefault();
    const alive = S.bubbles.filter(b=>!b.dead);
    if (alive.length){
      const b = alive[0];
      const p = bubblePos(b);
      attack(p.x, p.y, 0.95, b);
    }
  }
  if (IS_DESK){
    if (e.key === 'Escape' && panelEl.classList.contains('on')){ e.preventDefault(); closePanel(); }
    if ((e.key === 'r' || e.key === 'R') && !panelEl.classList.contains('on') && S.mode !== 'intro'){
      e.preventDefault(); again();
    }
  }
});

/* ============================================================
   8. 打击结算
   ============================================================ */
function attack(x, y, power, target){
  if (S.mode === 'intro' || S.mode === 'done') return;
  if (window.QS && QS.locked && QS.locked()) return;
  if (S.mode === 'armed') arm();

  const now = performance.now();
  if (now - S.lastHitT < 950) S.combo = Math.min(S.combo + 1, 12);
  else S.combo = 1;
  S.lastHitT = now;
  S.comboUntil = now + 1100;
  S.tapCount++;
  S.stats.taps = (S.stats.taps || 0) + 1;
  if (S.rain.active) noteTap();
  if (S.combo > (S.stats.bestCombo || 0)) S.stats.bestCombo = S.combo;

  const mul = 1 + Math.min(S.combo, 10) * 0.055;
  power = clamp(power * mul, 0.35, 1.55);
  const heavy = power >= 1.0;
  S.lastPower = power;

  S.shakeAmp = Math.min(S.shakeAmp + (heavy ? 9 : 4.5) + power*3.5, 16);

  S.rings.push({x:x, y:y, r: target ? target.r*0.35 : 12, grow: target ? target.r*1.5 : 46,
                life:0, max:0.42, c:'#ffffff', w:2.4});
  for (let i=0;i<(heavy?7:4);i++){
    const a = rand(0, Math.PI*2), sp = rand(80, 260);
    S.parts.push({
      type:'spark', x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-40,
      r: rand(1.2, 2.6), rot:0, vr:0, life:0, max: rand(0.28,0.55), c:'#ffffff', a:1
    });
  }

  spawnMark(x, y, power, target ? target.c1 : '#ffffff');
  AU.play('hit', clamp(power-0.35, 0, 1));
  vibrate(heavy ? 14 : 8);

  if (target){
    const dmg = power >= 1.4 ? 1.6 : (power * 0.61) / target.hard;
    addDamage(target, heavy ? Math.max(dmg, 0.55) : dmg, heavy);
  }
  updateCombo();
}

function spawnMark(x, y, power, color){
  const pool = (S.markWords && S.markWords.length) ? S.markWords : MARKS;
  const word = pool[(Math.random()*pool.length)|0];
  const size = clamp(((power>=1 ? 74 : 52) + power*18) * (MARK_SIZE[S.markSize]||1), 34, 190);
  S.marks.push({
    text: word, x: x + rand(-8,8), y: y - 8,
    vx: rand(-46,46), vy: rand(-190,-120),
    size: size, rot: rand(-0.22,0.22), vr: rand(-1.4,1.4),
    life: 0, max: 0.72, color: color, power: power
  });
}

function addDamage(b, amt, heavy){
  if (b.dead) return;
  b.dmg += amt;
  if (!b.cracked && b.dmg >= 0.24){
    b.cracked = true;
    b.cracks = makeCracks(b.r);
    AU.play('crack');
    vibrate(6);
    b.qv += rand(-2.4,-1.3);
  }
  if (b.dmg >= 1) shatter(b, heavy);
}

function makeCracks(r){
  const arr = [];
  const n = 5 + ((Math.random()*3)|0);
  const cx = rand(-0.35,0.35)*r, cy = rand(-0.35,0.35)*r;
  for (let i=0;i<n;i++){
    let a = (i/n)*Math.PI*2 + rand(-0.3,0.3);
    let x = cx, y = cy;
    const pts = [{x,y}];
    const segs = 3, len = r*rand(0.75,1.05);
    for (let s=1;s<=segs;s++){
      a += rand(-0.42,0.42);
      x += Math.cos(a)*len/segs;
      y += Math.sin(a)*len/segs;
      pts.push({x,y});
    }
    arr.push(pts);
  }
  return arr;
}

function shatter(b, heavy){
  b.dead = true;
  b.deadAt = performance.now();
  b.flash = 1;
  const pos = bubblePos(b);
  const cxp = pos.x, cyp = pos.y;
  const style = b.burstType || 'crack';
  const blast = style === 'blast';
  const puff = style === 'puff';
  const accent = b.c2 || b.c1;

  AU.play('shatter', heavy ? 1 : 0.6);
  vibrate(blast ? 36 : puff ? 12 : (heavy ? 30 : 20));
  S.shakeAmp = Math.min(S.shakeAmp + (blast ? 31 : puff ? 8 : (heavy ? 22 : 14)), blast ? 42 : 30);
  S.flash = Math.min(S.flash + (blast ? 0.62 : puff ? 0.16 : (heavy ? 0.5 : 0.34)), 0.9);

  // 大弧片（醒目的"壳"碎片）
  for (let i=0;i<(puff ? 2 : blast ? 8 : 5);i++){
    const a = rand(0,Math.PI*2), sp = rand(150, blast ? 520 : 380);
    S.parts.push({
      type:'big', x:cxp, y:cyp,
      vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-80,
      r:rand(9, blast ? 20 : 15), rot:rand(0,6.28), vr:rand(-7,7),
      life:0, max:rand(0.6,1.05), c: Math.random()<0.6 ? b.c1 : accent, a:0.9
    });
  }
  // 速度线（放射冲击）
  for (let i=0;i<(blast ? 12 : puff ? 0 : 8);i++){
    S.parts.push({
      type:'ray', x:cxp, y:cyp, a:rand(0,Math.PI*2),
      len:b.r*rand(blast ? 2.3 : 1.7, blast ? 3.6 : 2.8),
      life:0, max:rand(0.22,0.4), c:'#ffffff', w:rand(1.6,3.2)
    });
  }
  // 玻璃碎屑
  const shardN = puff ? 8 : blast ? 44 : (heavy ? 30 : 24);
  for (let i=0;i<shardN;i++){
    const a = rand(0,Math.PI*2), sp = rand(70, blast ? 620 : 350);
    S.parts.push({
      type:'shard',
      x: cxp + Math.cos(a)*b.r*rand(0.15,0.85),
      y: cyp + Math.sin(a)*b.r*rand(0.15,0.85),
      vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 60,
      r: rand(2.4, blast ? 9.5 : 7.6), rot: rand(0,6.28), vr: rand(-9,9),
      life: 0, max: rand(0.55,1.15),
      c: Math.random()<0.5 ? b.c1 : (Math.random()<0.6 ? '#ffffff' : accent),
      a: rand(0.55,0.95)
    });
  }
  for (let i=0;i<(blast ? 16 : puff ? 0 : (heavy ? 10 : 6));i++){
    const a = rand(0,Math.PI*2), sp = rand(140, blast ? 620 : 470);
    S.parts.push({
      type:'spark', x:cxp, y:cyp, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-70,
      r: rand(1, blast ? 3.4 : 2.6), rot:0, vr:0, life:0, max: rand(0.35,0.9),
      c: Math.random()<0.7 ? '#ffffff' : accent, a:1
    });
  }
  // 色雾（炸裂带少量烟，烟雾模式为主）
  if (puff || blast){
    const pn = puff ? 16 : 7;
    for (let i=0;i<pn;i++){
      const a = rand(0,Math.PI*2), sp = rand(20, puff ? 150 : 260);
      S.parts.push({
        type:'puff', x:cxp + Math.cos(a)*b.r*rand(0.1,0.6), y:cyp + Math.sin(a)*b.r*rand(0.1,0.6),
        vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 30,
        r: b.r*rand(0.16, puff ? 0.38 : 0.26), life:0, max:rand(0.75,1.35),
        c: Math.random()<0.55 ? b.c1 : accent, a: puff ? 0.30 : 0.16
      });
    }
  }
  // 冲击环
  if (puff){
    S.rings.push({x:cxp, y:cyp, r:b.r*0.55, grow:b.r*1.9, life:0, max:0.7, c:b.c1, w:2.4});
  } else {
    S.rings.push({x:cxp, y:cyp, r:b.r*0.7, grow:b.r*(blast ? 2.9 : 2.1), life:0, max:blast ? 0.72 : 0.5, c:b.c1, w:blast ? 7 : 4});
    S.rings.push({x:cxp, y:cyp, r:b.r*0.4, grow:b.r*(blast ? 4.2 : 3.0), life:0, max:blast ? 0.85 : 0.66, c:'#ffffff', w:2});
    if (blast) S.rings.push({x:cxp, y:cyp, r:b.r*0.9, grow:b.r*3.5, life:0, max:0.56, c:accent, w:5});
  }
  S.ghosts.push({text:b.word, kind:b.kind, pic:b.pic, x:cxp, y:cyp, vy:-30, life:0, max:1.0,
                 size: b.kind==='text' ? b.r*0.55 : b.r*0.8, a:0.9});
  spawnMark(cxp, cyp, Math.min(1.5, heavy?1.35:1.05), Math.random()<0.35 ? accent : b.c1);

  S.stats.pops = (S.stats.pops || 0) + 1;
  if (S.combo > (S.stats.bestCombo || 0)) S.stats.bestCombo = S.combo;
  store.set('stats', S.stats);

  if (S.rain.active){ addRainScore(b); return; }

  renderDots();
  if (S.bubbles.every(x=>x.dead)) setTimeout(finishRound, 640);
}

/* ============================================================
   9. 循环
   ============================================================ */
let last = performance.now();
function isPaused(){
  if (document.hidden) return true;
  if (panelEl && panelEl.classList.contains('on')) return true;
  if (document.querySelector('.modalCard.on')) return true;
  return false;
}
function frame(now){
  let dt = (now-last)/1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if ((window.QS && QS.locked && QS.locked()) || isPaused()){
    requestAnimationFrame(frame);
    return;
  }
  update(dt, now/1000);
  draw(now/1000);
  requestAnimationFrame(frame);
}

function update(dt, t){
  motion.peak *= Math.pow(0.008, dt);
  motion.mag *= Math.pow(0.15, dt);
  if (S.combo && performance.now() > S.comboUntil){ S.combo = 0; updateCombo(); }

  const tiltX = clamp(motion.gx/9.8, -1.2, 1.2);
  const tiltY = clamp(motion.gy/9.8, -1.2, 1.2);

  // 屏幕震动
  if (S.shakeAmp > 0.4){
    const a = S.shakeAmp;
    cv.style.transform = 'translate3d('+rand(-a,a).toFixed(2)+'px,'+rand(-a,a).toFixed(2)+'px,0) scale(1.02)';
  } else if (cv.style.transform !== 'none'){
    cv.style.transform = 'none';
  }
  S.shakeAmp *= Math.pow(0.0009, dt);
  if (S.shakeAmp < 0.4) S.shakeAmp = 0;

  // 爆炸闪光衰减
  if (S.flash > 0.005){
    S.flash *= Math.pow(0.002, dt);
  } else S.flash = 0;

  S.bubbles.forEach(b=>{
    if (b.ent){
      b.ent.t += dt;
      const p = clamp((b.ent.t - b.ent.delay) / b.ent.dur, 0, 1);
      const e = p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3)/2;
      const ee = b.ent.type === 'pop' ? easeOutBack(p) : e;
      b.entOX = lerp(b.ent.fx, 0, ee);
      b.entOY = lerp(b.ent.fy, 0, ee);
      b.entS = lerp(b.ent.fs, 1, ee);
      b.entR = lerp(b.ent.fr, 0, ee);
      b.entA = clamp(p*2.6, 0, 1);
      if (p >= 1){ b.ent = null; b.entOX = b.entOY = b.entR = 0; b.entS = 1; b.entA = 1; }
    }
    if (b.dead){ b.flash = Math.max(0, b.flash - dt*4); return; }
    b.vx += (-b.ox*46 - b.vx*6.4 + tiltX*2000) * dt;
    b.vy += (-b.oy*46 - b.vy*6.4 + tiltY*2000 + 110) * dt;
    b.ox += b.vx*dt; b.oy += b.vy*dt;
    const lim = Math.min(W,H)*0.15;
    b.ox = clamp(b.ox, -lim, lim);
    b.oy = clamp(b.oy, -lim, lim);

    b.qv += (-b.q*150 - b.qv*8.5) * dt;
    b.q += b.qv*dt;
    b.q = clamp(b.q, -0.22, 0.22);
    b.rot = Math.sin(t*1.05 + b.phase)*0.05 + tiltX*0.06;
    if (b.cracked) b.rot += Math.sin(t*22 + b.phase)*0.014*b.dmg;
  });

  for (let i=S.parts.length-1;i>=0;i--){
    const p = S.parts[i];
    p.life += dt;
    if (p.life >= p.max){ S.parts.splice(i,1); continue; }
    if (p.type === 'ray') continue;
    if (p.type === 'puff'){
      p.vy -= 34*dt;
      p.vx *= Math.pow(0.45, dt);
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.r += p.r*0.85*dt;
      continue;
    }
    p.vy += (p.type==='spark' ? 300 : 640) * dt;
    p.vx *= Math.pow(0.35, dt);
    p.x += p.vx*dt; p.y += p.vy*dt;
    p.rot += p.vr*dt;
  }
  for (let i=S.ghosts.length-1;i>=0;i--){
    const g = S.ghosts[i];
    g.life += dt;
    if (g.life >= g.max){ S.ghosts.splice(i,1); continue; }
    g.y += g.vy*dt; g.vy *= Math.pow(0.4, dt);
  }
  for (let i=S.rings.length-1;i>=0;i--){
    const r = S.rings[i];
    r.life += dt;
    if (r.life >= r.max) S.rings.splice(i,1);
  }
  for (let i=S.marks.length-1;i>=0;i--){
    const m = S.marks[i];
    m.life += dt;
    if (m.life >= m.max){ S.marks.splice(i,1); continue; }
    m.vy += 240*dt;
    m.x += m.vx*dt; m.y += m.vy*dt;
    m.vx *= Math.pow(0.3, dt);
    m.rot += m.vr*dt;
  }

  if (S.rain.active) updateRain(dt, t);
  if (S.rain.active) updateWeather(dt, t);

  for (let i=S.scores.length-1;i>=0;i--){
    const s = S.scores[i];
    s.life += dt;
    if (s.life >= s.max){ S.scores.splice(i,1); continue; }
    s.y += s.vy*dt;
    s.vy *= Math.pow(0.25, dt);
  }
}

/* ============================================================
   10. 绘制
   ============================================================ */
function draw(t){
  ctx.drawImage(bgCanvas, 0, 0, W, H);

  ctx.globalCompositeOperation = 'lighter';
  const gx1 = W*0.22 + Math.sin(t*0.18)*W*0.07;
  const gy1 = H*0.16 + Math.cos(t*0.13)*H*0.05;
  ctx.globalAlpha = 0.16; ctx.drawImage(glowV, gx1-240, gy1-240, 480, 480);
  const gx2 = W*0.84 + Math.cos(t*0.15)*W*0.06;
  const gy2 = H*0.8 + Math.sin(t*0.11)*H*0.05;
  ctx.globalAlpha = 0.13; ctx.drawImage(glowT, gx2-260, gy2-260, 520, 520);
  ctx.globalAlpha = 0.09; ctx.drawImage(glowP, W*0.5-230, H*1.0-230, 460, 460);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // 烦恼雨：危险区提示
  if (S.rain.active){
    drawWxBack(t);
    const dh = Math.min(150, H*0.17);
    const dz = ctx.createLinearGradient(0, H-dh, 0, H);
    dz.addColorStop(0, 'rgba(255,60,90,0)');
    dz.addColorStop(1, 'rgba(255,50,90,0.17)');
    ctx.fillStyle = dz; ctx.fillRect(0, H-dh, W, dh);
    ctx.save();
    ctx.setLineDash([7,11]);
    ctx.strokeStyle = 'rgba(255,95,125,0.26)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(0, H-dh*0.62); ctx.lineTo(W, H-dh*0.62); ctx.stroke();
    ctx.restore();
  }

  S.rings.forEach(r=>{
    const k = r.life / r.max;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r + k*r.grow, 0, Math.PI*2);
    ctx.strokeStyle = rgba(r.c, (1-k)*0.6);
    ctx.lineWidth = (r.w||2)*(1-k)+0.4;
    ctx.stroke();
  });

  const list = S.bubbles.slice().sort((a,b)=>a.y-b.y);
  list.forEach(b=>{
    if (b.dead){
      if (b.flash > 0.01){
        ctx.beginPath();
        ctx.arc(b.x+b.ox, b.y+b.oy, b.r*(1+(1-b.flash)*0.4), 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,'+(b.flash*0.24)+')';
        ctx.fill();
      }
      return;
    }
    drawBubble(b, t);
  });

  // 即将漏掉的气泡：红色预警环
  if (S.rain.active){
    S.bubbles.forEach(b=>{
      if (b.dead || !b.danger) return;
      const p = bubblePos(b);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r*1.07, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,90,120,' + (0.24 + b.danger*0.55).toFixed(3) + ')';
      ctx.lineWidth = 2 + b.danger*2.6;
      ctx.stroke();
    });
  }

  ctx.globalCompositeOperation = 'lighter';
  S.parts.forEach(p=>{
    const k = p.life / p.max;
    const alpha = p.a*(1-k)*(1-k);
    if (p.type === 'ray'){
      const len = p.len*(0.3+k);
      ctx.strokeStyle = rgba(p.c, (1-k)*0.9);
      ctx.lineWidth = p.w*(1-k)+0.3;
      ctx.beginPath();
      ctx.moveTo(p.x+Math.cos(p.a)*p.len*0.25, p.y+Math.sin(p.a)*p.len*0.25);
      ctx.lineTo(p.x+Math.cos(p.a)*len, p.y+Math.sin(p.a)*len);
      ctx.stroke();
    } else if (p.type === 'big'){
      ctx.save();
      ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.strokeStyle = rgba(p.c, alpha);
      ctx.lineWidth = p.r*0.5;
      ctx.beginPath();
      ctx.arc(0,0,p.r,0,Math.PI*0.95);
      ctx.stroke();
      ctx.restore();
    } else if (p.type === 'shard'){
      ctx.save();
      ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.fillStyle = rgba(p.c, alpha);
      ctx.beginPath();
      ctx.moveTo(0,-p.r); ctx.lineTo(p.r*0.86, p.r*0.6); ctx.lineTo(-p.r*0.7, p.r*0.55);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (p.type === 'puff'){
      const rr = p.r * (1 + k*1.7);
      const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      pg.addColorStop(0, rgba(p.c, alpha*0.55));
      pg.addColorStop(0.55, rgba(p.c, alpha*0.22));
      pg.addColorStop(1, rgba(p.c, 0));
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r*(1-k*0.5), 0, Math.PI*2);
      ctx.fillStyle = rgba(p.c, alpha);
      ctx.fill();
    }
  });
  ctx.globalCompositeOperation = 'source-over';

  S.ghosts.forEach(g=>{
    const k = g.life / g.max;
    ctx.save();
    ctx.globalAlpha = (1-k)*(1-k)*0.9;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (g.kind === 'emoji'){
      ctx.font = g.size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(g.text, g.x, g.y);
    } else if (g.kind === 'icon'){
      (ICONS[g.text]||ICONS.man)(ctx, g.size);
    } else if ((g.kind === 'image' || g.kind === 'gallery') && g.pic && g.pic.img && g.pic.img.complete && g.pic.img.naturalWidth){
      const img = g.pic.img;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.size*0.6, 0, Math.PI*2); ctx.clip();
      const sc = Math.max(g.size*1.2/img.naturalWidth, g.size*1.2/img.naturalHeight);
      ctx.drawImage(img, g.x-img.naturalWidth*sc/2, g.y-img.naturalHeight*sc/2, img.naturalWidth*sc, img.naturalHeight*sc);
    } else {
      ctx.font = '600 ' + g.size + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(g.text, g.x, g.y);
    }
    ctx.restore();
  });

  // 语气字（最上层）
  S.marks.forEach(m=>{
    const k = m.life / m.max;
    const pop = k < 0.18 ? 0.55 + (k/0.18)*0.62 : 1.17 - (k-0.18)*0.22;
    const alpha = k < 0.62 ? 1 : 1 - (k-0.62)/0.38;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rot);
    ctx.scale(pop, pop);
    ctx.globalAlpha = clamp(alpha,0,1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + m.size + 'px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
    ctx.lineWidth = m.size*0.16;
    ctx.strokeStyle = 'rgba(8,6,20,0.72)';
    ctx.lineJoin = 'round';
    ctx.strokeText(m.text, 0, 0);
    const grd = ctx.createLinearGradient(0, -m.size*0.5, 0, m.size*0.5);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.45, m.color);
    grd.addColorStop(1, '#ffd8ea');
    ctx.fillStyle = grd;
    ctx.fillText(m.text, 0, 0);
    ctx.restore();
  });

  if (S.rain.active) drawWxFront(t);

  // 得分飘字（烦恼雨）
  S.scores.forEach(s=>{
    const k = s.life / s.max;
    const a = k < 0.7 ? 1 : 1 - (k-0.7)/0.3;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + s.size + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.lineWidth = s.size*0.18;
    ctx.strokeStyle = 'rgba(8,6,20,0.7)';
    ctx.strokeText(s.text, s.x, s.y);
    ctx.fillStyle = s.c;
    ctx.fillText(s.text, s.x, s.y);
    ctx.restore();
  });

  // 爆炸白闪（最顶层）
  if (S.flash > 0.005){
    ctx.fillStyle = 'rgba(255,255,255,' + S.flash.toFixed(3) + ')';
    ctx.fillRect(0,0,W,H);
  }
}

/* 内容分发：文字 / emoji / 内置图案 / 图片贴图，主画布与消散卡共用 */
function paintKind(g, b, r, scale, shape){
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cap = fitWidth(shape, r);
  if (b.kind === 'emoji'){
    g.font = (b.fs*scale) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText(b.word, 0, r*0.04, cap*1.1);
  } else if (b.kind === 'icon'){
    (ICONS[b.word]||ICONS.man)(g, r*0.58*scale);
  } else if (b.kind === 'image' || b.kind === 'gallery'){
    const pic = b.pic;
    if (pic && pic.img && pic.img.complete && pic.img.naturalWidth){
      g.save();
      if (shape && shape !== 'bubble') shapePath(g, shape, r*0.985);
      else g.arc(0,0,r*0.985,0,Math.PI*2);
      g.clip();
      const iw = pic.img.naturalWidth, ih = pic.img.naturalHeight;
      const sc = Math.max(2*r/iw, 2*r/ih);
      g.drawImage(pic.img, -iw*sc/2, -ih*sc/2, iw*sc, ih*sc);
      g.restore();
    }
  } else {
    g.font = '600 ' + (b.fs*scale) + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.fillStyle = 'rgba(20,14,44,0.34)';
    g.fillText(b.word, 0, 1.5, cap);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillText(b.word, 0, 0, cap);
  }
}

function drawBubble(b, t){
  const r = b.r;
  const breathe = 1 + Math.sin(t*1.4 + b.phase)*0.012;
  const sq = b.q;
  const jitter = b.cracked ? Math.sin(t*30 + b.phase)*1.8*b.dmg : 0;
  const par = Math.sin(t*0.5 + b.phase)*r*0.05;
  const hov = (IS_DESK && S.hover === b && !b.dead) ? 1 : 0;
  const hs = hov ? 1.028 : 1;
  const ea = (b.entA === undefined) ? 1 : b.entA;
  const es = (b.entS === undefined) ? 1 : b.entS;
  const shape = b.shape || 'bubble';

  ctx.save();
  ctx.translate(b.x + b.ox + (b.entOX||0) + jitter, b.y + b.oy + (b.entOY||0) + Math.sin(t*1.15 + b.phase)*3.2);
  ctx.rotate(b.rot + (b.entR||0));
  ctx.scale((1+sq)*breathe*hs*es, (1-sq)*breathe*hs*es);

  ctx.globalAlpha = 0.30*ea;
  ctx.drawImage(glowOf(b.c1), -r*2.1, -r*2.1, r*4.2, r*4.2);
  ctx.globalAlpha = ea;

  if (shape === 'none'){
    const bg = ctx.createRadialGradient(0,0,0,0,0,r*1.05);
    bg.addColorStop(0, 'rgba(6,5,14,0.42)');
    bg.addColorStop(0.7, 'rgba(6,5,14,0.16)');
    bg.addColorStop(1, 'rgba(6,5,14,0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0,0,r*1.05,0,Math.PI*2); ctx.fill();
  } else {
    if (!b.grad){
      const g = ctx.createRadialGradient(-r*0.32, -r*0.36, r*0.05, 0, 0, r*1.03);
      g.addColorStop(0,    'rgba(255,255,255,0.95)');
      g.addColorStop(0.24, rgba(b.c1, 0.72));
      g.addColorStop(0.60, rgba(b.c2, 0.42));
      g.addColorStop(0.86, rgba(b.c1, 0.55));
      g.addColorStop(1,    rgba(b.c1, 0.18));
      b.grad = g;
    }
    shapePath(ctx, shape, r);
    ctx.fillStyle = b.grad; ctx.fill();

    const dk = ctx.createRadialGradient(0,0,r*0.52, 0,0,r);
    dk.addColorStop(0,    'rgba(10,6,28,0)');
    dk.addColorStop(0.76, 'rgba(10,6,28,0.05)');
    dk.addColorStop(1,    'rgba(10,6,28,0.5)');
    ctx.fillStyle = dk;
    shapePath(ctx, shape, r); ctx.fill();

    ctx.save();
    ctx.scale(0.94,0.94);
    shapePath(ctx, shape, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = r*0.05; ctx.stroke();
    ctx.restore();

    shapePath(ctx, shape, r-0.8);
    ctx.strokeStyle = rgba('#ffffff', 0.34 + b.dmg*0.4);
    ctx.lineWidth = 1.4; ctx.stroke();
  }

  ctx.save();
  ctx.translate(par, 0);
  paintKind(ctx, b, r, 1, shape);
  ctx.restore();

  if (shape !== 'none'){
    if (b.kind === 'image'){
      const gl = ctx.createRadialGradient(-r*0.32, -r*0.36, r*0.05, 0, 0, r*1.03);
      gl.addColorStop(0,    'rgba(255,255,255,0.30)');
      gl.addColorStop(0.45, 'rgba(255,255,255,0.04)');
      gl.addColorStop(1,    rgba(b.c1, 0.30));
      ctx.fillStyle = gl;
      shapePath(ctx, shape, r); ctx.fill();
    }

    ctx.save();
    shapePath(ctx, shape, r); ctx.clip();
    const hl = ctx.createLinearGradient(0, -r*1.05, 0, r*0.18);
    hl.addColorStop(0,    'rgba(255,255,255,0.46)');
    hl.addColorStop(0.55, 'rgba(255,255,255,0.09)');
    hl.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(-r*1.2, -r*1.2, r*2.4, r*2.4);
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(-r*0.34, -r*0.42, r*0.24, r*0.14, -0.6, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.fill();

    if (shape === 'bubble' || shape === 'rounded'){
      ctx.beginPath(); ctx.ellipse(0, r*0.50, r*0.46, r*0.20, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
    }

    if (b.cracked && b.cracks){
      const a = clamp(b.dmg/0.9, 0, 1);
      ctx.save();
      shapePath(ctx, shape, r*0.98); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.30 + a*0.55) + ')';
      ctx.lineWidth = 1.2 + a*0.7;
      ctx.lineCap = 'round';
      b.cracks.forEach(pts=>{
        ctx.beginPath();
        pts.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  if (hov && shape !== 'none'){
    shapePath(ctx, shape, r*1.04);
    ctx.strokeStyle = 'rgba(255,255,255,0.40)'; ctx.lineWidth = 1.6; ctx.stroke();
    shapePath(ctx, shape, r*1.10);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================
   11. 流程
   ============================================================ */
const guideEl = $('#guide'), hintEl = $('#hint'), dotsEl = $('#dots'), comboEl = $('#combo');
const resultEl = $('#result'), panelEl = $('#panel'), scrimEl = $('#scrim');

function renderDots(){
  if (!S.bubbles.length){ dotsEl.innerHTML = ''; return; }
  dotsEl.innerHTML = S.bubbles.map(b=>{
    if (b.dead) return '<i class="d"></i>';
    if (b.cracked) return '<i class="c"></i>';
    return '<i></i>';
  }).join('');
}
function updateCombo(){
  if (S.rain.active){ comboEl.classList.remove('on'); return; }
  if (S.combo >= 2){
    comboEl.textContent = 'COMBO ×' + S.combo;
    comboEl.classList.add('on');
  } else {
    comboEl.classList.remove('on');
  }
}
function setHint(text, on){
  hintEl.querySelector('span').textContent = text;
  hintEl.classList.toggle('on', !!on);
}
function arm(){
  if (S.mode !== 'armed') return;
  S.mode = 'play';
  setHint('', false);
}
let toastTimer = 0;
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('on'), 1700);
}

function startGame(){
  if (S.mode !== 'intro') return;
  AU.init(); AU.resume();
  guideEl.classList.add('gone');
  if (S.gameMode === 'rain'){ startRain(); return; }
  dotsEl.classList.add('on');
  buildRound();
  S.mode = 'armed';
  S.rline = lineLabel();
  setHint(S.trigger === 'tap' ? '敲碎它们' : '摇一摇，撞碎它们', true);
  requestMotion();
  if (!EMOJI_OK && (S.theme === 'bugs' || S.theme === 'faces')) toast('当前环境不支持图案，已用文字代替');
  setTimeout(()=>{ if (S.mode === 'armed') setHint(S.trigger === 'tap' ? '两三下就碎，快一点更爽' : '再摇明显一点', true); }, 5200);
  setTimeout(()=>{ if (S.mode === 'armed') setHint('', false); }, 11000);
}

function lineLabel(){
  const h = new Date().getHours();
  if (h < 9) return '早班线';
  if (h < 17) return '日间线';
  if (h < 20) return '晚高峰线';
  if (h < 23) return '夜行线';
  return '末班线';
}

function finishRound(){
  if (S.mode === 'done') return;
  S.mode = 'done';
  S.phrase = PHRASES[(Math.random()*PHRASES.length)|0];
  S.count += 1; store.set('count', S.count);
  S.stats.rounds = (S.stats.rounds || 0) + 1;
  if (S.combo > (S.stats.bestCombo || 0)) S.stats.bestCombo = S.combo;
  store.set('stats', S.stats);
  $('#rLine').textContent = S.phrase;
  S.cardUrl = makeCard();
  $('#cardImg').src = S.cardUrl;
  resultEl.classList.add('on');
  dotsEl.classList.remove('on');
  comboEl.classList.remove('on');
  setHint('', false);
}

function again(){
  resultEl.classList.remove('on');
  if (rainResultEl) rainResultEl.classList.remove('on');
  if (S.gameMode === 'rain'){
    startRain();
    return;
  }
  buildRound();
  S.phrase = '';
  S.mode = 'armed';
  S.rline = lineLabel();
  dotsEl.classList.add('on');
  setHint(S.trigger === 'tap' ? '敲碎它们' : '摇一摇，撞碎它们', true);
  setTimeout(()=>{ if (S.mode === 'armed') setHint('', false); }, 6500);
}

/* ============================================================
   11.5 烦恼雨（无尽下落模式）
   ============================================================ */
const rainHudEl = $('#rainHud'), levelBannerEl = $('#levelBanner'), burstBannerEl = $('#burstBanner');
const rainResultEl = $('#rainResult');

function rainBanner(el, text){
  if (!el) return;
  el.textContent = text;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}
if (levelBannerEl) levelBannerEl.addEventListener('animationend', ()=>levelBannerEl.classList.remove('on'));
if (burstBannerEl) burstBannerEl.addEventListener('animationend', ()=>burstBannerEl.classList.remove('on'));

function fmt(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function updateRainHud(){
  const R = S.rain;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('rhScore', fmt(R.score));
  set('rhPops', R.pops);
  set('rhBursts', R.bursts);
  set('rhLevel', R.level);
  const lv = document.getElementById('rhLives');
  if (lv){
    const base = (DIFF[S.diff] || DIFF.normal).lives;
    const max = Math.max(R.lives, base);
    let html = '';
    for (let i=0;i<max;i++) html += '<i class="' + (i < R.lives ? '' : 'off') + '"></i>';
    lv.innerHTML = html;
  }
  if (rainHudEl) rainHudEl.classList.toggle('on', !!R.active);
}

function startRain(){
  const d = DIFF[S.diff] || DIFF.normal;
  S.bubbles.length = 0; S.parts.length = 0; S.ghosts.length = 0;
  S.rings.length = 0; S.marks.length = 0; S.scores.length = 0;
  S.combo = 0; updateCombo();
  Object.assign(S.rain, {
    active:true, score:0, pops:0, bursts:0, lives:d.lives, level:1, miss:0,
    chain:0, chainT:0, maxChain:0, spawnT:0.32, elapsed:0, rank:0, best:false, cardUrl:'',
    weather:0, heat:0, taps:[], missHeat:0, drops:[], bolt:null, wT:0, nextBolt:0, chipT:0
  });
  S.boltFlash = 0;
  AU.ambient(0);
  S.mode = 'play';
  S.gameMode = 'rain'; store.set('gameMode','rain'); mark('#segMode','rain');
  guideEl.classList.add('gone');
  rainResultEl.classList.remove('on');
  resultEl.classList.remove('on');
  dotsEl.classList.remove('on');
  setHint('', false);
  buildBackdrop(bgKeyFor());
  updateRainHud();
  const chip = document.getElementById('moodChip');
  if (chip){
    chip.dataset.w = '0';
    chip.classList.add('on');
    const ic = document.getElementById('moodIco'); if (ic) ic.textContent = WX[0].ico;
    const nm = document.getElementById('moodName'); if (nm) nm.textContent = WX[0].name;
    const bar = document.getElementById('moodBarS'); if (bar) bar.style.width = '0%';
  }
  spawnRain(); spawnRain();
  rainBanner(levelBannerEl, '烦恼雨 · ' + d.name);
  setHint(S.trigger === 'shake' ? '摇一摇，敲碎落下的烦恼' : '点碎落下的烦恼', true);
  setTimeout(()=>{ if (S.rain.active) setHint('', false); }, 4200);
  AU.play('level');
}

function spawnRain(){
  const conf = currentItems();
  const pool = conf.items.length ? conf.items : ['烦'];
  const word = pool[(Math.random()*pool.length)|0];
  const d = DIFF[S.diff] || DIFF.normal;
  const R = S.rain;
  const minWH = Math.min(W,H);
  const rMin = clamp(minWH*0.055, 25, 46);
  const rMax = clamp(minWH*0.118, 52, 96);
  const r = rand(rMin, rMax) * (1 + Math.min(0.28, (R.level-1)*0.018));
  const p = PALETTE[(Math.random()*PALETTE.length)|0];
  const kind = conf.kind === 'auto' ? (isEmojiStr(word) ? 'emoji' : 'text') : conf.kind;
  let word2 = word, pic = null;
  if (kind === 'image' && S.pics.length) pic = S.pics[(Math.random()*S.pics.length)|0];
  if (kind === 'gallery'){
    const g = galleryFind(word);
    if (g){ pic = { img: imgFor(g.src), label: g.label, emoji: g.emoji }; word2 = g.label; }
  }
  const shape = (S.shape === 'mix') ? randomShape() : S.shape;
  const tN = clamp((r - rMin) / Math.max(1, rMax - rMin), 0, 1);
  const gold = Math.random() < 0.06;
  const hp = (gold ? 0.42 : (0.52 + tN*0.78)) * d.hp * (1 + (R.level-1)*0.05);
  const b = {
    word: word2, kind: kind,
    pic: pic,
    x: rand(r+12, Math.max(r+13, W-r-12)), y: -r*1.35, r: r,
    ox:0, oy:0, vx:0, vy:0, q:0, qv:0, rot:0, phase: rand(0,9),
    dmg:0, cracked:false, dead:false, deadAt:0,
    hard: hp,
    c1: gold ? '#ffc94d' : p.c1, c2: gold ? '#c96a12' : p.c2, h: p.h,
    shape: shape, burstType: gold ? 'blast' : pickBurstStyle(),
    sizeF:1, entOX:0, entOY:0, entS:1, entR:0, entA:0,
    ent: {type:'pop', delay:0, dur:0.32, t:0, fx:0, fy:-10, fs:0.74, fr:rand(-0.2,0.2)},
    grad:null, fs:0, cracks:null, flash:0, danger:0,
    gold: gold, bonus: gold ? 3 : 1,
    fall: { vy: H*rand(0.068,0.104)*d.speed*(1 + (R.level-1)*0.062),
            x0: 0, sway: rand(8, Math.max(10, minWH*0.045)),
            freq: rand(0.35,0.9), ph: rand(0,6.283), spin: rand(-1.4,1.4) }
  };
  b.fall.x0 = b.x;
  if (kind === 'text'){
    let fs = r*0.60;
    const cap = fitWidth(shape, r);
    for (let k=0;k<12;k++){ if (measure(word2, fs) <= cap) break; fs *= 0.92; }
    b.fs = fs;
  } else if (kind === 'emoji'){
    b.fs = r*1.02;
  }
  S.bubbles.push(b);
}

function addRainScore(b){
  const R = S.rain;
  const now = performance.now();
  R.chain = (now - R.chainT < 1100) ? R.chain + 1 : 1;
  R.chainT = now;
  R.pops++;
  R.maxChain = Math.max(R.maxChain, R.chain);
  const minWH = Math.min(W,H);
  const sizeMul = b.r > minWH*0.092 ? 1.4 : (b.r < minWH*0.068 ? 0.82 : 1);
  const gain = Math.round(10 * (1 + (R.level-1)*0.25) * (1 + Math.min(14, R.chain)*0.08) * sizeMul * (b.bonus||1));
  R.score += gain;
  S.scores.push({ x:b.x + (b.ox||0), y:b.y - b.r*0.5, vy:-70, life:0, max:0.85,
                  text:'+' + gain, c:(b.gold ? '#ffe08a' : '#ffffff'), size:clamp(b.r*0.42, 15, 30) });
  if (R.chain >= 3 && R.chain % 3 === 0){
    R.bursts++;
    const bonus = 20 * R.level * Math.round(R.chain/3);
    R.score += bonus;
    rainBanner(burstBannerEl, '爆裂 ×' + R.chain + '　+' + bonus);
    S.flash = Math.min(0.5, S.flash + 0.12);
    S.shakeAmp = Math.min(S.shakeAmp + 10, 30);
    S.rings.push({x:b.x, y:b.y, r:b.r*1.1, grow:b.r*5.2, life:0, max:0.8, c:'#ffe6a8', w:3});
    AU.play('level');
  }
  const next = 1 + Math.floor(R.pops / 12);
  if (next > R.level) levelUp(next);
  updateRainHud();
}

function levelUp(n){
  const R = S.rain;
  R.level = n;
  buildBackdrop(bgKeyFor());
  rainBanner(levelBannerEl, '第 ' + n + ' 层 · 更快了');
  if (n % 3 === 0){ R.lives = Math.min(R.lives + 1, 8); }
  updateRainHud();
}

function missBubble(b, idx){
  const R = S.rain;
  b.dead = true;
  R.miss++;
  R.lives = Math.max(0, R.lives - 1);
  R.chain = 0;
  noteMiss();
  S.combo = 0; updateCombo();
  S.shakeAmp = Math.min(S.shakeAmp + 17, 28);
  S.flash = Math.min(S.flash + 0.13, 0.42);
  const px = b.x + (b.ox||0);
  for (let i=0;i<9;i++){
    const a = rand(-Math.PI*0.9, -Math.PI*0.1), sp = rand(120, 320);
    S.parts.push({ type:'shard', x:px + rand(-b.r*0.5,b.r*0.5), y:H-16,
      vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, r:rand(2.5,6), rot:rand(0,6.28), vr:rand(-8,8),
      life:0, max:rand(0.4,0.8), c:'#ff6b8a', a:0.85 });
  }
  S.rings.push({x:px, y:H-46, r:20, grow:W*0.32, life:0, max:0.5, c:'#ff6b8a', w:3});
  S.scores.push({ x:px, y:H-86, vy:-46, life:0, max:1.1, text:'−1', c:'#ff7a94', size:26 });
  AU.play('miss');
  vibrate(34);
  if (idx >= 0) S.bubbles.splice(idx, 1);
  updateRainHud();
  if (R.lives <= 0) setTimeout(finishRain, 420);
}

function updateRain(dt, t){
  const R = S.rain, d = DIFF[S.diff] || DIFF.normal;
  R.elapsed += dt;
  R.spawnT -= dt;
  let aliveN = 0;
  for (const b of S.bubbles) if (!b.dead) aliveN++;
  const cap = Math.round(d.max + Math.min(7, (R.level-1)*0.85));
  if (R.spawnT <= 0 && aliveN < cap && R.lives > 0){
    spawnRain();
    R.spawnT = (d.spawn * rand(0.7,1.3)) / (1 + (R.level-1)*0.055);
  }
  for (let i=S.bubbles.length-1;i>=0;i--){
    const b = S.bubbles[i];
    if (b.dead || !b.fall) continue;
    const f = b.fall;
    b.y += f.vy * dt;
    const windAmp = S.wx ? (R.weather >= 3 ? 18 : (R.weather === 2 ? 7 : 0)) : 0;
    b.x = clamp(f.x0 + Math.sin(t*f.freq + f.ph)*f.sway +
      (windAmp ? Math.sin(t*0.55 + f.ph*1.7)*windAmp : 0), b.r + 8, Math.max(b.r + 9, W - b.r - 8));
    b.rot = Math.sin(t*f.freq*0.8 + f.ph)*0.13 + Math.sin(t*0.6 + f.ph)*0.05;
    const near = (b.y + b.r) / H;
    b.danger = near > 0.78 ? clamp((near - 0.78)/0.2, 0, 1) : 0;
    if (b.y - b.r*0.55 > H) missBubble(b, i);
  }
}

function finishRain(){
  const R = S.rain;
  if (!R.active) return;
  R.active = false;
  S.mode = 'done';
  const rec = { score:R.score, pops:R.pops, bursts:R.bursts, level:R.level,
                chain:R.maxChain, diff:S.diff, at:Date.now() };
  const board = Array.isArray(S.board) ? S.board.slice() : [];
  board.push(rec);
  board.sort((a,b)=> (Number(b.score)||0) - (Number(a.score)||0));
  S.board = board.slice(0, 20);
  store.set('board', S.board);
  R.rank = S.board.indexOf(rec) + 1;
  R.best = S.board.indexOf(rec) === 0;
  S.stats.rounds = (S.stats.rounds||0) + 1;
  S.stats.pops = (S.stats.pops||0) + R.pops;
  if (R.maxChain > (S.stats.bestCombo||0)) S.stats.bestCombo = R.maxChain;
  store.set('stats', S.stats);
  if (S.cloudRank){
    cloudSubmit(rec);
  } else if (!cloudHinted){
    cloudHinted = true;
    setTimeout(()=>toast('开启「云榜单」可与其他玩家比分数'), 1600);
  }
  fillRainResult();
  rainResultEl.classList.add('on');
  rainHudEl.classList.remove('on');
  const chip = document.getElementById('moodChip');
  if (chip) chip.classList.remove('on');
  AU.ambient(0);
  R.drops.length = 0; R.bolt = null; S.boltFlash = 0;
  dotsEl.classList.remove('on');
  comboEl.classList.remove('on');
  setHint('', false);
  AU.play('level');
}

function fillRainResult(){
  const R = S.rain;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('rrScore', fmt(R.score));
  set('rrPops', R.pops);
  set('rrBursts', R.bursts);
  set('rrLevel', R.level);
  set('rrChain', R.maxChain);
  const badge = document.getElementById('rrBadge');
  if (badge){
    if (R.best) badge.textContent = '本机最佳 · 第 1 名';
    else if (R.rank > 0) badge.textContent = '本机第 ' + R.rank + ' 名';
    else badge.textContent = '成绩已记录';
  }
  const tip = document.getElementById('rrTip');
  if (tip){
    const d = DIFF[S.diff] || DIFF.normal;
    const dt = new Date();
    const pad = n => (n<10?'0':'') + n;
    tip.textContent = '难度：' + d.name + ' · ' + dt.getFullYear() + '.' + pad(dt.getMonth()+1) + '.' + pad(dt.getDate());
  }
}

$('#startBtn').addEventListener('click', startGame);
$('#againBtn').addEventListener('click', again);
$('#saveBtn').addEventListener('click', ()=>{
  try{
    const a = document.createElement('a');
    a.href = S.cardUrl; a.download = '情绪消散卡_' + S.count + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    toast(IS_DESK ? '消散卡已下载到「下载」文件夹' : '已保存，也可长按图片保存');
  }catch(e){ toast('请长按图片保存'); }
});

/* ============================================================
   11.6 情绪天气（根据敲击节奏 & 漏怪变化）
   ============================================================ */
const WX = [
  { key:'clear', name:'晴朗', ico:'🌤️', tint:0.00, drops:0,  cloud:0.00 },
  { key:'cloud', name:'阴云', ico:'☁️', tint:0.09, drops:0,  cloud:0.55 },
  { key:'rain',  name:'落雨', ico:'🌧️', tint:0.16, drops:46, cloud:0.85 },
  { key:'storm', name:'雷暴', ico:'⛈️', tint:0.24, drops:80, cloud:1.00 }
];
let cloudSprite = null;

function wxCloudSprite(){
  const c = document.createElement('canvas');
  c.width = 360; c.height = 200;
  const g = c.getContext('2d');
  for (let i=0;i<7;i++){
    const x = rand(70,290), y = rand(70,140), r = rand(38,80);
    const rg = g.createRadialGradient(x,y,0,x,y,r);
    rg.addColorStop(0,'rgba(226,236,255,0.55)');
    rg.addColorStop(0.55,'rgba(198,214,242,0.22)');
    rg.addColorStop(1,'rgba(190,205,240,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x,y,r,0,6.283); g.fill();
  }
  return c;
}
function wxState(){
  if (!S.rain.active || !S.wx) return WX[0];
  return WX[S.rain.weather] || WX[0];
}
function noteTap(){
  const R = S.rain;
  if (!R.active) return;
  R.taps.push(performance.now());
  if (R.taps.length > 40) R.taps.shift();
}
function noteMiss(){
  const R = S.rain;
  R.missHeat = Math.min(0.65, (R.missHeat || 0) + 0.18);
}
function setWeather(n){
  const R = S.rain;
  if (R.weather === n) return;
  R.weather = n;
  R.wT = 0;
  R.nextBolt = rand(1.4, 3.2);
  if (S.wx) AU.ambient(n); else AU.ambient(0);
  const chip = document.getElementById('moodChip');
  if (chip){
    document.getElementById('moodIco').textContent = WX[n].ico;
    document.getElementById('moodName').textContent = WX[n].name;
    chip.dataset.w = String(n);
    chip.classList.toggle('on', R.active);
  }
}
function strikeLightning(){
  const R = S.rain;
  const x0 = rand(W*0.12, W*0.88);
  const y1 = rand(H*0.30, H*0.55);
  const pts = [{ x:x0, y:-12 }];
  let x = x0, y = -12;
  while (y < y1){
    y += rand(16, 38);
    x += rand(-24, 24);
    pts.push({ x:x, y:y });
  }
  R.bolt = { pts: pts, life: 0, max: 0.4, w: 2.2 };
  S.boltFlash = Math.min(0.45, (S.boltFlash || 0) + 0.36);
  S.shakeAmp = Math.min(S.shakeAmp + 4, 18);
  AU.thunder(rand(0.1, 0.45));
}
function updateWeather(dt, t){
  const R = S.rain;
  const now = performance.now();
  while (R.taps.length && now - R.taps[0] > 5000) R.taps.shift();
  R.missHeat = Math.max(0, (R.missHeat || 0) - dt*0.05);

  if (!S.wx){
    if (R.weather !== 0) setWeather(0);
    R.drops.length = 0; R.bolt = null;
    if (S.boltFlash) S.boltFlash = Math.max(0, S.boltFlash - dt*2.2);
    return;
  }

  const rate = R.taps.length / 5;
  let target = clamp((rate - 1.0) / 2.8, 0, 1);
  target = Math.min(1, target + (R.missHeat || 0) * 0.55);
  R.heat += (target - R.heat) * Math.min(1, dt*0.55);

  R.wT += dt;
  const th = [0.30, 0.56, 0.80];
  let want = R.weather;
  if (R.wT > 2.4){
    if (R.weather < 3 && R.heat > th[R.weather] + 0.04) want = R.weather + 1;
    else if (R.weather > 0 && R.heat < th[R.weather-1] - 0.05) want = R.weather - 1;
  }
  if (want !== R.weather) setWeather(want);

  const st = WX[R.weather] || WX[0];
  while (R.drops.length < st.drops){
    R.drops.push({ x: rand(-20, W+20), y: rand(-H*0.6, -10),
      len: rand(12,34), sp: rand(760,1250), drift: rand(-90,40) });
  }
  while (R.drops.length > st.drops) R.drops.pop();
  for (const d of R.drops){
    d.y += d.sp*dt;
    d.x += d.drift*dt;
    if (d.y > H+20 || d.x < -70 || d.x > W+70){
      d.x = rand(-30, W+30); d.y = rand(-70, -10);
      d.len = rand(12,34); d.sp = rand(760,1250);
    }
  }

  if (R.weather >= 3){
    R.nextBolt -= dt;
    if (R.nextBolt <= 0){ strikeLightning(); R.nextBolt = rand(2.6, 6.5); }
  } else {
    R.nextBolt = rand(1.2, 2.6);
  }
  if (S.boltFlash > 0.004) S.boltFlash = Math.max(0, S.boltFlash - dt*2.6);
  else S.boltFlash = 0;
  if (R.bolt){
    R.bolt.life += dt;
    if (R.bolt.life >= R.bolt.max) R.bolt = null;
  }

  R.chipT -= dt;
  if (R.chipT <= 0){
    R.chipT = 0.2;
    const bar = document.getElementById('moodBarS');
    if (bar) bar.style.width = Math.round(clamp(R.heat, 0, 1) * 100) + '%';
  }
}
function drawWxBack(t){
  const st = wxState();
  if (st.tint > 0.001){
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(18,28,52,' + (st.tint*1.15).toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(12,18,34,' + (st.tint*0.75).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(8,10,20,' + (st.tint*0.45).toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (st.cloud > 0.01){
    const tg = ctx.createLinearGradient(0, 0, 0, H*0.5);
    tg.addColorStop(0, 'rgba(20,28,50,' + (0.34*st.cloud).toFixed(3) + ')');
    tg.addColorStop(1, 'rgba(20,28,50,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, W, H*0.5);
    if (!cloudSprite) cloudSprite = wxCloudSprite();
    const cw = Math.max(300, W*0.55);
    for (let i=0;i<4;i++){
      const span = W + cw*2;
      const drift = ((t*(5 + i*4) + i*280) % span) - cw;
      const y = -40 + i*26 + Math.sin(t*0.12 + i)*7;
      ctx.globalAlpha = st.cloud * (0.30 + i*0.07);
      ctx.drawImage(cloudSprite, drift, y, cw, cw*0.55);
    }
    ctx.globalAlpha = 1;
  }
}
function drawWxFront(t){
  const st = wxState();
  const R = S.rain;
  if (st.drops > 0 && R.drops.length){
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(190,215,255,' + (0.10 + st.tint*0.6).toFixed(3) + ')';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    for (const d of R.drops){
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.drift*0.02, d.y + d.len);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (R.bolt){
    const k = R.bolt.life / R.bolt.max;
    const a = (1-k)*(1-k);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(212,236,255,' + (a*0.95).toFixed(3) + ')';
    ctx.lineWidth = R.bolt.w + 1.8*a;
    ctx.shadowColor = 'rgba(150,200,255,0.9)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    R.bolt.pts.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = 'rgba(200,225,255,' + (a*0.5).toFixed(3) + ')';
    ctx.beginPath();
    for (let i=2;i<R.bolt.pts.length-1;i+=2){
      const p = R.bolt.pts[i];
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + rand(-24,24), p.y + rand(14,32));
    }
    ctx.stroke();
    ctx.restore();
  }
  if (S.boltFlash > 0.004){
    ctx.fillStyle = 'rgba(205,225,255,' + S.boltFlash.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ============================================================
   12. 消散卡
   ============================================================ */
function makeCard(){
  const CW = 900, CH = 1350;
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const x = c.getContext('2d');
  const now = new Date();
  const pad = n => (n<10?'0':'')+n;
  const dateStr = now.getFullYear()+' . '+pad(now.getMonth()+1)+' . '+pad(now.getDate());
  const timeStr = pad(now.getHours())+':'+pad(now.getMinutes());

  const lg = x.createLinearGradient(0,0,CW,CH);
  lg.addColorStop(0,'#1b1640'); lg.addColorStop(0.48,'#120e2a'); lg.addColorStop(1,'#0a0718');
  x.fillStyle = lg; x.fillRect(0,0,CW,CH);

  const glow = (cx,cy,r,col)=>{
    const g = x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,col); g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0,0,CW,CH);
  };
  glow(170,120,620,'rgba(126,96,255,0.34)');
  glow(790,1130,560,'rgba(70,220,205,0.18)');
  glow(450,620,420,'rgba(255,120,180,0.10)');

  x.globalAlpha = 0.4;
  x.fillStyle = x.createPattern(noiseTile(128,16),'repeat');
  x.fillRect(0,0,CW,CH);
  x.globalAlpha = 1;

  x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 1.5;
  roundRect(x, 46, 46, CW-92, CH-92, 30); x.stroke();

  x.fillStyle = 'rgba(255,255,255,0.42)';
  x.font = '400 19px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillText('EMOTION  CLEARANCE', 92, 132);
  x.textAlign = 'right';
  x.fillText(timeStr, CW-92, 132);

  x.textAlign = 'left';
  x.fillStyle = '#f4f0ff';
  x.font = '600 62px "Songti SC","Noto Serif CJK SC",serif';
  x.fillText('第 ' + S.count + ' 次把烦敲碎', 92, 236);

  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.font = '400 25px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  x.fillText(S.rline + '  ·  ' + dateStr, 92, 288);

  dashLine(x, 92, 336, CW-92, 336, 'rgba(255,255,255,0.18)');

  const cx = CW/2, cy = 620;
  const rg2 = x.createRadialGradient(cx,cy,0,cx,cy,240);
  rg2.addColorStop(0,'rgba(157,139,255,0.20)'); rg2.addColorStop(1,'rgba(157,139,255,0)');
  x.fillStyle = rg2; x.beginPath(); x.arc(cx,cy,240,0,Math.PI*2); x.fill();

  const words = S.items.length ? S.items : ['烦'];
  const kinds = S.kinds && S.kinds.length === words.length
    ? S.kinds
    : words.map(w=> isEmojiStr(w) ? 'emoji' : 'text');
  const n = words.length;
  const ringR = n > 6 ? 198 : 172;
  const cardShape = ['bubble','rounded','hex','star','heart'].includes(S.shape) ? S.shape : 'bubble';
  words.forEach((w,i)=>{
    const a = -Math.PI/2 + i*(Math.PI*2/n) + 0.35;
    const rr = ringR + (i%2)*18;
    const px = cx + Math.cos(a)*rr*1.02;
    const py = cy + Math.sin(a)*rr*0.84;
    const kind = kinds[i];
    const emo = kind === 'emoji';
    const size = emo ? 40 : (n > 6 ? 25 : 29);
    x.save();
    x.translate(px, py);
    x.rotate(rand(-0.14,0.14));
    const cr = emo ? 38 : size*1.62;
    shapePath(x, cardShape, cr);
    x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 1.2; x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.05)'; x.fill();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (emo){
      x.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      x.globalAlpha = 0.6;
      x.fillText(w, 0, 2);
      x.globalAlpha = 1;
    } else if (kind === 'icon'){
      x.globalAlpha = 0.55;
      (ICONS[w]||ICONS.man)(x, size*1.15);
      x.globalAlpha = 1;
    } else if (kind === 'image'){
      const idx = parseInt(String(w).replace('#img',''),10) || 0;
      const pic = (S.roundPics && S.roundPics[i]) || (S.pics.length ? S.pics[idx % S.pics.length] : null);
      if (pic && pic.img && pic.img.complete && pic.img.naturalWidth){
        x.save();
        shapePath(x, cardShape, size*1.45); x.clip();
        const iw = pic.img.naturalWidth, ih = pic.img.naturalHeight;
        const sc = Math.max(size*3/iw, size*3/ih);
        x.drawImage(pic.img, -iw*sc/2, -ih*sc/2, iw*sc, ih*sc);
        x.globalAlpha = 0.5;
        x.fillStyle = 'rgba(20,14,44,0.35)'; x.fillRect(-size*1.5,-size*1.5,size*3,size*3);
        x.restore();
      }
    } else {
      x.font = '500 ' + size + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      x.fillStyle = 'rgba(255,255,255,0.42)';
      x.fillText(w, 0, 0);
      const tw = x.measureText(w).width;
      x.beginPath();
      x.moveTo(-tw*0.62, 2); x.lineTo(tw*0.62, -2);
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2; x.stroke();
    }
    x.restore();
  });

  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,255,255,0.95)';
  const phSize = S.phrase.length > 6 ? 68 : 84;
  x.font = '600 ' + phSize + 'px "Songti SC","Noto Serif CJK SC",serif';
  x.shadowColor = 'rgba(157,139,255,0.75)';
  x.shadowBlur = 40;
  x.fillText(S.phrase, CW/2, 900);
  x.shadowBlur = 0;

  x.beginPath();
  x.moveTo(CW/2-150, 968); x.lineTo(CW/2-16, 968);
  x.moveTo(CW/2+16, 968); x.lineTo(CW/2+150, 968);
  x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 1; x.stroke();
  x.save();
  x.translate(CW/2, 968); x.rotate(Math.PI/4);
  x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(-4,-4,8,8);
  x.restore();

  x.save();
  x.translate(CW-190, 1120);
  x.beginPath(); x.arc(0,0,64,0,Math.PI*2);
  x.strokeStyle = 'rgba(255,255,255,0.30)'; x.lineWidth = 1.6; x.stroke();
  x.beginPath(); x.arc(0,0,54,0,Math.PI*2);
  x.setLineDash([3,6]); x.strokeStyle = 'rgba(255,255,255,0.22)'; x.stroke();
  x.setLineDash([]);
  x.fillStyle = 'rgba(255,255,255,0.72)';
  x.font = '500 26px "Songti SC","Noto Serif CJK SC",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('已碎', 0, 1);
  x.restore();

  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillStyle = 'rgba(255,255,255,0.40)';
  x.font = '400 22px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  x.fillText('敲散  ·  把今天轻轻放下', 92, CH-96);
  x.textAlign = 'right';
  x.fillStyle = 'rgba(255,255,255,0.22)';
  x.font = '400 18px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
  x.fillText('No.' + String(S.count).padStart(3,'0'), CW-92, CH-96);

  return c.toDataURL('image/png');
}

/* 烦恼雨战绩卡 900 × 1350 */
function makeRainCard(){
  const CW = 900, CH = 1350;
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const x = c.getContext('2d');
  const R = S.rain;
  const p = BG[bgKeyFor()] || BG.neon;
  const now = new Date();
  const pad = n => (n<10?'0':'')+n;
  const dateStr = now.getFullYear()+' . '+pad(now.getMonth()+1)+' . '+pad(now.getDate());
  const timeStr = pad(now.getHours())+':'+pad(now.getMinutes());
  const sans = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';

  const lg = x.createLinearGradient(0,0,CW,CH);
  lg.addColorStop(0,p.a); lg.addColorStop(0.5,p.b); lg.addColorStop(1,p.c);
  x.fillStyle = lg; x.fillRect(0,0,CW,CH);
  const glow = (cx,cy,r,col)=>{
    const g = x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,col); g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0,0,CW,CH);
  };
  glow(180,140,640,p.g1); glow(780,1140,560,p.g2); glow(450,620,420,p.g3);

  x.globalAlpha = 0.4;
  x.fillStyle = x.createPattern(noiseTile(128,16),'repeat');
  x.fillRect(0,0,CW,CH);
  x.globalAlpha = 1;

  // 浮动装饰气泡
  const deco = [[122,986,56,'#a99bff'],[812,306,42,'#6feadf'],[762,946,26,'#ff93c4'],[136,330,30,'#ffc57e']];
  deco.forEach(([px,py,pr,col],i)=>{
    x.save(); x.translate(px,py);
    const g = x.createRadialGradient(-pr*0.3,-pr*0.35,pr*0.05,0,0,pr);
    g.addColorStop(0,'rgba(255,255,255,0.8)');
    g.addColorStop(0.45, rgba(col,0.4));
    g.addColorStop(1, rgba(col,0.05));
    shapePath(x, SHAPES[i % SHAPES.length], pr);
    x.fillStyle = g; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 1.4; x.stroke();
    x.restore();
  });

  x.strokeStyle = 'rgba(255,255,255,0.16)'; x.lineWidth = 1.5;
  roundRect(x, 46, 46, CW-92, CH-92, 30); x.stroke();

  x.fillStyle = 'rgba(255,255,255,0.42)';
  x.font = '400 19px ' + sans;
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillText('WORRY  RAIN', 92, 132);
  x.textAlign = 'right';
  x.fillText(timeStr, CW-92, 132);

  x.textAlign = 'center';
  x.fillStyle = '#f4f0ff';
  x.font = '600 44px "Songti SC","Noto Serif CJK SC",serif';
  x.fillText('烦恼雨 · 本局战绩', CW/2, 232);

  const st = fmt(R.score);
  let fs = 152;
  x.font = '700 ' + fs + 'px ' + sans;
  while (x.measureText(st).width > CW-220 && fs > 70){
    fs -= 6; x.font = '700 ' + fs + 'px ' + sans;
  }
  const sg = x.createLinearGradient(CW*0.18, 300, CW*0.82, 480);
  sg.addColorStop(0,'#ffffff'); sg.addColorStop(0.55,'#cfc4ff'); sg.addColorStop(1,'#8ef0e8');
  x.fillStyle = sg;
  x.fillText(st, CW/2, 476);

  x.font = '400 21px ' + sans;
  x.fillStyle = 'rgba(255,255,255,0.45)';
  x.fillText('SCORE · ' + (DIFF[S.diff] || DIFF.normal).name + ' 难度', CW/2, 528);

  const bx = 92, by = 606, bw = CW-184, bh = 194;
  roundRect(x, bx, by, bw, bh, 24);
  x.fillStyle = 'rgba(255,255,255,0.05)'; x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1.2; x.stroke();
  const cells = [['破损', R.pops], ['爆裂', R.bursts], ['层数', R.level], ['最高连击', R.maxChain]];
  const cw = bw/4;
  cells.forEach(([label,val],i)=>{
    const cx0 = bx + cw*(i+0.5);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff'; x.font = '600 52px ' + sans;
    x.fillText(String(val), cx0, by+80);
    x.fillStyle = 'rgba(255,255,255,0.42)'; x.font = '400 19px ' + sans;
    x.fillText(label, cx0, by+138);
    if (i){
      x.strokeStyle = 'rgba(255,255,255,0.09)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(bx+cw*i, by+32); x.lineTo(bx+cw*i, by+bh-32); x.stroke();
    }
  });

  const badge = R.best ? '本机最佳 · 第 1 名' : (R.rank ? '本机第 ' + R.rank + ' 名' : '成绩已记录');
  x.font = '400 20px ' + sans;
  const bw2 = x.measureText(badge).width + 58;
  roundRect(x, CW/2-bw2/2, 844, bw2, 50, 25);
  x.fillStyle = 'rgba(255,230,168,0.12)'; x.fill();
  x.strokeStyle = 'rgba(255,230,168,0.4)'; x.lineWidth = 1.2; x.stroke();
  x.fillStyle = '#ffe6a8'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(badge, CW/2, 870);

  const phrase = PHRASES[(R.pops + R.level) % PHRASES.length];
  x.fillStyle = 'rgba(255,255,255,0.94)';
  x.font = '600 ' + (phrase.length > 7 ? 56 : 66) + 'px "Songti SC","Noto Serif CJK SC",serif';
  x.shadowColor = 'rgba(157,139,255,0.7)';
  x.shadowBlur = 38;
  x.fillText(phrase, CW/2, 1006);
  x.shadowBlur = 0;

  dashLine(x, 92, 1086, CW-92, 1086, 'rgba(255,255,255,0.16)');

  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillStyle = 'rgba(255,255,255,0.40)';
  x.font = '400 22px ' + sans;
  x.fillText('敲散  ·  把今天轻轻放下', 92, CH-96);
  x.textAlign = 'right';
  x.fillStyle = 'rgba(255,255,255,0.24)';
  x.font = '400 18px ' + sans;
  x.fillText(dateStr, CW-92, CH-96);

  return c.toDataURL('image/png');
}

function roundRect(g,x0,y0,w,h,r){
  g.beginPath();
  g.moveTo(x0+r,y0);
  g.arcTo(x0+w,y0,x0+w,y0+h,r);
  g.arcTo(x0+w,y0+h,x0,y0+h,r);
  g.arcTo(x0,y0+h,x0,y0,r);
  g.arcTo(x0,y0,x0+w,y0,r);
  g.closePath();
}
function dashLine(g,x1,y1,x2,y2,col){
  g.save(); g.setLineDash([2,7]);
  g.strokeStyle = col; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke();
  g.restore();
}

/* ============================================================
   13. 设置面板
   ============================================================ */
function openPanel(){ panelEl.classList.add('on'); scrimEl.classList.add('on'); }
function closePanel(){ panelEl.classList.remove('on'); scrimEl.classList.remove('on'); }

/* 居中弹窗（帮助 / 关于） */
const modalScrim = document.getElementById('modalScrim');
function openCard(sel){
  closePanel();
  const m = document.querySelector(sel);
  if (!m) return;
  document.querySelectorAll('.modalCard.on').forEach(x=>x.classList.remove('on'));
  m.classList.add('on');
  if (modalScrim) modalScrim.classList.add('on');
  setTimeout(()=>{
    const f = m.querySelector('button,input,[href]');
    if (f) { try { f.focus({preventScroll:true}); } catch(e){} }
  }, 60);
}
function closeCards(){
  document.querySelectorAll('.modalCard.on').forEach(m=>m.classList.remove('on'));
  if (modalScrim) modalScrim.classList.remove('on');
}
const helpBtn = document.getElementById('helpBtn');
if (helpBtn) helpBtn.addEventListener('click', ()=>openCard('#helpModal'));
const footHelp = document.getElementById('footHelp');
if (footHelp) footHelp.addEventListener('click', ()=>openCard('#helpModal'));
const footAbout = document.getElementById('footAbout');
if (footAbout) footAbout.addEventListener('click', ()=>openCard('#aboutModal'));
document.querySelectorAll('[data-mc-close]').forEach(b=>b.addEventListener('click', closeCards));
if (modalScrim) modalScrim.addEventListener('click', closeCards);
document.addEventListener('keydown', e=>{ if (e.key === 'Escape') closeCards(); });
// 键盘焦点锁定在当前弹窗内，避免 Tab 跑到背后的画布上
document.addEventListener('keydown', e=>{
  if (e.key !== 'Tab') return;
  const cards = document.querySelectorAll('.modalCard.on');
  const m = cards[cards.length - 1];
  if (!m) return;
  const f = [...m.querySelectorAll('button:not([disabled]),input:not([disabled]),[href]')]
    .filter(x=>x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length-1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});
$('#gear').addEventListener('click', openPanel);
$('#closePanel').addEventListener('click', closePanel);
scrimEl.addEventListener('click', closePanel);

function mark(sel, val){
  const box = $(sel);
  [...box.children].forEach(b=>b.classList.toggle('on', b.dataset.v === String(val)));
}
function bindSeg(sel, key, cast, after){
  const box = $(sel);
  box.addEventListener('click', e=>{
    const btn = e.target.closest('button');
    if (!btn) return;
    [...box.children].forEach(b=>b.classList.toggle('on', b===btn));
    S[key] = cast(btn.dataset.v);
    store.set(key, S[key]);
    AU.resume();
    if (after) after();
  });
}

(function buildCountSeg(){
  const seg = $('#segCount');
  for (let i=1;i<=9;i++){
    const b = document.createElement('button');
    b.dataset.v = i; b.textContent = i;
    if (i === S.qty) b.classList.add('on');
    seg.appendChild(b);
  }
})();

bindSeg('#segCount','qty', v=>parseInt(v,10), ()=>{ if (!S.rain.active) buildRound(); });
bindSeg('#segTrigger','trigger', v=>v, ()=>{
  if (S.rain.active) return;
  if (S.mode === 'play' || S.mode === 'armed'){
    setHint(v==='tap' ? '敲碎它们' : '摇一摇，撞碎它们', true);
    setTimeout(()=>{ if (S.mode === 'play' || S.mode === 'armed') setHint('', false); }, 4200);
  }
  if (v === 'shake') requestMotion();
});
bindSeg('#segHard','hard', v=>v, ()=>{ if (!S.rain.active) buildRound(); });
bindSeg('#segShape','shape', v=>v, ()=>{ if (!S.rain.active) buildRound(); });
bindSeg('#segSize','sizeVar', v=>parseFloat(v)||0, ()=>{ if (!S.rain.active) buildRound(); });
bindSeg('#segEnt','entrance', v=>v, ()=>{ if (!S.rain.active) buildRound(); });
bindSeg('#segBurst','burst', v=>v, ()=>{
  S.bubbles.forEach(b=>{ b.burstType = pickBurstStyle(); });
});
bindSeg('#segPack','pack', v=>v, ()=>{ AU.play('shatter', 1); });
bindSeg('#segVib','vib', v=>v==='1');
bindSeg('#segSnd','snd', v=>v==='1', ()=>{
  if (!S.snd) AU.ambient(0);
  else if (S.rain.active) AU.ambient(S.rain.weather);
});
bindSeg('#segWx','wx', v=>v==='1', ()=>{
  if (!S.wx){
    AU.ambient(0);
    S.rain.drops.length = 0; S.rain.bolt = null; S.rain.weather = 0;
    const chip = document.getElementById('moodChip');
    if (chip) chip.classList.remove('on');
  } else if (S.rain.active){
    AU.ambient(S.rain.weather);
    const chip = document.getElementById('moodChip');
    if (chip) chip.classList.add('on');
  }
  toast(S.wx ? '情绪天气已开启' : '情绪天气已关闭');
});
bindSeg('#segCloud','cloudRank', v=>v==='1', ()=>{
  if (S.cloudRank){
    cloudState.status = 'idle';
    cloudLoad(true);
    toast('已开启云榜单：结算时上传昵称与成绩');
  } else {
    toast('已关闭云榜单，不会再发起网络请求');
  }
});

/* ---------- 游戏模式 / 难度 / 排行榜 ---------- */
function syncGuideMode(){
  document.querySelectorAll('.modeCard').forEach(b=>{
    const on = b.dataset.gm === S.gameMode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const dr = document.getElementById('diffRow');
  if (dr) dr.classList.toggle('on', S.gameMode === 'rain');
  document.querySelectorAll('#diffRow button').forEach(b=>{
    b.classList.toggle('on', b.dataset.diff === S.diff);
  });
  const sb = document.getElementById('startBtn');
  if (sb) sb.textContent = S.gameMode === 'rain' ? '开始掉落' : '开始';
  mark('#segMode', S.gameMode);
  mark('#segDiff', S.diff);
}
function setGameMode(v){
  if (S.rain.active){ syncGuideMode(); toast('本局结束后再切换模式'); return; }
  S.gameMode = (v === 'rain') ? 'rain' : 'zen';
  store.set('gameMode', S.gameMode);
  syncGuideMode();
  buildBackdrop(bgKeyFor());
  if (S.gameMode === 'rain'){
    rainBanner(levelBannerEl, '烦恼雨 · ' + (DIFF[S.diff] || DIFF.normal).name);
  }
}
function setDiff(v){
  if (S.rain.active){ syncGuideMode(); toast('本局结束后再改难度'); return; }
  S.diff = DIFF[v] ? v : 'normal';
  store.set('diff', S.diff);
  syncGuideMode();
  buildBackdrop(bgKeyFor());
  updateRainHud();
}
$('#segMode').addEventListener('click', e=>{ const b=e.target.closest('button'); if (b) setGameMode(b.dataset.v); });
$('#segDiff').addEventListener('click', e=>{ const b=e.target.closest('button'); if (b) setDiff(b.dataset.v); });
const modeRowEl = document.getElementById('modeRow');
if (modeRowEl) modeRowEl.addEventListener('click', e=>{
  const b = e.target.closest('.modeCard'); if (!b) return;
  AU.resume(); setGameMode(b.dataset.gm);
});
const diffRowEl = document.getElementById('diffRow');
if (diffRowEl) diffRowEl.addEventListener('click', e=>{
  const b = e.target.closest('button'); if (!b) return;
  AU.resume(); setDiff(b.dataset.diff);
});

let rkFilter = 'all';
let rkScope = 'local';
let cloudHinted = false;
const cloudState = { status:'idle', list:[], at:0 };

function cloudReady(){ return cloudState.status === 'ready'; }
function cloudLoad(force){
  if (!force && cloudState.status === 'ready' && Date.now() - cloudState.at < 60000) return;
  cloudState.status = 'loading';
  renderRank();
  fetch('/api/rank?diff=' + encodeURIComponent(rkFilter) + '&t=' + Date.now(), { cache:'no-store' })
    .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then(d => {
      if (d && d.configured === false){ cloudState.status = 'off'; cloudState.list = []; }
      else { cloudState.status = 'ready'; cloudState.list = Array.isArray(d.list) ? d.list : []; cloudState.at = Date.now(); }
      renderRank();
    })
    .catch(() => { cloudState.status = 'fail'; renderRank(); });
}
async function cloudSubmit(rec){
  try{
    const acc = (window.QS && QS.active) ? QS.active() : null;
    const r = await fetch('/api/rank', {
      method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: acc && acc.name, score:rec.score, pops:rec.pops,
        bursts:rec.bursts, level:rec.level, chain:rec.chain, diff:rec.diff })
    });
    const d = await r.json();
    if (d && d.ok){
      cloudState.status = 'ready'; cloudState.at = 0;
      toast('已上传云榜 · 第 ' + d.rank + ' 名');
    } else if (d && d.configured === false){
      toast('云端榜单尚未启用');
    } else {
      toast((d && d.error) || '云榜未收录这条成绩');
    }
  }catch(e){ /* 离线或未部署：静默回退到本机榜 */ }
}

function rankRows(list, cloud){
  const pad = n => (n<10?'0':'')+n;
  return list.map((r,i)=>{
    const d = DIFF[r.diff] || DIFF.normal;
    const dt = new Date(Number(r.at) || Date.now());
    const when = (dt.getMonth()+1) + '-' + pad(dt.getDate());
    const nm = cloud ? ('<span class="rkName">' + String(r.name || '匿名').replace(/[<>&]/g, '') + '</span> · ') : '';
    return '<div class="rkRow'+(i<3?' top'+(i+1):'')+'">' +
      '<div class="rkNo">' + (i+1) + '</div>' +
      '<div class="rkMain"><b>' + fmt(r.score||0) + ' 分</b>' +
      '<span>' + nm + '破损 ' + (r.pops||0) + ' · 爆裂 ' + (r.bursts||0) + ' · 第 ' + (r.level||1) + ' 层 · 连击 ' + (r.chain||0) + '</span></div>' +
      '<div class="rkDiff">' + d.name + ' · ' + when + '</div></div>';
  }).join('');
}

function renderRank(){
  const body = document.getElementById('rankBody');
  if (!body) return;
  const board = Array.isArray(S.board) ? S.board : [];
  const diffs = [['all','全部'],['chill','悠闲'],['normal','标准'],['frenzy','狂潮']];
  let html = '<div class="rkTabs rkScopeTabs">' +
    '<button data-scope="local" class="' + (rkScope==='local'?'on':'') + '">本机榜</button>' +
    '<button data-scope="cloud" class="' + (rkScope==='cloud'?'on':'') + '">全球榜</button></div>';
  html += '<div class="rkTabs">' + diffs.map(([k,t])=>'<button data-rk="'+k+'" class="'+(rkFilter===k?'on':'')+'">'+t+'</button>').join('') + '</div>';

  if (rkScope === 'local'){
    const list = board.filter(r => rkFilter === 'all' || r.diff === rkFilter);
    html += list.length
      ? rankRows(list, false)
      : '<div class="rkEmpty">还没有记录<br>选「烦恼雨」打一局，成绩会出现在这里</div>';
  } else if (cloudState.status === 'loading'){
    html += '<div class="rkEmpty">正在连接云端…</div>';
  } else if (cloudState.status === 'off'){
    html += '<div class="rkEmpty">云端榜单尚未启用<br><em class="rkDim">站长在 Cloudflare 绑定 KV（QS_RANK）后自动生效</em></div>';
  } else if (cloudState.status === 'fail'){
    html += '<div class="rkEmpty">连不上云端<br><em class="rkDim">离线时仍可看本机榜</em><br><button class="pfLink" id="rkRetry">重试</button></div>';
  } else if (cloudState.status === 'ready' && !cloudState.list.length){
    html += '<div class="rkEmpty">云端还没有成绩<br>成为第一个上榜的人</div>';
  } else {
    html += rankRows(cloudState.list, true);
  }

  if (rkScope === 'local'){
    html += '<div class="rkFoot"><span>共 ' + board.length + ' 局 · 每个档案独立</span>' +
            '<button class="pfLink" id="rkClear">清空本档排行</button></div>';
  } else {
    html += '<div class="rkFoot"><span>云端共展示前 20 名 · 每档难度独立</span>' +
            '<span>' + (S.cloudRank ? '已开启自动上传' : '未开启自动上传') + '</span></div>';
  }
  body.innerHTML = html;

  body.querySelectorAll('[data-rk]').forEach(b=>b.addEventListener('click', ()=>{
    rkFilter = b.dataset.rk;
    if (rkScope === 'cloud'){ cloudLoad(true); } else { renderRank(); }
  }));
  body.querySelectorAll('[data-scope]').forEach(b=>b.addEventListener('click', ()=>{
    rkScope = b.dataset.scope;
    if (rkScope === 'cloud'){ cloudLoad(false); } else { renderRank(); }
  }));
  const retry = document.getElementById('rkRetry');
  if (retry) retry.addEventListener('click', ()=>cloudLoad(true));
  const clear = document.getElementById('rkClear');
  if (clear) clear.addEventListener('click', ()=>{
    if (clear.dataset.armed === '1'){
      S.board = []; store.set('board', []); renderRank(); toast('本机榜已清空');
    } else {
      clear.dataset.armed = '1'; clear.textContent = '再点一次确认清空';
    }
  });
}
function openRank(){ renderRank(); openCard('#rankModal'); }
const rankBtn = document.getElementById('rankBtn');
if (rankBtn) rankBtn.addEventListener('click', openRank);
const guideRank = document.getElementById('guideRank');
if (guideRank) guideRank.addEventListener('click', openRank);
const footRank = document.getElementById('footRank');
if (footRank) footRank.addEventListener('click', openRank);

function saveDataUrl(url, name){
  try{
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    toast(IS_DESK ? '已下载到「下载」文件夹' : '已保存，也可长按图片保存');
  }catch(e){ toast('保存失败，请截图保存'); }
}
function backToIntro(){
  if (rainResultEl) rainResultEl.classList.remove('on');
  resultEl.classList.remove('on');
  S.rain.active = false;
  S.mode = 'intro';
  S.bubbles.length = 0; S.parts.length = 0; S.ghosts.length = 0;
  S.rings.length = 0; S.marks.length = 0; S.scores.length = 0;
  rainHudEl.classList.remove('on');
  const mchip = document.getElementById('moodChip');
  if (mchip) mchip.classList.remove('on');
  AU.ambient(0);
  S.rain.drops.length = 0; S.rain.bolt = null; S.boltFlash = 0;
  comboEl.classList.remove('on');
  guideEl.classList.remove('gone');
  buildBackdrop(bgKeyFor());
  syncGuideMode();
}
const rrAgain = document.getElementById('rrAgain');
if (rrAgain) rrAgain.addEventListener('click', again);const rrRank = document.getElementById('rrRank');
if (rrRank) rrRank.addEventListener('click', openRank);
const rrHome = document.getElementById('rrHome');
if (rrHome) rrHome.addEventListener('click', backToIntro);
const rrSave = document.getElementById('rrSave');
if (rrSave) rrSave.addEventListener('click', ()=>{
  if (!S.rain.cardUrl) S.rain.cardUrl = makeRainCard();
  saveDataUrl(S.rain.cardUrl, '烦恼雨战绩_' + S.rain.score + '分.png');
});
const resHome = document.getElementById('resHome');
if (resHome) resHome.addEventListener('click', ()=>{ resultEl.classList.remove('on'); backToIntro(); });
const resRank = document.getElementById('resRank');
if (resRank) resRank.addEventListener('click', openRank);

$('#chipsTheme').addEventListener('click', e=>{
  const btn = e.target.closest('button');
  if (!btn) return;
  [...$('#chipsTheme').children].forEach(b=>b.classList.toggle('on', b===btn));
  S.theme = btn.dataset.v;
  store.set('theme', S.theme);
  $('#diyBox').style.display = S.theme === 'diy' ? 'block' : 'none';
  $('#picBox').style.display = S.theme === 'pics' ? 'block' : 'none';
  if (S.theme === 'diy') $('#diyInput').value = S.diy.join(' ');
  if (!S.rain.active) buildRound();
  if (S.theme === 'pals' || S.theme === 'items'){
    const g = (window.QS_GALLERY || {})[S.theme];
    if (g && g.items) g.items.forEach(x=>imgFor(x.src));
    toast(S.theme === 'pals' ? '森林伙伴已就位' : '万物图鉴已就位');
  }
  if (!EMOJI_OK && (S.theme === 'bugs' || S.theme === 'faces')) toast('当前环境不支持图案，已用文字代替');
  if (S.theme === 'pics' && !S.pics.length) toast('先在下方选择图片');
});

/* ---------- 图片贴图 / 图鉴 ---------- */
const IMG_CACHE = new Map();
function imgFor(data){
  if (!IMG_CACHE.has(data)){
    const im = new Image();
    im.src = data;
    IMG_CACHE.set(data, im);
  }
  return IMG_CACHE.get(data);
}
function galleryFind(id){
  const G = window.QS_GALLERY || {};
  for (const k of ['pals','items']){
    const g = G[k];
    if (!g || !g.items) continue;
    const hit = g.items.find(x=>x.id === id);
    if (hit) return hit;
  }
  return null;
}
function galleryAll(){ return Object.assign({}, (window.QS_GALLERY || {})); }
function compressImage(file){
  return new Promise(res=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      try{
        const c = document.createElement('canvas'); c.width = c.height = 320;
        const g = c.getContext('2d');
        const sc = Math.max(320/img.naturalWidth, 320/img.naturalHeight);
        g.drawImage(img, (320-img.naturalWidth*sc)/2, (320-img.naturalHeight*sc)/2, img.naturalWidth*sc, img.naturalHeight*sc);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.82));
      }catch(err){ res(null); }
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}
function applyPics(datas, save){
  S.pics = datas.map(d=>({data:d, img:imgFor(d)}));
  if (save){ S.picData = datas; store.set('picData', datas); }
  if (S.theme === 'pics') buildRound();
}
$('#picFile').addEventListener('change', async e=>{
  const files = [...e.target.files].slice(0, 9);
  e.target.value = '';
  if (!files.length) return;
  toast('处理图片中…');
  const urls = [];
  for (const f of files){
    const d = await compressImage(f);
    if (d) urls.push(d);
  }
  if (!urls.length){ toast('图片读取失败'); return; }
  S.theme = 'pics'; store.set('theme','pics');
  [...$('#chipsTheme').children].forEach(b=>b.classList.toggle('on', b.dataset.v==='pics'));
  $('#picBox').style.display = 'block';
  applyPics(urls, true);
  if (!S.rain.active && S.mode === 'done'){ resultEl.classList.remove('on'); S.mode = 'armed'; }
  toast('贴图已套进气泡，敲！');
});
$('#picClear').addEventListener('click', ()=>{
  applyPics([], true);
  if (S.theme === 'pics'){
    S.theme = 'commute'; store.set('theme','commute');
    [...$('#chipsTheme').children].forEach(b=>b.classList.toggle('on', b.dataset.v==='commute'));
    $('#picBox').style.display = 'none';
    buildRound();
  }
  toast('已清除贴图');
});

/* ---------- 字效自定义 ---------- */
bindSeg('#segMark','markSize', v=>v);
$('#markApply').addEventListener('click', ()=>{
  const raw = $('#markInput').value || '';
  const arr = raw.split(/[\s,，、]+/).map(s=>s.trim()).filter(Boolean).slice(0, 12);
  S.markWords = arr.length ? arr : MARKS.slice();
  store.set('markWords', S.markWords);
  $('#markInput').value = S.markWords.join(' ');
  $('#markInput').blur();
  toast('字效已更新，敲一下试试');
});

$('#diyApply').addEventListener('click', ()=>{
  const raw = $('#diyInput').value || '';
  let arr = raw.split(/[\s,，、;；|]+/).map(s=>s.trim()).filter(Boolean).slice(0, 30);
  if (!arr.length){ toast('先写几个想敲碎的内容'); return; }
  S.diy = arr; store.set('diy', arr);
  S.theme = 'diy'; store.set('theme','diy');
  [...$('#chipsTheme').children].forEach(b=>b.classList.toggle('on', b.dataset.v==='diy'));
  if (!S.rain.active) buildRound();
  toast(S.rain.active ? '已应用，下一个烦恼就用新内容' : '已应用，敲起来试试');
  closePanel();
  $('#diyInput').blur();
});

function loadSettings(){
  S.theme = store.get('theme','commute');
  S.qty = clamp(store.get('qty',5), 1, 9);
  S.trigger = store.get('trigger','tap');
  S.hard = store.get('hard','normal');
  S.pack = store.get('pack','bubble');
  S.vib = store.get('vib', true);
  S.snd = store.get('snd', true);
  S.diy = store.get('diy', ['甲方','加班','早八']);
  S.markWords = store.get('markWords', MARKS.slice());
  if (!Array.isArray(S.markWords) || !S.markWords.length) S.markWords = MARKS.slice();
  S.markSize = store.get('markSize','m');
  S.shape = store.get('shape','bubble');
  if (!['bubble','rounded','hex','star','heart','none','mix'].includes(S.shape)) S.shape = 'bubble';
  S.sizeVar = clamp(parseFloat(store.get('sizeVar',0)) || 0, 0, 0.4);
  S.entrance = store.get('entrance','mix');
  if (!['mix','fly','float','fall','pop','none'].includes(S.entrance)) S.entrance = 'mix';
  S.burst = store.get('burst','mix');
  if (!['mix','crack','blast','puff'].includes(S.burst)) S.burst = 'mix';
  S.stats = Object.assign({rounds:0,pops:0,taps:0,bestCombo:0}, store.get('stats',{}));
  S.picData = store.get('picData', []);
  if (!Array.isArray(S.picData)) S.picData = [];
  S.pics = S.picData.map(d=>({data:d, img:imgFor(d)}));
  S.gameMode = store.get('gameMode','zen') === 'rain' ? 'rain' : 'zen';
  const dv = store.get('diff','normal');
  S.diff = DIFF[dv] ? dv : 'normal';
  const bd = store.get('board', []);
  S.board = Array.isArray(bd)
    ? bd.filter(r=>r && typeof r.score === 'number' && isFinite(r.score)).slice(0, 20)
    : [];
  S.cloudRank = store.get('cloudRank', false) === true;
  S.wx = store.get('wx', true) !== false;
  mark('#segTrigger', S.trigger);
  mark('#segHard', S.hard);
  mark('#segPack', S.pack);
  mark('#segVib', S.vib ? '1':'0');
  mark('#segSnd', S.snd ? '1':'0');
  mark('#segCount', S.qty);
  mark('#segMark', S.markSize);
  mark('#segShape', S.shape);
  mark('#segSize', String(S.sizeVar));
  mark('#segEnt', S.entrance);
  mark('#segBurst', S.burst);
  mark('#segCloud', S.cloudRank ? '1' : '0');
  mark('#segWx', S.wx ? '1' : '0');
  [...$('#chipsTheme').children].forEach(b=>b.classList.toggle('on', b.dataset.v === S.theme));
  $('#diyBox').style.display = S.theme === 'diy' ? 'block' : 'none';
  $('#picBox').style.display = S.theme === 'pics' ? 'block' : 'none';
  $('#diyInput').value = S.diy.join(' ');
  $('#markInput').value = S.markWords.join(' ');
  syncGuideMode();
}

/* ============================================================
   14. 启动
   ============================================================ */
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize, 220));
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden) detachMotion();
  else if (S.mode === 'armed' || S.mode === 'play') attachMotion();
  if (document.hidden) AU.ambient(0);
  else if (S.rain.active && S.wx) AU.ambient(S.rain.weather);
});

loadSettings();
window.__QS_TOAST = toast;
window.__QS_ON_SAVE_ERROR = function(){ toast('本地存储写入失败：请清理浏览器空间或导出档案'); };
// 全局异常兜底：不让脚本错误白屏，也不打断已开始的回合
let __errAt = 0;
function __softError(kind, detail){
  try { console.error('[QiaoSan]', kind, detail); } catch(e){}
  const now = Date.now();
  if (now - __errAt < 12000) return;
  __errAt = now;
  toast('出现了一点异常，已尽量保留进度；若反复出现请刷新页面');
}
window.addEventListener('error', e=>{
  if (e && e.target && e.target.tagName) return;
  __softError('error', e && (e.message || e.error));
});
window.addEventListener('unhandledrejection', e=>__softError('promise', e && e.reason));
window.addEventListener('pagehide', ()=>{ store.set('stats', S.stats); });
document.addEventListener('visibilitychange', ()=>{ if (document.hidden) store.set('stats', S.stats); });
if (window.QS && QS.init) QS.init();
if (IS_DESK){
  const gs = document.querySelector('.g-s');
  if (gs) gs.innerHTML = '用鼠标点气泡，两三下就碎<br>按住 Shift 点，一击爆破';
  const rt = document.querySelector('.r-tip');
  if (rt) rt.textContent = '或点「保存消散卡」直接下载 PNG · 900 × 1350';
}
resize();
buildRound();
S.mode = 'intro';
syncGuideMode();
updateRainHud();
requestAnimationFrame(frame);
window.__YS = {
  S:S, motion:motion, AU:AU, buildRound:buildRound, attack:attack, finish:finishRound,
  tick:update, draw:draw, shapePath:shapePath,
  startRain:startRain, spawnRain:spawnRain, finishRain:finishRain,
  bgKeyFor:bgKeyFor, makeRainCard:makeRainCard, openRank:openRank,
  emoji:()=>EMOJI_OK
};

})();
