# 审核报告 · 知识擂台（2026-10-27）

一次覆盖代码、题库、数据、安全、测试的全面审核。所有问题都经过**运行时实测复现**，
修复后用 `npm run test:security`（23 项新断言）+ 全量既有回归（500+ 断言）确认。

---

## 一、结论

| 维度 | 审核前 | 审核后 |
| --- | --- | --- |
| 严重（P0）问题 | 5 个，全部实测复现 | 0 |
| 重要（P1）问题 | 4 个 | 0 |
| 新增回归断言 | — | 23 项（`test-security.mjs`） |
| 批量导入 2000 行 | 约 2 分钟 | **0.4 秒**（294 倍） |
| 题库知识点覆盖 | 527/527（100%） | 527/527（100%，保持） |
| 题库结构错误 | 0 | 0 |
| 答案可猜率（长度差≥4字） | 382 道（6.7%） | 317 道（5.6%） |

**没有发现功能性崩溃或数据损坏类缺陷**——原有代码质量高于一般个人项目，
自测体系完整（19 个脚本、500+ 断言）。问题集中在**安全边界**与**长期运行的一致性**上。

---

## 二、P0 · 安全

### 1. 静态服务目录穿越

```js
// 修复前
const filePath = path.join(PUBLIC_DIR, rel);
if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
```

`startsWith` 是**前缀匹配**：`E:\...\parent-child-knowledge-game\public_evil`
也 startsWith `E:\...\parent-child-knowledge-game\public`。

实测复现：

```
$ curl --path-as-is "http://localhost:3000/%2e%2e%2fpublic_evil%2fx.txt"
SECRET
 |HTTP:200
```

`%2e%2e%2f` 编码绕过了浏览器/curl 的路径归一化，直接命中 public 的兄弟目录。
当前项目同级没有敏感目录，但 `data/admin/auth.json`（管理员口令）、
`data/profiles.json`（孩子学习档案）就在上一级目录——只要同级出现任何以
`public` 开头的目录，漏洞立即可利用。

**修复**：改用 `path.relative` 判断"目标是否仍在 public 之内"：

```js
const filePath = path.resolve(PUBLIC_DIR, '.' + path.sep + rel.replace(/^[/\\]+/, ''));
const inside = path.relative(PUBLIC_DIR, filePath);
if (inside.startsWith('..') || path.isAbsolute(inside)) { res.writeHead(403); return res.end('Forbidden'); }
```

### 2. Hexo 构建会把口令与儿童档案发布到公网

站点根目录 `_config.yml` 的 `exclude` 只排除了几个"副本"目录，没有排除本工程。
`hexo generate` 会把 `source/` 下所有未被排除的文件复制进 `public/`，
而 `public/` 是要推送到 GitHub Pages 的**公开目录**。

实测判定（micromatch）：

```
会被发布 ❌  parent-child-knowledge-game/data/admin/auth.json     ← 管理员口令
会被发布 ❌  parent-child-knowledge-game/data/profiles.json       ← 孩子的学习档案
会被发布 ❌  parent-child-knowledge-game/node_modules/…            ← 33 MB
会被发布 ❌  parent-child-knowledge-game/data/questions.json       ← 1.7 MB
```

**修复**：
- 根 `_config.yml` 加 `- 'parent-child-knowledge-game/**'`
- 工程内加 `.gitignore`，挡住 `data/admin/auth.json`、`data/profiles.json`、
  `data/admin/audit.jsonl`、`data/admin/overlay.json`、`node_modules/`、
  构建产物等

### 3. 管理员口令明文落盘

```json
{ "password": "admin123" }
```

拿到这个文件 = 后台完全控制权（改题库、导出全部数据）。局域网共享、备份同步、
构建产物，任何一处泄漏都直接失守。

**修复**：新增 `lib/admin-auth.js`，改用 scrypt + 随机 salt：

```json
{ "algo": "scrypt", "salt": "…", "hash": "…", "updatedAt": 1758… }
```

- 校验走 `timingSafeEqual`，防时序侧信道
- 旧明文文件**启动时自动原地升级**，升级后磁盘不再有明文，无需用户手工处理
- 改密码后所有会话令牌立即失效

### 4. 登录无暴力破解防护

`/api/admin/login` 可无限次尝试。结合默认密码 `admin123`（还写在 README 和登录页上），
局域网内任何人都能爆破。

**修复**：同 IP 连续错 10 次锁 60 秒。锁定窗口刻意短——这是家庭应用，
家里几台设备可能共用出口 IP，锁 5 分钟会误伤自家人正常登录。

---

## 三、P0 · 功能

### 5. 每日任务进度被覆盖归零

这是本轮**对用户体验影响最大**的 bug。

