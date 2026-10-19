/* ============================================================
   免费工具箱 · 文件处理（压缩 / 解压 / 批量更名 / 查重 / 回收站）
   全部通过本机增强服务 http://127.0.0.1:8765/file/* 完成
   ============================================================ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const SVC = "http://127.0.0.1:8765";

  const state = {
    cwd: "", entries: [], selected: new Set(), mode: "zip",
    dupGroups: [], pendingDelete: [],
    browseReqId: 0, dupEventsBound: false
  };

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const fmtBytes = (n) => (!n ? "0 B" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(2) + " MB" : (n / 1073741824).toFixed(2) + " GB");
  const joinPath = (dir, name) => (dir.endsWith("\\") || dir.endsWith("/") ? dir + name : dir + "\\" + name);
  const parentOf = (p) => { const s = String(p).replace(/[\\/]+$/, ""); const i = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/")); return i <= 1 ? s.slice(0, i + 1) : s.slice(0, i); };
  const pad0 = (n, w) => String(n).padStart(w || 0, "0");

  /* ---------------- 批量更名 · 模板解析 ---------------- */
  const RN_VALID_VARS = ["name", "ext", "EXT", "n", "index", "date", "time", "datetime", "size", "orig"];
  // Windows 非法文件名字符：\ / : * ? " < > |
  const ILLEGAL_FILENAME_CHARS = /[\\\/:*?"<>|]/g;

  /**
   * 清理文件名中的 Windows 非法字符，替换为下划线
   */
  function sanitizeFilename(name) {
    return String(name || "").replace(ILLEGAL_FILENAME_CHARS, "_");
  }

  /**
   * 检查模板中是否包含 Windows 非法文件名字符（不含变量部分）
   */
  function templateHasIllegalChars(template) {
    // 先移除所有 {变量} 占位符，再检查剩余文本中是否有非法字符
    const stripped = String(template || "").replace(/\{[^}]*\}/g, "");
    return ILLEGAL_FILENAME_CHARS.test(stripped);
  }

  function getRnDateTime() {
    const d = new Date();
    const date = d.getFullYear() + "-" + pad0(d.getMonth() + 1, 2) + "-" + pad0(d.getDate(), 2);
    const time = pad0(d.getHours(), 2) + "-" + pad0(d.getMinutes(), 2) + "-" + pad0(d.getSeconds(), 2);
    return { date, time, datetime: date + "_" + time };
  }

  /**
   * 解析重命名模板，替换所有变量
   * @param {string} template 模板字符串
   * @param {object} info 文件信息 { name, ext, size, index, start, pad }
   * @returns {string} 替换后的文件名（不含扩展名）
   */
  function parseTemplate(template, info) {
    let result = String(template || "");
    const dt = getRnDateTime();
    const seqNum = (info.start || 1) + info.index - 1;
    const n = pad0(seqNum, info.pad || 0);

    result = result.replace(/\{name\}/g, info.name || "");
    result = result.replace(/\{ext\}/g, (info.ext || "").toLowerCase());
    result = result.replace(/\{EXT\}/g, (info.ext || "").toUpperCase());
    result = result.replace(/\{n\}/g, n);
    result = result.replace(/\{index\}/g, String(seqNum));
    result = result.replace(/\{date\}/g, dt.date);
    result = result.replace(/\{time\}/g, dt.time);
    result = result.replace(/\{datetime\}/g, dt.datetime);
    result = result.replace(/\{size\}/g, fmtBytes(info.size || 0));
    // 向后兼容：{orig} 等价于 {name}
    result = result.replace(/\{orig\}/g, info.name || "");

    return result;
  }

  /**
   * 找出模板中未识别的变量名
   * @param {string} template
   * @returns {string[]} 无效变量名列表
   */
  function findInvalidVars(template) {
    const invalid = [];
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(template)) !== null) {
      const v = m[1].trim();
      if (RN_VALID_VARS.indexOf(v) < 0 && !/^\d+$/.test(v)) {
        if (invalid.indexOf(v) < 0) invalid.push(v);
      }
    }
    return invalid;
  }

  /**
   * 在客户端生成重命名映射（用于实时预览和发送给服务端）
   * @param {Array} files 文件数组 [{name, size, path}]
   * @param {object} rules 规则 { pattern, start, pad, ext, lower }
   * @returns {Array} [{fromRel, toRel, fromPath, toPath}]
   */
  function generateRnMappings(files, rules) {
    const changes = [];
    const used = new Set();

    // 收集目录中已存在的、不在当前重命名批次内的文件名（用于冲突检测）
    const existingNames = new Set();
    if (state && state.entries) {
      const batchPaths = new Set(files.map((f) => f.path));
      state.entries.forEach((e) => {
        if (!e.dir && !batchPaths.has(e.path)) {
          existingNames.add(e.name.toLowerCase());
        }
      });
    }

    files.forEach((f, i) => {
      const dotIdx = f.name.lastIndexOf(".");
      const baseName = dotIdx > 0 ? f.name.slice(0, dotIdx) : f.name;
      const origExt = dotIdx > 0 ? f.name.slice(dotIdx + 1) : "";

      const info = {
        name: baseName,
        ext: origExt,
        size: f.size || 0,
        index: i + 1,
        start: rules.start || 1,
        pad: rules.pad || 0
      };

      let newBase = parseTemplate(rules.pattern || "文件_{n}", info);

      // 清理 Windows 非法文件名字符
      newBase = sanitizeFilename(newBase);

      // 处理扩展名
      let newExt = rules.ext ? rules.ext.replace(/^\./, "") : origExt;
      if (rules.lower) newExt = newExt.toLowerCase();

      let newName = newExt ? newBase + "." + newExt : newBase;

      // 避免重名（先检查批次内，再检查目录中已存在的文件）
      let finalName = newName;
      let dupCount = 1;

      while (used.has(finalName.toLowerCase()) || existingNames.has(finalName.toLowerCase())) {
        if (newExt) {
          const b = newName.slice(0, -(newExt.length + 1));
          finalName = b + "_" + dupCount + "." + newExt;
        } else {
          finalName = newName + "_" + dupCount;
        }
        dupCount++;
      }
      used.add(finalName.toLowerCase());

      changes.push({
        fromRel: f.name,
        toRel: finalName,
        fromPath: f.path,
        toPath: f.path ? f.path.replace(/[^\\/]+$/, finalName) : ""
      });
    });

    return changes;
  }

  /**
   * 获取当前选中的文件（或目录下所有文件）用于预览
   */
  function getRnTargetFiles() {
    const selected = Array.from(state.selected);
    if (selected.length) {
      return state.entries
        .filter((e) => !e.dir && selected.includes(e.path))
        .map((e) => ({ name: e.name, size: e.size, path: e.path }));
    }
    // 没有选中则取当前目录下所有文件
    return state.entries
      .filter((e) => !e.dir)
      .map((e) => ({ name: e.name, size: e.size, path: e.path }));
  }

  /**
   * 更新实时预览（前 5 个文件 + 变量有效性提示）
   */
  function updateRnLivePreview() {
    const kind = $("#rnKind .active").dataset.v;
    const box = $("#rnLivePreview");
    const warnBox = $("#rnVarWarn");
    if (!box) return;

    if (kind !== "tpl") {
      box.classList.add("hidden");
      if (warnBox) warnBox.classList.add("hidden");
      return;
    }

    const rules = renameRules();
    const template = rules.pattern || "";

    // 无效变量提示 + 非法字符提示
    const invalidVars = findInvalidVars(template);
    const hasIllegal = templateHasIllegalChars(template);
    if (warnBox) {
      const warnings = [];
      if (invalidVars.length) {
        warnings.push("未识别的变量：" + invalidVars.map((v) => `<code>{${esc(v)}}</code>`).join("、") + "（会作为普通文字保留）");
      }
      if (hasIllegal) {
        warnings.push('模板中包含 Windows 非法文件名字符（<code>\\ / : * ? " &lt; &gt; |</code>），已自动替换为下划线');
      }
      if (warnings.length) {
        warnBox.classList.remove("hidden");
        warnBox.innerHTML = warnings.join("<br>");
      } else {
        warnBox.classList.add("hidden");
      }
    }

    const files = getRnTargetFiles();
    if (!files.length) {
      box.classList.remove("hidden");
      box.innerHTML = '<div class="r" style="color:var(--muted)">当前目录没有可预览的文件</div>';
      return;
    }

    const previewFiles = files.slice(0, 5);
    const changes = generateRnMappings(previewFiles, rules);

    let html = changes.map((c) =>
      `<div class="r"><span class="a">${esc(c.fromRel)}</span><span>→</span><span class="b">${esc(c.toRel)}</span></div>`
    ).join("");

    if (files.length > 5) {
      html += `<div class="r" style="color:var(--muted);justify-content:center">… 共 ${files.length} 个文件，点「预览」查看全部</div>`;
    }

    box.classList.remove("hidden");
    box.innerHTML = html;
  }

  function err(msg) { const e = $("#err"); e.textContent = msg || ""; }
  function out(html) { $("#out").innerHTML = html; }

  async function api(route, payload) {
    let r;
    try {
      r = await fetch(SVC + route, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(payload || {}) });
    } catch (e) {
      throw new Error("连不上本机增强服务：请先双击「启动.bat」（或运行 node server/convert-server.js）");
    }
    let j = null;
    try { j = await r.json(); } catch (e) { throw new Error("服务返回异常（HTTP " + r.status + "）"); }
    if (!j || j.ok !== true) throw new Error((j && j.error) || ("操作失败 HTTP " + r.status));
    return j;
  }

  /* ---------------- 位置与浏览 ---------------- */
  async function loadPlaces() {
    try {
      const j = await api("/file/places");
      $("#places").innerHTML = j.places.map((p) => `<button class="ft-chip" data-path="${esc(p.path)}">${esc(p.name)}</button>`).join("");
      $("#trashRoot").textContent = j.trash;
      state.trashRoot = j.trash;
      $("#places").addEventListener("click", (e) => {
        const b = e.target.closest(".ft-chip"); if (!b) return;
        $("#pathInput").value = b.dataset.path;
        browse(b.dataset.path);
      });
      const home = j.places.find((p) => p.name === "下载") || j.places[0];
      if (home) { $("#pathInput").value = home.path; browse(home.path); }
    } catch (e) { err(e.message); }
  }

  /* ---------------- 最近位置（记忆） ---------------- */
  const LS_DIRS = "tbx-recent-dirs";
  function getDirs() { try { return JSON.parse(localStorage.getItem(LS_DIRS) || "[]"); } catch (e) { return []; } }
  function saveDir(dir) {
    if (!dir) return;
    let list = getDirs().filter((d) => d !== dir);
    list.unshift(dir);
    list = list.slice(0, 8);
    try { localStorage.setItem(LS_DIRS, JSON.stringify(list)); } catch (e) {}
    renderDirs();
  }
  function renderDirs() {
    const box = $("#recentDirs");
    if (!box) return;
    const list = getDirs();
    if (!list.length) { box.innerHTML = ""; return; }
    box.innerHTML = '<span class="hint" style="margin:0;font-size:12px">最近位置：</span>' +
      list.map((d) => `<button class="ft-chip" data-dir="${esc(d)}" title="${esc(d)}">${esc(d.length > 28 ? "…" + d.slice(-26) : d)}</button>`).join("") +
      '<button class="ft-chip" id="dirClear">清除</button>';
    box.querySelectorAll("[data-dir]").forEach((b) => (b.onclick = () => browse(b.dataset.dir)));
    const c = $("#dirClear");
    if (c) c.onclick = () => { try { localStorage.removeItem(LS_DIRS); } catch (e) {} renderDirs(); };
  }

  async function browse(dir, keepSel) {
    err("");
    const reqId = ++state.browseReqId;
    try {
      const j = await api("/file/scan", { dir, recursive: false, max: 5000 });
      if (reqId !== state.browseReqId) return;
      state.cwd = j.dir;
      saveDir(j.dir);
      $("#pathInput").value = j.dir;
      if (!keepSel) state.selected.clear();
      // 目录优先、文件在后，各自按名称排序
      const dirs = (j.dirs || []).map((n) => ({ name: n, dir: true }));
      const files = j.files.filter((f) => f.rel.indexOf("/") < 0).map((f) => ({ name: f.name, dir: false, size: f.size, path: f.path }));
      state.entries = dirs.concat(files);
      renderList();
      renderCrumb();
      $("#upBtn").disabled = !parentOf(j.dir) || parentOf(j.dir) === j.dir;
      if (state.mode === "rename") updateRnLivePreview();
    } catch (e) {
      if (reqId !== state.browseReqId) return;
      err(e.message); out('<div class="ft-warn">' + esc(e.message) + "</div>");
    }
  }

  function renderCrumb() {
    const parts = state.cwd.split(/[\\/]/).filter(Boolean);
    let acc = state.cwd.match(/^[A-Za-z]:/) ? state.cwd.slice(0, 2) : "";
    const html = [acc ? `<span class="ft-chip" data-go="${esc(acc + "\\")}">${esc(acc)}</span>` : ""];
    parts.forEach((p, i) => {
      acc = acc + (acc.endsWith("\\") || !acc ? "" : "\\") + p;
      if (i === 0 && /^[A-Za-z]:$/.test(p)) return;
      html.push(`<span class="ft-chip" data-go="${esc(acc)}">${esc(p)}</span>`);
    });
    $("#crumb").innerHTML = html.join('<span style="color:var(--faint)">›</span>');
    $("#crumb").querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => browse(b.dataset.go)));
  }

  function renderList() {
    const box = $("#list");
    if (!state.entries.length) { box.innerHTML = '<div style="padding:22px;text-align:center;color:var(--muted);font-size:13px">这个目录是空的（或没有可显示的文件）</div>'; return; }
    box.innerHTML = state.entries.map((e, i) => {
      const full = e.dir ? joinPath(state.cwd, e.name) : e.path;
      const sel = state.selected.has(full);
      return `<div class="ft-row ${e.dir ? "dir" : ""} ${sel ? "sel" : ""}" data-i="${i}">
        <span class="ico">${e.dir ? "📁" : "📄"}</span>
        <input type="checkbox" ${sel ? "checked" : ""} ${e.dir ? "disabled" : ""} data-check="${i}" style="flex:0 0 auto">
        <span class="nm">${esc(e.name)}</span>
        <span class="sz">${e.dir ? "文件夹" : fmtBytes(e.size)}</span>
      </div>`;
    }).join("");
    box.querySelectorAll(".ft-row").forEach((row) => {
      const i = +row.dataset.i, e = state.entries[i];
      const full = e.dir ? joinPath(state.cwd, e.name) : e.path;
      const cb = row.querySelector("[data-check]");
      cb.onclick = (ev) => { ev.stopPropagation(); toggleSel(full, cb.checked); };
      if (e.dir) row.onclick = () => browse(full);
      updateSelInfo();
    });
  }

  function toggleSel(p, on) {
    if (on) state.selected.add(p); else state.selected.delete(p);
    renderList();
    syncUnzipInput();
    // 如果在更名标签且模板模式，更新实时预览
    if (state.mode === "rename") updateRnLivePreview();
  }
  function updateSelInfo() {
    $("#selInfo").textContent = `已选 ${state.selected.size} 项`;
  }
  function syncUnzipInput() {
    const zips = Array.from(state.selected).filter((p) => /\.(zip|7z)$/i.test(p));
    if (zips.length) { $("#unzipIn").value = zips[0]; $("#unzipOut").value = zips[0].replace(/\.(zip|7z)$/i, "") + "_解压"; }
  }

  /* ---------------- 相似照片 ---------------- */
  async function simScan() {
    err("");
    $("#simResult").innerHTML = '<div class="hint">正在计算图片指纹…图片多时稍慢</div>';
    try {
      const j = await api("/file/similar", { dir: state.cwd, threshold: $("#simTh").value !== "" ? +$("#simTh").value : 8 });
      state.simGroups = j.groups || [];
      let html = `<div class="ft-stats">
        <div class="ft-stat"><div class="k">扫描图片</div><div class="v">${j.scanned}</div></div>
        <div class="ft-stat"><div class="k">相似组</div><div class="v">${j.groupCount}</div></div>
        <div class="ft-stat"><div class="k">多余</div><div class="v">${j.dupCount}</div></div>
        <div class="ft-stat"><div class="k">可释放</div><div class="v">${esc(j.wastedText || "0 B")}</div></div>
      </div>`;
      if (!j.groups || !j.groups.length) html += '<div class="hint" style="margin-top:10px">没发现相似照片。</div>';
      else html += j.groups.map((g, gi) => `
        <div class="ft-group" data-g="${gi}">
          <div class="hd"><span class="tag">组 ${gi + 1}</span><span>共 ${g.count} 张 · 可省 ${esc(g.wastedText)}</span></div>
          <div class="bd">${g.files.map((f, fi) => `
            <label class="ft-file ${fi === 0 ? "keep" : ""}">
              <input type="checkbox" data-g="${gi}" data-f="${fi}" ${fi === 0 ? "" : "checked"}>
              <span class="p">${esc(f.name)}</span><span class="sz">${esc(f.sizeText)}${fi === 0 ? " 保留" : ""}</span>
            </label>`).join("")}</div>
        </div>`).join("");
      $("#simResult").innerHTML = html;
      $("#simActions").style.display = j.groups && j.groups.length ? "flex" : "none";
      $("#simResult").querySelectorAll("input[type=checkbox]").forEach((cb) => {
        cb.onchange = () => { const l = cb.closest(".ft-file"); if (l) l.classList.toggle("keep", !cb.checked); };
      });
    } catch (e) { err(e.message); $("#simResult").innerHTML = '<div class="ft-warn">' + esc(e.message) + "</div>"; }
  }

  function simSelected() {
    const paths = [];
    $("#simResult").querySelectorAll('input[type=checkbox][data-g]').forEach((cb) => {
      if (!cb.checked) return;
      const g = (state.simGroups || [])[+cb.dataset.g];
      if (g && g.files[+cb.dataset.f]) paths.push(g.files[+cb.dataset.f].path);
    });
    return paths;
  }

  async function simDelete() {
    const paths = simSelected();
    if (!paths.length) return err("没有勾选要处理的照片。");
    if (!window.confirm(`将把 ${paths.length} 张相似照片移入回收站（可恢复）。\n\n确定继续吗？`)) return;
    try {
      const j = await api("/file/delete", { paths, mode: "trash" });
      out(`<div class="ft-stats"><div class="ft-stat"><div class="k">已移入回收站</div><div class="v">${j.count}</div></div></div>`);
      simScan();
    } catch (e) { err(e.message); }
  }

  /* ---------------- 磁盘分析 ---------------- */
  async function diskScan() {
    err("");
    $("#diskResult").innerHTML = '<div class="hint">正在统计目录大小…大目录可能较慢</div>';
    try {
      const j = await api("/file/disk", { dir: state.cwd });
      const bar = (pct) => `<div style="height:6px;border-radius:99px;background:var(--surface-3);overflow:hidden"><div style="height:100%;width:${Math.max(1, pct)}%;background:linear-gradient(90deg,var(--accent),var(--accent-2))"></div></div>`;
      let html = `<div class="ft-stats">
        <div class="ft-stat"><div class="k">总占用</div><div class="v">${esc(j.totalText)}</div></div>
        <div class="ft-stat"><div class="k">文件数</div><div class="v">${j.fileCount}</div></div>
        <div class="ft-stat"><div class="k">子项</div><div class="v">${j.children.length}</div></div>
      </div>`;
      html += '<div class="ft-group"><div class="hd"><span class="tag">谁最占地方</span><span>按体积排序（前 20）</span></div><div class="bd">';
      j.children.slice(0, 20).forEach((c) => {
        const pct = j.total ? (c.size / j.total) * 100 : 0;
        html += `<div style="padding:6px 0">
          <div style="display:flex;gap:8px;font-size:12.5px"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.dir ? "📁" : "📄"} ${esc(c.name)}</span><span style="font-family:var(--mono);color:var(--muted)">${esc(c.sizeText)} · ${pct.toFixed(1)}%</span></div>
          ${bar(pct)}</div>`;
      });
      html += "</div></div>";
      html += '<div class="ft-group"><div class="hd"><span class="tag">最占地的大文件（前 30）</span></div><div class="bd">' +
        j.biggest.map((f) => `<div class="ft-file"><span class="p" title="${esc(f.rel)}">${esc(f.rel)}</span><span class="sz">${esc(f.sizeText)}</span></div>`).join("") + "</div></div>";
      html += '<div class="ft-group"><div class="hd"><span class="tag">文件类型分布</span></div><div class="bd">' +
        j.extTop.map((x) => `<div class="ft-file"><span class="p">${esc(x.ext)}</span><span class="sz">${x.files} 个 · ${esc(x.sizeText)}</span></div>`).join("") + "</div></div>";
      $("#diskResult").innerHTML = html;
    } catch (e) { err(e.message); $("#diskResult").innerHTML = '<div class="ft-warn">' + esc(e.message) + "</div>"; }
  }

  /* ---------------- 自动归档 ---------------- */
  async function orgRun(dryRun) {
    err("");
    try {
      const j = await api("/file/organize", { dir: state.cwd, rule: $("#orgRule").value, prefix: $("#orgPrefix").value.trim(), dryRun });
      const rows = Object.keys(j.buckets || {}).map((k) => `<div class="ft-file"><span class="p">${esc(k)}</span><span class="sz">${j.buckets[k]} 个</span></div>`).join("");
      $("#orgResult").innerHTML = `<div class="ft-group"><div class="hd"><span class="tag">${dryRun ? "预览" : "已完成"}</span><span>共 ${j.count} 个文件</span></div><div class="bd">${rows}</div></div>`;
      if (dryRun) {
        $("#orgApply").disabled = !j.count;
      } else {
        $("#orgApply").disabled = true;
        out(`<div class="hint">已归档 ${j.count} 个文件。</div>`);
        browse(state.cwd);
      }
    } catch (e) { err(e.message); $("#orgResult").innerHTML = '<div class="ft-warn">' + esc(e.message) + "</div>"; }
  }

  /* ---------------- 压缩 ---------------- */
  async function doZip() {
    err(""); out('<div class="hint">正在压缩…</div>');
    try {
      const paths = Array.from(state.selected);
      const fmt = $("#zipFmt") ? $("#zipFmt").value : "zip";
      let outPath = $("#zipOut").value.trim();
      if (outPath) {
        outPath = outPath.replace(/\.(zip|7z)$/i, "") + (fmt === "7z" ? ".7z" : ".zip");
      }
      const payload = paths.length
        ? { paths, base: state.cwd, format: fmt, out: outPath || undefined }
        : { paths: [state.cwd], base: parentOf(state.cwd), format: fmt, out: outPath || undefined };
      const j = await api("/file/zip", payload);
      out(`<div class="ft-stats">
        <div class="ft-stat"><div class="k">文件数</div><div class="v">${j.count}</div></div>
        <div class="ft-stat"><div class="k">原始大小</div><div class="v">${esc(j.totalText)}</div></div>
        <div class="ft-stat"><div class="k">压缩后</div><div class="v">${esc(j.zipText)}</div></div>
        <div class="ft-stat"><div class="k">省下</div><div class="v">${j.ratio > 0 ? j.ratio + "%" : "0%"}</div></div>
      </div>
      <div class="hint" style="margin-top:10px">输出：<span class="ft-path">${esc(j.out)}</span></div>`);
      browse(state.cwd, true);
    } catch (e) { err(e.message); out('<div class="ft-warn">' + esc(e.message) + "</div>"); }
  }

  /* ---------------- 解压 ---------------- */
  async function doUnzip() {
    err(""); out('<div class="hint">正在解压…</div>');
    try {
      const j = await api("/file/unzip", { zip: $("#unzipIn").value.trim(), out: $("#unzipOut").value.trim() || undefined });
      out(`<div class="ft-stats">
        <div class="ft-stat"><div class="k">解压文件数</div><div class="v">${j.count}</div></div>
        <div class="ft-stat"><div class="k">总大小</div><div class="v">${esc(j.bytesText)}</div></div>
      </div>
      <div class="hint" style="margin-top:10px">输出目录：<span class="ft-path">${esc(j.out)}</span></div>`);
    } catch (e) { err(e.message); out('<div class="ft-warn">' + esc(e.message) + "</div>"); }
  }

  /* ---------------- 批量更名 ---------------- */
  function renameRules() {
    const kind = $("#rnKind .active").dataset.v;
    const r = { ext: $("#rnExt").value.trim().replace(/^\./, ""), lower: $("#rnLower").checked };
    if (kind === "edit") { r.find = $("#rnFind").value; r.replace = $("#rnRepl").value; r.useRegex = $("#rnRegex").checked; }
    else { r.pattern = $("#rnTpl").value || "文件_{n}"; r.start = $("#rnStart").value !== "" ? +$("#rnStart").value : 1; r.pad = $("#rnPad").value !== "" ? +$("#rnPad").value : 0; }
    return r;
  }

  /**
   * 判断模板是否只使用了服务端原生支持的变量（{n}、{orig}）
   * 如果是，则继续走服务端 rules 模式，保持最大兼容
   */
  function isBasicTemplate(template) {
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(template)) !== null) {
      const v = m[1].trim();
      if (v !== "n" && v !== "orig") return false;
    }
    return true;
  }

  async function doRename(dryRun) {
    err("");
    try {
      const kind = $("#rnKind .active").dataset.v;
      const selected = Array.from(state.selected);
      const rules = renameRules();

      // 模板模式：在客户端计算完整映射后发送给服务端
      // 这样所有新变量（date、time、size、name、ext 等）都能生效
      if (kind === "tpl") {
        const files = getRnTargetFiles();
        const changes = generateRnMappings(files, rules);

        if (dryRun) {
          // 客户端直接预览，无需走服务端
          $("#rnPreviewBox").style.display = "";
          $("#rnPreviewBox").innerHTML = changes.length
            ? changes.map((c) => `<div class="r"><span class="a">${esc(c.fromRel)}</span><span>→</span><span class="b">${esc(c.toRel)}</span></div>`).join("")
            : '<div class="r" style="color:var(--muted)">所选规则不产生任何改动</div>';
          $("#rnApply").disabled = !changes.length;
          out(`<div class="hint">预览：${changes.length} 个文件会被更名。重名文件（含目录中已存在的文件）会自动添加 _1、_2 后缀。确认无误后点「执行更名」。</div>`);
          return;
        }

        // 执行更名：发送完整映射表给服务端
        const mappings = changes.map((c) => ({ from: c.fromRel, to: c.toRel }));
        const j = await api("/file/rename", {
          dir: state.cwd,
          selected,
          rules,
          mappings,
          dryRun: false
        });

        out(`<div class="ft-stats"><div class="ft-stat"><div class="k">已更名</div><div class="v">${j.count}</div></div></div>`);
        $("#rnPreviewBox").style.display = "none";
        $("#rnApply").disabled = true;
        browse(state.cwd);
        return;
      }

      // 查找替换模式：继续走服务端原生 rules
      const j = await api("/file/rename", { dir: state.cwd, selected, rules, dryRun });
      if (dryRun) {
        $("#rnPreviewBox").style.display = "";
        $("#rnPreviewBox").innerHTML = j.count
          ? j.changes.map((c) => `<div class="r"><span class="a">${esc(c.fromRel)}</span><span>→</span><span class="b">${esc(c.toRel)}</span></div>`).join("")
          : '<div class="r" style="color:var(--muted)">所选规则不产生任何改动</div>';
        $("#rnApply").disabled = !j.count;
        out(`<div class="hint">预览：${j.count} 个文件会被更名（共检查 ${j.total} 个）。重名文件会由服务端自动添加 _1、_2 后缀。确认无误后点「执行更名」。</div>`);
      } else {
        out(`<div class="ft-stats"><div class="ft-stat"><div class="k">已更名</div><div class="v">${j.count}</div></div></div>`);
        $("#rnPreviewBox").style.display = "none";
        $("#rnApply").disabled = true;
        browse(state.cwd);
      }
    } catch (e) { err(e.message); out('<div class="ft-warn">' + esc(e.message) + "</div>"); }
  }

  /* ---------------- 查重 ---------------- */
  async function doDupScan() {
    err(""); $("#dpResult").innerHTML = '<div class="hint">正在扫描并计算哈希，目录大时可能需要一会儿…</div>';
    try {
      const j = await api("/file/dupes", { dir: state.cwd, recursive: $("#recurse").checked, minSize: $("#dpMin").value !== "" ? +$("#dpMin").value : 1 });
      state.dupGroups = j.groups;
      let html = `<div class="ft-stats">
        <div class="ft-stat"><div class="k">扫描文件</div><div class="v">${j.scanned}</div></div>
        <div class="ft-stat"><div class="k">重复组</div><div class="v">${j.groupCount}</div></div>
        <div class="ft-stat"><div class="k">多余文件</div><div class="v">${j.dupCount}</div></div>
        <div class="ft-stat"><div class="k">可释放</div><div class="v">${esc(j.wastedText)}</div></div>
      </div>`;
      if (j.skipped && j.skipped > 0) {
        html += '<div class="hint" style="margin-top:8px;color:var(--warn)">注意：有 ' + j.skipped + ' 个文件读取失败已跳过' + (j.skipReason ? '（' + esc(j.skipReason) + '）' : '') + '。</div>';
      }
      if (j.warnings && j.warnings.length) {
        html += '<div class="hint" style="margin-top:8px;color:var(--warn)">' + j.warnings.map((w) => esc(w)).join("<br>") + '</div>';
      }
      if (!j.groups.length) {
        html += '<div class="hint" style="margin-top:10px">没发现重复文件，很干净 🎉</div>';
      } else {
        html += j.groups.map((g, gi) => `
          <div class="ft-group" data-g="${gi}">
            <div class="hd"><span class="tag">组 ${gi + 1}</span><span>每个 ${esc(g.sizeText)} · 共 ${g.count} 份 · 可省 ${esc(g.wastedText)}</span>
              <span style="flex:1"></span><button class="ft-chip" data-selg="${gi}">勾选除第一个</button></div>
            <div class="bd">${g.files.map((f, fi) => `
              <label class="ft-file ${fi === 0 ? "keep" : ""}">
                <input type="checkbox" data-g="${gi}" data-f="${fi}" ${fi === 0 ? "" : "checked"}>
                <span class="p">${esc(f.rel)}</span>
                <span class="sz">${fi === 0 ? "保留" : ""}</span>
              </label>`).join("")}</div>
          </div>`).join("");
      }
      $("#dpResult").innerHTML = html;
      $("#dpActions").style.display = j.groups.length ? "flex" : "none";
      bindDupEvents();
    } catch (e) { err(e.message); $("#dpResult").innerHTML = '<div class="ft-warn">' + esc(e.message) + "</div>"; }
  }

  function bindDupEvents() {
    if (state.dupEventsBound) return;
    state.dupEventsBound = true;
    const box = $("#dpResult");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-selg]");
      if (!b) return;
      const gi = +b.dataset.selg;
      box.querySelectorAll(`input[data-g="${gi}"]`).forEach((cb) => {
        cb.checked = +cb.dataset.f !== 0;
        const l = cb.closest(".ft-file");
        if (l) l.classList.toggle("keep", !cb.checked);
      });
    });
    box.addEventListener("change", (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (!cb || cb.dataset.g === undefined) return;
      const l = cb.closest(".ft-file");
      if (l) l.classList.toggle("keep", !cb.checked);
    });
  }

  function dupSelectedPaths() {
    const paths = [];
    $("#dpResult").querySelectorAll('input[type="checkbox"][data-g]').forEach((cb) => {
      if (!cb.checked) return;
      const g = state.dupGroups[+cb.dataset.g];
      if (g && g.files[+cb.dataset.f]) paths.push(g.files[+cb.dataset.f].path);
    });
    return paths;
  }

  async function doDupDelete(mode) {
    const paths = dupSelectedPaths();
    if (!paths.length) return err("没有勾选要处理的文件。");
    const total = paths.reduce((a, p) => { const g = state.dupGroups.find((x) => x.files.some((f) => f.path === p)); const f = g && g.files.find((x) => x.path === p); return a + (f ? f.size : 0); }, 0);
    const msg = mode === "purge"
      ? `⚠ 将【永久删除】${paths.length} 个文件（约 ${fmtBytes(total)}），无法恢复！\n\n确定继续吗？`
      : `将把 ${paths.length} 个文件（约 ${fmtBytes(total)}）移入回收站，可以再恢复。\n\n确定继续吗？`;
    if (!window.confirm(msg)) return;
    err("");
    try {
      const j = await api("/file/delete", { paths, mode });
      out(`<div class="ft-stats">
        <div class="ft-stat"><div class="k">${mode === "purge" ? "已永久删除" : "已移入回收站"}</div><div class="v">${j.count}</div></div>
        <div class="ft-stat"><div class="k">处理大小</div><div class="v">${esc(j.freed || "")}</div></div>
      </div>` + (j.trashDir ? `<div class="hint" style="margin-top:10px">回收站位置：<span class="ft-path">${esc(j.trashDir)}</span>（可在「回收站」标签里恢复）</div>` : ""));
      doDupScan();
    } catch (e) { err(e.message); out('<div class="ft-warn">' + esc(e.message) + "</div>"); }
  }

  /* ---------------- 回收站 ---------------- */
  async function loadTrash() {
    err("");
    try {
      const j = await api("/file/trash", { action: "list" });
      const list = j.entries || [];
      $("#trBox").innerHTML = list.length
        ? list.map((e) => `
          <div class="ft-group">
            <div class="hd"><span class="tag">${e.count} 个文件</span><span>${new Date(e.time).toLocaleString("zh-CN")}</span>
              <span style="flex:1"></span>
              <button class="ft-chip" data-restore="${esc(e.id)}">恢复</button>
              <button class="ft-chip" data-purgelot="${esc(e.id)}">彻底删除</button></div>
            <div class="bd">${(e.items || []).slice(0, 40).map((it) => `<div class="ft-file"><span class="p">${esc(it.original)}</span><span class="sz">${fmtBytes(it.size)}</span></div>`).join("")}${(e.items || []).length > 40 ? '<div class="hint">…仅显示前 40 个</div>' : ""}</div>
          </div>`).join("")
        : '<div class="empty" style="padding:16px;text-align:center;color:var(--muted);font-size:13px">回收站是空的</div>';
      $("#trBox").querySelectorAll("[data-restore]").forEach((b) => (b.onclick = async () => {
        try { const r = await api("/file/trash", { action: "restore", id: b.dataset.restore }); out(`<div class="hint">已恢复 ${r.restored} 个文件${r.skipped ? "，跳过 " + r.skipped + " 个" : ""}。</div>`); loadTrash(); } catch (e) { err(e.message); }
      }));
      $("#trBox").querySelectorAll("[data-purgelot]").forEach((b) => (b.onclick = async () => {
        if (!window.confirm("彻底删除这批文件？此操作无法恢复。")) return;
        try { await api("/file/trash", { action: "purge", id: b.dataset.purgelot }); out('<div class="hint">已彻底删除。</div>'); loadTrash(); } catch (e) { err(e.message); }
      }));
    } catch (e) { err(e.message); }
  }

  /* ---------------- 初始化 ---------------- */
  function selectTab(mode) {
    state.mode = mode;
    $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $$(".mode-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.mode !== mode));
    if (mode === "trash") loadTrash();
    if (mode === "rename") updateRnLivePreview();
  }

  function init() {
    $("#goBtn").onclick = () => { const v = $("#pathInput").value.trim(); if (v) browse(v); };
    $("#pathInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#goBtn").click(); });
    $("#upBtn").onclick = () => browse(parentOf(state.cwd));
    $("#reloadBtn").onclick = () => browse(state.cwd, true);
    $("#selAll").onclick = () => { state.entries.filter((e) => !e.dir).forEach((e) => state.selected.add(e.path)); renderList(); syncUnzipInput(); if (state.mode === "rename") updateRnLivePreview(); };
    $("#selNone").onclick = () => { state.selected.clear(); renderList(); if (state.mode === "rename") updateRnLivePreview(); };

    $$("#tabs .tab").forEach((b) => (b.onclick = () => selectTab(b.dataset.mode)));
    $("#zipBtn").onclick = doZip;
    $("#unzipBtn").onclick = doUnzip;
    $("#rnPreview").onclick = () => doRename(true);
    $("#rnApply").onclick = () => { if (window.confirm("确定执行更名吗？")) doRename(false); };
    $("#dpScan").onclick = doDupScan;
    $("#dpKeepFirst").onclick = () => { $("#dpResult").querySelectorAll("[data-selg]").forEach((b) => b.click()); };
    $("#dpTrash").onclick = () => doDupDelete("trash");
    $("#dpPurge").onclick = () => doDupDelete("purge");
    $("#trList").onclick = loadTrash;
    if ($("#simScan")) $("#simScan").onclick = simScan;
    if ($("#simTrash")) $("#simTrash").onclick = simDelete;
    if ($("#simKeepFirst")) $("#simKeepFirst").onclick = () => {
      $("#simResult").querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = +cb.dataset.f !== 0; const l = cb.closest(".ft-file"); if (l) l.classList.toggle("keep", !cb.checked); });
    };
    if ($("#diskScan")) $("#diskScan").onclick = diskScan;
    if ($("#orgPreview")) $("#orgPreview").onclick = () => orgRun(true);
    if ($("#orgApply")) $("#orgApply").onclick = () => { if (window.confirm("确定按当前规则归档文件？同名文件不会覆盖。")) orgRun(false); };
    if ($("#zipFmt")) $("#zipFmt").onchange = () => {
      const v = $("#zipFmt").value;
      const o = $("#zipOut");
      if (o && o.value) o.value = o.value.replace(/\.(zip|7z)$/i, "") + (v === "7z" ? ".7z" : ".zip");
    };
    $("#rnKind").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("#rnKind button").forEach((x) => x.classList.toggle("active", x === b));
      $("#rnEditRow").classList.toggle("hidden", b.dataset.v !== "edit");
      $("#rnTplRow").classList.toggle("hidden", b.dataset.v !== "tpl");
      $("#rnTplOptsRow").classList.toggle("hidden", b.dataset.v !== "tpl");
      $("#rnVarHelp").classList.toggle("hidden", b.dataset.v !== "tpl");
      updateRnLivePreview();
    });

    // 模板实时预览 & 变量快速插入
    const tplInput = $("#rnTpl");
    if (tplInput) {
      ["input", "change"].forEach((ev) => tplInput.addEventListener(ev, updateRnLivePreview));
    }
    ["rnStart", "rnPad", "rnExt", "rnLower"].forEach((id) => {
      const el = $("#" + id);
      if (!el) return;
      el.addEventListener("input", updateRnLivePreview);
      el.addEventListener("change", updateRnLivePreview);
    });

    // 变量快速插入（快捷标签 + 变量说明面板中的 code 标签）
    function insertVarAtCursor(variable) {
      const input = $("#rnTpl");
      if (!input) return;
      const start = input.selectionStart || input.value.length;
      const end = input.selectionEnd || input.value.length;
      input.value = input.value.slice(0, start) + variable + input.value.slice(end);
      input.focus();
      input.selectionStart = input.selectionEnd = start + variable.length;
      updateRnLivePreview();
    }
    document.querySelectorAll("[data-insert]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        insertVarAtCursor(el.dataset.insert);
      });
    });

    // 变量说明展开/收起
    const varHelpHd = $("#rnVarHelpHd");
    if (varHelpHd) {
      varHelpHd.addEventListener("click", () => {
        const bd = varHelpHd.nextElementSibling;
        varHelpHd.classList.toggle("open");
        bd.classList.toggle("open");
      });
    }

    loadPlaces();
    renderDirs();
    selectTab("zip");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();