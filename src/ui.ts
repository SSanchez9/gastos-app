import {
  compareWithPreviousMonth,
  categoryIncomeShares,
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
  income: getElement("summary-income", HTMLElement),
  spent: getElement("summary-spent", HTMLParagraphElement),
  spentCompare: getElement("summary-spent-compare", HTMLParagraphElement),
  saved: getElement("summary-saved", HTMLParagraphElement),
  savedNote: getElement("summary-saved-note", HTMLParagraphElement),
  savingsPct: getElement("summary-savings-pct", HTMLElement),
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
  remaining: getElement("summary-remaining", HTMLElement),
  remainingCard: getElement("summary-remaining-card", HTMLElement),
  recentActivity: getElement("recent-activity", HTMLUListElement),
  recentEmpty: getElement("recent-empty", HTMLParagraphElement),
  eyeToggle: getElement("hide-amounts", HTMLButtonElement),
  quickEntry: getElement("quick-entry-input", HTMLInputElement),
  quickEntryPanel: getElement("quick-entry-panel", HTMLDivElement),
  completeExpense: getElement("show-complete-expense", HTMLButtonElement),
};

export function setAmountsHidden(hidden: boolean): void {
  document.body.classList.toggle("amounts-hidden", hidden);
  dom.eyeToggle.setAttribute("aria-pressed", String(hidden));
  dom.eyeToggle.setAttribute(
    "aria-label",
    hidden ? "Mostrar importes" : "Ocultar importes",
  );
}

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

function renderIncome(state: AppState): void {
  const month = state.ui.selectedMonth;
  const savings = getSavingsSummary(state.data, month);
  const monthLabel = formatMonth(month).replace(" de ", " ");
  const incomeMonthLabel = document.getElementById("income-month-label");
  const incomeTotalMonth = document.getElementById("income-total-month");
  const capitalizedMonthLabel =
    monthLabel.charAt(0).toLocaleUpperCase("es") + monthLabel.slice(1);
  if (incomeMonthLabel) incomeMonthLabel.textContent = capitalizedMonthLabel;
  if (incomeTotalMonth) incomeTotalMonth.textContent = monthLabel;

  // Tarjetas del resumen
  dom.income.textContent =
    savings.incomeCents === null ? "—" : formatMoney(savings.incomeCents);
  dom.saved.textContent =
    savings.savedCents === null ? "—" : formatMoney(savings.savedCents);
  const balanceText = savings.savedCents === null ? "—" : formatMoney(savings.savedCents);
  dom.balance.replaceChildren();
  const decimalIndex = balanceText.lastIndexOf(",");
  if (decimalIndex < 0) dom.balance.textContent = balanceText;
  else {
    const integer = document.createElement("span");
    integer.textContent = balanceText.slice(0, decimalIndex);
    const decimals = document.createElement("span");
    decimals.className = "balance-card__decimals";
    decimals.textContent = balanceText.slice(decimalIndex);
    dom.balance.append(integer, decimals);
  }
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
        : "Tu balance está en positivo este mes.";
  dom.balanceNote.className = savings.isDeficit
    ? "balance-card__status balance-card__status--negative"
    : "balance-card__status";
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
        const item = document.createElement("li");
        item.className = "income-item";
        const icon = document.createElement("span");
        icon.className = "income-item__icon";
        icon.setAttribute("aria-hidden", "true");
        const iconSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        iconSvg.setAttribute("viewBox", "0 0 24 24");
        const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        iconPath.setAttribute("d", "M7 17 17 7M8 7h9v9");
        iconSvg.append(iconPath);
        icon.append(iconSvg);
        const detail = document.createElement("span");
        detail.className = "income-item__detail";
        const title = document.createElement("strong");
        title.textContent = entry.title;
        const date = document.createElement("small");
        date.textContent = entry.dateLabel;
        detail.append(title, date);
        const amount = document.createElement("span");
        amount.className = "income-item__amount";
        amount.textContent = `+${formatMoney(entry.amountCents)}`;
        const actions = document.createElement("div");
        actions.className = "income-item__actions";
        for (const [action, label] of [
          ["income-edit", "Editar"],
          ["income-delete", "Eliminar"],
        ] as const) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `button button--secondary income-item__action income-item__action--${action}`;
          button.dataset["action"] = action;
          button.dataset["id"] = entry.id;
          button.setAttribute("aria-label", `${label} ${entry.title}`);
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("viewBox", "0 0 24 24");
          svg.setAttribute("aria-hidden", "true");
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute(
            "d",
            action === "income-edit"
              ? "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"
              : "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6",
          );
          svg.append(path);
          button.append(svg);
          actions.append(button);
        }
        item.append(icon, detail, amount, actions);
        return item;
      }),
    );
  }
  if (empty instanceof HTMLParagraphElement) empty.hidden = count > 0;
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
  pct: number | null,
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
  percentage.textContent = pct === null ? "—" : formatPercent(pct);

  const head = document.createElement("div");
  head.className = "breakdown__head";
  head.append(dot, name, amount, percentage);

  const fill = document.createElement("span");
  fill.style.width = `${Math.min(pct ?? 0, 100)}%`;
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

  const savings = getSavingsSummary(state.data, month);
  const totals = categoryIncomeShares(expenses, month, savings.incomeCents);
  dom.categoryTotals.replaceChildren(
    ...totals.map((item) =>
      createBreakdownItem(item.category, item.cents, item.incomePct),
    ),
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
  button.className = `button button--secondary button--small expense-action expense-action--${action}`;
  button.dataset["action"] = action;
  button.dataset["id"] = expense.id;
  const verb = action === "edit" ? "Editar" : "Eliminar";
  button.setAttribute(
    "aria-label",
    `${verb} gasto de ${formatMoney(expense.amountCents)} del ${formatDate(expense.date)}`,
  );
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    action === "edit"
      ? "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"
      : "M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6",
  );
  icon.append(path);
  button.append(icon);
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

