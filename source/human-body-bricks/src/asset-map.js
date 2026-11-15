// asset-map.js — 把解剖模型里的具名结构映射到本应用的「形状」
// 数据源：
//   ecorche : Écorché（CC BY-SA 4.0，BodyParts3D + Z-Anatomy 合并校正）骨骼 / 肌肉 / 眼 / 外耳
//   ct      : CT Anatomy GLB（CC BY 4.0，TotalSegmentator 分割）内脏器官
// 规则只写一次，浏览器与离线标定脚本共用。

const RULES = [
  // ---------------- 骨骼 ----------------
  // 顺序即优先级：先判特殊结构（牙、眼球、外耳），再按区域骨骼逐条细化。
  { id: 'skull', source: 'ecorche', layer: 'skeleton', tissue: 'tooth' },
  { id: 'eye', source: 'ecorche', layer: 'skeleton', tissue: 'eye' },
  { id: 'eye', source: 'ecorche', layer: 'skeleton', re: /sclera|cornea/ },
  { id: 'ear', source: 'ecorche', layer: 'skeleton', re: /external ear/ },
  // 颅骨（脑颅 + 面颅，不含下颌骨）
  { id: 'skull', source: 'ecorche', layer: 'skeleton', re: /frontal bone|parietal bone|temporal bone|occipital bone|sphenoid|ethmoid|zygomatic|maxilla|lacrimal|nasal bone|palatine|vomer|inferior nasal concha|nasal cartilage|alar cartilage/ },
  { id: 'mandible', source: 'ecorche', layer: 'skeleton', re: /^mandible$/ },
  // 中轴：脊柱按颈椎 / 胸椎 / 腰椎 / 骶骨 / 尾骨拆开（椎间盘随所在节段）
  { id: 'cervical', source: 'ecorche', layer: 'skeleton', re: /^(atlas|axis|intervertebral disk of axis)$|cervical vertebra|disk of .*cervical/ },
  { id: 'thoracic', source: 'ecorche', layer: 'skeleton', re: /thoracic vertebra|disk of .*thoracic/ },
  { id: 'lumbar', source: 'ecorche', layer: 'skeleton', re: /lumbar vertebra|disk of .*lumbar/ },
  { id: 'sacrum', source: 'ecorche', layer: 'skeleton', re: /^sacrum$/ },
  { id: 'coccyx', source: 'ecorche', layer: 'skeleton', re: /coccyx/ },
  // 胸廓：肋骨（含肋软骨）与胸骨分开
  { id: 'ribs', source: 'ecorche', layer: 'skeleton', re: / rib$|costal cartilage/ },
  { id: 'sternum', source: 'ecorche', layer: 'skeleton', re: /sternum|manubrium|xiphoid/ },
  // 肩带与上肢
  { id: 'clavicle', source: 'ecorche', layer: 'skeleton', re: /clavicle/ },
  { id: 'scapula', source: 'ecorche', layer: 'skeleton', re: /scapula/ },
  { id: 'humerus', source: 'ecorche', layer: 'skeleton', re: /humerus/ },
  { id: 'radius', source: 'ecorche', layer: 'skeleton', re: /radius$/ },
  { id: 'ulna', source: 'ecorche', layer: 'skeleton', re: /ulna$/ },
  // 掌骨必须排在腕骨之前：名字里 "metacarpal" 含子串 "carpal"，否则会被腕骨规则抢走
  { id: 'metacarpal', source: 'ecorche', layer: 'skeleton', re: /metacarpal/ },
  { id: 'carpal', source: 'ecorche', layer: 'skeleton', re: /carpal|scaphoid|lunate|pisiform|trapezium|trapezoid|capitate|hamate/ },
  { id: 'phalangesHand', source: 'ecorche', layer: 'skeleton', re: /phalanx of .*(finger|thumb)/ },
  // 骨盆与下肢
  { id: 'pelvis', source: 'ecorche', layer: 'skeleton', re: /hip bone/ },
  { id: 'femur', source: 'ecorche', layer: 'skeleton', re: /femur/ },
  { id: 'patella', source: 'ecorche', layer: 'skeleton', re: /patella/ },
  { id: 'tibia', source: 'ecorche', layer: 'skeleton', re: /tibia/ },
  { id: 'fibula', source: 'ecorche', layer: 'skeleton', re: /fibula/ },
  { id: 'tarsal', source: 'ecorche', layer: 'skeleton', re: /calcaneus|talus|navicular|cuboid|cuneiform/ },
  { id: 'metatarsal', source: 'ecorche', layer: 'skeleton', re: /metatarsal/ },
  { id: 'phalangesFoot', source: 'ecorche', layer: 'skeleton', re: /phalanx of .*toe/ },

  // ---------------- 肌肉 ----------------
  { id: 'trapezius', source: 'ecorche', layer: 'muscle', re: /trapezius/ },
  { id: 'deltoid', source: 'ecorche', layer: 'muscle', re: /deltoid/ },
  { id: 'pectoralis', source: 'ecorche', layer: 'muscle', re: /pectoralis major/ },
  { id: 'biceps', source: 'ecorche', layer: 'muscle', re: /biceps brachii/ },
  { id: 'rectus', source: 'ecorche', layer: 'muscle', re: /rectus abdominis/ },
  { id: 'erector', source: 'ecorche', layer: 'muscle', re: /iliocostalis|longissimus|spinalis/ },
  { id: 'gluteus', source: 'ecorche', layer: 'muscle', re: /gluteus maximus/ },
  { id: 'quadriceps', source: 'ecorche', layer: 'muscle', re: /rectus femoris|vastus/ },
  { id: 'gastrocnemius', source: 'ecorche', layer: 'muscle', re: /gastrocnemius/ },

  // 感官（眼球、外耳）已在骨层规则最前面处理，这里不再重复

  // ---------------- 内脏（CT 分割）----------------
  { id: 'brain', source: 'ct', re: /^brain$/ },
  { id: 'heart', source: 'ct', re: /^heart$|atrial_appendage/ },
  { id: 'lungs', source: 'ct', re: /^lung_/ },
  { id: 'liver', source: 'ct', re: /^liver$/ },
  { id: 'stomach', source: 'ct', re: /^stomach$/ },
  { id: 'smallIntestine', source: 'ct', re: /small_bowel|duodenum/ },
  { id: 'largeIntestine', source: 'ct', re: /^colon$/ },
  { id: 'kidney', source: 'ct', re: /^kidney_/ },
  { id: 'bladder', source: 'ct', re: /urinary_bladder/ },
  { id: 'spleen', source: 'ct', re: /^spleen$/ },
];

/**
 * @param {'ecorche'|'ct'} source 数据源
 * @param {string} name 结构名（Écorché 用 userData.name，CT 用节点名）
 * @param {{tissue?:string, layer?:string}} meta 附加信息
 * @returns {string|null} 形状 id
 */
export function partIdOf(source, name, meta = {}) {
  const n = String(name || '').toLowerCase();
  const layer = String(meta.layer || '');
  for (const r of RULES) {
    if (r.source !== source) continue;
    if (r.tissue && r.tissue !== meta.tissue) continue;
    // layer: 'skeleton' 只匹配骨层；'muscle' 匹配 deep/superficial muscles
    if (r.layer === 'skeleton' && layer && layer !== 'skeleton') continue;
    if (r.layer === 'muscle' && layer && !layer.includes('muscle')) continue;
    if (r.re && !r.re.test(n)) continue;
    return r.id;
  }
  return null;
}

/** 该数据源里需要参与显示的结构名判定器（其余网格不加载） */
export function isWanted(source, name, meta) {
  return partIdOf(source, name, meta) !== null;
}
