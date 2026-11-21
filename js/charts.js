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
    [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(n * 3 / 4), n - 1].forEach(i => {
      el('text', { x: o.pad + i * bw + bw / 2, y: o.h - 8, 'text-anchor': 'middle', fill: 'var(--axis-text)', 'font-size': 11 }, s, String(i));
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
  for (let g = 0; g < 4; g++) {
    const v = lo + (hi - lo) * g / 3;
    el('line', { x1: o.pad, y1: Y(v), x2: o.w - o.pad, y2: Y(v), stroke: 'var(--axis)' }, s);
    el('text', { x: o.pad - 6, y: Y(v) + 4, 'text-anchor': 'end', fill: 'var(--axis-text)', 'font-size': 10 }, s, Math.round(v));
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
  const max = o.max || Math.max.apply(null, days.map(d => d[1])) || 1;
  let d = new Date(start);
  let col = 0, row = start.getUTCDay();
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    const v = map.get(key) || 0;
    const t = v ? Math.min(1, Math.sqrt(v / max)) : 0;
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
