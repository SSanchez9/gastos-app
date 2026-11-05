import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/fintech.css";
import { initAuthUi } from "./auth-ui";
import { initBackup } from "./backup";
import { getPreviousIncome } from "./calc";
import { renderChart } from "./charts";
import { CATEGORIES, CATEGORY_KEYS, isCategoryFilter } from "./config";
import { eurosToCents, getMonthKey, getTodayIso } from "./format";
import { subscribeSession } from "./session";
import * as state from "./state";
import { initSyncUi } from "./sync-ui";
import type { AppState, WalletKind } from "./types";
import {
  clearIncomeError,
  dom,
  fillForm,
  initCategorySelects,
  readExpenseForm,
  readIncomeForm,
  renderApp,
  resetForm,
  setEditMode,
  showFormError,
  showIncomeError,
  setAmountsHidden,
} from "./ui";

declare global {
  interface Window {
    gastos?: typeof state;
  }
}

// Solo en desarrollo: permite probar el estado desde la consola del navegador.
if (import.meta.env.DEV) {
  window.gastos = state;
}

/** Sincroniza toda la pantalla con el estado. */
function render(appState: AppState): void {
  renderApp(appState);
  renderChart(appState);
  syncScreenNavigation();
}

function syncScreenNavigation(): void {
  const current = window.location.hash.slice(1) || "home";
  const available = [...document.querySelectorAll<HTMLElement>("[data-screen]")].some(
    (screen) => screen.dataset["screen"] === current,
  );
  const target = available ? current : "home";
  const navTarget = [
    "income",
    "budget",
    "goals",
    "recurring",
    "wallets",
    "backups",
  ].includes(target)
    ? "more"
    : target;
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((screen) => {
    screen.hidden = screen.dataset["screen"] !== target;
  });
  document.querySelectorAll<HTMLAnchorElement>("[data-screen-target]").forEach((link) => {
    const active = link.dataset["screenTarget"] === navTarget;
    if (active && link.matches(".nav-link, .mobile-nav__link"))
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
    link.classList.toggle(
      "nav-link--active",
      active && link.classList.contains("nav-link"),
    );
    link.classList.toggle(
      "mobile-nav__link--active",
      active && link.classList.contains("mobile-nav__link"),
    );
  });
}

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("[data-screen-target]");
  if (!link) return;
  event.preventDefault();
  const screen = link.dataset["screenTarget"];
  if (screen === "add") {
    const dialog = document.getElementById("expense-dialog");
    if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
    return;
  }
  if (screen) window.location.hash = screen;
  syncScreenNavigation();
});
window.addEventListener("hashchange", syncScreenNavigation);
dom.eyeToggle.addEventListener("click", () => {
  setAmountsHidden(dom.eyeToggle.getAttribute("aria-pressed") !== "true");
});

let editingId: string | null = null;

function cancelEditing(closeDialog = true): void {
  editingId = null;
  setEditMode(false);
  resetForm({ keepContext: false });
  const dialog = document.getElementById("expense-dialog");
  if (closeDialog && dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
}

const expenseDialog = document.getElementById("expense-dialog");
if (expenseDialog instanceof HTMLDialogElement) {
  document
    .getElementById("expense-dialog-close")
    ?.addEventListener("click", () => cancelEditing());
  expenseDialog.addEventListener("click", (event) => {
    if (event.target === expenseDialog) cancelEditing();
  });
  expenseDialog.addEventListener("cancel", () => {
    const wasEditing = editingId !== null;
    editingId = null;
    setEditMode(false);
    resetForm({ keepContext: !wasEditing });
  });
}

// ---------- Formulario de gastos ----------

async function handleExpenseSubmit(): Promise<void> {
  const input = readExpenseForm();
  if (!input.ok) {
    showFormError(input.error);
    return;
  }

  const idBeingEdited = editingId;
  dom.submit.disabled = true;
  const result =
    idBeingEdited === null
      ? await state.addExpense(input.value)
      : await state.updateExpense(idBeingEdited, input.value);
  dom.submit.disabled = false;

  if (!result.ok) {
    showFormError(result.error);
    return;
  }

  // Muestra el mes y la categoría del gasto guardado para que se vea en la lista.
  state.setSelectedMonth(getMonthKey(result.value.date));
  const { categoryFilter } = state.getState().ui;
  if (categoryFilter !== "all" && categoryFilter !== result.value.category) {
    state.setCategoryFilter("all");
  }

  if (idBeingEdited !== null) {
    cancelEditing();
  } else {
    resetForm({ keepContext: true });
  }
}

dom.form.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleExpenseSubmit();
});

