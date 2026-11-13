import {
  FALLBACK_CATEGORY,
  createCategory,
  getCategories,
  planCategoryDeletion,
} from "./categories";
import { isCategoryKey } from "./config";
import { createLegacyIncomeMigration } from "./calc";
import * as repository from "./firebase/repository";
import {
  getCurrentMonthKey,
  getMonthKey,
  getTodayIso,
  isValidIsoDate,
  isValidMonthKey,
} from "./format";
import { createEmptyData } from "./storage";
import type {
  AppData,
  AppState,
  CategoryFilter,
  CategoryKey,
  Expense,
  MonthKey,
  NewExpense,
  Result,
  RecurringExpense,
  SavingsGoal,
  Wallet,
  WalletKind,
  WalletTransfer,
  SyncState,
  IncomeEntry,
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
  let financeReady = false;

  publish({
    ...state,
    data: createEmptyData(),
    sync: { ...state.sync, status: "loading", error: null },
  });

  const markReady = (): void => {
    if (expensesReady && incomesReady && financeReady)
      setSync({ status: "ready", error: null });
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

  const stopFinance = repository.watchFinanceSettings(
    userId,
    (settings) => {
      if (generation !== syncGeneration) return;
      financeReady = true;
      publish({ ...state, data: { ...state.data, ...settings } });
      markReady();
    },
    fail,
  );

  stopWatching = () => {
    stopExpenses();
    stopIncomes();
    stopFinance();
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

/** Una categoría solo se puede usar si está en la lista de la persona. */
function isAvailableCategory(category: CategoryKey): boolean {
  return getCategories(state.data).some((item) => item.id === category);
}

const MISSING_CATEGORY_ERROR = "Esa categoría ya no existe. Elige otra.";

export async function addExpense(input: NewExpense): Promise<Result<Expense>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;

  const checked = validateExpenseInput(input);
  if (!checked.ok) return checked;
  if (!isAvailableCategory(checked.value.category))
    return { ok: false, error: MISSING_CATEGORY_ERROR };
  if (
    input.walletId &&
    !(state.data.wallets ?? []).some((wallet) => wallet.id === input.walletId)
  )
    return { ok: false, error: "La cartera seleccionada ya no existe." };

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
  // Se puede conservar la categoría que ya tenía; cambiarla exige una de la lista.
  if (
    checked.value.category !== existing.category &&
    !isAvailableCategory(checked.value.category)
  )
    return { ok: false, error: MISSING_CATEGORY_ERROR };
  if (
    input.walletId &&
    !(state.data.wallets ?? []).some((wallet) => wallet.id === input.walletId)
  )
    return { ok: false, error: "La cartera seleccionada ya no existe." };

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
  if (!saved.ok) return saved;
  if ((state.data.migratedIncomeMonths ?? []).includes(month)) {
    const entryId = `legacy-income:${month}`;
    const incomeEntries = (state.data.incomeEntries ?? []).map((entry) =>
      entry.id === entryId
        ? { ...entry, amountCents: cents, updatedAt: Date.now() }
        : entry,
    );
    const settingsSaved = await saveFinancialSettings({ incomeEntries });
    if (!settingsSaved.ok) return settingsSaved;
  }
  return checked;
}

export async function clearIncome(month: MonthKey): Promise<Result<null>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;
  const deleted = await repository.deleteMonthlyIncome(writable.value, month);
  if (!deleted.ok) return deleted;
  if ((state.data.migratedIncomeMonths ?? []).includes(month)) {
    return saveFinancialSettings({
      incomeEntries: (state.data.incomeEntries ?? []).filter(
        (entry) => entry.id !== `legacy-income:${month}`,
      ),
      migratedIncomeMonths: (state.data.migratedIncomeMonths ?? []).filter(
        (item) => item !== month,
      ),
    });
  }
  return deleted;
}

export async function addIncomeEntry(
  input: Omit<IncomeEntry, "id" | "createdAt" | "updatedAt">,
): Promise<Result<IncomeEntry>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;
  const title = input.title.trim();
  if (
    !title ||
    title.length > 80 ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    !isValidIsoDate(input.date)
  )
    return { ok: false, error: "Revisa el título, el importe y la fecha del ingreso." };
  const now = Date.now();
  const entry: IncomeEntry = {
    ...input,
    title,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const saved = await saveFinancialSettings({
    incomeEntries: [...(state.data.incomeEntries ?? []), entry],
  });
  return saved.ok ? { ok: true, value: entry } : saved;
}

export async function updateIncomeEntry(
  id: string,
  patch: Pick<IncomeEntry, "title" | "amountCents" | "date">,
): Promise<Result<null>> {
  if (!(state.data.incomeEntries ?? []).some((entry) => entry.id === id))
    return { ok: false, error: "No encontramos ese ingreso." };
  const title = patch.title.trim();
  if (
    !title ||
    title.length > 80 ||
    !Number.isSafeInteger(patch.amountCents) ||
    patch.amountCents <= 0 ||
    !isValidIsoDate(patch.date)
  )
    return { ok: false, error: "Revisa el título, el importe y la fecha del ingreso." };
  return saveFinancialSettings({
    incomeEntries: (state.data.incomeEntries ?? []).map((entry) =>
      entry.id === id ? { ...entry, ...patch, title, updatedAt: Date.now() } : entry,
    ),
  });
}

export function deleteIncomeEntry(id: string): Promise<Result<null>> {
  const entry = (state.data.incomeEntries ?? []).find((item) => item.id === id);
  const migratedIncomeMonths = entry?.legacySourceMonth
    ? (state.data.migratedIncomeMonths ?? []).filter(
        (month) => month !== entry.legacySourceMonth,
      )
    : state.data.migratedIncomeMonths;
  return saveFinancialSettings({
    incomeEntries: (state.data.incomeEntries ?? []).filter((item) => item.id !== id),
    ...(migratedIncomeMonths === undefined ? {} : { migratedIncomeMonths }),
  });
}

/** Copia el sueldo legado como ingreso titulado una sola vez y conserva income.byMonth. */
export async function migrateLegacyIncome(month: MonthKey): Promise<Result<null>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;
  if (!isValidMonthKey(month)) return { ok: false, error: "El mes no es válido." };
  const migration = createLegacyIncomeMigration(state.data, month, Date.now());
  if (migration === null) {
    return state.data.income.byMonth[month] === undefined
      ? { ok: false, error: "Este mes no tiene un sueldo antiguo para migrar." }
      : { ok: true, value: null };
  }
  return saveFinancialSettings(migration);
}

