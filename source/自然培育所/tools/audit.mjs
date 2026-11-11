#!/usr/bin/env node
/* ============================================================
   Nature Lab · 自动化验收（商业级发布的冒烟测试）
   ------------------------------------------------------------
   运行： node tools/audit.mjs
   无依赖，Node 18+。

   覆盖：
   A. 数据完整性：物种/阶段/图片资源
   B. 经济平衡：每个物种「收获价值 > 种子价」
   C. 纯逻辑：品质分级、存档结构校验、版本迁移
   D. 存档可靠性：保存→加载往返、损坏主档→备份回滚
   E. 多用户：档案命名空间隔离、旧版存档迁移
   F. 工程：脚本加载顺序、HTML id 唯一性、CSS 括号平衡
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'game');
const JS = path.join(GAME, 'js');
const SPRITES = path.join(GAME, 'assets', 'sprites');

const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });
const read = f => fs.readFileSync(f, 'utf8');

class MemoryStorage {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  get length() { return this.map.size; }
  key(i) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

function makeContext(storageSeed = {}) {
  const storage = new MemoryStorage(storageSeed);
  const win = { crypto: webcrypto, localStorage: storage, addEventListener() { }, removeEventListener() { } };
  const ctx = vm.createContext({
    console, Math, Date, JSON, isFinite, parseInt, parseFloat, String, Number, Array, Object,
    Set, Map, TextEncoder, Uint8Array, Blob: class { }, URL: { createObjectURL: () => '', revokeObjectURL() { } },
    localStorage: storage, window: win, navigator: { storage: {} },
    __imgExists: stem => fs.existsSync(path.join(SPRITES, stem + '.webp')),
    __files: fs
  });
  ctx.globalThis = ctx;
  return { ctx, storage };
}

/* ---------------- A/B/C/D：主逻辑上下文 ---------------- */
const mainSrc = ['account.js', 'data.js', 'season.js', 'engine.js'].map(f => read(path.join(JS, f))).join('\n;\n');
const testSrc = `
const R = [];
const ok = (name, cond, detail) => R.push({ name, pass: !!cond, detail: detail || '' });

// A. 物种与资源
ok('物种数量为 18', SPECIES_ORDER.length === 18, '实际 ' + SPECIES_ORDER.length);
let stageCount = 0, missingImg = [];
SPECIES_ORDER.forEach(id => {
  const sp = SPECIES[id];
  ok('物种键一致：' + id, !!sp && sp.id === id);
  stageCount += sp.stages.length;
  sp.stages.forEach(st => {
    if (!__imgExists(st.img)) missingImg.push(id + '/' + st.img);
  });
});
ok('全部阶段图存在', missingImg.length === 0, missingImg.slice(0, 6).join(', '));
ok('阶段总数 >= 90', stageCount >= 90, '实际 ' + stageCount);

// B. 经济平衡：以 B 级（75 分）为基准，收获必须高于种子价
let badEcon = [];
let minRatio = 99, maxRatio = 0;
SPECIES_ORDER.forEach(id => {
  const sp = SPECIES[id];
  const seed = seedPrice(sp);
  const harvest = harvestValue(sp, 75).coins;
  const ratio = harvest / seed;
  minRatio = Math.min(minRatio, ratio);
  maxRatio = Math.max(maxRatio, ratio);
  if (!(harvest > seed * 1.15)) badEcon.push(id + ' 种' + seed + ' 收' + harvest);
});
ok('18 物种单轮净利为正（>15% 安全垫）', badEcon.length === 0, badEcon.join(' | '));
ok('收益曲线比在 1.15–4.0 之间', minRatio > 1.15 && maxRatio < 4.0, 'min ' + minRatio.toFixed(2) + ' max ' + maxRatio.toFixed(2));

// C. 品质分级边界
const g = q => qualityGrade(q).rank;
ok('品质边界 92=S', g(92) === 'S' && g(91) === 'A');
ok('品质边界 80=A', g(80) === 'A' && g(79) === 'B');
ok('品质边界 66=B', g(66) === 'B' && g(65) === 'C');
ok('品质边界 50=C', g(50) === 'C' && g(49) === 'D');

// 存档结构校验
ok('拒绝空对象', validateSaveShape(null) === false && validateSaveShape({}) === false);
ok('拒绝未来版本', validateSaveShape({ version: 99, day: 1, coins: 0, slots: [] }) === false);
ok('接受默认存档', validateSaveShape(DEFAULT_STATE()) === true);

// 版本迁移 v1 -> v2
const v1 = { version: 1, day: 3, coins: 40, slots: [{ id: 1, unlocked: true, plot: null }], log: [], records: [] };
ok('v1 迁移到 v2', migrateSave(v1) === true && v1.version === 2);
ok('迁移补齐手账字段', !!v1.quests && typeof v1.quests.done === 'object');

// D. 存档往返
const st = DEFAULT_STATE();
st.day = 7; st.coins = 999; st.level = 3;
st.slots[0].speciesId = 'tomato';
saveGame(st);
const back = loadGame();
ok('存档保存后可加载', !!back);
ok('往返保留天数/金币/等级', back.day === 7 && back.coins === 999 && back.level === 3, JSON.stringify({ d: back && back.day, c: back && back.coins }));
ok('保存后自动生成备份', !!localStorage.getItem(backupKey(1, 1)));

// 损坏主档 -> 自动回滚备份
localStorage.setItem(SLOT_KEY(1), '{broken json');
const rec = loadGame();
ok('主档损坏时回滚到备份', !!rec && rec.day === 7, rec ? 'day ' + rec.day : 'null');
ok('损坏原文被隔离保留', !!localStorage.getItem(_storeKey('save.v1.corrupt')));

// 成就 id 唯一
const ids = ACHIEVEMENTS.map(a => a.id);
ok('成就 id 无重复', new Set(ids).size === ids.length, '共 ' + ids.length);
ok('成就数量 >= 28', ACHIEVEMENTS.length >= 28);

// 存档槽数量与解锁
ok('4 个培育位，初始解锁 1 个', DEFAULT_STATE().slots.length === 4 && DEFAULT_STATE().slots.filter(s => s.unlocked).length === 1);

// E. 档案命名空间
const a1 = NL.accounts()[0];
const a2 = NL.create('测试档案 B', '🌸', { persist: false });
ok('新档案写入注册表', NL.accounts().length === 2);
ok('两个档案命名空间不同', NL.prefixOf(a1) !== NL.prefixOf(a2) && NL.prefixOf(a2).indexOf(a2.id) > 0);
ok('当前档案保持有效', !!NL.active() && NL.active().id === a1.id);

globalThis.__RESULT = R;
`;

