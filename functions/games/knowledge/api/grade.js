/** POST /games/knowledge/api/grade —— 服务端判分 { qid, picked } */
import { QUESTIONS, gradeAnswer, json } from '../_lib.js';

export async function onRequestPost({ request }) {
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
