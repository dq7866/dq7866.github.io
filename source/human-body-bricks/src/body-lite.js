// body-lite.js — 程序化兜底建模（无外部模型时使用，例如单文件版、离线打开）
// 所有几何都以部件中心为原点建模，再由 part.pos 摆到人体上。
import * as THREE from '../lib/three.module.js';

const BONE = 0xe9dfc6;
const CARTILAGE = 0xcfc3a4;
const MUSCLE = 0xd96a5f;
const MUSCLE_DARK = 0xb94f47;
const SKIN = 0xe8b89a;       // 日常人体：肤色体块
const SKIN_DARK = 0xd49b82;  // 肤色阴影/颊
const HAIR = 0x4a3526;
const EYE_WHITE = 0xf3f1ea;
const EYE_DARK = 0x2a2722;
const LIP = 0xc25b62;
const TEETH = 0xf7f4ee;
const ORGAN = {
  brain: 0xe7b0a6,
  heart: 0xd2595c,
  lungs: 0xe59a92,
  liver: 0x9c5a4a,
  stomach: 0xd98a6a,
  smallIntestine: 0xdda07c,
  kidney: 0xa45a55,
  bladder: 0xd8c48b,
  eye: 0x7fa3c9,
  ear: 0xd9b894,
  spleen: 0x8a4a5e,
  largeIntestine: 0xc08a6a,
};

const matCache = new Map();
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.58,
    metalness: 0.04,
    ...opts,
  });
}

function add(parent, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const sph = (r, seg = 18) => new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2));
const cyl = (r, h, seg = 16, open = false) => new THREE.CylinderGeometry(r, r, h, seg, 1, open);
const cap = (r, len, seg = 14) => new THREE.CapsuleGeometry(r, len, 6, seg);
const boxg = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const tor = (R, r, arc = Math.PI * 2, seg = 40) => new THREE.TorusGeometry(R, r, 8, seg, arc);

function tube(points, r, material, parent, seg = 48) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, seg, r, 8, false);
  return add(parent, geo, material);
}

// 双侧部件：fn(side) 生成左右各一份，side = ±1
function both(parent, fn) {
  fn(1, parent);
  fn(-1, parent);
}

