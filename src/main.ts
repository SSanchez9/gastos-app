import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import { isCategoryFilter } from "./config";
import { getMonthKey, getTodayIso } from "./format";
import * as state from "./state";
import {
  dom,
  fillForm,
  initCategorySelects,
  readExpenseForm,
  renderApp,
  resetForm,
  setEditMode,
  showFormError,
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

let editingId: string | null = null;

function cancelEditing(): void {
  editingId = null;
  setEditMode(false);
  resetForm({ keepContext: false });
}

// ---------- Formulario de gastos ----------

dom.form.addEventListener("submit", (event) => {
  event.preventDefault();

  const input = readExpenseForm();
  if (!input.ok) {
    showFormError(input.error);
    return;
  }

  const wasEditing = editingId !== null;
  const result =
    editingId === null
      ? state.addExpense(input.value)
      : state.updateExpense(editingId, input.value);
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

  if (wasEditing) {
    cancelEditing();
  } else {
    resetForm({ keepContext: true });
  }
});

dom.cancel.addEventListener("click", cancelEditing);

// ---------- Acciones de la lista (editar y eliminar) ----------

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
      state.deleteExpense(id);
      if (editingId === id) cancelEditing();
    }
  }
});

// ---------- Mes y filtro ----------

dom.monthSelect.addEventListener("change", () => {
  if (!state.setSelectedMonth(dom.monthSelect.value)) renderApp(state.getState());
});

dom.filterCategory.addEventListener("change", () => {
  const value = dom.filterCategory.value;
  if (!isCategoryFilter(value) || !state.setCategoryFilter(value)) {
    renderApp(state.getState());
  }
});

// ---------- Arranque ----------

// Provisional (fase 5): el formulario del sueldo todavía no hace nada.
document.getElementById("income-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
});

initCategorySelects();
dom.date.value = getTodayIso();
state.subscribe(renderApp);
renderApp(state.getState());