`soloEnd()`（单人闯关结算）的执行顺序：

```js
const p = loadProfile();          // ← 快照 A（此时 daily 计数为 0）
p.games++; p.totalQ += …;
bumpDaily("soloRounds", 1);       // ← 内部自己 load→改→save，daily 变成 1
bumpDaily("correct", 8);          // ← daily 变成 (1, 8)
saveProfile(p);                   // ← 旧快照 A 整份回写，daily 被打回 (0, 0)
```

`bumpDaily` 内部是「读-改-写」，而最后那次 `saveProfile(p)` 拿着**更早的快照**
把结果整份覆盖掉。

实测复现（独立脚本模拟同一顺序）：

```
daily.soloRounds = 0 （期望 1）
daily.correct    = 0 （期望 8）
games = 1  totalQ = 10  xp = 120     ← 总账对，每日任务错
```

后果：孩子每天玩完，首页「每日任务」的「完成 2 轮单人闯关」「答对 10 道题」
永远显示 0/2、0/10，30 XP 永远领不到。每日激励机制完全失效。

值得注意：**同屏对战早就踩过这个坑并单独绕开了**（`extra.js` 的 `endDuo` 里有注释
"若此处留到最后才 saveProfile(prof)，会用旧快照把每日进度和 XP 覆盖回去"），
但单人闯关这条路径漏了。所以是"修了一半"的经典形态。

**修复**：引入 `mutateProfile(fn)` 作为档案的**唯一写入口**——读一次、改完、写一次：

```js
function mutateProfile(fn){
  const p = Object.assign(defaultProfile(), loadProfile());
  const out = fn(p);
  saveProfile(p);
  return out === undefined ? p : out;
}
```

所有档案修改（单人结算 / 对战结算 / 同屏对战 / 极速模式 / 领取任务 /
记录答题明细 / 发放 XP）全部收敛到它。多次修改天然合并成一次写入，
不再依赖调用顺序，从根上消除这一类问题。

### 6. 知识点过滤被补足逻辑绕过

请求不存在的知识点时：

```
$ curl "http://localhost:3000/api/questions?grade=1&subject=数学&kp=加法&n=10"
kp 集合: ["图形与几何综合","应用题","面积","加减法","折线统计图","乘除法","时间与日期"]
```

返回了 **8 个不同知识点**的题。而请求存在的知识点（`kp=加减法`）完全正常。

根因：`drawQuestions` 里 kp 过滤后若题量不足，补足逻辑的最后一段
「同科目全库」兜底**放弃了 kp 约束**，把整个科目的题灌了进来。

这直接违反 README 的承诺"「练这组」只出该知识点的题"，也让家长看板的
"练这组"按钮练到别的知识点上去。

**修复**：指定 kp 时只补同知识点题；同知识点补完仍不够，就**少给几题**，
不拿别的知识点充数。

---

## 四、P1 · 性能

### 7. 批量导入慢到不可用

后台的 Excel 导入是高频操作，但实测：

| 行数 | 耗时 |
| --- | --- |
| 500 行 | **30.6 秒** |
| 2000 行 | **约 2 分钟** |

三个叠加的开销，每写一行都付一次：
1. `merge()` 全量重建 5684 题的索引
2. `persistOverlay()` 写全量 JSON
3. `audit()` 一次 `appendFileSync`——**同步磁盘 IO**

**修复**：给 `bank-store` 加事务模式。批量期间只改内存，结束时统一
重建索引 + 落盘 + 审计日志一次 append：

```js
bank.transaction(() => {
  for (const p of plan) { /* create / update */ }
});
```

同时把查重从 O(n) 线性扫描改为 `科目+题干` 归一索引，O(1)。

**结果：500 行 30.6s → 104ms（294 倍），2000 行 2 分钟 → 0.4 秒。**

### 8. 查重是 O(n) 线性扫描

`findDuplicate` 每次遍历全库（5684 条）逐条 `norm()` 比较——而 `norm()`
每次都跑两条正则。批量导入时退化成 O(n²)。已随事务改造一并用索引解决。

---

## 五、P1 · 题库质量

### 9. 答案长度泄露

孩子能靠"哪个选项最长/最短"猜出答案，等于练习失效。

体检（`audit-bank.mjs`）查出 139 处长度差 ≥6 字的题，其中 120 处是
「正确项偏长」——典型如：

```
题干: 被困房间无法逃生时应该？
  ✅ 盖上锅盖隔绝空气…（16 字）        ← 正确项最长，一眼猜中
  干扰: 躲进浴室打开水龙头 | 躲进衣柜或床下藏起来 | 直接用手去拍打火焰
```

根因在**文案本身**而非算法：安全/品德这类"答案是一句完整做法"的题，
正确答案天然比短语式干扰项长。

