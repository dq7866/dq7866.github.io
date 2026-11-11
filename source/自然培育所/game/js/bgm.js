/* ============================================================
   Nature Lab · 氛围 BGM
   程序化生成的环境音乐，无音频文件——单文件版离线可用。

   结构：
   - 低音铺底：两个正弦振荡器轻微失谐 + 低通滤波，长音和弦垫
   - 五声音阶随机琶音：偶发、音量很低，像远处的风铃
   - 和弦进行：Am → F → C → G 的慢循环，每和弦约 9 秒，不动声色

   控制：独立开关 + 独立音量（存 localStorage，与音效/存档分离）。
   浏览器自动播放策略：首次用户手势后才启动。
   ============================================================ */

const BGM_KEY = (typeof storeKey === 'function') ? storeKey('bgm') : 'naturelab.bgm';
const BGM_VOL_KEY = (typeof storeKey === 'function') ? storeKey('bgmVol') : 'naturelab.bgmVol';

let _bgmOn = null;          // null = 未读取
let _bgmVol = null;         // 0..1
let _bgmGain = null;        // BGM 独立总线
let _bgmTimer = null;       // 和弦调度器
let _bgmVoices = [];        // 当前和弦的振荡器，换和弦时停掉

function bgmOn() {
  if (_bgmOn === null) {
    try { _bgmOn = localStorage.getItem(BGM_KEY) === '1'; } catch (e) { _bgmOn = false; }
  }
  return _bgmOn;
}
function bgmVol() {
  if (_bgmVol === null) {
    try {
      const v = parseFloat(localStorage.getItem(BGM_VOL_KEY));
      _bgmVol = isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
    } catch (e) { _bgmVol = 0.5; }
  }
  return _bgmVol;
}
function setBgmVol(v) {
  _bgmVol = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(BGM_VOL_KEY, String(_bgmVol)); } catch (e) {}
  if (_bgmGain && _actx) {
    _bgmGain.gain.setTargetAtTime(_bgmVol * 0.16, _actx.currentTime, 0.25);
  }
  return _bgmVol;
}
function setBgmOn(on) {
  _bgmOn = !!on;
  try { localStorage.setItem(BGM_KEY, _bgmOn ? '1' : '0'); } catch (e) {}
  if (_bgmOn) bgmStart(); else bgmStop();
  return _bgmOn;
}

/* ---------------- 场景变奏 ----------------
   不同栖息地 / 昼夜用不同的和弦色彩与琶音密度：
   - greenhouse 白天：A 小调暖色铺底（原版）
   - night     夜晚：整体降八度、琶音更稀疏，像夜里的虫鸣点缀
   - water     水景：D 多利亚（更清亮）+ 持续的流水白噪声
   - hive      蜂房：C 大调明亮、琶音更密，register 抬高
   - dark      暗房：降八度 + 更慢 + 几乎无琶音，只留低音呼吸
*/
const BGM_SCENES = {
  greenhouse: {
    prog: [[45,52,57,60],[41,48,53,57],[48,55,60,64],[43,50,55,59]],
    scale: [69,72,74,76,79,81,84],       // A 五声
    sec: 9, pluckEvery: 2.2, oct: 0, vol: 1,
  },
  night: {
    prog: [[33,40,45,48],[29,36,41,45],[36,43,48,52],[31,38,43,47]],  // 同进行，低八度
    scale: [57,60,62,64,67,69,72],
    sec: 11, pluckEvery: 4.5, oct: 0, vol: 0.9,
  },
  water: {
    prog: [[38,45,50,53],[34,41,46,50],[41,48,53,55],[36,43,48,50]],  // Dm Bb F C
    scale: [62,65,67,69,72,74,77],       // D 五声
    sec: 8.5, pluckEvery: 2.6, oct: 0, vol: 0.95, water: true,
  },
  hive: {
    prog: [[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]],  // C Am F G
    scale: [72,74,76,79,81,84,86],       // C 五声，偏高
    sec: 8, pluckEvery: 1.6, oct: 0, vol: 1,
  },
  dark: {
    prog: [[33,40,45,48],[31,38,43,47]], // 只留 Am / G 低音，更长
    scale: [57,60,62,64,67],
    sec: 14, pluckEvery: 7, oct: 0, vol: 0.85,
  },
};
let _bgmScene = 'greenhouse';
let _bgmStep = 0;

/* 四季色彩：在场景之上再叠一层移调与密度修饰——
   春（基准）→ 夏（+2 半音，更亮）→ 秋（-3，暖褐）→ 冬（-5，萧瑟、更慢更稀） */
const BGM_SEASONS = {
  spring: { tp: 0,  vol: 1.00, pluck: 1.00, sec: 1.00 },
  summer: { tp: 2,  vol: 1.00, pluck: 1.15, sec: 0.95 },
  autumn: { tp: -3, vol: 0.95, pluck: 0.90, sec: 1.05 },
  winter: { tp: -5, vol: 0.85, pluck: 0.70, sec: 1.18 },
};
let _bgmSeason = 'spring';

