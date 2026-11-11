/* ============================================================
   3D 场景（Three.js）
   ------------------------------------------------------------
   设计取舍：
   - 3D 只是"背景层的替代品"，不接管任何玩法逻辑。
     所有数值仍然由 ui.js 的 envFor / evaluateEnv 决定，3D 只做视觉映射。
   - 每个栖息地造一个不同的立体空间：
       土壤/笼舍 → 温室（钢架 + 玻璃 + 台架 + 植物）
       池塘     → 水体（水面涟漪 + 水草 + 岸边）
       蜂箱     → 巢内（六边形巢房墙 + 巢框）
       菌床     → 暗室（层架 + 菌包 + 雾气）
   - 性能：只建低面数几何体，靠 fog + 暗部掩盖细节；不加载任何贴图。
   - 降级：WebGL 不可用、或玩家手动关掉时，退回原来的静态背景图。
   ============================================================ */

const SCENE3D_KEY = (typeof storeKey === 'function') ? storeKey('scene3d') : 'naturelab.scene3d';

let S3 = {
  on: false,          // 是否启用 3D
  ok: false,          // WebGL 是否可用
  renderer: null,
  scene: null,
  camera: null,
  raf: 0,
  kind: null,         // 当前场景类型（soil/water/hive/dark）
  t: 0,
  lowPower: false,
  _fT: 0, _fN: 0, _checked: false
};

function scene3dPreferred() {
  try { return localStorage.getItem(SCENE3D_KEY) !== '0'; } catch (e) { return true; }
}
function scene3dSet(on) {
  try { localStorage.setItem(SCENE3D_KEY, on ? '1' : '0'); } catch (e) {}
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

/* ---------- 程序化贴图 ----------
   不下载任何图片，用 Canvas 现画一张噪点/渐变图当贴图。
   好处：单文件离线、零请求；坏处：每张都要自己控制尺寸别太大。 */
function canvasTex(w, h, painter, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  painter(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if ('encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}
function noiseTex(w, h, base, amp, repeat) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.35; i++) {
      const v = Math.random();
      g.fillStyle = `rgba(${v < .5 ? 0 : 255},${v < .5 ? 0 : 255},${v < .5 ? 0 : 255},${Math.random() * amp})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }, repeat);
}
// 地面：中心亮、四周暗的径向渐变 —— 这是最省力的"把视线收到中间"的手段
function floorTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.55);
    rg.addColorStop(0, '#2a3128');
    rg.addColorStop(0.55, '#161c16');
    rg.addColorStop(1, '#080b08');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    // 撒一层泥土颗粒
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      g.fillStyle = `rgba(${v < .6 ? 10 : 120},${v < .6 ? 14 : 110},${v < .6 ? 10 : 90},${Math.random() * .35})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  });
}
// 木材纹理：横向条纹
function woodTex(base, dark) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = dark; g.globalAlpha = Math.random() * .28;
      g.beginPath();
      const y = Math.random() * h;
      g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 4, w * .6, y - 4, w, y + 1);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, [1, 6]);
}
// 水面：细密波纹（法线感靠颜色明暗模拟，比真法线贴图便宜）
function waterTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1a4a52'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      const y = Math.random() * h;
      g.strokeStyle = `rgba(180,225,235,${Math.random() * .16})`;
      g.lineWidth = .6 + Math.random() * 1.6;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * .09 + i) * 2.4);
      g.stroke();
    }
  }, [6, 6]);
}

/* ---------- 几何体工厂：全部程序化生成，不依赖贴图 ---------- */

