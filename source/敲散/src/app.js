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
  diy:{ name:'自定义', mode:'auto', items:[] }
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
  combo: 0, lastHitT: 0, comboUntil: 0,
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
  buildBackdrop();
  if (S.bubbles.length) placeBubbles();
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

function buildBackdrop(){
  bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.round(W*DPR); bgCanvas.height = Math.round(H*DPR);
  const g = bgCanvas.getContext('2d');
  g.setTransform(DPR,0,0,DPR,0,0);

  const lg = g.createLinearGradient(W*0.15,0,W*0.85,H);
  lg.addColorStop(0,'#151233'); lg.addColorStop(0.42,'#0d0b20'); lg.addColorStop(1,'#070510');
  g.fillStyle = lg; g.fillRect(0,0,W,H);

  const g1 = g.createRadialGradient(W*0.18,H*0.14,0,W*0.18,H*0.14,Math.max(W,H)*0.62);
  g1.addColorStop(0,'rgba(120,88,255,0.30)'); g1.addColorStop(0.55,'rgba(90,60,220,0.08)'); g1.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = g1; g.fillRect(0,0,W,H);

  const g2 = g.createRadialGradient(W*0.88,H*0.78,0,W*0.88,H*0.78,Math.max(W,H)*0.52);
  g2.addColorStop(0,'rgba(45,210,196,0.16)'); g2.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = g2; g.fillRect(0,0,W,H);

  const g3 = g.createRadialGradient(W*0.55,H*1.02,0,W*0.55,H*1.02,Math.max(W,H)*0.42);
  g3.addColorStop(0,'rgba(255,86,160,0.13)'); g3.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = g3; g.fillRect(0,0,W,H);

  g.globalAlpha = 0.42;
  g.fillStyle = g.createPattern(noiseTile(128,13),'repeat');
  g.fillRect(0,0,W,H);
  g.globalAlpha = 1;

  const vg = g.createRadialGradient(W*0.5,H*0.44,Math.min(W,H)*0.22,W*0.5,H*0.5,Math.max(W,H)*0.86);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.62)');
  g.fillStyle = vg; g.fillRect(0,0,W,H);

  glowV = radialGlow('rgba(140,110,255,0.5)',160);
  glowT = radialGlow('rgba(80,230,215,0.42)',160);
  glowP = radialGlow('rgba(255,120,180,0.35)',160);
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
      shape: S.shape, burstType: pickBurstStyle(),
      sizeF: 1 + rand(-S.sizeVar, S.sizeVar),
      entOX:0, entOY:0, entS:1, entR:0, entA:1, ent:null,
      grad:null, fs:0, cracks:null, flash:0
    };
    if (kind === 'image' && S.pics.length) b.pic = S.pics[i % S.pics.length];
    S.bubbles.push(b);
    b.ent = makeEntrance(i, n);
    if (b.ent) b.entA = 0;
  });
  S.items = picked.slice();
  S.kinds = S.bubbles.map(b=>b.kind);
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
      for (let k=0;k<10;k++){
        if (measure(b.word, fs) <= b.r*1.46) break;
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
    if (d < p.r*1.18 && d < bd){ best = b; bd = d; }
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

  renderDots();
  if (S.bubbles.every(x=>x.dead)) setTimeout(finishRound, 640);
}

/* ============================================================
   9. 循环
   ============================================================ */
