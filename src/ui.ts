import {
  compareWithPreviousMonth,
  categoryIncomeShares,
  dailyBudgetAllowance,
  expensesOfMonth,
  filterExpenses,
  getSavingsSummary,
  sumCents,
} from "./calc";
import type { MonthComparison } from "./calc";
import { CATEGORIES, CATEGORY_KEYS, isCategoryKey } from "./config";
import {
  centsToInputString,
  eurosToCents,
  formatDate,
  formatDayHeading,
  formatMoney,
  formatMonth,
  formatPercent,
  getTodayIso,
  shiftMonth,
} from "./format";
import type {
  AppState,
  CategoryKey,
  Expense,
  IsoDate,
  NewExpense,
  RecurringExpense,
  Result,
  WalletKind,
} from "./types";

export function getElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`No se encontró #${id} o no es del tipo esperado`);
  }
  return element;
}

export const dom = {
  monthSelect: getElement("month-select", HTMLInputElement),
  income: getElement("summary-income", HTMLElement),
  spent: getElement("summary-spent", HTMLParagraphElement),
  spentCompare: getElement("summary-spent-compare", HTMLParagraphElement),
  saved: getElement("summary-saved", HTMLParagraphElement),
  savedNote: getElement("summary-saved-note", HTMLParagraphElement),
  savingsPct: getElement("summary-savings-pct", HTMLElement),
  summaryTitle: getElement("summary-title", HTMLHeadingElement),
  categoryTotals: getElement("category-totals", HTMLUListElement),
  categoryEmpty: getElement("category-empty", HTMLParagraphElement),
  breakdownTotal: getElement("breakdown-total", HTMLElement),
  form: getElement("expense-form", HTMLFormElement),
  formTitle: getElement("expense-form-title", HTMLHeadingElement),
  formError: getElement("expense-error", HTMLParagraphElement),
  amount: getElement("expense-amount", HTMLInputElement),
  date: getElement("expense-date", HTMLInputElement),
  category: getElement("expense-category", HTMLSelectElement),
  note: getElement("expense-note", HTMLInputElement),
  submit: getElement("expense-submit", HTMLButtonElement),
  cancel: getElement("expense-cancel", HTMLButtonElement),
  filterCategory: getElement("filter-category", HTMLSelectElement),
  filterChips: getElement("filter-chips", HTMLDivElement),
  categoryPicker: getElement("expense-category-picker", HTMLDivElement),
  wallet: getElement("expense-wallet", HTMLSelectElement),
  currentDate: getElement("current-date", HTMLTimeElement),
  balance: getElement("summary-balance", HTMLParagraphElement),
  balanceNote: getElement("summary-balance-note", HTMLParagraphElement),
  balanceIncome: getElement("balance-income", HTMLElement),
  balanceSpent: getElement("balance-spent", HTMLElement),
  tableWrap: getElement("expense-table-wrap", HTMLDivElement),
  rows: getElement("expense-rows", HTMLDivElement),
  listEmpty: getElement("list-empty", HTMLParagraphElement),
  movementsTotal: getElement("movements-total", HTMLElement),
  movementsTotalLabel: getElement("movements-total-label", HTMLElement),
  remaining: getElement("summary-remaining", HTMLElement),
  remainingCard: getElement("summary-remaining-card", HTMLElement),
  recentActivity: getElement("recent-activity", HTMLUListElement),
  recentEmpty: getElement("recent-empty", HTMLParagraphElement),
  eyeToggle: getElement("hide-amounts", HTMLButtonElement),
  quickEntry: getElement("quick-entry-input", HTMLInputElement),
  quickEntryPanel: getElement("quick-entry-panel", HTMLDivElement),
  quickEntryPreview: getElement("quick-entry-preview", HTMLUListElement),
  completeExpense: getElement("show-complete-expense", HTMLButtonElement),
  toast: getElement("app-toast", HTMLParagraphElement),
};

// ---------- Piezas visuales comunes ----------

type Tone = "peach" | "mint" | "lilac" | "sky" | "neutral";

/** Icono y tono de cada categoría: la identidad nunca depende solo del color. */
const CATEGORY_LOOK: Record<CategoryKey, { icon: string; tone: Tone }> = {
  supermercado: { icon: "cart", tone: "peach" },
  personal: { icon: "user", tone: "lilac" },
  coche: { icon: "car", tone: "sky" },
  gasolina: { icon: "fuel", tone: "lilac" },
  alquiler: { icon: "key", tone: "peach" },
  casa: { icon: "home", tone: "sky" },
  otros: { icon: "tag", tone: "neutral" },
  social: { icon: "social", tone: "mint" },
};

const WALLET_LOOK: Record<WalletKind, { icon: string; tone: Tone; label: string }> = {
  bank: { icon: "wallet", tone: "sky", label: "Banco" },
  cash: { icon: "wallet", tone: "mint", label: "Efectivo" },
  card: { icon: "wallet", tone: "lilac", label: "Tarjeta" },
  savings: { icon: "jar", tone: "mint", label: "Ahorro" },
  investment: { icon: "chart", tone: "peach", label: "Inversión" },
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createIcon(name: string, className = "icon"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function createBlob(icon: string, tone: Tone): HTMLSpanElement {
  const blob = el("span", `blob blob--${tone}`);
  blob.setAttribute("aria-hidden", "true");
  blob.append(createIcon(icon));
  return blob;
}

function createCategoryBlob(category: CategoryKey): HTMLSpanElement {
  const look = CATEGORY_LOOK[category];
  return createBlob(look.icon, look.tone);
}

function createMoney(
  cents: number,
  className: string,
  sign: "" | "+" | "−" = "",
): HTMLElement {
  return el("span", `${className} privacy-amount`, `${sign}${formatMoney(cents)}`);
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

/** "2026-11" → "Noviembre 2026" */
function monthTitle(month: string): string {
  return capitalize(formatMonth(month).replace(" de ", " "));
}

/** "2026-11" → "noviembre" */
function monthName(month: string): string {
  return formatMonth(month).split(" de ")[0] ?? formatMonth(month);
}

function isoOffsetFromToday(days: number): IsoDate {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Hoy, Ayer o la fecha corta. */
export function relativeDayLabel(date: IsoDate): string {
  if (date === getTodayIso()) return "Hoy";
  if (date === isoOffsetFromToday(-1)) return "Ayer";
  return formatDate(date);
}

export interface ChartSeries {
  label: string;
  cents: number;
  pct: number;
  color: string;
  savings: boolean;
}

/** Color fijo de una categoría en los gráficos (tokens --cat-* de base.css). */
export function categoryColor(category: CategoryKey): string {
  return `var(--cat-${category})`;
}

/**
 * Series de los gráficos de reparto: todas las categorías de mayor a menor gasto,
 * cada una con su color, y el ahorro al final.
 */
export function buildSeries(
  expenses: readonly { category: CategoryKey; cents: number; pct: number }[],
  savings: { cents: number; pct: number } | null,
): ChartSeries[] {
  const series: ChartSeries[] = [...expenses]
    .sort((a, b) => b.cents - a.cents)
    .map((item) => ({
      label: CATEGORIES[item.category].label,
      cents: item.cents,
      pct: item.pct,
      color: categoryColor(item.category),
      savings: false,
    }));
  if (savings !== null && savings.cents > 0) {
    series.push({
      label: "Ahorro",
      cents: savings.cents,
      pct: savings.pct,
      color: "var(--savings-color)",
      savings: true,
    });
  }
  return series;
}

export function setAmountsHidden(hidden: boolean): void {
  document.body.classList.toggle("amounts-hidden", hidden);
  dom.eyeToggle.setAttribute("aria-pressed", String(hidden));
}

let toastTimer: number | undefined;
/** Mensaje breve de confirmación, anunciado por lectores de pantalla. */
export function showToast(message: string): void {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    dom.toast.hidden = true;
  }, 3200);
}

export function showExpenseSavedToast(expense: Expense, edited: boolean): void {
  showToast(
    edited
      ? "Cambios guardados."
      : `Movimiento añadido: ${formatMoney(expense.amountCents)} en ${CATEGORIES[expense.category].label}.`,
  );
}

function createOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

/** Rellena los desplegables y selectores de categoría a partir de config.ts. */
export function initCategorySelects(): void {
  dom.category.replaceChildren(
    ...CATEGORY_KEYS.map((key) => createOption(key, CATEGORIES[key].label)),
  );
  dom.filterCategory.replaceChildren(
    createOption("all", "Todas"),
    ...CATEGORY_KEYS.map((key) => createOption(key, CATEGORIES[key].label)),
  );
  // Las etiquetas de filtro actualizan el desplegable y avisan a main.ts con «change».
  dom.filterChips.replaceChildren(
    ...["all", ...CATEGORY_KEYS].map((value) => {
      const button = el(
        "button",
        "filter",
        value === "all" ? "Todas" : CATEGORIES[value as CategoryKey].label,
      );
      button.type = "button";
      button.dataset["filter"] = value;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        dom.filterCategory.value = value;
        dom.filterCategory.dispatchEvent(new Event("change"));
      });
      return button;
    }),
  );
  dom.categoryPicker.replaceChildren(
    ...CATEGORY_KEYS.map((category) => {
      const button = el("button", "category-chip");
      button.type = "button";
      button.dataset["category"] = category;
      button.setAttribute("aria-pressed", "false");
      button.append(
        createCategoryBlob(category),
        el("span", "category-chip__label", CATEGORIES[category].label),
      );
      button.addEventListener("click", () => {
        dom.category.value = category;
        syncCategoryPicker();
      });
      return button;
    }),
  );
  syncCategoryPicker();
}

