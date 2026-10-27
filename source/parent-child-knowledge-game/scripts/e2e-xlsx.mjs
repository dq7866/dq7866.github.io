/**
 * Excel 导入导出界面 E2E（真实 Edge）
 * 导出按钮 / 下拉菜单 / 模板下载 / 文件选择后自动预检 / 正式导入 / 列表可见
 * 用法：node scripts/e2e-xlsx.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildWorkbook } from '../lib/xlsx-io.js';

const BASE = 'http://localhost:3000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAMP = 'XLSXE2E' + Date.now().toString(36);
const GOOD1 = `【${STAMP}】Excel 界面测试题 A`;
const GOOD2 = `【${STAMP}】Excel 界面测试题 B`;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
};

/* 造一个含 2 好 1 坏的表格 */
const sampleFile = path.join(os.tmpdir(), `wb-xlsx-${STAMP}.xlsx`);
fs.writeFileSync(sampleFile, buildWorkbook([
  {
    subj: '数学', grades: [3], level: 1, kp: '分数的意义', text: GOOD1,
    options: ['相等', '不相等', '无法比较', '前者大'], correct: 0, source: 'admin',
  },
  {
    subj: '科学', grades: [4], level: 3, kp: '光', text: GOOD2,
    options: ['太阳', '月亮', '篝火', '手电筒'], correct: 1, source: 'admin',
  },
  {
    subj: '数学', grades: [3], level: 1, kp: '分数的意义', text: '',
    options: ['甲', '乙', '丙', '丁'], correct: 0, source: 'admin',
  },
]));

const b = await chromium.launch({ channel: 'msedge' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource.*40\d/.test(t)) return;
  errs.push('console: ' + t);
});

