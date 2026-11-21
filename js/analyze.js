/**
 * 增量聚合器：一行一行喂进来，内存只保留统计量，不保留原始记录。
 * 2,000,000+ 行的导出文件靠这个才不会被浏览器顶死。
 */
import { attr, deviceName, parseDate, unescapeXml, sleepNightKey } from './parse.js';

const HR = 'HKQuantityTypeIdentifierHeartRate';
const RHR = 'HKQuantityTypeIdentifierRestingHeartRate';
const HRV = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
const SPO2 = 'HKQuantityTypeIdentifierOxygenSaturation';
const RESP = 'HKQuantityTypeIdentifierRespiratoryRate';
const STEPS = 'HKQuantityTypeIdentifierStepCount';
const DIST = 'HKQuantityTypeIdentifierDistanceWalkingRunning';
const ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const HP = 'HKQuantityTypeIdentifierHeadphoneAudioExposure';
const ENV = 'HKQuantityTypeIdentifierEnvironmentalAudioExposure';
const VO2 = 'HKQuantityTypeIdentifierVO2Max';
const WEIGHT = 'HKQuantityTypeIdentifierBodyMass';
const HEIGHT = 'HKQuantityTypeIdentifierHeight';
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';
const LIGHT = 'HKQuantityTypeIdentifierTimeInDaylight';
const STAND = 'HKQuantityTypeIdentifierAppleStandTime';
const EXER = 'HKQuantityTypeIdentifierAppleExerciseTime';
// 下面这批原先只出现在导出文件里，没进统计。收进来才叫"全部数据"
const EFFORT = 'HKQuantityTypeIdentifierPhysicalEffort';
const BASAL = 'HKQuantityTypeIdentifierBasalEnergyBurned';
const CYCLING = 'HKQuantityTypeIdentifierDistanceCycling';
const FLIGHTS = 'HKQuantityTypeIdentifierFlightsClimbed';
const STANDHOUR = 'HKCategoryTypeIdentifierAppleStandHour';
const WSPEED = 'HKQuantityTypeIdentifierWalkingSpeed';
const WSTEPLEN = 'HKQuantityTypeIdentifierWalkingStepLength';
const WDBLSUP = 'HKQuantityTypeIdentifierWalkingDoubleSupportPercentage';
const WASYM = 'HKQuantityTypeIdentifierWalkingAsymmetryPercentage';
const SASCEND = 'HKQuantityTypeIdentifierStairAscentSpeed';
const SDESCEND = 'HKQuantityTypeIdentifierStairDescentSpeed';
const WALKHR = 'HKQuantityTypeIdentifierWalkingHeartRateAverage';
const STEADY = 'HKQuantityTypeIdentifierAppleWalkingSteadiness';
const SIXMW = 'HKQuantityTypeIdentifierSixMinuteWalkTestDistance';
const BREATHD = 'HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances';
const WRISTM = 'HKQuantityTypeIdentifierAppleSleepingWristTemperature';
const AFIB = 'HKQuantityTypeIdentifierAtrialFibrillationBurden';
const HRREC = 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute';
const HIGHHR = 'HKCategoryTypeIdentifierHighHeartRateEvent';
const LOWHR = 'HKCategoryTypeIdentifierLowHeartRateEvent';
const RSYM = 'HKCategoryTypeIdentifierRapidPoundingOrFlutteringHeartbeat';
const SYMFATIGUE = 'HKCategoryTypeIdentifierFatigue';
const SYMBREATH = 'HKCategoryTypeIdentifierShortnessOfBreath';
const SYMDIZZY = 'HKCategoryTypeIdentifierDizziness';
const WATER = 'HKQuantityTypeIdentifierDietaryWater';
const CAFFEINE = 'HKQuantityTypeIdentifierDietaryCaffeine';
const MINDFUL = 'HKCategoryTypeIdentifierMindfulSession';
const SEXACT = 'HKCategoryTypeIdentifierSexualActivity';
const SLEEPGOAL = 'HKDataTypeSleepDurationGoal';

const HR_BIN = 5, HR_MIN = 30, HR_MAX = 220;

