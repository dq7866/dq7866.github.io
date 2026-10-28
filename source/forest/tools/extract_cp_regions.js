/* 从涂色页 webp 提取「可涂色的闭合区域」。
   算法：白色掩码 → 形态学闭运算 → 4 邻域连通块 → 逐块「裂纹追踪」(crack following)
        得到像素级精确的外轮廓 + 孔洞轮廓 → Douglas-Peucker 简化 → 0..100 坐标

   为什么改成裂纹追踪：
     之前的 Moore 追踪沿「边界像素中心」走，轮廓比真实区域小半像素到一像素，
     于是运行时不得不用「描边外扩 3px」来补 —— 外扩会溢出到相邻区域，
     造成「填色糊到隔壁区域 / 小区域被覆盖」。
     裂纹追踪沿像素「缝隙」走，得到的是真实区域的精确边界：
       · 相邻区域边界完全重合，不会互相覆盖
       · 填充色能严丝合缝铺满整个闭合区域

   输出：assets/dgbg/coloring/cp-regions.json 与 cp-regions.js
     区域格式：{ pct, n, pts:[[x,y]...], hp:[[[x,y]...], ...] }
       pct = 面积占比(%)，n = 顶点数，pts = 外轮廓，hp = 孔洞轮廓（可为空）
     index 0 固定是「纸面」(bg:1)，它没有轮廓（纸面由「整张矩形 − 所有主体块」得到）

   用法：node tools/extract_cp_regions.js */
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DIR = path.resolve(__dirname, '../assets/dgbg/coloring');

/* 区域过滤阈值：
   之前 0.15% 会把猫眼睛、胡须这类小块整块丢掉 —— 用户点那里只能填到大身体，
   表现为「小区域被跳过」。现在放宽到 0.02%，同时用「最小像素数 + 最小厚度」过滤噪点。 */
const MIN_PCT = 0.0002;      /* 0.02% */
const MIN_PIXELS = 40;       /* 至少 40 个像素 */
const MIN_THICK = 3;         /* 包围盒最短边至少 3px，避免抗锯齿碎点 */

