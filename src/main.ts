import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/screens.css";
import { registerSW } from "virtual:pwa-register";
import { initAuthUi } from "./auth-ui";
import { initBackup } from "./backup";
import { renderChart } from "./charts";
import { CATEGORIES, CATEGORY_KEYS, isCategoryFilter } from "./config";
import { eurosToCents, getMonthKey, getTodayIso, shiftMonth } from "./format";
import { subscribeSession } from "./session";
import * as state from "./state";
import { initSyncUi } from "./sync-ui";
import type { AppState, CategoryKey, WalletKind } from "./types";
import {
  dom,
  fillForm,
  initCategorySelects,
  readExpenseForm,
  renderApp,
  renderQuickEntryPreview,
  resetForm,
  setEditMode,
  showExpenseSavedToast,
  showFormError,
  setAmountsHidden,
  showCompleteExpenseForm,
  showToast,
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

const themeToggle = document.getElementById("theme-toggle");
function applyTheme(theme: "light" | "dark", persist: boolean): void {
  document.documentElement.dataset.theme = theme;
  if (themeToggle instanceof HTMLButtonElement) {
    themeToggle.textContent = theme === "dark" ? "Modo oscuro" : "Modo claro";
    themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    themeToggle.setAttribute("aria-label", "Cambiar tema claro u oscuro");
  }
  if (persist) {
    try {
      localStorage.setItem("boti-theme", theme);
    } catch {
      // El tema se mantiene en esta sesión aunque el almacenamiento esté bloqueado.
    }
  }
}

const initialTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
applyTheme(initialTheme, false);
themeToggle?.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme, true);
});

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
    if (dialog instanceof HTMLDialogElement && !dialog.open) {
      editingId = null;
      setEditMode(false);
      dom.quickEntry.value = "";
      renderQuickEntryPreview(null);
      dialog.showModal();
    }
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
  dom.completeExpense.addEventListener("click", () => showCompleteExpenseForm());
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

  showExpenseSavedToast(result.value, idBeingEdited !== null);
  if (idBeingEdited !== null) {
    cancelEditing();
  } else {
    resetForm({ keepContext: true });
    if (expenseDialog instanceof HTMLDialogElement && expenseDialog.open)
      expenseDialog.close();
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
  /** Interpreta textos como «12 café» o «45 supermercado ayer». */
  const parseQuickEntry = (
    raw: string,
  ): { amount: string; words: string; category: CategoryKey; date: string } | null => {
    const amountMatch = raw.match(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)(?:\s|€|$)/);
    const amount = amountMatch?.[1];
    if (!amountMatch || amount === undefined) return null;
    const words = raw
      .replace(amountMatch[0], " ")
      .replace(/\b(?:hoy|ayer)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const lower = raw.toLocaleLowerCase("es");
    const category = /gasolina|combustible|fuel/.test(lower)
      ? "gasolina"
      : /supermercado|mercadona|carrefour|lidl|compra|batido|leche|cocacola|coca cola|monster/.test(
            lower,
          )
        ? "supermercado"
        : /alquiler/.test(lower)
          ? "alquiler"
          : /coche|parking|aparcamiento|taller|mantenimiento/.test(lower)
            ? "coche"
            : /casa|luz|agua|internet|hogar|digi/.test(lower)
              ? "casa"
              : /amigo|amiga|cena|bar|restaurante|cine/.test(lower)
                ? "social"
                : /ropa|farmacia|peluqueria|cejas|pull|berska|berskha|zara|gimnasio|personal/.test(
                      lower,
                    )
                  ? "personal"
                  : "otros";
    const date = new Date();
    if (/\bayer\b/i.test(raw)) date.setDate(date.getDate() - 1);
    return {
      amount: amount.replace(".", ","),
      words,
      category,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    };
  };
  const addQuickEntry = (): void => {
    const parsed = parseQuickEntry(quickEntryInput.value.trim());
    if (parsed === null) {
      quickEntryInput.setCustomValidity("Escribe un importe, por ejemplo: 12 café");
      quickEntryInput.reportValidity();
      return;
    }
    quickEntryInput.setCustomValidity("");
    cancelEditing(false);
    dom.amount.value = parsed.amount;
    dom.note.value = parsed.words;
    dom.categoryPicker
      .querySelector<HTMLButtonElement>(`[data-category="${parsed.category}"]`)
      ?.click();
    dom.date.value = parsed.date;
    dom.form.requestSubmit();
    quickEntryInput.value = "";
    renderQuickEntryPreview(null);
  };
  quickEntrySubmit.addEventListener("click", addQuickEntry);
  quickEntryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addQuickEntry();
    }
  });
  quickEntryInput.addEventListener("input", () => {
    quickEntryInput.setCustomValidity("");
    const parsed = parseQuickEntry(quickEntryInput.value.trim());
    const amountCents = parsed === null ? null : eurosToCents(parsed.amount);
    renderQuickEntryPreview(
      parsed === null || amountCents === null
        ? null
        : { amountCents, category: parsed.category, date: parsed.date },
    );
  });
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

  button.closest("details")?.removeAttribute("open");
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