// 温室：钢架拱顶 + 玻璃面 + 台架 + 地面
function buildGreenhouse(scene, night) {
  const g = new THREE.Group();

  // 地面：带轻微色差的深色地面
  const floorGeo = new THREE.PlaneGeometry(60, 60, 1, 1);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex(), color: 0x8a8a8a, roughness: 1.0, metalness: 0 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  g.add(floor);

  // 拱顶钢架：一圈一圈的拱肋
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x39463a, roughness: 0.55, metalness: 0.7 });
  for (let i = 0; i < 7; i++) {
    const z = -18 + i * 6;
    const curve = new THREE.EllipseCurve(0, 0, 11, 9, 0, Math.PI, false);
    const pts = curve.getPoints(24).map(p => new THREE.Vector3(p.x, p.y, z));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: night ? 0x53685a : 0x9ab3a0 })));
  }
  // 纵向檩条
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    const x = Math.cos(a) * 11, y = Math.sin(a) * 9;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, -18), new THREE.Vector3(x, y, 18)
    ]);
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: night ? 0x46584a : 0x7d9482 })));
  }

  // 玻璃：半透明大平面（两侧 + 顶部），用低透明度的加法混合做出"透光"感
  const glassMat = new THREE.MeshBasicMaterial({
    color: night ? 0x25405c : 0xa8e0c8, transparent: true, opacity: night ? 0.10 : 0.10,
    side: THREE.DoubleSide, depthWrite: false
  });
  [[-11, 2, 0, 0, Math.PI / 2], [11, 2, 0, 0, -Math.PI / 2]].forEach(([x, y, z, rx, ry]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(36, 14), glassMat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
    g.add(m);
  });

  // 台架：两排长条 + 支腿，间隔摆放，形成纵深
  const benchMat = new THREE.MeshStandardMaterial({ map: woodTex('#5a4c38', '#2a2218'), roughness: 0.95 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x6b4232, roughness: 0.92 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3c6a34, roughness: 0.92, flatShading: true, emissive: 0x0e1a0a, emissiveIntensity: 1 });
  for (let side of [-1, 1]) {
    for (let row = 0; row < 2; row++) {
      const x = side * (3.4 + row * 2.0);
      // 台面用薄板 + 下方的支腿，比一整块实心长方体像真台架
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 30), benchMat);
      bench.position.set(x, -1.35, -2);
      g.add(bench);
      for (let lg = 0; lg < 6; lg++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), benchMat);
        leg.position.set(x - 0.6, -2.1, -16 + lg * 5.6);
        g.add(leg);
        const leg2 = leg.clone();
        leg2.position.x = x + 0.6;
        g.add(leg2);
      }

      // 台面上的花盆与植株
      // 用"一团球形叶簇"代替锥体：锥体在近景读起来像圣诞树，
      // 而三四个压扁的球叠在一起，远看就是一团枝叶。
      for (let i = 0; i < 9; i++) {
        const z = -15 + i * 3.4 + row * 0.7;
        const px = x + (Math.random() - 0.5) * 1.0;
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.46, 9), potMat);
        pot.position.set(px, -1.02, z);
        g.add(pot);

        // 叶团：3 个球体错位叠放，越往上越小
        const clumpY = -0.78;
        const scale = 0.72 + Math.random() * 0.5;
        for (let b = 0; b < 3; b++) {
          const r = (0.36 - b * 0.07) * scale;
          const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
          leaf.position.set(
            px + (Math.random() - 0.5) * 0.34 * scale,
            clumpY + b * 0.30 * scale,
            z + (Math.random() - 0.5) * 0.34 * scale
          );
          leaf.scale.set(1, 0.82, 1);
          leaf.rotation.set(Math.random(), Math.random() * 3.14, Math.random());
          g.add(leaf);
        }
      }
    }
  }
  // 中央通道：一条比地面略浅的纵向带，暗示这是走道而非整块水泥
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x1c2320, roughness: 1 });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 40), pathMat);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, -2.98, -2);
  g.add(path);

  // 土垄：台架下方堆起的深色土壤，让台架"落地"而不是悬空
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
  for (let side of [-1, 1]) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.5, 34), soilMat);
    ridge.position.set(side * 5.8, -2.85, -2);
    g.add(ridge);
  }
  return g;
}

// 池塘：水面 + 岸边 + 水草
function buildPond(scene, night) {
  const g = new THREE.Group();

  const waterMat = new THREE.MeshStandardMaterial({
    map: waterTex(), color: night ? 0x4a6a7a : 0x8ad0d8, roughness: 0.18, metalness: 0.35,
    transparent: true, opacity: 0.92
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(70, 70, 60, 60), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -2.2;
  water.userData.wave = true;
  g.add(water);

  // 岸边石堆
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a6357, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const s = 0.4 + Math.random() * 1.1;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 9;
    rock.position.set(Math.cos(a) * r, -2.3 + Math.random() * 0.5, Math.sin(a) * r - 4);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    g.add(rock);
  }

  // 水草：细长锥体，随机摆动
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x3f7a56, roughness: 0.9, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const weeds = [];
  for (let i = 0; i < 40; i++) {
    const h = 1.4 + Math.random() * 2.6;
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.09, h, 4), weedMat);
    const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 14;
    w.position.set(Math.cos(a) * r, -2.2 + h / 2, Math.sin(a) * r - 4);
    w.userData.phase = Math.random() * 6.28;
    w.userData.baseX = w.position.x;
    weeds.push(w);
    g.add(w);
  }
  g.userData.weeds = weeds;
  return g;
}

