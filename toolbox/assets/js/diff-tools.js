/* ============================================================
   文本对比工具 · 纯前端
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 通用工具 ---------------- */

  function debounce(fn, delay) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), delay);
    };
  }

  function copyText(text) {
    if (!text) return Promise.reject("无内容");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- Diff 算法 ---------------- */

  /**
   * 计算最长公共子序列 (LCS) 表
   * 返回一个二维数组 dp，dp[i][j] 表示 a[0..i-1] 和 b[0..j-1] 的 LCS 长度
   */
  function computeLCS(a, b) {
    const m = a.length;
    const n = b.length;
    // 使用 Int32Array 优化性能
    const dp = new Array(m + 1);
    for (let i = 0; i <= m; i++) {
      dp[i] = new Int32Array(n + 1);
    }
    for (let i = 1; i <= m; i++) {
      const row = dp[i];
      const prevRow = dp[i - 1];
      const ai = a[i - 1];
      for (let j = 1; j <= n; j++) {
        if (ai === b[j - 1]) {
          row[j] = prevRow[j - 1] + 1;
        } else {
          row[j] = prevRow[j] >= row[j - 1] ? prevRow[j] : row[j - 1];
        }
      }
    }
    return dp;
  }

  /**
   * 根据 LCS 表回溯，生成 diff 操作序列
   * 返回操作数组：每个元素 { type: 'add'|'del'|'same', value: string }
   */
  function backtrackLCS(dp, a, b, i, j) {
    const ops = [];
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        ops.push({ type: "same", value: a[i - 1] });
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        ops.push({ type: "del", value: a[i - 1] });
        i--;
      } else {
        ops.push({ type: "add", value: b[j - 1] });
        j--;
      }
    }
    while (i > 0) {
      ops.push({ type: "del", value: a[i - 1] });
      i--;
    }
    while (j > 0) {
      ops.push({ type: "add", value: b[j - 1] });
      j--;
    }
    return ops.reverse();
  }

  /**
   * 将文本拆分为行，空字符串返回空数组
   */
  function splitLines(text) {
    if (text === "") return [];
    return text.split("\n");
  }

  /**
   * 行级 diff
   */
  function lineDiff(oldText, newText) {
    const oldLines = splitLines(oldText);
    const newLines = splitLines(newText);
    const dp = computeLCS(oldLines, newLines);
    const ops = backtrackLCS(dp, oldLines, newLines, oldLines.length, newLines.length);
    return ops;
  }

  /**
   * 单词级 diff (按单词和空白拆分)
   */
  function wordDiff(oldStr, newStr) {
    const oldWords = oldStr.split(/(\s+)/).filter(s => s.length > 0);
    const newWords = newStr.split(/(\s+)/).filter(s => s.length > 0);
    const dp = computeLCS(oldWords, newWords);
    const ops = backtrackLCS(dp, oldWords, newWords, oldWords.length, newWords.length);
    return ops;
  }

  /**
   * 字符级 diff
   */
  function charDiff(oldStr, newStr) {
    const oldChars = Array.from(oldStr);
    const newChars = Array.from(newStr);
    const dp = computeLCS(oldChars, newChars);
    const ops = backtrackLCS(dp, oldChars, newChars, oldChars.length, newChars.length);
    return ops;
  }

  /**
   * 合并连续的同类型操作为 HTML 字符串
   */
  function opsToHtml(ops, type) {
    // type: 'add' | 'del' — 表示我们要渲染的是新增侧还是删除侧
    let html = "";
    for (const op of ops) {
      if (op.type === "same") {
        html += escapeHtml(op.value);
      } else if (op.type === type) {
        const cls = type === "add" ? "diff-add-char" : "diff-del-char";
        html += `<span class="${cls}">${escapeHtml(op.value)}</span>`;
      }
      // 另一侧的操作忽略（因为我们只渲染一侧）
    }
    return html;
  }

  /* ---------------- Diff 结果构建 ---------------- */

  let currentGranularity = "line";
  let currentViewMode = "side";

  /**
   * 计算完整的 diff 结果，返回结构化数据用于渲染
   */
  function computeDiff(oldText, newText, granularity) {
    const startTime = performance.now();
    const lineOps = lineDiff(oldText, newText);

    // 统计
    let addCount = 0, delCount = 0, sameCount = 0;

    // 构建行对（用于并排视图）
    const leftLines = [];  // { type, lineNum, content, innerHtml }
    const rightLines = []; // { type, lineNum, innerHtml }
    const unifiedLines = []; // { type, leftNum, rightNum, content, innerHtml }

    let leftNum = 0, rightNum = 0;

    // 临时收集待处理的删除和添加操作
    let pendingDels = [];
    let pendingAdds = [];

    function flushPending() {
      if (pendingDels.length === 0 && pendingAdds.length === 0) return;

      if (pendingDels.length > 0 && pendingAdds.length > 0) {
        // 有修改的行 - 尝试行对匹配
        const minLen = Math.min(pendingDels.length, pendingAdds.length);
        for (let i = 0; i < minLen; i++) {
          const delLine = pendingDels[i];
          const addLine = pendingAdds[i];
          leftNum++;
          rightNum++;

          let leftHtml, rightHtml;
          if (granularity === "char") {
            const ops = charDiff(delLine, addLine);
            leftHtml = opsToHtml(ops, "del");
            rightHtml = opsToHtml(ops, "add");
          } else if (granularity === "word") {
            const ops = wordDiff(delLine, addLine);
            leftHtml = opsToHtml(ops, "del");
            rightHtml = opsToHtml(ops, "add");
          } else {
            leftHtml = escapeHtml(delLine);
            rightHtml = escapeHtml(addLine);
          }

          leftLines.push({ type: "del", lineNum: leftNum, content: delLine, innerHtml: leftHtml });
          rightLines.push({ type: "add", lineNum: rightNum, content: addLine, innerHtml: rightHtml });
          unifiedLines.push({ type: "del", leftNum: leftNum, rightNum: "", content: delLine, innerHtml: leftHtml });
          unifiedLines.push({ type: "add", leftNum: "", rightNum: rightNum, content: addLine, innerHtml: rightHtml });
          addCount++;
          delCount++;
        }
        // 处理剩余的
        if (pendingDels.length > minLen) {
          for (let i = minLen; i < pendingDels.length; i++) {
            const line = pendingDels[i];
            leftNum++;
            leftLines.push({ type: "del", lineNum: leftNum, content: line, innerHtml: escapeHtml(line) });
            rightLines.push({ type: "empty", lineNum: "", content: "", innerHtml: "" });
            unifiedLines.push({ type: "del", leftNum: leftNum, rightNum: "", content: line, innerHtml: escapeHtml(line) });
            delCount++;
          }
        }
        if (pendingAdds.length > minLen) {
          for (let i = minLen; i < pendingAdds.length; i++) {
            const line = pendingAdds[i];
            rightNum++;
            leftLines.push({ type: "empty", lineNum: "", content: "", innerHtml: "" });
            rightLines.push({ type: "add", lineNum: rightNum, content: line, innerHtml: escapeHtml(line) });
            unifiedLines.push({ type: "add", leftNum: "", rightNum: rightNum, content: line, innerHtml: escapeHtml(line) });
            addCount++;
          }
        }
      } else if (pendingDels.length > 0) {
        // 纯删除
        for (const line of pendingDels) {
          leftNum++;
          leftLines.push({ type: "del", lineNum: leftNum, content: line, innerHtml: escapeHtml(line) });
          rightLines.push({ type: "empty", lineNum: "", content: "", innerHtml: "" });
          unifiedLines.push({ type: "del", leftNum: leftNum, rightNum: "", content: line, innerHtml: escapeHtml(line) });
          delCount++;
        }
      } else if (pendingAdds.length > 0) {
        // 纯新增
        for (const line of pendingAdds) {
          rightNum++;
          leftLines.push({ type: "empty", lineNum: "", content: "", innerHtml: "" });
          rightLines.push({ type: "add", lineNum: rightNum, content: line, innerHtml: escapeHtml(line) });
          unifiedLines.push({ type: "add", leftNum: "", rightNum: rightNum, content: line, innerHtml: escapeHtml(line) });
          addCount++;
        }
      }

      pendingDels = [];
      pendingAdds = [];
    }

    for (const op of lineOps) {
      if (op.type === "same") {
        flushPending();
        leftNum++;
        rightNum++;
        const content = op.value;
        leftLines.push({ type: "same", lineNum: leftNum, content: content, innerHtml: escapeHtml(content) });
        rightLines.push({ type: "same", lineNum: rightNum, content: content, innerHtml: escapeHtml(content) });
        unifiedLines.push({ type: "same", leftNum: leftNum, rightNum: rightNum, content: content, innerHtml: escapeHtml(content) });
        sameCount++;
      } else if (op.type === "del") {
        pendingDels.push(op.value);
      } else if (op.type === "add") {
        pendingAdds.push(op.value);
      }
    }
    flushPending();

    const elapsed = (performance.now() - startTime).toFixed(1);

    return {
      leftLines,
      rightLines,
      unifiedLines,
      stats: { add: addCount, del: delCount, same: sameCount },
      elapsed
    };
  }

  /* ---------------- 渲染 ---------------- */

  function renderSideBySide(result) {
    const { leftLines, rightLines } = result;
    let leftHtml = "";
    let rightHtml = "";

    for (let i = 0; i < leftLines.length; i++) {
      const l = leftLines[i];
      const r = rightLines[i];
      leftHtml += `<div class="diff-line ${l.type}"><span class="ln">${l.lineNum || ""}</span><span class="content">${l.innerHtml || "&nbsp;"}</span></div>`;
      rightHtml += `<div class="diff-line ${r.type}"><span class="ln">${r.lineNum || ""}</span><span class="content">${r.innerHtml || "&nbsp;"}</span></div>`;
    }

    return `<div class="diff-side-by-side">
      <div class="diff-col diff-col-left">${leftHtml}</div>
      <div class="diff-col diff-col-right">${rightHtml}</div>
    </div>`;
  }

  function renderUnified(result) {
    let html = "";
    for (const line of result.unifiedLines) {
      let prefix = " ";
      if (line.type === "add") prefix = "+";
      else if (line.type === "del") prefix = "-";

      const ln = line.type === "add" ? line.rightNum : line.leftNum;
      html += `<div class="diff-line ${line.type}">
        <span class="ln">${ln || ""}</span>
        <span class="prefix">${prefix}</span>
        <span class="content">${line.innerHtml || "&nbsp;"}</span>
      </div>`;
    }
    return `<div class="diff-unified">${html}</div>`;
  }

  function updateStats(stats) {
    $("#statAdd").textContent = stats.add;
    $("#statDel").textContent = stats.del;
    $("#statSame").textContent = stats.same;
  }

  function updateCharStats() {
    const orig = $("#diffOriginal").value;
    const mod = $("#diffModified").value;
    const origLines = orig ? orig.split("\n").length : 0;
    const modLines = mod ? mod.split("\n").length : 0;
    $("#origStat").textContent = `${orig.length} 字符 · ${origLines} 行`;
    $("#modStat").textContent = `${mod.length} 字符 · ${modLines} 行`;
  }

  let lastResult = null;

  function doDiff() {
    const oldText = $("#diffOriginal").value;
    const newText = $("#diffModified").value;
    const resultBox = $("#diffResult");
    const diffView = $("#diffView");

    if (!oldText && !newText) {
      resultBox.style.display = "none";
      lastResult = null;
      return;
    }
    if (oldText.length > 50000 || newText.length > 50000) {
      resultBox.style.display = "block";
      diffView.innerHTML = '<div style="padding:20px;color:#ff5b6e">文本过大（单段超过 5 万字符），可能影响性能，请精简后再试。</div>';
      return;
    }

    resultBox.style.display = "block";

    const result = computeDiff(oldText, newText, currentGranularity);
    lastResult = result;

    updateStats(result.stats);
    $("#diffTime").textContent = `耗时 ${result.elapsed}ms`;

    if (currentViewMode === "side") {
      diffView.innerHTML = renderSideBySide(result);
    } else {
      diffView.innerHTML = renderUnified(result);
    }
  }

  const debouncedDiff = debounce(doDiff, 150);

  /* ---------------- 生成文本格式的 diff 结果（用于复制） ---------------- */

  function generateUnifiedText() {
    if (!lastResult) return "";
    let text = "";
    for (const line of lastResult.unifiedLines) {
      let prefix = " ";
      if (line.type === "add") prefix = "+";
      else if (line.type === "del") prefix = "-";
      text += prefix + line.content + "\n";
    }
    return text.trimEnd();
  }

  /* ---------------- 示例文本 ---------------- */

  const EXAMPLE_OLD = `function greet(name) {
  return true;
}

function farewell(name) {
}

greet("World");`;

  const EXAMPLE_NEW = `function greet(name, greeting) {
  const message = greeting + ", " + name + "!";
  return message;
}

function farewell(name) {
}

function welcome(name) {
}

greet("World", "Hello");
welcome("User");`;

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    // 文本输入
    $("#diffOriginal").addEventListener("input", () => {
      updateCharStats();
      debouncedDiff();
    });
    $("#diffModified").addEventListener("input", () => {
      updateCharStats();
      debouncedDiff();
    });

    // 粒度切换
    $$("#granularitySeg button").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#granularitySeg button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentGranularity = btn.dataset.v;
        doDiff();
      });
    });

    // 视图模式切换
    $$("#viewModeSeg button").forEach(btn => {
      btn.addEventListener("click", () => {
        $$("#viewModeSeg button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentViewMode = btn.dataset.v;
        if (lastResult) {
          const diffView = $("#diffView");
          if (currentViewMode === "side") {
            diffView.innerHTML = renderSideBySide(lastResult);
          } else {
            diffView.innerHTML = renderUnified(lastResult);
          }
        }
      });
    });

    // 交换
    $("#diffSwap").addEventListener("click", () => {
      const orig = $("#diffOriginal");
      const mod = $("#diffModified");
      const tmp = orig.value;
      orig.value = mod.value;
      mod.value = tmp;
      updateCharStats();
      doDiff();
    });

    // 清空
    $("#diffClear").addEventListener("click", () => {
      $("#diffOriginal").value = "";
      $("#diffModified").value = "";
      updateCharStats();
      $("#diffResult").style.display = "none";
      lastResult = null;
    });

    // 示例
    $("#diffExample").addEventListener("click", () => {
      $("#diffOriginal").value = EXAMPLE_OLD;
      $("#diffModified").value = EXAMPLE_NEW;
      updateCharStats();
      doDiff();
    });

    // 复制结果
    $("#diffCopy").addEventListener("click", () => {
      const text = generateUnifiedText();
      if (!text) {
        return;
      }
      copyText(text).then(() => {
        const btn = $("#diffCopy");
        const origText = btn.textContent;
        btn.textContent = "已复制";
        setTimeout(() => { btn.textContent = origText; }, 1500);
      }).catch(() => {
        const btn = $("#diffCopy");
        const origText = btn.textContent;
        btn.textContent = "复制失败";
        setTimeout(() => { btn.textContent = origText; }, 1500);
      });
    });
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    bindEvents();
    updateCharStats();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
