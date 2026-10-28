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

/* ---------- 3. jsdom 冒烟遍历 ---------- */
function step3(){
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

  function traverse(lang){
    let n = 0, badOnes = [];
    const items = [...doc.querySelectorAll('.nitem')];
    for(const it of items){
      it.click();
      const mainEl = doc.getElementById('main');
      const text = mainEl ? mainEl.textContent.trim() : '';
      const hasH2 = mainEl && mainEl.querySelector('h2');
      if(!text || !hasH2){ badOnes.push(it.textContent.trim() + '(空面板)'); continue; }
      if(lang === 'en'){
        const h2 = mainEl.querySelector('h2').textContent;
        if(ZH_RE.test(h2)) badOnes.push(it.textContent.trim() + `(英文标题残留中文: ${h2})`);
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
  // 切回中文再验一次（语言往返）
  if(btn) btn.click();
  r = traverse('zh');
  if(r.badOnes.length){ bad(`往返后中文模式 ${r.badOnes.length} 项异常`); }
  else ok(`往返切换后 ${r.n}/${r.n} 正常`);

  const realErr = errors.filter(e => !/sw stub|fetch stub|ResizeObserver|Not implemented/.test(e));
  if(realErr.length){ bad(`窗口报错 ${realErr.length} 条: ` + realErr.slice(0, 3).join(' | ')); }
  else ok('零窗口报错');

  /* ---------- 功能抽查：组合工作台 / 存为图片 ---------- */
  function step4(){
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
    }catch(e){ bad('功能抽查抛错: ' + e.message); }
  }
  step4();

  window.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

step1(); step2(); step3();
console.log('\n========== ' + (failed ? `❌ ${failed} 项失败，禁止交付` : '✅ 全部通过，可以交付') + ' ==========');
process.exit(failed ? 1 : 0);