// 蜂箱内部：真正的巢脾 —— 实心蜡板打孔，而不是"一堆凸出的六棱柱"
// 关键认识：巢房是凹进去的孔洞。之前用 CylinderGeometry 做出来是往外凸的砖块，
// 所以看着像蜂窝装饰墙而不是蜂巢。这里改成：蜡板 + 内凹的六棱锥台（开口朝镜头）。
function buildHive(scene, night) {
  const g = new THREE.Group();

  const R = 0.52, DEPTH = 0.56;
  const waxColor = night ? 0x9a6a26 : 0xd08a20;

  // 巢脾底板：一整块平面，作为所有孔洞的"底"
  const boardMat = new THREE.MeshStandardMaterial({
    color: night ? 0x2a1c0c : 0x4a3014, roughness: 0.95, metalness: 0.02
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 9.4), boardMat);
  board.position.set(0, 1.0, -3.55);
  g.add(board);

  // 单个巢房：六棱锥台（上宽下窄），开口朝 +Z 即镜头方向
  // CylinderGeometry(topR, botR, h, 6) 默认轴沿 Y，绕 X 转 -90° 后开口朝 +Z
  const cellGeo = new THREE.CylinderGeometry(R, R * 0.62, DEPTH, 6, 1, true);
  const waxMat = new THREE.MeshStandardMaterial({
    color: waxColor, roughness: 0.74, metalness: 0.03, side: THREE.DoubleSide,
    // 蜂蜡有蜡质透光感，纯反射光会显得发灰，加一点自发光把琥珀色托出来
    emissive: night ? 0x2a1a06 : 0x4a2c08, emissiveIntensity: 1
  });
  // 孔底：一小块六边形封底，让孔看起来有深度而不是穿透
  const bottomGeo = new THREE.CircleGeometry(R * 0.62, 6);
  const bottomMat = new THREE.MeshStandardMaterial({ color: night ? 0x140e04 : 0x221806, roughness: 1 });

  const cols = 15, rows = 9;
  const stepX = R * Math.sqrt(3) * 0.98;   // 六边形密铺的横向步距 = √3·R
  const stepY = R * 1.5 * 0.98;            // 纵向步距 = 1.5·R
  const inst = new THREE.InstancedMesh(cellGeo, waxMat, cols * rows);
  const instBot = new THREE.InstancedMesh(bottomGeo, bottomMat, cols * rows);
  inst.frustumCulled = false; instBot.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let k = 0, filled = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * stepX + (r % 2 ? stepX / 2 : 0);
      const y = (r - (rows - 1) / 2) * stepY + 1.0;
      dummy.position.set(x, y, -3.3);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);

      // 孔底略微内推，形成纵深
      dummy.position.set(x, y, -3.3 - DEPTH);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      instBot.setMatrixAt(k, dummy.matrix);
      k++;
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  instBot.instanceMatrix.needsUpdate = true;
  if (typeof inst.computeBoundingBox === 'function') inst.computeBoundingBox();
  if (typeof instBot.computeBoundingBox === 'function') instBot.computeBoundingBox();
  g.add(inst);
  g.add(instBot);

  // 蜜盖：随机挑一些巢房封上盖子（成熟蜜脾的外观），让表面不呆板
  const capMat = new THREE.MeshStandardMaterial({ color: night ? 0xd8a860 : 0xf2cf8a, roughness: 0.45, metalness: 0.05 });
  const capGeo = new THREE.CircleGeometry(R * 0.94, 6);
  const caps = [];
  for (let i = 0; i < 34; i++) caps.push(i);
  const instCap = new THREE.InstancedMesh(capGeo, capMat, caps.length);
  instCap.frustumCulled = false;
  let ci = 0;
  caps.forEach(() => {
    const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols);
    const x = (c - (cols - 1) / 2) * stepX + (r % 2 ? stepX / 2 : 0);
    const y = (r - (rows - 1) / 2) * stepY + 1.0;
    dummy.position.set(x, y, -3.28);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    instCap.setMatrixAt(ci++, dummy.matrix);
  });
  instCap.instanceMatrix.needsUpdate = true;
  if (typeof instCap.computeBoundingBox === 'function') instCap.computeBoundingBox();
  g.add(instCap);

  // 巢框（上梁 + 两侧边条），木质
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a6234, roughness: 0.95 });
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.5, 0.9), frameMat);
  topBar.position.set(0, 6.0, -2.55);
  g.add(topBar);
  for (let side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 10.2, 0.9), frameMat);
    rail.position.set(side * 8.0, 0.9, -2.55);
    g.add(rail);
  }

  // 箱体内壁：包住整个视野，形成"在蜂箱里"的包裹感
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 1, side: THREE.BackSide });
  const box = new THREE.Mesh(new THREE.BoxGeometry(22, 18, 24), wallMat);
  box.position.set(0, 0.6, 0);
  g.add(box);
  return g;
}

