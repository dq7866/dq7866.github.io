// 轻量物理：积木下落的弹跳 + 拆除时的碎块飞散
import * as THREE from '../lib/three.module.js';

/**
 * 下落动画控制器
 * 用于：新放下的积木从高处落到目标位置并弹两下
 */
export class DropAnimator {
  constructor() {
    this.items = [];
  }

  /**
   * @param {THREE.Object3D} obj 要被动画的物体
   * @param {number} targetY 最终 Y
   * @param {{drop?:number, delay?:number, bounce?:number}} opts
   */
  add(obj, targetY, opts = {}) {
    const drop = opts.drop ?? 1.6;
    this.items.push({
      obj,
      targetY,
      y: targetY + drop,
      vy: 0,
      bounce: opts.bounce ?? 0.34,
      delay: opts.delay ?? 0,
      rest: false,
      squash: 0,
      t: 0,
    });
  }

  update(dt) {
    const G = 26;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      // 积木被拆掉、或整局清空后，网格已经脱离场景，这条动画就是残留：
      // 继续跑下去会白占内存，还会把已删除的物体位置再改一遍
      if (!it.obj.parent) { this.items.splice(i, 1); continue; }
      if (it.delay > 0) { it.delay -= dt; continue; }
      it.t += dt;

      if (!it.rest) {
        it.vy -= G * dt;
        it.y += it.vy * dt;
        if (it.y <= it.targetY) {
          it.y = it.targetY;
          if (Math.abs(it.vy) > 2.2) {
            // 弹一下 + 挤压
            it.squash = Math.min(0.24, Math.abs(it.vy) * 0.012);
            it.vy = -it.vy * it.bounce;
          } else {
            it.vy = 0;
            it.rest = true;
          }
        }
      }

      it.squash *= Math.pow(0.0016, dt);
      const s = it.squash;
      // 落地瞬间压扁再回弹
      it.obj.position.y = it.y - s * 0.5;
      it.obj.scale.set(1 + s * 0.9, 1 - s * 1.5, 1 + s * 0.9);

      if (it.rest && it.squash < 0.002) {
        it.obj.position.y = it.targetY;
        it.obj.scale.set(1, 1, 1);
        this.items.splice(i, 1);
      }
    }
  }

  /** 主动撤销某个物体的下落动画（例如撤消放置时） */
  remove(obj) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].obj === obj) this.items.splice(i, 1);
    }
  }

  clear() { this.items.length = 0; }
}

/**
 * 碎块特效池：拆除积木时喷出一堆小方块，受重力落地后淡出
 */
export class DebrisSystem {
  constructor(scene, max = 260) {
    this.scene = scene;
    this.max = max;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(
      this.geo,
      new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }),
      max
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);

    this.parts = [];
    for (let i = 0; i < max; i++) {
      this.parts.push({
        life: 0, max: 1,
        p: new THREE.Vector3(), v: new THREE.Vector3(),
        s: 0.2, rot: new THREE.Euler(), spin: new THREE.Vector3(),
        color: new THREE.Color(0xffffff),
      });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._sv = new THREE.Vector3();
  }

  /** 在 (x,y,z) 处按尺寸喷出碎块 */
  burst(x, y, z, w, h, d, hex, count = 14) {
    let spawn = 0;
    for (const pt of this.parts) {
      if (spawn >= count) break;
      if (pt.life > 0) continue;
      pt.life = 0.9 + Math.random() * 0.6;
      pt.max = pt.life;
      pt.p.set(
        x + (Math.random() - 0.5) * w,
        y + (Math.random() - 0.5) * h,
        z + (Math.random() - 0.5) * d
      );
      pt.v.set(
        (Math.random() - 0.5) * 5,
        1.5 + Math.random() * 5,
        (Math.random() - 0.5) * 5
      );
      pt.s = 0.12 + Math.random() * 0.2;
      pt.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      pt.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      pt.color.setHex(hex);
      spawn++;
    }
  }

  update(dt) {
    let idx = 0;
    const G = 22;
    for (const pt of this.parts) {
      if (pt.life <= 0) continue;
      pt.life -= dt;
      pt.v.y -= G * dt;
      pt.p.addScaledVector(pt.v, dt);
      if (pt.p.y < 0.08) {
        pt.p.y = 0.08;
        pt.v.y = Math.abs(pt.v.y) * 0.35;
        pt.v.x *= 0.72;
        pt.v.z *= 0.72;
      }
      pt.rot.x += pt.spin.x * dt;
      pt.rot.y += pt.spin.y * dt;
      pt.rot.z += pt.spin.z * dt;

      const k = Math.max(0, Math.min(1, pt.life / pt.max * 1.6));
      this._q.setFromEuler(pt.rot);
      this._sv.setScalar(pt.s * k);
      this._m.compose(pt.p, this._q, this._sv);
      this.mesh.setMatrixAt(idx, this._m);
      this.mesh.setColorAt(idx, pt.color);
      idx++;
    }
    this.mesh.count = idx;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.parts.forEach(p => (p.life = 0)); this.mesh.count = 0; }
}