let last = performance.now();
function frame(now){
  let dt = (now-last)/1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (window.QS && QS.locked && QS.locked()){
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
    } else if (g.kind === 'image' && g.pic && g.pic.img && g.pic.img.complete && g.pic.img.naturalWidth){
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

  // 爆炸白闪（最顶层）
  if (S.flash > 0.005){
    ctx.fillStyle = 'rgba(255,255,255,' + S.flash.toFixed(3) + ')';
    ctx.fillRect(0,0,W,H);
  }
}

/* 内容分发：文字 / emoji / 内置图案 / 图片贴图，主画布与消散卡共用 */
function paintKind(g, b, r, scale, shape){
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (b.kind === 'emoji'){
    g.font = (b.fs*scale) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText(b.word, 0, r*0.04, r*1.66);
  } else if (b.kind === 'icon'){
    (ICONS[b.word]||ICONS.man)(g, r*0.58*scale);
  } else if (b.kind === 'image'){
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
    g.fillText(b.word, 0, 1.5, r*1.8);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillText(b.word, 0, 0, r*1.8);
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
  buildRound();
  S.phrase = '';
  S.mode = 'armed';
  S.rline = lineLabel();
  dotsEl.classList.add('on');
  setHint(S.trigger === 'tap' ? '敲碎它们' : '摇一摇，撞碎它们', true);
  setTimeout(()=>{ if (S.mode === 'armed') setHint('', false); }, 6500);
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
  const cardShape = S.shape === 'none' ? 'bubble' : S.shape;
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
      const pic = S.pics.length ? S.pics[idx % S.pics.length] : null;
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

bindSeg('#segCount','qty', v=>parseInt(v,10), ()=>{ buildRound(); });
bindSeg('#segTrigger','trigger', v=>v, ()=>{
  if (S.mode === 'play' || S.mode === 'armed'){
    setHint(v==='tap' ? '敲碎它们' : '摇一摇，撞碎它们', true);
    setTimeout(()=>{ if (S.mode === 'play' || S.mode === 'armed') setHint('', false); }, 4200);
  }
  if (v === 'shake') requestMotion();
});
bindSeg('#segHard','hard', v=>v, ()=>{ buildRound(); });
bindSeg('#segShape','shape', v=>v, ()=>{ buildRound(); });
bindSeg('#segSize','sizeVar', v=>parseFloat(v)||0, ()=>{ buildRound(); });
bindSeg('#segEnt','entrance', v=>v, ()=>{ buildRound(); });
bindSeg('#segBurst','burst', v=>v, ()=>{
  S.bubbles.forEach(b=>{ b.burstType = pickBurstStyle(); });
});
bindSeg('#segPack','pack', v=>v, ()=>{ AU.play('shatter', 1); });
bindSeg('#segVib','vib', v=>v==='1');
bindSeg('#segSnd','snd', v=>v==='1');

$('#chipsTheme').addEventListener('click', e=>{
  const btn = e.target.closest('button');
  if (!btn) return;
  [...$('#chipsTheme').children].forEach(b=>b.classList.toggle('on', b===btn));
  S.theme = btn.dataset.v;
  store.set('theme', S.theme);
  $('#diyBox').style.display = S.theme === 'diy' ? 'block' : 'none';
  $('#picBox').style.display = S.theme === 'pics' ? 'block' : 'none';
  if (S.theme === 'diy') $('#diyInput').value = S.diy.join(' ');
  buildRound();
  if (!EMOJI_OK && (S.theme === 'bugs' || S.theme === 'faces')) toast('当前环境不支持图案，已用文字代替');
  if (S.theme === 'pics' && !S.pics.length) toast('先在下方选择图片');
});

/* ---------- 图片贴图 ---------- */
const IMG_CACHE = new Map();
function imgFor(data){
  if (!IMG_CACHE.has(data)){
    const im = new Image();
    im.src = data;
    IMG_CACHE.set(data, im);
  }
  return IMG_CACHE.get(data);
}
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
  if (S.mode === 'done'){ resultEl.classList.remove('on'); S.mode = 'armed'; }
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
  buildRound();
  toast('已应用，敲起来试试');
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
  if (!['bubble','rounded','hex','star','heart','none'].includes(S.shape)) S.shape = 'bubble';
  S.sizeVar = clamp(parseFloat(store.get('sizeVar',0)) || 0, 0, 0.4);
  S.entrance = store.get('entrance','mix');
  if (!['mix','fly','float','fall','pop','none'].includes(S.entrance)) S.entrance = 'mix';
  S.burst = store.get('burst','mix');
  if (!['mix','crack','blast','puff'].includes(S.burst)) S.burst = 'mix';
  S.stats = Object.assign({rounds:0,pops:0,taps:0,bestCombo:0}, store.get('stats',{}));
  S.picData = store.get('picData', []);
  if (!Array.isArray(S.picData)) S.picData = [];
  S.pics = S.picData.map(d=>({data:d, img:imgFor(d)}));
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
  [...$('#chipsTheme').children].forEach(b=>b.classList.toggle('on', b.dataset.v === S.theme));
  $('#diyBox').style.display = S.theme === 'diy' ? 'block' : 'none';
  $('#picBox').style.display = S.theme === 'pics' ? 'block' : 'none';
  $('#diyInput').value = S.diy.join(' ');
  $('#markInput').value = S.markWords.join(' ');
}

/* ============================================================
   14. 启动
   ============================================================ */
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize, 220));
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden) detachMotion();
  else if (S.mode === 'armed' || S.mode === 'play') attachMotion();
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
requestAnimationFrame(frame);
window.__YS = {
  S:S, motion:motion, AU:AU, buildRound:buildRound, attack:attack, finish:finishRound,
  tick:update, draw:draw, shapePath:shapePath,
  emoji:()=>EMOJI_OK
};

})();