// UI 层每季切换时调用（lightRefresh 传入 seasonForDay(S.day).key）；内部去重
function bgmSetSeason(key) {
  const next = BGM_SEASONS[key] ? key : 'spring';
  if (next === _bgmSeason) return false;
  _bgmSeason = next;
  // 平滑换季：不用整个重启，下一和弦自然带上新调（最多等一个和弦周期）
  return true;
}
function bgmSeason() { return _bgmSeason; }

// 供 UI 层调用：kind 取栖息地，night 取昼夜。重复调用同场景是安全的（内部去重）
function bgmSetScene(kind, night) {
  const map = { water: 'water', hive: 'hive', dark: 'dark' };
  const next = night ? 'night' : (map[kind] || 'greenhouse');
  if (next === _bgmScene) return false;
  const wasRunning = !!_bgmTimer;
  _bgmScene = next;
  if (wasRunning) {
    // 平滑换景：停掉当前调度，2 秒内旧和弦淡出，新和弦从头起
    if (_bgmTimer) { clearTimeout(_bgmTimer); _bgmTimer = null; }
    _bgmVoices.forEach(o => { try { o.stop(_actx.currentTime + 1.8); } catch (e) {} });
    _bgmVoices = [];
    bgmStopWater();
    _bgmStep = 0;
    bgmTick(0);
  }
  return true;
}
function bgmScene() { return _bgmScene; }

/* ---------------- 水景流水层：循环白噪声 + 低通 + 缓慢起伏 ---------------- */
let _waterSrc = null, _waterGain = null;
function bgmStartWater() {
  const bus = bgmBus(); if (!bus || !_actx || _waterSrc) return;
  try {
    if (!_noiseBuf) {
      // sound.js 的噪声缓冲是懒加载的，这里自建一份，不依赖玩家先触发过水声音效
      _noiseBuf = _actx.createBuffer(1, _actx.sampleRate * 1.2, _actx.sampleRate);
      const d = _noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    _waterSrc = _actx.createBufferSource();
    _waterSrc.buffer = _noiseBuf;
    _waterSrc.loop = true;
    const lp = _actx.createBiquadFilter();
    lp.type = 'bandpass'; lp.frequency.value = 850; lp.Q.value = 0.55;
    _waterGain = _actx.createGain();
    _waterGain.gain.setValueAtTime(0.0001, _actx.currentTime);
    _waterGain.gain.linearRampToValueAtTime(0.045, _actx.currentTime + 3);
    // 缓慢 LFO 让水流有呼吸感
    const lfo = _actx.createOscillator(), lfoG = _actx.createGain();
    lfo.frequency.value = 0.13; lfoG.gain.value = 0.012;
    lfo.connect(lfoG); lfoG.connect(_waterGain.gain); lfo.start();
    _waterSrc.connect(lp); lp.connect(_waterGain); _waterGain.connect(bus);
    _waterSrc.start();
    _waterSrc._lfo = lfo;
  } catch (e) { _waterSrc = null; }
}
/* ---------------- 音乐响应：关键事件时给 BGM 一个小「 accent 」 ----------------
   good：当前场景音阶上的上行三连琶音（收获 / 成就 / 通晓）
   bad ：低音区小二度涌动（死亡 / 恶性事件），与小二度不安音程的音效呼应
   BGM 没开时静默跳过——音效层本身有独立反馈，不依赖这层。 */
function bgmAccent(kind) {
  if (!bgmOn()) return;
  if (typeof audioCtxForce !== 'function' || !audioCtxForce()) return;
  const sc = BGM_SCENES[_bgmScene] || BGM_SCENES.greenhouse;
  const se = BGM_SEASONS[_bgmSeason] || BGM_SEASONS.spring;
  const tp = se.tp;
  if (kind === 'good') {
    // 从音阶顶部往下取三个音做上行，收在最高的音上
    const top = sc.scale.slice(-3);
    top.forEach((m, i) => setTimeout(() => {
      if (bgmOn()) bgmPluck(midiHz(m + tp + 12), 0.16);
    }, i * 130));
  } else if (kind === 'bad') {
    const root = sc.prog[0][0] + tp - 12;   // 当前调的更低八度根音
    bgmPad(midiHz(root), 3.2, 0.5);
    bgmPad(midiHz(root + 1), 3.2, 0.28);    // 小二度摩擦
  }
}

function bgmStopWater() {
  if (!_waterSrc || !_actx) return;
  try {
    _waterGain.gain.setTargetAtTime(0, _actx.currentTime, 0.6);
    const src = _waterSrc, lfo = _waterSrc._lfo;
    setTimeout(() => { try { src.stop(); lfo.stop(); } catch (e) {} }, 2000);
  } catch (e) {}
  _waterSrc = null; _waterGain = null;
}

/* ---------------- 声学细节 ---------------- */
const CHORD_SEC = 9;                 // 兼容旧引用；实际每场景有自己的 sec

function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

function bgmBus() {
  if (typeof audioCtxForce !== 'function') return null;
  if (!audioCtxForce()) return null;
  if (!_bgmGain) {
    _bgmGain = _actx.createGain();
    _bgmGain.gain.value = 0;   // 淡入
    // 低通把整个 BGM 压得柔和，不与音效抢频率
    const lp = _actx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1900; lp.Q.value = 0.4;
    _bgmGain.connect(lp); lp.connect(_actx.destination);
  }
  return _bgmGain;
}

// 一个持续 pad 音：双振荡器轻微失谐产生宽度
function bgmPad(freq, dur, vol) {
  const bus = bgmBus(); if (!bus || !_actx) return;
  const t0 = _actx.currentTime;
  const g = _actx.createGain();
  // 长淡入淡出，和弦之间无缝
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 2.2);
  g.gain.setValueAtTime(vol, t0 + dur - 2.6);
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  g.connect(bus);
  [-2.5, 2.5].forEach(det => {
    const o = _actx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.detune.value = det;
    o.connect(g); o.start(t0); o.stop(t0 + dur + 0.1);
    _bgmVoices.push(o);
  });
}