async function saveFinancialSettings(
  patch: Partial<
    Pick<
      AppData,
      | "budgets"
      | "goals"
      | "recurring"
      | "wallets"
      | "transfers"
      | "incomeEntries"
      | "migratedIncomeMonths"
      | "categories"
    >
  >,
): Promise<Result<null>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;
  const settings: Pick<
    AppData,
    | "budgets"
    | "goals"
    | "recurring"
    | "wallets"
    | "transfers"
    | "incomeEntries"
    | "migratedIncomeMonths"
    | "categories"
  > = {
    budgets: patch.budgets ?? state.data.budgets ?? {},
    goals: patch.goals ?? state.data.goals ?? [],
    recurring: patch.recurring ?? state.data.recurring ?? [],
    wallets: patch.wallets ?? state.data.wallets ?? [],
    transfers: patch.transfers ?? state.data.transfers ?? [],
    incomeEntries: patch.incomeEntries ?? state.data.incomeEntries ?? [],
    migratedIncomeMonths:
      patch.migratedIncomeMonths ?? state.data.migratedIncomeMonths ?? [],
    categories: patch.categories ?? state.data.categories,
  };
  const saved = await repository.saveFinanceSettings(writable.value, settings);
  if (saved.ok) publish({ ...state, data: { ...state.data, ...settings } });
  return saved;
}

