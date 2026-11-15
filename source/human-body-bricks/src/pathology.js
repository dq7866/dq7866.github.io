// pathology.js — 病理课堂：常见病的「位置 → 原理 → 处置 → 预防」逐幕动画
//
// 与 linkage / pathways（讲正常生理）不同，这里讲的是**病变过程**：
//   · 同一根血管从正常 → 脂质条纹 → 粥样斑块 → 管腔狭窄 → 斑块破裂/血栓闭塞，
//     管径是顶点级真实收缩，血流是粒子级真实的射流、湍流与停滞，不是换张贴图
//   · 冠心病 / 支架 / 脑梗死 / 肺栓塞共用这套「血管 + 病变 + 血流」语言，
//     但各自的解剖地标、走行、供血靶器官不同，一眼能分辨是不同的病
//   · 肾结石另走一条：尿液过饱和 → 结晶长大 → 落入输尿管卡在生理狭窄 →
//     肾盂积水、肾绞痛 → 碎石后随尿流排出
//
// 所有病变参数都由全局时间 t 驱动（与工坊的暂停 / 倍速 / 录制完全同源），
// 每一幕的讲解文字由 drawCaseHud 画进 WebGL 之上的 HUD 图层——
// 因此导出的 MP4 自带字幕，而不只是屏幕上能看到。
import * as THREE from '../lib/three.module.js';
import { vesselGeometry } from './vascular.js';
import { cardiac } from './cardiac.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => {
  const u = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return u * u * (3 - 2 * u);
};
const lerp = (a, b, k) => a + (b - a) * k;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const STAGE_DUR = 6.2;

/* ---------------- 病例文案 ----------------
 * lines：进画面的字幕（每幕最多 3 条短句）
 * detail：讲解面板里的展开说明
 * prevent / caution / emergency：末幕要点与面板分区
 * 口径：科普示意，不替代诊断；涉及急症一律提示就医。
 */
