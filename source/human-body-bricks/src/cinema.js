// cinema.js — 生理动画的「摄影指导」
//
// 三个职责：
//   1. 调色：每个系统一套电影调色（对应 postfx 的 grade 参数）
//   2. 灯光：加一盏跟随相机的轮廓光（rim），把半透明人体勾出边缘
//   3. 运镜：慢慢环绕 + 呼吸式推拉 + 极轻的手持抖动；用户一动手就让位
//
// 这里只改相机目标值与灯光参数，不接管 OrbitCam 本身，所以拖拽旋转、
// 滚轮缩放照常可用。
import * as THREE from '../lib/three.module.js';
import { EXTRA_LOOK } from './physio-extra.js';

// 每套动画的「画面性格」：色温、对比、光晕强度、机位运动速度
const LOOK = {
  circulation: {
    accent: 0xff5a6a, rim: 0x5b8ef0, rimI: 2.0, fillI: 0.5,
    bloom: 1.65, exposure: 1.02, sat: 1.12, vignette: 0.58, grain: 0.03,
    shadow: [0.020, 0.026, 0.070], highlight: [0.055, 0.020, 0.020],
    orbit: 0.075, shake: 0.010, dolly: 0.5,
  },
  digestion: {
    accent: 0xffb257, rim: 0xffc98a, rimI: 1.7, fillI: 0.55,
    bloom: 1.35, exposure: 1.06, sat: 1.02, vignette: 0.5, grain: 0.026,
    shadow: [0.045, 0.028, 0.012], highlight: [0.05, 0.038, 0.014],
    orbit: 0.052, shake: 0.008, dolly: 0.34,
  },
  neural: {
    accent: 0xffc94d, rim: 0x7fb2ff, rimI: 2.2, fillI: 0.42,
    bloom: 1.9, exposure: 0.98, sat: 1.16, vignette: 0.6, grain: 0.032,
    shadow: [0.020, 0.030, 0.062], highlight: [0.062, 0.048, 0.010],
    orbit: 0.09, shake: 0.012, dolly: 0.42,
  },
  breath: {
    accent: 0x6fd0ff, rim: 0xa8e6ff, rimI: 1.8, fillI: 0.5,
    bloom: 1.5, exposure: 1.08, sat: 1.0, vignette: 0.46, grain: 0.024,
    shadow: [0.012, 0.038, 0.062], highlight: [0.010, 0.040, 0.055],
    orbit: 0.045, shake: 0.007, dolly: 0.38,
  },
  immune: {
    accent: 0xfff1c9, rim: 0x8ef0c8, rimI: 1.9, fillI: 0.46,
    bloom: 1.7, exposure: 1.02, sat: 1.04, vignette: 0.55, grain: 0.028,
    shadow: [0.014, 0.036, 0.040], highlight: [0.045, 0.048, 0.030],
    orbit: 0.06, shake: 0.009, dolly: 0.36,
  },
  lymphatic: {
    accent: 0x7fe3c4, rim: 0x9fe0ff, rimI: 1.8, fillI: 0.46,
    bloom: 1.55, exposure: 1.03, sat: 1.04, vignette: 0.52, grain: 0.026,
    shadow: [0.010, 0.040, 0.045], highlight: [0.020, 0.050, 0.042],
    orbit: 0.055, shake: 0.008, dolly: 0.34,
  },
  endocrine: {
    accent: 0xd68cff, rim: 0xff9ad5, rimI: 1.9, fillI: 0.48,
    bloom: 1.7, exposure: 1.0, sat: 1.1, vignette: 0.56, grain: 0.028,
    shadow: [0.038, 0.022, 0.058], highlight: [0.050, 0.026, 0.055],
    orbit: 0.058, shake: 0.009, dolly: 0.36,
  },
  motion: {
    accent: 0xffd28a, rim: 0x9fd8ff, rimI: 1.9, fillI: 0.5,
    bloom: 1.45, exposure: 1.05, sat: 1.06, vignette: 0.5, grain: 0.026,
    shadow: [0.026, 0.028, 0.052], highlight: [0.050, 0.040, 0.022],
    orbit: 0.07, shake: 0.010, dolly: 0.4,
  },
};

// 补完的 5 套调色并入同一张表，未知 modeId 仍走 DEFAULTS
Object.assign(LOOK, EXTRA_LOOK);

