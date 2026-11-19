# 黄金换算

把国际现货黄金美元报价换算为人民币元／克。项目使用原生 HTML、CSS 和 JavaScript，直接从浏览器获取换算行情，无需安装依赖或提供 API 密钥。

- 首页默认定位到「今日走势」。走势图按北京时间显示从零点起的 15 分钟盘中采样，并标明最新报价时间和参考汇率日期。
- 历史走势可切换 7、30、90、180 天，随区间更新高低点、涨跌幅和每日数据。
- 「国内金价对照」提供上金所 Au99.99 延时行情、水贝金条挂牌及建行、工行积存金的原站入口。展开「历史报价快照」可以查看本站存档的 [`domestic-quotes.json`](domestic-quotes.json) 和对应报价日期或时间。
- 「央行黄金储备」默认展示中国，快捷栏固定显示中国和储备排名最前的另外四国，也可展开前 20 名切换。折线图、柱状图和默认收起的月度明细显示所选国家截至最新报告月的近 12 个月。估算价使用可比月份的储备正增量与对应月份的市场金价。
- 「全球央行购入与卖出参考」展示近 12 个月已报告储备量的正向及负向变化合计，以及各月净增持量相加后的累计值。只统计相邻两个月均报实物量的国家和地区，逐月标出覆盖数。两侧数值均由储备变化推算，可能包括调拨、掉期和统计调整。
- 行情指南解释金价驱动因素，附可复制的观察模板。观察日历覆盖 2026-11-18 至 2027-11-18，按该日已公布的官方日程整理。

## 本地预览

在项目根目录运行以下命令，然后访问 [本地预览](http://localhost:8000)。

```bash
python3 -m http.server 8000
```

## 数据来源

- [Gold API](https://gold-api.com/faqs) 提供网站主报价所用的现货黄金美元价格。
- [Standard Bullion](https://standardbullion.com/gold-price-api) 提供美元盘中采样和历史日收盘价。
- [Frankfurter](https://frankfurter.dev/) 提供美元兑人民币日度参考汇率。
- [NIST](https://www.nist.gov/pml/owm/metric-si/unit-conversion/precious-metals-conversion-information) 提供金衡盎司换算依据。人民币金价（元／克）＝美元金价 × 美元兑人民币汇率 ÷ 31.1034768。
- [`central-bank-reserves.json`](central-bank-reserves.json) 的官方黄金数量主要取自 [IMF 国际流动性数据库](https://data.imf.org/en/datasets/IMF.STA:IL)的 `RGV_REVS.FTO.M`。俄罗斯、奥地利、法国、意大利、荷兰和西班牙使用 [IMF 储备数据库](https://data.imf.org/Datasets/IRFCL)的 `IRFCLDT1_IRFCL56V_FTO.S1XS1311.M`。中国取自[国家外汇管理局](https://www.safe.gov.cn/safe/2026/0206/27116.html)，其他补充来源列在网页「购金价格估算与数据来源」中。金衡盎司折算为公吨，缺报月留空。各国按最后有效储备量排名并标注报告月。市场金价使用[世界银行 Pink Sheet](https://www.worldbank.org/en/research/commodity-markets)和[美联储 EXCHUS](https://fred.stlouisfed.org/series/EXCHUS)的月均值折算为人民币元／克。
- 月度补数时，`months`、`benchmark` 和每国的 `holdings` 按月份对齐。缺报储备量或暂未公布的市场基准用 `null`，新数据可补齐旧缺口。同一月份已有核实值继续保留。若增持月缺少市场基准，先展示储备和已报告月份，参考均价待基准补齐。
- [`global-gold-flows.json`](global-gold-flows.json) 从 IMF 国际流动性实物黄金序列汇总已报告经济体的月末储备环比变化，按正、负变化分别求和，负向合计以正的吨数存储。净增持量按两侧原始值相减后四舍五入。地区及机构汇总序列不纳入，近月有更多报告时补齐覆盖。网页将快照首次核实或后续变动的 `updatedAt` 换算为北京时间。

## 发布方式

[GitHub Actions](https://github.com/BraveryYY/gold-cny/actions/workflows/pages.yml) 从 `main` 发布 GitHub Pages，页面入口为 `index.html`。工作流每月 8 日和 25 日北京时间 10 点核对官方月报，也可在 Actions 中手动运行。若确认有新储备量，工作流补进快照并在同一次运行中部署。各国继续显示最近已核实的报告月份。
