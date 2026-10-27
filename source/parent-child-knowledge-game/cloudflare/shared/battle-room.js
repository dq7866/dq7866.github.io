/**
 * 对战大厅 · Durable Object
 *
 * 协议与本地版 server.js 完全一致（消息式），前端无需区分部署位置：
 *   客户端 → 服务端
 *     { type:'create', grade, subject, parentDelay, rounds }
 *     { type:'join',   code }
 *     { type:'answer', text }
 *     { type:'rematch' }
 *   服务端 → 客户端
 *     { type:'created', code }                  房间已创建（服务端发码）
 *     { type:'joined' } { type:'ready' }        双方就位
 *     { type:'round', no, total, subj, kp, text, options, time, scores, parentDelay }
 *     { type:'unlock' } { type:'locked' }      家长延迟锁
 *     { type:'result', who, ok, score }
 *     { type:'reveal', correct, winner }
 *     { type:'over', scores, result, detail }
 *     { type:'rematch' } { type:'info', msg } { type:'error', msg }
 *
 * 为什么是「一个大厅装多个房间」而不是「一个房间一个实例」：
 *   房间码是服务端在收到 create 之后才生成的，而 DO 实例必须在连接建立之前
 *   就选定（idFromName）。若一房一实例，就得让前端自己生成房间码，会与本地版
 *   行为不一致（本地版由服务端发码）。这里让大厅实例自己发码并在内部按码分房，
 *   前端一行都不用改，两种部署行为完全一致。
 *
 * 为什么用标准 WebSocket API 而不是 Hibernation API：
 *   Hibernation 模式下实例可能在回合进行中被驱逐，内存里的 setTimeout 定时器
 *   会一起丢失，回合直接卡死；Hibernation 还要求用 Alarm 驱动调度，复杂度高。
 *   标准 API 下活跃连接会让实例常驻内存，定时器在整个对局期间可靠 ——
 *   家庭场景同时也就几局，内存计费可以忽略。
 */

import { drawQuestions, buildQidIndex } from './bank-core.js';
import questionBank from '../bank/questions.json' with { type: 'json' };

const QUESTIONS = questionBank;
const QID_INDEX = buildQidIndex(QUESTIONS);

/* 与本地 server.js 保持一致 */
const ROUND_TIME = 15;          // 每题秒数（客户端按 m.time*1000 倒计时）
const REVEAL_DELAY = 1000;       // 双方都作答后，公布答案前的停顿
const NEXT_ROUND_DELAY = 2600;   // 公布答案到下一题的间隔
const JOIN_DELAY = 700;         // 孩子加入后稍等再开局
const REMATCH_DELAY = 800;
const ROOM_TTL = 30 * 60 * 1000;   // 房间最长保留时间（与本地版空闲回收同量级）