dom.cancel.addEventListener("click", () => cancelEditing());

// Entrada rápida inspirada en el registro conversacional de Boti.
const quickEntryInput = document.getElementById("quick-entry-input");
const quickEntrySubmit = document.getElementById("quick-entry-submit");
if (
  quickEntryInput instanceof HTMLInputElement &&
  quickEntrySubmit instanceof HTMLButtonElement
) {
  const addQuickEntry = (): void => {
    const raw = quickEntryInput.value.trim();
    const amountMatch = raw.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)(?:\s|€|$)/);
    if (amountMatch === null) {
      quickEntryInput.setCustomValidity("Escribe un importe, por ejemplo: 12 café");
      quickEntryInput.reportValidity();
      return;
    }
    quickEntryInput.setCustomValidity("");
    const amount = amountMatch[1];
    if (amount === undefined) return;
    const words = raw
      .replace(amountMatch[0], " ")
      .replace(/\b(?:hoy|ayer)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const lower = raw.toLocaleLowerCase("es");
    const category = /gasolina|combustible|fuel/.test(lower)
      ? "gasolina"
      : /supermercado|mercadona|carrefour|lidl|compra/.test(lower)
        ? "supermercado"
        : /alquiler/.test(lower)
          ? "alquiler"
          : /coche|parking|aparcamiento|taller/.test(lower)
            ? "coche"
            : /casa|luz|agua|internet|hogar/.test(lower)
              ? "casa"
              : /amigo|amiga|cena|bar|restaurante|cine/.test(lower)
                ? "social"
                : /ropa|farmacia|café|cafe|gimnasio|personal/.test(lower)
                  ? "personal"
                  : "otros";
    const date = new Date();
    if (/\bayer\b/i.test(raw)) date.setDate(date.getDate() - 1);
    cancelEditing(false);
    dom.amount.value = amount.replace(".", ",");
    dom.note.value = words;
    dom.categoryPicker
      .querySelector<HTMLButtonElement>(`[data-category="${category}"]`)
      ?.click();
    dom.date.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    dom.form.requestSubmit();
    quickEntryInput.value = "";
  };
  quickEntrySubmit.addEventListener("click", addQuickEntry);
  quickEntryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addQuickEntry();
    }
  });
  quickEntryInput.addEventListener("input", () => quickEntryInput.setCustomValidity(""));
}

// ---------- Acciones de la lista (editar y eliminar) ----------

async function handleDelete(id: string): Promise<void> {
  const result = await state.deleteExpense(id);
  if (!result.ok) {
    window.alert(result.error);
    return;
  }
  if (editingId === id) cancelEditing();
}

dom.rows.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  if (button === null) return;

  const id = button.dataset["id"];
  if (id === undefined) return;
  const expense = state.getState().data.expenses.find((item) => item.id === id);
  if (expense === undefined) return;

  if (button.dataset["action"] === "edit") {
    editingId = id;
    setEditMode(true);
    fillForm(expense);
    if (expenseDialog instanceof HTMLDialogElement && !expenseDialog.open)
      expenseDialog.showModal();
  } else if (button.dataset["action"] === "delete") {
    if (window.confirm("¿Eliminar este gasto? Esta acción no se puede deshacer.")) {
      void handleDelete(id);
    }
  }
});

// ---------- Sueldo del mes ----------

async function handleIncomeSubmit(): Promise<void> {
  const input = readIncomeForm();
  if (!input.ok) {
    showIncomeError(input.error);
    return;
  }

  const result = await state.setIncome(state.getState().ui.selectedMonth, input.value);
  if (!result.ok) {
    showIncomeError(result.error);
    return;
  }
  clearIncomeError();
}

dom.incomeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void handleIncomeSubmit();
});

