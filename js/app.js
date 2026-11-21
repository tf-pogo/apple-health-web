import { renderReport } from './report.js';
import { initTheme } from './theme.js';

const $ = s => document.querySelector(s);
const nf = new Intl.NumberFormat('zh-CN');

function num(v) { return nf.format(Math.round(v)); }
function bytes(b) {
  if (b > 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  return Math.round(b / 1024) + ' KB';
}

initTheme(document.getElementById('theme'));

let worker = null;
let result = null;

const ui = {
  title: $('#rtitle'),
  sub: $('#rsub'),
  tabs: $('#tabs'),
  view: $('#view'),
};

/* ---------- 接入 ---------- */

const drop = $('#drop');
const fileEl = $('#file');

drop.addEventListener('click', () => fileEl.click());
drop.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileEl.click(); }
});
fileEl.addEventListener('change', () => { if (fileEl.files[0]) start(fileEl.files[0]); });

['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => {
  e.preventDefault();
  drop.classList.add('over');
}));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => {
  e.preventDefault();
  drop.classList.remove('over');
}));
drop.addEventListener('drop', e => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) start(f);
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());

$('#again').addEventListener('click', reset);
$('#retry').addEventListener('click', reset);

function reset() {
  if (worker) { worker.terminate(); worker = null; }
  result = null;
  fileEl.value = '';
  $('#report').hidden = true;
  $('#progress').hidden = true;
  $('#error').hidden = true;
  $('#landing').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fail(msg) {
  if (worker) { worker.terminate(); worker = null; }
  $('#progress').hidden = true;
  $('#landing').hidden = true;
  $('#error').hidden = false;
  $('#emsg').textContent = msg;
}

function start(file) {
  if (!/\.zip$/i.test(file.name) && !confirm('这个文件不叫 .zip，仍然尝试解析吗？')) return;

  $('#landing').hidden = true;
  $('#error').hidden = true;
  $('#progress').hidden = false;
  $('#pbar').style.width = '3%';
  $('#pmsg').textContent = '正在读取压缩包…';
  $('#phint').textContent = file.name + ' · ' + bytes(file.size);

  if (worker) worker.terminate();
  // 用 import.meta.url 解析，页面挂在子路径（GitHub Pages 的 /repo/）时也不会 404
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

  worker.onerror = e => fail((e && e.message) || '解析线程启动失败，请换用最新版 Chrome / Edge / Safari。');

  worker.onmessage = ev => {
    const m = ev.data;
    if (m.type === 'meta') {
      $('#pmsg').textContent = '正在扫描 ' + m.xml + '（解压后 ' + bytes(m.bytes) + '）…';
    } else if (m.type === 'progress') {
      $('#pbar').style.width = Math.max(3, m.ratio * 100).toFixed(1) + '%';
      $('#phint').textContent = num(m.lines) + ' 行已解析';
    } else if (m.type === 'done') {
      if (worker) { worker.terminate(); worker = null; }
      $('#pbar').style.width = '100%';
      $('#pmsg').textContent = '读完了';
      result = m.result;
      setTimeout(showReport, 120);
    } else if (m.type === 'error') {
      fail(m.message);
    }
  };

  worker.postMessage({ file });
}

function showReport() {
  $('#progress').hidden = true;
  $('#report').hidden = false;
  renderReport(result, ui);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
