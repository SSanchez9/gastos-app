import { getChartData } from "./calc";
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
  legend: getElement("chart-legend", HTMLUListElement),
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

function buildCenterText(chart: ChartData): SVGTextElement[] {
  let value: string;
  let label: string;
  if (chart.kind === "income") {
    const savings = chart.slices.find((slice) => slice.key === "ahorro");
    value = formatPercent(savings?.pct ?? 0);
    label = "ahorrado";
  } else {
    value = formatMoney(chart.totalCents);
    label = "gastado";
  }

  const valueText = svgEl("text", {
    x: String(CENTER),
    y: String(CENTER - 2),
    class:
      chart.kind === "income"
        ? "chart__center-value"
        : "chart__center-value chart__center-value--small",
  });
  valueText.textContent = value;

  const labelText = svgEl("text", {
    x: String(CENTER),
    y: String(CENTER + 16),
    class: "chart__center-label",
  });
  labelText.textContent = label;

  return [valueText, labelText];
}

/**
 * Anillo hecho con círculos cuyo trazo se corta con stroke-dasharray.
 * Así un único 100 % se dibuja sin casos especiales.
 */
function buildDonut(chart: ChartData): SVGSVGElement {
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

  svg.append(group, ...buildCenterText(chart));
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

function describeBasis(chart: ChartData, month: string): string {
  switch (chart.kind) {
    case "income":
      return `Los porcentajes se calculan sobre el sueldo de ${formatMonth(month)}.`;
    case "deficit":
      return "Has gastado más que tu sueldo, así que no hay ahorro. Los porcentajes se calculan sobre el total gastado.";
    case "no-income":
      return "Sin sueldo registrado: los porcentajes se calculan sobre el total gastado. Registra el sueldo para ver el ahorro.";
    case "empty":
      return "";
  }
}

/** Dibuja el gráfico y la leyenda del mes seleccionado. */
export function renderChart(state: AppState): void {
  const month = state.ui.selectedMonth;
  const chart = getChartData(state.data, month);

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

  chartDom.container.replaceChildren(buildDonut(chart));
  chartDom.legend.replaceChildren(...chart.slices.map(createLegendItem));
  chartDom.note.textContent = describeBasis(chart, month);
}
