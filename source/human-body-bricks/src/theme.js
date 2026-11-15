// theme.js — 「主题」外观系统：界面配色 + 场景氛围一键切换
//
// 每套主题一次覆盖三层：
//   1. DOM 界面 —— 全部走 style.css 里的 CSS 变量（--bg / --panel / --teal…），
//      这里把变量写到 <html> 的内联样式上，覆盖 :root 默认值，面板/按钮/弹窗全部跟随；
//   2. 3D 场景 —— 背景、雾、地面、网格、微尘、呼吸光环的颜色，
//      以及半球光/主光/轮廓光/补光的色温与强度，换主题就是换「影棚打光」；
//   3. 浏览器 chrome —— <meta name="theme-color"> 跟随，移动端地址栏同色。
//
// 背景色用 Color.set() 就地修改而不是替换对象：视频工坊进场时保存了
// scene.background 的引用、退场时还原，就地改色能保证两者始终一致。
//
// scheme = 'dark' | 'light'：浅色主题除了换变量，还要让 style.css 里那些写死的
// 「白色玻璃叠层」翻成深色墨迹叠层，否则白底白字会糊成一片。该开关写在
// <html data-scheme> 上，影片/工坊/病理课堂的专用深色画面不受影响。
//
// 默认主题 deep 完全等于改造前的原始观感，验证脚本据此断言"不切换不变化"。

export const THEME_KEY = 'hb-theme-v1';

