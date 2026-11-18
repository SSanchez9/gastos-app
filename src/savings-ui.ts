import { lastSixMonthsSavingsTotals } from "./calc";
import { renderMonthColumns } from "./charts";
import {
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatMonth,
  formatPercent,
  getCurrentMonthKey,
} from "./format";
import { adjustmentValue, getSavingsOverview } from "./savings";
import type { SavingsHistoryMonth, SavingsOverview } from "./savings";
import type { AppState, MonthKey, SavingsAdjustment, SavingsGoal } from "./types";
import { createIcon, el, getElement } from "./ui";

const savingsDom = {
  total: getElement("savings-total", HTMLParagraphElement),
  totalNote: getElement("savings-total-note", HTMLParagraphElement),
  monthChip: getElement("savings-month-chip", HTMLParagraphElement),
  start: getElement("savings-base-start", HTMLButtonElement),
  growth: getElement("savings-growth", HTMLDivElement),
  growthEmpty: getElement("savings-growth-empty", HTMLParagraphElement),
  months: getElement("savings-months", HTMLDivElement),
  missing: getElement("savings-missing", HTMLParagraphElement),
  missingText: getElement("savings-missing-text", HTMLSpanElement),
  baseEdit: getElement("savings-base-edit", HTMLButtonElement),
  breakdown: getElement("savings-breakdown", HTMLElement),
  breakdownEmpty: getElement("savings-breakdown-empty", HTMLParagraphElement),
  goals: getElement("savings-goals", HTMLUListElement),
  goalsEmpty: getElement("savings-goals-empty", HTMLParagraphElement),
  adjustmentAdd: getElement("savings-adjustment-add", HTMLButtonElement),
  adjustments: getElement("savings-adjustments", HTMLUListElement),
  adjustmentsEmpty: getElement("savings-adjustments-empty", HTMLParagraphElement),
};

/** "2026-11" → "noviembre" */
function monthName(month: MonthKey): string {
  return formatMonth(month).split(" de ")[0] ?? formatMonth(month);
}

function signedMoney(cents: number): string {
  return `${cents < 0 ? "−" : "+"}${formatMoney(Math.abs(cents))}`;
}