function syncCategoryPicker(): void {
  for (const button of dom.categoryPicker.querySelectorAll<HTMLButtonElement>(
    "[data-category]",
  )) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset["category"] === dom.category.value),
    );
  }
}

function syncFilterChips(): void {
  for (const button of dom.filterChips.querySelectorAll<HTMLButtonElement>(
    "[data-filter]",
  )) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset["filter"] === dom.filterCategory.value),
    );
  }
}

// ---------- Formulario de gastos ----------

export function showFormError(message: string): void {
  dom.formError.textContent = message;
  dom.formError.hidden = false;
}

export function clearFormError(): void {
  dom.formError.textContent = "";
  dom.formError.hidden = true;
}

/** Lee el formulario. La validación completa la repite state.ts. */
export function readExpenseForm(): Result<NewExpense> {
  const amountCents = eurosToCents(dom.amount.value);
  if (amountCents === null) {
    return { ok: false, error: "Introduce un importe válido, por ejemplo 12,50." };
  }
  const category = dom.category.value;
  if (!isCategoryKey(category)) {
    return { ok: false, error: "Elige una categoría." };
  }
  return {
    ok: true,
    value: {
      amountCents,
      category,
      date: dom.date.value,
      note: dom.note.value,
      ...(dom.wallet.value ? { walletId: dom.wallet.value } : {}),
    },
  };
}

export function setEditMode(editing: boolean): void {
  dom.formTitle.textContent = editing ? "Editar movimiento" : "Añadir movimiento";
  dom.submit.textContent = editing ? "Guardar cambios" : "Añadir";
  dom.cancel.hidden = !editing;
  dom.quickEntryPanel.hidden = editing;
  dom.form.hidden = !editing;
  dom.completeExpense.setAttribute("aria-expanded", String(editing));
}

export function showCompleteExpenseForm(): void {
  dom.quickEntryPanel.hidden = true;
  dom.form.hidden = false;
  dom.completeExpense.setAttribute("aria-expanded", "true");
  dom.amount.focus();
}

/** Carga un gasto en el formulario para editarlo. */
export function fillForm(expense: Expense): void {
  dom.amount.value = centsToInputString(expense.amountCents);
  dom.date.value = expense.date;
  dom.category.value = expense.category;
  syncCategoryPicker();
  dom.note.value = expense.note;
  dom.wallet.value = expense.walletId ?? "";
  clearFormError();
  dom.amount.focus();
}

/**
 * Vacía el formulario. Con keepContext se conservan fecha y categoría,
 * útil para anotar varios gastos seguidos.
 */
export function resetForm(options: { keepContext: boolean }): void {
  dom.amount.value = "";
  dom.note.value = "";
  if (!options.keepContext) {
    dom.date.value = getTodayIso();
    dom.category.selectedIndex = 0;
  }
  syncCategoryPicker();
  clearFormError();
  dom.amount.focus();
}

export interface QuickEntryPreview {
  amountCents: number;
  category: CategoryKey;
  date: IsoDate;
}

/** Muestra lo que la entrada rápida ha entendido antes de guardar. */
export function renderQuickEntryPreview(preview: QuickEntryPreview | null): void {
  if (preview === null) {
    dom.quickEntryPreview.replaceChildren();
    dom.quickEntryPreview.hidden = true;
    return;
  }
  const chip = (icon: string, text: string): HTMLLIElement => {
    const item = el("li", "pill pill--surface");
    item.append(createIcon(icon, "icon icon--sm"), el("span", "", text));
    return item;
  };
  dom.quickEntryPreview.replaceChildren(
    chip("wallet", formatMoney(preview.amountCents)),
    chip(CATEGORY_LOOK[preview.category].icon, CATEGORIES[preview.category].label),
    chip("calendar", relativeDayLabel(preview.date)),
  );
  dom.quickEntryPreview.hidden = false;
}

// ---------- Inicio: resumen ----------

function renderIncome(state: AppState): void {
  const month = state.ui.selectedMonth;
  const savings = getSavingsSummary(state.data, month);
  const incomeMonthLabel = document.getElementById("income-month-label");
  const incomeTotalMonth = document.getElementById("income-total-month");
  if (incomeMonthLabel) incomeMonthLabel.textContent = monthTitle(month);
  if (incomeTotalMonth)
    incomeTotalMonth.textContent = formatMonth(month).replace(" de ", " ");

  dom.income.textContent =
    savings.incomeCents === null ? "—" : formatMoney(savings.incomeCents);
  dom.saved.textContent =
    savings.savedCents === null ? "—" : formatMoney(savings.savedCents);

  // Cifra principal: los decimales van más pequeños.
  const balanceText = savings.savedCents === null ? "—" : formatMoney(savings.savedCents);
  dom.balance.replaceChildren();
  const decimalIndex = balanceText.lastIndexOf(",");
  if (decimalIndex < 0) dom.balance.textContent = balanceText;
  else {
    const integer = el("span", "", balanceText.slice(0, decimalIndex));
    const decimals = el("span", "hero__decimals", balanceText.slice(decimalIndex));
    dom.balance.append(integer, decimals);
  }
  dom.summaryTitle.textContent =
    savings.savedCents === null
      ? `Ahorro de ${monthName(month)}`
      : savings.isDeficit
        ? `En ${monthName(month)} has gastado de más`
        : `En ${monthName(month)} has ahorrado`;
  dom.remaining.textContent =
    savings.savedCents === null ? "—" : formatMoney(savings.savedCents);
  dom.remainingCard.textContent =
    savings.savedCents === null ? "—" : formatMoney(savings.savedCents);
  dom.balanceIncome.textContent =
    savings.incomeCents === null ? "—" : formatMoney(savings.incomeCents);
  const monthSpent = sumCents(expensesOfMonth(state.data.expenses, month));
  dom.balanceSpent.textContent = formatMoney(monthSpent);
  dom.balanceNote.textContent =
    savings.savedCents === null
      ? "Registra tus ingresos para ver tu balance."
      : savings.isDeficit
        ? "Este mes has gastado más de lo que ingresaste."
        : "";
  dom.balanceNote.hidden = dom.balanceNote.textContent === "";
  dom.balanceNote.className = savings.isDeficit
    ? "hero__status hero__status--negative"
    : "hero__status";
  dom.savingsPct.textContent =
    savings.savingsPct === null ? "—" : formatPercent(savings.savingsPct);

  let noteText = "";
  let noteKind: "none" | "deficit" = "none";
  if (savings.incomeCents === null) {
    noteText = "Registra ingresos del mes para calcular el ahorro.";
  } else if (savings.isDeficit) {
    noteText = "Has gastado más de lo que ingresaste este mes.";
    noteKind = "deficit";
  }
  dom.savedNote.textContent = noteText;
  dom.savedNote.className = `card__note card__note--${noteKind}`;
}

