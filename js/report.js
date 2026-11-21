import * as C from './charts.js';
import { pick, spanOf, PRESETS } from './range.js';

// SVG 是整体缩放的：viewBox 900 压到手机 332 显示时，10px 的字只剩 3.7px。
// 所以窄屏改用接近真实宽度的小画布，元素重排、字号不变。
const NARROW = typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches;
const CW = NARROW ? 360 : 900;
const CH = k => (NARROW ? Math.round(k * 1.35) : k);   // 窄屏给高一点，形状别被压扁

const nf = new Intl.NumberFormat('zh-CN');
function num(v) { return nf.format(Math.round(v)); }
function dec(v, d) { return (+v).toFixed(d == null ? 1 : d); }
function bytes(b) { if (b > 1073741824) return dec(b / 1073741824) + ' GB'; if (b > 1048576) return dec(b / 1048576) + ' MB'; return Math.round(b / 1024) + ' KB'; }
function hm(hours) { const h = Math.floor(hours), m = Math.round((hours - h) * 60); return h + ' 小时 ' + m + ' 分'; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mount(sel, node) {
  const h = document.querySelector(sel);
  if (!h || node == null) return;
  if (typeof node === 'string') h.innerHTML = node;
  else h.appendChild(node);
}
/** 日期加减（UTC 天数），YYYY-MM-DD 进、YYYY-MM-DD 出 */
function shiftDay(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * 紧挨着当前范围的等长上一段，用来做「比上一段 ±%」。
 * 超出数据起点、或者当前就是全量，就返回 null（那没有可比的对象）。
 */
function prevPick() {
  if (!SRC || !RANGE || !RANGE.from || !RANGE.to) return null;
  const len = Math.round((new Date(RANGE.to + 'T00:00:00Z') - new Date(RANGE.from + 'T00:00:00Z')) / 86400000) + 1;
  const to2 = shiftDay(RANGE.from, -1);
  const from2 = shiftDay(to2, -(len - 1));
  if (SRC.firstDate && from2 < SRC.firstDate) return null;
  try { return pick(SRC, from2, to2); } catch (e) { return null; }
}

/** 涨跌百分比，带符号；基数太小或缺失时不显示 */
function delta(cur, prev) {
  if (!prev || !isFinite(prev) || prev <= 0) return '';
  const p = (cur - prev) / prev * 100;
  if (!isFinite(p) || Math.abs(p) < 0.5) return '与上一段持平';
  // 数卡只有一百多像素宽，写「比上一段 +9%」会顶到第二行，用箭头
  return (p > 0 ? '↑ ' : '↓ ') + Math.abs(p).toFixed(0) + '% 较上一段';
}

const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 把 [[日期, 值]] 按星期几分组求平均，周一到周日排序 */
function byWeekday(days) {
  const sum = new Array(7).fill(0), n = new Array(7).fill(0);
  days.forEach(([d, v]) => {
    const i = new Date(d + 'T00:00:00Z').getUTCDay();
    sum[i] += v; n[i]++;
  });
  return [1, 2, 3, 4, 5, 6, 0].map(i => ({
    name: WD[i],
    value: n[i] ? +(sum[i] / n[i]).toFixed(1) : 0,
    n: n[i],
  }));
}

/** 一天切成六段，返回每段的采样占比与均值 */
const PARTS = [
  ['凌晨 0–6', 0, 6], ['早晨 6–9', 6, 9], ['上午 9–12', 9, 12],
  ['下午 12–18', 12, 18], ['晚上 18–22', 18, 22], ['深夜 22–24', 22, 24],
];
function byPart(hourN, hourAvg) {
  const total = hourN.reduce((a, b) => a + b, 0) || 1;
  return PARTS.map(([name, a, b]) => {
    let cnt = 0, wsum = 0;
    for (let i = a; i < b; i++) { cnt += hourN[i] || 0; wsum += (hourN[i] || 0) * (hourAvg[i] || 0); }
    return { name, cnt, share: cnt / total, avg: cnt ? wsum / cnt : 0 };
  });
}

/** 把「口径 · 同比」拼成一句小字，空的自动丢掉 */
const e1 = arr => arr.filter(Boolean).join(' · ');

function stat(v, label, sub, refHTML) {
  return '<div class="stat"><b>' + v + '</b><span>' + label + '</span>' +
    (sub ? '<small>' + sub + '</small>' : '') + (refHTML || '') + '</div>';
}

/**
 * 参考区间。lo–hi 是「一般成人」的常见范围，不是诊断标准，
 * 也不是给某个人的处方 —— 只用来给数字一个横向参照。
 * soft: true 表示学界没有统一阈值（比如 HRV），标签改成「常见区间」。
 */
const REFS = {
  rhr:     { lo: 60, hi: 100, min: 40, max: 120, unit: 'bpm', part: '静息心率' },
  hrv:     { lo: 20, hi: 100, min: 0, max: 160, unit: 'ms', soft: true },
  spo2:    { lo: 95, hi: 100, min: 88, max: 100, unit: '%' },
  sleep:   { lo: 7, hi: 9, min: 3, max: 12, unit: '小时', dec: 1 },
  deep:    { lo: 13, hi: 23, min: 0, max: 40, unit: '%' },
  rem:     { lo: 20, hi: 25, min: 0, max: 40, unit: '%' },
  steps:   { lo: 7000, hi: 12000, min: 1500, max: 18000, unit: '步' },
  volume:  { lo: 40, hi: 70, min: 30, max: 95, unit: 'dB' },
  speed:   { lo: 3.6, hi: 6.5, min: 2, max: 8, unit: 'km/h', dec: 1 },
  steplen: { lo: 60, hi: 80, min: 40, max: 95, unit: 'cm' },
  dbl:     { lo: 20, hi: 35, min: 10, max: 50, unit: '%' },
  asym:    { lo: 0, hi: 5, min: 0, max: 12, unit: '%' },
  steady:  { lo: 95, hi: 100, min: 70, max: 100, unit: '%' },
  sixmw:   { lo: 400, hi: 700, min: 200, max: 800, unit: 'm' },
  awake:   { lo: 0, hi: 0.5, min: 0, max: 1.2, unit: '小时', dec: 2 },
};

/** 数卡下面的那条：一段参考区间 + 当前值落在哪儿 */
function sref(key, v) {
  const f = REFS[key];
  if (!f || !isFinite(v) || v < 0) return '';
  const span = (f.max - f.min) || 1;
  const at = x => Math.max(0, Math.min(100, (x - f.min) / span * 100));
  const d = f.dec == null ? 0 : f.dec;
  // 边界留 5% 容差：REM 25.3% 对着「20–25」标成偏高太苛刻了
  const tol = 0.05;
  const st = v < f.lo * (1 - tol) ? 'low' : v > f.hi * (1 + tol) ? 'high' : 'ok';
  const lab = f.soft
    ? (st === 'ok' ? '常见区间' : st === 'low' ? '偏下' : '偏上')
    : (st === 'ok' ? '正常' : st === 'low' ? '偏低' : '偏高');
  const loP = at(f.lo), hiP = at(f.hi);
  return '<div class="ref">' +
    '<div class="refbar">' +
      '<i class="rl" style="width:' + loP.toFixed(1) + '%"></i>' +
      '<i class="ro" style="width:' + Math.max(0, hiP - loP).toFixed(1) + '%"></i>' +
      '<i class="rh" style="width:' + Math.max(0, 100 - hiP).toFixed(1) + '%"></i>' +
      '<b style="--p:' + at(v).toFixed(3) + '%"></b>' +
    '</div>' +
    '<div class="reft"><span>' + f.lo.toFixed(d) + '–' + f.hi.toFixed(d) + ' ' + f.unit + '</span>' +
      '<em class="' + st + '">' + lab + '</em></div>' +
  '</div>';
}
function card(title, sub, body, note) { return '<div class="card"><h3>' + title + (sub ? ' <span>' + sub + '</span>' : '') + '</h3>' + body + (note ? '<p class="note">' + note + '</p>' : '') + '</div>'; }

/** 在 byDay 里找出某个字段最大/最小的那天。minV 用来剔除「那天没记」的 0 */
function dayPeak(byDay, key, dir, minV) {
  const floor = minV === undefined ? 1e-9 : minV;
  let best = null;
  for (const d in byDay) {
    const v = byDay[d][key];
    if (!(v > floor)) continue;
    if (!best || (dir === 'max' ? v > best.v : v < best.v)) best = { d: d, v: v };
  }
  return best;
}

/** 极值小卡：值 + 单位 + 一句话 + 日期。和「换个说法」共用 .fact 样式，
 *  items 每项是 [值, 单位, 名字, 日期] */
function factsHTML(items) {
  return '<div class="facts">' + items.map(x =>
    '<div class="fact">' +
      '<div class="fv">' + esc(x[0]) + (x[1] ? '<span class="fu">' + esc(x[1]) + '</span>' : '') + '</div>' +
      '<div class="fk">' + esc(x[2]) + '</div>' +
      '<div class="fs">' + esc(x[3] || '—') + '</div>' +
    '</div>').join('') + '</div>';
}
function table(head, rows, opts) {
  const tight = opts && opts.tight ? ' tight' : '';
  let h = '<div class="table-wrap"><table class="data' + tight + '"><thead><tr>' + head.map(x => '<th' + (x[1] ? ' class="' + x[1] + '"' : '') + '>' + x[0] + '</th>').join('') + '</tr></thead><tbody>';
  rows.forEach(r => { h += '<tr>' + r.map((c, i) => '<td' + (head[i] && head[i][1] ? ' class="' + head[i][1] + '"' : '') + '>' + c + '</td>').join('') + '</tr>'; });
  return h + '</tbody></table></div>';
}

const LABEL = {
  HKQuantityTypeIdentifierHeartRate: '心率',
  HKQuantityTypeIdentifierRestingHeartRate: '静息心率',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: '心率变异性',
  HKQuantityTypeIdentifierWalkingHeartRateAverage: '步行心率均值',
  HKQuantityTypeIdentifierOxygenSaturation: '血氧',
  HKQuantityTypeIdentifierRespiratoryRate: '呼吸频率',
  HKQuantityTypeIdentifierStepCount: '步数',
  HKQuantityTypeIdentifierDistanceWalkingRunning: '步行/跑步距离',
  HKQuantityTypeIdentifierDistanceCycling: '骑行距离',
  HKQuantityTypeIdentifierActiveEnergyBurned: '活动能量',
  HKQuantityTypeIdentifierBasalEnergyBurned: '静息能量',
  HKQuantityTypeIdentifierFlightsClimbed: '爬楼层数',
  HKQuantityTypeIdentifierAppleExerciseTime: '运动分钟',
  HKQuantityTypeIdentifierAppleStandTime: '站立时间',
  HKQuantityTypeIdentifierHeadphoneAudioExposure: '耳机音量',
  HKQuantityTypeIdentifierEnvironmentalAudioExposure: '环境音量',
  HKQuantityTypeIdentifierVO2Max: '最大摄氧量',
  HKQuantityTypeIdentifierBodyMass: '体重',
  HKQuantityTypeIdentifierHeight: '身高',
  HKQuantityTypeIdentifierBodyMassIndex: 'BMI',
  HKQuantityTypeIdentifierSleepingWristTemperature: '睡眠腕温',
  HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances: '睡眠呼吸紊乱',
  HKCategoryTypeIdentifierSleepAnalysis: '睡眠分析',
  HKCategoryTypeIdentifierMindfulSession: '正念',
  HKCategoryTypeIdentifierSexualActivity: '性行为',
  HKCategoryTypeIdentifierAppleStandHour: '站立小时',
  HKQuantityTypeIdentifierPhysicalEffort: '身体负荷',
  HKQuantityTypeIdentifierTimeInDaylight: '日光暴露',
  HKQuantityTypeIdentifierWalkingSpeed: '步行速度',
  HKQuantityTypeIdentifierWalkingStability: '步行稳定性',
  HKQuantityTypeIdentifierSixMinuteWalkTestDistance: '六分钟步行',
  HKQuantityTypeIdentifierAppleWalkingSteadiness: '行走稳定度',
};
const WORKOUT = {
  Running: '跑步', Walking: '步行', Cycling: '骑行', Hiking: '徒步',
  Swimming: '游泳', Basketball: '篮球', TableTennis: '乒乓球', Badminton: '羽毛球',
  Soccer: '足球', Volleyball: '排球', Tennis: '网球', Fishing: '钓鱼',
  HighIntensityIntervalTraining: '高强度间歇', CrossTraining: '交叉训练',
  FunctionalStrengthTraining: '功能性力量', TraditionalStrengthTraining: '传统力量',
  Yoga: '瑜伽', MindAndBody: '身心', Flexibility: '柔韧', Cooldown: '放松',
  Elliptical: '椭圆机', Rowing: '划船', StairClimbing: '爬楼', MixedCardio: '混合有氧',
  SocialDance: '社交舞', Dance: '舞蹈', Golf: '高尔夫', Skiing: '滑雪', Other: '其他',
};

function labelOf(t) {
  if (t.indexOf('Workout:') === 0) return WORKOUT[t.slice(8)] || t.slice(8);
  return LABEL[t] || t.replace(/^HK(Quantity|Category)TypeIdentifier/, '');
}

/* ---------------- 报告 ---------------- */

const TABS = [
  ['overview', '概览'],
  ['audio', '耳朵'],
  ['heart', '心脏'],
  ['sleep', '睡眠'],
  ['activity', '活动'],
  ['energy', '能量'],
  ['mobility', '移动'],
  ['devices', '设备'],
];

let SRC = null;        // 全量结果
let R = null;          // 当前时间范围的切片
let UI = null;
let CUR = 'overview';
let RANGE = null;      // { from, to }

/** 把当前范围重新切一次并重画：只动当前 tab，不重建整页 */
function applyRange(from, to) {
  RANGE = { from, to };
  R = pick(SRC, from, to);
  paintHead();
  renderTab(CUR, UI);
}

function paintHead() {
  const days = R.days;
  UI.title.textContent = days
    ? '你的身体，' + num(days) + ' 天的记录'
    : '这段时间没有数据';
  UI.sub.textContent = R.range.from + ' → ' + R.range.to + ' · ' +
    num(days) + ' 天有记录 · 心率读数 ' + num(R.hr.n) + ' 次 · 睡眠 ' +
    R.sleep.nights.length + ' 夜 · 导出时间 ' + SRC.exportDate;

  const bar = document.getElementById('range');
  if (!bar) return;
  bar.querySelectorAll('button[data-p]').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.p === RANGE.preset)));
  const f = bar.querySelector('#rfrom, input[name=from]');
  const t = bar.querySelector('#rto, input[name=to]');
  if (f) f.value = R.range.from;
  if (t) t.value = R.range.to;
  const hint = bar.querySelector('.range-hint');
  if (hint) hint.textContent = num(days) + ' 天';
}