export function createAggregator() {
  return {
    locale: '', exportDate: '', firstDate: '', lastDate: '',
    me: { birth: '', sex: '', blood: '', skin: '', meds: '' },
    counts: Object.create(null),
    sources: Object.create(null),
    devices: Object.create(null),
    hr: {
      n: 0, sum: 0, min: Infinity, max: 0,
      hourN: new Array(24).fill(0), hourSum: new Array(24).fill(0),
      hourMin: new Array(24).fill(Infinity), hourMax: new Array(24).fill(0),
      hist: new Array(Math.ceil((HR_MAX - HR_MIN) / HR_BIN)).fill(0),
      day: new Map(),
    },
    rhr: { n: 0, sum: 0, day: new Map() },
    hrv: { n: 0, sum: 0, day: new Map() },
    spo2: { n: 0, sum: 0, min: 100, max: 0, low: 0 },
    resp: { n: 0, sum: 0 },
    vo2: [],
    body: { weight: [], height: [] },
    hp: {
      n: 0, sum: 0, max: 0, dur: 0,
      hourN: new Array(24).fill(0),
      devices: Object.create(null),
      over80: 0, over85: 0, over90: 0,
      hourSum: new Array(24).fill(0),
      day: new Map(),
    },
    env: { n: 0, sum: 0, max: 0 },
    steps: { n: 0, total: 0, day: new Map() },
    dist: { total: 0 },
    energy: { total: 0, day: new Map() },
    sleep: { segs: 0, nights: new Map() },
    workouts: [],
    actsum: [],
    byDay: new Map(),
    cur: null,
    // 下面这些都是「一条记录一个点」，条数不多（几十到几百），直接留明细数组
    effort: { n: 0, sum: 0, max: 0, day: new Map(), hourN: new Array(24).fill(0), hourSum: new Array(24).fill(0) },
    basal: { total: 0, day: new Map() },
    cycling: { total: 0, day: new Map() },
    flights: { total: 0, day: new Map() },
    standHour: { stood: 0, idle: 0 },
    gait: {
      speed: [], stepLen: [], dblSup: [], asym: [],
      asc: [], desc: [], steady: [], sixmw: [], walkHr: [],
    },
    breath: [], wrist: [], afib: [], hrrec: [],
    events: { high: [], low: [] },
    symptoms: [],
    life: { water: [], caffeine: [], mindful: [], sex: [] },
    sleepGoal: [],
  };
}

function bump(obj, key) {
  if (!key) return;
  obj[key] = (obj[key] || 0) + 1;
}

function addTo(map, key, v) {
  map.set(key, (map.get(key) || 0) + v);
}

/**
 * 每天一格的原始计数。时间范围筛选靠它：切范围时只在这个索引上求和，
 * 不用回头重扫 200 万行 XML。
 * hrH / hpH 是扁平的 48 个数：前 24 个是每小时的采样数，后 24 个是数值之和。
 */
function drec(a, day) {
  let d = a.byDay.get(day);
  if (!d) {
    d = {
      hrN: 0, hrS: 0, hrMin: Infinity, hrMax: 0,
      hrH: new Array(48).fill(0), hrHist: Object.create(null),
      hpN: 0, hpS: 0, hpMax: 0, hpDur: 0, hpO80: 0, hpO85: 0, hpO90: 0,
      hpH: new Array(48).fill(0),
      steps: 0, dist: 0, energy: 0, light: 0, stand: 0, exer: 0,
      spo2N: 0, spo2S: 0, spo2Min: 100, spo2Low: 0,
      respN: 0, respS: 0,
      rhrSum: 0, rhrN: 0, hrvSum: 0, hrvN: 0,
      effort: 0, effortN: 0, effortMax: 0, effH: new Array(48).fill(0),
      basal: 0, cyc: 0, flights: 0,
      wsSum: 0, wsN: 0, slSum: 0, slN: 0,
      dblSum: 0, dblN: 0, asymSum: 0, asymN: 0,
      ascSum: 0, ascN: 0, descSum: 0, descN: 0,
      stood: 0, idle: 0, whrSum: 0, whrN: 0,
    };
    a.byDay.set(day, d);
  }
  return d;
}

