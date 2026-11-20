"use strict";

{
  const HOUR = 3_600_000;
  const QUOTE_INTERVAL = 15 * 60_000;
  const rangeButtons = [...document.querySelectorAll("[data-history-days]")];
  const maxDays = Math.max(...rangeButtons.map((button) => Number(button.dataset.historyDays)));
  const heading = byId("history-heading");
  const chart = byId("history-chart");
  const context = chart.getContext("2d");
  const figure = byId("history-figure");
  const dateLabel = byId("history-date");
  const priceLabel = byId("history-price");
  const pointMove = byId("history-point-move");
  const pointMoveHeading = byId("history-point-move-heading");
  const percentAxis = byId("history-percent-axis");
  const rangeLabel = byId("history-range");
  const message = byId("history-message");
  const status = byId("history-status");
  const retry = byId("history-retry");
  const details = byId("history-details");
  const rows = byId("history-rows");
  const todayMeta = byId("today-meta");
  const todayQuoteTime = byId("today-quote-time");
  const todayDailyMove = byId("today-daily-move");
  const todayRateDate = byId("today-rate-date");
  const todayRefreshStatus = byId("today-refresh-status");
  const statistics = byId("history-stats");
  const changeLabel = byId("history-change-label");
  const highDate = byId("history-high-date");
  const lowDate = byId("history-low-date");
  const axisFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const beijingTimeFormat = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  let history = [];
  let chartLocations = [];
  let selected = 0;
  let highest = 0;
  let lowest = 0;
  let activeDays = 0;
  let windowEnd;
  let availableHistory = null;
  let loading = false;
  let availableToday = null;
  let loadingToday = false;
  let todayTimer;
  let todayClose = null;

  function shortDate(date) {
    return date.slice(5).replace("-", "/");
  }

  function currentUtcDay() {
    return Math.floor(Date.now() / DAY) * DAY;
  }

  function beijingDay(time) {
    return Math.floor((time + BEIJING_OFFSET) / DAY) * DAY - BEIJING_OFFSET;
  }

  function pointLabel(point) {
    return activeDays ? shortDate(point.date) : beijingTimeFormat.format(point.time);
  }

  function setPointTime(element, point) {
    element.dateTime = activeDays ? point.date : new Date(point.time).toISOString();
    element.textContent = activeDays ? point.date : pointLabel(point);
  }

  function historyWindow(days) {
    return { from: dateKey(windowEnd - days * DAY), to: dateKey(windowEnd - DAY) };
  }

  function intradayValues(gold, rate, start, end) {
    if (gold.metal !== "XAU" || gold.grain !== "tick" || gold.unit !== "USD per troy ounce" ||
        !Array.isArray(gold.points)) {
      throw new Error("Unexpected intraday response");
    }

    const values = new Map();
    for (const { t, price } of gold.points) {
      const time = Date.parse(t);
      if (!Number.isFinite(time) || time < start || time > end || !Number.isFinite(price) || price <= 0) continue;
      values.set(time, { time, value: price * rate / GRAMS_PER_TROY_OUNCE });
    }
    return [...values.values()].sort((first, second) => first.time - second.time);
  }

  function plotScale(min, max) {
    const padding = Math.max((max - min) * 0.1, 0.25);
    const stepTarget = (max - min + 2 * padding) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(stepTarget));
    const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= stepTarget);
    return {
      step,
      bottom: Math.floor((min - padding) / step) * step,
      top: Math.ceil((max + padding) / step) * step,
    };
  }

  function drawExtremum(index, plot, isHigh) {
    const point = chartLocations[index];
    const color = isHigh ? "#f2d397" : "#ddd0b8";
    const label = `${isHigh ? "最高" : "最低"} ${pointLabel(history[index])}`;
    context.font = "11px system-ui, sans-serif";
    const width = context.measureText(label).width + 12;
    const left = Math.max(plot.left, Math.min(point.x - width / 2, plot.right - width));
    const top = isHigh ? Math.max(0, point.y - 27) : Math.min(plot.bottom - 16, point.y + 9);

    context.fillStyle = "#30291e";
    context.fillRect(left, top, width, 18);
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, left + width / 2, top + 9);
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.lineWidth = 1.5;
    context.strokeStyle = color;
    context.stroke();
  }

  function drawSeries(locations, plot) {
    const segments = [[locations[0]]];
    for (let index = 1; index < locations.length; index += 1) {
      if (!activeDays && history[index].time - history[index - 1].time > QUOTE_INTERVAL) segments.push([]);
      segments.at(-1).push(locations[index]);
    }

    const gradient = context.createLinearGradient(0, plot.top, 0, plot.bottom);
    gradient.addColorStop(0, "#c99a4954");
    gradient.addColorStop(1, "#c99a4906");
    context.lineJoin = "round";
    context.lineCap = "round";
    context.lineWidth = 2;
    context.strokeStyle = "#e6bd70";

    for (const segment of segments) {
      const first = segment[0];
      if (segment.length === 1) {
        context.fillStyle = "#e6bd70";
        context.beginPath();
        context.arc(first.x, first.y, 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      const line = new Path2D();
      line.moveTo(first.x, first.y);
      segment.slice(1).forEach(({ x, y }) => line.lineTo(x, y));
      const area = new Path2D(line);
      area.lineTo(segment.at(-1).x, plot.bottom);
      area.lineTo(first.x, plot.bottom);
      area.closePath();
      context.fillStyle = gradient;
      context.fill(area);
      context.stroke(line);
    }
  }

  function drawCloseReference(plot, y) {
    context.save();
    context.strokeStyle = "#bca986";
    context.lineWidth = 1;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.moveTo(plot.left, y);
    context.lineTo(plot.right, y);
    context.stroke();
    context.textAlign = "left";
    context.fillStyle = "#e4c898";
    context.fillText("0%", plot.right + 7, y);
    context.restore();
  }

  function drawHistory() {
    if (!context || !history.length) return;
    const { width, height } = chart.getBoundingClientRect();
    if (!width || !height) return;

    const ratio = window.devicePixelRatio || 1;
    chart.width = Math.round(width * ratio);
    chart.height = Math.round(height * ratio);
    context.scale(ratio, ratio);

    const low = history[lowest].value;
    const high = history[highest].value;
    const scale = plotScale(Math.min(low, todayClose?.value ?? low), Math.max(high, todayClose?.value ?? high));
    const tickCount = Math.round((scale.top - scale.bottom) / scale.step);
    const ticks = Array.from({ length: tickCount + 1 }, (_, index) => scale.bottom + index * scale.step);
    const moveLabels = todayClose ? ticks.map((value) => percentFormat.format(moveFromClose(value))) : [];
    context.font = "11px system-ui, sans-serif";
    const rightPadding = Math.max(18, ...moveLabels.map((label) => context.measureText(label).width + 11));
    const plot = { left: 41, right: width - rightPadding, top: 12, bottom: height - 29 };
    const start = activeDays ? history[0].time : beijingDay(history[0].time);
    const end = activeDays ? history.at(-1).time : Math.min(Date.now(), start + DAY - 1);
    const duration = Math.max(1, end - start);
    const xFor = (time) => plot.left + (time - start) / duration * (plot.right - plot.left);
    const yFor = (value) => plot.bottom - (value - scale.bottom) / (scale.top - scale.bottom) * (plot.bottom - plot.top);
    const referenceY = todayClose ? yFor(todayClose.value) : null;
    const locations = history.map(({ time, value }) => ({ x: xFor(time), y: yFor(value) }));
    chartLocations = locations;

    context.fillStyle = "#b3ab9c";
    context.strokeStyle = "#433a2d";
    context.textBaseline = "middle";
    ticks.forEach((value, index) => {
      const y = yFor(value);
      context.textAlign = "right";
      context.fillText(axisFormat.format(value), plot.left - 8, y);
      if (referenceY !== null && Math.abs(y - referenceY) >= 12) {
        context.textAlign = "left";
        context.fillText(moveLabels[index], plot.right + 7, y);
      }
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
    });

    const labelCount = width < 460 ? 4 : 6;
    context.textAlign = "center";
    if (activeDays) {
      const labelIntervals = Math.min(labelCount, history.length) - 1;
      for (let label = 0; label <= labelIntervals; label += 1) {
        const index = Math.round(label * (history.length - 1) / labelIntervals);
        context.fillText(pointLabel(history[index]), locations[index].x, height - 10);
      }
    } else {
      const step = [0.25, 0.5, 1, 2, 3, 4, 6, 8].find((hours) => hours * HOUR >= duration / (labelCount - 1)) * HOUR;
      for (let time = start; time <= end; time += step) {
        context.fillText(beijingTimeFormat.format(time), xFor(time), height - 10);
      }
    }

    drawSeries(locations, plot);
    if (referenceY !== null) drawCloseReference(plot, referenceY);

    const point = locations[selected];
    context.lineWidth = 1;
    context.strokeStyle = "#e6bd7080";
    context.setLineDash([3, 4]);
    context.beginPath();
    context.moveTo(point.x, plot.top);
    context.lineTo(point.x, plot.bottom);
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(point.x, point.y, 4, 0, Math.PI * 2);
    context.fillStyle = "#f2d397";
    context.fill();
    drawExtremum(highest, plot, true);
    drawExtremum(lowest, plot, false);
  }

  function moveFromClose(value) {
    return (value - todayClose.value) / todayClose.value;
  }

  function select(index) {
    selected = index;
    const point = history[index];
    setPointTime(dateLabel, point);
    priceLabel.textContent = currencyFormat.format(point.value);
    pointMove.hidden = !todayClose;
    percentAxis.hidden = !todayClose;
    if (todayClose) setSignedMove(pointMove.querySelector("strong"), moveFromClose(point.value), percentFormat);
    drawHistory();
  }

  function nearestPoint(event) {
    if (!chartLocations.length) return;
    const x = event.clientX - chart.getBoundingClientRect().left;
    let closest = 0;
    chartLocations.forEach((point, index) => {
      if (Math.abs(point.x - x) < Math.abs(chartLocations[closest].x - x)) closest = index;
    });
    if (closest !== selected) select(closest);
  }

  function showStatistics() {
    highest = 0;
    lowest = 0;
    history.forEach(({ value }, index) => {
      if (value > history[highest].value) highest = index;
      if (value < history[lowest].value) lowest = index;
    });
    const high = history[highest];
    const low = history[lowest];
    const first = history[0];
    const last = history.at(-1);
    byId("history-high").textContent = currencyFormat.format(high.value);
    setPointTime(highDate, high);
    byId("history-low").textContent = currencyFormat.format(low.value);
    setPointTime(lowDate, low);
    byId("history-change").textContent = history.length > 1 ?
      percentFormat.format((last.value - first.value) / first.value) : "—";
    byId("history-change-dates").textContent = history.length > 1 ?
      `${pointLabel(first)} 至 ${pointLabel(last)}` : "仅有一条报价";
    statistics.hidden = false;
  }

  function showHistory(rangeText, values) {
    history = values;
    showStatistics();
    const fragment = document.createDocumentFragment();
    for (const point of history) {
      const row = document.createElement("tr");
      row.insertCell().textContent = activeDays ? point.date : pointLabel(point);
      row.insertCell().textContent = currencyFormat.format(point.value);
      if (!activeDays) row.insertCell().textContent = "—";
      fragment.append(row);
    }
    rows.replaceChildren(fragment);
    if (rangeLabel.textContent !== rangeText) rangeLabel.textContent = rangeText;
    message.hidden = true;
    figure.hidden = !context;
    details.hidden = false;
    select(history.length - 1);
  }

  function showMessage(text, canRetry = false) {
    history = [];
    todayClose = null;
    chartLocations = [];
    statistics.hidden = true;
    todayMeta.hidden = true;
    figure.hidden = true;
    details.hidden = true;
    status.textContent = text;
    retry.hidden = !canRetry;
    message.hidden = false;
  }

  function showSelectedRange() {
    const windowDates = historyWindow(activeDays);
    const values = availableHistory.filter(({ date }) => date >= windowDates.from);
    if (values.length < 2) {
      rangeLabel.textContent = `${windowDates.from} 至 ${windowDates.to}`;
      showMessage("这个区间的日收盘价不足，试试更长的区间。");
      return;
    }
    showHistory(`${windowDates.from} 至 ${windowDates.to} · ${values.length} 条日度数据`, values);
  }

  function showToday({ start, values, rateDate }) {
    const date = dateKey(start + BEIJING_OFFSET);
    const rangeText = `${date} · 北京时间 00:00 至今`;
    if (!values.length) {
      rangeLabel.textContent = rangeText;
      showMessage("北京时间今日暂无盘中报价。", true);
      return;
    }

    const latest = values.at(-1);
    todayQuoteTime.dateTime = new Date(latest.time).toISOString();
    todayQuoteTime.textContent = beijingTimeFormat.format(latest.time);
    todayClose = null;
    showDailyMove(todayDailyMove, latest.value, latest.time).then((previous) => {
      if (!previous || activeDays || history !== values) return;
      todayClose = previous;
      values.forEach(({ value }, index) => {
        rows.rows[index].cells[2].textContent = percentFormat.format(moveFromClose(value));
      });
      select(selected);
    });
    todayRateDate.dateTime = rateDate;
    todayRateDate.textContent = rateDate;
    todayRefreshStatus.hidden = true;
    todayMeta.hidden = false;
    showHistory(`${rangeText} · ${values.length} 条盘中报价`, values);
  }

  function useDailyHistory() {
    if (windowEnd !== currentUtcDay()) loadHistory();
    else if (availableHistory) showSelectedRange();
    else {
      rangeLabel.textContent = "日线参考价";
      showMessage(loading ? "正在加载历史金价…" : "历史金价暂时无法加载。", !loading);
    }
  }

  function chooseRange(days) {
    activeDays = days;
    todayClose = null;
    heading.textContent = days ? `近 ${days} 天人民币金价` : "今日人民币金价";
    if (changeLabel) changeLabel.textContent = days ? "区间涨跌幅" : "盘中区间涨跌幅";
    byId("daily-source").hidden = !days;
    byId("today-source").hidden = Boolean(days);
    byId("history-detail-label").textContent = days ? "查看每日数据" : "查看今日数据";
    byId("history-time-heading").textContent = days ? "日期" : "时间（北京时间）";
    pointMoveHeading.hidden = Boolean(days);
    rangeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.historyDays) === days));
    });

    clearInterval(todayTimer);
    todayMeta.hidden = true;
    if (days) {
      useDailyHistory();
    } else {
      if (availableToday?.start === beijingDay(Date.now())) showToday(availableToday);
      else showMessage("正在加载今日盘中金价…");
      loadToday();
      todayTimer = setInterval(() => {
        if (!document.hidden) loadToday();
      }, 60_000);
    }
  }

  async function loadHistory() {
    if (loading) return;
    loading = true;
    availableHistory = null;
    windowEnd = currentUtcDay();
    rangeLabel.textContent = "日线参考价";
    showMessage("正在加载历史金价…");
    const windowDates = historyWindow(maxDays);
    try {
      const values = await getDailyGoldPrices(windowDates);
      if (values.length < 2) throw new Error("Too few historical quotes");
      availableHistory = values;
      if (activeDays) showSelectedRange();
    } catch {
      if (activeDays) showMessage("历史金价暂时无法加载。", true);
    } finally {
      loading = false;
    }
  }

  async function loadToday() {
    if (activeDays || loadingToday) return;
    loadingToday = true;
    const start = beijingDay(Date.now());
    if (availableToday?.start !== start || !availableToday.values.length) {
      rangeLabel.textContent = "15 分钟盘中参考价";
      showMessage("正在加载今日盘中金价…");
    }

    try {
      const goldUrl = new URL(GOLD_HISTORY);
      goldUrl.search = new URLSearchParams({ metal: "XAU", range: "24h" });
      const [gold, { rate, date: rateDate }] = await Promise.all([getJson(goldUrl), getExchangeRate()]);
      const fetchedAt = Date.now();
      const fetchedDay = beijingDay(fetchedAt);
      availableToday = { start: fetchedDay, rateDate, values: intradayValues(gold, rate, fetchedDay, fetchedAt) };
      if (!activeDays) showToday(availableToday);
    } catch {
      if (!activeDays) {
        if (availableToday?.start === beijingDay(Date.now()) && availableToday.values.length) {
          todayRefreshStatus.hidden = false;
        } else {
          showMessage("今日盘中金价暂时无法加载。", true);
        }
      }
    } finally {
      loadingToday = false;
    }
  }

  chart.addEventListener("pointermove", nearestPoint);
  chart.addEventListener("pointerdown", nearestPoint);
  chart.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse" && history.length && selected !== history.length - 1) select(history.length - 1);
  });
  new ResizeObserver(drawHistory).observe(chart);
  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => chooseRange(Number(button.dataset.historyDays)));
  });
  retry.addEventListener("click", () => (activeDays ? loadHistory() : loadToday()));
  refreshButton.addEventListener("click", loadToday);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !activeDays) loadToday();
  });
  chooseRange(activeDays);
  if (!window.location.hash) window.location.replace("#history");
}