/** 把一个 parse 结果渲染进 ui = { title, sub, tabs, view } */
export function renderReport(r, ui) {
  SRC = r;
  UI = ui;
  // 初始范围：URL 上的 ?preset=7d 或 ?from=YYYY-MM-DD&to=YYYY-MM-DD 优先，方便分享/截图
  const q = new URLSearchParams(location.search);
  const qp = q.get('preset'), qf = q.get('from'), qt = q.get('to');
  let from = r.firstDate, to = r.lastDate, preset = 'all';
  if (qp && PRESETS.some(p => p[0] === qp)) {
    const s = spanOf(r, qp);
    from = s.from; to = s.to; preset = qp;
  } else if (qf || qt) {
    from = qf || r.firstDate;
    to = qt || r.lastDate;
    if (from > to) { const tmp = from; from = to; to = tmp; }
    preset = 'custom';
  }
  RANGE = { from, to, preset };
  R = pick(r, from, to);
  paintHead();

  ui.tabs.innerHTML = TABS.map(([k, t]) =>
    '<button role="tab" data-k="' + k + '" aria-selected="' + (k === CUR) + '">' + t + '</button>'
  ).join('');
  ui.tabs.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      CUR = b.dataset.k;
      ui.tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      renderTab(CUR, ui);
    });
  });

  // 时间范围条：预设 + 自定义起止
  if (!document.getElementById('range')) {
    const bar = document.createElement('div');
    bar.id = 'range';
    bar.className = 'range';
    bar.innerHTML =
      '<div class="range-presets">' +
        PRESETS.map(([k, t]) => '<button type="button" data-p="' + k + '" aria-pressed="false">' + t + '</button>').join('') +
      '</div>' +
      '<div class="range-dates">' +
        '<input type="date" name="from" aria-label="开始日期">' +
        '<span>→</span>' +
        '<input type="date" name="to" aria-label="结束日期">' +
      '</div>' +
      '<span class="range-hint"></span>';
    ui.tabs.parentNode.insertBefore(bar, ui.tabs);

    const from = bar.querySelector('input[name=from]');
    const to = bar.querySelector('input[name=to]');
    from.min = to.min = r.firstDate;
    from.max = to.max = r.lastDate;

    bar.querySelectorAll('button[data-p]').forEach(b => {
      b.addEventListener('click', () => {
        const s = spanOf(SRC, b.dataset.p);
        RANGE.preset = b.dataset.p;
        applyRange(s.from, s.to);
      });
    });
    const manual = () => {
      let a = from.value || SRC.firstDate;
      let b2 = to.value || SRC.lastDate;
      if (a > b2) { const t = a; a = b2; b2 = t; }
      RANGE.preset = 'custom';
      applyRange(a, b2);
    };
    from.addEventListener('change', manual);
    to.addEventListener('change', manual);
    paintHead();
  }

  renderTab(CUR, ui);
}

export function renderTab(k, ui) {
  const v = ui.view;
  v.innerHTML = '';
  if (!R) return;
  if (k === 'overview') viewOverview(R, v);
  else if (k === 'audio') viewAudio(R, v);
  else if (k === 'heart') viewHeart(R, v);
  else if (k === 'sleep') viewSleep(R, v);
  else if (k === 'activity') viewActivity(R, v);
  else if (k === 'energy') viewEnergy(R, v);
  else if (k === 'mobility') viewMobility(R, v);
  else viewDevices(R, v);
}

/* ---------------- 概览 ---------------- */

/** "07:27" → 7.45 */
const clockNum = s => { const p = String(s).split(':'); return (+p[0]) + (+p[1]) / 60; };

/** 单位圆上的平均向量。入睡时间跨午夜，算术平均会把 23 点和 1 点平摊成中午 */
function clockMean(list) {
  if (!list.length) return 0;
  let sx = 0, sy = 0;
  list.forEach(v => { const a = v / 24 * Math.PI * 2; sx += Math.cos(a); sy += Math.sin(a); });
  let a = Math.atan2(sy / list.length, sx / list.length);
  if (a < 0) a += Math.PI * 2;
  return a / (Math.PI * 2) * 24;
}

