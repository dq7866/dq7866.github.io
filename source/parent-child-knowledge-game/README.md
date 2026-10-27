# ⚡ 知识擂台 · 双机对战

亲子互动知识游戏（答题对战 + 单人闯关）的本地开发工程。

## 功能总览

**原有玩法**：双机对战（家长延迟解锁 / 抢答计分 / 再来一局）、单人闯关（自适应难度 / XP 段位 / 徽章）、错题专项练习、学习档案、家长看板、学习周报、战绩分享卡。

**学情分析（第七期新增）**：
- 每次答题都按「科目 × 知识点」入档（`kpStat`），错题同一道题再错只累计次数、不重复堆叠
- 家长看板新增「学情分析」页：知识点掌握度五级（已掌握 / 巩固中 / 待突破 / 刚接触 / 还没练）、
  「最该练的知识点」排序（错得越多、正确率越低越靠前）、分科明细展开查看
- 错题本改为**按知识点分组**，每组折叠展示错题与正确答案，可一键「练这组」——
  只出该知识点的题（服务端 `/api/questions` 支持 `kp` 精确过滤，不足自动放开年级补齐同知识点题）
- 老档案自动兜底：没有 `kpStat` 时用错题本的知识点回填，历史数据也能直接看

**本地新增**：
- 🔍 **对局复盘** —— 双机对战和单人闯关结束后，逐题展示双方对错与用时、按知识点统计孩子薄弱项、生成给家长的可执行建议（如"优先补【笔画笔顺】"）。
- 📡 **档案跨设备同步** —— 档案页可生成 6 位同步码，其他设备绑定后自动拉取/推送（服务端按时间戳做冲突保护，旧数据不覆盖新数据）。
- 🤝 **同屏对战** —— 一台设备两人玩，孩子/家长各占一排按钮抢答，答对得分、答错锁定。
- 📒 **错题挑战赛** —— 只出错题本里的题，答对一题消灭一题。
- ⚡ **极速 60 秒** —— 60 秒无限题，连对加倍率（最高 ×3），结束按得分折算 XP。
- 📚 **小学全课程题库** —— 1–6 年级 × 6 科（语文 / 数学 / 英语 / 科学 / 品德 / 安全）全覆盖，共 **5684 道、182 个知识点**（对照课程标准 180 个知识点、527 个「科目×知识点×年级」槽位 100% 达标）。数学题由程序按知识点模板生成（答案精确计算、选项按数值去重），语文/英语/科学/品德/安全由「知识点事实表 + 人工题库」自动组题（正问 + 反问双形态），外加从云端采集的原始题。每题带知识点 `kp` 与难度 `lv`，大混战按科目轮转出题，难度参数 `level` 真正生效。

## 这个工程是怎么来的

线上版本是一个静态页面 + 服务端的组合。云端沙箱只对外暴露了页面本身、
`/api/questions` 取题接口和 WebSocket 房间同步，**服务端源码无法下载**。
所以本工程的构成是：

| 部分 | 来源 | 状态 |
| --- | --- | --- |
| 页面 `public/index.html` | 从线上完整抓取（原始件留档在 `_capture/index.html`） | 原样保留，仅 1 处 bug 修复 + favicon + 挂载 extra.js |
| 扩展模块 `public/extra.js` | 本地新增（复盘 / 同步 / 三种新玩法） | 通过包装原结算函数叠加，不改原答题流程 |
| 题库 `data/questions.json` | 采集题 + 事实表生成题 + 人工题，由 `npm run build:bank` 合并 | 5684 道（小学 1–6 年级 6 科全覆盖、182 个知识点） |
| 服务端 `server.js` | 按客户端协议重建，并新增难度分级 / 答题明细 / 档案接口 | 行为对齐，代码是重写的 |
| 学习档案（XP/错题/徽章/每日任务） | 原本就存在浏览器 localStorage | 不随代码走，各设备独立 |

> 已知差异：线上服务端是否有额外的反作弊/限流逻辑无从得知；本地版按协议正向实现，
> 出题时服务端洗牌选项、且不下发正确答案（这一点与线上一致）。

## 运行

```bash
npm install
npm start          # http://localhost:3000
# 或者热重载开发
npm run dev
```