function renderIncomeEntries(state: AppState): void {
  const list = document.getElementById("income-entry-list");
  const empty = document.getElementById("income-entry-empty");
  const countLabel = document.getElementById("income-entry-count");
  const month = state.ui.selectedMonth;
  const entries = (state.data.incomeEntries ?? [])
    .filter((entry) => entry.date.slice(0, 7) === month)
    .map((entry) => ({
      id: entry.id,
      title: entry.legacySourceMonth ? "Ingreso mensual" : entry.title,
      amountCents: entry.amountCents,
      dateLabel: entry.legacySourceMonth
        ? formatMonth(entry.legacySourceMonth)
        : formatDate(entry.date),
      sortDate: entry.date,
      createdAt: entry.createdAt,
      legacy: false,
    }));
  const migratedMonths = new Set(state.data.migratedIncomeMonths ?? []);
  for (const [legacyMonth, amountCents] of Object.entries(state.data.income.byMonth)) {
    if (legacyMonth !== month || migratedMonths.has(legacyMonth)) continue;
    entries.push({
      id: `legacy-income:${legacyMonth}`,
      title: "Ingreso mensual",
      amountCents,
      dateLabel: formatMonth(legacyMonth),
      sortDate: `${legacyMonth}-01`,
      createdAt: 0,
      legacy: true,
    });
  }
  entries.sort(
    (a, b) => b.sortDate.localeCompare(a.sortDate) || b.createdAt - a.createdAt,
  );
  const count = entries.length;
  if (countLabel)
    countLabel.textContent = `${count} ${count === 1 ? "ingreso" : "ingresos"}`;
  if (list instanceof HTMLUListElement) {
    list.replaceChildren(
      ...entries.map((entry) => {
        const item = el("li", "row row--editable");
        const detail = el("span", "row__text");
        detail.append(
          el("span", "row__title", entry.title),
          el("span", "row__meta", entry.dateLabel),
        );
        const actions = el("span", "row__actions");
        for (const [action, label, icon] of [
          ["income-edit", "Editar", "edit"],
          ["income-delete", "Eliminar", "trash"],
        ] as const) {
          const button = el(
            "button",
            action === "income-delete" ? "icon-btn icon-btn--danger" : "icon-btn",
          );
          button.type = "button";
          button.dataset["action"] = action;
          button.dataset["id"] = entry.id;
          button.setAttribute("aria-label", `${label} ${entry.title}`);
          button.append(createIcon(icon, "icon icon--sm"));
          actions.append(button);
        }
        item.append(
          createBlob("arrow-in", "mint"),
          detail,
          createMoney(entry.amountCents, "row__amount row__amount--in", "+"),
          actions,
          createIncomeEditForm(entry),
        );
        return item;
      }),
    );
  }
  if (empty instanceof HTMLParagraphElement) empty.hidden = count > 0;
}

/**
 * Formulario de edición de un ingreso, oculto dentro de su fila. El ingreso mensual
 * heredado (income.byMonth) solo admite cambiar el importe.
 */
function createIncomeEditForm(entry: {
  id: string;
  title: string;
  amountCents: number;
  sortDate: IsoDate;
  legacy: boolean;
}): HTMLDivElement {
  const form = el("div", "inline-edit");
  form.hidden = true;
  form.setAttribute("role", "group");
  form.setAttribute("aria-label", `Editar ${entry.title}`);
  const field = (
    name: "title" | "amount" | "date",
    labelText: string,
    value: string,
  ): void => {
    const wrap = el("div", "field");
    const input = el("input", "field__input");
    input.id = `income-edit-${name}-${entry.id}`;
    input.value = value;
    input.required = true;
    input.autocomplete = "off";
    input.dataset["incomeField"] = name;
    if (name === "title") input.maxLength = 80;
    if (name === "amount") input.inputMode = "decimal";
    if (name === "date") input.type = "date";
    const label = el("label", "field__label", labelText);
    label.htmlFor = input.id;
    wrap.append(label, input);
    form.append(wrap);
  };
  if (!entry.legacy) field("title", "Título", entry.title);
  field("amount", "Importe (€)", centsToInputString(entry.amountCents));
  if (!entry.legacy) field("date", "Fecha", entry.sortDate);
  const error = el("p", "form__error");
  error.setAttribute("role", "alert");
  error.dataset["incomeError"] = "true";
  error.hidden = true;
  const actions = el("div", "button-group");
  const save = el("button", "button button--small", "Guardar cambios");
  save.type = "button";
  save.dataset["action"] = "income-save";
  save.dataset["id"] = entry.id;
  const cancel = el("button", "button button--ghost button--small", "Cancelar");
  cancel.type = "button";
  cancel.dataset["action"] = "income-cancel";
  cancel.dataset["id"] = entry.id;
  actions.append(save, cancel);
  form.append(error, actions);
  return form;
}

type Trend = "up" | "down" | "flat" | "none";

function describeComparison(comparison: MonthComparison): { text: string; trend: Trend } {
  const previousName = formatMonth(comparison.previousMonth);
  const { currentCents, previousCents, diffCents, diffPct } = comparison;

  if (currentCents === 0 && previousCents === 0) {
    return { text: "Sin gastos este mes ni el anterior.", trend: "none" };
  }
  if (previousCents === 0 || diffPct === null) {
    return { text: `Sin gastos en ${previousName} para comparar.`, trend: "none" };
  }
  if (diffCents === 0) {
    return { text: `Has gastado lo mismo que en ${previousName}.`, trend: "flat" };
  }
  if (diffCents > 0) {
    return {
      text: `${formatMoney(diffCents)} más gastado que en ${previousName} (+${formatPercent(diffPct)})`,
      trend: "up",
    };
  }
  return {
    text: `${formatMoney(-diffCents)} menos gastado que en ${previousName} (-${formatPercent(-diffPct)})`,
    trend: "down",
  };
}

// ---------- Análisis: desglose ----------

function createBreakdownItem(
  category: CategoryKey,
  cents: number,
  pct: number | null,
  maxCents: number,
): HTMLLIElement {
  const name = el("span", "hbar__name");
  name.append(
    createIcon(CATEGORY_LOOK[category].icon, "icon icon--sm"),
    el("span", "", CATEGORIES[category].label),
  );
  const value = el("span", "hbar__value");
  value.append(
    createMoney(cents, "hbar__amount"),
    el("span", "hbar__pct", pct === null ? "—" : formatPercent(pct)),
  );
  const track = el("span", "hbar__track");
  track.setAttribute("aria-hidden", "true");
  const fill = el("span", "hbar__fill");
  fill.style.setProperty("--v", `${maxCents > 0 ? (cents / maxCents) * 100 : 0}%`);
  fill.style.setProperty("--c", categoryColor(category));
  track.append(fill);
  const item = el("li", "hbar");
  item.append(name, value, track);
  return item;
}