const DEFAULTS = {
  accent: 0x6fd0ff, rim: 0x9fd8ff, rimI: 1.4, fillI: 0.4,
  bloom: 1.3, exposure: 1.02, sat: 1.04, vignette: 0.45, grain: 0.022,
  shadow: [0.016, 0.024, 0.05], highlight: [0.02, 0.02, 0.02],
  orbit: 0.04, shake: 0.006, dolly: 0.3,
};

export function createCinema({ camera, cam, scene, postfx }) {
  const rim = new THREE.DirectionalLight(0x9fd8ff, 0);
  rim.castShadow = false;
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xffffff, 0);
  fill.castShadow = false;
  scene.add(fill);

  const state = {
    mode: null,
    strength: 0,      // 0→1 平滑进出，避免一开动画画面突然跳色
    t: 0,
    lastTouch: -999,
    dollyBase: 0,
  };

  const tmp = new THREE.Vector3();
  const look = { ...DEFAULTS, shadow: [...DEFAULTS.shadow], highlight: [...DEFAULTS.highlight] };

  function applyLook(l) {
    Object.assign(look, l);
    if (postfx) {
      const g = postfx.grade;
      g.bloom = l.bloom;
      g.exposure = l.exposure;
      g.sat = l.sat;
      g.vignette = l.vignette;
      g.grain = l.grain;
      g.shadowTint.set(l.shadow[0], l.shadow[1], l.shadow[2]);
      g.highlightTint.set(l.highlight[0], l.highlight[1], l.highlight[2]);
    }
    rim.color.setHex(l.rim);
    fill.color.setHex(l.accent);
    rim.intensity = l.rimI;
    fill.intensity = l.fillI;
  }

  function enter(modeId) {
    state.mode = modeId;
    state.t = 0;
    state.lastTouch = -999;
    state.dollyBase = cam._distG;
    applyLook(LOOK[modeId] || DEFAULTS);
    if (postfx) postfx.setEnabled(true);
  }

  function exit() {
    state.mode = null;
    rim.intensity = 0;
    fill.intensity = 0;
    if (postfx) postfx.setEnabled(false);
  }

  // 用户动过相机 → 自动运镜让位一段时间，手感优先
  function touch() { state.lastTouch = state.t; }

  function update(dt) {
    if (!state.mode) return;
    state.t += dt;
    state.strength = Math.min(1, state.strength + dt * 1.6);

    const l = LOOK[state.mode] || DEFAULTS;
    const idle = state.t - state.lastTouch > 4.5;
    const s = state.strength;

    if (idle) {
      // 缓慢环绕 + 呼吸式推拉：幅度很小，像摄影师在轻微调整机位
      cam._thetaG += l.orbit * dt * s;
      cam._distG = state.dollyBase + Math.sin(state.t * 0.23) * l.dolly * s;
      cam._phiG += Math.sin(state.t * 0.17) * 0.00035 * s;
    } else if (Math.abs(cam._distG - state.dollyBase) > 0.001) {
      // 用户刚缩放过：把呼吸推拉的基准重新对齐，避免和用户抢镜头
      state.dollyBase = cam._distG;
    }

    // 轮廓光跟着相机走：始终从被摄体侧后方打过来
    tmp.copy(camera.position).sub(cam.target).normalize();
    rim.position.copy(cam.target)
      .addScaledVector(tmp, -6.5)     // 相机反方向
      .add(new THREE.Vector3(tmp.z * 3.2, 2.6, -tmp.x * 3.2));  // 侧向偏移
    fill.position.copy(cam.target).addScaledVector(tmp, 5).add(new THREE.Vector3(0, 3.4, 0));
    rim.intensity = l.rimI * s;
    fill.intensity = l.fillI * s;

    // 极轻的手持抖动（只动相机位置，不改朝向目标，观感像人手扶着稳定器）
    if (l.shake > 0) {
      const k = l.shake * s;
      camera.position.x += Math.sin(state.t * 1.7) * k;
      camera.position.y += Math.sin(state.t * 2.31 + 1.1) * k * 0.8;
      camera.position.z += Math.sin(state.t * 1.13 + 2.4) * k * 0.6;
    }
  }

  return { enter, exit, update, touch, state, look: () => look };
}
