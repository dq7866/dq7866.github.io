// 场景环境：光照、地面网格、天空、粒子
import * as THREE from '../lib/three.module.js';

export function buildEnvironment(scene, renderer) {
  // ---- 天空渐变穹顶 ----
  const skyGeo = new THREE.SphereGeometry(160, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x0a0d24) },
      mid: { value: new THREE.Color(0x1d2350) },
      bottom: { value: new THREE.Color(0x3a2a4d) },
    },
    vertexShader: `
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 c = mix(bottom, mid, smoothstep(-0.25, 0.18, h));
        c = mix(c, top, smoothstep(0.1, 0.85, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // ---- 环境反射（用 PMREM 从天空生成，让积木有柔和反光）----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(skyGeo.clone(), skyMat.clone());
  envScene.add(envSky);
  const roomLightA = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
  );
  roomLightA.position.set(-30, 40, -20);
  roomLightA.lookAt(0, 0, 0);
  envScene.add(roomLightA);
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();
  // PMREM 用的临时场景立刻释放，别留下悬空资源
  envSky.geometry.dispose();
  envSky.material.dispose();
  roomLightA.geometry.dispose();
  roomLightA.material.dispose();

  // ---- 灯光 ----
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x2a2140, 0.85);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff0d6, 2.1);
  key.position.set(14, 26, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 90;
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  scene.add(key.target);

  const rim = new THREE.DirectionalLight(0x7ea2ff, 0.75);
  rim.position.set(-16, 12, -18);
  scene.add(rim);

  const fill = new THREE.PointLight(0xff7a3c, 0.55, 60, 2);
  fill.position.set(0, 6, 22);
  scene.add(fill);

  // ---- 地面 ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x141a33, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- 网格格线 ----
  const GRID = 30;
  const grid = new THREE.GridHelper(GRID, GRID, 0x4a5c9e, 0x2a3358);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.position.y = 0.002;
  scene.add(grid);

  // 中心地台：一圈发光边界
  const plateGeo = new THREE.RingGeometry(GRID * 0.5 - 0.06, GRID * 0.5, 64);
  const plateMat = new THREE.MeshBasicMaterial({ color: 0x6b7cff, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(plateGeo, plateMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  scene.add(ring);

  // ---- 漂浮星尘 ----
  const STAR = 260;
  const pos = new Float32Array(STAR * 3);
  const baseY = new Float32Array(STAR);   // 每颗星的基准高度
  const seed = new Float32Array(STAR);
  for (let i = 0; i < STAR; i++) {
    const r = 22 + Math.random() * 55;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 1 + Math.random() * 34;
    pos[i * 3 + 2] = Math.sin(a) * r;
    baseY[i] = pos[i * 3 + 1];
    seed[i] = Math.random() * 100;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({
    size: 0.42, color: 0xa9c2ff, transparent: true, opacity: 0.72,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // 系统开启「减少动态效果」时（前庭敏感、易眩晕的用户会开），
  // 停掉纯装饰性的漂浮与呼吸动画，只保留必要的画面
  let reduceMotion = false;
  try { reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { }

  // 星尘抖动很细微，隔帧更新即可（省掉每帧 260 次浮点写 + 一次 GPU 上传）
  let starTick = 0;

  return {
    grid, ring, stars, seed, key, hemi,
    setGridVisible(v) { grid.visible = v; ring.visible = v; },
    update(t) {
      if (reduceMotion) return;
      stars.rotation.y = t * 0.012;
      ring.material.opacity = 0.26 + Math.sin(t * 1.6) * 0.09;
      if (++starTick % 4 === 0) {
        // 必须围绕基准高度摆动。早先写成 "+=" 累加，等于让每颗星做随机游走，
        // 玩上十来分钟就会整片飘到天上或沉到地下，看着像星星"跑掉了"
        const arr = starGeo.attributes.position.array;
        for (let i = 0; i < STAR; i++) {
          arr[i * 3 + 1] = baseY[i] + Math.sin(t * 0.5 + seed[i]) * 1.1;
        }
        starGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