export function setMonthlyBudget(month: MonthKey, cents: number): Promise<Result<null>> {
  if (!isValidMonthKey(month) || !Number.isSafeInteger(cents) || cents <= 0) {
    return Promise.resolve({
      ok: false,
      error: "Introduce un presupuesto mensual válido.",
    });
  }
  return saveFinancialSettings({
    budgets: { ...(state.data.budgets ?? {}), [month]: cents },
  });
}

export function clearMonthlyBudget(month: MonthKey): Promise<Result<null>> {
  const budgets = { ...(state.data.budgets ?? {}) };
  delete budgets[month];
  return saveFinancialSettings({ budgets });
}

export function addSavingsGoal(
  input: Omit<SavingsGoal, "id" | "savedCents" | "createdAt">,
): Promise<Result<null>> {
  const goal: SavingsGoal = {
    ...input,
    id: crypto.randomUUID(),
    savedCents: 0,
    createdAt: Date.now(),
  };
  if (
    !goal.name.trim() ||
    goal.name.length > 60 ||
    !Number.isSafeInteger(goal.targetCents) ||
    goal.targetCents <= 0 ||
    (goal.dueDate !== null && !isValidIsoDate(goal.dueDate))
  ) {
    return Promise.resolve({
      ok: false,
      error: "Revisa el nombre, el importe y la fecha de la meta.",
    });
  }
  return saveFinancialSettings({ goals: [...(state.data.goals ?? []), goal] });
}

export function contributeToGoal(id: string, cents: number): Promise<Result<null>> {
  if (!Number.isSafeInteger(cents) || cents <= 0)
    return Promise.resolve({ ok: false, error: "Introduce un importe válido." });
  const now = Date.now();
  const goals = (state.data.goals ?? []).map((goal) =>
    goal.id === id
      ? {
          ...goal,
          savedCents: goal.savedCents + cents,
          contributions: [
            ...(goal.contributions ?? []),
            {
              id: crypto.randomUUID(),
              amountCents: cents,
              date: getTodayIso(),
              createdAt: now,
            },
          ],
        }
      : goal,
  );
  if (!goals.some((goal) => goal.id === id))
    return Promise.resolve({ ok: false, error: "No encontramos esa meta." });
  return saveFinancialSettings({ goals });
}

export function deleteSavingsGoal(id: string): Promise<Result<null>> {
  return saveFinancialSettings({
    goals: (state.data.goals ?? []).filter((goal) => goal.id !== id),
  });
}

export function addRecurringExpense(
  input: Omit<RecurringExpense, "id" | "active" | "lastRunMonth">,
): Promise<Result<null>> {
  if (!isAvailableCategory(input.category))
    return Promise.resolve({ ok: false, error: MISSING_CATEGORY_ERROR });
  const recurring: RecurringExpense = {
    ...input,
    id: crypto.randomUUID(),
    active: true,
    lastRunMonth: null,
  };
  return saveFinancialSettings({
    recurring: [...(state.data.recurring ?? []), recurring],
  });
}

export function updateRecurringExpense(
  id: string,
  patch: Partial<
    Pick<RecurringExpense, "active" | "name" | "amountCents" | "category" | "dayOfMonth">
  >,
): Promise<Result<null>> {
  if (patch.name !== undefined && (!patch.name.trim() || patch.name.trim().length > 60))
    return Promise.resolve({ ok: false, error: "El título no es válido." });
  if (
    patch.amountCents !== undefined &&
    (!Number.isSafeInteger(patch.amountCents) || patch.amountCents <= 0)
  )
    return Promise.resolve({ ok: false, error: "El importe no es válido." });
  if (patch.category !== undefined && !isCategoryKey(patch.category))
    return Promise.resolve({ ok: false, error: "La categoría no es válida." });
  const current = (state.data.recurring ?? []).find((item) => item.id === id);
  if (
    patch.category !== undefined &&
    patch.category !== current?.category &&
    !isAvailableCategory(patch.category)
  )
    return Promise.resolve({ ok: false, error: MISSING_CATEGORY_ERROR });
  if (
    patch.dayOfMonth !== undefined &&
    (!Number.isInteger(patch.dayOfMonth) || patch.dayOfMonth < 1 || patch.dayOfMonth > 28)
  )
    return Promise.resolve({ ok: false, error: "El día debe estar entre 1 y 28." });
  const recurring = (state.data.recurring ?? []).map((item) =>
    item.id === id
      ? {
          ...item,
          ...patch,
          ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        }
      : item,
  );
  return saveFinancialSettings({ recurring });
}

