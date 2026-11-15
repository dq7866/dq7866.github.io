const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 760, height: 1100 } });
  await page.goto('http://127.0.0.1:8900/review/ref/src/', { waitUntil: 'load' });
  const list = process.argv.slice(2);
  for (const [tag, url] of list.map(s => s.split('='))) {
    const info = await page.evaluate(async (url) => {
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      document.body.style.background = '#000';
      const v = document.createElement('video');
      v.src = url; v.muted = true; v.crossOrigin = 'anonymous';
      v.style.cssText = 'display:block;width:760px;height:auto';
      document.body.appendChild(v);
      await new Promise((res) => { v.onloadedmetadata = res; v.onerror = res; setTimeout(res, 9000); });
      return { dur: v.duration, w: v.videoWidth, h: v.videoHeight, err: v.error ? v.error.code : 0 };
    }, url);
    console.log(tag, JSON.stringify(info));
    if (!info.w) continue;
    const dur = (process.env.VIDDUR ? parseFloat(process.env.VIDDUR) : (info.dur || 10)), n = 9;
    for (let i = 0; i < n; i++) {
      const t = dur * (i + 0.5) / n;
      await page.evaluate(async (t) => {
        const v = document.querySelector('video');
        await new Promise(res => { const d = () => { v.removeEventListener('seeked', d); res(); }; v.addEventListener('seeked', d); v.currentTime = t; setTimeout(res, 3000); });
      }, t);
      await page.waitForTimeout(250);
      const h = Math.round(info.h * (760 / info.w));
      await page.screenshot({ path: `review/ref/${tag}-${String(i).padStart(2,'0')}.png`, clip: { x: 0, y: 0, width: 760, height: h } });
      console.log('shot', tag, i, 't=' + t.toFixed(2), h);
    }
  }
  await browser.close();
})();
