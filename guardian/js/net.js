/* ============================================================
   冰火守门人 —— 实时对战（/guardian/js/net.js）
   ------------------------------------------------------------
   设计：双方各守自己的城门（同一场景/难度），以「互坑事件」互相干扰。
   通道是请求-响应式的，所以采用 1.5 秒轮询同步：每轮同时
   「上报自己的状态 + 拉取对手状态与待处理事件」——慢节奏守门
   玩法下这个延迟完全够用，也天然容忍偶发网络抖动。
   互坑点：每 15 秒自动 +1，上限 3 点；发一条事件消耗 1 点。
   ============================================================ */
var Net = (function () {
  "use strict";
  var POLL = 1500, MAXP = 3, POINT_MS = 15000;

  var room = null, timer = null, pointTimer = null;
  var lastEventId = 0, points = 0, destroyed = false;
  var cbEvent = null, cbPeer = null, cbStatus = null;

  function cloud() { return window.GkCloud; }
  function available() { return !!(cloud() && typeof cloud().call === "function") && !!Save.playerId(); }
  function pid() { return Save.playerId(); }
  function status(o) { if (cbStatus) cbStatus(o); }

  function host(nick) {
    if (!available()) return Promise.resolve({ ok: false, message: "云端通道不可用" });
    return cloud().roomCreate(pid(), nick).then(function (r) {
      if (!r || !r.ok) return { ok: false, message: (r && r.message) || "建房失败" };
      room = { code: r.code, role: "host", peerNick: "", hasPeer: false };
      lastEventId = 0; destroyed = false;
      startPoints();
      return { ok: true, code: r.code, role: "host" };
    });
  }
  function join(code, nick) {
    if (!available()) return Promise.resolve({ ok: false, message: "云端通道不可用" });
    return cloud().roomJoin(code, pid(), nick).then(function (r) {
      if (!r || !r.ok) {
        var msg = r && r.reason === "no_room" ? "房间不存在或已解散" :
                  r && r.reason === "full" ? "房间已满" : (r && r.message) || "加入失败";
        return { ok: false, message: msg };
      }
      room = { code: r.code, role: r.role, peerNick: r.peer || "", hasPeer: true };
      lastEventId = 0; destroyed = false;
      startPoints();
      return { ok: true, code: r.code, role: r.role, peer: r.peer || "" };
    });
  }

  function begin(hooks) {
    hooks = hooks || {};
    cbEvent = hooks.onEvent; cbPeer = hooks.onPeer; cbStatus = hooks.onStatus;
    loop();
  }

  function loop() {
    if (!room || destroyed) return;
    var g = window.Game;
    var st = (g && g.netState) ? g.netState() : null;
    cloud().roomSync({ code: room.code, player: pid(), state: st, hp: st ? st.lives : 0, since: lastEventId })
      .then(function (r) {
        if (destroyed) return;
        if (r && r.ok) {
          room.hasPeer = !!r.hasPeer;
          if (r.peerNick) room.peerNick = r.peerNick;
          room.peerHp = r.peerHp;
          if (r.peerState && cbPeer) cbPeer(r.peerState, { nick: room.peerNick, hp: r.peerHp });
          (r.events || []).forEach(function (ev) {
            var id = Number(ev.id) || 0;
            if (id > lastEventId) lastEventId = id;
            if (cbEvent) cbEvent(ev.kind, ev.payload || {});
          });
          status({ type: "sync", peerOnline: true, hasPeer: room.hasPeer });
        } else if (r && r.reason === "no_room") {
          status({ type: "error", message: "房间已解散" });
          stop();
          return;
        } else {
          status({ type: "warn", message: (r && r.message) || "同步异常" });
        }
        timer = setTimeout(loop, POLL);
      })
      .catch(function () { if (!destroyed) timer = setTimeout(loop, POLL * 2); });
  }

  function push(kind, payload, local) {
    if (!room || points <= 0) return Promise.resolve({ ok: false, reason: "no_point" });
    points--;
    status({ type: "points", points: points });
    /* local=true 表示只在自己这边生效（如自加护盾），不发给对手 */
    if (local) return Promise.resolve({ ok: true });
    return cloud().eventPush(room.code, pid(), kind, payload || {}).then(function (r) {
      if (r && r.ok) return { ok: true };
      /* 被节流或没有对手时不消耗点数 */
      points = Math.min(MAXP, points + 1);
      status({ type: "points", points: points });
      return { ok: false, reason: (r && r.reason) || "failed" };
    });
  }

  function startPoints() {
    points = 1;
    if (pointTimer) clearInterval(pointTimer);
    pointTimer = setInterval(function () {
      points = Math.min(MAXP, points + 1);
      status({ type: "points", points: points });
    }, POINT_MS);
    status({ type: "points", points: points });
  }

  function stop() {
    var r = room;
    room = null;
    destroyed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (pointTimer) { clearInterval(pointTimer); pointTimer = null; }
    if (r && cloud()) { try { cloud().roomLeave(r.code, pid()); } catch (e) {} }
  }

  function state() {
    if (!room) return null;
    return { code: room.code, role: room.role, peerNick: room.peerNick, hasPeer: room.hasPeer, peerHp: room.peerHp, points: points };
  }
  function pointsLeft() { return points; }

  return {
    available: available, host: host, join: join, begin: begin, push: push,
    stop: stop, state: state, points: pointsLeft,
    /* 互坑手段的展示文案 */
    IMPAIRS: [
      { kind: "spawn_elite", name: "派精英怪", icon: "👹", desc: "给对手战场加一只精英魔物" },
      { kind: "freeze",      name: "冰封",     icon: "🧊", desc: "冻结对手守门人 1.8 秒" },
      { kind: "bomb",        name: "空投炸弹", icon: "💥", desc: "在对手场地制造一处爆炸" },
      { kind: "shield",      name: "自加护盾", icon: "🛡", desc: "给自己加 4 秒护盾（不消耗对手）" }
    ]
  };
})();
