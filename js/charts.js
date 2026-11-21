/** 手写 SVG 图表，零依赖 */

const NS = 'http://www.w3.org/2000/svg';

export function svg(w, h) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  s.setAttribute('width', w);
  s.setAttribute('height', h);
  s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return s;
}

function el(tag, attrs, parent, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) {
    const v = attrs[k];
    // fill="var(--x)" 这种作为 SVG 属性不生效，得写进 style；这样切主题时颜色会自己跟着变
    if (typeof v === 'string' && v.indexOf('var(') >= 0) e.style.setProperty(k, v);
    else e.setAttribute(k, v);
  }
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** 24 小时极坐标环 */
export function clockRing(values, opts) {
  const o = Object.assign({ size: 420, min: 0, max: 0, color: null, centerValue: '', centerLabel: '' }, opts || {});
  const s = svg(o.size, o.size);
  const c = o.size / 2, r0 = o.size * 0.17, r1 = o.size * 0.43;
  const vals = values.filter(v => v > 0 && isFinite(v));
  const lo = o.min != null ? o.min : Math.min.apply(null, vals);
  const hi = o.max != null ? o.max : Math.max.apply(null, vals);
  for (let i = 0; i < 24; i++) {
    const v = values[i];
    if (!(v > 0) || !isFinite(v)) continue;
    const a0 = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 0.88) / 24) * Math.PI * 2 - Math.PI / 2;
    const r = r0 + Math.max(0.02, Math.min(1, (v - lo) / (hi - lo || 1))) * (r1 - r0);
    const p = (a, rr) => [c + Math.cos(a) * rr, c + Math.sin(a) * rr];
    const [x0, y0] = p(a0, r0), [x1, y1] = p(a0, r), [x2, y2] = p(a1, r), [x3, y3] = p(a1, r0);
    const fill = o.color ? o.color(v, lo, hi) : 'var(--green)';
    el('path', {
      d: 'M' + x0 + ' ' + y0 + ' L' + x1 + ' ' + y1 +
         ' A' + r + ' ' + r + ' 0 0 1 ' + x2 + ' ' + y2 +
         ' L' + x3 + ' ' + y3 + ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + x0 + ' ' + y0 + ' Z',
      fill, opacity: 0.88,
    }, s);
  }
  el('circle', { cx: c, cy: c, r: r0 - 1, fill: 'none', stroke: 'var(--axis)' }, s);
  if (o.centerValue) el('text', { x: c, y: c - 4, 'text-anchor': 'middle', fill: 'var(--strong)', 'font-size': o.size * 0.085, 'font-weight': 800 }, s, o.centerValue);
  if (o.centerLabel) el('text', { x: c, y: c + o.size * 0.055, 'text-anchor': 'middle', fill: 'var(--axis-text)', 'font-size': o.size * 0.032 }, s, o.centerLabel);
  for (let h = 0; h < 24; h += 3) {
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
    el('text', {
      x: c + Math.cos(a) * (r1 + o.size * 0.055),
      y: c + Math.sin(a) * (r1 + o.size * 0.055) + 4,
      'text-anchor': 'middle', fill: 'var(--axis-text)', 'font-size': o.size * 0.03,
    }, s, h + '时');
  }
  return s;
}

/** 竖直柱状图 */
export function bars(values, opts) {
  const o = Object.assign({ w: 900, h: 180, color: 'var(--amber)', pad: 28, labels: true }, opts || {});
  const s = svg(o.w, o.h);
  const n = values.length;
  const bw = (o.w - o.pad * 2) / n;
  const max = Math.max.apply(null, values) || 1;
  values.forEach((v, i) => {
    const bh = (v / max) * (o.h - o.pad * 2);
    el('rect', {
      x: o.pad + i * bw + bw * 0.12, y: o.h - o.pad - bh,
      width: Math.max(1, bw * 0.76), height: Math.max(0, bh),
      fill: typeof o.color === 'function' ? o.color(v, max) : o.color,
      rx: 2, opacity: 0.9,
    }, s);
  });
  el('line', { x1: o.pad, y1: o.h - o.pad, x2: o.w - o.pad, y2: o.h - o.pad, stroke: 'var(--axis)' }, s);
  if (o.labels) {
    const lf = o.labelFmt || (i => String(i));
    [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(n * 3 / 4), n - 1].forEach(i => {
      el('text', { x: o.pad + i * bw + bw / 2, y: o.h - 8, 'text-anchor': 'middle', fill: 'var(--axis-text)', 'font-size': 11 }, s, lf(i));
    });
  }
  return s;
}

