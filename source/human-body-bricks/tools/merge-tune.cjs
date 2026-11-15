const fs = require('fs');
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const imgs = [0, 1, 2, 3].map(i => fs.readFileSync('review/eye-tune-' + i + '.png').toString('base64'));
  const html = '<body style="margin:0;display:flex;background:#222">' + imgs.map((d, i) =>
    '<div style="position:relative"><img style="width:250px;display:block" src="data:image/png;base64,' + d + '">' +
    '<span style="position:absolute;top:6px;left:8px;color:#fff;font:bold 14px monospace">' + (i + 1) + '</span></div>').join('') + '</body>';
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1000, height: 520 } });
  await p.setContent(html);
  await sleep(400);
  await p.screenshot({ path: 'review/eye-tune-all.png' });
  await b.close();
  console.log('ok');
})();
