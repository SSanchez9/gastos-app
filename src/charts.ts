import { getChartData, getSavingsSummary, lastSixMonthsSavingsTotals } from "./calc";
import type { ChartData, ChartSlice } from "./calc";
import { CATEGORIES } from "./config";
import { formatCompactMoney, formatMoney, formatMonth, formatPercent } from "./format";
import type { AppState } from "./types";
import { getElement } from "./ui";

const SVG_NS = "http://www.w3.org/2000/svg";
const SIZE = 200;
const CENTER = SIZE / 2;
const RADIUS = 70;
const STROKE = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const chartDom = {
  container: getElement("chart", HTMLDivElement),
  note: getElement("chart-note", HTMLParagraphElement),
  period: getElement("chart-period", HTMLSpanElement),
  legend: getElement("chart-legend", HTMLUListElement),
  monthly: getElement("monthly-chart", HTMLDivElement),
};

function sliceLabel(key: ChartSlice["key"]): string {
  return key === "ahorro" ? "Ahorro" : CATEGORIES[key].label;
}

function sliceColor(key: ChartSlice["key"]): string {
  return key === "ahorro" ? "var(--savings-color)" : CATEGORIES[key].color;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

function buildCenterText(savingsPct: number | null): SVGTextElement[] {
  const valueText = svgEl("text", {
    x: String(CENTER),
    y: String(CENTER - 2),
    class: "chart__center-value",
  });
  valueText.textContent = savingsPct === null ? "—" : formatPercent(savingsPct);

  const labelText = svgEl("text", {
    x: String(CENTER),
    y: String(CENTER + 16),
    class: "chart__center-label",
  });
  labelText.textContent = "ahorro";

  return [valueText, labelText];
}

/**
 * Anillo hecho con círculos cuyo trazo se corta con stroke-dasharray.
 * Así un único 100 % se dibuja sin casos especiales.
 */
function buildDonut(
  chart: ChartData,
  savingsPct: number | null,
): { svg: SVGSVGElement; tooltip: HTMLSpanElement } {
  const svg = svgEl("svg", {
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    class: "chart__svg",
    role: "group",
    "aria-label":
      "Gastos y ahorro por categoría. Enfoca o señala una sección para ver sus datos.",
  });

  svg.append(
    svgEl("circle", {
      cx: String(CENTER),
      cy: String(CENTER),
      r: String(RADIUS),
      fill: "none",
      "stroke-width": String(STROKE),
      class: "chart__track",
    }),
  );

  // Gira -90º para que la primera porción empiece arriba.
  const group = svgEl("g", { transform: `rotate(-90 ${CENTER} ${CENTER})` });
  const gap = chart.slices.length > 1 ? 1 : 0;
  let offset = 0;

  const tooltip = document.createElement("span");
  tooltip.className = "chart__tooltip";
  tooltip.id = "chart-donut-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;

  const showTooltip = (slice: ChartSlice, x: number, y: number): void => {
    tooltip.textContent = `${sliceLabel(slice.key)} · ${formatPercent(slice.pct)} · ${formatMoney(slice.cents)}`;
    tooltip.hidden = false;
    const padding = 8;
    const halfWidth = tooltip.offsetWidth / 2;
    const safeX = Math.min(
      chartDom.container.clientWidth - halfWidth - padding,
      Math.max(halfWidth + padding, x),
    );
    const safeY = Math.max(tooltip.offsetHeight + padding, y);
    tooltip.style.left = `${safeX}px`;
    tooltip.style.top = `${safeY}px`;
  };
  const hideTooltip = (): void => {
    tooltip.hidden = true;
  };

  for (const slice of chart.slices) {
    const length = (slice.pct / 100) * CIRCUMFERENCE;
    const visible = Math.max(0, length - gap);

    const circle = svgEl("circle", {
      cx: String(CENTER),
      cy: String(CENTER),
      r: String(RADIUS),
      fill: "none",
      stroke: sliceColor(slice.key),
      "stroke-width": String(STROKE),
      "stroke-dasharray": `${visible} ${CIRCUMFERENCE - visible}`,
      "stroke-dashoffset": String(-offset),
      class: "chart__slice",
      tabindex: "0",
      role: "img",
      "aria-label": `${sliceLabel(slice.key)}: ${formatMoney(slice.cents)}, ${formatPercent(slice.pct)}`,
      "aria-describedby": tooltip.id,
    });

    const title = svgEl("title");
    title.textContent = `${sliceLabel(slice.key)}: ${formatMoney(slice.cents)} (${formatPercent(slice.pct)})`;
    circle.append(title);
    circle.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      const rect = chartDom.container.getBoundingClientRect();
      showTooltip(slice, event.clientX - rect.left, event.clientY - rect.top);
    });
    circle.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      const rect = chartDom.container.getBoundingClientRect();
      showTooltip(slice, event.clientX - rect.left, event.clientY - rect.top);
    });
    circle.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") hideTooltip();
    });
    circle.addEventListener("focus", () => {
      const circleRect = circle.getBoundingClientRect();
      const containerRect = chartDom.container.getBoundingClientRect();
      showTooltip(
        slice,
        circleRect.left + circleRect.width / 2 - containerRect.left,
        circleRect.top + circleRect.height / 2 - containerRect.top,
      );
    });
    circle.addEventListener("blur", hideTooltip);
    group.append(circle);

    offset += length;
  }

  svg.append(group, ...buildCenterText(savingsPct));
  return { svg, tooltip };
}

