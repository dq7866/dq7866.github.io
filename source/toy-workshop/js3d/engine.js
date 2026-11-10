/* ============================================================
 * engine.js — 三维舞台
 * 负责：场景/灯光/地面、玩具装配、相机取景、旋转缩放、拾取、
 *       拆下/装回动画、幽灵与目标标记、透视模式、缩略图渲染
 * ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { buildGroup, buildGhost } from './kit.js';

const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function makeLights(scene) {
  const hemi = new THREE.HemisphereLight(0xfff6e6, 0xcbb79c, 1.15);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(5.5, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.55);
  fill.position.set(-6, 4, -5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffe6c0, 0.35);
  rim.position.set(0, 3, -8);
  scene.add(rim);
  return { hemi, key, fill, rim };
}

let groundGeo = null;
function makeGround() {
  if (!groundGeo) groundGeo = new THREE.CircleGeometry(7, 64);
  const m = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    color: '#F2E2C8', roughness: 0.95, metalness: 0
  }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.005;
  m.receiveShadow = true;
  return m;
}

/* 依据等级筛选零件 */
function filterParts(toy, level) {
  if (level === 'all') return { parts: toy.parts.slice(), fixed: [] };
  const all = toy.parts;
  if (level === 1) {
    return {
      parts: all.filter(p => p.easy === true),
      fixed: all.filter(p => p.staticInEasy === true)
    };
  }
  return { parts: all.slice(), fixed: [] };
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.camera.position.set(4.2, 3.4, 6.2);

    makeLights(this.scene);
    this.ground = makeGround();
    this.scene.add(this.ground);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.partLayer = new THREE.Group();
    this.ghostLayer = new THREE.Group();
    this.markerLayer = new THREE.Group();
    this.root.add(this.partLayer, this.ghostLayer, this.markerLayer);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 20;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.target.set(0, 1, 0);

    this.parts = new Map();      // id -> group
    this.homes = new Map();      // id -> {pos, quat}
    this.ghosts = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.tweens = [];
    this.clock = new THREE.Clock();
    this.xray = false;
    this.xrayMats = new Map();
    this.markerTex = makeMarkerTexture();
    this.ready = false;
    this.hl = null;
    this.arrow = null;

    this._loop = this._loop.bind(this);
    this.renderer.setAnimationLoop(this._loop);
    this._resize();
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(canvas);
    }
  }

  /* ---------- 尺寸 ---------- */
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  resize() { this._resize(); }

  /* ---------- 载入玩具 ---------- */
  setToy(toy, level) {
    this.clearToy();
    this.toy = toy;
    this.level = level;

    const { parts, fixed } = filterParts(toy, level);

    if (toy.base && toy.base.length) {
      const b = buildGroup(toy.base);
      b.userData.base = true;
      this.root.add(b);
      this.baseGroup = b;
    }
    /* 简单级里固定不拆的零件，当作固定结构渲染 */
    fixed.forEach(p => {
      const g = buildGroup(p.b);
      g.userData.fixed = true;
      this.root.add(g);
      (this.fixedGroups || (this.fixedGroups = [])).push(g);
    });

    parts.forEach(p => {
      const g = buildGroup(p.b, p.id);
      g.position.set(0, 0, 0);
      this.partLayer.add(g);
      this.parts.set(p.id, g);
      this.homes.set(p.id, { pos: g.position.clone(), quat: g.quaternion.clone() });
      g.userData.radius = Math.max(g.userData.size.x, g.userData.size.y, g.userData.size.z) * 0.5;
      g.userData.center = g.userData.center.clone();
      /* 拆下时飞出的方向：从物体中心向外 + 向上 */
      const c = g.userData.center;
      const dir = new THREE.Vector3(c.x, 0, c.z);
      if (dir.lengthSq() < 0.04) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(0.55);
      dir.y = 1;
      g.userData.out = dir.normalize();
    });

    this.fitCamera();
    this.ready = true;
    return { parts: parts.map(p => p.id) };
  }

  clearToy() {
    const wipe = grp => {
      grp.traverse(o => {
        if (o.isMesh && o.geometry && !o.geometry.userData.shared) {
          /* 几何体做了缓存，不能释放，只清引用 */
        }
      });
      while (grp.children.length) grp.remove(grp.children[0]);
    };
    wipe(this.partLayer);
    wipe(this.ghostLayer);
    wipe(this.markerLayer);
    if (this.baseGroup) { this.root.remove(this.baseGroup); this.baseGroup = null; }
    if (this.fixedGroups) {
      this.fixedGroups.forEach(g => this.root.remove(g));
      this.fixedGroups = null;
    }
    this.parts.clear(); this.homes.clear(); this.ghosts.clear();
    this.tweens.length = 0;
    this.hl = null;
    this.dimExcept(null, false);
    if (this.arrow) this.arrow.visible = false;
    this.ready = false;
  }

  /* ---------- 取景 ---------- */
  fitCamera() {
    const box = new THREE.Box3();
    let has = false;
    this.root.updateMatrixWorld(true);
    this.root.traverse(o => {
      if (o.isMesh) { box.expandByObject(o); has = true; }
    });
    if (!has) return;
    const size = new THREE.Vector3(), center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.95 + 1.2;
    const dir = new THREE.Vector3(0.72, 0.62, 1).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.set(center.x, center.y * 0.98, center.z);
    this.controls.minDistance = maxDim * 0.75;
    this.controls.maxDistance = maxDim * 5;
    this.camera.near = Math.max(0.05, maxDim / 200);
    this.camera.far = maxDim * 30;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  resetView() { this.fitCamera(); }

  /* ---------- 拾取 ---------- */
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.partLayer.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.partId) o = o.parent;
      if (o && o.userData.partId && o.visible) return { id: o.userData.partId, point: h.point };
    }
    return null;
  }

  /* 判断点击是否落在某个零件的目标附近（用于组装吸附） */
  pickTarget(clientX, clientY, id, tolerance) {
    const g = this.parts.get(id);
    if (!g) return false;
    const center = g.userData.center.clone();
    g.localToWorld(center);
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    /* 用一个虚拟球做近似命中 */
    const sphere = new THREE.Sphere(center, Math.max(tolerance, g.userData.radius * 0.55));
    const hit = this.raycaster.ray.intersectSphere(sphere, new THREE.Vector3());
    return !!hit;
  }

  worldPosOf(id) {
    const g = this.parts.get(id);
    if (!g) return null;
    const c = g.userData.center.clone();
    g.localToWorld(c);
    return c;
  }

  /* 零件中心投影到屏幕坐标（CSS 像素） */
  projectPart(id) {
    const w = this.worldPosOf(id);
    if (!w) return null;
    const v = w.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + (v.x * 0.5 + 0.5) * r.width,
      y: r.top + (-v.y * 0.5 + 0.5) * r.height,
      visible: v.z < 1
    };
  }

  /* ---------- 幽灵 / 标记 ---------- */
  showGhost(part, on) {
    let gh = this.ghosts.get(part.id);
    if (on) {
      if (!gh) {
        gh = buildGhost(part.b);
        this.ghostLayer.add(gh);
        this.ghosts.set(part.id, gh);
      }
      gh.visible = true;
    } else if (gh) {
      gh.visible = false;
    }
  }
  clearGhosts() {
    this.ghosts.forEach(g => g.visible = false);
  }

  showMarker(part, on) {
    let s = this.markers && this.markers.get(part.id);
    if (!this.markers) this.markers = new Map();
    if (on) {
      if (!s) {
        const m = new THREE.SpriteMaterial({ map: this.markerTex, depthTest: false, transparent: true, opacity: 0.95 });
        s = new THREE.Sprite(m);
        s.renderOrder = 999;
        this.markerLayer.add(s);
        this.markers.set(part.id, s);
      }
      const g = this.parts.get(part.id);
      const c = g.userData.center.clone();
      g.localToWorld(c);
      const sc = Math.max(0.5, g.userData.radius * 1.5);
      s.position.copy(c);
      s.scale.setScalar(sc);
      s.visible = true;
      s.userData.base = sc;
    } else if (s) {
      s.visible = false;
    }
  }
  clearMarkers() {
    if (this.markers) this.markers.forEach(m => m.visible = false);
  }

  /* ---------- 零件高亮（描边光晕，不改动共享材质） ---------- */
  _haloMat() {
    if (!this._hm) {
      this._hm = new THREE.MeshBasicMaterial({
        color: 0xFFB01F, transparent: true, opacity: 0.45,
        side: THREE.BackSide, depthWrite: false
      });
    }
    return this._hm;
  }

  highlight(id, on = true) {
    if (this.hl && this.hl !== id) this._dropHalo(this.hl);
    if (!on) {
      if (this.hl) { this._dropHalo(this.hl); this.hl = null; }
      return;
    }
    const g = this.parts.get(id);
    if (!g) return;
    if (!g.userData.halo) {
      const halo = new THREE.Group();
      halo.userData.isHalo = true;
      g.updateMatrixWorld(true);
      g.traverse(o => {
        if (!o.isMesh || o.userData.isHaloMesh) return;
        const m = new THREE.Mesh(o.geometry, this._haloMat());
        m.position.copy(o.position);
        m.quaternion.copy(o.quaternion);
        m.scale.copy(o.scale).multiplyScalar(1.055);
        m.raycast = () => {};
        m.castShadow = false;
        m.receiveShadow = false;
        m.renderOrder = 9;
        m.userData.isHaloMesh = true;
        halo.add(m);
      });
      g.add(halo);
      g.userData.halo = halo;
    }
    g.userData.halo.visible = true;
    this.hl = id;
  }

  _dropHalo(id) {
    const g = this.parts.get(id);
    if (g && g.userData.halo) {
      g.remove(g.userData.halo);
      g.userData.halo = null;
    }
  }

  /* ---------- 其余零件淡化 ---------- */
  dimExcept(keep, on) {
    if (this.xray) return;
    const keepArr = Array.isArray(keep) ? keep : (keep ? [keep] : []);
    this.parts.forEach((g, id) => {
      if (!on || keepArr.indexOf(id) >= 0) this._undim(g);
      else this._dim(g);
    });
  }

  _dim(g) {
    if (g.userData.dimmed) return;
    g.traverse(o => {
      if (!o.isMesh || o.userData.isHaloMesh) return;
      if (!o.userData.mat0) o.userData.mat0 = o.material;
      if (!o.userData.matDim) {
        const m = o.userData.mat0.clone();
        m.transparent = true;
        m.opacity = 0.13;
        m.depthWrite = false;
        o.userData.matDim = m;
      }
      o.material = o.userData.matDim;
    });
    g.userData.dimmed = true;
  }

  _undim(g) {
    if (!g.userData.dimmed) return;
    g.traverse(o => {
      if (o.isMesh && !o.userData.isHaloMesh && o.userData.mat0) o.material = o.userData.mat0;
    });
    g.userData.dimmed = false;
  }

  /* ---------- 指示箭头（向下，轻微上下浮动） ---------- */
  showArrow(id, on = true) {
    if (!on) { if (this.arrow) this.arrow.visible = false; return; }
    const g = this.parts.get(id);
    if (!g) return;
    if (!this.arrow) {
      const grp = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({
        color: 0xFF7A45, emissive: 0xFF7A45, emissiveIntensity: 0.5, roughness: 0.42, metalness: 0.1
      });
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.28, 18), m);
      head.rotation.x = Math.PI;
      head.position.y = 0.14;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.3, 12), m);
      shaft.position.y = 0.43;
      grp.add(head, shaft);
      grp.traverse(o => { if (o.isMesh) { o.raycast = () => {}; o.renderOrder = 10; } });
      this.arrow = grp;
      this.markerLayer.add(grp);
    }
    const c = g.userData.center.clone();
    g.localToWorld(c);
    const y = c.y + Math.max(0.7, g.userData.radius * 1.35);
    this.arrow.position.set(c.x, y, c.z);
    this.arrow.userData.baseY = y;
    this.arrow.visible = true;
  }

  /* ---------- 镜头聚焦到某个零件 ---------- */
  focusPart(id, dur = 700) {
    const g = this.parts.get(id);
    if (!g) return;
    if (this._focusing) return;
    const c = g.userData.center.clone();
    g.localToWorld(c);
    const fromT = this.controls.target.clone();
    const camFrom = this.camera.position.clone();
    const dir = camFrom.clone().sub(fromT);
    if (dir.lengthSq() < 1e-6) dir.set(0.7, 0.6, 1);
    dir.normalize();
    const curDist = camFrom.distanceTo(fromT);
    const want = Math.min(Math.max(g.userData.radius * 6.2, 2.8), curDist);
    const camTo = c.clone().addScaledVector(dir, want);
    this._focusing = true;
    this.controls.enabled = false;
    return this._tween(dur, t => {
      const e = easeInOut(t);
      this.controls.target.lerpVectors(fromT, c, e);
      this.camera.position.lerpVectors(camFrom, camTo, e);
      this.camera.lookAt(this.controls.target);
    }, () => {
      this._focusing = false;
      this.controls.enabled = true;
      this.controls.update();
    });
  }

  /* ---------- 当前方位角（弧度） ---------- */
  azimuth() {
    return this.controls.getAzimuthalAngle();
  }

  /* ---------- 透视 ---------- */
  _xrayMat(m) {
    const key = m.uuid;
    if (this.xrayMats.has(key)) return this.xrayMats.get(key);
    const c = m.clone();
    c.transparent = true;
    c.opacity = 0.2;
    c.depthWrite = false;
    this.xrayMats.set(key, c);
    return c;
  }
  setXray(on) {
    this.xray = on;
    if (on) { this.dimExcept(null, false); this.highlight(null, false); }
    this.parts.forEach(g => {
      g.traverse(o => {
        if (!o.isMesh) return;
        if (on) {
          if (!o.userData.m0) { o.userData.m0 = o.material; o.material = this._xrayMat(o.material); }
        } else if (o.userData.m0) {
          o.material = o.userData.m0;
          delete o.userData.m0;
        }
      });
    });
  }

  /* ---------- 动画 ---------- */
  _tween(dur, fn, done) {
    return new Promise(res => {
      this.tweens.push({ t: 0, dur, fn, done: () => { done && done(); res(); } });
    });
  }

  animateOut(id) {
    const g = this.parts.get(id);
    if (!g) return Promise.resolve();
    const home = this.homes.get(id).pos.clone();
    const out = g.userData.out.clone();
    const dist = Math.max(2.2, g.userData.radius * 3.4);
    const homeQ = this.homes.get(id).quat.clone();
    return this._tween(620, t => {
      const e = easeOut(t);
      g.position.copy(home).addScaledVector(out, dist * e);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e * 0.6, e * 0.9, 0));
      g.quaternion.copy(homeQ).multiply(q);
      g.scale.setScalar(1 - e * 0.55);
    }, () => {
      g.visible = false;
      g.position.copy(home);
      g.quaternion.copy(homeQ);
      g.scale.setScalar(1);
    });
  }

  animateIn(id) {
    const g = this.parts.get(id);
    if (!g) return Promise.resolve();
    const home = this.homes.get(id).pos.clone();
    const homeQ = this.homes.get(id).quat.clone();
    const from = home.clone().add(new THREE.Vector3(0, 2.4, 1.6));
    g.visible = true;
    g.position.copy(from);
    g.scale.setScalar(0.35);
    g.quaternion.copy(homeQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.7, 0)));
    if (this.xray) {
      g.traverse(o => {
        if (o.isMesh && !o.userData.m0) { o.userData.m0 = o.material; o.material = this._xrayMat(o.material); }
      });
    }
    return this._tween(560, t => {
      const e = easeInOut(t);
      g.position.lerpVectors(from, home, e);
      g.scale.setScalar(0.35 + 0.65 * e);
      g.quaternion.slerpQuaternions(
        homeQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.7, 0))),
        homeQ, e
      );
    }, () => {
      g.position.copy(home);
      g.quaternion.copy(homeQ);
      g.scale.setScalar(1);
    });
  }

  shake(id) {
    const g = this.parts.get(id);
    if (!g) return Promise.resolve();
    const home = this.homes.get(id).pos.clone();
    return this._tween(360, t => {
      const a = Math.sin(t * Math.PI * 6) * 0.1 * (1 - t);
      g.position.copy(home).add(new THREE.Vector3(a, 0, 0));
    }, () => g.position.copy(home));
  }

  /* ---------- 主循环 ---------- */
  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt * 1000 / tw.dur;
      if (tw.t >= 1) {
        tw.fn(1);
        this.tweens.splice(i, 1);
        tw.done();
      } else tw.fn(tw.t);
    }
    if (this.markers) {
      this.markers.forEach(m => {
        if (!m.visible) return;
        const s = m.userData.base || 1;
        const pulse = 1 + Math.sin(now / 260) * 0.12;
        m.scale.setScalar(s * pulse);
        m.material.opacity = 0.7 + Math.sin(now / 260) * 0.25;
      });
    }
    /* 高亮光晕呼吸 */
    if (this.hl) {
      const g = this.parts.get(this.hl);
      const halo = g && g.userData.halo;
      if (halo) halo.children.forEach(m => { m.material.opacity = 0.34 + Math.sin(now / 230) * 0.2; });
    }
    /* 指示箭头上下浮动 */
    if (this.arrow && this.arrow.visible) {
      this.arrow.position.y = (this.arrow.userData.baseY || 1) + Math.sin(now / 320) * 0.07;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.clearToy();
    this.renderer.dispose();
  }
}

