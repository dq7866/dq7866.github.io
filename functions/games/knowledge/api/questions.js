/** GET /games/knowledge/api/questions —— 取题（不下发正确答案） */
import { QUESTIONS, QID_INDEX, drawQuestions, json } from '../_lib.js';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  return json(drawQuestions(QUESTIONS, QID_INDEX, {
    grade: url.searchParams.get('grade') || 1,
    subject: url.searchParams.get('subject') || 'mix',
    n: url.searchParams.get('n') || 10,
    level: url.searchParams.get('level') || 2,
    kp: url.searchParams.get('kp') || '',
  }));
}
