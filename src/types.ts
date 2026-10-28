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
  createdAt: number;
  updatedAt: number;
}

/** Datos que aporta el usuario al crear o editar un gasto. */
export type NewExpense = Omit<Expense, "id" | "createdAt" | "updatedAt">;

export interface Income {
  /** Sueldo variable: un valor por mes y nunca uno por defecto. */
  byMonth: Record<MonthKey, number>;
}

/** Documento que se guarda en localStorage y se exporta a JSON. */
export interface AppData {
  version: 1;
  expenses: Expense[];
  income: Income;
}

/** Ajustes de pantalla: no se guardan ni se exportan. */
export interface UiSettings {
  selectedMonth: MonthKey;
  categoryFilter: CategoryFilter;
}

export interface AppState {
  data: AppData;
  ui: UiSettings;
  /** true si el último intento de guardar en localStorage falló. */
  saveFailed: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Usuario con sesión iniciada (sin exponer los tipos de Firebase al resto de la app). */
export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}