- 电脑访问 `http://localhost:3000`
- 同一局域网用手机对战：电脑 `ipconfig` 查到 IPv4（如 192.168.1.10），
  手机打开 `http://192.168.1.10:3000`，一个选「家长开房」、一个选「孩子加入」，
  输入 4 位房间码即可。WebSocket 会自动用同一 host，无需改配置。

## 目录

```
server.js                  服务端：静态托管 + /api/questions + 档案同步 + WS 房间协议 + 后台管理 API
lib/bank-store.js          题库存储层：底库 + 管理端修订层（overlay）合并、校验、审计、批量事务
lib/xlsx-io.js             Excel 读写：导出表/模板生成、宽松表头解析、字段宽容转换
lib/admin-auth.js          管理口令哈希（scrypt + 随机 salt）与校验
public/index.html          前端单页（原有全部 UI 与逻辑）
public/extra.js            扩展模块：复盘 / 档案同步 / 同屏对战 / 错题挑战 / 极速60秒
public/admin.html          题库后台管理界面（/admin）
data/questions.json        合并后的题库（5684 道，小学 1-6 年级 6 科全覆盖、182 个知识点）
data/admin/overlay.json    管理端修订层：新增/修改/删除记录，重建题库不会丢失
data/admin/audit.jsonl     管理端操作日志
data/admin/auth.json       管理员口令哈希（首次启动自动生成，不入库）
data/bank/grade*.json      人工编写的题（带知识点 kp 与难度 lv）
data/bank/gen-*.json       生成器输出（数学模板题 + 事实表组题）
data/facts/*.json          知识点事实表（成对事实，正问/反问自动组题）
data/harvested.json        从线上接口采集的原始题库
scripts/generate-math.mjs  数学程序化出题（答案计算、选项按数值去重）
scripts/generate-bank.mjs  事实表/古诗/成语/近反义词/多音字/量词 自动组题（含选项长度平衡）
scripts/build-bank.mjs     合并全部来源、采集题打知识点标签（npm run build:bank）
scripts/mine-questions.mjs 云端加题后重新采样（写入 data/harvested.json）
scripts/test-battle.mjs    双机对战协议级自测（含复盘明细校验）
scripts/test-admin.mjs     后台管理 API 自测（62 项断言）
scripts/test-xlsx.mjs      Excel 导入导出 API 自测（48 项断言）
scripts/test-security.mjs  安全与一致性回归自测（23 项断言：目录穿越/知识点过滤/口令哈希/登录限流/档案写入）
scripts/verify-answers.mjs 数学题答案自校验（重算算式/周长/面积/体积，确认答案与选项一致）
scripts/audit-bank.mjs     题库体检（9 类：结构、占位符、无意义选项、语义倒置、数值等价、重复题、游离知识点、答案泄露、答案偏置）
scripts/audit-length.mjs   答案长度体检（按知识点汇总「靠选项长短就能猜出答案」的题，给出改文案建议）
scripts/check-coverage.mjs 知识点覆盖体检（对照课程表输出槽位达标率与缺口）
scripts/e2e-ui.mjs         真实浏览器 E2E（对战复盘/同屏/极速/同步卡片）
scripts/e2e-admin.mjs      后台管理界面 E2E（登录→增删改→批量→恢复）
scripts/e2e-xlsx.mjs       Excel 导入导出界面 E2E（下载/上传/预检/入库）
scripts/e2e-study.mjs      学情分析 E2E（掌握度分级/最该练排序/练这组锁定知识点/错题分组）
scripts/e2e-challenge.mjs  错题挑战赛 E2E
scripts/e2e-grades.mjs     年级/科目选择流程 E2E
docs/*.png                 各功能界面截图
_capture/index.html        线上页面原始留档，用于 diff 比对
```

## 后台管理（/admin）

浏览器打开 `http://localhost:3000/admin`（默认密码 `admin123`，登录后右上角改密码；
也可以用环境变量 `ADMIN_PASSWORD` 指定首次密码）。

> 口令以 **scrypt + 随机 salt** 哈希存进 `data/admin/auth.json`，磁盘上没有明文。
> 同一 IP 连续输错 10 次会锁定 1 分钟，挡住在线爆破。
> 这个文件已在 `.gitignore` 里，不会进版本库。

功能一览：

