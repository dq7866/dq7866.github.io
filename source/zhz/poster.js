/* 知作坊 · 首页「海报墙」交互
 * 纯原生、无依赖、约 4KB。没有它页面也能用（触摸/触控板可横滑），
 * 只是少了箭头、拖动、滚轮横滑和进度条。
 *
 * 约定（见 scripts/inject-home.js 生成的 DOM）：
 *   .zhz-portal-group--wall      组容器
 *   [data-wall]                  横向滚动容器（tabindex=0）
 *   [data-wall-prev] / -next     翻页按钮
 *   [data-wall-rail] [data-wall-bar]  进度条
 */
(function () {
  "use strict";

  var walls = document.querySelectorAll("[data-wall]");
  if (!walls.length) return;

  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function setup(wall) {
    var group = wall.closest(".zhz-portal-group--wall");
    var prev = group && group.querySelector("[data-wall-prev]");
    var next = group && group.querySelector("[data-wall-next]");
    var rail = group && group.querySelector("[data-wall-rail]");
    var bar = group && group.querySelector("[data-wall-bar]");
    var cards = wall.querySelectorAll(".zhz-pcard--poster");

    function maxScroll() {
      return Math.max(0, wall.scrollWidth - wall.clientWidth);
    }

    /* 一屏能滚几张：按卡片实际宽度 + 间距算步长 */
    function step() {
      if (!cards.length) return wall.clientWidth;
      var gap = parseFloat(getComputedStyle(wall).columnGap || "14") || 14;
      return cards[0].getBoundingClientRect().width + gap;
    }

    function paint() {
      var max = maxScroll();
      var left = wall.scrollLeft;
      var can = max > 4;

      group.classList.toggle("is-scrollable", can);
      wall.classList.toggle("is-start", left <= 2);
      wall.classList.toggle("is-end", left >= max - 2);

      if (prev) prev.disabled = left <= 2;
      if (next) next.disabled = left >= max - 2;

      if (rail) rail.hidden = !can;
      if (bar && wall.scrollWidth) {
        var w = wall.clientWidth / wall.scrollWidth;
        bar.style.transform =
          "translateX(" + left * w + "px) scaleX(" + w + ")";
      }
    }

    function go(dir) {
      var max = maxScroll();
      var target = wall.scrollLeft + dir * step();
      if (target < 0) target = 0;
      if (target > max) target = max;
      wall.scrollTo({ left: target, behavior: reduceMotion.matches ? "auto" : "smooth" });
    }

    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });

    wall.addEventListener("scroll", paint, { passive: true });

    /* 键盘：容器可聚焦，方向键翻页（读屏/纯键盘用户也能看全） */
    wall.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") { e.preventDefault(); wall.scrollTo({ left: 0, behavior: "smooth" }); }
      else if (e.key === "End") { e.preventDefault(); wall.scrollTo({ left: maxScroll(), behavior: "smooth" }); }
    });

    /* 滚轮：鼠标只有一个轮时，竖着滚也能横着走；
       滚到尽头就把事件放行，页面继续正常上下滚（不劫持） */
    wall.addEventListener("wheel", function (e) {
      if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // 触控板横滑：交给浏览器
      var d = e.deltaY;
      if (!d) return;
      var max = maxScroll();
      if (max <= 4) return;
      var left = wall.scrollLeft;
      if ((d > 0 && left >= max - 1) || (d < 0 && left <= 1)) return;
      e.preventDefault();
      freeScroll();
      wall.scrollBy({ left: d, behavior: "instant" });
    }, { passive: false });

    /* 滚轮期间临时关掉吸附，停手 220ms 后再交还给 CSS，
       否则 proximity 会把刚滚出去的一点点又吸回原位 */
    var freeTimer = 0;
    function freeScroll() {
      wall.classList.add("is-free");
      clearTimeout(freeTimer);
      freeTimer = setTimeout(function () { wall.classList.remove("is-free"); }, 220);
    }

    /* 拖动：按住左键横拖（鼠标用户最直觉的操作）；松手恢复吸附 */
    var down = false, dragged = false, startX = 0, startLeft = 0, dragDx = 0;

    wall.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch" || e.button !== 0) return;  // 触摸交给原生滚动
      if (maxScroll() <= 4) return;
      down = true;
      dragged = false;
      dragDx = 0;
      startX = e.clientX;
      startLeft = wall.scrollLeft;
    });

    wall.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      dragDx = dx;
      if (!dragged && Math.abs(dx) > 4) {
        dragged = true;
        wall.classList.add("is-dragging");
        wall.setPointerCapture && wall.setPointerCapture(e.pointerId);
      }
      if (dragged) {
        e.preventDefault();
        wall.scrollLeft = startLeft - dx;
      }
    });

    function endDrag(e) {
      if (!down) return;
      down = false;
      if (!dragged) return;
      wall.classList.remove("is-dragging");
      try { wall.releasePointerCapture && wall.releasePointerCapture(e.pointerId); } catch (err) {}
      settle(dragDx);
    }

    /* 松手落点：拖动超过 60px 就顺势翻到下一张（按拖动方向取整），
       只拖了一点点则退回最近的一张——比让 CSS proximity 自己算更跟手 */
    function settle(dx) {
      var s = step();
      var max = maxScroll();
      var cur = wall.scrollLeft;
      var idx = Math.abs(dx) >= 60
        ? (dx < 0 ? Math.ceil(cur / s) : Math.floor(cur / s))
        : Math.round(cur / s);
      var target = Math.max(0, Math.min(max, idx * s));
      wall.classList.add("is-free");      // 落地过程中别被吸附打断
      wall.scrollTo({ left: target, behavior: reduceMotion.matches ? "auto" : "smooth" });
      setTimeout(function () { wall.classList.remove("is-free"); }, 420);
    }

    wall.addEventListener("pointerup", endDrag);
    wall.addEventListener("pointercancel", endDrag);

    /* 拖动结束时别顺手把链接点了 */
    wall.addEventListener("click", function (e) {
      if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; }
    }, true);

    paint();

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { paint(); });
      ro.observe(wall);
    } else {
      window.addEventListener("resize", paint);
    }
    window.addEventListener("load", paint);
    /* 字体/图片落位后宽度会变，补几次 */
    setTimeout(paint, 300);
    setTimeout(paint, 1200);
  }

  for (var i = 0; i < walls.length; i++) setup(walls[i]);
})();