// 菌床：层架 + 菌包 + 雾
function buildDark(scene, night) {
  const g = new THREE.Group();

  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x4a4e48, roughness: 0.9, metalness: 0.25 });
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d4, roughness: 0.85, emissive: 0x2a2a22 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xb0a698, roughness: 0.7, flatShading: true });

  for (let row = 0; row < 4; row++) {
    const y = -2.6 + row * 2.3;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(18, 0.16, 5), shelfMat);
    shelf.position.set(0, y, -1);
    g.add(shelf);

    for (let i = 0; i < 7; i++) {
      const x = -7.2 + i * 2.4;
      // 菌包：矮圆柱
      const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 1.5, 9), bagMat);
      bag.position.set(x, y + 0.83, -1 + (i % 2 ? 0.5 : -0.5));
      g.add(bag);
      // 菇丛：一簇小伞盖
      for (let j = 0; j < 4; j++) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
        cap.position.set(bag.position.x + (Math.random() - 0.5) * 0.7, y + 1.7 + Math.random() * 0.5, bag.position.z + (Math.random() - 0.5) * 0.6);
        cap.rotation.x = Math.PI + (Math.random() - 0.5) * 0.3;
        g.add(cap);
      }
    }
  }
  // 后墙
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x32362f, roughness: 1, side: THREE.BackSide });
  const box = new THREE.Mesh(new THREE.BoxGeometry(24, 18, 24), wallMat);
  box.position.set(0, 1, 0);
  g.add(box);
  return g;
}

/* ---------- 初始化与主循环 ---------- */

function scene3dInit(canvas) {
  if (!window.THREE) return false;
  if (!webglAvailable()) return false;
  try {
    S3.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true, powerPreference: 'low-power',
      // 必须开：否则每帧渲染完缓冲区就被清掉，页面合成器拿到的是空画布，
      // 表现就是"JS 里明明在渲染，屏幕上却看不到任何 3D 内容"。
      // 代价是多占一份显存，对这种低面数场景可以忽略。
      preserveDrawingBuffer: true
    });
    S3.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    // r149 默认 LinearEncoding：颜色会整体偏暗发灰，必须显式切 sRGB 输出。
    // 注意不要用 ACESFilmicToneMapping —— 它会把饱和的暖色（蜂蜜琥珀、陶土）压成灰绿，
    // 整个场景变成"脏橄榄色"。这里用 NoToneMapping + 手动控光，色彩更准。
    if ('outputEncoding' in S3.renderer) S3.renderer.outputEncoding = THREE.sRGBEncoding;
    if ('toneMapping' in S3.renderer) S3.renderer.toneMapping = THREE.NoToneMapping;
    S3.scene = new THREE.Scene();
    // 雾：同时承担"远景消隐"和"氛围"两个作用，是最廉价的空间感来源
    S3.scene.fog = new THREE.FogExp2(0x0e1512, 0.032);
    S3.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    S3.camera.position.set(0, 2.2, 10.5);
    S3.camera.lookAt(0, 0.6, -3);

    // 灯光：一个主光（模拟天窗）+ 一个补光（背部轮廓）+ 一盏正面柔光
    // 第三盏灯是为了让镜头正对的物体不吃成剪影——纯环境光做不到这点
    const key = new THREE.DirectionalLight(0xfff2dc, 1.15);
    key.position.set(5, 16, 4);
    S3.scene.add(key);
    const fill = new THREE.HemisphereLight(0xd8c8b0, 0x1a1610, 0.95);
    S3.scene.add(fill);
    const front = new THREE.DirectionalLight(0xdff0e8, 0.6);
    front.position.set(-4, 4, 12);
    S3.scene.add(front);
    S3.keyLight = key;
    S3.fillLight = fill;
    S3.frontLight = front;

    S3.canvasEl = canvas;
    S3.ok = true;
    return true;
  } catch (e) {
    S3.ok = false;
    return false;
  }
}

