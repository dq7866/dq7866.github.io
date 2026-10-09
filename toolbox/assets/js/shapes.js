/* 公共形状库：返回 0..1 单位框内的多边形点集（供图片形状裁剪 / 视频形状遮罩共用） */
(function () {
  "use strict";
  const poly = (n, rot) => { const p = []; rot = rot == null ? -Math.PI / 2 : rot; for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; p.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]); } return p; };
  const starPts = (n, inner) => { const p = []; n = Math.max(3, Math.min(20, n || 5)); inner = Math.max(0.05, Math.min(0.95, inner == null ? 0.42 : inner)); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2; const r = i % 2 ? inner : 0.5; p.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]); } return p; };
  const arcInto = (p, r, n, cx, cy, a0, a1) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };

  const defs = {
    rect: () => [[0, 0], [1, 0], [1, 1], [0, 1]],
    roundRect: (p) => {
      const r = Math.max(0, Math.min(0.5, ((p && p.radius != null) ? p.radius : 22) / 100));
      if (r <= 0.001) return [[0, 0], [1, 0], [1, 1], [0, 1]];
      const n = 7, pts = [];
      arcInto(pts, r, n, 1 - r, 1 - r, 0, Math.PI / 2);
      arcInto(pts, r, n, r, 1 - r, Math.PI / 2, Math.PI);
      arcInto(pts, r, n, r, r, Math.PI, Math.PI * 1.5);
      arcInto(pts, r, n, 1 - r, r, Math.PI * 1.5, Math.PI * 2);
      return pts;
    },
    ellipse: () => { const p = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; p.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]); } return p; },
    triangle: () => [[0.5, 0], [1, 1], [0, 1]],
    diamond: () => [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
    pentagon: () => poly(5),
    hexagon: () => poly(6),
    star: (p) => starPts((p && p.points) || 5, ((p && p.inner != null) ? p.inner : 42) / 100),
    heart: () => { const p = []; for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2; const x = 16 * Math.pow(Math.sin(t), 3); const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); p.push([0.5 + x / 36, 0.5 - y / 34]); } return p; },
    arrow: () => [[0, 0.3], [0.6, 0.3], [0.6, 0.05], [1, 0.5], [0.6, 0.95], [0.6, 0.7], [0, 0.7]],
    bubble: () => { const r = 0.14, H = 0.78, n = 6, p = []; arcInto(p, r, n, r, r, Math.PI, Math.PI * 1.5); arcInto(p, r, n, 1 - r, r, Math.PI * 1.5, Math.PI * 2); arcInto(p, r, n, 1 - r, H - r, 0, Math.PI / 2); p.push([0.42, H], [0.24, H], [0.16, 0.99], [0.28, H]); arcInto(p, r, n, r, H - r, Math.PI / 2, Math.PI); return p; },
    cross: () => [[0.36, 0], [0.64, 0], [0.64, 0.36], [1, 0.36], [1, 0.64], [0.64, 0.64], [0.64, 1], [0.36, 1], [0.36, 0.64], [0, 0.64], [0, 0.36], [0.36, 0.36]],
  };
  const names = { rect: "矩形", roundRect: "圆角矩形", ellipse: "圆形", triangle: "三角形", diamond: "菱形", pentagon: "五边形", hexagon: "六边形", star: "星形", heart: "心形", arrow: "箭头", bubble: "对话气泡", cross: "十字", free: "自由绘制" };
  // 形状是否有可调参数
  const paramsOf = (type) => (type === "roundRect" ? ["radius"] : type === "star" ? ["points", "inner"] : []);

  window.TBX_SHAPES = { defs, names, poly, starPts, paramsOf };
})();
