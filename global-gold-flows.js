"use strict";

{
  const dataUrl = window.location.protocol === "file:"
    ? "https://braveryyy.github.io/gold-cny/global-gold-flows.json"
    : "./global-gold-flows.json";
  const canvas = byId("global-gold-chart");
  const selectedMonth = byId("global-gold-month");
  const status = byId("global-gold-status");

  async function loadGlobalGoldFlows() {
    try {
      const { months: rows } = await getJson(dataUrl, { cache: "no-cache" });
      if (!Array.isArray(rows) || !rows.length || rows.length > 12 || !rows.every(({ month, purchases, sales, reporters }) =>
        /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && Array.isArray(reporters) &&
        (reporters.length ? [purchases, sales].every((value) => Number.isFinite(value) && value >= 0) : purchases === null && sales === null))) {
        throw new Error("Invalid global gold flows");
      }
      const months = rows.map(({ month }) => month);
      const values = rows.map(({ purchases }) => purchases);
      const outflows = rows.map(({ sales }) => sales === null ? null : -sales);
      let chart;

      function draw() {
        chart = drawReserveChart(canvas, { months, values, outflows, kind: "change", activeIndex: Number(selectedMonth.value) });
      }

      function showMonth() {
        const { purchases, sales, reporters } = rows[Number(selectedMonth.value)];
        byId("global-gold-purchases").textContent = purchases === null ? "—" : currencyFormat.format(purchases);
        byId("global-gold-sales").textContent = sales === null ? "—" : currencyFormat.format(sales);
        byId("global-gold-reporters").textContent = reporters.length;
        draw();
      }

      selectedMonth.replaceChildren(...months.map((month, i) => new Option(month, String(i))));
      selectedMonth.value = String(months.length - 1);
      selectedMonth.addEventListener("change", showMonth);
      canvas.addEventListener("click", (event) => {
        const index = chart?.indexAt(event.clientX - canvas.getBoundingClientRect().left);
        if (index === undefined || index < 0) return;
        selectedMonth.value = String(index);
        showMonth();
      });
      byId("global-gold-period").textContent = `${months[0]} 至 ${months.at(-1)} · 已报告储备变动`;
      byId("global-gold-results").hidden = false;
      byId("global-gold-controls").hidden = false;
      status.hidden = true;
      new ResizeObserver(draw).observe(canvas);
      showMonth();
    } catch {
      status.textContent = "全球储备变动暂时无法加载。";
    }
  }

  loadGlobalGoldFlows();
}
