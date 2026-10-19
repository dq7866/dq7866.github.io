/* 编码转换工具 · 纯前端实现
 * Base64 / URL / Unicode-Hex / Hash (MD5, SHA-1/256/384/512)
 */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------------- 工具函数 ---------------- */
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function copy(text, btn) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        const t = btn.textContent;
        btn.textContent = "已复制";
        setTimeout(() => (btn.textContent = t), 1200);
      }
    }, () => {
      alert("复制失败，请手动选择复制。");
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  function byteLength(str) {
    // 计算 UTF-8 字节长度
    try {
      return new TextEncoder().encode(str).length;
    } catch (e) {
      let len = 0;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 0x80) len += 1;
        else if (code < 0x800) len += 2;
        else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
          const low = str.charCodeAt(i + 1);
          if (low >= 0xDC00 && low <= 0xDFFF) { len += 4; i++; }
          else len += 3;
        } else len += 3;
      }
      return len;
    }
  }

  /* ---------------- Tabs ---------------- */
  $$("#encTabs .tab").forEach((b) => {
    b.onclick = () => {
      $$("#encTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
      $$(".enc-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
    };
  });

  /* ============================================================
     Tab 1: Base64 编解码
     ============================================================ */
  const b64State = { mode: "text" };

  function updateB64Stats() {
    const inp = $("#b64Input").value;
    const out = $("#b64Output").value;
    $("#b64InputStat").textContent = inp.length + " 字符";
    $("#b64OutputStat").textContent = out.length + " 字符";
    if (inp) {
      $("#b64InputBytes").textContent = byteLength(inp) + " 字节 (UTF-8)";
    } else {
      $("#b64InputBytes").textContent = "-";
    }
    if (out) {
      $("#b64OutputBytes").textContent = byteLength(out) + " 字节 (UTF-8)";
    } else {
      $("#b64OutputBytes").textContent = "-";
    }
  }

  function b64EncodeText() {
    const input = $("#b64Input").value;
    const errEl = $("#b64Error");
    try {
      // 使用 TextEncoder 处理 UTF-8，再转 Base64
      const bytes = new TextEncoder().encode(input);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      const result = btoa(binary);
      $("#b64Output").value = result;
      errEl.classList.remove("show");
      errEl.textContent = "";
    } catch (e) {
      errEl.textContent = "编码失败：" + e.message;
      errEl.classList.add("show");
    }
    updateB64Stats();
  }

  function b64DecodeText() {
    const input = $("#b64Input").value.trim();
    const errEl = $("#b64Error");
    if (!input) {
      $("#b64Output").value = "";
      errEl.classList.remove("show");
      updateB64Stats();
      return;
    }
    try {
      // 验证 Base64 格式
      const clean = input.replace(/\s+/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
        throw new Error("输入包含无效的 Base64 字符");
      }
      if (clean.length % 4 !== 0) {
        throw new Error("Base64 字符串长度不正确（应为 4 的倍数）");
      }
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const result = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      $("#b64Output").value = result;
      errEl.classList.remove("show");
      errEl.textContent = "";
    } catch (e) {
      errEl.textContent = "解码失败：" + e.message;
      errEl.classList.add("show");
      $("#b64Output").value = "";
    }
    updateB64Stats();
  }

  function b64Swap() {
    const inp = $("#b64Input");
    const out = $("#b64Output");
    const tmp = inp.value;
    inp.value = out.value;
    out.value = tmp;
    updateB64Stats();
    $("#b64Error").classList.remove("show");
  }

  function b64Clear() {
    $("#b64Input").value = "";
    $("#b64Output").value = "";
    $("#b64Error").classList.remove("show");
    updateB64Stats();
  }

  // Base64 文件模式
  function b64EncodeFile(file) {
    const reader = new FileReader();
    const errEl = $("#b64Error");
    reader.onload = function (e) {
      try {
        const arrayBuffer = e.target.result;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        const base64 = btoa(binary);
        $("#b64Output").value = base64;
        errEl.classList.remove("show");

        // 文件信息
        $("#b64FileName").textContent = file.name;
        $("#b64FileSize").textContent = " · " + formatBytes(file.size);
        $("#b64FileInfo").classList.add("show");
        updateB64Stats();
      } catch (err) {
        errEl.textContent = "文件编码失败：" + err.message;
        errEl.classList.add("show");
      }
    };
    reader.onerror = function () {
      errEl.textContent = "文件读取失败";
      errEl.classList.add("show");
    };
    reader.readAsArrayBuffer(file);
  }

  function b64DecodeToFile() {
    const input = $("#b64Input").value.trim();
    const fileName = $("#b64DLFileName").value.trim() || "download.bin";
    const errEl = $("#b64Error");
    if (!input) {
      errEl.textContent = "请先输入 Base64 字符串";
      errEl.classList.add("show");
      return;
    }
    try {
      const clean = input.replace(/\s+/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
        throw new Error("输入包含无效的 Base64 字符");
      }
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      errEl.classList.remove("show");
    } catch (e) {
      errEl.textContent = "解码失败：" + e.message;
      errEl.classList.add("show");
    }
  }

  function setupB64FileDrag() {
    const drop = $("#b64FileDrop");
    const input = $("#b64FileInput");

    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) {
        b64EncodeFile(e.dataTransfer.files[0]);
      }
    });
    input.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        b64EncodeFile(e.target.files[0]);
      }
    });
  }

  // Base64 模式切换
  $$("#b64ModeSeg button").forEach((btn) => {
    btn.onclick = () => {
      $$("#b64ModeSeg button").forEach((b) => b.classList.toggle("active", b === btn));
      b64State.mode = btn.dataset.v;
      $("#b64FileArea").classList.toggle("hidden", btn.dataset.v !== "file");
    };
  });

  const debouncedB64Encode = debounce(b64EncodeText, 200);
  $("#b64Input").addEventListener("input", () => {
    updateB64Stats();
    // 自动检测：如果看起来是 base64 且内容变化，不自动编码，等用户点按钮
  });
  $("#b64Encode").addEventListener("click", b64EncodeText);
  $("#b64Decode").addEventListener("click", b64DecodeText);
  $("#b64Swap").addEventListener("click", b64Swap);
  $("#b64Clear").addEventListener("click", b64Clear);
  $("#b64Copy").addEventListener("click", () => copy($("#b64Output").value, $("#b64Copy")));
  $("#b64DownloadBtn").addEventListener("click", b64DecodeToFile);
  setupB64FileDrag();

  /* ============================================================
     Tab 2: URL 编解码
     ============================================================ */
  const urlState = { mode: "component" };

  function updateUrlStats() {
    $("#urlInputStat").textContent = $("#urlInput").value.length + " 字符";
    $("#urlOutputStat").textContent = $("#urlOutput").value.length + " 字符";
  }

  function urlEncode() {
    const input = $("#urlInput").value;
    const errEl = $("#urlError");
    try {
      let result;
      if (urlState.mode === "component") {
        result = encodeURIComponent(input);
      } else {
        result = encodeURI(input);
      }
      $("#urlOutput").value = result;
      errEl.classList.remove("show");
    } catch (e) {
      errEl.textContent = "编码失败：" + e.message;
      errEl.classList.add("show");
    }
    updateUrlStats();
  }

  function urlDecode() {
    const input = $("#urlInput").value;
    const errEl = $("#urlError");
    if (!input) {
      $("#urlOutput").value = "";
      errEl.classList.remove("show");
      updateUrlStats();
      return;
    }
    try {
      let result;
      if (urlState.mode === "component") {
        result = decodeURIComponent(input);
      } else {
        result = decodeURI(input);
      }
      $("#urlOutput").value = result;
      errEl.classList.remove("show");
    } catch (e) {
      errEl.textContent = "解码失败：" + e.message + "（可能包含无效的百分比编码序列）";
      errEl.classList.add("show");
      $("#urlOutput").value = "";
    }
    updateUrlStats();
  }

  function urlSwap() {
    const inp = $("#urlInput");
    const out = $("#urlOutput");
    const tmp = inp.value;
    inp.value = out.value;
    out.value = tmp;
    updateUrlStats();
    $("#urlError").classList.remove("show");
  }

  function urlClear() {
    $("#urlInput").value = "";
    $("#urlOutput").value = "";
    $("#urlError").classList.remove("show");
    updateUrlStats();
  }

  const debouncedUrlEncode = debounce(urlEncode, 150);
  const debouncedUrlDecode = debounce(urlDecode, 150);

  function urlAutoConvert() {
    if (!$("#urlAuto").checked) return;
    // 简单启发式：如果输入包含 % 则尝试解码，否则编码
    const input = $("#urlInput").value;
    if (/%[0-9A-Fa-f]{2}/.test(input)) {
      urlDecode();
    } else {
      urlEncode();
    }
  }

  const debouncedUrlAuto = debounce(urlAutoConvert, 150);

  $$("#urlModeSeg button").forEach((btn) => {
    btn.onclick = () => {
      $$("#urlModeSeg button").forEach((b) => b.classList.toggle("active", b === btn));
      urlState.mode = btn.dataset.v;
      $("#urlModeHint").textContent = btn.dataset.v === "component"
        ? "encodeURIComponent 会编码更多特殊字符，适用于 URL 参数。"
        : "encodeURI 用于整个 URL，保留部分特殊字符。";
      urlAutoConvert();
    };
  });

  $("#urlInput").addEventListener("input", () => {
    updateUrlStats();
    debouncedUrlAuto();
  });
  $("#urlEncode").addEventListener("click", urlEncode);
  $("#urlDecode").addEventListener("click", urlDecode);
  $("#urlSwap").addEventListener("click", urlSwap);
  $("#urlClear").addEventListener("click", urlClear);
  $("#urlCopy").addEventListener("click", () => copy($("#urlOutput").value, $("#urlCopy")));
  $("#urlAuto").addEventListener("change", () => {
    if ($("#urlAuto").checked) urlAutoConvert();
  });

  /* ============================================================
     Tab 3: Unicode / Hex 转换
     ============================================================ */
  const uniState = { format: "space" };

  function updateUniStats() {
    const text = $("#uniTextInput").value;
    const hex = $("#uniHexOutput").value;
    $("#uniTextStat").textContent = text.length + " 字符 / " + byteLength(text) + " 字节 (UTF-8)";
    $("#uniHexStat").textContent = hex ? hex.length + " 字符" : "-";
  }

  // 文本转 Hex（支持 UTF-16 code unit）
  function textToHex(text, format) {
    let result = "";
    switch (format) {
      case "space": {
        // 以 Unicode 码点为单位，输出 4 位或更多位的十六进制
        const parts = [];
        for (const ch of text) {
          const code = ch.codePointAt(0);
          parts.push(code.toString(16).padStart(code > 0xFFFF ? 5 : 4, "0"));
        }
        result = parts.join(" ");
        break;
      }
      case "u": {
        // \uXXXX 格式，代理对拆成两个
        let s = "";
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i);
          s += "\\u" + code.toString(16).toUpperCase().padStart(4, "0");
        }
        result = s;
        break;
      }
      case "html": {
        // &#XXXX; HTML 实体，十进制
        let s = "";
        for (const ch of text) {
          const code = ch.codePointAt(0);
          s += "&#" + code + ";";
        }
        result = s;
        break;
      }
    }
    return result;
  }

  // Hex 转文本，自动识别格式
  function hexToText(hexStr) {
    const str = hexStr.trim();
    if (!str) return "";

    // 检测格式
    // HTML 实体: &#XXXX;
    if (/&#\d+;/.test(str)) {
      let result = "";
      const re = /&#(\d+);/g;
      let last = 0;
      let m;
      while ((m = re.exec(str)) !== null) {
        if (m.index > last) result += str.slice(last, m.index);
        result += String.fromCodePoint(parseInt(m[1], 10));
        last = re.lastIndex;
      }
      if (last < str.length) result += str.slice(last);
      return result;
    }

    // \uXXXX 格式
    if (/\\u[0-9A-Fa-f]{4}/.test(str)) {
      let result = "";
      const re = /\\u([0-9A-Fa-f]{4})/g;
      let last = 0;
      let m;
      while ((m = re.exec(str)) !== null) {
        if (m.index > last) result += str.slice(last, m.index);
        result += String.fromCharCode(parseInt(m[1], 16));
        last = re.lastIndex;
      }
      if (last < str.length) result += str.slice(last);
      return result;
    }

    // 空格分隔或连续 hex：按 UTF-16 码点（每 4 位 hex 一个字符）处理
    // 先清理非 hex 字符
    const clean = str.replace(/[^0-9A-Fa-f]/g, "");
    if (!clean) return "";
    if (clean.length % 2 !== 0) {
      throw new Error("十六进制字符数应为偶数");
    }

    // 尝试按 UTF-8 字节解码（如果长度合理且能解码成功）
    // 先按字节尝试 UTF-8
    try {
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
      }
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return decoded;
    } catch (e) {
      // UTF-8 解码失败，按 UTF-16 码点尝试
      if (clean.length % 4 === 0) {
        let result = "";
        for (let i = 0; i < clean.length; i += 4) {
          result += String.fromCharCode(parseInt(clean.substr(i, 4), 16));
        }
        return result;
      }
      // 最后按单字节 Latin-1 返回
      let result = "";
      for (let i = 0; i < clean.length; i += 2) {
        result += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
      }
      return result;
    }
  }

  function uniEncode() {
    const input = $("#uniTextInput").value;
    const errEl = $("#uniError");
    try {
      const result = textToHex(input, uniState.format);
      $("#uniHexOutput").value = result;
      errEl.classList.remove("show");
    } catch (e) {
      errEl.textContent = "转换失败：" + e.message;
      errEl.classList.add("show");
    }
    updateUniStats();
  }

  function uniDecode() {
    const input = $("#uniHexOutput").value;
    const errEl = $("#uniError");
    if (!input.trim()) {
      $("#uniTextInput").value = "";
      errEl.classList.remove("show");
      updateUniStats();
      return;
    }
    try {
      const result = hexToText(input);
      $("#uniTextInput").value = result;
      errEl.classList.remove("show");
    } catch (e) {
      errEl.textContent = "转换失败：" + e.message;
      errEl.classList.add("show");
    }
    updateUniStats();
  }

  function uniSwap() {
    const text = $("#uniTextInput");
    const hex = $("#uniHexOutput");
    const tmp = text.value;
    text.value = hex.value;
    hex.value = tmp;
    updateUniStats();
    $("#uniError").classList.remove("show");
  }

  function uniClear() {
    $("#uniTextInput").value = "";
    $("#uniHexOutput").value = "";
    $("#uniError").classList.remove("show");
    updateUniStats();
  }

  const debouncedUniEncode = debounce(uniEncode, 150);

  function uniAutoConvert() {
    if (!$("#uniAuto").checked) return;
    uniEncode();
  }

  const debouncedUniAuto = debounce(uniAutoConvert, 150);

  $$("#uniFormatSeg button").forEach((btn) => {
    btn.onclick = () => {
      $$("#uniFormatSeg button").forEach((b) => b.classList.toggle("active", b === btn));
      uniState.format = btn.dataset.v;
      uniAutoConvert();
    };
  });

  $("#uniTextInput").addEventListener("input", () => {
    updateUniStats();
    debouncedUniAuto();
  });
  $("#uniEncode").addEventListener("click", uniEncode);
  $("#uniDecode").addEventListener("click", uniDecode);
  $("#uniSwap").addEventListener("click", uniSwap);
  $("#uniClear").addEventListener("click", uniClear);
  $("#uniCopy").addEventListener("click", () => copy($("#uniHexOutput").value, $("#uniCopy")));
  $("#uniAuto").addEventListener("change", () => {
    if ($("#uniAuto").checked) uniAutoConvert();
  });

  /* ============================================================
     Tab 4: 哈希计算
     ============================================================ */

  /* ---------- MD5 纯 JS 实现 ---------- */
  function md5(strOrBytes) {
    // 支持字符串或 Uint8Array
    let bytes;
    if (typeof strOrBytes === "string") {
      bytes = new TextEncoder().encode(strOrBytes);
    } else if (strOrBytes instanceof Uint8Array) {
      bytes = strOrBytes;
    } else {
      bytes = new Uint8Array(strOrBytes);
    }

    // 填充
    const msgLen = bytes.length;
    const bitLen = msgLen * 8;
    // 计算填充后长度（512位块 = 64字节，末尾8字节存长度）
    const paddedLen = (Math.floor((msgLen + 8) / 64) + 1) * 64;
    const padded = new Uint8Array(paddedLen);
    padded.set(bytes);
    padded[msgLen] = 0x80; // 追加 1 bit（0x80）

    // 追加原始长度（64位小端）
    const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
    view.setUint32(paddedLen - 8, bitLen >>> 0, true);
    view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

    // 初始化哈希值
    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    // 辅助函数
    function F(x, y, z) { return (x & y) | (~x & z); }
    function G(x, y, z) { return (x & z) | (y & ~z); }
    function H(x, y, z) { return x ^ y ^ z; }
    function I(x, y, z) { return y ^ (x | ~z); }
    function rotateLeft(x, n) { return (x << n) | (x >>> (32 - n)); }

    // 每轮操作
    function FF(a, b, c, d, x, s, ac) {
      a = (a + F(b, c, d) + x + ac) | 0;
      a = rotateLeft(a, s);
      a = (a + b) | 0;
      return a;
    }
    function GG(a, b, c, d, x, s, ac) {
      a = (a + G(b, c, d) + x + ac) | 0;
      a = rotateLeft(a, s);
      a = (a + b) | 0;
      return a;
    }
    function HH(a, b, c, d, x, s, ac) {
      a = (a + H(b, c, d) + x + ac) | 0;
      a = rotateLeft(a, s);
      a = (a + b) | 0;
      return a;
    }
    function II(a, b, c, d, x, s, ac) {
      a = (a + I(b, c, d) + x + ac) | 0;
      a = rotateLeft(a, s);
      a = (a + b) | 0;
      return a;
    }

    // 处理每个 512 位块
    for (let offset = 0; offset < paddedLen; offset += 64) {
      const M = new Uint32Array(16);
      for (let i = 0; i < 16; i++) {
        M[i] = view.getUint32(offset + i * 4, true);
      }

      let A = a0, B = b0, C = c0, D = d0;

      // 第 1 轮
      A = FF(A, B, C, D, M[0], 7, 0xd76aa478);
      D = FF(D, A, B, C, M[1], 12, 0xe8c7b756);
      C = FF(C, D, A, B, M[2], 17, 0x242070db);
      B = FF(B, C, D, A, M[3], 22, 0xc1bdceee);
      A = FF(A, B, C, D, M[4], 7, 0xf57c0faf);
      D = FF(D, A, B, C, M[5], 12, 0x4787c62a);
      C = FF(C, D, A, B, M[6], 17, 0xa8304613);
      B = FF(B, C, D, A, M[7], 22, 0xfd469501);
      A = FF(A, B, C, D, M[8], 7, 0x698098d8);
      D = FF(D, A, B, C, M[9], 12, 0x8b44f7af);
      C = FF(C, D, A, B, M[10], 17, 0xffff5bb1);
      B = FF(B, C, D, A, M[11], 22, 0x895cd7be);
      A = FF(A, B, C, D, M[12], 7, 0x6b901122);
      D = FF(D, A, B, C, M[13], 12, 0xfd987193);
      C = FF(C, D, A, B, M[14], 17, 0xa679438e);
      B = FF(B, C, D, A, M[15], 22, 0x49b40821);

      // 第 2 轮
      A = GG(A, B, C, D, M[1], 5, 0xf61e2562);
      D = GG(D, A, B, C, M[6], 9, 0xc040b340);
      C = GG(C, D, A, B, M[11], 14, 0x265e5a51);
      B = GG(B, C, D, A, M[0], 20, 0xe9b6c7aa);
      A = GG(A, B, C, D, M[5], 5, 0xd62f105d);
      D = GG(D, A, B, C, M[10], 9, 0x02441453);
      C = GG(C, D, A, B, M[15], 14, 0xd8a1e681);
      B = GG(B, C, D, A, M[4], 20, 0xe7d3fbc8);
      A = GG(A, B, C, D, M[9], 5, 0x21e1cde6);
      D = GG(D, A, B, C, M[14], 9, 0xc33707d6);
      C = GG(C, D, A, B, M[3], 14, 0xf4d50d87);
      B = GG(B, C, D, A, M[8], 20, 0x455a14ed);
      A = GG(A, B, C, D, M[13], 5, 0xa9e3e905);
      D = GG(D, A, B, C, M[2], 9, 0xfcefa3f8);
      C = GG(C, D, A, B, M[7], 14, 0x676f02d9);
      B = GG(B, C, D, A, M[12], 20, 0x8d2a4c8a);

      // 第 3 轮
      A = HH(A, B, C, D, M[5], 4, 0xfffa3942);
      D = HH(D, A, B, C, M[8], 11, 0x8771f681);
      C = HH(C, D, A, B, M[11], 16, 0x6d9d6122);
      B = HH(B, C, D, A, M[14], 23, 0xfde5380c);
      A = HH(A, B, C, D, M[1], 4, 0xa4beea44);
      D = HH(D, A, B, C, M[4], 11, 0x4bdecfa9);
      C = HH(C, D, A, B, M[7], 16, 0xf6bb4b60);
      B = HH(B, C, D, A, M[10], 23, 0xbebfbc70);
      A = HH(A, B, C, D, M[13], 4, 0x289b7ec6);
      D = HH(D, A, B, C, M[0], 11, 0xeaa127fa);
      C = HH(C, D, A, B, M[3], 16, 0xd4ef3085);
      B = HH(B, C, D, A, M[6], 23, 0x04881d05);
      A = HH(A, B, C, D, M[9], 4, 0xd9d4d039);
      D = HH(D, A, B, C, M[12], 11, 0xe6db99e5);
      C = HH(C, D, A, B, M[15], 16, 0x1fa27cf8);
      B = HH(B, C, D, A, M[2], 23, 0xc4ac5665);

      // 第 4 轮
      A = II(A, B, C, D, M[0], 6, 0xf4292244);
      D = II(D, A, B, C, M[7], 10, 0x432aff97);
      C = II(C, D, A, B, M[14], 15, 0xab9423a7);
      B = II(B, C, D, A, M[5], 21, 0xfc93a039);
      A = II(A, B, C, D, M[12], 6, 0x655b59c3);
      D = II(D, A, B, C, M[3], 10, 0x8f0ccc92);
      C = II(C, D, A, B, M[10], 15, 0xffeff47d);
      B = II(B, C, D, A, M[1], 21, 0x85845dd1);
      A = II(A, B, C, D, M[8], 6, 0x6fa87e4f);
      D = II(D, A, B, C, M[15], 10, 0xfe2ce6e0);
      C = II(C, D, A, B, M[6], 15, 0xa3014314);
      B = II(B, C, D, A, M[13], 21, 0x4e0811a1);
      A = II(A, B, C, D, M[4], 6, 0xf7537e82);
      D = II(D, A, B, C, M[11], 10, 0xbd3af235);
      C = II(C, D, A, B, M[2], 15, 0x2ad7d2bb);
      B = II(B, C, D, A, M[9], 21, 0xeb86d391);

      a0 = (a0 + A) | 0;
      b0 = (b0 + B) | 0;
      c0 = (c0 + C) | 0;
      d0 = (d0 + D) | 0;
    }

    // 输出十六进制（小端）
    function toHexLE(val) {
      const hex = (val >>> 0).toString(16).padStart(8, "0");
      // 小端：字节反转
      return hex.substr(6, 2) + hex.substr(4, 2) + hex.substr(2, 2) + hex.substr(0, 2);
    }

    return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
  }

  /* ---------- SHA 哈希（Web Crypto API） ---------- */
  async function shaHash(bytes, algorithm) {
    const hashBuffer = await crypto.subtle.digest(algorithm, bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- 哈希计算主逻辑 ---------- */
  const hashState = { mode: "text", fileBytes: null };

  async function calcHashes(bytes) {
    const startTime = performance.now();
    const results = {};

    // MD5 (纯 JS)
    results.md5 = md5(bytes);

    // SHA 系列 (Web Crypto API)
    if (crypto.subtle) {
      const algos = [
        { key: "sha1", name: "SHA-1" },
        { key: "sha256", name: "SHA-256" },
        { key: "sha384", name: "SHA-384" },
        { key: "sha512", name: "SHA-512" }
      ];
      for (const algo of algos) {
        try {
          results[algo.key] = await shaHash(bytes, algo.name);
        } catch (e) {
          results[algo.key] = "不支持";
        }
      }
    } else {
      results.sha1 = "不支持";
      results.sha256 = "不支持";
      results.sha384 = "不支持";
      results.sha512 = "不支持";
    }

    const elapsed = performance.now() - startTime;
    return { results, elapsed };
  }

  function displayHashResults(results, dataSize, elapsed) {
    $("#hashMd5").textContent = results.md5 || "-";
    $("#hashSha1").textContent = results.sha1 || "-";
    $("#hashSha256").textContent = results.sha256 || "-";
    $("#hashSha384").textContent = results.sha384 || "-";
    $("#hashSha512").textContent = results.sha512 || "-";
    $("#hashDataSize").textContent = formatBytes(dataSize);
    $("#hashTime").textContent = elapsed.toFixed(2) + " ms";
    $("#hashResults").style.display = "block";
  }

  async function hashCalcText() {
    const text = $("#hashInput").value;
    const errEl = $("#hashError");
    if (!text) {
      errEl.textContent = "请输入要计算哈希的文本";
      errEl.classList.add("show");
      return;
    }
    errEl.classList.remove("show");

    const bytes = new TextEncoder().encode(text);
    const { results, elapsed } = await calcHashes(bytes);
    displayHashResults(results, bytes.length, elapsed);
  }

  async function hashCalcFile() {
    const errEl = $("#hashError");
    if (!hashState.fileBytes) {
      errEl.textContent = "请先选择文件";
      errEl.classList.add("show");
      return;
    }
    errEl.classList.remove("show");

    const { results, elapsed } = await calcHashes(hashState.fileBytes);
    displayHashResults(results, hashState.fileBytes.length, elapsed);
  }

  async function hashCalc() {
    if (hashState.mode === "text") {
      await hashCalcText();
    } else {
      await hashCalcFile();
    }
  }

  function hashClear() {
    $("#hashInput").value = "";
    $("#hashFileInput").value = "";
    hashState.fileBytes = null;
    $("#hashFileInfo").classList.remove("show");
    $("#hashResults").style.display = "none";
    $("#hashError").classList.remove("show");
    $("#hashInputStat").textContent = "0 字符";
  }

  function setupHashFileDrag() {
    const drop = $("#hashFileDrop");
    const input = $("#hashFileInput");

    function handleFile(file) {
      const reader = new FileReader();
      const errEl = $("#hashError");
      reader.onload = function (e) {
        try {
          hashState.fileBytes = new Uint8Array(e.target.result);
          $("#hashFileName").textContent = file.name;
          $("#hashFileSize").textContent = " · " + formatBytes(file.size);
          $("#hashFileInfo").classList.add("show");
          errEl.classList.remove("show");
          // 自动计算
          hashCalc();
        } catch (err) {
          errEl.textContent = "文件读取失败：" + err.message;
          errEl.classList.add("show");
        }
      };
      reader.onerror = function () {
        errEl.textContent = "文件读取失败";
        errEl.classList.add("show");
      };
      reader.readAsArrayBuffer(file);
    }

    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });
    input.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });
  }

  // 哈希模式切换
  $$("#hashModeSeg button").forEach((btn) => {
    btn.onclick = () => {
      $$("#hashModeSeg button").forEach((b) => b.classList.toggle("active", b === btn));
      hashState.mode = btn.dataset.v;
      $("#hashTextArea").classList.toggle("hidden", btn.dataset.v !== "text");
      $("#hashFileArea").classList.toggle("hidden", btn.dataset.v !== "file");
      $("#hashResults").style.display = "none";
      $("#hashError").classList.remove("show");
    };
  });

  const debouncedHashCalc = debounce(() => {
    if (hashState.mode === "text" && $("#hashInput").value) {
      hashCalcText();
    }
  }, 300);

  $("#hashInput").addEventListener("input", () => {
    $("#hashInputStat").textContent = $("#hashInput").value.length + " 字符 / " + byteLength($("#hashInput").value) + " 字节";
    debouncedHashCalc();
  });
  $("#hashCalc").addEventListener("click", hashCalc);
  $("#hashClear").addEventListener("click", hashClear);

  $$(".hash-copy").forEach((btn) => {
    btn.onclick = () => {
      const targetId = btn.dataset.copyHash;
      const el = document.getElementById(targetId);
      if (el && el.textContent && el.textContent !== "-") {
        copy(el.textContent, btn);
      }
    };
  });

  setupHashFileDrag();

  /* ============================================================
     初始化
     ============================================================ */
  function init() {
    updateB64Stats();
    updateUrlStats();
    updateUniStats();

    // 填充示例
    $("#b64Input").value = "你好，世界！";
    b64EncodeText();

    $("#urlInput").value = "https://www.example.com/path?name=张三&age=25";
    urlEncode();

    $("#uniTextInput").value = "你好世界 Hello";
    uniEncode();

    $("#hashInput").value = "Hello, World!";
    hashCalcText();
  }

  init();
})();
