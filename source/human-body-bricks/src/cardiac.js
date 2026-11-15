// cardiac.js — 一套统一的心动周期
//
// 之前的心跳是「两个高斯峰 + 整体等比缩放」，看着像橡皮球一鼓一鼓。
// 真实心动周期（72 bpm，T=0.86s）是有明确分期的：
//   0.00–0.06 等容收缩（压力骤升，形状几乎不变）
//   0.06–0.20 快速射血（心室壁厚、长轴缩短、心尖扭转）
//   0.20–0.36 减慢射血
//   0.36–0.46 等容舒张（快速解扭 untwist，比收缩时的扭转更快）
//   0.46–0.62 快速充盈       0.62–0.88 缓慢充盈
//   0.88–1.00 心房收缩（心房收缩期，心室被动再充盈）
// 动脉压力波另有「重搏切迹 / 重搏波」：主峰之后一个小回弹，
// 血管壁的鼓包就按这个波形沿血管向外传播。
//
// 所有模块（心肌顶点变形、冠脉、联动管网、器官脉搏）共用这里的时间函数，
// 保证「心肌一收缩 → 主动脉鼓一下 → 颈动脉晚一拍鼓 → 器官潮红」是对齐的。

export const CARDIAC_T = 0.86;

const clamp01 = x => Math.max(0, Math.min(1, x));
function smoothstep(a, b, x) {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}
const gauss = (x, c, w) => {
  const d = (x - c) / w;
  return Math.exp(-d * d);
};
const fract = x => x - Math.floor(x);

/** 动脉压力波：收缩主峰 + 重搏波（主动脉瓣关闭的回弹），带一点舒张基线 */
export function arterialWave(phase) {
  const p = fract(phase);
  return Math.min(1, 0.95 * gauss(p, 0.135, 0.075) + 0.30 * gauss(p, 0.36, 0.10) + 0.06);
}

/**
 * @param {number} t 秒
 * @returns {{p,sys,atrial,twist,ejection,pulse,flow}}
 *   sys      心室收缩（0~1 平台）
 *   atrial   心房收缩（舒张末小峰）
 *   twist    心肌螺旋扭转（射血期拧紧、等容舒张快速解开）
 *   ejection 射血窗（冠脉被挤压、大血管射血）
 *   pulse    动脉压力波（血管壁鼓包 / 器官光泽）
 *   flow     血流速度调制（收缩期快、舒张期慢）
 */
export function cardiac(t) {
  const p = fract(t / CARDIAC_T);
  const sys = smoothstep(0.02, 0.105, p) * (1 - smoothstep(0.30, 0.475, p));
  const atrial = gauss(p, 0.935, 0.048) * 0.9;
  const twist = smoothstep(0.03, 0.27, p) * (1 - smoothstep(0.345, 0.50, p));
  const ejection = smoothstep(0.055, 0.09, p) * (1 - smoothstep(0.335, 0.385, p));
  const pulse = arterialWave(p);
  const flow = 0.42 + 1.15 * ejection + 0.24 * gauss(p, 0.56, 0.10);
  return { p, sys, atrial, twist, ejection, pulse, flow };
}

/** GLSL 版动脉压力波：与 JS 版逐值一致（pow 负底数在 GLSL 未定义，故用 d*d） */
export const CARDIAC_GLSL = /* glsl */`
float cardiacFract(float x){ return x - floor(x); }
float arterialWave(float phase){
  float p = cardiacFract(phase);
  float d1 = (p - 0.135) / 0.075;
  float d2 = (p - 0.36) / 0.10;
  return min(1.0, 0.95 * exp(-d1*d1) + 0.30 * exp(-d2*d2) + 0.06);
}
`;