function scene3dBuild(kind, night) {
  if (!S3.ok) return;
  // 清掉旧场景里的内容（保留灯光）
  const keep = new Set([S3.keyLight, S3.fillLight, S3.frontLight]);
  [...S3.scene.children].forEach(c => { if (!keep.has(c)) S3.scene.remove(c); });

  let g = null;
  if (kind === 'water') g = buildPond(S3.scene, night);
  else if (kind === 'hive') g = buildHive(S3.scene, night);
  else if (kind === 'dark') g = buildDark(S3.scene, night);
  else g = buildGreenhouse(S3.scene, night);
  S3.scene.add(g);
  S3.world = g;
  S3.kind = kind;

  // 不同场景的雾与灯光基调不同：菌床要暗、蜂箱要暖、池塘要青
  // dens 值刻意调小：雾太浓会把整个场景糊成一片，空间感反而丢失
  const tone = {
    water: { fog: 0x0b2430, dens: 0.018, key: 0xa8dcec, amb: 0x24424e },
    hive: { fog: 0x2a1c0a, dens: 0.020, key: 0xffc860, amb: 0x6a4a1c },
    dark: { fog: 0x0e1210, dens: 0.020, key: 0x9fb8a4, amb: 0x1a221a },
    soil: { fog: 0x111c16, dens: 0.018, key: 0xcfe8d4, amb: 0x223026 }
  }[kind] || { fog: 0x0e1512, dens: 0.032, key: 0xcfe8d4, amb: 0x1a2820 };

  S3.scene.fog.color.setHex(night ? 0x0a1218 : tone.fog);
  S3.scene.fog.density = tone.dens;
  S3.keyLight.color.setHex(night ? 0x7a9ac0 : tone.key);
  S3.keyLight.intensity = night ? 0.65 : (kind === 'dark' ? 0.8 : 1.15);
  S3.fillLight.color.setHex(night ? 0x2a3448 : tone.amb);
  S3.fillLight.intensity = night ? 0.6 : 0.95;
  S3.frontLight.intensity = night ? 0.35 : 0.6;
}

function scene3dResize(canvas) {
  if (!S3.renderer || !S3.camera) return;
  const w = canvas.clientWidth || 800, h = canvas.clientHeight || 480;
  S3.renderer.setSize(w, h, false);
  S3.camera.aspect = w / h;
  S3.camera.updateProjectionMatrix();
}

function scene3dLoop(now) {
  if (!S3.on || !S3.ok) return;
  S3.raf = requestAnimationFrame(scene3dLoop);
  S3.t += 0.016;

  // 帧率哨兵：连续 1.5 秒低于 26fps 就自动降级（降分辨率 → 关 3D）。
  // 低端机/集显上宁可退回背景图，也不让玩家对着卡顿画面玩。
  if (!S3._checked && now) {
    if (!S3._fT) S3._fT = now;
    S3._fN++;
    const span = now - S3._fT;
    if (span > 1500) {
      const fps = S3._fN / (span / 1000);
      S3._checked = true;
      // 阈值放在 18：低于这个数才明显感到卡，且不容易在正常集显上误判
      if (fps < 18) {
        if (!S3.lowPower) {
          // 第一级：降像素比，能救回不少
          S3.lowPower = true;
          S3.renderer.setPixelRatio(1);
          if (S3.canvasEl) scene3dResize(S3.canvasEl);
        } else {
          // 第二级：彻底关掉，退回静态背景
          scene3dStop();
          const cv = document.getElementById('scene3dCanvas');
          if (cv) cv.classList.remove('on');
          const sc = document.getElementById('scene');
          if (sc) sc.classList.remove('has3d');
          S3.fpsOff = true;
        }
      }
    }
  }

  // 水面波动：直接改顶点 y，比着色器简单，面数也够少
  if (S3.kind === 'water' && S3.world) {
    const water = S3.world.children.find(c => c.userData && c.userData.wave);
    if (water && water.geometry) {
      const pos = water.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        pos.setZ(i, Math.sin(x * 0.35 + S3.t * 1.2) * 0.06 + Math.cos(y * 0.42 + S3.t * 0.9) * 0.05);
      }
      pos.needsUpdate = true;
    }
    // 水草摆动
    (S3.world.userData.weeds || []).forEach(w => {
      w.rotation.z = Math.sin(S3.t * 1.1 + w.userData.phase) * 0.12;
    });
  }
  // 镜头极缓慢的呼吸式位移——不推拉，只做微小游移，避免晕眩
  S3.camera.position.x = Math.sin(S3.t * 0.12) * 0.4;
  S3.camera.position.y = 2.2 + Math.sin(S3.t * 0.09) * 0.14;
  S3.camera.lookAt(0, 0.6, -3);

  S3.renderer.render(S3.scene, S3.camera);
}

function scene3dStart() {
  if (!S3.ok || S3.on) return;
  if (S3.fpsOff) return;          // 已判定这台机器带不动，不再尝试
  S3.on = true;
  S3._fT = 0; S3._fN = 0;
  if (!S3._checked) { /* 只在首次运行帧率检测 */ }
  scene3dLoop();
}
function scene3dStop() {
  S3.on = false;
  if (S3.raf) { cancelAnimationFrame(S3.raf); S3.raf = 0; }
}

