"use strict";

{
  const dataUrl = window.location.protocol === "file:"
    ? "https://braveryyy.github.io/gold-cny/central-bank-reserves.json"
    : "./central-bank-reserves.json";
  const table = byId("reserves-table");
  const range = byId("reserves-ranges");
  const buttons = [...range.querySelectorAll("button")];
  const status = byId("reserves-status");
  const minimumIncrease = 0.1;
  const countriesInChinese = new Intl.DisplayNames("zh-CN", { type: "region" });
  const tonnes = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const deltaTonnes = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });

  function appendCell(row, tagName, text) {
    const cell = document.createElement(tagName);
    cell.textContent = text;
    row.append(cell);
    return cell;
  }

  function display(value, formatter) {
    return Number.isFinite(value) ? formatter.format(value) : "—";
  }

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
      code, holdings, changes, net, estimateNote,
      name: countriesInChinese.of(code),
      latest: holdings[latestIndex] ?? earlier?.tonnes,
      latestMonth: months[latestIndex] ?? earlier?.month,
      estimate: !estimateNote && pricedTonnes > 0 ? indicativeCost / pricedTonnes : null,
      observedMonths: changes.filter(Number.isFinite).length,
    };
  }

  function monthlyTable(country, months, benchmark) {
    const detail = document.createElement("table");
    detail.className = "calendar-table reserves-monthly";
    detail.createCaption().textContent = `${country.name}月度明细（基期 ${months[0]}）`;
    const labels = detail.createTHead().insertRow();
    for (const label of ["月份", "月末储备（吨）", "储备月变化（吨）", "市场金价（元 / 克）"]) {
      appendCell(labels, "th", label).scope = "col";
    }
    const body = detail.createTBody();
    for (let i = months.length - 1; i >= 1; i--) {
      const row = body.insertRow();
      appendCell(row, "th", months[i]).scope = "row";
      appendCell(row, "td", display(country.holdings[i], tonnes));
      appendCell(row, "td", display(country.changes[i - 1], deltaTonnes));
      appendCell(row, "td", display(benchmark[i], currencyFormat));
    }
    return detail;
  }

  function countryRows(country, rank, months, benchmark) {
    const group = document.createElement("tbody");
    const row = group.insertRow();
    appendCell(row, "td", rank);
    const nameCell = appendCell(row, "th", "");
    nameCell.scope = "row";
    const button = document.createElement("button");
    button.className = "reserves-country";
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.textContent = country.name;
    nameCell.append(button);

    const stock = appendCell(row, "td", display(country.latest, tonnes));
    appendCell(stock, "small", country.latestMonth);
    appendCell(row, "td", display(country.net, deltaTonnes));
    const price = appendCell(row, "td", display(country.estimate, currencyFormat));
    if (country.estimate === null) {
      const reason = country.estimateNote ?? (country.observedMonths ? "月增量均低于 0.10 吨" : "缺少可比月份");
      appendCell(price, "small", reason);
    }
    if (country.observedMonths < months.length - 1) {
      appendCell(price, "small", `可比 ${country.observedMonths} / ${months.length - 1} 月`);
    }

    const detail = group.insertRow();
    detail.hidden = true;
    detail.id = `reserves-detail-${country.code}`;
    button.setAttribute("aria-controls", detail.id);
    button.addEventListener("click", () => {
      if (!detail.cells.length) {
        const container = detail.insertCell();
        container.colSpan = row.cells.length;
        container.append(monthlyTable(country, months, benchmark));
      }
      detail.hidden = !detail.hidden;
      button.setAttribute("aria-expanded", String(!detail.hidden));
    });
    return group;
  }

  async function loadReserves() {
    try {
      const { months, benchmark, countries } = await getJson(dataUrl);
      if (months.length !== 13 || benchmark.length !== months.length || !benchmark.every(Number.isFinite) ||
          countries.length < 20 || !countries.every(({ holdings, earlier }) =>
            holdings.length === months.length && (holdings.some(Number.isFinite) || Number.isFinite(earlier?.tonnes)))) {
        throw new Error("Invalid gold reserve series");
      }
      const ranked = countries.map((country) => summarize(country, months, benchmark)).sort((a, b) => b.latest - a.latest);
      const groups = ranked.map((country, i) => countryRows(country, i + 1, months, benchmark));
      table.append(...groups);

      function showTop(button) {
        const count = Number(button.dataset.reservesCount);
        groups.forEach((group, i) => { group.hidden = i >= count; });
        buttons.forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
        status.textContent = `当前显示前 ${count} 个国家`;
      }

      for (const button of buttons) button.addEventListener("click", () => showTop(button));
      byId("reserves-period").textContent = `${months[1]} 至 ${months.at(-1)} · 月末储备`;
      showTop(buttons[0]);
      range.hidden = false;
      byId("reserves-table-wrap").hidden = false;
    } catch {
      status.textContent = "黄金储备数据暂时无法加载。";
    }
  }

  loadReserves();
}