// 一粒琶音：短促正弦 + 轻微回声感（第二个延迟音）
function bgmPluck(freq, vol) {
  const bus = bgmBus(); if (!bus || !_actx) return;
  const t0 = _actx.currentTime;
  [[0, vol], [0.28, vol * 0.35]].forEach(([dl, v]) => {
    const o = _actx.createOscillator();
    const g = _actx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0 + dl);
    g.gain.exponentialRampToValueAtTime(v, t0 + dl + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dl + 1.6);
    o.connect(g); g.connect(bus);
    o.start(t0 + dl); o.stop(t0 + dl + 1.7);
  });
}

// 调度一个和弦 + 偶发琶音，然后排下一个（按当前场景取参数）
function bgmTick(step) {
  if (!bgmOn()) return;
  if (typeof audioCtxForce !== 'function' || !audioCtxForce()) return;
  const sc = BGM_SCENES[_bgmScene] || BGM_SCENES.greenhouse;
  const se = BGM_SEASONS[_bgmSeason] || BGM_SEASONS.spring;
  const tp = se.tp;                       // 季节移调（半音）
  const chord = sc.prog[step % sc.prog.length];
  const dur = sc.sec * se.sec + 1.5;      // 重叠 1.5s，换和弦更顺
  const v = sc.vol * se.vol;
  chord.forEach((m, i) => bgmPad(midiHz(m + sc.oct * 12 + tp), dur, (i === 0 ? 0.5 : 0.22) * v));

  // 偶发琶音：密度由 pluckEvery 控制（值越大越稀疏）
  const n = Math.max(1, Math.round(sc.sec / sc.pluckEvery * 0.55 * se.pluck));
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      if (!bgmOn()) return;
      const sc2 = BGM_SCENES[_bgmScene] || BGM_SCENES.greenhouse;
      const se2 = BGM_SEASONS[_bgmSeason] || BGM_SEASONS.spring;
      const m = sc2.scale[Math.random() * sc2.scale.length | 0];
      bgmPluck(midiHz(m + sc2.oct * 12 + se2.tp), (0.10 + Math.random() * 0.05) * sc2.vol * se2.vol);
    }, (1.5 + Math.random() * (sc.sec * se.sec - 2)) * 1000);
  }

  // 水景：确保流水层在跑；非水景：确保它停了
  if (sc.water) bgmStartWater(); else bgmStopWater();

  _bgmTimer = setTimeout(() => bgmTick(step + 1), sc.sec * se.sec * 1000);
}

function bgmStart() {
  if (typeof audioCtxForce !== 'function' || !audioCtxForce()) return;       // 没有手势前 AudioContext 起不来，等下次调用
  const bus = bgmBus(); if (!bus) return;
  if (_actx.state === 'suspended') { _actx.resume().catch(() => {}); }
  // 静音总开关只管音效，BGM 独立；但音量跟随自己的滑杆
  bus.gain.cancelScheduledValues(_actx.currentTime);
  bus.gain.setTargetAtTime(bgmVol() * 0.16, _actx.currentTime, 1.2);
  if (!_bgmTimer) { _bgmStep = Math.random() * 4 | 0; bgmTick(_bgmStep); }
}

function bgmStop() {
  if (_bgmTimer) { clearTimeout(_bgmTimer); _bgmTimer = null; }
  bgmStopWater();
  if (_bgmGain && _actx) {
    // 2 秒淡出，避免戛然而止
    _bgmGain.gain.setTargetAtTime(0, _actx.currentTime, 0.5);
    const dead = _bgmVoices.slice();
    setTimeout(() => dead.forEach(o => { try { o.stop(); } catch (e) {} }), 2200);
  }
  _bgmVoices = [];
}