export function deleteRecurringExpense(id: string): Promise<Result<null>> {
  return saveFinancialSettings({
    recurring: (state.data.recurring ?? []).filter((item) => item.id !== id),
  });
}

// ---------- Categorías ----------

/** Añade una categoría con icono y color automáticos. */
export function addCategory(name: string): Promise<Result<null>> {
  const created = createCategory(
    name,
    getCategories(state.data),
    `cat-${crypto.randomUUID()}`,
    Date.now(),
  );
  if (!created.ok) return Promise.resolve(created);
  return saveFinancialSettings({
    categories: [...getCategories(state.data), created.value],
  });
}

/**
 * Borra una categoría. Sus movimientos y gastos fijos pasan a «Otros»: primero se
 * mueven los movimientos y después se guarda la lista. Si algo falla a medias,
 * repetir el borrado termina el trabajo sin duplicar nada.
 */
export async function deleteCategory(
  id: CategoryKey,
): Promise<Result<{ movedExpenses: number; movedRecurring: number }>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;
  const plan = planCategoryDeletion(state.data, id);
  if (!plan.ok) return plan;
  const { categories, expenseIds, recurring, movedRecurring } = plan.value;
  if (expenseIds.length > 0) {
    const moved = await repository.moveExpensesToCategory(
      writable.value,
      expenseIds,
      FALLBACK_CATEGORY,
    );
    if (!moved.ok) return moved;
  }
  const saved = await saveFinancialSettings({ categories, recurring });
  if (!saved.ok) return saved;
  if (state.ui.categoryFilter === id)
    publish({ ...state, ui: { ...state.ui, categoryFilter: "all" } });
  return { ok: true, value: { movedExpenses: expenseIds.length, movedRecurring } };
}

export function createWallet(input: {
  name: string;
  kind: WalletKind;
  openingCents: number;
}): Promise<Result<null>> {
  const name = input.name.trim();
  if (
    !name ||
    name.length > 60 ||
    !Number.isSafeInteger(input.openingCents) ||
    input.openingCents < 0
  )
    return Promise.resolve({
      ok: false,
      error: "Revisa el nombre y el saldo inicial de la cartera.",
    });
  const wallet: Wallet = {
    id: crypto.randomUUID(),
    ...input,
    name,
    createdAt: Date.now(),
  };
  return saveFinancialSettings({ wallets: [...(state.data.wallets ?? []), wallet] });
}

export function getWalletBalance(walletId: string): number {
  const wallet = (state.data.wallets ?? []).find((item) => item.id === walletId);
  if (!wallet) return 0;
  const spent = state.data.expenses
    .filter((item) => item.walletId === walletId)
    .reduce((sum, item) => sum + item.amountCents, 0);
  const transferredOut = (state.data.transfers ?? [])
    .filter((item) => item.fromWalletId === walletId)
    .reduce((sum, item) => sum + item.amountCents, 0);
  const transferredIn = (state.data.transfers ?? [])
    .filter((item) => item.toWalletId === walletId)
    .reduce((sum, item) => sum + item.amountCents, 0);
  return wallet.openingCents - spent - transferredOut + transferredIn;
}