export const CASES = {
  carotid: {
    name: '颈动脉狭窄与堵塞', cat: '血管 · 脑供血',
    site: '颈部两侧 · 颈总动脉分叉', anchor: 'cervical', spot: [0.50, 0.155],
    stages: [
      { title: '一条通向大脑的主干', kicker: '01 · 发生位置',
        lines: ['颈总动脉在甲状软骨上缘分成颈内、颈外两支', '颈内动脉上行入颅，供应大脑前 2/3 的血流', '分叉处血流剪切力紊乱，最容易出问题'],
        detail: '颈动脉位于胸锁乳突肌深面，左右各一。分叉处血流由层流变成分离流，内皮长期受异常剪切力，是粥样硬化的好发部位。' },
      { title: '斑块是怎样长出来的', kicker: '02 · 发病原理',
        lines: ['高血压、高血脂、吸烟反复损伤血管内皮', 'LDL 胆固醇钻进内皮下被氧化、被巨噬细胞吞掉', '泡沫细胞堆积成脂质核心，表面盖一层纤维帽'],
        detail: '这不是「水管里挂了脏东西」，而是血管壁自身的慢性炎症：内皮受损 → 脂质沉积 → 泡沫细胞 → 脂质核心 + 纤维帽，斑块从管壁向内隆起。' },
      { title: '管腔变窄，血流变急', kicker: '03 · 缺血机制',
        lines: ['斑块越厚，管腔越窄，血流被迫从缝隙挤过去', '狭窄处流速骤升形成射流，下游出现湍流', '脑供血储备下降，狭窄 > 70% 时风险明显上升'],
        detail: '同样的血流量通过更窄的截面，流速必须升高；射流与湍流会进一步损伤内皮、激活血小板。安静时尚可代偿，血压波动或体位变化时容易供血不足。' },
      { title: '破裂、血栓、栓塞', kicker: '04 · 急性事件',
        lines: ['不稳定斑块的纤维帽一旦破裂，内容物暴露', '血小板几分钟内聚成血栓，可当场堵死管腔', '小碎块脱落顺流进脑，堵塞更细的脑动脉'],
        detail: '堵塞可表现为一过性黑矇、一侧肢体无力或言语不清（TIA），也可造成脑梗死。症状哪怕几分钟内缓解，也提示高危，必须尽快就诊。' },
      { title: '怎么防，什么时候就医', kicker: '05 · 预防与注意', care: true,
        lines: ['控好血压、血脂、血糖，戒烟并规律有氧运动', '高危人群定期做颈动脉超声，别自行按摩颈部', '突发偏瘫、口角歪斜、言语不清、一过性视物发黑 → 立即急诊'],
        detail: '核心是可控危险因素管理。已发现中重度狭窄者由医生评估药物、内膜剥脱或支架，不要自行停抗血小板药，也不要做剧烈甩头、颈部推拿。' },
    ],
    prevent: ['血压 < 140/90 mmHg 为目标，遵医嘱管理血脂与血糖', '彻底戒烟，每周 ≥ 150 分钟中等强度有氧运动', '40 岁以上合并三高/吸烟者，可咨询医生做颈动脉超声筛查'],
    caution: ['不要用力按摩、推拿颈前区，避免斑块受机械刺激', '不要猛然甩头、长时间过度后仰', '已开抗血小板/他汀者不可自行停药'],
    emergency: ['突发一侧肢体无力或麻木、口角歪斜、说话含糊', '单眼一过性发黑、视物模糊', '突发言语理解困难、眩晕伴复视 → 立即拨打 120'],
  },

  coronary: {
    name: '冠心病 · 心绞痛与心梗', cat: '心脏 · 冠脉缺血',
    site: '心脏表面 · 冠状动脉左前降支', anchor: 'heart', spot: [0.50, 0.315],
    stages: [
      { title: '心肌自己也要供血', kicker: '01 · 发生位置',
        lines: ['冠状动脉从主动脉根部发出，像帽子扣在心脏表面', '左前降支沿前室间沟下行，供应前壁与室间隔', '心肌耗氧极高，靠舒张期冠脉灌注'],
        detail: '心脏是泵，但它自己不能从腔内血液直接取氧，必须靠冠脉。心率快时舒张期缩短，冠脉灌注时间反而变少，这是「越累越缺血」的原因。' },
      { title: '粥样硬化让管腔变细', kicker: '02 · 发病原理',
        lines: ['内皮损伤后脂质沉积，形成向腔内隆起的斑块', '稳定斑块缓慢增大，管腔逐年变窄', '狭窄使冠脉血流储备下降，平静时还能勉强够用'],
        detail: '冠脉狭窄 < 70% 时静息血流多可维持；一旦运动、情绪激动、寒冷使心肌耗氧上升，供血无法同比增加，就出现劳力性心绞痛。' },
      { title: '供需失衡 → 心绞痛', kicker: '03 · 缺血表现',
        lines: ['爬楼、快走、情绪激动时耗氧量陡增', '狭窄下游供血跟不上，缺血心肌收缩变弱、变暗', '胸骨后压榨感，可放射到左肩、下颌、左臂'],
        detail: '典型心绞痛为胸骨后压榨/紧缩感，持续数分钟，休息或含硝酸甘油可缓解。缺血是可逆的：及时恢复供血，心肌仍能复原。' },
      { title: '斑块破裂 → 心肌梗死', kicker: '04 · 急性事件',
        lines: ['不稳定斑块破裂，血小板迅速形成红色血栓', '管腔完全闭塞，下游心肌持续缺血', '超过 20–30 分钟即开始不可逆坏死，该区停止收缩'],
        detail: '心肌梗死与心绞痛的分界在于「是否完全、持续闭塞」。坏死心肌不会再生，越早开通血管，挽救的心肌越多——时间就是心肌。' },
      { title: '预防与急救红线', kicker: '05 · 预防与注意', care: true,
        lines: ['控三高、戒烟、规律运动、维持健康体重', '胸痛 > 10 分钟或休息/含药不缓解 → 立刻拨打 120', '别自己开车去医院，别硬扛、别反复试探活动'],
        detail: '急性心梗的最佳处理是尽快到有急诊 PCI 能力的医院。等待时安静休息、松开衣领，是否服药按调度/医生指导，不要自行叠加硝酸甘油或阿司匹林以外的药。' },
    ],
    prevent: ['血压、血脂（LDL-C）、血糖按医嘱达标，戒烟限酒', '每周 ≥ 150 分钟有氧 + 2 次抗阻，地中海式饮食', '已有冠心病者坚持二级预防用药，定期心内科随访'],
    caution: ['硝酸甘油含服后血压可能骤降，坐位使用、勿反复连含', '胸痛时不要自行驾车、不要独自步行去医院', '不典型的牙痛、上腹痛、气促伴冷汗也可能是心肌缺血'],
    emergency: ['胸骨后压榨性疼痛持续 > 10 分钟', '伴冷汗、恶心、濒死感、放射至左肩/下颌/背部', '含硝酸甘油或休息后仍不缓解 → 立即拨打 120'],
  },

  stent: {
    name: '冠脉支架是怎么放进去的', cat: '介入治疗 · PCI',
    site: '冠状动脉狭窄段 · 经桡/股动脉入路', anchor: 'heart', spot: [0.50, 0.315],
    stages: [
      { title: '先找到那段狭窄', kicker: '01 · 术前评估',
        lines: ['造影显示左前降支近段明显狭窄', '导引导管到位，细导丝先穿过狭窄段', '导丝是后续所有器械的「轨道」'],
        detail: '介入一般从手腕桡动脉或大腿股动脉穿刺，导管逆行到冠脉开口。是否放支架取决于狭窄程度、病变性质、症状与缺血证据，不是「看到窄就放」。' },
      { title: '球囊预扩张', kicker: '02 · 打开通道',
        lines: ['球囊沿导丝送到狭窄处，加压鼓起', '把斑块压向管壁，管腔暂时被撑开', '撤压后血管有弹性回缩，单纯球囊容易再窄'],
        detail: '球囊扩张靠机械挤压斑块与撑开血管中层，可伴短暂血流中断，因此扩张时间要短。弹性回缩与夹层是早期再闭塞的原因，这才有了支架。' },
      { title: '支架释放贴壁', kicker: '03 · 植入过程',
        lines: ['金属网状支架压握在球囊上送到病变处', '再次加压，支架被撑开并嵌入管壁', '撤出球囊与导丝，支架留在原位做永久支撑'],
        detail: '支架是极细的金属网（多为钴铬/铂铬合金），药物洗脱支架表面还会缓慢释放抑制内膜增生的药物，降低再狭窄率。' },
      { title: '血流重新通了', kicker: '04 · 即刻效果',
        lines: ['管腔恢复，射流与湍流消失', '缺血心肌重新得到灌注，胸痛缓解', '支架解决的是「这段管道」，不是全身的动脉粥样硬化'],
        detail: '支架开通的是罪犯病变，其它血管的斑块仍在。所以术后仍需长期药物与危险因素管理，否则别的部位还会出事，或支架内再长血栓。' },
      { title: '术后最该记住的事', kicker: '05 · 预防与注意', care: true,
        lines: ['双联抗血小板药按疗程服满，绝不自行停', '定期复查血脂、心电图，控好三高与体重', '再发胸痛、穿刺处血肿或黑便 → 及时就医'],
        detail: '支架内血栓多与过早停用抗血小板药相关，后果常是急性心梗。拔牙、手术前也要先与心内科沟通用药，不能自行说停就停。' },
    ],
    prevent: ['阿司匹林 + P2Y12 抑制剂按医嘱足疗程，勿自行停药', '他汀长期维持，LDL-C 按危险分层达标', '心脏康复：循序渐进运动 + 戒烟 + 饮食控制'],
    caution: ['任何拔牙/手术/内镜前先告知医生「装过支架」', '观察穿刺侧肢体肿胀、疼痛，观察牙龈/鼻腔/黑便出血', '支架不是治愈，血糖血压血脂仍需长期管理'],
    emergency: ['再次出现持续胸痛、冷汗、气促 → 立即拨打 120', '穿刺处迅速鼓包、剧痛、肢体发凉发麻', '呕血、黑便、明显血尿等出血表现'],
  },

  stone: {
    name: '肾结石与输尿管梗阻', cat: '泌尿 · 梗阻',
    site: '肾盏 / 肾盂 → 输尿管生理狭窄', anchor: 'kidney', spot: [0.55, 0.47],
    stages: [
      { title: '尿液里先有「过饱和」', kicker: '01 · 发生位置',
        lines: ['肾脏滤过形成尿液，经肾盂汇入输尿管', '输尿管有三处生理狭窄，最易卡住结石', '尿量太少时钙、草酸、尿酸浓度升高'],
        detail: '最常见的是草酸钙结石。当尿中成石物质超过溶解度，晶体析出并滞留在肾乳头/肾盏，慢慢长成肉眼可见的结石。' },
      { title: '结晶一层层长大', kicker: '02 · 形成过程',
        lines: ['微小晶体滞留肾盏，成为「核心」', '反复沉积，结石逐年长成带棱角的硬块', '小结石可长期无症状，体检才被发现'],
        detail: '饮水少、高盐高蛋白、高草酸饮食、代谢异常、反复感染与长期卧床都会推高成石风险。结石成分不同，预防策略也不同，需化验成分。' },
      { title: '掉进输尿管，卡住了', kicker: '03 · 肾绞痛',
        lines: ['结石随尿流下移，卡在输尿管狭窄处', '输尿管剧烈蠕动想把石头挤下去，痉挛成绞痛', '腰腹刀割样阵发痛，可放射到会阴、伴恶心血尿'],
        detail: '疼痛来自梗阻后平滑肌痉挛与管腔压力骤升，不是石头「割破」输尿管。梗阻以上尿液排不出去，肾盂逐渐扩张，即肾积水。' },
      { title: '梗阻 → 积水 → 碎石', kicker: '04 · 处置原理',
        lines: ['梗阻持续会让肾盂扩张、肾功能受损', '体外冲击波或输尿管镜把结石碎成小块', '碎片随尿流排出，梗阻解除、积水消退'],
        detail: '< 5–6 mm 的结石多可自行排出；更大、嵌顿、合并感染或肾功能受损时需泌尿外科处理。合并发热的梗阻性肾盂肾炎属于急症。' },
      { title: '多喝水，别憋尿', kicker: '05 · 预防与注意', care: true,
        lines: ['每天饮水 2–2.5 L，让尿色保持淡黄、均匀分配到全天', '限盐、适量动物蛋白，草酸钙者少浓茶菠菜坚果', '腰痛伴发热寒战、尿量骤减或无尿 → 立即急诊'],
        detail: '增加尿量是所有成分结石共同的一级预防。已排出的结石建议做成分分析，并按结果调整饮食与药物；不要长期自行服用排石偏方。' },
    ],
    prevent: ['全天分散饮水 2–2.5 L，运动/高温天再增加', '食盐 < 5 g/天，动物蛋白适量，不盲目限钙', '草酸钙结石者减少浓茶、菠菜、坚果；尿酸结石者控嘌呤'],
    caution: ['不要长期憋尿，久坐每小时起身活动', '别靠「猛喝水 + 蹦跳」硬排大结石', '反复发作建议查代谢指标并做结石成分分析'],
    emergency: ['腰痛伴发热、寒战（警惕梗阻合并感染）', '持续剧烈绞痛、呕吐、无法进食进水', '尿量明显减少、无尿或肉眼血尿不止 → 急诊'],
  },

  stroke: {
    name: '脑梗死 · 栓子堵住脑动脉', cat: '脑血管 · 时间窗',
    site: '大脑中动脉 M1 段及分支', anchor: 'brain', spot: [0.50, 0.10],
    stages: [
      { title: '脑组织几乎没有储备', kicker: '01 · 发生位置',
        lines: ['大脑中动脉供应半球外侧大部分皮层与基底节', '脑组织耗氧高、几乎不储能', '血流中断数分钟，神经元就开始不可逆损伤'],
        detail: '脑重量只占体重约 2%，却消耗约 20% 的静息氧。一旦供血动脉闭塞，中心区迅速坏死，周边「缺血半暗带」是抢救的目标。' },
      { title: '栓子从哪里来', kicker: '02 · 发病原理',
        lines: ['房颤时左心房血流淤滞形成血栓', '或颈动脉斑块碎屑脱落', '栓子随血流进入颈内动脉，一路向上'],
        detail: '脑梗死约大部分为栓塞/血栓性。心源性栓塞（房颤最常见）与大动脉粥样硬化性栓塞是两条主要来源，治疗与二级预防策略不同。' },
      { title: '卡在越来越细的分叉', kicker: '03 · 血管闭塞',
        lines: ['栓子随血流漂到比它更细的脑动脉', '卡在分叉处，远端血流骤停', '供血区脑组织变暗、水肿，功能迅速丧失'],
        detail: '闭塞远端并非立刻全部死亡：侧支循环能维持一部分半暗带。溶栓/取栓的目的就是在半暗带变成梗死前恢复再灌注。' },
      { title: '时间就是大脑', kicker: '04 · 识别与再通',
        lines: ['静脉溶栓一般有时间窗，取栓需影像评估', '越早再通，保留的功能越多', '别等「休息一下看看」，也别自行吃阿司匹林'],
        detail: '突发神经功能缺损要先排除出血，因此必须立刻到有卒中中心的医院做影像。自行服药、掐人中、喂水喂药都可能耽误或加重风险。' },
      { title: 'FAST 识别与预防', kicker: '05 · 预防与注意', care: true,
        lines: ['F 面瘫 / A 肢无力 / S 言语不清 / T 抓紧时间打 120', '房颤者按医嘱评估抗凝，控血压血脂血糖、戒烟', '症状几分钟缓解也可能是 TIA，同样要急诊评估'],
        detail: 'TIA 是最高级别的预警，短期卒中风险显著升高。预防重点是房颤抗凝、颈动脉狭窄评估与危险因素管理，而非「定期输液通血管」。' },
    ],
    prevent: ['房颤患者由医生评估卒中风险与抗凝适应证', '血压、血脂、血糖达标，戒烟、限酒、规律运动', '发现颈动脉中重度狭窄及时专科评估'],
    caution: ['不要自行服用阿司匹林来「试探」突发偏瘫', '不要给意识不清者喂水、喂药、喂饭', '记录症状出现的准确时间，这决定能否溶栓'],
    emergency: ['突发一侧面部歪斜、单侧肢体无力或麻木', '说话含糊、听不懂话、突发视物障碍', '突发严重眩晕伴复视/行走不稳 → 立即拨打 120'],
  },

  dvt: {
    name: '下肢血栓与肺栓塞', cat: '静脉 · 栓塞',
    site: '小腿深静脉 → 下腔静脉 → 肺动脉', anchor: 'lungs', spot: [0.62, 0.60],
    stages: [
      { title: '血流慢下来', kicker: '01 · 三要素',
        lines: ['久卧、久坐、术后制动让小腿肌泵停摆', '静脉血流淤滞，加上高凝状态与内皮损伤', '三者构成 Virchow 三要素，深静脉血栓形成'],
        detail: '长途飞行、大手术后、肿瘤、妊娠、口服雌激素、既往血栓史都是常见背景。小腿肌泵本来负责把静脉血往上挤，不动就淤住了。' },
      { title: '血栓在静脉里长大', kicker: '02 · 局部表现',
        lines: ['血栓沿静脉蔓延，管腔被红褐色团块占据', '单侧小腿/大腿肿胀、胀痛、皮温升高', '约一半患者症状轻微甚至没有明显不适'],
        detail: '单侧不对称肿胀是最有价值的线索。但确诊不能靠手感，需要加压超声与 D-二聚体等检查，并由医生判断。' },
      { title: '脱落，顺流而上', kicker: '03 · 栓塞路径',
        lines: ['血栓一部分脱落成为栓子', '经腘静脉→股静脉→下腔静脉→右心房→右心室', '最后被泵进肺动脉，卡在越来越细的分支'],
        detail: '静脉血必须经右心进入肺循环，因此下肢脱落的栓子几乎必然先到肺，这就是深静脉血栓与肺栓塞被视为同一疾病谱（VTE）的原因。' },
      { title: '肺里「有通气没血流」', kicker: '04 · 肺栓塞',
        lines: ['被堵的肺泡有通气却无血流，形成死腔', '血氧下降，右心负荷骤增', '突发胸闷、气促、心悸、咯血，重者晕厥休克'],
        detail: '大面积肺栓塞可在数分钟内致命。表现差异很大，从轻微气促到猝死都有，因此「近期制动 + 突发呼吸循环症状」必须高度警惕。' },
      { title: '动起来，别按摩', kicker: '05 · 预防与注意', care: true,
        lines: ['久坐每小时起身、做踝泵；术后尽早下床', '长途出行多饮水、避免翘腿久压，高危者遵医嘱用弹力袜/抗凝', '单侧腿肿痛不要按摩热敷；突发胸闷气促 → 立即急诊'],
        detail: '最重要的预防是「别让血静下来」。已怀疑 DVT 时按摩或剧烈活动可能促发脱落；是否需要抗凝、疗程多长，必须由医生按出血风险评估。' },
    ],
    prevent: ['久坐/久卧每小时活动踝关节、定时起身走动', '术后按医嘱尽早下床，高危者用间歇充气泵或弹力袜', '长途旅行避免脱水、避免长时间交叉腿压迫'],
    caution: ['单侧腿肿痛时不要按摩、热敷、剧烈运动', '不要自行服用阿司匹林替代抗凝评估', '既往 VTE 者再次手术/妊娠前主动告知医生'],
    emergency: ['突发不明原因气促、胸痛（尤其吸气加重）、心悸', '咯血、晕厥、口唇发绀、血压下降', '单侧下肢明显肿痛伴上述任一表现 → 立即拨打 120'],
  },
};

