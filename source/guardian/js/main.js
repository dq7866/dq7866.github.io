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
  var SCREENS = ["menu", "over", "pauseLayer", "lobby", "guide"];
  var sel = { scene: "frost", diff: "normal" };
  var lastTs = 0, menuT = 0, cloudOk = false, syncing = false, inDuel = false;
  var dailyRun = null;      // 当前进行的每日挑战配置（非挑战局为 null）
  var lastReport = "";      // 最近一局的战报文本（复制用）
  /* 触摸设备（手机 / 平板）：显示局内触摸控件（切换守门人 / 暂停） */
  var touchUI = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

  /* ================= 横竖屏自适应 =================
     游戏按横屏（3:2）设计。手机竖屏时（很多人还开着竖屏锁定，浏览器永远是竖屏）
     画面会被压成一条小横条，所以这里给 <html> 挂 rot90：CSS 把 --vw/--vh 互换
     并把 #stage 整体旋转 90°，竖屏设备上自动得到横屏版面；玩家把手机横过来
     则自动恢复正常方向。桌面端和横屏手机不受影响。 */
  var hintT1 = null, hintT2 = null, fitT = null;
  function portraitLike() { return window.innerHeight > window.innerWidth; }
  function fitViewport() {
    var rot = touchUI && portraitLike() && Math.min(window.innerWidth, window.innerHeight) <= 820;
    var root = document.documentElement;
    var was = root.classList.contains("rot90");
    root.classList.toggle("rot90", rot);
    if (rot && !was) {
      root.classList.remove("fade");
      root.classList.add("hint");
      clearTimeout(hintT1); clearTimeout(hintT2);
      hintT1 = setTimeout(function () { root.classList.add("fade"); }, 4200);
      hintT2 = setTimeout(function () { root.classList.remove("hint", "fade"); }, 5200);
    } else if (!rot) {
      clearTimeout(hintT1); clearTimeout(hintT2);
      root.classList.remove("hint", "fade");
    }
    updateFsBtn();
  }
  function scheduleFit() { clearTimeout(fitT); fitT = setTimeout(fitViewport, 90); }

  /* ---- 全屏 / 横屏锁定（尽力而为，失败静默） ---- */
  function fsEl() { return document.documentElement; }
  function canFullscreen() { var e = fsEl(); return !!(e.requestFullscreen || e.webkitRequestFullscreen); }
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function afterFs() { if (touchUI) lockLandscape(); else updateFsBtn(); }
  function requestFs() {
    var e = fsEl();
    try {
      var p = (e.requestFullscreen || e.webkitRequestFullscreen).call(e, { navigationUI: "hide" });
      if (p && p.then) p.then(afterFs, afterFs);
      else afterFs();
    } catch (err) { afterFs(); }
  }
  function lockLandscape() {
    try {
      var o = screen.orientation || screen.mozOrientation;
      if (o && o.lock) { var r = o.lock("landscape"); if (r && r.catch) r.catch(function () {}); }
    } catch (err) {}
    updateFsBtn();
  }
  function toggleFullscreen() {
    if (isFullscreen()) {
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (err) {}
    } else requestFs();
    setTimeout(updateFsBtn, 120);
  }
  function updateFsBtn() {
    var b = $("btn-fs"); if (!b) return;
    var on = isFullscreen();
    /* 桌面和手机都显示；浏览器不支持元素全屏（iPhone Safari）时才隐藏，
       免得留下一个点了没反应的按钮。 */
    if (!canFullscreen()) { b.classList.add("hidden"); return; }
    b.classList.remove("hidden");
    b.textContent = on ? "⛶ 退出全屏" : "⛶ 全屏";
    /* 触摸栏里的全屏键（游戏中用，风格与 🔄切换 / ⏸ 一致） */
    var t = $("tb-fs");
    if (t) { t.innerHTML = "⛶<i>" + (on ? "退出" : "全屏") + "</i>"; t.title = on ? "退出全屏" : "全屏显示"; }
  }
  /* 竖屏点「开始守门」时：直接请求全屏并锁横屏（Android Chrome 有效；
     iOS Safari 不支持则退回 rot90 旋转显示，照样能玩） */
  function goLandscape() {
    if (!touchUI || !portraitLike()) return;
    if (isFullscreen()) lockLandscape(); else requestFs();
  }

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

  /* 触摸设备才显示局内触摸控件（切换守门人 / 暂停） */
  function showTouch(on) {
    if (!touchUI) return;
    $("touchBar").classList.toggle("hidden", !on);
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
    var ch = Config.dailyChallenge(), chDone = Progress.dailyChallengeDone();
    $("m-dailych").textContent = chDone ? "✓ 今日已完成" : ch.modIcon + " " + ch.modName;
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
    dailyRun = null;
    hideAll();
    $("duelBar").classList.add("hidden");
    showTouch(true);
    goLandscape();
    Game.start(sel.scene, sel.diff, { duel: false });
  }
  /* 每日挑战：按日期种子固定场景 / 难度 / 机制，绕开解锁限制，成绩进独立日榜。
     注意不要改 sel —— 否则玩完挑战回到菜单，玩家自己选的战场会被偷偷换掉。 */
  function startDaily() {
    var ch = Config.dailyChallenge();
    inDuel = false;
    dailyRun = ch;
    hideAll();
    $("duelBar").classList.add("hidden");
    showTouch(true);
    goLandscape();
    Game.start(ch.scene, ch.diff, { daily: true, perk: ch.mod, modeKey: ch.key });
    showToast("每日挑战开始：" + ch.modIcon + " " + ch.modName);
  }
  function onOver(d) {
    var S = d.S;
    $("overTitle").textContent = d.reason || "城门失守";
    $("overGrade").textContent = Game.gradeOf(S);
    $("overStat").textContent = "本局 " + S.score + " 分　撑到第 " + S.wave + " 波　结算宝石 " + S.gemBanked + " 颗";
    /* 补充战绩：时长 / 击杀 / 最长尾巴 */
    var mins = Math.floor(S.t / 60), secs = Math.floor(S.t % 60);
    $("overExtra").textContent = "本局时长 " + (mins ? mins + " 分 " : "") + secs + " 秒　·　击杀 " + S.kills +
      " 只（精英 " + S.elites + " · 巨像 " + S.bosses + "）　·　最长尾巴 " + (S.maxTail || 0) + " 颗";

    var extraReward = "";
    if (S.daily) {
      var bonus = Progress.claimDailyChallenge();
      extraReward = '<br>🎯 今日挑战完成' + (bonus ? '，额外奖励 <b>' + bonus + "</b> 金币（明天再来）" : "（今日奖励已领过）");
    }
    $("overRewards").innerHTML = "经验 <b>+" + d.res.xp + "</b>　金币 <b>+" + d.res.coins + "</b>　赛季积分 <b>+" + d.res.points + "</b>" +
      (d.isBest ? '　·　<span style="color:#ffd24a">刷新本模式纪录！</span>' : "") +
      extraReward +
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
    /* 战报文本（复制分享用） */
    lastReport = "【冰火守门人】" + (S.daily ? Config.dailyChallenge().date + " 每日挑战 · " : "") +
      Config.modeLabel(S.sc.id, S.df.id) + "　评级 " + Game.gradeOf(S) + "　" + S.score + " 分 · 第 " + S.wave + " 波 · " +
      "击杀 " + S.kills + " 只 · 结算宝石 " + S.gemBanked + " 颗　https://dq7866.online/guardian/";
    show("over");
    showTouch(false);
    if (inDuel) { showToast("对战结束，成绩已记录"); }
    submitScore();
    syncCloud(false);
    pullCloud();
  }

  function submitScore() {
    var g = Game.state();
    if (!g || !cloudOk) return;
    var mode = g.modeKey || Config.modeKey(g.sc.id, g.df.id);
    GkCloud.submit({
      mode: mode, player: Save.playerId(), nick: Save.nick(),
      score: g.score, wave: g.wave, grade: Game.gradeOf(g)
    }).then(function (r) {
      if (r && r.ok && r.isBest && r.rank) showToast("云端榜第 " + r.rank + " 名！");
    });
  }

  /* 复制战报：优先用剪贴板 API，失败退回 textarea 选中法 */
  function shareReport() {
    if (!lastReport) { showToast("先打完一局再来分享"); return; }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = lastReport;
        ta.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        showToast(ok ? "战报已复制，去粘贴分享吧" : "复制失败，请手动截图");
      } catch (e) { showToast("复制失败，请手动截图"); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastReport).then(function () { showToast("战报已复制，去粘贴分享吧"); }, fallback);
    } else fallback();
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
      var myId = Save.playerId(), myRank = 0;
      var list = rows.map(function (x, i) {
        var me = (x.player_id || x.playerId) === myId;
        if (me && !myRank) myRank = i + 1;
        return '<div class="rank-row ' + (i < 3 ? "top" + (i + 1) : "") + (me ? " me" : "") + '"><div class="no">' + (i + 1) + '</div>' +
          '<div class="nm">' + esc(x.nickname) + (me ? '<span class="tagme">我</span>' : "") +
          '<div class="sub">第 ' + (x.wave || 0) + ' 波 · 评级 ' + esc(x.grade || "-") + '</div></div>' +
          '<div class="sc">' + (x.score || 0) + '</div></div>';
      }).join("");
      box.innerHTML = (myRank ? '<p class="tip">你在本榜暂列第 <b style="color:#ffd24a">' + myRank + "</b> 名</p>" : "") + list;
    });
  }
  /* 独立打开某个模式的榜（每日挑战用） */
  function openLbKey(key, label) {
    openPanel("排行榜 · " + esc(label), '<div id="lbList">加载中…</div>');
    GkCloud.lb(key, 30).then(function (r) {
      var box = $("lbList");
      if (!box) return;
      if (!r || !r.ok) { box.innerHTML = '<p class="tip">排行榜暂时不可用（云端未连接，稍后再试）。</p>'; return; }
      var rows = r.rows || [];
      if (!rows.length) { box.innerHTML = '<p class="tip">今天还没有人完成，你可以抢第一个。</p>'; return; }
      var myId = Save.playerId(), myRank = 0;
      var list = rows.map(function (x, i) {
        var me = (x.player_id || x.playerId) === myId;
        if (me && !myRank) myRank = i + 1;
        return '<div class="rank-row ' + (i < 3 ? "top" + (i + 1) : "") + (me ? " me" : "") + '"><div class="no">' + (i + 1) + '</div>' +
          '<div class="nm">' + esc(x.nickname) + (me ? '<span class="tagme">我</span>' : "") +
          '<div class="sub">第 ' + (x.wave || 0) + ' 波 · 评级 ' + esc(x.grade || "-") + '</div></div>' +
          '<div class="sc">' + (x.score || 0) + '</div></div>';
      }).join("");
      box.innerHTML = (myRank ? '<p class="tip">你在本榜暂列第 <b style="color:#ffd24a">' + myRank + "</b> 名</p>" : "") + list;
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
      var myId = Save.playerId(), myRank = 0;
      var list = rows.map(function (x, i) {
        var me = (x.player_id || x.playerId) === myId;
        if (me && !myRank) myRank = i + 1;
        return '<div class="rank-row ' + (i < 3 ? "top" + (i + 1) : "") + (me ? " me" : "") + '"><div class="no">' + (i + 1) + '</div>' +
          '<div class="nm">' + esc(x.nickname) + (me ? '<span class="tagme">我</span>' : "") + '</div>' +
          '<div class="sc">' + (x.points || 0) + ' 分</div></div>';
      }).join("");
      box.innerHTML = (myRank ? '<p class="tip">你本赛季暂列第 <b style="color:#ffd24a">' + myRank + "</b> 名</p>" : "") + list;
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
    var H = "margin:15px 0 6px;font-size:14px";
    var tiltOn = Game.tilt.on();
    var isAPK = Game.tilt.host() === "apk";
    openPanel("操作说明", [
      "<p class='tip'>摇摆手机 · 键盘 · 鼠标 · 触屏 —— 手上有什么就用什么，几种方式自动共存，不用做任何设置。</p>",

      "<h3 style='" + H + "'>📱 手机 · 摇摆操控" + (isAPK ? "（本版主打）" : "（推荐）") + "</h3>",
      "<p>把手机<b>横着握起来，左右摆动</b>，守门人就往那边走 —— 摆得越狠走得越快，<b>拿平就停下</b>，像开车打方向盘。不用一直按着屏幕，躺着单手也能玩。</p>",
      "<p class='tip'>画面底边有一条<b>倾斜指示条</b>：中间那截亮的是<b>死区</b>（轻微晃动不会动，防手抖），滑块往哪边跑，人就在往哪边走。<br>四个要点：手机要<b>立起来握</b>（平放桌上没有信号）；方向反了按「反向」；拿着别扭按「校准」，把<b>当前姿势</b>设成中位；长时间不动时中位会<b>自动跟随</b>——换个姿势接着玩，不用重新校准。</p>",
      "<p><button class='btn-ghost' id='btn-tilt'>" + (tiltOn ? "关闭摇摆操控" : "开启摇摆操控") + "</button>" +
        (tiltOn ? " <button class='btn-ghost' id='btn-tilt-inv'>反向：" + (Game.tilt.inv() ? "开" : "关") + "</button>" +
                  " <button class='btn-ghost' id='btn-tilt-cal'>校准中位</button>" : "") + "</p>",
      (tiltOn ? "<p>灵敏度：" + Game.tilt.fulls().map(function (v) {
                  var nm = v <= 10 ? "灵敏" : v >= 20 ? "稳健" : "标准";
                  return "<button class='btn-ghost' data-tf='" + v + "'" +
                    (Math.abs(Game.tilt.full() - v) < 0.5 ? " style='border-color:#ffd9a8;color:#ffd9a8'" : "") +
                    ">" + nm + "</button>";
                }).join(" ") +
                "　<b>灵敏</b>＝轻轻一歪就走；<b>稳健</b>＝要歪得明显才走。</p>" : ""),
      (tiltOn && Game.tilt.avail() ? "" :
        (tiltOn ? "<p class='tip'>正在等传感器数据……如果一直没反应，说明这台设备没有重力传感器，可改用下面的触屏操作。</p>" : "")),

      "<h3 style='" + H + "'>📱 手机 · 触屏（不想晃手机就用这个）</h3>",
      "<p><b>按住拖动</b>：虚拟摇杆，按下点为圆心拖，拖多远走多快。</p>",
      "<p><b>轻点画面</b>：点哪走哪 —— 守门人自己走过去，画面上有脉动目标圈和虚线引导。</p>",
      "<p><b>右下角按钮</b>：🔄 切换守门人、⏸ 暂停</p>",
      (isAPK ? "" : "<p><b>全屏</b>：点画面右上角的 ⛶ 按钮；或从浏览器菜单选「添加到主屏幕」，之后像 App 一样全屏打开。</p>"),

      "<h3 style='" + H + "'>🖥 电脑 · 键盘</h3>",
      "<p><b>移动</b>：<b>W A S D</b> 或 <b>↑ ↓ ← →</b></p>",
      "<p><b>切换守门人</b>：<b>空格</b> 或 <b>E</b>　｜　<b>暂停</b>：<b>P</b>　｜　<b>静音</b>：<b>M</b>　｜　<b>从暂停恢复</b>：<b>Esc</b></p>",

      "<h3 style='" + H + "'>🖱 电脑 · 鼠标</h3>",
      "<p><b>左键按住拖动</b>：在战场上拖出虚拟摇杆，拖多远走多快。</p>",
      "<p><b>左键单击</b>：点哪走哪——守门人会自己走到你点的位置，画面上会出现脉动的目标圈和虚线引导。</p>",

      "<h3 style='" + H + "'>🎮 玩法规则</h3>",
      "<p><b>自动开火</b>：你只管走位，守门人自己打最近的目标。</p>",
      "<p><b>元素相克</b>：火娃融化冰魔、水娃蚀穿岩魔，<b>打错对象完全免疫</b>——先看清这波主什么魔再切人。</p>",
      "<p><b>宝石尾巴</b>：击杀掉落的宝石会缀成跟屁虫尾巴，<b>越长结算加成越高</b>；但被魔物撞到会断尾，贪心要适度。</p>",
      "<p><b>结算</b>：每波只有<b>一扇门亮灯</b>，把尾巴带到亮灯的门上才算结算，<b>走错门宝石全部吐光</b>。</p>",
      "<p><b>巨像</b>：每 5 波出现一次，血量下降时<b>弱点会中途变换</b>，得跟着切人。</p>",
      "<p><b>每日挑战</b>：每天 0 点换一套固定条件（场景 + 难度 + 特殊机制），全世界同一天面对同一关，成绩进独立日榜。</p>",
      (isAPK ? "" : "<p><b>联机对战</b>：建房得 4 位房间码，好友输入即可加入；双方各守城门，用派精英怪、冰封、空投炸弹互相干扰。</p>"),

      "<h3 style='" + H + "'>🚫 本游戏不支持</h3>",
      "<p>手柄、鼠标右键与滚轮、摄像头体感、语音操作；手机<b>平放在桌面上</b>时摇摆操控无效（没有倾斜信号）。</p>",

      "<h3 style='" + H + "'>📴 离线与安装</h3>",
      (isAPK ? "<p>本版本是安卓应用，<b>完全离线运行</b>，不联网、也不需要任何权限；进度存在本机，卸载会一并清空。</p>"
             : "<p>游戏可离线运行；手机上按上面的方法「添加到主屏幕」即可全屏打开。</p>"),
      "<p style='margin-top:12px'><button class='btn-ghost' id='btn-replay-guide'>重新看一遍新手引导</button></p>"
    ].join(""));
    var rg = $("btn-replay-guide");
    if (rg) rg.onclick = function () { closePanel(); openGuide(); };
    var bt = $("btn-tilt");
    if (bt) bt.onclick = function () { Game.tilt.set(!Game.tilt.on()); openHelp(); };
    var bi = $("btn-tilt-inv");
    if (bi) bi.onclick = function () { Game.tilt.setInv(!Game.tilt.inv()); openHelp(); };
    var bc = $("btn-tilt-cal");
    if (bc) bc.onclick = function () { Game.tilt.cal(); openHelp(); };
    $("panelBody").querySelectorAll("[data-tf]").forEach(function (b) {
      b.onclick = function () {
        Game.tilt.setFull(parseFloat(b.getAttribute("data-tf")));
        openHelp();
      };
    });
  }

  /* ================= 每日挑战 ================= */
  function openDailyChallenge() {
    var ch = Config.dailyChallenge(), done = Progress.dailyChallengeDone();
    var html = '<p class="tip">每天 0 点换一套固定条件，全世界同一天面对同一关；成绩进独立日榜，首次完成额外奖励 ' +
      Progress.DAILY_REWARD + ' 金币。已完成的次数：<b>' + (Save.get().dailyChDone || 0) + "</b> 次。</p>" +
      '<div class="lobby-card" style="margin:12px 0">' +
      '<h3>' + ch.sceneIcon + " " + esc(ch.sceneName) + "　" + ch.diffIcon + " " + esc(ch.diffName) +
      (done ? '　<span style="color:#9fdc9f">今日已完成 ✓</span>' : "") + "</h3>" +
      '<p><b>特殊机制：' + ch.modIcon + " " + esc(ch.modName) + "</b><br>" + esc(ch.modDesc) + "</p>" +
      '<p class="tip">日期 ' + ch.date + "（每日挑战不受场景 / 难度解锁限制）</p>" +
      "</div>" +
      '<div class="btnrow"><button class="btn-main" id="btn-ch-start">开始挑战</button>' +
      '<button class="btn-ghost" id="btn-ch-lb">查看今日榜</button></div>';
    openPanel("每日挑战", html);
    $("btn-ch-start").onclick = function () { closePanel(); startDaily(); };
    $("btn-ch-lb").onclick = function () { openLbKey(ch.key, "每日挑战 " + ch.date); };
  }

  /* ================= 新手引导 ================= */
  var GUIDE_STEPS = [
    { icon: "🏃", html: "" },
    { icon: "🔥💧", html: "按 <b>空格 / E</b>（手机点右下角 <b>🔄</b>）<b>切换火娃与水娃</b>：火娃融冰魔、水娃蚀岩魔，<b>打错完全免疫</b>——先看清这波主什么魔！" },
    { icon: "🚪", html: "击杀掉落的宝石缀成尾巴。<b>每波只有一扇门亮灯</b>，把尾巴带到亮门上才算结算，<b>走错门宝石全吐</b>。尾巴越长加成越高，但被撞会断——贪心要适度。" },
    { icon: "🎯", html: "" }
  ];
  /* 引导第 1 / 第 4 步随「摇摆操控」开关动态生成：
     开着就直接教摇摆（安卓版默认开，一进游戏就该知道怎么走），
     关着则介绍键盘 / 拖动 / 轻点，并把摇摆留在最后当进阶玩法。 */
  function guideSync() {
    var on = Game.tilt.on();
    GUIDE_STEPS[0].html = on
      ? "把手机<b>横着握起来、左右摆动</b>，守门人就往那边走 —— 摆得越狠走得越快，<b>拿平就停下</b>。画面底边的<b>倾斜指示条</b>会实时告诉你倾了多少。不想晃手机也行：<b>按住拖动</b>当摇杆、<b>轻点画面</b>点哪走哪。守门人<b>自动开火</b>，你只管走位。"
      : "移动有三种方式，随便挑一种：电脑按 <b>WASD / 方向键</b>；鼠标或手指<b>按住拖动</b>就是虚拟摇杆；<b>轻点画面任意位置</b>则点哪走哪。守门人<b>自动开火</b>——你只管走位。";
    GUIDE_STEPS[3].html = on
      ? "方向反了就按「反向」；拿着别扭按「校准」把<b>当前姿势</b>设成中位；灵敏度可在「操作说明」里调成 <b>灵敏 / 标准 / 稳健</b>。手机<b>立起来握</b>才有效，平放在桌上没有倾斜信号。"
      : "想躺着玩？在「操作说明」里打开<b>摇摆操控</b>，手机横屏<b>左右摆动</b>就能走，摆得越狠走得越快。手机要立起来握，平放无效；方向反了按「反向」。";
  }
  var guideIdx = 0;
  function renderGuide() {
    var st = GUIDE_STEPS[guideIdx];
    $("guideBody").innerHTML = '<span class="gicon">' + st.icon + "</span>" + st.html;
    $("guideDots").innerHTML = GUIDE_STEPS.map(function (_, i) {
      return '<i class="' + (i === guideIdx ? "on" : "") + '"></i>';
    }).join("");
    $("btn-guide-next").textContent = (guideIdx === GUIDE_STEPS.length - 1) ? "开始守门" : "下一步";
  }
  function openGuide() { guideIdx = 0; guideSync(); renderGuide(); show("guide"); }
  function closeGuide(goPlay) {
    Save.get().tutorial = true; Save.save();
    show("menu");
    if (goPlay) startSolo();
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
    dailyRun = null;
    hideAll();
    Game.start(sel.scene, sel.diff, { duel: true, side: role });
    $("duelBar").classList.remove("hidden");
    showTouch(true);
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
    $("btn-daily-ch").onclick = openDailyChallenge;
    $("btn-share").onclick = shareReport;
    $("btn-again").onclick = function () {
      if (inDuel) { show("lobby"); }
      else if (dailyRun) { startDaily(); }
      else startSolo();
    };
    $("btn-menu").onclick = function () {
      Game.quit(); showTouch(false);
      if (inDuel) { Net.stop(); inDuel = false; $("duelBar").classList.add("hidden"); }
      renderMenu(); show("menu");
    };
    $("btn-resume").onclick = function () { Game.togglePause(); };
    $("btn-quit").onclick = function () {
      Game.quit(); showTouch(false);
      $("pauseLayer").classList.add("hidden");
      if (inDuel) { Net.stop(); inDuel = false; $("duelBar").classList.add("hidden"); }
      renderMenu(); show("menu");
    };
    /* 触摸控件 */
    $("tb-switch").onclick = function () { Game.switchGuardian(); };
    $("tb-pause").onclick = function () { Game.togglePause(); };
    if ($("tb-fs")) $("tb-fs").onclick = toggleFullscreen;
    /* 新手引导 */
    $("btn-guide-next").onclick = function () {
      if (guideIdx < GUIDE_STEPS.length - 1) { guideIdx++; renderGuide(); }
      else closeGuide(true);
    };
    $("btn-guide-skip").onclick = function () { closeGuide(false); };
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
    $("btn-fs").onclick = toggleFullscreen;
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
  /* 横竖屏自适应：首次校准 + 方向/尺寸变化时重算（旋转、切前后台、地址栏收放都会触发） */
  fitViewport();
  window.addEventListener("orientationchange", scheduleFit);
  window.addEventListener("resize", scheduleFit);
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener("resize", scheduleFit);
  }
  if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener("change", scheduleFit);
  }
  document.addEventListener("fullscreenchange", scheduleFit);
  document.addEventListener("webkitfullscreenchange", scheduleFit);
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

  /* 首次进入：弹出 3 步新手引导（看完写 tutorial=true，之后不再打扰） */
  if (!Save.get().tutorial) setTimeout(function () { if (Game.scene() === "menu") openGuide(); }, 900);

  /* PWA：注册 Service Worker —— 首次访问后整站（含 3D 贴图）离线可用。
     file:// 直接打开时浏览器禁用 SW，此时静默跳过，游戏本体照常运行。 */
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () {});
    });
  }

  /* 供自动化测试读取 */
  window.__GKUI = { sel: sel, save: Save, game: Game, net: Net, progress: Progress, config: Config,
                    openGuide: openGuide, openDailyChallenge: openDailyChallenge, dailyRun: function () { return dailyRun; },
                    fitViewport: fitViewport, isLandscapeLock: function () { return document.documentElement.classList.contains("rot90"); } };
})();
