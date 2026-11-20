"use strict";

const GRAMS_PER_TROY_OUNCE = 31.1034768;
const DAY = 86_400_000;
const BEIJING_OFFSET = 8 * 3_600_000;
const GOLD_QUOTE = "https://api.gold-api.com/price/XAU";
const USD_CNY_RATE = "https://api.frankfurter.dev/v2/rate/USD/CNY";
const GOLD_HISTORY = "https://standardbullion.com/api/v1/market/history";
const RATE_HISTORY = "https://api.frankfurter.dev/v2/rates";

const byId = (id) => document.getElementById(id);
const fields = [
  { input: byId("spot"), source: byId("spot-source"), label: "金价", example: "示例报价", kind: "example", revision: 0 },
  { input: byId("rate"), source: byId("rate-source"), label: "汇率", example: "示例汇率", kind: "example", revision: 0 },
];
const priceOutput = byId("price-per-gram");
const quoteDailyMove = byId("quote-daily-move");
const statusDot = byId("status-dot");
const quoteStatus = byId("quote-status");
const refreshButton = byId("refresh");
const refreshLabel = byId("refresh-label");
const refreshNote = byId("refresh-note");

const currencyFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quoteTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const percentFormat = new Intl.NumberFormat("zh-CN", {
  style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
});
const signedAmountFormat = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
});
const dailyMoveRequests = new WeakMap();
let recentCloses;

function dateKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

function readPositive(value) {
  const normalized = value.normalize("NFKC").trim();
  const decimal = /^(?:\d+(?:\.\d*)?|\.\d+|\d{1,3}(?:,\d{3})+(?:\.\d*)?)$/;
  if (!decimal.test(normalized)) return null;
  const number = Number(normalized.replaceAll(",", ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatAmount(amount) {
  if (amount >= 1e12 || (amount > 0 && amount < 0.005)) return amount.toExponential(2);
  return currencyFormat.format(amount);
}

function setStatus(message, state) {
  quoteStatus.textContent = message;
  statusDot.dataset.state = state;
}

function render() {
  const [gold, rate] = fields.map((field) => {
    const number = readPositive(field.input.value);
    const invalid = number === null;
    field.input.setAttribute("aria-invalid", String(invalid));
    field.source.classList.toggle("error", invalid);
    field.source.textContent = invalid ? `请输入大于 0 的${field.label}` : field.sourceLabel ?? field.example;
    return number;
  });

  const amount = gold !== null && rate !== null ? (gold / GRAMS_PER_TROY_OUNCE) * rate : NaN;
  const canConvert = Number.isFinite(amount) && amount > 0;
  const priceText = canConvert ? formatAmount(amount) : "–";
  if (priceOutput.value !== priceText) priceOutput.value = priceText;
  priceOutput.classList.toggle("is-long", priceText.length > 8);
  const spotTime = fields[0].timestamp;
  const currentMarketQuote = fields.every(({ kind }) => kind === "market") && Number.isFinite(spotTime) &&
    dateKey(spotTime + BEIJING_OFFSET) === dateKey(Date.now() + BEIJING_OFFSET);
  showDailyMove(quoteDailyMove, amount, currentMarketQuote ? spotTime : null);

  if (!canConvert) {
    setStatus(gold === null || rate === null ? "请输入有效的金价和汇率" : "换算结果超出计算范围", "invalid");
  } else if (fields.every(({ kind }) => kind === "example")) {
    setStatus("示例数据", "example");
  } else if (fields.some(({ kind }) => kind === "example")) {
    setStatus("含示例数据", "example");
  } else if (fields.some(({ kind }) => kind === "manual")) {
    setStatus("含手动输入", "manual");
  } else if (Date.now() - fields[0].timestamp > 15 * 60_000) {
    setStatus("较早报价 · 参考汇率", "example");
  } else {
    setStatus("最新获取报价 · 参考汇率", "market");
  }
}

async function getJson(url, { cache = "default" } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), credentials: "omit", cache });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getDailyGoldPrices({ from, to }) {
  const goldUrl = new URL(GOLD_HISTORY);
  // The history API can omit its first requested day.
  goldUrl.search = new URLSearchParams({ metal: "XAU", start_date: dateKey(Date.parse(from) - DAY), end_date: to });
  const rateUrl = new URL(RATE_HISTORY);
  rateUrl.search = new URLSearchParams({ base: "USD", quotes: "CNY", from, to });
  const [gold, rates] = await Promise.all([getJson(goldUrl), getJson(rateUrl)]);
  if (gold.metal !== "XAU" || gold.grain !== "daily" || gold.unit !== "USD per troy ounce" ||
      !Array.isArray(gold.points) || !Array.isArray(rates)) {
    throw new Error("Unexpected historical response");
  }

  const byDate = new Map(rates
    .filter(({ base, quote, rate }) => base === "USD" && quote === "CNY" && Number.isFinite(rate) && rate > 0)
    .map(({ date, rate }) => [date, rate]));
  const values = new Map();
  for (const { t, price } of gold.points) {
    if (!/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?Z$/.test(t) || !Number.isFinite(price) || price <= 0) continue;
    const date = t.slice(0, 10);
    const rate = byDate.get(date);
    if (date < from || date > to || rate === undefined) continue;
    values.set(date, { date, time: Date.parse(date), value: price * rate / GRAMS_PER_TROY_OUNCE });
  }
  return [...values.values()].sort((first, second) => first.time - second.time);
}

function getRecentCloses() {
  const now = Date.now();
  const to = dateKey(now - DAY);
  if (recentCloses?.to === to && recentCloses.expiresAt > now) return recentCloses.request;
  const entry = { to, expiresAt: now + 5 * 60_000 };
  entry.request = getDailyGoldPrices({ from: dateKey(now - 14 * DAY), to }).catch((error) => {
    if (recentCloses === entry) recentCloses = undefined;
    throw error;
  });
  recentCloses = entry;
  return entry.request;
}

function setSignedMove(element, value, formatter) {
  const parts = formatter.formatToParts(value);
  element.textContent = parts.map((part) => part.value).join("");
  const sign = parts.find(({ type }) => type === "plusSign" || type === "minusSign")?.type;
  element.dataset.direction = sign === "plusSign" ? "up" : sign === "minusSign" ? "down" : "flat";
}

async function showDailyMove(display, price, timestamp) {
  if (!display) return;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) {
    dailyMoveRequests.delete(display);
    display.hidden = true;
    return;
  }

  const request = Symbol();
  dailyMoveRequests.set(display, request);
  const value = display.querySelector("strong");
  const amount = display.querySelector(".daily-move-amount");
  const basis = display.querySelector(".daily-move-basis");
  value.textContent = "—";
  delete value.dataset.direction;
  if (amount) amount.hidden = true;
  basis.hidden = true;
  display.hidden = false;
  try {
    const quoteDate = dateKey(timestamp);
    const closes = await getRecentCloses();
    if (dailyMoveRequests.get(display) !== request) return;
    const previous = closes.findLast(({ date, time }) => {
      const weekday = new Date(time).getUTCDay();
      return date < quoteDate && weekday >= 1 && weekday <= 5;
    });
    if (!previous) return;
    const difference = price - previous.value;
    const change = difference / previous.value;
    if (!Number.isFinite(change)) return;
    setSignedMove(value, change, percentFormat);
    if (amount) {
      setSignedMove(amount.querySelector("strong"), difference, signedAmountFormat);
      amount.hidden = false;
    }
    const day = basis.querySelector("time");
    day.dateTime = previous.date;
    day.textContent = previous.date;
    basis.hidden = false;
    return previous;
  } catch {
    // The latest quote can still be displayed when its comparison close is unavailable.
  }
}

