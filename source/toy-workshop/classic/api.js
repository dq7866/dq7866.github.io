/* ============================================================
 * api.js — 存档服务 stub（本地 localStorage 实现，形态即未来真实 API）
 * ============================================================ */

const delay = ms => new Promise(r => setTimeout(r, ms));
const PROGRESS_KEY = 'ttw_progress_v1';

function readLocal() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }
  catch (e) { return {}; }
}

/**
 * GET /api/v1/progress
 * → { code, data: { [toyId]: { easy: {stars, plays}, hard: {stars, plays} } } }
 */
async function apiLoadProgress() {
  await delay(60);
  // TODO: replace with fetch('/api/v1/progress')
  return { code: 0, data: readLocal() };
}

/**
 * POST /api/v1/progress  body: { toyId, mode, stars, score }
 * → { code, data }  规则：保留历史最高星级与最高分，累计完成次数
 */
async function apiSaveProgress(toyId, mode, stars, score = 0) {
  await delay(60);
  // TODO: replace with fetch('/api/v1/progress', { method: 'POST', body: JSON.stringify({ toyId, mode, stars, score }) })
  const db = readLocal();
  db[toyId] = db[toyId] || {};
  const cur = db[toyId][mode] || { stars: 0, plays: 0, bestScore: 0 };
  db[toyId][mode] = {
    stars: Math.max(cur.stars || 0, stars),
    plays: (cur.plays || 0) + 1,
    bestScore: Math.max(cur.bestScore || 0, score)
  };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(db));
  return { code: 0, data: db };
}