export const CASE_KEYS = Object.keys(CASES);
export const CASE_TOTAL = STAGE_DUR * 5;

/* ---------------- 通用几何 / 材质 ---------------- */

function dotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.92)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let DOT_TEX = null;

const V_PARS = /* glsl */`
attribute float aU;
attribute float aR;
uniform float uTime;
uniform float uNarrow;
uniform float uNarrowU;
uniform float uNarrowW;
uniform float uBlocked;
uniform float uPulseAmp;
varying float vU;
varying float vLesion;
varying float vPulse;
varying vec3 vCN;
varying vec3 vCV;
`;
const V_BODY = /* glsl */`
vU = aU;
float d = (aU - uNarrowU) / max(0.0001, uNarrowW);
float bump = exp(-d * d * 2.2);
vLesion = bump;
transformed -= normal * (aR * uNarrow * bump * 0.84);
float pw = 0.5 + 0.5 * sin((uTime - aU * 0.16) * 7.2);
vPulse = pw;
transformed += normal * (aR * uPulseAmp * pw);
vCN = normalize(normalMatrix * normal);
vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
vCV = normalize(-mv.xyz);
`;
const F_PARS = /* glsl */`
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uPlaque;
uniform float uNarrow;
uniform float uBlocked;
uniform float uGlow;
uniform float uOpacity;
uniform float uTime;
varying float vU;
varying float vLesion;
varying float vPulse;
varying vec3 vCN;
varying vec3 vCV;
`;
const F_BODY = /* glsl */`
{
  vec3 col = mix(uColA, uColB, clamp(vU, 0.0, 1.0));
  float fib = 0.5 + 0.5 * sin(vU * 150.0 + sin(vU * 26.0) * 1.7);
  col *= 0.88 + 0.12 * fib;
  col = mix(col, uPlaque, vLesion * uNarrow * 0.58);
  col = mix(col, vec3(0.20, 0.035, 0.045), vLesion * uBlocked * 0.82);
  float fres = pow(1.0 - abs(dot(normalize(vCN), normalize(vCV))), 2.0);
  col += col * fres * 0.30;
  col *= 0.93 + 0.14 * vPulse;
  diffuseColor.rgb = col * uGlow;
  diffuseColor.a = uOpacity;
}
`;

function vesselMaterial(o = {}) {
  const c0 = new THREE.Color(o.color ?? 0xbb3540);
  const m = new THREE.MeshPhysicalMaterial({
    color: c0.clone(),
    emissive: c0.clone().multiplyScalar(0.12),
    roughness: 0.44, metalness: 0, clearcoat: 0.46, clearcoatRoughness: 0.34,
    transparent: true, opacity: o.opacity ?? 1, depthWrite: true, depthTest: true,
    side: THREE.FrontSide, envMapIntensity: o.env ?? 1.2,
  });
  const uni = {
    uTime: { value: 0 }, uNarrow: { value: 0 },
    uNarrowU: { value: o.narrowU ?? 0.52 }, uNarrowW: { value: o.narrowW ?? 0.085 },
    uBlocked: { value: 0 }, uPulseAmp: { value: o.pulseAmp ?? 0.035 },
    uColA: { value: c0.clone() },
    uColB: { value: new THREE.Color(o.colorEnd ?? o.color ?? 0x8a2530) },
    uPlaque: { value: new THREE.Color(o.plaque ?? 0xe7c368) },
    uGlow: { value: o.glow ?? 1 }, uOpacity: { value: o.opacity ?? 1 },
  };
  m.userData.uni = uni;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + V_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + V_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + F_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + F_BODY);
  };
  m.customProgramCacheKey = () => 'case-vessel-v3';
  return m;
}

function curveOf(pts) {
  return new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])), false, 'catmullrom', 0.5);
}

/** 不规则团块：血栓 / 结石 / 栓子共用 */
function lumpGeometry(seed = 1, spiky = 0.18) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 5.1 + seed) * Math.cos(y * 4.7 - seed) * Math.sin(z * 4.3 + seed * 0.7);
    const k = 1 + spiky * n;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** 简化器官剪影：给舞台一个「这是心脏/脑/肾/肺」的解剖语境，不抢血管的戏 */
function organBlob(kind, U, tint) {
  const g = new THREE.SphereGeometry(1, 34, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = V3(p.getX(i), p.getY(i), p.getZ(i));
    if (kind === 'heart') {
      const lower = smooth(-0.15, -1, v.y);
      v.x *= (1 - 0.40 * lower) * 1.06;
      v.z *= (1 - 0.34 * lower) * 0.90;
      v.y = v.y * 1.22 - 0.14 * lower;
      v.x += 0.10 * Math.sin(v.y * 3.2) * (1 - lower);
    } else if (kind === 'brain') {
      const groove = Math.sin(v.x * 11) * Math.sin(v.y * 9) * 0.035
                   + Math.sin(v.z * 13 + v.x * 4) * 0.022;
      v.multiplyScalar(1 + groove);
      v.y *= 0.82; v.z *= 0.92;
    } else if (kind === 'kidney') {
      const notch = Math.exp(-Math.pow((v.x + 0.78) / 0.46, 2)) * 0.42;
      v.x += notch * (1 - Math.abs(v.y));
      v.y *= 1.28; v.z *= 0.72;
    } else if (kind === 'lung') {
      v.y *= 1.42; v.x *= 0.76; v.z *= 0.68;
      v.x -= 0.16 * (1 - Math.abs(v.y));
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint), emissive: new THREE.Color(tint).multiplyScalar(0.16),
    roughness: 0.62, metalness: 0, clearcoat: 0.22,
    transparent: true, opacity: 0.30, depthWrite: false, depthTest: true,
    side: THREE.FrontSide, envMapIntensity: 0.9,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 13;
  mesh.userData.baseColor = new THREE.Color(tint);
  return mesh;
}

function landmark(kind, U) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({
    color: 0x8fb3d4, transparent: true, opacity: 0.26, depthTest: false, depthWrite: false,
  });
  const line = pts => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map(p => V3(p[0], p[1], p[2])));
    const l = new THREE.Line(geo, mat);
    l.renderOrder = 11;
    g.add(l);
  };
  if (kind === 'neck') {
    // 下颌线 + 颈椎弧：交代「这是脖子」
    line(Array.from({ length: 18 }, (_, i) => {
      const a = -1.2 + i / 17 * 2.4;
      return [Math.sin(a) * 1.55 * U, (2.28 - Math.cos(a) * 0.30) * U, -0.4 * U];
    }));
    line(Array.from({ length: 14 }, (_, i) => {
      const k = i / 13;
      return [Math.sin(k * 2.2) * 0.16 * U, (2.0 - k * 3.9) * U, -0.95 * U];
    }));
  } else if (kind === 'chest') {
    // 胸廓弧线
    for (const side of [-1, 1]) {
      line(Array.from({ length: 20 }, (_, i) => {
        const a = -1.25 + i / 19 * 2.5;
        return [side * (0.55 + Math.sin(a) * 1.42) * U,
                (Math.cos(a) * 2.05) * U, -0.55 * U];
      }));
    }
    line([[-0.16 * U, 2.2 * U, -0.5 * U], [-0.16 * U, -2.1 * U, -0.5 * U]]);
    line([[0.16 * U, 2.2 * U, -0.5 * U], [0.16 * U, -2.1 * U, -0.5 * U]]);
  } else if (kind === 'waist') {
    line(Array.from({ length: 18 }, (_, i) => {
      const k = i / 17;
      return [Math.sin(k * 3) * 0.14 * U, (2.35 - k * 4.7) * U, -0.9 * U];
    }));
    line([[-1.9 * U, 0.15 * U, -0.8 * U], [1.9 * U, 0.15 * U, -0.8 * U]]);
  } else if (kind === 'head') {
    line(Array.from({ length: 30 }, (_, i) => {
      const a = i / 29 * Math.PI * 2;
      return [Math.cos(a) * 1.72 * U, Math.sin(a) * 1.42 * U + 0.55 * U, -0.7 * U];
    }));
  } else if (kind === 'leg') {
    line([[-1.5 * U, -2.2 * U, -0.7 * U], [-1.5 * U, 0.1 * U, -0.7 * U]]);
    line([[1.5 * U, -2.2 * U, -0.7 * U], [1.5 * U, 0.1 * U, -0.7 * U]]);
  }
  g.userData.mat = mat;
  return g;
}

