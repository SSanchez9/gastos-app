import { isCategoryKey } from "./config";
import * as repository from "./firebase/repository";
import { getCurrentMonthKey, isValidMonthKey } from "./format";
import { createEmptyData } from "./storage";
import type {
  AppData,
  AppState,
  CategoryFilter,
  Expense,
  MonthKey,
  NewExpense,
  Result,
  SyncState,
} from "./types";
import { validateAmount, validateExpenseInput } from "./validate";

type Listener = (state: AppState) => void;

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

let state: AppState = {
  data: createEmptyData(),
  ui: { selectedMonth: getCurrentMonthKey(), categoryFilter: "all" },
  sync: { status: "signed-out", online: isOnline(), error: null },
};

const listeners = new Set<Listener>();
let currentUserId: string | null = null;
let stopWatching: (() => void) | null = null;
/** Se incrementa en cada arranque o parada para ignorar avisos de escuchas antiguas. */
let syncGeneration = 0;

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

function setSync(patch: Partial<SyncState>): void {
  publish({ ...state, sync: { ...state.sync, ...patch } });
}

// ---------- Sincronización con Firestore ----------

/** Empieza a escuchar los datos del usuario. Se llama al iniciar sesión. */
export function startSync(userId: string): void {
  if (currentUserId === userId && state.sync.status !== "error") return;

  stopWatching?.();
  currentUserId = userId;
  syncGeneration += 1;
  const generation = syncGeneration;

  let expensesReady = false;
  let incomesReady = false;

  publish({
    ...state,
    data: createEmptyData(),
    sync: { ...state.sync, status: "loading", error: null },
  });

  const markReady = (): void => {
    if (expensesReady && incomesReady) setSync({ status: "ready", error: null });
  };

  const fail = (message: string): void => {
    if (generation !== syncGeneration) return;
    setSync({ status: "error", error: message });
  };

  const stopExpenses = repository.watchExpenses(
    userId,
    (expenses) => {
      if (generation !== syncGeneration) return;
      expensesReady = true;
      publish({ ...state, data: { ...state.data, expenses } });
      markReady();
    },
    fail,
  );

  const stopIncomes = repository.watchMonthlyIncomes(
    userId,
    (income) => {
      if (generation !== syncGeneration) return;
      incomesReady = true;
      publish({ ...state, data: { ...state.data, income } });
      markReady();
    },
    fail,
  );

  stopWatching = () => {
    stopExpenses();
    stopIncomes();
  };
}

/** Deja de escuchar y borra los datos de memoria. Se llama al cerrar sesión. */
export function stopSync(): void {
  syncGeneration += 1;
  stopWatching?.();
  stopWatching = null;
  currentUserId = null;
  publish({
    ...state,
    data: createEmptyData(),
    sync: { status: "signed-out", online: isOnline(), error: null },
  });
}

/** Vuelve a intentar la carga tras un error. */
export function retrySync(): void {
  const userId = currentUserId;
  if (userId === null) return;
  currentUserId = null;
  startSync(userId);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => setSync({ online: true }));
  window.addEventListener("offline", () => setSync({ online: false }));
}

/** Solo se escribe con sesión, datos cargados y conexión: evita pisar datos sin ver. */
function requireWritable(): Result<string> {
  if (currentUserId === null) {
    return { ok: false, error: "Inicia sesión para guardar cambios." };
  }
  if (state.sync.status !== "ready") {
    return {
      ok: false,
      error: "Tus datos todavía no se han cargado. Espera un momento.",
    };
  }
  if (!state.sync.online) {
    return { ok: false, error: "Sin conexión: no se pueden guardar cambios." };
  }
  return { ok: true, value: currentUserId };
}

// ---------- Gastos ----------

export async function addExpense(input: NewExpense): Promise<Result<Expense>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;

  const checked = validateExpenseInput(input);
  if (!checked.ok) return checked;

  const now = Date.now();
  const expense: Expense = {
    ...checked.value,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  const saved = await repository.createExpense(writable.value, expense);
  return saved.ok ? { ok: true, value: expense } : saved;
}

export async function updateExpense(
  id: string,
  input: NewExpense,
): Promise<Result<Expense>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;

  const existing = state.data.expenses.find((expense) => expense.id === id);
  if (existing === undefined) return { ok: false, error: "El gasto no existe." };

  const checked = validateExpenseInput(input);
  if (!checked.ok) return checked;

  const updated: Expense = { ...existing, ...checked.value, updatedAt: Date.now() };
  const saved = await repository.updateExpense(writable.value, updated);
  return saved.ok ? { ok: true, value: updated } : saved;
}

export async function deleteExpense(id: string): Promise<Result<null>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;

  if (!state.data.expenses.some((expense) => expense.id === id)) {
    return { ok: false, error: "El gasto no existe." };
  }
  return repository.deleteExpense(writable.value, id);
}

// ---------- Sueldo (uno por mes, sin valor por defecto) ----------

export async function setIncome(month: MonthKey, cents: number): Promise<Result<number>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;

  if (!isValidMonthKey(month)) return { ok: false, error: "El mes no es válido." };
  const checked = validateAmount(cents);
  if (!checked.ok) return checked;

  const saved = await repository.saveMonthlyIncome(writable.value, month, cents);
  return saved.ok ? checked : saved;
}

export async function clearIncome(month: MonthKey): Promise<Result<null>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;
  return repository.deleteMonthlyIncome(writable.value, month);
}

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

/** Deja la nube igual que `next`. El documento debe venir ya validado con parseAppData. */
export async function replaceAllData(next: AppData): Promise<Result<null>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;
  return repository.replaceAppData(writable.value, state.data, next);
}
