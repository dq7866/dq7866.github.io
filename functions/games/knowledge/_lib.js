/**
 * 知识擂台 · Pages Functions 共享库（主站点部署版）
 *
 * 题库随 bundle 发布（gzip 约 0.2 MB）。
 * 服务端判分，浏览器拿不到 correct 字段。
 */
import questionBank from './data/questions.json' with { type: 'json' };
import { drawQuestions, buildQidIndex, gradeAnswer, json } from './bank-core.js';

export const QUESTIONS = questionBank;
export const QID_INDEX = buildQidIndex(QUESTIONS);

export { drawQuestions, gradeAnswer, json };
