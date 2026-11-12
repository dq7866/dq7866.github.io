/**
 * 知识擂台 · Pages Worker 入口（主站 /games/knowledge/ 子路径）
 *
 * 部署形态：Cloudflare Pages 高级模式（输出目录里的 _worker.js）。
 * Pages 项目本身不能创建 Durable Object，因此：
 *   - 这里只负责「取题 / 判分 / 健康检查」三个 HTTP 接口
 *   - 对战房间转发给外部 Worker 的 DO（通过 wrangler.jsonc 的 durable_objects 绑定）
 *
 * ⚠️ 安全要点：题库含每道题的 correct 字段，绝不能作为独立文件放进 public/，
 *    否则任何人都能下载题库、直接看答案。题库由构建脚本内联进本文件。
 */

import { drawQuestions, buildQidIndex, gradeAnswer, json } from './shared/bank-core.js';
import { RANK_DIFFS, mergeBoard, publicRow, sortBoard, validateEntry } from './shared/rank-core.js';
import questionBank from './bank/questions.json' with { type: 'json' };

const QUESTIONS = questionBank;
const QID_INDEX = buildQidIndex(QUESTIONS);

/** 云榜单存储绑定名（Cloudflare KV）；未绑定时接口返回 configured:false */
const RANK_BINDING = 'QS_RANK';
const RANK_SHOW = 20;

async function handleRank(request, env, url) {
  const kv = env && env[RANK_BINDING];
  const diff = String(url.searchParams.get('diff') || 'all').toLowerCase();

  if (request.method === 'GET') {
    if (!kv) return json({ ok: false, configured: false, list: [], note: 'KV 未绑定' });
    if (diff === 'all') {
      const all = [];
      for (const d of RANK_DIFFS) {
        const raw = await kv.get('board:' + d, 'json');
        if (Array.isArray(raw)) all.push(...raw);
      }
      return json({ ok: true, configured: true, diff: 'all', list: sortBoard(all).slice(0, RANK_SHOW).map(publicRow) });
    }
    if (!RANK_DIFFS.includes(diff)) return json({ ok: false, error: '未知难度' }, 400);
    const raw = await kv.get('board:' + diff, 'json');
    const list = (Array.isArray(raw) ? raw : []).slice(0, RANK_SHOW).map(publicRow);
    return json({ ok: true, configured: true, diff, list });
  }

  if (request.method === 'POST') {
    if (!kv) return json({ ok: false, configured: false, error: '云端榜单未启用' }, 503);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: '请求体不是合法 JSON' }, 400);
    }
    const entry = validateEntry(body);
    if (!entry) return json({ ok: false, error: '成绩未通过校验' }, 400);

    // 限流：同一 IP、同一难度每分钟一次（KV 的 expirationTtl 最小 60 秒）
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const bucket = Math.floor(Date.now() / 60000);
    const rlKey = 'rl:' + entry.d + ':' + ip + ':' + bucket;
    if (await kv.get(rlKey)) return json({ ok: false, error: '提交太频繁，稍后再试' }, 429);
    await kv.put(rlKey, '1', { expirationTtl: 120 });

    const key = 'board:' + entry.d;
    const next = mergeBoard(await kv.get(key, 'json'), entry);
    await kv.put(key, JSON.stringify(next));

    const rank = next.findIndex(e => e.t === entry.t && e.s === entry.s) + 1;
    return json({ ok: true, configured: true, rank, list: next.slice(0, RANK_SHOW).map(publicRow) });
  }

  return json({ ok: false, error: '不支持的请求方法' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') return json({}, 204);

    // 取题（不下发正确答案）
    if (pathname === '/games/knowledge/api/questions') {
      return json(drawQuestions(QUESTIONS, QID_INDEX, {
        grade: url.searchParams.get('grade') || 1,
        subject: url.searchParams.get('subject') || 'mix',
        n: url.searchParams.get('n') || 10,
        level: url.searchParams.get('level') || 2,
        kp: url.searchParams.get('kp') || '',
      }));
    }

    // 判分：客户端提交 { qid, picked } → 返回对错与正确答案
    if (pathname === '/games/knowledge/api/grade' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: '请求体不是合法 JSON' }, 400);
      }
      const { qid, picked } = body || {};
      if (qid === undefined || qid === null || typeof picked !== 'string') {
        return json({ error: '缺少 qid 或 picked' }, 400);
      }
      const r = gradeAnswer(QUESTIONS, qid, picked);
      if (r.error) return json(r, 404);
      return json({ ok: r.ok, correct: r.correct });
    }

    // 云榜单：敲散 /api/rank（GET 读、POST 提交）
    if (pathname === '/api/rank') {
      return handleRank(request, env, url);
    }

    // 健康检查
    if (pathname === '/games/knowledge/api/health') {
      return json({
        ok: true,
        questions: QUESTIONS.length,
        runtime: 'cloudflare-pages-worker',
        battle: !!env.ROOM,
        time: new Date().toISOString(),
      });
    }

    // 对战房间：转给 Durable Object（绑定名为 ROOM，指向独立的 room-worker）
    // 房间码由大厅实例内部分配，因此这里用固定名寻址到大厅实例。
    if (pathname === '/games/knowledge/ws') {
      if (!env.ROOM) {
        return new Response('对战服务未启用', { status: 503 });
      }
      const id = env.ROOM.idFromName('lobby');
      return env.ROOM.get(id).fetch(request);
    }

    // 其余路径交给静态资源
    return env.ASSETS.fetch(request);
  },
};
