# 黄金换算

把国际现货黄金美元报价换算为人民币元／克。项目使用原生 HTML、CSS 和 JavaScript，直接从浏览器获取换算行情，无需安装依赖或提供 API 密钥。

- 首页默认定位到「今日走势」。走势图按北京时间显示从零点起的 15 分钟盘中采样，并标明最新报价时间和参考汇率日期。
- 历史走势可切换 7、30、90、180 天，随区间更新高低点、涨跌幅和每日数据。
- 「国内金价对照」读取本站发布的 [`domestic-quotes.json`](domestic-quotes.json)，展示上金所 Au99.99 收盘、水贝金条挂牌及建行、工行主动积存参考买入快照。「刷新行情」重读文件，并分别标明本站读取时间和各来源的报价时间或日期。
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

## 发布方式

GitHub Pages 从 `main` 分支根目录发布静态文件。页面入口为 `index.html`。
