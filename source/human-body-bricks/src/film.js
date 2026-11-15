// film.js — 纪录影片模式（Cinematic Tour）
//
// 把「人体完整结构」按分镜拍成一段约 66 秒的影片：
//   · 镜头：每个分镜有起止机位（方位角 / 俯仰 / 距离 / 注视高度 / 焦距），
//           用缓动插值驱动 OrbitCam 的目标值，运动像轨道车而不是弹簧
//   · 图层：皮肤 → 骨骼 → 肌肉 → 器官，逐层溶接，外层永远留一点透明度，
//           这样「透过皮肤看见骨架」的内透感一直在
//   · 镜头语言：景深对焦在注视点上、推镜时加径向拉丝、高光拉出宽银幕光条、
//           转场用闪白，上下黑边 + 左下字幕 + 章节进度
//
// 影片只接管相机与图层透明度，不改动任何形状数据，退出时完整还原现场。

const clamp01 = v => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

const easeInOut = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const linear = t => t;

function pickEase(name) {
  return name === 'out' ? easeOut : name === 'in' ? easeIn : name === 'linear' ? linear : easeInOut;
}

// —— 分镜表 ——
// cam.a / cam.b：起止机位。y 是「注视点高度」，单位是米（真实人体解剖高度），
//                按 bodyMeta.scale 换算成世界单位，换模型也不用改。
// lay：该镜头结束时的图层目标不透明度。
// look：这一镜的调色（曝光 / 光晕 / 饱和 / 暗角 / 颗粒 / 暗部染色 / 亮部染色）。
// lens：aperture 景深强度，range 清晰区跨度（世界单位），streak 宽银幕光条。
// 关键实测高度（当前模型 scale≈4.35）：头顶 1.77、颅 1.61、胸/心 1.29、
// 肝 1.15、胃 1.18、身心中点 0.95。
const SHOTS = [
  {
    id: 'open', dur: 7.0, ease: 'out',
    cam: { a: { th: -1.05, ph: 1.30, d: 19.5, y: 0.88, fov: 34 },
           b: { th: -0.55, ph: 1.22, d: 15.0, y: 0.95, fov: 36 } },
    lay: { daily: 1, skeleton: 0, muscle: 0, organ: 0 },
    look: { exposure: 0.98, bloom: 1.05, sat: 0.96, vignette: 0.62, grain: 0.03,
            shadow: [0.016, 0.020, 0.045], highlight: [0.03, 0.025, 0.02] },
    lens: { aperture: 0.55, range: 5.5, streak: 0.10 },
    halo: 1,
    cap: ['00', '人体', 'The human body · full structure'],
  },
  {
    id: 'skin', dur: 8.5,
    cam: { a: { th: -0.55, ph: 1.22, d: 15.0, y: 0.95, fov: 36 },
           b: { th: -0.12, ph: 1.30, d: 8.8, y: 1.00, fov: 40 } },
    lay: { daily: 1, skeleton: 0, muscle: 0, organ: 0 },
    look: { exposure: 1.04, bloom: 0.95, sat: 1.0, vignette: 0.58, grain: 0.028,
            shadow: [0.030, 0.026, 0.040], highlight: [0.05, 0.035, 0.024] },
    lens: { aperture: 0.85, range: 2.6, streak: 0.14 },
    halo: 1,
    cap: ['01', '皮肤', 'Skin · 身体的边界与第一道防线'],
  },
  {
    id: 'bone', dur: 9.5,
    cam: { a: { th: -0.12, ph: 1.26, d: 8.8, y: 1.15, fov: 40 },
           b: { th: 0.30, ph: 1.42, d: 4.8, y: 1.30, fov: 42 } },
    lay: { daily: 0.06, skeleton: 1, muscle: 0.04, organ: 0.05 },
    look: { exposure: 1.02, bloom: 1.25, sat: 0.88, vignette: 0.62, grain: 0.032,
            shadow: [0.014, 0.026, 0.062], highlight: [0.05, 0.048, 0.036] },
    lens: { aperture: 1.0, range: 1.7, streak: 0.22 },
    halo: 0.5,
    cap: ['02', '骨骼', 'Skeleton · 206 块骨头撑起身体'],
  },
  {
    id: 'ribs', dur: 6.5, cut: true,
    cam: { a: { th: 0.62, ph: 1.50, d: 3.4, y: 1.31, fov: 44 },
           b: { th: 0.96, ph: 1.46, d: 3.0, y: 1.29, fov: 44 } },
    lay: { daily: 0, skeleton: 1, muscle: 0, organ: 0.10 },
    look: { exposure: 1.06, bloom: 1.45, sat: 0.82, vignette: 0.68, grain: 0.036,
            shadow: [0.010, 0.022, 0.058], highlight: [0.06, 0.06, 0.05] },
    lens: { aperture: 1.15, range: 1.1, streak: 0.3 },
    halo: 0.12,
    cap: ['03', '胸腔', 'Thorax · 肋骨围出的呼吸风箱'],
  },
  {
    id: 'muscle', dur: 9.0, cut: true,
    cam: { a: { th: -0.95, ph: 1.24, d: 9.4, y: 1.10, fov: 38 },
           b: { th: -0.25, ph: 1.18, d: 7.6, y: 1.14, fov: 38 } },
    lay: { daily: 0, skeleton: 0.16, muscle: 1, organ: 0.08 },
    look: { exposure: 1.05, bloom: 1.15, sat: 1.02, vignette: 0.56, grain: 0.028,
            shadow: [0.045, 0.020, 0.018], highlight: [0.06, 0.030, 0.020] },
    lens: { aperture: 0.8, range: 3.0, streak: 0.16 },
    halo: 0.5,
    cap: ['04', '肌肉', 'Musculature · 600 余块肌肉带动每一次动作'],
  },
  {
    id: 'organ', dur: 9.0,
    cam: { a: { th: -0.25, ph: 1.18, d: 7.6, y: 1.14, fov: 38 },
           b: { th: 0.35, ph: 1.36, d: 4.6, y: 1.18, fov: 42 } },
    lay: { daily: 0, skeleton: 0.10, muscle: 0.10, organ: 1 },
    look: { exposure: 1.02, bloom: 1.55, sat: 1.08, vignette: 0.6, grain: 0.03,
            shadow: [0.038, 0.018, 0.036], highlight: [0.055, 0.028, 0.030] },
    lens: { aperture: 1.05, range: 1.6, streak: 0.26 },
    halo: 0.25,
    cap: ['05', '内脏', 'Viscera · 胸腔与腹腔里的九个系统'],
  },
  {
    id: 'heart', dur: 7.0, cut: true,
    cam: { a: { th: 0.30, ph: 1.44, d: 2.9, y: 1.30, fov: 46 },
           b: { th: 0.52, ph: 1.40, d: 2.5, y: 1.29, fov: 46 } },
    lay: { daily: 0, skeleton: 0.08, muscle: 0.06, organ: 1 },
    look: { exposure: 1.0, bloom: 1.85, sat: 1.16, vignette: 0.7, grain: 0.032,
            shadow: [0.040, 0.014, 0.030], highlight: [0.075, 0.030, 0.026] },
    lens: { aperture: 1.25, range: 0.85, streak: 0.4 },
    halo: 0.1,
    cap: ['06', '心脏', 'Heart · 一天跳十万次，从不停工'],
  },
  {
    id: 'full', dur: 13.0, cut: true,
    cam: { a: { th: -1.35, ph: 1.10, d: 12.5, y: 0.92, fov: 36 },
           b: { th: -0.30, ph: 1.16, d: 14.6, y: 0.95, fov: 34 } },
    lay: { daily: 0, skeleton: 0.46, muscle: 0.52, organ: 0.66 },
    look: { exposure: 1.03, bloom: 1.35, sat: 1.04, vignette: 0.58, grain: 0.028,
            shadow: [0.020, 0.026, 0.056], highlight: [0.04, 0.036, 0.03] },
    lens: { aperture: 0.6, range: 6.0, streak: 0.2 },
    halo: 1,
    cap: ['07', '合体', 'All lay—— 三层同框，就是完整的人'],
  },
];

