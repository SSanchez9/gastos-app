import {
  compareWithPreviousMonth,
  expensesOfMonth,
  filterExpenses,
  getPreviousIncome,
  getSavingsSummary,
  sumCents,
  totalsByCategory,
} from "./calc";
import type { MonthComparison } from "./calc";
import { CATEGORIES, CATEGORY_KEYS, isCategoryKey } from "./config";
import {
  centsToInputString,
  eurosToCents,
  formatDate,
  formatMoney,
  formatMonth,
  formatPercent,
  getTodayIso,
} from "./format";
import type { AppState, CategoryKey, Expense, NewExpense, Result } from "./types";

export function getElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`No se encontró #${id} o no es del tipo esperado`);
  }
  return element;
}

export const dom = {
  monthSelect: getElement("month-select", HTMLInputElement),
  saveWarning: getElement("save-warning", HTMLParagraphElement),
  income: getElement("summary-income", HTMLParagraphElement),
  spent: getElement("summary-spent", HTMLParagraphElement),
  spentCompare: getElement("summary-spent-compare", HTMLParagraphElement),
  saved: getElement("summary-saved", HTMLParagraphElement),
  savedNote: getElement("summary-saved-note", HTMLParagraphElement),
  savingsPct: getElement("summary-savings-pct", HTMLParagraphElement),
  categoryTotals: getElement("category-totals", HTMLUListElement),
  categoryEmpty: getElement("category-empty", HTMLParagraphElement),
  incomeForm: getElement("income-form", HTMLFormElement),
  incomeAmount: getElement("income-amount", HTMLInputElement),
  incomeError: getElement("income-error", HTMLParagraphElement),
  incomeStatus: getElement("income-status", HTMLParagraphElement),
  incomeCopy: getElement("income-copy", HTMLButtonElement),
  incomeClear: getElement("income-clear", HTMLButtonElement),
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
  tableWrap: getElement("expense-table-wrap", HTMLDivElement),
  rows: getElement("expense-rows", HTMLTableSectionElement),
  listEmpty: getElement("list-empty", HTMLParagraphElement),
};

function createOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

/** Rellena los desplegables de categoría a partir de config.ts. */
export function initCategorySelects(): void {
  dom.category.replaceChildren(
    ...CATEGORY_KEYS.map((key) => createOption(key, CATEGORIES[key].label)),
  );
  dom.filterCategory.replaceChildren(
    createOption("all", "Todas"),
    ...CATEGORY_KEYS.map((key) => createOption(key, CATEGORIES[key].label)),
  );
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
    value: { amountCents, category, date: dom.date.value, note: dom.note.value },
  };
}

export function setEditMode(editing: boolean): void {
  dom.formTitle.textContent = editing ? "Editar gasto" : "Añadir gasto";
  dom.submit.textContent = editing ? "Guardar cambios" : "Añadir gasto";
  dom.cancel.hidden = !editing;
}

/** Carga un gasto en el formulario para editarlo. */
export function fillForm(expense: Expense): void {
  dom.amount.value = centsToInputString(expense.amountCents);
  dom.date.value = expense.date;
  dom.category.value = expense.category;
  dom.note.value = expense.note;
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
  clearFormError();
  dom.amount.focus();
}

// ---------- Formulario del sueldo ----------

export function showIncomeError(message: string): void {
  dom.incomeError.textContent = message;
  dom.incomeError.hidden = false;
}

export function clearIncomeError(): void {
  dom.incomeError.textContent = "";
  dom.incomeError.hidden = true;
}

/** Lee el campo del sueldo. La validación completa la repite state.ts. */
export function readIncomeForm(): Result<number> {
  const cents = eurosToCents(dom.incomeAmount.value);
  if (cents === null) {
    return { ok: false, error: "Introduce un importe válido, por ejemplo 2.150,00." };
  }
  return { ok: true, value: cents };
}

/** Clave del último valor volcado al campo: evita pisar lo que el usuario está escribiendo. */
let incomeFieldKey = "";

function renderIncome(state: AppState): void {
  const month = state.ui.selectedMonth;
  const savings = getSavingsSummary(state.data, month);
  const previous = getPreviousIncome(state.data.income, month);

  // Tarjetas del resumen
  dom.income.textContent =
    savings.incomeCents === null ? "—" : formatMoney(savings.incomeCents);
  dom.saved.textContent =
    savings.savedCents === null ? "—" : formatMoney(savings.savedCents);
  dom.savingsPct.textContent =
    savings.savingsPct === null ? "—" : formatPercent(savings.savingsPct);

  let noteText = "";
  let noteKind: "none" | "deficit" = "none";
  if (savings.incomeCents === null) {
    noteText = "Registra el sueldo del mes para calcular el ahorro.";
  } else if (savings.isDeficit) {
    noteText = "Has gastado más de lo que ingresaste este mes.";
    noteKind = "deficit";
  }
  dom.savedNote.textContent = noteText;
  dom.savedNote.className = `card__note card__note--${noteKind}`;

  // Campo del sueldo: solo se reescribe al cambiar de mes o de sueldo guardado
  const key = `${month}|${savings.incomeCents ?? ""}`;
  if (key !== incomeFieldKey) {
    incomeFieldKey = key;
    dom.incomeAmount.value =
      savings.incomeCents === null ? "" : centsToInputString(savings.incomeCents);
    clearIncomeError();
  }

  dom.incomeStatus.textContent =
    savings.incomeCents === null
      ? "Aún no has registrado el sueldo de este mes."
      : `Sueldo de ${formatMonth(month)}: ${formatMoney(savings.incomeCents)}.`;

  dom.incomeCopy.hidden = !(savings.incomeCents === null && previous !== null);
  if (previous !== null) {
    dom.incomeCopy.textContent = `Usar el de ${formatMonth(previous.month)} (${formatMoney(previous.cents)})`;
  }
  dom.incomeClear.hidden = savings.incomeCents === null;
}

