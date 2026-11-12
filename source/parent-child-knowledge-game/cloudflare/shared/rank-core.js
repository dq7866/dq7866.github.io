/**
 * 敲散 · 云榜单数据结构与校验
 *
 * 纯函数，无 Cloudflare 依赖，方便本地单测。
 * 存储形态：KV key = `board:<diff>`，value = 按分数降序的数组（最多 50 条）。
 */

export const RANK_DIFFS = ['chill', 'normal', 'frenzy'];
export const RANK_MAX = 50;
export const RANK_SHOW = 20;

/** 昵称清洗：去掉控制字符与尖括号，按字素截断到 12 个字符 */
export function sanitizeName(raw) {
  let s = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim();
  if (!s) s = '匿名';
  return [...s].slice(0, 12).join('');
}

/** 把一条提交规范化为内部结构；不合法返回 null */
export function validateEntry(body) {
  const r = (body && typeof body === 'object') ? body : {};
  const int = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? Math.round(v) : -1;

  const score = int(r.score);
  const pops = int(r.pops);
  const bursts = int(r.bursts);
  const level = int(r.level);
  const chain = int(r.chain);
  const diff = RANK_DIFFS.includes(r.diff) ? r.diff : 'normal';

  if (pops < 1 || pops > 5000) return null;
  if (score < 0) return null;
  if (bursts < 0 || bursts > pops) return null;
  if (chain < 0 || chain > pops) return null;
  if (level < 1 || level > 1 + Math.floor(pops / 12) + 1) return null;
  // 客户端单次最高约 1000 分：留足冗余，但挡住明显伪造
  if (score > pops * 1200 + 2000) return null;

  return { n: sanitizeName(r.name), s: score, p: pops, b: bursts, l: level, c: chain, d: diff, t: Date.now() };
}

export function sortBoard(list) {
  return (Array.isArray(list) ? list : [])
    .filter(e => e && typeof e.s === 'number' && Number.isFinite(e.s))
    .sort((a, b) => (b.s - a.s) || ((a.t || 0) - (b.t || 0)))
    .slice(0, RANK_MAX);
}

export function mergeBoard(list, entry) {
  return sortBoard([...(Array.isArray(list) ? list : []), entry]);
}

export function publicRow(e, i) {
  return {
    rank: i + 1,
    name: e.n,
    score: e.s,
    pops: e.p,
    bursts: e.b,
    level: e.l,
    chain: e.c,
    diff: e.d,
    at: e.t,
  };
}
