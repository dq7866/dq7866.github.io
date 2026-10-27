/**
 * 知识擂台 · 对战房间 Worker
 *
 * Pages 项目不能创建 Durable Object（必须先有独立的 DO Worker 再绑定），
 * 所以对战房间单独部署成这个 Worker，主站的 Pages 项目通过
 * wrangler.jsonc 的 durable_objects.bindings（script_name 指向本 Worker）调用它。
 *
 * 本 Worker 同时也能独立提供 /ws（转发给自己的 DO），
 * 便于本地 wrangler dev 直接联调，无需经过 Pages。
 */

export { BattleRoom } from '../../shared/battle-room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        role: 'battle-room-worker',
        time: new Date().toISOString(),
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // WebSocket 升级：转给自己的 Durable Object（大厅实例）
    if (url.pathname === '/ws') {
      const id = env.ROOM.idFromName('lobby');
      return env.ROOM.get(id).fetch(request);
    }

    return new Response('knowledge-game-room: 仅供 Pages 项目绑定使用', { status: 404 });
  },
};
