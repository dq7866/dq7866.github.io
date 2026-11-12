/**
 * 全局错误兜底。
 *
 * 商业软件的一条底线：任何未捕获异常都不能让用户面对「点了没反应」或永久白屏，
 * 也不能让同一个错误反复弹窗把人烦死。这里做三件事：
 *  1. 接住 window.onerror / unhandledrejection（含第三方库、事件回调里抛的错）；
 *  2. 去重 + 限流（同一错误 6 秒内不重复打扰，30 秒内最多提示 3 次）；
 *  3. 交给上层注册的通知器（toast / 提示条），原始错误始终完整打到控制台，方便排查。
 *
 * 用法：
 *   installErrorGuard();                 // 尽早装
 *   setErrorNotifier(msg => toast('⚠️ ' + msg));
 *   const v = safeRun(() => risky(), '载入图纸');   // 局部兜底，失败返回 undefined
 */

let notify = null;
let installed = false;
const seen = new Map();       // 错误摘要 → 上次提示时间
const TOAST_WINDOW_MS = 30000;
const TOAST_MAX = 3;
let budget = TOAST_MAX;
let budgetResetAt = 0;

/** 注册「怎么告诉用户」；不注册则只打控制台 */
export function setErrorNotifier(fn) { notify = typeof fn === 'function' ? fn : null; }

function summarize(err) {
  if (!err) return '未知错误';
  if (typeof err === 'string') return err;
  return String(err.message || (err.reason && err.reason.message) || err);
}

function report(kind, err) {
  const msg = summarize(err);
  // 原始错误照原样进控制台：出问题时要能一眼看到堆栈
  console.error(`[破境积木] ${kind}：`, err);
  const now = Date.now();
  if (now > budgetResetAt) { budgetResetAt = now + TOAST_WINDOW_MS; budget = TOAST_MAX; }
  const key = msg.slice(0, 140);
  if (now - (seen.get(key) || 0) < 6000) return;
  seen.set(key, now);
  // 去重表也要封顶：长会话里错误文案可能千奇百怪，不能让它无限涨
  if (seen.size > 50) seen.delete(seen.keys().next().value);
  if (budget <= 0) return;
  budget--;
  if (notify) { try { notify(msg); } catch { /* 提示本身出错就算了，别再套娃 */ } }
}

/** 装上全局监听（重复调用无副作用） */
export function installErrorGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', e => {
    // 资源加载失败（img/script）没有 error 对象，单独措辞
    if (e && e.target && e.target !== window && e.target.tagName) {
      report('资源加载失败', `${e.target.tagName} ${e.target.src || e.target.href || ''}`);
      return;
    }
    report('运行时错误', e.error || e.message);
  }, true);
  window.addEventListener('unhandledrejection', e => {
    report('异步任务出错', e.reason);
  });
}

/**
 * 局部兜底：包住一段可能抛错的逻辑。
 * 失败时返回 undefined（调用方据此判断"这次没成功"），不把异常抛给事件循环。
 */
export function safeRun(fn, label = '操作') {
  try {
    return fn();
  } catch (e) {
    report(`${label}失败`, e);
    return undefined;
  }
}