const builders = {
  // ---------- 骨骼 ----------
  // 与 data.js 的骨块 id 一一对应。真实解剖模型可用时这些不会被调用，
  // 只在模型缺失（单文件版 / 离线 / 加载失败）时作为简化替代。
  skull(g, M) {
    add(g, sph(0.5, 24), M.bone, [0, 0.04, 0], [0, 0, 0], [1, 1.08, 0.96]);
    // 颅底
    add(g, boxg(0.5, 0.2, 0.42), M.bone, [0, -0.34, 0.06]);
    // 颧骨与鼻梁
    both(g, s => add(g, sph(0.13, 12), M.bone, [s * 0.22, -0.05, 0.42], [0, 0, 0], [1, 0.8, 0.7]));
    add(g, boxg(0.1, 0.22, 0.12), M.bone, [0, 0.02, 0.47]);
    // 眼窝（暗色，让正面有方向感）
    both(g, s => add(g, sph(0.1, 12), M.dark, [s * 0.19, 0.12, 0.44], [0, 0, 0], [1, 1, 0.5]));
  },

  mandible(g, M) {
    // 下颌体（U 形弓）+ 两侧升支与髁突
    add(g, tor(0.26, 0.05, Math.PI, 24), M.bone, [0, -0.06, 0.04], [Math.PI / 2, 0, Math.PI], [1, 1, 0.8]);
    both(g, s => {
      add(g, cap(0.048, 0.26, 10), M.bone, [s * 0.26, 0.12, -0.06], [0, 0, -s * 0.18]);
      add(g, sph(0.055, 12), M.bone, [s * 0.22, 0.3, -0.03]);
    });
    // 下排牙
    for (let i = 0; i < 7; i++) {
      add(g, boxg(0.028, 0.05, 0.028), M.bone, [(i - 3) * 0.065, 0.03, 0.2 - Math.abs(i - 3) * 0.032]);
    }
  },

  cervical(g, M) {
    // 6 节颈椎 + 寰椎环 + 枢椎齿突
    for (let i = 0; i < 6; i++) {
      const y = 0.5 - i * 0.19;
      add(g, cyl(0.098, 0.08, 12), M.bone, [0, y, 0]);
      add(g, cyl(0.122, 0.032, 12), M.cartilage, [0, y - 0.055, 0]);
      add(g, boxg(0.055, 0.055, 0.11), M.bone, [0, y + 0.01, -0.1]);
    }
    add(g, tor(0.105, 0.032, Math.PI * 1.7, 18), M.bone, [0, 0.62, 0], [Math.PI / 2, 0, 0], [1, 1, 0.7]);
    add(g, cyl(0.028, 0.1, 8), M.bone, [0, 0.55, 0.03]);
  },

  thoracic(g, M) {
    // 10 节胸椎（简化），带横突与肋凹
    for (let i = 0; i < 10; i++) {
      const y = 0.95 - i * 0.2;
      add(g, cyl(0.115, 0.1, 12), M.bone, [0, y, 0]);
      add(g, cyl(0.138, 0.038, 12), M.cartilage, [0, y - 0.062, 0]);
      add(g, boxg(0.065, 0.075, 0.15), M.bone, [0, y - 0.01, -0.15]);
      both(g, s => add(g, sph(0.048, 10), M.bone, [s * 0.13, y, 0.01], [0, 0, 0], [1, 0.7, 0.9]));
    }
  },

  lumbar(g, M) {
    // 5 节腰椎，椎体明显更粗壮
    for (let i = 0; i < 5; i++) {
      const y = 0.48 - i * 0.24;
      add(g, cyl(0.152, 0.12, 14), M.bone, [0, y, 0]);
      add(g, cyl(0.172, 0.05, 14), M.cartilage, [0, y - 0.078, 0]);
      add(g, boxg(0.085, 0.085, 0.19), M.bone, [0, y - 0.01, -0.19]);
      both(g, s => add(g, boxg(0.13, 0.055, 0.085), M.bone, [s * 0.14, y, 0.02]));
    }
  },

  sacrum(g, M) {
    // 倒三角楔形（5 节骶椎融合）
    add(g, cyl(0.2, 0.34, 5), M.bone, [0, 0.14, -0.03], [0.18, Math.PI / 5, 0], [1, 1, 0.62]);
    for (let i = 0; i < 4; i++) {
      both(g, s => add(g, sph(0.026, 8), M.dark, [s * 0.09, 0.24 - i * 0.08, -0.01]));
    }
  },

  coccyx(g, M) {
    add(g, cyl(0.065, 0.18, 5), M.bone, [0, 0.02, -0.02], [0.3, Math.PI / 5, 0], [1, 1, 0.7]);
    add(g, sph(0.04, 8), M.bone, [0, -0.09, 0.02]);
  },

  ribs(g, M) {
    // 6 对肋骨简化：弧形环 + 前端肋软骨
    const radii = [0.42, 0.52, 0.58, 0.6, 0.56, 0.48];
    radii.forEach((R, i) => {
      const y = 0.38 - i * 0.16;
      const gap = 5.5;
      add(g, tor(R, 0.036, gap, 40), M.bone, [0, y, -0.02], [-Math.PI / 2, Math.PI + (Math.PI * 2 - gap) / 2, 0], [1, 1, 0.9]);
      both(g, s => add(g, cyl(0.028, 0.26, 10), M.cartilage, [s * (R * 0.8), y - 0.01, 0.4], [0, 0, s * 0.28]));
    });
  },

  sternum(g, M) {
    add(g, boxg(0.14, 0.7, 0.07), M.bone, [0, 0.02, 0]);
    add(g, boxg(0.23, 0.15, 0.085), M.bone, [0, 0.42, 0]);   // 胸骨柄
    add(g, boxg(0.085, 0.16, 0.045), M.bone, [0, -0.38, 0]); // 剑突
  },

  clavicle(g, M) {
    both(g, s => {
      tube([[s * 0.06, 0.02, 0.24], [s * 0.34, 0.1, 0.34], [s * 0.62, 0.12, 0.18], [s * 0.86, 0.08, -0.02]], 0.052, M.bone, g);
      add(g, sph(0.1, 12), M.bone, [s * 0.86, 0.08, -0.02], [0, 0, 0], [1, 0.9, 0.9]);
    });
  },

  scapula(g, M) {
    both(g, s => {
      add(g, boxg(0.4, 0.48, 0.055), M.bone, [s * 0.28, 0, -0.02], [0, s * 0.26, s * 0.12]);
      add(g, boxg(0.34, 0.05, 0.085), M.bone, [s * 0.28, 0.11, -0.07], [0, s * 0.26, s * 0.12]); // 肩胛冈
      add(g, sph(0.072, 12), M.bone, [s * 0.48, 0.2, 0.05]);  // 肩峰
      add(g, sph(0.055, 10), M.bone, [s * 0.44, 0.03, 0.09]); // 喙突
    });
  },

  humerus(g, M) {
    both(g, s => {
      add(g, cyl(0.082, 1.18, 14), M.bone, [s * 1.16, 0, 0], [0, 0, s * 0.13]);
      add(g, sph(0.14, 16), M.bone, [s * 1.08, 0.62, 0], [0, 0, 0], [1, 1, 1]);
      add(g, sph(0.13, 16), M.bone, [s * 1.24, -0.6, 0], [0, 0, 0], [1.09, 0.8, 1.05]);
      add(g, boxg(0.1, 0.06, 0.14), M.bone, [s * 1.24, -0.68, 0]);
    });
  },

  radius(g, M) {
    both(g, s => {
      const x = s * 1.27;
      add(g, cyl(0.055, 1.02, 12), M.bone, [x + s * 0.035, 0, 0.03], [0, 0, s * 0.1]);
      add(g, sph(0.072, 12), M.bone, [x + s * 0.035, 0.53, 0.03], [0, 0, 0], [1, 0.8, 1]);
      add(g, boxg(0.15, 0.06, 0.1), M.bone, [x + s * 0.035, -0.5, 0.02]);
    });
  },

  ulna(g, M) {
    both(g, s => {
      const x = s * 1.27;
      add(g, cyl(0.044, 1.0, 12), M.bone, [x - s * 0.06, 0.02, -0.03], [0, 0, s * 0.1]);
      add(g, boxg(0.085, 0.13, 0.11), M.bone, [x - s * 0.06, 0.53, -0.02]); // 鹰嘴
      add(g, sph(0.038, 10), M.bone, [x - s * 0.06, -0.5, -0.03]);
    });
  },

  carpal(g, M) {
    both(g, s => {
      const x = s * 1.27;
      // 近排 4 块 + 远排 4 块
      for (let i = 0; i < 4; i++) {
        add(g, sph(0.045, 10), M.bone, [x + s * (i - 1.5) * 0.055, 0.05, 0]);
        add(g, sph(0.04, 10), M.bone, [x + s * (i - 1.5) * 0.055, -0.03, 0.01]);
      }
    });
  },

  metacarpal(g, M) {
    both(g, s => {
      const x = s * 1.27;
      for (let i = 0; i < 4; i++) {
        add(g, cyl(0.028, 0.26, 8), M.bone, [x + s * (i - 1.5) * 0.055, -0.02, 0.02], [0, 0, s * (i - 1.5) * 0.06]);
      }
      // 第 1 掌骨（拇指）
      add(g, cyl(0.03, 0.2, 8), M.bone, [x + s * 0.14, 0.02, 0.07], [0, s * 0.4, s * 0.7]);
    });
  },

  phalangesHand(g, M) {
    both(g, s => {
      const x = s * 1.27;
      for (let i = 0; i < 4; i++) {
        add(g, cap(0.022, 0.1, 8), M.bone, [x + s * (i - 1.5) * 0.055, -0.2, 0.03], [0, 0, s * (i - 1.5) * 0.08]);
        add(g, cap(0.018, 0.07, 8), M.bone, [x + s * (i - 1.5) * 0.06, -0.3, 0.035], [0, 0, s * (i - 1.5) * 0.08]);
      }
      // 拇指两节
      add(g, cap(0.022, 0.1, 8), M.bone, [x + s * 0.19, -0.06, 0.12], [0, s * 0.4, s * 0.9]);
      add(g, cap(0.018, 0.07, 8), M.bone, [x + s * 0.25, -0.12, 0.15], [0, s * 0.4, s * 0.9]);
    });
  },

  pelvis(g, M) {
    // 髂骨翼
    both(g, s => add(g, sph(0.4, 18), M.bone, [s * 0.4, 0.16, -0.04], [0.1, s * 0.2, s * 0.28], [1, 0.9, 0.42]));
    // 耻骨弓与坐骨环
    add(g, tor(0.34, 0.075, Math.PI * 1.25, 30), M.bone, [0, -0.12, 0.05], [Math.PI / 2, 0, Math.PI * 0.86], [1.25, 1, 0.85]);
    both(g, s => add(g, sph(0.16, 14), M.bone, [s * 0.34, -0.22, -0.08], [0, 0, 0], [1, 0.75, 1]));
  },

  femur(g, M) {
    both(g, s => {
      const x = s * 0.4;
      add(g, cyl(0.1, 1.12, 14), M.bone, [x + s * 0.03, 0, 0], [0, 0, -s * 0.05]);
      add(g, sph(0.15, 16), M.bone, [x - s * 0.08, 0.56, 0], [0, 0, 0], [1, 1, 1]);
      add(g, cyl(0.075, 0.16, 12), M.bone, [x - s * 0.04, 0.62, 0], [0, 0, s * 0.6]);
      both(g, ss => add(g, sph(0.115, 14), M.bone, [x + ss * 0.09, -0.56, -0.03], [0, 0, 0], [1, 0.9, 1.1]));
    });
  },

  patella(g, M) {
    both(g, s => add(g, sph(0.16, 16), M.bone, [s * 0.42, 0, 0], [0.1, s * 0.15, 0], [1, 1.2, 0.45]));
  },

  tibia(g, M) {
    both(g, s => {
      const x = s * 0.42;
      add(g, cyl(0.098, 1.08, 14), M.bone, [x, 0.02, 0]);
      add(g, sph(0.11, 14), M.bone, [x + s * 0.01, 0.54, 0]);
      add(g, boxg(0.2, 0.07, 0.3), M.bone, [x + s * 0.01, 0.6, 0.02]); // 胫骨平台
      add(g, sph(0.08, 12), M.bone, [x, -0.5, 0.02]);                 // 内踝
    });
  },

  fibula(g, M) {
    both(g, s => {
      const x = s * 0.42;
      add(g, cyl(0.044, 1.0, 10), M.bone, [x + s * 0.11, 0.05, -0.03]);
      add(g, sph(0.055, 10), M.bone, [x + s * 0.11, 0.55, -0.04]); // 腓骨头
      add(g, sph(0.055, 10), M.bone, [x + s * 0.09, -0.52, -0.02]); // 外踝
    });
  },

  tarsal(g, M) {
    both(g, s => {
      const x = s * 0.42;
      add(g, sph(0.092, 14), M.bone, [x, 0.12, -0.05]);  // 距骨
      add(g, sph(0.1, 14), M.bone, [x, -0.06, -0.15], [0, 0, 0], [0.95, 1, 1.1]); // 跟骨
      add(g, boxg(0.19, 0.06, 0.14), M.bone, [x, -0.02, 0.06]); // 舟骨与楔骨
    });
  },

  metatarsal(g, M) {
    both(g, s => {
      const x = s * 0.42;
      for (let i = 0; i < 5; i++) {
        add(g, cyl(0.024, 0.26, 8), M.bone, [x + (i - 2) * 0.042, -0.1, 0.12 - Math.abs(i - 2) * 0.015], [Math.PI / 2, 0, 0]);
      }
    });
  },

  phalangesFoot(g, M) {
    both(g, s => {
      const x = s * 0.42;
      for (let i = 0; i < 5; i++) {
        add(g, cap(0.02, 0.05, 8), M.bone, [x + (i - 2) * 0.042, -0.11, 0.28 - Math.abs(i - 2) * 0.02], [Math.PI / 2, 0, 0]);
      }
    });
  },

  // ---------- 肌肉 ----------
  trapezius(g, M) {
    add(g, sph(0.3, 16), M.muscle, [0, 0.16, -0.18], [0, 0, 0], [1.0, 1.6, 0.35]);
    both(g, s => add(g, sph(0.34, 16), M.muscle,
      [s * 0.52, 0.02, -0.16], [0.1, 0, s * 0.42], [1.5, 0.5, 0.3]));
    both(g, s => add(g, sph(0.2, 14), M.muscle, [s * 0.94, 0.24, -0.05], [0, 0, s * 0.5], [1, 0.55, 0.5]));
  },

  deltoid(g, M) {
    both(g, s => add(g, sph(0.26, 18), M.muscle, [s * 1.1, 0.05, 0], [0, 0, s * 0.18], [1.15, 1.3, 1.05]));
  },

  pectoralis(g, M) {
    both(g, s => add(g, sph(0.34, 18), M.muscle,
      [s * 0.31, 0.06, 0.28], [0.12, s * 0.35, s * 0.1], [1.15, 0.85, 0.45]));
    add(g, boxg(0.16, 0.5, 0.12), M.muscleDark, [0, 0.1, 0.3]);
  },

  biceps(g, M) {
    both(g, s => {
      add(g, cap(0.13, 0.5, 14), M.muscle, [s * 1.16, 0.02, 0.1], [0.05, 0, s * 0.12]);
      add(g, sph(0.1, 12), M.muscle, [s * 1.1, 0.44, 0.1], [0, 0, 0], [1, 0.8, 0.9]);
    });
  },

  rectus(g, M) {
    const ys = [0.44, 0.16, -0.14, -0.42];
    ys.forEach((y, i) => {
      both(g, s => add(g, boxg(0.27, 0.22, 0.12), M.muscle,
        [s * 0.155, y, 0.16], [0, 0, 0], [1, i === 3 ? 1.15 : 1, 1]));
    });
    add(g, boxg(0.06, 0.95, 0.1), M.muscleDark, [0, 0.02, 0.17]);
    both(g, s => add(g, boxg(0.1, 0.9, 0.08), M.muscleDark, [s * 0.3, 0, 0.14]));
  },

  erector(g, M) {
    both(g, s => {
      add(g, cap(0.085, 1.5, 12), M.muscle, [s * 0.16, 0.02, 0.02], [0, 0, 0], [1, 1, 0.8]);
      add(g, sph(0.11, 12), M.muscle, [s * 0.18, 0.78, 0.02], [0, 0, 0], [1, 0.8, 0.7]);
    });
  },

  gluteus(g, M) {
    both(g, s => add(g, sph(0.36, 18), M.muscle,
      [s * 0.28, -0.06, -0.22], [0.12, 0, s * 0.1], [1, 1, 0.7]));
    both(g, s => add(g, sph(0.2, 14), M.muscleDark, [s * 0.34, -0.3, -0.16], [0, 0, 0], [1, 0.6, 0.5]));
  },

  quadriceps(g, M) {
    both(g, s => {
      add(g, cap(0.16, 0.78, 16), M.muscle, [s * 0.4, 0.12, 0.07], [0, 0, 0], [1, 1, 0.9]);
      add(g, cap(0.09, 0.4, 12), M.muscle, [s * 0.5, -0.2, 0.14], [0, 0, s * 0.15]);
      add(g, sph(0.14, 14), M.muscleDark, [s * 0.4, 0.5, 0.09], [0, 0, 0], [1.2, 0.8, 0.8]);
    });
  },

  gastrocnemius(g, M) {
    both(g, s => {
      add(g, sph(0.17, 16), M.muscle, [s * 0.4, 0.24, -0.05], [0.1, 0, s * 0.12], [1, 1.4, 0.9]);
      add(g, cap(0.11, 0.42, 12), M.muscle, [s * 0.42, -0.16, -0.07], [0.06, 0, 0]);
      add(g, cap(0.035, 0.5, 8), M.muscleDark, [s * 0.43, -0.5, -0.05], [0, 0, 0]);
    });
  },

  diaphragm(g, M) {
    // 圆顶用闭合扁椭球：半球开口的壳从上方看会变成「圆环」，闭合体才不会穿帮。
    // 颜色取接近真实模型的肌肉红，尺寸收在腹壁之内（z 方向不能顶出腹直肌）。
    const muscle = mat(0x94382f, { roughness: 0.74 });
    const tendon = mat(0xb4736a, { roughness: 0.78 });
    add(g, sph(0.58, 28), muscle, [0, -0.02, 0.0], [0, 0, 0], [1.0, 0.30, 0.60]);
    // 中心腱（腱性部分，颜色更浅）
    add(g, sph(0.22, 20), tendon, [0.02, 0.10, 0.0], [0, 0, 0], [1.0, 0.12, 0.62]);
    // 左右膈脚，向下后方连到腰椎
    both(g, s => add(g, cap(0.042, 0.26, 10), tendon, [s * 0.06, -0.16, -0.10], [0.26, 0, 0]));
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  },

  // ---------- 器官 ----------
  brain(g, M) {
    const o = M.organ;
    add(g, sph(0.36, 22), o, [-0.13, 0.04, 0], [0, 0, 0], [1, 0.94, 1.1]);
    add(g, sph(0.36, 22), o, [0.13, 0.04, 0], [0, 0, 0], [1, 0.94, 1.1]);
    // 脑沟
    for (let i = 0; i < 5; i++) {
      add(g, tor(0.18 + i * 0.025, 0.012, Math.PI * 1.1, 24), M.organLine,
        [0, 0.16 - i * 0.07, 0.05], [Math.PI / 2.1, i * 0.4, 0.2]);
    }
    add(g, sph(0.16, 14), M.organLine, [0, -0.18, -0.24], [0, 0, 0], [1.3, 0.7, 0.8]);
    add(g, cyl(0.07, 0.24, 10), M.organLine, [0, -0.3, -0.02]);
  },

  heart(g, M) {
    add(g, sph(0.3, 20), M.organ, [0, 0, 0], [0, 0, 0.1], [1.05, 1.15, 0.9]);
    add(g, sph(0.17, 14), M.organDark, [-0.2, 0.2, -0.02], [0, 0, 0], [1.1, 1, 1]);
    add(g, sph(0.15, 14), M.organDark, [0.2, 0.16, 0.02], [0, 0, 0], [1.1, 1, 1]);
    // 主动脉弓与肺动脉
    tube([[-0.02, 0.24, 0], [0.02, 0.5, 0.02], [0.18, 0.56, -0.02], [0.24, 0.4, -0.06]], 0.05, M.vessel, g);
    tube([[0.1, 0.22, 0.12], [0.18, 0.4, 0.16], [0.1, 0.48, 0.06]], 0.04, M.vesselBlue, g);
    tube([[-0.12, -0.2, 0], [-0.16, -0.42, 0.02]], 0.06, M.vesselBlue, g);
  },

  lungs(g, M) {
    both(g, s => {
      add(g, sph(0.3, 20), M.organ, [s * 0.36, 0.02, 0], [0, 0, s * 0.05], [0.95, 1.75, 0.85]);
      add(g, sph(0.12, 12), M.organDark, [s * 0.3, 0.06, 0.2], [0, 0, 0], [1, 1.2, 0.4]);
    });
    add(g, cyl(0.055, 0.5, 12), M.cartilage, [0, 0.48, 0.02]);
    both(g, s => tube([[0, 0.26, 0.02], [s * 0.14, 0.2, 0.02], [s * 0.24, 0.12, 0]], 0.035, M.cartilage, g));
  },

  liver(g, M) {
    add(g, sph(0.46, 22), M.organ, [0.12, 0, 0.02], [0.1, -0.2, -0.08], [1.25, 0.62, 0.9]);
    add(g, sph(0.26, 18), M.organDark, [-0.26, -0.06, 0.04], [0, 0, 0.2], [1.1, 0.6, 0.9]);
    tube([[0.1, -0.1, 0.2], [0.2, -0.28, 0.18], [0.05, -0.38, 0.1]], 0.035, M.vessel, g);
    add(g, sph(0.1, 12), M.vesselBlue, [0.34, 0.08, 0.16], [0, 0, 0], [1, 0.7, 0.7]);
  },

  stomach(g, M) {
    add(g, sph(0.28, 20), M.organ, [0, 0, 0], [0, 0, 0.1], [1, 1.25, 0.8]);
    add(g, sph(0.18, 16), M.organ, [0.14, 0.28, 0], [0, 0, -0.3], [1, 0.9, 0.85]);
    tube([[0.2, 0.2, 0], [0.28, 0.36, -0.04], [0.2, 0.46, -0.1]], 0.055, M.organDark, g);
    tube([[-0.16, -0.24, 0], [-0.24, -0.36, 0.04], [-0.1, -0.42, 0.08]], 0.05, M.organDark, g);
  },

  smallIntestine(g, M) {
    const rings = [
      [0.3, 0.34, 0.2, -0.28], [0.26, 0.3, -0.18, -0.16], [0.22, 0.26, 0.16, 0.06],
      [0.2, 0.24, -0.12, 0.24], [0.16, 0.2, 0.06, 0.36],
    ];
    rings.forEach(([R, r, x, y], i) => {
      add(g, tor(R, r, Math.PI * 2, 32), M.organ,
        [x, y, 0], [Math.PI / 2 + (i % 2 ? 0.16 : -0.12), 0.1 * i, 0], [1, 1, 0.65]);
    });
    tube([[-0.3, -0.34, 0], [-0.36, -0.2, 0.05], [-0.28, 0.1, 0.08]], 0.045, M.organDark, g);
    tube([[0.2, 0.4, 0], [0.28, 0.3, 0.02], [0.3, 0.16, 0.04]], 0.05, M.organDark, g);
  },

  kidney(g, M) {
    both(g, s => {
      add(g, sph(0.17, 18), M.organ, [s * 0.3, 0.02, 0], [0, 0, s * 0.1], [1, 1.45, 0.85]);
      add(g, sph(0.08, 12), M.organDark, [s * 0.3, 0.02, -0.08], [0, 0, 0], [1, 1.2, 0.5]);
      tube([[s * 0.3, -0.14, -0.02], [s * 0.22, -0.4, 0.02], [s * 0.08, -0.5, 0.06]], 0.025, M.cartilage, g);
    });
    tube([[-0.06, 0.18, -0.14], [0, 0.28, -0.14], [0.06, 0.18, -0.14]], 0.04, M.vessel, g);
  },

  bladder(g, M) {
    add(g, sph(0.24, 20), M.organ, [0, 0, 0], [0, 0, 0], [1.1, 0.95, 0.95]);
    add(g, cyl(0.045, 0.2, 10), M.organDark, [0, -0.22, 0]);
    tube([[0, 0.16, -0.04], [0.04, 0.3, -0.06], [0.02, 0.4, -0.04]], 0.03, M.cartilage, g);
  },

  eye(g, M) {
    both(g, s => {
      const x = s * 0.19;
      add(g, sph(0.095, 18), M.organ, [x, 0.02, 0.02]);
      // 角膜与瞳孔（正面朝前）
      add(g, sph(0.05, 14), M.organDark, [x, 0.02, 0.1], [0, 0, 0], [1, 1, 0.45]);
      add(g, sph(0.024, 10), M.dark, [x, 0.02, 0.12]);
    });
  },

  ear(g, M) {
    both(g, s => {
      // 耳廓（侧面朝外的弧）
      add(g, tor(0.1, 0.032, Math.PI * 1.55, 24), M.organ,
        [s * 0.53, 0.04, -0.02], [s * 0.35, s * Math.PI / 2, 0.1], [1, 1.1, 0.5]);
      // 外耳道
      add(g, cyl(0.028, 0.14, 10), M.organDark, [s * 0.5, 0.04, 0.02], [0, Math.PI / 2, 0]);
    });
  },

  spleen(g, M) {
    add(g, sph(0.23, 20), M.organ, [0.04, 0.02, 0], [0, 0, 0], [0.85, 1.3, 0.7]);
    add(g, sph(0.12, 14), M.organDark, [0.14, -0.1, 0.03], [0, 0, 0], [0.8, 1.1, 0.7]);
    add(g, cyl(0.03, 0.14, 8), M.vessel, [0.16, 0.16, 0.04], [0, 0, -0.4]);
  },

  largeIntestine(g, M) {
    const w = 0.085;
    // 升结肠、横结肠、降结肠围成框
    add(g, cyl(w, 0.78, 14), M.organ, [0.52, -0.02, 0]);
    add(g, cyl(w, 1.04, 14), M.organ, [0, 0.38, 0.03], [0, 0, Math.PI / 2]);
    add(g, cyl(w, 0.78, 14), M.organ, [-0.52, -0.02, 0]);
    // 结肠弯曲
    both(g, s => add(g, sph(0.11, 14), M.organ, [s * 0.52, 0.36, 0.02], [0, 0, 0], [1, 0.85, 1]));
    // 乙状结肠与直肠
    tube([[-0.52, -0.4, 0], [-0.24, -0.52, 0.04], [0, -0.5, 0.04], [0, -0.72, 0.02]], w, M.organ, g, 32);
    // 结肠袋特征（几道浅色的环形痕）
    for (let i = 0; i < 3; i++) {
      add(g, tor(w * 0.92, 0.014, Math.PI * 2, 20), M.organDark,
        [0.52, -0.2 + i * 0.18, 0], [Math.PI / 2, 0, 0], [1, 1, 1]);
    }
  },

  // ---------- 日常人体：肤色小人（几何以 part.pos 为中心） ----------
  head(g, M) {
    add(g, sph(0.4, 24), M.skin, [0, 0, 0], [0, 0, 0], [1, 1.16, 1.04]);
    add(g, sph(0.34, 20), M.skin, [0, -0.28, 0.05], [0, 0, 0], [1.05, 0.85, 1.1]);
  },
  hair(g, M) {
    add(g, sph(0.43, 22), M.hair, [0, 0.14, -0.02], [0, 0, 0], [1.02, 0.8, 1.05]);
    both(g, s => add(g, sph(0.12, 12), M.hair, [s * 0.33, -0.04, -0.02], [0, 0, 0], [1, 1.5, 1]));
  },
  eyes(g, M) {
    both(g, s => {
      add(g, sph(0.082, 16), M.eyeWhite, [s * 0.16, 0.04, 0.33]);
      add(g, sph(0.038, 12), M.eyeDark, [s * 0.16, 0.04, 0.39], [0, 0, 0], [1, 1, 0.5]);
      add(g, sph(0.026, 8), M.eyeDark, [s * 0.16, 0.04, 0.41]);
    });
  },
  nose(g, M) {
    add(g, sph(0.08, 14), M.skin, [0, -0.04, 0.39], [0, 0, 0], [1, 1.5, 1.2]);
    add(g, sph(0.055, 12), M.skinDark, [0, -0.12, 0.43], [0, 0, 0], [1.2, 0.8, 1.1]);
  },
  mouth(g, M) {
    add(g, sph(0.15, 18), M.lip, [0, -0.16, 0.37], [0, 0, 0], [1.5, 0.5, 0.5]);
  },
  lips(g, M) {
    both(g, s => add(g, tor(0.12, 0.026, Math.PI * 1.1, 22), M.lip,
      [s * 0.02, -0.1, 0.39], [Math.PI / 2, 0, s * 0.2], [1, 1, 0.6]));
  },
  teeth(g, M) {
    for (let i = 0; i < 6; i++) add(g, boxg(0.035, 0.06, 0.03), M.teeth, [(i - 2.5) * 0.05, -0.14, 0.41]);
  },
  cheeks(g, M) {
    both(g, s => add(g, sph(0.15, 16), M.skinDark, [s * 0.3, 0.0, 0.25], [0, 0, 0], [1, 1, 0.7]));
  },
  ears(g, M) {
    both(g, s => {
      add(g, tor(0.1, 0.035, Math.PI * 1.5, 22), M.skin, [s * 0.42, 0.04, -0.02], [s * 0.4, s * Math.PI / 2, 0.1], [1, 1.1, 0.5]);
      add(g, sph(0.04, 10), M.skinDark, [s * 0.4, -0.02, 0.04]);
    });
  },
  neck(g, M) {
    add(g, cyl(0.17, 0.6, 18, true), M.skin, [0, 0, 0]);
    add(g, sph(0.2, 16), M.skinDark, [0, -0.02, 0], [0, 0, 0], [1, 0.7, 1]);
  },
  chest(g, M) {
    add(g, sph(0.55, 24), M.skin, [0, 0, 0], [0, 0, 0], [1.05, 1.05, 0.66]);
    add(g, sph(0.11, 14), M.skinDark, [0, 0.2, 0.34]);
  },
  abdomen(g, M) {
    add(g, sph(0.5, 22), M.skin, [0, 0, 0], [0, 0, 0], [1, 1.1, 0.64]);
    add(g, boxg(0.05, 0.7, 0.04), M.skinDark, [0, 0.05, 0.32]);
  },
  arms(g, M) {
    both(g, s => {
      const x = s * 0.66;
      add(g, cap(0.11, 1.5, 14), M.skin, [x, 0, 0], [0, 0, s * 0.16]);
      add(g, sph(0.13, 14), M.skin, [x + s * 0.02, 0.75, 0], [0, 0, 0], [1, 1, 1]);
      add(g, sph(0.1, 12), M.skinDark, [x, -0.75, 0]);
    });
  },
  hands(g, M) {
    both(g, s => {
      const x = s * 0.95;
      add(g, sph(0.15, 16), M.skin, [x, 0, 0], [0, 0, 0], [0.8, 1, 0.5]);
      add(g, sph(0.09, 12), M.skinDark, [x, 0.12, 0]);
    });
  },
  fingers(g, M) {
    both(g, s => {
      const x = s * 0.95;
      for (let i = 0; i < 4; i++) add(g, cap(0.03, 0.22, 8), M.skin, [x + (i - 1.5) * 0.05, -0.16, 0], [0, 0, 0]);
      add(g, cap(0.032, 0.18, 8), M.skin, [x + s * 0.16, 0.02, 0.08], [0, s * 0.5, s * 0.8]);
    });
  },
  legs(g, M) {
    both(g, s => {
      const x = s * 0.24;
      add(g, cap(0.15, 3.0, 16), M.skin, [x, 0, 0], [0, 0, 0]);
      add(g, sph(0.17, 16), M.skin, [x, 1.5, 0], [0, 0, 0], [1, 0.8, 1]);
      add(g, sph(0.1, 12), M.skinDark, [x, -1.5, 0]);
    });
  },
  feet(g, M) {
    both(g, s => {
      const x = s * 0.24;
      add(g, boxg(0.22, 0.14, 0.5), M.skin, [x, 0, 0.12]);
      add(g, sph(0.12, 12), M.skinDark, [x, 0.32, 0.0]);
    });
  },
  toes(g, M) {
    both(g, s => {
      const x = s * 0.24;
      for (let i = 0; i < 5; i++) add(g, cap(0.022, 0.1, 8), M.skin, [x + (i - 2) * 0.04, -0.02, 0.34 - Math.abs(i - 2) * 0.03], [Math.PI / 2, 0, 0]);
    });
  },
};

