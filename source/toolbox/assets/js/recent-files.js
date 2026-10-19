/* ============================================================
   免费工具箱 · 最近文件记忆（IndexedDB + File System Access）
   ------------------------------------------------------------
   有 File System Access API 时：保存文件句柄，刷新后仍能直接
   重新打开同一个文件；没有该 API 时：只记名字/大小，点击后
   提示重新选择。
   同时提供「播放位置记忆」。
   ============================================================ */
(function () {
  "use strict";

  const DB_NAME = "tbx-files";
  const DB_VER = 1;
  const STORE = "entries";
  const LS_POS = "tbx-pos:";
  const MAX_PER_LIST = 60;

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const os = db.createObjectStore(STORE, { keyPath: "id" });
            os.createIndex("list", "list", { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbPromise;
  }

  function tx(mode) {
    return openDB().then((db) => (db ? db.transaction(STORE, mode).objectStore(STORE) : null));
  }

  function makeId(list, name, size) { return list + "|" + name + "|" + size; }

  async function add(list, file, handle) {
    const st = await tx("readwrite");
    if (!st) return null;
    const entry = {
      id: makeId(list, file.name, file.size),
      list,
      name: file.name,
      size: file.size,
      type: file.type || "",
      last: Date.now(),
      handle: handle || null
    };
    return new Promise((resolve) => {
      const r = st.put(entry);
      r.onsuccess = () => { trim(list); resolve(entry); };
      r.onerror = () => resolve(null);
    });
  }

  async function listAll(list) {
    const st = await tx("readonly");
    if (!st) return [];
    return new Promise((resolve) => {
      const out = [];
      const r = st.openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (!c) { resolve(out.sort((a, b) => b.last - a.last)); return; }
        if (c.value && c.value.list === list) out.push(c.value);
        c.continue();
      };
      r.onerror = () => resolve(out);
    });
  }

  async function trim(list) {
    const all = await listAll(list);
    if (all.length <= MAX_PER_LIST) return;
    const drop = all.slice(MAX_PER_LIST);
    const st = await tx("readwrite");
    if (!st) return;
    drop.forEach((e) => st.delete(e.id));
  }

  async function remove(list, id) {
    const st = await tx("readwrite");
    if (!st) return;
    st.delete(id);
  }

  async function clear(list) {
    const all = await listAll(list);
    const st = await tx("readwrite");
    if (!st) return;
    all.forEach((e) => st.delete(e.id));
  }

  /* ---------------- 选择文件（优先系统选择器，能拿到句柄） ---------------- */
  async function pick(opts) {
    opts = opts || {};
    const multiple = !!opts.multiple;
    if (window.showOpenFilePicker) {
      try {
        const kinds = [];
        if (opts.accept) {
          const exts = String(opts.accept).split(",").map((s) => s.trim()).filter((s) => s.startsWith("."));
          const mimes = String(opts.accept).split(",").map((s) => s.trim()).filter((s) => s.includes("/"));
          if (exts.length || mimes.length) {
            kinds.push({ description: opts.desc || "媒体文件", accept: Object.assign({}, mimes.length ? { [mimes[0].split("/")[0] + "/*"]: exts } : {}, exts.length ? { "application/octet-stream": exts } : {}) });
          }
        }
        const handles = await window.showOpenFilePicker(Object.assign({ multiple, excludeAcceptAllOption: false }, kinds.length ? { types: kinds } : {}));
        const out = [];
        for (const h of handles) {
          const f = await h.getFile();
          out.push({ file: f, handle: h });
        }
        return out;
      } catch (e) {
        if (e && e.name === "AbortError") return [];
        /* 其它错误退回 input */
      }
    }
    return await pickViaInput(opts);
  }

  function pickViaInput(opts) {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      if (opts.multiple) inp.multiple = true;
      if (opts.accept) inp.accept = opts.accept;
      inp.style.display = "none";
      document.body.appendChild(inp);
      let settled = false;
      const cleanup = () => { if (document.body.contains(inp)) inp.remove(); };
      inp.addEventListener("change", () => {
        if (settled) return;
        settled = true;
        const out = Array.from(inp.files || []).map((f) => ({ file: f, handle: null }));
        cleanup();
        resolve(out);
      }, { once: true });
      // 监听窗口焦点恢复：用户取消选择对话框时，change 事件不会触发，
      // 需要通过 focus 事件检测对话框关闭并兜底 resolve。
      const onFocus = () => {
        // 延迟一小段时间，确保 change 事件先触发（如果用户选择了文件）
        setTimeout(() => {
          if (settled) return;
          settled = true;
          window.removeEventListener("focus", onFocus);
          cleanup();
          resolve([]);
        }, 300);
      };
      window.addEventListener("focus", onFocus);
      inp.click();
    });
  }

  /* ---------------- 从记忆里重新打开 ---------------- */
  async function reopen(entry, opts) {
    opts = opts || {};
    if (entry && entry.handle) {
      try {
        let perm = "granted";
        if (entry.handle.queryPermission) perm = await entry.handle.queryPermission({ mode: "read" });
        if (perm !== "granted" && entry.handle.requestPermission) perm = await entry.handle.requestPermission({ mode: "read" });
        if (perm === "granted") {
          const f = await entry.handle.getFile();
          return { file: f, handle: entry.handle };
        }
      } catch (e) {}
    }
    if (opts.allowPick) {
      const r = await pick(opts);
      return r.length ? r[0] : null;
    }
    return null;
  }

  const canReopen = () => !!window.showOpenFilePicker;

  /* ---------------- 播放位置记忆 ---------------- */
  function savePos(key, sec) { try { localStorage.setItem(LS_POS + key, String(Math.max(0, Math.floor(sec)))); } catch (e) {} }
  function getPos(key) { try { return parseFloat(localStorage.getItem(LS_POS + key) || "0") || 0; } catch (e) { return 0; } }
  function clearPos(key) { try { localStorage.removeItem(LS_POS + key); } catch (e) {} }
  const posKey = (name, size) => (name || "x") + "::" + (size || 0);

  /* ---------------- 渲染「最近打开」列表 ---------------- */
  function fmtBytes(n) {
    if (!n) return "0 B";
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    if (n < 1073741824) return (n / 1048576).toFixed(2) + " MB";
    return (n / 1073741824).toFixed(2) + " GB";
  }
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  async function renderInto(el, listKey, handlers) {
    if (!el) return;
    handlers = handlers || {};
    const items = await listAll(listKey);
    if (!items.length) {
      el.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12.5px">还没有记录。打开过的文件会自动记在这里。</div>';
      return;
    }
    el.innerHTML = items.map((e, i) => `
      <div class="tbx-recent-row ${e.handle ? "" : "no-handle"}" data-i="${i}">
        <span class="ico">${e.handle ? "🔗" : "📄"}</span>
        <span class="nm" title="${esc(e.name)}">${esc(e.name)}</span>
        <span class="sz">${fmtBytes(e.size)}</span>
        <span class="tm">${new Date(e.last).toLocaleDateString("zh-CN")}</span>
        <button class="tbx-recent-x" data-del="${i}" title="从列表移除">✕</button>
      </div>`).join("");
    el.querySelectorAll(".tbx-recent-row").forEach((row) => {
      const e = items[+row.dataset.i];
      row.addEventListener("click", async (ev) => {
        if (ev.target.closest("[data-del]")) return;
        const r = handlers.onOpen ? await handlers.onOpen(e) : await reopen(e, { allowPick: true });
        if (r && handlers.onFile) handlers.onFile(r.file, e, r.handle);
        else if (!r) handlers.onMiss && handlers.onMiss(e);
      });
      const del = row.querySelector("[data-del]");
      if (del) del.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await remove(listKey, e.id);
        renderInto(el, listKey, handlers);
      });
    });
  }

  window.TBX_recent = {
    add, list: listAll, remove, clear, pick, reopen, canReopen,
    savePos, getPos, clearPos, posKey, renderInto, fmtBytes
  };

  /* ---------------- 自动接入 ----------------
     页面里放一个容器即可：
       <div class="tbx-recent-list" id="recentList" data-recent-key="image"></div>
     可选按钮：<button data-recent-pick="image/*" data-recent-key="image">选择文件（记住）</button>
     页面回调：window.TBX_onRecentFile(file, entry, handle) / TBX_onRecentFiles(files, handles)
  ---------------------------------------------------------- */
  async function autoWire() {
    const key = (el) => el.dataset.recentKey || "default";
    const container = document.getElementById("recentList");
    const pickers = Array.from(document.querySelectorAll("[data-recent-pick]"));

    const render = async (el) => {
      await renderInto(el, key(el), {
        onFile: (file, entry, handle) => {
          if (window.TBX_onRecentFile) window.TBX_onRecentFile(file, entry, handle);
        },
        onMiss: () => {
          if (window.TBX_onFileMiss) window.TBX_onFileMiss();
          else alert("这个文件当时没有保存到授权，请点「选择文件」再指定一次。");
        }
      });
    };

    if (container) await render(container);
    const badge = document.getElementById("recentBadge");
    if (badge) badge.textContent = canReopen() ? "可直接重新打开" : "仅记录文件名";

    pickers.forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const k = key(btn);
        const picked = await pick({ multiple: btn.dataset.recentPickMultiple === "1", accept: btn.dataset.recentPick || "" });
        if (!picked.length) return;
        for (const p of picked) await add(k, p.file, p.handle);
        if (container && key(container) === k) await render(container);
        if (window.TBX_onRecentFiles) window.TBX_onRecentFiles(picked.map((p) => p.file), picked.map((p) => p.handle));
        else if (picked[0] && window.TBX_onRecentFile) window.TBX_onRecentFile(picked[0].file, null, picked[0].handle);
      });
    });

    // 暴露刷新接口（页面导入文件后可调用）
    window.TBX_refreshRecent = async () => { if (container) await render(container); };
    window.TBX_rememberFile = async (k, file, handle) => {
      await add(k, file, handle);
      if (container && (!k || key(container) === k)) await render(container);
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoWire);
  else autoWire();
})();