/** 折线图，points = [[label, value], ...] */
export function line(points, opts) {
  const o = Object.assign({ w: 900, h: 220, color: 'var(--green)', pad: 34, fill: true, minPad: 2 }, opts || {});
  const s = svg(o.w, o.h);
  if (!points.length) return s;
  const ys = points.map(p => p[1]);
  const lo = Math.min.apply(null, ys) - o.minPad;
  const hi = Math.max.apply(null, ys) + o.minPad;
  const X = i => o.pad + (i / Math.max(1, points.length - 1)) * (o.w - o.pad * 2);
  const Y = v => o.h - o.pad - ((v - lo) / (hi - lo || 1)) * (o.h - o.pad * 2);
  // 刻度位数跟着量级走：上楼速度这种 0.2–0.5 的值域，四舍五入到整数会变成一排 0
  const span = hi - lo;
  const dig = span >= 20 ? 0 : span >= 1.5 ? 1 : 2;
  for (let g = 0; g < 4; g++) {
    const v = lo + span * g / 3;
    el('line', { x1: o.pad, y1: Y(v), x2: o.w - o.pad, y2: Y(v), stroke: 'var(--axis)' }, s);
    el('text', { x: o.pad - 6, y: Y(v) + 4, 'text-anchor': 'end', fill: 'var(--axis-text)', 'font-size': 10 }, s, v.toFixed(dig));
  }
  let d = '';
  points.forEach((p, i) => { d += (i ? ' L' : 'M') + X(i) + ' ' + Y(p[1]); });
  if (o.fill) {
    el('path', { d: d + ' L' + X(points.length - 1) + ' ' + (o.h - o.pad) + ' L' + X(0) + ' ' + (o.h - o.pad) + ' Z', fill: o.color, opacity: 0.12 }, s);
  }
  el('path', { d, fill: 'none', stroke: o.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, s);
  const first = points[0][0], last = points[points.length - 1][0];
  el('text', { x: o.pad, y: o.h - 8, fill: 'var(--axis-text)', 'font-size': 10 }, s, first);
  el('text', { x: o.w - o.pad, y: o.h - 8, 'text-anchor': 'end', fill: 'var(--axis-text)', 'font-size': 10 }, s, last);
  return s;
}

/** 横向条形：items = [{name, value, sub}] */
export function hbars(items, opts) {
  const o = Object.assign({ w: 900, rowH: 38, color: 'var(--blue)', maxItems: 10, labelW: 190 }, opts || {});
  const list = items.slice(0, o.maxItems);
  const h = list.length * o.rowH + 10;
  const s = svg(o.w, h);
  const max = Math.max.apply(null, list.map(i => i.value)) || 1;
  const barW = o.w - o.labelW - 78;
  list.forEach((it, i) => {
    const y = 5 + i * o.rowH;
    el('rect', { x: 0, y, width: o.w, height: o.rowH - 6, rx: 6, fill: 'var(--row-bg)' }, s);
    const bw = Math.max(2, (it.value / max) * barW);
    el('rect', { x: o.labelW, y: y + 7, width: bw, height: o.rowH - 20, rx: 4, fill: o.color, opacity: 0.75 }, s);
    const nm = it.name.length > 20 ? it.name.slice(0, 19) + '…' : it.name;
    el('text', { x: 10, y: it.sub ? y + 16 : y + 23, fill: 'var(--row-text)', 'font-size': 12.5 }, s, nm);
    if (it.sub) el('text', { x: 10, y: y + 29, fill: 'var(--row-sub)', 'font-size': 10.5 }, s, it.sub);
    el('text', {
      x: o.labelW + barW + 8, y: it.sub ? y + 24 : y + 24,
      fill: 'var(--value-text)', 'font-size': 11, 'text-anchor': 'start',
    }, s, it.valueText != null ? String(it.valueText) : String(it.value));
  });
  return s;
}

/**
 * 横向条形（HTML 版）。SVG 版在手机上是整体缩放的，900 宽的 viewBox 压到 340 显示时
 * 12.5px 的字会变成 4.7px；这版直接排成 div，字是真字号，窄屏能自己换行。
 */
export function hbarsHTML(items, opts) {
  // base：窄区间的数据（比如各星期平均心率都在 79–88）从 0 起画会全是一样长，得从 min 起
  const o = Object.assign({ maxItems: 10, color: 'var(--blue)', labelW: 150, base: 0 }, opts || {});
  const list = items.slice(0, o.maxItems);
  const max = Math.max.apply(null, list.map(i => i.value)) || 1;
  const lo = o.base || 0;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return '<div class="hbars" style="--lab:' + o.labelW + 'px">' + list.map(it => {
    const w = Math.max(2, ((it.value - lo) / ((max - lo) || 1)) * 100).toFixed(1);
    return '<div class="hrow">' +
        '<b class="hname" title="' + esc(it.name) + '">' + esc(it.name) + '</b>' +
        '<div class="hbar"><i style="width:' + w + '%;background:' + o.color + '"></i></div>' +
        '<span class="hval">' + esc(it.valueText != null ? it.valueText : it.value) + '</span>' +
        (it.sub ? '<span class="hsub">' + esc(it.sub) + '</span>' : '') +
      '</div>';
  }).join('') + '</div>';
}

/** 环形占比：parts = [{name, value, color}] */
export function donut(parts, opts) {
  const o = Object.assign({ size: 220, hole: 0.62 }, opts || {});
  const s = svg(o.size, o.size);
  const c = o.size / 2, R = o.size * 0.44, r = R * o.hole;
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  let ang = -Math.PI / 2;
  parts.forEach(p => {
    const sweep = (Math.max(0, p.value) / total) * Math.PI * 2;
    if (sweep <= 0) return;
    const a0 = ang, a1 = ang + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const x0 = c + Math.cos(a0) * R, y0 = c + Math.sin(a0) * R;
    const x1 = c + Math.cos(a1) * R, y1 = c + Math.sin(a1) * R;
    const x2 = c + Math.cos(a1) * r, y2 = c + Math.sin(a1) * r;
    const x3 = c + Math.cos(a0) * r, y3 = c + Math.sin(a0) * r;
    el('path', {
      d: 'M' + x0 + ' ' + y0 + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
         ' L' + x2 + ' ' + y2 + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + x3 + ' ' + y3 + ' Z',
      fill: p.color, opacity: 0.9,
    }, s);
    ang = a1;
  });
  return s;
}

/** 日历热力图：days = [['YYYY-MM-DD', value], ...] */
export function calendar(days, opts) {
  const o = Object.assign({ cell: 11, gap: 2.6, color: 'var(--tile)', min: 0, max: 0 }, opts || {});
  const map = new Map(days);
  if (!days.length) return svg(100, 40);
  const sorted = days.map(d => d[0]).sort();
  const start = new Date((o.fixedYear || sorted[0]) + (o.fixedYear ? '-01-01' : '') + 'T00:00:00Z');
  const end = new Date((o.fixedYear || sorted[sorted.length - 1]) + (o.fixedYear ? '-12-31' : '') + 'T00:00:00Z');
  const cols = Math.ceil(((end - start) / 86400000 + 1) / 7) + 1;
  const s = svg(cols * (o.cell + o.gap), 7 * (o.cell + o.gap));
  // 步数这种从 0 起的量用平方根压，低值才看得见；心率区间窄，得按 min–max 线性铺开
  const hi = o.max || Math.max.apply(null, days.map(d => d[1])) || 1;
  const lo = o.min || 0;
  const norm = v => o.sqrt === false
    ? Math.max(0, Math.min(1, (v - lo) / ((hi - lo) || 1)))
    : Math.min(1, Math.sqrt(v / hi));
  let d = new Date(start);
  let col = 0, row = start.getUTCDay();
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    const v = map.get(key) || 0;
    const t = v ? norm(v) : 0;
    el('rect', {
      x: col * (o.cell + o.gap), y: row * (o.cell + o.gap),
      width: o.cell, height: o.cell, rx: 2,
      fill: v ? o.color : 'var(--empty)',
      'fill-opacity': v ? (0.14 + 0.86 * t).toFixed(2) : 1,
    }, s);
    d.setUTCDate(d.getUTCDate() + 1);
    row++;
    if (row > 6) { row = 0; col++; }
  }
  return s;
}