/* ---------------- 舞台构建上下文 ---------------- */
function makeCtx(root, U) {
  const disposables = [];
  const keep = x => { disposables.push(x); return x; };
  if (!DOT_TEX) DOT_TEX = keep(dotTexture());

  const ctx = {
    U, root, keep,
    add(o) { root.add(o); return o; },
    curve: curveOf,
    vessel(pts, radius, o = {}) {
      const curve = curveOf(pts);
      const rFn = typeof radius === 'function' ? radius : () => radius;
      const geo = keep(vesselGeometry(curve, rFn, o.segs || 96, o.radial || 12));
      const mat = keep(vesselMaterial(o));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = o.ro ?? 15;
      root.add(mesh);
      return { curve, geo, mat, mesh, rFn, uni: mat.userData.uni };
    },
    tubeSimple(pts, radius, color, o = {}) {
      const curve = curveOf(pts);
      const geo = keep(new THREE.TubeGeometry(curve, o.segs || 80, radius, o.radial || 8, false));
      const mat = keep(new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color), emissive: new THREE.Color(color).multiplyScalar(0.12),
        roughness: 0.5, metalness: 0, transparent: true, opacity: o.opacity ?? 1,
        depthWrite: true, depthTest: true, side: THREE.FrontSide, envMapIntensity: 1.0,
      }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = o.ro ?? 15;
      root.add(mesh);
      return { curve, geo, mat, mesh };
    },
    organ(kind, scale, tint, pos = [0, 0, 0]) {
      const m = organBlob(kind, U, tint);
      m.scale.setScalar(scale * U);
      m.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
      return ctx.add(m);
    },
    landmark(kind) { return ctx.add(landmark(kind, U)); },
    /** 分叉处的球形壶腹：盖住多段血管拼接的开口，也符合真实分叉处略膨大的形态 */
    joint(pos, r, color) {
      const geo = keep(new THREE.SphereGeometry(1, 20, 14));
      const base = new THREE.Color(color).multiplyScalar(0.42);
      // 不能用带 clearcoat 的物理材质：影棚强灯会把分叉球照成一颗亮灯泡
      const mat = keep(new THREE.MeshStandardMaterial({
        color: base, emissive: base.clone().multiplyScalar(0.05),
        roughness: 0.95, metalness: 0, envMapIntensity: 0,
        transparent: true, opacity: 1, depthWrite: true, depthTest: true,
      }));
      const m = new THREE.Mesh(geo, mat);
      m.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
      m.scale.set(r * U * 0.62, r * U * 0.45, r * U * 0.62);
      m.renderOrder = 15;
      return ctx.add(m);
    },
    /** 斑块：沿一段管壁向内隆起的一串蜡黄结节，随狭窄程度长大 */
    plaque(curve, u0, u1, r, opts = {}) {
      const group = new THREE.Group();
      const geo = keep(new THREE.SphereGeometry(1, 16, 12));
      const mat = keep(new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(opts.color ?? 0xd9b25e),
        emissive: new THREE.Color(opts.color ?? 0xd9b25e).multiplyScalar(0.05),
        roughness: 0.62, metalness: 0, clearcoat: 0.18,
        // 斑块长在管壁内侧，透视显示才看得见；否则被不透明管壁整段遮住
        transparent: true, opacity: 0.90, depthWrite: false, depthTest: false,
      }));
      const n = opts.count || 6;
      const up = V3(0, 1, 0);
      const ref = V3(0.82, 0, 0.58);   // 偏心性斑块：偏在管壁一侧，别把管腔全糊住
      const balls = [];
      for (let i = 0; i < n; i++) {
        const u = lerp(u0, u1, i / (n - 1));
        const p = curve.getPointAt(u);
        const T = curve.getTangentAt(u).normalize();
        const dir = ref.clone().addScaledVector(T, -ref.dot(T)).normalize();
        if (dir.lengthSq() < 0.2) dir.set(1, 0, 0);
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(p).addScaledVector(dir, r * 0.80);
        m.quaternion.setFromUnitVectors(up, dir);
        m.renderOrder = 16;
        const bulge = 0.72 + 0.28 * Math.sin(i / (n - 1) * Math.PI);
        m.userData.base = [r * 0.34 * bulge, r * 0.26 * bulge, r * 0.34 * bulge];
        group.add(m);
        balls.push(m);
      }
      root.add(group);
      return {
        group, mat,
        set(v) {
          const k = 0.16 + 0.84 * clamp(v, 0, 1);
          balls.forEach(m => m.scale.set(m.userData.base[0] * k, m.userData.base[1] * k, m.userData.base[2] * k));
          group.visible = v > 0.01;
          mat.opacity = 0.55 + 0.4 * clamp(v, 0, 1);
        },
      };
    },
    /** 不规则团块（血栓 / 结石 / 栓子），可沿曲线移动、可长大、可破碎 */
    lump(r, color, opts = {}) {
      const geo = keep(lumpGeometry(opts.seed || 1, opts.spiky ?? 0.18));
      const mat = keep(new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color), emissive: new THREE.Color(color).multiplyScalar(0.10),
        roughness: opts.roughness ?? 0.55, metalness: 0.04, clearcoat: 0.18,
        // 血栓 / 结石 / 栓子都在管腔内，必须透视显示，否则被管壁完全挡住
        transparent: true, opacity: opts.opacity ?? 1, depthWrite: false, depthTest: false,
        flatShading: !!opts.flat, side: THREE.FrontSide,
      }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(r);       // r 已是世界单位（调用处传 0.33 * U），不能再乘 U
      mesh.renderOrder = 17;
      root.add(mesh);
      const self = {
        mesh, mat, r,
        set(v) { mesh.visible = v > 0.005; mesh.scale.setScalar(r * clamp(v, 0.001, 1.6)); },
        at(u, curve, radial = 0) {
          const p = curve.getPointAt(clamp(u, 0, 1));
          const T = curve.getTangentAt(clamp(u, 0, 1)).normalize();
          const d = V3(0, 0, 1).addScaledVector(T, -T.z).normalize();
          mesh.position.copy(p).addScaledVector(d, radial * U);
        },
        spin(t) { mesh.rotation.set(t * 0.4, t * 0.62, t * 0.25); },
      };
      return self;
    },
    /** 血流 / 尿流粒子：CPU 逐帧沿曲线推进，能做射流加速、堵塞停滞、下游湍流 */
    flow(curve, count, color, opts = {}) {
      const pos = new Float32Array(count * 3);
      const off = new Float32Array(count);
      for (let i = 0; i < count; i++) off[i] = (i + Math.random() * 0.7) / count;
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = keep(new THREE.PointsMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color(0xffd6a8), 0.18),
        size: (opts.size ?? 0.055) * U * 1.5,
        map: DOT_TEX, transparent: true, opacity: opts.opacity ?? 0.92,
        depthWrite: false, depthTest: false, sizeAttenuation: true,
        blending: THREE.NormalBlending,
      }));
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 18;
      root.add(pts);
      const tmp = V3(0, 0, 0), T = V3(0, 0, 1), side = V3(0, 0, 1);
      return {
        pts, mat,
        update(t, cfg = {}) {
          const speed = cfg.speed ?? 0.16;
          const blockU = cfg.blockU ?? -1;
          const narrowU = cfg.narrowU ?? 0.5;
          const narrowW = cfg.narrowW ?? 0.09;
          const turb = cfg.turb ?? 0;
          const radial = (opts.radial ?? 0.18) * U;
          const c = cardiac(t);
          const beat = 0.72 + 0.5 * c.flow;
          for (let i = 0; i < count; i++) {
            let u = (off[i] + t * speed * beat) % 1;
            if (u < 0) u += 1;
            // 狭窄口：粒子被挤到轴心并加速通过；下游：湍流抖动
            let squeeze = 1;
            const d = (u - narrowU) / narrowW;
            if (Math.abs(d) < 1.6) squeeze = 0.28 + 0.72 * Math.abs(d) / 1.6;
            if (cfg.narrow > 0.1 && Math.abs(d) < 1.2) {
              u += 0.018 * cfg.narrow * (1 - Math.abs(d) / 1.2);
            }
            // 完全堵塞：粒子到达堵塞点后堆积、缓慢回流，不再向下游走
            if (blockU >= 0 && u > blockU) {
              const over = u - blockU;
              u = blockU - Math.min(0.045, over * 0.55);
            }
            u = clamp(u, 0, 0.999);
            curve.getPointAt(u, tmp);
            curve.getTangentAt(u, T).normalize();
            side.set(0, 0, 1).addScaledVector(T, -T.z).normalize();
            const a = off[i] * 43.98;
            const wob = turb > 0 && u > narrowU
              ? turb * Math.sin(t * 6.0 + a * 3.1) * Math.min(1, (u - narrowU) * 3.2) : 0;
            const rr = radial * squeeze * Math.sin(a) + wob * U;
            const rr2 = radial * squeeze * Math.cos(a * 1.7) + wob * U * 0.6;
            pos[i * 3] = tmp.x + side.x * rr + T.y * rr2;
            pos[i * 3 + 1] = tmp.y + side.y * rr - T.x * rr2;
            pos[i * 3 + 2] = tmp.z + side.z * rr + 0.02 * U * Math.sin(a);
          }
          geo.attributes.position.needsUpdate = true;
        },
      };
    },
    /** 支架：环 + 纵杆，沿局部 +Z 建模，scale.x/y 就是「撑开」 */
    stent(length, radius, pos, quat, opts = {}) {
      const g = new THREE.Group();
      const color = opts.color ?? 0xcbd7e2;
      const mat = keep(new THREE.MeshStandardMaterial({
        color: new THREE.Color(color), metalness: 0.86, roughness: 0.28,
        emissive: new THREE.Color(0x172533), transparent: true, opacity: 0.98,
        depthWrite: true, depthTest: true,
      }));
      const ringGeo = keep(new THREE.TorusGeometry(radius * U, 0.052 * U, 6, 26));
      const n = opts.rings ?? 9;
      for (let i = 0; i < n; i++) {
        const ring = new THREE.Mesh(ringGeo, mat);
        ring.position.z = (i / (n - 1) - 0.5) * length * U;
        ring.renderOrder = 19;
        g.add(ring);
      }
      const barGeo = keep(new THREE.CylinderGeometry(0.042 * U, 0.042 * U, length * U, 6));
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * Math.PI * 2;
        const bar = new THREE.Mesh(barGeo, mat);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(Math.cos(a) * radius * U, Math.sin(a) * radius * U, 0);
        bar.renderOrder = 19;
        g.add(bar);
      }
      g.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
      if (quat) g.quaternion.copy(quat);
      root.add(g);
      return {
        group: g, mat,
        set(open, visible = true) {
          g.visible = visible && open > 0.005;
          const k = 0.40 + 0.60 * clamp(open, 0, 1);
          g.scale.set(k, k, 1);
        },
      };
    },
    /** 球囊：沿局部 Z 的半透明胶囊 */
    balloon(length, radius, pos, quat) {
      const geo = keep(new THREE.SphereGeometry(1, 20, 14));
      const mat = keep(new THREE.MeshPhysicalMaterial({
        color: 0x9ad8ff, emissive: 0x183d55, roughness: 0.28,
        transparent: true, opacity: 0.42, depthWrite: false, depthTest: true,
        clearcoat: 0.6, side: THREE.FrontSide,
      }));
      const m = new THREE.Mesh(geo, mat);
      m.position.set(pos[0] * U, pos[1] * U, pos[2] * U);
      if (quat) m.quaternion.copy(quat);
      m.renderOrder = 20;
      root.add(m);
      return {
        mesh: m, mat,
        set(k) {
          m.visible = k > 0.01;
          m.scale.set(radius * U * k, radius * U * k, length * U * 0.5 * (0.82 + 0.18 * k));
          mat.opacity = 0.24 + 0.25 * k;
        },
      };
    },
    /** 导丝：细管，用 drawRange 表现「逐步推进」 */
    guidewire(pts, pos, quat) {
      const curve = curveOf(pts);
      const geo = keep(new THREE.TubeGeometry(curve, 60, 0.024 * U, 6, false));
      const mat = keep(new THREE.MeshStandardMaterial({
        color: 0xdfe9ee, metalness: 0.95, roughness: 0.22,
        transparent: true, opacity: 0.95, depthWrite: true, depthTest: true,
      }));
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 19;
      root.add(m);
      const total = geo.index ? geo.index.count : geo.attributes.position.count;
      return {
        mesh: m,
        set(k) {
          m.visible = k > 0.005;
          geo.setDrawRange(0, Math.max(0, Math.floor(total * clamp(k, 0, 1) / 6) * 6));
        },
      };
    },
  };
  ctx.dispose = () => {
    for (const d of disposables) { try { d.dispose(); } catch { /* 已释放 */ } }
    disposables.length = 0;
  };
  return ctx;
}

