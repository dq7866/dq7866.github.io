/** GET /games/knowledge/api/health —— 健康检查 */
import { QUESTIONS, json } from '../_lib.js';

export async function onRequestGet() {
  return json({
    ok: true,
    questions: QUESTIONS.length,
    runtime: 'cloudflare-pages-functions',
    time: new Date().toISOString(),
  });
}
