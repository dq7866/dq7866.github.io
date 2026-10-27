/**
 * Excel 导入导出测试（需先启动服务：npm start）
 * 用法：node scripts/test-xlsx.mjs [baseUrl]
 */
import XLSX from 'xlsx';
import { buildWorkbook } from '../lib/xlsx-io.js';

const BASE = process.argv[2] || 'http://localhost:3000';
const PW = process.env.ADMIN_PASSWORD || 'admin123';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' → ' + extra : '')); }
};
const section = t => console.log('\n' + t);

let TOKEN = '';
const H = () => ({ 'X-Admin-Token': TOKEN });

async function login() {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  });
  const d = await r.json();
  if (!d.token) throw new Error('登录失败：' + (d.error || r.status));
  TOKEN = d.token;
}

async function upload(buf, { dry = false, mode = 'create' } = {}) {
  const r = await fetch(`${BASE}/api/admin/import.xlsx?dry=${dry ? 1 : 0}&mode=${mode}`, {
    method: 'POST',
    headers: { ...H(), 'Content-Type': 'application/octet-stream' },
    body: buf,
  });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, data: d };
}

/** 造一个自定义表头的表（列顺序打乱 + 用别名） */
function makeSheet(rows, header) {
  const aoa = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const stamp = Date.now().toString(36);
const T1 = `【测试】Excel 导入题目 ${stamp} A`;
const T2 = `【测试】Excel 导入题目 ${stamp} B`;

async function main() {
  await login();
  console.log('登录成功');

  /* ---------------- 导出 ---------------- */
  section('【导出 .xlsx】');
  let res = await fetch(BASE + '/api/admin/export.xlsx', { headers: H() });
  ok('HTTP 200', res.status === 200, String(res.status));
  ok('Content-Type 是 xlsx', /spreadsheetml/.test(res.headers.get('content-type') || ''), res.headers.get('content-type'));
  ok('有下载文件名', /\.xlsx/.test(res.headers.get('content-disposition') || ''), res.headers.get('content-disposition'));

  const buf = Buffer.from(await res.arrayBuffer());
  ok('文件不为空', buf.length > 5000, buf.length + ' bytes');

  const wb = XLSX.read(buf, { type: 'buffer' });
  ok('有两个工作表', wb.SheetNames.length === 2, wb.SheetNames.join(','));
  ok('第一个表叫「题目」', wb.SheetNames[0] === '题目', wb.SheetNames[0]);
  ok('第二个表叫「填写说明」', wb.SheetNames[1] === '填写说明', wb.SheetNames[1]);

  const aoa = XLSX.utils.sheet_to_json(wb.Sheets['题目'], { header: 1, raw: false, defval: '' });
  const header = aoa[0].map(String);
  ok('表头 13 列', header.length === 13, header.join('|'));
  ok('表头含「正确答案」', header.includes('正确答案'));
  const summary = await (await fetch(BASE + '/api/admin/summary', { headers: H() })).json();
  ok('导出行数 = 题库总数', aoa.length - 1 === summary.total, `${aoa.length - 1} vs ${summary.total}`);
  const sample = aoa[1];
  ok('正确答案列是 A-D 字母', /^[ABCD]$/.test(String(sample[10])), String(sample[10]));
  ok('年级列是逗号分隔数字', /^\d(,\d)*$/.test(String(sample[2])), String(sample[2]));

  /* ---------------- 带筛选导出 ---------------- */
  section('【按筛选导出】');
  res = await fetch(BASE + '/api/admin/export.xlsx?scoped=1&subj=' + encodeURIComponent('数学') + '&grade=4', { headers: H() });
  const scopedBuf = Buffer.from(await res.arrayBuffer());
  const scopedAoa = XLSX.utils.sheet_to_json(XLSX.read(scopedBuf).Sheets['题目'], { header: 1, raw: false, defval: '' });
  const scopedRows = scopedAoa.slice(1);
  ok('筛选导出可读取', scopedRows.length > 0, String(scopedRows.length));
  ok('全部是数学', scopedRows.every(r => r[1] === '数学'));
  ok('全部含四年级', scopedRows.every(r => String(r[2]).split(',').includes('4')));
  ok('行数小于全量', scopedRows.length < aoa.length - 1, `${scopedRows.length} < ${aoa.length - 1}`);

  /* ---------------- 模板 ---------------- */
  section('【空白模板】');
  res = await fetch(BASE + '/api/admin/template.xlsx', { headers: H() });
  const tplBuf = Buffer.from(await res.arrayBuffer());
  ok('模板可下载', res.status === 200 && tplBuf.length > 3000, String(tplBuf.length));
  const tpl = await upload(tplBuf, { dry: true });
  ok('模板预检通过', tpl.status === 200 && tpl.data.error === 0, JSON.stringify(tpl.data.failed || []));
  ok('模板含 3 行示例', tpl.data.total === 3, String(tpl.data.total));
  ok('模板 3 行都判为新增', tpl.data.create === 3, JSON.stringify(tpl.data));

  /* ---------------- 自定义表头 / 别名 / 乱序 ---------------- */
  section('【表头宽容度】');
  const custom = makeSheet([
    [T1, '数学', '3', '易', '分数的意义', '这行是备注列，应被忽略', '相等', '不相等', '无法比较', '前者大', 'A'],
    [T2, '语文', '2,3', '中等', '形近字', '', '拔', '拨', '跋', '钹', '拔'],
  ], ['题干', '学科', '适用年级', '难易度', '考点', '备注', '选项1', '选项2', '选项3', '选项4', '答案']);

  let up = await upload(custom, { dry: true });
  ok('识别出表头', up.status === 200 && up.data.total === 2, JSON.stringify(up.data).slice(0, 160));
  ok('科目中文别名可用', up.data.preview && up.data.preview.every(p => p.action !== 'error'), JSON.stringify(up.data.failed || []));
  ok('「备注」列被忽略', !(up.data.unknownColumns || []).includes('备注'), JSON.stringify(up.data.unknownColumns));

  // 正确答案填选项原文
  const byText = makeSheet([
    [`${T1}-原文`, '科学', '4', '3', '光', '下面哪个不是光源？', '太阳', '月亮', '篝火', '手电筒', '月亮'],
  ], ['题目', '科目', '年级', '难度', '知识点', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案']);
  up = await upload(byText, { dry: true });
  ok('答案填选项原文能对上', up.data.error === 0 && up.data.create === 1, JSON.stringify(up.data.failed || []));

  /* ---------------- 坏行不拖累好行 ---------------- */
  section('【坏行隔离】');
  const mixed = makeSheet([
    ['', '数学', '3', '1', '分数', '正常题一？', 'A1', 'B1', 'C1', 'D1', 'A'],
    ['', '数学', '3', '1', '分数', '', 'A2', 'B2', 'C2', 'D2', 'A'],               // 题干空
    ['', '美术', '3', '1', '画画', '科目不认识？', 'A3', 'B3', 'C3', 'D3', 'A'],     // 科目非法
    ['', '数学', '3', '1', '分数', '选项重复？', 'X', 'X', 'Y', 'Z', 'A'],          // 选项重复
    ['', '数学', '9', '1', '分数', '年级越界？', 'A5', 'B5', 'C5', 'D5', 'A'],       // 年级越界
    ['', '数学', '3', '1', '分数', '答案对不上？', 'A6', 'B6', 'C6', 'D6', 'Z'],     // 答案非法
  ], ['题目ID', '科目', '年级', '难度', '知识点', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案']);
  up = await upload(mixed, { dry: true });
  ok('6 行全部读入', up.data.total === 6, String(up.data.total));
  ok('只 1 行可导入', up.data.create === 1, JSON.stringify(up.data).slice(0, 200));
  ok('5 行报错', up.data.error === 5, String(up.data.error));
  const errRows = (up.data.failed || []).map(f => f.row);
  ok('错误带正确行号', JSON.stringify(errRows) === JSON.stringify([3, 4, 5, 6, 7]), JSON.stringify(errRows));
  ok('错误文案看得懂', (up.data.failed || []).every(f => f.error && f.error.length > 2));

  /* ---------------- 真正导入 ---------------- */
  section('【正式导入 / 去重 / 覆盖】');
  let r = await upload(custom, { dry: false, mode: 'create' });
  ok('导入 2 道', r.data.created === 2, JSON.stringify(r.data));

  r = await upload(custom, { dry: false, mode: 'create' });
  ok('重复导入被跳过', r.data.created === 0 && r.data.skipped === 2, JSON.stringify(r.data));

  // 找到刚建的题，改一下再按 ID 覆盖
  const list = await (await fetch(BASE + '/api/admin/questions?keyword=' + encodeURIComponent(stamp) + '&size=50', { headers: H() })).json();
  ok('能检索到新题', list.total === 2, String(list.total));
  const target = list.rows.find(x => x.text === T1);
  ok('新题带 admin 来源', target && target.source === 'admin', JSON.stringify(target && target.source));

  const upd = makeSheet([
    ['数学', '3', '3', '分数的意义', '【改过】' + stamp + ' 1/2 和 2/4 是什么关系？', '相等', '不相等', '无法比较', '前者大', 'A', target.id],
  ], ['科目', '年级', '难度', '知识点', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案', '题目ID']);
  r = await upload(upd, { dry: true, mode: 'upsert' });
  ok('按 ID 覆盖：预检为 update', r.data.update === 1, JSON.stringify(r.data).slice(0, 160));
  r = await upload(upd, { dry: false, mode: 'upsert' });
  ok('按 ID 覆盖：执行成功', r.data.updated === 1 && r.data.created === 0, JSON.stringify(r.data));

  const after = await (await fetch(BASE + '/api/admin/questions/' + target.id, { headers: H() })).json();
  ok('题目内容真的改了', after.text === '【改过】' + stamp + ' 1/2 和 2/4 是什么关系？', after.text);
  ok('难度改成 3', Number(after.level) === 3, String(after.level));

  // 只填题干相同、不带 ID，upsert 也应命中同一道
  const noId = makeSheet([
    ['数学', '3', '3', '分数的意义', '【改过】' + stamp + ' 1/2 和 2/4 是什么关系？', '相等', '不相等', '无法比较', '前者大', 'A'],
  ], ['科目', '年级', '难度', '知识点', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案']);
  r = await upload(noId, { dry: true, mode: 'upsert' });
  ok('无 ID 时按题干命中更新', r.data.update === 1, JSON.stringify(r.data).slice(0, 160));
  r = await upload(noId, { dry: true, mode: 'create' });
  ok('create 模式判为已存在', r.data.skip === 1, JSON.stringify(r.data).slice(0, 160));

  /* ---------------- 同一份表格内部重复 ---------------- */
  section('【表内重复】');
  const dupFile = makeSheet([
    ['', '数学', '3', '1', '分数', `【内重复】${stamp} 题？`, 'A', 'B', 'C', 'D', 'A'],
    ['', '数学', '3', '1', '分数', `【内重复】${stamp} 题？`, 'A', 'B', 'C', 'D', 'A'],
  ], ['题目ID', '科目', '年级', '难度', '知识点', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案']);
  up = await upload(dupFile, { dry: true });
  ok('第 2 行被判为表内重复', up.data.skip === 1 && up.data.create === 1, JSON.stringify(up.data).slice(0, 160));

  /* ---------------- 边界 ---------------- */
  section('【边界】');
  const empty = makeSheet([], ['题目ID', '科目', '年级', '难度', '知识点', '题干', '选项A', '选项B', '选项C', '选项D', '正确答案']);
  up = await upload(empty, { dry: true });
  ok('空表不报错，0 行', up.status === 200 && up.data.total === 0, JSON.stringify(up.data).slice(0, 120));

  const noHeader = makeSheet([['a', 'b', 'c']], ['第一列', '第二列', '第三列']);
  up = await upload(noHeader, {});
  ok('认不出表头时报错', up.status === 400 && /表头/.test(up.data.error || ''), JSON.stringify(up.data));

  const junk = Buffer.from('this is not an excel file at all');
  up = await upload(junk, {});
  ok('垃圾文件报错不崩', up.status === 400 && !!up.data.error, JSON.stringify(up.data).slice(0, 120));

  // 未登录
  const savedToken = TOKEN; TOKEN = 'bad-token';
  const noAuth = await fetch(BASE + '/api/admin/export.xlsx', { headers: H() });
  ok('导出需要登录', noAuth.status === 401, String(noAuth.status));
  const noAuthImport = await upload(custom, {});
  ok('导入需要登录', noAuthImport.status === 401, String(noAuthImport.status));
  TOKEN = savedToken;

  /* ---------------- 清理 ---------------- */
  section('【清理测试数据】');
  const all = await (await fetch(BASE + '/api/admin/questions?keyword=' + encodeURIComponent(stamp) + '&size=100', { headers: H() })).json();
  const ids = all.rows.map(x => x.id);
  if (ids.length) {
    const del = await (await fetch(BASE + '/api/admin/bulk', {
      method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', ids }),
    })).json();
    ok('清理完成', del.ok === ids.length, JSON.stringify(del));
  } else ok('没有残留', true);

  const left = await (await fetch(BASE + '/api/admin/questions?status=added&size=5', { headers: H() })).json();
  ok('没有遗留的新增题', left.total === 0 || left.rows.every(x => !String(x.text).includes(stamp)), String(left.total));

  // 测试数据留下的软删墓碑也清掉，避免污染真实题库的「已删除」列表
  const gone = await (await fetch(BASE + '/api/admin/questions?status=deleted&size=100', { headers: H() })).json();
  const isTest = s => /E2E题干-|XLSXE2E|Excel 界面测试题|【测试】|【改过】/.test(String(s));
  const onlyMine = gone.rows.length > 0 && gone.rows.every(x => isTest(x.text));
  if (onlyMine) {
    const sum = await (await fetch(BASE + '/api/admin/summary', { headers: H() })).json();
    if (Number(sum.editedCount) === 0) {
      await fetch(BASE + '/api/admin/reset', {
        method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESET' }),
      });
      ok('修订层已复位（测试残留清理干净）', true);
    }
  }

  console.log(`\n${fail === 0 ? '🎉' : '⚠️'} ${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
}

main().catch(e => { console.error('测试中断：', e); process.exitCode = 1; });