function createLegendItem(slice: ChartSlice): HTMLLIElement {
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.backgroundColor = sliceColor(slice.key);
  dot.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "breakdown__name";
  name.textContent = sliceLabel(slice.key);

  const amount = document.createElement("span");
  amount.className = "breakdown__amount";
  amount.textContent = formatMoney(slice.cents);

  const percentage = document.createElement("span");
  percentage.className = "breakdown__pct";
  percentage.textContent = formatPercent(slice.pct);

  const item = document.createElement("li");
  item.className = "legend__item";
  item.append(dot, name, amount, percentage);
  return item;
}

function renderMonthlyChart(state: AppState): void {
  const months = lastSixMonthsSavingsTotals(state.data, state.ui.selectedMonth);
  const maximum = Math.max(...months.map((item) => Math.abs(item.savedCents ?? 0)), 0);
  const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "short" });

  chartDom.monthly.replaceChildren(
    ...months.map((item, index) => {
      const month = new Date(
        Number(item.month.slice(0, 4)),
        Number(item.month.slice(5, 7)) - 1,
        1,
      );
      const isCurrent = index === months.length - 1;
      const column = document.createElement("button");
      column.type = "button";
      column.className = isCurrent
        ? "month-chart__item month-chart__item--current"
        : "month-chart__item";
      column.setAttribute("aria-expanded", "false");
      column.setAttribute("aria-haspopup", "tooltip");

      const savedText =
        item.savedCents === null
          ? "Sin sueldo"
          : item.savedCents < 0
            ? `Déficit ${formatMoney(-item.savedCents)}`
            : `Ahorraste ${formatMoney(item.savedCents)}`;
      const tooltipText = `Gastaste ${formatMoney(item.spentCents)} · ${savedText}`;
      column.setAttribute("aria-label", `${formatMonth(item.month)}. ${tooltipText}`);

      const tooltip = document.createElement("span");
      tooltip.className = "month-chart__tooltip";
      tooltip.id = `month-tooltip-${item.month}`;
      tooltip.setAttribute("role", "tooltip");
      tooltip.textContent = tooltipText;
      column.setAttribute("aria-describedby", tooltip.id);

      const amount = document.createElement("span");
      amount.className = "month-chart__amount";
      amount.setAttribute("aria-hidden", "true");
      amount.textContent =
        item.savedCents === null ? "—" : formatCompactMoney(item.savedCents);

      const track = document.createElement("span");
      track.className = "month-chart__track";
      track.setAttribute("aria-hidden", "true");
      const bar = document.createElement("span");
      bar.className = "month-chart__bar";
      if (item.savedCents === null) {
        bar.classList.add("month-chart__bar--unknown");
      } else if (item.savedCents < 0) {
        bar.classList.add("month-chart__bar--negative");
      }
      const height =
        maximum === 0 || item.savedCents === null
          ? 0
          : (Math.abs(item.savedCents) / maximum) * 100;
      bar.style.height = `${height}%`;
      track.append(bar);

      const label = document.createElement("span");
      label.className = "month-chart__label";
      label.setAttribute("aria-hidden", "true");
      label.textContent = monthLabel.format(month).replace(".", "");

      column.append(amount, track, label, tooltip);
      column.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch") return;
        event.preventDefault();
        const shouldOpen = column.getAttribute("aria-expanded") !== "true";
        closeTooltips();
        column.setAttribute("aria-expanded", String(shouldOpen));
      });
      column.addEventListener("click", (event) => {
        if (event.detail !== 0) return;
        const shouldOpen = column.getAttribute("aria-expanded") !== "true";
        closeTooltips();
        column.setAttribute("aria-expanded", String(shouldOpen));
      });
      return column;
    }),
  );
}

function closeTooltips(): void {
  chartDom.monthly
    .querySelectorAll<HTMLButtonElement>(".month-chart__item")
    .forEach((item) => {
      item.setAttribute("aria-expanded", "false");
    });
}

document.addEventListener("pointerdown", (event) => {
  if (
    event.pointerType === "touch" &&
    event.target instanceof Node &&
    !chartDom.monthly.contains(event.target)
  ) {
    closeTooltips();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTooltips();
});

/** Dibuja el reparto de gastos y la evolución mensual con los datos cargados. */
export function renderChart(state: AppState): void {
  const month = state.ui.selectedMonth;
  const chart = getChartData(state.data, month);
  const savings = getSavingsSummary(state.data, month);
  chartDom.period.textContent = formatMonth(month);
  renderMonthlyChart(state);

  if (chart.kind === "empty") {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      "Aún no hay datos este mes. Añade gastos y registra el sueldo para ver el gráfico.";
    chartDom.container.replaceChildren(empty);
    chartDom.legend.replaceChildren();
    chartDom.note.textContent = "";
    return;
  }

  const donut = buildDonut(chart, savings.savingsPct);
  chartDom.container.replaceChildren(donut.svg, donut.tooltip);
  chartDom.legend.replaceChildren(...chart.slices.map(createLegendItem));
  chartDom.note.textContent =
    chart.kind === "income"
      ? `Reparto del sueldo de ${formatMonth(month)}.`
      : chart.kind === "deficit"
        ? "Los gastos superan los ingresos del mes."
        : "Registra el sueldo para calcular el porcentaje de ahorro.";
}