const main = makeContext();
vm.runInContext(mainSrc + '\n' + testSrc, main.ctx, { filename: 'bundle.js' });
results.push(...main.ctx.__RESULT);

/* ---------------- E2：旧版数据迁移（独立上下文） ---------------- */
const legacyCtx = makeContext({
  'naturelab.save.v1.slot1': JSON.stringify({ version: 2, day: 11, coins: 321, slots: [], log: [], records: [] }),
  'naturelab.prefs': JSON.stringify({ fontScale: 1.12 })
});
vm.runInContext(read(path.join(JS, 'account.js')), legacyCtx.ctx, { filename: 'account.js' });
const legacyAcc = legacyCtx.ctx.window.NL.active();
const pfx = legacyCtx.ctx.window.NL.prefixOf(legacyAcc);
ok('首次启动自动创建默认档案', !!legacyAcc && legacyAcc.name === '培育员');
ok('旧存档迁入档案命名空间', legacyCtx.storage.getItem(pfx + 'save.v1.slot1') !== null);
ok('旧设置迁入档案命名空间', legacyCtx.storage.getItem(pfx + 'prefs') !== null);
ok('迁移后不残留旧键', legacyCtx.storage.getItem('naturelab.save.v1.slot1') === null);
ok('全局注册表未被迁移', legacyCtx.storage.getItem('naturelab.accounts.v1') !== null);

/* ---------------- F：工程静态检查 ---------------- */
const html = read(path.join(GAME, 'index.html'));
const scripts = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);
ok('脚本数量 >= 27', scripts.length >= 27, '实际 ' + scripts.length);
ok('account.js 最先加载', scripts[0] === 'account.js');
ok('engine.js 早于 ui.js', scripts.indexOf('engine.js') < scripts.indexOf('ui.js'));
ok('app.js 最后加载', scripts[scripts.length - 1] === 'app.js');
ok('所有脚本文件存在', scripts.every(s => fs.existsSync(path.join(JS, s))), scripts.filter(s => !fs.existsSync(path.join(JS, s))).join(', '));

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);
ok('HTML id 唯一', dupIds.length === 0, [...new Set(dupIds)].join(', '));

const css = read(path.join(GAME, 'css', 'style.css'));
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
const open = (stripped.match(/{/g) || []).length, close = (stripped.match(/}/g) || []).length;
ok('CSS 括号平衡', open === close, open + ' / ' + close);
ok('新增档案样式存在', css.includes('.accBox') && css.includes('.lockScreen') && css.includes('.storageWarn'));

// 用户可见文案不应出现未替换的占位符
const uiSrc = read(path.join(JS, 'ui.js'));
ok('无遗留 TODO/FIXME 占位', !/TODO|FIXME|XXX/.test(uiSrc));
ok('版本号已升级到 2.0', read(path.join(JS, 'account.js')).includes("NL_APP_VERSION = '2.0'"));

/* ---------------- 输出 ---------------- */
const pass = results.filter(r => r.pass).length;
const fail = results.length - pass;
console.log('\n自然培育所 · 商业级验收\n' + '='.repeat(46));
for (const r of results) {
  console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.detail ? '  [' + r.detail + ']' : ''));
}
console.log('='.repeat(46));
console.log(`合计 ${results.length} 项：通过 ${pass}，失败 ${fail}\n`);
process.exit(fail ? 1 : 0);
