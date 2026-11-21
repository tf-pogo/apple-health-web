/**
 * 时间范围切片。
 *
 * 解析阶段已经把每天的原始计数存进 r.byDay，所以换范围只是在这张索引上求和，
 * 毫秒级，不用回头重扫 200 万行 XML。
 */

const HR_MIN = 30, HR_BIN = 5;

export const PRESETS = [
  ['7d', '近一周'],
  ['1m', '近一月'],
  ['1y', '近一年'],
  ['all', '全部'],
];

const iso = d => d.toISOString().slice(0, 10);

/** 预设计算：锚点是「数据里最后一天」，不是系统今天 —— 这是一份回放，不是实时看板 */
export function spanOf(r, k) {
  const last = r.lastDate || r.firstDate;
  if (!last || k === 'all') return { from: r.firstDate, to: last };
  const end = new Date(last + 'T00:00:00Z');
  const d = new Date(end);
  if (k === '7d') d.setUTCDate(d.getUTCDate() - 6);
  else if (k === '1m') d.setUTCDate(d.getUTCDate() - 29);
  else if (k === '1y') { d.setUTCFullYear(d.getUTCFullYear() - 1); d.setUTCDate(d.getUTCDate() + 1); }
  const from = iso(d);
  return { from: from < r.firstDate ? r.firstDate : from, to: last };
}

function percentile(hist, total) {
  if (!total) return { p50: 0, p95: 0, p99: 0 };
  let acc = 0, p50 = 0, p95 = 0, p99 = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (!p50 && acc >= total * 0.5) p50 = HR_MIN + i * HR_BIN + HR_BIN / 2;
    if (!p95 && acc >= total * 0.95) p95 = HR_MIN + i * HR_BIN + HR_BIN / 2;
    if (!p99 && acc >= total * 0.99) p99 = HR_MIN + i * HR_BIN + HR_BIN / 2;
  }
  return { p50, p95, p99 };
}