/** 处理一行 XML */
export function feedLine(a, line) {
  let i = 0;
  const len = line.length;
  while (i < len) {
    const c = line.charCodeAt(i);
    if (c === 32 || c === 9 || c === 13) i++;
    else break;
  }
  if (line.charCodeAt(i) !== 60) return;

  // 32 字符足够区分 '<WorkoutStatistics'（19）等长标签名，16 会截断导致漏判
  const head = line.slice(i, i + 32);

  if (head.startsWith('<Record')) {
    const gt = line.indexOf('>', i);
    const tag = gt < 0 ? line.slice(i) : line.slice(i, gt + 1);
    const type = attr(tag, 'type');
    if (!type) return;
    bump(a.counts, type);
    const sd0 = attr(tag, 'startDate');
    if (sd0) {
      if (!a.firstDate || sd0 < a.firstDate) a.firstDate = sd0;
      if (!a.lastDate || sd0 > a.lastDate) a.lastDate = sd0;
    }
    const srcName = attr(tag, 'sourceName');
    if (srcName) bump(a.sources, srcName);
    if (tag.indexOf('HKDevice') >= 0) {
      const dv = deviceName(attr(tag, 'device'));
      if (dv) bump(a.devices, dv);
    }

    switch (type) {
      case HR: {
        const v = +attr(tag, 'value');
        if (!isFinite(v) || v <= 0) return;
        const st = attr(tag, 'startDate');
        const hh = +st.slice(11, 13);
        const day = st.slice(0, 10);
        a.hr.n++; a.hr.sum += v;
        if (v < a.hr.min) a.hr.min = v;
        if (v > a.hr.max) a.hr.max = v;
        if (hh >= 0 && hh < 24) {
          a.hr.hourN[hh]++; a.hr.hourSum[hh] += v;
          if (v < a.hr.hourMin[hh]) a.hr.hourMin[hh] = v;
          if (v > a.hr.hourMax[hh]) a.hr.hourMax[hh] = v;
        }
        const b = Math.floor((v - HR_MIN) / HR_BIN);
        if (b >= 0 && b < a.hr.hist.length) a.hr.hist[b]++;
        const d = a.hr.day.get(day) || { s: 0, n: 0 };
        d.s += v; d.n++; a.hr.day.set(day, d);
        const kd = drec(a, day);
        kd.hrN++; kd.hrS += v;
        if (v < kd.hrMin) kd.hrMin = v;
        if (v > kd.hrMax) kd.hrMax = v;
        if (hh >= 0 && hh < 24) { kd.hrH[hh]++; kd.hrH[24 + hh] += v; }
        if (b >= 0 && b < a.hr.hist.length) kd.hrHist[b] = (kd.hrHist[b] || 0) + 1;
        break;
      }
      case RHR: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const d = attr(tag, 'startDate').slice(0, 10);
        a.rhr.n++; a.rhr.sum += v;
        a.rhr.day.set(d, v);
        const kd = drec(a, d);
        kd.rhrSum += v; kd.rhrN++;
        break;
      }
      case HRV: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const d = attr(tag, 'startDate').slice(0, 10);
        a.hrv.n++; a.hrv.sum += v;
        a.hrv.day.set(d, v);
        const kd = drec(a, d);
        kd.hrvSum += v; kd.hrvN++;
        break;
      }
      case SPO2: {
        let v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        if (v <= 1.5) v *= 100;
        a.spo2.n++; a.spo2.sum += v;
        if (v < a.spo2.min) a.spo2.min = v;
        if (v > a.spo2.max) a.spo2.max = v;
        if (v < 95) a.spo2.low++;
        const kd = drec(a, attr(tag, 'startDate').slice(0, 10));
        kd.spo2N++; kd.spo2S += v;
        if (v <= kd.spo2Min) kd.spo2Min = v;
        if (v < 95) kd.spo2Low++;
        break;
      }
      case RESP: {
        const v = +attr(tag, 'value');
        if (isFinite(v)) {
          a.resp.n++; a.resp.sum += v;
          const kd = drec(a, attr(tag, 'startDate').slice(0, 10));
          kd.respN++; kd.respS += v;
        }
        break;
      }
      case VO2: {
        const v = +attr(tag, 'value');
        if (isFinite(v)) a.vo2.push([attr(tag, 'startDate').slice(0, 10), v]);
        break;
      }
      case WEIGHT: {
        const v = +attr(tag, 'value');
        if (isFinite(v)) a.body.weight.push([attr(tag, 'startDate').slice(0, 10), v]);
        break;
      }
      case HEIGHT: {
        const v = +attr(tag, 'value');
        if (isFinite(v)) a.body.height.push([attr(tag, 'startDate').slice(0, 10), v]);
        break;
      }
      case HP: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const st = attr(tag, 'startDate');
        const hh = +st.slice(11, 13);
        const dn = deviceName(attr(tag, 'device')) || attr(tag, 'sourceName');
        const dur = Math.max(0, (parseDate(attr(tag, 'endDate')) - parseDate(st)) / 60000);
        a.hp.n++; a.hp.sum += v; a.hp.dur += dur;
        if (v > a.hp.max) a.hp.max = v;
        if (hh >= 0 && hh < 24) { a.hp.hourN[hh]++; a.hp.hourSum[hh] += v; }
        if (v > 80) a.hp.over80++;
        if (v > 85) a.hp.over85++;
        if (v > 90) a.hp.over90++;
        addTo(a.hp.day, st.slice(0, 10), dur);
        {
          const kd = drec(a, st.slice(0, 10));
          kd.hpN++; kd.hpS += v; kd.hpDur += dur;
          if (v > kd.hpMax) kd.hpMax = v;
          if (hh >= 0 && hh < 24) { kd.hpH[hh]++; kd.hpH[24 + hh] += v; }
          if (v > 80) kd.hpO80++;
          if (v > 85) kd.hpO85++;
          if (v > 90) kd.hpO90++;
        }
        if (dn) {
          const d = a.hp.devices[dn] || { n: 0, sum: 0, max: 0, dur: 0 };
          d.n++; d.sum += v; d.dur += dur; if (v > d.max) d.max = v;
          a.hp.devices[dn] = d;
        }
        break;
      }
      case ENV: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        a.env.n++; a.env.sum += v;
        if (v > a.env.max) a.env.max = v;
        break;
      }
      case STEPS: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const day = attr(tag, 'startDate').slice(0, 10);
        a.steps.n++; a.steps.total += v;
        addTo(a.steps.day, day, v);
        drec(a, day).steps += v;
        break;
      }
      case DIST: {
        const v = +attr(tag, 'value');
        if (isFinite(v)) {
          a.dist.total += v;
          drec(a, attr(tag, 'startDate').slice(0, 10)).dist += v;
        }
        break;
      }
      case ENERGY: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const day = attr(tag, 'startDate').slice(0, 10);
        a.energy.total += v;
        addTo(a.energy.day, day, v);
        drec(a, day).energy += v;
        break;
      }
      case SLEEP: {
        const val = attr(tag, 'value');
        const st = attr(tag, 'startDate');
        const en = attr(tag, 'endDate');
        if (!st || !en) return;
        const kind = val.replace('HKCategoryValueSleepAnalysis', '');
        const key = sleepNightKey(st);
        let n = a.sleep.nights.get(key);
        if (!n) {
          // nightStart/nightEnd 只收夜间段：白天的小睡会把 start 拉到 13 点，
          // 让整夜在带状图上横跨全图，也会把平均入睡时间算早
          n = { core: 0, deep: 0, rem: 0, awake: 0, unspec: 0, inbed: 0,
                start: st, end: en, nightStart: null, nightEnd: null };
          a.sleep.nights.set(key, n);
        }
        const dur = (parseDate(en) - parseDate(st)) / 3600000;
        if (!isFinite(dur) || dur < 0) return;
        a.sleep.segs++;
        if (kind === 'AsleepCore') n.core += dur;
        else if (kind === 'AsleepDeep') n.deep += dur;
        else if (kind === 'AsleepREM') n.rem += dur;
        else if (kind === 'Awake') n.awake += dur;
        else if (kind === 'InBed') n.inbed += dur;
        else n.unspec += dur;
        if (st < n.start) n.start = st;
        if (en > n.end) n.end = en;
        // 只认真正睡着的段：Awake 段的结束时间是夜里醒来的时刻，
        // 拿它当起床时间会把平均起床算到 04:37
        const sleeping = kind !== 'InBed' && kind !== 'Awake';
        if (sleeping) {
          const hh = +st.slice(11, 13);
          const eh = +en.slice(11, 13);
          if (!n.nightStart && (hh >= 18 || hh < 8)) n.nightStart = st;
          // 取最后一次清晨的沉睡段结束，且必须落在入睡后 12 小时内，
          // 否则白天补觉的段会把这一夜拉成 13 小时的长条
          if (eh >= 4 && eh < 15 && parseDate(en) - parseDate(n.nightStart || st) < 12 * 3600000) {
            n.nightEnd = en;
          }
        }
        break;
      }
      case LIGHT:
      case STAND:
      case EXER: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const kd = drec(a, attr(tag, 'startDate').slice(0, 10));
        if (type === LIGHT) kd.light += v;
        else if (type === STAND) kd.stand += v;
        else kd.exer += v;
        break;
      }
      // 身体负荷：单位 kcal/(hr·kg)，和体重没关系，可以直接比较强度
      case EFFORT: {
        const v = +attr(tag, 'value');
        if (!isFinite(v) || v < 0) return;
        const st = attr(tag, 'startDate');
        const day = st.slice(0, 10);
        a.effort.n++; a.effort.sum += v;
        if (v > a.effort.max) a.effort.max = v;
        const hh = +st.slice(11, 13);
        a.effort.hourN[hh]++; a.effort.hourSum[hh] += v;
        addTo(a.effort.day, day, v);
        const d = drec(a, day);
        d.effort += v; d.effortN++;
        if (v > d.effortMax) d.effortMax = v;
        d.effH[hh]++; d.effH[24 + hh] += v;
        break;
      }
      case BASAL: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const day = attr(tag, 'startDate').slice(0, 10);
        a.basal.total += v;
        addTo(a.basal.day, day, v);
        drec(a, day).basal += v;
        break;
      }
      case CYCLING: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const day = attr(tag, 'startDate').slice(0, 10);
        a.cycling.total += v;
        addTo(a.cycling.day, day, v);
        drec(a, day).cyc += v;
        break;
      }
      case FLIGHTS: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const day = attr(tag, 'startDate').slice(0, 10);
        a.flights.total += v;
        addTo(a.flights.day, day, v);
        drec(a, day).flights += v;
        break;
      }
      // 站立小时是分类值，只统计站了/没站
      case STANDHOUR: {
        const v = attr(tag, 'value');
        const day = attr(tag, 'startDate').slice(0, 10);
        const d = drec(a, day);
        if (v.indexOf('Stood') >= 0) { a.standHour.stood++; d.stood++; }
        else if (v.indexOf('Idle') >= 0) { a.standHour.idle++; d.idle++; }
        break;
      }
      // 步态：速度和步长是成对的，双支撑/不对称是平衡指标，上下楼是爆发力
      case WSPEED:
      case WSTEPLEN:
      case WDBLSUP:
      case WASYM:
      case SASCEND:
      case SDESCEND:
      case WALKHR: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const st = attr(tag, 'startDate');
        const day = st.slice(0, 10);
        const d = drec(a, day);
        if (type === WSPEED) { a.gait.speed.push([day, v]); d.wsSum += v; d.wsN++; }
        else if (type === WSTEPLEN) { a.gait.stepLen.push([day, v]); d.slSum += v; d.slN++; }
        else if (type === WDBLSUP) { a.gait.dblSup.push([day, v]); d.dblSum += v; d.dblN++; }
        else if (type === WASYM) { a.gait.asym.push([day, v]); d.asymSum += v; d.asymN++; }
        else if (type === SASCEND) { a.gait.asc.push([day, v]); d.ascSum += v; d.ascN++; }
        else if (type === SDESCEND) { a.gait.desc.push([day, v]); d.descSum += v; d.descN++; }
        else { a.gait.walkHr.push([day, v]); d.whrSum += v; d.whrN++; }
        break;
      }
      case STEADY:
      case SIXMW: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const day = attr(tag, 'startDate').slice(0, 10);
        (type === STEADY ? a.gait.steady : a.gait.sixmw).push([day, v]);
        break;
      }
      case BREATHD:
      case WRISTM:
      case AFIB:
      case HRREC: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const day = attr(tag, 'startDate').slice(0, 10);
        if (type === BREATHD) a.breath.push([day, v]);
        else if (type === WRISTM) a.wrist.push([day, v]);
        else if (type === AFIB) a.afib.push([day, v]);
        else a.hrrec.push([day, v]);
        break;
      }
      // 高/低心率事件：Apple 自己判定并通知过的那几次
      case HIGHHR:
      case LOWHR: {
        const st = attr(tag, 'startDate');
        if (!st) return;
        (type === HIGHHR ? a.events.high : a.events.low).push([st.slice(0, 10), st.slice(11, 16)]);
        break;
      }
      // 自己记下来的症状：和当天心率一起看才有意义
      case RSYM:
      case SYMFATIGUE:
      case SYMBREATH:
      case SYMDIZZY: {
        const st = attr(tag, 'startDate');
        if (!st) return;
        a.symptoms.push([st.slice(0, 10), st.slice(11, 16), type
          .replace('HKCategoryTypeIdentifier', '')]);
        break;
      }
      case WATER:
      case CAFFEINE: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        const day = attr(tag, 'startDate').slice(0, 10);
        (type === WATER ? a.life.water : a.life.caffeine).push([day, v]);
        break;
      }
      case MINDFUL:
      case SEXACT: {
        const st = attr(tag, 'startDate');
        const en = attr(tag, 'endDate');
        if (!st || !en) return;
        const mins = (parseDate(en) - parseDate(st)) / 60000;
        (type === MINDFUL ? a.life.mindful : a.life.sex)
          .push([st.slice(0, 10), Math.max(0, Math.round(mins))]);
        break;
      }
      case SLEEPGOAL: {
        const v = +attr(tag, 'value');
        if (!isFinite(v)) return;
        a.sleepGoal.push([attr(tag, 'startDate').slice(0, 10), v]);
        break;
      }
      default:
        break;
    }
    return;
  }

  if (head.startsWith('<Workout ')) {
    const gt = line.indexOf('>', i);
    const tag = gt < 0 ? line.slice(i) : line.slice(i, gt + 1);
    const t = attr(tag, 'workoutActivityType').replace('HKWorkoutActivityType', '');
    if (!t) return;
    bump(a.counts, 'Workout:' + t);
    const w = {
      t,
      dur: +attr(tag, 'duration'),
      unit: attr(tag, 'durationUnit') || 'min',
      dist: +attr(tag, 'totalDistance') || 0,
      kcal: +attr(tag, 'totalEnergyBurned') || 0,
      steps: 0, avgHr: 0,
      s: attr(tag, 'startDate'),
      e: attr(tag, 'endDate'),
      src: attr(tag, 'sourceName'),
      dev: deviceName(attr(tag, 'device')),
    };
    a.workouts.push(w);
    a.cur = w;
    const dv = deviceName(attr(tag, 'device'));
    if (dv) bump(a.devices, dv);
    bump(a.sources, attr(tag, 'sourceName'));
    return;
  }

  // 新版导出把距离/热量/心率放在 <WorkoutStatistics> 子元素里
  if (head.startsWith('<WorkoutStatistics')) {
    const w = a.cur;
    if (!w) return;
    const gt = line.indexOf('>', i);
    const tag = gt < 0 ? line.slice(i) : line.slice(i, gt + 1);
    const t = attr(tag, 'type');
    const sum = +attr(tag, 'sum');
    if (t === 'HKQuantityTypeIdentifierActiveEnergyBurned' && isFinite(sum)) w.kcal += sum;
    else if (t === 'HKQuantityTypeIdentifierDistanceWalkingRunning' && isFinite(sum)) w.dist += sum;
    else if (t === 'HKQuantityTypeIdentifierDistanceCycling' && isFinite(sum)) w.dist += sum;
    else if (t === 'HKQuantityTypeIdentifierDistanceSwimming' && isFinite(sum)) w.dist += sum;
    else if (t === 'HKQuantityTypeIdentifierStepCount' && isFinite(sum)) w.steps += sum;
    else if (t === 'HKQuantityTypeIdentifierHeartRate') {
      const av = +attr(tag, 'average');
      if (isFinite(av) && av > 0) w.avgHr = av;
    }
    return;
  }

  if (head.startsWith('</Workout>')) {
    a.cur = null;
    return;
  }

  if (head.startsWith('<ActivitySummary')) {
    const gt = line.indexOf('>', i);
    const tag = gt < 0 ? line.slice(i) : line.slice(i, gt + 1);
    a.actsum.push({
      d: attr(tag, 'dateComponents'),
      move: +attr(tag, 'activeEnergyBurned') || 0,
      moveGoal: +attr(tag, 'activeEnergyBurnedGoal') || 0,
      ex: +attr(tag, 'appleExerciseTime') || 0,
      exGoal: +attr(tag, 'appleExerciseTimeGoal') || 0,
      stand: +attr(tag, 'appleStandHours') || 0,
      standGoal: +attr(tag, 'appleStandHoursGoal') || 0,
    });
    return;
  }

  if (head.startsWith('<Me ')) {
    const gt = line.indexOf('>', i);
    const tag = line.slice(i, gt < 0 ? line.length : gt + 1);
    a.me.birth = attr(tag, 'HKCharacteristicTypeIdentifierDateOfBirth');
    a.me.sex = attr(tag, 'HKCharacteristicTypeIdentifierBiologicalSex').replace('HKBiologicalSex', '');
    a.me.blood = attr(tag, 'HKCharacteristicTypeIdentifierBloodType').replace('HKBloodType', '');
    a.me.skin = attr(tag, 'HKCharacteristicTypeIdentifierFitzpatrickSkinType').replace('HKFitzpatrickSkinType', '');
    a.me.meds = unescapeXml(attr(tag, 'HKCharacteristicTypeIdentifierCardioFitnessMedicationsUse'));
    return;
  }

  if (head.startsWith('<ExportDate')) {
    a.exportDate = attr(line, 'value');
    return;
  }

  if (head.startsWith('<HealthData')) {
    a.locale = attr(line, 'locale');
    return;
  }
}