export function createFilm(hooks) {
  const { camera, cam, postfx } = hooks;

  const $ = id => document.getElementById(id);
  const el = {
    ui: $('filmUI'), title: $('filmTitle'), cap: $('filmCap'),
    idx: $('filmCapIdx'), zh: $('filmCapZh'), en: $('filmCapEn'),
    prog: $('filmProg'), chapter: $('filmChapter'),
    play: $('filmPlay'), next: $('filmNext'), exit: $('filmExit'),
  };

  // 累计时间轴
  let acc = 0;
  for (const s of SHOTS) { s.start = acc; acc += s.dur; }
  const TOTAL = acc;

  const st = {
    on: false,
    playing: false,
    t: 0,
    shot: -1,
    flash: 0,
    snap: null,          // 启动前的现场快照
  };

  const layers = { daily: 0, skeleton: 0, muscle: 0, organ: 0 };
  const wrote = { daily: -1, skeleton: -1, muscle: -1, organ: -1 };
  const look = {
    exposure: 1, bloom: 1, sat: 1, vignette: 0.5, grain: 0.028,
    shadow: [0, 0, 0], highlight: [0, 0, 0],
  };
  let lensCur = { aperture: 0, range: 3, streak: 0 };
  let haloCur = 1;
  let zoomCur = 0;
  let fovCur = 36;
  let lastDist = 0;
  let capKey = '';

  function meta() {
    const m = hooks.meta();
    return { s: m.scale || 1 };
  }
  // 注视点高度：米 → 世界单位
  const Y = meters => meters * meta().s;

  /* ---------------- 图层 ---------------- */
  function pushLayers(dt) {
    const k = 1 - Math.exp(-dt / 0.55);
    for (const name of Object.keys(layers)) {
      const v = layers[name];
      if (Math.abs(v - wrote[name]) > 0.002) {
        hooks.setLayer(name, v);
        wrote[name] = v;
      }
    }
  }

  /* ---------------- 调色 ---------------- */
  function pushLook(dt) {
    const g = postfx.grade;
    const k = Math.min(1, dt * 2.6);
    g.exposure = lerp(g.exposure, look.exposure, k);
    g.bloom = lerp(g.bloom, look.bloom, k);
    g.sat = lerp(g.sat, look.sat, k);
    g.vignette = lerp(g.vignette, look.vignette, k);
    g.grain = lerp(g.grain, look.grain, k);
    for (let i = 0; i < 3; i++) {
      g.shadowTint.setComponent(i, lerp(g.shadowTint.getComponent(i), look.shadow[i], k));
      g.highlightTint.setComponent(i, lerp(g.highlightTint.getComponent(i), look.highlight[i], k));
    }
  }

  /* ---------------- 字幕 ---------------- */
  function setCaption(shot, p, tIn) {
    if (!el.cap) return;
    const key = shot.id;
    const first = key !== capKey;
    if (first) {
      capKey = key;
      if (el.idx) el.idx.textContent = shot.cap[0];
      if (el.zh) el.zh.textContent = shot.cap[1];
      if (el.en) el.en.textContent = shot.cap[2];
    }
    // 入场 0.5s 淡入、离场前 0.6s 淡出
    const fadeIn = Math.min(1, tIn / 0.55);
    const fadeOut = Math.min(1, (1 - p) * shot.dur / 0.7);
    const a = clamp01(Math.min(fadeIn, fadeOut));
    el.cap.style.opacity = a.toFixed(3);
    el.cap.style.transform = `translateY(${((1 - fadeIn) * 14).toFixed(1)}px)`;
  }

  function setChapter(i) {
    if (el.chapter) el.chapter.textContent = `${String(i).padStart(2, '0')} / ${String(SHOTS.length).padStart(2, '0')}`;
  }

  /* ---------------- 相机 ---------------- */
  function applyCam(shot, p) {
    const e = pickEase(shot.ease)(p);
    const a = shot.cam.a, b = shot.cam.b;
    const th = lerp(a.th, b.th, e);
    const ph = lerp(a.ph, b.ph, e);
    const d = lerp(a.d, b.d, e);
    const y = lerp(a.y, b.y, e);
    const fov = lerp(a.fov ?? 38, b.fov ?? 38, e);

    cam.theta = cam._thetaG = th;
    cam.phi = cam._phiG = ph;
    cam.dist = cam._distG = d;
    cam._targetGoal.set(0, Y(y), 0);
    cam.target.set(0, Y(y), 0);

    if (Math.abs(fov - fovCur) > 0.01) {
      fovCur = fov;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return { d, shot };
  }

  /* ---------------- 主循环 ---------------- */
  function update(dt) {
    if (!st.on) return;

    if (st.playing) st.t = Math.min(TOTAL + 0.001, st.t + dt);
    const t = st.t;

    // 定位当前分镜
    let idx = SHOTS.length - 1;
    for (let i = 0; i < SHOTS.length; i++) {
      if (t < SHOTS[i].start + SHOTS[i].dur) { idx = i; break; }
    }
    const shot = SHOTS[idx];
    const tIn = t - shot.start;
    const p = clamp01(tIn / shot.dur);

    // 切镜：硬切 + 闪白
    if (idx !== st.shot) {
      const prev = st.shot;
      st.shot = idx;
      setChapter(idx + 1);
      capKey = '';
      if (prev >= 0 && (shot.cut || SHOTS[prev].cut)) st.flash = 0.28;
      if (shot.cut) {
        // 硬切必须一次到位，否则会看到一段「飞过去」的过程
        cam.theta = cam._thetaG = shot.cam.a.th;
        cam.phi = cam._phiG = shot.cam.a.ph;
        cam.dist = cam._distG = shot.cam.a.d;
      }
    }
    st.flash = Math.max(0, st.flash - dt * 1.9);

    const camState = applyCam(shot, p);

    // 图层：向目标溶接
    const k = 1 - Math.exp(-dt / 0.55);
    for (const name of Object.keys(layers)) {
      const target = shot.lay[name] ?? 0;
      layers[name] += (target - layers[name]) * k;
    }
    pushLayers(dt);

    // 调色
    look.exposure = shot.look.exposure;
    look.bloom = shot.look.bloom;
    look.sat = shot.look.sat;
    look.vignette = shot.look.vignette;
    look.grain = shot.look.grain;
    look.shadow = shot.look.shadow;
    look.highlight = shot.look.highlight;
    pushLook(dt);

    // 镜头语言：对焦永远落在注视点上；推镜速度决定径向拉丝
    const speed = Math.abs(camState.d - lastDist) / Math.max(dt, 1e-4);
    lastDist = camState.d;
    zoomCur += (Math.min(0.32, speed * 0.045) - zoomCur) * Math.min(1, dt * 4);

    const L = shot.lens;
    lensCur.aperture += (L.aperture - lensCur.aperture) * Math.min(1, dt * 2.2);
    lensCur.range += (L.range - lensCur.range) * Math.min(1, dt * 2.2);
    lensCur.streak += (L.streak - lensCur.streak) * Math.min(1, dt * 2.2);
    haloCur += ((shot.halo ?? 1) - haloCur) * Math.min(1, dt * 2.2);
    if (hooks.setHalo) hooks.setHalo(haloCur);

    if (postfx.lens) {
      const ln = postfx.lens;
      ln.on = true;
      ln.focus = camState.d;
      ln.range = lensCur.range;
      ln.aperture = lensCur.aperture;
      ln.zoom = zoomCur;
      ln.streak = lensCur.streak;
      ln.flash = st.flash;
    }

    // 字幕 / 进度 / 标题卡
    setCaption(shot, p, tIn);
    if (el.prog) el.prog.style.width = `${(t / TOTAL * 100).toFixed(2)}%`;
    if (el.title) {
      const ta = idx === 0 ? clamp01(1 - Math.max(0, tIn - 3.2) / 1.6) : 0;
      el.title.style.opacity = ta.toFixed(3);
    }

    // 放完自动收尾
    if (st.t >= TOTAL) finish();
  }

  // 手持微抖 + 极轻微侧滚：必须放在 cam.update 之后，否则被机位覆盖
  function post() {
    if (!st.on) return;
    const t = st.t;
    const sh = 0.006;
    camera.position.x += Math.sin(t * 2.1) * sh;
    camera.position.y += Math.sin(t * 2.7 + 1.3) * sh * 0.8;
    camera.rotateZ(Math.sin(t * 0.9 + 0.4) * 0.0016);
  }

  /* ---------------- 生命周期 ---------------- */
  function start() {
    if (st.on) return;
    st.on = true;
    st.playing = true;
    st.t = 0;
    st.shot = -1;
    st.flash = 0.55;          // 开场从白场淡入
    capKey = '';
    layers.daily = 1; layers.skeleton = 0; layers.muscle = 0; layers.organ = 0;
    Object.keys(wrote).forEach(k => { wrote[k] = -1; });
    fovCur = camera.fov;
    lastDist = cam.dist;
    zoomCur = 0;

    st.snap = {
      system: hooks.getSystem(),
      physio: hooks.getPhysio(),
      theta: cam.theta, phi: cam.phi, dist: cam.dist,
      target: cam.target.clone(),
      fov: camera.fov,
    };

    hooks.onStart();

    for (const name of Object.keys(layers)) hooks.setLayer(name, name === 'daily' ? 1 : 0);

    document.getElementById('app')?.classList.add('filming');
    if (el.ui) el.ui.classList.add('on');
    if (el.title) el.title.style.opacity = '1';
    if (el.play) el.play.textContent = '暂停';
    cam.enabled = false;
    postfx.setEnabled(true);
    if (postfx.lens) { postfx.lens.on = true; postfx.lens.flash = 0.5; }
  }

  function finish() {
    if (!st.on) return;
    st.playing = false;
    stop();
  }

  function stop() {
    if (!st.on) return;
    st.on = false;
    cam.enabled = true;
    document.getElementById('app')?.classList.remove('filming');
    if (el.ui) el.ui.classList.remove('on');
    if (postfx.lens) {
      postfx.lens.on = false;
      postfx.lens.aperture = 0;
      postfx.lens.zoom = 0;
      postfx.lens.streak = 0;
      postfx.lens.flash = 0;
    }
    postfx.setEnabled(false);   // 回到常规视图，关掉后处理省性能
    camera.fov = 38;
    camera.updateProjectionMatrix();
    hooks.onEnd(st.snap);
    st.snap = null;
  }

  function togglePlay() {
    if (!st.on) return;
    st.playing = !st.playing;
    if (el.play) el.play.textContent = st.playing ? '暂停' : '播放';
  }

  function nextChapter() {
    if (!st.on) return;
    const i = Math.min(SHOTS.length - 1, (st.shot < 0 ? 0 : st.shot) + 1);
    st.t = SHOTS[i].start + 0.001;
    st.playing = true;
    if (el.play) el.play.textContent = '暂停';
  }

  // 控制条
  el.play?.addEventListener('click', togglePlay);
  el.next?.addEventListener('click', nextChapter);
  el.exit?.addEventListener('click', stop);

  window.addEventListener('keydown', e => {
    if (!st.on) return;
    if (e.key === 'Escape') { stop(); }
    else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') { nextChapter(); }
  });

  return {
    start, stop, update, post, togglePlay, nextChapter,
    get active() { return st.on; },
    get state() { return st; },
    shots: SHOTS,
    total: TOTAL,
  };
}
