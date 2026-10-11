/* ============================================================
   冰火守门人 —— 场景 / 难度 / 水平定义（/guardian/js/scenes.js）
   ------------------------------------------------------------
   场景：5 张地图，各自有地面贴图、天空、装饰物与元素偏向，
         少数场景带专属机制（沙暴视野、岩浆喷发…），靠等级解锁。
   难度：4 档，缩放魔物血量 / 速度 / 出怪密度 / 生命 / 收益。
   水平：玩家守门人等级（1-30 级），给被动加成，形成长期追求。
   ============================================================ */
var Config = (function () {
  "use strict";

  /* ================= 场景 ================= */
  var SCENES = [
    {
      id: "frost", name: "霜原隘口", icon: "❄", unlock: 1,
      elem: "ice", elemBias: 0.86,
      tex: { ridgeSeed: 3, ridge: "rgba(40,54,80,.72)", skyTop: "#101a2e", skyBottom: "#5c7fa8", fog: "rgba(176,206,236,.36)", ground: "#46586f", groundFar: "rgba(30,44,66,.85)", laneLine: "rgba(226,244,255,.16)" },
      deco: ["deco-pine", "deco-icespike", "deco-pine"],
      desc: "常年风雪，冰魔成群。火娃的主场。",
      perk: null
    },
    {
      id: "lava", name: "熔岩裂谷", icon: "🔥", unlock: 3,
      elem: "rock", elemBias: 0.86,
      tex: { ridgeSeed: 11, ridge: "rgba(52,20,12,.72)", skyTop: "#2a0f0a", skyBottom: "#c0552a", fog: "rgba(255,150,90,.30)", ground: "#4a2318", groundFar: "rgba(60,20,12,.85)", laneLine: "rgba(255,206,160,.16)" },
      deco: ["deco-brazier", "deco-boulder", "deco-brazier"],
      desc: "岩浆奔流，岩魔横行。水娃的主场。",
      perk: "lava"      /* 周期性地面喷发，踩到掉血 */
    },
    {
      id: "forest", name: "翡翠林地", icon: "🌿", unlock: 5,
      elem: "mix", elemBias: 0.5,
      tex: { ridgeSeed: 7, ridge: "rgba(18,40,24,.6)", skyTop: "#16301f", skyBottom: "#7fb98a", fog: "rgba(180,226,180,.30)", ground: "#2c4a34", groundFar: "rgba(26,50,32,.85)", laneLine: "rgba(226,255,214,.15)" },
      deco: ["deco-pine", "deco-boulder", "deco-pine"],
      desc: "冰岩混编，最考验临场切换。",
      perk: null
    },
    {
      id: "sand", name: "风蚀荒漠", icon: "🏜", unlock: 8,
      elem: "mix", elemBias: 0.5,
      tex: { ridgeSeed: 19, ridge: "rgba(70,50,26,.62)", skyTop: "#3a2a14", skyBottom: "#e0b976", fog: "rgba(240,214,160,.36)", ground: "#6b5430", groundFar: "rgba(78,56,28,.85)", laneLine: "rgba(255,244,214,.14)" },
      deco: ["deco-cactus", "deco-boulder", "deco-pillar"],
      desc: "沙暴来袭，视野时明时暗，靠节奏硬顶。",
      perk: "sandstorm"
    },
    {
      id: "citadel", name: "幽都城门", icon: "🏯", unlock: 12,
      elem: "boss", elemBias: 0.5,
      tex: { ridgeSeed: 5, ridge: "rgba(24,18,40,.75)", skyTop: "#120e22", skyBottom: "#6a5aa8", fog: "rgba(190,178,240,.30)", ground: "#2a2342", groundFar: "rgba(28,22,46,.85)", laneLine: "rgba(232,224,255,.16)" },
      deco: ["deco-pillar", "deco-banner", "deco-pillar"],
      desc: "巨像坐镇，强敌环伺。检验你的极限。",
      perk: "bossrush"
    }
  ];

  /* ================= 难度 ================= */
  var DIFFS = [
    { id: "easy", name: "休闲", icon: "🍃", hpMul: 0.78, spMul: 0.86, spawnMul: 0.82, lives: 6, coinMul: 0.8, tag: "轻松体验剧情" },
    { id: "normal", name: "标准", icon: "⚖", hpMul: 1.0, spMul: 1.0, spawnMul: 1.0, lives: 5, coinMul: 1.0, tag: "推荐难度" },
    { id: "hard", name: "挑战", icon: "⚔", hpMul: 1.35, spMul: 1.14, spawnMul: 1.24, lives: 4, coinMul: 1.45, tag: "魔物更强更密" },
    { id: "hell", name: "地狱", icon: "💀", hpMul: 1.8, spMul: 1.3, spawnMul: 1.5, lives: 3, coinMul: 2.0, tag: "一条命都不能丢" }
  ];

  /* ================= 水平（守门人等级加成） ================= */
  var LEVELS = [
    { lv: 1, title: "见习守门人", speed: 1.00, rate: 1.00, hpBonus: 0 },
    { lv: 4, title: "巡夜守门人", speed: 1.05, rate: 1.06, hpBonus: 10 },
    { lv: 8, title: "铁壁守门人", speed: 1.10, rate: 1.12, hpBonus: 20 },
    { lv: 14, title: "霜刃守门人", speed: 1.15, rate: 1.18, hpBonus: 30 },
    { lv: 20, title: "炎心守门人", speed: 1.20, rate: 1.24, hpBonus: 40 },
    { lv: 27, title: "双生守门大师", speed: 1.26, rate: 1.32, hpBonus: 55 }
  ];
  function levelInfo(lv) {
    var out = LEVELS[0];
    for (var i = 0; i < LEVELS.length; i++) if (lv >= LEVELS[i].lv) out = LEVELS[i];
    return out;
  }

  /* 等级曲线：升到 lv+1 需要的累计经验 */
  function xpFor(lv) { return Math.round(120 * Math.pow(lv, 1.45)); }

  /* 模式键：用于排行榜分桶 */
  function modeKey(sceneId, diffId) { return sceneId + ":" + diffId; }
  function modeLabel(sceneId, diffId) {
    var s = sceneById(sceneId), d = diffById(diffId);
    return (s ? s.name : sceneId) + " · " + (d ? d.name : diffId);
  }
  function sceneById(id) { for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return SCENES[i]; return null; }
  function diffById(id) { for (var i = 0; i < DIFFS.length; i++) if (DIFFS[i].id === id) return DIFFS[i]; return null; }

  /* 全部模式键（排行榜下拉用） */
  function allModes() {
    var out = [];
    SCENES.forEach(function (s) { DIFFS.forEach(function (d) { out.push({ key: modeKey(s.id, d.id), scene: s.id, diff: d.id, label: modeLabel(s.id, d.id) }); }); });
    return out;
  }

  return {
    SCENES: SCENES, DIFFS: DIFFS, LEVELS: LEVELS,
    sceneById: sceneById, diffById: diffById, levelInfo: levelInfo, xpFor: xpFor,
    modeKey: modeKey, modeLabel: modeLabel, allModes: allModes
  };
})();