async function getGoldQuote() {
  const { price, updatedAt } = await getJson(GOLD_QUOTE);
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) throw new Error("Invalid gold quote");
  return {
    value: Number(price).toFixed(2),
    timestamp,
    label: `Gold API · ${quoteTimeFormat.format(timestamp)} 北京时间`,
  };
}

async function getExchangeRate() {
  const { rate, date, base, quote } = await getJson(USD_CNY_RATE);
  if (base !== "USD" || quote !== "CNY" || !Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid exchange rate");
  }
  return {
    value: String(rate),
    rate,
    date,
    label: `Frankfurter · ${date} 日度参考汇率`,
  };
}

async function refreshQuotes() {
  if (refreshButton.disabled) return;
  refreshButton.disabled = true;
  refreshLabel.textContent = "获取中…";
  refreshNote.hidden = true;
  const revisions = fields.map((field) => field.revision);
  const results = await Promise.allSettled([getGoldQuote(), getExchangeRate()]);
  const failures = [];

  results.forEach((result, index) => {
    const field = fields[index];
    if (result.status === "rejected") {
      failures.push(field.label);
    } else if (field.revision === revisions[index]) {
      field.input.value = result.value.value;
      field.timestamp = result.value.timestamp;
      field.sourceLabel = result.value.label;
      field.kind = "market";
    }
  });

  if (failures.length) {
    refreshNote.textContent = `暂时无法更新${failures.join("和")}，可继续手动换算。`;
    refreshNote.hidden = false;
  }
  refreshButton.disabled = false;
  refreshLabel.textContent = "刷新行情";
  render();
}

fields.forEach((field) => {
  field.input.addEventListener("input", () => {
    field.kind = "manual";
    field.revision += 1;
    field.sourceLabel = "手动输入";
    render();
  });
});
refreshButton.addEventListener("click", refreshQuotes);
render();
refreshQuotes();