export const THEMES = [
  {
    id: 'deep', name: '深空蓝', hint: '默认 · 冷蓝医学风',
    swatch: ['#090e1a', '#6fd9e8', '#eadfc6'], meta: '#090e1a',
    css: {
      bg: '#090e1a', panel: 'rgba(15, 23, 38, 0.86)', panelSolid: '#101a2b',
      line: 'rgba(140, 180, 220, 0.14)', lineStrong: 'rgba(150, 200, 235, 0.28)',
      text: '#e9f0fb', muted: '#93a4c0', dim: '#6c7d99',
      teal: '#6fd9e8', tealSoft: 'rgba(111, 217, 232, 0.14)',
      rose: '#e08a7e', bone: '#eadfc6', ok: '#6fd6a8', warn: '#f0b46a',
      shadow: '0 18px 48px rgba(0, 0, 0, 0.42)',
      topbar1: 'rgba(18, 28, 46, 0.9)', topbar2: 'rgba(12, 19, 32, 0.78)',
      switchBg: 'rgba(7, 12, 21, 0.7)', btn2: 'rgba(103, 170, 220, 0.85)',
    },
    scene: {
      bg: 0x090e1a, fog: 0x090e1a, fogDensity: 0.022,
      ground: 0x0e1626, grid1: 0x1e2c44, grid2: 0x141e30, gridOpacity: 0.55,
      dust: 0x86c5e8, halo: [0x9fe3ff, 0xffb3a7, 0x8fe6c8], haloOpacity: 0.13,
      hemiSky: 0xbcd7ff, hemiGround: 0x1a2233, hemiI: 1.15,
      key: 0xfff0dc, keyI: 2.4, rim: 0x6fb7e8, rimI: 1.5, fill: 0x7fe0d0, fillI: 0.9,
    },
  },
  {
    id: 'noir', name: '墨黑银', hint: '冷灰黑 · 银白高光',
    swatch: ['#0a0b0e', '#cdd7e4', '#e8e4da'], meta: '#0a0b0e',
    css: {
      bg: '#0a0b0e', panel: 'rgba(18, 20, 26, 0.88)', panelSolid: '#14161c',
      line: 'rgba(160, 170, 185, 0.15)', lineStrong: 'rgba(190, 205, 220, 0.30)',
      text: '#eef1f5', muted: '#a2abb8', dim: '#767f8c',
      teal: '#cdd7e4', tealSoft: 'rgba(205, 215, 228, 0.12)',
      rose: '#d9a08c', bone: '#e8e4da', ok: '#8fd6b4', warn: '#e8c08a',
      shadow: '0 18px 48px rgba(0, 0, 0, 0.50)',
      topbar1: 'rgba(22, 24, 30, 0.9)', topbar2: 'rgba(15, 16, 20, 0.78)',
      switchBg: 'rgba(8, 9, 11, 0.72)', btn2: 'rgba(180, 190, 205, 0.85)',
    },
    scene: {
      bg: 0x0a0b0e, fog: 0x0a0b0e, fogDensity: 0.020,
      ground: 0x101216, grid1: 0x262a33, grid2: 0x1a1d24, gridOpacity: 0.50,
      dust: 0xa8b2c2, halo: [0xe2e8f0, 0xe8c8b4, 0xd2dce4], haloOpacity: 0.11,
      hemiSky: 0xd0d8e4, hemiGround: 0x111318, hemiI: 1.10,
      key: 0xfff4e6, keyI: 2.4, rim: 0xb4c0d0, rimI: 1.4, fill: 0xd8dee6, fillI: 0.85,
    },
  },
  {
    id: 'aurora', name: '翡翠青', hint: '薄荷绿 · 生机清亮',
    swatch: ['#061310', '#6fe8c0', '#e9e8cf'], meta: '#061310',
    css: {
      bg: '#061310', panel: 'rgba(10, 26, 22, 0.86)', panelSolid: '#0d1c17',
      line: 'rgba(120, 200, 175, 0.14)', lineStrong: 'rgba(140, 220, 190, 0.28)',
      text: '#e8f5ef', muted: '#93c0b0', dim: '#6c998c',
      teal: '#6fe8c0', tealSoft: 'rgba(111, 232, 192, 0.14)',
      rose: '#e0a87e', bone: '#e9e8cf', ok: '#6fd6a8', warn: '#f0c46a',
      shadow: '0 18px 48px rgba(0, 20, 12, 0.45)',
      topbar1: 'rgba(14, 34, 28, 0.9)', topbar2: 'rgba(8, 24, 19, 0.78)',
      switchBg: 'rgba(4, 14, 11, 0.72)', btn2: 'rgba(88, 190, 150, 0.85)',
    },
    scene: {
      bg: 0x061310, fog: 0x061310, fogDensity: 0.021,
      ground: 0x0a1a14, grid1: 0x1c3a30, grid2: 0x122820, gridOpacity: 0.55,
      dust: 0x86e0b8, halo: [0xa8ffd8, 0xffd2a4, 0x8ff0c8], haloOpacity: 0.13,
      hemiSky: 0xc8f0dc, hemiGround: 0x0c2018, hemiI: 1.15,
      key: 0xf6ffe8, keyI: 2.3, rim: 0x54d4a0, rimI: 1.5, fill: 0x7fe0c0, fillI: 0.9,
    },
  },
  {
    id: 'plum', name: '暗夜紫', hint: '紫罗兰 · 神秘雅致',
    swatch: ['#120a1e', '#c8a8ff', '#eadff0'], meta: '#120a1e',
    css: {
      bg: '#120a1e', panel: 'rgba(24, 14, 38, 0.86)', panelSolid: '#1a1028',
      line: 'rgba(180, 150, 220, 0.15)', lineStrong: 'rgba(200, 170, 240, 0.30)',
      text: '#f0e9fb', muted: '#b0a0c8', dim: '#8272a0',
      teal: '#c8a8ff', tealSoft: 'rgba(200, 168, 255, 0.14)',
      rose: '#f0a0c4', bone: '#eadff0', ok: '#8fd6b0', warn: '#f0b46a',
      shadow: '0 18px 48px rgba(10, 0, 20, 0.50)',
      topbar1: 'rgba(30, 18, 48, 0.9)', topbar2: 'rgba(21, 12, 34, 0.78)',
      switchBg: 'rgba(12, 6, 22, 0.72)', btn2: 'rgba(160, 120, 220, 0.85)',
    },
    scene: {
      bg: 0x120a1e, fog: 0x120a1e, fogDensity: 0.021,
      ground: 0x181026, grid1: 0x33244e, grid2: 0x241a3a, gridOpacity: 0.55,
      dust: 0xb49fe0, halo: [0xd8b8ff, 0xffb3d0, 0xa8d8ff], haloOpacity: 0.12,
      hemiSky: 0xe0ccff, hemiGround: 0x180e28, hemiI: 1.15,
      key: 0xfff0f8, keyI: 2.4, rim: 0x9a7fd8, rimI: 1.5, fill: 0xc09fe0, fillI: 0.9,
    },
  },
  {
    id: 'ember', name: '暖夜橙', hint: '琥珀暖光 · 夕阳余晖',
    swatch: ['#170f08', '#ecb06a', '#f0e2c8'], meta: '#170f08',
    css: {
      bg: '#170f08', panel: 'rgba(30, 20, 12, 0.86)', panelSolid: '#241810',
      line: 'rgba(220, 180, 130, 0.14)', lineStrong: 'rgba(240, 200, 150, 0.28)',
      text: '#f7efe2', muted: '#c0a890', dim: '#94806c',
      teal: '#ecb06a', tealSoft: 'rgba(236, 176, 106, 0.14)',
      rose: '#e0855e', bone: '#f0e2c8', ok: '#9bd68f', warn: '#ffd88a',
      shadow: '0 18px 48px rgba(20, 8, 0, 0.50)',
      topbar1: 'rgba(38, 26, 15, 0.9)', topbar2: 'rgba(27, 18, 10, 0.78)',
      switchBg: 'rgba(14, 9, 5, 0.72)', btn2: 'rgba(210, 130, 70, 0.85)',
    },
    scene: {
      bg: 0x170f08, fog: 0x170f08, fogDensity: 0.021,
      ground: 0x1c130a, grid1: 0x3a2a14, grid2: 0x2a1e0e, gridOpacity: 0.55,
      dust: 0xe0b884, halo: [0xffd8a8, 0xffb384, 0xe0e8a0], haloOpacity: 0.13,
      hemiSky: 0xffe0b8, hemiGround: 0x201208, hemiI: 1.10,
      key: 0xfff0dc, keyI: 2.4, rim: 0xe8a068, rimI: 1.45, fill: 0xffc890, fillI: 0.9,
    },
  },
  {
    // 浅色主题：3D 背景取「比 UI 略深一档」的浅灰蓝，象牙白骨骼/彩色肌肉才有明暗对比；
    // 纯白会糊掉颅骨，实测 #e8f0fa 经后处理后原样呈现，模型边缘依旧清楚。
    id: 'daylight', name: '晴空白', hint: '明亮日间 · 冷蓝灰', scheme: 'light',
    swatch: ['#e8f0fa', '#1a7fa8', '#b4554a'], meta: '#eef3fa',
    css: {
      bg: '#eef3fa', panel: 'rgba(255, 255, 255, 0.86)', panelSolid: '#f7fafe',
      line: 'rgba(40, 70, 110, 0.16)', lineStrong: 'rgba(40, 70, 110, 0.30)',
      text: '#1c2b3d', muted: '#50627a', dim: '#7a8ba0',
      teal: '#1a7fa8', tealSoft: 'rgba(26, 127, 168, 0.12)',
      rose: '#b4554a', bone: '#7a6038', ok: '#2e8b5b', warn: '#a86a12',
      shadow: '0 18px 48px rgba(30, 50, 80, 0.18)',
      topbar1: 'rgba(255, 255, 255, 0.94)', topbar2: 'rgba(238, 244, 252, 0.88)',
      switchBg: 'rgba(226, 236, 248, 0.85)', btn2: 'rgba(20, 110, 150, 0.85)',
      inkRgb: '40, 60, 90', surfaceRgb: '255, 255, 255',
    },
    scene: {
      bg: 0xe8f0fa, fog: 0xe8f0fa, fogDensity: 0.014,
      ground: 0xbacbdd, grid1: 0x9db3cc, grid2: 0xc6d5e6, gridOpacity: 0.55,
      dust: 0x6c86a5, halo: [0x2a8fc0, 0xd06a5a, 0x3a9a78], haloOpacity: 0.22,
      hemiSky: 0xffffff, hemiGround: 0x9aacc0, hemiI: 0.95,
      key: 0xfff8ec, keyI: 1.9, rim: 0x5b86b8, rimI: 1.2, fill: 0xbcd6ee, fillI: 0.65,
    },
  },
  {
    id: 'paper', name: '暖纸白', hint: '米白纸张 · 暖调护眼', scheme: 'light',
    swatch: ['#f2e9d8', '#a25a22', '#a8453c'], meta: '#faf5ec',
    css: {
      bg: '#faf5ec', panel: 'rgba(255, 252, 245, 0.88)', panelSolid: '#fffaf2',
      line: 'rgba(90, 66, 40, 0.16)', lineStrong: 'rgba(90, 66, 40, 0.30)',
      text: '#33291e', muted: '#6c5b47', dim: '#93826d',
      teal: '#a25a22', tealSoft: 'rgba(162, 90, 34, 0.12)',
      rose: '#a8453c', bone: '#8a6a3c', ok: '#3d7a4e', warn: '#9a6410',
      shadow: '0 18px 48px rgba(80, 60, 30, 0.18)',
      topbar1: 'rgba(255, 252, 245, 0.94)', topbar2: 'rgba(246, 238, 224, 0.88)',
      switchBg: 'rgba(238, 227, 208, 0.85)', btn2: 'rgba(160, 90, 35, 0.85)',
      inkRgb: '80, 60, 35', surfaceRgb: '255, 250, 240',
    },
    scene: {
      bg: 0xf2e9d8, fog: 0xf2e9d8, fogDensity: 0.014,
      ground: 0xd9c9ac, grid1: 0xbaa382, grid2: 0xd9c9ac, gridOpacity: 0.50,
      dust: 0x8b7355, halo: [0xb9742a, 0xb05242, 0x64803c], haloOpacity: 0.20,
      hemiSky: 0xfff6e6, hemiGround: 0xb7a384, hemiI: 0.95,
      key: 0xfff2dc, keyI: 1.9, rim: 0xb07a42, rimI: 1.2, fill: 0xe6cfa8, fillI: 0.65,
    },
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t]));

