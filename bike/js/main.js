/* 风驰骑行 —— UI 状态机（菜单 / 倒计时 / HUD / 暂停 / 结算） */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var selTrack = 0, selBike = 'commuter';
  var playing = false;

  var BIKES = [
    { id: 'commuter', name: '通勤单车', icon: '🚲', price: 0, tag: '稳 · 好上手', desc: '起步车：极速一般，但压得住' },
    { id: 'road', name: '公路车', icon: '🚴', price: 800, tag: '快 · 灵敏', desc: '极速最高、转向最灵，冲出路外代价大' },
    { id: 'mtb', name: '山地车', icon: '🚵', price: 2000, tag: '稳 · 抓地强', desc: '起伏路面与草地更稳，掉速最少' }
  ];

  function fmt(sec) {
    if (sec == null) return '--:--.-';
    var m = Math.floor(sec / 60), s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  /* ---------------- 菜单 ---------------- */
  function renderMenu() {
    var d = Save.get();
    $('m-coins').textContent = d.coins;
    $('m-dist').textContent = (d.totalDist / 1000).toFixed(1);

    // 赛道
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
      var tag = own ? (bk.id === selBike ? '已选用' : '已拥有')
        : '<span class="c-tag cost">💰 ' + bk.price + '</span>';
      gh += '<button class="card' + (bk.id === selBike ? ' on' : '') + (own ? '' : ' locked') + '" data-b="' + bk.id + '">' +
        '<div class="c-ico">' + bk.icon + '</div>' +
        '<div class="c-main"><div class="c-name">' + bk.name + '</div>' +
        '<div class="c-sub">' + bk.desc + '</div></div>' +
        '<div class="c-tag ' + (own ? 'good' : 'cost') + '">' + (own ? (bk.id === selBike ? '已选用' : '已拥有') : '💰 ' + bk.price) + '</div>' +
        '</button>';
    }
    $('m-garage').innerHTML = gh;
    $('btn-sensor').textContent = '体感转向：' + (Save.get().sensorOn ? '开' : '关');
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
      var def = null; for (var i = 0; i < BIKES.length; i++) if (BIKES[i].id === id) def = BIKES[i];
      if (!def) return;
      if (Save.has(id)) { selBike = id; renderMenu(); }
      else if (Save.get().coins >= def.price) {
        Save.addCoins(-def.price); Save.unlock(id); selBike = id;
        toast('🎉 解锁新车：' + def.name, 1800);
        renderMenu();
      } else {
        toast('金币不够，还差 ' + (def.price - Save.get().coins) + ' 枚', 1600);
      }
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
  var hud = { time: $('h-time'), spd: $('h-spd'), coins: $('h-coins'), prog: $('h-prog'), score: $('h-score'), track: $('h-track'), split: $('h-split') };
  function updateHud(s) {
    hud.time.textContent = s.elapsed.toFixed(1) + 's';
    hud.spd.textContent = s.kmh;
    hud.coins.textContent = s.coins;
    hud.prog.style.width = (s.progress * 100).toFixed(1) + '%';
    hud.score.innerHTML = '技巧 <b>' + s.trick + '</b>';
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

  function endToMenu() {
    playing = false;
    Game.stop();
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
    // 解锁提示
    var un = $('res-unlock'), msg = '';
    for (var i = 0; i < BIKES.length; i++) {
      if (!Save.has(BIKES[i].id) && BIKES[i].price > 0 && Save.get().coins >= BIKES[i].price) {
        msg += '可以解锁「' + BIKES[i].name + '」了！';
      }
    }
    un.textContent = msg;
    $('result').classList.remove('hidden');
  }

  function bindUI() {
    $('btn-start').addEventListener('click', function () { Sfx.resume(); startRun(); });
    $('btn-again').addEventListener('click', function () { startRun(); });
    $('btn-back').addEventListener('click', endToMenu);
    $('btn-resume').addEventListener('click', function () { Game.setPaused(false); $('pause').classList.add('hidden'); });
    $('btn-restart').addEventListener('click', function () { $('pause').classList.add('hidden'); startRun(); });
    $('btn-quit').addEventListener('click', endToMenu);
    $('btn-pause').addEventListener('click', function () {
      if (!playing) return;
      Game.setPaused(true); $('pause').classList.remove('hidden');
    });
    $('btn-help').addEventListener('click', function () { $('help').classList.remove('hidden'); });
    $('btn-help-close').addEventListener('click', function () { $('help').classList.add('hidden'); });
    $('btn-sensor').addEventListener('click', function () {
      if (Controls.isSensorOn()) {
        Controls.disableSensor(); Save.setSensor(false); toast('体感转向已关闭', 1400);
      } else {
        Controls.enableSensor(function (ok) {
          if (ok) { Save.setSensor(true); toast('体感已开启：左右摆动手机转向', 2200); }
          else { Save.setSensor(false); toast('此设备/浏览器不支持体感，请用屏幕按钮', 2400); }
          renderMenu();
        });
        return;
      }
      renderMenu();
    });
    // 触屏左右半屏加速/刹车（体感模式下更顺手）
    var pad = $('pad');
    // 防止页面滚动
    document.addEventListener('touchmove', function (e) { if (e.target.closest && e.target.closest('#pad')) e.preventDefault(); }, { passive: false });
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
      onCoin: function (n) { },
      onCrash: function () { trick('撞到了!', '#f87171'); },
      onSplit: function (i, t) { hud.split.textContent = 'CP' + (i + 1) + ' ' + t.toFixed(1) + 's'; setTimeout(function () { hud.split.textContent = ''; }, 1600); }
    });
    bindMenu();
    bindUI();
    selBike = Save.has('commuter') ? 'commuter' : 'commuter';
    renderMenu();
    if (Controls.isSensorOn && !Controls.isSensorOn() && Save.get().sensorOn) {
      // 之前开过体感，提示用户需重新授权（iOS 要求手势触发）
      setTimeout(function () { toast('点「体感转向」可重新开启体感（需点一下授权）', 2600); }, 1200);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
