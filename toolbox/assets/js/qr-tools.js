/* 二维码工具箱 · 纯前端实现
   生成/美化：qr-code-styling ；识别：jsQR ；打包：JSZip */
(function () {
  "use strict";
  const $ = (s, r = document) => (r || document).querySelector(s);
  const $$ = (s, r = document) => Array.from((r || document).querySelectorAll(s));

  const QRS = window.QRCodeStyling || window.qrCodeStyling;
  let logoDataUrl = null;
  let previewQR = null;

  /* ---------------- data ---------------- */
  const esc = (s) => String(s || "").replace(/([\\;,:"])/g, "\\$1");
  const he = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function buildData() {
    const t = ($("#qrType .active") || {}).dataset ? $("#qrType .active").dataset.v : "text";
    if (t === "text") return $("#c_text").value.trim();
    if (t === "vcard") {
      const n = $("#c_name").value.trim(), tel = $("#c_tel").value.trim(), org = $("#c_org").value.trim(),
        ti = $("#c_title").value.trim(), em = $("#c_email").value.trim(), url = $("#c_url").value.trim();
      const L = ["BEGIN:VCARD", "VERSION:3.0", "N:" + n, "FN:" + n];
      if (org) L.push("ORG:" + org);
      if (ti) L.push("TITLE:" + ti);
      if (tel) L.push("TEL;TYPE:CELL:" + tel);
      if (em) L.push("EMAIL:" + em);
      if (url) L.push("URL:" + url);
      L.push("END:VCARD");
      return L.join("\n");
    }
    if (t === "wifi") {
      const ssid = $("#w_ssid").value, pass = $("#w_pass").value, enc = $("#w_enc").value, hid = $("#w_hidden").checked;
      return `WIFI:T:${enc};S:${esc(ssid)};${enc === "nopass" ? "" : "P:" + esc(pass) + ";"}${hid ? "H:true;" : ""};`;
    }
    if (t === "sms") return `SMSTO:${$("#s_tel").value.trim()}:${$("#s_body").value}`;
    if (t === "mail") {
      const to = $("#m_to").value.trim(), sub = encodeURIComponent($("#m_sub").value), body = encodeURIComponent($("#m_body").value);
      return `mailto:${to}?subject=${sub}&body=${body}`;
    }
    if (t === "tel") return `tel:${$("#t_tel").value.trim()}`;
    return "";
  }

  /* ---------------- options ---------------- */
  function options(data, size) {
    const transparent = $("#transparent").checked;
    const fg = $("#fg").value;
    const o = {
      width: size,
      height: size,
      type: "canvas",
      data: data && data.length ? data : " ",
      margin: +$("#margin").value,
      qrOptions: { errorCorrectionLevel: $("#ecc").value },
      dotsOptions: { color: fg, type: $("#dotStyle").value },
      backgroundOptions: { color: transparent ? "transparent" : $("#bg").value },
      cornersSquareOptions: { color: fg, type: $("#cornerStyle").value },
      cornersDotOptions: { color: fg, type: $("#cornerDotStyle").value },
      imageOptions: { crossOrigin: "anonymous", margin: Math.round(size * 0.02), imageSize: (+$("#logoSize").value) / 100, hideBackgroundDots: true },
    };
    if (logoDataUrl) o.image = logoDataUrl;
    return o;
  }

  /* ---------------- preview ---------------- */
  function renderPreview() {
    const data = buildData();
    const size = +$("#size").value;
    const holder = $("#qrHolder");
    if (!previewQR) {
      previewQR = new QRS(options(data, size));
      previewQR.append(holder);
      const cv = holder.querySelector("canvas");
      if (cv) { cv.style.width = "100%"; cv.style.height = "auto"; cv.style.display = "block"; }
      holder.style.maxWidth = "320px";
      holder.style.width = "100%";
    } else {
      previewQR.update(options(data, size));
    }
    const hint = $("#dataHint");
    if (!data) hint.textContent = "请输入内容…";
    else hint.textContent = `共 ${data.length} 个字符 · 容错 ${$("#ecc").value}`;
  }

  let rafId = null;
  function schedulePreview() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => setTimeout(renderPreview, 60));
  }

  async function rawBlob(ext, dataOverride) {
    const size = +$("#size").value;
    const data = dataOverride != null ? dataOverride : buildData();
    if (ext === "png") {
      const inst = new QRS(Object.assign(options(data, size), { type: "canvas" }));
      const d = document.createElement("div");
      inst.append(d);
      await new Promise((r) => setTimeout(r, logoDataUrl ? 300 : 90));
      return await inst.getRawData("png");
    }
    const inst = new QRS(Object.assign(options(data, size), { type: "svg" }));
    await new Promise((r) => setTimeout(r, logoDataUrl ? 300 : 60));
    return await inst.getRawData("svg");
  }

  function saveBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---------------- batch ---------------- */
  async function batchGenerate(onlyPreview) {
    const err = $("#batchErr"); err.textContent = "";
    const lines = $("#batchText").value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const box = $("#batchPreview");
    box.innerHTML = "";
    $("#batchEmpty").style.display = lines.length ? "none" : "block";
    if (!lines.length) { err.textContent = "请输入内容，每行一个。"; return; }
    if (lines.length > 200) { err.textContent = "一次最多 200 个。"; return; }
    const btn = $("#batchRun"); btn.disabled = true; const t = btn.textContent; btn.textContent = "生成中…";
    const prevBtn = $("#batchPreviewBtn"); prevBtn.disabled = true;
    try {
      const blobs = [];
      const maxPrev = Math.min(lines.length, 24);
      for (let i = 0; i < lines.length; i++) {
        const b = await rawBlob("png", lines[i]);
        blobs.push(b);
        if (i < maxPrev) {
          const d = document.createElement("div");
          d.className = "thumb";
          d.title = lines[i];
          const img = document.createElement("img");
          img.src = URL.createObjectURL(b);
          img.onload = () => setTimeout(() => URL.revokeObjectURL(img.src), 2000);
          img.onerror = () => URL.revokeObjectURL(img.src);
          d.appendChild(img);
          box.appendChild(d);
        }
      }
      if (onlyPreview) return;
      const zip = new JSZip();
      blobs.forEach((b, i) => zip.file(`qr-${String(i + 1).padStart(3, "0")}.png`, b));
      const zb = await zip.generateAsync({ type: "blob" });
      saveBlob(zb, `qrcodes_${Date.now()}.zip`);
    } catch (e) {
      console.error(e);
      err.textContent = "生成出错：" + (e && e.message ? e.message : e);
    } finally {
      btn.disabled = false; btn.textContent = t;
      prevBtn.disabled = false;
    }
  }

  /* ---------------- scan ---------------- */
  async function scanFile(file) {
    const box = $("#scanResult");
    box.innerHTML = '<div class="empty">识别中…</div>';
    try {
      let bmp;
      try { bmp = await createImageBitmap(file); }
      catch (e) {
        const url = URL.createObjectURL(file);
        try {
          bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("图片加载失败")); im.src = url; });
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const w = bmp.width, h = bmp.height;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      let code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
      // 小图放大再试一次，提高识别率
      if (!code && Math.max(w, h) < 600) {
        const s = 600 / Math.max(w, h);
        const cv2 = document.createElement("canvas");
        cv2.width = Math.round(w * s); cv2.height = Math.round(h * s);
        const c2 = cv2.getContext("2d", { willReadFrequently: true });
        c2.imageSmoothingEnabled = false;
        c2.drawImage(bmp, 0, 0, cv2.width, cv2.height);
        code = jsQR(c2.getImageData(0, 0, cv2.width, cv2.height).data, cv2.width, cv2.height, { inversionAttempts: "attemptBoth" });
      }
      if (!code) { box.innerHTML = '<div class="err">没有识别到二维码，换个更清晰、更完整的图片试试。</div>'; return; }
      const data = code.data;
      const isUrl = /^https?:\/\//i.test(data);
      box.innerHTML = `
        <div class="note" style="user-select:text;word-break:break-all;font-family:var(--mono);font-size:13px;color:var(--ink)">${he(data)}</div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn primary" id="scanCopy">复制内容</button>
          ${isUrl ? `<a class="btn" href="${data.replace(/"/g, "&quot;")}" target="_blank" rel="noopener">打开链接</a>` : ""}
        </div>`;
      $("#scanCopy").onclick = () => navigator.clipboard.writeText(data).then(() => alert("已复制"));
    } catch (e) {
      console.error(e);
      box.innerHTML = '<div class="err">识别失败：' + (e && e.message ? e.message : e) + "</div>";
    }
  }

  /* ---------------- wiring ---------------- */
  function init() {
    // main tabs
    $$("#qrTabs .tab").forEach((b) => {
      b.onclick = () => {
        $$("#qrTabs .tab").forEach((x) => x.classList.toggle("active", x === b));
        $$(".qr-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.tab !== b.dataset.tab));
      };
    });
    // content type tabs
    $$("#qrType .tab").forEach((b) => {
      b.onclick = () => {
        $$("#qrType .tab").forEach((x) => x.classList.toggle("active", x === b));
        $$(".type-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.v !== b.dataset.v));
        schedulePreview();
      };
    });
    // 所有内容/样式输入 → 实时更新预览（事件委托，覆盖动态面板）
    const WATCH = "#fg,#bg,#size,#margin,#ecc,#dotStyle,#cornerStyle,#cornerDotStyle,#logoSize,#transparent";
    const onEdit = (e) => {
      const t = e.target;
      if (t && (t.closest(".type-panel") || t.matches(WATCH))) schedulePreview();
    };
    document.addEventListener("input", onEdit);
    document.addEventListener("change", onEdit);
    $("#size").addEventListener("input", () => ($("#sizeVal").textContent = $("#size").value));
    $("#margin").addEventListener("input", () => ($("#marginVal").textContent = $("#margin").value));
    $("#logoSize").addEventListener("input", () => ($("#logoSizeVal").textContent = $("#logoSize").value + "%"));

    $("#logoFile").addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        logoDataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("文件读取失败")); r.readAsDataURL(f); });
      } catch (err) {
        alert("Logo 图片加载失败：" + (err && err.message ? err.message : err));
        $("#logoFile").value = "";
        return;
      }
      schedulePreview();
    });
    $("#clearLogo").onclick = () => { logoDataUrl = null; $("#logoFile").value = ""; schedulePreview(); };

    $("#dlPng").onclick = async () => { if (!buildData()) return alert("请先输入内容"); saveBlob(await rawBlob("png"), "qrcode.png"); };
    $("#dlSvg").onclick = async () => { if (!buildData()) return alert("请先输入内容"); saveBlob(await rawBlob("svg"), "qrcode.svg"); };
    $("#copyPng").onclick = async () => {
      if (!buildData()) return alert("请先输入内容");
      try {
        const b = await rawBlob("png");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
        alert("已复制图片到剪贴板");
      } catch (e) { alert("复制失败（浏览器可能不支持），请改用下载。"); }
    };

    $("#batchRun").onclick = () => batchGenerate(false);
    $("#batchPreviewBtn").onclick = () => batchGenerate(true);

    const drop = $("#scanDrop");
    $("#scanInput").addEventListener("change", (e) => { if (e.target.files[0]) scanFile(e.target.files[0]); e.target.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) scanFile(f); });
    drop.addEventListener("click", () => $("#scanInput").click());
    document.addEventListener("paste", (e) => {
      const items = e.clipboardData && e.clipboardData.files;
      if (items && items.length) { const f = Array.from(items).find((x) => x.type.startsWith("image/")); if (f) scanFile(f); }
    });

    renderPreview();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();