- **查**：统计卡（总数 / 知识点 / 新增 / 修改 / 删除）、年级 × 科目 × 难度 × 知识点 × 状态组合筛选、题干与选项全文搜索、分页
- **增**：新增题目（4 选项、多年级归属、知识点、难度），支持「保存并继续新增」连续录入；也支持 JSON 文件/粘贴批量导入（自动跳过非法行并给出原因）
- **改**：编辑任意题目，`answer` 与正确选项自动同步；批量改难度 / 改知识点 / 追加年级
- **删**：软删除（可在「已删除」列表找回恢复）、批量删除、一键恢复
- **Excel 导入导出**：一键导出 `.xlsx`（含「填写说明」工作表），支持只导出当前筛选结果；导入支持 `.xlsx / .xls / .csv`，先预检再入库，逐行报错并带 Excel 行号；支持「只加新题」或「按题目ID / 相同题干覆盖更新」两种模式；空白模板可下载
- **导出 JSON**：随时导出当前生效题库为 JSON 备份
- **审计**：全部增删改操作留痕（data/admin/audit.jsonl），界面可查

设计上管理端的改动写进 `data/admin/overlay.json`（修订层），不直接改 `questions.json`，
所以 `npm run build:bank` 重建题库不会冲掉管理员的工作。题目 id 由「科目+题干」哈希生成，
题干不变则 id 稳定，修订层始终能命中。

### Excel 表格格式

后台的导入导出都用同一套列：`题目ID | 科目 | 年级 | 难度 | 知识点 | 题干 | 选项A~D | 正确答案 | 状态 | 来源`。

- **正确答案**三种写法都认：`A`（推荐）、`1-4`（1 就是 A）、或直接填选项原文；
- **年级**支持 `1`、`1,2`、`1-3`、`三年级` 等写法；**难度**支持 `1/2/3` 或 `易/中等/难`；
- 列顺序可以调、列名可以用常见别名（学科 / 适用年级 / 考点 / 选项1……），认不出的列自动忽略；
- 拿到的导出文件直接改完再导回去，配合「按题目ID 覆盖更新」就是原地修订，不会产生重复题；
- 导入先**预检**：逐行校验，坏行带 Excel 行号回报，好行照常入库，不会一行出错整批失败。

## 部署

### 主站 Pages（当前线上方案）

游戏挂在主站 `https://dq7866.online/games/knowledge/`，由主仓库的构建脚本处理：

```
node scripts/post-build-game.js      同步前端 + 注入子路径配置（必须在 hexo 之前）
→ hexo generate                     处理已注入的文件 → public/
→ node scripts/post-build-assets.js  复制 forest 音频
→ node scripts/post-build-worker.js  生成 public/_worker.js（题库内联）
```

关键点：

- **Pages 的高级模式**：输出目录里有 `_worker.js` 才启用 Functions，
  `functions/` 目录只在 `wrangler pages dev` 本地预览时用
- **题库不能作为独立文件放进 `public/`**——它含每道题的 `correct` 字段，
  任何人下载即可看全部答案。构建脚本把题库内联进 `_worker.js`
- **wrangler 必须在 `dependencies`**（不是 devDependencies）——
  Git 集成的构建命令是 `npm ci --omit=dev`
- **注入位置很关键**：`window.KLT_API_BASE` 必须早于 index.html 的主脚本，
  否则 `const API_BASE` 求值时拿到空字符串，请求会打到站点根路径（404）

路由：

| 路径 | 说明 |
| --- | --- |
| `GET /games/knowledge/api/questions` | 取题（**不下发 correct**） |
| `POST /games/knowledge/api/grade` | 判分 `{ qid, picked }` → `{ ok, correct }` |
| `GET /games/knowledge/api/health` | 健康检查 |
| `GET /games/knowledge/ws` | 对战房间（转发 Durable Object） |

题目 id 用题库稳定序号 `qid`，服务端据此反查答案，浏览器拿不到答案。

### 独立 Workers 项目（备用方案）

`workers/` 目录下是独立部署方案，适合不挂主站、单独走 Workers 的场景：

```bash
cd workers
wrangler deploy          # 部署主 Worker
cd room-worker && wrangler deploy   # 部署承载 Durable Object 的 Worker
```

⚠️ `workers.dev` 域名在境内被 DNS 劫持（连 8.8.8.8 都解析到无关 IP 段），
必须挂自定义域名才能访问。

## 测试

