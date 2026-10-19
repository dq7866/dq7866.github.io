# 🎮 欢乐游戏盒 · 23 款免费休闲小游戏合集

永久免费、无广告、无内购、无需注册的休闲小游戏合集，纯 HTML/CSS/JavaScript 实现，打开即玩。

## ✨ 核心特性

- **23 款游戏**：覆盖消除、数字、动作、策略、现代潮流、益智六大品类
- **零依赖运行**：物理引擎 matter.js 已本地化（`js/matter.min.js`），全部游戏离线可玩
- **账号系统**：注册登录、等级经验、金币、排行榜（数据存于 localStorage）
- **免登录也能玩**：金币、成就、每日任务、全局统计对未登录玩家同样生效
- **成就系统**：10+ 成就可解锁
- **每日任务**：每日刷新任务，完成获得金币奖励
- **道具商店**：用金币购买游戏道具
- **分类筛选 + 搜索**：首页按品类筛选、按名称实时搜索
- **音效系统**：Web Audio API 合成音效，支持音量调节
- **SEO 友好**：每页独立 description / canonical / Open Graph / sitemap / 结构化数据
- **响应式设计**：适配手机、平板、桌面浏览器，支持触摸 + 键盘操作

## 🎯 完整游戏列表

### 💎 经典消除（3 款）
| 游戏 | 文件 | 说明 |
|------|------|------|
| 💎 宝石消消乐 | `gem-match.html` | 华丽宝石三消，关卡递进 |
| 🍬 糖果消消乐 | `candy-match.html` | 可爱糖果三消，连击特效 |
| 🍎 水果消消乐 | `fruit-match.html` | 清新水果三消，休闲益智 |

### 🔢 经典数字（4 款）
| 游戏 | 文件 | 说明 |
|------|------|------|
| 🎯 2048 | `2048.html` | 数字合并，合成 2048 |
| 🧱 俄罗斯方块 | `tetris.html` | 经典方块消除 |
| 💣 扫雷 | `minesweeper.html` | 经典扫雷，三种难度 |
| 🧠 记忆翻牌 | `memory.html` | 翻牌配对，锻炼记忆 |

### 🎮 休闲动作（3 款）
| 游戏 | 文件 | 说明 |
|------|------|------|
| 🐍 贪吃蛇 | `snake.html` | 经典贪吃蛇，触屏支持 |
| 🧱 打砖块 | `breakout.html` | 打砖块，多关卡 |
| 🔨 打地鼠 | `whack.html` | 限时打地鼠，反应挑战 |

### ♟️ 策略对弈（3 款）
| 游戏 | 文件 | 说明 |
|------|------|------|
| 🔢 数独 | `sudoku.html` | 经典数独，多难度 |
| ⚫ 五子棋 | `gomoku.html` | 人机对弈五子棋 |
| ⭕ 井字棋 | `tictactoe.html` | 经典井字棋 |

### 🔥 现代潮流（8 款）
| 游戏 | 文件 | 说明 |
|------|------|------|
| 🍉 合成大西瓜 | `suika.html` | 物理引擎水果合成 |
| 🐦 Flappy Neon | `flappy.html` | 霓虹风格飞行躲避 |
| 🏗️ Stack Tower | `stack.html` | 精准堆塔，连击系统 |
| 🎵 节奏音游 | `rhythm.html` | 4 键下落式音游 |
| 👆 跳一跳 | `jump.html` | 蓄力跳跃，落点双倍分 |
| 🔪 飞刀 | `knife.html` | 旋转木桩投掷飞刀 |
| 🦘 涂鸦跳跃 | `doodle.html` | 无尽弹跳平台跳跃 |
| 🎨 颜色切换 | `color.html` | 色彩匹配穿越障碍 |

### 🧩 益智拼图（2 款）
| 游戏 | 文件 | 说明 |
|------|------|------|
| 🧩 数字拼图 | `puzzle.html` | 数字华容道 |
| 🫧 泡泡龙 | `bubble.html` | 泡泡射击消除 |

## 🚀 本地运行

直接双击 `index.html` 即可在浏览器中打开，或启动本地服务器：

```bash
# Python 3
python3 -m http.server 8080

# 或 Node.js
npx serve .
```

然后访问 http://localhost:8080

## 🌐 在线访问

- **正式站点**：<https://dq7866.online>
- 仓库：GitHub Pages 静态托管（自定义域名已在 `CNAME` 中固化）

