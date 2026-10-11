/* ============================================================
   冰火守门人 —— 装配与界面（/guardian/js/main.js）
   ------------------------------------------------------------
   菜单 / 结算 / 排行榜 / 赛季 / 勋章 / 每日任务 / 联机大厅，
   以及主循环与云同步。游戏逻辑在 game.js，联机通道在 net.js。
   ============================================================ */
(function () {
  "use strict";
  var cv = document.getElementById("cv");
  function $(id) { return document.getElementById(id); }
  var SCREENS = ["menu", "over", "pauseLayer", "lobby"];
  var sel = { scene: "frost", diff: "normal" };
  var lastTs = 0, menuT = 0, cloudOk = false, syncing = false, inDuel = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var tTimer = null;
  function showToast(txt) {
    var el = $("toast");
    el.textContent = txt;
    el.classList.add("on");
    clearTimeout(tTimer);
    tTimer = setTimeout(function () { el.classList.remove("on"); }, 2300);
  }
  function show(id) { SCREENS.forEach(function (s) { $(s).classList.toggle("hidden", s !== id); }); }
  function hideAll() { SCREENS.forEach(function (s) { $(s).classList.add("hidden"); }); }

  /* ================= 主循环 ================= */
  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    var st = Game.scene();
    if (st === "play") { Game.update(dt); Game.draw(); }
    else if (st === "pause" || st === "over") { Game.draw(); }
    else { menuT += dt; Game.drawMenuBg(menuT); }
  }

  /* ================= 菜单 ================= */
  function renderMenu() {
    var s = Save.get();
    var info = Config.levelInfo(s.level);
    $("m-level").textContent = s.level;
    $("m-title").textContent = info.title;
    $("m-coins").textContent = s.coins;
    $("m-nick").textContent = Save.nick();
    var need = Config.xpFor(s.level);
    $("m-xp").style.width = Math.max(2, Math.min(100, s.xp / need * 100)) + "%";
    var d = Progress.daily();
    $("m-daily").textContent = d.claimed + "/" + d.total;
    renderScenes();
    renderDiffs();
    renderBest();
  }

  function renderScenes() {
    var box = $("m-scenes"), lv = Save.get().level, html = "";
    Config.SCENES.forEach(function (sc) {
      var locked = lv < sc.unlock;
      html += '<div class="card' + (sel.scene === sc.id ? " sel" : "") + (locked ? " locked" : "") + '" data-scene="' + sc.id + '">' +
        '<div class="cname">' + sc.icon + " " + esc(sc.name) + '</div>' +
        '<div class="csub">' + esc(sc.desc) + '</div>' +
        (locked ? '<div class="clv">🔒 ' + sc.unlock + ' 级</div>' : "") +
        '</div>';
    });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll(".card"), function (el) {
      el.onclick = function () {
        var id = el.getAttribute("data-scene"), sc = Config.sceneById(id);
        if (Save.get().level < sc.unlock) { showToast("该战场需要 " + sc.unlock + " 级解锁"); return; }
        sel.scene = id;
        renderScenes(); renderBest();
      };
    });
    var cur = Config.sceneById(sel.scene) || Config.SCENES[0];
    var perk = { lava: "地面会周期性喷发岩浆，别站在原地。", sandstorm: "沙暴会间歇降低视野，注意提前布局。", bossrush: "巨像出现得更频繁。" }[cur.perk] || "常规战场。";
    $("m-sdesc").textContent = "机制：" + perk + "　主导元素：" +
      (cur.elem === "ice" ? "冰" : cur.elem === "rock" ? "岩" : cur.elem === "mix" ? "冰岩混编" : "重甲巨像");
  }

  function renderDiffs() {
    var box = $("m-diffs"), html = "";
    Config.DIFFS.forEach(function (d) {
      var ok = Save.diffUnlocked(d.id);
      html += '<div class="card' + (sel.diff === d.id ? " sel" : "") + (ok ? "" : " locked") + '" data-diff="' + d.id + '">' +
        '<div class="cname">' + d.icon + " " + esc(d.name) + '</div>' +
        '<div class="csub">' + esc(d.tag) + ' · 生命 ' + d.lives + ' · 收益 ×' + d.coinMul + '</div>' +
        (ok ? "" : '<div class="clv">🔒 ' + (d.id === "hard" ? 3 : 6) + ' 级</div>') +
        '</div>';
    });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll(".card"), function (el) {
      el.onclick = function () {
        var id = el.getAttribute("data-diff");
        if (!Save.diffUnlocked(id)) { showToast("该难度需要更高等级解锁"); return; }
        sel.diff = id; renderDiffs(); renderBest();
      };
    });
  }

  function renderBest() {
    var b = Save.bestOf(Config.modeKey(sel.scene, sel.diff));
    $("m-best").textContent = b
      ? "本模式最佳：" + b.score + " 分 · 第 " + b.wave + " 波 · 评级 " + (b.grade || "-")
      : "本模式暂无记录，去开个张";
  }

  /* ================= 开始 / 结算 ================= */
  function startSolo() {
    inDuel = false;
    hideAll();
    $("duelBar").classList.add("hidden");
    Game.start(sel.scene, sel.diff, { duel: false });
  }
  function onOver(d) {
    var S = d.S;
    $("overTitle").textContent = d.reason || "城门失守";
    $("overGrade").textContent = Game.gradeOf(S);
    $("overStat").textContent = "本局 " + S.score + " 分　撑到第 " + S.wave + " 波　结算宝石 " + S.gemBanked + " 颗";
    $("overRewards").innerHTML = "经验 <b>+" + d.res.xp + "</b>　金币 <b>+" + d.res.coins + "</b>　赛季积分 <b>+" + d.res.points + "</b>" +
      (d.isBest ? '　·　<span style="color:#ffd24a">刷新本模式纪录！</span>' : "") +
      (d.res.levelUps ? '<br>🎉 升到 ' + d.res.level + " 级：" + Config.levelInfo(d.res.level).title + "（移速/射速/生命提升）" : "");
    $("overMedals").innerHTML = (d.res.medals || []).map(function (m) {
      return '<span class="medal-chip">' + m.icon + " " + esc(m.name) + "</span>";
    }).join("");
    var tips = [
      "打免疫的怪是白打——先看清这波主什么魔。",
      "尾巴别贪太长，巨像一撞就断。",
      "波间休整期是走门结算的最好时机。",
      "站到亮灯的门上才算结算，走错门宝石全吐。"
    ];
    $("overTip").textContent = (d.res.medals && d.res.medals.length) ? "解锁了新勋章，去勋章墙看看。" : tips[Math.floor(Math.random() * tips.length)];
    show("over");
    if (inDuel) { showToast("对战结束，成绩已记录"); }
    submitScore();
    syncCloud(false);
    pullCloud();
  }

  function submitScore() {
    var g = Game.state();
    if (!g || !cloudOk) return;
    var mode = Config.modeKey(g.sc.id, g.df.id);
    GkCloud.submit({
      mode: mode, player: Save.playerId(), nick: Save.nick(),
      score: g.score, wave: g.wave, grade: Game.gradeOf(g)
    }).then(function (r) {
      if (r && r.ok && r.isBest && r.rank) showToast("云端榜第 " + r.rank + " 名！");
    });
  }

  /* ================= 云同步 ================= */
  function setCloud(txt, off) {
    $("m-cloud").textContent = txt;
    $("btn-cloud").classList.toggle("off", !!off);
  }
  function syncCloud(first) {
    if (syncing) return;
    /* 未登录：不硬提交，角标给「离线可玩」，避免匿名用户看到误导性的「同步失败」 */
    var sess = null;
    try { sess = window.ZHZBridge && window.ZHZBridge.session && window.ZHZBridge.session(); } catch (e) {}
    if (!sess) { cloudOk = false; setCloud("离线可玩", true); return; }
    syncing = true;
    setCloud("同步中…");
    var s = Save.get();
    GkCloud.save(Save.playerId(), {
      nickname: Save.nick(), level: s.level, xp: s.xp, coins: s.coins,
      unlocked: [], medals: s.medals, best: s.best, runs: s.runs
    }).then(function (r) {
      syncing = false;
      if (r && r.ok) { cloudOk = true; setCloud("已同步"); if (first) pullCloud(); else pullCloud(); }
      else { cloudOk = false; setCloud(r && r.offline ? "离线可玩" : "同步失败", true); }
    });
  }
  function pullCloud() {
    if (!cloudOk) return;
    GkCloud.load(Save.playerId()).then(function (r) {
      if (!r || !r.ok || !r.data) return;
      if (r.data.found) { Save.mergeCloud(r.data); renderMenu(); }
      var delta = Progress.syncDelta();
      if (delta > 0) {
        GkCloud.seasonAdd(Progress.season().id, Save.playerId(), Save.nick(), delta).then(function (sr) {
          if (sr && sr.ok) Progress.markSynced();
        });
      }
    });
  }

  /* ================= 面板 ================= */
  function openPanel(title, html) {
    $("panelTitle").textContent = title;
    $("panelBody").innerHTML = html;
    $("panel").classList.remove("hidden");
  }
  function closePanel() { $("panel").classList.add("hidden"); }

  function openLb(sceneId, diffId) {
    sceneId = sceneId || sel.scene; diffId = diffId || sel.diff;
    var key = Config.modeKey(sceneId, diffId);
    var tabs = '<div class="mode-tabs">' + Config.DIFFS.map(function (d) {
      return '<button class="' + (d.id === diffId ? "on" : "") + '" data-d="' + d.id + '">' + d.icon + " " + esc(d.name) + "</button>";
    }).join("") + '</div>';
    var sceneTabs = '<div class="mode-tabs">' + Config.SCENES.map(function (s) {
      return '<button class="' + (s.id === sceneId ? "on" : "") + '" data-sc="' + s.id + '">' + s.icon + " " + esc(s.name) + "</button>";
    }).join("") + '</div>';
    openPanel("排行榜 · " + esc(Config.modeLabel(sceneId, diffId)), sceneTabs + tabs + '<div id="lbList">加载中…</div>');
    bindTabs(function (sc, df) { openLb(sc, df); });
    GkCloud.lb(key, 30).then(function (r) {
      var box = $("lbList");
      if (!box) return;
      if (!r || !r.ok) { box.innerHTML = '<p class="tip">排行榜暂时不可用（云端未连接，稍后再试）。</p>'; return; }
      var rows = r.rows || [];
      if (!rows.length) { box.innerHTML = '<p class="tip">这个模式还没有人上榜，去抢第一名。</p>'; return; }
      box.innerHTML = rows.map(function (x, i) {
        return '<div class="rank-row ' + (i < 3 ? "top" + (i + 1) : "") + '"><div class="no">' + (i + 1) + '</div>' +
          '<div class="nm">' + esc(x.nickname) + '<div class="sub">第 ' + (x.wave || 0) + ' 波 · 评级 ' + esc(x.grade || "-") + '</div></div>' +
          '<div class="sc">' + (x.score || 0) + '</div></div>';
      }).join("");
    });
  }
  function bindTabs(redo) {
    var body = $("panelBody");
    body.querySelectorAll("[data-d]").forEach(function (b) {
      b.onclick = function () {
        var sc = body.querySelector("[data-sc].on");
        redo(sc ? sc.getAttribute("data-sc") : sel.scene, b.getAttribute("data-d"));
      };
    });
    body.querySelectorAll("[data-sc]").forEach(function (b) {
      b.onclick = function () {
        var df = body.querySelector("[data-d].on");
        redo(b.getAttribute("data-sc"), df ? df.getAttribute("data-d") : sel.diff);
      };
    });
  }

  function openSeason() {
    var se = Progress.season();
    var html = '<p>本赛季：<b>' + esc(se.name) + '</b>　当前积分 <b style="color:#ffd24a">' + se.points + '</b>　已打 ' + se.runs + ' 局</p>' +
      '<p class="tip">积分按成绩与难度换算（地狱难度 ×2），每月 1 日重置。</p>';
    html += se.tiers.map(function (t) {
      return '<div class="tier-row"><div style="flex:1">' + t.icon + " <b>" + esc(t.name) + '</b> · ' + t.p + ' 分　<span class="tip">奖励 ' + t.coins + ' 金币</span></div>' +
        (t.claimed ? '<button disabled>已领取</button>' : t.got ? '<button data-p="' + t.p + '">领取</button>' : '<button disabled>未达成</button>') +
        '</div>';
    }).join("");
    html += '<h3 style="margin:14px 0 6px;font-size:14px">赛季榜</h3><div id="seasonList">加载中…</div>';
    openPanel("赛季", html);
    $("panelBody").querySelectorAll("[data-p]").forEach(function (b) {
      b.onclick = function () {
        var got = Progress.claimTier(Number(b.getAttribute("data-p")));
        if (got) { showToast("领取成功，+" + got + " 金币"); renderMenu(); openSeason(); }
      };
    });
    GkCloud.seasonLb(se.id, 30).then(function (r) {
      var box = $("seasonList");
      if (!box) return;
      if (!r || !r.ok) { box.innerHTML = '<p class="tip">赛季榜暂时不可用。</p>'; return; }
      var rows = r.rows || [];
      if (!rows.length) { box.innerHTML = '<p class="tip">本赛季还没有人上榜。</p>'; return; }
      box.innerHTML = rows.map(function (x, i) {
        return '<div class="rank-row ' + (i < 3 ? "top" + (i + 1) : "") + '"><div class="no">' + (i + 1) + '</div>' +
          '<div class="nm">' + esc(x.nickname) + '</div><div class="sc">' + (x.points || 0) + ' 分</div></div>';
      }).join("");
    });
  }

  function openMedals() {
    var ids = Progress.medalIds();
    var html = '<p class="tip">已解锁 ' + ids.length + " / " + Progress.MEDALS.length + ' 枚</p><div class="medal-grid">' +
      Progress.MEDALS.map(function (m) {
        var got = ids.indexOf(m.id) >= 0;
        return '<div class="medal-card' + (got ? " got" : "") + '"><div class="mi">' + (got ? m.icon : "🔒") + '</div>' +
          '<div class="mn">' + esc(m.name) + '</div><div class="md">' + esc(m.desc) + "</div></div>";
      }).join("") + "</div>";
    openPanel("勋章墙", html);
  }

  function openDaily() {
    var d = Progress.daily();
    var html = '<p class="tip">每天 0 点刷新 3 条任务，全部完成额外奖励 180 金币。</p>';
    html += d.items.map(function (it) {
      var pct = Math.min(100, Math.round(it.prog / it.target * 100));
      return '<div class="task-row"><div class="tt">' + esc(it.text) +
        '<div class="tp">进度 ' + Math.round(it.prog) + " / " + it.target + "　奖励 " + it.reward + ' 金币</div></div>' +
        (it.claimed ? '<button disabled>已领取</button>' : it.done ? '<button data-t="' + it.id + '">领取</button>' : '<button disabled>' + pct + '%</button>') +
        "</div>";
    }).join("");
    openPanel("每日任务", html);
    $("panelBody").querySelectorAll("[data-t]").forEach(function (b) {
      b.onclick = function () {
        var r = Progress.claim(b.getAttribute("data-t"));
        if (r) { showToast("领取成功，+" + (r.got + r.bonus) + " 金币" + (r.bonus ? "（含全清奖励）" : "")); renderMenu(); openDaily(); }
      };
    });
  }

  function openHelp() {
    openPanel("操作说明", [
      "<p><b>移动</b>：WASD / 方向键；手机为在画面上拖动（虚拟摇杆）。</p>",
      "<p><b>切换守门人</b>：空格 或 E；手机为右下角按钮。</p>",
      "<p><b>暂停 / 静音</b>：P / M。</p>",
      "<h3 style='margin:12px 0 6px;font-size:14px'>核心规则</h3>",
      "<p>火娃融化冰魔、水娃蚀穿岩魔，<b>打错对象完全免疫</b>——先看清这波主什么魔再切人。</p>",
      "<p>击杀掉落的宝石会缀成跟屁虫尾巴；每波只有<b>一扇门亮灯</b>，把尾巴带到亮灯的门上才算结算，<b>走错门宝石全部吐光</b>。</p>",
      "<p>尾巴越长结算加成越高，但被魔物撞到会断尾——贪心要适度。</p>",
      "<p>每 5 波出现巨像，血量下降时<b>弱点会中途变换</b>，得跟着切人。</p>",
      "<h3 style='margin:12px 0 6px;font-size:14px'>联机对战</h3>",
      "<p>建房得 4 位房间码，好友输入即可加入。双方各守自己的城门，用互坑手段互相捣乱：派精英怪、冰封、空投炸弹、自加护盾。每 15 秒获得 1 点互坑点（上限 3）。</p>"
    ].join(""));
  }

  /* ================= 联机 ================= */
  function openLobby() {
    $("lobbyStatus").innerHTML = Net.available() ? "" : '<span style="color:#ff9a8f">云端通道不可用，请检查网络后重试。</span>';
    $("joinCode").value = "";
    show("lobby");
  }
  function netHooks() {
    return {
      onStatus: function (o) {
        if (o.type === "points") { updateDuelBar(); return; }
        if (o.type === "warn") { showToast(o.message); return; }
        if (o.type === "sync") {
          var st = Net.state();
          if (st && st.hasPeer && !inDuel) {
            /* 房主等待时发现对手进场 → 自动开局 */
            startDuel(st.role === "host" ? "host" : "guest");
          }
        }
      },
      onPeer: function (ps) { Game.applyPeer(ps); },
      onEvent: function (kind, payload) { Game.inject(kind, payload); }
    };
  }
  function doHost() {
    $("lobbyStatus").innerHTML = "正在创建房间…";
    Net.host(Save.nick()).then(function (r) {
      if (!r.ok) { $("lobbyStatus").textContent = r.message || "创建失败"; return; }
      $("lobbyStatus").innerHTML = "房间已创建，把房间码发给好友：<div class='code'>" + r.code + "</div>等待对手加入…";
      Net.begin(netHooks());
    });
  }
  function doJoin() {
    var code = ($("joinCode").value || "").trim().toUpperCase();
    if (code.length !== 4) { $("lobbyStatus").textContent = "请输入 4 位房间码"; return; }
    $("lobbyStatus").textContent = "正在加入…";
    Net.join(code, Save.nick()).then(function (r) {
      if (!r.ok) { $("lobbyStatus").textContent = r.message || "加入失败"; return; }
      startDuel(r.role);
      Net.begin(netHooks());
    });
  }
  function startDuel(role) {
    inDuel = true;
    hideAll();
    Game.start(sel.scene, sel.diff, { duel: true, side: role });
    $("duelBar").classList.remove("hidden");
    var st = Net.state();
    $("duelRoom").textContent = "房间 " + (st ? st.code : "----");
    renderImpairs();
    updateDuelBar();
  }
  function renderImpairs() {
    var box = $("duelImpairs");
    box.innerHTML = Net.IMPAIRS.map(function (m) {
      return '<button class="imp-btn' + (m.kind === "shield" ? " shield" : "") + '" data-k="' + m.kind + '" title="' + esc(m.desc) + '">' +
        m.icon + " " + esc(m.name) + "</button>";
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".imp-btn"), function (b) {
      b.onclick = function () {
        var k = b.getAttribute("data-k");
        Net.push(k, {}, k === "shield").then(function (r) {
          if (!r.ok) { showToast(r.reason === "no_point" ? "互坑点不够，每 15 秒回 1 点" : "发送失败，稍后再试"); updateDuelBar(); return; }
          if (k === "shield") Game.inject("shield", {});
          else showToast("已发动：" + (Net.IMPAIRS.filter(function (m) { return m.kind === k; })[0] || {}).name);
          updateDuelBar();
        });
      };
    });
  }
  function updateDuelBar() {
    var st = Net.state();
    $("duelPts").textContent = "互坑点 " + (st ? st.points : 0) + " / 3";
    Array.prototype.forEach.call($("duelImpairs").querySelectorAll(".imp-btn"), function (b) {
      b.disabled = !st || st.points <= 0;
    });
  }

  /* ================= 事件绑定 ================= */
  function bind() {
    $("btn-start").onclick = startSolo;
    $("btn-again").onclick = function () { if (inDuel) { show("lobby"); } else startSolo(); };
    $("btn-menu").onclick = function () { Game.quit(); if (inDuel) { Net.stop(); inDuel = false; $("duelBar").classList.add("hidden"); } renderMenu(); show("menu"); };
    $("btn-resume").onclick = function () { Game.togglePause(); };
    $("btn-quit").onclick = function () { Game.quit(); $("pauseLayer").classList.add("hidden"); if (inDuel) { Net.stop(); inDuel = false; $("duelBar").classList.add("hidden"); } renderMenu(); show("menu"); };
    $("btn-duel").onclick = openLobby;
    $("btn-host").onclick = doHost;
    $("btn-join").onclick = doJoin;
    $("btn-lobby-close").onclick = function () { Net.stop(); show("menu"); };
    $("btn-lb").onclick = function () { openLb(); };
    $("btn-season").onclick = openSeason;
    $("btn-medal").onclick = openMedals;
    $("btn-daily").onclick = openDaily;
    $("btn-help").onclick = openHelp;
    $("btn-sound").onclick = function () {
      var m = !Game.isMuted();
      Game.setMuted(m);
      Save.get().sound = !m; Save.save();
      $("btn-sound").textContent = m ? "🔇 已静音" : "🔊 音效";
    };
    $("btn-nick").onclick = function () {
      var cur = Save.nick();
      var n = prompt("给自己起个昵称（最多 12 字）", cur === "匿名守门人" ? "" : cur);
      if (n === null) return;
      Save.setNick(n);
      renderMenu(); syncCloud(false);
      showToast("昵称已更新：" + Save.nick());
    };
    $("btn-cloud").onclick = function () { syncCloud(false); showToast("正在同步云端存档…"); };
    $("panelClose").onclick = closePanel;
    $("panel").onclick = function (e) { if (e.target === $("panel")) closePanel(); };
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!$("panel").classList.contains("hidden")) closePanel();
      }
    });
    window.addEventListener("beforeunload", function () { if (inDuel) Net.stop(); });
  }

  /* ================= 启动 ================= */
  Game.mount(cv);
  Game.onOver(onOver);
  Game.onPause(function (p) { $("pauseLayer").classList.toggle("hidden", !p); });
  Sprites.preload(Config.SCENES.map(function (s) { return s.id; }));
  if (!Save.get().sound) { Game.setMuted(true); $("btn-sound").textContent = "🔇 已静音"; }
  renderMenu();
  bind();
  syncCloud(true);
  /* 云同步要等两件事：① 门卫 iframe 握手完成（否则 bridge 秒回 gate:error）；
     ② 会话镜像回灌父页（登录用户刷新后，会话先存在 iframe 侧，SDK 首次写存储时
     才镜像到一级域 localStorage，比 ready 晚几秒）。这里轮询等齐后再补一次同步，
     匿名用户则保持「离线可玩」不发起无谓请求。 */
  (function waitSync(n) {
    if (!window.ZHZBridge || typeof window.ZHZBridge.ready !== "function") return;
    if (!window.ZHZBridge.ready()) { if (n < 40) setTimeout(function () { waitSync(n + 1); }, 500); return; }
    var sess = null;
    try { sess = window.ZHZBridge.session(); } catch (e) {}
    if (sess) { syncCloud(false); return; }
    if (n < 40) setTimeout(function () { waitSync(n + 1); }, 800);
  })(0);
  requestAnimationFrame(loop);

  /* 供自动化测试读取 */
  window.__GKUI = { sel: sel, save: Save, game: Game, net: Net, progress: Progress, config: Config };
})();
