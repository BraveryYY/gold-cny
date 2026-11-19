"use strict";

{
  const snapshotUrl = window.location.protocol === "file:"
    ? "https://braveryyy.github.io/gold-cny/domestic-quotes.json"
    : "./domestic-quotes.json";
  const readTime = byId("domestic-read-time");
  const refreshNote = byId("domestic-refresh-note");
  const archive = byId("domestic-quote-archive");
  const priceFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const readTimeFormat = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let reading = false;

  function setTime(element, dateTime, label) {
    element.dateTime = dateTime;
    element.textContent = label;
  }

  function showSnapshot({ sge, waterbei, ccb, icbc }) {
    const prices = [sge.price, waterbei.price, waterbei.netPrice, ccb.price, icbc.price];
    const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
    const isQuoteTime = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(value) && Number.isFinite(Date.parse(value));
    if (!prices.every((price) => Number.isFinite(price) && price > 0) ||
        !Number.isFinite(waterbei.minFee) || !Number.isFinite(waterbei.maxFee) ||
        waterbei.minFee < 0 || waterbei.maxFee < waterbei.minFee ||
        !isDate(sge.tradeDate) || !isDate(icbc.quoteDate) ||
        !isQuoteTime(waterbei.quoteTime) || !isQuoteTime(ccb.quoteTime) || !isQuoteTime(icbc.pageTime)) {
      throw new Error("Invalid domestic quote snapshot");
    }

    byId("sge-price").textContent = priceFormat.format(sge.price);
    byId("waterbei-price").textContent = priceFormat.format(waterbei.price);
    byId("waterbei-net-price").textContent = priceFormat.format(waterbei.netPrice);
    byId("waterbei-fee").textContent = [waterbei.minFee, waterbei.maxFee].map((fee) => priceFormat.format(fee)).join("–");
    byId("ccb-price").textContent = priceFormat.format(ccb.price);
    byId("icbc-price").textContent = priceFormat.format(icbc.price);

    setTime(byId("sge-trade-date"), sge.tradeDate, sge.tradeDate);
    setTime(byId("waterbei-quote-time"), waterbei.quoteTime, waterbei.quoteTime.slice(0, 16).replace("T", " "));
    setTime(byId("ccb-quote-time"), ccb.quoteTime, ccb.quoteTime.slice(0, 19).replace("T", " "));
    setTime(byId("icbc-quote-date"), icbc.quoteDate, icbc.quoteDate);
    setTime(byId("icbc-page-time"), icbc.pageTime, icbc.pageTime.slice(0, 19).replace("T", " "));
  }

  async function readDomesticQuotes() {
    if (!archive.open || reading) return;
    reading = true;
    refreshNote.hidden = true;
    try {
      showSnapshot(await getJson(snapshotUrl, { cache: "no-store" }));
      const now = new Date();
      setTime(readTime, now.toISOString(), readTimeFormat.format(now));
      readTime.parentElement.hidden = false;
    } catch {
      refreshNote.textContent = readTime.dateTime
        ? "暂时无法重读本站快照，保留上次成功读取的报价。"
        : "暂时无法读取本站快照，可打开各报价来源查看。";
      refreshNote.hidden = false;
    } finally {
      reading = false;
    }
  }

  archive.addEventListener("toggle", readDomesticQuotes);
  refreshButton.addEventListener("click", readDomesticQuotes);
}