try {
  /* 1. 登录 */
  console.log('\n▸ 登录');
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.fill('#pw', 'admin123');
  await page.click('#loginBtn');
  await page.waitForSelector('#app', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(800);

  /* 2. 导出 */
  console.log('\n▸ 导出 Excel');
  ok('导出按钮文案是 Excel', /Excel/.test(await page.locator('#btnExport').textContent()));

  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.click('#btnExport'),
  ]);
  const name = dl.suggestedFilename();
  ok('下载文件名是 .xlsx', /^questions-\d{4}-\d{2}-\d{2}\.xlsx$/.test(name), name);

  const saved = path.join(__dirname, '..', 'docs', name);
  await dl.saveAs(saved);
  const size = fs.statSync(saved).size;
  ok('文件大小合理（> 100KB）', size > 100 * 1024, size + ' bytes');
  fs.unlinkSync(saved);

  /* 3. 下拉菜单 */
  console.log('\n▸ 导出下拉');
  await page.click('#btnExportMore');
  await page.waitForTimeout(200);
  ok('菜单展开', await page.locator('#exportMenu').isVisible());
  ok('菜单有 4 个入口', await page.locator('#exportMenu a').count() === 4);

  // 模板
  const [tpl] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.click('#exportMenu a[data-act="tpl"]'),
  ]);
  ok('模板文件名正确', tpl.suggestedFilename() === 'questions-template.xlsx', tpl.suggestedFilename());
  await page.waitForTimeout(300);
  ok('点完菜单自动收起', !(await page.locator('#exportMenu').isVisible()));

  // 只导出当前筛选
  await page.selectOption('#fGrade', '2');
  await page.selectOption('#fSubj', '数学');
  await page.waitForTimeout(800);
  await page.click('#btnExportMore');
  const [scoped] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.click('#exportMenu a[data-act="xlsx-scoped"]'),
  ]);
  const scopedPath = path.join(os.tmpdir(), 'scoped-' + STAMP + '.xlsx');
  await scoped.saveAs(scopedPath);
  ok('按筛选导出的文件更小', fs.statSync(scopedPath).size < size, fs.statSync(scopedPath).size);
  fs.unlinkSync(scopedPath);

  // 复原筛选
  await page.click('#btnReset');
  await page.waitForTimeout(700);

  /* 4. 导入 */
  console.log('\n▸ 导入：选择文件后自动预检');
  await page.click('#btnImport');
  ok('导入弹窗打开', await page.locator('#importMask').isVisible());

  await page.setInputFiles('#importFile', sampleFile);
  await page.waitForSelector('#importPreview .pchip', { timeout: 20000 });
  await page.waitForTimeout(400);

  const previewText = await page.locator('#importPreview').textContent();
  ok('预检显示新增 2', /新增\s*2/.test(previewText.replace(/\s+/g, ' ')), previewText.slice(0, 120));
  ok('预检显示有问题 1', /有问题\s*1/.test(previewText.replace(/\s+/g, ' ')), previewText.slice(0, 120));
  ok('预检列出了题干预览', previewText.includes(GOOD1.slice(0, 12)));
  ok('坏行报错带行号 4', /行[\s\S]{0,40}4/.test(previewText), previewText.slice(-120));

  console.log('\n▸ 导入：正式写入');
  await page.click('#importGo');
  await page.waitForTimeout(1500);
  const resultText = await page.locator('#importResult').textContent();
  ok('结果提示新增 2 道', /新增\s*2\s*道/.test(resultText), resultText.slice(0, 120));

  await page.click('#importCancel');
  await page.waitForTimeout(300);

  /* 5. 列表里能搜到 */
  console.log('\n▸ 导入的题进入题库');
  await page.fill('#fKw', STAMP);
  await page.waitForTimeout(1000);
  const cnt = await page.locator('#tbody tr').count();
  ok('搜到 2 道新题', cnt === 2, cnt);
  const tags = await page.locator('#tbody tr .tag').allTextContents();
  ok('状态显示「新增」', tags.some(t => t.includes('新增')), tags.slice(0, 6));

  /* 6. 再次导入应全部跳过 */
  console.log('\n▸ 重复导入');
  await page.click('#btnImport');
  await page.setInputFiles('#importFile', sampleFile);
  await page.waitForSelector('#importPreview .pchip', { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.click('#importGo');
  await page.waitForTimeout(1500);
  const again = await page.locator('#importResult').textContent();
  ok('重复导入被跳过而不是报错', /跳过\s*2|新增\s*0/.test(again), again.slice(0, 140));
  await page.screenshot({ path: './docs/admin-xlsx-import.png' });
  await page.click('#importCancel');

  /* 7. 清理 */
  console.log('\n▸ 清理');
  const cleaned = await page.evaluate(async (stamp) => {
    const t = sessionStorage.getItem('adminToken');
    const H = { 'X-Admin-Token': t, 'Content-Type': 'application/json' };
    const list = await (await fetch('/api/admin/questions?keyword=' + encodeURIComponent(stamp) + '&size=100', { headers: H })).json();
    const ids = list.rows.map(r => r.id);
    if (ids.length) {
      await fetch('/api/admin/bulk', { method: 'POST', headers: H, body: JSON.stringify({ action: 'delete', ids }) });
    }
    const gone = await (await fetch('/api/admin/questions?status=deleted&size=100', { headers: H })).json();
    const isTest = s => /E2E题干-|XLSXE2E|Excel 界面测试题|【测试】|【改过】/.test(String(s));
    const onlyMine = gone.rows.length > 0 && gone.rows.every(r => isTest(r.text));
    const sum = await (await fetch('/api/admin/summary', { headers: H })).json();
    let reset = false;
    if (onlyMine && !Number(sum.editedCount)) {
      await fetch('/api/admin/reset', { method: 'POST', headers: H, body: JSON.stringify({ confirm: 'RESET' }) });
      reset = true;
    }
    return { removed: ids.length, reset };
  }, STAMP);
  ok('测试题已删除', cleaned.removed === 2, cleaned);
  ok('修订层复位', cleaned.reset === true, cleaned);

  ok('全程无 JS 报错', errs.length === 0, errs.slice(0, 3));
} catch (e) {
  fail++;
  console.log('  ❌ 脚本异常：' + e.message);
  await page.screenshot({ path: './docs/admin-xlsx-error.png' }).catch(() => { });
} finally {
  await b.close();
  try { fs.unlinkSync(sampleFile); } catch { }
}

console.log(`\n================ 结果：${pass} 通过 / ${fail} 失败 ================`);
process.exitCode = fail ? 1 : 0;
