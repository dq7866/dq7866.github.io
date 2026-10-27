'use strict';

/**
 * Pages Worker（高级模式）落地
 *
 * Pages 的 Git 集成部署有两条路：
 *   1. functions/ 目录  —— 只在 wrangler pages dev 本地预览时用
 *   2. 输出目录里的 _worker.js —— Git 集成部署时真正生效的方式
 *
 * 主项目走的是 Git 集成（构建命令 npm ci --omit=dev && npm run build），
 * 所以必须把 _worker.js 落到 public/ 里，Pages 才会启用高级模式。
 *
 * ⚠️ 安全要点：题库含每道题的 correct 字段，绝不能作为独立文件放进 public/，
 *    否则任何人都能下载题库、直接看答案。
 *    因此把题库与逻辑代码一起内联进 _worker.js，打包成一个 Worker bundle，
 *    public/ 下不留任何题库文件。
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'functions', 'games', 'knowledge');

/**
 * 把模块源码改成可内联的形式：
 *   - 去掉 import 行（依赖由构建脚本统一注入）
 *   - export function / export const / export class → 去掉 export
 * 返回可直接放进一个作用域的代码。
 */
function stripModule(code) {
  return code
    .split('\n')
    .filter(line => !/^\s*import\s/.test(line))
    .map(line => line.replace(/^(\s*)export\s+(default\s+)?/, '$1'))
    .join('\n');
}

function main() {
  if (!fs.existsSync(OUT)) {
    console.error('[worker] public/ 不存在，跳过');
    return;
  }
  if (!fs.existsSync(SRC)) {
    console.error('[worker] functions/games/knowledge/ 不存在，跳过');
    process.exitCode = 1;
    return;
  }

  const bankCore = stripModule(
    fs.readFileSync(path.join(SRC, 'bank-core.js'), 'utf8')
  );
  const battleRoom = stripModule(
    fs.readFileSync(path.join(SRC, 'battle-room.js'), 'utf8')
  );
  const questions = fs.readFileSync(path.join(SRC, 'data', 'questions.json'), 'utf8');

  const worker = [
    '/**',
    ' * 知识擂台 · Pages Worker 入口（由 scripts/post-build-worker.js 生成）',
    ' *',
    ' * Pages 在输出目录发现 _worker.js 就启用高级模式：',
    ' * 未匹配的路径走 env.ASSETS（静态资源），匹配的走本文件。',
    ' *',
    ' * 题库已内联进本文件——public/ 下不留题库文件，避免答案被直接下载。',
    ' */',
    '',
    bankCore,
    '',
    '// 题库常量必须先声明：DO 类的 startMatch 会引用 QUESTIONS / QID_INDEX',
    'const QUESTIONS = ' + questions + ';',
    'const QID_INDEX = buildQidIndex(QUESTIONS);',
    '',
    '// DO 类：题库由外层注入（QUESTIONS / QID_INDEX），避免重复加载 1.7 MB',
    battleRoom,
    '',
    'export { BattleRoom };',
    '',
    'export default {',
    '  async fetch(request, env) {',
    '    const url = new URL(request.url);',
    "    const { pathname } = url;",
    '',
    "    if (request.method === 'OPTIONS') return json({}, 204);",
    '',
    '    // 取题（不下发正确答案）',
    "    if (pathname === '/games/knowledge/api/questions') {",
    '      return json(drawQuestions(QUESTIONS, QID_INDEX, {',
    "        grade: url.searchParams.get('grade') || 1,",
    "        subject: url.searchParams.get('subject') || 'mix',",
    "        n: url.searchParams.get('n') || 10,",
    "        level: url.searchParams.get('level') || 2,",
    "        kp: url.searchParams.get('kp') || '',",
    '      }));',
    '    }',
    '',
    '    // 判分：客户端提交 { qid, picked } → 返回对错与正确答案',
    "    if (pathname === '/games/knowledge/api/grade' && request.method === 'POST') {",
    '      let body;',
    '      try {',
    '        body = await request.json();',
    '      } catch {',
    "        return json({ error: '请求体不是合法 JSON' }, 400);",
    '      }',
    '      const { qid, picked } = body || {};',
    "      if (qid === undefined || qid === null || typeof picked !== 'string') {",
    "        return json({ error: '缺少 qid 或 picked' }, 400);",
    '      }',
    '      const r = gradeAnswer(QUESTIONS, qid, picked);',
    '      if (r.error) return json(r, 404);',
    '      return json({ ok: r.ok, correct: r.correct });',
    '    }',
    '',
    '    // 健康检查',
    "    if (pathname === '/games/knowledge/api/health') {",
    '      return json({',
    '        ok: true,',
    '        questions: QUESTIONS.length,',
    "        runtime: 'cloudflare-pages-worker',",
    '        time: new Date().toISOString(),',
    '      });',
    '    }',
    '',
    '    // 对战房间：转给 Durable Object',
    "    if (pathname === '/games/knowledge/ws') {",
    "      const code = url.searchParams.get('code') || 'default';",
    '      const id = env.ROOM.idFromName(code);',
    '      return env.ROOM.get(id).fetch(request);',
    '    }',
    '',
    '    // 其余路径交给静态资源',
    '    return env.ASSETS.fetch(request);',
    '  },',
    '};',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(OUT, '_worker.js'), worker, 'utf8');

  // 清理上一次可能残留的 _worker/ 目录（里面有可下载的题库）
  const stale = path.join(OUT, '_worker');
  if (fs.existsSync(stale)) {
    fs.rmSync(stale, { recursive: true, force: true });
  }

  const kb = (Buffer.byteLength(worker) / 1024).toFixed(0);
  console.log('[worker] 已生成 public/_worker.js（Pages 高级模式，题库已内联，%s KB）', kb);
}

main();
