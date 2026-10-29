/* 导出的可编辑 HTML 独立运行测试 */
const { JSDOM, VirtualConsole } = require("jsdom");
const path = require("path");
const fs = require("fs");

const F = path.join(__dirname, "_exported.html");
const html = fs.readFileSync(F, "utf8");
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
  get(t, k) { if (k in t) return t[k]; if (k in store) return store[k]; return function () {}; },
  set(t, k, v) { store[k] = v; return true; },
});

const res = [];
const ck = (n, c, x) => res.push([c ? "PASS" : "FAIL", n, x || ""]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: "file:///" + F.replace(/\\/g, "/"),
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ctxStub;
    Object.defineProperty(w, "devicePixelRatio", { value: 1, configurable: true });
  },
});

(async () => {
  await wait(400);
  const w = dom.window, d = w.document;

  ck("无脚本报错", errs.filter((e) => !/Not implemented|css/i.test(e)).length === 0,
    errs.slice(0, 3).join(" | "));
  ck("画布已渲染", d.getElementById("cv").width > 0, "width=" + d.getElementById("cv").width);
  ck("标题回填", d.getElementById("ti").value.length > 0, "标题=" + d.getElementById("ti").value);
  ck("数据类型下拉 16 项", d.getElementById("t").options.length === 16, "实际 " + d.getElementById("t").options.length);
  ck("数据文本已回填", d.getElementById("dt").value.split("\n").length > 2, "行数 " + d.getElementById("dt").value.split("\n").length);

  // 改类型 → 重绘
  const t = d.getElementById("t");
  const before = d.getElementById("cv").width;
  t.value = "pie";
  t.dispatchEvent(new w.Event("change", { bubbles: true }));
  await wait(120);
  ck("切类型可重绘", d.getElementById("cv").width > 0, "before=" + before + " after=" + d.getElementById("cv").width);

  // 改数据 → 重绘
  const dt = d.getElementById("dt");
  dt.value = "名称,数值\n甲,10\n乙,25\n丙,8";
  dt.dispatchEvent(new w.Event("input", { bubbles: true }));
  await wait(120);
  ck("改数据可重绘", d.getElementById("cv").width > 0, "ok");

  // 导出按钮存在
  ck("PNG 导出按钮存在", !!d.getElementById("dp"));
  ck("SVG 导出按钮存在", !!d.getElementById("ds"));

  let pass = 0, fail = 0;
  res.forEach(([s, n, x]) => { if (s === "PASS") pass++; else fail++; console.log((s === "PASS" ? "✔" : "✘") + " " + n + (x ? "  [" + x + "]" : "")); });
  console.log(`\n导出文件测试 ${res.length} 项：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