const incomeEntryForm = document.getElementById("income-entry-form");
const incomeEntryDate = document.getElementById("income-entry-date");
const incomeEntryAmount = document.getElementById("income-entry-amount");
const incomeEntryTitle = document.getElementById("income-entry-title");
const incomeEntryError = document.getElementById("income-entry-error");
if (incomeEntryDate instanceof HTMLInputElement) incomeEntryDate.value = getTodayIso();
if (incomeEntryForm instanceof HTMLFormElement) {
  incomeEntryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      !(incomeEntryTitle instanceof HTMLInputElement) ||
      !(incomeEntryAmount instanceof HTMLInputElement) ||
      !(incomeEntryDate instanceof HTMLInputElement)
    )
      return;
    const amountCents = eurosToCents(incomeEntryAmount.value);
    if (amountCents === null) {
      if (incomeEntryError instanceof HTMLParagraphElement) {
        incomeEntryError.textContent = "Introduce un importe válido.";
        incomeEntryError.hidden = false;
      }
      return;
    }
    void state
      .addIncomeEntry({
        title: incomeEntryTitle.value,
        amountCents,
        date: incomeEntryDate.value,
      })
      .then((result) => {
        if (!result.ok) {
          if (incomeEntryError instanceof HTMLParagraphElement) {
            incomeEntryError.textContent = result.error;
            incomeEntryError.hidden = false;
          }
          return;
        }
        incomeEntryForm.reset();
        incomeEntryDate.value = getTodayIso();
        if (incomeEntryError instanceof HTMLParagraphElement)
          incomeEntryError.hidden = true;
      });
  });
}

document.getElementById("income-migrate")?.addEventListener("click", () => {
  void state.migrateLegacyIncome(state.getState().ui.selectedMonth).then((result) => {
    if (!result.ok && incomeEntryError instanceof HTMLParagraphElement) {
      incomeEntryError.textContent = result.error;
      incomeEntryError.hidden = false;
    }
  });
});

document.getElementById("income-entry-list")?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  const id = button?.dataset["id"];
  const entry = (state.getState().data.incomeEntries ?? []).find(
    (item) => item.id === id,
  );
  if (!button || !id || !entry) return;
  if (button.dataset["action"] === "income-delete") {
    if (window.confirm(`¿Eliminar el ingreso «${entry.title}»?`))
      void state.deleteIncomeEntry(id);
  }
  if (button.dataset["action"] === "income-edit") {
    const title = window.prompt("Título", entry.title);
    if (title === null) return;
    const amount = window.prompt(
      "Importe",
      (entry.amountCents / 100).toFixed(2).replace(".", ","),
    );
    if (amount === null) return;
    const amountCents = eurosToCents(amount);
    const date = window.prompt("Fecha (AAAA-MM-DD)", entry.date);
    if (date === null || amountCents === null) return;
    void state.updateIncomeEntry(id, { title, amountCents, date }).then((result) => {
      if (!result.ok && incomeEntryError instanceof HTMLParagraphElement) {
        incomeEntryError.textContent = result.error;
        incomeEntryError.hidden = false;
      }
    });
  }
});

async function handleIncomeCopy(): Promise<void> {
  const { data, ui } = state.getState();
  const previous = getPreviousIncome(data.income, ui.selectedMonth);
  if (previous === null) return;

  const result = await state.setIncome(ui.selectedMonth, previous.cents);
  if (!result.ok) {
    showIncomeError(result.error);
    return;
  }
  // El botón desaparece al copiar: se devuelve el foco al campo para no perderlo.
  dom.incomeAmount.focus();
}

dom.incomeCopy.addEventListener("click", () => {
  void handleIncomeCopy();
});

async function handleIncomeClear(): Promise<void> {
  const result = await state.clearIncome(state.getState().ui.selectedMonth);
  if (!result.ok) {
    showIncomeError(result.error);
    return;
  }
  dom.incomeAmount.focus();
}

dom.incomeClear.addEventListener("click", () => {
  if (window.confirm("¿Quitar el sueldo de este mes?")) {
    void handleIncomeClear();
  }
});

function showPlannerError(id: string, message: string): void {
  const target = document.getElementById(id);
  if (target instanceof HTMLParagraphElement) {
    target.textContent = message;
    target.hidden = false;
  }
}
function clearPlannerError(id: string): void {
  const target = document.getElementById(id);
  if (target instanceof HTMLParagraphElement) {
    target.textContent = "";
    target.hidden = true;
  }
}
function input(id: string): HTMLInputElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement ? element : null;
}
function form(id: string): HTMLFormElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLFormElement ? element : null;
}