/* 目标标记贴图：同心圆 + 十字 */
function makeMarkerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(58,166,255,0.95)';
  g.lineWidth = 8;
  g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4;
  g.beginPath(); g.arc(64, 64, 32, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(58,166,255,0.75)';
  g.beginPath(); g.arc(64, 64, 8, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 缩略图：一个复用渲染器批量出图 ---------- */
export class ThumbRenderer {
  constructor(w = 400, h = 300) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  render(toy) {
    const scene = new THREE.Scene();
    makeLights(scene);
    const ground = makeGround();
    ground.scale.setScalar(0.42);
    scene.add(ground);
    const root = new THREE.Group();
    scene.add(root);
    if (toy.base) root.add(buildGroup(toy.base));
    toy.parts.forEach(p => root.add(buildGroup(p.b)));

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(), center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const cam = new THREE.PerspectiveCamera(34, this.w / this.h, 0.1, 100);
    const dist = maxDim * 1.75 + 0.8;
    cam.position.copy(center).add(new THREE.Vector3(0.62, 0.52, 1).normalize().multiplyScalar(dist));
    cam.lookAt(center.x, center.y * 0.94, center.z);
    this.renderer.render(scene, cam);
    const url = this.canvas.toDataURL('image/png');
    scene.traverse(o => { if (o.isMesh && o.material && o.material.dispose) o.material.dispose(); });
    return url;
  }
  dispose() { this.renderer.dispose(); }
}