function renderSummary(state: AppState): void {
  const month = state.ui.selectedMonth;
  const expenses = state.data.expenses;

  const spentCents = sumCents(expensesOfMonth(expenses, month));
  dom.spent.textContent = formatMoney(spentCents);
  dom.breakdownTotal.textContent = formatMoney(spentCents);
  dom.movementsTotal.textContent = formatMoney(spentCents);
  dom.movementsTotalLabel.textContent = `Gastado en ${monthName(month)}`;

  const comparison = describeComparison(compareWithPreviousMonth(expenses, month));
  dom.spentCompare.textContent = comparison.text;
  dom.spentCompare.className = `hero-chip hero-chip--${comparison.trend}`;

  const savings = getSavingsSummary(state.data, month);
  const totals = categoryIncomeShares(expenses, month, savings.incomeCents);
  const maxCents = Math.max(0, ...totals.map((item) => item.cents));
  dom.categoryTotals.replaceChildren(
    ...totals.map((item) =>
      createBreakdownItem(item.category, item.cents, item.incomePct, maxCents),
    ),
  );
  dom.categoryTotals.hidden = totals.length === 0;
  dom.categoryEmpty.hidden = totals.length > 0;
}

// ---------- Movimientos y actividad: agrupados por día ----------

interface DayItem {
  id: string;
  date: IsoDate;
  createdAt: number;
  title: string;
  subtitle: string;
  amountCents: number;
  income: boolean;
  category: CategoryKey | null;
}

/** Agrupa por fecha (más reciente primero) conservando el orden de entrada. */
function groupByDay<T extends { date: IsoDate }>(items: readonly T[]): [IsoDate, T[]][] {
  const groups = new Map<IsoDate, T[]>();
  for (const item of items) {
    const group = groups.get(item.date);
    if (group) group.push(item);
    else groups.set(item.date, [item]);
  }
  return [...groups.entries()];
}

function createDayHeading(date: IsoDate, tag: "h2" | "h3"): HTMLElement {
  return el(tag, "day__title", formatDayHeading(date, getTodayIso()));
}

/** Lápiz y papelera de un movimiento; main.ts los atiende por data-action. */
function createExpenseActions(expense: Expense): HTMLSpanElement {
  const actions = el("span", "row__actions");
  for (const [action, verb, icon] of [
    ["edit", "Editar", "edit"],
    ["delete", "Eliminar", "trash"],
  ] as const) {
    const button = el(
      "button",
      action === "delete" ? "icon-btn icon-btn--danger" : "icon-btn",
    );
    button.type = "button";
    button.dataset["action"] = action;
    button.dataset["id"] = expense.id;
    button.setAttribute(
      "aria-label",
      `${verb} gasto de ${formatMoney(expense.amountCents)} del ${formatDate(expense.date)}`,
    );
    button.append(createIcon(icon, "icon icon--sm"));
    actions.append(button);
  }
  return actions;
}

function createExpenseRow(expense: Expense): HTMLLIElement {
  const label = CATEGORIES[expense.category].label;
  const title = expense.note || label;
  const text = el("span", "row__text");
  text.append(
    el("span", "row__title", title),
    el("span", "row__meta", expense.note ? label : "Sin nota"),
  );
  const row = el("li", "row");
  row.append(
    createCategoryBlob(expense.category),
    text,
    createMoney(expense.amountCents, "row__amount", "−"),
    createExpenseActions(expense),
  );
  return row;
}

function renderExpenseList(state: AppState): void {
  const { selectedMonth, categoryFilter } = state.ui;
  const expenses = filterExpenses(state.data.expenses, selectedMonth, categoryFilter);

  dom.rows.replaceChildren(
    ...groupByDay(expenses).map(([date, items]) => {
      const day = el("section", "day");
      const list = el("ul", "rows");
      list.append(...items.map(createExpenseRow));
      day.append(createDayHeading(date, "h2"), list);
      return day;
    }),
  );
  dom.tableWrap.hidden = expenses.length === 0;
  dom.listEmpty.hidden = expenses.length > 0;
  dom.listEmpty.textContent =
    categoryFilter === "all"
      ? "No hay gastos en este mes."
      : "No hay gastos de esta categoría en este mes.";
}

function renderRecentActivity(state: AppState): void {
  const month = state.ui.selectedMonth;
  const items: DayItem[] = state.data.expenses
    .filter((expense) => expense.date.slice(0, 7) === month)
    .map((expense) => ({
      id: expense.id,
      date: expense.date,
      createdAt: expense.createdAt,
      title: expense.note || CATEGORIES[expense.category].label,
      subtitle: expense.note ? CATEGORIES[expense.category].label : "Sin nota",
      amountCents: expense.amountCents,
      income: false,
      category: expense.category,
    }));
  for (const entry of state.data.incomeEntries ?? []) {
    if (entry.date.slice(0, 7) !== month) continue;
    items.push({
      id: entry.id,
      date: entry.date,
      createdAt: entry.createdAt,
      title: entry.title,
      subtitle: "Ingreso",
      amountCents: entry.amountCents,
      income: true,
      category: null,
    });
  }
  for (const [incomeMonth, amountCents] of Object.entries(state.data.income.byMonth)) {
    if (incomeMonth !== month || (state.data.migratedIncomeMonths ?? []).includes(month))
      continue;
    items.push({
      id: `legacy-${incomeMonth}`,
      date: `${incomeMonth}-01`,
      createdAt: 0,
      title: "Ingreso mensual",
      subtitle: "Ingreso",
      amountCents,
      income: true,
      category: null,
    });
  }
  const recent = items
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 5);
  dom.recentActivity.replaceChildren(
    ...groupByDay(recent).map(([date, dayItems]) => {
      const day = el("li", "day");
      const list = el("ul", "rows");
      list.append(
        ...dayItems.map((entry) => {
          const row = el("li", "row");
          const text = el("span", "row__text");
          text.append(
            el("span", "row__title", entry.title),
            el("span", "row__meta", entry.subtitle),
          );
          row.append(
            entry.category === null
              ? createBlob("arrow-in", "mint")
              : createCategoryBlob(entry.category),
            text,
            createMoney(
              entry.amountCents,
              entry.income ? "row__amount row__amount--in" : "row__amount",
              entry.income ? "+" : "−",
            ),
          );
          return row;
        }),
      );
      day.append(createDayHeading(date, "h3"), list);
      return day;
    }),
  );
  dom.recentEmpty.hidden = recent.length > 0;
}

// ---------- Inicio: presupuesto, gasto fijo, meta y reparto ----------

function isRegisteredIn(
  state: AppState,
  template: RecurringExpense,
  month: string,
): boolean {
  return (
    template.lastRunMonth === month ||
    state.data.expenses.some(
      (expense) =>
        expense.recurringId === template.id && expense.recurringMonth === month,
    )
  );
}

