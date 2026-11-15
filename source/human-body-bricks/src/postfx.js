// postfx.js — 影视级画面管线（不依赖 three/examples，纯自研）
//
// 思路：
//   1. 场景先渲到半浮点 HDR 缓冲（线性空间，关掉 toneMapping，保住 >1 的高光）
//   2. 亮度提取 → 三级降采样高斯模糊 → 叠回主画面（Bloom，让血管/粒子有真实光晕）
//   3. 合成阶段一次性做：ACES 色调映射、按系统的电影调色、暗角、胶片颗粒、边缘色差
//
// 影片模式额外三层「镜头语言」：
//   · 景深（Depth of Field）：单独渲一遍深度，按弥散圆做螺旋采样虚化
//   · 推镜模糊（Zoom Blur）：镜头快速推近时沿径向拉出运动感
//   · 变形宽银幕光晕（Anamorphic Streak）：高光横向拉出蓝青色光条
//
// 之所以自己写而不是引 EffectComposer：项目是离线单文件发布，多引一个
// examples 模块就多一份打包体积和版本错配风险；这里只用到 WebGLRenderTarget
// 和全屏四边形，200 行就能把画面质感拉起来。
import * as THREE from '../lib/three.module.js';

const FULLSCREEN_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// 亮度提取：软膝阈值，避免高光边缘出现硬边
const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float w = max(soft, l - uThreshold) / max(l, 1e-5);
  gl_FragColor = vec4(c * w, 1.0);
}`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uDir;      // 半径方向（像素步长已在 JS 侧折算）
varying vec2 vUv;
void main() {
  // 9 tap 高斯，权重和为 1
  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227027;
  s += (texture2D(tDiffuse, vUv + uDir * 1.3846).rgb + texture2D(tDiffuse, vUv - uDir * 1.3846).rgb) * 0.3162162;
  s += (texture2D(tDiffuse, vUv + uDir * 3.2308).rgb + texture2D(tDiffuse, vUv - uDir * 3.2308).rgb) * 0.0702702;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tBloom1;
uniform sampler2D tBloom2;
uniform sampler2D tBloom3;
uniform sampler2D tStreak;
uniform sampler2D tDepth;
uniform float uBloom;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uCA;
uniform float uSat;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform vec2 uRes;
uniform vec2 uTexel;

// —— 镜头语言 ——
uniform float uFocus;       // 对焦距离（世界单位，沿视线）
uniform float uFocusRange;  // 从清晰到全虚的距离跨度
uniform float uAperture;    // 0 = 全清晰
uniform float uMaxBlur;     // 最大弥散半径（UV 单位）
uniform float uZoom;        // 推镜模糊强度
uniform float uStreak;      // 变形宽银幕光晕强度
uniform float uNear;
uniform float uFar;
uniform float uFlash;       // 转场闪白

varying vec2 vUv;

vec3 aces(vec3 x) {
  // Narkowicz 近似 ACES
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// 深度缓冲 → 视线方向的距离
float viewDist(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  if (d >= 0.99998) return 1.0e5;
  float z = (uNear * uFar) / ((uFar - uNear) * d - uFar);
  return -z;
}

float cocAt(vec2 uv) {
  return clamp(abs(viewDist(uv) - uFocus) / max(uFocusRange, 0.01), 0.0, 1.0);
}

// 景深：黄金角螺旋 10 tap，只让「更虚」的样本参与，避免前景渗进清晰区
vec3 dofColor(vec2 uv) {
  vec3 base = texture2D(tScene, uv).rgb;
  float b0 = cocAt(uv);
  float bn = max(max(cocAt(uv + vec2(uTexel.x, 0.0)), cocAt(uv - vec2(uTexel.x, 0.0))),
                 max(cocAt(uv + vec2(0.0, uTexel.y)), cocAt(uv - vec2(0.0, uTexel.y))));
  float rad = max(b0, bn * 0.8) * uAperture * uMaxBlur;
  if (rad < 0.0008) return base;

  vec3 acc = base;
  float ws = 1.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i) + 0.5;
    float a = fi * 2.399963;
    float r = sqrt(fi / 10.0) * rad;
    vec2 o = vec2(cos(a), sin(a)) * r;
    float bs = cocAt(uv + o);
    float w = smoothstep(0.0, 0.42, bs - b0 + 0.16);
    acc += texture2D(tScene, uv + o).rgb * w;
    ws += w;
  }
  return acc / ws;
}

// 推镜模糊：沿屏幕中心方向做 6 tap 拉丝
vec3 zoomColor(vec2 uv) {
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  for (int i = 0; i < 6; i++) {
    float t = float(i) / 5.0;
    vec2 p = 0.5 + (uv - 0.5) * (1.0 - uZoom * t * 0.32);
    float w = 1.0 - t * 0.55;
    acc += texture2D(tScene, p).rgb * w;
    ws += w;
  }
  return acc / ws;
}

void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;

  // 边缘轻微色差：中心的像素完全不动，越靠边越分散
  float ca = uCA * dot(d, d);
  vec2 uvA = uv + d * ca;
  vec2 uvB = uv - d * ca;

  vec3 col;
  if (uAperture > 0.004) {
    col = dofColor(uv);
  } else if (uZoom > 0.004) {
    col = zoomColor(uv);
  } else {
    col.r = texture2D(tScene, uvA).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uvB).b;
  }

  // 三层 bloom 叠加（远层权重低，形成宽柔的光晕）
  vec3 bloom = texture2D(tBloom1, uv).rgb * 0.62
             + texture2D(tBloom2, uv).rgb * 0.34
             + texture2D(tBloom3, uv).rgb * 0.22;
  col += bloom * uBloom;

  // 变形宽银幕光条：横向拉伸的蓝色高光，是「医疗影像大片」的标志性光效
  if (uStreak > 0.001) {
    vec3 st = texture2D(tStreak, uv).rgb;
    col += st * uStreak * vec3(0.42, 0.66, 1.15) * 1.35;
  }

  col *= uExposure;
  col = aces(col);

  // 电影调色：暗部染色 + 亮部染色 + 增益/提亮 + 饱和度
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += uShadowTint * pow(1.0 - l, 2.2) * 0.5;
  col += uHighlightTint * pow(l, 2.6) * 0.45;
  col = col * uGain + uLift;
  col = mix(vec3(l), col, uSat);

  // 暗角
  float v = 1.0 - uVignette * smoothstep(0.25, 0.95, length(d) * 1.32);
  col *= v;

  // 转场闪白 / 闪黑
  col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));

  // 胶片颗粒：按屏幕像素取噪，随时间轻微变化
  float g = hash(uv * uRes + fract(uTime) * 71.3) - 0.5;
  col += g * uGrain;

  // 线性 → sRGB（自己编码，这样不受 renderer.outputColorSpace 影响）
  col = max(col, 0.0);
  vec3 srgb = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  gl_FragColor = vec4(srgb, 1.0);
}`;

