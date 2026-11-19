"use strict";

function showReserveDashboard(countries, reportMonths, reportPrices, { tonnes, deltaTonnes }) {
  const section = byId("reserves-comparison");
  const countryPicker = byId("reserves-country-picker");
  const rankOptions = byId("reserves-rank-options");
  const monthlyDetails = byId("reserves-month-details");
  const monthSelect = byId("reserves-chart-month");
  const monthBody = byId("reserves-chart-reading");
  const months = reportMonths.slice(1);
  const benchmark = reportPrices.slice(1);
  const ranked = countries.map((country, i) => ({ ...country, rank: i + 1, holdings: country.holdings.slice(1) }));
  const charts = [
    { canvas: byId("reserves-stock-chart"), kind: "holdings", geometry: null },
    { canvas: byId("reserves-change-chart"), kind: "change", geometry: null },
  ];
  let current = ranked.find(({ code }) => code === "CN") ?? ranked[0];

  function display(value, formatter) {
    return Number.isFinite(value) ? formatter.format(value) : "—";
  }

  function showOverview() {
    byId("reserves-current-country").textContent = current.name;
    byId("reserves-stock-value").textContent = display(current.latest, tonnes);
    byId("reserves-stock-note").textContent = `第 ${current.rank} 名 · ${current.latestMonth} 报告`;
    byId("reserves-net-value").textContent = display(current.net, deltaTonnes);
    byId("reserves-net-note").textContent = Number.isFinite(current.net)
      ? `相对 ${reportMonths[0]} 月末` : "缺少起止月数据";
    byId("reserves-estimate-value").textContent = display(current.estimate, currencyFormat);
    byId("reserves-estimate-note").textContent = Number.isFinite(current.estimate)
      ? `市场价估算 · ${current.observedMonths} 个可比月`
      : current.estimateNote ?? (current.observedMonths ? "月增量均低于 0.10 吨" : "缺少可比月份");
  }

  function drawCharts() {
    const activeIndex = Number(monthSelect.value);
    for (const chart of charts) {
      const values = current[chart.kind].map((value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null);
      chart.geometry = drawReserveChart(chart.canvas, { months, values, kind: chart.kind, activeIndex });
    }
  }

  function showMonth() {
    for (const row of monthBody.rows) {
      const isActive = row.dataset.monthIndex === monthSelect.value;
      row.classList.toggle("is-active", isActive);
      if (isActive) row.cells[0].setAttribute("aria-current", "date");
      else row.cells[0].removeAttribute("aria-current");
    }
    drawCharts();
  }

  function showMonthlyTable() {
    monthBody.replaceChildren();
    for (let index = months.length - 1; index >= 0; index--) {
      const row = monthBody.insertRow();
      row.dataset.monthIndex = String(index);
      const month = document.createElement("th");
      month.className = "reserves-month-label";
      month.scope = "row";
      month.textContent = months[index];
      row.append(month);
      row.insertCell().textContent = display(current.holdings[index], tonnes);
      row.insertCell().textContent = display(current.change[index], deltaTonnes);
      row.insertCell().textContent = display(benchmark[index], currencyFormat);
    }
    showMonth();
  }

  const choices = ranked.map((country) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${country.rank}. ${country.name}`;
    const stock = document.createElement("small");
    stock.textContent = `${display(country.latest, tonnes)} 吨 · ${country.latestMonth}`;
    button.append(stock);
    item.append(button);
    rankOptions.append(item);
    button.addEventListener("click", () => {
      current = country;
      showCountry();
      countryPicker.open = false;
      countryPicker.querySelector("summary").focus();
    });
    return { button, country };
  });

  function showCountry() {
    for (const { button, country } of choices) button.setAttribute("aria-current", String(country === current));
    showOverview();
    showMonthlyTable();
  }

  monthSelect.replaceChildren(...months.map((month, index) => new Option(month, String(index))));
  monthSelect.value = String(months.length - 1);
  monthSelect.addEventListener("change", showMonth);
  const observer = new ResizeObserver(drawCharts);
  for (const chart of charts) {
    const { canvas } = chart;
    observer.observe(canvas);
    canvas.addEventListener("click", (event) => {
      const index = chart.geometry?.indexAt(event.clientX - canvas.getBoundingClientRect().left);
      if (index === undefined || index < 0) return;
      monthSelect.value = String(index);
      monthlyDetails.open = true;
      showMonth();
    });
  }
  section.hidden = false;
  showCountry();
}
