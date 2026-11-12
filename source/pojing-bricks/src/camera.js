// 相机控制：环绕 / 平移 / 缩放，带阻尼
import * as THREE from '../lib/three.module.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class OrbitCam {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;

    this.target = new THREE.Vector3(0, 1.2, 0);
    this._targetGoal = this.target.clone();

    this.theta = -0.75;      // 水平角
    this.phi = 1.02;         // 极角 (0=正上方)
    this.dist = 26;

    this._thetaG = this.theta;
    this._phiG = this.phi;
    this._distG = this.dist;

    this.minDist = 7;
    this.maxDist = 62;
    this.minPhi = 0.18;
    this.maxPhi = 1.5;

    this.enabled = true;
    this._drag = null;
    this._pointers = new Map();
    this._pinchDist = 0;

    this._bind();
  }

  _bind() {
    const d = this.dom;

    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button === 2) return;
      d.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button, shift: e.shiftKey };
      }
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this._drag = null;
      }
    });

    d.addEventListener('pointermove', (e) => {
      if (this._pointers.has(e.pointerId)) {
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinchDist) {
          this._distG = clamp(this._distG * (this._pinchDist / Math.max(1, nd)), this.minDist, this.maxDist);
        }
        this._pinchDist = nd;
        return;
      }
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x;
      const dy = e.clientY - this._drag.y;
      this._drag.moved += Math.abs(dx) + Math.abs(dy);
      this._drag.x = e.clientX;
      this._drag.y = e.clientY;

      if (this._drag.button === 1 || this._drag.shift) {
        // 平移
        const panScale = this.dist * 0.0016;
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
        this._targetGoal.addScaledVector(right, -dx * panScale);
        this._targetGoal.addScaledVector(up, dy * panScale);
        const lim = 26;
        this._targetGoal.x = clamp(this._targetGoal.x, -lim, lim);
        this._targetGoal.z = clamp(this._targetGoal.z, -lim, lim);
        this._targetGoal.y = clamp(this._targetGoal.y, 0, 22);
      } else {
        this._thetaG -= dx * 0.0072;
        this._phiG = clamp(this._phiG - dy * 0.0062, this.minPhi, this.maxPhi);
      }
    });

    const end = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchDist = 0;
      if (this._pointers.size === 0) {
        this._drag = null;
      }
    };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);

    d.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this._distG = clamp(this._distG * (1 + Math.sign(e.deltaY) * 0.085), this.minDist, this.maxDist);
    }, { passive: false });

    d.addEventListener('contextmenu', e => e.preventDefault());
  }

  get dragging() { return this._drag && this._drag.moved > 8; }

  flyTo(theta, phi, dist, target) {
    this._thetaG = theta;
    this._phiG = clamp(phi, this.minPhi, this.maxPhi);
    this._distG = clamp(dist, this.minDist, this.maxDist);
    if (target) this._targetGoal.copy(target);
  }

  update(dt) {
    const k = 1 - Math.pow(0.0015, dt);
    this.theta += (this._thetaG - this.theta) * k;
    this.phi += (this._phiG - this.phi) * k;
    this.dist += (this._distG - this.dist) * k;
    this.target.lerp(this._targetGoal, k);

    const sp = Math.sin(this.phi);
    const x = this.target.x + this.dist * sp * Math.sin(this.theta);
    const y = this.target.y + this.dist * Math.cos(this.phi);
    const z = this.target.z + this.dist * sp * Math.cos(this.theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }
}

/**
 * 自适应取景：求一个「刚好把模型装进视锥」的距离与注视点。
 *
 * 图纸尺寸差别很大（小跑车 6 格宽、塔吊 10 格高），以前每张图写死 dist
 * 并一律看向 (0,2,0)：小模型四周空一大圈，高模型反而被裁掉顶。
 * 这里把包围盒 8 个角点投到相机坐标系，分别解出垂直/水平视野所需的最小
 * 距离，取最大值再乘一点余量；注视点对准包围盒中心，模型自然占满画面。
 *
 * @param {THREE.Box3} box 世界空间包围盒（调用方已含几何外扩余量）
 * @returns {{dist:number, target:THREE.Vector3}}
 */
export function fitCameraToBox(box, theta, phi, fovDeg, aspect, margin = 1.08) {
  const center = box.getCenter(new THREE.Vector3());
  const sp = Math.sin(phi);
  const dir = new THREE.Vector3(sp * Math.sin(theta), Math.cos(phi), sp * Math.cos(theta)); // 注视点 → 相机
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const tanV = Math.tan(fovDeg * Math.PI / 360);
  const tanH = tanV * Math.max(0.4, aspect);
  const v = new THREE.Vector3();
  let need = 0;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).sub(center);
        // depth = dist - v·dir，要求 |v·up| ≤ tanV·depth 且 |v·right| ≤ tanH·depth
        need = Math.max(need, v.dot(dir)
          + Math.max(Math.abs(v.dot(up)) / tanV, Math.abs(v.dot(right)) / tanH));
      }
    }
  }
  return { dist: need * margin, target: center };
}