/** 按年分组的日历热力图，一年一行，行内是 53 周 × 7 天 */
export function calendarYears(days, opts) {
  const wrap = document.createElement('div');
  wrap.className = 'cal-years';
  const byYear = new Map();
  days.forEach(d => {
    const y = d[0].slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(d);
  });
  [...byYear.keys()].sort().forEach(y => {
    const row = document.createElement('div');
    row.className = 'cal-row';
    const lab = document.createElement('span');
    lab.className = 'cal-y';
    lab.textContent = y;
    row.appendChild(lab);
    row.appendChild(calendar(byYear.get(y), Object.assign({}, opts, { fixedYear: y })));
    wrap.appendChild(row);
  });
  return wrap;
}

/** 睡眠带：nights = [{d, asleep, bed, wake, deep, rem}] */
export function sleepBands(nights, opts) {
  const o = Object.assign({ w: 900, h: 260, padL: 44, padB: 26 }, opts || {});
  const s = svg(o.w, o.h);
  const list = nights.filter(n => n.asleep > 0.5);
  if (!list.length) return s;
  const toH = t => { const a = t.split(':'); return (+a[0]) + (+a[1]) / 60; };
  const shift = hh => (hh + 12) % 24;
  const T = d => new Date(d + 'T00:00:00Z').getTime();
  const t0 = T(list[0].d), t1 = T(list[list.length - 1].d);
  const X = t => o.padL + (t - t0) / Math.max(1, t1 - t0) * (o.w - o.padL - 12);
  const Y = hh => o.h - o.padB - (hh / 24) * (o.h - o.padB - 10);
  const bw = Math.max(1.2, Math.min(4, (o.w - o.padL - 12) / Math.max(1, (t1 - t0) / 864e5 + 1) * 0.72));
  list.forEach(n => {
    const x = X(T(n.d));
    const a = Y(shift(toH(n.bed)));
    const b = Y(shift(toH(n.wake)));
    const top = Math.min(a, b), hgt = Math.max(1.5, Math.abs(b - a));
    el('rect', { x: x - bw / 2, y: top, width: bw, height: hgt, rx: bw / 2.6, fill: 'var(--blue)', opacity: 0.62 }, s);
  });
  [[0, '12:00'], [6, '18:00'], [12, '00:00'], [18, '06:00'], [24, '12:00']].forEach(t => {
    el('line', { x1: o.padL, y1: Y(t[0]), x2: o.w - 12, y2: Y(t[0]), stroke: 'var(--axis)' }, s);
    el('text', { x: o.padL - 8, y: Y(t[0]) + 4, 'text-anchor': 'end', fill: 'var(--axis-text)', 'font-size': 10 }, s, t[1]);
  });
  return s;
}