/** 7.45 → "07:27"，分钟进位到 60 要顺到下一个小时 */
function clockStr(v) {
  let h = Math.floor(v) % 24, m = Math.round((v % 1) * 60);
  if (m === 60) { m = 0; h = (h + 1) % 24; }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 这段范围里最长的一段空白：两个有记录的日子中间隔了多少天 */
function longestGap(byDay) {
  const ds = Object.keys(byDay).sort();
  let best = 0, after = '';
  for (let i = 1; i < ds.length; i++) {
    const gap = (new Date(ds[i] + 'T00:00:00Z') - new Date(ds[i - 1] + 'T00:00:00Z')) / 86400000 - 1;
    if (gap > best) { best = gap; after = ds[i]; }
  }
  return { days: Math.round(best), after };
}

/** 取 [[日期, 值]] 里最大的那天 */
function peakOf(days) {
  let best = null;
  days.forEach(([d, v]) => { if (v > 0 && (!best || v > best.v)) best = { d: d, v: v }; });
  return best;
}

/** 人格卡的渲染：概览和七个分区共用同一套结构，只是判定表和指针换成各自的维度 */
function renderPersona(ps, kicker) {
  return '<div class="card persona">' +
    '<div class="p-kicker">' + kicker + '</div>' +
    '<div class="p-name">' + esc(ps.top.name) + '</div>' +
    '<p class="p-say">' + esc(ps.top.say) + '</p>' +
    '<div class="dims">' + ps.dims.map(d =>
      '<div class="dim">' +
        '<div class="dhead"><span class="dname">' + d.name + '</span>' +
          '<b class="dval">' + esc(d.val) + '</b></div>' +
        '<div class="dtrack"><i style="--p:' + d.p.toFixed(3) + '"></i></div>' +
        '<div class="dends"><span>' + d.lo + '</span><span>' + d.hi + '</span></div>' +
      '</div>').join('') + '</div>' +
    (ps.tags.length
      ? '<div class="ptags">' + ps.tags.map(t =>
        '<span title="' + esc(t.say) + '">' + esc(t.name) + '</span>').join('') + '</div>'
      : '') +
    '<p class="note">标签是从数据里读出来的，换范围会变。</p>' +
    '</div>';
}

/** 这一段时间的「人格」：不是性格测试，就是把最突出的几个事实说成人话。
 *  按数组顺序取第一条命中的当标题，其余命中的做成小标签 —— 所以换个时间范围，标题会变。 */
function persona(r, days) {
  const ns = r.sleep.nights.filter(n => n.asleep >= 3);
  const nNight = ns.length || 1;
  const avgA = ns.reduce((a, n) => a + n.asleep, 0) / nNight;
  const deepSum = ns.reduce((a, n) => a + n.deep, 0);
  const sleepSum = ns.reduce((a, n) => a + n.asleep, 0) || 1;
  const deepPct = deepSum / sleepSum * 100;
  const shallow = ns.filter(n => n.asleep < 6).length;
  const bedH = clockMean(ns.map(n => clockNum(n.bed)));
  const bedShift = (bedH + 12) % 24; // 中午 12 点当 0，把 23 点和 1 点放到同一侧
  const nightShare = (r.hr.hourN || []).slice(0, 6).reduce((a, b) => a + b, 0) /
    ((r.hr.hourN || []).reduce((a, b) => a + b, 0) || 1);
  const stepsPerDay = r.steps.total / (r.steps.day.length || days || 1);
  const wkPerWeek = r.workouts.length / ((days || 1) / 7);
  const hpPerDay = r.hp.hours / Math.max(1, r.hp.day.length || 1);
  const lightPerDay = r.light.total / (days || 1);
  const gap = longestGap(r.byDay);
  const hiHr = peakOf(Object.keys(r.byDay).map(d => [d, r.byDay[d].hrMax || 0]));
  const hiStep = peakOf(Object.keys(r.byDay).map(d => [d, r.byDay[d].steps || 0]));

  const cands = [];
  const add = (name, say, ok) => { if (ok) cands.push({ name: name, say: say }); };

  add('走开过的人', '中间断了 ' + num(gap.days) + ' 天，然后又接上了。', gap.days >= 180);
  add('静养型', num(days) + ' 天里 ' + r.workouts.length + ' 次运动' +
    (r.workouts.length ? '，平均 ' + Math.round(days / r.workouts.length) + ' 天才动一次' : '') + '。',
    wkPerWeek < 1 && days >= 14);
  add('夜里的猫', '平均 ' + clockStr(bedH) + ' 才睡下，凌晨 0–6 点占了 ' +
    Math.round(nightShare * 100) + '% 的心率采样。', bedShift >= 12.5 && ns.length >= 5);
  add('见光少的人', '日均 ' + Math.round(lightPerDay) + ' 分钟日光。生物钟大概靠咖啡校准。',
    lightPerDay < 20 && days >= 14);
  add('耳机常驻的人', '有记录的 ' + r.hp.day.length + ' 天里日均 ' + hm(hpPerDay) + '。', hpPerDay >= 2);
  add('欠着觉的人', '平均 ' + dec(avgA) + ' 小时，' + nNight + ' 夜里有 ' + shallow + ' 夜不到 6 小时。',
    avgA < 6.8 && ns.length >= 5);
  add('深睡富翁', '深睡占 ' + dec(deepPct) + '%，比多数人扎实。', deepPct >= 22 && ns.length >= 5);
  add('浅眠的人', '深睡只占 ' + dec(deepPct) + '%，' + nNight + ' 夜平均睡了 ' + dec(avgA) + ' 小时。',
    deepPct > 0 && deepPct < 15 && ns.length >= 5);
  add('冲到过 ' + r.hr.max + ' 的人', '最高心率 ' + r.hr.max + ' bpm' + (hiHr ? '，出现在 ' + hiHr.d : '') + '。',
    r.hr.max >= 190);
  add('恢复得好的人', 'HRV 平均 ' + r.hrv.avg + ' ms，静息心率 ' + r.rhr.avg + ' bpm。',
    r.hrv.avg >= 62);
  add('恢复吃紧的人', 'HRV 平均 ' + r.hrv.avg + ' ms，静息心率 ' + r.rhr.avg + ' bpm。', r.hrv.avg > 0 && r.hrv.avg < 45);
  add('腿不离地的人', '日均 ' + num(stepsPerDay) + ' 步' + (hiStep ? '，最多的一天 ' + num(hiStep.v) + ' 步。' : '。'),
    stepsPerDay >= 10000);
  add('沙发常客', '日均 ' + num(stepsPerDay) + ' 步。手表大概经常不在手上。', stepsPerDay > 0 && stepsPerDay < 5000);
  add('耳膜刺客', num(r.hp.over90) + ' 次超过 90 dB，峰值 ' + r.hp.max + ' dB。', r.hp.over90 >= 3);
  // 设备名是按全量统计的，跟时间范围无关，文案里要说清，别让「12 副」看起来像这一周的
  add('耳机收藏家', '全量里有 ' + r.hp.devices.length + ' 副耳机，这段时间戴了 ' + hm(r.hp.hours) + '。',
    r.hp.devices.length >= 8 && r.hp.hours > 0);

  const top = cands[0] || {
    name: '普通人',
    say: '各项都在常见范围里，没有哪一项特别扎眼 —— 这本身是件好事。',
  };

  // 六根双向指针：左边是一头，右边是另一头
  const dims = [
    { name: '作息', p: clamp01((bedShift - 10) / 5), val: ns.length ? clockStr(bedH) + ' 睡' : '—',
      lo: '早睡', hi: '熬夜' },
    { name: '睡眠', p: clamp01((avgA - 4) / 5), val: ns.length ? dec(avgA) + ' 小时' : '—',
      lo: '睡得少', hi: '睡得足' },
    { name: '活动', p: clamp01((stepsPerDay - 2000) / 12000), val: num(stepsPerDay) + ' 步/日',
      lo: '躺着', hi: '暴走' },
    { name: '运动', p: clamp01(wkPerWeek / 5), val: dec(wkPerWeek, 1) + ' 次/周', lo: '静养', hi: '每周五练' },
    { name: '听觉', p: clamp01(hpPerDay / 6), val: r.hp.hours ? dec(hpPerDay) + ' 小时/日' : '—',
      lo: '偶尔听', hi: '耳机常驻' },
    { name: '恢复', p: clamp01((r.hrv.avg - 25) / 65), val: r.hrv.avg + ' ms', lo: '吃紧', hi: '恢复好' },
  ];

  return { top: top, tags: cands.slice(1, 6), dims: dims };
}

/* ---------------- 七个分区各一套人格 ---------------- */
/* 同一套结构（主标签 + 指针 + chips），判定维度换成该分区自己的。
   规则按数组顺序取第一条命中的当标题，所以换个时间范围标题会变。 */

function dim(name, p, val, lo, hi) {
  return { name: name, p: clamp01(p), val: val, lo: lo, hi: hi };
}

function pHeart(r, days) {
  const hr = r.hr, rhr = r.rhr.avg, hrv = r.hrv.avg, spo2 = r.spo2.avg;
  const cands = [];
  const add = (name, say, ok) => { if (ok) cands.push({ name: name, say: say }); };

  add('运动型心脏', '静息 ' + rhr + ' bpm、HRV ' + hrv + ' ms —— 跳得少而有力。', rhr > 0 && rhr < 58 && hrv >= 60);
  add('安静的发动机', '静息心率平均 ' + rhr + ' bpm，低于 60 那一档。', rhr > 0 && rhr < 62);
  add('一冲就上 ' + hr.max, '最高心率 ' + hr.max + ' bpm，这段里真出现过。', hr.max >= 190);
  add('心率偏高', '平均 ' + hr.avg + ' bpm，静息 ' + rhr + ' bpm。', hr.avg >= 95);
  add('恢复吃紧', 'HRV 平均 ' + hrv + ' ms，静息心率 ' + rhr + ' bpm。', hrv > 0 && hrv < 45);
  add('血氧很稳', '最低也有 ' + r.spo2.min + '%，没掉下 94%。', r.spo2.min >= 94 && r.spo2.n > 20);
  add('夜里掉得低', '最低心率 ' + hr.min + ' bpm。', hr.min <= 45);
  add('节奏平稳', '静息 ' + r.rhr.avg + ' bpm、HRV ' + r.hrv.avg + ' ms，都在常见范围里。',
    r.rhr.avg > 0 && r.hrv.avg > 0);

  const top = cands[0] || { name: '普通节奏', say: '静息 ' + rhr + ' bpm、HRV ' + hrv + ' ms，都在常见范围里。' };

  return {
    top: top, tags: cands.slice(1, 6),
    dims: [
      dim('静息', (rhr - 50) / 40, rhr ? rhr + ' bpm' : '—', '跳得省', '跳得勤'),
      dim('峰值', (hr.max - 150) / 70, hr.max + ' bpm', '平缓', '冲得高'),
      dim('恢复', (hrv - 25) / 65, hrv ? hrv + ' ms' : '—', '吃紧', '恢复好'),
      dim('日均', (hr.avg - 65) / 45, hr.avg + ' bpm', '低', '高'),
      dim('血氧', (spo2 - 93) / 7, spo2 ? spo2 + '%' : '—', '偏低', '充足'),
      dim('波动', (hr.max - hr.min) / 200, hr.min + '–' + hr.max, '窄', '宽'),
    ],
  };
}

function pSleep(r, days) {
  const ns = r.sleep.nights.filter(n => n.asleep >= 3);
  const n = ns.length || 1;
  const avgA = ns.reduce((a, x) => a + x.asleep, 0) / n;
  const sum = ns.reduce((a, x) => a + x.asleep, 0) || 1;
  const deepPct = ns.reduce((a, x) => a + x.deep, 0) / sum * 100;
  const remPct = ns.reduce((a, x) => a + x.rem, 0) / sum * 100;
  const awakeAvg = ns.reduce((a, x) => a + x.awake, 0) / n;
  const bedH = clockMean(ns.map(x => clockNum(x.bed)));
  const bedShift = (bedH + 12) % 24;
  // 入睡时间的离散度：标准差超过 1.5 小时就是「作息在漂」
  // 必须先把时刻搬到「中午 12 点当 0」的坐标系，否则 23:50 和 00:10 会被算成差 8 小时
  const shifts = ns.map(x => (clockNum(x.bed) + 12) % 24);
  const mean = shifts.reduce((a, b) => a + b, 0) / (shifts.length || 1);
  const sd = Math.sqrt(shifts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (shifts.length || 1));

  const cands = [];
  const add = (name, say, ok) => { if (ok) cands.push({ name: name, say: say }); };

  add('睡够了的人', '平均 ' + dec(avgA) + ' 小时，' + n + ' 夜里多数在 7 小时以上。', avgA >= 7.5 && n >= 5);
  add('欠着觉的人', '平均 ' + dec(avgA) + ' 小时，' + ns.filter(x => x.asleep < 6).length + ' 夜不到 6 小时。',
    avgA > 0 && avgA < 6.8 && n >= 5);
  add('夜里的猫', '平均 ' + clockStr(bedH) + ' 才睡下。', bedShift >= 13 && n >= 5);
  add('早睡的人', '平均 ' + clockStr(bedH) + ' 就睡了。', bedShift <= 11.2 && n >= 5);
  add('深睡富翁', '深睡占 ' + dec(deepPct) + '%。', deepPct >= 22 && n >= 5);
  add('浅眠的人', '深睡只占 ' + dec(deepPct) + '%。', deepPct > 0 && deepPct < 15 && n >= 5);
  add('REM 很足', 'REM 占 ' + dec(remPct) + '%。', remPct >= 25 && n >= 5);
  add('作息很稳', '入睡时间上下不超过 ' + dec(sd, 1) + ' 小时。', sd <= 0.6 && n >= 7);
  add('作息在漂', '入睡时间前后差 ' + dec(sd, 1) + ' 小时，没有固定点。', sd >= 1.5 && n >= 7);
  add('一夜到天亮', '夜里醒着的总时长平均只有 ' + dec(awakeAvg, 2) + ' 小时。', awakeAvg < 0.15 && n >= 5);
  add('夜里常醒', '夜里醒着的时间平均 ' + dec(awakeAvg, 2) + ' 小时。', awakeAvg >= 0.4 && n >= 5);

  const top = cands[0] || { name: '按时睡的人', say: '平均 ' + dec(avgA) + ' 小时，深睡 REM 都在常见比例。' };

  return {
    top: top, tags: cands.slice(1, 6),
    dims: [
      dim('时长', (avgA - 4) / 5, dec(avgA) + ' 小时', '睡得少', '睡得足'),
      dim('深睡', (deepPct - 10) / 20, dec(deepPct) + '%', '少', '多'),
      dim('REM', (remPct - 12) / 25, dec(remPct) + '%', '少', '多'),
      dim('入睡', (bedShift - 10) / 6, clockStr(bedH), '早', '晚'),
      dim('规律', 1 - (sd - 0.4) / 2.2, '± ' + dec(sd, 1) + ' 小时', '在漂', '很稳'),
      dim('清醒', 1 - (awakeAvg - 0.05) / 0.6, dec(awakeAvg, 2) + ' 小时', '常醒', '一觉到亮'),
    ],
  };
}

function pActivity(r, days) {
  const sd = r.steps.day;
  const steps = r.steps.total / (sd.length || days || 1);
  const km = r.dist.total / (days || 1);
  const flights = r.flights.total / (days || 1);
  const light = r.light.total / (days || 1);
  const perWeek = r.workouts.length / ((days || 1) / 7);
  // 周末运动占比：周六周日两天算下来动了几次
  const we = r.workouts.filter(w => {
    const g = new Date(String(w.s).slice(0, 10) + 'T00:00:00Z').getUTCDay();
    return g === 0 || g === 6;
  }).length;
  const weShare = r.workouts.length ? we / r.workouts.length : 0;
  const as = r.actsum || [];
  const all3 = as.filter(x => x.moveGoal && x.move >= x.moveGoal && x.exGoal && x.ex >= x.exGoal &&
    x.standGoal && x.stand >= x.standGoal).length;
  const ringRate = as.length ? all3 / as.length : 0;

  const cands = [];
  const add = (name, say, ok) => { if (ok) cands.push({ name: name, say: say }); };

  add('腿不离地的人', '日均 ' + num(steps) + ' 步。', steps >= 10000);
  add('沙发常客', '日均 ' + num(steps) + ' 步。', steps > 0 && steps < 5000);
  add('只在工作日动', '周末只占了 ' + Math.round(weShare * 100) + '% 的运动。', r.workouts.length >= 8 && weShare < 0.25);
  add('周末战士', '周末占了 ' + Math.round(weShare * 100) + '% 的运动。', r.workouts.length >= 5 && weShare >= 0.55);
  add('爬楼党', '日均 ' + dec(flights, 1) + ' 层楼。', flights >= 8);
  add('见光少的人', '日均 ' + Math.round(light) + ' 分钟日光。', light < 20 && days >= 14);
  add('日光充足', '日均 ' + Math.round(light) + ' 分钟日光。', light >= 60);
  add('三环常亮', as.length + ' 天里有 ' + Math.round(ringRate * 100) + '% 天三环全合上。', ringRate >= 0.6 && as.length >= 14);

  const top = cands[0] || { name: '日常量的人', say: '日均 ' + num(steps) + ' 步、' + dec(perWeek, 1) + ' 次运动/周。' };

  return {
    top: top, tags: cands.slice(1, 6),
    dims: [
      dim('步数', (steps - 2000) / 12000, num(steps) + ' 步/日', '躺着', '暴走'),
      dim('距离', (km - 1) / 13, dec(km, 1) + ' km/日', '少', '多'),
      dim('爬楼', flights / 16, dec(flights, 1) + ' 层/日', '平路', '爬楼党'),
      dim('运动', perWeek / 5, dec(perWeek, 1) + ' 次/周', '静养', '每周五练'),
      dim('日光', light / 100, Math.round(light) + ' 分/日', '少见光', '晒得够'),
      dim('三环', ringRate, Math.round(ringRate * 100) + '%', '常断', '常亮'),
    ],
  };
}

function pAudio(r, days) {
  const hp = r.hp;
  const perDay = hp.hours / Math.max(1, hp.day.length || 1);
  const hh = hp.hourAvg || [];
  const tot = hh.reduce((a, b) => a + b, 0) || 1;
  const night = hh.slice(0, 6).reduce((a, b) => a + b, 0) / tot;
  const eve = hh.slice(20, 24).reduce((a, b) => a + b, 0) / tot;
  const over85rate = hp.n ? hp.over85 / hp.n : 0;

  const cands = [];
  const add = (name, say, ok) => { if (ok) cands.push({ name: name, say: say }); };

  add('耳机常驻的人', '有记录的 ' + hp.day.length + ' 天里日均 ' + hm(perDay) + '。', perDay >= 2);
  add('耳膜刺客', hp.over90 + ' 次超过 90 dB，峰值 ' + hp.max + ' dB。', hp.over90 >= 3);
  add('夜里也在听', '凌晨 0–6 点占了 ' + Math.round(night * 100) + '% 的聆听时长。', night >= 0.2 && hp.hours > 5);
  add('睡前听的人', '晚上 20–24 点占了 ' + Math.round(eve * 100) + '%。', eve >= 0.3 && hp.hours > 5);
  add('听得很克制', '平均 ' + hp.avg + ' dB，超过 85 dB 的只有 ' + hp.over85 + ' 次。', hp.avg > 0 && hp.avg < 55);
  add('音量偏高', '平均 ' + hp.avg + ' dB，' + Math.round(over85rate * 100) + '% 的采样超过 85 dB。',
    hp.avg >= 65 || over85rate >= 0.02);
  add('耳机收藏家', '全量里有 ' + hp.devices.length + ' 副耳机。', hp.devices.length >= 8);
  add('听得不多', '有记录的 ' + hp.day.length + ' 天里日均 ' + hm(perDay) + '。', perDay > 0 && perDay < 0.5);

  const top = cands[0] || { name: '普通听众', say: '日均 ' + hm(perDay) + '，平均 ' + hp.avg + ' dB。' };

  return {
    top: top, tags: cands.slice(1, 6),
    dims: [
      dim('时长', perDay / 6, hm(perDay) + '/日', '偶尔听', '耳机常驻'),
      dim('音量', (hp.avg - 40) / 45, hp.avg + ' dB', '安静', '很响'),
      dim('超标', over85rate / 0.05, hp.over85 + ' 次超 85', '克制', '频繁'),
      dim('夜间', night / 0.4, Math.round(night * 100) + '% 在凌晨', '白天听', '夜里听'),
      dim('设备', hp.devices.length / 12, hp.devices.length + ' 副', '一副走天下', '收藏家'),
    ],
  };
}

function pEnergy(r, days) {
  const e = r.effort;
  const standRate = (r.standHour.stood + r.standHour.idle)
    ? r.standHour.stood / (r.standHour.stood + r.standHour.idle) : 0;
  const flights = r.flights.total / (days || 1);
  const ratio = r.energy.total / Math.max(1, r.basal.total);

  const cands = [];
  const add = (name, say, ok) => { if (ok) cands.push({ name: name, say: say }); };

  add('动起来的人', '平均负荷 ' + e.avg + ' kcal/hr·kg，活动能量 ' + num(r.energy.total) + ' 千卡。', e.avg >= 4.5);
  add('坐得住的人', '站立只占了 ' + Math.round(standRate * 100) + '%。', standRate > 0 && standRate < 0.4);
  add('一直站着的人', '站立占了 ' + Math.round(standRate * 100) + '%。', standRate >= 0.7);
  add('爬楼党', '日均 ' + dec(flights, 1) + ' 层楼，累计 ' + num(r.flights.total) + ' 层。', flights >= 8);
  add('骑车的人', '骑行 ' + dec(r.cycling.total, 1) + ' km。', r.cycling.total >= 20);
  add('负荷偏低', '平均负荷 ' + e.avg + '，大部分时间身体没在费劲。', e.avg > 0 && e.avg < 3);
  add('静息占比高', '静息能量是活动能量的 ' + Math.round(1 / Math.max(0.01, ratio)) + ' 倍。', ratio < 0.08);

  const top = cands[0] || { name: '普通一天', say: '平均负荷 ' + e.avg + '，站立 ' + Math.round(standRate * 100) + '%。' };

  return {
    top: top, tags: cands.slice(1, 6),
    dims: [
      dim('负荷', (e.avg - 1.5) / 4, e.avg + ' /kg·hr', '省力', '费劲'),
      dim('活动量', ratio / 0.25, num(r.energy.total) + ' 千卡', '少', '多'),
      dim('站立', standRate, Math.round(standRate * 100) + '%', '常坐', '常站'),
      dim('爬楼', flights / 16, dec(flights, 1) + ' 层/日', '平路', '爬楼党'),
      dim('骑行', r.cycling.total / 60, dec(r.cycling.total, 1) + ' km', '不骑', '常骑'),
    ],
  };
}

function pMobility(r, days) {
  const g = r.gait;
  const pick = (arr) => { if (!arr || !arr.length) return 0; const v = arr.map(x => x[1]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const mean = (arr) => (arr && arr.length ? arr.reduce((a, x) => a + x[1], 0) / arr.length : 0);
  const speed = pick(g.speed), stepLen = pick(g.stepLen);
  const dbl = pick(g.dblSup) * 100;
  // 不对称一半的日子是 0，中位数会变成 0.0%，这里跟页面数卡一样用均值
  const asym = mean(g.asym) * 100;
  const steady = pick(g.steady) * 100;

  const cands = [];
  const add = (name, say, ok) => { if (ok) cands.push({ name: name, say: say }); };

  add('步态年轻', '速度 ' + dec(speed, 2) + ' km/h、步长 ' + dec(stepLen, 0) + ' cm、双支撑 ' + dec(dbl, 0) + '%。',
    speed >= 4.5 && dbl > 0 && dbl <= 30);
  add('走路偏慢', '速度 ' + dec(speed, 2) + ' km/h，低于 3.6 这一档。', speed > 0 && speed < 3.6);
  add('小步快走', '步长 ' + dec(stepLen, 0) + ' cm，但速度还有 ' + dec(speed, 2) + ' km/h。', stepLen > 0 && stepLen < 58 && speed >= 4);
  add('大步走', '步长 ' + dec(stepLen, 0) + ' cm。', stepLen >= 72);
  add('左右很均衡', '不对称 ' + dec(asym, 1) + '%。', asym <= 1 && g.asym.length > 20);
  add('左右有差', '不对称 ' + dec(asym, 1) + '%，超过 5% 那一档。', asym >= 5);
  add('站得很稳', '行走稳定度 ' + dec(steady, 0) + '%。', steady >= 98);
  add('步态很稳', '不对称 ' + dec(asym, 1) + '%、稳定度 ' + dec(steady, 0) + '%，六年几乎没变过。',
    asym > 0 && asym < 6 && steady >= 95);
  add('值得留意', '不对称 ' + dec(asym, 1) + '%、稳定度 ' + dec(steady, 0) + '%，这两项一起偏低时值得找人看看。',
    asym >= 6 && steady > 0 && steady < 95);

  const top = cands[0] || { name: '步态正常', say: '速度 ' + dec(speed, 2) + ' km/h、步长 ' + dec(stepLen, 0) + ' cm，都在常见范围。' };

  return {
    top: top, tags: cands.slice(1, 6),
    dims: [
      dim('速度', (speed - 2.5) / 4, dec(speed, 2) + ' km/h', '慢', '快'),
      dim('步长', (stepLen - 45) / 40, dec(stepLen, 0) + ' cm', '小步', '大步'),
      dim('双支撑', 1 - (dbl - 18) / 25, dec(dbl, 1) + '%', '稳但慢', '轻快'),
      dim('不对称', 1 - asym / 12, dec(asym, 1) + '%', '有差', '均衡'),
      dim('稳定度', (steady - 80) / 20, dec(steady, 0) + '%', '偏低', '很好'),
    ],
  };
}

function pDevices(r, days) {
  const gap = longestGap(r.byDay);
  const span = (r.firstDate && r.lastDate)
    ? Math.round((new Date(r.lastDate + 'T00:00:00Z') - new Date(r.firstDate + 'T00:00:00Z')) / 86400000) + 1
    : days;
  const cover = span ? Math.min(1, days / span) : 0;
  const nd = (r.devices || []).length;

  const cands = [];
  const add = (name, say, ok) => { if (ok) cands.push({ name: name, say: say }); };

  add('装备党', nd + ' 台设备、' + r.sources.length + ' 个写入来源。', nd >= 14);
  add('断过的人', '中间断了 ' + num(gap.days) + ' 天。', gap.days >= 180);
  add('记录很连续', span + ' 天里 ' + Math.round(cover * 100) + '% 的天有数据。', cover >= 0.8 && span >= 60);
  add('只有老三样', '只有 ' + nd + ' 台设备在写数据。', nd > 0 && nd <= 3);
  add('一个表戴很久', '从 ' + r.firstDate + ' 记到 ' + r.lastDate + '。', span >= 1000);

  const top = cands[0] || { name: '够用的记录', say: nd + ' 台设备、' + r.sources.length + ' 个来源，覆盖 ' + Math.round(cover * 100) + '%。' };

  return {
    top: top, tags: cands.slice(1, 5),
    dims: [
      dim('设备', nd / 16, nd + ' 台', '少', '多'),
      dim('来源', r.sources.length / 18, r.sources.length + ' 个', '少', '多'),
      dim('覆盖', cover, Math.round(cover * 100) + '%', '常断', '连续'),
      dim('跨度', span / 2200, span + ' 天', '短', '长'),
    ],
  };
}

/** 换个说法：把绝对量换算成有画面的东西。全按当前范围算，所以切范围会变。 */
function funFacts(r, days, sleepSum) {
  const hrDays = r.hr.day.length || 0;
  const beats = r.hr.avg * 1440 * hrDays;
  const km = r.dist.total;
  const sleepDays = sleepSum / 24;
  const hpDays = r.hp.hours / 24;
  const floors = r.flights.total;
  const heightM = floors * 3;

  const nights = (r.sleep.nights || []).slice().sort((a, b) => b.asleep - a.asleep);
  const longest = nights[0];

  const vo = r.vo2 || [];
  let voHi = null, voLo = null;
  vo.forEach(x => {
    if (!voHi || x[1] > voHi[1]) voHi = x;
    if (!voLo || x[1] < voLo[1]) voLo = x;
  });
  const voNow = vo.length ? vo[vo.length - 1] : null;

  const items = [];
  const add = (v, k, s) => { if (v) items.push({ v: v, k: k, s: s || '' }); };

  if (beats > 0) {
    add(num(beats / 1e4) + ' 万', '心脏跳了',
      '按每日平均 ' + r.hr.avg + ' bpm 乘满 24 小时估的，' + hrDays + ' 天加起来');
  }
  if (km > 0) {
    add(num(km) + ' km', '走和跑过的路',
      km >= 1700
        ? '够从绵竹一路走到北京，还多 ' + num(km - 1700) + ' 公里'
        : '相当于 400 米操场 ' + num(km * 2.5) + ' 圈');
  }
  if (sleepDays > 0) {
    add(num(sleepDays) + ' 天', '睡掉了',
      num(sleepSum) + ' 小时' + (sleepDays >= 30 ? '，' + dec(sleepDays / 30) + ' 个月' : ''));
  }
  if (hpDays > 0) {
    add(num(hpDays) + ' 天', '耳机戴了',
      num(r.hp.hours) + ' 小时加起来，' + num(r.hp.n) + ' 条采样');
  }
  if (heightM > 0) {
    add(num(heightM) + ' 米', '爬出来的高度',
      num(floors) + ' 层楼 · ' + (heightM / 8848 >= 1
        ? dec(heightM / 8848) + ' 个珠峰（一层按 3 米算）'
        : '按一层 3 米算'));
  }
  if (r.hr.max > 0) {
    add(dec(r.hr.max / 60, 1) + ' 次/秒', '心跳最快的那一下',
      r.hr.max + ' bpm · 最慢 ' + r.hr.min + ' bpm，一秒不到一次');
  }
  if (longest) {
    add(hm(longest.asleep), '最长的一夜', longest.d + ' 睡到 ' + longest.wake);
  }
  if (voNow) {
    add(dec(voNow[1], 1), '心肺 VO₂max 现在',
      vo.length > 1
        ? '这段最高 ' + dec(voHi[1], 1) + '（' + voHi[0] + '），最低 ' + dec(voLo[1], 1) + '（' + voLo[0] + '）'
        : voNow[0] + ' 的估算值');
  }

  if (!items.length) return '';
  return card('换个说法', '同一个数，换个单位就有画面了',
    '<div class="facts">' + items.map(it =>
      '<div class="fact"><div class="fv">' + it.v + '</div>' +
      '<div class="fk">' + it.k + '</div>' +
      (it.s ? '<div class="fs">' + it.s + '</div>' : '') + '</div>').join('') + '</div>');
}

/** 分钟 → 人话 */
function mins(v) {
  if (!v) return '0 分钟';
  if (v < 60) return Math.round(v) + ' 分钟';
  return Math.floor(v / 60) + ' 小时 ' + Math.round(v % 60) + ' 分';
}

function viewOverview(r, host) {
  const days = r.days || r.hr.day.length || 1;
  const ns = r.sleep.nights;
  const nNight = ns.length || 1;
  const sleepSum = ns.reduce((a, n) => a + n.asleep, 0);
  const avgA = sleepSum / nNight;
  const avgDeep = ns.reduce((a, n) => a + n.deep, 0) / nNight;
  const avgRem = ns.reduce((a, n) => a + n.rem, 0) / nNight;
  const wkMin = r.workouts.reduce((a, w) => a + (w.dur || 0), 0);

  // 人格：这段数据最像谁。放在最上面 —— 进概览第一眼先知道「这段时间的我像谁」
  let h = renderPersona(persona(r, days), '这 ' + num(days) + ' 天里，你是');

  // 这一段时间的六个大数：心跳、睡眠、日光、步数、距离、能量
  h += '<div class="grid six">' +
    stat(num(r.hr.n), '次心率读数', '平均 ' + r.hr.avg + ' bpm · 最高 ' + r.hr.max) +
    stat(num(sleepSum) + ' 小时', '累计睡眠', ns.length + ' 夜 · 平均 ' +
      dec(ns.length ? sleepSum / ns.length : 0) + ' 小时') +
    stat(num(r.light.total / 60) + ' 小时', '晒太阳', num(r.light.total) + ' 分钟 · 按手表的日光暴露统计') +
    stat(num(r.steps.total), '步', '日均 ' + num(r.steps.total / (r.steps.day.length || days))) +
    stat(num(r.dist.total) + ' km', '走过和跑过', '步行与跑步距离') +
    stat(num(r.energy.total), '千卡', '活动能量') +
    '</div>' +
    '<p class="summary-line">' +
      '这段时间还戴了 <b>' + (r.hp.hours ? num(r.hp.hours) + ' 小时' : '—') + '</b> 耳机（' + num(r.hp.n) + ' 条音量采样）' +
      ' · 做了 <b>' + r.workouts.length + ' 次</b>运动' +
        (r.workouts.length ? '（' + Math.round(wkMin) + ' 分钟）' : '') +
      ' · 静息心率 <b>' + r.rhr.avg + ' bpm</b>' +
      ' · 血氧 <b>' + r.spo2.avg + '%</b>' +
    '</p>' +
    // 换个说法：同一个数换个单位就有画面
    funFacts(r, days, sleepSum);

  // 各分区一句话速览：这段范围里每个维度到底是什么样，点进去看细节
  // 整段的中位数：最后一天可能恰好是异常值
  const gv = (arr) => {
    if (!arr || !arr.length) return 0;
    const v = arr.map(x => x[1]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const quick = [
    ['heart', '心脏', r.hr.p50 + ' bpm',
      num(r.hr.n) + ' 次采样 · 静息 ' + r.rhr.avg + ' · 最高 ' + r.hr.max],
    ['sleep', '睡眠', dec(avgA) + ' 小时',
      ns.length + ' 夜 · 深睡 ' + dec(avgDeep / avgA * 100) + '% · REM ' + dec(avgRem / avgA * 100) + '%'],
    ['activity', '活动', num(r.steps.total / (r.steps.day.length || days)) + ' 步',
      r.steps.day.length + ' 天 · ' + num(r.dist.total) + ' km · ' + num(r.energy.total) + ' 千卡'],
    ['audio', '耳朵', r.hp.hours ? hm(r.hp.hours) : '—',
      num(r.hp.n) + ' 条采样 · 平均 ' + r.hp.avg + ' dB · ' + r.hp.over85 + ' 次超 85'],
    ['energy', '能量', (r.effort.avg || 0) + ' 负荷',
      '静息 ' + num(r.basal.total) + ' 千卡 · 活动 ' + num(r.energy.total) + ' 千卡'],
    ['mobility', '移动', dec(gv(r.gait.speed), 2) + ' km/h',
      '步长 ' + dec(gv(r.gait.stepLen), 1) + ' cm · 双支撑 ' + dec(gv(r.gait.dblSup) * 100, 1) + '% · 上楼 ' + dec(gv(r.gait.asc), 2) + ' m/s'],
  ];
  h += card('各分区速览', '点一张进那个分区',
    '<div class="facts quickgrid">' + quick.map(q =>
      '<a class="fact quick" data-go="' + q[0] + '">' +
        '<span class="qk">' + q[1] + '<span class="qgo">→</span></span>' +
        '<b class="qv">' + esc(q[2]) + '</b>' +
        '<span class="qs">' + esc(q[3]) + '</span>' +
      '</a>').join('') + '</div>',
    '');

  // 极值：一段范围里最极端的那几次，比平均值更能记住
  const peak = (key) => {
    let best = null;
    for (const d in r.byDay) {
      const v = r.byDay[d][key];
      if (v > 0 && (!best || v > best.v)) best = { d: d, v: v };
    }
    return best;
  };
  const hhmm2 = (s) => { const p = s.split(':'); return +p[0] + (+p[1]) / 60; };
  const nightBy = (fn) => ns.reduce((a, b) => (fn(b) > fn(a) ? b : a));
  const longNight = ns.length ? nightBy(x => x.asleep) : null;
  const realNights = ns.filter(x => x.asleep >= 3);
  const lateNight = realNights.length ? realNights.reduce((a, b) => ((hhmm2(b.bed) + 12) % 24) > ((hhmm2(a.bed) + 12) % 24) ? b : a) : null;
  const low = (key) => {
    let best = null;
    for (const d in r.byDay) {
      const v = r.byDay[d][key];
      if (v > 0 && (!best || v < best.v)) best = { d: d, v: v };
    }
    return best;
  };
  const hiHr = peak('hrMax'), loHr = low('hrMin'), hiStep = peak('steps');
  const hiHp = peak('hpMax'), hiEff = peak('effMax'), loSpo2 = low('spo2Min');
  const ex = [
    [hiHr ? String(hiHr.v) : '—', 'bpm', '心跳最快', hiHr ? hiHr.d : ''],
    [loHr ? String(loHr.v) : '—', 'bpm', '心跳最慢', loHr ? loHr.d : ''],
    [hiStep ? num(hiStep.v) : '—', '步', '走的最多的一天', hiStep ? hiStep.d : ''],
    [longNight ? dec(longNight.asleep) : '—', '小时', '睡得最长的一夜', longNight ? longNight.d : ''],
    [lateNight ? lateNight.bed : '—', '', '最晚睡下的一夜', lateNight ? lateNight.d : ''],
    [hiHp ? String(hiHp.v) : '—', 'dB', '听得最响的一次', hiHp ? hiHp.d : ''],
    [hiEff ? dec(hiEff.v, 2) : '—', '', '身体负荷最高', hiEff ? hiEff.d : ''],
    [loSpo2 ? String(loSpo2.v) : '—', '%', '血氧最低', loSpo2 ? loSpo2.d : ''],
  ];
  h += card('这段时间的几个极值', '都是真出现过的一次，不是平均值', factsHTML(ex), '');

  // 一天长什么样：睡觉那段、心跳的起伏、什么时候烧能量，全摊在同一条 24 小时轴上
  const realN = ns.filter(n => n.asleep >= 3);
  const bedH = realN.length ? clockMean(realN.map(n => clockNum(n.bed))) : null;
  const wakeH = realN.length ? clockMean(realN.map(n => clockNum(n.wake))) : null;
  h += card('你的一天，摊在 24 小时里', '按这一段的平均排出来的',
    '<div id="c-dayline" class="chart"></div>' +
    '<div class="legend">' +
      '<span><i class="sw sw-violet"></i>睡觉那段</span>' +
      '<span><i class="sw sw-green"></i>每小时心率</span>' +
      '<span><i class="sw sw-amber"></i>每小时烧的能量</span>' +
    '</div>',
    (bedH != null
      ? '平均 ' + clockStr(bedH) + ' 睡下、' + clockStr(wakeH) + ' 起床，紫色的就是这一段。'
      : '这段没有够长的睡眠记录。') +
    '心率曲线早上抬起来、夜里沉下去；琥珀柱是活动能量的高峰，跟心率不完全同步 —— 有些时段是坐着心跳快，有些是动着但心率没上来。');

  // 作息在漂：按月看入睡和起床时刻挪了没有
  // 时刻在环上。以中午 12 点为 0 点摆位，午夜就成了中间值，不会从 23:59 跳回 00:00
  const monthClock = key => {
    const m = new Map();
    realN.forEach(n => {
      if (!n[key]) return;
      const k = n.d.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(clockNum(n[key]));
    });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(e => [e[0].slice(2).replace('-', '/'), (clockMean(e[1]) + 12) % 24]);
  };
  const mBed = monthClock('bed'), mWake = monthClock('wake');
  h += mBed.length >= 3
    ? card('作息在漂', mBed.length + ' 个月 · 每月平均',
      '<div id="c-drift" class="chart"></div>' +
      '<div class="legend">' +
        '<span><i class="sw sw-violet"></i>入睡</span>' +
        '<span><i class="sw sw-blue"></i>起床</span>' +
      '</div>',
      '两条线一起往上抬，就是整体往后挪；只有入睡那条抬、起床不动，说明睡得更晚但起得没变 —— 中间这块面积就是被压掉的那部分。')
    : card('作息在漂', '这段太短，看不出漂移',
      '<p class="note">至少要跨 3 个月才好看趋势。把范围放宽到「近一年」或「全部」。</p>', '');

  host.innerHTML = h;

  if (bedH != null) {
    mount('#c-dayline', C.dayStrip({
      hr: r.hr.hourAvg, energy: r.energy.hour, bed: bedH, wake: wakeH,
    }, { w: CW, h: CH(250) }));
  }
  if (mBed.length >= 3) {
    // 图上的值是「从中午 12 点往后数的小时」，刻度要换算回真实时刻
    // 轴上的值是「从中午 12 点往后数的小时」，刻度要换回真实时刻
    const tone = v => {
      const t = ((v + 12) % 24 + 24) % 24;
      const hh = Math.floor(t);
      return String(hh).padStart(2, '0') + ':' + String(Math.round((t - hh) * 60) % 60).padStart(2, '0');
    };
    mount('#c-drift', C.dualLine([
      { color: 'var(--violet)', points: mBed },
      { color: 'var(--blue)', points: mWake },
    ], { w: CW, h: CH(210), pad: NARROW ? 42 : 46, tickFmt: tone, band: true }));
  }

  // 速览行直接切 tab，不用回顶部再点
  host.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', ev => {
      ev.preventDefault();
      const b = document.querySelector('#tabs button[data-k="' + el.dataset.go + '"]');
      if (b) b.click();
    });
  });
}

/* ---------------- 耳朵 ---------------- */

function viewAudio(r, host) {
  const hp = r.hp;
  const days = hp.day.length;
  let h = renderPersona(pAudio(r, r.days || days), '这 ' + (r.days || days) + ' 天里，你的耳朵是') +
    '<div class="grid">' +
    stat(hm(hp.hours), '戴耳机总时长', days + ' 天有记录') +
    stat(days ? hm(hp.hours / days) : '—', '有记录时日均', '') +
    stat(hp.avg + ' dB', '平均音量', '峰值 ' + hp.max + ' dB', sref('volume', hp.avg)) +
    stat(num(hp.over85), '次超过 85 dB', '其中 ' + num(hp.over90) + ' 次 >90 dB') +
    '</div>';

  h += card('每副耳机用了多久', '全量 ' + hp.devices.length + ' 副',
    '<div id="c-dev" class="chart"></div>',
    '时长按每条音量采样的持续区间累加，跟 iOS 里「耳机音量」的统计口径一致。');
  h += card('一天里什么时候听得最响', num(hp.n) + ' 次采样',
    '<div id="c-clock" class="chart"></div>',
    '半径是那一小时的平均音量，颜色越红越响。');
  h += card('每天的聆听时长', days + ' 天',
    '<div id="c-day" class="chart"></div>', '');

  // 极值：最响的一天、听得最久的一天
  const loudOne = dayPeak(r.byDay, 'hpMax', 'max');
  let hiAvg = null, loAvg = null;
  for (const d in r.byDay) {
    const o = r.byDay[d];
    if (!(o.hpN >= 30)) continue;
    const v = o.hpS / o.hpN;
    if (!hiAvg || v > hiAvg.v) hiAvg = { d: d, v: v };
    if (!loAvg || v < loAvg.v) loAvg = { d: d, v: v };
  }
  const durHi = dayPeak(r.byDay, 'hpDur', 'max');
  const durLo = dayPeak(r.byDay, 'hpDur', 'min', 1);
  const overHi = dayPeak(r.byDay, 'hpO85', 'max');
  const devTop = hp.devices.length ? hp.devices[0] : null;
  let hourHi = 0;
  for (let i = 1; i < hp.hourAvg.length; i++) if (hp.hourAvg[i] > hp.hourAvg[hourHi]) hourHi = i;
  h += card('这段里的几个极值', '都是真出现过的一天，不是平均值', factsHTML([
    [loudOne ? dec(loudOne.v, 1) : '—', 'dB', '听得最响的一次', loudOne ? loudOne.d : ''],
    [hiAvg ? dec(hiAvg.v, 1) : '—', 'dB', '平均音量最高的一天', hiAvg ? hiAvg.d : ''],
    [loAvg ? dec(loAvg.v, 1) : '—', 'dB', '平均音量最低的一天', loAvg ? loAvg.d : ''],
    [durHi ? dec(durHi.v / 60, 1) : '—', '小时', '单日听得最久的一天', durHi ? durHi.d : ''],
    [durLo ? Math.round(durLo.v) : '—', '分钟', '单日听得最少的一天', durLo ? durLo.d : ''],
    [overHi ? num(overHi.v) : '—', '次', '超标最多的一天', overHi ? overHi.d + ' · 超 85 dB' : ''],
    [devTop ? dec(devTop.hours, 0) : '—', '小时', '用得最多的一副', devTop ? devTop.name : ''],
    [hourHi + ' 点前后', '', '一天里最响的钟点', '平均 ' + dec(hp.hourAvg[hourHi], 1) + ' dB'],
  ]), '');

  host.innerHTML = h;
  mount('#c-dev', C.hbarsHTML(hp.devices.slice(0, 12).map(d => ({
    name: d.name, value: d.hours || d.n,
    sub: num(d.n) + ' 次采样 · 均值 ' + d.avg + ' dB · 峰值 ' + d.max,
    valueText: d.hours ? (d.hours >= 10 ? Math.round(d.hours) : d.hours.toFixed(1)) + ' h' : '—',
  })), { color: 'var(--amber)', labelW: 190, maxItems: 12 }));
  mount('#c-clock', C.clockRing(hp.hourAvg, {
    size: 400, min: 40, max: Math.max(70, hp.max),
    centerValue: hp.avg,
    centerLabel: '平均 dB',
    color: (v, lo, hi) => {
      const t = (v - lo) / (hi - lo || 1);
      return t > 0.8 ? 'var(--red)' : t > 0.55 ? 'var(--amber)' : 'var(--blue)';
    },
  }));
  const recent = hp.day.slice(-120);
  mount('#c-day', C.bars(recent.map(d => d[1]), { w: CW, h: CH(170), color: 'var(--amber)', labels: false }));
}

/* ---------------- 心脏 ---------------- */

function viewHeart(r, host) {
  const hr = r.hr;
  const P = prevPick();

  // 数卡：每个大数下面除了口径，再给一句同比，才知道这段是变忙还是变闲
  let h = renderPersona(pHeart(r, r.days || 1), '这 ' + num(r.days || 1) + ' 天里，你的心脏') +
    '<div class="grid">' +
    stat(num(hr.n), '次采样', e1([hr.p50 + ' bpm 中位', P && delta(hr.n, P.hr.n)])) +
    stat(hr.avg + ' bpm', '平均', e1(['范围 ' + hr.min + '–' + hr.max, P && delta(hr.avg, P.hr.avg)])) +
    stat(hr.p95 + ' bpm', '95 分位', '99 分位 ' + hr.p99) +
    stat(r.rhr.avg + ' bpm', '静息心率', e1([r.rhr.n + ' 次测量', P && delta(r.rhr.avg, P.rhr.avg)]), sref('rhr', r.rhr.avg)) +
    stat(r.hrv.avg + ' ms', '心率变异性', e1([r.hrv.n + ' 次', P && delta(r.hrv.avg, P.hrv.avg)]), sref('hrv', r.hrv.avg)) +
    stat(r.spo2.avg + '%', '血氧', r.spo2.n + ' 次 · 最低 ' + r.spo2.min + '%', sref('spo2', r.spo2.avg)) +
    '</div>';

  // 星期几与一天六段：同一批采样换个切法，能看出是「作息」还是「某天特别忙」
  const wk = byWeekday(hr.day);
  const pt = byPart(hr.hourN, hr.hourAvg);
  const busiestWd = wk.slice().sort((a, b) => b.value - a.value)[0];
  const busiestPt = pt.slice().sort((a, b) => b.share - a.share)[0];
  const maxPt = Math.max.apply(null, pt.map(p => p.share)) || 1;
  const wkVals = wk.filter(w => w.value).map(w => w.value);
  const wkBase = wkVals.length ? Math.max(0, Math.min.apply(null, wkVals) - 3) : 0;

  h += card('一天里，心脏什么时候最忙', '按小时聚合 ' + num(hr.n) + ' 次采样',
    '<div id="c-hrclock" class="chart"></div>',
    '圆心到外缘是一整天的 24 小时，静息与活动混在一起，所以环的形状本身就是作息表。');
  h += card('哪一天、哪一段最忙', '两个切法',
    '<div class="subhead">按星期几 · 平均心率</div>' +
    C.hbarsHTML(wk.map(w => ({
      name: w.name, value: w.value, valueText: w.value ? w.value + ' bpm' : '—',
      sub: w.n ? w.n + ' 天' : '没有记录',
    })), { color: 'var(--blue)', labelW: 74, base: wkBase }) +
    '<div class="subhead">按一天里的时段 · 采样占比</div>' +
    C.hbarsHTML(pt.map(p => ({
      name: p.name,
      value: p.share,
      valueText: (p.share * 100).toFixed(0) + '%',
      sub: p.cnt ? Math.round(p.avg) + ' bpm 平均' : '没有记录',
    })), { color: 'var(--amber)', labelW: 78 }),
    busiestWd && busiestWd.value
      ? busiestWd.name + '平均 ' + busiestWd.value + ' bpm 最高，' + busiestPt.name + '占了全天采样的 ' + (busiestPt.share * 100).toFixed(0) + '%。'
      : '');
  h += card('心率分布', '每格 ' + hr.histBin + ' bpm',
    '<div id="c-hist" class="chart"></div>',
    '左边是睡着和静息，右边是运动。超过 180 的那条尾巴，几乎都来自几次冲刺。');
  h += card('每天的平均心率', hr.day.length + ' 天',
    '<div id="c-hrday" class="chart"></div>', '');

  // 日历：颜色深浅按 min–max 铺，心率区间窄，用平方根会全都糊成一片
  const dayVals = hr.day.map(d => d[1]);
  const lo = Math.min.apply(null, dayVals.concat(999)), hi = Math.max.apply(null, dayVals.concat([0]));
  h += card('心率日历', hr.day.length + ' 天有采样',
    '<div id="c-hrcal"></div>',
    '一格是一天的平均心率，颜色越深跳得越忙。空白是没有记录的日子，不是没心跳。');

  // 极值：这些是「具体哪一天」，和上面的平均不是一回事。凑成八项是为了排成 4×2
  const peakOf = (arr, cmp) => arr.reduce((best, x) => (!best || cmp(x, best) ? x : best), null);
  const hiDay = peakOf(hr.day, (a, b) => a[1] > b[1]);
  const loDay = peakOf(hr.day, (a, b) => a[1] < b[1]);
  const rhrDay = (r.rhr.day || []).slice();
  const rhrHi = peakOf(rhrDay, (a, b) => a[1] > b[1]);
  const rhrLo = peakOf(rhrDay, (a, b) => a[1] < b[1]);
  const mxRow = peakOf(Object.keys(r.byDay).map(d => [d, r.byDay[d].hrMax]), (a, b) => a[1] > b[1]);
  // HRV 与血氧没有现成的「日」序列，直接按日聚合算
  // pick() 出来的 byDay 里只有当日平均 hrv，没有 hrvSum/hrvN
  const hrvDaily = Object.keys(r.byDay)
    .map(d => (r.byDay[d].hrv ? [d, r.byDay[d].hrv] : null))
    .filter(Boolean);
  const hrvHi = peakOf(hrvDaily, (a, b) => a[1] > b[1]);
  const hrvLo = peakOf(hrvDaily, (a, b) => a[1] < b[1]);
  const spo2Row = peakOf(Object.keys(r.byDay)
    .map(d => [d, r.byDay[d].spo2Min])
    .filter(x => x[1] > 0), (a, b) => a[1] < b[1]);
  const ex = [
    [mxRow ? String(mxRow[1]) : '—', 'bpm', '心跳最快的一刻', mxRow ? mxRow[0] : ''],
    [hiDay ? String(hiDay[1]) : '—', 'bpm', '日均最高的一天', hiDay ? hiDay[0] : ''],
    [loDay ? String(loDay[1]) : '—', 'bpm', '日均最低的一天', loDay ? loDay[0] : ''],
    [rhrHi ? String(rhrHi[1]) : '—', 'bpm', '静息最高的一天', rhrHi ? rhrHi[0] : ''],
    [rhrLo ? String(rhrLo[1]) : '—', 'bpm', '静息最低的一天', rhrLo ? rhrLo[0] : ''],
    [hrvHi ? dec(hrvHi[1], 1) : '—', 'ms', 'HRV 最高的一天', hrvHi ? hrvHi[0] : ''],
    [hrvLo ? dec(hrvLo[1], 1) : '—', 'ms', 'HRV 最低的一天', hrvLo ? hrvLo[0] : ''],
    [spo2Row ? String(spo2Row[1]) : '—', '%', '血氧最低的一次', spo2Row ? spo2Row[0] : ''],
  ];
  h += card('这段里的几个极值', '都是真出现过的一次，不是平均值', factsHTML(ex), '');

  host.innerHTML = h;
  mount('#c-hrclock', C.clockRing(hr.hourAvg, {
    size: 400, min: 50, max: Math.max(120, Math.max.apply(null, hr.hourAvg)),
    centerValue: hr.p50,
    centerLabel: '中位心率',
    color: (v) => v >= 100 ? 'var(--red)' : v >= 85 ? 'var(--amber)' : 'var(--blue)',
  }));
  mount('#c-hist', C.histogram(hr.hist, { min: hr.histMin, bin: hr.histBin, color: 'var(--red)', w: CW, h: CH(180) }));
  mount('#c-hrday', C.line(hr.day.map(d => [d[0], d[1]]), { color: 'var(--green)', w: CW, h: CH(230), pad: NARROW ? 30 : 34 }));
  // 短短一段用一整年的格子会空成一片，30 天就按 30 天排
  const calOpt = { cell: NARROW ? 9 : 11, gap: 2.4, color: 'var(--red)', sqrt: false, min: lo, max: hi };
  mount('#c-hrcal', hr.day.length <= 120
    ? C.calendar(hr.day, calOpt)
    : C.calendarYears(hr.day, calOpt));
}

/* ---------------- 睡眠 ---------------- */

function viewSleep(r, host) {
  const ns = r.sleep.nights;
  const n = ns.length || 1;
  const avgA = ns.reduce((a, x) => a + x.asleep, 0) / n;
  const avgDeep = ns.reduce((a, x) => a + x.deep, 0) / n;
  const avgRem = ns.reduce((a, x) => a + x.rem, 0) / n;
  const avgCore = ns.reduce((a, x) => a + x.core, 0) / n;
  const avgAwake = ns.reduce((a, x) => a + x.awake, 0) / n;
  // 入睡时间跨午夜，用单位圆上的平均向量（clockMean）才算得对，见文件头
  const bedStr = clockStr(clockMean(ns.map(x => clockNum(x.bed))));
  const wakeStr = clockStr(clockMean(ns.map(x => clockNum(x.wake))));
  void wakeStr;

  let h = renderPersona(pSleep(r, r.days || 1), '这 ' + num(r.days || 1) + ' 天里，你的睡眠是') +
    '<div class="grid">' +
    stat(dec(avgA), '平均睡眠小时', ns.length + ' 个夜晚', sref('sleep', avgA)) +
    stat(bedStr, '平均入睡', '平均 ' + wakeStr + ' 起') +
    stat(dec(avgDeep, 2) + ' h', '深睡', dec(avgDeep / avgA * 100) + '%', sref('deep', avgDeep / avgA * 100)) +
    stat(dec(avgRem, 2) + ' h', 'REM', dec(avgRem / avgA * 100) + '%', sref('rem', avgRem / avgA * 100)) +
    stat(dec(avgAwake, 2) + ' h', '夜间清醒', '', sref('awake', avgAwake)) +
    '</div>';

  h += card('每一夜，从几点睡到几点', ns.length + ' 夜',
    '<div id="c-bands" class="chart"></div>',
    '一条线是一夜，贴着轴往下掉就是越睡越晚的时段。纵轴把中午 12 点当成 0 点，这样跨零点的夜晚才连得起来。');
  const lenN = Math.min(NARROW ? 60 : 90, ns.length);
  h += card('睡多久', '最近 ' + lenN + ' 夜',
    '<div id="c-len" class="chart"></div>', '');
  h += card('睡眠结构', '平均每晚',
    '<div class="two-col"><div id="c-donut" class="chart"></div><div id="c-donut-legend"></div></div>', '');

  // 极值：具体哪一夜，和上面的平均不是一回事
  const realN = ns.filter(x => x.asleep >= 3);
  const nTop = (arr, fn) => (arr.length ? arr.reduce((a, b) => (fn(b) > fn(a) ? b : a)) : null);
  const nLow = (arr, fn) => (arr.length ? arr.reduce((a, b) => (fn(b) < fn(a) ? b : a)) : null);
  const bedShiftOf = x => (clockNum(x.bed) + 12) % 24;
  const nLong = nTop(ns, x => x.asleep);
  const nShort = nLow(realN, x => x.asleep);
  const nDeep = nTop(ns, x => x.deep);
  const nRem = nTop(ns, x => x.rem);
  const nLateBed = nTop(realN, bedShiftOf);
  const nEarlyBed = nLow(realN, bedShiftOf);
  const nAwake = nTop(ns, x => x.awake);
  const nEarlyWake = nLow(realN, x => clockNum(x.wake));
  h += card('这段里的几个极值', '都是真出现过的一夜，不是平均值', factsHTML([
    [nLong ? dec(nLong.asleep) : '—', '小时', '睡得最长的一夜', nLong ? nLong.d + ' ' + nLong.bed + '–' + nLong.wake : ''],
    [nShort ? dec(nShort.asleep) : '—', '小时', '睡得最短的一夜', nShort ? nShort.d : ''],
    [nDeep ? dec(nDeep.deep, 2) : '—', '小时', '深睡最多的一夜', nDeep ? nDeep.d : ''],
    [nRem ? dec(nRem.rem, 2) : '—', '小时', 'REM 最多的一夜', nRem ? nRem.d : ''],
    [nLateBed ? nLateBed.bed : '—', '', '最晚睡下的一夜', nLateBed ? nLateBed.d : ''],
    [nEarlyBed ? nEarlyBed.bed : '—', '', '最早睡下的一夜', nEarlyBed ? nEarlyBed.d : ''],
    [nAwake ? dec(nAwake.awake, 2) : '—', '小时', '夜里醒得最久的一夜', nAwake ? nAwake.d : ''],
    [nEarlyWake ? nEarlyWake.wake : '—', '', '最早起床的一夜', nEarlyWake ? nEarlyWake.d : ''],
  ]), '');

  host.innerHTML = h;
  mount('#c-bands', C.sleepBands(ns, { w: CW, h: CH(280), padL: NARROW ? 36 : 44 }));
  mount('#c-len', C.bars(ns.slice(-lenN).map(x => x.asleep), { w: CW, h: CH(170), color: 'var(--blue)', labels: false }));
  mount('#c-donut', C.donut([
    { name: '深睡', value: avgDeep, color: 'var(--green)' },
    { name: '核心', value: avgCore, color: 'var(--blue)' },
    { name: 'REM', value: avgRem, color: 'var(--violet)' },
    { name: '清醒', value: avgAwake, color: 'var(--red)' },
  ], { size: 230 }));
  mount('#c-donut-legend', (() => {
    const d = document.createElement('div');
    d.className = 'legend';
    d.style.flexDirection = 'column';
    [['深睡', 'var(--green)', avgDeep], ['核心', 'var(--blue)', avgCore], ['REM', 'var(--violet)', avgRem], ['清醒', 'var(--red)', avgAwake]]
      .forEach(x => {
        const s = document.createElement('span');
        s.innerHTML = '<i style="background:' + x[1] + '"></i>' + x[0] + ' · ' + dec(x[2], 2) + ' h';
        d.appendChild(s);
      });
    return d;
  })());
}

/* ---------------- 活动 ---------------- */

function viewActivity(r, host) {
  const sd = r.steps.day;
  const avgs = sd.length ? r.steps.total / sd.length : 0;
  const best = sd.slice().sort((a, b) => b[1] - a[1])[0];
  const wtypes = {};
  r.workouts.forEach(w => { wtypes[w.t] = (wtypes[w.t] || 0) + 1; });
  const wk = Object.entries(wtypes).sort((a, b) => b[1] - a[1]);

  let h = renderPersona(pActivity(r, r.days || 1), '这 ' + num(r.days || 1) + ' 天里，你的活动是') +
    '<div class="grid">' +
    stat(num(r.steps.total), '总步数', sd.length + ' 天') +
    stat(num(avgs), '日均步数', '', sref('steps', avgs)) +
    stat(best ? num(best[1]) : '—', '最高单日', best ? best[0] : '') +
    stat(num(r.dist.total) + ' km', '总距离', '步行与跑步') +
    stat(num(r.energy.total), '千卡', '活动能量') +
    stat(r.workouts.length, '次运动', '') +
    '</div>';

  h += card('哪些天真的在走路', sd.length + ' 个有效日',
    '<div id="c-cal" class="chart"></div>',
    '每一格是一天，颜色越亮走得越多。中间那几片黑，不是没走路，是那段时间压根没戴表。');
  // 三环：ActivitySummary 是手表每天自己汇总的 Move/Exercise/Stand，
  // 和 Record 里的能量/运动分钟不是一回事，达成率只能用它算
  const as = r.actsum || [];
  const closedMove = as.filter(x => x.moveGoal && x.move >= x.moveGoal).length;
  const closedEx = as.filter(x => x.exGoal && x.ex >= x.exGoal).length;
  const closedStand = as.filter(x => x.standGoal && x.stand >= x.standGoal).length;
  const allThree = as.filter(x =>
    x.moveGoal && x.move >= x.moveGoal && x.exGoal && x.ex >= x.exGoal &&
    x.standGoal && x.stand >= x.standGoal).length;

  // 连续合上三环的最长天数
  let run = 0, bestRun = 0;
  as.forEach(x => {
    const ok = x.moveGoal && x.move >= x.moveGoal && x.exGoal && x.ex >= x.exGoal &&
               x.standGoal && x.stand >= x.standGoal;
    run = ok ? run + 1 : 0;
    if (run > bestRun) bestRun = run;
  });

  h += card('三环合上了几天', as.length + ' 天有活动摘要',
    '<div id="c-rings" class="chart"></div>' +
    '<div class="grid" style="margin-top:12px">' +
      stat(as.length ? Math.round(closedMove / as.length * 100) + '%' : '—', '活动环达成率', closedMove + ' / ' + as.length + ' 天') +
      stat(as.length ? Math.round(closedEx / as.length * 100) + '%' : '—', '锻炼环达成率', closedEx + ' / ' + as.length + ' 天') +
      stat(as.length ? Math.round(closedStand / as.length * 100) + '%' : '—', '站立环达成率', closedStand + ' / ' + as.length + ' 天') +
      stat(bestRun + ' 天', '最长连续全合上', '共 ' + allThree + ' 天三期都合上') +
    '</div>',
    '三环达成率只用 Apple 自己写的 ActivitySummary，和上面按 Record 累加的能量不是同一套口径。');
  if (wk.length) {
    h += card('都做了什么运动', r.workouts.length + ' 次',
      '<div id="c-wk" class="chart"></div>', '');
  }

  // 运动的节奏：一段流水账（哪天跑了多少公里）读不出任何东西，
  // 换成「一周里哪几天动」「一天里什么时点动」，规律才浮出来
  const wkn = r.workouts;
  let wdItems = [], partItems = [];
  if (wkn.length) {
    const hourOf = w => +String(w.s).slice(11, 13) || 0;
    const wdOf = w => new Date(String(w.s).slice(0, 10) + 'T00:00:00Z').getUTCDay();
    const wdCount = [0, 0, 0, 0, 0, 0, 0];
    const hrCount = new Array(24).fill(0);
    wkn.forEach(w => { wdCount[wdOf(w)]++; hrCount[hourOf(w)]++; });
    wdItems = [1, 2, 3, 4, 5, 6, 0].map(i => ({ name: WD[i], value: wdCount[i], valueText: wdCount[i] + ' 次' }));
    partItems = PARTS.map(pg => {
      let c = 0;
      for (let i = pg[1]; i < pg[2]; i++) c += hrCount[i];
      return { name: pg[0], value: c, valueText: c + ' 次' };
    }).filter(x => x.value > 0);
    const mCount = new Map();
    wkn.forEach(w => { const k = String(w.s).slice(0, 7); mCount.set(k, (mCount.get(k) || 0) + 1); });
    const topM = [...mCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const totalMin = wkn.reduce((s, w) => s + w.dur, 0);
    const longest = wkn.slice().sort((a, b) => b.dur - a.dur)[0];
    const maxWd = Math.max(...wdItems.map(x => x.value));
    const topNames = wdItems.filter(x => x.value === maxWd).map(x => x.name);
    const wdNote = topNames.length > 1
      ? topNames.join('、') + ' 各 ' + maxWd + ' 次'
      : topNames[0] + ' 最多，' + maxWd + ' 次';
    h += card('运动的节奏', wkn.length + ' 次 · 按开始时间摊开',
      '<div class="grid" style="margin-bottom:6px">' +
        stat(Math.round(totalMin / wkn.length) + ' 分', '平均每次', num(Math.round(totalMin)) + ' 分钟总共') +
        stat(Math.round(longest.dur) + ' 分', '最长一次', String(longest.s).slice(0, 10)) +
        stat(dec((r.days || 0) / wkn.length, 1) + ' 天', '多久动一次', '这段范围 ' + (r.days || 0) + ' 天') +
        stat(topM[1] + ' 次', '动得最多的月份', topM[0]) +
      '</div>' +
      '<div class="subhead">一周里的哪几天</div><div id="c-wd" class="chart"></div>' +
      '<div class="subhead">一天里的什么时段</div><div id="c-part" class="chart"></div>',
      '按每次运动开始的时间归类。' + (maxWd ? wdNote + '。' : ''));
  } else {
    h += card('运动的节奏', '',
      '<p class="note">这段范围里没有记录到运动。把范围放宽到「近一年」或「全部」再看。</p>', '');
  }

  // 极值：具体哪一天，和上面的日均不是一回事
  const pStep = dayPeak(r.byDay, 'steps', 'max');
  const pStepLo = dayPeak(r.byDay, 'steps', 'min', 100);
  const pFlight = dayPeak(r.byDay, 'flights', 'max');
  const pLight = dayPeak(r.byDay, 'light', 'max');
  const pExer = dayPeak(r.byDay, 'exer', 'max');
  const pStand = dayPeak(r.byDay, 'stand', 'max');
  const wLong = wkn.length ? wkn.reduce((a, b) => (b.dur > a.dur ? b : a)) : null;
  const wFar = wkn.length ? wkn.reduce((a, b) => (b.dist > a.dist ? b : a)) : null;
  h += card('这段里的几个极值', '都是真出现过的一天，不是平均值', factsHTML([
    [pStep ? num(pStep.v) : '—', '步', '走得最多的一天', pStep ? pStep.d : ''],
    [pStepLo ? num(pStepLo.v) : '—', '步', '走得最少的一天', pStepLo ? pStepLo.d + ' · 有记录的' : ''],
    [pFlight ? num(pFlight.v) : '—', '层', '爬楼最多的一天', pFlight ? pFlight.d : ''],
    [pLight ? num(pLight.v) : '—', '分钟', '日光晒得最多的一天', pLight ? pLight.d : ''],
    [pExer ? num(pExer.v) : '—', '分钟', '锻炼最久的一天', pExer ? pExer.d : ''],
    [pStand ? num(pStand.v) : '—', '分钟', '站得最久的一天', pStand ? pStand.d : ''],
    [wLong ? Math.round(wLong.dur) : '—', '分钟', '最长的一次运动', wLong ? String(wLong.s).slice(0, 10) + ' · ' + labelOf('Workout:' + wLong.t) : ''],
    [wFar ? dec(wFar.dist, 2) : '—', 'km', '最远的一次运动', wFar ? String(wFar.s).slice(0, 10) + ' · ' + labelOf('Workout:' + wFar.t) : ''],
  ]), '');

  host.innerHTML = h;
  mount('#c-cal', C.calendarYears(sd, { cell: 12, gap: 2.4 }));
  mount('#c-rings', C.hbarsHTML([
    { name: '活动环 Move', value: closedMove, valueText: closedMove + ' / ' + as.length },
    { name: '锻炼环 Exercise', value: closedEx, valueText: closedEx + ' / ' + as.length },
    { name: '站立环 Stand', value: closedStand, valueText: closedStand + ' / ' + as.length },
    { name: '三期全合上', value: allThree, valueText: allThree + ' / ' + as.length },
  ], { color: 'var(--green)', labelW: 130 }));
  if (wk.length) {
    mount('#c-wk', C.hbarsHTML(wk.map(([k, v]) => ({ name: labelOf('Workout:' + k), value: v, valueText: v + ' 次' })), { color: 'var(--blue)', labelW: 150 }));
  }
  if (wkn.length) {
    mount('#c-wd', C.hbarsHTML(wdItems, { color: 'var(--blue)', labelW: 74 }));
    mount('#c-part', C.hbarsHTML(partItems, { color: 'var(--violet)', labelW: 78 }));
  }
}

/* ---------------- 能量 ---------------- */

/** [[日期, 值]] → [[YYYY-MM, 合计]] */
function byMonthSum(arr) {
  const m = new Map();
  for (const [d, v] of arr) {
    const k = String(d).slice(0, 7);
    m.set(k, (m.get(k) || 0) + v);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** [[日期, 值]] → [[YYYY-MM, 月均]] */
function byMonthAvg(arr) {
  const s = new Map(), n = new Map();
  for (const [d, v] of arr) {
    const k = String(d).slice(0, 7);
    s.set(k, (s.get(k) || 0) + v);
    n.set(k, (n.get(k) || 0) + 1);
  }
  return [...s.entries()].map(([k, v]) => [k, +(v / n.get(k)).toFixed(2)])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function viewEnergy(r, host) {
  const ef = r.effort;
  const effDay = ef.day;
  const best = effDay.slice().sort((a, b) => b[1] - a[1])[0];
  const rest = r.basal.total, act = r.energy.total;
  const standTot = r.standHour.stood + r.standHour.idle;

  let h = renderPersona(pEnergy(r, r.days || 1), '这 ' + num(r.days || 1) + ' 天里，你的能量是') +
    '<div class="grid">' +
    stat(dec(ef.avg, 2), '平均身体负荷', 'kcal/hr·kg · 峰值 ' + dec(ef.max, 1)) +
    stat(best ? dec(best[1], 1) : '—', '最累的一天', best ? best[0] : '') +
    stat(num(rest), '千卡静息', '躺着不动烧掉的') +
    stat(num(act), '千卡活动', '动起来额外烧掉的') +
    stat(dec(r.cycling.total, 1) + ' km', '骑行', '') +
    stat(num(r.flights.total), '层楼', '爬楼梯') +
    '</div>';

  h += card('一天里，身体什么时候最累', num(ef.n) + ' 次采样 · 按小时平均',
    '<div id="c-efclock" class="chart"></div>',
    'Apple 的 PhysicalEffort 是「每分钟每公斤体重消耗多少千卡」，跟体重无关，能直接横向比较。凌晨 4 点前后最低，下午和傍晚最高。');
  h += card('每天的身体负荷', effDay.length + ' 天',
    '<div id="c-efday" class="chart"></div>',
    '每天所有采样的平均值。曲线抬起来的那几段，是开始认真跑步之后。');
  // 静息占了近九成，画成饼永远是一大一小；改成上面看构成、下面看一天里什么时候动
  const days = r.days || 1;
  const workKcal = Math.round((r.workouts || []).reduce((s, w) => s + (w.kcal || 0), 0));
  const pctOf = v => (rest + act ? Math.round((v / (rest + act)) * 100) : 0);
  const hourAvgE = (r.energy.hour || new Array(24).fill(0)).map(v => +(v / days).toFixed(1));
  const peakHour = hourAvgE.indexOf(Math.max.apply(null, hourAvgE));
  h += card('一天的能量从哪来', '静息 ' + pctOf(rest) + '% · 活动 ' + pctOf(act) + '%',
    '<div class="splitbar">' +
      '<i style="width:' + pctOf(rest) + '%;background:var(--blue)"></i>' +
      '<i style="flex:1;background:var(--amber)"></i>' +
    '</div>' +
    '<div class="splitcap">' +
      '<span><i style="background:var(--blue)"></i>静息 ' + num(rest) + ' 千卡</span>' +
      '<span><i style="background:var(--amber)"></i>活动 ' + num(act) + ' 千卡</span>' +
    '</div>' +
    '<div id="c-enhour" class="chart"></div>',
    '上面是总账，下面是活动能量摊到一天 24 小时的样子（平均每天这个钟点烧掉多少千卡）。' +
    (act && workKcal ? '活动里只有 ' + num(workKcal) + ' 千卡来自正式运动（' + Math.round(workKcal / act * 100) + '%），其余全是日常走动和零碎动作。' : '') +
    (hourAvgE[peakHour] ? '最烧能量的钟点是 ' + peakHour + ' 点前后。' : ''));
  h += card('每月爬了多少层楼', '按日汇总到月',
    '<div id="c-flights" class="chart"></div>', '');
  h += card('站立小时', num(standTot) + ' 个小时的判定',
    '<div id="c-standh" class="chart"></div>',
    '手表每小时判一次「站着」还是「坐着」，缺的那部分是没戴表的时段。');

  // 极值：负荷是「每分钟每公斤体重的千卡」，峰值封顶 20
  const ePeak = dayPeak(r.byDay, 'effMax', 'max');
  let eAvgHi = null;
  for (const d in r.byDay) {
    const o = r.byDay[d];
    if (!o.effN) continue;
    const v = o.effS / o.effN;
    if (!eAvgHi || v > eAvgHi.v) eAvgHi = { d: d, v: v };
  }
  const eBurn = dayPeak(r.byDay, 'energy', 'max');
  const eBasal = dayPeak(r.byDay, 'basal', 'max');
  const eCyc = dayPeak(r.byDay, 'cyc', 'max');
  const eStood = dayPeak(r.byDay, 'stood', 'max');
  const eIdle = dayPeak(r.byDay, 'idle', 'max');
  let efHour = 0;
  for (let i = 1; i < ef.hourAvg.length; i++) if (ef.hourAvg[i] > ef.hourAvg[efHour]) efHour = i;
  h += card('这段里的几个极值', '都是真出现过的一天，不是平均值', factsHTML([
    [ePeak ? dec(ePeak.v, 1) : '—', '', '负荷峰值最高的一天', ePeak ? ePeak.d : ''],
    [eAvgHi ? dec(eAvgHi.v, 2) : '—', '', '日均负荷最高的一天', eAvgHi ? eAvgHi.d : ''],
    [eBurn ? num(eBurn.v) : '—', '千卡', '烧得最多的一天', eBurn ? eBurn.d : ''],
    [eBasal ? num(eBasal.v) : '—', '千卡', '静息消耗最高的一天', eBasal ? eBasal.d : ''],
    [eCyc ? dec(eCyc.v, 2) : '—', 'km', '骑行最远的一天', eCyc ? eCyc.d : ''],
    [eStood ? num(eStood.v) : '—', '小时', '站得最久的一天', eStood ? eStood.d : ''],
    [eIdle ? num(eIdle.v) : '—', '小时', '坐得最久的一天', eIdle ? eIdle.d : ''],
    [efHour + ' 点前后', '', '一天里最累的钟点', '平均 ' + dec(ef.hourAvg[efHour], 1)],
  ]), '极值是把当天所有记录直接累加，同一天有多个来源重复写入时会偏高 —— 看相对大小，别当绝对账。');

  host.innerHTML = h;
  mount('#c-efclock', C.clockRing(ef.hourAvg, {
    size: 400, min: 1.5, max: Math.max(5, Math.max.apply(null, ef.hourAvg)),
    centerValue: ef.avg,
    centerLabel: '平均负荷',
    color: (v, lo, hi) => {
      const t = (v - lo) / (hi - lo || 1);
      return t > 0.8 ? 'var(--red)' : t > 0.55 ? 'var(--amber)' : 'var(--blue)';
    },
  }));
  mount('#c-efday', C.line(effDay, { color: 'var(--amber)', w: CW, h: CH(230), pad: NARROW ? 30 : 34, minPad: 0.3 }));
  mount('#c-enhour', C.bars(hourAvgE, {
    w: CW, h: CH(190), color: 'var(--amber)', pad: NARROW ? 26 : 30,
    labelFmt: hh => hh + '时',
  }));
  // 楼层：没直接存日明细的求和，用 byDay 里的 flights 现算
  const fl = Object.keys(r.byDay).sort()
    .filter(d => r.byDay[d].flights)
    .map(d => [d, r.byDay[d].flights]);
  mount('#c-flights', C.line(byMonthSum(fl).slice(-24), { color: 'var(--green)', w: CW, h: CH(200), pad: NARROW ? 30 : 34, minPad: 0 }));
  mount('#c-standh', C.hbarsHTML([
    { name: '站着', value: r.standHour.stood, valueText: num(r.standHour.stood) + ' 小时' },
    { name: '坐着', value: r.standHour.idle, valueText: num(r.standHour.idle) + ' 小时',
      sub: standTot ? Math.round(r.standHour.idle / standTot * 100) + '% 的时间' : '' },
  ], { color: 'var(--cyan)', labelW: 90 }));
}

/* ---------------- 移动 ---------------- */

function viewMobility(r, host) {
  const g = r.gait;
  const avg = arr => (arr.length ? arr.reduce((a, x) => a + x[1], 0) / arr.length : 0);
  // 不对称/双支撑是长尾分布：一半的日子接近 0，偶尔跳到 40%，
  // 均值会被那几天拉高，所以这两个用中位数
  const med = arr => {
    if (!arr.length) return 0;
    const v = arr.map(x => x[1]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const lastOf = arr => (arr.length ? arr[arr.length - 1][1] : 0);
  // 单日值会被异常那天带跑（不对称最高到过 40%），取最近 7 天均值更稳
  const recent = (arr, n) => {
    const s = arr.slice(-(n || 7));
    return s.length ? s.reduce((a, x) => a + x[1], 0) / s.length : 0;
  };
  // 双支撑/不对称/稳定度在导出里是 0–1 的比例，单位写着 % 但值不是百分数
  const pctOf = arr => arr.map(x => [x[0], +(x[1] * 100).toFixed(1)]);

  const spdAvg = avg(g.speed), spdLast = recent(g.speed);
  const slAvg = avg(g.stepLen), slLast = recent(g.stepLen);
  const dblAvg = med(g.dblSup) * 100, dblLast = recent(g.dblSup) * 100;
  // 不对称一半的日子是 0（没有测出差异），中位数会变成 0.0%，这里仍用均值
  const asymAvg = avg(g.asym) * 100, asymLast = recent(g.asym) * 100;
  const steadyLast = lastOf(g.steady) * 100;
  const sixLast = lastOf(g.sixmw);

  let h = renderPersona(pMobility(r, r.days || 1), '这 ' + num(r.days || 1) + ' 天里，你的步态是') +
    '<div class="grid">' +
    stat(dec(spdAvg, 2) + ' km/h', '步行速度', '最近一周 ' + dec(spdLast, 2) + ' · ' + g.speed.length + ' 天', sref('speed', spdAvg)) +
    stat(dec(slAvg, 1) + ' cm', '步长', '最近一周 ' + dec(slLast, 1) + ' cm', sref('steplen', slAvg)) +
    stat(dec(dblAvg, 1) + '%', '双支撑占比', '中位数 · 最近一周 ' + dec(dblLast, 1) + '%', sref('dbl', dblAvg)) +
    stat(dec(asymAvg, 1) + '%', '左右不对称', '越高越不平衡 · 最近一周 ' + dec(asymLast, 1) + '%', sref('asym', asymAvg)) +
    stat(steadyLast ? Math.round(steadyLast) + '%' : '—', '行走稳定度', g.steady.length + ' 次体检', sref('steady', steadyLast)) +
    stat(sixLast ? Math.round(sixLast) + ' m' : '—', '六分钟步行', g.sixmw.length + ' 次', sref('sixmw', sixLast)) +
    '</div>';

  h += card('走路有多快', '按日平均 · ' + g.speed.length + ' 天',
    '<div id="c-spd" class="chart"></div>',
    'Apple 在带手机走路时抽样估算的速度。起伏大是因为有时手里拿着东西、有时在跑。');
  h += card('步幅', '按日平均 · ' + g.stepLen.length + ' 天',
    '<div id="c-sl" class="chart"></div>', '');
  h += card('双支撑占比', '按月平均',
    '<div id="c-bal" class="chart"></div>',
    '两只脚同时着地的时间占比，正常走路约 20–35%。这里是按月平均——六年基本没动过，一直在 29–31% 之间，中间那次下沉是 2025 年春天。');
  h += card('上楼有多快', '按月平均',
    '<div id="c-stair" class="chart"></div>',
    'StairAscentSpeed 是手表在你爬楼时估算的垂直速度，一般 0.2–0.5 m/s。下楼速度波动更大，放在下面一起看。');
  h += card('活动能力体检', '手表自己算的几项',
    '<div id="c-fit" class="chart"></div>',
    '行走稳定度来自 iPhone 走路时的姿态分析，六分钟步行是专门测的，步行心率是走路时的平均心率。');

  // 极值：步态序列已经是「先按日平均」，所以这里的日子不会因为当天记了几条而失真
  const gp = (arr, dir) => (arr.length
    ? arr.reduce((a, b) => (dir === 'max' ? (b[1] > a[1] ? b : a) : (b[1] < a[1] ? b : a)))
    : null);
  const spHi = gp(g.speed, 'max'), spLo = gp(g.speed, 'min');
  const slMax = gp(g.stepLen, 'max'), slMin = gp(g.stepLen, 'min');
  const dblMin = gp(g.dblSup, 'min');
  const asymMax = gp(g.asym, 'max');
  const ascMax = gp(g.asc, 'max');
  const sixMax = gp(g.sixmw, 'max');
  h += card('这段里的几个极值', '都是真出现过的一天，不是平均值', factsHTML([
    [spHi ? dec(spHi[1], 2) : '—', 'km/h', '走得最快的一天', spHi ? spHi[0] : ''],
    [spLo ? dec(spLo[1], 2) : '—', 'km/h', '走得最慢的一天', spLo ? spLo[0] : ''],
    [slMax ? dec(slMax[1], 1) : '—', 'cm', '步长最大的一天', slMax ? slMax[0] : ''],
    [slMin ? dec(slMin[1], 1) : '—', 'cm', '步长最小的一天', slMin ? slMin[0] : ''],
    [dblMin ? dec(dblMin[1] * 100, 1) : '—', '%', '双支撑最低的一天', dblMin ? dblMin[0] + ' · 越低越利落' : ''],
    [asymMax ? dec(asymMax[1] * 100, 1) : '—', '%', '左右差最大的一天', asymMax ? asymMax[0] : ''],
    [ascMax ? dec(ascMax[1], 2) : '—', 'm/s', '上楼最快的一天', ascMax ? ascMax[0] : ''],
    [sixMax ? Math.round(sixMax[1]) : '—', 'm', '六分钟走得最远的一次', sixMax ? sixMax[0] : ''],
  ]), '');

  host.innerHTML = h;
  mount('#c-spd', C.line(g.speed, { color: 'var(--green)', w: CW, h: CH(220), pad: NARROW ? 30 : 34, minPad: 0.15 }));
  mount('#c-sl', C.line(g.stepLen, { color: 'var(--blue)', w: CW, h: CH(200), pad: NARROW ? 30 : 34, minPad: 1 }));
  mount('#c-bal', C.line(byMonthAvg(pctOf(g.dblSup)), { color: 'var(--amber)', w: CW, h: CH(210), pad: NARROW ? 30 : 34, minPad: 0.5 }));
  mount('#c-stair', C.line(byMonthAvg(g.asc), { color: 'var(--violet)', w: CW, h: CH(200), pad: NARROW ? 30 : 34, minPad: 0.02 }));
  mount('#c-fit', C.hbarsHTML([
    { name: '行走稳定度', value: steadyLast, valueText: steadyLast ? Math.round(steadyLast) + '%' : '—',
      sub: g.steady.length ? g.steady.length + ' 次 · 最低 ' + Math.round(Math.min.apply(null, g.steady.map(x => x[1])) * 100) + '%' : '' },
    { name: '六分钟步行', value: sixLast, valueText: sixLast ? Math.round(sixLast) + ' m' : '—',
      sub: g.sixmw.length + ' 次' },
    { name: '步行心率', value: avg(g.walkHr), valueText: dec(avg(g.walkHr), 1) + ' bpm',
      sub: g.walkHr.length + ' 天' },
    { name: '上楼速度', value: avg(g.asc), valueText: dec(avg(g.asc), 2) + ' m/s', sub: '按日平均' },
    { name: '下楼速度', value: avg(g.desc), valueText: dec(avg(g.desc), 2) + ' m/s', sub: '按日平均' },
  ], { color: 'var(--cyan)', labelW: 130 }));
}

/* ---------------- 设备 ---------------- */

function viewDevices(r, host) {
  let h = renderPersona(pDevices(r, r.days || 1), '这 ' + num(r.days || 1) + ' 天里，你的记录是') +
    '<div class="grid">' +
    stat(r.devices.length, '台设备', '') +
    stat(r.sources.length, '个数据源', '') +
    stat(r.meta.entries, '个文件', '在压缩包里') +
    stat(bytes(r.meta.zipBytes), '压缩包大小', '') +
    stat(dec(r.meta.ms / 1000, 1) + ' 秒', '解析耗时', num(r.meta.lines) + ' 行') +
    '</div>';

  h += card('数据来源', '', '<div id="c-src" class="chart"></div>',
    '同一个设备可能既有 Watch 的采集，也有第三方 App 的写入，所以这里按写入方统计。');
  h += card('设备', '', '<div id="c-dev2" class="chart"></div>', '');
  h += card('个人资料', '来自导出文件头部',
    table([['字段'], ['值']], [
      ['出生日期', esc(r.me.birth || '—')],
      ['性别', esc(r.me.sex || '—')],
      ['血型', esc(r.me.blood || '—')],
      ['肤色类型', esc(r.me.skin || '—')],
      ['心血管用药', esc(r.me.meds || '—')],
      ['导出时间', esc(r.exportDate)],
      ['语言环境', esc(r.locale)],
    ]),
    '这些是「健康」App 里填过的基础信息，没填就是 NotSet。');

  host.innerHTML = h;
  mount('#c-src', C.hbarsHTML(r.sources.map(([k, n]) => ({ name: k, value: n, valueText: num(n) })), { color: 'var(--violet)', maxItems: 12 }));
  mount('#c-dev2', C.hbarsHTML(r.devices.map(([k, n]) => ({ name: k, value: n, valueText: num(n) })), { color: 'var(--cyan)', maxItems: 12 }));
}