function makeMats(system) {
  const M = {
    bone: mat(BONE),
    cartilage: mat(CARTILAGE, { roughness: 0.7 }),
    muscle: mat(MUSCLE, { roughness: 0.64 }),
    muscleDark: mat(MUSCLE_DARK, { roughness: 0.7 }),
    dark: mat(0x3a3330, { roughness: 0.9 }),
    vessel: mat(0xc0453f, { roughness: 0.5 }),
    vesselBlue: mat(0x4a6f9c, { roughness: 0.5 }),
    organLine: mat(0xc98a80, { roughness: 0.7 }),
    organ: mat(0xe7b0a6, { roughness: 0.5 }),
    organDark: mat(0xb98e84, { roughness: 0.55 }),
    // 日常人体（肤色小人）
    skin: mat(SKIN, { roughness: 0.62 }),
    skinDark: mat(SKIN_DARK, { roughness: 0.66 }),
    hair: mat(HAIR, { roughness: 0.82 }),
    eyeWhite: mat(EYE_WHITE, { roughness: 0.32 }),
    eyeDark: mat(EYE_DARK, { roughness: 0.4 }),
    lip: mat(LIP, { roughness: 0.48 }),
    teeth: mat(TEETH, { roughness: 0.28 }),
  };
  return M;
}

/** 用程序化几何生成一个部件（已摆到 part.pos），作为无模型时的兜底 */
export function buildProceduralGroup(part) {
  const g = new THREE.Group();
  const M = makeMats(part.system);
  if (part.system === 'organ' && ORGAN[part.id]) {
    M.organ = mat(ORGAN[part.id], { roughness: 0.48, metalness: 0.02 });
    M.organDark = mat(new THREE.Color(ORGAN[part.id]).multiplyScalar(0.72).getHex(), { roughness: 0.55 });
  }
  const build = builders[part.id];
  if (build) build(g, M);
  else add(g, sph(0.2), M.bone);
  g.position.set(...part.pos);
  g.userData.partId = part.id;
  g.traverse(o => { if (o.isMesh) o.userData.partId = part.id; });
  return g;
}