/* ---------------- 各病例舞台 ----------------
 * 每个 build 返回 { update(tt) }；tt 为 0..CASE_TOTAL 的循环时间。
 * 五幕的分界统一用 STAGE_DUR，各幕内用 smooth 插值病变参数。
 */
const S = STAGE_DUR;
const T2 = S * 2, T3 = S * 3, T4 = S * 4, T5 = S * 5;

function buildCarotid(ctx) {
  const U = ctx.U;
  ctx.landmark('neck');
  const brain = ctx.organ('brain', 1.28, 0xc98ba0, [0, 2.05, -0.65]);
  const main = ctx.vessel([
    [0, -2.15 * U, 0], [0.05 * U, -1.3 * U, 0], [0.02 * U, -0.4 * U, 0],
    [-0.04 * U, 0.42 * U, 0], [0, 0.92 * U, 0],
  ], 0.40 * U, { color: 0xc33f45, colorEnd: 0x9e303b, narrowU: 0.72, narrowW: 0.10, pulseAmp: 0.045 });
  const inner = ctx.vessel([
    [0, 0.92 * U, 0], [-0.14 * U, 1.42 * U, 0.02 * U], [-0.20 * U, 2.0 * U, 0.02 * U],
    [-0.10 * U, 2.55 * U, 0],
  ], u => 0.31 * U * (1 - 0.18 * u), { color: 0xb93b45, colorEnd: 0x8d2c39, narrowU: -1 });
  const outer = ctx.vessel([
    [0, 0.92 * U, 0], [0.42 * U, 1.35 * U, -0.12 * U], [0.72 * U, 1.85 * U, -0.16 * U],
    [0.90 * U, 2.25 * U, -0.18 * U],
  ], u => 0.23 * U * (1 - 0.35 * u), { color: 0xa93a42, colorEnd: 0x7d2932, narrowU: -1 });
  ctx.joint([0, 0.92, 0], 0.41, 0xba3b44);   // 颈动脉窦：分叉处略膨大
  const plaque = ctx.plaque(main.curve, 0.63, 0.80, 0.40 * U, { count: 6 });
  const clot = ctx.lump(0.36 * U, 0x8d2730, { seed: 3, spiky: 0.24, flat: true });
  const embolus = ctx.lump(0.16 * U, 0x9d3038, { seed: 7, spiky: 0.3, flat: true });
  const flow = ctx.flow(main.curve, 90, 0xff6a54, { size: 0.052, radial: 0.16 });
  const flowIn = ctx.flow(inner.curve, 42, 0xff7b60, { size: 0.05, radial: 0.13 });
  const flowOut = ctx.flow(outer.curve, 26, 0xff8a6b, { size: 0.045, radial: 0.10 });
  const dimCol = new THREE.Color(0x4b3a55);

  return {
    update(tt) {
      const narrow = smooth(S, T2, tt) * 0.48 + smooth(T2, T3, tt) * 0.40
                   + smooth(T3, T4, tt) * 0.12;
      const blocked = smooth(T3 + 1.4, T4, tt);
      const plaqueK = smooth(S + 0.4, T2 + 0.5, tt) * 0.55 + smooth(T2, T3, tt) * 0.45;
      const n = clamp(narrow, 0, 1);
      main.uni.uNarrow.value = n;
      main.uni.uBlocked.value = blocked;
      main.uni.uTime.value = tt;
      inner.uni.uTime.value = tt; outer.uni.uTime.value = tt;
      plaque.set(plaqueK);
      clot.set(blocked);
      clot.at(0.73, main.curve, 0.02);
      clot.spin(tt * 0.4);
      // 脱落的微小栓子顺颈内动脉上行
      const eu = clamp((tt - (T3 + 2.0)) / 3.0, 0, 1);
      embolus.set(tt > T3 + 1.9 && tt < T4 + 1.6 ? 0.9 : 0);
      embolus.at(eu, inner.curve, 0.04);
      embolus.spin(tt);
      flow.update(tt, {
        speed: 0.17, narrow: n, narrowU: 0.72, narrowW: 0.10,
        blockU: blocked > 0.55 ? 0.72 : -1, turb: 0.10 * U * n,
      });
      flowIn.update(tt, { speed: 0.20, narrowU: 2, blockU: blocked > 0.55 ? 0.02 : -1 });
      flowOut.update(tt, { speed: 0.16, narrowU: 2 });
      // 脑供血不足：颜色逐渐转暗紫
      const dim = smooth(T2 + 0.5, T4, tt) * 0.82;
      brain.material.color.copy(brain.userData.baseColor).lerp(dimCol, dim);
      brain.material.opacity = 0.30 - 0.05 * dim;
      const c = cardiac(tt);
      brain.scale.setScalar(1.28 * U * (1 + 0.012 * c.pulse));
    },
  };
}

