/* 风驰骑行 —— UI 状态机（菜单 / 车库 / 改装 / 排行榜 / 倒计时 / HUD / 结算 / 云同步） */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var selTrack = 0, selBike = 'commuter';
  var playing = false;
  var cloudState = 'idle';   // idle | ok | off

  /* ---------------- 车 ---------------- */
  var BIKES = [
    { id: 'commuter', name: '通勤单车', icon: '🚲', price: 0, lv: 1, tag: '稳 · 好上手', desc: '起步车：极速一般，但压得住' },
    { id: 'gravel', name: '砾石车', icon: '🚵', price: 900, lv: 2, tag: '全地形', desc: '铺装与土路通吃，抓地与速度均衡' },
    { id: 'road', name: '公路车', icon: '🚴', price: 1800, lv: 3, tag: '快 · 灵敏', desc: '极速最高、转向最灵，冲出路外代价大' },
    { id: 'mtb', name: '山地车', icon: '🏔️', price: 2600, lv: 4, tag: '稳 · 抓地强', desc: '湿滑与起伏路面最稳，掉速最少' },
    { id: 'ebike', name: '电助力车', icon: '⚡', price: 5200, lv: 6, tag: '极速 · 笨重', desc: '电机加持极速最高，但转向迟钝、雨天更飘' }
  ];

  /* ---------------- 改装件 ---------------- */
  var PARTS = [
    { id: 'tire', name: '轮胎', icon: '🛞', base: 260, desc: '抓地力 +：雨天更稳、出界掉速更轻' },
    { id: 'aero', name: '气动车架', icon: '🌪️', base: 320, desc: '风阻 −：极速上限提高' },
    { id: 'drive', name: '传动系统', icon: '⛓️', base: 300, desc: '踩踏更顺：起步加速更快' },
    { id: 'susp', name: '避震', icon: '🔧', base: 240, desc: '吸收颠簸：起伏路面掉速更少' },
    { id: 'brake', name: '刹车', icon: '🛑', base: 220, desc: '制动力 +：刹车距离更短' }
  ];
  var MAXLV = 5;
  function upCost(part, nextLv) { return Math.round(part.base * nextLv * (0.9 + 0.12 * nextLv) / 5) * 5; }

  function bikeOf(id) { for (var i = 0; i < BIKES.length; i++) if (BIKES[i].id === id) return BIKES[i]; return null; }
  function partOf(id) { for (var i = 0; i < PARTS.length; i++) if (PARTS[i].id === id) return PARTS[i]; return null; }

  function fmt(sec) {
    if (sec == null) return '--:--.-';
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function fmtMs(ms) { return fmt((ms || 0) / 1000); }

  /* ---------------- 菜单 ---------------- */
  function renderMenu() {
    var d = Save.get();
    $('m-coins').textContent = d.coins;
    $('m-dist').textContent = (d.totalDist / 1000).toFixed(1);
    $('m-level').textContent = Save.level();
    if ($('m-title')) $('m-title').textContent = Save.title();
    var li = Save.xpInLevel();
    $('m-xp').style.width = Math.min(100, li.cur / li.need * 100).toFixed(1) + '%';
    $('m-nick').textContent = d.nickname || '匿名骑手';
    $('btn-sensor').textContent = '体感转向：' + (d.sensorOn ? '开' : '关');

    // 赛季积分 + 每日任务徽标
    var ss = Progress.season();
    if ($('m-season')) $('m-season').textContent = '赛季 ' + ss.points + ' 分';
    var dl = Progress.daily();
    var dBadge = $('m-daily');
    if (dBadge) {
      dBadge.textContent = dl.done + '/' + dl.total;
      dBadge.className = 'dot' + (dl.ready ? ' ready' : (dl.done >= dl.total ? ' done' : ''));
    }

    var cloud = $('m-cloud');
    if (cloudState === 'ok') { cloud.textContent = '已同步'; cloud.parentNode.className = 'chip cloud ok'; }
    else if (cloudState === 'off') { cloud.textContent = '离线模式'; cloud.parentNode.className = 'chip cloud off'; }
    else { cloud.textContent = '连接中…'; cloud.parentNode.className = 'chip cloud'; }

    // 赛道
    var lv = Save.level();
    var th = '';
    for (var i = 0; i < Engine.TRACKS.length; i++) {
      var t = Engine.TRACKS[i], b = Save.bestOf(t.id);
      th += '<button class="card' + (i === selTrack ? ' on' : '') + '" data-t="' + i + '">' +
        '<div class="c-ico">' + t.icon + '</div>' +
        '<div class="c-main"><div class="c-name">' + t.name + ' <span style="opacity:.6;font-size:12px">' + t.diff + '</span></div>' +
        '<div class="c-sub">' + t.desc + '</div></div>' +
        '<div class="c-tag ' + (b ? 'good' : '') + '">' + (b ? '最佳 ' + fmt(b) : '未挑战') + '</div>' +
        '</button>';
    }
    $('m-tracks').innerHTML = th;

    // 车库
    var gh = '';
    for (var j = 0; j < BIKES.length; j++) {
      var bk = BIKES[j], own = Save.has(bk.id);
      var canLv = lv >= bk.lv;
      var tag;
      if (own) tag = '<div class="c-tag good">' + (bk.id === selBike ? '已选用' : '已拥有') + '</div>';
      else if (!canLv) tag = '<div class="c-tag lock">需 ' + bk.lv + ' 级</div>';
      else tag = '<div class="c-tag cost">💰 ' + bk.price + '</div>';
      gh += '<button class="card' + (bk.id === selBike ? ' on' : '') + (own || canLv ? '' : ' cant') + '" data-b="' + bk.id + '">' +
        '<div class="c-ico">' + bk.icon + '</div>' +
        '<div class="c-main"><div class="c-name">' + bk.name + ' <span style="opacity:.6;font-size:11.5px">' + bk.tag + '</span></div>' +
        '<div class="c-sub">' + bk.desc + '</div></div>' +
        tag + '</button>';
    }
    $('m-garage').innerHTML = gh;

    // 改装
    var uh = '';
    for (var k = 0; k < PARTS.length; k++) {
      var p = PARTS[k], lvl = Save.up(p.id);
      var pips = '<span class="pips">';
      for (var n = 0; n < MAXLV; n++) pips += '<i class="' + (n < lvl ? 'on' : '') + (n === MAXLV - 1 && lvl >= MAXLV ? ' max' : '') + '"></i>';
      pips += '</span>';
      var pt;
      if (lvl >= MAXLV) pt = '<div class="c-tag good">已满级</div>';
      else {
        var cost = upCost(p, lvl + 1), afford = d.coins >= cost;
        pt = '<div class="c-tag ' + (afford ? 'cost' : 'lock') + '">' + (lvl === 0 ? '' : 'Lv' + lvl + '→') + '💰 ' + cost + '</div>';
      }
      uh += '<button class="card tune' + (lvl >= MAXLV ? '' : '') + '" data-p="' + p.id + '">' +
        '<div class="c-ico">' + p.icon + '</div>' +
        '<div class="c-main"><div class="c-name">' + p.name + ' ' + pips + '</div>' +
        '<div class="c-sub">' + p.desc + '</div></div>' +
        pt + '</button>';
    }
    $('m-tune').innerHTML = uh;
  }

  function bindMenu() {
    $('m-tracks').addEventListener('click', function (e) {
      var card = e.target.closest('.card'); if (!card) return;
      selTrack = parseInt(card.getAttribute('data-t'), 10);
      renderMenu();
    });
    $('m-garage').addEventListener('click', function (e) {
      var card = e.target.closest('.card'); if (!card) return;
      var id = card.getAttribute('data-b');
      var def = bikeOf(id); if (!def) return;
      if (Save.has(id)) { selBike = id; renderMenu(); return; }
      if (Save.level() < def.lv) { toast('还差一点点：' + def.name + ' 需要 ' + def.lv + ' 级', 1700); return; }
      if (Save.get().coins >= def.price) {
        Save.addCoins(-def.price); Save.unlock(id); selBike = id;
        toast('🎉 解锁新车：' + def.name, 1800);
        renderMenu(); syncUp();
      } else {
        toast('金币不够，还差 ' + (def.price - Save.get().coins) + ' 枚', 1600);
      }
    });
    $('m-tune').addEventListener('click', function (e) {
      var card = e.target.closest('.card'); if (!card) return;
      var p = partOf(card.getAttribute('data-p')); if (!p) return;
      var lvl = Save.up(p.id);
      if (lvl >= MAXLV) { toast(p.name + ' 已经是满级了', 1400); return; }
      var cost = upCost(p, lvl + 1);
      if (Save.get().coins < cost) { toast('金币不够，跑几趟再来（还差 ' + (cost - Save.get().coins) + '）', 1800); return; }
      Save.addCoins(-cost); Save.setUp(p.id, lvl + 1);
      Sfx.trick();
      toast('🔧 ' + p.name + ' 升到 Lv' + (lvl + 1), 1600);
      renderMenu(); syncUp();
    });
  }

  /* ---------------- 提示 ---------------- */
  var toastTimer = 0;
  function toast(txt, ms) {
    var el = $('h-toast'); if (!el) return;
    el.textContent = txt; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 1400);
  }
  function trick(txt, color) {
    var el = $('h-trick'); if (!el) return;
    el.textContent = txt; el.style.color = color || '#a78bfa';
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  /* ---------------- HUD ---------------- */
  var hud = {
    time: $('h-time'), spd: $('h-spd'), coins: $('h-coins'), prog: $('h-prog'),
    score: $('h-score'), track: $('h-track'), split: $('h-split'), wind: $('h-wind')
  };
  function updateHud(s) {
    hud.time.textContent = s.elapsed.toFixed(1) + 's';
    hud.spd.textContent = s.kmh;
    hud.coins.textContent = s.coins;
    hud.prog.style.width = (s.progress * 100).toFixed(1) + '%';
    hud.score.innerHTML = '技巧 <b>' + s.trick + '</b>';
    if (s.windMax > 0) {
      hud.wind.classList.remove('hidden');
      var a = s.wind / Math.max(0.0001, s.windMax);
      var arrow = a > 0.12 ? '→' : (a < -0.12 ? '←' : '·');
      hud.wind.innerHTML = '风 <b style="transform:scaleX(' + (a >= 0 ? 1 : -1) + ')">➜</b> ' + (arrow === '·' ? '静风' : Math.abs(a) > .6 ? '强' : '弱');
    } else {
      hud.wind.classList.add('hidden');
    }
  }

  /* ---------------- 开始 / 暂停 / 结算 ---------------- */
  function startRun() {
    $('menu').classList.add('hidden');
    $('result').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('pad').classList.remove('hidden');
    playing = true;
    hud.split.textContent = '';
    hud.track.textContent = Engine.TRACKS[selTrack].name;

    // 先挂上自己的最佳幽灵（离线也能跟自己比），再后台拉云端幽灵
    prepareGhost(Engine.TRACKS[selTrack].id);

    var el = $('countdown'), num = el.querySelector('.cd-num');
    var seq = ['3', '2', '1', 'GO!'], i = 0;
    el.classList.remove('hidden');
    num.textContent = seq[0];
    Sfx.tick();
    var iv = setInterval(function () {
      i++;
      if (i >= seq.length) { clearInterval(iv); el.classList.add('hidden'); Game.start(selTrack, selBike); return; }
      num.textContent = seq[i];
      num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
      Sfx.tick();
      if (i === seq.length - 1) setTimeout(function () { el.classList.add('hidden'); Game.start(selTrack, selBike); }, 420);
    }, 620);
  }

  var ghostCacheKey = '';
  function prepareGhost(trackId) {
    Game.clearGhost();
    // 1) 自己的最佳
    var mine = Save.myGhost(trackId);
    if (mine) Game.setGhost({ nickname: (Save.nickname() || '我') + '·最佳', path: mine, mine: true });
    // 2) 云端更强的对手
    if (cloudState !== 'ok' || !Save.get().cloudOn || !window.BikeCloud) return;
    var near = Save.bestMsOf(trackId) || 0;
    ghostCacheKey = trackId + ':' + near;
    BikeCloud.ghost(trackId, near).then(function (r) {
      if (!r || !r.ok || !r.ghost) return;
      var g = r.ghost;
      if (!g.ghost || g.ghost === mine) return;
      Game.setGhost({ nickname: String(g.nickname || '对手').slice(0, 14), path: String(g.ghost), mine: false });
      if (playing) toast('幽灵车已就位：' + String(g.nickname || '对手'), 1800);
    });
  }

  function endToMenu() {
    playing = false;
    Game.stop(); Game.clearGhost();
    $('hud').classList.add('hidden');
    $('pad').classList.add('hidden');
    $('result').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('menu').classList.remove('hidden');
    renderMenu();
  }

  function showResult(r) {
    playing = false;
    $('hud').classList.add('hidden');
    $('pad').classList.add('hidden');
    $('res-track').textContent = r.trackName;
    $('res-time').textContent = fmt(r.time);
    $('res-coins').textContent = r.coins;
    $('res-score').textContent = r.trick;
    $('res-earn').textContent = '+' + r.earn;
    var b = $('res-best');
    if (r.record) { b.textContent = '🏆 新纪录！比之前更快'; b.className = 'res-best record'; }
    else { b.textContent = '本赛道最佳：' + fmt(r.best); b.className = 'res-best'; }

    var cl = $('res-cloud');
    cl.textContent = '';
    if (cloudState === 'ok' && Save.get().cloudOn && window.BikeCloud) {
      cl.textContent = '☁ 成绩上传中…';
      BikeCloud.submit({
        player: Save.playerId(), nick: Save.nickname() || '匿名骑手', track: r.trackId,
        timeMs: Math.round(r.time * 1000), coins: r.coins, trick: r.trick, bike: r.bike, ghost: r.ghost
      }).then(function (res) {
        if (res && res.ok) {
          cl.textContent = '☁ 排行榜第 ' + res.rank + ' 名' + (res.isBest ? ' · 已刷新你的最好成绩' : '');
        } else if (res && res.reason === 'too_fast') {
          cl.textContent = '☁ 刚提交过，稍后再跑一趟就能上榜';
        } else {
          cl.textContent = '☁ 云端暂时没连上，成绩已存在本机';
        }
      });
    } else {
      cl.textContent = '☁ 离线模式：成绩只存在本机（开启云同步即可上榜）';
    }

    var se = $('res-season');
    if (se) {
      var t = r.seasonPoints > 0 ? '🏁 本赛季 +' + r.seasonPoints + ' 分（共 ' + r.seasonTotal + ' 分）' : '';
      if (r.levelUp) t += (t ? '　' : '') + '⭐ 升到 ' + r.level + ' 级，奖励 ' + (r.lvReward || 0) + ' 金币';
      se.textContent = t;
    }
    var dly = $('res-daily');
    if (dly) {
      var ms = r.missions;
      if (ms && ms.allDone) dly.textContent = '📅 今日任务已全部完成，回菜单领奖励';
      else if (ms) dly.textContent = '📅 今日任务 ' + ms.done + '/' + ms.total + (ms.ready ? '（有奖励可领）' : '');
      else dly.textContent = '';
    }

    var un = $('res-unlock'), msg = '';
    if (r.levelUp) msg += '⭐ 升级了！现在是 ' + r.level + ' 级　';
    for (var i = 0; i < BIKES.length; i++) {
      if (!Save.has(BIKES[i].id) && BIKES[i].price > 0 && Save.get().coins >= BIKES[i].price && Save.level() >= BIKES[i].lv) {
        msg += '可以解锁「' + BIKES[i].name + '」了！';
      }
    }
    un.textContent = msg;
    $('result').classList.remove('hidden');
    syncUp();
    syncSeason();
  }

  /* ---------------- 排行榜 ---------------- */
  var lbTrack = 0;
  function openLb() {
    lbTrack = selTrack;
    $('lb').classList.remove('hidden');
    renderLbTabs();
    loadLb();
  }
  function renderLbTabs() {
    var h = '';
    for (var i = 0; i < Engine.TRACKS.length; i++) {
      h += '<button class="lb-tab' + (i === lbTrack ? ' on' : '') + '" data-i="' + i + '">' +
        Engine.TRACKS[i].icon + ' ' + Engine.TRACKS[i].name + '</button>';
    }
    $('lb-tabs').innerHTML = h;
  }
  function loadLb() {
    var list = $('lb-list'), me = $('lb-me');
    var tr = Engine.TRACKS[lbTrack];
    me.textContent = '';
    if (!window.BikeCloud) { list.innerHTML = '<div class="lb-empty">云端组件未加载</div>'; return; }
    if (cloudState !== 'ok') {
      list.innerHTML = '<div class="lb-empty">云端没连上（可能处在离线环境）<br>你的本机最佳：' + fmt(Save.bestOf(tr.id)) + '</div>';
      return;
    }
    list.innerHTML = '<div class="lb-empty">加载中…</div>';
    BikeCloud.leaderboard(tr.id, 20).then(function (r) {
      if (!r || !r.ok) {
        list.innerHTML = '<div class="lb-empty">排行榜暂时取不到<br>你的本机最佳：' + fmt(Save.bestOf(tr.id)) + '</div>';
        return;
      }
      var rows = r.rows || [];
      if (!rows.length) {
        list.innerHTML = '<div class="lb-empty">这条赛道还没有人上榜<br><b>你跑第一趟就是榜首</b></div>';
        return;
      }
      var myMs = Save.bestMsOf(tr.id) || 0;
      var h = '', mine = -1;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var isMe = myMs && Math.abs(row.time_ms - myMs) < 60 && row.nickname === (Save.nickname() || '匿名骑手');
        if (isMe) mine = row.rank;
        var gcls = row.rank === 1 ? 'g1' : row.rank === 2 ? 'g2' : row.rank === 3 ? 'g3' : '';
        h += '<div class="lb-row' + (isMe ? ' me' : '') + '">' +
          '<span class="rk ' + gcls + '">' + row.rank + '</span>' +
          '<span>' + esc(row.nickname) + (isMe ? ' <small>（你）</small>' : '') + '</span>' +
          '<span class="tm">' + fmtMs(row.time_ms) + '</span>' +
          '<span class="ex">💰' + (row.coins || 0) + '</span>' +
          '</div>';
      }
      list.innerHTML = h;
      me.textContent = mine > 0 ? '你当前第 ' + mine + ' 名' :
        (myMs ? '你的成绩 ' + fmtMs(myMs) + ' 还没进前 20，再快一点' : '还没跑过这条赛道');
    });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- 每日任务 ---------------- */
  function openDaily() {
    renderDaily();
    $('daily').classList.remove('hidden');
  }
  function renderDaily() {
    var s = Progress.daily();
    $('d-date').textContent = s.date;
    var h = '';
    for (var i = 0; i < s.items.length; i++) {
      var it = s.items[i];
      var pct = Math.min(100, it.prog / it.target * 100);
      var right;
      if (it.claimed) right = '<span class="d-btn done">已领取</span>';
      else if (it.done) right = '<button class="d-btn claim" data-i="' + it.id + '">领 +' + it.reward + ' 💰</button>';
      else right = '<span class="d-rw">+' + it.reward + ' 💰</span>';
      var pv = it.type === 'track' ? (it.prog >= it.target ? '已完成' : '未完成')
        : Math.min(Math.round(it.prog), it.target) + ' / ' + it.target;
      h += '<div class="d-item' + (it.done ? ' done' : '') + '">' +
        '<div class="d-mid">' +
        '<div class="d-name">' + esc(it.text) + (it.done ? ' ✔' : '') + '</div>' +
        '<div class="d-bar"><i style="width:' + pct.toFixed(0) + '%"></i></div>' +
        '<div class="d-prog">' + pv + '</div>' +
        '</div>' + right + '</div>';
    }
    $('d-list').innerHTML = h;
    var ft = '已完成 ' + s.done + '/' + s.total;
    if (s.bonus) ft += '　✅ 全部完成，额外 +150 金币已到手';
    else if (s.claimed >= s.total) ft += '　🎉 三项都领完了！';
    else if (s.allDone) ft += '　🎁 全部完成，快去领取（含额外奖励）';
    $('d-foot').textContent = ft;
  }

  /* ---------------- 赛季 ---------------- */
  function openSeason() {
    var ss = Progress.season();
    $('s-name').textContent = Progress.seasonName();
    $('s-points').textContent = ss.points;
    $('s-rides').textContent = '本赛季已骑行 ' + ss.rides + ' 趟';
    var th = '';
    for (var i = 0; i < ss.tiers.length; i++) {
      var t = ss.tiers[i];
      var btn;
      if (t.claimed) btn = '<span class="d-btn done">已领取</span>';
      else if (t.got) btn = '<button class="d-btn claim" data-p="' + t.p + '">领 ' + t.coins + ' 💰</button>';
      else btn = '<span class="d-rw">还差 ' + (t.p - ss.points) + ' 分</span>';
      th += '<div class="s-tier' + (t.got ? ' got' : '') + '">' +
        '<span class="s-ico">' + t.icon + '</span>' +
        '<div class="d-mid"><div class="d-name">' + t.name + '档 · ' + t.p + ' 分</div>' +
        '<div class="d-prog">奖励 ' + t.coins + ' 金币</div></div>' + btn + '</div>';
    }
    $('s-tiers').innerHTML = th;
    $('season').classList.remove('hidden');
    loadSeasonLb();
  }
  function loadSeasonLb() {
    var list = $('s-list'), me = $('s-me');
    me.textContent = '';
    if (!window.BikeCloud) { list.innerHTML = '<div class="lb-empty">云端组件未加载</div>'; return; }
    if (cloudState !== 'ok') {
      list.innerHTML = '<div class="lb-empty">云端没连上（离线环境）<br>你的赛季积分已存在本机：' + Progress.season().points + ' 分</div>';
      return;
    }
    list.innerHTML = '<div class="lb-empty">加载中…</div>';
    BikeCloud.seasonLb(Progress.season().id, 20).then(function (r) {
      if (!r || !r.ok) { list.innerHTML = '<div class="lb-empty">赛季榜暂时取不到</div>'; return; }
      var rows = r.rows || [];
      if (!rows.length) { list.innerHTML = '<div class="lb-empty">本赛季还没有人上榜<br><b>你跑第一趟就是榜首</b></div>'; return; }
      var h = '', mine = 0, myPts = Progress.season().points;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var isMe = row.player_id === Save.playerId();
        if (isMe) mine = row.rank;
        var gcls = row.rank === 1 ? 'g1' : row.rank === 2 ? 'g2' : row.rank === 3 ? 'g3' : '';
        h += '<div class="lb-row' + (isMe ? ' me' : '') + '">' +
          '<span class="rk ' + gcls + '">' + row.rank + '</span>' +
          '<span>' + esc(row.nickname) + (isMe ? ' <small>（你）</small>' : '') + '</span>' +
          '<span class="tm">' + (row.points || 0) + ' 分</span></div>';
      }
      list.innerHTML = h;
      me.textContent = mine > 0 ? '你当前第 ' + mine + ' 名'
        : (myPts ? '你已有 ' + myPts + ' 分，跑一趟即可上榜' : '还没开始本赛季');
    });
  }
  function syncSeason() {
    if (cloudState !== 'ok' || !window.BikeCloud || !Save.get().cloudOn) return;
    var delta = Progress.syncDelta();
    if (delta <= 0) return;
    BikeCloud.seasonAdd(Progress.season().id, Save.playerId(), Save.nickname() || '匿名骑手', delta).then(function (r) {
      if (r && r.ok) Progress.markSynced();
    });
  }

  /* ---------------- 云同步 ---------------- */
  function setCloud(txt, state) {
    cloudState = state;
    var c = $('m-cloud');
    if (c) c.textContent = txt;
    renderMenu();
  }
  function cloudBoot() {
    if (!window.BikeCloud) { setCloud('离线模式', 'off'); return; }
    if (!Save.get().cloudOn) { setCloud('离线模式', 'off'); return; }
    BikeCloud.load(Save.playerId()).then(function (r) {
      if (!r || !r.ok) { setCloud('离线模式', 'off'); return; }
      if (r.data) Save.adoptCloud(r.data);
      setCloud('已同步', 'ok');
      renderMenu();
      syncUp();
      syncSeason();
    });
  }
  var syncTimer = 0;
  function syncUp() {
    if (cloudState !== 'ok' || !window.BikeCloud || !Save.get().cloudOn) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      BikeCloud.save(Save.playerId(), Save.payload());
    }, 1200);
  }

  /* ---------------- 昵称 / 钥匙 ---------------- */
  function openNick() {
    $('nick-input').value = Save.nickname();
    $('nick-key').textContent = Save.playerId();
    $('key-input').value = '';
    $('chk-cloud').checked = !!Save.get().cloudOn;
    $('nick').classList.remove('hidden');
  }

  function bindUI() {
    $('btn-start').addEventListener('click', function () { Sfx.resume(); startRun(); });
    $('btn-again').addEventListener('click', startRun);
    $('btn-back').addEventListener('click', endToMenu);
    $('btn-res-lb').addEventListener('click', function () { lbTrack = selTrack; openLb(); });
    $('btn-resume').addEventListener('click', function () { Game.setPaused(false); $('pause').classList.add('hidden'); });
    $('btn-restart').addEventListener('click', function () { $('pause').classList.add('hidden'); startRun(); });
    $('btn-quit').addEventListener('click', endToMenu);
    $('btn-pause').addEventListener('click', function () {
      if (!playing) return;
      Game.setPaused(true); $('pause').classList.remove('hidden');
    });
    $('btn-help').addEventListener('click', function () { $('help').classList.remove('hidden'); });
    $('btn-help-close').addEventListener('click', function () { $('help').classList.add('hidden'); });

    $('btn-lb').addEventListener('click', openLb);
    $('btn-lb-close').addEventListener('click', function () { $('lb').classList.add('hidden'); });
    $('lb-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.lb-tab'); if (!b) return;
      lbTrack = parseInt(b.getAttribute('data-i'), 10);
      renderLbTabs(); loadLb();
    });

    $('btn-nick').addEventListener('click', openNick);
    $('btn-nick-cancel').addEventListener('click', function () { $('nick').classList.add('hidden'); });
    $('btn-nick-save').addEventListener('click', function () {
      Save.setNickname($('nick-input').value);
      Save.setCloud($('chk-cloud').checked);
      $('nick').classList.add('hidden');
      renderMenu();
      if (Save.get().cloudOn) cloudBoot(); else setCloud('离线模式', 'off');
      syncUp();
      toast('已保存', 1200);
    });
    $('btn-key-copy').addEventListener('click', function () {
      var t = Save.playerId();
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(t);
        else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
        toast('钥匙已复制，请自己保存好', 1800);
      } catch (e) { toast('复制失败，请手动记下', 1800); }
    });
    $('btn-key-restore').addEventListener('click', function () {
      var k = ($('key-input').value || '').trim().toLowerCase();
      if (!/^[0-9a-f]{8,40}$/.test(k)) { toast('钥匙格式不对（应是 32 位小写字母数字）', 2200); return; }
      if (!confirm('用这把钥匙恢复云存档？本机当前的进度会被云端覆盖（如果云端更新）。')) return;
      try { localStorage.setItem('windrider.save.v2', JSON.stringify(Object.assign({}, Save.get(), { playerId: k }))); } catch (e) {}
      location.reload();
    });

    $('btn-sync').addEventListener('click', function () {
      if (!Save.get().cloudOn) { toast('云同步是关的，点昵称那里可以打开', 2000); return; }
      setCloud('同步中…', 'idle');
      BikeCloud.load(Save.playerId()).then(function (r) {
        if (!r || !r.ok) { setCloud('离线模式', 'off'); toast('云端没连上', 1600); return; }
        if (r.data) Save.adoptCloud(r.data);
        BikeCloud.save(Save.playerId(), Save.payload()).then(function (s) {
          if (s && s.ok) { setCloud('已同步', 'ok'); toast('✅ 存档已同步到云端', 1600); }
          else { setCloud('已同步', 'ok'); toast('读取成功，写入稍后再试', 1600); }
          renderMenu();
        });
      });
    });

    $('btn-sensor').addEventListener('click', function () {
      if (Controls.isSensorOn()) {
        Controls.disableSensor(); Save.setSensor(false); toast('体感转向已关闭', 1400); renderMenu(); return;
      }
      Controls.enableSensor(function (ok) {
        if (ok) { Save.setSensor(true); toast('体感已开启：左右摆动手机转向', 2200); }
        else { Save.setSensor(false); toast('此设备/浏览器不支持体感，请用屏幕按钮', 2400); }
        renderMenu();
      });
    });

    /* 每日任务 */
    $('btn-daily').addEventListener('click', openDaily);
    $('btn-daily-close').addEventListener('click', function () { $('daily').classList.add('hidden'); });
    $('d-list').addEventListener('click', function (e) {
      var b = e.target.closest('.d-btn.claim'); if (!b) return;
      var res = Progress.claim(b.getAttribute('data-i'));
      if (res) {
        Sfx.trick();
        toast('🎁 任务奖励 +' + (res.got + res.bonus) + ' 金币' + (res.bonus ? '（含全完成奖励）' : ''), 2200);
        renderDaily(); renderMenu(); syncUp();
      }
    });

    /* 赛季 */
    $('btn-season').addEventListener('click', openSeason);
    $('btn-season-close').addEventListener('click', function () { $('season').classList.add('hidden'); });
    $('s-tiers').addEventListener('click', function (e) {
      var b = e.target.closest('.d-btn.claim'); if (!b) return;
      var got = Progress.claimTier(parseInt(b.getAttribute('data-p'), 10));
      if (got) {
        Sfx.levelUp();
        toast('🏅 赛季档位奖励 +' + got + ' 金币', 2200);
        openSeason(); renderMenu(); syncUp();
      }
    });

    document.addEventListener('touchmove', function (e) {
      if (e.target.closest && e.target.closest('#pad')) e.preventDefault();
    }, { passive: false });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    Sprites.init();
    Controls.init();
    Game.init($('cv'), {
      onTick: updateHud,
      onFinish: showResult,
      onToast: toast,
      onTrick: trick,
      onCoin: function () { },
      onCrash: function () { trick('撞到了!', '#f87171'); },
      onSplit: function (i, t) {
        hud.split.textContent = 'CP' + (i + 1) + ' ' + t.toFixed(1) + 's';
        setTimeout(function () { hud.split.textContent = ''; }, 1600);
      }
    });
    bindMenu();
    bindUI();
    selBike = Save.has('commuter') ? 'commuter' : 'commuter';
    Progress.ensureDaily();
    renderMenu();
    cloudBoot();
    if (Save.get().sensorOn && !Controls.isSensorOn()) {
      setTimeout(function () { toast('点「体感转向」可重新开启体感（需点一下授权）', 2600); }, 1200);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
