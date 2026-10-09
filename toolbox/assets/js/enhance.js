/* ============================================================
   免费工具箱 · 全局增强
   主题切换 / 命令面板 / 快捷键 / 快捷键指南 / 帮助面板 / 设置面板 / 使用统计 / 首页排序 / 数据备份恢复 / 无障碍 / 版本号 / 预取加速
   ============================================================ */
(function () {
  "use strict";

  var APP_VERSION = "3.0.0";
  window.TBX_VERSION = APP_VERSION;

  var TOOLS = [
    { href: "index.html", name: "首页" },
    { href: "image-tools.html", name: "图片工具" },
    { href: "batch-image.html", name: "批量图片" },
    { href: "pdf-tools.html", name: "PDF 工具" },
    { href: "qr-tools.html", name: "二维码" },
    { href: "sheet-tools.html", name: "表格" },
    { href: "color-tools.html", name: "颜色" },
    { href: "random-tools.html", name: "密码 / 随机" },
    { href: "password-safe.html", name: "密码保险箱" },
    { href: "md-tools.html", name: "Markdown" },
    { href: "notes.html", name: "快速笔记" },
    { href: "av-tools.html", name: "音视频" },
    { href: "player.html", name: "播放器" },
    { href: "file-tools.html", name: "文件处理" },
    { href: "ocr-tools.html", name: "OCR 识别" },
    { href: "idphoto-tools.html", name: "证件照" },
    { href: "tts-tools.html", name: "文字转语音" },
    { href: "capture-tools.html", name: "录屏" },
    { href: "asr-tools.html", name: "语音转文字" },
    { href: "calculator.html", name: "计算器" },
    { href: "timestamp-tools.html", name: "时间戳" },
    { href: "json-tools.html", name: "JSON 格式化" },
    { href: "regex-tools.html", name: "正则测试" },
    { href: "encode-tools.html", name: "编码转换" },
    { href: "diff-tools.html", name: "文本对比" },
    { href: "chart-tools.html", name: "图表生成" },
    { href: "pomodoro.html", name: "番茄钟" },
    { href: "clipboard-tools.html", name: "剪贴板" },
    { href: "ai-tools.html", name: "AI 助手" },
    { href: "game-moyu.html", name: "工位摸鱼" }
  ];

  /* ---------- 工具元信息（供命令面板使用，与 TOOLS 一一对应） ---------- */
  var TOOLS_META = [
    { href: "index.html",       name: "首页",       icon: "🏠", subtitle: "工具概览与快速入口",           keywords: ["首页", "主页", "shouye", "home"] },
    { href: "image-tools.html", name: "图片工具",   icon: "🖼️", subtitle: "压缩、转换、改尺寸、水印…",     keywords: ["图片", "压缩", "转换", "改尺寸", "水印", "tupian", "image"] },
    { href: "batch-image.html", name: "批量图片",   icon: "🖼️", subtitle: "多步骤图片批量处理工作流",      keywords: ["批量", "图片", "批量处理", "工作流", "改尺寸", "压缩", "piliang"] },
    { href: "pdf-tools.html",   name: "PDF 工具",   icon: "📄", subtitle: "合并、分割、转图片、转 Word",   keywords: ["pdf", "合并", "分割", "转换", "pdf工具"] },
    { href: "qr-tools.html",    name: "二维码",     icon: "📱", subtitle: "生成与解析二维码",              keywords: ["二维码", "qr", "生成", "解析", "扫码"] },
    { href: "sheet-tools.html", name: "表格",       icon: "📊", subtitle: "Excel/CSV 处理、转换、对比",    keywords: ["表格", "excel", "csv", "转换", "对比", "biaoge"] },
    { href: "color-tools.html", name: "颜色",       icon: "🎨", subtitle: "取色、调色板、渐变、对比",      keywords: ["颜色", "取色", "调色板", "渐变", "yanse", "color"] },
    { href: "random-tools.html",name: "密码 / 随机",icon: "🔐", subtitle: "密码生成、随机数、抽奖",        keywords: ["密码", "随机", "抽奖", "生成", "mima", "password"] },
    { href: "password-safe.html",name:"密码保险箱", icon: "🔒", subtitle: "本地加密密码管理 AES-256",      keywords: ["密码", "保险箱", "加密", "aes", "密码管理", "baoxianxiang"] },
    { href: "md-tools.html",    name: "Markdown",   icon: "📝", subtitle: "Markdown 编辑器与预览",         keywords: ["markdown", "md", "编辑", "预览", "markdown工具"] },
    { href: "notes.html",       name: "快速笔记",   icon: "📝", subtitle: "轻量笔记与 Markdown 预览",      keywords: ["笔记", "快速笔记", "markdown", "便签", "bij", "notes"] },
    { href: "av-tools.html",    name: "音视频",     icon: "🎬", subtitle: "视频剪辑、音频处理、格式转换",  keywords: ["音视频", "视频", "音频", "剪辑", "转换", "yinshipin"] },
    { href: "player.html",      name: "播放器",     icon: "▶️", subtitle: "音视频播放器与播放列表",        keywords: ["播放器", "播放", "player", "bofangqi"] },
    { href: "file-tools.html",  name: "文件处理",   icon: "📁", subtitle: "文件重命名、批量处理、哈希",    keywords: ["文件", "重命名", "批量", "哈希", "wenjian", "file"] },
    { href: "ocr-tools.html",   name: "OCR 识别",   icon: "🔍", subtitle: "图片文字识别、提取",            keywords: ["ocr", "识别", "文字提取", "图片文字", "shibie"] },
    { href: "idphoto-tools.html",name:"证件照",     icon: "🪪", subtitle: "证件照制作、换底色、改尺寸",    keywords: ["证件照", "身份证", "照片", "底色", "zhengjianzhao"] },
    { href: "tts-tools.html",   name: "文字转语音", icon: "🔊", subtitle: "文本转语音、多音色选择",        keywords: ["文字转语音", "tts", "语音", "朗读", "wenziyuyin"] },
    { href: "capture-tools.html",name:"录屏",       icon: "🎥", subtitle: "屏幕录制与截图",                keywords: ["录屏", "截图", "录制", "luping", "capture"] },
    { href: "asr-tools.html",   name: "语音转文字", icon: "🎤", subtitle: "语音识别、音频转文字",          keywords: ["语音转文字", "asr", "识别", "语音", "yuyinzhuanwenzi"] },
    { href: "calculator.html",  name: "计算器",     icon: "🧮", subtitle: "科学计算器与单位换算",          keywords: ["计算器", "计算", "单位换算", "jisuanqi", "calculator"] },
    { href: "timestamp-tools.html",name:"时间戳",   icon: "🕐", subtitle: "Unix 时间戳与日期互转",          keywords: ["时间戳", "timestamp", "unix", "日期转换", "shijianchuo"] },
    { href: "json-tools.html",  name: "JSON 格式化",icon: "📋", subtitle: "JSON 格式化/校验/YAML 互转",    keywords: ["json", "格式化", "压缩", "校验", "yaml", "json工具"] },
    { href: "regex-tools.html", name: "正则测试",   icon: "🔍", subtitle: "正则表达式实时测试与高亮",      keywords: ["正则", "regex", "正则表达式", "测试", "替换", "zhengze"] },
    { href: "encode-tools.html",name: "编码转换",   icon: "🔐", subtitle: "Base64/URL/Unicode/哈希",      keywords: ["编码", "base64", "url", "unicode", "md5", "sha", "哈希", "bianma"] },
    { href: "diff-tools.html",  name: "文本对比",   icon: "✂️", subtitle: "两段文本差异对比",              keywords: ["对比", "diff", "差异", "文本对比", "duibi"] },
    { href: "chart-tools.html", name: "图表生成",   icon: "📊", subtitle: "柱状图/折线图/饼图/雷达图",     keywords: ["图表", "chart", "柱状图", "折线图", "饼图", "雷达图", "tubiao"] },
    { href: "pomodoro.html",    name: "番茄钟",     icon: "🍅", subtitle: "专注计时器与统计",              keywords: ["番茄钟", "pomodoro", "专注", "计时", "效率", "fanqiezhong"] },
    { href: "clipboard-tools.html",name:"剪贴板",   icon: "📋", subtitle: "剪贴板历史与文本处理",          keywords: ["剪贴板", "clipboard", "复制", "粘贴", "历史", "jiantieban"] },
    { href: "ai-tools.html",    name: "AI 助手",    icon: "🤖", subtitle: "50+ 提示词模板库",               keywords: ["ai", "提示词", "prompt", "写作", "翻译", "midjourney", "ai助手"] },
    { href: "game-moyu.html",   name: "工位摸鱼",   icon: "🎮", subtitle: "小游戏与摸鱼神器",              keywords: ["游戏", "摸鱼", "小游戏", "moyu", "game"] }
  ];

  /* ---------------- 主题 ---------------- */

  // 系统主题变化监听器相关变量
  var _autoMql = null;
  var _autoHandler = null;

  // 返回 localStorage 中存储的原始主题值: "light" | "dark" | "auto"
  // 默认为 "auto"（跟随系统）
  function rawTheme() {
    try {
      var s = localStorage.getItem("tbx-theme");
      if (s === "light" || s === "dark" || s === "auto") return s;
    } catch (e) {}
    return "auto";
  }

  // 返回当前生效的主题: "light" | "dark"
  // 当 rawTheme 为 "auto" 时，根据系统偏好解析
  function curTheme() {
    var raw = rawTheme();
    if (raw === "auto") {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return raw;
  }

  // 安装或卸载系统主题变化监听器
  function setupAutoListener(enable) {
    if (!window.matchMedia) return;

    if (enable) {
      if (_autoHandler) return; // 已经安装
      _autoMql = window.matchMedia("(prefers-color-scheme: dark)");
      _autoHandler = function () {
        if (rawTheme() === "auto") {
          // 系统主题变化时，重新应用生效主题
          var effective = curTheme();
          document.documentElement.setAttribute("data-theme", effective);
          // 按钮保持 🔄 图标，因为仍然处于 auto 模式
          // 同步更新设置面板中的单选状态
          syncSettingsThemeRadio();
        }
      };
      _autoMql.addEventListener("change", _autoHandler);
    } else {
      if (!_autoHandler) return; // 未安装
      if (_autoMql) {
        _autoMql.removeEventListener("change", _autoHandler);
        _autoMql = null;
      }
      _autoHandler = null;
    }
  }

  // 切换到下一个主题状态：dark → light → auto → dark
  function nextTheme() {
    var raw = rawTheme();
    if (raw === "dark") return "light";
    if (raw === "light") return "auto";
    return "dark"; // auto -> dark
  }

  function applyTheme(raw, persist) {
    var effective = raw === "auto" ? curTheme() : raw;
    document.documentElement.setAttribute("data-theme", effective);
    if (persist) { try { localStorage.setItem("tbx-theme", raw); } catch (e) {} }

    // 管理系统主题变化监听器
    setupAutoListener(raw === "auto");

    // 更新切换按钮：图标表示当前状态
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      if (raw === "auto") {
        b.textContent = "🔄";
        b.setAttribute("aria-label", "跟随系统主题");
        b.setAttribute("title", "跟随系统主题（快捷键 T）");
      } else if (raw === "dark") {
        b.textContent = "☾";
        b.setAttribute("aria-label", "深色模式");
        b.setAttribute("title", "深色模式（快捷键 T）");
      } else {
        b.textContent = "☀";
        b.setAttribute("aria-label", "浅色模式");
        b.setAttribute("title", "浅色模式（快捷键 T）");
      }
    });

    // 同步设置面板中的主题单选按钮
    syncSettingsThemeRadio();
  }

  /* ---------------- 命令面板 ---------------- */

  // 当前页面快速操作
  function getQuickActions() {
    var page = location.pathname.split("/").pop() || "index.html";
    var actions = [];

    // 通用操作（所有页面都有）
    actions.push({
      id: "action-toggle-theme",
      title: "切换主题",
      subtitle: "浅色 / 深色 / 跟随系统",
      icon: "🎨",
      action: function () {
        applyTheme(nextTheme(), true);
      },
      keywords: ["主题", "深色", "浅色", "模式", "zhuti", "theme", "dark", "light"]
    });

    actions.push({
      id: "action-open-settings",
      title: "打开设置",
      subtitle: "主题、数据备份与恢复",
      icon: "⚙️",
      action: function () {
        openSettings();
      },
      keywords: ["设置", "配置", "备份", "恢复", "导出", "导入", "shezhi", "settings"]
    });

    actions.push({
      id: "action-open-help",
      title: "打开快捷键指南",
      subtitle: "查看所有快捷键说明",
      icon: "❓",
      action: function () {
        openShortcutGuide();
      },
      keywords: ["帮助", "快捷键", "说明", "help", "bangzhu"]
    });

    actions.push({
      id: "action-go-home",
      title: "回到首页",
      subtitle: "返回工具首页",
      icon: "🏠",
      action: function () { location.href = "index.html"; },
      keywords: ["首页", "主页", "返回", "shouye", "home"]
    });

    // 页面特定操作
    var pageActions = {
      "index.html": [
        {
          id: "action-view-all-tools",
          title: "查看所有工具",
          subtitle: "浏览全部工具箱",
          icon: "🧰",
          action: function () {
            var cards = document.querySelector(".cards");
            if (cards) cards.scrollIntoView({ behavior: "smooth" });
          },
          keywords: ["所有工具", "全部", "浏览", "suoyou", "all tools"]
        }
      ],
      "image-tools.html": [
        {
          id: "action-image-compress",
          title: "压缩图片",
          subtitle: "减小图片文件大小",
          icon: "🗜️",
          action: function () { switchTab("压缩"); },
          keywords: ["压缩", "compress", "yasuo", "减小体积"]
        },
        {
          id: "action-image-resize",
          title: "改尺寸",
          subtitle: "调整图片宽高",
          icon: "📐",
          action: function () { switchTab("改尺寸"); },
          keywords: ["尺寸", "大小", "resize", "gaichicun", "宽度", "高度"]
        },
        {
          id: "action-image-convert",
          title: "格式转换",
          subtitle: "JPG / PNG / WebP / GIF 互转",
          icon: "🔄",
          action: function () { switchTab("格式转换"); },
          keywords: ["转换", "格式", "convert", "zhuanhuan", "jpg", "png", "webp", "gif"]
        },
        {
          id: "action-image-watermark",
          title: "添加水印",
          subtitle: "给图片加水印",
          icon: "💧",
          action: function () { switchTab("水印"); },
          keywords: ["水印", "watermark", "shuiyin"]
        },
        {
          id: "action-image-crop",
          title: "裁剪图片",
          subtitle: "按比例或自由裁剪",
          icon: "✂️",
          action: function () { switchTab("裁剪"); },
          keywords: ["裁剪", "crop", "caijian"]
        },
        {
          id: "action-image-rotate",
          title: "旋转 / 翻转",
          subtitle: "旋转图片或镜像翻转",
          icon: "🔃",
          action: function () { switchTab("旋转"); },
          keywords: ["旋转", "翻转", "rotate", "xuanzhuan", "镜像"]
        }
      ],
      "pdf-tools.html": [
        {
          id: "action-pdf-merge",
          title: "合并 PDF",
          subtitle: "多个 PDF 合成一个",
          icon: "📎",
          action: function () { switchTab("合并"); },
          keywords: ["合并", "merge", "hebing"]
        },
        {
          id: "action-pdf-split",
          title: "分割 PDF",
          subtitle: "一个 PDF 拆成多个",
          icon: "✂️",
          action: function () { switchTab("分割"); },
          keywords: ["分割", "拆分", "split", "fenge"]
        },
        {
          id: "action-pdf-to-image",
          title: "PDF 转图片",
          subtitle: "PDF 页面导出为图片",
          icon: "🖼️",
          action: function () { switchTab("转图片"); },
          keywords: ["转图片", "pdf转图片", "to image", "zhuantupian"]
        },
        {
          id: "action-pdf-compress",
          title: "压缩 PDF",
          subtitle: "减小 PDF 文件大小",
          icon: "🗜️",
          action: function () { switchTab("压缩"); },
          keywords: ["压缩", "compress", "yasuo"]
        }
      ],
      "qr-tools.html": [
        {
          id: "action-qr-generate",
          title: "生成二维码",
          subtitle: "输入文本生成二维码",
          icon: "➕",
          action: function () { switchTab("生成"); },
          keywords: ["生成", "generate", "shengcheng"]
        },
        {
          id: "action-qr-parse",
          title: "解析二维码",
          subtitle: "上传图片识别二维码内容",
          icon: "🔍",
          action: function () { switchTab("解析"); },
          keywords: ["解析", "识别", "parse", "jiexi"]
        }
      ],
      "color-tools.html": [
        {
          id: "action-color-picker",
          title: "取色器",
          subtitle: "从图片或屏幕取色",
          icon: "💉",
          action: function () { switchTab("取色"); },
          keywords: ["取色", "picker", "quse"]
        },
        {
          id: "action-color-palette",
          title: "调色板",
          subtitle: "生成和谐配色方案",
          icon: "🎨",
          action: function () { switchTab("调色板"); },
          keywords: ["调色板", "配色", "palette", "tiaoseban"]
        },
        {
          id: "action-color-gradient",
          title: "渐变生成",
          subtitle: "生成 CSS 渐变色",
          icon: "🌈",
          action: function () { switchTab("渐变"); },
          keywords: ["渐变", "gradient", "jianbian"]
        }
      ],
      "random-tools.html": [
        {
          id: "action-random-password",
          title: "密码生成器",
          subtitle: "生成随机安全密码",
          icon: "🔑",
          action: function () { switchTab("密码"); },
          keywords: ["密码", "password", "mima"]
        },
        {
          id: "action-random-number",
          title: "随机数生成",
          subtitle: "生成指定范围随机数",
          icon: "🎲",
          action: function () { switchTab("随机数"); },
          keywords: ["随机数", "number", "suijishu"]
        },
        {
          id: "action-random-lottery",
          title: "抽奖 / 点名",
          subtitle: "随机抽取幸运者",
          icon: "🎯",
          action: function () { switchTab("抽奖"); },
          keywords: ["抽奖", "点名", "lottery", "choujiang"]
        }
      ],
      "md-tools.html": [
        {
          id: "action-md-preview",
          title: "切换预览模式",
          subtitle: "编辑 / 预览 / 分屏",
          icon: "👁️",
          action: function () { switchTab("预览"); },
          keywords: ["预览", "preview", "yulan"]
        }
      ],
      "av-tools.html": [
        {
          id: "action-av-trim",
          title: "视频剪辑",
          subtitle: "裁剪视频片段",
          icon: "✂️",
          action: function () { switchTab("剪辑"); },
          keywords: ["剪辑", "裁剪", "trim", "jianji"]
        },
        {
          id: "action-av-convert",
          title: "格式转换",
          subtitle: "音视频格式互转",
          icon: "🔄",
          action: function () { switchTab("转换"); },
          keywords: ["转换", "格式", "convert", "zhuanhuan"]
        },
        {
          id: "action-av-extract",
          title: "提取音频",
          subtitle: "从视频中提取音频",
          icon: "🎵",
          action: function () { switchTab("提取音频"); },
          keywords: ["提取音频", "音频", "extract audio", "tiquyinpin"]
        }
      ],
      "file-tools.html": [
        {
          id: "action-file-rename",
          title: "批量重命名",
          subtitle: "批量修改文件名",
          icon: "📝",
          action: function () { switchTab("重命名"); },
          keywords: ["重命名", "rename", "chongmingming"]
        },
        {
          id: "action-file-hash",
          title: "哈希校验",
          subtitle: "计算文件 MD5/SHA 哈希",
          icon: "🔒",
          action: function () { switchTab("哈希"); },
          keywords: ["哈希", "hash", "md5", "sha", "haxi"]
        }
      ],
      "calculator.html": [
        {
          id: "action-calc-scientific",
          title: "科学计算器",
          subtitle: "高级数学计算",
          icon: "🔬",
          action: function () { switchTab("科学"); },
          keywords: ["科学", "科学计算", "scientific", "kexue"]
        },
        {
          id: "action-calc-converter",
          title: "单位换算",
          subtitle: "长度/重量/温度等换算",
          icon: "📏",
          action: function () { switchTab("换算"); },
          keywords: ["单位换算", "换算", "converter", "danweisuan"]
        }
      ],
      "sheet-tools.html": [
        {
          id: "action-sheet-convert",
          title: "格式转换",
          subtitle: "Excel / CSV / JSON 互转",
          icon: "🔄",
          action: function () { switchTab("转换"); },
          keywords: ["转换", "格式", "convert", "excel", "csv", "json", "zhuanhuan"]
        },
        {
          id: "action-sheet-compare",
          title: "表格对比",
          subtitle: "对比两个表格的差异",
          icon: "🔍",
          action: function () { switchTab("对比"); },
          keywords: ["对比", "差异", "compare", "duibi", "diff"]
        }
      ],
      "ocr-tools.html": [
        {
          id: "action-ocr-image",
          title: "图片识别",
          subtitle: "从图片中提取文字",
          icon: "📝",
          action: function () { switchTab("图片识别"); },
          keywords: ["识别", "图片文字", "ocr", "shibie", "tupian"]
        }
      ],
      "idphoto-tools.html": [
        {
          id: "action-idphoto-make",
          title: "制作证件照",
          subtitle: "生成标准尺寸证件照",
          icon: "🪪",
          action: function () { switchTab("制作"); },
          keywords: ["证件照", "制作", "zhengjianzhao", "id photo"]
        },
        {
          id: "action-idphoto-bg",
          title: "换底色",
          subtitle: "更换证件照背景颜色",
          icon: "🎨",
          action: function () { switchTab("换底色"); },
          keywords: ["底色", "背景", "背景色", "dise", "background"]
        }
      ],
      "tts-tools.html": [
        {
          id: "action-tts-speak",
          title: "文字转语音",
          subtitle: "输入文本生成语音",
          icon: "🔊",
          action: function () { switchTab("朗读"); },
          keywords: ["语音", "朗读", "tts", "yuyin", "langdu", "text to speech"]
        }
      ],
      "capture-tools.html": [
        {
          id: "action-capture-screen",
          title: "屏幕录制",
          subtitle: "录制屏幕视频",
          icon: "🎥",
          action: function () { switchTab("录屏"); },
          keywords: ["录屏", "录制", "屏幕", "luping", "screen recording"]
        },
        {
          id: "action-capture-screenshot",
          title: "截图",
          subtitle: "截取屏幕画面",
          icon: "📸",
          action: function () { switchTab("截图"); },
          keywords: ["截图", "截屏", "screenshot", "jietu"]
        }
      ],
      "asr-tools.html": [
        {
          id: "action-asr-audio",
          title: "语音转文字",
          subtitle: "音频文件转文字",
          icon: "🎤",
          action: function () { switchTab("音频识别"); },
          keywords: ["识别", "语音", "转文字", "asr", "yuyin", "shibie", "speech to text"]
        }
      ],
      "player.html": [
        {
          id: "action-player-play",
          title: "播放/暂停",
          subtitle: "控制音视频播放",
          icon: "▶️",
          action: function () {
            var v = document.querySelector("video, audio");
            if (v) { if (v.paused) v.play(); else v.pause(); }
          },
          keywords: ["播放", "暂停", "play", "pause", "bofang"]
        }
      ],
      "timestamp-tools.html": [
        {
          id: "action-ts-to-date",
          title: "时间戳转日期",
          subtitle: "Unix 时间戳转换为可读日期",
          icon: "📅",
          action: function () { switchTab("时间戳转日期"); },
          keywords: ["时间戳", "转日期", "timestamp", "shijianchuo"]
        },
        {
          id: "action-date-to-ts",
          title: "日期转时间戳",
          subtitle: "日期转换为 Unix 时间戳",
          icon: "🕐",
          action: function () { switchTab("日期转时间戳"); },
          keywords: ["日期", "转时间戳", "date to timestamp", "riqi"]
        },
        {
          id: "action-ts-now",
          title: "获取当前时间戳",
          subtitle: "一键获取当前 Unix 时间戳",
          icon: "⚡",
          action: function () {
            var btn = document.getElementById("tsNowBtn");
            if (btn) btn.click();
          },
          keywords: ["当前", "现在", "now", "dangqian"]
        },
        {
          id: "action-ts-reference",
          title: "常用时间参考",
          subtitle: "查看常用时间戳参考表",
          icon: "📋",
          action: function () { switchTab("常用时间参考"); },
          keywords: ["参考", "常用", "reference", "cankao"]
        }
      ],
      "regex-tools.html": [
        {
          id: "action-regex-tester",
          title: "测试正则",
          subtitle: "实时测试正则表达式匹配",
          icon: "🔍",
          action: function () { switchTab("正则测试"); },
          keywords: ["测试", "匹配", "tester", "ceshi", "pipei"]
        },
        {
          id: "action-regex-library",
          title: "常用正则库",
          subtitle: "浏览常用正则表达式模板",
          icon: "📚",
          action: function () { switchTab("常用正则库"); },
          keywords: ["正则库", "模板", "library", "moban", "changyong"]
        },
        {
          id: "action-regex-replace",
          title: "替换工具",
          subtitle: "正则表达式查找替换",
          icon: "🔄",
          action: function () { switchTab("替换工具"); },
          keywords: ["替换", "replace", "tihuan"]
        },
        {
          id: "action-regex-copy-result",
          title: "复制匹配结果",
          subtitle: "复制替换后的结果文本",
          icon: "📋",
          action: function () {
            var btn = document.getElementById("copyReplaceResult");
            if (btn) btn.click();
          },
          keywords: ["复制", "结果", "copy", "fuzhi", "jieguo"]
        }
      ],
      "json-tools.html": [
        {
          id: "action-json-format",
          title: "格式化 JSON",
          subtitle: "美化 JSON 代码格式",
          icon: "✨",
          action: function () { switchTab("格式化"); },
          keywords: ["格式化", "美化", "format", "gehua"]
        },
        {
          id: "action-json-minify",
          title: "压缩 JSON",
          subtitle: "压缩 JSON 减小体积",
          icon: "🗜️",
          action: function () { switchTab("格式化"); },
          keywords: ["压缩", "minify", "yasuo", "jianrong"]
        },
        {
          id: "action-json-to-yaml",
          title: "JSON 转 YAML",
          subtitle: "JSON 格式转换为 YAML",
          icon: "🔄",
          action: function () { switchTab("JSON 转 YAML"); },
          keywords: ["转yaml", "转换", "to yaml", "zhuanhuan"]
        },
        {
          id: "action-yaml-to-json",
          title: "YAML 转 JSON",
          subtitle: "YAML 格式转换为 JSON",
          icon: "🔄",
          action: function () { switchTab("YAML 转 JSON"); },
          keywords: ["yaml转", "转换", "to json", "zhuanhuan"]
        },
        {
          id: "action-json-validate",
          title: "校验 JSON",
          subtitle: "检查 JSON 语法是否正确",
          icon: "✅",
          action: function () { switchTab("JSON 校验"); },
          keywords: ["校验", "验证", "validate", "jiaoyan", "yanzheng"]
        }
      ],
      "encode-tools.html": [
        {
          id: "action-encode-base64-enc",
          title: "Base64 编码",
          subtitle: "文本编码为 Base64",
          icon: "🔐",
          action: function () { switchTab("Base64"); },
          keywords: ["base64", "编码", "encode", "bianma"]
        },
        {
          id: "action-encode-base64-dec",
          title: "Base64 解码",
          subtitle: "Base64 解码为文本",
          icon: "🔓",
          action: function () { switchTab("Base64"); },
          keywords: ["base64", "解码", "decode", "jiema"]
        },
        {
          id: "action-encode-url-enc",
          title: "URL 编码",
          subtitle: "URL 百分号编码",
          icon: "🔗",
          action: function () { switchTab("URL"); },
          keywords: ["url", "编码", "encode", "bianma"]
        },
        {
          id: "action-encode-url-dec",
          title: "URL 解码",
          subtitle: "URL 百分号解码",
          icon: "🔗",
          action: function () { switchTab("URL"); },
          keywords: ["url", "解码", "decode", "jiema"]
        },
        {
          id: "action-encode-hash",
          title: "计算哈希",
          subtitle: "计算 MD5/SHA 哈希值",
          icon: "#️⃣",
          action: function () { switchTab("哈希"); },
          keywords: ["哈希", "hash", "md5", "sha", "haxi"]
        }
      ],
      "pomodoro.html": [
        {
          id: "action-pomo-start-pause",
          title: "开始/暂停番茄钟",
          subtitle: "开始或暂停当前计时",
          icon: "▶️",
          action: function () {
            var btn = document.getElementById("startBtn");
            if (btn) btn.click();
          },
          keywords: ["开始", "暂停", "start", "pause", "kaishi", "zanting"]
        },
        {
          id: "action-pomo-reset",
          title: "重置计时器",
          subtitle: "重置当前番茄钟计时",
          icon: "🔄",
          action: function () {
            var btn = document.getElementById("resetBtn");
            if (btn) btn.click();
          },
          keywords: ["重置", "reset", "chongzhi"]
        },
        {
          id: "action-pomo-focus",
          title: "切换专注模式",
          subtitle: "切换到专注计时模式",
          icon: "🎯",
          action: function () {
            var tab = document.querySelector('.mode-tab[data-mode="focus"]');
            if (tab) tab.click();
          },
          keywords: ["专注", "focus", "zhuanzhu"]
        },
        {
          id: "action-pomo-short-break",
          title: "切换短休息",
          subtitle: "切换到短休息模式",
          icon: "☕",
          action: function () {
            var tab = document.querySelector('.mode-tab[data-mode="short"]');
            if (tab) tab.click();
          },
          keywords: ["短休息", "short break", "duanxiuxi"]
        },
        {
          id: "action-pomo-long-break",
          title: "切换长休息",
          subtitle: "切换到长休息模式",
          icon: "🌴",
          action: function () {
            var tab = document.querySelector('.mode-tab[data-mode="long"]');
            if (tab) tab.click();
          },
          keywords: ["长休息", "long break", "changxiuxi"]
        }
      ],
      "notes.html": [
        {
          id: "action-notes-new",
          title: "新建笔记",
          subtitle: "创建一篇新笔记",
          icon: "📝",
          action: function () {
            var btn = document.getElementById("newNoteBtn");
            if (btn) btn.click();
          },
          keywords: ["新建", "创建", "new", "xinjian", "chuangjian"]
        },
        {
          id: "action-notes-search",
          title: "搜索笔记",
          subtitle: "搜索笔记内容或标题",
          icon: "🔍",
          action: function () {
            var input = document.getElementById("searchInput");
            if (input) { input.focus(); input.select(); }
          },
          keywords: ["搜索", "查找", "search", "sousuo", "chazhao"]
        },
        {
          id: "action-notes-toggle-mode",
          title: "切换编辑/预览模式",
          subtitle: "在编辑和 Markdown 预览间切换",
          icon: "👁️",
          action: function () {
            var toggle = document.getElementById("modeToggle");
            if (toggle) toggle.click();
          },
          keywords: ["编辑", "预览", "模式", "edit", "preview", "bianji", "yulan"]
        },
        {
          id: "action-notes-export",
          title: "导出当前笔记",
          subtitle: "导出当前笔记为 .txt 文件",
          icon: "📤",
          action: function () {
            var btn = document.getElementById("exportBtn");
            if (btn) btn.click();
          },
          keywords: ["导出", "下载", "export", "daochu", "xiazai"]
        }
      ],
      "diff-tools.html": [
        {
          id: "action-diff-side-by-side",
          title: "并排对比视图",
          subtitle: "左右并排显示差异",
          icon: "⬛⬛",
          action: function () {
            var btn = document.querySelector('[data-v="side"]');
            if (btn) btn.click();
          },
          keywords: ["并排", "side by side", "bingpai", "对比视图"]
        },
        {
          id: "action-diff-unified",
          title: "合并视图",
          subtitle: "合并统一显示差异",
          icon: "📜",
          action: function () {
            var btn = document.querySelector('[data-v="unified"]');
            if (btn) btn.click();
          },
          keywords: ["合并", "统一", "unified", "hebing", "tongyi"]
        },
        {
          id: "action-diff-swap",
          title: "交换左右文本",
          subtitle: "交换左右两侧输入文本",
          icon: "⇅",
          action: function () {
            var btn = document.getElementById("diffSwap");
            if (btn) btn.click();
          },
          keywords: ["交换", "swap", "jiaohuan"]
        },
        {
          id: "action-diff-copy",
          title: "复制 Diff 结果",
          subtitle: "复制对比结果到剪贴板",
          icon: "📋",
          action: function () {
            var btn = document.getElementById("diffCopy");
            if (btn) btn.click();
          },
          keywords: ["复制", "结果", "copy", "fuzhi", "jieguo"]
        }
      ],
      "chart-tools.html": [
        {
          id: "action-chart-bar",
          title: "柱状图",
          subtitle: "切换到柱状图类型",
          icon: "📊",
          action: function () {
            var tab = document.querySelector('.chart-type-tab[data-type="bar"]');
            if (tab) tab.click();
          },
          keywords: ["柱状图", "bar", "zhuzhuangtu"]
        },
        {
          id: "action-chart-line",
          title: "折线图",
          subtitle: "切换到折线图类型",
          icon: "📈",
          action: function () {
            var tab = document.querySelector('.chart-type-tab[data-type="line"]');
            if (tab) tab.click();
          },
          keywords: ["折线图", "line", "zhexiantu"]
        },
        {
          id: "action-chart-pie",
          title: "饼图/环形图",
          subtitle: "切换到饼图或环形图",
          icon: "🥧",
          action: function () {
            var tab = document.querySelector('.chart-type-tab[data-type="pie"]');
            if (tab) tab.click();
          },
          keywords: ["饼图", "环形图", "pie", "donut", "bingtu", "huanxingtu"]
        },
        {
          id: "action-chart-radar",
          title: "雷达图",
          subtitle: "切换到雷达图类型",
          icon: "🎯",
          action: function () {
            var tab = document.querySelector('.chart-type-tab[data-type="radar"]');
            if (tab) tab.click();
          },
          keywords: ["雷达图", "radar", "leidatu"]
        },
        {
          id: "action-chart-download",
          title: "下载 PNG",
          subtitle: "下载图表为 PNG 图片",
          icon: "💾",
          action: function () {
            var btn = document.getElementById("downloadPng");
            if (btn) btn.click();
          },
          keywords: ["下载", "png", "图片", "download", "xiazai", "tupian"]
        }
      ],
      "clipboard-tools.html": [
        {
          id: "action-clip-history",
          title: "剪贴板历史",
          subtitle: "查看剪贴板历史记录",
          icon: "📋",
          action: function () { switchTab("剪贴板历史"); },
          keywords: ["历史", "history", "lishi", "jiantieban"]
        },
        {
          id: "action-clip-textproc",
          title: "文本处理",
          subtitle: "快速文本处理工具",
          icon: "✏️",
          action: function () { switchTab("文本处理"); },
          keywords: ["文本处理", "text", "wenbenchuli"]
        },
        {
          id: "action-clip-templates",
          title: "快速模板",
          subtitle: "管理常用文本模板",
          icon: "📑",
          action: function () { switchTab("快速模板"); },
          keywords: ["模板", "template", "moban"]
        },
        {
          id: "action-clip-paste",
          title: "粘贴到历史",
          subtitle: "将剪贴板内容粘贴到历史",
          icon: "📥",
          action: function () {
            var btn = document.getElementById("pasteBtn");
            if (btn) btn.click();
          },
          keywords: ["粘贴", "paste", "zhantie"]
        }
      ],
      "password-safe.html": [
        {
          id: "action-pwd-new",
          title: "新建密码条目",
          subtitle: "添加新的密码记录",
          icon: "➕",
          action: function () {
            var btn = document.getElementById("addEntryBtn");
            if (btn) btn.click();
          },
          keywords: ["新建", "添加", "新增", "new", "add", "xinjian", "tianjia"]
        },
        {
          id: "action-pwd-search",
          title: "搜索密码",
          subtitle: "搜索密码条目",
          icon: "🔍",
          action: function () {
            var input = document.getElementById("searchInput");
            if (input) { input.focus(); input.select(); }
          },
          keywords: ["搜索", "查找", "search", "sousuo", "chazhao"]
        },
        {
          id: "action-pwd-generate",
          title: "生成密码",
          subtitle: "使用密码生成器生成随机密码",
          icon: "🔑",
          action: function () {
            var btn = document.getElementById("genPasswordBtn");
            if (btn) btn.click();
          },
          keywords: ["生成", "generate", "shengcheng", "mima"]
        },
        {
          id: "action-pwd-lock",
          title: "锁定保险箱",
          subtitle: "立即锁定密码保险箱",
          icon: "🔒",
          action: function () {
            var btn = document.getElementById("lockBtn");
            if (btn) btn.click();
          },
          keywords: ["锁定", "lock", "suoding", "baoxianxiang"]
        },
        {
          id: "action-pwd-export",
          title: "导出备份",
          subtitle: "导出密码数据备份",
          icon: "📤",
          action: function () {
            var btn = document.getElementById("exportBtn");
            if (btn) btn.click();
          },
          keywords: ["导出", "备份", "export", "backup", "daochu", "beifen"]
        }
      ],
      "ai-tools.html": [
        {
          id: "action-ai-library",
          title: "提示词模板库",
          subtitle: "浏览 50+ 提示词模板",
          icon: "📚",
          action: function () { switchTab("提示词模板库"); },
          keywords: ["模板库", "提示词", "library", "mobanku", "tishici"]
        },
        {
          id: "action-ai-generator",
          title: "提示词生成器",
          subtitle: "自定义生成专业提示词",
          icon: "⚡",
          action: function () { switchTab("提示词生成器"); },
          keywords: ["生成器", "提示词", "generator", "shengchengqi", "tishici"]
        },
        {
          id: "action-ai-favorites",
          title: "我的收藏",
          subtitle: "查看收藏的提示词",
          icon: "⭐",
          action: function () { switchTab("我的收藏"); },
          keywords: ["收藏", "favorites", "shoucang"]
        },
        {
          id: "action-ai-copy",
          title: "复制当前提示词",
          subtitle: "复制当前提示词到剪贴板",
          icon: "📋",
          action: function () {
            var btn = document.getElementById("editorCopyBtn") || document.getElementById("genCopyBtn");
            if (btn) btn.click();
          },
          keywords: ["复制", "copy", "fuzhi", "tishici"]
        }
      ],
      "batch-image.html": [
        {
          id: "action-batch-resize",
          title: "添加改尺寸步骤",
          subtitle: "添加图片尺寸调整步骤",
          icon: "📐",
          action: function () {
            var btn = document.querySelector('.add-step-btn[data-step="resize"]');
            if (btn) btn.click();
          },
          keywords: ["改尺寸", "resize", "gaichicun"]
        },
        {
          id: "action-batch-compress",
          title: "添加压缩步骤",
          subtitle: "添加图片压缩处理步骤",
          icon: "🗜️",
          action: function () {
            var btn = document.querySelector('.add-step-btn[data-step="compress"]');
            if (btn) btn.click();
          },
          keywords: ["压缩", "compress", "yasuo"]
        },
        {
          id: "action-batch-convert",
          title: "添加格式转换",
          subtitle: "添加图片格式转换步骤",
          icon: "🔄",
          action: function () {
            var btn = document.querySelector('.add-step-btn[data-step="convert"]');
            if (btn) btn.click();
          },
          keywords: ["格式转换", "convert", "geshizhuanhuan"]
        },
        {
          id: "action-batch-watermark",
          title: "添加水印",
          subtitle: "添加图片水印步骤",
          icon: "💧",
          action: function () {
            var btn = document.querySelector('.add-step-btn[data-step="watermark"]');
            if (btn) btn.click();
          },
          keywords: ["水印", "watermark", "shuiyin"]
        },
        {
          id: "action-batch-start",
          title: "开始批量处理",
          subtitle: "一键开始批量图片处理",
          icon: "▶️",
          action: function () {
            var btn = document.getElementById("processBtn");
            if (btn && !btn.disabled) btn.click();
          },
          keywords: ["批量", "开始", "处理", "batch", "start", "piliang", "chuli"]
        }
      ]
    };

    if (pageActions[page]) {
      actions = actions.concat(pageActions[page]);
    }

    return actions;
  }

  // 辅助：尝试切换页面内的 tab
  function switchTab(label) {
    var selectors = [
      '.tabs .tab',
      '.seg button',
      '[role="tab"]'
    ];
    for (var s = 0; s < selectors.length; s++) {
      var tabs = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].textContent.trim().indexOf(label) === 0 ||
            tabs[i].textContent.trim() === label) {
          tabs[i].click();
          return true;
        }
      }
    }
    return false;
  }

  // 最近使用
  var RECENT_KEY = "tbx-palette-recent";
  var MAX_RECENT = 5;

  function getRecent() {
    try {
      var s = localStorage.getItem(RECENT_KEY);
      if (!s) return [];
      var arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
    } catch (e) { return []; }
  }

  function saveRecent(id) {
    var list = getRecent().filter(function (x) { return x !== id; });
    list.unshift(id);
    list = list.slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
  }

  // CSS 注入
  function injectPaletteCSS() {
    if (document.getElementById("tbx-palette-css")) return;
    var css = document.createElement("style");
    css.id = "tbx-palette-css";
    css.textContent = [
      '/* ============================================================',
      '   命令面板 Command Palette',
      '   ============================================================ */',
      '.tbx-palette {',
      '  position: fixed; inset: 0;',
      '  background: rgba(10, 10, 12, .55);',
      '  display: none; z-index: 9999;',
      '  padding: 24px;',
      '  align-items: flex-start;',
      '  justify-content: center;',
      '  padding-top: 12vh;',
      '}',
      '.tbx-palette.open { display: flex; }',
      '',
      '.tbx-palette-panel {',
      '  background: var(--surface);',
      '  color: var(--ink);',
      '  border: 1px solid var(--line);',
      '  border-radius: 16px;',
      '  box-shadow: 0 22px 60px -20px rgba(0,0,0,.5), 0 2px 4px rgba(22,21,15,.04);',
      '  width: 100%;',
      '  max-width: 620px;',
      '  max-height: 70vh;',
      '  display: flex;',
      '  flex-direction: column;',
      '  overflow: hidden;',
      '  animation: tbxPaletteIn .18s cubic-bezier(.2,.7,.3,1);',
      '}',
      '@keyframes tbxPaletteIn {',
      '  from { opacity: 0; transform: translateY(-8px) scale(.98); }',
      '  to   { opacity: 1; transform: translateY(0) scale(1); }',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .tbx-palette-panel { animation: none; }',
      '}',
      '',
      '/* 搜索框 */',
      '.tbx-palette-search {',
      '  display: flex; align-items: center; gap: 10px;',
      '  padding: 14px 18px;',
      '  border-bottom: 1px solid var(--line);',
      '  background: var(--surface-2);',
      '}',
      '.tbx-palette-search .search-icon {',
      '  color: var(--muted); font-size: 16px; flex-shrink: 0;',
      '}',
      '.tbx-palette-search input {',
      '  flex: 1; border: 0; background: transparent; outline: none;',
      '  font: inherit; font-size: 15px; color: var(--ink);',
      '  padding: 4px 0;',
      '}',
      '.tbx-palette-search input::placeholder { color: var(--faint); }',
      '.tbx-palette-search .kbd-hint {',
      '  font-family: var(--mono); font-size: 11px;',
      '  color: var(--faint);',
      '  flex-shrink: 0;',
      '}',
      '',
      '/* 结果列表 */',
      '.tbx-palette-list {',
      '  overflow-y: auto;',
      '  flex: 1;',
      '  padding: 6px 0;',
      '}',
      '',
      '/* 分组标题 */',
      '.tbx-palette-group {',
      '  font-size: 11px; font-weight: 700;',
      '  letter-spacing: .08em; text-transform: uppercase;',
      '  color: var(--muted);',
      '  padding: 10px 18px 6px;',
      '}',
      '.tbx-palette-group:first-child { padding-top: 6px; }',
      '',
      '/* 结果项 */',
      '.tbx-palette-item {',
      '  display: flex; align-items: center; gap: 12px;',
      '  padding: 9px 18px;',
      '  cursor: pointer;',
      '  transition: background .12s;',
      '}',
      '.tbx-palette-item:hover { background: var(--surface-2); }',
      '.tbx-palette-item.selected {',
      '  background: var(--accent-soft);',
      '}',
      '.tbx-palette-item .item-icon {',
      '  width: 36px; height: 36px;',
      '  border-radius: 10px;',
      '  background: var(--surface-3);',
      '  border: 1px solid var(--line);',
      '  display: grid; place-items: center;',
      '  font-size: 18px;',
      '  flex-shrink: 0;',
      '}',
      '.tbx-palette-item.selected .item-icon {',
      '  border-color: color-mix(in srgb, var(--accent) 30%, transparent);',
      '}',
      '.tbx-palette-item .item-text {',
      '  flex: 1; min-width: 0;',
      '}',
      '.tbx-palette-item .item-title {',
      '  font-size: 14px; font-weight: 600;',
      '  color: var(--ink);',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.tbx-palette-item .item-subtitle {',
      '  font-size: 12px;',
      '  color: var(--muted);',
      '  margin-top: 2px;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.tbx-palette-item.selected .item-subtitle {',
      '  color: var(--muted);',
      '}',
      '',
      '/* 搜索高亮 */',
      '.tbx-palette-item .hl {',
      '  color: var(--accent);',
      '  font-weight: 700;',
      '}',
      '',
      '/* 空状态 */',
      '.tbx-palette-empty {',
      '  text-align: center;',
      '  padding: 40px 20px;',
      '  color: var(--faint);',
      '  font-size: 13px;',
      '}',
      '.tbx-palette-empty .empty-icon { font-size: 32px; margin-bottom: 8px; opacity: .5; }',
      '',
      '/* 底部快捷键提示 */',
      '.tbx-palette-footer {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 8px 18px;',
      '  border-top: 1px solid var(--line);',
      '  background: var(--surface-2);',
      '  font-size: 11px;',
      '  color: var(--faint);',
      '}',
      '.tbx-palette-footer .footer-keys { display: flex; gap: 12px; }',
      '.tbx-palette-footer .fk {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '}',
      '.tbx-palette-footer .fk kbd {',
      '  font-family: var(--mono); font-size: 10.5px;',
      '  padding: 1px 6px;',
      '  border: 1px solid var(--line-2); border-bottom-width: 2px;',
      '  border-radius: 5px;',
      '  background: var(--surface); color: var(--ink);',
      '  min-width: 18px; text-align: center;',
      '}',
      '',
      '/* 小屏适配 */',
      '@media (max-width: 640px) {',
      '  .tbx-palette { padding: 10px; padding-top: 8vh; }',
      '  .tbx-palette-panel { max-height: 78vh; }',
      '  .tbx-palette-footer { flex-wrap: wrap; gap: 6px; }',
      '}'
    ].join("\n");
    document.head.appendChild(css);
  }

  // DOM 构建
  var paletteEl = null;
  var searchInput = null;
  var listEl = null;
  var allItems = [];      // 所有可用命令
  var filteredItems = []; // 过滤后的命令
  var selectedIndex = -1; // 当前选中索引
  var lastFocused = null; // 记录打开前的焦点元素

  function buildPalette() {
    if (paletteEl) return;

    injectPaletteCSS();

    paletteEl = document.createElement("div");
    paletteEl.className = "tbx-palette";
    paletteEl.id = "tbxCommandPalette";
    paletteEl.setAttribute("role", "dialog");
    paletteEl.setAttribute("aria-modal", "true");
    paletteEl.setAttribute("aria-label", "命令面板");
    paletteEl.setAttribute("aria-hidden", "true");

    paletteEl.innerHTML =
      '<div class="tbx-palette-panel" role="document">' +
        '<div class="tbx-palette-search">' +
          '<span class="search-icon" aria-hidden="true">🔍</span>' +
          '<input type="text" id="tbxPaletteInput" autocomplete="off" ' +
                 'spellcheck="false" autocapitalize="off" ' +
                 'placeholder="输入命令或工具名称…" aria-label="搜索命令">' +
          '<span class="kbd-hint">Ctrl+K</span>' +
        '</div>' +
        '<div class="tbx-palette-list" id="tbxPaletteList" role="listbox" aria-label="搜索结果"></div>' +
        '<div class="tbx-palette-footer">' +
          '<div class="footer-keys">' +
            '<span class="fk"><kbd>↑</kbd><kbd>↓</kbd> 导航</span>' +
            '<span class="fk"><kbd>Enter</kbd> 选择</span>' +
            '<span class="fk"><kbd>Esc</kbd> 关闭</span>' +
          '</div>' +
          '<span class="footer-tip">输入关键词快速搜索</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(paletteEl);

    searchInput = paletteEl.querySelector("#tbxPaletteInput");
    listEl = paletteEl.querySelector("#tbxPaletteList");

    // 点击遮罩关闭
    paletteEl.addEventListener("click", function (e) {
      if (e.target === paletteEl) closePalette();
    });

    // 搜索输入
    searchInput.addEventListener("input", function () {
      filterPalette(searchInput.value.trim());
    });

    // 键盘事件
    searchInput.addEventListener("keydown", handlePaletteKeydown);
  }

  // 构建命令列表
  function buildPaletteItems() {
    var items = [];

    // 1. 工具列表（使用 TOOLS_META 的元信息，href/name 与 TOOLS 同源）
    for (var i = 0; i < TOOLS_META.length; i++) {
      var t = TOOLS_META[i];
      items.push({
        id: "tool-" + t.href.replace(".html", ""),
        title: t.name,
        subtitle: t.subtitle,
        icon: t.icon,
        category: "tools",
        categoryLabel: "全部工具",
        action: (function (href) {
          return function () { location.href = href; };
        })(t.href),
        keywords: t.keywords || []
      });
    }

    // 2. 快速操作
    var quickActions = getQuickActions();
    for (var j = 0; j < quickActions.length; j++) {
      quickActions[j].category = "actions";
      quickActions[j].categoryLabel = "快速操作";
      items.push(quickActions[j]);
    }

    allItems = items;
  }

  // 模糊搜索过滤
  function filterPalette(query) {
    query = query.toLowerCase();

    if (!query) {
      // 空搜索：显示最近使用 + 快速操作 + 全部工具
      var recentIds = getRecent();
      var recentItems = [];
      var otherItems = [];
      var actionItems = [];

      for (var i = 0; i < allItems.length; i++) {
        var item = allItems[i];
        if (item.category === "actions") {
          actionItems.push(item);
        } else if (recentIds.indexOf(item.id) !== -1) {
          recentItems.push(item);
        } else {
          otherItems.push(item);
        }
      }

      // 按最近使用顺序排序
      recentItems.sort(function (a, b) {
        return recentIds.indexOf(a.id) - recentIds.indexOf(b.id);
      });

      filteredItems = [];
      if (recentItems.length > 0) {
        for (var r = 0; r < recentItems.length; r++) {
          filteredItems.push(recentItems[r]);
        }
      }
      for (var a = 0; a < actionItems.length; a++) {
        filteredItems.push(actionItems[a]);
      }
      for (var o = 0; o < otherItems.length; o++) {
        filteredItems.push(otherItems[o]);
      }
    } else {
      // 有搜索词：模糊匹配
      var scored = [];
      for (var k = 0; k < allItems.length; k++) {
        var it = allItems[k];
        var score = fuzzyMatch(query, it);
        if (score > 0) {
          scored.push({ item: it, score: score });
        }
      }
      // 按分数排序
      scored.sort(function (a, b) { return b.score - a.score; });
      filteredItems = scored.map(function (s) { return s.item; });
    }

    selectedIndex = filteredItems.length > 0 ? 0 : -1;
    renderList(query);
  }

  // 简单模糊匹配：计算匹配分数
  function fuzzyMatch(query, item) {
    var q = query.toLowerCase();
    var title = item.title.toLowerCase();
    var subtitle = (item.subtitle || "").toLowerCase();
    var keywords = item.keywords || [];
    var score = 0;

    // 标题完全匹配
    if (title === q) score += 100;
    // 标题以查询开头
    else if (title.indexOf(q) === 0) score += 80;
    // 标题包含查询
    else if (title.indexOf(q) !== -1) score += 60;

    // 副标题包含
    if (subtitle.indexOf(q) !== -1) score += 25;

    // 关键词匹配
    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i].toLowerCase();
      if (kw === q) { score += 70; break; }
      if (kw.indexOf(q) === 0) { score += 50; break; }
      if (kw.indexOf(q) !== -1) { score += 30; break; }
    }

    // 字符顺序匹配（每个字符按顺序出现）
    if (score === 0) {
      var ti = 0;
      var matched = 0;
      for (var c = 0; c < q.length; c++) {
        var idx = title.indexOf(q[c], ti);
        if (idx !== -1) {
          matched++;
          ti = idx + 1;
        } else {
          break;
        }
      }
      if (matched === q.length) {
        score = 15 + matched * 2;
      }
    }

    return score;
  }

  // 渲染列表
  function renderList(query) {
    if (filteredItems.length === 0) {
      listEl.innerHTML =
        '<div class="tbx-palette-empty">' +
          '<div class="empty-icon">🔍</div>' +
          '<div>没有找到匹配的结果</div>' +
        '</div>';
      return;
    }

    var q = query.toLowerCase();
    var html = "";
    var lastCategory = null;
    var recentIds = getRecent();

    for (var i = 0; i < filteredItems.length; i++) {
      var item = filteredItems[i];

      // 分组标题（仅在无搜索词时显示）
      if (!q) {
        var catLabel = "";
        if (recentIds.indexOf(item.id) !== -1 && i < recentIds.length) {
          catLabel = "最近使用";
        } else {
          catLabel = item.categoryLabel || "";
        }

        if (catLabel && catLabel !== lastCategory) {
          html += '<div class="tbx-palette-group">' + catLabel + '</div>';
          lastCategory = catLabel;
        }
      }

      var titleHtml = highlightText(item.title, q);
      var subtitleHtml = item.subtitle ? highlightText(item.subtitle, q) : "";

      html +=
        '<div class="tbx-palette-item' + (i === selectedIndex ? ' selected' : '') + '" ' +
             'role="option" ' +
             'aria-selected="' + (i === selectedIndex ? 'true' : 'false') + '" ' +
             'data-index="' + i + '">' +
          '<div class="item-icon" aria-hidden="true">' + item.icon + '</div>' +
          '<div class="item-text">' +
            '<div class="item-title">' + titleHtml + '</div>' +
            (subtitleHtml ? '<div class="item-subtitle">' + subtitleHtml + '</div>' : '') +
          '</div>' +
        '</div>';
    }

    listEl.innerHTML = html;

    // 绑定点击事件
    var itemEls = listEl.querySelectorAll(".tbx-palette-item");
    for (var j = 0; j < itemEls.length; j++) {
      itemEls[j].addEventListener("click", (function (idx) {
        return function () { executePaletteItem(idx); };
      })(parseInt(itemEls[j].dataset.index, 10)));

      itemEls[j].addEventListener("mouseenter", (function (idx) {
        return function () {
          selectedIndex = idx;
          updateSelection();
        };
      })(parseInt(itemEls[j].dataset.index, 10)));
    }

    // 确保选中项可见
    scrollToSelected();
  }

  // 高亮匹配字符
  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    var q = query.toLowerCase();
    var lower = text.toLowerCase();
    var idx = lower.indexOf(q);

    if (idx !== -1) {
      // 连续匹配
      return escapeHtml(text.slice(0, idx)) +
             '<span class="hl">' + escapeHtml(text.slice(idx, idx + q.length)) + '</span>' +
             escapeHtml(text.slice(idx + q.length));
    }

    // 尝试逐个字符高亮（模糊匹配）
    var result = "";
    var ti = 0;
    var qi = 0;
    var inMatch = false;

    while (ti < text.length && qi < q.length) {
      if (text[ti].toLowerCase() === q[qi]) {
        if (!inMatch) {
          result += '<span class="hl">';
          inMatch = true;
        }
        result += escapeHtml(text[ti]);
        qi++;
      } else {
        if (inMatch) {
          result += '</span>';
          inMatch = false;
        }
        result += escapeHtml(text[ti]);
      }
      ti++;
    }
    if (inMatch) result += '</span>';
    result += escapeHtml(text.slice(ti));

    return result;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // 更新选中状态
  function updateSelection() {
    var items = listEl.querySelectorAll(".tbx-palette-item");
    for (var i = 0; i < items.length; i++) {
      if (i === selectedIndex) {
        items[i].classList.add("selected");
        items[i].setAttribute("aria-selected", "true");
      } else {
        items[i].classList.remove("selected");
        items[i].setAttribute("aria-selected", "false");
      }
    }
    scrollToSelected();
  }

  function scrollToSelected() {
    if (selectedIndex < 0) return;
    var selected = listEl.querySelector('.tbx-palette-item[data-index="' + selectedIndex + '"]');
    if (selected) {
      var listRect = listEl.getBoundingClientRect();
      var itemRect = selected.getBoundingClientRect();
      if (itemRect.top < listRect.top) {
        selected.scrollIntoView({ block: "start", behavior: "smooth" });
      } else if (itemRect.bottom > listRect.bottom) {
        selected.scrollIntoView({ block: "end", behavior: "smooth" });
      }
    }
  }

  // 键盘导航（面板内部）
  function handlePaletteKeydown(e) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      navigatePalette(1);
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      navigatePalette(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredItems.length) {
        executePaletteItem(selectedIndex);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePalette();
    } else if (e.key === "Tab") {
      // Tab 键：在面板内循环焦点
      e.preventDefault();
      e.stopPropagation();
      searchInput.focus();
    }
  }

  function navigatePalette(direction) {
    if (filteredItems.length === 0) return;
    selectedIndex += direction;
    if (selectedIndex < 0) selectedIndex = filteredItems.length - 1;
    if (selectedIndex >= filteredItems.length) selectedIndex = 0;
    updateSelection();
  }

  // 执行命令
  function executePaletteItem(index) {
    if (index < 0 || index >= filteredItems.length) return;
    var item = filteredItems[index];
    saveRecent(item.id);
    closePalette();
    setTimeout(function () {
      if (item.action) item.action();
    }, 50);
  }

  // 打开 / 关闭
  function openPalette() {
    buildPalette();
    buildPaletteItems();

    paletteEl.classList.add("open");
    paletteEl.setAttribute("aria-hidden", "false");

    // 重置搜索
    searchInput.value = "";
    filterPalette("");

    // 设置焦点陷阱（会自动聚焦第一个可聚焦元素）
    setupFocusTrap(paletteEl);

    // 额外确保搜索框获得焦点
    setTimeout(function () {
      if (searchInput) searchInput.focus();
    }, 30);

    document.body.style.overflow = "hidden";
  }

  function closePalette() {
    if (!paletteEl || !paletteEl.classList.contains("open")) return;
    paletteEl.classList.remove("open");
    paletteEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    // 移除焦点陷阱并恢复焦点
    teardownFocusTrap(paletteEl);
  }

  // 初始化命令面板
  function initCommandPalette() {
    injectPaletteCSS();

    // 暴露全局方法，供外部调用
    window.TBX_openPalette = openPalette;
    window.TBX_closePalette = closePalette;
  }

  /* ---------------- 帮助面板 ---------------- */
  var HELP_ROWS = [
    ["?", "打开 / 关闭本帮助"],
    [",", "打开设置面板（主题 / 数据备份）"],
    ["Ctrl + K", "打开命令面板"],
    ["T", "切换主题：浅色 / 深色 / 跟随系统"],
    ["Alt + 1 … 9", "快速切换到第 1–9 个工具"],
    ["Alt + ← / →", "上一个 / 下一个工具"],
    ["Esc", "关闭弹窗、取消当前操作"],
    ["Ctrl + V", "在多数工具页可直接粘贴文件 / 图片"]
  ];

  function buildHelp() {
    var d = document.createElement("div");
    d.className = "tb-modal";
    d.id = "tbHelpModal";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-label", "快捷键与帮助");
    var rows = HELP_ROWS.map(function (r) {
      return '<div class="tb-help-row"><span><span class="tb-kbd">' + r[0] + "</span></span><span>" + r[1] + "</span></div>";
    }).join("");
    var links = TOOLS.map(function (t, i) {
      return '<a class="tb-kbd" style="text-decoration:none" href="' + t.href + '" title="' + t.name + '">' + (i + 1) + "</a>";
    }).join(" ");
    d.innerHTML =
      '<div class="tb-modal-card">' +
      "<h3>快捷键与帮助</h3>" +
      '<p class="sub">免费工具箱 v' + APP_VERSION + " · 全部处理都在你的浏览器或本机完成，不上传服务器</p>" +
      rows +
      '<div style="margin-top:18px"><div style="font-size:13px;color:var(--muted);margin-bottom:8px">快速直达（点击或按 Alt + 数字）</div><div style="display:flex;flex-wrap:wrap;gap:6px">' + links + "</div></div>" +
      '<div style="margin-top:20px;text-align:right"><button class="btn primary" id="tbHelpClose">知道了</button></div>' +
      "</div>";
    document.body.appendChild(d);
    d.addEventListener("click", function (e) { if (e.target === d) closeHelp(); });
    var c = d.querySelector("#tbHelpClose");
    if (c) c.addEventListener("click", closeHelp);
    return d;
  }
  function openHelp() {
    var d = document.getElementById("tbHelpModal") || buildHelp();
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
    setupFocusTrap(d);
  }
  function closeHelp() {
    var d = document.getElementById("tbHelpModal");
    if (d) {
      d.classList.remove("open");
      d.setAttribute("aria-hidden", "true");
      teardownFocusTrap(d);
    }
  }
  window.TBX_openHelp = openHelp;

  /* ---------------- 快捷键引导覆盖层 ---------------- */

  function injectShortcutGuideCSS() {
    if (document.getElementById("tbx-shortcut-guide-css")) return;
    var css = document.createElement("style");
    css.id = "tbx-shortcut-guide-css";
    css.textContent = [
      '/* ============================================================',
      '   快捷键引导覆盖层 Shortcut Guide',
      '   ============================================================ */',
      '.tbx-shortcut-guide {',
      '  position: fixed; inset: 0;',
      '  background: rgba(10, 10, 12, .6);',
      '  backdrop-filter: blur(8px);',
      '  -webkit-backdrop-filter: blur(8px);',
      '  display: none; z-index: 10000;',
      '  align-items: center; justify-content: center;',
      '  padding: 24px;',
      '  animation: tbxSgFadeIn .2s ease;',
      '}',
      '.tbx-shortcut-guide.open { display: flex; }',
      '@keyframes tbxSgFadeIn {',
      '  from { opacity: 0; }',
      '  to   { opacity: 1; }',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .tbx-shortcut-guide { animation: none; }',
      '}',
      '',
      '.tbx-sg-panel {',
      '  background: var(--surface);',
      '  color: var(--ink);',
      '  border: 1px solid var(--line);',
      '  border-radius: 20px;',
      '  box-shadow: 0 30px 80px -20px rgba(0,0,0,.6), 0 4px 8px rgba(22,21,15,.06);',
      '  width: 100%; max-width: 820px;',
      '  max-height: 85vh;',
      '  display: flex; flex-direction: column;',
      '  overflow: hidden;',
      '  animation: tbxSgPanelIn .25s cubic-bezier(.2,.8,.3,1.1);',
      '}',
      '@keyframes tbxSgPanelIn {',
      '  from { opacity: 0; transform: scale(.96) translateY(10px); }',
      '  to   { opacity: 1; transform: scale(1) translateY(0); }',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .tbx-sg-panel { animation: none; }',
      '}',
      '',
      '.tbx-sg-header {',
      '  padding: 20px 28px 16px;',
      '  border-bottom: 1px solid var(--line);',
      '  display: flex; align-items: center; justify-content: space-between;',
      '}',
      '.tbx-sg-header h2 {',
      '  margin: 0; font-size: 18px; font-weight: 700;',
      '  display: flex; align-items: center; gap: 10px;',
      '}',
      '.tbx-sg-header .sg-icon { font-size: 22px; }',
      '.tbx-sg-close {',
      '  width: 32px; height: 32px; border-radius: 8px;',
      '  border: 1px solid var(--line); background: var(--surface-2);',
      '  color: var(--muted); cursor: pointer; font-size: 16px;',
      '  display: grid; place-items: center;',
      '  transition: all .15s;',
      '}',
      '.tbx-sg-close:hover { background: var(--surface-3); color: var(--ink); }',
      '',
      '.tbx-sg-body {',
      '  overflow-y: auto;',
      '  padding: 20px 28px 24px;',
      '  display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px 28px;',
      '}',
      '.tbx-sg-category { min-width: 0; }',
      '.tbx-sg-cat-title {',
      '  font-size: 11px; font-weight: 700;',
      '  letter-spacing: .08em; text-transform: uppercase;',
      '  color: var(--muted);',
      '  margin-bottom: 10px;',
      '  padding-bottom: 6px;',
      '  border-bottom: 1px solid var(--line);',
      '}',
      '.tbx-sg-item {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 7px 0; gap: 12px;',
      '}',
      '.tbx-sg-item .sg-desc {',
      '  font-size: 13px; color: var(--ink);',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.tbx-sg-item .sg-keys {',
      '  display: flex; gap: 4px; flex-shrink: 0;',
      '}',
      '.tbx-sg-item kbd {',
      '  font-family: var(--mono, ui-monospace, monospace);',
      '  font-size: 11.5px;',
      '  padding: 2px 7px;',
      '  border: 1px solid var(--line-2, var(--line));',
      '  border-bottom-width: 2px;',
      '  border-radius: 5px;',
      '  background: var(--surface-2);',
      '  color: var(--ink);',
      '  min-width: 18px; text-align: center;',
      '  line-height: 1.5;',
      '}',
      '',
      '.tbx-sg-footer {',
      '  padding: 10px 28px 14px;',
      '  border-top: 1px solid var(--line);',
      '  background: var(--surface-2);',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  font-size: 11px; color: var(--faint);',
      '}',
      '.tbx-sg-footer .sg-footer-tip { display: flex; align-items: center; gap: 4px; }',
      '',
      '/* 小屏适配 */',
      '@media (max-width: 640px) {',
      '  .tbx-shortcut-guide { padding: 12px; }',
      '  .tbx-sg-body { grid-template-columns: 1fr; padding: 16px; gap: 16px; }',
      '  .tbx-sg-header { padding: 16px 18px 12px; }',
      '  .tbx-sg-footer { padding: 8px 18px 12px; flex-wrap: wrap; gap: 6px; }',
      '}'
    ].join("\n");
    document.head.appendChild(css);
  }

  var shortcutGuideEl = null;

  function buildShortcutGuide() {
    if (shortcutGuideEl) return;

    injectShortcutGuideCSS();

    shortcutGuideEl = document.createElement("div");
    shortcutGuideEl.className = "tbx-shortcut-guide";
    shortcutGuideEl.id = "tbxShortcutGuide";
    shortcutGuideEl.setAttribute("role", "dialog");
    shortcutGuideEl.setAttribute("aria-modal", "true");
    shortcutGuideEl.setAttribute("aria-label", "快捷键指南");
    shortcutGuideEl.setAttribute("aria-hidden", "true");

    shortcutGuideEl.innerHTML =
      '<div class="tbx-sg-panel" role="document">' +
        '<div class="tbx-sg-header">' +
          '<h2><span class="sg-icon">⌨️</span> 快捷键指南</h2>' +
          '<button class="tbx-sg-close" type="button" id="tbxSgClose" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="tbx-sg-body" id="tbxSgBody"></div>' +
        '<div class="tbx-sg-footer">' +
          '<span class="sg-footer-tip">按 <kbd>?</kbd> 随时打开此面板</span>' +
          '<span class="sg-footer-tip">按 <kbd>Esc</kbd> 关闭</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(shortcutGuideEl);

    // 点击遮罩关闭
    shortcutGuideEl.addEventListener("click", function (e) {
      if (e.target === shortcutGuideEl) closeShortcutGuide();
    });

    // 关闭按钮
    var closeBtn = shortcutGuideEl.querySelector("#tbxSgClose");
    if (closeBtn) closeBtn.addEventListener("click", closeShortcutGuide);
  }

  function getShortcutGuideData() {
    var shortcuts = getShortcuts();
    var keyMap = {};
    for (var i = 0; i < shortcuts.length; i++) {
      keyMap[shortcuts[i].id] = formatShortcutKey(shortcuts[i]);
    }

    var categories = [
      {
        title: "全局",
        items: [
          { keys: [keyMap.help || "?"], desc: "打开快捷键指南" },
          { keys: [keyMap.settings || ","], desc: "打开设置面板" },
          { keys: [keyMap.theme || "T"], desc: "切换主题（浅色/深色/跟随系统）" },
          { keys: ["Ctrl+K"], desc: "打开命令面板" }
        ]
      },
      {
        title: "导航",
        items: [
          { keys: ["Alt+1", "~", "Alt+9"], desc: "快速切换到第 1-9 个工具" },
          { keys: ["Alt+←"], desc: "上一个工具" },
          { keys: ["Alt+→"], desc: "下一个工具" },
          { keys: ["G", "H"], desc: "回到首页" }
        ]
      },
      {
        title: "模态框",
        items: [
          { keys: ["Esc"], desc: "关闭当前弹窗" },
          { keys: ["↑", "↓"], desc: "命令面板中上下导航" },
          { keys: ["Enter"], desc: "确认选择" }
        ]
      },
      {
        title: "编辑",
        items: [
          { keys: ["Ctrl+V"], desc: "粘贴文件/图片（多数工具页）" },
          { keys: ["Ctrl+Z"], desc: "撤销" },
          { keys: ["Ctrl+Y"], desc: "重做" },
          { keys: ["Ctrl+S"], desc: "保存/导出" }
        ]
      }
    ];

    // 播放器页面特有快捷键
    var page = location.pathname.split("/").pop() || "index.html";
    if (page === "player.html") {
      categories.push({
        title: "播放器",
        items: [
          { keys: ["Space"], desc: "播放 / 暂停" },
          { keys: ["←", "→"], desc: "快退 / 快进 5 秒" },
          { keys: ["↑", "↓"], desc: "音量增加 / 减少" },
          { keys: ["M"], desc: "静音 / 取消静音" },
          { keys: ["F"], desc: "全屏 / 退出全屏" }
        ]
      });
    }

    // 页面自定义快捷键（通过 window.TBX_pageShortcuts 注入）
    if (window.TBX_pageShortcuts && Array.isArray(window.TBX_pageShortcuts) && window.TBX_pageShortcuts.length > 0) {
      categories.push({
        title: "当前页面",
        items: window.TBX_pageShortcuts.map(function (sc) {
          return { keys: sc.keys || [sc.key], desc: sc.desc || sc.description || "" };
        })
      });
    }

    return categories;
  }

  function renderShortcutGuide() {
    if (!shortcutGuideEl) return;
    var body = shortcutGuideEl.querySelector("#tbxSgBody");
    if (!body) return;

    var categories = getShortcutGuideData();
    var html = "";

    for (var c = 0; c < categories.length; c++) {
      var cat = categories[c];
      html += '<div class="tbx-sg-category">';
      html += '<div class="tbx-sg-cat-title">' + cat.title + '</div>';
      for (var i = 0; i < cat.items.length; i++) {
        var item = cat.items[i];
        var keysHtml = "";
        for (var k = 0; k < item.keys.length; k++) {
          if (k > 0 && item.keys[k] !== "~") {
            keysHtml += '<span style="color:var(--faint);font-size:11px;align-self:center">+</span>';
          }
          if (item.keys[k] === "~") {
            keysHtml = '<span style="color:var(--muted);font-size:11px;align-self:center;padding:0 2px">~</span>';
            continue;
          }
          keysHtml += "<kbd>" + item.keys[k] + "</kbd>";
        }
        html +=
          '<div class="tbx-sg-item">' +
            '<span class="sg-desc">' + item.desc + '</span>' +
            '<span class="sg-keys">' + keysHtml + '</span>' +
          '</div>';
      }
      html += '</div>';
    }

    body.innerHTML = html;
  }

  function openShortcutGuide() {
    buildShortcutGuide();
    renderShortcutGuide();
    shortcutGuideEl.classList.add("open");
    shortcutGuideEl.setAttribute("aria-hidden", "false");
    setupFocusTrap(shortcutGuideEl);
  }

  function closeShortcutGuide() {
    if (!shortcutGuideEl) return;
    shortcutGuideEl.classList.remove("open");
    shortcutGuideEl.setAttribute("aria-hidden", "true");
    teardownFocusTrap(shortcutGuideEl);
  }

  window.TBX_openShortcutGuide = openShortcutGuide;

  /* ---------------- 设置面板 ---------------- */

  // 备份数据中各逻辑键与 localStorage 键的映射
  var BACKUP_KEYS = {
    "theme":          "tbx-theme",
    "favorites":      "tbx-favorites",
    "prefs":          "tbx-prefs-",   // 前缀匹配，所有 tbx-prefs-* 的键
    "recent":         "tbx-recent",
    "calc-history":   "tbx-calc-history",
    "palette-recent": "tbx-palette-recent",
    "random-history": "tbx-random-history",
    "md-content":     "tbx-md-content",
    "i18n-lang":      "tbx-lang",
    "shortcuts":      "tbx-shortcuts",
    "usage-stats":    "tbx-usage-stats",
    "home-sort":      "tbx-home-sort",
    // 新工具数据
    "notes":          "tbx-notes",
    "notes-active":   "tbx-notes-active",
    "pomodoro":       "tbx-pomodoro",
    "pomodoro-history": "tbx-pomodoro-history",
    "pw-vault":       "tbx-pw-vault",
    "pw-settings":    "tbx-pw-settings",
    "clip-history":   "tbx_clip_history",
    "clip-templates": "tbx_clip_templates",
    "ai-favorites":   "ai_favorites",
    "ai-custom":      "ai_custom"
  };

  function injectSettingsCSS() {
    if (document.getElementById("tbx-settings-css")) return;
    var css = document.createElement("style");
    css.id = "tbx-settings-css";
    css.textContent = [
      '/* ============================================================',
      '   设置面板 Settings',
      '   ============================================================ */',
      '.tb-settings-section {',
      '  margin-bottom: 22px;',
      '}',
      '.tb-settings-section:last-child { margin-bottom: 0; }',
      '',
      '.tb-settings-title {',
      '  font-size: 13px; font-weight: 700;',
      '  color: var(--muted);',
      '  letter-spacing: .04em;',
      '  margin-bottom: 10px;',
      '  text-transform: uppercase;',
      '}',
      '',
      '/* 主题选择器 */',
      '.tb-theme-options {',
      '  display: flex; gap: 10px;',
      '}',
      '.tb-theme-option {',
      '  flex: 1;',
      '  padding: 14px 10px;',
      '  border: 2px solid var(--line);',
      '  border-radius: 12px;',
      '  background: var(--surface-2);',
      '  cursor: pointer;',
      '  text-align: center;',
      '  transition: all .15s;',
      '  font-size: 13px;',
      '}',
      '.tb-theme-option:hover {',
      '  border-color: var(--accent-soft);',
      '  background: var(--surface-3);',
      '}',
      '.tb-theme-option.active {',
      '  border-color: var(--accent);',
      '  background: var(--accent-soft);',
      '  color: var(--accent);',
      '  font-weight: 600;',
      '}',
      '.tb-theme-option .tb-theme-icon {',
      '  font-size: 22px;',
      '  display: block;',
      '  margin-bottom: 4px;',
      '}',
      '.tb-theme-option input[type="radio"] {',
      '  position: absolute; opacity: 0; pointer-events: none;',
      '}',
      '',
      '/* 数据备份按钮区 */',
      '.tb-data-actions {',
      '  display: flex; gap: 10px; flex-wrap: wrap;',
      '}',
      '.tb-data-actions .btn {',
      '  flex: 1; min-width: 120px;',
      '}',
      '.tb-data-desc {',
      '  font-size: 12px; color: var(--muted);',
      '  margin-top: 10px; line-height: 1.6;',
      '}',
      '',
      '/* 版本信息 */',
      '.tb-settings-version {',
      '  text-align: center;',
      '  font-size: 12px;',
      '  color: var(--faint);',
      '  padding-top: 8px;',
      '  border-top: 1px solid var(--line);',
      '  margin-top: 4px;',
      '}',
      '.tb-settings-version strong {',
      '  color: var(--muted); font-weight: 600;',
      '}',
      '',
      '/* 隐藏的文件输入 */',
      '#tbSettingsFileInput { display: none; }',
      '',
      '/* 设置面板弹窗卡片宽度调整 */',
      '#tbSettingsModal .tb-modal-card {',
      '  max-width: 440px;',
      '}',
      '',
      '/* 快捷键列表 */',
      '.tb-shortcut-list {',
      '  display: flex; flex-direction: column; gap: 6px;',
      '}',
      '.tb-shortcut-item {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 10px 12px;',
      '  border-radius: 10px;',
      '  background: var(--surface-2);',
      '  border: 1px solid transparent;',
      '  transition: all .12s;',
      '}',
      '.tb-shortcut-item:hover {',
      '  background: var(--surface-3);',
      '}',
      '.tb-shortcut-item.recording {',
      '  border-color: var(--accent);',
      '  background: var(--accent-soft);',
      '}',
      '.tb-shortcut-item.conflict {',
      '  border-color: #f59e0b;',
      '  background: rgba(245, 158, 11, .1);',
      '}',
      '.tb-shortcut-name {',
      '  font-size: 13px; color: var(--ink);',
      '  display: flex; align-items: center; gap: 8px;',
      '}',
      '.tb-shortcut-badge {',
      '  font-size: 10px; font-weight: 600;',
      '  padding: 2px 6px; border-radius: 4px;',
      '  background: var(--surface-3); color: var(--muted);',
      '  text-transform: uppercase;',
      '  letter-spacing: .04em;',
      '}',
      '.tb-shortcut-badge.fixed { background: var(--surface-3); color: var(--faint); }',
      '.tb-shortcut-badge.custom { background: var(--accent-soft); color: var(--accent); }',
      '.tb-shortcut-key {',
      '  font-family: var(--mono); font-size: 12px;',
      '  padding: 4px 10px;',
      '  border: 1px solid var(--line-2); border-bottom-width: 2px;',
      '  border-radius: 6px;',
      '  background: var(--surface); color: var(--ink);',
      '  min-width: 48px; text-align: center;',
      '  cursor: pointer;',
      '  transition: all .12s;',
      '  user-select: none;',
      '}',
      '.tb-shortcut-key:hover { border-color: var(--accent); }',
      '.tb-shortcut-key.recording {',
      '  border-color: var(--accent);',
      '  background: var(--accent-soft);',
      '  color: var(--accent);',
      '  animation: tbxPulse 1.2s ease-in-out infinite;',
      '}',
      '.tb-shortcut-key.fixed {',
      '  cursor: not-allowed;',
      '  opacity: .6;',
      '}',
      '@keyframes tbxPulse {',
      '  0%, 100% { opacity: 1; }',
      '  50% { opacity: .6; }',
      '}',
      '.tb-shortcut-reset-row {',
      '  display: flex; justify-content: space-between; align-items: center;',
      '  margin-top: 10px;',
      '}',
      '.tb-shortcut-reset-row .hint {',
      '  font-size: 11px; color: var(--faint);',
      '}',
      '.tb-shortcut-conflict-warn {',
      '  font-size: 11px; color: #f59e0b;',
      '  margin-top: 4px;',
      '  padding: 0 12px;',
      '}',
      '',
      '/* 使用统计 */',
      '.tb-usage-summary {',
      '  display: flex; gap: 12px; margin-bottom: 14px;',
      '}',
      '.tb-usage-stat-card {',
      '  flex: 1; padding: 12px; border-radius: 10px;',
      '  background: var(--surface-2); border: 1px solid var(--line);',
      '  text-align: center;',
      '}',
      '.tb-usage-stat-card .stat-num {',
      '  font-size: 22px; font-weight: 700; color: var(--ink);',
      '  line-height: 1.2;',
      '}',
      '.tb-usage-stat-card .stat-label {',
      '  font-size: 11px; color: var(--muted); margin-top: 4px;',
      '}',
      '.tb-usage-list {',
      '  max-height: 220px; overflow-y: auto;',
      '  display: flex; flex-direction: column; gap: 6px;',
      '  padding-right: 4px;',
      '}',
      '.tb-usage-item {',
      '  display: flex; align-items: center; gap: 10px;',
      '  padding: 8px 10px; border-radius: 8px;',
      '  background: var(--surface-2);',
      '}',
      '.tb-usage-item .usage-rank {',
      '  width: 22px; height: 22px; border-radius: 50%;',
      '  background: var(--surface-3); color: var(--muted);',
      '  font-size: 11px; font-weight: 700;',
      '  display: grid; place-items: center; flex-shrink: 0;',
      '}',
      '.tb-usage-item.top-1 .usage-rank { background: #fbbf24; color: #fff; }',
      '.tb-usage-item.top-2 .usage-rank { background: #94a3b8; color: #fff; }',
      '.tb-usage-item.top-3 .usage-rank { background: #d97706; color: #fff; }',
      '.tb-usage-item .usage-name {',
      '  flex: 1; font-size: 13px; color: var(--ink); min-width: 0;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.tb-usage-item .usage-bar-wrap {',
      '  width: 80px; height: 6px; border-radius: 3px;',
      '  background: var(--surface-3); overflow: hidden; flex-shrink: 0;',
      '}',
      '.tb-usage-item .usage-bar {',
      '  height: 100%; background: var(--accent); border-radius: 3px;',
      '  transition: width .3s ease;',
      '}',
      '.tb-usage-item .usage-count {',
      '  font-size: 12px; color: var(--muted); font-weight: 600;',
      '  min-width: 32px; text-align: right; flex-shrink: 0;',
      '}',
      '.tb-usage-empty {',
      '  text-align: center; padding: 20px 10px;',
      '  color: var(--faint); font-size: 12px;',
      '}',
      '.tb-usage-clear-row {',
      '  display: flex; justify-content: space-between; align-items: center;',
      '  margin-top: 10px;',
      '}',
      '.tb-usage-clear-row .hint {',
      '  font-size: 11px; color: var(--faint);',
      '}'
    ].join("\n");
    document.head.appendChild(css);
  }

  // 构建设置面板
  function buildSettings() {
    var d = document.getElementById("tbSettingsModal");
    if (d) return d;

    injectSettingsCSS();

    d = document.createElement("div");
    d.className = "tb-modal";
    d.id = "tbSettingsModal";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-label", "设置");
    d.setAttribute("aria-hidden", "true");

    var currentRaw = rawTheme();

    d.innerHTML =
      '<div class="tb-modal-card">' +
        '<h3>设置</h3>' +

        // 主题设置
        '<div class="tb-settings-section">' +
          '<div class="tb-settings-title">外观主题</div>' +
          '<div class="tb-theme-options" role="radiogroup" aria-label="主题选择">' +
            '<label class="tb-theme-option' + (currentRaw === "light" ? ' active' : '') + '" data-theme-value="light">' +
              '<input type="radio" name="tbx-settings-theme" value="light" ' + (currentRaw === "light" ? 'checked' : '') + ' aria-label="浅色模式">' +
              '<span class="tb-theme-icon">☀</span>' +
              '<span>浅色</span>' +
            '</label>' +
            '<label class="tb-theme-option' + (currentRaw === "dark" ? ' active' : '') + '" data-theme-value="dark">' +
              '<input type="radio" name="tbx-settings-theme" value="dark" ' + (currentRaw === "dark" ? 'checked' : '') + ' aria-label="深色模式">' +
              '<span class="tb-theme-icon">☾</span>' +
              '<span>深色</span>' +
            '</label>' +
            '<label class="tb-theme-option' + (currentRaw === "auto" ? ' active' : '') + '" data-theme-value="auto">' +
              '<input type="radio" name="tbx-settings-theme" value="auto" ' + (currentRaw === "auto" ? 'checked' : '') + ' aria-label="跟随系统">' +
              '<span class="tb-theme-icon">🔄</span>' +
              '<span>跟随系统</span>' +
            '</label>' +
          '</div>' +
        '</div>' +

        // 数据备份与恢复
        '<div class="tb-settings-section">' +
          '<div class="tb-settings-title">数据备份与恢复</div>' +
          '<div class="tb-data-actions">' +
            '<button class="btn" id="tbExportBtn" type="button">📤 导出设置</button>' +
            '<button class="btn" id="tbImportBtn" type="button">📥 导入设置</button>' +
          '</div>' +
          '<input type="file" id="tbSettingsFileInput" accept=".json,application/json" aria-label="导入设置文件">' +
          '<p class="tb-data-desc">导出所有个人数据（主题、收藏、表单记忆、历史记录等）为 JSON 文件，可在其他设备导入恢复。所有数据仅保存在你的浏览器中。</p>' +
        '</div>' +

        // 快捷键自定义
        '<div class="tb-settings-section">' +
          '<div class="tb-settings-title">快捷键</div>' +
          '<div class="tb-shortcut-list" id="tbShortcutList"></div>' +
          '<div class="tb-shortcut-reset-row">' +
            '<span class="hint">点击单键快捷键可重新映射</span>' +
            '<div style="display:flex;gap:6px">' +
              '<button class="btn small" id="tbShortcutGuideBtn" type="button">快捷键列表</button>' +
              '<button class="btn small" id="tbResetShortcutsBtn" type="button">恢复默认</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // 使用统计
        '<div class="tb-settings-section">' +
          '<div class="tb-settings-title">使用统计</div>' +
          '<div class="tb-usage-summary" id="tbUsageSummary">' +
            '<div class="tb-usage-stat-card">' +
              '<div class="stat-num" id="tbUsageTotal">0</div>' +
              '<div class="stat-label">总使用次数</div>' +
            '</div>' +
            '<div class="tb-usage-stat-card">' +
              '<div class="stat-num" id="tbUsageTopTool">-</div>' +
              '<div class="stat-label">最常用工具</div>' +
            '</div>' +
          '</div>' +
          '<div class="tb-usage-list" id="tbUsageList"></div>' +
          '<div class="tb-usage-clear-row">' +
            '<span class="hint">统计数据仅保存在本地浏览器</span>' +
            '<button class="btn small" id="tbClearUsageBtn" type="button">清除统计数据</button>' +
          '</div>' +
        '</div>' +

        // 版本信息
        '<div class="tb-settings-version">' +
          '免费工具箱 <strong>v' + APP_VERSION + '</strong> · 纯本地运行 · 不上传任何数据' +
        '</div>' +

        '<div style="margin-top:20px;text-align:right">' +
          '<button class="btn primary" id="tbSettingsClose" type="button">完成</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(d);

    // 点击遮罩关闭
    d.addEventListener("click", function (e) {
      if (e.target === d) closeSettings();
    });

    // 关闭按钮
    var closeBtn = d.querySelector("#tbSettingsClose");
    if (closeBtn) closeBtn.addEventListener("click", closeSettings);

    // 主题选项点击
    var themeOptions = d.querySelectorAll(".tb-theme-option");
    for (var i = 0; i < themeOptions.length; i++) {
      themeOptions[i].addEventListener("click", function () {
        var val = this.getAttribute("data-theme-value");
        if (val === "light" || val === "dark" || val === "auto") {
          applyTheme(val, true);
        }
      });
    }

    // 导出按钮
    var exportBtn = d.querySelector("#tbExportBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportSettings);

    // 导入按钮
    var importBtn = d.querySelector("#tbImportBtn");
    var fileInput = d.querySelector("#tbSettingsFileInput");
    if (importBtn && fileInput) {
      importBtn.addEventListener("click", function () {
        fileInput.click();
      });
      fileInput.addEventListener("change", handleImportFile);
    }

    // 快捷键列表渲染
    renderShortcutList(d);

    // 恢复默认快捷键
    var resetBtn = d.querySelector("#tbResetShortcutsBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (confirm("确定要将所有快捷键恢复为默认设置吗？")) {
          resetShortcuts();
          renderShortcutList(d);
          // 同步更新帮助面板中的提示
          syncHelpShortcuts();
        }
      });
    }

    // 快捷键列表按钮
    var guideBtn = d.querySelector("#tbShortcutGuideBtn");
    if (guideBtn) {
      guideBtn.addEventListener("click", function () {
        closeSettings();
        setTimeout(function () { openShortcutGuide(); }, 100);
      });
    }

    // 渲染使用统计
    renderUsageStats(d);

    // 清除统计数据按钮
    var clearUsageBtn = d.querySelector("#tbClearUsageBtn");
    if (clearUsageBtn) {
      clearUsageBtn.addEventListener("click", function () {
        if (confirm("确定要清除所有使用统计数据吗？此操作不可撤销。")) {
          clearUsageStats();
          renderUsageStats(d);
        }
      });
    }

    return d;
  }

  /* ---------- 使用统计 ---------- */
  var USAGE_STATS_KEY = "tbx-usage-stats";

  function getUsageStats() {
    try {
      var s = localStorage.getItem(USAGE_STATS_KEY);
      if (s) return JSON.parse(s) || {};
    } catch (e) {}
    return {};
  }

  function saveUsageStats(stats) {
    try {
      localStorage.setItem(USAGE_STATS_KEY, JSON.stringify(stats));
    } catch (e) {}
  }

  function trackToolUsage(toolId) {
    if (!toolId) return;
    var stats = getUsageStats();
    var now = Date.now();
    if (!stats[toolId]) {
      stats[toolId] = { count: 0, lastUsed: 0 };
    }
    stats[toolId].count += 1;
    stats[toolId].lastUsed = now;
    saveUsageStats(stats);
  }

  function clearUsageStats() {
    try {
      localStorage.removeItem(USAGE_STATS_KEY);
    } catch (e) {}
  }

  function getToolNameById(toolId) {
    for (var i = 0; i < TOOLS_META.length; i++) {
      if (TOOLS_META[i].href.replace(".html", "") === toolId) {
        return TOOLS_META[i].name;
      }
    }
    return toolId;
  }

  function renderUsageStats(modal) {
    var listEl = modal.querySelector("#tbUsageList");
    var totalEl = modal.querySelector("#tbUsageTotal");
    var topToolEl = modal.querySelector("#tbUsageTopTool");
    if (!listEl) return;

    var stats = getUsageStats();
    var entries = [];
    var totalCount = 0;

    for (var toolId in stats) {
      if (stats.hasOwnProperty(toolId)) {
        entries.push({
          id: toolId,
          name: getToolNameById(toolId),
          count: stats[toolId].count,
          lastUsed: stats[toolId].lastUsed
        });
        totalCount += stats[toolId].count;
      }
    }

    // 按使用次数降序排序
    entries.sort(function (a, b) { return b.count - a.count; });

    if (totalEl) totalEl.textContent = totalCount;
    if (topToolEl) {
      topToolEl.textContent = entries.length > 0 ? entries[0].name : "-";
      topToolEl.style.fontSize = entries.length > 0 && entries[0].name.length > 6 ? "14px" : "";
    }

    if (entries.length === 0) {
      listEl.innerHTML = '<div class="tb-usage-empty">暂无使用记录，开始使用工具吧</div>';
      return;
    }

    var maxCount = entries[0].count;
    var html = "";
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var pct = Math.round((entry.count / maxCount) * 100);
      var rankClass = i < 3 ? " top-" + (i + 1) : "";
      html +=
        '<div class="tb-usage-item' + rankClass + '">' +
          '<div class="usage-rank">' + (i + 1) + '</div>' +
          '<div class="usage-name" title="' + entry.name + '">' + entry.name + '</div>' +
          '<div class="usage-bar-wrap"><div class="usage-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="usage-count">' + entry.count + '</div>' +
        '</div>';
    }
    listEl.innerHTML = html;
  }

  // 渲染快捷键列表
  var _recordingShortcutId = null;
  var _recordingHandler = null;

  function renderShortcutList(modal) {
    var listEl = modal.querySelector("#tbShortcutList");
    if (!listEl) return;

    var shortcuts = getShortcuts();
    var html = "";

    for (var i = 0; i < shortcuts.length; i++) {
      var sc = shortcuts[i];
      var displayKey = formatShortcutKey(sc);
      var badgeClass = "tb-shortcut-badge";
      var badgeText = "";
      if (!sc.editable) {
        badgeClass += " fixed";
        badgeText = "固定";
      } else if (sc.isCustom) {
        badgeClass += " custom";
        badgeText = "自定义";
      }

      var keyClass = "tb-shortcut-key";
      if (!sc.editable) keyClass += " fixed";
      if (_recordingShortcutId === sc.id) keyClass += " recording";

      var itemClass = "tb-shortcut-item";
      if (_recordingShortcutId === sc.id) itemClass += " recording";

      html +=
        '<div class="' + itemClass + '" data-sc-id="' + sc.id + '">' +
          '<div class="tb-shortcut-name">' +
            sc.name +
            (badgeText ? ' <span class="' + badgeClass + '">' + badgeText + '</span>' : '') +
          '</div>' +
          '<span class="' + keyClass + '" data-sc-key="' + sc.id + '" ' +
                (sc.editable ? 'tabindex="0" role="button" aria-label="点击修改快捷键：' + sc.name + '"' : 'aria-label="固定快捷键，不可修改"') + '>' +
            (_recordingShortcutId === sc.id ? "按下新快捷键…" : displayKey) +
          '</span>' +
        '</div>';
    }

    listEl.innerHTML = html;

    // 绑定点击事件
    var keyEls = listEl.querySelectorAll(".tb-shortcut-key");
    for (var j = 0; j < keyEls.length; j++) {
      keyEls[j].addEventListener("click", function (e) {
        var scId = this.getAttribute("data-sc-key");
        var shortcuts2 = getShortcuts();
        var sc = null;
        for (var k = 0; k < shortcuts2.length; k++) {
          if (shortcuts2[k].id === scId) { sc = shortcuts2[k]; break; }
        }
        if (!sc || !sc.editable) return;
        startShortcutRecording(scId, modal);
      });
    }
  }

  function startShortcutRecording(scId, modal) {
    // 停止之前的录制
    stopShortcutRecording();

    _recordingShortcutId = scId;
    renderShortcutList(modal);

    // 无障碍播报：开始录制
    announce("开始录制快捷键，请按下新的快捷键组合");

    _recordingHandler = function (e) {
      e.preventDefault();
      e.stopPropagation();

      // Esc 取消录制
      if (e.key === "Escape") {
        stopShortcutRecording();
        renderShortcutList(modal);
        announce("已取消快捷键录制");
        return;
      }

      // 只接受单字符键或功能键
      var newKey = null;
      if (e.key.length === 1) {
        newKey = e.key;
      } else if (e.key === "," || e.key === "." || e.key === ";" || e.key === "'" ||
                 e.key === "[" || e.key === "]" || e.key === "\\" || e.key === "`" ||
                 e.key === "-" || e.key === "=" || e.key === "/") {
        newKey = e.key;
      }

      // 不允许 Ctrl/Alt/Meta 组合键作为单键快捷键
      if (e.ctrlKey || e.altKey || e.metaKey) {
        // 忽略组合键
        return;
      }

      if (!newKey) return;

      // 检查冲突
      var conflict = checkShortcutConflict(newKey, scId);
      if (conflict) {
        // 显示冲突警告
        var item = modal.querySelector('.tb-shortcut-item[data-sc-id="' + scId + '"]');
        if (item) {
          item.classList.add("conflict");
          var warnEl = item.querySelector(".tb-shortcut-conflict-warn");
          if (!warnEl) {
            warnEl = document.createElement("div");
            warnEl.className = "tb-shortcut-conflict-warn";
            item.appendChild(warnEl);
          }
          warnEl.textContent = "⚠ 与「" + conflict.name + "」冲突";
          setTimeout(function () {
            item.classList.remove("conflict");
            if (warnEl.parentNode) warnEl.parentNode.removeChild(warnEl);
          }, 2000);
        }
        announce("快捷键冲突：该快捷键已被其他功能占用");
        return;
      }

      // 保存新快捷键
      setShortcutKey(scId, newKey);
      stopShortcutRecording();
      renderShortcutList(modal);
      // 同步更新帮助面板
      syncHelpShortcuts();
      // 更新按钮 title
      syncButtonTitles();
      // 无障碍播报：成功更新
      announce("快捷键已更新为：" + newKey);
    };

    document.addEventListener("keydown", _recordingHandler, true);
  }

  function stopShortcutRecording() {
    if (_recordingHandler) {
      document.removeEventListener("keydown", _recordingHandler, true);
      _recordingHandler = null;
    }
    _recordingShortcutId = null;
  }

  // 同步帮助面板中的快捷键显示
  function syncHelpShortcuts() {
    var helpModal = document.getElementById("tbHelpModal");
    if (!helpModal) return;
    // 如果帮助面板已存在，重建它以更新快捷键
    // 简单起见，这里不重建，而是更新已存在的内容
    var rows = helpModal.querySelectorAll(".tb-help-row");
    if (rows.length === 0) return;

    var shortcuts = getShortcuts();
    var keyMap = {};
    for (var i = 0; i < shortcuts.length; i++) {
      keyMap[shortcuts[i].id] = formatShortcutKey(shortcuts[i]);
    }

    // 按顺序更新已知行
    var updates = [
      { id: "help", rowIdx: 0 },
      { id: "settings", rowIdx: 1 },
      { id: "palette", rowIdx: 2 },
      { id: "theme", rowIdx: 3 }
    ];
    for (var j = 0; j < updates.length; j++) {
      var row = rows[updates[j].rowIdx];
      if (row) {
        var kbd = row.querySelector(".tb-kbd");
        if (kbd) kbd.textContent = keyMap[updates[j].id] || kbd.textContent;
      }
    }
  }

  // 同步按钮 title 中的快捷键提示
  function syncButtonTitles() {
    var themeKey = getShortcutKey("theme");
    var settingsKey = getShortcutKey("settings");
    var helpKey = getShortcutKey("help");

    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      var title = b.getAttribute("title");
      if (title) {
        title = title.replace(/（快捷键 .*?）/, "（快捷键 " + (themeKey || "T") + "）");
        b.setAttribute("title", title);
      }
    });

    var settingsBtn = document.getElementById("tbSettingsBtn");
    if (settingsBtn) {
      settingsBtn.setAttribute("title", "设置（快捷键 " + (settingsKey || ",") + "）");
    }

    var helpBtn = document.getElementById("tbHelpBtn");
    if (helpBtn) {
      helpBtn.setAttribute("title", "快捷键与帮助（快捷键 " + (helpKey || "?") + "）");
    }
  }

  // 同步设置面板中的主题单选按钮状态
  function syncSettingsThemeRadio() {
    var modal = document.getElementById("tbSettingsModal");
    if (!modal) return;
    var current = rawTheme();
    var options = modal.querySelectorAll(".tb-theme-option");
    for (var i = 0; i < options.length; i++) {
      var val = options[i].getAttribute("data-theme-value");
      var radio = options[i].querySelector('input[type="radio"]');
      if (val === current) {
        options[i].classList.add("active");
        if (radio) radio.checked = true;
      } else {
        options[i].classList.remove("active");
        if (radio) radio.checked = false;
      }
    }
  }

  function openSettings() {
    var d = buildSettings();
    syncSettingsThemeRadio();
    // 主题颜色选择器注入
    if (window.TBX_Accent && !d.querySelector("[data-accent-picker]")) {
      setTimeout(function () {
        if (window.TBX_Accent && window.TBX_Accent.buildPicker) window.TBX_Accent.buildPicker(d);
      }, 50);
    }
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
    setupFocusTrap(d);
  }

  function closeSettings() {
    // 如果正在录制快捷键，先停止录制，避免录制处理器残留在全局
    if (_recordingHandler) {
      stopShortcutRecording();
    }
    var d = document.getElementById("tbSettingsModal");
    if (d) {
      d.classList.remove("open");
      d.setAttribute("aria-hidden", "true");
      teardownFocusTrap(d);
    }
  }

  window.TBX_openSettings = openSettings;
  window.TBX_closeSettings = closeSettings;

  /* ---------- 快捷键定义与管理 ---------- */
  var SHORTCUT_STORAGE_KEY = "tbx-shortcuts";

  var DEFAULT_SHORTCUTS = [
    { id: "help",     key: "?",   name: "打开帮助",         type: "key",   editable: true },
    { id: "theme",    key: "t",   name: "切换主题",         type: "key",   editable: true },
    { id: "settings", key: ",",   name: "打开设置",         type: "key",   editable: true },
    { id: "palette",  key: "k",   name: "命令面板",         type: "ctrl",  editable: false },
    { id: "tool19",   key: "1~9", name: "快速切换工具",     type: "alt",   editable: false },
    { id: "toolpn",   key: "←/→", name: "上一个/下一个工具", type: "alt",   editable: false },
    { id: "close",    key: "Esc", name: "关闭弹窗",         type: "key",   editable: false }
  ];

  function getShortcuts() {
    var overrides = {};
    try {
      var s = localStorage.getItem(SHORTCUT_STORAGE_KEY);
      if (s) overrides = JSON.parse(s) || {};
    } catch (e) {}

    return DEFAULT_SHORTCUTS.map(function (sc) {
      var customKey = overrides[sc.id];
      return {
        id: sc.id,
        key: customKey || sc.key,
        name: sc.name,
        type: sc.type,
        editable: sc.editable,
        isCustom: !!customKey
      };
    });
  }

  function getShortcutKey(id) {
    var shortcuts = getShortcuts();
    for (var i = 0; i < shortcuts.length; i++) {
      if (shortcuts[i].id === id) return shortcuts[i].key;
    }
    return null;
  }

  function setShortcutKey(id, newKey) {
    var overrides = {};
    try {
      var s = localStorage.getItem(SHORTCUT_STORAGE_KEY);
      if (s) overrides = JSON.parse(s) || {};
    } catch (e) {}

    var def = DEFAULT_SHORTCUTS.find(function (s) { return s.id === id; });
    if (def && def.key === newKey) {
      delete overrides[id];
    } else {
      overrides[id] = newKey;
    }

    try {
      localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(overrides));
    } catch (e) {}
  }

  function resetShortcuts() {
    try {
      localStorage.removeItem(SHORTCUT_STORAGE_KEY);
    } catch (e) {}
  }

  function checkShortcutConflict(newKey, excludeId) {
    var shortcuts = getShortcuts();
    var lowerKey = newKey.toLowerCase();
    for (var i = 0; i < shortcuts.length; i++) {
      if (shortcuts[i].id === excludeId) continue;
      if (shortcuts[i].key.toLowerCase() === lowerKey) return shortcuts[i];
    }
    return null;
  }

  function formatShortcutKey(sc) {
    if (sc.type === "ctrl") return "Ctrl+" + sc.key.toUpperCase();
    if (sc.type === "alt") return "Alt+" + sc.key;
    if (sc.key === "Esc") return "Esc";
    return sc.key;
  }

  /* ---------- 数据导出 ---------- */

  function exportSettings() {
    var data = {
      _meta: {
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        app: "toolbox"
      }
    };

    try {
      // 收集已知的单键数据（从 BACKUP_KEYS 派生，排除前缀类型的 prefs）
      var directKeys = {};
      Object.keys(BACKUP_KEYS).forEach(function (k) {
        if (k !== "prefs") directKeys[k] = BACKUP_KEYS[k];
      });

      Object.keys(directKeys).forEach(function (key) {
        var lsKey = directKeys[key];
        var val = localStorage.getItem(lsKey);
        if (val !== null) {
          try {
            data[key] = JSON.parse(val);
          } catch (e) {
            data[key] = val;
          }
        }
      });

      // 收集所有 tbx-prefs-* 前缀的页面偏好设置
      var prefs = {};
      var hasPrefs = false;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("tbx-prefs-") === 0) {
          var pageName = k.slice("tbx-prefs-".length);
          try {
            prefs[pageName] = JSON.parse(localStorage.getItem(k));
          } catch (e) {
            prefs[pageName] = localStorage.getItem(k);
          }
          hasPrefs = true;
        }
      }
      if (hasPrefs) {
        data.prefs = prefs;
      }

    } catch (e) {
      alert("导出失败：" + e.message);
      return;
    }

    // 生成文件名
    var dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    var filename = "toolbox-settings-" + dateStr + ".json";

    // 下载文件
    var jsonStr = JSON.stringify(data, null, 2);
    var blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);

    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 100);
  }

  /* ---------- 数据导入 ---------- */

  function handleImportFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    // 重置 input，使同一文件可重复选择
    e.target.value = "";

    var reader = new FileReader();
    reader.onload = function (evt) {
      try {
        var data = JSON.parse(evt.target.result);
        validateAndImport(data);
      } catch (err) {
        alert("导入失败：文件格式不正确，请确认是 toolbox 导出的 JSON 文件。\n\n错误详情：" + err.message);
      }
    };
    reader.onerror = function () {
      alert("读取文件失败，请重试。");
    };
    reader.readAsText(file, "utf-8");
  }

  function validateAndImport(data) {
    // 校验格式
    if (!data || typeof data !== "object") {
      alert("导入失败：文件内容无效。");
      return;
    }
    if (!data._meta || data._meta.app !== "toolbox") {
      alert("导入失败：这不是 toolbox 的备份文件。请确认文件来源。");
      return;
    }

    // 统计将恢复的数据项（从 BACKUP_KEYS 派生，排除前缀类型的 prefs）
    var items = [];
    var directKeys = {};
    Object.keys(BACKUP_KEYS).forEach(function (k) {
      if (k !== "prefs") directKeys[k] = BACKUP_KEYS[k];
    });

    Object.keys(directKeys).forEach(function (key) {
      if (data.hasOwnProperty(key)) {
        items.push(key);
      }
    });

    if (data.prefs && typeof data.prefs === "object") {
      var prefPages = Object.keys(data.prefs);
      if (prefPages.length > 0) {
        items.push("prefs (" + prefPages.length + " 个页面)");
      }
    }

    if (items.length === 0) {
      alert("备份文件中没有可导入的数据。");
      return;
    }

    // 确认对话框
    var msg = "即将导入以下数据：\n\n• " + items.join("\n• ") +
      "\n\n导出版本：v" + (data._meta.version || "未知") +
      "\n导出时间：" + (data._meta.exportedAt ? new Date(data._meta.exportedAt).toLocaleString() : "未知") +
      "\n\n⚠️  这将覆盖当前所有设置和数据，操作不可撤销。\n\n确定要继续吗？";

    if (!confirm(msg)) return;

    // 执行导入
    var restoredCount = 0;

    try {
      // 恢复直接键
      Object.keys(directKeys).forEach(function (key) {
        if (data.hasOwnProperty(key)) {
          var lsKey = directKeys[key];
          var val = data[key];
          if (typeof val === "object" && val !== null) {
            localStorage.setItem(lsKey, JSON.stringify(val));
          } else {
            localStorage.setItem(lsKey, String(val));
          }
          restoredCount++;
        }
      });

      // 恢复 prefs（多页面）
      if (data.prefs && typeof data.prefs === "object") {
        Object.keys(data.prefs).forEach(function (pageName) {
          var lsKey = "tbx-prefs-" + pageName;
          var val = data.prefs[pageName];
          if (typeof val === "object" && val !== null) {
            localStorage.setItem(lsKey, JSON.stringify(val));
          } else {
            localStorage.setItem(lsKey, String(val));
          }
          restoredCount++;
        });
      }
    } catch (e) {
      alert("导入过程中出错：" + e.message + "\n部分数据可能已被恢复。");
      return;
    }

    alert("成功导入 " + restoredCount + " 项数据。\n页面即将刷新以应用所有设置。");

    // 刷新页面
    setTimeout(function () {
      location.reload();
    }, 300);
  }

  /* ---------------- 全局拖拽覆盖层 ---------------- */
  var dragOverlayEl = null;
  var dragCounter = 0;

  // 根据当前页面返回拖拽提示文字
  function getDragHint() {
    var page = location.pathname.split("/").pop() || "index.html";
    var hints = {
      "image-tools.html": { icon: "🖼️", text: "释放图片即可处理" },
      "idphoto-tools.html": { icon: "🪪", text: "释放证件照即可处理" },
      "ocr-tools.html":   { icon: "🔍", text: "释放图片即可识别文字" },
      "pdf-tools.html":   { icon: "📄", text: "释放 PDF 文件即可处理" },
      "file-tools.html":  { icon: "📁", text: "释放文件即可处理" },
      "sheet-tools.html": { icon: "📊", text: "释放表格文件即可处理" },
      "av-tools.html":    { icon: "🎬", text: "释放音视频文件即可处理" },
      "asr-tools.html":   { icon: "🎤", text: "释放音频文件即可转文字" },
      "capture-tools.html": { icon: "🎥", text: "释放视频文件即可处理" },
      "qr-tools.html":    { icon: "📱", text: "释放二维码图片即可解析" },
      "player.html":      { icon: "▶️", text: "释放音视频文件即可播放" }
    };
    return hints[page] || { icon: "📁", text: "释放文件即可处理" };
  }

  function injectDragOverlayCSS() {
    if (document.getElementById("tbx-drag-css")) return;
    var css = document.createElement("style");
    css.id = "tbx-drag-css";
    css.textContent = [
      '/* ============================================================',
      '   全局拖拽覆盖层 Global Drag Overlay',
      '   ============================================================ */',
      '.tbx-drag-overlay {',
      '  position: fixed; inset: 0;',
      '  background: color-mix(in srgb, var(--surface) 80%, transparent);',
      '  backdrop-filter: blur(6px);',
      '  -webkit-backdrop-filter: blur(6px);',
      '  border: 4px dashed var(--accent);',
      '  border-radius: 0;',
      '  display: none;',
      '  z-index: 9998;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex-direction: column;',
      '  gap: 18px;',
      '  pointer-events: none;',
      '  opacity: 0;',
      '  transition: opacity .18s ease;',
      '}',
      '.tbx-drag-overlay.show {',
      '  display: flex;',
      '  opacity: 1;',
      '}',
      '.tbx-drag-overlay .drag-icon {',
      '  font-size: 72px;',
      '  line-height: 1;',
      '  filter: drop-shadow(0 4px 12px rgba(0,0,0,.15));',
      '}',
      '.tbx-drag-overlay .drag-text {',
      '  font-size: 26px;',
      '  font-weight: 700;',
      '  color: var(--accent);',
      '  letter-spacing: .02em;',
      '}',
      '.tbx-drag-overlay .drag-sub {',
      '  font-size: 14px;',
      '  color: var(--muted);',
      '  margin-top: -8px;',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .tbx-drag-overlay { transition: none; }',
      '}',
      '@media (max-width: 640px) {',
      '  .tbx-drag-overlay .drag-icon { font-size: 56px; }',
      '  .tbx-drag-overlay .drag-text { font-size: 20px; }',
      '  .tbx-drag-overlay { border-width: 3px; }',
      '}'
    ].join("\n");
    document.head.appendChild(css);
  }

  function buildDragOverlay() {
    if (dragOverlayEl) return;

    injectDragOverlayCSS();

    dragOverlayEl = document.createElement("div");
    dragOverlayEl.className = "tbx-drag-overlay";
    dragOverlayEl.id = "tbxDragOverlay";
    dragOverlayEl.setAttribute("aria-hidden", "true");

    var hint = getDragHint();
    dragOverlayEl.innerHTML =
      '<div class="drag-icon" aria-hidden="true">' + hint.icon + '</div>' +
      '<div class="drag-text">' + hint.text + '</div>' +
      '<div class="drag-sub">所有处理均在本地完成，不会上传服务器</div>';

    document.body.appendChild(dragOverlayEl);
  }

  function showDragOverlay() {
    buildDragOverlay();
    // 更新提示文字（可能已切换 tab 或页面状态变化）
    var hint = getDragHint();
    var iconEl = dragOverlayEl.querySelector(".drag-icon");
    var textEl = dragOverlayEl.querySelector(".drag-text");
    if (iconEl) iconEl.textContent = hint.icon;
    if (textEl) textEl.textContent = hint.text;

    dragOverlayEl.classList.add("show");
    dragOverlayEl.setAttribute("aria-hidden", "false");
  }

  function hideDragOverlay() {
    if (!dragOverlayEl) return;
    dragOverlayEl.classList.remove("show");
    dragOverlayEl.setAttribute("aria-hidden", "true");
  }

  function isFileDrag(e) {
    if (!e.dataTransfer) return false;
    var types = e.dataTransfer.types;
    if (!types) return false;
    // 兼容 DOMStringList 和 Array
    if (typeof types.contains === "function") return types.contains("Files");
    if (Array.isArray(types)) return types.indexOf("Files") !== -1;
    // 兜底：转为数组判断
    return Array.prototype.indexOf.call(types, "Files") !== -1;
  }

  function initDragDrop() {
    buildDragOverlay();

    // 使用计数器处理嵌套元素的 dragenter/dragleave
    document.addEventListener("dragenter", function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) {
        showDragOverlay();
      }
    }, true);

    document.addEventListener("dragover", function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      // 确保覆盖层持续显示
      if (dragCounter > 0 && !dragOverlayEl.classList.contains("show")) {
        showDragOverlay();
      }
    }, true);

    document.addEventListener("dragleave", function (e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        hideDragOverlay();
      }
    }, true);

    document.addEventListener("drop", function (e) {
      if (!isFileDrag(e)) return;
      dragCounter = 0;
      hideDragOverlay();
      // 不阻止默认行为，让页面自己的 drop handler 处理
    }, true);

    // 窗口失焦时重置（防止拖拽到窗口外后计数器异常）
    window.addEventListener("blur", function () {
      dragCounter = 0;
      hideDragOverlay();
    });
  }

  /* ---------------- 顶栏按钮 ---------------- */
  function buildActions() {
    var inner = document.querySelector(".topbar-inner");
    if (!inner || inner.querySelector(".tb-actions")) return;
    var box = document.createElement("div");
    box.className = "tb-actions";
    box.innerHTML =
      '<button class="tb-icon-btn" data-theme-toggle type="button" aria-label="切换主题">☾</button>' +
      '<button class="tb-icon-btn" type="button" id="tbSettingsBtn" aria-label="设置" title="设置（快捷键 ,）">⚙</button>' +
      '<button class="tb-icon-btn" type="button" id="tbHelpBtn" aria-label="快捷键与帮助" title="快捷键与帮助（快捷键 ?）">?</button>';
    inner.appendChild(box);
    var tb = box.querySelector("[data-theme-toggle]");
    tb.addEventListener("click", function () { applyTheme(nextTheme(), true); });
    box.querySelector("#tbSettingsBtn").addEventListener("click", openSettings);
    box.querySelector("#tbHelpBtn").addEventListener("click", openShortcutGuide);
  }

  /* ---------------- 无障碍 ---------------- */

  // 注入无障碍相关 CSS
  function injectA11yCSS() {
    if (document.getElementById("tbx-a11y-css")) return;
    var css = document.createElement("style");
    css.id = "tbx-a11y-css";
    css.textContent = [
      '/* ============================================================',
      '   无障碍 Accessibility',
      '   ============================================================ */',
      '',
      '/* 跳转到主要内容链接 */',
      '.tbx-skip-link {',
      '  position: absolute;',
      '  top: -100px;',
      '  left: 50%;',
      '  transform: translateX(-50%);',
      '  background: var(--accent);',
      '  color: var(--accent-ink);',
      '  padding: 12px 24px;',
      '  border-radius: 0 0 10px 10px;',
      '  z-index: 10000;',
      '  text-decoration: none;',
      '  font-weight: 600;',
      '  font-size: 14px;',
      '  transition: top .2s ease;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,.15);',
      '}',
      '.tbx-skip-link:focus {',
      '  top: 0;',
      '  outline: none;',
      '}',
      '.tbx-skip-link:focus-visible {',
      '  top: 0;',
      '  outline: 2px solid var(--accent-ink);',
      '  outline-offset: -4px;',
      '}',
      '',
      '/* 屏幕阅读器专用：视觉隐藏但可被读屏软件读取 */',
      '.tbx-sr-only {',
      '  position: absolute;',
      '  width: 1px;',
      '  height: 1px;',
      '  padding: 0;',
      '  margin: -1px;',
      '  overflow: hidden;',
      '  clip: rect(0, 0, 0, 0);',
      '  white-space: nowrap;',
      '  border: 0;',
      '}',
      '',
      '/* 键盘焦点可见样式（仅键盘导航时显示） */',
      'a:focus-visible,',
      'button:focus-visible,',
      'input:focus-visible,',
      'select:focus-visible,',
      'textarea:focus-visible,',
      '[role="button"]:focus-visible,',
      '[role="tab"]:focus-visible,',
      '[role="option"]:focus-visible,',
      '.tb-icon-btn:focus-visible,',
      '.drop:focus-visible,',
      '.card:focus-visible,',
      '.tb-theme-option:focus-visible {',
      '  outline: 2px solid var(--accent);',
      '  outline-offset: 2px;',
      '  border-radius: 6px;',
      '}',
      '',
      '/* 对使用鼠标的用户隐藏焦点环 */',
      'a:focus:not(:focus-visible),',
      'button:focus:not(:focus-visible),',
      'input:focus:not(:focus-visible),',
      'select:focus:not(:focus-visible),',
      'textarea:focus:not(:focus-visible),',
      '.tb-icon-btn:focus:not(:focus-visible) {',
      '  outline: none;',
      '}',
      '',
      '/* 为不支持 :focus-visible 的浏览器提供降级方案 */',
      'html.tbx-keyboard-user a:focus,',
      'html.tbx-keyboard-user button:focus,',
      'html.tbx-keyboard-user input:focus,',
      'html.tbx-keyboard-user select:focus,',
      'html.tbx-keyboard-user textarea:focus,',
      'html.tbx-keyboard-user .tb-icon-btn:focus {',
      '  outline: 2px solid var(--accent);',
      '  outline-offset: 2px;',
      '}',
      '',
      '/* 减少动效偏好 */',
      '@media (prefers-reduced-motion: reduce) {',
      '  .tbx-skip-link { transition: none; }',
      '}'
    ].join("\n");
    document.head.appendChild(css);
  }

  // 创建跳转到主要内容链接
  function buildSkipLink() {
    if (document.getElementById("tbxSkipLink")) return;

    // 确定主内容目标
    var mainTarget = document.querySelector("main") || document.querySelector(".wrap") || document.body;
    var targetId = "tbx-main-content";
    if (!mainTarget.id) mainTarget.id = targetId;

    var link = document.createElement("a");
    link.id = "tbxSkipLink";
    link.className = "tbx-skip-link";
    link.href = "#" + mainTarget.id;
    link.textContent = "跳转到主要内容";
    link.setAttribute("aria-label", "跳转到主要内容，跳过导航");

    // 插入到 body 最前面
    if (document.body.firstChild) {
      document.body.insertBefore(link, document.body.firstChild);
    } else {
      document.body.appendChild(link);
    }

    // 点击时确保目标获得焦点（对于非交互元素）
    link.addEventListener("click", function () {
      setTimeout(function () {
        var target = document.getElementById(mainTarget.id);
        if (target) {
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: false });
          // 稍后移除 tabindex，避免影响正常交互
          setTimeout(function () {
            if (target.getAttribute("tabindex") === "-1") {
              target.removeAttribute("tabindex");
            }
          }, 1000);
        }
      }, 50);
    });
  }

  // 创建 ARIA live region 用于状态播报
  var liveRegionEl = null;
  function buildLiveRegion() {
    if (liveRegionEl) return;

    liveRegionEl = document.createElement("div");
    liveRegionEl.id = "tbxLiveRegion";
    liveRegionEl.className = "tbx-sr-only";
    liveRegionEl.setAttribute("aria-live", "polite");
    liveRegionEl.setAttribute("aria-atomic", "true");
    document.body.appendChild(liveRegionEl);
  }

  // 全局状态播报函数，供工具页面调用
  function announce(text) {
    if (!liveRegionEl) buildLiveRegion();
    if (!liveRegionEl) return;
    // 清空后再设置，确保读屏软件每次都能播报
    liveRegionEl.textContent = "";
    // 使用 requestAnimationFrame 确保清空生效后再写入
    requestAnimationFrame(function () {
      liveRegionEl.textContent = text;
    });
  }

  // 键盘/鼠标用户检测（为不支持 :focus-visible 的浏览器提供降级）
  function initFocusVisiblePolyfill() {
    // 检测是否原生支持 :focus-visible
    var supportsFocusVisible = false;
    try {
      document.querySelector(":focus-visible");
      supportsFocusVisible = true;
    } catch (e) {
      supportsFocusVisible = false;
    }

    if (supportsFocusVisible) return; // 原生支持，无需 polyfill

    function onKeyDown(e) {
      if (e.key === "Tab") {
        document.documentElement.classList.add("tbx-keyboard-user");
      }
    }
    function onMouseDown() {
      document.documentElement.classList.remove("tbx-keyboard-user");
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("touchstart", onMouseDown, true);
  }

  function a11y() {
    injectA11yCSS();
    buildSkipLink();
    buildLiveRegion();
    initFocusVisiblePolyfill();

    // 暴露全局播报函数
    window.TBX_announce = announce;

    var nav = document.querySelector(".topnav");
    if (nav) {
      nav.setAttribute("aria-label", "工具导航");
      nav.setAttribute("tabindex", "0");
      // 让当前页的导航项自动滚入视野（导航变多后不再默认可见）
      var act = nav.querySelector("a.active");
      if (act && nav.scrollWidth > nav.clientWidth) {
        setTimeout(function () {
          var l = act.offsetLeft - 12;
          try { nav.scrollTo({ left: l, behavior: "smooth" }); } catch (e) { nav.scrollLeft = l; }
        }, 80);
      }
      // 鼠标滚轮横滚
      nav.addEventListener("wheel", function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.dX) && nav.scrollWidth > nav.clientWidth) {
          nav.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });
    }
    document.querySelectorAll(".topnav a").forEach(function (a) {
      if (a.classList.contains("active")) a.setAttribute("aria-current", "page");
      if (!a.getAttribute("title")) a.setAttribute("title", a.textContent.trim());
    });
    document.querySelectorAll("button.btn").forEach(function (b) {
      if (!b.getAttribute("aria-label") && b.textContent.trim()) b.setAttribute("aria-label", b.textContent.trim());
    });
    document.querySelectorAll("input, select, textarea").forEach(function (el) {
      if (el.getAttribute("aria-label")) return;
      var id = el.id;
      var lab = id ? document.querySelector('label[for="' + id + '"]') : null;
      if (!lab && el.parentElement) lab = el.parentElement.querySelector("label");
      var txt = lab && lab.textContent ? lab.textContent.trim() : "";
      if (txt) el.setAttribute("aria-label", txt.replace(/\s+/g, " ").slice(0, 60));
    });
  }

  /* ---------------- 模态框焦点陷阱 ---------------- */
  var focusTrapStack = []; // 支持多个模态框嵌套时的焦点栈

  // 获取模态框内所有可聚焦元素
  function getFocusableElements(container) {
    if (!container) return [];
    var selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ];
    var nodes = container.querySelectorAll(selectors.join(","));
    // 过滤掉不可见元素
    var visible = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var style = window.getComputedStyle(el);
      if (style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null) {
        visible.push(el);
      }
    }
    return visible;
  }

  // 为指定模态框设置焦点陷阱
  function setupFocusTrap(modalEl) {
    if (!modalEl) return null;

    var trap = {
      modal: modalEl,
      previousFocus: document.activeElement,
      handler: null
    };

    // 找到第一个和最后一个可聚焦元素
    var focusables = getFocusableElements(modalEl);
    var firstEl = focusables[0];
    var lastEl = focusables[focusables.length - 1];

    // 聚焦第一个元素（如果有）
    if (firstEl) {
      setTimeout(function () { firstEl.focus(); }, 20);
    }

    trap.handler = function (e) {
      if (e.key !== "Tab") return;

      var currentFocusables = getFocusableElements(modalEl);
      if (currentFocusables.length === 0) {
        e.preventDefault();
        return;
      }

      var first = currentFocusables[0];
      var last = currentFocusables[currentFocusables.length - 1];

      if (e.shiftKey) {
        // Shift+Tab：如果在第一个元素上，跳到最后一个
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab：如果在最后一个元素上，跳到第一个
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    modalEl.addEventListener("keydown", trap.handler);
    focusTrapStack.push(trap);

    return trap;
  }

  // 移除焦点陷阱并恢复焦点
  function teardownFocusTrap(modalEl) {
    // 从栈中找到对应的 trap
    var trapIndex = -1;
    for (var i = focusTrapStack.length - 1; i >= 0; i--) {
      if (focusTrapStack[i].modal === modalEl) {
        trapIndex = i;
        break;
      }
    }

    if (trapIndex === -1) return;

    var trap = focusTrapStack[trapIndex];
    focusTrapStack.splice(trapIndex, 1);

    if (trap.handler && modalEl) {
      modalEl.removeEventListener("keydown", trap.handler);
    }

    // 恢复之前的焦点
    if (trap.previousFocus && typeof trap.previousFocus.focus === "function") {
      setTimeout(function () {
        trap.previousFocus.focus();
      }, 10);
    }
  }

  /* ---------------- 版本号 ---------------- */
  function version() {
    var f = document.querySelector("footer") || document.querySelector(".site-foot") || document.querySelector(".foot");
    if (!f || f.querySelector(".tb-version")) return;
    var s = document.createElement("span");
    s.className = "tb-version";
    s.style.display = "block";
    s.style.marginTop = "10px";
    s.textContent = "v" + APP_VERSION;
    f.appendChild(s);
  }

  /* ---------------- 预取 ---------------- */
  function prefetch() {
    var prefetched = {};
    document.querySelectorAll(".topnav a, .card a, a[href$='.html']").forEach(function (a) {
      a.addEventListener("mouseenter", function () {
        var href = a.getAttribute("href");
        if (!href || prefetched[href]) return;
        prefetched[href] = true;
        a.dataset.prefetched = "1";
        var link = document.createElement("link");
        link.rel = "prefetch";
        link.href = href;
        document.head.appendChild(link);
      }, { once: true });
    });
  }

  /* ---------------- 首页工具排序 ---------------- */
  var HOME_SORT_KEY = "tbx-home-sort";

  function getHomeSort() {
    try {
      var s = localStorage.getItem(HOME_SORT_KEY);
      if (s === "usage" || s === "recent" || s === "default") return s;
    } catch (e) {}
    return "default";
  }

  function setHomeSort(sort) {
    try {
      localStorage.setItem(HOME_SORT_KEY, sort);
    } catch (e) {}
  }

  function injectHomeSortCSS() {
    if (document.getElementById("tbx-home-sort-css")) return;
    var css = document.createElement("style");
    css.id = "tbx-home-sort-css";
    css.textContent = [
      '/* ============================================================',
      '   首页工具排序 Home Sort',
      '   ============================================================ */',
      '.tb-home-sort {',
      '  display: flex; align-items: center; gap: 8px;',
      '  font-size: 13px; color: var(--muted);',
      '}',
      '.tb-home-sort label { font-weight: 500; }',
      '.tb-home-sort select {',
      '  padding: 6px 10px;',
      '  border: 1px solid var(--line);',
      '  border-radius: 8px;',
      '  background: var(--surface-2);',
      '  color: var(--ink);',
      '  font-size: 13px; font-family: inherit;',
      '  cursor: pointer;',
      '  transition: border-color .15s;',
      '  outline: none;',
      '}',
      '.tb-home-sort select:hover { border-color: var(--accent-soft); }',
      '.tb-home-sort select:focus { border-color: var(--accent); }',
      '',
      '/* 适配：工具网格上方的排序控件 */',
      '.cards-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  margin-bottom: 16px;',
      '}',
      '@media (max-width: 640px) {',
      '  .cards-header { flex-direction: column; align-items: flex-start; gap: 10px; }',
      '}'
    ].join("\n");
    document.head.appendChild(css);
  }

  function initHomepageSort() {
    var page = location.pathname.split("/").pop() || "index.html";
    if (page !== "index.html") return;

    var cards = document.querySelector(".cards");
    if (!cards) return;

    injectHomeSortCSS();

    // 找到或创建卡片头部
    var header = document.querySelector(".cards-header");
    if (!header) {
      header = document.createElement("div");
      header.className = "cards-header";
      // 尝试找到现有的标题元素
      var prevHeading = cards.previousElementSibling;
      var sectionTitle = null;
      if (prevHeading && (prevHeading.tagName === "H2" || prevHeading.tagName === "H3")) {
        sectionTitle = prevHeading;
      }
      if (sectionTitle) {
        header.appendChild(sectionTitle.cloneNode(true));
        sectionTitle.style.display = "none";
      } else {
        var title = document.createElement("h2");
        title.textContent = "全部工具";
        title.style.margin = "0";
        title.style.fontSize = "18px";
        header.appendChild(title);
      }
      cards.parentNode.insertBefore(header, cards);
    }

    // 创建排序选择器
    var sortWrap = document.createElement("div");
    sortWrap.className = "tb-home-sort";
    sortWrap.innerHTML =
      '<label for="tbHomeSortSelect">排序方式：</label>' +
      '<select id="tbHomeSortSelect" aria-label="工具排序方式">' +
        '<option value="default">默认</option>' +
        '<option value="usage">使用频率</option>' +
        '<option value="recent">最近使用</option>' +
      '</select>';
    header.appendChild(sortWrap);

    var select = sortWrap.querySelector("#tbHomeSortSelect");
    var currentSort = getHomeSort();
    select.value = currentSort;

    select.addEventListener("change", function () {
      var sort = select.value;
      setHomeSort(sort);
      applyCardSort(sort, cards);
    });

    // 初始应用排序
    if (currentSort !== "default") {
      applyCardSort(currentSort, cards);
    }
  }

  function applyCardSort(sort, cardsEl) {
    var cardElements = cardsEl.querySelectorAll(".card");
    if (cardElements.length === 0) return;

    if (sort === "default") {
      // 恢复默认顺序：按原始 DOM 顺序
      var originalOrder = Array.prototype.slice.call(cardElements);
      // 使用 data-original-index 记录原始位置
      for (var i = 0; i < originalOrder.length; i++) {
        originalOrder[i].dataset.originalIndex = i;
      }
      originalOrder.sort(function (a, b) {
        return parseInt(a.dataset.originalIndex, 10) - parseInt(b.dataset.originalIndex, 10);
      });
      for (var j = 0; j < originalOrder.length; j++) {
        cardsEl.appendChild(originalOrder[j]);
      }
      return;
    }

    var stats = getUsageStats();
    var cardsWithData = [];

    for (var k = 0; k < cardElements.length; k++) {
      var card = cardElements[k];
      // 从卡片链接中提取工具 ID
      var link = card.querySelector("a[href$='.html']");
      var href = link ? link.getAttribute("href") : "";
      var toolId = href.replace(".html", "");
      var stat = stats[toolId] || { count: 0, lastUsed: 0 };

      // 记录原始索引用于默认排序回退
      if (card.dataset.originalIndex === undefined) {
        card.dataset.originalIndex = k;
      }

      cardsWithData.push({
        el: card,
        count: stat.count,
        lastUsed: stat.lastUsed,
        originalIndex: k
      });
    }

    // 排序
    if (sort === "usage") {
      cardsWithData.sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.originalIndex - b.originalIndex;
      });
    } else if (sort === "recent") {
      cardsWithData.sort(function (a, b) {
        if (b.lastUsed !== a.lastUsed) return b.lastUsed - a.lastUsed;
        return a.originalIndex - b.originalIndex;
      });
    }

    // 重新排列 DOM
    var frag = document.createDocumentFragment();
    for (var m = 0; m < cardsWithData.length; m++) {
      frag.appendChild(cardsWithData[m].el);
    }
    cardsEl.appendChild(frag);
  }

  /* ---------------- 快捷键 ---------------- */
  function keys() {
    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable);

      // 快捷键录制模式下，不处理全局快捷键
      if (_recordingShortcutId) return;

      // Ctrl+K / Cmd+K 打开命令面板（即使在输入框中也生效）
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteEl && paletteEl.classList.contains("open")) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }

      if (e.key === "Escape") {
        // 按焦点陷阱栈顺序关闭：最后打开的先关闭
        if (focusTrapStack.length > 0) {
          var topTrap = focusTrapStack[focusTrapStack.length - 1];
          var topModal = topTrap.modal;

          if (topModal === paletteEl) {
            closePalette();
          } else if (topModal.id === "tbSettingsModal") {
            closeSettings();
          } else if (topModal.id === "tbHelpModal") {
            closeHelp();
          } else if (topModal.id === "tbxShortcutGuide") {
            closeShortcutGuide();
          } else {
            // 未知模态框，尝试通用关闭方式
            topModal.classList.remove("open");
            topModal.setAttribute("aria-hidden", "true");
            teardownFocusTrap(topModal);
          }
          e.preventDefault();
          return;
        }
        // 兜底：没有焦点栈时，按固定顺序检查
        if (paletteEl && paletteEl.classList.contains("open")) {
          closePalette();
          return;
        }
        var settingsModal = document.getElementById("tbSettingsModal");
        if (settingsModal && settingsModal.classList.contains("open")) {
          closeSettings();
          return;
        }
        var helpModal = document.getElementById("tbHelpModal");
        if (helpModal && helpModal.classList.contains("open")) {
          closeHelp();
          return;
        }
        var sgModal = document.getElementById("tbxShortcutGuide");
        if (sgModal && sgModal.classList.contains("open")) {
          closeShortcutGuide();
          return;
        }
        return;
      }
      if (typing) return;
      if (e.altKey && e.key >= "1" && e.key <= "9") {
        var i = parseInt(e.key, 10) - 1;
        if (TOOLS[i]) { e.preventDefault(); location.href = TOOLS[i].href; }
        return;
      }
      if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        var cur = location.pathname.split("/").pop() || "index.html";
        var idx = TOOLS.findIndex(function (t) { return t.href === cur; });
        if (idx < 0) idx = 0;
        var n = e.key === "ArrowRight" ? (idx + 1) % TOOLS.length : (idx - 1 + TOOLS.length) % TOOLS.length;
        e.preventDefault(); location.href = TOOLS[n].href;
        return;
      }

      // 可自定义的单键快捷键（不区分大小写）
      var helpKey = getShortcutKey("help");
      var settingsKey = getShortcutKey("settings");
      var themeKey = getShortcutKey("theme");

      var ek = e.key;
      var ekLower = ek.toLowerCase();

      if (helpKey && (ek === helpKey || ekLower === helpKey.toLowerCase())) { e.preventDefault(); openShortcutGuide(); return; }
      if (settingsKey && (ek === settingsKey || ekLower === settingsKey.toLowerCase())) { e.preventDefault(); openSettings(); return; }
      if (themeKey && (ek === themeKey || ekLower === themeKey.toLowerCase())) {
        applyTheme(nextTheme(), true);
        return;
      }
    });
  }

  /* ---------- 移动端优化 ---------- */
  function injectMobileCSS() {
    if (document.getElementById("tbx-mobile-css")) return;
    var css = document.createElement("style");
    css.id = "tbx-mobile-css";
    css.textContent = [
      '/* ============================================================',
      '   移动端优化 Mobile Optimizations',
      '   ============================================================ */',
      '',
      '/* 安全区域 CSS 变量 */',
      ':root {',
      '  --safe-top: env(safe-area-inset-top, 0px);',
      '  --safe-bottom: env(safe-area-inset-bottom, 0px);',
      '  --safe-left: env(safe-area-inset-left, 0px);',
      '  --safe-right: env(safe-area-inset-right, 0px);',
      '}',
      '',
      '/* 顶部栏安全区域适配 */',
      '.tbx-touch .topbar,',
      '.tbx-mobile .topbar {',
      '  padding-top: var(--safe-top) !important;',
      '}',
      '',
      '/* 触摸设备：按钮最小点击区域 44px */',
      '.tbx-touch .btn,',
      '.tbx-touch .tb-icon-btn,',
      '.tbx-touch .topnav a,',
      '.tbx-touch .tabs .tab,',
      '.tbx-touch .seg button,',
      '.tbx-touch .card a {',
      '  min-height: 44px;',
      '  min-width: 44px;',
      '  touch-action: manipulation;',
      '  -webkit-tap-highlight-color: transparent;',
      '}',
      '',
      '.tbx-touch .tb-icon-btn {',
      '  width: 44px; height: 44px;',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  font-size: 18px;',
      '}',
      '',
      '/* 防止双击缩放 */',
      '.tbx-touch button,',
      '.tbx-touch a,',
      '.tbx-touch [role="button"],',
      '.tbx-touch input[type="checkbox"],',
      '.tbx-touch input[type="radio"] {',
      '  touch-action: manipulation;',
      '  -webkit-tap-highlight-color: transparent;',
      '}',
      '',
      '/* 移动端顶部导航：横向滚动吸附 + 隐藏滚动条 */',
      '.tbx-mobile .topnav {',
      '  scroll-snap-type: x mandatory;',
      '  -webkit-overflow-scrolling: touch;',
      '  scrollbar-width: none;',
      '  -ms-overflow-style: none;',
      '  overflow-x: auto;',
      '  overflow-y: hidden;',
      '  -webkit-overflow-scrolling: touch;',
      '}',
      '.tbx-mobile .topnav::-webkit-scrollbar { display: none; }',
      '.tbx-mobile .topnav a {',
      '  scroll-snap-align: start;',
      '  flex-shrink: 0;',
      '  padding: 12px 16px;',
      '  font-size: 14px;',
      '}',
      '',
      '/* 移动端弹窗优化 */',
      '.tbx-mobile .tb-modal { padding: 10px; }',
      '.tbx-mobile .tb-modal-card {',
      '  margin: 0;',
      '  max-height: calc(100vh - 20px - var(--safe-top) - var(--safe-bottom));',
      '  overflow-y: auto;',
      '  -webkit-overflow-scrolling: touch;',
      '  padding-bottom: calc(24px + var(--safe-bottom));',
      '}',
      '',
      '/* 移动端命令面板优化 */',
      '.tbx-mobile .tbx-palette { padding: 10px; padding-top: 6vh; }',
      '.tbx-mobile .tbx-palette-panel { max-height: 82vh; }',
      '',
      '/* 移动端设置面板：增加底部安全区域 */',
      '.tbx-mobile #tbSettingsModal .tb-modal-card {',
      '  max-width: none;',
      '  margin: 10px;',
      '}',
      '',
      '/* 移动端帮助面板优化 */',
      '.tbx-mobile #tbHelpModal .tb-modal-card {',
      '  margin: 10px;',
      '  max-height: calc(100vh - 20px);',
      '  overflow-y: auto;',
      '  -webkit-overflow-scrolling: touch;',
      '}',
      '',
      '/* 防止过度滚动/下拉刷新（工具交互区域） */',
      '.tbx-touch main,',
      '.tbx-touch .tool-area,',
      '.tbx-touch .workspace {',
      '  overscroll-behavior: contain;',
      '}',
      '',
      '/* 移动端拖拽区域：改为点击提示 */',
      '.tbx-touch .drop-hint,',
      '.tbx-touch [class*="drop"] [class*="hint"],',
      '.tbx-touch .drop-zone .hint-text {',
      '  display: none !important;',
      '}',
      '.tbx-touch .drop-zone::after {',
      '  content: "点击选择文件";',
      '  display: block;',
      '  font-size: 14px;',
      '  color: var(--muted);',
      '  margin-top: 8px;',
      '}',
      '.tbx-touch .drop-zone {',
      '  cursor: pointer;',
      '  min-height: 120px;',
      '}',
      '',
      '/* 移动端卡片网格：更紧凑 */',
      '.tbx-mobile .cards {',
      '  grid-template-columns: repeat(2, 1fr) !important;',
      '  gap: 12px !important;',
      '}',
      '.tbx-mobile .card {',
      '  padding: 16px 12px !important;',
      '}',
      '.tbx-mobile .card .card-icon {',
      '  font-size: 28px !important;',
      '  margin-bottom: 8px !important;',
      '}',
      '.tbx-mobile .card .card-name {',
      '  font-size: 13px !important;',
      '}',
      '',
      '/* 移动端表单输入优化 */',
      '.tbx-mobile input,',
      '.tbx-mobile select,',
      '.tbx-mobile textarea {',
      '  font-size: 16px; /* 防止 iOS 自动缩放 */',
      '}',
      '',
      '/* 移动端底部安全区域填充（页面底部） */',
      '.tbx-mobile footer,',
      '.tbx-mobile .site-foot,',
      '.tbx-mobile .foot {',
      '  padding-bottom: calc(20px + var(--safe-bottom));',
      '}',
      '',
      '/* 移动端快捷键编辑器：更大的点击区域 */',
      '.tbx-mobile .tb-shortcut-item {',
      '  padding: 14px 14px;',
      '}',
      '.tbx-mobile .tb-shortcut-key {',
      '  min-height: 36px;',
      '  min-width: 60px;',
      '  font-size: 13px;',
      '  padding: 8px 14px;',
      '}'
    ].join("\n");
    document.head.appendChild(css);
  }

  function ensureViewportMeta() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no";
      document.head.appendChild(meta);
    } else {
      var content = meta.getAttribute("content") || "";
      var parts = content.split(",").map(function (p) { return p.trim(); });
      var hasViewportFit = false;
      var hasMaxScale = false;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].indexOf("viewport-fit") === 0) hasViewportFit = true;
        if (parts[i].indexOf("maximum-scale") === 0) hasMaxScale = true;
      }
      if (!hasViewportFit) parts.push("viewport-fit=cover");
      if (!hasMaxScale) parts.push("maximum-scale=1.0");
      meta.setAttribute("content", parts.join(", "));
    }
  }

  function enhanceTopnavForMobile() {
    var nav = document.querySelector(".topnav");
    if (!nav) return;

    // 为触摸设备添加触摸滑动支持（已通过 CSS scroll-snap 实现）
    // 这里添加触摸结束后的吸附优化

    // 检测是否为移动端
    var isMobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    if (!isMobile) return;

    // 添加渐变遮罩指示可滚动（左右两端）
    if (nav.scrollWidth > nav.clientWidth + 5) {
      nav.classList.add("tbx-nav-scrollable");
    }

    // 监听滚动，更新渐变遮罩状态
    nav.addEventListener("scroll", function () {
      if (nav.scrollWidth <= nav.clientWidth + 5) {
        nav.classList.remove("tbx-nav-scrollable");
        return;
      }
      nav.classList.add("tbx-nav-scrollable");
    }, { passive: true });

    // 窗口大小变化时重新检测
    window.addEventListener("resize", function () {
      if (nav.scrollWidth > nav.clientWidth + 5) {
        nav.classList.add("tbx-nav-scrollable");
      } else {
        nav.classList.remove("tbx-nav-scrollable");
      }
    });
  }

  function preventPullToRefresh() {
    // 通过 CSS overscroll-behavior 已实现大部分效果
    // 这里为需要额外控制的工具区域添加 class
    var main = document.querySelector("main") || document.querySelector(".container") || document.querySelector(".workspace");
    if (main) main.classList.add("tool-area");
  }

  function initMobileOptimizations() {
    // 检测触摸设备
    var isTouch = "ontouchstart" in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
    if (isTouch) {
      document.documentElement.classList.add("tbx-touch");
    }

    // 检测小屏幕（移动端）
    var isMobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    if (isMobile) {
      document.documentElement.classList.add("tbx-mobile");
    }

    // 监听屏幕尺寸变化，动态切换 mobile class
    if (window.matchMedia) {
      var mql = window.matchMedia("(max-width: 640px)");
      var handleMobileChange = function (e) {
        if (e.matches) {
          document.documentElement.classList.add("tbx-mobile");
        } else {
          document.documentElement.classList.remove("tbx-mobile");
        }
      };
      if (mql.addEventListener) {
        mql.addEventListener("change", handleMobileChange);
      } else if (mql.addListener) {
        mql.addListener(handleMobileChange);
      }
    }

    // 确保 viewport meta 标签
    ensureViewportMeta();

    // 注入移动端 CSS
    injectMobileCSS();

    // 增强 topnav 触摸体验
    enhanceTopnavForMobile();

    // 防止下拉刷新干扰
    preventPullToRefresh();
  }

  function init() {
    applyTheme(rawTheme(), false);
    buildActions();
    a11y();
    version();
    prefetch();
    keys();
    initCommandPalette();
    initDragDrop();
    initMobileOptimizations();
    syncButtonTitles();

    // 工具使用统计：记录当前页面访问
    var curPage = location.pathname.split("/").pop() || "index.html";
    if (curPage !== "index.html") {
      var toolId = curPage.replace(".html", "");
      trackToolUsage(toolId);
    }

    // 首页工具排序
    initHomepageSort();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