const recurringCategory = document.getElementById("recurring-category");
if (recurringCategory instanceof HTMLSelectElement) {
  recurringCategory.replaceChildren(
    ...CATEGORY_KEYS.map((key) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = CATEGORIES[key].label;
      return option;
    }),
  );
}

form("budget-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearPlannerError("budget-error");
  const cents = eurosToCents(input("budget-amount")?.value ?? "");
  if (cents === null) {
    showPlannerError("budget-error", "Introduce un límite válido, por ejemplo 1.200,00.");
    return;
  }
  void state.setMonthlyBudget(state.getState().ui.selectedMonth, cents).then((result) => {
    if (!result.ok) showPlannerError("budget-error", result.error);
  });
});
document.getElementById("budget-clear")?.addEventListener("click", () => {
  void state.clearMonthlyBudget(state.getState().ui.selectedMonth);
});

form("goal-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearPlannerError("goal-error");
  const name = input("goal-name")?.value.trim() ?? "";
  const cents = eurosToCents(input("goal-target")?.value ?? "");
  const dueDate = input("goal-date")?.value || null;
  if (!name || cents === null) {
    showPlannerError("goal-error", "Añade un nombre y un importe objetivo válido.");
    return;
  }
  void state.addSavingsGoal({ name, targetCents: cents, dueDate }).then((result) => {
    if (!result.ok) showPlannerError("goal-error", result.error);
    else form("goal-form")?.reset();
  });
});

form("recurring-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearPlannerError("recurring-error");
  const name = input("recurring-name")?.value.trim() ?? "";
  const cents = eurosToCents(input("recurring-amount")?.value ?? "");
  const dayOfMonth = Number(input("recurring-day")?.value);
  const categoryValue =
    recurringCategory instanceof HTMLSelectElement ? recurringCategory.value : "";
  if (
    !name ||
    cents === null ||
    !Number.isInteger(dayOfMonth) ||
    dayOfMonth < 1 ||
    dayOfMonth > 28 ||
    !CATEGORY_KEYS.includes(categoryValue as (typeof CATEGORY_KEYS)[number])
  ) {
    showPlannerError(
      "recurring-error",
      "Revisa el nombre, el importe, la categoría y el día (1–28).",
    );
    return;
  }
  const result = state.addRecurringExpense({
    name,
    amountCents: cents,
    category: categoryValue as (typeof CATEGORY_KEYS)[number],
    dayOfMonth,
  });
  void result.then((saved) => {
    if (!saved.ok) showPlannerError("recurring-error", saved.error);
    else form("recurring-form")?.reset();
  });
});

form("wallet-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearPlannerError("wallet-error");
  const name = input("wallet-name")?.value.trim() ?? "";
  const openingCents = eurosToCents(input("wallet-opening")?.value ?? "");
  const kind = document.getElementById("wallet-kind");
  if (!name || openingCents === null || !(kind instanceof HTMLSelectElement)) {
    showPlannerError("wallet-error", "Introduce un nombre y saldo inicial válido.");
    return;
  }
  void state
    .createWallet({ name, openingCents, kind: kind.value as WalletKind })
    .then((result) => {
      if (!result.ok) showPlannerError("wallet-error", result.error);
      else form("wallet-form")?.reset();
    });
});

form("transfer-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearPlannerError("transfer-error");
  const from = document.getElementById("transfer-from");
  const to = document.getElementById("transfer-to");
  const amountCents = eurosToCents(input("transfer-amount")?.value ?? "");
  if (
    !(from instanceof HTMLSelectElement) ||
    !(to instanceof HTMLSelectElement) ||
    !from.value ||
    !to.value ||
    amountCents === null
  ) {
    showPlannerError(
      "transfer-error",
      "Elige dos carteras distintas e introduce un importe válido.",
    );
    return;
  }
  void state
    .transferBetweenWallets({
      fromWalletId: from.value,
      toWalletId: to.value,
      amountCents,
      date: getTodayIso(),
      note: "Traspaso",
    })
    .then((result) => {
      if (!result.ok) showPlannerError("transfer-error", result.error);
      else input("transfer-amount")!.value = "";
    });
});

