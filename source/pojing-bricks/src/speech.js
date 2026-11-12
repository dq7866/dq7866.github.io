// 语音引导：用 Web Speech API 播报中文提示
// 浏览器支持度不一，全部做降级处理，失败就静默跳过

let voices = [];
let zhVoice = null;
let enabled = true;
let supported = false;
let lastSpoken = 0;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  voices = window.speechSynthesis.getVoices();
  zhVoice =
    voices.find(v => /zh[-_]CN/i.test(v.lang) && /female|ting|mei|xiao|hui/i.test(v.name)) ||
    voices.find(v => /zh[-_]CN/i.test(v.lang)) ||
    voices.find(v => /^zh/i.test(v.lang)) ||
    null;
}

if ('speechSynthesis' in window) {
  supported = true;
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  // Safari 有时要触发一次才加载
  setTimeout(pickVoice, 300);
  setTimeout(pickVoice, 1500);
}

export function speechSupported() { return supported && voices.length > 0; }

/**
 * 语音列表是异步加载的，页面刚打开时往往还是空的。
 * 需要在"列表就绪"这个时点上做判断的地方用这个回调。
 */
export function whenVoicesReady(cb) {
  if (!supported) return;
  if (voices.length) { cb(); return; }
  const h = () => { if (voices.length) { window.speechSynthesis.removeEventListener?.('voiceschanged', h); cb(); } };
  window.speechSynthesis.addEventListener?.('voiceschanged', h);
}
export function setSpeechEnabled(v) {
  enabled = v;
  if (!v && supported) window.speechSynthesis.cancel();
}
export function isSpeechEnabled() { return enabled; }

/**
 * 播报一句中文
 * @param {string} text
 * @param {{rate?:number, pitch?:number, force?:boolean}} opts
 */
export function say(text, opts = {}) {
  if (!enabled || !supported || !text) return;
  const now = performance.now();
  // 防止过密播报（1.2 秒内只播一次，除非强制）
  if (!opts.force && now - lastSpoken < 1200) return;
  lastSpoken = now;

  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    if (zhVoice) u.voice = zhVoice;
    u.rate = opts.rate ?? 1.02;
    u.pitch = opts.pitch ?? 1.18;
    u.volume = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* 静默失败 */ }
}

/** 打断当前播报并立即说 */
export function sayNow(text, opts = {}) {
  if (!enabled || !supported) return;
  try { window.speechSynthesis.cancel(); } catch { }
  say(text, { ...opts, force: true });
}

export const PRAISE = [
  '放得真好！',
  '这一块很稳。',
  '不错哦，继续。',
  '搭得越来越像了。',
  '你的想法很棒！',
  '再来一块吧。',
];

export function randomPraise() {
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}
