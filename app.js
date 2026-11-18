"use strict";

const GRAMS_PER_TROY_OUNCE = 31.1034768;
const GOLD_QUOTE = "https://api.gold-api.com/price/XAU";
const USD_CNY_RATE = "https://api.frankfurter.dev/v2/rate/USD/CNY";

const byId = (id) => document.getElementById(id);
const fields = [
  { input: byId("spot"), source: byId("spot-source"), label: "金价", example: "示例报价", kind: "example", revision: 0 },
  { input: byId("rate"), source: byId("rate-source"), label: "汇率", example: "示例汇率", kind: "example", revision: 0 },
];
const weight = byId("weight");
const presets = [...document.querySelectorAll("[data-weight]")];
const priceOutput = byId("price-per-gram");
const totalOutput = byId("total");
const statusDot = byId("status-dot");
const quoteStatus = byId("quote-status");
const refreshButton = byId("refresh");
const refreshLabel = byId("refresh-label");
const refreshNote = byId("refresh-note");
const weightError = byId("weight-error");

const currencyFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quoteTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

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

  const grams = readPositive(weight.value);
  weight.setAttribute("aria-invalid", String(grams === null));
  weightError.hidden = grams !== null;
  presets.forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.weight) === grams)));
  const total = canConvert && grams !== null ? amount * grams : NaN;
  const totalText = Number.isFinite(total) && total > 0 ? `¥${formatAmount(total)}` : "–";
  if (totalOutput.value !== totalText) totalOutput.value = totalText;
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), credentials: "omit" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
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
weight.addEventListener("input", render);
presets.forEach((button) => button.addEventListener("click", () => {
  weight.value = button.dataset.weight;
  render();
}));
refreshButton.addEventListener("click", refreshQuotes);
render();
refreshQuotes();
