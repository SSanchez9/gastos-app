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
  income: getElement("summary-income", HTMLParagraphElement),
  spent: getElement("summary-spent", HTMLParagraphElement),
  spentCompare: getElement("summary-spent-compare", HTMLParagraphElement),
  saved: getElement("summary-saved", HTMLParagraphElement),
  savedNote: getElement("summary-saved-note", HTMLParagraphElement),
  savingsPct: getElement("summary-savings-pct", HTMLParagraphElement),
  categoryTotals: getElement("category-totals", HTMLUListElement),
  categoryEmpty: getElement("category-empty", HTMLParagraphElement),
  breakdownTotal: getElement("breakdown-total", HTMLElement),
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
  categoryPicker: getElement("expense-category-picker", HTMLDivElement),
  wallet: getElement("expense-wallet", HTMLSelectElement),
  currentDate: getElement("current-date", HTMLTimeElement),
  balance: getElement("summary-balance", HTMLHeadingElement),
  balanceNote: getElement("summary-balance-note", HTMLParagraphElement),
  balanceIncome: getElement("balance-income", HTMLElement),
  balanceSpent: getElement("balance-spent", HTMLElement),
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
    createOption("all", "Todos"),
    ...CATEGORY_KEYS.map((key) => createOption(key, CATEGORIES[key].label)),
  );
  dom.categoryPicker.replaceChildren(
    ...CATEGORY_KEYS.map((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-chip";
      button.textContent = CATEGORIES[category].label;
      button.dataset["category"] = category;
      button.setAttribute("aria-pressed", "false");
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
    value: { amountCents, category, date: dom.date.value, note: dom.note.value, ...(dom.wallet.value ? { walletId: dom.wallet.value } : {}) },
  };
}

export function setEditMode(editing: boolean): void {
  dom.formTitle.textContent = editing ? "Editar movimiento" : "Añadir movimiento";
  dom.submit.textContent = editing ? "Guardar cambios" : "Añadir";
  dom.cancel.hidden = !editing;
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
  dom.balance.textContent =
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
        : "Tu balance está en positivo este mes.";
  dom.balanceNote.className = savings.isDeficit
    ? "balance-card__status balance-card__status--negative"
    : "balance-card__status";
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

  const spentCents = sumCents(expensesOfMonth(expenses, month));
  dom.spent.textContent = formatMoney(spentCents);
  dom.breakdownTotal.textContent = formatMoney(spentCents);

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
  const details = createCell("", "expense-row__details");
  details.colSpan = 3;
  const heading = document.createElement("div");
  heading.className = "expense-row__heading";
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.backgroundColor = CATEGORIES[expense.category].color;
  dot.setAttribute("aria-hidden", "true");
  const category = document.createElement("span");
  category.className = "expense-row__category";
  category.textContent = CATEGORIES[expense.category].label;
  heading.append(dot, category);

  const meta = document.createElement("span");
  meta.className = "expense-row__meta";
  meta.textContent =
    expense.note === ""
      ? formatDate(expense.date)
      : `${formatDate(expense.date)} · ${expense.note}`;
  details.append(heading, meta);

  const amount = createCell(formatMoney(expense.amountCents), "expense-row__amount");
  const actions = document.createElement("td");
  actions.className = "expense-row__actions";
  const actionsWrap = document.createElement("div");
  actionsWrap.className = "actions";
  actionsWrap.append(
    createActionButton("edit", expense),
    createActionButton("delete", expense),
  );
  actions.append(actionsWrap);

  row.append(details, amount, actions);
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

let plannerBudgetKey = "";
function renderPlanner(state: AppState): void {
  const month = state.ui.selectedMonth;
  const budget = state.data.budgets?.[month] ?? null;
  const spent = sumCents(expensesOfMonth(state.data.expenses, month));
  const budgetKey = `${month}:${budget ?? ""}`;
  const budgetInput = document.getElementById("budget-amount");
  const budgetProgress = document.getElementById("budget-progress");
  const budgetFill = document.getElementById("budget-meter-fill");
  const budgetClear = document.getElementById("budget-clear");
  if (budgetInput instanceof HTMLInputElement && budgetKey !== plannerBudgetKey) {
    plannerBudgetKey = budgetKey;
    budgetInput.value = budget === null ? "" : centsToInputString(budget);
  }
  if (budgetProgress) {
    budgetProgress.textContent = budget === null
      ? "Aún no has fijado un límite para este mes."
      : `${formatMoney(spent)} gastados de ${formatMoney(budget)} · ${formatMoney(Math.max(0, budget - spent))} disponibles`;
  }
  if (budgetFill instanceof HTMLElement && budget !== null) {
    budgetFill.style.width = `${Math.min(100, (spent / budget) * 100)}%`;
    budgetFill.parentElement?.classList.toggle("budget-meter--warning", spent >= budget * 0.75 && spent < budget);
    budgetFill.parentElement?.classList.toggle("budget-meter--danger", spent >= budget);
  } else if (budgetFill instanceof HTMLElement) {
    budgetFill.style.width = "0%";
    budgetFill.parentElement?.classList.remove("budget-meter--warning", "budget-meter--danger");
  }
  if (budgetClear instanceof HTMLButtonElement) budgetClear.hidden = budget === null;

  const goalsList = document.getElementById("goals-list");
  const goalsEmpty = document.getElementById("goals-empty");
  const goals = state.data.goals ?? [];
  if (goalsList instanceof HTMLUListElement) {
    goalsList.replaceChildren(...goals.map((goal) => {
      const item = document.createElement("li"); item.className = "planner-item";
      const top = document.createElement("div"); top.className = "planner-item__top";
      const name = document.createElement("span"); name.className = "planner-item__name"; name.textContent = goal.name;
      const amount = document.createElement("span"); amount.className = "planner-item__meta"; amount.textContent = `${formatMoney(goal.savedCents)} / ${formatMoney(goal.targetCents)}`;
      top.append(name, amount);
      const meter = document.createElement("div"); meter.className = "budget-meter";
      const fill = document.createElement("span"); fill.style.width = `${Math.min(100, (goal.savedCents / goal.targetCents) * 100)}%`; meter.append(fill);
      const controls = document.createElement("div"); controls.className = "planner-item__actions";
      const contribution = document.createElement("input"); contribution.className = "field__input"; contribution.inputMode = "decimal"; contribution.placeholder = "Aportar €"; contribution.setAttribute("aria-label", `Aportación a ${goal.name}`); contribution.dataset["goalContribution"] = goal.id;
      const add = document.createElement("button"); add.type = "button"; add.className = "button button--small"; add.textContent = "Añadir ahorro"; add.dataset["action"] = "goal-add"; add.dataset["id"] = goal.id;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button--secondary button--small button--danger"; remove.textContent = "Eliminar"; remove.dataset["action"] = "goal-delete"; remove.dataset["id"] = goal.id;
      controls.append(contribution, add, remove); item.append(top, meter, controls);
      if (goal.dueDate) { const due = document.createElement("p"); due.className = "planner-item__meta"; due.textContent = `Fecha objetivo: ${formatDate(goal.dueDate)}`; item.append(due); }
      return item;
    }));
  }
  if (goalsEmpty) goalsEmpty.hidden = goals.length > 0;

  const recurringList = document.getElementById("recurring-list");
  const recurringEmpty = document.getElementById("recurring-empty");
  const recurring = state.data.recurring ?? [];
  if (recurringList instanceof HTMLUListElement) {
    recurringList.replaceChildren(...recurring.map((template) => {
      const item = document.createElement("li"); item.className = "planner-item";
      const top = document.createElement("div"); top.className = "planner-item__top";
      const name = document.createElement("span"); name.className = "planner-item__name"; name.textContent = template.name;
      const amount = document.createElement("span"); amount.className = "planner-item__meta"; amount.textContent = `${formatMoney(template.amountCents)} · día ${template.dayOfMonth}`;
      top.append(name, amount);
      const meta = document.createElement("p"); meta.className = "planner-item__meta"; meta.textContent = template.active ? (template.lastRunMonth === month ? "Ya registrado este mes" : `Pendiente para ${formatMonth(month)}`) : "Pausado";
      const controls = document.createElement("div"); controls.className = "planner-item__actions";
      const run = document.createElement("button"); run.type = "button"; run.className = "button button--small"; run.textContent = "Registrar este mes"; run.dataset["action"] = "recurring-run"; run.dataset["id"] = template.id; run.disabled = !template.active || template.lastRunMonth === month;
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "button button--secondary button--small"; toggle.textContent = template.active ? "Pausar" : "Activar"; toggle.dataset["action"] = "recurring-toggle"; toggle.dataset["id"] = template.id; toggle.dataset["active"] = String(!template.active);
      controls.append(run, toggle); item.append(top, meta, controls); return item;
    }));
  }
  if (recurringEmpty) recurringEmpty.hidden = recurring.length > 0;

  const wallets = state.data.wallets ?? [];
  const populateWalletSelect = (select: HTMLSelectElement, emptyLabel: string): void => {
    const previous = select.value;
    const empty = document.createElement("option"); empty.value = ""; empty.textContent = emptyLabel;
    select.replaceChildren(empty, ...wallets.map((wallet) => { const option = document.createElement("option"); option.value = wallet.id; option.textContent = wallet.name; return option; }));
    if (wallets.some((wallet) => wallet.id === previous)) select.value = previous;
    else if (emptyLabel === "Selecciona una cartera" && wallets[0]) select.value = wallets[0].id;
  };
  populateWalletSelect(dom.wallet, "Sin asignar");
  for (const id of ["transfer-from", "transfer-to"]) {
    const select = document.getElementById(id);
    if (select instanceof HTMLSelectElement) populateWalletSelect(select, "Selecciona una cartera");
  }
  const transferTo = document.getElementById("transfer-to");
  if (transferTo instanceof HTMLSelectElement && wallets.length > 1 && transferTo.value === wallets[0]?.id) transferTo.value = wallets[1]?.id ?? "";
  const walletsList = document.getElementById("wallets-list");
  const walletsEmpty = document.getElementById("wallets-empty");
  if (walletsList instanceof HTMLUListElement) {
    walletsList.replaceChildren(...wallets.map((wallet) => {
      const item = document.createElement("li"); item.className = "planner-item";
      const top = document.createElement("div"); top.className = "planner-item__top";
      const name = document.createElement("span"); name.className = "planner-item__name"; name.textContent = wallet.name;
      const balance = document.createElement("strong"); balance.className = "planner-item__meta";
      const spent = state.data.expenses.filter((expense) => expense.walletId === wallet.id).reduce((total, expense) => total + expense.amountCents, 0);
      const outgoing = (state.data.transfers ?? []).filter((transfer) => transfer.fromWalletId === wallet.id).reduce((total, transfer) => total + transfer.amountCents, 0);
      const incoming = (state.data.transfers ?? []).filter((transfer) => transfer.toWalletId === wallet.id).reduce((total, transfer) => total + transfer.amountCents, 0);
      balance.textContent = formatMoney(wallet.openingCents - spent - outgoing + incoming);
      top.append(name, balance);
      const type = document.createElement("p"); type.className = "planner-item__meta"; type.textContent = `${wallet.kind === "cash" ? "Efectivo" : wallet.kind === "bank" ? "Banco" : wallet.kind === "card" ? "Tarjeta" : wallet.kind === "savings" ? "Ahorro" : "Inversión"} · saldo inicial ${formatMoney(wallet.openingCents)}`;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button button--secondary button--small button--danger"; remove.textContent = "Eliminar cartera"; remove.dataset["action"] = "wallet-delete"; remove.dataset["id"] = wallet.id;
      const controls = document.createElement("div"); controls.className = "planner-item__actions"; controls.append(remove);
      item.append(top, type, controls); return item;
    }));
  }
  if (walletsEmpty) walletsEmpty.hidden = wallets.length > 0;
}

/** Sincroniza toda la pantalla con el estado. */
export function renderApp(state: AppState): void {
  const today = new Date();
  const localDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  dom.currentDate.dateTime = localDate;
  dom.currentDate.textContent = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(today);
  dom.monthSelect.value = state.ui.selectedMonth;
  dom.filterCategory.value = state.ui.categoryFilter;
  renderIncome(state);
  renderSummary(state);
  renderExpenseList(state);
  renderPlanner(state);
}
