/** En este archivo se gestionan las interacciones con la interfaz de usuario. Es lo que toca el DOM*/
import { CATEGORIES, CATEGORY_KEYS, isCategoryKey } from "./config";
import { filterExpenses } from "./calc";
import {
  centsToInputString,
  eurosToCents,
  formatDate,
  formatMoney,
  getTodayIso,
} from "./format";
import type { AppState, CategoryKey, Expense, NewExpense, Result } from "./types";

function getElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`No se encontró #${id} o no es del tipo esperado`);
  }
  return element;
}

export const dom = {
  monthSelect: getElement("month-select", HTMLInputElement),
  saveWarning: getElement("save-warning", HTMLParagraphElement),
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

// ---------- Formulario ----------

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
  renderExpenseList(state);
}
