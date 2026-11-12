// 程序化音效（无外部资源，WebAudio 合成）
let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setSoundEnabled(v) { enabled = v; }

function tone({ freq = 440, dur = 0.09, type = 'sine', gain = 0.12, slide = 0, delay = 0 }) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// 噪声缓冲只生成一次，之后复用（每次放置都新建会白白产生垃圾对象）
let noiseBuf = null;
function getNoiseBuf(c, dur) {
  const len = Math.floor(c.sampleRate * dur);
  if (!noiseBuf || noiseBuf.length < len) {
    noiseBuf = c.createBuffer(1, Math.max(len, 2048), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const k = i / Math.floor(c.sampleRate * 0.1);
      d[i] = (Math.random() * 2 - 1) * Math.pow(Math.max(0, 1 - k), 2.4);
    }
  }
  return noiseBuf;
}

function noise({ dur = 0.08, gain = 0.06 }) {
  if (!enabled) return;
  const c = ac();
  if (!c) return;
  const buf = getNoiseBuf(c, dur);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1600;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

const PLACE_SCALE = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
let placeIdx = 0;

export const sfx = {
  unlock() { if (enabled) ac(); },   // 静音时没必要建音频上下文
  place() {
    // 每放一块音高递进，像在弹琴
    tone({ freq: PLACE_SCALE[placeIdx % PLACE_SCALE.length], dur: 0.12, type: 'triangle', gain: 0.1 });
    placeIdx++;
    noise({ dur: 0.05, gain: 0.045 });
  },
  remove() {
    tone({ freq: 300, slide: -160, dur: 0.13, type: 'triangle', gain: 0.1 });
    noise({ dur: 0.06, gain: 0.04 });
  },
  rotate() {
    tone({ freq: 660, dur: 0.05, type: 'square', gain: 0.04 });
    tone({ freq: 880, dur: 0.05, type: 'square', gain: 0.03, delay: 0.045 });
  },
  pick() { tone({ freq: 740, dur: 0.05, type: 'sine', gain: 0.06 }); },
  paint() {
    tone({ freq: 880, dur: 0.07, type: 'sine', gain: 0.07 });
    tone({ freq: 1174, dur: 0.1, type: 'sine', gain: 0.05, delay: 0.06 });
  },
  undo() { tone({ freq: 520, slide: -120, dur: 0.1, type: 'sine', gain: 0.06 }); },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.09, delay: i * 0.09 }));
  },
  select() { placeIdx = 0; },
};
