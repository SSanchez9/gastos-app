import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import { initAuthUi } from "./auth-ui";
import { initBackup } from "./backup";
import { getPreviousIncome } from "./calc";
import { renderChart } from "./charts";
import { isCategoryFilter } from "./config";
import { getMonthKey, getTodayIso } from "./format";
import { subscribeSession } from "./session";
import * as state from "./state";
import { initSyncUi } from "./sync-ui";
import type { AppState } from "./types";
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
}

let editingId: string | null = null;

function cancelEditing(): void {
  editingId = null;
  setEditMode(false);
  resetForm({ keepContext: false });
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

dom.cancel.addEventListener("click", cancelEditing);

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
state.subscribe(render);
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