/** «septiembre», «septiembre y octubre», «agosto, septiembre y octubre» */
function joinMonths(months: readonly MonthKey[]): string {
  const names = months.map(monthName);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1) ?? ""}`;
}

/** Cifra principal con los decimales más pequeños, como en Inicio. */
function renderTotal(cents: number | null): void {
  const text = cents === null ? "—" : formatMoney(cents);
  const decimalIndex = text.lastIndexOf(",");
  if (decimalIndex < 0) {
    savingsDom.total.textContent = text;
    return;
  }
  savingsDom.total.replaceChildren(
    el("span", "", text.slice(0, decimalIndex)),
    el("span", "hero__decimals", text.slice(decimalIndex)),
  );
}

function renderHero(overview: SavingsOverview | null, month: MonthKey): void {
  savingsDom.start.hidden = overview !== null;
  savingsDom.monthChip.className = "hero-chip privacy-amount";
  savingsDom.monthChip.textContent = "";
  if (overview === null) {
    renderTotal(null);
    savingsDom.totalNote.textContent =
      "Indica cuánto tenías ahorrado y desde qué mes: a partir de ahí se suma lo que te sobra cada mes.";
    return;
  }
  if (overview.beforeBase) {
    renderTotal(null);
    savingsDom.totalNote.textContent = `Tu ahorro empieza a contar en ${formatMonth(overview.baseMonth)}.`;
    return;
  }
  renderTotal(overview.totalCents);
  savingsDom.totalNote.textContent =
    "Se calcula solo: tu base más lo que te sobra cada mes.";
  const inProgress = month === getCurrentMonthKey() ? " (en curso)" : "";
  if (overview.monthSurplusCents === null) {
    savingsDom.monthChip.textContent = `${capitalize(monthName(month))}: sin sueldo apuntado`;
  } else {
    savingsDom.monthChip.classList.add(
      overview.monthSurplusCents < 0 ? "hero-chip--down" : "hero-chip--up",
    );
    savingsDom.monthChip.textContent = `${signedMoney(overview.monthSurplusCents)} en ${monthName(month)}${inProgress}`;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

const SVG_NS = "http://www.w3.org/2000/svg";
// Igual que las columnas de «Lo que te sobra cada mes» (charts.ts).
const shortMonth = new Intl.DateTimeFormat("es-ES", { month: "short" });

function monthDate(month: MonthKey): Date {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
}

/** Línea del total al final de cada mes, con el importe bajo cada mes. */
function renderGrowth(history: readonly SavingsHistoryMonth[] | null): void {
  const points = (history ?? []).filter(
    (item): item is SavingsHistoryMonth & { totalCents: number } =>
      item.totalCents !== null,
  );
  savingsDom.growthEmpty.hidden = points.length >= 2;
  savingsDom.growth.hidden = points.length < 2;
  if (history === null || points.length < 2) {
    savingsDom.growthEmpty.textContent =
      history === null
        ? "Cuando indiques tu ahorro base, aquí verás cómo crece."
        : "Verás la evolución cuando haya al menos dos meses desde tu base.";
    savingsDom.growth.replaceChildren();
    return;
  }
  const values = points.map((item) => item.totalCents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const x = (month: MonthKey): number =>
    (history.findIndex((item) => item.month === month) + 0.5) * 20;
  // Margen arriba y abajo para que la línea no toque los bordes.
  const y = (cents: number): number =>
    range === 0 ? 50 : 90 - ((cents - min) / range) * 80;
  const line = points
    .map(
      (item, index) =>
        `${index === 0 ? "M" : "L"}${x(item.month)} ${y(item.totalCents).toFixed(1)}`,
    )
    .join(" ");
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) return;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "line-chart__svg");
  svg.setAttribute("viewBox", "0 0 120 100");
  svg.setAttribute("preserveAspectRatio", "none");
  const area = document.createElementNS(SVG_NS, "path");
  area.setAttribute("class", "line-chart__area");
  area.setAttribute("d", `${line} L${x(last.month)} 100 L${x(first.month)} 100 Z`);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", "line-chart__line");
  path.setAttribute("d", line);
  svg.append(area, path);

  const labels = el("ol", "line-chart__labels");
  for (const item of history) {
    const label = el(
      "li",
      item === last
        ? "line-chart__label line-chart__label--current"
        : "line-chart__label",
    );
    label.append(
      el(
        "span",
        "line-chart__month",
        shortMonth.format(monthDate(item.month)).replace(".", ""),
      ),
      el(
        "span",
        "line-chart__value privacy-amount",
        item.totalCents === null ? "—" : formatCompactMoney(item.totalCents),
      ),
    );
    labels.append(label);
  }
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Total ahorrado: ${formatMoney(first.totalCents)} a final de ${formatMonth(first.month)} y ${formatMoney(last.totalCents)} a final de ${formatMonth(last.month)}.`,
  );
  savingsDom.growth.replaceChildren(svg, labels);
}

function renderMissingIncome(overview: SavingsOverview | null): void {
  const missing = overview?.beforeBase ? [] : (overview?.missingIncomeMonths ?? []);
  savingsDom.missing.hidden = missing.length === 0;
  if (missing.length === 0) return;
  savingsDom.missingText.textContent = `${capitalize(joinMonths(missing))} ${missing.length === 1 ? "no cuenta" : "no cuentan"}: falta el sueldo.`;
}

function breakdownItem(label: string, value: string, total = false): HTMLDivElement {
  const item = el(
    "div",
    total ? "equation__item equation__item--total" : "equation__item",
  );
  item.append(el("dt", "equation__label", label), el("dd", "equation__value", value));
  return item;
}

function renderBreakdown(overview: SavingsOverview | null): void {
  savingsDom.baseEdit.hidden = overview === null;
  savingsDom.breakdownEmpty.hidden = overview !== null;
  if (overview === null) {
    savingsDom.breakdown.replaceChildren();
    return;
  }
  const months = overview.countedMonths;
  savingsDom.breakdown.replaceChildren(
    breakdownItem(
      `Ahorro base · ${formatMonth(overview.baseMonth)}`,
      formatMoney(overview.baseCents),
    ),
    breakdownItem(
      `Lo que sobró (${months} ${months === 1 ? "mes" : "meses"})`,
      signedMoney(overview.surplusCents),
    ),
    breakdownItem("Ajustes", signedMoney(overview.adjustmentsCents)),
    breakdownItem(
      "Tienes ahorrado",
      overview.beforeBase ? "—" : formatMoney(overview.totalCents),
      true,
    ),
  );
}