document.getElementById("income-entry-list")?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  const id = button?.dataset["id"];
  if (!button || !id) return;
  const current = state.getState();
  const entry = (current.data.incomeEntries ?? []).find((item) => item.id === id);
  if (!entry && id === `legacy-income:${current.ui.selectedMonth}`) {
    const month = current.ui.selectedMonth;
    const legacyIncome = current.data.income.byMonth[month];
    if (legacyIncome === undefined) return;
    if (button.dataset["action"] === "income-delete") {
      if (window.confirm("¿Eliminar el ingreso mensual guardado este mes?")) {
        void state.clearIncome(month).then((result) => {
          if (!result.ok) window.alert(result.error);
        });
      }
      return;
    }
    if (button.dataset["action"] === "income-edit") {
      const amount = window.prompt(
        "Importe del ingreso mensual",
        (legacyIncome / 100).toFixed(2).replace(".", ","),
      );
      if (amount === null) return;
      const amountCents = eurosToCents(amount);
      if (amountCents === null) {
        window.alert("Introduce un importe válido.");
        return;
      }
      void state.setIncome(month, amountCents).then((result) => {
        if (!result.ok) window.alert(result.error);
      });
    }
    return;
  }
  if (!entry) return;
  if (button.dataset["action"] === "income-delete") {
    if (window.confirm(`¿Eliminar el ingreso «${entry.title}»?`)) {
      const deletion = entry.legacySourceMonth
        ? state.clearIncome(entry.legacySourceMonth)
        : state.deleteIncomeEntry(id);
      void deletion.then((result) => {
        if (!result.ok) window.alert(result.error);
      });
    }
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

const recurringAddToggle = document.getElementById("recurring-add-toggle");
const recurringForm = form("recurring-form");
if (recurringAddToggle instanceof HTMLButtonElement && recurringForm) {
  recurringAddToggle.addEventListener("click", () => {
    const opening = recurringForm.hidden;
    recurringForm.hidden = !opening;
    recurringAddToggle.setAttribute("aria-expanded", String(opening));
    if (opening) input("recurring-name")?.focus();
  });
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

recurringForm?.addEventListener("submit", (event) => {
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
    else {
      recurringForm.reset();
      recurringForm.hidden = true;
      recurringAddToggle?.setAttribute("aria-expanded", "false");
    }
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
    const card = button.closest<HTMLElement>(".recurring-card");
    const view = card?.querySelector<HTMLElement>(".recurring-card__view");
    const editForm = card?.querySelector<HTMLElement>(".recurring-edit-form");
    const name = editForm?.querySelector<HTMLInputElement>(
      '[data-recurring-field="name"]',
    );
    if (!view || !editForm) return;
    view.hidden = true;
    editForm.hidden = false;
    card?.querySelector(".recurring-menu[open]")?.removeAttribute("open");
    name?.focus();
    return;
  }
  if (action === "recurring-cancel") {
    const card = button.closest<HTMLElement>(".recurring-card");
    const view = card?.querySelector<HTMLElement>(".recurring-card__view");
    const editForm = card?.querySelector<HTMLElement>(".recurring-edit-form");
    if (view && editForm) {
      editForm.hidden = true;
      view.hidden = false;
      card?.querySelector<HTMLButtonElement>('[data-action="recurring-edit"]')?.focus();
    }
    return;
  }
  if (action === "recurring-save") {
    const card = button.closest<HTMLElement>(".recurring-card");
    const editForm = card?.querySelector<HTMLElement>(".recurring-edit-form");
    const name = editForm?.querySelector<HTMLInputElement>(
      '[data-recurring-field="name"]',
    );
    const amount = editForm?.querySelector<HTMLInputElement>(
      '[data-recurring-field="amount"]',
    );
    const day = editForm?.querySelector<HTMLInputElement>('[data-recurring-field="day"]');
    const category = editForm?.querySelector<HTMLSelectElement>(
      '[data-recurring-field="category"]',
    );
    const error = editForm?.querySelector<HTMLParagraphElement>("[data-recurring-error]");
    if (!editForm || !name || !amount || !day || !category || !error) return;
    const amountCents = eurosToCents(amount.value);
    const dayOfMonth = Number(day.value);
    if (
      !name.value.trim() ||
      amountCents === null ||
      !Number.isInteger(dayOfMonth) ||
      dayOfMonth < 1 ||
      dayOfMonth > 28 ||
      !CATEGORY_KEYS.includes(category.value as (typeof CATEGORY_KEYS)[number])
    ) {
      error.textContent = "Revisa el título, el importe, la categoría y el día (1–28).";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const result = await state.updateRecurringExpense(id, {
      name: name.value,
      amountCents,
      category: category.value as (typeof CATEGORY_KEYS)[number],
      dayOfMonth,
    });
    if (!result.ok) {
      error.textContent = result.error;
      error.hidden = false;
    }
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

for (const [id, delta] of [
  ["month-prev", -1],
  ["month-next", 1],
] as const) {
  document.getElementById(id)?.addEventListener("click", () => {
    const next = shiftMonth(state.getState().ui.selectedMonth, delta);
    if (!state.setSelectedMonth(next)) render(state.getState());
  });
}

// Menús «⋯» de las filas: solo uno abierto; se cierran al pulsar fuera o con Escape.
document.addEventListener(
  "toggle",
  (event) => {
    const menu = event.target;
    if (!(menu instanceof HTMLDetailsElement) || !menu.open || !menu.matches(".row-menu"))
      return;
    document.querySelectorAll<HTMLDetailsElement>(".row-menu[open]").forEach((other) => {
      if (other !== menu) other.open = false;
    });
  },
  true,
);
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Node)) return;
  document.querySelectorAll<HTMLDetailsElement>(".row-menu[open]").forEach((menu) => {
    if (!menu.contains(target)) menu.open = false;
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const open = document.querySelector<HTMLDetailsElement>(".row-menu[open]");
  if (!open) return;
  open.open = false;
  open.querySelector("summary")?.focus();
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

// ---------- PWA: versión sin conexión, actualizaciones e instalación ----------

// El service worker guarda la app para abrirla sin conexión (en desarrollo no hace
// nada). Una versión nueva no se activa sola: se avisa para no perder un formulario
// a medio rellenar.
const updateBar = document.getElementById("update-bar");
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (updateBar) updateBar.hidden = false;
  },
  onOfflineReady() {
    showToast("Tarro ya funciona sin conexión.");
  },
  onRegisteredSW(_url, registration) {
    // Si la app queda abierta mucho tiempo, comprueba de vez en cuando si hay versión nueva.
    if (registration)
      window.setInterval(() => {
        if (navigator.onLine) void registration.update();
      }, UPDATE_CHECK_MS);
  },
});
document.getElementById("update-apply")?.addEventListener("click", () => {
  void updateServiceWorker(true);
});
document.getElementById("update-dismiss")?.addEventListener("click", () => {
  if (updateBar) updateBar.hidden = true;
});

/** Evento de instalación de Chrome y Android (no está en los tipos del DOM). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const installCard = document.getElementById("install-card");
const installButton = document.getElementById("install-app");
const installHint = document.getElementById("install-hint");
const isStandalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  ("standalone" in navigator && navigator.standalone === true);
const isIos =
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
let installPrompt: BeforeInstallPromptEvent | null = null;

// Safari en iPhone no tiene aviso de instalación: se explica cómo hacerlo a mano.
if (installCard && installHint && isIos && !isStandalone()) {
  installHint.textContent =
    "En Safari, pulsa Compartir y después «Añadir a pantalla de inicio».";
  installCard.hidden = false;
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as BeforeInstallPromptEvent;
  if (installCard && installButton && !isStandalone()) {
    installCard.hidden = false;
    installButton.hidden = false;
  }
});
installButton?.addEventListener("click", () => {
  const prompt = installPrompt;
  if (!prompt) return;
  installPrompt = null;
  void prompt.prompt().then(() =>
    prompt.userChoice.then(({ outcome }) => {
      if (outcome === "accepted" && installCard) installCard.hidden = true;
    }),
  );
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  if (installCard) installCard.hidden = true;
  showToast("Tarro se ha instalado.");
});
