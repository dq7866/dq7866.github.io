/* 地球拼图 · 「地球知识」科普版块
 * 职责：在顶栏「地球知识」弹窗里呈现地球作为一颗行星的系统知识——
 *       1) 可点击分层的「剖开地球」剖面交互；
 *       2) 三个地震不连续面；
 *       3) 九个行星级科普主题（参数 / 运动 / 磁场 / 热量 / 演化 / 月球 / 圈层 / 宇宙位置）。
 * 设计约束：纯本地、零外部请求、不依赖 GlobePuzzle API（即便主程序异常也不阻断）。
 *           与 app-addons.js 协同：弹窗登记到 MODAL_IDS，由现有机制处理互斥 / 焦点 / Esc。
 */
(function () {
  'use strict';

  /* ---------------- 数据 ---------------- */
  // 剖面层：hit 为 SVG 命中圆半径（示意，非真实比例）；color 为科学示意配色
  var LAYERS = [
    {
      id: 'crust', name: '地壳', en: 'Crust', hit: 140, color: '#8a5a3c', labelR: 128,
      depth: '0 – 约 35 km（陆地平均）/ 约 7 km（海洋）',
      state: '固态岩石，最外面的“硬壳”',
      temp: '底部约 200–400 ℃（陆地）/ 约 500 ℃（海洋）',
      press: '约数千 – 1 万大气压（底部）',
      comp: '陆壳以花岗岩类（富硅铝）为主；洋壳以玄武岩类（富硅镁）为主',
      note: '占地球体积不到 1%，却是我们脚下的全部陆地与海床；最厚处（青藏高原）可达约 70 km。'
    },
    {
      id: 'mantle', name: '地幔', en: 'Mantle', hit: 116, color: '#c66a2e', labelR: 93,
      depth: '约 35 / 7 km – 2890 km',
      state: '固态为主；顶部“软流圈”可部分熔融、能缓慢流动',
      temp: '顶部约 500 ℃ → 底部约 4000 ℃',
      press: '约 1 万 – 135 万大气压',
      comp: '橄榄岩（富镁铁的硅酸盐：橄榄石、辉石为主）',
      note: '体积占地球约 84%、质量约 67%。地幔对流像慢动作的“传送带”，是驱动板块运动的真正引擎。'
    },
    {
      id: 'outer', name: '外核', en: 'Outer Core', hit: 70, color: '#e8922f', labelR: 52,
      depth: '2890 – 5150 km',
      state: '液态铁镍合金（高温高压下仍不固化）',
      temp: '约 4000 – 5000 ℃',
      press: '约 135 – 330 万大气压',
      comp: '铁、镍为主，含少量轻元素',
      note: '液态金属的对流加上地球自转，像一台发电机，产生保护我们的地磁场。'
    },
    {
      id: 'inner', name: '内核', en: 'Inner Core', hit: 30, color: '#f4e3a1', labelR: 17,
      depth: '5150 – 6371 km（半径约 1220 km）',
      state: '固态铁镍（虽高达约 5000–5700 ℃，但超高压使熔点升高而保持固态）',
      temp: '约 5400 – 5700 ℃（接近太阳表面温度）',
      press: '约 360 万大气压',
      comp: '铁、镍',
      note: '正以每年约 1 mm 的速度缓慢“冻结”生长；有研究认为它比地表自转略快。'
    }
  ];

  var DISCS = [
    { name: '莫霍面', en: 'Moho', depth: '陆下约 30–50 km / 洋下约 5–10 km', who: '莫霍洛维奇，1909',
      note: '地壳与地幔的分界。地震波穿过此处时速度突然跳变，从而被发现。' },
    { name: '古登堡面', en: 'Gutenberg', depth: '深 2890 km', who: '古登堡，1914',
      note: '地幔与外核分界。横波（S 波）到此消失，证明外核是液态。' },
    { name: '莱曼面', en: 'Lehmann', depth: '深 5150 km', who: '莱曼，1936',
      note: '外核与内核分界。纵波（P 波）速度突增，由此发现了固态内核。' }
  ];

  var TOPICS = [
    {
      id: 'cut', title: '把地球切开看：内部圈层',
      lead: '把地球像切西瓜一样切下一角，从外到内会看到四层——薄薄的地壳、厚厚的地幔、液态的外核，以及最中心固态却滚烫的内核。上方这个 3D 模型可以旋转、拆解，点任意一层（或下方按钮）就能看它的详情。比例为便于观察的示意比例（已放大内核与外核），真实地壳极薄、地幔占地球体积八成以上。',
      image: window.EARTH_NASA_IMG || '',
      imgAlt: 'NASA 发布的地球内部剖面示意图',
      imgCap: '权威对照：上图是本页可交互的 3D 模型；下图是 NASA 发布的官方剖面示意（Dixon Rohr 绘制，公有领域），四层结构与本页一致，可作为科学界共识性画法的佐证。',
      blocks: [
        '我们平时只站在最外面那层“壳”上。它薄得不可思议：如果把地球缩成一个鸡蛋大小，地壳比蛋壳还薄。',
        '再往里是占地球体积八成以上的地幔，它极其缓慢地流动，是板块漂移的“传送带”。',
        '2900 公里以下，铁镍成了液态的外核，正是它在地球自转的帮助下产生磁场；最中心的内核虽然温度接近太阳表面，却因压力太高而保持固态。'
      ]
    },
    {
      id: 'size', title: '地球有多大',
      lead: '一些让人直观感受地球尺度的数字。',
      table: [
        ['平均半径', '6371 km（赤道 6378 / 两极 6357，是个略扁的球）'],
        ['赤道周长', '约 40075 km'],
        ['表面积', '约 5.1 亿 km²（陆地 1.49 亿，海洋 3.61 亿）'],
        ['体积', '约 1.083×10¹² km³'],
        ['质量', '5.972×10²⁴ kg（约 60 万亿亿吨）'],
        ['平均密度', '5.515 g/cm³'],
        ['年龄', '约 45.4 亿年']
      ],
      blocks: [
        '平均密度远大于地表岩石，说明地球内部是致密得多的物质。',
        '它的体积大约能装下 50 个月球；而珠峰顶到地心的距离，比到月球近了将近一万倍。'
      ]
    },
    {
      id: 'motion', title: '地球会动：自转与公转',
      lead: '地球从不停歇：它一边自转，一边绕着太阳公转。',
      table: [
        ['自转', '恒星日 23 时 56 分 4 秒；赤道线速度约 1670 km/h'],
        ['公转', '一圈 365.256 天；平均速度约 30 km/s（约 10.8 万 km/h）'],
        ['地轴倾角', '23.44°']
      ],
      blocks: [
        '自转让地球赤道微微鼓起、两极略扁；也造就了昼夜，以及影响风与洋流的科里奥利力。',
        '四季不是因为离太阳远近（地球 1 月反而离太阳最近），而是因为地轴倾斜：一年中太阳直射点在南北回归线之间移动，同一地区接收到的热量随之变化。'
      ]
    },
    {
      id: 'field', title: '地球有磁场：磁层与极光',
      lead: '我们头顶看不见，却时刻被一层磁场护着。',
      blocks: [
        '地磁场主要来自液态外核中铁镍的对流（“地球发电机”效应），近似一个巨大的条形磁铁。',
        '磁极与地理极并不重合（偏差约 11°），而且一直在缓慢漂移，近年还在加速。',
        '磁场在地球周围撑起“磁层”，把太阳风（高速带电粒子流）挡在身外，保护大气和生命不被吹散。',
        '少量粒子沿磁力线钻进两极高空，激发大气发光，就是极光。',
        '地质记录显示地磁曾多次逆转（南北极对调），最近一次约 78 万年前；逆转过程中磁场会暂时减弱。'
      ]
    },
    {
      id: 'heat', title: '地球有热度：内部热量与板块动力',
      lead: '地球内部至今仍在散热，这份热量塑造了地表。',
      blocks: [
        '热源来自地球诞生时的余热，以及铀、钍、钾等放射性元素持续衰变放出的热。',
        '热量驱动地幔对流：热的物质上升、冷的物质下沉，形成缓慢翻转的“对流胞”。',
        '板块就“驮”在对流胞上：有的地方被拉开（如大洋中脊），有的地方被挤压下沉（如海沟），这就是板块运动的根本动力。',
        '这些能量从火山、温泉、地震中释放到地表；地壳浅部地温大约每加深 1 公里升高 25–30 ℃。'
      ]
    },
    {
      id: 'evo', title: '地球的演化：46 亿年简史',
      lead: '46 亿年里，地球从一团尘埃变成今天的蓝色星球。',
      table: [
        ['约 46 亿年前', '太阳系从分子云坍缩成形'],
        ['约 45.4 亿年前', '地球由尘埃与小天体吸积而成'],
        ['约 45 亿年前', '“忒伊亚”撞击 → 抛出物质形成月球，地球重熔'],
        ['约 44 亿年前', '最古老的地壳出现（岩浆海冷却）'],
        ['约 40 亿年前', '火山排气 + 含水天体撞击，带来大气与海洋'],
        ['数十亿年间', '板块构造改造海陆；生命约 35–38 亿年前出现']
      ],
      blocks: [
        '这是一条“由热到冷、由无生命到有生命”的主线；我们脚下的每一块大陆，都经历过反复的聚合与裂解。'
      ]
    },
    {
      id: 'moon', title: '月球的来历：大碰撞说',
      lead: '月亮可能不是地球“原配”，而是一场大撞击的产物。',
      blocks: [
        '主流的“大碰撞说”认为：一颗火星大小、叫“忒伊亚”的天体撞上早期地球，撞击抛出的物质在轨道上聚成了月球。',
        '证据之一是月球岩石与地球地幔成分高度相似（氧同位素一致）。',
        '月球半径约 1737 km，距地约 38.4 万 km；它的引力稳定了地球自转轴的倾角，否则倾角会大幅摆动、气候剧烈变化。',
        '月球引潮力塑造了海洋潮汐，也以微小但可测的速率减慢着地球的自转。'
      ]
    },
    {
      id: 'spheres', title: '地球的圈层系统：四圈联动',
      lead: '地球不只是岩石球，而是一套互相耦合的圈层。',
      blocks: [
        '岩石圈：地壳 + 上地幔顶部，刚性外壳，裂成会漂移的板块（正是前面“地质板块”拼片那一层）。',
        '水圈：海洋、河湖、冰盖与地下水；地球表面约 71% 被水覆盖（“海洋”“大河”拼片所在的圈层）。',
        '大气圈：从对流层到散逸层；我们做的“气压带风带”“柯本气候区”都发生在最底下这一薄层。',
        '生物圈：唯一已知存在生命的星球；生物反过来改造大气（产氧）与岩石（成土、成矿）。',
        '太阳辐射驱动大气与水循环，板块运动重塑海陆，生命参与碳氧循环——四圈耦合，才成就了可居住的“蓝色弹珠”。'
      ]
    },
    {
      id: 'cosmos', title: '地球在宇宙中：太阳系与宜居带',
      lead: '把视野拉到太阳系，才知道地球的位置有多巧。',
      table: [
        ['位置', '距太阳第三近的行星，也是最大的类地行星'],
        ['轨道', '半长轴 1 AU ≈ 1.496 亿 km；处在太阳系“宜居带”内']
      ],
      blocks: [
        '同样由岩石构成的还有水星、金星、火星。金星太热、火星太冷，地球恰好处在液态水能稳定存在的温度区间。',
        '让地球适合生命的，不只是一个“刚好”的距离：足够的质量留住大气、磁场挡住太阳风、稳定的恒星、以及液态水，共同构成了所谓的“金凤花条件”。',
        '截至目前，地球仍是已知唯一确认存在生命的星球——这也让保护它显得格外重要。'
      ]
    }
  ];

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }
  function byId(id) { return document.getElementById(id); }
  function findLayer(id) {
    for (var i = 0; i < LAYERS.length; i++) if (LAYERS[i].id === id) return LAYERS[i];
    return LAYERS[0];
  }

  /* ---------------- 剖面卡片 ---------------- */
  function layerCard(l) {
    return '' +
      '<div class="gp-k-detail-head"><b>' + esc(l.name) + '</b> <span class="gp-k-en">' + esc(l.en) + '</span></div>' +
      '<dl class="gp-k-dl">' +
      '<div><dt>深度</dt><dd>' + esc(l.depth) + '</dd></div>' +
      '<div><dt>状态</dt><dd>' + esc(l.state) + '</dd></div>' +
      '<div><dt>温度</dt><dd>' + esc(l.temp) + '</dd></div>' +
      '<div><dt>压力</dt><dd>' + esc(l.press) + '</dd></div>' +
      '<div><dt>主要成分</dt><dd>' + esc(l.comp) + '</dd></div>' +
      '</dl>' +
      '<p class="gp-k-detail-note">' + esc(l.note) + '</p>';
  }

  function discCard(d) {
    return '' +
      '<div class="gp-k-disc">' +
      '<div class="gp-k-disc-head"><b>' + esc(d.name) + '</b> <span class="gp-k-en">' + esc(d.en) + '</span></div>' +
      '<p class="gp-k-disc-depth">深 ' + esc(d.depth) + ' · ' + esc(d.who) + '</p>' +
      '<p class="gp-k-disc-note">' + esc(d.note) + '</p>' +
      '</div>';
  }

  function topicCard(t) {
    var body = '';
    if (t.image) {
      body += '<figure class="gp-k-fig">' +
        '<img class="gp-k-figimg" src="' + t.image + '" alt="' + esc(t.imgAlt || 'NASA 地球内部剖面示意') + '" loading="lazy">' +
        (t.imgCap ? '<figcaption class="gp-k-figcap">' + esc(t.imgCap) + '</figcaption>' : '') +
        '</figure>';
    }
    if (t.table && t.table.length) {
      body += '<table class="gp-k-data"><tbody>' + t.table.map(function (row) {
        return '<tr><th>' + esc(row[0]) + '</th><td>' + esc(row[1]) + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
    body += (t.blocks || []).map(function (b) { return '<p>' + esc(b) + '</p>'; }).join('');
    return '' +
      '<details class="gp-k-topic" id="gp-k-topic-' + t.id + '">' +
      '<summary>' + esc(t.title) + '</summary>' +
      (t.lead ? '<p class="gp-k-topic-lead">' + esc(t.lead) + '</p>' : '') +
      body +
      '</details>';
  }

  /* ---------------- 渲染 ---------------- */
  var e3d = null; // 地球内部 3D 渲染器实例（earth-3d.js 提供，WebGL 不可用时为 null）

  function init3D(root) {
    var canvas = byId('gp-k-3d');
    var hint = byId('gp-k-3dhint');
    if (!canvas || e3d) return;
    if (typeof window.Earth3D === 'undefined') {
      if (hint) hint.textContent = '3D 模块未加载，可改用下方按钮查看各层。';
      return;
    }
    var layerMeta = {};
    LAYERS.forEach(function (l) {
      var sd = ({ crust: '0–35 km', mantle: '35–2890 km', outer: '2890–5150 km', inner: '5150–6371 km' })[l.id] || '';
      layerMeta[l.id] = { name: l.name, depth: sd };
    });
    try {
      e3d = window.Earth3D.mount({
        canvas: canvas,
        onSelect: function (id) { setActiveLayer(root, id); },
        layers: layerMeta
      });
    } catch (e3) { e3d = null; }
    if (!e3d || !e3d.supported) {
      if (hint) hint.textContent = '你的浏览器未启用 WebGL，无法显示 3D 模型；可改用下方按钮查看各层。';
      return;
    }
    var eb = byId('gp-k-explode'), sb = byId('gp-k-spin'), rb = byId('gp-k-reset');
    if (eb) eb.addEventListener('click', function () {
      var ex = e3d.toggleExplode();
      eb.textContent = ex ? '搭建' : '拆解';
      eb.setAttribute('aria-pressed', ex ? 'true' : 'false');
      if (hint) hint.textContent = ex
        ? '已拆解：四层沿径向拉开，层与层之间留出明显空隙，点击任一层查看详情。'
        : '已复原：剖面切口用同心环显示四层；滚轮可缩放。';
    });
    if (sb) sb.addEventListener('click', function () {
      var sp = e3d.toggleSpin();
      sb.setAttribute('aria-pressed', sp ? 'true' : 'false');
      sb.classList.toggle('active', sp);
    });
    if (rb) rb.addEventListener('click', function () { e3d.resetView(); });

    // 弹窗开关驱动 3D 启停：覆盖按钮 / Esc / 背景等所有关闭路径
    var modal = byId('gp-knowledge');
    if (modal && typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (modal.classList.contains('show')) { if (e3d) e3d.open(); }
        else { if (e3d) e3d.close(); }
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function renderHero() {
    var hero = byId('gp-k-hero');
    if (!hero) return;
    hero.innerHTML = '' +
      '<h3 class="gp-k-h3">剖开地球：3D 内部圈层</h3>' +
      '<p class="gp-note">拖动旋转 · 点任意一层（或下方按钮）查看详情 · 「拆解」把四层分开、「搭建」复原。比例为便于观察的示意比例（已放大内核/外核），真实地壳极薄、地幔占地球体积八成以上。</p>' +
      '<div class="gp-k-3dwrap" id="gp-k-3dwrap">' +
        '<canvas class="gp-k-3d" id="gp-k-3d" aria-label="地球内部圈层 3D 模型，可旋转与拆解"></canvas>' +
        '<div class="gp-k-3dbar">' +
          '<button type="button" class="gp-k-3dbtn" id="gp-k-explode" aria-pressed="false">拆解</button>' +
          '<button type="button" class="gp-k-3dbtn" id="gp-k-spin" aria-pressed="false">自动旋转</button>' +
          '<button type="button" class="gp-k-3dbtn" id="gp-k-reset">复位视角</button>' +
        '</div>' +
        '<p class="gp-k-3dhint" id="gp-k-3dhint">提示：剖面切口用同心环显示四层；滚轮可缩放，点击某层查看详情。</p>' +
      '</div>';
    init3D(hero);
  }

  function renderLayerPanel(root) {
    var btns = LAYERS.map(function (l) {
      return '<button type="button" class="gp-k-layer-btn" data-layer="' + l.id + '">' + esc(l.name) + '</button>';
    }).join('');
    var discs = DISCS.map(discCard).join('');
    root.innerHTML = '' +
      '<h3 class="gp-k-h3">逐层查看</h3>' +
      '<div class="gp-k-layer-btns">' + btns + '</div>' +
      '<div class="gp-k-detail" id="gp-k-detail">' + layerCard(LAYERS[0]) + '</div>' +
      '<h3 class="gp-k-h3">三个地震不连续面</h3>' +
      '<p class="gp-note">科学家正是通过这些“界面”才看清地球内部的分层。</p>' +
      '<div class="gp-k-discs">' + discs + '</div>';
  }

  function renderTopics(root) {
    root.innerHTML = TOPICS.map(topicCard).join('');
  }

  function setActiveLayer(root, id) {
    var detail = byId('gp-k-detail');
    if (detail) detail.innerHTML = layerCard(findLayer(id));
    var btns = root.querySelectorAll('.gp-k-layer-btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].classList.toggle('active', btns[j].getAttribute('data-layer') === id);
    }
    if (e3d) e3d.setActive(id);
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    var root = byId('gp-k-layer');
    var topics = byId('gp-k-topics');
    var btn = byId('gp-knowledge-btn');
    var modal = byId('gp-knowledge');
    if (!root || !topics || !btn || !modal) return; // 容器缺失时静默退出，不阻断主程序

    renderHero();
    renderLayerPanel(root);
    renderTopics(topics);
    setActiveLayer(root, LAYERS[0].id);

    // 打开 / 关闭
    btn.addEventListener('click', function () { modal.classList.add('show'); });
    var close = byId('gp-knowledge-close');
    if (close) close.addEventListener('click', function () { modal.classList.remove('show'); });

    // 层点击：事件委托（SVG 命中圈 / 文字按钮均可）
    root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-layer]') : null;
      if (t) setActiveLayer(root, t.getAttribute('data-layer'));
    });

    // Esc 兜底：本弹窗处于打开状态时关闭（game.js 也会遍历 .gp-modal.show 关闭，二者重复无害）
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        modal.classList.remove('show');
      }
    });

    // 暴露调试入口（不依赖主程序）
    window.__GP_KNOWLEDGE_READY = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
