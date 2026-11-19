"use strict";

function showReserveDashboard(countries, reportMonths, reportPrices, { tonnes, deltaTonnes }) {
  const section = byId("reserves-comparison");
  const countryPicker = byId("reserves-country-picker");
  const comparePicker = byId("reserves-compare-picker");
  const rankOptions = byId("reserves-rank-options");
  const ranges = [...byId("reserves-ranges").querySelectorAll("button")];
  const compareOptions = byId("reserves-country-options");
  const clear = byId("reserves-chart-clear");
  const legend = byId("reserves-chart-legend");
  const stack = byId("reserves-chart-stack");
  const monthSelect = byId("reserves-chart-month");
  const monthHead = byId("reserves-month-head");
  const monthBody = byId("reserves-chart-reading");
  const months = reportMonths.slice(1);
  const benchmark = reportPrices.slice(1);
  const colors = [
    "#7fb5f4", "#df9676", "#a2cfa1", "#bc9be6", "#edc570",
    "#77d1cd", "#ea9aba", "#c0ca81", "#b4b8f2", "#f49383",
    "#55cdd9", "#e8a457", "#b6d882", "#cbabef", "#f0aee3",
    "#9cb3d4", "#e7d698", "#90bea7", "#d0a5a2", "#d0c4ad",
  ];
  const series = countries.map((country, index) => ({
    ...country, rank: index + 1, color: colors[index], holdings: country.holdings.slice(1),
  }));
  const charts = [
    { canvas: byId("reserves-stock-chart"), kind: "holdings", geometry: null },
    { canvas: byId("reserves-change-chart"), kind: "change", geometry: null },
  ];
  let primary = series.find(({ code }) => code === "CN") ?? series[0];
  let selected = [primary];

  function countryLabel(element, country) {
    const dot = document.createElement("span");
    dot.className = "reserves-series-dot";
    dot.style.backgroundColor = country.color;
    dot.setAttribute("aria-hidden", "true");
    element.append(dot, country.name);
    return element;
  }

  function display(value, formatter) {
    return Number.isFinite(value) ? formatter.format(value) : "—";
  }

  function header(row, text, scope = "col") {
    const cell = document.createElement("th");
    cell.textContent = text;
    cell.scope = scope;
    row.append(cell);
    return cell;
  }

  function showOverview() {
    byId("reserves-current-country").textContent = primary.name;
    byId("reserves-stock-value").textContent = display(primary.latest, tonnes);
    byId("reserves-stock-note").textContent = `第 ${primary.rank} 名 · ${primary.latestMonth} 报告`;
    byId("reserves-net-value").textContent = display(primary.net, deltaTonnes);
    byId("reserves-net-note").textContent = Number.isFinite(primary.net)
      ? `相对 ${reportMonths[0]} 月末` : "缺少起止月数据";
    byId("reserves-estimate-value").textContent = display(primary.estimate, currencyFormat);
    byId("reserves-estimate-note").textContent = Number.isFinite(primary.estimate)
      ? `市场价估算 · ${primary.observedMonths} 个可比月`
      : primary.estimateNote ?? (primary.observedMonths ? "月增量均低于 0.10 吨" : "缺少可比月份");
  }

  function drawCharts() {
    const activeIndex = Number(monthSelect.value);
    for (const chart of charts) {
      const data = selected.map((country) => ({
        name: country.name,
        color: country.color,
        values: country[chart.kind].map((value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null),
      }));
      chart.geometry = drawReserveChart(chart.canvas, { months, series: data, kind: chart.kind, activeIndex });
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
    const multiple = selected.length > 1;
    const table = monthHead.parentElement;
    for (const group of table.querySelectorAll("colgroup")) group.remove();
    monthHead.replaceChildren();
    const upper = monthHead.insertRow();
    const lower = multiple ? monthHead.insertRow() : upper;
    const monthCell = header(upper, "月份");
    monthCell.className = "reserves-month-label";
    monthCell.rowSpan = multiple ? 2 : 1;
    if (multiple) {
      for (const span of [1, ...selected.map(() => 2), 1]) {
        const group = document.createElement("colgroup");
        group.span = span;
        table.insertBefore(group, monthHead);
      }
    }
    for (const country of selected) {
      if (multiple) countryLabel(header(upper, "", "colgroup"), country).colSpan = 2;
      header(lower, "月末储备（吨）");
      header(lower, "单月增减（吨）");
    }
    header(upper, "市场金价（元 / 克）").rowSpan = multiple ? 2 : 1;

    monthBody.replaceChildren();
    for (let index = months.length - 1; index >= 0; index--) {
      const row = monthBody.insertRow();
      row.dataset.monthIndex = String(index);
      header(row, months[index], "row").className = "reserves-month-label";
      for (const country of selected) {
        row.insertCell().textContent = display(country.holdings[index], tonnes);
        row.insertCell().textContent = display(country.change[index], deltaTonnes);
      }
      row.insertCell().textContent = display(benchmark[index], currencyFormat);
    }
    showMonth();
  }

  const choices = series.map((country) => {
    const rankItem = document.createElement("li");
    const selectCountry = document.createElement("button");
    selectCountry.type = "button";
    selectCountry.textContent = `${country.rank}. ${country.name}`;
    const stock = document.createElement("small");
    stock.textContent = `${display(country.latest, tonnes)} 吨 · ${country.latestMonth}`;
    selectCountry.append(stock);
    rankItem.append(selectCountry);
    rankOptions.append(rankItem);
    selectCountry.addEventListener("click", () => {
      primary = country;
      showSelection();
      countryPicker.open = false;
      countryPicker.querySelector("summary").focus({ preventScroll: true });
    });

    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    label.append(input, countryLabel(document.createElement("span"), country));
    compareOptions.append(label);
    input.addEventListener("change", showSelection);
    return { country, rankItem, selectCountry, label, input };
  });

  function showSelection() {
    for (const choice of choices) {
      const isPrimary = choice.country === primary;
      choice.selectCountry.setAttribute("aria-pressed", String(isPrimary));
      choice.label.hidden = isPrimary;
      if (isPrimary) choice.input.checked = false;
    }
    selected = [primary, ...choices.filter(({ input }) => input.checked).map(({ country }) => country)];
    byId("reserves-selected-count").textContent = selected.length > 1 ? `（${selected.length} 国）` : "";
    clear.disabled = selected.length === 1;
    legend.replaceChildren(...selected.map((country) => countryLabel(document.createElement("li"), country)));
    stack.style.minWidth = `${64 + months.length * (selected.length * 4 + 6)}px`;
    showOverview();
    showMonthlyTable();
  }

  function showTop(button) {
    const limit = Number(button.dataset.reservesCount);
    for (const { country, rankItem } of choices) rankItem.hidden = country.rank > limit;
    for (const range of ranges) range.setAttribute("aria-pressed", String(button === range));
  }

  for (const button of ranges) button.addEventListener("click", () => showTop(button));
  countryPicker.addEventListener("toggle", () => { if (countryPicker.open) comparePicker.open = false; });
  comparePicker.addEventListener("toggle", () => { if (comparePicker.open) countryPicker.open = false; });
  clear.addEventListener("click", () => {
    for (const { input } of choices) input.checked = false;
    showSelection();
    comparePicker.querySelector("summary").focus({ preventScroll: true });
  });
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
      showMonth();
    });
  }
  showTop(ranges[0]);
  section.hidden = false;
  showSelection();
}
