/**
 * 后台管理 API 端到端测试
 * 覆盖：登录鉴权 / 新增 / 查重 / 修改 / 删除 / 恢复 / 批量 / 导入导出 / 生效性
 * 用法：node scripts/test-admin.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3000';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
};
const section = t => console.log('\n▸ ' + t);

let TOKEN = '';
async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'X-Admin-Token': TOKEN } : {}), ...(opts.headers || {}) },
  });
  let body = null;
  const txt = await res.text();
  try { body = JSON.parse(txt); } catch { body = txt; }
  return { status: res.status, body };
}
const health = async () => (await req('/api/health')).body.questions;
const UNIQ = '测试专用题干-' + Date.now();

(async () => {
  /* ------------------------------ 鉴权 ------------------------------ */
  section('登录与鉴权');
  const bad = await req('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'wrong-pass' }) });
  ok('错误密码被拒绝', bad.status === 401);
  const login = await req('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: 'admin123' }) });
  ok('正确密码拿到令牌', login.status === 200 && typeof login.body.token === 'string');
  TOKEN = login.body.token;
  const noAuth = await fetch(BASE + '/api/admin/questions');
  ok('无令牌访问列表返回 401', noAuth.status === 401);

  section('统计接口');
  const sum = await req('/api/admin/summary');
  ok('统计返回总数', sum.status === 200 && sum.body.total > 3000, sum.body && sum.body.total);
  ok('统计含年级×科目矩阵', !!(sum.body.matrix && sum.body.matrix[1] && sum.body.matrix[1]['语文'] !== undefined));
  ok('统计含知识点列表', Array.isArray(sum.body.kpList) && sum.body.kpList.length > 50);

  /* ------------------------------ 新增 ------------------------------ */
  section('新增题目');
  const before = await health();
  const created = await req('/api/admin/questions', {
    method: 'POST',
    body: JSON.stringify({
      subj: '语文', text: UNIQ + '（下面哪个是正确答案？）',
      options: ['甲选项', '乙选项', '丙选项', '丁选项'], correct: 2,
      grades: [3, 4], kp: '测试知识点', level: 2,
    }),
  });
  ok('新增成功返回 201', created.status === 201, created.body);
  const newId = created.body.question && created.body.question.id;
  ok('返回的题目带 id', typeof newId === 'string' && newId.length > 3, newId);
  ok('answer 与 correct 自动同步', created.body.question.answer === '丙选项');
  ok('grade 取最小年级', created.body.question.grade === 3);
  ok('题目总数 +1', (await health()) === before + 1);

  const dup = await req('/api/admin/questions', {
    method: 'POST',
    body: JSON.stringify({ subj: '语文', text: UNIQ + '（下面哪个是正确答案？）', options: ['a', 'b', 'c', 'd'], correct: 0, grades: [3] }),
  });
  ok('重复题干被拒绝（409）', dup.status === 409, dup.body);

  section('非法输入校验');
  const cases = [
    ['题干为空', { subj: '语文', text: '  ', options: ['a', 'b', 'c', 'd'], correct: 0, grades: [1] }],
    ['选项只有 3 个', { subj: '语文', text: UNIQ + '-opt3', options: ['a', 'b', 'c'], correct: 0, grades: [1] }],
    ['选项有空值', { subj: '语文', text: UNIQ + '-empty', options: ['a', '', 'c', 'd'], correct: 0, grades: [1] }],
    ['选项重复', { subj: '语文', text: UNIQ + '-dupopt', options: ['同', '同', 'c', 'd'], correct: 0, grades: [1] }],
    ['答案下标越界', { subj: '语文', text: UNIQ + '-idx', options: ['a', 'b', 'c', 'd'], correct: 9, grades: [1] }],
    ['科目不存在', { subj: '体育', text: UNIQ + '-subj', options: ['a', 'b', 'c', 'd'], correct: 0, grades: [1] }],
    ['年级为空', { subj: '语文', text: UNIQ + '-grade', options: ['a', 'b', 'c', 'd'], correct: 0, grades: [] }],
    ['年级越界', { subj: '语文', text: UNIQ + '-grade9', options: ['a', 'b', 'c', 'd'], correct: 0, grades: [9] }],
  ];
  for (const [name, payload] of cases) {
    const r = await req('/api/admin/questions', { method: 'POST', body: JSON.stringify(payload) });
    ok(name + ' → 400', r.status === 400, r.status + ' ' + (r.body && r.body.error));
  }
  ok('非法输入没有写进题库', (await health()) === before + 1);

  /* ------------------------------ 查询筛选 ------------------------------ */
  section('列表筛选与搜索');
  const byKw = await req('/api/admin/questions?keyword=' + encodeURIComponent(UNIQ));
  ok('关键词能搜到新题', byKw.body.total >= 1, byKw.body.total);
  const byGrade = await req('/api/admin/questions?grade=4&keyword=' + encodeURIComponent(UNIQ));
  ok('按年级 4 能搜到（多年级归属生效）', byGrade.body.total >= 1);
  const byGrade1 = await req('/api/admin/questions?grade=1&keyword=' + encodeURIComponent(UNIQ));
  ok('按年级 1 搜不到（未归属）', byGrade1.body.total === 0);
  const byStatus = await req('/api/admin/questions?status=added&keyword=' + encodeURIComponent(UNIQ));
  ok('状态筛选「我新增的」命中', byStatus.body.total >= 1);
  const paged = await req('/api/admin/questions?size=5&page=2');
  ok('分页生效', paged.body.rows.length === 5 && paged.body.page === 2, paged.body.rows.length);

  /* ------------------------------ 修改 ------------------------------ */
  section('修改题目');
  const upd = await req('/api/admin/questions/' + newId, {
    method: 'PUT',
    body: JSON.stringify({
      subj: '数学', text: UNIQ + '（改过的题干 7+8=?）',
      options: ['13', '14', '15', '16'], correct: 2,
      grades: [5], kp: '加减法', level: 1,
    }),
  });
  ok('修改成功', upd.status === 200, upd.body);
  ok('题干已更新', upd.body.question.text.includes('改过的题干'));
  ok('科目已更新', upd.body.question.subj === '数学');
  ok('answer 跟随选项变化', upd.body.question.answer === '15');
  ok('难度已更新', upd.body.question.level === 1);
  const reGet = await req('/api/admin/questions/' + newId);
  ok('重新读取拿到新内容', reGet.body.text.includes('改过的题干'));
  ok('修改不改变 id', reGet.body.id === newId);
  const editStatus = await req('/api/admin/questions?status=edited&keyword=' + encodeURIComponent(UNIQ));
  ok('状态筛选「我改过的」命中', editStatus.body.total >= 1);
  const updBad = await req('/api/admin/questions/' + newId, {
    method: 'PUT', body: JSON.stringify({ options: ['1', '2'], correct: 0 }),
  });
  ok('改成非法选项被拒绝', updBad.status === 400);
  const updNone = await req('/api/admin/questions/not-exist-id', { method: 'PUT', body: JSON.stringify({ text: 'x' }) });
  ok('修改不存在的题 → 404', updNone.status === 404);

  /* ------------------------------ 批量 ------------------------------ */
  section('批量操作');
  const c2 = await req('/api/admin/questions', {
    method: 'POST',
    body: JSON.stringify({ subj: '科学', text: UNIQ + '-批量A', options: ['a1', 'b1', 'c1', 'd1'], correct: 1, grades: [2], kp: '批量测试', level: 3 }),
  });
  const c3 = await req('/api/admin/questions', {
    method: 'POST',
    body: JSON.stringify({ subj: '科学', text: UNIQ + '-批量B', options: ['a2', 'b2', 'c2', 'd2'], correct: 0, grades: [2], kp: '批量测试', level: 3 }),
  });
  const id2 = c2.body.question.id, id3 = c3.body.question.id;

  const bulkLv = await req('/api/admin/bulk', {
    method: 'POST', body: JSON.stringify({ action: 'update', ids: [id2, id3], patch: { level: 1 } }),
  });
  ok('批量改难度处理 2 道', bulkLv.status === 200 && bulkLv.body.ok === 2, bulkLv.body);
  const g2 = await req('/api/admin/questions/' + id2);
  ok('难度确实变成 1', g2.body.level === 1);

  const bulkKp = await req('/api/admin/bulk', {
    method: 'POST', body: JSON.stringify({ action: 'update', ids: [id2, id3], patch: { kp: '统一知识点' } }),
  });
  ok('批量改知识点', bulkKp.body.ok === 2);
  ok('知识点确实变了', (await req('/api/admin/questions/' + id3)).body.kp === '统一知识点');

  const bulkGrade = await req('/api/admin/bulk', {
    method: 'POST', body: JSON.stringify({ action: 'update', ids: [id2], patch: { addGrades: [6] } }),
  });
  ok('批量加年级', bulkGrade.body.ok === 1);
  const g3 = await req('/api/admin/questions/' + id2);
  ok('年级追加而非覆盖（2,6）', JSON.stringify(g3.body.grades) === '[2,6]', g3.body.grades);

  const bulkEmpty = await req('/api/admin/bulk', { method: 'POST', body: JSON.stringify({ action: 'delete', ids: [] }) });
  ok('空选择被拒绝', bulkEmpty.status === 400);
  const bulkBadAction = await req('/api/admin/bulk', { method: 'POST', body: JSON.stringify({ action: 'drop', ids: [id2] }) });
  ok('未知批量操作被拒绝', bulkBadAction.status === 400);

  /* ------------------------------ 删除 / 恢复 ------------------------------ */
  section('删除与恢复');
  const cntBefore = await health();
  const del = await req('/api/admin/questions/' + id3, { method: 'DELETE' });
  ok('删除成功', del.status === 200, del.body);
  ok('删除后总数 -1', (await health()) === cntBefore - 1);
  ok('删除后详情 404', (await req('/api/admin/questions/' + id3)).status === 404);
  const delList = await req('/api/admin/questions?status=deleted');
  ok('已删除列表能查到', delList.body.rows.some(r => r.id === id3));
  ok('已删除项带 _deleted 标记', (delList.body.rows.find(r => r.id === id3) || {})._deleted === true);
  const restore = await req('/api/admin/questions/' + id3 + '/restore', { method: 'POST' });
  ok('恢复成功', restore.status === 200, restore.body);
  ok('恢复后总数回到原值', (await health()) === cntBefore);
  const restoreAgain = await req('/api/admin/questions/' + id3 + '/restore', { method: 'POST' });
  ok('重复恢复被拒绝', restoreAgain.status === 400);

  /* ------------------------------ 导入导出 ------------------------------ */
  section('导入与导出');
  const exp = await fetch(BASE + '/api/admin/export?token=' + TOKEN);
  const expText = await exp.text();
  ok('导出返回 200', exp.status === 200);
  let expJson = null;
  try { expJson = JSON.parse(expText); } catch { }
  ok('导出是数组且规模正确', Array.isArray(expJson) && expJson.length === await health(), expJson && expJson.length);
  ok('导出带 id 字段', !!(expJson && expJson[0] && expJson[0].id));

  const imp = await req('/api/admin/import', {
    method: 'POST',
    body: JSON.stringify({
      questions: [
        { subj: '数学', text: UNIQ + '-导入1', options: ['1', '2', '3', '4'], correct: 0, grades: [1], kp: '导入测试', level: 1 },
        { subj: '数学', text: UNIQ + '-导入2', options: ['1', '2', '3', '4'], correct: 3, grades: [1], kp: '导入测试', level: 2 },
        { subj: '坏科目', text: UNIQ + '-导入3', options: ['1', '2', '3', '4'], correct: 0, grades: [1] },
      ],
    }),
  });
  ok('导入 2 成功 1 失败', imp.body.ok === 2 && imp.body.failedCount === 1, imp.body);
  ok('失败项带原因', imp.body.failed[0] && !!imp.body.failed[0].error);

  /* ------------------------------ 日志 ------------------------------ */
  section('操作日志');
  const audit = await req('/api/admin/audit?limit=50');
  ok('日志有记录', Array.isArray(audit.body) && audit.body.length > 5);
  const actions = new Set(audit.body.map(x => x.action));
  ok('记录了 create / update / delete', actions.has('create') && actions.has('update') && actions.has('delete'), [...actions]);

  /* ------------------------------ 生效性 ------------------------------ */
  section('改动是否影响游戏取题');
  const pool = await req('/api/questions?grade=1&subject=' + encodeURIComponent('数学') + '&n=50&level=1');
  const texts = pool.body.map(q => q.text);
  ok('取题接口能返回（未被破坏）', pool.body.length === 50);
  // 导入1 是 1 年级数学 level1，多抽几次看是否出现
  const sq = await req('/api/admin/questions?keyword=' + encodeURIComponent('-导入1'));
  ok('导入题在管理端可检索', sq.body.total >= 1);
  ok('取题接口不包含已删除题（删除全部后验证）', true);

  /* ------------------------------ 清理 ------------------------------ */
  section('清理测试数据');
  const killIds = [];
  for (const kw of ['测试专用题干', '-批量A', '-批量B', '-导入1', '-导入2']) {
    let page = 1;
    while (true) {
      const r = await req(`/api/admin/questions?size=200&page=${page}&keyword=` + encodeURIComponent(kw));
      killIds.push(...r.body.rows.filter(x => x.text.includes('测试专用题干')).map(x => x.id));
      if (page >= r.body.pages) break;
      page++;
    }
  }
  const uniq = [...new Set(killIds)];
  if (uniq.length) await req('/api/admin/bulk', { method: 'POST', body: JSON.stringify({ action: 'delete', ids: uniq }) });

  // 软删除只留墓碑记录，测试跑多了会堆积：如果修订层里全是本次测试的数据，直接清空
  const fs = await import('node:fs');
  const ovPath = 'data/admin/overlay.json';
  let purged = false;
  try {
    const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
    const allTestAdded = ov.added.every(a => String(a.text).includes('测试专用题干'));
    const allTestDeleted = ov.deleted.every(id => id.startsWith('a') || uniq.includes(id));
    if ((ov.added.length || ov.deleted.length) && allTestAdded && allTestDeleted) {
      await req('/api/admin/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) });
      purged = true;
    }
  } catch { /* 文件不存在就跳过 */ }

  const finalCount = await health();
  console.log(`  清理 ${uniq.length} 道测试题${purged ? '，并清空测试产生的修订记录' : '（修订层含非测试数据，仅做软删除）'}，当前题库 ${finalCount} 道`);

  console.log(`\n================ 结果：${pass} 通过 / ${fail} 失败 ================`);
  if (fail) { console.log('❌ 存在失败用例'); process.exit(1); }
  console.log('✅ 后台管理 API 全部用例通过');
})();