const EXTRACT = async (b64) => {
  /* ⚠ 这个函数会被序列化到浏览器里执行，不能引用外部变量 —— 阈值必须写死在这里 */
  const MIN_PCT = 0.0002;      /* 0.02% */
  const MIN_PIXELS = 40;       /* 至少 40 个像素 */
  const MIN_THICK = 3;         /* 包围盒最短边至少 3px，避免抗锯齿碎点 */
  const img = new Image();
  img.src = 'data:image/webp;base64,' + b64;
  await img.decode();
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, W, H).data;

  /* 白色掩码：涂色页是白底黑线，闭合块内部为白 */
  const raw = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    raw[i] = ((px[o] + px[o + 1] + px[o + 2]) / 3) > 225 ? 1 : 0;
  }

  /* 形态学闭运算（对线条：膨胀 → 腐蚀）—— 补上 AI 线稿里的小断口。
     没有这一步，人物的皮肤、花瓣等会因描边断口而与纸面连通，
     点纸面上色时会把主体一起糊掉。 */
  const line = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) line[i] = raw[i] ? 0 : 1;
  const dil = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (line[ny * W + nx]) { v = 1; break; }
    }
    dil[y * W + x] = v;
  }
  const white = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 1;
    for (let dy = -1; dy <= 1 && v; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!dil[ny * W + nx]) { v = 0; break; }
    }
    white[y * W + x] = v ? 0 : 1;   /* 白 = 未被线条覆盖 */
  }

  /* 连通块（4 邻域 BFS） */
  const lab = new Int32Array(W * H).fill(-1);
  const q = new Int32Array(W * H);
  const members = [];
  let nl = 0;
  for (let s = 0; s < W * H; s++) {
    if (!white[s] || lab[s] >= 0) continue;
    let head = 0, tail = 0;
    q[tail++] = s; lab[s] = nl;
    const mem = [];
    while (head < tail) {
      const p = q[head++]; mem.push(p);
      const x = p % W, y = (p / W) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const n of nb) if (n >= 0 && white[n] && lab[n] < 0) { lab[n] = nl; q[tail++] = n; }
    }
    members.push(mem); nl++;
  }

  const DBG = [];
  const total = W * H;
  {
    let wp = 0; for (let i = 0; i < white.length; i++) wp += white[i];
    DBG.push('尺寸 ' + W + '×' + H + '  白占比 ' + (wp / total * 100).toFixed(1) + '%  连通块 ' + nl);
  }

  /* ---------- 裂纹追踪（crack following） ----------
     像素 (x,y) 占据方格 [x,x+1]×[y,y+1]；区域边界沿方格缝隙。
     对区域内的每个像素，若邻居不在区域内，就产生一条「边界边」。
     边方向约定：区域内部始终在行进方向的右手边。
       上边 (邻居在上) : (x,y)   → (x+1,y)
       右边 (邻居在右) : (x+1,y) → (x+1,y+1)
       下边 (邻居在下) : (x+1,y+1) → (x,y+1)
       左边 (邻居在左) : (x,y+1) → (x,y)
     由此外轮廓是顺时针（屏幕坐标），孔洞是逆时针 —— 用有向面积的正负即可区分。 */
  function traceCracks(mem) {
    const inR = new Set(mem);
    const has = (x, y) => x >= 0 && y >= 0 && x < W && y < H && inR.has(y * W + x);
    /* 顶点 → 出边列表 */
    const out = new Map();
    const key = (x, y) => x + ',' + y;
    const addEdge = (x0, y0, x1, y1) => {
      const k = key(x0, y0);
      let a = out.get(k);
      if (!a) { a = []; out.set(k, a); }
      a.push([x1, y1]);
    };
    for (const p of mem) {
      const x = p % W, y = (p / W) | 0;
      if (!has(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!has(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!has(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!has(x - 1, y)) addEdge(x, y + 1, x, y);
    }
    /* 把出边用掉（used 计数：鞍点处同一条边可能被两条环路共用） */
    const used = new Map();
    const take = (k) => {
      const a = out.get(k);
      if (!a) return null;
      for (let i = 0; i < a.length; i++) {
        const uk = k + '#' + i;
        const u = used.get(uk) || 0;
        if (u === 0) { used.set(uk, 1); return a[i]; }
      }
      return null;
    };
    /* 方向优先级：右转 > 直行 > 左转 > 掉头
       （屏幕坐标 y 向下：cross>0 表示视觉上的右转） */
    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const pick = (vx, vy, dx, dy) => {
      const k = key(vx, vy);
      const cand = out.get(k);
      if (!cand || !cand.length) return null;
      let best = null, bestScore = -1e9;
      for (let i = 0; i < cand.length; i++) {
        const uk = k + '#' + i;
        if ((used.get(uk) || 0) > 0) continue;
        const ex = cand[i][0] - vx, ey = cand[i][1] - vy;
        const cross = dx * ey - dy * ex;
        /* 右转(cross>0) 优先，其次直行(cross==0 且同向)，再左转，最后掉头 */
        let score;
        if (cross > 0) score = 3;
        else if (cross === 0 && (ex * dx + ey * dy) > 0) score = 2;
        else if (cross < 0) score = 1;
        else score = 0;
        if (score > bestScore) { bestScore = score; best = { i, ex, ey }; }
      }
      if (!best) return null;
      used.set(k + '#' + best.i, (used.get(k + '#' + best.i) || 0) + 1);
      return [cand[best.i][0], cand[best.i][1]];
    };
    /* 串联所有环路 */
    const loops = [];
    for (const [k, arr] of out) {
      for (let i = 0; i < arr.length; i++) {
        const uk = k + '#' + i;
        if ((used.get(uk) || 0) > 0) continue;
        /* 从这条边出发 */
        let vx = +k.split(',')[0], vy = +k.split(',')[1];
        let ex = arr[i][0], ey = arr[i][1];
        const loop = [[vx, vy]];
        let dx = ex - vx, dy = ey - vy;
        used.set(uk, (used.get(uk) || 0) + 1);
        vx = ex; vy = ey;
        let guard = 0;
        const lim = mem.length * 4 + 64;
        while (guard++ < lim) {
          loop.push([vx, vy]);
          if (vx === +k.split(',')[0] && vy === +k.split(',')[1]) break;
          const nxt = pick(vx, vy, dx, dy);
          if (!nxt) break;
          dx = nxt[0] - vx; dy = nxt[1] - vy;
          vx = nxt[0]; vy = nxt[1];
        }
        if (loop.length >= 4) loops.push(loop);
      }
    }
    return loops;
  }

  function signedArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += (pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]);
    }
    return a / 2;
  }

  /* Douglas-Peucker 简化 */
  function dp(pts, eps) {
    if (pts.length < 3) return pts;
    let mi = 0, md = 0;
    const a = pts[0], z = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = z[0] - a[0], dy = z[1] - a[1], dd = dx * dx + dy * dy;
      let d;
      if (dd === 0) d = Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1]);
      else {
        let t = ((pts[i][0] - a[0]) * dx + (pts[i][1] - a[1]) * dy) / dd;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(pts[i][0] - (a[0] + t * dx), pts[i][1] - (a[1] + t * dy));
      }
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) {
      const l = dp(pts.slice(0, mi + 1), eps), r = dp(pts.slice(mi), eps);
      return l.slice(0, -1).concat(r);
    }
    return [a, z];
  }

  const regions = [];
  let bgPct = 0, bgN = 0;
  const stats = { regions: 0, holes: 0, pts: 0, dropped: 0, thin: 0 };
  const compMask = new Uint8Array(W * H);

  for (let mi = 0; mi < members.length; mi++) {
    const mem = members[mi];
    const frac = mem.length / total;
    if (frac < MIN_PCT || mem.length < MIN_PIXELS) { stats.dropped++; continue; }

    /* 包围盒（过滤碎点） */
    let bx0 = W, by0 = H, bx1 = -1, by1 = -1, touchesEdge = false;
    for (const p of mem) {
      const x = p % W, y = (p / W) | 0;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesEdge = true;
    }
    if (Math.min(bx1 - bx0, by1 - by0) < MIN_THICK) { stats.dropped++; continue; }

    /* 厚度校验：腐蚀 1px（3x3 最小值）后还剩得下东西吗？
       剩不下 = 这是一根「线」或「缝隙」而不是一个可涂的块 → 丢掉。
       这一步滤掉抗锯齿产生的细碎白条（否则会变成一堆点不中的碎片）。 */
    compMask.fill(0);
    for (const p of mem) compMask[p] = 1;
    let core = 0;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      if (!compMask[y * W + x]) continue;
      let ok = 1;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !compMask[ny * W + nx]) { ok = 0; break; }
      }
      if (ok) core++;
    }
    if (core < 4) { stats.thin++; continue; }

    /* 纸面：连到图像边缘的白区（涂色页的边角一定是纸面） */
    if (touchesEdge) { bgPct += frac; bgN++; continue; }

    const loops = traceCracks(mem);
    if (!loops.length) { stats.dropped++; continue; }
    /* 外轮廓 = 有向面积最大的环；其余（负面积）是孔洞 */
    let outer = null, outerA = 0;
    const holes = [];
    loops.forEach(lp => {
      const a = signedArea(lp);
      if (Math.abs(a) > Math.abs(outerA)) { outerA = a; outer = lp; }
    });
    loops.forEach(lp => {
      if (lp === outer) return;
      const a = signedArea(lp);
      if (a < 0) holes.push(lp);   /* 负面积 = 孔洞 */
    });

    /* 简化 + 坐标精度（体积与精度的平衡点）
       ⚠ eps 是原图像素单位：轮廓沿「像素缝隙」走，本身就精确到像素，
         简化只是为了压缩点数。eps=1.2px 在 768px 图上约 0.16 坐标单位，
         映射到画布 640px 宽时误差 < 1.3px —— 肉眼无感，体积却小一半。
       坐标保留 2 位小数（0.01 单位 = 原图 0.077px），足够精确。 */
    const to100 = (pts) => pts.map(p => [
      Math.round(p[0] / W * 10000) / 100,
      Math.round(p[1] / H * 10000) / 100
    ]);
    const eps = frac > 0.05 ? 1.6 : (frac > 0.005 ? 1.2 : 0.9);
    const outPts = to100(dp(outer, eps));
    const holePts = holes.map(h => to100(dp(h, eps))).filter(h => h.length >= 3);
    if (outPts.length < 3) { stats.dropped++; continue; }

    regions.push({
      pct: Math.round(frac * 10000) / 100,
      n: outPts.length,
      pts: outPts,
      hp: holePts.length ? holePts : undefined
    });
    stats.regions++; stats.holes += holePts.length;
    stats.pts += outPts.length + holePts.reduce((s, h) => s + h.length, 0);
  }

  /* 纸面统一放在 index 0，标记 bg:1（没有轮廓 —— 运行时用「矩形 − 所有主体块」得到） */
  regions.unshift({ pct: Math.round(bgPct * 100) / 100, bg: 1, n: bgN, pts: [] });
  /* 大块在前、小块在后：运行时先画大的，小的压在上面，小区域不会被大块盖住 */
  regions.sort((a, b) => (b.pct || 0) - (a.pct || 0));
  regions[0] = { pct: Math.round(bgPct * 100) / 100, bg: 1, n: bgN, pts: [] };

  DBG.push('主体块 ' + stats.regions + '（丢弃 ' + stats.dropped + '）孔洞 ' + stats.holes + ' 顶点 ' + stats.pts + ' 纸面块 ' + bgN);
  return { regions: regions, dbg: DBG, size: [W, H] };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE });
  const page = await browser.newContext().then(c => c.newPage());
  await page.goto('about:blank');

  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.webp')).sort();
  const out = {};
  let totalBytes = 0;
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(DIR, f)).toString('base64');
    const res = await page.evaluate(EXTRACT, b64);
    const regions = res.regions;
    if (res.dbg && res.dbg.length) console.log('   ' + res.dbg.join('\n   '));
    const id = f.replace(/\.webp$/, '');
    out[id] = regions;
    const subs = regions.slice(1);
    const small = subs.filter(r => (r.pct || 0) < 0.5).length;
    const holes = subs.filter(r => r.hp && r.hp.length).length;
    console.log('%s: %2d 区域 (小 <0.5%%: %d, 带孔洞: %d)  纸面 %.2f%%',
      id, subs.length, small, holes, regions[0].pct);
  }
  const json = JSON.stringify(out);
  fs.writeFileSync(path.join(DIR, 'cp-regions.json'), json, 'utf8');
  fs.writeFileSync(path.join(DIR, 'cp-regions.js'),
    '/* 涂色页闭合区域数据：由 tools/extract_cp_regions.js 离线生成（0..100 坐标系） */\n'
    + 'window.CP_REGIONS=' + json + ';\n', 'utf8');
  console.log('\n已写出 cp-regions.json / cp-regions.js（%d 张，%.0f KB）', files.length, json.length / 1024);
  await browser.close();
})();