function renderRecentActivity(state: AppState): void {
  type RecentItem = {
    id: string;
    date: string;
    createdAt: number;
    title: string;
    subtitle: string;
    amountCents: number;
    income: boolean;
    category: CategoryKey | null;
  };
  const month = state.ui.selectedMonth;
  const items: RecentItem[] = state.data.expenses
    .filter((expense) => expense.date.slice(0, 7) === month)
    .map((expense) => ({
      id: expense.id,
      date: expense.date,
      createdAt: expense.createdAt,
      title: expense.note || CATEGORIES[expense.category].label,
      subtitle: `${CATEGORIES[expense.category].label} · ${formatDate(expense.date)}`,
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
      subtitle: `Ingreso · ${formatDate(entry.date)}`,
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
      subtitle: `Ingreso · ${formatDate(`${incomeMonth}-01`)}`,
      amountCents,
      income: true,
      category: null,
    });
  }
  const recent = items
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 5);
  dom.recentActivity.replaceChildren(
    ...recent.map((entry) => {
      const item = document.createElement("li");
      item.className = entry.income
        ? "activity-item activity-item--income"
        : "activity-item";
      const icon = document.createElement("span");
      icon.className = "activity-item__icon";
      icon.setAttribute("aria-hidden", "true");
      if (entry.category !== null) {
        icon.dataset["category"] = entry.category;
        icon.style.setProperty("--category-color", CATEGORIES[entry.category].color);
      }
      icon.textContent = entry.income
        ? "+"
        : CATEGORIES[entry.category ?? "otros"].label.slice(0, 1);
      const detail = document.createElement("span");
      detail.className = "activity-item__detail";
      const title = document.createElement("strong");
      title.textContent = entry.title;
      const subtitle = document.createElement("small");
      subtitle.textContent = entry.subtitle;
      detail.append(title, subtitle);
      const amount = document.createElement("strong");
      amount.className = "activity-item__amount";
      amount.textContent = `${entry.income ? "+" : "−"}${formatMoney(entry.amountCents)}`;
      item.append(icon, detail, amount);
      return item;
    }),
  );
  dom.recentEmpty.hidden = recent.length > 0;
}

