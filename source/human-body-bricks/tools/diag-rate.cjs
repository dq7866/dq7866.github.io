const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 400, height: 700 } });
  await p.goto('http://127.0.0.1:8900/review/ref/src/', { waitUntil: 'load' });
  const r = await p.evaluate(async () => {
    const v = document.createElement('video');
    v.src = 'sample.mp4'; v.muted = true; v.playsInline = true;
    v.style.cssText = 'position:fixed;width:300px;left:0;top:0';
    document.body.appendChild(v);
    await new Promise(res => { v.onloadedmetadata = res; setTimeout(res, 5000); });
    await v.play();
    return new Promise(res => {
      const samples = [];
      const cb = (now, meta) => {
        samples.push({ wall: performance.now(), media: meta.mediaTime });
        if (samples.length >= 120) {
          v.pause();
          const a = samples[0], z = samples[samples.length - 1];
          res({
            duration: v.duration,
            frames: samples.length,
            wallSpan: ((z.wall - a.wall) / 1000).toFixed(2),
            mediaSpan: (z.media - a.media).toFixed(2),
            rate: ((z.media - a.media) / ((z.wall - a.wall) / 1000)).toFixed(2),
          });
        } else v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb);
      setTimeout(() => res({ timeout: true, n: samples.length }), 12000);
    });
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