function dueDateOf(month: string, dayOfMonth: number): IsoDate {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`;
}

function renderHomeHighlights(state: AppState): void {
  const month = state.ui.selectedMonth;
  const spentCents = sumCents(expensesOfMonth(state.data.expenses, month));
  const budget = state.data.budgets?.[month] ?? null;
  const budgetValue = document.getElementById("home-budget-value");
  const budgetNote = document.getElementById("home-budget-note");
  const budgetMeter = document.getElementById("home-budget-meter");
  const budgetFill = document.getElementById("home-budget-fill");
  const budgetRingLabel = document.getElementById("home-budget-ring-label");
  if (
    budgetValue instanceof HTMLElement &&
    budgetNote instanceof HTMLElement &&
    budgetMeter instanceof HTMLElement &&
    budgetFill instanceof HTMLElement &&
    budgetRingLabel instanceof HTMLElement
  ) {
    if (budget === null) {
      budgetValue.textContent = "Sin límite definido";
      budgetNote.textContent = "Aún no has fijado un presupuesto.";
      budgetMeter.hidden = true;
      budgetFill.style.width = "0%";
      budgetMeter.style.setProperty("--v", "0");
      budgetRingLabel.textContent = "";
      budgetMeter.removeAttribute("aria-valuenow");
      budgetMeter.removeAttribute("aria-valuetext");
    } else {
      const usedPct =
        budget > 0
          ? Math.min(100, (spentCents / budget) * 100)
          : spentCents > 0
            ? 100
            : 0;
      const remaining = Math.max(0, budget - spentCents);
      const daily = dailyBudgetAllowance(remaining, month, getTodayIso());
      budgetValue.textContent = `Quedan ${formatMoney(remaining)}`;
      budgetNote.textContent =
        daily === null
          ? `Has usado el ${formatPercent(usedPct)} de ${formatMoney(budget)}`
          : `Unos ${formatMoney(daily)} al día hasta fin de mes`;
      budgetMeter.hidden = false;
      budgetFill.style.width = `${usedPct}%`;
      budgetMeter.style.setProperty("--v", String(usedPct));
      budgetRingLabel.textContent = formatPercent(Math.round(usedPct));
      budgetMeter.setAttribute("aria-valuenow", String(Math.round(usedPct)));
      budgetMeter.setAttribute(
        "aria-valuetext",
        `${formatPercent(usedPct)} del presupuesto utilizado`,
      );
      budgetMeter.classList.toggle(
        "ring--warning",
        spentCents >= budget * 0.75 && spentCents < budget,
      );
      budgetMeter.classList.toggle("ring--danger", spentCents >= budget);
    }
  }

  const recurring = (state.data.recurring ?? []).filter((item) => item.active);
  const today = getTodayIso();
  const todayMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  const unregistered = recurring.filter(
    (template) => !isRegisteredIn(state, template, month),
  );
  const upcoming = unregistered
    .filter(
      (template) =>
        month > todayMonth || (month === todayMonth && template.dayOfMonth > todayDay),
    )
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth)[0];
  const pending =
    month === todayMonth
      ? unregistered
          .filter((template) => template.dayOfMonth <= todayDay)
          .sort((a, b) => a.dayOfMonth - b.dayOfMonth)[0]
      : undefined;
  // Si este mes ya está todo registrado, se anuncia el primero del mes siguiente.
  const nextMonth = shiftMonth(month, 1);
  const nextMonthFirst =
    upcoming === undefined && pending === undefined && month >= todayMonth
      ? [...recurring].sort((a, b) => a.dayOfMonth - b.dayOfMonth)[0]
      : undefined;
  const nextRecurring = upcoming ?? pending ?? nextMonthFirst;
  const recurringName = document.getElementById("home-recurring-name");
  const recurringDate = document.getElementById("home-recurring-date");
  const recurringAmount = document.getElementById("home-recurring-amount");
  const recurringCal = document.getElementById("home-recurring-cal");
  const recurringCalMonth = document.getElementById("home-recurring-cal-month");
  const recurringCalDay = document.getElementById("home-recurring-cal-day");
  if (
    recurringName instanceof HTMLElement &&
    recurringDate instanceof HTMLElement &&
    recurringAmount instanceof HTMLElement &&
    recurringCal instanceof HTMLElement &&
    recurringCalMonth instanceof HTMLElement &&
    recurringCalDay instanceof HTMLElement
  ) {
    if (nextRecurring) {
      const dueDate = dueDateOf(
        nextRecurring === nextMonthFirst ? nextMonth : month,
        nextRecurring.dayOfMonth,
      );
      const [day = "", shortMonth = ""] = formatDate(dueDate).split(" ");
      recurringName.textContent = nextRecurring.name;
      recurringDate.textContent =
        nextRecurring === pending
          ? `Pendiente desde el ${formatDate(dueDate)}`
          : `Se cargará el ${formatDate(dueDate)}`;
      recurringAmount.textContent = formatMoney(nextRecurring.amountCents);
      recurringAmount.hidden = false;
      recurringCalMonth.textContent = shortMonth;
      recurringCalDay.textContent = day;
      recurringCal.hidden = false;
    } else {
      recurringName.textContent =
        recurring.length === 0 ? "Sin gastos fijos activos" : "Sin pagos pendientes";
      recurringDate.textContent = "";
      recurringAmount.textContent = "";
      recurringAmount.hidden = true;
      recurringCal.hidden = true;
    }
  }

  const goals = state.data.goals ?? [];
  const goal = goals.find((item) => item.savedCents < item.targetCents) ?? goals[0];
  const goalName = document.getElementById("home-goal-name");
  const goalNote = document.getElementById("home-goal-note");
  const goalMeter = document.getElementById("home-goal-meter");
  const goalFill = document.getElementById("home-goal-fill");
  const goalPct = document.getElementById("home-goal-pct");
  if (
    goalName instanceof HTMLElement &&
    goalNote instanceof HTMLElement &&
    goalMeter instanceof HTMLElement &&
    goalFill instanceof HTMLElement &&
    goalPct instanceof HTMLElement
  ) {
    if (goal) {
      const progress = Math.min(100, (goal.savedCents / goal.targetCents) * 100);
      goalName.textContent = goal.name;
      goalNote.textContent = `${formatMoney(goal.savedCents)} de ${formatMoney(goal.targetCents)}`;
      goalMeter.hidden = false;
      goalMeter.setAttribute("aria-label", `Progreso de la meta ${goal.name}`);
      goalMeter.style.setProperty("--v", `${progress}%`);
      goalPct.textContent = formatPercent(Math.round(progress));
      goalMeter.setAttribute("aria-valuenow", String(Math.round(progress)));
      goalMeter.setAttribute("aria-valuetext", `${formatPercent(progress)} completado`);
    } else {
      goalName.textContent = "Aún no tienes metas";
      goalNote.textContent = "Crea una meta para seguir tu ahorro.";
      goalMeter.hidden = true;
      goalMeter.style.setProperty("--v", "0%");
      goalPct.textContent = "";
      goalMeter.removeAttribute("aria-valuenow");
      goalMeter.removeAttribute("aria-valuetext");
    }
    goalFill.removeAttribute("style");
  }

  const savings = getSavingsSummary(state.data, month);
  const distributionBar = document.getElementById("income-distribution-bar");
  const distributionLegend = document.getElementById("income-distribution-legend");
  const distributionNote = document.getElementById("income-distribution-note");
  if (
    distributionBar instanceof HTMLElement &&
    distributionLegend instanceof HTMLUListElement &&
    distributionNote instanceof HTMLElement
  ) {
    const shares = categoryIncomeShares(state.data.expenses, month, savings.incomeCents);
    if (savings.incomeCents === null) {
      distributionBar.hidden = true;
      distributionLegend.replaceChildren();
      distributionNote.textContent =
        "Añade ingresos este mes para ver cómo se reparte el dinero.";
    } else {
      const series = buildSeries(
        shares.map((item) => ({
          category: item.category,
          cents: item.cents,
          pct: item.incomePct ?? 0,
        })),
        savings.savedCents !== null && savings.savedCents > 0
          ? { cents: savings.savedCents, pct: Math.max(0, savings.savingsPct ?? 0) }
          : null,
      );
      const totalPct = series.reduce((total, item) => total + item.pct, 0);
      const scale = totalPct > 100 ? 100 / totalPct : 1;
      distributionBar.replaceChildren(
        ...series.map((item) => {
          const segment = el("span", "stackbar__segment");
          segment.style.setProperty("--w", String(item.pct * scale));
          segment.style.setProperty("--c", item.color);
          return segment;
        }),
      );
      distributionBar.hidden = series.length === 0;
      distributionBar.setAttribute(
        "aria-label",
        series.map((item) => `${item.label} ${formatPercent(item.pct)}`).join(", "),
      );
      distributionNote.textContent = savings.isDeficit
        ? "Los gastos superan los ingresos de este mes."
        : "";
      distributionLegend.replaceChildren(
        ...series.map((item) => {
          const entry = el(
            "li",
            item.savings ? "legend-chip legend-chip--savings" : "legend-chip",
          );
          const swatch = el("span", "legend-chip__dot");
          swatch.style.setProperty("--c", item.color);
          swatch.setAttribute("aria-hidden", "true");
          entry.append(
            swatch,
            el("span", "", item.label),
            el("strong", "", formatPercent(item.pct)),
          );
          return entry;
        }),
      );
    }
  }
}

// ---------- Más: estado de cada sección ----------

function renderMoreStates(state: AppState): void {
  const month = state.ui.selectedMonth;
  const setText = (id: string, text: string): void => {
    const target = document.getElementById(id);
    if (target) target.textContent = text;
  };
  const savings = getSavingsSummary(state.data, month);
  setText(
    "more-income-state",
    savings.incomeCents === null
      ? `Sin ingresos en ${monthName(month)}`
      : `${formatMoney(savings.incomeCents)} en ${monthName(month)}`,
  );
  const active = (state.data.recurring ?? []).filter((item) => item.active);
  setText(
    "more-recurring-state",
    active.length === 0
      ? "Ninguno activo"
      : `${active.length} ${active.length === 1 ? "activo" : "activos"}, ${formatMoney(
          active.reduce((total, item) => total + item.amountCents, 0),
        )} al mes`,
  );
  const wallets = state.data.wallets ?? [];
  setText(
    "more-wallets-state",
    wallets.length === 0
      ? "Ninguna todavía"
      : `${wallets.length} ${wallets.length === 1 ? "cartera" : "carteras"}`,
  );
  const goals = state.data.goals ?? [];
  setText(
    "more-goals-state",
    goals.length === 0
      ? "Aún no tienes metas"
      : `${goals.length} ${goals.length === 1 ? "meta" : "metas"}`,
  );
  const budget = state.data.budgets?.[month] ?? null;
  setText(
    "more-budget-state",
    budget === null
      ? `Sin límite en ${monthName(month)}`
      : `Límite de ${formatMoney(budget)}`,
  );
}

// ---------- Presupuesto, metas, gastos fijos y carteras ----------

function createStatusPill(
  kind: "ok" | "paused" | "pending" | "soon",
  text: string,
): HTMLElement {
  const pill = el("span", `status-pill status-pill--${kind}`);
  if (kind === "ok") pill.append(createIcon("check", "icon icon--sm"));
  pill.append(el("span", "", text));
  return pill;
}

let plannerBudgetKey = "";
function renderPlanner(state: AppState): void {
  const month = state.ui.selectedMonth;
  const recurringMonthLabel = document.getElementById("recurring-month-label");
  if (recurringMonthLabel) recurringMonthLabel.textContent = monthTitle(month);
  const budget = state.data.budgets?.[month] ?? null;
  const spent = sumCents(expensesOfMonth(state.data.expenses, month));
  const budgetKey = `${month}:${budget ?? ""}`;
  const budgetInput = document.getElementById("budget-amount");
  const budgetProgress = document.getElementById("budget-progress");
  const budgetRing = document.getElementById("budget-ring");
  const budgetRingLabel = document.getElementById("budget-ring-label");
  const budgetDaily = document.getElementById("budget-daily");
  const budgetClear = document.getElementById("budget-clear");
  if (budgetInput instanceof HTMLInputElement && budgetKey !== plannerBudgetKey) {
    plannerBudgetKey = budgetKey;
    budgetInput.value = budget === null ? "" : centsToInputString(budget);
  }
  if (budgetProgress) {
    budgetProgress.textContent =
      budget === null
        ? "Aún no has fijado un límite para este mes."
        : `${formatMoney(spent)} gastados de ${formatMoney(budget)}. Te quedan ${formatMoney(Math.max(0, budget - spent))}.`;
  }
  if (budgetRing && budgetRingLabel && budgetDaily) {
    if (budget === null) {
      budgetRing.hidden = true;
      budgetDaily.hidden = true;
    } else {
      const usedPct =
        budget > 0 ? Math.min(100, (spent / budget) * 100) : spent > 0 ? 100 : 0;
      budgetRing.hidden = false;
      budgetRing.style.setProperty("--v", String(usedPct));
      budgetRing.setAttribute("aria-valuenow", String(Math.round(usedPct)));
      budgetRing.setAttribute(
        "aria-valuetext",
        `${formatPercent(usedPct)} del presupuesto utilizado`,
      );
      budgetRing.classList.toggle(
        "ring--warning",
        spent >= budget * 0.75 && spent < budget,
      );
      budgetRing.classList.toggle("ring--danger", spent >= budget);
      budgetRingLabel.textContent = formatPercent(Math.round(usedPct));
      const daily = dailyBudgetAllowance(
        Math.max(0, budget - spent),
        month,
        getTodayIso(),
      );
      budgetDaily.textContent =
        spent >= budget
          ? "Has llegado al límite de este mes."
          : daily === null
            ? ""
            : `Puedes gastar unos ${formatMoney(daily)} al día hasta fin de mes.`;
      budgetDaily.hidden = budgetDaily.textContent === "";
    }
  }
  if (budgetClear instanceof HTMLButtonElement) budgetClear.hidden = budget === null;

  const goalsList = document.getElementById("goals-list");
  const goalsEmpty = document.getElementById("goals-empty");
  const goals = state.data.goals ?? [];
  if (goalsList instanceof HTMLUListElement) {
    goalsList.replaceChildren(
      ...goals.map((goal) => {
        const progress = Math.min(100, (goal.savedCents / goal.targetCents) * 100);
        const item = el("li", "tile");
        const top = el("div", "tile__top");
        const jar = el("div", "jar jar--tile");
        jar.setAttribute("role", "progressbar");
        jar.setAttribute("aria-label", `Progreso de ${goal.name}`);
        jar.setAttribute("aria-valuemin", "0");
        jar.setAttribute("aria-valuemax", "100");
        jar.setAttribute("aria-valuenow", String(Math.round(progress)));
        jar.style.setProperty("--v", `${progress}%`);
        const jarPct = el("span", "jar__pct", formatPercent(Math.round(progress)));
        jarPct.setAttribute("aria-hidden", "true");
        jar.append(el("span", "jar__fill"), jarPct);
        top.append(jar);
        if (goal.savedCents >= goal.targetCents)
          top.append(createStatusPill("ok", "Meta cumplida"));
        const amounts = el("p", "tile__value");
        amounts.append(
          createMoney(goal.savedCents, ""),
          el("span", "tile__of", " de "),
          createMoney(goal.targetCents, "tile__of"),
        );
        const contributions = goal.contributions ?? [];
        const history = el(
          "p",
          "tile__text",
          contributions.length === 0
            ? "Sin aportaciones registradas"
            : `${contributions.length} ${contributions.length === 1 ? "aportación" : "aportaciones"}, la última el ${formatDate(contributions[contributions.length - 1]!.date)}`,
        );
        const controls = el("div", "goal-controls");
        const contribution = el("input", "field__input");
        contribution.inputMode = "decimal";
        contribution.placeholder = "Aportar €";
        contribution.autocomplete = "off";
        contribution.setAttribute("aria-label", `Aportación a ${goal.name}`);
        contribution.dataset["goalContribution"] = goal.id;
        const add = el("button", "button button--small", "Añadir ahorro");
        add.type = "button";
        add.dataset["action"] = "goal-add";
        add.dataset["id"] = goal.id;
        const remove = el("button", "icon-btn icon-btn--danger");
        remove.type = "button";
        remove.setAttribute("aria-label", `Eliminar la meta ${goal.name}`);
        remove.append(createIcon("trash", "icon icon--sm"));
        remove.dataset["action"] = "goal-delete";
        remove.dataset["id"] = goal.id;
        controls.append(contribution, add, remove);
        item.append(top, el("h2", "tile__title", goal.name), amounts, history);
        if (goal.dueDate)
          item.append(
            el("p", "tile__text", `Fecha objetivo: ${formatDate(goal.dueDate)}`),
          );
        item.append(controls);
        return item;
      }),
    );
  }
  if (goalsEmpty) goalsEmpty.hidden = goals.length > 0;

  renderRecurringTimeline(state);

  const wallets = state.data.wallets ?? [];
  const populateWalletSelect = (select: HTMLSelectElement, emptyLabel: string): void => {
    const previous = select.value;
    select.replaceChildren(
      createOption("", emptyLabel),
      ...wallets.map((wallet) => createOption(wallet.id, wallet.name)),
    );
    if (wallets.some((wallet) => wallet.id === previous)) select.value = previous;
    else if (emptyLabel === "Selecciona una cartera" && wallets[0])
      select.value = wallets[0].id;
  };
  populateWalletSelect(dom.wallet, "Sin asignar");
  for (const id of ["transfer-from", "transfer-to"]) {
    const select = document.getElementById(id);
    if (select instanceof HTMLSelectElement)
      populateWalletSelect(select, "Selecciona una cartera");
  }
  const transferTo = document.getElementById("transfer-to");
  if (
    transferTo instanceof HTMLSelectElement &&
    wallets.length > 1 &&
    transferTo.value === wallets[0]?.id
  )
    transferTo.value = wallets[1]?.id ?? "";
  const walletsList = document.getElementById("wallets-list");
  const walletsEmpty = document.getElementById("wallets-empty");
  if (walletsList instanceof HTMLUListElement) {
    walletsList.replaceChildren(
      ...wallets.map((wallet) => {
        const look = WALLET_LOOK[wallet.kind];
        const spentFromWallet = state.data.expenses
          .filter((expense) => expense.walletId === wallet.id)
          .reduce((total, expense) => total + expense.amountCents, 0);
        const outgoing = (state.data.transfers ?? [])
          .filter((transfer) => transfer.fromWalletId === wallet.id)
          .reduce((total, transfer) => total + transfer.amountCents, 0);
        const incoming = (state.data.transfers ?? [])
          .filter((transfer) => transfer.toWalletId === wallet.id)
          .reduce((total, transfer) => total + transfer.amountCents, 0);
        const item = el("li", "tile");
        const top = el("div", "tile__top");
        const remove = el("button", "icon-btn icon-btn--danger");
        remove.type = "button";
        remove.setAttribute("aria-label", `Eliminar la cartera ${wallet.name}`);
        remove.append(createIcon("trash", "icon icon--sm"));
        remove.dataset["action"] = "wallet-delete";
        remove.dataset["id"] = wallet.id;
        top.append(createBlob(look.icon, look.tone), remove);
        item.append(
          top,
          el("h2", "tile__title", wallet.name),
          createMoney(
            wallet.openingCents - spentFromWallet - outgoing + incoming,
            "tile__value",
          ),
          el(
            "p",
            "tile__text",
            `${look.label}. Saldo inicial ${formatMoney(wallet.openingCents)}`,
          ),
        );
        return item;
      }),
    );
  }
  if (walletsEmpty) walletsEmpty.hidden = wallets.length > 0;

  const transfersSection = document.getElementById("transfers-section");
  const transfersList = document.getElementById("transfers-list");
  if (transfersSection && transfersList instanceof HTMLUListElement) {
    const transfers = [...(state.data.transfers ?? [])].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
    );
    const walletName = (id: string): string =>
      wallets.find((wallet) => wallet.id === id)?.name ?? "Cartera eliminada";
    transfersList.replaceChildren(
      ...transfers.map((transfer) => {
        const row = el("li", "row");
        const text = el("span", "row__text");
        text.append(
          el(
            "span",
            "row__title",
            `De ${walletName(transfer.fromWalletId)} a ${walletName(transfer.toWalletId)}`,
          ),
          el("span", "row__meta", formatDate(transfer.date)),
        );
        row.append(
          createBlob("swap", "lilac"),
          text,
          createMoney(transfer.amountCents, "row__amount"),
        );
        return row;
      }),
    );
    transfersSection.hidden = transfers.length === 0;
  }
}

function renderRecurringTimeline(state: AppState): void {
  const month = state.ui.selectedMonth;
  const recurringList = document.getElementById("recurring-list");
  const recurringEmpty = document.getElementById("recurring-empty");
  const recurring = state.data.recurring ?? [];
  const today = getTodayIso();
  const todayMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  const unregisteredActive = recurring.filter(
    (template) => template.active && !isRegisteredIn(state, template, month),
  );
  const pendingCharge =
    month === todayMonth
      ? unregisteredActive
          .filter((template) => template.dayOfMonth <= todayDay)
          .sort((a, b) => a.dayOfMonth - b.dayOfMonth)[0]
      : undefined;
  const upcomingCharge = unregisteredActive
    .filter(
      (template) =>
        month > todayMonth || (month === todayMonth && template.dayOfMonth > todayDay),
    )
    .sort((a, b) => a.dayOfMonth - b.dayOfMonth)[0];
  const activeRecurring = recurring.filter((template) => template.active);
  const recurringTotal = activeRecurring.reduce(
    (total, template) => total + template.amountCents,
    0,
  );
  const registeredExpenses = state.data.expenses.filter(
    (expense) =>
      expense.recurringMonth === month ||
      (expense.date.slice(0, 7) === month && expense.note.startsWith("Pago fijo: ")),
  );
  const recurringTotalLabel = document.getElementById("recurring-total-month");
  const recurringRegisteredLabel = document.getElementById("recurring-registered-month");
  const recurringNextLabel = document.getElementById("recurring-next-charge");
  if (recurringTotalLabel) recurringTotalLabel.textContent = formatMoney(recurringTotal);
  if (recurringRegisteredLabel)
    recurringRegisteredLabel.textContent = formatMoney(sumCents(registeredExpenses));
  if (recurringNextLabel) {
    recurringNextLabel.textContent = upcomingCharge
      ? formatDate(dueDateOf(month, upcomingCharge.dayOfMonth))
      : pendingCharge
        ? `Pendiente: ${formatDate(dueDateOf(month, pendingCharge.dayOfMonth))}`
        : "Nada pendiente";
    recurringNextLabel.title = recurringNextLabel.textContent;
  }
  if (!(recurringList instanceof HTMLOListElement)) return;

  const ordered = [...recurring].sort(
    (a, b) => a.dayOfMonth - b.dayOfMonth || a.name.localeCompare(b.name, "es"),
  );
  const rows: HTMLLIElement[] = [];
  let todayAdded = false;
  const appendToday = (): void => {
    const remaining = unregisteredActive.filter(
      (item) => item.dayOfMonth > todayDay,
    ).length;
    const row = el("li", "tl tl--today");
    const badge = el("span", "tl__day tl__day--today", String(todayDay));
    badge.setAttribute("aria-hidden", "true");
    const text = el("p", "tl__text");
    text.append(
      el("strong", "", "Hoy. "),
      remaining === 0
        ? "No quedan cargos este mes."
        : `${remaining === 1 ? "Queda 1 cargo" : `Quedan ${remaining} cargos`} este mes.`,
    );
    row.append(badge, text);
    rows.push(row);
    todayAdded = true;
  };
  for (const template of ordered) {
    if (month === todayMonth && !todayAdded && template.dayOfMonth > todayDay)
      appendToday();
    rows.push(createRecurringRow(state, template, month, todayMonth, todayDay));
  }
  if (month === todayMonth && ordered.length > 0 && !todayAdded) appendToday();

  // Anticipa lo que se registrará el mes siguiente.
  if (month >= todayMonth && activeRecurring.length > 0) {
    const nextMonth = shiftMonth(month, 1);
    const firstDay = Math.min(...activeRecurring.map((item) => item.dayOfMonth));
    const row = el("li", "tl tl--next");
    const badge = el("span", "tl__day tl__day--next", String(firstDay));
    badge.setAttribute("aria-hidden", "true");
    const text = el("p", "tl__text");
    text.append(
      `En ${formatMonth(nextMonth)} se registrarán ${activeRecurring.length} ${activeRecurring.length === 1 ? "gasto fijo" : "gastos fijos"}, `,
      createMoney(recurringTotal, ""),
      ".",
    );
    row.append(badge, text);
    rows.push(row);
  }
  recurringList.replaceChildren(...rows);
  if (recurringEmpty) recurringEmpty.hidden = recurring.length > 0;
}

function createRecurringRow(
  state: AppState,
  template: RecurringExpense,
  month: string,
  todayMonth: string,
  todayDay: number,
): HTMLLIElement {
  const row = el("li", "tl");
  const dayBadge = el("span", "tl__day", String(template.dayOfMonth));
  dayBadge.setAttribute("aria-hidden", "true");
  const card = el("article", "tl__card recurring-card");
  const recordedExpense = state.data.expenses.find(
    (expense) => expense.recurringId === template.id && expense.recurringMonth === month,
  );
  const registered =
    isRegisteredIn(state, template, month) || recordedExpense !== undefined;
  const dueLabel = formatDate(dueDateOf(month, template.dayOfMonth));
  const status = !template.active
    ? createStatusPill("paused", "Pausado")
    : registered
      ? createStatusPill(
          "ok",
          recordedExpense
            ? `Registrado el ${formatDate(recordedExpense.date)}`
            : "Registrado este mes",
        )
      : month === todayMonth && template.dayOfMonth <= todayDay
        ? createStatusPill("pending", `Pendiente: ${dueLabel}`)
        : createStatusPill("soon", `Próximo: ${dueLabel}`);

  const menuButton = (
    action: string,
    label: string,
    ariaLabel: string,
    danger = false,
  ): HTMLButtonElement => {
    const button = el(
      "button",
      danger ? "row-menu__item row-menu__item--danger" : "row-menu__item",
      label,
    );
    button.type = "button";
    button.setAttribute("aria-label", ariaLabel);
    button.dataset["action"] = action;
    button.dataset["id"] = template.id;
    return button;
  };
  const run = menuButton(
    "recurring-run",
    "Registrar este mes",
    `Registrar ${template.name} este mes`,
  );
  run.disabled = !template.active || registered;
  const edit = menuButton("recurring-edit", "Editar", `Editar ${template.name}`);
  const toggle = menuButton(
    "recurring-toggle",
    template.active ? "Pausar" : "Activar",
    `${template.active ? "Pausar" : "Activar"} ${template.name}`,
  );
  toggle.dataset["active"] = String(!template.active);
  const remove = menuButton(
    "recurring-delete",
    "Eliminar",
    `Eliminar ${template.name}`,
    true,
  );
  const menu = el("details", "recurring-menu row-menu");
  const menuToggle = el("summary", "icon-btn row-menu__toggle");
  menuToggle.setAttribute("aria-label", `Opciones de ${template.name}`);
  menuToggle.append(createIcon("more"));
  const menuItems = el("div", "row-menu__items");
  menuItems.append(run, edit, toggle, remove);
  menu.append(menuToggle, menuItems);

  const text = el("div", "row__text");
  text.append(
    el("h3", "row__title", template.name),
    el(
      "p",
      "row__meta",
      `${CATEGORIES[template.category].label}, día ${template.dayOfMonth}`,
    ),
  );
  const view = el("div", "recurring-card__view");
  view.append(
    createCategoryBlob(template.category),
    text,
    status,
    createMoney(template.amountCents, "row__amount"),
    menu,
  );

  const editForm = el("div", "recurring-edit-form");
  editForm.hidden = true;
  editForm.setAttribute("role", "group");
  editForm.setAttribute("aria-label", `Editar gasto fijo ${template.name}`);
  const createEditField = (
    field: "name" | "amount" | "day",
    labelText: string,
    value: string,
    type: string,
  ): HTMLInputElement => {
    const fieldWrap = el("div", "field");
    const input = el("input", "field__input");
    input.type = type;
    input.value = value;
    input.required = true;
    input.dataset["recurringField"] = field;
    input.id = `recurring-${field}-${template.id}`;
    if (field === "name") input.maxLength = 60;
    if (field === "amount") input.inputMode = "decimal";
    if (field === "day") {
      input.min = "1";
      input.max = "28";
    }
    const label = el("label", "field__label", labelText);
    label.htmlFor = input.id;
    fieldWrap.append(label, input);
    editForm.append(fieldWrap);
    return input;
  };
  createEditField("name", "Título", template.name, "text");
  createEditField(
    "amount",
    "Importe (€)",
    centsToInputString(template.amountCents),
    "text",
  );
  const editCategoryWrap = el("div", "field");
  const editCategory = el("select", "field__input");
  editCategory.dataset["recurringField"] = "category";
  editCategory.id = `recurring-category-${template.id}`;
  editCategory.replaceChildren(
    ...CATEGORY_KEYS.map((categoryKey) => {
      const option = createOption(categoryKey, CATEGORIES[categoryKey].label);
      option.selected = categoryKey === template.category;
      return option;
    }),
  );
  const editCategoryLabel = el("label", "field__label", "Categoría");
  editCategoryLabel.htmlFor = editCategory.id;
  editCategoryWrap.append(editCategoryLabel, editCategory);
  editForm.append(editCategoryWrap);
  createEditField("day", "Día del mes", String(template.dayOfMonth), "number");
  const editError = el("p", "form__error recurring-edit-form__error");
  editError.setAttribute("role", "alert");
  editError.dataset["recurringError"] = "true";
  editError.hidden = true;
  editForm.append(editError);
  const editActions = el("div", "button-group recurring-edit-form__actions");
  const save = el("button", "button button--small", "Guardar cambios");
  save.type = "button";
  save.dataset["action"] = "recurring-save";
  save.dataset["id"] = template.id;
  const cancel = el("button", "button button--ghost button--small", "Cancelar");
  cancel.type = "button";
  cancel.dataset["action"] = "recurring-cancel";
  cancel.dataset["id"] = template.id;
  editActions.append(save, cancel);
  editForm.append(editActions);
  card.append(view, editForm);
  row.append(dayBadge, card);
  return row;
}

/** Sincroniza toda la pantalla con el estado. */
export function renderApp(state: AppState): void {
  const today = getTodayIso();
  dom.currentDate.dateTime = today;
  dom.currentDate.textContent = `Hoy es ${formatDate(today)}`;
  dom.monthSelect.value = state.ui.selectedMonth;
  dom.filterCategory.value = state.ui.categoryFilter;
  syncFilterChips();
  renderIncome(state);
  renderIncomeEntries(state);
  renderSummary(state);
  renderExpenseList(state);
  renderRecentActivity(state);
  renderHomeHighlights(state);
  renderMoreStates(state);
  renderPlanner(state);
}
