/**
 * 解析线程：ZIP 解压 + 逐行聚合全部在这里发生，主线程只负责画。
 * 文件通过 postMessage 结构化克隆传入（不复制字节），全程不发起网络请求。
 */
import { openZip } from './zip.js';
import { lines } from './parse.js';
import { createAggregator, feedLine, finalize } from './analyze.js';

const STEP = 4096;

self.onmessage = async (ev) => {
  const file = ev.data && ev.data.file;
  if (!file) return;
  try {
    const t0 = Date.now();
    const zip = await openZip(file);

    const entry =
      zip.find('导出.xml') ||
      zip.find('export.xml') ||
      zip.findAll(/\.xml$/i).filter(e => !/cda/i.test(e.name))[0];

    if (!entry) {
      postMessage({ type: 'error', message: '压缩包里没有找到 export.xml，这不像是「健康」App 导出的压缩包。' });
      return;
    }

    postMessage({ type: 'meta', entries: zip.entries.length, xml: entry.name, bytes: entry.size });

    const agg = createAggregator();
    let n = 0, chars = 0, last = Date.now();

    for await (const line of lines(await zip.stream(entry))) {
      n++;
      chars += line.length;
      feedLine(agg, line);
      if ((n & (STEP - 1)) === 0) {
        const now = Date.now();
        if (now - last > 90) {
          postMessage({ type: 'progress', lines: n, ratio: Math.min(0.99, chars / (entry.size || 1)) });
          last = now;
        }
        if ((n & 0x3FFFF) === 0) await new Promise(r => setTimeout(r, 0));
      }
    }

    const result = finalize(agg);
    result.meta = {
      zipBytes: file.size,
      entries: zip.entries.length,
      xml: entry.name,
      lines: n,
      ms: Date.now() - t0,
    };
    postMessage({ type: 'done', result });
  } catch (err) {
    postMessage({ type: 'error', message: (err && err.message) || String(err) });
  }
};
