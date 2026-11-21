# 健康档案 · Apple Health 可视化

把 iPhone「健康」App 导出的 `导出.zip` 拖进浏览器，得到一份能看、能读、不枯燥的身体年表。

零依赖、零后端、零构建。整包在本地解析，文件不会离开你的电脑，断网也能跑。

> 同类项目 [PodHours](https://podhours.app) 只做耳机使用时长。这个项目想要的是全部：心脏、耳朵、睡眠、活动、设备编年史。

![落地页](docs/screenshot.png)

在线版：<https://pogo.gay/apple-health-web/>　仓库：<https://github.com/tf-pogo/apple-health-web>

> 做到哪儿、下一步做什么，都记在文末的 [路线图 · 进度](#路线图--进度)。
>
> **这份文档也是交接文档**：数据流、字段字典、渲染与图表 API、样式 token、验收命令、红线都在下面（从「给下一个 agent 的入场说明」开始）。接手的人不必重读源码。

---

## 八个视图

| 页 | 回答的问题 | 主要图表 |
| --- | --- | --- |
| 概览 | 这段时间的身体像谁，这些数换成人话有多远 | 人格卡（放最上）、六张大数卡、换个说法（把总量换算成有画面的事）、六张分区入口卡、极值八卡、你的一天（24 小时横轴）、作息在漂（月度入睡与起床） |
| 耳朵 | 一天里什么时候听得最响，哪副耳机用得最狠 | 人格卡、每副耳机时长、按小时的平均音量环、每日聆听时长、极值八卡 |
| 心脏 | 心跳在一天里的形状，静息心率这几年是升是降 | 人格卡、数卡（带同比与常见区间）、24 小时心率环、星期几与时段分布、心率分布直方图、每日平均心率、心率日历、极值八卡 |
| 睡眠 | 每一夜从几点睡到几点，深睡和 REM 各占多少 | 人格卡、全量睡眠带状图、最近 90 夜时长、结构甜甜圈、极值八卡 |
| 活动 | 哪几天真的在走路，运动是什么节奏 | 人格卡、按年铺开的日历热力图、三环达成率、运动类型排行、运动的节奏（平均每次 / 多久动一次 / 星期几 / 时段）、极值八卡 |
| 能量 | 身体负荷什么时候最高，热量从哪儿来 | 人格卡、24 小时负荷环、每日负荷折线、静息 vs 活动构成条、每月爬楼层数、站立时长、极值八卡 |
| 移动 | 走路的速度和平衡这几年变了没有 | 人格卡、步速 / 步长 / 双支撑 / 上楼的按日与按月折线、活动能力体检、极值八卡 |
| 设备 | 戴过哪些表、听过哪些耳机 | 人格卡、设备与来源的贡献、个人资料 |

## 隐私

- 解析全程在浏览器里：`DecompressionStream` 解 ZIP，Web Worker 里逐行扫 XML，没有任何 `fetch` 往外发。
- 不落盘、不写 `localStorage`、没有埋点。关掉标签页，数据就没了。
- 仓库里不含任何真实健康数据，截图也不含。

## 用法

1. iPhone →「健康」App → 右上角头像 → 滑到底 →「导出所有健康数据」。
2. 等它生成（几分钟到十几分钟，看数据量），AirDrop / 微信 / iCloud 传到电脑。
3. 打开站点，把 `导出.zip` 拖进方框。

二百多万行、三百多 MB 的包，扫描大约 2 秒。

## 本地开发

ES module 和 Worker 都不吃 `file://`，必须起个 http 服务：

```bash
node tools/serve.mjs          # http://127.0.0.1:8777
```

想在命令行核对数字，不开浏览器：

```bash
node tools/parse-local.mjs ~/Downloads/导出.zip out/report.json
```

它会打印扫描行数、记录条数、有数据的天数，并把完整聚合结果写成 JSON。

## 目录

```
index.html            静态页面骨架
css/style.css         样式：浅色 / 深色两套 CSS 变量 + 窄屏重排
js/app.js             文件接入 + Worker 生命周期
js/worker.js          Worker 入口：解压、逐行扫描、汇报进度
js/zip.js             零依赖 ZIP 读取（EOCD 定位 + DecompressionStream）
js/parse.js           行解析、属性提取、时区解析
js/analyze.js         聚合器：从 XML 行到统计结果
js/charts.js          手写 SVG / HTML 图表
js/report.js          渲染层：八个视图
js/range.js           时间范围切片：预设、日期、按日求和
js/theme.js           深浅色切换与圆形扩散动画
preview.html          开发用预览页（读 out/report.json）
tools/serve.mjs       本地静态服务器
tools/dev.mjs         静态服务 + SSE 热重载
tools/parse-local.mjs 命令行版解析器
docs/screenshot.png   落地页截图（合成数据）
LICENSE               MIT
```

每个文件负责什么、想改某个东西该去哪个文件，见下面的 [代码地图](#代码地图)。

## 给下一个 agent 的入场说明

这份 README 同时是这个项目的交接文档。**别的 agent（或三个月后的我）接手时，不必重读源码**：下面几节把数据流、字段名、渲染 API、样式 token、验收命令和红线都写全了，改代码前先读完这一节往下到「红线」为止。

三条最先要记住的约定：

1. **数字只用一份口径**。所有统计都从 `result.byDay` 逐日求和（`js/range.js` 的 `pick()`），不另建第二套聚合。改时间范围只是换 `byDay` 的子集，从不重扫 XML。
2. **换主题不重绘图表**。SVG 里的颜色一律 `var(--…)`，且必须落到 `style` 而不是属性上（见「图表 API」）。加新颜色请先在 `css/style.css` 的两套变量里都定义。
3. **手机是第一现场**。iPhone 上的 Safari 是主要使用场景，窄屏（≤720px）是单独排过的；改完桌面一定要用 CDP 的 390×844 再看一眼（见「改完之后怎么验」）。

## 数据流

```
File(导出.zip)
  └─ js/app.js         选文件 → new Worker(new URL('./worker.js', import.meta.url), {type:'module'})
       └─ js/worker.js  openZip → 找 导出.xml → for await (line of lines(stream)) → feedLine
            ├─ js/zip.js     EOCD 倒扫找中央目录 → 条目表 → 流式 DecompressionStream('deflate-raw')
            ├─ js/parse.js   async function* lines(stream)：按 \n 切行、跨块拼接、去 BOM
            └─ js/analyze.js createAggregator / feedLine / finalize
                 └─ finalize 返回 result（含 byDay 逐日索引）→ postMessage({type:'done'})
                      └─ js/report.js  renderReport(result, ui)
                           ├─ js/range.js   pick(result, from, to) → 与 finalize 同构的切片对象 R
                           ├─ js/charts.js  14 个手写 SVG / HTML 图表
                           └─ 八个 viewXXX(R, host) 拼 HTML 字符串 → host.innerHTML
```

Worker 有三条消息：`meta`（条目数 / xml 名 / 解压后字节数）、`progress`（每 4096 行、间隔 >90ms 报一次 `{lines, ratio}`）、`done`（`result`）、以及失败时的 `error`。`preview.html` 不走 Worker，直接 `fetch('out/report.json')`。

## 代码地图

| 文件 | 行数 | 职责 | 你要改 X，就来这儿 |
| --- | --- | --- | --- |
| `index.html` | 97 | 落地页骨架：顶栏、拖放区、进度、报告容器、错误态 | 文案、导出教程、DOM 骨架 |
| `preview.html` | 189 | 开发预览页：读 `out/report.json` + LIVE 状态条 + SSE 热重载 | 开发工具条、tab 记忆 |
| `css/style.css` | 949 | 全部样式。`:root` 浅色 / `[data-theme=dark]` 深色，两套同名变量 | 颜色、圆角、窄屏重排 |
| `js/app.js` | 116 | 文件接入、Worker 生命周期、进度条、错误态 | 文件选择、错误文案 |
| `js/worker.js` | 59 | 解析线程入口 | 解析进度汇报节奏 |
| `js/zip.js` | 115 | 零依赖 ZIP 读：EOCD 定位 + `DecompressionStream('deflate-raw')` | ZIP64、加密包 |
| `js/parse.js` | 71 | 行切分、属性提取、设备名解析、日期与「夜」的归属 | 新属性、时区 |
| `js/analyze.js` | 850 | 聚合器：46 种 Record 类型的收敛 + `finalize` 摊平 | 新增数据类型的统计 |
| `js/range.js` | 256 | 时间切片：`PRESETS`、`spanOf`、`pick` | 范围规则、新的预设 |
| `js/report.js` | 1644 | 渲染层：八个视图、人格卡、组件、格式化 | 页面内容与图表组合 |
| `js/charts.js` | 400 | 14 个手写 SVG / HTML 图表函数 | 图形本身 |
| `js/theme.js` | 134 | 深浅切换 + 从点击处展开的动画 | 动效、首屏主题 |
| `tools/serve.mjs` | 39 | 纯静态服务器（8777） | — |
| `tools/dev.mjs` | 71 | 静态 + `fs.watch` + SSE `/__reload` | 热重载范围 |
| `tools/parse-local.mjs` | 42 | Node 版解析器，输出 `out/report.json` | 命令行核对数字 |

## 解析层

### `js/zip.js`

`openZip(file: File|Blob) → ZipFile`。不支持 ZIP64（>4 GB 或 >65535 条目）；不支持加密。

| 方法 | 说明 |
| --- | --- |
| `find(suffix)` | 按名字后缀模糊找条目（绕过导出包里的目录前缀） |
| `findAll(re)` | 正则筛条目，用来找 `electrocardiograms/*.csv`、`workout-routes/*.gpx` |
| `bytes(entry)` / `text(entry)` | 读完整个条目（小文件用） |
| `stream(entry)` | 返回 `ReadableStream`，**大文件只能走这条** |
| `dataStart(e)` | 读本地头算出数据真正起点 |

### `js/parse.js`

| 函数 | 说明 |
| --- | --- |
| `async function* lines(stream)` | 逐行产出。**导出包的每行前面都有空格**，所以判断标签一律先 `trimStart()` |
| `attr(s, key)` | 用 `indexOf(key + '="')` 取属性，比为每行建正则快一个量级 |
| `deviceName(raw)` | `<<HKDevice: 0x…, name:…>>` → 名字。**必须带缓存**（Map），每条 Record 都会调 |
| `parseDate(s)` | 手写解析 `2026-11-21 00:40:49 +0800`，不用 `new Date(string)` |
| `sleepNightKey(startStr)` | 中午 12 点前算前一天，所以「一夜」按醒来那天归档 |
| `dayKey(dateStr)` | 取 `YYYY-MM-DD` |

### `js/analyze.js`

`createAggregator()` 建容器 → `feedLine(a, line)` 逐行喂 → `finalize(a)` 摊平成 `result`。

`feedLine` 先看 `<Record `，再按 `type` 属性分派到 46 个常量分支；`<Workout ` 单独一条状态机（`a.cur`），子元素 `<WorkoutStatistics type=… sum=… />` 与 `<WorkoutEvent>` 都往当前 workout 上累。

已支持的 46 种（常量名就是代码里的名字，定义见 `analyze.js:7-53`）：

| 组 | 常量 |
| --- | --- |
| 心脏 | `HR` `RHR` `HRV` `SPO2` `RESP` `VO2` `AFIB` `HRREC` `HIGHHR` `LOWHR` `RSYM` `SYMFATIGUE` `SYMBREATH` `SYMDIZZY` |
| 睡眠 | `SLEEP` `BREATHD` `WRISTM` `SLEEPGOAL` |
| 活动 | `STEPS` `DIST` `ENERGY` `LIGHT` `STAND` `EXER` `EFFORT` `BASAL` `CYCLING` `FLIGHTS` `STANDHOUR` |
| 步态 | `WSPEED` `WSTEPLEN` `WDBLSUP` `WASYM` `SASCEND` `SDESCEND` `WALKHR` `STEADY` `SIXMW` |
| 听力 | `HP` `ENV` |
| 手记与其他 | `WEIGHT` `HEIGHT` `WATER` `CAFFEINE` `MINDFUL` `SEXACT` |

**新加一个类型**的完整动作：常量 → `createAggregator` 里加容器 → `feedLine` 里加 `case` → 同时写进 `drec()` 的每日格子 → `finalize` 里平铺 → `range.js` 的 `pick` 里按日求和 → `report.js` 里显示。漏掉 `drec` 那一份，切时间范围时这个数就消失了。

### `js/range.js`

| 导出 | 说明 |
| --- | --- |
| `PRESETS` | `[['7d','近一周'],['1m','近一月'],['1y','近一年'],['all','全部']]` |
| `spanOf(r, key)` | 以 `r.lastDate` 为锚点往前推（回放，不跟着系统今天走） |
| `pick(r, from, to)` | 遍历 `r.byDay` 求和，返回与 `finalize` 同构的对象 |
| `describe(from, to, days)` | 生成标题用的「2026-10-23 → 2026-11-21」 |

## 数据字典

### `result` 顶层（`finalize` 与 `pick` 同构）

| 字段 | 说明 |
| --- | --- |
| `firstDate` / `lastDate` | 全量最早 / 最晚一条记录的日期（`YYYY-MM-DD`） |
| `days` | 范围内**有数据**的天数（不是日历跨度） |
| `range` | `{from, to}`，只在 `pick` 结果里 |
| `meta` | `{zipBytes, entries, xml, lines, ms}`，`pick` 原样带过去 |
| `me` | 个人资料：`{birth, sex, blood, skin, meds}` |
| `counts` | 类型 → 条数。**全量**，不随范围变 |
| `sources` / `devices` | `[[名字, 条数], …]` 降序。**全量** |
| `hr` | `{n, avg, min, max, p50, p95, p99, hourN[24], hourAvg[24], hourMin[24], hourMax[24], hist[38], histMin:30, histBin:5, day}` |
| `rhr` | `{n, avg, last:[日期,值], day}` |
| `hrv` | `{n, avg}`（`global` 平均，不分日） |
| `spo2` | `{n, avg, min, max, low}`（`low` = 低于 95% 的次数） |
| `resp` | `{n, avg}` |
| `vo2` | `[[日期, 值], …]` 升序 |
| `body` | `{weight:[[d,v]], height:[[d,v]]}` |
| `hp` | `{n, avg, max, hourN[24], hourAvg[24], devices:[{name,n,avg,max,hours}], hours, day:[[d,小时]], over80, over85, over90}` |
| `env` | `{n, avg, max}` 环境音量 |
| `steps` | `{n, total, day:[[d,步]]}` |
| `dist` | `{total}` 步行跑步公里 |
| `energy` | `{total, day, hour[24]}` 活动能量 |
| `sleep` | `{segs, nights}`，`nights` 见下 |
| `workouts` | 见下 |
| `actsum` | `[[d,{move,exercise,stand,moveGoal,exerciseGoal,standGoal}], …]` |
| `light` / `stand` / `exer` | `{total}`，分钟 |
| `effort` | `{n, avg, max, day, hourAvg[24]}`，单位 kcal/hr·kg，`max` 常被 Apple 封顶在 20 |
| `basal` / `cycling` / `flights` | `{total}`：静息千卡 / 骑行公里 / 层楼 |
| `standHour` | `{stood, idle}` 逐小时站立判定计数 |
| `gait` | 9 条 `[[日期, 值], …]`：`speed, stepLen, dblSup, asym, asc, desc, walkHr, steady, sixmw`。**都是按日平均后**的序列 |
| `breath` / `wrist` / `afib` / `hrrec` | 同上形式的稀疏序列 |
| `events` | `{high:[[d,'HH:MM'],…], low:[…]}` |
| `symptoms` | `[[d, 'HH:MM', 类型], …]` |
| `life` | `{water, caffeine, mindful, sex}`，`[[d, 'HH:MM', 值], …]` |
| `sleepGoal` | `[[d, 值], …]` |
| `byDay` | 逐日索引，见下。**切范围只求和这一个** |

### `byDay[YYYY-MM-DD]` 每格

| 字段 | 说明 |
| --- | --- |
| `hrN` `hrS` `hrMin` `hrMax` | 心率条数、和、最小、最大（已取整） |
| `hrH[48]` | 前 24 个是每小时条数，后 24 个是数值之和。求每小时平均值用 `hrH[i+24]/hrH[i]` |
| `hrB[38]` | 5 bpm 一格的直方图桶 |
| `hpN` `hpS` `hpMax` | 耳机音量条数、和、最大 dB |
| `hpDur` | **分钟**（`hp.hours = 总 hpDur / 60`）。按小时用会显示成「单日听了 872 小时」 |
| `hpO80` `hpO85` `hpO90` | 超阈值次数 |
| `hpH[48]` | 同 `hrH` 的结构 |
| `steps` `dist` `energy` | 步数、公里、活动千卡 |
| `energyH[24]` | 每小时活动能量 |
| `light` `stand` `exer` | 日光、站立、锻炼，分钟 |
| `spo2N` `spo2S` `spo2Min` `spo2Low` | 血氧 |
| `respN` `respS` | 呼吸频率 |
| `rhr` | 当日静息心率平均（0 表示那天没有） |
| `hrv` | 当日 HRV 平均。**没有 hrvSum/hrvN**，`finalize` 里已经折算掉了 |
| `effS` `effN` `effMax` | 身体负荷的和 / 条数 / 峰值 |
| `effH[48]` | 同 `hrH`，值是保留 1 位小数的和 |
| `basal` `cyc` `flights` | 静息千卡、骑行公里、层楼 |
| `wsN/wsS` `slN/slS` `dblN/dblS` `asymN/asymS` `ascN/ascS` `descN/descS` `whrN/whrS` | 步速、步长、双支撑、不对称、上楼、下楼、步行心率的「条数 + 和」。平均值 = `S / N` |
| `stood` `idle` | 站立 / 坐着的小时判定 |

### `nights[i]`（睡眠的「一夜」）

`{d, asleep, total, core, deep, rem, awake, bed:'HH:MM', wake:'HH:MM', night}`。单位都是小时，保留 2 位。`bed` 取当晚第一个睡眠段，`wake` 取最后一个；`night` 表示这一夜有一段落在 18:00–08:00。已过滤：`asleep > 0.5`、跨度 ≤ 10 小时、必须有 `night`。

### `workouts[i]`

`{t, dur, unit, dist, kcal, steps, avgHr, s, e, src, dev}`。`t` 是 `Running` / `HighIntensityIntervalTraining` 这种短名（渲染时走 `labelOf('Workout:' + t)` 翻中文）。`dist`/`kcal`/`steps`/`avgHr` 来自 `<WorkoutStatistics>` 子元素 —— `<Workout>` 开始标签里没有这些。

## 渲染层

`js/report.js` 只有两个导出：`renderReport(result, ui)` 与 `renderTab(key, ui)`，其余全是模块内私有函数。`ui = {title, sub, tabs, view}` 对应页面上的四个容器。

模块级可变状态（同一次页面生命周期内共享，别在函数里重新赋值）：

| 变量 | 含义 |
| --- | --- |
| `SRC` | 全量 `result`，`prevPick()` 与预设按钮要用 |
| `R` | 当前范围的切片（`pick` 的返回值），所有 view 只读它 |
| `UI` | 四个容器 |
| `CUR` | 当前 tab key |
| `RANGE` | `{from, to, preset}` |
| `TABS` | `[['overview','概览'],['audio','耳朵'],['heart','心脏'],['sleep','睡眠'],['activity','活动'],['energy','能量'],['mobility','移动'],['devices','设备']]` |
| `NARROW` / `CW` / `CH(k)` | 窄屏判定、图表画布宽（360 或 900）、窄屏高度 ×1.35 |

换范围只调 `applyRange(from, to)`：重算 `R` → 重写标题 → 只重画当前 tab。

### 组件函数（拼 HTML 字符串）

| 函数 | 输出 | 备注 |
| --- | --- | --- |
| `stat(v, label, sub, refHTML)` | 一张数卡 `.stat` | `refHTML` 一般是 `sref(...)` |
| `sref(key, v)` | 参考区间条 `.ref` | 键见下表；容差 5%，避免 REM 25.3% 被判「偏高」 |
| `card(title, sub, body, note)` | 一张卡 `.card` | `sub` 是标题后的小字，`note` 是卡尾说明 |
| `factsHTML(items)` | 一组小卡 `.facts` | `items` 每项 `[值, 单位, 名字, 日期]`；极值、换个说法都用它 |
| `table(head, rows, opts)` | 表格 | `opts.tight` 去掉 460px 最小宽，2–3 列的表必须用 |
| `renderPersona(ps, kicker)` | 人格卡 | `ps` 来自 `persona()` 或 `p*()` |
| `hbarsHTML` / `hbars` | 横条 | 见「图表 API」，页面里一律用 HTML 版 |
| `labelOf(type)` | HK 类型的中文名 | `Workout:Running` 会走 `WORKOUT` 表 |
| `num` `dec` `hm` `mins` `bytes` `esc` | 格式化 | **`hm(hours)` 收的是小时**，传分钟会翻 60 倍 |

`REFS` 里现有 15 个键（lo–hi 是常见范围，min–max 是进度条显示范围，`soft` 表示学界没有统一阈值）：

`rhr` `hrv`(soft) `spo2` `sleep` `deep` `rem` `steps` `volume` `speed` `steplen` `dbl` `asym` `steady` `sixmw` `awake`

### 时间与分组助手

| 函数 | 用途 |
| --- | --- |
| `clockNum('07:27')` | → `7.45` |
| `clockMean(list)` | 单位圆平均向量，跨午夜才对（23 点与 1 点不能算术平均） |
| `clockStr(v)` | `7.45` → `'07:27'`，处理分钟进位 |
| `shiftDay(iso, n)` | UTC 日期加减 |
| `prevPick()` | 取紧邻当前范围、等长的上一段；全量或越界时返回 `null` |
| `delta(cur, prev)` | `'↑ 9% 较上一段'` 一行小字 |
| `byWeekday(days)` | 把 `[[d,值]]` 折成周一…周日的平均 |
| `byPart(hourN, hourAvg)` | 六段：凌晨 0–6 / 早晨 6–9 / 上午 9–12 / 下午 12–18 / 晚上 18–22 / 深夜 22–24 |
| `byMonthSum` / `byMonthAvg` | 折成按月 |
| `dayPeak(byDay, key, dir, minV)` | 某字段最大 / 最小的那天，`minV` 剔掉「那天没记」的 0 |
| `longestGap(byDay)` | 最长断档天数 |

### 八个视图的结构

每个视图签名都是 `viewXXX(r, host)`，往 `host.innerHTML` 里拼字符串，顺序固定为：**人格卡 → 数卡 → 分布图 → 日历/趋势 → 极值八卡**。

| 视图 | 函数（行号） | 结构 |
| --- | --- | --- |
| 概览 | `viewOverview` :838 | 人格卡 → 六张大数卡 → summary-line → 换个说法（`funFacts`）→ 各分区速览（六张 `.fact.quick`，点击切 tab）→ 极值八卡 → 零散手记 → 你的一天（`dayStrip`）→ 作息在漂（`dualLine` + band） |
| 耳朵 | `viewAudio` :1011 | 人格卡 → 4 数卡（时长 / 日均 / 均音量 / 超标次数）→ 每副耳机时长（`hbarsHTML`）→ 24 小时音量环（`clockRing`）→ 每日聆听时长（`bars`）→ 极值八卡 |
| 心脏 | `viewHeart` :1079 | 人格卡 → 6 数卡（带 `sref` 与同比）→ 24 小时心率环 → 星期几 + 时段两组横条 → 直方图 → 每日平均折线 → 心率日历（`calendarYears`，`sqrt:false`）→ 极值八卡 |
| 睡眠 | `viewSleep` :1183 | 人格卡 → 5 数卡 → 全量睡眠带状图（`sleepBands`）→ 最近 90 夜时长（`bars`）→ 结构甜甜圈（`donut`）→ 极值八卡 |
| 活动 | `viewActivity` :1263 | 人格卡 → 6 数卡 → 按年日历（`calendarYears`）→ 三环达成（`hbarsHTML` + 4 张 stat）→ 都做了什么运动 → 运动的节奏（平均每次 / 最长一次 / 多久动一次 / 最多的月份 + 星期几 + 时段）→ 极值八卡 |
| 能量 | `viewEnergy` :1419 | 人格卡 → 6 数卡 → 24 小时负荷环 → 每日负荷折线 → 静息 vs 活动（构成条 + 24 小时活动能量柱）→ 每月爬楼 → 站立小时 → 极值八卡 |
| 移动 | `viewMobility` :1523 | 人格卡 → 6 数卡（带 `sref`）→ 步速 / 步长按日折线 → 双支撑与上楼按月折线 → 活动能力体检 → 极值八卡 |
| 设备 | `viewDevices` :1615 | 人格卡 → 设备与来源贡献 → 个人资料表 |

### 人格卡

`renderPersona(ps, kicker)` 渲染 `{top:{name,say}, tags:[…], dims:[…]}`：一组规则按数组顺序判定，**取第一条命中的当标题**，其余命中的进 chips（最多 5 个）。所以换时间范围标题会变 —— 这是有意的。

| 函数 | 所在分区 | kicker 文案 |
| --- | --- | --- |
| `persona` :421 | 概览（跨分区综合） | 这 N 天里，你是 |
| `pHeart` :501 | 心脏 | 这 N 天里，你的心脏 |
| `pSleep` :531 | 睡眠 | 这 N 天里，你的睡眠是 |
| `pActivity` :578 | 活动 | 这 N 天里，你的活动是 |
| `pAudio` :623 | 耳朵 | 这 N 天里，你的耳朵是 |
| `pEnergy` :659 | 能量 | 这 N 天里，你的能量是 |
| `pMobility` :691 | 移动 | 这 N 天里，你的步态是 |
| `pDevices` :731 | 设备 | 这 N 天里，你的记录是 |

四条硬规矩：

- 名字统一是名词短语（「欠着觉的人」「耳机常驻的人」），因为模板是「这 N 天里，你是 ___」。
- 每条规则都要带阈值，短范围（<14 天）不做长判断。
- 六根（或五、四根）指针是**描述**不是评分，`dim(name, p, val, lo, hi)` 里 `p` 会 `clamp01`。
- 入睡时刻的标准差必须先换坐标系：`(clockNum(x.bed) + 12) % 24`，否则 23:50 与 00:10 会被算成差 8 小时。

## 图表 API（`js/charts.js`，14 个导出）

全部零依赖手写 SVG。内部 `el(tag, attrs, parent, text)` 有一条关键规则：**attrs 里含 `var(` 的字符串走 `style.setProperty`，其余走 `setAttribute`** —— 演示属性不认 CSS 变量，只有落到 style 才能跟着主题变。

| 函数 | 入参 | 主要 opts | 备注 |
| --- | --- | --- | --- |
| `svg(w, h)` | 宽高 | — | **必须同时 setAttribute viewBox + width + height** |
| `clockRing(vals, o)` | 24 个数 | `size:420, min, max, color(v,lo,hi), centerValue, centerLabel` | 跳过 0/NaN；每 3 小时一个刻度 |
| `bars(vals, o)` | 数列 | `w:900, h:180, color, pad:28, labels:true, labelFmt(i)` | 竖直柱 |
| `line(pts, o)` | `[[label,val]]` | `w, h:220, color:'var(--green)', pad:34, fill:true, minPad:2` | y 刻度位数按量级：跨度≥20 取整、≥1.5 一位、否则两位 |
| `hbars(items, o)` | `{name,value,sub?}` | `maxItems:10, color, labelW:150` | SVG 版，手机不要用 |
| `hbarsHTML(items, o)` | 同上 | 加 `base:0` | HTML 版，手机必用；`base` 让窄区间从下沿起画 |
| `donut(parts, o)` | `{name,value,color}` | `size:220, hole:0.62` | |
| `calendar(days, o)` | `[[d,val]]` | `cell:11, gap:2.6, color:'var(--tile)', min, max, fixedYear, sqrt` | `sqrt!==false` 用平方根压；区间窄时传 `sqrt:false` 走线性 |
| `calendarYears(days, o)` | 同上 | 同 `calendar` | 一年一行 53 周，容器 `.cal-years` 横滑 |
| `sleepBands(nights, o)` | `{d,asleep,bed,wake}` | `w, h:260, padL:44, padB:26` | 纵轴 `(hh+12)%24`，中午 12 点当 0；每夜独立 rect |
| `histogram(hist, o)` | 桶数组 | `w, h:180, min:30, bin:5, color` | |
| `dayStrip(hourly, o)` | `{hr[24], energy[24], bed, wake}` | `w, h:240, padL:34, padR:16` | 睡眠带跨午夜拆两截；只标最高最低各一点 |
| `dualLine(series, o)` | `[{color, points}]` | `w, h:210, pad:40, minPad:0.4, tickFmt, band` | `band:true` 把两条线之间填色（睡着的时长） |

## 样式与 DOM 契约

### CSS 变量（两套同名值：`:root` 浅色 / `[data-theme="dark"]` 深色）

| 组 | 变量 |
| --- | --- |
| M3 语义色 | `--primary` `--on-primary` `--primary-container` `--on-primary-container` `--secondary-container` `--on-secondary-container` `--tertiary` `--on-tertiary` `--tertiary-container` `--on-tertiary-container` `--error` |
| 表面五级 | `--surface`（页面底）`--surface-lowest`（卡片）`--surface-low`（卡内小块）`--surface-mid` `--surface-high` `--surface-highest`。**浅色是越高越深，深色是越高越亮** |
| 语义别名 | `--bg` `--card` `--card2` `--line` `--text` `--muted` `--dim` |
| 图表分类色 | `--green` `--blue` `--amber` `--red` `--violet` `--cyan`（饱和度刻意留着，别换成 M3 tonal） |
| 图表专用 | `--axis` `--axis-text` `--strong` `--row-bg` `--row-text` `--row-sub` `--value-text` `--empty` `--tile` |
| 其他 | `--glow-1` `--glow-2` `--code-bg` `--btn-bg` `--btn-line` `--btn-hover` `--on-accent` `--shadow` |
| 形状与动效 | `--r-xl:28px` `--r-lg:24px` `--r-md:16px` `--r-sm:12px` `--r-full`；`--ease-spring` `--ease-std` |

样式文件的分节（行号）：顶栏 164 / 深浅切换 202 / 落地页 243 / 进度 316 / 报告 349 / 时间范围 412 / 卡片 492 / 人格卡 509 / 换个说法 596 / 横条 791 / 窄屏 825。

### 关键类名

| 类名 | 是什么 |
| --- | --- |
| `.card` `.stat` `.grid` `.grid.six` `.two-col` `.summary-line` | 卡片、数卡、栅格 |
| `.fact` `.facts` `.quickgrid` `.qv` `.qk` `.qs` | 极值与速览的小卡 |
| `.persona` `.p-name` `.p-say` `.dims` `.dim` `.dtrack` `.ptags` | 人格卡 |
| `.hbars` `.hrow` `.hname` `.hsub` `.hbar` `.hval` | HTML 横条（窄屏会重排成三行） |
| `.table-wrap` `.data` `.tight` | 表格容器（横滑）与紧凑表 |
| `.ref` `.refbar` `.reft` | 参考区间条 |
| `.range` `.range-presets` `.range-dates` `.range-hint` | 时间范围条 |
| `.cal-years` `.cal-row` `.cal-y` | 按年日历（横滑容器） |
| `.theme-wipe` | Safari 那条自绘的扩散覆盖层 |

### DOM 契约

`index.html` 必须保留这些 id：`#theme`（切换按钮）、`#drop` `#file`（选择与拖放）、`#progress` `#pbar` `#pmsg` `#phint`、`#report` `#rtitle` `#rsub` `#tabs` `#view`、`#error` `#emsg` `#retry`、`#again`。`js/app.js` 直接按这些 id 取节点。

`preview.html` 必须保留：`#devbar` `#dot` `#dbstat` `#dbtime` `#dbcopy`、`#report` `#rtitle` `#rsub` `#tabs` `#view`。tab 的 key 名单**不在 JS 里硬编码**，而是从渲染出来的 `#tabs button[data-k]` 读（`KEYS()`），所以加新 tab 不用改预览页。

## 改完之后怎么验

```bash
# 0) 起服务（改代码自动热重载）
node tools/dev.mjs 8777            # http://127.0.0.1:8777/preview.html

# 1) 数据层：重扫一遍真实包，看有没有算法崩
node tools/parse-local.mjs /path/to/导出.zip out/report.json
#    期望：扫描 2,229,168 行、680,992 条、约 2.0 秒、472 天（byDay 739 天含新增类型）

# 2) 渲染层：桌面 + 手机、浅色 + 深色，逐页截图
node _shot.mjs "a=http://127.0.0.1:8777/preview.html?noes=1&tab=overview"
MOBILE=1 node _shot.mjs "b=http://127.0.0.1:8777/preview.html?noes=1&tab=heart&theme=dark"
#    它会打印 scrollWidth/innerWidth（必须相等，否则有横向溢出）与运行时异常
```

`?noes=1` 一定要带：`preview.html` 的 EventSource 长连接会让 headless Chrome 永远等不到网络静默，截图会挂死。改完 JS 再加 `&v=随机数` 绕缓存。

URL 参数速查：`?preset=7d|1m|1y|all`（**不是 1w**）、`?from=YYYY-MM-DD&to=YYYY-MM-DD`、`?tab=overview|audio|heart|sleep|activity|energy|mobility|devices`、`?theme=dark`。

数字对不对，优先信这三条：`byDay` 求和 = 顶层值、`pick(全量)` 与 `finalize` 完全一致、近一周/近一月/近一年的手算结果。任何一条不一致，先查 `drec()` 有没有漏写这个字段。

## 红线

1. **不许上传**。任何 `fetch` / `XMLHttpRequest` / `<img src=http…>` 往外发数据都是不可接受的；`preview.html` 的 `fetch('out/report.json')` 是本机相对路径，可以，但不能改成远程。
2. **仓库里不许出现真实数据**。`out/`（含 `report.json`）、截图、`导出.zip` 全部在 `.gitignore` 里；`docs/screenshot.png` 只能用合成数据的那张。
3. **别为省事复制一份聚合逻辑**。所有区间统计走 `byDay` + `pick`，否则「换范围后某个数字没变」这类 bug 会反复出现。
4. **别在 SVG 属性里写 `var(--)`**。要写进 `style`，否则切主题时那块颜色不动。
5. **别拼 `rgba()` 上色**。用 `fill: var(--x)` + `fill-opacity`。
6. **窄屏别用 SVG 横条**。整图缩放会把字号压到 4–5px，用 `hbarsHTML`。
7. **日期框字号不得小于 16px**，否则 iOS 聚焦时会把整页放大。
8. **`hm()` 只收小时**、`hpDur` 只收分钟、双支撑与不对称是 0–1 的比例。这三个单位错误各踩过一次。
9. **别手写「较上一段」的比较**。用 `prevPick()` + `delta()`，它会处理越界与基数为 0。
10. **改完必做三件事**：`git commit`、`git push`（走本机 7897 代理，已在 `.git/config`）、《同步这份 README》。

## 概览里的人格是怎么来的

对标 [podhours.app](https://podhours.app/) 的「聆听人格」，但它那套是从行为里硬造一个人设。这里反过来：**只陈述数据自己说了什么**，不假装算命。

- 判定表在 [`js/report.js`](js/report.js) 的 `persona()` 里，十几条规则按数组顺序排优先级，取第一条命中的当标题，其余命中的做成小标签。所以换一个时间范围，标题会跟着变——「全部」下是「走开过的人」（中间断了 697 天），「近一月」下是「静养型」，「近一周」下是「耳机常驻的人」。
- 六根倾向指针是**描述**不是评分：作息（入睡时刻）、睡眠（时长）、活动（日均步数）、运动（每周次数）、听觉（有记录日日均）、恢复（HRV）。指针落在哪一侧只说明偏向，没有好坏。
- 每条规则都带阈值，比如「耳机常驻」要有记录日日均 ≥ 2 小时、「冲到过 N 的人」要最高心率 ≥ 190。达不到就落回「普通人」——**大多数人才是普通人，这不是失败**。
- 短范围不做长判断：少于 14 天不判「静养型」「见光少」，否则一周没运动就成了懒人。
- 人格卡放在概览最上面：一进页面先知道「这段时间的我像谁」，再往下才是「多少」。

## 每个分区也有自己的人格卡

八个分区（含概览）页页开头都有一张人格卡，由 `js/report.js` 里一组 `p*()` 函数算出来：

| 分区 | 函数 | 规则看什么 |
| --- | --- | --- |
| 概览 | `persona()` | 断档、运动频率、入睡时刻、日光、耳机时长、睡眠债、深睡比例、峰值心率、HRV、步数、音量、设备数 |
| 耳朵 | `pAudio()` | 日均时长、>90 dB 次数、凌晨占比、20–24 点占比、平均音量、耳机副数 |
| 心脏 | `pHeart()` | 静息心率、HRV、峰值心率、日均心率、血氧最低值 |
| 睡眠 | `pSleep()` | 平均时长、入睡时刻、深睡与 REM 占比、入睡时刻标准差、夜间清醒 |
| 活动 | `pActivity()` | 日均步数、周末占比、爬楼层数、日光分钟、三环达成率 |
| 能量 | `pEnergy()` | 平均负荷、站立占比、爬楼层数、骑行距离、静息与活动比 |
| 移动 | `pMobility()` | 步速、步长、双支撑、左右不对称、行走稳定度 |
| 设备 | `pDevices()` | 设备台数、来源数、断档天数、覆盖比例、首末记录跨度 |

和概览一套逻辑：规则按数组顺序排，取**第一条命中**的当标题，其余命中的当小标签。所以同一页换个时间范围，标题会变。

几条口径：

- 短范围不做长判断，判定都带样本量门槛（`n >= 5` 这类），一周没运动不会被判成懒人。
- 指针只是把那几个数摆到一根轴上看相对位置，**不是评分**。每页 3–6 根，取决于这个分区能拿到哪些数。
- 入睡时刻的标准差要先搬到「中午 12 点当 0」的坐标系再算，否则 23:50 和 00:10 会被算成差 8 小时。
- 左右不对称一半的日子是 0，中位数会掉到 0.0%，所以人格卡和数卡一样用均值。

## 「换个说法」那几张卡是怎么算的

同一个数换个单位就有画面。全部按当前时间范围现算，所以切范围会跟着变：

| 卡 | 怎么算的 |
| --- | --- |
| 心脏跳了 | 每日平均心率 × 1440 分钟 × 有心率的天数。**是估算**，因为不是 24 小时都在采 |
| 走和跑过的路 | 步行与跑步距离累加。超过 1,700 km 就说「够从绵竹走到北京」，不到就说相当于 400 米操场几圈 |
| 睡掉了 | 每晚睡眠时长累加 ÷ 24。超过 30 天才换算成月 |
| 耳机戴了 | 每条音量采样的持续区间累加 ÷ 24，跟 iOS 里「耳机音量」的统计口径一致 |
| 爬出来的高度 | 爬楼层数 × 3 米，超过 8,848 米就换算成几个珠峰 |
| 心跳最快的那一下 | 最高心率 ÷ 60。旁边给最低心率做对照 |
| 最长的一夜 | 睡眠段里有效时长最长的那晚 |
| 心肺 VO₂max | 这段范围里最早、最高、最低三条，用来看掉下去又回来 |

## 概览那两张时间图怎么读

**你的一天，摊在 24 小时里** —— 横轴是 0–24 点，三层叠着：

- 紫色竖带：这段范围的平均入睡到起床时间，跨午夜会画成两截
- 绿色线：每小时的平均心率（左轴数值）
- 琥珀柱：每小时的平均活动能量，只当强度背景，没有刻度

心率早上抬、夜里沉；琥珀柱的高峰跟心率不完全同步 —— 坐着心跳快和动着心率没上来是两件事。

**作息在漂** —— 每个月一个点，画入睡和起床两个时刻。

- 时刻是环形的，直接画会从 23:59 跳回 00:00，所以坐标以**中午 12 点为 0 点**摆，午夜落在中间
- 两条线之间的紫色就是实际睡着的时长：整体变厚就是睡多了，变薄就是觉被压掉了
- 少于 3 个月不画，看不出趋势

## 参考区间怎么标的

数卡底下那条细横条：**绿色段是一般成人的常见范围，琥珀段是常见范围之外，竖着的指针是这一段时间的实际值**。右边文字直接给结论（正常 / 偏低 / 偏高 / 常见区间）。

| 指标 | 常见范围 | 说明 |
| --- | --- | --- |
| 静息心率 | 60–100 bpm | 长期运动的人常在 50 出头，低不等于病 |
| 心率变异性 | 20–100 ms | 没有统一阈值，个体差异极大，所以标签写「常见区间」而不是「正常」 |
| 血氧 | 95–100% | 睡眠时短暂掉到 90 出头很常见 |
| 睡眠时长 | 7–9 小时 | 成人建议，不是硬指标 |
| 深睡 | 13–23% | 随年龄下降 |
| REM | 20–25% | |
| 夜间清醒 | 0–0.5 小时 | 夜里醒来的总时长 |
| 日均步数 | 7,000–12,000 | |
| 耳机平均音量 | 40–70 dB | WHO 建议一周不超过 40 小时的 80 dB |
| 步行速度 | 3.6–6.5 km/h | 低于 3.6 长期看和体能下降相关 |
| 步长 | 60–80 cm | |
| 双支撑占比 | 20–35% | 越高越稳，太高说明走得小心 |
| 左右不对称 | 0–5% | 越小越平衡 |
| 行走稳定度 | 95–100% | iPhone 自己算的跌倒风险指标 |
| 六分钟步行 | 400–700 m | |

判定留了 5% 容差，否则 REM 25.3% 对着「20–25」会被标成偏高 —— 边界上的数字不该被当成异常。**这些是给普通人看的参考，不是诊断标准**，任何一项异常都该找医生而不是看这个页面。

## 每个分区怎么组织

对标 [podhours.app](https://podhours.app/) 的做法：一个主题不该只有一张图，而是把它拆成几层，每层回答一个不同的问题。分区之间用同一套模板：

| 层 | 回答的问题 | 心脏页的例子 |
| --- | --- | --- |
| 数卡 + 同比 | 这段时间是多少，比上一段多还是少 | 12,889 次采样 · ↑ 9% 较上一段 |
| 分布 | 什么时候最忙，按小时／星期几／一天里的时段 | 周一平均 90 bpm 最高，下午 12–18 点占 31% 采样 |
| 日历 | 具体是哪几天，什么时候断过 | 一格一天的平均心率，空格是没有记录 |
| 趋势 | 大方向在变好还是变差 | 每天的平均心率折线 |
| 极值 | 最好或最差的那一次是哪天 | 心跳最快 205 bpm · 2026-10-30 |
| 口径 | 这个数字是怎么算出来的 | 「静息心率」只认手表自己的测量，不参与心率平均 |

三条硬规矩：

- **每个大数下面写清口径**，写不下就写进卡片底部的 note。比例悬殊的（各星期心率 79–88）条形要从区间下沿起画，不能从 0 起，否则七根条一样长。
- **短范围不套长范围的图**：30 天以内的日历按 30 天排，不铺成整年的格子；长范围才按年分行。
- **能同比就同比**：只要上一段等长的区间仍在数据范围内，就算出来给它一个箭头。

## 支持与不支持

**支持**（跑一遍 223 万行的真实包都验证过）：

- 心脏：心率、静息心率、心率变异、血氧、呼吸频率、高/低心率事件、房颤负担、心率恢复
- 睡眠：分期、每夜时长与入睡起床、呼吸紊乱、睡眠腕温、睡眠目标
- 活动：步数、步行跑步距离、骑行距离、活动能量、静息能量、身体负荷、站立时长与逐小时站立判定、爬楼层数、三环（ActivitySummary）、运动（含 `WorkoutStatistics` 子元素里的距离/热量/均心率/步数）
- 听力：耳机与环境音量（按音量、按设备、按小时、按日）
- 步态：步行速度、步长、双支撑、左右不对称、上下楼速度、行走稳定度、六分钟步行、步行心率
- 手记：喝水、咖啡因、正念、性行为、症状、睡眠目标（数据还在，暂时不单独占一张卡 —— 明细太碎，列成表占地方，读者又读不出结论）
- 结构与来源：类型计数、数据来源、设备、个人资料

**不支持**：心电图 `electrocardiograms/*.csv`、GPS 轨迹 `workout-routes/*.gpx`、听力图 `<Audiogram>` 元素、临床记录。它们不是 `<Record>`，各自需要独立的解析器和可视化，还没做。

## 实现笔记

踩过的坑，留给下一个人：

- **`导出.xml` 每行都有前导空格**。判断标签要用 `trimStart()` 之后的切片，否则一条都匹配不上。
- **`<Workout>` 开始标签里没有距离和热量**。iOS 16 之后这些值挪进了 `<WorkoutStatistics type="...DistanceWalkingRunning" sum="2.381"/>` 子元素，得靠状态机跟着当前 workout 累加。
- **标签名判断的长度**。用 `slice(i, i + 16)` 取前缀时，`<WorkoutStatistics`（19 字符）会被截成 `<WorkoutStatisti`，永远匹配不到。取 32。
- **入睡时间不能算术平均**。23 点和 1 点平均成中午。要用单位圆上的平均向量。
- **睡眠段要分开看**。`Awake` 段的结束时间是夜里醒来的时刻，拿来当起床时间会把平均起床算到 4 点；白天补觉的段还会把「一夜」拉成 13 小时的长条。
- **设备名要缓存**。每条 Record 都带一段 `<<HKDevice: 0x...>>`，正则在几十万次调用里会拖慢一倍。
- **SVG 必须同时给 `viewBox` 和 `width/height` 属性**。只给 viewBox 时，CSS 的 `width: auto` 会把它撑成容器全宽。
- **单位别写死**。步行跑步距离的 `unit` 是 `km` 就直接用，除以 1000 会变成「3 km 总距离」。
- **SVG 里写 `fill="var(--x)"` 不生效**。演示属性不认 CSS 变量，得落到 `style` 上（`fill: var(--x)`）。换主题时颜色才会自己跟着变，不用重绘图表。
- **带透明度的色块不要拼 `rgba()`**。拼出来的是固定色值，换不了主题；用 `fill: var(--green)` 加 `fill-opacity`。
- **有些「百分比」是 0–1 的比例**。双支撑、左右不对称、行走稳定度的 `unit` 写着 `%`，值却是 `0.29` 这种小数。别再乘 100 之前先看一眼实际量级，否则一个 29% 会显示成 2900%。
- **不对称用均值、双支撑用中位数**。左右不对称有一半的日子是 0（那天没走路），取中位数会得到 0.0%，看着像坏图；双支撑相反，单日噪声大，取中位数才稳。
- **y 轴刻度按量级定位数**。上楼速度在 0.23–0.32 m/s 之间，用 `Math.round` 画出来是一排 0；跨度小于 1.5 时留 2 位小数。
- **页面底比卡片低一级**。纯白卡片压在白底上几乎看不出边界（#ffffff 对 #f7faf1 只差 3% 亮度），所以页面底取 #e6ecda、卡内小块 #eef2e5、卡片纯白 —— 三层从深到浅，卡片才浮得起来。
- **同一天多条记录要先平均再连成线**。呼吸频率一晚几十条，直接按时间戳画是一层锯齿；先按日取平均，趋势才浮出来。
- **比例悬殊的两项别画饼**。静息能量占 89%、活动只占 11%，环形图永远是一大一小、看不出第二项。改成一条构成条看总账，下面用 24 小时的活动能量柱看「什么时候真的在动」，同一张卡里既有比例又有形状。
- **极值统一用小卡，不用表格**。八张 `.fact`：值 + 单位 + 一句话 + 日期，和「换个说法」同一套样式；两列表格在手机上会横滑，数字反而记不住。
- **`hpDur` 存的是分钟不是小时**。耳机每日时长平铺时没换算，直接按小时显示就是「单日听了 872 小时」。
- **一天的数字是各来源直接累加的**。静息能量这种，同一天有多个 App 重复写入时会偏高（最高那天 6,960 千卡），所以极值只反映相对大小，卡尾要说明这一句。
- **第三方 App 会写小数心率**。同一份导出里混着 158.275 这种值，直接显示会变成「最高 158.275 bpm」；平铺到日索引时取整。

## 深浅色

默认浅色，右上角按钮切换，选择记在 `localStorage`。

- 两套主题是同一批 CSS 变量的两组值（`:root` / `[data-theme="dark"]`），图表里的颜色全部走 `var(--…)`，所以切换时**不需要重绘**，SVG 会自己跟着变。
- 切换动画从按钮那个点长出一个圆，圆里是新主题。两条实现：
  - Chrome / Edge：用 View Transitions 拍一张页面快照，再把 `clip-path` 的圆动画挂到 `::view-transition-new(root)` 上，所以圆里是**真的新页面**随之展开。
  - Safari（含 iOS，主场景）：View Transitions 到 18 才有，把动画挂到伪元素上在 WebKit 也不稳。改成自己画：把**新主题**的底色做成一层，`clip-path` 从点击点扩到整屏，**铺满之后才真的换主题**，再把这层撤掉。
    - 顺序不能反。先换主题再画，屏幕上是旧色在往里收，看着像倒放；先画后换，才是新色从按键位置推开。
    - 目标主题的底色要读，但不能先把页面切过去：在同一帧里临时改一下 `data-theme`、读完立刻改回来，浏览器不会画出这个中间态。
  - 系统开了「减少动态效果」直接换，不做动画。
  - 圆心取真实点击位置；键盘 Enter/Space 触发的 click 里 `clientX/Y` 都是 0，会退回按钮中心（否则圆从左上角长出来）。
- 地址栏也能指定：`?theme=dark` / `?theme=light`。

## 手机 / iPhone

主要使用场景是 iPhone 上的 Safari，所以窄屏（≤720px）是单独排过的，不是桌面版缩一缩：

- **横向条形图改成 HTML**。SVG 横条是按 900 宽的画布画的，压到 390 屏宽时 12.5px 的字只剩 4.7px；现在这类图直接排成 div，字是真字号。窄屏下每行重排成「名字 + 数值 / 整宽条 / 说明」三行。
- **其余 SVG 图在窄屏换小画布**（360 宽而不是 900），字号不动，所以在手机上仍然是 10–12px；同时把高度抬了 35%，形状不至于被压扁。
- **能横滑的地方就横滑，不压缩**：按年铺开的日历（一年 53 列）、六列的运动明细表，都在自己的容器里左右滑，不撑破页面。
- **日期框字号 16px**，低于这个值 iOS 聚焦时会自己把整页放大。
- 输入区文案改成「点按选择」——iOS 上拖放不可靠；触点都做到 ≥38px 高；tab 条改成横向滑动。
- `viewport-fit=cover` + `env(safe-area-inset-bottom)`，刘海屏底部不贴边。

## 浏览器要求

`DecompressionStream` 需要 Chrome / Edge 80+、Safari 16.4+、Firefox 113+。iPhone 上就是 iOS 16.4 及以上。

切主题那圈扩散有两条路（见上面「深浅色」）：Chrome/Edge 走 View Transitions，Safari 和其余浏览器走自绘的覆盖层扩散，所以 iPhone 上一样是从按键位置展开、由内向外。

## 实时预览（开发自用）

改一行代码就想看到效果，不用重新打包、不用手动刷新：

```bash
node tools/dev.mjs            # http://127.0.0.1:8777/preview.html
```

- `preview.html` 直接读 `out/report.json`（先跑一次 `tools/parse-local.mjs` 生成），跳过选文件和解压，秒开。
- 页面顶部那条 LIVE 是最小化的状态条：数据源、扫描行数、耗时、本地时间。
- 改 `*.html / *.css / *.js / *.json` 存盘，浏览器自动重载；切换中的 tab 和滚动位置会保留，所以站在原地就能看到变化。
- 正式页 `index.html` 不含任何预览代码，发布物和开发态是分开的。

## 路线图 · 进度

一次只推进一项，确认了才动手；做完就把状态改掉。`✅` 已完成　`🔧` 在做　`⬜` 待确认　`⏸` 暂缓

### 阶段 1 · V1 上线 ✅

| | 事项 | 说明 |
| --- | --- | --- |
| ✅ | 浏览器端解析 | ZIP + XML 流式扫描，223 万行约 2 秒，数据不出本机 |
| ✅ | 六个视图 | 概览、耳朵、心脏、睡眠、活动、设备 |
| ✅ | 开源与部署 | MIT，GitHub Pages 直出，<https://pogo.gay/apple-health-web/> |

### 阶段 2 · 实时预览通道 ✅

| | 事项 | 说明 |
| --- | --- | --- |
| ✅ | `tools/dev.mjs` | 静态服务 + SSE 热重载，只监听源码类文件，不理会 `out/` |
| ✅ | `preview.html` | 读 `out/report.json` 直出六页，保留 tab 与滚动位置 |
| ⬜ | 可选：左右分栏 | 左边一列改动说明/开关，右边预览；只在 `preview.html` 生效 |

### 阶段 3 · 时间范围回放 🔧

拿到导出包之后，不只是"全部六年"，而是能选一段时间只看那一段，并且先给大数、再给细节。

| | 事项 | 说明 |
| --- | --- | --- |
| ✅ | 预设范围 | 近一周 / 近一月 / 近一年 / 全部，锚点是数据最后一天，不是系统今天 |
| ✅ | 自定义起止 | 两个日期框，反着填会自动对调 |
| ✅ | 逐日聚合 | `analyze.js` 多输出一份 `byDay`（每天一条），范围切片只做求和，不重扫 XML |
| ✅ | 概览大数 | 心率读数、累计睡眠、晒太阳、步数、距离、千卡，六张一排 |
| ✅ | 摘要行 | 耳机时长、运动次数、静息心率、血氧 |
| ✅ | 各分区跟随范围 | 心脏 / 睡眠 / 活动 / 耳朵四页都按切片重算，不重扫 XML |
| 🔧 | **等确认：看一遍** | 六张大数的顺序对不对；短范围下活动日历只剩一小截、睡眠柱变细，要不要换排法 |
| ⬜ | 范围写进 URL | 已支持 `?preset=7d` 与 `?from=&to=`（截图、分享用），要不要做成"复制链接"按钮 |

### 阶段 3.5 · 深浅色 ✅

| | 事项 | 说明 |
| --- | --- | --- |
| ✅ | 浅色为主 | 白卡 + 浅灰底，绿色主色，图表颜色全部换成变量 |
| ✅ | 右上角切换 | 图标随当前主题换，选择存 `localStorage` |
| ✅ | 从点击处展开 | Chrome/Edge 用 View Transitions 圆形揭示；Safari 走自绘层：新底色从点击点扩满整屏后才换主题；键盘触发退回按钮中心 |
| 🔧 | **等确认：浅色够不够亮/够不够淡** | 自己点一下，觉得哪里刺眼或灰得发闷就说 |

### 阶段 3.8 · 对标 podhours（进行中）

| | 事项 | 说明 |
| --- | --- | --- |
| ✅ | 概览人格卡 | 十几条规则按优先级判一条主标签，六根倾向指针，换范围会变；放在概览最上面 |
| ✅ | 分区人格卡 | 耳朵/心脏/睡眠/活动/能量/移动/设备各一组规则，同一种渲染（renderPersona） |
| ✅ | 极值小卡 | 概览与六个分区统一成八张 .fact（值 / 单位 / 一句话 / 日期），不再用两列表格 |
| ✅ | 换个说法 | 八张换算卡：心跳次数、走多远、睡掉几天、耳机戴几天、爬楼高度、心跳速率、最长一夜、VO₂max 曲线 |
| ✅ | 参考区间 | 数卡底部细条：绿段是常见范围，指针是实际值，右侧给「正常 / 偏低 / 偏高」 |
| ✅ | 你的一天 + 作息在漂 | 24 小时叠图（睡眠带 + 心率 + 能量柱）、按月入睡起床双线 |
| ✅ | 极值八卡 | 最快/最慢心跳、最多步数、最长一夜、最晚睡下、最响一次、最高负荷、最低血氧 |
| ✅ | 心脏页样板 | 数卡带同比、星期几与时段分布、心率日历、极值表 |
| 🔧 | **其余六页** | 耳朵 / 睡眠 / 活动 / 能量 / 移动 / 设备的「分布 + 日历 + 极值 + 同比」待推 |

### 阶段 4 · 内容扩展（做不做、先做哪个，等确认）

| | 事项 | 手上已有的数据 |
| --- | --- | --- |
| ⬜ | 压力 / 恢复 | HRV + 静息心率 + 睡眠，三者合成的代理指数（不是医学指标） |
| ⬜ | 数据断档地图 | 哪几段时间没戴表；现有日历已能看出，可做成独立一页 |

心电图、轨迹、听力图三项挪到了 [阶段 3.7](#阶段-37--全部数据批次一)。

### 阶段 3.6 · iPhone / Safari 优先 ✅

| | 事项 | 说明 |
| --- | --- | --- |
| ✅ | 横条改 HTML | 字号不再随 SVG 缩放，窄屏重排成三行 |
| ✅ | 图表窄屏画布 | 900 → 360，字号保真，高度 +35% |
| ✅ | 日历 / 表格横滑 | 不压缩格子，容器内左右滑 |
| ✅ | 触摸细节 | 日期框 16px 防缩放、触点 ≥38px、tab 横滑、安全区 |
| ✅ | 落地页文案 | 「点按选择」，iOS 上不指望拖放 |
| 🔧 | **等确认：拿手机过一遍** | 尤其是横向条的三行排法、运动明细表的横滑手感 |

### 阶段 3.7 · 全部数据（批次一）✅

目标是「把导出包里能分析的都放进去」。第一批做的是数据层全通 + 两个新页：

| | 事项 | 说明 |
| --- | --- | --- |
| ✅ | 逐日索引扩容 | `byDay` 从 464 天涨到 739 天：身体负荷、静息能量、骑行、爬楼、站立判定、六项步态都进了每日一格，切范围只求和 |
| ✅ | 能量页 | 6 张数卡 + 24 小时负荷环 + 每日负荷折线 + 静息/活动甜甜圈 + 每月爬楼 + 站立/坐着 |
| ✅ | 移动页 | 步速 / 步长 / 双支撑 / 上楼四条折线 + 活动能力体检横条 |
| ✅ | 活动页三环 | ActivitySummary 397 天：活动 52%、锻炼 52%、站立 68%、三期全中 161 天、最长连续 10 天 |
| ✅ | 你的一天 | 24 小时横轴：睡觉那段 + 每小时心率 + 每小时烧的能量，一条轴上叠着看 |
| ✅ | 作息在漂 | 每月平均入睡与起床两条线，中间那块面积就是实际睡了多久 |
| ✅ | 极值改小卡 | 从表格换成小模块，八张：心跳最快最慢、走最多、睡最长、最晚睡、听得最响、负荷最高、血氧最低 |
| ⬜ | 心脏页补明细 | 高/低心率事件、房颤负荷、心率恢复（数据已在 `report.json` 里，页面还没画） |
| ⬜ | 睡眠页补明细 | 呼吸紊乱、睡眠腕温、睡眠目标 |
| ⬜ | 跑步技术 | RunningSpeed / Power / StrideLength / VerticalOscillation / GroundContactTime，数据层还没收 |
| ⬜ | 听力图 | `<Audiogram>` 1 份，8 个频段 |
| ⬜ | 心电图墙 | 20 份 CSV |
| ⬜ | 轨迹地图 | 23 条 GPX |

### 阶段 5 · 工程（等确认）

| | 事项 | 说明 |
| --- | --- | --- |
| ✅ | 交接文档 | 数据流 / 代码地图 / 字段字典 / 渲染与图表 API / 样式 token / 验收命令 / 红线，见上文 |
| ⬜ | 英文界面 | 目前全中文 |
| ⬜ | 纯函数单测 | `analyze.js` 的聚合逻辑可以在 node 里直接测 |
| ⬜ | 解析进度按字节 | 现在按行数估算，进度条末端会跳一下 |

### 约定

- 一次只动一项。清单里没勾的，不动。
- 每完成一项：改这里的状态 → commit 写上做了什么 → 页面截图确认。
- 预览通道开着的时候，改动前先说一句，改完你看页面。

## License

MIT
