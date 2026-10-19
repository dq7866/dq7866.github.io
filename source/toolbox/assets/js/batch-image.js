/* 批量图片工作流 · 纯前端实现
   流水线式图片处理：改尺寸 → 压缩 → 格式转换 → 加水印 → 重命名
   所有处理均在浏览器本地完成（Canvas），不上传任何数据。 */
(function () {
  "use strict";

  const he = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ============ 状态 ============ */
  const state = {
    files: [],         // 原始图片文件列表
    pipeline: [],      // 处理步骤流水线
    results: [],       // 处理结果
    activeImgId: null, // 当前预览的图片 ID
    previewMode: "compare",
    processing: false,
  };

  /* ============ 步骤配置 ============ */
  const STEP_CONFIG = {
    resize: {
      name: "改尺寸",
      icon: "📐",
      defaultParams: {
        mode: "percent",   // percent | custom
        percent: 80,
        width: 1080,
        height: 1080,
        lockRatio: true,
      },
    },
    compress: {
      name: "压缩",
      icon: "🗜️",
      defaultParams: {
        quality: 75,
        format: "auto", // auto | image/jpeg | image/webp | image/png
      },
    },
    convert: {
      name: "格式转换",
      icon: "🔄",
      defaultParams: {
        format: "image/webp",
        quality: 90,
      },
    },
    watermark: {
      name: "加水印",
      icon: "💧",
      defaultParams: {
        text: "© 免费工具箱",
        position: "br", // tl | tr | bl | br | center
        size: 3,        // 百分比 (1-12)
        opacity: 55,    // 百分比
        color: "#ffffff",
      },
    },
    rename: {
      name: "重命名",
      icon: "✏️",
      defaultParams: {
        prefix: "",
        suffix: "",
        numbering: true,
        startNum: 1,
        padLength: 2,
      },
    },
  };

  /* ============ 工具函数 ============ */
  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  }

  function baseName(name) {
    return String(name).replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60) || "image";
  }

  function extFor(type) {
    if (type === "image/png") return "png";
    if (type === "image/webp") return "webp";
    if (type === "image/gif") return "gif";
    return "jpg";
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function showToast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2000);
  }

  function loadImageFromBlob(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => res({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("无法读取该图片")); };
      img.src = url;
    });
  }

  function newCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((res, rej) => {
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("导出失败：当前浏览器不支持 " + type))),
        type,
        quality
      );
    });
  }

  function needsFill(type) {
    return type === "image/jpeg";
  }

  /* ============ 文件上传 ============ */
  function initUpload() {
    const dropZone = $("#dropZone");
    const fileInput = $("#fileInput");

    dropZone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
      addFiles(e.target.files);
      fileInput.value = "";
    });

    // 拖放
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      addFiles(files);
    });

    // 粘贴
    document.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imgs.push(f);
        }
      }
      if (imgs.length) addFiles(imgs);
    });

    $("#clearAllBtn").addEventListener("click", clearAllFiles);
  }

  async function addFiles(fileList) {
    const arr = Array.from(fileList || []).filter((f) => f && f.type.startsWith("image/"));
    if (!arr.length) return;

    for (const file of arr) {
      try {
        const { img, url } = await loadImageFromBlob(file);
        state.files.push({
          id: uid(),
          file,
          name: file.name || "image.png",
          type: file.type || "image/png",
          size: file.size,
          img,
          url,
          w: img.naturalWidth,
          h: img.naturalHeight,
        });
      } catch (e) {
      }
    }

    if (!state.activeImgId && state.files.length) {
      state.activeImgId = state.files[0].id;
    }

    renderImageList();
    updateStats();
    updateProcessBtn();

    if (state.pipeline.length) {
      updatePreview();
    }
  }

  function removeFile(id) {
    const i = state.files.findIndex((f) => f.id === id);
    if (i < 0) return;
    URL.revokeObjectURL(state.files[i].url);
    state.files.splice(i, 1);

    if (state.activeImgId === id) {
      state.activeImgId = state.files[0]?.id || null;
    }

    renderImageList();
    updateStats();
    updateProcessBtn();

    if (state.pipeline.length && state.activeImgId) {
      updatePreview();
    } else {
      hidePreview();
    }
  }

  function clearAllFiles() {
    state.files.forEach((f) => URL.revokeObjectURL(f.url));
    state.files = [];
    state.activeImgId = null;
    renderImageList();
    updateStats();
    updateProcessBtn();
    hidePreview();
    clearResults();
  }

  function renderImageList() {
    const list = $("#imageList");
    const stats = $("#batchStats");

    if (!state.files.length) {
      list.style.display = "none";
      stats.style.display = "none";
      return;
    }

    list.style.display = "grid";
    stats.style.display = "flex";

    list.innerHTML = state.files
      .map((f) => `
      <div class="image-thumb ${f.id === state.activeImgId ? "active" : ""}" data-id="${f.id}" title="${he(f.name)}\n${f.w}×${f.h} · ${fmtBytes(f.size)}">
        <img src="${f.url}" alt="">
        <button class="x" data-del="${f.id}" title="移除">×</button>
        <span class="size">${f.w}×${f.h}</span>
      </div>`)
      .join("");

    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeFile(btn.dataset.del);
      });
    });
    list.querySelectorAll(".image-thumb").forEach((el) => {
      el.addEventListener("click", () => {
        state.activeImgId = el.dataset.id;
        renderImageList();
        if (state.pipeline.length) updatePreview();
      });
    });
  }

  function updateStats() {
    $("#imgCount").textContent = state.files.length;
    const total = state.files.reduce((s, f) => s + f.size, 0);
    $("#totalSize").textContent = fmtBytes(total);
  }

  function updateProcessBtn() {
    const btn = $("#processBtn");
    btn.disabled = state.files.length === 0 || state.pipeline.length === 0 || state.processing;
  }

  /* ============ 流水线管理 ============ */
  function initPipeline() {
    $$("#addStepBtns .add-step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        addStep(btn.dataset.step);
      });
    });
  }

  function addStep(type) {
    const cfg = STEP_CONFIG[type];
    if (!cfg) return;

    // 检查是否已存在（重命名只能加一次）
    if (type === "rename" && state.pipeline.some((s) => s.type === "rename")) {
      showToast("重命名步骤只能添加一个");
      return;
    }

    const step = {
      id: uid(),
      type,
      params: JSON.parse(JSON.stringify(cfg.defaultParams)),
    };
    state.pipeline.push(step);
    renderPipeline();
    updateAddStepButtons();
    updateProcessBtn();

    if (state.files.length) {
      updatePreview();
    }
  }

  function removeStep(id) {
    const i = state.pipeline.findIndex((s) => s.id === id);
    if (i < 0) return;
    state.pipeline.splice(i, 1);
    renderPipeline();
    updateAddStepButtons();
    updateProcessBtn();

    if (state.files.length && state.pipeline.length) {
      updatePreview();
    } else {
      hidePreview();
    }
  }

  function moveStep(id, dir) {
    const i = state.pipeline.findIndex((s) => s.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= state.pipeline.length) return;
    const tmp = state.pipeline[i];
    state.pipeline[i] = state.pipeline[j];
    state.pipeline[j] = tmp;
    renderPipeline();

    if (state.files.length) updatePreview();
  }

  function updateAddStepButtons() {
    $$("#addStepBtns .add-step-btn").forEach((btn) => {
      const type = btn.dataset.step;
      // 重命名只能加一次
      if (type === "rename") {
        btn.disabled = state.pipeline.some((s) => s.type === "rename");
      } else {
        btn.disabled = false;
      }
    });
  }

  function renderPipeline() {
    const container = $("#pipelineSteps");
    const empty = $("#emptyPipeline");

    if (!state.pipeline.length) {
      empty.style.display = "block";
      // 清空其他内容
      $$(".pipeline-step", container).forEach((el) => el.remove());
      return;
    }

    empty.style.display = "none";

    container.innerHTML = state.pipeline
      .map((step, idx) => {
        const cfg = STEP_CONFIG[step.type];
        return `
        <div class="pipeline-step" data-id="${step.id}">
          <div class="step-header">
            <span class="step-num">${idx + 1}</span>
            <span class="step-icon">${cfg.icon}</span>
            <span class="step-title">${cfg.name}</span>
            <div class="step-actions">
              <button title="上移" data-move-up="${step.id}" ${idx === 0 ? "disabled style=opacity:.3;cursor:not-allowed" : ""}>↑</button>
              <button title="下移" data-move-down="${step.id}" ${idx === state.pipeline.length - 1 ? "disabled style=opacity:.3;cursor:not-allowed" : ""}>↓</button>
              <button class="del" title="删除" data-remove="${step.id}">✕</button>
            </div>
          </div>
          <div class="step-body">
            ${renderStepBody(step)}
          </div>
        </div>`;
      })
      .join("");

    // 绑定事件
    container.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => removeStep(btn.dataset.remove));
    });
    container.querySelectorAll("[data-move-up]").forEach((btn) => {
      btn.addEventListener("click", () => moveStep(btn.dataset.moveUp, -1));
    });
    container.querySelectorAll("[data-move-down]").forEach((btn) => {
      btn.addEventListener("click", () => moveStep(btn.dataset.moveDown, 1));
    });

    // 绑定参数变化事件
    bindStepParamEvents();
  }

  function renderStepBody(step) {
    const p = step.params;
    switch (step.type) {
      case "resize":
        return `
        <div class="step-fields">
          <div class="step-field">
            <label>方式</label>
            <select data-param="mode">
              <option value="percent" ${p.mode === "percent" ? "selected" : ""}>按比例缩放</option>
              <option value="custom" ${p.mode === "custom" ? "selected" : ""}>自定义尺寸</option>
            </select>
          </div>
          ${p.mode === "percent" ? `
          <div class="step-field">
            <label>比例</label>
            <input type="range" data-param="percent" min="10" max="200" value="${p.percent}">
            <span class="val-badge">${p.percent}%</span>
          </div>
          ` : `
          <div class="step-field">
            <label>宽度</label>
            <input type="number" data-param="width" min="1" max="10000" value="${p.width}">
            <span class="val-badge">px</span>
          </div>
          <div class="step-field">
            <label>高度</label>
            <input type="number" data-param="height" min="1" max="10000" value="${p.height}">
            <span class="val-badge">px</span>
          </div>
          <div class="step-field">
            <label></label>
            <label style="font-size:12px;color:var(--text-2);cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:500">
              <input type="checkbox" data-param="lockRatio" ${p.lockRatio ? "checked" : ""} style="accent-color:var(--accent)">
              锁定宽高比
            </label>
          </div>
          `}
        </div>`;

      case "compress":
        return `
        <div class="step-fields">
          <div class="step-field">
            <label>质量</label>
            <input type="range" data-param="quality" min="10" max="100" value="${p.quality}">
            <span class="val-badge">${p.quality}%</span>
          </div>
          <div class="step-field">
            <label>格式</label>
            <select data-param="format">
              <option value="auto" ${p.format === "auto" ? "selected" : ""}>保持原格式</option>
              <option value="image/jpeg" ${p.format === "image/jpeg" ? "selected" : ""}>JPEG</option>
              <option value="image/webp" ${p.format === "image/webp" ? "selected" : ""}>WebP</option>
              <option value="image/png" ${p.format === "image/png" ? "selected" : ""}>PNG（无损）</option>
            </select>
          </div>
        </div>`;

      case "convert":
        return `
        <div class="step-fields">
          <div class="step-field">
            <label>转换为</label>
            <select data-param="format">
              <option value="image/jpeg" ${p.format === "image/jpeg" ? "selected" : ""}>JPEG</option>
              <option value="image/png" ${p.format === "image/png" ? "selected" : ""}>PNG</option>
              <option value="image/webp" ${p.format === "image/webp" ? "selected" : ""}>WebP</option>
            </select>
          </div>
          <div class="step-field">
            <label>质量</label>
            <input type="range" data-param="quality" min="10" max="100" value="${p.quality}">
            <span class="val-badge">${p.quality}%</span>
          </div>
        </div>`;

      case "watermark":
        return `
        <div class="step-fields">
          <div class="step-field">
            <label>文字</label>
            <input type="text" data-param="text" value="${p.text}">
          </div>
          <div class="step-field">
            <label>位置</label>
            <select data-param="position">
              <option value="tl" ${p.position === "tl" ? "selected" : ""}>左上</option>
              <option value="tr" ${p.position === "tr" ? "selected" : ""}>右上</option>
              <option value="bl" ${p.position === "bl" ? "selected" : ""}>左下</option>
              <option value="br" ${p.position === "br" ? "selected" : ""}>右下</option>
              <option value="center" ${p.position === "center" ? "selected" : ""}>居中</option>
            </select>
          </div>
          <div class="step-field">
            <label>大小</label>
            <input type="range" data-param="size" min="1" max="12" value="${p.size}">
            <span class="val-badge">${p.size}%</span>
          </div>
          <div class="step-field">
            <label>透明度</label>
            <input type="range" data-param="opacity" min="5" max="100" value="${p.opacity}">
            <span class="val-badge">${p.opacity}%</span>
          </div>
          <div class="step-field">
            <label>颜色</label>
            <input type="color" data-param="color" value="${p.color}">
          </div>
        </div>`;

      case "rename":
        return `
        <div class="step-fields">
          <div class="step-field">
            <label>前缀</label>
            <input type="text" data-param="prefix" value="${p.prefix}" placeholder="可选">
          </div>
          <div class="step-field">
            <label>后缀</label>
            <input type="text" data-param="suffix" value="${p.suffix}" placeholder="可选">
          </div>
          <div class="step-field">
            <label></label>
            <label style="font-size:12px;color:var(--text-2);cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:500">
              <input type="checkbox" data-param="numbering" ${p.numbering ? "checked" : ""} style="accent-color:var(--accent)">
              添加序号
            </label>
          </div>
          ${p.numbering ? `
          <div class="step-field">
            <label>起始</label>
            <input type="number" data-param="startNum" min="0" value="${p.startNum}">
            <span class="val-badge">起始号</span>
          </div>
          <div class="step-field">
            <label>位数</label>
            <input type="number" data-param="padLength" min="1" max="6" value="${p.padLength}">
            <span class="val-badge">补零位数</span>
          </div>
          ` : ""}
        </div>`;
    }
    return "";
  }

  function bindStepParamEvents() {
    $$(".pipeline-step").forEach((stepEl) => {
      const stepId = stepEl.dataset.id;
      const step = state.pipeline.find((s) => s.id === stepId);
      if (!step) return;

      stepEl.querySelectorAll("[data-param]").forEach((input) => {
        const param = input.dataset.param;
        const evtName = input.type === "checkbox" ? "change" : (input.tagName === "SELECT" ? "change" : "input");

        input.addEventListener(evtName, () => {
          let val;
          if (input.type === "checkbox") {
            val = input.checked;
          } else if (input.type === "number" || input.type === "range") {
            val = parseFloat(input.value);
          } else {
            val = input.value;
          }
          step.params[param] = val;

          // 特殊处理：mode 改变时需要重新渲染步骤体
          if (param === "mode" || param === "numbering") {
            renderPipeline();
          } else {
            // 实时更新 badge
            const badge = input.parentElement.querySelector(".val-badge");
            if (badge && (input.type === "range" || input.type === "number")) {
              if (param === "percent" || param === "quality" || param === "opacity" || param === "size") {
                badge.textContent = val + "%";
              }
            }
          }

          // 实时更新预览
          if (state.files.length && state.activeImgId) {
            clearTimeout(window._previewTimer);
            window._previewTimer = setTimeout(() => updatePreview(), 300);
          }
        });
      });
    });
  }

  /* ============ 图片处理流水线 ============ */

  // 计算最终输出格式
  function getFinalFormat(file) {
    let format = file.type;
    for (const step of state.pipeline) {
      if (step.type === "convert") {
        format = step.params.format;
      } else if (step.type === "compress") {
        if (step.params.format !== "auto") {
          format = step.params.format;
        }
      }
    }
    return format;
  }

  // 处理单张图片
  async function processImage(file, index, total) {
    let canvas = newCanvas(file.w, file.h);
    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(file.img, 0, 0, canvas.width, canvas.height);

    let currentType = file.type;
    let currentQuality = 0.92;

    for (const step of state.pipeline) {
      if (step.type === "rename") continue; // 重命名最后处理

      if (step.type === "resize") {
        const p = step.params;
        let w = canvas.width;
        let h = canvas.height;

        if (p.mode === "percent") {
          const ratio = Math.max(0.01, p.percent / 100);
          w = canvas.width * ratio;
          h = canvas.height * ratio;
        } else {
          w = Math.max(1, p.width);
          h = Math.max(1, p.height);
          if (p.lockRatio) {
            const imgRatio = canvas.height / canvas.width;
            h = Math.max(1, Math.round(w * imgRatio));
          }
        }

        const newC = newCanvas(w, h);
        const newCtx = newC.getContext("2d");
        newCtx.imageSmoothingEnabled = true;
        newCtx.imageSmoothingQuality = "high";
        newCtx.drawImage(canvas, 0, 0, w, h);
        canvas = newC;
        ctx = newCtx;
      } else if (step.type === "compress") {
        const p = step.params;
        currentQuality = p.quality / 100;
        if (p.format !== "auto") {
          currentType = p.format;
        }
      } else if (step.type === "convert") {
        const p = step.params;
        currentType = p.format;
        currentQuality = p.quality / 100;
      } else if (step.type === "watermark") {
        drawWatermark(ctx, canvas, step.params);
      }
    }

    // 如果需要填充（JPEG 不支持透明）
    if (needsFill(currentType)) {
      const newC = newCanvas(canvas.width, canvas.height);
      const newCtx = newC.getContext("2d");
      newCtx.fillStyle = "#ffffff";
      newCtx.fillRect(0, 0, newC.width, newC.height);
      newCtx.drawImage(canvas, 0, 0);
      canvas = newC;
      ctx = newCtx;
    }

    const blob = await canvasToBlob(canvas, currentType, currentQuality);

    // 计算文件名
    let name = generateFileName(file, index, total, currentType);

    return {
      id: uid(),
      name,
      blob,
      type: currentType,
      size: blob.size,
      origSize: file.size,
      w: canvas.width,
      h: canvas.height,
      url: URL.createObjectURL(blob),
    };
  }

  function drawWatermark(ctx, canvas, o) {
    const w = canvas.width, h = canvas.height;
    const fs = Math.max(10, Math.round((Math.min(w, h) * o.size) / 100));
    ctx.save();
    ctx.font = `600 ${fs}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
    ctx.fillStyle = o.color;
    ctx.globalAlpha = o.opacity / 100;
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = Math.round(fs * 0.4);
    ctx.shadowOffsetY = Math.round(fs * 0.06);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const pad = Math.round(Math.min(w, h) * 0.035);
    const tw = ctx.measureText(o.text).width;
    const asc = fs;
    let x = pad, y = h - pad;
    switch (o.position) {
      case "tl": x = pad; y = pad + asc; break;
      case "tr": x = w - pad - tw; y = pad + asc; break;
      case "bl": x = pad; y = h - pad; break;
      case "br": x = w - pad - tw; y = h - pad; break;
      case "center":
        ctx.textAlign = "center";
        x = w / 2;
        y = h / 2 + fs * 0.35;
        break;
    }
    ctx.fillText(o.text, x, y);
    ctx.restore();
  }

  function generateFileName(file, index, total, type) {
    const renameStep = state.pipeline.find((s) => s.type === "rename");
    const ext = extFor(type);

    if (!renameStep) {
      return `${baseName(file.name)}.${ext}`;
    }

    const p = renameStep.params;
    let name = "";
    if (p.prefix) name += p.prefix;
    name += baseName(file.name);
    if (p.numbering) {
      const num = p.startNum + index;
      const padded = String(num).padStart(p.padLength, "0");
      name += "_" + padded;
    }
    if (p.suffix) name += p.suffix;
    name += "." + ext;

    return name;
  }

  /* ============ 预览 ============ */
  function initPreview() {
    $$("#previewToggle button").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$("#previewToggle button").forEach((b) => b.classList.toggle("active", b === btn));
        state.previewMode = btn.dataset.view;
        renderPreviewContent();
      });
    });

    $("#refreshPreviewBtn").addEventListener("click", updatePreview);
  }

  async function updatePreview() {
    if (!state.activeImgId || !state.pipeline.length) {
      hidePreview();
      return;
    }

    const file = state.files.find((f) => f.id === state.activeImgId);
    if (!file) return;

    $("#previewSection").style.display = "block";

    try {
      const result = await processImage(file, 0, 1);
      if (state._previewResult && state._previewResult.url) URL.revokeObjectURL(state._previewResult.url);
      state._previewResult = result;
      renderPreviewContent(file, result);
    } catch (e) {
      console.error(e);
      showToast("预览生成失败：" + e.message);
    }
  }

  function renderPreviewContent(file, result) {
    const f = file || state.files.find((x) => x.id === state.activeImgId);
    const r = result || state._previewResult;
    if (!f || !r) return;

    const content = $("#previewContent");

    if (state.previewMode === "compare") {
      content.innerHTML = `
        <div class="preview-compare">
          <div class="preview-box">
            <div class="preview-box-label">原图</div>
            <div class="preview-box-img"><img src="${f.url}" alt="原图"></div>
            <div class="preview-box-info">${f.w}×${f.h} · ${fmtBytes(f.size)}</div>
          </div>
          <div class="preview-box">
            <div class="preview-box-label">处理后</div>
            <div class="preview-box-img"><img src="${r.url}" alt="处理后"></div>
            <div class="preview-box-info">${r.w}×${r.h} · ${fmtBytes(r.size)}</div>
          </div>
        </div>`;
    } else {
      content.innerHTML = `
        <div class="preview-single">
          <div class="preview-box">
            <div class="preview-box-label">处理后效果 · ${r.w}×${r.h} · ${fmtBytes(r.size)}</div>
            <div class="preview-box-img"><img src="${r.url}" alt="处理后"></div>
          </div>
        </div>`;
    }
  }

  function hidePreview() {
    $("#previewSection").style.display = "none";
  }

  /* ============ 批量处理 ============ */
  function initProcess() {
    $("#processBtn").addEventListener("click", startBatchProcess);
    $("#zipBtn").addEventListener("click", downloadZip);
    $("#clearResultsBtn").addEventListener("click", clearResults);
  }

  async function startBatchProcess() {
    if (!state.files.length || !state.pipeline.length || state.processing) return;

    state.processing = true;
    state.results = [];
    updateProcessBtn();

    const progressWrap = $("#progressWrap");
    const progressFill = $("#progressFill");
    const progressText = $("#progressText");
    const progressPct = $("#progressPct");

    progressWrap.style.display = "block";
    progressFill.style.width = "0%";
    progressPct.textContent = "0%";
    progressText.textContent = `准备处理 ${state.files.length} 张图片...`;

    // 清理旧结果
    clearResults(false);

    const total = state.files.length;
    let done = 0;
    let failed = 0;

    for (let i = 0; i < state.files.length; i++) {
      const file = state.files[i];
      progressText.textContent = `正在处理 ${i + 1}/${total}：${file.name}`;

      try {
        const result = await processImage(file, i, total);
        state.results.push(result);
        done++;
      } catch (e) {
        console.error("处理失败:", file.name, e);
        failed++;
      }

      const pct = Math.round(((i + 1) / total) * 100);
      progressFill.style.width = pct + "%";
      progressPct.textContent = pct + "%";
    }

    progressText.textContent = `完成！成功 ${done} 张，失败 ${failed} 张`;
    showToast(`批量处理完成：成功 ${done} 张，失败 ${failed} 张`);

    state.processing = false;
    updateProcessBtn();

    if (state.results.length) {
      renderResults();
    }
  }

  function renderResults() {
    const section = $("#resultsSection");
    const grid = $("#resultsGrid");

    section.style.display = "block";
    $("#zipBtn").style.display = "inline-flex";
    $("#clearResultsBtn").style.display = "inline-flex";

    $("#resultCount").textContent = state.results.length;
    const origTotal = state.results.reduce((s, r) => s + r.origSize, 0);
    const newTotal = state.results.reduce((s, r) => s + r.size, 0);
    $("#origTotalSize").textContent = fmtBytes(origTotal);
    $("#newTotalSize").textContent = fmtBytes(newTotal);
    const saved = origTotal > 0 ? Math.round((1 - newTotal / origTotal) * 100) : 0;
    $("#savedSize").textContent = (saved >= 0 ? "节省 " : "增加 ") + Math.abs(saved) + "%";

    grid.innerHTML = state.results
      .map((r) => `
      <div class="result-item">
        <img src="${r.url}" alt="${he(r.name)}">
        <div class="result-item-info">
          <div class="result-item-name" title="${he(r.name)}">${he(r.name)}</div>
          <div class="result-item-size">${r.w}×${r.h} · ${fmtBytes(r.size)}</div>
        </div>
        <div class="result-item-actions">
          <button data-dl="${r.id}">下载</button>
        </div>
      </div>`)
      .join("");

    grid.querySelectorAll("[data-dl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = state.results.find((x) => x.id === btn.dataset.dl);
        if (r) downloadSingle(r);
      });
    });
  }

  function downloadSingle(result) {
    const a = document.createElement("a");
    a.href = result.url;
    a.download = result.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function downloadZip() {
    if (!state.results.length) return;

    // 检查 JSZip 是否可用
    if (typeof JSZip === "undefined") {
      showToast("未检测到 JSZip，将逐个下载");
      // 逐个下载
      state.results.forEach((r, i) => {
        setTimeout(() => downloadSingle(r), i * 200);
      });
      return;
    }

    showToast("正在生成 ZIP 包...");
    const zip = new JSZip();

    for (const r of state.results) {
      const arrayBuffer = await r.blob.arrayBuffer();
      zip.file(r.name, arrayBuffer);
    }

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch_images_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("ZIP 包已开始下载");
    } catch (e) {
      console.error(e);
      showToast("ZIP 生成失败，将逐个下载");
      state.results.forEach((r, i) => {
        setTimeout(() => downloadSingle(r), i * 200);
      });
    }
  }

  function clearResults(updateUI = true) {
    state.results.forEach((r) => {
      if (r.url && r.url.startsWith("blob:")) {
        URL.revokeObjectURL(r.url);
      }
    });
    state.results = [];
    if (updateUI) {
      $("#resultsSection").style.display = "none";
      $("#zipBtn").style.display = "none";
      $("#clearResultsBtn").style.display = "none";
      $("#progressWrap").style.display = "none";
    }
  }

  /* ============ 初始化 ============ */
  function init() {
    initUpload();
    initPipeline();
    initPreview();
    initProcess();
    updateAddStepButtons();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
