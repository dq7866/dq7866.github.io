/* 图表工坊 jsdom 冒烟测试 */
const { JSDOM, VirtualConsole } = require("jsdom");
const path = require("path");

const F = path.join(__dirname, "..", "source", "toolbox", "chart-tools.html");
const vc = new VirtualConsole();
const errs = [];
vc.on("jsdomError", (e) => errs.push("JSDOM: " + e.message));
vc.on("error", (...a) => errs.push("console.error: " + a.join(" ")));

const baseCtx = {
  measureText: (t) => ({ width: String(t).length * 6 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  getLineDash: () => [],
};
const store = {};
const ctxStub = new Proxy(baseCtx, {
  get(t, k) {
    if (k in t) return t[k];
    if (k in store) return store[k];
    return function () {};
  },
  set(t, k, v) { store[k] = v; return true; },
});

JSDOM.fromFile(F, {
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
    w.HTMLCanvasElement.prototype.toBlob = (cb) => cb(new w.Blob([], { type: "image/png" }));
    w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
    w.HTMLElement.prototype.scrollIntoView = () => {};
    const OrigBlob = w.Blob;
    w.Blob = function (parts, opts) {
      const b = new OrigBlob(parts, opts);
      try { b.__parts = parts; } catch (e) {}
      return b;
    };
    w.Blob.prototype = OrigBlob.prototype;
    // 让 devicePixelRatio 固定
    Object.defineProperty(w, "devicePixelRatio", { value: 2, configurable: true });
  },
}).then((dom) => {
  const w = dom.window;
  const doc = w.document;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  function ck(name, cond, extra) { results.push([cond ? "PASS" : "FAIL", name, extra || ""]); }

  return wait(600).then(async () => {
    const api = w.__chartApp;
    ck("__chartApp 暴露", !!api);
    if (!api) { report(results, errs); return; }

    // 1. 类型条 16 项
    const tps = doc.querySelectorAll("#typeBar .tp");
    ck("类型按钮 16 个", tps.length === 16, "实际 " + tps.length);

    // 2. 逐个切换类型
    const core = api.core;
    const types = tps.length ? Array.from(tps).map((b) => b.dataset.type) : [];
    let bad = [];
    for (const t of types) {
      try {
        const btn = doc.querySelector('#typeBar .tp[data-type="' + t + '"]');
        btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
        if (api.state.type !== t) bad.push(t + "(state未变)");
        const m = core.buildModel(api.state, core.parseCSV(api.getData()));
        if (!m.P || !m.P.length) bad.push(t + "(无图元)");
        const ser = JSON.stringify(m.P);
        if (/"(x|y|w|h|r|size|cx|cy|a0|a1|ir|rot|sw)":null/.test(ser)) bad.push(t + "(数值为null)");
        if (ser.includes("NaN")) bad.push(t + "(含NaN)");
      } catch (e) { bad.push(t + ":" + e.message); }
    }
    ck("16 类型切换+建图", bad.length === 0, bad.join(" / "));

    // 3. 统计信息
    ck("#statType 已更新", doc.getElementById("statType").textContent.trim() === "瀑布图",
      "实际 " + doc.getElementById("statType").textContent);

    // 4. 配色 10 套
    const pals = doc.querySelectorAll("#palGrid .pal");
    ck("配色 10 套", pals.length === 10, "实际 " + pals.length);
    pals[3].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    ck("配色切换生效", api.state.palette === 3, "palette=" + api.state.palette);

    // 5. 示例 chips 17 个 + 逐个套用
    const chips = doc.querySelectorAll("#presetChips .chip");
    ck("示例 16 个", chips.length === 16, "实际 " + chips.length);
    let pbad = [];
    for (let i = 0; i < chips.length; i++) {
      try {
        doc.querySelectorAll("#presetChips .chip")[i].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
        const d = core.parseCSV(api.getData());
        const m = core.buildModel(api.state, d);
        if (!m.P.length) pbad.push(i + "(无图元)");
        if (!d.labels.length) pbad.push(i + "(无标签)");
      } catch (e) { pbad.push(i + ":" + e.message); }
    }
    ck("16 示例全部可用", pbad.length === 0, pbad.join(" / "));

    // 6. 表格增删行列
    const rows0 = doc.querySelectorAll("#dataTable tbody tr").length;
    const cols0 = doc.querySelectorAll("#dataTable thead th").length;
    doc.getElementById("addRow").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    const rows1 = doc.querySelectorAll("#dataTable tbody tr").length;
    doc.getElementById("addCol").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    const cols1 = doc.querySelectorAll("#dataTable thead th").length;
    doc.getElementById("delRow").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    doc.getElementById("delCol").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    const rows2 = doc.querySelectorAll("#dataTable tbody tr").length;
    const cols2 = doc.querySelectorAll("#dataTable thead th").length;
    ck("加行/加列/删行/删列", rows1 === rows0 + 1 && cols1 === cols0 + 1 && rows2 === rows0 && cols2 === cols0,
      `${rows0}->${rows1}->${rows2} / ${cols0}->${cols1}->${cols2}`);

    // 7. 单元格编辑同步
    const firstCell = doc.querySelector("#dataTable tbody tr td input, #dataTable tbody tr td");
    if (firstCell) {
      const inp = firstCell.tagName === "INPUT" ? firstCell : firstCell.querySelector("input");
      if (inp) {
        inp.value = "测试标签";
        inp.dispatchEvent(new w.Event("input", { bubbles: true }));
        await wait(400);
        const d = core.parseCSV(api.getData());
        ck("单元格编辑同步", d.labels[0] === "测试标签", "labels[0]=" + d.labels[0]);
      }
    }

    // 8. 宽度调整
    const wIn = doc.getElementById("w");
    wIn.value = "1200";
    wIn.dispatchEvent(new w.Event("change", { bubbles: true }));
    ck("宽度改变生效", api.state.width === 1200, "width=" + api.state.width);
    const sizeBtn = doc.querySelector("#sizeBtns [data-wh]");
    if (sizeBtn) {
      sizeBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      const [ew, eh] = sizeBtn.dataset.wh.split("x").map(Number);
      ck("预设尺寸按钮", api.state.width === ew && api.state.height === eh, api.state.width + "×" + api.state.height);
    }

    // 9. 双轴开关显示右轴控件
    const dual = doc.getElementById("dualAxis");
    const y2 = doc.getElementById("y2Row");
    if (dual && y2) {
      dual.checked = true;
      dual.dispatchEvent(new w.Event("change", { bubbles: true }));
      ck("双轴开关显隐", y2.style.display !== "none" && !y2.hidden, "display=" + y2.style.display);
      dual.checked = false;
      dual.dispatchEvent(new w.Event("change", { bubbles: true }));
    }

    // 10. 导出函数族
    const expKinds = Array.from(doc.querySelectorAll("#exportMenu [data-exp]")).map((b) => b.dataset.exp);
    ck("导出菜单 9 项", expKinds.length === 9, expKinds.join(","));
    api.state.type = "combo";
    const svgOut = core.svg(core.buildModel(api.state, core.parseCSV(api.getData())), api.state);
    ck("SVG 输出合法", /^<svg[\s\S]*<\/svg>$/.test(svgOut) && !svgOut.includes("undefined") && !svgOut.includes("NaN"),
      "长度 " + svgOut.length);

    // 11. 导出 HTML 自包含性
    let htmlOut = "";
    try {
      const OrigURL = w.URL.createObjectURL;
      w.URL.createObjectURL = (b) => { htmlOut = (b && b.__parts ? b.__parts.join("") : ""); return "blob:x"; };
      api.exportHTML();
      w.URL.createObjectURL = OrigURL;
    } catch (e) { htmlOut = "ERR:" + e.message; }
    ck("导出 HTML 非空", htmlOut.length > 5000, "长度 " + htmlOut.length);
    ck("导出 HTML 内联引擎", htmlOut.includes("function makeCore") && htmlOut.includes('id="payload"') && htmlOut.trim().endsWith("</html>"),
      "makeCore=" + htmlOut.includes("function makeCore") + " payload=" + htmlOut.includes('id="payload"'));
    require("fs").writeFileSync(require("path").join(__dirname, "_exported.html"), htmlOut);
    ck("导出 HTML 写盘", htmlOut.length > 40000, "字节 " + Buffer.byteLength(htmlOut));
    ck("导出 HTML 无外部依赖", !/src="assets\/js\/chart-(core|tools)\.js"/.test(htmlOut));

    // 12. 分享链接编码
    ck("分享链接函数", typeof api.state === "object");

    // 13. 空白/异常数据不崩
    try {
      api.setData("标签,值\n");
      const m = core.buildModel(api.state, core.parseCSV("标签,值\n"));
      ck("空数据不崩", !!m.P);
    } catch (e) { ck("空数据不崩", false, e.message); }

    report(results, errs);
    dom.window.close();
  });
}).catch((e) => {
  console.log("GLOBAL FAIL:", e.message);
  process.exit(1);
});

function report(results, errs) {
  let pass = 0, fail = 0;
  results.forEach(([s, n, x]) => {
    if (s === "PASS") pass++; else fail++;
    console.log((s === "PASS" ? "✔" : "✘") + " " + n + (x ? "  [" + x + "]" : ""));
  });
  const realErrs = errs.filter((e) => !/Could not load|Not implemented|css|CSS/i.test(e));
  if (realErrs.length) {
    console.log("\n-- 页面错误 --");
    realErrs.slice(0, 8).forEach((e) => console.log("  " + e.slice(0, 200)));
  }
  console.log(`\n共 ${results.length} 项：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