function renderHomeHighlights(state: AppState): void {
  const month = state.ui.selectedMonth;
  const spentCents = sumCents(expensesOfMonth(state.data.expenses, month));
  const budget = state.data.budgets?.[month] ?? null;
  const budgetValue = document.getElementById("home-budget-value");
  const budgetNote = document.getElementById("home-budget-note");
  const budgetMeter = document.getElementById("home-budget-meter");
  const budgetFill = document.getElementById("home-budget-fill");
  if (
    budgetValue instanceof HTMLElement &&
    budgetNote instanceof HTMLElement &&
    budgetMeter instanceof HTMLElement &&
    budgetFill instanceof HTMLElement
  ) {
    if (budget === null) {
      budgetValue.textContent = "Sin límite definido";
      budgetNote.textContent = "Aún no has fijado un presupuesto.";
      budgetMeter.hidden = true;
      budgetFill.style.width = "0%";
      budgetMeter.removeAttribute("aria-valuenow");
      budgetMeter.removeAttribute("aria-valuetext");
    } else {
      const usedPct =
        budget > 0
          ? Math.min(100, (spentCents / budget) * 100)
          : spentCents > 0
            ? 100
            : 0;
      budgetValue.textContent = `${formatPercent(usedPct)} utilizado`;
      budgetNote.textContent = `${formatMoney(Math.max(0, budget - spentCents))} disponibles`;
      budgetMeter.hidden = false;
      budgetFill.style.width = `${usedPct}%`;
      budgetMeter.setAttribute("aria-valuenow", String(Math.round(usedPct)));
      budgetMeter.setAttribute(
        "aria-valuetext",
        `${formatPercent(usedPct)} del presupuesto utilizado`,
      );
      budgetMeter.classList.toggle(
        "home-meter--warning",
        spentCents >= budget * 0.75 && spentCents < budget,
      );
      budgetMeter.classList.toggle("home-meter--danger", spentCents >= budget);
    }
  }

  const recurring = (state.data.recurring ?? []).filter((item) => item.active);
  const today = getTodayIso();
  const todayMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  const isRegisteredThisMonth = (template: (typeof recurring)[number]): boolean =>
    template.lastRunMonth === month ||
    state.data.expenses.some(
      (expense) =>
        expense.recurringId === template.id && expense.recurringMonth === month,
    );
  const unregistered = recurring.filter((template) => !isRegisteredThisMonth(template));
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
  const nextRecurring = upcoming ?? pending;
  const recurringName = document.getElementById("home-recurring-name");
  const recurringDate = document.getElementById("home-recurring-date");
  const recurringAmount = document.getElementById("home-recurring-amount");
  if (
    recurringName instanceof HTMLElement &&
    recurringDate instanceof HTMLElement &&
    recurringAmount instanceof HTMLElement
  ) {
    if (nextRecurring) {
      const monthParts = month.split("-");
      const year = Number(monthParts[0]);
      const monthNumber = Number(monthParts[1]);
      const lastDay = new Date(year, monthNumber, 0).getDate();
      const dueDate = `${month}-${String(Math.min(nextRecurring.dayOfMonth, lastDay)).padStart(2, "0")}`;
      recurringName.textContent = nextRecurring.name;
      recurringDate.textContent = upcoming
        ? `Próximo · ${formatDate(dueDate)}`
        : `Pendiente · ${formatDate(dueDate)}`;
      recurringAmount.textContent = formatMoney(nextRecurring.amountCents);
      recurringAmount.hidden = false;
    } else {
      recurringName.textContent =
        recurring.length === 0 ? "Sin gastos fijos activos" : "Sin pagos pendientes";
      recurringDate.textContent = "";
      recurringAmount.textContent = "";
      recurringAmount.hidden = true;
    }
  }

  const goals = state.data.goals ?? [];
  const goal = goals.find((item) => item.savedCents < item.targetCents) ?? goals[0];
  const goalName = document.getElementById("home-goal-name");
  const goalNote = document.getElementById("home-goal-note");
  const goalMeter = document.getElementById("home-goal-meter");
  const goalFill = document.getElementById("home-goal-fill");
  if (
    goalName instanceof HTMLElement &&
    goalNote instanceof HTMLElement &&
    goalMeter instanceof HTMLElement &&
    goalFill instanceof HTMLElement
  ) {
    if (goal) {
      const progress = Math.min(100, (goal.savedCents / goal.targetCents) * 100);
      goalName.textContent = `${goal.name} · ${formatPercent(progress)}`;
      goalNote.textContent = `${formatMoney(goal.savedCents)} de ${formatMoney(goal.targetCents)}`;
      goalMeter.hidden = false;
      goalMeter.setAttribute("aria-label", `Progreso de la meta ${goal.name}`);
      goalFill.style.width = `${progress}%`;
      goalMeter.setAttribute("aria-valuenow", String(Math.round(progress)));
      goalMeter.setAttribute("aria-valuetext", `${formatPercent(progress)} completado`);
    } else {
      goalName.textContent = "Aún no tienes metas";
      goalNote.textContent = "Crea una meta para seguir tu ahorro.";
      goalMeter.hidden = true;
      goalFill.style.width = "0%";
      goalMeter.removeAttribute("aria-valuenow");
      goalMeter.removeAttribute("aria-valuetext");
    }
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
      const spentPct = shares.reduce((total, item) => total + (item.incomePct ?? 0), 0);
      const scale = spentPct > 100 ? 100 / spentPct : 1;
      const segments = shares.map((item) => {
        const segment = document.createElement("span");
        segment.className = "income-distribution__segment";
        segment.style.width = `${(item.incomePct ?? 0) * scale}%`;
        segment.style.setProperty("--category-color", CATEGORIES[item.category].color);
        segment.setAttribute("aria-hidden", "true");
        return segment;
      });
      if (savings.savedCents !== null && savings.savedCents > 0) {
        const saved = document.createElement("span");
        saved.className =
          "income-distribution__segment income-distribution__segment--savings";
        saved.style.width = `${Math.max(0, savings.savingsPct ?? 0)}%`;
        saved.setAttribute("aria-hidden", "true");
        segments.push(saved);
      }
      distributionBar.replaceChildren(...segments);
      distributionBar.hidden = false;
      distributionBar.setAttribute(
        "aria-label",
        savings.isDeficit
          ? "Distribución de gastos superior a los ingresos del mes"
          : "Distribución de los ingresos entre gastos y ahorro",
      );
      distributionNote.textContent = savings.isDeficit
        ? "Los gastos superan los ingresos de este mes."
        : "";
      const legendItems = shares.map((item) => {
        const entry = document.createElement("li");
        const swatch = document.createElement("span");
        swatch.className = "income-distribution__swatch";
        swatch.style.setProperty("--category-color", CATEGORIES[item.category].color);
        swatch.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = `${CATEGORIES[item.category].label} ${formatPercent(item.incomePct ?? 0)}`;
        entry.append(swatch, label);
        return entry;
      });
      if (savings.savedCents !== null && savings.savedCents > 0) {
        const entry = document.createElement("li");
        const swatch = document.createElement("span");
        swatch.className =
          "income-distribution__swatch income-distribution__swatch--savings";
        swatch.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = `Ahorro ${formatPercent(savings.savingsPct ?? 0)}`;
        entry.append(swatch, label);
        legendItems.push(entry);
      }
      distributionLegend.replaceChildren(...legendItems);
    }
  }
}

