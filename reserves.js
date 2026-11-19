"use strict";

{
  const dataUrl = window.location.protocol === "file:"
    ? "https://braveryyy.github.io/gold-cny/central-bank-reserves.json"
    : "./central-bank-reserves.json";
  const status = byId("reserves-status");
  const monthsInYear = 12;
  const minimumIncrease = 0.1;
  const countriesInChinese = new Intl.DisplayNames("zh-CN", { type: "region" });
  const tonnes = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const deltaTonnes = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });

  function summarize({ code, holdings, earlier, estimateNote }, months, benchmark) {
    const latestIndex = holdings.findLastIndex(Number.isFinite);
    const end = latestIndex === -1 ? months.length - 1 : Math.max(monthsInYear, latestIndex);
    const start = end - monthsInYear;
    const recentHoldings = holdings.slice(start + 1, end + 1);
    const recentPrices = benchmark.slice(start + 1, end + 1);
    const changes = recentHoldings.map((stock, i) => {
      const previous = holdings[start + i];
      return Number.isFinite(stock) && Number.isFinite(previous) ? stock - previous : null;
    });
    let pricedTonnes = 0;
    let indicativeCost = 0;
    changes.forEach((change, i) => {
      const monthlyPrice = recentPrices[i];
      if (change >= minimumIncrease && Number.isFinite(monthlyPrice)) {
        pricedTonnes += change;
        indicativeCost += change * monthlyPrice;
      }
    });
    const net = Number.isFinite(holdings[start]) && Number.isFinite(holdings[end]) ? holdings[end] - holdings[start] : null;
    return {
      code, net, estimateNote,
      baseline: months[start],
      months: months.slice(start + 1, end + 1),
      holdings: recentHoldings,
      benchmark: recentPrices,
      change: changes,
      name: countriesInChinese.of(code),
      latest: holdings[latestIndex] ?? earlier?.tonnes,
      latestMonth: months[latestIndex] ?? earlier?.month,
      estimate: !estimateNote && pricedTonnes > 0 ? indicativeCost / pricedTonnes : null,
      observedMonths: changes.filter(Number.isFinite).length,
    };
  }

  async function loadReserves() {
    try {
      const { months, benchmark, countries } = await getJson(dataUrl, { cache: "no-cache" });
      if (months.length <= monthsInYear || benchmark.length !== months.length || !benchmark.every(Number.isFinite) ||
          countries.length < 20 || !countries.every(({ holdings, earlier }) =>
            holdings.length === months.length && (holdings.some(Number.isFinite) || Number.isFinite(earlier?.tonnes)))) {
        throw new Error("Invalid gold reserve series");
      }
      const ranked = countries.map((country) => summarize(country, months, benchmark))
        .sort((a, b) => b.latest - a.latest).slice(0, 20);
      showReserveDashboard(ranked, { tonnes, deltaTonnes });
      status.hidden = true;
      if (window.location.hash === "#reserves-comparison") byId("reserves-comparison").scrollIntoView();
    } catch {
      status.textContent = "黄金储备数据暂时无法加载。";
    }
  }

  loadReserves();
}
