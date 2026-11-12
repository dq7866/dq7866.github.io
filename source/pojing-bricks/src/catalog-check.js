/**
 * 图纸目录自检。
 *
 * 图纸是「数据」，数据就可能写错：形状名拼错、颜色不在调色板、坐标不是整数、
 * 两块砖压在同一格、取景参数缺失……这类问题在运行时的表现往往只是
 * 「点了没反应」或「进去看到一个空场」，用户完全无法理解，也没法自己解决。
 *
 * 所以在启动时把整份目录过一遍，把问题提前暴露到控制台，并在界面上把
 * 有问题的图纸标成「暂不可用」，而不是让用户点进一个坏掉的世界。
 */
import { getShape, COLOR_HEX } from './shapes.js';
import { shapeRot } from './geom.js';

const isInt = v => Number.isInteger(v);

/** 单张图纸体检：返回问题字符串数组（空数组 = 健康） */
export function checkModel(model) {
  const problems = [];
  if (!model || typeof model !== 'object') return ['图纸对象无效'];

  const list = model.list;
  if (!Array.isArray(list) || !list.length) {
    problems.push('零件列表为空');
    return problems;
  }
  if (!model.cam || typeof model.cam.theta !== 'number' || typeof model.cam.phi !== 'number') {
    problems.push('缺少取景参数 cam');
  } else if (!isFinite(model.cam.theta) || !isFinite(model.cam.phi)) {
    problems.push('取景参数不是有限数字');
  }

  const ids = new Set();
  const occupied = new Map();   // "x,y,z" → 零件序号
  const bad = new Set();

  list.forEach((d, i) => {
    if (!d || typeof d !== 'object') { problems.push(`#${i} 零件数据无效`); return; }
    const def = getShape(d.shapeId);
    if (!def) { problems.push(`#${i} 形状不存在：${d.shapeId}`); return; }
    if (!(d.color in COLOR_HEX)) problems.push(`#${i} 颜色不在调色板：${d.color}`);
    if (!isInt(d.x) || !isInt(d.y) || !isInt(d.z)) { problems.push(`#${i} 坐标不是整数`); return; }
    if (d.y < 0) problems.push(`#${i} 落到地面以下（y=${d.y}）`);
    for (const k of ['rx', 'ry', 'rz']) {
      const v = d[k];
      if (v !== undefined && v !== null && !(isInt(v) && v >= 0 && v <= 3)) {
        problems.push(`#${i} 旋转 ${k}=${v} 非法`);
      }
    }
    if (d.id != null) {
      if (ids.has(d.id)) problems.push(`#${i} 零件 id 重复：${d.id}`);
      ids.add(d.id);
    }
    // 占格冲突：两块砖压在同一格是「物理上不可能」的，孩子的第一反应会是"游戏坏了"
    let shape;
    try { shape = shapeRot(def, d.rx || 0, d.ry || 0, d.rz || 0); }
    catch { problems.push(`#${i} 旋转计算失败`); return; }
    for (const c of shape.cells) {
      const key = `${d.x + c.c},${d.y + c.l},${d.z + c.r}`;
      const prev = occupied.get(key);
      if (prev !== undefined && prev !== i) {
        if (!bad.has(i)) { problems.push(`#${i} 与 #${prev} 占同一格 ${key}`); bad.add(i); }
      } else {
        occupied.set(key, i);
      }
    }
  });

  return problems;
}

/** 整份目录体检：{ total, bad: [{ model, problems }] } */
export function checkCatalog(models) {
  const bad = [];
  for (const m of models || []) {
    const problems = checkModel(m);
    if (problems.length) bad.push({ model: m, problems });
  }
  return { total: (models || []).length, bad };
}
