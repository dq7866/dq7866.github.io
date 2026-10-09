/* AI 写作助手 · 提示词模板库与生成器
   纯前端本地处理，数据保存在 localStorage。 */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const he = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /* ============ 模板数据 ============ */
  const CAT_MAP = {
    writing: { name: "写作", icon: "✍️" },
    coding: { name: "编程", icon: "💻" },
    translation: { name: "翻译", icon: "🌐" },
    learning: { name: "学习", icon: "📖" },
    marketing: { name: "营销", icon: "📣" },
    creative: { name: "创意", icon: "🎨" },
    office: { name: "办公", icon: "📊" },
    midjourney: { name: "Midjourney", icon: "🖼️" },
    custom: { name: "自定义", icon: "📝" },
  };

  const TEMPLATES = [
    // ===== 写作 =====
    {
      id: "w1", cat: "writing", name: "专业博客文章",
      desc: "生成结构清晰、有深度的专业博客文章",
      prompt: "请你扮演一位资深的{领域}专家和专栏作家，为我撰写一篇关于「{主题}」的博客文章。\n\n要求：\n1. 标题要有吸引力，能激发读者的点击欲\n2. 开头用故事或数据引入，快速抓住读者注意力\n3. 正文分为 3-5 个核心要点，每个要点有论点有论据\n4. 语言风格：{风格}，适合{受众}阅读\n5. 字数约{字数}字\n6. 结尾有总结和行动建议\n\n请直接输出完整文章，不需要额外说明。"
    },
    {
      id: "w2", cat: "writing", name: "爆款标题生成器",
      desc: "生成 10 个不同风格的爆款标题",
      prompt: "请为「{主题}」这篇内容生成 10 个不同风格的爆款标题，满足以下要求：\n\n1. 3 个数字型标题（用具体数字增强说服力）\n2. 3 个悬念型标题（制造好奇心，让人想点进去）\n3. 2 个对比型标题（通过反差突出价值）\n4. 2 个情感共鸣型标题（打动人心）\n\n标题风格：{风格}\n目标平台：{平台}\n\n请编号列出每个标题，并简要说明为什么这样设计。"
    },
    {
      id: "w3", cat: "writing", name: "商务邮件",
      desc: "撰写专业得体的商务邮件",
      prompt: "请帮我撰写一封商务邮件：\n\n收件人身份：{收件人}\n邮件目的：{目的}\n核心内容：{内容要点}\n\n要求：\n- 语气：{语气，如正式/友好/委婉/坚决}\n- 结构清晰，重点突出\n- 开头有恰当的称呼和问候\n- 结尾有礼貌的结束语和签名\n- 字数控制在{字数}字以内\n\n请直接输出邮件正文。"
    },
    {
      id: "w4", cat: "writing", name: "产品文案",
      desc: "撰写有感染力的产品营销文案",
      prompt: "请为「{产品名称}」撰写一段产品营销文案。\n\n产品特点：{产品特点}\n目标用户：{目标用户}\n核心卖点：{核心卖点}\n\n要求：\n- 风格：{风格，如高级感/亲民/科技感/温暖}\n- 开头一句话抓住用户痛点\n- 中间展示产品如何解决问题\n- 结尾有行动号召\n- 字数：{字数}字左右\n\n请输出文案内容。"
    },
    {
      id: "w5", cat: "writing", name: "小红书笔记",
      desc: "生成小红书风格的种草笔记",
      prompt: "请帮我写一篇小红书风格的笔记：\n\n主题：{主题}\n产品/内容：{内容}\n\n要求：\n1. 标题要有 emoji 和关键词，吸引眼球\n2. 开头有痛点或共鸣场景\n3. 正文分段清晰，多用 emoji 装饰\n4. 语气亲切自然，像闺蜜分享\n5. 加入真实使用感受和细节\n6. 结尾有总结和推荐指数\n7. 最后附上 5-8 个相关话题标签\n\n风格：{风格，如温柔/活泼/专业/干货}\n字数：{字数}字左右"
    },
    {
      id: "w6", cat: "writing", name: "工作总结",
      desc: "撰写专业的工作总结报告",
      prompt: "请帮我撰写一份{周期}工作总结：\n\n岗位：{岗位}\n主要工作内容：{工作内容}\n重点成果：{重点成果}\n遇到的挑战：{挑战}\n下一步计划：{计划}\n\n要求：\n- 语言正式专业\n- 用数据说话，量化成果\n- 结构清晰：工作概述、重点成果、问题反思、下一步计划\n- 突出亮点和价值贡献\n- 字数：{字数}字左右\n\n请输出完整的工作总结。"
    },
    {
      id: "w7", cat: "writing", name: "创意故事",
      desc: "生成引人入胜的短篇故事",
      prompt: "请创作一个{类型}短篇故事：\n\n主题：{主题}\n主角：{主角描述}\n背景设定：{背景}\n\n要求：\n- 风格：{风格，如治愈/悬疑/温暖/黑暗/幽默}\n- 有完整的起承转合\n- 人物形象鲜明\n- 结尾有意想不到的转折或深刻的感悟\n- 字数：{字数}字左右\n\n请直接输出故事内容。"
    },
    {
      id: "w8", cat: "writing", name: "文章摘要",
      desc: "快速提取文章核心要点",
      prompt: "请为以下文章生成摘要：\n\n---\n{文章内容}\n---\n\n要求：\n1. 用 3-5 句话概括核心内容\n2. 提取 5 个关键信息点\n3. 提炼出文章的核心观点或结论\n4. 字数控制在{字数}字以内\n\n请按「摘要 + 关键信息 + 核心观点」的结构输出。"
    },
    {
      id: "w9", cat: "writing", name: "演讲稿",
      desc: "撰写有感染力的演讲稿",
      prompt: "请帮我撰写一篇演讲稿：\n\n演讲主题：{主题}\n演讲场合：{场合}\n听众：{听众}\n演讲时长：{时长}分钟\n\n核心要点：\n{要点}\n\n要求：\n- 开头有吸引力，可以用故事、提问或数据引入\n- 内容层层递进，有逻辑有温度\n- 语言口语化，适合口头表达\n- 结尾有力，有号召或升华\n- 风格：{风格}\n\n请输出完整的演讲稿。"
    },
    {
      id: "w10", cat: "writing", name: "SEO 优化文章",
      desc: "生成符合 SEO 规范的优化文章",
      prompt: "请撰写一篇 SEO 优化文章：\n\n主关键词：{主关键词}\n长尾关键词：{长尾关键词}\n文章主题：{主题}\n\n要求：\n1. 标题包含主关键词，长度 50-60 字符\n2. 首段 150 字内出现主关键词 2-3 次\n3. 正文分 4-6 个小标题，合理分布关键词\n4. 关键词密度 2-3%，自然不堆砌\n5. 内容有价值，能解决用户问题\n6. 结尾有总结和 CTAs\n7. 字数：{字数}字以上\n\n请输出完整文章。"
    },

    // ===== 编程 =====
    {
      id: "c1", cat: "coding", name: "代码审查助手",
      desc: "对代码进行全面审查和优化建议",
      prompt: "请帮我审查以下{语言}代码：\n\n```\n{代码}\n```\n\n请从以下方面进行审查：\n1. 代码质量和可读性\n2. 潜在的 bug 和逻辑问题\n3. 性能优化建议\n4. 安全隐患\n5. 最佳实践改进\n6. 命名和结构优化\n\n请分点列出问题和建议，重要问题优先。如有具体修改建议，请提供优化后的代码片段。"
    },
    {
      id: "c2", cat: "coding", name: "代码解释器",
      desc: "详细解释代码的功能和原理",
      prompt: "请详细解释以下{语言}代码：\n\n```\n{代码}\n```\n\n请按以下结构解释：\n1. 整体功能概述（这段代码是做什么的）\n2. 核心逻辑拆解（逐段或逐函数讲解）\n3. 关键技术点和原理\n4. 输入输出示例\n5. 使用场景和注意事项\n\n请用通俗易懂的语言解释，适合{水平}水平的开发者理解。"
    },
    {
      id: "c3", cat: "coding", name: "Bug 修复助手",
      desc: "分析 bug 原因并提供修复方案",
      prompt: "我遇到了一个 bug，请帮我分析和修复：\n\n**问题描述：**\n{问题描述}\n\n**错误信息：**\n```\n{错误信息}\n```\n\n**相关代码：**\n```\n{相关代码}\n```\n\n**我尝试过的方法：**\n{已尝试的方法}\n\n请帮我：\n1. 分析 bug 的根本原因\n2. 提供具体的修复方案和代码\n3. 说明为什么会出现这个问题\n4. 给出预防类似问题的建议"
    },
    {
      id: "c4", cat: "coding", name: "算法实现",
      desc: "实现指定算法并进行复杂度分析",
      prompt: "请用{语言}实现{算法名称}算法：\n\n**问题描述：**\n{问题描述}\n\n**要求：**\n1. 实现完整可运行的代码\n2. 详细注释关键步骤\n3. 分析时间复杂度和空间复杂度\n4. 提供测试用例\n5. 如果有多种解法，比较它们的优劣\n\n请输出代码和分析。"
    },
    {
      id: "c5", cat: "coding", name: "正则表达式生成",
      desc: "根据需求生成正则表达式",
      prompt: "我需要一个正则表达式来{用途}：\n\n**匹配规则：**\n{规则描述}\n\n**示例（应该匹配的）：**\n{正向示例}\n\n**示例（不应该匹配的）：**\n{反向示例}\n\n请提供：\n1. 正则表达式\n2. 详细的语法解释\n3. 使用示例（{语言}语言）\n4. 注意事项和边界情况"
    },
    {
      id: "c6", cat: "coding", name: "API 设计",
      desc: "设计 RESTful API 接口规范",
      prompt: "请帮我设计一套 RESTful API：\n\n**业务场景：**\n{业务场景}\n\n**核心资源：**\n{核心资源}\n\n**要求：**\n1. 设计完整的接口列表（CRUD + 业务操作）\n2. 使用 RESTful 规范，合理的 HTTP 方法和 URL\n3. 请求和响应的数据结构（JSON Schema）\n4. 状态码和错误处理规范\n5. 分页、排序、过滤的设计\n6. 认证和权限设计建议\n\n请以表格和示例 JSON 的形式输出。"
    },
    {
      id: "c7", cat: "coding", name: "测试用例生成",
      desc: "生成全面的测试用例",
      prompt: "请为以下功能生成全面的测试用例：\n\n**功能描述：**\n{功能描述}\n\n**相关代码：**\n```\n{代码}\n```\n\n**要求：**\n1. 正常流程测试用例\n2. 边界条件测试用例\n3. 异常和错误处理测试用例\n4. 性能测试关注点\n5. 安全测试关注点\n\n请用{测试框架}编写测试代码，并说明每个测试用例的设计思路。"
    },
    {
      id: "c8", cat: "coding", name: "数据库设计",
      desc: "设计数据库表结构和关系",
      prompt: "请帮我设计数据库表结构：\n\n**业务场景：**\n{业务场景}\n\n**主要实体：**\n{实体列表}\n\n**要求：**\n1. 设计完整的表结构（字段、类型、约束、索引）\n2. 表之间的关系（一对一、一对多、多对多）\n3. ER 图描述（文字形式）\n4. 关键查询的 SQL 示例\n5. 性能优化建议（索引、分表等）\n6. 使用{数据库类型}数据库\n\n请输出建表 SQL 和设计说明。"
    },

    // ===== 翻译 =====
    {
      id: "t1", cat: "translation", name: "专业翻译",
      desc: "高质量专业翻译，保留原文风格",
      prompt: "请将以下文本从{源语言}翻译成{目标语言}：\n\n---\n{文本}\n---\n\n要求：\n1. 翻译风格：{风格，如忠实原文/自然流畅/正式/口语化}\n2. 专业领域：{领域}\n3. 保持原文的语气和情感\n4. 专业术语准确\n5. 如有文化差异，适当归化处理\n\n请直接输出翻译结果。"
    },
    {
      id: "t2", cat: "translation", name: "多版本翻译对比",
      desc: "提供多种翻译版本供选择",
      prompt: "请将以下{源语言}文本翻译成{目标语言}，并提供 3 个不同风格的版本：\n\n---\n{文本}\n---\n\n版本 1：直译版（忠实原文结构和用词）\n版本 2：意译版（自然流畅，符合目标语言表达习惯）\n版本 3：精炼版（简洁有力，保留核心意思）\n\n请分别输出三个版本，并简要说明各版本的适用场景。"
    },
    {
      id: "t3", cat: "translation", name: "论文摘要翻译",
      desc: "学术论文摘要的专业翻译",
      prompt: "请将以下学术论文摘要从{源语言}翻译成{目标语言}：\n\n---\n{摘要内容}\n---\n\n要求：\n1. 保持学术严谨性和专业性\n2. 专业术语准确统一\n3. 符合学术论文摘要的格式规范\n4. 时态和语态使用正确\n5. 保持原文的逻辑结构\n\n请直接输出翻译结果。"
    },
    {
      id: "t4", cat: "translation", name: "合同法律翻译",
      desc: "合同和法律文件的精准翻译",
      prompt: "请将以下{源语言}法律/合同文本翻译成{目标语言}：\n\n---\n{文本}\n---\n\n要求：\n1. 用词精准、正式，符合法律文书规范\n2. 关键法律术语必须准确\n3. 保持条款的严谨性和完整性\n4. 格式与原文保持一致\n5. 如有歧义之处，请在翻译后标注说明\n\n请直接输出翻译结果。"
    },
    {
      id: "t5", cat: "translation", name: "本地化翻译",
      desc: "针对目标市场的本地化翻译",
      prompt: "请将以下内容进行{目标语言}本地化翻译：\n\n---\n{文本}\n---\n\n产品/内容类型：{类型}\n目标市场：{目标市场}\n\n要求：\n1. 不只是翻译，更是文化适配\n2. 调整表达习惯以符合目标用户\n3. 处理好文化梗、幽默、双关语等\n4. 计量单位、日期格式等本地化\n5. 保持品牌调性一致\n\n请输出本地化后的内容，并说明做了哪些适配调整。"
    },

    // ===== 学习 =====
    {
      id: "l1", cat: "learning", name: "费曼学习法",
      desc: "用费曼学习法深入理解一个概念",
      prompt: "我想学习「{概念}」，请用费曼学习法帮我理解：\n\n1. **简单解释**：用最简单的语言，像给 12 岁孩子解释一样，说明这个概念是什么\n2. **类比说明**：用一个生活中的例子或类比来帮助理解\n3. **核心原理**：深入讲解背后的核心原理和机制\n4. **常见误区**：人们对这个概念常见的误解有哪些\n5. **实际应用**：这个概念在现实中有哪些应用场景\n6. **检验理解**：提出 3 个问题来检验我是否真的理解了\n\n我的知识背景：{背景}\n请由浅入深地讲解。"
    },
    {
      id: "l2", cat: "learning", name: "学习计划制定",
      desc: "制定系统的学习计划",
      prompt: "请帮我制定一个{学习主题}的学习计划：\n\n**我的基础：** {基础水平}\n**学习目标：** {目标}\n**可用时间：** 每天{每天时长}小时，持续{周期}\n**学习偏好：** {偏好，如视频/书籍/实践/项目驱动}\n\n请制定一个详细的学习计划，包括：\n1. 总体路线图（分阶段目标）\n2. 每周学习内容和安排\n3. 推荐的学习资源（书籍、课程、项目）\n4. 检验学习成果的方法\n5. 常见困难和应对建议\n\n请尽量具体可执行。"
    },
    {
      id: "l3", cat: "learning", name: "面试题准备",
      desc: "生成面试题和参考答案",
      prompt: "请帮我准备{岗位}岗位的面试题：\n\n**面试级别：** {级别，如初级/中级/高级}\n**重点领域：** {重点领域}\n\n请生成以下类型的面试题：\n1. 基础概念题（5 道）\n2. 进阶原理题（5 道）\n3. 场景设计题（3 道）\n4. 代码/算法题（3 道）\n5. 行为面试题（3 道）\n\n每道题都提供参考答案和答题思路。"
    },
    {
      id: "l4", cat: "learning", name: "知识点思维导图",
      desc: "梳理知识体系，生成思维导图",
      prompt: "请帮我梳理「{主题}」的知识体系，生成一个结构化的思维导图：\n\n**我的水平：** {水平}\n**关注重点：** {重点}\n\n请用层级列表的形式输出，包含：\n1. 核心概念（一级分支）\n2. 每个核心概念下的子主题（二级分支）\n3. 关键知识点和要点\n4. 各知识点之间的关联\n\n要求结构清晰，层次分明，帮助我建立系统的知识框架。"
    },
    {
      id: "l5", cat: "learning", name: "英语写作润色",
      desc: "润色英语作文，提供改进建议",
      prompt: "请帮我润色以下英语作文：\n\n---\n{作文内容}\n---\n\n**作文类型：** {类型，如议论文/说明文/书信}\n**目标水平：** {水平，如四级/六级/雅思/托福}\n\n请完成以下工作：\n1. 修正语法和拼写错误\n2. 优化词汇选择，使用更地道的表达\n3. 改进句子结构，增加句式多样性\n4. 调整段落逻辑和衔接\n5. 给出整体评分（按对应考试标准）\n6. 提供润色后的完整版本\n\n请分点说明修改原因。"
    },
    {
      id: "l6", cat: "learning", name: "错题分析",
      desc: "深入分析错题原因，巩固知识点",
      prompt: "请帮我分析这道错题：\n\n**题目：**\n{题目}\n\n**我的答案：** {我的答案}\n**正确答案：** {正确答案}\n**科目/知识点：** {科目}\n\n请帮我分析：\n1. 正确答案的详细解析\n2. 我错误的原因是什么（概念不清/审题失误/计算错误/方法不对等）\n3. 相关的知识点梳理\n4. 同类题目的解题技巧\n5. 举一反三的练习题（2-3 道）"
    },

    // ===== 营销 =====
    {
      id: "m1", cat: "marketing", name: "品牌 slogan",
      desc: "创作品牌 slogan 和广告语",
      prompt: "请为「{品牌名称}」创作品牌 slogan：\n\n**品牌简介：** {品牌简介}\n**目标用户：** {目标用户}\n**品牌调性：** {调性}\n**竞品参考：** {竞品}\n\n请提供：\n1. 5 个主打 slogan（不同方向）\n2. 10 个备选 slogan\n3. 每个 slogan 的创意说明和适用场景\n4. 推荐的主打 slogan 及理由\n\n要求简洁有力，易于传播和记忆。"
    },
    {
      id: "m2", cat: "marketing", name: "短视频脚本",
      desc: "撰写抖音/快手短视频脚本",
      prompt: "请帮我写一个{时长}秒的短视频脚本：\n\n**产品/主题：** {主题}\n**目标受众：** {受众}\n**视频类型：** {类型，如种草/剧情/教程/测评/变装}\n\n要求：\n1. 前 3 秒必须有钩子，抓住注意力\n2. 节奏紧凑，信息密度高\n3. 有明确的记忆点和传播点\n4. 结尾有行动号召\n5. 包含画面描述、台词、字幕、BGM 建议\n\n请以表格形式输出脚本。"
    },
    {
      id: "m3", cat: "marketing", name: "活动策划方案",
      desc: "策划完整的营销活动方案",
      prompt: "请帮我策划一个{活动类型}营销活动：\n\n**品牌/产品：** {产品}\n**活动目标：** {目标}\n**目标人群：** {人群}\n**预算范围：** {预算}\n**活动时间：** {时间}\n\n请提供完整的活动策划方案，包括：\n1. 活动主题和创意核心\n2. 活动规则和参与方式\n3. 传播路径和推广渠道\n4. 物料清单和内容规划\n5. 时间节点表\n6. 效果预估和 KPI\n7. 风险预案\n\n请尽量具体可执行。"
    },
    {
      id: "m4", cat: "marketing", name: "用户画像分析",
      desc: "构建详细的用户画像",
      prompt: "请帮我构建「{产品/服务}」的用户画像：\n\n**产品描述：** {产品描述}\n**现有用户数据：** {已有数据}\n\n请构建 3-4 个典型用户画像，每个画像包含：\n1. 基本信息（年龄、职业、收入、城市等）\n2. 生活方式和兴趣爱好\n3. 痛点和需求\n4. 消费习惯和决策路径\n5. 触达渠道和内容偏好\n6. 一句话人物小传\n\n并给出针对不同画像的营销策略建议。"
    },
    {
      id: "m5", cat: "marketing", name: "朋友圈文案",
      desc: "生成不同风格的朋友圈文案",
      prompt: "请为「{产品/内容}」写 5 条不同风格的朋友圈文案：\n\n**产品/内容描述：** {描述}\n**发布目的：** {目的}\n\n请生成以下风格各 1 条：\n1. 干货分享型（有价值的知识点）\n2. 情感共鸣型（走心，引发共鸣）\n3. 互动提问型（引导评论和讨论）\n4. 生活场景型（自然植入，不硬广）\n5. 限时福利型（促进行动转化）\n\n每条文案配上合适的 emoji，并建议配图方向。"
    },

    // ===== 创意 =====
    {
      id: "cr1", cat: "creative", name: "头脑风暴",
      desc: "针对一个主题进行发散思维",
      prompt: "请围绕「{主题}」进行头脑风暴：\n\n**背景：** {背景}\n**目标：** {目标}\n\n请从不同角度发散思考，提供：\n1. 10 个最常规/显而易见的想法\n2. 10 个新奇有趣的想法\n3. 5 个大胆疯狂的想法（看似不可能但很有启发性）\n4. 3 个跨界借鉴的想法（从其他行业/领域获得灵感）\n\n请按类别列出，并挑选 3 个你认为最有潜力的进行简要展开说明。"
    },
    {
      id: "cr2", cat: "creative", name: "品牌命名",
      desc: "为品牌或产品起名字",
      prompt: "请为「{产品/品牌描述}」起名字：\n\n**产品/品牌描述：** {描述}\n**目标用户：** {用户}\n**品牌调性：** {调性}\n**行业领域：** {领域}\n\n请提供 20 个候选名称，分为以下类别：\n1. 现代简约型（5 个）\n2. 有趣有记忆点型（5 个）\n3. 专业信任感型（5 个）\n4. 故事情感型（5 个）\n\n每个名字附带含义解释和推荐指数。\n\n请确保名字：\n- 易于发音和记忆\n- 没有负面含义\n- 适合品牌长期发展"
    },
    {
      id: "cr3", cat: "creative", name: "礼物推荐",
      desc: "根据对象和预算推荐礼物",
      prompt: "请帮我推荐礼物：\n\n**送给谁：** {对象描述}\n**关系：** {关系}\n**场合：** {场合}\n**预算：** {预算}\n**对方兴趣爱好：** {爱好}\n**我的想法/偏好：** {偏好}\n\n请推荐 10 个礼物选项，按推荐程度排序，每个包含：\n1. 礼物名称\n2. 推荐理由（为什么适合 TA）\n3. 大概价格区间\n4. 购买渠道建议\n5. 惊喜指数和实用指数评分\n\n涵盖不同类型，有创意有心意。"
    },
    {
      id: "cr4", cat: "creative", name: "旅行规划",
      desc: "规划个性化旅行行程",
      prompt: "请帮我规划一次{目的地}旅行：\n\n**出行时间：** {时间}\n**旅行天数：** {天数}天\n**同行人员：** {同行人员}\n**预算范围：** {预算}\n**兴趣偏好：** {偏好}\n**住宿要求：** {住宿要求}\n\n请提供详细的行程规划：\n1. 行程总览和亮点\n2. 每日详细安排（上午/下午/晚上）\n3. 推荐餐厅和美食\n4. 交通方式建议\n5. 住宿推荐（不同价位）\n6. 注意事项和实用 Tips\n7. 备选方案（天气不好等情况）\n\n请合理安排节奏，不要太赶。"
    },

    // ===== 办公 =====
    {
      id: "o1", cat: "office", name: "会议纪要",
      desc: "整理会议内容生成会议纪要",
      prompt: "请根据以下会议内容整理会议纪要：\n\n---\n{会议内容}\n---\n\n**会议主题：** {主题}\n**会议时间：** {时间}\n**参会人员：** {参会人}\n\n请按以下结构整理：\n1. 会议要点（3-5 条核心结论）\n2. 讨论内容摘要（按议题分类）\n3. 决议事项\n4. 待办事项（责任人 + 截止时间）\n5. 下次会议安排（如有）\n\n要求条理清晰，重点突出，便于快速阅读。"
    },
    {
      id: "o2", cat: "office", name: "PPT 大纲",
      desc: "生成 PPT 演示文稿大纲",
      prompt: "请帮我设计一个 PPT 大纲：\n\n**主题：** {主题}\n**听众：** {听众}\n**目的：** {目的}\n**预计页数：** {页数}页\n\n请提供：\n1. 整体逻辑框架和叙事线\n2. 每页的标题和核心内容要点\n3. 建议的可视化形式（图表/图片/动画等）\n4. 演讲提示和时间分配建议\n5. 开头和结尾的设计建议\n\n要求逻辑清晰，有说服力，符合{风格}风格。"
    },
    {
      id: "o3", cat: "office", name: "数据分析报告",
      desc: "将数据转化为分析报告",
      prompt: "请根据以下数据分析生成报告：\n\n**数据概述：**\n{数据描述}\n\n**关键数据：**\n{关键数据}\n\n**分析目的：** {目的}\n\n请生成一份数据分析报告，包含：\n1. 核心发现（3-5 个最重要的结论）\n2. 详细数据分析（按维度展开）\n3. 趋势判断和原因分析\n4. 问题和风险提示\n5.  actionable 的建议和下一步行动\n\n要求：用数据说话，逻辑清晰，结论明确。"
    },
    {
      id: "o4", cat: "office", name: "简历优化",
      desc: "优化简历内容和表达方式",
      prompt: "请帮我优化简历：\n\n**目标岗位：** {目标岗位}\n**我的简历内容：**\n{简历内容}\n\n请从以下方面优化：\n1. 整体结构和排版建议\n2. 个人简介/自我评价重写（更有吸引力）\n3. 工作经历优化（用 STAR 法则，量化成果）\n4. 技能和项目经历的呈现优化\n5. 针对目标岗位的关键词优化\n6. 整体语言润色（更专业、更有说服力）\n\n请提供优化后的完整简历内容。"
    },
    {
      id: "o5", cat: "office", name: "项目方案",
      desc: "撰写完整的项目方案文档",
      prompt: "请帮我撰写一份项目方案：\n\n**项目名称：** {项目名称}\n**项目背景：** {背景}\n**项目目标：** {目标}\n**预算和周期：** {预算和周期}\n\n请按以下结构撰写完整方案：\n1. 项目概述（背景、目标、价值）\n2. 需求分析（业务需求、用户需求、功能需求）\n3. 解决方案（整体架构、核心功能、技术选型）\n4. 项目计划（里程碑、时间线、资源配置）\n5. 风险评估和应对措施\n6. 成本预算和 ROI 分析\n7. 成功指标和验收标准\n\n要求专业、完整、有说服力。"
    },

    // ===== Midjourney =====
    {
      id: "mj1", cat: "midjourney", name: "人物肖像",
      desc: "高质量人物肖像生成提示词",
      prompt: "{人物描述}, portrait photography, {风格}, {光线}, {构图}, highly detailed face, {镜头} lens, shot on {相机}, 8k, ultra realistic, skin texture, dramatic lighting, {背景} --ar {比例} --v 6 --style raw"
    },
    {
      id: "mj2", cat: "midjourney", name: "风景摄影",
      desc: "壮美风景照片生成提示词",
      prompt: "{场景描述}, landscape photography, {季节}, {时间}, {光线}, {天气}, epic composition, {视角}, wide angle lens, 8k, ultra detailed, national geographic style, color grading, {氛围} --ar {比例} --v 6 --style raw"
    },
    {
      id: "mj3", cat: "midjourney", name: "产品摄影",
      desc: "商业产品摄影风格提示词",
      prompt: "{产品描述}, product photography, studio shot, {背景色} background, {光线} lighting, clean and minimal, {风格} style, commercial advertisement, high-end, detailed texture, product showcase, depth of field, 8k, ultra sharp --ar {比例} --v 6 --style raw"
    },
    {
      id: "mj4", cat: "midjourney", name: "动漫角色",
      desc: "动漫风格角色设计提示词",
      prompt: "{角色描述}, anime style, {画风} art style, vibrant colors, detailed character design, {服饰}, {表情}, {背景}, dynamic pose, cel shading, anime key visual, studio quality, 4k, highly detailed --ar {比例} --v 6 --niji 6"
    },
    {
      id: "mj5", cat: "midjourney", name: "概念艺术",
      desc: "游戏/电影概念艺术提示词",
      prompt: "{场景/角色描述}, concept art, digital painting, {风格} style, {氛围} atmosphere, {光线} lighting, intricate details, environment design, artstation trending, matte painting, {视角}, epic scale, cinematic, 8k --ar {比例} --v 6"
    },
    {
      id: "mj6", cat: "midjourney", name: "插画设计",
      desc: "扁平/矢量插画风格提示词",
      prompt: "{主题描述}, flat illustration, vector art, {配色} color palette, minimal design, clean lines, {风格} style, graphic design, poster art, {元素}, simple shapes, trending on dribbble, high contrast --ar {比例} --v 6"
    },
    {
      id: "mj7", cat: "midjourney", name: "3D 渲染",
      desc: "3D 渲染风格提示词",
      prompt: "{描述}, 3d render, octane render, {风格} style, {光线} lighting, {材质} materials, {背景}, soft shadows, depth of field, isometric view, cute and minimalist, high detail, blender render, 8k --ar {比例} --v 6"
    },
    {
      id: "mj8", cat: "midjourney", name: "赛博朋克",
      desc: "赛博朋克风格提示词",
      prompt: "{主题描述}, cyberpunk style, neon lights, {城市/场景}, rainy night, reflections on wet streets, holographic signs, futuristic, {人物/元素}, {视角}, cinematic lighting, ultra detailed, 8k, Blade Runner 2049 aesthetic --ar {比例} --v 6 --style raw"
    },
  ];

  /* ============ 状态 ============ */
  const state = {
    currentCat: "all",
    searchText: "",
    favorites: JSON.parse(localStorage.getItem("ai_favorites") || "[]"),
    customPrompts: JSON.parse(localStorage.getItem("ai_custom") || "[]"),
    currentTab: "library",
    editingCustomId: null,
  };

  const FAV_KEY = "ai_favorites";
  const CUSTOM_KEY = "ai_custom";

  /* ============ 工具函数 ============ */
  function saveFavorites() {
    localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites));
  }
  function saveCustom() {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(state.customPrompts));
  }
  function isFavorite(id) {
    return state.favorites.includes(id);
  }
  function toggleFavorite(id) {
    const idx = state.favorites.indexOf(id);
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
    } else {
      state.favorites.push(id);
    }
    saveFavorites();
  }
  function showToast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2000);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast("已复制到剪贴板"),
        () => fallbackCopy(text)
      );
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("已复制到剪贴板");
    } catch (e) {
      showToast("复制失败，请手动复制");
    }
    document.body.removeChild(ta);
  }
  function countChars(text) {
    return text.length;
  }
  function countWords(text) {
    if (!text.trim()) return 0;
    // 中英文混合计数
    const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const en = (text.match(/[a-zA-Z]+/g) || []).length;
    return cn + en;
  }

  /* ============ Tab 切换 ============ */
  function initTabs() {
    $$("#aiTabs .tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        $$("#aiTabs .tab").forEach((b) => b.classList.toggle("active", b === btn));
        $$(".ai-tab-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== tab));
        state.currentTab = tab;
        if (tab === "favorites") renderFavorites();
      });
    });
  }

  /* ============ 模板库渲染 ============ */
  function getFilteredTemplates() {
    return TEMPLATES.filter((t) => {
      if (state.currentCat !== "all" && t.cat !== state.currentCat) return false;
      if (state.searchText) {
        const s = state.searchText.toLowerCase();
        return (
          t.name.toLowerCase().includes(s) ||
          t.desc.toLowerCase().includes(s) ||
          t.prompt.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }

  function renderTemplates() {
    const grid = $("#tplGrid");
    const list = getFilteredTemplates();
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><div>没有找到匹配的模板</div><div style="font-size:12px;margin-top:4px">试试其他关键词或分类</div></div>`;
      return;
    }
    grid.innerHTML = list
      .map((t) => {
        const cat = CAT_MAP[t.cat];
        const fav = isFavorite(t.id);
        const preview = t.prompt.replace(/\n/g, " ").slice(0, 100);
        return `
        <div class="tpl-card" data-id="${he(t.id)}">
          <div class="tpl-card-header">
            <span class="tpl-card-icon">${cat.icon}</span>
            <span class="tpl-card-title">${he(t.name)}</span>
            <button class="fav-btn ${fav ? "active" : ""}" data-fav="${he(t.id)}" title="${fav ? "取消收藏" : "收藏"}">${fav ? "★" : "☆"}</button>
          </div>
          <div class="tpl-card-cat" style="align-self:flex-start">${he(cat.name)}</div>
          <div class="tpl-card-desc">${he(t.desc || "")}</div>
          <div class="tpl-card-preview">${he(preview)}...</div>
          <div class="tpl-card-actions">
            <button class="btn primary" data-use="${t.id}">使用模板</button>
            <button class="btn" data-copy="${t.id}">复制</button>
          </div>
        </div>`;
      })
      .join("");

    // 绑定事件
    grid.querySelectorAll("[data-use]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        useTemplate(btn.dataset.use);
      });
    });
    grid.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const t = TEMPLATES.find((x) => x.id === btn.dataset.copy);
        if (t) copyText(t.prompt);
      });
    });
    grid.querySelectorAll("[data-fav]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(btn.dataset.fav);
        renderTemplates();
        showToast(isFavorite(btn.dataset.fav) ? "已收藏" : "已取消收藏");
      });
    });
    grid.querySelectorAll(".tpl-card").forEach((card) => {
      card.addEventListener("click", () => useTemplate(card.dataset.id));
    });
  }

  function useTemplate(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const panel = $("#editorPanel");
    panel.style.display = "block";
    $("#editorTitle").textContent = t.name;
    $("#editorTextarea").value = t.prompt;
    updateEditorStats();
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function updateEditorStats() {
    const text = $("#editorTextarea").value;
    $("#editorCharCount").textContent = countChars(text);
    $("#editorWordCount").textContent = countWords(text);
  }

  function initCategoryChips() {
    $$("#catChips .cat-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        $$("#catChips .cat-chip").forEach((c) => c.classList.toggle("active", c === chip));
        state.currentCat = chip.dataset.cat;
        renderTemplates();
      });
    });
  }

  function initSearch() {
    let timer;
    $("#tplSearch").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.searchText = e.target.value.trim();
        renderTemplates();
      }, 200);
    });
  }

  function initEditor() {
    $("#editorTextarea").addEventListener("input", updateEditorStats);
    $("#editorCopyBtn").addEventListener("click", () => {
      copyText($("#editorTextarea").value);
    });
    $("#closeEditor").addEventListener("click", () => {
      $("#editorPanel").style.display = "none";
    });
    $("#editorFavBtn").addEventListener("click", () => {
      // 自定义收藏：以 custom_ 开头存到 favorites 或 custom
      const text = $("#editorTextarea").value.trim();
      if (!text) return showToast("内容不能为空");
      // 添加到自定义提示词
      const name = $("#editorTitle").textContent || "自定义提示词";
      const item = {
        id: "custom_" + Date.now(),
        cat: "custom",
        name: name + " (副本)",
        desc: "从编辑器保存的自定义提示词",
        prompt: text,
        custom: true,
      };
      state.customPrompts.unshift(item);
      saveCustom();
      showToast("已保存到自定义提示词");
    });
  }

  /* ============ 生成器 ============ */
  function initGenerator() {
    $$("#genTypeTabs .gen-type-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const type = tab.dataset.type;
        $$("#genTypeTabs .gen-type-tab").forEach((t) => t.classList.toggle("active", t === tab));
        $$(".gen-form").forEach((f) => f.classList.toggle("hidden", f.dataset.form !== type));
      });
    });

    $("#genBtn").addEventListener("click", generatePrompt);
    $("#genCopyBtn").addEventListener("click", () => {
      const text = $("#genOutput").value;
      if (text) copyText(text);
      else showToast("还没有生成提示词");
    });
    $("#genFavBtn").addEventListener("click", () => {
      const text = $("#genOutput").value.trim();
      if (!text) return showToast("还没有生成提示词");
      const item = {
        id: "custom_" + Date.now(),
        cat: "custom",
        name: "生成的提示词",
        desc: "从提示词生成器保存",
        prompt: text,
        custom: true,
      };
      state.customPrompts.unshift(item);
      saveCustom();
      showToast("已保存到自定义提示词");
    });
  }

  function generatePrompt() {
    const activeTab = $("#genTypeTabs .active").dataset.type;
    let prompt = "";

    if (activeTab === "writing") {
      const topic = $("#gwTopic").value.trim() || "{主题}";
      const type = $("#gwType").value;
      const tone = $("#gwTone").value;
      const audience = $("#gwAudience").value.trim() || "目标读者";
      const length = $("#gwLength").value;
      const points = $("#gwPoints").value.trim();

      const typeMap = {
        blog: "博客文章",
        essay: "议论文",
        email: "电子邮件",
        report: "工作报告",
        story: "故事/小说",
        copy: "广告文案",
        summary: "内容摘要",
        review: "评测文章",
      };
      const toneMap = {
        professional: "专业正式、严谨客观",
        friendly: "亲切友好、温暖真诚",
        humorous: "幽默风趣、轻松活泼",
        academic: "学术严谨、逻辑缜密",
        casual: "轻松随意、接地气",
        inspiring: "鼓舞人心、充满力量",
        neutral: "客观中立、不偏不倚",
      };
      const lengthMap = {
        short: "300-500 字，精炼简短",
        medium: "800-1500 字，内容充实",
        long: "2000 字以上，深入全面",
        detailed: "非常详细，面面俱到",
      };

      prompt = `请你扮演一位资深的${typeMap[type]}写手，为我撰写一篇关于「${topic}」的${typeMap[type]}。

写作要求：
1. 标题：要有吸引力，能精准概括内容
2. 结构：层次分明，逻辑清晰，有引人入胜的开头、充实的正文和有力的结尾
3. 语气风格：${toneMap[tone]}
4. 目标读者：${audience}
5. 篇幅：${lengthMap[length]}
${points ? `6. 需包含以下要点：\n${points.split("\n").map((p) => "   - " + p).join("\n")}` : "6. 请围绕主题自由发挥，提供有价值的内容和独到的见解"}

请直接输出完整的文章内容，不要额外的解释或说明。`;
    } else if (activeTab === "midjourney") {
      const subject = $("#gmSubject").value.trim() || "a beautiful scene";
      const style = $("#gmStyle").value;
      const light = $("#gmLight").value;
      const composition = $("#gmComposition").value;
      const mood = $("#gmMood").value;
      const ratio = $("#gmRatio").value;
      const extra = $("#gmExtra").value.trim();

      prompt = `${subject}, ${style}, ${light}, ${composition}, ${mood}, highly detailed, intricate details, 8k, masterpiece, best quality${extra ? ", " + extra : ""} ${ratio} --v 6`;
    } else if (activeTab === "translation") {
      const source = $("#gtSource").value;
      const target = $("#gtTarget").value;
      const style = $("#gtStyle").value;
      const domain = $("#gtDomain").value;
      const text = $("#gtText").value.trim() || "{待翻译文本}";

      prompt = `请将以下${source}文本翻译成${target}：

---
${text}
---

翻译要求：
1. 翻译风格：${style}
2. 专业领域：${domain}
3. 保持原文的语气、情感和格式
4. 专业术语准确，符合行业规范
5. 译文要自然流畅，符合${target}的表达习惯
6. 如有文化差异，请适当处理以确保目标读者能准确理解

请直接输出翻译结果，不要添加额外说明。`;
    } else if (activeTab === "code") {
      const lang = $("#gcLang").value;
      const desc = $("#gcDesc").value.trim() || "{功能描述}";
      const style = $("#gcStyle").value;
      const req = $("#gcReq").value.trim();

      prompt = `请用 ${lang} 实现以下功能：

**功能描述：**
${desc}

**代码风格要求：**
- 风格：${style}
- 代码规范、结构清晰
- 有适当的注释说明
${req ? `- 特殊要求：${req}` : ""}

请提供：
1. 完整可运行的代码实现
2. 关键部分的注释说明
3. 使用示例
4. 注意事项（如有）`;
    }

    $("#genOutput").value = prompt;
    $("#genCharCount").textContent = countChars(prompt);
    showToast("提示词已生成");
  }

  /* ============ 收藏 & 自定义 ============ */
  function renderFavorites() {
    const grid = $("#favGrid");
    const filter = $("#favCatChips .active")?.dataset.cat || "all";

    const favItems = state.favorites
      .map((id) => TEMPLATES.find((t) => t.id === id))
      .filter(Boolean)
      .map((t) => ({ ...t, source: "favorite" }));
    const customItems = state.customPrompts.map((t) => ({ ...t, source: "custom" }));

    let allItems = [...favItems, ...customItems];
    if (filter === "favorite") {
      allItems = favItems;
    } else if (filter === "custom") {
      allItems = customItems;
    }

    $("#favCount").textContent = `${allItems.length} 个`;

    if (!allItems.length) {
      grid.innerHTML = `<div class="empty-state"><div class="icon">⭐</div><div>还没有收藏的提示词</div><div style="font-size:12px;margin-top:4px">在模板库中点击星标收藏，或创建自定义提示词</div></div>`;
      return;
    }

    grid.innerHTML = allItems
      .map((t) => {
        const cat = CAT_MAP[t.cat] || { name: "自定义", icon: "📝" };
        const fav = t.source === "favorite" || isFavorite(t.id);
        const preview = t.prompt.replace(/\n/g, " ").slice(0, 100);
        return `
        <div class="tpl-card" data-id="${he(t.id)}">
          <div class="tpl-card-header">
            <span class="tpl-card-icon">${cat.icon}</span>
            <span class="tpl-card-title">${he(t.name)}</span>
            <button class="fav-btn ${fav ? "active" : ""}" data-fav="${he(t.id)}" title="${fav ? "取消收藏" : "收藏"}">${fav ? "★" : "☆"}</button>
          </div>
          <div class="tpl-card-cat" style="align-self:flex-start">${he(t.source === "custom" ? "自定义" : cat.name)}</div>
          <div class="tpl-card-desc">${he(t.desc || "")}</div>
          <div class="tpl-card-preview">${he(preview)}...</div>
          <div class="tpl-card-actions">
            <button class="btn primary" data-use-fav="${t.id}">使用</button>
            <button class="btn" data-copy-fav="${t.id}">复制</button>
            ${t.source === "custom" ? `<button class="btn ghost danger" data-del-custom="${t.id}">删除</button>` : ""}
          </div>
        </div>`;
      })
      .join("");

    // 绑定事件
    grid.querySelectorAll("[data-use-fav]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.useFav;
        const all = [...TEMPLATES, ...state.customPrompts];
        const t = all.find((x) => x.id === id);
        if (t) {
          // 切换到模板库 tab 并打开编辑器
          document.querySelector('#aiTabs .tab[data-tab="library"]').click();
          setTimeout(() => useTemplate(id) || customToEditor(t), 50);
        }
      });
    });
    grid.querySelectorAll("[data-copy-fav]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.copyFav;
        const all = [...TEMPLATES, ...state.customPrompts];
        const t = all.find((x) => x.id === id);
        if (t) copyText(t.prompt);
      });
    });
    grid.querySelectorAll("[data-fav]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.fav;
        // 自定义提示词的收藏逻辑不同 - 直接删除/添加
        const isCustom = state.customPrompts.find((c) => c.id === id);
        if (isCustom) {
          // 自定义项的星标表示是否在 favorites 中
          toggleFavorite(id);
        } else {
          toggleFavorite(id);
        }
        renderFavorites();
        showToast(isFavorite(id) ? "已收藏" : "已取消收藏");
      });
    });
    grid.querySelectorAll("[data-del-custom]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.delCustom;
        showConfirm("确认删除", "确定要删除这个自定义提示词吗？", () => {
          state.customPrompts = state.customPrompts.filter((c) => c.id !== id);
          saveCustom();
          // 同时从收藏中移除
          const fi = state.favorites.indexOf(id);
          if (fi >= 0) {
            state.favorites.splice(fi, 1);
            saveFavorites();
          }
          renderFavorites();
          showToast("已删除");
        });
      });
    });
  }

  function customToEditor(t) {
    const panel = $("#editorPanel");
    panel.style.display = "block";
    $("#editorTitle").textContent = t.name;
    $("#editorTextarea").value = t.prompt;
    updateEditorStats();
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function initFavoritesTab() {
    $$("#favCatChips .cat-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        $$("#favCatChips .cat-chip").forEach((c) => c.classList.toggle("active", c === chip));
        renderFavorites();
      });
    });

    $("#addCustomBtn").addEventListener("click", () => {
      state.editingCustomId = null;
      $("#customModalTitle").textContent = "新建自定义提示词";
      $("#customName").value = "";
      $("#customCategory").value = "custom";
      $("#customDesc").value = "";
      $("#customContent").value = "";
      $("#customModal").classList.add("show");
    });

    $("#cancelCustomBtn").addEventListener("click", () => {
      $("#customModal").classList.remove("show");
    });

    $("#saveCustomBtn").addEventListener("click", () => {
      const name = $("#customName").value.trim();
      const content = $("#customContent").value.trim();
      if (!name) return showToast("请输入名称");
      if (!content) return showToast("请输入提示词内容");

      const item = {
        id: state.editingCustomId || "custom_" + Date.now(),
        cat: $("#customCategory").value,
        name,
        desc: $("#customDesc").value.trim(),
        prompt: content,
        custom: true,
      };

      if (state.editingCustomId) {
        const idx = state.customPrompts.findIndex((c) => c.id === state.editingCustomId);
        if (idx >= 0) state.customPrompts[idx] = item;
      } else {
        state.customPrompts.unshift(item);
      }
      saveCustom();
      $("#customModal").classList.remove("show");
      renderFavorites();
      showToast("保存成功");
    });
  }

  /* ============ 确认弹窗 ============ */
  let confirmCallback = null;
  function showConfirm(title, text, onOk) {
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    confirmCallback = onOk;
    $("#confirmModal").classList.add("show");
  }
  function initConfirm() {
    $("#confirmCancelBtn").addEventListener("click", () => {
      $("#confirmModal").classList.remove("show");
      confirmCallback = null;
    });
    $("#confirmOkBtn").addEventListener("click", () => {
      $("#confirmModal").classList.remove("show");
      if (confirmCallback) confirmCallback();
      confirmCallback = null;
    });
  }

  /* ============ 初始化 ============ */
  function init() {
    initTabs();
    initCategoryChips();
    initSearch();
    initEditor();
    initGenerator();
    initFavoritesTab();
    initConfirm();
    renderTemplates();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
