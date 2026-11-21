#!/usr/bin/env node
// 开发服务器：静态文件 + 文件一变就通知浏览器重载（SSE）。
// 和 tools/serve.mjs 的区别只有热重载，方便边改边看。
//
//   node tools/dev.mjs [port]
//
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 8777;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const clients = new Set();

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (url === '/__reload') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + url);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('http://127.0.0.1:' + port + '/preview.html');
});

// 只关心会被浏览器读到的那几类文件，避免 out/ 里的产物把自己刷成死循环
const WATCHED = /\.(html|css|js|mjs|json)$/i;
let timer = null;
fs.watch(root, { recursive: true }, (evt, name) => {
  if (!name || !WATCHED.test(name)) return;
  if (name.includes('node_modules') || name.startsWith('out' + path.sep)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    for (const c of clients) c.write('data: ' + stamp + '\n\n');
    console.log('reload ' + stamp + '  <- ' + name);
  }, 120);
});
