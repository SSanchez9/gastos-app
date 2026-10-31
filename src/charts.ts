import { getChartData, getSavingsSummary, lastSixMonthsSavingsTotals } from "./calc";
import type { ChartData, ChartSlice } from "./calc";
import { CATEGORIES, SAVINGS_COLOR } from "./config";
import { formatMoney, formatMonth, formatPercent } from "./format";
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
  return key === "ahorro" ? SAVINGS_COLOR : CATEGORIES[key].color;
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
function buildDonut(chart: ChartData, savingsPct: number | null): SVGSVGElement {
  // El SVG es decorativo para lectores de pantalla: la leyenda ya contiene los datos.
  const svg = svgEl("svg", {
    viewBox: `0 0 ${SIZE} ${SIZE}`,
    class: "chart__svg",
    "aria-hidden": "true",
    focusable: "false",
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
    });

    const title = svgEl("title");
    title.textContent = `${sliceLabel(slice.key)}: ${formatMoney(slice.cents)} (${formatPercent(slice.pct)})`;
    circle.append(title);
    group.append(circle);

    offset += length;
  }

  svg.append(group, ...buildCenterText(savingsPct));
  return svg;
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

const compactMoney = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 0,
});

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

      const savedText =
        item.savedCents === null
          ? "Sueldo sin registrar"
          : item.savedCents < 0
            ? `Déficit ${formatMoney(-item.savedCents)}`
            : `Ahorraste ${formatMoney(item.savedCents)}`;
      const tooltipText = `Gastaste ${formatMoney(item.spentCents)} · ${savedText}`;
      column.setAttribute("aria-label", `${formatMonth(item.month)}. ${tooltipText}`);
      column.title = `${formatMonth(item.month)}: ${tooltipText}`;

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
        item.savedCents === null ? "—" : compactMoney.format(item.savedCents / 100);

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
      column.addEventListener("click", () => {
        const shouldOpen = column.getAttribute("aria-expanded") !== "true";
        for (const other of chartDom.monthly.querySelectorAll<HTMLButtonElement>(
          ".month-chart__item",
        )) {
          other.setAttribute("aria-expanded", String(other === column && shouldOpen));
        }
      });
      return column;
    }),
  );
}

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

  chartDom.container.replaceChildren(buildDonut(chart, savings.savingsPct));
  chartDom.legend.replaceChildren(...chart.slices.map(createLegendItem));
  chartDom.note.textContent =
    chart.kind === "income"
      ? `Reparto del sueldo de ${formatMonth(month)}.`
      : chart.kind === "deficit"
        ? "Los gastos superan los ingresos del mes."
        : "Registra el sueldo para calcular el porcentaje de ahorro.";
}
