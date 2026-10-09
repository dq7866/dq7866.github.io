/* ============================================================
   JSON / YAML 工具箱 · 纯前端
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 通用工具 ---------------- */

  function copyText(text) {
    if (!text) return Promise.reject("无内容");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve();
    } catch (e) {
      document.body.removeChild(ta);
      return Promise.reject(e);
    }
  }

  function debounce(fn, delay) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), delay);
    };
  }

  // 获取 JSON 错误的行号和位置
  function getJsonErrorInfo(err, text) {
    const msg = err.message || String(err);
    // Chrome/Safari: "Unexpected token x in JSON at position N"
    // Firefox: "JSON.parse: unexpected character at line N column N of the JSON data"
    let pos = -1, line = -1, col = -1;

    const posMatch = msg.match(/position\s+(\d+)/i);
    if (posMatch) pos = parseInt(posMatch[1], 10);

    const lineMatch = msg.match(/line\s+(\d+)/i);
    const colMatch = msg.match(/column\s+(\d+)/i);
    if (lineMatch) line = parseInt(lineMatch[1], 10);
    if (colMatch) col = parseInt(colMatch[1], 10);

    // 如果只有 position，计算行号
    if (pos >= 0 && line < 0) {
      const before = text.slice(0, pos);
      line = before.split("\n").length;
      const lastNl = before.lastIndexOf("\n");
      col = pos - (lastNl >= 0 ? lastNl : -1);
    }

    return { message: msg, position: pos, line: line, column: col };
  }

  function showError(el, info) {
    if (!info) {
      el.classList.remove("show");
      el.textContent = "";
      return;
    }
    let html = "";
    if (info.line > 0) {
      html += `<span class="err-line">第 ${info.line} 行${info.column > 0 ? `，第 ${info.column} 列` : ""}</span> · `;
    }
    html += escHtml(info.message);
    el.innerHTML = html;
    el.classList.add("show");
  }

  function updateStat(el, text) {
    const chars = text ? text.length : 0;
    const lines = text ? text.split("\n").length : 0;
    el.textContent = `${chars} 字符 · ${lines} 行`;
  }

  /* ---------------- Tab 切换 ---------------- */

  function switchTab(tab) {
    $$("#jTabs .tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
    $$(".j-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== tab));
  }

  $$("#jTabs .tab").forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab);
  });

  /* ============================================================
     Tab 1: JSON 格式化 / 压缩
     ============================================================ */

  let fmtIndent = 2;

  // 缩进选择
  $$("#indentSeg button").forEach((b) => {
    b.onclick = () => {
      $$("#indentSeg button").forEach((x) => x.classList.toggle("active", x === b));
      const v = b.dataset.v;
      if (v === "tab") fmtIndent = "\t";
      else fmtIndent = parseInt(v, 10);
      // 重新格式化（如果有内容）
      const input = $("#fmtInput").value.trim();
      if (input) formatJson();
    };
  });

  function formatJson() {
    const input = $("#fmtInput").value;
    const errEl = $("#fmtError");
    const outEl = $("#fmtOutput");
    if (!input.trim()) {
      outEl.value = "";
      showError(errEl, null);
      updateStat($("#fmtOutputStat"), "");
      return;
    }
    try {
      const obj = JSON.parse(input);
      const result = JSON.stringify(obj, null, fmtIndent);
      outEl.value = result;
      showError(errEl, null);
      updateStat($("#fmtOutputStat"), result);
    } catch (e) {
      const info = getJsonErrorInfo(e, input);
      showError(errEl, info);
      outEl.value = "";
      updateStat($("#fmtOutputStat"), "");
    }
  }

  function minifyJson() {
    const input = $("#fmtInput").value;
    const errEl = $("#fmtError");
    const outEl = $("#fmtOutput");
    if (!input.trim()) {
      showError(errEl, null);
      return;
    }
    try {
      const obj = JSON.parse(input);
      const result = JSON.stringify(obj);
      outEl.value = result;
      showError(errEl, null);
      updateStat($("#fmtOutputStat"), result);
    } catch (e) {
      const info = getJsonErrorInfo(e, input);
      showError(errEl, info);
    }
  }

  const SAMPLE_JSON = JSON.stringify({
    "姓名": "张三",
    "年龄": 28,
    "在职": true,
    "技能": ["JavaScript", "Python", "SQL"],
    "地址": {
      "城市": "北京",
      "区": "朝阳区",
      "街道": "某某路 88 号"
    },
    "项目经历": [
      { "名称": "电商平台", "角色": "前端开发", "完成": true },
      { "名称": "数据分析系统", "角色": "全栈开发", "完成": false }
    ],
    "备注": null
  }, null, 2);

  $("#fmtFormat").onclick = formatJson;
  $("#fmtMinify").onclick = minifyJson;
  $("#fmtClear").onclick = () => {
    $("#fmtInput").value = "";
    $("#fmtOutput").value = "";
    showError($("#fmtError"), null);
    updateStat($("#fmtInputStat"), "");
    updateStat($("#fmtOutputStat"), "");
  };
  $("#fmtExample").onclick = () => {
    $("#fmtInput").value = SAMPLE_JSON;
    updateStat($("#fmtInputStat"), SAMPLE_JSON);
    formatJson();
  };
  $("#fmtCopy").onclick = () => {
    const text = $("#fmtOutput").value;
    copyText(text).then(() => {
      const btn = $("#fmtCopy");
      const old = btn.textContent;
      btn.textContent = "已复制 ✓";
      setTimeout(() => btn.textContent = old, 1500);
    }).catch(() => {
      alert("复制失败，请手动复制");
    });
  };
  $("#fmtInput").addEventListener("input", (e) => {
    updateStat($("#fmtInputStat"), e.target.value);
  });

  /* ============================================================
     Tab 2: JSON 转 YAML
     ============================================================ */

  // JSON 对象转 YAML 字符串
  function jsonToYaml(obj, indent) {
    indent = indent || 0;
    const sp = "  ".repeat(indent);
    const lines = [];

    function isPlainObject(v) {
      return v !== null && typeof v === "object" && !Array.isArray(v);
    }

    function needsQuoting(str) {
      // 空字符串或仅含空白
      if (str === "" || /^\s|\s$/.test(str)) return true;
      // 包含特殊字符
      if (/[:#&*!|>'"%@`,\[\]{}]/.test(str)) return true;
      // 以 - 开头（可能被识别为数组项）
      if (/^-/.test(str)) return true;
      // 是布尔值或 null 或数字
      if (/^(true|false|null|yes|no|on|off)$/i.test(str)) return true;
      if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(str)) return true;
      // 包含换行
      if (/\n/.test(str)) return "block";
      return false;
    }

    function formatScalar(v) {
      if (v === null) return "null";
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") {
        if (!isFinite(v)) return "null";
        return String(v);
      }
      if (typeof v === "string") {
        const q = needsQuoting(v);
        if (q === "block") {
          // 多行字符串使用 |
          const indented = v.split("\n").map((l) => sp + "  " + l).join("\n");
          return "|\n" + indented;
        }
        if (q) {
          return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
        }
        return v;
      }
      return String(v);
    }

    if (isPlainObject(obj)) {
      const keys = Object.keys(obj);
      if (keys.length === 0) return sp + "{}";
      keys.forEach((k) => {
        const v = obj[k];
        const safeKey = needsQuoting(k) && needsQuoting(k) !== "block"
          ? '"' + k.replace(/"/g, '\\"') + '"'
          : k;
        if (isPlainObject(v)) {
          if (Object.keys(v).length === 0) {
            lines.push(sp + safeKey + ": {}");
          } else {
            lines.push(sp + safeKey + ":");
            lines.push(jsonToYaml(v, indent + 1));
          }
        } else if (Array.isArray(v)) {
          if (v.length === 0) {
            lines.push(sp + safeKey + ": []");
          } else {
            lines.push(sp + safeKey + ":");
            lines.push(jsonToYaml(v, indent + 1));
          }
        } else {
          const scalar = formatScalar(v);
          if (typeof scalar === "string" && scalar.startsWith("|\n")) {
            lines.push(sp + safeKey + ": " + scalar);
          } else {
            lines.push(sp + safeKey + ": " + scalar);
          }
        }
      });
    } else if (Array.isArray(obj)) {
      if (obj.length === 0) return sp + "[]";
      obj.forEach((item) => {
        if (isPlainObject(item)) {
          const keys = Object.keys(item);
          if (keys.length === 0) {
            lines.push(sp + "- {}");
          } else {
            // 第一个键前加 -
            const firstKey = keys[0];
            const firstVal = item[firstKey];
            const safeKey = needsQuoting(firstKey) && needsQuoting(firstKey) !== "block"
              ? '"' + firstKey.replace(/"/g, '\\"') + '"'
              : firstKey;
            if (isPlainObject(firstVal)) {
              lines.push(sp + "- " + safeKey + ":");
              lines.push(jsonToYaml(firstVal, indent + 2));
            } else if (Array.isArray(firstVal)) {
              lines.push(sp + "- " + safeKey + ":");
              lines.push(jsonToYaml(firstVal, indent + 2));
            } else {
              lines.push(sp + "- " + safeKey + ": " + formatScalar(firstVal));
            }
            // 剩余键
            const rest = {};
            for (let i = 1; i < keys.length; i++) rest[keys[i]] = item[keys[i]];
            if (Object.keys(rest).length > 0) {
              lines.push(jsonToYaml(rest, indent + 1));
            }
          }
        } else if (Array.isArray(item)) {
          lines.push(sp + "-");
          lines.push(jsonToYaml(item, indent + 1));
        } else {
          lines.push(sp + "- " + formatScalar(item));
        }
      });
    } else {
      return sp + formatScalar(obj);
    }

    return lines.join("\n");
  }

  function doJ2Y() {
    const input = $("#j2yInput").value;
    const errEl = $("#j2yError");
    const outEl = $("#j2yOutput");
    const noteEl = $("#j2yNote");
    if (!input.trim()) {
      outEl.value = "";
      showError(errEl, null);
      noteEl.style.display = "none";
      updateStat($("#j2yOutputStat"), "");
      return;
    }
    try {
      const obj = JSON.parse(input);
      const yaml = jsonToYaml(obj, 0);
      outEl.value = yaml;
      showError(errEl, null);
      noteEl.style.display = "block";
      updateStat($("#j2yOutputStat"), yaml);
    } catch (e) {
      const info = getJsonErrorInfo(e, input);
      showError(errEl, info);
      outEl.value = "";
      noteEl.style.display = "none";
      updateStat($("#j2yOutputStat"), "");
    }
  }

  const debouncedJ2Y = debounce(doJ2Y, 200);

  $("#j2yInput").addEventListener("input", (e) => {
    updateStat($("#j2yInputStat"), e.target.value);
    if ($("#j2yAuto").checked) debouncedJ2Y();
  });
  $("#j2yConvert").onclick = doJ2Y;
  $("#j2yAuto").addEventListener("change", (e) => {
    if (e.target.checked && $("#j2yInput").value.trim()) doJ2Y();
  });
  $("#j2yExample").onclick = () => {
    $("#j2yInput").value = SAMPLE_JSON;
    updateStat($("#j2yInputStat"), SAMPLE_JSON);
    doJ2Y();
  };
  $("#j2yClear").onclick = () => {
    $("#j2yInput").value = "";
    $("#j2yOutput").value = "";
    showError($("#j2yError"), null);
    $("#j2yNote").style.display = "none";
    updateStat($("#j2yInputStat"), "");
    updateStat($("#j2yOutputStat"), "");
  };
  $("#j2yCopy").onclick = () => {
    const text = $("#j2yOutput").value;
    copyText(text).then(() => {
      const btn = $("#j2yCopy");
      const old = btn.textContent;
      btn.textContent = "已复制 ✓";
      setTimeout(() => btn.textContent = old, 1500);
    }).catch(() => alert("复制失败，请手动复制"));
  };

  /* ============================================================
     Tab 3: YAML 转 JSON
     ============================================================ */

  let y2jIndent = 2;

  $$("#y2jIndentSeg button").forEach((b) => {
    b.onclick = () => {
      $$("#y2jIndentSeg button").forEach((x) => x.classList.toggle("active", x === b));
      const v = b.dataset.v;
      if (v === "tab") y2jIndent = "\t";
      else y2jIndent = parseInt(v, 10);
      if ($("#y2jInput").value.trim()) doY2J();
    };
  });

  // 简易 YAML 解析器
  // 支持：键值对、嵌套对象（缩进）、数组（- 前缀）、字符串/数字/布尔/null
  // 不支持：锚点、引用、多文档、复杂标签、流式样式（花括号/方括号）
  function parseYaml(text) {
    // 预处理
    const rawLines = text.split("\n");
    const lines = [];

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i];
      // 移除注释（不在引号内的 #）
      const inStr = /^(\s*)(-?\s*)?(["'])/.exec(line);
      if (!inStr) {
        const hashIdx = findUnquotedHash(line);
        if (hashIdx >= 0) line = line.slice(0, hashIdx).trimEnd();
      }
      // 跳过空行
      if (!line.trim()) continue;
      // 计算缩进（空格数）
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch[1].replace(/\t/g, "  ").length; // tab 按 2 空格算
      const content = line.trim();
      lines.push({ indent, content, raw: line, lineNum: i + 1 });
    }

    if (lines.length === 0) return null;

    let idx = 0;

    function parseBlock(baseIndent) {
      // 判断是对象还是数组
      const firstLine = lines[idx];
      if (!firstLine || firstLine.indent < baseIndent) return undefined;

      // 数组：以 - 开头
      if (/^-\s/.test(firstLine.content) || firstLine.content === "-") {
        return parseArray(baseIndent);
      }
      // 对象：包含 key: value 结构
      if (/^[^:]+:/.test(firstLine.content)) {
        return parseObject(baseIndent);
      }
      // 标量（不应出现在顶层 block）
      return parseScalar(firstLine.content);
    }

    function parseObject(baseIndent) {
      const obj = {};
      while (idx < lines.length) {
        const line = lines[idx];
        if (line.indent < baseIndent) break;
        if (line.indent > baseIndent) {
          // 异常：缩进不对
          throw new Error(`缩进错误（第 ${line.lineNum} 行）`);
        }

        const content = line.content;
        // 数组项混入对象（不应该）
        if (/^-\s/.test(content) || content === "-") break;

        // 解析 key: value
        const kv = parseKeyValue(content, line.lineNum);
        if (!kv) throw new Error(`解析失败（第 ${line.lineNum} 行）`);

        idx++;

        if (kv.inline) {
          // 行内值
          obj[kv.key] = kv.value;
        } else {
          // 下一行开始是嵌套块
          const nextLine = lines[idx];
          if (nextLine && nextLine.indent > baseIndent) {
            obj[kv.key] = parseBlock(nextLine.indent);
          } else {
            obj[kv.key] = null;
          }
        }
      }
      return obj;
    }

    function parseArray(baseIndent) {
      const arr = [];
      while (idx < lines.length) {
        const line = lines[idx];
        if (line.indent < baseIndent) break;
        if (line.indent > baseIndent) {
          throw new Error(`缩进错误（第 ${line.lineNum} 行）`);
        }

        const content = line.content;
        if (!/^-\s/.test(content) && content !== "-") break;

        // 提取 - 后面的内容
        const rest = content === "-" ? "" : content.slice(2);

        if (rest === "") {
          // 空数组项，看下一行嵌套
          idx++;
          const nextLine = lines[idx];
          if (nextLine && nextLine.indent > baseIndent) {
            arr.push(parseBlock(nextLine.indent));
          } else {
            arr.push(null);
          }
        } else if (/^[^:]+:\s*$/.test(rest) || /^[^:]+:\s*.+/.test(rest)) {
          // 数组项是对象（- key: value 或 - key:）
          // 把这行当作对象的第一个属性来处理
          // 临时构造"虚拟行"
          const kv = parseKeyValue(rest, line.lineNum);
          if (!kv) throw new Error(`解析失败（第 ${line.lineNum} 行）`);

          if (kv.inline) {
            // 简单 key: value
            const obj = {};
            obj[kv.key] = kv.value;
            idx++;
            // 检查后续同级属性（缩进 = baseIndent + 内容缩进偏移）
            // 数组项中对象的后续键缩进应与数组项的 key 对齐
            // 简化处理：下一行 indent > baseIndent 且不是 - 开头，就是同一对象的属性
            const objIndent = baseIndent + 2; // 假设 2 空格缩进
            while (idx < lines.length) {
              const nl = lines[idx];
              if (nl.indent < objIndent) break;
              if (nl.indent >= objIndent && !/^-\s/.test(nl.content) && nl.content !== "-") {
                // 这是同一对象的属性，调整 indent 为相对值
                const adjusted = { ...nl, indent: nl.indent - 2 };
                // 暂时替换 lines 中的值（更简单的做法是递归时传入新的 baseIndent）
                const innerObj = parseObject(objIndent);
                Object.assign(obj, innerObj);
                break;
              } else {
                break;
              }
            }
            arr.push(obj);
          } else {
            // key: 后面是换行的嵌套值
            idx++;
            const nextLine = lines[idx];
            const obj = {};
            if (nextLine && nextLine.indent > baseIndent) {
              const nestedIndent = nextLine.indent;
              obj[kv.key] = parseBlock(nestedIndent);
              // 继续读取同对象的其他键
              while (idx < lines.length) {
                const nl = lines[idx];
                if (nl.indent < nestedIndent) break;
                if (nl.indent === nestedIndent && !/^-\s/.test(nl.content) && nl.content !== "-") {
                  const okv = parseKeyValue(nl.content, nl.lineNum);
                  if (!okv) break;
                  idx++;
                  if (okv.inline) {
                    obj[okv.key] = okv.value;
                  } else {
                    const nline = lines[idx];
                    if (nline && nline.indent > nl.indent) {
                      obj[okv.key] = parseBlock(nline.indent);
                    } else {
                      obj[okv.key] = null;
                    }
                  }
                } else {
                  break;
                }
              }
            } else {
              obj[kv.key] = null;
            }
            arr.push(obj);
          }
        } else {
          // 数组项是标量
          arr.push(parseScalar(rest));
          idx++;
        }
      }
      return arr;
    }

    function parseKeyValue(content, lineNum) {
      // 匹配 key: value
      // key 可以是引号包裹的
      let key, rest;

      if (content.startsWith('"')) {
        // 双引号 key
        const end = findClosingQuote(content, 1, '"');
        if (end < 0) return null;
        key = content.slice(1, end);
        rest = content.slice(end + 1);
      } else if (content.startsWith("'")) {
        const end = findClosingQuote(content, 1, "'");
        if (end < 0) return null;
        key = content.slice(1, end);
        rest = content.slice(end + 1);
      } else {
        // 普通 key，找到第一个 :
        const colonIdx = content.indexOf(":");
        if (colonIdx < 0) return null;
        key = content.slice(0, colonIdx).trim();
        rest = content.slice(colonIdx + 1);
      }

      if (!rest.startsWith(":") && content.startsWith('"') === false && content.startsWith("'") === false) {
        // 已经在上面处理了
      }
      // 统一：rest 是 : 后面的内容
      if (rest.startsWith(":")) rest = rest.slice(1);

      const valueStr = rest.trim();

      if (valueStr === "") {
        return { key, inline: false };
      }

      // 检查是否为流式映射/数组（简化处理）
      if (valueStr === "{}") return { key, value: {}, inline: true };
      if (valueStr === "[]") return { key, value: [], inline: true };

      return { key, value: parseScalar(valueStr), inline: true };
    }

    function parseScalar(str) {
      str = str.trim();
      if (str === "") return "";

      // null
      if (/^(null|~|Null|NULL)$/.test(str)) return null;

      // boolean
      if (/^(true|True|TRUE|yes|Yes|YES|on|On|ON)$/.test(str)) return true;
      if (/^(false|False|FALSE|no|No|NO|off|Off|OFF)$/.test(str)) return false;

      // 数字
      if (/^-?\d+$/.test(str)) return parseInt(str, 10);
      if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
      if (/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(str)) return parseFloat(str);
      if (/^0x[0-9a-fA-F]+$/.test(str)) return parseInt(str, 16);
      if (/^0o?[0-7]+$/.test(str)) return parseInt(str.replace(/^0o?/, ""), 8);

      // 引号字符串
      if (str.startsWith('"') && str.endsWith('"') && str.length > 1) {
        return str.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      }
      if (str.startsWith("'") && str.endsWith("'") && str.length > 1) {
        return str.slice(1, -1).replace(/''/g, "'");
      }

      // 普通字符串
      return str;
    }

    function findUnquotedHash(line) {
      let inSingle = false, inDouble = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'" && !inDouble) inSingle = !inSingle;
        else if (c === '"' && !inSingle) inDouble = !inDouble;
        else if (c === "#" && !inSingle && !inDouble) {
          // 确保 # 前面是空格或行首（避免 URL 中的 #）
          if (i === 0 || /\s/.test(line[i - 1])) return i;
        }
      }
      return -1;
    }

    function findClosingQuote(str, start, quote) {
      for (let i = start; i < str.length; i++) {
        if (str[i] === "\\") { i++; continue; }
        if (str[i] === quote) return i;
      }
      return -1;
    }

    // 开始解析
    const firstLine = lines[0];
    if (!firstLine) return null;

    const result = parseBlock(firstLine.indent);
    return result;
  }

  function doY2J() {
    const input = $("#y2jInput").value;
    const errEl = $("#y2jError");
    const outEl = $("#y2jOutput");
    const noteEl = $("#y2jNote");
    if (!input.trim()) {
      outEl.value = "";
      showError(errEl, null);
      noteEl.style.display = "none";
      updateStat($("#y2jOutputStat"), "");
      return;
    }
    try {
      const obj = parseYaml(input);
      const json = JSON.stringify(obj, null, y2jIndent);
      outEl.value = json;
      showError(errEl, null);
      noteEl.style.display = "block";
      updateStat($("#y2jOutputStat"), json);
    } catch (e) {
      showError(errEl, { message: e.message, line: -1, column: -1 });
      outEl.value = "";
      noteEl.style.display = "none";
      updateStat($("#y2jOutputStat"), "");
    }
  }

  const debouncedY2J = debounce(doY2J, 300);

  const SAMPLE_YAML = `姓名: 张三
年龄: 28
在职: true
技能:
  - JavaScript
  - Python
  - SQL
地址:
  城市: 北京
  区: 朝阳区
  街道: 某某路 88 号
项目经历:
  - 名称: 电商平台
    角色: 前端开发
    完成: true
  - 名称: 数据分析系统
    角色: 全栈开发
    完成: false
备注: null`;

  $("#y2jInput").addEventListener("input", (e) => {
    updateStat($("#y2jInputStat"), e.target.value);
    if ($("#y2jAuto").checked) debouncedY2J();
  });
  $("#y2jConvert").onclick = doY2J;
  $("#y2jAuto").addEventListener("change", (e) => {
    if (e.target.checked && $("#y2jInput").value.trim()) doY2J();
  });
  $("#y2jExample").onclick = () => {
    $("#y2jInput").value = SAMPLE_YAML;
    updateStat($("#y2jInputStat"), SAMPLE_YAML);
    doY2J();
  };
  $("#y2jClear").onclick = () => {
    $("#y2jInput").value = "";
    $("#y2jOutput").value = "";
    showError($("#y2jError"), null);
    $("#y2jNote").style.display = "none";
    updateStat($("#y2jInputStat"), "");
    updateStat($("#y2jOutputStat"), "");
  };
  $("#y2jCopy").onclick = () => {
    const text = $("#y2jOutput").value;
    copyText(text).then(() => {
      const btn = $("#y2jCopy");
      const old = btn.textContent;
      btn.textContent = "已复制 ✓";
      setTimeout(() => btn.textContent = old, 1500);
    }).catch(() => alert("复制失败，请手动复制"));
  };

  /* ============================================================
     Tab 4: JSON 校验
     ============================================================ */

  // 结构统计
  function analyzeStructure(obj) {
    let depth = 0;
    let keys = 0;
    let arrays = 0;
    let objects = 0;
    let strings = 0;
    let numbers = 0;

    function walk(v, d) {
      if (d > depth) depth = d;
      if (v === null || v === undefined) return;
      if (Array.isArray(v)) {
        arrays++;
        v.forEach((item) => walk(item, d + 1));
      } else if (typeof v === "object") {
        objects++;
        const ks = Object.keys(v);
        keys += ks.length;
        ks.forEach((k) => walk(v[k], d + 1));
      } else if (typeof v === "string") {
        strings++;
      } else if (typeof v === "number") {
        numbers++;
      }
    }

    walk(obj, 0);
    return { depth, keys, arrays, objects, strings, numbers };
  }

  // 生成树形视图
  function buildTree(obj, keyName) {
    const frag = document.createDocumentFragment();

    function typeOf(v) {
      if (v === null) return "null";
      if (Array.isArray(v)) return "array";
      return typeof v;
    }

    function escHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function renderValue(v, key, parentEl) {
      const t = typeOf(v);

      if (t === "object") {
        const keys = Object.keys(v);
        const det = document.createElement("details");
        det.open = true;
        const sum = document.createElement("summary");
        sum.innerHTML = `<span class="tk-key">${escHtml(key)}</span><span class="tk-bracket">: {</span><span class="tk-count">${keys.length} 个键</span>`;
        det.appendChild(sum);
        if (keys.length === 0) {
          const empty = document.createElement("div");
          empty.className = "leaf";
          empty.innerHTML = '<span class="tk-bracket">(空对象)</span>';
          det.appendChild(empty);
        } else {
          keys.forEach((k) => renderValue(v[k], k, det));
        }
        const close = document.createElement("div");
        close.className = "leaf tk-bracket";
        close.textContent = "}";
        det.appendChild(close);
        parentEl.appendChild(det);
      } else if (t === "array") {
        const det = document.createElement("details");
        det.open = true;
        const sum = document.createElement("summary");
        sum.innerHTML = `<span class="tk-key">${escHtml(key)}</span><span class="tk-bracket">: [</span><span class="tk-count">${v.length} 项</span>`;
        det.appendChild(sum);
        if (v.length === 0) {
          const empty = document.createElement("div");
          empty.className = "leaf";
          empty.innerHTML = '<span class="tk-bracket">(空数组)</span>';
          det.appendChild(empty);
        } else {
          v.forEach((item, i) => renderValue(item, `[${i}]`, det));
        }
        const close = document.createElement("div");
        close.className = "leaf tk-bracket";
        close.textContent = "]";
        det.appendChild(close);
        parentEl.appendChild(det);
      } else {
        const leaf = document.createElement("div");
        leaf.className = "leaf";
        let valHtml = "";
        if (t === "string") {
          const truncated = v.length > 200 ? v.slice(0, 200) + "…" : v;
          valHtml = `<span class="tk-string">"${escHtml(truncated)}"</span>`;
        } else if (t === "number") {
          valHtml = `<span class="tk-number">${v}</span>`;
        } else if (t === "boolean") {
          valHtml = `<span class="tk-bool">${v}</span>`;
        } else if (t === "null") {
          valHtml = `<span class="tk-null">null</span>`;
        }
        leaf.innerHTML = `<span class="tk-key">${escHtml(key)}</span><span class="tk-bracket">: </span>${valHtml}`;
        parentEl.appendChild(leaf);
      }
    }

    // 根节点
    const rootType = typeOf(obj);
    if (rootType === "object") {
      const keys = Object.keys(obj);
      const det = document.createElement("details");
      det.open = true;
      const sum = document.createElement("summary");
      sum.innerHTML = `<span class="tk-bracket">{</span> <span class="tk-count">Object · ${keys.length} 个键</span>`;
      det.appendChild(sum);
      keys.forEach((k) => renderValue(obj[k], k, det));
      const close = document.createElement("div");
      close.className = "leaf tk-bracket";
      close.textContent = "}";
      det.appendChild(close);
      frag.appendChild(det);
    } else if (rootType === "array") {
      const det = document.createElement("details");
      det.open = true;
      const sum = document.createElement("summary");
      sum.innerHTML = `<span class="tk-bracket">[</span> <span class="tk-count">Array · ${obj.length} 项</span>`;
      det.appendChild(sum);
      obj.forEach((item, i) => renderValue(item, `[${i}]`, det));
      const close = document.createElement("div");
      close.className = "leaf tk-bracket";
      close.textContent = "]";
      det.appendChild(close);
      frag.appendChild(det);
    } else {
      const leaf = document.createElement("div");
      leaf.className = "leaf";
      leaf.textContent = String(obj);
      frag.appendChild(leaf);
    }

    return frag;
  }

  function doValidate() {
    const input = $("#valInput").value;
    const errEl = $("#valError");
    const badgeWrap = $("#valBadgeWrap");
    const summary = $("#valSummary");
    const tree = $("#valTree");

    badgeWrap.innerHTML = "";
    tree.innerHTML = "";

    if (!input.trim()) {
      showError(errEl, null);
      summary.style.display = "none";
      return;
    }

    try {
      const obj = JSON.parse(input);
      showError(errEl, null);
      summary.style.display = "block";

      // 徽章
      const badge = document.createElement("span");
      badge.className = "json-badge ok";
      badge.textContent = "✓ JSON 格式有效";
      badgeWrap.appendChild(badge);

      // 结构统计
      const info = analyzeStructure(obj);
      $("#sDepth").textContent = info.depth;
      $("#sKeys").textContent = info.keys;
      $("#sArrays").textContent = info.arrays;
      $("#sObjects").textContent = info.objects;
      $("#sStrings").textContent = info.strings;
      $("#sNumbers").textContent = info.numbers;

      // 树形视图
      tree.appendChild(buildTree(obj));

    } catch (e) {
      const info = getJsonErrorInfo(e, input);
      showError(errEl, info);
      summary.style.display = "none";

      const badge = document.createElement("span");
      badge.className = "json-badge fail";
      badge.textContent = "✗ JSON 格式无效";
      badgeWrap.appendChild(badge);
    }
  }

  const debouncedVal = debounce(doValidate, 300);

  $("#valInput").addEventListener("input", (e) => {
    updateStat($("#valInputStat"), e.target.value);
    // 输入时自动校验
    if (e.target.value.trim()) debouncedVal();
    else {
      $("#valSummary").style.display = "none";
      $("#valBadgeWrap").innerHTML = "";
      showError($("#valError"), null);
    }
  });
  $("#valCheck").onclick = doValidate;
  $("#valExample").onclick = () => {
    $("#valInput").value = SAMPLE_JSON;
    updateStat($("#valInputStat"), SAMPLE_JSON);
    doValidate();
  };
  $("#valClear").onclick = () => {
    $("#valInput").value = "";
    $("#valSummary").style.display = "none";
    $("#valBadgeWrap").innerHTML = "";
    showError($("#valError"), null);
    updateStat($("#valInputStat"), "");
  };

  /* ---------------- 初始化 ---------------- */
  updateStat($("#fmtInputStat"), "");
  updateStat($("#fmtOutputStat"), "");
  updateStat($("#j2yInputStat"), "");
  updateStat($("#j2yOutputStat"), "");
  updateStat($("#y2jInputStat"), "");
  updateStat($("#y2jOutputStat"), "");
  updateStat($("#valInputStat"), "");

})();