/** 取出 [from, to] 这段（含首尾），返回一个和 finalize 结果同构的对象 */
export function pick(r, from, to) {
  const byDay = r.byDay || {};
  const keys = Object.keys(byDay).sort();
  const sel = keys.filter(d => (!from || d >= from) && (!to || d <= to));
  const inRange = new Set(sel);

  const hrHourN = new Array(24).fill(0), hrHourS = new Array(24).fill(0);
  const hpHourN = new Array(24).fill(0), hpHourS = new Array(24).fill(0);
  const hist = new Array(r.hr.hist.length).fill(0);
  const hrDay = [], hpDay = [], stepDay = [], energyDay = [];
  // 「全部数据」补进来的那批，同样只在日索引上求和
  const effHourN = new Array(24).fill(0), effHourS = new Array(24).fill(0);
  const effortDay = [], speedDay = [], stepLenDay = [], dblDay = [], asymDay = [];
  const ascDay = [], descDay = [], whrDay = [];
  let effS = 0, effN = 0, effMax = 0;
  let basal = 0, cyc = 0, flights = 0, stood = 0, idle = 0;
  let wsS = 0, wsN = 0, slS = 0, slN = 0, dblS = 0, dblN = 0, asymS = 0, asymN = 0;
  let ascS = 0, ascN = 0, descS = 0, descN = 0, whrS = 0, whrN = 0;

  let hrN = 0, hrSum = 0, hrMin = Infinity, hrMax = 0;
  let hpN = 0, hpSum = 0, hpMax = 0, hpDur = 0, o80 = 0, o85 = 0, o90 = 0;
  let steps = 0, dist = 0, energy = 0, light = 0, stand = 0, exer = 0;
  let spo2N = 0, spo2Sum = 0, spo2Min = 100, spo2Max = 0, spo2Low = 0;
  let respN = 0, respSum = 0;
  let rhrN = 0, rhrSum = 0, rhrLast = null;
  let hrvN = 0, hrvSum = 0;

  for (const d of sel) {
    const o = byDay[d];
    if (o.hrN) {
      hrN += o.hrN; hrSum += o.hrS;
      if (o.hrMin < hrMin) hrMin = o.hrMin;
      if (o.hrMax > hrMax) hrMax = o.hrMax;
      hrDay.push([d, Math.round(o.hrS / o.hrN)]);
    }
    for (let i = 0; i < 24; i++) {
      hrHourN[i] += o.hrH[i]; hrHourS[i] += o.hrH[24 + i];
      hpHourN[i] += o.hpH[i]; hpHourS[i] += o.hpH[24 + i];
    }
    if (o.hrB) for (const b in o.hrB) hist[+b] += o.hrB[b];
    if (o.hpN) {
      hpN += o.hpN; hpSum += o.hpS; hpDur += o.hpDur;
      if (o.hpMax > hpMax) hpMax = o.hpMax;
      o80 += o.hpO80; o85 += o.hpO85; o90 += o.hpO90;
      hpDay.push([d, +(o.hpDur / 60).toFixed(2)]);
    }
    if (o.steps) { steps += o.steps; stepDay.push([d, o.steps]); }
    if (o.dist) dist += o.dist;
    if (o.energy) { energy += o.energy; energyDay.push([d, o.energy]); }
    light += o.light; stand += o.stand; exer += o.exer;
    if (o.spo2N) {
      spo2N += o.spo2N; spo2Sum += o.spo2S;
      if (o.spo2Min < spo2Min) spo2Min = o.spo2Min;
      if (o.spo2Min > spo2Max) spo2Max = o.spo2Min;
      spo2Low += o.spo2Low;
    }
    if (o.respN) { respN += o.respN; respSum += o.respS; }
    if (o.rhr) { rhrN++; rhrSum += o.rhr; rhrLast = [d, o.rhr]; }
    if (o.hrv) { hrvN++; hrvSum += o.hrv; }

    if (o.effN) {
      effS += o.effS; effN += o.effN;
      if (o.effMax > effMax) effMax = o.effMax;
      effortDay.push([d, +(o.effS / o.effN).toFixed(2)]);
      for (let i = 0; i < 24; i++) { effHourN[i] += o.effH[i]; effHourS[i] += o.effH[24 + i]; }
    }
    basal += o.basal || 0; cyc += o.cyc || 0; flights += o.flights || 0;
    stood += o.stood || 0; idle += o.idle || 0;
    if (o.wsN) { wsS += o.wsS; wsN += o.wsN; speedDay.push([d, +(o.wsS / o.wsN).toFixed(2)]); }
    if (o.slN) { slS += o.slS; slN += o.slN; stepLenDay.push([d, +(o.slS / o.slN).toFixed(1)]); }
    if (o.dblN) { dblS += o.dblS; dblN += o.dblN; dblDay.push([d, +(o.dblS / o.dblN).toFixed(1)]); }
    if (o.asymN) { asymS += o.asymS; asymN += o.asymN; asymDay.push([d, +(o.asymS / o.asymN).toFixed(1)]); }
    if (o.ascN) { ascS += o.ascS; ascN += o.ascN; ascDay.push([d, +(o.ascS / o.ascN).toFixed(2)]); }
    if (o.descN) { descS += o.descS; descN += o.descN; descDay.push([d, +(o.descS / o.descN).toFixed(2)]); }
    if (o.whrN) { whrS += o.whrS; whrN += o.whrN; whrDay.push([d, +(o.whrS / o.whrN).toFixed(1)]); }
  }

  const pct = percentile(hist, hrN);
  const hourAvg = hrHourS.map((s, i) => (hrHourN[i] ? +(s / hrHourN[i]).toFixed(1) : 0));
  const hpHourAvg = hpHourS.map((s, i) => (hpHourN[i] ? +(s / hpHourN[i]).toFixed(1) : 0));

  // 一夜的 key 是「醒来那天」，所以范围第一天凌晨那夜算在前一天，边界放宽一天
  const dayBefore = s => {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return iso(d);
  };
  const nb = dayBefore(from);
  const nights = r.sleep.nights.filter(n => (!nb || n.d >= nb) && (!to || n.d <= to));
  const workouts = r.workouts.filter(w => {
    const d = (w.s || '').slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  });
  // 症状/事件/生活记录是明细，按日期过滤即可
  const inRangeDay = d => (!from || d >= from) && (!to || d <= to);
  const events = {
    high: (r.events ? r.events.high : []).filter(x => inRangeDay(x[0])),
    low: (r.events ? r.events.low : []).filter(x => inRangeDay(x[0])),
  };
  const symptoms = (r.symptoms || []).filter(x => inRangeDay(x[0]));
  const breath = (r.breath || []).filter(x => inRangeDay(x[0]));
  const wrist = (r.wrist || []).filter(x => inRangeDay(x[0]));
  const afib = (r.afib || []).filter(x => inRangeDay(x[0]));
  const hrrec = (r.hrrec || []).filter(x => inRangeDay(x[0]));
  const steady = (r.gait.steady || []).filter(x => inRangeDay(x[0]));
  const sixmw = (r.gait.sixmw || []).filter(x => inRangeDay(x[0]));
  const sleepGoal = (r.sleepGoal || []).filter(x => inRangeDay(x[0]));
  const fRange = a => (a || []).filter(x => inRangeDay(x[0]));
  const life = {
    water: fRange(r.life.water),
    caffeine: fRange(r.life.caffeine),
    mindful: fRange(r.life.mindful),
    sex: fRange(r.life.sex),
  };

  const actsum = (r.actsum || []).filter(x => {
    const d = (x.d || '').slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  });
  const inRangeDate = ([d]) => (!from || d >= from) && (!to || d <= to);
  const vo2 = r.vo2.filter(inRangeDate);
  const weight = r.body.weight.filter(inRangeDate);
  const height = r.body.height.filter(inRangeDate);

  return {
    locale: r.locale,
    exportDate: r.exportDate,
    meta: r.meta,          // 文件数/压缩包大小/解析耗时：跟范围无关，原样带过去
    firstDate: sel.length ? sel[0] : (from || r.firstDate),
    lastDate: sel.length ? sel[sel.length - 1] : (to || r.lastDate),
    days: sel.length,
    range: { from: from || r.firstDate, to: to || r.lastDate },
    me: r.me,
    // 计数类是按全量统计的，换范围也不改；页面会标出来
    counts: r.counts,
    sources: r.sources,
    devices: r.devices,
    hr: {
      n: hrN,
      avg: +(hrSum / hrN || 0).toFixed(1),
      min: hrMin === Infinity ? 0 : hrMin,
      max: hrMax,
      p50: pct.p50, p95: pct.p95, p99: pct.p99,
      hourN: hrHourN,
      hourAvg,
      hourMin: hourAvg.map(v => (v ? Math.max(40, v - 20) : 0)),
      hourMax: hourAvg.map(v => (v ? v + 20 : 0)),
      hist,
      histMin: r.hr.histMin,
      histBin: r.hr.histBin,
      day: hrDay,
    },
    rhr: { n: rhrN, avg: +(rhrSum / rhrN || 0).toFixed(1), last: rhrLast },
    hrv: { n: hrvN, avg: +(hrvSum / hrvN || 0).toFixed(1) },
    spo2: { n: spo2N, avg: +(spo2Sum / spo2N || 0).toFixed(1), min: spo2N ? spo2Min : 0, max: spo2Max, low: spo2Low },
    resp: { n: respN, avg: +(respSum / respN || 0).toFixed(1) },
    vo2, body: { weight, height },
    hp: {
      n: hpN,
      avg: +(hpSum / hpN || 0).toFixed(1),
      max: +hpMax.toFixed(1),
      hourN: hpHourN,
      hourAvg: hpHourAvg,
      devices: r.hp.devices,          // 设备维度没有按天拆，保持全量
      hours: +(hpDur / 60).toFixed(1),
      day: hpDay,
      over80: o80, over85: o85, over90: o90,
    },
    env: r.env,
    steps: { n: stepDay.length, total: Math.round(steps), day: stepDay },
    dist: { total: +dist.toFixed(1) },
    energy: { total: Math.round(energy), day: energyDay },
    sleep: { segs: r.sleep.segs, nights },
    workouts,
    actsum,
    light: { total: light },
    stand: { total: stand },
    exer: { total: exer },
    effort: {
      n: effN,
      avg: +(effS / effN || 0).toFixed(2),
      max: +effMax.toFixed(2),
      day: effortDay,
      hourAvg: effHourS.map((s, i) => (effHourN[i] ? +(s / effHourN[i]).toFixed(2) : 0)),
    },
    basal: { total: Math.round(basal) },
    cycling: { total: +cyc.toFixed(1) },
    flights: { total: Math.round(flights) },
    standHour: { stood, idle },
    gait: {
      speed: speedDay, stepLen: stepLenDay, dblSup: dblDay, asym: asymDay,
      asc: ascDay, desc: descDay, walkHr: whrDay,
      steady, sixmw,
    },
    breath, wrist, afib, hrrec,
    events, symptoms, life, sleepGoal,
    byDay,
  };
}

/** 范围里的人话描述 */
export function describe(from, to, days) {
  if (!from || !to) return '';
  return from + ' → ' + to + ' · ' + days + ' 天';
}
