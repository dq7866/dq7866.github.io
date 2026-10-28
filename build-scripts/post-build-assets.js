'use strict';

// Hexo 的 copyDir 对大量小文件使用无上限并发，Windows 下会触发 EMFILE。
// 这里把大体积音频目录排除出 Hexo，再用受控并发复制到 public。
// 由 npm run build 在 hexo generate 之后调用。

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const JOBS = [
  ['source/forest/assets/audio', 'public/forest/assets/audio']
];
const CONCURRENCY = 16;

async function collect(dir, rel, out) {
  const handle = await fs.promises.opendir(dir);
  for await (const entry of handle) {
    const abs = path.join(dir, entry.name);
    const next = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      await collect(abs, next, out);
    } else if (entry.isFile()) {
      out.push([abs, next]);
    }
  }
}

async function copyJob(srcRel, destRel) {
  const src = path.join(ROOT, srcRel);
  const dest = path.join(ROOT, destRel);

  if (!fs.existsSync(src)) {
    console.log('[assets] skip, not found: %s', srcRel);
    return;
  }

  const files = [];
  await collect(src, '', files);
  await fs.promises.mkdir(dest, { recursive: true });

  let index = 0;
  let copied = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < files.length) {
      const [abs, rel] = files[index++];
      const target = path.join(dest, rel);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.copyFile(abs, target);
      copied += 1;
    }
  });

  await Promise.all(workers);
  console.log('[assets] %s -> %s (%d files)', srcRel, destRel, copied);
}

(async () => {
  for (const [src, dest] of JOBS) {
    await copyJob(src, dest);
  }
})().catch(err => {
  console.error('[assets] copy failed:', err);
  process.exit(1);
});