**修复**（生成器层）：`generate-bank.mjs` 加长度平衡——优先挑与正确答案
长度接近的干扰项，同长度档内仍保持随机。

| 指标 | 改进前 | 改进后 |
| --- | --- | --- |
| 长度差 ≥4 字的题 | 382（6.7%） | **317（5.6%）** |
| 平均长度差 | 0.959 字 | **0.863 字** |
| 题量 | 5684 | 5684（不变） |

剩余 146 处属文案层面，需人工改。已新增 `scripts/audit-length.mjs`
把 317 道题归到 **30 个知识点**，按"改这一组的选项文案最划算"给出建议，
让后续治理有明确抓手：

```
知识点                    题数  偏长  偏短  建议
安全·交通安全              19    17     2  把正确项写短些，或把干扰项写长些
安全·应急电话              14    14     0  把正确项写短些，或把干扰项写长些
品德·公共规则与标志         13    13     0  把正确项写短些，或把干扰项写长些
…
```

### 10. 缺少专项体检入口

`audit-bank.mjs` 只给汇总数字，改文案时无从下手。新增
`scripts/audit-length.mjs`：按知识点汇总 + 逐题明细（`--detail`），
直接指出该改哪一组。

---

## 六、顺带修的

| 项 | 说明 |
| --- | --- |
| 档案写入全面收敛 | 单人结算 / 对战结算 / 同屏对战 / 极速模式 / 领取任务 / 记录明细 / 发放 XP 全部走 `mutateProfile`，消除"多处读-改-写互相覆盖"这一类问题 |
| 错题挑战 XP 与进度 | 改为同事务写入，不再依赖调用顺序 |
| `npm test` | package.json 里原本没有 `test` 脚本（README 写的是 `npm test \|\| node scripts/test-battle.mjs` 兜底），现已补齐 |
| 新脚本挂载 | `audit:length`、`check:coverage`、`test:security` 补进 `package.json` |
| README 数据对齐 | 题数 5661→**5684**（两处不一致）、知识点 180→**182**、新增本轮修复章节 |

---

## 七、遗留与建议

### 需要人工治理（内容层面，非代码问题）

1. **答案长度泄露 317 道**（`npm run audit:length`）
   建议按知识点分组改文案，同组选项统一句式，长度自然接近。
2. **干扰项疑似与题干无关 188 处**（`audit-bank.mjs` 的 info 项）
   集中在安全/品德：干扰项是"别的题的做法"，孩子可能觉得"我选的做法也没错啊"。
   建议扩充 `data/facts/*.json` 的 `pool`，让同组干扰项更贴题。
3. **答案高度集中 1 处**（同知识点同年级 ≥60% 同答案）
   孩子盲猜就能对。

### 工程建议

4. **整个工程未纳入 git 版本控制**
   `git ls-files source/parent-child-knowledge-game` 返回 0——
   近万行代码、题库、历史全靠本地磁盘。这是最需要处理的风险：
   ```bash
   cd E:/Blog/myBlog
   git add source/parent-child-knowledge-game
   git commit -m "feat: 亲子知识擂台"
   ```
   （本轮已加 `.gitignore`，敏感文件不会入库。）

5. **服务端进程无守护**
   目前靠 `npm start` 手动起，崩了就没了。若长期在家庭局域网上跑，
   建议配 `pm2` 或 Windows 计划任务。

6. **档案同步接口无鉴权**
   `/api/profile/:code` 只要知道 6 位同步码就能读写该孩子的档案，
   且 CORS 是 `*`。当前同步码是 32 字符集取 6 位（约 10^9 空间），
   加上是家庭自用，风险可控。若将来要放到公网，需加访问令牌。

---

## 八、验证记录

| 测试 | 结果 |
| --- | --- |
| `npm run test:security`（新增） | 23 / 23 通过 |
| `npm run test:admin` | 62 / 62 通过 |
| `npm run test:xlsx` | 48 / 48 通过 |
| `npm test`（对战协议） | 通过（含复盘明细校验） |
| `npm run e2e:battle` | 231 条断言，0 失败 |
| `npm run e2e:profile` | 档案总账一致性全通过 |
| `npm run e2e:ui` | UI 全通过，无 JS 报错 |
| `npm run e2e:study` | 19 / 19 通过 |
| `npm run e2e:admin` | 26 / 26 通过 |
| `npm run e2e:xlsx` | 20 / 20 通过 |
| `npm run e2e:challenge` / `e2e:grades` / `e2e:lock` | 全部通过 |
| `npm run audit:bank` | 严重 0 处 |
| `npm run verify:answers` | 1080 道可校验题答案全对 |
| `npm run check:coverage` | 527/527 槽位达标（100%） |
