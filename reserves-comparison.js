"use strict";

function showReserveDashboard(countries, { tonnes, deltaTonnes }) {
  const section = byId("reserves-comparison");
  const countryPicker = byId("reserves-country-picker");
  const quickOptions = byId("reserves-quick-options");
  const rankOptions = byId("reserves-rank-options");
  const monthlyDetails = byId("reserves-month-details");
  const monthSelect = byId("reserves-chart-month");
  const monthBody = byId("reserves-chart-reading");
  const ranked = countries.map((country, i) => ({ ...country, rank: i + 1 }));
  const charts = [
    { canvas: byId("reserves-stock-chart"), kind: "holdings", geometry: null },
    { canvas: byId("reserves-change-chart"), kind: "change", geometry: null },
  ];
  let current = ranked.find(({ code }) => code === "CN") ?? ranked[0];
  const pinned = [current, ...ranked.filter((country) => country !== current).slice(0, 4)];

  function display(value, formatter) {
    return Number.isFinite(value) ? formatter.format(value) : "—";
  }

  function showOverview() {
    const { months } = current;
    const coverage = current.holdings.some(Number.isFinite) ? "月度数据" : "区间内暂无储备量";
    byId("reserves-period").textContent = `${months[0]} 至 ${months.at(-1)} · ${coverage}`;
    byId("reserves-current-country").textContent = `${current.name}官方黄金储备`;
    byId("reserves-stock-value").textContent = display(current.latest, tonnes);
    byId("reserves-stock-note").textContent = `第 ${current.rank} 名 · ${current.latestMonth} 报告`;
    byId("reserves-net-value").textContent = display(current.net, deltaTonnes);
    byId("reserves-net-note").textContent = Number.isFinite(current.net)
      ? `相对 ${current.baseline} 月末` : "缺少起止月数据";
    byId("reserves-estimate-value").textContent = display(current.estimate, currencyFormat);
    byId("reserves-estimate-note").textContent = Number.isFinite(current.estimate)
      ? `市场价估算 · ${current.observedMonths} 个可比月`
      : current.estimateNote ?? (current.observedMonths ? "月增量均低于 0.10 吨" : "缺少可比月份");
  }

  function drawCharts() {
    const activeIndex = Number(monthSelect.value);
    const { months } = current;
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
    const { months, benchmark } = current;
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

  function selectCountry(country) {
    current = country;
    countryPicker.open = false;
    showCountry();
  }

  const quickChoices = pinned.map((country) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = country.name;
    button.addEventListener("click", () => selectCountry(country));
    quickOptions.append(button);
    return { button, country };
  });

  const rankChoices = ranked.map((country) => {
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
      selectCountry(country);
      countryPicker.querySelector("summary").focus();
    });
    return { button, country };
  });

  function showCountry() {
    for (const { button, country } of quickChoices) button.setAttribute("aria-pressed", String(country === current));
    for (const { button, country } of rankChoices) button.setAttribute("aria-current", String(country === current));
    monthSelect.replaceChildren(...current.months.map((month, index) => new Option(month, String(index))));
    monthSelect.value = String(current.months.length - 1);
    showOverview();
    showMonthlyTable();
  }

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