function renderGoals(goals: readonly SavingsGoal[]): void {
  savingsDom.goalsEmpty.hidden = goals.length > 0;
  savingsDom.goals.replaceChildren(
    ...goals.map((goal) => {
      const progress = Math.min(100, (goal.savedCents / goal.targetCents) * 100);
      const item = el("li", "goal-mini");
      const jar = el("div", "jar jar--mini");
      jar.setAttribute("role", "progressbar");
      jar.setAttribute("aria-label", `Progreso de ${goal.name}`);
      jar.setAttribute("aria-valuemin", "0");
      jar.setAttribute("aria-valuemax", "100");
      jar.setAttribute("aria-valuenow", String(Math.round(progress)));
      jar.style.setProperty("--v", `${progress}%`);
      jar.append(el("span", "jar__fill"));
      const text = el("span", "goal-mini__text");
      const meta = el("span", "goal-mini__meta");
      meta.append(
        el("span", "privacy-amount", formatMoney(goal.savedCents)),
        " de ",
        el("span", "privacy-amount", formatMoney(goal.targetCents)),
        ` · ${formatPercent(Math.round(progress))}`,
      );
      text.append(el("span", "goal-mini__name", goal.name), meta);
      item.append(jar, text);
      return item;
    }),
  );
}

/** Lápiz de una fila: el borrado está dentro de la ventana de edición. */
function editButton(label: string, action: string, id: string | null): HTMLSpanElement {
  const actions = el("span", "row__actions");
  const button = el("button", "icon-btn");
  button.type = "button";
  button.dataset["action"] = action;
  if (id !== null) button.dataset["id"] = id;
  button.setAttribute("aria-label", `Editar ${label}`);
  button.append(createIcon("edit", "icon icon--sm"));
  actions.append(button);
  return actions;
}

function adjustmentRow(
  adjustment: SavingsAdjustment,
  baseMonth: MonthKey,
): HTMLLIElement {
  const row = el("li", "row");
  const incoming = adjustment.kind === "in";
  const blob = el("span", `blob blob--${incoming ? "mint" : "peach"}`);
  blob.setAttribute("aria-hidden", "true");
  blob.append(createIcon(incoming ? "arrow-in" : "arrow-out"));
  const text = el("span", "row__text");
  const meta = [
    formatDate(adjustment.date),
    adjustment.date.slice(0, 7) < baseMonth ? "No cuenta: es anterior a tu base" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  text.append(el("span", "row__title", adjustment.title), el("span", "row__meta", meta));
  row.append(
    blob,
    text,
    el(
      "span",
      `row__amount privacy-amount${incoming ? " row__amount--in" : ""}`,
      signedMoney(adjustmentValue(adjustment)),
    ),
    editButton(`el ajuste ${adjustment.title}`, "savings-edit", adjustment.id),
  );
  return row;
}

function renderAdjustments(state: AppState): void {
  const savings = state.data.savings;
  savingsDom.adjustmentAdd.hidden = savings === undefined;
  if (savings === undefined) {
    savingsDom.adjustments.replaceChildren();
    savingsDom.adjustmentsEmpty.hidden = false;
    savingsDom.adjustmentsEmpty.textContent =
      "Indica primero tu ahorro base. Después podrás apuntar regalos, herencias o dinero que sacas del ahorro.";
    return;
  }
  const sorted = [...savings.adjustments].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );
  savingsDom.adjustmentsEmpty.hidden = sorted.length > 0;
  savingsDom.adjustmentsEmpty.textContent =
    "Regalos, herencias o dinero que sacas del ahorro: lo que no pasa por tus ingresos y gastos.";

  // La base va al final, como el punto de partida.
  const base = el("li", "row");
  const blob = el("span", "blob blob--lilac");
  blob.setAttribute("aria-hidden", "true");
  blob.append(createIcon("jar"));
  const text = el("span", "row__title");
  text.textContent = "Ahorro base";
  const baseText = el("span", "row__text");
  baseText.append(
    text,
    el("span", "row__meta", `Al empezar ${formatMonth(savings.baseMonth)}`),
  );
  base.append(
    blob,
    baseText,
    el(
      "span",
      "row__amount row__amount--in privacy-amount",
      formatMoney(savings.baseCents),
    ),
    editButton("el ahorro base", "savings-base", null),
  );
  savingsDom.adjustments.replaceChildren(
    ...sorted.map((adjustment) => adjustmentRow(adjustment, savings.baseMonth)),
    base,
  );
}

/** Pinta la pantalla Ahorro con los datos del mes elegido. */
export function renderSavings(state: AppState): void {
  const month = state.ui.selectedMonth;
  const overview = getSavingsOverview(state.data, month);
  renderHero(overview, month);
  renderGrowth(overview?.history ?? null);
  renderMonthColumns(
    savingsDom.months,
    lastSixMonthsSavingsTotals(state.data, month),
    "savings-month",
  );
  renderMissingIncome(overview);
  renderBreakdown(overview);
  renderGoals(state.data.goals ?? []);
  renderAdjustments(state);
}