## 🚀 部署到 GitHub Pages（自定义域名）

本项目已配置好自定义域名 `dq7866.online`，部署流程如下：

1. 将全部文件推送到 GitHub 仓库（分支 `main`）
2. 确认仓库根目录存在 `CNAME` 文件，内容为单行：
   ```
   dq7866.online
   ```
   > ⚠️ 这个文件是自定义域名的持久化配置。**不要删除**，否则每次重新部署后域名绑定可能失效。
3. 仓库 **Settings → Pages**：
   - Source 选 `Deploy from a branch`
   - Branch 选 `main`，目录选 `/ (root)`
   - Custom domain 填 `dq7866.online`，勾选 **Enforce HTTPS**
4. 在域名服务商处把 DNS 解析到 GitHub Pages：
   - `A` 记录 → `185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153`
   - （可选）`AAAA` 记录 → `2606:50c0:8000::153`、`2606:50c0:8001::153`、`2606:50c0:8002::153`、`2606:50c0:8003::153`
   - `www` 子域 → `CNAME` 记录指向 `<用户名>.github.io`
5. 等待 DNS 生效（通常几分钟到 24 小时），GitHub 会自动签发 HTTPS 证书

### 部署后自查清单

| 检查项 | 预期结果 |
|--------|----------|
| `https://dq7866.online/` | 正常打开游戏大厅 |
| `https://dq7866.online/CNAME` | 看到 `dq7866.online` |
| `https://dq7866.online/sitemap.xml` | 正常输出 24 条 URL |
| `https://dq7866.online/robots.txt` | 正常输出 |
| `https://dq7866.online/不存在的页面` | 显示自定义 404 页 |
| 分享链接到微信/微博 | 出现标题、描述与分享图 |

## 📦 项目结构

```
.
├── index.html              # 游戏大厅首页（分类筛选 + 搜索）
├── 404.html                # 自定义 404 页
├── CNAME                   # GitHub Pages 自定义域名（勿删！）
├── .nojekyll               # 跳过 Jekyll 构建
├── robots.txt              # 爬虫规则
├── sitemap.xml             # 站点地图（24 条 URL）
├── manifest.webmanifest    # PWA 清单（可安装到手机桌面）
├── favicon.ico             # 网站图标
├── favicon-32.png
├── apple-touch-icon.png    # iOS 桌面图标
├── icon-192.png / icon-512.png  # PWA 图标
├── og-image.png            # 社交分享图（1200×630）
├── js/
│   ├── common.js           # 公共模块（音效/用户/成就/任务/道具/统计）
│   └── matter.min.js       # 物理引擎（本地化，合成大西瓜使用）
├── gem-match.html          # 宝石消消乐
├── candy-match.html        # 糖果消消乐
├── fruit-match.html        # 水果消消乐
├── 2048.html               # 2048
├── tetris.html             # 俄罗斯方块
├── minesweeper.html        # 扫雷
├── memory.html             # 记忆翻牌
├── snake.html              # 贪吃蛇
├── breakout.html           # 打砖块
├── whack.html              # 打地鼠
├── sudoku.html             # 数独
├── gomoku.html             # 五子棋
├── tictactoe.html          # 井字棋
├── suika.html              # 合成大西瓜
├── flappy.html             # Flappy Neon
├── stack.html              # Stack Tower
├── rhythm.html             # 节奏音游
├── jump.html               # 跳一跳
├── knife.html              # 飞刀
├── doodle.html             # 涂鸦跳跃
├── color.html              # 颜色切换
├── puzzle.html             # 数字拼图
├── bubble.html             # 泡泡龙
├── README.md
└── .gitignore
```

## 🛠️ 技术栈

- **纯前端**：HTML5 + CSS3 + 原生 JavaScript（ES6+）
- **物理引擎**：matter.js（仅合成大西瓜使用，CDN 加载）
- **音效**：Web Audio API 实时合成
- **数据存储**：localStorage（账号、进度、设置）
- **无构建步骤**：无需编译，直接运行

## 📱 操作方式

| 设备 | 操作 |
|------|------|
| 手机 | 触摸屏幕 / 虚拟按键 |
| 电脑 | 鼠标点击 / 键盘方向键 / 空格键 |

每款游戏页面底部均有具体操作提示。

## 📄 开源协议

MIT License - 免费使用、修改、分发。