```bash
npm test                    # 协议级自测（需服务已启动）
npm run test:admin          # 后台管理 API 自测（62 项断言）
npm run test:xlsx           # Excel 导入导出 API 自测（48 项断言）
npm run test:security       # 安全与一致性回归（23 项断言，本轮新增）
npm run verify:answers      # 数学题答案自校验（程序重算 1000+ 道题的答案，确认选项里有正解）
npm run audit:bank          # 题库体检：结构错误/答案歧义/串题/答案偏置/长度溢出，一次全查
npm run audit:length        # 答案长度体检：找出「靠选项长短就能猜出答案」的题（按知识点汇总）
npm run check:coverage      # 知识点覆盖体检（对照课程表输出槽位达标率与缺口）
npm run e2e                 # 浏览器 E2E，需要 npm i -D playwright（用系统 Edge，无需下载内核）
npm run e2e:admin           # 后台管理界面 E2E
npm run e2e:xlsx            # Excel 导入导出界面 E2E（真实下载 + 上传 + 预检 + 入库）
npm run e2e:challenge       # 错题挑战 E2E
npm run e2e:grades          # 1–6 年级各科都能开局、题目年级不越界
npm run e2e:study           # 学情分析页 + 错题按知识点分组练
npm run e2e:battle          # 双人对战一致性：双方同题、答案一致、判定一致、计分一致（230+ 断言）
npm run e2e:lock            # 家长延迟边界：0 秒不锁 / 锁定期点击被拒 / 解锁后能作答
npm run e2e:profile         # 档案总账一致性：totalQ 与分科目明细同步、每日进度与 XP 不被旧快照覆盖
```

> 除 `verify:answers` / `audit:*` / `check:coverage` 外，其余脚本都需要先 `npm start` 起服务。
> E2E 系列需要 `npm i -D playwright`（用系统 Edge，无需下载浏览器内核）。

## 本轮修复的问题（2026-10-27 审核）

一次全面审核 + 修复，实测复现并钉死，用 `npm run test:security` 做回归。

### P0 · 安全

| 问题 | 现象 | 修复 |
| --- | --- | --- |
| **静态服务目录穿越** | `serveStatic` 用 `filePath.startsWith(PUBLIC_DIR)` 判断边界，是前缀匹配：`E:\...\public_evil` 也 startsWith `E:\...\public`。实测 `GET /%2e%2e%2fpublic_evil%2fx.txt` 能读到 public 之外的兄弟目录 | 改用 `path.relative` 判断"是否仍在 public 之内"，跨目录一律 403 |
| **Hexo 构建泄漏敏感文件** | 站点 `_config.yml` 的 `exclude` 没排除本工程，`hexo generate` 会把 `data/admin/auth.json`（口令）、`data/profiles.json`（孩子学习档案）、`node_modules`(33M)、题库(1.7M) 复制进 `public/` 并随 GitHub Pages 公开 | `_config.yml` 加 `parent-child-knowledge-game/**` 排除；工程内加 `.gitignore` 挡住口令与档案入库 |
| **管理员口令明文存储** | `data/admin/auth.json` 明文存 `{password:"admin123"}`，拿到文件即拿到后台完全控制权 | 改为 scrypt + 随机 salt 哈希（`lib/admin-auth.js`），旧明文文件启动时自动原地升级 |
| **登录无暴力破解防护** | 口令可无限次尝试 | 同 IP 连续错 10 次锁 60 秒；锁定窗口短，避免家里多台设备共用出口 IP 时误伤 |

### P0 · 功能

| 问题 | 现象 | 修复 |
| --- | --- | --- |
| **每日任务进度被覆盖归零** | 单人闯关结算里 `bumpDaily()` 先写盘、随后 `saveProfile(旧快照)` 整份覆盖，导致「完成轮数」「答对题数」永远显示 0，孩子永远领不到每日任务 XP。已用脚本复现（期望 1/8，实际 0/0） | 引入 `mutateProfile(fn)` 作为档案**唯一写入口**（读→改→写一次完成），单人结算 / 对战结算 / 同屏对战 / 极速模式 / 领取任务全部收敛到它 |
| **知识点过滤被补足逻辑绕过** | 请求不存在的 kp（如"加法"）时，补足逻辑放弃 kp 约束，返回该科目 8 个不同知识点的题，违反「练这组只出该知识点」的承诺 | 指定 kp 时只补同知识点题；补不齐就少给几题，不拿别的知识点充数 |

