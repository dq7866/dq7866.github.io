/* 正则表达式工具箱 · 纯前端 */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 工具函数 ---------------- */
  const he = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function debounce(fn, delay) {
    let t;
    return function () {
      const ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), delay);
    };
  }

  function copy(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        const t = btn.textContent;
        btn.textContent = "已复制";
        setTimeout(() => (btn.textContent = t), 1200);
      }
    }, () => alert("复制失败，请手动选择复制。"));
  }

  function buildFlags(prefix) {
    let flags = "";
    if ($("#" + prefix + "FlagG").checked) flags += "g";
    if ($("#" + prefix + "FlagI").checked) flags += "i";
    if ($("#" + prefix + "FlagM").checked) flags += "m";
    if ($("#" + prefix + "FlagS").checked) flags += "s";
    if ($("#" + prefix + "FlagU").checked) flags += "u";
    return flags;
  }

  /* ---------------- Tab 切换 ---------------- */
  $$("#regexTabs .tab").forEach((b) => {
    b.onclick = () => {
      $$("#regexTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".r-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
    };
  });

  /* ================================================================
   * Tab 1: 正则测试
   * ================================================================ */
  const testerRegex = $("#testerRegex");
  const testerInput = $("#testerInput");
  const testerHighlight = $("#testerHighlight");
  const testerInfo = $("#testerInfo");
  const testerMatchList = $("#testerMatchList");
  const testerError = $("#testerError");

  function runTester() {
    const pattern = testerRegex.value.trim();
    const text = testerInput.value;

    if (!pattern) {
      testerHighlight.textContent = text || "请输入正则表达式和测试文本";
      testerInfo.innerHTML = "";
      testerMatchList.innerHTML = '<div class="hint">暂无匹配结果</div>';
      testerError.classList.remove("show");
      return;
    }

    const flags = buildFlags("tester");

    let regex;
    try {
      regex = new RegExp(pattern, flags);
      testerError.classList.remove("show");
    } catch (e) {
      testerError.textContent = "正则表达式语法错误：" + e.message;
      testerError.classList.add("show");
      testerHighlight.textContent = text;
      testerInfo.innerHTML = "";
      testerMatchList.innerHTML = '<div class="hint">正则表达式无效</div>';
      return;
    }

    // 收集所有匹配
    const matches = [];
    if (flags.includes("g")) {
      let m;
      while ((m = regex.exec(text)) !== null) {
        matches.push({
          value: m[0],
          index: m.index,
          groups: m.slice(1),
          namedGroups: m.groups || null
        });
        if (m[0].length === 0) regex.lastIndex++; // 防止零宽匹配死循环
      }
    } else {
      const m = regex.exec(text);
      if (m) {
        matches.push({
          value: m[0],
          index: m.index,
          groups: m.slice(1),
          namedGroups: m.groups || null
        });
      }
    }

    // 高亮显示
    if (matches.length === 0) {
      testerHighlight.textContent = text || "请输入测试文本";
    } else {
      let html = "";
      let lastIdx = 0;
      matches.forEach((m) => {
        html += he(text.slice(lastIdx, m.index));
        html += "<mark>" + he(m.value) + "</mark>";
        lastIdx = m.index + m.value.length;
      });
      html += he(text.slice(lastIdx));
      testerHighlight.innerHTML = html;
    }

    // 统计信息
    const count = matches.length;
    const groupCount = matches.length > 0 ? matches[0].groups.length : 0;
    testerInfo.innerHTML =
      '匹配数：<b>' + count + '</b> 个' +
      (groupCount > 0 ? ' · 捕获组：<b>' + groupCount + '</b> 个' : '') +
      ' · 总字符：<b>' + text.length + '</b>';

    // 匹配详情列表
    if (matches.length === 0) {
      testerMatchList.innerHTML = '<div class="hint">无匹配结果</div>';
    } else {
      let listHtml = "";
      matches.forEach((m, i) => {
        listHtml += '<div class="match-item">';
        listHtml += '<span class="idx">#' + (i + 1) + '</span>';
        listHtml += '<span class="pos">位置 ' + m.index + '-' + (m.index + m.value.length) + '</span>';
        listHtml += '<div class="content">' + he(m.value) + '</div>';
        if (m.groups.length > 0) {
          listHtml += '<div class="groups">';
          m.groups.forEach((g, gi) => {
            listHtml += '<span>$' + (gi + 1) + ': ' + he(g == null ? "(未匹配)" : g) + '</span>';
          });
          listHtml += '</div>';
        }
        if (m.namedGroups) {
          listHtml += '<div class="groups">';
          for (const name in m.namedGroups) {
            listHtml += '<span>' + name + ': ' + he(m.namedGroups[name] == null ? "(未匹配)" : m.namedGroups[name]) + '</span>';
          }
          listHtml += '</div>';
        }
        listHtml += '</div>';
      });
      testerMatchList.innerHTML = listHtml;
    }
  }

  const debouncedTester = debounce(runTester, 150);
  testerRegex.addEventListener("input", debouncedTester);
  testerInput.addEventListener("input", debouncedTester);
  ["testerFlagG", "testerFlagI", "testerFlagM", "testerFlagS", "testerFlagU"].forEach((id) => {
    $("#" + id).addEventListener("change", debouncedTester);
  });

  // 初始运行
  runTester();

  /* ================================================================
   * Tab 2: 常用正则库
   * ================================================================ */
  const regexLibrary = [
    // 数字验证
    { name: "正整数", cat: "number", regex: "^[1-9]\\d*$", example: "123 / 4567", desc: "匹配大于 0 的整数，不含前导零" },
    { name: "非负整数", cat: "number", regex: "^\\d+$", example: "0 / 123 / 456", desc: "匹配 0 或正整数" },
    { name: "整数（含负数）", cat: "number", regex: "^-?\\d+$", example: "123 / -456 / 0", desc: "匹配任意整数，包括负数" },
    { name: "正浮点数", cat: "number", regex: "^[1-9]\\d*\\.\\d+$|^0\\.\\d*[1-9]\\d*$", example: "3.14 / 0.5 / 100.00", desc: "匹配正的浮点数" },
    { name: "数字（整数或小数）", cat: "number", regex: "^-?\\d+(\\.\\d+)?$", example: "123 / -3.14 / 0.5", desc: "匹配整数或小数，含负数" },

    // 邮箱
    { name: "邮箱地址", cat: "email", regex: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", example: "test@example.com", desc: "标准邮箱格式验证" },
    { name: "严格邮箱", cat: "email", regex: "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$", example: "user.name+tag@domain.co.uk", desc: "符合 RFC 5322 规范的严格邮箱验证" },

    // 手机号
    { name: "中国大陆手机号", cat: "phone", regex: "^1[3-9]\\d{9}$", example: "13812345678", desc: "匹配中国大陆 11 位手机号码" },
    { name: "手机号（带分隔符）", cat: "phone", regex: "^1[3-9]\\d[-\\s]?\\d{4}[-\\s]?\\d{4}$", example: "138-1234-5678 / 138 1234 5678", desc: "支持横杠或空格分隔的手机号" },

    // 身份证
    { name: "18 位身份证号", cat: "idcard", regex: "^[1-9]\\d{5}(18|19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]$", example: "110101199003074518", desc: "验证 18 位中国大陆身份证号码（格式校验）" },
    { name: "15 位身份证号", cat: "idcard", regex: "^[1-9]\\d{5}\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}$", example: "110101900307451", desc: "验证 15 位老式身份证号码" },

    // URL / 网址
    { name: "URL 网址", cat: "url", regex: "^https?:\\/\\/[\\w.-]+(?:\\.[\\w.-]+)+[\\w\\-._~:/?#[\\]@!$&'()*+,;=]*$", example: "https://www.example.com/path?q=1", desc: "匹配 http/https 开头的 URL" },
    { name: "域名", cat: "url", regex: "^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\\.[a-zA-Z]{2,}$", example: "www.example.com / sub.domain.co.uk", desc: "匹配域名格式（不含协议）" },

    // IP 地址
    { name: "IPv4 地址", cat: "ip", regex: "^(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)$", example: "192.168.1.1 / 10.0.0.255", desc: "严格验证 IPv4 地址格式（0-255）" },
    { name: "IPv6 地址", cat: "ip", regex: "^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^::1$", example: "2001:0db8:85a3:0000:0000:8a2e:0370:7334", desc: "基础 IPv6 地址验证" },

    // 日期
    { name: "日期 YYYY-MM-DD", cat: "date", regex: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$", example: "2024-01-15", desc: "匹配年-月-日格式（格式校验，不校验合法性）" },
    { name: "日期 YYYY/MM/DD", cat: "date", regex: "^\\d{4}\\/(0[1-9]|1[0-2])\\/(0[1-9]|[12]\\d|3[01])$", example: "2024/01/15", desc: "匹配年/月/日格式" },
    { name: "时间 HH:MM:SS", cat: "date", regex: "^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$", example: "14:30:00", desc: "匹配 24 小时制时间格式" },

    // 中文字符
    { name: "中文字符", cat: "chinese", regex: "^[\\u4e00-\\u9fa5]+$", example: "你好世界", desc: "匹配纯中文字符（常用汉字）" },
    { name: "中文姓名", cat: "chinese", regex: "^[\\u4e00-\\u9fa5]{2,4}$", example: "张三 / 诸葛亮", desc: "匹配 2-4 个字的中文姓名" },
    { name: "包含中文", cat: "chinese", regex: "[\\u4e00-\\u9fa5]", example: "你好 hello", desc: "检测字符串中是否包含中文字符" },

    // 空白字符
    { name: "首尾空白", cat: "whitespace", regex: "^\\s+|\\s+$", example: "  hello world  ", desc: "匹配字符串首尾的空白字符（用于 trim）" },
    { name: "多余空白行", cat: "whitespace", regex: "^\\s*$\\n?", example: "多行文本中的空行", desc: "匹配空白行，用于删除空行" },
    { name: "多个空格", cat: "whitespace", regex: " +", example: "hello   world", desc: "匹配连续多个空格，可替换为单个空格" },

    // 密码强度
    { name: "弱密码（6位以上）", cat: "password", regex: "^.{6,}$", example: "123456 / abcdef", desc: "仅校验长度 6 位以上" },
    { name: "中等强度密码", cat: "password", regex: "^(?=.*[a-z])(?=.*\\d)[a-zA-Z\\d]{8,}$", example: "abc12345 / test8888", desc: "至少 8 位，包含小写字母和数字" },
    { name: "强密码", cat: "password", regex: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$", example: "Abc123!@#", desc: "至少 8 位，包含大小写字母、数字和特殊字符" },

    // 其他常用
    { name: "邮政编码", cat: "number", regex: "^[1-9]\\d{5}$", example: "100000 / 200001", desc: "匹配中国 6 位邮政编码" },
    { name: "QQ 号码", cat: "number", regex: "^[1-9]\\d{4,10}$", example: "12345 / 100001", desc: "匹配 5-11 位 QQ 号" },
    { name: "车牌号（中国）", cat: "number", regex: "^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$", example: "京A12345 / 粤B88888", desc: "匹配中国车牌号（蓝牌/绿牌等）" },
    { name: "HTML 标签", cat: "chinese", regex: "<[^>]+>", example: "<div> / </span> / <br/>", desc: "匹配 HTML 标签，可用于去除 HTML" },
    { name: "十六进制颜色", cat: "number", regex: "^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$", example: "#ff4d00 / fff / #ABC", desc: "匹配十六进制颜色值" }
  ];

  const catNames = {
    number: "数字验证",
    email: "邮箱",
    phone: "手机号",
    idcard: "身份证",
    url: "URL / 网址",
    ip: "IP 地址",
    date: "日期",
    chinese: "中文字符",
    whitespace: "空白字符",
    password: "密码强度"
  };

  const libList = $("#libList");
  const libSearch = $("#libSearch");
  let currentCat = "all";
  let currentSearch = "";

  function renderLibrary() {
    const filtered = regexLibrary.filter((item) => {
      const catMatch = currentCat === "all" || item.cat === currentCat;
      const searchMatch = !currentSearch ||
        item.name.toLowerCase().includes(currentSearch) ||
        item.desc.toLowerCase().includes(currentSearch) ||
        item.regex.toLowerCase().includes(currentSearch);
      return catMatch && searchMatch;
    });

    if (filtered.length === 0) {
      libList.innerHTML = '<div class="hint">没有找到匹配的正则表达式</div>';
      return;
    }

    let html = "";
    filtered.forEach((item) => {
      html += '<div class="lib-item">';
      html += '<div class="name">' + he(item.name) + '<span class="cat-tag">' + he(catNames[item.cat] || item.cat) + '</span></div>';
      html += '<div class="regex">' + he(item.regex) + '</div>';
      html += '<div class="desc">' + he(item.desc) + '</div>';
      html += '<div class="example">示例：<code>' + he(item.example) + '</code></div>';
      html += '<div class="actions">';
      html += '<button class="btn ghost" data-action="copy" data-regex="' + he(item.regex.replace(/"/g, '&quot;')) + '">复制正则</button>';
      html += '<button class="btn primary" data-action="send" data-regex="' + he(item.regex.replace(/"/g, '&quot;')) + '">发送到测试器</button>';
      html += '</div></div>';
    });
    libList.innerHTML = html;

    // 绑定按钮事件
    $$(".lib-item .btn", libList).forEach((btn) => {
      btn.onclick = (e) => {
        const regex = btn.dataset.regex;
        const action = btn.dataset.action;
        if (action === "copy") {
          copy(regex, btn);
        } else if (action === "send") {
          // 切换到测试器 tab
          $$("#regexTabs .tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === "tester"));
          $$(".r-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== "tester"));
          testerRegex.value = regex;
          runTester();
          testerRegex.focus();
        }
      };
    });
  }

  // 分类筛选
  $$("#libCats button").forEach((btn) => {
    btn.onclick = () => {
      $$("#libCats button").forEach((x) => x.classList.toggle("active", x === btn));
      currentCat = btn.dataset.cat;
      renderLibrary();
    };
  });

  // 搜索
  libSearch.addEventListener("input", debounce(() => {
    currentSearch = libSearch.value.trim().toLowerCase();
    renderLibrary();
  }, 200));

  // 初始渲染
  renderLibrary();

  /* ================================================================
   * Tab 3: 替换工具
   * ================================================================ */
  const replaceRegex = $("#replaceRegex");
  const replaceWith = $("#replaceWith");
  const replaceInput = $("#replaceInput");
  const replacePreview = $("#replacePreview");
  const replaceStats = $("#replaceStats");
  const replaceError = $("#replaceError");
  const copyReplaceBtn = $("#copyReplaceResult");

  function runReplace() {
    const pattern = replaceRegex.value.trim();
    const text = replaceInput.value;
    const replacement = replaceWith.value;

    if (!pattern) {
      replacePreview.textContent = text || "请输入正则表达式和替换内容";
      replaceStats.innerHTML = "";
      replaceError.classList.remove("show");
      return;
    }

    let flags = "";
    if ($("#repFlagG").checked) flags += "g";
    if ($("#repFlagI").checked) flags += "i";
    if ($("#repFlagM").checked) flags += "m";
    if ($("#repFlagS").checked) flags += "s";
    if ($("#repFlagU").checked) flags += "u";

    let regex;
    try {
      regex = new RegExp(pattern, flags);
      replaceError.classList.remove("show");
    } catch (e) {
      replaceError.textContent = "正则表达式语法错误：" + e.message;
      replaceError.classList.add("show");
      replacePreview.textContent = text;
      replaceStats.innerHTML = "";
      return;
    }

    // 计算替换次数
    let count = 0;
    if (flags.includes("g")) {
      const m = text.match(regex);
      count = m ? m.length : 0;
    } else {
      count = regex.test(text) ? 1 : 0;
    }

    // 执行替换
    let result;
    try {
      result = text.replace(regex, replacement);
    } catch (e) {
      replaceError.textContent = "替换出错：" + e.message;
      replaceError.classList.add("show");
      return;
    }

    replacePreview.textContent = result;
    replaceStats.innerHTML = '替换了 <b>' + count + '</b> 处 · 原文本 <b>' + text.length + '</b> 字符 → 结果 <b>' + result.length + '</b> 字符';
  }

  const debouncedReplace = debounce(runReplace, 150);
  replaceRegex.addEventListener("input", debouncedReplace);
  replaceWith.addEventListener("input", debouncedReplace);
  replaceInput.addEventListener("input", debouncedReplace);
  ["repFlagG", "repFlagI", "repFlagM", "repFlagS", "repFlagU"].forEach((id) => {
    $("#" + id).addEventListener("change", debouncedReplace);
  });

  // 复制结果
  copyReplaceBtn.onclick = () => {
    copy(replacePreview.textContent, copyReplaceBtn);
  };

  // 初始运行
  runReplace();
})();
