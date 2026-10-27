/**
 * 对战房间 · Durable Object
 *
 * 每个房间一个实例。
 *
 * ⚠️ 关键点：用的是 Hibernation WebSocket API（state.acceptWebSocket），
 *    所以必须实现 webSocketMessage / webSocketClose 方法，
 *    不能用标准的 server.addEventListener('message')——两者不兼容，
 *    混用会导致消息根本不被投递（消息处理静默失效）。
 *
 * 房间状态存 DO Storage（this.state.storage），不用实例内存字段——
 * 休眠后实例内存会被重置。
 *
 * 题库由构建脚本注入（QUESTIONS / QID_INDEX 来自外层作用域），
 * 避免在两个地方各加载一份 1.7 MB 的题库。
 */
export class BattleRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  getRoom() {
    return this.storage.get('room');
  }
  setRoom(room) {
    return this.storage.put('room', room);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 400 });
    }

    const mode = url.searchParams.get('mode') || 'create';
    const code = url.searchParams.get('code') || String(Math.floor(Math.random() * 9000) + 1000);

    let room = await this.getRoom();
    if (!room) {
      room = {
        code,
        grade: Number(url.searchParams.get('grade') || 1),
        subject: url.searchParams.get('subject') || 'mix',
        rounds: Math.min(Math.max(Number(url.searchParams.get('rounds') || 10), 3), 30),
        parentDelay: Math.min(Math.max(Number(url.searchParams.get('parentDelay') || 0), 0), 8000),
        level: Number(url.searchParams.get('level') || 2),
        questions: [], idx: 0,
        scores: { child: 0, parent: 0 },
        answers: { child: null, parent: null },
        detail: [], state: 'waiting', roundStart: 0, current: null,
      };
      await this.setRoom(room);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    // 每个连接的角色存到 attachment（休眠后仍能恢复）
    const role = mode === 'join' ? 'child' : 'parent';
    server.serializeAttachment({ role, code: room.code });
    server.send(JSON.stringify({ type: 'joined', code: room.code, role }));

    // 两端到齐 → 开局
    if (this.state.getWebSockets().length >= 2) {
      await this.startMatch();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  /** 消息入口：Hibernation API 的标准处理方式 */
  async webSocketMessage(ws, message) {
    let msg;
    try { msg = JSON.parse(String(message)); } catch { return; }
    const role = (ws.deserializeAttachment() || {}).role || 'child';

    if (msg.type === 'answer') await this.handleAnswer(ws, role, msg);
    else if (msg.type === 'rematch') await this.startMatch();
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment() || {};
    if (att.role === 'child' && this.state.getWebSockets().length > 0) {
      this.broadcast({ type: 'info', msg: '对方已离开' });
    }
  }

  async handleAnswer(ws, role, msg) {
    const room = await this.getRoom();
    if (!room || room.state !== 'playing' || !room.current) return;
    if (typeof msg.text !== 'string') return;
    if (role === 'parent' && Date.now() - room.roundStart < room.parentDelay) {
      ws.send(JSON.stringify({ type: 'locked' }));
      return;
    }
    if (room.answers[role]) return;

    const ok = msg.text.trim() === String(room.current.options[room.current.correct]).trim();
    room.answers[role] = { ok, text: msg.text, ms: Date.now() - room.roundStart };
    if (ok) room.scores[role] += 1;
    await this.setRoom(room);

    this.broadcast({ type: 'result', who: role, ok, score: room.scores[role] });

    if (room.answers.child && room.answers.parent) {
      room.state = 'revealing';
      await this.setRoom(room);
      setTimeout(() => this.reveal(), 1000);
    }
  }

  broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(data); } catch { /* 连接已断 */ }
    }
  }

  async startMatch() {
    const room = await this.getRoom();
    if (!room) return;
    room.scores = { child: 0, parent: 0 };
    room.idx = 0;
    room.detail = [];
    room.questions = drawQuestions(QUESTIONS, QID_INDEX, {
      grade: room.grade, subject: room.subject,
      n: room.rounds, level: room.level,
      keepAnswer: true,   // DO 内部判分要用；下发给客户端时不含 correct
    });
    room.state = 'playing';
    room.current = null;
    await this.setRoom(room);
    await this.nextRound();
  }

  async nextRound() {
    const room = await this.getRoom();
    if (!room) return;
    if (room.idx >= room.questions.length) return this.finish();
    // 已出过的题不再重发：定时器链可能重复走到这里，
    // 重复发题会导致结算多次、复盘明细重复累加
    if (room.state === 'over' || room.current) return;
    const q = room.questions[room.idx];
    room.current = q;
    room.answers = { child: null, parent: null };
    room.roundStart = Date.now();
    room.state = 'playing';
    await this.setRoom(room);

    this.broadcast({
      type: 'round',
      no: room.idx + 1,
      total: room.questions.length,
      subj: q.subj, kp: q.kp, text: q.text,
      // 只发选项文本，不发 correct
      options: q.options.map(t => ({ t })),
      time: 15,
      scores: { ...room.scores },
      parentDelay: room.parentDelay,
    });
    setTimeout(() => this.reveal(), 15000);
  }

  async reveal() {
    const room = await this.getRoom();
    if (!room || !room.current) return;
    room.state = 'revealing';
    const q = room.current;
    room.detail.push({
      no: room.idx + 1,
      subj: q.subj, kp: q.kp, text: q.text,
      correct: q.options[q.correct],
      child: room.answers.child || { ok: false, text: null, ms: null },
      parent: room.answers.parent || { ok: false, text: null, ms: null },
    });
    await this.setRoom(room);
    this.broadcast({ type: 'reveal', correct: q.options[q.correct] });
    room.idx += 1;
    room.current = null;          // 清空，下一轮才能重新出题
    await this.setRoom(room);
    setTimeout(() => this.nextRound(), 2600);
  }

  async finish() {
    const room = await this.getRoom();
    if (!room) return;
    // 终局守卫：只结算一次。定时器链可能多次走到这里
    if (room.state === 'over') return;
    room.state = 'over';
    const { child, parent } = room.scores;
    await this.setRoom(room);
    this.broadcast({
      type: 'over',
      scores: { child, parent },
      result: child === parent ? 'draw' : (child > parent ? 'child' : 'parent'),
      detail: room.detail,
    });
  }
}