export function deleteWallet(id: string): Promise<Result<null>> {
  if (
    state.data.expenses.some((item) => item.walletId === id) ||
    (state.data.transfers ?? []).some(
      (item) => item.fromWalletId === id || item.toWalletId === id,
    )
  ) {
    return Promise.resolve({
      ok: false,
      error:
        "Esta cartera tiene movimientos. Conserva su historial o elimina primero esos movimientos.",
    });
  }
  return saveFinancialSettings({
    wallets: (state.data.wallets ?? []).filter((wallet) => wallet.id !== id),
  });
}

export function transferBetweenWallets(
  input: Omit<WalletTransfer, "id" | "createdAt">,
): Promise<Result<null>> {
  if (
    input.fromWalletId === input.toWalletId ||
    !(state.data.wallets ?? []).some((wallet) => wallet.id === input.fromWalletId) ||
    !(state.data.wallets ?? []).some((wallet) => wallet.id === input.toWalletId) ||
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    !isValidIsoDate(input.date)
  )
    return Promise.resolve({
      ok: false,
      error: "Revisa las carteras, la fecha y el importe del traspaso.",
    });
  if (getWalletBalance(input.fromWalletId) < input.amountCents)
    return Promise.resolve({
      ok: false,
      error: "La cartera de origen no tiene saldo suficiente.",
    });
  const transfer: WalletTransfer = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  return saveFinancialSettings({
    transfers: [...(state.data.transfers ?? []), transfer],
  });
}

export async function registerRecurringExpense(id: string): Promise<Result<null>> {
  const writable = requireWritable();
  if (!writable.ok) return writable;
  const template = (state.data.recurring ?? []).find((item) => item.id === id);
  if (template === undefined || !template.active)
    return { ok: false, error: "Este gasto fijo no está activo." };
  const month = state.ui.selectedMonth;
  const deterministicId = `recurring-${template.id}-${month}`;
  const alreadyExists = state.data.expenses.some(
    (item) =>
      item.id === deterministicId ||
      (item.recurringId === template.id && item.recurringMonth === month),
  );
  if (alreadyExists) {
    const recurring = (state.data.recurring ?? []).map((item) =>
      item.id === id ? { ...item, lastRunMonth: month } : item,
    );
    return saveFinancialSettings({ recurring });
  }
  if (template.lastRunMonth === month)
    return { ok: false, error: "Este gasto ya está registrado este mes." };
  const existing = state.data.expenses.find(
    (item) =>
      item.date.startsWith(`${month}-`) && item.note === `Pago fijo: ${template.name}`,
  );
  if (existing === undefined) {
    const date = `${month}-${String(template.dayOfMonth).padStart(2, "0")}`;
    const now = Date.now();
    const expense: Expense = {
      amountCents: template.amountCents,
      category: template.category,
      date,
      note: `Pago fijo: ${template.name}`,
      ...(state.data.wallets?.[0] ? { walletId: state.data.wallets[0].id } : {}),
      id: deterministicId,
      recurringId: template.id,
      recurringMonth: month,
      createdAt: now,
      updatedAt: now,
    };
    const created = await repository.createExpense(writable.value, expense);
    if (!created.ok) return created;
  }
  const recurring = (state.data.recurring ?? []).map((item) =>
    item.id === id ? { ...item, lastRunMonth: month } : item,
  );
  return saveFinancialSettings({ recurring });
}

export function registerDueRecurringExpenses(today = getTodayIso()): void {
  const month = getMonthKey(today);
  if (
    month !== state.ui.selectedMonth ||
    state.sync.status !== "ready" ||
    !state.sync.online ||
    currentUserId === null
  )
    return;
  const day = Number(today.slice(8, 10));
  for (const item of state.data.recurring ?? []) {
    if (item.active && item.dayOfMonth <= day && item.lastRunMonth !== month) {
      void registerRecurringExpense(item.id).then((result) => {
        if (!result.ok)
          console.warn(
            `No se pudo registrar el gasto fijo ${item.name}: ${result.error}`,
          );
      });
    }
  }
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