### P1 · 性能

| 问题 | 现象 | 修复 |
| --- | --- | --- |
| **批量导入慢到不可用** | 每写入一行都全量重建 5684 题索引 + 写全量 JSON + 一次同步磁盘写（审计日志）。实测 500 行要 30 秒，2000 行要 **2 分钟** | `bank-store` 加事务模式：批量期间只改内存，结束时统一重建索引、落盘一次、审计日志一次 append。**500 行 30.6s → 104ms（294 倍）**，2000 行 2 分钟 → 0.4 秒 |
| **查重是 O(n) 线性扫描** | 每次新增/修改都扫全库 | 建 `科目+题干` 归一索引，查重 O(1) |

### P1 · 题库质量

| 问题 | 现象 | 修复 |
| --- | --- | --- |
| **答案长度泄露** | 孩子能靠"哪个选项最长/最短"猜出答案。体检出 139 处长度差 ≥6 字的题 | 生成器加长度平衡：优先挑与正确答案长度接近的干扰项。差 ≥4 字的题 382 → 317（-17%），平均长度差 0.959 → 0.863 字，题量不变 |
| **缺少专项体检入口** | `audit-bank` 只给汇总数字，改文案时无从下手 | 新增 `scripts/audit-length.mjs`：按知识点汇总 + 逐题明细，直接给出"该改这组的文案还是改那组" |

### 顺带修的

- 档案写入全面收敛到单一入口，消除"多处读-改-写互相覆盖"这一类问题（同屏对战早就踩过并单独绕开了，单人路径漏了）
- 错题挑战、同屏对战的 XP 与每日进度改为同事务写入，不再依赖调用顺序
- `npm test` / `npm run test:security` / `npm run audit:length` / `npm run check:coverage` 补进 `package.json`

## 协议速查（改服务端时对照）

客户端 → 服务端：`create{grade,subject,parentDelay,rounds}`、`join{code}`、
`answer{text}`、`rematch`

服务端 → 客户端：`created{code}`、`joined`、`ready`、`round{no,total,subj,text,options:[{t}],time,scores,parentDelay}`、
`unlock`、`result{who,ok,score}`、`reveal{correct,winner}`、`over{scores,result,detail}`、
`error{msg}`、`info{msg}`、`locked`

计分规则：答对 +1 分，分数即答对题数；`over.result` 取 `child` / `parent` / `draw`。
`over.detail` 是逐题流水（每题的 `child`/`parent` 作答与对错），前端用它把双人对战
补进总账 `totalQ`/`totalCorrect`，与逐题写入的 `subj`/`kpStat`/`hist` 明细对齐。

## 题库是怎么做出来的（扩题指南）

| 来源 | 说明 |
| --- | --- |
| 数学 | `scripts/generate-math.mjs` 按知识点模板程序化出题：随机参数 → 程序算答案 → 生成干扰项（常见错解/邻近值/带单位变体，按数值去重保证只有一个正确答案）。想加题量改 `PER`（每模板题数）或加模板 |
| 语文/英语/科学/品德/安全 | `data/facts/*.json` 里的**成对事实**（`[[问题主体, 答案], ...]`）由 `scripts/generate-bank.mjs` 自动生成正问、反问两种题目，干扰项从同组其他事实中取 |
| 语文专项 | 古诗（下一句/作者/朝代/主题）、常用成语释义、近反义词、多音字、量词、修辞、病句、标点 |
| 采集题 | `scripts/mine-questions.mjs` 从云端接口穷举抽样 → `data/harvested.json`，合并时按关键词打知识点标签 |

改动后重建：`npm run build:bank`（等价于 `gen:math` → `gen:bank` → `build-bank.mjs`）。
生成器使用固定随机种子，输出可复现；`data/raw/` 为下载的公开语料（已加入 .gitignore，可重新下载）。

## 已修的 bug

- 首次使用（本机无学习档案）点「开始闯关」报 `Cannot read properties of undefined (reading 'mix')`：
  `startSolo()` 里用了未与 `defaultProfile()` 合并的裸 `loadProfile()`，导致 `p.xp` 为空。
  已改为 `Object.assign(defaultProfile(), loadProfile())`。