// ---------- Resumen de gastos ----------

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
    return { text: `Igual que en ${previousName}.`, trend: "flat" };
  }
  if (diffCents > 0) {
    return {
      text: `${formatMoney(diffCents)} más que en ${previousName} (+${formatPercent(diffPct)})`,
      trend: "up",
    };
  }
  return {
    text: `${formatMoney(-diffCents)} menos que en ${previousName} (-${formatPercent(-diffPct)})`,
    trend: "down",
  };
}

function createBreakdownItem(
  category: CategoryKey,
  cents: number,
  pct: number,
): HTMLLIElement {
  const info = CATEGORIES[category];

  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.backgroundColor = info.color;
  dot.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "breakdown__name";
  name.textContent = info.label;

  const amount = document.createElement("span");
  amount.className = "breakdown__amount";
  amount.textContent = formatMoney(cents);

  const percentage = document.createElement("span");
  percentage.className = "breakdown__pct";
  percentage.textContent = formatPercent(pct);

  const head = document.createElement("div");
  head.className = "breakdown__head";
  head.append(dot, name, amount, percentage);

  const fill = document.createElement("span");
  fill.style.width = `${pct}%`;
  fill.style.backgroundColor = info.color;

  const bar = document.createElement("div");
  bar.className = "breakdown__bar";
  bar.setAttribute("aria-hidden", "true");
  bar.append(fill);

  const item = document.createElement("li");
  item.className = "breakdown__item";
  item.append(head, bar);
  return item;
}

function renderSummary(state: AppState): void {
  const month = state.ui.selectedMonth;
  const expenses = state.data.expenses;

  dom.spent.textContent = formatMoney(sumCents(expensesOfMonth(expenses, month)));

  const comparison = describeComparison(compareWithPreviousMonth(expenses, month));
  dom.spentCompare.textContent = comparison.text;
  dom.spentCompare.className = `card__note card__note--${comparison.trend}`;

  const totals = totalsByCategory(expenses, month);
  dom.categoryTotals.replaceChildren(
    ...totals.map((item) => createBreakdownItem(item.category, item.cents, item.pct)),
  );
  dom.categoryTotals.hidden = totals.length === 0;
  dom.categoryEmpty.hidden = totals.length > 0;
}

// ---------- Lista ----------

function createCell(text: string, className?: string): HTMLTableCellElement {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className !== undefined) cell.className = className;
  return cell;
}

function createCategoryCell(category: CategoryKey): HTMLTableCellElement {
  const cell = document.createElement("td");
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.backgroundColor = CATEGORIES[category].color;
  dot.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.textContent = CATEGORIES[category].label;
  cell.append(dot, label);
  return cell;
}

function createActionButton(
  action: "edit" | "delete",
  expense: Expense,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    action === "edit"
      ? "button button--secondary button--small"
      : "button button--secondary button--small button--danger";
  button.textContent = action === "edit" ? "Editar" : "Eliminar";
  button.dataset["action"] = action;
  button.dataset["id"] = expense.id;
  const verb = action === "edit" ? "Editar" : "Eliminar";
  button.setAttribute(
    "aria-label",
    `${verb} gasto de ${formatMoney(expense.amountCents)} del ${formatDate(expense.date)}`,
  );
  return button;
}

function createRow(expense: Expense): HTMLTableRowElement {
  const row = document.createElement("tr");
  const actions = document.createElement("td");
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "actions";
  actionsWrap.append(
    createActionButton("edit", expense),
    createActionButton("delete", expense),
  );
  actions.append(actionsWrap);

  row.append(
    createCell(formatDate(expense.date)),
    createCategoryCell(expense.category),
    createCell(expense.note === "" ? "—" : expense.note),
    createCell(formatMoney(expense.amountCents), "num"),
    actions,
  );
  return row;
}

function renderExpenseList(state: AppState): void {
  const { selectedMonth, categoryFilter } = state.ui;
  const expenses = filterExpenses(state.data.expenses, selectedMonth, categoryFilter);

  dom.rows.replaceChildren(...expenses.map(createRow));
  dom.tableWrap.hidden = expenses.length === 0;
  dom.listEmpty.hidden = expenses.length > 0;
  dom.listEmpty.textContent =
    categoryFilter === "all"
      ? "No hay gastos en este mes."
      : "No hay gastos de esta categoría en este mes.";
}

/** Sincroniza toda la pantalla con el estado. */
export function renderApp(state: AppState): void {
  dom.monthSelect.value = state.ui.selectedMonth;
  dom.filterCategory.value = state.ui.categoryFilter;
  dom.saveWarning.hidden = !state.saveFailed;
  renderIncome(state);
  renderSummary(state);
  renderExpenseList(state);
}
