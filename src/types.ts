export type CategoryKey =
  | "personal"
  | "social"
  | "supermercado"
  | "casa"
  | "alquiler"
  | "gasolina"
  | "coche"
  | "otros";

export type CategoryFilter = CategoryKey | "all";

/** Mes en formato "YYYY-MM". */
export type MonthKey = string;

/** Fecha en formato "YYYY-MM-DD". */
export type IsoDate = string;

export interface Expense {
  id: string;
  /** Importe en céntimos (entero positivo). */
  amountCents: number;
  category: CategoryKey;
  date: IsoDate;
  note: string;
  walletId?: string;
  recurringId?: string;
  recurringMonth?: MonthKey;
  createdAt: number;
  updatedAt: number;
}

/** Datos que aporta el usuario al crear o editar un gasto. */
export type NewExpense = Omit<Expense, "id" | "createdAt" | "updatedAt">;

export interface Income {
  /** Sueldo variable: un valor por mes y nunca uno por defecto. */
  byMonth: Record<MonthKey, number>;
}

export interface IncomeEntry {
  id: string;
  title: string;
  amountCents: number;
  date: IsoDate;
  createdAt: number;
  updatedAt: number;
  /** Identifica una copia explícita del sueldo legado; el documento mensual se conserva. */
  legacySourceMonth?: MonthKey;
}

export interface GoalContribution {
  id: string;
  amountCents: number;
  date: IsoDate;
  createdAt: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  dueDate: IsoDate | null;
  createdAt: number;
  contributions?: GoalContribution[];
}

export interface RecurringExpense {
  id: string;
  name: string;
  amountCents: number;
  category: CategoryKey;
  dayOfMonth: number;
  active: boolean;
  lastRunMonth: MonthKey | null;
}

export type WalletKind = "bank" | "cash" | "card" | "savings" | "investment";
export interface Wallet {
  id: string;
  name: string;
  kind: WalletKind;
  openingCents: number;
  createdAt: number;
}
export interface WalletTransfer {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amountCents: number;
  date: IsoDate;
  note: string;
  createdAt: number;
}

/** Documento que se exporta a JSON y se importa. */
export interface AppData {
  version: 1;
  expenses: Expense[];
  income: Income;
  /** Límites de gasto por mes. */
  budgets?: Record<MonthKey, number>;
  goals?: SavingsGoal[];
  recurring?: RecurringExpense[];
  wallets?: Wallet[];
  transfers?: WalletTransfer[];
  incomeEntries?: IncomeEntry[];
  migratedIncomeMonths?: MonthKey[];
}

/** Ajustes de pantalla: no se guardan ni se exportan. */
export interface UiSettings {
  selectedMonth: MonthKey;
  categoryFilter: CategoryFilter;
}

export type SyncStatus = "signed-out" | "loading" | "ready" | "error";

export interface SyncState {
  status: SyncStatus;
  /** Según el navegador (navigator.onLine). */
  online: boolean;
  /** Mensaje del último error de carga; null si no hay. */
  error: string | null;
}

export interface AppState {
  data: AppData;
  ui: UiSettings;
  sync: SyncState;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Usuario con sesión iniciada (sin exponer los tipos de Firebase al resto de la app). */
export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}
