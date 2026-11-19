"use strict";

const drawReserveChart = (() => {
  const labelColor = "#b3ab9c";
  const gridColor = "#433a2d";
  const zeroColor = "#81715b";
  const chartColor = "#edc570";
  const font = "11px system-ui, sans-serif";

  function axisScale(min, max, isChange) {
    if (isChange) {
      min = Math.min(min, 0);
      max = Math.max(max, 0);
      if (min === max) return { first: -1, last: 1, step: 0.5 };
    } else {
      const pad = Math.max((max - min) * 0.08, 0.25);
      min = Math.max(0, min - pad);
      max += pad;
    }
    const stepTarget = (max - min) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(stepTarget));
    const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= stepTarget);
    return { first: Math.floor(min / step) * step, last: Math.ceil(max / step) * step, step };
  }

  function drawLine(context, values, xFor, yFor) {
    context.strokeStyle = chartColor;
    context.fillStyle = chartColor;
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    for (const [index, value] of values.entries()) {
      if (!Number.isFinite(value)) continue;
      if (Number.isFinite(values[index - 1])) context.lineTo(xFor(index), yFor(value));
      else context.moveTo(xFor(index), yFor(value));
    }
    context.stroke();
    for (const [index, value] of values.entries()) {
      if (!Number.isFinite(value)) continue;
      context.beginPath();
      context.arc(xFor(index), yFor(value), 2.6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawBars(context, values, xFor, yFor, monthWidth, color) {
    const baseline = yFor(0);
    const barWidth = Math.min(monthWidth * .68, 44);
    context.fillStyle = color;
    for (const [index, value] of values.entries()) {
      if (!Number.isFinite(value)) continue;
      const x = xFor(index) - barWidth / 2;
      if (value === 0) {
        context.fillRect(x, baseline - 0.65, barWidth, 1.3);
      } else {
        const height = Math.max(Math.abs(yFor(value) - baseline), 1);
        context.fillRect(x, value > 0 ? baseline - height : baseline, barWidth, height);
      }
    }
  }

  return function drawReserveChart(canvas, { months, values, outflows = [], kind, activeIndex = -1 }) {
    const context = canvas.getContext("2d");
    const { width, height } = canvas.getBoundingClientRect();
    if (!context || !width || !height) return null;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    context.font = font;
    context.fillStyle = labelColor;

    const observed = [...values, ...outflows].filter(Number.isFinite);
    if (!months.length || !observed.length) {
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("暂无可绘制的月度数据", width / 2, height / 2);
      return null;
    }

    const isChange = kind === "change";
    const { first, last, step } = axisScale(Math.min(...observed), Math.max(...observed), isChange);
    const format = new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: Math.min(8, Math.max(0, 1 - Math.floor(Math.log10(step)))),
      signDisplay: isChange ? "exceptZero" : "auto",
    });
    const tickCount = Math.round((last - first) / step);
    const ticks = Array.from({ length: tickCount + 1 }, (_, tick) => {
      const value = first + tick * step;
      return Math.abs(value) < step * 1e-8 ? 0 : value;
    });
    const left = Math.max(62, ...ticks.map((value) => context.measureText(format.format(value)).width + 12));
    const plot = { left, right: width - 12, top: 25, bottom: height - 24 };
    if (plot.left >= plot.right || plot.top >= plot.bottom) return null;
    const monthWidth = (plot.right - plot.left) / months.length;
    const xFor = (index) => plot.left + (index + 0.5) * monthWidth;
    const yFor = (value) => plot.bottom - (value - first) / (last - first) * (plot.bottom - plot.top);

    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("吨", plot.left, 8);

    context.textAlign = "right";
    for (const value of ticks) {
      const y = yFor(value);
      context.fillText(format.format(value), plot.left - 6, y);
      context.strokeStyle = isChange && value === 0 ? zeroColor : gridColor;
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
    }

    const labelCount = Math.min(months.length, Math.max(2, Math.floor((plot.right - plot.left) / 46)));
    context.textAlign = "center";
    for (let label = 0; label < labelCount; label += 1) {
      const index = Math.round(label * (months.length - 1) / Math.max(1, labelCount - 1));
      context.fillText(months[index].slice(2), Math.min(width - 19, xFor(index)), height - 7);
    }

    if (activeIndex >= 0 && activeIndex < months.length) {
      context.strokeStyle = "#e6bd7080";
      context.setLineDash([3, 4]);
      context.beginPath();
      context.moveTo(xFor(activeIndex), plot.top);
      context.lineTo(xFor(activeIndex), plot.bottom);
      context.stroke();
      context.setLineDash([]);
    }

    if (isChange) {
      drawBars(context, values, xFor, yFor, monthWidth, chartColor);
      drawBars(context, outflows, xFor, yFor, monthWidth, "#d89482");
    } else drawLine(context, values, xFor, yFor);

    return {
      indexAt(x) {
        return x >= plot.left && x < plot.right ? Math.floor((x - plot.left) / monthWidth) : -1;
      },
    };
  };
})();
