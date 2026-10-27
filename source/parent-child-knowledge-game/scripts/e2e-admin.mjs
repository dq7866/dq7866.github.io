/**
 * 后台管理界面 E2E（真实 Edge）
 * 登录 → 新增 → 搜索 → 编辑 → 批量选择 → 删除 → 恢复
 * 用法：node scripts/e2e-admin.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const UNIQ = 'E2E题干-' + Date.now();
const shot = n => `./docs/admin-${n}.png`;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
};

const b = await chromium.launch({ channel: 'msedge' });
const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // 表单校验用例会故意提交非法数据，服务端返回 400 属预期，不算缺陷
  if (/Failed to load resource.*40\d/.test(t)) return;
  errs.push('console: ' + t);
});
page.on('dialog', d => d.accept());   // 删除确认

try {
  /* 1. 登录 */
  console.log('\n▸ 登录');
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  ok('登录页出现', await page.locator('#login').isVisible());
  await page.fill('#pw', 'admin123');
  await page.click('#loginBtn');
  await page.waitForSelector('#app', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(900);
  ok('登录后进入主界面', await page.locator('#app').isVisible());

  /* 2. 列表与统计 */
  console.log('\n▸ 列表与统计');
  const rows = await page.locator('#tbody tr').count();
  ok('表格渲染了数据行', rows > 0, rows);
  const statTotal = await page.locator('.stat b').first().textContent();
  ok('统计显示总数', Number(statTotal) > 3000, statTotal);
  const gradeOpts = await page.locator('#fGrade option').count();
  ok('年级下拉含 6 个年级', gradeOpts === 7, gradeOpts);
  await page.screenshot({ path: shot('list') });

  /* 3. 筛选 */
  console.log('\n▸ 筛选');
  await page.selectOption('#fGrade', '3');
  await page.selectOption('#fSubj', '数学');
  await page.waitForTimeout(700);
  const filterInfo = await page.locator('#pager span').first().textContent();
  ok('按三年级+数学筛出结果', /共 \d+ 道/.test(filterInfo), filterInfo);
  const firstSubj = await page.locator('#tbody tr:first-child .tag').first().textContent();
  ok('筛选结果科目正确', firstSubj.trim() === '数学', firstSubj);
  await page.click('#btnReset');
  await page.waitForTimeout(600);

  /* 4. 新增 */
  console.log('\n▸ 新增题目');
  await page.click('#btnAdd');
  await page.waitForSelector('#editMask.on');
  await page.fill('#eText', UNIQ + '：1 千克等于多少克？');
  const optInputs = page.locator('#eOpts .optrow input[type=text]');
  await optInputs.nth(0).fill('100 克');
  await optInputs.nth(1).fill('1000 克');
  await optInputs.nth(2).fill('10 克');
  await optInputs.nth(3).fill('10000 克');
  await page.locator('#eOpts input[name=corr]').nth(1).check();
  await page.locator('#eGrades .chip').nth(2).click();     // 三年级
  await page.selectOption('#eSubj', '数学');
  await page.fill('#eKp', 'E2E知识点');
  await page.selectOption('#eLevel', '1');
  await page.screenshot({ path: shot('editor') });
  await page.click('#editSave');
  await page.waitForTimeout(1000);
  ok('弹窗已关闭', !(await page.locator('#editMask').isVisible()));

  /* 5. 搜索新题 */
  console.log('\n▸ 搜索与校验');
  await page.fill('#fKw', UNIQ);
  await page.waitForTimeout(900);
  const found = await page.locator('#tbody tr').count();
  ok('能搜到刚新增的题', found === 1, found);
  const rowText = await page.locator('#tbody tr:first-child .qtext').textContent();
  ok('题干正确', rowText.includes('1 千克等于多少克'));
  const correctMark = await page.locator('#tbody tr:first-child .qopts i.ok').textContent();
  ok('正确答案标记在第二项', correctMark.includes('1000 克'), correctMark);
  const tag = await page.locator('#tbody tr:first-child .col-src .tag').textContent();
  ok('状态显示为「新增」', tag.trim() === '新增', tag);

  /* 6. 编辑 */
  console.log('\n▸ 编辑题目');
  await page.locator('#tbody tr:first-child [data-act=edit]').click();
  await page.waitForSelector('#editMask.on');
  await page.waitForTimeout(500);
  const prefilled = await page.inputValue('#eText');
  ok('编辑时回填原题干', prefilled.includes('1 千克'), prefilled.slice(0, 20));
  await page.fill('#eText', UNIQ + '：1 千克等于多少克？（已修改）');
  await page.selectOption('#eLevel', '3');
  await page.click('#editSave');
  await page.waitForTimeout(1000);
  const afterEdit = await page.locator('#tbody tr:first-child .qtext').textContent();
  ok('修改后列表已更新', afterEdit.includes('已修改'), afterEdit);
  const lvAfter = await page.locator('#tbody tr:first-child .lv').textContent();
  ok('难度变为三颗星', lvAfter.trim() === '★★★', lvAfter);

  /* 7. 批量选择 */
  console.log('\n▸ 批量操作条');
  await page.locator('#tbody tr:first-child input[type=checkbox]').check();
  await page.waitForTimeout(300);
  ok('批量条出现', await page.locator('#bulkbar.on').isVisible());
  const bulkCount = await page.locator('#bulkCount').textContent();
  ok('批量计数为 1', bulkCount === '1', bulkCount);
  await page.screenshot({ path: shot('bulk') });
  await page.click('#bulkClear');
  await page.waitForTimeout(300);
  ok('取消选择后批量条隐藏', !(await page.locator('#bulkbar').evaluate(n => n.classList.contains('on'))));

  /* 8. 删除 */
  console.log('\n▸ 删除与恢复');
  await page.locator('#tbody tr:first-child [data-act=del]').click();
  await page.waitForTimeout(1000);
  ok('删除后搜索无结果', await page.locator('#tbody tr .empty').count() === 1);

  await page.selectOption('#fStatus', 'deleted');
  await page.waitForTimeout(900);
  const delRows = await page.locator('#tbody tr').count();
  ok('「已删除」列表能查到', delRows >= 1, delRows);
  const delTag = await page.locator('#tbody tr:first-child .col-src .tag').textContent();
  ok('状态标记为已删除', delTag.trim() === '已删除', delTag);
  await page.screenshot({ path: shot('deleted') });

  await page.locator('#tbody tr:first-child [data-act=restore]').click();
  await page.waitForTimeout(1000);
  await page.selectOption('#fStatus', '');
  await page.fill('#fKw', UNIQ);
  await page.waitForTimeout(900);
  ok('恢复后能重新搜到', await page.locator('#tbody tr').count() === 1);

  /* 9. 操作日志 */
  console.log('\n▸ 操作日志');
  await page.click('#btnAudit');
  await page.waitForTimeout(800);
  const auditRows = await page.locator('#auditBody > div').count();
  ok('日志弹窗有记录', auditRows > 0, auditRows);
  await page.screenshot({ path: shot('audit') });
  await page.click('#auditClose');

  /* 10. 非法输入提示 */
  console.log('\n▸ 表单校验提示');
  await page.click('#btnAdd');
  await page.waitForSelector('#editMask.on');
  await page.fill('#eText', '只有三个选项的题');
  const ops = page.locator('#eOpts .optrow input[type=text]');
  await ops.nth(0).fill('A');
  await ops.nth(1).fill('B');
  await ops.nth(2).fill('C');
  await page.click('#editSave');
  await page.waitForTimeout(700);
  const errMsg = await page.locator('#editErr').textContent();
  ok('空第四项给出错误提示', errMsg.includes('不能有空值'), errMsg);
  await page.click('#editCancel');

  /* 11. 清理 */
  console.log('\n▸ 清理测试数据');
  await page.locator('#tbody tr:first-child [data-act=del]').click();
  await page.waitForTimeout(800);
  console.log('  已删除 E2E 测试题');

  // 顺便把软删墓碑也清掉：只有在「已删除」里全是测试数据时才复位修订层
  const cleaned = await page.evaluate(async () => {
    const t = sessionStorage.getItem('adminToken');
    const H = { 'X-Admin-Token': t };
    const isTest = s => /E2E题干-|XLSXE2E|Excel 界面测试题|【测试】|【改过】/.test(String(s));
    const gone = await (await fetch('/api/admin/questions?status=deleted&size=100', { headers: H })).json();
    const sum = await (await fetch('/api/admin/summary', { headers: H })).json();
    if (gone.rows.length && gone.rows.every(r => isTest(r.text)) && !Number(sum.editedCount)) {
      await fetch('/api/admin/reset', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'RESET' }) });
      return true;
    }
    return false;
  });
  ok('修订层无测试残留', cleaned === true, cleaned);

  ok('全程无 JS 报错', errs.length === 0, errs.slice(0, 3));
} catch (e) {
  fail++;
  console.log('  ❌ 执行异常：', e.message);
  await page.screenshot({ path: shot('error') });
} finally {
  await b.close();
  console.log(`\n================ 结果：${pass} 通过 / ${fail} 失败 ================`);
  process.exit(fail ? 1 : 0);
}
