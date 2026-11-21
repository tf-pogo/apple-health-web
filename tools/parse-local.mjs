#!/usr/bin/env node
// 在 Node 里跑一遍浏览器用的同一套解析代码，把导出包变成 report.json。
// 用途：不开浏览器也能核对数字，或者给静态页面做预生成数据。
//
//   node tools/parse-local.mjs path/to/导出.zip [out.json]
//
import fs from 'node:fs';
import path from 'node:path';
import { openZip } from '../js/zip.js';
import { lines } from '../js/parse.js';
import { createAggregator, feedLine, finalize } from '../js/analyze.js';

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('用法: node tools/parse-local.mjs <导出.zip> [out.json]');
  process.exit(1);
}
const outPath = process.argv[3] || path.join('out', 'report.json');

const t0 = Date.now();
const buf = fs.readFileSync(zipPath);
const z = await openZip(new Blob([buf]));
const entry = z.find('导出.xml') || z.find('export.xml') || z.findAll(/\.xml$/).find(e => !/cda/i.test(e.name));
if (!entry) {
  console.error('压缩包里没找到 导出.xml。iOS 16 之后文件名可能是 导出.xml，之前是 export.xml。');
  process.exit(1);
}

const agg = createAggregator();
let n = 0;
for await (const line of lines(await z.stream(entry))) {
  n++;
  feedLine(agg, line);
}
const r = finalize(agg);
r.meta = { zipBytes: buf.length, entries: z.entries.length, xml: entry.name, lines: n, ms: Date.now() - t0 };

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(r));
console.log('写入 ' + outPath + '（' + (JSON.stringify(r).length / 1024).toFixed(0) + ' KB）');
console.log('扫描 ' + n.toLocaleString() + ' 行，用时 ' + (r.meta.ms / 1000).toFixed(1) + ' 秒');
console.log('记录 ' + Object.values(r.counts).reduce((a, b) => a + b, 0).toLocaleString() + ' 条 / ' + r.hr.day.length + ' 天有数据');
