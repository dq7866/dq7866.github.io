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
// zhz.css    —— 公告栏与联系卡片的样式（沿用 shiro 时代）
// portal.css —— 首页产品门户卡片（Butterfly 版新增）
var CSS = '<link rel="stylesheet" href="/zhz/zhz.css"><link rel="stylesheet" href="/zhz/portal.css">';

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

/* 首页产品门户数据（source/_data/portal.json） */
function readPortal(baseDir) {
  var file = path.join(baseDir, "source", "_data", "portal.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

/* 产品门户：首屏第一眼看到的东西。顺序 = portal.json 里的分组顺序 */
function portalBlock(portal) {
  if (!portal || !Array.isArray(portal.groups) || !portal.groups.length) return "";
  var h = '<section class="zhz-portal" aria-label="站内产品入口">';
  portal.groups.forEach(function (g) {
    var items = Array.isArray(g.items) ? g.items : [];
    if (!items.length) return;
    h += '<div class="zhz-portal-group">';
    h += '<div class="zhz-portal-head"><h2>' + esc(g.title) + "</h2>" +
         (g.sub ? '<span class="zhz-portal-sub">' + esc(g.sub) + "</span>" : "") + "</div>";
    h += '<div class="zhz-portal-grid">';
    items.forEach(function (it) {
      var tags = (Array.isArray(it.tags) ? it.tags : [])
        .filter(Boolean)
        .map(function (t) { return "<span>" + esc(t) + "</span>"; })
        .join("");
      h += '<a class="zhz-pcard" href="' + esc(it.url) + '" style="--zhz-c:' + esc(it.color || "#6b7280") + '">' +
             '<span class="zhz-pcard-ico" aria-hidden="true">' + esc(it.emoji || "\u2022") + "</span>" +
             '<span class="zhz-pcard-body">' +
               '<span class="zhz-pcard-t">' + esc(it.name) +
                 (it.sub ? "<em>" + esc(it.sub) + "</em>" : "") +
               "</span>" +
               '<span class="zhz-pcard-d">' + esc(it.desc || "") + "</span>" +
               (tags ? '<span class="zhz-pcard-tags">' + tags + "</span>" : "") +
             "</span>" +
             (it.stat ? '<span class="zhz-pcard-stat">' + esc(it.stat) + "</span>" : "") +
           "</a>";
    });
    h += "</div></div>";
  });
  h += "</section>";
  return h;
}

hexo.extend.filter.register("after_render:html", function (html, data) {
  if (!html || typeof html !== "string") return html;
  if (html.indexOf(MARK) !== -1) return html;

  var p = (data && data.path) || "";
  if (p !== "index.html" && p !== "") return html;

  var baseDir = hexo.base_dir || process.cwd();
  var notices = readNotices(baseDir);
  var portal = readPortal(baseDir);
  var out = html;

  // 1) 门户 + 公告：插到文章列表容器开头
  //    Butterfly 的 #recent-posts 是 content-inner（flex）里的内容列，
  //    插在它内部不会破坏左右分栏；插到 content-inner 直接子级反而会被 flex 挤压。
  //    注意：属性顺序不固定（实际是 class 在前、id 在后），不能用 <div id="recent-posts"
  var injected = portalBlock(portal) + noticeBlock(notices);
  var anchor = out.match(/<div\b[^>]*\bid="recent-posts"[^>]*>/i);
  if (anchor) {
    // 用函数形式替换，避免注入内容里的 $& 之类被当成替换模式
    out = out.replace(anchor[0], function (m) { return m + "\n" + injected; });
  } else {
    // 兜底：shiro 时代的锚点
    var mainTag = out.match(/<main\b[^>]*\bid="main-content"[^>]*>/i);
    if (mainTag) out = out.replace(mainTag[0], function (m) { return m + "\n" + injected; });
  }

  // 2) 联系我：页脚上方
  var footerTag = out.match(/<footer\b[^>]*>/i);
  if (footerTag) {
    out = out.replace(footerTag[0], function (m) { return contactBlock() + m; });
  }

  return out;
});