document.getElementById("goals-list")?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  if (!button?.dataset["id"]) return;
  const id = button.dataset["id"];
  const action = button.dataset["action"];
  if (action === "goal-delete") {
    if (window.confirm("¿Eliminar esta meta de ahorro?"))
      void state.deleteSavingsGoal(id).then((result) => {
        if (!result.ok) window.alert(result.error);
      });
  }
  if (action === "goal-add") {
    const contribution = document.querySelector<HTMLInputElement>(
      `[data-goal-contribution="${id}"]`,
    );
    const cents = eurosToCents(contribution?.value ?? "");
    if (cents === null) {
      contribution?.reportValidity();
      contribution?.focus();
      return;
    }
    void state.contributeToGoal(id, cents).then((result) => {
      if (!result.ok) window.alert(result.error);
      else if (contribution) contribution.value = "";
    });
  }
});

document.getElementById("recurring-list")?.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  const id = button?.dataset["id"];
  if (!button || !id) return;
  const action = button.dataset["action"];
  if (action === "recurring-edit") {
    const template = (state.getState().data.recurring ?? []).find(
      (item) => item.id === id,
    );
    if (!template) return;
    const name = window.prompt("Título", template.name);
    if (name === null) return;
    const amount = window.prompt(
      "Importe",
      (template.amountCents / 100).toFixed(2).replace(".", ","),
    );
    if (amount === null) return;
    const amountCents = eurosToCents(amount);
    const categoryChoice = window.prompt(
      "Categoría (" + CATEGORY_KEYS.map((key) => CATEGORIES[key].label).join(", ") + ")",
      CATEGORIES[template.category].label,
    );
    if (categoryChoice === null) return;
    const category = CATEGORY_KEYS.find(
      (key) =>
        CATEGORIES[key].label.toLocaleLowerCase("es") ===
        categoryChoice.trim().toLocaleLowerCase("es"),
    );
    const day = window.prompt("Día del mes (1–28)", String(template.dayOfMonth));
    if (
      day === null ||
      amountCents === null ||
      !category ||
      !Number.isInteger(Number(day))
    )
      return;
    const result = await state.updateRecurringExpense(id, {
      name,
      amountCents,
      category,
      dayOfMonth: Number(day),
    });
    if (!result.ok) window.alert(result.error);
    return;
  }
  const operation =
    action === "recurring-run"
      ? state.registerRecurringExpense(id)
      : action === "recurring-toggle"
        ? state.updateRecurringExpense(id, {
            active: button.dataset["active"] === "true",
          })
        : action === "recurring-delete"
          ? state.deleteRecurringExpense(id)
          : null;
  if (operation)
    void operation.then((result) => {
      if (!result.ok) window.alert(result.error);
    });
});

document.getElementById("wallets-list")?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>(
    "button[data-action='wallet-delete']",
  );
  const id = button?.dataset["id"];
  if (!id || !window.confirm("¿Eliminar esta cartera?")) return;
  void state.deleteWallet(id).then((result) => {
    if (!result.ok) window.alert(result.error);
  });
});

// ---------- Mes y filtro ----------

dom.monthSelect.addEventListener("change", () => {
  if (!state.setSelectedMonth(dom.monthSelect.value)) render(state.getState());
});

dom.filterCategory.addEventListener("change", () => {
  const value = dom.filterCategory.value;
  if (!isCategoryFilter(value) || !state.setCategoryFilter(value)) {
    render(state.getState());
  }
});

// ---------- Arranque ----------

initCategorySelects();
dom.date.value = getTodayIso();
let automaticRecurringTrigger = "";
state.subscribe((appState) => {
  render(appState);
  const month = appState.ui.selectedMonth;
  const trigger = `${appState.sync.status}|${appState.sync.online}|${month}`;
  if (
    appState.sync.status === "ready" &&
    appState.sync.online &&
    trigger !== automaticRecurringTrigger
  ) {
    automaticRecurringTrigger = trigger;
    state.registerDueRecurringExpenses();
  }
});
render(state.getState());

initBackup({
  onDataReplaced: () => {
    // Si estabas editando un gasto que ya no existe tras importar, se cancela la edición.
    if (editingId !== null) cancelEditing();
  },
});
initSyncUi();

// Al iniciar sesión se empieza a escuchar la nube; al cerrarla, se borra de memoria.
subscribeSession((session) => {
  if (session.status === "signed-in" && session.user !== null) {
    state.startSync(session.user.uid);
  } else {
    state.stopSync();
    if (editingId !== null) cancelEditing();
  }
});
initAuthUi();
