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
import questionBank from './bank/questions.json' with { type: 'json' };

const QUESTIONS = questionBank;
const QID_INDEX = buildQidIndex(QUESTIONS);

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