function buildCoronary(ctx, withStent = false) {
  const U = ctx.U;
  ctx.landmark('chest');
  const heart = ctx.organ('heart', 1.60, 0x9e3d46, [0, -0.55, -0.85]);
  const aorta = ctx.vessel([
    [-0.05 * U, 2.35 * U, -0.25 * U], [-0.05 * U, 1.75 * U, -0.2 * U],
    [0.02 * U, 1.25 * U, -0.12 * U],
  ], 0.40 * U, { color: 0xc04448, colorEnd: 0xa5363d, narrowU: -1 });
  const lad = ctx.vessel([
    [0.02 * U, 1.25 * U, -0.12 * U], [-0.20 * U, 0.86 * U, 0.10 * U],
    [-0.34 * U, 0.30 * U, 0.28 * U], [-0.36 * U, -0.35 * U, 0.38 * U],
    [-0.24 * U, -1.05 * U, 0.40 * U], [0.02 * U, -1.72 * U, 0.30 * U],
    [0.24 * U, -2.15 * U, 0.10 * U],
  ], u => 0.27 * U * (1 - 0.42 * u), {
    color: 0xc74648, colorEnd: 0x8f2b35, narrowU: 0.30, narrowW: 0.095, pulseAmp: 0.04,
  });
  const diag = ctx.vessel([
    [-0.28 * U, 0.55 * U, 0.20 * U], [-0.85 * U, 0.28 * U, 0.14 * U],
    [-1.35 * U, -0.15 * U, 0.02 * U], [-1.62 * U, -0.62 * U, -0.10 * U],
  ], u => 0.18 * U * (1 - 0.45 * u), { color: 0xb63f45, colorEnd: 0x822a33, narrowU: -1 });
  ctx.joint([0.02, 1.25, -0.12], 0.33, 0xc04349);  // 左冠脉主干 / 主动脉根部交接
  const plaque = ctx.plaque(lad.curve, 0.22, 0.39, 0.27 * U, { count: 6 });
  const clot = ctx.lump(0.30 * U, 0x8b2530, { seed: 5, spiky: 0.26, flat: true });
  const flow = ctx.flow(lad.curve, 96, 0xff7358, { size: 0.052, radial: 0.13 });
  const flowD = ctx.flow(diag.curve, 34, 0xff8365, { size: 0.045, radial: 0.09 });
  const flowA = ctx.flow(aorta.curve, 30, 0xff6a55, { size: 0.05, radial: 0.16 });
  const dark = new THREE.Color(0x4a2f45);

  // 支架病例额外器械：导丝 / 球囊 / 支架（沿 LAD 病变段局部 +Z 建模）
  let stent = null, balloon = null, wire = null;
  if (withStent) {
    const T = lad.curve.getTangentAt(0.30).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), T);
    const p = lad.curve.getPointAt(0.30);
    const pos = [p.x / U, p.y / U, p.z / U];
    wire = ctx.guidewire([
      [0, 0, 0], [0.1 * U, -0.5 * U, 0], [-0.2 * U, -1.1 * U, 0], [-0.34 * U, -1.8 * U, 0],
    ], [0, 1.3, 0], null);
    balloon = ctx.balloon(1.25, 0.24, pos, quat);
    stent = ctx.stent(1.20, 0.245, pos, quat, { rings: 9 });
  }

  return {
    update(tt) {
      const c = cardiac(tt);
      aorta.uni.uTime.value = tt; lad.uni.uTime.value = tt; diag.uni.uTime.value = tt;
      let narrow, blocked, plaqueK;
      if (withStent) {
        // 术前已重度狭窄；第 3 幕支架撑开后管腔恢复
        narrow = 0.80 * (1 - smooth(T2 + 1.2, T3 + 1.0, tt));
        blocked = 0;
        plaqueK = 0.92 * (1 - 0.55 * smooth(T2 + 1.2, T3 + 1.0, tt));
      } else {
        narrow = smooth(S, T2, tt) * 0.55 + smooth(T2, T3, tt) * 0.30
               + smooth(T3, T4, tt) * 0.15;
        blocked = smooth(T3 + 1.6, T4, tt);
        plaqueK = smooth(S + 0.4, T2, tt) * 0.6 + smooth(T2, T3, tt) * 0.4;
      }
      const n = clamp(narrow, 0, 1);
      lad.uni.uNarrow.value = n;
      lad.uni.uBlocked.value = blocked;
      plaque.set(plaqueK);
      clot.set(blocked);
      clot.at(0.31, lad.curve, 0.01);
      clot.spin(tt * 0.5);
      flow.update(tt, {
        speed: 0.19, narrow: n, narrowU: 0.30, narrowW: 0.095,
        blockU: blocked > 0.55 ? 0.30 : -1, turb: 0.12 * U * n,
      });
      flowD.update(tt, { speed: 0.16, narrowU: 2 });
      flowA.update(tt, { speed: 0.24, narrowU: 2 });
      // 缺血：心肌变暗、搏动幅度减弱（心梗后该区几乎不动）
      const isch = withStent
        ? 0.48 * (1 - smooth(T2 + 1.6, T3 + 1.4, tt))
        : smooth(T2 + 0.2, T4, tt) * 0.85;
      heart.material.color.copy(heart.userData.baseColor).lerp(dark, isch);
      heart.material.opacity = 0.30 - 0.06 * isch;
      const beat = (1 - 0.75 * isch) * c.sys;
      heart.scale.set(1.60 * U * (1 - 0.045 * beat), 1.60 * U * (1 - 0.075 * beat), 1.60 * U);
      if (withStent) {
        wire.set(smooth(S + 0.4, T2, tt));
        const balloonK = smooth(T2 - 0.6, T2 + 1.1, tt) * (1 - smooth(T2 + 1.5, T3 + 0.3, tt));
        balloon.set(balloonK);
        stent.set(smooth(T2 + 1.4, T3 + 0.9, tt), tt > S + 1.0);
      }
    },
  };
}

function buildStone(ctx) {
  const U = ctx.U;
  ctx.landmark('waist');
  const kidney = ctx.organ('kidney', 1.18, 0xb9656c, [-0.95, 1.15, -0.55]);
  const kidney2 = ctx.organ('kidney', 1.18, 0xb9656c, [0.95, 1.15, -0.55]);
  kidney2.scale.x *= -1;
  const pelvis = ctx.organ('kidney', 0.52, 0xe0a08a, [-0.52, 0.72, -0.3]);
  const ureter = ctx.vessel([
    [-0.62 * U, 0.85 * U, 0], [-0.55 * U, 0.25 * U, 0.03 * U],
    [-0.46 * U, -0.35 * U, 0.06 * U], [-0.50 * U, -0.95 * U, 0.02 * U],
    [-0.38 * U, -1.55 * U, 0.0], [-0.24 * U, -2.05 * U, 0.02 * U],
  ], u => 0.20 * U * (1 + 0.22 * Math.sin(u * 9.4)), {
    color: 0xd9a877, colorEnd: 0xb98050, narrowU: -1, pulseAmp: 0.02,
  });
  ctx.joint([-0.62, 0.85, 0], 0.18, 0x8f6242);   // 肾盂 - 输尿管移行处（压暗，别被误认成结石）
  const bladder = ctx.organ('lung', 0.62, 0xc9a27f, [0, -2.25, -0.3]);
  bladder.scale.set(0.95 * U, 0.62 * U, 0.7 * U);
  const stone = ctx.lump(0.33 * U, 0xe6bd67, { seed: 11, spiky: 0.34, flat: true, roughness: 0.72 });
  const frag = [];
  for (let i = 0; i < 6; i++) {
    const f = ctx.lump(0.11 * U, 0xecc87a, { seed: 20 + i, spiky: 0.4, flat: true });
    f.mesh.visible = false;
    frag.push(f);
  }
  const flow = ctx.flow(ureter.curve, 70, 0xffd985, { size: 0.05, radial: 0.11 });
  const hydro = new THREE.Color(0x8f5f7e);

  return {
    update(tt) {
      ureter.uni.uTime.value = tt;
      const grow = smooth(S + 0.2, T2, tt);
      const drop = smooth(T2 + 0.6, T3, tt);
      const stuck = smooth(T3, T3 + 1.0, tt);
      const crack = smooth(T4 - 1.6, T4 + 0.3, tt);
      // 结石：先在肾盏长大 → 落入输尿管 → 卡在生理狭窄 → 碎成小块下行
      const su = lerp(0.02, 0.52, drop) * (1 - crack) + crack * clamp(0.52 + (tt - T4) * 0.12, 0, 1);
      stone.set(1 - crack);
      stone.at(su, ureter.curve, 0.01);
      stone.spin(tt * 0.8);
      stone.mesh.scale.multiplyScalar(0.55 + 0.45 * grow);
      for (let i = 0; i < frag.length; i++) {
        const f = frag[i];
        f.set(crack > 0.05 ? 1 : 0);
        const fu = clamp(0.52 + (tt - T4) * (0.10 + i * 0.012), 0, 1);
        f.at(fu, ureter.curve, (i - 2.5) * 0.035);
        f.spin(tt + i);
      }
      // 梗阻：上游粒子堆积，下游几乎没有尿流
      flow.update(tt, {
        speed: 0.14, narrowU: 2,
        blockU: stuck > 0.35 && crack < 0.5 ? 0.52 : -1,
        turb: 0.06 * U,
      });
      // 肾盂积水：梗阻期肾影膨大、颜色转暗
      const hyd = smooth(T3, T4, tt) * (1 - 0.85 * crack);
      kidney.scale.set(1.18 * U * (1 + 0.13 * hyd), 1.18 * U * (1 + 0.10 * hyd), 1.18 * U);
      kidney.material.color.copy(kidney.userData.baseColor).lerp(hydro, hyd * 0.7);
      pelvis.scale.setScalar(0.52 * U * (1 + 0.55 * hyd));
      pelvis.material.opacity = 0.24 + 0.18 * hyd;
      // 绞痛：梗阻期输尿管节律性抽搐
      const colic = hyd > 0.05 ? Math.sin(tt * 7.5) * 0.045 * hyd : 0;
      ureter.mesh.scale.x = 1 + colic;
    },
  };
}