/** 直方图 */
export function histogram(hist, opts) {
  const o = Object.assign({ w: 900, h: 180, min: 30, bin: 5, color: 'var(--red)' }, opts || {});
  const s = svg(o.w, o.h);
  const max = Math.max.apply(null, hist) || 1;
  const bw = (o.w - 40) / hist.length;
  hist.forEach((v, i) => {
    const bh = (v / max) * (o.h - 50);
    el('rect', {
      x: 20 + i * bw, y: o.h - 28 - bh, width: Math.max(1, bw - 1.5), height: bh,
      fill: o.color, opacity: 0.75, rx: 1.5,
    }, s);
  });
  el('line', { x1: 20, y1: o.h - 28, x2: o.w - 20, y2: o.h - 28, stroke: 'var(--axis)' }, s);
  for (let i = 0; i < hist.length; i += 6) {
    el('text', { x: 20 + i * bw, y: o.h - 10, 'text-anchor': 'middle', fill: 'var(--axis-text)', 'font-size': 10 }, s, String(o.min + i * o.bin));
  }
  return s;
}

/** 一天 24 小时横着摊开：睡眠带 + 心率折线 + 能量柱，共用一条时间轴 */
export function dayStrip(hourly, opts) {
  const o = Object.assign({ w: 900, h: 240, padL: 34, padR: 16 }, opts || {});
  const s = svg(o.w, o.h);
  const hr = (hourly.hr || []).map(v => (isFinite(v) ? v : 0));
  const en = hourly.energy || [];
  const top = 26, bot = o.h - 26;
  const innerW = o.w - o.padL - o.padR;
  const X = hh => o.padL + (hh / 24) * innerW;
  const hrv = hr.filter(v => v > 0);
  if (!hrv.length) return s;
  const lo = Math.min.apply(null, hrv) - 2;
  const hi = Math.max.apply(null, hrv) + 2;
  const Y = v => bot - ((v - lo) / (hi - lo || 1)) * (bot - top);

  // 睡觉的那一段：跨午夜就画成两截，不然带宽会横穿整天
  if (hourly.bed != null && hourly.wake != null) {
    const band = (x0, x1) => el('rect', {
      x: X(x0), y: top, width: Math.max(0, X(x1) - X(x0)), height: bot - top,
      fill: 'var(--violet)', opacity: 0.1,
    }, s);
    if (hourly.bed < hourly.wake) band(hourly.bed, hourly.wake);
    else { band(hourly.bed, 24); band(0, hourly.wake); }
  }

  // 活动能量：贴着底部的矮柱，只当背景强度用
  const enMax = Math.max.apply(null, en.concat([1]));
  en.forEach((v, i) => {
    if (!(v > 0)) return;
    const bh = (v / enMax) * (bot - top) * 0.32;
    el('rect', {
      x: X(i) + 1.5, y: bot - bh, width: Math.max(1, innerW / 24 - 3), height: bh,
      fill: 'var(--amber)', opacity: 0.26, rx: 2,
    }, s);
  });

  for (let h = 0; h <= 24; h += 6) {
    el('line', { x1: X(h), y1: top, x2: X(h), y2: bot, stroke: 'var(--axis)' }, s);
    el('text', { x: X(h), y: o.h - 8, 'text-anchor': h === 0 ? 'start' : h === 24 ? 'end' : 'middle', fill: 'var(--axis-text)', 'font-size': 11 }, s, h + '时');
  }
  // 心率刻度：光看形状不知道在什么水平上
  for (let g = 0; g < 4; g++) {
    const v = lo + (hi - lo) * g / 3;
    el('line', { x1: o.padL, y1: Y(v), x2: o.w - o.padR, y2: Y(v), stroke: 'var(--axis)', opacity: 0.55 }, s);
    el('text', { x: o.padL - 6, y: Y(v) + 4, 'text-anchor': 'end', fill: 'var(--axis-text)', 'font-size': 10 }, s, String(Math.round(v)));
  }

  let d = '';
  hr.forEach((v, i) => { if (v > 0) d += (d ? ' L' : 'M') + (X(i) + innerW / 48) + ' ' + Y(v); });
  el('path', { d, fill: 'none', stroke: 'var(--green)', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, s);

  // 只标最高和最低各一个点，多了会糊
  const iMin = hr.indexOf(Math.min.apply(null, hrv));
  const iMax = hr.indexOf(Math.max.apply(null, hrv));
  [[iMin, -1], [iMax, 1]].forEach(pair => {
    const i = pair[0], dir = pair[1];
    const v = hr[i];
    if (!(v > 0)) return;
    const x = X(i) + innerW / 48, y = Y(v);
    el('circle', { cx: x, cy: y, r: 3.4, fill: 'var(--green)' }, s);
    const bx = Math.min(o.w - o.padR - 46, Math.max(o.padL + 2, x - 34));
    el('text', { x: bx, y: dir > 0 ? y - 9 : y + 16, fill: 'var(--row-text)', 'font-size': 11, 'font-weight': 600 }, s, i + '时 ' + Math.round(v));
  });
  return s;
}

/** 两条线叠一张图（月度作息：入睡 / 起床共用同一条时间轴） */
export function dualLine(series, opts) {
  const o = Object.assign({ w: 900, h: 210, pad: 40, minPad: 0.4, tickFmt: null }, opts || {});
  const s = svg(o.w, o.h);
  const all = series.reduce((a, sr) => a.concat(sr.points.map(p => p[1])), []);
  if (!all.length) return s;
  const lo = Math.min.apply(null, all) - o.minPad;
  const hi = Math.max.apply(null, all) + o.minPad;
  const n = series[0].points.length;
  const X = i => o.pad + (i / Math.max(1, n - 1)) * (o.w - o.pad * 2);
  const Y = v => o.h - o.pad - ((v - lo) / (hi - lo || 1)) * (o.h - o.pad * 2);
  const span = hi - lo;
  const dig = span >= 20 ? 0 : span >= 1.5 ? 1 : 2;
  for (let g = 0; g < 4; g++) {
    const v = lo + span * (0.07 + 0.86 * g / 3);
    el('line', { x1: o.pad, y1: Y(v), x2: o.w - o.pad, y2: Y(v), stroke: 'var(--axis)', opacity: 0.7 }, s);
    el('text', { x: o.pad - 6, y: Y(v) + 4, 'text-anchor': 'end', fill: 'var(--axis-text)', 'font-size': 10 }, s,
      o.tickFmt ? o.tickFmt(v) : v.toFixed(dig));
  }
  // 两条线之间的那块就是「睡着的时长」，面积变窄就是觉被压掉了
  if (o.band && series.length === 2) {
    let d = '';
    series[0].points.forEach((p, i) => { d += (i ? ' L' : 'M') + X(i) + ' ' + Y(p[1]); });
    for (let i = n - 1; i >= 0; i--) d += ' L' + X(i) + ' ' + Y(series[1].points[i][1]);
    el('path', { d: d + ' Z', fill: series[0].color, opacity: 0.1 }, s);
  }
  series.forEach(sr => {
    let d = '';
    sr.points.forEach((p, i) => { d += (i ? ' L' : 'M') + X(i) + ' ' + Y(p[1]); });
    el('path', { d, fill: 'none', stroke: sr.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, s);
    sr.points.forEach((p, i) => el('circle', { cx: X(i), cy: Y(p[1]), r: 3, fill: sr.color }, s));
  });
  el('text', { x: o.pad, y: o.h - 10, fill: 'var(--axis-text)', 'font-size': 10 }, s, series[0].points[0][0]);
  el('text', { x: o.w - o.pad, y: o.h - 10, 'text-anchor': 'end', fill: 'var(--axis-text)', 'font-size': 10 }, s, series[0].points[n - 1][0]);
  return s;
}

