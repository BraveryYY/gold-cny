"use strict";

{
  const dataUrl = window.location.protocol === "file:"
    ? "https://braveryyy.github.io/gold-cny/central-bank-reserves.json"
    : "./central-bank-reserves.json";
  const status = byId("reserves-status");
  const minimumIncrease = 0.1;
  const countriesInChinese = new Intl.DisplayNames("zh-CN", { type: "region" });
  const tonnes = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const deltaTonnes = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });

  function summarize({ code, holdings, earlier, estimateNote }, months, benchmark) {
    const latestIndex = holdings.findLastIndex(Number.isFinite);
    const changes = holdings.slice(1).map((stock, i) =>
      Number.isFinite(stock) && Number.isFinite(holdings[i]) ? stock - holdings[i] : null);
    let pricedTonnes = 0;
    let indicativeCost = 0;
    changes.forEach((change, i) => {
      const monthlyPrice = benchmark[i + 1];
      if (change >= minimumIncrease && Number.isFinite(monthlyPrice)) {
        pricedTonnes += change;
        indicativeCost += change * monthlyPrice;
      }
    });
    const net = Number.isFinite(holdings[0]) && Number.isFinite(holdings.at(-1)) ? holdings.at(-1) - holdings[0] : null;
    return {
      code, holdings, change: changes, net, estimateNote,
      name: countriesInChinese.of(code),
      latest: holdings[latestIndex] ?? earlier?.tonnes,
      latestMonth: months[latestIndex] ?? earlier?.month,
      estimate: !estimateNote && pricedTonnes > 0 ? indicativeCost / pricedTonnes : null,
      observedMonths: changes.filter(Number.isFinite).length,
    };
  }

  async function loadReserves() {
    try {
      const { months, benchmark, countries } = await getJson(dataUrl);
      if (months.length !== 13 || benchmark.length !== months.length || !benchmark.every(Number.isFinite) ||
          countries.length < 20 || !countries.every(({ holdings, earlier }) =>
            holdings.length === months.length && (holdings.some(Number.isFinite) || Number.isFinite(earlier?.tonnes)))) {
        throw new Error("Invalid gold reserve series");
      }
      const ranked = countries.map((country) => summarize(country, months, benchmark))
        .sort((a, b) => b.latest - a.latest).slice(0, 20);
      byId("reserves-period").textContent = `${months[1]} 至 ${months.at(-1)} · 月度数据`;
      showReserveDashboard(ranked, months, benchmark, { tonnes, deltaTonnes });
      status.hidden = true;
      if (window.location.hash === "#reserves-comparison") byId("reserves-comparison").scrollIntoView();
    } catch {
      status.textContent = "黄金储备数据暂时无法加载。";
    }
  }

  loadReserves();
}