let plannerBudgetKey = "";
function renderPlanner(state: AppState): void {
  const month = state.ui.selectedMonth;
  const recurringMonthLabel = document.getElementById("recurring-month-label");
  if (recurringMonthLabel) {
    const monthName = formatMonth(month).replace(" de ", " ");
    recurringMonthLabel.textContent =
      monthName.charAt(0).toLocaleUpperCase("es") + monthName.slice(1);
  }
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
    budgetProgress.textContent =
      budget === null
        ? "Aún no has fijado un límite para este mes."
        : `${formatMoney(spent)} gastados de ${formatMoney(budget)} · ${formatMoney(Math.max(0, budget - spent))} disponibles`;
  }
  if (budgetFill instanceof HTMLElement && budget !== null) {
    budgetFill.style.width = `${Math.min(100, (spent / budget) * 100)}%`;
    budgetFill.parentElement?.classList.toggle(
      "budget-meter--warning",
      spent >= budget * 0.75 && spent < budget,
    );
    budgetFill.parentElement?.classList.toggle("budget-meter--danger", spent >= budget);
  } else if (budgetFill instanceof HTMLElement) {
    budgetFill.style.width = "0%";
    budgetFill.parentElement?.classList.remove(
      "budget-meter--warning",
      "budget-meter--danger",
    );
  }
  if (budgetClear instanceof HTMLButtonElement) budgetClear.hidden = budget === null;

  const goalsList = document.getElementById("goals-list");
  const goalsEmpty = document.getElementById("goals-empty");
  const goals = state.data.goals ?? [];
  if (goalsList instanceof HTMLUListElement) {
    goalsList.replaceChildren(
      ...goals.map((goal) => {
        const item = document.createElement("li");
        item.className = "planner-item";
        const top = document.createElement("div");
        top.className = "planner-item__top";
        const name = document.createElement("span");
        name.className = "planner-item__name";
        name.textContent = goal.name;
        const amount = document.createElement("span");
        amount.className = "planner-item__meta";
        amount.textContent = `${formatMoney(goal.savedCents)} / ${formatMoney(goal.targetCents)}`;
        top.append(name, amount);
        const meter = document.createElement("div");
        meter.className = "budget-meter";
        const fill = document.createElement("span");
        fill.style.width = `${Math.min(100, (goal.savedCents / goal.targetCents) * 100)}%`;
        meter.append(fill);
        const history = document.createElement("p");
        history.className = "planner-item__meta";
        const contributions = goal.contributions ?? [];
        history.textContent =
          contributions.length === 0
            ? "Sin aportaciones registradas"
            : `${contributions.length} aportaciones · última ${formatDate(contributions[contributions.length - 1]!.date)}`;
        const controls = document.createElement("div");
        controls.className = "planner-item__actions";
        const contribution = document.createElement("input");
        contribution.className = "field__input";
        contribution.inputMode = "decimal";
        contribution.placeholder = "Aportar €";
        contribution.setAttribute("aria-label", `Aportación a ${goal.name}`);
        contribution.dataset["goalContribution"] = goal.id;
        const add = document.createElement("button");
        add.type = "button";
        add.className = "button button--small";
        add.textContent = "Añadir ahorro";
        add.dataset["action"] = "goal-add";
        add.dataset["id"] = goal.id;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button button--secondary button--small button--danger";
        remove.textContent = "Eliminar";
        remove.dataset["action"] = "goal-delete";
        remove.dataset["id"] = goal.id;
        controls.append(contribution, add, remove);
        item.append(top, meter, history);
        if (goal.savedCents >= goal.targetCents) {
          const completed = document.createElement("p");
          completed.className = "planner-item__meta goal-complete";
          completed.textContent = "Meta cumplida";
          item.append(completed);
        }
        item.append(controls);
        if (goal.dueDate) {
          const due = document.createElement("p");
          due.className = "planner-item__meta";
          due.textContent = `Fecha objetivo: ${formatDate(goal.dueDate)}`;
          item.append(due);
        }
        return item;
      }),
    );
  }
  if (goalsEmpty) goalsEmpty.hidden = goals.length > 0;

  const recurringList = document.getElementById("recurring-list");
  const recurringEmpty = document.getElementById("recurring-empty");
  const recurring = state.data.recurring ?? [];
  const today = getTodayIso();
  const todayMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  const isRegisteredThisMonth = (template: (typeof recurring)[number]): boolean =>
    template.lastRunMonth === month ||
    state.data.expenses.some(
      (expense) =>
        expense.recurringId === template.id && expense.recurringMonth === month,
    );
  const unregisteredActive = recurring.filter(
    (template) => template.active && !isRegisteredThisMonth(template),
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
  const recurringTotal = recurring
    .filter((template) => template.active)
    .reduce((total, template) => total + template.amountCents, 0);
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
      ? formatDate(`${month}-${String(upcomingCharge.dayOfMonth).padStart(2, "0")}`)
      : pendingCharge
        ? `Pendiente · ${formatDate(`${month}-${String(pendingCharge.dayOfMonth).padStart(2, "0")}`)}`
        : "—";
    recurringNextLabel.title = recurringNextLabel.textContent;
  }
  if (recurringList instanceof HTMLUListElement) {
    const orderedRecurring = [...recurring].sort(
      (a, b) => a.dayOfMonth - b.dayOfMonth || a.name.localeCompare(b.name, "es"),
    );
    const rows: HTMLLIElement[] = [];
    let todayDividerAdded = false;
    const appendTodayDivider = (): void => {
      const divider = document.createElement("li");
      divider.className = "recurring-today-divider";
      const badge = document.createElement("span");
      badge.className = "recurring-day-badge recurring-day-badge--today";
      badge.textContent = `Hoy · ${todayDay}`;
      const line = document.createElement("span");
      line.className = "recurring-today-divider__line";
      divider.append(badge, line);
      rows.push(divider);
      todayDividerAdded = true;
    };
    for (const template of orderedRecurring) {
      if (month === todayMonth && !todayDividerAdded && template.dayOfMonth >= todayDay) {
        appendTodayDivider();
      }
      const row = document.createElement("li");
      row.className = "recurring-row";
      const dayBadge = document.createElement("span");
      dayBadge.className = "recurring-day-badge";
      dayBadge.textContent = `Día ${template.dayOfMonth}`;
      const item = document.createElement("article");
      item.className = "recurring-card";
      const status = document.createElement("span");
      status.className = "recurring-status";
      const recordedExpense = state.data.expenses.find(
        (expense) =>
          expense.recurringId === template.id && expense.recurringMonth === month,
      );
      const registered = isRegisteredThisMonth(template) || recordedExpense !== undefined;
      status.classList.toggle("recurring-status--registered", registered);
      status.classList.toggle("recurring-status--paused", !template.active);
      status.textContent = !template.active
        ? "Pausado"
        : registered
          ? `✓ Registrado${recordedExpense ? ` ${formatDate(recordedExpense.date)}` : " este mes"}`
          : month === todayMonth && template.dayOfMonth <= todayDay
            ? `Pendiente: ${formatDate(`${month}-${String(template.dayOfMonth).padStart(2, "0")}`)}`
            : `Próximo: ${formatDate(`${month}-${String(template.dayOfMonth).padStart(2, "0")}`)}`;
      const name = document.createElement("h2");
      name.className = "recurring-card__name";
      name.textContent = template.name;
      const amount = document.createElement("span");
      amount.className = "recurring-card__amount";
      amount.textContent = formatMoney(template.amountCents);
      const meta = document.createElement("p");
      meta.className = "recurring-card__meta";
      meta.textContent = CATEGORIES[template.category].label;
      const run = document.createElement("button");
      run.type = "button";
      run.className = "recurring-menu__item";
      run.textContent = "Registrar este mes";
      run.setAttribute("aria-label", `Registrar ${template.name} este mes`);
      run.dataset["action"] = "recurring-run";
      run.dataset["id"] = template.id;
      run.disabled = !template.active || registered;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "recurring-menu__item";
      edit.textContent = "Editar";
      edit.setAttribute("aria-label", `Editar ${template.name}`);
      edit.dataset["action"] = "recurring-edit";
      edit.dataset["id"] = template.id;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "recurring-menu__item";
      toggle.textContent = template.active ? "Pausar" : "Activar";
      toggle.setAttribute(
        "aria-label",
        `${template.active ? "Pausar" : "Activar"} ${template.name}`,
      );
      toggle.dataset["action"] = "recurring-toggle";
      toggle.dataset["id"] = template.id;
      toggle.dataset["active"] = String(!template.active);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "recurring-menu__item recurring-menu__item--danger";
      remove.textContent = "Eliminar";
      remove.setAttribute("aria-label", `Eliminar ${template.name}`);
      remove.dataset["action"] = "recurring-delete";
      remove.dataset["id"] = template.id;
      const menu = document.createElement("details");
      menu.className = "recurring-menu";
      const menuToggle = document.createElement("summary");
      menuToggle.className = "recurring-menu__toggle";
      menuToggle.textContent = "•••";
      menuToggle.setAttribute("aria-label", `Opciones de ${template.name}`);
      const menuItems = document.createElement("div");
      menuItems.className = "recurring-menu__items";
      menuItems.append(run, edit, toggle, remove);
      menu.append(menuToggle, menuItems);
      const titleAndCategory = document.createElement("div");
      titleAndCategory.className = "recurring-card__details";
      titleAndCategory.append(name, meta);
      const summary = document.createElement("div");
      summary.className = "recurring-card__summary";
      summary.append(status, amount, menu);
      const view = document.createElement("div");
      view.className = "recurring-card__view";
      view.append(titleAndCategory, summary);

      const editForm = document.createElement("div");
      editForm.className = "recurring-edit-form";
      editForm.hidden = true;
      editForm.setAttribute("role", "group");
      editForm.setAttribute("aria-label", `Editar gasto fijo ${template.name}`);
      const createEditField = (
        field: "name" | "amount" | "day",
        labelText: string,
        value: string,
        type: string,
      ): HTMLInputElement => {
        const fieldWrap = document.createElement("div");
        fieldWrap.className = "field";
        const input = document.createElement("input");
        input.className = "field__input";
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
        const label = document.createElement("label");
        label.className = "field__label";
        label.htmlFor = input.id;
        label.textContent = labelText;
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
      const editCategoryWrap = document.createElement("div");
      editCategoryWrap.className = "field";
      const editCategory = document.createElement("select");
      editCategory.className = "field__input";
      editCategory.dataset["recurringField"] = "category";
      editCategory.id = `recurring-category-${template.id}`;
      editCategory.replaceChildren(
        ...CATEGORY_KEYS.map((categoryKey) => {
          const option = document.createElement("option");
          option.value = categoryKey;
          option.textContent = CATEGORIES[categoryKey].label;
          option.selected = categoryKey === template.category;
          return option;
        }),
      );
      const editCategoryLabel = document.createElement("label");
      editCategoryLabel.className = "field__label";
      editCategoryLabel.htmlFor = editCategory.id;
      editCategoryLabel.textContent = "Categoría";
      editCategoryWrap.append(editCategoryLabel, editCategory);
      editForm.append(editCategoryWrap);
      createEditField("day", "Día del mes", String(template.dayOfMonth), "number");
      const editError = document.createElement("p");
      editError.className = "form__error recurring-edit-form__error";
      editError.setAttribute("role", "alert");
      editError.dataset["recurringError"] = "true";
      editError.hidden = true;
      editForm.append(editError);
      const editActions = document.createElement("div");
      editActions.className = "recurring-edit-form__actions";
      const save = document.createElement("button");
      save.type = "button";
      save.className = "button button--small";
      save.textContent = "Guardar cambios";
      save.dataset["action"] = "recurring-save";
      save.dataset["id"] = template.id;
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "button button--secondary button--small";
      cancel.textContent = "Cancelar";
      cancel.dataset["action"] = "recurring-cancel";
      cancel.dataset["id"] = template.id;
      editActions.append(save, cancel);
      editForm.append(editActions);
      item.append(view, editForm);
      row.append(dayBadge, item);
      rows.push(row);
    }
    if (month === todayMonth && orderedRecurring.length > 0 && !todayDividerAdded) {
      appendTodayDivider();
    }
    recurringList.replaceChildren(...rows);
  }
  if (recurringEmpty) recurringEmpty.hidden = recurring.length > 0;

  const wallets = state.data.wallets ?? [];
  const populateWalletSelect = (select: HTMLSelectElement, emptyLabel: string): void => {
    const previous = select.value;
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = emptyLabel;
    select.replaceChildren(
      empty,
      ...wallets.map((wallet) => {
        const option = document.createElement("option");
        option.value = wallet.id;
        option.textContent = wallet.name;
        return option;
      }),
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
        const item = document.createElement("li");
        item.className = "planner-item";
        const top = document.createElement("div");
        top.className = "planner-item__top";
        const name = document.createElement("span");
        name.className = "planner-item__name";
        name.textContent = wallet.name;
        const balance = document.createElement("strong");
        balance.className = "planner-item__meta";
        const spent = state.data.expenses
          .filter((expense) => expense.walletId === wallet.id)
          .reduce((total, expense) => total + expense.amountCents, 0);
        const outgoing = (state.data.transfers ?? [])
          .filter((transfer) => transfer.fromWalletId === wallet.id)
          .reduce((total, transfer) => total + transfer.amountCents, 0);
        const incoming = (state.data.transfers ?? [])
          .filter((transfer) => transfer.toWalletId === wallet.id)
          .reduce((total, transfer) => total + transfer.amountCents, 0);
        balance.textContent = formatMoney(
          wallet.openingCents - spent - outgoing + incoming,
        );
        top.append(name, balance);
        const type = document.createElement("p");
        type.className = "planner-item__meta";
        type.textContent = `${wallet.kind === "cash" ? "Efectivo" : wallet.kind === "bank" ? "Banco" : wallet.kind === "card" ? "Tarjeta" : wallet.kind === "savings" ? "Ahorro" : "Inversión"} · saldo inicial ${formatMoney(wallet.openingCents)}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button button--secondary button--small button--danger";
        remove.textContent = "Eliminar cartera";
        remove.dataset["action"] = "wallet-delete";
        remove.dataset["id"] = wallet.id;
        const controls = document.createElement("div");
        controls.className = "planner-item__actions";
        controls.append(remove);
        item.append(top, type, controls);
        return item;
      }),
    );
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
  renderIncomeEntries(state);
  renderSummary(state);
  renderExpenseList(state);
  renderRecentActivity(state);
  renderHomeHighlights(state);
  renderPlanner(state);
}
