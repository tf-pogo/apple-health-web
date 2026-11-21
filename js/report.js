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
function stat(v, label, sub) { return '<div class="stat"><b>' + v + '</b><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }
function card(title, sub, body, note) { return '<div class="card"><h3>' + title + (sub ? ' <span>' + sub + '</span>' : '') + '</h3>' + body + (note ? '<p class="note">' + note + '</p>' : '') + '</div>'; }
function table(head, rows) {
  let h = '<div class="table-wrap"><table class="data"><thead><tr>' + head.map(x => '<th' + (x[1] ? ' class="' + x[1] + '"' : '') + '>' + x[0] + '</th>').join('') + '</tr></thead><tbody>';
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

  // 手记的那些：条数都不多，但全是自己记的，跟手表采的不是一回事
  const SYM = {
    RapidPoundingOrFlutteringHeartbeat: '心悸 / 心跳过快',
    Fatigue: '疲劳', ShortnessOfBreath: '气短', Dizziness: '头晕',
  };
  const odd = []
    .concat(r.life.water.map(x => [x[0], '喝水', Math.round(x[1]) + ' mL']))
    .concat(r.life.caffeine.map(x => [x[0], '咖啡因', Math.round(x[1]) + ' mg']))
    .concat(r.life.mindful.map(x => [x[0], '正念', x[1] ? x[1] + ' 分钟' : '—']))
    .concat(r.life.sex.map(x => [x[0], '性行为', x[1] ? x[1] + ' 分钟' : '—']))
    .concat((r.symptoms || []).map(x => [x[0] + ' ' + x[1], '症状', SYM[x[2]] || x[2]]))
    .concat((r.sleepGoal || []).map(x => [x[0], '睡眠目标', x[1] + ' 小时']))
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));

  h += card('零散但也在记的事', odd.length + ' 条手记 · 最近 ' + Math.min(16, odd.length) + ' 条',
    odd.length ? table([['时间'], ['记了什么'], ['值', 'num']], odd.slice(0, 16).map(x =>
      [esc(x[0]), esc(x[1]), esc(x[2])])) : '<p class="note">这段时间里没有手记。</p>',
    '喝水、咖啡因、正念、睡眠目标和症状都是手动记的或第三方 App 写的，条数少，单独列出来免得被大数盖掉。');

  host.innerHTML = h;
  mount('#c-types', C.hbarsHTML(types.map(([k, n]) => ({
    name: labelOf(k), value: n,
    sub: dec(n / total * 100) + '%',
    valueText: num(n),
  })), { color: 'var(--green)', maxItems: 10 }));
  mount('#c-sources', C.hbarsHTML(r.sources.slice(0, 10).map(([k, n]) => ({
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
  mount('#c-hist', C.histogram(hr.hist, { min: hr.histMin, bin: hr.histBin, color: 'var(--red)', w: CW, h: CH(180) }));
  mount('#c-hrday', C.line(hr.day.map(d => [d[0], d[1]]), { color: 'var(--green)', w: CW, h: CH(230), pad: NARROW ? 30 : 34 }));
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
  const lenN = Math.min(NARROW ? 60 : 90, ns.length);
  h += card('睡多久', '最近 ' + lenN + ' 夜',
    '<div id="c-len" class="chart"></div>', '');
  h += card('睡眠结构', '平均每晚',
    '<div class="two-col"><div id="c-donut" class="chart"></div><div id="c-donut-legend"></div></div>', '');

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
  h += card('运动记录', r.workouts.length + ' 次',
    '<div id="c-wk" class="chart"></div>', '');

  const rows = r.workouts.slice(-14).reverse().map(w =>
    [esc(w.s.slice(0, 16)), esc(labelOf('Workout:' + w.t)), Math.round(w.dur) + ' 分',
     w.dist ? dec(w.dist, 2) + ' km' : '—', w.kcal ? Math.round(w.kcal) : '—',
     w.avgHr ? Math.round(w.avgHr) : '—']);

  host.innerHTML = h;
  mount('#c-cal', C.calendarYears(sd, { cell: 12, gap: 2.4 }));
  mount('#c-rings', C.hbarsHTML([
    { name: '活动环 Move', value: closedMove, valueText: closedMove + ' / ' + as.length },
    { name: '锻炼环 Exercise', value: closedEx, valueText: closedEx + ' / ' + as.length },
    { name: '站立环 Stand', value: closedStand, valueText: closedStand + ' / ' + as.length },
    { name: '三期全合上', value: allThree, valueText: allThree + ' / ' + as.length },
  ], { color: 'var(--green)', labelW: 130 }));
  mount('#c-wk', C.hbarsHTML(wk.map(([k, v]) => ({ name: labelOf('Workout:' + k), value: v, valueText: v + ' 次' })), { color: 'var(--blue)', labelW: 150 }));
  host.insertAdjacentHTML('beforeend', card('最近的运动',
    '最后 14 次',
    table([['时间'], ['类型'], ['时长', 'num'], ['距离', 'num'], ['千卡', 'num'], ['均心率', 'num']], rows)));
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

  let h = '<div class="grid">' +
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
  h += card('一天的能量从哪来', '静息 vs 活动',
    '<div class="two-col"><div id="c-esplit" class="chart"></div><div id="c-esplit-legend"></div></div>',
    '静息能量是基础代谢，活动能量是走路、运动额外加的那部分。');
  h += card('每月爬了多少层楼', '按日汇总到月',
    '<div id="c-flights" class="chart"></div>', '');
  h += card('站立小时', num(standTot) + ' 个小时的判定',
    '<div id="c-standh" class="chart"></div>',
    '手表每小时判一次「站着」还是「坐着」，缺的那部分是没戴表的时段。');

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
  mount('#c-esplit', C.donut([
    { name: '静息', value: rest, color: 'var(--blue)' },
    { name: '活动', value: act, color: 'var(--amber)' },
  ], { size: 210 }));
  mount('#c-esplit-legend', (() => {
    const d = document.createElement('div');
    d.className = 'legend';
    d.style.flexDirection = 'column';
    [['静息 ' + num(rest) + ' 千卡', 'var(--blue)'], ['活动 ' + num(act) + ' 千卡', 'var(--amber)']]
      .forEach(([t, c]) => {
        const s = document.createElement('span');
        s.innerHTML = '<i style="background:' + c + '"></i>' + t;
        d.appendChild(s);
      });
    return d;
  })());

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

  let h = '<div class="grid">' +
    stat(dec(spdAvg, 2) + ' km/h', '步行速度', '最近一周 ' + dec(spdLast, 2) + ' · ' + g.speed.length + ' 天') +
    stat(dec(slAvg, 1) + ' cm', '步长', '最近一周 ' + dec(slLast, 1) + ' cm') +
    stat(dec(dblAvg, 1) + '%', '双支撑占比', '中位数 · 最近一周 ' + dec(dblLast, 1) + '%') +
    stat(dec(asymAvg, 1) + '%', '左右不对称', '越高越不平衡 · 最近一周 ' + dec(asymLast, 1) + '%') +
    stat(steadyLast ? Math.round(steadyLast) + '%' : '—', '行走稳定度', g.steady.length + ' 次体检') +
    stat(sixLast ? Math.round(sixLast) + ' m' : '—', '六分钟步行', g.sixmw.length + ' 次') +
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
  mount('#c-src', C.hbarsHTML(r.sources.map(([k, n]) => ({ name: k, value: n, valueText: num(n) })), { color: 'var(--violet)', maxItems: 12 }));
  mount('#c-dev2', C.hbarsHTML(r.devices.map(([k, n]) => ({ name: k, value: n, valueText: num(n) })), { color: 'var(--cyan)', maxItems: 12 }));
}

