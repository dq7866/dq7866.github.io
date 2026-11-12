// 关卡挑战：给定目标模型 + 限定积木数，比谁搭得更像
import { shapeRot, shapeBounds } from './geom.js';
import { getShape } from './shapes.js';
import { MODELS } from './blueprints.js';

function cellsOfList(list) {
  const set = new Map();
  for (const d of list) {
    const def = getShape(d.shapeId);
    if (def && def.fix) continue;     // 铆钉/胶水是紧固件，不算"用料格子"
    const shape = shapeRot(def, d.rx || 0, d.ry || 0, d.rz || 0);
    for (const c of shape.cells) {
      set.set(`${d.x + c.c},${d.y + c.l},${d.z + c.r}`, d.color);
    }
  }
  return set;
}

/**
 * 计算玩家作品与目标模型的相似度
 * 评分维度：
 *  - 位置覆盖率：目标格子中有多少被填上（权重 0.62）
 *  - 颜色吻合度：填上的格子颜色是否一致（权重 0.26）
 *  - 整洁度：多余格子越少越好（权重 0.12）
 */
export function score(targetList, playerList) {
  const target = cellsOfList(centerList(targetList));
  const player = cellsOfList(centerList(playerList));

  if (!target.size) return { pct: 0, cover: 0, color: 0, clean: 0, stars: 0 };

  let hit = 0, colorHit = 0;
  for (const [k, c] of target) {
    if (player.has(k)) {
      hit++;
      if (player.get(k) === c) colorHit++;
    }
  }
  const cover = hit / target.size;
  const colorRatio = hit ? colorHit / hit : 0;

  let extra = 0;
  for (const k of player.keys()) if (!target.has(k)) extra++;
  const clean = player.size ? Math.max(0, 1 - extra / Math.max(6, target.size * 0.7)) : 0;

  const pct = Math.round((cover * 0.62 + colorRatio * 0.26 + clean * 0.12) * 100);
  const stars = pct >= 88 ? 3 : pct >= 68 ? 2 : pct >= 42 ? 1 : 0;

  return {
    pct: Math.min(100, pct),
    cover: Math.round(cover * 100),
    color: Math.round(colorRatio * 100),
    clean: Math.round(clean * 100),
    stars,
  };
}

// 与中心化对齐（避免玩家把模型搭在别处就零分）
export function centerList(list) {
  if (!list.length) return [];
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const d of list) {
    const b = shapeBounds(shapeRot(getShape(d.shapeId), d.rx || 0, d.ry || 0, d.rz || 0));
    minX = Math.min(minX, d.x);
    minZ = Math.min(minZ, d.z);
    maxX = Math.max(maxX, d.x + b.w);
    maxZ = Math.max(maxZ, d.z + b.d);
  }
  const ox = Math.round((minX + maxX) / 2);
  const oz = Math.round((minZ + maxZ) / 2);
  return list.map(d => ({ ...d, x: d.x - ox, z: d.z - oz }));
}

/** 目标模型占用的格子总数（用来推算合理预算） */
function cellCount(list) {
  const s = new Set();
  for (const d of list) {
    const sh = shapeRot(getShape(d.shapeId), d.rx || 0, d.ry || 0, d.rz || 0);
    for (const c of sh.cells) s.add(`${d.x + c.c},${d.y + c.l},${d.z + c.r}`);
  }
  return s.size;
}

/**
 * 挑战关卡配置（由易到难排列）
 *
 * 预算不再手写固定块数：早先写死的 26 块和图纸实际大小完全脱节——
 * 第一关小屋有 157 格，26 块最多只能盖住 36%，理论上限不到两星，
 * 孩子怎么努力都只能拿一星，第一关就把人劝退。
 * 现在按"孩子平均一块约 2 格"推算，再留 15% 余量，跟着图纸自动走。
 */
const RAW_LEVELS = [
  { id: 'lv1', name: '小狗',   hint: '四条腿一样高，头要抬起来',       modelId: 'dog' },
  { id: 'lv2', name: '瞭望塔', hint: '立柱要竖直，楼板要放平',         modelId: 'tower' },
  { id: 'lv3', name: '小帆船', hint: '船体要长，桅杆要高',             modelId: 'ship' },
  { id: 'lv4', name: '小汽车', hint: '底盘要平，车厢要稳',             modelId: 'car' },
  { id: 'lv5', name: '苹果树', hint: '树干立中间，树冠一层比一层大',   modelId: 'tree' },
  { id: 'lv6', name: '大火箭', hint: '一层一层往上收，就成锥形了',     modelId: 'rocket' },
  { id: 'lv7', name: '小门楼', hint: '先用砖块围一个方框，再在上面盖屋顶', modelId: 'cottage' },
  { id: 'lv8', name: '城堡',   hint: '先立四座塔楼，再用墙把它们连起来', modelId: 'castle' },
];

export const LEVELS = RAW_LEVELS.map(lv => {
  const m = MODELS.find(x => x.id === lv.modelId);
  const cells = m ? cellCount(m.list) : 0;
  const budget = Math.max(14, Math.ceil(cells / 2 * 1.15) + 4);
  return { ...lv, cells, budget };
});
