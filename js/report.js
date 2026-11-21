import * as C from './charts.js';
import { pick, spanOf, PRESETS } from './range.js';

const nf = new Intl.NumberFormat('zh-CN');
function num(v) { return nf.format(Math.round(v)); }
function dec(v, d) { return (+v).toFixed(d == null ? 1 : d); }
function bytes(b) { if (b > 1073741824) return dec(b / 1073741824) + ' GB'; if (b > 1048576) return dec(b / 1048576) + ' MB'; return Math.round(b / 1024) + ' KB'; }
function hm(hours) { const h = Math.floor(hours), m = Math.round((hours - h) * 60); return h + ' 小时 ' + m + ' 分'; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function mount(sel, node) { const h = document.querySelector(sel); if (h && node) h.appendChild(node); }
function stat(v, label, sub) { return '<div class="stat"><b>' + v + '</b><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
function card(title, sub, body, note) { return '<div class="card"><h3>' + title + (sub ? ' <span>' + sub + '</span>' : '') + '</h3>' + body + (note ? '<p class="note">' + note + '</p>' : '') + '</div>'; }
function table(head, rows) {
  let h = '<table class="data"><thead><tr>' + head.map(x => '<th' + (x[1] ? ' class="' + x[1] + '"' : '') + '>' + x[0] + '</th>').join('') + '</tr></thead><tbody>';
  rows.forEach(r => { h += '<tr>' + r.map((c, i) => '<td' + (head[i] && head[i][1] ? ' class="' + head[i][1] + '"' : '') + '>' + c + '</td>').join('') + '</tr>'; });
  return h + '</tbody></table>';
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
  else viewDevices(R, v);
}

/* ---------------- 概览 ---------------- */

/** 分钟 → 人话 */
function mins(v) {
  if (!v) return '0 分钟';
  if (v < 60) return Math.round(v) + ' 分钟';
  return Math.floor(v / 60) + ' 小时 ' + Math.round(v % 60) + ' 分';
}

function viewOverview(r, host) {
  const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
  const typeCount = Object.keys(r.counts).filter(k => k.indexOf('Workout:') !== 0).length;
  const days = r.days || r.hr.day.length || 1;
  const ns = r.sleep.nights;
  const sleepSum = ns.reduce((a, n) => a + n.asleep, 0);
  const wkMin = r.workouts.reduce((a, w) => a + (w.dur || 0), 0);

  // 这一段时间的六个大数：心跳、睡眠、日光、步数、距离、能量
  let h = '<div class="grid six">' +
    stat(num(r.hr.n), '次心率读数', '平均 ' + r.hr.avg + ' bpm · 最高 ' + r.hr.max) +
    stat(num(sleepSum) + ' 小时', '累计睡眠', ns.length + ' 夜 · 平均 ' +
      dec(ns.length ? sleepSum / ns.length : 0) + ' 小时') +
    stat(num(r.light.total / 60) + ' 小时', '晒太阳', num(r.light.total) + ' 分钟 · 按手表的日光暴露统计') +
    stat(num(r.steps.total), '步', '日均 ' + num(r.steps.total / days)) +
    stat(num(r.dist.total) + ' km', '走过和跑过', '步行与跑步距离') +
    stat(num(r.energy.total), '千卡', '活动能量') +
    '</div>' +
    '<p class="summary-line">' +
      '这段时间还戴了 <b>' + (r.hp.hours ? num(r.hp.hours) + ' 小时' : '—') + '</b> 耳机（' + num(r.hp.n) + ' 条音量采样）' +
      ' · 做了 <b>' + r.workouts.length + ' 次</b>运动' +
        (r.workouts.length ? '（' + Math.round(wkMin) + ' 分钟）' : '') +
      ' · 静息心率 <b>' + r.rhr.avg + ' bpm</b>' +
      ' · 血氧 <b>' + r.spo2.avg + '%</b>' +
    '</p>';

  // 记录类型 Top（按全量统计，换范围不改）
  const types = Object.entries(r.counts)
    .filter(([k]) => k.indexOf('Workout:') !== 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 12);
  h += card('记录最多的数据', '全量 ' + num(total) + ' 条 / ' + typeCount + ' 种',
    '<div id="c-types" class="chart"></div>',
    '这是整份导出里出现频次最高的 12 类记录，不随时间范围变化。Apple Watch 每分钟的心率采样通常占掉一半以上。');
  h += card('数据从哪来', '全量 ' + r.sources.length + ' 个来源',
    '<div id="c-sources" class="chart"></div>',
    '同一部 iPhone 上装过的健康类 App 都会往里写数据，所以来源往往比设备多。');

  host.innerHTML = h;
  mount('#c-types', C.hbars(types.map(([k, n]) => ({
    name: labelOf(k), value: n,
    sub: dec(n / total * 100) + '%',
    valueText: num(n),
  })), { color: 'var(--green)', maxItems: 10 }));
  mount('#c-sources', C.hbars(r.sources.slice(0, 10).map(([k, n]) => ({
    name: k, value: n, valueText: num(n),
  })), { color: 'var(--blue)' }));
}

/* ---------------- 耳朵 ---------------- */

function viewAudio(r, host) {
  const hp = r.hp;
  const days = hp.day.length;
  let h = '<div class="grid">' +
    stat(hm(hp.hours), '戴耳机总时长', days + ' 天有记录') +
    stat(days ? hm(hp.hours / days) : '—', '有记录时日均', '') +
    stat(hp.avg + ' dB', '平均音量', '峰值 ' + hp.max + ' dB') +
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

  host.innerHTML = h;
  mount('#c-dev', C.hbars(hp.devices.slice(0, 12).map(d => ({
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
  mount('#c-day', C.bars(recent.map(d => d[1]), { w: 900, h: 170, color: 'var(--amber)', labels: false }));
}

/* ---------------- 心脏 ---------------- */

function viewHeart(r, host) {
  const hr = r.hr;
  let h = '<div class="grid">' +
    stat(num(hr.n), '次采样', hr.p50 + ' bpm 中位') +
    stat(hr.avg + ' bpm', '平均', '范围 ' + hr.min + '–' + hr.max) +
    stat(hr.p95 + ' bpm', '95 分位', '99 分位 ' + hr.p99) +
    stat(r.rhr.avg + ' bpm', '静息心率', r.rhr.n + ' 次测量') +
    stat(r.hrv.avg + ' ms', '心率变异性', r.hrv.n + ' 次') +
    stat(r.spo2.avg + '%', '血氧', r.spo2.n + ' 次 · 最低 ' + r.spo2.min + '%') +
    '</div>';

  h += card('一天里，心脏什么时候最忙', '按小时聚合 ' + num(hr.n) + ' 次采样',
    '<div id="c-hrclock" class="chart"></div>',
    '圆心到外缘是一整天的 24 小时，静息与活动混在一起，所以环的形状本身就是作息表。');
  h += card('心率分布', '每格 ' + hr.histBin + ' bpm',
    '<div id="c-hist" class="chart"></div>',
    '左边是睡着和静息，右边是运动。超过 180 的那条尾巴，几乎都来自几次冲刺。');
  h += card('每天的平均心率', hr.day.length + ' 天',
    '<div id="c-hrday" class="chart"></div>', '');

  host.innerHTML = h;
  mount('#c-hrclock', C.clockRing(hr.hourAvg, {
    size: 400, min: 50, max: Math.max(120, Math.max.apply(null, hr.hourAvg)),
    centerValue: hr.p50,
    centerLabel: '中位心率',
    color: (v) => v >= 100 ? 'var(--red)' : v >= 85 ? 'var(--amber)' : 'var(--blue)',
  }));
  mount('#c-hist', C.histogram(hr.hist, { min: hr.histMin, bin: hr.histBin, color: 'var(--red)' }));
  mount('#c-hrday', C.line(hr.day.map(d => [d[0], d[1]]), { color: 'var(--green)', w: 900, h: 230 }));
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
  // 入睡时间跨午夜，直接算术平均会把 23 点和 1 点平摊成中午。
  // 用单位圆上的平均向量（angle-mean），对跨零点分布才是无偏的
  const hhmm = s => { const p = s.split(':'); return +p[0] + (+p[1]) / 60; };
  const clockMean = list => {
    let sx = 0, sy = 0;
    list.forEach(v => { const a = v / 24 * Math.PI * 2; sx += Math.cos(a); sy += Math.sin(a); });
    let a = Math.atan2(sy / list.length, sx / list.length);
    if (a < 0) a += Math.PI * 2;
    return a / (Math.PI * 2) * 24;
  };
  const fmtClock = v => String(Math.floor(v) % 24).padStart(2, '0') + ':' + String(Math.round((v % 1) * 60)).padStart(2, '0');
  const bedStr = fmtClock(clockMean(ns.map(x => hhmm(x.bed))));
  const wakeStr = fmtClock(clockMean(ns.map(x => hhmm(x.wake))));
  void wakeStr;

  let h = '<div class="grid">' +
    stat(dec(avgA), '平均睡眠小时', ns.length + ' 个夜晚') +
    stat(bedStr, '平均入睡', '平均 ' + wakeStr + ' 起') +
    stat(dec(avgDeep, 2) + ' h', '深睡', dec(avgDeep / avgA * 100) + '%') +
    stat(dec(avgRem, 2) + ' h', 'REM', dec(avgRem / avgA * 100) + '%') +
    stat(dec(avgAwake, 2) + ' h', '夜间清醒', '') +
    '</div>';

  h += card('每一夜，从几点睡到几点', ns.length + ' 夜',
    '<div id="c-bands" class="chart"></div>',
    '一条线是一夜，贴着轴往下掉就是越睡越晚的时段。纵轴把中午 12 点当成 0 点，这样跨零点的夜晚才连得起来。');
  h += card('睡多久', '最近 ' + Math.min(90, ns.length) + ' 夜',
    '<div id="c-len" class="chart"></div>', '');
  h += card('睡眠结构', '平均每晚',
    '<div class="two-col"><div id="c-donut" class="chart"></div><div id="c-donut-legend"></div></div>', '');

  host.innerHTML = h;
  mount('#c-bands', C.sleepBands(ns, { w: 900, h: 280 }));
  mount('#c-len', C.bars(ns.slice(-90).map(x => x.asleep), { w: 900, h: 170, color: 'var(--blue)', labels: false }));
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

  let h = '<div class="grid">' +
    stat(num(r.steps.total), '总步数', sd.length + ' 天') +
    stat(num(avgs), '日均步数', '') +
    stat(best ? num(best[1]) : '—', '最高单日', best ? best[0] : '') +
    stat(num(r.dist.total) + ' km', '总距离', '步行与跑步') +
    stat(num(r.energy.total), '千卡', '活动能量') +
    stat(r.workouts.length, '次运动', '') +
    '</div>';

  h += card('哪些天真的在走路', sd.length + ' 个有效日',
    '<div id="c-cal" class="chart"></div>',
    '每一格是一天，颜色越亮走得越多。中间那几片黑，不是没走路，是那段时间压根没戴表。');
  h += card('运动记录', r.workouts.length + ' 次',
    '<div id="c-wk" class="chart"></div>', '');

  const rows = r.workouts.slice(-14).reverse().map(w =>
    [esc(w.s.slice(0, 16)), esc(labelOf('Workout:' + w.t)), Math.round(w.dur) + ' 分',
     w.dist ? dec(w.dist, 2) + ' km' : '—', w.kcal ? Math.round(w.kcal) : '—',
     w.avgHr ? Math.round(w.avgHr) : '—']);

  host.innerHTML = h;
  mount('#c-cal', C.calendarYears(sd, { cell: 12, gap: 2.4 }));
  mount('#c-wk', C.hbars(wk.map(([k, v]) => ({ name: labelOf('Workout:' + k), value: v, valueText: v + ' 次' })), { color: 'var(--blue)', labelW: 150 }));
  host.insertAdjacentHTML('beforeend', card('最近的运动',
    '最后 14 次',
    table([['时间'], ['类型'], ['时长', 'num'], ['距离', 'num'], ['千卡', 'num'], ['均心率', 'num']], rows)));
}

/* ---------------- 设备 ---------------- */

function viewDevices(r, host) {
  let h = '<div class="grid">' +
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
  mount('#c-src', C.hbars(r.sources.map(([k, n]) => ({ name: k, value: n, valueText: num(n) })), { color: 'var(--violet)', maxItems: 12 }));
  mount('#c-dev2', C.hbars(r.devices.map(([k, n]) => ({ name: k, value: n, valueText: num(n) })), { color: 'var(--cyan)', maxItems: 12 }));
}

