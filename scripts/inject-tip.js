/* 知作坊 · Hexo 渲染钩子：给博客页面（正文/归档/标签等）追加一个克制的「赞赏支持」入口。
 *
 * 设计取舍（2026-10-09）：
 *   - 门槛只加在 /toolbox/（工具是"用"的，付费意愿高）；
 *   - 博客/教育/游戏保持完全开放，靠搜索引擎收录带流量；
 *   - 开放页面只放一个不打扰阅读的赞赏入口，作为自愿支持通道。
 *
 * 注：games / edu / symbolpass / toolbox 为 skip_render 静态页，不经过渲染，
 *     它们的入口已在源文件中直接写入（见 edu/*.html、games/index.html）。
 */
hexo.extend.filter.register("after_render:html", function (html) {
  if (!html || typeof html !== "string") return html;
  if (html.indexOf("zhz-tip") !== -1) return html; // 幂等
  if (!/<\/body>/i.test(html)) return html;

  var tip =
    '<!-- zhz-tip -->\n' +
    '<div style="box-sizing:border-box;max-width:880px;margin:34px auto 42px;padding:18px 20px 0;' +
    'border-top:1px solid rgba(140,130,120,.16);text-align:center;' +
    "font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;" +
    'font-size:13px;line-height:1.8;color:#8a8078">\n' +
    '  本站内容不设门槛、全部免费开放。若它帮到了你，欢迎 ' +
    '<a href="https://zhizuofang.app.workbuddy.host/tip.html" target="_blank" rel="noopener" ' +
    'style="color:#ff4d00;font-weight:700;text-decoration:none">赞赏支持</a>\n' +
    '</div>\n' +
    '<!-- /zhz-tip -->\n';

  return html.replace(/<\/body>/i, tip + "</body>");
});
