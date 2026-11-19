"use strict";

function createReserveComparison(countries, months, { tonnes, deltaTonnes }) {
  const section = byId("reserves-comparison");
  const picker = byId("reserves-picker");
  const options = byId("reserves-country-options");
  const selectedCount = byId("reserves-selected-count");
  const legend = byId("reserves-chart-legend");
  const empty = byId("reserves-chart-empty");
  const results = byId("reserves-chart-results");
  const stack = byId("reserves-chart-stack");
  const monthSelect = byId("reserves-chart-month");
  const reading = byId("reserves-chart-reading");
  const colors = [
    "#7fb5f4", "#df9676", "#a2cfa1", "#bc9be6", "#edc570",
    "#77d1cd", "#ea9aba", "#c0ca81", "#b4b8f2", "#f49383",
    "#55cdd9", "#e8a457", "#b6d882", "#cbabef", "#f0aee3",
    "#9cb3d4", "#e7d698", "#90bea7", "#d0a5a2", "#d0c4ad",
  ];
  const series = countries.map((country, index) => ({
    code: country.code,
    name: country.name,
    color: colors[index],
    holdings: country.holdings.slice(1),
    change: country.changes,
  }));
  const charts = [
    { canvas: byId("reserves-stock-chart"), kind: "holdings", geometry: null },
    { canvas: byId("reserves-change-chart"), kind: "change", geometry: null },
  ];
  let selected = [];

  function countryLabel(element, country) {
    const dot = document.createElement("span");
    dot.className = "reserves-series-dot";
    dot.style.backgroundColor = country.color;
    dot.setAttribute("aria-hidden", "true");
    element.append(dot, country.name);
    return element;
  }

  function displayTonnes(value, formatter) {
    return Number.isFinite(value) ? formatter.format(value) : "—";
  }

  function drawCharts() {
    if (!selected.length) return;
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
    const index = Number(monthSelect.value);
    const rows = selected.map((country) => {
      const row = document.createElement("tr");
      const name = countryLabel(document.createElement("th"), country);
      name.scope = "row";
      row.append(name);
      row.insertCell().textContent = displayTonnes(country.holdings[index], tonnes);
      row.insertCell().textContent = displayTonnes(country.change[index], deltaTonnes);
      return row;
    });
    reading.replaceChildren(...rows);
    drawCharts();
  }

  const checkboxes = series.map((country) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = country.code;
    label.append(checkbox);
    label.append(countryLabel(document.createElement("span"), country));
    options.append(label);
    checkbox.addEventListener("change", updateSelection);
    return checkbox;
  });

  function updateSelection() {
    selected = series.filter((_, index) => checkboxes[index].checked);
    selectedCount.textContent = `（已选 ${selected.length}）`;
    legend.replaceChildren(...selected.map((country) => countryLabel(document.createElement("li"), country)));
    empty.hidden = Boolean(selected.length);
    results.hidden = !selected.length;
    byId("reserves-chart-clear").disabled = !selected.length;
    stack.style.minWidth = `${64 + months.length * (selected.length * 4 + 6)}px`;
    showMonth();
  }

  function setSelection(codes) {
    for (const checkbox of checkboxes) checkbox.checked = codes.includes(checkbox.value);
    updateSelection();
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
      showMonth();
    });
  }
  const topFive = series.slice(0, 5).map(({ code }) => code);
  byId("reserves-chart-top-five").addEventListener("click", () => setSelection(topFive));
  byId("reserves-chart-clear").addEventListener("click", () => {
    setSelection([]);
    picker.open = true;
    checkboxes[0].focus();
  });

  section.hidden = false;
  setSelection(topFive);
  return (code) => {
    setSelection([code]);
    byId("reserves-comparison-heading").focus({ preventScroll: true });
    section.scrollIntoView({ block: "start" });
  };
}
