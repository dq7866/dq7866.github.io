/* 知作坊 · 首页注入钩子
 * 作用范围：仅首页 index.html（不含翻页 page/2 等，也不含任何子站/文章页）
 * 注入内容：
 *   1) 正文区顶部 —— 站内公告栏（数据源 source/_data/notices.json）
 *   2) 页脚上方   —— 联系我（微信号 + 二维码 + 留言板入口）
 *
 * 数据源改完后需重新 generate 才生效。
 */
var fs = require("fs");
var path = require("path");

var MARK = "zhz-home";           // 幂等标记
var CSS = '<link rel="stylesheet" href="/zhz/zhz.css">';

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

function readNotices(baseDir) {
  var file = path.join(baseDir, "source", "_data", "notices.json");
  try {
    var raw = fs.readFileSync(file, "utf8");
    var data = JSON.parse(raw);
    return { items: Array.isArray(data.items) ? data.items : [], updated: data.updated || "" };
  } catch (e) {
    return { items: [], updated: "" };
  }
}

function noticeBlock(notices) {
  if (!notices.items.length) return "";
  var html = notices.items.slice(0, 2).map(function (n) {
    return (
      '<div class="zhz-notice">' +
        '<span class="zhz-notice-mark" aria-hidden="true"></span>' +
        '<div class="zhz-notice-main">' +
          '<div class="zhz-notice-head">' +
            '<span class="zhz-notice-title">' + esc(n.title) + "</span>" +
            (n.tag ? '<span class="zhz-notice-tag">' + esc(n.tag) + "</span>" : "") +
            '<span class="zhz-notice-date">' + esc(n.date) + "</span>" +
          "</div>" +
          '<div class="zhz-notice-body">' + esc(n.body) + "</div>" +
        "</div>" +
      "</div>"
    );
  }).join("\n");

  return (
    '<!-- zhz-home-notice -->\n' +
    CSS + "\n" +
    '<section class="zhz-home-notice">\n' +
      '<h2 class="zhz-title">站内公告 <span class="zhz-title-sub">Notices</span></h2>\n' +
      '<div class="zhz-notices zhz-notice-compact">\n' + html + "\n</div>\n" +
      '<p class="zhz-notice-foot">' +
        "共 " + notices.items.length + " 条 · " +
        '<a class="link-chrome" href="/board/#notices">查看全部公告</a>' +
        " · " +
        '<a class="link-chrome" href="/board/#guestbook">去留言板</a>' +
      "</p>\n" +
    "</section>\n" +
    "<!-- /zhz-home-notice -->\n"
  );
}

function contactBlock() {
  return (
    '<!-- zhz-home-contact -->\n' +
    '<section class="zhz-block">\n' +
      '<h2 class="zhz-title">联系我 <span class="zhz-title-sub">Contact</span></h2>\n' +
      '<div class="zhz-card">\n' +
        '<div class="zhz-contact">\n' +
          '<div class="zhz-contact-info">\n' +
            '<div class="zhz-hint">微信</div>\n' +
            '<div class="zhz-wxid">Huangld</div>\n' +
            '<div class="zhz-contact-lines">' +
              "工具箱使用问题、兑换码领取、内容纠错与授权，都可以找我。<br>" +
              '<span class="zhz-contact-hl">需要把某个栏目（如工具箱完整版）安装到本地使用、含全部授权内容的，请联系我。</span><br>' +
              '也欢迎到 <a class="link-chrome" href="/board/">留言板</a> 留言——公开可见、无需注册。' +
            "</div>\n" +
            '<div style="margin-top:1rem;display:flex;gap:.6rem;flex-wrap:wrap">' +
              '<a class="zhz-btn" href="/board/">去留言板</a>' +
              '<a class="zhz-btn" href="/board/#contact">加微信</a>' +
              '<a class="zhz-btn" href="https://zhizuofang.app.workbuddy.host/tip.html" target="_blank" rel="noopener">赞赏支持</a>' +
            "</div>\n" +
          "</div>\n" +
          '<div class="zhz-qr-wrap">\n' +
            '<img class="zhz-qr" src="/images/wechat-qr.jpg" alt="微信二维码（微信号 Huangld）" loading="lazy" width="140" height="140">\n' +
            '<div class="zhz-qr-cap">微信扫码添加</div>\n' +
          "</div>\n" +
        "</div>\n" +
      "</div>\n" +
    "</section>\n" +
    "<!-- /zhz-home-contact -->\n"
  );
}

hexo.extend.filter.register("after_render:html", function (html, data) {
  if (!html || typeof html !== "string") return html;
  if (typeof html !== "string" || html.indexOf(MARK) !== -1) return html;

  var p = (data && data.path) || "";
  if (p !== "index.html") return html;

  var notices = readNotices(hexo.base_dir || process.cwd());
  var out = html;

  // 1) 公告栏：正文区顶部
  var mainTag = out.match(/<main\s+id="main-content"[^>]*>/i);
  if (mainTag) {
    out = out.replace(mainTag[0], mainTag[0] + "\n" + noticeBlock(notices));
  }

  // 2) 联系我：页脚上方
  var footerTag = out.match(/<footer\b[^>]*>/i);
  if (footerTag) {
    out = out.replace(footerTag[0], contactBlock() + footerTag[0]);
  }

  return out;
});