export function loadThemeId() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEME_BY_ID[v] ? v : 'deep';
  } catch { return 'deep'; }
}

export function saveThemeId(id) {
  try { localStorage.setItem(THEME_KEY, id); } catch { /* 隐私模式忽略 */ }
}

/**
 * 应用主题。hooks（由 app.js 提供）：
 *   scene / ground / dust / halos / haloMats / setHaloFull / setGrid / lights
 * 返回主题对象本身。
 */
export function applyTheme(id, hooks) {
  const t = THEME_BY_ID[id] || THEME_BY_ID.deep;
  const root = document.documentElement.style;

  // 1) 界面：CSS 变量整体换装
  const c = t.css;
  root.setProperty('--bg', c.bg);
  root.setProperty('--panel', c.panel);
  root.setProperty('--panel-solid', c.panelSolid);
  root.setProperty('--line', c.line);
  root.setProperty('--line-strong', c.lineStrong);
  root.setProperty('--text', c.text);
  root.setProperty('--muted', c.muted);
  root.setProperty('--dim', c.dim);
  root.setProperty('--teal', c.teal);
  root.setProperty('--teal-soft', c.tealSoft);
  root.setProperty('--rose', c.rose);
  root.setProperty('--bone', c.bone);
  root.setProperty('--ok', c.ok);
  root.setProperty('--warn', c.warn);
  root.setProperty('--shadow', c.shadow);
  // 顶栏 / 模式开关 / 主按钮等大色块：deep 的值与改造前硬编码色完全一致
  root.setProperty('--topbar-1', c.topbar1);
  root.setProperty('--topbar-2', c.topbar2);
  root.setProperty('--switch-bg', c.switchBg);
  root.setProperty('--btn-2', c.btn2);
  // 强调色的 RGB 分量由主题主色自动推导，供 rgba(var(--accent-rgb), a) 使用
  const rgb = hex => {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  };
  root.setProperty('--accent-rgb', rgb(c.teal));
  root.setProperty('--rose-rgb', rgb(c.rose));
  // 浅色主题专用：墨迹色 / 纸面色，供 style.css 的 data-scheme="light" 覆盖块使用
  root.setProperty('--ink-rgb', c.inkRgb || '255, 255, 255');
  root.setProperty('--surface-rgb', c.surfaceRgb || '255, 255, 255');
  document.documentElement.dataset.scheme = t.scheme || 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.meta);

  // 2) 场景：背景就地改色（保住工坊保存/恢复的引用），雾色、地面、网格、微尘、光环
  const s = t.scene;
  // 视频工坊进场会把 scene.background 换成自己的影棚色（一个独立 Color 对象）。
  // 这时候不要用主题色覆盖工坊画面；退场由 studio.js 的 getThemeBg 补上当前主题色。
  const ownsBg = !!(hooks.ownsBackground && hooks.ownsBackground());
  if (!ownsBg) {
    hooks.scene.background.set(s.bg);
    if (hooks.scene.fog) hooks.scene.fog.color.set(s.fog);
  }
  // 工坊/影片期间背景与雾色由它们自己掌管，密度仍跟随主题，退场再整体回填
  if (hooks.scene.fog) hooks.scene.fog.density = s.fogDensity;
  hooks.ground.material.color.set(s.ground);
  hooks.setGrid(s.grid1, s.grid2, s.gridOpacity);
  hooks.dust.material.color.set(s.dust);
  hooks.halos.forEach((h, i) => h.mesh.material.color.set(s.halo[i % s.halo.length]));
  hooks.setHaloFull(s.haloOpacity);   // 影片/工坊隐藏光环时不会立即生效，退场恢复时用新值

  // 3) 影棚打光：同一副身体，不同色温就是不同气质
  const L = hooks.lights;
  L.hemi.color.set(s.hemiSky);
  L.hemi.groundColor.set(s.hemiGround);
  L.hemi.intensity = s.hemiI;
  L.key.color.set(s.key);
  L.key.intensity = s.keyI;
  L.rim.color.set(s.rim);
  L.rim.intensity = s.rimI;
  L.fill.color.set(s.fill);
  L.fill.intensity = s.fillI;

  return t;
}