export class BattleRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map();     // code -> room
    this.ctxs = new Map();      // ws -> { code, role }
  }

  /* --------------------------- WebSocket 接入 --------------------------- */
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.ctxs.set(server, { code: null, role: null });
    server.addEventListener('message', ev => this.onMessage(server, ev.data));
    server.addEventListener('close', () => this.onClose(server));
    server.addEventListener('error', () => this.onClose(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  onMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'create') return this.createRoom(ws, msg);
    if (msg.type === 'join') return this.joinRoom(ws, msg);

    const ctx = this.ctxs.get(ws);
    const room = ctx && ctx.code ? this.rooms.get(ctx.code) : null;
    if (!room) {
      return this.send(ws, { type: 'error', msg: '房间已失效，请重新创建' });
    }
    if (msg.type === 'answer') return this.handleAnswer(room, ws, msg);
    if (msg.type === 'rematch') return this.handleRematch(room);
  }

  /* ------------------------------ 建房 ------------------------------ */
  createRoom(ws, msg) {
    this.sweep();
    const code = this.newCode();
    const room = {
      code,
      host: ws,
      guest: null,
      grade: msg.grade || 1,
      subject: msg.subject || 'mix',
      rounds: Math.min(Math.max(Number(msg.rounds) || 10, 3), 30),
      parentDelay: Math.min(Math.max(Number(msg.parentDelay) || 0, 0), 8000),
      level: Math.min(Math.max(Number(msg.level) || 2, 1), 3),
      questions: [],
      idx: 0,
      scores: { child: 0, parent: 0 },
      answers: { child: null, parent: null },
      detail: [],           // 逐题明细，回合结束时随 over 下发用于复盘
      state: 'waiting',
      roundStart: 0,
      current: null,
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.ctxs.set(ws, { code, role: 'parent' });
    this.send(ws, { type: 'created', code });
  }

  /* ------------------------------ 加入 ------------------------------ */
  joinRoom(ws, msg) {
    const code = String(msg.code || '').trim();
    const room = this.rooms.get(code);
    if (!room) {
      return this.send(ws, { type: 'error', msg: '房间不存在，请检查房间码' });
    }
    if (room.guest) {
      return this.send(ws, { type: 'error', msg: '房间已满，请换一局' });
    }

    room.guest = ws;
    this.ctxs.set(ws, { code, role: 'child' });
    this.send(ws, { type: 'joined' });
    this.send(room.host, { type: 'ready' });
    this.send(ws, { type: 'ready' });
    setTimeout(() => {
      if (this.rooms.get(code) === room && room.guest === ws) this.startMatch(room);
    }, JOIN_DELAY);
  }

  /* ------------------------------ 开局 ------------------------------ */
  startMatch(room) {
    room.scores = { child: 0, parent: 0 };
    room.idx = 0;
    room.detail = [];
    // keepAnswer：大厅内部要靠 correct 判分，但下发给客户端时不带这个字段
    room.questions = drawQuestions(QUESTIONS, QID_INDEX, {
      grade: room.grade,
      subject: room.subject,
      n: room.rounds,
      level: room.level,
      keepAnswer: true,
    });
    room.state = 'playing';
    this.nextRound(room);
  }

  nextRound(room) {
    if (this.rooms.get(room.code) !== room) return;
    if (!room.guest || room.guest.readyState !== 1) { room.state = 'waiting'; return; }
    if (room.idx >= room.questions.length) return this.finish(room);

    const q = room.questions[room.idx];
    room.current = q;
    room.answers = { child: null, parent: null };
    room.roundStart = Date.now();
    room.state = 'playing';

    const payload = {
      type: 'round',
      no: room.idx + 1,
      total: room.questions.length,
      subj: q.subj,
      kp: q.kp,
      text: q.text,
      // 只发选项文本，不发 correct
      options: q.options.map(t => ({ t })),
      time: ROUND_TIME,
      scores: { ...room.scores },
      parentDelay: room.parentDelay,
    };
    this.send(room.host, payload);
    this.send(room.guest, payload);

    if (room.parentDelay > 0) {
      room.unlockTimer = setTimeout(() => {
        this.send(room.host, { type: 'unlock' });
      }, room.parentDelay);
    }
    room.roundTimer = setTimeout(() => this.reveal(room, null), ROUND_TIME * 1000);
  }

  /* ------------------------------ 判分 ------------------------------ */
  handleAnswer(room, ws, msg) {
    if (this.rooms.get(room.code) !== room) return;
    if (!room.current || room.state !== 'playing') return;
    if (typeof msg.text !== 'string') return;   // 非法载荷直接丢弃，避免 String(null) 撞答案

    const ctx = this.ctxs.get(ws);
    const role = ctx ? ctx.role : null;
    if (!role) return;

    if (role === 'parent' && Date.now() - room.roundStart < room.parentDelay) {
      this.send(ws, { type: 'locked' });
      return;
    }
    if (room.answers[role]) return;

    // 归一化首尾空白后再比对，防止客户端裁剪文本造成「答对却判错」
    const ok = msg.text.trim() === String(room.current.options[room.current.correct]).trim();
    room.answers[role] = { ok, text: msg.text, ms: Date.now() - room.roundStart };
    if (ok) room.scores[role] += 1;

    const result = { type: 'result', who: role, ok, score: room.scores[role] };
    this.send(room.host, result);
    this.send(room.guest, result);

    if (room.answers.child && room.answers.parent) {
      clearTimeout(room.roundTimer);
      room.revealTimer = setTimeout(() => this.reveal(room, role), REVEAL_DELAY);
    }
  }

  /* ------------------------------ 公布答案 ------------------------------ */
  reveal(room, winner) {
    if (this.rooms.get(room.code) !== room) return;
    if (!room.current) return;
    clearTimeout(room.roundTimer);
    room.state = 'revealing';
    const q = room.current;
    const correctText = q.options[q.correct];

    room.detail.push({
      no: room.idx + 1,
      subj: q.subj,
      kp: q.kp,
      text: q.text,
      correct: correctText,
      child: room.answers.child || { ok: false, text: null, ms: null },
      parent: room.answers.parent || { ok: false, text: null, ms: null },
    });

    const payload = { type: 'reveal', correct: correctText, winner: winner || '' };
    this.send(room.host, payload);
    this.send(room.guest, payload);

    room.idx += 1;
    room.nextTimer = setTimeout(() => this.nextRound(room), NEXT_ROUND_DELAY);
  }

  /* ------------------------------ 结算 ------------------------------ */
  finish(room) {
    if (this.rooms.get(room.code) !== room) return;
    this.clearTimers(room);
    room.state = 'over';
    const { child, parent } = room.scores;
    const result = child === parent ? 'draw' : (child > parent ? 'child' : 'parent');
    const payload = { type: 'over', scores: { child, parent }, result, detail: room.detail };
    this.send(room.host, payload);
    this.send(room.guest, payload);
  }

  /* ------------------------------ 再来一局 ------------------------------ */
  handleRematch(room) {
    if (this.rooms.get(room.code) !== room) return;
    this.send(room.host, { type: 'rematch' });
    this.send(room.guest, { type: 'rematch' });
    this.clearTimers(room);
    room.idx = 0;
    room.scores = { child: 0, parent: 0 };
    room.detail = [];
    room.questions = drawQuestions(QUESTIONS, QID_INDEX, {
      grade: room.grade,
      subject: room.subject,
      n: room.rounds,
      level: room.level,
      keepAnswer: true,
    });
    room.nextTimer = setTimeout(() => this.nextRound(room), REMATCH_DELAY);
  }

  /* ------------------------------ 连接关闭 ------------------------------ */
  onClose(ws) {
    const ctx = this.ctxs.get(ws);
    this.ctxs.delete(ws);
    if (!ctx || !ctx.code) return;
    const room = this.rooms.get(ctx.code);
    if (!room) return;

    if (room.host === ws) {
      this.send(room.guest, { type: 'info', msg: '房主已离开，房间关闭' });
      this.clearTimers(room);
      this.rooms.delete(room.code);
    } else if (room.guest === ws) {
      room.guest = null;
      room.state = 'waiting';
      this.clearTimers(room);
    }
  }

  /* ------------------------------ 工具 ------------------------------ */
  /** 4 位房间码，避开正在使用的码 */
  newCode() {
    for (let i = 0; i < 200; i++) {
      const c = String(1000 + Math.floor(Math.random() * 9000));
      if (!this.rooms.has(c)) return c;
    }
    return String(Date.now()).slice(-4);
  }

  /** 回收过期房间，避免长时间占用内存 */
  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.createdAt > ROOM_TTL) {
        this.clearTimers(room);
        this.rooms.delete(code);
      }
    }
  }

  clearTimers(room) {
    for (const k of ['unlockTimer', 'roundTimer', 'revealTimer', 'nextTimer']) {
      if (room[k]) { clearTimeout(room[k]); room[k] = null; }
    }
  }

  send(ws, obj) {
    if (!ws) return;
    try {
      if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    } catch { /* 连接已断 */ }
  }
}
