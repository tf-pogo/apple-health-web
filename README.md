# 健康档案 · Apple Health 可视化

把 iPhone「健康」App 导出的 `导出.zip` 拖进浏览器，得到一份能看、能读、不枯燥的身体年表。

零依赖、零后端、零构建。整包在本地解析，文件不会离开你的电脑，断网也能跑。

> 同类项目 [PodHours](https://podhours.app) 只做耳机使用时长。这个项目想要的是全部：心脏、耳朵、睡眠、活动、设备编年史。

![落地页](docs/screenshot.png)

在线版：<https://tf-pogo.github.io/apple-health-web/>

---

## 六个视图

| 页 | 回答的问题 | 主要图表 |
| --- | --- | --- |
| 概览 | 这些年到底攒了多少条记录，数据从哪来 | 记录类型排行、数据来源排行 |
| 耳朵 | 一天里什么时候听得最响，哪副耳机用得最狠 | 每副耳机时长、按小时的平均音量环、每日聆听时长 |
| 心脏 | 心跳在一天里的形状，静息心率这几年是升是降 | 24 小时心率环、心率分布直方图、每日平均心率 |
| 睡眠 | 每一夜从几点睡到几点，深睡和 REM 各占多少 | 全量睡眠带状图、最近 90 夜时长、结构甜甜圈 |
| 活动 | 哪几天真的在走路，运动记录都做了什么 | 按年铺开的日历热力图、运动类型排行、最近 14 次运动明细 |
| 设备 | 戴过哪些表、听过哪些耳机 | 设备与来源的贡献 |

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
css/style.css         深色主题
js/app.js             文件接入 + Worker 生命周期
js/worker.js          Worker 入口：解压、逐行扫描、汇报进度
js/zip.js             零依赖 ZIP 读取（EOCD 定位 + DecompressionStream）
js/parse.js           行解析、属性提取、时区解析
js/analyze.js         聚合器：从 XML 行到统计结果
js/charts.js          手写 SVG 图表
js/report.js          渲染层：六个视图
tools/serve.mjs       本地静态服务器
tools/parse-local.mjs 命令行版解析器
```

## 支持与不支持

支持：心率、静息心率、HRV、血氧、呼吸频率、睡眠分期、步数、距离、活动能量、耳机音量、运动记录（含 `WorkoutStatistics` 子元素里的距离/热量/均心率）、数据来源与设备。

不支持：心电图 CSV、GPS 轨迹、临床记录。它们各自需要独立的解析器和可视化，还没做。

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

## 浏览器要求

`DecompressionStream` 需要 Chrome / Edge 80+、Safari 16.4+、Firefox 113+。

## License

MIT