/** 收尾：把 Map 摊平成排序数组，算派生指标 */
export function finalize(a) {
  const hourAvg = a.hr.hourSum.map((s, i) => (a.hr.hourN[i] ? +(s / a.hr.hourN[i]).toFixed(1) : 0));

  const hrDay = [...a.hr.day.entries()]
    .map(([d, o]) => [d, Math.round(o.s / o.n)])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));

  const stepDay = [...a.steps.day.entries()]
    .map(([d, v]) => [d, Math.round(v)])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));

  const energyDay = [...a.energy.day.entries()]
    .map(([d, v]) => [d, Math.round(v)])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));

  const nights = [...a.sleep.nights.entries()]
    .map(([d, n]) => {
      const asleep = n.core + n.deep + n.rem + n.unspec;
      const total = asleep + n.awake;
      return {
        d,
        asleep: +asleep.toFixed(2),
        total: +total.toFixed(2),
        core: +n.core.toFixed(2), deep: +n.deep.toFixed(2), rem: +n.rem.toFixed(2),
        awake: +n.awake.toFixed(2),
        bed: (n.nightStart || n.start).slice(11, 16),
        wake: (n.nightEnd || n.end).slice(11, 16),
        night: !!n.nightStart,
      };
    })
    .filter(n => {
      if (!(n.asleep > 0.5 && n.asleep < 16 && n.night)) return false;
      // 跨度超过 12 小时的「一夜」是分段数据拼错了，画出来会横穿整张图
      const [bh, bm] = n.bed.split(':').map(Number);
      const [wh, wm] = n.wake.split(':').map(Number);
      let span = (wh * 60 + wm) - (bh * 60 + bm);
      if (span < 0) span += 1440;
      return span <= 10 * 60;
    })
    .sort((x, y) => (x.d < y.d ? -1 : 1));

  const hpDevices = Object.entries(a.hp.devices)
    .map(([name, o]) => ({ name, n: o.n, avg: +(o.sum / o.n).toFixed(1), max: +o.max.toFixed(1), hours: +(o.dur / 60).toFixed(2) }))
    .sort((x, y) => y.n - x.n);

  const hpDay = [...a.hp.day.entries()]
    .map(([d, m]) => [d, +(m / 60).toFixed(2)])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));

  // 每天一格的索引：换时间范围时只在这里求和，不回头重扫 XML
  const byDay = Object.create(null);
  let lightAll = 0, standAll = 0, exerAll = 0;
  for (const [d, o] of a.byDay) {
    lightAll += o.light; standAll += o.stand; exerAll += o.exer;
    byDay[d] = {
      hrN: o.hrN,
      hrS: Math.round(o.hrS),
      hrMin: o.hrMin === Infinity ? 0 : o.hrMin,
      hrMax: o.hrMax,
      hrH: o.hrH.map(Math.round),
      hrB: o.hrHist,
      hpN: o.hpN,
      hpS: Math.round(o.hpS),
      hpMax: +o.hpMax.toFixed(1),
      hpDur: +o.hpDur.toFixed(2),
      hpO80: o.hpO80, hpO85: o.hpO85, hpO90: o.hpO90,
      hpH: o.hpH.map(Math.round),
      steps: Math.round(o.steps),
      dist: +o.dist.toFixed(3),
      energy: Math.round(o.energy),
      light: Math.round(o.light),
      stand: Math.round(o.stand),
      exer: Math.round(o.exer),
      spo2N: o.spo2N,
      spo2S: Math.round(o.spo2S),
      spo2Min: o.spo2N ? o.spo2Min : 0,
      spo2Low: o.spo2Low,
      respN: o.respN,
      respS: +o.respS.toFixed(1),
      rhr: o.rhrN ? +(o.rhrSum / o.rhrN).toFixed(1) : 0,
      hrv: o.hrvN ? +(o.hrvSum / o.hrvN).toFixed(1) : 0,
      // 下面这批是「全部数据」补进来的：能量构成、步态、站立小时
      effS: +o.effort.toFixed(1), effN: o.effortN, effMax: +o.effortMax.toFixed(2),
      effH: o.effH.map(v => +v.toFixed(1)),
      basal: Math.round(o.basal), cyc: +o.cyc.toFixed(2), flights: o.flights,
      wsN: o.wsN, wsS: +(o.wsSum).toFixed(2),
      slN: o.slN, slS: +o.slSum.toFixed(2),
      dblN: o.dblN, dblS: +o.dblSum.toFixed(2),
      asymN: o.asymN, asymS: +o.asymSum.toFixed(2),
      ascN: o.ascN, ascS: +o.ascSum.toFixed(2),
      descN: o.descN, descS: +o.descSum.toFixed(2),
      stood: o.stood, idle: o.idle,
      whrN: o.whrN, whrS: +o.whrSum.toFixed(1),
    };
  }

  // 同一天可能有多条步态记录，先按日求平均再画线，否则一天的抖动会被画成锯齿
  const byDayAvg = arr => {
    const m = new Map();
    for (const [d, v] of arr) {
      const o = m.get(d);
      if (o) { o.s += v; o.n++; }
      else m.set(d, { s: v, n: 1 });
    }
    return [...m.entries()]
      .map(([d, o]) => [d, +(o.s / o.n).toFixed(2)])
      .sort((x, y) => (x[0] < y[0] ? -1 : 1));
  };

  const effortDay = [...a.effort.day.entries()]
    .map(([d, v]) => [d, +v.toFixed(1)])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));

  const sources = Object.entries(a.sources).sort((x, y) => y[1] - x[1]);
  const devices = Object.entries(a.devices).sort((x, y) => y[1] - x[1]);

  const workouts = a.workouts.slice().sort((x, y) => (x.s < y.s ? -1 : 1));

  const hrSorted = a.hr.hist;
  const total = a.hr.n;
  let acc = 0, p50 = 0, p95 = 0, p99 = 0;
  for (let i = 0; i < hrSorted.length; i++) {
    acc += hrSorted[i];
    if (!p50 && acc >= total * 0.5) p50 = HR_MIN + i * HR_BIN + HR_BIN / 2;
    if (!p95 && acc >= total * 0.95) p95 = HR_MIN + i * HR_BIN + HR_BIN / 2;
    if (!p99 && acc >= total * 0.99) p99 = HR_MIN + i * HR_BIN + HR_BIN / 2;
  }

  return {
    locale: a.locale,
    exportDate: a.exportDate,
    firstDate: a.firstDate.slice(0, 10),
    lastDate: a.lastDate.slice(0, 10),
    me: a.me,
    counts: a.counts,
    sources,
    devices,
    hr: {
      n: a.hr.n,
      avg: +(a.hr.sum / a.hr.n || 0).toFixed(1),
      min: a.hr.min === Infinity ? 0 : a.hr.min,
      max: a.hr.max,
      p50, p95, p99,
      hourN: a.hr.hourN,
      hourAvg,
      hourMin: a.hr.hourMin.map(v => (v === Infinity ? 0 : v)),
      hourMax: a.hr.hourMax,
      hist: a.hr.hist,
      histMin: HR_MIN,
      histBin: HR_BIN,
      day: hrDay,
    },
    rhr: {
      n: a.rhr.n,
      avg: +(a.rhr.sum / a.rhr.n || 0).toFixed(1),
      last: a.rhr.day.size ? [...a.rhr.day.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1))[0] : null,
    },
    hrv: { n: a.hrv.n, avg: +(a.hrv.sum / a.hrv.n || 0).toFixed(1) },
    spo2: {
      n: a.spo2.n,
      avg: +(a.spo2.sum / a.spo2.n || 0).toFixed(1),
      min: a.spo2.min, max: a.spo2.max, low: a.spo2.low,
    },
    resp: { n: a.resp.n, avg: +(a.resp.sum / a.resp.n || 0).toFixed(1) },
    vo2: a.vo2.sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    body: {
      weight: a.body.weight.sort((x, y) => (x[0] < y[0] ? -1 : 1)),
      height: a.body.height.sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    },
    hp: {
      n: a.hp.n,
      avg: +(a.hp.sum / a.hp.n || 0).toFixed(1),
      max: +a.hp.max.toFixed(1),
      hourN: a.hp.hourN,
      hourAvg: a.hp.hourSum.map((s, i) => (a.hp.hourN[i] ? +(s / a.hp.hourN[i]).toFixed(1) : 0)),
      devices: hpDevices,
      hours: +(a.hp.dur / 60).toFixed(1),
      day: hpDay,
      over80: a.hp.over80, over85: a.hp.over85, over90: a.hp.over90,
    },
    env: { n: a.env.n, avg: +(a.env.sum / a.env.n || 0).toFixed(1), max: +a.env.max.toFixed(1) },
    steps: { n: a.steps.n, total: Math.round(a.steps.total), day: stepDay },
    dist: { total: +a.dist.total.toFixed(1) },
    energy: { total: Math.round(a.energy.total), day: energyDay },
    sleep: { segs: a.sleep.segs, nights },
    workouts,
    actsum: a.actsum.sort((x, y) => (x.d < y.d ? -1 : 1)),
    light: { total: Math.round(lightAll) },
    stand: { total: Math.round(standAll) },
    exer: { total: Math.round(exerAll) },
    effort: {
      n: a.effort.n,
      avg: +(a.effort.sum / a.effort.n || 0).toFixed(2),
      max: +a.effort.max.toFixed(2),
      day: effortDay,
      hourAvg: a.effort.hourSum.map((s, i) => (a.effort.hourN[i] ? +(s / a.effort.hourN[i]).toFixed(2) : 0)),
    },
    basal: { total: Math.round(a.basal.total) },
    cycling: { total: +a.cycling.total.toFixed(1) },
    flights: { total: Math.round(a.flights.total) },
    standHour: { stood: a.standHour.stood, idle: a.standHour.idle },
    gait: {
      speed: byDayAvg(a.gait.speed),
      stepLen: byDayAvg(a.gait.stepLen),
      dblSup: byDayAvg(a.gait.dblSup),
      asym: byDayAvg(a.gait.asym),
      asc: byDayAvg(a.gait.asc),
      desc: byDayAvg(a.gait.desc),
      walkHr: byDayAvg(a.gait.walkHr),
      steady: byDayAvg(a.gait.steady),
      sixmw: byDayAvg(a.gait.sixmw),
    },
    breath: byDayAvg(a.breath),
    wrist: byDayAvg(a.wrist),
    afib: byDayAvg(a.afib),
    hrrec: byDayAvg(a.hrrec),
    events: a.events,
    symptoms: a.symptoms.sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    life: a.life,
    sleepGoal: a.sleepGoal.sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    byDay,
  };
}