function buildStroke(ctx) {
  const U = ctx.U;
  ctx.landmark('head');
  const brain = ctx.organ('brain', 1.62, 0xcb8ea4, [0, 0.35, -0.75]);
  const ica = ctx.vessel([
    [0.15 * U, -2.25 * U, 0], [0.12 * U, -1.5 * U, 0], [0.10 * U, -0.75 * U, 0],
    [0.0, -0.15 * U, 0],
  ], 0.28 * U, { color: 0xbf3f49, colorEnd: 0xa23540, narrowU: -1 });
  const mca = ctx.vessel([
    [0, -0.15 * U, 0], [-0.25 * U, 0.25 * U, 0.05 * U], [-0.75 * U, 0.50 * U, 0.10 * U],
    [-1.25 * U, 0.62 * U, 0.08 * U], [-1.72 * U, 0.85 * U, 0],
  ], u => 0.20 * U * (1 - 0.38 * u), {
    color: 0xb93a44, colorEnd: 0x832a34, narrowU: 0.34, narrowW: 0.09,
  });
  const branch = ctx.vessel([
    [-0.70 * U, 0.48 * U, 0.09 * U], [-0.95 * U, 1.05 * U, 0.12 * U],
    [-1.05 * U, 1.62 * U, 0.10 * U],
  ], u => 0.13 * U * (1 - 0.45 * u), { color: 0xa8353e, colorEnd: 0x76262f, narrowU: -1 });
  const branch2 = ctx.vessel([
    [-1.25 * U, 0.62 * U, 0.08 * U], [-1.45 * U, 0.10 * U, 0.06 * U],
    [-1.55 * U, -0.45 * U, 0.02 * U],
  ], u => 0.12 * U * (1 - 0.45 * u), { color: 0xa8353e, colorEnd: 0x76262f, narrowU: -1 });
  ctx.joint([0, -0.15, 0], 0.28, 0xb83a44);
  const embolus = ctx.lump(0.21 * U, 0x8e2833, { seed: 13, spiky: 0.3, flat: true });
  const flow = ctx.flow(ica.curve, 52, 0xff7058, { size: 0.05, radial: 0.12 });
  const flowM = ctx.flow(mca.curve, 62, 0xff7058, { size: 0.048, radial: 0.09 });
  const flowB = ctx.flow(branch.curve, 24, 0xff8166, { size: 0.042, radial: 0.06 });
  const dark = new THREE.Color(0x40374f);
  // 缺血半暗带：脑表面一块「变暗的区域」，用一个半透明深色球缺表示
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x2a2038, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
  });
  const shadow = new THREE.Mesh(new THREE.SphereGeometry(0.82 * U, 20, 14), shadowMat);
  shadow.position.set(-0.82 * U, 0.72 * U, 0.62 * U);
  shadow.scale.set(1, 0.82, 0.42);
  shadow.renderOrder = 21;
  ctx.add(shadow); ctx.keep(shadow.geometry); ctx.keep(shadowMat);

  return {
    update(tt) {
      ica.uni.uTime.value = tt; mca.uni.uTime.value = tt;
      branch.uni.uTime.value = tt; branch2.uni.uTime.value = tt;
      // 栓子从颈内动脉出发 → 大脑中动脉 → 卡在分叉
      const travel = smooth(S + 0.4, T3 + 0.6, tt);
      const eu = clamp(travel, 0, 1);
      embolus.set(tt > S * 0.8 ? 1 : 0);
      if (eu < 0.62) {
        embolus.at(clamp(eu / 0.62, 0, 1), ica.curve, 0.02);
      } else {
        embolus.at(clamp((eu - 0.62) / 0.38 * 0.36, 0, 0.36), mca.curve, 0.02);
      }
      embolus.spin(tt * 1.2);
      const blocked = smooth(T3, T3 + 1.2, tt);
      mca.uni.uBlocked.value = blocked;
      mca.uni.uNarrow.value = blocked * 0.55;
      flow.update(tt, { speed: 0.21, narrowU: 2 });
      flowM.update(tt, {
        speed: 0.20, narrowU: 0.34, narrowW: 0.09, narrow: blocked * 0.55,
        blockU: blocked > 0.6 ? 0.34 : -1, turb: 0.06 * U,
      });
      flowB.update(tt, { speed: 0.18, narrowU: 2, blockU: blocked > 0.6 ? 0.02 : -1 });
      shadowMat.opacity = 0.62 * smooth(T3, T4, tt);
      brain.material.color.copy(brain.userData.baseColor).lerp(dark, 0.35 * smooth(T3, T4, tt));
      brain.material.opacity = 0.30;
    },
  };
}

function buildDVT(ctx) {
  const U = ctx.U;
  ctx.landmark('leg');
  const lungL = ctx.organ('lung', 1.16, 0xd08e93, [-0.92, 1.30, -0.6]);
  const lungR = ctx.organ('lung', 1.16, 0xd08e93, [0.92, 1.30, -0.6]);
  lungR.scale.x *= -1;
  const heart = ctx.organ('heart', 0.62, 0x9c3f47, [0, 0.62, -0.35]);
  // 一条完整的「小腿深静脉 → 下腔静脉 → 右心 → 肺动脉」通路
  const vein = ctx.vessel([
    [-1.15 * U, -2.25 * U, 0], [-1.10 * U, -1.65 * U, 0.02 * U],
    [-0.95 * U, -0.95 * U, 0.03 * U], [-0.72 * U, -0.25 * U, 0.02 * U],
    [-0.38 * U, 0.45 * U, 0], [-0.10 * U, 0.95 * U, 0],
    [0.05 * U, 1.45 * U, 0],
  ], u => 0.26 * U * (1 + 0.20 * u), {
    color: 0x3f6ea8, colorEnd: 0x456f9e, narrowU: -1, pulseAmp: 0.015,
  });
  const pa = ctx.vessel([
    [0.05 * U, 1.45 * U, 0], [0.42 * U, 1.75 * U, -0.05 * U],
    [0.95 * U, 1.85 * U, -0.12 * U], [1.45 * U, 1.72 * U, -0.18 * U],
  ], u => 0.22 * U * (1 - 0.34 * u), { color: 0x4a6f9e, colorEnd: 0x3b5a88, narrowU: -1 });
  const paL = ctx.vessel([
    [0.05 * U, 1.45 * U, 0], [-0.35 * U, 1.78 * U, -0.06 * U],
    [-0.92 * U, 1.90 * U, -0.14 * U], [-1.40 * U, 1.75 * U, -0.18 * U],
  ], u => 0.22 * U * (1 - 0.34 * u), { color: 0x4a6f9e, colorEnd: 0x3b5a88, narrowU: -1 });
  ctx.joint([0.05, 1.45, 0], 0.30, 0x4a6b94);   // 右心流出道 / 肺动脉干
  const clot = ctx.lump(0.30 * U, 0x7d2c34, { seed: 17, spiky: 0.28, flat: true });
  const embolus = ctx.lump(0.24 * U, 0x8a3038, { seed: 23, spiky: 0.3, flat: true });
  const flow = ctx.flow(vein.curve, 96, 0x7fb6ff, { size: 0.05, radial: 0.12 });
  const flowPA = ctx.flow(pa.curve, 40, 0x8fc0ff, { size: 0.046, radial: 0.09 });
  const flowPAL = ctx.flow(paL.curve, 40, 0x8fc0ff, { size: 0.046, radial: 0.09 });
  const dim = new THREE.Color(0x4a4358);

  return {
    update(tt) {
      vein.uni.uTime.value = tt; pa.uni.uTime.value = tt; paL.uni.uTime.value = tt;
      const form = smooth(S + 0.3, T2, tt);
      const detach = smooth(T2 + 0.6, T3 + 1.0, tt);
      const arrive = smooth(T3 + 0.4, T4, tt);
      clot.set(form * (1 - 0.35 * detach));
      clot.at(0.30, vein.curve, 0.01);   // 抬到字幕卡上方，腿部血栓才看得见
      clot.spin(tt * 0.4);
      // 栓子沿静脉上行，越过心脏进入右肺动脉并卡住
      const eu = clamp(detach, 0, 1);
      embolus.set(detach > 0.02 ? 1 : 0);
      if (eu < 0.80) embolus.at(clamp(0.30 + eu / 0.80 * 0.68, 0, 0.98), vein.curve, 0.01);
      else embolus.at(clamp((eu - 0.80) / 0.20 * 0.52, 0, 0.52), pa.curve, 0.01);
      embolus.spin(tt * 1.1);
      flow.update(tt, { speed: 0.14, narrowU: 2 });
      flowPA.update(tt, { speed: 0.18, narrowU: 2, blockU: arrive > 0.65 ? 0.52 : -1 });
      flowPAL.update(tt, { speed: 0.18, narrowU: 2 });
      const c = cardiac(tt);
      lungR.material.color.copy(lungR.userData.baseColor).lerp(dim, arrive * 0.72);
      lungR.material.opacity = 0.30 - 0.05 * arrive;
      lungR.scale.set(1.16 * U * (1 + 0.02 * c.pulse * (1 - 0.8 * arrive)),
                      1.16 * U * (1 + 0.025 * c.pulse * (1 - 0.8 * arrive)), 1.16 * U);
      heart.scale.setScalar(0.62 * U * (1 - 0.06 * c.sys));
    },
  };
}

const BUILDERS = {
  carotid: c => buildCarotid(c),
  coronary: c => buildCoronary(c, false),
  stent: c => buildCoronary(c, true),
  stone: c => buildStone(c),
  stroke: c => buildStroke(c),
  dvt: c => buildDVT(c),
};

