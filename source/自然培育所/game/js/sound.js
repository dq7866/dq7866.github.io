/* ============================================================
   Nature Lab · 音效
   全部用 Web Audio 现场合成，不加载任何音频文件——单文件版照样可用。
   设计原则：
   - 音量整体压得很低（-12dB 左右），是"氛围反馈"不是"音效游戏"
   - 浏览器策略：首次用户手势后才创建 AudioContext，之前调用一律静默丢弃
   - 静音状态存 localStorage，重开游戏也记得
   ============================================================ */

const SOUND_KEY = (typeof storeKey === 'function') ? storeKey('sound') : 'naturelab.sound';
const VOL_KEY = (typeof storeKey === 'function') ? storeKey('vol') : 'naturelab.vol';

let _actx = null;
let _muted = null;          // null = 尚未读取
let _master = null;         // 总线增益
let _vol = null;            // 0..1 音量倍率，null = 尚未读取

// 音量：三档以外的连续滑杆，默认 0.7（对应总线 0.34 → 约 -12dB）
function soundVol() {
  if (_vol === null) {
    try {
      const v = parseFloat(localStorage.getItem(VOL_KEY));
      _vol = isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
    } catch (e) { _vol = 0.7; }
  }
  return _vol;
}
function setSoundVol(v) {
  _vol = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(VOL_KEY, String(_vol)); } catch (e) {}
  if (_master && _actx) {
    // 二级曲线：低音量区更细腻，避免拖到 10% 就听不见
    _master.gain.setTargetAtTime(_vol * _vol * 0.7, _actx.currentTime, 0.02);
  }
  return _vol;
}

function soundMuted() {
  if (_muted === null) {
    try { _muted = localStorage.getItem(SOUND_KEY) === '0'; } catch (e) { _muted = false; }
  }
  return _muted;
}
function toggleSound() {
  _muted = !soundMuted();
  try { localStorage.setItem(SOUND_KEY, _muted ? '0' : '1'); } catch (e) {}
  return _muted;
}

function audioCtx() {
  if (soundMuted()) return null;
  return audioCtxForce();
}

// 不受音效静音开关限制的上下文——BGM 有自己的开关，不该被音效静音连坐
function audioCtxForce() {
  if (!_actx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      _actx = new AC();
      _master = _actx.createGain();
      // 总音量：氛围级。基础增益 0.7，再乘用户音量滑杆（二级曲线）
      const v = soundVol();
      _master.gain.value = v * v * 0.7;
      _master.connect(_actx.destination);
    } catch (e) { return null; }
  }
  if (_actx.state === 'suspended') { _actx.resume().catch(() => {}); }
  return _actx;
}

// 基础发声单元：一个包络包住的振荡器
// freq 起止频率（Hz），dur 时长（s），type 波形，vol 峰值（0..1），delay 起始延迟（s）
function tone(freq, endFreq, dur, type, vol, delay) {
  const ctx = audioCtx(); if (!ctx || !_master) return;
  try {
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq && endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + dur);
    // 包络：快起缓落，避免"咔哒"爆音
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(_master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  } catch (e) { /* 音频失败绝不影响游戏逻辑 */ }
}

// 噪声单元：水声/土音这类"质感声"用过滤白噪声
let _noiseBuf = null;
function noise(dur, vol, filterFreq, delay, sweep) {
  const ctx = audioCtx(); if (!ctx || !_master) return;
  try {
    if (!_noiseBuf) {
      _noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const d = _noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = _noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(filterFreq, t0);
    if (sweep) flt.frequency.exponentialRampToValueAtTime(Math.max(sweep, 40), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(_master);
    src.start(t0); src.stop(t0 + dur + 0.03);
  } catch (e) {}
}

// 具名音效表——每个都解释一下"是什么声音"，方便以后调
const SFX = {
  click()    { tone(620, 520, 0.06, 'triangle', 0.16); },
  // 播种：一粒种子落进松土——短促的低频土音 + 一点摩擦
  plant()    { noise(0.16, 0.28, 900, 0, 300); tone(180, 120, 0.1, 'sine', 0.2, 0.02); },
  // 浇水：水声由高频噪声快速下扫构成
  water()    { noise(0.32, 0.2, 2600, 0, 700); },
  // 设备开关：继电器"嗒"
  device()   { tone(880, 880, 0.03, 'square', 0.09); tone(440, 440, 0.04, 'square', 0.07, 0.045); },
  // 收获：三音上行琶音，明亮收尾
  harvest()  { tone(523, 523, 0.1, 'sine', 0.2, 0); tone(659, 659, 0.1, 'sine', 0.2, 0.09); tone(784, 1046, 0.22, 'sine', 0.24, 0.18); },
  // 金币：两声金属感短音
  coin()     { tone(1180, 1180, 0.05, 'triangle', 0.13, 0); tone(1560, 1560, 0.07, 'triangle', 0.11, 0.06); },
  // 升级：四音级进
  levelup()  { [392, 494, 587, 784].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.2, i * 0.09)); },
  // 成就：钟声感（基音 + 泛音）
  achv()     { tone(880, 880, 0.5, 'sine', 0.18, 0); tone(1760, 1760, 0.4, 'sine', 0.07, 0.01); tone(1320, 1320, 0.45, 'sine', 0.08, 0.06); },
  // 事件：中性提示双音
  event()    { tone(587, 587, 0.09, 'sine', 0.15, 0); tone(440, 440, 0.14, 'sine', 0.13, 0.1); },
  // 警告（病害/水质超标）：小二度不安音程，重复两下
  alarm()    { tone(311, 311, 0.11, 'sawtooth', 0.08, 0); tone(329, 329, 0.11, 'sawtooth', 0.08, 0.13); tone(311, 311, 0.11, 'sawtooth', 0.07, 0.3); tone(329, 329, 0.13, 'sawtooth', 0.07, 0.42); },
  // 死亡：下行小调，长衰减
  dead()     { tone(330, 165, 0.7, 'sine', 0.18, 0); tone(262, 130, 0.8, 'sine', 0.13, 0.15); },
  // 里程碑/通晓：上行大六度
  mile()     { tone(523, 523, 0.1, 'sine', 0.16, 0); tone(880, 880, 0.3, 'sine', 0.2, 0.1); },
  // 换水：长长的水声
  refill()   { noise(0.55, 0.16, 3200, 0, 500); tone(220, 330, 0.3, 'sine', 0.06, 0.1); },
  // 弹窗开启/关闭
  open()     { tone(520, 660, 0.07, 'sine', 0.1); },
  close()    { tone(660, 520, 0.06, 'sine', 0.09); }
};

// 统一入口：sfx('harvest')
function sfx(name) {
  if (soundMuted()) return;
  const fn = SFX[name];
  if (fn) { try { fn(); } catch (e) {} }
}

// 按品质微调的收获音：S 级多一层高音，让人"听得出"这次收得好
function sfxHarvestGrade(grade) {
  sfx('harvest');
  if (grade === 'S') tone(1318, 1318, 0.3, 'sine', 0.14, 0.3);
  else if (grade === 'A') tone(1046, 1046, 0.22, 'sine', 0.1, 0.28);
}

