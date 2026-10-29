#!/usr/bin/env node
/* 生活换算-全能手册 · 交付前验证脚本
 * 用法: node verify.js  （在 myBlog 目录下运行，需已安装 jsdom）
 * 检查项:
 *   1. 提取 index.html 全部内联脚本并做 node --check 语法校验
 *   2. TABLE_EN / SUB_EN 双语字典与模块静态核对
 *   3. jsdom 真实 DOM 双语全模块冒烟遍历（渲染 + 英文模式中文残留检查 + 窗口报错收集）
 * 任何一项失败即退出码 1。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const HTML = path.join(ROOT, 'index.html');
const TMP = path.join(ROOT, '.verify_tmp');
const ZH_RE = /[\u4e00-\u9fff]/;

let failed = 0;
function ok(msg){ console.log('  ✔ ' + msg); }
function bad(msg){ console.log('  ✘ ' + msg); failed++; }

/* ---------- 1. 语法校验 ---------- */
function step1(){
  console.log('\n[1/3] 语法校验 (node --check)');
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const html = fs.readFileSync(HTML, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((s, i) => fs.writeFileSync(path.join(TMP, `s${i}.js`), s));
  let pass = 0;
  for(let i = 0; i < scripts.length; i++){
    const r = spawnSync(process.execPath, ['--check', path.join(TMP, `s${i}.js`)], { encoding: 'utf8' });
    if(r.status !== 0){ bad(`脚本 #${i}: ${String(r.stderr).split('\n')[0]}`); }
    else pass++;
  }
  if(pass === scripts.length) ok(`${scripts.length} 个内联脚本语法全部通过`);
}

/* ---------- 2. 字典静态核对 ---------- */
function step2(){
  console.log('\n[2/3] 双语字典静态核对');
  const html = fs.readFileSync(HTML, 'utf8');
  const main = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
    .find(s => s.includes('const CATS'));
  // TABLE_EN: 解析为 JSON，取 keys（含按批次追加的 TABLE_EN_MORE）
  const tm = main.match(/const TABLE_EN = (\{[\s\S]*?\});\s*\n/);
  let tableKeys = [];
  if(tm){
    try { tableKeys = Object.keys(JSON.parse(tm[1])); ok(`TABLE_EN 解析成功，${tableKeys.length} 个键`); }
    catch(e){ bad('TABLE_EN 不是合法 JSON: ' + e.message); }
  } else bad('未找到 TABLE_EN 定义');
  const tm2 = main.match(/const TABLE_EN_MORE = (\{[\s\S]*?\n\});/);
  if(tm2){
    try {
      const more = Object.keys(JSON.parse(tm2[1]));
      tableKeys = tableKeys.concat(more);
      ok(`TABLE_EN_MORE 追加 ${more.length} 个键（${more.join(', ')}）`);
    } catch(e){ bad('TABLE_EN_MORE 不是合法 JSON: ' + e.message); }
  }
  // 表格模块 id（id 与 type:'tables' 在同一行，id 在前）
  const typeTables = [...main.matchAll(/\{[^{}\n]*?id:\s*'([a-z0-9_]+)'[^{}\n]*?type:\s*'tables'/g)].map(m => m[1]);
  if(typeTables.length){
    const missing = typeTables.filter(id => !tableKeys.includes(id));
    if(missing.length) bad(`表格模块缺 TABLE_EN 键: ${missing.join(', ')}`);
    else ok(`${typeTables.length} 个表格模块的 TABLE_EN 键齐全`);
  } else bad('未识别到 type:\'tables\' 模块');
  // SUB_EN 存在且非空
  if(/const SUB_EN = \{[\s\S]*?\}/.test(main)) ok('SUB_EN 字典存在');
  else bad('未找到 SUB_EN 字典');
  // CATS 模块数
  const nMods = (main.match(/id:\s*'/g) || []).length;
  console.log(`  · 模块定义约 ${nMods} 处`);
}

/* ---------- 2.5 全表数据体检（在 jsdom 内取真实 CATS / TABLE_EN） ---------- */
function auditData(doc, window){
  const sc = doc.createElement('script');
  sc.textContent = 'window.__audit = { cats: CATS, en: TABLE_EN, groups: (typeof GROUP_ORDER !== "undefined" ? GROUP_ORDER : []) };';
  doc.body.appendChild(sc);
  const A = window.__audit;
  if(!A || !A.cats){ bad('数据体检：无法访问 CATS（注入失败）'); return; }

  const ids = Object.create(null), dupIds = [], badGroup = [];
  const rowBad = [], headBad = [], enBad = [], emptyCells = [];
  let secs = 0, rows = 0, cells = 0, tables = 0, widgets = 0;

  A.cats.forEach(c=>{
    if(ids[c.id]) dupIds.push(c.id); else ids[c.id] = 1;
    if(A.groups.length && c.g && A.groups.indexOf(c.g) < 0) badGroup.push(c.id + ' → ' + c.g);
    if(c.type !== 'tables' || !c.sections) return;
    tables++;
    const titles = Object.create(null);
    c.sections.forEach((sec, i)=>{
      secs++;
      if(sec.html && !sec.head){ widgets++; return; }   // 交互式子面板，不是表格
      if(!sec.title) headBad.push(c.id + '#' + (i+1) + ' 缺小节标题');
      else if(titles[sec.title]) headBad.push(c.id + ' 小节标题重复「' + sec.title + '」');
      else titles[sec.title] = 1;
      if(!Array.isArray(sec.head) || !sec.head.length){ headBad.push(c.id + '#' + (i+1) + ' 缺表头'); return; }
      if(!Array.isArray(sec.rows) || !sec.rows.length){ headBad.push(c.id + '#' + (i+1) + ' 无数据行'); return; }
      sec.rows.forEach((r, ri)=>{
        rows++; cells += r.length;
        if(r.length !== sec.head.length) rowBad.push(c.id + '#' + (i+1) + ' 第' + (ri+1) + '行 ' + r.length + ' 列 ≠ 表头 ' + sec.head.length);
        r.forEach((v, vi)=>{ if(v === '' || v == null) emptyCells.push(c.id + '#' + (i+1) + ' 第' + (ri+1) + '行第' + (vi+1) + '列'); });
      });
    });
    const en = A.en && A.en[c.id];
    if(!en) return;
    if(en.length !== c.sections.length) enBad.push(c.id + ' 英文 ' + en.length + ' 节 ≠ 中文 ' + c.sections.length + ' 节');
    en.forEach((es, i)=>{
      const zs = c.sections[i];
      if(!zs) return;
      if(es.head && zs.head && es.head.length !== zs.head.length) enBad.push(c.id + '#' + (i+1) + ' 英文表头 ' + es.head.length + ' ≠ 中文 ' + zs.head.length);
      if(es.rows){
        if(zs.rows && es.rows.length !== zs.rows.length) enBad.push(c.id + '#' + (i+1) + ' 英文 ' + es.rows.length + ' 行 ≠ 中文 ' + zs.rows.length + ' 行');
        es.rows.forEach((r, ri)=>{
          if(Array.isArray(es.head) && r.length !== es.head.length) enBad.push(c.id + '#' + (i+1) + ' 英文第' + (ri+1) + '行 ' + r.length + ' 列 ≠ 表头 ' + es.head.length);
        });
      }
    });
  });

  const list = a => a.slice(0, 3).join('；') + (a.length > 3 ? ` …共 ${a.length} 处` : '');
  if(dupIds.length) bad('模块 id 重复：' + list(dupIds)); else ok(`${A.cats.length} 个模块 id 无重复`);
  if(badGroup.length) bad('分组名不在 GROUP_ORDER：' + list(badGroup)); else ok('全部分组名都在 GROUP_ORDER 内');
  if(rowBad.length) bad('表格行列数不符：' + list(rowBad)); else ok(`${tables} 张表 / ${rows} 行的列数与表头一致`);
  if(headBad.length) bad('表格结构问题：' + list(headBad)); else ok(`${secs - widgets} 个表格小节标题与表头齐全、无重复（另有 ${widgets} 个交互式子面板）`);
  if(emptyCells.length) bad('空单元格：' + list(emptyCells)); else ok(`${cells} 个单元格无空缺`);

  /* 数据新鲜度：chk 字段格式合法、覆盖足够、互不越界 */
  const chks = A.cats.filter(c=>c.chk);
  const fmtBad = chks.filter(c=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.chk)).map(c=>c.id);
  if(fmtBad.length) bad('核对日期格式非法：' + list(fmtBad));
  else if(chks.length >= 25) ok(`数据核对角标覆盖 ${chks.length} 个时效模块，日期格式全部合法`);
  else bad('核对角标覆盖不足（' + chks.length + ' 个，需 ≥25）');
  if(enBad.length) bad('中英表格不对齐：' + list(enBad)); else ok('中英表格节数 / 表头 / 行数全部对齐');

  // 英文小节不得回退中文行：英文模式必须整表英文
  let reuseZh = 0; const reuseMods = new Set();
  A.cats.filter(c=>c.type==='tables'&&c.sections).forEach(c=>{
    const en = A.en && A.en[c.id]; if(!en) return;
    c.sections.forEach((zs,i)=>{ const es = en[i];
      if(zs.html || !zs.rows || (es && es.rows)) return;
      if(zs.rows.some(r=>r.some(v=>ZH_RE.test(String(v))))){ reuseZh++; reuseMods.add(c.id); }
    });
  });
  if(reuseZh) bad('仍有 ' + reuseZh + ' 个英文小节复用中文行：' + [...reuseMods].join(', '));
  else ok('没有任何英文小节回退到中文行');
}

/* ---------- 3. jsdom 冒烟遍历 ---------- */
async function step3(){
  console.log('\n[3/3] jsdom 双语全模块冒烟遍历');
  let JSDOM;
  try { JSDOM = require('jsdom').JSDOM; }
  catch(e){ bad('缺少 jsdom（在 myBlog 目录 npm i jsdom）: ' + e.message); return; }
  const html = fs.readFileSync(HTML, 'utf8');
  const errors = [];
  const dom = new JSDOM(html, {
    url: 'http://localhost/toolbox/units.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w){
      w.matchMedia = w.matchMedia || (q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
      w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
      w.scrollTo = () => {};
      if(!w.TextEncoder) w.TextEncoder = require('util').TextEncoder;
      if(!w.URL.createObjectURL) w.URL.createObjectURL = () => 'blob:stub';
      if(!w.URL.revokeObjectURL) w.URL.revokeObjectURL = () => {};
      if(!w.navigator.serviceWorker){
        Object.defineProperty(w.navigator, 'serviceWorker', { value: { register: () => Promise.reject(new Error('sw stub')) }, configurable: true });
      }
      w.fetch = () => Promise.reject(new Error('fetch stub'));
      if(w.HTMLCanvasElement) w.HTMLCanvasElement.prototype.getContext = function(){ return null; };
      w.addEventListener('error', e => errors.push('window: ' + e.message));
    }
  });
  const { window } = dom;
  const doc = window.document;

  console.log('  · 数据体检');
  try{ auditData(doc, window); }catch(e){ bad('数据体检抛错: ' + e.message); }

  function traverse(lang){
    let n = 0, badOnes = [];
    /* 每次按 data-id 重新查询：导航在切换模块后会重建，缓存的旧节点会失效 → 空转 */
    const ids = [...doc.querySelectorAll('.nitem')].map(b=>b.dataset.id);
    for(const id of ids){
      const it = doc.querySelector('.nitem[data-id="' + id + '"]');
      if(!it){ badOnes.push(id + '(导航项消失)'); continue; }
      it.click();
      const mainEl = doc.getElementById('main');
      const text = mainEl ? mainEl.textContent.trim() : '';
      const hasH2 = mainEl && mainEl.querySelector('h2');
      if(!text || !hasH2){ badOnes.push(id + '(空面板)'); continue; }
      if(lang === 'en'){
        const h2 = mainEl.querySelector('h2').textContent;
        if(ZH_RE.test(h2)) badOnes.push(id + `(英文标题残留中文: ${h2})`);
      }
      n++;
    }
    return { n, badOnes };
  }

  // 中文模式
  let r = traverse('zh');
  if(r.badOnes.length){ bad(`中文模式 ${r.badOnes.length} 项异常: ` + r.badOnes.slice(0, 5).join('; ')); }
  else ok(`中文模式 ${r.n}/${r.n} 个导航项渲染正常`);
  // 切英文
  const btn = doc.getElementById('langBtn');
  if(btn){ btn.click(); } else { window.eval("LANG='en'; updateStatic && updateStatic(); render && render();"); }
  r = traverse('en');
  if(r.badOnes.length){ bad(`英文模式 ${r.badOnes.length} 项异常: ` + r.badOnes.slice(0, 5).join('; ')); }
  else ok(`英文模式 ${r.n}/${r.n} 个导航项渲染正常，标题零中文`);
  /* 英文模式下早期硬件/装修/健康表格应为纯英文（V8.4 五金四件 + V8.5 其余 13 个模块） */
  const hwBad = [];
  const EN_PURE = ['wrench','pipe','bolt','drill','appbuy','storage','customfit','contract','waterproof',
                   'checkup','network','gassafe','electric','oldhouse','plumbing','tilelayout','homesize'];
  EN_PURE.forEach(id=>{
    const it = doc.querySelector('.nitem[data-id="' + id + '"]');
    if(!it) return;
    it.click();
    const txt = doc.getElementById('main').textContent;
    if(ZH_RE.test(txt)) hwBad.push(id);
  });
  if(hwBad.length) bad('英文模式下仍有中文的表格模块: ' + hwBad.join(', '));
  else ok(`英文模式下 ${EN_PURE.length} 个硬件/装修/健康模块整页为纯英文`);

  // 切回中文再验一次（语言往返）
  if(btn) btn.click();
  r = traverse('zh');
  if(r.badOnes.length){ bad(`往返后中文模式 ${r.badOnes.length} 项异常`); }
  else ok(`往返切换后 ${r.n}/${r.n} 正常`);

  const realErr = errors.filter(e => !/sw stub|fetch stub|ResizeObserver|Not implemented/.test(e));
  if(realErr.length){ bad(`窗口报错 ${realErr.length} 条: ` + realErr.slice(0, 3).join(' | ')); }
  else ok('零窗口报错');

  /* ---------- 功能抽查：组合工作台 / 存为图片 ---------- */
  async function step4(){
    try{
      const comboNav = doc.querySelector('.nitem[data-id="combo"]');
      if(!comboNav){ bad('找不到「组合工作台」导航项'); return; }
      comboNav.click();
      const inp = doc.querySelector('.comrow[data-i="0"] .cv');
      const out = doc.querySelector('.comrow[data-i="0"] .cout');
      if(!inp || !out){ bad('组合工作台首行未渲染'); return; }
      inp.value = '1';
      inp.dispatchEvent(new window.Event('input', { bubbles: true }));
      const got = parseFloat(out.textContent);
      if(Math.abs(got - 3.2808399) < 1e-4) ok(`组合工作台实时换算 1 m = ${out.textContent} ft`);
      else bad(`组合工作台换算异常：1 m → ${out.textContent} ft（应为 3.2808399）`);
      const before = doc.querySelectorAll('.comrow').length;
      doc.getElementById('comAdd').click();
      const added = doc.querySelectorAll('.comrow').length;
      if(added === before + 1) ok(`添加一行正常（${before} → ${added}）`); else bad(`添加一行失败（${before} → ${added}）`);
      const del = doc.querySelector('.comrow[data-i="' + (added - 1) + '"] .cdel');
      if(del){ del.click(); }
      const after = doc.querySelectorAll('.comrow').length;
      if(after === before) ok('删除一行正常'); else bad(`删除一行失败（${added} → ${after}）`);

      const unitsNav = doc.querySelector('.nitem[data-id="length"]');
      if(unitsNav){
        unitsNav.click();
        const sb = doc.getElementById('snapBtn');
        if(sb){ sb.click(); ok('「存为图片」按钮存在，点击无异常（无 canvas 时自动降级）'); }
        else bad('单位面板缺少「存为图片」按钮');
      }

      /* 值框认算式 */
      const unitsNav0 = doc.querySelector('.nitem[data-id="length"]');
      if(unitsNav0){
        unitsNav0.click();
        const va = doc.getElementById('va'), vb = doc.getElementById('vb');
        const ua = doc.getElementById('ua'), ub = doc.getElementById('ub');
        const hint = doc.getElementById('vaEval');
        if(va && vb && ua && ub){
          ua.value = '3'; ub.value = '4';   // 米 → 千米
          ub.dispatchEvent(new window.Event('change', { bubbles: true }));
          va.value = '12*8';
          va.dispatchEvent(new window.Event('input', { bubbles: true }));
          const shown = parseFloat(vb.value);
          if(Math.abs(shown - 96 / 1000) < 1e-6) ok(`值框算式 12*8 → ${vb.value} km（96 m）`);
          else bad(`值框算式异常：12*8 → ${vb.value} km（应为 0.096）`);
          if(hint && /96/.test(hint.textContent)) ok('算式提示行显示 ' + hint.textContent.trim());
          else bad('算式提示行未显示计算结果');
          va.dispatchEvent(new window.Event('change', { bubbles: true }));
          if(va.value === '96') ok('失焦后算式自动换成结果 96');
          else bad(`失焦未换算成数字，仍为 ${va.value}`);
        } else bad('单位面板缺少数值框');
      }

      /* 速查表导出与复制 */
      const contractNav = doc.querySelector('.nitem[data-id="contract"]');
      if(contractNav){
        contractNav.click();
        const ex = doc.getElementById('expTbl'), cp = doc.getElementById('copyTbl');
        if(ex && cp){
          ex.click(); cp.click();
          ok('速查表「导出 Excel」「复制表格」按钮存在且点击无异常');
          const msg = doc.getElementById('tblMsg');
          if(msg && msg.textContent) ok('导出/复制反馈：' + msg.textContent.trim());
        } else bad('速查表缺少导出或复制按钮');
      }

      /* 速查表本页筛选 */
      {
        const fl = doc.getElementById('tblFilter');
        if(fl){
          const cnt = doc.getElementById('tblCount');
          const visible = ()=> [].filter.call(doc.querySelectorAll('#main tbody tr'), r=>!r.classList.contains('fhide')).length;
          const all = visible();
          fl.value = '违约金';
          fl.dispatchEvent(new window.Event('input', { bubbles: true }));
          const hit = visible();
          if(hit > 0 && hit < all) ok(`速查表筛选「违约金」命中 ${hit}/${all} 行`);
          else bad(`速查表筛选异常：${hit}/${all} 行可见`);
          if(cnt && /命中/.test(cnt.textContent)) ok('筛选计数提示：' + cnt.textContent.trim());
          else bad('筛选计数提示未出现');
          fl.value = '';
          fl.dispatchEvent(new window.Event('input', { bubbles: true }));
          if(visible() === all) ok('清空筛选后全部行恢复');
          else bad(`清空筛选未恢复（${visible()}/${all}）`);
        } else bad('速查表缺少筛选框');
      }

      /* 公式行 */
      {
        const comboNav2 = doc.querySelector('.nitem[data-id="combo"]');
        if(comboNav2){
          comboNav2.click();
          const fxBtn = doc.getElementById('comFx');
          if(fxBtn){
            fxBtn.click();
            const rws = doc.querySelectorAll('.comrow');
            const last = rws[rws.length - 1];
            const cv = last.querySelector('.cv'), cf = last.querySelector('.cfx'), co = last.querySelector('.cout');
            if(cv && cf && co){
              cv.value = '100';
              cv.dispatchEvent(new window.Event('input', { bubbles: true }));
              const v1 = parseFloat(co.textContent);
              if(Math.abs(v1 - 13) < 1e-6) ok(`公式行 x*0.13，x=100 → ${co.textContent}`);
              else bad(`公式行结果异常：${co.textContent}（应为 13）`);
              cf.value = 'x/1.13';
              cf.dispatchEvent(new window.Event('input', { bubbles: true }));
              const v2 = parseFloat(co.textContent);
              if(Math.abs(v2 - 100 / 1.13) < 1e-4) ok(`公式行 x/1.13，x=100 → ${co.textContent}`);
              else bad(`公式行第二式异常：${co.textContent}`);
              /* 第二个变量 y */
              const fyt = last.querySelector('.cfyt');
              if(fyt){
                fyt.click();
                const rws2 = doc.querySelectorAll('.comrow');
                const last2 = rws2[rws2.length - 1];
                const cy2 = last2.querySelector('.cy');
                if(cy2){
                  const cf2 = last2.querySelector('.cfx'), co2 = last2.querySelector('.cout');
                  cf2.value = 'x*y+10';
                  cf2.dispatchEvent(new window.Event('input', { bubbles: true }));
                  cy2.value = '3';
                  cy2.dispatchEvent(new window.Event('input', { bubbles: true }));
                  const v3 = parseFloat(co2.textContent);
                  if(Math.abs(v3 - 310) < 1e-6) ok(`公式行双变量 x*y+10，x=100 y=3 → ${co2.textContent}`);
                  else bad(`双变量公式结果异常：${co2.textContent}（应为 310）`);
                  /* 引用其他行结果 r1 */
                  const row1out = doc.querySelector('.comrow .cout');
                  const r1v = row1out ? parseFloat(row1out.textContent) : NaN;
                  cf2.value = 'r1*2';
                  cf2.dispatchEvent(new window.Event('input', { bubbles: true }));
                  const v4 = parseFloat(co2.textContent);
                  if(isFinite(r1v) && Math.abs(v4 - r1v * 2) < 1e-4) ok(`公式行引用 r1*2：第 1 行 ${r1v} → ${co2.textContent}`);
                  else bad(`引用 r1 失败：第 1 行 ${r1v}，结果 ${co2.textContent}`);
                } else bad('公式行 +y 未生成 y 输入框');
              } else bad('公式行缺少 +y 按钮');
              const dl = doc.querySelectorAll('.comrow')[doc.querySelectorAll('.comrow').length - 1].querySelector('.cdel');
              if(dl) dl.click();
            } else bad('公式行未渲染出输入框');
          } else bad('组合工作台缺少「加一行公式」按钮');
        }
      }

      /* 复制全部对照 */
      {
        const uNav = doc.querySelector('.nitem[data-id="length"]');
        if(uNav){
          uNav.click();
          const ca = doc.getElementById('copyAll');
          if(ca){
            ca.click();
            const m = doc.getElementById('actMsg');
            ok('「复制全部对照」按钮存在，点击无异常（' + (m ? m.textContent.trim() : '') + '）');
          } else bad('单位面板缺少「复制全部对照」按钮');
        }
      }

      /* 历史导出 */
      const histNav = doc.querySelector('.nitem[data-id="history"]');
      if(histNav){
        histNav.click();
        const he = doc.getElementById('histExp');
        if(he){ he.click(); ok('历史「导出 Excel」按钮存在且点击无异常'); }
        else bad('历史面板缺少导出按钮');
        const hq = doc.getElementById('histQ');
        if(hq){
          const trs = [].slice.call(doc.querySelectorAll('#main .hrow'));
          hq.value = '长度';
          hq.dispatchEvent(new window.Event('input', { bubbles: true }));
          const vis = trs.filter(t => t.style.display !== 'none').length;
          if(vis > 0 && vis < trs.length) ok(`历史筛选「长度」命中 ${vis}/${trs.length}`);
          else if(vis === trs.length) ok(`历史筛选可输入（记录均含「长度」，${vis}/${trs.length}）`);
          else bad(`历史筛选无命中（${vis}/${trs.length}）`);
          hq.value = '';
          hq.dispatchEvent(new window.Event('input', { bubbles: true }));
        } else ok('历史筛选框未出现（历史为空，跳过）');
      }

      /* 加到组合台 */
      {
        const ln = doc.querySelector('.nitem[data-id="length"]');
        if(ln){
          ln.click();
          const tc = doc.getElementById('toCombo');
          if(tc){
            tc.click();
            const m = doc.getElementById('actMsg');
            const txt = m ? m.textContent.trim() : '';
            if(/组合台/.test(txt)) ok('「加到组合台」可用：' + txt);
            else bad('「加到组合台」无反馈：' + txt);
            const rel = doc.querySelectorAll('#main .relate .rbtn');
            if(rel.length >= 3) ok(`相关模块推荐已生成（${rel.length} 个）`);
            else bad('相关模块推荐未生成');
          } else bad('单位面板缺少「加到组合台」按钮');
        }
      }

      /* 最近使用分组 */
      const recentSec = doc.querySelector('.ngroup[data-g="__recent"]');
      if(recentSec) ok(`「最近使用」分组已生成（${recentSec.parentElement.querySelectorAll('.nitem').length} 项）`);
      else bad('「最近使用」分组未生成');

      /* 速查卡合集按分组勾选 */
      {
        const pcNav = doc.querySelector('.nitem[data-id="printcenter"]');
        if(pcNav){
          pcNav.click();
          const chips = doc.querySelectorAll('.pcg');
          if(chips.length >= 5){
            ok(`速查卡合集分组按钮已生成（${chips.length} 组）`);
            const before = doc.querySelectorAll('.pci input:checked').length;
            chips[1].click();
            const afterOn = doc.querySelectorAll('.pci input:checked').length;
            if(afterOn > before) ok(`点分组按钮勾选 ${afterOn - before} 个（本组）`);
            else bad(`点分组按钮未勾选任何项（${before} → ${afterOn}）`);
            chips[1].click();
            const afterOff = doc.querySelectorAll('.pci input:checked').length;
            if(afterOff < afterOn) ok(`再点一次取消本组（${afterOn} → ${afterOff}）`);
            else bad(`分组按钮无法取消（${afterOn} → ${afterOff}）`);
          } else bad(`速查卡合集分组按钮不足（${chips.length} 个）`);
        }
      }

      /* 速查卡合集记住上次勾选 */
      {
        const boxes = doc.querySelectorAll('.pci input');
        if(boxes.length >= 2){
          [boxes[0], boxes[1]].forEach(b=>{ b.checked = true; b.dispatchEvent(new window.Event('change', {bubbles:true})); });
          let n = 0;
          try{ n = JSON.parse(window.localStorage.getItem('lifeconv_print_v1') || '[]').length; }catch(e){}
          if(n === 2) ok('打印勾选已写入本地记忆（2 个）');
          else bad('打印勾选未写入记忆（' + n + ' 个）');
          const away = doc.querySelector('.nitem[data-id="loan"]');
          if(away){ away.click(); doc.querySelector('.nitem[data-id="printcenter"]').click(); }
          const reOn = doc.querySelectorAll('.pci input:checked').length;
          if(reOn === 2) ok('重新打开速查卡合集自动恢复上次勾选（2 个）');
          else bad('上次勾选未恢复（' + reOn + ' 个）');
        }
      }

      /* 表格行一键复制 */
      {
        const rows = doc.querySelectorAll('.nitem[data-id="inspect"]');
        if(rows.length){ rows[0].click(); }
        const tr = doc.querySelector('#main table.tbl tbody tr');
        if(tr && typeof window.rowLineText === 'function'){
          const s = window.rowLineText(tr);
          if(s && s.indexOf('：') > 0 && s.indexOf('|') > 0) ok('表格行可拼成复制文本：' + s.slice(0, 24) + '…');
          else bad('表格行复制文本异常：' + s);
        } else bad('表格行复制函数未挂载');
      }

      /* 计算器卡片自动存图按钮 */
      const loanNav = doc.querySelector('.nitem[data-id="loan"]');
      if(loanNav){
        loanNav.click();
        const auto = doc.querySelectorAll('#main .card .snapout');
        if(auto.length > 0){
          auto[0].click();
          ok(`计算器卡片自动补「存为图片」（房贷页 ${auto.length} 个）`);
        } else bad('计算器卡片没有自动补「存为图片」按钮');
      }

      /* 移动端导航抽屉 */
      const appEl = doc.querySelector('.app');
      const nt = doc.getElementById('navToggle');
      if(appEl && nt){
        if(appEl.classList.contains('navopen')) bad('初始状态导航不应展开');
        else ok('移动端导航抽屉默认收起');
        nt.click();
        if(appEl.classList.contains('navopen') && nt.getAttribute('aria-expanded') === 'true') ok('点「模块目录」展开抽屉');
        else bad('抽屉未展开或 aria-expanded 未更新');
        const anyItem = doc.querySelector('.nitem');
        if(anyItem){ anyItem.click(); }
        if(!appEl.classList.contains('navopen')) ok('选中模块后抽屉自动收起');
        else bad('选中模块后抽屉未自动收起');
      } else bad('navToggle 按钮缺失');
      /* 窄屏样式与渲染性能优化存在 */
      const css = doc.querySelector('style').textContent;
      if(css.indexOf('.app.navopen .side nav') > 0) ok('移动端抽屉 CSS 就位');
      else bad('抽屉 CSS 缺失');
      if(css.indexOf('content-visibility:auto') > 0) ok('卡片 content-visibility 渲染优化就位');
      else bad('content-visibility 优化缺失');
      if(css.indexOf('.card{overflow-x:auto}') > 0 || /\.card\{[^}]*overflow-x:auto/.test(css)) ok('窄屏卡片横向滚动就位');
      else bad('窄屏横向滚动缺失');

      /* 搜索：命中高亮 + 表内全文检索 */
      const q = doc.getElementById('q');
      if(q){
        q.value = '胶饵';
        q.dispatchEvent(new window.Event('input', {bubbles:true}));
        const vis = [].slice.call(doc.querySelectorAll('.nitem')).filter(b=>b.style.display !== 'none');
        const badge = vis.filter(b=>b.querySelector('.shint'));
        if(vis.length && badge.length) ok(`表内文字可搜：命中 ${vis.length} 个模块（含表内标记）`);
        else bad('表内全文检索未生效（命中 ' + vis.length + '，带标记 ' + badge.length + '）');
        const hb = doc.getElementById('hitbar');
        if(hb && hb.classList.contains('on') && /命中/.test(hb.textContent)) ok('命中计数条显示正常');
        else bad('命中计数条未显示');

        q.value = '长度';
        q.dispatchEvent(new window.Event('input', {bubbles:true}));
        const mk = doc.querySelector('.nitem .nlabel mark');
        if(mk && mk.textContent === '长度') ok('搜索命中词高亮正常');
        else bad('命中词未高亮');
        q.value = '';
        q.dispatchEvent(new window.Event('input', {bubbles:true}));
        const stillHid = [].slice.call(doc.querySelectorAll('.nitem')).filter(b=>b.style.display === 'none').length;
        if(stillHid === 0) ok('清空搜索后全部模块恢复显示');
        else bad('清空搜索后仍有 ' + stillHid + ' 个模块隐藏');
      } else bad('搜索框缺失');

      /* V8.3 运行态：新手技巧卡 / 新版本提示条 / 关于页实时统计 / 反馈模板版本 */
      if(typeof window.showTour === 'function'){
        window.showTour(true);
        const tc = doc.getElementById('tourCard');
        if(tc && tc.classList.contains('on')) ok('新手技巧卡可以弹出（三条技巧 + 知道了）');
        else bad('新手技巧卡未弹出');
        const tok = tc && tc.querySelector('.tok');
        if(tok){
          tok.click();
          const closed = !doc.getElementById('tourCard').classList.contains('on');
          const mem = window.localStorage.getItem('lifeconv_tour_v1');
          if(closed && mem === '1') ok('点「知道了」后收起并写入访问记忆');
          else bad('技巧卡未收起或未写入记忆（' + mem + '）');
        } else bad('技巧卡缺少「知道了」按钮');
      } else bad('showTour 未定义');

      if(typeof window.updBarShow === 'function'){
        window.updBarShow();
        const bar = doc.getElementById('updBar');
        if(bar && bar.querySelector('.updgo') && /新版本/.test(bar.textContent)) ok('新版本提示条可生成（含刷新按钮）');
        else bad('新版本提示条生成异常');
        if(bar){ bar.querySelector('.updx').click(); ok('提示条可手动关闭'); }
      } else bad('updBarShow 未定义');

      if(typeof window.aboutStats === 'function'){
        const st = window.aboutStats();
        const zh = window.aboutPanelZH();
        if(st.mods > 200 && st.tables >= 170 && st.rows > 5000 && zh.indexOf(st.mods + ' 个') > 0)
          ok(`关于页实时统计正确：${st.mods} 模块 / ${st.groups} 分组 / ${st.tables} 张表 / ${st.rows} 条对照`);
        else bad(`关于页统计异常：${st.mods} / ${st.groups} / ${st.tables} / ${st.rows}`);
      } else bad('aboutStats 未定义');

      /* 使用统计：记录 / 面板 / 清空 */
      if(typeof window.getUsage === 'function'){
        const u = window.getUsage();
        const nUsed = Object.keys(u).length;
        if(nUsed > 100) ok(`使用统计已记录 ${nUsed} 个模块的打开次数`);
        else bad(`使用统计记录过少（${nUsed}）`);
        const uNav = doc.querySelector('.nitem[data-id="usage"]');
        if(uNav){
          uNav.click();
          const body = doc.getElementById('main').textContent;
          const clear = doc.getElementById('usageClear');
          if(/用过模块/.test(body) && /\d+%/.test(body) && clear) ok('使用统计面板渲染正常（覆盖率 + 清空按钮）');
          else bad('使用统计面板内容异常');
          window.confirm = () => true;
          if(clear){
            clear.click();
            const after = Object.keys(window.getUsage()).length;
            if(after <= 2) ok(`清空统计生效（剩余 ${after} 条，为面板自身）`);
            else bad(`清空统计未生效（剩余 ${after} 条）`);
          }
        } else bad('导航里找不到「使用统计」');
      } else bad('getUsage 未定义');

      /* 页内小节导航（长表模块） */
      const navBuy = doc.querySelector('.nitem[data-id="appbuy"]');
      if(navBuy){
        navBuy.click();
        const stcs = doc.querySelectorAll('#main .sectoc .stc');
        const secCards = doc.querySelectorAll('#main .card[id^="sec-"]');
        if(stcs.length >= 4 && stcs.length === secCards.length) ok(`长表页内小节导航就位（${stcs.length} 个小节，与卡片逐一对应）`);
        else bad(`小节导航异常：chip ${stcs.length} / 卡片 ${secCards.length}`);
        if(stcs[2]){
          stcs[2].click();
          const onChip = doc.querySelector('#main .sectoc .stc.on');
          if(onChip && onChip.dataset.sec === stcs[2].dataset.sec) ok('点小节后导航高亮跟随');
          else bad('点小节后高亮未跟随');
        }
        if(secCards[0] && secCards[0].id === 'sec-0' && stcs[0] && stcs[0].dataset.sec === '0') ok('小节序号与卡片 id 对齐');
        else bad('小节序号与卡片 id 不对齐');
      } else bad('导航里找不到 appbuy');

      /* 打印整册：封面 + 目录 + 按分组入口 */
      const pcNav = doc.querySelector('.nitem[data-id="printcenter"]');
      if(pcNav){
        pcNav.click();
        const pbs = doc.querySelectorAll('.pcb');
        const cov = doc.getElementById('pcCover');
        if(pbs.length >= 8 && cov) ok(`打印中心新增 ${pbs.length} 个「分组整册」入口与封面开关`);
        else bad(`打印中心整册入口异常（按钮 ${pbs.length}）`);
        const bk = window.buildBook(['appbuy','storage'], true);
        if(/booklet-cover/.test(bk) && /toclist/.test(bk) && /<li>/.test(bk) && (bk.match(/class="panel[\s"]/g) || []).length >= 4)
          ok('整册生成：封面 + 目录 + 两个模块页');
        else bad('整册生成内容不完整');
        const bk2 = window.buildBook(['appbuy'], false);
        if(!/booklet-cover/.test(bk2) && /class="panel"/.test(bk2)) ok('关闭封面时只输出模块页');
        else bad('封面开关无效');
        /* 整册导出 Excel */
        const xlsBtn = doc.getElementById('pcXls');
        if(xlsBtn){
          const box1 = doc.querySelector('.pci input');
          if(box1){ box1.checked = true; xlsBtn.click(); }
          const xmsg = (doc.getElementById('pcMsg') || {}).textContent || '';
          if(/已导出/.test(xmsg)) ok('整册导出 Excel：汇总表生成成功');
          else bad('整册导出 Excel 失败：' + xmsg.slice(0, 40));
        } else bad('打印中心缺少导出 Excel 按钮');
      } else bad('导航里找不到打印中心');

      window.__errLog = [{ m:'TEST_ERR: canvas unavailable', at:'units.html:1' }];
      const fb = window.feedbackPanel();
      if(fb.indexOf('V9.0') > 0 && fb.indexOf('TEST_ERR: canvas unavailable') > 0) ok('反馈模板带 V9.0 与最近错误信息');
      else bad('反馈模板版本或错误位缺失');

      /* 数据新鲜度角标：时效模块渲染 chkbar */
      const navCur = doc.querySelector('.nitem[data-id="currency"]');
      if(navCur){
        navCur.click();
        const bar = doc.querySelector('#main .chkbar');
        if(bar && /2026-10/.test(bar.textContent)) ok('时效模块显示「数据核对」角标（currency）');
        else bad('currency 未显示核对角标');
      } else bad('导航里找不到 currency');

      /* 赞赏入口：关于页渲染收款码卡片 */
      const navAbout = doc.querySelector('.nitem[data-id="about"]');
      if(navAbout){
        navAbout.click();
        const sp = doc.querySelector('#main .spcard');
        const spImg = doc.querySelector('#main .spcard img');
        if(sp && spImg && /sponsor-qr\.png/.test(spImg.getAttribute('src')) && sp.textContent.length > 20) ok('关于页赞赏卡片就位（文案 + 收款码图）');
        else bad('关于页赞赏卡片缺失或不完整');
      } else bad('导航里找不到 about');

      /* 时效复核提醒：月差计算 + 逾期标红（临时改 chk 再渲染，测完恢复） */
      if(typeof window.chkMonths === 'function'){
        const now = new Date();
        const exp = (now.getFullYear() - 2020) * 12 + (now.getMonth() + 1) - 1;
        if(window.chkMonths('2020-01') === exp) ok(`chkMonths 月差计算正确（2020-01 → ${exp}）`);
        else bad('chkMonths 月差计算错误');
        if(window.chkMonths('bad-input') === 0) ok('chkMonths 非法输入返回 0');
        else bad('chkMonths 非法输入未兜底');
      } else bad('chkMonths 未定义');
      const navCur2 = doc.querySelector('.nitem[data-id="currency"]');
      if(navCur2){
        const setChk = doc.createElement('script');
        setChk.textContent = 'CATS.find(c=>c.id==="currency").chk="2024-01";';
        doc.body.appendChild(setChk);
        navCur2.click();
        const sbar = doc.querySelector('#main .chkbar.stale');
        if(sbar && /已 \d+ 个月未核对/.test(sbar.textContent)) ok('逾期角标标红（.stale）并提示「已 N 个月未核对」');
        else bad('逾期角标未标红或缺月数提示');
        const st = (typeof window.aboutStats === 'function') ? window.aboutStats() : null;
        if(st && st.stale >= 1) ok(`关于页统计逾期模块数（stale=${st.stale}）`);
        else bad('aboutStats 未统计逾期数');
        const restore = doc.createElement('script');
        restore.textContent = 'CATS.find(c=>c.id==="currency").chk="2026-10";';
        doc.body.appendChild(restore);
        navCur2.click();
        if(!doc.querySelector('#main .chkbar.stale')) ok('恢复 2026-10 后角标不再标红');
        else bad('恢复核对月份后仍标红');
      }

      /* 拼音首字母搜索：jd → 家电选购，sn → 收纳，dy → 打印中心 */
      if(typeof window.pyIndex === 'function'){
        const qEl = doc.getElementById('q');
        const vis = id => {
          const it = doc.querySelector('.nitem[data-id="' + id + '"]');
          return it && it.style.display !== 'none';
        };
        const pyCases = [['jd','appbuy'],['sn','storage'],['dy','printcenter'],['sy','usage']];
        let pyAllOk = true;
        pyCases.forEach(([q,id])=>{
          qEl.value = q;
          qEl.dispatchEvent(new window.Event('input', {bubbles:true}));
          if(!vis(id)){ pyAllOk = false; bad(`拼音首字母「${q}」未命中 ${id}`); }
        });
        if(pyAllOk) ok('拼音首字母搜索：jd/sn/dy/sy 各命中目标模块');
        qEl.value = '';
        qEl.dispatchEvent(new window.Event('input', {bubbles:true}));
      } else bad('pyIndex 未定义');

      /* 小节深链与分享：secshare 按钮存在，点击胶囊后哈希带 s= */
      const navTb = doc.querySelector('.nitem[data-id="appbuy"]');
      if(navTb){
        navTb.click();
        const shares = doc.querySelectorAll('#main .secshare');
        if(shares.length >= 4) ok(`本节链接按钮就位（${shares.length} 个）`);
        else bad('secshare 按钮缺失');
        const chip1 = doc.querySelector('.sectoc .stc[data-sec="1"]');
        if(chip1){
          chip1.click();
          if(/#m=appbuy&s=1/.test(window.location.hash)) ok('点击小节胶囊后地址栏带 #m=…&s=1');
          else bad('胶囊点击未更新哈希（' + window.location.hash + '）');
        } else bad('appbuy 缺少小节胶囊');
      } else bad('导航里找不到 appbuy');
      /* 深链直达：#m=appbuy&s=2 渲染后目标卡应闪烁高亮 */
      window.location.hash = '#m=appbuy&s=2';
      window.applyHash();
      await new Promise(r=>setTimeout(r, 150));
      const sec2 = doc.getElementById('sec-2');
      const chip2 = doc.querySelector('.sectoc .stc[data-sec="2"]');
      if(sec2 && sec2.classList.contains('sectflash') && chip2 && chip2.classList.contains('on')) ok('深链 #m=…&s=2 直达并高亮第 3 节');
      else bad('深链小节未生效（flash=' + !!(sec2 && sec2.classList.contains('sectflash')) + ', chip=' + !!(chip2 && chip2.classList.contains('on')) + ')');
    }catch(e){ bad('功能抽查抛错: ' + e.message); }
  }
  await step4();

  window.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

(async ()=>{ step1(); step2(); await step3();
console.log('\n========== ' + (failed ? `❌ ${failed} 项失败，禁止交付` : '✅ 全部通过，可以交付') + ' ==========');
process.exit(failed ? 1 : 0);
})();