/* ---------------- 病例实例 ---------------- */
export function createCase({ key, records, bodyMeta }) {
  const info = CASES[key] || CASES.carotid;
  const height = bodyMeta?.height || 7.7;
  const U = height * 0.055;
  const root = new THREE.Group();
  root.name = `case-stage-${key}`;

  // 舞台就长在人体对应解剖位置上，四周淡化的 X 光轮廓自然交代「这是哪里」
  const rec = records?.get(info.anchor);
  const box = rec && rec.group ? new THREE.Box3().setFromObject(rec.group) : null;
  if (box && !box.isEmpty()) box.getCenter(root.position);
  else root.position.set(0, height * 0.55, 0);
  if (key === 'carotid') root.position.y += height * 0.055;
  if (key === 'dvt') root.position.y += height * 0.02;

  const ctx = makeCtx(root, U);
  const show = BUILDERS[key] ? BUILDERS[key](ctx) : buildCarotid(ctx);

  let curStage = -1;
  const total = info.stages.length * STAGE_DUR;

  function stageAt(t) {
    const tt = ((t % total) + total) % total;
    const index = Math.min(info.stages.length - 1, Math.floor(tt / STAGE_DUR));
    const local = tt - index * STAGE_DUR;
    return {
      index, local, tt, total,
      stage: info.stages[index],
      u: local / STAGE_DUR,
      progress: tt / total,
      number: String(index + 1).padStart(2, '0'),
      count: String(info.stages.length).padStart(2, '0'),
    };
  }

  function update(t) {
    const st = stageAt(t);
    curStage = st.index;
    show.update(st.tt);
    return st;
  }

  return {
    group: root,
    info,
    stages: info.stages,
    total,
    get stageIndex() { return curStage; },
    stageAt, update,
    dispose() {
      root.parent && root.parent.remove(root);
      ctx.dispose();
    },
  };
}

/* ---------------- HUD 字幕（画进视频） ---------------- */

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrapText(c, text, x, y, maxW, lh, maxLines = 3) {
  let line = '', yy = y, n = 0;
  for (const ch of text) {
    const test = line + ch;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, x, yy);
      yy += lh; n++; line = ch;
      if (n >= maxLines - 1) break;
    } else line = test;
  }
  if (line && n < maxLines) { c.fillText(line, x, yy); yy += lh; }
  return yy;
}

/** 人体剪影定位图：一眼交代病灶在全身的哪个位置 */
function drawBodyMap(c, x, y, w, h, spot, site, s) {
  const cx = x + w * 0.5;
  c.save();
  c.strokeStyle = 'rgba(150,190,225,0.55)';
  c.lineWidth = Math.max(1.2, 1.8 * s);
  c.lineCap = 'round';
  // 头
  c.beginPath(); c.ellipse(cx, y + h * 0.10, w * 0.13, h * 0.075, 0, 0, Math.PI * 2); c.stroke();
  // 躯干
  c.beginPath();
  c.moveTo(cx - w * 0.15, y + h * 0.20);
  c.lineTo(cx + w * 0.15, y + h * 0.20);
  c.lineTo(cx + w * 0.13, y + h * 0.54);
  c.lineTo(cx - w * 0.13, y + h * 0.54);
  c.closePath(); c.stroke();
  // 四肢
  c.beginPath();
  c.moveTo(cx - w * 0.15, y + h * 0.23); c.lineTo(cx - w * 0.32, y + h * 0.50);
  c.moveTo(cx + w * 0.15, y + h * 0.23); c.lineTo(cx + w * 0.32, y + h * 0.50);
  c.moveTo(cx - w * 0.09, y + h * 0.54); c.lineTo(cx - w * 0.13, y + h * 0.94);
  c.moveTo(cx + w * 0.09, y + h * 0.54); c.lineTo(cx + w * 0.13, y + h * 0.94);
  c.stroke();
  // 病灶点
  const px = x + w * spot[0], py = y + h * spot[1];
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 380);
  c.fillStyle = `rgba(255,92,80,${0.18 + 0.18 * pulse})`;
  c.beginPath(); c.arc(px, py, w * (0.13 + 0.03 * pulse), 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ff6a5a';
  c.beginPath(); c.arc(px, py, w * 0.055, 0, Math.PI * 2); c.fill();
  c.font = `600 ${Math.round(11 * s)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  c.fillStyle = '#7fd8ea';
  c.fillText('发生位置', x, y + h + 16 * s);
  c.fillStyle = 'rgba(232,244,255,0.92)';
  const label = site.length > 14 ? site.slice(0, 14) : site;
  c.fillText(label, x, y + h + 33 * s);
  c.restore();
}

/**
 * 在 HUD canvas 上画一帧字幕。由 studio.renderOverlay 调用，
 * 画完把 CanvasTexture 标脏，随后整层叠到 WebGL 画面之上 → 录进 MP4。
 */
export function drawCaseHud(c, W, H, info, st, opts = {}) {
  c.clearRect(0, 0, W, H);
  const s = Math.min(W, H) / 1000;
  const vertical = H > W;
  const fade = clamp(st.local / 0.42, 0, 1);
  const padX = W * (vertical ? 0.065 : 0.055);
  // 横屏时顶栏会盖住 y<60 的区域，标题必须落在安全区里
  const topY = Math.max(H * (vertical ? 0.058 : 0.115), 82 * s);

  // 顶部：栏目标签 + 病例名
  c.save();
  c.globalAlpha = 0.92;
  c.fillStyle = '#7fd8ea';
  c.font = `600 ${Math.round(15 * s)}px "Microsoft YaHei", sans-serif`;
  c.fillText('病理课堂  ·  CLINICAL ANIMATION', padX, topY);
  c.fillStyle = '#f2f7ff';
  c.font = `700 ${Math.round(38 * s)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  c.fillText(info.name, padX, topY + 46 * s);
  c.fillStyle = 'rgba(170,205,235,0.72)';
  c.font = `500 ${Math.round(16 * s)}px "Microsoft YaHei", sans-serif`;
  c.fillText(`${info.cat}　|　${info.site}`, padX, topY + 76 * s);
  c.restore();

  // 人体定位图放在标题下方左侧：右侧是交互讲解面板，放右上会被挡住
  const mw = W * (vertical ? 0.20 : 0.098);
  const mh = mw * (vertical ? 1.62 : 1.72);
  const mx = padX, my = topY + 98 * s;
  c.save();
  c.fillStyle = 'rgba(8,16,27,0.74)';
  roundRect(c, mx - 12 * s, my - 10 * s, mw + 24 * s, mh + 62 * s, 14 * s); c.fill();
  c.strokeStyle = 'rgba(127,216,234,0.34)'; c.lineWidth = 1.2 * s; c.stroke();
  c.restore();
  drawBodyMap(c, mx, my, mw, mh, info.spot, info.site, s);

  // 底部字幕卡
  const cardW = W * (vertical ? 0.88 : 0.74);
  const cardH = H * (vertical ? 0.20 : 0.25);
  const cardX = (W - cardW) / 2;
  const cardY = H - cardH - H * (vertical ? 0.075 : 0.085);
  c.save();
  c.globalAlpha = 0.92 * fade + 0.08;
  c.fillStyle = 'rgba(6,12,22,0.90)';
  roundRect(c, cardX, cardY, cardW, cardH, 20 * s); c.fill();
  c.strokeStyle = 'rgba(127,216,234,0.26)'; c.lineWidth = 1.4 * s; c.stroke();
  // 左侧色条
  c.fillStyle = '#7fd8ea';
  roundRect(c, cardX + 18 * s, cardY + 24 * s, 4 * s, cardH - 48 * s, 2 * s); c.fill();
  c.restore();

  const tx = cardX + 36 * s;
  const maxW = cardW - 60 * s;
  c.save();
  c.globalAlpha = fade;
  c.fillStyle = '#7fd8ea';
  c.font = `600 ${Math.round(15 * s)}px "Microsoft YaHei", sans-serif`;
  const kicker = String(st.stage.kicker).replace(/^\d+\s*·\s*/, '');
  c.fillText(`${st.number} / ${st.count}　${kicker}`, tx, cardY + 36 * s);
  c.fillStyle = '#f4f9ff';
  c.font = `700 ${Math.round(29 * s)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  c.fillText(st.stage.title, tx, cardY + 78 * s);

  const lines = st.stage.care
    ? [info.prevent[0], info.caution[0], info.emergency[0]]
    : st.stage.lines;
  c.font = `500 ${Math.round(16.5 * s)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  let yy = cardY + 112 * s;
  const lh = 24 * s;
  for (let i = 0; i < lines.length; i++) {
    const prefix = st.stage.care ? ['防 ', '注 ', '急 '][i] : '· ';
    c.fillStyle = st.stage.care
      ? ['#a4f0d8', '#ffd08a', '#ff8f86'][i]
      : 'rgba(215,232,248,0.90)';
    const end = wrapText(c, prefix + lines[i], tx, yy, maxW, lh, 2);
    yy = end + 4 * s;
  }
  c.restore();

  // 进度条：当前幕 + 全片
  const barY = cardY + cardH - 22 * s;
  c.save();
  c.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(c, tx, barY, maxW, 4 * s, 2 * s); c.fill();
  c.fillStyle = '#7fd8ea';
  roundRect(c, tx, barY, maxW * st.progress, 4 * s, 2 * s); c.fill();
  c.fillStyle = '#ffcf87';
  roundRect(c, tx + maxW * (st.index / st.count), barY - 2 * s,
            Math.max(2 * s, maxW / st.count * st.u), 8 * s, 3 * s); c.fill();
  c.restore();

  // 免责 + 时间
  c.save();
  c.fillStyle = 'rgba(160,190,215,0.55)';
  c.font = `500 ${Math.round(12 * s)}px "Microsoft YaHei", sans-serif`;
  c.textAlign = 'right';
  c.fillText('动画为科普示意 · 具体诊疗请遵医嘱', W - padX, H - 22 * s);
  c.textAlign = 'left';
  c.fillText(`${st.tt.toFixed(1)}s / ${st.total.toFixed(0)}s　${opts.speed ? opts.speed + '×' : ''}`, padX, H - 22 * s);
  c.restore();
}
