/* ============================================================
   Nature Lab · 即时反馈特效
   商业游戏标配的两类 juice：
   - 数字飘字：金币入账 / 大额支出，从金币 chip 或指定元素飘起
   - 屏幕震动：死亡、病害确诊、恶性事件等负反馈时的轻震

   全部尊重「减少动效」偏好：开了就直接跳过动画（逻辑不受影响）。
   ============================================================ */

let _fxLayer = null;

function fxLayer() {
  if (_fxLayer && document.body.contains(_fxLayer)) return _fxLayer;
  _fxLayer = document.getElementById('fxLayer');
  if (!_fxLayer) {
    _fxLayer = document.createElement('div');
    _fxLayer.id = 'fxLayer';
    _fxLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(_fxLayer);
  }
  return _fxLayer;
}

// 减少动效开启时特效静默跳过
function fxAllowed() {
  try { return !(typeof prefs === 'function' && prefs().reduceMotion); } catch (e) { return true; }
}

/* ---------------- 数字飘字 ---------------- */
// el: 锚点元素（默认金币 chip）；text: 飘的字；kind: good(绿/收入) | bad(红/支出) | gold(金币)
function floatText(text, kind, el) {
  if (!fxAllowed()) return;
  const layer = fxLayer();
  const anchor = el || $('#coinIcon')?.parentElement || document.querySelector('.infoChip.coin');
  if (!layer || !anchor) return;

  const r = anchor.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'floatNum ' + (kind || 'gold');
  s.textContent = text;

  // 横向错开：用递增计数器（DOM 查询在同帧内拿不到刚插入的兄弟节点）
  floatText._seq = (floatText._seq || 0) + 1;
  const slot = floatText._seq % 4;              // 0..3 四个槽位轮流
  const offset = [0, -34, 34, -17][slot];
  s.style.left = (r.left + r.width / 2 + offset) + 'px';
  // 从 chip 下沿再往下 8px 起步，确保不压住数字本身
  s.style.top = (r.bottom + 8) + 'px';
  layer.appendChild(s);
  setTimeout(() => s.remove(), 1400);
}

// 金币入账/支出便捷封装：+123 金币 / -45 金币
function floatCoins(delta) {
  if (!delta) return;
  const n = Math.round(delta);
  if (n === 0) return;
  floatText((n > 0 ? '+' : '−') + Math.abs(n), n > 0 ? 'good' : 'bad');
}

// 在任意元素上飘字（如收获 Modal 上的品质分）
function floatAt(el, text, kind) {
  if (el) floatText(text, kind, el);
}

/* ---------------- 屏幕震动 ---------------- */
let _shakeTimer = null;
// strength: 'sm' 轻震（病害/坏事件） | 'lg' 重震（死亡）
function shakeScreen(strength) {
  if (!fxAllowed()) return;
  const app = document.querySelector('.app');
  if (!app) return;
  // 连续触发时先复位再重震，避免类名叠加
  app.classList.remove('shake-sm', 'shake-lg');
  void app.offsetWidth;   // 强制 reflow，让动画重放
  app.classList.add(strength === 'lg' ? 'shake-lg' : 'shake-sm');
  clearTimeout(_shakeTimer);
  _shakeTimer = setTimeout(() => app.classList.remove('shake-sm', 'shake-lg'),
    strength === 'lg' ? 560 : 380);
}