function makePass(frag, uniforms) {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { scene, cam, mat, uniforms };
}

function makeTarget(w, h, samples = 0) {
  return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples,
  });
}

// 只为了拿深度：颜色附件用 8bit 省显存，深度另挂 DepthTexture
function makeDepthTarget(w, h) {
  const rt = new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const dt = new THREE.DepthTexture(Math.max(2, w), Math.max(2, h));
  dt.type = THREE.UnsignedIntType;
  dt.format = THREE.DepthFormat;
  dt.minFilter = THREE.NearestFilter;
  dt.magFilter = THREE.NearestFilter;
  rt.depthTexture = dt;
  return rt;
}

export function createPostFX(renderer, scene, camera) {
  const caps = renderer.capabilities;
  const isWebGL2 = !!caps.isWebGL2;
  // 与画布像素比保持一致，避免最后一步合成时被放大导致发虚
  const dpr = () => renderer.getPixelRatio();

  let W = 2, H = 2;
  let enabled = false;

  const hdr = makeTarget(W, H, isWebGL2 ? 4 : 0);
  const t1 = makeTarget(W, H), t1b = makeTarget(W, H);
  const t2 = makeTarget(W, H), t2b = makeTarget(W, H);
  const t3 = makeTarget(W, H), t3b = makeTarget(W, H);
  const s1 = makeTarget(W, H), s2 = makeTarget(W, H);
  const depthRT = makeDepthTarget(W, H);

  const bright = makePass(BRIGHT_FRAG, {
    tDiffuse: { value: null }, uThreshold: { value: 0.72 }, uKnee: { value: 0.28 },
  });
  const blurH = makePass(BLUR_FRAG, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
  const blurV = makePass(BLUR_FRAG, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });

  const grade = {
    bloom: 1.0, exposure: 1.04, vignette: 0.52, grain: 0.028, ca: 0.0022, sat: 1.06,
    lift: new THREE.Vector3(0, 0, 0),
    gain: new THREE.Vector3(1, 1, 1),
    shadowTint: new THREE.Vector3(0.02, 0.03, 0.07),
    highlightTint: new THREE.Vector3(0.02, 0.02, 0.0),
  };

  // 镜头参数：默认全部关闭，影片模式逐镜推上来
  const lens = {
    on: false,
    focus: 10,
    range: 2.4,
    aperture: 0,
    maxBlur: 0.011,
    zoom: 0,
    streak: 0,
    flash: 0,
  };

  const composite = makePass(COMPOSITE_FRAG, {
    tScene: { value: null }, tBloom1: { value: null }, tBloom2: { value: null }, tBloom3: { value: null },
    tStreak: { value: null }, tDepth: { value: null },
    uBloom: { value: grade.bloom }, uExposure: { value: grade.exposure },
    uVignette: { value: grade.vignette }, uGrain: { value: grade.grain },
    uTime: { value: 0 }, uCA: { value: grade.ca }, uSat: { value: grade.sat },
    uLift: { value: grade.lift }, uGain: { value: grade.gain },
    uShadowTint: { value: grade.shadowTint }, uHighlightTint: { value: grade.highlightTint },
    uRes: { value: new THREE.Vector2(W, H) },
    uTexel: { value: new THREE.Vector2(1 / W, 1 / H) },
    uFocus: { value: lens.focus }, uFocusRange: { value: lens.range },
    uAperture: { value: 0 }, uMaxBlur: { value: lens.maxBlur },
    uZoom: { value: 0 }, uStreak: { value: 0 },
    uNear: { value: camera.near }, uFar: { value: camera.far },
    uFlash: { value: 0 },
  });

  function setSize(w, h) {
    const k = dpr();
    W = Math.max(2, Math.round(w * k));
    H = Math.max(2, Math.round(h * k));
    hdr.setSize(W, H);
    const sizes = [[t1, t1b, 2], [t2, t2b, 4], [t3, t3b, 8], [s1, s2, 8]];
    for (const [a, b, div] of sizes) {
      a.setSize(Math.max(2, Math.round(W / div)), Math.max(2, Math.round(H / div)));
      b.setSize(Math.max(2, Math.round(W / div)), Math.max(2, Math.round(H / div)));
    }
    // 深度用半分辨率：弥散圆只关心模糊量，不需要逐像素精度
    depthRT.setSize(Math.max(2, Math.round(W / 2)), Math.max(2, Math.round(H / 2)));
    if (depthRT.depthTexture && depthRT.depthTexture.image) {
      depthRT.depthTexture.image.width = depthRT.width;
      depthRT.depthTexture.image.height = depthRT.height;
      depthRT.depthTexture.needsUpdate = true;
    }
    composite.uniforms.uRes.value.set(W, H);
    composite.uniforms.uTexel.value.set(1 / W, 1 / H);
  }

  function blit(pass, target) {
    renderer.setRenderTarget(target || null);
    renderer.render(pass.scene, pass.cam);
  }

  function blurInto(src, tmp, dst, radius) {
    blurH.uniforms.tDiffuse.value = src.texture;
    blurH.uniforms.uDir.value.set(radius / dst.width, 0);
    blit(blurH, tmp);
    blurV.uniforms.tDiffuse.value = tmp.texture;
    blurV.uniforms.uDir.value.set(0, radius / dst.height);
    blit(blurV, dst);
  }

  let frame = 0;

  function render(dt) {
    if (!enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }

    const prevTM = renderer.toneMapping;
    const prevExp = renderer.toneMappingExposure;
    // 关掉内建色调映射：高光要留到 Bloom 之后再压缩，否则全被压进 0~1
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;

    // 深度预渲染：只有影片模式需要
    if (lens.on) {
      renderer.setRenderTarget(depthRT);
      renderer.clear();
      renderer.render(scene, camera);
    }

    renderer.setRenderTarget(hdr);
    renderer.clear();
    renderer.render(scene, camera);

    bright.uniforms.tDiffuse.value = hdr.texture;
    blit(bright, t1);
    blurInto(t1.texture, t1b, t1, 1.0);
    blurInto(t1.texture, t2b, t2, 1.4);
    blurInto(t2.texture, t3b, t3, 1.7);

    // 变形宽银幕光条：把高光在水平方向拉长一倍帧，每 2 帧更新即可
    const needStreak = lens.on && lens.streak > 0.002;
    if (needStreak && (frame & 1) === 0) {
      blit(bright, s1);
      blurH.uniforms.tDiffuse.value = s1.texture;
      blurH.uniforms.uDir.value.set(14 / s2.width, 0);
      blit(blurH, s2);
      blurH.uniforms.tDiffuse.value = s2.texture;
      blurH.uniforms.uDir.value.set(30 / s2.width, 0);
      blit(blurH, s1);
    }
    frame++;

    const u = composite.uniforms;
    u.tScene.value = hdr.texture;
    u.tBloom1.value = t1.texture;
    u.tBloom2.value = t2.texture;
    u.tBloom3.value = t3.texture;
    u.tStreak.value = needStreak ? s1.texture : t3.texture;
    u.tDepth.value = depthRT.depthTexture;
    u.uTime.value += dt;
    u.uBloom.value = grade.bloom;
    u.uExposure.value = grade.exposure;
    u.uVignette.value = grade.vignette;
    u.uGrain.value = grade.grain;
    u.uCA.value = grade.ca;
    u.uSat.value = grade.sat;
    u.uLift.value.copy(grade.lift);
    u.uGain.value.copy(grade.gain);
    u.uShadowTint.value.copy(grade.shadowTint);
    u.uHighlightTint.value.copy(grade.highlightTint);

    u.uFocus.value = lens.focus;
    u.uFocusRange.value = lens.range;
    u.uAperture.value = lens.on ? lens.aperture : 0;
    u.uMaxBlur.value = lens.maxBlur;
    u.uZoom.value = lens.on ? lens.zoom : 0;
    u.uStreak.value = needStreak ? lens.streak : 0;
    u.uFlash.value = lens.on ? lens.flash : 0;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;

    blit(composite, null);
    renderer.setRenderTarget(null);

    renderer.toneMapping = prevTM;
    renderer.toneMappingExposure = prevExp;
  }

  setSize(window.innerWidth, window.innerHeight);

  return {
    get enabled() { return enabled; },
    setEnabled(on) { enabled = !!on; },
    setSize,
    render,
    grade,
    lens,
    hdr,
  };
}
