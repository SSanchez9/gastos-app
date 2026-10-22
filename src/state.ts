import { isCategoryKey } from "./config";
import { getCurrentMonthKey, isValidMonthKey } from "./format";
import { loadData, saveData } from "./storage";
import type {
  AppData,
  AppState,
  CategoryFilter,
  Expense,
  MonthKey,
  NewExpense,
  Result,
} from "./types";
import { validateAmount, validateExpenseInput } from "./validate";

type Listener = (state: AppState) => void;

let state: AppState = {
  data: loadData(),
  ui: { selectedMonth: getCurrentMonthKey(), categoryFilter: "all" },
  saveFailed: false,
};

const listeners = new Set<Listener>();

/** Estado actual. Solo lectura: para cambiarlo, usa las acciones de este archivo. */
export function getState(): AppState {
  return state;
}

/** Avisa en cada cambio. Devuelve una función para darse de baja. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: AppState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

function updateData(change: (data: AppData) => AppData): void {
  const data = change(state.data);
  publish({ ...state, data, saveFailed: !saveData(data) });
}

function withoutKey(record: Record<string, number>, key: string): Record<string, number> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

function validateMonthAmount(month: MonthKey, cents: number): Result<number> {
  if (!isValidMonthKey(month)) return { ok: false, error: "El mes no es válido." };
  return validateAmount(cents);
}

// ---------- Gastos ----------

export function addExpense(input: NewExpense): Result<Expense> {
  const checked = validateExpenseInput(input);
  if (!checked.ok) return checked;

  const now = Date.now();
  const expense: Expense = {
    ...checked.value,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  updateData((data) => ({ ...data, expenses: [...data.expenses, expense] }));
  return { ok: true, value: expense };
}

export function updateExpense(id: string, input: NewExpense): Result<Expense> {
  const existing = state.data.expenses.find((expense) => expense.id === id);
  if (existing === undefined) return { ok: false, error: "El gasto no existe." };

  const checked = validateExpenseInput(input);
  if (!checked.ok) return checked;

  const updated: Expense = { ...existing, ...checked.value, updatedAt: Date.now() };
  updateData((data) => ({
    ...data,
    expenses: data.expenses.map((expense) => (expense.id === id ? updated : expense)),
  }));
  return { ok: true, value: updated };
}

/** Devuelve false si no existía un gasto con ese id. */
export function deleteExpense(id: string): boolean {
  if (!state.data.expenses.some((expense) => expense.id === id)) return false;
  updateData((data) => ({
    ...data,
    expenses: data.expenses.filter((expense) => expense.id !== id),
  }));
  return true;
}

// ---------- Sueldo (uno por mes, sin valor por defecto) ----------

export function setIncome(month: MonthKey, cents: number): Result<number> {
  const checked = validateMonthAmount(month, cents);
  if (!checked.ok) return checked;
  updateData((data) => ({
    ...data,
    income: { byMonth: { ...data.income.byMonth, [month]: cents } },
  }));
  return checked;
}

export function clearIncome(month: MonthKey): void {
  updateData((data) => ({
    ...data,
    income: { byMonth: withoutKey(data.income.byMonth, month) },
  }));
}

// ---------- Presupuesto NO IMPLEMENTADO DE MOMENTO ----------

/** cents = null elimina el presupuesto por defecto. */
// export function setBudgetDefault(cents: number | null): Result<number | null> {
//   if (cents === null) {
//     updateData((data) => ({ ...data, budget: { ...data.budget, defaultCents: null } }));
//     return { ok: true, value: null };
//   }
//   const checked = validateAmount(cents);
//   if (!checked.ok) return checked;
//   updateData((data) => ({ ...data, budget: { ...data.budget, defaultCents: cents } }));
//   return checked;
// }

// export function setMonthBudget(month: MonthKey, cents: number): Result<number> {
//   const checked = validateMonthAmount(month, cents);
//   if (!checked.ok) return checked;
//   updateData((data) => ({
//     ...data,
//     budget: { ...data.budget, byMonth: { ...data.budget.byMonth, [month]: cents } },
//   }));
//   return checked;
// }

// export function clearMonthBudget(month: MonthKey): void {
//   updateData((data) => ({
//     ...data,
//     budget: { ...data.budget, byMonth: withoutKey(data.budget.byMonth, month) },
//   }));
// }

// ---------- Ajustes de pantalla (no se guardan) ----------

export function setSelectedMonth(month: MonthKey): boolean {
  if (!isValidMonthKey(month)) return false;
  publish({ ...state, ui: { ...state.ui, selectedMonth: month } });
  return true;
}

export function setCategoryFilter(filter: CategoryFilter): boolean {
  if (filter !== "all" && !isCategoryKey(filter)) return false;
  publish({ ...state, ui: { ...state.ui, categoryFilter: filter } });
  return true;
}

// ---------- Datos completos (importar copias de seguridad) ----------

/** Sustituye todos los datos. El documento debe venir ya validado con parseAppData. */
export function replaceAllData(data: AppData): void {
  updateData(() => data);
}
